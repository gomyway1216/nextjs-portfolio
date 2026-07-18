public struct ExpectedActivationHeadV1: Equatable, Sendable {
    public static let canonicalByteCount = 84

    private static let magic = Array("FGV7EAH1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0

    public let audience: TrustRootAudience
    public let purpose: TrustRootPurpose
    public let authoritySignerKeyID: CanonicalBytes32
    public let latestActivationSequence: UInt64
    public let latestActivationEnvelopeSHA256: CanonicalBytes32

    public init(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        authoritySignerKeyID: CanonicalBytes32,
        latestActivationSequence: UInt64,
        latestActivationEnvelopeSHA256: CanonicalBytes32
    ) throws {
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            !authoritySignerKeyID.isAllZero,
            latestActivationSequence > 0,
            !latestActivationEnvelopeSHA256.isAllZero
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.audience = audience
        self.purpose = purpose
        self.authoritySignerKeyID = authoritySignerKeyID
        self.latestActivationSequence = latestActivationSequence
        self.latestActivationEnvelopeSHA256 =
            latestActivationEnvelopeSHA256
    }

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(authoritySignerKeyID.bytes)
        encoder.append(latestActivationSequence)
        encoder.append(latestActivationEnvelopeSHA256.bytes)
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
            let head = try Self(
                audience: audience,
                purpose: purpose,
                authoritySignerKeyID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                latestActivationSequence: try decoder.readUInt64(),
                latestActivationEnvelopeSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                )
            )
            guard decoder.isAtEnd else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return head
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}

public struct AuthenticatedProtocolStateSnapshotV1: Equatable, Sendable {
    public let activeEnrollment: EnrollmentRecord
    public let activeEnrollmentEnvelopeSHA256: CanonicalBytes32
    public let lastActivationEnvelopeSHA256: CanonicalBytes32
    public let authoritySignerKeyID: CanonicalBytes32
    public let enrollmentCount: Int
    public let activationCount: Int
}

public enum AuthenticatedProtocolStateV1 {
    public static func replay(
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        authorityPublicKeyRawRepresentation: [UInt8],
        expectedActivationHead: ExpectedActivationHeadV1,
        nowUnixSeconds: UInt64
    ) throws -> AuthenticatedProtocolStateSnapshotV1 {
        do {
            guard
                !enrollmentEnvelopes.isEmpty,
                !activationEnvelopes.isEmpty,
                nowUnixSeconds > 0
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            let authoritySignerKeyID =
                try TrustRootSignatureV1.signerKeyID(
                    publicKeyRawRepresentation:
                        authorityPublicKeyRawRepresentation
                )
            guard
                expectedActivationHead.authoritySignerKeyID
                    == authoritySignerKeyID
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            var state = ProtocolState()
            var verifiedEnrollments:
                [CanonicalBytes32: (
                    record: EnrollmentRecord,
                    envelopeSHA256: CanonicalBytes32
                )] = [:]

            for envelope in enrollmentEnvelopes {
                guard envelope.signerKeyID == authoritySignerKeyID else {
                    throw CanonicalRecordError.invalidCanonicalRecord
                }
                let record = try envelope.verifiedRecord(
                    publicKeyRawRepresentation:
                        authorityPublicKeyRawRepresentation
                )
                try state.registerEnrollment(record)
                verifiedEnrollments[record.enrollmentID] = (
                    record,
                    envelope.canonicalSHA256()
                )
            }

            var lastActivationEnvelopeSHA256:
                CanonicalBytes32?
            var lastActivationSequence: UInt64?
            for envelope in activationEnvelopes {
                guard envelope.signerKeyID == authoritySignerKeyID else {
                    throw CanonicalRecordError.invalidCanonicalRecord
                }
                let record = try envelope.verifiedRecord(
                    publicKeyRawRepresentation:
                        authorityPublicKeyRawRepresentation
                )
                try state.applyActivation(record)
                lastActivationEnvelopeSHA256 =
                    envelope.canonicalSHA256()
                lastActivationSequence = record.sequence
            }

            let snapshot = state.snapshot
            guard
                let activeEnrollmentID = snapshot.activeEnrollmentID,
                !snapshot.revokedEnrollmentIDs.contains(activeEnrollmentID),
                let active = verifiedEnrollments[activeEnrollmentID],
                nowUnixSeconds >= active.record.notBeforeUnixSeconds,
                nowUnixSeconds < active.record.expiresAtUnixSeconds,
                let lastActivationEnvelopeSHA256,
                let lastActivationSequence,
                lastActivationSequence
                    == expectedActivationHead.latestActivationSequence,
                lastActivationEnvelopeSHA256
                    == expectedActivationHead
                    .latestActivationEnvelopeSHA256
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return AuthenticatedProtocolStateSnapshotV1(
                activeEnrollment: active.record,
                activeEnrollmentEnvelopeSHA256:
                    active.envelopeSHA256,
                lastActivationEnvelopeSHA256:
                    lastActivationEnvelopeSHA256,
                authoritySignerKeyID: authoritySignerKeyID,
                enrollmentCount: snapshot.enrollmentCount,
                activationCount: snapshot.activationCount
            )
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}
