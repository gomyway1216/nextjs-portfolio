private let runtimeRootPath =
    "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7"
    + "/ExternalTrustRoot/v1/runtime"

public struct FixedArgvRecordV1: Equatable, Sendable {
    public static let canonicalByteCount = 265
    public static let nodeExecutablePath =
        runtimeRootPath + "/bin/node"
    public static let diagnosticEntryBundlePath =
        runtimeRootPath
        + "/lib/floodgate-v7-stable-deadline-diagnostic.cjs"

    private static let magic = Array("FGV7ARV1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0
    private static let argumentCount: UInt32 = 2
    private static let arguments = [
        Array(nodeExecutablePath.utf8),
        Array(diagnosticEntryBundlePath.utf8),
    ]

    public init() {}

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(TrustRootAudience.productionRecovery.rawValue)
        encoder.append(TrustRootPurpose.inspectStalePrefix100.rawValue)
        encoder.append(Self.argumentCount)
        for argument in Self.arguments {
            encoder.append(UInt32(argument.count))
            encoder.append(argument)
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
                try decoder.readByte()
                    == TrustRootAudience.productionRecovery.rawValue,
                try decoder.readByte()
                    == TrustRootPurpose.inspectStalePrefix100.rawValue,
                try decoder.readUInt32() == argumentCount
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            for argument in arguments {
                guard
                    try decoder.readUInt32() == UInt32(argument.count),
                    try decoder.readBytes(count: argument.count)
                        == argument
                else {
                    throw CanonicalRecordError.invalidCanonicalRecord
                }
            }
            guard decoder.isAtEnd else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return Self()
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}

public struct FixedWorkingDirectoryRecordV1: Equatable, Sendable {
    public static let canonicalByteCount = 17
    public static let workingDirectoryPath = "/"

    private static let magic = Array("FGV7CWD1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0
    private static let pathUTF8 = Array(workingDirectoryPath.utf8)

    public init() {}

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(TrustRootAudience.productionRecovery.rawValue)
        encoder.append(TrustRootPurpose.inspectStalePrefix100.rawValue)
        encoder.append(UInt32(Self.pathUTF8.count))
        encoder.append(Self.pathUTF8)
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
                try decoder.readByte()
                    == TrustRootAudience.productionRecovery.rawValue,
                try decoder.readByte()
                    == TrustRootPurpose.inspectStalePrefix100.rawValue,
                try decoder.readUInt32() == UInt32(pathUTF8.count),
                try decoder.readBytes(count: pathUTF8.count)
                    == pathUTF8,
                decoder.isAtEnd
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return Self()
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}

public struct FixedEnvironmentRecordV1: Equatable, Sendable {
    public static let canonicalByteCount = 16

    private static let magic = Array("FGV7ENV1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0
    private static let entryCount: UInt32 = 0

    public init() {}

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(TrustRootAudience.productionRecovery.rawValue)
        encoder.append(TrustRootPurpose.inspectStalePrefix100.rawValue)
        encoder.append(Self.entryCount)
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
                try decoder.readByte()
                    == TrustRootAudience.productionRecovery.rawValue,
                try decoder.readByte()
                    == TrustRootPurpose.inspectStalePrefix100.rawValue,
                try decoder.readUInt32() == entryCount,
                decoder.isAtEnd
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return Self()
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}

private struct FixedRuntimeInstallPathPolicy {
    let pathUTF8: [UInt8]
    let kind: UInt8
    let ownerUID: UInt32
    let ownerGID: UInt32
    let mode: UInt32
    let linkPolicy: UInt8
    let exactLinkCount: UInt32
}

public struct RuntimeInstallPolicyRecordV1: Equatable, Sendable {
    public static let canonicalByteCount = 1_307
    public static let canonicalPathCount = 11
    public static let nodeExecutablePath =
        FixedArgvRecordV1.nodeExecutablePath
    public static let diagnosticEntryBundlePath =
        FixedArgvRecordV1.diagnosticEntryBundlePath

    private static let magic = Array("FGV7RIP1".utf8)
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
    private static let runtimeRoot = runtimeRootPath

    private static func directory(
        _ path: String,
        ownerGID: UInt32 = 0
    ) -> FixedRuntimeInstallPathPolicy {
        FixedRuntimeInstallPathPolicy(
            pathUTF8: Array(path.utf8),
            kind: directoryKind,
            ownerUID: 0,
            ownerGID: ownerGID,
            mode: 0o755,
            linkPolicy: positiveStableLinkCount,
            exactLinkCount: 0
        )
    }

    private static func regularFile(
        _ path: String,
        mode: UInt32
    ) -> FixedRuntimeInstallPathPolicy {
        FixedRuntimeInstallPathPolicy(
            pathUTF8: Array(path.utf8),
            kind: regularFileKind,
            ownerUID: 0,
            ownerGID: 0,
            mode: mode,
            linkPolicy: exactLinkCount,
            exactLinkCount: 1
        )
    }

    private static let fixedPathPolicies = [
        directory("/"),
        directory("/Library"),
        directory("/Library/Application Support", ownerGID: 80),
        directory(
            "/Library/Application Support"
                + "/com.gomyway1216.shogi-floodgate-v7"
        ),
        directory(
            "/Library/Application Support"
                + "/com.gomyway1216.shogi-floodgate-v7"
                + "/ExternalTrustRoot"
        ),
        directory(
            "/Library/Application Support"
                + "/com.gomyway1216.shogi-floodgate-v7"
                + "/ExternalTrustRoot/v1"
        ),
        directory(runtimeRoot),
        directory(runtimeRoot + "/bin"),
        regularFile(nodeExecutablePath, mode: 0o555),
        directory(runtimeRoot + "/lib"),
        regularFile(diagnosticEntryBundlePath, mode: 0o444),
    ]

    public let audience: TrustRootAudience
    public let purpose: TrustRootPurpose
    public let recordID: CanonicalBytes32
    public let nodeWholeFileSHA256: CanonicalBytes32
    public let nodeCodeDirectorySHA256: CanonicalBytes32
    public let nodeDesignatedRequirementSHA256: CanonicalBytes32
    public let nodeHeldExecutableIdentitySHA256: CanonicalBytes32
    public let diagnosticEntryBundleWholeFileSHA256: CanonicalBytes32
    public let diagnosticEntryBundleHeldFileIdentitySHA256: CanonicalBytes32
    public let filesystemIdentityPolicySHA256: CanonicalBytes32
    public let aclPolicySHA256: CanonicalBytes32

    public init(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        recordID: CanonicalBytes32,
        nodeWholeFileSHA256: CanonicalBytes32,
        nodeCodeDirectorySHA256: CanonicalBytes32,
        nodeDesignatedRequirementSHA256: CanonicalBytes32,
        nodeHeldExecutableIdentitySHA256: CanonicalBytes32,
        diagnosticEntryBundleWholeFileSHA256: CanonicalBytes32,
        diagnosticEntryBundleHeldFileIdentitySHA256: CanonicalBytes32,
        filesystemIdentityPolicySHA256: CanonicalBytes32,
        aclPolicySHA256: CanonicalBytes32
    ) throws {
        let requiredDigests = [
            recordID,
            nodeWholeFileSHA256,
            nodeCodeDirectorySHA256,
            nodeDesignatedRequirementSHA256,
            nodeHeldExecutableIdentitySHA256,
            diagnosticEntryBundleWholeFileSHA256,
            diagnosticEntryBundleHeldFileIdentitySHA256,
            filesystemIdentityPolicySHA256,
            aclPolicySHA256,
        ]
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            requiredDigests.allSatisfy({ !$0.isAllZero }),
            Set(requiredDigests).count == requiredDigests.count
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.audience = audience
        self.purpose = purpose
        self.recordID = recordID
        self.nodeWholeFileSHA256 = nodeWholeFileSHA256
        self.nodeCodeDirectorySHA256 = nodeCodeDirectorySHA256
        self.nodeDesignatedRequirementSHA256 =
            nodeDesignatedRequirementSHA256
        self.nodeHeldExecutableIdentitySHA256 =
            nodeHeldExecutableIdentitySHA256
        self.diagnosticEntryBundleWholeFileSHA256 =
            diagnosticEntryBundleWholeFileSHA256
        self.diagnosticEntryBundleHeldFileIdentitySHA256 =
            diagnosticEntryBundleHeldFileIdentitySHA256
        self.filesystemIdentityPolicySHA256 =
            filesystemIdentityPolicySHA256
        self.aclPolicySHA256 = aclPolicySHA256
    }

    public func canonicalBytes() -> [UInt8] {
        precondition(
            Self.fixedPathPolicies.count == Self.canonicalPathCount
        )
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
        for digest in [
            recordID,
            nodeWholeFileSHA256,
            nodeCodeDirectorySHA256,
            nodeDesignatedRequirementSHA256,
            nodeHeldExecutableIdentitySHA256,
            diagnosticEntryBundleWholeFileSHA256,
            diagnosticEntryBundleHeldFileIdentitySHA256,
            filesystemIdentityPolicySHA256,
            aclPolicySHA256,
        ] {
            encoder.append(digest.bytes)
        }
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
                let purpose = TrustRootPurpose(
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
                nodeWholeFileSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                nodeCodeDirectorySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                nodeDesignatedRequirementSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                nodeHeldExecutableIdentitySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                diagnosticEntryBundleWholeFileSHA256:
                    CanonicalBytes32(
                        try decoder.readBytes(count: 32)
                    ),
                diagnosticEntryBundleHeldFileIdentitySHA256:
                    CanonicalBytes32(
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
}
