import XCTest

@testable import FloodgateV7ExternalTrustRootProtocol

private func preimageBytes32(start: UInt8) -> CanonicalBytes32 {
    try! CanonicalBytes32(
        (0..<32).map { start &+ UInt8($0) }
    )
}

private func preimageBytes20(start: UInt8) -> CanonicalBytes20 {
    try! CanonicalBytes20(
        (0..<20).map { start &+ UInt8($0) }
    )
}

private func runtimeInstallPolicyFixture(
    recordID: CanonicalBytes32 = preimageBytes32(start: 0x10)
)
    throws -> RuntimeInstallPolicyRecordV1
{
    try RuntimeInstallPolicyRecordV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        recordID: recordID,
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

private func runtimeLaunchPolicyFixture(
    installPolicy: RuntimeInstallPolicyRecordV1,
    fixedArgvSHA256: CanonicalBytes32? = nil,
    fixedWorkingDirectorySHA256: CanonicalBytes32? = nil,
    fixedEnvironmentSHA256: CanonicalBytes32? = nil,
    runtimeInstallPolicySHA256: CanonicalBytes32? = nil,
    diagnosticEntryBundleSHA256: CanonicalBytes32? = nil
) throws -> RuntimeLaunchPolicyRecordV1 {
    try RuntimeLaunchPolicyRecordV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        recordID: preimageBytes32(start: 0xa0),
        fixedArgvSHA256:
            fixedArgvSHA256
            ?? FixedArgvRecordV1().canonicalSHA256(),
        fixedWorkingDirectorySHA256:
            fixedWorkingDirectorySHA256
            ?? FixedWorkingDirectoryRecordV1().canonicalSHA256(),
        fixedEnvironmentSHA256:
            fixedEnvironmentSHA256
            ?? FixedEnvironmentRecordV1().canonicalSHA256(),
        runtimeInstallPolicySHA256:
            runtimeInstallPolicySHA256
            ?? installPolicy.canonicalSHA256(),
        diagnosticEntryBundleSHA256:
            diagnosticEntryBundleSHA256
            ?? installPolicy.diagnosticEntryBundleWholeFileSHA256
    )
}

private func sourceManifestFixture(
    runtimeLaunchPolicy: RuntimeLaunchPolicyRecordV1,
    installPolicy: RuntimeInstallPolicyRecordV1,
    repositorySourceClosureSHA256: CanonicalBytes32 =
        preimageBytes32(start: 0xb0),
    diagnosticBundleSHA256: CanonicalBytes32? = nil,
    pinnedNodeRuntimeSHA256: CanonicalBytes32? = nil,
    pinnedNodeCodeDirectorySHA256: CanonicalBytes32? = nil,
    pinnedNodeDesignatedRequirementSHA256: CanonicalBytes32? = nil,
    pinnedNodeHeldExecutableIdentitySHA256: CanonicalBytes32? = nil
) throws -> RepositorySourceManifestV1 {
    try RepositorySourceManifestV1(
        audience: .productionRecovery,
        purpose: .inspectStalePrefix100,
        manifestID: preimageBytes32(start: 0xc0),
        approvedCommit: preimageBytes20(start: 0x10),
        approvedTree: preimageBytes20(start: 0x30),
        repositorySourceClosureSHA256:
            repositorySourceClosureSHA256,
        diagnosticBundleSHA256:
            diagnosticBundleSHA256
            ?? installPolicy.diagnosticEntryBundleWholeFileSHA256,
        diagnosticLauncherJXASHA256:
            preimageBytes32(start: 0xd0),
        pinnedNodeRuntimeSHA256:
            pinnedNodeRuntimeSHA256
            ?? installPolicy.nodeWholeFileSHA256,
        runtimeLaunchPolicySHA256:
            runtimeLaunchPolicy.canonicalSHA256(),
        supervisorArtifactSHA256:
            preimageBytes32(start: 0xe0),
        verifierArtifactSHA256:
            preimageBytes32(start: 0xf0),
        supervisorCodeDirectorySHA256:
            preimageBytes32(start: 0x01),
        supervisorDesignatedRequirementSHA256:
            preimageBytes32(start: 0x02),
        supervisorHeldExecutableIdentitySHA256:
            preimageBytes32(start: 0x03),
        verifierCodeDirectorySHA256:
            preimageBytes32(start: 0x04),
        verifierDesignatedRequirementSHA256:
            preimageBytes32(start: 0x05),
        verifierHeldExecutableIdentitySHA256:
            preimageBytes32(start: 0x06),
        pinnedNodeCodeDirectorySHA256:
            pinnedNodeCodeDirectorySHA256
            ?? installPolicy.nodeCodeDirectorySHA256,
        pinnedNodeDesignatedRequirementSHA256:
            pinnedNodeDesignatedRequirementSHA256
            ?? installPolicy.nodeDesignatedRequirementSHA256,
        pinnedNodeHeldExecutableIdentitySHA256:
            pinnedNodeHeldExecutableIdentitySHA256
            ?? installPolicy.nodeHeldExecutableIdentitySHA256,
        supervisorAttestationKeyID:
            preimageBytes32(start: 0x07),
        verifierAttestationKeyID:
            preimageBytes32(start: 0x08),
        gitDirectoryPolicySHA256:
            preimageBytes32(start: 0x09),
        repositoryPathPolicySHA256:
            preimageBytes32(start: 0x0a),
        artifactClosureRecordSHA256:
            preimageBytes32(start: 0x0b),
        installPolicyRecordSHA256:
            preimageBytes32(start: 0x0c)
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

    func testPreimageClosureRejectsEveryPolicyDigestSubstitution()
        throws
    {
        let fixedArgv = FixedArgvRecordV1()
        let fixedWorkingDirectory =
            FixedWorkingDirectoryRecordV1()
        let fixedEnvironment = FixedEnvironmentRecordV1()
        let installPolicy = try runtimeInstallPolicyFixture()
        let validPolicy = try runtimeLaunchPolicyFixture(
            installPolicy: installPolicy
        )
        let validManifest = try sourceManifestFixture(
            runtimeLaunchPolicy: validPolicy,
            installPolicy: installPolicy
        )
        let validClosure = try RuntimeLaunchPreimageClosureV1(
            fixedArgv: fixedArgv,
            fixedWorkingDirectory: fixedWorkingDirectory,
            fixedEnvironment: fixedEnvironment,
            runtimeInstallPolicy: installPolicy,
            runtimeLaunchPolicy: validPolicy,
            sourceManifest: validManifest
        )
        XCTAssertNoThrow(
            try validClosure.validate(sourceManifest: validManifest)
        )

        let wrongArgv = preimageBytes32(start: 0xf1)
        let wrongWorkingDirectory = preimageBytes32(start: 0xf2)
        let wrongEnvironment = preimageBytes32(start: 0xf3)
        let wrongInstallPolicy = preimageBytes32(start: 0xf4)
        let wrongBundle = preimageBytes32(start: 0xf5)
        let substitutedPolicies = try [
            runtimeLaunchPolicyFixture(
                installPolicy: installPolicy,
                fixedArgvSHA256: wrongArgv
            ),
            runtimeLaunchPolicyFixture(
                installPolicy: installPolicy,
                fixedWorkingDirectorySHA256:
                    wrongWorkingDirectory
            ),
            runtimeLaunchPolicyFixture(
                installPolicy: installPolicy,
                fixedEnvironmentSHA256: wrongEnvironment
            ),
            runtimeLaunchPolicyFixture(
                installPolicy: installPolicy,
                runtimeInstallPolicySHA256: wrongInstallPolicy
            ),
            runtimeLaunchPolicyFixture(
                installPolicy: installPolicy,
                diagnosticEntryBundleSHA256: wrongBundle
            ),
        ]

        for substitutedPolicy in substitutedPolicies {
            let manifest = try sourceManifestFixture(
                runtimeLaunchPolicy: substitutedPolicy,
                installPolicy: installPolicy,
                diagnosticBundleSHA256:
                    substitutedPolicy.diagnosticEntryBundleSHA256
            )
            assertInvalidPreimage(
                try RuntimeLaunchPreimageClosureV1(
                    fixedArgv: fixedArgv,
                    fixedWorkingDirectory: fixedWorkingDirectory,
                    fixedEnvironment: fixedEnvironment,
                    runtimeInstallPolicy: installPolicy,
                    runtimeLaunchPolicy: substitutedPolicy,
                    sourceManifest: manifest
                )
            )
        }
    }

    func testPreimageClosureRejectsInstallAndManifestDrift()
        throws
    {
        let fixedArgv = FixedArgvRecordV1()
        let fixedWorkingDirectory =
            FixedWorkingDirectoryRecordV1()
        let fixedEnvironment = FixedEnvironmentRecordV1()
        let installPolicy = try runtimeInstallPolicyFixture()
        let runtimeLaunchPolicy = try runtimeLaunchPolicyFixture(
            installPolicy: installPolicy
        )
        let manifest = try sourceManifestFixture(
            runtimeLaunchPolicy: runtimeLaunchPolicy,
            installPolicy: installPolicy
        )
        let closure = try RuntimeLaunchPreimageClosureV1(
            fixedArgv: fixedArgv,
            fixedWorkingDirectory: fixedWorkingDirectory,
            fixedEnvironment: fixedEnvironment,
            runtimeInstallPolicy: installPolicy,
            runtimeLaunchPolicy: runtimeLaunchPolicy,
            sourceManifest: manifest
        )

        let substitutedInstallPolicy =
            try runtimeInstallPolicyFixture(
                recordID: preimageBytes32(start: 0x11)
            )
        assertInvalidPreimage(
            try RuntimeLaunchPreimageClosureV1(
                fixedArgv: fixedArgv,
                fixedWorkingDirectory: fixedWorkingDirectory,
                fixedEnvironment: fixedEnvironment,
                runtimeInstallPolicy: substitutedInstallPolicy,
                runtimeLaunchPolicy: runtimeLaunchPolicy,
                sourceManifest: manifest
            )
        )

        let manifestIdentityDrifts = try [
            sourceManifestFixture(
                runtimeLaunchPolicy: runtimeLaunchPolicy,
                installPolicy: installPolicy,
                pinnedNodeRuntimeSHA256:
                    preimageBytes32(start: 0x71)
            ),
            sourceManifestFixture(
                runtimeLaunchPolicy: runtimeLaunchPolicy,
                installPolicy: installPolicy,
                pinnedNodeCodeDirectorySHA256:
                    preimageBytes32(start: 0x72)
            ),
            sourceManifestFixture(
                runtimeLaunchPolicy: runtimeLaunchPolicy,
                installPolicy: installPolicy,
                pinnedNodeDesignatedRequirementSHA256:
                    preimageBytes32(start: 0x73)
            ),
            sourceManifestFixture(
                runtimeLaunchPolicy: runtimeLaunchPolicy,
                installPolicy: installPolicy,
                pinnedNodeHeldExecutableIdentitySHA256:
                    preimageBytes32(start: 0x74)
            ),
        ]
        for driftedManifest in manifestIdentityDrifts {
            assertInvalidPreimage(
                try RuntimeLaunchPreimageClosureV1(
                    fixedArgv: fixedArgv,
                    fixedWorkingDirectory: fixedWorkingDirectory,
                    fixedEnvironment: fixedEnvironment,
                    runtimeInstallPolicy: installPolicy,
                    runtimeLaunchPolicy: runtimeLaunchPolicy,
                    sourceManifest: driftedManifest
                )
            )
        }

        let differentManifest = try sourceManifestFixture(
            runtimeLaunchPolicy: runtimeLaunchPolicy,
            installPolicy: installPolicy,
            repositorySourceClosureSHA256:
                preimageBytes32(start: 0xb1)
        )
        assertInvalidPreimage(
            try closure.validate(sourceManifest: differentManifest)
        )
    }
}
