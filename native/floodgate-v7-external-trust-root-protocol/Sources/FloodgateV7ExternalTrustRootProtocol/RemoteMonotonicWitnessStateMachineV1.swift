import Foundation

enum RemoteMonotonicWitnessErrorV1: Error, Equatable, Sendable {
    case invalidWitnessState
}

/// A provider-neutral reference for the single-checkpoint CAS semantics.
///
/// This type is not a network service or production persistence layer. It
/// exists so the exact server-side state transition and signed response can
/// be tested before a separately reviewed provider implementation exists.
final class RemoteMonotonicWitnessReferenceStateMachineV1:
    @unchecked Sendable
{
    static let receiptValiditySeconds: UInt64 = 30
    static let maximumAcceptedOperationCount = 4_096

    private enum AdvanceEvaluation {
        case rejected
        case acceptedRetry(AuthorityRollbackCheckpointV1)
        case commit(AuthorityRollbackCheckpointV1)

        var accepted: Bool {
            switch self {
            case .rejected:
                false
            case .acceptedRetry, .commit:
                true
            }
        }

        func responseCheckpoint(
            current: AuthorityRollbackCheckpointV1
        ) -> AuthorityRollbackCheckpointV1 {
            switch self {
            case .rejected:
                current
            case let .acceptedRetry(checkpoint),
                let .commit(checkpoint):
                checkpoint
            }
        }
    }

    private let lock = NSLock()
    private let witnessID: CanonicalBytes32
    private let endpointID: CanonicalBytes32
    private let witnessSignerKeyID: CanonicalBytes32
    private var currentCheckpoint: AuthorityRollbackCheckpointV1
    private var acceptedRequestSHA256ByOperationID:
        [CanonicalBytes32: CanonicalBytes32] = [:]

    init(
        witnessID: CanonicalBytes32,
        endpointID: CanonicalBytes32,
        witnessSignerKeyID: CanonicalBytes32,
        initialCheckpoint: AuthorityRollbackCheckpointV1
    ) throws {
        guard
            !witnessID.isAllZero,
            !endpointID.isAllZero,
            !witnessSignerKeyID.isAllZero,
            witnessID != endpointID,
            witnessID != witnessSignerKeyID,
            endpointID != witnessSignerKeyID,
            initialCheckpoint.journalSequence
                <= UInt64(Self.maximumAcceptedOperationCount)
        else {
            throw RemoteMonotonicWitnessErrorV1.invalidWitnessState
        }
        self.witnessID = witnessID
        self.endpointID = endpointID
        self.witnessSignerKeyID = witnessSignerKeyID
        currentCheckpoint = initialCheckpoint
    }

    func handle(
        _ request: RemoteMonotonicWitnessRequestV1,
        issuedAtUnixSeconds: UInt64,
        sign: TrustRootSignatureProviderV1
    ) throws -> RemoteMonotonicWitnessReceiptV1 {
        try lock.withLock {
            do {
                guard
                    request.witnessID == witnessID,
                    request.endpointID == endpointID
                else {
                    throw RemoteMonotonicWitnessErrorV1
                        .invalidWitnessState
                }

                let requestSHA256 = request.canonicalSHA256()
                let advanceEvaluation: AdvanceEvaluation?
                let accepted: Bool
                let responseCheckpoint:
                    AuthorityRollbackCheckpointV1
                switch request.operation {
                case .query:
                    advanceEvaluation = nil
                    accepted = true
                    responseCheckpoint = currentCheckpoint
                case .advance:
                    let evaluation = try evaluateAdvance(
                        request,
                        requestSHA256: requestSHA256
                    )
                    advanceEvaluation = evaluation
                    accepted = evaluation.accepted
                    responseCheckpoint =
                        evaluation.responseCheckpoint(
                            current: currentCheckpoint
                        )
                }

                let (expiresAtUnixSeconds, overflow) =
                    issuedAtUnixSeconds.addingReportingOverflow(
                        Self.receiptValiditySeconds
                    )
                guard !overflow else {
                    throw RemoteMonotonicWitnessErrorV1
                        .invalidWitnessState
                }
                let payload =
                    try RemoteMonotonicWitnessReceiptV1
                    .signaturePayload(
                        audience: .productionRecovery,
                        purpose: .inspectStalePrefix100,
                        operation: request.operation,
                        accepted: accepted,
                        witnessID: witnessID,
                        endpointID: endpointID,
                        witnessSignerKeyID: witnessSignerKeyID,
                        clientNonce: request.clientNonce,
                        operationID: request.operationID,
                        requestSHA256: requestSHA256,
                        checkpoint: responseCheckpoint,
                        issuedAtUnixSeconds: issuedAtUnixSeconds,
                        expiresAtUnixSeconds: expiresAtUnixSeconds
                    )
                let signatureBytes = try sign(payload)
                let signature = try CanonicalBytes64(signatureBytes)
                let receipt = try RemoteMonotonicWitnessReceiptV1(
                    audience: .productionRecovery,
                    purpose: .inspectStalePrefix100,
                    operation: request.operation,
                    accepted: accepted,
                    witnessID: witnessID,
                    endpointID: endpointID,
                    witnessSignerKeyID: witnessSignerKeyID,
                    clientNonce: request.clientNonce,
                    operationID: request.operationID,
                    requestSHA256: requestSHA256,
                    checkpoint: responseCheckpoint,
                    issuedAtUnixSeconds: issuedAtUnixSeconds,
                    expiresAtUnixSeconds: expiresAtUnixSeconds,
                    signature: signature
                )
                if case let .commit(candidate)? =
                    advanceEvaluation
                {
                    currentCheckpoint = candidate
                    acceptedRequestSHA256ByOperationID[
                        request.operationID
                    ] = requestSHA256
                }
                return receipt
            } catch {
                throw RemoteMonotonicWitnessErrorV1
                    .invalidWitnessState
            }
        }
    }

    func currentCheckpointSnapshot()
        -> AuthorityRollbackCheckpointV1
    {
        lock.withLock {
            currentCheckpoint
        }
    }

    func acceptedOperationCountSnapshot() -> Int {
        lock.withLock {
            acceptedRequestSHA256ByOperationID.count
        }
    }

    private func evaluateAdvance(
        _ request: RemoteMonotonicWitnessRequestV1,
        requestSHA256: CanonicalBytes32
    ) throws -> AdvanceEvaluation {
        guard let candidate = request.candidateCheckpoint else {
            throw RemoteMonotonicWitnessErrorV1.invalidWitnessState
        }

        if let acceptedRequestSHA256 =
            acceptedRequestSHA256ByOperationID[
                request.operationID
            ]
        {
            guard
                requestSHA256 == acceptedRequestSHA256
            else {
                throw RemoteMonotonicWitnessErrorV1
                    .invalidWitnessState
            }
            return .acceptedRetry(candidate)
        }

        let currentSHA256 = currentCheckpoint.canonicalSHA256()
        guard request.expectedCheckpointSHA256 == currentSHA256 else {
            return .rejected
        }
        let (nextSequence, overflow) =
            currentCheckpoint.journalSequence
            .addingReportingOverflow(1)
        guard
            !overflow,
            candidate.journalSequence == nextSequence,
            candidate.journalSequence
                <= UInt64(Self.maximumAcceptedOperationCount),
            candidate.journalID == currentCheckpoint.journalID,
            candidate.authorityPublicKeyRecordSHA256
                == currentCheckpoint
                .authorityPublicKeyRecordSHA256,
            candidate.journalHeaderSHA256
                == currentCheckpoint.journalHeaderSHA256,
            candidate.previousWitnessedCheckpointSHA256
                == currentSHA256,
            acceptedRequestSHA256ByOperationID.count
                < Self.maximumAcceptedOperationCount
        else {
            throw RemoteMonotonicWitnessErrorV1.invalidWitnessState
        }

        return .commit(candidate)
    }
}
