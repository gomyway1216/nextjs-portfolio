from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest


REPO_ROOT = Path(__file__).resolve().parents[2]
ML_DIR = REPO_ROOT / "ml"
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import child_board_strength_candidate_postphase_registry as REGISTRY  # noqa: E402


REGISTRY_PATH = REPO_ROOT / REGISTRY.REGISTRY_RELATIVE_PATH


class ChildBoardPostphaseRegistryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.raw = REGISTRY_PATH.read_bytes()
        cls.document = json.loads(cls.raw)

    def test_tracked_registry_and_parent_protocol_identities_are_exact(self):
        self.assertEqual(len(self.raw), REGISTRY.REGISTRY_BYTES)
        self.assertEqual(
            hashlib.sha256(self.raw).hexdigest(),
            REGISTRY.REGISTRY_SHA256,
        )
        validated = REGISTRY.validate_checked_in_registry(REPO_ROOT)
        self.assertEqual(validated, self.document)

    def test_all_previous_postphase_placeholders_are_concrete(self):
        outputs = self.document["outputs"]
        for lane in ("student_runtime", "tune", "sealed", "formal"):
            with self.subTest(lane=lane):
                self.assertIsInstance(outputs[lane], dict)
                self.assertNotIn("PENDING", json.dumps(outputs[lane]))
                self.assertNotIn("__BIND_", json.dumps(outputs[lane]))
        self.assertEqual(
            outputs["public_student_assets"]["tensor_path"],
            "public/shogi-root-policy-student-v1.f32.bin",
        )
        self.assertEqual(
            outputs["public_student_assets"]["manifest_path"],
            "public/shogi-root-policy-student-v1.manifest.json",
        )
        self.assertEqual(outputs["formal"]["pairs"], 384)
        self.assertEqual(outputs["formal"]["games"], 768)
        self.assertEqual(outputs["formal"]["pair_workers"], 12)
        execution = self.document["execution_contract"]
        self.assertEqual(
            execution["score_row"]["score_keys"],
            [
                "exact_live",
                "seed42_teacher",
                "seed314159_teacher",
                "frozen_student",
            ],
        )
        self.assertEqual(
            [domain["parents"] for domain in execution["tune"]["domains"]],
            [196, 4411],
        )
        self.assertEqual(execution["sealed"]["parents"], 512)
        self.assertIn(
            "terminalize-only",
            execution["one_shot_publication"]["recovery"],
        )

    def test_shards_are_exactly_sixteen_consecutive_slices_of_thirty_two(self):
        shards = self.document["sealed_label_shards"]
        self.assertEqual(shards["parents"], 512)
        self.assertEqual(shards["shards"], 16)
        self.assertEqual(shards["parents_per_shard"], 32)
        self.assertEqual(
            shards["shards"] * shards["parents_per_shard"],
            shards["parents"],
        )
        self.assertIn("consecutive exact slices", shards["membership"])
        self.assertIn("create-only and immutable", shards["publication"])

    def test_ties_and_exact_one_sided_mcnemar_are_unambiguous(self):
        metrics = self.document["metric_definitions"]
        self.assertIn(
            "every move",
            metrics["candidate_top1_tie"]["correct"],
        )
        self.assertEqual(
            metrics["pair_accuracy"]["candidate_tie"],
            "incorrect",
        )
        self.assertIn(
            "teacher-worst",
            metrics["mean_regret_cp"]["candidate_tie"],
        )
        self.assertIn(
            "teacher CP ascending",
            metrics["ndcg_at_5"]["candidate_order"],
        )
        mcnemar = metrics["mcnemar_one_sided"]
        self.assertEqual(
            mcnemar["alternative"],
            (
                "artifact has greater top1 correctness probability than "
                "exact live"
            ),
        )
        self.assertFalse(mcnemar["continuity_correction"])
        self.assertEqual(mcnemar["maximum_p"], 0.05)
        self.assertEqual(
            mcnemar["exact_pass_comparison"],
            "20 * sum(comb(n,k), k=b..n) <= 2**n",
        )

    def test_validator_rejects_metric_or_output_drift(self):
        changed = copy.deepcopy(self.document)
        changed["metric_definitions"]["pair_accuracy"][
            "candidate_tie"
        ] = "half credit"
        with self.assertRaisesRegex(
            REGISTRY.RegistryError, "metric_definitions contract mismatch"
        ):
            REGISTRY.validate_registry_document(changed)

        changed = copy.deepcopy(self.document)
        changed["outputs"]["formal"]["result"] = "/tmp/result.json"
        with self.assertRaisesRegex(
            REGISTRY.RegistryError, "outputs contract mismatch"
        ):
            REGISTRY.validate_registry_document(changed)

    def test_validator_rejects_registry_byte_drift_before_execution(self):
        changed = self.raw + b" "
        with self.assertRaisesRegex(
            REGISTRY.RegistryError, "byte/SHA identity mismatch"
        ):
            REGISTRY.validate_registry_bytes(changed)

    def test_duplicate_keys_and_nonfinite_numbers_are_rejected(self):
        with self.assertRaisesRegex(
            REGISTRY.RegistryError, "duplicate JSON key"
        ):
            REGISTRY._strict_json(b'{"a":1,"a":2}', "test")
        with self.assertRaisesRegex(
            REGISTRY.RegistryError, "non-finite"
        ):
            REGISTRY._strict_json(b'{"a":NaN}', "test")


if __name__ == "__main__":
    unittest.main()
