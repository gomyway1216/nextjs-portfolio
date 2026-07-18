private let maximumRemoteWitnessReceiptLifetimeSeconds: UInt64 = 30

private func remoteWitnessValuesArePairwiseDistinct(
    _ values: [CanonicalBytes32]
) -> Bool {
    Set(values).count == values.count
}

private func validRemoteWitnessReceiptWindow(
    issuedAtUnixSeconds: UInt64,
    expiresAtUnixSeconds: UInt64
) -> Bool {
    guard
        issuedAtUnixSeconds > 0,
        issuedAtUnixSeconds < expiresAtUnixSeconds
    else {
        return false
    }
    let (maximumExpiry, overflow) =
        issuedAtUnixSeconds.addingReportingOverflow(
            maximumRemoteWitnessReceiptLifetimeSeconds
        )
    return !overflow && expiresAtUnixSeconds <= maximumExpiry
}

public struct AuthorityRollbackCheckpointV1: Equatable, Sendable {
    public static let canonicalByteCount = 212

    private static let magic = Array("FGV7ARC1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0

    public let audience: TrustRootAudience
    public let purpose: TrustRootPurpose
    public let journalID: CanonicalBytes32
    public let journalSequence: UInt64
    public let authorityPublicKeyRecordSHA256: CanonicalBytes32
    public let journalHeaderSHA256: CanonicalBytes32
    public let lastJournalEntrySHA256: CanonicalBytes32
    public let expectedActivationHeadSHA256: CanonicalBytes32
    public let previousWitnessedCheckpointSHA256: CanonicalBytes32

    public init(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        journalID: CanonicalBytes32,
        journalSequence: UInt64,
        authorityPublicKeyRecordSHA256: CanonicalBytes32,
        journalHeaderSHA256: CanonicalBytes32,
        lastJournalEntrySHA256: CanonicalBytes32,
        expectedActivationHeadSHA256: CanonicalBytes32,
        previousWitnessedCheckpointSHA256: CanonicalBytes32
    ) throws {
        let requiredDigests = [
            journalID,
            authorityPublicKeyRecordSHA256,
            journalHeaderSHA256,
            lastJournalEntrySHA256,
            expectedActivationHeadSHA256,
        ]
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            journalSequence > 0,
            requiredDigests.allSatisfy({ !$0.isAllZero }),
            remoteWitnessValuesArePairwiseDistinct(
                journalSequence == 1
                    ? requiredDigests
                    : requiredDigests
                        + [previousWitnessedCheckpointSHA256]
            ),
            (
                journalSequence == 1
                    && previousWitnessedCheckpointSHA256.isAllZero
            )
                || (
                    journalSequence > 1
                        && !previousWitnessedCheckpointSHA256.isAllZero
                )
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.audience = audience
        self.purpose = purpose
        self.journalID = journalID
        self.journalSequence = journalSequence
        self.authorityPublicKeyRecordSHA256 =
            authorityPublicKeyRecordSHA256
        self.journalHeaderSHA256 = journalHeaderSHA256
        self.lastJournalEntrySHA256 = lastJournalEntrySHA256
        self.expectedActivationHeadSHA256 =
            expectedActivationHeadSHA256
        self.previousWitnessedCheckpointSHA256 =
            previousWitnessedCheckpointSHA256
    }

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(journalID.bytes)
        encoder.append(journalSequence)
        encoder.append(authorityPublicKeyRecordSHA256.bytes)
        encoder.append(journalHeaderSHA256.bytes)
        encoder.append(lastJournalEntrySHA256.bytes)
        encoder.append(expectedActivationHeadSHA256.bytes)
        encoder.append(previousWitnessedCheckpointSHA256.bytes)
        precondition(encoder.bytes.count == Self.canonicalByteCount)
        return encoder.bytes
    }

    public func canonicalSHA256() -> CanonicalBytes32 {
        CanonicalSHA256.digest(canonicalBytes())
    }

    public static func decodeCanonical(_ bytes: [UInt8]) throws -> Self {
        do {
            guard bytes.count == canonicalByteCount else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            var decoder = CanonicalDecoder(bytes)
            guard
                try decoder.readBytes(count: magic.count) == magic,
                try decoder.readByte() == schemaVersion,
                try decoder.readByte() == reserved,
                let audience = TrustRootAudience(
                    rawValue: try decoder.readByte()
                ),
                let purpose = TrustRootPurpose(
                    rawValue: try decoder.readByte()
                )
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            let checkpoint = try Self(
                audience: audience,
                purpose: purpose,
                journalID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                journalSequence: try decoder.readUInt64(),
                authorityPublicKeyRecordSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                journalHeaderSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                lastJournalEntrySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                expectedActivationHeadSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                previousWitnessedCheckpointSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                )
            )
            guard decoder.isAtEnd else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return checkpoint
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}

public enum RemoteMonotonicWitnessOperationV1:
    UInt8,
    Equatable,
    Sendable
{
    case query = 1
    case advance = 2
}

public struct RemoteMonotonicWitnessRequestV1:
    Equatable,
    Sendable
{
    public static let canonicalByteCount = 418

    private static let magic = Array("FGV7RWR1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0
    private static let operationReserved: UInt8 = 0

    public let audience: TrustRootAudience
    public let purpose: TrustRootPurpose
    public let operation: RemoteMonotonicWitnessOperationV1
    public let witnessID: CanonicalBytes32
    public let endpointID: CanonicalBytes32
    public let clientNonce: CanonicalBytes32
    public let operationID: CanonicalBytes32
    public let expectedCheckpointSHA256: CanonicalBytes32
    public let candidateCheckpoint: AuthorityRollbackCheckpointV1?

    public init(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        operation: RemoteMonotonicWitnessOperationV1,
        witnessID: CanonicalBytes32,
        endpointID: CanonicalBytes32,
        clientNonce: CanonicalBytes32,
        operationID: CanonicalBytes32,
        expectedCheckpointSHA256: CanonicalBytes32,
        candidateCheckpoint: AuthorityRollbackCheckpointV1?
    ) throws {
        let requiredIDs = [
            witnessID,
            endpointID,
            clientNonce,
            operationID,
        ]
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            requiredIDs.allSatisfy({ !$0.isAllZero }),
            remoteWitnessValuesArePairwiseDistinct(requiredIDs)
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        switch operation {
        case .query:
            guard
                expectedCheckpointSHA256.isAllZero,
                candidateCheckpoint == nil
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
        case .advance:
            guard
                !expectedCheckpointSHA256.isAllZero,
                let candidateCheckpoint,
                candidateCheckpoint.audience == audience,
                candidateCheckpoint.purpose == purpose,
                candidateCheckpoint
                    .previousWitnessedCheckpointSHA256
                    == expectedCheckpointSHA256,
                !candidateCheckpoint.canonicalSHA256().isAllZero
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
        }
        self.audience = audience
        self.purpose = purpose
        self.operation = operation
        self.witnessID = witnessID
        self.endpointID = endpointID
        self.clientNonce = clientNonce
        self.operationID = operationID
        self.expectedCheckpointSHA256 =
            expectedCheckpointSHA256
        self.candidateCheckpoint = candidateCheckpoint
    }

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(operation.rawValue)
        encoder.append(Self.operationReserved)
        encoder.append(witnessID.bytes)
        encoder.append(endpointID.bytes)
        encoder.append(clientNonce.bytes)
        encoder.append(operationID.bytes)
        encoder.append(expectedCheckpointSHA256.bytes)
        if let candidateCheckpoint {
            encoder.append(candidateCheckpoint.canonicalSHA256().bytes)
            encoder.append(candidateCheckpoint.canonicalBytes())
        } else {
            encoder.append(Array(repeating: 0, count: 32))
            encoder.append(
                Array(
                    repeating: 0,
                    count:
                        AuthorityRollbackCheckpointV1
                        .canonicalByteCount
                )
            )
        }
        precondition(encoder.bytes.count == Self.canonicalByteCount)
        return encoder.bytes
    }

    public func canonicalSHA256() -> CanonicalBytes32 {
        CanonicalSHA256.digest(canonicalBytes())
    }

    public static func decodeCanonical(_ bytes: [UInt8]) throws -> Self {
        do {
            guard bytes.count == canonicalByteCount else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            var decoder = CanonicalDecoder(bytes)
            guard
                try decoder.readBytes(count: magic.count) == magic,
                try decoder.readByte() == schemaVersion,
                try decoder.readByte() == reserved,
                let audience = TrustRootAudience(
                    rawValue: try decoder.readByte()
                ),
                let purpose = TrustRootPurpose(
                    rawValue: try decoder.readByte()
                ),
                let operation = RemoteMonotonicWitnessOperationV1(
                    rawValue: try decoder.readByte()
                ),
                try decoder.readByte() == operationReserved
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            let witnessID = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let endpointID = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let clientNonce = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let operationID = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let expectedCheckpointSHA256 = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let candidateCheckpointSHA256 = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let candidateBytes = try decoder.readBytes(
                count:
                    AuthorityRollbackCheckpointV1.canonicalByteCount
            )
            let candidateCheckpoint:
                AuthorityRollbackCheckpointV1?
            switch operation {
            case .query:
                guard
                    candidateCheckpointSHA256.isAllZero,
                    candidateBytes.allSatisfy({ $0 == 0 })
                else {
                    throw CanonicalRecordError.invalidCanonicalRecord
                }
                candidateCheckpoint = nil
            case .advance:
                let decodedCandidate =
                    try AuthorityRollbackCheckpointV1
                    .decodeCanonical(candidateBytes)
                guard
                    !candidateCheckpointSHA256.isAllZero,
                    decodedCandidate.canonicalSHA256()
                        == candidateCheckpointSHA256
                else {
                    throw CanonicalRecordError.invalidCanonicalRecord
                }
                candidateCheckpoint = decodedCandidate
            }
            guard decoder.isAtEnd else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return try Self(
                audience: audience,
                purpose: purpose,
                operation: operation,
                witnessID: witnessID,
                endpointID: endpointID,
                clientNonce: clientNonce,
                operationID: operationID,
                expectedCheckpointSHA256:
                    expectedCheckpointSHA256,
                candidateCheckpoint: candidateCheckpoint
            )
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}

public struct RemoteMonotonicWitnessReceiptV1:
    Equatable,
    Sendable
{
    public static let canonicalByteCount = 530
    public static let maximumLifetimeSeconds =
        maximumRemoteWitnessReceiptLifetimeSeconds

    private static let magic = Array("FGV7RCP1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0

    public let audience: TrustRootAudience
    public let purpose: TrustRootPurpose
    public let operation: RemoteMonotonicWitnessOperationV1
    public let accepted: Bool
    public let witnessID: CanonicalBytes32
    public let endpointID: CanonicalBytes32
    public let witnessSignerKeyID: CanonicalBytes32
    public let clientNonce: CanonicalBytes32
    public let operationID: CanonicalBytes32
    public let requestSHA256: CanonicalBytes32
    public let checkpointSHA256: CanonicalBytes32
    public let checkpoint: AuthorityRollbackCheckpointV1
    public let issuedAtUnixSeconds: UInt64
    public let expiresAtUnixSeconds: UInt64
    public let signature: CanonicalBytes64

    public init(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        operation: RemoteMonotonicWitnessOperationV1,
        accepted: Bool,
        witnessID: CanonicalBytes32,
        endpointID: CanonicalBytes32,
        witnessSignerKeyID: CanonicalBytes32,
        clientNonce: CanonicalBytes32,
        operationID: CanonicalBytes32,
        requestSHA256: CanonicalBytes32,
        checkpoint: AuthorityRollbackCheckpointV1,
        issuedAtUnixSeconds: UInt64,
        expiresAtUnixSeconds: UInt64,
        signature: CanonicalBytes64
    ) throws {
        let checkpointSHA256 = checkpoint.canonicalSHA256()
        let requiredDigests = [
            witnessID,
            endpointID,
            witnessSignerKeyID,
            clientNonce,
            operationID,
            requestSHA256,
            checkpointSHA256,
        ]
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            operation != .query || accepted,
            requiredDigests.allSatisfy({ !$0.isAllZero }),
            remoteWitnessValuesArePairwiseDistinct(
                requiredDigests
            ),
            checkpoint.audience == audience,
            checkpoint.purpose == purpose,
            validRemoteWitnessReceiptWindow(
                issuedAtUnixSeconds: issuedAtUnixSeconds,
                expiresAtUnixSeconds: expiresAtUnixSeconds
            ),
            !signature.isAllZero
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.audience = audience
        self.purpose = purpose
        self.operation = operation
        self.accepted = accepted
        self.witnessID = witnessID
        self.endpointID = endpointID
        self.witnessSignerKeyID = witnessSignerKeyID
        self.clientNonce = clientNonce
        self.operationID = operationID
        self.requestSHA256 = requestSHA256
        self.checkpointSHA256 = checkpointSHA256
        self.checkpoint = checkpoint
        self.issuedAtUnixSeconds = issuedAtUnixSeconds
        self.expiresAtUnixSeconds = expiresAtUnixSeconds
        self.signature = signature
    }

    public static func signaturePayload(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        operation: RemoteMonotonicWitnessOperationV1,
        accepted: Bool,
        witnessID: CanonicalBytes32,
        endpointID: CanonicalBytes32,
        witnessSignerKeyID: CanonicalBytes32,
        clientNonce: CanonicalBytes32,
        operationID: CanonicalBytes32,
        requestSHA256: CanonicalBytes32,
        checkpoint: AuthorityRollbackCheckpointV1,
        issuedAtUnixSeconds: UInt64,
        expiresAtUnixSeconds: UInt64
    ) throws -> [UInt8] {
        let checkpointSHA256 = checkpoint.canonicalSHA256()
        let requiredDigests = [
            witnessID,
            endpointID,
            witnessSignerKeyID,
            clientNonce,
            operationID,
            requestSHA256,
            checkpointSHA256,
        ]
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            operation != .query || accepted,
            requiredDigests.allSatisfy({ !$0.isAllZero }),
            remoteWitnessValuesArePairwiseDistinct(
                requiredDigests
            ),
            checkpoint.audience == audience,
            checkpoint.purpose == purpose,
            validRemoteWitnessReceiptWindow(
                issuedAtUnixSeconds: issuedAtUnixSeconds,
                expiresAtUnixSeconds: expiresAtUnixSeconds
            )
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        var encoder = CanonicalEncoder()
        encoder.append(magic)
        encoder.append(schemaVersion)
        encoder.append(reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(operation.rawValue)
        encoder.append(UInt8(accepted ? 1 : 0))
        encoder.append(witnessID.bytes)
        encoder.append(endpointID.bytes)
        encoder.append(witnessSignerKeyID.bytes)
        encoder.append(clientNonce.bytes)
        encoder.append(operationID.bytes)
        encoder.append(requestSHA256.bytes)
        encoder.append(checkpointSHA256.bytes)
        encoder.append(checkpoint.canonicalBytes())
        encoder.append(issuedAtUnixSeconds)
        encoder.append(expiresAtUnixSeconds)
        precondition(
            encoder.bytes.count
                == canonicalByteCount
                    - TrustRootSignatureV1.signatureByteCount
        )
        return encoder.bytes
    }

    public func signaturePayload() -> [UInt8] {
        try! Self.signaturePayload(
            audience: audience,
            purpose: purpose,
            operation: operation,
            accepted: accepted,
            witnessID: witnessID,
            endpointID: endpointID,
            witnessSignerKeyID: witnessSignerKeyID,
            clientNonce: clientNonce,
            operationID: operationID,
            requestSHA256: requestSHA256,
            checkpoint: checkpoint,
            issuedAtUnixSeconds: issuedAtUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds
        )
    }

    public func canonicalBytes() -> [UInt8] {
        signaturePayload() + signature.bytes
    }

    public func canonicalSHA256() -> CanonicalBytes32 {
        CanonicalSHA256.digest(canonicalBytes())
    }

    public func verifiedCheckpoint(
        for request: RemoteMonotonicWitnessRequestV1,
        publicKeyRawRepresentation: [UInt8],
        nowUnixSeconds: UInt64
    ) throws -> AuthorityRollbackCheckpointV1 {
        guard
            nowUnixSeconds >= issuedAtUnixSeconds,
            nowUnixSeconds < expiresAtUnixSeconds,
            audience == request.audience,
            purpose == request.purpose,
            operation == request.operation,
            witnessID == request.witnessID,
            endpointID == request.endpointID,
            clientNonce == request.clientNonce,
            operationID == request.operationID,
            requestSHA256 == request.canonicalSHA256(),
            checkpointSHA256 == checkpoint.canonicalSHA256(),
            operation != .advance
                || !accepted
                || checkpoint == request.candidateCheckpoint
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        try TrustRootSignatureV1.verify(
            signature: signature,
            payload: signaturePayload(),
            signerKeyID: witnessSignerKeyID,
            publicKeyRawRepresentation: publicKeyRawRepresentation
        )
        return checkpoint
    }

    public static func decodeCanonical(_ bytes: [UInt8]) throws -> Self {
        do {
            guard bytes.count == canonicalByteCount else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            var decoder = CanonicalDecoder(bytes)
            guard
                try decoder.readBytes(count: magic.count) == magic,
                try decoder.readByte() == schemaVersion,
                try decoder.readByte() == reserved,
                let audience = TrustRootAudience(
                    rawValue: try decoder.readByte()
                ),
                let purpose = TrustRootPurpose(
                    rawValue: try decoder.readByte()
                ),
                let operation = RemoteMonotonicWitnessOperationV1(
                    rawValue: try decoder.readByte()
                )
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            let acceptedByte = try decoder.readByte()
            guard acceptedByte == 0 || acceptedByte == 1 else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            let witnessID = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let endpointID = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let witnessSignerKeyID = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let clientNonce = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let operationID = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let requestSHA256 = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let checkpointSHA256 = try CanonicalBytes32(
                decoder.readBytes(count: 32)
            )
            let checkpoint =
                try AuthorityRollbackCheckpointV1.decodeCanonical(
                    decoder.readBytes(
                        count:
                            AuthorityRollbackCheckpointV1
                            .canonicalByteCount
                    )
                )
            let receipt = try Self(
                audience: audience,
                purpose: purpose,
                operation: operation,
                accepted: acceptedByte == 1,
                witnessID: witnessID,
                endpointID: endpointID,
                witnessSignerKeyID: witnessSignerKeyID,
                clientNonce: clientNonce,
                operationID: operationID,
                requestSHA256: requestSHA256,
                checkpoint: checkpoint,
                issuedAtUnixSeconds: try decoder.readUInt64(),
                expiresAtUnixSeconds: try decoder.readUInt64(),
                signature: CanonicalBytes64(
                    try decoder.readBytes(
                        count:
                            TrustRootSignatureV1.signatureByteCount
                    )
                )
            )
            guard
                decoder.isAtEnd,
                receipt.checkpointSHA256 == checkpointSHA256
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return receipt
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}
