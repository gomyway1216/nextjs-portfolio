# Measuring the v7 checkpoint with a semantically valid 24,000-parent stream

> The [incremental checkpoint scanner](./blog-shogi-floodgate-v7-incremental-checkpoint-scan.en.md) removed scanner-specific buffers that grew with file size by using a 64 KiB read chunk and a 24,576-byte line buffer. The previous PR's maximum-boundary check used a sparse file, not a semantically valid 24,000-parent stream with candidate sets and an HMAC chain. This PR sends only holdout-free synthetic parents through the merged test-only checkpoint core and measures stream bytes, digests, read bounds, wall time, child-process RSS, and resume / final agreement. It is not evidence of real teacher labels, a production coordinator, training, matches, or playing strength. Japanese version: [blog-shogi-floodgate-v7-valid-24k-scan-load.md](./blog-shogi-floodgate-v7-valid-24k-scan-load.md)

---

## Current conclusion

| Target                    | State                             | What this PR verifies                                       |
| ------------------------- | --------------------------------- | ----------------------------------------------------------- |
| Bounded test-only scanner | Implemented and merged            | Reuse the existing `CoreForTests` entry point unchanged     |
| 100 / 1,000 parents       | Preliminary measurements complete | Confirm that the fixture and measurement procedure work     |
| Valid 24,000 parents      | Running                           | Confirm actual bytes, SHA-256, RSS, and time                |
| Real Floodgate labels     | Not run                           | Wait for timeout, key authority, and coordinator boundaries |
| Weight / live environment | Unchanged                         | Keep the current weight as the rollback baseline            |

## 1. The theoretical ceiling and a valid load are different evidence

The checkpoint's maximum file size is 589,897,154 bytes. This is a conservative rejection ceiling in which all 24,002 lines are 24,576 bytes, not a prediction that an ordinary 24,000-parent file will be that large.

The previous PR confirmed that a sparse exact-cap file reaches bounded reading and that cap plus one byte is rejected before any read. That check is necessary for the large-allocation boundary, but it does not measure the cost of validating JSON, canonical bytes, HMACs, parent order, and candidate evidence.

This run therefore uses a separate fixture in which every parent has a candidate set and rescore evidence and the merged test-only state machine processes the header, 24,000 parents, and seal. The theoretical ceiling and semantically valid stream remain separate, with explicit claims for what each proves.

## 2. Synthetic parents without opening holdout

The fixture deterministically selects rules-complete legal moves from the standard initial position to create parent occurrences. States that would capture a king or have fewer than 14 legal moves are excluded. Every accepted parent is non-forced; the first 12 proposal moves, played move, and stable move are mutually distinct, and the union builder itself asserts exactly 14 candidates for every parent.

These records use test game IDs, parent IDs, position IDs, runtime receipts, and a test root key. No fresh-selection, fresh-final, or legacy-final path, reader, or key exists in either the harness API or child process. No real Floodgate row is read.

The harness does not inflate the count by copying one parent ID. Every parent is unique, and the test-only core's verifier compares the training binding's parent order with each checkpoint entry's `input_index` and `sequence`.

## 3. Separate generation from verification

The normal checkpoint writer calls `fsync` for every parent. Repeating that operation 24,000 times while constructing a synthetic fixture would primarily measure disk latency in fixture creation instead of the scanner.

A dedicated isolated child disables the work file's `FileHandle.sync` only during the fresh build and restores the native method afterward. The fresh receipt is never accepted as durability evidence. The child synchronizes the work file and stage directory after restoration, then exits.

A separate clean child then resumes the same sealed file with a missing-parent producer that throws if called. This run uses native `fsync` and the existing test-only incremental scanner and passes through the `resumable-prefix` scan, sealed reuse, and `sealed-final` scan. The generation shortcut therefore cannot remain active in the verification child.

## 4. Compare three digests of the same bytes

The harness obtains SHA-256 from three independent paths.

1. A digest calculated from the file after the fresh build
2. The work digest returned by the resume receipt
3. A digest independently streamed outside the scanner

The run fails unless all three match. The external stream counter's JSONL line count must be `parents + header + seal`; this is distinct from receipt `work.records`, which counts only parents. Every parent must have exactly 14 candidates, the maximum line must be at most 24,576 bytes, and the largest request observed by the read hook must be at most 65,536 bytes.

It also fails if the producer is called even once during resume. This demonstrates that all 24,000 parents were reused as an authenticated sealed stream without requesting another search.

## 5. Measuring RSS and time

Fresh generation and resume scanning run in separate children. The harness records the OS-reported process-lifetime peak RSS, `process.memoryUsage().rss` immediately before and after the checkpoint call, and each scan's wall time. The scan child also constructs and retains a synthetic training binding proportional to parent count, so these values are not called scanner-specific RSS.

The machine is an Apple M4 Pro with 14 physical / logical CPU cores, 51,539,607,552 bytes of RAM, and macOS 15.1. The runtime is pinned to the repository-required Node v22.13.0.

Child RSS and file bytes are reported across 100, 1,000, and 24,000 parents as operational observations, but their ratio is not used as proof of scanner-specific memory. Structural acceptance instead requires read requests at or below 65,536 bytes, lines at or below 24,576 bytes, and no scanner array retaining the full file. Node heap, authenticated training rows, and the parsed object for one JSON line remain, so this report does not claim that the entire process is O(1) in memory.

## 6. Preliminary measurements and the confirmed 24,000-parent slot

The following values are preliminary prototype measurements, not the final load result for the committed source.

| Parents |   File bytes | Prefix wall ms | Final wall ms | Scan-child maxRSS (decimal MB) | Digest                             |
| ------: | -----------: | -------------: | ------------: | -----------------------------: | ---------------------------------- |
|     100 |    1,772,797 |            296 |           338 |                          148.6 | Fresh / resume / independent match |
|   1,000 |   17,956,845 |          3,050 |         3,155 |                          199.6 | Fresh / resume / independent match |
|  24,000 | Not measured |   Not measured |  Not measured |                   Not measured | Not measured                       |

The simple proportional projection was about 430,964,280 bytes, 73–76 seconds per scan, and 7.2 minutes for the full procedure. It is 14,779,126 bytes, or 3.551%, above the older one-fixture projection of 416,185,154 bytes, an upward revision caused by fixture differences. It is used only for capacity planning and is not mixed with measurements. After the 24,000-parent completion, this table will be updated with confirmed values from the same source SHA, a 64-hex digest, reproduction command, and evidence path.

## 7. Acceptance criteria

A valid 24,000-parent run needs more than process exit zero. It must satisfy every condition below.

- Verify exactly 24,000 unique parents and exactly 336,000 candidate records
- Confirm 24,002 JSONL lines for header + parents + seal with an external stream counter, distinct from 24,000 parent records in the receipt
- Match fresh, resume, and independent SHA-256
- Make zero resume producer calls
- Accept the same sealed bytes under resumable-prefix and sealed-final scans
- Keep read requests at or below 65,536 bytes and lines at or below 24,576 bytes
- Preserve observed file bytes, maximum line, both scan wall times, and peak RSS
- Preserve before / after checkpoint RSS and process-lifetime maxRSS as observations without calling them proof of scanner-specific memory

Fast CI runs the 100-parent contract on every change. The multi-minute 24,000-parent load remains an explicit standalone command instead of extending CI timeouts to rebuild a large fixture on every push.

## 8. Claim boundary

This load test can show only that the merged test-only scanner core revalidates the maximum synthetic but semantically valid parent count with bounded reads while preserving digest, order, HMAC, resume, and seal consistency. It does not demonstrate connection to a production coordinator.

It runs no teacher engine, obtains no teacher cp / mate / PV, and creates no training JSONL, weight checkpoint, A/B result, or 81Dojo rating. It does not change the live weight. It therefore makes zero claim that the evaluation function became stronger or reached stable high-dan strength.

The next change implements producer timeout / cancellation v2 and closes the boundary for reaping engine processes after failure. Deployment key authority, the training-only finalizer, the zero-argument coordinator, and the 100-to-500-parent pilot follow.
