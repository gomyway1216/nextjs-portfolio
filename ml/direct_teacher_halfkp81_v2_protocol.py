#!/usr/bin/env python3
"""Strict contracts for the direct-teacher HalfKP81 v2 pilot.

This module validates the prospective tracked protocol, the future pilot
dataset manifest, and the execution plan emitted by the thin builder.  It does
not generate data, create an optimizer, run a match, or authorize a live write.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
from typing import Any, Mapping


PROTOCOL_SCHEMA = "shogi-direct-teacher-halfkp81-v2-plan-v1"
DATASET_MANIFEST_SCHEMA = "shogi-direct-teacher-halfkp81-v2-pilot-dataset-manifest-v1"
ROW_SCHEMA = "shogi-direct-teacher-halfkp81-v2-position-v1"
ID_SET_SHA256_FIELDS = (
    "game_ids_sha256",
    "parent_ids_sha256",
    "position_ids_sha256",
    "child_position_ids_sha256",
    "semantic_position_ids_sha256",
)
EXECUTION_PLAN_SCHEMA = "shogi-direct-teacher-halfkp81-v2-pilot-execution-plan-v1"
PROTOCOL_STATUS = "prospective-pilot-preregistered-no-execution"
DATASET_STATUS = "complete-pilot-data-training-not-started"
EXECUTION_STATUS = "pilot-data-bound-training-not-started"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
POSITION_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
POSITION_ID_SET_FORMAT = "sorted-unique-sha256-position-id-utf8-lf-v1"
DATASET_ROW_FIELDS = {
    "schema",
    "role",
    "game_id",
    "parent_id",
    "position_id",
    "child_position_id",
    "child_sfen",
    "teacher_child_cp",
    "teacher_score_kind",
    "source_row_sha256",
}
_STREAM_CHUNK_BYTES = 4 * 1024 * 1024
_MAX_JSON_BYTES = 16 * 1024 * 1024


EXPECTED_INPUTS = {
    "initializer": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "halfkp81-epoch2-interpolation-v1/alpha-050.pt"
        ),
        "bytes": 191656679,
        "sha256": "ea36d0b9f0ecdf9543daf8f77fed42577ccc38deb6a964e8df78dc8549b6a8c4",
        "role": "frozen-alpha-0.50-halfkp81-initializer",
    },
    "live_weights": {
        "path": "public/shogi-nnue-weights.bin",
        "bytes": 1185988,
        "sha256": "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
        "role": "immutable-live-baseline-never-writable",
    },
    "direct_teacher_source": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "floodgate-q1-2026-strength-first-v9/train.jsonl"
        ),
        "bytes": 236990586,
        "sha256": "4a18b186c255b66dd195ec4c781381bc10d583951acfa8a690a9c152467b9580",
        "rows": 278736,
        "parents": 23980,
        "games": 1000,
        "fit_parents": 19264,
        "tune_parents": 4411,
        "fit_component_assignments_sha256": (
            "bb0e2188eb5a533a7d5d9b0d9aa40a73b2b069a182fc3eb8b6f09ec5f94f4f32"
        ),
        "role": "v9-fit-direct-yaneuraou-depth16-child-cp-only",
    },
    "spent_tune_result": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "child-board-strength-candidate-v1-tune/result.json"
        ),
        "bytes": 3678,
        "sha256": "65e93a2bd82bd5ec0cc5cc75ccd53207d6e8e0f7f7628d944ca3e009a5d55399",
        "schema": "shogi-child-board-strength-candidate-tune-result-v1",
        "status": "complete-one-shot-tune-fail-lane-closed",
        "role": "spent-evidence-membership-exclusion-only",
    },
    "spent_tune_membership": {
        "path": "ml/protocols/child-board-root-policy-student-tune-membership-v1.json",
        "bytes": 3428,
        "sha256": "73e5af6081ed38108fd38b0b97405bbe22f27298f961610d2797352e90cc817b",
        "browser_tune_parents": 196,
        "v9_tune_parents": 4411,
        "role": "permanent-parent-and-semantic-exclusion",
    },
    "fresh_selection_protected": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-bundles/"
            "floodgate-q1-2026-label-free-role-bundle-v2/"
            "fresh-selection.protected-position-ids.txt"
        ),
        "bytes": 30624768,
        "sha256": "3086c6ba6bff70869dee4f9e77102bfdb3c15c876897d781114bb90ae2ffef9d",
        "count": 425344,
        "identifiers_sha256": (
            "fd6ebd48871d13983bdb6c0a736a0c51ac6480ae52bdda26c56abc97c00ed316"
        ),
        "format": POSITION_ID_SET_FORMAT,
        "role": "permanent-semantic-exclusion",
    },
    "fresh_final_protected": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-bundles/"
            "floodgate-q1-2026-label-free-role-bundle-v2/"
            "fresh-final-holdout.protected-position-ids.txt"
        ),
        "bytes": 29751912,
        "sha256": "4f518ce8605950198b0b116703be83932b11380169ecf5631f01d8590c82dabe",
        "count": 413221,
        "identifiers_sha256": (
            "2f5823565a20cbf4099f3944c2dac6a53c90e8f806d1da43a5ce4214fabddd9f"
        ),
        "format": POSITION_ID_SET_FORMAT,
        "role": "permanent-semantic-exclusion",
    },
    "known_eval_union": {
        "algorithm": "strict-jsonl-semantic-position-union-bytewise-sort-unique-lf-v1",
        "count": 98420,
        "bytes": 7086240,
        "sha256": "d1ce44a7a0de32818442d93a2101c31683d0385bfa26bdc622e344dfac21ef63",
        "identifiers_sha256": (
            "2105a32335f161e5f4e21ce47b6d36b20589c24a8800d0f9163e9fb09c68f558"
        ),
        "role": "permanent-semantic-exclusion",
    },
    "prior_protected_union": {
        "count": 900395,
        "sha256": "419eb5d2e3c74696e69023009623c81abb12917c7a735f874cb4a1507fc9ebbf",
        "source_result_path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "child-board-root-policy-student-runtime-v1/result.json"
        ),
        "source_result_bytes": 1924221,
        "source_result_sha256": (
            "7576f691845b1c54c6b8efb8447fd6c0708bf7abbb70c559d295b363ea98421d"
        ),
        "role": "aggregate-membership-cross-check-and-permanent-exclusion",
    },
}

EXPECTED_SPLIT = {
    "algorithm": "sha256-game-role-mod10-v1",
    "hash_domain": "direct-teacher-halfkp81-v2-pilot-split:",
    "unit": "game_id-before-row-materialization",
    "training_buckets": list(range(1, 10)),
    "validation_buckets": [0],
    "training_percent": 90,
    "validation_percent": 10,
    "whole_game_assignment": True,
    "empty_role": "STOP",
    "cross_role_semantic_overlap": "STOP",
}

EXPECTED_TARGET = {
    "source_field": "teacher_child_cp",
    "position_field": "child_sfen",
    "position_id_field": "child_position_id",
    "perspective": "child-side-to-move",
    "teacher": "pinned-yaneuraou-independent-single-move-depth16-exact-rescore",
    "teacher_score_kind": "cp-only",
    "neural_teacher_output_allowed": False,
    "spent_tune_or_protected_label_allowed": False,
    "game_outcome_target_allowed": False,
}

EXPECTED_TRAINING = {
    "candidate_count": 1,
    "features": "halfkp-factor",
    "parameter_scope": "all",
    "objective": "direct-scalar-sigmoid-bce",
    "k": 600,
    "cp_clamp": 3000,
    "wdl_mix": 0,
    "rank_weight": 0,
    "policy_weight": 0,
    "seed": 42,
    "batch": 2048,
    "learning_rate": 0.000003,
    "epochs": 1,
    "optimizer": "AdamW",
    "weight_decay": 0,
    "scheduler": "constant",
    "device": "mps",
    "checkpoint_selection": "final-epoch-1-only",
    "best_checkpoint_selection": False,
    "early_stopping": False,
    "additional_seed": False,
}

EXPECTED_STATIC_SANITY = {
    "claim": "catastrophic-regression-screen-only-not-playing-strength-evidence",
    "all_checks_required": True,
    "checks": {
        "finite_training_and_inference": True,
        "technical_faults_maximum": 0,
        "float_export_roundtrip_mismatches_maximum": 0,
        "wasm_parity_mismatches_maximum": 0,
        "teacher_mae_cp_improvement_minimum": 5,
        "pair_accuracy_delta_minimum": -0.002,
        "quantized_mean_abs_cp_delta_ratio_maximum": 1.05,
        "quantized_max_abs_cp_delta_ratio_maximum": 1.05,
        "research_runtime_search_slowdown_percent_maximum": 5,
    },
    "reference": "exact frozen alpha-0.50 initializer on pilot validation",
    "any_miss": "STOP before paired play and close the pilot family",
}

EXPECTED_PAIRED_SCREEN = {
    "authority": "static-sanity-pass-authorizes-only-this-screen",
    "fresh_opening_selection": {
        "pair_seed_scan_start": 1200001,
        "pairs": 28,
        "games_per_pair": 2,
        "colors": ["candidate-sente", "candidate-gote"],
        "prior_opening_fingerprint_overlap": 0,
        "selection": (
            "scan upward and accept the first 28 color-swapped opening "
            "fingerprints absent from the complete prior-opening inventory"
        ),
        "manifest_freeze": "before candidate inference or game 1",
    },
    "search": {
        "milliseconds_per_move": 1500,
        "opening_book": False,
        "external_mate_solver": False,
        "fallback": False,
        "maximum_plies": 512,
        "pair_workers": 12,
    },
    "decision": {
        "games": 56,
        "score_unit": "candidate-halfpoints-win2-draw1-loss0",
        "denominator_halfpoints": 112,
        "minimum_candidate_halfpoints": 62,
        "futility_stop": (
            "allowed only when current candidate halfpoints plus every "
            "remaining possible halfpoint is below 62"
        ),
        "technical_faults_maximum": 0,
        "all_moves_legal": True,
        "pass_authorizes_only": "separately-preregistered-expanded-data-stage",
        "strength_claim": False,
    },
}

EXPECTED_STOP_RULES = [
    "STOP before data publication on source, role, split, target, exclusion, or identity drift.",
    "STOP before optimizer creation on any current-tune, known-eval, fresh-selection, fresh-final, or aggregate protected-union overlap.",
    "STOP before paired play on any static-sanity miss.",
    "A paired56 miss permanently closes this objective and pilot family.",
    "After any miss, do not add data, epochs, seeds, checkpoints, retries, or change a threshold.",
    "No pilot state authorizes a write to public/shogi-nnue-weights.bin or any live flag.",
]


class DirectTeacherHalfkpV2Error(ValueError):
    """A v2 pilot artifact violates its preregistered contract."""


def _reject_constant(value: str) -> None:
    raise DirectTeacherHalfkpV2Error(f"non-finite JSON number is forbidden: {value}")


def id_set_sha256(identifiers: Any) -> str:
    values = list(identifiers)
    if any(
        type(value) is not str or POSITION_ID_RE.fullmatch(value) is None
        for value in values
    ):
        raise DirectTeacherHalfkpV2Error("ID-set digest received an invalid identifier")
    digest = hashlib.sha256()
    for identifier in sorted(set(values), key=lambda value: value.encode("ascii")):
        digest.update(identifier.encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise DirectTeacherHalfkpV2Error(f"duplicate JSON key is forbidden: {key}")
        result[key] = value
    return result


def canonical_json_bytes(value: object) -> bytes:
    try:
        text = json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as error:
        raise DirectTeacherHalfkpV2Error(
            f"value is not canonical JSON data: {error}"
        ) from error
    return (text + "\n").encode("utf-8")


def strict_json_bytes(raw: bytes, label: str) -> dict[str, Any]:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise DirectTeacherHalfkpV2Error(f"{label} is not UTF-8") from error
    try:
        value = json.loads(
            text,
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except DirectTeacherHalfkpV2Error:
        raise
    except (TypeError, ValueError, json.JSONDecodeError) as error:
        raise DirectTeacherHalfkpV2Error(
            f"{label} is not strict JSON: {error}"
        ) from error
    if type(value) is not dict:
        raise DirectTeacherHalfkpV2Error(f"{label} root must be an object")
    return value


def stable_file_identity(
    path: str,
    label: str,
    *,
    require_jsonl: bool = False,
) -> tuple[dict[str, Any], int | None]:
    absolute = os.path.abspath(path)
    try:
        path_stat = os.lstat(absolute)
    except OSError as error:
        raise DirectTeacherHalfkpV2Error(
            f"{label} cannot be inspected: {absolute}"
        ) from error
    if stat.S_ISLNK(path_stat.st_mode) or not stat.S_ISREG(path_stat.st_mode):
        raise DirectTeacherHalfkpV2Error(f"{label} must be a regular non-symlink file")
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(absolute, flags)
    except OSError as error:
        raise DirectTeacherHalfkpV2Error(
            f"{label} cannot be opened: {absolute}"
        ) from error
    digest = hashlib.sha256()
    byte_count = 0
    line_count = 0
    last_byte: int | None = None
    previous_was_lf = False
    first_byte = True
    try:
        before = os.fstat(descriptor)
        if (
            before.st_dev != path_stat.st_dev
            or before.st_ino != path_stat.st_ino
            or not stat.S_ISREG(before.st_mode)
        ):
            raise DirectTeacherHalfkpV2Error(f"{label} changed before hashing")
        while True:
            chunk = os.read(descriptor, _STREAM_CHUNK_BYTES)
            if not chunk:
                break
            digest.update(chunk)
            byte_count += len(chunk)
            if require_jsonl:
                if b"\r" in chunk:
                    raise DirectTeacherHalfkpV2Error(f"{label} JSONL contains CR bytes")
                if first_byte and chunk[0] == 0x0A:
                    raise DirectTeacherHalfkpV2Error(
                        f"{label} JSONL starts with a blank row"
                    )
                if previous_was_lf and chunk[0] == 0x0A:
                    raise DirectTeacherHalfkpV2Error(
                        f"{label} JSONL contains a blank row"
                    )
                if b"\n\n" in chunk:
                    raise DirectTeacherHalfkpV2Error(
                        f"{label} JSONL contains a blank row"
                    )
                line_count += chunk.count(b"\n")
                previous_was_lf = chunk[-1] == 0x0A
                first_byte = False
                last_byte = chunk[-1]
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    stable_fields = (
        "st_dev",
        "st_ino",
        "st_mode",
        "st_nlink",
        "st_size",
        "st_mtime_ns",
        "st_ctime_ns",
    )
    if any(getattr(before, field) != getattr(after, field) for field in stable_fields):
        raise DirectTeacherHalfkpV2Error(f"{label} changed while hashing")
    if byte_count < 1 or after.st_size != byte_count:
        raise DirectTeacherHalfkpV2Error(f"{label} is empty or changed")
    if require_jsonl and last_byte != 0x0A:
        raise DirectTeacherHalfkpV2Error(f"{label} JSONL must end with LF")
    return (
        {
            "path": os.path.realpath(absolute),
            "bytes": byte_count,
            "sha256": digest.hexdigest(),
        },
        line_count if require_jsonl else None,
    )


def load_strict_json_file(
    path: str, label: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    identity, _ = stable_file_identity(path, label)
    if identity["bytes"] > _MAX_JSON_BYTES:
        raise DirectTeacherHalfkpV2Error(f"{label} is unreasonably large")
    with open(identity["path"], "rb") as source:
        raw = source.read()
    if (
        len(raw) != identity["bytes"]
        or hashlib.sha256(raw).hexdigest() != identity["sha256"]
    ):
        raise DirectTeacherHalfkpV2Error(f"{label} changed after hashing")
    return strict_json_bytes(raw, label), identity


def _exact_keys(value: Any, expected: set[str], label: str) -> Mapping[str, Any]:
    if type(value) is not dict or set(value) != expected:
        raise DirectTeacherHalfkpV2Error(f"{label} fields are not exact")
    return value


def _positive_safe_integer(value: Any, label: str) -> int:
    if type(value) is not int or value < 1 or value > 2**53 - 1:
        raise DirectTeacherHalfkpV2Error(f"{label} must be a positive safe integer")
    return value


def _identity_shape(value: Any, label: str) -> Mapping[str, Any]:
    item = _exact_keys(
        value,
        {
            "file",
            "bytes",
            "sha256",
            "rows",
            "parents",
            "games",
            "row_schema",
            *ID_SET_SHA256_FIELDS,
        },
        label,
    )
    filename = item["file"]
    if (
        type(filename) is not str
        or not filename
        or filename in (".", "..")
        or os.path.basename(filename) != filename
    ):
        raise DirectTeacherHalfkpV2Error(f"{label}.file must be a safe basename")
    for field in ("bytes", "rows", "parents", "games"):
        _positive_safe_integer(item[field], f"{label}.{field}")
    if type(item["sha256"]) is not str or SHA256_RE.fullmatch(item["sha256"]) is None:
        raise DirectTeacherHalfkpV2Error(f"{label}.sha256 is invalid")
    for field in ID_SET_SHA256_FIELDS:
        if (
            type(item[field]) is not str
            or SHA256_RE.fullmatch(item[field]) is None
        ):
            raise DirectTeacherHalfkpV2Error(f"{label}.{field} is invalid")
    if item["row_schema"] != ROW_SCHEMA:
        raise DirectTeacherHalfkpV2Error(f"{label}.row_schema mismatch")
    return item


def validate_protocol_document(value: Any) -> dict[str, Any]:
    protocol = _exact_keys(
        value,
        {
            "schema",
            "status",
            "objective",
            "claim_boundary",
            "inputs",
            "data_firewall",
            "split",
            "target",
            "training",
            "static_sanity",
            "paired_screen",
            "stop_rules",
            "current_state",
        },
        "protocol",
    )
    if protocol["schema"] != PROTOCOL_SCHEMA or protocol["status"] != PROTOCOL_STATUS:
        raise DirectTeacherHalfkpV2Error("protocol schema/status mismatch")
    if (
        type(protocol["objective"]) is not str
        or not protocol["objective"]
        or type(protocol["claim_boundary"]) is not str
        or not protocol["claim_boundary"]
    ):
        raise DirectTeacherHalfkpV2Error("protocol objective/claim boundary is empty")
    if protocol["inputs"] != EXPECTED_INPUTS:
        raise DirectTeacherHalfkpV2Error("protocol exact input bindings drifted")
    firewall = _exact_keys(
        protocol["data_firewall"],
        {
            "allowed_training_role",
            "fit_parent_membership",
            "permanent_exclusions",
            "dataset_manifest_must_prove",
            "any_overlap",
        },
        "protocol.data_firewall",
    )
    if (
        firewall["allowed_training_role"] != "direct_teacher_source v9 fit parents only"
        or firewall["fit_parent_membership"]
        != {
            "parents": 19264,
            "component_assignments_sha256": EXPECTED_INPUTS["direct_teacher_source"][
                "fit_component_assignments_sha256"
            ],
        }
        or firewall["permanent_exclusions"]
        != [
            "spent Browser tune 196 parents and their semantic positions",
            "spent V9 tune 4411 parents and their semantic positions",
            "known-eval union",
            "fresh-selection protected IDs",
            "fresh-final protected IDs",
            "prior aggregate protected union",
        ]
        or firewall["dataset_manifest_must_prove"]
        != [
            "zero excluded parent overlap",
            "zero excluded position_id overlap",
            "zero excluded child_position_id overlap",
            "zero cross-role game, parent, position, child-position, or semantic overlap",
        ]
        or firewall["any_overlap"]
        != "STOP before dataset publication or optimizer creation"
    ):
        raise DirectTeacherHalfkpV2Error("protocol data firewall drifted")
    if protocol["split"] != EXPECTED_SPLIT:
        raise DirectTeacherHalfkpV2Error("protocol split drifted")
    if protocol["target"] != EXPECTED_TARGET:
        raise DirectTeacherHalfkpV2Error("protocol target drifted")
    if protocol["training"] != EXPECTED_TRAINING:
        raise DirectTeacherHalfkpV2Error("protocol training recipe drifted")
    if protocol["static_sanity"] != EXPECTED_STATIC_SANITY:
        raise DirectTeacherHalfkpV2Error("protocol static sanity drifted")
    if protocol["paired_screen"] != EXPECTED_PAIRED_SCREEN:
        raise DirectTeacherHalfkpV2Error("protocol paired screen drifted")
    if protocol["stop_rules"] != EXPECTED_STOP_RULES:
        raise DirectTeacherHalfkpV2Error("protocol stop rules drifted")
    if protocol["current_state"] != {
        "pilot_dataset_generated": False,
        "training_started": False,
        "optimizer_created": False,
        "checkpoint_frozen": False,
        "static_sanity_executed": False,
        "paired_games": 0,
        "expanded_stage_authorized": False,
        "live_weights_changed": False,
    }:
        raise DirectTeacherHalfkpV2Error("protocol current state drifted")
    return dict(protocol)


def validate_dataset_manifest_document(
    value: Any,
    *,
    protocol: Mapping[str, Any],
    protocol_identity: Mapping[str, Any],
) -> dict[str, Any]:
    manifest = _exact_keys(
        value,
        {
            "schema",
            "status",
            "protocol",
            "source",
            "exclusions",
            "split",
            "target",
            "accounting",
            "output",
            "training_started",
            "live_weight_write_authorized",
        },
        "dataset manifest",
    )
    if (
        manifest["schema"] != DATASET_MANIFEST_SCHEMA
        or manifest["status"] != DATASET_STATUS
        or manifest["training_started"] is not False
        or manifest["live_weight_write_authorized"] is not False
    ):
        raise DirectTeacherHalfkpV2Error("dataset manifest boundary mismatch")
    expected_protocol_identity = {
        "path": protocol_identity["path"],
        "bytes": protocol_identity["bytes"],
        "sha256": protocol_identity["sha256"],
        "schema": PROTOCOL_SCHEMA,
    }
    if manifest["protocol"] != expected_protocol_identity:
        raise DirectTeacherHalfkpV2Error("dataset protocol binding mismatch")
    if manifest["source"] != protocol["inputs"]["direct_teacher_source"]:
        raise DirectTeacherHalfkpV2Error("dataset source binding mismatch")
    exclusions = _exact_keys(
        manifest["exclusions"],
        {
            "spent_tune_membership",
            "known_eval_union",
            "fresh_selection_protected",
            "fresh_final_protected",
            "prior_protected_union",
        },
        "dataset exclusions",
    )
    exclusion_bindings = {
        "spent_tune_membership": protocol["inputs"]["spent_tune_membership"],
        "known_eval_union": protocol["inputs"]["known_eval_union"],
        "fresh_selection_protected": protocol["inputs"]["fresh_selection_protected"],
        "fresh_final_protected": protocol["inputs"]["fresh_final_protected"],
        "prior_protected_union": protocol["inputs"]["prior_protected_union"],
    }
    for role, binding in exclusion_bindings.items():
        expected = {
            "binding": binding,
            "parent_overlap": 0,
            "position_overlap": 0,
            "child_position_overlap": 0,
            "semantic_overlap": 0,
        }
        if exclusions[role] != expected:
            raise DirectTeacherHalfkpV2Error(f"dataset exclusion proof drifted: {role}")
    expected_split = {
        **EXPECTED_SPLIT,
        "game_overlap": 0,
        "parent_overlap": 0,
        "position_overlap": 0,
        "child_position_overlap": 0,
        "semantic_overlap": 0,
    }
    if manifest["split"] != expected_split:
        raise DirectTeacherHalfkpV2Error("dataset split proof mismatch")
    if manifest["target"] != {
        **EXPECTED_TARGET,
        "non_cp_rows": 0,
        "neural_teacher_rows": 0,
        "outcome_target_rows": 0,
        "nonfinite_targets": 0,
        "conflicting_duplicate_child_ids": 0,
    }:
        raise DirectTeacherHalfkpV2Error("dataset target proof mismatch")
    accounting = _exact_keys(
        manifest["accounting"],
        {
            "source_fit_parents",
            "excluded_whole_games",
            "excluded_parents",
            "eligible_games",
            "eligible_parents",
            "eligible_rows",
            "training_games",
            "training_parents",
            "training_rows",
            "validation_games",
            "validation_parents",
            "validation_rows",
        },
        "dataset accounting",
    )
    for field, number in accounting.items():
        if type(number) is not int or number < 0 or number > 2**53 - 1:
            raise DirectTeacherHalfkpV2Error(
                f"dataset accounting.{field} must be a nonnegative safe integer"
            )
    if (
        accounting["source_fit_parents"]
        != protocol["inputs"]["direct_teacher_source"]["fit_parents"]
        or accounting["eligible_games"] < 2
        or accounting["eligible_parents"] < 2
        or accounting["eligible_rows"] < 2
        or accounting["training_games"] < 1
        or accounting["training_parents"] < 1
        or accounting["training_rows"] < 1
        or accounting["validation_games"] < 1
        or accounting["validation_parents"] < 1
        or accounting["validation_rows"] < 1
        or accounting["training_games"] + accounting["validation_games"]
        != accounting["eligible_games"]
        or accounting["training_parents"] + accounting["validation_parents"]
        != accounting["eligible_parents"]
        or accounting["training_rows"] + accounting["validation_rows"]
        != accounting["eligible_rows"]
    ):
        raise DirectTeacherHalfkpV2Error("dataset accounting is inconsistent")
    output = _exact_keys(
        manifest["output"], {"training", "validation"}, "dataset output"
    )
    training_output = _identity_shape(output["training"], "output.training")
    validation_output = _identity_shape(output["validation"], "output.validation")
    if training_output["file"] == validation_output["file"]:
        raise DirectTeacherHalfkpV2Error("dataset outputs must be distinct")
    for role, item in (
        ("training", training_output),
        ("validation", validation_output),
    ):
        for field in ("rows", "parents", "games"):
            if item[field] != accounting[f"{role}_{field}"]:
                raise DirectTeacherHalfkpV2Error(
                    f"output.{role}.{field} differs from accounting"
                )
    return dict(manifest)


def validate_execution_plan_document(value: Any) -> dict[str, Any]:
    plan = _exact_keys(
        value,
        {
            "schema",
            "status",
            "protocol",
            "dataset_manifest",
            "inputs",
            "training",
            "static_sanity",
            "paired_screen",
            "authority",
        },
        "execution plan",
    )
    if plan["schema"] != EXECUTION_PLAN_SCHEMA or plan["status"] != EXECUTION_STATUS:
        raise DirectTeacherHalfkpV2Error("execution plan schema/status mismatch")
    for role in ("protocol", "dataset_manifest"):
        _exact_keys(plan[role], {"path", "bytes", "sha256", "schema"}, f"plan.{role}")
    inputs = _exact_keys(
        plan["inputs"],
        {
            "initializer",
            "live_weights",
            "direct_teacher_source",
            "fresh_selection_protected",
            "fresh_final_protected",
            "spent_tune_result",
            "spent_tune_membership",
            "training_dataset",
            "validation_dataset",
        },
        "plan.inputs",
    )
    for role, identity in inputs.items():
        if type(identity) is not dict:
            raise DirectTeacherHalfkpV2Error(f"plan input is invalid: {role}")
    if plan["training"] != EXPECTED_TRAINING:
        raise DirectTeacherHalfkpV2Error("execution training recipe drifted")
    if plan["static_sanity"] != EXPECTED_STATIC_SANITY:
        raise DirectTeacherHalfkpV2Error("execution static sanity drifted")
    if plan["paired_screen"] != EXPECTED_PAIRED_SCREEN:
        raise DirectTeacherHalfkpV2Error("execution paired screen drifted")
    if plan["authority"] != {
        "data_generation_complete": True,
        "optimizer_creation_authorized": True,
        "static_sanity_authorized_after_training": True,
        "paired_screen_authorized_only_after_static_pass": True,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
    }:
        raise DirectTeacherHalfkpV2Error("execution authority drifted")
    return dict(plan)
