# Shogi evaluator: amending the formal A/B to 384 pairs / 768 games before results

> This change executes no matches. It preserves the original fresh sibling plan and v1 registry byte-for-byte and adds an explicit downstream amendment while the formal A/B count is zero, no candidate has been selected, and no artifacts are enrolled. Execution, result reading, promotion, and production-weight writes remain closed. Japanese version: [blog-shogi-floodgate-formal-paired-ab-protocol-v2.md](./blog-shogi-floodgate-formal-paired-ab-protocol-v2.md)

## Conclusion

The original plan's 192 color-swapped pairs / 384 games will not be executed. Rather than silently rewriting an unexecuted v1, this change adds a [pre-result amendment](../ml/protocols/floodgate-q1-2026-formal-paired-ab-v2-amendment.json) that binds its exact identity, zero observations, and the complete v2 decision rule, then preregisters a separate v2 schema.

V2 fixes these conditions:

- 384 unique openings, one candidate-sente and one candidate-gote game per opening, for 768 games total
- no statistical early success, early failure, or adoption decision from valid partial pairs
- only an exact 384-pair / 768-game run with zero technical faults is analyzable
- a technical fault is not a playing-strength loss; it immediately invalidates and stops the run and cannot be erased by a retry within that run
- resample 384 pairs 100,000 times with `random.Random(20260710)`
- use sorted replicate 5,000 as the one-sided 95% lower bound and 2,500 as the two-sided 95% lower bound
- safety requires the one-sided lower bound to be strictly above 45%
- “stronger than stable” requires the two-sided lower bound to be strictly above 50%
- every candidate/stable experiment has an append-only attempt ledger and at most two attempts
- a second attempt requires technical-fault authorization recorded before any result is unblinded; a second fault ends the candidate experiment without a strength conclusion

Even a passing analysis is not promotion authority. The promotion validator always fails with `production remains STOP`.

## V1 was not silently changed

The original [fresh sibling plan](../ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json) fixes 192 pairs / 384 games. V2 therefore does not pretend to be the unchanged original plan.

The pre-result records are pinned as follows; the final row is pinned by the validator rather than self-referenced from the amendment:

| Artifact                    |  Bytes | SHA-256                                                            |
| --------------------------- | -----: | ------------------------------------------------------------------ |
| Original fresh sibling plan | 10,890 | `ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af` |
| Original v1 closed registry |  1,642 | `79e5b559c7d58bc5facec207bcc26813c2e797ff27f95068eea8b4110e10de50` |
| Pre-result v2 amendment     |  4,459 | `3ce939d40e011503f2ab27db235de8ad144322a876f1cfcfdcea5b17b8d2157c` |
| Current closed v2 registry  |  3,480 | `fbd3f8c87a046a5d5f448106434aca4861a85056d48512194818860b7e9c39b9` |

The amendment-chain validator verifies the original plan, v1 registry, and amendment by bytes, SHA-256, and schema. The closed-registry validator separately pins the current v2 registry's exact bytes and SHA-256 and then requires that chain. The amendment itself contains the full seed, ranks, thresholds, completion rule, and cross-run fault policy, so its SHA-256—not a mutable registry path—is the canonical decision-rule identity. V2 refuses its registry if the v1 registry is missing, changes by one byte, or opens a gate. This change does not edit the v1 analyzer, tests, article, evidence, registry, or original plan.

At amendment time, no fresh candidate had been selected, candidate-weight and upstream-receipt enrollments were zero, v1 A/B observations were 0 pairs / 0 games, external calibration was zero games, and live weights were unchanged. This is not a sample-size increase made after seeing results.

## What 384 pairs means—and does not mean

A pair score bounded from zero to one has variance at most 0.25. The planning-only normal approximation

`1.96 × sqrt(0.25 / n)`

gives a two-sided 95% half-width of about `0.07073` for 192 pairs and `0.05001` for 384 pairs. V2 adopts that approximately five-percentage-point planning scale.

It does not imply any of the following:

- a guarantee that half-width is at most 5.000 points
- a power guarantee for detecting a true five-point improvement
- the realized bootstrap interval width
- a conversion to Elo or human rank

The formal decision does not use the normal approximation. It uses only the actual fixed-seed paired-bootstrap lower bounds after all 384 pairs finish. The realized interval width remains data-dependent.

## Technical faults and stopping

“Do not declare early failure from valid partial results” is different from “continue after a technical fault.”

- As 100 or 200 valid pairs accumulate, their interim score cannot drive adoption.
- An engine crash, timeout, protocol violation, or other technical fault defined by the future match binding immediately invalidates and stops that run.
- That stop is not counted as evidence that the candidate is weak.
- A game cannot be replaced or retried under the same run ID to erase the fault.
- The faulted attempt, its fault evidence, and its partial-result identity remain in an append-only experiment ledger.
- A maximum of one new run may be authorized, and that authorization must be immutable before any result from the faulted attempt is unblinded.
- A second technical fault ends the experiment without a strength conclusion; the same candidate cannot receive a third attempt.

The current v2 result decoder additionally binds exact experiment ID, run ID, attempt index, attempt-ledger SHA-256, and—only for attempt 1—the rerun-authorization SHA-256. It analyzes only `run_status: "complete"`, exactly 384 pairs, 768 unique game IDs, and `technical_fault_count: 0`. It produces no strength report from a partial or faulted run.

This PR does not implement the append-only store, result blinding, or rerun authority. Those missing operational controls keep execution and promotion closed; the fields and policy here are the preregistered contract that a later match binding must prove.

## Strict result and paired bootstrap

Before analysis, a v2 result must satisfy all of these:

1. exact original-plan path / bytes / SHA-256 / schema
2. exact amendment SHA-256
3. distinct canonical semantic experiment and run IDs
4. exact integer attempt index 0 or 1 plus an append-only attempt-ledger SHA-256
5. `null` rerun authorization for attempt 0, or a lowercase authorization SHA-256 for attempt 1
6. distinct lowercase SHA-256 identities for candidate and stable weights
7. a lowercase SHA-256 match binding
8. exact `complete` run status and zero technical faults
9. contiguous ordered pair indices 0 through 383
10. one unique canonical semantic opening ID per pair
11. exactly two games per pair in candidate-sente, candidate-gote order
12. 768 globally unique game IDs
13. only `win | draw | loss` outcomes, with no missing or extra fields

All direct-decoder dictionaries and strings must be exact JSON `dict` / `str` values. Python subclasses and custom mappings cannot impersonate hashes, duplicate textual IDs, or protocol records.

A game is stored in half-point units—win 2, draw 1, loss 0—so a pair contributes 0 through 4 and the full denominator is `384 × 4 = 1,536`. Bootstrap resampling keeps each pair as one block, and the strict 45% and 50% gates use integer cross-products.

For a synthetic vector alternating 0% and 100% pair scores, the fixed 100,000-replicate lower numerators are one-sided `704/1536` and two-sided `692/1536`. This is a reproducibility test, not playing-strength data.

## Current real data

The machine-readable [v2 closed registry](../ml/protocols/floodgate-q1-2026-formal-paired-ab-v2-registry.json) and [validation evidence](./data/floodgate-formal-paired-ab-protocol-v2-2026-07-18.json) keep every operational gate closed.

| Item                                    |                Current value |
| --------------------------------------- | ---------------------------: |
| V2 formal A/B                           | 0 / 384 pairs, 0 / 768 games |
| Candidate / stable weight enrollments   |                        0 / 0 |
| Upstream receipt enrollments            |                            0 |
| Opening manifest / match binding        |      unenrolled / unenrolled |
| Attempt ledger / rerun authorization    |      unenrolled / unenrolled |
| Execution / result reader authorized    |                false / false |
| Promotion / production write authorized |                false / false |
| External calibration                    |                      0 games |
| Live weights changed                    |                        false |

This change adds only a Torch-independent decoder, bootstrap analyzer, closed-registry and amendment-chain validators, and unit tests. It adds no match launcher, weight reader, holdout reader, or production import.

## What still must be fixed before a real match

Before a separate change can enroll identities into v2, fresh teacher generation, three-seed retraining, selection, fresh and legacy final holdouts, retention, the known `P*8f` regression, and production parity/browser checks must all pass.

The future match binding must still freeze at least:

- exact candidate and stable weights plus engine/runtime revision
- the 384-opening manifest and selection rule
- time control, maximum plies, draw/resignation/adjudication rules
- hardware, OS, worker count, pair scheduling, and resource isolation
- technical-fault classification, detection, stopping, and evidence retention
- candidate/stable experiment ID, run ID, append-only attempt ledger, result-blinding boundary, and pre-unblinding rerun authorization
- run identity, result output, and independent reconstruction procedure

No game may start while those values are `null`. Passing v2 would show only that the candidate is stronger than stable under fixed internal conditions; it would not prove a human high-dan rank.

For the later external gate, the current official [81Dojo terms](https://81dojo.com/en/terms.html) require software-assisted play to use a dedicated `COM_` account and prohibit non-official access tools. The official [April 2026 threshold table](https://81dojo.com/announcements/260411.html) sets 2050 as the lower bound of five-dan. Our separate stability rule—200 rated games with every post-game rating from games 171 through 200 at or above 2050—is our preregistered calibration, not an 81Dojo rule. The official terms and thresholds must be reverified before execution; a material change requires a new pre-result calibration amendment, never an after-results rewrite.

Live weights remain unchanged until that external gate, the later rollback rehearsal, and a separate safe release gate all pass.
