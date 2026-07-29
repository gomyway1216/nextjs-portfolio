from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_child_board_production_receipt as BUILDER  # noqa: E402


def _identity(path: Path) -> dict[str, object]:
    raw = path.read_bytes()
    return {
        "path": str(path.resolve()),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


class ProductionBuildReceiptTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.student = self.root / "student"
        self.student.mkdir()
        self.tensor = self.student / "tensor.bin"
        self.manifest = self.student / "manifest.json"
        self.tensor.write_bytes(b"frozen-tensor")
        self.manifest.write_bytes(b'{"schema":"student"}\n')
        self.result = self.student / "result.json"
        self.result.write_text(
            json.dumps(
                {
                    "schema": (
                        "shogi-child-board-root-policy-student-"
                        "runtime-result-v1"
                    ),
                    "status": BUILDER.STUDENT_STATUS,
                    "runtime_artifacts": {
                        "tensor": _identity(self.tensor),
                        "manifest": _identity(self.manifest),
                    },
                    "tune_opened": False,
                    "sealed_opened": False,
                    "live_weights_changed": False,
                },
                separators=(",", ":"),
            )
            + "\n"
        )
        self.registry = {
            "outputs": {
                "student_runtime": {"result": str(self.result)},
                "tune": {
                    "opened_marker": str(self.root / "tune/opened.json"),
                    "pending_result": str(self.root / "tune/pending.json"),
                    "result": str(self.root / "tune/result.json"),
                },
                "sealed": {
                    "opened_marker": str(self.root / "sealed/opened.json"),
                    "pending_result": str(self.root / "sealed/pending.json"),
                    "result": str(self.root / "sealed/result.json"),
                },
            }
        }
        roles = {"student_runtime", *BUILDER.SOURCE_PATHS}
        self.sources = {}
        for role in roles:
            path = self.root / "sources" / f"{role}.bin"
            path.parent.mkdir(exist_ok=True)
            path.write_bytes(f"source-{role}".encode())
            self.sources[role] = path
        output_paths = {}
        for role in BUILDER.OUTPUT_ROLES:
            if role == "student_tensor":
                path = self.tensor
            elif role == "student_manifest":
                path = self.manifest
            else:
                path = self.root / "build" / f"{role}.bin"
                path.parent.mkdir(exist_ok=True)
                path.write_bytes(f"output-{role}".encode())
            output_paths[role] = {
                "path": str(path),
                "media_type": "application/octet-stream",
                "url": f"/{role}",
            }
        self.descriptor = self.root / "outputs.json"
        self.descriptor.write_text(
            json.dumps(
                {
                    "schema": (
                        "shogi-child-board-root-policy-"
                        "production-build-outputs-v1"
                    ),
                    "outputs": output_paths,
                },
                separators=(",", ":"),
            )
            + "\n"
        )
        self.receipt = self.student / "production-build-receipt.json"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_complete_graph_is_content_addressed_and_create_only(self):
        environment = {
            "node": "v22.test",
            "npm": "10.test",
            "next": "16.test",
            "typescript": "5.test",
            "os": "Darwin",
            "architecture": "arm64",
            "build_command": ["npm", "run", "build"],
            "environment_allowlist": {},
            "source_git_commit": "a" * 40,
            "clean_tracked_tree_sha256": "b" * 40,
        }
        result = BUILDER.produce_production_build_receipt(
            repo_root=self.root,
            registry=self.registry,
            outputs_descriptor_path=self.descriptor,
            result_path=self.receipt,
            run_build=False,
            source_paths_override=self.sources,
            environment_override=environment,
        )
        self.assertEqual(result["schema"], BUILDER.SCHEMA)
        self.assertEqual(result["status"], BUILDER.STATUS)
        self.assertEqual(set(result["outputs"]), set(BUILDER.OUTPUT_ROLES))
        first = self.receipt.read_bytes()
        repeated = BUILDER.produce_production_build_receipt(
            repo_root=self.root,
            registry=self.registry,
            outputs_descriptor_path=self.descriptor,
            result_path=self.receipt,
            run_build=False,
            source_paths_override=self.sources,
            environment_override=environment,
        )
        self.assertEqual(repeated, result)
        self.assertEqual(self.receipt.read_bytes(), first)
        output_path = Path(
            result["outputs"]["main_search_chunk"]["path"]
        )
        output_path.write_bytes(b"post-receipt-tamper")
        with self.assertRaisesRegex(
            BUILDER.BuildReceiptError,
            "existing outputs identity drift: main_search_chunk",
        ):
            BUILDER.produce_production_build_receipt(
                repo_root=self.root,
                registry=self.registry,
                outputs_descriptor_path=self.descriptor,
                result_path=self.receipt,
                run_build=False,
                source_paths_override=self.sources,
                environment_override=environment,
            )

    def test_tampered_frozen_student_refuses_before_publication(self):
        self.tensor.write_bytes(b"tampered")
        with self.assertRaisesRegex(
            BUILDER.BuildReceiptError, "student tensor identity drift"
        ):
            BUILDER.produce_production_build_receipt(
                repo_root=self.root,
                registry=self.registry,
                outputs_descriptor_path=self.descriptor,
                result_path=self.receipt,
                run_build=False,
                source_paths_override=self.sources,
                environment_override={},
            )
        self.assertFalse(self.receipt.exists())


if __name__ == "__main__":
    unittest.main()
