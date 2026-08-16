import math
import os
from pathlib import Path
import json
import sys
import unittest

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from train_kingpair_interaction_nnue import (  # noqa: E402
    BATCH_SIZE,
    EPOCHS,
    LEARNING_RATE,
    SEED,
    metric_report,
    sampled_rank_loss,
    static_gate,
)


class TrainKingPairInteractionNNUETests(unittest.TestCase):
    def test_recipe_is_a_single_fixed_scratch_candidate(self):
        self.assertEqual(SEED, 20260810)
        self.assertEqual(EPOCHS, 2)
        self.assertEqual(BATCH_SIZE, 1024)
        self.assertEqual(LEARNING_RATE, 1e-4)

        protocol = json.loads(
            (Path(ML_DIR) / "protocols" / "kingpair-interaction-nnue-50m-v1-plan.json")
            .read_text(encoding="utf-8")
        )
        self.assertFalse(protocol["stage_1_bootstrap"]["deployment_eligible"])
        self.assertFalse(
            protocol["stage_1_bootstrap"]["checkpoint_reused_as_initializer"]
        )
        self.assertEqual(
            protocol["stage_2_full_training"]["minimum_unique_training_rows"],
            10_000_000,
        )
        self.assertFalse(
            protocol["stage_2_full_training"]["deployment_gate_runs_here_only"]
        )
        self.assertEqual(
            protocol["stage_3_full_training"]["minimum_unique_training_rows"],
            50_000_000,
        )
        self.assertTrue(
            protocol["stage_3_full_training"]["deployment_gate_runs_here_only"]
        )
        legacy = protocol["data"]["legacy_depth12_replay"]
        self.assertTrue(legacy["production_training_lineage_same_source"])
        self.assertLessEqual(legacy["stage_2_maximum_fraction"], 0.2)
        self.assertLessEqual(legacy["stage_3_maximum_fraction"], 0.1)

    def test_sampled_rank_loss_rewards_correct_order(self):
        cp = torch.tensor([300.0, 100.0, -100.0, -300.0])
        correct = cp / 600.0
        reversed_output = -correct
        first = sampled_rank_loss(
            correct, cp, torch.Generator().manual_seed(1), samples=1000
        )
        second = sampled_rank_loss(
            reversed_output, cp, torch.Generator().manual_seed(1), samples=1000
        )
        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        self.assertLess(float(first), float(second))

    def test_domain_metrics_and_gate_use_sibling_improvement(self):
        cp = torch.tensor([300.0, 0.0, 200.0, -100.0])
        sources = ["aoba-depth12-top4"] * 4
        parents = ["p1", "p1", "p2", "p2"]
        baseline_out = torch.tensor([0.2, 0.1, -0.2, -0.1])
        candidate_out = cp / 600.0
        baseline = metric_report(baseline_out, cp, sources, parents)
        candidate = metric_report(candidate_out, cp, sources, parents)
        report = static_gate(baseline, candidate)
        self.assertEqual(report["status"], "pass")
        self.assertGreater(report["mae_improvement_cp"], 10)
        self.assertTrue(math.isfinite(report["weighted_candidate_mae_cp"]))


if __name__ == "__main__":
    unittest.main()
