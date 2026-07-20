# Shogi evaluation: preparing the v7 teacher-to-three-seed plan candidate entry

> On July 19, 2026, we implemented an argumentless builder that will emit the exact
> three-seed training-plan candidate on stdout after the real 24,000-parent teacher
> completes. The first real observation stopped on the active lock; a later observation after
> lock release stopped on the still-missing `result.json`. Both stopped before any large scan or
> Torch runtime probe. The tracked plan, optimizer steps, candidate checkpoints, selection, and
> live-weight changes all remain zero. Japanese version:
> [blog-shogi-floodgate-strength-first-qat-plan-candidate-builder.md](./blog-shogi-floodgate-strength-first-qat-plan-candidate-builder.md)

## Conclusion

Teacher completion alone is not enough to dispatch training. The exact bytes and SHA-256
identities must be placed in a tracked plan so all three training processes use the same
24,000-parent source, completion accounting, and runtime.

The new entry is:

```sh
python3 ml/build_strength_first_qat_training_plan_candidate.py
```

On success, it emits exactly one plan JSON document that passes the existing validator. The
builder does not write or overwrite
`ml/protocols/floodgate-q1-2026-strength-first-qat-training-plan.json`. Turning the candidate
into training authority still requires a separate data-only commit, review, CI, and regular
merge. Any argument exits 2. Incomplete or inconsistent artifacts exit 1 with zero stdout
bytes.

## Heavy work stays behind terminal completion

The production entry uses only the fixed v7 root. Its ordering is:

| Order | Gate                                                                | Still not executed on failure          |
| ----: | ------------------------------------------------------------------- | -------------------------------------- |
|     1 | tracked plan remains absent                                         | artifact reads and runtime probe       |
|     2 | retained lock is acquired nonblockingly and held                    | terminal reads, large scans, and Torch |
|     3 | `result.json` first, then all five terminal files exist             | role/replay reads and Torch            |
|     4 | safely snapshot ten authorized files; stream hashes for large files | runtime probe and training             |
|     5 | strict role/teacher/result parsing and cross-binding                | runtime probe and training             |
|     6 | neutral rescan of raw input, completion, and train bytes            | runtime probe and training             |
|     7 | canonical sorted-unique replay-exclusion set is regenerated         | runtime probe and training             |
|     8 | settle owner, mode, link count, inode, identity, and accounting     | runtime probe and training             |
|     9 | deterministic CPU runtime only, through the fixed venv              | optimizer, selection, and live writes  |
|    10 | recheck snapshots and lock, then emit stdout while lock is held     | tracked-plan write and training        |

The lock file is intentionally retained after completion, so mere absence is not required.
The real active-v7 observation exited 1 with zero stdout bytes because another process still
held the retained lock. That path made zero artifact snapshots, runtime probes, or Torch
imports.

A later observation after lock release acquired the same retained file's advisory lock, then
exited 1 with zero stdout bytes because `result.json` was still absent. That path also made zero
artifact snapshots, runtime probes, or Torch imports. A persistent but unlocked lock file is
therefore not misclassified as active; the missing terminal result becomes the next authoritative
gate.

## What is and is not read

The builder reads only:

- v7 teacher `result.json`, `manifest.json`, `work.jsonl`,
  `parent-completion.jsonl`, and `train.jsonl`;
- label-free role-bundle `manifest.json`, `training.raw.jsonl`, and
  `replay-excluded-position-ids.txt`; and
- fixed sealed `runOp1-train.jsonl` and `runOp1-best.pt`.

It does not read fresh-selection or fresh-final-holdout raw files, labels, protected-ID files,
model outputs, or existing training output slots. It does not invoke Git, a network, AWS,
GCP/Firebase, Vercel, an engine, an optimizer, a selection reader, a holdout reader, or a
weight writer.

The raw training input, completion, and train bytes are retained for an exact neutral rescan.
The replay exclusion is independently checked for canonical framing, ASCII IDs, byte order,
unique membership, count, file SHA-256, and identifier-set SHA-256. Teacher work, the 800 MB
replay, and the initializer are streamed into hashes and metadata snapshots rather than held
fully in memory.

## Candidate plan contents

The candidate has the exact seven top-level fields of
`shogi-floodgate-strength-first-qat-training-plan-v1`:

- real teacher, role, replay, and initializer artifact identities;
- CPU, Python, Torch, and deterministic runtime observed in the fixed venv;
- warm-model-only initialization, learning rate `1e-4`, 20 epochs, and batch 256;
- exact seed slots 42, 43, and 44;
- `training_only = true`; and
- selection-label, holdout-label, candidate-selection, and production-weight-write authority
  all `false`.

The runtime probe starts the fixed training Python in isolated mode and calls only the existing
`train.py` `configure_sealed_torch_runtime(2)`. It imports Torch to measure the runtime, but
does not load a dataset, construct a model, take an optimizer step, or write a checkpoint.

## Validation

Focused tests with a synthetic four-parent fixture cover an exact candidate, byte-identical
serialization, early STOP on an active lock or missing result, duplicate JSON, teacher/work/
replay/initializer drift, canonical replay exclusion, runtime field and type drift, symlinks,
permissive modes, snapshot revalidation, retained-lock path/inode replacement rejection,
success/error release, lock retention through stdout, runtime-probe ordering, and zero
selection/holdout path access. The combined focused set passes 20/20; the full ML stdlib passes
259/259 in 14.555 seconds; builder publication passes 4/4; and builder plus existing-bridge publication
passes 9/9. Python compile, changed-file Ruff, Prettier, and the diff check also pass. Full ML
Ruff still reports seven pre-existing errors in unchanged files and zero errors in changed
files.

This change also corrects stale `v6` references in the bridge articles, machine evidence, and
`ml/README.md` to the `v7` root fixed by current code. That correction changes neither the
teacher dataset nor the plan; it aligns the operational record with the implementation.

Machine-readable record:
[floodgate-strength-first-qat-plan-candidate-builder-2026-07-19.json](./data/floodgate-strength-first-qat-plan-candidate-builder-2026-07-19.json)

## Straight-line handoff

1. The v7 teacher publishes all five terminal files and releases retained lock ownership.
2. Run the builder and inspect its stdout candidate.
3. Add only the exact plan in a data-only PR; review, validate, and regular-merge it.
4. From clean updated main, run `python3 ml/run_strength_first_three_seed_training.py`.
5. Keep selection closed until all three seeds have both `result.json` and `final.pt`.

This builder shortens the handoff but does not make the AI stronger by itself. Strength evidence
arrives only if three-seed training then passes fresh selection, sealed finals, regressions,
production parity, formal A/B, and external calibration. Live weights remain unchanged until
that evidence exists.
