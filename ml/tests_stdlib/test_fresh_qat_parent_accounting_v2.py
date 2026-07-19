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


def canonical_bytes(value):
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def rows_bytes(rows):
    return b"".join(canonical_bytes(row) + b"\n" for row in rows)


def semantic_id(domain, value):
    return "sha256:" + hashlib.sha256(
        f"{domain}\0{value}".encode("utf-8")
    ).hexdigest()


def identifier_digest(values):
    return hashlib.sha256(
        "\n".join(sorted(set(values))).encode("ascii")
    ).hexdigest()


def position_id(sfen):
    return semantic_id("sfen-v1", " ".join(sfen.split()[:3]))


def source_url(game_number):
    return (
        "https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/"
        f"wdoor+floodgate-300-10F+player{game_number}+opponent"
        f"+20260101010{game_number:02d}.csa"
    )


def make_input_rows(count=4, games=2):
    rows = []
    for index in range(count):
        game_number = index % games
        url = source_url(game_number)
        game_id = semantic_id(
            "floodgate-q1-2026-game-id-v1", url
        )
        ply = 20 + index
        hand = "-" if index == 0 else f"{index + 1}P"
        parent_sfen = f"9/9/9/9/9/9/9/9/9 b {hand} {ply + 1}"
        rows.append(
            {
                "schema_version": 1,
                "source": "floodgate",
                "source_url": url,
                "game_sha256": hashlib.sha256(
                    f"game-{game_number}".encode("ascii")
                ).hexdigest(),
                "game_id": game_id,
                "parent_id": semantic_id(
                    "parent-occurrence-v1", f"{game_id}\0{ply}"
                ),
                "position_id": position_id(parent_sfen),
                "parent_sfen": parent_sfen,
                "ply": ply,
                "played_move": "7g7f",
            }
        )
    return sorted(rows, key=lambda row: row["parent_id"])


def make_input_binding(raw, rows):
    games = {row["game_id"] for row in rows}
    parents = {row["parent_id"] for row in rows}
    positions = {row["position_id"] for row in rows}
    return {
        "path": "synthetic/training.raw.jsonl",
        "format": "shogi-floodgate-label-free-raw-parent-jsonl-v1",
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "parents": len(rows),
        "games": len(games),
        "game_ids_sha256": identifier_digest(games),
        "parent_ids_sha256": identifier_digest(parents),
        "position_ids_count": len(positions),
        "position_ids_sha256": identifier_digest(positions),
    }


def child_sfen(parent, rank):
    hand_count = 100 + parent["ply"] * 2 + rank
    return (
        f"9/9/9/9/9/9/9/9/9 w {hand_count}P "
        f"{parent['ply'] + 2}"
    )


def train_row(parent, rank):
    parent_cp = 200 - rank * 50
    child = child_sfen(parent, rank)
    return {
        "schema": "shogi-sibling-v1",
        "schema_version": 1,
        "game_id": parent["game_id"],
        "parent_id": parent["parent_id"],
        "position_id": parent["position_id"],
        "parent_sfen": parent["parent_sfen"],
        "parent_ply": parent["ply"],
        "ply": parent["ply"] + 1,
        "move": "7g7f" if rank == 1 else "2g2f",
        "sources": ["played", "teacher"] if rank == 1 else ["teacher"],
        "sfen": child,
        "child_position_id": position_id(child),
        "cp": -parent_cp,
        "child_sfen": child,
        "teacher_child_cp": -parent_cp,
        "teacher_parent_cp": parent_cp,
        "teacher_rank": rank,
        "teacher_score_kind": "cp",
        "split": "train",
    }


def train_rows(inputs, emitted_indices):
    rows = []
    for index in emitted_indices:
        rows.extend([train_row(inputs[index], 1), train_row(inputs[index], 2)])
    return rows


def group_raw_for(parent):
    return rows_bytes([train_row(parent, 1), train_row(parent, 2)])


def make_completion_rows(inputs, emitted_indices):
    emitted = set(emitted_indices)
    rows = []
    for index, parent in enumerate(inputs):
        forced = index not in emitted
        group_raw = b"" if forced else group_raw_for(parent)
        rows.append(
            {
                "schema": ACCOUNTING.FRESH_QAT_PARENT_COMPLETION_RECORD_SCHEMA,
                "game_id": parent["game_id"],
                "parent_id": parent["parent_id"],
                "position_id": parent["position_id"],
                "completed_parent_sha256": hashlib.sha256(
                    f"completed:{parent['parent_id']}".encode("ascii")
                ).hexdigest(),
                "forced_parent_skipped": forced,
                "train_group_records": 0 if forced else 2,
                "train_group_sha256": (
                    None
                    if forced
                    else hashlib.sha256(group_raw).hexdigest()
                ),
            }
        )
    return rows


def make_completion_binding(raw, rows):
    forced = [
        row["parent_id"] for row in rows if row["forced_parent_skipped"]
    ]
    emitted = [
        row["parent_id"] for row in rows if not row["forced_parent_skipped"]
    ]
    return {
        "path": "synthetic/parent-completion.jsonl",
        "format": ACCOUNTING.FRESH_QAT_PARENT_COMPLETION_FORMAT,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "records": len(rows),
        "forced_parents_skipped": len(forced),
        "emitted_parent_groups": len(emitted),
        "parent_ids_sha256": identifier_digest(
            row["parent_id"] for row in rows
        ),
        "forced_parent_ids_sha256": identifier_digest(forced),
        "emitted_parent_ids_sha256": identifier_digest(emitted),
    }


def make_artifacts(emitted_indices, count=4, games=2):
    inputs = make_input_rows(count=count, games=games)
    input_raw = rows_bytes(inputs)
    training_rows = train_rows(inputs, emitted_indices)
    train_raw = rows_bytes(training_rows)
    completion_rows = make_completion_rows(inputs, emitted_indices)
    completion_raw = rows_bytes(completion_rows)
    return {
        "inputs": inputs,
        "input_raw": input_raw,
        "input_binding": make_input_binding(input_raw, inputs),
        "train_rows": training_rows,
        "train_raw": train_raw,
        "completion_rows": completion_rows,
        "completion_raw": completion_raw,
        "completion_binding": make_completion_binding(
            completion_raw, completion_rows
        ),
    }


def materialize(artifacts):
    return (
        ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
            artifacts["input_raw"],
            artifacts["completion_raw"],
            artifacts["train_raw"],
            expected_input_binding=artifacts["input_binding"],
            expected_completion_binding=artifacts["completion_binding"],
        )
    )


def validate(proposal, artifacts):
    return (
        ACCOUNTING.validate_fresh_qat_parent_accounting_proposal_v2_core_for_tests(
            proposal,
            artifacts["input_raw"],
            artifacts["completion_raw"],
            artifacts["train_raw"],
            expected_input_binding=artifacts["input_binding"],
            expected_completion_binding=artifacts["completion_binding"],
        )
    )


class DictSubclass(dict):
    pass


class FreshQATParentAccountingV2Test(unittest.TestCase):
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
            amendment["amendment"]["fixed_parent_accounting"][
                "input_parents"
            ],
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

    def test_checked_in_registry_is_closed_and_completion_is_unenrolled(self):
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
        self.assertIsNone(
            registry["enrollments"]["parent_completion_evidence"]
        )
        self.assertTrue(
            all(value is None for value in registry["enrollments"].values())
        )
        self.assertTrue(all(not value for value in registry["gates"].values()))
        self.assertTrue(
            all(not value for value in registry["authority"].values())
        )

    def test_zero_forced_is_valid_and_passes_e_to_every_contract(self):
        artifacts = make_artifacts([0, 1, 2, 3])
        proposal = materialize(artifacts)
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
        validate(proposal, artifacts)

    def test_some_forced_is_explicit_without_replacement_or_resampling(self):
        artifacts = make_artifacts([0, 2])
        proposal = materialize(artifacts)
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
                    artifacts["inputs"][1]["parent_id"],
                    artifacts["inputs"][3]["parent_id"],
                ]
            ),
        )
        self.assertEqual(proposal["model_training"]["records"], 4)
        self.assertTrue(
            all(
                contract["model_training_parents"] == 2
                for contract in proposal["training_contracts"]
            )
        )
        validate(proposal, artifacts)

    def test_all_forced_is_accountable_but_stops_without_a_proposal(self):
        artifacts = make_artifacts([])
        with self.assertRaises(
            ACCOUNTING.FreshQATNoTrainableParentGroups
        ) as caught:
            materialize(artifacts)
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
            all(not value for value in receipt["authority"].values())
        )

    def test_input_raw_reorder_and_cross_parent_tuple_permutation_fail(self):
        artifacts = make_artifacts([0, 2])
        reordered = copy.deepcopy(artifacts)
        reordered["input_raw"] = rows_bytes(
            list(reversed(artifacts["inputs"]))
        )
        with self.assertRaisesRegex(ValueError, "raw bytes.*role binding"):
            materialize(reordered)

        permuted_rows = copy.deepcopy(artifacts["inputs"])
        first_game = permuted_rows[0]["game_id"]
        first_position = permuted_rows[0]["position_id"]
        permuted_rows[0]["game_id"] = permuted_rows[1]["game_id"]
        permuted_rows[0]["position_id"] = permuted_rows[1]["position_id"]
        permuted_rows[1]["game_id"] = first_game
        permuted_rows[1]["position_id"] = first_position
        permuted = copy.deepcopy(artifacts)
        permuted["input_raw"] = rows_bytes(permuted_rows)
        with self.assertRaisesRegex(ValueError, "raw bytes.*role binding"):
            materialize(permuted)

    def test_missing_nonforced_group_is_not_reclassified_as_forced(self):
        artifacts = make_artifacts([0, 2])
        missing = copy.deepcopy(artifacts)
        missing["train_raw"] = rows_bytes(
            train_rows(artifacts["inputs"], [0])
        )
        with self.assertRaisesRegex(ValueError, "differ.*dispositions"):
            materialize(missing)

        empty = copy.deepcopy(artifacts)
        empty["train_raw"] = b""
        with self.assertRaisesRegex(ValueError, "differ.*dispositions"):
            materialize(empty)

    def test_completion_requires_exact_coverage_order_flags_and_tuple(self):
        artifacts = make_artifacts([0, 2])
        for rows in (
            artifacts["completion_rows"][:-1],
            list(reversed(artifacts["completion_rows"])),
        ):
            changed = copy.deepcopy(artifacts)
            changed["completion_raw"] = rows_bytes(rows)
            with self.assertRaisesRegex(
                ValueError, "completion bytes.*identity"
            ):
                materialize(changed)

        changed_rows = copy.deepcopy(artifacts["completion_rows"])
        changed_rows[0]["forced_parent_skipped"] = True
        changed_rows[0]["train_group_records"] = 0
        changed_rows[0]["train_group_sha256"] = None
        changed = copy.deepcopy(artifacts)
        changed["completion_raw"] = rows_bytes(changed_rows)
        changed["completion_binding"] = make_completion_binding(
            changed["completion_raw"], changed_rows
        )
        with self.assertRaisesRegex(ValueError, "differ.*dispositions"):
            materialize(changed)

        changed_rows = copy.deepcopy(artifacts["completion_rows"])
        changed_rows[0]["position_id"] = artifacts["inputs"][1]["position_id"]
        changed = copy.deepcopy(artifacts)
        changed["completion_raw"] = rows_bytes(changed_rows)
        changed["completion_binding"] = make_completion_binding(
            changed["completion_raw"], changed_rows
        )
        with self.assertRaisesRegex(ValueError, "metadata differs"):
            materialize(changed)

    def test_completion_group_count_hash_and_forced_group_are_cross_checked(self):
        artifacts = make_artifacts([0, 2])
        changed_rows = copy.deepcopy(artifacts["completion_rows"])
        changed_rows[0]["train_group_records"] = 3
        changed = copy.deepcopy(artifacts)
        changed["completion_raw"] = rows_bytes(changed_rows)
        changed["completion_binding"] = make_completion_binding(
            changed["completion_raw"], changed_rows
        )
        with self.assertRaisesRegex(ValueError, "group differs"):
            materialize(changed)

        changed_rows = copy.deepcopy(artifacts["completion_rows"])
        changed_rows[0]["train_group_sha256"] = "f" * 64
        changed = copy.deepcopy(artifacts)
        changed["completion_raw"] = rows_bytes(changed_rows)
        changed["completion_binding"] = make_completion_binding(
            changed["completion_raw"], changed_rows
        )
        with self.assertRaisesRegex(ValueError, "group differs"):
            materialize(changed)

        forced_group = copy.deepcopy(artifacts)
        forced_group["train_raw"] = rows_bytes(
            train_rows(artifacts["inputs"], [0, 1, 2])
        )
        with self.assertRaisesRegex(ValueError, "differ.*dispositions"):
            materialize(forced_group)

    def test_rejects_replacement_reorder_reopen_and_metadata_substitution(self):
        artifacts = make_artifacts([0, 2])
        replacement_rows = copy.deepcopy(artifacts["train_rows"])
        replacement_rows[0]["parent_id"] = semantic_id("parent", "outside")
        changed = copy.deepcopy(artifacts)
        changed["train_raw"] = rows_bytes(replacement_rows)
        with self.assertRaisesRegex(ValueError, "replacement parent"):
            materialize(changed)

        changed = copy.deepcopy(artifacts)
        changed["train_raw"] = rows_bytes(
            train_rows(artifacts["inputs"], [2, 0])
        )
        with self.assertRaisesRegex(ValueError, "order-preserving"):
            materialize(changed)

        reopened_rows = (
            train_rows(artifacts["inputs"], [0])
            + train_rows(artifacts["inputs"], [2])
            + train_rows(artifacts["inputs"], [0])
        )
        changed = copy.deepcopy(artifacts)
        changed["train_raw"] = rows_bytes(reopened_rows)
        with self.assertRaisesRegex(ValueError, "reopens"):
            materialize(changed)

        substituted_rows = copy.deepcopy(artifacts["train_rows"])
        substituted_rows[0]["parent_sfen"] = artifacts["inputs"][1][
            "parent_sfen"
        ]
        substituted_rows[0]["position_id"] = artifacts["inputs"][1][
            "position_id"
        ]
        changed = copy.deepcopy(artifacts)
        changed["train_raw"] = rows_bytes(substituted_rows)
        with self.assertRaisesRegex(
            ValueError, "metadata differs|ply or rank is inconsistent"
        ):
            materialize(changed)

    def test_rejects_skeletal_rows_and_strict_sibling_invariant_tampering(self):
        artifacts = make_artifacts([0])
        skeletal = {
            "schema": "shogi-sibling-v1",
            "schema_version": 1,
            "game_id": artifacts["inputs"][0]["game_id"],
            "parent_id": artifacts["inputs"][0]["parent_id"],
            "position_id": artifacts["inputs"][0]["position_id"],
            "child_position_id": semantic_id("child", "skeletal"),
            "split": "train",
        }
        changed = copy.deepcopy(artifacts)
        changed["train_raw"] = rows_bytes([skeletal, skeletal])
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            materialize(changed)

        mutations = (
            (
                lambda rows: rows[0].__setitem__("cp", 999),
                "CP aliases",
            ),
            (
                lambda rows: rows[1].__setitem__("move", rows[0]["move"]),
                "repeats a sibling move",
            ),
            (
                lambda rows: rows[0].__setitem__("sources", ["teacher"]),
                "exactly one played",
            ),
            (
                lambda rows: rows[1].__setitem__("teacher_rank", 3),
                "ranks are not contiguous",
            ),
            (
                lambda rows: rows[0].__setitem__(
                    "child_position_id", semantic_id("child", "wrong")
                ),
                "SFEN semantic identifiers",
            ),
            (
                lambda rows: rows[0].__setitem__("parent_ply", True),
                "must be an integer",
            ),
            (
                lambda rows: rows[0].__setitem__(
                    "sources", ["teacher", "played"]
                ),
                "not unique and canonical",
            ),
            (
                lambda rows: (
                    rows[0].__setitem__(
                        "sfen",
                        rows[0]["sfen"].rsplit(" ", 1)[0]
                        + " ٢٤",
                    ),
                    rows[0].__setitem__(
                        "child_sfen",
                        rows[0]["child_sfen"].rsplit(" ", 1)[0]
                        + " ٢٤",
                    ),
                ),
                "canonical four-field SFEN",
            ),
        )
        for mutation, message in mutations:
            with self.subTest(message=message):
                rows = copy.deepcopy(artifacts["train_rows"])
                mutation(rows)
                changed = copy.deepcopy(artifacts)
                changed["train_raw"] = rows_bytes(rows)
                with self.assertRaisesRegex(ValueError, message):
                    materialize(changed)

    def test_rejects_bad_framing_duplicate_keys_nonfinite_and_noncanonical_json(self):
        artifacts = make_artifacts([0])
        for raw, message in (
            (artifacts["train_raw"][:-1], "final LF"),
            (artifacts["train_raw"].replace(b"\n", b"\r\n"), "NUL or CR"),
            (artifacts["train_raw"] + b"\n", "final LF"),
            (b"\xef\xbb\xbf" + artifacts["train_raw"], "BOM"),
        ):
            changed = copy.deepcopy(artifacts)
            changed["train_raw"] = raw
            with self.assertRaisesRegex(ValueError, message):
                materialize(changed)

        duplicate = (
            b'{"schema":"shogi-sibling-v1","schema":"shogi-sibling-v1"}\n'
        )
        changed = copy.deepcopy(artifacts)
        changed["train_raw"] = duplicate
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            materialize(changed)

        nonfinite = artifacts["train_raw"].replace(
            b'"teacher_rank":1', b'"teacher_rank":NaN', 1
        )
        changed = copy.deepcopy(artifacts)
        changed["train_raw"] = nonfinite
        with self.assertRaisesRegex(ValueError, "non-finite"):
            materialize(changed)

        noncanonical = artifacts["train_raw"].replace(b":", b": ", 1)
        changed = copy.deepcopy(artifacts)
        changed["train_raw"] = noncanonical
        with self.assertRaisesRegex(ValueError, "not canonical JSON"):
            materialize(changed)

    def test_proposal_binds_input_completion_train_and_semantic_identities(self):
        artifacts = make_artifacts([0, 1, 3])
        proposal = materialize(artifacts)
        self.assertEqual(
            proposal["upstream"]["input_training"]["sha256"],
            hashlib.sha256(artifacts["input_raw"]).hexdigest(),
        )
        self.assertEqual(
            proposal["upstream"]["parent_completion"]["sha256"],
            hashlib.sha256(artifacts["completion_raw"]).hexdigest(),
        )
        training = proposal["model_training"]
        self.assertEqual(training["bytes"], len(artifacts["train_raw"]))
        self.assertEqual(
            training["sha256"],
            hashlib.sha256(artifacts["train_raw"]).hexdigest(),
        )
        self.assertEqual(training["records"], 6)
        self.assertEqual(training["parents"], 3)
        expected_semantic = {
            artifacts["inputs"][index]["position_id"]
            for index in [0, 1, 3]
        } | {
            position_id(child_sfen(artifacts["inputs"][index], rank))
            for index in [0, 1, 3]
            for rank in [1, 2]
        }
        self.assertEqual(
            training["semantic_position_ids_count"], len(expected_semantic)
        )
        self.assertEqual(
            training["semantic_position_ids_sha256"],
            identifier_digest(expected_semantic),
        )

    def test_source_recomputing_validator_rejects_every_digest_tamper(self):
        artifacts = make_artifacts([0, 2])
        proposal = materialize(artifacts)
        validate(proposal, artifacts)
        accounting_digest_fields = (
            "input_parent_ids_sha256",
            "forced_parent_ids_sha256",
            "emitted_parent_ids_sha256",
            "input_position_ids_sha256",
            "forced_position_ids_sha256",
            "emitted_position_ids_sha256",
            "input_parent_tuple_sequence_sha256",
            "forced_parent_tuple_sequence_sha256",
            "emitted_parent_tuple_sequence_sha256",
        )
        for field in accounting_digest_fields:
            with self.subTest(field=field):
                tampered = copy.deepcopy(proposal)
                tampered["parent_accounting"][field] = "f" * 64
                with self.assertRaisesRegex(
                    ValueError, "source-artifact recomputation"
                ):
                    validate(tampered, artifacts)

        for field in (
            "sha256",
            "game_ids_sha256",
            "parent_ids_sha256",
            "semantic_position_ids_sha256",
        ):
            with self.subTest(model_training_field=field):
                tampered = copy.deepcopy(proposal)
                tampered["model_training"][field] = "f" * 64
                plan_stub = {
                    "inputs": {
                        "model_training": tampered["model_training"]
                    }
                }
                tampered["training_contracts"] = [
                    FRESH.build_fresh_qat_training_contract(plan_stub, slot)
                    for slot in tampered["unchanged_contracts"]["slots"]
                ]
                with self.assertRaisesRegex(
                    ValueError, "source-artifact recomputation"
                ):
                    validate(tampered, artifacts)

        tampered = copy.deepcopy(proposal)
        tampered["upstream"]["parent_completion"]["sha256"] = "f" * 64
        with self.assertRaisesRegex(
            ValueError, "source-artifact recomputation"
        ):
            validate(tampered, artifacts)

    def test_source_recomputing_validator_rejects_contract_authority_and_shape(self):
        artifacts = make_artifacts([0, 2])
        proposal = materialize(artifacts)
        mutations = (
            lambda value: value["parent_accounting"].__setitem__(
                "emitted_parent_groups", 3
            ),
            lambda value: value["training_contracts"][0].__setitem__(
                "model_training_parents", 3
            ),
            lambda value: value["unchanged_contracts"]["training"].__setitem__(
                "epochs", 21
            ),
            lambda value: value["authority"].__setitem__(
                "training_dispatch_authorized", True
            ),
            lambda value: value["nonclaims"].__setitem__(
                "strength_improved", True
            ),
        )
        for mutation in mutations:
            tampered = copy.deepcopy(proposal)
            mutation(tampered)
            with self.assertRaisesRegex(
                ValueError, "source-artifact recomputation"
            ):
                validate(tampered, artifacts)

        extra = copy.deepcopy(proposal)
        extra["unexpected"] = True
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            validate(extra, artifacts)
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            validate(DictSubclass(proposal), artifacts)

    def test_production_materializer_and_validator_fail_closed_without_enrollment(self):
        artifacts = make_artifacts([0, 1])
        with self.assertRaisesRegex(
            ValueError, "authenticated per-parent completion.*not enrolled"
        ):
            ACCOUNTING.materialize_fresh_qat_parent_accounting_proposal_v2(
                artifacts["input_raw"],
                artifacts["completion_raw"],
                artifacts["train_raw"],
            )
        proposal = materialize(artifacts)
        with self.assertRaisesRegex(
            ValueError, "authenticated per-parent completion.*not enrolled"
        ):
            ACCOUNTING.validate_fresh_qat_parent_accounting_proposal_v2(
                proposal,
                artifacts["input_raw"],
                artifacts["completion_raw"],
                artifacts["train_raw"],
            )
        self.assertEqual(
            ACCOUNTING.PRODUCTION_INPUT_TRAINING_BINDING["parents"], 24_000
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
        opened["gates"]["parent_completion_origin_authenticated"] = True
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

    def test_v1_contracts_are_unchanged_and_authorizer_always_stops(self):
        artifacts = make_artifacts([0, 2])
        proposal = materialize(artifacts)
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
        with self.assertRaisesRegex(ValueError, "not implemented.*STOP"):
            ACCOUNTING.authorize_fresh_qat_training_v2(proposal)


if __name__ == "__main__":
    unittest.main()
