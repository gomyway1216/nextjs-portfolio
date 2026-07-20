# Formal v8 accounts for 500 target slots and continues to 24,000

> At 23:48:29 PDT on July 19, 2026, formal v8 teacher generation at pinned revision
> `400d3e33e8414cf071cbe3cc053e345bdc668ade` reached milestone 500. The exact accounting
> is **499 labeled parents + one search-timeout skip = 500 target slots**; it is not 500
> labeled parents. V8 did not eliminate every timeout. It quarantined one timeout without a
> label inside the registered cap, kept the run alive, and automatically continued to
> 24,000 with the same input and fingerprint. This is not evidence of a complete dataset,
> retraining, improved playing strength, or a live-weight change. Japanese version:
> [blog-shogi-floodgate-strength-first-v8-milestone-500.md](./blog-shogi-floodgate-strength-first-v8-milestone-500.md)

## Current state

| Item                                         | Evidence at 23:48:29 PDT on July 19, 2026        |
| -------------------------------------------- | ------------------------------------------------ |
| formal v8 launch                             | complete at fixed revision `400d3e33…668ade`     |
| original training-input authentication       | complete: 24,000 parents / 1,000 games / ~20m25s |
| milestone 100                                | complete: 100 labels / zero skips                |
| milestone 500                                | complete: 499 labels / one timeout skip          |
| accounting progress toward 24,000            | 500 / 24,000 = about 2.08%                       |
| complete 24,000-parent teacher dataset       | not evidenced by this snapshot; auto-continuing  |
| optimizer / candidate selection / formal A/B | 0 / 0 / 0                                        |
| live-weight changes                          | 0                                                |

Since the [100-parent milestone](./blog-shogi-floodgate-strength-first-v8-milestone-100.en.md),
the runner has accounted for 400 additional target slots: 399 labeled parents, one timeout
skip, and 4,605 child record groups. The cumulative totals are 499 labeled parents and 5,749
child record groups. This proves that teacher generation continues over real data, but the
evaluation function itself remains unchanged.

## V8 did not remove timeouts; it continued within the cap

It would be wrong to say that v8 no longer encounters timeouts. V7 observed two timeouts
before reaching 500 target slots. Its registered skip cap was one, so it failed closed
before milestone 500 without saving the second timeout as either a label or a skip.

The formal v8 run also observed a timeout. Because this was the only timeout inside the
500-target prefix, it remained within the same cap of one. The runner explicitly persisted
that parent as a `search-timeout-no-label` skip and counted only the other 499 parents as
labeled.

| Comparison                          | v7                            | Formal v8                         |
| ----------------------------------- | ----------------------------- | --------------------------------- |
| timeouts before 500 target slots    | 2                             | 1                                 |
| registered timeout-skip cap         | 1                             | 1                                 |
| milestone 500                       | incomplete                    | complete                          |
| 500-target accounting               | stopped on the second timeout | 499 labels + one skip             |
| what happened next                  | failed closed                 | automatically continued to 24,000 |
| proves all future timeouts are gone | no                            | no                                |

The improvement is not a relaxed skip cap. With a fresh 512 MiB-Hash v8 run, the timeout
count in this prefix stayed inside the preregistered cap and allowed the 500 gate to pass.
The timeout rules and allowed skip count on the path to 24,000 remain unchanged.

## Independently rechecking the 500-target prefix

The active `work.jsonl` keeps growing after target 500, so this publication does not bind a
mutable whole-file SHA. Instead, it cuts out exactly the **first 501 lines** fixed by the
milestone and recomputes their bytes, digest, and structure independently from the milestone
JSON.

| Verification target       | Independently recomputed value                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| milestone checkpoint      | 2,338 bytes / SHA-256 `d8d5aeae084a16820cca13a3934096014456a24ec3901351a20bebd5927cee27`     |
| canonical prefix          | 6,834,309 bytes / SHA-256 `202310d4e858f15fc768f2680426b1b2a2eb05dde3ea788326b6c3a1e57490f1` |
| JSONL structure           | one header + 499 labeled parents + one skip = 501 lines                                      |
| unique labeled parent IDs | 499; values remain private                                                                   |
| child record groups       | 5,749                                                                                        |
| skip reason               | one `search-timeout-no-label`                                                                |
| run fingerprint           | `7c6a2fadb362bd40a015f76df2849e71dff24650472999599f91b5f67dac9628`                           |

The checkpoint target/completed values are 500/500, but this does not mean all 500 targets
are labeled. Under the runner accounting contract, 499 labeled parent groups plus one forced
skip account for 500. The checkpoint bytes, SHA, and counts match the independently extracted
prefix. This publication includes no raw positions, parent-ID values, candidate moves,
secret keys, or private absolute paths.

## Elapsed time and local resources

| Time or resource                  | Observation                          |
| --------------------------------- | ------------------------------------ |
| runner launch                     | 22:59:48 PDT / 05:59:48 UTC          |
| authentication complete / engines | about 23:20:13 PDT / 06:20:13 UTC    |
| milestone 100                     | about 23:26:33 PDT / 06:26:33 UTC    |
| milestone 500                     | 23:48:29 PDT / 06:48:29 UTC          |
| launch to 500                     | 48m41s                               |
| engine start to 500               | about 28m16s                         |
| 100 to 500                        | about 21m56s                         |
| search configuration              | 12 engines × 1 thread × 512 MiB Hash |
| aggregate engine RSS peak         | about 8.28 GiB                       |
| host CPU busy snapshot            | 99.88%                               |
| memory throttling / power         | 0 pages / AC Power                   |

The formal computation uses no AWS, Firebase/GCP, or Vercel; it runs entirely on this Mac.
Twelve engines use the CPU while observed memory throttling remains zero. Candidate counts
and search duration vary by position, so the speed over these 400 target slots is not
linearly extrapolated into a 24,000-parent completion time.

## What this milestone does not prove

The milestone explicitly records `authentication_receipt=false` and
`playing_strength_evidence=false`. The 500-target prefix is complete, but it is not the
complete 24,000-parent dataset or a playing-strength receipt. Because it includes one timeout,
this publication also does not claim “all 500 targets are labeled” or “v8 eliminated all
timeouts.”

This snapshot does not complete the 24,000-parent teacher dataset, fixed-seed 42 / 43 / 44
optimizer runs, candidate selection, sealed holdouts, the formal 192-pair / 384-game A/B,
external calibration, stable high-dan strength, or live promotion. Live weights remain
unchanged.

## Next strength gates

The runner automatically continues to 24,000 under the same run identity. The next material
evidence is a complete teacher dataset that accounts for every one of the 24,000 target slots
as either a labeled parent or a forced skip within the registered limits. Fixed-seed
42 / 43 / 44 retraining, candidate selection, sealed holdouts, formal 192-pair / 384-game
A/B, and external calibration then follow in order. Live weights remain unchanged until
games demonstrate improvement and every safe promotion condition is met.

Machine-readable record:
[floodgate-strength-first-v8-milestone-500-2026-07-19.json](./data/floodgate-strength-first-v8-milestone-500-2026-07-19.json)
