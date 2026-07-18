import Foundation
import XCTest

@testable import FloodgateV7ExternalTrustRootProtocol

private func authorityStateBytes32(
    start: UInt8
) -> CanonicalBytes32 {
    try! CanonicalBytes32(
        (0..<32).map { start &+ UInt8($0) }
    )
}

private func authorityStatePublicKeyRawRepresentation() -> [UInt8] {
    (1...32).map(UInt8.init)
}

private func authorityStateKeyRecordFixture()
    throws -> AuthorityPublicKeyRecordV1
{
    let rawRepresentation =
        authorityStatePublicKeyRawRepresentation()
    return try AuthorityPublicKeyRecordV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        authorityPublicKeyRawRepresentation: rawRepresentation,
        authoritySignerKeyID:
            TrustRootSignatureV1.signerKeyID(
                publicKeyRawRepresentation: rawRepresentation
            )
    )
}

private func authorityStateJournalHeaderFixture()
    throws -> ActivationHeadJournalHeaderV1
{
    let keyRecord = try authorityStateKeyRecordFixture()
    return try ActivationHeadJournalHeaderV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        entryByteCount:
            ActivationHeadJournalHeaderV1.requiredEntryByteCount,
        journalID: authorityStateBytes32(start: 0x21),
        authoritySignerKeyID: keyRecord.authoritySignerKeyID,
        authorityPublicKeyRecordSHA256:
            keyRecord.canonicalSHA256()
    )
}

private func authorityStateExpectedHeadFixture(
    latestActivationSequence: UInt64 = 7
) throws -> ExpectedActivationHeadV1 {
    try ExpectedActivationHeadV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        authoritySignerKeyID:
            authorityStateKeyRecordFixture().authoritySignerKeyID,
        latestActivationSequence: latestActivationSequence,
        latestActivationEnvelopeSHA256:
            authorityStateBytes32(start: 0x41),
        activeEnrollmentEnvelopeSHA256:
            authorityStateBytes32(start: 0x61),
        activeEnrollmentRecordSHA256:
            authorityStateBytes32(start: 0x81)
    )
}

private func authorityStateJournalEntryFixture()
    throws -> ActivationHeadJournalEntryV1
{
    try ActivationHeadJournalEntryV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        journalSequence: 7,
        previousJournalRecordSHA256:
            authorityStateBytes32(start: 0xa1),
        expectedActivationHead:
            authorityStateExpectedHeadFixture()
    )
}

private func assertInvalidAuthorityStateRecord<T>(
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

private func authorityStateHexadecimal(_ bytes: [UInt8]) -> String {
    bytes.map { String(format: "%02x", $0) }.joined()
}

private func authorityStateZero(
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

final class AuthorityStateCanonicalRecordTests: XCTestCase {
    func testAuthorityPublicKeyRecordPinsWireAndHashVector()
        throws
    {
        let record = try authorityStateKeyRecordFixture()
        let canonical = record.canonicalBytes()

        XCTAssertEqual(
            AuthorityPublicKeyRecordV1.canonicalByteCount,
            76
        )
        XCTAssertEqual(canonical.count, 76)
        XCTAssertEqual(
            Array(canonical[0..<8]),
            Array("FGV7APK1".utf8)
        )
        XCTAssertEqual(Array(canonical[8..<12]), [1, 0, 1, 1])
        XCTAssertEqual(
            Array(canonical[12..<44]),
            record.authorityPublicKeyRawRepresentation
        )
        XCTAssertEqual(
            Array(canonical[44..<76]),
            record.authoritySignerKeyID.bytes
        )
        XCTAssertEqual(
            authorityStateHexadecimal(
                record.authoritySignerKeyID.bytes
            ),
            "ae216c2ef5247a3782c135efa279a3e4"
                + "cdc61094270f5d2be58c6204b7a612c9"
        )
        XCTAssertEqual(
            authorityStateHexadecimal(
                record.canonicalSHA256().bytes
            ),
            "84196977c4cd91d90234ad737b339438"
                + "7b68303072df958fbc088862426b526d"
        )
        XCTAssertEqual(
            try AuthorityPublicKeyRecordV1.decodeCanonical(
                canonical
            ),
            record
        )
    }

    func testAuthorityPublicKeyRecordRejectsInvalidKeysAndDrift()
        throws
    {
        let rawRepresentation =
            authorityStatePublicKeyRawRepresentation()
        let signerKeyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation: rawRepresentation
        )
        for invalidLength in [31, 33] {
            assertInvalidAuthorityStateRecord(
                try AuthorityPublicKeyRecordV1(
                    audience: .productionRecovery,
                    purpose: .inspectStalePrefix100,
                    authorityPublicKeyRawRepresentation:
                        Array(
                            rawRepresentation.prefix(invalidLength)
                        )
                        + Array(
                            repeating: 1,
                            count: max(
                                0,
                                invalidLength
                                    - rawRepresentation.count
                            )
                        ),
                    authoritySignerKeyID: signerKeyID
                )
            )
        }
        assertInvalidAuthorityStateRecord(
            try AuthorityPublicKeyRecordV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                authorityPublicKeyRawRepresentation:
                    Array(repeating: 0, count: 32),
                authoritySignerKeyID: signerKeyID
            )
        )
        assertInvalidAuthorityStateRecord(
            try AuthorityPublicKeyRecordV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                authorityPublicKeyRawRepresentation:
                    rawRepresentation,
                authoritySignerKeyID:
                    authorityStateBytes32(start: 0xd1)
            )
        )

        let canonical =
            try authorityStateKeyRecordFixture().canonicalBytes()
        assertInvalidAuthorityStateRecord(
            try AuthorityPublicKeyRecordV1.decodeCanonical(
                Array(canonical.dropLast())
            )
        )
        assertInvalidAuthorityStateRecord(
            try AuthorityPublicKeyRecordV1.decodeCanonical(
                canonical + [0]
            )
        )
        for offset in canonical.indices {
            var mutated = canonical
            mutated[offset] ^= 1
            assertInvalidAuthorityStateRecord(
                try AuthorityPublicKeyRecordV1.decodeCanonical(
                    mutated
                )
            )
        }
    }

    func testActivationHeadJournalHeaderPinsWireAndHashVector()
        throws
    {
        let header = try authorityStateJournalHeaderFixture()
        let canonical = header.canonicalBytes()

        XCTAssertEqual(
            ActivationHeadJournalHeaderV1.canonicalByteCount,
            112
        )
        XCTAssertEqual(
            ActivationHeadJournalHeaderV1.requiredEntryByteCount,
            UInt32(
                ActivationHeadJournalEntryV1.canonicalByteCount
            )
        )
        XCTAssertEqual(canonical.count, 112)
        XCTAssertEqual(
            Array(canonical[0..<8]),
            Array("FGV7AJH1".utf8)
        )
        XCTAssertEqual(Array(canonical[8..<12]), [1, 0, 1, 1])
        XCTAssertEqual(
            Array(canonical[12..<16]),
            [0, 0, 0, 200]
        )
        XCTAssertEqual(
            Array(canonical[16..<48]),
            header.journalID.bytes
        )
        XCTAssertEqual(
            Array(canonical[48..<80]),
            header.authoritySignerKeyID.bytes
        )
        XCTAssertEqual(
            Array(canonical[80..<112]),
            header.authorityPublicKeyRecordSHA256.bytes
        )
        XCTAssertEqual(
            authorityStateHexadecimal(
                header.canonicalSHA256().bytes
            ),
            "1c2e91bae1ba0b36d4ebfe83ea5d8daa"
                + "017577a60904f772808a5ea447fcb47a"
        )
        XCTAssertEqual(
            try ActivationHeadJournalHeaderV1.decodeCanonical(
                canonical
            ),
            header
        )
    }

    func testActivationHeadJournalHeaderRejectsInvalidFieldsAndDrift()
        throws
    {
        let valid = try authorityStateJournalHeaderFixture()
        for entryByteCount: UInt32 in [0, 199, 201] {
            assertInvalidAuthorityStateRecord(
                try ActivationHeadJournalHeaderV1(
                    audience: .productionRecovery,
                    purpose: .inspectStalePrefix100,
                    entryByteCount: entryByteCount,
                    journalID: valid.journalID,
                    authoritySignerKeyID:
                        valid.authoritySignerKeyID,
                    authorityPublicKeyRecordSHA256:
                        valid.authorityPublicKeyRecordSHA256
                )
            )
        }
        for zeroField in 0..<3 {
            assertInvalidAuthorityStateRecord(
                try ActivationHeadJournalHeaderV1(
                    audience: .productionRecovery,
                    purpose: .inspectStalePrefix100,
                    entryByteCount:
                        ActivationHeadJournalHeaderV1
                        .requiredEntryByteCount,
                    journalID:
                        zeroField == 0 ? .zero : valid.journalID,
                    authoritySignerKeyID:
                        zeroField == 1
                        ? .zero : valid.authoritySignerKeyID,
                    authorityPublicKeyRecordSHA256:
                        zeroField == 2
                        ? .zero
                        : valid.authorityPublicKeyRecordSHA256
                )
            )
        }

        let canonical = valid.canonicalBytes()
        assertInvalidAuthorityStateRecord(
            try ActivationHeadJournalHeaderV1.decodeCanonical(
                Array(canonical.dropLast())
            )
        )
        assertInvalidAuthorityStateRecord(
            try ActivationHeadJournalHeaderV1.decodeCanonical(
                canonical + [0]
            )
        )
        for offset in 0..<16 {
            var mutated = canonical
            mutated[offset] ^= 1
            assertInvalidAuthorityStateRecord(
                try ActivationHeadJournalHeaderV1.decodeCanonical(
                    mutated
                )
            )
        }
        for range in [16..<48, 48..<80, 80..<112] {
            assertInvalidAuthorityStateRecord(
                try ActivationHeadJournalHeaderV1.decodeCanonical(
                    authorityStateZero(range, in: canonical)
                )
            )
        }
    }

    func testActivationHeadJournalEntryPinsWireAndHashVector()
        throws
    {
        let entry = try authorityStateJournalEntryFixture()
        let canonical = entry.canonicalBytes()

        XCTAssertEqual(
            ActivationHeadJournalEntryV1.canonicalByteCount,
            200
        )
        XCTAssertEqual(canonical.count, 200)
        XCTAssertEqual(
            Array(canonical[0..<8]),
            Array("FGV7AJE1".utf8)
        )
        XCTAssertEqual(Array(canonical[8..<12]), [1, 0, 1, 1])
        XCTAssertEqual(
            Array(canonical[12..<20]),
            [0, 0, 0, 0, 0, 0, 0, 7]
        )
        XCTAssertEqual(
            Array(canonical[20..<52]),
            entry.previousJournalRecordSHA256.bytes
        )
        XCTAssertEqual(
            Array(canonical[52..<200]),
            entry.expectedActivationHead.canonicalBytes()
        )
        XCTAssertEqual(
            authorityStateHexadecimal(
                entry.canonicalSHA256().bytes
            ),
            "c4d7f87e7e863870d939d3b85bddf5bf"
                + "16a2eabf66031ed406203493ed9a5ec7"
        )
        XCTAssertEqual(
            try ActivationHeadJournalEntryV1.decodeCanonical(
                canonical
            ),
            entry
        )
    }

    func testActivationHeadJournalEntryRejectsBrokenInvariantsAndDrift()
        throws
    {
        let head = try authorityStateExpectedHeadFixture()
        assertInvalidAuthorityStateRecord(
            try ActivationHeadJournalEntryV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                journalSequence: 0,
                previousJournalRecordSHA256:
                    authorityStateBytes32(start: 0xa1),
                expectedActivationHead: head
            )
        )
        assertInvalidAuthorityStateRecord(
            try ActivationHeadJournalEntryV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                journalSequence: 8,
                previousJournalRecordSHA256:
                    authorityStateBytes32(start: 0xa1),
                expectedActivationHead: head
            )
        )
        assertInvalidAuthorityStateRecord(
            try ActivationHeadJournalEntryV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                journalSequence: 7,
                previousJournalRecordSHA256: .zero,
                expectedActivationHead: head
            )
        )

        let canonical =
            try authorityStateJournalEntryFixture().canonicalBytes()
        assertInvalidAuthorityStateRecord(
            try ActivationHeadJournalEntryV1.decodeCanonical(
                Array(canonical.dropLast())
            )
        )
        assertInvalidAuthorityStateRecord(
            try ActivationHeadJournalEntryV1.decodeCanonical(
                canonical + [0]
            )
        )
        for offset in 0..<20 {
            var mutated = canonical
            mutated[offset] ^= 1
            assertInvalidAuthorityStateRecord(
                try ActivationHeadJournalEntryV1.decodeCanonical(
                    mutated
                )
            )
        }
        assertInvalidAuthorityStateRecord(
            try ActivationHeadJournalEntryV1.decodeCanonical(
                authorityStateZero(20..<52, in: canonical)
            )
        )
        for offset in 52..<64 {
            var mutated = canonical
            mutated[offset] ^= 1
            assertInvalidAuthorityStateRecord(
                try ActivationHeadJournalEntryV1.decodeCanonical(
                    mutated
                )
            )
        }
        for offset in 96..<104 {
            var mutated = canonical
            mutated[offset] ^= 1
            assertInvalidAuthorityStateRecord(
                try ActivationHeadJournalEntryV1.decodeCanonical(
                    mutated
                )
            )
        }
        for range in [
            64..<96,
            104..<136,
            136..<168,
            168..<200,
        ] {
            assertInvalidAuthorityStateRecord(
                try ActivationHeadJournalEntryV1.decodeCanonical(
                    authorityStateZero(range, in: canonical)
                )
            )
        }
    }
}
