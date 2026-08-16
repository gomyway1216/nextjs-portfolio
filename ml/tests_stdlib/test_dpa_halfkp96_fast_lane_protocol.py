import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
PROTOCOL = json.loads(
    (ROOT / "ml/protocols/dpa-halfkp96-nnue-10m-fast-v1-plan.json").read_text()
)


class DpaHalfkp96FastLaneProtocolTests(unittest.TestCase):
    def test_runtime_passes_before_training(self):
        runtime = PROTOCOL["runtime_preflight"]
        self.assertEqual(runtime["status"], "pass-runtime-feasibility-only-not-strength")
        self.assertLessEqual(runtime["slowdown_fraction"], runtime["slowdown_maximum_fraction"])
        self.assertGreaterEqual(runtime["timed_500ms_work_ratio"], runtime["minimum_work_ratio"])
        self.assertEqual(runtime["fixed_work_exact"], runtime["fixed_work_positions"])
        self.assertEqual(runtime["incremental_full_mismatches"], 0)

    def test_candidate_is_one_strictly_antisymmetric_body(self):
        candidate = PROTOCOL["candidate"]
        self.assertEqual(candidate["trainable_parameters"], 17_744_928)
        self.assertEqual(candidate["hidden_lanes"], 96)
        self.assertTrue(candidate["strict_antisymmetry"])
        self.assertFalse(candidate["trainable_first_bias"])
        self.assertFalse(candidate["scalar_output_bias"])
        self.assertFalse(candidate["auxiliary_head"])
        self.assertFalse(candidate["bootstrap_checkpoint_reused"])

    def test_exact_ten_million_twenty_eighty_contract(self):
        data = PROTOCOL["training_data"]
        self.assertEqual(data["legacy"]["rows"] + data["fresh_aoba"]["rows"], 10_000_000)
        self.assertEqual(data["exact_unique_rows"], 10_000_000)
        self.assertEqual(data["legacy"]["fraction"], 0.2)
        self.assertEqual(data["fresh_aoba"]["fraction"], 0.8)
        self.assertLessEqual(data["fresh_aoba"]["maximum_single_position_domain_rows"], 3_200_000)
        self.assertTrue(data["fresh_aoba"]["exact_only"])

    def test_holdouts_cannot_enter_training(self):
        split = PROTOCOL["training_data"]["split"]
        self.assertEqual(split["semantic_train_holdout_overlap"], 0)
        self.assertEqual(split["parent_train_holdout_overlap"], 0)
        self.assertFalse(split["sealed_browser_validation_used_for_training"])
        self.assertFalse(split["sealed_v9_validation_used_for_training"])

    def test_recipe_cannot_be_selected_after_results(self):
        training = PROTOCOL["training"]
        failure = PROTOCOL["failure_policy"]
        self.assertEqual(training["epochs"], 2)
        self.assertEqual(training["batch_size"], 1024)
        self.assertFalse(training["best_checkpoint_selection"])
        self.assertFalse(training["additional_seed"])
        self.assertFalse(training["epoch_extension"])
        self.assertFalse(failure["same_slot_tuning"])
        self.assertFalse(failure["threshold_relaxation"])

    def test_static_cannot_promote_and_formal_stays_strict(self):
        static = PROTOCOL["static_gate"]
        strength = PROTOCOL["strength_gate"]
        self.assertEqual(static["role"], "reject-only-does-not-prove-strength")
        self.assertTrue(static["aggregate_cannot_mask_domain_regression"])
        self.assertEqual(strength["screen56_halfpoints_min"], 62)
        self.assertEqual(strength["independent96_halfpoints_min"], 106)
        self.assertEqual(strength["formal768"]["pairs"], 384)
        self.assertFalse(strength["early_pass"])


if __name__ == "__main__":
    unittest.main()
