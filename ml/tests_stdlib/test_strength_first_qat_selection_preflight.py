import copy
import hashlib
import inspect
import json
import math
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import fresh_qat_protocol as FRESH  # noqa: E402
import fresh_qat_selection_preflight as COMMON  # noqa: E402
import strength_first_qat_selection_preflight as PREFLIGHT  # noqa: E402
import strength_first_qat_training_bridge as BRIDGE  # noqa: E402
from ml.tests_stdlib.test_strength_first_qat_training_bridge import (  # noqa: E402
    complete_plan,
)


def json_bytes(value):
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")


def write_bytes(root, relative, raw):
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return path


def identity_bytes(raw):
    return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def training_history():
    return [
        {
            "epoch": epoch,
            "combined_task_loss": (0.5 * ((1.0 / epoch) + (1.2 / epoch))),
            "float_task_loss": 1.0 / epoch,
            "ste_task_loss": 1.2 / epoch,
            "learning_rate": (
                0.0001 * (1.0 + math.cos(math.pi * (epoch - 1) / 20.0)) / 2.0
            ),
        }
        for epoch in range(1, 21)
    ]


def checkpoint_args(root, plan_path, registered_run, revision):
    seed = registered_run["seed"]
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
        "replay_limit": FRESH.FRESH_QAT_REPLAY_ROWS,
        "replay_ratio": 1.0,
        "limit": 0,
        "select_metric": "auto",
        "allow_legacy_init": True,
        "pipeline_revision": revision,
        "val_data": "",
        "data": "/synthetic/train.jsonl",
        "sibling_manifest": "/synthetic/teacher-manifest.json",
        "validation_partition_manifest": "/synthetic/role-manifest.json",
        "holdout_protected_position_ids": "/synthetic/holdout.txt",
        "policy_exposure_receipt": "/synthetic/policy.json",
        "policy_exposed_parent_ids": "/synthetic/parents.txt",
        "policy_exposed_semantic_position_ids": "/synthetic/positions.txt",
        "replay_data": "/synthetic/replay.jsonl",
        "replay_excluded_position_ids": "/synthetic/exclusion.txt",
        "init_ckpt": "/synthetic/initializer.pt",
        "experiment_plan": str(plan_path),
        "out": str(root / registered_run["output"]),
    }


def checkpoint_data(plan, contract, seed):
    exclusion = plan["artifacts"]["replay_exclusion"]
    replay = plan["artifacts"]["replay"]
    return {
        "train": {
            "path": "/synthetic/train.jsonl",
            "real_path": "/synthetic/train.jsonl",
            "sha256": contract["model_training_sha256"],
            "bytes": contract["model_training_bytes"],
            "usable_rows": contract["model_training_records"],
            "selection": "all",
            "requested_limit": 0,
            "role": "model_training",
        },
        "replay": {
            "path": "/synthetic/replay.jsonl",
            "real_path": "/synthetic/replay.jsonl",
            "sha256": contract["replay_sha256"],
            "bytes": replay["bytes"],
            "usable_rows": contract["replay_limit"],
            "selection": ("uniform_without_replacement_after_semantic_exclusion"),
            "requested_limit": contract["replay_limit"],
            "sample_seed": seed + 2,
            "replay_ratio": 1.0,
            "excluded_semantic_position_ids": exclusion["count"],
            "excluded_semantic_position_ids_sha256": (exclusion["identifiers_sha256"]),
            "eligible_rows_after_semantic_exclusion": contract["replay_limit"],
            "excluded_rows_before_sampling": 0,
        },
        "replay_exclusion": {
            "path": "/synthetic/exclusion.txt",
            **{
                field: exclusion[field]
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
    }


def synthetic_fixture(root):
    plan = complete_plan()
    plan_raw = json_bytes(plan)
    plan_path = write_bytes(
        root,
        BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH,
        plan_raw,
    )
    plan_identity = {
        "path": BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH,
        "schema": BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
        **identity_bytes(plan_raw),
    }
    revision = "a" * 40
    registry = {
        "schema": PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_SCHEMA,
        "status": PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_READY_STATUS,
        "training_plan": dict(plan_identity),
        "training_pipeline_revision": revision,
        "runs": copy.deepcopy(PREFLIGHT._expected_registry_runs()),
        "artifact_identities_registered": True,
        "selection_preflight_ready": True,
    }
    history = training_history()
    checkpoint_payloads = {}
    results = {}
    for registered_run in registry["runs"]:
        seed = registered_run["seed"]
        checkpoint_raw = f"strength-first checkpoint {seed}\n".encode("ascii")
        write_bytes(
            root,
            registered_run["checkpoint"]["path"],
            checkpoint_raw,
        )
        registered_run["checkpoint"].update(identity_bytes(checkpoint_raw))
        contract = PREFLIGHT._expected_training_contract(
            plan,
            registered_run,
        )
        plan_binding = PREFLIGHT._expected_plan_binding(
            plan,
            plan_path=str(plan_path),
            plan_identity=plan_identity,
            registered_run=registered_run,
        )
        runtime = {
            **plan["runtime"],
            "mps_built": True,
            "mps_available": False,
            "cuda_available": False,
        }
        pipeline = {
            "source_revision": revision,
            "tracked_tree_clean": True,
        }
        result = {
            "schema": BRIDGE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA,
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
                **identity_bytes(checkpoint_raw),
            },
            "training_history": copy.deepcopy(history),
        }
        result_path = write_bytes(
            root,
            registered_run["result"]["path"],
            json_bytes(result),
        )
        registered_run["result"].update(identity_bytes(result_path.read_bytes()))
        results[seed] = result
        checkpoint_payloads[checkpoint_raw] = {
            "schema": BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
            "model": {"synthetic_seed": seed},
            "epoch": 20,
            "args": checkpoint_args(
                root,
                plan_path,
                registered_run,
                revision,
            ),
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
                "path": "/synthetic/initializer.pt",
                "sha256": FRESH.FRESH_QAT_WARM_INITIALIZER_SHA256,
                "bytes": FRESH.FRESH_QAT_WARM_INITIALIZER_BYTES,
                "epoch": 27,
                "legacy_arch_inferred_fields": ["schema"],
            },
            "data_provenance": checkpoint_data(plan, contract, seed),
            "training_pipeline": copy.deepcopy(pipeline),
            "training_runtime": copy.deepcopy(runtime),
            "experiment_plan": copy.deepcopy(plan_binding),
            "experiment_contract": copy.deepcopy(contract),
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
            "training_history": copy.deepcopy(history),
        }

    registry_path = write_bytes(
        root,
        PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_RELATIVE_PATH,
        json_bytes(registry),
    )
    return {
        "root": root,
        "plan": plan,
        "plan_path": plan_path,
        "registry": registry,
        "registry_path": registry_path,
        "checkpoint_payloads": checkpoint_payloads,
        "results": results,
    }


def write_registry(fixture):
    fixture["registry_path"].write_bytes(json_bytes(fixture["registry"]))


class StrengthFirstQatSelectionPreflightTests(unittest.TestCase):
    def preflight(self, fixture):
        events = []

        def load_checkpoint(raw):
            payload = fixture["checkpoint_payloads"][raw]
            events.append(f"load-{payload['args']['seed']}")
            return copy.deepcopy(payload)

        def validate_model(model, seed):
            events.append(f"model-{seed}")
            self.assertEqual(model, {"synthetic_seed": seed})

        validated = PREFLIGHT._preflight_strength_first_qat_selection(
            repo_root=str(fixture["root"]),
            tracking_verifier=lambda path, _raw: events.append(
                f"tracked-{Path(path).name}"
            ),
            checkpoint_loader=load_checkpoint,
            strict_model_validator=validate_model,
        )
        return validated, events

    def test_checked_in_registry_stops_before_plan_artifact_or_torch(self):
        loader = mock.Mock()
        model_validator = mock.Mock()
        snapshot = mock.Mock(
            side_effect=AssertionError("closed registry touched an artifact")
        )
        tracked = []
        with mock.patch.object(
            COMMON,
            "_sha256_file_snapshot",
            snapshot,
        ), self.assertRaisesRegex(ValueError, "data-only blocked"):
            PREFLIGHT._preflight_strength_first_qat_selection(
                repo_root=str(REPO_ROOT),
                tracking_verifier=lambda path, _raw: tracked.append(path),
                checkpoint_loader=loader,
                strict_model_validator=model_validator,
            )
        self.assertEqual(
            tracked,
            [
                str(
                    REPO_ROOT
                    / PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_RELATIVE_PATH
                )
            ],
        )
        snapshot.assert_not_called()
        loader.assert_not_called()
        model_validator.assert_not_called()

    def test_strength_first_schema_path_loads_all_three_before_reader_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            validated, events = self.preflight(fixture)

        self.assertEqual(
            validated["schema"],
            PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_PREFLIGHT_SCHEMA,
        )
        self.assertEqual(
            [run["seed"] for run in validated["runs"]],
            [42, 43, 44],
        )
        self.assertEqual(
            [event for event in events if event.startswith("load-")],
            ["load-42", "load-43", "load-44"],
        )
        self.assertEqual(
            [event for event in events if event.startswith("model-")],
            ["model-42", "model-43", "model-44"],
        )
        self.assertFalse(validated["selection_labels_read"])
        self.assertEqual(
            validated["reader_gate"],
            "one-shot-public-api-accidental-misuse-guard",
        )
        self.assertFalse(validated["same_process_python_authorization_enforced"])
        self.assertEqual(
            validated["final_holdout"],
            "not_opened_by_this_preflight",
        )
        self.assertFalse(validated["production_promotion_authorized"])

    def test_fresh_schema_or_wrong_path_stops_before_checkpoint_load(self):
        cases = (
            (
                "fresh result schema",
                lambda fixture: fixture["registry"]["runs"][0]["result"].__setitem__(
                    "schema",
                    FRESH.FRESH_QAT_TRAINING_RESULT_SCHEMA,
                ),
            ),
            (
                "wrong output path",
                lambda fixture: fixture["registry"]["runs"][1].__setitem__(
                    "output",
                    "ml/runs/wrong/seed-43",
                ),
            ),
            (
                "wrong plan schema",
                lambda fixture: fixture["registry"]["training_plan"].__setitem__(
                    "schema",
                    FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA,
                ),
            ),
        )
        for label, mutate in cases:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                fixture = synthetic_fixture(Path(directory).resolve())
                mutate(fixture)
                write_registry(fixture)
                loader = mock.Mock()
                with self.assertRaisesRegex(ValueError, "mismatch"):
                    PREFLIGHT._preflight_strength_first_qat_selection(
                        repo_root=str(fixture["root"]),
                        tracking_verifier=lambda *_: None,
                        checkpoint_loader=loader,
                        strict_model_validator=mock.Mock(),
                    )
                loader.assert_not_called()

    def test_result_plan_binding_drift_stops_before_any_checkpoint_load(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            registered = fixture["registry"]["runs"][0]
            result_path = fixture["root"] / registered["result"]["path"]
            result = copy.deepcopy(fixture["results"][42])
            result["experiment_plan"]["teacher_work_sha256"] = "0" * 64
            result_path.write_bytes(json_bytes(result))
            registered["result"].update(identity_bytes(result_path.read_bytes()))
            write_registry(fixture)
            loader = mock.Mock()
            with self.assertRaisesRegex(ValueError, "plan binding mismatch"):
                PREFLIGHT._preflight_strength_first_qat_selection(
                    repo_root=str(fixture["root"]),
                    tracking_verifier=lambda *_: None,
                    checkpoint_loader=loader,
                    strict_model_validator=mock.Mock(),
                )
            loader.assert_not_called()

    def test_missing_late_checkpoint_stops_before_first_checkpoint_load(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            late = fixture["registry"]["runs"][-1]["checkpoint"]["path"]
            (fixture["root"] / late).unlink()
            loader = mock.Mock()
            with self.assertRaisesRegex(ValueError, "cannot stat"):
                PREFLIGHT._preflight_strength_first_qat_selection(
                    repo_root=str(fixture["root"]),
                    tracking_verifier=lambda *_: None,
                    checkpoint_loader=loader,
                    strict_model_validator=mock.Mock(),
                )
            loader.assert_not_called()

    def test_public_api_is_fixed_but_private_brand_is_not_security_boundary(self):
        signature = inspect.signature(PREFLIGHT.preflight_strength_first_qat_selection)
        self.assertEqual(set(signature.parameters), {"audit_revision"})
        self.assertEqual(
            signature.parameters["audit_revision"].kind,
            inspect.Parameter.KEYWORD_ONLY,
        )
        value = {
            "schema": PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_PREFLIGHT_SCHEMA,
            "validated": True,
        }
        # Python module privacy is conventional, not enforced. Importing the
        # private brand can mint this one-shot guard, so the receipt is not an
        # authorization or cryptographic authenticity boundary.
        receipt = PREFLIGHT.StrengthFirstQatSelectionPreflightReceipt(
            PREFLIGHT._RECEIPT_BRAND,
            value,
        )
        self.assertFalse(hasattr(receipt, "__dict__"))
        reader = mock.Mock(return_value={"selected": 42})
        self.assertEqual(
            PREFLIGHT.call_strength_first_selection_reader(receipt, reader),
            {"selected": 42},
        )
        reader.assert_called_once_with(value)
        with self.assertRaisesRegex(ValueError, "unused preflight receipt"):
            PREFLIGHT.call_strength_first_selection_reader(receipt, reader)
        with self.assertRaisesRegex(ValueError, "invalid or already used"):
            receipt.to_dict()
        with self.assertRaises(TypeError):
            PREFLIGHT.StrengthFirstQatSelectionPreflightReceipt(
                object(),
                value,
            )


if __name__ == "__main__":
    unittest.main()
