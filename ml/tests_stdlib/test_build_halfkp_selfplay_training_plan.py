from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
MODULE_PATH = ML_DIR / "build-halfkp-selfplay-training-plan.py"
SPEC = importlib.util.spec_from_file_location("halfkp_selfplay_plan_builder", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


def _identity(file: str, raw: bytes, records: int) -> dict[str, object]:
    return {
        "file": file,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "records": records,
        "games": records,
        "unique_positions": records,
        "row_schema": BUILDER.ROW_SCHEMA,
    }


class HalfkpSelfplayTrainingPlanBuilderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.dataset = self.root / "dataset"
        self.dataset.mkdir()
        self.train_raw = b'{"split":"train"}\n{"split":"train"}\n'
        self.validation_raw = b'{"split":"val"}\n'
        (self.dataset / "train.jsonl").write_bytes(self.train_raw)
        (self.dataset / "val.jsonl").write_bytes(self.validation_raw)
        self.manifest = {
            "schema": BUILDER.DATASET_MANIFEST_SCHEMA,
            "live_weight_write_authorized": False,
            "output": {
                "train": _identity("train.jsonl", self.train_raw, 2),
                "validation": _identity("val.jsonl", self.validation_raw, 1),
            },
        }
        self.manifest_path = self.dataset / "manifest.json"
        self.manifest_path.write_bytes(BUILDER.canonical_json_bytes(self.manifest))
        self.initializer = self.root / "champion.pt"
        self.initializer.write_bytes(b"synthetic-safe-checkpoint")

    def _build(self) -> dict[str, object]:
        return BUILDER.build_training_plan(
            dataset_manifest_path=str(self.manifest_path),
            dataset_dir=str(self.dataset),
            initializer_path=str(self.initializer),
        )

    def _rewrite_manifest(self) -> None:
        self.manifest_path.write_bytes(BUILDER.canonical_json_bytes(self.manifest))

    def test_builds_exact_trainer_contract_with_two_bound_arms(self) -> None:
        plan = self._build()
        self.assertEqual(plan["schema"], BUILDER.TRAINING_PLAN_SCHEMA)
        inputs = plan["inputs"]
        self.assertEqual(inputs["training_dataset"]["rows"], 2)
        self.assertEqual(inputs["validation_dataset"]["rows"], 1)
        self.assertEqual(inputs["training_dataset"]["row_schema"], BUILDER.ROW_SCHEMA)
        self.assertTrue(os.path.isabs(inputs["champion_initializer"]["path"]))
        self.assertEqual(plan["training"]["features"], "halfkp-factor")
        self.assertEqual(plan["training"]["loss"], "sigmoid")
        self.assertEqual(plan["training"]["epochs"], 2)
        self.assertEqual(plan["training"]["batch"], 256)
        self.assertEqual(plan["training"]["learning_rate"], 3e-6)
        self.assertEqual(plan["training"]["k"], 600.0)
        self.assertEqual(plan["training"]["cp_clamp"], 3000)
        self.assertEqual(plan["training"]["device"], "mps")
        self.assertEqual(plan["training"]["seed"], 42)
        arms = plan["training"]["prospective_arms"]
        self.assertEqual(
            [(arm["search_score_fraction"], arm["wdl_mix"]) for arm in arms],
            [(0.50, 0.50), (0.75, 0.25)],
        )
        for arm in arms:
            self.assertEqual(
                arm["training_dataset_sha256"],
                inputs["training_dataset"]["sha256"],
            )
            self.assertEqual(
                arm["validation_dataset_sha256"],
                inputs["validation_dataset"]["sha256"],
            )
            self.assertEqual(
                arm["initializer_sha256"],
                inputs["champion_initializer"]["sha256"],
            )
        self.assertNotIn("live_weight_write_authorized", plan)

    def test_publishes_canonical_fresh_file_without_overwrite(self) -> None:
        output = self.root / "training-plan.json"
        plan, identity = BUILDER.build_and_publish(
            dataset_manifest_path=str(self.manifest_path),
            dataset_dir=str(self.dataset),
            initializer_path=str(self.initializer),
            out_path=str(output),
        )
        raw = output.read_bytes()
        self.assertEqual(raw, BUILDER.canonical_json_bytes(plan))
        self.assertEqual(identity["path"], os.path.realpath(output))
        self.assertEqual(identity["bytes"], len(raw))
        self.assertEqual(identity["sha256"], hashlib.sha256(raw).hexdigest())
        with self.assertRaisesRegex(BUILDER.SelfplayTrainingPlanError, "overwrite"):
            BUILDER.build_and_publish(
                dataset_manifest_path=str(self.manifest_path),
                dataset_dir=str(self.dataset),
                initializer_path=str(self.initializer),
                out_path=str(output),
            )
        self.assertEqual(output.read_bytes(), raw)

    def test_rejects_dataset_bytes_that_differ_from_manifest(self) -> None:
        (self.dataset / "train.jsonl").write_bytes(self.train_raw + b"{}\n")
        with self.assertRaisesRegex(
            BUILDER.SelfplayTrainingPlanError, "bytes/SHA-256 differ"
        ):
            self._build()

    def test_rejects_declared_record_count_that_differs_from_jsonl(self) -> None:
        self.manifest["output"]["validation"]["records"] = 2
        self._rewrite_manifest()
        with self.assertRaisesRegex(BUILDER.SelfplayTrainingPlanError, "manifest declares"):
            self._build()

    def test_rejects_unsafe_dataset_filename_and_live_authority(self) -> None:
        self.manifest["output"]["train"]["file"] = "../train.jsonl"
        self._rewrite_manifest()
        with self.assertRaisesRegex(BUILDER.SelfplayTrainingPlanError, "safe basename"):
            self._build()
        self.manifest["output"]["train"]["file"] = "train.jsonl"
        self.manifest["live_weight_write_authorized"] = True
        self._rewrite_manifest()
        with self.assertRaisesRegex(BUILDER.SelfplayTrainingPlanError, "must not authorize"):
            self._build()

    def test_rejects_duplicate_manifest_keys_and_dataset_symlinks(self) -> None:
        self.manifest_path.write_bytes(
            b'{"schema":"x","schema":"y","output":{}}\n'
        )
        with self.assertRaisesRegex(BUILDER.SelfplayTrainingPlanError, "duplicate JSON key"):
            self._build()
        self._rewrite_manifest()
        (self.dataset / "train.jsonl").unlink()
        (self.dataset / "actual.jsonl").write_bytes(self.train_raw)
        (self.dataset / "train.jsonl").symlink_to("actual.jsonl")
        with self.assertRaisesRegex(BUILDER.SelfplayTrainingPlanError, "non-symlink"):
            self._build()


if __name__ == "__main__":
    unittest.main()
