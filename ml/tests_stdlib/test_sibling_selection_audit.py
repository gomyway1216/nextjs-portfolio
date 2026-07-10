import copy
import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import sibling_selection_audit as selection_audit  # noqa: E402
from sibling_selection_audit import (  # noqa: E402
    _portable_file_receipt,
    _verify_training_result_contract,
)
from sibling_selection_protocol import (  # noqa: E402
    RESULT_ARTIFACT_NAMES,
    SELECTION_TIE_BREAK,
    SIX_RUN_PLAN_SCHEMA,
    SIX_RUN_SLOT_ORDER,
    WCSC36_SIX_RUN_EXECUTION_REVISION,
    WCSC36_SIX_RUN_TRAINING_RUNTIME,
)


def digest(number):
    return f"{number:064x}"


def valid_plan_and_result():
    inputs = {
        "sibling_teacher_manifest": digest(1),
        "validation_partition_manifest": digest(2),
        "model_training": digest(3),
        "model_selection": digest(4),
        "replay": digest(5),
        "policy_exposure_receipt": digest(6),
        "policy_exposed_parent_ids": digest(7),
        "policy_exposed_semantic_position_ids": digest(8),
        "holdout_protected_position_ids": digest(9),
        "warm_initializer": digest(10),
    }
    runtime = {
        field: WCSC36_SIX_RUN_TRAINING_RUNTIME[field]
        for field in WCSC36_SIX_RUN_TRAINING_RUNTIME
        if field not in {"mps_built", "mps_available", "cuda_available"}
    }
    plan = {
        "schema": SIX_RUN_PLAN_SCHEMA,
        "common": {"input_sha256": inputs, "runtime": runtime},
        "slots": [],
        "selection_tie_break": list(SELECTION_TIE_BREAK),
    }
    slot = {
        "id": "warm-seed-42",
        "series": "warm",
        "seed": 42,
        "learning_rate": 0.0001,
        "epochs": 20,
        "initializer_required": True,
        "output": "ml/runs/wcsc36-six-run/warm-seed-42",
    }
    plan_path = "/tmp/wcsc36-six-run-plan.json"
    plan_receipt = {
        "path": "ml/protocols/wcsc36-six-run-plan.json",
        "bytes": 3057,
        "sha256": digest(11),
        "schema": SIX_RUN_PLAN_SCHEMA,
    }
    contract = {
        "schema": "shogi-sibling-training-experiment-v1",
        "series": "warm",
        "seed": 42,
        "loss": "sibling-ranking",
        "init_checkpoint_sha256": inputs["warm_initializer"],
        "replay_sha256": inputs["replay"],
        "learning_rate": 0.0001,
        "epochs": 20,
        "batch": 256,
        "k": 600.0,
        "cp_clamp": 3000,
        "rank_weight": 1.0,
        "rank_pair_min": 50.0,
        "rank_pair_max": 600.0,
        "rank_margin_cp": 50.0,
        "policy_weight": 0.25,
        "policy_temp_cp": 200.0,
        "select_metric": "sibling-pair",
        "features": "board",
        "device": "cpu",
        "torch_threads": 2,
        "replay_limit": 500000,
        "replay_ratio": 1.0,
        "primary_limit": 0,
        "allow_legacy_init": True,
    }
    result = {
        "schema": "shogi-sibling-training-result-v1",
        "status": "complete",
        "experiment_plan": {
            "path": plan_path,
            "bytes": plan_receipt["bytes"],
            "sha256": plan_receipt["sha256"],
            "schema": SIX_RUN_PLAN_SCHEMA,
            "slot_id": slot["id"],
            "slot_output": slot["output"],
            "selection_tie_break": list(SELECTION_TIE_BREAK),
        },
        "experiment_contract": contract,
        "training_pipeline": {
            "source_revision": WCSC36_SIX_RUN_EXECUTION_REVISION,
            "tracked_tree_clean": True,
        },
        "training_runtime": dict(WCSC36_SIX_RUN_TRAINING_RUNTIME),
        "completed_epochs": 20,
        "selection_metric": "sibling-pair",
        "best_value_loss": 0.03,
        "best_sibling_key": [0.61, 0.27, -0.03],
        "artifacts": {
            name: {"bytes": 100 + index, "sha256": digest(20 + index)}
            for index, name in enumerate(RESULT_ARTIFACT_NAMES)
        },
    }
    return plan, slot, plan_path, plan_receipt, result


class SiblingSelectionAuditContractTest(unittest.TestCase):
    def test_json_reader_rejects_nonfinite_constants(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "nonfinite.json"
            path.write_text('{"value": Infinity}', encoding="utf-8")
            with self.assertRaisesRegex(
                ValueError, "contains non-finite JSON number Infinity"
            ):
                selection_audit._read_json(str(path), "fixture")

    def test_public_receipts_keep_repo_paths_and_redact_external_paths(self):
        repo = "/workspace/project"
        internal = _portable_file_receipt(
            {
                "path": "/workspace/project/ml/model.pt",
                "bytes": 12,
                "sha256": digest(1),
            },
            repo,
        )
        self.assertEqual(internal["path"], "ml/model.pt")
        self.assertNotIn("scope", internal)

        external = _portable_file_receipt(
            {
                "path": "/Users/private/other/model.pt",
                "bytes": 12,
                "sha256": digest(1),
            },
            repo,
        )
        self.assertEqual(external["scope"], "external_input")
        self.assertNotIn("path", external)

    def verify(self, result):
        plan, slot, plan_path, plan_receipt, _unused = valid_plan_and_result()
        return _verify_training_result_contract(
            result,
            slot=slot,
            slot_id=slot["id"],
            series="warm",
            seed=42,
            plan=plan,
            plan_receipt=plan_receipt,
            run_plan_path=plan_path,
        )

    def test_accepts_exact_training_result_contract(self):
        _plan, _slot, _path, _receipt, result = valid_plan_and_result()
        pipeline, runtime = self.verify(result)
        self.assertEqual(
            pipeline["source_revision"], WCSC36_SIX_RUN_EXECUTION_REVISION
        )
        self.assertEqual(runtime["torch_threads"], 2)

    def test_rejects_schedule_runtime_and_revision_mutations(self):
        _plan, _slot, _path, _receipt, result = valid_plan_and_result()
        cases = (
            ("completed epoch", lambda value: value.__setitem__("completed_epochs", 19)),
            (
                "learning rate",
                lambda value: value["experiment_contract"].__setitem__(
                    "learning_rate", 0.001
                ),
            ),
            (
                "runtime",
                lambda value: value["training_runtime"].__setitem__(
                    "torch_threads", 4
                ),
            ),
            (
                "revision",
                lambda value: value["training_pipeline"].__setitem__(
                    "source_revision", "a" * 40
                ),
            ),
        )
        for label, mutate in cases:
            with self.subTest(label=label):
                changed = copy.deepcopy(result)
                mutate(changed)
                with self.assertRaises(ValueError):
                    self.verify(changed)

    def test_rejects_artifact_schema_and_digest_mutations(self):
        _plan, _slot, _path, _receipt, result = valid_plan_and_result()
        extra = copy.deepcopy(result)
        extra["artifacts"]["unexpected.pt"] = {
            "bytes": 1,
            "sha256": digest(99),
        }
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            self.verify(extra)

        malformed = copy.deepcopy(result)
        malformed["artifacts"]["best.pt"]["sha256"] = "not-a-digest"
        with self.assertRaisesRegex(ValueError, "lowercase SHA-256"):
            self.verify(malformed)


class SiblingSelectionAuditIntegrationTest(unittest.TestCase):
    """Exercise the complete audit orchestration without opening holdout data."""

    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.repo = Path(self.temporary_directory.name)
        self.run_root = self.repo / "ml" / "runs" / "wcsc36-six-run"
        self.plan_path = self.repo / "ml" / "protocols" / "six-run-plan.json"
        self.stable_checkpoint = self.repo / "ml" / "stable" / "runOp1.pt"
        self.stable_report = self.repo / "ml" / "stable" / "selection.json"
        self.inputs = {
            "sibling_teacher_manifest": digest(101),
            "validation_partition_manifest": digest(102),
            "model_training": digest(103),
            "model_selection": digest(104),
            "replay": digest(105),
            "policy_exposure_receipt": digest(106),
            "policy_exposed_parent_ids": digest(107),
            "policy_exposed_semantic_position_ids": digest(108),
            "holdout_protected_position_ids": digest(109),
        }
        self._write_bytes(self.stable_checkpoint, b"sealed stable checkpoint")
        self.inputs["warm_initializer"] = self._sha256(self.stable_checkpoint)
        self.runtime = {
            field: value
            for field, value in WCSC36_SIX_RUN_TRAINING_RUNTIME.items()
            if field not in {"mps_built", "mps_available", "cuda_available"}
        }
        self.plan = {
            "schema": SIX_RUN_PLAN_SCHEMA,
            "common": {"input_sha256": self.inputs, "runtime": self.runtime},
            "slots": [self._slot(series, seed) for series, seed in SIX_RUN_SLOT_ORDER],
            "selection_tie_break": list(SELECTION_TIE_BREAK),
        }
        self._write_json(self.plan_path, self.plan)
        self.plan_sha256 = self._sha256(self.plan_path)
        self.plan_bytes = self.plan_path.stat().st_size

        # The ranking deliberately makes seed 42 the median representative of
        # each series and warm-seed-42 the provisional candidate.
        metrics = {
            ("warm", 42): (0.623, 0.262, 480.0, 0.620, 0.260, 481.0),
            ("warm", 43): (0.632, 0.281, 475.0, 0.630, 0.280, 476.0),
            ("warm", 44): (0.611, 0.251, 490.0, 0.610, 0.250, 491.0),
            ("scratch", 42): (0.601, 0.241, 570.0, 0.600, 0.240, 571.0),
            ("scratch", 43): (0.612, 0.251, 560.0, 0.610, 0.250, 561.0),
            ("scratch", 44): (0.591, 0.231, 580.0, 0.590, 0.230, 581.0),
        }
        for series, seed in SIX_RUN_SLOT_ORDER:
            self._write_run(series, seed, metrics[(series, seed)])
        self._write_stable_report()

        evidence_dir = self.repo / "fixture-evidence"
        evidence_names = {
            "python_interpreter": "python",
            "selection_data": "selection.jsonl",
            "sibling_manifest": "sibling-manifest.json",
            "validation_partition_manifest": "partition.json",
            "policy_exposure_receipt": "exposure.json",
            "policy_exposed_parent_ids": "exposed-parents.txt",
            "policy_exposed_semantic_position_ids": "exposed-positions.txt",
            "holdout_protected_position_ids": "protected-ids.txt",
            "stable_weights": "stable-weights.bin",
            "stable_weights_meta": "stable-weights.meta.json",
        }
        self.evidence_config = {}
        for field, name in evidence_names.items():
            path = evidence_dir / name
            self._write_bytes(path, f"fixture {field}".encode())
            self.evidence_config[field] = str(path)

    @staticmethod
    def _sha256(path):
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()

    @staticmethod
    def _write_bytes(path, value):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(value)

    @staticmethod
    def _write_json(path, value):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_text(
            json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )

    @staticmethod
    def _slot(series, seed):
        slot_id = f"{series}-seed-{seed}"
        return {
            "id": slot_id,
            "series": series,
            "seed": seed,
            "learning_rate": 0.0001 if series == "warm" else 0.001,
            "epochs": 20 if series == "warm" else 40,
            "initializer_required": series == "warm",
            "output": f"ml/runs/wcsc36-six-run/{slot_id}",
        }

    def _artifact_receipt(self, path):
        return {"bytes": path.stat().st_size, "sha256": self._sha256(path)}

    def _selection_data(self):
        return {
            "path": "sealed/model-selection.jsonl",
            "sha256": self.inputs["model_selection"],
            "bytes": 123456,
            "sibling_manifest_sha256": self.inputs["sibling_teacher_manifest"],
            "sibling_manifest_bytes": 4567,
            "pipeline_source_revision": WCSC36_SIX_RUN_EXECUTION_REVISION,
            "teacher_runtime_snapshot": {},
            "sibling_manifest": {},
            "data_role": "selection",
            "validation_partition_manifest": {
                "sha256": self.inputs["validation_partition_manifest"],
                "verified_outputs": ["model_selection", "protected_position_ids"],
                "outputs": {
                    "model_training": {"sha256": self.inputs["model_training"]},
                    "model_selection": {"sha256": self.inputs["model_selection"]},
                    "protected_position_ids": {
                        "sha256": self.inputs["holdout_protected_position_ids"]
                    },
                    "final_holdout": {"sha256": digest(110)},
                },
                "source": {
                    "teacher_manifest": {
                        "sha256": self.inputs["sibling_teacher_manifest"]
                    },
                    "policy_exposure_receipt": {
                        "sha256": self.inputs["policy_exposure_receipt"]
                    },
                    "policy_exposed_parent_ids": {
                        "sha256": self.inputs["policy_exposed_parent_ids"]
                    },
                    "policy_exposed_semantic_position_ids": {
                        "sha256": self.inputs[
                            "policy_exposed_semantic_position_ids"
                        ]
                    },
                },
            },
            "records": 341,
            "parents": 21,
            "eligible_pairs": 812,
            "pair_min_cp": 50.0,
            "value_target": "clamped_child_cp",
            "value_cp_clamp": 3000,
            "ranking_target": "unclamped_parent_cp_equals_negative_child_cp",
        }

    @staticmethod
    def _model_metrics(pair, top1, mae):
        return {
            "within_parent_pair_accuracy": pair,
            "teacher_top1_accuracy": top1,
            "value_mae_cp": mae,
            "value_mse_cp2": mae * mae,
        }

    def _write_report(
        self, path, name, checkpoint, floating_values, int16_values, provenance
    ):
        floating = self._model_metrics(*floating_values)
        quantized = self._model_metrics(*int16_values)
        quantized["delta_from_float"] = {
            field: quantized[field] - floating[field] for field in floating
        }
        self._write_json(
            path,
            {
                "schema": "shogi-sibling-eval-v2",
                "data": self._selection_data(),
                "models": [
                    {
                        "name": name,
                        "checkpoint": str(checkpoint),
                        "checkpoint_sha256": self._sha256(checkpoint),
                        "checkpoint_bytes": checkpoint.stat().st_size,
                        "checkpoint_epoch": 0,
                        "training_provenance": provenance,
                        "k_sigmoid": 600.0,
                        "production_k_int": 600,
                        "float": floating,
                        "quantized_int16": quantized,
                    }
                ],
            },
        )

    def _write_run(self, series, seed, metrics):
        slot = self._slot(series, seed)
        slot_id = slot["id"]
        slot_dir = self.run_root / slot_id
        artifacts = {}
        for index, name in enumerate(RESULT_ARTIFACT_NAMES):
            path = slot_dir / name
            self._write_bytes(path, f"{slot_id}:{name}:{index}".encode())
            artifacts[name] = self._artifact_receipt(path)
        result = {
            "schema": "shogi-sibling-training-result-v1",
            "status": "complete",
            "experiment_plan": {
                "path": str(self.plan_path),
                "bytes": self.plan_bytes,
                "sha256": self.plan_sha256,
                "schema": SIX_RUN_PLAN_SCHEMA,
                "slot_id": slot_id,
                "slot_output": slot["output"],
                "selection_tie_break": list(SELECTION_TIE_BREAK),
            },
            "experiment_contract": {
                "schema": "shogi-sibling-training-experiment-v1",
                "series": series,
                "seed": seed,
                "loss": "sibling-ranking",
                "init_checkpoint_sha256": (
                    self.inputs["warm_initializer"] if series == "warm" else None
                ),
                "replay_sha256": self.inputs["replay"],
                "learning_rate": slot["learning_rate"],
                "epochs": slot["epochs"],
                "batch": 256,
                "k": 600.0,
                "cp_clamp": 3000,
                "rank_weight": 1.0,
                "rank_pair_min": 50.0,
                "rank_pair_max": 600.0,
                "rank_margin_cp": 50.0,
                "policy_weight": 0.25,
                "policy_temp_cp": 200.0,
                "select_metric": "sibling-pair",
                "features": "board",
                "device": "cpu",
                "torch_threads": 2,
                "replay_limit": 500000,
                "replay_ratio": 1.0,
                "primary_limit": 0,
                "allow_legacy_init": series == "warm",
            },
            "training_pipeline": {
                "source_revision": WCSC36_SIX_RUN_EXECUTION_REVISION,
                "tracked_tree_clean": True,
            },
            "training_runtime": dict(WCSC36_SIX_RUN_TRAINING_RUNTIME),
            "completed_epochs": slot["epochs"],
            "selection_metric": "sibling-pair",
            "best_value_loss": 0.03,
            "best_sibling_key": [metrics[0], metrics[1], -0.03],
            "artifacts": artifacts,
        }
        self._write_json(slot_dir / "result.json", result)
        self._write_bytes(
            slot_dir / "int16" / "weights.bin", f"weights:{slot_id}".encode()
        )
        self._write_json(slot_dir / "int16" / "weights.meta.json", {"kp_buckets": 2})
        provenance = {
            "status": "verified_same_model_selection_partition",
            "teacher_manifest_sha256": self.inputs["sibling_teacher_manifest"],
            "validation_partition_sha256": self.inputs[
                "validation_partition_manifest"
            ],
            "training_pipeline_source_revision": WCSC36_SIX_RUN_EXECUTION_REVISION,
            "source_train_sha256": digest(120 + seed),
            "model_training_sha256": self.inputs["model_training"],
            "model_selection_sha256": self.inputs["model_selection"],
            "final_holdout_sha256": digest(110),
        }
        self._write_report(
            slot_dir / "int16-selection.json",
            slot_id,
            slot_dir / "best-sibling.pt",
            metrics[:3],
            metrics[3:],
            provenance,
        )

    def _write_stable_report(self):
        self._write_report(
            self.stable_report,
            "stable",
            self.stable_checkpoint,
            (0.607, 0.271, 500.0),
            (0.605, 0.270, 499.0),
            {"status": "legacy_unverified", "reason": "test fixture"},
        )

    def _fake_reproduction(self, *, drift_slot=None):
        def receipt(path, number):
            return {"path": str(path), "bytes": number, "sha256": digest(number)}

        def reproduce(**arguments):
            slot_id = arguments["slot_id"]
            shared_source_sha = digest(201 if slot_id != drift_slot else 202)
            checkpoint = Path(arguments["checkpoint_path"])
            return {
                "schema": "shogi-sibling-evidence-reproduction-v1",
                "status": "reproduced_exactly",
                "interpreter": {
                    "file": receipt(self.repo / "fixture-evidence/python", 301),
                    "runtime": {
                        "platform": self.runtime["platform"],
                        "machine": self.runtime["machine"],
                        "python_version": self.runtime["python_version"],
                        "torch_version": self.runtime["torch_version"],
                        "python_executable": "/redacted/python",
                    },
                },
                "tools": {
                    "exporter": receipt(self.repo / "ml/export.py", 302),
                    "evaluator": receipt(self.repo / "ml/eval.py", 303),
                },
                "sources": {
                    "checkpoint": {
                        "path": str(checkpoint),
                        "bytes": checkpoint.stat().st_size,
                        "sha256": self._sha256(checkpoint),
                    },
                    "selection_data": {
                        "path": str(self.repo / "fixture-evidence/selection.jsonl"),
                        "bytes": 304,
                        "sha256": shared_source_sha,
                    },
                },
                "execution": {"isolated_python": True, "shell": False},
                "evidence": {
                    "export": {
                        "existing_weights": receipt(
                            self.repo / f"evidence/{slot_id}/weights.bin", 305
                        ),
                        "existing_weights_meta": receipt(
                            self.repo / f"evidence/{slot_id}/weights.meta.json", 306
                        ),
                        "reproduced_weights": receipt("reproduced/weights.bin", 305),
                        "reproduced_weights_meta": receipt(
                            "reproduced/weights.meta.json", 306
                        ),
                    },
                    "selection_report": {
                        "existing": receipt(
                            self.repo / f"evidence/{slot_id}/selection.json", 307
                        ),
                        "reproduced": receipt("reproduced/selection.json", 307),
                    },
                },
            }

        return reproduce

    def _build(self, reproduce):
        with (
            patch.object(
                selection_audit,
                "WCSC36_SIX_RUN_PLAN_SHA256",
                self.plan_sha256,
            ),
            patch.object(
                selection_audit,
                "_reproduce_one_evidence",
                side_effect=reproduce,
            ) as reproduction_mock,
        ):
            audit = selection_audit.build_selection_audit(
                run_root=str(self.run_root),
                run_plan_path=str(self.plan_path),
                stable_checkpoint_path=str(self.stable_checkpoint),
                stable_selection_report_path=str(self.stable_report),
                repo_root=str(self.repo),
                evidence_config=self.evidence_config,
            )
        return audit, reproduction_mock

    def test_builds_failed_six_run_audit_from_reproduced_selection_evidence(self):
        audit, reproduction = self._build(self._fake_reproduction())

        expected_slots = [f"{series}-seed-{seed}" for series, seed in SIX_RUN_SLOT_ORDER]
        self.assertEqual([run["slot_id"] for run in audit["runs"]], expected_slots)
        self.assertEqual(reproduction.call_count, 7)
        self.assertEqual(
            [call.kwargs["slot_id"] for call in reproduction.call_args_list],
            expected_slots + ["stable"],
        )
        self.assertEqual(
            audit["training_pipeline"],
            {
                "source_revision": WCSC36_SIX_RUN_EXECUTION_REVISION,
                "tracked_tree_clean": True,
            },
        )
        self.assertEqual(audit["training_runtime"], WCSC36_SIX_RUN_TRAINING_RUNTIME)
        self.assertEqual(
            [(run["series"], run["slot_id"]) for run in audit["representatives"]],
            [("warm", "warm-seed-42"), ("scratch", "scratch-seed-42")],
        )
        self.assertEqual(audit["provisional_candidate"]["slot_id"], "warm-seed-42")
        self.assertEqual(
            audit["stable"]["checkpoint_sha256"], self.inputs["warm_initializer"]
        )
        self.assertEqual(
            audit["candidate_metrics"]["int16"]["within_parent_pair_accuracy"],
            0.620,
        )
        checks = {check["id"]: check["passed"] for check in audit["selection_gates"]["checks"]}
        self.assertEqual(
            checks,
            {
                "candidate_pair_strictly_above_stable": True,
                "candidate_top1_at_least_stable": False,
                "absolute_float_to_int16_pair_delta": False,
                "absolute_float_to_int16_top1_delta": True,
            },
        )
        self.assertFalse(audit["selection_gates"]["passed"])
        self.assertEqual(
            audit["candidate_selection_receipt"],
            {"status": "not_emitted_selection_gate_failed"},
        )
        self.assertEqual(
            audit["final_holdout"],
            {
                "status": "sealed_not_opened",
                "post_seal_training_selection_or_evaluation_labels_read": False,
                "partition_publication_parsed_labeled_source_validation": True,
            },
        )
        self.assertEqual(
            audit["evidence_reproduction"]["status"],
            "all_six_candidates_and_stable_reproduced_exactly",
        )
        self.assertEqual(
            [model["slot_id"] for model in audit["evidence_reproduction"]["models"]],
            expected_slots + ["stable"],
        )

    def test_rejects_one_evidence_reproduction_with_different_shared_source(self):
        with self.assertRaisesRegex(
            ValueError, "six evidence reproductions used different sources/runtime"
        ):
            self._build(self._fake_reproduction(drift_slot="warm-seed-43"))


if __name__ == "__main__":
    unittest.main()
