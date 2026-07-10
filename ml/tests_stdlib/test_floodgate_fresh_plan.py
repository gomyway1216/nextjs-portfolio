import hashlib
import json
from pathlib import Path
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
PLAN_PATH = ML_DIR / "protocols" / "floodgate-q1-2026-fresh-sibling-plan.json"
PLAN_BYTES = 10_817
PLAN_SHA256 = "44925020c08b4270cd7553cac9d574e9b2b85a5f98fc2ee88bce23faed110d67"


class FloodgateFreshSiblingPlanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = PLAN_PATH.read_bytes()
        cls.plan = json.loads(cls.raw)

    def test_plan_identity_is_pinned_before_labels(self):
        self.assertNotIn(
            b"\r",
            self.raw,
            "plan must be checked out with LF endings; verify .gitattributes",
        )
        self.assertEqual(len(self.raw), PLAN_BYTES)
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(), PLAN_SHA256)
        self.assertEqual(
            self.plan["status"],
            "preregistered-before-corpus-lock-and-teacher-labels",
        )
        self.assertFalse(
            self.plan["source"]["label_blind_inventory_observed_before_plan"][
                "teacher_scores_or_holdout_labels_read"
            ]
        )

    def test_source_and_role_contract_cannot_silently_relax(self):
        source = self.plan["source"]
        identity = source["identity_policy"]
        self.assertEqual(
            (source["archive_start_date"], source["archive_end_date"]),
            ("2026-01-01", "2026-03-31"),
        )
        self.assertEqual(source["event"], "floodgate-300-10F")
        self.assertEqual(source["terminal_allowlist"], ["TORYO"])
        self.assertEqual(identity["rating_group"], 0)
        self.assertEqual(identity["minimum_cumulative_games_before_game_date"], 30)
        self.assertEqual(identity["minimum_embedded_game_time_rating_both_players"], 3600.0)
        self.assertTrue(identity["distinct_full_identities"])

        sampling = self.plan["eligibility_and_sampling"]
        self.assertEqual(
            sampling["allocation_seed"],
            "floodgate-q1-2026-role-seed-v1",
        )
        self.assertEqual(
            sampling["parent_rank_domains"],
            {
                "phase": "floodgate-q1-2026-parent-phase-v1",
                "fill": "floodgate-q1-2026-parent-fill-v1",
            },
        )

        roles = self.plan["roles"]
        self.assertEqual(
            roles["priority"],
            ["fresh_final_holdout", "fresh_selection", "training"],
        )
        self.assertEqual(
            [(row["role"], row["games"], row["parents"]) for row in roles["allocation"]],
            [
                ("fresh_final_holdout", 200, 4800),
                ("fresh_selection", 200, 4800),
                ("training", 1000, 24000),
            ],
        )
        self.assertEqual(
            roles["protected_group"],
            "parent-position-union-every-legal-child-position",
        )
        self.assertEqual(roles["legacy_exclusion"]["count"], 8678)
        self.assertEqual(
            roles["quota_failure"],
            "stop-without-relaxing-thresholds-caps-or-semantic-isolation",
        )

    def test_model_and_gates_are_data_only_replay(self):
        training = self.plan["training"]
        self.assertEqual(training["seeds"], [42, 43, 44])
        self.assertEqual(training["epochs"], 20)
        self.assertEqual(training["learning_rate"], 0.0001)
        self.assertEqual(
            training["objective"],
            "0.5*float_full_task+0.5*exact_int16_ste_full_task",
        )
        self.assertEqual(
            training["architecture_loss_optimizer_seed_or_gate_changes"],
            "forbidden",
        )

        selection = self.plan["static_selection"]
        self.assertEqual(selection["evaluations_per_checkpoint"], 1)
        self.assertFalse(selection["used_wcsc36_selection_reopened"])
        self.assertEqual(len(selection["per_seed_gates"]), 4)
        self.assertEqual(selection["family_gate"]["minimum_seeds_passing_all_four"], 2)

        failure = self.plan["failure_policy"]
        self.assertFalse(failure["add_seeds"])
        self.assertFalse(failure["relax_source_rating_or_game_count"])
        self.assertFalse(failure["relax_role_caps_or_semantic_isolation"])
        self.assertFalse(failure["tune_model_or_loss_on_fresh_selection"])
        self.assertFalse(failure["open_any_final_holdout_after_static_failure"])
        self.assertFalse(failure["change_production_after_any_gate_failure"])


if __name__ == "__main__":
    unittest.main()
