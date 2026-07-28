# Shogi child-board capacity v3: change representation only

> Capacity v1 and objective-only v2 both missed at least one of the four fixed in-sample sentinel checks. V3 directly encodes the board after each legal move and changes architecture only, testing the representation-limit hypothesis. It has not run yet and makes no claim of a pass or stronger play. [日本語](./blog-shogi-child-board-capacity-v3-plan.md)

## Why v3 is next

V1 and v2 used the same 5,953,522-parameter model, data, 1,280 parents, and 40 epochs. Aligning the v2 loss with the gates made top-1 pass on both domains, while pair accuracy still missed on both.

| Metric | V1 | V2 | Fixed gate |
|---|---:|---:|---:|
| Browser top-1 | 179/256 (69.92%) | 222/256 (86.72%) | at least 85% |
| Browser pair | 73.85% | 73.08% | at least 98% |
| V9 top-1 | 811/1,024 (79.20%) | 921/1,024 (89.94%) | at least 85% |
| V9 pair | 87.00% | 84.85% | at least 98% |

The v2 objective change affected top-1 but did not resolve the pair deficit. That is not evidence that a child-board encoder will pass. It does justify changing representation next instead of adding epochs to the same objective or relaxing a threshold.

The external v1 result is 25,048 bytes with SHA-256 `d7fd48f709bcd149330c8ff86eb4e878aa1b5156d6dde9fe62c2fd6fd55f6cf2`. The external v2 result is 25,053 bytes with SHA-256 `1f16f030d52d2aff1d8009614aaeb2183a68b462e212933924fae594c2136e3a`. Both closed as `complete-sentinel-rejected`.

## What v3 changes

The only change is a small child-board encoder that reads the authenticated `child_sfen` for every legal move.

1. Convert each position after a legal move into the existing 43-plane form:
   - 28 side-to-move-normalized piece-occupancy planes
   - 14 hand-count planes normalized by physical maxima
   - one clipped ply plane
2. Encode valid legal moves only with one CNN shared by every move:
   - 43-to-16 3×3 convolution, GroupNorm 4, and GELU
   - two 16-channel residual blocks
   - flatten 16×9×9, then Linear 1296-to-128 and LayerNorm 128
3. Concatenate the 128-dimensional child-board vector to the existing 721-dimensional move input and project 849-to-256.

`child_sfen` is neither a new dataset nor a new teacher label. It is a deterministic view already carried by each registered row. Training must stop before optimizer creation unless applying the legal move to `parent_sfen` agrees with both `child_sfen` and `child_position_id`.

## Parameter delta

| Item | Parameters |
|---|---:|
| V2 model | 5,953,522 |
| Child stem | 6,224 |
| Two 16-channel residual blocks | 9,344 |
| Child projection and normalization | 166,272 |
| Move-projection widening from 721 to 849 | 32,768 |
| Added in v3 | 214,608 |
| V3 total | 6,168,130 |

The increase is 214,608 parameters, about 3.60% over v2. FP32 weight bytes rise from 23,814,088 to 24,672,520.

The 64-channel, six-block parent encoder, four-layer Set Transformer, policy/value heads, frozen live-CP anchor, and output semantics remain unchanged. V3 may not load discarded v1 or v2 weights; it initializes from scratch under the fixed seed.

## What remains fixed from v2

Everything except architecture is identical to v2.

| Item | Fixed v3 value |
|---|---|
| Objective | `gate-aligned-micro-pair-hard-negative-v2` |
| Loss | listwise 1, domain-micro pair 1, tie-aware hardest-negative 1, move value 0.20, state value 0 |
| Sentinel | 256 Browser parents and 1,024 V9 parents |
| Sentinel parent receipts | Browser `2396e593...d6c4`; V9 `66bc3669...5a3` |
| Sentinel seed / epochs | `20260726` / 40 |
| Batch | Browser 32; V9 256 |
| Optimizer | AdamW, learning rate 0.0003, weight decay 0.0001, gradient clip 5 |
| Sentinel gate | Top-1 at least 85% and pair at least 98% on both domains; all four mandatory |
| Full training | four V9-pretrain epochs plus 12 mixed epochs |
| Candidate seeds | 42; 314159 only after every known-tune check passes |

Input files and byte/hash receipts, the protected-position union, game-semantic split, fit/tune counts, live baseline, known-tune gate, replication rule, and 512-parent sealed rule are also byte-exact with v2. No known-eval, tune, or sealed labels or candidate outcomes were used to design v3.

## Branches after the verdict

The first and only initial run is the 40-epoch sentinel.

- If any of four checks fails: discard the weights and stop before full training, seed 42, seed 314159, known-tune candidate selection, sealed teacher generation, distillation, WASM, direct play, or a live change. Do not add epochs or seeds, relax gates, widen the child encoder, or make a minor follow-up retry.
- If all four checks pass: authorize only the registered four-epoch V9 pretrain plus 12 mixed epochs for seed 42. This is not permission to change live weights.
- If seed 42 passes every known-tune check: authorize seed 314159 for the first time.
- If both seeds pass independently and both checkpoint hashes are fixed: allow the existing 512-parent sealed evaluation to open.
- Even a sealed pass needs separately registered runtime and direct-play evidence before any playing-strength or high-dan claim.

This sequence prevents a favorable static metric from being promoted directly into production.

## Fixed protocol

The v3 protocol was preregistered in [capacity-policy-value-v3-plan.json](../ml/protocols/capacity-policy-value-v3-plan.json).

- Schema: `shogi-capacity-policy-value-plan-v3`
- Model variant: `child-board-encoder-v3`
- Feature version: `dense-43-plane-resnet-set-policy-child16x2-v3`
- Bytes: 24,326
- SHA-256: `4cdda7ab438aef16332b545477eb7ac12047ef13c19432d621c03803fb67b2a6`

Architecture, objective, 40 epochs, and gates cannot be changed after observing the result.

## Current state

- V1 sentinel: rejected and closed.
- V2 sentinel: two top-1 checks passed, two pair checks failed; overall rejected and closed.
- V3 protocol: fixed.
- V3 sentinel: not run.
- V3 full training, seed 314159, and sealed teacher generation: unauthorized and not started.
- Distillation, WASM, and paired play: not started.
- Live weights: unchanged.

The measured v2 result and failure analysis are in the [objective-only v2 article](./blog-shogi-capacity-objective-v2-plan.en.md). The earlier history is in the [capacity v1 article](./blog-shogi-capacity-policy-value-plan.en.md).
