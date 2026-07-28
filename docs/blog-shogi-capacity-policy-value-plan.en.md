# Large-capacity shogi evaluator diagnostic: rejected after 40 epochs

> The 5.95-million-parameter model did not meet any of the four fixed sentinel thresholds. Full candidate training, the second seed, and sealed teacher generation did not start, and the live weights remain unchanged. The post-failure audit points to a mismatch between the training objective and the admission metrics as the next narrow change, rather than a simple data collision. [日本語](./blog-shogi-capacity-policy-value-plan.md)

## Bottom line

Capacity-policy-value v1 ended with `complete-sentinel-rejected`. This does not mean the AI became stronger, nor does it prove that a large model cannot become stronger. It means the model failed an earlier diagnostic: reproducing the teacher ordering well enough on 1,280 fixed training parents.

| Gate | Observed | Required | Gap | Result |
|---|---:|---:|---:|---|
| Browser top-1 | 179/256 (69.92%) | 85% | -15.08 points | FAIL |
| Browser pair | 73.85% | 98% | -24.15 points | FAIL |
| V9 top-1 | 811/1,024 (79.20%) | 85% | -5.80 points | FAIL |
| V9 pair | 87.00% | 98% | -11.00 points | FAIL |

All four checks missed, not just one. Under the prospective stop rule, the sentinel weights were discarded. The 19,264-parent V9 pretraining, mixed training including 875 Browser parents, seed 314159, and new sealed all-legal teacher generation did not begin.

Production `public/shogi-nnue-weights.bin` remains 1,185,988 bytes with SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`. WASM is also unchanged.

## What ran

V1 used a 5,953,522-parameter offline model, materially larger than both the live NNUE and the previous 35,307-parameter residual.

| Part | Design |
|---|---|
| State input | 43 side-to-move-normalized 9×9 planes |
| State encoder | 64-channel stem, six residual blocks, 384-dimensional global state |
| Legal-move set | 256 dimensions, four Set Transformer layers, eight heads, FFN 1024 |
| Outputs | Policy residual over exact live CP plus a separate parent value |
| Sentinel | 256 Browser parents plus 1,024 V9 parents, 40 epochs |
| Fixed gate | At least 85% top-1 and 98% pair accuracy in both domains |

The external `result.json` is 25,048 bytes with SHA-256 `d7fd48f709bcd149330c8ff86eb4e878aa1b5156d6dde9fe62c2fd6fd55f6cf2`. It verified the 17,358-byte protocol with SHA-256 `30b4aab6689679a98a6f86fa835610a5f0fcfd3157d8fc44d4029152d1f7eaf3`.

`model_training_started: false` in that result means full candidate training, separate from the sentinel, never began. The sentinel itself completed 40 epochs and records `weights_discarded: true`.

## Measured 40-epoch curve

Loss fell from 6.4844 to 2.2629, but the admission decision was fixed to the four metrics above rather than loss. Recorded epoch time totals 246.33 seconds (4:06.33). Epoch 1, including initial MPS graph compilation, took 41.09 seconds. Epochs 2–40 totaled 205.24 seconds with a 5.12-second median. This is the sum of recorded epoch intervals, not total wall time including input loading and preflight audits.

| epoch | loss | seconds | epoch | loss | seconds |
|---:|---:|---:|---:|---:|---:|
| 1 | 6.484438 | 41.089 | 21 | 2.537276 | 5.152 |
| 2 | 5.967680 | 6.976 | 22 | 2.480719 | 5.013 |
| 3 | 5.266509 | 5.383 | 23 | 2.512001 | 5.131 |
| 4 | 4.607557 | 5.590 | 24 | 2.435230 | 5.098 |
| 5 | 4.000121 | 7.062 | 25 | 2.421870 | 4.980 |
| 6 | 3.639033 | 6.106 | 26 | 2.413802 | 5.003 |
| 7 | 3.525774 | 6.163 | 27 | 2.468018 | 4.993 |
| 8 | 3.224988 | 5.363 | 28 | 2.452481 | 5.057 |
| 9 | 3.081868 | 5.126 | 29 | 2.412609 | 4.900 |
| 10 | 2.984415 | 5.134 | 30 | 2.375254 | 4.963 |
| 11 | 2.881760 | 5.168 | 31 | 2.366159 | 4.916 |
| 12 | 2.828364 | 5.463 | 32 | 2.404753 | 4.922 |
| 13 | 2.745177 | 5.230 | 33 | 2.346734 | 4.975 |
| 14 | 2.710387 | 5.104 | 34 | 2.339329 | 5.184 |
| 15 | 2.677353 | 5.161 | 35 | 2.331683 | 5.196 |
| 16 | 2.663600 | 5.086 | 36 | 2.407578 | 4.940 |
| 17 | 2.660618 | 5.026 | 37 | 2.352084 | 5.149 |
| 18 | 2.609000 | 5.090 | 38 | 2.321472 | 5.079 |
| 19 | 2.590427 | 5.071 | 39 | 2.293029 | 4.952 |
| 20 | 2.538418 | 5.121 | 40 | 2.262851 | 5.217 |

For context, final mean regret was 3,955.30 cp on Browser and 17.34 cp on V9. Regret was not a sentinel admission check and therefore cannot override the four failures.

## Audit: was the data itself impossible?

The unchanged sentinel was audited after rejection.

| Audit | Browser | V9 |
|---|---:|---:|
| Duplicate position IDs | 0 | 0 |
| Collisions in normalized 43-plane state input | 0 | 0 |
| Contradictory teacher labels for identical model input | 0 | 0 |
| Teacher-score oracle top-1 | 100% | 100% |
| Teacher-score oracle pair | 100% | 100% |
| Parents with tied teacher-best moves | 3/256 | 13/1,024 |

Cross-domain semantic overlap was also zero. Tied teacher-best moves do exist, but the scorer treats every tied best move as correct. Pairs separated by less than 50 cp are excluded, so directly supplying teacher scores reaches 100% on both metrics. The miss therefore cannot be explained solely by duplicate IDs, contradictory labels on identical inputs, or an evaluator that is mathematically unable to reach 100%.

This oracle does not prove that the teacher plays perfect shogi. It only verifies internal consistency between the supplied labels and the scorer.

## Why could loss fall while the gate still failed?

The v1 objective did not exactly match its admission metrics.

1. **Macro/micro mismatch for pairs.**
   Training averaged eligible pairs within each parent and then weighted parents equally. Admission pooled every eligible pair across the domain. The final score included 1,042,139 Browser pairs and 49,889 V9 pairs. Parents with many legal moves have much more weight in the admission metric than they had in the objective.

2. **A small tied-best inconsistency.**
   The scorer accepts every teacher-tied best move, but v1 best-margin loss selected one tied move with `argmax` and required margin over every remaining move. Only 3 Browser and 13 V9 parents had this tie, but the contradiction is unnecessary.

3. **Regression terms not directly used for admission.**
   V1 optimized move-value and state-value regression together with policy, pair, and best-margin losses. Lower total loss did not guarantee enough improvement in top-1 and micro pair accuracy.

This does not prove that the objective is the only cause. Representation, optimization, and teacher distribution remain possible limitations. It does rule out simple input collisions and an unreachable oracle, and it supports changing only the objective next. There is no evidence for rerunning v1 with more epochs or seeds.

## Next: objective-only v2

The next diagnostic holds the model and data constant and changes only the objective:

| Term | V2 weight |
|---|---:|
| Listwise policy | 1.0 |
| Logistic loss over all eligible pairs pooled within each domain batch | 1.0 |
| Hardest-negative top-1 margin treating tied teacher-best moves as a set | 1.0 |
| Move value | 0.20 |
| State value | 0 |

The model, data, sentinel parents, seed, AdamW, learning rate, batches, ordering, 40 epochs, and 85% top-1 / 98% pair gates remain identical to v1. A pass would show that aligning the objective helped. A miss will not trigger a simple epoch extension or threshold relaxation; the next branch would be a small capacity diagnostic that encodes the child board after each legal move.

The fixed v2 plan is recorded separately in the [objective-only v2 article](./blog-shogi-capacity-objective-v2-plan.en.md).

## Current state

- Capacity v1 sentinel: 40 epochs complete, rejected.
- Full v1 candidate training: not started.
- Seed 314159: unauthorized and not started.
- Sealed teacher generation: unauthorized and not started.
- Distillation, WASM, paired play: not started.
- Live weights: unchanged.

The full measured curve and audit summary are in [shogi-capacity-policy-value-v1-result-2026-07-27.json](./data/shogi-capacity-policy-value-v1-result-2026-07-27.json). Prospective input hashes and split receipts remain in [shogi-capacity-policy-value-plan-2026-07-26.json](./data/shogi-capacity-policy-value-plan-2026-07-26.json).
