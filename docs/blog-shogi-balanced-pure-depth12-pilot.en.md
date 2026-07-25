# B12: Preregistering one color-balanced, pure depth-12 update

_July 25, 2026_

[日本語版](./blog-shogi-balanced-pure-depth12-pilot.md)

## The question

The next experiment starts from the existing alpha-0.50 HalfKP initializer and performs one epoch of value-only training on YaneuraOu depth-12 `cp` targets. There is exactly one candidate: **B12-alpha050-balanced-pure-v1**. We will not add learning rates, seeds, or epochs after seeing the results.

The objective is not to improve a static agreement number. It is to quickly reject or support a playing-strength hypothesis by testing the candidate directly against the current live baseline.

## Inputs and dataset

Every local input was rechecked with its full byte count, row count, and SHA-256. The existing depth-12 teacher data came from games whose players were rated at least 3000, and its original split has no cross-split game or semantic-position overlap.

- Training source: 800,000 positions (402,090 black to move; 397,910 white)
- Validation source: 3,000 positions (1,484 black to move; 1,516 white)
- Training subset: 200,000 positions (100,000 per side)
- Validation subset: 2,968 positions (1,484 per side)

Selection uses a fixed seed and SHA-256 rank, so identical inputs produce identical rows. The derived files do not exist yet, so their planned SHA-256 values deliberately remain `null`. Their manifest will receive final hashes only after every dataset check passes.

## Fixed training arm

The run updates all HalfKP-factor parameters for one epoch: batch 1024, learning rate `1e-5`, seed 42, sigmoid value loss, and zero WDL mixing. It adds no outcome, ranking, policy, or sibling target. Epoch one is the sole candidate; there is no validation-driven best-of selection.

Before direct play, the candidate must have finite values, export to the int16 research format, and be bit-exact across PyTorch, TorchScript, and WASM on at least 200 frozen positions. Quantization error and live-file immutability are also gated. Validation loss and teacher agreement remain diagnostics, not strength decisions.

## Decision and stop rule

Only a correctness-passing candidate plays 56 games against the immutable live baseline: 28 fresh color-swapped opening pairs, 1.5 seconds per move, seven pair workers, no opening book, and no mate solver. Technical faults and illegal moves must both be zero. Passing requires at least 62 of 112 candidate halfpoints. Early termination is allowed only when that score is mathematically unreachable.

A failure stops the B12 family. It does not automatically trigger 800k training, depth 16, extra seeds, or additional hyperparameter arms. A pass authorizes only a separately preregistered, independent 96-game confirmation.

## Current status

This is a prospective plan. Dataset extraction, training, and matches have not started; it reports no strength gain. Live weights and production remain unchanged. Full input hashes, fixed conditions, and stop rules are in the [machine-readable plan](../ml/protocols/halfkp-alpha050-balanced-pure-depth12-v1-plan.json).
