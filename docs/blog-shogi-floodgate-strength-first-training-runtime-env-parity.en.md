# Pinning the child environment for three-seed training

> On July 20, 2026, the preflight before real three-seed training found a
> difference between the thread benchmark and the production launcher. The
> benchmark pinned `PYTHONHASHSEED`, `OMP_DYNAMIC`, and `MKL_DYNAMIC`, while
> the launcher inherited them from its parent shell. This change only updates
> the launcher and adversarial tests. It changes no teacher data, training
> plan, checkpoint, selection label, or live weight. Japanese:
> [blog-shogi-floodgate-strength-first-training-runtime-env-parity.md](./blog-shogi-floodgate-strength-first-training-runtime-env-parity.md)

## Fix

`ml/run_strength_first_three_seed_training.py` now gives each seed-42/43/44
child an independent environment map and applies the following values after
copying the parent environment.

| Variable                 | Fixed value | Purpose                                  |
| ------------------------ | ----------- | ---------------------------------------- |
| `PYTHONHASHSEED`         | `0`         | pin the Python interpreter hash seed     |
| `OMP_NUM_THREADS`        | `2`         | per-process OpenMP thread count          |
| `MKL_NUM_THREADS`        | `2`         | per-process MKL thread count             |
| `OPENBLAS_NUM_THREADS`   | `2`         | per-process OpenBLAS thread count        |
| `VECLIB_MAXIMUM_THREADS` | `2`         | per-process Accelerate thread ceiling    |
| `OMP_DYNAMIC`            | `FALSE`     | disable dynamic OpenMP thread adjustment |
| `MKL_DYNAMIC`            | `FALSE`     | disable dynamic MKL thread adjustment    |

If the formal benchmark selects four threads, a separate reviewed change must
update these values before the exact plan is built. This patch preserves the
current two-thread contract and only aligns environment control between the
benchmark and the real launcher.

## Why it was needed

The launcher already overrode the four thread ceilings with `2`, but the
remaining three variables depended on the invoking shell. A launch under
`PYTHONHASHSEED=random` or `OMP_DYNAMIC=TRUE` therefore would not use the same
runtime conditions as the preflight benchmark, even with the same revision,
data, and seed. This is not evidence of an observed playing-strength
regression, but it was an unsealed reproducibility boundary for comparing
three seeds.

The adversarial unit test injects different hostile parent values for all
seven variables. It verifies the fixed values in all three child processes,
the 42/43/44 seed order, a distinct environment map per process, and an
unchanged parent environment. Eight focused Python tests, three
machine-evidence contract tests, Python compilation, Ruff, Prettier, and the
diff check passed.

## Evidence boundary

This PR does not launch the trainer or execute a real optimizer step. It does
not rewrite the earlier CPU-model article or that publication's historical
test counts. It is runtime-parity preparation, not evidence of real
three-seed retraining, candidate selection, sealed holdouts, formal paired
A/B, external calibration, or a live change.

Machine-readable record:
[floodgate-strength-first-training-runtime-env-parity-2026-07-20.json](./data/floodgate-strength-first-training-runtime-env-parity-2026-07-20.json)
