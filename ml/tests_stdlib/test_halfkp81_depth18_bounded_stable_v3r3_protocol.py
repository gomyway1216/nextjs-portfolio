from __future__ import annotations

import copy
from pathlib import Path
import sys
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import halfkp81_depth18_bounded_stable_v3_protocol as V3  # noqa: E402
import halfkp81_depth18_bounded_stable_v3r3_protocol as PROTOCOL  # noqa: E402


TRACKED_PLAN = (
    ML_DIR / "halfkp81-hard-depth18-bounded-stable-v3r3-plan.json"
)
DIAGNOSTIC = (
    ML_DIR / "halfkp81-depth18-bounded-stable-v3r3-diagnostic-receipt.json"
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
        "diagnostic_receipt": copy.deepcopy(
            PROTOCOL.EXPECTED_DIAGNOSTIC_RECEIPT_IDENTITY
        ),
        "engine": copy.deepcopy(PROTOCOL.EXPECTED_ENGINE),
        "outputs": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_OUTPUTS),
        "predecessor_v2": copy.deepcopy(PROTOCOL.EXPECTED_PREDECESSOR_V2),
        "predecessor_v3": copy.deepcopy(PROTOCOL.EXPECTED_PREDECESSOR_V3),
        "predecessor_v3r2": copy.deepcopy(PROTOCOL.EXPECTED_FAILED_V3R2),
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


class BoundedStableV3R3ProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.plan = PROTOCOL.validate_tracked_plan_file(TRACKED_PLAN)
        cls.diagnostic = PROTOCOL.validate_diagnostic_receipt_file(DIAGNOSTIC)

    def test_diagnostic_binds_confirmed_fd3_eof_wait_and_exclusions(self) -> None:
        diagnosis = self.diagnostic["diagnosis"]
        self.assertEqual(
            diagnosis["confirmed_root_cause"],
            "fd3-source-transfer-eof-was-not-confirmed-before-worker-init",
        )
        self.assertEqual(diagnosis["stalled_child_count"], 1)
        self.assertEqual(
            diagnosis["stalled_child_location"],
            "WORKER_BOOTSTRAP-readFileSync(3)-awaiting-EOF",
        )
        self.assertEqual(
            self.diagnostic["excluded_causes"],
            {
                "file_descriptor_leak": False,
                "parent_position_specific_failure": False,
                "wasm_identity_or_content_failure": False,
                "weights_identity_or_content_failure": False,
            },
        )
        self.assertEqual(
            self.diagnostic["load_reproduction"][
                "concurrent_replacement_wave"
            ],
            12,
        )
        self.assertEqual(
            self.diagnostic["load_reproduction"]["yaneuraou_hash_total_gib"],
            6.5,
        )

    def test_recovery_changes_only_fd3_ordering_and_new_run_identity(self) -> None:
        control = self.plan["change_control"]
        self.assertEqual(
            control["fd3_recovery_contract"],
            {
                "end_callback_must_complete_before_stdin_init_write": True,
                "source_transfer_and_init_share_one_deadline": True,
                "startup_total_budget_milliseconds": 120_000,
                "timeout_extension_milliseconds": 0,
            },
        )
        self.assertEqual(
            control["strength_contract"],
            PROTOCOL.EXPECTED_V3_STRENGTH_CONTRACT,
        )
        self.assertEqual(PROTOCOL.EXPECTED_TEACHER, V3.EXPECTED_TEACHER)
        self.assertEqual(PROTOCOL.EXPECTED_TRAINING, V3.EXPECTED_TRAINING)
        self.assertEqual(PROTOCOL.EXPECTED_GATES, V3.EXPECTED_GATES)
        for field in (
            "failed_v3r2_parent_rows_reused",
            "failed_v3r2_teacher_rows_reused",
            "v2_parent_rows_reused",
            "v2_teacher_rows_reused",
            "v3_parent_rows_reused",
            "v3_teacher_rows_reused",
        ):
            self.assertEqual(control[field], 0)

    def test_failed_v3r2_exact_artifacts_and_zero_reuse_are_bound(self) -> None:
        failed = self.plan["failed_v3r2"]
        self.assertEqual(failed["source_revision"], PROTOCOL.FAILED_V3R2_REVISION)
        self.assertEqual(failed["teacher_plan"]["bytes"], 10_827)
        self.assertEqual(failed["work_ledger"]["parent_records"], 94)
        self.assertEqual(failed["work_ledger"]["teacher_rows"], 1_125)
        self.assertEqual(failed["terminal_fault"]["technical_faults"], 1)
        self.assertFalse(failed["same_family_resume_authorized"])
        self.assertEqual(
            failed["formal_namespace"]["exact_entries"],
            [
                "teacher-plan.json",
                "teacher-terminal-fault.json",
                "teacher-work.jsonl",
            ],
        )
        self.assertFalse(failed["launch"]["service_present"])
        self.assertFalse(failed["launch"]["process_present"])

    def test_plan_rejects_timeout_strength_reuse_or_evidence_drift(self) -> None:
        mutations = {
            "timeout": lambda value: value["change_control"][
                "fd3_recovery_contract"
            ].__setitem__("startup_total_budget_milliseconds", 180_000),
            "extension": lambda value: value["change_control"][
                "fd3_recovery_contract"
            ].__setitem__("timeout_extension_milliseconds", 60_000),
            "ordering": lambda value: value["change_control"][
                "fd3_recovery_contract"
            ].__setitem__("end_callback_must_complete_before_stdin_init_write", False),
            "strength": lambda value: value["change_control"][
                "strength_contract"
            ].__setitem__("sha256", "0" * 64),
            "reuse": lambda value: value["change_control"].__setitem__(
                "failed_v3r2_teacher_rows_reused", 1_125
            ),
            "fault": lambda value: value["failed_v3r2"]["terminal_fault"].__setitem__(
                "sha256", "0" * 64
            ),
            "diagnostic": lambda value: value["diagnostic_receipt"].__setitem__(
                "sha256", "0" * 64
            ),
            "namespace": lambda value: value["output_namespace"].__setitem__(
                "directory", "/tmp/v3r3"
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(self.plan)
                mutate(changed)
                with self.assertRaises(
                    PROTOCOL.BoundedStableV3R3ProtocolError
                ):
                    PROTOCOL.validate_plan_document(changed)

    def test_diagnostic_rejects_unconfirmed_or_broadened_recovery(self) -> None:
        mutations = {
            "cause": lambda value: value["diagnosis"].__setitem__(
                "confirmed_root_cause", "unknown"
            ),
            "fd-leak": lambda value: value["excluded_causes"].__setitem__(
                "file_descriptor_leak", True
            ),
            "timeout": lambda value: value["permitted_recovery"].__setitem__(
                "startup_total_budget_milliseconds", 180_000
            ),
            "strength": lambda value: value["prohibited_changes"].__setitem__(
                "change_strength_gate", True
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(self.diagnostic)
                mutate(changed)
                with self.assertRaises(
                    PROTOCOL.BoundedStableV3R3ProtocolError
                ):
                    PROTOCOL.validate_diagnostic_document(changed)

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
                "source_revision": PROTOCOL.FAILED_V3R2_REVISION,
                "authenticated_main_head": PROTOCOL.FAILED_V3R2_REVISION,
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
                    PROTOCOL.BoundedStableV3R3ProtocolError
                ):
                    PROTOCOL.validate_runtime_source_revision(
                        self.plan, **arguments
                    )

    def test_teacher_plan_binds_diagnostic_and_all_predecessors(self) -> None:
        plan = _teacher_plan()
        validated = PROTOCOL.validate_teacher_plan(
            plan,
            authenticated_selection=plan["selection_evidence"],
            expected_source_revision=NEW_REVISION,
        )
        self.assertEqual(validated["schema"], PROTOCOL.TEACHER_PLAN_SCHEMA)
        self.assertEqual(
            validated["diagnostic_receipt"],
            PROTOCOL.EXPECTED_DIAGNOSTIC_RECEIPT_IDENTITY,
        )
        self.assertEqual(
            validated["predecessor_v3r2"], PROTOCOL.EXPECTED_FAILED_V3R2
        )
        changed = copy.deepcopy(plan)
        changed["predecessor_v3r2"]["work_ledger"]["teacher_rows"] = 0
        with self.assertRaises(PROTOCOL.BoundedStableV3R3ProtocolError):
            PROTOCOL.validate_teacher_plan(
                changed,
                authenticated_selection=plan["selection_evidence"],
                expected_source_revision=NEW_REVISION,
            )

    def test_exact_identity_rejects_reformatted_tracked_documents(self) -> None:
        for path, validator in (
            (TRACKED_PLAN, PROTOCOL.validate_tracked_plan_file),
            (DIAGNOSTIC, PROTOCOL.validate_diagnostic_receipt_file),
        ):
            canonical = PROTOCOL.canonical_json_bytes(
                validator(path)
            )
            self.assertNotEqual(canonical, path.read_bytes())


if __name__ == "__main__":
    unittest.main()
