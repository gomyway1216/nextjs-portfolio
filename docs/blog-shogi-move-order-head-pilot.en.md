# Can Search Improve Without Replacing the Evaluator? A 128 KiB Move-Ordering Pilot

> Further evaluator fine-tuning had not translated into playing strength, so this pilot tested one separate hypothesis: if a tiny model puts the deep teacher's preferred legal moves first, alpha-beta may search deeper in the same time. Sixty-four selection epochs finished in about two and a half minutes, but the model missed the preregistered static gates. It was not integrated into search, matched, or deployed.

## Verdict

- This experiment did not make the live AI stronger.
- The production NNUE, TypeScript search, WASM, and `public/shogi-nnue-weights.bin` were unchanged.
- Quantization to 128 KiB succeeded with effectively no float-to-int16 loss.
- Top-1 agreement on 643 parents was **71/643 = 11.04%**, below the required **99/643 = 15.40%**.
- Accuracy on move pairs separated by at least 50 cp was **66.34%**, below the required **68.96%**.
- On a separate 4,798-parent distribution, top-1 agreement against the scalar evaluator fell from **30.39% to 26.84%**, while pair accuracy fell from **59.38% to 56.87%**.
- This feature/loss recipe will not receive extra seeds, extra epochs, or a search integration.

## Why test move ordering?

The earlier experiments fine-tuned an NNUE that returns one value for a position. A slightly better position value did not reliably change the selected move or beat production in direct play.

Alpha-beta has another improvement path. Searching a good move first can cut later branches sooner. Better ordering may therefore reduce nodes without replacing the evaluator. This pilot isolated that idea in a tiny model:

```text
position + legal move
        │
        ▼
128 KiB move-ordering head
        │
        ▼
sort promising moves first
        │
        ▼
search with the existing NNUE
```

The plan allowed a root-only research-WASM comparison only after the static gate passed. Keeping production search untouched avoided spending a benchmark and match cycle on a model that could not first reproduce the teacher's ordering.

## Data and model

The browser-confusion teacher set contains depth-12 scores for every legal move at each parent. Training used 112,011 moves from 1,334 parents and 38 games; validation used 57,658 moves from 643 parents and 15 games. A second distribution contributed 28,518 moves from 4,798 parents and 200 games, with candidates proposed at depth 14 and rescored at depth 16.

Epoch selection used a game-disjoint split: 1,031 fit parents and 303 tune parents. Neither the published 643-parent reject set nor the external 4,798-parent set selected an epoch.

The model is a signed linear table with 65,536 hash buckets. Roughly 30–46 active features describe the piece, source, destination, capture, promotion, drop, king-relative geometry, and the eight neighboring squares. Gote-to-move positions and moves are rotated by 180 degrees. Runtime work is limited to int16 lookups and int32 additions, and the exported table is exactly 131,072 bytes.

## Runtime

| Stage | Measured time |
| --- | ---: |
| Load data | 6.04 s |
| Select among 64 epochs | 120.29 s |
| Refit the selected 11 epochs on all training games | 19.99 s |
| Total | **146.31 s** |

No long generation job or seed sweep was launched. A cheap rejection gate resolved this hypothesis in about two and a half minutes.

## Results

| Metric | Current scalar reference | Move head | Required | Verdict |
| --- | ---: | ---: | ---: | --- |
| Top-1 on 643 parents | 66 / 643 (10.26%) | 71 / 643 (11.04%) | 99 / 643 (15.40%) | Fail |
| 50-cp pair accuracy | 66.96% | 66.34% | 68.96% | Fail |
| Top-1 parents lost to int16 | — | 0 | At most 1 | Pass |
| Pair loss from int16 | — | 0.00277 points | At most 0.1 points | Pass |
| Artifact size | — | 128 KiB | At most 128 KiB | Pass |

The narrow 643-parent set gained five top-1 parents over the scalar evaluator, but decisive pair ordering regressed by 0.62 percentage points. On the independent 4,798-parent distribution, the move head lost 170 top-1 parents and 2.51 pair-accuracy points. Top-1 was 32.76% on the 1,334 refit parents but only 11.04% on the 643 validation parents, a 21.72-point generalization gap. A small narrow-set gain is not evidence of generalized strength.

An independent post-run audit found that the first scorer counted predicted pair ties as half-correct, unlike the strict reference metric. The original v1 protocol remains preserved byte-for-byte. We then ran a fresh v2 with unchanged training settings and thresholds but strict pair scoring, tie-safe top-1, and overlap accounting. The table reports v2. Both runs reject the model, so the verdict is unchanged.

## Why it failed

Capacity and quantization are not the immediate bottlenecks. Float and int16 selected the same top move on all 643 parents, and their pair scores were effectively identical. The failure existed before export.

The linear features can describe local geometry, but they do not calculate the opponent's reply or the resulting position value. Drops make up more than 55% of the candidate rows, leaving many locally similar destinations that are hard to distinguish without lookahead. The reversal on the separate 4,798-parent set also shows substantial distribution dependence.

This is why simply growing the table to 1 GB has no demonstrated path to success. The 128 KiB table already preserves the trained float model; a larger table fed the same local information would not create the missing lookahead signal.

## What remains worth trying

This exact recipe is closed. The next priority is not another small evaluator update, but measured search work that can increase reachable depth while keeping the current evaluator: WASM move generation, legality checks, and search ordering.

A speed result will still not count as playing strength. Only a change that passes fixed-position node, time, and move-quality gates should enter a fresh direct match, and only a direct-match winner may become a live candidate.

Counts, hashes, and gate outcomes are recorded in [`docs/data/shogi-move-order-head-pilot-v2.json`](data/shogi-move-order-head-pilot-v2.json).
