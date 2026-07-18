import Foundation

public typealias TrustRootSignatureProviderV1 =
    @Sendable ([UInt8]) throws -> [UInt8]
public typealias TrustRootRandomBytesProviderV1 =
    @Sendable (Int) throws -> [UInt8]

public struct RepositoryObservationV1: Equatable, Sendable {
    public static let canonicalByteCount = 418

    private static let magic = Array("FGV7OBS1".utf8)
    private static let schemaVersion: UInt8 = 1
    private static let reserved: UInt8 = 0
    private static let matched: UInt8 = 1
    private static let callerPathRejected: UInt8 = 0

    public let approvedCommit: CanonicalBytes20
    public let approvedTree: CanonicalBytes20
    public let repositorySourceClosureSHA256: CanonicalBytes32
    public let diagnosticBundleSHA256: CanonicalBytes32
    public let diagnosticLauncherJXASHA256: CanonicalBytes32
    public let pinnedNodeRuntimeSHA256: CanonicalBytes32
    public let supervisorArtifactSHA256: CanonicalBytes32
    public let verifierArtifactSHA256: CanonicalBytes32
    public let gitDirectoryPolicySHA256: CanonicalBytes32
    public let repositoryPathPolicySHA256: CanonicalBytes32
    public let artifactClosureRecordSHA256: CanonicalBytes32
    public let installPolicyRecordSHA256: CanonicalBytes32
    public let targetProcessIdentitySHA256: CanonicalBytes32
    public let targetProcessID: UInt32
    public let effectiveUID: UInt32

    public init(
        approvedCommit: CanonicalBytes20,
        approvedTree: CanonicalBytes20,
        repositorySourceClosureSHA256: CanonicalBytes32,
        diagnosticBundleSHA256: CanonicalBytes32,
        diagnosticLauncherJXASHA256: CanonicalBytes32,
        pinnedNodeRuntimeSHA256: CanonicalBytes32,
        supervisorArtifactSHA256: CanonicalBytes32,
        verifierArtifactSHA256: CanonicalBytes32,
        gitDirectoryPolicySHA256: CanonicalBytes32,
        repositoryPathPolicySHA256: CanonicalBytes32,
        artifactClosureRecordSHA256: CanonicalBytes32,
        installPolicyRecordSHA256: CanonicalBytes32,
        targetProcessIdentitySHA256: CanonicalBytes32,
        targetProcessID: UInt32,
        effectiveUID: UInt32,
        exactCleanRepository: Bool,
        heldNoFollowIdentities: Bool,
        gitDirectoryCommonDirectoryAndObjectDirectoryVerified: Bool,
        gitAlternatesAbsent: Bool,
        gitReplacementObjectsAbsent: Bool,
        callerSuppliedPathAccepted: Bool
    ) throws {
        guard
            !approvedCommit.isAllZero,
            !approvedTree.isAllZero,
            !repositorySourceClosureSHA256.isAllZero,
            !diagnosticBundleSHA256.isAllZero,
            !diagnosticLauncherJXASHA256.isAllZero,
            !pinnedNodeRuntimeSHA256.isAllZero,
            !supervisorArtifactSHA256.isAllZero,
            !verifierArtifactSHA256.isAllZero,
            !gitDirectoryPolicySHA256.isAllZero,
            !repositoryPathPolicySHA256.isAllZero,
            !artifactClosureRecordSHA256.isAllZero,
            !installPolicyRecordSHA256.isAllZero,
            !targetProcessIdentitySHA256.isAllZero,
            targetProcessID > 0,
            effectiveUID > 0,
            exactCleanRepository,
            heldNoFollowIdentities,
            gitDirectoryCommonDirectoryAndObjectDirectoryVerified,
            gitAlternatesAbsent,
            gitReplacementObjectsAbsent,
            !callerSuppliedPathAccepted
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.approvedCommit = approvedCommit
        self.approvedTree = approvedTree
        self.repositorySourceClosureSHA256 =
            repositorySourceClosureSHA256
        self.diagnosticBundleSHA256 = diagnosticBundleSHA256
        self.diagnosticLauncherJXASHA256 =
            diagnosticLauncherJXASHA256
        self.pinnedNodeRuntimeSHA256 = pinnedNodeRuntimeSHA256
        self.supervisorArtifactSHA256 =
            supervisorArtifactSHA256
        self.verifierArtifactSHA256 = verifierArtifactSHA256
        self.gitDirectoryPolicySHA256 =
            gitDirectoryPolicySHA256
        self.repositoryPathPolicySHA256 =
            repositoryPathPolicySHA256
        self.artifactClosureRecordSHA256 =
            artifactClosureRecordSHA256
        self.installPolicyRecordSHA256 =
            installPolicyRecordSHA256
        self.targetProcessIdentitySHA256 =
            targetProcessIdentitySHA256
        self.targetProcessID = targetProcessID
        self.effectiveUID = effectiveUID
    }

    public func canonicalBytes() -> [UInt8] {
        var encoder = CanonicalEncoder()
        encoder.append(Self.magic)
        encoder.append(Self.schemaVersion)
        encoder.append(Self.reserved)
        encoder.append(TrustRootAudience.productionRecovery.rawValue)
        encoder.append(TrustRootPurpose.inspectStalePrefix100.rawValue)
        encoder.append(approvedCommit.bytes)
        encoder.append(approvedTree.bytes)
        encoder.append(repositorySourceClosureSHA256.bytes)
        encoder.append(diagnosticBundleSHA256.bytes)
        encoder.append(diagnosticLauncherJXASHA256.bytes)
        encoder.append(pinnedNodeRuntimeSHA256.bytes)
        encoder.append(supervisorArtifactSHA256.bytes)
        encoder.append(verifierArtifactSHA256.bytes)
        encoder.append(gitDirectoryPolicySHA256.bytes)
        encoder.append(repositoryPathPolicySHA256.bytes)
        encoder.append(artifactClosureRecordSHA256.bytes)
        encoder.append(installPolicyRecordSHA256.bytes)
        encoder.append(targetProcessIdentitySHA256.bytes)
        encoder.append(targetProcessID)
        encoder.append(effectiveUID)
        encoder.append(Self.matched)
        encoder.append(Self.matched)
        encoder.append(Self.matched)
        encoder.append(Self.matched)
        encoder.append(Self.matched)
        encoder.append(Self.callerPathRejected)
        precondition(encoder.bytes.count == Self.canonicalByteCount)
        return encoder.bytes
    }

    public func canonicalSHA256() -> CanonicalBytes32 {
        CanonicalSHA256.digest(canonicalBytes())
    }

    public func validate(
        manifest: RepositorySourceManifestV1,
        enrollment: EnrollmentRecord
    ) throws {
        guard
            approvedCommit == manifest.approvedCommit,
            approvedTree == manifest.approvedTree,
            repositorySourceClosureSHA256
                == manifest.repositorySourceClosureSHA256,
            diagnosticBundleSHA256
                == manifest.diagnosticBundleSHA256,
            diagnosticLauncherJXASHA256
                == manifest.diagnosticLauncherJXASHA256,
            pinnedNodeRuntimeSHA256
                == manifest.pinnedNodeRuntimeSHA256,
            supervisorArtifactSHA256
                == manifest.supervisorArtifactSHA256,
            verifierArtifactSHA256
                == manifest.verifierArtifactSHA256,
            gitDirectoryPolicySHA256
                == manifest.gitDirectoryPolicySHA256,
            repositoryPathPolicySHA256
                == manifest.repositoryPathPolicySHA256,
            artifactClosureRecordSHA256
                == manifest.artifactClosureRecordSHA256,
            installPolicyRecordSHA256
                == manifest.installPolicyRecordSHA256,
            effectiveUID == enrollment.expectedUID
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
    }
}

private func fixedExpiry(
    issuedAtUnixSeconds: UInt64,
    upperBoundUnixSeconds: UInt64? = nil
) throws -> UInt64 {
    let (candidate, overflow) =
        issuedAtUnixSeconds.addingReportingOverflow(
            SupervisorChallengeV1.maximumLifetimeSeconds
        )
    guard !overflow else {
        throw CanonicalRecordError.invalidCanonicalRecord
    }
    let expiry = min(candidate, upperBoundUnixSeconds ?? candidate)
    guard issuedAtUnixSeconds < expiry else {
        throw CanonicalRecordError.invalidCanonicalRecord
    }
    return expiry
}

private func fixedMonotonicExpiry(
    issuedAtNanoseconds: UInt64
) throws -> UInt64 {
    let (expiry, overflow) =
        issuedAtNanoseconds.addingReportingOverflow(
            SupervisorChallengeV1.maximumLifetimeNanoseconds
        )
    guard !overflow, issuedAtNanoseconds > 0 else {
        throw CanonicalRecordError.invalidCanonicalRecord
    }
    return expiry
}

private func randomBytes32(
    using provider: TrustRootRandomBytesProviderV1
) throws -> CanonicalBytes32 {
    do {
        let value = try CanonicalBytes32(provider(32))
        guard !value.isAllZero else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        return value
    } catch {
        throw CanonicalRecordError.invalidCanonicalRecord
    }
}

private func signatureBytes64(
    payload: [UInt8],
    using provider: TrustRootSignatureProviderV1
) throws -> CanonicalBytes64 {
    do {
        let value = try CanonicalBytes64(provider(payload))
        guard !value.isAllZero else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        return value
    } catch {
        throw CanonicalRecordError.invalidCanonicalRecord
    }
}

public enum TrustRootSupervisorCoreV1 {
    static func issueChallenge(
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        authorityPublicKeyRawRepresentation: [UInt8],
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPolicy: RuntimeLaunchPolicyRecordV1,
        supervisorProcessIdentity: ProcessIdentityV1,
        verifierAnonymousFDChannelBindingSHA256: CanonicalBytes32,
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64,
        supervisorPublicKeyRawRepresentation: [UInt8],
        randomBytes: TrustRootRandomBytesProviderV1,
        sign: TrustRootSignatureProviderV1
    ) throws -> SupervisorChallengeV1 {
        let state = try AuthenticatedProtocolStateV1.replay(
            enrollmentEnvelopes: enrollmentEnvelopes,
            activationEnvelopes: activationEnvelopes,
            authorityPublicKeyRawRepresentation:
                authorityPublicKeyRawRepresentation,
            nowUnixSeconds: nowUnixSeconds
        )
        try manifest.validateEnrollment(state.activeEnrollment)
        try manifest.validateRuntimeLaunchPolicy(runtimeLaunchPolicy)
        try supervisorProcessIdentity.validateSupervisorAgainstManifest(
            manifest,
            expectedUID: state.activeEnrollment.expectedUID
        )
        guard
            !verifierAnonymousFDChannelBindingSHA256.isAllZero
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        let challengeID = try randomBytes32(using: randomBytes)
        let nonce = try randomBytes32(using: randomBytes)
        guard challengeID != nonce else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        let signerKeyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation
        )
        guard signerKeyID == manifest.supervisorAttestationKeyID else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        let expiresAtUnixSeconds = try fixedExpiry(
            issuedAtUnixSeconds: nowUnixSeconds
        )
        let payload = try SupervisorChallengeV1.signaturePayload(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            challengeID: challengeID,
            nonce: nonce,
            enrollmentID: state.activeEnrollment.enrollmentID,
            activationDigest:
                state.lastActivationEnvelopeSHA256,
            sourceManifestSHA256: manifest.canonicalSHA256(),
            targetProcessIdentitySHA256:
                supervisorProcessIdentity.canonicalSHA256(),
            supervisorProcessIdentitySHA256:
                supervisorProcessIdentity.canonicalSHA256(),
            verifierAnonymousFDChannelBindingSHA256:
                verifierAnonymousFDChannelBindingSHA256,
            signerKeyID: signerKeyID,
            targetProcessID: supervisorProcessIdentity.processID,
            expectedUID: state.activeEnrollment.expectedUID,
            issuedAtUnixSeconds: nowUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds,
            monotonicIssuedAtNanoseconds:
                nowMonotonicNanoseconds,
            monotonicExpiresAtNanoseconds:
                try fixedMonotonicExpiry(
                    issuedAtNanoseconds: nowMonotonicNanoseconds
                )
        )
        let challenge = try SupervisorChallengeV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            challengeID: challengeID,
            nonce: nonce,
            enrollmentID: state.activeEnrollment.enrollmentID,
            activationDigest:
                state.lastActivationEnvelopeSHA256,
            sourceManifestSHA256: manifest.canonicalSHA256(),
            targetProcessIdentitySHA256:
                supervisorProcessIdentity.canonicalSHA256(),
            supervisorProcessIdentitySHA256:
                supervisorProcessIdentity.canonicalSHA256(),
            verifierAnonymousFDChannelBindingSHA256:
                verifierAnonymousFDChannelBindingSHA256,
            signerKeyID: signerKeyID,
            targetProcessID: supervisorProcessIdentity.processID,
            expectedUID: state.activeEnrollment.expectedUID,
            issuedAtUnixSeconds: nowUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds,
            monotonicIssuedAtNanoseconds:
                nowMonotonicNanoseconds,
            monotonicExpiresAtNanoseconds:
                try fixedMonotonicExpiry(
                    issuedAtNanoseconds: nowMonotonicNanoseconds
                ),
            signature: try signatureBytes64(
                payload: payload,
                using: sign
            )
        )
        try challenge.verify(
            publicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation,
            nowUnixSeconds: nowUnixSeconds,
            nowMonotonicNanoseconds: nowMonotonicNanoseconds
        )
        guard
            challenge.signerKeyID
                == manifest.supervisorAttestationKeyID
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        return challenge
    }

    static func issueAttestation(
        challenge: SupervisorChallengeV1,
        receipt: VerifierReceiptV1,
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPolicy: RuntimeLaunchPolicyRecordV1,
        enrollment: EnrollmentRecord,
        observation: RepositoryObservationV1,
        supervisorProcessIdentity: ProcessIdentityV1,
        verifierProcessIdentity: ProcessIdentityV1,
        supervisorPublicKeyRawRepresentation: [UInt8],
        verifierPublicKeyRawRepresentation: [UInt8],
        childProcessIdentity: ProcessIdentityV1,
        childAnonymousFDChannelBindingSHA256: CanonicalBytes32,
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64,
        randomBytes: TrustRootRandomBytesProviderV1,
        sign: TrustRootSignatureProviderV1
    ) throws -> OneShotAttestationV1 {
        try challenge.verify(
            publicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation,
            nowUnixSeconds: nowUnixSeconds,
            nowMonotonicNanoseconds: nowMonotonicNanoseconds
        )
        guard
            challenge.signerKeyID
                == manifest.supervisorAttestationKeyID
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        try receipt.verify(
            publicKeyRawRepresentation:
                verifierPublicKeyRawRepresentation,
            challenge: challenge,
            manifest: manifest,
            runtimeLaunchPolicy: runtimeLaunchPolicy,
            enrollment: enrollment,
            observation: observation,
            supervisorProcessIdentity: supervisorProcessIdentity,
            verifierProcessIdentity: verifierProcessIdentity,
            nowUnixSeconds: nowUnixSeconds
        )
        try childProcessIdentity.validateChildOf(
            supervisorProcessIdentity,
            expectedRole: .diagnosticChild,
            expectedExecutableSHA256:
                manifest.pinnedNodeRuntimeSHA256,
            expectedCodeDirectorySHA256:
                manifest.pinnedNodeCodeDirectorySHA256,
            expectedDesignatedRequirementSHA256:
                manifest.pinnedNodeDesignatedRequirementSHA256,
            expectedHeldExecutableIdentitySHA256:
                manifest.pinnedNodeHeldExecutableIdentitySHA256,
            expectedAnonymousFDChannelBindingSHA256:
                childAnonymousFDChannelBindingSHA256
        )
        let attestationID = try randomBytes32(using: randomBytes)
        let nonce = try randomBytes32(using: randomBytes)
        guard
            attestationID != nonce,
            nonce != challenge.nonce
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        let signerKeyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation
        )
        guard signerKeyID == manifest.supervisorAttestationKeyID else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        let expiresAtUnixSeconds = try fixedExpiry(
            issuedAtUnixSeconds: nowUnixSeconds,
            upperBoundUnixSeconds: receipt.expiresAtUnixSeconds
        )
        let payload = try OneShotAttestationV1.signaturePayload(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            attestationID: attestationID,
            challengeSHA256: challenge.canonicalSHA256(),
            receiptSHA256: receipt.canonicalSHA256(),
            enrollmentID: receipt.enrollmentID,
            activationDigest: receipt.activationDigest,
            sourceManifestSHA256:
                receipt.sourceManifestSHA256,
            approvedCommit: receipt.approvedCommit,
            approvedTree: receipt.approvedTree,
            childProcessIdentitySHA256:
                childProcessIdentity.canonicalSHA256(),
            supervisorProcessIdentitySHA256:
                supervisorProcessIdentity.canonicalSHA256(),
            nonce: nonce,
            signerKeyID: signerKeyID,
            childProcessID: childProcessIdentity.processID,
            expectedUID: receipt.expectedUID,
            issuedAtUnixSeconds: nowUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds
        )
        let attestation = try OneShotAttestationV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            attestationID: attestationID,
            challengeSHA256: challenge.canonicalSHA256(),
            receiptSHA256: receipt.canonicalSHA256(),
            enrollmentID: receipt.enrollmentID,
            activationDigest: receipt.activationDigest,
            sourceManifestSHA256:
                receipt.sourceManifestSHA256,
            approvedCommit: receipt.approvedCommit,
            approvedTree: receipt.approvedTree,
            childProcessIdentitySHA256:
                childProcessIdentity.canonicalSHA256(),
            supervisorProcessIdentitySHA256:
                supervisorProcessIdentity.canonicalSHA256(),
            nonce: nonce,
            signerKeyID: signerKeyID,
            childProcessID: childProcessIdentity.processID,
            expectedUID: receipt.expectedUID,
            issuedAtUnixSeconds: nowUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds,
            signature: try signatureBytes64(
                payload: payload,
                using: sign
            )
        )
        try attestation.verify(
            publicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation,
            challenge: challenge,
            receipt: receipt,
            manifest: manifest,
            runtimeLaunchPolicy: runtimeLaunchPolicy,
            supervisorProcessIdentity:
                supervisorProcessIdentity,
            childProcessIdentity: childProcessIdentity,
            expectedChildAnonymousFDChannelBindingSHA256:
                childAnonymousFDChannelBindingSHA256,
            nowUnixSeconds: nowUnixSeconds
        )
        return attestation
    }
}

public final class TrustRootSupervisorSessionV1:
    @unchecked Sendable
{
    private let supervisorProcessIdentity: ProcessIdentityV1
    private let lock = NSLock()
    private var lastWallClockSeconds: UInt64 = 0
    private var lastMonotonicNanoseconds: UInt64 = 0
    private var issuedChallenges: Set<CanonicalBytes32> = []
    private var consumedChallenges: Set<CanonicalBytes32> = []
    private var consumedReceipts: Set<CanonicalBytes32> = []

    public init(supervisorProcessIdentity: ProcessIdentityV1) throws {
        guard supervisorProcessIdentity.role == .supervisor else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.supervisorProcessIdentity = supervisorProcessIdentity
    }

    private func advanceClock(
        wallClockSeconds: UInt64,
        monotonicNanoseconds: UInt64
    ) throws {
        lock.lock()
        defer { lock.unlock() }
        guard
            wallClockSeconds > 0,
            monotonicNanoseconds > 0,
            wallClockSeconds >= lastWallClockSeconds,
            monotonicNanoseconds >= lastMonotonicNanoseconds
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        lastWallClockSeconds = wallClockSeconds
        lastMonotonicNanoseconds = monotonicNanoseconds
    }

    public func issueChallenge(
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        authorityPublicKeyRawRepresentation: [UInt8],
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPolicy: RuntimeLaunchPolicyRecordV1,
        verifierAnonymousFDChannelBindingSHA256: CanonicalBytes32,
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64,
        supervisorPublicKeyRawRepresentation: [UInt8],
        randomBytes: TrustRootRandomBytesProviderV1,
        sign: TrustRootSignatureProviderV1
    ) throws -> SupervisorChallengeV1 {
        try advanceClock(
            wallClockSeconds: nowUnixSeconds,
            monotonicNanoseconds: nowMonotonicNanoseconds
        )
        let challenge = try TrustRootSupervisorCoreV1.issueChallenge(
            enrollmentEnvelopes: enrollmentEnvelopes,
            activationEnvelopes: activationEnvelopes,
            authorityPublicKeyRawRepresentation:
                authorityPublicKeyRawRepresentation,
            manifest: manifest,
            runtimeLaunchPolicy: runtimeLaunchPolicy,
            supervisorProcessIdentity: supervisorProcessIdentity,
            verifierAnonymousFDChannelBindingSHA256:
                verifierAnonymousFDChannelBindingSHA256,
            nowUnixSeconds: nowUnixSeconds,
            nowMonotonicNanoseconds: nowMonotonicNanoseconds,
            supervisorPublicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation,
            randomBytes: randomBytes,
            sign: sign
        )
        lock.lock()
        defer { lock.unlock() }
        guard
            issuedChallenges.insert(
                challenge.canonicalSHA256()
            ).inserted
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        return challenge
    }

    public func issueAttestation(
        challenge: SupervisorChallengeV1,
        receipt: VerifierReceiptV1,
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPolicy: RuntimeLaunchPolicyRecordV1,
        enrollment: EnrollmentRecord,
        observation: RepositoryObservationV1,
        verifierProcessIdentity: ProcessIdentityV1,
        supervisorPublicKeyRawRepresentation: [UInt8],
        verifierPublicKeyRawRepresentation: [UInt8],
        childProcessIdentity: ProcessIdentityV1,
        childAnonymousFDChannelBindingSHA256: CanonicalBytes32,
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64,
        randomBytes: TrustRootRandomBytesProviderV1,
        sign: TrustRootSignatureProviderV1
    ) throws -> OneShotAttestationV1 {
        try advanceClock(
            wallClockSeconds: nowUnixSeconds,
            monotonicNanoseconds: nowMonotonicNanoseconds
        )
        let challengeDigest = challenge.canonicalSHA256()
        let receiptDigest = receipt.canonicalSHA256()
        lock.lock()
        let accepted =
            issuedChallenges.contains(challengeDigest)
            && !consumedChallenges.contains(challengeDigest)
            && !consumedReceipts.contains(receiptDigest)
        if accepted {
            consumedChallenges.insert(challengeDigest)
            consumedReceipts.insert(receiptDigest)
        }
        lock.unlock()
        guard accepted else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        return try TrustRootSupervisorCoreV1.issueAttestation(
            challenge: challenge,
            receipt: receipt,
            manifest: manifest,
            runtimeLaunchPolicy: runtimeLaunchPolicy,
            enrollment: enrollment,
            observation: observation,
            supervisorProcessIdentity: supervisorProcessIdentity,
            verifierProcessIdentity: verifierProcessIdentity,
            supervisorPublicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation,
            verifierPublicKeyRawRepresentation:
                verifierPublicKeyRawRepresentation,
            childProcessIdentity: childProcessIdentity,
            childAnonymousFDChannelBindingSHA256:
                childAnonymousFDChannelBindingSHA256,
            nowUnixSeconds: nowUnixSeconds,
            nowMonotonicNanoseconds: nowMonotonicNanoseconds,
            randomBytes: randomBytes,
            sign: sign
        )
    }
}

public enum TrustRootVerifierCoreV1 {
    public static func issueReceipt(
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        authorityPublicKeyRawRepresentation: [UInt8],
        challenge: SupervisorChallengeV1,
        supervisorPublicKeyRawRepresentation: [UInt8],
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPolicy: RuntimeLaunchPolicyRecordV1,
        observation: RepositoryObservationV1,
        supervisorProcessIdentity: ProcessIdentityV1,
        verifierProcessIdentity: ProcessIdentityV1,
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64,
        verifierPublicKeyRawRepresentation: [UInt8],
        randomBytes: TrustRootRandomBytesProviderV1,
        sign: TrustRootSignatureProviderV1
    ) throws -> VerifierReceiptV1 {
        try challenge.verify(
            publicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation,
            nowUnixSeconds: nowUnixSeconds,
            nowMonotonicNanoseconds: nowMonotonicNanoseconds
        )
        let state = try AuthenticatedProtocolStateV1.replay(
            enrollmentEnvelopes: enrollmentEnvelopes,
            activationEnvelopes: activationEnvelopes,
            authorityPublicKeyRawRepresentation:
                authorityPublicKeyRawRepresentation,
            nowUnixSeconds: nowUnixSeconds
        )
        try manifest.validateEnrollment(state.activeEnrollment)
        try manifest.validateRuntimeLaunchPolicy(runtimeLaunchPolicy)
        try observation.validate(
            manifest: manifest,
            enrollment: state.activeEnrollment
        )
        try supervisorProcessIdentity.validateSupervisorAgainstManifest(
            manifest,
            expectedUID: state.activeEnrollment.expectedUID
        )
        try verifierProcessIdentity.validateChildOf(
            supervisorProcessIdentity,
            expectedRole: .verifier,
            expectedExecutableSHA256:
                manifest.verifierArtifactSHA256,
            expectedCodeDirectorySHA256:
                manifest.verifierCodeDirectorySHA256,
            expectedDesignatedRequirementSHA256:
                manifest.verifierDesignatedRequirementSHA256,
            expectedHeldExecutableIdentitySHA256:
                manifest.verifierHeldExecutableIdentitySHA256,
            expectedAnonymousFDChannelBindingSHA256:
                challenge.verifierAnonymousFDChannelBindingSHA256
        )
        guard
            challenge.enrollmentID
                == state.activeEnrollment.enrollmentID,
            challenge.activationDigest
                == state.lastActivationEnvelopeSHA256,
            challenge.sourceManifestSHA256
                == manifest.canonicalSHA256(),
            challenge.targetProcessID
                == observation.targetProcessID,
            challenge.targetProcessID
                == supervisorProcessIdentity.processID,
            challenge.targetProcessIdentitySHA256
                == observation.targetProcessIdentitySHA256,
            challenge.targetProcessIdentitySHA256
                == supervisorProcessIdentity.canonicalSHA256(),
            challenge.expectedUID == observation.effectiveUID,
            challenge.signerKeyID
                == manifest.supervisorAttestationKeyID,
            challenge.supervisorProcessIdentitySHA256
                == supervisorProcessIdentity.canonicalSHA256()
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        let receiptID = try randomBytes32(using: randomBytes)
        let signerKeyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                verifierPublicKeyRawRepresentation
        )
        guard
            signerKeyID == manifest.verifierAttestationKeyID,
            signerKeyID != challenge.signerKeyID
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        let expiresAtUnixSeconds = try fixedExpiry(
            issuedAtUnixSeconds: nowUnixSeconds,
            upperBoundUnixSeconds: challenge.expiresAtUnixSeconds
        )
        let payload = try VerifierReceiptV1.signaturePayload(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            receiptID: receiptID,
            challengeSHA256: challenge.canonicalSHA256(),
            enrollmentID: state.activeEnrollment.enrollmentID,
            activationDigest:
                state.lastActivationEnvelopeSHA256,
            sourceManifestSHA256: manifest.canonicalSHA256(),
            repositoryObservationSHA256:
                observation.canonicalSHA256(),
            approvedCommit: state.activeEnrollment.approvedCommit,
            approvedTree: state.activeEnrollment.approvedTree,
            targetProcessIdentitySHA256:
                observation.targetProcessIdentitySHA256,
            verifierArtifactSHA256:
                observation.verifierArtifactSHA256,
            verifierProcessIdentitySHA256:
                verifierProcessIdentity.canonicalSHA256(),
            signerKeyID: signerKeyID,
            targetProcessID: observation.targetProcessID,
            expectedUID: observation.effectiveUID,
            issuedAtUnixSeconds: nowUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds
        )
        let receipt = try VerifierReceiptV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            receiptID: receiptID,
            challengeSHA256: challenge.canonicalSHA256(),
            enrollmentID: state.activeEnrollment.enrollmentID,
            activationDigest:
                state.lastActivationEnvelopeSHA256,
            sourceManifestSHA256: manifest.canonicalSHA256(),
            repositoryObservationSHA256:
                observation.canonicalSHA256(),
            approvedCommit: state.activeEnrollment.approvedCommit,
            approvedTree: state.activeEnrollment.approvedTree,
            targetProcessIdentitySHA256:
                observation.targetProcessIdentitySHA256,
            verifierArtifactSHA256:
                observation.verifierArtifactSHA256,
            verifierProcessIdentitySHA256:
                verifierProcessIdentity.canonicalSHA256(),
            signerKeyID: signerKeyID,
            targetProcessID: observation.targetProcessID,
            expectedUID: observation.effectiveUID,
            issuedAtUnixSeconds: nowUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds,
            signature: try signatureBytes64(
                payload: payload,
                using: sign
            )
        )
        try receipt.verify(
            publicKeyRawRepresentation:
                verifierPublicKeyRawRepresentation,
            challenge: challenge,
            manifest: manifest,
            runtimeLaunchPolicy: runtimeLaunchPolicy,
            enrollment: state.activeEnrollment,
            observation: observation,
            supervisorProcessIdentity: supervisorProcessIdentity,
            verifierProcessIdentity: verifierProcessIdentity,
            nowUnixSeconds: nowUnixSeconds
        )
        return receipt
    }
}

public final class OneShotAttestationConsumerV1:
    @unchecked Sendable
{
    private let lock = NSLock()
    private var consumedAttestations: Set<CanonicalBytes32> = []
    private var consumedChallenges: Set<CanonicalBytes32> = []
    private var consumedReceipts: Set<CanonicalBytes32> = []
    private var consumedChildProcesses: Set<CanonicalBytes32> = []

    public init() {}

    public func consume(
        _ attestation: OneShotAttestationV1,
        supervisorPublicKeyRawRepresentation: [UInt8],
        verifierPublicKeyRawRepresentation: [UInt8],
        challenge: SupervisorChallengeV1,
        receipt: VerifierReceiptV1,
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPolicy: RuntimeLaunchPolicyRecordV1,
        enrollment: EnrollmentRecord,
        observation: RepositoryObservationV1,
        supervisorProcessIdentity: ProcessIdentityV1,
        verifierProcessIdentity: ProcessIdentityV1,
        childProcessIdentity: ProcessIdentityV1,
        childAnonymousFDChannelBindingSHA256: CanonicalBytes32,
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64
    ) throws {
        try challenge.verify(
            publicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation,
            nowUnixSeconds: nowUnixSeconds,
            nowMonotonicNanoseconds: nowMonotonicNanoseconds
        )
        guard
            challenge.signerKeyID
                == manifest.supervisorAttestationKeyID
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        try receipt.verify(
            publicKeyRawRepresentation:
                verifierPublicKeyRawRepresentation,
            challenge: challenge,
            manifest: manifest,
            runtimeLaunchPolicy: runtimeLaunchPolicy,
            enrollment: enrollment,
            observation: observation,
            supervisorProcessIdentity: supervisorProcessIdentity,
            verifierProcessIdentity: verifierProcessIdentity,
            nowUnixSeconds: nowUnixSeconds
        )
        try attestation.verify(
            publicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation,
            challenge: challenge,
            receipt: receipt,
            manifest: manifest,
            runtimeLaunchPolicy: runtimeLaunchPolicy,
            supervisorProcessIdentity: supervisorProcessIdentity,
            childProcessIdentity: childProcessIdentity,
            expectedChildAnonymousFDChannelBindingSHA256:
                childAnonymousFDChannelBindingSHA256,
            nowUnixSeconds: nowUnixSeconds
        )
        let challengeDigest = challenge.canonicalSHA256()
        let receiptDigest = receipt.canonicalSHA256()
        let childDigest = childProcessIdentity.canonicalSHA256()
        lock.lock()
        defer { lock.unlock() }
        guard
            !consumedAttestations.contains(attestation.attestationID),
            !consumedChallenges.contains(challengeDigest),
            !consumedReceipts.contains(receiptDigest),
            !consumedChildProcesses.contains(childDigest)
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        consumedAttestations.insert(attestation.attestationID)
        consumedChallenges.insert(challengeDigest)
        consumedReceipts.insert(receiptDigest)
        consumedChildProcesses.insert(childDigest)
    }
}
