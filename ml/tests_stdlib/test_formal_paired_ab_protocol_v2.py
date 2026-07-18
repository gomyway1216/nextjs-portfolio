import copy
import hashlib
import math
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest


ML_DIR = os.path.dirname(os.path.dirname(__file__))
REPO_ROOT = os.path.dirname(ML_DIR)
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from formal_paired_ab_protocol_v2 import (  # noqa: E402
    BOOTSTRAP_REPLICATES,
    BOOTSTRAP_SEED,
    FORMAL_AB_V2_AMENDMENT_BYTES,
    FORMAL_AB_V2_AMENDMENT_PATH,
    FORMAL_AB_V2_AMENDMENT_SHA256,
    FORMAL_AB_V2_REGISTRY_BYTES,
    FORMAL_AB_V2_REGISTRY_PATH,
    FORMAL_AB_V2_REGISTRY_SHA256,
    FORMAL_AB_V2_RESULT_SCHEMA,
    FRESH_SIBLING_PLAN_BYTES,
    FRESH_SIBLING_PLAN_PATH,
    FRESH_SIBLING_PLAN_SCHEMA,
    FRESH_SIBLING_PLAN_SHA256,
    NORMAL_APPROXIMATION_Z,
    MAXIMUM_ATTEMPTS_PER_EXPERIMENT,
    ORIGINAL_V1_REGISTRY_BYTES,
    ORIGINAL_V1_REGISTRY_PATH,
    ORIGINAL_V1_REGISTRY_SHA256,
    PAIR_COUNT,
    PAIR_SCORE_VARIANCE_UPPER_BOUND,
    _paired_bootstrap_lower_numerators,
    _strict_json_loads,
    analyze_formal_paired_ab_v2,
    decode_pair_score_units,
    validate_closed_formal_ab_v2_registry,
    validate_closed_formal_ab_v2_registry_data,
    validate_formal_ab_v2_amendment_chain,
    validate_formal_ab_v2_amendment_data,
    validate_formal_ab_v2_promotion_receipt,
)


def digest(number):
    return f"{number:064x}"


def semantic_id(number):
    return f"sha256:{number:064x}"


class EqualToEveryString:
    def __eq__(self, _other):
        return True

    def __ne__(self, _other):
        return False


class TextSubclass(str):
    def __eq__(self, _other):
        return False

    def __hash__(self):
        return id(self)


class DictSubclass(dict):
    pass


def result_fixture(pair_results=None):
    if pair_results is None:
        pair_results = [("win", "win")] * PAIR_COUNT
    pairs = []
    for pair_index, outcomes in enumerate(pair_results):
        pairs.append(
            {
                "pair_index": pair_index,
                "opening_id": semantic_id(100_000 + pair_index),
                "games": [
                    {
                        "game_index": 0,
                        "game_id": semantic_id(200_000 + pair_index * 2),
                        "candidate_color": "sente",
                        "result": outcomes[0],
                    },
                    {
                        "game_index": 1,
                        "game_id": semantic_id(200_001 + pair_index * 2),
                        "candidate_color": "gote",
                        "result": outcomes[1],
                    },
                ],
            }
        )
    return {
        "schema": FORMAL_AB_V2_RESULT_SCHEMA,
        "plan": {
            "path": FRESH_SIBLING_PLAN_PATH,
            "bytes": FRESH_SIBLING_PLAN_BYTES,
            "sha256": FRESH_SIBLING_PLAN_SHA256,
            "schema": FRESH_SIBLING_PLAN_SCHEMA,
        },
        "protocol_amendment_sha256": FORMAL_AB_V2_AMENDMENT_SHA256,
        "experiment_id": semantic_id(10),
        "run_id": semantic_id(11),
        "attempt_index": 0,
        "attempt_ledger_sha256": digest(12),
        "rerun_authorization_sha256": None,
        "candidate_weights_sha256": digest(1),
        "stable_weights_sha256": digest(2),
        "match_binding_sha256": digest(3),
        "run_status": "complete",
        "technical_fault_count": 0,
        "pairs": pairs,
    }


class FormalPairedAbProtocolV2Test(unittest.TestCase):
    def _load_json(self, relative_path):
        return _strict_json_loads(
            Path(REPO_ROOT, relative_path).read_text(encoding="utf-8")
        )

    def _copy_amendment_chain(self, destination):
        for relative_path in (
            FRESH_SIBLING_PLAN_PATH,
            ORIGINAL_V1_REGISTRY_PATH,
            FORMAL_AB_V2_AMENDMENT_PATH,
        ):
            source = Path(REPO_ROOT, relative_path)
            target = Path(destination, relative_path)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)

    def test_checked_in_amendment_pins_immutable_plan_and_v1_registry(self):
        amendment_path = Path(REPO_ROOT, FORMAL_AB_V2_AMENDMENT_PATH)
        amendment_raw = amendment_path.read_bytes()
        self.assertEqual(len(amendment_raw), FORMAL_AB_V2_AMENDMENT_BYTES)
        self.assertEqual(
            hashlib.sha256(amendment_raw).hexdigest(),
            FORMAL_AB_V2_AMENDMENT_SHA256,
        )
        amendment = validate_formal_ab_v2_amendment_chain(REPO_ROOT)
        self.assertEqual(amendment["pre_result_state"]["v1_games_observed"], 0)
        self.assertEqual(amendment["pre_result_state"]["v2_attempts_observed"], 0)
        self.assertFalse(amendment["authority"]["execution_authorized"])

        v1_raw = Path(REPO_ROOT, ORIGINAL_V1_REGISTRY_PATH).read_bytes()
        self.assertEqual(len(v1_raw), ORIGINAL_V1_REGISTRY_BYTES)
        self.assertEqual(
            hashlib.sha256(v1_raw).hexdigest(), ORIGINAL_V1_REGISTRY_SHA256
        )

    def test_amendment_chain_fails_if_v1_is_missing_or_drifted(self):
        with tempfile.TemporaryDirectory() as temporary:
            self._copy_amendment_chain(temporary)
            Path(temporary, ORIGINAL_V1_REGISTRY_PATH).unlink()
            with self.assertRaises(FileNotFoundError):
                validate_formal_ab_v2_amendment_chain(temporary)

        with tempfile.TemporaryDirectory() as temporary:
            self._copy_amendment_chain(temporary)
            v1_path = Path(temporary, ORIGINAL_V1_REGISTRY_PATH)
            v1_path.write_bytes(v1_path.read_bytes() + b"\n")
            with self.assertRaisesRegex(ValueError, "byte length differs"):
                validate_formal_ab_v2_amendment_chain(temporary)

        with tempfile.TemporaryDirectory() as temporary:
            self._copy_amendment_chain(temporary)
            v1_path = Path(temporary, ORIGINAL_V1_REGISTRY_PATH)
            raw = bytearray(v1_path.read_bytes())
            raw[-2] = ord(" ")
            v1_path.write_bytes(raw)
            with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
                validate_formal_ab_v2_amendment_chain(temporary)

        with tempfile.TemporaryDirectory() as temporary:
            self._copy_amendment_chain(temporary)
            Path(temporary, FORMAL_AB_V2_AMENDMENT_PATH).unlink()
            with self.assertRaises(FileNotFoundError):
                validate_formal_ab_v2_amendment_chain(temporary)

    def test_checked_in_registry_is_closed_and_observed_zero_games(self):
        registry_path = Path(REPO_ROOT, FORMAL_AB_V2_REGISTRY_PATH)
        registry_raw = registry_path.read_bytes()
        self.assertEqual(len(registry_raw), FORMAL_AB_V2_REGISTRY_BYTES)
        self.assertEqual(
            hashlib.sha256(registry_raw).hexdigest(),
            FORMAL_AB_V2_REGISTRY_SHA256,
        )
        registry = validate_closed_formal_ab_v2_registry(registry_path)
        self.assertEqual(registry["fixed_protocol"]["pairs"], 384)
        self.assertEqual(registry["fixed_protocol"]["games"], 768)
        self.assertTrue(
            all(value is None for value in registry["enrollments"].values())
        )
        self.assertTrue(all(value is False for value in registry["gates"].values()))
        self.assertEqual(registry["nonclaims"]["pairs_observed"], 0)
        self.assertEqual(registry["nonclaims"]["games_observed"], 0)

        with tempfile.TemporaryDirectory() as temporary:
            self._copy_amendment_chain(temporary)
            target = Path(temporary, FORMAL_AB_V2_REGISTRY_PATH)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(registry_raw + b"\n")
            with self.assertRaisesRegex(ValueError, "byte length differs"):
                validate_closed_formal_ab_v2_registry(target)

        with tempfile.TemporaryDirectory() as temporary:
            self._copy_amendment_chain(temporary)
            target = Path(temporary, FORMAL_AB_V2_REGISTRY_PATH)
            target.parent.mkdir(parents=True, exist_ok=True)
            drifted = bytearray(registry_raw)
            drifted[-2] = ord(" ")
            target.write_bytes(drifted)
            with self.assertRaisesRegex(ValueError, "SHA-256 differs"):
                validate_closed_formal_ab_v2_registry(target)

    def test_amendment_hash_binds_the_complete_registry_decision_rule(self):
        amendment = self._load_json(FORMAL_AB_V2_AMENDMENT_PATH)
        registry = self._load_json(FORMAL_AB_V2_REGISTRY_PATH)
        self.assertEqual(
            amendment["amendment"]["fixed_decision_rule"],
            registry["fixed_protocol"],
        )
        rule = amendment["amendment"]["fixed_decision_rule"]
        self.assertEqual(rule["bootstrap_seed"], BOOTSTRAP_SEED)
        self.assertEqual(rule["bootstrap_replicates"], BOOTSTRAP_REPLICATES)
        self.assertEqual(
            rule["maximum_attempts_per_experiment"],
            MAXIMUM_ATTEMPTS_PER_EXPERIMENT,
        )
        self.assertEqual(
            rule["rerun_authorization_policy"],
            "at-most-one-new-run-authorized-from-technical-evidence-before-any-"
            "result-unblinding",
        )

    def test_all_wins_pass_statistics_but_never_grant_authority(self):
        report = analyze_formal_paired_ab_v2(result_fixture())
        self.assertEqual(report["counts"], {"pairs": 384, "games": 768})
        self.assertEqual(report["point_score_rate"]["numerator"], 1536)
        self.assertEqual(report["point_score_rate"]["denominator"], 1536)
        self.assertTrue(report["gates"]["complete_384_pairs_768_games"])
        self.assertTrue(report["gates"]["technical_faults_exactly_zero"])
        self.assertTrue(report["gates"]["safety_strictly_above_0_45"])
        self.assertTrue(report["gates"]["stronger_claim_strictly_above_0_50"])
        self.assertTrue(report["gates"]["formal_ab_passed"])
        self.assertFalse(report["authority"]["promotion_authorized"])
        self.assertFalse(report["authority"]["production_weight_write_authorized"])
        self.assertEqual(
            report["nonclaims"],
            {"strength_improved": False, "high_dan_calibrated": False},
        )

    def test_exact_half_score_cannot_claim_stronger_or_pass(self):
        report = analyze_formal_paired_ab_v2(
            result_fixture([("win", "loss")] * PAIR_COUNT)
        )
        self.assertEqual(report["point_score_rate"]["decimal"], 0.5)
        self.assertTrue(report["gates"]["safety_strictly_above_0_45"])
        self.assertFalse(report["gates"]["stronger_claim_strictly_above_0_50"])
        self.assertFalse(report["gates"]["formal_ab_passed"])

    def test_partial_result_and_technical_fault_are_not_analyzable(self):
        fixture = result_fixture()
        fixture["pairs"].pop()
        with self.assertRaisesRegex(ValueError, "exactly 384 pairs"):
            analyze_formal_paired_ab_v2(fixture)

        for invalid_count in (1, False, -1):
            fixture = result_fixture()
            fixture["technical_fault_count"] = invalid_count
            with self.assertRaisesRegex(ValueError, "not analyzable"):
                analyze_formal_paired_ab_v2(fixture)

        fixture = result_fixture()
        fixture["run_status"] = "stopped-technical-fault"
        with self.assertRaisesRegex(ValueError, "not a complete run"):
            analyze_formal_paired_ab_v2(fixture)

    def test_bootstrap_resamples_384_pairs_and_is_deterministic(self):
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
            (704, 692),
        )

    def test_precision_is_planning_approximation_not_guarantee_or_power(self):
        half_width = NORMAL_APPROXIMATION_Z * math.sqrt(
            PAIR_SCORE_VARIANCE_UPPER_BOUND / PAIR_COUNT
        )
        self.assertGreater(half_width, 0.05)
        self.assertLess(half_width, 0.0501)

        amendment = self._load_json(FORMAL_AB_V2_AMENDMENT_PATH)
        precision = amendment["amendment"]["precision_basis"]
        self.assertAlmostEqual(
            float(precision["replacement_384_pair_half_width"]),
            half_width,
            places=5,
        )
        self.assertTrue(precision["bootstrap_width_is_data_dependent"])
        self.assertFalse(precision["guaranteed_maximum_half_width"])
        self.assertFalse(precision["power_guarantee"])
        self.assertFalse(precision["acceptance_uses_this_approximation"])

    def test_rejects_order_color_duplicate_ids_and_wrong_amendment(self):
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
        fixture["pairs"][1]["games"][0]["game_id"] = fixture["pairs"][0]["games"][0][
            "game_id"
        ]
        with self.assertRaisesRegex(ValueError, "game IDs must be globally unique"):
            decode_pair_score_units(fixture)

        fixture = result_fixture()
        fixture["protocol_amendment_sha256"] = digest(99)
        with self.assertRaisesRegex(ValueError, "amendment identity is invalid"):
            decode_pair_score_units(fixture)

    def test_rejects_wrong_plan_schema_weights_results_and_extra_fields(self):
        fixture = result_fixture()
        fixture["plan"]["bytes"] -= 1
        with self.assertRaisesRegex(ValueError, "differs from preregistration"):
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

    def test_result_binds_experiment_run_ledger_and_blinded_rerun_authorization(self):
        first = result_fixture()
        report = analyze_formal_paired_ab_v2(first)
        self.assertEqual(report["attempt_index"], 0)
        self.assertIsNone(report["rerun_authorization_sha256"])

        second = result_fixture()
        second["attempt_index"] = 1
        second["run_id"] = semantic_id(13)
        second["rerun_authorization_sha256"] = digest(14)
        report = analyze_formal_paired_ab_v2(second)
        self.assertEqual(report["attempt_index"], 1)
        self.assertEqual(report["rerun_authorization_sha256"], digest(14))

        invalid = result_fixture()
        invalid["attempt_index"] = 2
        with self.assertRaisesRegex(ValueError, "integer 0 or 1"):
            decode_pair_score_units(invalid)

        invalid = result_fixture()
        invalid["rerun_authorization_sha256"] = digest(14)
        with self.assertRaisesRegex(ValueError, "first attempt cannot carry"):
            decode_pair_score_units(invalid)

        invalid = result_fixture()
        invalid["attempt_index"] = 1
        with self.assertRaisesRegex(ValueError, "rerun_authorization_sha256"):
            decode_pair_score_units(invalid)

        invalid = result_fixture()
        invalid["run_id"] = invalid["experiment_id"]
        with self.assertRaisesRegex(ValueError, "identities must differ"):
            decode_pair_score_units(invalid)

    def test_rejects_non_json_string_and_mapping_subclasses(self):
        fixture = result_fixture()
        fixture["candidate_weights_sha256"] = TextSubclass(digest(1))
        with self.assertRaisesRegex(ValueError, "not a lowercase SHA-256"):
            decode_pair_score_units(fixture)

        fixture = result_fixture()
        fixture["pairs"][0]["opening_id"] = TextSubclass(
            fixture["pairs"][1]["opening_id"]
        )
        with self.assertRaisesRegex(ValueError, "not a canonical"):
            decode_pair_score_units(fixture)

        fixture = result_fixture()
        fixture["pairs"][0]["games"][0]["game_id"] = TextSubclass(
            fixture["pairs"][1]["games"][0]["game_id"]
        )
        with self.assertRaisesRegex(ValueError, "not a canonical"):
            decode_pair_score_units(fixture)

        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            decode_pair_score_units(DictSubclass(result_fixture()))

        fixture = result_fixture()
        schema = fixture.pop("schema")
        fixture[TextSubclass("schema")] = schema
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            decode_pair_score_units(fixture)

        fixture = result_fixture()
        fixture["pairs"][0] = DictSubclass(fixture["pairs"][0])
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            decode_pair_score_units(fixture)

    def test_closed_registry_rejects_enrollment_open_gate_and_supersession_drift(self):
        registry = self._load_json(FORMAL_AB_V2_REGISTRY_PATH)
        validate_closed_formal_ab_v2_registry_data(registry)

        enrolled = copy.deepcopy(registry)
        enrolled["enrollments"]["candidate_weights"] = {"sha256": digest(9)}
        with self.assertRaisesRegex(ValueError, "type differs"):
            validate_closed_formal_ab_v2_registry_data(enrolled)

        opened = copy.deepcopy(registry)
        opened["gates"]["execution_authorized"] = True
        with self.assertRaisesRegex(ValueError, "differs from preregistration"):
            validate_closed_formal_ab_v2_registry_data(opened)

        old_size = copy.deepcopy(registry)
        old_size["fixed_protocol"]["pairs"] = 192
        with self.assertRaisesRegex(ValueError, "differs from preregistration"):
            validate_closed_formal_ab_v2_registry_data(old_size)

        drifted_v1 = copy.deepcopy(registry)
        drifted_v1["supersession"]["original_v1_registry"]["sha256"] = digest(8)
        with self.assertRaisesRegex(ValueError, "differs from preregistration"):
            validate_closed_formal_ab_v2_registry_data(drifted_v1)

    def test_amendment_rejects_retrospective_observation_or_authority(self):
        amendment = self._load_json(FORMAL_AB_V2_AMENDMENT_PATH)
        validate_formal_ab_v2_amendment_data(amendment)

        observed = copy.deepcopy(amendment)
        observed["pre_result_state"]["v1_games_observed"] = 1
        with self.assertRaisesRegex(ValueError, "differs from preregistration"):
            validate_formal_ab_v2_amendment_data(observed)

        opened = copy.deepcopy(amendment)
        opened["authority"]["result_reader_authorized"] = True
        with self.assertRaisesRegex(ValueError, "differs from preregistration"):
            validate_formal_ab_v2_amendment_data(opened)

        spoofed = copy.deepcopy(amendment)
        spoofed["schema"] = EqualToEveryString()
        with self.assertRaisesRegex(ValueError, "type differs"):
            validate_formal_ab_v2_amendment_data(spoofed)

    def test_strict_json_rejects_duplicates_and_nonfinite_values(self):
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            _strict_json_loads('{"schema":"first","schema":"second"}')
        with self.assertRaisesRegex(ValueError, "non-finite JSON value"):
            _strict_json_loads('{"value":NaN}')

    def test_promotion_validator_always_stops(self):
        with self.assertRaisesRegex(
            ValueError, "authorization is not implemented; production remains STOP"
        ):
            validate_formal_ab_v2_promotion_receipt({})


if __name__ == "__main__":
    unittest.main()
