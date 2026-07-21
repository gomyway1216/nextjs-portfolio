# Formal v8 teacher generation reaches 100 real parents

> At 22:59:48 PDT on July 19, 2026, we launched the formal v8 teacher run locally on the Mac
> from reviewed, normally merged revision
> `400d3e33e8414cf071cbe3cc053e345bdc668ade`. It authenticated the original 24,000-parent
> training input in about 20 minutes 25 seconds, started 12 one-thread YaneuraOu processes
> with 512 MiB Hash each, and completed the first 100 parents at about 23:26. The runner did
> not pause: it automatically continues to 500 and 24,000 with the same input, run
> fingerprint, and `work.jsonl`. This is real teacher-work progress, but it is not evidence
> of a complete dataset, retraining, or improved playing strength. Japanese version:
> [blog-shogi-floodgate-strength-first-v8-milestone-100.md](./blog-shogi-floodgate-strength-first-v8-milestone-100.md)

## Current state

| Item                                          | Evidence at 23:26 PDT on July 19, 2026                 |
| --------------------------------------------- | ------------------------------------------------------ |
| formal v8 launch                              | complete at fixed revision `400d3e33…668ade`           |
| original training-input authentication        | complete: 24,000 parents / 1,000 games / about 20m25s  |
| real teacher milestone 100                    | complete: 100 / 100 parents                            |
| milestone 500                                 | not evidenced by this snapshot; automatic continuation |
| complete 24,000-parent teacher dataset        | not evidenced                                          |
| retraining / candidate selection / formal A/B | 0 / 0 / 0                                              |
| live-weight changes                           | 0                                                      |

Previously, we had implemented the runner and diagnosed the stopped v7 run, but the formal
v8 run had not generated real teacher work. For the first time, the pinned formal v8 runner
has read authenticated real input and durably written 100 real parent groups containing
1,144 child record groups. That means teacher-data generation before training has genuinely
started. However, 100 is only 0.42% of 24,000, and the evaluation function itself has not
changed at this point.

## Independently rechecking the 100-parent prefix

The active `work.jsonl` continues to grow after parent 100, so this publication does not bind
a mutable whole-file SHA. Instead, it cuts out exactly the **first 101 lines** fixed by the
milestone and recomputes their bytes and digest independently from the milestone JSON.

| Verification target                 | Independently recomputed value                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| milestone checkpoint                | 2,338 bytes / SHA-256 `a4442d8c12d459d1769ed86e4f44e3c0247ee1e66983609be151668e0fd556c5`     |
| canonical prefix                    | 1,362,695 bytes / SHA-256 `80b5605869994692b38f50cb56482f77a9e2374a50aebfbe77e7a216509cfb85` |
| JSONL structure                     | one header + 100 parent-group lines = 101 lines                                              |
| parent identity                     | all 100 are unique; values remain private                                                    |
| child record groups                 | 1,144                                                                                        |
| forced skips / search-timeout skips | 0 / 0                                                                                        |
| run fingerprint                     | `7c6a2fadb362bd40a015f76df2849e71dff24650472999599f91b5f67dac9628`                           |

The bytes, SHA, and counts in the checkpoint match the independently extracted prefix. This
binding lets us detect whether that 100-parent prefix changes into different bytes. The
publication includes no raw positions, parent-ID values, candidate moves, secret keys, or
private absolute paths.

## Twelve engines use the CPU after authentication

| Time or resource                        | Observation                          |
| --------------------------------------- | ------------------------------------ |
| runner launch                           | 22:59:48 PDT / 05:59:48 UTC          |
| authentication complete / engines start | about 23:20:13 PDT / 06:20:13 UTC    |
| milestone 100                           | about 23:26:33 PDT / 06:26:33 UTC    |
| launch to 100                           | about 26m45s                         |
| engine start to 100                     | about 6m20s                          |
| search configuration                    | 12 engines × 1 thread × 512 MiB Hash |
| aggregate engine RSS peak               | about 8.17 GiB                       |
| host CPU busy snapshot                  | 99.88%                               |
| memory throttling                       | 0 pages                              |
| power                                   | AC Power                             |

The approximately 20m25s input authentication was dominated by ordered checks and remained
mostly serial. Search then ran 12 processes concurrently on the 14-core machine, reaching
99.88% host CPU use in the observed snapshot. The formal computation uses no AWS,
Firebase/GCP, or Vercel; it runs entirely on this Mac. Rather than filling RAM or disk
arbitrarily, it provides the 12 × 512 MiB search hashes while retaining zero observed memory
throttling.

## What this milestone does not prove

The milestone itself explicitly records `authentication_receipt=false` and
`playing_strength_evidence=false`. The input authentication completed, and the local
100-parent prefix completed, but this checkpoint alone is neither an authentication receipt
nor a playing-strength receipt. The 100-parent prefix cannot be treated as the complete
24,000-parent dataset.

This snapshot makes no completion claim for the 24,000-parent teacher dataset, fixed-seed
42 / 43 / 44 retraining, candidate selection, sealed holdouts, the formal 384-pair /
768-game A/B, external calibration, stable high-dan strength, or live promotion. Live
weights remain unchanged.

## Next strength gates

Without waiting for operator confirmation, the same run advances to 500 and then 24,000.
The next publishable real evidence is a verified milestone 500 and a complete
24,000-parent teacher dataset. Fixed-seed 42 / 43 / 44 retraining, candidate selection,
sealed holdouts, the formal 384-pair / 768-game A/B, and external calibration then follow in
order. Live weights remain unchanged until games demonstrate improvement and every safe
promotion condition is met.

Machine-readable record:
[floodgate-strength-first-v8-milestone-100-2026-07-19.json](./data/floodgate-strength-first-v8-milestone-100-2026-07-19.json)
