# Shogi capacity objective-only v2: retest one failure cause

> V1 missed the fixed sentinel even with a large model. Its input-collision audits were zero and its teacher-score oracle reached 100%, while the training objective had concrete mismatches with admission. V2 keeps the model and data fixed and changes only the objective. [日本語](./blog-shogi-capacity-objective-v2-plan.md)

## The single question

This experiment asks one question:

**With the same model, same 1,280 parents, and same 40 epochs as v1, does aligning the objective with top-1 and domain-micro pair accuracy pass the fixed gate?**

This remains an in-sample capacity diagnostic, not a playing-strength test. Passing would not establish high-dan strength, a live improvement, or a better match win rate.

## What changes from v1

| Objective | V1 issue | V2 |
|---|---|---:|
| Listwise policy | Retain it | 1.0 |
| Pair | Averaged inside each parent and then weighted parents equally, unlike domain-micro admission | Micro logistic over every eligible pair pooled inside each domain batch, 1.0 |
| Top-1 margin | Selected one tied teacher-best move with `argmax` | Treat tied best moves as a set and separate them from the hardest negative, 1.0 |
| Move value | Regression not directly used for admission had substantial weight | 0.20 |
| State value | Not directly used for admission | 0 |

The 50 cp eligible-pair gap, score temperature, and scales not listed here remain as in v1.

## What stays fixed

- The 5,953,522-parameter model and 43-plane state input.
- Browser/V9 data, exclusions, and fit/tune split.
- The parent-ID-fixed 256 Browser and 1,024 V9 sentinel parents.
- Sentinel seed.
- AdamW, learning rate, weight decay, and gradient clipping.
- Batches, buckets, domain pairing, and epoch order.
- MPS and 40 epochs.
- All four gates: at least 85% top-1 and 98% pair accuracy in each domain.

Holding these constant isolates the objective change from the v1 comparison.

## Pre-run consistency checks

The v1 sentinel contained zero duplicate position IDs, zero collisions in the normalized 43-plane state input, and zero contradictory labels for identical model inputs. Its teacher-score oracle reached 100% top-1 and pair accuracy in both domains.

Teacher-best ties exist in 3/256 Browser parents and 13/1,024 V9 parents. The v2 hardest-negative margin does not push tied best moves apart; it separates the best set from the strongest non-best move.

## Stop rule

Passing all four checks after 40 epochs makes v2 eligible for the full candidate stage originally downstream of v1. It still does not authorize a live change.

If any check misses, objective-only v2 is rejected. There will be no added epochs, extra seeds, relaxed thresholds, or minor retries of the same objective. The next branch is a small capacity diagnostic with a child-board encoder that directly represents the board after each legal move, isolating a possible representation limitation.

## Claim boundary

- The v1 failure is measured.
- V2 is a fixed diagnostic changing only the objective.
- V2 strength impact is not measured yet.
- Full training, sealed labels, distillation, WASM, paired play, and live weight changes remain outside this sentinel.

The v1 measurements are in the [capacity v1 result article](./blog-shogi-capacity-policy-value-plan.en.md) and [machine-readable result](./data/shogi-capacity-policy-value-v1-result-2026-07-27.json).
