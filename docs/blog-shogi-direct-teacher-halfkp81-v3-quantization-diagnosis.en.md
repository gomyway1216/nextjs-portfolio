# HalfKP81 v3 quantization diagnosis: a real local tail, not a broad regression

> The v3 static miss was recomputed read-only from the frozen checkpoints and all 22,890 validation positions. Candidate quantization error was lower than the initializer from p90 through p99.5. The three rows above the old allowance all belonged to one parent at move 121. No weight clipped, and a global scale correction barely helped. The primary problem is the max-only relative gate design, although the local tail itself is real. [日本語](./blog-shogi-direct-teacher-halfkp81-v3-quantization-diagnosis.md)

## What was read—and what was not done

`ml/analyze_direct_teacher_halfkp81_v3_quantization.py` authenticates and reads only the formal execution plan, static/trainer results, initializer/candidate checkpoints, exported integer weights, and fixed validation bytes. It does not open the old claim, construct an optimizer, play a game, or write a file.

The v3 terminal state remains unchanged.

| Authority or execution                |            Value |
| ------------------------------------- | ---------------: |
| v3 family                             | closed; no retry |
| Training / optimizer during diagnosis |       0 rows / 0 |
| Paired games                          |                0 |
| paired56 / expanded / live write      | all unauthorized |

## Only the extreme maximum is different

Nearest-rank percentiles compare float-to-int16 CP deltas for the initializer and candidate.

| Metric | Initializer | Candidate | Candidate / initializer |
| ------ | ----------: | --------: | ----------------------: |
| mean   |      26.821 |    26.866 |                 1.00169 |
| p90    |      60.148 |    58.816 |                 0.97785 |
| p95    |      76.336 |    74.036 |                 0.96986 |
| p99    |     109.996 |   107.564 |                 0.97789 |
| p99.5  |     123.326 |   120.987 |                 0.98104 |
| p99.9  |     155.019 |   157.112 |                 1.01350 |
| p99.99 |     192.710 |   224.414 |                 1.16452 |
| max    |     203.278 |   238.489 |                 1.17322 |

The candidate is better from p90 through p99.5. Its p99.9 ratio also remains below the historical 1.05 ceiling; the miss is concentrated in roughly the highest 0.01%.

The old relative gate allowed `203.277954 × 1.05 = 213.441852 CP`. Only three of 22,890 rows exceeded it, and all three came from the same game, same parent, and move 121. The worst row was:

- child ID: `sha256:ab6c809a…a00168`;
- float: `1063.5111 CP`;
- int16: `1302 CP`; and
- delta: `238.4889 CP`.

That parent has 12 child moves. The candidate's float and int16 evaluators selected the same top child, so the maximum-error cluster itself did not change the top move. This does not prove that the tail is harmless, but it rules out an interpretation of three independent, broadly broken positions.

## Proxy metrics for the integer evaluator that would actually run

The original teacher MAE and pair accuracy used the float model. Recomputing them through the deployed integer arithmetic on the same fixed validation set still favors the candidate.

| Deployed int16 metric  | Initializer |  Candidate | Improvement |
| ---------------------- | ----------: | ---------: | ----------: |
| Teacher MAE            |  553.354 CP | 545.808 CP |   +7.546 CP |
| Pair accuracy          |    0.583428 |   0.583873 |   +0.000445 |
| Pair correct / 123,520 |      72,065 |     72,120 |         +55 |
| Direct BCE             |    0.690677 |   0.686873 |   +0.003805 |

These are not playing-strength evidence. They do show that the float improvement did not disappear as a regression in the exported evaluator.

## Neither clipping nor a global scale error

Zero weight coordinates reached an int16 endpoint. Even the largest scaled ranges were only `-224.41…216.73` for `w1_board` and `-105.29…62.62` for `w2`, far from int16 saturation.

A cross-fit `float_cp ≈ a × int_cp + b` calibration used child-position SHA parity to separate fit and evaluation rows. For the candidate, `a=1.000332` and `b=-7.390 CP`; holdout mean error changed only from `27.0363` to `26.9779 CP`, a `0.0584 CP` improvement. Neither weight clipping nor global scale is therefore the main cause. The remaining evidence establishes only a local fixed-point/rounding tail; identifying a narrower cause such as activation-boundary effects requires additional measurements.

## Compare only three successor options

| Option                                                           | Advantage                                             | Cost or risk                                                                        | Decision          |
| ---------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------- |
| Independently adjudicate the frozen candidate with a robust gate | Preserves the weights and reaches fresh games fastest | The diagnostic values are already known, so static success alone proves no strength | **Recommended**   |
| Exact-int16 STE QAT with an outlier penalty                      | Directly trains against the local tail                | A new optimizer may erase the measured +7.546 CP; every gate repeats                | Fallback after v4 |
| Recalibrate output scale                                         | Relatively small implementation                       | Cross-fit gained only 0.058 CP and does not match the cause                         | Reject            |

The proposed v4 is not a threshold edit or retry of v3. It is a new family, namespace, and protocol that takes the frozen candidate SHA as input and runs no optimizer. Candidate gates are nearest-rank p99.9 ratio `≤1.05`, absolute maximum `≤300 CP`, deployed-int16 teacher-MAE improvement `≥5 CP`, int16 pair delta `≥0`, zero clipped weights, zero WASM mismatches, and slowdown `≤5%`.

Those diagnostic values are already observed, so passing them does not authorize a strength claim. It may authorize only a separately preregistered fresh-opening paired screen—not the old v3 paired56. That fresh screen is the first playing-strength evidence.

The [machine-readable memo](./data/shogi-direct-teacher-halfkp81-v3-quantization-diagnosis-2026-07-29.json) fixes the key values and proposal boundary.

## 2026-07-29 update: v4 static passed 7/7; the fresh screen missed at 61/112

The proposed v4 robust adjudication ran formally without changing the frozen candidate and passed all seven checks. The result JSON has SHA-256 `a5e02de08ad116578937bf81a1d27f5d9a9ab197e84fadf7f42efb20affb5b7a`.

| Static check                           |   Observed | Requirement | Decision |
| -------------------------------------- | ---------: | ----------: | -------: |
| p99.9 candidate / initializer          |   1.013499 |       ≤1.05 |     PASS |
| Absolute maximum CP delta              | 238.489 CP |     ≤300 CP |     PASS |
| Deployed-int16 teacher MAE improvement |   7.546 CP |       ≥5 CP |     PASS |
| Deployed-int16 pair-accuracy delta     |  +0.000445 |          ≥0 |     PASS |
| Int16 clipping coordinates             |          0 |           0 |     PASS |
| WASM parity mismatches                 |          0 |           0 |     PASS |
| Runtime slowdown                       |     2.496% |         ≤5% |     PASS |

This is a safety and reproducibility pass, not a strength result. In particular, the pair-accuracy delta of `+0.000445` is only `+0.0445 percentage point`; it must not be relabeled as “the engine got stronger.” The same applies to the small proxy gains previously summarized as “only about 1%.” This record does not retract the conclusion that training metrics were confused with playing strength or that too much time was spent on work with no direct strength contribution. The durable benefit is narrower: the frozen candidate was preserved and received a decisive fresh playing test.

Fresh openings were selected outside a 3,302-fingerprint union of tracked protocol and private-run inventory. The first 28 eligible fingerprints were frozen, with zero overlap against the prior inventory. Four findings from an independent audit were fixed before merge:

1. Two missing tracked-protocol fingerprints were corrected by recursively scanning every tracked protocol into the prior-opening union.
2. Unauthenticated Node/tsx/harness execution and a spoofable-log path were replaced with an exact root-owned Node executable, a tracked standalone bundle, `O_NOFOLLOW` reads, anonymous-fd execution, and a fixed formal executor.
3. Fault evidence that previously held only an exception-type hash now binds stdout/stderr identities, create-only raw bytes, and a domain-separated receipt.
4. The builder now records the actually resolved run root instead of describing a noncanonical root as the default path.

The runner also rejects transcripts with `legal_moves=0`. The follow-up audit found no remaining P1 or P2 finding. Implementation PR [#663](https://github.com/gomyway1216/nextjs-portfolio/pull/663) was merged with a regular merge commit, `bcf77714aee38ddf6f0f671e8c1d475a05dd2593`.

That merged source froze the formal plan with SHA-256 `93cdaa08039dd764a98bc61a9cbe9005cbbca1f925a072749937d6c16da7f230`. Twelve workers completed all 28 color-swapped pairs and all 56 games.

| Fresh paired56 result |                                       Value |
| --------------------- | ------------------------------------------: |
| Candidate W–L–D       |                                     29–24–3 |
| Completion            |                    28/28 pairs; 56/56 games |
| Half-point score      |                                      61/112 |
| Preregistered minimum |                                      62/112 |
| Shortfall             |                                1 half-point |
| Technical faults      |                                           0 |
| All moves legal       |                                        true |
| All openings unique   |                                        true |
| Decision              | **strength MISS; candidate stronger=false** |

The candidate won more games than it lost, but finished one half-point below the preregistered acceptance line. The terminal status is `failed-strength-complete-v4-family-closed`; the same v4 family will not be rescued by changing the threshold or rerunning it. All 28 pair receipts and logs are present. These 56 games are the first playing-strength evidence, and their decision is not to adopt the candidate as a strength improvement.

The terminal `result.json` is 2,968 bytes with SHA-256 `c99da7b4aebae24d7cf8ee23c689d95200fe73ae2e219ff8bce001f28f244b21`; its embedded domain-separated result SHA-256 is `5ae126674935a32ff8822a96eadd7d653e7c7a2fff61df06624b0da98568e090`. The expanded stage, live weights, and public flag all remain unchanged.

The final milestone is stored in a separate [successor machine-readable memo](./data/shogi-direct-teacher-halfkp81-v4-formal-paired56-result-2026-07-29.json). The v3 diagnosis memo linked above is an exact bytes/SHA input to the v4 preregistration, so it was intentionally not rewritten after the fact.
