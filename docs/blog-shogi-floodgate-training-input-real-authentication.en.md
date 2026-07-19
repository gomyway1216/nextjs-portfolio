# Real authentication of the 24,000 Floodgate training parents

> On July 19, 2026, the original training role bundle was actually verified with the fixed
> verifier revision `e8a9197608cb48b1160b6707d97b0c4f78f90a1d`. The run authenticated
> 24,000 parent positions from 1,000 games and completed its callback, post-callback
> filesystem recheck, and descriptor closure in 1,088.743 seconds. This proves that the input
> can enter teacher generation. New completed teacher datasets, training, candidate weights,
> A/B games, and live changes remain zero. Japanese version:
> [blog-shogi-floodgate-training-input-real-authentication.md](./blog-shogi-floodgate-training-input-real-authentication.md)

## Measured result

| Item                                                              |       Measurement |
| ----------------------------------------------------------------- | ----------------: |
| authenticated training parents                                    |            24,000 |
| source games                                                      |             1,000 |
| callback reached                                                  | 1,088.742 seconds |
| completion including post-callback recheck and descriptor closure | 1,088.743 seconds |
| exit                                                              |                 0 |
| new completed or published teacher datasets                       |                 0 |
| optimizer runs / A/B games / live changes                         |         0 / 0 / 0 |

Under Node v22.13.0, the read-only run verified the fixed raw lock, role lock, role bundle,
replay exclusion, and all 24,000 training rows. No private absolute path, file descriptor,
device/inode value, position, or identifier digest was placed in public output. It used no
AWS, Firebase/GCP, Vercel evaluator compute, runtime network, or live evaluator path.
The API used for this run does not mint a formal postflight receipt, but its filesystem
recheck and descriptor closure completed before the successful return.

A prior stopped v7 attempt preserves three authenticated parent records. They are not a
completed dataset, and this input-authentication run generated no new labels.

## Why all 14 cores were not used by this step

Most of the 18 minutes is the existing ordered full-bundle verifier, not parsing 24,000 rows.
It validates 36,349 raw receipts, including 36,168 CSA receipts, through four ordered passes:
145,396 receipt-validation operations in total. A measured equivalent run averaged about
1.07 CPU cores, peaked near 5.63 GB RSS, used no swap, and performed zero block input/output
operations. More of the available 48 GiB RAM or SSD capacity therefore cannot accelerate
this single invocation. Running duplicate verifiers in parallel only repeats the same work.

The material optimization is to avoid authenticating separately at 100, 500, and 24,000.
Three exact measured passes would take about 54.44 minutes. Advancing all milestones inside
one authenticated callback costs about 18.15 minutes, saving about 36.29 minutes.

## Strength-first next step

The stable-WASM depth-11 candidate caused a real 600-second timeout. The existing v6 teacher,
however, already provides YaneuraOu MultiPV 12, the strong game's played move, independent
MultiPV-1 / `searchmoves` depth-16 rescoring of every unique candidate, 12-engine parallelism,
and durable `work.jsonl` resume.

The next change connects that v6 teacher to this authenticated training input without
regenerating the many v7 identities. One callback will durably record the 100, 500, and
24,000 milestones, with intermediate data published from the first 100 onward. `runOp1` and
the live weights remain unchanged until three-seed training, selection/final holdouts, and
formal A/B all pass.

Machine-readable record:
[floodgate-training-input-real-authentication-2026-07-19.json](./data/floodgate-training-input-real-authentication-2026-07-19.json)
