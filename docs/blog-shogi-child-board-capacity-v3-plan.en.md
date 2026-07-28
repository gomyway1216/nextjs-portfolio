# Shogi child-board capacity v3 result: major top-1 and regret gains, pair gate failed

> Directly encoding the board after each legal move substantially improved in-sample top-1 and regret over v2. Pair accuracy still missed the fixed 98% gate in both domains, so v3 was rejected as preregistered. Full training, the second seed, sealed labels, and live mutation did not begin. [日本語](./blog-shogi-child-board-capacity-v3-plan.md)

## Bottom line

Child-board capacity v3 ended with `complete-sentinel-rejected`.

| Metric | V1 | V2 | V3 | V3−V2 | V3 gate | Result |
|---|---:|---:|---:|---:|---:|---|
| Browser top-1 | 179/256 (69.92%) | 222/256 (86.72%) | 244/256 (95.31%) | +22 parents, +8.59 points | at least 85% | PASS |
| Browser pair | 73.85% | 73.08% | 75.45% | +2.38 points | at least 98% | FAIL |
| V9 top-1 | 811/1,024 (79.20%) | 921/1,024 (89.94%) | 995/1,024 (97.17%) | +74 parents, +7.23 points | at least 85% | PASS |
| V9 pair | 87.00% | 84.85% | 88.84% | +3.98 points | at least 98% | FAIL |

V3 put Browser top-1 10.31 points above its gate and V9 12.17 points above. Pair accuracy also improved over v2, but remained 22.55 points below the Browser gate and 9.16 points below the V9 gate. All four checks were mandatory, so the two pair failures reject the experiment overall.

This was a capacity diagnostic over 1,280 fixed training parents. It did not measure unseen positions, match win rate, Elo, high-dan strength, or browser runtime. High top-1 on this sentinel is not evidence that the live AI became stronger.

## What v3 changed

V3 fixed the v2 objective and all data, adding only a small child-board encoder over authenticated `child_sfen` for every legal move.

- Convert the position after each legal move into the existing 43-plane form.
- Use one shared 16-channel CNN, two residual blocks, and a 128-dimensional projection.
- Concatenate the child vector to the existing 721-dimensional move input.
- Add 214,608 parameters over v2 for a total of 6,168,130.

The parent-board encoder, Set Transformer, policy/value heads, live-CP anchor, objective, data, sentinel parents, seed, optimizer, 40 epochs, and gates were unchanged from v2. V3 did not load discarded v1 or v2 weights and initialized from the fixed seed. The v2 and v3 `data_receipt` and live baseline are exactly equal. Evaluation pair counts also match: 1,042,139 for Browser and 49,889 for V9.

The external `result.json` is 25,096 bytes with SHA-256 `e9db86a37320345cc8418eb1f405dd5ef4e0c4187fcc8a1afff2f0e8fe4dd6d3`. The fixed protocol is 24,326 bytes with SHA-256 `4cdda7ab438aef16332b545477eb7ac12047ef13c19432d621c03803fb67b2a6`.

## What regret shows

Mean regret is the average teacher-score gap between the selected move and the teacher-best move. Lower is better.

| Domain | V2 | V3 | Improvement |
|---|---:|---:|---:|
| Browser | 3,965.14 cp | 4.25 cp | -3,960.88 cp (99.89% reduction) |
| V9 | 19.40 cp | 2.00 cp | -17.40 cp (89.68% reduction) |

Child-board representation clearly helped with selecting a best move. Regret was not a sentinel gate, however, and does not guarantee correct ordering of every eligible pair. This run exhibited exactly that combination: low regret and high top-1 alongside pair accuracy below 98%.

## Measured 40-epoch curve

Loss fell from 12.2260 to 2.6532, with its minimum at epoch 40.

| epoch | loss | seconds | epoch | loss | seconds |
|---:|---:|---:|---:|---:|---:|
| 1 | 12.226017 | 26.161 | 21 | 3.159286 | 14.407 |
| 2 | 11.423282 | 15.382 | 22 | 3.100904 | 14.308 |
| 3 | 10.052526 | 15.460 | 23 | 3.097815 | 14.569 |
| 4 | 8.765924 | 14.753 | 24 | 3.054755 | 14.838 |
| 5 | 7.512476 | 14.606 | 25 | 3.071482 | 14.664 |
| 6 | 6.359787 | 14.810 | 26 | 3.033433 | 14.375 |
| 7 | 5.443164 | 14.857 | 27 | 2.973301 | 14.491 |
| 8 | 4.831686 | 14.532 | 28 | 2.889371 | 14.925 |
| 9 | 4.585317 | 14.648 | 29 | 2.874196 | 14.342 |
| 10 | 4.303420 | 14.683 | 30 | 2.905264 | 14.207 |
| 11 | 4.080350 | 15.284 | 31 | 2.953073 | 14.405 |
| 12 | 3.856972 | 14.669 | 32 | 2.839793 | 14.697 |
| 13 | 3.708324 | 14.132 | 33 | 2.780360 | 14.354 |
| 14 | 3.599492 | 14.240 | 34 | 2.817171 | 14.173 |
| 15 | 3.546697 | 14.070 | 35 | 2.764802 | 14.339 |
| 16 | 3.514746 | 14.607 | 36 | 2.747147 | 14.576 |
| 17 | 3.460974 | 14.296 | 37 | 2.741664 | 14.181 |
| 18 | 3.320444 | 14.585 | 38 | 2.710544 | 14.609 |
| 19 | 3.294253 | 14.699 | 39 | 2.711923 | 15.196 |
| 20 | 3.299778 | 14.544 | 40 | 2.653237 | 15.089 |

Recorded epoch time totals 595.77 seconds (9:55.77). Epoch 1 took 26.16 seconds. Epochs 2–40 totaled 569.60 seconds with a 14.58-second median. The total is 280.98 seconds, or 89.26%, longer than v2. This is a comparison of the two fixed sentinel runs after adding the child-board encoder, not a general GPU multiplier or end-to-end project duration.

## What the result establishes

V3 strongly supports the hypothesis that board-after-move representation was a bottleneck for top-1 and regret. It nearly reproduced the best move, materially outperforming v2's parent-board-plus-move representation.

It rejects the hypothesis that a small child-board encoder is sufficient to memorize the full pair ordering to 98%. Ordering more than one million Browser pairs and about fifty thousand V9 pairs remains a different problem from selecting only the best move.

The run cannot distinguish whether the remaining deficit comes from model capacity, the pair objective, fine-grained teacher-score ordering, the fixed epoch count, or the 98% diagnostic threshold. V3 epochs, seeds, width, and gates will not be changed after observing this result.

## Stop boundary

Under the v3 protocol, the sentinel weights are discarded and this lane closes.

- Full v3 candidate training: not started.
- Seed-42 candidate and seed 314159: not started.
- Known-tune candidate selection: not started.
- Sealed teacher generation: not started.
- Distillation, WASM, and paired play: not started.
- Live weights: unchanged.

Any later training requires a different hypothesis and stop rule fixed in a new protocol before seeing its result; it may not be an extension of v3.

The complete 40-epoch curve and v1/v2 comparison are in [shogi-capacity-policy-value-v3-result-2026-07-28.json](./data/shogi-capacity-policy-value-v3-result-2026-07-28.json). The preceding experiment is in the [objective-only v2 article](./blog-shogi-capacity-objective-v2-plan.en.md).
