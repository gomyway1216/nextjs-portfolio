from __future__ import annotations

import copy
from pathlib import Path
import sys
import unittest


ML_DIR = Path(__file__).resolve().parents[1]

if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import direct_teacher_halfkp81_v2_protocol as PROTOCOL  # noqa: E402


TRACKED_PROTOCOL = ML_DIR / "protocols" / "direct-teacher-halfkp81-v2-plan.json"


def _dataset_manifest(
    protocol: dict,
    protocol_identity: dict,
) -> dict:
    def exclusion(role: str) -> dict:
        return {
            "binding": copy.deepcopy(protocol["inputs"][role]),
            "parent_overlap": 0,
            "position_overlap": 0,
            "child_position_overlap": 0,
            "semantic_overlap": 0,
        }

    return {
        "schema": PROTOCOL.DATASET_MANIFEST_SCHEMA,
        "status": PROTOCOL.DATASET_STATUS,
        "protocol": {
            **protocol_identity,
            "schema": PROTOCOL.PROTOCOL_SCHEMA,
        },
        "source": copy.deepcopy(protocol["inputs"]["direct_teacher_source"]),
        "exclusions": {
            role: exclusion(role)
            for role in (
                "spent_tune_membership",
                "known_eval_union",
                "fresh_selection_protected",
                "fresh_final_protected",
                "prior_protected_union",
            )
        },
        "split": {
            **copy.deepcopy(PROTOCOL.EXPECTED_SPLIT),
            "game_overlap": 0,
            "parent_overlap": 0,
            "position_overlap": 0,
            "child_position_overlap": 0,
            "semantic_overlap": 0,
        },
        "target": {
            **copy.deepcopy(PROTOCOL.EXPECTED_TARGET),
            "non_cp_rows": 0,
            "neural_teacher_rows": 0,
            "outcome_target_rows": 0,
            "nonfinite_targets": 0,
            "conflicting_duplicate_child_ids": 0,
        },
        "accounting": {
            "source_fit_parents": 19264,
            "excluded_whole_games": 1,
            "excluded_parents": 1,
            "eligible_games": 2,
            "eligible_parents": 2,
            "eligible_rows": 2,
            "training_games": 1,
            "training_parents": 1,
            "training_rows": 1,
            "validation_games": 1,
            "validation_parents": 1,
            "validation_rows": 1,
        },
        "output": {
            role: {
                "file": f"{role}.jsonl",
                "bytes": 3,
                "sha256": "0" * 64,
                "rows": 1,
                "parents": 1,
                "games": 1,
                "row_schema": PROTOCOL.ROW_SCHEMA,
            }
            for role in ("training", "validation")
        },
        "training_started": False,
        "live_weight_write_authorized": False,
    }


class DirectTeacherHalfkp81V2ProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.protocol, cls.identity = PROTOCOL.load_strict_json_file(
            str(TRACKED_PROTOCOL), "tracked v2 protocol"
        )

    def test_tracked_protocol_fixes_the_audited_pilot(self) -> None:
        protocol = PROTOCOL.validate_protocol_document(copy.deepcopy(self.protocol))
        self.assertEqual(
            protocol["inputs"]["initializer"]["sha256"],
            "ea36d0b9f0ecdf9543daf8f77fed42577ccc38deb6a964e8df78dc8549b6a8c4",
        )
        self.assertEqual(
            protocol["inputs"]["live_weights"]["sha256"],
            "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
        )
        self.assertEqual(protocol["training"]["candidate_count"], 1)
        self.assertEqual(protocol["training"]["epochs"], 1)
        self.assertEqual(
            protocol["training"]["checkpoint_selection"], "final-epoch-1-only"
        )
        self.assertEqual(
            protocol["paired_screen"]["decision"]["minimum_candidate_halfpoints"],
            62,
        )
        self.assertFalse(protocol["paired_screen"]["decision"]["strength_claim"])
        self.assertFalse(protocol["current_state"]["live_weights_changed"])

    def test_rejects_every_decision_relevant_protocol_drift(self) -> None:
        mutations = {
            "initializer": lambda value: value["inputs"]["initializer"].__setitem__(
                "sha256", "0" * 64
            ),
            "tune": lambda value: value["inputs"]["spent_tune_membership"].__setitem__(
                "v9_tune_parents", 4410
            ),
            "split": lambda value: value["split"].__setitem__("validation_percent", 20),
            "objective": lambda value: value["training"].__setitem__("rank_weight", 1),
            "epoch": lambda value: value["training"].__setitem__("epochs", 2),
            "threshold": lambda value: value["paired_screen"]["decision"].__setitem__(
                "minimum_candidate_halfpoints", 61
            ),
            "live": lambda value: value["current_state"].__setitem__(
                "live_weights_changed", True
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(self.protocol)
                mutate(changed)
                with self.assertRaises(PROTOCOL.DirectTeacherHalfkpV2Error):
                    PROTOCOL.validate_protocol_document(changed)

    def test_future_dataset_manifest_requires_all_zero_overlap_proofs(self) -> None:
        protocol = PROTOCOL.validate_protocol_document(copy.deepcopy(self.protocol))
        protocol_identity = {
            "path": self.identity["path"],
            "bytes": self.identity["bytes"],
            "sha256": self.identity["sha256"],
        }
        manifest = _dataset_manifest(protocol, protocol_identity)
        PROTOCOL.validate_dataset_manifest_document(
            manifest,
            protocol=protocol,
            protocol_identity=protocol_identity,
        )
        manifest["exclusions"]["spent_tune_membership"]["parent_overlap"] = 1
        with self.assertRaisesRegex(
            PROTOCOL.DirectTeacherHalfkpV2Error, "spent_tune_membership"
        ):
            PROTOCOL.validate_dataset_manifest_document(
                manifest,
                protocol=protocol,
                protocol_identity=protocol_identity,
            )

    def test_future_dataset_manifest_rejects_role_and_authority_drift(self) -> None:
        protocol = PROTOCOL.validate_protocol_document(copy.deepcopy(self.protocol))
        protocol_identity = {
            "path": self.identity["path"],
            "bytes": self.identity["bytes"],
            "sha256": self.identity["sha256"],
        }
        mutations = {
            "cross-game": lambda item: item["split"].__setitem__("game_overlap", 1),
            "neural target": lambda item: item["target"].__setitem__(
                "neural_teacher_rows", 1
            ),
            "outcome": lambda item: item["target"].__setitem__(
                "outcome_target_rows", 1
            ),
            "write": lambda item: item.__setitem__(
                "live_weight_write_authorized", True
            ),
            "training": lambda item: item.__setitem__("training_started", True),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                manifest = _dataset_manifest(protocol, protocol_identity)
                mutate(manifest)
                with self.assertRaises(PROTOCOL.DirectTeacherHalfkpV2Error):
                    PROTOCOL.validate_dataset_manifest_document(
                        manifest,
                        protocol=protocol,
                        protocol_identity=protocol_identity,
                    )

    def test_strict_json_rejects_duplicate_keys_and_nonfinite_numbers(self) -> None:
        with self.assertRaisesRegex(PROTOCOL.DirectTeacherHalfkpV2Error, "duplicate"):
            PROTOCOL.strict_json_bytes(b'{"schema":"a","schema":"b"}\n', "duplicate")
        with self.assertRaisesRegex(PROTOCOL.DirectTeacherHalfkpV2Error, "non-finite"):
            PROTOCOL.strict_json_bytes(b'{"value":NaN}\n', "nonfinite")


if __name__ == "__main__":
    unittest.main()
