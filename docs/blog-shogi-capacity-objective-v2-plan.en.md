# Shogi capacity objective-only v2 result: top-1 passed, pair gate failed

> With the same model, data, 1,280 parents, and 40 epochs as v1, v2 changed only the objective to align it with admission. Top-1 cleared the threshold in both Browser and V9, but pair accuracy became worse than v1 in both domains. V2 was rejected as preregistered; full training, the second seed, sealed labels, and live mutation did not begin. [日本語](./blog-shogi-capacity-objective-v2-plan.md)

## Bottom line

Objective-only v2 ended with `complete-sentinel-rejected`.

| Metric | V1 | V2 | V2−V1 | V2 gate | Result |
|---|---:|---:|---:|---:|---|
| Browser top-1 | 179/256 (69.92%) | 222/256 (86.72%) | +43 parents, +16.80 points | at least 85% | PASS |
| Browser pair | 73.85% | 73.08% | -0.78 points | at least 98% | FAIL |
| V9 top-1 | 811/1,024 (79.20%) | 921/1,024 (89.94%) | +110 parents, +10.74 points | at least 85% | PASS |
| V9 pair | 87.00% | 84.85% | -2.15 points | at least 98% | FAIL |

The objective change was not inert. Browser top-1 cleared its threshold by 1.72 points and V9 by 4.94 points. However, the pair metric that the change was intended to align remained 24.92 points below its Browser threshold and 13.15 points below its V9 threshold. Two of four checks failed, so the overall result is rejection.

This was an in-sample sentinel, not a playing-strength or generalization test. The two top-1 passes cannot be extracted and presented as evidence that the live AI became stronger.

## Only the objective changed from v1

| Objective | V2 |
|---|---:|
| Listwise policy | 1.0 |
| Micro logistic over all eligible pairs pooled within each domain batch | 1.0 |
| Hardest-negative top-1 margin treating tied teacher-best moves as a set | 1.0 |
| Move value | 0.20 |
| State value | 0 |

The 5,953,522-parameter model, 43-plane input, data, exclusions, split, sentinel parents, seed, AdamW, learning rate, batching, ordering, 40 epochs, and 85% top-1 / 98% pair gates remained identical to v1. The v1 and v2 `data_receipt` and live baseline are byte-for-byte equal. Evaluation pair counts also match: 1,042,139 for Browser and 49,889 for V9.

The external `result.json` is 25,053 bytes with SHA-256 `1f16f030d52d2aff1d8009614aaeb2183a68b462e212933924fae594c2136e3a`. Its objective is `gate-aligned-micro-pair-hard-negative-v2`. The fixed protocol is 21,089 bytes with SHA-256 `15e7c8ffee90a9ad2d6caad41267d9e788984ffd97627a4f1c734aa49954d3d8`.

## Measured 40-epoch curve

V2 loss fell from 12.2130 to 3.1358, with its minimum at epoch 40. The v1 and v2 objectives and weights differ, so comparing v1 loss 2.2629 with v2 loss 3.1358 does not rank the two models.

| epoch | loss | seconds | epoch | loss | seconds |
|---:|---:|---:|---:|---:|---:|
| 1 | 12.213042 | 23.195 | 21 | 3.718387 | 7.383 |
| 2 | 11.226556 | 7.967 | 22 | 3.709730 | 6.960 |
| 3 | 9.722485 | 7.884 | 23 | 3.573894 | 7.002 |
| 4 | 8.641396 | 7.781 | 24 | 3.551910 | 7.291 |
| 5 | 7.358148 | 7.720 | 25 | 3.644022 | 7.126 |
| 6 | 6.357735 | 7.808 | 26 | 3.474080 | 7.624 |
| 7 | 5.619614 | 8.101 | 27 | 3.517037 | 7.268 |
| 8 | 4.961493 | 7.350 | 28 | 3.530302 | 7.578 |
| 9 | 4.801455 | 8.276 | 29 | 3.465568 | 7.559 |
| 10 | 4.625634 | 8.551 | 30 | 3.365900 | 7.397 |
| 11 | 4.362289 | 7.698 | 31 | 3.300953 | 7.459 |
| 12 | 4.328898 | 7.675 | 32 | 3.509236 | 7.495 |
| 13 | 4.126601 | 7.648 | 33 | 3.409219 | 7.161 |
| 14 | 4.127328 | 7.407 | 34 | 3.311161 | 7.399 |
| 15 | 4.016109 | 7.369 | 35 | 3.353493 | 7.254 |
| 16 | 4.120951 | 7.264 | 36 | 3.338644 | 7.545 |
| 17 | 4.025909 | 7.272 | 37 | 3.293471 | 7.284 |
| 18 | 3.899232 | 7.248 | 38 | 3.203737 | 7.289 |
| 19 | 3.872783 | 7.365 | 39 | 3.156432 | 7.185 |
| 20 | 3.728324 | 6.964 | 40 | 3.135810 | 6.982 |

Recorded epoch time totals 314.78 seconds (5:14.78). Epoch 1 took 23.19 seconds. Epochs 2–40 totaled 291.59 seconds with a 7.40-second median. These intervals exclude input loading and preflight audits. The total is 68.45 seconds longer than v1, but initial compilation conditions were not identical, so these two runs do not establish a general performance difference.

Mean regret, which was not a sentinel gate, ended at 3,965.14 cp on Browser and 19.40 cp on V9. That is 9.84 cp and 2.06 cp worse than v1 respectively and provides no basis to rescue v2.

## What this does and does not establish

V2 rejects the hypothesis that correcting the v1 objective mismatch is sufficient to pass all four gates. The top-1-directed change worked on top-1, but the model did not learn the full pair ordering at the same time.

The result does not yet distinguish among these possibilities:

- Parent-board plus move features may not express the state after each legal move well enough.
- Optimizing one score for top-1 margin and more than one million Browser pairs may remain difficult.
- The teacher-score distribution or the fixed 40-epoch budget may impose another limitation.

It is therefore too strong to conclude that a large model can never work. There is also no evidence for adding epochs or seeds to the same v2 recipe.

## Child-board v3 result

The next fixed diagnostic, v3, added only a small encoder over the board after applying each legal move.

| Metric | V2 | V3 | V3−V2 | V3 result |
|---|---:|---:|---:|---|
| Browser top-1 | 86.72% | 95.31% | +8.59 points | PASS |
| Browser pair | 73.08% | 75.45% | +2.38 points | FAIL |
| V9 top-1 | 89.94% | 97.17% | +7.23 points | PASS |
| V9 pair | 84.85% | 88.84% | +3.98 points | FAIL |

Mean regret also fell from 3,965.14 cp to 4.25 cp on Browser and from 19.40 cp to 2.00 cp on V9. Board-after-move representation was therefore a limitation for top-1 and regret. Pair accuracy improved but remained below the fixed 98%, so v3 was also rejected overall.

## Current state

- V2 sentinel: 40 epochs complete; two top-1 checks passed, two pair checks failed; overall rejected.
- Child-board v3 sentinel: 40 epochs complete; two top-1 checks passed, two pair checks failed; overall rejected.
- Full v2 candidate training: not started.
- Full v3 candidate training: not started.
- Seed 314159: unauthorized and not started.
- Sealed teacher generation: unauthorized and not started.
- Distillation, WASM, and paired play: not started.
- Live weights: unchanged.
- V3 extension: forbidden by its stop rule.

The complete 40-epoch curve and v1 comparison are in [shogi-capacity-policy-value-v2-result-2026-07-28.json](./data/shogi-capacity-policy-value-v2-result-2026-07-28.json). V1 is documented in the [capacity v1 article](./blog-shogi-capacity-policy-value-plan.en.md).

The measured architecture-only experiment is in the [child-board capacity v3 result](./blog-shogi-child-board-capacity-v3-plan.en.md).
