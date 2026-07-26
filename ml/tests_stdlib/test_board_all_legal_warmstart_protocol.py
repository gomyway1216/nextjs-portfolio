import hashlib
import json
import math
from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).resolve().parents[2]
PLAN_PATH = (
    REPO_ROOT / "ml" / "protocols" / "board-all-legal-warmstart-v1-plan.json"
)


def _reject_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _reject_constant(value):
    raise ValueError(f"non-standard JSON constant: {value}")


def load_plan():
    return json.loads(
        PLAN_PATH.read_text(encoding="utf-8"),
        object_pairs_hook=_reject_duplicate_keys,
        parse_constant=_reject_constant,
    )


class BoardAllLegalWarmstartProtocolTest(unittest.TestCase):
    def test_tracked_plan_byte_identity_is_frozen(self):
        raw = PLAN_PATH.read_bytes()
        self.assertEqual(len(raw), 13_159)
        self.assertEqual(
            hashlib.sha256(raw).hexdigest(),
            "636a7569e317182593e34d024c94d7a4f354f714f64c5202c7d64f6ac75f33b5",
        )

    def test_registered_artifact_identities_and_live_export_are_exact(self):
        plan = load_plan()
        self.assertEqual(plan["schema"], "shogi-board-all-legal-warmstart-plan-v1")
        expected = {
            "initializer": (
                2_375_274,
                "571ca3090cd0f41772514547ea5ac1d5bcd32f3f79820511645e298dbaa65ff8",
            ),
            "live_weights": (
                1_185_988,
                "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
            ),
            "legal_sibling_training": (
                97_820_193,
                "a592f7ece38172a0e2a8ee865359349555d8a3dc31eb6f6697411974d2dd3d1e",
            ),
            "legal_sibling_validation": (
                50_255_278,
                "0d3973ea7df7c44a5e863947b358b15dcf0e249dd26bbf0e7ef26dfff8bef3ca",
            ),
            "value_replay": (
                421_952_083,
                "c83241eb95f3568fe75a95d903e348591af49daf07d23db1db266e9be14a633d",
            ),
            "value_preservation_validation": (
                1_576_191,
                "01d959560220bb652f834f5361ee443cccbec177cdf5dfd7af0554f12c870b81",
            ),
        }
        for role, (byte_count, sha256) in expected.items():
            with self.subTest(role=role):
                self.assertEqual(plan["inputs"][role]["bytes"], byte_count)
                self.assertEqual(plan["inputs"][role]["sha256"], sha256)
        self.assertTrue(
            plan["input_consistency"]["initializer_export_is_byte_exact_live_weights"]
        )
        self.assertEqual(
            plan["input_consistency"]["initializer_export_sha256"],
            expected["live_weights"][1],
        )

    def test_single_arm_final_epoch_and_static_gate_constants_are_frozen(self):
        plan = load_plan()
        training = plan["training"]
        self.assertEqual(training["arm_count"], 1)
        self.assertEqual(len(training["prospective_slots"]), 1)
        self.assertEqual(training["prospective_slots"][0]["seed"], 42)
        self.assertEqual(training["epochs"], 3)
        self.assertEqual(training["checkpoint_policy"], "fixed-final-epoch-3-only")
        self.assertEqual(training["device"], "mps")
        self.assertEqual(training["torch_threads"], 14)
        self.assertFalse(training["early_stopping"])
        self.assertEqual(
            training[
                "candidate_validation_evaluations_before_final_checkpoint_freeze"
            ],
            0,
        )
        self.assertEqual(
            training["live_baseline_evaluations_before_optimizer_creation"], 1
        )
        self.assertFalse(training["candidate_validation_path_used_by_optimizer"])

        live = plan["registered_baselines"]["exact_live_int16_on_643_parents"]
        historical = plan["registered_baselines"]["historical_66_of_643_reference"]
        value = plan["registered_baselines"]["exact_live_int16_value_on_2959_rows"]
        self.assertEqual(live["top1_correct"], 63)
        self.assertEqual(live["recall_at_3_correct"], 152)
        self.assertEqual(live["recall_at_5_correct"], 243)
        self.assertEqual(live["pair50_correct"], 1_928_945)
        self.assertEqual(live["pair50_total"], 2_889_565)
        self.assertAlmostEqual(live["ndcg_at_5"], 0.3735565967562515)
        self.assertAlmostEqual(live["pair50"], 0.6675554971076961)
        self.assertEqual(live["pair200_correct"], 1_539_896)
        self.assertEqual(live["pair200_total"], 2_224_457)
        self.assertAlmostEqual(live["pair200"], 0.6922570317160548)
        self.assertEqual(historical["top1_correct"], 66)
        self.assertEqual(value["rows"], 2_959)
        self.assertAlmostEqual(value["value_loss"], 0.06424225121736526)
        self.assertAlmostEqual(value["value_mae_cp"], 609.3575477600098)

        gate = plan["static_gate"]
        self.assertTrue(gate["all_checks_required"])
        self.assertTrue(gate["failure_is_closed"])
        self.assertEqual(gate["minimum_top1_correct_parents"], 73)
        self.assertAlmostEqual(gate["minimum_top1_accuracy"], 73 / 643)
        self.assertEqual(gate["minimum_recall_at_3_gain"], 0.0)
        self.assertEqual(gate["minimum_recall_at_5_gain"], 0.02)
        self.assertEqual(gate["minimum_ndcg_at_5_gain"], 0.01)
        self.assertAlmostEqual(
            gate["minimum_pair50"], historical["pair50"] + 0.003
        )
        self.assertEqual(gate["minimum_pair200_gain"], 0.0)
        self.assertAlmostEqual(
            gate["maximum_value_loss"],
            value["value_loss"] * gate["maximum_value_loss_ratio"],
        )
        self.assertAlmostEqual(
            gate["maximum_value_mae_cp"],
            value["value_mae_cp"] + gate["maximum_value_mae_regression_cp"],
        )
        self.assertEqual(gate["expected_export_bytes"], 1_185_988)
        self.assertGreaterEqual(
            gate["minimum_export_roundtrip_parity_positions"], 200
        )
        self.assertEqual(gate["maximum_faults"], 0)
        self.assertEqual(gate["maximum_semantic_overlap"], 0)

    def test_screen56_and_live_write_boundaries_fail_closed(self):
        plan = load_plan()
        screen = plan["screen56"]
        self.assertEqual(screen["opening_pairs"], 28)
        self.assertEqual(screen["games"], 56)
        self.assertTrue(screen["color_swapped_two_game_pairs"])
        self.assertEqual(screen["milliseconds_per_move"], 1_500)
        self.assertEqual(screen["pass_halfpoints"], 62)
        self.assertEqual(screen["technical_faults_allowed"], 0)
        self.assertEqual(screen["illegal_moves_allowed"], 0)
        self.assertEqual(screen["missing_or_duplicate_opening_pairs_allowed"], 0)

        authorization = plan["authorization"]
        for field in (
            "live_asset_write_authorized",
            "training_may_write_live_asset",
            "static_evaluator_may_write_live_asset",
            "screen56_may_write_live_asset",
            "production_activation_authorized",
        ):
            with self.subTest(field=field):
                self.assertFalse(authorization[field])
        self.assertEqual(
            authorization["live_asset_path"], "public/shogi-nnue-weights.bin"
        )

    def test_every_number_in_plan_is_finite(self):
        def visit(value):
            if type(value) is float:
                self.assertTrue(math.isfinite(value))
            elif isinstance(value, dict):
                for child in value.values():
                    visit(child)
            elif isinstance(value, list):
                for child in value:
                    visit(child)

        visit(load_plan())


if __name__ == "__main__":
    unittest.main()
