from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

import torch


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import direct_teacher_halfkp81_v2_protocol as PROTOCOL  # noqa: E402
import train  # noqa: E402
import train_direct_teacher_halfkp81_v2 as DIRECT  # noqa: E402


START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"


def _sha_id(character: str) -> str:
    return "sha256:" + character * 64


def _row(*, role: str = "training", child: str = START) -> dict:
    return {
        "schema": PROTOCOL.ROW_SCHEMA,
        "role": role,
        "game_id": _sha_id("1" if role == "training" else "2"),
        "parent_id": _sha_id("3" if role == "training" else "4"),
        "position_id": _sha_id("5" if role == "training" else "6"),
        "child_position_id": train.position_id_from_sfen(child),
        "child_sfen": child,
        "teacher_child_cp": 125,
        "teacher_score_kind": "cp",
        "source_row_sha256": "7" * 64,
    }


class TinyDirectModel(torch.nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.hand = torch.nn.Linear(2, 1)
        self.bucket_bias = torch.nn.Embedding(2, 1)

    def forward(self, _board, hands, bucket):
        return (
            self.hand(hands).squeeze(-1)
            + self.bucket_bias(bucket).squeeze(-1)
        )


class DirectTeacherHalfkp81V2TrainerTests(unittest.TestCase):
    def test_recipe_constants_are_the_preregistered_one_shot(self) -> None:
        self.assertEqual(DIRECT.FEATURES, "halfkp-factor")
        self.assertEqual(DIRECT.K_SIGMOID, 600.0)
        self.assertEqual(DIRECT.CP_CLAMP, 3000)
        self.assertEqual(DIRECT.SEED, 42)
        self.assertEqual(DIRECT.BATCH, 2048)
        self.assertEqual(DIRECT.LEARNING_RATE, 0.000003)
        self.assertEqual(DIRECT.EPOCHS, 1)
        self.assertEqual(
            PROTOCOL.EXPECTED_TRAINING["checkpoint_selection"],
            "final-epoch-1-only",
        )
        self.assertFalse(PROTOCOL.EXPECTED_TRAINING["best_checkpoint_selection"])
        self.assertFalse(PROTOCOL.EXPECTED_TRAINING["additional_seed"])
        cli_fields = {
            action.dest for action in DIRECT._parser()._actions if action.dest != "help"
        }
        self.assertEqual(
            cli_fields,
            {"execution_plan", "pipeline_revision", "out", "repo_root"},
        )

    def test_direct_scalar_bce_is_logits_bce_not_mse_or_rank(self) -> None:
        logits = torch.tensor([-2.0, 0.0, 1.5])
        targets = torch.tensor([0.1, 0.5, 0.8])
        actual = DIRECT.direct_scalar_bce(logits, targets)
        expected = torch.nn.functional.binary_cross_entropy_with_logits(
            logits, targets
        )
        self.assertTrue(torch.equal(actual, expected))
        self.assertFalse(
            torch.isclose(
                actual,
                torch.nn.functional.mse_loss(torch.sigmoid(logits), targets),
            )
        )

    def test_bound_dataset_requires_exact_identity_role_and_child_id(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "training.jsonl"
            raw = (
                json.dumps(_row(), sort_keys=True, separators=(",", ":")) + "\n"
            ).encode()
            path.write_bytes(raw)
            declared = {
                "path": str(path),
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "rows": 1,
                "parents": 1,
                "games": 1,
                "row_schema": PROTOCOL.ROW_SCHEMA,
                "game_ids_sha256": PROTOCOL.id_set_sha256(
                    {_row()["game_id"]}
                ),
                "parent_ids_sha256": PROTOCOL.id_set_sha256(
                    {_row()["parent_id"]}
                ),
                "position_ids_sha256": PROTOCOL.id_set_sha256(
                    {_row()["position_id"]}
                ),
                "child_position_ids_sha256": PROTOCOL.id_set_sha256(
                    {_row()["child_position_id"]}
                ),
                "semantic_position_ids_sha256": PROTOCOL.id_set_sha256(
                    {_row()["position_id"], _row()["child_position_id"]}
                ),
            }
            tensors, rows, identity = DIRECT.load_bound_dataset(
                str(path), declared, role="training"
            )
            self.assertEqual(len(rows), 1)
            self.assertEqual(tuple(tensors[0].shape), (1, train.MAX_PIECES))
            self.assertEqual(tuple(tensors[1].shape), (1, train.HAND_FEATS))
            self.assertEqual(identity["sha256"], declared["sha256"])
            self.assertEqual(float(tensors[3][0]), 125.0)

            changed = copy.deepcopy(_row())
            changed["child_position_id"] = _sha_id("8")
            path.write_text(
                json.dumps(changed, sort_keys=True, separators=(",", ":")) + "\n"
            )
            changed_raw = path.read_bytes()
            declared.update(
                bytes=len(changed_raw),
                sha256=hashlib.sha256(changed_raw).hexdigest(),
            )
            with self.assertRaisesRegex(
                DIRECT.DirectTeacherTrainingError, "does not match child_sfen"
            ):
                DIRECT.load_bound_dataset(
                    str(path), declared, role="training"
                )

    def test_dataset_rejects_extra_field_and_identity_drift(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "training.jsonl"
            row = _row()
            row["cp"] = row["teacher_child_cp"]
            raw = (json.dumps(row, separators=(",", ":")) + "\n").encode()
            path.write_bytes(raw)
            declared = {
                "path": str(path),
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "rows": 1,
                "parents": 1,
                "games": 1,
                "row_schema": PROTOCOL.ROW_SCHEMA,
                **{
                    field: "0" * 64
                    for field in PROTOCOL.ID_SET_SHA256_FIELDS
                },
            }
            with self.assertRaisesRegex(
                DIRECT.DirectTeacherTrainingError, "fields are not exact"
            ):
                DIRECT.load_bound_dataset(
                    str(path), declared, role="training"
                )
            declared["sha256"] = "0" * 64
            with self.assertRaisesRegex(
                DIRECT.DirectTeacherTrainingError, "sha256 differs"
            ):
                DIRECT.load_bound_dataset(
                    str(path), declared, role="training"
                )

    def test_dataset_rejects_identity_to_parse_swap(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "training.jsonl"
            original_row = _row()
            original = (
                json.dumps(original_row, sort_keys=True, separators=(",", ":"))
                + "\n"
            ).encode()
            path.write_bytes(original)
            declared = {
                "path": str(path),
                "bytes": len(original),
                "sha256": hashlib.sha256(original).hexdigest(),
                "rows": 1,
                "parents": 1,
                "games": 1,
                "row_schema": PROTOCOL.ROW_SCHEMA,
                "game_ids_sha256": PROTOCOL.id_set_sha256(
                    {original_row["game_id"]}
                ),
                "parent_ids_sha256": PROTOCOL.id_set_sha256(
                    {original_row["parent_id"]}
                ),
                "position_ids_sha256": PROTOCOL.id_set_sha256(
                    {original_row["position_id"]}
                ),
                "child_position_ids_sha256": PROTOCOL.id_set_sha256(
                    {original_row["child_position_id"]}
                ),
                "semantic_position_ids_sha256": PROTOCOL.id_set_sha256(
                    {
                        original_row["position_id"],
                        original_row["child_position_id"],
                    }
                ),
            }
            changed_row = copy.deepcopy(original_row)
            changed_row["teacher_child_cp"] = 126
            changed = (
                json.dumps(changed_row, sort_keys=True, separators=(",", ":"))
                + "\n"
            ).encode()
            real_identity = PROTOCOL.stable_file_identity

            def capture_then_swap(*args, **kwargs):
                result = real_identity(*args, **kwargs)
                path.write_bytes(changed)
                return result

            with mock.patch.object(
                PROTOCOL,
                "stable_file_identity",
                side_effect=capture_then_swap,
            ):
                with self.assertRaisesRegex(
                    DIRECT.DirectTeacherTrainingError,
                    "changed between identity capture and parsing",
                ):
                    DIRECT.load_bound_dataset(
                        str(path), declared, role="training"
                    )

    def test_pair_accuracy_counts_prediction_ties_as_incorrect(self) -> None:
        rows = [
            {"parent_id": "p"},
            {"parent_id": "p"},
            {"parent_id": "p"},
        ]
        teacher = torch.tensor([100.0, 0.0, -100.0])
        outputs = torch.tensor([1.0, 1.0, -1.0])
        accuracy, correct, total = DIRECT.pair_accuracy(outputs, teacher, rows)
        self.assertEqual((correct, total), (2, 3))
        self.assertEqual(accuracy, 2 / 3)

    def test_one_epoch_uses_every_parameter_and_row_once(self) -> None:
        torch.manual_seed(9)
        model = TinyDirectModel()
        before = {
            name: parameter.detach().clone()
            for name, parameter in model.named_parameters()
        }
        rows = 7
        tensors = (
            torch.zeros((rows, 1), dtype=torch.long),
            torch.randn((rows, 2)),
            torch.linspace(0.1, 0.9, rows),
            torch.zeros(rows),
            torch.tensor([0, 1, 0, 1, 0, 1, 0], dtype=torch.long),
        )
        receipt = DIRECT.train_exactly_one_epoch(
            model, tensors, device=torch.device("cpu")
        )
        self.assertEqual(receipt["epoch"], 1)
        self.assertEqual(receipt["rows"], rows)
        self.assertEqual(receipt["parameter_scope"], "all")
        self.assertTrue(math.isfinite(receipt["direct_scalar_bce"]))
        for name, parameter in model.named_parameters():
            self.assertFalse(torch.equal(before[name], parameter))

    def test_static_receipt_passes_only_when_every_fixed_check_passes(self) -> None:
        execution = {
            "path": "/tmp/plan.json",
            "bytes": 10,
            "sha256": "1" * 64,
            "schema": PROTOCOL.EXECUTION_PLAN_SCHEMA,
        }
        trainer = {
            "path": "/tmp/trainer.json",
            "bytes": 11,
            "sha256": "2" * 64,
            "schema": DIRECT.TRAINER_RESULT_SCHEMA,
        }
        weights = {
            "path": "/tmp/candidate.bin",
            "bytes": DIRECT.EXPECTED_EXPORT_BYTES,
            "sha256": "3" * 64,
            "buckets": 81,
        }
        baseline = {"teacher_mae_cp": 100.0, "pair_accuracy": 0.7}
        candidate = {"teacher_mae_cp": 90.0, "pair_accuracy": 0.699}
        initializer_quantization = {
            "mean_abs_cp_delta": 10.0,
            "max_abs_cp_delta": 20.0,
        }
        candidate_quantization = {
            "mean_abs_cp_delta": 10.0,
            "max_abs_cp_delta": 20.0,
        }
        runtime = {
            "parity": {"mismatches": 0},
            "technical_faults": 0,
            "throughput": {
                "median_slowdown_percent": 3.0,
                "aggregate_slowdown_percent": 4.0,
            },
        }
        result = DIRECT.build_static_sanity_result(
            protocol={
                "path": "/tmp/protocol.json",
                "bytes": 9,
                "sha256": "0" * 64,
                "schema": PROTOCOL.PROTOCOL_SCHEMA,
            },
            execution_plan=execution,
            dataset_manifest={
                "path": "/tmp/manifest.json",
                "bytes": 9,
                "sha256": "4" * 64,
                "schema": PROTOCOL.DATASET_MANIFEST_SCHEMA,
            },
            initializer={
                "path": "/tmp/initializer.pt",
                "bytes": 9,
                "sha256": "5" * 64,
            },
            live_weights={
                "path": "/tmp/live.bin",
                "bytes": 9,
                "sha256": "6" * 64,
            },
            trainer_result=trainer,
            candidate_weights=weights,
            runtime_sanity={
                "path": "/tmp/runtime.json",
                "bytes": 9,
                "sha256": "7" * 64,
                "schema": DIRECT.RUNTIME_SCHEMA,
            },
            baseline_metrics=baseline,
            candidate_metrics=candidate,
            initializer_quantization=initializer_quantization,
            candidate_quantization=candidate_quantization,
            runtime_receipt=runtime,
            finite_training_and_inference=True,
            export_roundtrip_mismatches=0,
        )
        self.assertTrue(result["all_checks_passed"])
        self.assertTrue(result["paired56_authorized"])
        self.assertFalse(result["expanded_stage_authorized"])
        self.assertFalse(result["live_weight_write_authorized"])
        self.assertEqual(
            set(result["checks"]),
            set(PROTOCOL.EXPECTED_STATIC_SANITY["checks"]),
        )

        candidate["teacher_mae_cp"] = 99.0
        candidate["pair_accuracy"] = 0.697
        candidate_quantization["mean_abs_cp_delta"] = 11.0
        runtime["throughput"]["median_slowdown_percent"] = 6.0
        failed = DIRECT.build_static_sanity_result(
            protocol={
                "path": "/tmp/protocol.json",
                "bytes": 9,
                "sha256": "0" * 64,
                "schema": PROTOCOL.PROTOCOL_SCHEMA,
            },
            execution_plan=execution,
            dataset_manifest={
                "path": "/tmp/manifest.json",
                "bytes": 9,
                "sha256": "4" * 64,
                "schema": PROTOCOL.DATASET_MANIFEST_SCHEMA,
            },
            initializer={
                "path": "/tmp/initializer.pt",
                "bytes": 9,
                "sha256": "5" * 64,
            },
            live_weights={
                "path": "/tmp/live.bin",
                "bytes": 9,
                "sha256": "6" * 64,
            },
            trainer_result=trainer,
            candidate_weights=weights,
            runtime_sanity={
                "path": "/tmp/runtime.json",
                "bytes": 9,
                "sha256": "7" * 64,
                "schema": DIRECT.RUNTIME_SCHEMA,
            },
            baseline_metrics=baseline,
            candidate_metrics=candidate,
            initializer_quantization=initializer_quantization,
            candidate_quantization=candidate_quantization,
            runtime_receipt=runtime,
            finite_training_and_inference=True,
            export_roundtrip_mismatches=0,
        )
        self.assertFalse(failed["all_checks_passed"])
        self.assertFalse(failed["paired56_authorized"])
        self.assertEqual(
            failed["status"], "failed-one-or-more-checks-pilot-family-closed"
        )
        self.assertFalse(
            failed["checks"]["teacher_mae_cp_improvement_minimum"]["passed"]
        )
        self.assertFalse(failed["checks"]["pair_accuracy_delta_minimum"]["passed"])
        self.assertFalse(
            failed["checks"][
                "quantized_mean_abs_cp_delta_ratio_maximum"
            ]["passed"]
        )
        self.assertFalse(
            failed["checks"][
                "research_runtime_search_slowdown_percent_maximum"
            ]["passed"]
        )

    def test_safe_ratio_fails_closed_on_zero_initializer_error(self) -> None:
        self.assertEqual(DIRECT.safe_ratio(0.0, 0.0), 1.0)
        self.assertEqual(DIRECT.safe_ratio(1.0, 0.0), sys.float_info.max)


if __name__ == "__main__":
    unittest.main()
