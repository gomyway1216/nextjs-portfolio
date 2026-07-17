import copy
import hashlib
import inspect
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import fresh_qat_protocol as FRESH  # noqa: E402
import fresh_qat_selection_preflight as PREFLIGHT  # noqa: E402


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


def identity_file(path):
    return identity_bytes(path.read_bytes())


def digest(label):
    return hashlib.sha256(label.encode("utf-8")).hexdigest()


def file_identity(label, size=100):
    return {"bytes": size, "sha256": digest(label)}


def identifier_identity(label, count=10):
    return {
        **file_identity(label),
        "count": count,
        "identifiers_sha256": digest(f"{label}-identifiers"),
    }


def training_history():
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


def synthetic_plan():
    holdout = identifier_identity("holdout-protected")
    fresh_selection = identifier_identity("fresh-selection-protected")
    replay_exclusion = {
        "format": FRESH.FRESH_QAT_ID_SET_FORMAT,
        **identifier_identity(
            "replay-exclusion",
            count=(
                FRESH.FRESH_QAT_LEGACY_REPLAY_COMPONENT_IDENTITY["count"]
                + holdout["count"]
                + fresh_selection["count"]
            ),
        ),
        "components": {
            "legacy": copy.deepcopy(FRESH.FRESH_QAT_LEGACY_REPLAY_COMPONENT_IDENTITY),
            "fresh_final_holdout": {
                "format": FRESH.FRESH_QAT_ID_SET_FORMAT,
                **holdout,
            },
            "fresh_selection": {
                "format": FRESH.FRESH_QAT_ID_SET_FORMAT,
                **fresh_selection,
            },
        },
    }
    return {
        "schema": FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA,
        "preregistered_plan": {
            "path": FRESH.FRESH_QAT_PREREGISTERED_PLAN_RELATIVE_PATH,
            "bytes": FRESH.FRESH_QAT_PREREGISTERED_PLAN_BYTES,
            "sha256": FRESH.FRESH_QAT_PREREGISTERED_PLAN_SHA256,
            "schema": FRESH.FRESH_QAT_PREREGISTERED_PLAN_SCHEMA,
        },
        "inputs": {
            "sibling_teacher_manifest": file_identity("teacher"),
            "validation_partition_manifest": file_identity("partition"),
            "model_training": {
                **file_identity("training", size=1_000),
                "records": 30_000,
                "parents": 24_000,
                "games": 1_000,
                "semantic_position_ids_count": 30_000,
                "semantic_position_ids_sha256": digest("training-semantic"),
            },
            "replay": {
                "bytes": FRESH.FRESH_QAT_REPLAY_BYTES,
                "sha256": FRESH.FRESH_QAT_REPLAY_SHA256,
            },
            "warm_initializer": {
                "bytes": FRESH.FRESH_QAT_WARM_INITIALIZER_BYTES,
                "sha256": FRESH.FRESH_QAT_WARM_INITIALIZER_SHA256,
            },
            "policy_exposure_receipt": file_identity("policy-receipt"),
            "policy_exposed_parent_ids": identifier_identity("policy-parents"),
            "policy_exposed_semantic_position_ids": identifier_identity(
                "policy-semantic"
            ),
            "holdout_protected_position_ids": holdout,
            "fresh_selection_protected_position_ids": fresh_selection,
            "replay_exclusion": replay_exclusion,
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


def checkpoint_args(root, plan_path, slot, revision):
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
        "replay_limit": 500_000,
        "replay_ratio": 1.0,
        "limit": 0,
        "select_metric": "auto",
        "allow_legacy_init": True,
        "pipeline_revision": revision,
        "val_data": "",
        "data": "/synthetic/training.jsonl",
        "sibling_manifest": "/synthetic/teacher.json",
        "validation_partition_manifest": "/synthetic/partition.json",
        "holdout_protected_position_ids": "/synthetic/holdout.txt",
        "policy_exposure_receipt": "/synthetic/policy.json",
        "policy_exposed_parent_ids": "/synthetic/parents.txt",
        "policy_exposed_semantic_position_ids": "/synthetic/policy-positions.txt",
        "replay_data": "/synthetic/replay.jsonl",
        "replay_excluded_position_ids": "/synthetic/replay-exclusion.txt",
        "init_ckpt": "/synthetic/initializer.pt",
        "experiment_plan": str(plan_path),
        "out": str(root / slot["output"]),
    }


def checkpoint_data(plan, contract, seed):
    exclusion = plan["inputs"]["replay_exclusion"]
    return {
        "train": {
            "path": "/synthetic/training.jsonl",
            "real_path": "/synthetic/training.jsonl",
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
            "bytes": plan["inputs"]["replay"]["bytes"],
            "usable_rows": contract["replay_limit"],
            "selection": "uniform_without_replacement_after_semantic_exclusion",
            "requested_limit": contract["replay_limit"],
            "sample_seed": seed + 2,
            "replay_ratio": 1.0,
            "excluded_semantic_position_ids": exclusion["count"],
            "excluded_semantic_position_ids_sha256": exclusion["identifiers_sha256"],
            "eligible_rows_after_semantic_exclusion": contract["replay_limit"],
            "excluded_rows_before_sampling": 0,
        },
        "replay_exclusion": {
            "path": "/synthetic/replay-exclusion.txt",
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
    plan = synthetic_plan()
    plan_path = write_bytes(
        root,
        FRESH.FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH,
        json_bytes(plan),
    )
    plan_identity = {
        "path": FRESH.FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH,
        "schema": FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA,
        **identity_file(plan_path),
    }
    training_registry = {
        "schema": FRESH.FRESH_QAT_REGISTRY_SCHEMA,
        "status": FRESH.FRESH_QAT_READY_STATUS,
        "plan": dict(plan_identity),
        "artifact_identities_registered": True,
        "training_dispatch_ready": True,
    }
    training_registry_path = write_bytes(
        root,
        FRESH.FRESH_QAT_REGISTRY_RELATIVE_PATH,
        json_bytes(training_registry),
    )

    revision = "a" * 40
    runtime = {
        **plan["runtime"],
        "mps_built": True,
        "mps_available": True,
        "cuda_available": False,
    }
    registered_runs = []
    checkpoints = {}
    checkpoint_payloads = {}
    results = {}
    for slot in plan["slots"]:
        seed = slot["seed"]
        result_relative = f"{slot['output']}/result.json"
        checkpoint_relative = f"{slot['output']}/final.pt"
        checkpoint_raw = f"synthetic checkpoint seed {seed}\n".encode("utf-8")
        checkpoint_path = write_bytes(root, checkpoint_relative, checkpoint_raw)
        checkpoint_receipt = identity_file(checkpoint_path)
        contract = FRESH.build_fresh_qat_training_contract(plan, slot)
        plan_binding = {
            "path": str(plan_path),
            "bytes": plan_identity["bytes"],
            "sha256": plan_identity["sha256"],
            "schema": FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA,
            "slot_id": slot["id"],
            "slot_output": slot["output"],
            "verified_input_sha256": {
                "preregistered_plan": plan["preregistered_plan"]["sha256"],
                **{
                    field: identity["sha256"]
                    for field, identity in plan["inputs"].items()
                },
                **{
                    f"replay_exclusion_component_{name}": identity["sha256"]
                    for name, identity in plan["inputs"]["replay_exclusion"][
                        "components"
                    ].items()
                },
            },
        }
        pipeline = {"source_revision": revision, "tracked_tree_clean": True}
        history = training_history()
        result = {
            "schema": FRESH.FRESH_QAT_TRAINING_RESULT_SCHEMA,
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
                **checkpoint_receipt,
            },
            "training_history": history,
        }
        result_path = write_bytes(root, result_relative, json_bytes(result))
        checkpoint = {
            "schema": FRESH.FRESH_QAT_FINAL_CHECKPOINT_SCHEMA,
            "model": {"synthetic_seed": seed},
            "epoch": 20,
            "args": checkpoint_args(root, plan_path, slot, revision),
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
        checkpoints[str(checkpoint_path)] = checkpoint
        checkpoint_payloads[checkpoint_raw] = checkpoint
        results[seed] = result
        registered_runs.append(
            {
                "slot_id": slot["id"],
                "seed": seed,
                "output": slot["output"],
                "result": {
                    "path": result_relative,
                    "schema": FRESH.FRESH_QAT_TRAINING_RESULT_SCHEMA,
                    **identity_file(result_path),
                },
                "checkpoint": {
                    "path": checkpoint_relative,
                    "schema": FRESH.FRESH_QAT_FINAL_CHECKPOINT_SCHEMA,
                    **checkpoint_receipt,
                },
            }
        )
    selection_registry = {
        "schema": PREFLIGHT.FRESH_QAT_SELECTION_REGISTRY_SCHEMA,
        "status": PREFLIGHT.FRESH_QAT_SELECTION_READY_STATUS,
        "execution_plan": dict(plan_identity),
        "training_pipeline_revision": revision,
        "runs": registered_runs,
        "artifact_identities_registered": True,
        "selection_preflight_ready": True,
    }
    selection_registry_path = write_bytes(
        root,
        PREFLIGHT.FRESH_QAT_SELECTION_REGISTRY_RELATIVE_PATH,
        json_bytes(selection_registry),
    )
    return {
        "root": root,
        "plan": plan,
        "plan_path": plan_path,
        "plan_identity": plan_identity,
        "training_registry": training_registry,
        "training_registry_path": training_registry_path,
        "selection_registry": selection_registry,
        "selection_registry_path": selection_registry_path,
        "checkpoints": checkpoints,
        "checkpoint_payloads": checkpoint_payloads,
        "results": results,
    }


def write_selection_registry(fixture):
    fixture["selection_registry_path"].write_bytes(
        json_bytes(fixture["selection_registry"])
    )


def rewrite_result(fixture, seed, mutate):
    result = copy.deepcopy(fixture["results"][seed])
    mutate(result)
    fixture["results"][seed] = result
    registered = next(
        run for run in fixture["selection_registry"]["runs"] if run["seed"] == seed
    )
    result_path = fixture["root"] / registered["result"]["path"]
    result_path.write_bytes(json_bytes(result))
    registered["result"].update(identity_file(result_path))
    write_selection_registry(fixture)


def rewrite_plan(fixture, mutate):
    plan = copy.deepcopy(fixture["plan"])
    mutate(plan)
    fixture["plan"] = plan
    fixture["plan_path"].write_bytes(json_bytes(plan))
    identity = identity_file(fixture["plan_path"])
    fixture["selection_registry"]["execution_plan"].update(identity)
    fixture["training_registry"]["plan"].update(identity)
    write_selection_registry(fixture)
    fixture["training_registry_path"].write_bytes(
        json_bytes(fixture["training_registry"])
    )


def git(root, *arguments, env=None):
    return subprocess.run(
        ["/usr/bin/git", *arguments],
        cwd=root,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    ).stdout


def tracked_verifier_fixture(root):
    module_path = write_bytes(
        root,
        "ml/fresh_qat_selection_preflight.py",
        b"# verifier root anchor\n",
    )
    tracked_path = write_bytes(root, "ml/tracked-registry.json", b'{"ok":true}\n')
    git(root, "init", "-q")
    git(root, "config", "user.name", "Fresh QAT Test")
    git(root, "config", "user.email", "fresh-qat@example.invalid")
    git(root, "add", ".")
    git(root, "commit", "-q", "-m", "tracked fixture")
    revision = git(root, "rev-parse", "HEAD").strip()
    return module_path, tracked_path, revision


class FreshQatSelectionPreflightTests(unittest.TestCase):
    def preflight(self, fixture, events=None):
        if events is None:
            events = []

        def load_checkpoint(raw):
            checkpoint = fixture["checkpoint_payloads"][raw]
            events.append(f"load-{checkpoint['epoch']}-{checkpoint['args']['seed']}")
            return copy.deepcopy(checkpoint)

        def validate_model(model, seed):
            events.append(f"model-{seed}")
            self.assertEqual(model, {"synthetic_seed": seed})

        validated = PREFLIGHT._preflight_fresh_qat_selection(
            repo_root=str(fixture["root"]),
            tracking_verifier=lambda path, _raw: events.append(
                f"tracked-{Path(path).name}"
            ),
            checkpoint_loader=load_checkpoint,
            strict_model_validator=validate_model,
        )
        return validated, events

    def test_checked_in_registry_is_closed_before_artifacts_or_torch(self):
        loader = mock.Mock()
        model_validator = mock.Mock()
        snapshot = mock.Mock(
            side_effect=AssertionError("blocked registry touched an artifact")
        )
        tracked = []
        with mock.patch.object(
            PREFLIGHT,
            "_sha256_file_snapshot",
            snapshot,
        ), self.assertRaisesRegex(ValueError, "data-only blocked"):
            PREFLIGHT._preflight_fresh_qat_selection(
                repo_root=str(REPO_ROOT),
                tracking_verifier=lambda path, _raw: tracked.append(path),
                checkpoint_loader=loader,
                strict_model_validator=model_validator,
            )
        self.assertEqual(
            tracked,
            [str(REPO_ROOT / PREFLIGHT.FRESH_QAT_SELECTION_REGISTRY_RELATIVE_PATH)],
        )
        snapshot.assert_not_called()
        loader.assert_not_called()
        model_validator.assert_not_called()

    def test_public_preflight_api_cannot_replace_checkpoint_or_model_validation(self):
        signature = inspect.signature(PREFLIGHT.preflight_fresh_qat_selection)
        self.assertEqual(set(signature.parameters), {"audit_revision"})
        self.assertEqual(
            signature.parameters["audit_revision"].kind,
            inspect.Parameter.KEYWORD_ONLY,
        )
        with self.assertRaises(TypeError):
            PREFLIGHT.preflight_fresh_qat_selection(
                audit_revision="a" * 40,
                checkpoint_loader=lambda _path: {},
            )
        with self.assertRaises(TypeError):
            PREFLIGHT.preflight_fresh_qat_selection(
                audit_revision="a" * 40,
                strict_model_validator=lambda *_args: None,
            )

    def test_fixed_git_ignores_fake_path_and_inherited_repository_controls(self):
        with tempfile.TemporaryDirectory() as directory, tempfile.TemporaryDirectory() as fake_directory:
            root = Path(directory).resolve()
            module_path, tracked_path, revision = tracked_verifier_fixture(root)
            fake_bin = Path(fake_directory).resolve()
            marker = fake_bin / "fake-git-used"
            fake_git = fake_bin / "git"
            fake_git.write_text(
                f"#!/bin/sh\nprintf used > {marker}\nexit 0\n",
                encoding="utf-8",
            )
            fake_git.chmod(0o755)
            inherited = {
                "PATH": str(fake_bin),
                "GIT_DIR": str(root / "attacker.git"),
                "GIT_WORK_TREE": str(root / "attacker-worktree"),
                "GIT_CONFIG_COUNT": "1",
                "GIT_CONFIG_KEY_0": "core.fsmonitor",
                "GIT_CONFIG_VALUE_0": str(fake_git),
                "DYLD_INSERT_LIBRARIES": str(root / "attacker.dylib"),
                "LD_PRELOAD": str(root / "attacker.so"),
            }
            with mock.patch.object(
                PREFLIGHT,
                "__file__",
                str(module_path),
            ), mock.patch.dict(os.environ, inherited, clear=False):
                PREFLIGHT._verify_tracked_file(
                    str(tracked_path),
                    revision,
                    tracked_path.read_bytes(),
                )
            self.assertFalse(marker.exists())

    def test_fixed_git_rejects_assume_unchanged_and_skip_worktree(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            module_path, tracked_path, revision = tracked_verifier_fixture(root)
            cases = (
                ("--assume-unchanged", "--no-assume-unchanged"),
                ("--skip-worktree", "--no-skip-worktree"),
            )
            for set_flag, clear_flag in cases:
                with self.subTest(flag=set_flag):
                    git(root, "update-index", set_flag, "ml/tracked-registry.json")
                    with mock.patch.object(
                        PREFLIGHT,
                        "__file__",
                        str(module_path),
                    ), self.assertRaisesRegex(ValueError, "special tracked flags"):
                        PREFLIGHT._verify_tracked_file(
                            str(tracked_path),
                            revision,
                            tracked_path.read_bytes(),
                        )
                    git(root, "update-index", clear_flag, "ml/tracked-registry.json")

    def test_fixed_git_rejects_replace_graft_fsmonitor_and_restored_stat_tamper(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            module_path, tracked_path, revision = tracked_verifier_fixture(root)
            original_raw = tracked_path.read_bytes()
            original_stat = tracked_path.stat()

            tracked_path.write_bytes(b'{"ok":null}\n')
            git(root, "add", "ml/tracked-registry.json")
            git(root, "commit", "-q", "-m", "replacement tree")
            replacement = git(root, "rev-parse", "HEAD").strip()
            git(root, "--no-replace-objects", "reset", "--hard", "-q", revision)
            git(root, "replace", revision, replacement)
            graft_path = root / ".git/info/grafts"
            graft_path.write_text(f"{revision} {replacement}\n", encoding="utf-8")

            hook = root / ".git/hooks/fake-fsmonitor"
            hook.write_text(
                "#!/bin/sh\nprintf 'fake-token\\0'\n",
                encoding="utf-8",
            )
            hook.chmod(0o755)
            git(root, "config", "core.fsmonitor", str(hook))
            git(root, "config", "core.fsmonitorHookVersion", "2")
            git(root, "status", "--porcelain=v1", "--untracked-files=all")

            tracked_path.write_bytes(b'{"ok":null}\n')
            os.utime(
                tracked_path,
                ns=(original_stat.st_atime_ns, original_stat.st_mtime_ns),
            )
            self.assertEqual(len(tracked_path.read_bytes()), len(original_raw))
            with mock.patch.object(
                PREFLIGHT,
                "__file__",
                str(module_path),
            ), self.assertRaisesRegex(
                ValueError,
                "clean non-ignored|bytes or mode differ",
            ):
                PREFLIGHT._verify_tracked_file(
                    str(tracked_path),
                    revision,
                    tracked_path.read_bytes(),
                )

    def test_injected_core_is_unbranded_after_all_three_strict_loads(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            events = []
            validated, events = self.preflight(fixture, events)
            self.assertIs(type(validated), dict)
            self.assertTrue(validated["all_three_complete_before_selection_read"])
            self.assertFalse(validated["selection_labels_read"])
            self.assertEqual(
                [run["seed"] for run in validated["runs"]],
                [42, 43, 44],
            )
            self.assertEqual(
                [event for event in events if event.startswith("load-")],
                ["load-20-42", "load-20-43", "load-20-44"],
            )
            self.assertEqual(
                [event for event in events if event.startswith("model-")],
                ["model-42", "model-43", "model-44"],
            )
            reader = mock.Mock()
            with self.assertRaisesRegex(ValueError, "unused preflight receipt"):
                PREFLIGHT.call_fresh_selection_reader(validated, reader)
            reader.assert_not_called()
            with self.assertRaisesRegex(TypeError, "cannot be constructed"):
                PREFLIGHT.FreshQatSelectionPreflightReceipt(
                    object(),
                    validated,
                )
            forged = object.__new__(PREFLIGHT.FreshQatSelectionPreflightReceipt)
            with self.assertRaisesRegex(ValueError, "unused preflight receipt"):
                PREFLIGHT.call_fresh_selection_reader(forged, reader)
            reader.assert_not_called()

    def test_internal_branded_reader_guard_is_spent_even_when_reader_raises(self):
        value = {
            "schema": PREFLIGHT.FRESH_QAT_SELECTION_PREFLIGHT_SCHEMA,
            "validated": True,
        }
        receipt = PREFLIGHT.FreshQatSelectionPreflightReceipt(
            PREFLIGHT._RECEIPT_BRAND,
            value,
        )
        self.assertFalse(hasattr(receipt, "__dict__"))
        self.assertEqual(receipt.to_dict(), value)
        for field, replacement in (
            ("_brand", object()),
            ("_serialized", b'{"tampered":true}\n'),
            ("_used", False),
        ):
            with self.subTest(field=field), self.assertRaises(AttributeError):
                setattr(receipt, field, replacement)

        reader = mock.Mock(side_effect=RuntimeError("synthetic reader failure"))
        with self.assertRaisesRegex(RuntimeError, "synthetic reader failure"):
            PREFLIGHT.call_fresh_selection_reader(receipt, reader)
        reader.assert_called_once_with(value)
        with self.assertRaisesRegex(ValueError, "unused preflight receipt"):
            PREFLIGHT.call_fresh_selection_reader(receipt, reader)
        with self.assertRaisesRegex(ValueError, "invalid or already used"):
            receipt.to_dict()
        self.assertEqual(reader.call_count, 1)

    def test_checkpoint_loader_receives_captured_registered_bytes_during_swap(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            first_run = fixture["selection_registry"]["runs"][0]
            checkpoint_path = fixture["root"] / first_run["checkpoint"]["path"]
            original_raw = checkpoint_path.read_bytes()
            original_identity = identity_bytes(original_raw)
            loaded_raw = []

            def load_checkpoint(raw):
                self.assertIs(type(raw), bytes)
                loaded_raw.append(raw)
                if len(loaded_raw) == 1:
                    checkpoint_path.write_bytes(b"temporary swapped checkpoint\n")
                    self.assertEqual(raw, original_raw)
                    checkpoint_path.write_bytes(original_raw)
                return copy.deepcopy(fixture["checkpoint_payloads"][raw])

            validated = PREFLIGHT._preflight_fresh_qat_selection(
                repo_root=str(fixture["root"]),
                tracking_verifier=lambda *_: None,
                checkpoint_loader=load_checkpoint,
                strict_model_validator=lambda model, seed: self.assertEqual(
                    model,
                    {"synthetic_seed": seed},
                ),
            )
            self.assertEqual(len(loaded_raw), 3)
            self.assertEqual(
                validated["runs"][0]["checkpoint"],
                {
                    "path": str(checkpoint_path),
                    **original_identity,
                },
            )

    def test_result_parser_uses_captured_bytes_during_swap_and_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            first_run = fixture["selection_registry"]["runs"][0]
            result_path = fixture["root"] / first_run["result"]["path"]
            original_raw = result_path.read_bytes()
            original_identity = identity_bytes(original_raw)
            swapped_raw = b'{"tampered":true}\n'
            original_snapshot = PREFLIGHT._registered_content_snapshot
            original_strict_json = PREFLIGHT._strict_json

            def snapshot(root, identity, label):
                receipt, raw = original_snapshot(root, identity, label)
                if label == "fresh seed 44 checkpoint":
                    result_path.write_bytes(swapped_raw)
                return receipt, raw

            def strict_json(raw, label):
                if label == "fresh seed 42 result":
                    self.assertEqual(result_path.read_bytes(), swapped_raw)
                    self.assertEqual(raw, original_raw)
                    result_path.write_bytes(original_raw)
                return original_strict_json(raw, label)

            with mock.patch.object(
                PREFLIGHT,
                "_registered_content_snapshot",
                side_effect=snapshot,
            ), mock.patch.object(
                PREFLIGHT,
                "_strict_json",
                side_effect=strict_json,
            ):
                validated, _events = self.preflight(fixture)

            self.assertEqual(
                validated["runs"][0]["result"],
                {
                    "path": str(result_path),
                    **original_identity,
                },
            )

    def test_missing_result_and_one_checkpoint_never_reach_loader_or_reader(self):
        mutations = {
            "missing result": lambda fixture: (
                fixture["root"]
                / next(
                    run["result"]["path"]
                    for run in fixture["selection_registry"]["runs"]
                    if run["seed"] == 44
                )
            ).unlink(),
            "only one checkpoint": lambda fixture: [
                (
                    fixture["root"]
                    / next(
                        run["checkpoint"]["path"]
                        for run in fixture["selection_registry"]["runs"]
                        if run["seed"] == seed
                    )
                ).unlink()
                for seed in (43, 44)
            ],
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                fixture = synthetic_fixture(Path(directory).resolve())
                mutate(fixture)
                loader = mock.Mock()
                reader = mock.Mock()
                with self.assertRaisesRegex(ValueError, "cannot stat"):
                    PREFLIGHT._preflight_fresh_qat_selection(
                        repo_root=str(fixture["root"]),
                        tracking_verifier=lambda *_: None,
                        checkpoint_loader=loader,
                        strict_model_validator=lambda *_: None,
                    )
                loader.assert_not_called()
                reader.assert_not_called()

    def test_tamper_and_duplicate_json_never_issue_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            checkpoint = (
                fixture["root"]
                / fixture["selection_registry"]["runs"][0]["checkpoint"]["path"]
            )
            checkpoint.write_bytes(checkpoint.read_bytes() + b"tamper")
            with self.assertRaisesRegex(ValueError, "byte mismatch"):
                self.preflight(fixture)

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            registered = fixture["selection_registry"]["runs"][0]["result"]
            result_path = fixture["root"] / registered["path"]
            raw = b'{"schema":"one","schema":"two"}\n'
            result_path.write_bytes(raw)
            registered.update(identity_bytes(raw))
            write_selection_registry(fixture)
            with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
                self.preflight(fixture)

        registry_path = REPO_ROOT / PREFLIGHT.FRESH_QAT_SELECTION_REGISTRY_RELATIVE_PATH
        raw = registry_path.read_bytes()
        duplicate = raw.replace(
            b'{\n  "schema":',
            b'{\n  "schema":"duplicate",\n  "schema":',
            1,
        )
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            PREFLIGHT._strict_json(duplicate, "duplicate selection registry")

    def test_historical_artifact_schemas_are_rejected_by_fresh_preflight(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            fixture["selection_registry"]["runs"][0]["result"][
                "schema"
            ] = "shogi-int16-aware-training-result-v1"
            write_selection_registry(fixture)
            loader = mock.Mock()
            with self.assertRaisesRegex(ValueError, "path/schema mismatch"):
                PREFLIGHT._preflight_fresh_qat_selection(
                    repo_root=str(fixture["root"]),
                    tracking_verifier=lambda *_: None,
                    checkpoint_loader=loader,
                    strict_model_validator=lambda *_: None,
                )
            loader.assert_not_called()

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            first_path = next(
                path
                for path, checkpoint in fixture["checkpoints"].items()
                if checkpoint["args"]["seed"] == 42
            )
            fixture["checkpoints"][first_path][
                "schema"
            ] = "shogi-int16-aware-final-checkpoint-v1"
            with self.assertRaisesRegex(ValueError, "schema/epoch mismatch"):
                self.preflight(fixture)

    def test_bool_result_and_wrong_plan_path_fail_before_checkpoint_load(self):
        cases = (
            (
                "bool selection evaluations",
                lambda fixture: rewrite_result(
                    fixture,
                    42,
                    lambda result: result.__setitem__(
                        "selection_evaluations",
                        False,
                    ),
                ),
                "not final-only",
            ),
            (
                "wrong result plan path",
                lambda fixture: rewrite_result(
                    fixture,
                    42,
                    lambda result: result["experiment_plan"].__setitem__(
                        "path",
                        "/wrong/fresh-plan.json",
                    ),
                ),
                "plan binding mismatch",
            ),
            (
                "cross-run runtime mismatch",
                lambda fixture: rewrite_result(
                    fixture,
                    43,
                    lambda result: result["training_runtime"].__setitem__(
                        "mps_available",
                        False,
                    ),
                ),
                "do not share one pipeline/runtime",
            ),
        )
        for label, mutate, expected in cases:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                fixture = synthetic_fixture(Path(directory).resolve())
                mutate(fixture)
                loader = mock.Mock()
                with self.assertRaisesRegex(ValueError, expected):
                    PREFLIGHT._preflight_fresh_qat_selection(
                        repo_root=str(fixture["root"]),
                        tracking_verifier=lambda *_: None,
                        checkpoint_loader=loader,
                        strict_model_validator=lambda *_: None,
                    )
                loader.assert_not_called()

    def test_registry_path_and_plan_output_are_exact(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            fixture["selection_registry"]["runs"][0]["checkpoint"][
                "path"
            ] = "ml/runs/wrong/final.pt"
            write_selection_registry(fixture)
            with self.assertRaisesRegex(ValueError, "path/schema mismatch"):
                self.preflight(fixture)

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            rewrite_plan(
                fixture,
                lambda plan: plan["slots"][0].__setitem__(
                    "output",
                    "ml/runs/wrong-output",
                ),
            )
            loader = mock.Mock()
            with self.assertRaisesRegex(ValueError, "slot registry mismatch"):
                PREFLIGHT._preflight_fresh_qat_selection(
                    repo_root=str(fixture["root"]),
                    tracking_verifier=lambda *_: None,
                    checkpoint_loader=loader,
                    strict_model_validator=lambda *_: None,
                )
            loader.assert_not_called()

    def test_checkpoint_slot_pipeline_plan_and_contract_are_strict(self):
        mutations = (
            (
                "bool epoch",
                lambda checkpoint: checkpoint.__setitem__("epoch", True),
                "schema/epoch mismatch",
            ),
            (
                "wrong output",
                lambda checkpoint: checkpoint["args"].__setitem__(
                    "out",
                    "/wrong/output",
                ),
                "output/plan path mismatch",
            ),
            (
                "wrong pipeline",
                lambda checkpoint: checkpoint["training_pipeline"].__setitem__(
                    "source_revision",
                    "b" * 40,
                ),
                "checkpoint/result training_pipeline mismatch",
            ),
            (
                "wrong plan",
                lambda checkpoint: checkpoint["experiment_plan"].__setitem__(
                    "slot_id",
                    "wrong-slot",
                ),
                "checkpoint/result experiment_plan mismatch",
            ),
            (
                "wrong contract",
                lambda checkpoint: checkpoint["experiment_contract"].__setitem__(
                    "seed",
                    43,
                ),
                "checkpoint/result experiment_contract mismatch",
            ),
        )
        for label, mutate, expected in mutations:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                fixture = synthetic_fixture(Path(directory).resolve())
                first_path = next(
                    path
                    for path, checkpoint in fixture["checkpoints"].items()
                    if checkpoint["args"]["seed"] == 42
                )
                mutate(fixture["checkpoints"][first_path])
                reader = mock.Mock()
                with self.assertRaisesRegex(ValueError, expected):
                    self.preflight(fixture)
                reader.assert_not_called()

    def test_old_wcsc36_selection_module_is_not_version_dispatch(self):
        old_path = ML_DIR / "qat_selection_audit.py"
        old_text = old_path.read_text(encoding="utf-8")
        self.assertNotIn("fresh_qat_selection_preflight", old_text)
        self.assertNotIn(FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA, old_text)
        self.assertIn(
            'QAT_SELECTION_PREFLIGHT_SCHEMA = "shogi-int16-aware-selection-preflight-v1"',
            old_text,
        )


if __name__ == "__main__":
    unittest.main()
