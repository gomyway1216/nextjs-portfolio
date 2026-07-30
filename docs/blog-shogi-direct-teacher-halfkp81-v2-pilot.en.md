# Direct-teacher HalfKP81 v2: freeze the next 56 games first

> As of July 29, 2026, the immutable pilot dataset has been generated with **223,834 rows** (200,944 train and 22,890 validation). Optimizer creation, training, static evaluation, and match play remain at **zero**. The protocol, create-only dataset builder, and paired56 controller are proceeding in sequence, but the AI is not stronger yet and the live weights have not changed by one byte. [日本語](./blog-shogi-direct-teacher-halfkp81-v2-pilot.md)

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

The first real-data attempt stopped safely at source line 171. V9 contains 276,209 rows with the base keyset and 2,527 canonical mate rows that add `teacher_mate` and `teacher_mate_sign`; the first builder rejected the latter as unregistered fields. It created no output directory and did not consume the one-shot experiment. The fix permits only those two exact keysets. For mate rows it requires a nonzero integer mate value, a ±1 sign matching that value, `teacher_score_kind == "mate"`, and child-side CP equal to `-sign × (1,000,000 - |mate|)`. Any other field or inconsistency still stops publication.

After that fix was merged, real-data generation completed successfully. Deduplication and permanent exclusion produced **223,834 rows** (**200,944 train** and **22,890 validation**), bound by completion-receipt SHA-256 `67dc301590999aad2f1b4fe1dc8e847f21535bb01a160d764f650d3cb64057da`. This does not establish training success or playing strength; it means only that the authenticated input for the frozen one epoch now exists.

## Two stop gates

The pilot does not proceed directly from training to a long match. It must first pass every validation check:

- zero non-finite values, technical faults, export round-trip mismatches, and WASM parity mismatches;
- teacher MAE improves by at least 5 CP over the initializer;
- pair accuracy declines by no more than 0.2 percentage points;
- quantized mean and maximum CP error stay within 1.05 times the initializer;
- research-runtime search slowdown stays within 5%.

These checks screen catastrophic regressions; they are not playing-strength evidence. Only the single candidate that passes every check may enter the frozen 56-game screen. Its threshold is 62 / 112 half-points, or 55.36%. Futility stopping is allowed only when winning every remaining half-point could no longer reach 62.

Any miss closes this objective and pilot family. It forbids adding data, epochs, seeds, checkpoints, retries, or changing a threshold after seeing the result. Even a pass authorizes only a separately preregistered expanded-data stage—not formal A/B, external high-dan calibration, or a live write.

## Boundaries enforced by the paired56 controller

The match openings were frozen in a separate manifest before seeing any training result. The validator authenticates the complete prior-opening inventory of **3,198 fingerprints** by both file SHA-256 and canonical-list SHA-256, then uses the same generator as the fixed-time match harness starting at seed `1200001`. The first 28 seeds all had zero intersection with the prior inventory and zero duplicates within the selection, so seeds `1200001` through `1200028` were frozen directly. This check is separate from the dataset protected-position sets. Screen-plan preparation revalidates both facts: the dataset manifest proves zero tune/protected overlap, and the opening manifest proves zero prior-match-opening overlap.

The controller does not treat the trainer result itself as strength evidence. It creates a content-addressed, create-only screen plan only after this complete identity chain agrees:

- protocol → dataset manifest → execution plan;
- final-epoch trainer result → candidate weights (81 buckets);
- runtime sanity → initializer/candidate weights and the HalfKP81 research WASM;
- static sanity → all nine checks pass with zero technical faults;
- opening manifest → 28 pairs, 1.5 seconds per move, color reversal, and 12 workers.

The legacy harness keeps its 256-ply default, while the v2 plan explicitly requires `--max-plies 512`. It uses no opening book, external mate solver, or fallback. Every pair log, pair receipt, journal attempt, fault, and result is create-only; existing evidence is never overwritten.

The result classes are intentionally distinct. A completed score below 62 / 112, or mathematical futility, is a **playing-strength failure** that closes the pilot family and cannot resume. A subprocess, asset, or receipt **technical fault** produces no strength conclusion. Only that fault may resume, and only with the same screen-plan SHA-256, candidate/live hashes, openings, and threshold. Neither result authorizes a live write.

The frozen openings can be validated without playing a game:

```bash
PYTHONPATH=ml python3 ml/direct_teacher_halfkp81_v2_screen.py \
  validate-openings --repo-root .
```

Only after training and every static-sanity check pass may `prepare` create the screen plan. `run` then requires that plan's explicit SHA-256; there is no run-first path that bypasses authority. This PR tests pass, strength failure, technical fault, and resume behavior with synthetic receipts and runs no real game.

## Current measured state

| Stage | Count | State |
|---|---:|---|
| Protocol / validator | one set | implemented and tested |
| Create-only dataset builder | one set | mate-keyset fix merged and real run complete |
| Fresh opening manifest | 28 pairs | zero overlap with 3,198 prior fingerprints; frozen before training |
| Paired56 controller | one set | implemented and synthetic-tested; zero real games |
| Pilot dataset | 223,834 rows | 200,944 train, 22,890 validation, receipt authenticated |
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

This command does not open the future dataset and grants no authority to create an optimizer, checkpoint, match, or live write. The next meaningful progress report is not “a PR exists”; it is the measured result of the permanently filtered pilot dataset, the fixed one epoch, static sanity, and the fixed 56 games.
