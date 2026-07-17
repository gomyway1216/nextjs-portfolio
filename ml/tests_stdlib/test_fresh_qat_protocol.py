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
    identifiers = path.read_text(encoding="ascii").splitlines()
    return {
        **identity,
        "count": len(identifiers),
        "identifiers_sha256": hashlib.sha256(
            "\n".join(sorted(set(identifiers))).encode("ascii")
        ).hexdigest(),
    }


def canonical_position_id(character):
    return f"sha256:{character * 64}"


def canonical_id_bytes(identifiers):
    return ("\n".join(sorted(identifiers)) + "\n").encode("ascii")


def replay_identity(path):
    return {
        "format": FRESH.FRESH_QAT_ID_SET_FORMAT,
        **identifier_identity(path),
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
        root,
        "synthetic/policy-position-ids.txt",
        canonical_id_bytes({canonical_position_id("d")}),
    )
    holdout_ids = write_bytes(
        root,
        "synthetic/holdout-position-ids.txt",
        canonical_id_bytes({canonical_position_id("e")}),
    )
    fresh_selection_ids = write_bytes(
        root,
        f"synthetic/{FRESH.FRESH_QAT_SELECTION_PROTECTED_FILENAME}",
        canonical_id_bytes({canonical_position_id("f")}),
    )
    legacy_ids = write_bytes(
        root,
        FRESH.FRESH_QAT_LEGACY_REPLAY_COMPONENT_RELATIVE_PATH,
        canonical_id_bytes({canonical_position_id("a")}),
    )
    legacy_identifiers = set(legacy_ids.read_text(encoding="ascii").splitlines())
    final_identifiers = set(holdout_ids.read_text(encoding="ascii").splitlines())
    selection_identifiers = set(
        fresh_selection_ids.read_text(encoding="ascii").splitlines()
    )
    replay_exclusion = write_bytes(
        root,
        "synthetic/replay-exclusion.txt",
        canonical_id_bytes(
            legacy_identifiers | final_identifiers | selection_identifiers
        ),
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
        **replay_identity(replay_exclusion),
        "components": {
            "legacy": replay_identity(legacy_ids),
            "fresh_final_holdout": replay_identity(holdout_ids),
            "fresh_selection": replay_identity(fresh_selection_ids),
        },
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
            "fresh_selection_protected_position_ids": identifier_identity(
                fresh_selection_ids
            ),
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
        "legacy_ids": legacy_ids,
        "legacy_identity": replay_identity(legacy_ids),
        "holdout_ids": holdout_ids,
        "fresh_selection_ids": fresh_selection_ids,
        "replay_exclusion": replay_exclusion,
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


def replace_replay_union(fixture, identifiers):
    fixture["replay_exclusion"].write_bytes(canonical_id_bytes(set(identifiers)))
    identity = replay_identity(fixture["replay_exclusion"])

    def mutate(plan):
        exclusion = plan["inputs"]["replay_exclusion"]
        for field in ("format", "bytes", "sha256", "count", "identifiers_sha256"):
            exclusion[field] = identity[field]

    rewrite_plan(fixture, mutate)


def replace_replay_component(fixture, name, path, raw):
    path.write_bytes(raw)
    component = replay_identity(path)
    input_field = {
        "fresh_final_holdout": "holdout_protected_position_ids",
        "fresh_selection": "fresh_selection_protected_position_ids",
    }[name]

    def mutate(plan):
        plan["inputs"][input_field] = {
            field: component[field]
            for field in ("bytes", "sha256", "count", "identifiers_sha256")
        }
        plan["inputs"]["replay_exclusion"]["components"][name] = component

    rewrite_plan(fixture, mutate)


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
        with patched_artifact_snapshot(), mock.patch.object(
            FRESH,
            "FRESH_QAT_LEGACY_REPLAY_COMPONENT_IDENTITY",
            fixture["legacy_identity"],
        ):
            binding = FRESH._verify_fresh_qat_experiment_plan(
                fixture["args"],
                fixture["runtime"],
                tracking_verifier=tracker,
                repo_root=str(fixture["root"]),
            )
        return binding, tracker

    def test_synthetic_binding_accepts_exact_untracked_legacy_component(self):
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
            self.assertEqual(
                binding["contract"]["objective"],
                fixture["plan"]["training"]["objective"],
            )
            self.assertEqual(binding["contract"]["selection_evaluations"], 0)
            self.assertFalse(binding["contract"]["early_stopping"])
            self.assertEqual(
                binding["contract"]["schema"],
                FRESH.FRESH_QAT_TRAINING_CONTRACT_SCHEMA,
            )
            self.assertEqual(
                binding["provenance"]["schema"],
                FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA,
            )
            self.assertNotEqual(
                fixture["plan"]["inputs"]["replay_exclusion"]["sha256"],
                fixture["plan"]["inputs"]["replay_exclusion"]["identifiers_sha256"],
            )
            self.assertEqual(
                binding["provenance"]["verified_input_sha256"][
                    "replay_exclusion_component_legacy"
                ],
                fixture["legacy_identity"]["sha256"],
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
            self.assertNotIn(
                str(fixture["legacy_ids"].resolve()),
                [call.args[0] for call in tracker.call_args_list],
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
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            rewrite_plan(
                fixture,
                lambda plan: plan["training"].__setitem__("replay_ratio", True),
            )
            with self.assertRaisesRegex(ValueError, "warm-only final"):
                self.verify_fixture(fixture)
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            rewrite_plan(
                fixture,
                lambda plan: plan["selection"].__setitem__(
                    "evaluations_per_checkpoint", True
                ),
            )
            with self.assertRaisesRegex(ValueError, "post-training selection"):
                self.verify_fixture(fixture)

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

    def test_replay_exclusion_requires_exact_three_component_union(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            union = set(
                fixture["replay_exclusion"].read_text(encoding="ascii").splitlines()
            )
            selection = set(
                fixture["fresh_selection_ids"].read_text(encoding="ascii").splitlines()
            )
            replace_replay_union(fixture, union - selection)
            with self.assertRaisesRegex(
                ValueError,
                "not the exact union.*missing_count=1, extra_count=0",
            ) as raised:
                self.verify_fixture(fixture)
            self.assertNotIn(next(iter(selection)), str(raised.exception))

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            union = set(
                fixture["replay_exclusion"].read_text(encoding="ascii").splitlines()
            )
            replace_replay_union(
                fixture,
                union | {canonical_position_id("9")},
            )
            extra_id = canonical_position_id("9")
            with self.assertRaisesRegex(
                ValueError,
                "not the exact union.*missing_count=0, extra_count=1",
            ) as raised:
                self.verify_fixture(fixture)
            self.assertNotIn(extra_id, str(raised.exception))

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            union = set(
                fixture["replay_exclusion"].read_text(encoding="ascii").splitlines()
            )
            selection = set(
                fixture["fresh_selection_ids"].read_text(encoding="ascii").splitlines()
            )
            replace_replay_union(
                fixture,
                (union - selection) | {canonical_position_id("9")},
            )
            with self.assertRaisesRegex(
                ValueError,
                "not the exact union.*missing_count=1, extra_count=1",
            ) as raised:
                self.verify_fixture(fixture)
            self.assertNotIn(next(iter(selection)), str(raised.exception))
            self.assertNotIn(canonical_position_id("9"), str(raised.exception))

    def test_replay_components_reject_duplicates_overlap_and_noncanonical_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            selection_id = canonical_position_id("f")
            replace_replay_component(
                fixture,
                "fresh_selection",
                fixture["fresh_selection_ids"],
                f"{selection_id}\n{selection_id}\n".encode("ascii"),
            )
            with self.assertRaisesRegex(ValueError, "bytewise sorted and unique"):
                self.verify_fixture(fixture)

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            replace_replay_component(
                fixture,
                "fresh_selection",
                fixture["fresh_selection_ids"],
                fixture["holdout_ids"].read_bytes(),
            )
            protected_id = fixture["holdout_ids"].read_text(encoding="ascii").strip()
            with self.assertRaisesRegex(
                ValueError,
                "duplicate membership.*count=1",
            ) as raised:
                self.verify_fixture(fixture)
            self.assertNotIn(protected_id, str(raised.exception))

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory))
            replace_replay_component(
                fixture,
                "fresh_selection",
                fixture["fresh_selection_ids"],
                canonical_id_bytes({"sha256:" + "A" * 64}),
            )
            with self.assertRaisesRegex(ValueError, "non-canonical position ID"):
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
        args = SimpleNamespace(
            experiment_plan=str(
                REPO_ROOT / FRESH.FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH
            ),
            pipeline_revision="a" * 40,
        )
        with mock.patch.object(
            FRESH,
            "_load_canonical_position_id_set",
        ) as component_reader, mock.patch.object(
            FRESH,
            "_sha256_file_snapshot",
        ) as artifact_reader:
            with self.assertRaisesRegex(ValueError, "data-only blocked"):
                FRESH.verify_fresh_qat_experiment_plan(
                    args,
                    {},
                    tracking_verifier=lambda *_: None,
                )
        component_reader.assert_not_called()
        artifact_reader.assert_not_called()


if __name__ == "__main__":
    unittest.main()
