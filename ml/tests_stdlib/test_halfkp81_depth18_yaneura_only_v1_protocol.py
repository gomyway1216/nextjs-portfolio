from __future__ import annotations

import copy
from pathlib import Path
import sys
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import halfkp81_depth18_bounded_stable_v3r3_protocol as V3R3  # noqa: E402
import halfkp81_depth18_yaneura_only_v1_protocol as PROTOCOL  # noqa: E402


TRACKED_PLAN = ML_DIR / "halfkp81-hard-depth18-yaneura-only-v1-plan.json"
NEW_REVISION = "a" * 40


def _selection_evidence() -> dict:
    return {
        "schema": "shogi-halfkp81-depth18-authenticated-selection-evidence-v1",
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


def _teacher_plan() -> dict:
    evidence = _selection_evidence()
    return {
        "authority": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_AUTHORITY),
        "downstream_gates": copy.deepcopy(PROTOCOL.EXPECTED_GATES),
        "engine": copy.deepcopy(PROTOCOL.EXPECTED_ENGINE),
        "outputs": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_OUTPUTS),
        "predecessor_v3r3": copy.deepcopy(PROTOCOL.EXPECTED_FAILED_V3R3),
        "preregistration": copy.deepcopy(
            PROTOCOL.EXPECTED_TRACKED_PLAN_IDENTITY
        ),
        "schema": PROTOCOL.TEACHER_PLAN_SCHEMA,
        "selection_evidence": evidence,
        "selection_manifest": copy.deepcopy(
            PROTOCOL.EXPECTED_REUSED_SELECTION["manifest"]
        ),
        "selection_roles": copy.deepcopy(PROTOCOL.EXPECTED_SELECTION_ROLES),
        "source_revision": NEW_REVISION,
        "status": "sealed-not-executed",
        "teacher": copy.deepcopy(PROTOCOL.EXPECTED_TEACHER),
        "training": copy.deepcopy(PROTOCOL.EXPECTED_TRAINING),
    }


class YaneuraOnlyV1ProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.plan = PROTOCOL.validate_tracked_plan_file(TRACKED_PLAN)

    def test_independent_family_removes_stable_and_caps_rows_at_13(self) -> None:
        teacher = self.plan["teacher"]
        self.assertEqual(
            teacher["candidate_policy"]["stable_wasm"],
            {
                "allowed": False,
                "calls_per_parent": 0,
                "candidate_rows": 0,
                "worker_processes": 0,
            },
        )
        self.assertEqual(teacher["maximum_rows_per_parent"], 13)
        self.assertEqual(teacher["maximum_rows"], 8_192 * 13)
        self.assertEqual(
            teacher["ledger_candidate_generation"],
            PROTOCOL.EXPECTED_LEDGER_CANDIDATE_GENERATION,
        )
        self.assertEqual(
            PROTOCOL.TEACHER_WORK_SCHEMA,
            "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1",
        )

    def test_yaneura_and_depth18_contract_is_exact(self) -> None:
        teacher = self.plan["teacher"]
        self.assertEqual(
            teacher["candidate_policy"]["yaneuraou_depth16_multipv"],
            {"depth": 16, "multipv": 12, "required": True},
        )
        self.assertEqual(
            teacher["candidate_policy"]["recorded_move"], {"required": True}
        )
        self.assertEqual(
            teacher["candidate_policy"]["deduplication"],
            "USI-move-exact-before-depth18-rescore",
        )
        self.assertEqual(
            teacher["rescore_policy"],
            {
                "all_deduplicated_candidates_independently_rescored": True,
                "depth": 18,
                "old_depth6_or_depth12_cp_target_rows": 0,
            },
        )

    def test_failed_v3r3_exact_artifacts_and_zero_reuse_are_bound(self) -> None:
        failed = self.plan["failed_v3r3"]
        self.assertEqual(
            failed["source_revision"], PROTOCOL.FAILED_V3R3_REVISION
        )
        self.assertEqual(failed["teacher_plan"]["bytes"], 14_247)
        self.assertEqual(failed["work_ledger"]["parent_records"], 162)
        self.assertEqual(failed["work_ledger"]["teacher_rows"], 1_948)
        self.assertEqual(failed["milestone_100"]["completed_rows"], 1_198)
        self.assertEqual(failed["terminal_fault"]["technical_faults"], 1)
        self.assertFalse(failed["same_family_resume_authorized"])
        self.assertEqual(failed["reuse_completed_parents"], 0)
        self.assertEqual(failed["reuse_teacher_rows"], 0)
        self.assertEqual(
            failed["formal_namespace"]["exact_entries"],
            [
                "teacher-milestone-100.json",
                "teacher-plan.json",
                "teacher-terminal-fault.json",
                "teacher-work.jsonl",
            ],
        )

    def test_downstream_training_and_gates_are_unchanged(self) -> None:
        self.assertEqual(PROTOCOL.EXPECTED_TRAINING, V3R3.EXPECTED_TRAINING)
        self.assertEqual(PROTOCOL.EXPECTED_GATES, V3R3.EXPECTED_GATES)
        self.assertEqual(self.plan["training"]["epochs"], 3)
        self.assertEqual(self.plan["training"]["seeds"], 1)
        self.assertEqual(
            self.plan["downstream_gates"][
                "fresh_screen_halfpoints_minimum"
            ],
            62,
        )
        self.assertEqual(
            self.plan["downstream_gates"][
                "fresh_screen_halfpoints_denominator"
            ],
            112,
        )

    def test_plan_rejects_stable_reuse_timeout_or_threshold_drift(self) -> None:
        mutations = {
            "stable-call": lambda value: value["teacher"]["candidate_policy"][
                "stable_wasm"
            ].__setitem__("calls_per_parent", 1),
            "stable-worker": lambda value: value["teacher"][
                "ledger_candidate_generation"
            ].__setitem__("stable_wasm", "optional"),
            "row-cap": lambda value: value["teacher"].__setitem__(
                "maximum_rows_per_parent", 14
            ),
            "reuse": lambda value: value["change_control"].__setitem__(
                "failed_v3r3_teacher_rows_reused", 1_948
            ),
            "timeout-extension": lambda value: value["change_control"].__setitem__(
                "stable_timeout_extension_milliseconds", 1
            ),
            "threshold": lambda value: value["downstream_gates"].__setitem__(
                "fresh_screen_halfpoints_minimum", 61
            ),
            "epoch": lambda value: value["training"].__setitem__("epochs", 4),
            "namespace": lambda value: value["output_namespace"].__setitem__(
                "directory", "/tmp/yaneura-only"
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(self.plan)
                mutate(changed)
                with self.assertRaises(PROTOCOL.YaneuraOnlyV1ProtocolError):
                    PROTOCOL.validate_plan_document(changed)

    def test_runtime_requires_new_clean_merged_main(self) -> None:
        self.assertEqual(
            PROTOCOL.validate_runtime_source_revision(
                self.plan,
                source_revision=NEW_REVISION,
                authenticated_main_head=NEW_REVISION,
                repository_clean=True,
                tracked_plan_merged=True,
            ),
            NEW_REVISION,
        )
        cases = [
            {
                "source_revision": PROTOCOL.FAILED_V3R3_REVISION,
                "authenticated_main_head": PROTOCOL.FAILED_V3R3_REVISION,
                "repository_clean": True,
                "tracked_plan_merged": True,
            },
            {
                "source_revision": NEW_REVISION,
                "authenticated_main_head": "b" * 40,
                "repository_clean": True,
                "tracked_plan_merged": True,
            },
            {
                "source_revision": NEW_REVISION,
                "authenticated_main_head": NEW_REVISION,
                "repository_clean": False,
                "tracked_plan_merged": True,
            },
            {
                "source_revision": NEW_REVISION,
                "authenticated_main_head": NEW_REVISION,
                "repository_clean": True,
                "tracked_plan_merged": False,
            },
        ]
        for arguments in cases:
            with self.subTest(arguments=arguments):
                with self.assertRaises(PROTOCOL.YaneuraOnlyV1ProtocolError):
                    PROTOCOL.validate_runtime_source_revision(
                        self.plan, **arguments
                    )

    def test_teacher_plan_binds_every_contract(self) -> None:
        plan = _teacher_plan()
        validated = PROTOCOL.validate_teacher_plan(
            plan,
            authenticated_selection=plan["selection_evidence"],
            expected_source_revision=NEW_REVISION,
        )
        self.assertEqual(validated["schema"], PROTOCOL.TEACHER_PLAN_SCHEMA)
        self.assertEqual(
            validated["predecessor_v3r3"], PROTOCOL.EXPECTED_FAILED_V3R3
        )
        for field, changed_value in (
            ("teacher", {**plan["teacher"], "maximum_rows_per_parent": 14}),
            ("training", {**plan["training"], "seeds": 2}),
            (
                "downstream_gates",
                {
                    **plan["downstream_gates"],
                    "fresh_screen_halfpoints_minimum": 61,
                },
            ),
        ):
            with self.subTest(field=field):
                changed = copy.deepcopy(plan)
                changed[field] = changed_value
                with self.assertRaises(PROTOCOL.YaneuraOnlyV1ProtocolError):
                    PROTOCOL.validate_teacher_plan(
                        changed,
                        authenticated_selection=plan["selection_evidence"],
                        expected_source_revision=NEW_REVISION,
                    )

    def test_exact_identity_rejects_reformatted_plan(self) -> None:
        canonical = PROTOCOL.canonical_json_bytes(self.plan)
        self.assertNotEqual(canonical, TRACKED_PLAN.read_bytes())


if __name__ == "__main__":
    unittest.main()
