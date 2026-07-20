from __future__ import annotations

from collections import Counter
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
TEST_DIR = Path(__file__).resolve().parent
for directory in (ML_DIR, TEST_DIR):
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))

import build_strength_first_selection_evaluator_registry_candidate as SUBJECT  # noqa: E402
import run_strength_first_selection_teacher_preflight as TEACHER_PREFLIGHT  # noqa: E402
import strength_first_qat_selection_evaluator as EVALUATOR  # noqa: E402
from test_strength_first_qat_selection_evaluator import (  # noqa: E402
    synthetic_blocked_registry,
)


def pretty(value: object) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            indent=2,
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")


def identity(path: str, raw: bytes, schema: str) -> dict:
    return {
        "path": path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": schema,
    }


class CandidateHarness:
    revision = "a" * 40

    def __init__(self, temporary: str):
        self.home = Path(temporary).resolve()
        self.verifications: list[tuple[str, str, bytes]] = []
        self.tracked_reads: list[str] = []
        self.private_reads: list[str] = []
        self.private_fingerprints: list[str] = []
        self.preflight_calls = 0
        stable_raw = b"synthetic-stable-checkpoint\n"

        registry_relative = (
            EVALUATOR.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
        )
        self.registry_path = str(REPO_ROOT / registry_relative)
        self.blocked_registry_raw = pretty(synthetic_blocked_registry())

        self.plan_raw = pretty(
            {
                "schema": (EVALUATOR.BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA),
                "synthetic": True,
                "artifacts": {
                    "warm_initializer": {
                        "path": "runOp1-best.pt",
                        "bytes": len(stable_raw),
                        "sha256": hashlib.sha256(stable_raw).hexdigest(),
                    }
                },
            }
        )
        self.preflight_registry_raw = pretty(
            {
                "schema": (
                    EVALUATOR.PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_SCHEMA
                ),
                "status": "synthetic-ready",
            }
        )
        self.plan_identity = identity(
            EVALUATOR._FIXED_PATHS["training_plan"],
            self.plan_raw,
            EVALUATOR.BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
        )
        self.preflight_registry_identity = identity(
            EVALUATOR._FIXED_PATHS["selection_preflight_registry"],
            self.preflight_registry_raw,
            EVALUATOR.PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_SCHEMA,
        )
        self.tracked_overrides = {
            self.registry_path: self.blocked_registry_raw,
            str(REPO_ROOT / self.plan_identity["path"]): self.plan_raw,
            str(
                REPO_ROOT / self.preflight_registry_identity["path"]
            ): self.preflight_registry_raw,
        }

        projection = {
            "schema": (
                EVALUATOR.PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_PREFLIGHT_SCHEMA
            ),
            "training_plan": copy.deepcopy(self.plan_identity),
            "training_pipeline": {
                "source_revision": "b" * 40,
                "tracked_tree_clean": True,
            },
            "runs": [
                {
                    "slot_id": ("floodgate-strength-first-int16-aware-" f"seed-{seed}"),
                    "seed": seed,
                    "output": (
                        f"{EVALUATOR.BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/"
                        f"seed-{seed}"
                    ),
                    "result": {
                        "path": (
                            f"{EVALUATOR.BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/"
                            f"seed-{seed}/result.json"
                        ),
                        "bytes": 100 + seed,
                        "sha256": f"{index:x}" * 64,
                        "schema": (
                            EVALUATOR.BRIDGE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA
                        ),
                    },
                    "checkpoint": {
                        "path": (
                            f"{EVALUATOR.BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/"
                            f"seed-{seed}/final.pt"
                        ),
                        "bytes": 200 + seed,
                        "sha256": f"{index + 3:x}" * 64,
                        "schema": (
                            EVALUATOR.BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA
                        ),
                    },
                    "checkpoint_metadata": {
                        "schema": (
                            EVALUATOR.BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA
                        ),
                        "epoch": 20,
                    },
                }
                for index, seed in enumerate((42, 43, 44), start=1)
            ],
        }
        payload = TEACHER_PREFLIGHT._canonical_json(projection)
        self.no_lf_preflight_sha256 = hashlib.sha256(payload).hexdigest()
        self.with_lf_preflight_sha256 = hashlib.sha256(payload + b"\n").hexdigest()
        self.preflight_summary = {
            "schema": TEACHER_PREFLIGHT.SUMMARY_SCHEMA,
            "status": TEACHER_PREFLIGHT.SUMMARY_STATUS,
            "training_plan": copy.deepcopy(self.plan_identity),
            "selection_preflight_registry": copy.deepcopy(
                self.preflight_registry_identity
            ),
            "checkpoint_preflight_sha256": self.no_lf_preflight_sha256,
            "strict_loaded_seeds": [42, 43, 44],
            "strict_loaded_checkpoints": 3,
            "selection_source_opened": False,
            "network_requests": 0,
            "live_weight_writes": 0,
        }

        dataset_raw = b'{"synthetic":"first"}\n{"synthetic":"second"}\n'
        self._write_private(
            EVALUATOR._FIXED_PATHS["selection_dataset"],
            dataset_raw,
        )
        self._write_private(
            EVALUATOR._FIXED_PATHS["stable_checkpoint"],
            stable_raw,
        )
        dataset_identity = identity(
            EVALUATOR._FIXED_PATHS["selection_dataset"],
            dataset_raw,
            EVALUATOR.STRENGTH_FIRST_SELECTION_DATASET_SCHEMA,
        )
        completion = {
            "input_games": EVALUATOR.STRENGTH_FIRST_SELECTION_GAME_COUNT,
            "input_parents": EVALUATOR.STRENGTH_FIRST_SELECTION_PARENT_COUNT,
            "completed_parents": EVALUATOR.STRENGTH_FIRST_SELECTION_PARENT_COUNT,
            "forced_parents_skipped": 0,
            "forced_skip_reasons": {"fewer_than_two_legal_moves": 0},
            "emitted_parent_groups": (EVALUATOR.STRENGTH_FIRST_SELECTION_PARENT_COUNT),
            "dataset_records": (2 * EVALUATOR.STRENGTH_FIRST_SELECTION_PARENT_COUNT),
            "sealed": True,
        }
        run_fingerprint = hashlib.sha256(b"synthetic-teacher-run").hexdigest()
        manifest = {
            "schema": EVALUATOR.STRENGTH_FIRST_SELECTION_TEACHER_MANIFEST_SCHEMA,
            "status": EVALUATOR.STRENGTH_FIRST_SELECTION_TEACHER_STATUS,
            "role": "fresh_selection",
            "source": copy.deepcopy(EVALUATOR._SELECTION_SOURCE),
            "dataset": copy.deepcopy(dataset_identity),
            "completion": copy.deepcopy(completion),
            "run_fingerprint": run_fingerprint,
            "boundary": copy.deepcopy(EVALUATOR._TEACHER_BOUNDARY),
        }
        manifest_raw = pretty(manifest)
        manifest_identity = identity(
            EVALUATOR._FIXED_PATHS["selection_teacher_manifest"],
            manifest_raw,
            EVALUATOR.STRENGTH_FIRST_SELECTION_TEACHER_MANIFEST_SCHEMA,
        )
        result = {
            "schema": EVALUATOR.STRENGTH_FIRST_SELECTION_TEACHER_RESULT_SCHEMA,
            "status": EVALUATOR.STRENGTH_FIRST_SELECTION_TEACHER_STATUS,
            "role": "fresh_selection",
            "manifest": copy.deepcopy(manifest_identity),
            "dataset": copy.deepcopy(dataset_identity),
            "completion": copy.deepcopy(completion),
            "run_fingerprint": run_fingerprint,
            "postflight_complete": True,
            "boundary": copy.deepcopy(EVALUATOR._TEACHER_BOUNDARY),
        }
        result_raw = pretty(result)
        result_identity = identity(
            EVALUATOR._FIXED_PATHS["selection_teacher_result"],
            result_raw,
            EVALUATOR.STRENGTH_FIRST_SELECTION_TEACHER_RESULT_SCHEMA,
        )
        authority = {
            "schema": EVALUATOR.STRENGTH_FIRST_SELECTION_TEACHER_AUTHORITY_SCHEMA,
            "status": EVALUATOR.STRENGTH_FIRST_SELECTION_TEACHER_STATUS,
            "role": "fresh_selection",
            "source": copy.deepcopy(EVALUATOR._SELECTION_SOURCE),
            "training_plan": copy.deepcopy(self.plan_identity),
            "selection_preflight_registry": copy.deepcopy(
                self.preflight_registry_identity
            ),
            "checkpoint_preflight_sha256": self.no_lf_preflight_sha256,
            "artifacts": {
                "manifest": copy.deepcopy(manifest_identity),
                "result": copy.deepcopy(result_identity),
                "dataset": copy.deepcopy(dataset_identity),
            },
            "completion": copy.deepcopy(completion),
            "run_fingerprint": run_fingerprint,
            "boundary": copy.deepcopy(EVALUATOR._TEACHER_BOUNDARY),
        }
        authority_raw = pretty(authority)
        self._write_private(
            EVALUATOR._FIXED_PATHS["selection_teacher_manifest"],
            manifest_raw,
        )
        self._write_private(
            EVALUATOR._FIXED_PATHS["selection_teacher_result"],
            result_raw,
        )
        self._write_private(
            EVALUATOR._FIXED_PATHS["selection_teacher_authority"],
            authority_raw,
        )

    def _write_private(self, relative: str, raw: bytes) -> None:
        path = self.home / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)

    def read_tracked(self, path: str) -> bytes:
        self.tracked_reads.append(path)
        if path in self.tracked_overrides:
            return self.tracked_overrides[path]
        return Path(path).read_bytes()

    def verify_tracked(self, path: str, revision: str, raw: bytes) -> None:
        self.verifications.append((path, revision, raw))

    def read_private(self, path: str, label: str) -> bytes:
        self.private_reads.append(path)
        return SUBJECT._read_canonical_regular_file(path, label)

    def fingerprint_private(self, path: str, label: str) -> dict:
        self.private_fingerprints.append(path)
        return SUBJECT._fingerprint_canonical_regular_file(path, label)

    def checkpoint_preflight(self) -> dict:
        self.preflight_calls += 1
        return copy.deepcopy(self.preflight_summary)

    def build(self) -> dict:
        return SUBJECT.build_strength_first_selection_evaluator_registry_candidate(
            _repo_root=str(REPO_ROOT),
            _home_root=str(self.home),
            _git_head=lambda _root: self.revision,
            _verify_tracked=self.verify_tracked,
            _read_tracked=self.read_tracked,
            _read_private=self.read_private,
            _fingerprint_private=self.fingerprint_private,
            _validate_training_plan=lambda plan: plan,
            _run_checkpoint_preflight=self.checkpoint_preflight,
        )


class StrengthFirstSelectionEvaluatorRegistryCandidateTests(unittest.TestCase):
    def test_blocked_registry_builds_one_privacy_safe_ready_candidate(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = CandidateHarness(temporary)
            original_registry = harness.tracked_overrides[harness.registry_path]
            candidate = harness.build()
            serialized = (
                SUBJECT.serialize_strength_first_selection_evaluator_registry_candidate(
                    candidate
                )
            )

            self.assertEqual(
                candidate["status"],
                EVALUATOR.STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS,
            )
            self.assertEqual(candidate["gates"], EVALUATOR._READY_GATES)
            self.assertFalse(candidate["gates"]["final_holdout_read_authorized"])
            self.assertFalse(candidate["gates"]["production_weight_write_authorized"])
            self.assertFalse(candidate["boundary"]["final_holdout_read"])
            self.assertFalse(candidate["boundary"]["live_weight_write"])
            self.assertEqual(
                set(candidate["implementation"]),
                set(EVALUATOR._IMPLEMENTATION_PATHS),
            )
            for name, relative in EVALUATOR._IMPLEMENTATION_PATHS.items():
                source_raw = (REPO_ROOT / relative).read_bytes()
                self.assertEqual(
                    candidate["implementation"][name],
                    identity(
                        relative,
                        source_raw,
                        EVALUATOR._SOURCE_IDENTITY_SCHEMA,
                    ),
                )
            self.assertEqual(
                candidate["enrollments"]["checkpoint_preflight_sha256"],
                harness.no_lf_preflight_sha256,
            )
            self.assertNotEqual(
                harness.no_lf_preflight_sha256,
                harness.with_lf_preflight_sha256,
            )
            self.assertEqual(harness.preflight_calls, 1)
            self.assertEqual(
                harness.tracked_overrides[harness.registry_path],
                original_registry,
            )

            decoded = json.loads(serialized)
            self.assertEqual(decoded, candidate)
            self.assertEqual(
                serialized,
                pretty(candidate),
            )
            self.assertTrue(serialized.endswith(b"}\n"))
            self.assertFalse(serialized.endswith(b"\n\n"))
            self.assertNotIn(b"\r", serialized)
            self.assertNotIn(str(harness.home).encode(), serialized)
            self.assertNotIn(b"sfen", serialized.lower())
            self.assertNotIn(b'"synthetic":"first"', serialized)

            expected_tracked = {
                harness.registry_path,
                str(REPO_ROOT / harness.plan_identity["path"]),
                str(REPO_ROOT / harness.preflight_registry_identity["path"]),
                *(
                    str(REPO_ROOT / relative)
                    for relative in EVALUATOR._IMPLEMENTATION_PATHS.values()
                ),
            }
            self.assertEqual(
                {path for path, _revision, _raw in harness.verifications},
                expected_tracked,
            )
            self.assertTrue(
                all(
                    revision == harness.revision
                    for _path, revision, _raw in harness.verifications
                )
            )
            expected_document_reads = Counter(
                {
                    str(harness.home / EVALUATOR._FIXED_PATHS[name]): 2
                    for name in SUBJECT._PRIVATE_DOCUMENTS
                }
            )
            expected_large_fingerprints = Counter(
                {
                    str(harness.home / EVALUATOR._FIXED_PATHS[name]): 2
                    for name in ("selection_dataset", "stable_checkpoint")
                }
            )
            self.assertEqual(
                Counter(harness.private_reads),
                expected_document_reads,
            )
            self.assertEqual(
                Counter(harness.private_fingerprints),
                expected_large_fingerprints,
            )

    def test_ready_registry_recomputes_exactly_and_rejects_ready_drift(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = CandidateHarness(temporary)
            first = harness.build()
            ready_raw = (
                SUBJECT.serialize_strength_first_selection_evaluator_registry_candidate(
                    first
                )
            )
            harness.tracked_overrides[harness.registry_path] = ready_raw
            second = harness.build()
            self.assertEqual(second, first)

            drifted = copy.deepcopy(first)
            drifted["implementation"]["evaluator"]["sha256"] = hashlib.sha256(
                b"drifted evaluator"
            ).hexdigest()
            harness.tracked_overrides[harness.registry_path] = pretty(drifted)
            with self.assertRaisesRegex(
                SUBJECT.StrengthFirstSelectionEvaluatorRegistryCandidateError,
                "idempotent recomputation",
            ):
                harness.build()

    def test_authority_must_match_no_lf_checkpoint_preflight_hash(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = CandidateHarness(temporary)
            harness.preflight_summary["checkpoint_preflight_sha256"] = (
                harness.with_lf_preflight_sha256
            )
            with self.assertRaisesRegex(
                SUBJECT.StrengthFirstSelectionEvaluatorRegistryCandidateError,
                "no-LF checkpoint preflight",
            ):
                harness.build()

    def test_teacher_document_binding_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = CandidateHarness(temporary)
            result_path = (
                harness.home / EVALUATOR._FIXED_PATHS["selection_teacher_result"]
            )
            result = json.loads(result_path.read_bytes())
            result["run_fingerprint"] = hashlib.sha256(b"other-teacher-run").hexdigest()
            result_path.write_bytes(pretty(result))
            with self.assertRaisesRegex(ValueError, "authority binding mismatch"):
                harness.build()

    def test_dataset_identity_is_recomputed_and_cross_bound_to_teacher_documents(
        self,
    ):
        with tempfile.TemporaryDirectory() as temporary:
            harness = CandidateHarness(temporary)
            dataset_path = harness.home / EVALUATOR._FIXED_PATHS["selection_dataset"]
            dataset_path.write_bytes(b'{"different":"selection-dataset"}\n')
            with self.assertRaisesRegex(ValueError, "authority binding mismatch"):
                harness.build()

    def test_large_artifact_drift_and_hard_links_stop_before_emission(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = CandidateHarness(temporary)
            stable_path = str(
                harness.home / EVALUATOR._FIXED_PATHS["stable_checkpoint"]
            )
            original_fingerprint = harness.fingerprint_private
            stable_calls = 0

            def drifting_fingerprint(path: str, label: str) -> dict:
                nonlocal stable_calls
                observed = original_fingerprint(path, label)
                if path == stable_path:
                    stable_calls += 1
                    if stable_calls > 1:
                        observed["sha256"] = hashlib.sha256(
                            b"stable changed after enrollment"
                        ).hexdigest()
                return observed

            harness.fingerprint_private = drifting_fingerprint
            with self.assertRaisesRegex(
                SUBJECT.StrengthFirstSelectionEvaluatorRegistryCandidateError,
                "changed before candidate emission",
            ):
                harness.build()

        with tempfile.TemporaryDirectory() as temporary:
            harness = CandidateHarness(temporary)
            dataset_path = harness.home / EVALUATOR._FIXED_PATHS["selection_dataset"]
            os.link(dataset_path, dataset_path.with_name("dataset-hard-link"))
            with self.assertRaisesRegex(
                SUBJECT.StrengthFirstSelectionEvaluatorRegistryCandidateError,
                "cannot be fingerprinted",
            ):
                harness.build()

    def test_stable_checkpoint_is_cross_bound_to_authenticated_plan_initializer(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = CandidateHarness(temporary)
            stable_path = harness.home / EVALUATOR._FIXED_PATHS["stable_checkpoint"]
            original = stable_path.read_bytes()
            stable_path.write_bytes(bytes([original[0] ^ 1]) + original[1:])
            with self.assertRaisesRegex(
                SUBJECT.StrengthFirstSelectionEvaluatorRegistryCandidateError,
                "authenticated training plan warm initializer",
            ):
                harness.build()

    def test_fd_identity_rejects_open_time_path_substitution(self):
        with tempfile.TemporaryDirectory() as temporary:
            original = Path(temporary) / "original"
            decoy = Path(temporary) / "decoy"
            original.write_bytes(b"original-bytes")
            decoy.write_bytes(b"decoy-bytes")
            real_open = os.open

            for reader, message in (
                (
                    SUBJECT._read_canonical_regular_file,
                    "changed before it could be read",
                ),
                (
                    SUBJECT._fingerprint_canonical_regular_file,
                    "cannot be fingerprinted",
                ),
            ):
                decoy_descriptor = real_open(decoy, os.O_RDONLY)
                try:
                    with (
                        self.subTest(reader=reader.__name__),
                        mock.patch.object(
                            SUBJECT.os,
                            "open",
                            side_effect=lambda *_args, **_kwargs: os.dup(
                                decoy_descriptor
                            ),
                        ),
                        mock.patch.object(
                            SUBJECT.os.path,
                            "realpath",
                            side_effect=lambda value: os.path.abspath(value),
                        ),
                        self.assertRaisesRegex(
                            SUBJECT.StrengthFirstSelectionEvaluatorRegistryCandidateError,
                            message,
                        ),
                    ):
                        reader(str(original), "substituted private artifact")
                    self.assertEqual(
                        os.lseek(decoy_descriptor, 0, os.SEEK_CUR),
                        0,
                    )
                finally:
                    os.close(decoy_descriptor)

    def test_tracked_input_change_stops_before_candidate_consumer(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = CandidateHarness(temporary)
            target = str(REPO_ROOT / EVALUATOR._IMPLEMENTATION_PATHS["metric_gates"])
            original_reader = harness.read_tracked
            counts: dict[str, int] = {}

            def drifting_reader(path: str) -> bytes:
                raw = original_reader(path)
                counts[path] = counts.get(path, 0) + 1
                if path == target and counts[path] > 1:
                    return raw + b"\n"
                return raw

            emitted: list[dict] = []
            with self.assertRaisesRegex(
                SUBJECT.StrengthFirstSelectionEvaluatorRegistryCandidateError,
                "changed before candidate emission",
            ):
                (
                    SUBJECT.build_strength_first_selection_evaluator_registry_candidate(
                        _repo_root=str(REPO_ROOT),
                        _home_root=str(harness.home),
                        _git_head=lambda _root: harness.revision,
                        _verify_tracked=harness.verify_tracked,
                        _read_tracked=drifting_reader,
                        _read_private=harness.read_private,
                        _fingerprint_private=harness.fingerprint_private,
                        _validate_training_plan=lambda plan: plan,
                        _run_checkpoint_preflight=(harness.checkpoint_preflight),
                        _candidate_consumer=lambda value: emitted.append(dict(value)),
                    )
                )
            self.assertEqual(emitted, [])

    def test_cli_emits_exact_candidate_and_arguments_stop_before_builder(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = CandidateHarness(temporary)
            candidate = harness.build()
            expected = (
                SUBJECT.serialize_strength_first_selection_evaluator_registry_candidate(
                    candidate
                )
            )
            stdout = SimpleNamespace(buffer=io.BytesIO())

            def fake_build(*, _candidate_consumer):
                _candidate_consumer(copy.deepcopy(candidate))
                return copy.deepcopy(candidate)

            with (
                mock.patch.object(
                    SUBJECT,
                    "build_strength_first_selection_evaluator_registry_candidate",
                    side_effect=fake_build,
                ) as build,
                mock.patch.object(SUBJECT.sys, "stdout", stdout),
            ):
                self.assertEqual(SUBJECT.main([]), 0)
            self.assertEqual(stdout.buffer.getvalue(), expected)
            build.assert_called_once_with(_candidate_consumer=mock.ANY)

            with mock.patch.object(
                SUBJECT,
                "build_strength_first_selection_evaluator_registry_candidate",
            ) as forbidden:
                self.assertEqual(SUBJECT.main(["--registry", "/tmp/other"]), 2)
            forbidden.assert_not_called()


if __name__ == "__main__":
    unittest.main()
