import copy
import hashlib
import os
from pathlib import Path
import sys
import unittest


ML_DIR = os.path.dirname(os.path.dirname(__file__))
REPO_ROOT = os.path.dirname(ML_DIR)
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from formal_paired_ab_protocol import (  # noqa: E402
    BOOTSTRAP_REPLICATES,
    BOOTSTRAP_SEED,
    FORMAL_AB_REGISTRY_PATH,
    FORMAL_AB_RESULT_SCHEMA,
    FRESH_SIBLING_PLAN_BYTES,
    FRESH_SIBLING_PLAN_PATH,
    FRESH_SIBLING_PLAN_SCHEMA,
    FRESH_SIBLING_PLAN_SHA256,
    PAIR_COUNT,
    _paired_bootstrap_lower_numerators,
    _strict_json_loads,
    analyze_formal_paired_ab,
    decode_pair_score_units,
    validate_closed_formal_ab_registry,
    validate_closed_formal_ab_registry_data,
    validate_formal_ab_promotion_receipt,
)


def digest(number):
    return f"{number:064x}"


def semantic_id(number):
    return f"sha256:{number:064x}"


def result_fixture(pair_results=None):
    if pair_results is None:
        pair_results = [("win", "win")] * PAIR_COUNT
    pairs = []
    for pair_index, outcomes in enumerate(pair_results):
        pairs.append(
            {
                "pair_index": pair_index,
                "opening_id": semantic_id(10_000 + pair_index),
                "games": [
                    {
                        "game_index": 0,
                        "game_id": semantic_id(20_000 + pair_index * 2),
                        "candidate_color": "sente",
                        "result": outcomes[0],
                    },
                    {
                        "game_index": 1,
                        "game_id": semantic_id(20_001 + pair_index * 2),
                        "candidate_color": "gote",
                        "result": outcomes[1],
                    },
                ],
            }
        )
    return {
        "schema": FORMAL_AB_RESULT_SCHEMA,
        "plan": {
            "path": FRESH_SIBLING_PLAN_PATH,
            "bytes": FRESH_SIBLING_PLAN_BYTES,
            "sha256": FRESH_SIBLING_PLAN_SHA256,
            "schema": FRESH_SIBLING_PLAN_SCHEMA,
        },
        "candidate_weights_sha256": digest(1),
        "stable_weights_sha256": digest(2),
        "match_binding_sha256": digest(3),
        "pairs": pairs,
    }


class FormalPairedAbProtocolTest(unittest.TestCase):
    def test_preregistered_plan_file_matches_pinned_identity(self):
        raw = Path(REPO_ROOT, FRESH_SIBLING_PLAN_PATH).read_bytes()
        self.assertEqual(len(raw), FRESH_SIBLING_PLAN_BYTES)
        self.assertEqual(hashlib.sha256(raw).hexdigest(), FRESH_SIBLING_PLAN_SHA256)
        self.assertEqual(
            _strict_json_loads(raw.decode("utf-8"))["schema"],
            FRESH_SIBLING_PLAN_SCHEMA,
        )

    def test_checked_in_registry_is_closed_and_observed_zero_games(self):
        registry = validate_closed_formal_ab_registry(
            os.path.join(REPO_ROOT, FORMAL_AB_REGISTRY_PATH)
        )
        self.assertEqual(registry["status"], "blocked")
        self.assertEqual(registry["nonclaims"]["games_observed"], 0)
        self.assertTrue(all(value is None for value in registry["enrollments"].values()))
        self.assertTrue(all(value is False for value in registry["gates"].values()))

    def test_all_wins_pass_exact_safety_and_stronger_gates(self):
        report = analyze_formal_paired_ab(result_fixture())
        self.assertEqual(report["point_score_rate"]["numerator"], 768)
        self.assertEqual(report["bootstrap"]["one_sided_95_lower"]["numerator"], 768)
        self.assertEqual(report["bootstrap"]["two_sided_95_lower"]["numerator"], 768)
        self.assertTrue(report["gates"]["safety_strictly_above_0_45"])
        self.assertTrue(report["gates"]["stronger_claim_strictly_above_0_50"])
        self.assertFalse(report["authority"]["promotion_authorized"])
        self.assertFalse(report["authority"]["production_weight_write_authorized"])

    def test_exact_half_score_does_not_claim_stronger(self):
        report = analyze_formal_paired_ab(
            result_fixture([("win", "loss")] * PAIR_COUNT)
        )
        self.assertEqual(report["point_score_rate"]["decimal"], 0.5)
        self.assertTrue(report["gates"]["safety_strictly_above_0_45"])
        self.assertFalse(report["gates"]["stronger_claim_strictly_above_0_50"])

    def test_bootstrap_resamples_pairs_and_is_deterministic(self):
        pair_units = [0, 4] * (PAIR_COUNT // 2)
        first = _paired_bootstrap_lower_numerators(
            pair_units, seed=BOOTSTRAP_SEED, replicates=2_000
        )
        second = _paired_bootstrap_lower_numerators(
            pair_units, seed=BOOTSTRAP_SEED, replicates=2_000
        )
        self.assertEqual(first, second)
        self.assertLess(first[0], PAIR_COUNT * 2)
        self.assertLessEqual(first[1], first[0])
        self.assertEqual(BOOTSTRAP_REPLICATES, 100_000)

    def test_exact_preregistered_bootstrap_has_deterministic_vector(self):
        self.assertEqual(
            _paired_bootstrap_lower_numerators([0, 4] * (PAIR_COUNT // 2)),
            (340, 328),
        )

    def test_rejects_pair_count_order_color_and_duplicate_ids(self):
        fixture = result_fixture()
        fixture["pairs"].pop()
        with self.assertRaisesRegex(ValueError, "exactly 192 pairs"):
            decode_pair_score_units(fixture)

        fixture = result_fixture()
        fixture["pairs"][1]["pair_index"] = 7
        with self.assertRaisesRegex(ValueError, "contiguous and ordered"):
            decode_pair_score_units(fixture)

        fixture = result_fixture()
        fixture["pairs"][0]["games"][1]["candidate_color"] = "sente"
        with self.assertRaisesRegex(ValueError, "candidate sente then candidate gote"):
            decode_pair_score_units(fixture)

        fixture = result_fixture()
        fixture["pairs"][1]["opening_id"] = fixture["pairs"][0]["opening_id"]
        with self.assertRaisesRegex(ValueError, "opening IDs must be unique"):
            decode_pair_score_units(fixture)

        fixture = result_fixture()
        fixture["pairs"][1]["games"][0]["game_id"] = fixture["pairs"][0]["games"][0]["game_id"]
        with self.assertRaisesRegex(ValueError, "game IDs must be globally unique"):
            decode_pair_score_units(fixture)

    def test_rejects_wrong_plan_weight_identity_schema_and_extra_fields(self):
        fixture = result_fixture()
        fixture["plan"]["bytes"] -= 1
        with self.assertRaisesRegex(ValueError, "preregistered plan"):
            decode_pair_score_units(fixture)

        fixture = result_fixture()
        fixture["plan"]["bytes"] = float(FRESH_SIBLING_PLAN_BYTES)
        with self.assertRaisesRegex(ValueError, "field types are invalid"):
            decode_pair_score_units(fixture)

        fixture = result_fixture()
        fixture["stable_weights_sha256"] = fixture["candidate_weights_sha256"]
        with self.assertRaisesRegex(ValueError, "must differ"):
            decode_pair_score_units(fixture)

        fixture = result_fixture()
        fixture["schema"] = "unknown"
        with self.assertRaisesRegex(ValueError, "schema is invalid"):
            decode_pair_score_units(fixture)

        fixture = result_fixture()
        fixture["unexpected"] = True
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            decode_pair_score_units(fixture)

        fixture = result_fixture()
        fixture["pairs"][0]["games"][0]["result"] = "void"
        with self.assertRaisesRegex(ValueError, "result is invalid"):
            decode_pair_score_units(fixture)

    def test_closed_registry_rejects_any_enrollment_or_open_gate(self):
        path = os.path.join(REPO_ROOT, FORMAL_AB_REGISTRY_PATH)
        registry = validate_closed_formal_ab_registry(path)
        enrolled = copy.deepcopy(registry)
        enrolled["enrollments"]["candidate_weights"] = {"sha256": digest(9)}
        with self.assertRaisesRegex(ValueError, "unexpectedly enrolls"):
            validate_closed_formal_ab_registry_data(enrolled)

        opened = copy.deepcopy(registry)
        opened["gates"]["execution_authorized"] = True
        with self.assertRaisesRegex(ValueError, "unexpectedly opens"):
            validate_closed_formal_ab_registry_data(opened)

        numeric_type_drift = copy.deepcopy(registry)
        numeric_type_drift["fixed_protocol"]["pairs"] = float(PAIR_COUNT)
        with self.assertRaisesRegex(ValueError, "numeric types are invalid"):
            validate_closed_formal_ab_registry_data(numeric_type_drift)

        unsupported = copy.deepcopy(registry)
        unsupported["nonclaims"]["games_observed"] = False
        with self.assertRaisesRegex(ValueError, "integer zero"):
            validate_closed_formal_ab_registry_data(unsupported)

    def test_strict_registry_json_rejects_duplicates_and_nonfinite_values(self):
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            _strict_json_loads('{"schema":"first","schema":"second"}')
        with self.assertRaisesRegex(ValueError, "non-finite JSON value"):
            _strict_json_loads('{"value":NaN}')

    def test_promotion_validator_always_stops(self):
        with self.assertRaisesRegex(
            ValueError, "authorization is not implemented; production remains STOP"
        ):
            validate_formal_ab_promotion_receipt({})


if __name__ == "__main__":
    unittest.main()
