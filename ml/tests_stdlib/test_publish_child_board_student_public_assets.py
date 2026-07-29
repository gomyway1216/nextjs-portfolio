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

import publish_child_board_student_public_assets as PUBLISHER  # noqa: E402


def _identity(path: Path) -> dict[str, object]:
    raw = path.read_bytes()
    return {
        "path": str(path.resolve()),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


class StudentPublicAssetPublisherTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.output = self.root / "student"
        self.output.mkdir()
        self.tensor = self.output / "student.f32.bin"
        self.tensor.write_bytes(b"\0" * PUBLISHER.PAYLOAD_BYTES)
        tensor_sha = hashlib.sha256(self.tensor.read_bytes()).hexdigest()
        self.protocol = {"schema": "fixture-protocol"}
        self.teachers = {"seed42": "a" * 64, "seed314159": "b" * 64}
        self.manifest = self.output / "student.manifest.json"
        self.manifest.write_text(
            json.dumps(
                {
                    "schema": PUBLISHER.MANIFEST_SCHEMA,
                    "model_schema": PUBLISHER.MODEL_SCHEMA,
                    "feature_version": PUBLISHER.FEATURE_VERSION,
                    "model_variant": PUBLISHER.MODEL_VARIANT,
                    "parameters": PUBLISHER.PARAMETERS,
                    "format": PUBLISHER.FORMAT,
                    "payload": _identity(self.tensor),
                    "tensors": [
                        {
                            "name": "fixture.weight",
                            "shape": [PUBLISHER.PARAMETERS],
                            "dtype": "float32-le",
                            "offset": 0,
                            "length": PUBLISHER.PAYLOAD_BYTES,
                            "sha256": tensor_sha,
                        }
                    ],
                    "protocol": self.protocol,
                    "teacher_hashes": self.teachers,
                },
                separators=(",", ":"),
            )
            + "\n"
        )
        self.result = self.output / "result.json"
        self._write_result(PUBLISHER.STUDENT_STATUS)
        self.registry_path = self.root / "registry.json"
        self.registry_path.write_text('{"schema":"fixture-registry"}\n')
        self.registry = {
            "outputs": {
                "public_student_assets": {
                    "tensor_path": (
                        "public/shogi-root-policy-student-v1.f32.bin"
                    ),
                    "manifest_path": (
                        "public/shogi-root-policy-student-v1.manifest.json"
                    ),
                    "tensor_url": (
                        "/shogi-root-policy-student-v1.f32.bin"
                    ),
                    "manifest_url": (
                        "/shogi-root-policy-student-v1.manifest.json"
                    ),
                }
            }
        }
        self.live_nnue = self.root / "public/shogi-nnue-weights.bin"
        self.live_nnue.parent.mkdir()
        self.live_nnue.write_bytes(b"fixture-live-nnue")
        self.receipt = self.output / "public-assets.receipt.json"

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _write_result(self, status: str) -> None:
        self.result.write_text(
            json.dumps(
                {
                    "schema": PUBLISHER.STUDENT_RESULT_SCHEMA,
                    "status": status,
                    "protocol": self.protocol,
                    "teacher_hashes": self.teachers,
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

    def _publish(self, *, check_only: bool = False):
        return PUBLISHER.publish_student_public_assets(
            repo_root=self.root,
            registry=self.registry,
            result_path=self.result,
            receipt_path=self.receipt,
            registry_path=self.registry_path,
            expected_shapes_override={
                "fixture.weight": (PUBLISHER.PARAMETERS,)
            },
            expected_live_nnue_override={
                "bytes": _identity(self.live_nnue)["bytes"],
                "sha256": _identity(self.live_nnue)["sha256"],
            },
            check_only=check_only,
        )

    def test_publishes_exact_assets_create_only_and_is_idempotent(self):
        live_before = self.live_nnue.read_bytes()
        result = self._publish()
        self.assertEqual(result["schema"], PUBLISHER.SCHEMA)
        self.assertEqual(result["status"], PUBLISHER.STATUS)
        public_tensor = (
            self.root / "public/shogi-root-policy-student-v1.f32.bin"
        )
        public_manifest = (
            self.root / "public/shogi-root-policy-student-v1.manifest.json"
        )
        self.assertEqual(public_tensor.read_bytes(), self.tensor.read_bytes())
        self.assertEqual(
            public_manifest.read_bytes(), self.manifest.read_bytes()
        )
        self.assertEqual(self.live_nnue.read_bytes(), live_before)
        receipt_before = self.receipt.read_bytes()
        self.assertEqual(self._publish(), result)
        self.assertEqual(self.receipt.read_bytes(), receipt_before)

        public_manifest.write_bytes(b"tampered")
        with self.assertRaisesRegex(
            PUBLISHER.PublicAssetPublicationError,
            "existing public student manifest drift",
        ):
            self._publish()

    def test_incomplete_terminal_result_refuses_before_publication(self):
        self._write_result("training-in-progress")
        with self.assertRaisesRegex(
            PUBLISHER.PublicAssetPublicationError,
            "not complete and locked",
        ):
            self._publish()
        self.assertFalse(
            (
                self.root
                / "public/shogi-root-policy-student-v1.f32.bin"
            ).exists()
        )
        self.assertFalse(self.receipt.exists())

    def test_check_only_validates_without_writing_public_assets(self):
        result = self._publish(check_only=True)
        self.assertEqual(result["status"], PUBLISHER.STATUS)
        self.assertFalse(
            (
                self.root
                / "public/shogi-root-policy-student-v1.f32.bin"
            ).exists()
        )
        self.assertFalse(
            (
                self.root
                / "public/shogi-root-policy-student-v1.manifest.json"
            ).exists()
        )
        self.assertFalse(self.receipt.exists())

    def test_tampered_frozen_tensor_refuses_before_publication(self):
        self.tensor.write_bytes(b"x" * PUBLISHER.PAYLOAD_BYTES)
        with self.assertRaisesRegex(
            PUBLISHER.PublicAssetPublicationError,
            "student tensor identity drift",
        ):
            self._publish()
        self.assertFalse(self.receipt.exists())


if __name__ == "__main__":
    unittest.main()
