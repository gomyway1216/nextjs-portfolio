import XCTest

@testable import FloodgateV7ExternalTrustRootProtocol

private func policyBytes20(start: UInt8) -> CanonicalBytes20 {
    try! CanonicalBytes20(
        (0..<20).map { start &+ UInt8($0) }
    )
}

private func policyBytes32(start: UInt8) -> CanonicalBytes32 {
    try! CanonicalBytes32(
        (0..<32).map { start &+ UInt8($0) }
    )
}

private func policyHexadecimal(_ bytes: [UInt8]) -> String {
    let alphabet = Array("0123456789abcdef".utf8)
    var encoded: [UInt8] = []
    encoded.reserveCapacity(bytes.count * 2)
    for byte in bytes {
        encoded.append(alphabet[Int(byte >> 4)])
        encoded.append(alphabet[Int(byte & 0x0f)])
    }
    return String(decoding: encoded, as: UTF8.self)
}

private func assertInvalidPolicy<T>(
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

private func releaseToolchainFixture(
    hostMajor: UInt8 = 14,
    hostMinor: UInt8 = 4,
    hostPatch: UInt8 = 1
) throws -> ReleaseToolchainRecordV1 {
    try ReleaseToolchainRecordV1(
        audience: .productionRecovery,
        purpose: .externalTrustRootPair,
        buildHostVersionMajor: hostMajor,
        buildHostVersionMinor: hostMinor,
        buildHostVersionPatch: hostPatch,
        recordID: policyBytes32(start: 0x10),
        finalReleaseCatalogEvidenceSHA256: policyBytes32(start: 0x20),
        xcodeArchiveSHA256: policyBytes32(start: 0x30),
        xcodeDesignatedRequirementSHA256: policyBytes32(start: 0x40),
        xcodeCDHash: policyBytes20(start: 0x50),
        developerDirectorySHA256: policyBytes32(start: 0x60),
        toolManifestSHA256: policyBytes32(start: 0x70),
        xcodebuildVersionOutputSHA256: policyBytes32(start: 0x80),
        swiftVersionOutputSHA256: policyBytes32(start: 0x90),
        clangVersionOutputSHA256: policyBytes32(start: 0xa0),
        ldVersionOutputSHA256: policyBytes32(start: 0xa8),
        sdkManifestSHA256: policyBytes32(start: 0xb0),
        hostIdentitySHA256: policyBytes32(start: 0xc0),
        targetTripleSHA256: policyBytes32(start: 0xd0),
        languageModeSHA256: policyBytes32(start: 0xe0),
        buildArgumentsSHA256: policyBytes32(start: 0xf0),
        buildEnvironmentSHA256: policyBytes32(start: 0x11),
        sourceClosureSHA256: policyBytes32(start: 0x21),
        buildRecipeSHA256: policyBytes32(start: 0x31),
        preBuildIdentitySHA256: policyBytes32(start: 0x41),
        postBuildIdentitySHA256: policyBytes32(start: 0x41),
        firstUnsignedBuildSHA256: policyBytes32(start: 0x51),
        secondUnsignedBuildSHA256: policyBytes32(start: 0x51)
    )
}

private func artifactClosureFixture() throws -> ArtifactClosureRecordV1 {
    try ArtifactClosureRecordV1(
        audience: .productionRecovery,
        purpose: .externalTrustRootPair,
        recordID: policyBytes32(start: 0x10),
        releaseToolchainRecordSHA256: policyBytes32(start: 0x20),
        supervisorWholeFileSHA256: policyBytes32(start: 0x30),
        supervisorSemanticMachOSHA256: policyBytes32(start: 0x40),
        supervisorExecutableIdentifierSHA256: policyBytes32(start: 0x50),
        supervisorDesignatedRequirementSHA256: policyBytes32(start: 0x60),
        supervisorCodeDirectorySHA256: policyBytes32(start: 0x70),
        supervisorCDHash: policyBytes20(start: 0x80),
        supervisorDependencyClosureSHA256: policyBytes32(start: 0x90),
        supervisorEntitlementPolicySHA256: policyBytes32(start: 0xa0),
        verifierWholeFileSHA256: policyBytes32(start: 0xb0),
        verifierSemanticMachOSHA256: policyBytes32(start: 0xc0),
        verifierExecutableIdentifierSHA256: policyBytes32(start: 0xd0),
        verifierDesignatedRequirementSHA256: policyBytes32(start: 0xe0),
        verifierCodeDirectorySHA256: policyBytes32(start: 0xf0),
        verifierCDHash: policyBytes20(start: 0x11),
        verifierDependencyClosureSHA256: policyBytes32(start: 0x90),
        verifierEntitlementPolicySHA256: policyBytes32(start: 0xa0),
        loadCommandPolicySHA256: policyBytes32(start: 0x21),
        hardenedRuntimePolicySHA256: policyBytes32(start: 0x31),
        libraryValidationPolicySHA256: policyBytes32(start: 0x41),
        flatPackageWholeFileSHA256: policyBytes32(start: 0x51),
        packagePayloadClosureSHA256: policyBytes32(start: 0x61),
        installerSignatureIdentitySHA256: policyBytes32(start: 0x71),
        notarizationSubmissionSHA256: policyBytes32(start: 0x81),
        notarizationTicketSHA256: policyBytes32(start: 0x91),
        stapledTicketSHA256: policyBytes32(start: 0xa1),
        gatekeeperAssessmentSHA256: policyBytes32(start: 0xb1)
    )
}

private func installPolicyFixture(
    artifactClosure: ArtifactClosureRecordV1? = nil
) throws -> InstallPolicyRecordV1 {
    let artifact: ArtifactClosureRecordV1
    if let artifactClosure {
        artifact = artifactClosure
    } else {
        artifact = try artifactClosureFixture()
    }
    return try InstallPolicyRecordV1(
        audience: .productionRecovery,
        purpose: .externalTrustRootPair,
        recordID: policyBytes32(start: 0x10),
        artifactClosureRecordSHA256: artifact.canonicalSHA256(),
        supervisorWholeFileSHA256: artifact.supervisorWholeFileSHA256,
        verifierWholeFileSHA256: artifact.verifierWholeFileSHA256,
        filesystemIdentityPolicySHA256: policyBytes32(start: 0x50),
        aclPolicySHA256: policyBytes32(start: 0x70)
    )
}

private let exactInstallPaths = [
    "/",
    "/Library",
    "/Library/Application Support",
    "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7",
    "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7"
        + "/ExternalTrustRoot",
    "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7"
        + "/ExternalTrustRoot/v1",
    "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7"
        + "/ExternalTrustRoot/v1/bin",
    InstallPolicyRecordV1.supervisorInstallPath,
    InstallPolicyRecordV1.verifierInstallPath,
]

final class ReleaseArtifactInstallPolicyRecordTests: XCTestCase {
    func testReleaseToolchainHasPinnedCanonicalPolicyAndDigest() throws {
        let record = try releaseToolchainFixture()
        let canonical = record.canonicalBytes()

        XCTAssertEqual(canonical.count, 798)
        XCTAssertEqual(
            canonical.count,
            ReleaseToolchainRecordV1.canonicalByteCount
        )
        XCTAssertEqual(
            Array(canonical.prefix(8)),
            Array("FGV7RTL1".utf8)
        )
        XCTAssertEqual(
            Array(canonical[13..<16]),
            [15, 3, 0]
        )
        XCTAssertEqual(canonical[16], 7)
        XCTAssertEqual(
            Array(canonical[17..<24]),
            Array("15E204a".utf8)
        )
        XCTAssertEqual(Array(canonical[32..<35]), [14, 4, 1])
        XCTAssertEqual(Array(canonical[35..<41]), [14, 0, 0, 15, 0, 0])
        XCTAssertEqual(Array(canonical[45..<53]), Array(repeating: 0, count: 8))
        XCTAssertEqual(Array(canonical[53..<57]), [0, 0, 1, 0xed])
        XCTAssertEqual(canonical[57], 1)
        XCTAssertEqual(Array(canonical[58..<74]), Array(repeating: 0, count: 16))
        XCTAssertEqual(
            policyHexadecimal(record.canonicalSHA256().bytes),
            "ebc2f03a02894cfcbfc9b8f206efe0dc"
                + "470b951b506b1ed4616fbd0f9575d38a"
        )
        XCTAssertEqual(
            try ReleaseToolchainRecordV1.decodeCanonical(canonical),
            record
        )
    }

    func testReleaseToolchainRejectsFramingAndEveryFixedPolicyDrift()
        throws
    {
        let canonical = try releaseToolchainFixture().canonicalBytes()
        assertInvalidPolicy(
            try ReleaseToolchainRecordV1.decodeCanonical(
                Array(canonical.dropLast())
            )
        )
        assertInvalidPolicy(
            try ReleaseToolchainRecordV1.decodeCanonical(canonical + [0])
        )

        for offset in [
            0, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 24,
            35, 38, 41, 42, 43, 44, 48, 52, 56, 57,
            61, 65, 69, 73,
        ] {
            var corrupted = canonical
            corrupted[offset] &+= 1
            assertInvalidPolicy(
                try ReleaseToolchainRecordV1.decodeCanonical(corrupted)
            )
        }
    }

    func testReleaseToolchainRejectsUnsupportedHostZeroAndDrift()
        throws
    {
        assertInvalidPolicy(
            try releaseToolchainFixture(
                hostMajor: 15,
                hostMinor: 1,
                hostPatch: 0
            )
        )
        XCTAssertNoThrow(
            try releaseToolchainFixture(
                hostMajor: 14,
                hostMinor: 0,
                hostPatch: 0
            )
        )
        assertInvalidPolicy(
            try releaseToolchainFixture(
                hostMajor: 13,
                hostMinor: 255,
                hostPatch: 255
            )
        )
        assertInvalidPolicy(
            try releaseToolchainFixture(
                hostMajor: 15,
                hostMinor: 0,
                hostPatch: 0
            )
        )

        let canonical = try releaseToolchainFixture().canonicalBytes()
        var unsupportedHost = canonical
        unsupportedHost[32] = 15
        unsupportedHost[33] = 1
        unsupportedHost[34] = 0
        assertInvalidPolicy(
            try ReleaseToolchainRecordV1.decodeCanonical(unsupportedHost)
        )

        let requiredNonzeroRanges: [Range<Int>] = [
            74..<106, 106..<138, 138..<170, 170..<202, 202..<222,
            222..<254, 254..<286, 286..<318, 318..<350, 350..<382,
            382..<414, 414..<446, 446..<478, 478..<510, 510..<542,
            542..<574, 574..<606, 606..<638, 638..<670, 670..<702,
            702..<734, 734..<766, 766..<798,
        ]
        for range in requiredNonzeroRanges {
            var corrupted = canonical
            corrupted.replaceSubrange(
                range,
                with: repeatElement(UInt8(0), count: range.count)
            )
            assertInvalidPolicy(
                try ReleaseToolchainRecordV1.decodeCanonical(corrupted)
            )
        }

        var changedDuringBuild = canonical
        changedDuringBuild[702] &+= 1
        assertInvalidPolicy(
            try ReleaseToolchainRecordV1.decodeCanonical(
                changedDuringBuild
            )
        )
        var nonreproducible = canonical
        nonreproducible[766] &+= 1
        assertInvalidPolicy(
            try ReleaseToolchainRecordV1.decodeCanonical(nonreproducible)
        )
    }

    func testArtifactClosureHasPinnedTwoBinaryAndPackagePolicy()
        throws
    {
        let record = try artifactClosureFixture()
        let canonical = record.canonicalBytes()

        XCTAssertEqual(canonical.count, 993)
        XCTAssertEqual(
            canonical.count,
            ArtifactClosureRecordV1.canonicalByteCount
        )
        XCTAssertEqual(
            Array(canonical.prefix(8)),
            Array("FGV7ACL1".utf8)
        )
        XCTAssertEqual(Array(canonical[12..<16]), [2, 1, 1, 1])
        XCTAssertEqual(Array(canonical[16..<22]), [13, 0, 0, 14, 4, 0])
        XCTAssertEqual(Array(canonical[22..<33]), Array(repeating: 1, count: 4)
            + [1, 2]
            + Array(repeating: 1, count: 5))
        XCTAssertEqual(
            Array(canonical[101..<121]),
            [0, 0, 0, 2] + Array(repeating: 0, count: 16)
        )
        XCTAssertEqual(
            record.supervisorDependencyClosureSHA256,
            record.verifierDependencyClosureSHA256
        )
        XCTAssertEqual(
            record.supervisorEntitlementPolicySHA256,
            record.verifierEntitlementPolicySHA256
        )
        XCTAssertEqual(
            policyHexadecimal(record.canonicalSHA256().bytes),
            "1f8afdd61b3ba4c61dd8b8854f9a9dd1"
                + "084c61b4429dae19cb5b3ffd03934b8b"
        )
        XCTAssertEqual(
            try ArtifactClosureRecordV1.decodeCanonical(canonical),
            record
        )

        var distinctPolicyClosures = canonical
        distinctPolicyClosures[609] &+= 1
        distinctPolicyClosures[641] &+= 1
        XCTAssertNoThrow(
            try ArtifactClosureRecordV1.decodeCanonical(
                distinctPolicyClosures
            )
        )
    }

    func testArtifactClosureRejectsFramingMachOSigningAndForbiddenCounts()
        throws
    {
        let canonical = try artifactClosureFixture().canonicalBytes()
        assertInvalidPolicy(
            try ArtifactClosureRecordV1.decodeCanonical(
                Array(canonical.dropLast())
            )
        )
        assertInvalidPolicy(
            try ArtifactClosureRecordV1.decodeCanonical(canonical + [0])
        )

        for offset in Array(0...32) {
            var corrupted = canonical
            corrupted[offset] &+= 1
            assertInvalidPolicy(
                try ArtifactClosureRecordV1.decodeCanonical(corrupted)
            )
        }
        for counterIndex in 0..<17 {
            var corrupted = canonical
            corrupted[33 + counterIndex * 4 + 3] = 1
            assertInvalidPolicy(
                try ArtifactClosureRecordV1.decodeCanonical(corrupted)
            )
        }
        for payloadCounterIndex in 0..<5 {
            var corrupted = canonical
            corrupted[101 + payloadCounterIndex * 4 + 3] &+= 1
            assertInvalidPolicy(
                try ArtifactClosureRecordV1.decodeCanonical(corrupted)
            )
        }
    }

    func testArtifactClosureRejectsZeroAndEqualBinaryIdentities() throws {
        let canonical = try artifactClosureFixture().canonicalBytes()
        let requiredNonzeroRanges: [Range<Int>] = [
            121..<153, 153..<185,
            185..<217, 217..<249, 249..<281, 281..<313, 313..<345,
            345..<365, 365..<397, 397..<429,
            429..<461, 461..<493, 493..<525, 525..<557, 557..<589,
            589..<609, 609..<641, 641..<673,
            673..<705, 705..<737, 737..<769,
            769..<801, 801..<833, 833..<865, 865..<897, 897..<929,
            929..<961, 961..<993,
        ]
        for range in requiredNonzeroRanges {
            var corrupted = canonical
            corrupted.replaceSubrange(
                range,
                with: repeatElement(UInt8(0), count: range.count)
            )
            assertInvalidPolicy(
                try ArtifactClosureRecordV1.decodeCanonical(corrupted)
            )
        }

        for (supervisor, verifier, count) in [
            (185, 429, 32),
            (217, 461, 32),
            (249, 493, 32),
            (281, 525, 32),
            (313, 557, 32),
            (345, 589, 20),
        ] {
            var equalIdentity = canonical
            equalIdentity.replaceSubrange(
                verifier..<(verifier + count),
                with: canonical[supervisor..<(supervisor + count)]
            )
            assertInvalidPolicy(
                try ArtifactClosureRecordV1.decodeCanonical(equalIdentity)
            )
        }
    }

    func testInstallPolicyPinsEveryPathAndMetadata() throws {
        let artifact = try artifactClosureFixture()
        let record = try installPolicyFixture(artifactClosure: artifact)
        let canonical = record.canonicalBytes()

        XCTAssertEqual(canonical.count, 980)
        XCTAssertEqual(
            canonical.count,
            InstallPolicyRecordV1.canonicalByteCount
        )
        XCTAssertEqual(
            Array(canonical.prefix(8)),
            Array("FGV7INP1".utf8)
        )
        XCTAssertEqual(Array(canonical[12..<16]), [9, 1, 1, 1])
        XCTAssertEqual(Array(canonical[16..<20]), [0, 0, 0, 0])
        XCTAssertEqual(
            Array(canonical[84..<116]),
            artifact.supervisorWholeFileSHA256.bytes
        )
        XCTAssertEqual(
            Array(canonical[116..<148]),
            artifact.verifierWholeFileSHA256.bytes
        )

        var cursor = 212
        for (index, path) in exactInstallPaths.enumerated() {
            let pathUTF8 = Array(path.utf8)
            XCTAssertEqual(canonical[cursor], UInt8(pathUTF8.count))
            XCTAssertEqual(
                Array(canonical[(cursor + 1)..<(cursor + 1 + pathUTF8.count)]),
                pathUTF8
            )
            let metadata = cursor + 1 + pathUTF8.count
            let expectedGroup: UInt8 = index == 2 ? 80 : 0
            if index < 7 {
                XCTAssertEqual(canonical[metadata], 1)
                XCTAssertEqual(canonical[metadata + 8], expectedGroup)
                XCTAssertEqual(
                    Array(canonical[(metadata + 9)..<(metadata + 13)]),
                    [0, 0, 1, 0xed]
                )
                XCTAssertEqual(canonical[metadata + 13], 1)
                XCTAssertEqual(
                    Array(canonical[(metadata + 14)..<(metadata + 18)]),
                    [0, 0, 0, 0]
                )
            } else {
                XCTAssertEqual(canonical[metadata], 2)
                XCTAssertEqual(canonical[metadata + 8], 0)
                XCTAssertEqual(
                    Array(canonical[(metadata + 9)..<(metadata + 13)]),
                    [0, 0, 1, 0x6d]
                )
                XCTAssertEqual(canonical[metadata + 13], 2)
                XCTAssertEqual(
                    Array(canonical[(metadata + 14)..<(metadata + 18)]),
                    [0, 0, 0, 1]
                )
            }
            cursor += pathUTF8.count + 19
        }
        XCTAssertEqual(cursor, canonical.count)
        XCTAssertEqual(
            policyHexadecimal(record.canonicalSHA256().bytes),
            "96caea25356a637228a233a15c7dcba1"
                + "e3e8683f4866b1cd1408ef405ee60827"
        )
        XCTAssertEqual(
            try InstallPolicyRecordV1.decodeCanonical(canonical),
            record
        )
        XCTAssertNoThrow(try record.validateArtifactClosure(artifact))
    }

    func testInstallPolicyRejectsFramingGlobalPolicyAndZeroDigests()
        throws
    {
        let canonical = try installPolicyFixture().canonicalBytes()
        assertInvalidPolicy(
            try InstallPolicyRecordV1.decodeCanonical(
                Array(canonical.dropLast())
            )
        )
        assertInvalidPolicy(
            try InstallPolicyRecordV1.decodeCanonical(canonical + [0])
        )

        for offset in [0, 8, 9, 10, 11, 12, 13, 14, 15, 19] {
            var corrupted = canonical
            corrupted[offset] &+= 1
            assertInvalidPolicy(
                try InstallPolicyRecordV1.decodeCanonical(corrupted)
            )
        }
        for range in [
            20..<52, 52..<84, 84..<116, 116..<148,
            148..<180, 180..<212,
        ] {
            var corrupted = canonical
            corrupted.replaceSubrange(
                range,
                with: repeatElement(UInt8(0), count: range.count)
            )
            assertInvalidPolicy(
                try InstallPolicyRecordV1.decodeCanonical(corrupted)
            )
        }

        var equalLeaves = canonical
        equalLeaves.replaceSubrange(116..<148, with: canonical[84..<116])
        assertInvalidPolicy(
            try InstallPolicyRecordV1.decodeCanonical(equalLeaves)
        )
    }

    func testInstallPolicyRejectsEveryPathAndMetadataDrift() throws {
        let canonical = try installPolicyFixture().canonicalBytes()
        var cursor = 212
        for path in exactInstallPaths {
            let pathByteCount = path.utf8.count
            let metadata = cursor + 1 + pathByteCount
            let offsets =
                [cursor]
                + Array((cursor + 1)..<(cursor + 1 + pathByteCount))
                + Array(metadata..<(metadata + 18))
            for offset in offsets {
                var corrupted = canonical
                corrupted[offset] &+= 1
                assertInvalidPolicy(
                    try InstallPolicyRecordV1.decodeCanonical(corrupted)
                )
            }
            cursor += pathByteCount + 19
        }
    }

    func testInstallPolicyCompositionRejectsSwappedOrWrongArtifact()
        throws
    {
        let artifact = try artifactClosureFixture()
        let canonical = try installPolicyFixture(
            artifactClosure: artifact
        ).canonicalBytes()

        var swapped = canonical
        swapped.replaceSubrange(84..<116, with: canonical[116..<148])
        swapped.replaceSubrange(116..<148, with: canonical[84..<116])
        let swappedRecord = try InstallPolicyRecordV1.decodeCanonical(
            swapped
        )
        assertInvalidPolicy(
            try swappedRecord.validateArtifactClosure(artifact)
        )

        var wrongClosure = canonical
        wrongClosure[52] &+= 1
        let wrongClosureRecord =
            try InstallPolicyRecordV1.decodeCanonical(wrongClosure)
        assertInvalidPolicy(
            try wrongClosureRecord.validateArtifactClosure(artifact)
        )
    }

    func testNewCanonicalRecordDomainsRemainDistinct() throws {
        let records = [
            try releaseToolchainFixture().canonicalBytes(),
            try artifactClosureFixture().canonicalBytes(),
            try installPolicyFixture().canonicalBytes(),
        ]
        XCTAssertEqual(
            records.map { String(decoding: $0.prefix(8), as: UTF8.self) },
            ["FGV7RTL1", "FGV7ACL1", "FGV7INP1"]
        )
        XCTAssertEqual(Set(records.map { $0.count }).count, records.count)
        XCTAssertEqual(
            Set(records.map { policyHexadecimal(CanonicalSHA256.digest($0).bytes) })
                .count,
            records.count
        )
    }
}
