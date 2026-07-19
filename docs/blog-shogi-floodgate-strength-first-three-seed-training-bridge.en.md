# Strength-first three-seed training bridge prepared

> On July 19, 2026, we implemented and validated a bridge and argumentless local launcher
> that will connect the future 24,000-parent training-only teacher dataset to fixed
> three-seed warm-start training. **The exact plan is intentionally absent because the real
> 24,000-parent teacher artifact byte identities do not exist yet. The current command stops
> before reading the Git revision, creating a subprocess, or loading Torch.** Real teacher
> generation, training, candidates, and live-weight changes all remain zero. Japanese version:
> [blog-shogi-floodgate-strength-first-three-seed-training-bridge.md](./blog-shogi-floodgate-strength-first-three-seed-training-bridge.md)

## Current state

| Item                                         | State                     |
| -------------------------------------------- | ------------------------- |
| bridge / argumentless Python launcher        | implemented and validated |
| future exact plan                            | intentionally absent      |
| direct argumentless command                  | exit 1 / expected STOP    |
| Git revision reads / training subprocesses   | 0 / 0                     |
| Torch loads / real training                  | 0 / 0                     |
| real 24,000 teacher / completed training run | 0 / 0                     |
| candidate selections / live-weight changes   | 0 / 0                     |
| focused / full stdlib                        | 23/23 and 190/190 PASS    |
| independent rereview                         | P0 / P1 / P2 = 0 / 0 / 0  |

`ml/protocols/floodgate-q1-2026-strength-first-qat-training-plan.json` is a future
data-only plan that must contain file identities observed after the real teacher finishes.
Creating it now with invented or provisional hashes would leave room to train on a different
dataset. The plan loader therefore runs first, and the missing file safely stops this direct
command:

```sh
python3 ml/run_strength_first_three_seed_training.py
```

The observed exit code was 1, with a STOP requiring the exact data-only plan after the real
24,000-parent teacher artifacts exist. Plan loading precedes the revision reader, local input
scan, `subprocess.Popen`, `train.py`, and Torch, so checking this STOP does not start training
processes or open the large datasets. `package.json` is unchanged, and no npm script was added.

## Revalidating the flat teacher root as one training source

The future plan will bind individual byte lengths and SHA-256 identities for these five files
under the private flat root
`~/.codex/shogi-runs/floodgate-q1-2026-strength-first-v6`:

| File                      | Relationship verified by the bridge                                    |
| ------------------------- | ---------------------------------------------------------------------- |
| `work.jsonl`              | matches the teacher result's staged `work` binding                     |
| `result.json`             | carries 24,000 completion and every staged-output binding              |
| `manifest.json`           | exposes only training-only `train` output and the same completion      |
| `train.jsonl`             | matches plan, manifest, and result identities, then is rescanned       |
| `parent-completion.jsonl` | matches plan, manifest, and result and accounts for all 24,000 parents |

The bridge also binds the role bundle's `training.raw.jsonl` into the same plan. It
cross-checks `work`, `train`, `parent_completion`, and `manifest` from the teacher result,
plus `train` and `parent_completion` from the teacher manifest. It then feeds raw training
input, completion, and train bytes back through the neutral scanner. This recomputes the
exclusive forced-skip-or-emitted-group disposition, group records and digests, parent order,
and game/parent/semantic-position accounting. Matching declarations with different source
bytes still STOP.

Only the exact fixed path can enter the strength-first route; near names and symlinked plans
are rejected. The plan is read again after tracked-revision verification so an in-flight
change is also rejected.

## Concurrent three-seed training after plan enrollment

Only after a plan containing the real artifact identities is added will the launcher spawn
seeds 42, 43, and 44 before it starts polling. All three processes run concurrently; one
failure stops the remaining processes. Every slot has this fixed contract:

| Setting                 | Fixed value                                                        |
| ----------------------- | ------------------------------------------------------------------ |
| initializer             | fixed warm model-only initializer                                  |
| learning rate           | `1e-4`                                                             |
| epochs / batch          | `20` / `256`                                                       |
| device                  | CPU                                                                |
| threads                 | two Torch threads and one interop thread per process               |
| seeds                   | `42`, `43`, `44`                                                   |
| output                  | `ml/runs/floodgate-q1-2026-strength-first-int16-aware/seed-{seed}` |
| internal selection data | none                                                               |

Only model parameters are loaded from the warm initializer; optimizer and scheduler start
fresh. All three runs use the same training-only source, fixed replay, and fixed
hyperparameters. There is no early stopping or intermediate-epoch choice: the fixed final
epoch checkpoint is the candidate artifact.

## Training-only authority boundary

The bridge can issue training contracts only. It has no authority to read selection or
holdout labels, choose a candidate, or write production weights. Holdout and selection
protected-ID lists may be used to reject data leakage, but they are not paths to labels.

Even three completed processes do not select a candidate. A later stage must validate all
three final checkpoints and proceed through fresh selection, sealed holdouts, formal A/B, and
external calibration. This bridge makes no claim of improved playing strength, high-dan
calibration, or live promotion. Because real data is not available, it also invents no
training-duration or strength estimate.

## Validation

The focused stdlib suite for the bridge, launcher, and exact-plan dispatch passed 23/23. The
full ML stdlib suite passed 190/190 in 12.04 seconds. Coverage includes the expected direct
STOP, no revision/process dispatch without a plan, spawning all three seeds before polling,
the frozen training command, source cross-binding, byte drift, rejection of near/symlinked
paths, and stopping remaining processes after one seed fails. The diff check passed and
`package.json` is clean. Independent rereview found P0 / P1 / P2 = 0 / 0 / 0.

The next change waits for the real teacher run and enrolls only its observed byte lengths and
SHA-256 values in the exact data-only plan. The STOP remains in place until then.

Machine-readable record:
[floodgate-strength-first-three-seed-training-bridge-2026-07-19.json](./data/floodgate-strength-first-three-seed-training-bridge-2026-07-19.json)
