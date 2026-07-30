# HalfKP81 v3 quantization diagnosis: a real local tail, not a broad regression

> The v3 static miss was recomputed read-only from the frozen checkpoints and all 22,890 validation positions. Candidate quantization error was lower than the initializer from p90 through p99.5. The three rows above the old allowance all belonged to one parent at move 121. No weight clipped, and a global scale correction barely helped. The primary problem is the max-only relative gate design, although the local tail itself is real. [日本語](./blog-shogi-direct-teacher-halfkp81-v3-quantization-diagnosis.md)

## What was read—and what was not done

`ml/analyze_direct_teacher_halfkp81_v3_quantization.py` authenticates and reads only the formal execution plan, static/trainer results, initializer/candidate checkpoints, exported integer weights, and fixed validation bytes. It does not open the old claim, construct an optimizer, play a game, or write a file.

The v3 terminal state remains unchanged.

| Authority or execution | Value |
|---|---:|
| v3 family | closed; no retry |
| Training / optimizer during diagnosis | 0 rows / 0 |
| Paired games | 0 |
| paired56 / expanded / live write | all unauthorized |

## Only the extreme maximum is different

Nearest-rank percentiles compare float-to-int16 CP deltas for the initializer and candidate.

| Metric | Initializer | Candidate | Candidate / initializer |
|---|---:|---:|---:|
| mean | 26.821 | 26.866 | 1.00169 |
| p90 | 60.148 | 58.816 | 0.97785 |
| p95 | 76.336 | 74.036 | 0.96986 |
| p99 | 109.996 | 107.564 | 0.97789 |
| p99.5 | 123.326 | 120.987 | 0.98104 |
| p99.9 | 155.019 | 157.112 | 1.01350 |
| p99.99 | 192.710 | 224.414 | 1.16452 |
| max | 203.278 | 238.489 | 1.17322 |

The candidate is better from p90 through p99.5. Its p99.9 ratio also remains below the historical 1.05 ceiling; the miss is concentrated in roughly the highest 0.01%.

The old relative gate allowed `203.277954 × 1.05 = 213.441852 CP`. Only three of 22,890 rows exceeded it, and all three came from the same game, same parent, and move 121. The worst row was:

- child ID: `sha256:ab6c809a…a00168`;
- float: `1063.5111 CP`;
- int16: `1302 CP`; and
- delta: `238.4889 CP`.

That parent has 12 child moves. The candidate's float and int16 evaluators selected the same top child, so the maximum-error cluster itself did not change the top move. This does not prove that the tail is harmless, but it rules out an interpretation of three independent, broadly broken positions.

## Proxy metrics for the integer evaluator that would actually run

The original teacher MAE and pair accuracy used the float model. Recomputing them through the deployed integer arithmetic on the same fixed validation set still favors the candidate.

| Deployed int16 metric | Initializer | Candidate | Improvement |
|---|---:|---:|---:|
| Teacher MAE | 553.354 CP | 545.808 CP | +7.546 CP |
| Pair accuracy | 0.583428 | 0.583873 | +0.000445 |
| Pair correct / 123,520 | 72,065 | 72,120 | +55 |
| Direct BCE | 0.690677 | 0.686873 | +0.003805 |

These are not playing-strength evidence. They do show that the float improvement did not disappear as a regression in the exported evaluator.

## Neither clipping nor a global scale error

Zero weight coordinates reached an int16 endpoint. Even the largest scaled ranges were only `-224.41…216.73` for `w1_board` and `-105.29…62.62` for `w2`, far from int16 saturation.

A cross-fit `float_cp ≈ a × int_cp + b` calibration used child-position SHA parity to separate fit and evaluation rows. For the candidate, `a=1.000332` and `b=-7.390 CP`; holdout mean error changed only from `27.0363` to `26.9779 CP`, a `0.0584 CP` improvement. Neither weight clipping nor global scale is therefore the main cause. The remaining evidence establishes only a local fixed-point/rounding tail; identifying a narrower cause such as activation-boundary effects requires additional measurements.

## Compare only three successor options

| Option | Advantage | Cost or risk | Decision |
|---|---|---|---|
| Independently adjudicate the frozen candidate with a robust gate | Preserves the weights and reaches fresh games fastest | The diagnostic values are already known, so static success alone proves no strength | **Recommended** |
| Exact-int16 STE QAT with an outlier penalty | Directly trains against the local tail | A new optimizer may erase the measured +7.546 CP; every gate repeats | Fallback after v4 |
| Recalibrate output scale | Relatively small implementation | Cross-fit gained only 0.058 CP and does not match the cause | Reject |

The proposed v4 is not a threshold edit or retry of v3. It is a new family, namespace, and protocol that takes the frozen candidate SHA as input and runs no optimizer. Candidate gates are nearest-rank p99.9 ratio `≤1.05`, absolute maximum `≤300 CP`, deployed-int16 teacher-MAE improvement `≥5 CP`, int16 pair delta `≥0`, zero clipped weights, zero WASM mismatches, and slowdown `≤5%`.

Those diagnostic values are already observed, so passing them does not authorize a strength claim. It may authorize only a separately preregistered fresh-opening paired screen—not the old v3 paired56. That fresh screen is the first playing-strength evidence.

The [machine-readable memo](./data/shogi-direct-teacher-halfkp81-v3-quantization-diagnosis-2026-07-29.json) fixes the key values and proposal boundary.
