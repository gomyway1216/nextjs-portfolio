# Preparing to measure CPU threads for three-seed training

> On July 20, 2026, a resource audit during the formal v9 teacher run checked
> whether the next three-seed training stage could use the CPU more fully. The
> benchmark foundation is implemented, but the real measurement has not run
> because it would contend with the active teacher. Japanese:
> [blog-shogi-floodgate-strength-first-training-thread-benchmark.md](./blog-shogi-floodgate-strength-first-training-thread-benchmark.md)

## Conclusion

The current launcher runs seeds 42, 43, and 44 concurrently, with each process
fixed at two Torch threads: six intra-op threads in total. Two threads was
inherited from the older six-run layout, where `6 × 2 = 12`. There was no
recorded two-versus-four measurement for the current three-run layout.

The new argumentless benchmark therefore runs all three processes together and
compares two and four threads per process in `2, 4, 4, 2` order. Four threads
would make 12 intra-op threads in total. Two remains the default unless the
measurement proves four is faster without changing the calculation.

## What is measured

The benchmark reads no games, teacher data, training plan, selection labels, or
holdout. Every trial rebuilds the same initializer for each of seeds 42/43/44
and uses fixed synthetic tensors. It calls the production
`int16_aware_dual_task_loss` directly, including float and int16-STE tasks,
replay value, sibling ranking, and policy loss, followed by backward and an
AdamW update for 12 batches.

All three seed workers wait behind one barrier. Timing starts only after every
worker is ready, so process startup, Torch import, tensor construction, model
initialization, and result writes are excluded. The timed region is the loss
forward, backward, and AdamW step.

## Selection rule

For each seed, repeated trials at the same thread setting must produce identical
hashes for every final model tensor and a fixed probe output. The canonical
AdamW state hash also covers `step`, `exp_avg`, and `exp_avg_sq`. A mismatch
stops the benchmark. The two- and four-thread outputs must also be
byte-identical; otherwise the benchmark stops without selecting a setting.
Every combined, float, and STE task loss, final model parameter, and float/STE
probe must be finite, so matching NaNs or infinities cannot pass parity. The
integer probe must be detached int64.

At start and end, every worker records byte identities for the Python
executable, Torch Python module, and native `_C` module, plus versions, CPU,
actual thread count, inter-op count one, deterministic algorithms, and
debug-error mode. Start and end must match. All 12 workers must have the same
runtime identity except for the requested thread count. Worker stderr goes to
one private file per seed instead of an undrained pipe.

Only after parity passes are the two counterbalanced pairs compared. Four is
selected only if it is strictly faster in both pairs and the median speedup is
at least 1.05×. The gate uses exact integer cross-products, not rounded display
ppm. Otherwise two is selected. A benchmark result still cannot change
production training by itself; a separate reviewed change would be required.

## Execution order

Run the real benchmark after the formal teacher releases the CPU but before
building the exact QAT plan candidate. The current builder, bridge, and launcher
fix two threads, and the v3 plan seals that runtime. If two is selected, proceed
with the existing contract. If four is selected, first review and merge a
separate production-contract PR with its tests and documentation, then build
the candidate from that revision.

Use this exact wrapper to prevent sleep. The Python script itself receives zero
arguments.

```sh
/usr/bin/caffeinate -dimsu ~/.codex/shogi-data/floodgate-training-venv/bin/python3 ml/run_strength_first_training_thread_benchmark.py
```

Do not redirect the builder's stdout directly onto the tracked plan path. The
builder safely stops when that file already exists. Write its stdout candidate
to a separate temporary file and use the reviewed enrollment step.

## Current state

Fourteen pure-stdlib unit tests, Python compilation, Ruff, and the diff check pass.
They cover process dispatch, the three-seed barrier, ABBA order, the 5% gate,
same-setting determinism stops, cross-setting parity stops, runtime matching,
fail-closed logical-CPU discovery, strict Git-revision decoding, worker-log
descriptor cleanup, finite-value stops, optimizer-state hashing, and the
training-only boundary. They launch no Torch worker and perform no optimizer
training.

The real benchmark is deferred until the active formal 24,000-position teacher
finishes and must run before the plan candidate is built. There is currently no
timing result or selected thread count, and no three-seed retraining, candidate
selection, strength improvement, or live-weight change.

Machine-readable status:
[floodgate-strength-first-training-thread-benchmark-2026-07-20.json](./data/floodgate-strength-first-training-thread-benchmark-2026-07-20.json)
