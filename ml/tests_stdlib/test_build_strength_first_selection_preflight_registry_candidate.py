from __future__ import annotations

import copy
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

import build_strength_first_selection_preflight_registry_candidate as BUILDER  # noqa: E402
import strength_first_qat_selection_preflight as PREFLIGHT  # noqa: E402
from ml.tests_stdlib.test_strength_first_qat_selection_preflight import (  # noqa: E402
    json_bytes,
    synthetic_fixture,
    write_registry,
)


def close_registry(fixture):
    ready = copy.deepcopy(fixture["registry"])
    registry = fixture["registry"]
    registry["status"] = PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_BLOCKED_STATUS
    registry["training_plan"]["bytes"] = None
    registry["training_plan"]["sha256"] = None
    registry["training_pipeline_revision"] = None
    for run in registry["runs"]:
        for name in ("result", "checkpoint"):
            run[name]["bytes"] = None
            run[name]["sha256"] = None
    registry["artifact_identities_registered"] = False
    registry["selection_preflight_ready"] = False
    write_registry(fixture)
    return ready


class StrengthFirstSelectionPreflightRegistryCandidateTests(unittest.TestCase):
    def build(self, fixture, *, reader=None, checkpoint_loader=None):
        events = []

        def load_checkpoint(raw):
            payload = fixture["checkpoint_payloads"][raw]
            events.append(f"load-{payload['args']['seed']}")
            return copy.deepcopy(payload)

        def validate_model(model, seed):
            events.append(f"model-{seed}")
            self.assertEqual(model, {"synthetic_seed": seed})

        candidate = BUILDER.build_strength_first_selection_preflight_registry_candidate(
            repo_root=fixture["root"],
            revision_reader=lambda _root: "b" * 40,
            reader=reader or BUILDER._read_stable_regular_file,
            tracked_verifier=lambda path, revision, _raw: events.append(
                f"tracked-{Path(path).name}-{revision[0]}"
            ),
            checkpoint_loader=checkpoint_loader or load_checkpoint,
            strict_model_validator=validate_model,
        )
        return candidate, events

    def test_closed_registry_builds_exact_ready_candidate_after_three_strict_loads(
        self,
    ):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            expected = close_registry(fixture)
            tracked_before = fixture["registry_path"].read_bytes()
            candidate, events = self.build(fixture)
            self.assertEqual(fixture["registry_path"].read_bytes(), tracked_before)

        self.assertEqual(candidate, expected)
        self.assertTrue(PREFLIGHT._validate_registry(candidate))
        self.assertEqual(
            [event for event in events if event.startswith("load-")],
            ["load-42", "load-43", "load-44"],
        )
        self.assertEqual(
            [event for event in events if event.startswith("model-")],
            ["model-42", "model-43", "model-44"],
        )
        self.assertEqual(
            candidate["training_pipeline_revision"],
            "a" * 40,
        )

    def test_matching_ready_registry_is_idempotently_recomputed(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            expected = copy.deepcopy(fixture["registry"])
            candidate, _events = self.build(fixture)
        self.assertEqual(candidate, expected)

    def test_different_ready_registry_is_not_reconciled_or_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            fixture["registry"]["runs"][0]["checkpoint"]["sha256"] = "f" * 64
            write_registry(fixture)
            with self.assertRaisesRegex(
                BUILDER.StrengthFirstSelectionPreflightRegistryCandidateError,
                "differs from the recomputed",
            ):
                self.build(fixture)

    def test_mixed_training_revisions_stop_before_checkpoint_loading(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            close_registry(fixture)
            registered = fixture["registry"]["runs"][1]
            result_path = fixture["root"] / registered["result"]["path"]
            result = copy.deepcopy(fixture["results"][43])
            result["training_pipeline"]["source_revision"] = "c" * 40
            result_path.write_bytes(json_bytes(result))
            loader = mock.Mock(
                side_effect=AssertionError("checkpoint should not be loaded")
            )
            with self.assertRaisesRegex(
                BUILDER.StrengthFirstSelectionPreflightRegistryCandidateError,
                "do not share one training revision",
            ):
                self.build(fixture, checkpoint_loader=loader)
            loader.assert_not_called()

    def test_missing_or_invalid_checkpoint_emits_no_candidate(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            close_registry(fixture)
            checkpoint = (
                fixture["root"] / fixture["registry"]["runs"][2]["checkpoint"]["path"]
            )
            checkpoint.unlink()
            with self.assertRaisesRegex(
                BUILDER.StrengthFirstSelectionPreflightRegistryCandidateError,
                "absent or unreadable",
            ):
                self.build(fixture)

        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            close_registry(fixture)
            with self.assertRaisesRegex(ValueError, "strict-load"):
                self.build(
                    fixture,
                    checkpoint_loader=lambda _raw: (_ for _ in ()).throw(
                        ValueError("cannot strict-load synthetic checkpoint")
                    ),
                )

    def test_reader_boundary_excludes_selection_holdout_and_live_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            close_registry(fixture)
            reads = []

            def reader(path, label):
                reads.append((Path(path), label))
                return BUILDER._read_stable_regular_file(path, label)

            candidate, _events = self.build(fixture, reader=reader)
            relative_reads = {
                path.relative_to(fixture["root"]).as_posix() for path, _label in reads
            }

        expected = {
            PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_RELATIVE_PATH,
            candidate["training_plan"]["path"],
            *{
                run[name]["path"]
                for run in candidate["runs"]
                for name in ("result", "checkpoint")
            },
        }
        self.assertEqual(relative_reads, expected)
        joined = "\n".join(sorted(relative_reads)).lower()
        self.assertNotIn("fresh-final", joined)
        self.assertNotIn("selection.raw", joined)
        self.assertNotIn("runop1-best", joined)
        self.assertNotIn("live", joined)

    def test_reader_rejects_hard_links_and_open_time_path_substitution(self):
        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / "original"
            hard_link = Path(directory) / "hard-link"
            original.write_bytes(b"original-bytes")
            os.link(original, hard_link)
            with self.assertRaisesRegex(
                BUILDER.StrengthFirstSelectionPreflightRegistryCandidateError,
                "canonical regular file",
            ):
                BUILDER._read_stable_regular_file(str(original), "linked artifact")

        with tempfile.TemporaryDirectory() as directory:
            original = Path(directory) / "original"
            decoy = Path(directory) / "decoy"
            original.write_bytes(b"original-bytes")
            decoy.write_bytes(b"decoy-bytes")
            real_open = os.open
            decoy_descriptor = real_open(decoy, os.O_RDONLY)
            try:
                with (
                    mock.patch.object(
                        BUILDER.os,
                        "open",
                        side_effect=lambda *_args, **_kwargs: os.dup(decoy_descriptor),
                    ),
                    mock.patch.object(
                        BUILDER.os.path,
                        "realpath",
                        side_effect=lambda value: os.path.abspath(value),
                    ),
                    self.assertRaisesRegex(
                        BUILDER.StrengthFirstSelectionPreflightRegistryCandidateError,
                        "changed before it could be read",
                    ),
                ):
                    BUILDER._read_stable_regular_file(
                        str(original),
                        "substituted artifact",
                    )
                self.assertEqual(
                    os.lseek(decoy_descriptor, 0, os.SEEK_CUR),
                    0,
                )
            finally:
                os.close(decoy_descriptor)

    def test_serialization_is_one_ready_json_without_absolute_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            fixture = synthetic_fixture(Path(directory).resolve())
            close_registry(fixture)
            candidate, _events = self.build(fixture)
            raw = (
                BUILDER.serialize_strength_first_selection_preflight_registry_candidate(
                    candidate
                )
            )
            self.assertNotIn(str(fixture["root"]).encode(), raw)

        self.assertTrue(raw.endswith(b"\n"))
        self.assertEqual(raw.count(b"\n"), raw.decode("utf-8").count("\n"))
        self.assertEqual(json.loads(raw), candidate)

    def test_arguments_stop_before_builder(self):
        with mock.patch.object(
            BUILDER,
            "build_strength_first_selection_preflight_registry_candidate",
        ) as build:
            self.assertEqual(BUILDER.main(["unexpected"]), 2)
        build.assert_not_called()


if __name__ == "__main__":
    unittest.main()
