# Floodgate strength-first teacher runner implemented

> On July 19, 2026, we implemented and focused-tested a local Mac runner that opens the
> authenticated 24,000-parent training input once, then advances 100 → 500 → 24,000 within
> the same callback and `work.jsonl`. Post-review focused validation passes 46 tests across
> five files, including 23/23 runner tests. **The real teacher run has not started.** Completed
> teacher datasets, training, candidate selection, formal A/B, and live-weight changes all
> remain at zero. Japanese version:
> [blog-shogi-floodgate-strength-first-teacher-runner.md](./blog-shogi-floodgate-strength-first-teacher-runner.md)

## Current state

| Item                                           | State                                                      |
| ---------------------------------------------- | ---------------------------------------------------------- |
| real authentication of original training input | complete: 24,000 parents / 1,000 games / 1,088.743 seconds |
| strength-first runner implementation           | complete                                                   |
| focused validation                             | final 5 files / 46 tests PASS                              |
| runner-only validation                         | 23 / 23 tests PASS                                         |
| independent core review                        | P0 / P1 / P2 = 0 / 0 / 0                                   |
| independent runner review                      | P0 / P1 / P2 = 0 / 0 / 0                                   |
| real strength-first teacher commands           | 0                                                          |
| completed milestones / teacher datasets        | 0 / 0                                                      |
| optimizer runs / candidate selections / A/B    | 0 / 0 / 0                                                  |
| live-weight changes                            | 0                                                          |

Three partial parent records from an earlier stopped attempt remain as history. They do not
count as the 100-parent milestone or as a completed dataset. Completed implementation and
synthetic tests are not evidence that real labels were generated or playing strength improved.

## Connecting one authentication directly to 12-engine generation

The direct argumentless command
`"$HOME/.nvm/versions/node/v22.13.0/bin/node" -r tsx/cjs ml/run-floodgate-strength-first-teacher.ts`
runs only with fixed Node v22.13.0 on macOS arm64 and accepts no path overrides.
`package.json` remains unchanged so older pinned evidence does not require a cascading
rewrite. The command order is:

1. Verify YaneuraOu, its evaluation files, and the stable assets through the fixed production
   asset authority.
2. Capture the runner repository's exact clean Git revision. This identity is recorded
   separately from the fixed input bundle verifier revision
   `e8a9197608cb48b1160b6707d97b0c4f78f90a1d`.
3. Invoke the formal-postflight consumer once and synchronously claim the training input
   exactly once at the beginning of its callback.
4. Process 100, 500, and 24,000 in order against the same 24,000 rows and flat stage, without
   an operator-confirmation pause.
5. After the callback, validate and claim the postflight receipt covering the input filesystem
   recheck and descriptor closure. Only then commit `result.json`.

For every parent, the teacher uses YaneuraOu depth 16 / MultiPV 12 to propose moves and adds
the strong game's played move if absent. It bytewise-sorts all unique candidates and rescores
each one independently using MultiPV 1 with exactly-one-candidate `searchmoves` at depth 16.
The local workload uses 12 processes, one thread per process, 64 MB Hash per process, and a
600-second timeout per search.

Each USI child receives no inherited parent `process.env`. `HOME` and `TMPDIR` resolve to
that child's `<private-worker-cwd>`; `PATH=/usr/bin:/bin`, `LANG=C`, `LC_ALL=C`, and
`TZ=UTC` are fixed. To prevent hidden nested parallelism, `OMP_NUM_THREADS`,
`OMP_THREAD_LIMIT`, `OPENBLAS_NUM_THREADS`, `MKL_NUM_THREADS`,
`VECLIB_MAXIMUM_THREADS`, `NUMEXPR_NUM_THREADS`, and `BLIS_NUM_THREADS` are all fixed to
`1`. macOS spawn may add only `__CF_USER_TEXT_ENCODING` to the explicit environment, so
that platform-injected name is the sole tolerated extra. The fixed variables,
non-inheritance rule, and sole tolerated injected name are bound into the run fingerprint,
manifest, and staged/final result, and are checked against an actual child-environment
trace.

The shared preflight verifies stable-asset integrity, but no stable engine or policy is
executed for proposal or scoring. Runtime network access, AWS, Firebase/GCP, and Vercel are
not used.

The observed machine has 14 physical/logical cores, 51,539,607,552 bytes (48 GiB) of RAM,
and 106 GiB of free disk at the check. Twelve processes are assigned to search; two cores
remain for input delivery, durable writes, and the OS. At depth 16 the workload is
CPU-bound, so filling spare RAM or disk does not make serial authentication or search
proportionally faster.

## Flat, durable intermediate data

The private output root is fixed at
`~/.codex/shogi-runs/floodgate-q1-2026-strength-first-v6`; it does not branch into separate
stage directories.

| File                      | Commit point and role                                                            |
| ------------------------- | -------------------------------------------------------------------------------- |
| `work.jsonl`              | append and data-sync each parent; validate and reuse completed parents on resume |
| `milestone-100.json`      | bind bytes and SHA-256 of the canonical 100-parent prefix                        |
| `milestone-500.json`      | bind the canonical 500-parent prefix under the same run fingerprint              |
| `train.jsonl`             | canonical training-only rows, created only after all 24,000 complete             |
| `parent-completion.jsonl` | account for every parent as either an emitted group or a forced skip             |
| `manifest.json`           | bind input, runner, teacher, search, completion, and training output             |
| `staged-result.json`      | completion record staged inside the callback before postflight                   |
| `result.json`             | formal completion marker committed only after the exact postflight claim         |

Each appended `work.jsonl` entry is data-synced, and the file is atomically rewritten into
canonical order at milestone completion. Final outputs and milestone/result JSON use file
sync, same-directory rename, and directory sync. After interruption, the runner can resume
from a verified `work.jsonl` with the same run fingerprint. After completion, a retry
revalidates `result.json` and every file bound by it, then returns idempotently without
reauthentication or engine work.

An exclusive macOS `/usr/bin/lockf` kernel advisory lock is descriptor-backed and held by
the parent runner. The parent opens the private lock file once and passes the helper an FD
for the same open-file-description. The helper obtains the nonblocking lock and exits before
acquisition returns to its caller. After that helper exit, the parent's retained descriptor
for the same open-file-description keeps the lock held. The lock is released when the parent
closes its FD explicitly, or when parent exit or death makes the OS close it. The design uses
no lock-path unlink or reopen and no PID, token, or keeper process. A two-process contention
test permits exactly one holder.

Every `train.jsonl` row has the `train` role; there is no internal random validation split.
Fresh selection and fresh/existing final holdouts stay unopened and are not mixed into
teacher training.

## Authentication time and cautious duration estimates

The real source authentication covered 24,000 parents from 1,000 games. Its callback took
1,088.742 seconds, and completion including post-callback recheck and closure took 1,088.743
seconds. Repeating that authentication separately for 100, 500, and 24,000 would take about
54.44 minutes. One callback reduces the authentication component to about 18.15 minutes,
saving about 36.29 minutes.

We estimate the first real 100-parent end-to-end milestone at roughly 22–35 minutes from
command start. We estimate full 24,000-parent teacher generation at about 11.5–12 hours plus
authentication. These are ranges derived from prior throughput, not observed completion
times. Candidate counts and per-position search times can move them.

## Validation and the next evidence

Post-review focused validation passes 46 tests across five files, including 23/23 runner
tests. Final related validation covered the asset authority, USI runtime, and postflight
consumer and passed 120 tests across eight files. The publication evidence itself
passes 5/5. Scoped ESLint, Prettier, and diff checks passed, and checks restricted to the new
TypeScript files reported zero errors. Repository-wide TypeScript still reports unrelated
pre-existing errors, so that result is not presented as a runner failure. Independent review
of both the teacher core and runner completed with zero P0, P1, or P2 findings.

The next evidence will come from running the argumentless command at a fixed reviewed
revision after the runner is merged normally. Work then proceeds through the 100/500
intermediate records, the 24,000-parent
training-only dataset, three-seed retraining, candidate selection, sealed holdouts, formal
paired A/B, and external calibration. Until those gates pass, this runner proves only input
and artifact integrity—not improved playing strength or live promotion.

Machine-readable record:
[floodgate-strength-first-teacher-runner-2026-07-19.json](./data/floodgate-strength-first-teacher-runner-2026-07-19.json)
