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

import halfkp81_depth18_strength_protocol as SELECTION_PROTOCOL  # noqa: E402
import halfkp81_depth18_yaneura_only_v1_protocol as PROTOCOL  # noqa: E402
import publish_halfkp81_depth18_yaneura_only_v1_plan as PUBLISHER  # noqa: E402


NEW_REVISION = "a" * 40
TRACKED_PLAN = ML_DIR / "halfkp81-hard-depth18-yaneura-only-v1-plan.json"


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


def _canonical(value: dict) -> bytes:
    return PROTOCOL.canonical_json_bytes(value)


def _failed_v3r3_artifacts(*, teacher_rows: int = 1_948) -> dict[str, bytes]:
    failed = PROTOCOL.EXPECTED_FAILED_V3R3
    plan = {
        "schema": failed["teacher_plan"]["schema"],
        "status": "sealed-not-executed",
        "source_revision": failed["source_revision"],
    }
    header = {
        "schema": failed["work_ledger"]["schema"],
        "kind": "header",
        "run_fingerprint": failed["run_fingerprint"],
        "teacher_plan": copy.deepcopy(failed["teacher_plan"]),
    }
    per_parent = [12] * 162
    per_parent[-1] += teacher_rows - sum(per_parent)
    parents = [
        {
            "schema": failed["work_ledger"]["schema"],
            "kind": "parent",
            "run_fingerprint": failed["run_fingerprint"],
            "teacher_entry": {"records": [{}] * count},
        }
        for count in per_parent
    ]
    milestone = {
        "schema": failed["milestone_100"]["schema"],
        "status": failed["milestone_100"]["status"],
        "run_fingerprint": failed["run_fingerprint"],
        "target_parents": 100,
        "completed_rows": 1_198,
        "technical_faults": 0,
        "authority": {
            "may_train": False,
            "may_write_live_weights": False,
        },
    }
    fault = {
        "schema": failed["terminal_fault"]["schema"],
        "status": failed["terminal_fault"]["status"],
        "run_fingerprint": failed["run_fingerprint"],
        "completed_parents": 162,
        "incomplete_parents": 8_030,
        "technical_faults": 1,
        "message": failed["terminal_fault"]["message"],
        "teacher_plan": copy.deepcopy(failed["teacher_plan"]),
        "authority": {
            "may_resume_same_family": False,
            "may_train": False,
            "may_write_live_weights": False,
        },
    }
    return {
        "failed v3r3 tracked preregistration": (
            ML_DIR / "halfkp81-hard-depth18-bounded-stable-v3r3-plan.json"
        ).read_bytes(),
        "failed v3r3 teacher plan": _canonical(plan),
        "failed v3r3 work ledger": b"".join(
            _canonical(value) for value in (header, *parents)
        ),
        "failed v3r3 milestone 100": _canonical(milestone),
        "failed v3r3 terminal fault": _canonical(fault),
        "failed v3r3 launch plist": b"plist",
        "failed v3r3 stderr": b"stderr",
        "failed v3r3 stdout": b"",
    }


class PublishYaneuraOnlyV1PlanTests(unittest.TestCase):
    def test_build_authenticates_boundary_and_rechecks_main(self) -> None:
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
                PUBLISHER, "_verify_failed_v3r3_artifacts"
            ) as predecessor,
            mock.patch.object(
                PUBLISHER, "_verify_failed_v3r3_quiescent"
            ) as quiescent,
            mock.patch.object(PUBLISHER, "_verify_engine_assets") as engine,
            mock.patch.object(PUBLISHER, "_verify_live_baseline") as live,
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
        predecessor.assert_called_once()
        quiescent.assert_called_once()
        engine.assert_called_once()
        live.assert_called_once()
        selection.assert_called_once_with(
            "/tmp/hard-parents.jsonl",
            "/tmp/hard-parents.manifest.json",
            expected_source_revision=NEW_REVISION,
        )
        self.assertEqual(plan["schema"], PROTOCOL.TEACHER_PLAN_SCHEMA)
        self.assertEqual(plan["teacher"], PROTOCOL.EXPECTED_TEACHER)
        self.assertEqual(plan["training"], PROTOCOL.EXPECTED_TRAINING)
        self.assertEqual(plan["downstream_gates"], PROTOCOL.EXPECTED_GATES)
        self.assertEqual(
            plan["predecessor_v3r3"]["work_ledger"]["teacher_rows"], 1_948
        )

    def test_v3r3_verifier_accounts_exact_162_parents_and_1948_rows(
        self,
    ) -> None:
        artifacts = _failed_v3r3_artifacts()
        with (
            mock.patch.object(PUBLISHER, "_verify_exact_directory_entries"),
            mock.patch.object(
                PUBLISHER,
                "_verify_declared_file",
                side_effect=lambda _declared, *, repo_root, label: artifacts[
                    label
                ],
            ),
            mock.patch.object(PUBLISHER.V3R3, "validate_plan_document"),
            mock.patch.object(PUBLISHER.V3R3, "validate_teacher_plan"),
        ):
            PUBLISHER._verify_failed_v3r3_artifacts(Path("/tmp/repo"))

        artifacts = _failed_v3r3_artifacts(teacher_rows=1_947)
        with (
            mock.patch.object(PUBLISHER, "_verify_exact_directory_entries"),
            mock.patch.object(
                PUBLISHER,
                "_verify_declared_file",
                side_effect=lambda _declared, *, repo_root, label: artifacts[
                    label
                ],
            ),
            mock.patch.object(PUBLISHER.V3R3, "validate_plan_document"),
            mock.patch.object(PUBLISHER.V3R3, "validate_teacher_plan"),
        ):
            with self.assertRaisesRegex(
                PUBLISHER.YaneuraOnlyV1PublicationError,
                "teacher rows differ",
            ):
                PUBLISHER._verify_failed_v3r3_artifacts(Path("/tmp/repo"))

    def test_failed_revision_is_rejected_before_git(self) -> None:
        with mock.patch.object(
            PUBLISHER.BASE_PUBLISHER, "_verify_merged_revision"
        ) as base:
            with self.assertRaisesRegex(
                PUBLISHER.YaneuraOnlyV1PublicationError,
                "failed v3r3 source revision is forbidden",
            ):
                PUBLISHER._verify_merged_revision(
                    PROTOCOL.FAILED_V3R3_REVISION, Path("/tmp/repo")
                )
        base.assert_not_called()

    def test_failed_namespace_must_have_exact_four_artifacts(self) -> None:
        expected = PROTOCOL.EXPECTED_FAILED_V3R3[
            "formal_namespace"
        ]["exact_entries"]
        with (
            mock.patch.object(
                Path, "lstat", return_value=mock.Mock(st_mode=0o040700)
            ),
            mock.patch.object(
                Path,
                "iterdir",
                return_value=iter(Path("/formal") / name for name in expected),
            ),
        ):
            PUBLISHER._verify_exact_directory_entries(Path("/formal"), expected)
        with (
            mock.patch.object(
                Path, "lstat", return_value=mock.Mock(st_mode=0o040700)
            ),
            mock.patch.object(
                Path,
                "iterdir",
                return_value=iter(
                    [
                        *(Path("/formal") / name for name in expected),
                        Path("/formal/fit.jsonl"),
                    ]
                ),
            ),
        ):
            with self.assertRaisesRegex(
                PUBLISHER.YaneuraOnlyV1PublicationError,
                "entries differ",
            ):
                PUBLISHER._verify_exact_directory_entries(
                    Path("/formal"), expected
                )

    def test_quiescent_gate_rejects_service_or_process(self) -> None:
        absent = subprocess.CompletedProcess([], 1, "", "")
        present = subprocess.CompletedProcess([], 0, "123\n", "")
        with mock.patch.object(
            subprocess, "run", side_effect=[absent, absent]
        ):
            PUBLISHER._verify_failed_v3r3_quiescent()
        with mock.patch.object(
            subprocess, "run", side_effect=[present, absent]
        ):
            with self.assertRaisesRegex(
                PUBLISHER.YaneuraOnlyV1PublicationError,
                "service is still present",
            ):
                PUBLISHER._verify_failed_v3r3_quiescent()
        with mock.patch.object(
            subprocess, "run", side_effect=[absent, present]
        ):
            with self.assertRaisesRegex(
                PUBLISHER.YaneuraOnlyV1PublicationError,
                "process is still present",
            ):
                PUBLISHER._verify_failed_v3r3_quiescent()

    def test_publish_is_create_only_and_schema_bound(self) -> None:
        valid = {
            "schema": PROTOCOL.TEACHER_PLAN_SCHEMA,
            "outputs": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_OUTPUTS),
        }
        with mock.patch.object(
            PUBLISHER.BASE_PUBLISHER,
            "publish_teacher_plan",
            return_value={
                "path": PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["plan_json"],
                "bytes": 123,
                "sha256": "b" * 64,
            },
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
                    PUBLISHER.YaneuraOnlyV1PublicationError
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
