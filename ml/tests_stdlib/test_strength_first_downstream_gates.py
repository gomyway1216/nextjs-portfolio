from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
MODULE_PATH = ML_DIR / "strength_first_downstream_gates.py"
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import strength_first_downstream_gates as GATES  # noqa: E402


def digest(character: str) -> str:
    return character * 64


def identity(name: str, character: str, schema: str | None = None) -> dict:
    return {
        "path": name,
        "bytes": 100 + ord(character),
        "sha256": digest(character),
        "schema": schema or f"test-{name}-v1",
    }


def ready_registry() -> dict:
    return {
        "schema": GATES.DOWNSTREAM_REGISTRY_SCHEMA,
        "status": GATES.DOWNSTREAM_READY_STATUS,
        "protocol": {
            "base_plan": copy.deepcopy(GATES._BASE_PLAN_IDENTITY),
            "strength_first_amendment": copy.deepcopy(
                GATES._STRENGTH_FIRST_AMENDMENT_IDENTITY
            ),
        },
        "enrollments": {
            "candidate_selection_receipt": identity(
                "candidate-selection.json", "1"
            ),
            "candidate_checkpoint": identity("candidate.pt", "2"),
            "stable_checkpoint": identity("stable.pt", "3"),
            "candidate_weights": identity("candidate.bin", "4"),
            "stable_weights": identity("stable.bin", "5"),
            "fresh_final_holdout": identity("fresh-final.jsonl", "6"),
            "legacy_final_holdout": identity("legacy-final.jsonl", "7"),
            "general_retention": identity("general.jsonl", "8"),
            "opening_retention": identity("opening.jsonl", "9"),
            "known_regression_fixture": identity("known-regression.json", "a"),
            "production_worker": identity("shogi-ai.worker.js", "b"),
            "production_wasm": identity("shogi.wasm", "c"),
            "browser_time_budgets_ms": [800, 2_000, 4_000],
        },
        "gates": copy.deepcopy(GATES._READY_GATES),
        "boundary": copy.deepcopy(GATES._BOUNDARY),
        "nonclaims": copy.deepcopy(GATES._NONCLAIMS),
    }


def final_metrics() -> dict:
    return {
        "candidate_int16_pair_accuracy": 0.61,
        "stable_int16_pair_accuracy": 0.60,
        "candidate_int16_top1_accuracy": 0.27,
        "stable_int16_top1_accuracy": 0.27,
    }


def retention_metrics() -> dict:
    return {
        role: {
            "candidate_value_mae_cp": 101.0,
            "stable_value_mae_cp": 100.0,
            "candidate_pair_accuracy": 0.601,
            "stable_pair_accuracy": 0.60,
            "candidate_decisive_pair_accuracy": 0.701,
            "stable_decisive_pair_accuracy": 0.70,
        }
        for role in ("general", "opening")
    }


def known_regression_observation() -> dict:
    return {
        "static_ranks": {"P*8f": 16, "3a4b": 1},
        "fixed_depth_bestmoves": {"11": "3a4b", "12": "3a4b"},
        "timed_bestmoves": [
            {"time_ms": time_ms, "run": run, "bestmove": "3a4b"}
            for time_ms in (800, 2_000, 4_000)
            for run in (1, 2, 3)
        ],
    }


def production_parity_observation(registry: dict) -> dict:
    return {
        "loaded_weights_sha256": registry["enrollments"]["candidate_weights"][
            "sha256"
        ],
        "production_worker_path_verified": True,
        "production_wasm_path_verified": True,
        "budget_runs": [
            {
                "time_ms": value,
                "move_is_legal": True,
                "completed_within_budget": True,
            }
            for value in registry["enrollments"]["browser_time_budgets_ms"]
        ],
        "console_errors": 0,
        "runtime_errors": 0,
    }


def callbacks(registry: dict) -> dict:
    return {
        "evaluate_fresh_final": lambda _context: final_metrics(),
        "evaluate_legacy_final": lambda _context: final_metrics(),
        "evaluate_retention": lambda _context: retention_metrics(),
        "evaluate_known_regression": lambda _context: (
            known_regression_observation()
        ),
        "evaluate_production_parity": lambda _context: (
            production_parity_observation(registry)
        ),
    }


class StrengthFirstDownstreamRegistryTests(unittest.TestCase):
    def test_checked_in_registry_is_exactly_closed(self):
        path = MODULE_PATH.parents[1] / GATES.DOWNSTREAM_REGISTRY_RELATIVE_PATH
        registry = json.loads(path.read_text(encoding="utf-8"))

        validated = GATES.validate_downstream_registry_data(registry)

        self.assertEqual(validated["status"], GATES.DOWNSTREAM_BLOCKED_STATUS)
        self.assertTrue(
            all(value is None for value in validated["enrollments"].values())
        )
        self.assertEqual(validated["nonclaims"]["final_holdout_label_reads"], 0)
        self.assertEqual(validated["nonclaims"]["downstream_receipts_emitted"], 0)

    def test_blocked_registry_rejects_an_invented_identity(self):
        path = MODULE_PATH.parents[1] / GATES.DOWNSTREAM_REGISTRY_RELATIVE_PATH
        registry = json.loads(path.read_text(encoding="utf-8"))
        registry["enrollments"]["candidate_weights"] = identity(
            "candidate.bin", "d"
        )

        with self.assertRaisesRegex(ValueError, "contains an enrollment"):
            GATES.validate_downstream_registry_data(registry)

    def test_ready_registry_requires_every_exact_input_and_closed_live_gate(self):
        registry = ready_registry()
        GATES.validate_downstream_registry_data(registry)
        registry["gates"]["production_weight_write_authorized"] = True

        with self.assertRaisesRegex(ValueError, "gates mismatch"):
            GATES.validate_downstream_registry_data(registry)

    def test_ready_registry_rejects_parent_traversal_identity(self):
        registry = ready_registry()
        registry["enrollments"]["candidate_weights"]["path"] = "../candidate.bin"

        with self.assertRaisesRegex(ValueError, "identity is invalid"):
            GATES.validate_downstream_registry_data(registry)

    def test_fixed_registry_rechecks_protocol_bytes(self):
        repo_root = MODULE_PATH.parent.parent
        with tempfile.TemporaryDirectory() as directory:
            isolated = Path(directory)
            relative_paths = (
                GATES.DOWNSTREAM_REGISTRY_RELATIVE_PATH,
                GATES._BASE_PLAN_IDENTITY["path"],
                GATES._STRENGTH_FIRST_AMENDMENT_IDENTITY["path"],
            )
            for relative in relative_paths:
                target = isolated / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((repo_root / relative).read_bytes())
            amendment = (
                isolated / GATES._STRENGTH_FIRST_AMENDMENT_IDENTITY["path"]
            )
            raw = bytearray(amendment.read_bytes())
            raw[-2] = 0x20 if raw[-2] != 0x20 else 0x21
            amendment.write_bytes(raw)

            with self.assertRaisesRegex(ValueError, "identity mismatch"):
                GATES._load_fixed_registry(isolated)

    def test_argumentless_production_path_stops_before_candidate_or_holdout_reader(
        self,
    ):
        repo_root = MODULE_PATH.parent.parent
        with mock.patch.object(
            GATES,
            "_load_fixed_registry",
            wraps=GATES._load_fixed_registry,
        ) as registry_reader:
            with self.assertRaises(GATES.DownstreamGatesBlocked):
                GATES.run_strength_first_downstream_gates()

        registry_reader.assert_called_once_with(repo_root)


class StrengthFirstDownstreamCoreTests(unittest.TestCase):
    def run_valid(self, registry: dict | None = None):
        registry = ready_registry() if registry is None else registry
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry,
            selected_seed=43,
        )
        return GATES.run_strength_first_downstream_gates_core_for_tests(
            registry=registry,
            authorization=authorization,
            **callbacks(registry),
        )

    def test_plain_mapping_cannot_open_any_downstream_reader(self):
        registry = ready_registry()
        calls = []

        def reader(_context):
            calls.append("read")
            return final_metrics()

        configured = callbacks(registry)
        configured["evaluate_fresh_final"] = reader
        with self.assertRaisesRegex(ValueError, "branded"):
            GATES.run_strength_first_downstream_gates_core_for_tests(
                registry=registry,
                authorization={"self_claimed": True},
                **configured,
            )

        self.assertEqual(calls, [])

    def test_authorization_is_one_shot_even_after_success(self):
        registry = ready_registry()
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry
        )
        GATES.run_strength_first_downstream_gates_core_for_tests(
            registry=registry,
            authorization=authorization,
            **callbacks(registry),
        )

        with self.assertRaisesRegex(ValueError, "already consumed"):
            GATES.run_strength_first_downstream_gates_core_for_tests(
                registry=registry,
                authorization=authorization,
                **callbacks(registry),
            )

    def test_valid_core_emits_exact_five_pass_receipts_without_live_authority(self):
        result = self.run_valid()

        self.assertEqual(result["status"], "complete-all-downstream-gates-pass")
        self.assertEqual(result["selected_seed"], 43)
        self.assertEqual(
            set(result["receipts"]),
            {
                "fresh_final_holdout",
                "legacy_final_holdout",
                "retention",
                "known_regression",
                "production_parity",
            },
        )
        self.assertTrue(result["formal_ab_enrollment_ready"])
        self.assertFalse(result["production_weight_write_authorized"])
        self.assertFalse(result["live_weights_changed"])
        for receipt in result["receipts"].values():
            self.assertEqual(receipt["status"], "pass")
            self.assertFalse(receipt["production_weight_write_authorized"])

    def test_stored_result_reconstructs_every_receipt(self):
        registry = ready_registry()
        result = self.run_valid(registry)

        validated = GATES.validate_downstream_result_data(
            result,
            registry=registry,
        )

        self.assertIs(validated, result)

    def test_stored_result_rejects_tampered_receipt_and_top_level_fields(self):
        registry = ready_registry()
        result = self.run_valid(registry)
        mutations = (
            lambda value: value["receipts"]["retention"]["gates"].update(
                {"value_mae_cp": "candidate-always-passes"}
            ),
            lambda value: value["receipts"]["production_parity"].update(
                {"loaded_weights_sha256": digest("d")}
            ),
            lambda value: value.update(
                {"production_weight_write_authorized": True}
            ),
        )

        for mutate in mutations:
            with self.subTest(mutation=mutate):
                tampered = copy.deepcopy(result)
                mutate(tampered)
                with self.assertRaisesRegex(
                    ValueError,
                    "downstream result",
                ):
                    GATES.validate_downstream_result_data(
                        tampered,
                        registry=registry,
                    )

    def test_stored_result_rejects_metrics_that_no_longer_pass(self):
        registry = ready_registry()
        result = self.run_valid(registry)
        result["receipts"]["fresh_final_holdout"]["metrics"][
            "candidate_int16_pair_accuracy"
        ] = 0.59

        with self.assertRaisesRegex(
            ValueError,
            "contains failed gate: fresh_final_holdout",
        ):
            GATES.validate_downstream_result_data(
                result,
                registry=registry,
            )

    def test_fresh_final_failure_stops_before_every_later_reader(self):
        registry = ready_registry()
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry
        )
        calls = []
        configured = callbacks(registry)
        configured["evaluate_fresh_final"] = lambda _context: {
            **final_metrics(),
            "candidate_int16_pair_accuracy": 0.59,
        }
        for name in (
            "evaluate_legacy_final",
            "evaluate_retention",
            "evaluate_known_regression",
            "evaluate_production_parity",
        ):
            configured[name] = lambda _context, name=name: calls.append(name)

        with self.assertRaisesRegex(
            GATES.DownstreamGateFailed,
            "fresh_final_holdout",
        ):
            GATES.run_strength_first_downstream_gates_core_for_tests(
                registry=registry,
                authorization=authorization,
                **configured,
            )

        self.assertEqual(calls, [])

    def test_retention_uses_preregistered_floors(self):
        registry = ready_registry()
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry
        )
        configured = callbacks(registry)
        failed = retention_metrics()
        failed["opening"]["candidate_value_mae_cp"] = 105.000001
        configured["evaluate_retention"] = lambda _context: failed

        with self.assertRaisesRegex(
            GATES.DownstreamGateFailed,
            "opening_retention",
        ):
            GATES.run_strength_first_downstream_gates_core_for_tests(
                registry=registry,
                authorization=authorization,
                **configured,
            )

    def test_known_regression_rejects_one_bad_timed_move(self):
        registry = ready_registry()
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry
        )
        configured = callbacks(registry)
        failed = known_regression_observation()
        failed["timed_bestmoves"][7]["bestmove"] = "P*8f"
        configured["evaluate_known_regression"] = lambda _context: failed

        with self.assertRaisesRegex(
            GATES.DownstreamGateFailed,
            "known_regression_timed",
        ):
            GATES.run_strength_first_downstream_gates_core_for_tests(
                registry=registry,
                authorization=authorization,
                **configured,
            )

    def test_browser_parity_binds_exact_candidate_and_each_budget(self):
        registry = ready_registry()
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry
        )
        configured = callbacks(registry)
        failed = production_parity_observation(registry)
        failed["budget_runs"][1]["move_is_legal"] = False
        configured["evaluate_production_parity"] = lambda _context: failed

        with self.assertRaisesRegex(
            GATES.DownstreamGateFailed,
            "production_parity_budget",
        ):
            GATES.run_strength_first_downstream_gates_core_for_tests(
                registry=registry,
                authorization=authorization,
                **configured,
            )

    def test_receipt_identity_is_canonical_and_does_not_write(self):
        receipt = self.run_valid()["receipts"]["retention"]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binding = GATES.receipt_identity(
                receipt,
                path="retention-receipt.json",
            )

            self.assertEqual(binding["schema"], GATES.RETENTION_RECEIPT_SCHEMA)
            self.assertGreater(binding["bytes"], 0)
            self.assertEqual(len(binding["sha256"]), 64)
            self.assertEqual(list(root.iterdir()), [])

    def test_receipt_identity_rejects_parent_traversal(self):
        receipt = self.run_valid()["receipts"]["retention"]

        with self.assertRaisesRegex(ValueError, "canonical relative path"):
            GATES.receipt_identity(
                receipt,
                path="../retention-receipt.json",
            )


if __name__ == "__main__":
    unittest.main()
