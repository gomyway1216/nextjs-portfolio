# Shogi child-board strength candidate v1: move authority to unseen data and play

> Child-board capacity v3 substantially improved in-sample top-1 and regret but missed its preregistered 98% all-pairs sentinel and closed. The next lane does not rescue or resume v3. It trains the same child-board shape from scratch under two new seeds, then advances through a fit-only production student, unseen tune, sealed 512, 768 formal games, and 200 external games. No optimizer or match has started, and live weights remain unchanged. [日本語](./blog-shogi-child-board-strength-candidate-v1-plan.md)

## What v3 established

The external v3 `result.json` is 25,096 bytes with SHA-256 `e9db86a37320345cc8418eb1f405dd5ef4e0c4187fcc8a1afff2f0e8fe4dd6d3`. It closed as `complete-sentinel-rejected`.

| V3 sentinel | Browser | V9 |
|---|---:|---:|
| Top-1 | 244/256 (95.31%) | 995/1,024 (97.17%) |
| Mean regret | 4.25 cp | 2.00 cp |
| Pair | 75.45% | 88.84% |
| Fixed pair gate | 98% | 98% |

The model almost always selected a teacher-best move and had low regret, yet it did not order 98% of all pairs separated by at least 50 cp. That does not retroactively pass v3. It does support moving authority away from an in-sample all-pairs memorization threshold and toward unseen data and direct play.

V3 weights, optimizer state, RNG state, and sentinel curve are spent evidence. This lane forbids loading, resuming, averaging, distilling, or quantizing them and forbids rerunning the v3 sentinel.

## This lane is not a v3 continuation

The new machine identities are:

- Schema: `shogi-child-board-strength-candidate-plan-v1`
- Status: `prospective-scratch-strength-candidate-lane-only`
- Model variant: `child-board-strength-candidate-v1`
- Result schema: `shogi-child-board-strength-candidate-result-v1`

The tensor shape remains the 6,168,130-parameter v3 shape, but the lane identity and weights are new. Every seed initializes every parameter from scratch. The large model is an offline root-policy teacher, not a production leaf evaluator.

## Phase 1: finish and lock two seeds

One runner and one MPS process must complete this exact sequence:

1. Initialize seed 42 from scratch.
2. Pretrain on V9 fit for four epochs.
3. Train on Browser/V9 fit for 12 mixed epochs.
4. Freeze only the final mixed-epoch-12 checkpoint.
5. Without reading a seed-42 score, initialize seed 314159 from scratch and repeat.
6. Bind both checkpoint byte/SHA identities into one terminal phase-1 result.

AdamW, learning rate `0.0003`, weight decay `0.0001`, gradient clip `5`, Browser batch `32`, V9 batch `256`, move buckets, 3:1 mixed ratio, and the v2 objective remain the registered recipe.

The only output is `/Users/yudaiyaguchi/.codex/shogi-runs/child-board-strength-candidate-v1-phase1`, created with create-only semantics before the first optimizer or protected-data read. A preexisting file or symlink stops execution. A directory also stops by default; the sole exception is technical-crash recovery when it contains the unique atomic checkpoint for the latest completed epoch of the same incomplete run and passes exact validation.

At the end of every pretrain or mixed epoch, the runner atomically replaces the last checkpoint containing model, optimizer, CPU/MPS RNG, seed, phase, completed epoch, protocol byte/SHA identity, and fit-only data receipt. After a ChatGPT, Mac, runner, or MPS-process crash, it may validate that one checkpoint at the fixed path and continue the same run from the next epoch. Tune remains unopened, so this technical continuation creates no statistical selection.

Publishing the atomic checkpoint defines epoch completion. A crash after the seed-42 final publication resumes by initializing fixed seed 314159 from scratch without replaying seed 42. A crash after the seed-314159 final publication permits only `terminalize-only` recovery: validate both final receipts and atomically write the terminal result without an optimizer, data read, or model forward.

There is no best-epoch selection, early stopping, seed-42 gate before seed 314159, or tune monitoring. A different output, scratch restart of the same seed, choice among checkpoints, rollback to an older epoch, replay of a completed epoch, unverifiable checkpoint, and retry after the terminal complete result are all forbidden. The success status is `complete-phase1-two-scratch-checkpoints-frozen-tune-locked`. Phase 1 ends without opening tune or sealed data.

## Phase 1b: fix the student/runtime contract before tune

Two frozen teacher checkpoints still do not unlock tune. A separate `child-board-root-policy-student-runtime-v1` protocol core must first merge to public `main` and fix:

- both teacher checkpoint hashes;
- a fit-only distillation or quantization recipe;
- student architecture, seed, and final-checkpoint rule;
- production runtime, parity, latency, and fail-closed gates; and
- the root-ordering-only boundary that forbids use as a leaf or TT value.

The fit-only student recipe then runs and freezes its student artifact hash. Tune and sealed labels or scores are forbidden as student-training inputs.

This order prevents rebuilding the student after seeing teacher tune results or swapping architecture after seeing student results.

Authority is separate at each step. Two frozen teachers authorize only binding and merging the core. The merged core authorizes one fit-only student training and freeze. Only phase 1b completion—with the final checkpoint and every runtime artifact hash fixed—authorizes tune.

## One-shot held-out tune

Only after both teachers and the production student are frozen may one bound evaluator invocation open the 196 Browser and 4,411 V9 parents.

The existing gates remain unchanged:

| Domain | Top-1 | Pair | Mean regret |
|---|---:|---:|---:|
| Browser 196 | at least 26 correct (live is 16) | at least `0.673703888923293` | at most `15924.158163265307` cp |
| Existing V9 gate | at least `0.23938902743142144` | at least `0.5964640986597398` | — |

Because the existing V9 gate allowed small regressions from live, this lane adds exact-live non-regression:

| V9 overlay | Fixed value |
|---|---:|
| Top-1 correct | at least 1,078/4,411 |
| Top-1 accuracy | at least `0.24438902743142144` |
| Pair | at least `0.5984640986597398` |
| Mean regret | at most `4863.386080253911` cp |

Seed 42, seed 314159, and the student must each pass every check. No training, seed or checkpoint selection, threshold change, or adoption-authority tune rerun is allowed after opening scores. Seed 42 is the preregistered distillation teacher regardless of results; seed 314159 is replication evidence only.

All six artifact/domain cells must publish atomically in one result with no partial display. A partial or incomplete result closes the lane; it cannot be resumed, rerun, or completed afterward.

## Sealed 512

Only a three-artifact tune pass opens the existing label-blind clean derivative. The fixed rule selects 512 parents and labels every legal move with the depth-12 teacher for the first time.

Before any candidate score is opened, label generation may exactly resume independent content-addressed shards bound to membership, teacher, depth, and protocol. Valid shards are immutable; only missing shards may be generated. Exactly 512 parents finalize one atomic label receipt binding ordered shard hashes. Three-artifact scoring then permits only one atomic result with no partial display; partial or incomplete scoring closes the lane.

Every artifact must satisfy all live-relative checks:

- Top-1 correct gain of at least 26
- Pair-accuracy gain of at least 0.01
- NDCG@5 gain of at least 0.01
- One-sided McNemar p at most 0.05

Both teachers and the student must pass independently. Auxiliary metrics, one passing seed, and partial results cannot rescue a miss.

## Roles of the large teacher and production student

The 6.17M child-board model is a policy teacher conditioned on parent, move, and legal-move set. It is not an ordinary position-value NNUE. Search leaves and TT values continue using the live NNUE whose SHA-256 begins `e4e738f9` and ends `28dc`.

The student may order legal root moves only. It cannot enter matches unless its separate protocol passes parity, latency, determinism, legal-move equality, and no-leaf-value-contamination gates.

## Formal 768 games

Only an admitted student may enter a new student-capable candidate adapter and registry. The existing formal v2 contributes only its match count, search settings, opening pairs, and bootstrap; its single-weight candidate adapter is not reusable.

Before game 1, the new registry binds the student tensor and manifest hashes, frozen live-NNUE hash, student-capable worker JavaScript and WASM hashes, parity and latency receipts, and stable/candidate commits.

- 384 unique opening pairs, one candidate-sente and one candidate-gote game each
- 768 games total
- Fixed depth 11, quiescence 10, `K=600`
- TT clear before every move, no book, no fallback, 512-ply limit
- Zero technical faults
- Pair bootstrap seed `20260710`, 100,000 replicates

The one-sided 95% lower bound above 45% is only a safety gate. External calibration requires the stronger claim: the two-sided 95% lower bound must be strictly above 50%. An incomplete or faulted run yields no adoption conclusion.

## External 200 games

Only a formal stronger-gate pass binds the exact student/runtime into the existing 81Dojo protocol. The external run also carries full provenance for the student tensor/manifest, live NNUE, worker/WASM, formal registry/adapter, and formal result:

- Official `COM_` account and official client
- Manual human relay; no server or UI automation
- Rated even games at 10 minutes plus 30 seconds
- Official auto-match without selected opponents
- Exactly 200 games

The primary rule requires every post-game rating from game 171 through game 200 to be at least 2050. This supports only a bounded claim for the exact candidate, account, hardware, client, time control, and pairing conditions—not a universal rank guarantee.

## Fixed protocol and current state

The machine-readable plan is fixed in [child-board-strength-candidate-v1-plan.json](../ml/protocols/child-board-strength-candidate-v1-plan.json).

- Bytes: 42,427
- SHA-256: `b9b8256433cec77da8d32a6d05018b9a5e405e5b57fdabe299490a5f9f90cfe2`

Phase 1 has not started. Checkpoints are 0/2, phase 1b is unstarted, tune is unopened, the student protocol is unmerged, sealed labels are zero, formal play is 0/768, external play is 0/200, and live changes are zero. No static gate independently authorizes a live change.

The measured v3 result is documented in the [child-board capacity v3 article](./blog-shogi-child-board-capacity-v3-plan.en.md). External boundaries are documented in the [81Dojo readiness article](./blog-shogi-external-81dojo-calibration-readiness.en.md).
