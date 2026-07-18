import CryptoKit
import Foundation
import XCTest

@testable import FloodgateV7ExternalTrustRootProtocol

private enum GoldenFixtureError: Error {
    case invalidFixture
}

private struct CrossParserGoldenFixture {
    let root: [String: Any]

    init() throws {
        let repositoryRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let fixtureURL = repositoryRoot
            .appendingPathComponent("tests")
            .appendingPathComponent("fixtures")
            .appendingPathComponent(
                "floodgate-v7-external-trust-root"
                    + "-canonical-golden-v1.json"
            )
        let object = try JSONSerialization.jsonObject(
            with: Data(contentsOf: fixtureURL)
        )
        guard let root = object as? [String: Any] else {
            throw GoldenFixtureError.invalidFixture
        }
        self.root = root
    }

    var status: String {
        root["status"] as! String
    }

    func key(_ role: String) throws -> [String: Any] {
        guard
            let keys = root["keys"] as? [String: Any],
            let key = keys[role] as? [String: Any]
        else {
            throw GoldenFixtureError.invalidFixture
        }
        return key
    }

    func record(_ name: String) throws -> [String: Any] {
        guard
            let records = root["records"] as? [String: Any],
            let record = records[name] as? [String: Any]
        else {
            throw GoldenFixtureError.invalidFixture
        }
        return record
    }
}

private func goldenHexBytes(_ value: Any?) throws -> [UInt8] {
    guard
        let value = value as? String,
        value.count.isMultiple(of: 2)
    else {
        throw GoldenFixtureError.invalidFixture
    }
    var bytes: [UInt8] = []
    bytes.reserveCapacity(value.count / 2)
    var index = value.startIndex
    while index < value.endIndex {
        let next = value.index(index, offsetBy: 2)
        guard let byte = UInt8(value[index..<next], radix: 16) else {
            throw GoldenFixtureError.invalidFixture
        }
        bytes.append(byte)
        index = next
    }
    return bytes
}

private func assertGoldenCanonical(
    _ canonicalBytes: [UInt8],
    record: [String: Any],
    file: StaticString = #filePath,
    line: UInt = #line
) throws {
    guard let byteCount = record["canonical_byte_count"] as? Int else {
        throw GoldenFixtureError.invalidFixture
    }
    XCTAssertEqual(
        canonicalBytes.count,
        byteCount,
        file: file,
        line: line
    )
    XCTAssertEqual(
        canonicalBytes,
        try goldenHexBytes(record["canonical_hex"]),
        file: file,
        line: line
    )
    XCTAssertEqual(
        CanonicalSHA256.digest(canonicalBytes).bytes,
        try goldenHexBytes(record["sha256"]),
        file: file,
        line: line
    )
}

final class CanonicalGoldenVectorTests: XCTestCase {
    func testFixedPublicKeysAndKeyIDsMatchCryptoKit() throws {
        let fixture = try CrossParserGoldenFixture()
        XCTAssertEqual(
            fixture.status,
            "synthetic-test-only-cross-parser-fixture"
                + "-not-operational-evidence"
        )

        var keyIDs: Set<CanonicalBytes32> = []
        for role in ["authority", "supervisor", "verifier"] {
            let key = try fixture.key(role)
            let privateKey = try Curve25519.Signing.PrivateKey(
                rawRepresentation: Data(
                    try goldenHexBytes(key["seed_hex"])
                )
            )
            let publicKey = Array(
                privateKey.publicKey.rawRepresentation
            )
            XCTAssertEqual(
                publicKey,
                try goldenHexBytes(key["public_key_hex"])
            )
            let keyID = try TrustRootSignatureV1.signerKeyID(
                publicKeyRawRepresentation: publicKey
            )
            XCTAssertEqual(
                keyID.bytes,
                try goldenHexBytes(key["key_id_hex"])
            )
            keyIDs.insert(keyID)
        }
        XCTAssertEqual(keyIDs.count, 3)
    }

    func testCanonicalRecordsMatchSharedGoldenBytes() throws {
        let fixture = try CrossParserGoldenFixture()

        let fixedArgvRecord = try fixture.record("fixed_argv")
        let fixedArgv = try FixedArgvRecordV1.decodeCanonical(
            goldenHexBytes(fixedArgvRecord["canonical_hex"])
        )
        try assertGoldenCanonical(
            fixedArgv.canonicalBytes(),
            record: fixedArgvRecord
        )

        let fixedCWDRecord = try fixture.record("fixed_cwd")
        let fixedCWD =
            try FixedWorkingDirectoryRecordV1.decodeCanonical(
                goldenHexBytes(fixedCWDRecord["canonical_hex"])
            )
        try assertGoldenCanonical(
            fixedCWD.canonicalBytes(),
            record: fixedCWDRecord
        )

        let fixedEnvironmentRecord =
            try fixture.record("fixed_env")
        let fixedEnvironment =
            try FixedEnvironmentRecordV1.decodeCanonical(
                goldenHexBytes(
                    fixedEnvironmentRecord["canonical_hex"]
                )
            )
        try assertGoldenCanonical(
            fixedEnvironment.canonicalBytes(),
            record: fixedEnvironmentRecord
        )

        let runtimeInstallRecord =
            try fixture.record("runtime_install")
        let runtimeInstall =
            try RuntimeInstallPolicyRecordV1.decodeCanonical(
                goldenHexBytes(runtimeInstallRecord["canonical_hex"])
            )
        try assertGoldenCanonical(
            runtimeInstall.canonicalBytes(),
            record: runtimeInstallRecord
        )

        let runtimeLaunchRecord =
            try fixture.record("runtime_launch_policy")
        let runtimeLaunch =
            try RuntimeLaunchPolicyRecordV1.decodeCanonical(
                goldenHexBytes(runtimeLaunchRecord["canonical_hex"])
            )
        try assertGoldenCanonical(
            runtimeLaunch.canonicalBytes(),
            record: runtimeLaunchRecord
        )
        XCTAssertEqual(
            runtimeLaunch.fixedArgvSHA256,
            fixedArgv.canonicalSHA256()
        )
        XCTAssertEqual(
            runtimeLaunch.fixedWorkingDirectorySHA256,
            fixedCWD.canonicalSHA256()
        )
        XCTAssertEqual(
            runtimeLaunch.fixedEnvironmentSHA256,
            fixedEnvironment.canonicalSHA256()
        )
        XCTAssertEqual(
            runtimeLaunch.runtimeInstallPolicySHA256,
            runtimeInstall.canonicalSHA256()
        )
        XCTAssertEqual(
            runtimeLaunch.diagnosticEntryBundleSHA256,
            runtimeInstall
                .diagnosticEntryBundleWholeFileSHA256
        )

        let manifestRecord =
            try fixture.record("repository_source_manifest")
        let manifest = try RepositorySourceManifestV1.decodeCanonical(
            goldenHexBytes(manifestRecord["canonical_hex"])
        )
        try assertGoldenCanonical(
            manifest.canonicalBytes(),
            record: manifestRecord
        )
        let runtimeLaunchPreimageClosure =
            try RuntimeLaunchPreimageClosureV1(
                fixedArgv: fixedArgv,
                fixedWorkingDirectory: fixedCWD,
                fixedEnvironment: fixedEnvironment,
                runtimeInstallPolicy: runtimeInstall,
                runtimeLaunchPolicy: runtimeLaunch,
                sourceManifest: manifest
            )
        XCTAssertNoThrow(
            try runtimeLaunchPreimageClosure.validate(
                sourceManifest: manifest
            )
        )

        let enrollmentRecord = try fixture.record("enrollment")
        let enrollment = try EnrollmentRecord.decodeCanonical(
            goldenHexBytes(enrollmentRecord["canonical_hex"])
        )
        try assertGoldenCanonical(
            enrollment.canonicalBytes(),
            record: enrollmentRecord
        )
        XCTAssertNoThrow(try manifest.validateEnrollment(enrollment))

        let authorityKeyFixture = try fixture.key("authority")
        let authorityPublicKey = try goldenHexBytes(
            authorityKeyFixture["public_key_hex"]
        )
        let authorityKeyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation: authorityPublicKey
        )
        XCTAssertNoThrow(
            try manifest.validateAuthorityKeySeparation(authorityKeyID)
        )

        let signedEnrollmentRecord =
            try fixture.record("signed_enrollment")
        let signedEnrollment =
            try SignedEnrollmentRecordV1.decodeCanonical(
                goldenHexBytes(
                    signedEnrollmentRecord["canonical_hex"]
                )
            )
        try assertGoldenCanonical(
            signedEnrollment.canonicalBytes(),
            record: signedEnrollmentRecord
        )
        XCTAssertEqual(
            signedEnrollment.signaturePayload(),
            try goldenHexBytes(
                signedEnrollmentRecord["signature_payload_hex"]
            )
        )
        XCTAssertEqual(signedEnrollment.signerKeyID, authorityKeyID)
        XCTAssertEqual(
            try signedEnrollment.verifiedRecord(
                publicKeyRawRepresentation: authorityPublicKey
            ),
            enrollment
        )

        let activationRecord = try fixture.record("activation")
        let activation = try ActivationRecord.decodeCanonical(
            goldenHexBytes(activationRecord["canonical_hex"])
        )
        try assertGoldenCanonical(
            activation.canonicalBytes(),
            record: activationRecord
        )
        XCTAssertEqual(
            activation.targetEnrollmentID,
            enrollment.enrollmentID
        )

        let signedActivationRecord =
            try fixture.record("signed_activation")
        let signedActivation =
            try SignedActivationRecordV1.decodeCanonical(
                goldenHexBytes(
                    signedActivationRecord["canonical_hex"]
                )
            )
        try assertGoldenCanonical(
            signedActivation.canonicalBytes(),
            record: signedActivationRecord
        )
        XCTAssertEqual(
            signedActivation.signaturePayload(),
            try goldenHexBytes(
                signedActivationRecord["signature_payload_hex"]
            )
        )
        XCTAssertEqual(signedActivation.signerKeyID, authorityKeyID)
        XCTAssertEqual(
            try signedActivation.verifiedRecord(
                publicKeyRawRepresentation: authorityPublicKey
            ),
            activation
        )

        let headRecord =
            try fixture.record("expected_activation_head")
        let head = try ExpectedActivationHeadV1.decodeCanonical(
            goldenHexBytes(headRecord["canonical_hex"])
        )
        try assertGoldenCanonical(
            head.canonicalBytes(),
            record: headRecord
        )
        XCTAssertEqual(
            head.latestActivationEnvelopeSHA256,
            signedActivation.canonicalSHA256()
        )
        XCTAssertEqual(
            head.activeEnrollmentEnvelopeSHA256,
            signedEnrollment.canonicalSHA256()
        )
        XCTAssertEqual(
            head.activeEnrollmentRecordSHA256,
            enrollment.canonicalSHA256()
        )
        XCTAssertEqual(
            head.authoritySignerKeyID,
            authorityKeyID
        )
        let replay = try AuthenticatedProtocolStateV1.replay(
            enrollmentEnvelopes: [signedEnrollment],
            activationEnvelopes: [signedActivation],
            authorityPublicKeyRawRepresentation: authorityPublicKey,
            expectedActivationHead: head,
            nowUnixSeconds: activation.issuedAtUnixSeconds
        )
        XCTAssertEqual(replay.activeEnrollment, enrollment)
        XCTAssertEqual(
            replay.lastActivationEnvelopeSHA256,
            signedActivation.canonicalSHA256()
        )
    }

    func testSignedHandoffGoldenChainAndRolesMatchCryptoKit()
        throws
    {
        let fixture = try CrossParserGoldenFixture()
        let supervisorKeyFixture = try fixture.key("supervisor")
        let verifierKeyFixture = try fixture.key("verifier")
        let supervisorPrivateKey =
            try Curve25519.Signing.PrivateKey(
                rawRepresentation: Data(
                    try goldenHexBytes(
                        supervisorKeyFixture["seed_hex"]
                    )
                )
            )
        let verifierPrivateKey =
            try Curve25519.Signing.PrivateKey(
                rawRepresentation: Data(
                    try goldenHexBytes(
                        verifierKeyFixture["seed_hex"]
                    )
                )
            )
        let supervisorPublicKey = Array(
            supervisorPrivateKey.publicKey.rawRepresentation
        )
        let verifierPublicKey = Array(
            verifierPrivateKey.publicKey.rawRepresentation
        )

        let challengeRecord =
            try fixture.record("supervisor_challenge")
        let challenge = try SupervisorChallengeV1.decodeCanonical(
            goldenHexBytes(challengeRecord["canonical_hex"])
        )
        try assertGoldenCanonical(
            challenge.canonicalBytes(),
            record: challengeRecord
        )
        XCTAssertEqual(
            challenge.signaturePayload(),
            try goldenHexBytes(
                challengeRecord["signature_payload_hex"]
            )
        )
        XCTAssertTrue(
            supervisorPrivateKey.publicKey.isValidSignature(
                Data(challenge.signature.bytes),
                for: Data(challenge.signaturePayload())
            )
        )
        XCTAssertNoThrow(
            try challenge.verify(
                publicKeyRawRepresentation: supervisorPublicKey,
                nowUnixSeconds: challenge.issuedAtUnixSeconds,
                nowMonotonicNanoseconds:
                    challenge.monotonicIssuedAtNanoseconds
            )
        )
        let manifestRecord =
            try fixture.record("repository_source_manifest")
        let manifest = try RepositorySourceManifestV1.decodeCanonical(
            goldenHexBytes(manifestRecord["canonical_hex"])
        )
        let enrollmentRecord = try fixture.record("enrollment")
        let enrollment = try EnrollmentRecord.decodeCanonical(
            goldenHexBytes(enrollmentRecord["canonical_hex"])
        )
        let signedActivationRecord =
            try fixture.record("signed_activation")
        let signedActivation =
            try SignedActivationRecordV1.decodeCanonical(
                goldenHexBytes(
                    signedActivationRecord["canonical_hex"]
                )
            )
        let headRecord =
            try fixture.record("expected_activation_head")
        let head = try ExpectedActivationHeadV1.decodeCanonical(
            goldenHexBytes(headRecord["canonical_hex"])
        )
        XCTAssertEqual(challenge.enrollmentID, enrollment.enrollmentID)
        XCTAssertEqual(
            challenge.activationDigest,
            signedActivation.canonicalSHA256()
        )
        XCTAssertEqual(
            challenge.activationHeadSHA256,
            head.canonicalSHA256()
        )
        XCTAssertEqual(
            challenge.sourceManifestSHA256,
            manifest.canonicalSHA256()
        )

        let receiptRecord =
            try fixture.record("verifier_receipt")
        let receipt = try VerifierReceiptV1.decodeCanonical(
            goldenHexBytes(receiptRecord["canonical_hex"])
        )
        try assertGoldenCanonical(
            receipt.canonicalBytes(),
            record: receiptRecord
        )
        XCTAssertEqual(
            receipt.signaturePayload(),
            try goldenHexBytes(
                receiptRecord["signature_payload_hex"]
            )
        )
        XCTAssertTrue(
            verifierPrivateKey.publicKey.isValidSignature(
                Data(receipt.signature.bytes),
                for: Data(receipt.signaturePayload())
            )
        )
        XCTAssertNoThrow(
            try TrustRootSignatureV1.verify(
                signature: receipt.signature,
                payload: receipt.signaturePayload(),
                signerKeyID: receipt.signerKeyID,
                publicKeyRawRepresentation: verifierPublicKey
            )
        )

        let attestationRecord =
            try fixture.record("one_shot_attestation")
        let attestation =
            try OneShotAttestationV1.decodeCanonical(
                goldenHexBytes(
                    attestationRecord["canonical_hex"]
                )
            )
        try assertGoldenCanonical(
            attestation.canonicalBytes(),
            record: attestationRecord
        )
        XCTAssertEqual(
            attestation.signaturePayload(),
            try goldenHexBytes(
                attestationRecord["signature_payload_hex"]
            )
        )
        XCTAssertTrue(
            supervisorPrivateKey.publicKey.isValidSignature(
                Data(attestation.signature.bytes),
                for: Data(attestation.signaturePayload())
            )
        )
        XCTAssertNoThrow(
            try TrustRootSignatureV1.verify(
                signature: attestation.signature,
                payload: attestation.signaturePayload(),
                signerKeyID: attestation.signerKeyID,
                publicKeyRawRepresentation: supervisorPublicKey
            )
        )

        XCTAssertEqual(
            receipt.challengeSHA256,
            challenge.canonicalSHA256()
        )
        XCTAssertEqual(
            attestation.challengeSHA256,
            challenge.canonicalSHA256()
        )
        XCTAssertEqual(
            attestation.receiptSHA256,
            receipt.canonicalSHA256()
        )
        XCTAssertNotEqual(
            challenge.signerKeyID,
            receipt.signerKeyID
        )
        XCTAssertEqual(
            challenge.signerKeyID,
            attestation.signerKeyID
        )
        XCTAssertThrowsError(
            try TrustRootSignatureV1.verify(
                signature: receipt.signature,
                payload: receipt.signaturePayload(),
                signerKeyID: receipt.signerKeyID,
                publicKeyRawRepresentation: supervisorPublicKey
            )
        )
    }

    func testGoldenMutationsFailClosedAcrossDomainAndChain()
        throws
    {
        let fixture = try CrossParserGoldenFixture()
        let challengeRecord =
            try fixture.record("supervisor_challenge")
        var wrongDomain =
            try goldenHexBytes(challengeRecord["canonical_hex"])
        wrongDomain[7] ^= 1
        XCTAssertThrowsError(
            try SupervisorChallengeV1.decodeCanonical(wrongDomain)
        )

        let receiptRecord =
            try fixture.record("verifier_receipt")
        var wrongChallengeDigest =
            try goldenHexBytes(receiptRecord["canonical_hex"])
        wrongChallengeDigest[45] ^= 1
        let substitutedReceipt =
            try VerifierReceiptV1.decodeCanonical(
                wrongChallengeDigest
            )
        let verifierKeyFixture = try fixture.key("verifier")
        XCTAssertThrowsError(
            try TrustRootSignatureV1.verify(
                signature: substitutedReceipt.signature,
                payload: substitutedReceipt.signaturePayload(),
                signerKeyID: substitutedReceipt.signerKeyID,
                publicKeyRawRepresentation:
                    goldenHexBytes(
                        verifierKeyFixture["public_key_hex"]
                    )
            )
        )

        let attestationRecord =
            try fixture.record("one_shot_attestation")
        var wrongReceiptDigest =
            try goldenHexBytes(attestationRecord["canonical_hex"])
        wrongReceiptDigest[77] ^= 1
        let substitutedAttestation =
            try OneShotAttestationV1.decodeCanonical(
                wrongReceiptDigest
            )
        let supervisorKeyFixture = try fixture.key("supervisor")
        XCTAssertThrowsError(
            try TrustRootSignatureV1.verify(
                signature: substitutedAttestation.signature,
                payload: substitutedAttestation
                    .signaturePayload(),
                signerKeyID: substitutedAttestation.signerKeyID,
                publicKeyRawRepresentation:
                    goldenHexBytes(
                        supervisorKeyFixture["public_key_hex"]
                    )
            )
        )
    }
}
