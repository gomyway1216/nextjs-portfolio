import CryptoKit
import Foundation
import XCTest

@testable import FloodgateV7ExternalTrustRootProtocol

private func handoffBytes20(_ value: UInt8) -> CanonicalBytes20 {
    try! CanonicalBytes20(Array(repeating: value, count: 20))
}

private func handoffBytes32(_ value: UInt8) -> CanonicalBytes32 {
    try! CanonicalBytes32(Array(repeating: value, count: 32))
}

private func handoffSignature(
    _ key: Curve25519.Signing.PrivateKey,
    payload: [UInt8]
) throws -> CanonicalBytes64 {
    try CanonicalBytes64(
        Array(try key.signature(for: Data(payload)))
    )
}

private func handoffSigner(
    _ key: Curve25519.Signing.PrivateKey
) -> TrustRootSignatureProviderV1 {
    { payload in
        Array(try key.signature(for: Data(payload)))
    }
}

private final class FixedRandomSequence: @unchecked Sendable {
    private let lock = NSLock()
    private var next: UInt8

    init(start: UInt8) {
        next = start
    }

    func bytes(count: Int) throws -> [UInt8] {
        lock.lock()
        defer { lock.unlock() }
        guard count == 32, next > 0, next < UInt8.max else {
            throw CanonicalRecordError.invalidCanonicalRecord
        }
        defer { next &+= 1 }
        return Array(repeating: next, count: count)
    }

    var provider: TrustRootRandomBytesProviderV1 {
        { [self] count in
            try bytes(count: count)
        }
    }
}

private struct HandoffFixture {
    let authorityKey = Curve25519.Signing.PrivateKey()
    let supervisorKey = Curve25519.Signing.PrivateKey()
    let verifierKey = Curve25519.Signing.PrivateKey()
    let runtimeInstallPolicy: RuntimeInstallPolicyRecordV1
    let runtimeLaunchPolicy: RuntimeLaunchPolicyRecordV1
    let runtimeLaunchPreimageClosure:
        RuntimeLaunchPreimageClosureV1
    let manifest: RepositorySourceManifestV1
    let enrollment: EnrollmentRecord
    let signedEnrollment: SignedEnrollmentRecordV1
    let activation: ActivationRecord
    let signedActivation: SignedActivationRecordV1
    let expectedActivationHead: ExpectedActivationHeadV1
    let supervisorProcessIdentity: ProcessIdentityV1
    let verifierProcessIdentity: ProcessIdentityV1
    let childProcessIdentity: ProcessIdentityV1
    let observation: RepositoryObservationV1

    init() throws {
        let fixedArgv = FixedArgvRecordV1()
        let fixedWorkingDirectory =
            FixedWorkingDirectoryRecordV1()
        let fixedEnvironment = FixedEnvironmentRecordV1()
        runtimeInstallPolicy = try RuntimeInstallPolicyRecordV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            recordID: handoffBytes32(0x05),
            nodeWholeFileSHA256: handoffBytes32(0x70),
            nodeCodeDirectorySHA256: handoffBytes32(0x97),
            nodeDesignatedRequirementSHA256:
                handoffBytes32(0x98),
            nodeHeldExecutableIdentitySHA256:
                handoffBytes32(0x99),
            diagnosticEntryBundleWholeFileSHA256:
                handoffBytes32(0x50),
            diagnosticEntryBundleHeldFileIdentitySHA256:
                handoffBytes32(0x51),
            filesystemIdentityPolicySHA256:
                handoffBytes32(0x52),
            aclPolicySHA256: handoffBytes32(0x53)
        )
        runtimeLaunchPolicy = try RuntimeLaunchPolicyRecordV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            recordID: handoffBytes32(0x01),
            fixedArgvSHA256: fixedArgv.canonicalSHA256(),
            fixedWorkingDirectorySHA256:
                fixedWorkingDirectory.canonicalSHA256(),
            fixedEnvironmentSHA256:
                fixedEnvironment.canonicalSHA256(),
            runtimeInstallPolicySHA256:
                runtimeInstallPolicy.canonicalSHA256(),
            diagnosticEntryBundleSHA256:
                runtimeInstallPolicy
                    .diagnosticEntryBundleWholeFileSHA256
        )
        manifest = try RepositorySourceManifestV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            manifestID: handoffBytes32(0x10),
            approvedCommit: handoffBytes20(0x20),
            approvedTree: handoffBytes20(0x30),
            repositorySourceClosureSHA256: handoffBytes32(0x40),
            diagnosticBundleSHA256: handoffBytes32(0x50),
            diagnosticLauncherJXASHA256: handoffBytes32(0x60),
            pinnedNodeRuntimeSHA256: handoffBytes32(0x70),
            runtimeLaunchPolicySHA256:
                runtimeLaunchPolicy.canonicalSHA256(),
            supervisorArtifactSHA256: handoffBytes32(0x80),
            verifierArtifactSHA256: handoffBytes32(0x90),
            supervisorCodeDirectorySHA256: handoffBytes32(0x91),
            supervisorDesignatedRequirementSHA256:
                handoffBytes32(0x92),
            supervisorHeldExecutableIdentitySHA256:
                handoffBytes32(0x93),
            verifierCodeDirectorySHA256: handoffBytes32(0x94),
            verifierDesignatedRequirementSHA256:
                handoffBytes32(0x95),
            verifierHeldExecutableIdentitySHA256:
                handoffBytes32(0x96),
            pinnedNodeCodeDirectorySHA256: handoffBytes32(0x97),
            pinnedNodeDesignatedRequirementSHA256:
                handoffBytes32(0x98),
            pinnedNodeHeldExecutableIdentitySHA256:
                handoffBytes32(0x99),
            supervisorAttestationKeyID:
                try TrustRootSignatureV1.signerKeyID(
                    publicKeyRawRepresentation:
                        Array(supervisorKey.publicKey.rawRepresentation)
                ),
            verifierAttestationKeyID:
                try TrustRootSignatureV1.signerKeyID(
                    publicKeyRawRepresentation:
                        Array(verifierKey.publicKey.rawRepresentation)
                ),
            gitDirectoryPolicySHA256: handoffBytes32(0xa0),
            repositoryPathPolicySHA256: handoffBytes32(0xb0),
            artifactClosureRecordSHA256: handoffBytes32(0xc0),
            installPolicyRecordSHA256: handoffBytes32(0xd0)
        )
        runtimeLaunchPreimageClosure =
            try RuntimeLaunchPreimageClosureV1(
                fixedArgv: fixedArgv,
                fixedWorkingDirectory: fixedWorkingDirectory,
                fixedEnvironment: fixedEnvironment,
                runtimeInstallPolicy: runtimeInstallPolicy,
                runtimeLaunchPolicy: runtimeLaunchPolicy,
                sourceManifest: manifest
            )
        enrollment = try EnrollmentRecord(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            expectedUID: 501,
            enrollmentID: handoffBytes32(0xe0),
            approvedCommit: manifest.approvedCommit,
            approvedTree: manifest.approvedTree,
            sourceManifestSHA256: manifest.canonicalSHA256(),
            supervisorArtifactSHA256:
                manifest.supervisorArtifactSHA256,
            childArtifactSHA256: manifest.diagnosticBundleSHA256,
            runtimeClosureSHA256: manifest.pinnedNodeRuntimeSHA256,
            notBeforeUnixSeconds: 100,
            expiresAtUnixSeconds: 1_000
        )
        let authorityKeyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation:
                Array(authorityKey.publicKey.rawRepresentation)
        )
        let enrollmentPayload =
            try SignedEnrollmentRecordV1.signaturePayload(
                record: enrollment,
                signerKeyID: authorityKeyID
            )
        signedEnrollment = try SignedEnrollmentRecordV1(
            signerKeyID: authorityKeyID,
            record: enrollment,
            signature: try handoffSignature(
                authorityKey,
                payload: enrollmentPayload
            )
        )
        activation = try ActivationRecord(
            audience: .productionRecovery,
            action: .activate,
            sequence: 1,
            activationID: handoffBytes32(0xe1),
            targetEnrollmentID: enrollment.enrollmentID,
            previousActivationDigest: .zero,
            issuedAtUnixSeconds: 101
        )
        let activationPayload =
            try SignedActivationRecordV1.signaturePayload(
                record: activation,
                signerKeyID: authorityKeyID
            )
        signedActivation = try SignedActivationRecordV1(
            signerKeyID: authorityKeyID,
            record: activation,
            signature: try handoffSignature(
                authorityKey,
                payload: activationPayload
            )
        )
        expectedActivationHead = try ExpectedActivationHeadV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            authoritySignerKeyID: authorityKeyID,
            latestActivationSequence: activation.sequence,
            latestActivationEnvelopeSHA256:
                signedActivation.canonicalSHA256(),
            activeEnrollmentEnvelopeSHA256:
                signedEnrollment.canonicalSHA256(),
            activeEnrollmentRecordSHA256:
                enrollment.canonicalSHA256()
        )
        supervisorProcessIdentity = try ProcessIdentityV1(
            audience: .productionRecovery,
            role: .supervisor,
            processID: 12_345,
            parentProcessID: 1,
            effectiveUID: enrollment.expectedUID,
            processUniqueID: 0x1001,
            startTimeNanoseconds: 1_000_000,
            executableWholeFileSHA256:
                manifest.supervisorArtifactSHA256,
            codeDirectorySHA256:
                manifest.supervisorCodeDirectorySHA256,
            designatedRequirementSHA256:
                manifest.supervisorDesignatedRequirementSHA256,
            auditTokenSHA256: handoffBytes32(0xe2),
            parentProcessIdentitySHA256: handoffBytes32(0xe3),
            anonymousFDChannelBindingSHA256: .zero,
            heldExecutableIdentitySHA256:
                manifest.supervisorHeldExecutableIdentitySHA256
        )
        verifierProcessIdentity = try ProcessIdentityV1(
            audience: .productionRecovery,
            role: .verifier,
            processID: 12_346,
            parentProcessID: supervisorProcessIdentity.processID,
            effectiveUID: enrollment.expectedUID,
            processUniqueID: 0x1002,
            startTimeNanoseconds: 1_000_001,
            executableWholeFileSHA256:
                manifest.verifierArtifactSHA256,
            codeDirectorySHA256:
                manifest.verifierCodeDirectorySHA256,
            designatedRequirementSHA256:
                manifest.verifierDesignatedRequirementSHA256,
            auditTokenSHA256: handoffBytes32(0xe4),
            parentProcessIdentitySHA256:
                supervisorProcessIdentity.canonicalSHA256(),
            anonymousFDChannelBindingSHA256:
                handoffBytes32(0xe5),
            heldExecutableIdentitySHA256:
                manifest.verifierHeldExecutableIdentitySHA256
        )
        childProcessIdentity = try ProcessIdentityV1(
            audience: .productionRecovery,
            role: .diagnosticChild,
            processID: 23_456,
            parentProcessID: supervisorProcessIdentity.processID,
            effectiveUID: enrollment.expectedUID,
            processUniqueID: 0x1003,
            startTimeNanoseconds: 1_000_002,
            executableWholeFileSHA256:
                manifest.pinnedNodeRuntimeSHA256,
            codeDirectorySHA256:
                manifest.pinnedNodeCodeDirectorySHA256,
            designatedRequirementSHA256:
                manifest.pinnedNodeDesignatedRequirementSHA256,
            auditTokenSHA256: handoffBytes32(0xe6),
            parentProcessIdentitySHA256:
                supervisorProcessIdentity.canonicalSHA256(),
            anonymousFDChannelBindingSHA256:
                handoffBytes32(0xe7),
            heldExecutableIdentitySHA256:
                manifest.pinnedNodeHeldExecutableIdentitySHA256
        )
        observation = try RepositoryObservationV1(
            approvedCommit: manifest.approvedCommit,
            approvedTree: manifest.approvedTree,
            repositorySourceClosureSHA256:
                manifest.repositorySourceClosureSHA256,
            diagnosticBundleSHA256: manifest.diagnosticBundleSHA256,
            diagnosticLauncherJXASHA256:
                manifest.diagnosticLauncherJXASHA256,
            pinnedNodeRuntimeSHA256: manifest.pinnedNodeRuntimeSHA256,
            supervisorArtifactSHA256:
                manifest.supervisorArtifactSHA256,
            verifierArtifactSHA256:
                manifest.verifierArtifactSHA256,
            gitDirectoryPolicySHA256:
                manifest.gitDirectoryPolicySHA256,
            repositoryPathPolicySHA256:
                manifest.repositoryPathPolicySHA256,
            artifactClosureRecordSHA256:
                manifest.artifactClosureRecordSHA256,
            installPolicyRecordSHA256:
                manifest.installPolicyRecordSHA256,
            targetProcessIdentitySHA256:
                supervisorProcessIdentity.canonicalSHA256(),
            targetProcessID: supervisorProcessIdentity.processID,
            effectiveUID: enrollment.expectedUID,
            exactCleanRepository: true,
            heldNoFollowIdentities: true,
            gitDirectoryCommonDirectoryAndObjectDirectoryVerified: true,
            gitAlternatesAbsent: true,
            gitReplacementObjectsAbsent: true,
            callerSuppliedPathAccepted: false
        )
    }

    var authorityPublicKey: [UInt8] {
        Array(authorityKey.publicKey.rawRepresentation)
    }

    var supervisorPublicKey: [UInt8] {
        Array(supervisorKey.publicKey.rawRepresentation)
    }

    var verifierPublicKey: [UInt8] {
        Array(verifierKey.publicKey.rawRepresentation)
    }
}

private func assertInvalidHandoff<T>(
    _ expression: @autoclosure () throws -> T,
    file: StaticString = #filePath,
    line: UInt = #line
) {
    XCTAssertThrowsError(try expression(), file: file, line: line) { error in
        XCTAssertEqual(
            error as? CanonicalRecordError,
            .invalidCanonicalRecord,
            file: file,
            line: line
        )
    }
}

final class AuthenticatedHandoffTests: XCTestCase {
    func testSignedAuthorityRecordsRoundTripAndReplayToOneActiveState()
        throws
    {
        let fixture = try HandoffFixture()

        XCTAssertEqual(
            fixture.signedEnrollment.canonicalBytes().count,
            SignedEnrollmentRecordV1.canonicalByteCount
        )
        XCTAssertEqual(
            fixture.signedActivation.canonicalBytes().count,
            SignedActivationRecordV1.canonicalByteCount
        )
        XCTAssertEqual(
            try SignedEnrollmentRecordV1.decodeCanonical(
                fixture.signedEnrollment.canonicalBytes()
            ),
            fixture.signedEnrollment
        )
        XCTAssertEqual(
            try SignedActivationRecordV1.decodeCanonical(
                fixture.signedActivation.canonicalBytes()
            ),
            fixture.signedActivation
        )

        let snapshot = try AuthenticatedProtocolStateV1.replay(
            enrollmentEnvelopes: [fixture.signedEnrollment],
            activationEnvelopes: [fixture.signedActivation],
            authorityPublicKeyRawRepresentation:
                fixture.authorityPublicKey,
            expectedActivationHead:
                fixture.expectedActivationHead,
            nowUnixSeconds: 120
        )
        XCTAssertEqual(snapshot.activeEnrollment, fixture.enrollment)
        XCTAssertEqual(snapshot.enrollmentCount, 1)
        XCTAssertEqual(snapshot.activationCount, 1)
        XCTAssertEqual(
            snapshot.lastActivationEnvelopeSHA256,
            fixture.signedActivation.canonicalSHA256()
        )
        XCTAssertEqual(
            snapshot.activeEnrollmentEnvelopeSHA256,
            fixture.signedEnrollment.canonicalSHA256()
        )

        let wrongKey = Curve25519.Signing.PrivateKey()
        assertInvalidHandoff(
            try fixture.signedEnrollment.verifiedRecord(
                publicKeyRawRepresentation:
                    Array(wrongKey.publicKey.rawRepresentation)
            )
        )
        var tampered = fixture.signedActivation.canonicalBytes()
        tampered[tampered.count - 1] ^= 1
        let decoded = try SignedActivationRecordV1.decodeCanonical(tampered)
        assertInvalidHandoff(
            try decoded.verifiedRecord(
                publicKeyRawRepresentation:
                    fixture.authorityPublicKey
            )
        )
        assertInvalidHandoff(
            try SignedEnrollmentRecordV1.decodeCanonical(
                fixture.signedEnrollment.canonicalBytes() + [0]
            )
        )
    }

    func testExpectedHeadSelectsTheExactActiveEnrollmentEnvelope()
        throws
    {
        let fixture = try HandoffFixture()
        let alternateEnrollment = try EnrollmentRecord(
            audience: fixture.enrollment.audience,
            purpose: fixture.enrollment.purpose,
            expectedUID: fixture.enrollment.expectedUID,
            enrollmentID: fixture.enrollment.enrollmentID,
            approvedCommit: handoffBytes20(0x21),
            approvedTree: fixture.enrollment.approvedTree,
            sourceManifestSHA256:
                fixture.enrollment.sourceManifestSHA256,
            supervisorArtifactSHA256:
                fixture.enrollment.supervisorArtifactSHA256,
            childArtifactSHA256:
                fixture.enrollment.childArtifactSHA256,
            runtimeClosureSHA256:
                fixture.enrollment.runtimeClosureSHA256,
            notBeforeUnixSeconds:
                fixture.enrollment.notBeforeUnixSeconds,
            expiresAtUnixSeconds:
                fixture.enrollment.expiresAtUnixSeconds
        )
        let alternatePayload =
            try SignedEnrollmentRecordV1.signaturePayload(
                record: alternateEnrollment,
                signerKeyID:
                    fixture.expectedActivationHead
                    .authoritySignerKeyID
            )
        let alternateEnvelope = try SignedEnrollmentRecordV1(
            signerKeyID:
                fixture.expectedActivationHead.authoritySignerKeyID,
            record: alternateEnrollment,
            signature: try handoffSignature(
                fixture.authorityKey,
                payload: alternatePayload
            )
        )

        assertInvalidHandoff(
            try AuthenticatedProtocolStateV1.replay(
                enrollmentEnvelopes: [alternateEnvelope],
                activationEnvelopes: [fixture.signedActivation],
                authorityPublicKeyRawRepresentation:
                    fixture.authorityPublicKey,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                nowUnixSeconds: 120
            )
        )

        let alternateHead = try ExpectedActivationHeadV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            authoritySignerKeyID:
                fixture.expectedActivationHead.authoritySignerKeyID,
            latestActivationSequence:
                fixture.expectedActivationHead.latestActivationSequence,
            latestActivationEnvelopeSHA256:
                fixture.expectedActivationHead
                .latestActivationEnvelopeSHA256,
            activeEnrollmentEnvelopeSHA256:
                alternateEnvelope.canonicalSHA256(),
            activeEnrollmentRecordSHA256:
                alternateEnrollment.canonicalSHA256()
        )
        let alternateSnapshot =
            try AuthenticatedProtocolStateV1.replay(
                enrollmentEnvelopes: [alternateEnvelope],
                activationEnvelopes: [fixture.signedActivation],
                authorityPublicKeyRawRepresentation:
                    fixture.authorityPublicKey,
                expectedActivationHead: alternateHead,
                nowUnixSeconds: 120
            )
        XCTAssertEqual(
            alternateSnapshot.activeEnrollment,
            alternateEnrollment
        )
    }

    func testExpectedHeadRejectsTruncatedActivationHistoryAndRoleKeyReuse()
        throws
    {
        let fixture = try HandoffFixture()
        XCTAssertEqual(
            fixture.expectedActivationHead.canonicalBytes().count,
            ExpectedActivationHeadV1.canonicalByteCount
        )
        XCTAssertEqual(
            try ExpectedActivationHeadV1.decodeCanonical(
                fixture.expectedActivationHead.canonicalBytes()
            ),
            fixture.expectedActivationHead
        )

        let revoke = try ActivationRecord(
            audience: .productionRecovery,
            action: .revoke,
            sequence: 2,
            activationID: handoffBytes32(0xee),
            targetEnrollmentID: fixture.enrollment.enrollmentID,
            previousActivationDigest:
                fixture.activation.canonicalSHA256(),
            issuedAtUnixSeconds: 125
        )
        let revokePayload =
            try SignedActivationRecordV1.signaturePayload(
                record: revoke,
                signerKeyID:
                    fixture.expectedActivationHead
                    .authoritySignerKeyID
            )
        let signedRevoke = try SignedActivationRecordV1(
            signerKeyID:
                fixture.expectedActivationHead.authoritySignerKeyID,
            record: revoke,
            signature: try handoffSignature(
                fixture.authorityKey,
                payload: revokePayload
            )
        )
        let currentHead = try ExpectedActivationHeadV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            authoritySignerKeyID:
                fixture.expectedActivationHead.authoritySignerKeyID,
            latestActivationSequence: revoke.sequence,
            latestActivationEnvelopeSHA256:
                signedRevoke.canonicalSHA256(),
            activeEnrollmentEnvelopeSHA256:
                fixture.signedEnrollment.canonicalSHA256(),
            activeEnrollmentRecordSHA256:
                fixture.enrollment.canonicalSHA256()
        )
        assertInvalidHandoff(
            try AuthenticatedProtocolStateV1.replay(
                enrollmentEnvelopes: [fixture.signedEnrollment],
                activationEnvelopes: [fixture.signedActivation],
                authorityPublicKeyRawRepresentation:
                    fixture.authorityPublicKey,
                expectedActivationHead: currentHead,
                nowUnixSeconds: 126
            )
        )
        assertInvalidHandoff(
            try fixture.manifest.validateAuthorityKeySeparation(
                fixture.manifest.supervisorAttestationKeyID
            )
        )
        assertInvalidHandoff(
            try fixture.manifest.validateAuthorityKeySeparation(
                fixture.manifest.verifierAttestationKeyID
            )
        )
    }

    func testManifestAndFreshSignedHandoffAreExactAndOneShot()
        throws
    {
        let fixture = try HandoffFixture()
        let session = try TrustRootSupervisorSessionV1(
            supervisorProcessIdentity:
                fixture.supervisorProcessIdentity
        )
        let challengeRandom = FixedRandomSequence(start: 0x11)
        let challenge = try session.issueChallenge(
            enrollmentEnvelopes: [fixture.signedEnrollment],
            activationEnvelopes: [fixture.signedActivation],
            authorityPublicKeyRawRepresentation:
                fixture.authorityPublicKey,
            expectedActivationHead:
                fixture.expectedActivationHead,
            manifest: fixture.manifest,
            runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
            verifierAnonymousFDChannelBindingSHA256:
                fixture.verifierProcessIdentity
                    .anonymousFDChannelBindingSHA256,
            nowUnixSeconds: 120,
            nowMonotonicNanoseconds: 1_000_000_000,
            supervisorPublicKeyRawRepresentation:
                fixture.supervisorPublicKey,
            randomBytes: challengeRandom.provider,
            sign: handoffSigner(fixture.supervisorKey)
        )
        XCTAssertEqual(
            challenge.canonicalBytes().count,
            SupervisorChallengeV1.canonicalByteCount
        )
        XCTAssertEqual(challenge.expiresAtUnixSeconds, 150)

        let receiptRandom = FixedRandomSequence(start: 0x21)
        let receipt = try TrustRootVerifierCoreV1.issueReceipt(
            enrollmentEnvelopes: [fixture.signedEnrollment],
            activationEnvelopes: [fixture.signedActivation],
            authorityPublicKeyRawRepresentation:
                fixture.authorityPublicKey,
            expectedActivationHead:
                fixture.expectedActivationHead,
            challenge: challenge,
            supervisorPublicKeyRawRepresentation:
                fixture.supervisorPublicKey,
            manifest: fixture.manifest,
            runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
            observation: fixture.observation,
            supervisorProcessIdentity:
                fixture.supervisorProcessIdentity,
            verifierProcessIdentity:
                fixture.verifierProcessIdentity,
            nowUnixSeconds: 121,
            nowMonotonicNanoseconds: 2_000_000_000,
            verifierPublicKeyRawRepresentation:
                fixture.verifierPublicKey,
            randomBytes: receiptRandom.provider,
            sign: handoffSigner(fixture.verifierKey)
        )
        XCTAssertEqual(
            receipt.canonicalBytes().count,
            VerifierReceiptV1.canonicalByteCount
        )
        XCTAssertEqual(receipt.expiresAtUnixSeconds, 150)
        let substitutedLifetimeEnrollment = try EnrollmentRecord(
            audience: fixture.enrollment.audience,
            purpose: fixture.enrollment.purpose,
            expectedUID: fixture.enrollment.expectedUID,
            enrollmentID: fixture.enrollment.enrollmentID,
            approvedCommit: fixture.enrollment.approvedCommit,
            approvedTree: fixture.enrollment.approvedTree,
            sourceManifestSHA256:
                fixture.enrollment.sourceManifestSHA256,
            supervisorArtifactSHA256:
                fixture.enrollment.supervisorArtifactSHA256,
            childArtifactSHA256:
                fixture.enrollment.childArtifactSHA256,
            runtimeClosureSHA256:
                fixture.enrollment.runtimeClosureSHA256,
            notBeforeUnixSeconds:
                fixture.enrollment.notBeforeUnixSeconds,
            expiresAtUnixSeconds:
                fixture.enrollment.expiresAtUnixSeconds - 1
        )
        assertInvalidHandoff(
            try receipt.verify(
                publicKeyRawRepresentation:
                    fixture.verifierPublicKey,
                challenge: challenge,
                manifest: fixture.manifest,
                runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                enrollment: substitutedLifetimeEnrollment,
                observation: fixture.observation,
                supervisorProcessIdentity:
                    fixture.supervisorProcessIdentity,
                verifierProcessIdentity:
                    fixture.verifierProcessIdentity,
                nowUnixSeconds: 122
            )
        )

        let attestationRandom = FixedRandomSequence(start: 0x31)
        let attestation =
            try session.issueAttestation(
                challenge: challenge,
                receipt: receipt,
                manifest: fixture.manifest,
                runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                enrollment: fixture.enrollment,
                observation: fixture.observation,
                verifierProcessIdentity:
                    fixture.verifierProcessIdentity,
                supervisorPublicKeyRawRepresentation:
                    fixture.supervisorPublicKey,
                verifierPublicKeyRawRepresentation:
                    fixture.verifierPublicKey,
                childProcessIdentity:
                    fixture.childProcessIdentity,
                childAnonymousFDChannelBindingSHA256:
                    fixture.childProcessIdentity
                        .anonymousFDChannelBindingSHA256,
                nowUnixSeconds: 122,
                nowMonotonicNanoseconds: 3_000_000_000,
                randomBytes: attestationRandom.provider,
                sign: handoffSigner(fixture.supervisorKey)
            )
        XCTAssertEqual(
            attestation.canonicalBytes().count,
            OneShotAttestationV1.canonicalByteCount
        )
        XCTAssertEqual(attestation.expiresAtUnixSeconds, 150)
        XCTAssertEqual(
            try SupervisorChallengeV1.decodeCanonical(
                challenge.canonicalBytes()
            ),
            challenge
        )
        XCTAssertEqual(
            try VerifierReceiptV1.decodeCanonical(
                receipt.canonicalBytes()
            ),
            receipt
        )
        XCTAssertEqual(
            try OneShotAttestationV1.decodeCanonical(
                attestation.canonicalBytes()
            ),
            attestation
        )

        func assertFinalConsumerRejects(
            _ head: ExpectedActivationHeadV1
        ) {
            assertInvalidHandoff(
                try OneShotAttestationConsumerV1().consume(
                    attestation,
                    supervisorPublicKeyRawRepresentation:
                        fixture.supervisorPublicKey,
                    verifierPublicKeyRawRepresentation:
                        fixture.verifierPublicKey,
                    challenge: challenge,
                    receipt: receipt,
                    manifest: fixture.manifest,
                    runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                    expectedActivationHead: head,
                    enrollment: fixture.enrollment,
                    observation: fixture.observation,
                    supervisorProcessIdentity:
                        fixture.supervisorProcessIdentity,
                    verifierProcessIdentity:
                        fixture.verifierProcessIdentity,
                    childProcessIdentity:
                        fixture.childProcessIdentity,
                    childAnonymousFDChannelBindingSHA256:
                        fixture.childProcessIdentity
                            .anonymousFDChannelBindingSHA256,
                    nowUnixSeconds: 123,
                    nowMonotonicNanoseconds: 4_000_000_000
                )
            )
        }
        assertFinalConsumerRejects(
            try ExpectedActivationHeadV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                authoritySignerKeyID:
                    fixture.expectedActivationHead
                    .authoritySignerKeyID,
                latestActivationSequence:
                    fixture.expectedActivationHead
                    .latestActivationSequence + 1,
                latestActivationEnvelopeSHA256:
                    handoffBytes32(0xf8),
                activeEnrollmentEnvelopeSHA256:
                    fixture.expectedActivationHead
                    .activeEnrollmentEnvelopeSHA256,
                activeEnrollmentRecordSHA256:
                    fixture.expectedActivationHead
                    .activeEnrollmentRecordSHA256
            )
        )
        assertFinalConsumerRejects(
            try ExpectedActivationHeadV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                authoritySignerKeyID: handoffBytes32(0xf9),
                latestActivationSequence:
                    fixture.expectedActivationHead
                    .latestActivationSequence,
                latestActivationEnvelopeSHA256:
                    fixture.expectedActivationHead
                    .latestActivationEnvelopeSHA256,
                activeEnrollmentEnvelopeSHA256:
                    fixture.expectedActivationHead
                    .activeEnrollmentEnvelopeSHA256,
                activeEnrollmentRecordSHA256:
                    fixture.expectedActivationHead
                    .activeEnrollmentRecordSHA256
            )
        )
        assertFinalConsumerRejects(
            try ExpectedActivationHeadV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                authoritySignerKeyID:
                    fixture.expectedActivationHead
                    .authoritySignerKeyID,
                latestActivationSequence:
                    fixture.expectedActivationHead
                    .latestActivationSequence + 1,
                latestActivationEnvelopeSHA256:
                    fixture.expectedActivationHead
                    .latestActivationEnvelopeSHA256,
                activeEnrollmentEnvelopeSHA256:
                    fixture.expectedActivationHead
                    .activeEnrollmentEnvelopeSHA256,
                activeEnrollmentRecordSHA256:
                    fixture.expectedActivationHead
                    .activeEnrollmentRecordSHA256
            )
        )
        assertFinalConsumerRejects(
            try ExpectedActivationHeadV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                authoritySignerKeyID:
                    fixture.expectedActivationHead
                    .authoritySignerKeyID,
                latestActivationSequence:
                    fixture.expectedActivationHead
                    .latestActivationSequence,
                latestActivationEnvelopeSHA256:
                    fixture.expectedActivationHead
                    .latestActivationEnvelopeSHA256,
                activeEnrollmentEnvelopeSHA256:
                    handoffBytes32(0xfa),
                activeEnrollmentRecordSHA256:
                    fixture.expectedActivationHead
                    .activeEnrollmentRecordSHA256
            )
        )
        assertFinalConsumerRejects(
            try ExpectedActivationHeadV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                authoritySignerKeyID:
                    fixture.expectedActivationHead
                    .authoritySignerKeyID,
                latestActivationSequence:
                    fixture.expectedActivationHead
                    .latestActivationSequence,
                latestActivationEnvelopeSHA256:
                    fixture.expectedActivationHead
                    .latestActivationEnvelopeSHA256,
                activeEnrollmentEnvelopeSHA256:
                    fixture.expectedActivationHead
                    .activeEnrollmentEnvelopeSHA256,
                activeEnrollmentRecordSHA256:
                    handoffBytes32(0xfb)
            )
        )

        let consumer = OneShotAttestationConsumerV1()
        try consumer.consume(
            attestation,
            supervisorPublicKeyRawRepresentation:
                fixture.supervisorPublicKey,
            verifierPublicKeyRawRepresentation:
                fixture.verifierPublicKey,
            challenge: challenge,
            receipt: receipt,
            manifest: fixture.manifest,
            runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
            expectedActivationHead:
                fixture.expectedActivationHead,
            enrollment: fixture.enrollment,
            observation: fixture.observation,
            supervisorProcessIdentity:
                fixture.supervisorProcessIdentity,
            verifierProcessIdentity:
                fixture.verifierProcessIdentity,
            childProcessIdentity: fixture.childProcessIdentity,
            childAnonymousFDChannelBindingSHA256:
                fixture.childProcessIdentity
                    .anonymousFDChannelBindingSHA256,
            nowUnixSeconds: 123,
            nowMonotonicNanoseconds: 4_000_000_000
        )
        assertInvalidHandoff(
            try consumer.consume(
                attestation,
                supervisorPublicKeyRawRepresentation:
                    fixture.supervisorPublicKey,
                verifierPublicKeyRawRepresentation:
                    fixture.verifierPublicKey,
                challenge: challenge,
                receipt: receipt,
                manifest: fixture.manifest,
                runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                enrollment: fixture.enrollment,
                observation: fixture.observation,
                supervisorProcessIdentity:
                    fixture.supervisorProcessIdentity,
                verifierProcessIdentity:
                    fixture.verifierProcessIdentity,
                childProcessIdentity:
                    fixture.childProcessIdentity,
                childAnonymousFDChannelBindingSHA256:
                    fixture.childProcessIdentity
                        .anonymousFDChannelBindingSHA256,
                nowUnixSeconds: 123,
                nowMonotonicNanoseconds: 4_000_000_000
            )
        )
        assertInvalidHandoff(
            try session.issueAttestation(
                challenge: challenge,
                receipt: receipt,
                manifest: fixture.manifest,
                runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                enrollment: fixture.enrollment,
                observation: fixture.observation,
                verifierProcessIdentity:
                    fixture.verifierProcessIdentity,
                supervisorPublicKeyRawRepresentation:
                    fixture.supervisorPublicKey,
                verifierPublicKeyRawRepresentation:
                    fixture.verifierPublicKey,
                childProcessIdentity:
                    fixture.childProcessIdentity,
                childAnonymousFDChannelBindingSHA256:
                    fixture.childProcessIdentity
                        .anonymousFDChannelBindingSHA256,
                nowUnixSeconds: 124,
                nowMonotonicNanoseconds: 5_000_000_000,
                randomBytes:
                    FixedRandomSequence(start: 0x35).provider,
                sign: handoffSigner(fixture.supervisorKey)
            )
        )
    }

    func testHandoffRejectsExpiryProcessSubstitutionAndClosureDrift()
        throws
    {
        let fixture = try HandoffFixture()
        let challenge = try TrustRootSupervisorCoreV1.issueChallenge(
            enrollmentEnvelopes: [fixture.signedEnrollment],
            activationEnvelopes: [fixture.signedActivation],
            authorityPublicKeyRawRepresentation:
                fixture.authorityPublicKey,
            expectedActivationHead:
                fixture.expectedActivationHead,
            manifest: fixture.manifest,
            runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
            supervisorProcessIdentity:
                fixture.supervisorProcessIdentity,
            verifierAnonymousFDChannelBindingSHA256:
                fixture.verifierProcessIdentity
                    .anonymousFDChannelBindingSHA256,
            nowUnixSeconds: 120,
            nowMonotonicNanoseconds: 1_000_000_000,
            supervisorPublicKeyRawRepresentation:
                fixture.supervisorPublicKey,
            randomBytes: FixedRandomSequence(start: 0x41).provider,
            sign: handoffSigner(fixture.supervisorKey)
        )
        var driftedManifestBytes =
            fixture.manifest.canonicalBytes()
        // RepositorySourceManifestV1 places the repository-source
        // closure digest after its 12-byte header, 32-byte ID, and
        // two 20-byte Git identities.
        driftedManifestBytes[84] ^= 1
        let driftedManifest =
            try RepositorySourceManifestV1.decodeCanonical(
                driftedManifestBytes
            )
        let driftedRuntimeClosure =
            try RuntimeLaunchPreimageClosureV1(
                fixedArgv: FixedArgvRecordV1(),
                fixedWorkingDirectory:
                    FixedWorkingDirectoryRecordV1(),
                fixedEnvironment: FixedEnvironmentRecordV1(),
                runtimeInstallPolicy:
                    fixture.runtimeInstallPolicy,
                runtimeLaunchPolicy:
                    fixture.runtimeLaunchPolicy,
                sourceManifest: driftedManifest
            )
        assertInvalidHandoff(
            try TrustRootSupervisorCoreV1.issueChallenge(
                enrollmentEnvelopes: [fixture.signedEnrollment],
                activationEnvelopes: [fixture.signedActivation],
                authorityPublicKeyRawRepresentation:
                    fixture.authorityPublicKey,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                manifest: fixture.manifest,
                runtimeLaunchPreimageClosure:
                    driftedRuntimeClosure,
                supervisorProcessIdentity:
                    fixture.supervisorProcessIdentity,
                verifierAnonymousFDChannelBindingSHA256:
                    fixture.verifierProcessIdentity
                        .anonymousFDChannelBindingSHA256,
                nowUnixSeconds: 120,
                nowMonotonicNanoseconds: 1_000_000_000,
                supervisorPublicKeyRawRepresentation:
                    fixture.supervisorPublicKey,
                randomBytes:
                    FixedRandomSequence(start: 0x49).provider,
                sign: handoffSigner(fixture.supervisorKey)
            )
        )
        assertInvalidHandoff(
            try challenge.verify(
                publicKeyRawRepresentation:
                    fixture.supervisorPublicKey,
                nowUnixSeconds: challenge.expiresAtUnixSeconds,
                nowMonotonicNanoseconds: 2_000_000_000
            )
        )
        assertInvalidHandoff(
            try SupervisorChallengeV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                challengeID: handoffBytes32(0x51),
                nonce: handoffBytes32(0x52),
                enrollmentID: fixture.enrollment.enrollmentID,
                activationDigest:
                    fixture.signedActivation.canonicalSHA256(),
                activationHeadSHA256:
                    fixture.expectedActivationHead.canonicalSHA256(),
                sourceManifestSHA256:
                    fixture.manifest.canonicalSHA256(),
                targetProcessIdentitySHA256:
                    fixture.observation.targetProcessIdentitySHA256,
                supervisorProcessIdentitySHA256:
                    fixture.supervisorProcessIdentity.canonicalSHA256(),
                verifierAnonymousFDChannelBindingSHA256:
                    fixture.verifierProcessIdentity
                        .anonymousFDChannelBindingSHA256,
                signerKeyID: try TrustRootSignatureV1.signerKeyID(
                    publicKeyRawRepresentation:
                        fixture.supervisorPublicKey
                ),
                targetProcessID: fixture.observation.targetProcessID,
                expectedUID: fixture.enrollment.expectedUID,
                issuedAtUnixSeconds: 120,
                expiresAtUnixSeconds: 151,
                monotonicIssuedAtNanoseconds: 1_000_000_000,
                monotonicExpiresAtNanoseconds: 31_000_000_000,
                signature: try CanonicalBytes64(
                    Array(repeating: 1, count: 64)
                )
            )
        )

        let substituted = try RepositoryObservationV1(
            approvedCommit: fixture.manifest.approvedCommit,
            approvedTree: fixture.manifest.approvedTree,
            repositorySourceClosureSHA256:
                fixture.manifest.repositorySourceClosureSHA256,
            diagnosticBundleSHA256:
                fixture.manifest.diagnosticBundleSHA256,
            diagnosticLauncherJXASHA256:
                fixture.manifest.diagnosticLauncherJXASHA256,
            pinnedNodeRuntimeSHA256: handoffBytes32(0x71),
            supervisorArtifactSHA256:
                fixture.manifest.supervisorArtifactSHA256,
            verifierArtifactSHA256:
                fixture.manifest.verifierArtifactSHA256,
            gitDirectoryPolicySHA256:
                fixture.manifest.gitDirectoryPolicySHA256,
            repositoryPathPolicySHA256:
                fixture.manifest.repositoryPathPolicySHA256,
            artifactClosureRecordSHA256:
                fixture.manifest.artifactClosureRecordSHA256,
            installPolicyRecordSHA256:
                fixture.manifest.installPolicyRecordSHA256,
            targetProcessIdentitySHA256:
                fixture.observation.targetProcessIdentitySHA256,
            targetProcessID: fixture.observation.targetProcessID,
            effectiveUID: fixture.enrollment.expectedUID,
            exactCleanRepository: true,
            heldNoFollowIdentities: true,
            gitDirectoryCommonDirectoryAndObjectDirectoryVerified: true,
            gitAlternatesAbsent: true,
            gitReplacementObjectsAbsent: true,
            callerSuppliedPathAccepted: false
        )
        let badReceiptID = handoffBytes32(0x62)
        let badReceiptPayload =
            try VerifierReceiptV1.signaturePayload(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                receiptID: badReceiptID,
                challengeSHA256: challenge.canonicalSHA256(),
                enrollmentID: fixture.enrollment.enrollmentID,
                activationDigest:
                    fixture.signedActivation.canonicalSHA256(),
                sourceManifestSHA256:
                    fixture.manifest.canonicalSHA256(),
                repositoryObservationSHA256:
                    substituted.canonicalSHA256(),
                approvedCommit: fixture.enrollment.approvedCommit,
                approvedTree: fixture.enrollment.approvedTree,
                targetProcessIdentitySHA256:
                    challenge.targetProcessIdentitySHA256,
                verifierArtifactSHA256:
                    fixture.manifest.verifierArtifactSHA256,
                verifierProcessIdentitySHA256:
                    fixture.verifierProcessIdentity.canonicalSHA256(),
                signerKeyID:
                    fixture.manifest.verifierAttestationKeyID,
                targetProcessID: challenge.targetProcessID,
                expectedUID: challenge.expectedUID,
                issuedAtUnixSeconds: 121,
                expiresAtUnixSeconds: 150
            )
        let badReceipt = try VerifierReceiptV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            receiptID: badReceiptID,
            challengeSHA256: challenge.canonicalSHA256(),
            enrollmentID: fixture.enrollment.enrollmentID,
            activationDigest:
                fixture.signedActivation.canonicalSHA256(),
            sourceManifestSHA256:
                fixture.manifest.canonicalSHA256(),
            repositoryObservationSHA256:
                substituted.canonicalSHA256(),
            approvedCommit: fixture.enrollment.approvedCommit,
            approvedTree: fixture.enrollment.approvedTree,
            targetProcessIdentitySHA256:
                challenge.targetProcessIdentitySHA256,
            verifierArtifactSHA256:
                fixture.manifest.verifierArtifactSHA256,
            verifierProcessIdentitySHA256:
                fixture.verifierProcessIdentity.canonicalSHA256(),
            signerKeyID:
                fixture.manifest.verifierAttestationKeyID,
            targetProcessID: challenge.targetProcessID,
            expectedUID: challenge.expectedUID,
            issuedAtUnixSeconds: 121,
            expiresAtUnixSeconds: 150,
            signature: try handoffSignature(
                fixture.verifierKey,
                payload: badReceiptPayload
            )
        )
        assertInvalidHandoff(
            try badReceipt.verify(
                publicKeyRawRepresentation:
                    fixture.verifierPublicKey,
                challenge: challenge,
                manifest: fixture.manifest,
                runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                enrollment: fixture.enrollment,
                observation: substituted,
                supervisorProcessIdentity:
                    fixture.supervisorProcessIdentity,
                verifierProcessIdentity:
                    fixture.verifierProcessIdentity,
                nowUnixSeconds: 122
            )
        )
        assertInvalidHandoff(
            try TrustRootVerifierCoreV1.issueReceipt(
                enrollmentEnvelopes: [fixture.signedEnrollment],
                activationEnvelopes: [fixture.signedActivation],
                authorityPublicKeyRawRepresentation:
                    fixture.authorityPublicKey,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                challenge: challenge,
                supervisorPublicKeyRawRepresentation:
                    fixture.supervisorPublicKey,
                manifest: fixture.manifest,
                runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                observation: substituted,
                supervisorProcessIdentity:
                    fixture.supervisorProcessIdentity,
                verifierProcessIdentity:
                    fixture.verifierProcessIdentity,
                nowUnixSeconds: 121,
                nowMonotonicNanoseconds: 2_000_000_000,
                verifierPublicKeyRawRepresentation:
                    fixture.verifierPublicKey,
                randomBytes:
                    FixedRandomSequence(start: 0x61).provider,
                sign: handoffSigner(fixture.verifierKey)
            )
        )
        assertInvalidHandoff(
            try TrustRootVerifierCoreV1.issueReceipt(
                enrollmentEnvelopes: [fixture.signedEnrollment],
                activationEnvelopes: [fixture.signedActivation],
                authorityPublicKeyRawRepresentation:
                    fixture.authorityPublicKey,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                challenge: challenge,
                supervisorPublicKeyRawRepresentation:
                    fixture.supervisorPublicKey,
                manifest: fixture.manifest,
                runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                observation: fixture.observation,
                supervisorProcessIdentity:
                    fixture.supervisorProcessIdentity,
                verifierProcessIdentity:
                    fixture.verifierProcessIdentity,
                nowUnixSeconds: 121,
                nowMonotonicNanoseconds: 2_000_000_000,
                verifierPublicKeyRawRepresentation:
                    fixture.supervisorPublicKey,
                randomBytes:
                    FixedRandomSequence(start: 0x71).provider,
                sign: handoffSigner(fixture.supervisorKey)
            )
        )
    }

    func testObservationRequiresEveryFilesystemAndGitSafetyClaim()
        throws
    {
        let fixture = try HandoffFixture()
        assertInvalidHandoff(
            try RepositoryObservationV1(
                approvedCommit: fixture.manifest.approvedCommit,
                approvedTree: fixture.manifest.approvedTree,
                repositorySourceClosureSHA256:
                    fixture.manifest.repositorySourceClosureSHA256,
                diagnosticBundleSHA256:
                    fixture.manifest.diagnosticBundleSHA256,
                diagnosticLauncherJXASHA256:
                    fixture.manifest.diagnosticLauncherJXASHA256,
                pinnedNodeRuntimeSHA256:
                    fixture.manifest.pinnedNodeRuntimeSHA256,
                supervisorArtifactSHA256:
                    fixture.manifest.supervisorArtifactSHA256,
                verifierArtifactSHA256:
                    fixture.manifest.verifierArtifactSHA256,
                gitDirectoryPolicySHA256:
                    fixture.manifest.gitDirectoryPolicySHA256,
                repositoryPathPolicySHA256:
                    fixture.manifest.repositoryPathPolicySHA256,
                artifactClosureRecordSHA256:
                    fixture.manifest.artifactClosureRecordSHA256,
                installPolicyRecordSHA256:
                    fixture.manifest.installPolicyRecordSHA256,
                targetProcessIdentitySHA256:
                    fixture.observation.targetProcessIdentitySHA256,
                targetProcessID: fixture.observation.targetProcessID,
                effectiveUID: fixture.enrollment.expectedUID,
                exactCleanRepository: true,
                heldNoFollowIdentities: true,
                gitDirectoryCommonDirectoryAndObjectDirectoryVerified:
                    true,
                gitAlternatesAbsent: false,
                gitReplacementObjectsAbsent: true,
                callerSuppliedPathAccepted: false
            )
        )
        assertInvalidHandoff(
            try RepositoryObservationV1(
                approvedCommit: fixture.manifest.approvedCommit,
                approvedTree: fixture.manifest.approvedTree,
                repositorySourceClosureSHA256:
                    fixture.manifest.repositorySourceClosureSHA256,
                diagnosticBundleSHA256:
                    fixture.manifest.diagnosticBundleSHA256,
                diagnosticLauncherJXASHA256:
                    fixture.manifest.diagnosticLauncherJXASHA256,
                pinnedNodeRuntimeSHA256:
                    fixture.manifest.pinnedNodeRuntimeSHA256,
                supervisorArtifactSHA256:
                    fixture.manifest.supervisorArtifactSHA256,
                verifierArtifactSHA256:
                    fixture.manifest.verifierArtifactSHA256,
                gitDirectoryPolicySHA256:
                    fixture.manifest.gitDirectoryPolicySHA256,
                repositoryPathPolicySHA256:
                    fixture.manifest.repositoryPathPolicySHA256,
                artifactClosureRecordSHA256:
                    fixture.manifest.artifactClosureRecordSHA256,
                installPolicyRecordSHA256:
                    fixture.manifest.installPolicyRecordSHA256,
                targetProcessIdentitySHA256:
                    fixture.observation.targetProcessIdentitySHA256,
                targetProcessID: fixture.observation.targetProcessID,
                effectiveUID: fixture.enrollment.expectedUID,
                exactCleanRepository: true,
                heldNoFollowIdentities: true,
                gitDirectoryCommonDirectoryAndObjectDirectoryVerified:
                    true,
                gitAlternatesAbsent: true,
                gitReplacementObjectsAbsent: true,
                callerSuppliedPathAccepted: true
            )
        )
    }

    func testManifestRuntimePolicyAndProcessRecordsAreCanonical()
        throws
    {
        let fixture = try HandoffFixture()

        XCTAssertEqual(
            fixture.runtimeLaunchPolicy.canonicalBytes().count,
            RuntimeLaunchPolicyRecordV1.canonicalByteCount
        )
        XCTAssertEqual(
            try RuntimeLaunchPolicyRecordV1.decodeCanonical(
                fixture.runtimeLaunchPolicy.canonicalBytes()
            ),
            fixture.runtimeLaunchPolicy
        )
        XCTAssertEqual(
            fixture.manifest.canonicalBytes().count,
            RepositorySourceManifestV1.canonicalByteCount
        )
        XCTAssertEqual(
            try RepositorySourceManifestV1.decodeCanonical(
                fixture.manifest.canonicalBytes()
            ),
            fixture.manifest
        )
        for identity in [
            fixture.supervisorProcessIdentity,
            fixture.verifierProcessIdentity,
            fixture.childProcessIdentity,
        ] {
            XCTAssertEqual(
                identity.canonicalBytes().count,
                ProcessIdentityV1.canonicalByteCount
            )
            XCTAssertEqual(
                try ProcessIdentityV1.decodeCanonical(
                    identity.canonicalBytes()
                ),
                identity
            )
        }

        var changedFlag =
            fixture.runtimeLaunchPolicy.canonicalBytes()
        changedFlag[12] = 0
        assertInvalidHandoff(
            try RuntimeLaunchPolicyRecordV1.decodeCanonical(changedFlag)
        )
        assertInvalidHandoff(
            try RepositorySourceManifestV1.decodeCanonical(
                fixture.manifest.canonicalBytes() + [0]
            )
        )
        var nodeEqualsSupervisor = fixture.manifest.canonicalBytes()
        nodeEqualsSupervisor.replaceSubrange(
            180..<212,
            with: nodeEqualsSupervisor[244..<276]
        )
        assertInvalidHandoff(
            try RepositorySourceManifestV1.decodeCanonical(
                nodeEqualsSupervisor
            )
        )
        var nodeEqualsVerifier = fixture.manifest.canonicalBytes()
        nodeEqualsVerifier.replaceSubrange(
            180..<212,
            with: nodeEqualsVerifier[276..<308]
        )
        assertInvalidHandoff(
            try RepositorySourceManifestV1.decodeCanonical(
                nodeEqualsVerifier
            )
        )
        let substitutedPolicy = try RuntimeLaunchPolicyRecordV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            recordID: fixture.runtimeLaunchPolicy.recordID,
            fixedArgvSHA256: handoffBytes32(0xf1),
            fixedWorkingDirectorySHA256:
                fixture.runtimeLaunchPolicy
                    .fixedWorkingDirectorySHA256,
            fixedEnvironmentSHA256:
                fixture.runtimeLaunchPolicy.fixedEnvironmentSHA256,
            runtimeInstallPolicySHA256:
                fixture.runtimeLaunchPolicy
                    .runtimeInstallPolicySHA256,
            diagnosticEntryBundleSHA256:
                fixture.runtimeLaunchPolicy
                    .diagnosticEntryBundleSHA256
        )
        assertInvalidHandoff(
            try fixture.manifest.validateRuntimeLaunchPolicy(
                substitutedPolicy
            )
        )
    }

    func testSessionRejectsClockRollbackAndWrongRoleKey()
        throws
    {
        let fixture = try HandoffFixture()
        let session = try TrustRootSupervisorSessionV1(
            supervisorProcessIdentity:
                fixture.supervisorProcessIdentity
        )
        _ = try session.issueChallenge(
            enrollmentEnvelopes: [fixture.signedEnrollment],
            activationEnvelopes: [fixture.signedActivation],
            authorityPublicKeyRawRepresentation:
                fixture.authorityPublicKey,
            expectedActivationHead:
                fixture.expectedActivationHead,
            manifest: fixture.manifest,
            runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
            verifierAnonymousFDChannelBindingSHA256:
                fixture.verifierProcessIdentity
                    .anonymousFDChannelBindingSHA256,
            nowUnixSeconds: 120,
            nowMonotonicNanoseconds: 2_000_000_000,
            supervisorPublicKeyRawRepresentation:
                fixture.supervisorPublicKey,
            randomBytes:
                FixedRandomSequence(start: 0x81).provider,
            sign: handoffSigner(fixture.supervisorKey)
        )
        assertInvalidHandoff(
            try session.issueChallenge(
                enrollmentEnvelopes: [fixture.signedEnrollment],
                activationEnvelopes: [fixture.signedActivation],
                authorityPublicKeyRawRepresentation:
                    fixture.authorityPublicKey,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                manifest: fixture.manifest,
                runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                verifierAnonymousFDChannelBindingSHA256:
                    fixture.verifierProcessIdentity
                        .anonymousFDChannelBindingSHA256,
                nowUnixSeconds: 121,
                nowMonotonicNanoseconds: 1_999_999_999,
                supervisorPublicKeyRawRepresentation:
                    fixture.supervisorPublicKey,
                randomBytes:
                    FixedRandomSequence(start: 0x91).provider,
                sign: handoffSigner(fixture.supervisorKey)
            )
        )
        assertInvalidHandoff(
            try TrustRootSupervisorCoreV1.issueChallenge(
                enrollmentEnvelopes: [fixture.signedEnrollment],
                activationEnvelopes: [fixture.signedActivation],
                authorityPublicKeyRawRepresentation:
                    fixture.authorityPublicKey,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                manifest: fixture.manifest,
                runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                supervisorProcessIdentity:
                    fixture.supervisorProcessIdentity,
                verifierAnonymousFDChannelBindingSHA256:
                    fixture.verifierProcessIdentity
                        .anonymousFDChannelBindingSHA256,
                nowUnixSeconds: 120,
                nowMonotonicNanoseconds: 2_000_000_000,
                supervisorPublicKeyRawRepresentation:
                    fixture.verifierPublicKey,
                randomBytes:
                    FixedRandomSequence(start: 0xa1).provider,
                sign: handoffSigner(fixture.verifierKey)
            )
        )
    }

    func testSignedHandoffRejectsProcessAndChannelSubstitution()
        throws
    {
        let fixture = try HandoffFixture()
        let challenge = try TrustRootSupervisorCoreV1.issueChallenge(
            enrollmentEnvelopes: [fixture.signedEnrollment],
            activationEnvelopes: [fixture.signedActivation],
            authorityPublicKeyRawRepresentation:
                fixture.authorityPublicKey,
            expectedActivationHead:
                fixture.expectedActivationHead,
            manifest: fixture.manifest,
            runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
            supervisorProcessIdentity:
                fixture.supervisorProcessIdentity,
            verifierAnonymousFDChannelBindingSHA256:
                fixture.verifierProcessIdentity
                    .anonymousFDChannelBindingSHA256,
            nowUnixSeconds: 120,
            nowMonotonicNanoseconds: 1_000_000_000,
            supervisorPublicKeyRawRepresentation:
                fixture.supervisorPublicKey,
            randomBytes:
                FixedRandomSequence(start: 0xb1).provider,
            sign: handoffSigner(fixture.supervisorKey)
        )
        let receipt = try TrustRootVerifierCoreV1.issueReceipt(
            enrollmentEnvelopes: [fixture.signedEnrollment],
            activationEnvelopes: [fixture.signedActivation],
            authorityPublicKeyRawRepresentation:
                fixture.authorityPublicKey,
            expectedActivationHead:
                fixture.expectedActivationHead,
            challenge: challenge,
            supervisorPublicKeyRawRepresentation:
                fixture.supervisorPublicKey,
            manifest: fixture.manifest,
            runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
            observation: fixture.observation,
            supervisorProcessIdentity:
                fixture.supervisorProcessIdentity,
            verifierProcessIdentity:
                fixture.verifierProcessIdentity,
            nowUnixSeconds: 121,
            nowMonotonicNanoseconds: 2_000_000_000,
            verifierPublicKeyRawRepresentation:
                fixture.verifierPublicKey,
            randomBytes:
                FixedRandomSequence(start: 0xc1).provider,
            sign: handoffSigner(fixture.verifierKey)
        )
        let substitutedVerifier = try ProcessIdentityV1(
            audience: .productionRecovery,
            role: .verifier,
            processID: fixture.verifierProcessIdentity.processID,
            parentProcessID:
                fixture.verifierProcessIdentity.parentProcessID,
            effectiveUID:
                fixture.verifierProcessIdentity.effectiveUID,
            processUniqueID:
                fixture.verifierProcessIdentity.processUniqueID + 1,
            startTimeNanoseconds:
                fixture.verifierProcessIdentity
                    .startTimeNanoseconds,
            executableWholeFileSHA256:
                fixture.verifierProcessIdentity
                    .executableWholeFileSHA256,
            codeDirectorySHA256:
                fixture.verifierProcessIdentity.codeDirectorySHA256,
            designatedRequirementSHA256:
                fixture.verifierProcessIdentity
                    .designatedRequirementSHA256,
            auditTokenSHA256:
                fixture.verifierProcessIdentity.auditTokenSHA256,
            parentProcessIdentitySHA256:
                fixture.verifierProcessIdentity
                    .parentProcessIdentitySHA256,
            anonymousFDChannelBindingSHA256:
                fixture.verifierProcessIdentity
                    .anonymousFDChannelBindingSHA256,
            heldExecutableIdentitySHA256:
                fixture.verifierProcessIdentity
                    .heldExecutableIdentitySHA256
        )
        assertInvalidHandoff(
            try receipt.verify(
                publicKeyRawRepresentation:
                    fixture.verifierPublicKey,
                challenge: challenge,
                manifest: fixture.manifest,
                runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                enrollment: fixture.enrollment,
                observation: fixture.observation,
                supervisorProcessIdentity:
                    fixture.supervisorProcessIdentity,
                verifierProcessIdentity: substitutedVerifier,
                nowUnixSeconds: 122
            )
        )

        let attestation =
            try TrustRootSupervisorCoreV1.issueAttestation(
                challenge: challenge,
                receipt: receipt,
                manifest: fixture.manifest,
                runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                enrollment: fixture.enrollment,
                observation: fixture.observation,
                supervisorProcessIdentity:
                    fixture.supervisorProcessIdentity,
                verifierProcessIdentity:
                    fixture.verifierProcessIdentity,
                supervisorPublicKeyRawRepresentation:
                    fixture.supervisorPublicKey,
                verifierPublicKeyRawRepresentation:
                    fixture.verifierPublicKey,
                childProcessIdentity:
                    fixture.childProcessIdentity,
                childAnonymousFDChannelBindingSHA256:
                    fixture.childProcessIdentity
                        .anonymousFDChannelBindingSHA256,
                nowUnixSeconds: 122,
                nowMonotonicNanoseconds: 3_000_000_000,
                randomBytes:
                    FixedRandomSequence(start: 0xd1).provider,
                sign: handoffSigner(fixture.supervisorKey)
            )
        let substitutedChild = try ProcessIdentityV1(
            audience: .productionRecovery,
            role: .diagnosticChild,
            processID: fixture.childProcessIdentity.processID,
            parentProcessID:
                fixture.childProcessIdentity.parentProcessID,
            effectiveUID:
                fixture.childProcessIdentity.effectiveUID,
            processUniqueID:
                fixture.childProcessIdentity.processUniqueID,
            startTimeNanoseconds:
                fixture.childProcessIdentity.startTimeNanoseconds,
            executableWholeFileSHA256:
                fixture.childProcessIdentity
                    .executableWholeFileSHA256,
            codeDirectorySHA256:
                fixture.childProcessIdentity.codeDirectorySHA256,
            designatedRequirementSHA256:
                fixture.childProcessIdentity
                    .designatedRequirementSHA256,
            auditTokenSHA256:
                fixture.childProcessIdentity.auditTokenSHA256,
            parentProcessIdentitySHA256:
                fixture.childProcessIdentity
                    .parentProcessIdentitySHA256,
            anonymousFDChannelBindingSHA256:
                handoffBytes32(0xf2),
            heldExecutableIdentitySHA256:
                fixture.childProcessIdentity
                    .heldExecutableIdentitySHA256
        )
        assertInvalidHandoff(
            try attestation.verify(
                publicKeyRawRepresentation:
                    fixture.supervisorPublicKey,
                challenge: challenge,
                receipt: receipt,
                manifest: fixture.manifest,
                runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                supervisorProcessIdentity:
                    fixture.supervisorProcessIdentity,
                childProcessIdentity: substitutedChild,
                expectedChildAnonymousFDChannelBindingSHA256:
                    fixture.childProcessIdentity
                        .anonymousFDChannelBindingSHA256,
                nowUnixSeconds: 123
            )
        )
    }

    func testVerifierIndependentlyRejectsEverySupervisorIdentityDrift()
        throws
    {
        let fixture = try HandoffFixture()
        func supervisor(
            wholeFile: CanonicalBytes32? = nil,
            codeDirectory: CanonicalBytes32? = nil,
            designatedRequirement: CanonicalBytes32? = nil,
            heldExecutable: CanonicalBytes32? = nil
        ) throws -> ProcessIdentityV1 {
            try ProcessIdentityV1(
                audience: .productionRecovery,
                role: .supervisor,
                processID:
                    fixture.supervisorProcessIdentity.processID,
                parentProcessID:
                    fixture.supervisorProcessIdentity
                        .parentProcessID,
                effectiveUID:
                    fixture.supervisorProcessIdentity.effectiveUID,
                processUniqueID:
                    fixture.supervisorProcessIdentity.processUniqueID,
                startTimeNanoseconds:
                    fixture.supervisorProcessIdentity
                        .startTimeNanoseconds,
                executableWholeFileSHA256:
                    wholeFile
                    ?? fixture.supervisorProcessIdentity
                        .executableWholeFileSHA256,
                codeDirectorySHA256:
                    codeDirectory
                    ?? fixture.supervisorProcessIdentity
                        .codeDirectorySHA256,
                designatedRequirementSHA256:
                    designatedRequirement
                    ?? fixture.supervisorProcessIdentity
                        .designatedRequirementSHA256,
                auditTokenSHA256:
                    fixture.supervisorProcessIdentity
                        .auditTokenSHA256,
                parentProcessIdentitySHA256:
                    fixture.supervisorProcessIdentity
                        .parentProcessIdentitySHA256,
                anonymousFDChannelBindingSHA256: .zero,
                heldExecutableIdentitySHA256:
                    heldExecutable
                    ?? fixture.supervisorProcessIdentity
                        .heldExecutableIdentitySHA256
            )
        }
        let substitutions = try [
            supervisor(wholeFile: handoffBytes32(0xf3)),
            supervisor(codeDirectory: handoffBytes32(0xf4)),
            supervisor(designatedRequirement: handoffBytes32(0xf5)),
            supervisor(heldExecutable: handoffBytes32(0xf6)),
        ]

        for (index, substitutedSupervisor) in
            substitutions.enumerated()
        {
            assertInvalidHandoff(
                try substitutedSupervisor
                    .validateSupervisorAgainstManifest(
                        fixture.manifest,
                        expectedUID: fixture.enrollment.expectedUID
                    )
            )
            let challengeID =
                handoffBytes32(UInt8(0x31 + index * 2))
            let nonce =
                handoffBytes32(UInt8(0x32 + index * 2))
            let payload = try SupervisorChallengeV1.signaturePayload(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                challengeID: challengeID,
                nonce: nonce,
                enrollmentID: fixture.enrollment.enrollmentID,
                activationDigest:
                    fixture.signedActivation.canonicalSHA256(),
                activationHeadSHA256:
                    fixture.expectedActivationHead.canonicalSHA256(),
                sourceManifestSHA256:
                    fixture.manifest.canonicalSHA256(),
                targetProcessIdentitySHA256:
                    substitutedSupervisor.canonicalSHA256(),
                supervisorProcessIdentitySHA256:
                    substitutedSupervisor.canonicalSHA256(),
                verifierAnonymousFDChannelBindingSHA256:
                    fixture.verifierProcessIdentity
                        .anonymousFDChannelBindingSHA256,
                signerKeyID:
                    fixture.manifest.supervisorAttestationKeyID,
                targetProcessID: substitutedSupervisor.processID,
                expectedUID: fixture.enrollment.expectedUID,
                issuedAtUnixSeconds: 120,
                expiresAtUnixSeconds: 150,
                monotonicIssuedAtNanoseconds: 1_000_000_000,
                monotonicExpiresAtNanoseconds:
                    31_000_000_000
            )
            let challenge = try SupervisorChallengeV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                challengeID: challengeID,
                nonce: nonce,
                enrollmentID: fixture.enrollment.enrollmentID,
                activationDigest:
                    fixture.signedActivation.canonicalSHA256(),
                activationHeadSHA256:
                    fixture.expectedActivationHead.canonicalSHA256(),
                sourceManifestSHA256:
                    fixture.manifest.canonicalSHA256(),
                targetProcessIdentitySHA256:
                    substitutedSupervisor.canonicalSHA256(),
                supervisorProcessIdentitySHA256:
                    substitutedSupervisor.canonicalSHA256(),
                verifierAnonymousFDChannelBindingSHA256:
                    fixture.verifierProcessIdentity
                        .anonymousFDChannelBindingSHA256,
                signerKeyID:
                    fixture.manifest.supervisorAttestationKeyID,
                targetProcessID: substitutedSupervisor.processID,
                expectedUID: fixture.enrollment.expectedUID,
                issuedAtUnixSeconds: 120,
                expiresAtUnixSeconds: 150,
                monotonicIssuedAtNanoseconds: 1_000_000_000,
                monotonicExpiresAtNanoseconds:
                    31_000_000_000,
                signature: try handoffSignature(
                    fixture.supervisorKey,
                    payload: payload
                )
            )
            let substitutedVerifier = try ProcessIdentityV1(
                audience: .productionRecovery,
                role: .verifier,
                processID:
                    fixture.verifierProcessIdentity.processID,
                parentProcessID: substitutedSupervisor.processID,
                effectiveUID: fixture.enrollment.expectedUID,
                processUniqueID:
                    fixture.verifierProcessIdentity.processUniqueID,
                startTimeNanoseconds:
                    fixture.verifierProcessIdentity
                        .startTimeNanoseconds,
                executableWholeFileSHA256:
                    fixture.manifest.verifierArtifactSHA256,
                codeDirectorySHA256:
                    fixture.manifest.verifierCodeDirectorySHA256,
                designatedRequirementSHA256:
                    fixture.manifest
                        .verifierDesignatedRequirementSHA256,
                auditTokenSHA256:
                    fixture.verifierProcessIdentity.auditTokenSHA256,
                parentProcessIdentitySHA256:
                    substitutedSupervisor.canonicalSHA256(),
                anonymousFDChannelBindingSHA256:
                    fixture.verifierProcessIdentity
                        .anonymousFDChannelBindingSHA256,
                heldExecutableIdentitySHA256:
                    fixture.manifest
                        .verifierHeldExecutableIdentitySHA256
            )
            let substitutedObservation = try RepositoryObservationV1(
                approvedCommit: fixture.manifest.approvedCommit,
                approvedTree: fixture.manifest.approvedTree,
                repositorySourceClosureSHA256:
                    fixture.manifest.repositorySourceClosureSHA256,
                diagnosticBundleSHA256:
                    fixture.manifest.diagnosticBundleSHA256,
                diagnosticLauncherJXASHA256:
                    fixture.manifest.diagnosticLauncherJXASHA256,
                pinnedNodeRuntimeSHA256:
                    fixture.manifest.pinnedNodeRuntimeSHA256,
                supervisorArtifactSHA256:
                    fixture.manifest.supervisorArtifactSHA256,
                verifierArtifactSHA256:
                    fixture.manifest.verifierArtifactSHA256,
                gitDirectoryPolicySHA256:
                    fixture.manifest.gitDirectoryPolicySHA256,
                repositoryPathPolicySHA256:
                    fixture.manifest.repositoryPathPolicySHA256,
                artifactClosureRecordSHA256:
                    fixture.manifest.artifactClosureRecordSHA256,
                installPolicyRecordSHA256:
                    fixture.manifest.installPolicyRecordSHA256,
                targetProcessIdentitySHA256:
                    substitutedSupervisor.canonicalSHA256(),
                targetProcessID: substitutedSupervisor.processID,
                effectiveUID: fixture.enrollment.expectedUID,
                exactCleanRepository: true,
                heldNoFollowIdentities: true,
                gitDirectoryCommonDirectoryAndObjectDirectoryVerified:
                    true,
                gitAlternatesAbsent: true,
                gitReplacementObjectsAbsent: true,
                callerSuppliedPathAccepted: false
            )
            assertInvalidHandoff(
                try TrustRootVerifierCoreV1.issueReceipt(
                    enrollmentEnvelopes:
                        [fixture.signedEnrollment],
                    activationEnvelopes:
                        [fixture.signedActivation],
                    authorityPublicKeyRawRepresentation:
                        fixture.authorityPublicKey,
                    expectedActivationHead:
                        fixture.expectedActivationHead,
                    challenge: challenge,
                    supervisorPublicKeyRawRepresentation:
                        fixture.supervisorPublicKey,
                    manifest: fixture.manifest,
                    runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                    observation: substitutedObservation,
                    supervisorProcessIdentity:
                        substitutedSupervisor,
                    verifierProcessIdentity: substitutedVerifier,
                    nowUnixSeconds: 121,
                    nowMonotonicNanoseconds: 2_000_000_000,
                    verifierPublicKeyRawRepresentation:
                        fixture.verifierPublicKey,
                    randomBytes:
                        FixedRandomSequence(
                            start: UInt8(0xe1 + index)
                        ).provider,
                    sign: handoffSigner(fixture.verifierKey)
                )
            )
        }
    }

    func testVerifierRejectsTargetThatIsNotTheSupervisor()
        throws
    {
        let fixture = try HandoffFixture()
        let unrelatedTargetIdentity = handoffBytes32(0xf7)
        let unrelatedTargetProcessID: UInt32 = 9_999
        let challengeID = handoffBytes32(0x21)
        let nonce = handoffBytes32(0x22)
        let payload = try SupervisorChallengeV1.signaturePayload(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            challengeID: challengeID,
            nonce: nonce,
            enrollmentID: fixture.enrollment.enrollmentID,
            activationDigest:
                fixture.signedActivation.canonicalSHA256(),
            activationHeadSHA256:
                fixture.expectedActivationHead.canonicalSHA256(),
            sourceManifestSHA256:
                fixture.manifest.canonicalSHA256(),
            targetProcessIdentitySHA256: unrelatedTargetIdentity,
            supervisorProcessIdentitySHA256:
                fixture.supervisorProcessIdentity.canonicalSHA256(),
            verifierAnonymousFDChannelBindingSHA256:
                fixture.verifierProcessIdentity
                    .anonymousFDChannelBindingSHA256,
            signerKeyID:
                fixture.manifest.supervisorAttestationKeyID,
            targetProcessID: unrelatedTargetProcessID,
            expectedUID: fixture.enrollment.expectedUID,
            issuedAtUnixSeconds: 120,
            expiresAtUnixSeconds: 150,
            monotonicIssuedAtNanoseconds: 1_000_000_000,
            monotonicExpiresAtNanoseconds: 31_000_000_000
        )
        let challenge = try SupervisorChallengeV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            challengeID: challengeID,
            nonce: nonce,
            enrollmentID: fixture.enrollment.enrollmentID,
            activationDigest:
                fixture.signedActivation.canonicalSHA256(),
            activationHeadSHA256:
                fixture.expectedActivationHead.canonicalSHA256(),
            sourceManifestSHA256:
                fixture.manifest.canonicalSHA256(),
            targetProcessIdentitySHA256: unrelatedTargetIdentity,
            supervisorProcessIdentitySHA256:
                fixture.supervisorProcessIdentity.canonicalSHA256(),
            verifierAnonymousFDChannelBindingSHA256:
                fixture.verifierProcessIdentity
                    .anonymousFDChannelBindingSHA256,
            signerKeyID:
                fixture.manifest.supervisorAttestationKeyID,
            targetProcessID: unrelatedTargetProcessID,
            expectedUID: fixture.enrollment.expectedUID,
            issuedAtUnixSeconds: 120,
            expiresAtUnixSeconds: 150,
            monotonicIssuedAtNanoseconds: 1_000_000_000,
            monotonicExpiresAtNanoseconds: 31_000_000_000,
            signature: try handoffSignature(
                fixture.supervisorKey,
                payload: payload
            )
        )
        let observation = try RepositoryObservationV1(
            approvedCommit: fixture.manifest.approvedCommit,
            approvedTree: fixture.manifest.approvedTree,
            repositorySourceClosureSHA256:
                fixture.manifest.repositorySourceClosureSHA256,
            diagnosticBundleSHA256:
                fixture.manifest.diagnosticBundleSHA256,
            diagnosticLauncherJXASHA256:
                fixture.manifest.diagnosticLauncherJXASHA256,
            pinnedNodeRuntimeSHA256:
                fixture.manifest.pinnedNodeRuntimeSHA256,
            supervisorArtifactSHA256:
                fixture.manifest.supervisorArtifactSHA256,
            verifierArtifactSHA256:
                fixture.manifest.verifierArtifactSHA256,
            gitDirectoryPolicySHA256:
                fixture.manifest.gitDirectoryPolicySHA256,
            repositoryPathPolicySHA256:
                fixture.manifest.repositoryPathPolicySHA256,
            artifactClosureRecordSHA256:
                fixture.manifest.artifactClosureRecordSHA256,
            installPolicyRecordSHA256:
                fixture.manifest.installPolicyRecordSHA256,
            targetProcessIdentitySHA256: unrelatedTargetIdentity,
            targetProcessID: unrelatedTargetProcessID,
            effectiveUID: fixture.enrollment.expectedUID,
            exactCleanRepository: true,
            heldNoFollowIdentities: true,
            gitDirectoryCommonDirectoryAndObjectDirectoryVerified: true,
            gitAlternatesAbsent: true,
            gitReplacementObjectsAbsent: true,
            callerSuppliedPathAccepted: false
        )
        assertInvalidHandoff(
            try TrustRootVerifierCoreV1.issueReceipt(
                enrollmentEnvelopes: [fixture.signedEnrollment],
                activationEnvelopes: [fixture.signedActivation],
                authorityPublicKeyRawRepresentation:
                    fixture.authorityPublicKey,
                expectedActivationHead:
                    fixture.expectedActivationHead,
                challenge: challenge,
                supervisorPublicKeyRawRepresentation:
                    fixture.supervisorPublicKey,
                manifest: fixture.manifest,
                runtimeLaunchPreimageClosure: fixture.runtimeLaunchPreimageClosure,
                observation: observation,
                supervisorProcessIdentity:
                    fixture.supervisorProcessIdentity,
                verifierProcessIdentity:
                    fixture.verifierProcessIdentity,
                nowUnixSeconds: 121,
                nowMonotonicNanoseconds: 2_000_000_000,
                verifierPublicKeyRawRepresentation:
                    fixture.verifierPublicKey,
                randomBytes:
                    FixedRandomSequence(start: 0x23).provider,
                sign: handoffSigner(fixture.verifierKey)
            )
        )
    }
}
