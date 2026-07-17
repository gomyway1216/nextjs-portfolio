# Preparing Floodgate v7 teacher generation in a home-external clean room

> Before relearning from strong games, teacher inputs, the verifier, and the real engines must be reproducible without touching existing production state or live weights. This first PR adds that preparation boundary: it copies fixed inputs by value, materializes an independent clone of the accepted verifier, and binds real stable WASM plus real YaneuraOu test-core factories. Real private copies, verifier runs, teacher processes, labels, retraining, A/B games, and live activations all remain at zero. Japanese version: [blog-shogi-floodgate-v7-clean-room-teacher-runner.md](./blog-shogi-floodgate-v7-clean-room-teacher-runner.md)

## 1. Why this stage is required

The current label-free role bundle contains 24,000 fixed parents. Combining an old worktree, raw lock, role lock, and assets in place inside a shared home would leave several facts ambiguous:

- which verifier revision ran;
- whether another process changed an input during inspection;
- whether a destination symlink, hard link, or inode alias still shared the source;
- whether a test-only run touched a production lease, registry, control plane, or weight;
- whether the authority gates that advance one authenticated stream through 100, 500, and 24,000 parents remained separate.

Running the teacher faster would not make such output valid retraining or live-weight evidence. This PR is the foundation that lets later work use the machine safely; it is not itself a speed or strength result.

## 2. What this PR fixes

| Item | Fixed binding |
| --- | --- |
| Execution plan | Fixed plan with no caller-supplied path or revision |
| Clean room | Outside the current-EUID home, owner-only `0700` |
| Verifier | Accepted revision `e8a9197608cb48b1160b6707d97b0c4f78f90a1d` |
| Verifier materialization | `--no-local` independent clone, no alternates, and no shared source/destination inode across 1,431 tracked files |
| Inputs | Four trees—raw lock, role lock, role bundle, teacher assets—and one standalone legacy exclusion |
| Stable runtime | Real stable-WASM test-core factory |
| Teacher runtime | Real YaneuraOu USI test-core factory, 12 engines, one thread per engine, depth 16 |
| Capability authority | Separate WeakMap/WeakSet registries for synthetic preparation and the fixed runner |
| Gate order | Durable prefix 100 → durable prefix 500 → sealed final 24,000 |
| Package commands | Zero added |
| Gates executed by this PR | Zero |

The public argumentless inspection checks only these fixed plan conditions. It opens no private source and creates no clean-room entry. The mutating preparation function is not connected to a package script or CLI, so merging this PR alone cannot start a copy or teacher run.

## 3. The copy-by-value boundary

Before copying, the implementation inventories every entry and retains directory identity plus each file's identity, mode, size, and SHA-256. A source must have the current owner, `0700` directories, `0400/0500/0600/0700` files, and one link per file. It fails closed on unsafe names, symlinks, hard links, unsupported nodes, individual files of at least 1 GiB, excessive depth, or entry/total-byte bounds.

The copy uses neither a generic `copyFile` operation nor a filesystem clone. It creates fresh inodes through `O_NOFOLLOW | O_EXCL`, transfers bytes with explicit read/write loops, and normalizes destination modes to `0600/0700`. A complete second inventory proves an unchanged source, byte identity, one destination link, and no source/destination inode alias. Receipts disclose neither paths nor digests.

Because the raw lock contains many small files, each tree now uses a fixed pool of eight file-copy workers. Four trees materialize concurrently, so the copy cores have a combined limit of 32 file workers. Internal I/O from the concurrently running Git verifier clone is not counted or bounded by that counter; 32 is not a bound on all filesystem writes. Once a tree observes its first failure, only that tree stops scheduling new files and drains its started workers. This does not globally cancel the other three trees or the Git clone; the overall failure waits for all five materializations to settle. The partial namespace is preserved for manual reconciliation instead of being automatically deleted.

Per-file `fsync` is not used. The copy receipt does not claim crash durability after power loss, and an existing namespace is never reused as success. Rehashing proves content identity before the process reports success; recovery after a machine crash needs a separate recovery contract.

Source and destination file descriptors are both drained with `allSettled`, even when closing one fails. Parallel materialization and the two verifiers are all deferred before invocation, so a later synchronous dependency throw cannot strand an earlier promise. An asynchronous runtime-factory rejection collapses to a fixed error, and the failed capability cannot be reused.

## 4. Read-only preflight

Only metadata was aggregated; private bytes were not published.

| Inspection | Result |
| --- | ---: |
| Four input trees | 72,717 files / 519 nested directories |
| Four-tree logical bytes | 1,227,490,748 |
| Standalone legacy exclusion | 624,816 bytes |
| Copy-by-value input bytes | 1,228,115,564 |
| Raw lock | 72,698 files / 592,412,617 bytes |
| Unsafe names / modes / links / node types | 0 / 0 / 0 / 0 |
| Maximum source file | Below 1 GiB |
| Accepted verifier | Exact `e8a9197`, clean, 1,431 tracked files |
| Independent-clone smoke | PASS, 4,313.462 ms, temporary clone removed |
| Capacity preflight | PASS |
| Minimum free space to fix in PR2 | 20 GiB |

Tracked evidence publishes no exact free-space value, utilization, home, or volume name. The runtime gate in PR2 must likewise reveal only whether at least 20 GiB is available, never the measured capacity.

## 5. Synthetic 1,000-small-file benchmark

The benchmark copied 1,000 identical one-byte files and included both complete hash/metadata inventories. Limits 1 and 8 were alternated and measured three times each.

| Limit | Elapsed milliseconds | Three-run median |
| ---: | --- | ---: |
| 1 | 627.608 / 650.036 / 595.691 | 627.608 |
| 8 | 537.238 / 588.452 / 515.862 | 537.238 |

The median ratio was 1.168x. This is a local synthetic small-file result, not a prediction for the 72,717-file private copy, general SSD performance, or teacher-generation time. Its useful result is narrower: the sequential file loop is no longer left as an avoidable bottleneck, while bounded concurrency and failure draining remain enforced.

## 6. Do not open all gates at once

This PR fixes only the names and ordering of three gates; it executes none.

1. 100 parents: validate runtime wiring, output schema, shutdown/reaping, and safe receipts.
2. 500 parents: measure throughput, tails, checkpoint resume, and resource bounds.
3. 24,000 parents: exactly resume the 500-parent prefix in the same authenticated V3 stream and seal at 24,000.

The V3 protocol does not create separate work files for 100, 500, and 24,000 parents. One authenticated stage/work stream retains the 100- and 500-parent durable milestones; the next gate verifies that exact prefix and appends only the missing continuation. Each gate capability and lease is nevertheless a distinct single-use authority, and the next gate cannot start until the previous gate has cleaned up. The 100- and 500-parent prefixes are neither published nor finalized; only the sealed final may reach the label finalizer. Completing 24,000 labels would still not authorize retraining or a live weight. Label projection, training, candidate selection, formal A/B, and external calibration remain separate gates.

## 7. Why this is split into two PRs

| Boundary | This PR | Next PR |
| --- | --- | --- |
| Copy by value / verifier clone | Implemented and tested synthetically | Invoked by the fixed runner |
| Real stable / YaneuraOu factory binding | Implemented with synthetic handoff | Owned by a native launcher |
| 20 GiB capacity gate | Requirement fixed | Argumentless preflight implemented |
| Key / stage / checkpoint connector | Not connected | Resumes one authenticated stream through 100 → 500 → 24,000 under three one-shot authorities |
| Signal / recovery / finalizer | Not connected | Implemented with fault injection |
| Private copy / teacher labels | Zero | Only after merge, CI, and review |

Keeping the operator command out of PR1 makes the copy and runtime binding independently reviewable. PR2 must single-use-claim this preparation capability and create a clean-room-specific owner that does not connect to the existing production lease, registry, or control plane.

A capability issued by test-injected preparation is absent from the fixed-runner registry, so the fixed claim rejects it; that wrong-registry lookup does not consume the valid test claim. The reverse direction is rejected symmetrically by the separate registry. A same-shaped receipt or spread copy carries no authority.

## 8. Time outlook

The accepted full role-bundle verifier measured 1,045.52 seconds, with a confirmation run at 1,089.52 seconds. A historical WCSC36 run processed 3,112 parents in 5,354.31 seconds; simple scaling gives about 11.47 hours for 24,000 parents. Floodgate position distribution, stable-runtime tails, and checkpoint overhead differ, so this is an initial reservation estimate rather than a completion forecast. The 100- and 500-parent gates must replace it with direct measurements.

## 9. Current conclusion

This PR has not made the evaluation function stronger. It provides a reviewable copy, verifier, and runtime-binding boundary from which a 24,000-parent teacher run can start without sharing production state or live weights.

- Private copies: 0
- Verifier runs on copied private data: 0
- Teacher processes / labels: 0 / 0
- Training / candidate selection: 0 / 0
- Formal A/B / external calibration: 0 / 0
- Live weight changes / activations: false / 0

The next step is to close CI and independent review for this PR, then implement the 20 GiB gate, native launcher, ordered one-shot 100/500/24,000 checkpoint authorities over the same stream, signal/recovery handling, and finalizer in a separate PR. Live weights remain unchanged until the evidence chain is complete.

Machine-readable evidence: [floodgate-v7-clean-room-teacher-runner-2026-07-17.json](./data/floodgate-v7-clean-room-teacher-runner-2026-07-17.json)
