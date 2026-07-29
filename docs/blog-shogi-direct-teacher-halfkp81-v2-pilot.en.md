# Direct-teacher HalfKP81 v2: freeze the next 56 games first

> As of July 29, 2026, data generation, optimizer creation, training, static evaluation, and match play all remain at **zero**. The protocol and validators are now joined by an implemented and tested create-only dataset builder, but the actual data will be generated separately only after that code is merged. The AI is not stronger yet, and the live weights have not changed by one byte. [日本語](./blog-shogi-direct-teacher-halfkp81-v2-pilot.md)

## Why move to a different experiment

The preceding root-policy student family ended at its one-shot tune gate. On V9 tune, the student scored **855 / 4,411 Top-1 (19.38%)** versus the reference's **1,078 / 4,411 (24.44%)**; pair accuracy was **57.61%** versus **59.85%**. On Browser tune, the student reached **16 / 196 Top-1** and **56.47%** pair accuracy versus the reference's **19 / 196** and **66.55%**. There is no evidence-based reason to reopen that lane with more epochs or seeds.

The HalfKP81 alpha-0.50 candidate has a different, limited signal. It scored **31 wins, 20 losses, and 5 draws** in the 56-game screen and **53-37-6** in the independent 96 games. The formal 768 games, however, converged to **376-357-35, or 51.237%**, with a **47.721%** two-sided 95% lower bound from paired bootstrap resampling. This neither proves the candidate weak nor proves it stronger than live. Rather than adding unspecified training, the new pilot isolates one untested hypothesis.

The hypothesis is: **starting from the frozen alpha-0.50 weights and learning only direct YaneuraOu depth-16 child-position CP from the existing V9 fit role may preserve useful value structure better than the prior rank or outcome mixtures**. This is not a guarantee. It is a falsifiable hypothesis that can be rejected after 56 games.

## Values fixed before execution

| Item | Frozen value |
|---|---|
| Initializer | `alpha-050.pt`, 191,656,679 bytes, SHA-256 `ea36d0b9f0ecdf9543daf8f77fed42577ccc38deb6a964e8df78dc8549b6a8c4` |
| Immutable live reference | `public/shogi-nnue-weights.bin`, 1,185,988 bytes, SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc` |
| Teacher source | V9: 278,736 rows, 23,980 parents, 1,000 games; fit role only |
| Target | Child-side YaneuraOu depth-16 CP; no outcome, policy, rank, or neural-teacher target |
| Split | Assign whole `game_id` values to 90% train / 10% validation with SHA-256 |
| Model | HalfKP factor, all parameters trainable, one candidate |
| Objective | Direct scalar sigmoid BCE, K=600, CP clamp=3000, WDL=0, rank=0, policy=0 |
| Training | Seed 42, batch 2048, learning rate `3e-6`, AdamW, one epoch, final checkpoint only |
| Play | 28 unused openings with color reversal, 1.5 seconds per move, 56 games, 12 workers |
| Pass line | At least 62 / 112 candidate half-points, zero faults, every move legal |

The train/validation assignment unit is the **whole game**, not a row. The dataset cannot be published unless it proves zero parent, position, child-position, and semantic overlap against the already-spent 196 Browser tune parents, 4,411 V9 tune parents, the known-evaluation union, fresh selection, fresh final, and the previous protected union. Train and validation must also have zero game, parent, position, child-position, and semantic-position overlap with each other.

The builder authenticates source bytes and SHA-256 before reconstructing the V9 fit membership, then emits only integer child-side `teacher_child_cp` targets. Repeated `child_position_id` values are reduced to one row only when SFEN and CP agree; any disagreement stops publication instead of averaging or voting. The manifest records SHA-256 digests for each role's game, parent, position, child, and semantic ID sets. A completion receipt binds the output files, manifest, generator source, phase-1 receipt, and spent-tune receipt. Existing directories are never overwritten, and the receipt is created last.

## Two stop gates

The pilot does not proceed directly from training to a long match. It must first pass every validation check:

- zero non-finite values, technical faults, export round-trip mismatches, and WASM parity mismatches;
- teacher MAE improves by at least 5 CP over the initializer;
- pair accuracy declines by no more than 0.2 percentage points;
- quantized mean and maximum CP error stay within 1.05 times the initializer;
- research-runtime search slowdown stays within 5%.

These checks screen catastrophic regressions; they are not playing-strength evidence. Only the single candidate that passes every check may enter the frozen 56-game screen. Its threshold is 62 / 112 half-points, or 55.36%. Futility stopping is allowed only when winning every remaining half-point could no longer reach 62.

Any miss closes this objective and pilot family. It forbids adding data, epochs, seeds, checkpoints, retries, or changing a threshold after seeing the result. Even a pass authorizes only a separately preregistered expanded-data stage—not formal A/B, external high-dan calibration, or a live write.

## Current measured state

| Stage | Count | State |
|---|---:|---|
| Protocol / validator | one set | implemented and tested |
| Create-only dataset builder | one set | implemented and tested; run after merge |
| Pilot dataset | 0 rows | not generated |
| Optimizer / epoch | 0 / 0 | not started |
| Static sanity | 0 checks run | not executed |
| Paired screen | 0 / 56 games | not started |
| Expanded stage | 0 | unauthorized |
| Formal 768 / external 200 | 0 / 0 | unauthorized |
| Live-weight change | 0 bytes | forbidden |

The tracked protocol can be validated read-only with:

```bash
PYTHONPATH=ml python3 ml/build_direct_teacher_halfkp81_v2_plan.py --validate-only
```

This command does not open the future dataset and grants no authority to create an optimizer, checkpoint, match, or live write. The next meaningful progress report is not “a PR exists”; it is the measured result of the permanently filtered pilot dataset, the fixed one epoch, and the fixed 56 games.
