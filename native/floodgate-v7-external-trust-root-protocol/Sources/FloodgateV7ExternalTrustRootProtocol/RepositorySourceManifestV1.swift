public struct RepositorySourceManifestV1: Equatable, Sendable {
    public static let canonicalByteCount = 788

    private static let magic = Array("FGV7RSM1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0

    public let audience: TrustRootAudience
    public let purpose: TrustRootPurpose
    public let manifestID: CanonicalBytes32
    public let approvedCommit: CanonicalBytes20
    public let approvedTree: CanonicalBytes20
    public let repositorySourceClosureSHA256: CanonicalBytes32
    public let diagnosticBundleSHA256: CanonicalBytes32
    public let diagnosticLauncherJXASHA256: CanonicalBytes32
    public let pinnedNodeRuntimeSHA256: CanonicalBytes32
    public let runtimeLaunchPolicySHA256: CanonicalBytes32
    public let supervisorArtifactSHA256: CanonicalBytes32
    public let verifierArtifactSHA256: CanonicalBytes32
    public let supervisorCodeDirectorySHA256: CanonicalBytes32
    public let supervisorDesignatedRequirementSHA256: CanonicalBytes32
    public let supervisorHeldExecutableIdentitySHA256: CanonicalBytes32
    public let verifierCodeDirectorySHA256: CanonicalBytes32
    public let verifierDesignatedRequirementSHA256: CanonicalBytes32
    public let verifierHeldExecutableIdentitySHA256: CanonicalBytes32
    public let pinnedNodeCodeDirectorySHA256: CanonicalBytes32
    public let pinnedNodeDesignatedRequirementSHA256: CanonicalBytes32
    public let pinnedNodeHeldExecutableIdentitySHA256: CanonicalBytes32
    public let supervisorAttestationKeyID: CanonicalBytes32
    public let verifierAttestationKeyID: CanonicalBytes32
    public let gitDirectoryPolicySHA256: CanonicalBytes32
    public let repositoryPathPolicySHA256: CanonicalBytes32
    public let artifactClosureRecordSHA256: CanonicalBytes32
    public let installPolicyRecordSHA256: CanonicalBytes32

    public init(
        audience: TrustRootAudience,
        purpose: TrustRootPurpose,
        manifestID: CanonicalBytes32,
        approvedCommit: CanonicalBytes20,
        approvedTree: CanonicalBytes20,
        repositorySourceClosureSHA256: CanonicalBytes32,
        diagnosticBundleSHA256: CanonicalBytes32,
        diagnosticLauncherJXASHA256: CanonicalBytes32,
        pinnedNodeRuntimeSHA256: CanonicalBytes32,
        runtimeLaunchPolicySHA256: CanonicalBytes32,
        supervisorArtifactSHA256: CanonicalBytes32,
        verifierArtifactSHA256: CanonicalBytes32,
        supervisorCodeDirectorySHA256: CanonicalBytes32,
        supervisorDesignatedRequirementSHA256: CanonicalBytes32,
        supervisorHeldExecutableIdentitySHA256: CanonicalBytes32,
        verifierCodeDirectorySHA256: CanonicalBytes32,
        verifierDesignatedRequirementSHA256: CanonicalBytes32,
        verifierHeldExecutableIdentitySHA256: CanonicalBytes32,
        pinnedNodeCodeDirectorySHA256: CanonicalBytes32,
        pinnedNodeDesignatedRequirementSHA256: CanonicalBytes32,
        pinnedNodeHeldExecutableIdentitySHA256: CanonicalBytes32,
        supervisorAttestationKeyID: CanonicalBytes32,
        verifierAttestationKeyID: CanonicalBytes32,
        gitDirectoryPolicySHA256: CanonicalBytes32,
        repositoryPathPolicySHA256: CanonicalBytes32,
        artifactClosureRecordSHA256: CanonicalBytes32,
        installPolicyRecordSHA256: CanonicalBytes32
    ) throws {
        let requiredDigests = [
            manifestID,
            repositorySourceClosureSHA256,
            diagnosticBundleSHA256,
            diagnosticLauncherJXASHA256,
            pinnedNodeRuntimeSHA256,
            runtimeLaunchPolicySHA256,
            supervisorArtifactSHA256,
            verifierArtifactSHA256,
            supervisorCodeDirectorySHA256,
            supervisorDesignatedRequirementSHA256,
            supervisorHeldExecutableIdentitySHA256,
            verifierCodeDirectorySHA256,
            verifierDesignatedRequirementSHA256,
            verifierHeldExecutableIdentitySHA256,
            pinnedNodeCodeDirectorySHA256,
            pinnedNodeDesignatedRequirementSHA256,
            pinnedNodeHeldExecutableIdentitySHA256,
            supervisorAttestationKeyID,
            verifierAttestationKeyID,
            gitDirectoryPolicySHA256,
            repositoryPathPolicySHA256,
            artifactClosureRecordSHA256,
            installPolicyRecordSHA256,
        ]
        guard
            audience == .productionRecovery,
            purpose == .inspectStalePrefix100,
            !approvedCommit.isAllZero,
            !approvedTree.isAllZero,
            requiredDigests.allSatisfy({ !$0.isAllZero }),
            diagnosticBundleSHA256 != diagnosticLauncherJXASHA256,
            diagnosticBundleSHA256 != pinnedNodeRuntimeSHA256,
            diagnosticLauncherJXASHA256 != pinnedNodeRuntimeSHA256,
            supervisorArtifactSHA256 != verifierArtifactSHA256,
            supervisorAttestationKeyID != verifierAttestationKeyID,
            supervisorArtifactSHA256 != diagnosticBundleSHA256,
            verifierArtifactSHA256 != diagnosticBundleSHA256
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }

        self.audience = audience
        self.purpose = purpose
        self.manifestID = manifestID
        self.approvedCommit = approvedCommit
        self.approvedTree = approvedTree
        self.repositorySourceClosureSHA256 =
            repositorySourceClosureSHA256
        self.diagnosticBundleSHA256 = diagnosticBundleSHA256
        self.diagnosticLauncherJXASHA256 =
            diagnosticLauncherJXASHA256
        self.pinnedNodeRuntimeSHA256 = pinnedNodeRuntimeSHA256
        self.runtimeLaunchPolicySHA256 =
            runtimeLaunchPolicySHA256
        self.supervisorArtifactSHA256 =
            supervisorArtifactSHA256
        self.verifierArtifactSHA256 = verifierArtifactSHA256
        self.supervisorCodeDirectorySHA256 =
            supervisorCodeDirectorySHA256
        self.supervisorDesignatedRequirementSHA256 =
            supervisorDesignatedRequirementSHA256
        self.supervisorHeldExecutableIdentitySHA256 =
            supervisorHeldExecutableIdentitySHA256
        self.verifierCodeDirectorySHA256 =
            verifierCodeDirectorySHA256
        self.verifierDesignatedRequirementSHA256 =
            verifierDesignatedRequirementSHA256
        self.verifierHeldExecutableIdentitySHA256 =
            verifierHeldExecutableIdentitySHA256
        self.pinnedNodeCodeDirectorySHA256 =
            pinnedNodeCodeDirectorySHA256
        self.pinnedNodeDesignatedRequirementSHA256 =
            pinnedNodeDesignatedRequirementSHA256
        self.pinnedNodeHeldExecutableIdentitySHA256 =
            pinnedNodeHeldExecutableIdentitySHA256
        self.supervisorAttestationKeyID =
            supervisorAttestationKeyID
        self.verifierAttestationKeyID =
            verifierAttestationKeyID
        self.gitDirectoryPolicySHA256 = gitDirectoryPolicySHA256
        self.repositoryPathPolicySHA256 =
            repositoryPathPolicySHA256
        self.artifactClosureRecordSHA256 =
            artifactClosureRecordSHA256
        self.installPolicyRecordSHA256 =
            installPolicyRecordSHA256
    }

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(audience.rawValue)
        encoder.append(purpose.rawValue)
        encoder.append(manifestID.bytes)
        encoder.append(approvedCommit.bytes)
        encoder.append(approvedTree.bytes)
        encoder.append(repositorySourceClosureSHA256.bytes)
        encoder.append(diagnosticBundleSHA256.bytes)
        encoder.append(diagnosticLauncherJXASHA256.bytes)
        encoder.append(pinnedNodeRuntimeSHA256.bytes)
        encoder.append(runtimeLaunchPolicySHA256.bytes)
        encoder.append(supervisorArtifactSHA256.bytes)
        encoder.append(verifierArtifactSHA256.bytes)
        encoder.append(supervisorCodeDirectorySHA256.bytes)
        encoder.append(supervisorDesignatedRequirementSHA256.bytes)
        encoder.append(supervisorHeldExecutableIdentitySHA256.bytes)
        encoder.append(verifierCodeDirectorySHA256.bytes)
        encoder.append(verifierDesignatedRequirementSHA256.bytes)
        encoder.append(verifierHeldExecutableIdentitySHA256.bytes)
        encoder.append(pinnedNodeCodeDirectorySHA256.bytes)
        encoder.append(pinnedNodeDesignatedRequirementSHA256.bytes)
        encoder.append(pinnedNodeHeldExecutableIdentitySHA256.bytes)
        encoder.append(supervisorAttestationKeyID.bytes)
        encoder.append(verifierAttestationKeyID.bytes)
        encoder.append(gitDirectoryPolicySHA256.bytes)
        encoder.append(repositoryPathPolicySHA256.bytes)
        encoder.append(artifactClosureRecordSHA256.bytes)
        encoder.append(installPolicyRecordSHA256.bytes)
        precondition(encoder.bytes.count == Self.canonicalByteCount)
        return encoder.bytes
    }

    public func canonicalSHA256() -> CanonicalBytes32 {
        CanonicalSHA256.digest(canonicalBytes())
    }

    public func validateEnrollment(_ enrollment: EnrollmentRecord) throws {
        guard
            enrollment.audience == audience,
            enrollment.purpose == purpose,
            enrollment.approvedCommit == approvedCommit,
            enrollment.approvedTree == approvedTree,
            enrollment.sourceManifestSHA256 == canonicalSHA256(),
            enrollment.supervisorArtifactSHA256
                == supervisorArtifactSHA256,
            enrollment.childArtifactSHA256 == diagnosticBundleSHA256,
            enrollment.runtimeClosureSHA256 == pinnedNodeRuntimeSHA256
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }

    public func validateRuntimeLaunchPolicy(
        _ policy: RuntimeLaunchPolicyRecordV1
    ) throws {
        guard
            policy.audience == audience,
            policy.purpose == purpose,
            runtimeLaunchPolicySHA256 == policy.canonicalSHA256(),
            policy.diagnosticEntryBundleSHA256
                == diagnosticBundleSHA256
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
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
                manifestID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                approvedCommit: CanonicalBytes20(
                    try decoder.readBytes(count: 20)
                ),
                approvedTree: CanonicalBytes20(
                    try decoder.readBytes(count: 20)
                ),
                repositorySourceClosureSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                diagnosticBundleSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                diagnosticLauncherJXASHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                pinnedNodeRuntimeSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                runtimeLaunchPolicySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                supervisorArtifactSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                verifierArtifactSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                supervisorCodeDirectorySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                supervisorDesignatedRequirementSHA256:
                    CanonicalBytes32(
                        try decoder.readBytes(count: 32)
                    ),
                supervisorHeldExecutableIdentitySHA256:
                    CanonicalBytes32(
                        try decoder.readBytes(count: 32)
                    ),
                verifierCodeDirectorySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                verifierDesignatedRequirementSHA256:
                    CanonicalBytes32(
                        try decoder.readBytes(count: 32)
                    ),
                verifierHeldExecutableIdentitySHA256:
                    CanonicalBytes32(
                        try decoder.readBytes(count: 32)
                    ),
                pinnedNodeCodeDirectorySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                pinnedNodeDesignatedRequirementSHA256:
                    CanonicalBytes32(
                        try decoder.readBytes(count: 32)
                    ),
                pinnedNodeHeldExecutableIdentitySHA256:
                    CanonicalBytes32(
                        try decoder.readBytes(count: 32)
                    ),
                supervisorAttestationKeyID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                verifierAttestationKeyID: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                gitDirectoryPolicySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                repositoryPathPolicySHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                artifactClosureRecordSHA256: CanonicalBytes32(
                    try decoder.readBytes(count: 32)
                ),
                installPolicyRecordSHA256: CanonicalBytes32(
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
