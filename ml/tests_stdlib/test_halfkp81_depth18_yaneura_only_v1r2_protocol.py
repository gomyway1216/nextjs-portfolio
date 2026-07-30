from __future__ import annotations

import copy
import math
from pathlib import Path
import sys
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import halfkp81_depth18_yaneura_only_v1_protocol as V1  # noqa: E402
import halfkp81_depth18_yaneura_only_v1r2_protocol as PROTOCOL  # noqa: E402


TRACKED_PLAN = ML_DIR / "halfkp81-hard-depth18-yaneura-only-v1r2-plan.json"
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
        "predecessor_v1": copy.deepcopy(PROTOCOL.EXPECTED_FAILED_V1),
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


class YaneuraOnlyV1R2ProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.plan = PROTOCOL.validate_tracked_plan_file(TRACKED_PLAN)

    def test_cross_runtime_canonical_json_normalizes_integral_floats(self) -> None:
        raw = PROTOCOL.cross_runtime_canonical_json_bytes(
            {"a": 300.0, "b": 0.0, "c": 1.05, "d": 0.5}
        )
        self.assertEqual(raw, b'{"a":300,"b":0,"c":1.05,"d":0.5}\n')
        normalized = PROTOCOL.normalize_cross_runtime_document(
            {"a": [300.0, 0.0], "b": {"c": 5.0}}
        )
        self.assertEqual(normalized, {"a": [300, 0], "b": {"c": 5}})
        self.assertIs(type(normalized["a"][0]), int)

    def test_cross_runtime_canonical_json_rejects_ambiguous_numbers(self) -> None:
        invalid = (
            -0.0,
            math.nan,
            math.inf,
            -math.inf,
            1.25,
            PROTOCOL.MAX_SAFE_INTEGER + 1,
            float(PROTOCOL.MAX_SAFE_INTEGER + 1),
        )
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaises(
                    PROTOCOL.YaneuraOnlyV1R2ProtocolError
                ):
                    PROTOCOL.cross_runtime_canonical_json_bytes(
                        {"value": value}
                    )

    def test_failed_v1_zero_row_boundary_is_exact(self) -> None:
        failed = self.plan["failed_v1"]
        self.assertEqual(failed["source_revision"], PROTOCOL.FAILED_V1_REVISION)
        self.assertEqual(failed["completed_parents"], 0)
        self.assertEqual(failed["teacher_rows"], 0)
        self.assertEqual(failed["reuse_completed_parents"], 0)
        self.assertEqual(failed["reuse_teacher_rows"], 0)
        self.assertFalse(failed["run_fingerprint_created"])
        self.assertFalse(failed["teacher_authentication_started"])
        self.assertEqual(failed["formal_namespace"]["exact_entries"], [
            "teacher-plan.json"
        ])
        self.assertEqual(failed["teacher_plan"]["bytes"], 11_854)
        self.assertEqual(
            failed["teacher_plan"]["sha256"],
            "6168b156a0ff7411a0019e82f8cbe8ef2fa16c80610955aa7a97f7444bfe3e32",
        )
        self.assertEqual(
            failed["cross_runtime_projection"][
                "integral_float_token_replacements"
            ],
            8,
        )

    def test_strength_selection_training_and_gates_equal_v1(self) -> None:
        self.assertEqual(PROTOCOL.EXPECTED_TEACHER, V1.EXPECTED_TEACHER)
        self.assertEqual(
            PROTOCOL.EXPECTED_REUSED_SELECTION,
            V1.EXPECTED_REUSED_SELECTION,
        )
        self.assertEqual(
            PROTOCOL.EXPECTED_SELECTION_ROLES,
            V1.EXPECTED_SELECTION_ROLES,
        )
        self.assertEqual(PROTOCOL.EXPECTED_TRAINING, V1.EXPECTED_TRAINING)
        self.assertEqual(PROTOCOL.EXPECTED_GATES, V1.EXPECTED_GATES)
        self.assertEqual(
            self.plan["technical_recovery"][
                "timeout_extension_milliseconds"
            ],
            0,
        )
        self.assertFalse(
            self.plan["technical_recovery"]["strength_contract_changed"]
        )

    def test_plan_rejects_reuse_strength_threshold_or_recovery_drift(self) -> None:
        mutations = {
            "reuse": lambda value: value["failed_v1"].__setitem__(
                "reuse_teacher_rows", 1
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
            "timeout": lambda value: value["technical_recovery"].__setitem__(
                "timeout_extension_milliseconds", 1
            ),
            "canonical": lambda value: value["technical_recovery"].__setitem__(
                "negative_zero_allowed", True
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(self.plan)
                mutate(changed)
                with self.assertRaises(
                    PROTOCOL.YaneuraOnlyV1R2ProtocolError
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
                "source_revision": PROTOCOL.FAILED_V1_REVISION,
                "authenticated_main_head": PROTOCOL.FAILED_V1_REVISION,
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
                    PROTOCOL.YaneuraOnlyV1R2ProtocolError
                ):
                    PROTOCOL.validate_runtime_source_revision(
                        self.plan, **arguments
                    )

    def test_teacher_plan_is_normalized_and_binds_recovery(self) -> None:
        plan = _teacher_plan()
        validated = PROTOCOL.validate_teacher_plan(
            plan,
            authenticated_selection=plan["selection_evidence"],
            expected_source_revision=NEW_REVISION,
        )
        self.assertEqual(validated["schema"], PROTOCOL.TEACHER_PLAN_SCHEMA)
        self.assertEqual(validated["predecessor_v1"], self.plan["failed_v1"])
        self.assertEqual(
            validated["technical_recovery"],
            PROTOCOL.EXPECTED_TECHNICAL_RECOVERY,
        )
        absolute = validated["downstream_gates"][
            "absolute_max_cp_delta_maximum"
        ]
        self.assertIs(type(absolute), int)
        self.assertEqual(absolute, 300)
        raw = PROTOCOL.cross_runtime_canonical_json_bytes(validated)
        self.assertNotIn(b":300.0", raw)
        self.assertIn(b":300", raw)


if __name__ == "__main__":
    unittest.main()
