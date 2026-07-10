import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

import torch


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import qat_selection_audit as audit  # noqa: E402


PLAN_PATH = ML_DIR / "protocols" / "wcsc36-int16-aware-plan.json"
REVISION = "a" * 40
SOURCE_TRAIN_SHA256 = "1" * 64
FINAL_HOLDOUT_SHA256 = "2" * 64


def load_plan():
    with open(PLAN_PATH, encoding="utf-8") as source:
        return json.load(source)


def training_history():
    receipts = []
    for epoch in range(1, 21):
        floating = 1.0 / epoch
        ste = 1.2 / epoch
        receipts.append(
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
    return receipts


def model_state():
    return {
        "board.weight": torch.zeros((2269, 256), dtype=torch.float32),
        "hand.weight": torch.zeros((256, 14), dtype=torch.float32),
        "hand.bias": torch.zeros((256,), dtype=torch.float32),
        "l2.weight": torch.zeros((32, 256), dtype=torch.float32),
        "l2.bias": torch.zeros((32,), dtype=torch.float32),
        "l3.weight": torch.zeros((1, 32), dtype=torch.float32),
        "l3.bias": torch.zeros((1,), dtype=torch.float32),
    }


def checkpoint_args(root, slot):
    seed = slot["seed"]
    return {
        "experiment_family": "int16-aware",
        "experiment_series": None,
        "seed": seed,
        "loss": "sibling-ranking",
        "epochs": 20,
        "batch": 256,
        "lr": 0.0001,
        "k": 600.0,
        "cp_clamp": 3000,
        "rank_weight": 1.0,
        "rank_pair_min": 50.0,
        "rank_pair_max": 600.0,
        "rank_margin_cp": 50.0,
        "policy_weight": 0.25,
        "policy_temp_cp": 200.0,
        "features": "board",
        "device": "cpu",
        "torch_threads": 2,
        "replay_limit": 500000,
        "replay_ratio": 1.0,
        "limit": 0,
        "select_metric": "auto",
        "allow_legacy_init": True,
        "pipeline_revision": REVISION,
        "val_data": None,
        "data": str(root / "siblings.model-training.jsonl"),
        "sibling_manifest": str(root / "teacher-manifest.json"),
        "validation_partition_manifest": str(root / "partition-manifest.json"),
        "experiment_plan": str(PLAN_PATH),
        "holdout_protected_position_ids": str(root / "holdout-protected.txt"),
        "policy_exposure_receipt": str(root / "policy-exposure.json"),
        "policy_exposed_parent_ids": str(root / "policy-parent-ids.txt"),
        "policy_exposed_semantic_position_ids": str(
            root / "policy-position-ids.txt"
        ),
        "replay_data": str(root / "replay.jsonl"),
        "replay_excluded_position_ids": str(root / "replay-excluded.txt"),
        "init_ckpt": str(root / "warm.pt"),
        "out": str(root / slot["output"]),
    }


def write_production_shaped_runs(root, checkpoint_mutator=None):
    plan = load_plan()
    history = training_history()
    runtime = {
        **plan["runtime"],
        "mps_built": True,
        "mps_available": True,
        "cuda_available": False,
    }
    pipeline = {"source_revision": REVISION, "tracked_tree_clean": True}
    receipts = []
    for slot in plan["slots"]:
        seed = slot["seed"]
        directory = root / f"seed-{seed}"
        directory.mkdir(parents=True)
        contract = audit._expected_contract(plan, seed)
        plan_binding = {
            "path": str(PLAN_PATH),
            "bytes": audit.QAT_PLAN_BYTES,
            "sha256": audit.QAT_PLAN_SHA256,
            "schema": audit.QAT_PLAN_SCHEMA,
            "slot_id": slot["id"],
            "slot_output": slot["output"],
            "verified_input_sha256": audit._plan_input_sha256(plan),
        }
        train_path = str(root / "siblings.model-training.jsonl")
        replay_path = str(root / "replay.jsonl")
        exclusion_path = str(root / "replay-excluded.txt")
        checkpoint = {
            "schema": audit.QAT_FINAL_CHECKPOINT_SCHEMA,
            "model": model_state(),
            "epoch": 20,
            "args": checkpoint_args(root, slot),
            "arch": {
                "schema": 1,
                "features": "board",
                "input": 2282,
                "h1": 256,
                "h2": 32,
                "k": 600.0,
                "kp_buckets": 1,
            },
            "init_checkpoint": {
                "path": str(root / "warm.pt"),
                "sha256": contract["init_checkpoint_sha256"],
                "bytes": plan["inputs"]["warm_initializer"]["bytes"],
                "epoch": 27,
                "legacy_arch_inferred_fields": ["schema"],
            },
            "data_provenance": {
                "train": {
                    "path": train_path,
                    "real_path": os.path.realpath(train_path),
                    "sha256": contract["model_training_sha256"],
                    "bytes": contract["model_training_bytes"],
                    "usable_rows": contract["model_training_records"],
                    "selection": "all",
                    "requested_limit": 0,
                    "role": "model_training",
                },
                "replay": {
                    "path": replay_path,
                    "real_path": os.path.realpath(replay_path),
                    "sha256": contract["replay_sha256"],
                    "bytes": plan["inputs"]["replay"]["bytes"],
                    "usable_rows": contract["replay_limit"],
                    "selection": (
                        "uniform_without_replacement_after_semantic_exclusion"
                    ),
                    "requested_limit": contract["replay_limit"],
                    "sample_seed": seed + 2,
                    "replay_ratio": 1.0,
                    "excluded_semantic_position_ids": plan["inputs"][
                        "replay_exclusion"
                    ]["count"],
                    "excluded_semantic_position_ids_sha256": plan["inputs"][
                        "replay_exclusion"
                    ]["identifiers_sha256"],
                    "eligible_rows_after_semantic_exclusion": 600000,
                    "excluded_rows_before_sampling": 8678,
                },
                "replay_exclusion": {
                    "path": exclusion_path,
                    **{
                        field: plan["inputs"]["replay_exclusion"][field]
                        for field in (
                            "format",
                            "bytes",
                            "sha256",
                            "count",
                            "identifiers_sha256",
                        )
                    },
                },
                "model_selection": {
                    "labels_read": False,
                    "path_received_by_training_cli": False,
                    "epoch_evaluations": 0,
                },
                "final_holdout": {
                    "labels_read": False,
                    "status": "sealed_not_opened",
                },
            },
            "training_pipeline": pipeline,
            "training_runtime": runtime,
            "experiment_plan": plan_binding,
            "experiment_contract": contract,
            "objective": {
                "float_task_weight": 0.5,
                "ste_task_weight": 0.5,
                "float_task": ["value", "rank", "policy", "replay_value"],
                "ste_task": ["value", "rank", "policy", "replay_value"],
                "primary_batch_shared": True,
                "replay_indices_shared": True,
            },
            "checkpoint_selection": {
                "mode": "final-only",
                "selection_labels_read": False,
                "selection_evaluations": 0,
                "early_stopping": False,
                "candidate_artifact": "final.pt",
            },
            "training_history": history,
        }
        if checkpoint_mutator is not None:
            checkpoint_mutator(seed, checkpoint)
        checkpoint_path = directory / "final.pt"
        torch.save(checkpoint, checkpoint_path)
        checkpoint_raw = checkpoint_path.read_bytes()
        receipt = {
            "path": str(checkpoint_path),
            "bytes": len(checkpoint_raw),
            "sha256": hashlib.sha256(checkpoint_raw).hexdigest(),
        }
        result = {
            "schema": audit.QAT_TRAINING_RESULT_SCHEMA,
            "status": "complete",
            "experiment_plan": plan_binding,
            "experiment_contract": contract,
            "training_pipeline": pipeline,
            "training_runtime": runtime,
            "completed_epochs": 20,
            "selection_labels_read": False,
            "selection_evaluations": 0,
            "early_stopping": False,
            "candidate_artifact": {
                "name": "final.pt",
                "bytes": receipt["bytes"],
                "sha256": receipt["sha256"],
            },
            "training_history": history,
        }
        with open(directory / "result.json", "w", encoding="utf-8") as target:
            json.dump(result, target, allow_nan=False)
            target.write("\n")
        receipts.append(receipt)
        del checkpoint
    return plan, receipts


def metric_set(pair, top1, mae):
    return {
        "value_mae_cp": float(mae),
        "value_mse_cp2": float(mae * mae),
        "within_parent_pair_accuracy": float(pair),
        "teacher_top1_accuracy": float(top1),
    }


def report_model(name, receipt, epoch, floating, quantized, provenance):
    return {
        "name": name,
        "checkpoint": receipt["path"],
        "checkpoint_sha256": receipt["sha256"],
        "checkpoint_bytes": receipt["bytes"],
        "checkpoint_epoch": epoch,
        "training_provenance": provenance,
        "k_sigmoid": 600.0,
        "production_k_int": 600,
        "float": floating,
        "quantized_int16": {
            **quantized,
            "delta_from_float": {
                field: quantized[field] - floating[field]
                for field in audit.METRIC_FIELDS
            },
        },
    }


def eval_sibling_v2_report(plan, receipts, stable_receipt):
    stable_contract = plan["post_training_selection"]["stable"]
    stable_int16 = metric_set(
        stable_contract["int16_within_parent_pair_accuracy"],
        stable_contract["int16_teacher_top1_accuracy"],
        496.9,
    )
    stable_float = metric_set(
        stable_int16["within_parent_pair_accuracy"] + 0.001,
        stable_int16["teacher_top1_accuracy"],
        498.1,
    )
    models = [
        report_model(
            "stable",
            stable_receipt,
            27,
            stable_float,
            stable_int16,
            {"status": "legacy_unverified", "reason": "comparison only"},
        )
    ]
    pairs = {42: 0.6065, 43: 0.6080, 44: 0.6052}
    top1 = {42: 0.267, 43: 0.268, 44: 0.267}
    maes = {42: 490.0, 43: 489.0, 44: 491.0}
    for slot, receipt in zip(plan["slots"], receipts):
        seed = slot["seed"]
        quantized = metric_set(pairs[seed], top1[seed], maes[seed])
        floating = metric_set(pairs[seed] + 0.001, top1[seed], maes[seed] - 1.0)
        models.append(
            report_model(
                slot["id"],
                receipt,
                20,
                floating,
                quantized,
                {
                    "status": "verified_int16_aware_final_only_selection",
                    "teacher_manifest_sha256": plan["inputs"][
                        "sibling_teacher_manifest"
                    ]["sha256"],
                    "validation_partition_sha256": plan["inputs"][
                        "validation_partition_manifest"
                    ]["sha256"],
                    "training_pipeline_source_revision": REVISION,
                    "experiment_plan_sha256": audit.QAT_PLAN_SHA256,
                    "slot_id": slot["id"],
                    "seed": seed,
                    "source_train_sha256": SOURCE_TRAIN_SHA256,
                    "model_training_sha256": plan["inputs"]["model_training"][
                        "sha256"
                    ],
                    "model_selection_sha256": plan["post_training_selection"][
                        "model_selection"
                    ]["sha256"],
                    "final_holdout_sha256": FINAL_HOLDOUT_SHA256,
                    "replay_exclusion_sha256": plan["inputs"][
                        "replay_exclusion"
                    ]["sha256"],
                    "selection_labels_read_during_training": False,
                    "selection_evaluations_during_training": 0,
                    "final_holdout_labels_read": False,
                },
            )
        )
    selection = plan["post_training_selection"]["model_selection"]
    return {
        "schema": audit.SEALED_EVAL_REPORT_SCHEMA,
        "data": {
            "path": "/sealed/model-selection.jsonl",
            "sha256": selection["sha256"],
            "bytes": selection["bytes"],
            "sibling_manifest_sha256": plan["inputs"][
                "sibling_teacher_manifest"
            ]["sha256"],
            "sibling_manifest_bytes": plan["inputs"][
                "sibling_teacher_manifest"
            ]["bytes"],
            "pipeline_source_revision": "b" * 40,
            "teacher_runtime_snapshot": {},
            "sibling_manifest": {
                "outputs": {"train_sha256": SOURCE_TRAIN_SHA256}
            },
            "data_role": "selection",
            "validation_partition_manifest": {
                "sha256": plan["inputs"]["validation_partition_manifest"][
                    "sha256"
                ],
                "source": {
                    "full_training": {"sha256": SOURCE_TRAIN_SHA256}
                },
                "outputs": {
                    "final_holdout": {"sha256": FINAL_HOLDOUT_SHA256}
                },
            },
            "records": selection["records"],
            "parents": selection["parents"],
            "eligible_pairs": 10,
            "pair_min_cp": 50.0,
            "value_target": "clamped_child_cp",
            "value_cp_clamp": 3000,
            "ranking_target": (
                "unclamped_parent_cp_equals_negative_child_cp"
            ),
        },
        "models": models,
    }


class QatSelectionDefaultTorchPreflightTest(unittest.TestCase):
    def stable_receipt_patch(self, stable_path, stable_receipt):
        original = audit._file_receipt

        def receipt(path):
            if os.path.realpath(path) == os.path.realpath(stable_path):
                return dict(stable_receipt)
            return original(path)

        return mock.patch.object(audit, "_file_receipt", side_effect=receipt)

    def test_default_preflight_accepts_three_production_shaped_checkpoints(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan, receipts = write_production_shaped_runs(root)
            stable_path = root / "stable.pt"
            stable_path.write_bytes(b"stable fixture")
            stable_receipt = {
                "path": str(stable_path),
                "bytes": len(b"stable fixture"),
                "sha256": plan["post_training_selection"]["stable"][
                    "checkpoint_sha256"
                ],
            }
            evaluation_calls = []

            def evaluate(specs):
                evaluation_calls.append(list(specs))
                self.assertEqual(
                    [name for name, _path in specs],
                    [
                        "stable",
                        "int16-aware-seed-42",
                        "int16-aware-seed-43",
                        "int16-aware-seed-44",
                    ],
                )
                return eval_sibling_v2_report(plan, receipts, stable_receipt)

            with self.stable_receipt_patch(stable_path, stable_receipt):
                result = audit.run_selection(
                    run_root=str(root),
                    plan_path=str(PLAN_PATH),
                    stable_checkpoint=str(stable_path),
                    evaluation_runner=evaluate,
                    expected_training_revision=REVISION,
                )

            self.assertEqual(len(evaluation_calls), 1)
            self.assertEqual(result["status"], "static_selection_pass")
            self.assertEqual(
                [run["checkpoint_metadata"] for run in result["preflight"]["runs"]],
                [
                    {"schema": audit.QAT_FINAL_CHECKPOINT_SCHEMA, "epoch": 20},
                    {"schema": audit.QAT_FINAL_CHECKPOINT_SCHEMA, "epoch": 20},
                    {"schema": audit.QAT_FINAL_CHECKPOINT_SCHEMA, "epoch": 20},
                ],
            )

    def test_model_shape_or_arch_mutation_blocks_evaluation_callback(self):
        cases = (
            (
                "shape",
                lambda seed, checkpoint: checkpoint["model"].__setitem__(
                    "l3.weight", torch.zeros((2, 32), dtype=torch.float32)
                )
                if seed == 42
                else None,
                "model tensor l3.weight is invalid",
            ),
            (
                "architecture",
                lambda seed, checkpoint: checkpoint["arch"].__setitem__("h2", 33)
                if seed == 42
                else None,
                "checkpoint architecture mismatch",
            ),
            (
                "architecture integer coerced to float",
                lambda seed, checkpoint: checkpoint["arch"].__setitem__(
                    "input", 2282.0
                )
                if seed == 42
                else None,
                "checkpoint architecture mismatch",
            ),
            (
                "initializer epoch coerced to float",
                lambda seed, checkpoint: checkpoint["init_checkpoint"].__setitem__(
                    "epoch", 27.0
                )
                if seed == 42
                else None,
                "checkpoint initializer mismatch",
            ),
            (
                "replay count coerced to float",
                lambda seed, checkpoint: checkpoint["data_provenance"][
                    "replay"
                ].__setitem__("requested_limit", 500000.0)
                if seed == 42
                else None,
                "checkpoint training inputs mismatch",
            ),
        )
        for label, mutate, expected_error in cases:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                plan, _receipts = write_production_shaped_runs(root, mutate)
                stable_path = root / "stable.pt"
                stable_path.write_bytes(b"stable fixture")
                stable_receipt = {
                    "path": str(stable_path),
                    "bytes": len(b"stable fixture"),
                    "sha256": plan["post_training_selection"]["stable"][
                        "checkpoint_sha256"
                    ],
                }
                evaluate = mock.Mock(return_value={})

                with self.stable_receipt_patch(stable_path, stable_receipt):
                    with self.assertRaisesRegex(ValueError, expected_error):
                        audit.run_selection(
                            run_root=str(root),
                            plan_path=str(PLAN_PATH),
                            stable_checkpoint=str(stable_path),
                            evaluation_runner=evaluate,
                            expected_training_revision=REVISION,
                        )

                evaluate.assert_not_called()


if __name__ == "__main__":
    unittest.main()
