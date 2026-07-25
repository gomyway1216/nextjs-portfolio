# Packed Keys Added Only 0.38% to Real Search, So We Stopped

> The packed-key heap preserved the exact search result in all 64 tuning positions, but improved aggregate throughput by only **0.3808%** over the already rejected heap. It missed both aggregate promotion gates, so we stopped: no v3 holdout, match, production change, or live-weight change. The live AI did not get stronger.

[日本語版](./blog-shogi-packed-heap-real-search-tuning.md)

## Verdict

| Comparison                          |     Measured |       Required | Verdict  |
| ----------------------------------- | -----------: | -------------: | -------- |
| Packed vs production, aggregate     | **+6.8479%** | At least +8.5% | **Fail** |
| Packed vs current heap, aggregate   | **+0.3808%** | At least +1.5% | **Fail** |
| Packed vs production, median        |     +5.8092% | At least +5.5% | Pass     |
| Packed vs current heap, median      |     +0.2636% |    At least 0% | Pass     |
| p90 production wall-time regression |     +0.0367% |    At most +2% | Pass     |
| Exactness / technical faults        |     64/64, 0 |       64/64, 0 | Pass     |

The median and safety checks passed, but both primary aggregate gates failed. We will not relax the thresholds or repeat the same screen after seeing the result.

## What we tested

The prior stable heap swapped move, score, and generation ordinal. The new version packed signed score and ordinal into one `u64` comparison key, leaving each heap entry as a move plus one key.

We compared three arms:

1. P: production insertion-sort WASM;
2. H: the rejected three-array stable heap;
3. K: the new packed-key stable heap.

The screen used 64 tuning positions—16 openings, 16 middlegames, 16 drop-heavy positions, and 16 check evasions—at fixed depth 5 and quiescence depth 8. The transposition table was cleared before every search and never shared. Timing followed `P,H,K,K,H,P,K,P,H,H,P,K`, with equal work of 42,582,768 units per arm.

The candidate, thresholds, runner, and stop rule were pushed to GitHub in commit `50c72dcc` before the result was generated, providing an external timestamp in [PR #619](https://github.com/gomyway1216/nextjs-portfolio/pull/619).

This was a known-fixture **tuning screen**, not a fresh formal holdout. It did not reuse the formal-v2 holdout.

## Correctness

All three arms returned the same best move, score, completed depth, node count, and leaf count in **64/64 positions**. There were zero technical faults.

The packed path activated 277,656 times:

| Category      | Activations |
| ------------- | ----------: |
| Opening       |       5,411 |
| Middlegame    |       2,923 |
| Drop-heavy    |     100,391 |
| Check evasion |     168,931 |

Three individual positions had zero activation, but the preregistered rule required activation in every category, and all four categories passed.

## Speed result

| Category      | vs production | vs current heap |
| ------------- | ------------: | --------------: |
| Opening       |      +2.6438% |        -0.0558% |
| Middlegame    |      +2.6112% |        +0.3707% |
| Drop-heavy    |      +7.6680% |        +0.5236% |
| Check evasion |      +6.8254% |        +0.3365% |

The packed representation was correct, but almost all end-to-end gain still came from the heap strategy itself. Packing the key added only 0.38% overall. Kernel-level microbenchmark gains were diluted by the rest of the real search.

## Why we rejected it

The fixed rule required both a clear gain over production and a meaningful incremental gain over the existing heap. Both aggregate gates failed.

Following the stop rule means:

- no threshold changes or rerun;
- no fresh v3 holdout;
- no fixed-time match;
- no production or live change.

Without a fixed-time match, this result says nothing about win rate, Elo, or dan rank. The supported claim is only that the implementation preserved the tree but added too little speed to continue.

## Runtime and limitations

The measured run took **299,697 ms, or 4 minutes 59.7 seconds**, on one Apple M4 Pro with 14 logical CPUs and Node v22.13.0. Implementation, build, and documentation time were not measured as part of that number.

The 25 ms block value was a calibration target, not an enforced realized minimum. Of 768 blocks, 142 finished below 25 ms; the shortest was 20.31 ms. Independent recomputation matched every aggregate and gate, but these short blocks remain a timing-noise limitation.

This was Node-hosted WASM on one Mac, not timed browser play.

## Production remains unchanged

- Production WASM: 35,597 bytes, SHA-256 `e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c`
- Live NNUE weights: 1,185,988 bytes, SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`
- Fixed-time match: not run
- Deployment: not run

The live AI did not get stronger from this experiment.

## Next action

We are stopping this move-picker optimization line. The next compute budget should return to evaluator work that can change move quality: teacher generation and a new training candidate, followed by a preregistered paired fixed-time A/B and external calibration before any live promotion.

The useful result here is the stop decision: about five minutes of real-search measurement prevented more compute from being spent on a branch with too little remaining upside.

The [summary evidence](./data/shogi-packed-heap-real-search-tuning-2026-07-25.json) and [full raw rows](./data/shogi-packed-heap-real-search-tuning-raw-2026-07-25.json) are archived.
