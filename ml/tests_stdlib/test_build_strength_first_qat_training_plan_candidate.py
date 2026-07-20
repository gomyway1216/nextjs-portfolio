import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_strength_first_qat_training_plan_candidate as BUILDER  # noqa: E402
import fresh_qat_parent_accounting_v2 as ACCOUNTING  # noqa: E402
import fresh_qat_protocol as FRESH  # noqa: E402
import strength_first_qat_training_bridge as BRIDGE  # noqa: E402
from ml.tests_stdlib.test_fresh_qat_parent_accounting_v2 import (  # noqa: E402
    make_artifacts,
)
from ml.tests_stdlib.test_strength_first_qat_training_bridge import (  # noqa: E402
    provenance_summary,
)


def _runtime():
    return {
        "platform": "synthetic-platform",
        "system": "Darwin",
        "machine": "arm64",
        "processor": "arm",
        "cpu_model": "synthetic-cpu",
        "logical_cpu_count": 14,
        "device": "cpu",
        "python_version": "3.13.0",
        "torch_version": "2.12.1",
        "torch_threads": 2,
        "torch_interop_threads": 1,
        "deterministic_algorithms": True,
        "deterministic_debug_mode": "error",
    }


def _json_bytes(value):
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _file_identity(path, raw):
    return {
        "path": path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _candidate_fixture():
    source = make_artifacts([0, 2])
    input_identity = {
        **source["input_binding"],
        "path": "training.raw.jsonl",
    }
    completion_identity = {
        **source["completion_binding"],
        "path": "parent-completion.jsonl",
    }
    scan = BRIDGE.scan_strength_first_training_artifacts_exact(
        source["input_raw"],
        source["completion_raw"],
        source["train_raw"],
        expected_input_binding=input_identity,
        expected_completion_binding=completion_identity,
    )
    model_identity = {
        "path": "train.jsonl",
        "format": BRIDGE.STRENGTH_FIRST_TRAIN_FORMAT,
        **scan["model_training"],
    }
    replay_exclusion_raw = b"sha256:" + (b"0" * 64) + b"\n"
    replay_exclusion = {
        "path": "replay-excluded-position-ids.txt",
        "format": FRESH.FRESH_QAT_ID_SET_FORMAT,
        "bytes": len(replay_exclusion_raw),
        "sha256": hashlib.sha256(replay_exclusion_raw).hexdigest(),
        "count": 1,
        "identifiers_sha256": hashlib.sha256(replay_exclusion_raw[:-1]).hexdigest(),
    }
    role_manifest = {
        "schema": BRIDGE.STRENGTH_FIRST_ROLE_BUNDLE_SCHEMA,
        "status": BRIDGE.STRENGTH_FIRST_ROLE_BUNDLE_STATUS,
        "provenance": {
            "labeled_final_holdout_read": False,
            "labeled_selection_read": False,
            "teacher_or_candidate_scores_read": False,
        },
        "roles": {
            "training": {
                "raw_parents": {
                    **input_identity,
                    "records": input_identity["parents"],
                }
            }
        },
        "replay_exclusion": {"identifiers": replay_exclusion},
    }
    role_manifest["roles"]["training"]["raw_parents"].pop("parents")
    work_raw = b'{"schema":"synthetic-work"}\n'
    work_identity = _file_identity("work.jsonl", work_raw)
    staged_result_raw = b"{}\n"
    milestone_100_raw = b'{"target":100}\n'
    milestone_500_raw = b'{"target":500}\n'
    teacher_manifest = {
        "schema": BRIDGE.STRENGTH_FIRST_TEACHER_MANIFEST_SCHEMA,
        "status": "complete-training-only",
        "forced_skip_reasons": {
            "fewer_than_two_legal_moves": 2,
            "search_timeout_no_label": 0,
        },
        "parent_completion": completion_identity,
        "outputs": {"train": model_identity},
    }
    teacher_manifest_raw = _json_bytes(teacher_manifest)
    teacher_manifest_identity = _file_identity(
        "manifest.json",
        teacher_manifest_raw,
    )
    teacher_result = {
        "schema": BRIDGE.STRENGTH_FIRST_TEACHER_RESULT_SCHEMA,
        "status": BRIDGE.STRENGTH_FIRST_TEACHER_RESULT_STATUS,
        "claim_boundary": (
            "postflight-input-and-staged-output-integrity-not-playing-strength-evidence"
        ),
        "runner": {
            "local_only": True,
            "network_requests": 0,
            "cloud_services": [],
            "live_weight_changes": 0,
        },
        "production_asset_preflight": {},
        "authenticated_input": {},
        "consumer_postflight": {},
        "teacher": {},
        "milestones": {
            "targets": [100, 500, 4],
            "prefix_100": _file_identity(
                "milestone-100.json",
                milestone_100_raw,
            ),
            "prefix_500": _file_identity(
                "milestone-500.json",
                milestone_500_raw,
            ),
        },
        "completion": {
            "input_parents": 4,
            "completed_parents": 4,
            "forced_parents_skipped": 2,
            "forced_skip_reasons": {
                "fewer_than_two_legal_moves": 2,
                "search_timeout_no_label": 0,
            },
            "emitted_parent_groups": 2,
            "run_fingerprint": "f" * 64,
        },
        "staged_outputs": {
            "work": work_identity,
            "train": {key: model_identity[key] for key in ("path", "bytes", "sha256")},
            "parent_completion": {
                key: completion_identity[key] for key in ("path", "bytes", "sha256")
            },
            "manifest": teacher_manifest_identity,
            "staged_result": _file_identity(
                "staged-result.json",
                staged_result_raw,
            ),
        },
        "publication": {},
    }
    return {
        "role_bundle_manifest_raw": _json_bytes(role_manifest),
        "teacher_manifest_raw": teacher_manifest_raw,
        "teacher_result_raw": _json_bytes(teacher_result),
        "teacher_staged_result_raw": staged_result_raw,
        "teacher_milestone_100_raw": milestone_100_raw,
        "teacher_milestone_500_raw": milestone_500_raw,
        "input_training_raw": source["input_raw"],
        "parent_completion_raw": source["completion_raw"],
        "model_training_raw": source["train_raw"],
        "replay_exclusion_raw": replay_exclusion_raw,
        "observed_fingerprints": {
            "teacher_work": work_identity,
            "replay": {
                "path": "runOp1-train.jsonl",
                "bytes": FRESH.FRESH_QAT_REPLAY_BYTES,
                "sha256": FRESH.FRESH_QAT_REPLAY_SHA256,
            },
            "warm_initializer": {
                "path": "runOp1-best.pt",
                "bytes": FRESH.FRESH_QAT_WARM_INITIALIZER_BYTES,
                "sha256": FRESH.FRESH_QAT_WARM_INITIALIZER_SHA256,
            },
        },
        "teacher_provenance": provenance_summary(
            target=4,
            forced=2,
            emitted=2,
            train_records=scan["model_training"]["records"],
        ),
        "runtime": _runtime(),
        "input_identity": input_identity,
    }


class StrengthFirstQatTrainingPlanCandidateTests(unittest.TestCase):
    def _build(self, fixture):
        with mock.patch.object(
            ACCOUNTING,
            "PRODUCTION_INPUT_TRAINING_BINDING",
            fixture["input_identity"],
        ), mock.patch.object(
            ACCOUNTING,
            "FRESH_QAT_INPUT_PARENTS",
            4,
        ), mock.patch.object(
            ACCOUNTING,
            "FRESH_QAT_INPUT_GAMES",
            2,
        ):
            return BUILDER.build_strength_first_qat_training_plan_candidate_data(
                **{
                    key: copy.deepcopy(value)
                    for key, value in fixture.items()
                    if key != "input_identity"
                }
            )

    def test_builds_exact_stdout_ready_training_only_candidate(self):
        fixture = _candidate_fixture()
        plan = self._build(fixture)
        self.assertEqual(
            plan["schema"],
            BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
        )
        self.assertEqual(
            plan["status"],
            BRIDGE.STRENGTH_FIRST_QAT_PLAN_STATUS,
        )
        self.assertEqual(
            [slot["seed"] for slot in plan["slots"]],
            [42, 43, 44],
        )
        self.assertEqual(plan["runtime"], fixture["runtime"])
        self.assertEqual(plan["artifacts"]["model_training"]["parents"], 2)
        self.assertEqual(
            plan["artifacts"]["parent_completion"]["records"],
            4,
        )
        self.assertTrue(plan["boundary"]["training_only"])
        self.assertFalse(plan["boundary"]["selection_label_read_authorized"])
        self.assertFalse(plan["boundary"]["holdout_label_read_authorized"])
        self.assertFalse(plan["boundary"]["candidate_selection_authorized"])
        self.assertFalse(plan["boundary"]["production_weight_write_authorized"])
        with mock.patch.object(
            ACCOUNTING,
            "PRODUCTION_INPUT_TRAINING_BINDING",
            fixture["input_identity"],
        ), mock.patch.object(
            ACCOUNTING,
            "FRESH_QAT_INPUT_PARENTS",
            4,
        ), mock.patch.object(
            ACCOUNTING,
            "FRESH_QAT_INPUT_GAMES",
            2,
        ):
            serialized = BUILDER.serialize_strength_first_qat_training_plan_candidate(
                plan
            )
            self.assertTrue(serialized.endswith(b"\n"))
            self.assertEqual(json.loads(serialized), plan)
            self.assertEqual(
                serialized,
                BUILDER.serialize_strength_first_qat_training_plan_candidate(
                    copy.deepcopy(plan)
                ),
            )

    def test_rejects_incomplete_teacher_and_every_identity_drift(self):
        mutations = {
            "teacher completion": lambda item: json.loads(item["teacher_result_raw"])[
                "completion"
            ].__setitem__("completed_parents", 3),
            "work": lambda item: item["observed_fingerprints"][
                "teacher_work"
            ].__setitem__("sha256", "0" * 64),
            "replay exclusion": lambda item: item.__setitem__(
                "replay_exclusion_raw",
                item["replay_exclusion_raw"] + b"\n",
            ),
            "replay": lambda item: item["observed_fingerprints"]["replay"].__setitem__(
                "sha256", "0" * 64
            ),
            "initializer": lambda item: item["observed_fingerprints"][
                "warm_initializer"
            ].__setitem__("sha256", "0" * 64),
            "runtime threads": lambda item: item["runtime"].__setitem__(
                "torch_threads",
                3,
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                fixture = _candidate_fixture()
                if label == "teacher completion":
                    result = json.loads(fixture["teacher_result_raw"])
                    result["completion"]["completed_parents"] = 3
                    fixture["teacher_result_raw"] = _json_bytes(result)
                else:
                    mutate(fixture)
                with self.assertRaises(ValueError):
                    self._build(fixture)

    def test_duplicate_json_and_non_plain_fingerprint_mapping_stop(self):
        fixture = _candidate_fixture()
        fixture["teacher_result_raw"] = b'{"schema":"x","schema":"y"}'
        with self.assertRaisesRegex(ValueError, "duplicate"):
            self._build(fixture)

        class MappingSubclass(dict):
            pass

        fixture = _candidate_fixture()
        fixture["observed_fingerprints"] = MappingSubclass(
            fixture["observed_fingerprints"]
        )
        with self.assertRaisesRegex(ValueError, "fingerprint set"):
            self._build(fixture)

    def test_replay_exclusion_must_be_canonical_and_rederived(self):
        mutations = {
            "missing final LF": lambda raw: raw[:-1],
            "double final LF": lambda raw: raw + b"\n",
            "noncanonical ID": lambda _raw: b"not-an-id\n",
            "duplicate": lambda raw: raw + raw,
            "unsorted": lambda raw: (b"sha256:" + (b"f" * 64) + b"\n" + raw),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                fixture = _candidate_fixture()
                fixture["replay_exclusion_raw"] = mutate(
                    fixture["replay_exclusion_raw"]
                )
                with self.assertRaisesRegex(
                    ValueError,
                    "replay exclusion",
                ):
                    self._build(fixture)

    def test_runtime_requires_exact_fields_and_plain_types(self):
        fixture = _candidate_fixture()
        fixture["runtime"]["unexpected"] = False
        with self.assertRaisesRegex(ValueError, "runtime fields"):
            self._build(fixture)
        fixture = _candidate_fixture()
        fixture["runtime"]["logical_cpu_count"] = True
        with self.assertRaisesRegex(ValueError, "runtime contract"):
            self._build(fixture)
        fixture = _candidate_fixture()
        fixture["runtime"]["deterministic_algorithms"] = 1
        with self.assertRaisesRegex(ValueError, "runtime contract"):
            self._build(fixture)

    def test_active_lock_stops_before_any_artifact_or_runtime_read(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            paths = BRIDGE.default_strength_first_local_paths(
                repo_root=root,
                home=root / "home",
            )
            lock = (
                Path(paths["teacher_result"]).parent
                / BUILDER.STRENGTH_FIRST_TEACHER_LOCK_FILENAME
            )
            lock.parent.mkdir(parents=True)
            lock.write_bytes(b"")
            lock.chmod(0o600)
            lock_descriptor = os.open(lock, os.O_RDWR)
            fcntl.flock(
                lock_descriptor,
                fcntl.LOCK_EX | fcntl.LOCK_NB,
            )
            runtime_probe = mock.Mock()
            try:
                with mock.patch.object(
                    BUILDER,
                    "_snapshot_regular_file",
                ) as snapshot:
                    with self.assertRaisesRegex(ValueError, "active"):
                        BUILDER.build_strength_first_qat_training_plan_candidate(
                            repo_root=root,
                            home=root / "home",
                            runtime_probe=runtime_probe,
                        )
            finally:
                fcntl.flock(lock_descriptor, fcntl.LOCK_UN)
                os.close(lock_descriptor)
            snapshot.assert_not_called()
            runtime_probe.assert_not_called()

    def test_missing_terminal_result_stops_before_large_inputs_or_torch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            paths = BRIDGE.default_strength_first_local_paths(
                repo_root=root,
                home=root / "home",
            )
            lock = (
                Path(paths["teacher_result"]).parent
                / BUILDER.STRENGTH_FIRST_TEACHER_LOCK_FILENAME
            )
            lock.parent.mkdir(parents=True)
            lock.write_bytes(b"")
            lock.chmod(0o600)
            runtime_probe = mock.Mock()
            with mock.patch.object(
                BUILDER,
                "_snapshot_regular_file",
            ) as snapshot:
                with self.assertRaisesRegex(
                    ValueError,
                    "terminal v8 artifact",
                ):
                    BUILDER.build_strength_first_qat_training_plan_candidate(
                        repo_root=root,
                        home=root / "home",
                        runtime_probe=runtime_probe,
                    )
            snapshot.assert_not_called()
            runtime_probe.assert_not_called()
            released_descriptor = os.open(lock, os.O_RDWR)
            try:
                fcntl.flock(
                    released_descriptor,
                    fcntl.LOCK_EX | fcntl.LOCK_NB,
                )
            finally:
                fcntl.flock(released_descriptor, fcntl.LOCK_UN)
                os.close(released_descriptor)

    def test_runtime_probe_occurs_only_after_source_derivation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            paths = BRIDGE.default_strength_first_local_paths(
                repo_root=root,
                home=root / "home",
            )
            events = []
            snapshot_paths = []
            terminal_paths = {paths[key] for key in BUILDER._TERMINAL_TEACHER_KEYS}
            lock = (
                Path(paths["teacher_result"]).parent
                / BUILDER.STRENGTH_FIRST_TEACHER_LOCK_FILENAME
            )
            lock.parent.mkdir(parents=True)
            lock.write_bytes(b"")
            lock.chmod(0o600)

            def exists(path):
                if path == paths["experiment_plan"]:
                    return False
                return path in terminal_paths

            def snapshot(path, *, label, materialize):
                del label
                snapshot_paths.append(path)
                if materialize:
                    return (
                        b"{}",
                        {
                            "path": "ignored",
                            "bytes": 2,
                            "sha256": hashlib.sha256(b"{}").hexdigest(),
                        },
                        (1, 2, 3),
                    )
                return (
                    None,
                    {
                        "path": "ignored",
                        "bytes": 1,
                        "sha256": "a" * 64,
                    },
                    (1, 2, 3),
                )

            def derive(**_kwargs):
                events.append("derive")
                return {"synthetic": True}, {"provenance": True}

            def provenance_verifier(**_kwargs):
                events.append("provenance")
                return {"provenance": True}

            def runtime_probe(**_kwargs):
                events.append("runtime")
                return _runtime()

            def assemble(_artifacts, _provenance, _runtime_value):
                events.append("assemble")
                return {"candidate": True}

            def consume(candidate):
                self.assertEqual(candidate, {"candidate": True})
                events.append("emit")
                competing_descriptor = os.open(lock, os.O_RDWR)
                try:
                    with self.assertRaises(BlockingIOError):
                        fcntl.flock(
                            competing_descriptor,
                            fcntl.LOCK_EX | fcntl.LOCK_NB,
                        )
                finally:
                    os.close(competing_descriptor)

            with mock.patch.object(
                BUILDER,
                "_path_exists_without_following",
                side_effect=exists,
            ), mock.patch.object(
                BUILDER,
                "_snapshot_regular_file",
                side_effect=snapshot,
            ), mock.patch.object(
                BUILDER,
                "_derive_strength_first_qat_training_artifacts",
                side_effect=derive,
            ), mock.patch.object(
                BUILDER,
                "_assemble_strength_first_qat_training_plan",
                side_effect=assemble,
            ), mock.patch.object(
                BUILDER,
                "_revalidate_snapshot",
            ):
                result = BUILDER.build_strength_first_qat_training_plan_candidate(
                    repo_root=root,
                    home=root / "home",
                    runtime_probe=runtime_probe,
                    provenance_verifier=provenance_verifier,
                    _candidate_consumer=consume,
                )
            self.assertTrue(lock.exists())
            released_descriptor = os.open(lock, os.O_RDWR)
            try:
                fcntl.flock(
                    released_descriptor,
                    fcntl.LOCK_EX | fcntl.LOCK_NB,
                )
            finally:
                fcntl.flock(released_descriptor, fcntl.LOCK_UN)
                os.close(released_descriptor)
        self.assertEqual(result, {"candidate": True})
        self.assertEqual(
            events,
            ["provenance", "derive", "runtime", "assemble", "emit"],
        )
        expected_snapshot_paths = {
            paths[key]
            for key in (
                *BUILDER._PARSED_FILE_KEYS,
                *BUILDER._FINGERPRINT_FILE_KEYS,
            )
        }
        self.assertEqual(set(snapshot_paths), expected_snapshot_paths)
        self.assertFalse(
            {
                paths["holdout_protected_position_ids"],
                paths["policy_exposure_receipt"],
                paths["policy_exposed_parent_ids"],
                paths["policy_exposed_semantic_position_ids"],
            }
            & set(snapshot_paths)
        )

    def test_v8_provenance_subprocess_is_fixed_and_accepts_only_safe_summary(self):
        safe_summary = provenance_summary()
        completed = BUILDER.subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout=(
                json.dumps(
                    safe_summary,
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode("utf-8")
                + b"\n"
            ),
            stderr=b"",
        )
        with mock.patch.object(
            BUILDER,
            "_snapshot_fixed_training_interpreter",
            return_value=("/fixed/node", {"stable": True}),
        ), mock.patch.object(
            BUILDER,
            "_revalidate_fixed_training_interpreter",
        ) as revalidate, mock.patch.object(
            BUILDER.subprocess,
            "run",
            return_value=completed,
        ) as run:
            observed = BUILDER._verify_v8_downstream_provenance(
                node_path="/fixed/node",
                repo_root="/repo",
                home="/home/user",
            )
        self.assertEqual(observed, safe_summary)
        run.assert_called_once()
        command = run.call_args.args[0]
        options = run.call_args.kwargs
        self.assertEqual(
            command,
            [
                "/fixed/node",
                "-r",
                "tsx/cjs",
                "ml/verify-floodgate-strength-first-v8-downstream-provenance.ts",
            ],
        )
        self.assertEqual(options["cwd"], "/repo")
        self.assertEqual(options["env"]["HOME"], "/home/user")
        self.assertEqual(options["timeout"], 300)
        self.assertTrue(options["check"])
        self.assertTrue(options["capture_output"])
        self.assertFalse(options["text"])
        revalidate.assert_called_once_with(
            "/fixed/node",
            {"stable": True},
        )

    def test_snapshot_rejects_permissive_mode_and_symbolic_link(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            artifact = root / "artifact.json"
            artifact.write_bytes(b"{}\n")
            artifact.chmod(0o600)
            raw, identity, token = BUILDER._snapshot_regular_file(
                str(artifact),
                label="artifact",
                materialize=True,
            )
            self.assertEqual(raw, b"{}\n")
            self.assertEqual(identity["bytes"], 3)
            BUILDER._revalidate_snapshot(
                str(artifact),
                token,
                label="artifact",
            )

            artifact.chmod(0o644)
            with self.assertRaisesRegex(ValueError, "mode"):
                BUILDER._snapshot_regular_file(
                    str(artifact),
                    label="artifact",
                    materialize=False,
                )
            artifact.chmod(0o600)
            alias = root / "alias.json"
            alias.symlink_to(artifact)
            with self.assertRaisesRegex(ValueError, "symbolic-link"):
                BUILDER._snapshot_regular_file(
                    str(alias),
                    label="artifact",
                    materialize=False,
                )

    def test_retained_lock_rejects_path_replacement_and_releases_descriptor(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            lock = root / BUILDER.STRENGTH_FIRST_TEACHER_LOCK_FILENAME
            lock.write_bytes(b"")
            lock.chmod(0o600)
            descriptor, stability = BUILDER._acquire_teacher_run_lock(str(lock))
            displaced = root / "displaced.lock"
            lock.rename(displaced)
            lock.write_bytes(b"")
            lock.chmod(0o600)
            try:
                with self.assertRaisesRegex(ValueError, "changed"):
                    BUILDER._assert_teacher_run_lock(
                        descriptor,
                        str(lock),
                        stability,
                    )
            finally:
                BUILDER._release_teacher_run_lock(descriptor)

            displaced_descriptor = os.open(displaced, os.O_RDWR)
            try:
                fcntl.flock(
                    displaced_descriptor,
                    fcntl.LOCK_EX | fcntl.LOCK_NB,
                )
            finally:
                fcntl.flock(displaced_descriptor, fcntl.LOCK_UN)
                os.close(displaced_descriptor)

    def test_runtime_interpreter_requires_stable_executable_file_target(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            executable = root / "python3.13"
            executable.write_bytes(b"synthetic executable\n")
            executable.chmod(0o755)
            python = root / "python3"
            python.symlink_to(executable.name)

            normalized, snapshot = BUILDER._snapshot_fixed_training_interpreter(
                str(python)
            )
            self.assertEqual(normalized, str(python))
            BUILDER._revalidate_fixed_training_interpreter(
                normalized,
                snapshot,
            )

            replacement = root / "replacement"
            replacement.write_bytes(b"different synthetic executable\n")
            replacement.chmod(0o755)
            python.unlink()
            python.symlink_to(replacement.name)
            with self.assertRaisesRegex(ValueError, "changed"):
                BUILDER._revalidate_fixed_training_interpreter(
                    normalized,
                    snapshot,
                )

            python.unlink()
            python.symlink_to(root, target_is_directory=True)
            with mock.patch.object(BUILDER.subprocess, "run") as run:
                with self.assertRaisesRegex(ValueError, "identity"):
                    BUILDER._probe_fixed_training_runtime(
                        python_path=str(python),
                        repo_root=str(root),
                    )
            run.assert_not_called()

    def test_main_serializes_writes_and_flushes_inside_candidate_consumer(self):
        events = []
        serialized = b'{"candidate":true}\n'

        class Buffer:
            def write(self, raw):
                events.append(("write", raw))
                return len(raw)

            def flush(self):
                events.append(("flush", None))

        class Stdout:
            buffer = Buffer()

        def build(**kwargs):
            consumer = kwargs["_candidate_consumer"]
            events.append(("consume", None))
            consumer({"candidate": True})
            return {"candidate": True}

        with mock.patch.object(
            BUILDER,
            "build_strength_first_qat_training_plan_candidate",
            side_effect=build,
        ), mock.patch.object(
            BUILDER,
            "serialize_strength_first_qat_training_plan_candidate",
            return_value=serialized,
        ) as serializer, mock.patch.object(
            BUILDER.sys,
            "stdout",
            Stdout(),
        ):
            self.assertEqual(BUILDER.main([]), 0)
        serializer.assert_called_once_with({"candidate": True})
        self.assertEqual(
            events,
            [
                ("consume", None),
                ("write", serialized),
                ("flush", None),
            ],
        )

    def test_argument_rejection_does_not_call_builder(self):
        with mock.patch.object(
            BUILDER,
            "build_strength_first_qat_training_plan_candidate",
        ) as build:
            self.assertEqual(BUILDER.main(["unexpected"]), 2)
        build.assert_not_called()


if __name__ == "__main__":
    unittest.main()
