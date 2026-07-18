import Darwin
import Foundation

enum TrustRootAuthorityStateStoreError: Error, Equatable, Sendable {
    case invalidAuthorityState
}

struct TrustRootAuthorityStateTokenV1: Equatable, Sendable {
    let journalID: CanonicalBytes32
    let journalSequence: UInt64
    let authorityPublicKeyRecordSHA256: CanonicalBytes32
    let journalHeaderSHA256: CanonicalBytes32
    let lastJournalEntrySHA256: CanonicalBytes32
    let expectedActivationHeadSHA256: CanonicalBytes32
}

struct TrustRootAuthorityStateSnapshotV1: Sendable {
    let authorityPublicKeyRawRepresentation: [UInt8]
    let expectedActivationHead: ExpectedActivationHeadV1
    let token: TrustRootAuthorityStateTokenV1
}

/// Reads the fixed, root-owned authority-state namespace.
///
/// The filesystem lock used here is advisory and inode-scoped. It coordinates
/// this reader with cooperating writers; it is not a security boundary against
/// a privileged writer that ignores the lock.
final class TrustRootAuthorityStateStoreV1: @unchecked Sendable {
    static let production = TrustRootAuthorityStateStoreV1(
        configuration: .production
    )

    /// V1 bounds directory enumeration, hashing, and canonical decoding to
    /// 4,096 committed entries per fresh read.
    static let maximumJournalEntryCount = 4_096

    private let configuration: AuthorityStateFilesystemConfigurationV1
    private let highWaterLock = NSLock()
    private var highWater: TrustRootAuthorityStateTokenV1?

    private init(
        configuration: AuthorityStateFilesystemConfigurationV1
    ) {
        self.configuration = configuration
    }

    /// Test-only construction for a concrete temporary state-root layout.
    ///
    /// Production code cannot redirect `production` or inject a provider.
    init(
        testStateRootPath: String,
        expectedUID: uid_t,
        expectedGID: gid_t
    ) {
        configuration = .test(
            stateRootPath: testStateRootPath,
            expectedUID: expectedUID,
            expectedGID: expectedGID
        )
    }

    func freshSnapshot() throws -> TrustRootAuthorityStateSnapshotV1 {
        do {
            return try highWaterLock.withLock {
                // Serialize the read with the high-water comparison so two
                // concurrent callers cannot publish snapshots out of
                // monotonic order.
                let loaded = try loadFilesystemSnapshot()
                let loadedToken = loaded.snapshot.token
                if let highWater {
                    guard
                        loadedToken.journalID
                            == highWater.journalID,
                        loadedToken
                            .authorityPublicKeyRecordSHA256
                            == highWater
                            .authorityPublicKeyRecordSHA256,
                        loadedToken.journalHeaderSHA256
                            == highWater.journalHeaderSHA256,
                        loadedToken.journalSequence
                            >= highWater.journalSequence
                    else {
                        throw TrustRootAuthorityStateStoreError
                            .invalidAuthorityState
                    }
                    let highWaterIndex =
                        Int(highWater.journalSequence - 1)
                    guard
                        highWaterIndex
                            < loaded.journalEntrySHA256s.count,
                        loaded.journalEntrySHA256s[highWaterIndex]
                            == highWater.lastJournalEntrySHA256
                    else {
                        throw TrustRootAuthorityStateStoreError
                            .invalidAuthorityState
                    }
                    if loadedToken.journalSequence
                        == highWater.journalSequence
                    {
                        guard
                            loadedToken.lastJournalEntrySHA256
                                == highWater
                                .lastJournalEntrySHA256,
                            loadedToken
                                .expectedActivationHeadSHA256
                                == highWater
                                .expectedActivationHeadSHA256
                        else {
                            throw TrustRootAuthorityStateStoreError
                                .invalidAuthorityState
                        }
                    }
                }
                if let highWater {
                    if loadedToken.journalSequence
                        > highWater.journalSequence
                    {
                        self.highWater = loadedToken
                    }
                } else {
                    self.highWater = loadedToken
                }
                return loaded.snapshot
            }
        } catch {
            throw TrustRootAuthorityStateStoreError.invalidAuthorityState
        }
    }

    func requireUnchanged(
        _ token: TrustRootAuthorityStateTokenV1
    ) throws -> TrustRootAuthorityStateSnapshotV1 {
        let snapshot = try freshSnapshot()
        guard snapshot.token == token else {
            throw TrustRootAuthorityStateStoreError.invalidAuthorityState
        }
        return snapshot
    }

    private func loadFilesystemSnapshot()
        throws -> LoadedAuthorityStateSnapshotV1
    {
        let hierarchy = try configuration.openStateRoot()
        defer {
            hierarchy.closeAll()
        }
        let stateRoot = hierarchy.stateRoot
        let stateDevice = stateRoot.identity.device

        try requireExactDirectoryEntries(
            stateRoot.fd,
            expected: [
                "authority-state-v1.lock",
                "authority-public-key-v1.bin",
                "activation-head-journal-v1",
            ]
        )

        let lockFile = try openChild(
            parent: stateRoot,
            name: "authority-state-v1.lock",
            policy: .regularFile(
                uid: configuration.stateUID,
                gid: configuration.stateGID,
                mode: 0o644,
                byteCount: 0
            ),
            requiredDevice: stateDevice
        )
        defer {
            lockFile.close()
        }
        try acquireNonblockingSharedAdvisoryLock(lockFile.fd)
        defer {
            _ = flock(lockFile.fd, LOCK_UN)
        }

        // Repeat all namespace observations while the cooperating-writer lock
        // is held. The first pass is not treated as authoritative.
        for ancestor in hierarchy.ancestors {
            try ancestor.requireUnchanged()
        }
        try stateRoot.requireUnchanged()
        try lockFile.requireUnchanged()
        try requireExactDirectoryEntries(
            stateRoot.fd,
            expected: [
                "authority-state-v1.lock",
                "authority-public-key-v1.bin",
                "activation-head-journal-v1",
            ]
        )

        let keyFile = try openChild(
            parent: stateRoot,
            name: "authority-public-key-v1.bin",
            policy: .regularFile(
                uid: configuration.stateUID,
                gid: configuration.stateGID,
                mode: 0o444,
                byteCount:
                    AuthorityPublicKeyRecordV1.canonicalByteCount
            ),
            requiredDevice: stateDevice
        )
        defer {
            keyFile.close()
        }
        let keyBytes = try readStableExactBytes(
            keyFile,
            count: AuthorityPublicKeyRecordV1.canonicalByteCount
        )
        let keyRecord = try AuthorityPublicKeyRecordV1
            .decodeCanonical(keyBytes)

        let journalDirectory = try openChild(
            parent: stateRoot,
            name: "activation-head-journal-v1",
            policy: .directory(
                uid: configuration.stateUID,
                gid: configuration.stateGID,
                mode: 0o755
            ),
            requiredDevice: stateDevice
        )
        defer {
            journalDirectory.close()
        }
        try requireExactDirectoryEntries(
            journalDirectory.fd,
            expected: ["header.bin", "entries", "pending"]
        )

        let headerFile = try openChild(
            parent: journalDirectory,
            name: "header.bin",
            policy: .regularFile(
                uid: configuration.stateUID,
                gid: configuration.stateGID,
                mode: 0o444,
                byteCount:
                    ActivationHeadJournalHeaderV1.canonicalByteCount
            ),
            requiredDevice: stateDevice
        )
        defer {
            headerFile.close()
        }
        let headerBytes = try readStableExactBytes(
            headerFile,
            count:
                ActivationHeadJournalHeaderV1.canonicalByteCount
        )
        let header = try ActivationHeadJournalHeaderV1
            .decodeCanonical(headerBytes)

        let entriesDirectory = try openChild(
            parent: journalDirectory,
            name: "entries",
            policy: .directory(
                uid: configuration.stateUID,
                gid: configuration.stateGID,
                mode: 0o755
            ),
            requiredDevice: stateDevice
        )
        defer {
            entriesDirectory.close()
        }
        // Non-root readers cannot open the root:wheel 0700 pending
        // directory. Validate the no-follow pathname metadata under the
        // journal lock, but leave private staging contents to the future
        // privileged writer.
        let pendingDirectory = try observeMetadataOnlyChild(
            parent: journalDirectory,
            name: "pending",
            policy: .directory(
                uid: configuration.stateUID,
                gid: configuration.stateGID,
                mode: 0o700
            ),
            requiredDevice: stateDevice
        )

        let entryNames = try exactJournalEntryNames(
            entriesDirectory.fd
        )
        guard
            !entryNames.isEmpty,
            entryNames.count <= Self.maximumJournalEntryCount
        else {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }

        guard
            keyRecord.audience == .productionRecovery,
            keyRecord.purpose == .inspectStalePrefix100,
            header.audience == keyRecord.audience,
            header.purpose == keyRecord.purpose,
            header.authoritySignerKeyID
                == keyRecord.authoritySignerKeyID,
            header.authorityPublicKeyRecordSHA256
                == keyRecord.canonicalSHA256(),
            header.entryByteCount
                == UInt32(
                    ActivationHeadJournalEntryV1.canonicalByteCount
                )
        else {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }

        var previousRecordSHA256 = header.canonicalSHA256()
        var lastEntry: ActivationHeadJournalEntryV1?
        var journalEntrySHA256s: [CanonicalBytes32] = []
        journalEntrySHA256s.reserveCapacity(entryNames.count)
        for (zeroBasedIndex, name) in entryNames.enumerated() {
            let expectedSequence = UInt64(zeroBasedIndex + 1)
            let entryBytes: [UInt8]
            do {
                let entryFile = try openChild(
                    parent: entriesDirectory,
                    name: name,
                    policy: .regularFile(
                        uid: configuration.stateUID,
                        gid: configuration.stateGID,
                        mode: 0o444,
                        byteCount:
                            ActivationHeadJournalEntryV1
                            .canonicalByteCount
                    ),
                    requiredDevice: stateDevice
                )
                defer {
                    entryFile.close()
                }
                entryBytes = try readStableExactBytes(
                    entryFile,
                    count:
                        ActivationHeadJournalEntryV1
                        .canonicalByteCount
                )
            }
            let entry = try ActivationHeadJournalEntryV1
                .decodeCanonical(entryBytes)
            guard
                entry.audience == header.audience,
                entry.purpose == header.purpose,
                entry.journalSequence == expectedSequence,
                entry.previousJournalRecordSHA256
                    == previousRecordSHA256,
                entry.expectedActivationHead.authoritySignerKeyID
                    == header.authoritySignerKeyID
            else {
                throw TrustRootAuthorityStateStoreError
                    .invalidAuthorityState
            }
            let entrySHA256 = entry.canonicalSHA256()
            previousRecordSHA256 = entrySHA256
            journalEntrySHA256s.append(entrySHA256)
            lastEntry = entry
        }

        guard let lastEntry else {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }

        try keyFile.requireUnchanged()
        try headerFile.requireUnchanged()
        try entriesDirectory.requireUnchanged()
        try pendingDirectory.requireUnchanged()
        try journalDirectory.requireUnchanged()
        try lockFile.requireUnchanged()
        try stateRoot.requireUnchanged()
        for ancestor in hierarchy.ancestors.reversed() {
            try ancestor.requireUnchanged()
        }
        try requireExactDirectoryEntries(
            journalDirectory.fd,
            expected: ["header.bin", "entries", "pending"]
        )
        guard
            try exactJournalEntryNames(entriesDirectory.fd)
                == entryNames
        else {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }

        return LoadedAuthorityStateSnapshotV1(
            snapshot: TrustRootAuthorityStateSnapshotV1(
                authorityPublicKeyRawRepresentation:
                    keyRecord.authorityPublicKeyRawRepresentation,
                expectedActivationHead:
                    lastEntry.expectedActivationHead,
                token: TrustRootAuthorityStateTokenV1(
                    journalID: header.journalID,
                    journalSequence: lastEntry.journalSequence,
                    authorityPublicKeyRecordSHA256:
                        keyRecord.canonicalSHA256(),
                    journalHeaderSHA256:
                        header.canonicalSHA256(),
                    lastJournalEntrySHA256:
                        lastEntry.canonicalSHA256(),
                    expectedActivationHeadSHA256:
                        lastEntry.expectedActivationHead
                        .canonicalSHA256()
                )
            ),
            journalEntrySHA256s: journalEntrySHA256s
        )
    }
}

private struct LoadedAuthorityStateSnapshotV1 {
    let snapshot: TrustRootAuthorityStateSnapshotV1
    let journalEntrySHA256s: [CanonicalBytes32]
}

private struct AuthorityStateFilesystemConfigurationV1 {
    static let productionStateRootPath =
        "/Library/Application Support"
        + "/com.gomyway1216.shogi-floodgate-v7"
        + "/ExternalTrustRoot/v1/state"

    enum Root {
        case production
        case test(path: String)
    }

    let root: Root
    let stateUID: uid_t
    let stateGID: gid_t

    static let production = Self(
        root: .production,
        stateUID: 0,
        stateGID: 0
    )

    static func test(
        stateRootPath: String,
        expectedUID: uid_t,
        expectedGID: gid_t
    ) -> Self {
        Self(
            root: .test(path: stateRootPath),
            stateUID: expectedUID,
            stateGID: expectedGID
        )
    }

    func openStateRoot() throws -> OpenedAuthorityHierarchyV1 {
        switch root {
        case .production:
            return try openProductionStateRoot()
        case let .test(path):
            let root = try openAbsoluteDirectory(
                path: path,
                policy: .directory(
                    uid: stateUID,
                    gid: stateGID,
                    mode: 0o755
                ),
                requiredDevice: nil
            )
            return OpenedAuthorityHierarchyV1(
                ancestors: [],
                stateRoot: root
            )
        }
    }

    private func openProductionStateRoot()
        throws -> OpenedAuthorityHierarchyV1
    {
        let policies: [(String, uid_t, gid_t, mode_t)] = [
            ("/", 0, 0, 0o755),
            ("Library", 0, 0, 0o755),
            ("Application Support", 0, 80, 0o755),
            (
                "com.gomyway1216.shogi-floodgate-v7",
                0,
                0,
                0o755
            ),
            ("ExternalTrustRoot", 0, 0, 0o755),
            ("v1", 0, 0, 0o755),
            ("state", 0, 0, 0o755),
        ]
        precondition(
            "/"
                + policies.dropFirst().map(\.0)
                .joined(separator: "/")
                == Self.productionStateRootPath
        )
        let rootPolicy = policies[0]
        let filesystemRoot = try openAbsoluteDirectory(
            path: rootPolicy.0,
            policy: .directory(
                uid: rootPolicy.1,
                gid: rootPolicy.2,
                mode: rootPolicy.3
            ),
            requiredDevice: nil,
            requireLocalFilesystem: false
        )
        var opened = [filesystemRoot]
        do {
            for policy in policies.dropFirst() {
                let child = try openChild(
                    parent: opened.last!,
                    name: policy.0,
                    policy: .directory(
                        uid: policy.1,
                        gid: policy.2,
                        mode: policy.3
                    ),
                    requiredDevice: nil,
                    requireLocalFilesystem:
                        policy.0 == "state"
                )
                opened.append(child)
            }
            return OpenedAuthorityHierarchyV1(
                ancestors: Array(opened.dropLast()),
                stateRoot: opened.last!
            )
        } catch {
            for node in opened.reversed() {
                node.close()
            }
            throw error
        }
    }
}

private final class OpenedAuthorityHierarchyV1 {
    let ancestors: [OpenedAuthorityNodeV1]
    let stateRoot: OpenedAuthorityNodeV1

    init(
        ancestors: [OpenedAuthorityNodeV1],
        stateRoot: OpenedAuthorityNodeV1
    ) {
        self.ancestors = ancestors
        self.stateRoot = stateRoot
    }

    func closeAll() {
        stateRoot.close()
        for ancestor in ancestors.reversed() {
            ancestor.close()
        }
    }
}

private struct AuthorityFilesystemPolicyV1 {
    enum Kind {
        case directory
        case regularFile(byteCount: Int)
    }

    let kind: Kind
    let uid: uid_t
    let gid: gid_t
    let mode: mode_t

    static func directory(
        uid: uid_t,
        gid: gid_t,
        mode: mode_t
    ) -> Self {
        Self(kind: .directory, uid: uid, gid: gid, mode: mode)
    }

    static func regularFile(
        uid: uid_t,
        gid: gid_t,
        mode: mode_t,
        byteCount: Int
    ) -> Self {
        Self(
            kind: .regularFile(byteCount: byteCount),
            uid: uid,
            gid: gid,
            mode: mode
        )
    }
}

private struct AuthorityFilesystemIdentityV1: Equatable {
    let device: dev_t
    let inode: ino_t
    let mode: mode_t
    let linkCount: nlink_t
    let uid: uid_t
    let gid: gid_t
    let byteCount: off_t
    let modifiedSeconds: Int
    let modifiedNanoseconds: Int
    let changedSeconds: Int
    let changedNanoseconds: Int

    init(_ metadata: stat) {
        device = metadata.st_dev
        inode = metadata.st_ino
        mode = metadata.st_mode
        linkCount = metadata.st_nlink
        uid = metadata.st_uid
        gid = metadata.st_gid
        byteCount = metadata.st_size
        modifiedSeconds = metadata.st_mtimespec.tv_sec
        modifiedNanoseconds = metadata.st_mtimespec.tv_nsec
        changedSeconds = metadata.st_ctimespec.tv_sec
        changedNanoseconds = metadata.st_ctimespec.tv_nsec
    }
}

private final class OpenedAuthorityNodeV1 {
    let fd: Int32
    let identity: AuthorityFilesystemIdentityV1
    let policy: AuthorityFilesystemPolicyV1
    let requiredDevice: dev_t?
    let parentFD: Int32?
    let pathComponent: String
    let absolutePath: String?
    private var didClose = false

    init(
        fd: Int32,
        identity: AuthorityFilesystemIdentityV1,
        policy: AuthorityFilesystemPolicyV1,
        requiredDevice: dev_t?,
        parentFD: Int32?,
        pathComponent: String,
        absolutePath: String?
    ) {
        self.fd = fd
        self.identity = identity
        self.policy = policy
        self.requiredDevice = requiredDevice
        self.parentFD = parentFD
        self.pathComponent = pathComponent
        self.absolutePath = absolutePath
    }

    deinit {
        close()
    }

    func close() {
        guard !didClose else {
            return
        }
        didClose = true
        _ = Darwin.close(fd)
    }

    func requireUnchanged() throws {
        let current = try metadataForFD(fd)
        try validateMetadata(
            current,
            policy: policy,
            requiredDevice: requiredDevice
        )
        guard current == identity else {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }
        try requireNoExtendedACL(fd)

        let pathnameMetadata: AuthorityFilesystemIdentityV1
        if let parentFD {
            pathnameMetadata = try metadataAt(
                parentFD: parentFD,
                name: pathComponent
            )
        } else if let absolutePath {
            pathnameMetadata = try metadataAt(
                parentFD: AT_FDCWD,
                name: absolutePath
            )
        } else {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }
        guard pathnameMetadata == current else {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }
    }
}

private struct ObservedAuthorityPathV1 {
    let parentFD: Int32
    let name: String
    let identity: AuthorityFilesystemIdentityV1
    let policy: AuthorityFilesystemPolicyV1
    let requiredDevice: dev_t?

    func requireUnchanged() throws {
        let current = try metadataAt(
            parentFD: parentFD,
            name: name
        )
        try validateMetadata(
            current,
            policy: policy,
            requiredDevice: requiredDevice
        )
        guard current == identity else {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }
    }
}

private func openAbsoluteDirectory(
    path: String,
    policy: AuthorityFilesystemPolicyV1,
    requiredDevice: dev_t?,
    requireLocalFilesystem: Bool = true
) throws -> OpenedAuthorityNodeV1 {
    let pathMetadata = try metadataAt(parentFD: AT_FDCWD, name: path)
    try validateMetadata(
        pathMetadata,
        policy: policy,
        requiredDevice: requiredDevice
    )
    let fd = path.withCString {
        open(
            $0,
            O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC
        )
    }
    guard fd >= 0 else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    do {
        let fdMetadata = try metadataForFD(fd)
        try validateMetadata(
            fdMetadata,
            policy: policy,
            requiredDevice: requiredDevice
        )
        guard fdMetadata == pathMetadata else {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }
        if requireLocalFilesystem {
            try requireLocalFileSystem(fd)
        }
        try requireNoExtendedACL(fd)
        return OpenedAuthorityNodeV1(
            fd: fd,
            identity: fdMetadata,
            policy: policy,
            requiredDevice: requiredDevice,
            parentFD: nil,
            pathComponent: path,
            absolutePath: path
        )
    } catch {
        _ = close(fd)
        throw error
    }
}

private func openChild(
    parent: OpenedAuthorityNodeV1,
    name: String,
    policy: AuthorityFilesystemPolicyV1,
    requiredDevice: dev_t?,
    requireLocalFilesystem: Bool = true
) throws -> OpenedAuthorityNodeV1 {
    guard
        !name.isEmpty,
        name != ".",
        name != "..",
        !name.contains("/")
    else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    let pathMetadata = try metadataAt(
        parentFD: parent.fd,
        name: name
    )
    try validateMetadata(
        pathMetadata,
        policy: policy,
        requiredDevice: requiredDevice
    )
    let flags: Int32
    switch policy.kind {
    case .directory:
        flags = O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC
    case .regularFile:
        flags = O_RDONLY | O_NOFOLLOW | O_CLOEXEC
    }
    let fd = name.withCString {
        openat(parent.fd, $0, flags)
    }
    guard fd >= 0 else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    do {
        let fdMetadata = try metadataForFD(fd)
        try validateMetadata(
            fdMetadata,
            policy: policy,
            requiredDevice: requiredDevice
        )
        guard fdMetadata == pathMetadata else {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }
        if requireLocalFilesystem {
            try requireLocalFileSystem(fd)
        }
        try requireNoExtendedACL(fd)
        return OpenedAuthorityNodeV1(
            fd: fd,
            identity: fdMetadata,
            policy: policy,
            requiredDevice: requiredDevice,
            parentFD: parent.fd,
            pathComponent: name,
            absolutePath: nil
        )
    } catch {
        _ = close(fd)
        throw error
    }
}

private func observeMetadataOnlyChild(
    parent: OpenedAuthorityNodeV1,
    name: String,
    policy: AuthorityFilesystemPolicyV1,
    requiredDevice: dev_t?
) throws -> ObservedAuthorityPathV1 {
    guard
        !name.isEmpty,
        name != ".",
        name != "..",
        !name.contains("/")
    else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    let metadata = try metadataAt(
        parentFD: parent.fd,
        name: name
    )
    try validateMetadata(
        metadata,
        policy: policy,
        requiredDevice: requiredDevice
    )
    return ObservedAuthorityPathV1(
        parentFD: parent.fd,
        name: name,
        identity: metadata,
        policy: policy,
        requiredDevice: requiredDevice
    )
}

private func metadataForFD(
    _ fd: Int32
) throws -> AuthorityFilesystemIdentityV1 {
    var metadata = stat()
    guard fstat(fd, &metadata) == 0 else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    return AuthorityFilesystemIdentityV1(metadata)
}

private func metadataAt(
    parentFD: Int32,
    name: String
) throws -> AuthorityFilesystemIdentityV1 {
    var metadata = stat()
    let result = name.withCString {
        fstatat(parentFD, $0, &metadata, AT_SYMLINK_NOFOLLOW)
    }
    guard result == 0 else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    return AuthorityFilesystemIdentityV1(metadata)
}

private func validateMetadata(
    _ metadata: AuthorityFilesystemIdentityV1,
    policy: AuthorityFilesystemPolicyV1,
    requiredDevice: dev_t?
) throws {
    let fileType = metadata.mode & mode_t(S_IFMT)
    let exactPermissionAndSpecialBits =
        metadata.mode & mode_t(0o7777)
    guard
        metadata.uid == policy.uid,
        metadata.gid == policy.gid,
        exactPermissionAndSpecialBits == policy.mode,
        requiredDevice == nil || metadata.device == requiredDevice
    else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    switch policy.kind {
    case .directory:
        guard
            fileType == mode_t(S_IFDIR),
            metadata.linkCount > 0
        else {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }
    case let .regularFile(byteCount):
        guard
            fileType == mode_t(S_IFREG),
            metadata.linkCount == 1,
            metadata.byteCount == off_t(byteCount)
        else {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }
    }
}

private func requireLocalFileSystem(_ fd: Int32) throws {
    var filesystem = statfs()
    guard
        fstatfs(fd, &filesystem) == 0,
        (filesystem.f_flags & UInt32(MNT_LOCAL)) != 0
    else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
}

/// This V1 policy deliberately rejects the presence of any extended ACL
/// object. That is stricter than merely rejecting writable entries and is
/// easy to audit.
private func requireNoExtendedACL(_ fd: Int32) throws {
    errno = 0
    guard let acl = acl_get_fd_np(fd, ACL_TYPE_EXTENDED) else {
        // Darwin reports ENOENT when the inode has no extended ACL.
        guard errno == ENOENT else {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }
        return
    }
    defer {
        _ = acl_free(UnsafeMutableRawPointer(acl))
    }
    // The existence of an extended ACL object is itself outside this V1
    // policy, independent of the permissions represented by its entries.
    throw TrustRootAuthorityStateStoreError.invalidAuthorityState
}

private func acquireNonblockingSharedAdvisoryLock(
    _ fd: Int32
) throws {
    while true {
        // Never let a wedged cooperating writer consume the protocol's
        // external deadline. Contention is a fail-closed state.
        if flock(fd, LOCK_SH | LOCK_NB) == 0 {
            return
        }
        if errno != EINTR {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }
    }
}

private func readStableExactBytes(
    _ node: OpenedAuthorityNodeV1,
    count: Int
) throws -> [UInt8] {
    guard count >= 0 else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    try node.requireUnchanged()
    let first = try readExactBytes(node.fd, count: count)
    let second = try readExactBytes(node.fd, count: count)
    guard first == second else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    try node.requireUnchanged()
    return first
}

private func readExactBytes(
    _ fd: Int32,
    count: Int
) throws -> [UInt8] {
    var bytes = Array(repeating: UInt8(0), count: count)
    var total = 0
    while total < count {
        let result = bytes.withUnsafeMutableBytes { rawBuffer in
            pread(
                fd,
                rawBuffer.baseAddress!.advanced(by: total),
                count - total,
                off_t(total)
            )
        }
        if result > 0 {
            total += result
            continue
        }
        if result < 0 && errno == EINTR {
            continue
        }
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    var trailing: UInt8 = 0
    while true {
        let result = withUnsafeMutablePointer(to: &trailing) {
            pread(fd, $0, 1, off_t(count))
        }
        if result == 0 {
            break
        }
        if result < 0 && errno == EINTR {
            continue
        }
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    return bytes
}

private func directoryEntryNames(
    _ fd: Int32,
    maximumCount: Int
) throws -> [String] {
    guard maximumCount >= 0 else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    let duplicate = dup(fd)
    guard duplicate >= 0 else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    guard let directory = fdopendir(duplicate) else {
        _ = close(duplicate)
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    defer {
        _ = closedir(directory)
    }

    rewinddir(directory)
    var names: [String] = []
    errno = 0
    while let entry = readdir(directory) {
        let name = try withUnsafeBytes(
            of: entry.pointee.d_name
        ) { bytes -> String in
            guard
                let terminator = bytes.firstIndex(of: 0),
                terminator > bytes.startIndex,
                let decoded = String(
                    bytes: bytes[..<terminator],
                    encoding: .utf8
                )
            else {
                throw TrustRootAuthorityStateStoreError
                    .invalidAuthorityState
            }
            return decoded
        }
        if name != "." && name != ".." {
            names.append(name)
            guard names.count <= maximumCount else {
                throw TrustRootAuthorityStateStoreError
                    .invalidAuthorityState
            }
        }
        errno = 0
    }
    guard errno == 0, Set(names).count == names.count else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    return names.sorted()
}

private func requireExactDirectoryEntries(
    _ fd: Int32,
    expected: Set<String>
) throws {
    let first = try directoryEntryNames(
        fd,
        maximumCount: expected.count
    )
    let second = try directoryEntryNames(
        fd,
        maximumCount: expected.count
    )
    guard
        first == second,
        Set(first) == expected,
        first.count == expected.count
    else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
}

private func exactJournalEntryNames(
    _ fd: Int32
) throws -> [String] {
    let names = try directoryEntryNames(
        fd,
        maximumCount:
            TrustRootAuthorityStateStoreV1
            .maximumJournalEntryCount
    )
    guard
        !names.isEmpty,
        names.count <= TrustRootAuthorityStateStoreV1
            .maximumJournalEntryCount
    else {
        throw TrustRootAuthorityStateStoreError.invalidAuthorityState
    }
    for (index, name) in names.enumerated() {
        let expected = String(
            format: "%020llu.bin",
            UInt64(index + 1)
        )
        guard name == expected else {
            throw TrustRootAuthorityStateStoreError
                .invalidAuthorityState
        }
    }
    return names
}
