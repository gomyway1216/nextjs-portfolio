# The three-seed constrained alignment v2 run is complete

> On July 20, 2026, constrained alignment v2 completed concurrently for seeds
> 42, 43, and 44 on the local Mac. Its purpose is to reduce the representation
> gap between float evaluation and production int16 evaluation. None of the
> parent's seven integer tensors changed by even one bit. This is therefore not
> evidence of stronger play, high-dan strength, candidate selection, or a live
> promotion. [日本語版](./blog-shogi-floodgate-strength-first-constrained-alignment-v2-completion.md)

## Execution result

The three seeds ran concurrently with two Torch threads each. An operator
transcribed 92.69 wall seconds, 263.29 user seconds, 63.90 system seconds, a
1,860,321,280-byte maximum resident set size, and zero swaps from the terminal's
`/usr/bin/time -lp` output. These timing and resource values are explicitly a
reference observation, not a raw receipt authenticated by the registry builder.
The jobs read only the original 278,736 rows / 23,980 parents; replay,
selection, and final-holdout data were not read.

| seed | int-target cache | epoch 21 → 24 loss | epoch-24 policy KL | `result.json` | `final.pt` |
| ---: | ---: | --- | ---: | --- | --- |
| 42 | 6.7437 s | 0.0059724 → 0.0031964 → 0.0022139 → 0.0017836 | 0.00017521 | 8,306 bytes / `3cce48e8…402b` | 2,381,393 bytes / `5140b3fb…fd88` |
| 43 | 6.7866 s | 0.0058711 → 0.0031672 → 0.0022037 → 0.0017856 | 0.00017131 | 8,307 bytes / `1dda7687…cd68` | 2,381,393 bytes / `649898e8…af9` |
| 44 | 6.6411 s | 0.0062094 → 0.0033325 → 0.0023152 → 0.0018715 | 0.00018006 | 8,308 bytes / `ce5f354a…246d` | 2,381,393 bytes / `a3e894b4…02ae` |

Each seed computed its 278,736 exact integer targets once and reused that fixed
cache for all four epochs. The run revision was
`a6fefc3f41543e35b9745da7f22fc8c7f2f6112f`. The machine record and registry
retain every epoch's loss, Huber term, policy KL, time, and restored-coordinate
counts without rounding them away.

## Why this run does not mean “stronger”

The procedure could move each float parameter only within its parent's existing
quantization cell. After production int16 conversion, `w1_board`, `w1_hand`,
`b1`, `w2`, `b2`, `w3`, and `b3` are exactly the parent's tensors. Therefore
the integer evaluator's moves and playing strength cannot change from this step
alone. The reduced loss measures how faithfully the float representation tracks
that same integer evaluator; it is not a game win rate.

This representation-only repair addresses the earlier family-gate miss, where
otherwise strong candidates had small float-versus-int16 metric gaps. It used no
selection labels. The spent selection set will next check representation only
and will not support a strength claim. Strength must be measured separately on
the untouched fresh-final set, in formal A/B games, and through external
calibration.

## Independent verification and the live boundary

Separately from each result's self-report, all three parent checkpoints and all
three v2 checkpoints were strict-loaded, quantized again, and compared with
`torch.equal`. All 3 seeds × 7 tensors = 21 comparisons passed. Before opening
any parent artifact, the builder also requires each result's parent identity to
equal the fixed plan's same-seed parent exactly. Exact result/checkpoint sizes
and SHA-256 hashes are pinned in a registry that the argumentless builder can
regenerate byte-for-byte.

In a separate operator observation, production `public/shogi-nnue-weights.bin`
remains 1,185,988 bytes with SHA-256
`e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`.
It is Git-clean and this run made zero live changes. It will stay unchanged
unless selection, holdout, formal A/B, and external calibration evidence passes.

Machine-readable record:
[floodgate-strength-first-constrained-alignment-v2-completion-2026-07-20.json](./data/floodgate-strength-first-constrained-alignment-v2-completion-2026-07-20.json)
