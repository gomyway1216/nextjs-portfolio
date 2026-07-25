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

## Status at preregistration

Everything above was fixed before execution. At that point dataset extraction, training, and matches had not started; full input hashes, fixed conditions, and stop rules were recorded in the [machine-readable plan](../ml/protocols/halfkp-alpha050-balanced-pure-depth12-v1-plan.json).

## Results

Deterministic sampling completed in 6.45 seconds. The 200,000-position training set contained 100,000 positions per side to move, and the 2,968-position validation set contained 1,484 per side. Both matched the planned balance, and the single training epoch completed. The full training process took 12.1 seconds, including 4.8 seconds for the epoch itself.

Static validation loss improved from `0.062198` to `0.053685`, MAE from 594.1cp to 531.3cp, and pair accuracy from `0.6357` to `0.6471`. These values measure teacher approximation, not playing strength. An independent audit then found that this run had violated the preregistered contract before it could reach the quantization gate.

The saved execution arguments were `rank_weight=1.0`, `policy_weight=0.25`, and `experiment_plan=''`. The preregistration fixed both rank and policy weights at zero and required the execution to be bound to the machine-readable plan. The dataset has no ranking or policy teacher, so the nonzero weights may not have contributed to the loss, but that does not cure a violation of the fixed execution contract.

The curve and checkpoint also recorded epoch-zero `train_loss=NaN`, `val_sibling_pair_acc=NaN`, and `val_sibling_top1=NaN`. This strictly failed the requirement that every recorded metric be finite. The primary decision is therefore `preregistration-contract-invalid`, and the checkpoint is not a valid candidate.

Quantization error supplied a second failure that independent recomputation confirmed. The final audit recovered the exact command from the session log: it used the balanced validation file with `--verify-n 2968`. There was no dedicated receipt file at the run root, but the saved artifacts and exact command were sufficient to recompute all 2,968 positions.

| Weights   |    Mean absolute error |     Max absolute error |
| --------- | ---------------------: | ---------------------: |
| Base      |  `29.49924202633157cp` |  `209.0002596847653cp` |
| Candidate | `25.497765624146755cp` | `229.96719146338023cp` |

The candidate-to-base mean ratio improved to `0.8643532468185785`, but the maximum ratio worsened to `1.1003201230957287`. The mean passed, while the maximum exceeded the preregistered `1.05` limit, so the quantization gate is a secondary failure. A previous audit obtained different values from the first 200 positions because it mistakenly compared a prefix with the full-set measurement. This independent reproduction confirms the quantization failure; it does not cure the primary execution-contract violation.

This invalid run will not be rerun. The downstream PyTorch, TorchScript, and WASM parity check and the 56-game screen did not run. Direct play therefore establishes neither a gain nor a regression, and the experiment did not expand to 800,000 positions, depth 16, or additional seeds. Live weights remain at SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`, with zero production changes.
