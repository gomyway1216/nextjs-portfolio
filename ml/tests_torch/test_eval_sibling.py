import copy
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from checkpoint_compat import expected_arch, sha256_file  # noqa: E402
from sibling_manifest import (  # noqa: E402
    CANDIDATE_EXECUTION_ORDER,
    EXACT_RESCORE_MODE,
    FULL_TEACHER_CONTRACT,
    LABEL_POLICY,
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
    RECORD_MANIFEST_SCHEMA,
    RUNTIME_SNAPSHOT_CONTRACT,
    SEARCH_STATE_RESET,
    SYNTHESIZED_RANK_ORDER,
    TEACHER_MANIFEST_SCHEMA,
    VALIDATION_PARTITION_MANIFEST_SCHEMA,
)
import sibling_manifest as sibling_manifest_module  # noqa: E402
from train import DistillNet, main as train_main, position_id_from_sfen  # noqa: E402


SPEC = importlib.util.spec_from_file_location(
    "eval_sibling", os.path.join(ML_DIR, "eval-sibling.py")
)
assert SPEC is not None and SPEC.loader is not None
EVAL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EVAL)


EMPTY_PARENT = "9/9/9/9/9/9/9/9/9 w 3P 1"
EMPTY_WITH_TWO_PAWNS = "9/9/9/9/9/9/9/9/9 b 2P 2"
EMPTY_WITH_ONE_PAWN = "9/9/9/9/9/9/9/9/9 b P 2"
PIPELINE_REVISION = "0123456789abcdef0123456789abcdef01234567"


def write_siblings(
    path,
    *,
    sign_mismatch=False,
    game_id="game-val",
    parent_id="parent-val",
    split="val",
    parent_sfen=EMPTY_PARENT,
    first_child_sfen=EMPTY_WITH_TWO_PAWNS,
    second_child_sfen=EMPTY_WITH_ONE_PAWN,
):
    rows = [
        {
            "schema": "shogi-sibling-v1",
            "schema_version": 1,
            "game_id": game_id,
            "parent_id": parent_id,
            "position_id": position_id_from_sfen(parent_sfen),
            "parent_sfen": parent_sfen,
            "parent_ply": 0,
            "ply": 1,
            "move": "7g7f",
            "sources": ["played", "teacher"],
            "sfen": first_child_sfen,
            "child_sfen": first_child_sfen,
            "child_position_id": position_id_from_sfen(first_child_sfen),
            "cp": 100,
            "teacher_child_cp": 100,
            "teacher_parent_cp": 100 if sign_mismatch else -100,
            "teacher_rank": 2,
            "teacher_score_kind": "cp",
            "split": split,
        },
        {
            "schema": "shogi-sibling-v1",
            "schema_version": 1,
            "game_id": game_id,
            "parent_id": parent_id,
            "position_id": position_id_from_sfen(parent_sfen),
            "parent_sfen": parent_sfen,
            "parent_ply": 0,
            "ply": 1,
            "move": "2g2f",
            "sources": ["teacher"],
            "sfen": second_child_sfen,
            "child_sfen": second_child_sfen,
            "child_position_id": position_id_from_sfen(second_child_sfen),
            "cp": -100,
            "teacher_child_cp": -100,
            "teacher_parent_cp": 100,
            "teacher_rank": 1,
            "teacher_score_kind": "cp",
            "split": split,
        },
    ]
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        for row in rows:
            target.write(json.dumps(row, sort_keys=True) + "\n")


def write_sibling_manifest(path, val_path, train_path=None):
    train_path = val_path if train_path is None else train_path
    manifest = {
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
            "source_revision": PIPELINE_REVISION,
            "tracked_tree_clean": True,
        },
        "teacher": {
            "engine_bin_sha256": "a" * 64,
            "engine_bin_bytes": 1,
            "engine_args": [],
            "engine_arg_files": [],
            "eval_sha256": None,
            "eval_files": [],
            "runtime_snapshot": {
                **RUNTIME_SNAPSHOT_CONTRACT,
                "engine_argument_file_count": 0,
                "eval_tree_present": False,
            },
        },
        "outputs": {
            "train_sha256": sha256_file(train_path),
            "val_sha256": sha256_file(val_path),
            "train_bytes": os.path.getsize(train_path),
            "val_bytes": os.path.getsize(val_path),
        },
    }
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        json.dump(manifest, target, indent=2, sort_keys=True)
        target.write("\n")


def attach_sibling_training_provenance(
    checkpoint_path,
    manifest_path,
    train_path,
    val_path,
):
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    manifest_provenance = EVAL.verify_sibling_manifest(
        manifest_path,
        train_path=train_path,
        val_path=val_path,
    )

    def source_provenance(path):
        with open(path, encoding="utf-8") as source:
            usable_rows = sum(1 for line in source if line.strip())
        return {
            "path": os.path.abspath(path),
            "sha256": sha256_file(path),
            "bytes": os.path.getsize(path),
            "usable_rows": usable_rows,
            "selection": "all",
            "requested_limit": 0,
        }

    checkpoint["args"] = {"loss": "sibling-ranking"}
    checkpoint["data_provenance"] = {
        "sibling_manifest": manifest_provenance,
        "train": source_provenance(train_path),
        "validation": source_provenance(val_path),
        "replay": None,
    }
    torch.save(checkpoint, checkpoint_path)


def write_hand_model(path, slope, bias=0.0, *, make_nonfinite=False):
    model = DistillNet("board")
    with torch.no_grad():
        for parameter in model.parameters():
            parameter.zero_()
        # Child CP increases with the child's pawn-in-hand count.  Because move
        # selection is from the parent, the candidate with the *lower* child
        # output must win.  A sub-quantum slope lets the int16 path tie while
        # the float path still resolves that order.
        model.hand.weight[0, 0] = slope
        model.hand.bias[0] = bias
        model.l2.weight[0, 0] = 1.0
        model.l3.weight[0, 0] = 1.0
        if make_nonfinite:
            model.l3.bias[0] = float("nan")
    arch = expected_arch(
        features="board",
        input_dim=model.board_feats + model.hand_feats,
        h1=DistillNet.H1,
        h2=DistillNet.H2,
        k=600.0,
        kp_buckets=1,
    )
    torch.save({"model": model.state_dict(), "epoch": 3, "arch": arch}, path)


def read_bytes(path):
    with open(path, "rb") as source:
        return source.read()


def read_text(path):
    with open(path, encoding="utf-8") as source:
        return source.read()


def identifier_digest(values):
    return hashlib.sha256("\n".join(sorted(values)).encode()).hexdigest()


def semantic_ids(rows):
    return {
        identifier
        for row in rows
        for identifier in (row["position_id"], row["child_position_id"])
    }


def write_json(path, value):
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        json.dump(value, target, indent=2, sort_keys=True)
        target.write("\n")


def synthetic_id(label):
    return "sha256:" + hashlib.sha256(label.encode()).hexdigest()


def synthetic_group(game_id, parent_id, split, ordinal, candidates=2):
    parent_hand = ordinal * 20 + 2
    parent_sfen = f"9/9/9/9/9/9/9/9/9 w {parent_hand}P 1"
    rows = []
    for index in range(candidates):
        child_sfen = f"9/9/9/9/9/9/9/9/9 b {parent_hand + index + 1}P 2"
        parent_cp = 1000 - index * 200
        rows.append(
            {
                "schema": "shogi-sibling-v1",
                "schema_version": 1,
                "game_id": game_id,
                "parent_id": parent_id,
                "position_id": position_id_from_sfen(parent_sfen),
                "parent_sfen": parent_sfen,
                "parent_ply": 0,
                "ply": 1,
                "move": f"synthetic-{index:02d}",
                "sources": ["played", "teacher"] if index == 0 else ["teacher"],
                "sfen": child_sfen,
                "child_sfen": child_sfen,
                "child_position_id": position_id_from_sfen(child_sfen),
                "cp": -parent_cp,
                "teacher_child_cp": -parent_cp,
                "teacher_parent_cp": parent_cp,
                "teacher_rank": index + 1,
                "teacher_score_kind": "cp",
                "split": split,
            }
        )
    return rows


def jsonl_bytes(rows):
    return b"".join(
        (json.dumps(row, sort_keys=True) + "\n").encode("utf-8") for row in rows
    )


def write_sealed_fixture(tmp):
    source_train_path = os.path.join(tmp, "full-train.jsonl")
    model_train_path = os.path.join(tmp, "model-train.jsonl")
    full_val_path = os.path.join(tmp, "full-val.jsonl")
    selection_path = os.path.join(tmp, "selection.jsonl")
    holdout_path = os.path.join(tmp, "holdout.jsonl")
    teacher_path = os.path.join(tmp, "teacher-manifest.json")
    partition_path = os.path.join(tmp, "partition-manifest.json")
    plan_path = os.path.join(tmp, "six-run-plan.json")
    protected_path = os.path.join(tmp, "holdout-protected-position-ids.txt")
    replay_path = os.path.join(tmp, "replay.jsonl")
    write_json(plan_path, {"test_fixture": True})
    policy_receipt_path = os.path.join(tmp, "policy-exposure-receipt.json")
    policy_parent_path = os.path.join(tmp, "policy-exposed-parent-ids.txt")
    policy_semantic_path = os.path.join(
        tmp, "policy-exposed-semantic-position-ids.txt"
    )
    policy_parent_bytes = read_bytes(
        os.path.join(ML_DIR, "protocols", "wcsc36-policy-exposed-parent-ids.txt")
    )
    policy_semantic_bytes = read_bytes(
        os.path.join(
            ML_DIR,
            "protocols",
            "wcsc36-policy-exposed-semantic-position-ids.txt",
        )
    )
    with open(policy_parent_path, "wb") as target:
        target.write(policy_parent_bytes)
    with open(policy_semantic_path, "wb") as target:
        target.write(policy_semantic_bytes)
    policy_parent_ids = policy_parent_bytes[:-1].decode().split("\n")
    with open(replay_path, "w", encoding="utf-8", newline="\n") as target:
        target.write(json.dumps({"sfen": EMPTY_PARENT, "cp": 0}, sort_keys=True) + "\n")
        target.write(json.dumps({"sfen": EMPTY_PARENT, "cp": 100}, sort_keys=True) + "\n")

    ordinal = 1
    model_train_rows = []
    for index in range(PARTITION_EXPECTED_SOURCE_TRAINING_GAMES):
        model_train_rows += synthetic_group(
            f"game-train-{index}", synthetic_id(f"model-train-{index}"), "train", ordinal
        )
        ordinal += 1
    training_pilot_rows = []
    for index, parent_id in enumerate(policy_parent_ids[:70]):
        training_pilot_rows += synthetic_group(
            f"game-train-{index % 21}",
            parent_id,
            "train",
            ordinal,
            candidates=12 if index < 60 else 11,
        )
        ordinal += 1
    model_train_bytes = jsonl_bytes(model_train_rows)
    full_train_rows = model_train_rows + training_pilot_rows
    full_train_bytes = jsonl_bytes(full_train_rows)

    selection_rows = []
    for index in range(4):
        selection_rows += synthetic_group(
            f"game-val-{index}", synthetic_id(f"selection-{index}"), "val", ordinal
        )
        ordinal += 1
    selection_pilot_rows = []
    for index, parent_id in enumerate(policy_parent_ids[70:85]):
        selection_pilot_rows += synthetic_group(
            f"game-val-{index % 4}", parent_id, "val", ordinal, candidates=12
        )
        ordinal += 1
    holdout_rows = []
    for index in range(3):
        holdout_rows += synthetic_group(
            f"game-val-{index + 4}", synthetic_id(f"holdout-{index}"), "val", ordinal
        )
        ordinal += 1
    holdout_pilot_rows = []
    for index, parent_id in enumerate(policy_parent_ids[85:100]):
        holdout_pilot_rows += synthetic_group(
            f"game-val-{index % 3 + 4}", parent_id, "val", ordinal, candidates=12
        )
        ordinal += 1
    selection_bytes = jsonl_bytes(selection_rows)
    holdout_bytes = jsonl_bytes(holdout_rows)
    full_val_rows = selection_rows + selection_pilot_rows + holdout_rows + holdout_pilot_rows
    full_val_bytes = jsonl_bytes(full_val_rows)
    for path, contents in (
        (source_train_path, full_train_bytes),
        (model_train_path, model_train_bytes),
        (full_val_path, full_val_bytes),
        (selection_path, selection_bytes),
        (holdout_path, holdout_bytes),
    ):
        with open(path, "wb") as target:
            target.write(contents)

    all_game_ids = {f"game-val-{index}" for index in range(7)}
    training_game_ids = {
        f"game-train-{index}"
        for index in range(PARTITION_EXPECTED_SOURCE_TRAINING_GAMES)
    }
    test_full_teacher_contract = {
        **FULL_TEACHER_CONTRACT,
        "selected_parent_ids_sha256": "b" * 64,
        "train_game_ids_sha256": identifier_digest(training_game_ids),
        "val_game_ids_sha256": identifier_digest(all_game_ids),
    }
    sibling_manifest_module.FULL_TEACHER_CONTRACT = test_full_teacher_contract
    receipt_path = os.path.join(
        ML_DIR, "engine-receipts", "yaneuraou-9133c527-applem1.json"
    )
    receipt_bytes = read_bytes(receipt_path)
    receipt_content = json.loads(receipt_bytes)
    eval_files = [
        {
            "path": "nn.bin",
            "bytes": 64_217_066,
            "sha256": "1141d275bceec911156801f27303dc9ff5beb24f4f59144cc069306c59e80782",
        }
    ]
    candidate_records = len(full_train_rows) + len(full_val_rows)
    candidate_parents = len(model_train_rows) // 2 + 70 + 4 + 15 + 3 + 15
    teacher_manifest = {
        "schema": TEACHER_MANIFEST_SCHEMA,
        "record_manifest_schema": RECORD_MANIFEST_SCHEMA,
        "pipeline": {
            "source_revision": test_full_teacher_contract["pipeline_revision"],
            "tracked_tree_clean": True,
        },
        "source": {
            "raw_sha256": test_full_teacher_contract["raw_sha256"],
            "raw_records": 3_112,
            "selected_parents": 3_112,
            "selected_parent_ids_sha256": test_full_teacher_contract[
                "selected_parent_ids_sha256"
            ],
        },
        "teacher": {
            "engine_bin_sha256": test_full_teacher_contract["engine_bin_sha256"],
            "engine_bin_bytes": receipt_content["binary_bytes"],
            "engine_args": [],
            "engine_arg_files": [],
            "engine_receipt": {
                "file": {
                    "path": os.path.basename(receipt_path),
                    "bytes": len(receipt_bytes),
                    "sha256": hashlib.sha256(receipt_bytes).hexdigest(),
                },
                "content": receipt_content,
            },
            "eval_sha256": test_full_teacher_contract["eval_sha256"],
            "eval_files": eval_files,
            "runtime_snapshot": {
                **RUNTIME_SNAPSHOT_CONTRACT,
                "engine_argument_file_count": 0,
                "eval_tree_present": True,
            },
        },
        "search": {
            "multipv": 12,
            "limit": {"depth": test_full_teacher_contract["depth"]},
            "parallel_engines": 12,
            "fv_scale": 20,
            "hash_mb_per_engine": 64,
            "timeout_ms": 600_000,
            "label_policy": LABEL_POLICY,
            "exact_rescore_mode": EXACT_RESCORE_MODE,
            "search_state_reset_before_proposal": SEARCH_STATE_RESET,
            "search_state_reset_before_each_candidate": SEARCH_STATE_RESET,
            "tt_reset_before_proposal": True,
            "tt_reset_before_each_candidate": True,
            "candidate_execution_order": CANDIDATE_EXECUTION_ORDER,
            "synthesized_rank_order": SYNTHESIZED_RANK_ORDER,
            "engine_options": {
                "threads": 1,
                "usi_own_book": False,
                "book_file": "no_book",
                "network_delay_ms": 0,
                "network_delay2_ms": 0,
                "search_state_reset_trigger": "isready",
            },
        },
        "candidate_sets": {
            "sha256": "c" * 64,
            "parents": candidate_parents,
            "candidates": candidate_records,
            "min_candidates": 2,
            "max_candidates": 12,
            "skipped_parents": 3_112 - candidate_parents,
        },
        "progress_checkpoint": {
            "schema": "shogi-sibling-teacher-work-v2",
            "run_fingerprint": "d" * 64,
            "entries": 3_112,
            "completed_parents": candidate_parents,
            "skipped_parents": 3_112 - candidate_parents,
            "sha256": "e" * 64,
        },
        "split": {
            "schema": RECORD_MANIFEST_SCHEMA,
            "record_schema": "shogi-sibling-v1",
            "schema_version": 1,
            "split_seed": "42",
            "val_ratio": 0.2,
            "train_game_ids_sha256": test_full_teacher_contract[
                "train_game_ids_sha256"
            ],
            "val_game_ids_sha256": test_full_teacher_contract[
                "val_game_ids_sha256"
            ],
            "stats": {
                "input_records": candidate_records,
                "output_records": candidate_records,
                "input_parents": candidate_parents,
                "output_parents": candidate_parents,
                "input_games": 28,
                "train_records": len(full_train_rows),
                "val_records": len(full_val_rows),
                "train_parents": 91,
                "val_parents": 37,
                "train_games": 21,
                "val_games": 7,
                "val_position_priority_dropped_records": 0,
                "val_position_priority_dropped_parents": 0,
                "val_child_position_priority_dropped_records": 0,
                "val_child_position_priority_dropped_parents": 0,
                "game_overlap": 0,
                "position_overlap": 0,
                "child_position_overlap": 0,
            },
        },
        "outputs": {
            "train_sha256": hashlib.sha256(full_train_bytes).hexdigest(),
            "val_sha256": hashlib.sha256(full_val_bytes).hexdigest(),
            "train_bytes": len(full_train_bytes),
            "val_bytes": len(full_val_bytes),
        },
    }
    write_json(teacher_path, teacher_manifest)
    teacher_bytes = read_bytes(teacher_path)

    protected_values = set()
    with open(holdout_path, encoding="utf-8") as source:
        for line in source:
            row = json.loads(line)
            protected_values.update((row["position_id"], row["child_position_id"]))
    protected_bytes = ("\n".join(sorted(protected_values)) + "\n").encode()
    with open(protected_path, "wb") as target:
        target.write(protected_bytes)

    policy_receipt = json.loads(
        read_bytes(
            os.path.join(
                ML_DIR, "protocols", "wcsc36-policy-exposure-receipt.json"
            )
        )
    )
    policy_receipt["role_accounting"] = {
        "training_parents": 70,
        "training_records": len(training_pilot_rows),
        "selection_parents": 15,
        "selection_records": len(selection_pilot_rows),
        "holdout_parents": 15,
        "holdout_records": len(holdout_pilot_rows),
        "unmatched_parent_ids": 2,
    }
    policy_receipt_bytes = (
        json.dumps(policy_receipt, indent=2, sort_keys=True) + "\n"
    ).encode()
    with open(policy_receipt_path, "wb") as target:
        target.write(policy_receipt_bytes)
    test_policy_contract = {
        "receipt": {
            "schema": POLICY_EXPOSURE_RECEIPT_SCHEMA,
            "bytes": len(policy_receipt_bytes),
            "sha256": hashlib.sha256(policy_receipt_bytes).hexdigest(),
        },
        "parent_ids": {
            "format": POLICY_EXPOSED_PARENT_IDS_FORMAT,
            "bytes": len(policy_parent_bytes),
            "sha256": hashlib.sha256(policy_parent_bytes).hexdigest(),
            "count": len(policy_parent_ids),
            "identifiers_sha256": identifier_digest(set(policy_parent_ids)),
        },
        "semantic_position_ids": {
            "format": POLICY_EXPOSED_SEMANTIC_POSITION_IDS_FORMAT,
            "bytes": len(policy_semantic_bytes),
            "sha256": hashlib.sha256(policy_semantic_bytes).hexdigest(),
            "count": len(policy_semantic_bytes[:-1].decode().split("\n")),
            "identifiers_sha256": identifier_digest(
                set(policy_semantic_bytes[:-1].decode().split("\n"))
            ),
        },
        "role_accounting": dict(policy_receipt["role_accounting"]),
    }
    sibling_manifest_module.POLICY_EXPOSURE_CONTRACT = test_policy_contract

    selection_game_ids = {f"game-val-{index}" for index in range(4)}
    holdout_game_ids = {f"game-val-{index}" for index in range(4, 7)}
    partition_manifest = {
        "schema": VALIDATION_PARTITION_MANIFEST_SCHEMA,
        "record_schema": "shogi-sibling-v1",
        "pipeline": {
            "source_revision": PIPELINE_REVISION,
            "tracked_tree_clean": True,
        },
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
                "sha256": hashlib.sha256(teacher_bytes).hexdigest(),
            },
            "full_training": {
                "bytes": len(full_train_bytes),
                "sha256": hashlib.sha256(full_train_bytes).hexdigest(),
                "records": len(full_train_rows),
                "parents": 91,
                "games": PARTITION_EXPECTED_SOURCE_TRAINING_GAMES,
                "game_ids_sha256": identifier_digest(training_game_ids),
            },
            "full_validation": {
                "bytes": len(full_val_bytes),
                "sha256": hashlib.sha256(full_val_bytes).hexdigest(),
                "records": len(full_val_rows),
                "parents": 37,
                "games": 7,
                "game_ids_sha256": identifier_digest(all_game_ids),
            },
            "policy_exposure_receipt": dict(test_policy_contract["receipt"]),
            "policy_exposed_parent_ids": dict(test_policy_contract["parent_ids"]),
            "policy_exposed_semantic_position_ids": dict(
                test_policy_contract["semantic_position_ids"]
            ),
        },
        "outputs": {
            "model_training": {
                "format": PARTITION_OUTPUT_FORMAT,
                "bytes": len(model_train_bytes),
                "sha256": hashlib.sha256(model_train_bytes).hexdigest(),
                "records": len(model_train_rows),
                "parents": PARTITION_EXPECTED_SOURCE_TRAINING_GAMES,
                "games": PARTITION_EXPECTED_SOURCE_TRAINING_GAMES,
                "game_ids_sha256": identifier_digest(training_game_ids),
                "semantic_position_ids_count": len(semantic_ids(model_train_rows)),
                "semantic_position_ids_sha256": identifier_digest(
                    semantic_ids(model_train_rows)
                ),
            },
            "model_selection": {
                "format": PARTITION_OUTPUT_FORMAT,
                "bytes": len(selection_bytes),
                "sha256": hashlib.sha256(selection_bytes).hexdigest(),
                "records": 8,
                "parents": 4,
                "games": 4,
                "game_ids_sha256": identifier_digest(selection_game_ids),
                "semantic_position_ids_count": len(semantic_ids(selection_rows)),
                "semantic_position_ids_sha256": identifier_digest(
                    semantic_ids(selection_rows)
                ),
            },
            "final_holdout": {
                "format": PARTITION_OUTPUT_FORMAT,
                "bytes": len(holdout_bytes),
                "sha256": hashlib.sha256(holdout_bytes).hexdigest(),
                "records": 6,
                "parents": 3,
                "games": 3,
                "game_ids_sha256": identifier_digest(holdout_game_ids),
                "semantic_position_ids_count": len(semantic_ids(holdout_rows)),
                "semantic_position_ids_sha256": identifier_digest(
                    semantic_ids(holdout_rows)
                ),
            },
            "protected_position_ids": {
                "format": PROTECTED_POSITION_IDS_FORMAT,
                "bytes": len(protected_bytes),
                "sha256": hashlib.sha256(protected_bytes).hexdigest(),
                "count": len(protected_values),
            },
        },
        "drops": {
            "training_policy_exposed_records": len(training_pilot_rows),
            "training_policy_exposed_parents": 70,
            "training_semantic_conflict_records": 0,
            "training_semantic_conflict_parents": 0,
            "selection_policy_exposed_records": len(selection_pilot_rows),
            "selection_policy_exposed_parents": 15,
            "holdout_policy_exposed_records": len(holdout_pilot_rows),
            "holdout_policy_exposed_parents": 15,
            "selection_conflict_records": 0,
            "selection_conflict_parents": 0,
            "parent_id_overlap_parents": 0,
            "semantic_position_overlap_parents": 0,
            "policy_exposed_unmatched_parent_ids": 2,
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
    write_json(partition_path, partition_manifest)
    return {
        "source_train": source_train_path,
        "train": model_train_path,
        "full_val": full_val_path,
        "selection": selection_path,
        "holdout": holdout_path,
        "teacher": teacher_path,
        "partition": partition_path,
        "plan": plan_path,
        "protected": protected_path,
        "policy_receipt": policy_receipt_path,
        "policy_parent_ids": policy_parent_path,
        "policy_semantic_ids": policy_semantic_path,
        "replay": replay_path,
        "protected_values": protected_values,
    }


def attach_sealed_training_provenance(checkpoint_path, fixture, *, replay=False):
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    partition = EVAL.verify_sibling_validation_partition(
        fixture["partition"],
        sibling_manifest_path=fixture["teacher"],
        data_role="selection",
        data_path=fixture["selection"],
        protected_position_ids_path=fixture["protected"],
        policy_exposure_receipt_path=fixture["policy_receipt"],
        policy_exposed_parent_ids_path=fixture["policy_parent_ids"],
        policy_exposed_semantic_position_ids_path=fixture["policy_semantic_ids"],
        training_path=fixture["train"],
    )
    teacher = partition["teacher_manifest"]

    def source_provenance(path, usable_rows, **extra):
        return {
            "path": os.path.abspath(path),
            "real_path": os.path.realpath(path),
            "sha256": sha256_file(path),
            "bytes": os.path.getsize(path),
            "usable_rows": usable_rows,
            "selection": "all",
            "requested_limit": 0,
            **extra,
        }

    training_pipeline = {
        "source_revision": "f" * 40,
        "tracked_tree_clean": True,
    }
    training_runtime = {
        "platform": "macOS-15.5-arm64-arm-64bit",
        "system": "Darwin",
        "machine": "arm64",
        "processor": "arm",
        "cpu_model": "Apple M4 Max",
        "logical_cpu_count": 16,
        "python_version": "3.11.10",
        "torch_version": "2.3.0",
        "device": "cpu",
        "torch_threads": 2,
        "torch_interop_threads": 1,
        "deterministic_algorithms": True,
        "deterministic_debug_mode": "error",
        "mps_built": True,
        "mps_available": True,
        "cuda_available": False,
    }
    replay_provenance = None
    if replay:
        selection_semantic = set()
        with open(fixture["selection"], encoding="utf-8") as source:
            for line in source:
                row = json.loads(line)
                selection_semantic.update(
                    (row["position_id"], row["child_position_id"])
                )
        policy_semantic = set(
            read_bytes(fixture["policy_semantic_ids"])[
                :-1
            ].decode().split("\n")
        )
        excluded = (
            policy_semantic | selection_semantic | fixture["protected_values"]
        )
        replay_provenance = {
            "path": "/sealed/runOp1-train.jsonl",
            "real_path": "/sealed/runOp1-train.jsonl",
            "sha256": EVAL.SEALED_REPLAY_SHA256,
            "bytes": 1,
            "usable_rows": EVAL.SEALED_REPLAY_ROWS,
            "selection": "uniform_without_replacement_after_semantic_exclusion",
            "requested_limit": EVAL.SEALED_REPLAY_ROWS,
            "sample_seed": 44,
            "replay_ratio": 1.0,
            "eligible_rows_after_semantic_exclusion": EVAL.SEALED_REPLAY_ROWS + 1,
            "excluded_rows_before_sampling": 1,
            "excluded_policy_exposed_semantic_position_ids": len(policy_semantic),
            "policy_exposed_semantic_position_ids_sha256": identifier_digest(
                policy_semantic
            ),
            "policy_exposed_semantic_position_ids_file_sha256": partition["source"][
                "policy_exposed_semantic_position_ids"
            ]["sha256"],
            "excluded_validation_child_position_ids": len(selection_semantic),
            "validation_child_position_ids_sha256": identifier_digest(selection_semantic),
            "excluded_model_selection_semantic_position_ids": len(selection_semantic),
            "model_selection_semantic_position_ids_sha256": identifier_digest(selection_semantic),
            "excluded_final_holdout_protected_position_ids": len(fixture["protected_values"]),
            "final_holdout_protected_position_ids_sha256": identifier_digest(
                fixture["protected_values"]
            ),
            "final_holdout_protected_position_ids_file_sha256": partition["outputs"][
                "protected_position_ids"
            ]["sha256"],
            "excluded_semantic_position_ids": len(excluded),
            "excluded_semantic_position_ids_sha256": identifier_digest(excluded),
        }
    experiment_contract = {
        "schema": EVAL.SEALED_EXPERIMENT_SCHEMA,
        "series": "scratch",
        "seed": 42,
        "loss": "sibling-ranking",
        "init_checkpoint_sha256": None,
        "replay_sha256": EVAL.SEALED_REPLAY_SHA256,
        "learning_rate": 1e-3,
        "epochs": 40,
        "batch": 256,
        "k": 600.0,
        "cp_clamp": 3000,
        "rank_weight": 1.0,
        "rank_pair_min": 50.0,
        "rank_pair_max": 600.0,
        "rank_margin_cp": 50.0,
        "policy_weight": 0.25,
        "policy_temp_cp": 200.0,
        "select_metric": "sibling-pair",
        "features": "board",
        "device": "cpu",
        "torch_threads": 2,
        "replay_limit": EVAL.SEALED_REPLAY_ROWS,
        "replay_ratio": 1.0,
        "primary_limit": 0,
        "allow_legacy_init": False,
    }
    checkpoint["args"] = {
        "experiment_series": "scratch",
        "seed": 42,
        "loss": "sibling-ranking",
        "lr": 1e-3,
        "epochs": 40,
        "batch": 256,
        "k": 600.0,
        "cp_clamp": 3000,
        "rank_weight": 1.0,
        "rank_pair_min": 50.0,
        "rank_pair_max": 600.0,
        "rank_margin_cp": 50.0,
        "policy_weight": 0.25,
        "policy_temp_cp": 200.0,
        "select_metric": "sibling-pair",
        "features": "board",
        "device": "cpu",
        "torch_threads": 2,
        "replay_limit": EVAL.SEALED_REPLAY_ROWS,
        "replay_ratio": 1.0,
        "limit": 0,
        "allow_legacy_init": False,
        "init_ckpt": "",
    }
    checkpoint["init_checkpoint"] = None
    checkpoint["experiment_contract"] = experiment_contract
    experiment_plan = {
        "path": "ml/protocols/wcsc36-six-run-plan.json",
        "bytes": 1,
        "sha256": "9" * 64,
        "schema": "shogi-sibling-six-run-plan-v1",
        "slot_id": "scratch-seed-42",
        "slot_output": "ml/runs/wcsc36-six-run/scratch-seed-42",
        "selection_tie_break": [
            "series:warm-before-scratch",
            "seed:ascending",
            "checkpoint_sha256:ascending",
        ],
    }
    checkpoint["data_provenance"] = {
        "sibling_manifest": teacher,
        "validation_partition": partition,
        "train": source_provenance(
            fixture["train"],
            2 * PARTITION_EXPECTED_SOURCE_TRAINING_GAMES,
            role="model_training",
        ),
        "validation": source_provenance(
            fixture["selection"], 8, role="model_selection"
        ),
        "sealed_holdout": {
            "status": "sealed_not_opened",
            **partition["outputs"]["final_holdout"],
        },
        "protected_position_ids": {
            **partition["outputs"]["protected_position_ids"],
            "path": os.path.abspath(fixture["protected"]),
        },
        "training_pipeline": training_pipeline,
        "training_runtime": training_runtime,
        "experiment_contract": experiment_contract,
        "experiment_plan": experiment_plan,
        "replay": replay_provenance,
    }
    checkpoint["training_pipeline"] = training_pipeline
    checkpoint["training_runtime"] = training_runtime
    checkpoint["experiment_plan"] = experiment_plan
    checkpoint["checkpoint_selection"] = {
        "requested": "sibling-pair",
        "resolved": "sibling-pair",
        "dataset_role": "model_selection",
    }
    torch.save(checkpoint, checkpoint_path)


class SiblingHoldoutEvaluationTest(unittest.TestCase):
    def test_checkpoint_arch_normalizes_integral_sigmoid_scale(self):
        arch = expected_arch(
            features="board",
            input_dim=EVAL.INPUT_DIM,
            h1=DistillNet.H1,
            h2=DistillNet.H2,
            k=600.0,
            kp_buckets=1,
        )
        arch["k"] = 600
        features, k_sigmoid = EVAL._checkpoint_arch({"arch": arch}, "integer-k.pt")
        self.assertEqual(features, "board")
        self.assertEqual(k_sigmoid, 600.0)
        self.assertIs(type(k_sigmoid), float)

        arch["k"] = True
        with self.assertRaisesRegex(ValueError, "finite and positive"):
            EVAL._checkpoint_arch({"arch": arch}, "boolean-k.pt")

    def test_partition_rejects_unpinned_search_limit_and_n100_teacher_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture = write_sealed_fixture(tmp)
            with open(fixture["teacher"], encoding="utf-8") as source:
                teacher = json.load(source)
            teacher["search"]["limit"] = {"nodes": 123_456}
            teacher["search"]["timeout_ms"] = 3_600_000
            write_json(fixture["teacher"], teacher)
            teacher_bytes = read_bytes(fixture["teacher"])
            with open(fixture["partition"], encoding="utf-8") as source:
                partition = json.load(source)
            partition["source"]["teacher_manifest"]["bytes"] = len(teacher_bytes)
            partition["source"]["teacher_manifest"]["sha256"] = hashlib.sha256(
                teacher_bytes
            ).hexdigest()
            write_json(fixture["partition"], partition)
            with self.assertRaisesRegex(ValueError, r"search\.limit|timeout_ms"):
                EVAL.verify_sibling_validation_partition(
                    fixture["partition"], sibling_manifest_path=fixture["teacher"]
                )

            teacher["search"]["limit"] = {"depth": 16}
            teacher["search"]["timeout_ms"] = 600_000
            teacher["source"]["selected_parents"] = 100
            write_json(fixture["teacher"], teacher)
            with self.assertRaisesRegex(ValueError, r"source\.selected_parents"):
                EVAL.verify_sibling_validation_partition(
                    fixture["partition"],
                    sibling_manifest_path=fixture["teacher"],
                )

    def test_eligible_pair_count_vectorizes_each_parent_without_cross_parent_pairs(self):
        raw_child_cp = torch.tensor([-300.0, -100.0, -400.0, 50.0, 0.0])
        groups = [[0, 1], [2, 3, 4]]
        self.assertEqual(EVAL._eligible_pair_count(raw_child_cp, groups, 50.0), 4)
        self.assertEqual(EVAL._eligible_pair_count(raw_child_cp, groups, 401.0), 1)

    def test_validation_loader_requires_val_split(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = os.path.join(tmp, "train-labelled.jsonl")
            write_siblings(data)
            with open(data, encoding="utf-8") as source:
                rows = [json.loads(line) for line in source]
            with open(data, "w", encoding="utf-8", newline="\n") as target:
                for row in rows:
                    row["split"] = "train"
                    target.write(json.dumps(row, sort_keys=True) + "\n")
            with self.assertRaisesRegex(ValueError, r"split='train'.*expected 'val'"):
                EVAL.load_validation_data(data, 3000)

    def test_only_base_models_are_legacy_unverified_without_a_sealed_partition(self):
        with tempfile.TemporaryDirectory() as tmp:
            train_data = os.path.join(tmp, "train.jsonl")
            val_data = os.path.join(tmp, "val.jsonl")
            manifest = os.path.join(tmp, "manifest.json")
            old_candidate = os.path.join(tmp, "old-candidate.pt")
            stable = os.path.join(tmp, "stable.pt")
            write_siblings(
                train_data,
                game_id="game-train",
                parent_id="parent-train",
                split="train",
            )
            write_siblings(val_data)
            write_sibling_manifest(manifest, val_data, train_data)
            write_hand_model(old_candidate, slope=0.003)
            write_hand_model(stable, slope=-0.003, bias=0.1)
            stable_checkpoint = torch.load(
                stable, map_location="cpu", weights_only=False
            )
            stable_checkpoint["args"] = {"loss": "sigmoid"}
            stable_checkpoint["data_provenance"] = {"legacy_source": "runOp1"}
            torch.save(stable_checkpoint, stable)
            attach_sibling_training_provenance(
                old_candidate,
                manifest,
                train_data,
                val_data,
            )

            with self.assertRaisesRegex(ValueError, "requires a sealed"):
                EVAL.evaluate_checkpoints(
                    val_data,
                    [("old-candidate", old_candidate)],
                    sibling_manifest_path=manifest,
                    include_quantized=False,
                )

            report = EVAL.evaluate_checkpoints(
                val_data,
                [("stable", stable)],
                sibling_manifest_path=manifest,
                include_quantized=False,
            )
            self.assertEqual(
                report["models"][0]["training_provenance"]["status"],
                "legacy_unverified",
            )
            self.assertIn(
                "comparison only",
                report["models"][0]["training_provenance"]["reason"],
            )
            table = EVAL.format_table(report)
            self.assertIn("legacy_unverified", table)

            hybrid = torch.load(stable, map_location="cpu", weights_only=False)
            hybrid["experiment_contract"] = {"schema": "sealed-marker"}
            torch.save(hybrid, stable)
            with self.assertRaisesRegex(ValueError, "hybrid legacy/sealed"):
                EVAL.evaluate_checkpoints(
                    val_data,
                    [("hybrid", stable)],
                    sibling_manifest_path=manifest,
                    include_quantized=False,
                )

    def test_sealed_checkpoint_is_bound_to_selection_and_final_holdout_stays_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture = write_sealed_fixture(tmp)
            sealed = os.path.join(tmp, "sealed.pt")
            stable = os.path.join(tmp, "stable.pt")
            write_hand_model(sealed, slope=0.003)
            write_hand_model(stable, slope=-0.003)
            attach_sealed_training_provenance(sealed, fixture, replay=True)

            fully_verified = EVAL.verify_sibling_validation_partition(
                fixture["partition"],
                sibling_manifest_path=fixture["teacher"],
                training_path=fixture["train"],
                model_selection_path=fixture["selection"],
                final_holdout_path=fixture["holdout"],
                protected_position_ids_path=fixture["protected"],
                policy_exposure_receipt_path=fixture["policy_receipt"],
                policy_exposed_parent_ids_path=fixture["policy_parent_ids"],
                policy_exposed_semantic_position_ids_path=fixture["policy_semantic_ids"],
            )
            self.assertEqual(
                fully_verified["verified_outputs"],
                [
                    "model_training",
                    "model_selection",
                    "final_holdout",
                    "protected_position_ids",
                ],
            )

            report = EVAL.evaluate_checkpoints(
                fixture["selection"],
                [("sealed", sealed), ("stable", stable)],
                sibling_manifest_path=fixture["teacher"],
                validation_partition_manifest_path=fixture["partition"],
                policy_exposure_receipt_path=fixture["policy_receipt"],
                policy_exposed_parent_ids_path=fixture["policy_parent_ids"],
                policy_exposed_semantic_position_ids_path=fixture["policy_semantic_ids"],
                protected_position_ids_path=fixture["protected"],
                data_role="selection",
                include_quantized=False,
            )
            self.assertEqual(report["schema"], "shogi-sibling-eval-v2")
            self.assertEqual(report["data"]["records"], 8)
            self.assertEqual(
                report["models"][0]["training_provenance"]["status"],
                "verified_same_model_selection_partition",
            )
            self.assertEqual(
                report["models"][1]["training_provenance"]["status"],
                "legacy_unverified",
            )
            with self.assertRaisesRegex(ValueError, "candidate-selection receipt"):
                EVAL.evaluate_checkpoints(
                    fixture["holdout"],
                    [("sealed", sealed)],
                    sibling_manifest_path=fixture["teacher"],
                    validation_partition_manifest_path=fixture["partition"],
                    policy_exposure_receipt_path=fixture["policy_receipt"],
                    policy_exposed_parent_ids_path=fixture["policy_parent_ids"],
                    policy_exposed_semantic_position_ids_path=fixture["policy_semantic_ids"],
                    protected_position_ids_path=fixture["protected"],
                    data_role="final-holdout",
                    include_quantized=False,
                )

    def test_training_cli_checkpoint_round_trips_through_both_sealed_roles(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture = write_sealed_fixture(tmp)
            run_dir = os.path.join(tmp, "run")
            training_revision = "f" * 40
            arguments = [
                "train.py",
                "--data",
                fixture["train"],
                "--val-data",
                fixture["selection"],
                "--sibling-manifest",
                fixture["teacher"],
                "--validation-partition-manifest",
                fixture["partition"],
                "--experiment-plan",
                fixture["plan"],
                "--holdout-protected-position-ids",
                fixture["protected"],
                "--policy-exposure-receipt",
                fixture["policy_receipt"],
                "--policy-exposed-parent-ids",
                fixture["policy_parent_ids"],
                "--policy-exposed-semantic-position-ids",
                fixture["policy_semantic_ids"],
                "--pipeline-revision",
                training_revision,
                "--replay-data",
                fixture["replay"],
                "--replay-limit",
                "2",
                "--loss",
                "sibling-ranking",
                "--experiment-series",
                "scratch",
                "--select-metric",
                "sibling-pair",
                "--device",
                "cpu",
                "--epochs",
                "40",
                "--batch",
                "256",
                "--out",
                run_dir,
            ]
            clean_pipeline = {
                "source_revision": training_revision,
                "tracked_tree_clean": True,
            }
            replay_sha256 = sha256_file(fixture["replay"])
            plan_provenance = {
                "path": os.path.abspath(fixture["plan"]),
                "bytes": os.path.getsize(fixture["plan"]),
                "sha256": sha256_file(fixture["plan"]),
                "schema": "shogi-sibling-six-run-plan-v1",
                "slot_id": "scratch-seed-42",
                "slot_output": "ml/runs/wcsc36-six-run/scratch-seed-42",
                "selection_tie_break": [
                    "series:warm-before-scratch",
                    "seed:ascending",
                    "checkpoint_sha256:ascending",
                ],
            }
            with mock.patch.object(sys, "argv", arguments), mock.patch(
                "train.verify_training_pipeline_revision",
                return_value=clean_pipeline,
            ), mock.patch("train.SEALED_REPLAY_SHA256", replay_sha256), mock.patch(
                "train.SEALED_REPLAY_ROWS", 2
            ), mock.patch(
                "train.verify_sealed_experiment_plan",
                return_value=plan_provenance,
            ):
                train_main()

            checkpoint_path = os.path.join(run_dir, "best.pt")
            checkpoint = torch.load(
                checkpoint_path, map_location="cpu", weights_only=False
            )
            self.assertNotEqual(
                sha256_file(fixture["source_train"]),
                sha256_file(fixture["train"]),
            )
            self.assertEqual(
                checkpoint["data_provenance"]["train"]["sha256"],
                sha256_file(fixture["train"]),
            )
            self.assertEqual(
                checkpoint["data_provenance"]["train"]["role"],
                "model_training",
            )
            self.assertEqual(
                checkpoint["data_provenance"]["sibling_manifest"][
                    "verified_splits"
                ],
                [],
            )
            self.assertEqual(
                checkpoint["data_provenance"]["validation_partition"][
                    "verified_outputs"
                ],
                ["model_training", "model_selection", "protected_position_ids"],
            )
            self.assertEqual(
                checkpoint["data_provenance"]["sealed_holdout"]["status"],
                "sealed_not_opened",
            )
            self.assertEqual(
                [key for key in checkpoint["args"] if "holdout" in key],
                ["holdout_protected_position_ids"],
            )

            with mock.patch.object(
                EVAL, "SEALED_REPLAY_SHA256", replay_sha256
            ), mock.patch.object(EVAL, "SEALED_REPLAY_ROWS", 2):
                report = EVAL.evaluate_checkpoints(
                    fixture["selection"],
                    [("candidate", checkpoint_path)],
                    sibling_manifest_path=fixture["teacher"],
                    validation_partition_manifest_path=fixture["partition"],
                    policy_exposure_receipt_path=fixture["policy_receipt"],
                    policy_exposed_parent_ids_path=fixture["policy_parent_ids"],
                    policy_exposed_semantic_position_ids_path=fixture["policy_semantic_ids"],
                    protected_position_ids_path=fixture["protected"],
                    data_role="selection",
                    include_quantized=False,
                )
                self.assertEqual(
                    report["models"][0]["training_provenance"]["status"],
                    "verified_same_model_selection_partition",
                )
                with self.assertRaisesRegex(ValueError, "candidate-selection receipt"):
                    report = EVAL.evaluate_checkpoints(
                        fixture["holdout"],
                        [("candidate", checkpoint_path)],
                        sibling_manifest_path=fixture["teacher"],
                        validation_partition_manifest_path=fixture["partition"],
                        policy_exposure_receipt_path=fixture["policy_receipt"],
                        policy_exposed_parent_ids_path=fixture["policy_parent_ids"],
                        policy_exposed_semantic_position_ids_path=fixture["policy_semantic_ids"],
                        protected_position_ids_path=fixture["protected"],
                        data_role="final-holdout",
                        include_quantized=False,
                    )

    def test_sealed_evaluation_rejects_tampered_checkpoint_provenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture = write_sealed_fixture(tmp)
            base_checkpoint = os.path.join(tmp, "sealed.pt")
            write_hand_model(base_checkpoint, slope=0.003)
            attach_sealed_training_provenance(base_checkpoint, fixture, replay=True)
            base = torch.load(
                base_checkpoint, map_location="cpu", weights_only=False
            )
            cases = (
                (
                    "different partition",
                    lambda value: value["data_provenance"][
                        "validation_partition"
                    ].__setitem__("sha256", "0" * 64),
                    "validation partition sha256",
                ),
                (
                    "holdout opened",
                    lambda value: value["data_provenance"][
                        "sealed_holdout"
                    ].__setitem__("status", "opened_during_training"),
                    "final holdout was not kept sealed",
                ),
                (
                    "validation role changed",
                    lambda value: value["data_provenance"][
                        "validation"
                    ].__setitem__("role", "final_holdout"),
                    "complete model-selection split",
                ),
                (
                    "base teacher split was opened during training",
                    lambda value: value["data_provenance"][
                        "sibling_manifest"
                    ].__setitem__("verified_splits", ["train", "val"]),
                    "must not open either base teacher split",
                ),
                (
                    "unfiltered base training used",
                    lambda value: value["data_provenance"]["train"].__setitem__(
                        "role", "teacher_train"
                    ),
                    "complete filtered model training",
                ),
                (
                    "checkpoint selected on holdout",
                    lambda value: value["checkpoint_selection"].__setitem__(
                        "dataset_role", "final_holdout"
                    ),
                    "selection role is not sealed",
                ),
                (
                    "runtime type changed",
                    lambda value: value["training_runtime"].__setitem__(
                        "mps_available", 0
                    ),
                    "training runtime provenance is invalid",
                ),
                (
                    "replay omitted holdout exclusions",
                    lambda value: value["data_provenance"]["replay"].__setitem__(
                        "excluded_final_holdout_protected_position_ids", 0
                    ),
                    "replay identity/isolation",
                ),
                (
                    "replay union count is not the semantic union",
                    lambda value: value["data_provenance"]["replay"].__setitem__(
                        "excluded_semantic_position_ids", 1
                    ),
                    "replay identity/isolation",
                ),
                (
                    "replay union digest is malformed",
                    lambda value: value["data_provenance"]["replay"].__setitem__(
                        "excluded_semantic_position_ids_sha256", "not-a-digest"
                    ),
                    "replay identity/isolation",
                ),
            )
            for index, (label, mutate, expected) in enumerate(cases):
                with self.subTest(label=label):
                    candidate = copy.deepcopy(base)
                    mutate(candidate)
                    checkpoint = os.path.join(tmp, f"sealed-bad-{index}.pt")
                    torch.save(candidate, checkpoint)
                    with self.assertRaisesRegex(ValueError, expected):
                        EVAL.evaluate_checkpoints(
                            fixture["selection"],
                            [("candidate", checkpoint)],
                            sibling_manifest_path=fixture["teacher"],
                            validation_partition_manifest_path=fixture["partition"],
                            policy_exposure_receipt_path=fixture["policy_receipt"],
                            policy_exposed_parent_ids_path=fixture["policy_parent_ids"],
                            policy_exposed_semantic_position_ids_path=fixture["policy_semantic_ids"],
                            protected_position_ids_path=fixture["protected"],
                            data_role="selection",
                            include_quantized=False,
                        )

    def test_cli_requires_manifest_and_rejects_valid_unpublished_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = os.path.join(tmp, "val.jsonl")
            checkpoint = os.path.join(tmp, "model.pt")
            manifest = os.path.join(tmp, "manifest.json")
            write_siblings(data)
            write_hand_model(checkpoint, slope=0.003)

            with self.assertRaises(SystemExit) as missing:
                EVAL.main(
                    [
                        "--data",
                        data,
                        "--checkpoint",
                        f"model={checkpoint}",
                        "--no-quantized",
                    ]
                )
            self.assertEqual(missing.exception.code, 2)

            write_sibling_manifest(manifest, data)
            # Both rows remain formally valid v1 sibling rows; only their
            # publication identity no longer matches the manifest commit marker.
            write_siblings(data, game_id="next-val", parent_id="next-parent")
            with self.assertRaisesRegex(ValueError, r"outputs\.val_(bytes|sha256)"):
                EVAL.evaluate_checkpoints(
                    data,
                    [("model", checkpoint)],
                    sibling_manifest_path=manifest,
                )

    def test_json_output_cannot_overwrite_data_or_checkpoint_realpath(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = os.path.join(tmp, "val.jsonl")
            checkpoint = os.path.join(tmp, "model.pt")
            manifest = os.path.join(tmp, "manifest.json")
            write_siblings(data)
            write_hand_model(checkpoint, slope=0.003)
            write_sibling_manifest(manifest, data)
            data_before = read_bytes(data)
            checkpoint_before = read_bytes(checkpoint)
            manifest_before = read_bytes(manifest)

            for output in (data, checkpoint, manifest):
                with self.subTest(output=output):
                    with self.assertRaises(SystemExit) as caught:
                        EVAL.main(
                            [
                                "--data",
                                data,
                                "--sibling-manifest",
                                manifest,
                                "--checkpoint",
                                f"model={checkpoint}",
                                "--no-quantized",
                                "--json-out",
                                output,
                            ]
                        )
                    self.assertEqual(caught.exception.code, 2)
            self.assertEqual(read_bytes(data), data_before)
            self.assertEqual(read_bytes(checkpoint), checkpoint_before)
            self.assertEqual(read_bytes(manifest), manifest_before)

            alias = os.path.join(tmp, "checkpoint-alias.json")
            os.symlink(checkpoint, alias)
            with self.assertRaisesRegex(ValueError, "must not overwrite checkpoint"):
                EVAL.validate_json_output_path(alias, data, [("model", checkpoint)])

    def test_atomic_json_write_preserves_old_target_on_replace_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = os.path.join(tmp, "report.json")
            with open(output, "w", encoding="utf-8") as target:
                target.write("old\n")

            with mock.patch.object(EVAL.os, "replace", side_effect=OSError("replace failed")):
                with self.assertRaisesRegex(OSError, "replace failed"):
                    EVAL.atomic_write_json(output, '{"new": true}')
            self.assertEqual(read_text(output), "old\n")
            self.assertEqual(
                [name for name in os.listdir(tmp) if name.endswith(".tmp")], []
            )

            real_replace = os.replace
            real_fsync = os.fsync
            with mock.patch.object(EVAL.os, "replace", wraps=real_replace) as replaced:
                with mock.patch.object(EVAL.os, "fsync", wraps=real_fsync) as fsynced:
                    EVAL.atomic_write_json(output, '{"new": true}')
            self.assertEqual(read_text(output), '{"new": true}\n')
            self.assertEqual(replaced.call_count, 1)
            self.assertGreaterEqual(fsynced.call_count, 1)
            temporary, installed = replaced.call_args.args
            self.assertEqual(os.path.dirname(temporary), tmp)
            self.assertEqual(installed, output)
            self.assertEqual(
                [name for name in os.listdir(tmp) if name.endswith(".tmp")], []
            )

    def test_production_cp_conversion_truncates_distinct_out_q_values_to_a_tie(self):
        self.assertEqual(EVAL.production_cp_from_out_q(1, 600.0), 0)
        self.assertEqual(EVAL.production_cp_from_out_q(2, 600.0), 0)
        self.assertEqual(EVAL.production_cp_from_out_q(-1, 600.0), 0)
        self.assertEqual(EVAL.production_cp_from_out_q(14, 600.0), 1)
        self.assertEqual(EVAL.production_cp_from_out_q(-14, 600.0), -1)

    def test_parent_sign_and_float_to_quantized_order_change(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = os.path.join(tmp, "val.jsonl")
            good = os.path.join(tmp, "good.pt")
            bad = os.path.join(tmp, "bad.pt")
            manifest = os.path.join(tmp, "manifest.json")
            write_siblings(data)
            write_hand_model(good, slope=0.003)
            write_hand_model(bad, slope=-0.003, bias=0.1)
            write_sibling_manifest(manifest, data)

            report = EVAL.evaluate_checkpoints(
                data,
                [("good", good), ("bad", bad)],
                sibling_manifest_path=manifest,
                pair_min_cp=50.0,
                include_quantized=True,
            )

            self.assertEqual(report["schema"], "shogi-sibling-eval-v1")
            self.assertEqual(report["data"]["records"], 2)
            self.assertEqual(report["data"]["parents"], 1)
            self.assertEqual(report["data"]["eligible_pairs"], 1)
            self.assertEqual(report["data"]["sibling_manifest_sha256"], sha256_file(manifest))
            self.assertEqual(report["data"]["sibling_manifest_bytes"], os.path.getsize(manifest))
            self.assertEqual(report["data"]["pipeline_source_revision"], PIPELINE_REVISION)
            self.assertEqual(report["data"]["sibling_manifest"]["label_policy"], LABEL_POLICY)
            self.assertEqual(
                report["data"]["teacher_runtime_snapshot"],
                {
                    **RUNTIME_SNAPSHOT_CONTRACT,
                    "engine_argument_file_count": 0,
                    "eval_tree_present": False,
                },
            )
            self.assertEqual([model["name"] for model in report["models"]], ["good", "bad"])

            good_result = report["models"][0]
            # The child with one pawn has the lower float child CP. Negating
            # once makes it the correct parent-side best move.
            self.assertEqual(good_result["float"]["within_parent_pair_accuracy"], 1.0)
            self.assertEqual(good_result["float"]["teacher_top1_accuracy"], 1.0)
            # 0.003 * 127 rounds to zero, so int16 ties both candidates. The
            # first row is deliberately not teacher-best, making the change
            # visible in both ranking adoption gates.
            quantized = good_result["quantized_int16"]
            self.assertEqual(quantized["within_parent_pair_accuracy"], 0.0)
            self.assertEqual(quantized["teacher_top1_accuracy"], 0.0)
            self.assertEqual(
                quantized["delta_from_float"]["within_parent_pair_accuracy"], -1.0
            )
            self.assertEqual(quantized["delta_from_float"]["teacher_top1_accuracy"], -1.0)

            # Reversing the float relation is wrong under the same child->parent sign rule.
            self.assertEqual(
                report["models"][1]["float"]["within_parent_pair_accuracy"], 0.0
            )
            self.assertEqual(report["models"][1]["float"]["teacher_top1_accuracy"], 0.0)

            # The complete report is strict machine-readable JSON (no NaN).
            encoded = json.dumps(report, allow_nan=False, sort_keys=True)
            self.assertEqual(json.loads(encoded)["data"]["value_target"], "clamped_child_cp")

    def test_rejects_teacher_child_sign_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = os.path.join(tmp, "bad-sign.jsonl")
            checkpoint = os.path.join(tmp, "model.pt")
            manifest = os.path.join(tmp, "manifest.json")
            write_siblings(data, sign_mismatch=True)
            write_hand_model(checkpoint, slope=0.003)
            write_sibling_manifest(manifest, data)

            with self.assertRaisesRegex(ValueError, "sign mismatch"):
                EVAL.evaluate_checkpoints(
                    data,
                    [("model", checkpoint)],
                    sibling_manifest_path=manifest,
                )

    def test_rejects_nonfinite_checkpoint_parameters(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = os.path.join(tmp, "val.jsonl")
            checkpoint = os.path.join(tmp, "nan.pt")
            manifest = os.path.join(tmp, "manifest.json")
            write_siblings(data)
            write_hand_model(checkpoint, slope=0.003, make_nonfinite=True)
            write_sibling_manifest(manifest, data)

            with self.assertRaisesRegex(ValueError, "non-finite"):
                EVAL.evaluate_checkpoints(
                    data,
                    [("model", checkpoint)],
                    sibling_manifest_path=manifest,
                )


if __name__ == "__main__":
    unittest.main()
