from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import halfkp81_depth18_strength_protocol as PROTOCOL  # noqa: E402


TRACKED_PLAN = (
    ML_DIR / "halfkp81-hard-depth18-strength-v1-plan.json"
)


def _identity(path: str, *, schema: str | None = None) -> dict:
    result = {"path": path, "bytes": 123, "sha256": "a" * 64}
    if schema is not None:
        result["schema"] = schema
    return result


SOURCE_REVISION = "b" * 40


def _selection_evidence() -> PROTOCOL.AuthenticatedSelectionEvidence:
    manifest = {
        "path": "/tmp/selection.json",
        "bytes": 123,
        "sha256": "a" * 64,
        "held_read_only_descriptor": True,
        "stable_double_read": True,
        "schema": PROTOCOL.SELECTION_MANIFEST_SCHEMA,
    }
    selected = {
        "path": "/tmp/selection.jsonl",
        "bytes": 456,
        "sha256": "c" * 64,
        "held_read_only_descriptor": True,
        "stable_double_read": True,
        "rows": 8_192,
        "schema": PROTOCOL.SELECTION_ROW_SCHEMA,
    }
    return PROTOCOL.AuthenticatedSelectionEvidence(
        {
            "schema": PROTOCOL.SELECTION_EVIDENCE_SCHEMA,
            "status": "authenticated-selection-complete-teacher-plan-eligible",
            "source_revision": SOURCE_REVISION,
            "selection_jsonl": selected,
            "selection_manifest": manifest,
            "phase_name_map": copy.deepcopy(PROTOCOL.PHASE_PLAN_TO_SELECTION),
            "accounting": {
                "phase_side_counts": {
                    PROTOCOL.PHASE_PLAN_TO_SELECTION[name]: counts
                    for name, counts in PROTOCOL.EXPECTED_PHASE_SIDE_COUNTS.items()
                },
                "role_side_counts": copy.deepcopy(
                    PROTOCOL.EXPECTED_ROLE_SIDE_COUNTS
                ),
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


def _teacher_plan(
    evidence: PROTOCOL.AuthenticatedSelectionEvidence | None = None,
) -> dict:
    evidence = evidence or _selection_evidence()
    evidence_document = copy.deepcopy(dict(evidence.document))
    manifest_identity = evidence_document["selection_manifest"]
    return {
        "schema": PROTOCOL.TEACHER_PLAN_SCHEMA,
        "status": "sealed-not-executed",
        "source_revision": SOURCE_REVISION,
        "preregistration": copy.deepcopy(
            PROTOCOL.EXPECTED_PREREGISTRATION_IDENTITY
        ),
        "selection_manifest": {
            key: manifest_identity[key]
            for key in ("path", "bytes", "sha256", "schema")
        },
        "selection_evidence": evidence_document,
        "selection_roles": copy.deepcopy(PROTOCOL.EXPECTED_ROLE_COUNTS),
        "engine": copy.deepcopy(PROTOCOL.EXPECTED_ENGINE),
        "teacher": copy.deepcopy(PROTOCOL.EXPECTED_TEACHER),
        "outputs": {
            "directory": "/tmp/depth18",
            "plan_json": "/tmp/depth18/teacher-plan.json",
            "fit_jsonl": "/tmp/depth18/fit.jsonl",
            "tune_jsonl": "/tmp/depth18/tune.jsonl",
            "sealed_jsonl": "/tmp/depth18/sealed.jsonl",
            "receipt_json": "/tmp/depth18/receipt.json",
        },
        "authority": {
            "may_execute_teacher": True,
            "may_train": False,
            "may_play_formal_games": False,
            "may_write_live_weights": False,
        },
}


def _receipt(plan: dict) -> dict:
    plan_raw = PROTOCOL.canonical_json_bytes(plan)
    return {
        "schema": PROTOCOL.TEACHER_RECEIPT_SCHEMA,
        "status": "structurally-complete-awaiting-artifact-verification",
        "teacher_plan": {
            "path": plan["outputs"]["plan_json"],
            "bytes": len(plan_raw),
            "sha256": __import__("hashlib").sha256(plan_raw).hexdigest(),
            "schema": PROTOCOL.TEACHER_PLAN_SCHEMA,
        },
        "completed_parents": 8_192,
        "completed_rows": 95_191,
        "role_parents": copy.deepcopy(PROTOCOL.EXPECTED_ROLE_COUNTS),
        "role_rows": {"fit": 71_393, "tune": 11_899, "sealed": 11_899},
        "depth": 18,
        "technical_faults": 0,
        "incomplete_parents": 0,
        "old_depth12_targets": 0,
        "outputs": {
            role: _identity(f"/tmp/depth18/{role}.jsonl")
            for role in ("fit", "tune", "sealed")
        },
        "artifact_verification": {
            "held_descriptor_content_scan": False,
            "actual_bytes_sha256_rows_recomputed": False,
            "selected_parent_role_membership_recomputed": False,
            "every_target_depth18_recomputed": False,
            "old_depth12_target_absence_recomputed": False,
        },
        "authority": {
            "may_build_training_plan": False,
            "may_train": False,
            "may_play_formal_games": False,
            "may_write_live_weights": False,
        },
    }


def _selection_jsonl() -> bytes:
    phase_counts = {"opening": 1_024, "mid": 1_536, "late": 1_536}
    phase_ply = {"opening": 20, "mid": 60, "late": 100}
    records = []
    serial = 0
    for side in ("b", "w"):
        side_cursor = 0
        for phase, count in phase_counts.items():
            for _ in range(count):
                game_id = "sha256:" + hashlib.sha256(
                    f"selection-game-{serial}".encode()
                ).hexdigest()
                sfen = f"{serial + 10}/9/9/9/9/9/9/9/9 {side} - {phase_ply[phase] + 1}"
                position_id = "sha256:" + hashlib.sha256(
                    f"sfen-v1\0{' '.join(sfen.split()[:3])}".encode()
                ).hexdigest()
                if side_cursor < 3_072:
                    role = "fit"
                elif side_cursor < 3_584:
                    role = "tune"
                else:
                    role = "sealed"
                tie_material = {
                    "game_id": game_id,
                    "minimum_player_rating": 4_000,
                    "old_depth12_cp": 0,
                    "old_outcome": 0.5,
                    "position_id": position_id,
                }
                records.append(
                    {
                        "schema": PROTOCOL.SELECTION_ROW_SCHEMA,
                        "source_game_id": game_id,
                        "game_id": game_id,
                        "source_game_sha256": hashlib.sha256(
                            f"source-game-{serial}".encode()
                        ).hexdigest(),
                        "position_id": position_id,
                        "sfen": sfen,
                        "recorded_move": "7g7f",
                        "side_to_move": side,
                        "ply": phase_ply[phase],
                        "phase": phase,
                        "old_depth12_cp": 0,
                        "old_outcome": 0.5,
                        "old_depth12_signals_usage": (
                            "selection_only_never_teacher_target"
                        ),
                        "minimum_player_rating": 4_000,
                        "sente_rating": 4_000,
                        "gote_rating": 4_010,
                        "legal_move_count": 20,
                        "hardness_cp_outcome_surprise": 0,
                        "hardness_tiebreak_sha256": hashlib.sha256(
                            PROTOCOL.canonical_json_bytes(tie_material)
                        ).hexdigest(),
                        "role": role,
                    }
                )
                side_cursor += 1
                serial += 1
    role_order = {"fit": 0, "tune": 1, "sealed": 2}
    phase_order = {"opening": 0, "mid": 1, "late": 2}
    records.sort(
        key=lambda record: (
            role_order[record["role"]],
            phase_order[record["phase"]],
            record["side_to_move"],
            -record["hardness_cp_outcome_surprise"],
            -record["minimum_player_rating"],
            record["hardness_tiebreak_sha256"],
        )
    )
    return b"".join(PROTOCOL.canonical_json_bytes(record) for record in records)


class Halfkp81Depth18StrengthProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        raw, _ = PROTOCOL.load_strict_json_file(
            str(TRACKED_PLAN), "tracked depth18 preregistration"
        )
        cls.plan = PROTOCOL.validate_preregistration_document(raw)

    def test_tracked_plan_fixes_the_strength_lane_before_execution(self) -> None:
        self.assertEqual(self.plan["selection"]["parents"], 8_192)
        self.assertEqual(
            self.plan["selection"]["role_counts"],
            {"fit": 6_144, "tune": 1_024, "sealed": 1_024},
        )
        self.assertEqual(
            self.plan["selection"]["role_side_counts"]["sealed"],
            {"b": 512, "w": 512},
        )
        self.assertEqual(
            self.plan["source_inputs"]["hard_parent_pool"]["rows"],
            800_000,
        )
        self.assertEqual(self.plan["teacher"]["rescore_depth"], 18)
        self.assertEqual(self.plan["teacher"]["minimum_rows_per_parent"], 2)
        self.assertEqual(self.plan["training"]["epochs"], 3)
        self.assertEqual(self.plan["training"]["seeds"], 1)
        self.assertEqual(
            self.plan["source_inputs"]["live_baseline"]["identity"],
            PROTOCOL.EXPECTED_SOURCE_IDENTITIES["live_baseline"],
        )
        self.assertFalse(self.plan["forbidden"]["live_weight_write_authorized"])

    def test_plan_rejects_selection_teacher_training_and_gate_drift(self) -> None:
        mutations = {
            "parent-count": lambda value: value["selection"].__setitem__(
                "parents", 8_193
            ),
            "objective": lambda value: value.__setitem__("objective", "changed"),
            "claim": lambda value: value.__setitem__("claim_boundary", "changed"),
            "source-sha": lambda value: value["source_inputs"]["hard_parent_pool"][
                "identity"
            ].__setitem__("sha256", "0" * 64),
            "selection-extra": lambda value: value["selection"].__setitem__(
                "extra", True
            ),
            "role-count": lambda value: value["selection"]["role_counts"].__setitem__(
                "sealed", 1_023
            ),
            "old-cp-target": lambda value: value["selection"].__setitem__(
                "old_depth12_cp_role", "teacher-target"
            ),
            "depth": lambda value: value["teacher"].__setitem__("rescore_depth", 16),
            "epoch": lambda value: value["training"].__setitem__("epochs", 4),
            "threshold": lambda value: value["gates"].__setitem__(
                "fresh_screen_halfpoints_minimum", 61
            ),
            "live": lambda value: value["forbidden"].__setitem__(
                "live_weight_write_authorized", True
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(self.plan)
                mutate(changed)
                with self.assertRaises(PROTOCOL.Halfkp81Depth18StrengthError):
                    PROTOCOL.validate_preregistration_document(changed)

    def test_strict_json_rejects_noncanonical_and_nonfinite_documents(self) -> None:
        import tempfile

        for raw in (b'{"value": NaN}\n', b'{ "value":1}\n'):
            with self.subTest(raw=raw):
                with tempfile.NamedTemporaryFile() as handle:
                    handle.write(raw)
                    handle.flush()
                    with self.assertRaises(PROTOCOL.Halfkp81Depth18StrengthError):
                        PROTOCOL.load_strict_json_file(handle.name, "test")

    def test_teacher_plan_binds_selection_engine_and_exact_depth18(self) -> None:
        evidence = _selection_evidence()
        plan = _teacher_plan(evidence)
        PROTOCOL.validate_teacher_plan(
            plan,
            authenticated_selection=evidence,
            expected_source_revision=SOURCE_REVISION,
        )
        for label, mutate in {
            "revision": lambda value: value.__setitem__("source_revision", "bad"),
            "preregistration": lambda value: value["preregistration"].__setitem__(
                "sha256", "0" * 64
            ),
            "selection": lambda value: value["selection_manifest"].__setitem__(
                "sha256", "0" * 64
            ),
            "selection-evidence": lambda value: value["selection_evidence"][
                "verification"
            ].__setitem__("phase_side_quotas", False),
            "role": lambda value: value["selection_roles"].__setitem__("fit", 1),
            "depth": lambda value: value["teacher"].__setitem__("rescore_depth", 17),
            "engine": lambda value: value["engine"].__setitem__("id", "other"),
            "reused-output": lambda value: value["outputs"].__setitem__(
                "fit_jsonl", value["outputs"]["plan_json"]
            ),
            "authority": lambda value: value["authority"].__setitem__(
                "may_train", True
            ),
        }.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(plan)
                mutate(changed)
                with self.assertRaises(PROTOCOL.Halfkp81Depth18StrengthError):
                    PROTOCOL.validate_teacher_plan(
                        changed,
                        authenticated_selection=evidence,
                        expected_source_revision=SOURCE_REVISION,
                    )
        with self.assertRaisesRegex(
            PROTOCOL.Halfkp81Depth18StrengthError, "merged revision"
        ):
            PROTOCOL.validate_teacher_plan(
                plan,
                authenticated_selection=evidence,
                expected_source_revision="d" * 40,
            )

    def test_selection_jsonl_authentication_recomputes_all_formal_quotas(self) -> None:
        raw = _selection_jsonl()
        records, accounting = PROTOCOL._validate_selection_rows(raw)
        self.assertEqual(len(records), 8_192)
        self.assertEqual(accounting["unique_game_ids"], 8_192)
        self.assertEqual(
            accounting["phase_side_counts"],
            {
                "opening": {"b": 1_024, "w": 1_024},
                "mid": {"b": 1_536, "w": 1_536},
                "late": {"b": 1_536, "w": 1_536},
            },
        )
        self.assertEqual(
            accounting["role_side_counts"],
            PROTOCOL.EXPECTED_ROLE_SIDE_COUNTS,
        )

        parsed = [json.loads(line) for line in raw.splitlines()]
        for label, mutate in {
            "duplicate-game": lambda rows: rows[1].__setitem__(
                "game_id", rows[0]["game_id"]
            ),
            "phase-drift": lambda rows: rows[0].__setitem__("phase", "mid"),
            "role-quota-drift": lambda rows: rows[0].__setitem__("role", "sealed"),
            "old-target-reuse": lambda rows: rows[0].__setitem__(
                "old_depth12_signals_usage", "teacher_target"
            ),
            "semantic-id-drift": lambda rows: rows[0].__setitem__(
                "position_id", "sha256:" + "0" * 64
            ),
        }.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(parsed)
                mutate(changed)
                changed_raw = b"".join(
                    PROTOCOL.canonical_json_bytes(record) for record in changed
                )
                with self.assertRaises(PROTOCOL.Halfkp81Depth18StrengthError):
                    PROTOCOL._validate_selection_rows(changed_raw)

    def test_teacher_receipt_rejects_incomplete_shallow_or_reused_targets(self) -> None:
        evidence = _selection_evidence()
        plan = _teacher_plan(evidence)
        receipt = _receipt(plan)
        PROTOCOL.validate_teacher_receipt(
            receipt,
            expected_plan=plan,
            authenticated_selection=evidence,
            expected_source_revision=SOURCE_REVISION,
        )
        for label, mutate in {
            "parent": lambda value: value.__setitem__("completed_parents", 8_191),
            "depth": lambda value: value.__setitem__("depth", 16),
            "fault": lambda value: value.__setitem__("technical_faults", 1),
            "incomplete": lambda value: value.__setitem__("incomplete_parents", 1),
            "old-target": lambda value: value.__setitem__("old_depth12_targets", 1),
            "rows": lambda value: value.__setitem__("completed_rows", 114_689),
            "role-row-overflow": lambda value: (
                value.__setitem__("completed_rows", 110_000),
                value.__setitem__(
                    "role_rows",
                    {"fit": 6_144, "tune": 102_832, "sealed": 1_024},
                ),
            ),
            "unverified-training-authority": lambda value: value[
                "authority"
            ].__setitem__("may_build_training_plan", True),
            "self-asserted-artifact-verification": lambda value: value[
                "artifact_verification"
            ].__setitem__("held_descriptor_content_scan", True),
        }.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(receipt)
                mutate(changed)
                with self.assertRaises(PROTOCOL.Halfkp81Depth18StrengthError):
                    PROTOCOL.validate_teacher_receipt(
                        changed,
                        expected_plan=plan,
                        authenticated_selection=evidence,
                        expected_source_revision=SOURCE_REVISION,
                    )

    def test_teacher_receipt_rejects_wrong_plan_and_reused_role_output(self) -> None:
        evidence = _selection_evidence()
        plan = _teacher_plan(evidence)
        receipt = _receipt(plan)
        receipt["teacher_plan"]["sha256"] = "f" * 64
        with self.assertRaises(PROTOCOL.Halfkp81Depth18StrengthError):
            PROTOCOL.validate_teacher_receipt(
                receipt,
                expected_plan=plan,
                authenticated_selection=evidence,
                expected_source_revision=SOURCE_REVISION,
            )
        receipt = _receipt(plan)
        receipt["outputs"]["sealed"] = copy.deepcopy(receipt["outputs"]["tune"])
        with self.assertRaises(PROTOCOL.Halfkp81Depth18StrengthError):
            PROTOCOL.validate_teacher_receipt(
                receipt,
                expected_plan=plan,
                authenticated_selection=evidence,
                expected_source_revision=SOURCE_REVISION,
            )

    def test_preregistration_rejects_rows_on_identity_only_wrappers(self) -> None:
        for source in (
            "hard_parent_pool_manifest",
            "initializer_checkpoint",
            "initializer_export",
            "v9_teacher_authority_result",
        ):
            with self.subTest(source=source):
                changed = copy.deepcopy(self.plan)
                changed["source_inputs"][source]["rows"] = 1
                with self.assertRaises(PROTOCOL.Halfkp81Depth18StrengthError):
                    PROTOCOL.validate_preregistration_document(changed)


if __name__ == "__main__":
    unittest.main()
