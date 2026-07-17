public enum ArtifactClosurePurpose: UInt8, Equatable, Sendable {
    case externalTrustRootPair = 1
}

public struct ArtifactClosureRecordV1: Equatable, Sendable {
    public static let canonicalByteCount = 993

    public static let requiredMinimumOSMajor: UInt8 = 13
    public static let requiredMinimumOSMinor: UInt8 = 0
    public static let requiredMinimumOSPatch: UInt8 = 0
    public static let requiredSDKMajor: UInt8 = 14
    public static let requiredSDKMinor: UInt8 = 4
    public static let requiredSDKPatch: UInt8 = 0

    private static let magic: [UInt8] =
        Array("FGV7ACL1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0
    private static let requiredExecutableCount: UInt8 = 2
    private static let thinMachO: UInt8 = 1
    private static let arm64Architecture: UInt8 = 1
    private static let machOExecuteFileType: UInt8 = 1
    private static let developerIDApplication: UInt8 = 1
    private static let requiredSecureTimestamp: UInt8 = 1
    private static let requiredHardenedRuntime: UInt8 = 1
    private static let requiredLibraryValidation: UInt8 = 1
    private static let signedFlatPackage: UInt8 = 1
    private static let requiredPackagePayloadExecutableCount: UInt8 = 2
    private static let developerIDInstaller: UInt8 = 1
    private static let requiredPackageSecureTimestamp: UInt8 = 1
    private static let requiredNotaryAccepted: UInt8 = 1
    private static let requiredStapledTicket: UInt8 = 1
    private static let requiredGatekeeperAcceptance: UInt8 = 1
    private static let allowedFatBinarySliceCount: UInt32 = 0
    private static let allowedRPathLoadCommandCount: UInt32 = 0
    private static let allowedRelativeLoadCount: UInt32 = 0
    private static let allowedNonSystemLoadCount: UInt32 = 0
    private static let allowedWeakLoadCount: UInt32 = 0
    private static let allowedReexportLoadCount: UInt32 = 0
    private static let allowedUpwardLoadCount: UInt32 = 0
    private static let allowedLazyLoadCount: UInt32 = 0
    private static let allowedDYLDEnvironmentEntryCount: UInt32 = 0
    private static let allowedPluginCount: UInt32 = 0
    private static let allowedPreloadCount: UInt32 = 0
    private static let allowedDangerousEntitlementCount: UInt32 = 0
    private static let allowedPackageScriptCount: UInt32 = 0
    private static let allowedCodeSigningWarningCount: UInt32 = 0
    private static let allowedNotaryWarningCount: UInt32 = 0
    private static let allowedStapleWarningCount: UInt32 = 0
    private static let allowedGatekeeperWarningCount: UInt32 = 0
    private static let requiredPayloadRegularFileCount: UInt32 = 2
    private static let allowedPayloadNonExecutableRegularFileCount: UInt32 = 0
    private static let allowedPayloadSymlinkCount: UInt32 = 0
    private static let allowedPayloadHardlinkAliasCount: UInt32 = 0
    private static let allowedPayloadSpecialFileCount: UInt32 = 0

    public let audience: TrustRootAudience
    public let purpose: ArtifactClosurePurpose
    public let recordID: CanonicalBytes32
    public let releaseToolchainRecordSHA256: CanonicalBytes32

    public let supervisorWholeFileSHA256: CanonicalBytes32
    public let supervisorSemanticMachOSHA256: CanonicalBytes32
    public let supervisorExecutableIdentifierSHA256: CanonicalBytes32
    public let supervisorDesignatedRequirementSHA256: CanonicalBytes32
    public let supervisorCodeDirectorySHA256: CanonicalBytes32
    public let supervisorCDHash: CanonicalBytes20
    public let supervisorDependencyClosureSHA256: CanonicalBytes32
    public let supervisorEntitlementPolicySHA256: CanonicalBytes32

    public let verifierWholeFileSHA256: CanonicalBytes32
    public let verifierSemanticMachOSHA256: CanonicalBytes32
    public let verifierExecutableIdentifierSHA256: CanonicalBytes32
    public let verifierDesignatedRequirementSHA256: CanonicalBytes32
    public let verifierCodeDirectorySHA256: CanonicalBytes32
    public let verifierCDHash: CanonicalBytes20
    public let verifierDependencyClosureSHA256: CanonicalBytes32
    public let verifierEntitlementPolicySHA256: CanonicalBytes32

    public let loadCommandPolicySHA256: CanonicalBytes32
    public let hardenedRuntimePolicySHA256: CanonicalBytes32
    public let libraryValidationPolicySHA256: CanonicalBytes32

    public let flatPackageWholeFileSHA256: CanonicalBytes32
    public let packagePayloadClosureSHA256: CanonicalBytes32
    public let installerSignatureIdentitySHA256: CanonicalBytes32
    public let notarizationSubmissionSHA256: CanonicalBytes32
    public let notarizationTicketSHA256: CanonicalBytes32
    public let stapledTicketSHA256: CanonicalBytes32
    public let gatekeeperAssessmentSHA256: CanonicalBytes32

    public init(
        audience: TrustRootAudience,
        purpose: ArtifactClosurePurpose,
        recordID: CanonicalBytes32,
        releaseToolchainRecordSHA256: CanonicalBytes32,
        supervisorWholeFileSHA256: CanonicalBytes32,
        supervisorSemanticMachOSHA256: CanonicalBytes32,
        supervisorExecutableIdentifierSHA256: CanonicalBytes32,
        supervisorDesignatedRequirementSHA256: CanonicalBytes32,
        supervisorCodeDirectorySHA256: CanonicalBytes32,
        supervisorCDHash: CanonicalBytes20,
        supervisorDependencyClosureSHA256: CanonicalBytes32,
        supervisorEntitlementPolicySHA256: CanonicalBytes32,
        verifierWholeFileSHA256: CanonicalBytes32,
        verifierSemanticMachOSHA256: CanonicalBytes32,
        verifierExecutableIdentifierSHA256: CanonicalBytes32,
        verifierDesignatedRequirementSHA256: CanonicalBytes32,
        verifierCodeDirectorySHA256: CanonicalBytes32,
        verifierCDHash: CanonicalBytes20,
        verifierDependencyClosureSHA256: CanonicalBytes32,
        verifierEntitlementPolicySHA256: CanonicalBytes32,
        loadCommandPolicySHA256: CanonicalBytes32,
        hardenedRuntimePolicySHA256: CanonicalBytes32,
        libraryValidationPolicySHA256: CanonicalBytes32,
        flatPackageWholeFileSHA256: CanonicalBytes32,
        packagePayloadClosureSHA256: CanonicalBytes32,
        installerSignatureIdentitySHA256: CanonicalBytes32,
        notarizationSubmissionSHA256: CanonicalBytes32,
        notarizationTicketSHA256: CanonicalBytes32,
        stapledTicketSHA256: CanonicalBytes32,
        gatekeeperAssessmentSHA256: CanonicalBytes32
    ) throws {
        let requiredDigests = [
            recordID,
            releaseToolchainRecordSHA256,
            supervisorWholeFileSHA256,
            supervisorSemanticMachOSHA256,
            supervisorExecutableIdentifierSHA256,
            supervisorDesignatedRequirementSHA256,
            supervisorCodeDirectorySHA256,
            supervisorDependencyClosureSHA256,
            supervisorEntitlementPolicySHA256,
            verifierWholeFileSHA256,
            verifierSemanticMachOSHA256,
            verifierExecutableIdentifierSHA256,
            verifierDesignatedRequirementSHA256,
            verifierCodeDirectorySHA256,
            verifierDependencyClosureSHA256,
            verifierEntitlementPolicySHA256,
            loadCommandPolicySHA256,
            hardenedRuntimePolicySHA256,
            libraryValidationPolicySHA256,
            flatPackageWholeFileSHA256,
            packagePayloadClosureSHA256,
            installerSignatureIdentitySHA256,
            notarizationSubmissionSHA256,
            notarizationTicketSHA256,
            stapledTicketSHA256,
            gatekeeperAssessmentSHA256,
        ]
        guard
            audience == .productionRecovery,
            purpose == .externalTrustRootPair,
            requiredDigests.allSatisfy({ !$0.isAllZero }),
            !supervisorCDHash.isAllZero,
            !verifierCDHash.isAllZero,
            supervisorWholeFileSHA256 != verifierWholeFileSHA256,
            supervisorSemanticMachOSHA256
                != verifierSemanticMachOSHA256,
            supervisorExecutableIdentifierSHA256
                != verifierExecutableIdentifierSHA256,
            supervisorDesignatedRequirementSHA256
                != verifierDesignatedRequirementSHA256,
            supervisorCodeDirectorySHA256
                != verifierCodeDirectorySHA256,
            supervisorCDHash != verifierCDHash
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }

        self.audience = audience
        self.purpose = purpose
        self.recordID = recordID
        self.releaseToolchainRecordSHA256 =
            releaseToolchainRecordSHA256
        self.supervisorWholeFileSHA256 =
            supervisorWholeFileSHA256
        self.supervisorSemanticMachOSHA256 =
            supervisorSemanticMachOSHA256
        self.supervisorExecutableIdentifierSHA256 =
            supervisorExecutableIdentifierSHA256
        self.supervisorDesignatedRequirementSHA256 =
            supervisorDesignatedRequirementSHA256
        self.supervisorCodeDirectorySHA256 =
            supervisorCodeDirectorySHA256
        self.supervisorCDHash = supervisorCDHash
        self.supervisorDependencyClosureSHA256 =
            supervisorDependencyClosureSHA256
        self.supervisorEntitlementPolicySHA256 =
            supervisorEntitlementPolicySHA256
        self.verifierWholeFileSHA256 = verifierWholeFileSHA256
        self.verifierSemanticMachOSHA256 =
            verifierSemanticMachOSHA256
        self.verifierExecutableIdentifierSHA256 =
            verifierExecutableIdentifierSHA256
        self.verifierDesignatedRequirementSHA256 =
            verifierDesignatedRequirementSHA256
        self.verifierCodeDirectorySHA256 =
            verifierCodeDirectorySHA256
        self.verifierCDHash = verifierCDHash
        self.verifierDependencyClosureSHA256 =
            verifierDependencyClosureSHA256
        self.verifierEntitlementPolicySHA256 =
            verifierEntitlementPolicySHA256
        self.loadCommandPolicySHA256 = loadCommandPolicySHA256
        self.hardenedRuntimePolicySHA256 =
            hardenedRuntimePolicySHA256
        self.libraryValidationPolicySHA256 =
            libraryValidationPolicySHA256
        self.flatPackageWholeFileSHA256 =
            flatPackageWholeFileSHA256
        self.packagePayloadClosureSHA256 =
            packagePayloadClosureSHA256
        self.installerSignatureIdentitySHA256 =
            installerSignatureIdentitySHA256
        self.notarizationSubmissionSHA256 =
            notarizationSubmissionSHA256
        self.notarizationTicketSHA256 = notarizationTicketSHA256
        self.stapledTicketSHA256 = stapledTicketSHA256
        self.gatekeeperAssessmentSHA256 = gatekeeperAssessmentSHA256
    }

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(Self.requiredExecutableCount)
        encoder.append(Self.thinMachO)
        encoder.append(Self.arm64Architecture)
        encoder.append(Self.machOExecuteFileType)
        encoder.append(Self.requiredMinimumOSMajor)
        encoder.append(Self.requiredMinimumOSMinor)
        encoder.append(Self.requiredMinimumOSPatch)
        encoder.append(Self.requiredSDKMajor)
        encoder.append(Self.requiredSDKMinor)
        encoder.append(Self.requiredSDKPatch)
        encoder.append(Self.developerIDApplication)
        encoder.append(Self.requiredSecureTimestamp)
        encoder.append(Self.requiredHardenedRuntime)
        encoder.append(Self.requiredLibraryValidation)
        encoder.append(Self.signedFlatPackage)
        encoder.append(Self.requiredPackagePayloadExecutableCount)
        encoder.append(Self.developerIDInstaller)
        encoder.append(Self.requiredPackageSecureTimestamp)
        encoder.append(Self.requiredNotaryAccepted)
        encoder.append(Self.requiredStapledTicket)
        encoder.append(Self.requiredGatekeeperAcceptance)

        encoder.append(Self.allowedFatBinarySliceCount)
        encoder.append(Self.allowedRPathLoadCommandCount)
        encoder.append(Self.allowedRelativeLoadCount)
        encoder.append(Self.allowedNonSystemLoadCount)
        encoder.append(Self.allowedWeakLoadCount)
        encoder.append(Self.allowedReexportLoadCount)
        encoder.append(Self.allowedUpwardLoadCount)
        encoder.append(Self.allowedLazyLoadCount)
        encoder.append(Self.allowedDYLDEnvironmentEntryCount)
        encoder.append(Self.allowedPluginCount)
        encoder.append(Self.allowedPreloadCount)
        encoder.append(Self.allowedDangerousEntitlementCount)
        encoder.append(Self.allowedPackageScriptCount)
        encoder.append(Self.allowedCodeSigningWarningCount)
        encoder.append(Self.allowedNotaryWarningCount)
        encoder.append(Self.allowedStapleWarningCount)
        encoder.append(Self.allowedGatekeeperWarningCount)
        encoder.append(Self.requiredPayloadRegularFileCount)
        encoder.append(Self.allowedPayloadNonExecutableRegularFileCount)
        encoder.append(Self.allowedPayloadSymlinkCount)
        encoder.append(Self.allowedPayloadHardlinkAliasCount)
        encoder.append(Self.allowedPayloadSpecialFileCount)

        encoder.append(recordID.bytes)
        encoder.append(releaseToolchainRecordSHA256.bytes)
        encoder.append(supervisorWholeFileSHA256.bytes)
        encoder.append(supervisorSemanticMachOSHA256.bytes)
        encoder.append(supervisorExecutableIdentifierSHA256.bytes)
        encoder.append(supervisorDesignatedRequirementSHA256.bytes)
        encoder.append(supervisorCodeDirectorySHA256.bytes)
        encoder.append(supervisorCDHash.bytes)
        encoder.append(supervisorDependencyClosureSHA256.bytes)
        encoder.append(supervisorEntitlementPolicySHA256.bytes)
        encoder.append(verifierWholeFileSHA256.bytes)
        encoder.append(verifierSemanticMachOSHA256.bytes)
        encoder.append(verifierExecutableIdentifierSHA256.bytes)
        encoder.append(verifierDesignatedRequirementSHA256.bytes)
        encoder.append(verifierCodeDirectorySHA256.bytes)
        encoder.append(verifierCDHash.bytes)
        encoder.append(verifierDependencyClosureSHA256.bytes)
        encoder.append(verifierEntitlementPolicySHA256.bytes)
        encoder.append(loadCommandPolicySHA256.bytes)
        encoder.append(hardenedRuntimePolicySHA256.bytes)
        encoder.append(libraryValidationPolicySHA256.bytes)
        encoder.append(flatPackageWholeFileSHA256.bytes)
        encoder.append(packagePayloadClosureSHA256.bytes)
        encoder.append(installerSignatureIdentitySHA256.bytes)
        encoder.append(notarizationSubmissionSHA256.bytes)
        encoder.append(notarizationTicketSHA256.bytes)
        encoder.append(stapledTicketSHA256.bytes)
        encoder.append(gatekeeperAssessmentSHA256.bytes)
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
                let purpose = ArtifactClosurePurpose(
                    rawValue: try decoder.readByte()
                ),
                try decoder.readByte() == requiredExecutableCount,
                try decoder.readByte() == thinMachO,
                try decoder.readByte() == arm64Architecture,
                try decoder.readByte() == machOExecuteFileType,
                try decoder.readByte() == requiredMinimumOSMajor,
                try decoder.readByte() == requiredMinimumOSMinor,
                try decoder.readByte() == requiredMinimumOSPatch,
                try decoder.readByte() == requiredSDKMajor,
                try decoder.readByte() == requiredSDKMinor,
                try decoder.readByte() == requiredSDKPatch,
                try decoder.readByte() == developerIDApplication,
                try decoder.readByte() == requiredSecureTimestamp,
                try decoder.readByte() == requiredHardenedRuntime,
                try decoder.readByte() == requiredLibraryValidation,
                try decoder.readByte() == signedFlatPackage,
                try decoder.readByte()
                    == requiredPackagePayloadExecutableCount,
                try decoder.readByte() == developerIDInstaller,
                try decoder.readByte() == requiredPackageSecureTimestamp,
                try decoder.readByte() == requiredNotaryAccepted,
                try decoder.readByte() == requiredStapledTicket,
                try decoder.readByte() == requiredGatekeeperAcceptance
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            guard
                try decoder.readUInt32()
                    == allowedFatBinarySliceCount,
                try decoder.readUInt32()
                    == allowedRPathLoadCommandCount,
                try decoder.readUInt32() == allowedRelativeLoadCount,
                try decoder.readUInt32() == allowedNonSystemLoadCount,
                try decoder.readUInt32() == allowedWeakLoadCount,
                try decoder.readUInt32() == allowedReexportLoadCount,
                try decoder.readUInt32() == allowedUpwardLoadCount,
                try decoder.readUInt32() == allowedLazyLoadCount,
                try decoder.readUInt32()
                    == allowedDYLDEnvironmentEntryCount,
                try decoder.readUInt32() == allowedPluginCount,
                try decoder.readUInt32() == allowedPreloadCount,
                try decoder.readUInt32()
                    == allowedDangerousEntitlementCount,
                try decoder.readUInt32() == allowedPackageScriptCount,
                try decoder.readUInt32()
                    == allowedCodeSigningWarningCount,
                try decoder.readUInt32() == allowedNotaryWarningCount,
                try decoder.readUInt32() == allowedStapleWarningCount,
                try decoder.readUInt32()
                    == allowedGatekeeperWarningCount
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }
            guard
                try decoder.readUInt32()
                    == requiredPayloadRegularFileCount,
                try decoder.readUInt32()
                    == allowedPayloadNonExecutableRegularFileCount,
                try decoder.readUInt32()
                    == allowedPayloadSymlinkCount,
                try decoder.readUInt32()
                    == allowedPayloadHardlinkAliasCount,
                try decoder.readUInt32()
                    == allowedPayloadSpecialFileCount
            else {
                throw CanonicalRecordError.invalidCanonicalRecord
            }

            let record = try Self(
                audience: audience,
                purpose: purpose,
                recordID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                releaseToolchainRecordSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                supervisorWholeFileSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                supervisorSemanticMachOSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                supervisorExecutableIdentifierSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                supervisorDesignatedRequirementSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                supervisorCodeDirectorySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                supervisorCDHash: CanonicalBytes20(
                    try decoder.readBytes(count: 20)
                ),
                supervisorDependencyClosureSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                supervisorEntitlementPolicySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                verifierWholeFileSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                verifierSemanticMachOSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                verifierExecutableIdentifierSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                verifierDesignatedRequirementSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                verifierCodeDirectorySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                verifierCDHash: CanonicalBytes20(
                    try decoder.readBytes(count: 20)
                ),
                verifierDependencyClosureSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                verifierEntitlementPolicySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                loadCommandPolicySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                hardenedRuntimePolicySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                libraryValidationPolicySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                flatPackageWholeFileSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                packagePayloadClosureSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                installerSignatureIdentitySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                notarizationSubmissionSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                notarizationTicketSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                stapledTicketSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                gatekeeperAssessmentSHA256: CanonicalBytes32(
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
}
