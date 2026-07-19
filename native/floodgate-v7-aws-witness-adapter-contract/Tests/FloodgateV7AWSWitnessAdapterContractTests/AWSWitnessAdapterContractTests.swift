import CryptoKit
import Foundation
import XCTest

import FloodgateV7ExternalTrustRootProtocol
@testable import FloodgateV7AWSWitnessAdapterContract

private enum AWSContractTestFailure: Error {
    case expected
}

private let testTableARN =
    "arn:aws:dynamodb:us-west-2:123456789012:"
    + "table/floodgate-v7-witness"
private let testTableID =
    "01234567-89ab-cdef-0123-456789abcdef"
private let testKeyARN =
    "arn:aws:kms:us-west-2:123456789012:"
    + "key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
private let testPrivateKey = try!
    Curve25519.Signing.PrivateKey(
        rawRepresentation:
            Data(Array(repeating: 0x07, count: 32))
    )

private func testBytes32(
    _ value: UInt8
) -> CanonicalBytes32 {
    try! CanonicalBytes32(
        Array(repeating: value, count: 32)
    )
}

private func testDescribe(
    tableARN: String = testTableARN,
    tableID: String = testTableID,
    status: String = "ACTIVE",
    unknown: Bool = false
) -> AWSWitnessDescribeTableResponseV1 {
    AWSWitnessDescribeTableResponseV1(
        tableARN: tableARN,
        tableID: tableID,
        tableStatus: status,
        unknownFieldsPresent: unknown
    )
}

private func testGeneration(
    tableID: String = testTableID
) throws -> AWSWitnessStoreGenerationV1 {
    try AWSWitnessStoreGenerationV1.bind(
        pinnedTableARN: testTableARN,
        preflight: testDescribe(tableID: tableID),
        postflight: testDescribe(tableID: tableID)
    )
}

private var testSPKI: [UInt8] {
    [
        0x30, 0x2a,
        0x30, 0x05,
        0x06, 0x03, 0x2b, 0x65, 0x70,
        0x03, 0x21, 0x00,
    ] + Array(
        testPrivateKey.publicKey.rawRepresentation
    )
}

private func testKMSResponse(
    keyARN: String = testKeyARN,
    keySpec:
        AWSWitnessKMSKeySpecV1 =
        .eccNistEdwards25519,
    keyUsage:
        AWSWitnessKMSKeyUsageV1 =
        .signVerify,
    algorithms:
        [AWSWitnessKMSSigningAlgorithmV1] =
        [
            .ed25519SHA512,
            .ed25519PHSHA512,
        ],
    der: [UInt8] = testSPKI,
    unknown: Bool = false
) -> AWSWitnessKMSGetPublicKeyResponseV1 {
    AWSWitnessKMSGetPublicKeyResponseV1(
        keyARN: keyARN,
        keySpec: keySpec,
        keyUsage: keyUsage,
        signingAlgorithms: algorithms,
        subjectPublicKeyInfoDER: der,
        unknownFieldsPresent: unknown
    )
}

private func testSignerBinding()
    throws -> KMSWitnessKeyBindingV1
{
    try KMSWitnessKeyBindingV1.bind(
        pinnedKeyARN: testKeyARN,
        response: testKMSResponse()
    )
}

private func testCheckpoint(
    sequence: UInt64,
    previous: CanonicalBytes32 = .zero,
    last: UInt8
) throws -> AuthorityRollbackCheckpointV1 {
    try AuthorityRollbackCheckpointV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        journalID: testBytes32(0x11),
        journalSequence: sequence,
        authorityPublicKeyRecordSHA256:
            testBytes32(0x21),
        journalHeaderSHA256: testBytes32(0x22),
        lastJournalEntrySHA256:
            testBytes32(last),
        expectedActivationHeadSHA256:
            testBytes32(last &+ 1),
        previousWitnessedCheckpointSHA256:
            previous
    )
}

private struct TestCommitFixture {
    let generation:
        AWSWitnessStoreGenerationV1
    let binding: KMSWitnessKeyBindingV1
    let current:
        AuthorityRollbackCheckpointV1
    let replacement:
        AuthorityRollbackCheckpointV1
    let state: DynamoWitnessStateRecordV1
    let request:
        RemoteMonotonicWitnessRequestV1
    let receipt:
        RemoteMonotonicWitnessReceiptV1
    let input: DynamoWitnessCommitInputV1

    init(
        exactAttemptID:
            CanonicalBytes32 = testBytes32(0x91)
    ) throws {
        generation = try testGeneration()
        binding = try testSignerBinding()
        current = try testCheckpoint(
            sequence: 1,
            last: 0x31
        )
        replacement = try testCheckpoint(
            sequence: 2,
            previous: current.canonicalSHA256(),
            last: 0x41
        )
        let witnessID = testBytes32(0x61)
        let endpointID =
            DynamoWitnessRecordCodecV1
            .boundEndpointID(
                witnessID: witnessID,
                storeGenerationID:
                    generation.storeGenerationID
            )
        state = try DynamoWitnessStateRecordV1(
            witnessID: witnessID,
            endpointID: endpointID,
            witnessSignerKeyID:
                binding.signerKeyID,
            storeGenerationID:
                generation.storeGenerationID,
            currentCheckpoint: current,
            acceptedOperationCount: 7
        )
        request =
            try RemoteMonotonicWitnessRequestV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                operation: .advance,
                witnessID: witnessID,
                endpointID: endpointID,
                clientNonce: testBytes32(0x63),
                operationID: testBytes32(0x64),
                expectedCheckpointSHA256:
                    current.canonicalSHA256(),
                candidateCheckpoint: replacement
            )
        let payload =
            try RemoteMonotonicWitnessReceiptV1
            .signaturePayload(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                operation: .advance,
                accepted: true,
                witnessID: witnessID,
                endpointID: endpointID,
                witnessSignerKeyID:
                    binding.signerKeyID,
                clientNonce: request.clientNonce,
                operationID: request.operationID,
                requestSHA256:
                    request.canonicalSHA256(),
                checkpoint: replacement,
                issuedAtUnixSeconds: 100,
                expiresAtUnixSeconds: 130
            )
        let signature = try CanonicalBytes64(
            Array(
                try testPrivateKey.signature(
                    for: Data(payload)
                )
            )
        )
        receipt =
            try RemoteMonotonicWitnessReceiptV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                operation: .advance,
                accepted: true,
                witnessID: witnessID,
                endpointID: endpointID,
                witnessSignerKeyID:
                    binding.signerKeyID,
                clientNonce: request.clientNonce,
                operationID: request.operationID,
                requestSHA256:
                    request.canonicalSHA256(),
                checkpoint: replacement,
                issuedAtUnixSeconds: 100,
                expiresAtUnixSeconds: 130,
                signature: signature
            )
        input = try DynamoWitnessCommitInputV1(
            tableGeneration: generation,
            currentState: state,
            replacementCheckpoint: replacement,
            exactAttemptID: exactAttemptID,
            request: request,
            immutableInitialReceipt: receipt,
            signerBinding: binding,
            validationUnixSeconds: 100
        )
    }
}

final class AWSWitnessStoreGenerationTests:
    XCTestCase
{
    func testBindsExactTableARNAndTableIDAcrossPreAndPost()
        throws
    {
        let generation = try testGeneration()
        XCTAssertEqual(
            generation.tableIdentity.tableARN,
            testTableARN
        )
        XCTAssertEqual(
            generation.tableIdentity.tableID,
            testTableID
        )
        XCTAssertNotEqual(
            generation.storeGenerationID,
            .zero
        )
        try generation.requireUnchanged(
            testDescribe()
        )
        XCTAssertEqual(
            try AWSWitnessStoreGenerationV1
                .describeRequest(
                    pinnedTableARN: testTableARN
                ).tableARN,
            testTableARN
        )
    }

    func testRejectsPrePostIdentityOrStatusDrift() {
        let changedID =
            "11234567-89ab-cdef-0123-456789abcdef"
        XCTAssertThrowsError(
            try AWSWitnessStoreGenerationV1.bind(
                pinnedTableARN: testTableARN,
                preflight: testDescribe(),
                postflight:
                    testDescribe(tableID: changedID)
            )
        )
        XCTAssertThrowsError(
            try AWSWitnessStoreGenerationV1.bind(
                pinnedTableARN: testTableARN,
                preflight: testDescribe(),
                postflight:
                    testDescribe(status: "UPDATING")
            )
        )
        XCTAssertThrowsError(
            try AWSWitnessStoreGenerationV1.bind(
                pinnedTableARN: testTableARN,
                preflight: testDescribe(),
                postflight:
                    testDescribe(unknown: true)
            )
        )
    }

    func testRestoredTableIDProducesNewGeneration()
        throws
    {
        let restoredID =
            "11234567-89ab-cdef-0123-456789abcdef"
        XCTAssertNotEqual(
            try testGeneration().storeGenerationID,
            try testGeneration(
                tableID: restoredID
            ).storeGenerationID
        )
    }

    func testRejectsMalformedProviderIdentities() {
        XCTAssertThrowsError(
            try AWSWitnessTableIdentityV1(
                tableARN: "table",
                tableID: testTableID
            )
        )
        XCTAssertThrowsError(
            try AWSWitnessTableIdentityV1(
                tableARN: testTableARN,
                tableID: "not-a-uuid"
            )
        )
        XCTAssertThrowsError(
            try AWSWitnessTableIdentityV1(
                tableARN: testTableARN,
                tableID:
                    "01234567-89AB-CDEF-0123-456789ABCDEF"
            )
        )
    }
}

final class KMSWitnessContractTests:
    XCTestCase
{
    func testAcceptsOnlyExactEd25519SPKI()
        throws
    {
        let binding = try testSignerBinding()
        XCTAssertEqual(binding.keyARN, testKeyARN)
        XCTAssertEqual(
            binding.publicKeyRawRepresentation,
            Array(
                testPrivateKey.publicKey
                    .rawRepresentation
            )
        )
        XCTAssertEqual(
            binding.signerKeyID,
            try TrustRootSignatureV1.signerKeyID(
                publicKeyRawRepresentation:
                    binding
                    .publicKeyRawRepresentation
            )
        )
        XCTAssertEqual(
            try KMSWitnessKeyBindingV1
                .getPublicKeyRequest(
                    pinnedKeyARN: testKeyARN
                ).grantTokens,
            []
        )
        XCTAssertEqual(
            try KMSWitnessKeyBindingV1.bind(
                pinnedKeyARN: testKeyARN,
                response: testKMSResponse(
                    algorithms: [
                        .ed25519PHSHA512,
                        .ed25519SHA512,
                    ]
                )
            ).signerKeyID,
            binding.signerKeyID
        )
        let rfc8032TestOnePublicKey: [UInt8] = [
            0xd7, 0x5a, 0x98, 0x01,
            0x82, 0xb1, 0x0a, 0xb7,
            0xd5, 0x4b, 0xfe, 0xd3,
            0xc9, 0x64, 0x07, 0x3a,
            0x0e, 0xe1, 0x72, 0xf3,
            0xda, 0xa6, 0x23, 0x25,
            0xaf, 0x02, 0x1a, 0x68,
            0xf7, 0x07, 0x51, 0x1a,
        ]
        XCTAssertEqual(
            try KMSWitnessKeyBindingV1.bind(
                pinnedKeyARN: testKeyARN,
                response: testKMSResponse(
                    der:
                        Array(testSPKI.prefix(12))
                        + rfc8032TestOnePublicKey
                )
            ).publicKeyRawRepresentation,
            rfc8032TestOnePublicKey
        )
    }

    func testRejectsWrongSPKIKeySpecUsageOrAlgorithms() {
        var wrongDER = testSPKI
        wrongDER[8] ^= 1
        for response in [
            testKMSResponse(der: wrongDER),
            testKMSResponse(keySpec: .rsa2048),
            testKMSResponse(
                keyUsage: .encryptDecrypt
            ),
            testKMSResponse(algorithms: []),
            testKMSResponse(
                algorithms: [.ed25519SHA512]
            ),
            testKMSResponse(
                algorithms: [
                    .ed25519SHA512,
                    .ed25519SHA512,
                ]
            ),
            testKMSResponse(
                algorithms: [
                    .ed25519SHA512,
                    .ecdsaSHA256,
                ]
            ),
            testKMSResponse(unknown: true),
        ] {
            XCTAssertThrowsError(
                try KMSWitnessKeyBindingV1.bind(
                    pinnedKeyARN: testKeyARN,
                    response: response
                )
            )
        }
        let prefix = Array(testSPKI.prefix(12))
        let rejectedRawKeys: [[UInt8]] = [
            Array(repeating: 0, count: 32),
            [0x01]
                + Array(repeating: 0, count: 31),
            [
                0x26, 0xe8, 0x95, 0x8f,
                0xc2, 0xb2, 0x27, 0xb0,
                0x45, 0xc3, 0xf4, 0x89,
                0xf2, 0xef, 0x98, 0xf0,
                0xd5, 0xdf, 0xac, 0x05,
                0xd3, 0xc6, 0x33, 0x39,
                0xb1, 0x38, 0x02, 0x88,
                0x6d, 0x53, 0xfc, 0x05,
            ],
            [0xec]
                + Array(repeating: 0xff, count: 30)
                + [0x7f],
            [0xed]
                + Array(repeating: 0xff, count: 30)
                + [0x7f],
            [0x02]
                + Array(repeating: 0, count: 31),
            [0x01]
                + Array(repeating: 0, count: 30)
                + [0x80],
            [0xec]
                + Array(repeating: 0xff, count: 31),
            Array(repeating: 0xff, count: 32),
        ]
        for raw in rejectedRawKeys {
            XCTAssertThrowsError(
                try KMSWitnessKeyBindingV1.bind(
                    pinnedKeyARN: testKeyARN,
                    response: testKMSResponse(
                        der: prefix + raw
                    )
                )
            )
        }
    }

    func testBuildsRawEd25519SHA512SignRequestAndValidatesResponse()
        throws
    {
        let binding = try testSignerBinding()
        let message = [UInt8](repeating: 0x5a, count: 466)
        let request = try binding.signRequest(
            exactRawMessage: message
        )
        XCTAssertEqual(request.message, message)
        XCTAssertEqual(request.messageType, .raw)
        XCTAssertEqual(
            request.signingAlgorithm,
            .ed25519SHA512
        )
        XCTAssertEqual(request.grantTokens, [])

        let signature = Array(
            try testPrivateKey.signature(
                for: Data(message)
            )
        )
        XCTAssertEqual(
            try binding.validateSignResponse(
                AWSWitnessKMSSignResponseV1(
                    keyARN: testKeyARN,
                    signingAlgorithm:
                        .ed25519SHA512,
                    signature: signature,
                    unknownFieldsPresent: false
                ),
                for: request
            ).bytes,
            signature
        )
    }

    func testRejectsDigestModeWrongKeyZeroOrUnknownSignature()
        throws
    {
        let binding = try testSignerBinding()
        let message =
            [UInt8](repeating: 0x5a, count: 466)
        let request = try binding.signRequest(
            exactRawMessage: message
        )
        let validSignature = Array(
            try testPrivateKey.signature(
                for: Data(message)
            )
        )
        XCTAssertThrowsError(
            try binding.signRequest(
                exactRawMessage: []
            )
        )
        for response in [
            AWSWitnessKMSSignResponseV1(
                keyARN: testKeyARN + "-other",
                signingAlgorithm:
                    .ed25519SHA512,
                signature: validSignature,
                unknownFieldsPresent: false
            ),
            AWSWitnessKMSSignResponseV1(
                keyARN: testKeyARN,
                signingAlgorithm:
                    .ecdsaSHA256,
                signature: validSignature,
                unknownFieldsPresent: false
            ),
            AWSWitnessKMSSignResponseV1(
                keyARN: testKeyARN,
                signingAlgorithm:
                    .ed25519SHA512,
                signature:
                    Array(repeating: 0, count: 64),
                unknownFieldsPresent: false
            ),
            AWSWitnessKMSSignResponseV1(
                keyARN: testKeyARN,
                signingAlgorithm:
                    .ed25519SHA512,
                signature: validSignature,
                unknownFieldsPresent: true
            ),
        ] {
            XCTAssertThrowsError(
                try binding.validateSignResponse(
                    response,
                    for: request
                )
            )
        }

        let validResponse =
            AWSWitnessKMSSignResponseV1(
                keyARN: testKeyARN,
                signingAlgorithm:
                    .ed25519SHA512,
                signature: validSignature,
                unknownFieldsPresent: false
            )
        let wrongMessageRequest =
            AWSWitnessKMSSignRequestV1(
                keyARN: testKeyARN,
                message: message + [0x00],
                messageType: .raw,
                signingAlgorithm:
                    .ed25519SHA512,
                grantTokens: []
            )
        XCTAssertThrowsError(
            try binding.validateSignResponse(
                validResponse,
                for: wrongMessageRequest
            )
        )
        XCTAssertThrowsError(
            try binding.validateSignResponse(
                AWSWitnessKMSSignResponseV1(
                    keyARN: testKeyARN,
                    signingAlgorithm:
                        .ed25519SHA512,
                    signature:
                        Array(
                            repeating: 1,
                            count: 64
                        ),
                    unknownFieldsPresent: false
                ),
                for: request
            )
        )

        for malformedRequest in [
            AWSWitnessKMSSignRequestV1(
                keyARN: testKeyARN + "-other",
                message: message,
                messageType: .raw,
                signingAlgorithm:
                    .ed25519SHA512,
                grantTokens: []
            ),
            AWSWitnessKMSSignRequestV1(
                keyARN: testKeyARN,
                message: message,
                messageType: .digest,
                signingAlgorithm:
                    .ed25519SHA512,
                grantTokens: []
            ),
            AWSWitnessKMSSignRequestV1(
                keyARN: testKeyARN,
                message: message,
                messageType: .raw,
                signingAlgorithm:
                    .ecdsaSHA256,
                grantTokens: []
            ),
            AWSWitnessKMSSignRequestV1(
                keyARN: testKeyARN,
                message: message,
                messageType: .raw,
                signingAlgorithm:
                    .ed25519SHA512,
                grantTokens: ["unexpected"]
            ),
        ] {
            XCTAssertThrowsError(
                try binding.validateSignResponse(
                    validResponse,
                    for: malformedRequest
                )
            )
        }
    }
}

final class DynamoWitnessRecordCodecTests:
    XCTestCase
{
    func testStateRoundTripsAndRejectsShapeDigestAndNumberDrift()
        throws
    {
        let fixture = try TestCommitFixture()
        let encoded =
            DynamoWitnessRecordCodecV1.encodeState(
                fixture.state
            )
        XCTAssertEqual(
            try DynamoWitnessRecordCodecV1
                .decodeState(encoded),
            fixture.state
        )

        var extra = encoded
        extra["extra"] = .boolean(true)
        XCTAssertThrowsError(
            try DynamoWitnessRecordCodecV1
                .decodeState(extra)
        )
        var digest = encoded
        digest["current_checkpoint_sha256"] =
            .binary(testBytes32(0xee).bytes)
        XCTAssertThrowsError(
            try DynamoWitnessRecordCodecV1
                .decodeState(digest)
        )
        var number = encoded
        number["accepted_operation_count"] =
            .number("07")
        XCTAssertThrowsError(
            try DynamoWitnessRecordCodecV1
                .decodeState(number)
        )
    }

    func testOperationRoundTripsAndRejectsTampering()
        throws
    {
        let fixture = try TestCommitFixture()
        let record =
            try DynamoWitnessOperationRecordV1(
                exactAttemptID:
                    fixture.input.exactAttemptID,
                request: fixture.request,
                acceptedCheckpoint:
                    fixture.replacement,
                immutableInitialReceipt:
                    fixture.receipt
            )
        let encoded =
            DynamoWitnessRecordCodecV1
            .encodeOperation(record)
        XCTAssertEqual(
            try DynamoWitnessRecordCodecV1
                .decodeOperation(
                    encoded,
                    signerBinding: fixture.binding
                ),
            record
        )
        var request = encoded
        if case let .binary(bytes)? =
            request["request_canonical_bytes"]
        {
            var tampered = bytes
            tampered[0] ^= 1
            request["request_canonical_bytes"] =
                .binary(tampered)
        }
        XCTAssertThrowsError(
            try DynamoWitnessRecordCodecV1
                .decodeOperation(
                    request,
                    signerBinding: fixture.binding
                )
        )
        var receipt = encoded
        if case let .binary(bytes)? =
            receipt["immutable_initial_receipt"]
        {
            var tampered = bytes
            tampered[tampered.count - 1] ^= 1
            receipt["immutable_initial_receipt"] =
                .binary(tampered)
        }
        XCTAssertThrowsError(
            try DynamoWitnessRecordCodecV1
                .decodeOperation(
                    receipt,
                    signerBinding: fixture.binding
                )
        )
    }

    func testAttemptRoundTripsAndRejectsTokenDrift()
        throws
    {
        let fixture = try TestCommitFixture()
        let planSHA =
            DynamoWitnessTransactionContractV1
            .commitPlanSHA256(fixture.input)
        let token =
            DynamoWitnessRecordCodecV1
            .clientRequestToken(for: planSHA)
        let record =
            try DynamoWitnessAttemptRecordV1(
                exactAttemptID:
                    fixture.input.exactAttemptID,
                operationID:
                    fixture.request.operationID,
                requestSHA256:
                    fixture.request.canonicalSHA256(),
                expectedCheckpointSHA256:
                    fixture.current.canonicalSHA256(),
                expectedAcceptedOperationCount: 7,
                replacementCheckpointSHA256:
                    fixture.replacement
                    .canonicalSHA256(),
                commitPlanSHA256: planSHA,
                clientRequestToken: token
            )
        let encoded =
            DynamoWitnessRecordCodecV1
            .encodeAttempt(
                record,
                witnessID:
                    fixture.state.witnessID
            )
        XCTAssertEqual(
            try DynamoWitnessRecordCodecV1
                .decodeAttempt(
                    encoded,
                    witnessID:
                        fixture.state.witnessID
                ),
            record
        )
        var tampered = encoded
        tampered["client_request_token"] =
            .string(String(repeating: "A", count: 36))
        XCTAssertThrowsError(
            try DynamoWitnessRecordCodecV1
                .decodeAttempt(
                    tampered,
                    witnessID:
                        fixture.state.witnessID
                )
        )
    }
}

final class DynamoWitnessTransactionContractTests:
    XCTestCase
{
    func testReadIsExactlySTATEThenOPAndDecodesOnlyThatShape()
        throws
    {
        let fixture = try TestCommitFixture()
        let request =
            try DynamoWitnessTransactionContractV1
            .buildReadRequest(
                tableGeneration:
                    fixture.generation,
                witnessID:
                    fixture.state.witnessID,
                operationID:
                    fixture.request.operationID
            )
        XCTAssertEqual(request.items.count, 2)
        XCTAssertEqual(
            request.items.map(\.key.sortKey),
            [
                "STATE",
                "OP#"
                    + String(
                        repeating: "64",
                        count: 32
                    ),
            ]
        )
        let operation =
            try DynamoWitnessOperationRecordV1(
                exactAttemptID:
                    fixture.input.exactAttemptID,
                request: fixture.request,
                acceptedCheckpoint:
                    fixture.replacement,
                immutableInitialReceipt:
                    fixture.receipt
            )
        let response =
            AWSWitnessTransactGetResponseV1(
                responses: [
                    DynamoWitnessRecordCodecV1
                        .encodeState(fixture.state),
                    DynamoWitnessRecordCodecV1
                        .encodeOperation(operation),
                ],
                unknownFieldsPresent: false
            )
        let decoded =
            try DynamoWitnessTransactionContractV1
            .decodeReadResponse(
                request: request,
                response: response,
                tableGeneration:
                    fixture.generation,
                signerBinding: fixture.binding
            )
        XCTAssertEqual(decoded.state, fixture.state)
        XCTAssertEqual(decoded.operation, operation)

        XCTAssertNil(
            try DynamoWitnessTransactionContractV1
                .decodeReadResponse(
                    request: request,
                    response:
                        AWSWitnessTransactGetResponseV1(
                            responses: [
                                response.responses[0],
                                nil,
                            ],
                            unknownFieldsPresent: false
                        ),
                    tableGeneration:
                        fixture.generation,
                    signerBinding: fixture.binding
                ).operation
        )
    }

    func testReadRejectsMissingStateExtrasUnknownAndRequestReorder()
        throws
    {
        let fixture = try TestCommitFixture()
        let request =
            try DynamoWitnessTransactionContractV1
            .buildReadRequest(
                tableGeneration:
                    fixture.generation,
                witnessID:
                    fixture.state.witnessID,
                operationID:
                    fixture.request.operationID
            )
        for response in [
            AWSWitnessTransactGetResponseV1(
                responses: [nil, nil],
                unknownFieldsPresent: false
            ),
            AWSWitnessTransactGetResponseV1(
                responses: [
                    DynamoWitnessRecordCodecV1
                        .encodeState(fixture.state),
                    nil,
                    nil,
                ],
                unknownFieldsPresent: false
            ),
            AWSWitnessTransactGetResponseV1(
                responses: [
                    DynamoWitnessRecordCodecV1
                        .encodeState(fixture.state),
                    nil,
                ],
                unknownFieldsPresent: true
            ),
        ] {
            XCTAssertThrowsError(
                try DynamoWitnessTransactionContractV1
                    .decodeReadResponse(
                        request: request,
                        response: response,
                        tableGeneration:
                            fixture.generation,
                        signerBinding:
                            fixture.binding
                    )
            )
        }
        let reordered =
            AWSWitnessTransactGetRequestV1(
                items: request.items.reversed(),
                returnConsumedCapacity: false
            )
        XCTAssertThrowsError(
            try DynamoWitnessTransactionContractV1
                .decodeReadResponse(
                    request: reordered,
                    response:
                        AWSWitnessTransactGetResponseV1(
                            responses: [
                                DynamoWitnessRecordCodecV1
                                    .encodeState(
                                        fixture.state
                                    ),
                                nil,
                            ],
                            unknownFieldsPresent: false
                        ),
                    tableGeneration:
                        fixture.generation,
                    signerBinding: fixture.binding
                )
        )
        let wrongSignerState =
            try DynamoWitnessStateRecordV1(
                witnessID: fixture.state.witnessID,
                endpointID: fixture.state.endpointID,
                witnessSignerKeyID:
                    testBytes32(0x7a),
                storeGenerationID:
                    fixture.state.storeGenerationID,
                currentCheckpoint:
                    fixture.state.currentCheckpoint,
                acceptedOperationCount:
                    fixture.state
                    .acceptedOperationCount
            )
        XCTAssertThrowsError(
            try DynamoWitnessTransactionContractV1
                .decodeReadResponse(
                    request: request,
                    response:
                        AWSWitnessTransactGetResponseV1(
                            responses: [
                                DynamoWitnessRecordCodecV1
                                    .encodeState(
                                        wrongSignerState
                                    ),
                                nil,
                            ],
                            unknownFieldsPresent: false
                        ),
                    tableGeneration:
                        fixture.generation,
                    signerBinding: fixture.binding
                )
        )
    }

    func testReadRejectsOperationEndpointDrift()
        throws
    {
        let fixture = try TestCommitFixture()
        let otherEndpoint = testBytes32(0x7b)
        let request =
            try RemoteMonotonicWitnessRequestV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                operation: .advance,
                witnessID: fixture.state.witnessID,
                endpointID: otherEndpoint,
                clientNonce:
                    fixture.request.clientNonce,
                operationID:
                    fixture.request.operationID,
                expectedCheckpointSHA256:
                    fixture.request
                    .expectedCheckpointSHA256,
                candidateCheckpoint:
                    fixture.replacement
            )
        let payload =
            try RemoteMonotonicWitnessReceiptV1
            .signaturePayload(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                operation: .advance,
                accepted: true,
                witnessID: request.witnessID,
                endpointID: request.endpointID,
                witnessSignerKeyID:
                    fixture.binding.signerKeyID,
                clientNonce: request.clientNonce,
                operationID: request.operationID,
                requestSHA256:
                    request.canonicalSHA256(),
                checkpoint: fixture.replacement,
                issuedAtUnixSeconds: 100,
                expiresAtUnixSeconds: 130
            )
        let receipt =
            try RemoteMonotonicWitnessReceiptV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                operation: .advance,
                accepted: true,
                witnessID: request.witnessID,
                endpointID: request.endpointID,
                witnessSignerKeyID:
                    fixture.binding.signerKeyID,
                clientNonce: request.clientNonce,
                operationID: request.operationID,
                requestSHA256:
                    request.canonicalSHA256(),
                checkpoint: fixture.replacement,
                issuedAtUnixSeconds: 100,
                expiresAtUnixSeconds: 130,
                signature: try CanonicalBytes64(
                    Array(
                        try testPrivateKey.signature(
                            for: Data(payload)
                        )
                    )
                )
            )
        let operation =
            try DynamoWitnessOperationRecordV1(
                exactAttemptID:
                    fixture.input.exactAttemptID,
                request: request,
                acceptedCheckpoint:
                    fixture.replacement,
                immutableInitialReceipt: receipt
            )
        let readRequest =
            try DynamoWitnessTransactionContractV1
            .buildReadRequest(
                tableGeneration:
                    fixture.generation,
                witnessID: fixture.state.witnessID,
                operationID: request.operationID
            )
        XCTAssertThrowsError(
            try DynamoWitnessTransactionContractV1
                .decodeReadResponse(
                    request: readRequest,
                    response:
                        AWSWitnessTransactGetResponseV1(
                            responses: [
                                DynamoWitnessRecordCodecV1
                                    .encodeState(
                                        fixture.state
                                    ),
                                DynamoWitnessRecordCodecV1
                                    .encodeOperation(
                                        operation
                                    ),
                            ],
                            unknownFieldsPresent: false
                        ),
                    tableGeneration:
                        fixture.generation,
                    signerBinding: fixture.binding
                )
        )
    }

    func testReadRejectsMultibyteOperationKeyWithoutTrap()
        throws
    {
        let fixture = try TestCommitFixture()
        let request =
            try DynamoWitnessTransactionContractV1
            .buildReadRequest(
                tableGeneration:
                    fixture.generation,
                witnessID:
                    fixture.state.witnessID,
                operationID:
                    fixture.request.operationID
            )
        let malformedSortKey =
            "OP#"
            + String(repeating: "0", count: 62)
            + "\u{00e9}"
        XCTAssertEqual(
            malformedSortKey.utf8.count,
            67
        )
        XCTAssertEqual(
            malformedSortKey.count,
            66
        )
        let operationItem = request.items[1]
        let malformedRequest =
            AWSWitnessTransactGetRequestV1(
                items: [
                    request.items[0],
                    AWSWitnessTransactGetItemV1(
                        tableARN:
                            operationItem.tableARN,
                        key:
                            AWSWitnessPrimaryKeyV1(
                                partitionKey:
                                    operationItem.key
                                    .partitionKey,
                                sortKey:
                                    malformedSortKey
                            ),
                        projectionExpression:
                            operationItem
                            .projectionExpression,
                        expressionAttributeNames:
                            operationItem
                            .expressionAttributeNames
                    ),
                ],
                returnConsumedCapacity: false
            )
        XCTAssertThrowsError(
            try DynamoWitnessTransactionContractV1
                .decodeReadResponse(
                    request: malformedRequest,
                    response:
                        AWSWitnessTransactGetResponseV1(
                            responses: [
                                DynamoWitnessRecordCodecV1
                                    .encodeState(
                                        fixture.state
                                    ),
                                nil,
                            ],
                            unknownFieldsPresent: false
                        ),
                    tableGeneration:
                        fixture.generation,
                    signerBinding: fixture.binding
                )
        ) { error in
            XCTAssertEqual(
                error
                    as? AWSWitnessContractErrorV1,
                .stop
            )
        }
    }

    func testWriteIsExactlySTATEUpdateOPPutATTEMPTPut()
        throws
    {
        let fixture = try TestCommitFixture()
        let request =
            try DynamoWitnessTransactionContractV1
            .buildWriteRequest(fixture.input)
        XCTAssertEqual(request.actions.count, 3)
        XCTAssertEqual(
            request.clientRequestToken.utf8.count,
            36
        )
        guard
            case .update = request.actions[0],
            case let .put(operation) =
                request.actions[1],
            case let .put(attempt) =
                request.actions[2]
        else {
            return XCTFail("wrong action order")
        }
        XCTAssertEqual(
            operation.item["entity"],
            .string("OP")
        )
        XCTAssertEqual(
            attempt.item["entity"],
            .string("ATTEMPT")
        )
        try DynamoWitnessTransactionContractV1
            .requireExactWriteRequest(
                request,
                input: fixture.input
            )
    }

    func testTokenBindsWholePlanAndRejectsRequestMutation()
        throws
    {
        let first = try TestCommitFixture()
        let second = try TestCommitFixture(
            exactAttemptID: testBytes32(0x92)
        )
        let firstRequest =
            try DynamoWitnessTransactionContractV1
            .buildWriteRequest(first.input)
        let secondRequest =
            try DynamoWitnessTransactionContractV1
            .buildWriteRequest(second.input)
        XCTAssertNotEqual(
            firstRequest.clientRequestToken,
            secondRequest.clientRequestToken
        )
        var actions = firstRequest.actions
        actions.swapAt(1, 2)
        let reordered =
            AWSWitnessTransactWriteRequestV1(
                clientRequestToken:
                    firstRequest.clientRequestToken,
                actions: actions,
                returnConsumedCapacity: false,
                returnItemCollectionMetrics: false
            )
        XCTAssertThrowsError(
            try DynamoWitnessTransactionContractV1
                .requireExactWriteRequest(
                    reordered,
                    input: first.input
                )
        )
    }

    func testMapsOnlyExactSuccessToCommitted()
        throws
    {
        let fixture = try TestCommitFixture()
        let request =
            try DynamoWitnessTransactionContractV1
            .buildWriteRequest(fixture.input)
        let success =
            AWSWitnessTransactWriteResponseV1(
                submittedClientRequestToken:
                    request.clientRequestToken,
                httpStatusCode: 200,
                requestID: "request-1",
                unknownFieldsPresent: false
            )
        XCTAssertEqual(
            DynamoWitnessTransactionContractV1
                .classify(
                    .success(success),
                    expectedClientRequestToken:
                        request.clientRequestToken
                ),
            .committed
        )
        for response in [
            AWSWitnessTransactWriteResponseV1(
                submittedClientRequestToken: "other",
                httpStatusCode: 200,
                requestID: "request-1",
                unknownFieldsPresent: false
            ),
            AWSWitnessTransactWriteResponseV1(
                submittedClientRequestToken:
                    request.clientRequestToken,
                httpStatusCode: 201,
                requestID: "request-1",
                unknownFieldsPresent: false
            ),
            AWSWitnessTransactWriteResponseV1(
                submittedClientRequestToken:
                    request.clientRequestToken,
                httpStatusCode: 200,
                requestID: "",
                unknownFieldsPresent: false
            ),
            AWSWitnessTransactWriteResponseV1(
                submittedClientRequestToken:
                    request.clientRequestToken,
                httpStatusCode: 200,
                requestID: "request-1",
                unknownFieldsPresent: true
            ),
        ] {
            XCTAssertEqual(
                DynamoWitnessTransactionContractV1
                    .classify(
                        .success(response),
                        expectedClientRequestToken:
                            request.clientRequestToken
                    ),
                .stop
            )
        }
    }

    func testMapsProviderFailuresConservatively()
        throws
    {
        let token = String(repeating: "A", count: 36)
        let cases:
            [
                (
                    AWSWitnessProviderFailureV1,
                    DynamoWitnessCommitDispositionV1
                )
            ] = [
                (
                    .conditionalCheckFailed,
                    .definitiveCASLoss
                ),
                (
                    .transactionCanceled([
                        .conditionalCheckFailed,
                        .none,
                        .none,
                    ]),
                    .definitiveCASLoss
                ),
                (
                    .transactionCanceled([
                        .none,
                        .transactionConflict,
                        .none,
                    ]),
                    .transientConflict
                ),
                (.transactionConflict, .transientConflict),
                (.throttling, .transientConflict),
                (.requestTimeout, .ambiguous),
                (.networkUnavailable, .ambiguous),
                (.internalServerError, .ambiguous),
                (.transactionInProgress, .ambiguous),
                (.accessDenied, .stop),
                (.resourceNotFound, .stop),
                (.idempotentParameterMismatch, .stop),
                (.unknown("new-error"), .stop),
                (
                    .transactionCanceled([
                        .none,
                        .none,
                    ]),
                    .stop
                ),
                (
                    .transactionCanceled([
                        .unknown("new"),
                        .none,
                        .none,
                    ]),
                    .stop
                ),
            ]
        for (failure, expected) in cases {
            XCTAssertEqual(
                DynamoWitnessTransactionContractV1
                    .classify(
                        .failure(failure),
                        expectedClientRequestToken:
                            token
                    ),
                expected
            )
        }
    }

    func testUntypedAsyncProviderThrowIsAmbiguous()
        async throws
    {
        let fixture = try TestCommitFixture()
        let disposition =
            await DynamoWitnessTransactionContractV1
            .submit(
                fixture.input,
                provider: { request in
                    guard request.actions.count == 3
                    else {
                        return .failure(.validation)
                    }
                    throw AWSContractTestFailure.expected
                }
            )
        XCTAssertEqual(disposition, .ambiguous)
    }
}

final class DynamoWitnessCommitInputTests:
    XCTestCase
{
    func testRejectsExpiredReceiptAndWrongStoreGeneration()
        throws
    {
        let fixture = try TestCommitFixture()
        XCTAssertThrowsError(
            try DynamoWitnessCommitInputV1(
                tableGeneration:
                    fixture.generation,
                currentState: fixture.state,
                replacementCheckpoint:
                    fixture.replacement,
                exactAttemptID:
                    fixture.input.exactAttemptID,
                request: fixture.request,
                immutableInitialReceipt:
                    fixture.receipt,
                signerBinding: fixture.binding,
                validationUnixSeconds: 130
            )
        )
        let otherGeneration = try testGeneration(
            tableID:
                "11234567-89ab-cdef-0123-456789abcdef"
        )
        XCTAssertThrowsError(
            try DynamoWitnessCommitInputV1(
                tableGeneration: otherGeneration,
                currentState: fixture.state,
                replacementCheckpoint:
                    fixture.replacement,
                exactAttemptID:
                    fixture.input.exactAttemptID,
                request: fixture.request,
                immutableInitialReceipt:
                    fixture.receipt,
                signerBinding: fixture.binding,
                validationUnixSeconds: 100
            )
        )
    }

    func testRejectsInvalidAttemptAliases() throws {
        let fixture = try TestCommitFixture()
        XCTAssertThrowsError(
            try DynamoWitnessCommitInputV1(
                tableGeneration:
                    fixture.generation,
                currentState: fixture.state,
                replacementCheckpoint:
                    fixture.replacement,
                exactAttemptID:
                    fixture.request.operationID,
                request: fixture.request,
                immutableInitialReceipt:
                    fixture.receipt,
                signerBinding: fixture.binding,
                validationUnixSeconds: 100
            )
        )
        XCTAssertThrowsError(
            try TestCommitFixture(
                exactAttemptID:
                    fixture.generation
                    .storeGenerationID
            )
        )
    }
}
