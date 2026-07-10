import copy
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))
MODULE_PATH = ML_DIR / "qat_selection_audit.py"
SPEC = importlib.util.spec_from_file_location("qat_selection_audit", MODULE_PATH)
AUDIT = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(AUDIT)
PLAN_PATH = ML_DIR / "protocols" / "wcsc36-int16-aware-plan.json"


def load_plan():
    return json.loads(PLAN_PATH.read_text(encoding="utf-8"))


def history():
    rows = []
    for epoch in range(1, 21):
        floating = 1.0 / epoch
        ste = 1.2 / epoch
        rows.append(
            {
                "epoch": epoch,
                "combined_task_loss": 0.5 * (floating + ste),
                "float_task_loss": floating,
                "ste_task_loss": ste,
                "learning_rate": 0.0001
                * (1.0 + math.cos(math.pi * (epoch - 1) / 20.0))
                / 2.0,
            }
        )
    return rows


def write_runs(root: Path, *, mutate=None):
    plan = load_plan()
    revision = "a" * 40
    runtime = {**plan["runtime"], "mps_built": True, "mps_available": True, "cuda_available": False}
    for slot in plan["slots"]:
        seed = slot["seed"]
        directory = root / f"seed-{seed}"
        directory.mkdir(parents=True)
        checkpoint = f"checkpoint-{seed}\n".encode()
        (directory / "final.pt").write_bytes(checkpoint)
        result = {
            "schema": AUDIT.QAT_TRAINING_RESULT_SCHEMA,
            "status": "complete",
            "experiment_plan": {
                "path": str(PLAN_PATH),
                "bytes": AUDIT.QAT_PLAN_BYTES,
                "sha256": AUDIT.QAT_PLAN_SHA256,
                "schema": AUDIT.QAT_PLAN_SCHEMA,
                "slot_id": slot["id"],
                "slot_output": slot["output"],
                "verified_input_sha256": AUDIT._plan_input_sha256(plan),
            },
            "experiment_contract": AUDIT._expected_contract(plan, seed),
            "training_pipeline": {
                "source_revision": revision,
                "tracked_tree_clean": True,
            },
            "training_runtime": runtime,
            "completed_epochs": 20,
            "selection_labels_read": False,
            "selection_evaluations": 0,
            "early_stopping": False,
            "candidate_artifact": {
                "name": "final.pt",
                "bytes": len(checkpoint),
                "sha256": hashlib.sha256(checkpoint).hexdigest(),
            },
            "training_history": history(),
        }
        if mutate is not None:
            mutate(seed, result)
        (directory / "result.json").write_text(
            json.dumps(result, allow_nan=False) + "\n", encoding="utf-8"
        )
    return revision


def metric_set(pair, top1, mae):
    return {
        "value_mae_cp": float(mae),
        "value_mse_cp2": float(mae * mae),
        "within_parent_pair_accuracy": float(pair),
        "teacher_top1_accuracy": float(top1),
    }


def model_report(name, checkpoint, epoch, floating, quantized, provenance):
    delta = {field: quantized[field] - floating[field] for field in AUDIT.METRIC_FIELDS}
    return {
        "name": name,
        "checkpoint": checkpoint["path"],
        "checkpoint_sha256": checkpoint["sha256"],
        "checkpoint_bytes": checkpoint["bytes"],
        "checkpoint_epoch": epoch,
        "training_provenance": provenance,
        "k_sigmoid": 600.0,
        "production_k_int": 600,
        "float": floating,
        "quantized_int16": {**quantized, "delta_from_float": delta},
    }


def fake_report(preflight, stable_receipt, *, fail_seed=None):
    plan = load_plan()
    stable_contract = plan["post_training_selection"]["stable"]
    stable_int = metric_set(
        stable_contract["int16_within_parent_pair_accuracy"],
        stable_contract["int16_teacher_top1_accuracy"],
        496.9,
    )
    stable_float = metric_set(
        stable_int["within_parent_pair_accuracy"] + 0.001,
        stable_int["teacher_top1_accuracy"],
        498.1,
    )
    models = [
        model_report(
            "stable",
            stable_receipt,
            27,
            stable_float,
            stable_int,
            {"status": "legacy_unverified", "reason": "comparison only"},
        )
    ]
    pairs = {42: 0.6065, 43: 0.608, 44: 0.6052}
    top1 = {42: 0.267, 43: 0.268, 44: 0.267}
    maes = {42: 490.0, 43: 489.0, 44: 491.0}
    for run in preflight["runs"]:
        seed = run["seed"]
        quantized = metric_set(pairs[seed], top1[seed], maes[seed])
        floating = metric_set(pairs[seed] + 0.001, top1[seed], maes[seed] - 1.0)
        if fail_seed == seed:
            quantized["teacher_top1_accuracy"] = 0.20
        provenance = {
            "status": "verified_int16_aware_final_only_selection",
            "teacher_manifest_sha256": plan["inputs"]["sibling_teacher_manifest"]["sha256"],
            "validation_partition_sha256": plan["inputs"]["validation_partition_manifest"]["sha256"],
            "training_pipeline_source_revision": preflight["training_pipeline"]["source_revision"],
            "experiment_plan_sha256": AUDIT.QAT_PLAN_SHA256,
            "slot_id": run["slot_id"],
            "seed": seed,
            "source_train_sha256": "1" * 64,
            "model_training_sha256": plan["inputs"]["model_training"]["sha256"],
            "model_selection_sha256": plan["post_training_selection"]["model_selection"]["sha256"],
            "final_holdout_sha256": "2" * 64,
            "replay_exclusion_sha256": plan["inputs"]["replay_exclusion"]["sha256"],
            "selection_labels_read_during_training": False,
            "selection_evaluations_during_training": 0,
            "final_holdout_labels_read": False,
        }
        models.append(
            model_report(
                run["slot_id"],
                run["candidate"],
                20,
                floating,
                quantized,
                provenance,
            )
        )
    selection = plan["post_training_selection"]["model_selection"]
    return {
        "schema": AUDIT.SEALED_EVAL_REPORT_SCHEMA,
        "data": {
            "path": "/sealed/selection.jsonl",
            "data_role": "selection",
            "bytes": selection["bytes"],
            "sha256": selection["sha256"],
            "sibling_manifest_bytes": plan["inputs"]["sibling_teacher_manifest"][
                "bytes"
            ],
            "records": selection["records"],
            "parents": selection["parents"],
            "pair_min_cp": 50.0,
            "value_cp_clamp": 3000,
            "value_target": "clamped_child_cp",
            "ranking_target": "unclamped_parent_cp_equals_negative_child_cp",
            "eligible_pairs": 10,
            "sibling_manifest_sha256": plan["inputs"]["sibling_teacher_manifest"]["sha256"],
            "pipeline_source_revision": "3" * 40,
            "teacher_runtime_snapshot": {},
            "sibling_manifest": {"outputs": {"train_sha256": "1" * 64}},
            "validation_partition_manifest": {
                "sha256": plan["inputs"]["validation_partition_manifest"]["sha256"],
                "source": {"full_training": {"sha256": "1" * 64}},
                "outputs": {"final_holdout": {"sha256": "2" * 64}},
            },
        },
        "models": models,
    }


class QatSelectionAuditTests(unittest.TestCase):
    def test_preflight_validates_exact_three_results_before_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            revision = write_runs(root)
            events = []

            def validate(path, result, slot):
                events.append(slot["seed"])
                return {"schema": AUDIT.QAT_FINAL_CHECKPOINT_SCHEMA, "epoch": 20}

            preflight = AUDIT.preflight_run_results(
                str(root),
                str(PLAN_PATH),
                expected_training_revision=revision,
                checkpoint_validator=validate,
            )
            self.assertEqual(events, [42, 43, 44])
            self.assertTrue(preflight["all_three_complete_before_selection_read"])
            self.assertEqual([run["seed"] for run in preflight["runs"]], [42, 43, 44])

    def test_run_selection_calls_evaluator_only_after_full_preflight(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            revision = write_runs(root)
            stable_path = root / "stable.pt"
            stable_path.write_bytes(b"stable fixture")
            stable_receipt = {
                "path": str(stable_path),
                "bytes": 14,
                "sha256": load_plan()["post_training_selection"]["stable"][
                    "checkpoint_sha256"
                ],
            }
            events = []

            def validate(path, result, slot):
                events.append(f"checkpoint-{slot['seed']}")
                return {"schema": AUDIT.QAT_FINAL_CHECKPOINT_SCHEMA, "epoch": 20}

            def evaluate(specs):
                self.assertEqual(
                    events,
                    ["checkpoint-42", "checkpoint-43", "checkpoint-44"],
                )
                events.append("selection-read")
                preflight = AUDIT.preflight_run_results(
                    str(root),
                    str(PLAN_PATH),
                    expected_training_revision=revision,
                    checkpoint_validator=lambda path, result, slot: {
                        "schema": AUDIT.QAT_FINAL_CHECKPOINT_SCHEMA,
                        "epoch": 20,
                    },
                )
                return fake_report(preflight, stable_receipt)

            original_receipt = AUDIT._file_receipt

            def receipt(path):
                if os.path.realpath(path) == os.path.realpath(stable_path):
                    return dict(stable_receipt)
                return original_receipt(path)

            with mock.patch.object(AUDIT, "_file_receipt", side_effect=receipt):
                audit = AUDIT.run_selection(
                    run_root=str(root),
                    plan_path=str(PLAN_PATH),
                    stable_checkpoint=str(stable_path),
                    evaluation_runner=evaluate,
                    expected_training_revision=revision,
                    checkpoint_validator=validate,
                )
            self.assertEqual(audit["status"], "static_selection_pass")
            self.assertIn("selection-read", events)
            self.assertFalse(audit["production_promotion_authorized"])
            self.assertEqual(audit["final_holdout"], "not_opened_by_this_command")

    def test_missing_completion_marker_prevents_evaluator_call(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            revision = write_runs(root)
            (root / "seed-44" / "result.json").unlink()
            called = False

            def evaluate(specs):
                nonlocal called
                called = True
                return {}

            with self.assertRaisesRegex(ValueError, "seed 44 result"):
                AUDIT.run_selection(
                    run_root=str(root),
                    plan_path=str(PLAN_PATH),
                    stable_checkpoint=str(root / "missing-stable.pt"),
                    evaluation_runner=evaluate,
                    expected_training_revision=revision,
                    checkpoint_validator=lambda path, result, slot: {},
                )
            self.assertFalse(called)

    def test_report_ranking_and_family_gates_are_recomputed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            revision = write_runs(root)
            preflight = AUDIT.preflight_run_results(
                str(root),
                str(PLAN_PATH),
                expected_training_revision=revision,
                checkpoint_validator=lambda path, result, slot: {},
            )
            stable = {
                "path": "/external/stable.pt",
                "bytes": 123,
                "sha256": load_plan()["post_training_selection"]["stable"][
                    "checkpoint_sha256"
                ],
            }
            selection = AUDIT.select_from_report(
                fake_report(preflight, stable), preflight, stable, load_plan()
            )
            self.assertEqual(selection["ranked_seed_order"], [43, 42, 44])
            self.assertEqual(selection["representative_seed"], 42)
            self.assertTrue(selection["family_gate"]["passed"])

            wrong_source = fake_report(preflight, stable)
            wrong_source["models"][1]["training_provenance"][
                "source_train_sha256"
            ] = "0" * 64
            with self.assertRaisesRegex(ValueError, "selection provenance mismatch"):
                AUDIT.select_from_report(
                    wrong_source, preflight, stable, load_plan()
                )

            failed = AUDIT.select_from_report(
                fake_report(preflight, stable, fail_seed=42),
                preflight,
                stable,
                load_plan(),
            )
            self.assertFalse(failed["family_gate"]["passed"])

    def test_result_mutations_fail_closed(self):
        cases = (
            (
                "boolean selection evaluation",
                lambda seed, value: value.__setitem__(
                    "selection_evaluations", False
                )
                if seed == 42
                else None,
                "final-only completion",
            ),
            (
                "float plan bytes",
                lambda seed, value: value["experiment_plan"].__setitem__(
                    "bytes", float(AUDIT.QAT_PLAN_BYTES)
                )
                if seed == 42
                else None,
                "plan binding mismatch",
            ),
            (
                "float contract epochs",
                lambda seed, value: value["experiment_contract"].__setitem__(
                    "epochs", 20.0
                )
                if seed == 42
                else None,
                "result contract mismatch",
            ),
            (
                "selection evaluation",
                lambda seed, value: value.__setitem__("selection_evaluations", 1)
                if seed == 42
                else None,
                "final-only completion",
            ),
            (
                "history schedule",
                lambda seed, value: value["training_history"][0].__setitem__(
                    "learning_rate", 0.2
                )
                if seed == 42
                else None,
                "learning-rate schedule",
            ),
            (
                "artifact hash",
                lambda seed, value: value["candidate_artifact"].__setitem__(
                    "sha256", "0" * 64
                )
                if seed == 42
                else None,
                "candidate artifact mismatch",
            ),
        )
        for label, mutate, expected in cases:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                write_runs(root, mutate=mutate)
                with self.assertRaisesRegex(ValueError, expected):
                    AUDIT.preflight_run_results(
                        str(root),
                        str(PLAN_PATH),
                        checkpoint_validator=lambda path, result, slot: {},
                    )

    def test_atomic_audit_write_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "audit.json"
            AUDIT._atomic_write_new_json(str(path), {"status": "first"})
            before = path.read_bytes()
            with self.assertRaisesRegex(ValueError, "refusing to overwrite"):
                AUDIT._atomic_write_new_json(str(path), {"status": "second"})
            self.assertEqual(path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
