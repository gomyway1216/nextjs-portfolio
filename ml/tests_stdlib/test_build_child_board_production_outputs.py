from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_child_board_production_outputs as BUILDER  # noqa: E402


class ProductionBuildOutputsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.build = self.root / ".next"
        self.chunks = self.build / "static/chunks"
        self.chunks.mkdir(parents=True)
        self.build_id = "fixture-build"
        (self.build / "BUILD_ID").write_text(self.build_id + "\n")
        build_static = self.build / "static" / self.build_id
        build_static.mkdir()
        (build_static / "_buildManifest.js").write_text(
            "self.__BUILD_MANIFEST={};\n"
        )
        route_manifest = (
            self.build
            / "server/app/games/shogi/page_client-reference-manifest.js"
        )
        route_manifest.parent.mkdir(parents=True)
        client_chunks = ["/_next/static/chunks/main.js"]
        route_document = {
            "clientModules": {
                BUILDER.SHOGI_CLIENT_MODULE: {
                    "chunks": client_chunks
                },
                f"{BUILDER.SHOGI_CLIENT_MODULE} <module evaluation>": {
                    "chunks": client_chunks
                },
            }
        }
        route_manifest.write_text(
            "globalThis.__RSC_MANIFEST = "
            "globalThis.__RSC_MANIFEST || {};\n"
            'globalThis.__RSC_MANIFEST["/games/shogi/page"] = '
            + json.dumps(route_document, separators=(",", ":"))
            + ";\n"
        )
        (self.chunks / "main.js").write_text(
            'e.b(t,"static/chunks/turbopack-worker-runtime.js",'
            '["static/chunks/worker.js",'
            '"static/chunks/wasm.js",'
            '"static/chunks/other.js"],r);'
            '"/_next/static/media/shogi-ai.worker.hash.ts";'
            "student_enabled"
        )
        (self.chunks / "turbopack-worker-runtime.js").write_text(
            "worker runtime"
        )
        (self.chunks / "worker.js").write_text(
            BUILDER.STUDENT_TENSOR_URL
            + BUILDER.STUDENT_MANIFEST_URL
            + BUILDER.STUDENT_MANIFEST_SCHEMA
            + "student is callable only at root ply zero"
        )
        (self.chunks / "other.js").write_text("other dependency")
        wasm_source = self.root / BUILDER.WASM_SOURCE_RELATIVE_PATH
        wasm_source.parent.mkdir(parents=True)
        wasm_source.write_bytes(b"\0asm-fixture")
        wasm_raw = wasm_source.read_bytes()
        (self.chunks / "wasm.js").write_bytes(
            base64.b64encode(wasm_raw)
            + hashlib.sha256(wasm_raw).hexdigest().encode("ascii")
            + b"WebAssembly.Module"
        )
        public = self.root / "public"
        public.mkdir()
        (public / "student.bin").write_bytes(b"student tensor")
        (public / "student.json").write_text('{"schema":"student"}\n')
        self.registry = {
            "outputs": {
                "public_student_assets": {
                    "tensor_path": "public/student.bin",
                    "tensor_url": BUILDER.STUDENT_TENSOR_URL,
                    "tensor_media_type": "application/octet-stream",
                    "manifest_path": "public/student.json",
                    "manifest_url": BUILDER.STUDENT_MANIFEST_URL,
                }
            }
        }
        self.descriptor = self.build / (
            "shogi-production-build-outputs.json"
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _produce(self):
        return BUILDER.produce_production_build_outputs(
            repo_root=self.root,
            registry=self.registry,
            descriptor_path=self.descriptor,
        )

    def test_discovers_complete_graph_and_publishes_create_only(self):
        result = self._produce()
        self.assertEqual(result["schema"], BUILDER.SCHEMA)
        self.assertEqual(
            set(result["outputs"]),
            {
                "production_build_manifest",
                "main_search_chunk",
                "student_worker_chunk",
                "wasm_asset",
                "student_tensor",
                "student_manifest",
            },
        )
        self.assertTrue(
            result["outputs"]["main_search_chunk"]["path"].endswith(
                "/main.js"
            )
        )
        self.assertTrue(
            result["outputs"]["student_worker_chunk"]["path"].endswith(
                "/worker.js"
            )
        )
        self.assertTrue(
            result["outputs"]["wasm_asset"]["path"].endswith(
                "/wasm.js"
            )
        )
        first = self.descriptor.read_bytes()
        self.assertEqual(self._produce(), result)
        self.assertEqual(self.descriptor.read_bytes(), first)
        self.descriptor.write_text('{"drift":true}\n')
        with self.assertRaisesRegex(
            BUILDER.BuildOutputsError,
            "existing production build output descriptor drift",
        ):
            self._produce()

    def test_ambiguous_student_worker_fails_before_publication(self):
        (self.chunks / "duplicate.js").write_text(
            (self.chunks / "worker.js").read_text()
        )
        main = self.chunks / "main.js"
        main.write_text(
            main.read_text().replace(
                '"static/chunks/worker.js",',
                '"static/chunks/worker.js",'
                '"static/chunks/duplicate.js",',
            )
        )
        with self.assertRaisesRegex(
            BUILDER.BuildOutputsError,
            "exactly one student-capable worker chunk is required; found 2",
        ):
            self._produce()
        self.assertFalse(self.descriptor.exists())

    def test_symlinked_worker_dependency_fails_closed(self):
        worker = self.chunks / "worker.js"
        outside = self.root / "outside-worker.js"
        outside.write_bytes(worker.read_bytes())
        worker.unlink()
        os.symlink(outside, worker)
        with self.assertRaisesRegex(
            BUILDER.BuildOutputsError,
            "crosses a symlink",
        ):
            self._produce()
        self.assertFalse(self.descriptor.exists())

    def test_malformed_build_id_fails_before_publication(self):
        (self.build / "BUILD_ID").write_text("../escape\n")
        with self.assertRaisesRegex(
            BUILDER.BuildOutputsError,
            "Next build ID is malformed",
        ):
            self._produce()
        self.assertFalse(self.descriptor.exists())


if __name__ == "__main__":
    unittest.main()
