# Measuring the v7 checkpoint with a semantically valid 24,000-parent stream

> The [incremental checkpoint scanner](./blog-shogi-floodgate-v7-incremental-checkpoint-scan.en.md) removed scanner-specific buffers that grew with file size by using a 64 KiB read chunk and a 24,576-byte line buffer. The previous PR's maximum-boundary check used a sparse file, not a semantically valid 24,000-parent stream with candidate sets and an HMAC chain. This PR sends only holdout-free synthetic parents through the merged test-only checkpoint core and measures stream bytes, digests, read bounds, wall time, child-process RSS, and resume / final agreement. It is not evidence of real teacher labels, a production coordinator, training, matches, or playing strength. Japanese version: [blog-shogi-floodgate-v7-valid-24k-scan-load.md](./blog-shogi-floodgate-v7-valid-24k-scan-load.md)

---

## Current conclusion

| Target                    | State                             | What this PR verifies                                       |
| ------------------------- | --------------------------------- | ----------------------------------------------------------- |
| Bounded test-only scanner | Implemented and merged            | Reuse the existing `CoreForTests` entry point unchanged     |
| 100 / 1,000 parents       | Preliminary measurements complete | Confirm that the fixture and measurement procedure work     |
| Valid 24,000 parents      | Local measurement complete        | Revalidated 24,000 parents and 429,244,881 bytes            |
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

## 6. Keep preliminary and confirmed values separate

The following values are implementation-prototype references, not Attempt 3 acceptance evidence. The 100- and 1,000-parent file bytes also differ from the final harness / source, so they are not mixed into the confirmed 24,000-parent table.

| Prototype parents | File bytes | Prefix wall ms | Final wall ms | Child maxRSS (decimal MB) |
| ----------------: | ---------: | -------------: | ------------: | ------------------------: |
|               100 |  1,772,797 |            296 |           338 |                     148.6 |
|             1,000 | 17,956,845 |          3,050 |         3,155 |                     199.6 |

The preregistered proportional projection was 430,964,280 bytes, about 73–76 seconds per scan, and about 7.2 minutes for the full procedure. It was 14,779,126 bytes, or 3.551%, above the older one-fixture projection of 416,185,154 bytes, an upward revision caused by fixture differences. Attempt 3 measured 429,244,881 bytes, 1,719,399 bytes or 0.399% below the newer projection. The prediction remains unchanged so that the difference records prediction accuracy.

## 7. Preserve all three attempts

Two runs stopped before a complete result. Neither contributes partial measurements; only the discoveries and cleanup observations are retained.

| Attempt | Source    |     Wall | Result                                                                                                        | Acceptance |
| ------: | --------- | -------: | ------------------------------------------------------------------------------------------------------------- | ---------- |
|       1 | `d5eb700` |   4.05 s | The canonical URL verifier rejected a fixture timestamp defect that encoded game counter `60` as `00:00:60`   | Rejected   |
|       2 | `3ac84a6` |  82.81 s | The operator stopped the build child to fix runtime-test compatibility across package-supported Node versions | Rejected   |
|       3 | `7844ea4` | 440.70 s | Exit 0, strict result JSON, unchanged source, and zero temporary roots                                        | Accepted   |

Attempt 1 never reached the scanner. The fix splits the counter into HH / MM / SS and locks 0, 59, 60, 3,599, 3,600, 86,399, and rejection of 86,400 into a regression test. Attempt 2 was an intentional stop, not a load failure. Neither run's RSS, partial bytes, nor time is used for throughput or the 24,000-parent result. Both had zero new `floodgate-v7-scan-load-*` temporary roots after exit.

## 8. Confirmed Attempt 3 evidence

The raw record is preserved in the [audit JSON](../ml/protocols/floodgate-v7-valid-24k-scan-load-7844ea4-result.json). The evidence file's SHA-256 is `7fc84e5e6168859d1bdcb0d352839725fe53a1dc8994ea34b7b44bb3b20eda58`.

| Identity        | Confirmed value                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Source commit   | `7844ea49f9e0326a5531824d7e356d6d51726d58`                                                             |
| Harness SHA-256 | `d1debecd249f70c36f5a0b72f653f1de1764f22022f7864fd1baa68a078485ff`                                     |
| Reproduction    | `npm run shogi:floodgate-v7-checkpoint-scan-load -- --parents 24000`                                   |
| Runtime         | Parent / build child / scan child all Node v22.13.0 on darwin arm64                                    |
| Machine         | Apple M4 Pro, 14 physical / logical cores, 51,539,607,552 bytes RAM, macOS 15.1 (24B2082)              |
| Lifecycle       | Started 2026-07-13 09:23:30 UTC, 440.70 seconds, post-run verify 09:31:14 UTC, exit 0, zero temp roots |

The finish timestamp itself was not captured, so this report does not fabricate one by adding 440.70 seconds to the start. `09:31:14 UTC` is the source / cleanup reverification time, not the finish time.

| Valid stream                                  |                                                    Confirmed value |
| --------------------------------------------- | -----------------------------------------------------------------: |
| Parents / games / derived candidate instances |                                              24,000 / 67 / 336,000 |
| JSONL lines                                   |                            24,002 = header + 24,000 entries + seal |
| Actual bytes                                  |                                     429,244,881 bytes (409.36 MiB) |
| Actual / receipt / independent SHA-256        | `055e50c0f783894c4819e503574db4e45577ccac669d04408189f4e8ec781d13` |
| Header / entry total / seal bytes             |                                          2,551 / 429,217,823 / 505 |
| Entry min / mean / max                        |                                     17,345 / 17,884 / 18,451 bytes |
| Maximum line / bound                          |                                              18,451 / 24,576 bytes |
| Producer / completed / resumed                |                                                0 / 24,000 / 24,000 |

The LF-inclusive arithmetic is exact: `2,551 + 429,217,823 + 505 + 24,002 = 429,244,881`. The public JSON explicitly carries identical receipt and independent SHA values; the strict parent validator also checks the fresh-build digest before issuing the result. The fresh receipt itself is not public evidence.

| Native scan observation |                  Resumable-prefix |                 Sealed-final |
| ----------------------- | --------------------------------: | ---------------------------: |
| Calls                   |                             6,550 |                        6,550 |
| Bytes                   |                       429,244,881 |                  429,244,881 |
| Maximum request         |                            65,536 |                       65,536 |
| Phase envelope          | Prefix start→final start 76.284 s | Final start→receipt 76.526 s |

The complete checkpoint call took 157.760 seconds and the external independent SHA took 0.238 seconds. The phase envelopes contain verification around each scan and therefore are not called pure scan time.

| RSS observation                |   Raw bytes | Decimal MB |
| ------------------------------ | ----------: | ---------: |
| Before scan checkpoint         | 190,857,216 |    190.857 |
| After scan                     | 235,749,376 |    235.749 |
| Sampled peak                   | 386,564,096 |    386.564 |
| Scan-child process max         | 386,646,016 |    386.646 |
| Full-command / build-child max | 554,876,928 |    554.877 |

RSS includes the training binding and Node heap. These values are a single-machine observation and internal consistency check, not scanner-only memory, a pass threshold, or proof of O(1) scaling.

The fresh build suppressed 24,002 regular-file sync calls to shorten fixture construction, restored the native method, and then batch-synced the work file and stage once each. The build checkpoint took 277.722 seconds. Its receipt is non-evidence and this is not a power-loss durability test. Only the separate child's native-sync resume / final scans count as scan evidence.

## 9. Acceptance criteria

Attempt 3 satisfied every condition below in addition to process exit zero.

- Exactly 24,000 unique parents and a derived 336,000 candidate instances
- 24,002 externally counted JSONL lines kept distinct from 24,000 parent records in the receipt
- Matching actual / receipt / independent SHA-256 plus the internal fresh-build match
- Zero resume producer calls and 24,000 completed / resumed parents
- Both policies accepted exactly 429,244,881 bytes in 6,550 bounded reads each
- Maximum read 65,536 bytes and maximum line 18,451 bytes
- Consistent line-byte arithmetic, read-call arithmetic, timing, and RSS relationships
- Unchanged source commit / harness SHA before and after the run, clean worktree, and zero temp roots

Fast CI runs only the 100-parent contract; the 24,000-parent load remains a standalone evidence command. All 6 tests pass on pinned Node v22.13.0. On another runtime, only the three evidence-generation tests skip while the pure parser / URL / pinned-evidence contract tests continue.

## 10. Claim boundary

This load test can show only that the merged test-only scanner core revalidates the maximum synthetic but semantically valid parent count with bounded reads while preserving digest, order, HMAC, resume, and seal consistency. It does not demonstrate connection to a production coordinator.

It runs no teacher engine, obtains no teacher cp / mate / PV, and creates no training JSONL, weight checkpoint, A/B result, or 81Dojo rating. It does not change the live weight. It therefore makes zero claim that the evaluation function became stronger or reached stable high-dan strength.

The next change implements producer timeout / cancellation v2 and closes the boundary for reaping engine processes after failure. Deployment key authority, the training-only finalizer, the zero-argument coordinator, and the 100-to-500-parent pilot follow.
