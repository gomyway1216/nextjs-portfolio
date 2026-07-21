from __future__ import annotations

import copy
from contextlib import redirect_stderr
import io
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

import build_strength_first_int16_only_candidate_amendment_registry_candidate as BUILDER  # noqa: E402
import run_strength_first_int16_only_candidate_amendment as RUNNER  # noqa: E402
import strength_first_int16_only_candidate_amendment as PROTOCOL  # noqa: E402
import strength_first_int16_only_candidate_eval_adapter as ADAPTER  # noqa: E402
import strength_first_qat_selection_eval_adapter as BASE  # noqa: E402
import strength_first_representation_bridge_v3_eval_adapter as BRIDGE_ADAPTER  # noqa: E402
import strength_first_representation_bridge_v3_protocol as BRIDGE  # noqa: E402
from strength_first_quantized_cell_alignment import (  # noqa: E402
    anchor_identity,
    capture_quantized_anchor,
)
from train import DistillNet  # noqa: E402


def origin_for(candidate: dict) -> dict:
    raw = PROTOCOL.canonical_json_bytes(candidate)
    return {
        "path": PROTOCOL.REGISTRY_RELATIVE_PATH,
        "schema": PROTOCOL.REGISTRY_SCHEMA,
        "bytes": len(raw),
        "sha256": __import__("hashlib").sha256(raw).hexdigest(),
    }


def artifact_bindings(candidate: dict) -> list[dict]:
    return [
        {"seed": spec["seed"], "parent_result": copy.deepcopy(spec["parent_result"])}
        for spec in candidate["models"]["seeds"]
    ]


def metrics(pair: float, top1: float, mae: float, mse: float) -> dict[str, float]:
    return {
        "value_mae_cp": mae,
        "value_mse_cp2": mse,
        "within_parent_pair_accuracy": pair,
        "teacher_top1_accuracy": top1,
    }


REAL_METRICS = {
    "stable": metrics(
        0.5915841584158416,
        0.3034597749062109,
        526.6006381934217,
        623131.3687144961,
    ),
    42: metrics(
        0.6013040328423086,
        0.3153397248853689,
        405.9221193632092,
        410465.4984571148,
    ),
    43: metrics(
        0.6019882476052484,
        0.3161734055856607,
        402.7880987446525,
        408553.42411810084,
    ),
    44: metrics(
        0.6000563470981245,
        0.3186744476865361,
        405.71302335367136,
        410407.37639385654,
    ),
}


def report_for(candidate: dict) -> dict:
    models = [
        {
            "name": "stable",
            "role": "stable",
            "seed": None,
            "checkpoint": {
                **copy.deepcopy(candidate["models"]["stable"]["checkpoint"]),
                "epoch": 27,
            },
            "int16": copy.deepcopy(REAL_METRICS["stable"]),
            "int16_source": "evaluated-exact-int16-forward-batch",
        }
    ]
    for spec in candidate["models"]["seeds"]:
        seed = spec["seed"]
        models.append(
            {
                "name": f"seed-{seed}",
                "role": "epoch-20-parent-deployment",
                "seed": seed,
                "checkpoint": copy.deepcopy(spec["parent_checkpoint"]),
                "int16": copy.deepcopy(REAL_METRICS[seed]),
                "int16_source": "evaluated-exact-int16-forward-batch",
                "quantized_anchor": copy.deepcopy(spec["quantized_anchor"]),
            }
        )
    return {
        "schema": PROTOCOL.REPORT_SCHEMA,
        "status": PROTOCOL.REPORT_STATUS,
        "origin_registry": origin_for(candidate),
        "artifact_bindings": artifact_bindings(candidate),
        "data": {
            **copy.deepcopy(candidate["spent_selection"]["dataset"]),
            "records": 28_518,
            "parents": 4_798,
            "eligible_pairs": 100,
            "label_status": "already-spent-selection",
            "authorized_use": (
                "adaptive-int16-candidate-lock-not-independent-strength-evidence"
            ),
        },
        "models": models,
        "execution": {
            "model_count": 4,
            "model_loop_workers": 1,
            "int16_model_evaluations": 4,
            "float_model_evaluations": 0,
            "aligned_checkpoint_loads": 0,
            "int16_reference": "int16_forward_batch",
            "int16_batch_rows": 4_096,
            "torch_intraop_threads": 10,
            "torch_original_intraop_threads": 2,
            "torch_original_intraop_threads_restored": True,
            "torch_interop_threads": 1,
            "torch_interop_threads_unchanged": True,
            "spent_selection_label_reads": 1,
            "fresh_selection_label_reads": 0,
            "fresh_final_label_reads": 0,
            "legacy_holdout_label_reads": 0,
            "network_requests": 0,
            "cloud_requests": 0,
        },
        "boundary": copy.deepcopy(PROTOCOL.BOUNDARY),
    }


class FakeEvaluator:
    def __init__(self, entries: dict[str, tuple]):
        self.entries = entries
        self.loads: list[str] = []

    def load_model(self, path: str):
        self.loads.append(path)
        return self.entries[path]


class Int16OnlyCandidateAmendmentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.candidate = BUILDER.build_registry_candidate()
        cls.report = report_for(cls.candidate)

    def receipt(self, report: dict | None = None) -> dict:
        return RUNNER.build_adaptive_candidate_lock_receipt(
            self.report if report is None else report,
            registry=self.candidate,
            origin_registry=origin_for(self.candidate),
        )

    def test_real_spent_reproduction_locks_only_median_seed_42_epoch_20(self):
        receipt = self.receipt()
        self.assertEqual(receipt["ranked_seed_order"], [43, 42, 44])
        lock = receipt["candidate_lock"]
        self.assertEqual(lock["seed"], 42)
        self.assertEqual(lock["epoch"], 20)
        self.assertEqual(
            lock["checkpoint"]["sha256"], PROTOCOL.SELECTED_CHECKPOINT_SHA256
        )
        self.assertTrue(lock["candidate_locked"])
        self.assertFalse(lock["candidate_strength_selected"])
        self.assertFalse(lock["deployment_authority"])
        self.assertEqual(
            receipt["status"],
            "adaptive-int16-candidate-lock-awaiting-prospective-confirmation",
        )
        self.assertFalse(receipt["bridge_stop"]["family_gate_passed"])

    def test_candidate_checkpoint_substitution_is_rejected(self):
        for field, replacement in (
            ("sha256", "f" * 64),
            ("epoch", 24),
            ("path", self.report["models"][1]["checkpoint"]["path"] + ".other"),
        ):
            with self.subTest(field=field):
                report = copy.deepcopy(self.report)
                report["models"][1]["checkpoint"][field] = replacement
                with self.assertRaises(ValueError):
                    self.receipt(report)

    def test_rank_drift_stops_instead_of_falling_back_to_seed_43_or_44(self):
        report = copy.deepcopy(self.report)
        report["models"][1]["int16"]["within_parent_pair_accuracy"] = 0.599
        with self.assertRaises(RUNNER.Int16OnlyCandidateLockFailed):
            self.receipt(report)

    def test_seed_42_strength_failure_stops_without_fallback(self):
        report = copy.deepcopy(self.report)
        report["models"][1]["int16"] = copy.deepcopy(REAL_METRICS["stable"])
        with self.assertRaisesRegex(
            RUNNER.Int16OnlyCandidateLockFailed,
            "seed 42",
        ):
            self.receipt(report)

    def test_same_rank_metric_drift_is_not_accepted_as_reauthentication(self):
        report = copy.deepcopy(self.report)
        report["models"][2]["int16"]["value_mae_cp"] += 0.001
        with self.assertRaisesRegex(
            RUNNER.Int16OnlyCandidateLockFailed,
            "did not exactly reproduce",
        ):
            self.receipt(report)

    def test_float_witness_cannot_gain_authority_by_field_injection(self):
        report = copy.deepcopy(self.report)
        report["models"][1]["float"] = copy.deepcopy(REAL_METRICS[42])
        with self.assertRaisesRegex(ValueError, "report model"):
            self.receipt(report)

    def test_atomic_private_bundle_contains_only_three_enrolled_files(self):
        receipt = self.receipt()
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(os.path.realpath(temporary)) / "result"
            published = RUNNER.publish_private_bundle(
                output_root=str(target),
                report=self.report,
                receipt=receipt,
                origin_registry=origin_for(self.candidate),
                artifact_bindings=artifact_bindings(self.candidate),
            )
            self.assertTrue(published["commit_receipt"]["committed"])
            self.assertEqual(
                sorted(path.name for path in target.iterdir()),
                sorted(PROTOCOL.OUTPUT_FILES.values()),
            )
            self.assertEqual(target.stat().st_mode & 0o777, 0o700)
            self.assertTrue(
                all(path.stat().st_mode & 0o777 == 0o600 for path in target.iterdir())
            )
            self.assertEqual(published["publication"]["candidate_lock"]["seed"], 42)
            self.assertFalse(
                published["publication"]["candidate_lock"][
                    "candidate_strength_selected"
                ]
            )

    def test_atomic_helper_postcommit_receipt_fault_becomes_recovery(self):
        receipt = self.receipt()

        def rename_then_return_partial(source: Path, target: Path):
            os.rename(source, target)
            return {"committed": True}

        with tempfile.TemporaryDirectory() as temporary:
            target = Path(os.path.realpath(temporary)) / "result"
            with mock.patch.object(
                RUNNER.ATOMIC,
                "_rename_directory_exclusive",
                rename_then_return_partial,
            ):
                published = RUNNER.publish_private_bundle(
                    output_root=str(target),
                    report=self.report,
                    receipt=receipt,
                    origin_registry=origin_for(self.candidate),
                    artifact_bindings=artifact_bindings(self.candidate),
                )
            commit = published["commit_receipt"]
            self.assertTrue(target.is_dir())
            self.assertTrue(commit["committed"])
            self.assertEqual(
                commit["post_commit_status"],
                "committed-recovery-verification-required",
            )
            self.assertIn(
                "atomic-helper-receipt-invalid-after-commit",
                commit["diagnostic_errors"],
            )

    def test_failed_seed_42_gate_leaves_no_output_root(self):
        report = copy.deepcopy(self.report)
        report["models"][1]["int16"] = copy.deepcopy(REAL_METRICS["stable"])
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(os.path.realpath(temporary)) / "result"
            with self.assertRaises(RUNNER.Int16OnlyCandidateLockFailed):
                receipt = RUNNER.build_adaptive_candidate_lock_receipt(
                    report,
                    registry=self.candidate,
                    origin_registry=origin_for(self.candidate),
                )
                RUNNER.publish_private_bundle(
                    output_root=str(target),
                    report=report,
                    receipt=receipt,
                    origin_registry=origin_for(self.candidate),
                    artifact_bindings=artifact_bindings(self.candidate),
                )
            self.assertFalse(target.exists())

    def test_prevalidation_loads_no_labels_float_or_aligned_checkpoint(self):
        candidate = copy.deepcopy(self.candidate)
        root = ML_DIR.parent.resolve()
        home = Path.home().resolve()
        entries = {}
        fingerprints = {}
        stable_model = DistillNet("board")
        stable_spec = candidate["models"]["stable"]["checkpoint"]
        stable_path = str((home / stable_spec["path"]).absolute())
        entries[stable_path] = (
            stable_model,
            {"epoch": 27, "model": stable_model.state_dict()},
            600.0,
            {"bytes": stable_spec["bytes"], "sha256": stable_spec["sha256"]},
        )
        for spec in candidate["models"]["seeds"]:
            model = DistillNet("board")
            spec["quantized_anchor"] = anchor_identity(capture_quantized_anchor(model))
            checkpoint = spec["parent_checkpoint"]
            checkpoint_path = str((root / checkpoint["path"]).absolute())
            entries[checkpoint_path] = (
                model,
                {
                    "schema": "shogi-floodgate-strength-first-qat-final-checkpoint-v2",
                    "epoch": 20,
                    "model": model.state_dict(),
                },
                600.0,
                {"bytes": checkpoint["bytes"], "sha256": checkpoint["sha256"]},
            )
            result_path = str((root / spec["parent_result"]["path"]).absolute())
            fingerprints[result_path] = {
                "bytes": spec["parent_result"]["bytes"],
                "sha256": spec["parent_result"]["sha256"],
            }
        evaluator = FakeEvaluator(entries)
        label_loader = mock.Mock(side_effect=AssertionError("labels must stay sealed"))
        with mock.patch.object(
            BASE, "_load_splitless_fresh_selection_as_validation", label_loader
        ):
            prepared = ADAPTER.prevalidate_parent_family(
                registry=candidate,
                repo_root=root,
                home_root=home,
                evaluator=evaluator,
                fingerprint=lambda path: fingerprints[path],
            )
        label_loader.assert_not_called()
        self.assertEqual(len(evaluator.loads), 4)
        self.assertFalse(
            any("constrained-alignment" in path for path in evaluator.loads)
        )
        self.assertEqual(prepared["aligned_checkpoints_loaded"], 0)
        self.assertEqual(prepared["float_model_evaluations"], 0)
        self.assertFalse(prepared["selection_labels_read"])
        self.assertFalse(prepared["fresh_final_labels_read"])

    def test_adapter_performs_four_exact_int16_calls_and_one_spent_read(self):
        prepared = {
            "stable": {
                "name": "stable",
                "role": "stable",
                "seed": None,
                "model": object(),
                "identity": self.candidate["models"]["stable"]["checkpoint"],
                "epoch": 27,
                "k_sigmoid": 600.0,
                "path": "/stable",
            },
            "models": [],
            "selection_labels_read": False,
            "fresh_selection_labels_read": False,
            "fresh_final_labels_read": False,
            "legacy_holdout_labels_read": False,
            "aligned_checkpoints_loaded": 0,
            "float_model_evaluations": 0,
        }
        for spec in self.candidate["models"]["seeds"]:
            prepared["models"].append(
                {
                    "name": f"seed-{spec['seed']}",
                    "role": "epoch-20-parent-deployment",
                    "seed": spec["seed"],
                    "model": object(),
                    "identity": spec["parent_checkpoint"],
                    "epoch": 20,
                    "k_sigmoid": 600.0,
                    "path": f"/seed-{spec['seed']}",
                    "quantized_anchor": spec["quantized_anchor"],
                }
            )

        class MetricEvaluator:
            def _eligible_pair_count(self, *_args):
                return 1

            def calculate_metrics(self, predictions, *_args):
                index = int(predictions[0].item())
                key = ("stable", 42, 43, 44)[index]
                return copy.deepcopy(REAL_METRICS[key])

            def float_predictions(self, *_args):
                raise AssertionError("float path must not run")

        loaded = (
            torch.zeros((2, 1), dtype=torch.int64),
            torch.zeros((2, 1), dtype=torch.int64),
            torch.zeros(2, dtype=torch.int64),
            torch.zeros(2),
            torch.zeros(2),
            [{}, {}],
            [object()],
            {"bytes": 9, "sha256": "a" * 64},
        )
        loader = mock.Mock(return_value=loaded)
        calls = 0

        def exact(*_args, **_kwargs):
            nonlocal calls
            result = torch.full((2,), calls, dtype=torch.float64)
            calls += 1
            return result

        with (
            mock.patch.object(
                BASE, "_load_splitless_fresh_selection_as_validation", loader
            ),
            mock.patch.object(BRIDGE_ADAPTER, "exact_int16_predictions", exact),
        ):
            report = ADAPTER.evaluate_spent_selection_int16_only(
                prepared=prepared,
                dataset_path="/spent",
                dataset_identity={"bytes": 9, "sha256": "a" * 64},
                expected_records=2,
                expected_parents=1,
                origin_registry_identity=origin_for(self.candidate),
                artifact_bindings=artifact_bindings(self.candidate),
                evaluator=MetricEvaluator(),
            )
        self.assertEqual(calls, 4)
        loader.assert_called_once()
        self.assertEqual(report["execution"]["spent_selection_label_reads"], 1)
        self.assertEqual(report["execution"]["float_model_evaluations"], 0)
        self.assertEqual(report["execution"]["aligned_checkpoint_loads"], 0)
        self.assertEqual(report["execution"]["fresh_final_label_reads"], 0)

    def test_runtime_source_drift_stops_before_any_label_read(self):
        candidate = copy.deepcopy(self.candidate)
        candidate["implementation"]["adapter"]["sha256"] = "f" * 64
        label_reader = mock.Mock()
        with (
            mock.patch.object(
                BASE, "_load_splitless_fresh_selection_as_validation", label_reader
            ),
            self.assertRaisesRegex(ValueError, "identity mismatch"),
        ):
            RUNNER._validate_public_inputs(candidate, ML_DIR.parent, Path.home())
        label_reader.assert_not_called()

    def test_existing_bridge_output_spoof_stops_before_labels(self):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(os.path.realpath(temporary))
            (home / BRIDGE.OUTPUT_ROOT).mkdir(parents=True)
            with self.assertRaisesRegex(ValueError, "cannot be promoted"):
                RUNNER._validate_public_inputs(self.candidate, ML_DIR.parent, home)

    def test_runner_arguments_are_forbidden_before_registry_or_label_read(self):
        standard_error = io.StringIO()
        with (
            mock.patch.object(RUNNER, "run_int16_only_candidate_amendment") as run,
            redirect_stderr(standard_error),
        ):
            self.assertEqual(RUNNER.main(["--seed", "43"]), 2)
        run.assert_not_called()
        self.assertIn("arguments forbidden", standard_error.getvalue())

    def test_committed_buggy_publisher_mutation_is_recovery_not_false_stop(self):
        prepared = {
            "selection_labels_read": False,
            "fresh_selection_labels_read": False,
            "fresh_final_labels_read": False,
            "legacy_holdout_labels_read": False,
            "aligned_checkpoints_loaded": 0,
            "float_model_evaluations": 0,
            "watched_artifacts": [],
        }

        def buggy_publish(**kwargs):
            kwargs["receipt"]["candidate_lock"]["deployment_authority"] = True
            return {
                "publication": {"schema": PROTOCOL.PUBLICATION_SCHEMA},
                "commit_receipt": {
                    "schema": PROTOCOL.COMMIT_RECEIPT_SCHEMA,
                    "committed": True,
                    "commit_point": PROTOCOL.COMMIT_SEMANTICS["commit_point"],
                    "post_commit_status": "verified-and-parent-fsynced",
                    "diagnostic_errors": [],
                    "recovery": "none",
                },
            }

        with tempfile.TemporaryDirectory() as temporary:
            home = Path(os.path.realpath(temporary))
            with (
                mock.patch.object(
                    RUNNER,
                    "_runtime_registry",
                    return_value=(self.candidate, origin_for(self.candidate)),
                ),
                mock.patch.object(RUNNER, "_validate_public_inputs"),
                mock.patch.object(RUNNER, "_require_registry_unchanged"),
            ):
                result = RUNNER.run_int16_only_candidate_amendment(
                    repo_root=ML_DIR.parent,
                    home_root=home,
                    prevalidate=lambda **_kwargs: copy.deepcopy(prepared),
                    evaluate=lambda **_kwargs: copy.deepcopy(self.report),
                    publish=buggy_publish,
                    fingerprint=lambda _path: {
                        "bytes": self.candidate["spent_selection"]["dataset"]["bytes"],
                        "sha256": self.candidate["spent_selection"]["dataset"][
                            "sha256"
                        ],
                    },
                )
        self.assertFalse(result["receipt"]["candidate_lock"]["deployment_authority"])
        self.assertEqual(
            result["commit_receipt"]["post_commit_status"],
            "committed-recovery-verification-required",
        )
        self.assertIn(
            "post-commit-publication-validation-failed",
            result["commit_receipt"]["diagnostic_errors"],
        )

    def test_uncommitted_partial_publisher_result_is_stop(self):
        prepared = {
            "selection_labels_read": False,
            "fresh_selection_labels_read": False,
            "fresh_final_labels_read": False,
            "legacy_holdout_labels_read": False,
            "aligned_checkpoints_loaded": 0,
            "float_model_evaluations": 0,
            "watched_artifacts": [],
        }
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(os.path.realpath(temporary))
            with (
                mock.patch.object(
                    RUNNER,
                    "_runtime_registry",
                    return_value=(self.candidate, origin_for(self.candidate)),
                ),
                mock.patch.object(RUNNER, "_validate_public_inputs"),
                mock.patch.object(RUNNER, "_require_registry_unchanged"),
                self.assertRaises(ValueError),
            ):
                RUNNER.run_int16_only_candidate_amendment(
                    repo_root=ML_DIR.parent,
                    home_root=home,
                    prevalidate=lambda **_kwargs: copy.deepcopy(prepared),
                    evaluate=lambda **_kwargs: copy.deepcopy(self.report),
                    publish=lambda **_kwargs: {
                        "publication": {"schema": PROTOCOL.PUBLICATION_SCHEMA},
                        "commit_receipt": {"committed": False},
                    },
                    fingerprint=lambda _path: {
                        "bytes": self.candidate["spent_selection"]["dataset"]["bytes"],
                        "sha256": self.candidate["spent_selection"]["dataset"][
                            "sha256"
                        ],
                    },
                )

    def test_partial_commit_receipt_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            RUNNER._validate_commit_receipt({"committed": True})

    def test_cli_surfaces_committed_recovery_without_false_stop(self):
        result = {
            "receipt": {"candidate_lock": {"seed": 42, "epoch": 20}},
            "commit_receipt": {
                "schema": PROTOCOL.COMMIT_RECEIPT_SCHEMA,
                "committed": True,
                "commit_point": PROTOCOL.COMMIT_SEMANTICS["commit_point"],
                "post_commit_status": "committed-recovery-verification-required",
                "diagnostic_errors": ["parent-directory-fsync-failed"],
                "recovery": PROTOCOL.COMMIT_SEMANTICS["recovery"],
            },
        }
        standard_error = io.StringIO()
        with (
            mock.patch.object(
                RUNNER, "run_int16_only_candidate_amendment", return_value=result
            ),
            redirect_stderr(standard_error),
        ):
            self.assertEqual(RUNNER.main([]), 0)
        rendered = standard_error.getvalue()
        self.assertIn("COMMITTED-RECOVERY", rendered)
        self.assertIn("parent-directory-fsync-failed", rendered)
        self.assertIn(PROTOCOL.COMMIT_SEMANTICS["recovery"], rendered)


if __name__ == "__main__":
    unittest.main()
