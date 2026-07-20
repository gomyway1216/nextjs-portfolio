# From the v8 stop to v9: depth-14 proposals with depth-16 scoring

> Status on July 20, 2026. This records the formal v8 teacher stop, real-position depth diagnostics, the fast input path, the 12-vs-14 and 12-vs-13 lane measurements, the v9 runner implementation, and formal-run progress. Formal v9 started locally from clean merge revision `682e5a1dd8027519f2277ec311000bfedf4aced3` and completed the exact 500 milestone. The final 24,000 result, retraining, strength gain, and live promotion are not complete. [日本語版](./blog-shogi-floodgate-strength-first-v9-proposal-rescue.md)

## Conclusion

V8 did not finish 24,000 positions. At 1,388 accounted slots it had 1,383 labeled parents and five proposal-timeout skips. The next position produced only five exact final depth-16 ranks for a requested MultiPV of six, so the run stopped without inventing a partial label. The evaluation function is therefore not stronger yet, and no live weight changed.

V9 separates candidate discovery from exact candidate scoring.

| Work                                 |                    v8 |                        v9 |
| ------------------------------------ | --------------------: | ------------------------: |
| Candidate proposal                   | MultiPV 12 / depth 16 | MultiPV 12 / **depth 14** |
| Independent score for each candidate |              depth 16 |        **still depth 16** |
| Parallelism                          |            12 engines |                13 engines |
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

## Selecting thirteen while rejecting fourteen

We measured rather than assuming that fourteen physical cores imply fourteen engines. Every trial fully labeled the same 42-position prefix using depth-14 proposals and depth-16 independent rescoring. The counterbalanced order was 12 → 14 → 14 → 12, for 168 labels and zero forced skips.

| Parallelism | Measured wall times |   Median |
| ----------- | ------------------- | -------: |
| 12 engines  | 59.672 s, 87.004 s  | 73.338 s |
| 14 engines  | 73.295 s, 86.510 s  | 79.903 s |

Fourteen-lane throughput was 91.784% of twelve-lane throughput, or about 8.216% slower. We therefore measured the intermediate thirteen-lane setting in a separate counterbalanced run. It used the same 42 positions, one thread and 512 MiB hash per engine, the order 12 → 13 → 13 → 12, 168 total labels, and zero forced skips.

| Parallelism | Measured wall times |   Median |
| ----------- | ------------------- | -------: |
| 12 engines  | 90.314 s, 74.878 s  | 82.596 s |
| 13 engines  | 78.288 s, 72.873 s  | 75.581 s |

Thirteen-lane median throughput was 109.2814% of twelve-lane throughput, clearing the predeclared 101% selection threshold. Its median wall time was 8.493% lower. Two short trial pairs do not prove playing strength or the full 24,000-position duration, and the absolute twelve-lane time varied between the two benchmark runs. Within the same run, however, thirteen was faster, while the separate twelve-vs-fourteen run showed fourteen was slower. V9 therefore selects thirteen among the measured twelve-, thirteen-, and fourteen-lane settings.

## Formal v9 completed the exact 500 milestone and continues toward 24,000

The formal run started from clean merge revision `682e5a1dd8027519f2277ec311000bfedf4aced3`. Its observed times are:

| Observation  | Epoch      | Elapsed from start |
| ------------ | ---------: | -----------------: |
| Formal start | 1784539512 |                  0 |
| Milestone 100 | 1784539923 |       411 s (6m51s) |
| Milestone 500 | 1784540513 |    1,001 s (16m41s) |

At milestone 500, target/completed was exactly 500/500, emitted was 500, and forced skips were zero. The `fewer-than-two` and `search-timeout` reason counts were also zero.

At a later monitoring sample, the durable work-entry count had reached 1,003 at 1,705 seconds from launch. This is not an additional formal milestone and does not independently verify 1,003 final labels. It is a monitoring sample of entries durably recorded in the growing work file while the same formal runner continues toward 24,000.

| Runtime resource                  | Observation                |
| --------------------------------- | -------------------------- |
| Location                          | local only                 |
| Engines                           | 13 in parallel             |
| Threads per engine                | 1                          |
| Hash per engine                   | 512 MiB                    |
| Run memory                        | about 9 GiB                |
| Free memory                       | about 50%                  |
| Free storage                      | about 81 GiB               |
| Cloud use / live-weight changes   | 0 / 0                      |

Extrapolating the overall rate through the monitoring sample gave about 10.9 hours remaining, while the post-500 steady rate gave about 8.9 hours. Treating that difference as uncertainty, the current provisional range is **9–11 hours remaining**. This is not a completion-time guarantee; it will be recalculated at the 2,000-work-entry observation.

There is no final 24,000 result and no complete teacher dataset yet. Retraining, candidate selection, formal A/B, and any playing-strength claim therefore remain pending, and the live weight is unchanged.

## What now reaches playing strength

The new runner binds a separate v9 output root, clean Git revision, fast-input policy, the depth-14/depth-16 split, thirteen engines, 512 MiB hash, and typed proposal quarantine into the formal result. It never mixes v8 labels into v9. The formal v9 root was started only from the merged revision.

The remaining path is direct:

1. continue the same formal run to 24,000 and refine the ETA at 2,000 entries;
2. retrain seeds 42, 43, and 44 only after final accounting and input postflight succeed;
3. run candidate selection and sealed holdout evaluation;
4. measure formal paired A/B and external calibration; and
5. promote only a candidate with stable high-dan evidence.

The accurate claim today is: “formal v9 has handled the known v8 stop, removed the long serial input reconstruction, started with the faster measured thirteen-lane configuration, and exactly completed 500 entries with no skips.” It is not yet “the AI is high-dan.”

The aggregate record is available as [machine-readable evidence](./data/floodgate-strength-first-v9-proposal-rescue-2026-07-20.json).
