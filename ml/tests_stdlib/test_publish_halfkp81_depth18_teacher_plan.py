from __future__ import annotations

import copy
import hashlib
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import halfkp81_depth18_strength_protocol as PROTOCOL  # noqa: E402
import publish_halfkp81_depth18_teacher_plan as PUBLISHER  # noqa: E402


SOURCE_REVISION = "b" * 40


def _selection_evidence() -> PROTOCOL.AuthenticatedSelectionEvidence:
    return PROTOCOL.AuthenticatedSelectionEvidence(
        {
            "schema": PROTOCOL.SELECTION_EVIDENCE_SCHEMA,
            "status": "authenticated-selection-complete-teacher-plan-eligible",
            "source_revision": SOURCE_REVISION,
            "selection_jsonl": {
                "path": PROTOCOL.EXPECTED_REUSED_SELECTION["jsonl"]["path"],
                "bytes": PROTOCOL.EXPECTED_REUSED_SELECTION["jsonl"]["bytes"],
                "sha256": PROTOCOL.EXPECTED_REUSED_SELECTION["jsonl"]["sha256"],
                "held_read_only_descriptor": True,
                "stable_double_read": True,
                "rows": 8_192,
                "schema": PROTOCOL.SELECTION_ROW_SCHEMA,
            },
            "selection_manifest": {
                "path": PROTOCOL.EXPECTED_REUSED_SELECTION["manifest"]["path"],
                "bytes": PROTOCOL.EXPECTED_REUSED_SELECTION["manifest"]["bytes"],
                "sha256": PROTOCOL.EXPECTED_REUSED_SELECTION["manifest"]["sha256"],
                "held_read_only_descriptor": True,
                "stable_double_read": True,
                "schema": PROTOCOL.SELECTION_MANIFEST_SCHEMA,
            },
            "phase_name_map": copy.deepcopy(PROTOCOL.PHASE_PLAN_TO_SELECTION),
            "accounting": {
                "phase_side_counts": {
                    PROTOCOL.PHASE_PLAN_TO_SELECTION[name]: counts
                    for name, counts in PROTOCOL.EXPECTED_PHASE_SIDE_COUNTS.items()
                },
                "role_side_counts": copy.deepcopy(PROTOCOL.EXPECTED_ROLE_SIDE_COUNTS),
                "unique_game_ids": 8_192,
                "unique_position_ids": 8_192,
                "cross_role_game_id_overlap": 0,
                "role_sets": {},
            },
            "bindings": {},
            "verification": {
                "held_descriptor_double_read": True,
                "canonical_8192_rows": True,
                "phase_side_quotas": True,
                "role_side_quotas": True,
                "one_game_one_position": True,
                "cross_role_game_overlap_zero": True,
                "source_overlap_legal_bindings": True,
            },
        }
    )


def _plan(directory: Path) -> dict:
    evidence = _selection_evidence()
    manifest = evidence.document["selection_manifest"]
    value = {
        "schema": PROTOCOL.TEACHER_PLAN_SCHEMA,
        "status": "sealed-not-executed",
        "source_revision": SOURCE_REVISION,
        "preregistration": copy.deepcopy(PROTOCOL.EXPECTED_PREREGISTRATION_IDENTITY),
        "technical_recovery": copy.deepcopy(
            PROTOCOL.EXPECTED_TECHNICAL_RECOVERY_IDENTITY
        ),
        "selection_manifest": {
            key: manifest[key] for key in ("path", "bytes", "sha256", "schema")
        },
        "selection_evidence": copy.deepcopy(dict(evidence.document)),
        "selection_roles": copy.deepcopy(PROTOCOL.EXPECTED_ROLE_COUNTS),
        "engine": copy.deepcopy(PROTOCOL.EXPECTED_ENGINE),
        "teacher": copy.deepcopy(PROTOCOL.EXPECTED_TEACHER),
        "outputs": {
            "directory": str(directory),
            "plan_json": str(directory / "teacher-plan.json"),
            "fit_jsonl": str(directory / "fit.jsonl"),
            "tune_jsonl": str(directory / "tune.jsonl"),
            "sealed_jsonl": str(directory / "sealed.jsonl"),
            "work_jsonl": str(directory / "teacher-work.jsonl"),
            "milestone_100_json": str(directory / "teacher-milestone-100.json"),
            "milestone_500_json": str(directory / "teacher-milestone-500.json"),
            "terminal_fault_json": str(directory / "teacher-terminal-fault.json"),
            "receipt_json": str(directory / "teacher-receipt.json"),
            "verified_artifact_receipt_json": str(
                directory / "teacher-verified-artifact-receipt.json"
            ),
        },
        "authority": {
            "may_execute_teacher": True,
            "may_train": False,
            "may_play_formal_games": False,
            "may_write_live_weights": False,
        },
    }
    return value


class PublishHalfkp81Depth18TeacherPlanTests(unittest.TestCase):
    def _build(self) -> dict:
        with (
            mock.patch.object(PUBLISHER, "_verify_merged_revision") as revision,
            mock.patch.object(PUBLISHER, "_verify_preregistration") as prereg,
            mock.patch.object(PUBLISHER, "_verify_technical_recovery") as recovery,
            mock.patch.object(PUBLISHER, "_verify_engine_assets") as engine,
            mock.patch.object(
                PUBLISHER,
                "_canonical_output_directory",
                return_value=Path(PROTOCOL.EXPECTED_RECOVERY_OUTPUT_DIRECTORY),
            ),
            mock.patch.object(
                PROTOCOL,
                "authenticate_selection_artifacts",
                return_value=_selection_evidence(),
            ) as authenticate,
        ):
            plan = PUBLISHER.build_teacher_plan(
                selection_jsonl_path="/tmp/selection.jsonl",
                selection_manifest_path="/tmp/selection.manifest.json",
                expected_merged_revision=SOURCE_REVISION,
                output_directory=PROTOCOL.EXPECTED_RECOVERY_OUTPUT_DIRECTORY,
            )
        self.assertEqual(revision.call_count, 2)
        prereg.assert_called_once()
        recovery.assert_called_once()
        engine.assert_called_once()
        authenticate.assert_called_once_with(
            "/tmp/selection.jsonl",
            "/tmp/selection.manifest.json",
            expected_source_revision=SOURCE_REVISION,
        )
        return plan

    def test_merged_revision_requires_exact_clean_head_and_origin_main(self) -> None:
        completed = [
            mock.Mock(stdout=f"{SOURCE_REVISION}\n"),
            mock.Mock(stdout=f"{SOURCE_REVISION}\n"),
            mock.Mock(stdout=""),
        ]
        with mock.patch.object(
            PUBLISHER.subprocess, "run", side_effect=completed
        ) as run:
            PUBLISHER._verify_merged_revision(SOURCE_REVISION, Path("/tmp/repo"))
        self.assertEqual(run.call_count, 3)
        for call in run.call_args_list:
            self.assertEqual(
                call.kwargs["env"],
                {
                    "LANG": "C",
                    "LC_ALL": "C",
                    "PATH": "/usr/bin:/bin",
                    "TZ": "UTC",
                },
            )
            self.assertEqual(call.args[0][0], "/usr/bin/git")

        for label, outputs, message in (
            (
                "head",
                ["a" * 40 + "\n", SOURCE_REVISION + "\n", ""],
                "clean HEAD and origin/main",
            ),
            (
                "origin-main",
                [SOURCE_REVISION + "\n", "a" * 40 + "\n", ""],
                "clean HEAD and origin/main",
            ),
            (
                "dirty",
                [
                    SOURCE_REVISION + "\n",
                    SOURCE_REVISION + "\n",
                    " M ml/file.py\n",
                ],
                "not clean",
            ),
        ):
            with self.subTest(label=label), mock.patch.object(
                PUBLISHER.subprocess,
                "run",
                side_effect=[mock.Mock(stdout=value) for value in outputs],
            ):
                with self.assertRaisesRegex(
                    PUBLISHER.TeacherPlanPublicationError, message
                ):
                    PUBLISHER._verify_merged_revision(
                        SOURCE_REVISION, Path("/tmp/repo")
                    )

    def test_source_revision_is_rechecked_after_selection_authentication(self) -> None:
        with tempfile.TemporaryDirectory():
            with (
                mock.patch.object(
                    PUBLISHER,
                    "_verify_merged_revision",
                    side_effect=[
                        None,
                        PUBLISHER.TeacherPlanPublicationError(
                            "source checkout is not clean"
                        ),
                    ],
                ) as revision,
                mock.patch.object(PUBLISHER, "_verify_preregistration"),
                mock.patch.object(PUBLISHER, "_verify_technical_recovery"),
                mock.patch.object(PUBLISHER, "_verify_engine_assets"),
                mock.patch.object(
                    PUBLISHER,
                    "_canonical_output_directory",
                    return_value=Path(PROTOCOL.EXPECTED_RECOVERY_OUTPUT_DIRECTORY),
                ),
                mock.patch.object(
                    PROTOCOL,
                    "authenticate_selection_artifacts",
                    return_value=_selection_evidence(),
                ),
            ):
                with self.assertRaisesRegex(
                    PUBLISHER.TeacherPlanPublicationError, "not clean"
                ):
                    PUBLISHER.build_teacher_plan(
                        selection_jsonl_path="/tmp/selection.jsonl",
                        selection_manifest_path="/tmp/selection.manifest.json",
                        expected_merged_revision=SOURCE_REVISION,
                        output_directory=PROTOCOL.EXPECTED_RECOVERY_OUTPUT_DIRECTORY,
                    )
            self.assertEqual(revision.call_count, 2)

    def test_builds_and_publishes_only_canonical_teacher_plan(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "formal"
            built = self._build()
            self.assertEqual(built["outputs"], PROTOCOL.EXPECTED_RECOVERY_OUTPUTS)
            plan = _plan(directory)
            identity = PUBLISHER.publish_teacher_plan(
                plan, output_directory=str(directory)
            )
            expected_raw = PROTOCOL.canonical_json_bytes(plan)
            self.assertEqual(
                (directory / "teacher-plan.json").read_bytes(), expected_raw
            )
            self.assertEqual(identity["bytes"], len(expected_raw))
            self.assertEqual(
                identity["sha256"], hashlib.sha256(expected_raw).hexdigest()
            )
            self.assertEqual(
                sorted(path.name for path in directory.iterdir()),
                ["teacher-plan.json"],
            )

    def test_rejects_wrong_revision_before_authentication(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with mock.patch.object(
                PROTOCOL, "authenticate_selection_artifacts"
            ) as authenticate:
                with self.assertRaisesRegex(
                    PUBLISHER.TeacherPlanPublicationError, "revision is invalid"
                ):
                    PUBLISHER.build_teacher_plan(
                        selection_jsonl_path="/tmp/selection.jsonl",
                        selection_manifest_path="/tmp/selection.manifest.json",
                        expected_merged_revision="not-a-revision",
                        output_directory=str(Path(temporary) / "formal"),
                    )
            authenticate.assert_not_called()

    def test_rejects_fixed_identity_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with (
                mock.patch.object(PUBLISHER, "_verify_merged_revision"),
                mock.patch.object(
                    PUBLISHER,
                    "_verify_preregistration",
                    side_effect=PUBLISHER.TeacherPlanPublicationError(
                        "tracked preregistration differs from fixed bytes/SHA-256"
                    ),
                ),
                mock.patch.object(
                    PROTOCOL, "authenticate_selection_artifacts"
                ) as authenticate,
            ):
                with self.assertRaisesRegex(
                    PUBLISHER.TeacherPlanPublicationError, "fixed bytes/SHA-256"
                ):
                    PUBLISHER.build_teacher_plan(
                        selection_jsonl_path="/tmp/selection.jsonl",
                        selection_manifest_path="/tmp/selection.manifest.json",
                        expected_merged_revision=SOURCE_REVISION,
                        output_directory=str(Path(temporary) / "formal"),
                    )
            authenticate.assert_not_called()

    def test_rejects_selection_manifest_drift(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with (
                mock.patch.object(PUBLISHER, "_verify_merged_revision"),
                mock.patch.object(PUBLISHER, "_verify_preregistration"),
                mock.patch.object(PUBLISHER, "_verify_engine_assets"),
                mock.patch.object(
                    PROTOCOL,
                    "authenticate_selection_artifacts",
                    side_effect=PROTOCOL.Halfkp81Depth18StrengthError(
                        "selection output identity differs"
                    ),
                ),
            ):
                with self.assertRaisesRegex(
                    PROTOCOL.Halfkp81Depth18StrengthError,
                    "selection output identity differs",
                ):
                    PUBLISHER.build_teacher_plan(
                        selection_jsonl_path="/tmp/selection.jsonl",
                        selection_manifest_path="/tmp/selection.manifest.json",
                        expected_merged_revision=SOURCE_REVISION,
                        output_directory=str(Path(temporary) / "formal"),
                    )

    def test_existing_file_and_symlink_are_never_replaced(self) -> None:
        for kind in ("file", "symlink"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary)
                destination = directory / "teacher-plan.json"
                if kind == "file":
                    destination.write_bytes(b"existing\n")
                else:
                    target = directory / "target"
                    target.write_bytes(b"target\n")
                    destination.symlink_to(target)
                before = destination.lstat()
                with self.assertRaisesRegex(
                    PUBLISHER.TeacherPlanPublicationError,
                    "reserved output already exists",
                ):
                    PUBLISHER.publish_teacher_plan(
                        _plan(directory), output_directory=str(directory)
                    )
                after = destination.lstat()
                self.assertEqual(
                    (before.st_dev, before.st_ino), (after.st_dev, after.st_ino)
                )

    def test_destination_race_fails_without_replacing_racer(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            real_link = os.link

            def racing_link(src, dst, *args, **kwargs):
                directory_fd = kwargs["dst_dir_fd"]
                fd = os.open(
                    dst,
                    os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                    0o600,
                    dir_fd=directory_fd,
                )
                os.write(fd, b"racer\n")
                os.close(fd)
                return real_link(src, dst, *args, **kwargs)

            with mock.patch.object(PUBLISHER.os, "link", side_effect=racing_link):
                with self.assertRaisesRegex(
                    PUBLISHER.TeacherPlanPublicationError,
                    "destination appeared",
                ):
                    PUBLISHER.publish_teacher_plan(
                        _plan(directory), output_directory=str(directory)
                    )
            self.assertEqual((directory / "teacher-plan.json").read_bytes(), b"racer\n")
            self.assertFalse(
                any(path.name.endswith(".tmp") for path in directory.iterdir())
            )

    def test_post_link_failure_rolls_back_only_own_plan(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            with mock.patch.object(
                PUBLISHER,
                "_verify_published_file",
                side_effect=[
                    PUBLISHER.TeacherPlanPublicationError("injected verification"),
                    None,
                ],
            ):
                with self.assertRaisesRegex(
                    PUBLISHER.TeacherPlanPublicationError,
                    "injected verification",
                ):
                    PUBLISHER.publish_teacher_plan(
                        _plan(directory), output_directory=str(directory)
                    )
            self.assertFalse((directory / "teacher-plan.json").exists())
            self.assertEqual(list(directory.iterdir()), [])

    def test_replacement_race_is_detected_and_replacement_is_not_deleted(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            real_verify = PUBLISHER._verify_published_file
            replaced = False

            def replace_before_verify(**kwargs):
                nonlocal replaced
                if not replaced:
                    destination = directory / "teacher-plan.json"
                    destination.unlink()
                    destination.write_bytes(b"replacement\n")
                    replaced = True
                return real_verify(**kwargs)

            with mock.patch.object(
                PUBLISHER,
                "_verify_published_file",
                side_effect=replace_before_verify,
            ):
                with self.assertRaisesRegex(
                    PUBLISHER.TeacherPlanPublicationError,
                    "rollback was unsafe",
                ):
                    PUBLISHER.publish_teacher_plan(
                        _plan(directory), output_directory=str(directory)
                    )
            self.assertEqual(
                (directory / "teacher-plan.json").read_bytes(),
                b"replacement\n",
            )
            self.assertFalse(
                any(path.name.endswith(".tmp") for path in directory.iterdir())
            )


if __name__ == "__main__":
    unittest.main()
