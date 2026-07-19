# Connecting strength-first candidates to the existing strict three-run selection boundary

> On July 19, 2026, we implemented and focused-tested a bridge that will send the
> `result.json` and `final.pt` artifacts from future strength-first three-seed
> training through the same fail-closed verification order used by fresh QAT
> candidate selection. **The tracked registry remains closed with every identity
> set to `null`; no selection label, final holdout, or production weight was
> opened.** [日本語版](./blog-shogi-floodgate-strength-first-selection-preflight-bridge.md)

## What is now connected

Strength-first training uses the same final checkpoint structure, fixed 20 epochs,
and three seeds as fresh QAT. Its artifact family is nevertheless distinct:

| Item | Fixed strength-first value |
| --- | --- |
| plan schema | `shogi-floodgate-strength-first-qat-training-plan-v1` |
| result schema | `shogi-floodgate-strength-first-qat-training-result-v1` |
| checkpoint schema | `shogi-floodgate-strength-first-qat-final-checkpoint-v1` |
| run root | `ml/runs/floodgate-q1-2026-strength-first-int16-aware` |
| slots | seeds `42`, `43`, and `44` |

The existing public fresh API and all of its defaults are unchanged. Its internal
common validation can now receive an explicit result schema, plan binding,
training contract, checkpoint schema, and replay identity. The fixed
strength-first public API derives those values only from code constants and the
validated plan. A caller cannot replace the loader, model validator, or accepted
path family.

The new registry is
[`floodgate-q1-2026-strength-first-qat-selection-preflight-registry.json`](../ml/protocols/floodgate-q1-2026-strength-first-qat-selection-preflight-registry.json)
and is currently closed:

| Field | Current value |
| --- | --- |
| status | `awaiting-exact-strength-first-plan-and-three-final-run-identities` |
| training-plan bytes / SHA-256 | `null` / `null` |
| training-pipeline revision | `null` |
| three result / three checkpoint identities | all `null` |
| artifact identities registered | `false` |
| selection preflight ready | `false` |

The current public preflight therefore strict-parses the registry, verifies its
tracked bytes, and immediately returns a data-only STOP. It does not reach the
absent plan, run directory, Torch, or a selection reader.

## Closing all six artifacts before loading the first checkpoint

A future data-only review may open the registry with observed identities only.
Even then, verification follows this fixed order:

```text
closed registry
  -> STOP

ready registry
  -> tracked registry + exact tracked strength-first plan
  -> capture all 3 result and all 3 checkpoint byte strings
  -> strict-parse and bind all 3 results
  -> require one shared pipeline and runtime across all 3 runs
  -> Torch strict-load and model strict-load all 3 captured checkpoints
  -> recheck tracked inputs, results, and checkpoint identities
  -> mint a one-shot receipt
  -> permit exactly one selection-reader call
```

The preflight does not load the first checkpoint and discover later that the
third is absent. It first retains immutable bytes for all six artifacts and
validates every result before entering Torch. A temporary path swap followed by
restoration cannot change the bytes that are parsed or loaded.

## Preserving strength-first provenance

The result's `experiment_plan` must exactly match more than its schema and slot:

- plan byte length, SHA-256, and absolute path;
- SHA-256 bindings for teacher `manifest.json`, `result.json`, and `work.jsonl`;
- the `parent-completion.jsonl` SHA-256;
- input-parent, forced-skip, emitted-group, and model-training-parent accounting;
- zero replacement and resampling plus preserved emitted order; and
- the fixed per-seed training contract.

Each result's candidate artifact must match the registered byte length and
SHA-256 of that slot's `final.pt`. The checkpoint is then checked against the
result, plan, contract, pipeline, runtime, 20-epoch history, fixed initializer,
replay and replay exclusion, and final-only selection metadata before its model
is strict-loaded into `DistillNet`. Any cross-run pipeline or runtime mismatch
prevents receipt issuance.

## Selection and the final holdout remain separate authorities

This preflight does not read selection labels. Only after all three candidates
pass can the fixed public path mint a one-shot receipt and call one selection
reader. A plain dictionary, another class, a consumed receipt, or an
externally-constructed object cannot enter the reader. The receipt is consumed
even if the reader raises.

No final-holdout label path is passed into this preflight. Its receipt records
`not_opened_by_this_preflight`. After selection, the candidate still must pass
the sealed final holdout, known regressions, quantized search, formal paired
A/B, and external high-dan calibration. Production promotion and live-weight
writes remain false. This change is not evidence of improved playing strength.

## Focused validation

To avoid competing with teacher recovery, validation was limited to the new
boundary and the changed common validator, run at low priority:

| Validation | Result |
| --- | ---: |
| strength-first focused stdlib | 6/6 PASS |
| existing fresh-preflight stdlib regression | 17/17 PASS |
| Python compile | PASS |
| Ruff / Black / diff check | PASS |
| broad suite | not run (avoids CPU competition with teacher recovery) |

Synthetic temporary artifacts verify the closed-registry early STOP; acceptance
of the exact strength-first schemas, paths, and seeds; rejection of fresh
schemas and wrong paths; rejection of a changed teacher-work binding before any
checkpoint load; zero checkpoint loads when the last checkpoint is absent; and
one-shot receipt consumption. All 17 existing fresh tests also pass, preserving
the old public path's default behavior.

The active teacher worktree, teacher output, and process control were untouched.
No AWS, GCP, Vercel, or other cloud compute is involved; future execution
remains local to the Mac.

After the real teacher completes, the next stage registers the exact training
plan and runs the three training seeds. Only after those runs finish should a
separate data-only review register the observed plan, result, and checkpoint
identities. The registry remains closed until then.

Machine-readable record:
[floodgate-strength-first-selection-preflight-bridge-2026-07-19.json](./data/floodgate-strength-first-selection-preflight-bridge-2026-07-19.json)
