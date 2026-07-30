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

import direct_teacher_halfkp81_v2_protocol as V2  # noqa: E402
import direct_teacher_halfkp81_v3_cpu_protocol as PROTOCOL  # noqa: E402
import rebind_direct_teacher_halfkp81_v3_cpu_dataset as REBIND  # noqa: E402


TRACKED_PROTOCOL = ML_DIR / "protocols" / "direct-teacher-halfkp81-v3-cpu-plan.json"


def _metadata_manifest(
    protocol: dict,
    protocol_identity: dict,
    terminal_identity: dict,
) -> dict:
    return {
        "schema": PROTOCOL.MANIFEST_SCHEMA,
        "status": "complete-metadata-only-byte-identical-rebind",
        "mode": "metadata-only-exact-existing-jsonl-no-row-generation",
        "protocol": {
            **protocol_identity,
            "schema": PROTOCOL.PROTOCOL_SCHEMA,
        },
        "predecessor_terminal": {
            **terminal_identity,
            "schema": PROTOCOL.TERMINAL_SCHEMA,
            "status": PROTOCOL.TERMINAL_STATUS,
        },
        "source_manifest": copy.deepcopy(protocol["source_dataset"]["manifest"]),
        "datasets": {
            role: {
                **copy.deepcopy(protocol["source_dataset"][role]),
                "row_schema": PROTOCOL.ROW_SCHEMA,
            }
            for role in ("training", "validation")
        },
        "accounting": {
            "source_rows_read": sum(
                protocol["source_dataset"][role]["rows"]
                for role in ("training", "validation")
            ),
            "row_bytes_written": 0,
            "jsonl_files_created": 0,
            "jsonl_files_copied": 0,
            "jsonl_files_hardlinked": 0,
            "cross_role_overlap_counts": {
                "game_ids": 0,
                "parent_ids": 0,
                "position_ids": 0,
                "child_position_ids": 0,
                "semantic_position_ids": 0,
            },
        },
        "authority": {
            "metadata_rebind_complete": True,
            "optimizer_creation_authorized": False,
            "training_started": False,
            "paired56_authorized": False,
            "live_weight_write_authorized": False,
        },
    }


class DirectTeacherHalfkp81V3CpuProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.protocol, cls.protocol_identity = PROTOCOL.load_strict_json_file(
            str(TRACKED_PROTOCOL), "tracked v3 CPU protocol"
        )
        cls.terminal_identity = {
            "path": "/tmp/v2-terminal.json",
            "bytes": 100,
            "sha256": "f" * 64,
        }

    def test_tracked_protocol_changes_only_device_from_v2_training(self) -> None:
        protocol = PROTOCOL.validate_protocol_document(copy.deepcopy(self.protocol))
        differences = {
            field
            for field in protocol["training"]
            if protocol["training"][field] != V2.EXPECTED_TRAINING[field]
        }
        self.assertEqual(differences, {"device"})
        self.assertEqual(protocol["training"]["device"], "cpu")
        self.assertEqual(protocol["cpu_execution"]["torch_num_threads"], 14)
        self.assertEqual(protocol["cpu_execution"]["torch_num_interop_threads"], 14)
        self.assertEqual(protocol["capability_probe"]["rows"], 2048)
        self.assertEqual(
            protocol["static_sanity"]["checks"],
            V2.EXPECTED_STATIC_SANITY["checks"],
        )
        self.assertEqual(protocol["paired_screen"], V2.EXPECTED_PAIRED_SCREEN)

    def test_protocol_rejects_recipe_cpu_probe_and_gate_drift(self) -> None:
        mutations = {
            "learning-rate": lambda value: value["training"].__setitem__(
                "learning_rate", 0.000004
            ),
            "threads": lambda value: value["cpu_execution"].__setitem__(
                "torch_num_threads", 13
            ),
            "probe": lambda value: value["capability_probe"].__setitem__("rows", 1024),
            "static": lambda value: value["static_sanity"]["checks"].__setitem__(
                "teacher_mae_cp_improvement_minimum", 0
            ),
            "paired": lambda value: value["paired_screen"]["decision"].__setitem__(
                "minimum_candidate_halfpoints", 61
            ),
            "state": lambda value: value["current_state"].__setitem__(
                "training_started", True
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(self.protocol)
                mutate(changed)
                with self.assertRaises(PROTOCOL.DirectTeacherHalfkpV3CpuError):
                    PROTOCOL.validate_protocol_document(changed)

    def test_v2_terminal_requires_exact_zero_training_technical_stop(self) -> None:
        protocol = PROTOCOL.validate_protocol_document(copy.deepcopy(self.protocol))
        predecessor = protocol["predecessor"]
        terminal = {
            "schema": PROTOCOL.TERMINAL_SCHEMA,
            "status": PROTOCOL.TERMINAL_STATUS,
            "evidence": {
                "claim": copy.deepcopy(predecessor["claim"]),
                "execution_plan": copy.deepcopy(predecessor["execution_plan"]),
                "failure_log": copy.deepcopy(predecessor["failure_log"]),
                "initializer_export": copy.deepcopy(predecessor["initializer_export"]),
                "live_weights": {
                    "path": "/tmp/live.bin",
                    "bytes": protocol["inputs"]["live_weights"]["bytes"],
                    "sha256": protocol["inputs"]["live_weights"]["sha256"],
                },
                "pipeline_revision": predecessor["pipeline_revision"],
                "output_directory": str(
                    Path(predecessor["initializer_export"]["path"]).parent
                ),
            },
            "observed_state": copy.deepcopy(PROTOCOL.EXPECTED_TERMINAL_OBSERVED),
            "decision": copy.deepcopy(PROTOCOL.EXPECTED_TERMINAL_DECISION),
            "authority": copy.deepcopy(PROTOCOL.EXPECTED_TERMINAL_AUTHORITY),
        }
        PROTOCOL.validate_terminal_result(terminal, protocol=protocol)
        mutations = {
            "optimizer": lambda value: value["observed_state"].__setitem__(
                "optimizer_created", True
            ),
            "row": lambda value: value["observed_state"].__setitem__(
                "training_rows", 1
            ),
            "retry": lambda value: value["decision"].__setitem__(
                "old_execution_plan_retry_authorized", True
            ),
            "strength": lambda value: value["authority"].__setitem__(
                "playing_strength_evidence", True
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(terminal)
                mutate(changed)
                with self.assertRaises(PROTOCOL.DirectTeacherHalfkpV3CpuError):
                    PROTOCOL.validate_terminal_result(changed, protocol=protocol)

    def test_metadata_manifest_rebinds_exact_bytes_without_copy_or_authority(
        self,
    ) -> None:
        protocol = PROTOCOL.validate_protocol_document(copy.deepcopy(self.protocol))
        manifest = _metadata_manifest(
            protocol, self.protocol_identity, self.terminal_identity
        )
        validated = PROTOCOL.validate_metadata_manifest(
            manifest,
            protocol=protocol,
            protocol_identity=self.protocol_identity,
            terminal_identity=self.terminal_identity,
        )
        self.assertEqual(validated["accounting"]["row_bytes_written"], 0)
        self.assertEqual(validated["accounting"]["jsonl_files_created"], 0)
        self.assertFalse(validated["authority"]["optimizer_creation_authorized"])
        self.assertFalse(validated["authority"]["live_weight_write_authorized"])

    def test_metadata_manifest_rejects_row_rewrite_overlap_and_authority(self) -> None:
        protocol = PROTOCOL.validate_protocol_document(copy.deepcopy(self.protocol))
        mutations = {
            "write": lambda value: value["accounting"].__setitem__(
                "row_bytes_written", 1
            ),
            "copy": lambda value: value["accounting"].__setitem__(
                "jsonl_files_copied", 1
            ),
            "overlap": lambda value: value["accounting"][
                "cross_role_overlap_counts"
            ].__setitem__("parent_ids", 1),
            "optimizer": lambda value: value["authority"].__setitem__(
                "optimizer_creation_authorized", True
            ),
            "dataset": lambda value: value["datasets"]["training"].__setitem__(
                "sha256", "0" * 64
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                manifest = _metadata_manifest(
                    protocol, self.protocol_identity, self.terminal_identity
                )
                mutate(manifest)
                with self.assertRaises(PROTOCOL.DirectTeacherHalfkpV3CpuError):
                    PROTOCOL.validate_metadata_manifest(
                        manifest,
                        protocol=protocol,
                        protocol_identity=self.protocol_identity,
                        terminal_identity=self.terminal_identity,
                    )

    def test_metadata_rebind_scans_actual_canonical_id_sets(self) -> None:
        row = {
            "schema": V2.ROW_SCHEMA,
            "role": "training",
            "game_id": "sha256:" + "1" * 64,
            "parent_id": "sha256:" + "2" * 64,
            "position_id": "sha256:" + "3" * 64,
            "child_position_id": "sha256:" + "4" * 64,
            "child_sfen": "9/9/9/9/9/9/9/9/9 b - 1",
            "teacher_child_cp": 100,
            "teacher_score_kind": "cp",
            "source_row_sha256": "5" * 64,
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "training.jsonl"
            path.write_bytes(V2.canonical_json_bytes(row))
            sets = REBIND._actual_role_sets(str(path), role="training")
            self.assertEqual(sets["game_ids"], {row["game_id"]})
            self.assertEqual(sets["parent_ids"], {row["parent_id"]})
            self.assertEqual(sets["position_ids"], {row["position_id"]})
            self.assertEqual(sets["child_position_ids"], {row["child_position_id"]})
            self.assertEqual(
                sets["semantic_position_ids"],
                {row["position_id"], row["child_position_id"]},
            )

            path.write_text(json.dumps(row) + "\n")
            with self.assertRaisesRegex(
                PROTOCOL.DirectTeacherHalfkpV3CpuError, "contract differs"
            ):
                REBIND._actual_role_sets(str(path), role="training")


if __name__ == "__main__":
    unittest.main()
