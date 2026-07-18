import copy
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import fresh_qat_parent_accounting_v2 as ACCOUNTING  # noqa: E402
import fresh_qat_protocol as FRESH  # noqa: E402


def semantic_id(number):
    return f"sha256:{number:064x}"


def identifier_digest(values):
    return hashlib.sha256(
        "\n".join(sorted(set(values))).encode("ascii")
    ).hexdigest()


def make_inputs(count=4, games=2):
    return [
        {
            "game_id": semantic_id(10 + index % games),
            "parent_id": semantic_id(100 + index),
            "position_id": semantic_id(200 + index),
        }
        for index in range(count)
    ]


def make_input_binding(inputs):
    games = {item["game_id"] for item in inputs}
    parents = {item["parent_id"] for item in inputs}
    positions = {item["position_id"] for item in inputs}
    return {
        "path": "synthetic/training.raw.jsonl",
        "format": "shogi-floodgate-label-free-raw-parent-jsonl-v1",
        "bytes": 123,
        "sha256": hashlib.sha256(b"synthetic input").hexdigest(),
        "parents": len(inputs),
        "games": len(games),
        "game_ids_sha256": identifier_digest(games),
        "parent_ids_sha256": identifier_digest(parents),
        "position_ids_count": len(positions),
        "position_ids_sha256": identifier_digest(positions),
    }


def row_for(parent, child_number, teacher_rank):
    return {
        "schema": "shogi-sibling-v1",
        "schema_version": 1,
        "game_id": parent["game_id"],
        "parent_id": parent["parent_id"],
        "position_id": parent["position_id"],
        "child_position_id": semantic_id(child_number),
        "split": "train",
        "teacher_rank": teacher_rank,
    }


def train_rows(inputs, emitted_indices):
    rows = []
    for input_index in emitted_indices:
        parent = inputs[input_index]
        rows.extend(
            [
                row_for(parent, 1_000 + input_index * 2, 1),
                row_for(parent, 1_001 + input_index * 2, 2),
            ]
        )
    return rows


def rows_bytes(rows):
    return b"".join(
        (
            json.dumps(
                row,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
                allow_nan=False,
            )
            + "\n"
        ).encode("utf-8")
        for row in rows
    )


def materialize(inputs, emitted_indices):
    return ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
        inputs,
        rows_bytes(train_rows(inputs, emitted_indices)),
        expected_input_binding=make_input_binding(inputs),
    )


class DictSubclass(dict):
    pass


class FreshQATParentAccountingV2Test(unittest.TestCase):
    def setUp(self):
        self.inputs = make_inputs()
        self.binding = make_input_binding(self.inputs)

    def test_checked_in_amendment_chain_preserves_every_upstream_identity(self):
        amendment_path = Path(
            REPO_ROOT,
            ACCOUNTING.FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_PATH,
        )
        amendment_raw = amendment_path.read_bytes()
        self.assertEqual(
            len(amendment_raw),
            ACCOUNTING.FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_BYTES,
        )
        self.assertEqual(
            hashlib.sha256(amendment_raw).hexdigest(),
            ACCOUNTING.FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_SHA256,
        )
        amendment = (
            ACCOUNTING.validate_fresh_qat_parent_accounting_amendment_chain(
                REPO_ROOT
            )
        )
        self.assertEqual(
            amendment["amendment"]["fixed_parent_accounting"]["input_parents"],
            24_000,
        )
        self.assertFalse(
            amendment["authority"]["training_dispatch_authorized"]
        )
        self.assertEqual(
            Path(
                REPO_ROOT,
                "ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json",
            ).stat().st_size,
            10_890,
        )

    def test_checked_in_registry_is_closed_and_grants_no_authority(self):
        registry_path = Path(
            REPO_ROOT,
            ACCOUNTING.FRESH_QAT_PLAN_REGISTRY_PATH_V2,
        )
        raw = registry_path.read_bytes()
        self.assertEqual(
            len(raw), ACCOUNTING.FRESH_QAT_PLAN_REGISTRY_BYTES_V2
        )
        self.assertEqual(
            hashlib.sha256(raw).hexdigest(),
            ACCOUNTING.FRESH_QAT_PLAN_REGISTRY_SHA256_V2,
        )
        registry = ACCOUNTING.validate_closed_fresh_qat_plan_registry_v2(
            registry_path
        )
        self.assertTrue(
            all(value is None for value in registry["enrollments"].values())
        )
        self.assertTrue(
            all(value is False for value in registry["gates"].values())
        )
        self.assertTrue(
            all(value is False for value in registry["authority"].values())
        )

    def test_zero_forced_is_valid_and_passes_24000_equivalent_e_to_contract(self):
        proposal = materialize(self.inputs, [0, 1, 2, 3])
        accounting = proposal["parent_accounting"]
        self.assertEqual(accounting["input_parents"], 4)
        self.assertEqual(accounting["forced_parents_skipped"], 0)
        self.assertEqual(accounting["emitted_parent_groups"], 4)
        self.assertEqual(accounting["model_training_parents"], 4)
        self.assertEqual(
            accounting["forced_parent_ids_sha256"],
            ACCOUNTING.EMPTY_IDENTIFIER_SET_SHA256,
        )
        self.assertEqual(
            accounting["emitted_parent_ids_sha256"],
            accounting["input_parent_ids_sha256"],
        )
        self.assertEqual(proposal["model_training"]["parents"], 4)
        self.assertTrue(
            all(
                contract["model_training_parents"] == 4
                for contract in proposal["training_contracts"]
            )
        )
        self.assertEqual(ACCOUNTING.FRESH_QAT_INPUT_PARENTS, 24_000)
        self.assertEqual(
            0 + ACCOUNTING.FRESH_QAT_INPUT_PARENTS,
            ACCOUNTING.FRESH_QAT_INPUT_PARENTS,
        )

    def test_some_forced_is_valid_without_replacement_or_resampling(self):
        proposal = materialize(self.inputs, [0, 2])
        accounting = proposal["parent_accounting"]
        self.assertEqual(accounting["input_parents"], 4)
        self.assertEqual(accounting["forced_parents_skipped"], 2)
        self.assertEqual(accounting["emitted_parent_groups"], 2)
        self.assertEqual(accounting["model_training_parents"], 2)
        self.assertEqual(accounting["replacement_parents"], 0)
        self.assertEqual(accounting["resampled_parents"], 0)
        self.assertTrue(accounting["emitted_order_preserved"])
        self.assertEqual(
            accounting["forced_parent_ids_sha256"],
            identifier_digest(
                [
                    self.inputs[1]["parent_id"],
                    self.inputs[3]["parent_id"],
                ]
            ),
        )
        self.assertEqual(proposal["model_training"]["records"], 4)
        self.assertEqual(proposal["model_training"]["games"], 1)
        self.assertEqual(
            proposal["model_training"]["parent_ids_sha256"],
            identifier_digest(
                [
                    self.inputs[0]["parent_id"],
                    self.inputs[2]["parent_id"],
                ]
            ),
        )
        self.assertGreaterEqual(
            proposal["model_training"]["semantic_position_ids_count"], 2
        )
        self.assertTrue(
            all(
                contract["model_training_parents"] == 2
                for contract in proposal["training_contracts"]
            )
        )

    def test_all_forced_is_fully_accounted_but_stops_without_a_proposal(self):
        with self.assertRaises(
            ACCOUNTING.FreshQATNoTrainableParentGroups
        ) as caught:
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                self.inputs,
                b"",
                expected_input_binding=self.binding,
            )
        receipt = caught.exception.accounting_receipt
        accounting = receipt["parent_accounting"]
        self.assertEqual(receipt["status"], "STOP-no-trainable-parent-groups")
        self.assertEqual(accounting["input_parents"], 4)
        self.assertEqual(accounting["forced_parents_skipped"], 4)
        self.assertEqual(accounting["emitted_parent_groups"], 0)
        self.assertTrue(accounting["equation_verified"])
        self.assertEqual(
            accounting["forced_parent_ids_sha256"],
            accounting["input_parent_ids_sha256"],
        )
        self.assertEqual(
            accounting["emitted_parent_ids_sha256"],
            ACCOUNTING.EMPTY_IDENTIFIER_SET_SHA256,
        )
        self.assertEqual(receipt["train"]["records"], 0)
        self.assertEqual(receipt["train"]["parents"], 0)
        self.assertEqual(
            receipt["train"]["sha256"],
            ACCOUNTING.EMPTY_IDENTIFIER_SET_SHA256,
        )
        self.assertTrue(
            all(value is False for value in receipt["authority"].values())
        )

    def test_rejects_replacement_reorder_reopen_and_metadata_substitution(self):
        replacement = copy.deepcopy(train_rows(self.inputs, [0]))
        replacement[0]["parent_id"] = semantic_id(999_999)
        with self.assertRaisesRegex(ValueError, "replacement parent"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                self.inputs,
                rows_bytes(replacement),
                expected_input_binding=self.binding,
            )

        with self.assertRaisesRegex(ValueError, "order-preserving"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                self.inputs,
                rows_bytes(train_rows(self.inputs, [2, 0])),
                expected_input_binding=self.binding,
            )

        reopened = (
            train_rows(self.inputs, [0])
            + train_rows(self.inputs, [1])
            + train_rows(self.inputs, [0])
        )
        with self.assertRaisesRegex(ValueError, "reopens"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                self.inputs,
                rows_bytes(reopened),
                expected_input_binding=self.binding,
            )

        substituted = train_rows(self.inputs, [0])
        substituted[0]["game_id"] = self.inputs[1]["game_id"]
        with self.assertRaisesRegex(ValueError, "metadata differs"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                self.inputs,
                rows_bytes(substituted),
                expected_input_binding=self.binding,
            )

    def test_rejects_wrong_input_count_identity_duplicates_and_noncanonical_ids(self):
        with self.assertRaisesRegex(ValueError, "count differs"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                self.inputs[:-1],
                b"",
                expected_input_binding=self.binding,
            )

        wrong_digest = copy.deepcopy(self.binding)
        wrong_digest["parent_ids_sha256"] = "f" * 64
        with self.assertRaisesRegex(ValueError, "identifiers differ"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                self.inputs,
                b"",
                expected_input_binding=wrong_digest,
            )

        duplicated = copy.deepcopy(self.inputs)
        duplicated[1]["parent_id"] = duplicated[0]["parent_id"]
        duplicate_binding = make_input_binding(duplicated)
        with self.assertRaisesRegex(ValueError, "duplicate parent"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                duplicated,
                b"",
                expected_input_binding=duplicate_binding,
            )

        malformed = copy.deepcopy(self.inputs)
        malformed[0]["parent_id"] = "not-canonical"
        malformed_binding = copy.deepcopy(self.binding)
        with self.assertRaisesRegex(ValueError, "not a canonical"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                malformed,
                b"",
                expected_input_binding=malformed_binding,
            )

    def test_rejects_bad_train_framing_duplicate_keys_nonfinite_and_short_group(self):
        valid = rows_bytes(train_rows(self.inputs, [0]))
        with self.assertRaisesRegex(ValueError, "final LF"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                self.inputs,
                valid[:-1],
                expected_input_binding=self.binding,
            )
        with self.assertRaisesRegex(ValueError, "CR"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                self.inputs,
                valid.replace(b"\n", b"\r\n"),
                expected_input_binding=self.binding,
            )
        with self.assertRaisesRegex(ValueError, "blank line|final LF"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                self.inputs,
                valid + b"\n",
                expected_input_binding=self.binding,
            )

        duplicate_key = (
            b'{"schema":"shogi-sibling-v1","schema":"shogi-sibling-v1"}\n'
        )
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                self.inputs,
                duplicate_key,
                expected_input_binding=self.binding,
            )

        nonfinite = valid.replace(b'"teacher_rank":1', b'"teacher_rank":NaN', 1)
        with self.assertRaisesRegex(ValueError, "non-finite"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                self.inputs,
                nonfinite,
                expected_input_binding=self.binding,
            )

        one_row = rows_bytes(train_rows(self.inputs, [0])[:1])
        with self.assertRaisesRegex(ValueError, "fewer than two"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                self.inputs,
                one_row,
                expected_input_binding=self.binding,
            )

    def test_proposal_binds_train_bytes_hash_records_games_and_semantic_ids(self):
        raw = rows_bytes(train_rows(self.inputs, [0, 1, 3]))
        proposal = (
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
                self.inputs,
                raw,
                expected_input_binding=self.binding,
            )
        )
        training = proposal["model_training"]
        self.assertEqual(training["bytes"], len(raw))
        self.assertEqual(training["sha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(training["records"], 6)
        self.assertEqual(training["parents"], 3)
        self.assertEqual(training["games"], 2)
        self.assertEqual(
            training["game_ids_sha256"],
            identifier_digest(
                [
                    self.inputs[0]["game_id"],
                    self.inputs[1]["game_id"],
                    self.inputs[3]["game_id"],
                ]
            ),
        )
        expected_semantic = {
            self.inputs[index]["position_id"] for index in [0, 1, 3]
        } | {
            semantic_id(1_000 + index * 2 + offset)
            for index in [0, 1, 3]
            for offset in [0, 1]
        }
        self.assertEqual(
            training["semantic_position_ids_count"],
            len(expected_semantic),
        )
        self.assertEqual(
            training["semantic_position_ids_sha256"],
            identifier_digest(expected_semantic),
        )

    def test_tampered_proposal_cannot_change_counts_contracts_or_authority(self):
        proposal = materialize(self.inputs, [0, 2])

        def validate(value):
            return ACCOUNTING._validate_fresh_qat_parent_accounting_proposal_v2(
                value,
                expected_input_binding=self.binding,
                expected_boundary="synthetic-test-core-proposal-only",
            )

        validate(proposal)
        for mutation, message in (
            (
                lambda value: value["parent_accounting"].__setitem__(
                    "emitted_parent_groups", 3
                ),
                "accounting",
            ),
            (
                lambda value: value["model_training"].__setitem__("parents", 3),
                "accounting",
            ),
            (
                lambda value: value["training_contracts"][0].__setitem__(
                    "model_training_parents", 3
                ),
                "contracts",
            ),
            (
                lambda value: value["unchanged_contracts"]["training"].__setitem__(
                    "epochs", 21
                ),
                "changed|differ",
            ),
            (
                lambda value: value["authority"].__setitem__(
                    "training_dispatch_authorized", True
                ),
                "authority",
            ),
        ):
            tampered = copy.deepcopy(proposal)
            mutation(tampered)
            with self.assertRaisesRegex(ValueError, message):
                validate(tampered)

        extra = copy.deepcopy(proposal)
        extra["unexpected"] = True
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            validate(extra)

        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            validate(DictSubclass(proposal))

    def test_production_wrapper_and_validator_are_pinned_to_real_role_bundle(self):
        synthetic = materialize(self.inputs, [0, 1])
        with self.assertRaisesRegex(ValueError, "header|upstream"):
            ACCOUNTING.validate_fresh_qat_parent_accounting_proposal_v2(
                synthetic
            )
        with self.assertRaisesRegex(ValueError, "count differs"):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2(
                self.inputs,
                rows_bytes(train_rows(self.inputs, [0, 1])),
            )
        self.assertEqual(
            ACCOUNTING.PRODUCTION_INPUT_TRAINING_BINDING["parents"],
            24_000,
        )
        self.assertEqual(
            ACCOUNTING.PRODUCTION_INPUT_TRAINING_BINDING[
                "parent_ids_sha256"
            ],
            "6681bd08bb282be04f47bf3157ea07fbbe2bc6a6864a100ce65902dc9cc3f08f",
        )

    def test_amendment_and_registry_reject_retrospective_state_or_open_gate(self):
        amendment_path = Path(
            REPO_ROOT,
            ACCOUNTING.FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_PATH,
        )
        amendment = json.loads(amendment_path.read_text(encoding="utf-8"))
        ACCOUNTING.validate_fresh_qat_parent_accounting_amendment_data(
            amendment
        )
        observed = copy.deepcopy(amendment)
        observed["pre_result_state"]["forced_parents_observed"] = 1
        with self.assertRaisesRegex(ValueError, "differs from preregistration"):
            ACCOUNTING.validate_fresh_qat_parent_accounting_amendment_data(
                observed
            )

        registry_path = Path(
            REPO_ROOT,
            ACCOUNTING.FRESH_QAT_PLAN_REGISTRY_PATH_V2,
        )
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
        ACCOUNTING.validate_closed_fresh_qat_plan_registry_v2_data(registry)
        opened = copy.deepcopy(registry)
        opened["gates"]["training_dispatch_ready"] = True
        with self.assertRaisesRegex(ValueError, "differs from preregistration"):
            ACCOUNTING.validate_closed_fresh_qat_plan_registry_v2_data(opened)

    def test_chain_rejects_missing_or_drifted_v1_and_historical_evidence(self):
        paths = [
            ACCOUNTING.FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_PATH,
            "ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json",
            "ml/protocols/floodgate-q1-2026-role-bundle-result.json",
            "ml/protocols/floodgate-q1-2026-fresh-qat-plan-registry.json",
            (
                "ml/protocols/"
                "floodgate-q1-2026-fresh-qat-selection-preflight-registry.json"
            ),
            "docs/data/floodgate-fresh-qat-plan-binding-2026-07-17.json",
            (
                "docs/data/"
                "floodgate-fresh-qat-selection-preflight-2026-07-17.json"
            ),
            "docs/blog-shogi-floodgate-fresh-qat-plan-binding.md",
            "docs/blog-shogi-floodgate-fresh-qat-plan-binding.en.md",
            "docs/blog-shogi-floodgate-fresh-qat-selection-preflight.md",
            "docs/blog-shogi-floodgate-fresh-qat-selection-preflight.en.md",
        ]

        def copy_chain(destination):
            for relative in paths:
                target = Path(destination, relative)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(Path(REPO_ROOT, relative), target)

        with tempfile.TemporaryDirectory() as temporary:
            copy_chain(temporary)
            Path(
                temporary,
                "ml/protocols/floodgate-q1-2026-fresh-qat-plan-registry.json",
            ).unlink()
            with self.assertRaises(FileNotFoundError):
                ACCOUNTING.validate_fresh_qat_parent_accounting_amendment_chain(
                    temporary
                )

        with tempfile.TemporaryDirectory() as temporary:
            copy_chain(temporary)
            target = Path(
                temporary,
                "docs/data/floodgate-fresh-qat-plan-binding-2026-07-17.json",
            )
            target.write_bytes(target.read_bytes() + b"\n")
            with self.assertRaisesRegex(ValueError, "byte length differs"):
                ACCOUNTING.validate_fresh_qat_parent_accounting_amendment_chain(
                    temporary
                )

    def test_v1_contract_and_selection_policies_are_unchanged(self):
        proposal = materialize(self.inputs, [0, 2])
        unchanged = proposal["unchanged_contracts"]
        self.assertEqual(
            unchanged["training"], FRESH.FRESH_QAT_REQUIRED_TRAINING
        )
        self.assertEqual(
            unchanged["selection"], FRESH.FRESH_QAT_REQUIRED_SELECTION
        )
        self.assertEqual(
            [slot["seed"] for slot in unchanged["slots"]], [42, 43, 44]
        )
        self.assertEqual(unchanged["training"]["epochs"], 20)
        self.assertEqual(unchanged["training"]["loss"], "sibling-ranking")
        self.assertEqual(
            unchanged["training"]["architecture"],
            "2282-256-32-1-clipped-relu",
        )
        self.assertFalse(unchanged["training"]["early_stopping"])

    def test_materializer_does_not_write_registry_and_authorizer_always_stops(self):
        registry_path = Path(
            REPO_ROOT,
            ACCOUNTING.FRESH_QAT_PLAN_REGISTRY_PATH_V2,
        )
        before = registry_path.read_bytes()
        proposal = materialize(self.inputs, [0, 2])
        self.assertEqual(registry_path.read_bytes(), before)
        with self.assertRaisesRegex(ValueError, "not implemented.*STOP"):
            ACCOUNTING.authorize_fresh_qat_training_v2(proposal)
        self.assertEqual(registry_path.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
