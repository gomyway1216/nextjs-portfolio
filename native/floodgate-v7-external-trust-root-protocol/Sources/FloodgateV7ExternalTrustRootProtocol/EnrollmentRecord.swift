public enum TrustRootAudience: UInt8, Equatable, Sendable {
    case productionRecovery = 1
}

public enum TrustRootPurpose: UInt8, Equatable, Sendable {
    case inspectStalePrefix100 = 1
}

public struct EnrollmentRecord: Equatable, Sendable {
    public static let canonicalByteCount = 232

    private static let magic: [UInt8] = [
        0x46, 0x47, 0x56, 0x37, 0x45, 0x4e, 0x52, 0x31,
    ] // FGV7ENR1
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0

    public let audience: TrustRootAudience
    public let purpose: TrustRootPurpose
    public let expectedUID: UInt32
    public let enrollmentID: CanonicalBytes32
    public let approvedCommit: CanonicalBytes20
    public let approvedTree: CanonicalBytes20
    public let sourceManifestSHA256: CanonicalBytes32
    public let supervisorArtifactSHA256: CanonicalBytes32
    public let childArtifactSHA256: CanonicalBytes32
    public let runtimeClosureSHA256: CanonicalBytes32
    public let notBeforeUnixSeconds: UInt64
    public let expiresAtUnixSeconds: UInt64

    public init(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        expectedUID: UInt32,
        enrollmentID: CanonicalBytes32,
        approvedCommit: CanonicalBytes20,
        approvedTree: CanonicalBytes20,
        sourceManifestSHA256: CanonicalBytes32,
        supervisorArtifactSHA256: CanonicalBytes32,
        childArtifactSHA256: CanonicalBytes32,
        runtimeClosureSHA256: CanonicalBytes32,
        notBeforeUnixSeconds: UInt64,
        expiresAtUnixSeconds: UInt64
    ) throws {
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            expectedUID > 0,
            !enrollmentID.isAllZero,
            !approvedCommit.isAllZero,
            !approvedTree.isAllZero,
            !sourceManifestSHA256.isAllZero,
            !supervisorArtifactSHA256.isAllZero,
            !childArtifactSHA256.isAllZero,
            !runtimeClosureSHA256.isAllZero,
            notBeforeUnixSeconds > 0,
            notBeforeUnixSeconds < expiresAtUnixSeconds
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }

        self.audience = audience
        self.purpose = purpose
        self.expectedUID = expectedUID
        self.enrollmentID = enrollmentID
        self.approvedCommit = approvedCommit
        self.approvedTree = approvedTree
        self.sourceManifestSHA256 = sourceManifestSHA256
        self.supervisorArtifactSHA256 = supervisorArtifactSHA256
        self.childArtifactSHA256 = childArtifactSHA256
        self.runtimeClosureSHA256 = runtimeClosureSHA256
        self.notBeforeUnixSeconds = notBeforeUnixSeconds
        self.expiresAtUnixSeconds = expiresAtUnixSeconds
    }

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(expectedUID)
        encoder.append(enrollmentID.bytes)
        encoder.append(approvedCommit.bytes)
        encoder.append(approvedTree.bytes)
        encoder.append(sourceManifestSHA256.bytes)
        encoder.append(supervisorArtifactSHA256.bytes)
        encoder.append(childArtifactSHA256.bytes)
        encoder.append(runtimeClosureSHA256.bytes)
        encoder.append(notBeforeUnixSeconds)
        encoder.append(expiresAtUnixSeconds)
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

            let record = try Self(
                audience: audience,
                purpose: purpose,
                expectedUID: try decoder.readUInt32(),
                enrollmentID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                approvedCommit: CanonicalBytes20(
                    try decoder.readBytes(count: 20)
                ),
                approvedTree: CanonicalBytes20(
                    try decoder.readBytes(count: 20)
                ),
                sourceManifestSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                supervisorArtifactSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                childArtifactSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                runtimeClosureSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                notBeforeUnixSeconds: try decoder.readUInt64(),
                expiresAtUnixSeconds: try decoder.readUInt64()
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
