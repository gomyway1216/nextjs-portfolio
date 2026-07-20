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
import sibling_selection_protocol as LEGACY_SELECTION  # noqa: E402


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
    schemas = GATES._ROLE_IDENTITY_SCHEMAS
    return {
        "schema": GATES.DOWNSTREAM_REGISTRY_SCHEMA,
        "status": GATES.DOWNSTREAM_READY_STATUS,
        "protocol": {
            "base_plan": copy.deepcopy(GATES._BASE_PLAN_IDENTITY),
            "strength_first_amendment": copy.deepcopy(
                GATES._STRENGTH_FIRST_AMENDMENT_IDENTITY
            ),
        },
        "candidate_selection_contract": copy.deepcopy(
            GATES._CANDIDATE_SELECTION_CONTRACT
        ),
        "enrollments": {
            "candidate_selection_receipt": identity(
                "candidate-selection.json",
                "1",
                schemas["candidate_selection_receipt"],
            ),
            "candidate_checkpoint": identity(
                "candidate.pt",
                "2",
                schemas["candidate_checkpoint"],
            ),
            "stable_checkpoint": identity(
                "stable.pt",
                "3",
                schemas["stable_checkpoint"],
            ),
            "candidate_weights": identity(
                "candidate.bin",
                "4",
                schemas["candidate_weights"],
            ),
            "stable_weights": identity(
                "stable.bin",
                "5",
                schemas["stable_weights"],
            ),
            "fresh_final_holdout": identity(
                "fresh-final.jsonl",
                "6",
                schemas["fresh_final_holdout"],
            ),
            "legacy_final_holdout": identity(
                "legacy-final.jsonl",
                "7",
                schemas["legacy_final_holdout"],
            ),
            "general_retention": identity(
                "general.jsonl",
                "8",
                schemas["general_retention"],
            ),
            "opening_retention": identity(
                "opening.jsonl",
                "9",
                schemas["opening_retention"],
            ),
            "known_regression_fixture": identity(
                "known-regression.json",
                "a",
                schemas["known_regression_fixture"],
            ),
            "production_worker": identity(
                "shogi-ai.worker.js",
                "b",
                schemas["production_worker"],
            ),
            "production_wasm": identity(
                "shogi.wasm",
                "c",
                schemas["production_wasm"],
            ),
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


def observation_results(registry: dict) -> dict:
    return {
        "fresh_final_holdout": final_metrics(),
        "legacy_final_holdout": final_metrics(),
        "retention": retention_metrics(),
        "known_regression": known_regression_observation(),
        "production_parity": production_parity_observation(registry),
    }


def verified_callbacks(
    registry: dict,
    *,
    selected_seed: int = 43,
    results: dict | None = None,
    measured_inputs: dict | None = None,
    evidence_paths: dict | None = None,
) -> tuple[dict, dict]:
    results = observation_results(registry) if results is None else results
    measured_inputs = {} if measured_inputs is None else measured_inputs
    evidence_paths = {} if evidence_paths is None else evidence_paths
    tokens = {}
    observations = {}
    for role in GATES._EVALUATION_ROLES:
        token = GATES._issue_verified_evaluation_observation_for_tests(
            role=role,
            selected_seed=selected_seed,
            measured_inputs=copy.deepcopy(
                measured_inputs.get(
                    role,
                    GATES._expected_measured_inputs(registry, role),
                )
            ),
            result=copy.deepcopy(results[role]),
            evidence_path=evidence_paths.get(role),
        )
        observations[role] = token.to_dict()
        tokens[role] = token
    callbacks = {
        "evaluate_fresh_final": (
            lambda _context: tokens["fresh_final_holdout"]
        ),
        "evaluate_legacy_final": (
            lambda _context: tokens["legacy_final_holdout"]
        ),
        "evaluate_retention": lambda _context: tokens["retention"],
        "evaluate_known_regression": (
            lambda _context: tokens["known_regression"]
        ),
        "evaluate_production_parity": (
            lambda _context: tokens["production_parity"]
        ),
    }
    return callbacks, observations


def callbacks(registry: dict, *, selected_seed: int = 42) -> dict:
    return verified_callbacks(registry, selected_seed=selected_seed)[0]


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
        self.assertEqual(
            validated["candidate_selection_contract"],
            GATES._CANDIDATE_SELECTION_CONTRACT,
        )

    def test_candidate_selection_contract_is_warm_three_seed_only(self):
        contract = ready_registry()["candidate_selection_contract"]

        self.assertEqual(contract["series"], "warm")
        self.assertEqual(contract["seeds"], [42, 43, 44])
        self.assertEqual(contract["run_count"], 3)
        self.assertTrue(contract["warm_only"])
        self.assertFalse(contract["wcsc36_six_run_receipt_compatible"])
        self.assertEqual(
            contract["training_result_schema"],
            GATES.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA,
        )
        self.assertEqual(
            contract["selection"],
            GATES.FRESH_QAT_REQUIRED_SELECTION,
        )
        self.assertNotEqual(
            contract["receipt_schema"],
            LEGACY_SELECTION.CANDIDATE_SELECTION_RECEIPT_SCHEMA,
        )

    def test_registry_rejects_six_run_selection_semantic_collision(self):
        mutations = (
            (
                "receipt_schema",
                LEGACY_SELECTION.CANDIDATE_SELECTION_RECEIPT_SCHEMA,
            ),
            ("run_count", 6),
            ("series", "baseline"),
        )
        for field, value in mutations:
            with self.subTest(field=field):
                registry = ready_registry()
                registry["candidate_selection_contract"][field] = value

                with self.assertRaisesRegex(
                    ValueError,
                    "candidate-selection contract mismatch",
                ):
                    GATES.validate_downstream_registry_data(registry)

        registry = ready_registry()
        registry["enrollments"]["candidate_selection_receipt"]["schema"] = (
            LEGACY_SELECTION.CANDIDATE_SELECTION_RECEIPT_SCHEMA
        )
        with self.assertRaisesRegex(
            ValueError,
            "candidate_selection_receipt schema mismatch",
        ):
            GATES.validate_downstream_registry_data(registry)

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

    def test_ready_registry_requires_exact_role_schema(self):
        registry = ready_registry()
        registry["enrollments"]["fresh_final_holdout"]["schema"] = (
            GATES.LEGACY_FINAL_HOLDOUT_IDENTITY_SCHEMA
        )

        with self.assertRaisesRegex(
            ValueError,
            "fresh_final_holdout schema mismatch",
        ):
            GATES.validate_downstream_registry_data(registry)

    def test_ready_registry_rejects_reused_role_path_or_hash(self):
        for field in ("path", "sha256"):
            with self.subTest(field=field):
                registry = ready_registry()
                registry["enrollments"]["legacy_final_holdout"][field] = (
                    registry["enrollments"]["fresh_final_holdout"][field]
                )

                with self.assertRaisesRegex(
                    ValueError,
                    "pairwise-distinct",
                ):
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
    def run_valid_details(self, registry: dict | None = None):
        registry = ready_registry() if registry is None else registry
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry,
            selected_seed=43,
        )
        configured, observations = verified_callbacks(registry)
        result = GATES.run_strength_first_downstream_gates_core_for_tests(
            registry=registry,
            authorization=authorization,
            **configured,
        )
        return result, observations

    def run_valid(self, registry: dict | None = None):
        return self.run_valid_details(registry)[0]

    def evidence_bundle(self, registry: dict, observations: dict):
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry,
            selected_seed=observations["fresh_final_holdout"][
                "selected_seed"
            ],
        )
        return GATES._issue_verified_downstream_evidence_bundle_for_tests(
            registry=registry,
            authorization=authorization,
            observations=observations,
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

    def test_authorization_binds_the_entire_canonical_registry_snapshot(self):
        registry = ready_registry()
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry,
            selected_seed=44,
        )

        registry_raw, candidate_raw = GATES._CANDIDATE_AUTHORIZATIONS[
            authorization
        ]
        snapshot = GATES._strict_json_loads(registry_raw, "test snapshot")
        candidate = GATES._strict_json_loads(candidate_raw, "test candidate")

        self.assertEqual(
            candidate["downstream_registry"],
            GATES._registry_identity(registry_raw),
        )
        self.assertEqual(
            snapshot["candidate_selection_contract"],
            GATES._CANDIDATE_SELECTION_CONTRACT,
        )
        self.assertEqual(
            snapshot["enrollments"]["browser_time_budgets_ms"],
            [800, 2_000, 4_000],
        )

    def test_authorization_cannot_cross_to_another_ready_registry(self):
        registry = ready_registry()
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry
        )
        other = copy.deepcopy(registry)
        other["enrollments"]["browser_time_budgets_ms"][-1] = 5_000
        GATES.validate_downstream_registry_data(other)
        calls = []

        def reader(_context):
            calls.append("read")

        configured = {
            name: reader
            for name in (
                "evaluate_fresh_final",
                "evaluate_legacy_final",
                "evaluate_retention",
                "evaluate_known_regression",
                "evaluate_production_parity",
            )
        }
        with self.assertRaisesRegex(
            ValueError,
            "authorization registry snapshot mismatch",
        ):
            GATES.run_strength_first_downstream_gates_core_for_tests(
                registry=other,
                authorization=authorization,
                **configured,
            )

        self.assertEqual(calls, [])
        with self.assertRaisesRegex(ValueError, "already consumed"):
            GATES.run_strength_first_downstream_gates_core_for_tests(
                registry=registry,
                authorization=authorization,
                **configured,
            )

    def test_caller_registry_mutation_cannot_change_inflight_receipts(self):
        registry = ready_registry()
        captured = copy.deepcopy(registry)
        captured_raw = GATES._canonical_json_bytes(captured)
        expected_identity = GATES._registry_identity(captured_raw)
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry,
            selected_seed=42,
        )
        configured, _ = verified_callbacks(
            registry,
            selected_seed=42,
        )
        original_fresh = configured["evaluate_fresh_final"]
        original_parity = configured["evaluate_production_parity"]
        callback_contexts = []
        parity_contexts = []

        def mutate_after_capture(context):
            callback_contexts.append(copy.deepcopy(context))
            registry["enrollments"]["browser_time_budgets_ms"][-1] = 5_000
            return original_fresh(context)

        def record_parity_context(context):
            parity_contexts.append(copy.deepcopy(context))
            return original_parity(context)

        configured["evaluate_fresh_final"] = mutate_after_capture
        configured["evaluate_production_parity"] = record_parity_context
        result = GATES.run_strength_first_downstream_gates_core_for_tests(
            registry=registry,
            authorization=authorization,
            **configured,
        )

        self.assertEqual(
            registry["enrollments"]["browser_time_budgets_ms"],
            [800, 2_000, 5_000],
        )
        self.assertEqual(result["downstream_registry"], expected_identity)
        self.assertEqual(
            callback_contexts[0]["downstream_registry"],
            expected_identity,
        )
        self.assertEqual(
            parity_contexts[0]["expected_measured_inputs"][
                "browser_time_budgets_ms"
            ],
            [800, 2_000, 4_000],
        )
        for receipt in result["receipts"].values():
            self.assertEqual(
                receipt["downstream_registry"],
                expected_identity,
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
        self.assertEqual(
            result["downstream_registry"]["schema"],
            GATES.DOWNSTREAM_REGISTRY_CANONICAL_IDENTITY_SCHEMA,
        )
        for role, receipt in result["receipts"].items():
            self.assertEqual(receipt["status"], "pass")
            self.assertFalse(receipt["production_weight_write_authorized"])
            self.assertEqual(
                receipt["evaluation_evidence"]["schema"],
                GATES._EVIDENCE_SCHEMAS[role],
            )
            self.assertEqual(len(receipt["measured_inputs_sha256"]), 64)
            self.assertEqual(
                receipt["downstream_registry"],
                result["downstream_registry"],
            )

    def test_plain_evaluator_mapping_cannot_issue_a_receipt(self):
        registry = ready_registry()
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry
        )
        configured = callbacks(registry)
        configured["evaluate_fresh_final"] = (
            lambda _context: final_metrics()
        )

        with self.assertRaisesRegex(
            ValueError,
            "branded verified observation",
        ):
            GATES.run_strength_first_downstream_gates_core_for_tests(
                registry=registry,
                authorization=authorization,
                **configured,
            )

    def test_evaluator_observation_must_bind_the_exact_measured_dataset(self):
        registry = ready_registry()
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry
        )
        wrong = GATES._expected_measured_inputs(
            registry,
            "fresh_final_holdout",
        )
        wrong["dataset"]["sha256"] = digest("d")
        configured, _ = verified_callbacks(
            registry,
            selected_seed=42,
            measured_inputs={"fresh_final_holdout": wrong},
        )

        with self.assertRaisesRegex(
            ValueError,
            "fresh_final_holdout measured input identity mismatch",
        ):
            GATES.run_strength_first_downstream_gates_core_for_tests(
                registry=registry,
                authorization=authorization,
                **configured,
            )

    def test_seed_values_require_exact_preregistered_integers(self):
        registry = ready_registry()
        with self.assertRaisesRegex(ValueError, "preregistered grid"):
            GATES._issue_candidate_selection_authorization_for_tests(
                registry,
                selected_seed=42.0,
            )
        with self.assertRaisesRegex(ValueError, "seed is invalid"):
            GATES._issue_verified_evaluation_observation_for_tests(
                role="fresh_final_holdout",
                selected_seed=42.0,
                measured_inputs=GATES._expected_measured_inputs(
                    registry,
                    "fresh_final_holdout",
                ),
                result=final_metrics(),
            )

    def test_stored_result_reconstructs_every_receipt(self):
        registry = ready_registry()
        result, observations = self.run_valid_details(registry)

        validated = GATES.validate_downstream_result_data(
            result,
            registry=registry,
            verified_evidence=self.evidence_bundle(
                registry,
                observations,
            ),
        )

        self.assertIs(validated, result)

    def test_stored_result_rejects_tampered_receipt_and_top_level_fields(self):
        registry = ready_registry()
        result, observations = self.run_valid_details(registry)
        mutations = (
            lambda value: value["downstream_registry"].update(
                {"bytes": value["downstream_registry"]["bytes"] + 1}
            ),
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
                        verified_evidence=self.evidence_bundle(
                            registry,
                            observations,
                        ),
                    )

    def test_stored_result_does_not_recreate_authority_from_changed_metrics(self):
        registry = ready_registry()
        result, observations = self.run_valid_details(registry)
        result["receipts"]["fresh_final_holdout"]["metrics"][
            "candidate_int16_pair_accuracy"
        ] = 0.59

        with self.assertRaisesRegex(
            ValueError,
            "differs from reconstructed receipts",
        ):
            GATES.validate_downstream_result_data(
                result,
                registry=registry,
                verified_evidence=self.evidence_bundle(
                    registry,
                    observations,
                ),
            )

    def test_stored_result_rejects_plain_unverified_evidence(self):
        registry = ready_registry()
        result, observations = self.run_valid_details(registry)

        with self.assertRaisesRegex(ValueError, "branded verified evidence"):
            GATES.validate_downstream_result_data(
                result,
                registry=registry,
                verified_evidence={"observations": observations},
            )

    def test_evidence_bundle_must_match_candidate_authorization_seed(self):
        registry = ready_registry()
        _, observations = self.run_valid_details(registry)
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry,
            selected_seed=42,
        )

        with self.assertRaisesRegex(
            ValueError,
            "evidence selected seed mismatch",
        ):
            GATES._issue_verified_downstream_evidence_bundle_for_tests(
                registry=registry,
                authorization=authorization,
                observations=observations,
            )

    def test_evidence_bundle_cannot_cross_to_another_ready_registry(self):
        registry = ready_registry()
        result, observations = self.run_valid_details(registry)
        bundle = self.evidence_bundle(registry, observations)
        other = copy.deepcopy(registry)
        other["enrollments"]["candidate_weights"]["sha256"] = digest("d")
        GATES.validate_downstream_registry_data(other)

        with self.assertRaisesRegex(
            ValueError,
            "evidence registry binding mismatch",
        ):
            GATES.validate_downstream_result_data(
                result,
                registry=other,
                verified_evidence=bundle,
            )

    def test_evidence_bundle_issuer_rejects_cross_registry_authorization(self):
        registry = ready_registry()
        _, observations = self.run_valid_details(registry)
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry,
            selected_seed=43,
        )
        other = copy.deepcopy(registry)
        other["enrollments"]["fresh_final_holdout"]["sha256"] = digest("d")
        GATES.validate_downstream_registry_data(other)

        with self.assertRaisesRegex(
            ValueError,
            "authorization registry snapshot mismatch",
        ):
            GATES._issue_verified_downstream_evidence_bundle_for_tests(
                registry=other,
                authorization=authorization,
                observations=observations,
            )

    def test_stored_result_does_not_synthesize_parity_verification(self):
        registry = ready_registry()
        result, _ = self.run_valid_details(registry)
        failed = observation_results(registry)
        failed["production_parity"][
            "production_worker_path_verified"
        ] = False
        _, failed_observations = verified_callbacks(
            registry,
            results=failed,
        )

        with self.assertRaisesRegex(
            ValueError,
            "contains failed gate: production_parity",
        ):
            GATES.validate_downstream_result_data(
                result,
                registry=registry,
                verified_evidence=self.evidence_bundle(
                    registry,
                    failed_observations,
                ),
            )

    def test_evidence_payload_tamper_breaks_its_content_binding(self):
        registry = ready_registry()
        _, observations = self.run_valid_details(registry)
        observations["fresh_final_holdout"]["result"][
            "candidate_int16_pair_accuracy"
        ] = 0.99

        with self.assertRaisesRegex(
            ValueError,
            "observation evidence identity mismatch",
        ):
            self.evidence_bundle(registry, observations)

    def test_live_core_rejects_reused_evidence_path_before_any_receipt(self):
        registry = ready_registry()
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry,
            selected_seed=42,
        )
        configured, _ = verified_callbacks(
            registry,
            selected_seed=42,
            evidence_paths={
                "fresh_final_holdout": "evidence/reused.json",
                "legacy_final_holdout": "evidence/reused.json",
            },
        )

        with mock.patch.object(
            GATES,
            "_final_holdout_receipt",
            wraps=GATES._final_holdout_receipt,
        ) as receipt_builder:
            with self.assertRaisesRegex(ValueError, "pairwise distinct"):
                GATES.run_strength_first_downstream_gates_core_for_tests(
                    registry=registry,
                    authorization=authorization,
                    **configured,
                )

        receipt_builder.assert_not_called()

    def test_five_evidence_hashes_must_also_be_pairwise_distinct(self):
        observations = {
            role: {
                "evidence": {
                    "path": f"evidence/{role}.json",
                    "sha256": digest(str(index + 1)),
                }
            }
            for index, role in enumerate(GATES._EVALUATION_ROLES)
        }
        observations["legacy_final_holdout"]["evidence"]["sha256"] = (
            observations["fresh_final_holdout"]["evidence"]["sha256"]
        )

        with self.assertRaisesRegex(ValueError, "pairwise distinct"):
            GATES._require_pairwise_distinct_observation_evidence(
                observations
            )

    def test_live_core_rejects_reused_evidence_hash_before_any_receipt(self):
        class FixedHash:
            def hexdigest(self):
                return digest("f")

        registry = ready_registry()
        with mock.patch.object(
            GATES.hashlib,
            "sha256",
            side_effect=lambda _raw=b"": FixedHash(),
        ):
            authorization = (
                GATES._issue_candidate_selection_authorization_for_tests(
                    registry,
                    selected_seed=42,
                )
            )
            configured, _ = verified_callbacks(
                registry,
                selected_seed=42,
            )
            with mock.patch.object(
                GATES,
                "_final_holdout_receipt",
                wraps=GATES._final_holdout_receipt,
            ) as receipt_builder:
                with self.assertRaisesRegex(ValueError, "pairwise distinct"):
                    GATES.run_strength_first_downstream_gates_core_for_tests(
                        registry=registry,
                        authorization=authorization,
                        **configured,
                    )

        receipt_builder.assert_not_called()

    def test_fresh_final_failure_stops_receipts_after_all_evidence_reads(self):
        registry = ready_registry()
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry
        )
        calls = []
        failed = observation_results(registry)
        failed["fresh_final_holdout"]["candidate_int16_pair_accuracy"] = 0.59
        configured, _ = verified_callbacks(
            registry,
            selected_seed=42,
            results=failed,
        )
        for name, callback in tuple(configured.items()):
            configured[name] = (
                lambda context, name=name, callback=callback: (
                    calls.append(name),
                    callback(context),
                )[1]
            )

        with mock.patch.object(
            GATES,
            "_final_holdout_receipt",
            wraps=GATES._final_holdout_receipt,
        ) as final_builder:
            with mock.patch.object(
                GATES,
                "_retention_receipt",
                wraps=GATES._retention_receipt,
            ) as later_builder:
                with self.assertRaisesRegex(
                    GATES.DownstreamGateFailed,
                    "fresh_final_holdout",
                ):
                    GATES.run_strength_first_downstream_gates_core_for_tests(
                        registry=registry,
                        authorization=authorization,
                        **configured,
                    )

        self.assertEqual(
            calls,
            [
                "evaluate_fresh_final",
                "evaluate_legacy_final",
                "evaluate_retention",
                "evaluate_known_regression",
                "evaluate_production_parity",
            ],
        )
        self.assertEqual(final_builder.call_count, 1)
        later_builder.assert_not_called()

    def test_retention_uses_preregistered_floors(self):
        registry = ready_registry()
        authorization = GATES._issue_candidate_selection_authorization_for_tests(
            registry
        )
        failed = observation_results(registry)
        failed["retention"]["opening"][
            "candidate_value_mae_cp"
        ] = 105.000001
        configured, _ = verified_callbacks(
            registry,
            selected_seed=42,
            results=failed,
        )

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
        failed = observation_results(registry)
        failed["known_regression"]["timed_bestmoves"][7]["bestmove"] = "P*8f"
        configured, _ = verified_callbacks(
            registry,
            selected_seed=42,
            results=failed,
        )

        with self.assertRaisesRegex(
            GATES.DownstreamGateFailed,
            "known_regression_timed",
        ):
            GATES.run_strength_first_downstream_gates_core_for_tests(
                registry=registry,
                authorization=authorization,
                **configured,
            )

    def test_known_regression_rejects_empty_or_non_usi_bestmoves(self):
        registry = ready_registry()
        for bestmove in ("", "resign", "3a4b trailing", "7g7"):
            with self.subTest(bestmove=bestmove):
                authorization = (
                    GATES._issue_candidate_selection_authorization_for_tests(
                        registry
                    )
                )
                failed = observation_results(registry)
                failed["known_regression"]["fixed_depth_bestmoves"][
                    "11"
                ] = bestmove
                configured, _ = verified_callbacks(
                    registry,
                    selected_seed=42,
                    results=failed,
                )

                with self.assertRaisesRegex(
                    GATES.DownstreamGateFailed,
                    "known_regression_fixed_depth",
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
        failed = observation_results(registry)
        failed["production_parity"]["budget_runs"][1][
            "move_is_legal"
        ] = False
        configured, _ = verified_callbacks(
            registry,
            selected_seed=42,
            results=failed,
        )

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
