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
        expectedActivationHead: ExpectedActivationHeadV1,
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPreimageClosure:
            RuntimeLaunchPreimageClosureV1,
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
            expectedActivationHead: expectedActivationHead,
            nowUnixSeconds: nowUnixSeconds
        )
        try manifest.validateAuthorityKeySeparation(
            expectedActivationHead.authoritySignerKeyID
        )
        try manifest.validateEnrollment(state.activeEnrollment)
        try runtimeLaunchPreimageClosure.validate(
            sourceManifest: manifest
        )
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
            activationHeadSHA256:
                expectedActivationHead.canonicalSHA256(),
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
            activationHeadSHA256:
                expectedActivationHead.canonicalSHA256(),
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
        runtimeLaunchPreimageClosure:
            RuntimeLaunchPreimageClosureV1,
        expectedActivationHead: ExpectedActivationHeadV1,
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
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
            expectedActivationHead: expectedActivationHead,
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
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
            expectedActivationHead: expectedActivationHead,
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
    static let maximumReplayRetentionCount = 4_096

    private let supervisorProcessIdentity: ProcessIdentityV1
    private let replayRetentionCapacity: Int
    private let authorityStateStore: TrustRootAuthorityStateStoreV1
    private let lock = NSLock()
    private var lastWallClockSeconds: UInt64 = 0
    private var lastMonotonicNanoseconds: UInt64 = 0
    private var issuedChallenges: [CanonicalBytes32: UInt64] = [:]
    private var consumedChallenges: [CanonicalBytes32: UInt64] = [:]
    private var consumedReceipts: [CanonicalBytes32: UInt64] = [:]

    public convenience init(
        supervisorProcessIdentity: ProcessIdentityV1
    ) throws {
        try self.init(
            supervisorProcessIdentity: supervisorProcessIdentity,
            replayRetentionCapacity:
                Self.maximumReplayRetentionCount,
            authorityStateStore: .production
        )
    }

    convenience init(
        supervisorProcessIdentity: ProcessIdentityV1,
        replayRetentionCapacity: Int
    ) throws {
        try self.init(
            supervisorProcessIdentity: supervisorProcessIdentity,
            replayRetentionCapacity: replayRetentionCapacity,
            authorityStateStore: .production
        )
    }

    init(
        supervisorProcessIdentity: ProcessIdentityV1,
        replayRetentionCapacity: Int,
        authorityStateStore: TrustRootAuthorityStateStoreV1
    ) throws {
        guard supervisorProcessIdentity.role == .supervisor else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        guard
            replayRetentionCapacity > 0,
            replayRetentionCapacity
                <= Self.maximumReplayRetentionCount
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.supervisorProcessIdentity = supervisorProcessIdentity
        self.replayRetentionCapacity = replayRetentionCapacity
        self.authorityStateStore = authorityStateStore
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
        evictExpiredReplayEntries(nowUnixSeconds: wallClockSeconds)
        lastWallClockSeconds = wallClockSeconds
        lastMonotonicNanoseconds = monotonicNanoseconds
    }

    private func evictExpiredReplayEntries(
        nowUnixSeconds: UInt64
    ) {
        issuedChallenges = issuedChallenges.filter {
            $0.value > nowUnixSeconds
        }
        consumedChallenges = consumedChallenges.filter {
            $0.value > nowUnixSeconds
        }
        consumedReceipts = consumedReceipts.filter {
            $0.value > nowUnixSeconds
        }
    }

    func replayRetentionCountSnapshot()
        -> TrustRootSupervisorReplayRetentionCountSnapshotV1
    {
        lock.lock()
        defer { lock.unlock() }
        return TrustRootSupervisorReplayRetentionCountSnapshotV1(
            issuedChallengeCount: issuedChallenges.count,
            consumedChallengeCount: consumedChallenges.count,
            consumedReceiptCount: consumedReceipts.count
        )
    }

    public func issueChallenge(
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPreimageClosure:
            RuntimeLaunchPreimageClosureV1,
        verifierAnonymousFDChannelBindingSHA256: CanonicalBytes32,
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64,
        supervisorPublicKeyRawRepresentation: [UInt8],
        randomBytes: TrustRootRandomBytesProviderV1,
        sign: TrustRootSignatureProviderV1
    ) throws -> SupervisorChallengeV1 {
        try issueChallenge(
            enrollmentEnvelopes: enrollmentEnvelopes,
            activationEnvelopes: activationEnvelopes,
            manifest: manifest,
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
            verifierAnonymousFDChannelBindingSHA256:
                verifierAnonymousFDChannelBindingSHA256,
            nowUnixSeconds: nowUnixSeconds,
            nowMonotonicNanoseconds: nowMonotonicNanoseconds,
            supervisorPublicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation,
            randomBytes: randomBytes,
            sign: sign,
            authorityStateStore: authorityStateStore
        )
    }

    func issueChallenge(
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPreimageClosure:
            RuntimeLaunchPreimageClosureV1,
        verifierAnonymousFDChannelBindingSHA256: CanonicalBytes32,
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64,
        supervisorPublicKeyRawRepresentation: [UInt8],
        randomBytes: TrustRootRandomBytesProviderV1,
        sign: TrustRootSignatureProviderV1,
        authorityStateStore: TrustRootAuthorityStateStoreV1
    ) throws -> SupervisorChallengeV1 {
        let authorityState = try authorityStateStore.freshSnapshot()
        let challenge = try issueChallenge(
            enrollmentEnvelopes: enrollmentEnvelopes,
            activationEnvelopes: activationEnvelopes,
            authorityPublicKeyRawRepresentation:
                authorityState.authorityPublicKeyRawRepresentation,
            expectedActivationHead:
                authorityState.expectedActivationHead,
            manifest: manifest,
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
            verifierAnonymousFDChannelBindingSHA256:
                verifierAnonymousFDChannelBindingSHA256,
            nowUnixSeconds: nowUnixSeconds,
            nowMonotonicNanoseconds: nowMonotonicNanoseconds,
            supervisorPublicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation,
            randomBytes: randomBytes,
            sign: sign
        )
        _ = try authorityStateStore.requireUnchanged(
            authorityState.token
        )
        return challenge
    }

    func issueChallenge(
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        authorityPublicKeyRawRepresentation: [UInt8],
        expectedActivationHead: ExpectedActivationHeadV1,
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPreimageClosure:
            RuntimeLaunchPreimageClosureV1,
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
            expectedActivationHead: expectedActivationHead,
            manifest: manifest,
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
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
        evictExpiredReplayEntries(
            nowUnixSeconds: lastWallClockSeconds
        )
        let challengeDigest = challenge.canonicalSHA256()
        guard
            nowUnixSeconds == lastWallClockSeconds,
            nowMonotonicNanoseconds == lastMonotonicNanoseconds,
            challenge.expiresAtUnixSeconds > lastWallClockSeconds,
            issuedChallenges[challengeDigest] == nil,
            issuedChallenges.count + consumedChallenges.count
                < replayRetentionCapacity
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        issuedChallenges[challengeDigest] =
            challenge.expiresAtUnixSeconds
        return challenge
    }

    public func issueAttestation(
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        challenge: SupervisorChallengeV1,
        receipt: VerifierReceiptV1,
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPreimageClosure:
            RuntimeLaunchPreimageClosureV1,
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
        try issueAttestation(
            enrollmentEnvelopes: enrollmentEnvelopes,
            activationEnvelopes: activationEnvelopes,
            challenge: challenge,
            receipt: receipt,
            manifest: manifest,
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
            observation: observation,
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
            sign: sign,
            authorityStateStore: authorityStateStore
        )
    }

    func issueAttestation(
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        challenge: SupervisorChallengeV1,
        receipt: VerifierReceiptV1,
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPreimageClosure:
            RuntimeLaunchPreimageClosureV1,
        observation: RepositoryObservationV1,
        verifierProcessIdentity: ProcessIdentityV1,
        supervisorPublicKeyRawRepresentation: [UInt8],
        verifierPublicKeyRawRepresentation: [UInt8],
        childProcessIdentity: ProcessIdentityV1,
        childAnonymousFDChannelBindingSHA256: CanonicalBytes32,
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64,
        randomBytes: TrustRootRandomBytesProviderV1,
        sign: TrustRootSignatureProviderV1,
        authorityStateStore: TrustRootAuthorityStateStoreV1
    ) throws -> OneShotAttestationV1 {
        let authorityState = try authorityStateStore.freshSnapshot()
        let authenticatedState =
            try AuthenticatedProtocolStateV1.replay(
                enrollmentEnvelopes: enrollmentEnvelopes,
                activationEnvelopes: activationEnvelopes,
                authorityPublicKeyRawRepresentation:
                    authorityState
                    .authorityPublicKeyRawRepresentation,
                expectedActivationHead:
                    authorityState.expectedActivationHead,
                nowUnixSeconds: nowUnixSeconds
            )
        let attestation = try issueAttestation(
            challenge: challenge,
            receipt: receipt,
            manifest: manifest,
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
            expectedActivationHead:
                authorityState.expectedActivationHead,
            enrollment: authenticatedState.activeEnrollment,
            observation: observation,
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
        _ = try authorityStateStore.requireUnchanged(
            authorityState.token
        )
        return attestation
    }

    func issueAttestation(
        challenge: SupervisorChallengeV1,
        receipt: VerifierReceiptV1,
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPreimageClosure:
            RuntimeLaunchPreimageClosureV1,
        expectedActivationHead: ExpectedActivationHeadV1,
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
        evictExpiredReplayEntries(
            nowUnixSeconds: lastWallClockSeconds
        )
        let issuedChallengeExpiry =
            issuedChallenges[challengeDigest]
        let accepted =
            nowUnixSeconds == lastWallClockSeconds
            && nowMonotonicNanoseconds == lastMonotonicNanoseconds
            && issuedChallengeExpiry != nil
            && consumedChallenges[challengeDigest] == nil
            && consumedReceipts[receiptDigest] == nil
            && consumedReceipts.count < replayRetentionCapacity
        if accepted, let issuedChallengeExpiry {
            issuedChallenges.removeValue(forKey: challengeDigest)
            consumedChallenges[challengeDigest] =
                issuedChallengeExpiry
            consumedReceipts[receiptDigest] =
                issuedChallengeExpiry
        }
        lock.unlock()
        guard accepted else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        return try TrustRootSupervisorCoreV1.issueAttestation(
            challenge: challenge,
            receipt: receipt,
            manifest: manifest,
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
            expectedActivationHead: expectedActivationHead,
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

struct TrustRootSupervisorReplayRetentionCountSnapshotV1:
    Equatable, Sendable
{
    let issuedChallengeCount: Int
    let consumedChallengeCount: Int
    let consumedReceiptCount: Int
}

public enum TrustRootVerifierCoreV1 {
    public static func issueReceipt(
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        challenge: SupervisorChallengeV1,
        supervisorPublicKeyRawRepresentation: [UInt8],
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPreimageClosure:
            RuntimeLaunchPreimageClosureV1,
        observation: RepositoryObservationV1,
        supervisorProcessIdentity: ProcessIdentityV1,
        verifierProcessIdentity: ProcessIdentityV1,
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64,
        verifierPublicKeyRawRepresentation: [UInt8],
        randomBytes: TrustRootRandomBytesProviderV1,
        sign: TrustRootSignatureProviderV1
    ) throws -> VerifierReceiptV1 {
        try issueReceipt(
            enrollmentEnvelopes: enrollmentEnvelopes,
            activationEnvelopes: activationEnvelopes,
            challenge: challenge,
            supervisorPublicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation,
            manifest: manifest,
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
            observation: observation,
            supervisorProcessIdentity: supervisorProcessIdentity,
            verifierProcessIdentity: verifierProcessIdentity,
            nowUnixSeconds: nowUnixSeconds,
            nowMonotonicNanoseconds: nowMonotonicNanoseconds,
            verifierPublicKeyRawRepresentation:
                verifierPublicKeyRawRepresentation,
            randomBytes: randomBytes,
            sign: sign,
            authorityStateStore: .production
        )
    }

    static func issueReceipt(
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        challenge: SupervisorChallengeV1,
        supervisorPublicKeyRawRepresentation: [UInt8],
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPreimageClosure:
            RuntimeLaunchPreimageClosureV1,
        observation: RepositoryObservationV1,
        supervisorProcessIdentity: ProcessIdentityV1,
        verifierProcessIdentity: ProcessIdentityV1,
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64,
        verifierPublicKeyRawRepresentation: [UInt8],
        randomBytes: TrustRootRandomBytesProviderV1,
        sign: TrustRootSignatureProviderV1,
        authorityStateStore: TrustRootAuthorityStateStoreV1
    ) throws -> VerifierReceiptV1 {
        let authorityState = try authorityStateStore.freshSnapshot()
        let receipt = try issueReceipt(
            enrollmentEnvelopes: enrollmentEnvelopes,
            activationEnvelopes: activationEnvelopes,
            authorityPublicKeyRawRepresentation:
                authorityState.authorityPublicKeyRawRepresentation,
            expectedActivationHead:
                authorityState.expectedActivationHead,
            challenge: challenge,
            supervisorPublicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation,
            manifest: manifest,
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
            observation: observation,
            supervisorProcessIdentity: supervisorProcessIdentity,
            verifierProcessIdentity: verifierProcessIdentity,
            nowUnixSeconds: nowUnixSeconds,
            nowMonotonicNanoseconds: nowMonotonicNanoseconds,
            verifierPublicKeyRawRepresentation:
                verifierPublicKeyRawRepresentation,
            randomBytes: randomBytes,
            sign: sign
        )
        _ = try authorityStateStore.requireUnchanged(
            authorityState.token
        )
        return receipt
    }

    static func issueReceipt(
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        authorityPublicKeyRawRepresentation: [UInt8],
        expectedActivationHead: ExpectedActivationHeadV1,
        challenge: SupervisorChallengeV1,
        supervisorPublicKeyRawRepresentation: [UInt8],
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPreimageClosure:
            RuntimeLaunchPreimageClosureV1,
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
            expectedActivationHead: expectedActivationHead,
            nowUnixSeconds: nowUnixSeconds
        )
        try manifest.validateAuthorityKeySeparation(
            expectedActivationHead.authoritySignerKeyID
        )
        try manifest.validateEnrollment(state.activeEnrollment)
        try runtimeLaunchPreimageClosure.validate(
            sourceManifest: manifest
        )
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
            challenge.activationHeadSHA256
                == expectedActivationHead.canonicalSHA256(),
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
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
            expectedActivationHead: expectedActivationHead,
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
    static let maximumReplayRetentionCount = 4_096

    private let replayRetentionCapacity: Int
    private let authorityStateStore: TrustRootAuthorityStateStoreV1
    private let lock = NSLock()
    private var lastWallClockSeconds: UInt64 = 0
    private var lastMonotonicNanoseconds: UInt64 = 0
    private var consumedAttestations: [CanonicalBytes32: UInt64] = [:]
    private var consumedChallenges: [CanonicalBytes32: UInt64] = [:]
    private var consumedReceipts: [CanonicalBytes32: UInt64] = [:]
    private var consumedChildProcesses: [CanonicalBytes32: UInt64] = [:]

    public init() {
        replayRetentionCapacity =
            Self.maximumReplayRetentionCount
        authorityStateStore = .production
    }

    convenience init(replayRetentionCapacity: Int) throws {
        try self.init(
            replayRetentionCapacity: replayRetentionCapacity,
            authorityStateStore: .production
        )
    }

    init(
        replayRetentionCapacity: Int,
        authorityStateStore: TrustRootAuthorityStateStoreV1
    ) throws {
        guard
            replayRetentionCapacity > 0,
            replayRetentionCapacity
                <= Self.maximumReplayRetentionCount
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        self.replayRetentionCapacity = replayRetentionCapacity
        self.authorityStateStore = authorityStateStore
    }

    private func advanceClockAndEvict(
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
        evictExpiredReplayEntries(nowUnixSeconds: wallClockSeconds)
        lastWallClockSeconds = wallClockSeconds
        lastMonotonicNanoseconds = monotonicNanoseconds
    }

    private func evictExpiredReplayEntries(
        nowUnixSeconds: UInt64
    ) {
        consumedAttestations = consumedAttestations.filter {
            $0.value > nowUnixSeconds
        }
        consumedChallenges = consumedChallenges.filter {
            $0.value > nowUnixSeconds
        }
        consumedReceipts = consumedReceipts.filter {
            $0.value > nowUnixSeconds
        }
        consumedChildProcesses = consumedChildProcesses.filter {
            $0.value > nowUnixSeconds
        }
    }

    func replayRetentionCountSnapshot()
        -> OneShotAttestationReplayRetentionCountSnapshotV1
    {
        lock.lock()
        defer { lock.unlock() }
        return OneShotAttestationReplayRetentionCountSnapshotV1(
            consumedAttestationCount: consumedAttestations.count,
            consumedChallengeCount: consumedChallenges.count,
            consumedReceiptCount: consumedReceipts.count,
            consumedChildProcessCount:
                consumedChildProcesses.count
        )
    }

    public func consume(
        _ attestation: OneShotAttestationV1,
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        supervisorPublicKeyRawRepresentation: [UInt8],
        verifierPublicKeyRawRepresentation: [UInt8],
        challenge: SupervisorChallengeV1,
        receipt: VerifierReceiptV1,
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPreimageClosure:
            RuntimeLaunchPreimageClosureV1,
        observation: RepositoryObservationV1,
        supervisorProcessIdentity: ProcessIdentityV1,
        verifierProcessIdentity: ProcessIdentityV1,
        childProcessIdentity: ProcessIdentityV1,
        childAnonymousFDChannelBindingSHA256: CanonicalBytes32,
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64
    ) throws {
        try consume(
            attestation,
            enrollmentEnvelopes: enrollmentEnvelopes,
            activationEnvelopes: activationEnvelopes,
            supervisorPublicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation,
            verifierPublicKeyRawRepresentation:
                verifierPublicKeyRawRepresentation,
            challenge: challenge,
            receipt: receipt,
            manifest: manifest,
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
            observation: observation,
            supervisorProcessIdentity: supervisorProcessIdentity,
            verifierProcessIdentity: verifierProcessIdentity,
            childProcessIdentity: childProcessIdentity,
            childAnonymousFDChannelBindingSHA256:
                childAnonymousFDChannelBindingSHA256,
            nowUnixSeconds: nowUnixSeconds,
            nowMonotonicNanoseconds: nowMonotonicNanoseconds,
            authorityStateStore: authorityStateStore
        )
    }

    func consume(
        _ attestation: OneShotAttestationV1,
        enrollmentEnvelopes: [SignedEnrollmentRecordV1],
        activationEnvelopes: [SignedActivationRecordV1],
        supervisorPublicKeyRawRepresentation: [UInt8],
        verifierPublicKeyRawRepresentation: [UInt8],
        challenge: SupervisorChallengeV1,
        receipt: VerifierReceiptV1,
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPreimageClosure:
            RuntimeLaunchPreimageClosureV1,
        observation: RepositoryObservationV1,
        supervisorProcessIdentity: ProcessIdentityV1,
        verifierProcessIdentity: ProcessIdentityV1,
        childProcessIdentity: ProcessIdentityV1,
        childAnonymousFDChannelBindingSHA256: CanonicalBytes32,
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64,
        authorityStateStore: TrustRootAuthorityStateStoreV1
    ) throws {
        let authorityState = try authorityStateStore.freshSnapshot()
        let authenticatedState =
            try AuthenticatedProtocolStateV1.replay(
                enrollmentEnvelopes: enrollmentEnvelopes,
                activationEnvelopes: activationEnvelopes,
                authorityPublicKeyRawRepresentation:
                    authorityState
                    .authorityPublicKeyRawRepresentation,
                expectedActivationHead:
                    authorityState.expectedActivationHead,
                nowUnixSeconds: nowUnixSeconds
            )
        try consume(
            attestation,
            supervisorPublicKeyRawRepresentation:
                supervisorPublicKeyRawRepresentation,
            verifierPublicKeyRawRepresentation:
                verifierPublicKeyRawRepresentation,
            challenge: challenge,
            receipt: receipt,
            manifest: manifest,
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
            expectedActivationHead:
                authorityState.expectedActivationHead,
            enrollment: authenticatedState.activeEnrollment,
            observation: observation,
            supervisorProcessIdentity: supervisorProcessIdentity,
            verifierProcessIdentity: verifierProcessIdentity,
            childProcessIdentity: childProcessIdentity,
            childAnonymousFDChannelBindingSHA256:
                childAnonymousFDChannelBindingSHA256,
            nowUnixSeconds: nowUnixSeconds,
            nowMonotonicNanoseconds: nowMonotonicNanoseconds
        )
        _ = try authorityStateStore.requireUnchanged(
            authorityState.token
        )
    }

    func consume(
        _ attestation: OneShotAttestationV1,
        supervisorPublicKeyRawRepresentation: [UInt8],
        verifierPublicKeyRawRepresentation: [UInt8],
        challenge: SupervisorChallengeV1,
        receipt: VerifierReceiptV1,
        manifest: RepositorySourceManifestV1,
        runtimeLaunchPreimageClosure:
            RuntimeLaunchPreimageClosureV1,
        expectedActivationHead: ExpectedActivationHeadV1,
        enrollment: EnrollmentRecord,
        observation: RepositoryObservationV1,
        supervisorProcessIdentity: ProcessIdentityV1,
        verifierProcessIdentity: ProcessIdentityV1,
        childProcessIdentity: ProcessIdentityV1,
        childAnonymousFDChannelBindingSHA256: CanonicalBytes32,
        nowUnixSeconds: UInt64,
        nowMonotonicNanoseconds: UInt64
    ) throws {
        try advanceClockAndEvict(
            wallClockSeconds: nowUnixSeconds,
            monotonicNanoseconds: nowMonotonicNanoseconds
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
        try receipt.verify(
            publicKeyRawRepresentation:
                verifierPublicKeyRawRepresentation,
            challenge: challenge,
            manifest: manifest,
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
            expectedActivationHead: expectedActivationHead,
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
            runtimeLaunchPreimageClosure:
                runtimeLaunchPreimageClosure,
            expectedActivationHead: expectedActivationHead,
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
        evictExpiredReplayEntries(
            nowUnixSeconds: lastWallClockSeconds
        )
        guard
            nowUnixSeconds == lastWallClockSeconds,
            nowMonotonicNanoseconds == lastMonotonicNanoseconds,
            consumedAttestations[attestation.attestationID] == nil,
            consumedChallenges[challengeDigest] == nil,
            consumedReceipts[receiptDigest] == nil,
            consumedChildProcesses[childDigest] == nil,
            consumedAttestations.count < replayRetentionCapacity,
            consumedChallenges.count < replayRetentionCapacity,
            consumedReceipts.count < replayRetentionCapacity,
            consumedChildProcesses.count < replayRetentionCapacity
        else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        consumedAttestations[attestation.attestationID] =
            attestation.expiresAtUnixSeconds
        consumedChallenges[challengeDigest] =
            challenge.expiresAtUnixSeconds
        consumedReceipts[receiptDigest] =
            receipt.expiresAtUnixSeconds
        consumedChildProcesses[childDigest] =
            attestation.expiresAtUnixSeconds
    }
}

struct OneShotAttestationReplayRetentionCountSnapshotV1:
    Equatable, Sendable
{
    let consumedAttestationCount: Int
    let consumedChallengeCount: Int
    let consumedReceiptCount: Int
    let consumedChildProcessCount: Int
}
