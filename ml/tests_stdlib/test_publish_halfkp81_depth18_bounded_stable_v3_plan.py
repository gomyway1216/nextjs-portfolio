from __future__ import annotations

import copy
from pathlib import Path
import sys
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import halfkp81_depth18_bounded_stable_v3_protocol as PROTOCOL  # noqa: E402
import halfkp81_depth18_strength_protocol as SELECTION_PROTOCOL  # noqa: E402
import publish_halfkp81_depth18_bounded_stable_v3_plan as PUBLISHER  # noqa: E402


NEW_REVISION = "a" * 40
TRACKED_PLAN = ML_DIR / "halfkp81-hard-depth18-bounded-stable-v3-plan.json"


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
                **copy.deepcopy(PROTOCOL.EXPECTED_REUSED_SELECTION["manifest"]),
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


def _predecessor_artifacts(*, teacher_rows: int = 585) -> dict[str, bytes]:
    predecessor = PROTOCOL.EXPECTED_PREDECESSOR_V2
    plan = {
        "schema": predecessor["teacher_plan"]["schema"],
        "status": "sealed-not-executed",
        "source_revision": predecessor["source_revision"],
        "authority": {"may_write_live_weights": False},
    }
    header = {
        "schema": predecessor["work_ledger"]["schema"],
        "kind": "header",
        "run_fingerprint": predecessor["run_fingerprint"],
        "teacher_plan": copy.deepcopy(predecessor["teacher_plan"]),
    }
    per_parent = [12] * 49
    per_parent[-1] += teacher_rows - sum(per_parent)
    parents = [
        {
            "schema": predecessor["work_ledger"]["schema"],
            "kind": "parent",
            "run_fingerprint": predecessor["run_fingerprint"],
            "teacher_entry": {"records": [{}] * count},
        }
        for count in per_parent
    ]
    fault = {
        "schema": predecessor["terminal_fault"]["schema"],
        "status": predecessor["terminal_fault"]["status"],
        "run_fingerprint": predecessor["run_fingerprint"],
        "completed_parents": 49,
        "incomplete_parents": 8_143,
        "technical_faults": 1,
        "teacher_plan": copy.deepcopy(predecessor["teacher_plan"]),
        "authority": {
            "may_resume_same_family": False,
            "may_train": False,
            "may_write_live_weights": False,
        },
    }
    return {
        "v2 teacher plan": _canonical(plan),
        "v2 teacher work ledger": b"".join(
            _canonical(value) for value in (header, *parents)
        ),
        "v2 terminal fault": _canonical(fault),
    }


class PublishBoundedStableV3PlanTests(unittest.TestCase):
    def test_build_authenticates_all_inputs_and_rechecks_clean_main(self) -> None:
        preregistration = PROTOCOL.validate_tracked_plan_file(TRACKED_PLAN)
        evidence = _selection_evidence()
        with (
            mock.patch.object(PUBLISHER, "_verify_merged_revision") as revision,
            mock.patch.object(
                PUBLISHER,
                "_verify_tracked_preregistration",
                return_value=preregistration,
            ) as prereg,
            mock.patch.object(PUBLISHER, "_verify_predecessor_v2") as predecessor,
            mock.patch.object(PUBLISHER, "_verify_engine_assets") as engine,
            mock.patch.object(
                SELECTION_PROTOCOL,
                "authenticate_selection_artifacts",
                return_value=evidence,
            ) as selection,
            mock.patch.object(
                PUBLISHER.BASE_PUBLISHER,
                "_canonical_output_directory",
                return_value=Path(PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]),
            ),
        ):
            plan = PUBLISHER.build_teacher_plan(
                selection_jsonl_path="/tmp/hard-parents.jsonl",
                selection_manifest_path="/tmp/hard-parents.manifest.json",
                expected_merged_revision=NEW_REVISION,
                output_directory=PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"],
            )
        self.assertEqual(revision.call_count, 2)
        prereg.assert_called_once()
        predecessor.assert_called_once()
        engine.assert_called_once()
        selection.assert_called_once_with(
            "/tmp/hard-parents.jsonl",
            "/tmp/hard-parents.manifest.json",
            expected_source_revision=NEW_REVISION,
        )
        self.assertEqual(plan["schema"], PROTOCOL.TEACHER_PLAN_SCHEMA)
        self.assertEqual(plan["predecessor_v2"]["reuse_teacher_rows"], 0)
        self.assertEqual(
            plan["teacher"]["candidate_policy"]["stable_depth11"][
                "budget_milliseconds"
            ],
            20_000,
        )

    def test_predecessor_verifier_accounts_for_exact_49_parents_and_585_rows(
        self,
    ) -> None:
        artifacts = _predecessor_artifacts()
        with mock.patch.object(
            PUBLISHER,
            "_verify_declared_file",
            side_effect=lambda _declared, *, repo_root, label: artifacts[label],
        ):
            PUBLISHER._verify_predecessor_v2(Path("/tmp/repo"))

        artifacts = _predecessor_artifacts(teacher_rows=584)
        with mock.patch.object(
            PUBLISHER,
            "_verify_declared_file",
            side_effect=lambda _declared, *, repo_root, label: artifacts[label],
        ):
            with self.assertRaisesRegex(
                PUBLISHER.BoundedStableV3PublicationError, "teacher rows"
            ):
                PUBLISHER._verify_predecessor_v2(Path("/tmp/repo"))

    def test_v2_revision_is_rejected_before_git_or_selection(self) -> None:
        with mock.patch.object(
            PUBLISHER.BASE_PUBLISHER, "_verify_merged_revision"
        ) as base:
            with self.assertRaisesRegex(
                PUBLISHER.BoundedStableV3PublicationError,
                "v2 source revision is forbidden",
            ):
                PUBLISHER._verify_merged_revision(
                    PROTOCOL.PREDECESSOR_REVISION, Path("/tmp/repo")
                )
        base.assert_not_called()

    def test_publish_is_create_only_and_returns_v3_schema(self) -> None:
        plan = {"schema": PROTOCOL.TEACHER_PLAN_SCHEMA}
        plan["outputs"] = copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_OUTPUTS)
        base_identity = {
            "path": PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["plan_json"],
            "bytes": 123,
            "sha256": "b" * 64,
            "schema": "old-schema",
        }
        with mock.patch.object(
            PUBLISHER.BASE_PUBLISHER,
            "publish_teacher_plan",
            return_value=base_identity,
        ) as publish:
            identity = PUBLISHER.publish_teacher_plan(
                plan,
                output_directory=PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"],
            )
        publish.assert_called_once_with(
            plan,
            output_directory=PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"],
        )
        self.assertEqual(identity["schema"], PROTOCOL.TEACHER_PLAN_SCHEMA)

    def test_publish_rejects_namespace_and_schema_drift_before_file_write(
        self,
    ) -> None:
        valid = {
            "schema": PROTOCOL.TEACHER_PLAN_SCHEMA,
            "outputs": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_OUTPUTS),
        }
        cases = {
            "schema": {**valid, "schema": "changed"},
            "outputs": {
                **valid,
                "outputs": {
                    **valid["outputs"],
                    "plan_json": "/tmp/teacher-plan.json",
                },
            },
        }
        with mock.patch.object(
            PUBLISHER.BASE_PUBLISHER, "publish_teacher_plan"
        ) as publish:
            for label, plan in cases.items():
                with self.subTest(label=label):
                    with self.assertRaises(
                        PUBLISHER.BoundedStableV3PublicationError
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
