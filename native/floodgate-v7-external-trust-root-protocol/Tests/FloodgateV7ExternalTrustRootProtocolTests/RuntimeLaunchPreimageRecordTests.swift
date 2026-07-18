import XCTest

@testable import FloodgateV7ExternalTrustRootProtocol

private func preimageBytes32(start: UInt8) -> CanonicalBytes32 {
    try! CanonicalBytes32(
        (0..<32).map { start &+ UInt8($0) }
    )
}

private func runtimeInstallPolicyFixture()
    throws -> RuntimeInstallPolicyRecordV1
{
    try RuntimeInstallPolicyRecordV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        recordID: preimageBytes32(start: 0x10),
        nodeWholeFileSHA256: preimageBytes32(start: 0x20),
        nodeCodeDirectorySHA256: preimageBytes32(start: 0x30),
        nodeDesignatedRequirementSHA256:
            preimageBytes32(start: 0x40),
        nodeHeldExecutableIdentitySHA256:
            preimageBytes32(start: 0x50),
        diagnosticEntryBundleWholeFileSHA256:
            preimageBytes32(start: 0x60),
        diagnosticEntryBundleHeldFileIdentitySHA256:
            preimageBytes32(start: 0x70),
        filesystemIdentityPolicySHA256:
            preimageBytes32(start: 0x80),
        aclPolicySHA256: preimageBytes32(start: 0x90)
    )
}

private func assertInvalidPreimage<T>(
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

private func hexadecimalPreimage(_ bytes: [UInt8]) -> String {
    bytes.map { String(format: "%02x", $0) }.joined()
}

final class RuntimeLaunchPreimageRecordTests: XCTestCase {
    func testFixedArgvPinsExactlyNodeAndDiagnosticBundle() throws {
        let record = FixedArgvRecordV1()
        let canonical = record.canonicalBytes()

        XCTAssertEqual(canonical.count, 265)
        XCTAssertEqual(
            canonical.count,
            FixedArgvRecordV1.canonicalByteCount
        )
        XCTAssertEqual(
            hexadecimalPreimage(record.canonicalSHA256().bytes),
            "bf7c65abbc101939ca4b3bccbd52c178"
                + "91e12e6db50af141b6784d753b936b15"
        )
        XCTAssertEqual(
            try FixedArgvRecordV1.decodeCanonical(canonical),
            record
        )

        var decoder = CanonicalDecoder(canonical)
        XCTAssertEqual(
            try decoder.readBytes(count: 8),
            Array("FGV7ARV1".utf8)
        )
        _ = try decoder.readBytes(count: 4)
        XCTAssertEqual(try decoder.readUInt32(), 2)
        let nodeLength = Int(try decoder.readUInt32())
        let node = String(
            decoding: try decoder.readBytes(count: nodeLength),
            as: UTF8.self
        )
        let bundleLength = Int(try decoder.readUInt32())
        let bundle = String(
            decoding: try decoder.readBytes(count: bundleLength),
            as: UTF8.self
        )
        XCTAssertTrue(decoder.isAtEnd)
        XCTAssertEqual(nodeLength, 101)
        XCTAssertEqual(bundleLength, 140)
        XCTAssertEqual(node, FixedArgvRecordV1.nodeExecutablePath)
        XCTAssertEqual(
            bundle,
            FixedArgvRecordV1.diagnosticEntryBundlePath
        )
        for forbidden in [
            "--eval",
            "--require",
            "NODE_OPTIONS",
            "DYLD_INSERT_LIBRARIES",
            "\0",
        ] {
            XCTAssertFalse(node.contains(forbidden))
            XCTAssertFalse(bundle.contains(forbidden))
        }
    }

    func testFixedArgvRejectsEveryByteDriftAndFraming() throws {
        let canonical = FixedArgvRecordV1().canonicalBytes()
        assertInvalidPreimage(
            try FixedArgvRecordV1.decodeCanonical(
                Array(canonical.dropLast())
            )
        )
        assertInvalidPreimage(
            try FixedArgvRecordV1.decodeCanonical(canonical + [0])
        )
        for offset in canonical.indices {
            var corrupted = canonical
            corrupted[offset] ^= 1
            assertInvalidPreimage(
                try FixedArgvRecordV1.decodeCanonical(corrupted)
            )
        }
    }

    func testWorkingDirectoryAndEnvironmentAreExactAndEmpty()
        throws
    {
        let workingDirectory = FixedWorkingDirectoryRecordV1()
        let environment = FixedEnvironmentRecordV1()

        XCTAssertEqual(
            hexadecimalPreimage(
                workingDirectory.canonicalSHA256().bytes
            ),
            "01329f16e0b138c9583da158e6f533df"
                + "c8278d5102e0c2d0e9b2e30704d4c98e"
        )
        XCTAssertEqual(
            hexadecimalPreimage(environment.canonicalSHA256().bytes),
            "b4c85fb22072c92826ccfadce1555b3a"
                + "25515aa45c27224498f0cad35c5a509d"
        )
        XCTAssertEqual(
            try FixedWorkingDirectoryRecordV1.decodeCanonical(
                workingDirectory.canonicalBytes()
            ),
            workingDirectory
        )
        XCTAssertEqual(
            try FixedEnvironmentRecordV1.decodeCanonical(
                environment.canonicalBytes()
            ),
            environment
        )
        XCTAssertEqual(
            FixedWorkingDirectoryRecordV1.workingDirectoryPath,
            "/"
        )
        XCTAssertEqual(
            Array(environment.canonicalBytes().suffix(4)),
            [0, 0, 0, 0]
        )
    }

    func testWorkingDirectoryAndEnvironmentRejectEveryDrift()
        throws
    {
        let workingDirectory =
            FixedWorkingDirectoryRecordV1().canonicalBytes()
        let environment = FixedEnvironmentRecordV1().canonicalBytes()

        for canonical in [workingDirectory, environment] {
            for offset in canonical.indices {
                var corrupted = canonical
                corrupted[offset] ^= 1
                if canonical.count
                    == FixedWorkingDirectoryRecordV1.canonicalByteCount
                {
                    assertInvalidPreimage(
                        try FixedWorkingDirectoryRecordV1
                            .decodeCanonical(corrupted)
                    )
                } else {
                    assertInvalidPreimage(
                        try FixedEnvironmentRecordV1.decodeCanonical(
                            corrupted
                        )
                    )
                }
            }
        }
        assertInvalidPreimage(
            try FixedWorkingDirectoryRecordV1.decodeCanonical(
                Array(workingDirectory.dropLast())
            )
        )
        assertInvalidPreimage(
            try FixedEnvironmentRecordV1.decodeCanonical(
                environment + [0]
            )
        )
    }

    func testRuntimeInstallPolicyPinsElevenPathsAndMetadata()
        throws
    {
        let record = try runtimeInstallPolicyFixture()
        let canonical = record.canonicalBytes()

        XCTAssertEqual(canonical.count, 1_307)
        XCTAssertEqual(
            canonical.count,
            RuntimeInstallPolicyRecordV1.canonicalByteCount
        )
        XCTAssertEqual(
            hexadecimalPreimage(record.canonicalSHA256().bytes),
            "9582e2e987ece65e3d9dc4d6291ddeae"
                + "055d97e06033d9e45590c0518e0c9803"
        )
        XCTAssertEqual(
            try RuntimeInstallPolicyRecordV1.decodeCanonical(
                canonical
            ),
            record
        )

        var decoder = CanonicalDecoder(canonical)
        XCTAssertEqual(
            try decoder.readBytes(count: 8),
            Array("FGV7RIP1".utf8)
        )
        _ = try decoder.readBytes(count: 4)
        XCTAssertEqual(try decoder.readByte(), 11)
        XCTAssertEqual(try decoder.readByte(), 1)
        XCTAssertEqual(try decoder.readByte(), 1)
        XCTAssertEqual(try decoder.readByte(), 1)
        XCTAssertEqual(try decoder.readUInt32(), 0)
        _ = try decoder.readBytes(count: 9 * 32)

        let expected: [(String, UInt8, UInt32, UInt32, UInt32, UInt8, UInt32)] = [
            ("/", 1, 0, 0, 0o755, 1, 0),
            ("/Library", 1, 0, 0, 0o755, 1, 0),
            (
                "/Library/Application Support",
                1, 0, 80, 0o755, 1, 0
            ),
            (
                "/Library/Application Support"
                    + "/com.gomyway1216.shogi-floodgate-v7",
                1, 0, 0, 0o755, 1, 0
            ),
            (
                "/Library/Application Support"
                    + "/com.gomyway1216.shogi-floodgate-v7"
                    + "/ExternalTrustRoot",
                1, 0, 0, 0o755, 1, 0
            ),
            (
                "/Library/Application Support"
                    + "/com.gomyway1216.shogi-floodgate-v7"
                    + "/ExternalTrustRoot/v1",
                1, 0, 0, 0o755, 1, 0
            ),
            (
                "/Library/Application Support"
                    + "/com.gomyway1216.shogi-floodgate-v7"
                    + "/ExternalTrustRoot/v1/runtime",
                1, 0, 0, 0o755, 1, 0
            ),
            (
                "/Library/Application Support"
                    + "/com.gomyway1216.shogi-floodgate-v7"
                    + "/ExternalTrustRoot/v1/runtime/bin",
                1, 0, 0, 0o755, 1, 0
            ),
            (
                RuntimeInstallPolicyRecordV1.nodeExecutablePath,
                2, 0, 0, 0o555, 2, 1
            ),
            (
                "/Library/Application Support"
                    + "/com.gomyway1216.shogi-floodgate-v7"
                    + "/ExternalTrustRoot/v1/runtime/lib",
                1, 0, 0, 0o755, 1, 0
            ),
            (
                RuntimeInstallPolicyRecordV1
                    .diagnosticEntryBundlePath,
                2, 0, 0, 0o444, 2, 1
            ),
        ]
        for policy in expected {
            let length = Int(try decoder.readByte())
            XCTAssertEqual(length, Array(policy.0.utf8).count)
            XCTAssertEqual(
                String(
                    decoding: try decoder.readBytes(count: length),
                    as: UTF8.self
                ),
                policy.0
            )
            XCTAssertEqual(try decoder.readByte(), policy.1)
            XCTAssertEqual(try decoder.readUInt32(), policy.2)
            XCTAssertEqual(try decoder.readUInt32(), policy.3)
            XCTAssertEqual(try decoder.readUInt32(), policy.4)
            XCTAssertEqual(try decoder.readByte(), policy.5)
            XCTAssertEqual(try decoder.readUInt32(), policy.6)
        }
        XCTAssertTrue(decoder.isAtEnd)
    }

    func testRuntimeInstallPolicyRejectsFramingPolicyAndPathDrift()
        throws
    {
        let canonical = try runtimeInstallPolicyFixture()
            .canonicalBytes()
        assertInvalidPreimage(
            try RuntimeInstallPolicyRecordV1.decodeCanonical(
                Array(canonical.dropLast())
            )
        )
        assertInvalidPreimage(
            try RuntimeInstallPolicyRecordV1.decodeCanonical(
                canonical + [0]
            )
        )

        for offset in Array(0..<20) + Array(308..<canonical.count) {
            var corrupted = canonical
            corrupted[offset] ^= 1
            assertInvalidPreimage(
                try RuntimeInstallPolicyRecordV1.decodeCanonical(
                    corrupted
                )
            )
        }
    }

    func testRuntimeInstallPolicyRejectsZeroAndAliasedDigests()
        throws
    {
        let canonical = try runtimeInstallPolicyFixture()
            .canonicalBytes()
        for digestIndex in 0..<9 {
            var corrupted = canonical
            let range =
                (20 + digestIndex * 32)..<(20 + (digestIndex + 1) * 32)
            corrupted.replaceSubrange(
                range,
                with: repeatElement(UInt8(0), count: 32)
            )
            assertInvalidPreimage(
                try RuntimeInstallPolicyRecordV1.decodeCanonical(
                    corrupted
                )
            )
        }

        var aliased = canonical
        aliased.replaceSubrange(52..<84, with: canonical[20..<52])
        assertInvalidPreimage(
            try RuntimeInstallPolicyRecordV1.decodeCanonical(aliased)
        )

        var changedIdentity = canonical
        changedIdentity[52] ^= 1
        XCTAssertNoThrow(
            try RuntimeInstallPolicyRecordV1.decodeCanonical(
                changedIdentity
            )
        )
    }
}
