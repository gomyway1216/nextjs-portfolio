public enum ReleaseToolchainPurpose: UInt8, Equatable, Sendable {
    case externalTrustRootPair = 1
}

public struct ReleaseToolchainRecordV1: Equatable, Sendable {
    public static let canonicalByteCount = 798

    public static let expectedXcodeVersionMajor: UInt8 = 15
    public static let expectedXcodeVersionMinor: UInt8 = 3
    public static let expectedXcodeVersionPatch: UInt8 = 0
    public static let expectedXcodeBuildIdentifier: [UInt8] =
        Array("15E204a".utf8)
    public static let supportedBuildHostMinimumMajor: UInt8 = 14
    public static let supportedBuildHostMinimumMinor: UInt8 = 0
    public static let supportedBuildHostMinimumPatch: UInt8 = 0
    public static let supportedBuildHostMaximumExclusiveMajor: UInt8 = 15
    public static let supportedBuildHostMaximumExclusiveMinor: UInt8 = 0
    public static let supportedBuildHostMaximumExclusivePatch: UInt8 = 0
    public static let requiredToolchainOwnerUID: UInt32 = 0
    public static let requiredToolchainOwnerGID: UInt32 = 0
    public static let requiredToolchainDirectoryMode: UInt32 = 0o755

    private static let magic: [UInt8] =
        Array("FGV7RTL1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0
    private static let finalAppleReleaseCatalogChannel: UInt8 = 1
    private static let buildIdentifierSlotByteCount = 15
    private static let targetMacOS: UInt8 = 1
    private static let targetArm64: UInt8 = 1
    private static let swift5LanguageMode: UInt8 = 1
    private static let requiredCleanBuildCount: UInt8 = 2
    private static let requiredImmutableToolchainClosure: UInt8 = 1
    private static let allowedWritableACLEntryCount: UInt32 = 0
    private static let requiredNetworkAccessCount: UInt32 = 0
    private static let requiredPluginCount: UInt32 = 0
    private static let requiredExternalDependencyCount: UInt32 = 0

    public let audience: TrustRootAudience
    public let purpose: ReleaseToolchainPurpose
    public let buildHostVersionMajor: UInt8
    public let buildHostVersionMinor: UInt8
    public let buildHostVersionPatch: UInt8
    public let recordID: CanonicalBytes32
    public let finalReleaseCatalogEvidenceSHA256: CanonicalBytes32
    public let xcodeArchiveSHA256: CanonicalBytes32
    public let xcodeDesignatedRequirementSHA256: CanonicalBytes32
    public let xcodeCDHash: CanonicalBytes20
    public let developerDirectorySHA256: CanonicalBytes32
    public let toolManifestSHA256: CanonicalBytes32
    public let xcodebuildVersionOutputSHA256: CanonicalBytes32
    public let swiftVersionOutputSHA256: CanonicalBytes32
    public let clangVersionOutputSHA256: CanonicalBytes32
    public let ldVersionOutputSHA256: CanonicalBytes32
    public let sdkManifestSHA256: CanonicalBytes32
    public let hostIdentitySHA256: CanonicalBytes32
    public let targetTripleSHA256: CanonicalBytes32
    public let languageModeSHA256: CanonicalBytes32
    public let buildArgumentsSHA256: CanonicalBytes32
    public let buildEnvironmentSHA256: CanonicalBytes32
    public let sourceClosureSHA256: CanonicalBytes32
    public let buildRecipeSHA256: CanonicalBytes32
    public let preBuildIdentitySHA256: CanonicalBytes32
    public let postBuildIdentitySHA256: CanonicalBytes32
    public let firstUnsignedBuildSHA256: CanonicalBytes32
    public let secondUnsignedBuildSHA256: CanonicalBytes32

    public init(
        audience: TrustRootAudience,
        purpose: ReleaseToolchainPurpose,
        buildHostVersionMajor: UInt8,
        buildHostVersionMinor: UInt8,
        buildHostVersionPatch: UInt8,
        recordID: CanonicalBytes32,
        finalReleaseCatalogEvidenceSHA256: CanonicalBytes32,
        xcodeArchiveSHA256: CanonicalBytes32,
        xcodeDesignatedRequirementSHA256: CanonicalBytes32,
        xcodeCDHash: CanonicalBytes20,
        developerDirectorySHA256: CanonicalBytes32,
        toolManifestSHA256: CanonicalBytes32,
        xcodebuildVersionOutputSHA256: CanonicalBytes32,
        swiftVersionOutputSHA256: CanonicalBytes32,
        clangVersionOutputSHA256: CanonicalBytes32,
        ldVersionOutputSHA256: CanonicalBytes32,
        sdkManifestSHA256: CanonicalBytes32,
        hostIdentitySHA256: CanonicalBytes32,
        targetTripleSHA256: CanonicalBytes32,
        languageModeSHA256: CanonicalBytes32,
        buildArgumentsSHA256: CanonicalBytes32,
        buildEnvironmentSHA256: CanonicalBytes32,
        sourceClosureSHA256: CanonicalBytes32,
        buildRecipeSHA256: CanonicalBytes32,
        preBuildIdentitySHA256: CanonicalBytes32,
        postBuildIdentitySHA256: CanonicalBytes32,
        firstUnsignedBuildSHA256: CanonicalBytes32,
        secondUnsignedBuildSHA256: CanonicalBytes32
    ) throws {
        let requiredDigests = [
            recordID,
            finalReleaseCatalogEvidenceSHA256,
            xcodeArchiveSHA256,
            xcodeDesignatedRequirementSHA256,
            developerDirectorySHA256,
            toolManifestSHA256,
            xcodebuildVersionOutputSHA256,
            swiftVersionOutputSHA256,
            clangVersionOutputSHA256,
            ldVersionOutputSHA256,
            sdkManifestSHA256,
            hostIdentitySHA256,
            targetTripleSHA256,
            languageModeSHA256,
            buildArgumentsSHA256,
            buildEnvironmentSHA256,
            sourceClosureSHA256,
            buildRecipeSHA256,
            preBuildIdentitySHA256,
            postBuildIdentitySHA256,
            firstUnsignedBuildSHA256,
            secondUnsignedBuildSHA256,
        ]
        guard
            audience == .productionRecovery,
            purpose == .externalTrustRootPair,
            Self.isSupportedBuildHost(
                major: buildHostVersionMajor,
                minor: buildHostVersionMinor,
                patch: buildHostVersionPatch
            ),
            requiredDigests.allSatisfy({ !$0.isAllZero }),
            !xcodeCDHash.isAllZero,
            preBuildIdentitySHA256 == postBuildIdentitySHA256,
            firstUnsignedBuildSHA256 == secondUnsignedBuildSHA256
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }

        self.audience = audience
        self.purpose = purpose
        self.buildHostVersionMajor = buildHostVersionMajor
        self.buildHostVersionMinor = buildHostVersionMinor
        self.buildHostVersionPatch = buildHostVersionPatch
        self.recordID = recordID
        self.finalReleaseCatalogEvidenceSHA256 =
            finalReleaseCatalogEvidenceSHA256
        self.xcodeArchiveSHA256 = xcodeArchiveSHA256
        self.xcodeDesignatedRequirementSHA256 =
            xcodeDesignatedRequirementSHA256
        self.xcodeCDHash = xcodeCDHash
        self.developerDirectorySHA256 = developerDirectorySHA256
        self.toolManifestSHA256 = toolManifestSHA256
        self.xcodebuildVersionOutputSHA256 =
            xcodebuildVersionOutputSHA256
        self.swiftVersionOutputSHA256 = swiftVersionOutputSHA256
        self.clangVersionOutputSHA256 = clangVersionOutputSHA256
        self.ldVersionOutputSHA256 = ldVersionOutputSHA256
        self.sdkManifestSHA256 = sdkManifestSHA256
        self.hostIdentitySHA256 = hostIdentitySHA256
        self.targetTripleSHA256 = targetTripleSHA256
        self.languageModeSHA256 = languageModeSHA256
        self.buildArgumentsSHA256 = buildArgumentsSHA256
        self.buildEnvironmentSHA256 = buildEnvironmentSHA256
        self.sourceClosureSHA256 = sourceClosureSHA256
        self.buildRecipeSHA256 = buildRecipeSHA256
        self.preBuildIdentitySHA256 = preBuildIdentitySHA256
        self.postBuildIdentitySHA256 = postBuildIdentitySHA256
        self.firstUnsignedBuildSHA256 = firstUnsignedBuildSHA256
        self.secondUnsignedBuildSHA256 = secondUnsignedBuildSHA256
    }

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(Self.finalAppleReleaseCatalogChannel)
        encoder.append(Self.expectedXcodeVersionMajor)
        encoder.append(Self.expectedXcodeVersionMinor)
        encoder.append(Self.expectedXcodeVersionPatch)
        precondition(
            Self.expectedXcodeBuildIdentifier.count
                <= Self.buildIdentifierSlotByteCount,
            "Xcode build identifier exceeds slot size"
        )
        encoder.append(UInt8(Self.expectedXcodeBuildIdentifier.count))
        encoder.append(Self.expectedXcodeBuildIdentifier)
        encoder.append(
            Array(
                repeating: UInt8(0),
                count: Self.buildIdentifierSlotByteCount
                    - Self.expectedXcodeBuildIdentifier.count
            )
        )
        encoder.append(buildHostVersionMajor)
        encoder.append(buildHostVersionMinor)
        encoder.append(buildHostVersionPatch)
        encoder.append(Self.supportedBuildHostMinimumMajor)
        encoder.append(Self.supportedBuildHostMinimumMinor)
        encoder.append(Self.supportedBuildHostMinimumPatch)
        encoder.append(Self.supportedBuildHostMaximumExclusiveMajor)
        encoder.append(Self.supportedBuildHostMaximumExclusiveMinor)
        encoder.append(Self.supportedBuildHostMaximumExclusivePatch)
        encoder.append(Self.targetMacOS)
        encoder.append(Self.targetArm64)
        encoder.append(Self.swift5LanguageMode)
        encoder.append(Self.requiredCleanBuildCount)
        encoder.append(Self.requiredToolchainOwnerUID)
        encoder.append(Self.requiredToolchainOwnerGID)
        encoder.append(Self.requiredToolchainDirectoryMode)
        encoder.append(Self.requiredImmutableToolchainClosure)
        encoder.append(Self.allowedWritableACLEntryCount)
        encoder.append(Self.requiredNetworkAccessCount)
        encoder.append(Self.requiredPluginCount)
        encoder.append(Self.requiredExternalDependencyCount)
        encoder.append(recordID.bytes)
        encoder.append(finalReleaseCatalogEvidenceSHA256.bytes)
        encoder.append(xcodeArchiveSHA256.bytes)
        encoder.append(xcodeDesignatedRequirementSHA256.bytes)
        encoder.append(xcodeCDHash.bytes)
        encoder.append(developerDirectorySHA256.bytes)
        encoder.append(toolManifestSHA256.bytes)
        encoder.append(xcodebuildVersionOutputSHA256.bytes)
        encoder.append(swiftVersionOutputSHA256.bytes)
        encoder.append(clangVersionOutputSHA256.bytes)
        encoder.append(ldVersionOutputSHA256.bytes)
        encoder.append(sdkManifestSHA256.bytes)
        encoder.append(hostIdentitySHA256.bytes)
        encoder.append(targetTripleSHA256.bytes)
        encoder.append(languageModeSHA256.bytes)
        encoder.append(buildArgumentsSHA256.bytes)
        encoder.append(buildEnvironmentSHA256.bytes)
        encoder.append(sourceClosureSHA256.bytes)
        encoder.append(buildRecipeSHA256.bytes)
        encoder.append(preBuildIdentitySHA256.bytes)
        encoder.append(postBuildIdentitySHA256.bytes)
        encoder.append(firstUnsignedBuildSHA256.bytes)
        encoder.append(secondUnsignedBuildSHA256.bytes)
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
            let buildIdentifierCount = expectedXcodeBuildIdentifier.count
            guard buildIdentifierCount <= buildIdentifierSlotByteCount else {
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
                let purpose = ReleaseToolchainPurpose(
                    rawValue: try decoder.readByte()
                ),
                try decoder.readByte() == finalAppleReleaseCatalogChannel,
                try decoder.readByte() == expectedXcodeVersionMajor,
                try decoder.readByte() == expectedXcodeVersionMinor,
                try decoder.readByte() == expectedXcodeVersionPatch,
                try decoder.readByte()
                    == UInt8(buildIdentifierCount)
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }

            let buildIdentifierSlot = try decoder.readBytes(
                count: buildIdentifierSlotByteCount
            )
            guard
                Array(buildIdentifierSlot[..<buildIdentifierCount])
                    == expectedXcodeBuildIdentifier,
                buildIdentifierSlot[buildIdentifierCount...]
                    .allSatisfy({ $0 == 0 })
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }

            let buildHostVersionMajor = try decoder.readByte()
            let buildHostVersionMinor = try decoder.readByte()
            let buildHostVersionPatch = try decoder.readByte()
            guard
                try decoder.readByte()
                    == supportedBuildHostMinimumMajor,
                try decoder.readByte()
                    == supportedBuildHostMinimumMinor,
                try decoder.readByte()
                    == supportedBuildHostMinimumPatch,
                try decoder.readByte()
                    == supportedBuildHostMaximumExclusiveMajor,
                try decoder.readByte()
                    == supportedBuildHostMaximumExclusiveMinor,
                try decoder.readByte()
                    == supportedBuildHostMaximumExclusivePatch,
                try decoder.readByte() == targetMacOS,
                try decoder.readByte() == targetArm64,
                try decoder.readByte() == swift5LanguageMode,
                try decoder.readByte() == requiredCleanBuildCount,
                try decoder.readUInt32() == requiredToolchainOwnerUID,
                try decoder.readUInt32() == requiredToolchainOwnerGID,
                try decoder.readUInt32()
                    == requiredToolchainDirectoryMode,
                try decoder.readByte()
                    == requiredImmutableToolchainClosure,
                try decoder.readUInt32()
                    == allowedWritableACLEntryCount,
                try decoder.readUInt32() == requiredNetworkAccessCount,
                try decoder.readUInt32() == requiredPluginCount,
                try decoder.readUInt32()
                    == requiredExternalDependencyCount
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }

            let record = try Self(
                audience: audience,
                purpose: purpose,
                buildHostVersionMajor: buildHostVersionMajor,
                buildHostVersionMinor: buildHostVersionMinor,
                buildHostVersionPatch: buildHostVersionPatch,
                recordID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                finalReleaseCatalogEvidenceSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                xcodeArchiveSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                xcodeDesignatedRequirementSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                xcodeCDHash: CanonicalBytes20(
                    try decoder.readBytes(count: 20)
                ),
                developerDirectorySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                toolManifestSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                xcodebuildVersionOutputSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                swiftVersionOutputSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                clangVersionOutputSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                ldVersionOutputSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                sdkManifestSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                hostIdentitySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                targetTripleSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                languageModeSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                buildArgumentsSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                buildEnvironmentSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                sourceClosureSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                buildRecipeSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                preBuildIdentitySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                postBuildIdentitySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                firstUnsignedBuildSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                secondUnsignedBuildSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                )
            )
            guard decoder.isAtEnd else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            return record
        } catch {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }

    private static func isSupportedBuildHost(
        major: UInt8,
        minor: UInt8,
        patch: UInt8
    ) -> Bool {
        let version = (UInt32(major) << 16)
            | (UInt32(minor) << 8)
            | UInt32(patch)
        let minimum = (UInt32(supportedBuildHostMinimumMajor) << 16)
            | (UInt32(supportedBuildHostMinimumMinor) << 8)
            | UInt32(supportedBuildHostMinimumPatch)
        let maximumExclusive =
            (UInt32(supportedBuildHostMaximumExclusiveMajor) << 16)
            | (UInt32(supportedBuildHostMaximumExclusiveMinor) << 8)
            | UInt32(supportedBuildHostMaximumExclusivePatch)
        return minimum <= version && version < maximumExclusive
    }
}
