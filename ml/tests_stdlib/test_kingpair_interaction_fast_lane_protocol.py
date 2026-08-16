import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
PROTOCOL_PATH = (
    ROOT / "ml" / "protocols" / "kingpair-interaction-nnue-10m-fast-v1-plan.json"
)


class KingPairInteractionFastLaneProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.protocol = json.loads(PROTOCOL_PATH.read_text(encoding="utf-8"))

    def test_exact_ten_million_unique_row_contract(self):
        data = self.protocol["training_data"]
        legacy = data["legacy"]
        fresh = data["fresh_aoba"]
        self.assertEqual(legacy["source_rows"], 5_892_192)
        self.assertEqual(legacy["quarantined_invalid_rows"], 2_239)
        self.assertEqual(
            legacy["usable_source_rows"],
            legacy["source_rows"] - legacy["quarantined_invalid_rows"],
        )
        self.assertEqual(
            legacy["selected_unique_rows"] + fresh["required_unique_rows"],
            10_000_000,
        )
        self.assertEqual(legacy["selected_unique_rows"], 2_000_000)
        self.assertEqual(fresh["required_unique_rows"], 8_000_000)
        self.assertLessEqual(legacy["maximum_training_fraction"], 0.2)
        self.assertTrue(legacy["unused_rows_cannot_fill_fresh_shortfall"])
        self.assertTrue(fresh["duplicate_rows_cannot_fill_shortfall"])
        self.assertEqual(data["exact_unique_rows"], 10_000_000)

    def test_training_exposure_remains_twenty_eighty(self):
        exposure = self.protocol["training_data"]["exposure"]
        legacy = exposure["legacy_rows_per_batch_cycle"]
        fresh = exposure["fresh_rows_per_batch_cycle"]
        self.assertEqual(len(legacy), exposure["batch_cycle_length"])
        self.assertEqual(len(fresh), exposure["batch_cycle_length"])
        self.assertTrue(
            all(a + b == exposure["batch_size"] for a, b in zip(legacy, fresh))
        )
        self.assertEqual(sum(legacy), 1_024)
        self.assertEqual(sum(fresh), 4_096)
        self.assertEqual(exposure["legacy_fraction"], 0.2)
        self.assertEqual(exposure["fresh_fraction"], 0.8)

    def test_bootstrap_and_holdouts_cannot_enter_training(self):
        candidate = self.protocol["candidate"]
        holdouts = self.protocol["holdouts"]
        self.assertEqual(candidate["initializer"], "fresh-scratch")
        self.assertFalse(candidate["bootstrap_checkpoint_reused"])
        self.assertFalse(holdouts["fresh_yaneura"]["training_use"])
        self.assertEqual(
            self.protocol["training_data"]["grouping"][
                "semantic_train_holdout_overlap"
            ],
            0,
        )
        self.assertEqual(
            self.protocol["training_data"]["grouping"][
                "parent_train_holdout_overlap"
            ],
            0,
        )

    def test_rank_loss_is_only_within_parent_and_teacher(self):
        rank = self.protocol["training"]["rank_loss"]
        self.assertEqual(rank["scope"], "same-parent-same-teacher-only")
        self.assertFalse(rank["cross_parent_pairs"])
        self.assertFalse(rank["cross_teacher_pairs"])
        self.assertGreaterEqual(rank["minimum_gap_cp"], 50)
        self.assertLessEqual(rank["maximum_gap_cp"], 600)

    def test_static_metrics_cannot_authorize_promotion(self):
        static = self.protocol["static_gate"]
        strength = self.protocol["strength_gate"]
        self.assertEqual(static["role"], "reject-only-does-not-prove-strength")
        self.assertTrue(static["aggregate_cannot_mask_domain_regression"])
        self.assertFalse(strength["early_pass"])
        self.assertEqual(strength["screen56_halfpoints_min"], 62)
        self.assertEqual(strength["independent96_halfpoints_min"], 106)
        self.assertEqual(strength["formal768"]["pairs"], 384)
        self.assertGreater(
            strength["formal768"]["lower_95_score_strictly_greater_than"],
            0.49,
        )

    def test_runtime_and_storage_are_bounded_before_training(self):
        skeleton = self.protocol["preflight"][
            "runtime_skeleton_before_full_training"
        ]
        storage = self.protocol["storage"]
        self.assertTrue(skeleton["required"])
        self.assertLessEqual(skeleton["search_slowdown_maximum_fraction"], 0.05)
        self.assertFalse(storage["load_entire_corpus_into_ram"])
        self.assertFalse(storage["per_parent_files"])
        self.assertTrue(storage["atomic_create_only_publish"])
        self.assertFalse(storage["overwrite_completed_shard"])

    def test_lineage_ablation_is_diagnostic_not_ratio_tuning(self):
        ablation = self.protocol["preflight"]["discarded_lineage_ablation"]
        self.assertEqual(ablation["development_rows_per_arm"], 131_072)
        self.assertFalse(ablation["weights_reused"])
        self.assertFalse(ablation["final_holdouts_used"])
        self.assertFalse(ablation["ratio_selection"])
        self.assertEqual(
            ablation["failure_action"],
            "stop-slot-without-changing-the-20-80-ratio",
        )

    def test_one_week_lane_is_single_candidate_without_posthoc_tuning(self):
        self.assertEqual(self.protocol["deadline_days"], 7)
        self.assertFalse(self.protocol["training"]["best_checkpoint_selection"])
        self.assertFalse(self.protocol["training"]["additional_seed"])
        self.assertFalse(self.protocol["training"]["epoch_extension"])
        self.assertFalse(self.protocol["failure_policy"]["same_slot_tuning"])
        self.assertFalse(self.protocol["failure_policy"]["threshold_relaxation"])


if __name__ == "__main__":
    unittest.main()
