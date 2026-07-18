import CryptoKit
import Foundation
import XCTest

@testable import FloodgateV7ExternalTrustRootProtocol

private func remoteWitnessBytes32(
    start: UInt8
) -> CanonicalBytes32 {
    try! CanonicalBytes32(
        (0..<32).map { start &+ UInt8($0) }
    )
}

private func remoteWitnessHexadecimal(
    _ bytes: [UInt8]
) -> String {
    bytes.map { String(format: "%02x", $0) }.joined()
}

private func remoteWitnessZero(
    _ range: Range<Int>,
    in canonical: [UInt8]
) -> [UInt8] {
    var mutated = canonical
    mutated.replaceSubrange(
        range,
        with: repeatElement(UInt8(0), count: range.count)
    )
    return mutated
}

private func remoteWitnessMutate(
    _ offset: Int,
    in canonical: [UInt8],
    to value: UInt8? = nil
) -> [UInt8] {
    var mutated = canonical
    mutated[offset] = value ?? (mutated[offset] ^ 0xff)
    return mutated
}

private func remoteWitnessUInt64Bytes(
    _ value: UInt64
) -> [UInt8] {
    stride(from: 56, through: 0, by: -8).map {
        UInt8(truncatingIfNeeded: value >> UInt64($0))
    }
}

private func assertInvalidRemoteWitnessRecord<T>(
    _ expression: @autoclosure () throws -> T,
    file: StaticString = #filePath,
    line: UInt = #line
) {
    XCTAssertThrowsError(try expression(), file: file, line: line) {
        error in
        XCTAssertEqual(
            error as? CanonicalRecordError,
            .invalidCanonicalRecord,
            file: file,
            line: line
        )
    }
}

private func remoteWitnessCheckpointFixture(
    journalSequence: UInt64 = 1,
    previousWitnessedCheckpointSHA256:
        CanonicalBytes32 = .zero,
    journalID: CanonicalBytes32 =
        remoteWitnessBytes32(start: 0x11),
    authorityPublicKeyRecordSHA256:
        CanonicalBytes32 =
        remoteWitnessBytes32(start: 0x31),
    journalHeaderSHA256:
        CanonicalBytes32 =
        remoteWitnessBytes32(start: 0x51),
    lastJournalEntrySHA256:
        CanonicalBytes32 =
        remoteWitnessBytes32(start: 0x71),
    expectedActivationHeadSHA256:
        CanonicalBytes32 =
        remoteWitnessBytes32(start: 0x91)
) throws -> AuthorityRollbackCheckpointV1 {
    try AuthorityRollbackCheckpointV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        journalID: journalID,
        journalSequence: journalSequence,
        authorityPublicKeyRecordSHA256:
            authorityPublicKeyRecordSHA256,
        journalHeaderSHA256: journalHeaderSHA256,
        lastJournalEntrySHA256: lastJournalEntrySHA256,
        expectedActivationHeadSHA256:
            expectedActivationHeadSHA256,
        previousWitnessedCheckpointSHA256:
            previousWitnessedCheckpointSHA256
    )
}

private func remoteWitnessAdvanceCheckpointFixture()
    throws -> AuthorityRollbackCheckpointV1
{
    let previous = try remoteWitnessCheckpointFixture()
    return try remoteWitnessCheckpointFixture(
        journalSequence: 2,
        previousWitnessedCheckpointSHA256:
            previous.canonicalSHA256(),
        lastJournalEntrySHA256:
            remoteWitnessBytes32(start: 0xb1),
        expectedActivationHeadSHA256:
            remoteWitnessBytes32(start: 0xd1)
    )
}

private func remoteWitnessQueryRequestFixture()
    throws -> RemoteMonotonicWitnessRequestV1
{
    try RemoteMonotonicWitnessRequestV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        operation: .query,
        witnessID: remoteWitnessBytes32(start: 0x21),
        endpointID: remoteWitnessBytes32(start: 0x41),
        clientNonce: remoteWitnessBytes32(start: 0x61),
        operationID: remoteWitnessBytes32(start: 0x81),
        expectedCheckpointSHA256: .zero,
        candidateCheckpoint: nil
    )
}

private func remoteWitnessAdvanceRequestFixture()
    throws -> RemoteMonotonicWitnessRequestV1
{
    let current = try remoteWitnessCheckpointFixture()
    return try RemoteMonotonicWitnessRequestV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        operation: .advance,
        witnessID: remoteWitnessBytes32(start: 0x21),
        endpointID: remoteWitnessBytes32(start: 0x41),
        clientNonce: remoteWitnessBytes32(start: 0x62),
        operationID: remoteWitnessBytes32(start: 0x82),
        expectedCheckpointSHA256: current.canonicalSHA256(),
        candidateCheckpoint:
            remoteWitnessAdvanceCheckpointFixture()
    )
}

private func remoteWitnessPrivateKey()
    throws -> Curve25519.Signing.PrivateKey
{
    try Curve25519.Signing.PrivateKey(
        rawRepresentation: Data((1...32).map(UInt8.init))
    )
}

private func remoteWitnessSignedReceipt(
    request: RemoteMonotonicWitnessRequestV1,
    accepted: Bool,
    checkpoint: AuthorityRollbackCheckpointV1,
    issuedAtUnixSeconds: UInt64 = 1_700_000_000,
    expiresAtUnixSeconds: UInt64 = 1_700_000_030
) throws -> RemoteMonotonicWitnessReceiptV1 {
    let privateKey = try remoteWitnessPrivateKey()
    let publicKey = [UInt8](
        privateKey.publicKey.rawRepresentation
    )
    let signerKeyID = try TrustRootSignatureV1.signerKeyID(
        publicKeyRawRepresentation: publicKey
    )
    let payload =
        try RemoteMonotonicWitnessReceiptV1.signaturePayload(
            audience: request.audience,
            purpose: request.purpose,
            operation: request.operation,
            accepted: accepted,
            witnessID: request.witnessID,
            endpointID: request.endpointID,
            witnessSignerKeyID: signerKeyID,
            clientNonce: request.clientNonce,
            operationID: request.operationID,
            requestSHA256: request.canonicalSHA256(),
            checkpoint: checkpoint,
            issuedAtUnixSeconds: issuedAtUnixSeconds,
            expiresAtUnixSeconds: expiresAtUnixSeconds
        )
    return try RemoteMonotonicWitnessReceiptV1(
        audience: request.audience,
        purpose: request.purpose,
        operation: request.operation,
        accepted: accepted,
        witnessID: request.witnessID,
        endpointID: request.endpointID,
        witnessSignerKeyID: signerKeyID,
        clientNonce: request.clientNonce,
        operationID: request.operationID,
        requestSHA256: request.canonicalSHA256(),
        checkpoint: checkpoint,
        issuedAtUnixSeconds: issuedAtUnixSeconds,
        expiresAtUnixSeconds: expiresAtUnixSeconds,
        signature: CanonicalBytes64(
            [UInt8](
                try privateKey.signature(
                    for: Data(payload)
                )
            )
        )
    )
}

private func remoteWitnessCanonicalReceiptFixture(
    request: RemoteMonotonicWitnessRequestV1,
    accepted: Bool,
    checkpoint: AuthorityRollbackCheckpointV1
) throws -> RemoteMonotonicWitnessReceiptV1 {
    let publicKey = [UInt8](
        try remoteWitnessPrivateKey()
            .publicKey.rawRepresentation
    )
    return try RemoteMonotonicWitnessReceiptV1(
        audience: request.audience,
        purpose: request.purpose,
        operation: request.operation,
        accepted: accepted,
        witnessID: request.witnessID,
        endpointID: request.endpointID,
        witnessSignerKeyID:
            TrustRootSignatureV1.signerKeyID(
                publicKeyRawRepresentation: publicKey
            ),
        clientNonce: request.clientNonce,
        operationID: request.operationID,
        requestSHA256: request.canonicalSHA256(),
        checkpoint: checkpoint,
        issuedAtUnixSeconds: 1_700_000_000,
        expiresAtUnixSeconds: 1_700_000_030,
        signature: CanonicalBytes64(
            (0..<64).map {
                0x80 &+ UInt8($0)
            }
        )
    )
}

final class RemoteMonotonicWitnessCanonicalRecordTests:
    XCTestCase
{
    func testCheckpointPinsCanonicalLayoutHashAndRoundTrip()
        throws
    {
        let checkpoint = try remoteWitnessCheckpointFixture()
        let canonical = checkpoint.canonicalBytes()

        XCTAssertEqual(
            AuthorityRollbackCheckpointV1.canonicalByteCount,
            212
        )
        XCTAssertEqual(canonical.count, 212)
        XCTAssertEqual(
            Array(canonical[0..<8]),
            Array("FGV7ARC1".utf8)
        )
        XCTAssertEqual(Array(canonical[8..<12]), [1, 0, 1, 1])
        XCTAssertEqual(
            Array(canonical[12..<44]),
            checkpoint.journalID.bytes
        )
        XCTAssertEqual(
            Array(canonical[44..<52]),
            remoteWitnessUInt64Bytes(1)
        )
        XCTAssertEqual(
            Array(canonical[52..<84]),
            checkpoint.authorityPublicKeyRecordSHA256.bytes
        )
        XCTAssertEqual(
            Array(canonical[84..<116]),
            checkpoint.journalHeaderSHA256.bytes
        )
        XCTAssertEqual(
            Array(canonical[116..<148]),
            checkpoint.lastJournalEntrySHA256.bytes
        )
        XCTAssertEqual(
            Array(canonical[148..<180]),
            checkpoint.expectedActivationHeadSHA256.bytes
        )
        XCTAssertEqual(
            Array(canonical[180..<212]),
            Array(repeating: 0, count: 32)
        )
        XCTAssertEqual(
            remoteWitnessHexadecimal(
                checkpoint.canonicalSHA256().bytes
            ),
            "98920198d8a98c2537dc2efc444c5fcd"
                + "bb70b2282ef72a82305c03f0c8a22fda"
        )
        XCTAssertEqual(
            try AuthorityRollbackCheckpointV1.decodeCanonical(
                canonical
            ),
            checkpoint
        )
    }

    func testCheckpointRejectsInvalidChainFieldsAndWireDrift()
        throws
    {
        let first = try remoteWitnessCheckpointFixture()
        assertInvalidRemoteWitnessRecord(
            try remoteWitnessCheckpointFixture(
                journalSequence: 0
            )
        )
        assertInvalidRemoteWitnessRecord(
            try remoteWitnessCheckpointFixture(
                previousWitnessedCheckpointSHA256:
                    remoteWitnessBytes32(start: 0xe1)
            )
        )
        assertInvalidRemoteWitnessRecord(
            try remoteWitnessCheckpointFixture(
                journalSequence: 2
            )
        )
        assertInvalidRemoteWitnessRecord(
            try remoteWitnessCheckpointFixture(
                authorityPublicKeyRecordSHA256:
                    first.journalID
            )
        )
        assertInvalidRemoteWitnessRecord(
            try remoteWitnessCheckpointFixture(
                journalSequence: 2,
                previousWitnessedCheckpointSHA256:
                    first.journalID
            )
        )
        for zeroedValue in 0..<5 {
            assertInvalidRemoteWitnessRecord(
                try remoteWitnessCheckpointFixture(
                    journalID:
                        zeroedValue == 0
                            ? .zero
                            : first.journalID,
                    authorityPublicKeyRecordSHA256:
                        zeroedValue == 1
                            ? .zero
                            : first
                                .authorityPublicKeyRecordSHA256,
                    journalHeaderSHA256:
                        zeroedValue == 2
                            ? .zero
                            : first.journalHeaderSHA256,
                    lastJournalEntrySHA256:
                        zeroedValue == 3
                            ? .zero
                            : first.lastJournalEntrySHA256,
                    expectedActivationHeadSHA256:
                        zeroedValue == 4
                            ? .zero
                            : first
                                .expectedActivationHeadSHA256
                )
            )
        }

        let canonical = first.canonicalBytes()
        for offset in [0, 8, 9, 10, 11] {
            assertInvalidRemoteWitnessRecord(
                try AuthorityRollbackCheckpointV1.decodeCanonical(
                    remoteWitnessMutate(offset, in: canonical)
                )
            )
        }
        for range in [
            12..<44,
            44..<52,
            52..<84,
            84..<116,
            116..<148,
            148..<180,
        ] {
            assertInvalidRemoteWitnessRecord(
                try AuthorityRollbackCheckpointV1.decodeCanonical(
                    remoteWitnessZero(range, in: canonical)
                )
            )
        }
        var roleAlias = canonical
        roleAlias.replaceSubrange(
            52..<84,
            with: roleAlias[12..<44]
        )
        assertInvalidRemoteWitnessRecord(
            try AuthorityRollbackCheckpointV1.decodeCanonical(
                roleAlias
            )
        )
        assertInvalidRemoteWitnessRecord(
            try AuthorityRollbackCheckpointV1.decodeCanonical(
                Array(canonical.dropLast())
            )
        )
        assertInvalidRemoteWitnessRecord(
            try AuthorityRollbackCheckpointV1.decodeCanonical(
                canonical + [0]
            )
        )
    }

    func testQueryRequestPinsZeroTailHashAndRoundTrip()
        throws
    {
        let request = try remoteWitnessQueryRequestFixture()
        let canonical = request.canonicalBytes()

        XCTAssertEqual(
            RemoteMonotonicWitnessRequestV1.canonicalByteCount,
            418
        )
        XCTAssertEqual(canonical.count, 418)
        XCTAssertEqual(
            Array(canonical[0..<8]),
            Array("FGV7RWR1".utf8)
        )
        XCTAssertEqual(
            Array(canonical[8..<14]),
            [1, 0, 1, 1, 1, 0]
        )
        XCTAssertEqual(
            Array(canonical[14..<46]),
            request.witnessID.bytes
        )
        XCTAssertEqual(
            Array(canonical[46..<78]),
            request.endpointID.bytes
        )
        XCTAssertEqual(
            Array(canonical[78..<110]),
            request.clientNonce.bytes
        )
        XCTAssertEqual(
            Array(canonical[110..<142]),
            request.operationID.bytes
        )
        XCTAssertEqual(
            Array(canonical[142..<418]),
            Array(repeating: 0, count: 276)
        )
        XCTAssertEqual(
            remoteWitnessHexadecimal(
                request.canonicalSHA256().bytes
            ),
            "91fb95e4f7360ec69a0e7c27601329ce"
                + "27cb23f0db37084fa35f76f5d5db39d6"
        )
        XCTAssertEqual(
            try RemoteMonotonicWitnessRequestV1.decodeCanonical(
                canonical
            ),
            request
        )
    }

    func testQueryRequestRejectsNonzeroTailZeroIDsAndWireDrift()
        throws
    {
        let request = try remoteWitnessQueryRequestFixture()
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessRequestV1(
                audience: request.audience,
                purpose: request.purpose,
                operation: .query,
                witnessID: request.witnessID,
                endpointID: request.endpointID,
                clientNonce: request.clientNonce,
                operationID: request.operationID,
                expectedCheckpointSHA256:
                    remoteWitnessBytes32(start: 0xa1),
                candidateCheckpoint: nil
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessRequestV1(
                audience: request.audience,
                purpose: request.purpose,
                operation: .query,
                witnessID: request.witnessID,
                endpointID: request.endpointID,
                clientNonce: request.clientNonce,
                operationID: request.operationID,
                expectedCheckpointSHA256: .zero,
                candidateCheckpoint:
                    remoteWitnessCheckpointFixture()
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessRequestV1(
                audience: request.audience,
                purpose: request.purpose,
                operation: .query,
                witnessID: request.witnessID,
                endpointID: request.witnessID,
                clientNonce: request.clientNonce,
                operationID: request.operationID,
                expectedCheckpointSHA256: .zero,
                candidateCheckpoint: nil
            )
        )

        for zeroedID in 0..<4 {
            assertInvalidRemoteWitnessRecord(
                try RemoteMonotonicWitnessRequestV1(
                    audience: request.audience,
                    purpose: request.purpose,
                    operation: .query,
                    witnessID:
                        zeroedID == 0
                            ? .zero
                            : request.witnessID,
                    endpointID:
                        zeroedID == 1
                            ? .zero
                            : request.endpointID,
                    clientNonce:
                        zeroedID == 2
                            ? .zero
                            : request.clientNonce,
                    operationID:
                        zeroedID == 3
                            ? .zero
                            : request.operationID,
                    expectedCheckpointSHA256: .zero,
                    candidateCheckpoint: nil
                )
            )
        }

        let canonical = request.canonicalBytes()
        for offset in [0, 8, 9, 10, 11, 13] {
            assertInvalidRemoteWitnessRecord(
                try RemoteMonotonicWitnessRequestV1
                    .decodeCanonical(
                        remoteWitnessMutate(
                            offset,
                            in: canonical
                        )
                    )
            )
        }
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessRequestV1.decodeCanonical(
                remoteWitnessMutate(12, in: canonical, to: 3)
            )
        )
        for range in [
            14..<46,
            46..<78,
            78..<110,
            110..<142,
        ] {
            assertInvalidRemoteWitnessRecord(
                try RemoteMonotonicWitnessRequestV1
                    .decodeCanonical(
                        remoteWitnessZero(range, in: canonical)
                    )
            )
        }
        for offset in [142, 174, 206] {
            assertInvalidRemoteWitnessRecord(
                try RemoteMonotonicWitnessRequestV1
                    .decodeCanonical(
                        remoteWitnessMutate(
                            offset,
                            in: canonical,
                            to: 1
                        )
                )
            )
        }
        var roleAlias = canonical
        roleAlias.replaceSubrange(
            46..<78,
            with: roleAlias[14..<46]
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessRequestV1.decodeCanonical(
                roleAlias
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessRequestV1.decodeCanonical(
                Array(canonical.dropLast())
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessRequestV1.decodeCanonical(
                canonical + [0]
            )
        )
    }

    func testAdvanceRequestPinsCandidateDigestHashAndRoundTrip()
        throws
    {
        let request = try remoteWitnessAdvanceRequestFixture()
        let candidate = try XCTUnwrap(request.candidateCheckpoint)
        let canonical = request.canonicalBytes()

        XCTAssertEqual(
            Array(canonical[8..<14]),
            [1, 0, 1, 1, 2, 0]
        )
        XCTAssertEqual(
            Array(canonical[142..<174]),
            request.expectedCheckpointSHA256.bytes
        )
        XCTAssertEqual(
            Array(canonical[174..<206]),
            candidate.canonicalSHA256().bytes
        )
        XCTAssertEqual(
            Array(canonical[206..<418]),
            candidate.canonicalBytes()
        )
        XCTAssertEqual(
            remoteWitnessHexadecimal(
                request.canonicalSHA256().bytes
            ),
            "7e9f3aea50d9f4377625888156ac0b7b"
                + "3db02b6e73ad11b1646a047a890b2a8a"
        )
        XCTAssertEqual(
            try RemoteMonotonicWitnessRequestV1.decodeCanonical(
                canonical
            ),
            request
        )
    }

    func testAdvanceRequestRejectsInvalidCASAndCandidateDigest()
        throws
    {
        let request = try remoteWitnessAdvanceRequestFixture()
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessRequestV1(
                audience: request.audience,
                purpose: request.purpose,
                operation: .advance,
                witnessID: request.witnessID,
                endpointID: request.endpointID,
                clientNonce: request.clientNonce,
                operationID: request.operationID,
                expectedCheckpointSHA256: .zero,
                candidateCheckpoint: request.candidateCheckpoint
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessRequestV1(
                audience: request.audience,
                purpose: request.purpose,
                operation: .advance,
                witnessID: request.witnessID,
                endpointID: request.endpointID,
                clientNonce: request.clientNonce,
                operationID: request.operationID,
                expectedCheckpointSHA256:
                    request.expectedCheckpointSHA256,
                candidateCheckpoint: nil
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessRequestV1(
                audience: request.audience,
                purpose: request.purpose,
                operation: .advance,
                witnessID: request.witnessID,
                endpointID: request.endpointID,
                clientNonce: request.clientNonce,
                operationID: request.operationID,
                expectedCheckpointSHA256:
                    remoteWitnessBytes32(start: 0xf0),
                candidateCheckpoint: request.candidateCheckpoint
            )
        )

        let canonical = request.canonicalBytes()
        for range in [142..<174, 174..<206] {
            assertInvalidRemoteWitnessRecord(
                try RemoteMonotonicWitnessRequestV1
                    .decodeCanonical(
                        remoteWitnessZero(range, in: canonical)
                    )
            )
        }
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessRequestV1.decodeCanonical(
                remoteWitnessMutate(174, in: canonical)
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessRequestV1.decodeCanonical(
                remoteWitnessMutate(206, in: canonical)
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessRequestV1.decodeCanonical(
                remoteWitnessMutate(12, in: canonical, to: 1)
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessRequestV1.decodeCanonical(
                remoteWitnessMutate(12, in: canonical, to: 3)
            )
        )
    }

    func testReceiptPinsCanonicalLayoutHashAndVerifiesSignature()
        throws
    {
        let request = try remoteWitnessAdvanceRequestFixture()
        let checkpoint = try XCTUnwrap(
            request.candidateCheckpoint
        )
        let receipt = try remoteWitnessCanonicalReceiptFixture(
            request: request,
            accepted: true,
            checkpoint: checkpoint
        )
        let canonical = receipt.canonicalBytes()
        let publicKey = [UInt8](
            try remoteWitnessPrivateKey()
                .publicKey.rawRepresentation
        )

        XCTAssertEqual(
            RemoteMonotonicWitnessReceiptV1.canonicalByteCount,
            530
        )
        XCTAssertEqual(
            RemoteMonotonicWitnessReceiptV1
                .maximumLifetimeSeconds,
            30
        )
        XCTAssertEqual(canonical.count, 530)
        XCTAssertEqual(
            Array(canonical[0..<8]),
            Array("FGV7RCP1".utf8)
        )
        XCTAssertEqual(
            Array(canonical[8..<14]),
            [1, 0, 1, 1, 2, 1]
        )
        XCTAssertEqual(
            Array(canonical[14..<46]),
            receipt.witnessID.bytes
        )
        XCTAssertEqual(
            Array(canonical[46..<78]),
            receipt.endpointID.bytes
        )
        XCTAssertEqual(
            Array(canonical[78..<110]),
            receipt.witnessSignerKeyID.bytes
        )
        XCTAssertEqual(
            Array(canonical[110..<142]),
            receipt.clientNonce.bytes
        )
        XCTAssertEqual(
            Array(canonical[142..<174]),
            receipt.operationID.bytes
        )
        XCTAssertEqual(
            Array(canonical[174..<206]),
            receipt.requestSHA256.bytes
        )
        XCTAssertEqual(
            Array(canonical[206..<238]),
            checkpoint.canonicalSHA256().bytes
        )
        XCTAssertEqual(
            Array(canonical[238..<450]),
            checkpoint.canonicalBytes()
        )
        XCTAssertEqual(
            Array(canonical[450..<458]),
            remoteWitnessUInt64Bytes(1_700_000_000)
        )
        XCTAssertEqual(
            Array(canonical[458..<466]),
            remoteWitnessUInt64Bytes(1_700_000_030)
        )
        XCTAssertEqual(
            Array(canonical[466..<530]),
            receipt.signature.bytes
        )
        XCTAssertEqual(
            receipt.signaturePayload(),
            Array(canonical[0..<466])
        )
        XCTAssertEqual(
            remoteWitnessHexadecimal(
                receipt.canonicalSHA256().bytes
            ),
            "3386755fc6c3e9109172bed57a436881"
                + "85b83549aebc5ffd01ff0b1a1b0b0727"
        )
        XCTAssertEqual(
            try RemoteMonotonicWitnessReceiptV1.decodeCanonical(
                canonical
            ),
            receipt
        )
        let signedReceipt = try remoteWitnessSignedReceipt(
            request: request,
            accepted: true,
            checkpoint: checkpoint
        )
        XCTAssertEqual(
            try signedReceipt.verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation: publicKey,
                nowUnixSeconds: 1_700_000_000
            ),
            checkpoint
        )
        XCTAssertEqual(
            try signedReceipt.verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation: publicKey,
                nowUnixSeconds: 1_700_000_029
            ),
            checkpoint
        )
    }

    func testReceiptRejectsZeroFieldsInvalidTimeAndWireDrift()
        throws
    {
        let request = try remoteWitnessAdvanceRequestFixture()
        let checkpoint = try XCTUnwrap(
            request.candidateCheckpoint
        )
        let receipt = try remoteWitnessSignedReceipt(
            request: request,
            accepted: true,
            checkpoint: checkpoint
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessReceiptV1(
                audience: receipt.audience,
                purpose: receipt.purpose,
                operation: receipt.operation,
                accepted: receipt.accepted,
                witnessID: receipt.witnessID,
                endpointID: receipt.witnessID,
                witnessSignerKeyID:
                    receipt.witnessSignerKeyID,
                clientNonce: receipt.clientNonce,
                operationID: receipt.operationID,
                requestSHA256: receipt.requestSHA256,
                checkpoint: checkpoint,
                issuedAtUnixSeconds:
                    receipt.issuedAtUnixSeconds,
                expiresAtUnixSeconds:
                    receipt.expiresAtUnixSeconds,
                signature: receipt.signature
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessReceiptV1(
                audience: receipt.audience,
                purpose: receipt.purpose,
                operation: receipt.operation,
                accepted: receipt.accepted,
                witnessID: receipt.witnessID,
                endpointID: receipt.endpointID,
                witnessSignerKeyID:
                    receipt.witnessSignerKeyID,
                clientNonce: receipt.clientNonce,
                operationID: receipt.operationID,
                requestSHA256: receipt.checkpointSHA256,
                checkpoint: checkpoint,
                issuedAtUnixSeconds:
                    receipt.issuedAtUnixSeconds,
                expiresAtUnixSeconds:
                    receipt.expiresAtUnixSeconds,
                signature: receipt.signature
            )
        )

        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessReceiptV1(
                audience: receipt.audience,
                purpose: receipt.purpose,
                operation: receipt.operation,
                accepted: receipt.accepted,
                witnessID: receipt.witnessID,
                endpointID: receipt.endpointID,
                witnessSignerKeyID: receipt.witnessSignerKeyID,
                clientNonce: receipt.clientNonce,
                operationID: receipt.operationID,
                requestSHA256: receipt.requestSHA256,
                checkpoint: checkpoint,
                issuedAtUnixSeconds: 0,
                expiresAtUnixSeconds: 1,
                signature: receipt.signature
            )
        )
        for (issuedAt, expiresAt) in [
            (UInt64(1), UInt64(1)),
            (UInt64(1), UInt64(32)),
            (UInt64.max - 10, UInt64.max),
        ] {
            assertInvalidRemoteWitnessRecord(
                try RemoteMonotonicWitnessReceiptV1(
                    audience: receipt.audience,
                    purpose: receipt.purpose,
                    operation: receipt.operation,
                    accepted: receipt.accepted,
                    witnessID: receipt.witnessID,
                    endpointID: receipt.endpointID,
                    witnessSignerKeyID:
                        receipt.witnessSignerKeyID,
                    clientNonce: receipt.clientNonce,
                    operationID: receipt.operationID,
                    requestSHA256: receipt.requestSHA256,
                    checkpoint: checkpoint,
                    issuedAtUnixSeconds: issuedAt,
                    expiresAtUnixSeconds: expiresAt,
                    signature: receipt.signature
                )
            )
        }

        let canonical = receipt.canonicalBytes()
        for offset in [0, 8, 9, 10, 11] {
            assertInvalidRemoteWitnessRecord(
                try RemoteMonotonicWitnessReceiptV1
                    .decodeCanonical(
                        remoteWitnessMutate(
                            offset,
                            in: canonical
                        )
                    )
            )
        }
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessReceiptV1.decodeCanonical(
                remoteWitnessMutate(12, in: canonical, to: 3)
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessReceiptV1.decodeCanonical(
                remoteWitnessMutate(13, in: canonical, to: 2)
            )
        )
        for range in [
            14..<46,
            46..<78,
            78..<110,
            110..<142,
            142..<174,
            174..<206,
            206..<238,
            450..<458,
            458..<466,
            466..<530,
        ] {
            assertInvalidRemoteWitnessRecord(
                try RemoteMonotonicWitnessReceiptV1
                    .decodeCanonical(
                        remoteWitnessZero(range, in: canonical)
                )
            )
        }
        var roleAlias = canonical
        roleAlias.replaceSubrange(
            46..<78,
            with: roleAlias[14..<46]
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessReceiptV1.decodeCanonical(
                roleAlias
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessReceiptV1.decodeCanonical(
                remoteWitnessMutate(206, in: canonical)
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessReceiptV1.decodeCanonical(
                remoteWitnessMutate(238, in: canonical)
            )
        )

        var equalExpiry = canonical
        equalExpiry.replaceSubrange(
            458..<466,
            with: equalExpiry[450..<458]
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessReceiptV1.decodeCanonical(
                equalExpiry
            )
        )
        var longExpiry = canonical
        longExpiry.replaceSubrange(
            458..<466,
            with:
                remoteWitnessUInt64Bytes(1_700_000_031)
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessReceiptV1.decodeCanonical(
                longExpiry
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessReceiptV1.decodeCanonical(
                Array(canonical.dropLast())
            )
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessReceiptV1.decodeCanonical(
                canonical + [0]
            )
        )
    }

    func testQueryReceiptMustBeAccepted()
        throws
    {
        let request = try remoteWitnessQueryRequestFixture()
        let checkpoint = try remoteWitnessCheckpointFixture()
        assertInvalidRemoteWitnessRecord(
            try remoteWitnessSignedReceipt(
                request: request,
                accepted: false,
                checkpoint: checkpoint
            )
        )

        let receipt = try remoteWitnessSignedReceipt(
            request: request,
            accepted: true,
            checkpoint: checkpoint
        )
        assertInvalidRemoteWitnessRecord(
            try RemoteMonotonicWitnessReceiptV1.decodeCanonical(
                remoteWitnessMutate(
                    13,
                    in: receipt.canonicalBytes(),
                    to: 0
                )
            )
        )
    }

    func testReceiptVerificationRejectsBindingTimeAndSignatureMutations()
        throws
    {
        let request = try remoteWitnessAdvanceRequestFixture()
        let checkpoint = try XCTUnwrap(
            request.candidateCheckpoint
        )
        let receipt = try remoteWitnessSignedReceipt(
            request: request,
            accepted: true,
            checkpoint: checkpoint
        )
        let publicKey = [UInt8](
            try remoteWitnessPrivateKey()
                .publicKey.rawRepresentation
        )

        for now in [1_699_999_999, 1_700_000_030] {
            assertInvalidRemoteWitnessRecord(
                try receipt.verifiedCheckpoint(
                    for: request,
                    publicKeyRawRepresentation: publicKey,
                    nowUnixSeconds: UInt64(now)
                )
            )
        }
        let differentPrivateKey =
            try Curve25519.Signing.PrivateKey(
                rawRepresentation: Data(
                    (33...64).map(UInt8.init)
                )
            )
        assertInvalidRemoteWitnessRecord(
            try receipt.verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation: [UInt8](
                    differentPrivateKey
                        .publicKey.rawRepresentation
                ),
                nowUnixSeconds: 1_700_000_001
            )
        )

        var signatureMutated = receipt.canonicalBytes()
        signatureMutated[529] ^= 0x01
        let decodedSignatureMutation =
            try RemoteMonotonicWitnessReceiptV1
            .decodeCanonical(signatureMutated)
        assertInvalidRemoteWitnessRecord(
            try decodedSignatureMutation.verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation: publicKey,
                nowUnixSeconds: 1_700_000_001
            )
        )

        let queryRequest = try remoteWitnessQueryRequestFixture()
        assertInvalidRemoteWitnessRecord(
            try receipt.verifiedCheckpoint(
                for: queryRequest,
                publicKeyRawRepresentation: publicKey,
                nowUnixSeconds: 1_700_000_001
            )
        )

        var swappedRequestBytes = request.canonicalBytes()
        let originalWitnessID =
            Array(swappedRequestBytes[14..<46])
        let originalEndpointID =
            Array(swappedRequestBytes[46..<78])
        swappedRequestBytes.replaceSubrange(
            14..<46,
            with: originalEndpointID
        )
        swappedRequestBytes.replaceSubrange(
            46..<78,
            with: originalWitnessID
        )
        let swappedRequest =
            try RemoteMonotonicWitnessRequestV1.decodeCanonical(
                swappedRequestBytes
            )
        assertInvalidRemoteWitnessRecord(
            try receipt.verifiedCheckpoint(
                for: swappedRequest,
                publicKeyRawRepresentation: publicKey,
                nowUnixSeconds: 1_700_000_001
            )
        )

        var swappedReceiptBytes = receipt.canonicalBytes()
        let receiptWitnessID =
            Array(swappedReceiptBytes[14..<46])
        let receiptEndpointID =
            Array(swappedReceiptBytes[46..<78])
        swappedReceiptBytes.replaceSubrange(
            14..<46,
            with: receiptEndpointID
        )
        swappedReceiptBytes.replaceSubrange(
            46..<78,
            with: receiptWitnessID
        )
        let swappedReceipt =
            try RemoteMonotonicWitnessReceiptV1.decodeCanonical(
                swappedReceiptBytes
            )
        assertInvalidRemoteWitnessRecord(
            try swappedReceipt.verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation: publicKey,
                nowUnixSeconds: 1_700_000_001
            )
        )

        var requestDigestMutated = receipt.canonicalBytes()
        requestDigestMutated[174] ^= 0x01
        let decodedDigestMutation =
            try RemoteMonotonicWitnessReceiptV1
            .decodeCanonical(requestDigestMutated)
        assertInvalidRemoteWitnessRecord(
            try decodedDigestMutation.verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation: publicKey,
                nowUnixSeconds: 1_700_000_001
            )
        )

        let wrongCheckpoint = try remoteWitnessCheckpointFixture()
        let wrongAcceptedReceipt =
            try remoteWitnessSignedReceipt(
                request: request,
                accepted: true,
                checkpoint: wrongCheckpoint
            )
        assertInvalidRemoteWitnessRecord(
            try wrongAcceptedReceipt.verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation: publicKey,
                nowUnixSeconds: 1_700_000_001
            )
        )
    }

    func testRejectedAdvanceReceiptCanReturnCurrentCheckpoint()
        throws
    {
        let request = try remoteWitnessAdvanceRequestFixture()
        let current = try remoteWitnessCheckpointFixture()
        let receipt = try remoteWitnessSignedReceipt(
            request: request,
            accepted: false,
            checkpoint: current
        )
        let publicKey = [UInt8](
            try remoteWitnessPrivateKey()
                .publicKey.rawRepresentation
        )

        XCTAssertFalse(receipt.accepted)
        XCTAssertEqual(
            try receipt.verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation: publicKey,
                nowUnixSeconds: 1_700_000_001
            ),
            current
        )
    }

    func testReceiptAcceptsExactOneSecondWindow()
        throws
    {
        let request = try remoteWitnessQueryRequestFixture()
        let checkpoint = try remoteWitnessCheckpointFixture()
        let receipt = try remoteWitnessSignedReceipt(
            request: request,
            accepted: true,
            checkpoint: checkpoint,
            issuedAtUnixSeconds: 10,
            expiresAtUnixSeconds: 11
        )
        let publicKey = [UInt8](
            try remoteWitnessPrivateKey()
                .publicKey.rawRepresentation
        )

        XCTAssertEqual(
            try receipt.verifiedCheckpoint(
                for: request,
                publicKeyRawRepresentation: publicKey,
                nowUnixSeconds: 10
            ),
            checkpoint
        )
    }
}
