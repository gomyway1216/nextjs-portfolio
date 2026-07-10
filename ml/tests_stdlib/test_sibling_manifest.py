import copy
import hashlib
import json
import os
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from sibling_manifest import (  # noqa: E402
    CANDIDATE_EXECUTION_ORDER,
    EXACT_RESCORE_MODE,
    LABEL_POLICY,
    RECORD_MANIFEST_SCHEMA,
    PARTITION_ALGORITHM,
    PARTITION_CONFLICT_RESOLUTION,
    PARTITION_DOMAIN,
    PARTITION_DROP_UNIT,
    PARTITION_EXPECTED_SOURCE_TRAINING_GAMES,
    PARTITION_EXPECTED_SOURCE_GAMES,
    PARTITION_FINAL_HOLDOUT_GAMES,
    PARTITION_OUTPUT_FORMAT,
    PARTITION_PRIORITY,
    PARTITION_RANK_ORDER,
    PARTITION_SEED,
    PARTITION_SEMANTIC_POSITION_SET,
    PARTITION_POLICY_EXPOSURE_POLICY,
    POLICY_EXPOSED_PARENT_IDS_FORMAT,
    POLICY_EXPOSED_SEMANTIC_POSITION_IDS_FORMAT,
    POLICY_EXPOSURE_RECEIPT_SCHEMA,
    PROTECTED_POSITION_IDS_FORMAT,
    RUNTIME_SNAPSHOT_CONTRACT,
    SEARCH_STATE_RESET,
    SYNTHESIZED_RANK_ORDER,
    TEACHER_MANIFEST_SCHEMA,
    VALIDATION_PARTITION_MANIFEST_SCHEMA,
    SiblingManifestError,
    load_policy_exposure_receipt,
    load_protected_position_ids,
    verify_sibling_manifest,
    verify_sibling_validation_partition,
)
import sibling_manifest as sibling_manifest_module  # noqa: E402


REVISION = "0123456789abcdef0123456789abcdef01234567"
PRODUCTION_POLICY_EXPOSURE_CONTRACT = copy.deepcopy(
    sibling_manifest_module.POLICY_EXPOSURE_CONTRACT
)

TEST_POLICY_EXPOSURE_CONTRACT = {
    "receipt": {
        "schema": POLICY_EXPOSURE_RECEIPT_SCHEMA,
        "bytes": 1,
        "sha256": "1" * 64,
    },
    "parent_ids": {
        "format": POLICY_EXPOSED_PARENT_IDS_FORMAT,
        "bytes": 1,
        "sha256": "2" * 64,
        "count": 1,
        "identifiers_sha256": "3" * 64,
    },
    "semantic_position_ids": {
        "format": POLICY_EXPOSED_SEMANTIC_POSITION_IDS_FORMAT,
        "bytes": 1,
        "sha256": "4" * 64,
        "count": 1,
        "identifiers_sha256": "5" * 64,
    },
    "role_accounting": {
        "training_parents": 0,
        "training_records": 0,
        "selection_parents": 0,
        "selection_records": 0,
        "holdout_parents": 0,
        "holdout_records": 0,
        "unmatched_parent_ids": 0,
    },
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def partition_row(game_id, parent_number, child_number, split):
    return {
        "schema": "shogi-sibling-v1",
        "schema_version": 1,
        "game_id": game_id,
        "parent_id": "sha256:" + f"{parent_number:064x}",
        "position_id": "sha256:" + f"{parent_number + 10_000:064x}",
        "child_position_id": "sha256:" + f"{child_number + 20_000:064x}",
        "split": split,
    }


def rows_bytes(rows):
    return b"".join(
        (json.dumps(row, sort_keys=True) + "\n").encode("utf-8") for row in rows
    )


def eval_tree_digest(files):
    canonical = "\n".join(
        json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        for value in files
    )
    return digest(("eval-tree-v1\0" + canonical).encode("utf-8"))


def manifest_for(
    train_bytes,
    val_bytes,
    *,
    train_records=42,
    train_parents=21,
    val_records=4,
    val_parents=2,
    train_game_ids_sha256="f" * 64,
    val_game_ids_sha256="c" * 64,
):
    return {
        "schema": TEACHER_MANIFEST_SCHEMA,
        "record_manifest_schema": RECORD_MANIFEST_SCHEMA,
        "search": {
            "label_policy": LABEL_POLICY,
            "exact_rescore_mode": EXACT_RESCORE_MODE,
            "search_state_reset_before_proposal": SEARCH_STATE_RESET,
            "search_state_reset_before_each_candidate": SEARCH_STATE_RESET,
            "tt_reset_before_proposal": True,
            "tt_reset_before_each_candidate": True,
            "candidate_execution_order": CANDIDATE_EXECUTION_ORDER,
            "synthesized_rank_order": SYNTHESIZED_RANK_ORDER,
        },
        "pipeline": {
            "source_revision": REVISION,
            "tracked_tree_clean": True,
        },
        "teacher": {
            "engine_bin_sha256": "a" * 64,
            "engine_bin_bytes": 123,
            "engine_args": ["--weights", "weights.bin"],
            "engine_arg_files": [
                {
                    "path": "weights.bin",
                    "bytes": 7,
                    "sha256": "b" * 64,
                }
            ],
            "eval_sha256": None,
            "eval_files": [],
            "runtime_snapshot": {
                **RUNTIME_SNAPSHOT_CONTRACT,
                "engine_argument_file_count": 1,
                "eval_tree_present": False,
            },
        },
        "outputs": {
            "train_sha256": digest(train_bytes),
            "val_sha256": digest(val_bytes),
            "train_bytes": len(train_bytes),
            "val_bytes": len(val_bytes),
        },
        "split": {
            "schema": RECORD_MANIFEST_SCHEMA,
            "record_schema": "shogi-sibling-v1",
            "schema_version": 1,
            "train_game_ids_sha256": train_game_ids_sha256,
            "val_game_ids_sha256": val_game_ids_sha256,
            "stats": {
                "train_records": train_records,
                "train_parents": train_parents,
                "train_games": PARTITION_EXPECTED_SOURCE_TRAINING_GAMES,
                "val_records": val_records,
                "val_parents": val_parents,
                "val_games": 7,
                "game_overlap": 0,
                "position_overlap": 0,
                "child_position_overlap": 0,
            },
        },
    }


def partition_manifest_for(
    teacher_bytes,
    full_train_bytes,
    full_val_bytes,
    model_train_bytes,
    selection_bytes,
    holdout_bytes,
    protected_bytes,
):
    def summary(data):
        rows = [json.loads(line) for line in data.decode().splitlines()]
        games = {row["game_id"] for row in rows}
        semantic_ids = {
            identifier
            for row in rows
            for identifier in (row["position_id"], row["child_position_id"])
        }
        return {
            "records": len(rows),
            "parents": len({row["parent_id"] for row in rows}),
            "games": len(games),
            "game_ids_sha256": digest("\n".join(sorted(games)).encode()),
            "semantic_position_ids_count": len(semantic_ids),
            "semantic_position_ids_sha256": digest(
                "\n".join(sorted(semantic_ids)).encode()
            ),
        }

    train_summary = summary(model_train_bytes)
    selection_summary = summary(selection_bytes)
    holdout_summary = summary(holdout_bytes)
    validation_games = {
        row["game_id"]
        for data in (selection_bytes, holdout_bytes)
        for row in (json.loads(line) for line in data.decode().splitlines())
    }
    validation_game_ids_sha256 = digest(
        "\n".join(sorted(validation_games)).encode()
    )
    return {
        "schema": VALIDATION_PARTITION_MANIFEST_SCHEMA,
        "record_schema": "shogi-sibling-v1",
        "pipeline": {"source_revision": REVISION, "tracked_tree_clean": True},
        "policy": {
            "algorithm": PARTITION_ALGORITHM,
            "domain": PARTITION_DOMAIN,
            "seed": PARTITION_SEED,
            "source_role": "val",
            "expected_source_games": PARTITION_EXPECTED_SOURCE_GAMES,
            "final_holdout_games": PARTITION_FINAL_HOLDOUT_GAMES,
            "rank_order": PARTITION_RANK_ORDER,
            "priority": PARTITION_PRIORITY,
            "drop_unit": PARTITION_DROP_UNIT,
            "conflict_resolution": PARTITION_CONFLICT_RESOLUTION,
            "semantic_position_set": PARTITION_SEMANTIC_POSITION_SET,
            "policy_exposure_policy": PARTITION_POLICY_EXPOSURE_POLICY,
        },
        "source": {
            "teacher_manifest": {
                "schema": TEACHER_MANIFEST_SCHEMA,
                "bytes": len(teacher_bytes),
                "sha256": digest(teacher_bytes),
            },
            "full_training": {
                "bytes": len(full_train_bytes),
                "sha256": digest(full_train_bytes),
                **{
                    field: train_summary[field]
                    for field in ("records", "parents", "games", "game_ids_sha256")
                },
                "records": train_summary["records"],
                "parents": train_summary["parents"],
            },
            "full_validation": {
                "bytes": len(full_val_bytes),
                "sha256": digest(full_val_bytes),
                "records": selection_summary["records"] + holdout_summary["records"],
                "parents": selection_summary["parents"] + holdout_summary["parents"],
                "games": 7,
                "game_ids_sha256": validation_game_ids_sha256,
            },
            "policy_exposure_receipt": dict(
                TEST_POLICY_EXPOSURE_CONTRACT["receipt"]
            ),
            "policy_exposed_parent_ids": dict(
                TEST_POLICY_EXPOSURE_CONTRACT["parent_ids"]
            ),
            "policy_exposed_semantic_position_ids": dict(
                TEST_POLICY_EXPOSURE_CONTRACT["semantic_position_ids"]
            ),
        },
        "outputs": {
            "model_training": {
                "format": PARTITION_OUTPUT_FORMAT,
                "bytes": len(model_train_bytes),
                "sha256": digest(model_train_bytes),
                **train_summary,
            },
            "model_selection": {
                "format": PARTITION_OUTPUT_FORMAT,
                "bytes": len(selection_bytes),
                "sha256": digest(selection_bytes),
                **selection_summary,
            },
            "final_holdout": {
                "format": PARTITION_OUTPUT_FORMAT,
                "bytes": len(holdout_bytes),
                "sha256": digest(holdout_bytes),
                **holdout_summary,
            },
            "protected_position_ids": {
                "format": PROTECTED_POSITION_IDS_FORMAT,
                "bytes": len(protected_bytes),
                "sha256": digest(protected_bytes),
                "count": 1,
            },
        },
        "drops": {
            "training_policy_exposed_records": 0,
            "training_policy_exposed_parents": 0,
            "training_semantic_conflict_records": 0,
            "training_semantic_conflict_parents": 0,
            "selection_policy_exposed_records": 0,
            "selection_policy_exposed_parents": 0,
            "holdout_policy_exposed_records": 0,
            "holdout_policy_exposed_parents": 0,
            "selection_conflict_records": 0,
            "selection_conflict_parents": 0,
            "parent_id_overlap_parents": 0,
            "semantic_position_overlap_parents": 0,
            "policy_exposed_unmatched_parent_ids": 0,
        },
        "isolation": {
            "game_overlap": 0,
            "parent_overlap": 0,
            "position_overlap": 0,
            "child_position_overlap": 0,
            "selection_position_to_holdout_child_overlap": 0,
            "selection_child_to_holdout_position_overlap": 0,
            "semantic_position_union_overlap": 0,
            "training_to_selection_semantic_position_union_overlap": 0,
            "training_to_holdout_semantic_position_union_overlap": 0,
            "training_to_evaluation_semantic_position_union_overlap": 0,
        },
    }


def write_bytes(path, data):
    with open(path, "wb") as target:
        target.write(data)


def write_manifest(path, manifest):
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        json.dump(manifest, target, indent=2, sort_keys=True)
        target.write("\n")


_production_partition_verifier = verify_sibling_validation_partition


def verify_sibling_validation_partition(*args, **kwargs):
    """Exercise partition structure with small fixtures; production pins have Torch E2E coverage."""
    if any(
        kwargs.get(field) is not None
        for field in (
            "training_path",
            "data_path",
            "model_selection_path",
            "final_holdout_path",
        )
    ):
        kwargs.setdefault("policy_exposure_receipt_path", __file__)
        kwargs.setdefault("policy_exposed_parent_ids_path", __file__)
        kwargs.setdefault("policy_exposed_semantic_position_ids_path", __file__)
    with mock.patch.object(
        sibling_manifest_module, "_validate_full_teacher_contract", return_value=None
    ), mock.patch.object(
        sibling_manifest_module,
        "POLICY_EXPOSURE_CONTRACT",
        TEST_POLICY_EXPOSURE_CONTRACT,
    ), mock.patch.object(
        sibling_manifest_module,
        "load_policy_exposure_receipt",
        return_value={},
    ), mock.patch.object(
        sibling_manifest_module,
        "load_policy_exposed_parent_ids",
        return_value=(set(), {}),
    ), mock.patch.object(
        sibling_manifest_module,
        "load_policy_exposed_semantic_position_ids",
        return_value=(set(), {}),
    ):
        return _production_partition_verifier(*args, **kwargs)


class SiblingManifestTest(unittest.TestCase):
    def test_production_policy_receipt_matches_pinned_role_audit(self):
        receipt_path = os.path.join(
            ML_DIR, "protocols", "wcsc36-policy-exposure-receipt.json"
        )
        with mock.patch.object(
            sibling_manifest_module,
            "POLICY_EXPOSURE_CONTRACT",
            PRODUCTION_POLICY_EXPOSURE_CONTRACT,
        ):
            receipt = load_policy_exposure_receipt(
                receipt_path,
                expected=PRODUCTION_POLICY_EXPOSURE_CONTRACT["receipt"],
            )
        self.assertEqual(
            receipt["role_accounting"],
            PRODUCTION_POLICY_EXPOSURE_CONTRACT["role_accounting"],
        )

    def test_accepts_v6_policy_contract_and_binds_requested_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            train_path = os.path.join(tmp, "train.jsonl")
            val_path = os.path.join(tmp, "val.jsonl")
            manifest_path = os.path.join(tmp, "manifest.json")
            train_bytes = b'{"split":"train"}\n'
            val_bytes = b'{"split":"val"}\n'
            write_bytes(train_path, train_bytes)
            write_bytes(val_path, val_bytes)
            write_manifest(manifest_path, manifest_for(train_bytes, val_bytes))

            provenance = verify_sibling_manifest(
                manifest_path,
                train_path=train_path,
                val_path=val_path,
            )
            self.assertEqual(provenance["schema"], TEACHER_MANIFEST_SCHEMA)
            self.assertEqual(provenance["label_policy"], LABEL_POLICY)
            self.assertEqual(provenance["pipeline"]["source_revision"], REVISION)
            self.assertEqual(provenance["verified_splits"], ["train", "val"])
            self.assertEqual(
                provenance["teacher_runtime_snapshot"],
                {
                    **RUNTIME_SNAPSHOT_CONTRACT,
                    "engine_argument_file_count": 1,
                    "eval_tree_present": False,
                },
            )
            self.assertTrue(provenance["pipeline"]["tracked_tree_clean"])
            self.assertEqual(provenance["outputs"]["train_sha256"], digest(train_bytes))
            with open(manifest_path, "rb") as source:
                raw_manifest = source.read()
            self.assertEqual(provenance["bytes"], len(raw_manifest))
            self.assertEqual(provenance["sha256"], digest(raw_manifest))

            # Evaluation is deliberately independent of access to train bytes.
            os.unlink(train_path)
            val_only = verify_sibling_manifest(manifest_path, val_path=val_path)
            self.assertEqual(val_only["sha256"], provenance["sha256"])
            self.assertEqual(val_only["verified_splits"], ["val"])

            with_eval_tree = manifest_for(train_bytes, val_bytes)
            eval_files = [
                {"path": "nn.bin", "bytes": 11, "sha256": "d" * 64}
            ]
            with_eval_tree["teacher"]["eval_sha256"] = eval_tree_digest(eval_files)
            with_eval_tree["teacher"]["eval_files"] = eval_files
            with_eval_tree["teacher"]["runtime_snapshot"][
                "eval_tree_present"
            ] = True
            write_manifest(manifest_path, with_eval_tree)
            eval_tree = verify_sibling_manifest(manifest_path, val_path=val_path)
            self.assertTrue(
                eval_tree["teacher_runtime_snapshot"]["eval_tree_present"]
            )

    def test_rejects_old_policy_or_untrusted_pipeline_and_exact_types(self):
        train_bytes = b"train-a\n"
        val_bytes = b"val-a__\n"
        cases = [
            (
                "teacher schema",
                lambda value: value.__setitem__("schema", "shogi-sibling-teacher-manifest-v1"),
                "schema",
            ),
            (
                "record manifest schema",
                lambda value: value.__setitem__("record_manifest_schema", "shogi-sibling-v1"),
                "record_manifest_schema",
            ),
            (
                "old v3 label policy",
                lambda value: value["search"].__setitem__("label_policy", "joint-multipv-v3"),
                "label_policy",
            ),
            (
                "joint rescore",
                lambda value: value["search"].__setitem__("exact_rescore_mode", "joint-multipv"),
                "exact_rescore_mode",
            ),
            (
                "missing proposal reset",
                lambda value: value["search"].pop("search_state_reset_before_proposal"),
                "search_state_reset_before_proposal",
            ),
            (
                "missing candidate reset",
                lambda value: value["search"].pop("search_state_reset_before_each_candidate"),
                "search_state_reset_before_each_candidate",
            ),
            (
                "proposal TT retained",
                lambda value: value["search"].__setitem__(
                    "tt_reset_before_proposal", False
                ),
                "tt_reset_before_proposal",
            ),
            (
                "candidate TT retained",
                lambda value: value["search"].__setitem__(
                    "tt_reset_before_each_candidate", 1
                ),
                "tt_reset_before_each_candidate",
            ),
            (
                "proposal-order execution",
                lambda value: value["search"].__setitem__(
                    "candidate_execution_order", "proposal-order"
                ),
                "candidate_execution_order",
            ),
            (
                "unstable synthesized rank",
                lambda value: value["search"].__setitem__(
                    "synthesized_rank_order", "cp-descending"
                ),
                "synthesized_rank_order",
            ),
            (
                "uppercase revision",
                lambda value: value["pipeline"].__setitem__("source_revision", REVISION.upper()),
                "lowercase 40-digit",
            ),
            (
                "mutable engine binary",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "engine_binary", False
                ),
                "engine_binary",
            ),
            (
                "empty engine binary",
                lambda value: value["teacher"].__setitem__("engine_bin_bytes", 0),
                "positive integer",
            ),
            (
                "unsnapshotted argument files",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "engine_argument_files", "live-paths"
                ),
                "engine_argument_files",
            ),
            (
                "mutable eval tree",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "eval_tree", "live"
                ),
                "eval_tree",
            ),
            (
                "eval options accepted",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "eval_options_file", "accepted"
                ),
                "eval_options_file",
            ),
            (
                "shared working directory",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "private_working_directory", False
                ),
                "private_working_directory",
            ),
            (
                "boolean argument count",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "engine_argument_file_count", True
                ),
                "non-negative integer",
            ),
            (
                "negative argument count",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "engine_argument_file_count", -1
                ),
                "non-negative integer",
            ),
            (
                "argument count mismatch",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "engine_argument_file_count", 0
                ),
                "does not match",
            ),
            (
                "truthy eval-tree flag",
                lambda value: value["teacher"]["runtime_snapshot"].__setitem__(
                    "eval_tree_present", 1
                ),
                "must be a boolean",
            ),
            (
                "missing eval tree with digest",
                lambda value: value["teacher"].__setitem__(
                    "eval_sha256", "c" * 64
                ),
                "absent eval tree",
            ),
            (
                "present eval tree without digest",
                lambda value: (
                    value["teacher"]["runtime_snapshot"].__setitem__(
                        "eval_tree_present", True
                    ),
                    value["teacher"].__setitem__(
                        "eval_files",
                        [{"path": "nn.bin", "bytes": 11, "sha256": "d" * 64}],
                    ),
                ),
                "must bind the present eval tree",
            ),
            (
                "present empty eval tree",
                lambda value: (
                    value["teacher"]["runtime_snapshot"].__setitem__(
                        "eval_tree_present", True
                    ),
                    value["teacher"].__setitem__(
                        "eval_sha256", eval_tree_digest([])
                    ),
                ),
                "at least one eval file",
            ),
            (
                "eval tree digest mismatch",
                lambda value: (
                    value["teacher"]["runtime_snapshot"].__setitem__(
                        "eval_tree_present", True
                    ),
                    value["teacher"].__setitem__(
                        "eval_files",
                        [{"path": "nn.bin", "bytes": 11, "sha256": "d" * 64}],
                    ),
                    value["teacher"].__setitem__("eval_sha256", "e" * 64),
                ),
                "does not match teacher.eval_files",
            ),
            (
                "short revision",
                lambda value: value["pipeline"].__setitem__("source_revision", REVISION[:-1]),
                "lowercase 40-digit",
            ),
            (
                "dirty pipeline",
                lambda value: value["pipeline"].__setitem__("tracked_tree_clean", False),
                "exactly true",
            ),
            (
                "truthy pipeline flag",
                lambda value: value["pipeline"].__setitem__("tracked_tree_clean", 1),
                "exactly true",
            ),
            (
                "boolean byte count",
                lambda value: value["outputs"].__setitem__("train_bytes", True),
                "non-negative integer",
            ),
            (
                "float byte count",
                lambda value: value["outputs"].__setitem__("val_bytes", float(len(val_bytes))),
                "non-negative integer",
            ),
            (
                "uppercase digest",
                lambda value: value["outputs"].__setitem__(
                    "val_sha256", digest(val_bytes).upper()
                ),
                "lowercase SHA-256",
            ),
        ]

        with tempfile.TemporaryDirectory() as tmp:
            train_path = os.path.join(tmp, "train.jsonl")
            val_path = os.path.join(tmp, "val.jsonl")
            manifest_path = os.path.join(tmp, "manifest.json")
            write_bytes(train_path, train_bytes)
            write_bytes(val_path, val_bytes)
            base = manifest_for(train_bytes, val_bytes)
            for label, mutate, expected in cases:
                with self.subTest(label=label):
                    candidate = copy.deepcopy(base)
                    mutate(candidate)
                    write_manifest(manifest_path, candidate)
                    with self.assertRaisesRegex(SiblingManifestError, expected):
                        verify_sibling_manifest(
                            manifest_path,
                            train_path=train_path,
                            val_path=val_path,
                        )

    def test_rejects_duplicate_keys_nonstandard_numbers_and_missing_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            val_path = os.path.join(tmp, "val.jsonl")
            manifest_path = os.path.join(tmp, "manifest.json")
            write_bytes(val_path, b"val\n")

            write_bytes(manifest_path, b'{"schema":"a","schema":"b"}\n')
            with self.assertRaisesRegex(SiblingManifestError, "duplicate key"):
                verify_sibling_manifest(manifest_path, val_path=val_path)

            write_bytes(manifest_path, b'{"unexpected":NaN}\n')
            with self.assertRaisesRegex(SiblingManifestError, "non-standard JSON number"):
                verify_sibling_manifest(manifest_path, val_path=val_path)

            write_bytes(manifest_path, b'{"unexpected":1e999}\n')
            with self.assertRaisesRegex(SiblingManifestError, "non-finite JSON number"):
                verify_sibling_manifest(manifest_path, val_path=val_path)

            with self.assertRaisesRegex(SiblingManifestError, "does not exist"):
                verify_sibling_manifest(
                    os.path.join(tmp, "missing.json"), val_path=val_path
                )

    def test_rejects_partial_publish_even_when_replacement_has_same_size(self):
        with tempfile.TemporaryDirectory() as tmp:
            train_path = os.path.join(tmp, "train.jsonl")
            val_path = os.path.join(tmp, "val.jsonl")
            manifest_path = os.path.join(tmp, "manifest.json")
            train_a = b"train-a\n"
            val_a = b"value-a\n"
            val_b = b"value-b\n"
            self.assertEqual(len(val_a), len(val_b))
            write_bytes(train_path, train_a)
            write_bytes(val_path, val_a)
            write_manifest(manifest_path, manifest_for(train_a, val_a))

            # Simulate manifest-last publication interrupted after only val was
            # replaced by another otherwise complete generation.
            write_bytes(val_path, val_b)
            with self.assertRaisesRegex(
                SiblingManifestError, r"outputs\.val_sha256"
            ):
                verify_sibling_manifest(
                    manifest_path,
                    train_path=train_path,
                    val_path=val_path,
                )

    def test_accepts_sealed_validation_partition_and_binds_each_role(self):
        with tempfile.TemporaryDirectory() as tmp:
            teacher_path = os.path.join(tmp, "teacher-manifest.json")
            partition_path = os.path.join(tmp, "partition-manifest.json")
            full_train_path = os.path.join(tmp, "full-train.jsonl")
            model_train_path = os.path.join(tmp, "model-train.jsonl")
            full_val_path = os.path.join(tmp, "full-val.jsonl")
            selection_path = os.path.join(tmp, "selection.jsonl")
            holdout_path = os.path.join(tmp, "holdout.jsonl")
            protected_path = os.path.join(tmp, "protected.txt")
            train_rows = [
                partition_row(f"train-game-{index}", index + 1, index * 2 + child, "train")
                for index in range(21)
                for child in range(2)
            ]
            selection_rows = [
                partition_row(f"val-game-{index}", 100 + index, 100 + index, "val")
                for index in range(4)
            ]
            holdout_rows = [
                partition_row(f"val-game-{index + 4}", 200 + index, 200 + index, "val")
                for index in range(3)
            ]
            train_bytes = rows_bytes(train_rows)
            selection_bytes = rows_bytes(selection_rows)
            holdout_bytes = rows_bytes(holdout_rows)
            full_val_bytes = selection_bytes + holdout_bytes
            protected_bytes = ("sha256:" + "a" * 64 + "\n").encode()
            write_bytes(full_train_path, train_bytes)
            write_bytes(model_train_path, train_bytes)
            write_bytes(full_val_path, full_val_bytes)
            write_bytes(selection_path, selection_bytes)
            write_bytes(holdout_path, holdout_bytes)
            write_bytes(protected_path, protected_bytes)
            train_game_digest = digest(
                "\n".join(sorted({row["game_id"] for row in train_rows})).encode()
            )
            val_game_digest = digest(
                "\n".join(
                    sorted({row["game_id"] for row in selection_rows + holdout_rows})
                ).encode()
            )
            write_manifest(
                teacher_path,
                manifest_for(
                    train_bytes,
                    full_val_bytes,
                    train_records=len(train_rows),
                    train_parents=len({row["parent_id"] for row in train_rows}),
                    val_records=len(selection_rows) + len(holdout_rows),
                    val_parents=len(selection_rows) + len(holdout_rows),
                    train_game_ids_sha256=train_game_digest,
                    val_game_ids_sha256=val_game_digest,
                ),
            )
            with open(teacher_path, "rb") as source:
                teacher_bytes = source.read()
            write_manifest(
                partition_path,
                partition_manifest_for(
                    teacher_bytes,
                    train_bytes,
                    full_val_bytes,
                    train_bytes,
                    selection_bytes,
                    holdout_bytes,
                    protected_bytes,
                ),
            )

            selection = verify_sibling_validation_partition(
                partition_path,
                sibling_manifest_path=teacher_path,
                data_role="selection",
                data_path=selection_path,
                protected_position_ids_path=protected_path,
                training_path=model_train_path,
            )
            self.assertEqual(selection["schema"], VALIDATION_PARTITION_MANIFEST_SCHEMA)
            self.assertEqual(
                selection["verified_outputs"],
                ["model_training", "model_selection", "protected_position_ids"],
            )
            self.assertEqual(
                selection["teacher_manifest"]["verified_splits"], []
            )
            self.assertEqual(
                selection["outputs"]["final_holdout"]["sha256"],
                digest(holdout_bytes),
            )

            final_holdout = verify_sibling_validation_partition(
                partition_path,
                sibling_manifest_path=teacher_path,
                data_role="final-holdout",
                data_path=holdout_path,
            )
            self.assertEqual(final_holdout["verified_outputs"], ["final_holdout"])
            protected, fingerprint = load_protected_position_ids(
                protected_path,
                expected=selection["outputs"]["protected_position_ids"],
            )
            self.assertEqual(protected, {"sha256:" + "a" * 64})
            self.assertEqual(fingerprint["count"], 1)

    def test_partition_rejects_tampering_wrong_base_and_nonzero_isolation(self):
        with tempfile.TemporaryDirectory() as tmp:
            teacher_path = os.path.join(tmp, "teacher-manifest.json")
            other_teacher_path = os.path.join(tmp, "other-teacher.json")
            partition_path = os.path.join(tmp, "partition-manifest.json")
            model_train_path = os.path.join(tmp, "model-train.jsonl")
            selection_path = os.path.join(tmp, "selection.jsonl")
            holdout_path = os.path.join(tmp, "holdout.jsonl")
            protected_path = os.path.join(tmp, "protected.txt")
            train_rows = [
                partition_row(f"train-game-{index}", index + 1, index * 2 + child, "train")
                for index in range(21)
                for child in range(2)
            ]
            selection_rows = [
                partition_row(f"val-game-{index}", 100 + index, 100 + index, "val")
                for index in range(4)
            ]
            holdout_rows = [
                partition_row(f"val-game-{index + 4}", 200 + index, 200 + index, "val")
                for index in range(3)
            ]
            train_bytes = rows_bytes(train_rows)
            selection_bytes = rows_bytes(selection_rows)
            holdout_bytes = rows_bytes(holdout_rows)
            full_val_bytes = selection_bytes + holdout_bytes
            protected_bytes = ("sha256:" + "a" * 64 + "\n").encode()
            write_bytes(model_train_path, train_bytes)
            write_bytes(selection_path, selection_bytes)
            write_bytes(holdout_path, holdout_bytes)
            write_bytes(protected_path, protected_bytes)
            train_game_digest = digest(
                "\n".join(sorted({row["game_id"] for row in train_rows})).encode()
            )
            val_game_digest = digest(
                "\n".join(
                    sorted({row["game_id"] for row in selection_rows + holdout_rows})
                ).encode()
            )
            teacher_manifest = manifest_for(
                train_bytes,
                full_val_bytes,
                train_records=len(train_rows),
                train_parents=len({row["parent_id"] for row in train_rows}),
                val_records=len(selection_rows) + len(holdout_rows),
                val_parents=len(selection_rows) + len(holdout_rows),
                train_game_ids_sha256=train_game_digest,
                val_game_ids_sha256=val_game_digest,
            )
            write_manifest(teacher_path, teacher_manifest)
            other_teacher = copy.deepcopy(teacher_manifest)
            other_teacher["outputs"]["train_sha256"] = digest(b"other\n")
            other_teacher["outputs"]["train_bytes"] = len(b"other\n")
            write_manifest(other_teacher_path, other_teacher)
            with open(teacher_path, "rb") as source:
                teacher_bytes = source.read()
            base_partition = partition_manifest_for(
                teacher_bytes,
                train_bytes,
                full_val_bytes,
                train_bytes,
                selection_bytes,
                holdout_bytes,
                protected_bytes,
            )
            write_manifest(partition_path, base_partition)

            for field in (
                "training_policy_exposed_records",
                "training_policy_exposed_parents",
                "selection_policy_exposed_records",
                "selection_policy_exposed_parents",
                "holdout_policy_exposed_records",
                "holdout_policy_exposed_parents",
                "policy_exposed_unmatched_parent_ids",
            ):
                with self.subTest(pilot_audit_field=field):
                    mismatched = copy.deepcopy(base_partition)
                    mismatched["drops"][field] += 1
                    write_manifest(partition_path, mismatched)
                    with self.assertRaisesRegex(
                        SiblingManifestError, "accounting|policy exposure audit"
                    ):
                        verify_sibling_validation_partition(
                            partition_path,
                            sibling_manifest_path=teacher_path,
                        )
            write_manifest(partition_path, base_partition)

            tampered_train = train_bytes.replace(b"train-game-0", b"train-game-X", 1)
            write_bytes(model_train_path, tampered_train)
            with self.assertRaisesRegex(SiblingManifestError, "model_training sha256"):
                verify_sibling_validation_partition(
                    partition_path,
                    sibling_manifest_path=teacher_path,
                    training_path=model_train_path,
                )
            write_bytes(model_train_path, train_bytes)

            tampered_selection = selection_bytes.replace(b"val-game-0", b"val-game-X", 1)
            write_bytes(selection_path, tampered_selection)
            self.assertEqual(os.path.getsize(selection_path), len(selection_bytes))
            with self.assertRaisesRegex(SiblingManifestError, "model_selection sha256"):
                verify_sibling_validation_partition(
                    partition_path,
                    sibling_manifest_path=teacher_path,
                    data_role="selection",
                    data_path=selection_path,
                )
            write_bytes(selection_path, selection_bytes)

            with self.assertRaisesRegex(SiblingManifestError, "teacher manifest identity"):
                verify_sibling_validation_partition(
                    partition_path,
                    sibling_manifest_path=other_teacher_path,
                    data_role="selection",
                    data_path=selection_path,
                )

            dirty = copy.deepcopy(base_partition)
            dirty["isolation"][
                "training_to_evaluation_semantic_position_union_overlap"
            ] = 1
            write_manifest(partition_path, dirty)
            with self.assertRaisesRegex(SiblingManifestError, "isolation"):
                verify_sibling_validation_partition(
                    partition_path,
                    sibling_manifest_path=teacher_path,
                    data_role="final-holdout",
                    data_path=holdout_path,
                )

            unbalanced_training = copy.deepcopy(base_partition)
            unbalanced_training["drops"]["training_semantic_conflict_records"] = 1
            write_manifest(partition_path, unbalanced_training)
            with self.assertRaisesRegex(
                SiblingManifestError, "training record accounting"
            ):
                verify_sibling_validation_partition(
                    partition_path,
                    sibling_manifest_path=teacher_path,
                )

            missing_training_game = copy.deepcopy(base_partition)
            missing_training_game["outputs"]["model_training"]["games"] = 20
            write_manifest(partition_path, missing_training_game)
            with self.assertRaisesRegex(SiblingManifestError, "game count"):
                verify_sibling_validation_partition(
                    partition_path,
                    sibling_manifest_path=teacher_path,
                )

            wrong_seed = copy.deepcopy(base_partition)
            wrong_seed["policy"]["seed"] = "unreviewed-experiment"
            write_manifest(partition_path, wrong_seed)
            with self.assertRaisesRegex(SiblingManifestError, r"policy\.seed"):
                verify_sibling_validation_partition(
                    partition_path,
                    sibling_manifest_path=teacher_path,
                )

            missing_selection_game = copy.deepcopy(base_partition)
            missing_selection_game["outputs"]["model_selection"]["games"] = 3
            write_manifest(partition_path, missing_selection_game)
            with self.assertRaisesRegex(SiblingManifestError, "game count"):
                verify_sibling_validation_partition(
                    partition_path,
                    sibling_manifest_path=teacher_path,
                )

            wrong_quota = copy.deepcopy(base_partition)
            wrong_quota["policy"]["final_holdout_games"] = 2
            wrong_quota["outputs"]["model_selection"]["games"] = 5
            wrong_quota["outputs"]["final_holdout"]["games"] = 2
            write_manifest(partition_path, wrong_quota)
            with self.assertRaisesRegex(
                SiblingManifestError, r"policy\.final_holdout_games"
            ):
                verify_sibling_validation_partition(
                    partition_path,
                    sibling_manifest_path=teacher_path,
                )

    def test_protected_position_ids_reject_unsorted_duplicates_and_manifest_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            protected_path = os.path.join(tmp, "protected.txt")
            first = "sha256:" + "a" * 64
            second = "sha256:" + "b" * 64
            write_bytes(protected_path, f"{second}\n{first}\n".encode())
            with self.assertRaisesRegex(SiblingManifestError, "sorted and unique"):
                load_protected_position_ids(protected_path)
            write_bytes(protected_path, f"{first}\n{first}\n".encode())
            with self.assertRaisesRegex(SiblingManifestError, "sorted and unique"):
                load_protected_position_ids(protected_path)
            write_bytes(protected_path, f"{first}\n".encode())
            with self.assertRaisesRegex(SiblingManifestError, "sha256"):
                load_protected_position_ids(
                    protected_path,
                    expected={
                        "format": PROTECTED_POSITION_IDS_FORMAT,
                        "bytes": os.path.getsize(protected_path),
                        "sha256": "f" * 64,
                        "count": 1,
                    },
                )


if __name__ == "__main__":
    unittest.main()
