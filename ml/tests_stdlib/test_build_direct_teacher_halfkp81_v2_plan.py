from __future__ import annotations

import copy
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_direct_teacher_halfkp81_v2_plan as BUILDER  # noqa: E402
import direct_teacher_halfkp81_v2_protocol as PROTOCOL  # noqa: E402
from ml.tests_stdlib.test_direct_teacher_halfkp81_v2_protocol import (  # noqa: E402
    _dataset_manifest,
)


def _identity(path: str, raw: bytes, **extra) -> dict:
    return {
        "path": path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        **extra,
    }


def _pid(number: int) -> str:
    return f"sha256:{number:064x}"


def _dataset_row(role: str, offset: int) -> dict:
    return {
        "schema": PROTOCOL.ROW_SCHEMA,
        "role": role,
        "game_id": _pid(offset),
        "parent_id": _pid(offset + 10),
        "position_id": _pid(offset + 20),
        "child_position_id": _pid(offset + 30),
        "child_sfen": "9/9/9/9/9/9/9/9/9 b - 1",
        "teacher_child_cp": offset,
        "teacher_score_kind": "cp",
        "source_row_sha256": f"{offset:064x}",
    }


def _id_digest(identifier: str) -> str:
    return hashlib.sha256((identifier + "\n").encode("ascii")).hexdigest()


class DirectTeacherHalfkp81V2PlanBuilderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "public").mkdir()
        (self.root / "ml" / "protocols").mkdir(parents=True)
        (self.root / "external").mkdir()
        (self.root / "dataset").mkdir()

        self.raw = {
            "initializer": b"synthetic-halfkp-initializer",
            "live_weights": b"synthetic-live-weights",
            "direct_teacher_source": b"{}\n{}\n",
            "spent_tune_result": b'{"status":"closed"}\n',
            "spent_tune_membership": b'{"membership":"spent"}\n',
            "fresh_selection_protected": b"sha256:" + b"1" * 64 + b"\n",
            "fresh_final_protected": b"sha256:" + b"2" * 64 + b"\n",
            "prior_protected_union": b'{"protected":"union"}\n',
        }
        paths = {
            "initializer": self.root / "external" / "initializer.pt",
            "live_weights": self.root / "public" / "shogi-nnue-weights.bin",
            "direct_teacher_source": self.root / "external" / "v9.jsonl",
            "spent_tune_result": self.root / "external" / "tune-result.json",
            "spent_tune_membership": (
                self.root / "ml" / "protocols" / "tune-membership.json"
            ),
            "fresh_selection_protected": (
                self.root / "external" / "selection-protected.txt"
            ),
            "fresh_final_protected": (self.root / "external" / "final-protected.txt"),
            "prior_protected_union": self.root / "external" / "student-result.json",
        }
        for role, path in paths.items():
            path.write_bytes(self.raw[role])

        self.inputs = copy.deepcopy(PROTOCOL.EXPECTED_INPUTS)
        self.inputs["initializer"] = _identity(
            "external/initializer.pt",
            self.raw["initializer"],
            role="frozen-alpha-0.50-halfkp81-initializer",
        )
        self.inputs["live_weights"] = _identity(
            "public/shogi-nnue-weights.bin",
            self.raw["live_weights"],
            role="immutable-live-baseline-never-writable",
        )
        self.inputs["direct_teacher_source"] = _identity(
            "external/v9.jsonl",
            self.raw["direct_teacher_source"],
            rows=2,
            parents=2,
            games=2,
            fit_parents=19264,
            tune_parents=4411,
            fit_component_assignments_sha256="a" * 64,
            role="v9-fit-direct-yaneuraou-depth16-child-cp-only",
        )
        self.inputs["spent_tune_result"] = _identity(
            "external/tune-result.json",
            self.raw["spent_tune_result"],
            schema="shogi-child-board-strength-candidate-tune-result-v1",
            status="complete-one-shot-tune-fail-lane-closed",
            role="spent-evidence-membership-exclusion-only",
        )
        self.inputs["spent_tune_membership"] = _identity(
            "ml/protocols/tune-membership.json",
            self.raw["spent_tune_membership"],
            browser_tune_parents=196,
            v9_tune_parents=4411,
            role="permanent-parent-and-semantic-exclusion",
        )
        for role, count in (
            ("fresh_selection_protected", 1),
            ("fresh_final_protected", 1),
        ):
            self.inputs[role] = _identity(
                f"external/{'selection' if role == 'fresh_selection_protected' else 'final'}-protected.txt",
                self.raw[role],
                count=count,
                identifiers_sha256=hashlib.sha256(self.raw[role][:-1]).hexdigest(),
                format=PROTOCOL.POSITION_ID_SET_FORMAT,
                role="permanent-semantic-exclusion",
            )
        self.inputs["prior_protected_union"] = {
            "count": 1,
            "sha256": "b" * 64,
            "source_result_path": "external/student-result.json",
            "source_result_bytes": len(self.raw["prior_protected_union"]),
            "source_result_sha256": hashlib.sha256(
                self.raw["prior_protected_union"]
            ).hexdigest(),
            "role": "aggregate-membership-cross-check-and-permanent-exclusion",
        }

        tracked, _tracked_identity = PROTOCOL.load_strict_json_file(
            str(ML_DIR / "protocols" / "direct-teacher-halfkp81-v2-plan.json"),
            "tracked protocol",
        )
        self.protocol = copy.deepcopy(tracked)
        self.protocol["inputs"] = copy.deepcopy(self.inputs)
        self.protocol["data_firewall"]["fit_parent_membership"][
            "component_assignments_sha256"
        ] = "a" * 64
        self.protocol_path = self.root / "ml" / "protocols" / "direct-teacher-v2.json"
        self.protocol_path.write_bytes(PROTOCOL.canonical_json_bytes(self.protocol))

        self.training_row = _dataset_row("training", 1)
        self.validation_row = _dataset_row("validation", 2)
        self.training_raw = PROTOCOL.canonical_json_bytes(self.training_row)
        self.validation_raw = PROTOCOL.canonical_json_bytes(self.validation_row)
        (self.root / "dataset" / "training.jsonl").write_bytes(self.training_raw)
        (self.root / "dataset" / "validation.jsonl").write_bytes(self.validation_raw)

    def _manifest(self) -> dict:
        protocol_identity, _ = PROTOCOL.stable_file_identity(
            str(self.protocol_path), "synthetic protocol"
        )
        manifest = _dataset_manifest(self.protocol, protocol_identity)
        for role, raw, row in (
            ("training", self.training_raw, self.training_row),
            ("validation", self.validation_raw, self.validation_row),
        ):
            manifest["output"][role] = {
                "file": f"{role}.jsonl",
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "rows": 1,
                "parents": 1,
                "games": 1,
                "row_schema": PROTOCOL.ROW_SCHEMA,
                "game_ids_sha256": _id_digest(row["game_id"]),
                "parent_ids_sha256": _id_digest(row["parent_id"]),
                "position_ids_sha256": _id_digest(row["position_id"]),
                "child_position_ids_sha256": _id_digest(
                    row["child_position_id"]
                ),
                "semantic_position_ids_sha256": PROTOCOL.id_set_sha256(
                    (row["position_id"], row["child_position_id"])
                ),
            }
        return manifest

    def _build(self) -> dict:
        manifest_path = self.root / "dataset" / "manifest.json"
        manifest_path.write_bytes(PROTOCOL.canonical_json_bytes(self._manifest()))
        with mock.patch.object(PROTOCOL, "EXPECTED_INPUTS", copy.deepcopy(self.inputs)):
            return BUILDER.build_execution_plan(
                protocol_path=str(self.protocol_path),
                dataset_manifest_path=str(manifest_path),
                repo_root=str(self.root),
            )

    def test_binds_verified_files_without_granting_live_authority(self) -> None:
        plan = self._build()
        self.assertEqual(plan["schema"], PROTOCOL.EXECUTION_PLAN_SCHEMA)
        self.assertEqual(plan["training"], PROTOCOL.EXPECTED_TRAINING)
        self.assertEqual(plan["inputs"]["training_dataset"]["rows"], 1)
        self.assertEqual(plan["inputs"]["validation_dataset"]["rows"], 1)
        self.assertTrue(plan["authority"]["optimizer_creation_authorized"])
        self.assertFalse(plan["authority"]["expanded_stage_authorized"])
        self.assertFalse(plan["authority"]["live_weight_write_authorized"])

    def test_rejects_dataset_file_drift_and_protected_overlap(self) -> None:
        manifest_path = self.root / "dataset" / "manifest.json"
        manifest = self._manifest()
        manifest_path.write_bytes(PROTOCOL.canonical_json_bytes(manifest))
        (self.root / "dataset" / "training.jsonl").write_bytes(
            self.training_raw + b"{}\n"
        )
        with mock.patch.object(
            PROTOCOL, "EXPECTED_INPUTS", copy.deepcopy(self.inputs)
        ), self.assertRaisesRegex(
            PROTOCOL.DirectTeacherHalfkpV2Error, "training pilot dataset"
        ):
            BUILDER.build_execution_plan(
                protocol_path=str(self.protocol_path),
                dataset_manifest_path=str(manifest_path),
                repo_root=str(self.root),
            )
        (self.root / "dataset" / "training.jsonl").write_bytes(self.training_raw)
        manifest["exclusions"]["fresh_final_protected"]["semantic_overlap"] = 1
        manifest_path.write_bytes(PROTOCOL.canonical_json_bytes(manifest))
        with mock.patch.object(
            PROTOCOL, "EXPECTED_INPUTS", copy.deepcopy(self.inputs)
        ), self.assertRaisesRegex(
            PROTOCOL.DirectTeacherHalfkpV2Error, "fresh_final_protected"
        ):
            BUILDER.build_execution_plan(
                protocol_path=str(self.protocol_path),
                dataset_manifest_path=str(manifest_path),
                repo_root=str(self.root),
            )

    def test_recomputes_dataset_id_set_receipts_from_rows(self) -> None:
        manifest_path = self.root / "dataset" / "manifest.json"
        manifest = self._manifest()
        manifest["output"]["training"]["game_ids_sha256"] = "f" * 64
        manifest_path.write_bytes(PROTOCOL.canonical_json_bytes(manifest))
        with mock.patch.object(
            PROTOCOL, "EXPECTED_INPUTS", copy.deepcopy(self.inputs)
        ), self.assertRaisesRegex(
            PROTOCOL.DirectTeacherHalfkpV2Error, "ID-set receipt"
        ):
            BUILDER.build_execution_plan(
                protocol_path=str(self.protocol_path),
                dataset_manifest_path=str(manifest_path),
                repo_root=str(self.root),
            )

    def test_publication_is_canonical_create_only(self) -> None:
        plan = self._build()
        output = self.root / "out" / "execution-plan.json"
        identity = BUILDER.publish_create_only(plan, str(output))
        self.assertEqual(output.read_bytes(), PROTOCOL.canonical_json_bytes(plan))
        self.assertEqual(identity["bytes"], output.stat().st_size)
        with self.assertRaisesRegex(PROTOCOL.DirectTeacherHalfkpV2Error, "overwrite"):
            BUILDER.publish_create_only(plan, str(output))

    def test_validate_only_receipt_has_zero_execution_authority(self) -> None:
        with mock.patch.object(PROTOCOL, "EXPECTED_INPUTS", copy.deepcopy(self.inputs)):
            _protocol, _identity, receipt = BUILDER.validate_preregistration(
                protocol_path=str(self.protocol_path)
            )
        self.assertEqual(
            receipt["status"], "valid-preregistered-protocol-no-data-opened"
        )
        self.assertFalse(receipt["authority"]["optimizer_creation_authorized"])
        self.assertFalse(receipt["authority"]["live_weight_write_authorized"])


if __name__ == "__main__":
    unittest.main()
