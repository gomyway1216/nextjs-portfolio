# Shogi evaluator: freezing the 384-game A/B before seeing results

> This stage executes zero games. Candidate weights, stable weights, upstream receipts, the opening manifest, and the match binding are all unenrolled. Match execution, result reading, promotion, and production-weight writes remain explicitly closed. Japanese version: [blog-shogi-floodgate-formal-paired-ab-protocol.md](./blog-shogi-floodgate-formal-paired-ab-protocol.md)

## Conclusion

The formal A/B preregistered in the [fresh sibling plan](../ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json) now has a Torch-independent strict decoder and paired-bootstrap analyzer.

- exactly 192 opening pairs / 384 games
- each pair reuses one opening, with candidate as sente and then as gote
- the statistical unit is the two-game pair, not one game
- resample 192 pairs with `random.Random(20260710)` for 100,000 replicates
- use sorted replicate 5,000 as the one-sided 95% lower bound and 2,500 as the two-sided 95% lower bound
- the safety gate requires the lower bound to be strictly above 45%
- the “stronger” claim requires the two-sided lower bound to be strictly above 50%

An analysis report is not promotion authority. The current promotion validator always fails with `production remains STOP`. The closed registry keeps every artifact identity `null` and every authority flag `false`.

## Why the pair is the resampling unit

The two color-swapped games sharing one opening are not independent. Treating all 384 games as independent samples could understate uncertainty caused by opening-specific advantage. The protocol scores each candidate game as win 1, draw 0.5, loss 0, averages the two games, and resamples the resulting 192 blocks.

Internally, the implementation avoids floating-point threshold ambiguity. A game is stored in half-point units—win 2, draw 1, loss 0—so a pair contributes 0 through 4 and the full denominator is `192 × 4 = 768`. The strict 45% and 50% comparisons use integer cross-products.

## Strict result shape

Analysis stops unless all of these conditions hold:

1. exact fresh-plan path / bytes / SHA-256 / schema
2. distinct lowercase SHA-256 identities for candidate and stable weights
3. a lowercase SHA-256 match binding
4. contiguous ordered pair indices 0 through 191
5. one unique `sha256:<64 lowercase hex>` opening ID per pair
6. exactly two games per pair, candidate-sente followed by candidate-gote
7. 384 globally unique game IDs
8. only `win | draw | loss` outcomes
9. no missing, extra, or wrongly typed fields

This fails closed on one-sided matches, duplicated openings, missing color swaps, duplicated games, and substitution of another plan.

## Current data

The machine-readable registry is [here](../ml/protocols/floodgate-q1-2026-formal-paired-ab-registry.json), and the validation record is [here](./data/floodgate-formal-paired-ab-protocol-2026-07-17.json).

| Item                       | Current value |
| -------------------------- | ------------: |
| Real games                 |             0 |
| Enrolled candidate weights |             0 |
| Enrolled stable weights    |             0 |
| Enrolled upstream receipts |             0 |
| execution authorized       |         false |
| promotion authorized       |         false |
| live weights changed       |         false |

Synthetic validation confirms that an all-win fixture passes both gates, while an exact 50% fixture passes only safety and cannot claim “stronger.” For an alternating pair-score vector of 0% / 100%, the exact 100,000-replicate deterministic vector yields lower numerators `340/768` one-sided and `328/768` two-sided. These are implementation-reproducibility values, not playing-strength evidence.

The ML stdlib suite passes 80/80 in 2.99 seconds. It covers the exact 100,000-replicate vector, strict type/schema rejection including adversarial non-JSON equality objects, pair/game uniqueness, color swapping, the closed registry, and the always-STOP promotion validator.

## What must happen next

This change does not authorize starting 384 games. The required order is:

1. complete fresh teacher generation and seed-42 / 43 / 44 retraining
2. freeze the candidate hash only after fresh selection passes
3. pass fresh and legacy final holdouts, retention, the known `P*8f` regression, and production parity
4. enroll exact candidate / stable / receipt / opening-manifest / match identities in a separate reviewed change
5. execute the bound 192-pair / 384-game match exactly once
6. analyze the result here and independently reconstruct the evidence
7. even after internal gates pass, measure human-rank calibration separately on 81Dojo

The present conclusion is only that the formal A/B decision rule is frozen before results exist. It is not evidence that the evaluator is stronger.
