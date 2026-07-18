import CryptoKit
import Foundation
import FloodgateV7ExternalTrustRootProtocol

enum DurableRemoteWitnessServiceErrorV1:
    Error,
    Equatable,
    Sendable
{
    case stop
}

enum DurableRemoteWitnessCallerRoleV1:
    Equatable,
    Sendable
{
    case queryOnly
    case advanceWriter
}

struct DurableRemoteWitnessDeploymentIdentityV1:
    Equatable,
    Sendable
{
    private static let endpointBindingDomain =
        Array("FGV7DEI1".utf8)

    let witnessID: CanonicalBytes32
    let endpointID: CanonicalBytes32
    let witnessSignerKeyID: CanonicalBytes32
    let storeGenerationID: CanonicalBytes32

    /// The client-pinned endpoint identity changes whenever the independently
    /// observed physical store generation changes.
    static func boundEndpointID(
        witnessID: CanonicalBytes32,
        storeGenerationID: CanonicalBytes32
    ) throws -> CanonicalBytes32 {
        let digest = SHA256.hash(
            data: Data(
                endpointBindingDomain
                    + witnessID.bytes
                    + storeGenerationID.bytes
            )
        )
        return try CanonicalBytes32(Array(digest))
    }

    init(
        witnessID: CanonicalBytes32,
        endpointID: CanonicalBytes32,
        witnessSignerKeyID: CanonicalBytes32,
        storeGenerationID: CanonicalBytes32
    ) throws {
        let values = [
            witnessID,
            endpointID,
            witnessSignerKeyID,
            storeGenerationID,
        ]
        let expectedEndpointID = try Self.boundEndpointID(
            witnessID: witnessID,
            storeGenerationID: storeGenerationID
        )
        guard
            values.allSatisfy({ $0 != .zero }),
            Set(values).count == values.count,
            endpointID == expectedEndpointID
        else {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
        self.witnessID = witnessID
        self.endpointID = endpointID
        self.witnessSignerKeyID = witnessSignerKeyID
        self.storeGenerationID = storeGenerationID
    }
}

struct DurableRemoteWitnessAcceptedOperationV1:
    Equatable,
    Sendable
{
    let operationID: CanonicalBytes32
    let requestSHA256: CanonicalBytes32
    let requestCanonicalBytes: [UInt8]
    let acceptedCheckpoint: AuthorityRollbackCheckpointV1
    let immutableInitialReceipt:
        RemoteMonotonicWitnessReceiptV1
}

struct DurableRemoteWitnessTransactionalSnapshotV1:
    Equatable,
    Sendable
{
    let deploymentIdentity:
        DurableRemoteWitnessDeploymentIdentityV1
    /// Physical provider generation observed independently of restored data.
    let observedStoreGenerationID: CanonicalBytes32
    let currentCheckpoint: AuthorityRollbackCheckpointV1
    let acceptedOperationCount: Int
    let operation: DurableRemoteWitnessAcceptedOperationV1?
}

struct DurableRemoteWitnessCommitPlanV1:
    Equatable,
    Sendable
{
    let exactAttemptID: CanonicalBytes32
    let deploymentIdentity:
        DurableRemoteWitnessDeploymentIdentityV1
    let expectedCheckpointSHA256: CanonicalBytes32
    let expectedAcceptedOperationCount: Int
    let replacementCheckpoint:
        AuthorityRollbackCheckpointV1
    let createOnlyOperation:
        DurableRemoteWitnessAcceptedOperationV1
}

enum DurableRemoteWitnessCommitResultV1:
    Equatable,
    Sendable
{
    /// The exact STATE + create-only OP/receipt plan committed durably.
    case committed
    /// The expected STATE or create-only OP condition definitively lost.
    case definitiveCASLoss
    /// This attempt did not commit, but the CAS has not definitively lost.
    case transientConflict
    /// The provider may have committed; resend only the byte-identical plan.
    case ambiguous
}

/// One serializable read of STATE and the requested OP/receipt record.
///
/// The observed physical generation must come from provider metadata that is
/// independent of any data copied by backup or restore.
typealias DurableRemoteWitnessTransactionalReadV1 =
    (CanonicalBytes32) throws
        -> DurableRemoteWitnessTransactionalSnapshotV1
typealias DurableRemoteWitnessCommitV1 =
    (DurableRemoteWitnessCommitPlanV1) throws
        -> DurableRemoteWitnessCommitResultV1
typealias DurableRemoteWitnessClockV1 =
    () throws -> UInt64

/// Pure source/test service ordering for a future durable provider.
///
/// This target is deliberately absent from package products. It has no
/// network, cloud SDK, environment, filesystem, or production entrypoint.
final class DurableRemoteWitnessServiceCoreV1 {
    static let maximumAcceptedOperationCount = 4_096
    static let maximumJournalSequence: UInt64 = 4_096
    static let maximumExactCommitAttempts = 3

    private let deploymentIdentity:
        DurableRemoteWitnessDeploymentIdentityV1
    private let witnessSignerPublicKeyRawRepresentation:
        [UInt8]

    private struct PreparedReceipt {
        let receipt: RemoteMonotonicWitnessReceiptV1
        let lastObservedUnixSeconds: UInt64
    }

    init(
        deploymentIdentity:
            DurableRemoteWitnessDeploymentIdentityV1,
        witnessSignerPublicKeyRawRepresentation: [UInt8]
    ) throws {
        do {
            let signerKeyID =
                try TrustRootSignatureV1.signerKeyID(
                    publicKeyRawRepresentation:
                        witnessSignerPublicKeyRawRepresentation
                )
            guard
                signerKeyID
                    == deploymentIdentity.witnessSignerKeyID
            else {
                throw DurableRemoteWitnessServiceErrorV1.stop
            }
            self.deploymentIdentity = deploymentIdentity
            self.witnessSignerPublicKeyRawRepresentation =
                Array(witnessSignerPublicKeyRawRepresentation)
        } catch {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
    }

    func handle(
        _ request: RemoteMonotonicWitnessRequestV1,
        callerRole: DurableRemoteWitnessCallerRoleV1,
        exactAttemptID: CanonicalBytes32,
        clock: DurableRemoteWitnessClockV1,
        sign: TrustRootSignatureProviderV1,
        transactionalRead:
            DurableRemoteWitnessTransactionalReadV1,
        commit: DurableRemoteWitnessCommitV1
    ) throws -> RemoteMonotonicWitnessReceiptV1 {
        do {
            guard
                request.witnessID
                    == deploymentIdentity.witnessID,
                request.endpointID
                    == deploymentIdentity.endpointID,
                exactAttemptID != .zero,
                exactAttemptID != request.operationID,
                exactAttemptID != request.clientNonce,
                exactAttemptID != request.witnessID,
                exactAttemptID != request.endpointID,
                exactAttemptID
                    != deploymentIdentity.witnessSignerKeyID,
                exactAttemptID
                    != deploymentIdentity.storeGenerationID
            else {
                throw DurableRemoteWitnessServiceErrorV1.stop
            }
            if request.operation == .advance {
                guard callerRole == .advanceWriter else {
                    throw DurableRemoteWitnessServiceErrorV1.stop
                }
            }

            let snapshot = try transactionalRead(
                request.operationID
            )
            try validate(snapshot)

            switch request.operation {
            case .query:
                guard snapshot.operation == nil else {
                    throw DurableRemoteWitnessServiceErrorV1.stop
                }
                return try issueLinearizableStateReceipt(
                    for: request,
                    accepted: true,
                    snapshot: snapshot,
                    clock: clock,
                    sign: sign,
                    transactionalRead: transactionalRead
                )
            case .advance:
                if snapshot.operation != nil {
                    return try receiptForInitialRetry(
                        request: request,
                        snapshot: snapshot,
                        clock: clock,
                        sign: sign,
                        transactionalRead: transactionalRead
                    )
                }
                return try handleNewAdvance(
                    request,
                    snapshot: snapshot,
                    exactAttemptID: exactAttemptID,
                    clock: clock,
                    sign: sign,
                    transactionalRead: transactionalRead,
                    commit: commit
                )
            }
        } catch {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
    }

    private func handleNewAdvance(
        _ request: RemoteMonotonicWitnessRequestV1,
        snapshot: DurableRemoteWitnessTransactionalSnapshotV1,
        exactAttemptID: CanonicalBytes32,
        clock: DurableRemoteWitnessClockV1,
        sign: TrustRootSignatureProviderV1,
        transactionalRead:
            DurableRemoteWitnessTransactionalReadV1,
        commit: DurableRemoteWitnessCommitV1
    ) throws -> RemoteMonotonicWitnessReceiptV1 {
        let currentSHA256 =
            snapshot.currentCheckpoint.canonicalSHA256()
        guard
            request.expectedCheckpointSHA256
                == currentSHA256
        else {
            return try issueLinearizableStateReceipt(
                for: request,
                accepted: false,
                snapshot: snapshot,
                clock: clock,
                sign: sign,
                transactionalRead: transactionalRead
            )
        }
        guard
            let candidate = request.candidateCheckpoint,
            snapshot.acceptedOperationCount
                < Self.maximumAcceptedOperationCount
        else {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
        try validateSuccessor(
            candidate,
            current: snapshot.currentCheckpoint
        )

        let preparedReceipt = try prepareFreshReceipt(
            for: request,
            accepted: true,
            checkpoint: candidate,
            clock: clock,
            sign: sign
        )
        let receipt = preparedReceipt.receipt
        let operation =
            DurableRemoteWitnessAcceptedOperationV1(
                operationID: request.operationID,
                requestSHA256: request.canonicalSHA256(),
                requestCanonicalBytes:
                    request.canonicalBytes(),
                acceptedCheckpoint: candidate,
                immutableInitialReceipt: receipt
            )
        let plan = DurableRemoteWitnessCommitPlanV1(
            exactAttemptID: exactAttemptID,
            deploymentIdentity: deploymentIdentity,
            expectedCheckpointSHA256: currentSHA256,
            expectedAcceptedOperationCount:
                snapshot.acceptedOperationCount,
            replacementCheckpoint: candidate,
            createOnlyOperation: operation
        )

        for _ in 0..<Self.maximumExactCommitAttempts {
            switch try commit(plan) {
            case .ambiguous, .transientConflict:
                continue
            case .committed:
                let reconciled = try transactionalRead(
                    request.operationID
                )
                try validate(reconciled)
                let durableOperation =
                    try requireMatchingOperation(
                        request: request,
                        snapshot: reconciled
                    )
                return try requireStoredReceiptFresh(
                    request: request,
                    operation: durableOperation,
                    clock: clock,
                    notBeforeUnixSeconds:
                        preparedReceipt.lastObservedUnixSeconds
                )
            case .definitiveCASLoss:
                let reconciled = try transactionalRead(
                    request.operationID
                )
                try validate(reconciled)
                if reconciled.operation != nil {
                    let durableOperation =
                        try requireMatchingOperation(
                            request: request,
                            snapshot: reconciled
                        )
                    return try requireStoredReceiptFresh(
                        request: request,
                        operation: durableOperation,
                        clock: clock,
                        notBeforeUnixSeconds:
                            preparedReceipt
                            .lastObservedUnixSeconds
                    )
                }
                guard
                    request.expectedCheckpointSHA256
                        != reconciled.currentCheckpoint
                        .canonicalSHA256()
                else {
                    throw DurableRemoteWitnessServiceErrorV1.stop
                }
                return try issueLinearizableStateReceipt(
                    for: request,
                    accepted: false,
                    snapshot: reconciled,
                    clock: clock,
                    sign: sign,
                    transactionalRead: transactionalRead,
                    notBeforeUnixSeconds:
                        preparedReceipt.lastObservedUnixSeconds
                )
            }
        }
        throw DurableRemoteWitnessServiceErrorV1.stop
    }

    private func receiptForInitialRetry(
        request: RemoteMonotonicWitnessRequestV1,
        snapshot: DurableRemoteWitnessTransactionalSnapshotV1,
        clock: DurableRemoteWitnessClockV1,
        sign: TrustRootSignatureProviderV1,
        transactionalRead:
            DurableRemoteWitnessTransactionalReadV1
    ) throws -> RemoteMonotonicWitnessReceiptV1 {
        let operation = try requireMatchingOperation(
            request: request,
            snapshot: snapshot
        )
        let now = try sampleTime(
            clock,
            notBeforeUnixSeconds: nil
        )
        do {
            _ = try operation.immutableInitialReceipt
                .verifiedCheckpoint(
                    for: request,
                    publicKeyRawRepresentation:
                        witnessSignerPublicKeyRawRepresentation,
                    nowUnixSeconds: now
                )
            return operation.immutableInitialReceipt
        } catch {
            guard
                now
                    >= operation.immutableInitialReceipt
                    .expiresAtUnixSeconds
            else {
                throw DurableRemoteWitnessServiceErrorV1.stop
            }
            let prepared = try prepareFreshReceipt(
                for: request,
                accepted: true,
                checkpoint: operation.acceptedCheckpoint,
                clock: clock,
                sign: sign,
                notBeforeUnixSeconds: now
            )
            let revalidated = try transactionalRead(
                request.operationID
            )
            try validate(revalidated)
            let durableOperation =
                try requireMatchingOperation(
                    request: request,
                    snapshot: revalidated
                )
            guard
                snapshot.deploymentIdentity
                    == revalidated.deploymentIdentity,
                snapshot.observedStoreGenerationID
                    == revalidated.observedStoreGenerationID,
                durableOperation == operation
            else {
                throw DurableRemoteWitnessServiceErrorV1.stop
            }
            return try finishPreparedReceipt(
                prepared,
                request: request,
                checkpoint: operation.acceptedCheckpoint,
                clock: clock
            )
        }
    }

    private func requireStoredReceiptFresh(
        request: RemoteMonotonicWitnessRequestV1,
        operation: DurableRemoteWitnessAcceptedOperationV1,
        clock: DurableRemoteWitnessClockV1,
        notBeforeUnixSeconds: UInt64
    ) throws -> RemoteMonotonicWitnessReceiptV1 {
        try validate(operation, for: request)
        let now = try sampleTime(
            clock,
            notBeforeUnixSeconds: notBeforeUnixSeconds
        )
        let checkpoint =
            try operation.immutableInitialReceipt
            .verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation:
                    witnessSignerPublicKeyRawRepresentation,
                nowUnixSeconds: now
            )
        guard checkpoint == operation.acceptedCheckpoint else {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
        return operation.immutableInitialReceipt
    }

    private func requireMatchingOperation(
        request: RemoteMonotonicWitnessRequestV1,
        snapshot: DurableRemoteWitnessTransactionalSnapshotV1
    ) throws -> DurableRemoteWitnessAcceptedOperationV1 {
        guard let operation = snapshot.operation else {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
        try validate(operation, for: request)
        if snapshot.currentCheckpoint.journalSequence
            == operation.acceptedCheckpoint.journalSequence
        {
            guard
                snapshot.currentCheckpoint
                    == operation.acceptedCheckpoint
            else {
                throw DurableRemoteWitnessServiceErrorV1.stop
            }
        } else {
            // The snapshot carries only STATE and the requested immutable OP.
            // It can prove one successor through the checkpoint's previous
            // digest. More distant STATE must STOP until a future snapshot
            // contract supplies every immutable intermediate checkpoint.
            try validateSuccessor(
                snapshot.currentCheckpoint,
                current: operation.acceptedCheckpoint
            )
        }
        guard
            snapshot.acceptedOperationCount > 0
        else {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
        return operation
    }

    private func validate(
        _ snapshot: DurableRemoteWitnessTransactionalSnapshotV1
    ) throws {
        guard
            snapshot.deploymentIdentity
                == deploymentIdentity,
            snapshot.observedStoreGenerationID
                == deploymentIdentity.storeGenerationID,
            snapshot.currentCheckpoint.journalSequence
                <= Self.maximumJournalSequence,
            snapshot.acceptedOperationCount >= 0,
            snapshot.acceptedOperationCount
                <= Self.maximumAcceptedOperationCount,
            snapshot.operation == nil
                || snapshot.acceptedOperationCount > 0
        else {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
    }

    private func validate(
        _ operation: DurableRemoteWitnessAcceptedOperationV1,
        for request: RemoteMonotonicWitnessRequestV1
    ) throws {
        guard
            request.operation == .advance,
            operation.operationID == request.operationID,
            operation.requestSHA256
                == request.canonicalSHA256(),
            operation.requestCanonicalBytes
                == request.canonicalBytes(),
            operation.acceptedCheckpoint
                == request.candidateCheckpoint,
            operation.acceptedCheckpoint.journalSequence
                <= Self.maximumJournalSequence,
            operation.immutableInitialReceipt.accepted,
            operation.immutableInitialReceipt.operation
                == .advance,
            operation.immutableInitialReceipt.witnessID
                == deploymentIdentity.witnessID,
            operation.immutableInitialReceipt.endpointID
                == deploymentIdentity.endpointID,
            operation.immutableInitialReceipt
                .witnessSignerKeyID
                == deploymentIdentity.witnessSignerKeyID,
            operation.immutableInitialReceipt.checkpoint
                == operation.acceptedCheckpoint
        else {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
        let checkpoint =
            try operation.immutableInitialReceipt
            .verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation:
                    witnessSignerPublicKeyRawRepresentation,
                nowUnixSeconds:
                    operation.immutableInitialReceipt
                    .issuedAtUnixSeconds
            )
        guard checkpoint == operation.acceptedCheckpoint else {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
    }

    private func validateSuccessor(
        _ candidate: AuthorityRollbackCheckpointV1,
        current: AuthorityRollbackCheckpointV1
    ) throws {
        let (nextSequence, overflow) =
            current.journalSequence
            .addingReportingOverflow(1)
        guard
            !overflow,
            candidate.journalSequence == nextSequence,
            candidate.journalSequence
                <= Self.maximumJournalSequence,
            candidate.journalID == current.journalID,
            candidate.authorityPublicKeyRecordSHA256
                == current.authorityPublicKeyRecordSHA256,
            candidate.journalHeaderSHA256
                == current.journalHeaderSHA256,
            candidate.previousWitnessedCheckpointSHA256
                == current.canonicalSHA256()
        else {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
    }

    private func issueLinearizableStateReceipt(
        for request: RemoteMonotonicWitnessRequestV1,
        accepted: Bool,
        snapshot: DurableRemoteWitnessTransactionalSnapshotV1,
        clock: DurableRemoteWitnessClockV1,
        sign: TrustRootSignatureProviderV1,
        transactionalRead:
            DurableRemoteWitnessTransactionalReadV1,
        notBeforeUnixSeconds: UInt64? = nil
    ) throws -> RemoteMonotonicWitnessReceiptV1 {
        let prepared = try prepareFreshReceipt(
            for: request,
            accepted: accepted,
            checkpoint: snapshot.currentCheckpoint,
            clock: clock,
            sign: sign,
            notBeforeUnixSeconds: notBeforeUnixSeconds
        )
        let revalidated = try transactionalRead(
            request.operationID
        )
        try validate(revalidated)
        guard revalidated == snapshot else {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
        return try finishPreparedReceipt(
            prepared,
            request: request,
            checkpoint: snapshot.currentCheckpoint,
            clock: clock
        )
    }

    private func prepareFreshReceipt(
        for request: RemoteMonotonicWitnessRequestV1,
        accepted: Bool,
        checkpoint: AuthorityRollbackCheckpointV1,
        clock: DurableRemoteWitnessClockV1,
        sign: TrustRootSignatureProviderV1,
        notBeforeUnixSeconds: UInt64? = nil
    ) throws -> PreparedReceipt {
        let issuedAt = try sampleTime(
            clock,
            notBeforeUnixSeconds: notBeforeUnixSeconds
        )
        let (expiresAt, overflow) =
            issuedAt.addingReportingOverflow(
                RemoteMonotonicWitnessReceiptV1
                    .maximumLifetimeSeconds
            )
        guard !overflow else {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
        let payload =
            try RemoteMonotonicWitnessReceiptV1
            .signaturePayload(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                operation: request.operation,
                accepted: accepted,
                witnessID: deploymentIdentity.witnessID,
                endpointID: deploymentIdentity.endpointID,
                witnessSignerKeyID:
                    deploymentIdentity.witnessSignerKeyID,
                clientNonce: request.clientNonce,
                operationID: request.operationID,
                requestSHA256: request.canonicalSHA256(),
                checkpoint: checkpoint,
                issuedAtUnixSeconds: issuedAt,
                expiresAtUnixSeconds: expiresAt
            )
        let signature = try CanonicalBytes64(
            sign(payload)
        )
        let receipt =
            try RemoteMonotonicWitnessReceiptV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                operation: request.operation,
                accepted: accepted,
                witnessID: deploymentIdentity.witnessID,
                endpointID: deploymentIdentity.endpointID,
                witnessSignerKeyID:
                    deploymentIdentity.witnessSignerKeyID,
                clientNonce: request.clientNonce,
                operationID: request.operationID,
                requestSHA256: request.canonicalSHA256(),
                checkpoint: checkpoint,
                issuedAtUnixSeconds: issuedAt,
                expiresAtUnixSeconds: expiresAt,
                signature: signature
            )
        let responseAt = try sampleTime(
            clock,
            notBeforeUnixSeconds: issuedAt
        )
        let verified = try receipt.verifiedCheckpoint(
            for: request,
            publicKeyRawRepresentation:
                witnessSignerPublicKeyRawRepresentation,
            nowUnixSeconds: responseAt
        )
        guard verified == checkpoint else {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
        return PreparedReceipt(
            receipt: receipt,
            lastObservedUnixSeconds: responseAt
        )
    }

    private func finishPreparedReceipt(
        _ prepared: PreparedReceipt,
        request: RemoteMonotonicWitnessRequestV1,
        checkpoint: AuthorityRollbackCheckpointV1,
        clock: DurableRemoteWitnessClockV1
    ) throws -> RemoteMonotonicWitnessReceiptV1 {
        let responseAt = try sampleTime(
            clock,
            notBeforeUnixSeconds:
                prepared.lastObservedUnixSeconds
        )
        let verified = try prepared.receipt.verifiedCheckpoint(
            for: request,
            publicKeyRawRepresentation:
                witnessSignerPublicKeyRawRepresentation,
            nowUnixSeconds: responseAt
        )
        guard verified == checkpoint else {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
        return prepared.receipt
    }

    private func sampleTime(
        _ clock: DurableRemoteWitnessClockV1,
        notBeforeUnixSeconds: UInt64?
    ) throws -> UInt64 {
        let value = try clock()
        guard value > 0 else {
            throw DurableRemoteWitnessServiceErrorV1.stop
        }
        if let notBeforeUnixSeconds {
            guard value >= notBeforeUnixSeconds else {
                throw DurableRemoteWitnessServiceErrorV1.stop
            }
        }
        return value
    }
}
