import CryptoKit
import Darwin
import Foundation
import XCTest

@testable import FloodgateV7ExternalTrustRootProtocol

private func authorityStateBytes32(
    _ value: UInt8
) -> CanonicalBytes32 {
    try! CanonicalBytes32(Array(repeating: value, count: 32))
}

private func setAuthorityStateMode(
    _ url: URL,
    _ mode: mode_t
) throws {
    guard url.path.withCString({ chmod($0, mode) }) == 0 else {
        throw NSError(
            domain: NSPOSIXErrorDomain,
            code: Int(errno)
        )
    }
}

private func writeAuthorityStateFile(
    _ bytes: [UInt8],
    to url: URL,
    mode: mode_t
) throws {
    let created = FileManager.default.createFile(
        atPath: url.path,
        contents: Data(bytes),
        attributes: nil
    )
    guard created else {
        throw NSError(
            domain: NSPOSIXErrorDomain,
            code: Int(EIO)
        )
    }
    try setAuthorityStateMode(url, mode)
}

final class AuthorityStateFilesystemFixture {
    let root: URL
    let lockFile: URL
    let keyFile: URL
    let journalDirectory: URL
    let headerFile: URL
    let entriesDirectory: URL
    let pendingDirectory: URL
    let authorityPrivateKey: Curve25519.Signing.PrivateKey
    let keyRecord: AuthorityPublicKeyRecordV1
    let header: ActivationHeadJournalHeaderV1

    private(set) var entries: [ActivationHeadJournalEntryV1] = []

    init(entryCount: Int = 1) throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "floodgate-v7-authority-state-\(UUID().uuidString)",
                isDirectory: true
            )
        lockFile = root.appendingPathComponent(
            "authority-state-v1.lock"
        )
        keyFile = root.appendingPathComponent(
            "authority-public-key-v1.bin"
        )
        journalDirectory = root.appendingPathComponent(
            "activation-head-journal-v1",
            isDirectory: true
        )
        headerFile = journalDirectory.appendingPathComponent(
            "header.bin"
        )
        entriesDirectory = journalDirectory.appendingPathComponent(
            "entries",
            isDirectory: true
        )
        pendingDirectory = journalDirectory.appendingPathComponent(
            "pending",
            isDirectory: true
        )
        authorityPrivateKey = Curve25519.Signing.PrivateKey()
        let rawPublicKey = Array(
            authorityPrivateKey.publicKey.rawRepresentation
        )
        let keyID = try TrustRootSignatureV1.signerKeyID(
            publicKeyRawRepresentation: rawPublicKey
        )
        keyRecord = try AuthorityPublicKeyRecordV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            authorityPublicKeyRawRepresentation: rawPublicKey,
            authoritySignerKeyID: keyID
        )
        header = try ActivationHeadJournalHeaderV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            entryByteCount:
                ActivationHeadJournalHeaderV1.requiredEntryByteCount,
            journalID: authorityStateBytes32(0x91),
            authoritySignerKeyID: keyID,
            authorityPublicKeyRecordSHA256:
                keyRecord.canonicalSHA256()
        )

        try FileManager.default.createDirectory(
            at: root,
            withIntermediateDirectories: false
        )
        try setAuthorityStateMode(root, 0o755)
        try FileManager.default.createDirectory(
            at: journalDirectory,
            withIntermediateDirectories: false
        )
        try setAuthorityStateMode(journalDirectory, 0o755)
        try FileManager.default.createDirectory(
            at: entriesDirectory,
            withIntermediateDirectories: false
        )
        try setAuthorityStateMode(entriesDirectory, 0o755)
        try FileManager.default.createDirectory(
            at: pendingDirectory,
            withIntermediateDirectories: false
        )
        try setAuthorityStateMode(pendingDirectory, 0o700)
        try writeAuthorityStateFile([], to: lockFile, mode: 0o644)
        try writeAuthorityStateFile(
            keyRecord.canonicalBytes(),
            to: keyFile,
            mode: 0o444
        )
        try writeAuthorityStateFile(
            header.canonicalBytes(),
            to: headerFile,
            mode: 0o444
        )
        for sequence in 1...entryCount {
            try appendEntry(sequence: UInt64(sequence))
        }
    }

    deinit {
        try? FileManager.default.removeItem(at: root)
    }

    var store: TrustRootAuthorityStateStoreV1 {
        TrustRootAuthorityStateStoreV1(
            testStateRootPath: root.path,
            expectedUID: getuid(),
            expectedGID: getgid()
        )
    }

    func entryURL(_ sequence: UInt64) -> URL {
        entriesDirectory.appendingPathComponent(
            String(format: "%020llu.bin", sequence)
        )
    }

    func makeHead(
        sequence: UInt64,
        salt: UInt8? = nil
    ) throws -> ExpectedActivationHeadV1 {
        let base = salt ?? UInt8(truncatingIfNeeded: sequence)
        return try ExpectedActivationHeadV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            authoritySignerKeyID: keyRecord.authoritySignerKeyID,
            latestActivationSequence: sequence,
            latestActivationEnvelopeSHA256:
                authorityStateBytes32(base &+ 0x10),
            activeEnrollmentEnvelopeSHA256:
                authorityStateBytes32(base &+ 0x30),
            activeEnrollmentRecordSHA256:
                authorityStateBytes32(base &+ 0x50)
        )
    }

    func makeEntry(
        sequence: UInt64,
        previousSHA256: CanonicalBytes32,
        salt: UInt8? = nil
    ) throws -> ActivationHeadJournalEntryV1 {
        try ActivationHeadJournalEntryV1(
            audience: .productionRecovery,
            purpose: .inspectStalePrefix100,
            journalSequence: sequence,
            previousJournalRecordSHA256: previousSHA256,
            expectedActivationHead:
                makeHead(sequence: sequence, salt: salt)
        )
    }

    func appendEntry(
        sequence: UInt64,
        salt: UInt8? = nil
    ) throws {
        let previousSHA256 = entries.last?.canonicalSHA256()
            ?? header.canonicalSHA256()
        let entry = try makeEntry(
            sequence: sequence,
            previousSHA256: previousSHA256,
            salt: salt
        )
        try writeAuthorityStateFile(
            entry.canonicalBytes(),
            to: entryURL(sequence),
            mode: 0o444
        )
        entries.append(entry)
    }

    func replaceEntry(
        sequence: UInt64,
        with entry: ActivationHeadJournalEntryV1
    ) throws {
        let url = entryURL(sequence)
        try FileManager.default.removeItem(at: url)
        try writeAuthorityStateFile(
            entry.canonicalBytes(),
            to: url,
            mode: 0o444
        )
        entries[Int(sequence - 1)] = entry
    }

    func rewrite(
        _ bytes: [UInt8],
        at url: URL,
        mode: mode_t = 0o444
    ) throws {
        try FileManager.default.removeItem(at: url)
        try writeAuthorityStateFile(bytes, to: url, mode: mode)
    }
}

final class TrustRootAuthorityStateStoreTests: XCTestCase {
    func testHappyPathAndUnchangedToken() throws {
        let fixture = try AuthorityStateFilesystemFixture(
            entryCount: 2
        )
        let store = fixture.store

        let snapshot = try store.freshSnapshot()

        XCTAssertEqual(
            snapshot.authorityPublicKeyRawRepresentation,
            fixture.keyRecord.authorityPublicKeyRawRepresentation
        )
        XCTAssertEqual(
            snapshot.expectedActivationHead,
            fixture.entries.last!.expectedActivationHead
        )
        XCTAssertEqual(snapshot.token.journalSequence, 2)
        XCTAssertEqual(
            try store.requireUnchanged(snapshot.token).token,
            snapshot.token
        )
        XCTAssertEqual(
            TrustRootAuthorityStateStoreV1
                .maximumJournalEntryCount,
            4_096
        )
    }

    func testMissingAndUnexpectedNamespaceEntriesFailClosed()
        throws
    {
        do {
            let fixture = try AuthorityStateFilesystemFixture()
            try FileManager.default.removeItem(
                at: fixture.headerFile
            )
            XCTAssertThrowsError(
                try fixture.store.freshSnapshot()
            )
        }
        do {
            let fixture = try AuthorityStateFilesystemFixture()
            let unexpected = fixture.root.appendingPathComponent(
                "unexpected"
            )
            try writeAuthorityStateFile(
                [],
                to: unexpected,
                mode: 0o444
            )
            XCTAssertThrowsError(
                try fixture.store.freshSnapshot()
            )
        }
    }

    func testPrivatePendingContentsAreNotEnumerated() throws {
        let fixture = try AuthorityStateFilesystemFixture()
        let pending = fixture.pendingDirectory
            .appendingPathComponent("uncommitted.bin")
        try writeAuthorityStateFile(
            [],
            to: pending,
            mode: 0o400
        )

        XCTAssertNoThrow(try fixture.store.freshSnapshot())

        try setAuthorityStateMode(
            fixture.pendingDirectory,
            0o755
        )
        XCTAssertThrowsError(try fixture.store.freshSnapshot())
    }

    func testGapAndMalformedEntryNamesFailClosed() throws {
        do {
            let fixture = try AuthorityStateFilesystemFixture()
            let original = fixture.entryURL(1)
            let gap = fixture.entryURL(2)
            try FileManager.default.moveItem(
                at: original,
                to: gap
            )
            XCTAssertThrowsError(
                try fixture.store.freshSnapshot()
            )
        }
        do {
            let fixture = try AuthorityStateFilesystemFixture()
            let original = fixture.entryURL(1)
            let malformed = fixture.entriesDirectory
                .appendingPathComponent("1.bin")
            try FileManager.default.moveItem(
                at: original,
                to: malformed
            )
            XCTAssertThrowsError(
                try fixture.store.freshSnapshot()
            )
        }
    }

    func testSymlinkAndHardLinkFailClosed() throws {
        do {
            let fixture = try AuthorityStateFilesystemFixture()
            let target = FileManager.default.temporaryDirectory
                .appendingPathComponent(
                    "floodgate-v7-key-target-\(UUID().uuidString)"
                )
            defer {
                try? FileManager.default.removeItem(at: target)
            }
            try writeAuthorityStateFile(
                fixture.keyRecord.canonicalBytes(),
                to: target,
                mode: 0o444
            )
            try FileManager.default.removeItem(at: fixture.keyFile)
            let result = target.path.withCString { targetPath in
                fixture.keyFile.path.withCString { linkPath in
                    symlink(targetPath, linkPath)
                }
            }
            XCTAssertEqual(result, 0)
            XCTAssertThrowsError(
                try fixture.store.freshSnapshot()
            )
        }
        do {
            let fixture = try AuthorityStateFilesystemFixture()
            let outside = FileManager.default.temporaryDirectory
                .appendingPathComponent(
                    "floodgate-v7-hardlink-\(UUID().uuidString)"
                )
            defer {
                try? FileManager.default.removeItem(at: outside)
            }
            let result = fixture.keyFile.path.withCString {
                existingPath in
                outside.path.withCString { newPath in
                    link(existingPath, newPath)
                }
            }
            XCTAssertEqual(result, 0)
            XCTAssertThrowsError(
                try fixture.store.freshSnapshot()
            )
        }
    }

    func testExtendedACLIsRejectedByStrictV1Policy() throws {
        let fixture = try AuthorityStateFilesystemFixture()
        let chmodProcess = Process()
        chmodProcess.executableURL = URL(fileURLWithPath: "/bin/chmod")
        chmodProcess.arguments = [
            "+a",
            "everyone allow read",
            fixture.keyFile.path,
        ]
        try chmodProcess.run()
        chmodProcess.waitUntilExit()
        XCTAssertEqual(chmodProcess.terminationStatus, 0)

        XCTAssertThrowsError(try fixture.store.freshSnapshot())
    }

    func testModeAndSizeMutationFailClosed() throws {
        do {
            let fixture = try AuthorityStateFilesystemFixture()
            try setAuthorityStateMode(fixture.keyFile, 0o644)
            XCTAssertThrowsError(
                try fixture.store.freshSnapshot()
            )
        }
        do {
            let fixture = try AuthorityStateFilesystemFixture()
            try fixture.rewrite(
                fixture.keyRecord.canonicalBytes() + [0],
                at: fixture.keyFile
            )
            XCTAssertThrowsError(
                try fixture.store.freshSnapshot()
            )
        }
    }

    func testBrokenKeyAndHeaderBindingFailClosed() throws {
        do {
            let fixture = try AuthorityStateFilesystemFixture()
            var bytes = fixture.keyRecord.canonicalBytes()
            bytes[12] ^= 1
            try fixture.rewrite(bytes, at: fixture.keyFile)
            XCTAssertThrowsError(
                try fixture.store.freshSnapshot()
            )
        }
        do {
            let fixture = try AuthorityStateFilesystemFixture()
            let mismatchedHeader =
                try ActivationHeadJournalHeaderV1(
                    audience: .productionRecovery,
                    purpose: .inspectStalePrefix100,
                    entryByteCount:
                        ActivationHeadJournalHeaderV1
                        .requiredEntryByteCount,
                    journalID: fixture.header.journalID,
                    authoritySignerKeyID:
                        fixture.header.authoritySignerKeyID,
                    authorityPublicKeyRecordSHA256:
                        authorityStateBytes32(0xee)
                )
            try fixture.rewrite(
                mismatchedHeader.canonicalBytes(),
                at: fixture.headerFile
            )
            XCTAssertThrowsError(
                try fixture.store.freshSnapshot()
            )
        }
    }

    func testBrokenChainAndSequenceFailClosed() throws {
        do {
            let fixture = try AuthorityStateFilesystemFixture()
            let broken = try fixture.makeEntry(
                sequence: 1,
                previousSHA256: authorityStateBytes32(0xef)
            )
            try fixture.replaceEntry(sequence: 1, with: broken)
            XCTAssertThrowsError(
                try fixture.store.freshSnapshot()
            )
        }
        do {
            let fixture = try AuthorityStateFilesystemFixture()
            let wrongSequence = try fixture.makeEntry(
                sequence: 2,
                previousSHA256: fixture.header.canonicalSHA256()
            )
            try fixture.rewrite(
                wrongSequence.canonicalBytes(),
                at: fixture.entryURL(1)
            )
            XCTAssertThrowsError(
                try fixture.store.freshSnapshot()
            )
        }
    }

    func testProcessHighWaterRejectsRollback() throws {
        let fixture = try AuthorityStateFilesystemFixture(
            entryCount: 2
        )
        let store = fixture.store
        XCTAssertEqual(
            try store.freshSnapshot().token.journalSequence,
            2
        )

        try FileManager.default.removeItem(
            at: fixture.entryURL(2)
        )

        XCTAssertThrowsError(try store.freshSnapshot())
        // A new process/store has no durable memory and can accept the valid
        // prefix. This test pins the intentionally process-lifetime claim.
        XCTAssertEqual(
            try fixture.store.freshSnapshot().token.journalSequence,
            1
        )
    }

    func testProcessHighWaterRejectsSameSequenceReplacement()
        throws
    {
        let fixture = try AuthorityStateFilesystemFixture()
        let store = fixture.store
        let original = try store.freshSnapshot()
        let replacement = try fixture.makeEntry(
            sequence: 1,
            previousSHA256: fixture.header.canonicalSHA256(),
            salt: 0x29
        )
        try fixture.replaceEntry(
            sequence: 1,
            with: replacement
        )

        XCTAssertThrowsError(try store.freshSnapshot())
        XCTAssertNotEqual(
            original.token.lastJournalEntrySHA256,
            replacement.canonicalSHA256()
        )
    }

    func testProcessHighWaterPinsHeaderAcrossAdvance() throws {
        let fixture = try AuthorityStateFilesystemFixture()
        let store = fixture.store
        _ = try store.freshSnapshot()

        let replacementHeader =
            try ActivationHeadJournalHeaderV1(
                audience: .productionRecovery,
                purpose: .inspectStalePrefix100,
                entryByteCount:
                    ActivationHeadJournalHeaderV1
                    .requiredEntryByteCount,
                journalID: authorityStateBytes32(0x92),
                authoritySignerKeyID:
                    fixture.keyRecord.authoritySignerKeyID,
                authorityPublicKeyRecordSHA256:
                    fixture.keyRecord.canonicalSHA256()
            )
        let replacementEntry1 = try fixture.makeEntry(
            sequence: 1,
            previousSHA256:
                replacementHeader.canonicalSHA256(),
            salt: 0x21
        )
        let replacementEntry2 = try fixture.makeEntry(
            sequence: 2,
            previousSHA256:
                replacementEntry1.canonicalSHA256(),
            salt: 0x22
        )
        try fixture.rewrite(
            replacementHeader.canonicalBytes(),
            at: fixture.headerFile
        )
        try fixture.rewrite(
            replacementEntry1.canonicalBytes(),
            at: fixture.entryURL(1)
        )
        try writeAuthorityStateFile(
            replacementEntry2.canonicalBytes(),
            to: fixture.entryURL(2),
            mode: 0o444
        )

        XCTAssertThrowsError(try store.freshSnapshot())
        XCTAssertEqual(
            try fixture.store.freshSnapshot()
                .token.journalSequence,
            2
        )
    }

    func testProcessHighWaterRejectsSameHeaderForwardFork()
        throws
    {
        let fixture = try AuthorityStateFilesystemFixture()
        let store = fixture.store
        _ = try store.freshSnapshot()

        let forkEntry1 = try fixture.makeEntry(
            sequence: 1,
            previousSHA256: fixture.header.canonicalSHA256(),
            salt: 0x31
        )
        let forkEntry2 = try fixture.makeEntry(
            sequence: 2,
            previousSHA256: forkEntry1.canonicalSHA256(),
            salt: 0x32
        )
        try fixture.rewrite(
            forkEntry1.canonicalBytes(),
            at: fixture.entryURL(1)
        )
        try writeAuthorityStateFile(
            forkEntry2.canonicalBytes(),
            to: fixture.entryURL(2),
            mode: 0o444
        )

        XCTAssertThrowsError(try store.freshSnapshot())
        XCTAssertEqual(
            try fixture.store.freshSnapshot()
                .token.journalSequence,
            2
        )
    }

    func testHeadAdvanceMakesEarlierTokenUnchangedCheckFail()
        throws
    {
        let fixture = try AuthorityStateFilesystemFixture()
        let store = fixture.store
        let original = try store.freshSnapshot()

        try fixture.appendEntry(sequence: 2)

        XCTAssertThrowsError(
            try store.requireUnchanged(original.token)
        )
        let advanced = try store.freshSnapshot()
        XCTAssertEqual(advanced.token.journalSequence, 2)
        XCTAssertEqual(
            advanced.expectedActivationHead.latestActivationSequence,
            2
        )
    }

    func testLockFileIdentityAndPolicyFailClosed() throws {
        do {
            let fixture = try AuthorityStateFilesystemFixture()
            try setAuthorityStateMode(fixture.lockFile, 0o666)
            XCTAssertThrowsError(
                try fixture.store.freshSnapshot()
            )
        }
        do {
            let fixture = try AuthorityStateFilesystemFixture()
            let outside = FileManager.default.temporaryDirectory
                .appendingPathComponent(
                    "floodgate-v7-lock-link-\(UUID().uuidString)"
                )
            defer {
                try? FileManager.default.removeItem(at: outside)
            }
            let result = fixture.lockFile.path.withCString {
                existingPath in
                outside.path.withCString { newPath in
                    link(existingPath, newPath)
                }
            }
            XCTAssertEqual(result, 0)
            XCTAssertThrowsError(
                try fixture.store.freshSnapshot()
            )
        }
    }

    func testExclusiveCooperatingWriterLockFailsImmediately()
        throws
    {
        let fixture = try AuthorityStateFilesystemFixture()
        let writerFD = fixture.lockFile.path.withCString {
            open($0, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        }
        XCTAssertGreaterThanOrEqual(writerFD, 0)
        defer {
            _ = flock(writerFD, LOCK_UN)
            _ = close(writerFD)
        }
        XCTAssertEqual(flock(writerFD, LOCK_EX | LOCK_NB), 0)

        XCTAssertThrowsError(try fixture.store.freshSnapshot())

        XCTAssertEqual(flock(writerFD, LOCK_UN), 0)
        XCTAssertNoThrow(try fixture.store.freshSnapshot())
    }
}
