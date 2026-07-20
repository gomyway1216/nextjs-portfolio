# Shogi evaluation: removing two manual registry handoffs after training

> On July 20, 2026, we implemented two argumentless builders. One produces the
> checkpoint-preflight registry candidate after three-seed training; the other produces the
> evaluator registry candidate after the fresh-selection teacher completes. The repository
> still has no exact training plan, so both production commands made an expected exit-1 STOP
> with zero stdout bytes. Real three-seed training, real fresh-selection teaching, candidate
> selection, registry writes, and live-weight changes all remain zero. Japanese version:
> [blog-shogi-floodgate-strength-first-post-teacher-registry-candidates.md](./blog-shogi-floodgate-strength-first-post-teacher-registry-candidates.md)

## Conclusion

This change removes two manual identity-copying steps from the strength pipeline:

1. copying the bytes, schema, and revision identities of three training results and
   checkpoints into the checkpoint-preflight registry; and
2. copying the selection teacher, dataset, stable checkpoint, and evaluator implementation
   identities into the evaluator registry.

Each builder emits a candidate only on stdout and never writes a tracked registry. The output
becomes authority only through a separate data-only PR, review, CI, and regular merge. This
change does not run a teacher, take an optimizer step, select a candidate, or make the AI
stronger yet.

## Straight-line execution order

| Order | Stage                                                                           | Automated by this change |
| ----: | ------------------------------------------------------------------------------- | ------------------------ |
|     1 | After the 24,000-parent teacher, run the existing plan builder                  | no; existing code        |
|     2 | Review, validate, and regular-merge an exact-plan-only PR                       | independent human gate   |
|     3 | Train seeds 42, 43, and 44 concurrently                                         | no; existing launcher    |
|     4 | Run the preflight-registry candidate builder                                    | builder A                |
|     5 | Review, validate, and regular-merge its data-only PR                            | independent human gate   |
|     6 | Run the fixed 4,800-parent / 200-game fresh-selection teacher locally           | no; existing runner      |
|     7 | Run the evaluator-registry candidate builder                                    | builder B                |
|     8 | Review, validate, and regular-merge its data-only PR                            | independent human gate   |
|     9 | Evaluate all three candidates on the same fresh selection and apply fixed gates | existing evaluator       |

Sealed final holdout, regressions, browser/production parity, formal paired A/B, and external
calibration still follow. Live weights stay unchanged until all evidence is complete.

## Builder A: project three checkpoints into the preflight registry

```sh
python3 ml/build_strength_first_selection_preflight_registry_candidate.py
```

Builder A reads the tracked plan and tracked preflight registry from exact current HEAD, then
reads each seed's `result.json` and `final.pt`. It requires seeds 42, 43, and 44 to share one
clean training revision, runtime, plan, slot layout, and training contract. All three
checkpoints are strict-loaded through the existing model validator.

Only then does it emit one pretty-printed JSON document plus LF with the existing
`shogi-floodgate-strength-first-qat-selection-preflight-registry-v1` READY layout. If the
tracked registry is already READY, only an identical idempotent recomputation succeeds.

This builder does not read a selection source, selection labels, final holdout, or any
live-weight path. Inputs must be canonical regular files with link count one. The descriptor
opened with `O_NOFOLLOW` must match the path snapshot before the first byte is read, and the
identity is checked again after reading and before return. It has no registry-write,
candidate-selection, or production-weight-write authority.

## Builder B: project completed teacher artifacts into the evaluator registry

```sh
python3 ml/build_strength_first_selection_evaluator_registry_candidate.py
```

Builder B first fixes the tracked evaluator registry and five implementation identities from
exact current HEAD: evaluator, adapter, preflight, real evaluation core, and metric gates. It
then runs the existing public preflight and accepts only a summary proving that all three
checkpoints were strict-loaded while the selection source remained unopened.

Only after both gates succeed does it read the fixed private selection-teacher authority,
manifest, result, selection dataset, and stable checkpoint. Existing validators recheck the canonical
checkpoint-preflight payload SHA-256 without a trailing LF, cross-bind the teacher documents,
bind the dataset identity, and enforce the READY gates. The stable checkpoint is cross-bound
by exact path, bytes, and SHA-256 to the authenticated tracked plan's `warm_initializer`.
Large artifacts must also be canonical, single-link regular files. Descriptor identity is
checked before the first byte is stream-hashed, and fingerprints are recomputed immediately
before stdout emission.

Builder B does not read the fresh-selection raw source, selection receipt, final holdout, or a
live-weight path. The emitted registry keeps `final_holdout_read_authorized` and
`production_weight_write_authorized` false. An existing READY registry is accepted only when
it is an exact idempotent recomputation.

## Current production STOP observations

Both commands were run from a clean exact revision after regular-merging updated origin/main.

| Command                      | Exit |  Stdout | Stop reason                                                        | Tracked writes / live changes |
| ---------------------------- | ---: | ------: | ------------------------------------------------------------------ | ----------------------------: |
| preflight-registry candidate |    1 | 0 bytes | exact training plan is not enrolled                                |                         0 / 0 |
| evaluator-registry candidate |    1 | 0 bytes | plan and three final identities are absent, so preflight is closed |                         0 / 0 |

A builder implementation is therefore not a real candidate. At publication there is no
enrolled training plan, three-seed training artifact, fresh-selection teacher artifact,
candidate selection, formal A/B result, or live promotion from this path.

## Why training needs a persistent worktree

Real training outputs live under Git-ignored `ml/runs/` and are local to one worktree. After
the plan is merged, training must start in a persistent worktree created from updated main and
remain there until all three seeds complete. Switching worktrees can preserve identical code
while making the local results and checkpoints disappear from the launcher.

HEAD must not change during training, and `git clean -fdx` must not be used. If a seed
directory exists only partially, the launcher must stop for manual inspection instead of
deleting, overwriting, or silently rerunning it. This prevents completed seeds from being
mixed with another revision.

## Validation and limit

The builder-only focused suite passes 19/19 in 0.131 seconds. The focused suite adding the existing plan,
launcher, preflight, teacher preflight, and evaluator passes 68/68. The full ML stdlib passes
312/312 in 24.754 seconds. Python compile, changed-file Ruff, Black, and the diff check also
pass. Coverage
includes three-checkpoint strict loading, READY idempotence, stdout-only behavior, tracked
input revalidation, symlink and hard-link rejection, dataset/teacher-authority cross-binding,
same-size/different-SHA stable-to-plan rejection, zero-byte reads from an open-time substituted
path, stable-fingerprint drift, an exact private-read allowlist, and zero final-holdout/live
access.

All execution and validation happened on this Mac. It used no network, AWS, Firebase/GCP, or
Vercel. AWS is not required for either model improvement or this handoff. Firebase/GCP serves
a separate backend role and Vercel serves web deployment; neither supplies compute to this
local training and selection path.

Machine-readable record:
[floodgate-strength-first-post-teacher-registry-candidates-2026-07-20.json](./data/floodgate-strength-first-post-teacher-registry-candidates-2026-07-20.json)
