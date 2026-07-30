from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import halfkp81_depth18_bounded_stable_v3_protocol as PROTOCOL  # noqa: E402


TRACKED_PLAN = ML_DIR / "halfkp81-hard-depth18-bounded-stable-v3-plan.json"
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
        "engine": copy.deepcopy(PROTOCOL.EXPECTED_ENGINE),
        "outputs": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_OUTPUTS),
        "predecessor_v2": copy.deepcopy(PROTOCOL.EXPECTED_PREDECESSOR_V2),
        "preregistration": copy.deepcopy(PROTOCOL.EXPECTED_TRACKED_PLAN_IDENTITY),
        "schema": PROTOCOL.TEACHER_PLAN_SCHEMA,
        "selection_evidence": evidence,
        "selection_manifest": copy.deepcopy(
            PROTOCOL.EXPECTED_REUSED_SELECTION["manifest"]
        ),
        "selection_roles": copy.deepcopy(PROTOCOL.EXPECTED_SELECTION_ROLES),
        "source_revision": NEW_REVISION,
        "status": "sealed-not-executed",
        "teacher": copy.deepcopy(PROTOCOL.EXPECTED_TEACHER),
    }


class BoundedStableV3ProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.plan = PROTOCOL.validate_tracked_plan_file(TRACKED_PLAN)

    def test_tracked_plan_binds_terminal_v2_without_reusing_rows(self) -> None:
        predecessor = self.plan["predecessor_v2"]
        self.assertEqual(predecessor["teacher_plan"]["bytes"], 6_617)
        self.assertEqual(
            predecessor["teacher_plan"]["sha256"],
            "b9fbac546c6c77386c43b9318eb7639f3cf74882ff995fa4e117d82d092bacd1",
        )
        self.assertEqual(predecessor["work_ledger"]["parent_records"], 49)
        self.assertEqual(predecessor["work_ledger"]["teacher_rows"], 585)
        self.assertEqual(predecessor["terminal_fault"]["technical_faults"], 1)
        self.assertEqual(predecessor["reuse_completed_parents"], 0)
        self.assertEqual(predecessor["reuse_teacher_rows"], 0)
        self.assertFalse(predecessor["same_family_resume_authorized"])

    def test_tracked_plan_reuses_only_exact_authenticated_selection(self) -> None:
        self.assertEqual(
            self.plan["reused_selection"], PROTOCOL.EXPECTED_REUSED_SELECTION
        )
        self.assertEqual(self.plan["reused_selection"]["jsonl"]["rows"], 8_192)
        self.assertEqual(
            self.plan["output_namespace"]["collision_policy"],
            "create-only-fail-if-any-target-exists",
        )
        self.assertNotEqual(
            self.plan["output_namespace"]["directory"],
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "halfkp81-hard-depth18-engine-evaldir-v2",
        )

    def test_candidate_contract_is_strength_first_and_bounded(self) -> None:
        policy = self.plan["teacher"]["candidate_policy"]
        self.assertEqual(
            policy["yaneuraou_depth16_multipv"],
            {"depth": 16, "multipv": 12, "required": True},
        )
        self.assertTrue(policy["recorded_move"]["required"])
        stable = policy["stable_depth11"]
        self.assertTrue(stable["optional"])
        self.assertEqual(stable["budget_milliseconds"], 20_000)
        self.assertTrue(stable["cooperative_deadline_required"])
        self.assertTrue(stable["omission_must_be_explicit_in_parent_ledger"])
        self.assertFalse(stable["accept_partial_result"])
        self.assertFalse(stable["pool_wide_poison_on_timeout"])
        self.assertEqual(self.plan["teacher"]["rescore_policy"]["depth"], 18)
        self.assertTrue(
            self.plan["teacher"]["rescore_policy"][
                "all_deduplicated_candidates_independently_rescored"
            ]
        )

    def test_plan_rejects_any_authority_or_strength_contract_drift(self) -> None:
        mutations = {
            "v2-work": lambda value: value["predecessor_v2"]["work_ledger"].__setitem__(
                "teacher_rows", 584
            ),
            "v2-reuse": lambda value: value["predecessor_v2"].__setitem__(
                "reuse_completed_parents", 49
            ),
            "selection": lambda value: value["reused_selection"]["jsonl"].__setitem__(
                "sha256", "0" * 64
            ),
            "stable-budget": lambda value: value["teacher"]["candidate_policy"][
                "stable_depth11"
            ].__setitem__("budget_milliseconds", 600_000),
            "stable-partial": lambda value: value["teacher"]["candidate_policy"][
                "stable_depth11"
            ].__setitem__("accept_partial_result", True),
            "multipv": lambda value: value["teacher"]["candidate_policy"][
                "yaneuraou_depth16_multipv"
            ].__setitem__("multipv", 8),
            "rescore": lambda value: value["teacher"]["rescore_policy"].__setitem__(
                "depth", 16
            ),
            "epoch": lambda value: value["training"].__setitem__("epochs", 4),
            "gate": lambda value: value["gates"].__setitem__(
                "fresh_screen_halfpoints_minimum", 61
            ),
            "live": lambda value: value["live_baseline"].__setitem__(
                "sha256", "0" * 64
            ),
            "authority": lambda value: value["authority"].__setitem__(
                "may_execute_teacher", True
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(self.plan)
                mutate(changed)
                with self.assertRaises(PROTOCOL.BoundedStableV3ProtocolError):
                    PROTOCOL.validate_plan_document(changed)

    def test_runtime_source_must_be_new_clean_merged_main(self) -> None:
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
        cases = {
            "v2": {
                "source_revision": PROTOCOL.PREDECESSOR_REVISION,
                "authenticated_main_head": PROTOCOL.PREDECESSOR_REVISION,
                "repository_clean": True,
                "tracked_plan_merged": True,
            },
            "wrong-head": {
                "source_revision": NEW_REVISION,
                "authenticated_main_head": "b" * 40,
                "repository_clean": True,
                "tracked_plan_merged": True,
            },
            "dirty": {
                "source_revision": NEW_REVISION,
                "authenticated_main_head": NEW_REVISION,
                "repository_clean": False,
                "tracked_plan_merged": True,
            },
            "unmerged-plan": {
                "source_revision": NEW_REVISION,
                "authenticated_main_head": NEW_REVISION,
                "repository_clean": True,
                "tracked_plan_merged": False,
            },
        }
        for label, arguments in cases.items():
            with self.subTest(label=label):
                with self.assertRaises(PROTOCOL.BoundedStableV3ProtocolError):
                    PROTOCOL.validate_runtime_source_revision(self.plan, **arguments)

    def test_teacher_plan_shape_is_exact_and_grants_only_teacher_execution(self) -> None:
        plan = _teacher_plan()
        validated = PROTOCOL.validate_teacher_plan(
            plan,
            authenticated_selection=plan["selection_evidence"],
            expected_source_revision=NEW_REVISION,
        )
        self.assertEqual(validated["schema"], PROTOCOL.TEACHER_PLAN_SCHEMA)
        self.assertTrue(validated["authority"]["may_execute_teacher"])
        self.assertFalse(validated["authority"]["may_train"])
        self.assertEqual(
            set(validated["outputs"]),
            {
                "directory",
                "fit_jsonl",
                "milestone_100_json",
                "milestone_500_json",
                "plan_json",
                "receipt_json",
                "sealed_jsonl",
                "terminal_fault_json",
                "tune_jsonl",
                "verified_artifact_receipt_json",
                "work_jsonl",
            },
        )
        changed = copy.deepcopy(plan)
        changed["predecessor_v2"]["reuse_teacher_rows"] = 585
        with self.assertRaises(PROTOCOL.BoundedStableV3ProtocolError):
            PROTOCOL.validate_teacher_plan(
                changed,
                authenticated_selection=plan["selection_evidence"],
                expected_source_revision=NEW_REVISION,
            )

    def test_strict_loader_rejects_duplicate_keys(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "duplicate.json"
            path.write_text('{"schema":"one","schema":"two"}\n', encoding="utf-8")
            with self.assertRaisesRegex(
                PROTOCOL.BoundedStableV3ProtocolError, "duplicate JSON key"
            ):
                PROTOCOL.load_strict_json_file(path)

    def test_tracked_identity_rejects_reformatted_copy(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "plan.json"
            path.write_text(
                json.dumps(self.plan, ensure_ascii=False, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                PROTOCOL.BoundedStableV3ProtocolError, "tracked plan identity"
            ):
                PROTOCOL.validate_tracked_plan_file(path)


if __name__ == "__main__":
    unittest.main()
