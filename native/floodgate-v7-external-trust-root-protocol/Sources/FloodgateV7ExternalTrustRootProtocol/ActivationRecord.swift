public enum ActivationAction: UInt8, Equatable, Sendable {
    case activate = 1
    case revoke = 2
    case rollback = 3
}

public struct ActivationRecord: Equatable, Sendable {
    public static let canonicalByteCount = 124

    private static let magic: [UInt8] = [
        0x46, 0x47, 0x56, 0x37, 0x41, 0x43, 0x54, 0x31,
    ] // FGV7ACT1
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0

    public let audience: TrustRootAudience
    public let action: ActivationAction
    public let sequence: UInt64
    public let activationID: CanonicalBytes32
    public let targetEnrollmentID: CanonicalBytes32
    public let previousActivationDigest: CanonicalBytes32
    public let issuedAtUnixSeconds: UInt64

    public init(
        audience: TrustRootAudience,
        action: ActivationAction,
        sequence: UInt64,
        activationID: CanonicalBytes32,
        targetEnrollmentID: CanonicalBytes32,
        previousActivationDigest: CanonicalBytes32,
        issuedAtUnixSeconds: UInt64
    ) throws {
        guard
            audience == .productionRecovery,
            sequence > 0,
            !activationID.isAllZero,
            !targetEnrollmentID.isAllZero,
            issuedAtUnixSeconds > 0
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }

        self.audience = audience
        self.action = action
        self.sequence = sequence
        self.activationID = activationID
        self.targetEnrollmentID = targetEnrollmentID
        self.previousActivationDigest = previousActivationDigest
        self.issuedAtUnixSeconds = issuedAtUnixSeconds
    }

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(audience.rawValue)
        encoder.append(action.rawValue)
        encoder.append(sequence)
        encoder.append(activationID.bytes)
        encoder.append(targetEnrollmentID.bytes)
        encoder.append(previousActivationDigest.bytes)
        encoder.append(issuedAtUnixSeconds)
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
                let action = ActivationAction(
                    rawValue: try decoder.readByte()
                )
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }

            let record = try Self(
                audience: audience,
                action: action,
                sequence: try decoder.readUInt64(),
                activationID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                targetEnrollmentID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                previousActivationDigest: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                issuedAtUnixSeconds: try decoder.readUInt64()
            )
            guard decoder.isAtEnd else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return record
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}
