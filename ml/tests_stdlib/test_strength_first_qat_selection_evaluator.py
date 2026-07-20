from __future__ import annotations

import copy
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import sys
import tempfile
from types import SimpleNamespace
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import run_strength_first_selection_teacher_preflight as teacher_preflight  # noqa: E402
import strength_first_qat_selection_eval_adapter as adapter  # noqa: E402
import strength_first_qat_selection_evaluator as evaluator  # noqa: E402


def canonical(value) -> bytes:
    return evaluator._canonical_json_bytes(value)


def digest(label: str) -> str:
    return hashlib.sha256(label.encode("utf-8")).hexdigest()


def identity(path: str, raw: bytes, schema: str) -> dict:
    return {
        "path": path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": schema,
    }


class ReadyHarness:
    def __init__(self, temporary: str):
        self.repo_root = REPO_ROOT
        self.home_root = Path(temporary).resolve()
        self.files: dict[str, bytes] = {}
        self.read_counts: dict[str, int] = {}
        self.tracked_drift_path: str | None = None
        self.fingerprints: dict[str, dict] = {}
        self.fingerprint_counts: dict[str, int] = {}
        self.drift_path: str | None = None
        self.tracked: list[str] = []
        self.claims = 0
        self.claim_used = False
        self.evaluations: list[dict] = []
        self.publications: list[tuple[str, bytes]] = []
        self.completion = {
            "input_games": 200,
            "input_parents": 4_800,
            "completed_parents": 4_800,
            "forced_parents_skipped": 1,
            "forced_skip_reasons": {"fewer_than_two_legal_moves": 1},
            "emitted_parent_groups": 4_799,
            "dataset_records": 9_598,
            "sealed": True,
        }
        self.registry = json.loads(
            (
                REPO_ROOT
                / evaluator.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
            ).read_text(encoding="utf-8")
        )
        self._build_ready()

    @staticmethod
    def _key(path: str | Path) -> str:
        return os.path.abspath(os.fspath(path))

    def _put(self, path: str | Path, raw: bytes) -> None:
        self.files[self._key(path)] = raw

    def _set_fingerprint(
        self,
        path: str | Path,
        *,
        raw: bytes | None = None,
        bytes_count: int | None = None,
        sha256: str | None = None,
    ) -> dict:
        if raw is not None:
            value = {
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
            }
        else:
            value = {"bytes": bytes_count, "sha256": sha256}
        self.fingerprints[self._key(path)] = value
        return value

    def _build_ready(self) -> None:
        self.registry["status"] = (
            evaluator.STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS
        )
        self.registry["gates"] = copy.deepcopy(evaluator._READY_GATES)
        for name, relative in evaluator._IMPLEMENTATION_PATHS.items():
            raw = (REPO_ROOT / relative).read_bytes()
            self.registry["implementation"][name] = identity(
                relative,
                raw,
                evaluator._SOURCE_IDENTITY_SCHEMA,
            )

        plan_raw = canonical(
            {
                "schema": evaluator.BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
                "synthetic": True,
            }
        )
        plan_identity = identity(
            evaluator._FIXED_PATHS["training_plan"],
            plan_raw,
            evaluator.BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
        )
        plan_path = REPO_ROOT / plan_identity["path"]
        self._put(plan_path, plan_raw)

        preflight_registry_raw = canonical(
            {
                "schema": (
                    evaluator.PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_SCHEMA
                ),
                "synthetic": True,
            }
        )
        preflight_registry_identity = identity(
            evaluator._FIXED_PATHS["selection_preflight_registry"],
            preflight_registry_raw,
            evaluator.PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_SCHEMA,
        )
        self._put(
            REPO_ROOT / preflight_registry_identity["path"],
            preflight_registry_raw,
        )

        pipeline = {
            "source_revision": "1" * 40,
            "tracked_tree_clean": True,
        }
        runs = []
        for seed in (42, 43, 44):
            output = f"{evaluator.BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{seed}"
            result_relative = f"{output}/result.json"
            checkpoint_relative = f"{output}/final.pt"
            result_raw = f"result-{seed}\n".encode()
            checkpoint_raw = f"checkpoint-{seed}\n".encode()
            result_fingerprint = self._set_fingerprint(
                REPO_ROOT / result_relative,
                raw=result_raw,
            )
            checkpoint_fingerprint = self._set_fingerprint(
                REPO_ROOT / checkpoint_relative,
                raw=checkpoint_raw,
            )
            runs.append(
                {
                    "slot_id": ("floodgate-strength-first-int16-aware-" f"seed-{seed}"),
                    "seed": seed,
                    "output": output,
                    "result": {
                        "path": str(REPO_ROOT / result_relative),
                        **result_fingerprint,
                    },
                    "checkpoint": {
                        "path": str(REPO_ROOT / checkpoint_relative),
                        **checkpoint_fingerprint,
                    },
                    "checkpoint_metadata": {
                        "schema": (
                            evaluator.BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA
                        ),
                        "epoch": 20,
                    },
                }
            )
        self.preflight = {
            "schema": (
                evaluator.PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_PREFLIGHT_SCHEMA
            ),
            "all_three_complete_before_selection_read": True,
            "selection_labels_read": False,
            "training_plan": {
                "path": str(plan_path),
                "bytes": plan_identity["bytes"],
                "sha256": plan_identity["sha256"],
                "schema": plan_identity["schema"],
            },
            "training_pipeline": pipeline,
            "runs": runs,
            "reader_gate": "one-shot-public-api-accidental-misuse-guard",
            "same_process_python_authorization_enforced": False,
            "final_holdout": "not_opened_by_this_preflight",
            "production_promotion_authorized": False,
        }
        self.teacher_preflight_summary = (
            teacher_preflight.build_strength_first_selection_teacher_preflight_summary(
                self.preflight,
                registry_raw=preflight_registry_raw,
            )
        )
        preflight_sha256 = self.teacher_preflight_summary["checkpoint_preflight_sha256"]

        dataset_raw = b"synthetic-selection-dataset\n"
        dataset_identity = identity(
            evaluator.STRENGTH_FIRST_SELECTION_DATASET_PATH,
            dataset_raw,
            evaluator.STRENGTH_FIRST_SELECTION_DATASET_SCHEMA,
        )
        stable_raw = b"synthetic-stable-checkpoint\n"
        stable_identity = identity(
            evaluator.STRENGTH_FIRST_STABLE_CHECKPOINT_PATH,
            stable_raw,
            evaluator.STRENGTH_FIRST_STABLE_CHECKPOINT_IDENTITY_SCHEMA,
        )
        self._set_fingerprint(
            self.home_root / evaluator._SELECTION_SOURCE["path"],
            bytes_count=evaluator._SELECTION_SOURCE["bytes"],
            sha256=evaluator._SELECTION_SOURCE["sha256"],
        )
        self._set_fingerprint(
            self.home_root / dataset_identity["path"],
            raw=dataset_raw,
        )
        self._set_fingerprint(
            self.home_root / stable_identity["path"],
            raw=stable_raw,
        )

        enrollments = self.registry["enrollments"]
        enrollments["training_plan"] = plan_identity
        enrollments["selection_preflight_registry"] = preflight_registry_identity
        enrollments["checkpoint_preflight_sha256"] = preflight_sha256
        enrollments["selection_teacher_run_fingerprint"] = digest(
            "selection-teacher-run"
        )
        enrollments["selection_dataset"] = dataset_identity
        enrollments["stable_checkpoint"] = stable_identity
        self._rebuild_teacher_documents()
        self.report = self._passing_report()
        self._put(
            REPO_ROOT
            / evaluator.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH,
            canonical(self.registry),
        )

    def _rebuild_teacher_documents(self) -> None:
        enrollments = self.registry["enrollments"]
        manifest = {
            "schema": evaluator.STRENGTH_FIRST_SELECTION_TEACHER_MANIFEST_SCHEMA,
            "status": evaluator.STRENGTH_FIRST_SELECTION_TEACHER_STATUS,
            "role": "fresh_selection",
            "source": copy.deepcopy(evaluator._SELECTION_SOURCE),
            "dataset": copy.deepcopy(enrollments["selection_dataset"]),
            "completion": copy.deepcopy(self.completion),
            "run_fingerprint": enrollments["selection_teacher_run_fingerprint"],
            "boundary": copy.deepcopy(evaluator._TEACHER_BOUNDARY),
        }
        manifest_raw = canonical(manifest)
        manifest_identity = identity(
            evaluator.STRENGTH_FIRST_SELECTION_MANIFEST_PATH,
            manifest_raw,
            evaluator.STRENGTH_FIRST_SELECTION_TEACHER_MANIFEST_SCHEMA,
        )
        result = {
            "schema": evaluator.STRENGTH_FIRST_SELECTION_TEACHER_RESULT_SCHEMA,
            "status": evaluator.STRENGTH_FIRST_SELECTION_TEACHER_STATUS,
            "role": "fresh_selection",
            "manifest": manifest_identity,
            "dataset": copy.deepcopy(enrollments["selection_dataset"]),
            "completion": copy.deepcopy(self.completion),
            "run_fingerprint": enrollments["selection_teacher_run_fingerprint"],
            "postflight_complete": True,
            "boundary": copy.deepcopy(evaluator._TEACHER_BOUNDARY),
        }
        result_raw = canonical(result)
        result_identity = identity(
            evaluator.STRENGTH_FIRST_SELECTION_RESULT_PATH,
            result_raw,
            evaluator.STRENGTH_FIRST_SELECTION_TEACHER_RESULT_SCHEMA,
        )
        authority = {
            "schema": evaluator.STRENGTH_FIRST_SELECTION_TEACHER_AUTHORITY_SCHEMA,
            "status": evaluator.STRENGTH_FIRST_SELECTION_TEACHER_STATUS,
            "role": "fresh_selection",
            "source": copy.deepcopy(evaluator._SELECTION_SOURCE),
            "training_plan": copy.deepcopy(enrollments["training_plan"]),
            "selection_preflight_registry": copy.deepcopy(
                enrollments["selection_preflight_registry"]
            ),
            "checkpoint_preflight_sha256": enrollments["checkpoint_preflight_sha256"],
            "artifacts": {
                "manifest": manifest_identity,
                "result": result_identity,
                "dataset": copy.deepcopy(enrollments["selection_dataset"]),
            },
            "completion": copy.deepcopy(self.completion),
            "run_fingerprint": enrollments["selection_teacher_run_fingerprint"],
            "boundary": copy.deepcopy(evaluator._TEACHER_BOUNDARY),
        }
        authority_raw = canonical(authority)
        authority_identity = identity(
            evaluator.STRENGTH_FIRST_SELECTION_AUTHORITY_PATH,
            authority_raw,
            evaluator.STRENGTH_FIRST_SELECTION_TEACHER_AUTHORITY_SCHEMA,
        )
        enrollments["selection_teacher_manifest"] = manifest_identity
        enrollments["selection_teacher_result"] = result_identity
        enrollments["selection_teacher_authority"] = authority_identity
        self._put(
            self.home_root / manifest_identity["path"],
            manifest_raw,
        )
        self._put(
            self.home_root / result_identity["path"],
            result_raw,
        )
        self._put(
            self.home_root / authority_identity["path"],
            authority_raw,
        )
        for item in (
            manifest_identity,
            result_identity,
            authority_identity,
        ):
            raw = self.files[self._key(self.home_root / item["path"])]
            self._set_fingerprint(self.home_root / item["path"], raw=raw)

    @staticmethod
    def _model(
        name: str,
        checkpoint: dict,
        *,
        pair: float,
        top1: float,
        mae: float,
    ) -> dict:
        floating = {
            "value_mae_cp": mae + 1.0,
            "value_mse_cp2": (mae + 1.0) ** 2,
            "within_parent_pair_accuracy": pair + 0.001,
            "teacher_top1_accuracy": top1 + 0.002,
        }
        quantized = {
            "value_mae_cp": mae,
            "value_mse_cp2": mae**2,
            "within_parent_pair_accuracy": pair,
            "teacher_top1_accuracy": top1,
        }
        return {
            "name": name,
            "checkpoint": checkpoint,
            "k_sigmoid": 600.0,
            "production_k_int": 600,
            "float": floating,
            "quantized_int16": {
                **quantized,
                "delta_from_float": {
                    field: quantized[field] - floating[field]
                    for field in evaluator._METRIC_FIELDS
                },
            },
        }

    def _passing_report(self) -> dict:
        stable = self.registry["enrollments"]["stable_checkpoint"]
        models = [
            self._model(
                "stable",
                {
                    "bytes": stable["bytes"],
                    "sha256": stable["sha256"],
                    "epoch": 27,
                },
                pair=0.60,
                top1=0.30,
                mae=100.0,
            )
        ]
        metrics = {
            42: (0.63, 0.31, 90.0),
            43: (0.62, 0.305, 92.0),
            44: (0.59, 0.30, 95.0),
        }
        for run in self.preflight["runs"]:
            pair, top1, mae = metrics[run["seed"]]
            models.append(
                self._model(
                    run["slot_id"],
                    {
                        "bytes": run["checkpoint"]["bytes"],
                        "sha256": run["checkpoint"]["sha256"],
                        "epoch": 20,
                    },
                    pair=pair,
                    top1=top1,
                    mae=mae,
                )
            )
        dataset = self.registry["enrollments"]["selection_dataset"]
        return {
            "schema": adapter.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_SCHEMA,
            "status": adapter.STRENGTH_FIRST_SELECTION_EVALUATION_STATUS,
            "data": {
                "bytes": dataset["bytes"],
                "sha256": dataset["sha256"],
                "records": self.completion["dataset_records"],
                "parents": self.completion["emitted_parent_groups"],
                "eligible_pairs": 4_799,
                "pair_min_cp": 50.0,
                "value_cp_clamp": 3_000,
                "value_target": "clamped_child_cp",
                "ranking_target": ("unclamped_parent_cp_equals_negative_child_cp"),
            },
            "models": models,
            "execution": {
                "evaluation_count_per_model": 1,
                "requested_max_workers": 2,
                "actual_workers": 1,
                "network_requests": 0,
            },
        }

    def read_bytes(self, path: str) -> bytes:
        key = self._key(path)
        self.read_counts[key] = self.read_counts.get(key, 0) + 1
        if key == self.tracked_drift_path and self.read_counts[key] > 1:
            return b"tracked-drift\n"
        if key in self.files:
            return self.files[key]
        return Path(key).read_bytes()

    def fingerprint(self, path: str) -> dict:
        key = self._key(path)
        self.fingerprint_counts[key] = self.fingerprint_counts.get(key, 0) + 1
        value = copy.deepcopy(self.fingerprints[key])
        if key == self.drift_path and self.fingerprint_counts[key] > 1:
            value["sha256"] = digest("drifted")
        return value

    def verify_tracked(self, path: str, _raw: bytes) -> None:
        self.tracked.append(self._key(path))

    def claim_preflight(self, callback):
        self.claims += 1
        if self.claim_used:
            raise ValueError("synthetic preflight receipt already consumed")
        self.claim_used = True
        return callback(copy.deepcopy(self.preflight))

    def evaluate(self, **kwargs):
        self.evaluations.append(copy.deepcopy(kwargs))
        return copy.deepcopy(self.report)

    def publish(self, path: str, raw: bytes, schema: str) -> dict:
        self.publications.append((self._key(path), raw))
        self._put(path, raw)
        self._set_fingerprint(path, raw=raw)
        relative_by_schema = {
            adapter.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_SCHEMA: (
                evaluator.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_PATH
            ),
            evaluator.STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA: (
                evaluator.STRENGTH_FIRST_SELECTION_RECEIPT_PATH
            ),
            evaluator.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_SCHEMA: (
                evaluator.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_PATH
            ),
        }
        return {
            "path": relative_by_schema[schema],
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "schema": schema,
        }

    def dependencies(self) -> evaluator._SelectionDependencies:
        return evaluator._SelectionDependencies(
            read_bytes=self.read_bytes,
            fingerprint=self.fingerprint,
            verify_tracked=self.verify_tracked,
            claim_preflight=self.claim_preflight,
            validate_plan=lambda _plan: None,
            evaluate=self.evaluate,
            publish=self.publish,
        )

    def refresh_registry_bytes(self) -> None:
        self._put(
            REPO_ROOT
            / evaluator.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH,
            canonical(self.registry),
        )

    def run(self):
        return evaluator._run_strength_first_selection_evaluator(
            repo_root=str(self.repo_root),
            home_root=str(self.home_root),
            dependencies=self.dependencies(),
        )


class StrengthFirstSelectionEvaluatorTest(unittest.TestCase):
    def test_checked_in_registry_is_closed_and_valid(self):
        registry = json.loads(
            (
                REPO_ROOT
                / evaluator.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
            ).read_text(encoding="utf-8")
        )
        validated = evaluator.validate_strength_first_selection_evaluator_registry_data(
            registry
        )
        self.assertEqual(
            validated["status"],
            evaluator.STRENGTH_FIRST_SELECTION_EVALUATOR_BLOCKED_STATUS,
        )
        self.assertFalse(validated["gates"]["local_selection_evaluation_authorized"])

    def test_closed_path_stops_before_preflight_or_private_reads(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = ReadyHarness(temporary)
            closed = json.loads(
                (
                    REPO_ROOT
                    / evaluator.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
                ).read_text(encoding="utf-8")
            )
            harness._put(
                REPO_ROOT
                / evaluator.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH,
                canonical(closed),
            )
            with self.assertRaisesRegex(
                evaluator.StrengthFirstSelectionBlocked,
                "data-only closed",
            ):
                harness.run()
            self.assertEqual(harness.claims, 0)
            self.assertEqual(harness.evaluations, [])
            self.assertEqual(harness.publications, [])
            private_prefix = str(harness.home_root)
            self.assertFalse(
                any(
                    path.startswith(private_prefix)
                    for path in harness.files
                    if path in harness.tracked
                )
            )

    def test_ready_path_evaluates_all_models_and_publishes_private_receipt(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = ReadyHarness(temporary)
            result = harness.run()
            receipt = result["receipt"]
            self.assertEqual(receipt["representative_seed"], 43)
            self.assertEqual(receipt["selected"]["seed"], 43)
            self.assertTrue(receipt["family_gate"]["passed"])
            self.assertEqual(len(receipt["runs"]), 3)
            self.assertEqual(len(harness.evaluations), 1)
            self.assertEqual(len(harness.evaluations[0]["checkpoint_specs"]), 4)
            self.assertEqual(len(harness.publications), 3)
            self.assertTrue(
                harness.publications[0][0].endswith(
                    evaluator.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_PATH
                )
            )
            self.assertTrue(
                harness.publications[1][0].endswith(
                    evaluator.STRENGTH_FIRST_SELECTION_RECEIPT_PATH
                )
            )
            self.assertTrue(
                harness.publications[2][0].endswith(
                    evaluator.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_PATH
                )
            )
            for _path, raw in harness.publications:
                serialized = raw.decode("utf-8")
                self.assertNotIn(str(harness.home_root), serialized)
                self.assertNotIn("sfen", serialized.lower())
                self.assertNotIn("teacher_score", serialized.lower())
            self.assertFalse(receipt["boundary"]["final_holdout_read"])
            self.assertFalse(receipt["boundary"]["production_promotion_authorized"])
            self.assertFalse(receipt["boundary"]["live_weight_write_authorized"])

    def test_real_teacher_preflight_hash_is_accepted_by_ready_evaluator(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = ReadyHarness(temporary)
            self.assertEqual(
                harness.registry["enrollments"]["checkpoint_preflight_sha256"],
                harness.teacher_preflight_summary["checkpoint_preflight_sha256"],
            )
            result = harness.run()
            self.assertEqual(result["receipt"]["selected"]["seed"], 43)

    def test_missing_extra_duplicate_or_reordered_candidate_fails(self):
        mutations = {
            "missing": lambda runs: runs.pop(),
            "extra": lambda runs: runs.append(copy.deepcopy(runs[-1])),
            "duplicate": lambda runs: runs.__setitem__(
                1,
                copy.deepcopy(runs[0]),
            ),
            "reordered": lambda runs: runs.reverse(),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                harness = ReadyHarness(temporary)
                mutate(harness.preflight["runs"])
                with self.assertRaises(ValueError):
                    harness.run()
                self.assertEqual(harness.evaluations, [])
                self.assertEqual(harness.publications, [])

    def test_plan_hash_and_checkpoint_preflight_drift_fail(self):
        for label in ("plan", "preflight"):
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                harness = ReadyHarness(temporary)
                if label == "plan":
                    harness.preflight["training_plan"]["sha256"] = digest("wrong-plan")
                else:
                    harness.preflight["runs"][0]["checkpoint"]["sha256"] = digest(
                        "wrong-checkpoint"
                    )
                with self.assertRaisesRegex(ValueError, "drift"):
                    harness.run()
                self.assertEqual(harness.evaluations, [])
                self.assertEqual(harness.publications, [])

    def test_teacher_fingerprint_incomplete_or_timeout_completion_fails(self):
        for label in ("fingerprint", "completion", "timeout"):
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                harness = ReadyHarness(temporary)
                if label == "fingerprint":
                    harness.registry["enrollments"][
                        "selection_teacher_run_fingerprint"
                    ] = digest("wrong-run")
                    harness.refresh_registry_bytes()
                elif label == "completion":
                    harness.completion["completed_parents"] = 4_799
                    harness._rebuild_teacher_documents()
                    harness.refresh_registry_bytes()
                else:
                    harness.completion["forced_skip_reasons"][
                        "search_timeout_no_label"
                    ] = 1
                    harness._rebuild_teacher_documents()
                    harness.refresh_registry_bytes()
                with self.assertRaises(ValueError):
                    harness.run()
                self.assertEqual(harness.evaluations, [])
                self.assertEqual(harness.publications, [])

    def test_partial_report_nonfinite_metric_and_gate_failure_never_publish(self):
        mutations = {
            "partial": lambda report: report["models"].pop(),
            "nonfinite": lambda report: report["models"][1]["float"].__setitem__(
                "value_mae_cp",
                math.nan,
            ),
            "gate": lambda report: [
                report["models"][index]["quantized_int16"].__setitem__(
                    "within_parent_pair_accuracy",
                    0.50,
                )
                for index in (1, 2)
            ],
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                harness = ReadyHarness(temporary)
                mutate(harness.report)
                if label == "gate":
                    for index in (1, 2):
                        model = harness.report["models"][index]
                        model["float"]["within_parent_pair_accuracy"] = 0.501
                        model["quantized_int16"]["delta_from_float"][
                            "within_parent_pair_accuracy"
                        ] = -0.001
                with self.assertRaises(
                    (
                        ValueError,
                        evaluator.StrengthFirstSelectionGateFailed,
                    )
                ):
                    harness.run()
                self.assertEqual(harness.publications, [])

    def test_stale_dataset_fingerprint_after_evaluation_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = ReadyHarness(temporary)
            harness.drift_path = harness._key(
                harness.home_root / evaluator.STRENGTH_FIRST_SELECTION_DATASET_PATH
            )
            with self.assertRaisesRegex(ValueError, "changed during"):
                harness.run()
            self.assertEqual(len(harness.evaluations), 1)
            self.assertEqual(harness.publications, [])

    def test_tracked_plan_change_during_evaluation_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = ReadyHarness(temporary)
            harness.tracked_drift_path = harness._key(
                REPO_ROOT / evaluator._FIXED_PATHS["training_plan"]
            )
            with self.assertRaisesRegex(ValueError, "tracked selection input changed"):
                harness.run()
            self.assertEqual(len(harness.evaluations), 1)
            self.assertEqual(harness.publications, [])

    def test_replayed_preflight_claim_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = ReadyHarness(temporary)
            harness.run()
            with self.assertRaisesRegex(ValueError, "already consumed"):
                harness.run()
            self.assertEqual(len(harness.publications), 3)

    def test_machine_evidence_matches_files_and_keeps_real_counts_zero(self):
        evidence_path = (
            REPO_ROOT / "ml/protocols/"
            "floodgate-q1-2026-strength-first-selection-evaluator-"
            "foundation-evidence.json"
        )
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
        self.assertEqual(
            evidence["schema"],
            evaluator.STRENGTH_FIRST_SELECTION_EVALUATOR_EVIDENCE_SCHEMA,
        )
        for artifact in evidence["implementation"].values():
            raw = (REPO_ROOT / artifact["path"]).read_bytes()
            self.assertEqual(artifact["bytes"], len(raw))
            self.assertEqual(
                artifact["sha256"],
                hashlib.sha256(raw).hexdigest(),
            )
        self.assertEqual(evidence["resources"]["implemented_actual_workers"], 1)
        self.assertEqual(evidence["resources"]["registry_max_workers"], 2)
        real = evidence["real_execution"]
        for field in (
            "selection_teacher_artifacts_read",
            "selection_labels_read",
            "candidate_checkpoints_evaluated",
            "selection_receipts_emitted",
            "final_holdout_label_reads",
            "formal_ab_games",
            "external_calibration_games",
        ):
            self.assertEqual(real[field], 0)
        self.assertFalse(real["live_weights_changed"])
        self.assertFalse(real["strength_improved"])
        self.assertFalse(real["high_dan_calibrated"])

    def test_exclusive_publisher_is_complete_private_and_non_overwriting(self):
        with tempfile.TemporaryDirectory() as temporary:
            canonical_temporary = os.path.realpath(temporary)
            os.chmod(canonical_temporary, 0o700)
            target = (
                Path(canonical_temporary)
                / evaluator.STRENGTH_FIRST_SELECTION_RECEIPT_PATH
            )
            target.parent.mkdir(parents=True, mode=0o700)
            os.chmod(target.parent, 0o700)
            raw = canonical(
                {
                    "schema": (
                        evaluator.STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA
                    ),
                    "status": "synthetic",
                }
            )
            receipt = evaluator._publish_receipt_exclusive(str(target), raw)
            self.assertEqual(receipt["bytes"], len(raw))
            self.assertEqual(target.read_bytes(), raw)
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)
            with self.assertRaisesRegex(ValueError, "overwrite"):
                evaluator._publish_receipt_exclusive(str(target), raw)


class StrengthFirstSelectionEvalAdapterTest(unittest.TestCase):
    def test_adapter_reuses_real_metric_interface_once_per_model(self):
        calls = {"load": [], "float": 0, "quantized": 0, "metrics": 0}
        specs = []
        fingerprints = {}
        for index, name in enumerate(adapter.STRENGTH_FIRST_SELECTION_MODEL_ORDER):
            path = f"/synthetic/checkpoint-{index}.pt"
            raw = f"checkpoint-{index}".encode()
            value = {
                "name": name,
                "path": path,
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "epoch": 27 if index == 0 else 20,
            }
            specs.append(value)
            fingerprints[path] = value

        def load_validation_data(_path, _clamp):
            return (
                "board",
                "hands",
                "bucket",
                "clamped",
                "raw",
                [{"row": 1}, {"row": 2}],
                [[0, 1]],
                {"bytes": 7, "sha256": digest("dataset")},
            )

        def load_model(path):
            calls["load"].append(path)
            found = fingerprints[path]
            return (
                path,
                {"epoch": found["epoch"]},
                600.0,
                {"bytes": found["bytes"], "sha256": found["sha256"]},
            )

        def float_predictions(model, *_args):
            calls["float"] += 1
            return ("float", model)

        def quantized_predictions(model, *_args):
            calls["quantized"] += 1
            return ("int16", model)

        def calculate_metrics(prediction, *_args):
            calls["metrics"] += 1
            pair = 0.60 if prediction[0] == "float" else 0.599
            return {
                "value_mae_cp": 10.0,
                "value_mse_cp2": 100.0,
                "within_parent_pair_accuracy": pair,
                "teacher_top1_accuracy": 0.30,
            }

        fake = SimpleNamespace(
            load_validation_data=load_validation_data,
            _eligible_pair_count=lambda *_args: 1,
            load_model=load_model,
            float_predictions=float_predictions,
            quantized_predictions=quantized_predictions,
            calculate_metrics=calculate_metrics,
        )
        report = adapter.evaluate_strength_first_selection(
            data_path="/synthetic/selection.jsonl",
            dataset_identity={"bytes": 7, "sha256": digest("dataset")},
            checkpoint_specs=specs,
            expected_records=2,
            expected_parents=1,
            max_workers=2,
            eval_module=fake,
        )
        self.assertEqual(
            report["status"],
            adapter.STRENGTH_FIRST_SELECTION_EVALUATION_STATUS,
        )
        self.assertEqual(calls["load"], [spec["path"] for spec in specs])
        self.assertEqual(calls["float"], 4)
        self.assertEqual(calls["quantized"], 4)
        self.assertEqual(calls["metrics"], 8)
        self.assertEqual(report["execution"]["actual_workers"], 1)

    def test_adapter_rejects_more_than_two_workers(self):
        with self.assertRaisesRegex(ValueError, "max_workers"):
            adapter.evaluate_strength_first_selection(
                data_path="/synthetic/selection.jsonl",
                dataset_identity={"bytes": 7, "sha256": digest("dataset")},
                checkpoint_specs=[],
                expected_records=2,
                expected_parents=1,
                max_workers=3,
                eval_module=SimpleNamespace(),
            )

    def test_adapter_rejects_all_zero_dataset_sha256(self):
        with self.assertRaisesRegex(ValueError, "lowercase SHA-256"):
            adapter.evaluate_strength_first_selection(
                data_path="/synthetic/selection.jsonl",
                dataset_identity={"bytes": 7, "sha256": "0" * 64},
                checkpoint_specs=[],
                expected_records=2,
                expected_parents=1,
                max_workers=1,
                eval_module=SimpleNamespace(),
            )


if __name__ == "__main__":
    unittest.main()
