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

import halfkp81_depth18_bounded_stable_v3_protocol as V3  # noqa: E402
import halfkp81_depth18_bounded_stable_v3r2_protocol as PROTOCOL  # noqa: E402


TRACKED_PLAN = (
    ML_DIR / "halfkp81-hard-depth18-bounded-stable-v3r2-plan.json"
)
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
        "predecessor_v3": copy.deepcopy(PROTOCOL.EXPECTED_FAILED_V3),
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
    }


class BoundedStableV3R2ProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.plan = PROTOCOL.validate_tracked_plan_file(TRACKED_PLAN)

    def test_exact_pretty_tracked_plan_is_accepted_without_canonical_reencode(
        self,
    ) -> None:
        raw = TRACKED_PLAN.read_bytes()
        self.assertNotEqual(PROTOCOL.canonical_json_bytes(self.plan), raw)
        self.assertEqual(
            PROTOCOL.parse_pinned_tracked_plan_bytes(raw)["schema"],
            PROTOCOL.PLAN_SCHEMA,
        )
        parser = self.plan["tracked_preregistration_parser"]
        self.assertEqual(parser["parser"], "json-parse-semantics")
        self.assertTrue(parser["require_exact_bytes_and_sha256_before_parse"])
        self.assertFalse(parser["require_canonical-json-reencoding"])

    def test_any_reformat_or_byte_change_is_rejected_before_parse(self) -> None:
        variants = [
            PROTOCOL.canonical_json_bytes(self.plan),
            TRACKED_PLAN.read_bytes() + b" ",
            TRACKED_PLAN.read_bytes().replace(
                b'"prospective-technical-recovery-not-executed"',
                b'"changed"',
            ),
        ]
        for raw in variants:
            with self.subTest(size=len(raw)):
                with self.assertRaisesRegex(
                    PROTOCOL.BoundedStableV3R2ProtocolError,
                    "tracked plan byte identity",
                ):
                    PROTOCOL.parse_pinned_tracked_plan_bytes(raw)

    def test_recovery_binds_exact_zero_row_v3_failure(self) -> None:
        failed = self.plan["failed_v3"]
        self.assertEqual(
            failed["source_revision"], PROTOCOL.FAILED_V3_REVISION
        )
        self.assertEqual(failed["teacher_plan"]["bytes"], 9_103)
        self.assertEqual(
            failed["teacher_plan"]["sha256"],
            "6b69cb61044df051999191e6204be098205aa2301690f2a1becc0730baf9eda5",
        )
        self.assertEqual(failed["completed_parents"], 0)
        self.assertEqual(failed["teacher_rows"], 0)
        self.assertFalse(failed["terminal_fault_artifact_present"])
        self.assertEqual(
            failed["formal_namespace"]["exact_entries"],
            ["teacher-plan.json"],
        )
        self.assertFalse(failed["launch"]["service_present"])
        self.assertFalse(failed["launch"]["process_present"])
        self.assertEqual(failed["launch"]["plist"]["bytes"], 1_488)
        self.assertEqual(failed["launch"]["stderr"]["bytes"], 120)
        self.assertEqual(failed["launch"]["stdout"]["bytes"], 0)

    def test_strength_contract_is_bit_exact_v3_and_rows_are_not_reused(
        self,
    ) -> None:
        control = self.plan["change_control"]
        self.assertEqual(
            control["strength_contract"],
            PROTOCOL.EXPECTED_V3_STRENGTH_CONTRACT,
        )
        self.assertEqual(PROTOCOL.EXPECTED_TEACHER, V3.EXPECTED_TEACHER)
        self.assertEqual(PROTOCOL.EXPECTED_TRAINING, V3.EXPECTED_TRAINING)
        self.assertEqual(PROTOCOL.EXPECTED_GATES, V3.EXPECTED_GATES)
        self.assertEqual(PROTOCOL.EXPECTED_ENGINE, V3.EXPECTED_ENGINE)
        for field in (
            "failed_v3_parent_rows_reused",
            "failed_v3_teacher_rows_reused",
            "v2_parent_rows_reused",
            "v2_teacher_rows_reused",
        ):
            self.assertEqual(control[field], 0)

    def test_plan_rejects_failure_strength_or_authority_drift(self) -> None:
        mutations = {
            "teacher-plan": lambda value: value["failed_v3"][
                "teacher_plan"
            ].__setitem__("sha256", "0" * 64),
            "rows": lambda value: value["failed_v3"].__setitem__(
                "teacher_rows", 1
            ),
            "reuse": lambda value: value["change_control"].__setitem__(
                "failed_v3_parent_rows_reused", 1
            ),
            "strength": lambda value: value["change_control"][
                "strength_contract"
            ].__setitem__("sha256", "0" * 64),
            "namespace": lambda value: value["output_namespace"].__setitem__(
                "directory", "/tmp/v3r2"
            ),
            "parser": lambda value: value[
                "tracked_preregistration_parser"
            ].__setitem__("require_canonical-json-reencoding", True),
            "authority": lambda value: value["authority"].__setitem__(
                "may_execute_teacher", True
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(self.plan)
                mutate(changed)
                with self.assertRaises(
                    PROTOCOL.BoundedStableV3R2ProtocolError
                ):
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
                "source_revision": PROTOCOL.FAILED_V3_REVISION,
                "authenticated_main_head": PROTOCOL.FAILED_V3_REVISION,
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
                with self.assertRaises(
                    PROTOCOL.BoundedStableV3R2ProtocolError
                ):
                    PROTOCOL.validate_runtime_source_revision(
                        self.plan, **arguments
                    )

    def test_teacher_plan_shape_binds_both_predecessors(self) -> None:
        plan = _teacher_plan()
        validated = PROTOCOL.validate_teacher_plan(
            plan,
            authenticated_selection=plan["selection_evidence"],
            expected_source_revision=NEW_REVISION,
        )
        self.assertEqual(validated["schema"], PROTOCOL.TEACHER_PLAN_SCHEMA)
        self.assertEqual(
            validated["predecessor_v3"], PROTOCOL.EXPECTED_FAILED_V3
        )
        self.assertEqual(
            validated["predecessor_v2"], PROTOCOL.EXPECTED_PREDECESSOR_V2
        )
        changed = copy.deepcopy(plan)
        changed["predecessor_v3"]["teacher_rows"] = 1
        with self.assertRaises(PROTOCOL.BoundedStableV3R2ProtocolError):
            PROTOCOL.validate_teacher_plan(
                changed,
                authenticated_selection=plan["selection_evidence"],
                expected_source_revision=NEW_REVISION,
            )

    def test_pinned_parser_rejects_non_json_even_if_identity_is_test_patched(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "not-json"
            path.write_bytes(b"not-json")
            with self.assertRaises(PROTOCOL.BoundedStableV3R2ProtocolError):
                PROTOCOL.validate_tracked_plan_file(path)


if __name__ == "__main__":
    unittest.main()
