import XCTest

@testable import FloodgateV7ExternalTrustRootProtocol

private func bytes20(start: UInt8) -> CanonicalBytes20 {
    try! CanonicalBytes20(
        (0..<20).map { start &+ UInt8($0) }
    )
}

private func bytes32(start: UInt8) -> CanonicalBytes32 {
    try! CanonicalBytes32(
        (0..<32).map { start &+ UInt8($0) }
    )
}

private func enrollmentFixture(
    notBefore: UInt64 = 1_700_000_000,
    expiresAt: UInt64 = 1_700_003_600
) throws -> EnrollmentRecord {
    try EnrollmentRecord(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        expectedUID: 501,
        enrollmentID: bytes32(start: 0x10),
        approvedCommit: bytes20(start: 0x30),
        approvedTree: bytes20(start: 0x50),
        sourceManifestSHA256: bytes32(start: 0x70),
        supervisorArtifactSHA256: bytes32(start: 0x90),
        childArtifactSHA256: bytes32(start: 0xb0),
        runtimeClosureSHA256: bytes32(start: 0xd0),
        notBeforeUnixSeconds: notBefore,
        expiresAtUnixSeconds: expiresAt
    )
}

private func activationFixture(
    action: ActivationAction = .activate
) throws -> ActivationRecord {
    try ActivationRecord(
        audience: .productionRecovery,
        action: action,
        sequence: 1,
        activationID: bytes32(start: 0x21),
        targetEnrollmentID: bytes32(start: 0x10),
        previousActivationDigest: .zero,
        issuedAtUnixSeconds: 1_700_000_010
    )
}

private func hexadecimal(_ bytes: [UInt8]) -> String {
    let alphabet = Array("0123456789abcdef".utf8)
    var encoded: [UInt8] = []
    encoded.reserveCapacity(bytes.count * 2)
    for byte in bytes {
        encoded.append(alphabet[Int(byte >> 4)])
        encoded.append(alphabet[Int(byte & 0x0f)])
    }
    return String(decoding: encoded, as: UTF8.self)
}

private func replaceUInt64(
    _ value: UInt64,
    at offset: Int,
    in bytes: inout [UInt8]
) {
    for index in 0..<8 {
        let shift = UInt64((7 - index) * 8)
        bytes[offset + index] = UInt8(truncatingIfNeeded: value >> shift)
    }
}

private func assertInvalidCanonical<T>(
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

final class CanonicalRecordTests: XCTestCase {
    func testSHA256KnownVectors() {
        XCTAssertEqual(
            hexadecimal(CanonicalSHA256.digest([]).bytes),
            "e3b0c44298fc1c149afbf4c8996fb924"
                + "27ae41e4649b934ca495991b7852b855"
        )
        XCTAssertEqual(
            hexadecimal(CanonicalSHA256.digest(Array("abc".utf8)).bytes),
            "ba7816bf8f01cfea414140de5dae2223"
                + "b00361a396177a9cb410ff61f20015ad"
        )
    }

    func testFixedByteTypesRejectWrongLengthsAndIsolateCopies() throws {
        assertInvalidCanonical(try CanonicalBytes20(Array(repeating: 1, count: 19)))
        assertInvalidCanonical(try CanonicalBytes20(Array(repeating: 1, count: 21)))
        assertInvalidCanonical(try CanonicalBytes32(Array(repeating: 1, count: 31)))
        assertInvalidCanonical(try CanonicalBytes32(Array(repeating: 1, count: 33)))

        var source20 = Array(repeating: UInt8(7), count: 20)
        let value20 = try CanonicalBytes20(source20)
        source20[0] = 8
        var extracted20 = value20.bytes
        extracted20[1] = 9
        XCTAssertEqual(value20.bytes, Array(repeating: 7, count: 20))

        var source32 = Array(repeating: UInt8(10), count: 32)
        let value32 = try CanonicalBytes32(source32)
        source32[0] = 11
        var extracted32 = value32.bytes
        extracted32[1] = 12
        XCTAssertEqual(value32.bytes, Array(repeating: 10, count: 32))
    }

    func testEnrollmentHasPinnedCanonicalBytesAndDigest() throws {
        let record = try enrollmentFixture()
        let expectedHex =
            "46475637454e523101000101000001f5"
            + "101112131415161718191a1b1c1d1e1f"
            + "202122232425262728292a2b2c2d2e2f"
            + "303132333435363738393a3b3c3d3e3f"
            + "40414243505152535455565758595a5b"
            + "5c5d5e5f606162637071727374757677"
            + "78797a7b7c7d7e7f8081828384858687"
            + "88898a8b8c8d8e8f9091929394959697"
            + "98999a9b9c9d9e9fa0a1a2a3a4a5a6"
            + "a7a8a9aaabacadaeafb0b1b2b3b4b5"
            + "b6b7b8b9babbbcbdbebfc0c1c2c3c4"
            + "c5c6c7c8c9cacbcccdcecfd0d1d2d3"
            + "d4d5d6d7d8d9dadbdcdddedfe0e1e2"
            + "e3e4e5e6e7e8e9eaebecedeeef"
            + "000000006553f100000000006553ff10"

        XCTAssertEqual(record.canonicalBytes().count, 232)
        XCTAssertEqual(record.canonicalBytes().count, EnrollmentRecord.canonicalByteCount)
        XCTAssertEqual(hexadecimal(record.canonicalBytes()), expectedHex)
        XCTAssertEqual(
            hexadecimal(record.canonicalSHA256().bytes),
            "b9e1cffa19b243cbe3808001ea659eba"
                + "297c3366ef8be190b88e5a7408999a5f"
        )
        XCTAssertEqual(
            try EnrollmentRecord.decodeCanonical(record.canonicalBytes()),
            record
        )
    }

    func testEnrollmentRejectsNoncanonicalFramingAndTagsWithOneError() throws {
        let canonical = try enrollmentFixture().canonicalBytes()
        assertInvalidCanonical(
            try EnrollmentRecord.decodeCanonical(Array(canonical.dropLast()))
        )
        assertInvalidCanonical(
            try EnrollmentRecord.decodeCanonical(canonical + [0])
        )

        for (offset, value) in [
            (0, UInt8(0)),
            (8, UInt8(2)),
            (9, UInt8(1)),
            (10, UInt8(2)),
            (11, UInt8(2)),
        ] {
            var corrupted = canonical
            corrupted[offset] = value
            assertInvalidCanonical(
                try EnrollmentRecord.decodeCanonical(corrupted)
            )
        }
    }

    func testEnrollmentRejectsEveryZeroIdentityAndDigest() throws {
        let canonical = try enrollmentFixture().canonicalBytes()
        let requiredNonzeroRanges = [
            12..<16,
            16..<48,
            48..<68,
            68..<88,
            88..<120,
            120..<152,
            152..<184,
            184..<216,
        ]

        for range in requiredNonzeroRanges {
            var corrupted = canonical
            corrupted.replaceSubrange(
                range,
                with: repeatElement(UInt8(0), count: range.count)
            )
            assertInvalidCanonical(
                try EnrollmentRecord.decodeCanonical(corrupted)
            )
        }
    }

    func testEnrollmentRejectsEmptyOrReversedValidityInterval() throws {
        let canonical = try enrollmentFixture().canonicalBytes()

        assertInvalidCanonical(
            try enrollmentFixture(notBefore: 0, expiresAt: 1)
        )
        var zeroStart = canonical
        replaceUInt64(0, at: 216, in: &zeroStart)
        assertInvalidCanonical(
            try EnrollmentRecord.decodeCanonical(zeroStart)
        )

        var equal = canonical
        replaceUInt64(1_700_000_000, at: 216, in: &equal)
        replaceUInt64(1_700_000_000, at: 224, in: &equal)
        assertInvalidCanonical(try EnrollmentRecord.decodeCanonical(equal))

        var reversed = canonical
        replaceUInt64(1_700_000_001, at: 216, in: &reversed)
        replaceUInt64(1_700_000_000, at: 224, in: &reversed)
        assertInvalidCanonical(try EnrollmentRecord.decodeCanonical(reversed))
    }

    func testActivationHasPinnedCanonicalBytesAndDigest() throws {
        let record = try activationFixture()
        let expectedHex =
            "46475637414354310100010100000000"
            + "000000012122232425262728292a2b2c"
            + "2d2e2f303132333435363738393a3b3c"
            + "3d3e3f40101112131415161718191a1b"
            + "1c1d1e1f202122232425262728292a2b"
            + "2c2d2e2f000000000000000000000000"
            + "00000000000000000000000000000000"
            + "00000000000000006553f10a"

        XCTAssertEqual(record.canonicalBytes().count, 124)
        XCTAssertEqual(record.canonicalBytes().count, ActivationRecord.canonicalByteCount)
        XCTAssertEqual(hexadecimal(record.canonicalBytes()), expectedHex)
        XCTAssertEqual(
            hexadecimal(record.canonicalSHA256().bytes),
            "fd645710567ad31897d43d8f34d8312a"
                + "89a2a14f043be42fa2d4e967332366eb"
        )
        XCTAssertEqual(
            try ActivationRecord.decodeCanonical(record.canonicalBytes()),
            record
        )
    }

    func testActivationActionsAndRecordDomainsAreDistinct() throws {
        let enrollment = try enrollmentFixture()
        let actions: [ActivationAction] = [.activate, .revoke, .rollback]
        let records = try actions.map(activationFixture(action:))

        XCTAssertEqual(records.map { $0.canonicalBytes()[11] }, [1, 2, 3])
        for record in records {
            XCTAssertEqual(
                try ActivationRecord.decodeCanonical(record.canonicalBytes()),
                record
            )
        }
        XCTAssertEqual(
            Array(enrollment.canonicalBytes().prefix(8)),
            Array("FGV7ENR1".utf8)
        )
        XCTAssertEqual(
            Array(records[0].canonicalBytes().prefix(8)),
            Array("FGV7ACT1".utf8)
        )
        XCTAssertNotEqual(
            enrollment.canonicalSHA256(),
            records[0].canonicalSHA256()
        )
    }

    func testActivationRejectsNoncanonicalAndZeroRequiredFields() throws {
        let canonical = try activationFixture().canonicalBytes()
        assertInvalidCanonical(
            try ActivationRecord.decodeCanonical(Array(canonical.dropLast()))
        )
        assertInvalidCanonical(
            try ActivationRecord.decodeCanonical(canonical + [0])
        )

        for (offset, value) in [
            (0, UInt8(0)),
            (8, UInt8(2)),
            (9, UInt8(1)),
            (10, UInt8(2)),
            (11, UInt8(0)),
            (11, UInt8(4)),
        ] {
            var corrupted = canonical
            corrupted[offset] = value
            assertInvalidCanonical(
                try ActivationRecord.decodeCanonical(corrupted)
            )
        }

        for range in [12..<20, 20..<52, 52..<84, 116..<124] {
            var corrupted = canonical
            corrupted.replaceSubrange(
                range,
                with: repeatElement(UInt8(0), count: range.count)
            )
            assertInvalidCanonical(
                try ActivationRecord.decodeCanonical(corrupted)
            )
        }

        var zeroPreviousDigest = canonical
        zeroPreviousDigest.replaceSubrange(
            84..<116,
            with: repeatElement(UInt8(0), count: 32)
        )
        XCTAssertNoThrow(
            try ActivationRecord.decodeCanonical(zeroPreviousDigest)
        )
    }
}
