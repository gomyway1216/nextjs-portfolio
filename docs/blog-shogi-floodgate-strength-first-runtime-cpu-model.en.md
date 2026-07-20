# Making the training CPU model independent of PATH

> On July 20, 2026, a resource audit before strength-first v9 three-seed
> training found that the candidate builder and training launcher recorded two
> different CPU model names for the same Mac. Training had not started, and
> live weights had not changed. Japanese version:
> [blog-shogi-floodgate-strength-first-runtime-cpu-model.md](./blog-shogi-floodgate-strength-first-runtime-cpu-model.md)

## Conclusion

CPU-model discovery in `ml/train.py` now invokes the fixed
`/usr/sbin/sysctl` executable instead of depending on the caller's `PATH`.
After the fix, both the candidate builder's restricted environment and the
launcher's normal environment return the same runtime JSON containing
`Apple M4 Pro`.

This does not change training arithmetic. CPU execution, two Torch threads,
one inter-op thread, deterministic algorithms, seeds 42/43/44, 20 epochs,
batch size 256, the loss, data, and selection gates remain fixed.

| Item                | Before                  | After              |
| ------------------- | ----------------------- | ------------------ |
| builder `PATH`      | `/usr/bin:/bin`         | unchanged          |
| CPU-model lookup    | bare `sysctl`           | `/usr/sbin/sysctl` |
| builder CPU model   | fallback to `arm`       | `Apple M4 Pro`     |
| launcher CPU model  | `Apple M4 Pro`          | `Apple M4 Pro`     |
| exact runtime match | stopped before training | matches            |

## Why this blocked training

The candidate builder probes the fixed virtual environment with
`PATH=/usr/bin:/bin`. Because that environment excludes `/usr/sbin`, the old
bare `sysctl` lookup failed and fell back to the processor name `arm`.

The three-seed launcher inherits the normal environment. Its usual `PATH`
contains `/usr/sbin`, so the same function returned `Apple M4 Pro`. The
training plan records runtime as exact data, and each process requires a typed
exact match against its observed runtime before training. Enrolling the
pre-fix plan would therefore stop all three processes before they consumed a
training batch.

The discrepancy was found with an approximately 2.5-second fixed-venv probe
during the resource audit, before the formal teacher completed. There is no
failed training slot, partial checkpoint, or selection-data read.

## Fix and fallback behavior

Only Darwin invokes the fixed
`/usr/sbin/sysctl -n machdep.cpu.brand_string` command. Non-Darwin systems do
not attempt the Darwin-specific command and retain the existing fallback
order: processor, machine, then `unknown`. Darwin also retains that fallback
when the executable is absent, the command fails, or its output is empty.

Mock regressions pin three properties:

1. the restricted `PATH=/usr/bin:/bin` still uses the absolute executable;
2. builder-like and launcher-like paths return the same `Apple M4 Pro` value;
3. non-Darwin skips `sysctl`, while Darwin absence or failure falls back.

Three focused tests, Python compilation, Ruff, and the diff check passed. Two
real probes in the fixed environment then produced byte-identical JSON with
Python 3.13.0, PyTorch 2.12.1, a 14-core CPU, two Torch threads, one inter-op
thread, deterministic mode, and `Apple M4 Pro`. This is runtime-preflight
evidence, not optimizer training or playing-strength evidence.

## Effect on existing plans

The existing WCSC36 plans already record `Apple M4 Pro`. This change does not
edit those plans or audits and does not change their bytes or hashes. It also
does not change the value previously observed in a normal launch environment.

The new strength-first v9 exact plan will be generated only after the formal
teacher has a final result and from the reviewed revision containing this
fix. Existing pipeline-revision checks bind that source to the plan and
checkpoints. Historical experiments are not rerun or rewritten.

## Current state

At capture time, the formal v9 teacher was running. Its final `result.json`,
the exact training plan, real seed-42/43/44 training, candidate selection, and
formal A/B did not yet exist. This fix has no production-weight write
authority, and live-weight changes remain zero.

After teacher completion, the candidate builder will derive the real
identities and runtime. A reviewed data-only plan must be enrolled before the
three-seed launcher runs. No strength improvement will be claimed until fresh
selection, sealed holdouts, formal paired A/B, and external calibration pass.

Machine-readable record:
[floodgate-strength-first-runtime-cpu-model-2026-07-20.json](./data/floodgate-strength-first-runtime-cpu-model-2026-07-20.json)
