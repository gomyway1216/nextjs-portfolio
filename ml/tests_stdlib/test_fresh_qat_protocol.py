import copy
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import fresh_qat_protocol as FRESH  # noqa: E402


PREREGISTERED_PLAN_PATH = REPO_ROOT / FRESH.FRESH_QAT_PREREGISTERED_PLAN_RELATIVE_PATH


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


def file_identity(path):
    raw = path.read_bytes()
    return {
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def identifier_identity(path):
    identity = file_identity(path)
    return {
        **identity,
        "count": len(path.read_text(encoding="utf-8").splitlines()),
        "identifiers_sha256": identity["sha256"],
    }


def synthetic_fixture(root):
    preregistered_path = write_bytes(
        root,
        FRESH.FRESH_QAT_PREREGISTERED_PLAN_RELATIVE_PATH,
        PREREGISTERED_PLAN_PATH.read_bytes(),
    )
    teacher = write_bytes(root, "synthetic/teacher.json", b'{"synthetic":true}\n')
    partition = write_bytes(root, "synthetic/partition.json", b'{"synthetic":true}\n')
    training = write_bytes(
        root,
        "synthetic/training.jsonl",
        b'{"schema":"synthetic-training-row"}\n',
    )
    policy_receipt = write_bytes(root, "synthetic/policy.json", b'{"synthetic":true}\n')
    parent_ids = write_bytes(root, "synthetic/parent-ids.txt", b"parent-1\n")
    policy_ids = write_bytes(
        root, "synthetic/policy-position-ids.txt", b"a" * 64 + b"\n"
    )
    holdout_ids = write_bytes(
        root, "synthetic/holdout-position-ids.txt", b"b" * 64 + b"\n"
    )
    replay_exclusion = write_bytes(
        root,
        "synthetic/replay-exclusion.txt",
        b"c" * 64 + b"\n",
    )
    replay = write_bytes(root, "synthetic/replay.jsonl", b"synthetic replay\n")
    initializer = write_bytes(
        root, "synthetic/initializer.pt", b"synthetic initializer\n"
    )

    model_training = {
        **file_identity(training),
        "records": 24_000,
        "parents": 24_000,
        "games": 1_000,
        "semantic_position_ids_count": 24_000,
        "semantic_position_ids_sha256": hashlib.sha256(
            b"synthetic semantic positions"
        ).hexdigest(),
    }
    replay_exclusion_identity = {
        "format": FRESH.FRESH_QAT_ID_SET_FORMAT,
        **identifier_identity(replay_exclusion),
        "components": [
            "legacy",
            "fresh_final_holdout",
            "fresh_selection",
        ],
    }
    plan = {
        "schema": FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA,
        "preregistered_plan": {
            "path": FRESH.FRESH_QAT_PREREGISTERED_PLAN_RELATIVE_PATH,
            "bytes": FRESH.FRESH_QAT_PREREGISTERED_PLAN_BYTES,
            "sha256": FRESH.FRESH_QAT_PREREGISTERED_PLAN_SHA256,
            "schema": FRESH.FRESH_QAT_PREREGISTERED_PLAN_SCHEMA,
        },
        "inputs": {
            "sibling_teacher_manifest": file_identity(teacher),
            "validation_partition_manifest": file_identity(partition),
            "model_training": model_training,
            "replay": {
                "bytes": FRESH.FRESH_QAT_REPLAY_BYTES,
                "sha256": FRESH.FRESH_QAT_REPLAY_SHA256,
            },
            "warm_initializer": {
                "bytes": FRESH.FRESH_QAT_WARM_INITIALIZER_BYTES,
                "sha256": FRESH.FRESH_QAT_WARM_INITIALIZER_SHA256,
            },
            "policy_exposure_receipt": file_identity(policy_receipt),
            "policy_exposed_parent_ids": identifier_identity(parent_ids),
            "policy_exposed_semantic_position_ids": identifier_identity(policy_ids),
            "holdout_protected_position_ids": identifier_identity(holdout_ids),
            "replay_exclusion": replay_exclusion_identity,
        },
        "runtime": {
            "platform": "synthetic-macos-arm64",
            "system": "Darwin",
            "machine": "arm64",
            "processor": "arm",
            "cpu_model": "Synthetic M4 Pro",
            "logical_cpu_count": 14,
            "device": "cpu",
            "python_version": "3.13.0",
            "torch_version": "2.12.1",
            "torch_threads": 2,
            "torch_interop_threads": 1,
            "deterministic_algorithms": True,
            "deterministic_debug_mode": "error",
        },
        "training": copy.deepcopy(FRESH.FRESH_QAT_REQUIRED_TRAINING),
        "slots": [
            {
                "id": f"floodgate-fresh-int16-aware-seed-{seed}",
                "seed": seed,
                "output": f"{FRESH.FRESH_QAT_RUN_ROOT}/seed-{seed}",
            }
            for seed in FRESH.FRESH_QAT_SLOT_ORDER
        ],
        "selection": copy.deepcopy(FRESH.FRESH_QAT_REQUIRED_SELECTION),
    }
    plan_path = write_bytes(
        root,
        FRESH.FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH,
        json_bytes(plan),
    )
    registry = {
        "schema": FRESH.FRESH_QAT_REGISTRY_SCHEMA,
        "status": FRESH.FRESH_QAT_READY_STATUS,
        "plan": {
            "schema": FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA,
            "path": FRESH.FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH,
            **file_identity(plan_path),
        },
        "artifact_identities_registered": True,
        "training_dispatch_ready": True,
    }
    registry_path = write_bytes(
        root,
        FRESH.FRESH_QAT_REGISTRY_RELATIVE_PATH,
        json_bytes(registry),
    )
    args = SimpleNamespace(
        experiment_plan=str(plan_path),
        pipeline_revision="a" * 40,
        val_data="",
        experiment_family="int16-aware",
        seed=42,
        out=str(root / f"{FRESH.FRESH_QAT_RUN_ROOT}/seed-42"),
        sibling_manifest=str(teacher),
        validation_partition_manifest=str(partition),
        data=str(training),
        replay_data=str(replay),
        init_ckpt=str(initializer),
        policy_exposure_receipt=str(policy_receipt),
        policy_exposed_parent_ids=str(parent_ids),
        policy_exposed_semantic_position_ids=str(policy_ids),
        holdout_protected_position_ids=str(holdout_ids),
        replay_excluded_position_ids=str(replay_exclusion),
    )
    runtime = {
        **plan["runtime"],
        "mps_built": True,
        "mps_available": True,
        "cuda_available": False,
    }
    return {
        "root": root,
        "plan": plan,
        "plan_path": plan_path,
        "registry": registry,
        "registry_path": registry_path,
        "preregistered_path": preregistered_path,
        "args": args,
        "runtime": runtime,
    }


def rewrite_plan(fixture, mutate):
    plan = copy.deepcopy(fixture["plan"])
    mutate(plan)
    raw = json_bytes(plan)
    fixture["plan_path"].write_bytes(raw)
    fixture["plan"] = plan
    registry = copy.deepcopy(fixture["registry"])
    registry["plan"]["bytes"] = len(raw)
    registry["plan"]["sha256"] = hashlib.sha256(raw).hexdigest()
    fixture["registry_path"].write_bytes(json_bytes(registry))
    fixture["registry"] = registry


def patched_artifact_snapshot():
    original = FRESH._sha256_file_snapshot

    def snapshot(path, expected, label):
        if label in {"replay", "warm_initializer"}:
            return {
                "path": str(path),
                "real_path": str(path),
                "bytes": expected["bytes"],
                "sha256": expected["sha256"],
            }
        return original(path, expected, label)

    return mock.patch.object(FRESH, "_sha256_file_snapshot", side_effect=snapshot)


class FreshQatProtocolTests(unittest.TestCase):
    def verify_fixture(self, fixture):
        tracker = mock.Mock()
        with patched_artifact_snapshot():
            binding = FRESH._verify_fresh_qat_experiment_plan(
                fixture["args"],
                fixture["runtime"],
                tracking_verifier=tracker,
                repo_root=str(fixture["root"]),
            )
        return binding, tracker

    def test_synthetic_binding_is_warm_only_and_label_blind(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            binding, tracker = self.verify_fixture(fixture)

            self.assertEqual(binding["contract"]["seed"], 42)
            self.assertEqual(
                binding["contract"]["slot_id"],
                "floodgate-fresh-int16-aware-seed-42",
            )
            self.assertEqual(
                binding["contract"]["init_checkpoint_sha256"],
                FRESH.FRESH_QAT_WARM_INITIALIZER_SHA256,
            )
            self.assertEqual(binding["contract"]["selection_evaluations"], 0)
            self.assertFalse(binding["contract"]["early_stopping"])
            self.assertEqual(
                binding["provenance"]["schema"],
                FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA,
            )
            self.assertEqual(
                tracker.call_args_list,
                [
                    mock.call(
                        str(fixture["registry_path"].resolve()),
                        fixture["args"].pipeline_revision,
                    ),
                    mock.call(
                        str(fixture["plan_path"].resolve()),
                        fixture["args"].pipeline_revision,
                    ),
                    mock.call(
                        str(fixture["preregistered_path"].resolve()),
                        fixture["args"].pipeline_revision,
                    ),
                ],
            )

    def test_plan_and_registry_require_exact_keys_and_strict_json(self):
        plan = {
            "schema": FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA,
            "unexpected": True,
        }
        with self.assertRaisesRegex(ValueError, "must contain exactly"):
            FRESH._validate_plan_shape(plan)
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            FRESH._strict_json(
                b'{"schema":"one","schema":"two"}',
                "synthetic duplicate plan",
            )
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            FRESH._strict_json(
                b'{"status":"one","status":"two"}',
                "synthetic duplicate registry",
            )

    def test_registry_requires_exact_schema_path_and_consistent_state(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            registry = copy.deepcopy(fixture["registry"])
            registry["plan"]["path"] = "ml/protocols/wrong.json"
            with self.assertRaisesRegex(ValueError, "schema/path mismatch"):
                FRESH._validate_registry(registry)

            registry = copy.deepcopy(fixture["registry"])
            registry["schema"] = "shogi-unknown-registry-v1"
            with self.assertRaisesRegex(ValueError, "schema mismatch"):
                FRESH._validate_registry(registry)

            registry = {
                "schema": FRESH.FRESH_QAT_REGISTRY_SCHEMA,
                "status": FRESH.FRESH_QAT_BLOCKED_STATUS,
                "plan": {
                    "schema": FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA,
                    "path": FRESH.FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH,
                    "bytes": 1,
                    "sha256": "0" * 64,
                },
                "artifact_identities_registered": False,
                "training_dispatch_ready": False,
            }
            with self.assertRaisesRegex(ValueError, "invented identities"):
                FRESH._validate_registry(registry)

    def test_plan_path_bytes_sha_and_tamper_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            fixture["args"].experiment_plan = str(
                fixture["root"] / "synthetic/wrong-plan.json"
            )
            with self.assertRaisesRegex(ValueError, "must be the tracked"):
                self.verify_fixture(fixture)

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            fixture["registry"]["plan"]["bytes"] += 1
            fixture["registry_path"].write_bytes(json_bytes(fixture["registry"]))
            with self.assertRaisesRegex(ValueError, "byte mismatch"):
                self.verify_fixture(fixture)

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            fixture["registry"]["plan"]["sha256"] = "0" * 64
            fixture["registry_path"].write_bytes(json_bytes(fixture["registry"]))
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                self.verify_fixture(fixture)

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            fixture["plan_path"].write_bytes(fixture["plan_path"].read_bytes() + b" ")
            with self.assertRaisesRegex(ValueError, "byte mismatch"):
                self.verify_fixture(fixture)

    def test_only_three_fixed_slots_and_outputs_are_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            fixture["args"].seed = 45
            with self.assertRaisesRegex(ValueError, "not preregistered"):
                self.verify_fixture(fixture)

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            fixture["args"].out = str(fixture["root"] / "wrong-output")
            with self.assertRaisesRegex(ValueError, "must use output"):
                self.verify_fixture(fixture)

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            rewrite_plan(
                fixture,
                lambda plan: plan["slots"][0].__setitem__(
                    "output", "ml/runs/unregistered"
                ),
            )
            with self.assertRaisesRegex(ValueError, "slot registry mismatch"):
                self.verify_fixture(fixture)

    def test_scratch_initializer_and_label_access_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            rewrite_plan(
                fixture,
                lambda plan: plan["training"]["initializer"].__setitem__(
                    "kind", "scratch"
                ),
            )
            with self.assertRaisesRegex(ValueError, "warm-only final"):
                self.verify_fixture(fixture)

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            rewrite_plan(
                fixture,
                lambda plan: plan["inputs"]["warm_initializer"].__setitem__(
                    "sha256", "0" * 64
                ),
            )
            with self.assertRaisesRegex(ValueError, "warm-only initializer"):
                self.verify_fixture(fixture)

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            fixture["args"].val_data = "selection-labels.jsonl"
            with self.assertRaisesRegex(ValueError, "may not receive model-selection"):
                self.verify_fixture(fixture)

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            rewrite_plan(
                fixture,
                lambda plan: plan["training"].__setitem__(
                    "final_holdout_labels_received", True
                ),
            )
            with self.assertRaisesRegex(ValueError, "warm-only final"):
                self.verify_fixture(fixture)

    def test_checked_in_registry_has_no_placeholder_identities(self):
        registry_path = REPO_ROOT / FRESH.FRESH_QAT_REGISTRY_RELATIVE_PATH
        registry = FRESH._strict_json(
            registry_path.read_bytes(), "checked-in fresh QAT registry"
        )
        self.assertFalse(FRESH._validate_registry(registry))
        self.assertEqual(registry["status"], FRESH.FRESH_QAT_BLOCKED_STATUS)
        self.assertIsNone(registry["plan"]["bytes"])
        self.assertIsNone(registry["plan"]["sha256"])
        self.assertFalse(registry["artifact_identities_registered"])
        self.assertFalse(registry["training_dispatch_ready"])


if __name__ == "__main__":
    unittest.main()
