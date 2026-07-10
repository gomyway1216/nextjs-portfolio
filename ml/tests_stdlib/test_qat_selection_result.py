import hashlib
import json
from pathlib import Path
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
AUDIT_PATH = ML_DIR / "protocols" / "wcsc36-int16-aware-selection-audit.json"
AUDIT_BYTES = 29_616
AUDIT_SHA256 = "aab9a6fdb49e4d393ca11132671d5aa433b9a208bfafeaa031f3e9554b148737"
EXECUTION_REVISION = "753f90a026dfd6ec837b4444f3220db5648dc212"


class QatSelectionResultTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = AUDIT_PATH.read_bytes()
        cls.audit = json.loads(cls.raw)

    def test_result_artifact_identity_and_sealed_failure_status(self):
        self.assertEqual(len(self.raw), AUDIT_BYTES)
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(), AUDIT_SHA256)
        self.assertEqual(
            self.audit["schema"], "shogi-int16-aware-selection-audit-v1"
        )
        self.assertEqual(self.audit["status"], "static_selection_fail")
        self.assertEqual(
            self.audit["final_holdout"], "not_opened_by_this_command"
        )
        self.assertFalse(self.audit["production_promotion_authorized"])
        self.assertEqual(
            self.audit["audit_pipeline"],
            {"source_revision": EXECUTION_REVISION, "tracked_tree_clean": True},
        )
        self.assertTrue(
            self.audit["preflight"]["all_three_complete_before_selection_read"]
        )

    def test_exact_three_seed_order_metrics_and_gate_failures(self):
        selection = self.audit["selection"]
        self.assertEqual(selection["ranked_seed_order"], [43, 44, 42])
        self.assertEqual(selection["representative_seed"], 44)
        self.assertEqual(
            selection["stable"]["int16"]["within_parent_pair_accuracy"],
            0.6048966902001425,
        )
        expected = {
            42: {
                "sha256": "2a643831d1a00cb062150fce25d98aca7b773cc82169a903152a8f855c325ac9",
                "pair": 0.6071636764039122,
                "top1": 0.2727272727272727,
                "checks": [True, True, False, True],
            },
            43: {
                "sha256": "2160926e71eee03aaf6038e08699a4bbf907f88aeafe55e6ac7757a18b45924d",
                "pair": 0.6092363495045016,
                "top1": 0.26392961876832843,
                "checks": [True, False, True, True],
            },
            44: {
                "sha256": "6497c81309a5e1273d2d9c013a4cdfe97923e05762e150986309bd8b789c42fb",
                "pair": 0.6073579895070924,
                "top1": 0.2756598240469208,
                "checks": [True, True, False, False],
            },
        }
        self.assertEqual([run["seed"] for run in selection["runs"]], [42, 43, 44])
        for run in selection["runs"]:
            wanted = expected[run["seed"]]
            self.assertEqual(run["checkpoint"]["sha256"], wanted["sha256"])
            self.assertEqual(
                run["int16"]["within_parent_pair_accuracy"], wanted["pair"]
            )
            self.assertEqual(
                run["int16"]["teacher_top1_accuracy"], wanted["top1"]
            )
            self.assertEqual(
                [check["passed"] for check in run["gates"]["checks"]],
                wanted["checks"],
            )
            self.assertFalse(run["gates"]["all_four_passed"])
        self.assertEqual(selection["family_gate"]["seeds_passing_all_four"], 0)
        self.assertFalse(selection["family_gate"]["passed"])


if __name__ == "__main__":
    unittest.main()
