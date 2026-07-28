# Shogi evaluator next step: test whether a large model can learn the task

> The live AI is not stronger yet. The all-legal warm-start and 70 KB residual were rejected by their static gates, and the live weights remain unchanged. The next experiment replaces repeated small-model tuning with a 5.95-million-parameter offline capacity diagnostic. [日本語](./blog-shogi-capacity-policy-value-plan.md)

## Bottom line

The new model and prospective protocol answer one question before more expensive work: can a materially larger representation learn the authenticated legal-move teacher ordering?

- If it cannot even fit a fixed sentinel, stop and inspect the representation, loss, or labels.
- If it improves a leak-free internal tune set, repeat the exact recipe with a second seed.
- Only if both seeds pass may a new sealed holdout be labeled once.
- Distillation, WASM work, paired play, and live promotion remain downstream and unauthorized.

The production `public/shogi-nnue-weights.bin` remains 1,185,988 bytes with SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`.

## Why this is different

The rejected explicit residual had only 35,307 parameters. The new model has 5,953,522 parameters, 168.6 times as many. Its fp32 weights occupy 22.71 MiB, and weights, gradients, and AdamW moments total about 90.84 MiB, well within the 48 GB M4 Pro.

It consumes 43 side-to-move-normalized 9×9 planes, applies a 64-channel six-block residual state encoder, and produces a 384-dimensional global state. Explicit source, destination, move, king-relation, and exact live-score features are projected to 256 dimensions. Four permutation-equivariant Set Transformer layers compare the complete legal-move set before producing an unbounded policy residual and a separate parent value.

The model is deliberately not browser-sized and has no quantized export. Capacity comes first; compression is allowed only after the teacher task is shown to be learnable.

## Data audit

Known evaluations, fresh selection semantics, and fresh final semantics are excluded before fitting.

| Distribution | Input | Retained | Dropped | Fit | Tune |
|---|---:|---:|---:|---:|---:|
| Browser all-legal | 1,334 parents | 1,071 | 263 | 875 | 196 |
| V9 | 23,980 parents | 23,675 | 305 | 19,264 | 4,411 |

The split operates on whole game-plus-semantic connected components. Game overlap, parent/child semantic overlap, and cross-domain semantic overlap are all zero.

The original label-free fresh-final role also needed correction. Although its labels had never been generated, 59 of 200 games touched semantic positions exposed by later evaluations. Dropping each contaminated game whole, without looking at a teacher label, leaves 141 games and 3,384 parents:

| Clean derivative | Value |
|---|---:|
| Raw bytes | 2,165,346 |
| SHA-256 | `d2285225aab6612506536931933410b8a285cc573c5bd6c8feabdd0fe7501626` |
| Protected semantic IDs | 284,117 |
| Known-evaluation overlap | 0 |

No labels are generated for this derivative until both capacity seeds have been frozen.

## Registered gates

First, a fixed 256-parent Browser plus 1,024-parent V9 sentinel runs for 40 epochs. Both domains must reach at least 85% top-1 and 98% pairwise accuracy. The sentinel weights are discarded. A miss stops the experiment before full training.

The internal tune gate is:

| Tune domain | Exact live baseline | Required candidate |
|---|---|---|
| Browser, 196 parents | top-1 16/196; pair 0.663704 | top-1 at least 26/196; pair at least 0.673704; no regret regression |
| V9, 4,411 parents | top-1 24.44%; pair 0.598464 | top-1 loss no more than 0.5 points; pair loss no more than 0.002 |

Seed 314159 runs only if seed 42 passes every check. No extra seed, epoch, feature variant, or threshold relaxation is permitted after observing a failure.

After both checkpoint hashes are fixed, a deterministic 512-parent sample spread across at least 128 clean games receives all-legal independent depth-12 labels. Each seed must beat live by 26 top-1 parents, 0.01 pair accuracy, and 0.01 NDCG@5, with one-sided McNemar `p≤0.05`.

## Compute plan

Browser parents average 83.97 legal moves and reach 267; V9 averages 11.62 and reaches 13. They use separate microbatches and fixed move-count buckets of 16/32/64/96/128/192/272. This avoids padding V9 to Browser shapes and reduces repeated MPS graph compilation.

One heavy MPS training process uses the M4 Pro. Running several jobs against the same integrated GPU would compete for the same compute and memory. CPU data validation, tests, documentation, and review work can continue in parallel. The pre-implementation estimate is 20–60 minutes for an eight-epoch-class run; the full seed-42 estimate will be updated from the first measured steps.

## Current state

- Pre-optimizer audit over the real inputs: complete.
- 5,953,522-parameter model and runner: implemented.
- Tests for live-baseline initialization, permutation equivariance, padding invariance, loss direction, tiny fitting, canonical identities, deterministic batching, protocol identity, and all-required gates: implemented.
- One MPS forward/backward/optimizer smoke step: passed in 4.28 seconds including first graph compilation.
- MPS training: not started until the prospective implementation is fixed in Git.
- Sealed teacher generation, WASM integration, matches, and live mutation: not started.

The machine-readable inputs, hashes, split receipts, baselines, architecture, and gates are in [shogi-capacity-policy-value-plan-2026-07-26.json](./data/shogi-capacity-policy-value-plan-2026-07-26.json).
