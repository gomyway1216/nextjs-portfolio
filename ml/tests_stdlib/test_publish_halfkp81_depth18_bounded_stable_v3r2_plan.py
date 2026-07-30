from __future__ import annotations

import copy
from pathlib import Path
import subprocess
import sys
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import halfkp81_depth18_bounded_stable_v3r2_protocol as PROTOCOL  # noqa: E402
import halfkp81_depth18_strength_protocol as SELECTION_PROTOCOL  # noqa: E402
import publish_halfkp81_depth18_bounded_stable_v3r2_plan as PUBLISHER  # noqa: E402


NEW_REVISION = "a" * 40
TRACKED_PLAN = (
    ML_DIR / "halfkp81-hard-depth18-bounded-stable-v3r2-plan.json"
)


def _selection_evidence() -> SELECTION_PROTOCOL.AuthenticatedSelectionEvidence:
    return SELECTION_PROTOCOL.AuthenticatedSelectionEvidence(
        {
            "schema": (
                "shogi-halfkp81-depth18-authenticated-selection-evidence-v1"
            ),
            "status": "authenticated-selection-complete-teacher-plan-eligible",
            "source_revision": NEW_REVISION,
            "selection_jsonl": {
                **copy.deepcopy(PROTOCOL.EXPECTED_REUSED_SELECTION["jsonl"]),
                "held_read_only_descriptor": True,
                "stable_double_read": True,
            },
            "selection_manifest": {
                **copy.deepcopy(
                    PROTOCOL.EXPECTED_REUSED_SELECTION["manifest"]
                ),
                "held_read_only_descriptor": True,
                "stable_double_read": True,
            },
            "phase_name_map": {},
            "accounting": {},
            "bindings": {},
            "verification": {},
        }
    )


class PublishBoundedStableV3R2PlanTests(unittest.TestCase):
    def test_tracked_verifier_accepts_exact_pretty_bytes_without_canonical_gate(
        self,
    ) -> None:
        raw = TRACKED_PLAN.read_bytes()
        with mock.patch.object(
            PUBLISHER,
            "_verify_declared_file",
            return_value=raw,
        ):
            plan = PUBLISHER._verify_tracked_preregistration(Path("/repo"))
        self.assertEqual(plan["schema"], PROTOCOL.PLAN_SCHEMA)
        self.assertNotEqual(PROTOCOL.canonical_json_bytes(plan), raw)

    def test_build_authenticates_recovery_and_rechecks_clean_main(self) -> None:
        preregistration = PROTOCOL.validate_tracked_plan_file(TRACKED_PLAN)
        evidence = _selection_evidence()
        with (
            mock.patch.object(PUBLISHER, "_verify_merged_revision") as revision,
            mock.patch.object(
                PUBLISHER,
                "_verify_tracked_preregistration",
                return_value=preregistration,
            ) as prereg,
            mock.patch.object(
                PUBLISHER, "_verify_v3_strength_contract"
            ) as strength,
            mock.patch.object(
                PUBLISHER, "_verify_failed_v3_artifacts"
            ) as predecessor,
            mock.patch.object(
                PUBLISHER, "_verify_failed_v3_quiescent"
            ) as quiescent,
            mock.patch.object(PUBLISHER, "_verify_engine_assets") as engine,
            mock.patch.object(
                SELECTION_PROTOCOL,
                "authenticate_selection_artifacts",
                return_value=evidence,
            ) as selection,
            mock.patch.object(
                PUBLISHER.BASE_PUBLISHER,
                "_canonical_output_directory",
                return_value=Path(
                    PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]
                ),
            ),
        ):
            plan = PUBLISHER.build_teacher_plan(
                selection_jsonl_path="/tmp/hard-parents.jsonl",
                selection_manifest_path="/tmp/hard-parents.manifest.json",
                expected_merged_revision=NEW_REVISION,
                output_directory=PROTOCOL.EXPECTED_RUNTIME_OUTPUTS[
                    "directory"
                ],
            )
        self.assertEqual(revision.call_count, 2)
        prereg.assert_called_once()
        strength.assert_called_once()
        predecessor.assert_called_once()
        quiescent.assert_called_once()
        engine.assert_called_once()
        selection.assert_called_once_with(
            "/tmp/hard-parents.jsonl",
            "/tmp/hard-parents.manifest.json",
            expected_source_revision=NEW_REVISION,
        )
        self.assertEqual(plan["schema"], PROTOCOL.TEACHER_PLAN_SCHEMA)
        self.assertEqual(plan["predecessor_v3"]["teacher_rows"], 0)
        self.assertEqual(
            plan["teacher"], PROTOCOL.EXPECTED_TEACHER
        )

    def test_failed_revision_is_rejected_before_git(self) -> None:
        with mock.patch.object(
            PUBLISHER.BASE_PUBLISHER, "_verify_merged_revision"
        ) as base:
            with self.assertRaisesRegex(
                PUBLISHER.BoundedStableV3R2PublicationError,
                "failed v3 source revision is forbidden",
            ):
                PUBLISHER._verify_merged_revision(
                    PROTOCOL.FAILED_V3_REVISION, Path("/tmp/repo")
                )
        base.assert_not_called()

    def test_failed_namespace_must_contain_only_teacher_plan(self) -> None:
        with (
            mock.patch.object(
                Path,
                "lstat",
                return_value=mock.Mock(st_mode=0o040700),
            ),
            mock.patch.object(
                Path,
                "iterdir",
                return_value=iter([Path("/formal/teacher-plan.json")]),
            ),
        ):
            PUBLISHER._verify_exact_directory_entries(
                Path("/formal"), ["teacher-plan.json"]
            )
        with (
            mock.patch.object(
                Path,
                "lstat",
                return_value=mock.Mock(st_mode=0o040700),
            ),
            mock.patch.object(
                Path,
                "iterdir",
                return_value=iter(
                    [
                        Path("/formal/teacher-plan.json"),
                        Path("/formal/teacher-work.jsonl"),
                    ]
                ),
            ),
        ):
            with self.assertRaisesRegex(
                PUBLISHER.BoundedStableV3R2PublicationError,
                "entries differ",
            ):
                PUBLISHER._verify_exact_directory_entries(
                    Path("/formal"), ["teacher-plan.json"]
                )

    def test_quiescent_gate_rejects_service_or_process(self) -> None:
        absent = subprocess.CompletedProcess([], 1, "", "")
        present = subprocess.CompletedProcess([], 0, "123\n", "")
        with mock.patch.object(
            subprocess, "run", side_effect=[absent, absent]
        ):
            PUBLISHER._verify_failed_v3_quiescent()
        with mock.patch.object(
            subprocess, "run", side_effect=[present, absent]
        ):
            with self.assertRaisesRegex(
                PUBLISHER.BoundedStableV3R2PublicationError,
                "service is still present",
            ):
                PUBLISHER._verify_failed_v3_quiescent()
        with mock.patch.object(
            subprocess, "run", side_effect=[absent, present]
        ):
            with self.assertRaisesRegex(
                PUBLISHER.BoundedStableV3R2PublicationError,
                "process is still present",
            ):
                PUBLISHER._verify_failed_v3_quiescent()

    def test_publish_is_create_only_and_schema_bound(self) -> None:
        valid = {
            "schema": PROTOCOL.TEACHER_PLAN_SCHEMA,
            "outputs": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_OUTPUTS),
        }
        base_identity = {
            "path": PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["plan_json"],
            "bytes": 123,
            "sha256": "b" * 64,
            "schema": "old",
        }
        with mock.patch.object(
            PUBLISHER.BASE_PUBLISHER,
            "publish_teacher_plan",
            return_value=base_identity,
        ) as publish:
            identity = PUBLISHER.publish_teacher_plan(
                valid,
                output_directory=PROTOCOL.EXPECTED_RUNTIME_OUTPUTS[
                    "directory"
                ],
            )
        publish.assert_called_once()
        self.assertEqual(identity["schema"], PROTOCOL.TEACHER_PLAN_SCHEMA)

        with mock.patch.object(
            PUBLISHER.BASE_PUBLISHER, "publish_teacher_plan"
        ) as publish:
            for plan in (
                {**valid, "schema": "changed"},
                {
                    **valid,
                    "outputs": {
                        **valid["outputs"],
                        "plan_json": "/tmp/teacher-plan.json",
                    },
                },
            ):
                with self.assertRaises(
                    PUBLISHER.BoundedStableV3R2PublicationError
                ):
                    PUBLISHER.publish_teacher_plan(
                        plan,
                        output_directory=PROTOCOL.EXPECTED_RUNTIME_OUTPUTS[
                            "directory"
                        ],
                    )
        publish.assert_not_called()


if __name__ == "__main__":
    unittest.main()
