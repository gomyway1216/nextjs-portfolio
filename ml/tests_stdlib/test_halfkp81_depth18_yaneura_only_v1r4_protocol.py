from __future__ import annotations

import copy
from pathlib import Path
import sys
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import halfkp81_depth18_yaneura_only_v1r3_protocol as V1R3  # noqa: E402
import halfkp81_depth18_yaneura_only_v1r4_protocol as PROTOCOL  # noqa: E402


TRACKED_PLAN = ML_DIR / "halfkp81-hard-depth18-yaneura-only-v1r4-plan.json"
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
        "predecessor_v1": copy.deepcopy(PROTOCOL.EXPECTED_PREDECESSOR_V1),
        "predecessor_v1r2": copy.deepcopy(
            PROTOCOL.EXPECTED_PREDECESSOR_V1R2
        ),
        "predecessor_v1r3": copy.deepcopy(PROTOCOL.EXPECTED_FAILED_V1R3),
        "predecessor_v3r3": copy.deepcopy(
            PROTOCOL.EXPECTED_PREDECESSOR_V3R3
        ),
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
        "technical_recovery": copy.deepcopy(
            PROTOCOL.EXPECTED_TECHNICAL_RECOVERY
        ),
        "training": copy.deepcopy(PROTOCOL.EXPECTED_TRAINING),
    }


class YaneuraOnlyV1R4ProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.plan = PROTOCOL.validate_tracked_plan_file(TRACKED_PLAN)

    def test_tracked_plan_identity_and_schema_are_exact(self) -> None:
        self.assertEqual(
            TRACKED_PLAN.stat().st_size,
            PROTOCOL.EXPECTED_TRACKED_PLAN_IDENTITY["bytes"],
        )
        self.assertEqual(self.plan["schema"], PROTOCOL.PLAN_SCHEMA)
        self.assertEqual(self.plan["family"], PROTOCOL.FAMILY)
        self.assertEqual(self.plan["status"], PROTOCOL.PLAN_STATUS)

    def test_failed_v1r3_complete_posthoc_fault_is_exact(self) -> None:
        failed = self.plan["failed_v1r3"]
        self.assertEqual(
            failed["source_revision"], PROTOCOL.FAILED_V1R3_REVISION
        )
        self.assertEqual(failed["completed_parents"], 512)
        self.assertEqual(failed["teacher_rows"], 6_134)
        self.assertEqual(failed["teacher_faults"], 0)
        self.assertEqual(failed["reuse_completed_parents"], 0)
        self.assertEqual(failed["reuse_teacher_rows"], 0)
        self.assertFalse(failed["artifact_reuse_authorized"])
        self.assertFalse(failed["same_family_resume_authorized"])
        self.assertEqual(
            failed["requested_multipv_distribution"],
            {"2": 1, "6": 1, "10": 1, "12": 509},
        )
        self.assertEqual(
            failed["role_parents"], {"fit": 384, "sealed": 64, "tune": 64}
        )
        self.assertEqual(
            failed["role_rows"], {"fit": 4_605, "sealed": 758, "tune": 771}
        )
        self.assertEqual(
            failed["preflight_terminal_fault"]["engines_started"], 13
        )
        self.assertEqual(
            failed["preflight_terminal_fault"]["engines_quit"], 13
        )
        self.assertEqual(failed["teacher_receipt"]["technical_faults"], 0)

    def test_only_legal_multipv_validator_changes(self) -> None:
        recovery = self.plan["technical_recovery"]
        validator = recovery["preflight_validator_requested_multipv"]
        self.assertEqual(
            validator["expected"], "min(12, legal_moves_count)"
        )
        self.assertEqual(validator["maximum"], 12)
        self.assertTrue(validator["validator_only_change"])
        self.assertFalse(validator["generator_contract_changed"])
        self.assertFalse(
            recovery["formal_output_directory_initialization_changed"]
        )
        self.assertFalse(recovery["selection_contract_changed"])
        self.assertFalse(recovery["strength_contract_changed"])
        self.assertFalse(recovery["teacher_generation_contract_changed"])
        self.assertFalse(recovery["training_contract_changed"])
        self.assertEqual(recovery["timeout_extension_milliseconds"], 0)
        self.assertEqual(
            {
                key: value
                for key, value in recovery[
                    "scratch_preflight_directory"
                ].items()
                if key != "path"
            },
            {
                key: value
                for key, value in V1R3.EXPECTED_TECHNICAL_RECOVERY[
                    "scratch_preflight_directory"
                ].items()
                if key != "path"
            },
        )

    def test_strength_selection_training_and_gates_equal_v1r3(self) -> None:
        self.assertEqual(PROTOCOL.EXPECTED_TEACHER, V1R3.EXPECTED_TEACHER)
        self.assertEqual(
            PROTOCOL.EXPECTED_REUSED_SELECTION,
            V1R3.EXPECTED_REUSED_SELECTION,
        )
        self.assertEqual(
            PROTOCOL.EXPECTED_SELECTION_ROLES,
            V1R3.EXPECTED_SELECTION_ROLES,
        )
        self.assertEqual(PROTOCOL.EXPECTED_TRAINING, V1R3.EXPECTED_TRAINING)
        self.assertEqual(PROTOCOL.EXPECTED_GATES, V1R3.EXPECTED_GATES)

    def test_plan_rejects_reuse_strength_or_validator_drift(self) -> None:
        mutations = {
            "reuse": lambda value: value["failed_v1r3"].__setitem__(
                "reuse_teacher_rows", 1
            ),
            "artifact reuse": lambda value: value["failed_v1r3"].__setitem__(
                "artifact_reuse_authorized", True
            ),
            "strength": lambda value: value["teacher"].__setitem__(
                "maximum_rows_per_parent", 14
            ),
            "selection": lambda value: value["reused_selection"][
                "jsonl"
            ].__setitem__("sha256", "0" * 64),
            "threshold": lambda value: value["downstream_gates"].__setitem__(
                "fresh_screen_halfpoints_minimum", 61
            ),
            "training": lambda value: value["training"].__setitem__(
                "epochs", 4
            ),
            "timeout": lambda value: value[
                "technical_recovery"
            ].__setitem__("timeout_extension_milliseconds", 1),
            "validator constant": lambda value: value["technical_recovery"][
                "preflight_validator_requested_multipv"
            ].__setitem__("expected", "12"),
            "generator": lambda value: value["technical_recovery"][
                "preflight_validator_requested_multipv"
            ].__setitem__("generator_contract_changed", True),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(self.plan)
                mutate(changed)
                with self.assertRaises(
                    PROTOCOL.YaneuraOnlyV1R4ProtocolError
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
                "source_revision": PROTOCOL.FAILED_V1R3_REVISION,
                "authenticated_main_head": PROTOCOL.FAILED_V1R3_REVISION,
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
                    PROTOCOL.YaneuraOnlyV1R4ProtocolError
                ):
                    PROTOCOL.validate_runtime_source_revision(
                        self.plan, **arguments
                    )

    def test_teacher_plan_binds_v1r3_and_new_namespace(self) -> None:
        plan = _teacher_plan()
        validated = PROTOCOL.validate_teacher_plan(
            plan,
            authenticated_selection=plan["selection_evidence"],
            expected_source_revision=NEW_REVISION,
        )
        self.assertEqual(validated["schema"], PROTOCOL.TEACHER_PLAN_SCHEMA)
        self.assertEqual(
            validated["predecessor_v1r3"],
            PROTOCOL.EXPECTED_FAILED_V1R3,
        )
        self.assertEqual(
            validated["outputs"], PROTOCOL.EXPECTED_RUNTIME_OUTPUTS
        )
        self.assertNotEqual(
            validated["outputs"]["directory"],
            PROTOCOL.EXPECTED_FAILED_V1R3["formal_namespace"]["directory"],
        )
        self.assertEqual(
            validated["predecessor_v1r3"]["reuse_teacher_rows"], 0
        )


if __name__ == "__main__":
    unittest.main()
