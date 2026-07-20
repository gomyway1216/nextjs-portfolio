# From the v8 stop to v9: depth-14 proposals with depth-16 scoring

> Status on July 20, 2026. This records the formal v8 teacher stop, real-position depth diagnostics, the fast input path, the 12-vs-14 lane measurement, and the v9 runner implementation. The formal v9 teacher, retraining, strength gain, and live promotion are not complete. [日本語版](./blog-shogi-floodgate-strength-first-v9-proposal-rescue.md)

## Conclusion

V8 did not finish 24,000 positions. At 1,388 accounted slots it had 1,383 labeled parents and five proposal-timeout skips. The next position produced only five exact final depth-16 ranks for a requested MultiPV of six, so the run stopped without inventing a partial label. The evaluation function is therefore not stronger yet, and no live weight changed.

V9 separates candidate discovery from exact candidate scoring.

| Work                                 |                    v8 |                        v9 |
| ------------------------------------ | --------------------: | ------------------------: |
| Candidate proposal                   | MultiPV 12 / depth 16 | MultiPV 12 / **depth 14** |
| Independent score for each candidate |              depth 16 |        **still depth 16** |
| Parallelism                          |            12 engines |                12 engines |
| Hash                                 |      512 MiB / engine |          512 MiB / engine |
| Per-search bound                     |           600 seconds |               600 seconds |

This does not reduce the depth used for training scores. Only the first search that builds the candidate set becomes shallower. Every proposed candidate is still rescored independently at depth 16.

## Why depth 14

We privately reran the five v8 timeout positions, the position that stopped v8, and six completed positions with similar legal-move counts. No position, parent identity, or move is public.

| Diagnostic                                          | depth 14 | depth 15 |
| --------------------------------------------------- | -------: | -------: |
| Completed                                           |  11 / 12 |  11 / 12 |
| Timeouts                                            |        0 |        0 |
| Incomplete MultiPV                                  |        1 |        1 |
| Median old depth-16 top-12 recall on six references |  91.667% |  91.667% |
| Median proposal nodes relative to old depth 16      |  31.411% |  51.278% |

Both depths completed all five former timeout cases. The remaining case returned only five of six exact ranks at both depths, so merely spending longer did not repair that failure class.

In a follow-up, the independently depth-16-rescored best move was contained in the depth-14 proposal set for all 6 / 6 reference positions. The sample is too small to prove equal playing strength, but depth 15 used about 1.66–1.88 times the median nodes of depth 14 without improving best-move containment in this check. V9 therefore selects depth 14.

Only a proposal-phase incomplete result can become a typed, unlabeled `proposal_incomplete_no_label` skip. Its allowance is shared with timeouts under the unchanged recoverable-skip cap. An incomplete depth-16 independent rescore remains fatal.

## Replacing long one-core input reconstruction with a 3.7-second load

The old entry path reconstructed and verified the entire role allocation from source data before each teacher run. That remains useful for offline reproduction, but it does not need to block every teacher start.

The fast input boundary instead:

- pins the manifest and training bytes;
- reads through held `O_NOFOLLOW` descriptors;
- validates every one of the 24,000 JSON, SFEN, move, and identity relationships with the existing parser;
- never opens holdout or selection files;
- repeats the same validation after teacher work and requires exact manifest/source identity equality; and
- commits `result.json` last, only after equality.

The real 24,000-row load took about 3.70 seconds. The runner does not keep a file descriptor open for the multi-hour teacher run. It holds the frozen validated rows in memory, then rereads the same pinned input afterward. A mid-run input change therefore prevents result publication.

## Twelve engines beat fourteen

We measured rather than assuming that fourteen physical cores imply fourteen engines. Every trial fully labeled the same 42-position prefix using depth-14 proposals and depth-16 independent rescoring. The counterbalanced order was 12 → 14 → 14 → 12, for 168 labels and zero forced skips.

| Parallelism | Measured wall times |   Median |
| ----------- | ------------------- | -------: |
| 12 engines  | 59.672 s, 87.004 s  | 73.338 s |
| 14 engines  | 73.295 s, 86.510 s  | 79.903 s |

Fourteen-lane throughput was 91.784% of twelve-lane throughput, or about 8.216% slower. The extra hash memory, memory-bandwidth pressure, and scheduling contention did not pay back, so v9 keeps twelve engines. Cleanup left zero engines, zero disposable directories, zero throttled pages, and no thermal or performance warning.

## What now reaches playing strength

The new runner binds a separate v9 output root, clean Git revision, fast-input policy, the depth-14/depth-16 split, twelve engines, 512 MiB hash, and typed proposal quarantine into the run fingerprint and final result. It never mixes v8 labels into v9. The formal v9 root has not been written by unmerged code.

The remaining path is direct:

1. pass review and CI on a ready PR, then merge normally;
2. launch the 24,000-parent teacher from the clean merge SHA with `npx tsx ml/run-floodgate-strength-first-v9-teacher.ts`;
3. retrain seeds 42, 43, and 44;
4. run candidate selection and sealed holdout evaluation;
5. measure formal paired A/B and external calibration; and
6. promote only a candidate with stable high-dan evidence.

The accurate claim today is: “the implementation can start formal v9 with the known v8 stop handled, the long serial input reconstruction removed, and the faster measured twelve-lane configuration.” It is not yet “the AI is high-dan.”

The aggregate record is available as [machine-readable evidence](./data/floodgate-strength-first-v9-proposal-rescue-2026-07-20.json).
