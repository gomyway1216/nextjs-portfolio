# Connecting strength-first fresh selection to the real evaluator

> On July 19, 2026, we implemented the READY path that evaluates all three trained checkpoints on the same fresh selection and turns only a passing representative seed into a privacy-safe receipt. The registry remains closed because the real 24,000-parent teacher result, three-seed training, and selection teacher do not all exist yet. This change therefore reads no real selection label, selects no real candidate, and changes no live weight. [日本語版](./blog-shogi-floodgate-strength-first-selection-evaluator-foundation.md)

## Outcome

This is not another contract with no execution path. Once a reviewed data-only registry enrolls the required identities, the same argumentless command performs the complete lane:

1. verify the exact-clean revision and the enrolled implementation sources, plan, and selection-preflight registry;
2. consume the existing public one-shot preflight proving that seed 42, 43, and 44 `result.json` / `final.pt` artifacts all passed identity validation and strict load;
3. only then open the fixed private fresh-selection raw input, selection-teacher authority, manifest, result, dataset, and stable checkpoint;
4. evaluate stable and all three candidates exactly once in both float and production-exact int16 on the same dataset;
5. recompute the fixed metric order, four per-seed gates, and three-seed family gate; and
6. only after a pass, publish a `0600` receipt that contains no absolute path, SFEN, or per-position teacher score.

Publication never overwrites an existing file. It fsyncs a private temporary file and creates the final name with an exclusive hard link, so a partial write cannot become the final receipt.

## Why a dedicated adapter was necessary

The adapter reuses the real tensor loader, float inference, quantizer, production-equivalent integer forward, and pair / top-1 / MAE calculations from `eval-sibling.py`.

Its older high-level `evaluate_checkpoints` wrapper assumes that training and selection were derived together from one teacher/partition manifest. The strength-first plan intentionally generates selection labels in a later teacher run, only **after** all three final checkpoints strict-load. Treating those two manifests as one would reject a correct run; weakening that check would break the isolation rule.

`strength_first_qat_selection_eval_adapter.py` therefore reuses the metric implementation while separating authorities:

| Responsibility | Evidence |
|---|---|
| all three final-only candidates strict-loaded | existing strength-first preflight |
| selection labels derive from the fixed 4,800 parents | role-bundle result and teacher authority |
| every parent is accounted for | identical completion in authority, manifest, and result |
| dataset and checkpoints remain unchanged | before/after byte length and SHA-256 |
| float and int16 metrics | real `eval-sibling.py` metric core |
| representative and gates | existing generic selection gates |

## Timeouts and skips never become labels

Selection-teacher completion requires `input_parents = completed_parents = 4,800`. A parent with fewer than two legal moves may be recorded as an explicit forced skip, but `emitted_parent_groups + forced_parents_skipped` must still equal 4,800.

`search_timeout_no_label` is not an allowed completion field. An authority that counts a timed-out parent as a completed label or emits rows for it is rejected. The real dataset loader must also return exactly the enrolled parent and row counts, with at least two candidates for every emitted parent.

## The truthful worker count

The registry's `max_workers = 2` is a ceiling. This adapter loads the dataset once and evaluates the four models in order, so it records `actual_workers = 1`. It does not claim that two workers ran.

A later two-process optimization would need to prove that it neither duplicates evaluations nor changes the dataset fingerprint. Duplicating the dataset and model state merely to report a larger worker number is not part of this change.

## Checkpoint-preflight hash connection fix (July 20, 2026)

The selection-teacher preflight defines `checkpoint_preflight_sha256` over the canonical UTF-8 JSON payload itself, without a trailing LF. The evaluator previously reused its LF-terminated receipt-file serializer for this recomputation, so no hash could satisfy both the real teacher authority and a READY registry.

The evaluator now separates payload hashing from file serialization and follows the producer's no-LF contract. A cross-interface regression passes the real teacher-preflight builder's summary into the READY evaluator. Receipt files retain their trailing LF; registry `null` values, private artifacts, real selection, and live weights remain unchanged.

## Today's closed state

The argumentless command is:

```sh
python3 ml/strength_first_qat_selection_evaluator.py
```

Today every result-dependent registry identity is `null`, so the command stops before opening a private selection artifact, checkpoint, or Torch evaluator. A later reviewed data-only enrollment requires:

- the exact strength-first training plan;
- the selection-preflight registry containing all three final result/checkpoint identities;
- selection-teacher authority, manifest, result, and dataset bound to that checkpoint set;
- the stable checkpoint; and
- exact source identities for the evaluator, adapter, preflight, real metric core, and gate implementation.

## Synthetic verification

The focused suite does not exercise a weaker test-only composition. It drives the same closed / READY production composition through injected filesystem, preflight, evaluator, and publisher seams.

It covers missing, extra, duplicated, and reordered candidates; plan and preflight hash drift; teacher fingerprint drift; incomplete accounting; partial reports; non-finite metrics; family-gate failure; dataset or tracked-plan changes during evaluation; one-shot receipt replay; and an existing output file.

This is synthetic implementation evidence, not a result from the real teacher, training, selection, or match lanes. The final holdout, formal A/B, external games, and live weights remain unread and unchanged.
