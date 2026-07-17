public enum InstallPolicyPurpose: UInt8, Equatable, Sendable {
    case externalTrustRootPair = 1
}

private struct FixedInstallPathPolicy {
    let pathUTF8: [UInt8]
    let kind: UInt8
    let ownerUID: UInt32
    let ownerGID: UInt32
    let mode: UInt32
    let linkPolicy: UInt8
    let exactLinkCount: UInt32
}

public struct InstallPolicyRecordV1: Equatable, Sendable {
    public static let canonicalByteCount = 980
    public static let canonicalPathCount = 9
    public static let supervisorInstallPath =
        "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7"
        + "/ExternalTrustRoot/v1/bin/floodgate-v7-trust-root-supervisor"
    public static let verifierInstallPath =
        "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7"
        + "/ExternalTrustRoot/v1/bin/floodgate-v7-trust-root-verifier"

    private static let magic: [UInt8] =
        Array("FGV7INP1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0
    private static let requireNoFollow: UInt8 = 1
    private static let requireSameDevice: UInt8 = 1
    private static let requireLocalFilesystem: UInt8 = 1
    private static let allowedWritableACLEntryCount: UInt32 = 0
    private static let directoryKind: UInt8 = 1
    private static let regularFileKind: UInt8 = 2
    private static let positiveStableLinkCount: UInt8 = 1
    private static let exactLinkCount: UInt8 = 2

    private static let fixedPathPolicies: [FixedInstallPathPolicy] = [
        FixedInstallPathPolicy(
            pathUTF8: Array("/".utf8),
            kind: directoryKind,
            ownerUID: 0,
            ownerGID: 0,
            mode: 0o755,
            linkPolicy: positiveStableLinkCount,
            exactLinkCount: 0
        ),
        FixedInstallPathPolicy(
            pathUTF8: Array("/Library".utf8),
            kind: directoryKind,
            ownerUID: 0,
            ownerGID: 0,
            mode: 0o755,
            linkPolicy: positiveStableLinkCount,
            exactLinkCount: 0
        ),
        FixedInstallPathPolicy(
            pathUTF8: Array("/Library/Application Support".utf8),
            kind: directoryKind,
            ownerUID: 0,
            ownerGID: 80,
            mode: 0o755,
            linkPolicy: positiveStableLinkCount,
            exactLinkCount: 0
        ),
        FixedInstallPathPolicy(
            pathUTF8: Array(
                (
                    "/Library/Application Support"
                        + "/com.gomyway1216.shogi-floodgate-v7"
                ).utf8
            ),
            kind: directoryKind,
            ownerUID: 0,
            ownerGID: 0,
            mode: 0o755,
            linkPolicy: positiveStableLinkCount,
            exactLinkCount: 0
        ),
        FixedInstallPathPolicy(
            pathUTF8: Array(
                (
                    "/Library/Application Support"
                        + "/com.gomyway1216.shogi-floodgate-v7"
                        + "/ExternalTrustRoot"
                ).utf8
            ),
            kind: directoryKind,
            ownerUID: 0,
            ownerGID: 0,
            mode: 0o755,
            linkPolicy: positiveStableLinkCount,
            exactLinkCount: 0
        ),
        FixedInstallPathPolicy(
            pathUTF8: Array(
                (
                    "/Library/Application Support"
                        + "/com.gomyway1216.shogi-floodgate-v7"
                        + "/ExternalTrustRoot/v1"
                ).utf8
            ),
            kind: directoryKind,
            ownerUID: 0,
            ownerGID: 0,
            mode: 0o755,
            linkPolicy: positiveStableLinkCount,
            exactLinkCount: 0
        ),
        FixedInstallPathPolicy(
            pathUTF8: Array(
                (
                    "/Library/Application Support"
                        + "/com.gomyway1216.shogi-floodgate-v7"
                        + "/ExternalTrustRoot/v1/bin"
                ).utf8
            ),
            kind: directoryKind,
            ownerUID: 0,
            ownerGID: 0,
            mode: 0o755,
            linkPolicy: positiveStableLinkCount,
            exactLinkCount: 0
        ),
        FixedInstallPathPolicy(
            pathUTF8: Array(supervisorInstallPath.utf8),
            kind: regularFileKind,
            ownerUID: 0,
            ownerGID: 0,
            mode: 0o555,
            linkPolicy: exactLinkCount,
            exactLinkCount: 1
        ),
        FixedInstallPathPolicy(
            pathUTF8: Array(verifierInstallPath.utf8),
            kind: regularFileKind,
            ownerUID: 0,
            ownerGID: 0,
            mode: 0o555,
            linkPolicy: exactLinkCount,
            exactLinkCount: 1
        ),
    ]

    public let audience: TrustRootAudience
    public let purpose: InstallPolicyPurpose
    public let recordID: CanonicalBytes32
    public let artifactClosureRecordSHA256: CanonicalBytes32
    public let supervisorWholeFileSHA256: CanonicalBytes32
    public let verifierWholeFileSHA256: CanonicalBytes32
    public let filesystemIdentityPolicySHA256: CanonicalBytes32
    public let aclPolicySHA256: CanonicalBytes32

    public init(
        audience: TrustRootAudience,
        purpose: InstallPolicyPurpose,
        recordID: CanonicalBytes32,
        artifactClosureRecordSHA256: CanonicalBytes32,
        supervisorWholeFileSHA256: CanonicalBytes32,
        verifierWholeFileSHA256: CanonicalBytes32,
        filesystemIdentityPolicySHA256: CanonicalBytes32,
        aclPolicySHA256: CanonicalBytes32
    ) throws {
        guard
            audience == .productionRecovery,
            purpose == .externalTrustRootPair,
            !recordID.isAllZero,
            !artifactClosureRecordSHA256.isAllZero,
            !supervisorWholeFileSHA256.isAllZero,
            !verifierWholeFileSHA256.isAllZero,
            supervisorWholeFileSHA256 != verifierWholeFileSHA256,
            !filesystemIdentityPolicySHA256.isAllZero,
            !aclPolicySHA256.isAllZero
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }

        self.audience = audience
        self.purpose = purpose
        self.recordID = recordID
        self.artifactClosureRecordSHA256 =
            artifactClosureRecordSHA256
        self.supervisorWholeFileSHA256 =
            supervisorWholeFileSHA256
        self.verifierWholeFileSHA256 =
            verifierWholeFileSHA256
        self.filesystemIdentityPolicySHA256 =
            filesystemIdentityPolicySHA256
        self.aclPolicySHA256 = aclPolicySHA256
    }

    public func canonicalBytes() -> [UInt8] {
        precondition(Self.fixedPathPolicies.count == Self.canonicalPathCount)
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(UInt8(Self.canonicalPathCount))
        encoder.append(Self.requireNoFollow)
        encoder.append(Self.requireSameDevice)
        encoder.append(Self.requireLocalFilesystem)
        encoder.append(Self.allowedWritableACLEntryCount)
        encoder.append(recordID.bytes)
        encoder.append(artifactClosureRecordSHA256.bytes)
        encoder.append(supervisorWholeFileSHA256.bytes)
        encoder.append(verifierWholeFileSHA256.bytes)
        encoder.append(filesystemIdentityPolicySHA256.bytes)
        encoder.append(aclPolicySHA256.bytes)
        for policy in Self.fixedPathPolicies {
            precondition(policy.pathUTF8.count <= Int(UInt8.max))
            encoder.append(UInt8(policy.pathUTF8.count))
            encoder.append(policy.pathUTF8)
            encoder.append(policy.kind)
            encoder.append(policy.ownerUID)
            encoder.append(policy.ownerGID)
            encoder.append(policy.mode)
            encoder.append(policy.linkPolicy)
            encoder.append(policy.exactLinkCount)
        }
        precondition(encoder.bytes.count == Self.canonicalByteCount)
        return encoder.bytes
    }

    public func canonicalSHA256() -> CanonicalBytes32 {
        CanonicalSHA256.digest(canonicalBytes())
    }

    public static func decodeCanonical(_ bytes: [UInt8]) throws -> Self {
        do {
            guard
                bytes.count == canonicalByteCount,
                fixedPathPolicies.count == canonicalPathCount
            else {
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
                let purpose = InstallPolicyPurpose(
                    rawValue: try decoder.readByte()
                ),
                try decoder.readByte() == UInt8(canonicalPathCount),
                try decoder.readByte() == requireNoFollow,
                try decoder.readByte() == requireSameDevice,
                try decoder.readByte() == requireLocalFilesystem,
                try decoder.readUInt32()
                    == allowedWritableACLEntryCount
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }

            let record = try Self(
                audience: audience,
                purpose: purpose,
                recordID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                artifactClosureRecordSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                supervisorWholeFileSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                verifierWholeFileSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                filesystemIdentityPolicySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                aclPolicySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                )
            )

            for policy in fixedPathPolicies {
                guard
                    try decoder.readByte()
                        == UInt8(policy.pathUTF8.count),
                    try decoder.readBytes(count: policy.pathUTF8.count)
                        == policy.pathUTF8,
                    try decoder.readByte() == policy.kind,
                    try decoder.readUInt32() == policy.ownerUID,
                    try decoder.readUInt32() == policy.ownerGID,
                    try decoder.readUInt32() == policy.mode,
                    try decoder.readByte() == policy.linkPolicy,
                    try decoder.readUInt32() == policy.exactLinkCount
                else {
                    throw CanonicalRecordError.invalidCanonicalRecord
                }
            }
            guard decoder.isAtEnd else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return record
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }

    public func validateArtifactClosure(
        _ artifactClosure: ArtifactClosureRecordV1
    ) throws {
        guard
            artifactClosureRecordSHA256
                == artifactClosure.canonicalSHA256(),
            supervisorWholeFileSHA256
                == artifactClosure.supervisorWholeFileSHA256,
            verifierWholeFileSHA256
                == artifactClosure.verifierWholeFileSHA256
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}
