import CryptoKit
import Foundation
import XCTest

@testable import FloodgateV7ExternalTrustRootProtocol

private func retentionBytes20(_ value: UInt8) -> CanonicalBytes20 {
    try! CanonicalBytes20(Array(repeating: value, count: 20))
}

private func retentionBytes32(_ value: UInt8) -> CanonicalBytes32 {
    try! CanonicalBytes32(Array(repeating: value, count: 32))
}

private func retentionSignature(
    _ key: Curve25519.Signing.PrivateKey,
    payload: [UInt8]
) throws -> CanonicalBytes64 {
    try CanonicalBytes64(
        Array(try key.signature(for: Data(payload)))
    )
}

private func retentionSigner(
    _ key: Curve25519.Signing.PrivateKey
) -> TrustRootSignatureProviderV1 {
    { payload in
        Array(try key.signature(for: Data(payload)))
    }
}

private final class RetentionRandomSequence: @unchecked Sendable {
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

private struct RetentionFixture {
    let authorityKey = Curve25519.Signing.PrivateKey()
    let supervisorKey = Curve25519.Signing.PrivateKey()
    let verifierKey = Curve25519.Signing.PrivateKey()
    let runtimeLaunchPolicy: RuntimeLaunchPolicyRecordV1
    let manifest: RepositorySourceManifestV1
    let enrollment: EnrollmentRecord
    let signedEnrollment: SignedEnrollmentRecordV1
    let signedActivation: SignedActivationRecordV1
    let expectedActivationHead: ExpectedActivationHeadV1
    let supervisorProcessIdentity: ProcessIdentityV1
    let verifierProcessIdentity: ProcessIdentityV1
    let childProcessIdentity: ProcessIdentityV1
    let observation: RepositoryObservationV1

    init(childProcessUniqueID: UInt64 = 0x1003) throws {
        runtimeLaunchPolicy = try RuntimeLaunchPolicyRecordV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            recordID: retentionBytes32(0x01),
            fixedArgvSHA256: retentionBytes32(0x02),
            fixedWorkingDirectorySHA256: retentionBytes32(0x03),
            fixedEnvironmentSHA256: retentionBytes32(0x04),
            runtimeInstallPolicySHA256: retentionBytes32(0x05),
            diagnosticEntryBundleSHA256: retentionBytes32(0x50)
        )
        manifest = try RepositorySourceManifestV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            manifestID: retentionBytes32(0x10),
            approvedCommit: retentionBytes20(0x20),
            approvedTree: retentionBytes20(0x30),
            repositorySourceClosureSHA256: retentionBytes32(0x40),
            diagnosticBundleSHA256: retentionBytes32(0x50),
            diagnosticLauncherJXASHA256: retentionBytes32(0x60),
            pinnedNodeRuntimeSHA256: retentionBytes32(0x70),
            runtimeLaunchPolicySHA256:
                runtimeLaunchPolicy.canonicalSHA256(),
            supervisorArtifactSHA256: retentionBytes32(0x80),
            verifierArtifactSHA256: retentionBytes32(0x90),
            supervisorCodeDirectorySHA256:
                retentionBytes32(0x91),
            supervisorDesignatedRequirementSHA256:
                retentionBytes32(0x92),
            supervisorHeldExecutableIdentitySHA256:
                retentionBytes32(0x93),
            verifierCodeDirectorySHA256:
                retentionBytes32(0x94),
            verifierDesignatedRequirementSHA256:
                retentionBytes32(0x95),
            verifierHeldExecutableIdentitySHA256:
                retentionBytes32(0x96),
            pinnedNodeCodeDirectorySHA256:
                retentionBytes32(0x97),
            pinnedNodeDesignatedRequirementSHA256:
                retentionBytes32(0x98),
            pinnedNodeHeldExecutableIdentitySHA256:
                retentionBytes32(0x99),
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
            gitDirectoryPolicySHA256: retentionBytes32(0xa0),
            repositoryPathPolicySHA256: retentionBytes32(0xb0),
            artifactClosureRecordSHA256: retentionBytes32(0xc0),
            installPolicyRecordSHA256: retentionBytes32(0xd0)
        )
        enrollment = try EnrollmentRecord(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            expectedUID: 501,
            enrollmentID: retentionBytes32(0xe0),
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
        signedEnrollment = try SignedEnrollmentRecordV1(
            signerKeyID: authorityKeyID,
            record: enrollment,
            signature: try retentionSignature(
                authorityKey,
                payload:
                    SignedEnrollmentRecordV1.signaturePayload(
                        record: enrollment,
                        signerKeyID: authorityKeyID
                    )
            )
        )
        let activation = try ActivationRecord(
            audience: .productionRecovery,
            action: .activate,
            sequence: 1,
            activationID: retentionBytes32(0xe1),
            targetEnrollmentID: enrollment.enrollmentID,
            previousActivationDigest: .zero,
            issuedAtUnixSeconds: 101
        )
        signedActivation = try SignedActivationRecordV1(
            signerKeyID: authorityKeyID,
            record: activation,
            signature: try retentionSignature(
                authorityKey,
                payload:
                    SignedActivationRecordV1.signaturePayload(
                        record: activation,
                        signerKeyID: authorityKeyID
                    )
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
            auditTokenSHA256: retentionBytes32(0xe2),
            parentProcessIdentitySHA256: retentionBytes32(0xe3),
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
            auditTokenSHA256: retentionBytes32(0xe4),
            parentProcessIdentitySHA256:
                supervisorProcessIdentity.canonicalSHA256(),
            anonymousFDChannelBindingSHA256:
                retentionBytes32(0xe5),
            heldExecutableIdentitySHA256:
                manifest.verifierHeldExecutableIdentitySHA256
        )
        childProcessIdentity = try ProcessIdentityV1(
            audience: .productionRecovery,
            role: .diagnosticChild,
            processID: 23_456,
            parentProcessID: supervisorProcessIdentity.processID,
            effectiveUID: enrollment.expectedUID,
            processUniqueID: childProcessUniqueID,
            startTimeNanoseconds: 1_000_002,
            executableWholeFileSHA256:
                manifest.pinnedNodeRuntimeSHA256,
            codeDirectorySHA256:
                manifest.pinnedNodeCodeDirectorySHA256,
            designatedRequirementSHA256:
                manifest.pinnedNodeDesignatedRequirementSHA256,
            auditTokenSHA256: retentionBytes32(0xe6),
            parentProcessIdentitySHA256:
                supervisorProcessIdentity.canonicalSHA256(),
            anonymousFDChannelBindingSHA256:
                retentionBytes32(0xe7),
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
            pinnedNodeRuntimeSHA256:
                manifest.pinnedNodeRuntimeSHA256,
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

private struct RetentionHandoff {
    let challenge: SupervisorChallengeV1
    let receipt: VerifierReceiptV1
    let attestation: OneShotAttestationV1
}

private func issueRetentionChallenge(
    fixture: RetentionFixture,
    session: TrustRootSupervisorSessionV1,
    issuedAtUnixSeconds: UInt64,
    issuedAtMonotonicNanoseconds: UInt64,
    randomStart: UInt8
) throws -> SupervisorChallengeV1 {
    try session.issueChallenge(
        enrollmentEnvelopes: [fixture.signedEnrollment],
        activationEnvelopes: [fixture.signedActivation],
        authorityPublicKeyRawRepresentation:
            fixture.authorityPublicKey,
        expectedActivationHead: fixture.expectedActivationHead,
        manifest: fixture.manifest,
        runtimeLaunchPolicy: fixture.runtimeLaunchPolicy,
        verifierAnonymousFDChannelBindingSHA256:
            fixture.verifierProcessIdentity
            .anonymousFDChannelBindingSHA256,
        nowUnixSeconds: issuedAtUnixSeconds,
        nowMonotonicNanoseconds:
            issuedAtMonotonicNanoseconds,
        supervisorPublicKeyRawRepresentation:
            fixture.supervisorPublicKey,
        randomBytes:
            RetentionRandomSequence(start: randomStart).provider,
        sign: retentionSigner(fixture.supervisorKey)
    )
}

private func makeRetentionHandoff(
    fixture: RetentionFixture,
    session: TrustRootSupervisorSessionV1,
    issuedAtUnixSeconds: UInt64,
    issuedAtMonotonicNanoseconds: UInt64,
    randomStart: UInt8
) throws -> RetentionHandoff {
    let challenge = try issueRetentionChallenge(
        fixture: fixture,
        session: session,
        issuedAtUnixSeconds: issuedAtUnixSeconds,
        issuedAtMonotonicNanoseconds:
            issuedAtMonotonicNanoseconds,
        randomStart: randomStart
    )
    let receipt = try TrustRootVerifierCoreV1.issueReceipt(
        enrollmentEnvelopes: [fixture.signedEnrollment],
        activationEnvelopes: [fixture.signedActivation],
        authorityPublicKeyRawRepresentation:
            fixture.authorityPublicKey,
        expectedActivationHead: fixture.expectedActivationHead,
        challenge: challenge,
        supervisorPublicKeyRawRepresentation:
            fixture.supervisorPublicKey,
        manifest: fixture.manifest,
        runtimeLaunchPolicy: fixture.runtimeLaunchPolicy,
        observation: fixture.observation,
        supervisorProcessIdentity:
            fixture.supervisorProcessIdentity,
        verifierProcessIdentity:
            fixture.verifierProcessIdentity,
        nowUnixSeconds: issuedAtUnixSeconds + 1,
        nowMonotonicNanoseconds:
            issuedAtMonotonicNanoseconds + 1_000_000_000,
        verifierPublicKeyRawRepresentation:
            fixture.verifierPublicKey,
        randomBytes:
            RetentionRandomSequence(
                start: randomStart &+ 2
            ).provider,
        sign: retentionSigner(fixture.verifierKey)
    )
    let attestation = try session.issueAttestation(
        challenge: challenge,
        receipt: receipt,
        manifest: fixture.manifest,
        runtimeLaunchPolicy: fixture.runtimeLaunchPolicy,
        expectedActivationHead: fixture.expectedActivationHead,
        enrollment: fixture.enrollment,
        observation: fixture.observation,
        verifierProcessIdentity:
            fixture.verifierProcessIdentity,
        supervisorPublicKeyRawRepresentation:
            fixture.supervisorPublicKey,
        verifierPublicKeyRawRepresentation:
            fixture.verifierPublicKey,
        childProcessIdentity: fixture.childProcessIdentity,
        childAnonymousFDChannelBindingSHA256:
            fixture.childProcessIdentity
            .anonymousFDChannelBindingSHA256,
        nowUnixSeconds: issuedAtUnixSeconds + 2,
        nowMonotonicNanoseconds:
            issuedAtMonotonicNanoseconds + 2_000_000_000,
        randomBytes:
            RetentionRandomSequence(
                start: randomStart &+ 3
            ).provider,
        sign: retentionSigner(fixture.supervisorKey)
    )
    return RetentionHandoff(
        challenge: challenge,
        receipt: receipt,
        attestation: attestation
    )
}

private func consumeRetentionHandoff(
    _ handoff: RetentionHandoff,
    fixture: RetentionFixture,
    consumer: OneShotAttestationConsumerV1,
    nowUnixSeconds: UInt64,
    nowMonotonicNanoseconds: UInt64
) throws {
    try consumer.consume(
        handoff.attestation,
        supervisorPublicKeyRawRepresentation:
            fixture.supervisorPublicKey,
        verifierPublicKeyRawRepresentation:
            fixture.verifierPublicKey,
        challenge: handoff.challenge,
        receipt: handoff.receipt,
        manifest: fixture.manifest,
        runtimeLaunchPolicy: fixture.runtimeLaunchPolicy,
        expectedActivationHead: fixture.expectedActivationHead,
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
        nowUnixSeconds: nowUnixSeconds,
        nowMonotonicNanoseconds: nowMonotonicNanoseconds
    )
}

private func assertInvalidRetention<T>(
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

final class ReplayRetentionTests: XCTestCase {
    func testReplayRemainsRejectedWithinCredentialLifetime() throws {
        let fixture = try RetentionFixture()
        let session = try TrustRootSupervisorSessionV1(
            supervisorProcessIdentity:
                fixture.supervisorProcessIdentity
        )
        let handoff = try makeRetentionHandoff(
            fixture: fixture,
            session: session,
            issuedAtUnixSeconds: 120,
            issuedAtMonotonicNanoseconds: 1_000_000_000,
            randomStart: 0x11
        )

        assertInvalidRetention(
            try session.issueAttestation(
                challenge: handoff.challenge,
                receipt: handoff.receipt,
                manifest: fixture.manifest,
                runtimeLaunchPolicy: fixture.runtimeLaunchPolicy,
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
                    RetentionRandomSequence(start: 0x21).provider,
                sign: retentionSigner(fixture.supervisorKey)
            )
        )
        XCTAssertEqual(
            session.replayRetentionCountSnapshot(),
            TrustRootSupervisorReplayRetentionCountSnapshotV1(
                issuedChallengeCount: 0,
                consumedChallengeCount: 1,
                consumedReceiptCount: 1
            )
        )

        let consumer = OneShotAttestationConsumerV1()
        try consumeRetentionHandoff(
            handoff,
            fixture: fixture,
            consumer: consumer,
            nowUnixSeconds: 123,
            nowMonotonicNanoseconds: 4_000_000_000
        )
        assertInvalidRetention(
            try consumeRetentionHandoff(
                handoff,
                fixture: fixture,
                consumer: consumer,
                nowUnixSeconds: 124,
                nowMonotonicNanoseconds: 5_000_000_000
            )
        )
        XCTAssertEqual(
            consumer.replayRetentionCountSnapshot(),
            OneShotAttestationReplayRetentionCountSnapshotV1(
                consumedAttestationCount: 1,
                consumedChallengeCount: 1,
                consumedReceiptCount: 1,
                consumedChildProcessCount: 1
            )
        )
    }

    func testExpiryEvictsReplayStateWithoutAllowingClockRollback()
        throws
    {
        let fixture = try RetentionFixture()
        let session = try TrustRootSupervisorSessionV1(
            supervisorProcessIdentity:
                fixture.supervisorProcessIdentity
        )
        let handoff = try makeRetentionHandoff(
            fixture: fixture,
            session: session,
            issuedAtUnixSeconds: 120,
            issuedAtMonotonicNanoseconds: 1_000_000_000,
            randomStart: 0x31
        )
        let consumer = OneShotAttestationConsumerV1()
        try consumeRetentionHandoff(
            handoff,
            fixture: fixture,
            consumer: consumer,
            nowUnixSeconds: 123,
            nowMonotonicNanoseconds: 4_000_000_000
        )

        assertInvalidRetention(
            try consumeRetentionHandoff(
                handoff,
                fixture: fixture,
                consumer: consumer,
                nowUnixSeconds: 150,
                nowMonotonicNanoseconds: 31_000_000_000
            )
        )
        XCTAssertEqual(
            consumer.replayRetentionCountSnapshot(),
            OneShotAttestationReplayRetentionCountSnapshotV1(
                consumedAttestationCount: 0,
                consumedChallengeCount: 0,
                consumedReceiptCount: 0,
                consumedChildProcessCount: 0
            )
        )
        assertInvalidRetention(
            try consumeRetentionHandoff(
                handoff,
                fixture: fixture,
                consumer: consumer,
                nowUnixSeconds: 149,
                nowMonotonicNanoseconds: 30_000_000_000
            )
        )

        assertInvalidRetention(
            try session.issueAttestation(
                challenge: handoff.challenge,
                receipt: handoff.receipt,
                manifest: fixture.manifest,
                runtimeLaunchPolicy: fixture.runtimeLaunchPolicy,
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
                nowUnixSeconds: 150,
                nowMonotonicNanoseconds: 31_000_000_000,
                randomBytes:
                    RetentionRandomSequence(start: 0x41).provider,
                sign: retentionSigner(fixture.supervisorKey)
            )
        )
        XCTAssertEqual(
            session.replayRetentionCountSnapshot(),
            TrustRootSupervisorReplayRetentionCountSnapshotV1(
                issuedChallengeCount: 0,
                consumedChallengeCount: 0,
                consumedReceiptCount: 0
            )
        )
    }

    func testRetentionCountsStayBoundedAcrossExpiredWindows() throws {
        let fixture = try RetentionFixture()
        let session = try TrustRootSupervisorSessionV1(
            supervisorProcessIdentity:
                fixture.supervisorProcessIdentity
        )
        let consumer = OneShotAttestationConsumerV1()

        for index in 0..<4 {
            let issuedAtUnixSeconds =
                UInt64(120 + (index * 31))
            let issuedAtMonotonicNanoseconds =
                UInt64(1_000_000_000 + (index * 31_000_000_000))
            let handoff = try makeRetentionHandoff(
                fixture: fixture,
                session: session,
                issuedAtUnixSeconds: issuedAtUnixSeconds,
                issuedAtMonotonicNanoseconds:
                    issuedAtMonotonicNanoseconds,
                randomStart: UInt8(0x51 + (index * 8))
            )
            try consumeRetentionHandoff(
                handoff,
                fixture: fixture,
                consumer: consumer,
                nowUnixSeconds: issuedAtUnixSeconds + 3,
                nowMonotonicNanoseconds:
                    issuedAtMonotonicNanoseconds
                    + 3_000_000_000
            )

            XCTAssertEqual(
                session.replayRetentionCountSnapshot(),
                TrustRootSupervisorReplayRetentionCountSnapshotV1(
                    issuedChallengeCount: 0,
                    consumedChallengeCount: 1,
                    consumedReceiptCount: 1
                )
            )
            XCTAssertEqual(
                consumer.replayRetentionCountSnapshot(),
                OneShotAttestationReplayRetentionCountSnapshotV1(
                    consumedAttestationCount: 1,
                    consumedChallengeCount: 1,
                    consumedReceiptCount: 1,
                    consumedChildProcessCount: 1
                )
            )
        }
    }

    func testFixedCapacityFailsClosedUntilExpiryFreesSpace()
        throws
    {
        XCTAssertEqual(
            TrustRootSupervisorSessionV1
                .maximumReplayRetentionCount,
            4_096
        )
        XCTAssertEqual(
            OneShotAttestationConsumerV1
                .maximumReplayRetentionCount,
            4_096
        )

        let fixture = try RetentionFixture()
        assertInvalidRetention(
            try TrustRootSupervisorSessionV1(
                supervisorProcessIdentity:
                    fixture.supervisorProcessIdentity,
                replayRetentionCapacity: 4_097
            )
        )
        assertInvalidRetention(
            try OneShotAttestationConsumerV1(
                replayRetentionCapacity: 4_097
            )
        )
        let session = try TrustRootSupervisorSessionV1(
            supervisorProcessIdentity:
                fixture.supervisorProcessIdentity,
            replayRetentionCapacity: 2
        )
        _ = try makeRetentionHandoff(
            fixture: fixture,
            session: session,
            issuedAtUnixSeconds: 120,
            issuedAtMonotonicNanoseconds: 1_000_000_000,
            randomStart: 0x71
        )
        _ = try issueRetentionChallenge(
            fixture: fixture,
            session: session,
            issuedAtUnixSeconds: 123,
            issuedAtMonotonicNanoseconds: 4_000_000_000,
            randomStart: 0x79
        )
        assertInvalidRetention(
            try issueRetentionChallenge(
                fixture: fixture,
                session: session,
                issuedAtUnixSeconds: 124,
                issuedAtMonotonicNanoseconds: 5_000_000_000,
                randomStart: 0x81
            )
        )
        XCTAssertEqual(
            session.replayRetentionCountSnapshot(),
            TrustRootSupervisorReplayRetentionCountSnapshotV1(
                issuedChallengeCount: 1,
                consumedChallengeCount: 1,
                consumedReceiptCount: 1
            )
        )

        let firstFixture = try RetentionFixture(
            childProcessUniqueID: 0x2001
        )
        let secondFixture = try RetentionFixture(
            childProcessUniqueID: 0x2002
        )
        let thirdFixture = try RetentionFixture(
            childProcessUniqueID: 0x2003
        )
        let firstSession = try TrustRootSupervisorSessionV1(
            supervisorProcessIdentity:
                firstFixture.supervisorProcessIdentity
        )
        let secondSession = try TrustRootSupervisorSessionV1(
            supervisorProcessIdentity:
                secondFixture.supervisorProcessIdentity
        )
        let thirdSession = try TrustRootSupervisorSessionV1(
            supervisorProcessIdentity:
                thirdFixture.supervisorProcessIdentity
        )
        let firstHandoff = try makeRetentionHandoff(
            fixture: firstFixture,
            session: firstSession,
            issuedAtUnixSeconds: 120,
            issuedAtMonotonicNanoseconds: 1_000_000_000,
            randomStart: 0x91
        )
        let secondHandoff = try makeRetentionHandoff(
            fixture: secondFixture,
            session: secondSession,
            issuedAtUnixSeconds: 120,
            issuedAtMonotonicNanoseconds: 1_000_000_000,
            randomStart: 0xa1
        )
        let thirdHandoff = try makeRetentionHandoff(
            fixture: thirdFixture,
            session: thirdSession,
            issuedAtUnixSeconds: 120,
            issuedAtMonotonicNanoseconds: 1_000_000_000,
            randomStart: 0xb1
        )
        let consumer = try OneShotAttestationConsumerV1(
            replayRetentionCapacity: 2
        )
        try consumeRetentionHandoff(
            firstHandoff,
            fixture: firstFixture,
            consumer: consumer,
            nowUnixSeconds: 123,
            nowMonotonicNanoseconds: 4_000_000_000
        )
        try consumeRetentionHandoff(
            secondHandoff,
            fixture: secondFixture,
            consumer: consumer,
            nowUnixSeconds: 124,
            nowMonotonicNanoseconds: 5_000_000_000
        )
        assertInvalidRetention(
            try consumeRetentionHandoff(
                thirdHandoff,
                fixture: thirdFixture,
                consumer: consumer,
                nowUnixSeconds: 125,
                nowMonotonicNanoseconds: 6_000_000_000
            )
        )
        XCTAssertEqual(
            consumer.replayRetentionCountSnapshot(),
            OneShotAttestationReplayRetentionCountSnapshotV1(
                consumedAttestationCount: 2,
                consumedChallengeCount: 2,
                consumedReceiptCount: 2,
                consumedChildProcessCount: 2
            )
        )

        let freshFixture = try RetentionFixture(
            childProcessUniqueID: 0x2004
        )
        let freshSession = try TrustRootSupervisorSessionV1(
            supervisorProcessIdentity:
                freshFixture.supervisorProcessIdentity
        )
        let freshHandoff = try makeRetentionHandoff(
            fixture: freshFixture,
            session: freshSession,
            issuedAtUnixSeconds: 151,
            issuedAtMonotonicNanoseconds: 32_000_000_000,
            randomStart: 0xc1
        )
        try consumeRetentionHandoff(
            freshHandoff,
            fixture: freshFixture,
            consumer: consumer,
            nowUnixSeconds: 154,
            nowMonotonicNanoseconds: 35_000_000_000
        )
        XCTAssertEqual(
            consumer.replayRetentionCountSnapshot(),
            OneShotAttestationReplayRetentionCountSnapshotV1(
                consumedAttestationCount: 1,
                consumedChallengeCount: 1,
                consumedReceiptCount: 1,
                consumedChildProcessCount: 1
            )
        )
    }
}
