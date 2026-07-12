# Authorizing a private stage before running the teacher — Floodgate stage transaction

> The [preceding runtime claim](./blog-shogi-floodgate-consumer-runtime-claim.en.md) made it possible to claim once, at synchronous entry, the exact input that the production consumer passed to its callback. Connecting that input directly to the current teacher core would still promote a caller-chosen stage path, an unkeyed checkpoint, incomplete durability, and a missing stable proposer into production at once. This PR deliberately does not connect them. It only authorizes a current-EUID-owned exact-`0700` publication parent / private stage, holds their identities by descriptor, rejects aliases and containment with protected inputs, and acquires an exclusive lease. The successful receipt status is `authorized-private-stage-not-generated-not-published`. It does not run teacher search, the consumer, or the rename publisher, and it does not access real training rows, selection, or final holdout. Japanese version: [blog-shogi-floodgate-teacher-stage-authorization.md](./blog-shogi-floodgate-teacher-stage-authorization.md)

---

## Current status

| Item                                  | Status          | Boundary closed by this PR                                                 |
| ------------------------------------- | --------------- | -------------------------------------------------------------------------- |
| canonical publication parent          | Implemented     | Symlink-free, current-EUID-owned exact-`0700` directory                    |
| held parent / stage descriptors       | Implemented     | Binds path and `dev / ino` with `O_NOFOLLOW \| O_DIRECTORY`                |
| direct-sibling stage / destination    | Implemented     | Strict basenames, same parent, distinct, and destination absent            |
| protected-input disjointness          | Implemented     | Rejects realpath, inode, and both ancestor / descendant directions         |
| exclusive stage lease                 | Implemented     | Rejects concurrent authorization and never automatically steals stale lock |
| fixed stage-entry allowlist           | Implemented     | Rejects unknown entries, symlinks, and special files in a resume stage     |
| teacher generation / consumer wiring  | Not implemented | This module calls neither generator nor consumer                           |
| MAC resume / fsync / result receipt   | Not implemented | The next boundary authenticates checkpoints and closes durability          |
| stable depth-11 proposer / depth-16   | Not implemented | The preregistered candidate union is not complete                          |
| real data / selection / final holdout | Unread          | No role data or labels enter this PR                                       |
| strength claim                        | None            | Path / lease authorization is not playing-strength evidence                |

“Authorized” here means only that the namespace and held identity are temporarily leased for use as a private stage. It does not mean that artifacts were generated, a checkpoint is trustworthy, consumer postflight succeeded, a directory was published, or the model became stronger.

## 1. Why the consumer is not connected yet

The readiness audit found four reasons why `stageSiblingTeacherDatasetCoreForTests(...)` cannot yet become a production entry point.

1. The `work.jsonl` `payload_sha256` is an unkeyed torn-write checksum; it does not authenticate an actor that consistently reseals scores and derived fields
2. `atomicWrite(...)` fsyncs neither file nor directory, and there is no production result receipt created after consumer postflight
3. No held-inode authorization rules out aliasing and containment among the stage, future destination, repository, role bundle, and engine / eval inputs
4. The current v6 candidate union contains teacher MultiPV plus the played move, but omits the preregistered fixed-depth-11 runOp1 move

Sending the real 24,000 parents through this state could finish without producing training data that conforms to the preregistered plan. This PR isolates path authority first.

## 2. Inputs to the authorization API

The production API is `authorizeFloodgateTeacherStage(...)`; the dependency-injected seam is `authorizeFloodgateTeacherStageCoreForTests(...)`. The caller explicitly supplies these categories:

- repository, raw-lock, role-lock, and role-bundle roots
- the legacy protected-position-ID file
- engine binary, engine receipt, engine argument files, and optional eval tree
- publication parent
- strict direct-child basenames for the stage and future destination

It accepts no role selector, training-JSONL path, selection path, final-holdout path, or teacher score. It does not read protected-input content; it checks only namespace and metadata identity. `engineArgs` is synchronously captured as a dense array of own data properties; accessors and inherited elements are rejected without invocation. Each entry must be either a simple `-option` / `--option` token or a canonical absolute regular file that currently exists. Relative paths, absent future paths, and inline forms such as `--config=/path` are not admitted by guesswork.

## 3. Holding parent and stage by descriptor, not pathname alone

The publication parent and stage must be canonical absolute real paths and current-effective-UID-owned exact-`0700` directories. Special mode bits, group / other permissions, and symlink traversal are rejected.

Both directories are opened through `O_NOFOLLOW | O_DIRECTORY`, and descriptor `fstat` is matched against pathname `lstat` / `realpath`. Stat and entry objects returned by filesystem callbacks are reduced to frozen null-prototype scalar snapshots before Promise resolution, so inherited `Object.prototype.then` cannot use thenable assimilation to drop identities or protected paths. Internal security arrays for engine arguments, entry names, protected snapshots, and cleanup failures also receive null prototypes before their first indexed write, so inherited numeric setters cannot absorb elements. The held descriptor's `dev / ino` is the identity anchor during authorization. In the fresh case an absent stage is created exact `0700` and then opened; in the resume case the fixed-entry contract is checked before an existing stage is admitted.

Stage and destination are distinct basenames directly under the same held parent. A basename may not be exactly `.` or `..` and may not contain a slash, backslash, NUL, or control character; an internal `.` remains an allowed safe-basename character. Authorization rejects an existing destination whether it is a file, symlink, empty directory, or non-empty directory. This is not publication; it reserves a precondition for the later exclusive rename.

## 4. Disjointness is checked in both directions

Text comparison alone misses symlinks, alternate aliases, and ancestor / descendant overlap. Authorization binds every protected input to realpath and inode and rejects all of the following against the publication parent / stage:

- equal `dev / ino`
- a protected input that is an ancestor of the parent or stage
- a parent or stage that is an ancestor of a protected input
- a differently spelled alias resolving to the same real path

Putting the stage inside the repository therefore fails, as does putting the repository inside the stage. The same rule covers raw / role lock, role bundle, legacy exclusion, engine / receipt / argument files, and eval tree. This is not a sandbox against the same UID, root, or an ACL actor. The explicit boundary assumes the current-EUID writer owns a trusted critical section.

## 5. Exclusive lease and stale state

Authorization creates an exclusive sibling lease corresponding to the stage and holds that directory identity. A second process or invocation cannot authorize the same stage concurrently. An existing lease is never deleted merely because its timestamp or PID looks old. A crash may leave a stale lease; it remains fail-closed for a future MAC-authenticated resume / reconciliation step.

For a successful lease, `close()` is idempotent. It rechecks the held parent / stage / lease, destination absence, protected inputs, and stage entries immediately before lease removal, then releases the lease and closes descriptors. A path swap or cleanup failure is not hidden as success. Close failure returns `FloodgateTeacherStageCloseError` with `leaseMayRemain`. When lease removal or descriptor cleanup after authorization failure cannot complete, `FloodgateTeacherStageAuthorizationCleanupError` retains the primary failure, frozen cleanup failures, and whether the lease may remain. A replacement inode observed during reconciliation is not deleted, but this does not claim to exclude an lstat / rmdir race with a same-UID actor; the trusted-current-EUID critical section remains an assumption. The authorization receipt and its nested identities are frozen; they are not a copyable “generated” token.

## 6. What the fixed-entry allowlist proves

A resume stage admits only known teacher-artifact basenames and rejects unknown entries, symlinks, directories, devices, and other special files. A known entry must also be a current-EUID-owned exact-`0600` regular file with link count one, and it may not share an inode with an explicitly protected file. This does not prove file contents, JSON schema, byte counts, SHA-256, checkpoint MAC, or fsync state. Stage authorization precedes artifact closure; the next runner boundary must own the exact file set and content receipt.

The successful receipt deliberately carries this status:

```text
authorized-private-stage-not-generated-not-published
```

The long status prevents an inflated claim. Even with a receipt, there may be zero teacher labels, the destination remains absent, and no final consumer may read anything.

## 7. Machine readiness and asset blockers

A read-only preflight before this PR checked the execution machine and tracked assets.

| Item                    | Observation                                                                      |
| ----------------------- | -------------------------------------------------------------------------------- |
| machine                 | Apple M4 Pro, 14 cores (10 performance + 4 efficiency), 48 GB memory             |
| free disk               | 104 GiB                                                                          |
| preregistered teacher   | 12 engines × 1 thread, Hash 64 MiB / engine                                      |
| TT memory floor         | 768 MiB                                                                          |
| depth-16 lower estimate | About 11.47 hours / 24,000 parents; excludes stable proposer and extra rescoring |
| tracked engine receipt  | 654 bytes, SHA-256 `a448c6be…6f9c4e`                                             |
| tracked stable weights  | 1,185,988 bytes, SHA-256 `e4e738f9…e28dc`                                        |
| exact YaneuraOu binary  | Missing                                                                          |
| eval `nn.bin`           | Missing                                                                          |

The machine has ample capacity for the fixed 12-engine contract, but exact binary / eval assets and the production software boundary are incomplete. Machine capacity is not the present blocker. The 11.47-hour figure is a lower bound extrapolated from earlier depth-16 evidence. Inserting synchronous WASM search into the same Node event loop could starve USI pipes and timers, so stable proposals need a separately bounded worker-thread / child-process phase that is generated and authenticated first.

## 8. Safe execution order

1. Complete this stage authorization and exclusive lease
2. Build a stable-proposer v7 that runs the exact runOp1 weights / WASM / depth-11 contract in a separate pool
3. Authenticate checkpoints with a MAC and add file / stage-directory fsync plus crash reconciliation
4. Claim at the first synchronous action in the consumer callback, then generate only the private stage
5. Create `result.json` only after successful postflight / close for the entire consumer Promise
6. Fsync the exact artifacts, perform Darwin exclusive rename, fsync the parent, and reopen / verify final output
7. Restore exact engine / eval assets and run a synthetic real-engine interruption / resume test
8. Only then run the real 24,000 training parents with the fixed 12 engines

Fresh selection remains closed until all three final checkpoints and result receipts strict-load. Fresh and legacy final holdouts remain closed until the static family gate passes.

## 9. Verification snapshot

| Check                          | Result                                     |
| ------------------------------ | ------------------------------------------ |
| targeted adversarial Vitest    | 85/85 PASS (1 file)                        |
| full Vitest                    | 1,586/1,586 PASS (98 files)                |
| Python stdlib suite            | 58/58 PASS                                 |
| TypeScript `tsc --noEmit`      | PASS                                       |
| full ESLint                    | 0 errors / 157 unrelated existing warnings |
| Next.js production build       | PASS (193 pages)                           |
| independent adversarial review | 2/2 CLEAN                                  |

The targeted suite covers fresh / resume state, every protected category, ancestor / descendant overlap, hardlinks / symlinks, path swaps, future engine-argument paths, concurrent / stale leases, typed cleanup that preserves replacements, close-time mutation, `Promise.all` / `Object.prototype.then` / `Array.prototype.push` / inherited `Array.prototype[0]` setter / `RegExp.prototype.exec` / `Error[Symbol.hasInstance]` poisoning, accessor-descriptor rejection for both top-level options and `engineArgs` elements, and bilingual parity. It uses temporary directories and synthetic sentinels only. It does not input the real bundle, training rows, engine search, selection, or final holdout.

## 10. Conclusion

This PR does not yet start the computation that may improve playing strength. It first closes paths through which that computation could appear successful while using a forged stage, aliasing a sealed input, racing another runner, or inheriting a stale lease. The successful receipt only authorizes a private-stage namespace; exactly as its status says, it is neither generated nor published.

The next strength-relevant milestone is a v7 contract containing stable depth-11 proposals plus authenticated durable resume. Running the depth-16 teacher without those boundaries would not produce usable evidence toward stable high-dan strength.
