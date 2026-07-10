"""Strict, Torch-independent verification for sibling teacher manifests.

The teacher manifest is the commit marker for the two-file train/validation
publication.  Consumers must validate the policy and pipeline provenance and
bind both byte streams to the manifest before parsing any training rows.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
from typing import Any


TEACHER_MANIFEST_SCHEMA = "shogi-sibling-teacher-manifest-v2"
RECORD_MANIFEST_SCHEMA = "shogi-sibling-manifest-v1"
SIBLING_RECORD_SCHEMA = "shogi-sibling-v1"
VALIDATION_PARTITION_MANIFEST_SCHEMA = (
    "shogi-sibling-eval-partition-manifest-v1"
)
PARTITION_OUTPUT_FORMAT = "jsonl-original-lines-v1"
PROTECTED_POSITION_IDS_FORMAT = (
    "sorted-unique-sha256-position-id-utf8-lf-v1"
)
PARTITION_ALGORITHM = "sha256-fixed-game-quota-final-holdout-v1"
PARTITION_DOMAIN = "shogi-sibling-eval-partition-v1"
PARTITION_SEED = "wcsc36-d16-v6-eval-v1"
PARTITION_EXPECTED_SOURCE_TRAINING_GAMES = 21
PARTITION_EXPECTED_SOURCE_GAMES = 7
PARTITION_FINAL_HOLDOUT_GAMES = 3
PARTITION_RANK_ORDER = (
    "sha256-bytes-ascending-then-game-id-utf8-bytewise"
)
PARTITION_PRIORITY = "final-holdout-then-evaluation-wins"
PARTITION_DROP_UNIT = "parent-group"
PARTITION_CONFLICT_RESOLUTION = (
    "drop-conflicting-selection-and-training-parent-groups-with-"
    "holdout-then-evaluation-priority"
)
PARTITION_SEMANTIC_POSITION_SET = "position_id-union-child_position_id"
PARTITION_POLICY_EXPOSURE_POLICY = (
    "drop-parent-groups-touching-policy-parent-or-semantic-position-exposure-"
    "before-role-isolation"
)
POLICY_EXPOSED_PARENT_IDS_FORMAT = (
    "sorted-unique-sha256-parent-id-utf8-lf-v1"
)
POLICY_EXPOSED_SEMANTIC_POSITION_IDS_FORMAT = (
    "sorted-unique-sha256-position-id-utf8-lf-v1"
)
POLICY_EXPOSURE_RECEIPT_SCHEMA = "shogi-policy-exposure-receipt-v1"
FULL_TEACHER_CONTRACT = {
    "pipeline_revision": "8e376e887fac19fb31c07f147e17e84b1d5fc4b2",
    "raw_sha256": "827e912032feac9fd539af58a0e35c1131a1228abedcb1bca9c5f51f214bdfaa",
    "raw_records": 3_112,
    "selected_parents": 3_112,
    "source_games": 28,
    "selected_parent_ids_sha256": "44cb6d61a97b0ad092c96d76631683cba19f468adb054152ed94d20033ac950c",
    "engine_bin_sha256": "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1",
    "engine_bin_bytes": 700_048,
    "engine_receipt_bytes": 654,
    "engine_receipt_sha256": "a448c6be4229216665a34dbc13edf89f486364a57958ba1adad76a7b206f9c4e",
    "engine_source_commit": "9133c527791c8b2f5f378a32df29a5e3752bd41b",
    "eval_sha256": "639397609565fc2f113242503483addaf812b39c43a4d813d51b9c68ca51d568",
    "depth": 16,
    "multipv": 12,
    "parallel_engines": 12,
    "fv_scale": 20,
    "hash_mb_per_engine": 64,
    "timeout_ms": 600_000,
    "split_seed": "42",
    "val_ratio": 0.2,
    "train_game_ids_sha256": "a1f633e0937ed870b0d73cdf2496f124fb060239150e5c8567e6e20dd2cf6ff6",
    "val_game_ids_sha256": "778d7ffcd536367dcefbd1a93785c9a8c62b00504b9461a95fd1653b4fdd3b55",
}
POLICY_EXPOSURE_CONTRACT = {
    "receipt": {
        "schema": POLICY_EXPOSURE_RECEIPT_SCHEMA,
        "bytes": 4_111,
        "sha256": "083a86e48f1af134b854cdf0e505f0f39cc55ef75d5cbbc0df47c3e1c5013a6f",
    },
    "parent_ids": {
        "format": POLICY_EXPOSED_PARENT_IDS_FORMAT,
        "bytes": 7_344,
        "sha256": "2e634e5968516f243998de98c5f80d2abb674e8b9841655a3b4735df892e2d10",
        "count": 102,
        "identifiers_sha256": "77ea294f0237ca089f5fd4df64242ab9cf9f62f5a134196ac98fc9114ceebdd3",
    },
    "semantic_position_ids": {
        "format": POLICY_EXPOSED_SEMANTIC_POSITION_IDS_FORMAT,
        "bytes": 100_224,
        "sha256": "8c696e8d1d426d9efdffb112004f37a37359f22a903bc34d2c4e7621e02a6bdd",
        "count": 1_392,
        "identifiers_sha256": "31d2b9f60421f540880037efed9571bd034a986163cd79d2e51f2336544cba70",
    },
    "role_accounting": {
        "training_parents": 307,
        "training_records": 3_642,
        "selection_parents": 64,
        "selection_records": 762,
        "holdout_parents": 49,
        "holdout_records": 588,
        "unmatched_parent_ids": 7,
    },
}
LABEL_POLICY = (
    "initial-multipv-plus-played-independent-single-move-rescore-"
    "final-mate-v6"
)
EXACT_RESCORE_MODE = "independent-single-move"
SEARCH_STATE_RESET = "isready"
CANDIDATE_EXECUTION_ORDER = "utf8-bytewise-ascending"
SYNTHESIZED_RANK_ORDER = "cp-descending-then-utf8-bytewise-move"
RUNTIME_SNAPSHOT_CONTRACT = {
    "engine_binary": True,
    "engine_argument_files": "snapshotted-and-substituted",
    "eval_tree": "snapshotted",
    "eval_options_file": "rejected",
    "private_working_directory": True,
}

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_GIT_REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
_POSITION_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")


class SiblingManifestError(ValueError):
    """The manifest or one of its bound dataset files is not trustworthy."""


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise SiblingManifestError(f"manifest contains duplicate key {key!r}")
        result[key] = value
    return result


def _reject_nonstandard_number(value: str) -> None:
    raise SiblingManifestError(f"manifest contains non-standard JSON number {value}")


def _reject_nonfinite_numbers(value: Any, label: str) -> None:
    if type(value) is float and not math.isfinite(value):
        raise SiblingManifestError(f"{label} contains a non-finite JSON number")
    if type(value) is dict:
        for key, child in value.items():
            _reject_nonfinite_numbers(child, f"{label}.{key}")
    elif type(value) is list:
        for index, child in enumerate(value):
            _reject_nonfinite_numbers(child, f"{label}[{index}]")


def _read_manifest(path: str) -> tuple[dict[str, Any], int, str]:
    if not os.path.isfile(path):
        raise SiblingManifestError(f"sibling manifest does not exist: {path}")
    try:
        with open(path, "rb") as source:
            raw = source.read()
    except OSError as error:
        raise SiblingManifestError(f"cannot read sibling manifest {path}: {error}") from error
    digest = hashlib.sha256(raw).hexdigest()
    try:
        text = raw.decode("utf-8")
        value = json.loads(
            text,
            object_pairs_hook=_reject_duplicate_keys,
            parse_constant=_reject_nonstandard_number,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SiblingManifestError(f"invalid sibling manifest JSON: {error}") from error
    if type(value) is not dict:
        raise SiblingManifestError("sibling manifest root must be a JSON object")
    _reject_nonfinite_numbers(value, "manifest")
    return value, len(raw), digest


def _object(parent: dict[str, Any], field: str) -> dict[str, Any]:
    value = parent.get(field)
    if type(value) is not dict:
        raise SiblingManifestError(f"manifest {field} must be a JSON object")
    return value


def _exact(parent: dict[str, Any], field: str, expected: Any, label: str) -> None:
    value = parent.get(field)
    if type(value) is not type(expected) or value != expected:
        raise SiblingManifestError(
            f"manifest {label} must be {expected!r}, got {value!r}"
        )


def _output_contract(outputs: dict[str, Any], split: str) -> tuple[int, str]:
    bytes_field = f"{split}_bytes"
    sha_field = f"{split}_sha256"
    byte_count = outputs.get(bytes_field)
    digest = outputs.get(sha_field)
    if type(byte_count) is not int or byte_count < 0:
        raise SiblingManifestError(
            f"manifest outputs.{bytes_field} must be a non-negative integer"
        )
    if not isinstance(digest, str) or _SHA256_RE.fullmatch(digest) is None:
        raise SiblingManifestError(
            f"manifest outputs.{sha_field} must be a lowercase SHA-256 digest"
        )
    return byte_count, digest


def _lower_sha256(value: Any, label: str) -> str:
    if not isinstance(value, str) or _SHA256_RE.fullmatch(value) is None:
        raise SiblingManifestError(f"manifest {label} must be a lowercase SHA-256 digest")
    return value


def _nonnegative_integer(value: Any, label: str) -> int:
    if type(value) is not int or value < 0:
        raise SiblingManifestError(f"manifest {label} must be a non-negative integer")
    return value


def _positive_integer(value: Any, label: str) -> int:
    if type(value) is not int or value <= 0:
        raise SiblingManifestError(f"manifest {label} must be a positive integer")
    return value


def _partition_file_output(
    outputs: dict[str, Any],
    field: str,
    *,
    expected_format: str,
    dataset: bool,
) -> dict[str, Any]:
    value = _object(outputs, field)
    expected_keys = (
        {
            "format",
            "bytes",
            "sha256",
            "records",
            "parents",
            "games",
            "game_ids_sha256",
            "semantic_position_ids_count",
            "semantic_position_ids_sha256",
        }
        if dataset
        else {"format", "bytes", "sha256", "count"}
    )
    if set(value) != expected_keys:
        raise SiblingManifestError(
            f"manifest outputs.{field} must contain exactly "
            + "/".join(sorted(expected_keys))
        )
    _exact(value, "format", expected_format, f"outputs.{field}.format")
    _nonnegative_integer(value.get("bytes"), f"outputs.{field}.bytes")
    _lower_sha256(value.get("sha256"), f"outputs.{field}.sha256")
    if dataset:
        _positive_integer(value.get("records"), f"outputs.{field}.records")
        _positive_integer(value.get("parents"), f"outputs.{field}.parents")
        _positive_integer(value.get("games"), f"outputs.{field}.games")
        _lower_sha256(
            value.get("game_ids_sha256"),
            f"outputs.{field}.game_ids_sha256",
        )
        _positive_integer(
            value.get("semantic_position_ids_count"),
            f"outputs.{field}.semantic_position_ids_count",
        )
        _lower_sha256(
            value.get("semantic_position_ids_sha256"),
            f"outputs.{field}.semantic_position_ids_sha256",
        )
    else:
        _positive_integer(value.get("count"), f"outputs.{field}.count")
    return dict(value)


def _file_digest_contract(value: Any, label: str) -> None:
    if type(value) is not dict:
        raise SiblingManifestError(f"manifest {label} must be a JSON object")
    if set(value) != {"path", "bytes", "sha256"}:
        raise SiblingManifestError(
            f"manifest {label} must contain exactly path/bytes/sha256"
        )
    path = value.get("path")
    byte_count = value.get("bytes")
    digest = value.get("sha256")
    if not isinstance(path, str) or not path.strip() or path != path.strip():
        raise SiblingManifestError(f"manifest {label}.path must be a non-empty string")
    if type(byte_count) is not int or byte_count < 0:
        raise SiblingManifestError(
            f"manifest {label}.bytes must be a non-negative integer"
        )
    if not isinstance(digest, str) or _SHA256_RE.fullmatch(digest) is None:
        raise SiblingManifestError(
            f"manifest {label}.sha256 must be a lowercase SHA-256 digest"
        )


def _canonical_json(value: Any) -> str:
    """Match the generator's canonicalJson for manifest-safe JSON values."""
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def eval_tree_sha256(eval_files: list[dict[str, Any]]) -> str:
    payload = "eval-tree-v1\0" + "\n".join(
        _canonical_json(file_digest) for file_digest in eval_files
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _validate_contract(manifest: dict[str, Any]) -> dict[str, tuple[int, str]]:
    _exact(manifest, "schema", TEACHER_MANIFEST_SCHEMA, "schema")
    _exact(
        manifest,
        "record_manifest_schema",
        RECORD_MANIFEST_SCHEMA,
        "record_manifest_schema",
    )

    search = _object(manifest, "search")
    _exact(search, "label_policy", LABEL_POLICY, "search.label_policy")
    _exact(
        search,
        "exact_rescore_mode",
        EXACT_RESCORE_MODE,
        "search.exact_rescore_mode",
    )
    _exact(
        search,
        "search_state_reset_before_proposal",
        SEARCH_STATE_RESET,
        "search.search_state_reset_before_proposal",
    )
    _exact(
        search,
        "search_state_reset_before_each_candidate",
        SEARCH_STATE_RESET,
        "search.search_state_reset_before_each_candidate",
    )
    _exact(
        search,
        "tt_reset_before_proposal",
        True,
        "search.tt_reset_before_proposal",
    )
    _exact(
        search,
        "tt_reset_before_each_candidate",
        True,
        "search.tt_reset_before_each_candidate",
    )
    _exact(
        search,
        "candidate_execution_order",
        CANDIDATE_EXECUTION_ORDER,
        "search.candidate_execution_order",
    )
    _exact(
        search,
        "synthesized_rank_order",
        SYNTHESIZED_RANK_ORDER,
        "search.synthesized_rank_order",
    )

    teacher = _object(manifest, "teacher")
    engine_bin_sha256 = teacher.get("engine_bin_sha256")
    if not isinstance(engine_bin_sha256, str) or _SHA256_RE.fullmatch(
        engine_bin_sha256
    ) is None:
        raise SiblingManifestError(
            "manifest teacher.engine_bin_sha256 must be a lowercase SHA-256 digest"
        )
    if type(teacher.get("engine_bin_bytes")) is not int or teacher["engine_bin_bytes"] <= 0:
        raise SiblingManifestError(
            "manifest teacher.engine_bin_bytes must be a positive integer"
        )
    engine_args = teacher.get("engine_args")
    if not isinstance(engine_args, list) or any(
        not isinstance(argument, str) for argument in engine_args
    ):
        raise SiblingManifestError("manifest teacher.engine_args must be a string array")
    engine_arg_files = teacher.get("engine_arg_files")
    if not isinstance(engine_arg_files, list):
        raise SiblingManifestError(
            "manifest teacher.engine_arg_files must be an array"
        )
    for index, file_digest in enumerate(engine_arg_files):
        _file_digest_contract(
            file_digest,
            f"teacher.engine_arg_files[{index}]",
        )
    eval_files = teacher.get("eval_files")
    if not isinstance(eval_files, list):
        raise SiblingManifestError("manifest teacher.eval_files must be an array")
    for index, file_digest in enumerate(eval_files):
        _file_digest_contract(file_digest, f"teacher.eval_files[{index}]")

    runtime_snapshot = _object(teacher, "runtime_snapshot")
    for field, expected in RUNTIME_SNAPSHOT_CONTRACT.items():
        _exact(
            runtime_snapshot,
            field,
            expected,
            f"teacher.runtime_snapshot.{field}",
        )
    engine_argument_file_count = runtime_snapshot.get("engine_argument_file_count")
    if type(engine_argument_file_count) is not int or engine_argument_file_count < 0:
        raise SiblingManifestError(
            "manifest teacher.runtime_snapshot.engine_argument_file_count "
            "must be a non-negative integer"
        )
    if engine_argument_file_count != len(engine_arg_files):
        raise SiblingManifestError(
            "manifest teacher.runtime_snapshot.engine_argument_file_count "
            "does not match teacher.engine_arg_files"
        )
    eval_tree_present = runtime_snapshot.get("eval_tree_present")
    if type(eval_tree_present) is not bool:
        raise SiblingManifestError(
            "manifest teacher.runtime_snapshot.eval_tree_present must be a boolean"
        )
    eval_sha256 = teacher.get("eval_sha256")
    if eval_tree_present:
        if not eval_files:
            raise SiblingManifestError(
                "manifest present eval tree must contain at least one eval file"
            )
        if not isinstance(eval_sha256, str) or _SHA256_RE.fullmatch(eval_sha256) is None:
            raise SiblingManifestError(
                "manifest teacher.eval_sha256 must bind the present eval tree"
            )
        expected_eval_sha256 = eval_tree_sha256(eval_files)
        if eval_sha256 != expected_eval_sha256:
            raise SiblingManifestError(
                "manifest teacher.eval_sha256 does not match teacher.eval_files"
            )
    elif eval_sha256 is not None or eval_files:
        raise SiblingManifestError(
            "manifest absent eval tree must have eval_sha256=null and no eval_files"
        )

    pipeline = _object(manifest, "pipeline")
    revision = pipeline.get("source_revision")
    if not isinstance(revision, str) or _GIT_REVISION_RE.fullmatch(revision) is None:
        raise SiblingManifestError(
            "manifest pipeline.source_revision must be a lowercase 40-digit Git commit"
        )
    if pipeline.get("tracked_tree_clean") is not True:
        raise SiblingManifestError(
            "manifest pipeline.tracked_tree_clean must be exactly true"
        )

    outputs = _object(manifest, "outputs")
    return {
        "train": _output_contract(outputs, "train"),
        "val": _output_contract(outputs, "val"),
    }


def _exact_keys(value: dict[str, Any], fields: set[str], label: str) -> None:
    if set(value) != fields:
        raise SiblingManifestError(
            f"manifest {label} must contain exactly {'/'.join(sorted(fields))}"
        )


def _required_text(value: Any, label: str) -> str:
    if type(value) is not str or not value.strip() or value != value.strip():
        raise SiblingManifestError(f"manifest {label} must be a non-empty string")
    return value


def _validate_full_teacher_contract(manifest: dict[str, Any]) -> None:
    """Pin the partition input to a completed 3,112-parent full teacher run."""
    contract = FULL_TEACHER_CONTRACT
    _exact_keys(
        manifest,
        {
            "schema",
            "record_manifest_schema",
            "pipeline",
            "source",
            "teacher",
            "search",
            "candidate_sets",
            "progress_checkpoint",
            "split",
            "outputs",
        },
        "base teacher manifest",
    )

    pipeline = _object(manifest, "pipeline")
    _exact_keys(pipeline, {"source_revision", "tracked_tree_clean"}, "pipeline")
    _exact(pipeline, "source_revision", contract["pipeline_revision"], "pipeline.source_revision")
    _exact(pipeline, "tracked_tree_clean", True, "pipeline.tracked_tree_clean")

    source = _object(manifest, "source")
    _exact_keys(
        source,
        {"raw_sha256", "raw_records", "selected_parents", "selected_parent_ids_sha256"},
        "source",
    )
    _exact(source, "raw_sha256", contract["raw_sha256"], "source.raw_sha256")
    _exact(source, "raw_records", contract["raw_records"], "source.raw_records")
    _exact(source, "selected_parents", contract["selected_parents"], "source.selected_parents")
    _exact(
        source,
        "selected_parent_ids_sha256",
        contract["selected_parent_ids_sha256"],
        "source.selected_parent_ids_sha256",
    )

    teacher = _object(manifest, "teacher")
    _exact_keys(
        teacher,
        {
            "engine_bin_sha256",
            "engine_bin_bytes",
            "engine_args",
            "engine_arg_files",
            "engine_receipt",
            "eval_sha256",
            "eval_files",
            "runtime_snapshot",
        },
        "teacher",
    )
    _exact(teacher, "engine_bin_sha256", contract["engine_bin_sha256"], "teacher.engine_bin_sha256")
    engine_bytes = _positive_integer(teacher.get("engine_bin_bytes"), "teacher.engine_bin_bytes")
    _exact(teacher, "engine_bin_bytes", contract["engine_bin_bytes"], "teacher.engine_bin_bytes")
    _exact(teacher, "engine_args", [], "teacher.engine_args")
    _exact(teacher, "engine_arg_files", [], "teacher.engine_arg_files")
    receipt = _object(teacher, "engine_receipt")
    _exact_keys(receipt, {"file", "content"}, "teacher.engine_receipt")
    _file_digest_contract(receipt.get("file"), "teacher.engine_receipt.file")
    receipt_file = receipt["file"]
    _exact(
        receipt_file,
        "bytes",
        contract["engine_receipt_bytes"],
        "teacher.engine_receipt.file.bytes",
    )
    _exact(
        receipt_file,
        "sha256",
        contract["engine_receipt_sha256"],
        "teacher.engine_receipt.file.sha256",
    )
    receipt_content = _object(receipt, "content")
    receipt_fields = {
        "schema",
        "source_repository",
        "source_commit",
        "source_commit_date",
        "build_directory",
        "build_command",
        "compiler",
        "compiler_target",
        "engine_id",
        "binary_bytes",
        "binary_sha256",
    }
    _exact_keys(receipt_content, receipt_fields, "teacher.engine_receipt.content")
    _exact(
        receipt_content,
        "schema",
        "shogi-teacher-engine-receipt-v1",
        "teacher.engine_receipt.content.schema",
    )
    for field in receipt_fields - {"schema", "binary_bytes", "binary_sha256"}:
        _required_text(receipt_content.get(field), f"teacher.engine_receipt.content.{field}")
    _exact(
        receipt_content,
        "source_commit",
        contract["engine_source_commit"],
        "teacher.engine_receipt.content.source_commit",
    )
    _exact(receipt_content, "binary_bytes", engine_bytes, "teacher.engine_receipt.content.binary_bytes")
    _exact(
        receipt_content,
        "binary_sha256",
        contract["engine_bin_sha256"],
        "teacher.engine_receipt.content.binary_sha256",
    )
    _exact(teacher, "eval_sha256", contract["eval_sha256"], "teacher.eval_sha256")
    eval_files = teacher.get("eval_files")
    if type(eval_files) is not list or len(eval_files) != 1:
        raise SiblingManifestError("manifest teacher.eval_files must contain exactly one file")
    _file_digest_contract(eval_files[0], "teacher.eval_files[0]")
    if eval_tree_sha256(eval_files) != contract["eval_sha256"]:
        raise SiblingManifestError("manifest teacher.eval_files do not match pinned eval tree")
    runtime = _object(teacher, "runtime_snapshot")
    _exact_keys(
        runtime,
        set(RUNTIME_SNAPSHOT_CONTRACT) | {"engine_argument_file_count", "eval_tree_present"},
        "teacher.runtime_snapshot",
    )
    for field, expected in RUNTIME_SNAPSHOT_CONTRACT.items():
        _exact(runtime, field, expected, f"teacher.runtime_snapshot.{field}")
    _exact(runtime, "engine_argument_file_count", 0, "teacher.runtime_snapshot.engine_argument_file_count")
    _exact(runtime, "eval_tree_present", True, "teacher.runtime_snapshot.eval_tree_present")

    search = _object(manifest, "search")
    _exact_keys(
        search,
        {
            "multipv",
            "limit",
            "parallel_engines",
            "fv_scale",
            "hash_mb_per_engine",
            "timeout_ms",
            "exact_rescore_mode",
            "label_policy",
            "tt_reset_before_proposal",
            "tt_reset_before_each_candidate",
            "search_state_reset_before_proposal",
            "search_state_reset_before_each_candidate",
            "candidate_execution_order",
            "synthesized_rank_order",
            "engine_options",
        },
        "search",
    )
    for field in (
        "multipv",
        "parallel_engines",
        "fv_scale",
        "hash_mb_per_engine",
        "timeout_ms",
    ):
        _exact(search, field, contract[field], f"search.{field}")
    limit = _object(search, "limit")
    _exact_keys(limit, {"depth"}, "search.limit")
    _exact(limit, "depth", contract["depth"], "search.limit.depth")
    for field, expected in (
        ("exact_rescore_mode", EXACT_RESCORE_MODE),
        ("label_policy", LABEL_POLICY),
        ("tt_reset_before_proposal", True),
        ("tt_reset_before_each_candidate", True),
        ("search_state_reset_before_proposal", SEARCH_STATE_RESET),
        ("search_state_reset_before_each_candidate", SEARCH_STATE_RESET),
        ("candidate_execution_order", CANDIDATE_EXECUTION_ORDER),
        ("synthesized_rank_order", SYNTHESIZED_RANK_ORDER),
    ):
        _exact(search, field, expected, f"search.{field}")
    engine_options = _object(search, "engine_options")
    expected_options = {
        "threads": 1,
        "usi_own_book": False,
        "book_file": "no_book",
        "network_delay_ms": 0,
        "network_delay2_ms": 0,
        "search_state_reset_trigger": "isready",
    }
    _exact_keys(engine_options, set(expected_options), "search.engine_options")
    for field, expected in expected_options.items():
        _exact(engine_options, field, expected, f"search.engine_options.{field}")

    candidate_sets = _object(manifest, "candidate_sets")
    _exact_keys(
        candidate_sets,
        {"sha256", "parents", "candidates", "min_candidates", "max_candidates", "skipped_parents"},
        "candidate_sets",
    )
    _lower_sha256(candidate_sets.get("sha256"), "candidate_sets.sha256")
    candidate_parents = _positive_integer(candidate_sets.get("parents"), "candidate_sets.parents")
    candidates = _positive_integer(candidate_sets.get("candidates"), "candidate_sets.candidates")
    minimum = _positive_integer(candidate_sets.get("min_candidates"), "candidate_sets.min_candidates")
    maximum = _positive_integer(candidate_sets.get("max_candidates"), "candidate_sets.max_candidates")
    skipped = _nonnegative_integer(candidate_sets.get("skipped_parents"), "candidate_sets.skipped_parents")
    if (
        minimum < 2
        or maximum < minimum
        or not candidate_parents * minimum <= candidates <= candidate_parents * maximum
        or candidate_parents + skipped != contract["selected_parents"]
    ):
        raise SiblingManifestError("manifest candidate-set accounting is inconsistent")

    progress = _object(manifest, "progress_checkpoint")
    _exact_keys(
        progress,
        {"schema", "run_fingerprint", "entries", "completed_parents", "skipped_parents", "sha256"},
        "progress_checkpoint",
    )
    _exact(progress, "schema", "shogi-sibling-teacher-work-v2", "progress_checkpoint.schema")
    _lower_sha256(progress.get("run_fingerprint"), "progress_checkpoint.run_fingerprint")
    _lower_sha256(progress.get("sha256"), "progress_checkpoint.sha256")
    entries = _positive_integer(progress.get("entries"), "progress_checkpoint.entries")
    completed = _positive_integer(progress.get("completed_parents"), "progress_checkpoint.completed_parents")
    progress_skipped = _nonnegative_integer(progress.get("skipped_parents"), "progress_checkpoint.skipped_parents")
    if (
        entries != contract["selected_parents"]
        or completed != candidate_parents
        or progress_skipped != skipped
        or completed + progress_skipped != entries
    ):
        raise SiblingManifestError("manifest progress checkpoint is incomplete")

    split = _object(manifest, "split")
    _exact_keys(
        split,
        {"schema", "record_schema", "schema_version", "split_seed", "val_ratio", "train_game_ids_sha256", "val_game_ids_sha256", "stats"},
        "split",
    )
    _exact(split, "schema", RECORD_MANIFEST_SCHEMA, "split.schema")
    _exact(split, "record_schema", SIBLING_RECORD_SCHEMA, "split.record_schema")
    _exact(split, "schema_version", 1, "split.schema_version")
    _exact(split, "split_seed", contract["split_seed"], "split.split_seed")
    _exact(split, "val_ratio", contract["val_ratio"], "split.val_ratio")
    _exact(
        split,
        "train_game_ids_sha256",
        contract["train_game_ids_sha256"],
        "split.train_game_ids_sha256",
    )
    _exact(
        split,
        "val_game_ids_sha256",
        contract["val_game_ids_sha256"],
        "split.val_game_ids_sha256",
    )
    stats = _object(split, "stats")
    stats_fields = {
        "input_records", "output_records", "input_parents", "output_parents", "input_games",
        "train_records", "val_records", "train_parents", "val_parents", "train_games", "val_games",
        "val_position_priority_dropped_records", "val_position_priority_dropped_parents",
        "val_child_position_priority_dropped_records", "val_child_position_priority_dropped_parents",
        "game_overlap", "position_overlap", "child_position_overlap",
    }
    _exact_keys(stats, stats_fields, "split.stats")
    parsed = {field: _nonnegative_integer(stats.get(field), f"split.stats.{field}") for field in stats_fields}
    if (
        parsed["input_records"] != candidates
        or parsed["input_parents"] != candidate_parents
        or parsed["input_games"] != contract["source_games"]
        or parsed["output_records"] != parsed["train_records"] + parsed["val_records"]
        or parsed["output_parents"] != parsed["train_parents"] + parsed["val_parents"]
        or parsed["train_games"] != PARTITION_EXPECTED_SOURCE_TRAINING_GAMES
        or parsed["val_games"] != PARTITION_EXPECTED_SOURCE_GAMES
        or parsed["input_records"] - parsed["output_records"]
        != parsed["val_position_priority_dropped_records"] + parsed["val_child_position_priority_dropped_records"]
        or parsed["input_parents"] - parsed["output_parents"]
        != parsed["val_position_priority_dropped_parents"] + parsed["val_child_position_priority_dropped_parents"]
        or any(parsed[field] != 0 for field in ("game_overlap", "position_overlap", "child_position_overlap"))
    ):
        raise SiblingManifestError("manifest split accounting is inconsistent")

    outputs = _object(manifest, "outputs")
    _exact_keys(outputs, {"train_sha256", "val_sha256", "train_bytes", "val_bytes"}, "outputs")
    for split_name in ("train", "val"):
        _lower_sha256(outputs.get(f"{split_name}_sha256"), f"outputs.{split_name}_sha256")
        _positive_integer(outputs.get(f"{split_name}_bytes"), f"outputs.{split_name}_bytes")


def _teacher_split_summary(
    manifest: dict[str, Any], split_name: str
) -> dict[str, Any]:
    """Validate fields binding one complete base train/val publication."""
    if split_name not in ("train", "val"):
        raise ValueError(f"unsupported teacher split summary: {split_name}")
    split = _object(manifest, "split")
    _exact(split, "schema", RECORD_MANIFEST_SCHEMA, "split.schema")
    _exact(split, "record_schema", SIBLING_RECORD_SCHEMA, "split.record_schema")
    _exact(split, "schema_version", 1, "split.schema_version")
    game_ids_sha256 = _lower_sha256(
        split.get(f"{split_name}_game_ids_sha256"),
        f"split.{split_name}_game_ids_sha256",
    )
    stats = _object(split, "stats")
    records = _positive_integer(
        stats.get(f"{split_name}_records"),
        f"split.stats.{split_name}_records",
    )
    parents = _positive_integer(
        stats.get(f"{split_name}_parents"),
        f"split.stats.{split_name}_parents",
    )
    games = _positive_integer(
        stats.get(f"{split_name}_games"),
        f"split.stats.{split_name}_games",
    )
    for field in ("game_overlap", "position_overlap", "child_position_overlap"):
        _exact(stats, field, 0, f"split.stats.{field}")
    return {
        "bytes": manifest["outputs"][f"{split_name}_bytes"],
        "sha256": manifest["outputs"][f"{split_name}_sha256"],
        "records": records,
        "parents": parents,
        "games": games,
        "game_ids_sha256": game_ids_sha256,
    }


def _teacher_validation_summary(manifest: dict[str, Any]) -> dict[str, Any]:
    return _teacher_split_summary(manifest, "val")


def _teacher_provenance(
    manifest_path: str,
    manifest: dict[str, Any],
    manifest_bytes: int,
    manifest_sha256: str,
    verified_splits: list[str],
) -> dict[str, Any]:
    search = manifest["search"]
    pipeline = manifest["pipeline"]
    runtime_snapshot = manifest["teacher"]["runtime_snapshot"]
    outputs = manifest["outputs"]
    return {
        "path": os.path.abspath(manifest_path),
        "bytes": manifest_bytes,
        "sha256": manifest_sha256,
        "schema": TEACHER_MANIFEST_SCHEMA,
        "record_manifest_schema": RECORD_MANIFEST_SCHEMA,
        "verified_splits": verified_splits,
        "label_policy": search["label_policy"],
        "exact_rescore_mode": search["exact_rescore_mode"],
        "search_state_reset_before_proposal": search[
            "search_state_reset_before_proposal"
        ],
        "search_state_reset_before_each_candidate": search[
            "search_state_reset_before_each_candidate"
        ],
        "tt_reset_before_proposal": True,
        "tt_reset_before_each_candidate": True,
        "candidate_execution_order": search["candidate_execution_order"],
        "synthesized_rank_order": search["synthesized_rank_order"],
        "teacher_runtime_snapshot": {
            **RUNTIME_SNAPSHOT_CONTRACT,
            "engine_argument_file_count": runtime_snapshot[
                "engine_argument_file_count"
            ],
            "eval_tree_present": runtime_snapshot["eval_tree_present"],
        },
        "pipeline": {
            "source_revision": pipeline["source_revision"],
            "tracked_tree_clean": True,
        },
        "outputs": {
            "train_bytes": outputs["train_bytes"],
            "train_sha256": outputs["train_sha256"],
            "val_bytes": outputs["val_bytes"],
            "val_sha256": outputs["val_sha256"],
        },
    }


def _file_digest(path: str, label: str) -> tuple[int, str]:
    if not os.path.isfile(path):
        raise SiblingManifestError(f"{label} dataset does not exist: {path}")
    digest = hashlib.sha256()
    byte_count = 0
    try:
        with open(path, "rb") as source:
            while True:
                block = source.read(1024 * 1024)
                if not block:
                    break
                byte_count += len(block)
                digest.update(block)
    except OSError as error:
        raise SiblingManifestError(f"cannot read {label} dataset {path}: {error}") from error
    return byte_count, digest.hexdigest()


def verify_sibling_manifest(
    manifest_path: str,
    *,
    train_path: str | None = None,
    val_path: str | None = None,
) -> dict[str, Any]:
    """Validate a v6-policy teacher manifest and bind requested dataset files.

    Sealed training passes only ``train_path`` and binds model selection through
    :func:`verify_sibling_validation_partition`; base-only legacy evaluation may
    pass ``val_path``.  The returned mapping is safe to persist in artifacts.
    """
    if train_path is None and val_path is None:
        raise SiblingManifestError("at least one sibling dataset path must be verified")
    manifest, manifest_bytes, manifest_sha256 = _read_manifest(manifest_path)
    expected_outputs = _validate_contract(manifest)

    requested = (("train", train_path), ("val", val_path))
    verified_splits: list[str] = []
    mismatches: list[str] = []
    for split, path in requested:
        if path is None:
            continue
        verified_splits.append(split)
        actual_bytes, actual_sha256 = _file_digest(path, split)
        expected_bytes, expected_sha256 = expected_outputs[split]
        if actual_bytes != expected_bytes:
            mismatches.append(
                f"outputs.{split}_bytes expected {expected_bytes}, got {actual_bytes}"
            )
        if actual_sha256 != expected_sha256:
            mismatches.append(
                f"outputs.{split}_sha256 expected {expected_sha256}, got {actual_sha256}"
            )
    if mismatches:
        raise SiblingManifestError(
            "sibling manifest dataset binding failed: " + "; ".join(mismatches)
        )

    return _teacher_provenance(
        manifest_path,
        manifest,
        manifest_bytes,
        manifest_sha256,
        verified_splits,
    )


def load_protected_position_ids(
    path: str,
    *,
    expected: dict[str, Any] | None = None,
) -> tuple[set[str], dict[str, Any]]:
    """Load one exact, sorted semantic-position exclusion set."""
    if not os.path.isfile(path):
        raise SiblingManifestError(f"protected position-id file does not exist: {path}")
    try:
        with open(path, "rb") as source:
            raw = source.read()
    except OSError as error:
        raise SiblingManifestError(
            f"cannot read protected position-id file {path}: {error}"
        ) from error
    fingerprint = {
        "path": os.path.abspath(path),
        "format": PROTECTED_POSITION_IDS_FORMAT,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    if expected is not None:
        for field in ("format", "bytes", "sha256"):
            if type(fingerprint[field]) is not type(expected.get(field)) or fingerprint[
                field
            ] != expected.get(field):
                raise SiblingManifestError(
                    f"protected position-id file {field} does not match partition manifest"
                )
    if not raw or not raw.endswith(b"\n") or b"\r" in raw:
        raise SiblingManifestError(
            "protected position-id file must be non-empty LF-terminated UTF-8"
        )
    try:
        lines = raw[:-1].decode("utf-8").split("\n")
    except UnicodeDecodeError as error:
        raise SiblingManifestError(
            f"protected position-id file is not UTF-8: {error}"
        ) from error
    if any(not line or _POSITION_ID_RE.fullmatch(line) is None for line in lines):
        raise SiblingManifestError(
            "protected position-id file contains an invalid semantic position ID"
        )
    encoded = [line.encode("utf-8") for line in lines]
    if encoded != sorted(encoded) or len(set(lines)) != len(lines):
        raise SiblingManifestError(
            "protected position-id file must be sorted and unique bytewise"
        )
    if expected is not None and (
        type(expected.get("count")) is not int or len(lines) != expected["count"]
    ):
        raise SiblingManifestError(
            "protected position-id file count does not match partition manifest"
        )
    fingerprint["count"] = len(lines)
    return set(lines), fingerprint


def _load_policy_identifier_ids(
    path: str,
    *,
    expected: dict[str, Any],
    contract: dict[str, Any],
    label: str,
) -> tuple[set[str], dict[str, Any]]:
    """Load one receipt-bound, bytewise-sorted policy exposure ID set."""
    try:
        with open(path, "rb") as source:
            raw = source.read()
    except OSError as error:
        raise SiblingManifestError(
            f"cannot read {label} {path}: {error}"
        ) from error
    fingerprint = {
        "path": os.path.abspath(path),
        "format": contract["format"],
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    for field in ("format", "bytes", "sha256"):
        if fingerprint[field] != contract[field]:
            raise SiblingManifestError(
                f"{label} bytes do not match the pinned policy exposure"
            )
    for field, value in contract.items():
        if type(expected.get(field)) is not type(value) or expected.get(field) != value:
            raise SiblingManifestError(
                f"partition source {label}.{field} mismatch"
            )
    if not raw or not raw.endswith(b"\n") or b"\r" in raw:
        raise SiblingManifestError(
            f"{label} must be non-empty LF-terminated UTF-8"
        )
    try:
        lines = raw[:-1].decode("utf-8", errors="strict").split("\n")
    except UnicodeDecodeError as error:
        raise SiblingManifestError(
            f"{label} are not UTF-8: {error}"
        ) from error
    if any(not line or _POSITION_ID_RE.fullmatch(line) is None for line in lines):
        raise SiblingManifestError(f"{label} contain an invalid identifier")
    if lines != sorted(lines, key=lambda value: value.encode("utf-8")) or len(set(lines)) != len(lines):
        raise SiblingManifestError(f"{label} must be sorted and unique")
    identifiers_sha256 = hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()
    if len(lines) != contract["count"] or identifiers_sha256 != contract["identifiers_sha256"]:
        raise SiblingManifestError(f"{label} set identity mismatch")
    fingerprint.update({"count": len(lines), "identifiers_sha256": identifiers_sha256})
    return set(lines), fingerprint


def load_policy_exposed_parent_ids(
    path: str, *, expected: dict[str, Any]
) -> tuple[set[str], dict[str, Any]]:
    return _load_policy_identifier_ids(
        path,
        expected=expected,
        contract=POLICY_EXPOSURE_CONTRACT["parent_ids"],
        label="policy-exposed parent IDs",
    )


def load_policy_exposed_semantic_position_ids(
    path: str, *, expected: dict[str, Any]
) -> tuple[set[str], dict[str, Any]]:
    return _load_policy_identifier_ids(
        path,
        expected=expected,
        contract=POLICY_EXPOSURE_CONTRACT["semantic_position_ids"],
        label="policy-exposed semantic position IDs",
    )


def load_policy_exposure_receipt(
    path: str, *, expected: dict[str, Any]
) -> dict[str, Any]:
    """Validate the exact receipt and reject an unpinned role audit."""
    receipt, byte_count, digest = _read_manifest(path)
    contract = POLICY_EXPOSURE_CONTRACT
    for field, actual in (
        ("schema", receipt.get("schema")),
        ("bytes", byte_count),
        ("sha256", digest),
    ):
        wanted = contract["receipt"][field]
        if type(actual) is not type(wanted) or actual != wanted:
            raise SiblingManifestError(
                f"policy-exposure receipt {field} does not match pinned contract"
            )
        if type(expected.get(field)) is not type(wanted) or expected.get(field) != wanted:
            raise SiblingManifestError(
                f"partition source.policy_exposure_receipt.{field} mismatch"
            )
    expected_keys = {
        "schema",
        "policy_decision",
        "derivation",
        "parent_ids",
        "semantic_position_ids",
        "source_artifacts",
        "role_accounting",
    }
    _exact_keys(receipt, expected_keys, "policy-exposure receipt")
    _exact(
        receipt,
        "policy_decision",
        "wcsc36-depth16-lane-a-v1",
        "policy-exposure receipt.policy_decision",
    )
    _exact(
        receipt,
        "derivation",
        "union-of-position-id-and-child-position-id-from-all-committed-parent-records",
        "policy-exposure receipt.derivation",
    )
    if contract["role_accounting"] is None or receipt.get("role_accounting") is None:
        raise SiblingManifestError(
            "policy-exposure role accounting is not pinned; partition publication is sealed"
        )
    if receipt["role_accounting"] != contract["role_accounting"]:
        raise SiblingManifestError("policy-exposure role accounting mismatch")
    return receipt


def _identifier_set_sha256(values: set[str]) -> str:
    return hashlib.sha256("\n".join(sorted(values)).encode("utf-8")).hexdigest()


def _scan_partition_jsonl(
    path: str,
    label: str,
    *,
    expected_split: str,
    expected: dict[str, Any],
) -> dict[str, Any]:
    """Strict-parse and hash exactly the same binary JSONL pass."""
    digest = hashlib.sha256()
    byte_count = 0
    records = 0
    game_ids: set[str] = set()
    parent_ids: set[str] = set()
    position_ids: set[str] = set()
    child_position_ids: set[str] = set()
    try:
        with open(path, "rb") as source:
            for line_number, raw_line in enumerate(source, start=1):
                digest.update(raw_line)
                byte_count += len(raw_line)
                if not raw_line.endswith(b"\n") or b"\r" in raw_line:
                    raise SiblingManifestError(
                        f"{label} line {line_number} must be LF-terminated without CR"
                    )
                json_bytes = raw_line[:-1]
                if not json_bytes.strip():
                    raise SiblingManifestError(f"{label} line {line_number} is blank")
                try:
                    text = json_bytes.decode("utf-8", errors="strict")
                    record = json.loads(
                        text,
                        object_pairs_hook=_reject_duplicate_keys,
                        parse_constant=_reject_nonstandard_number,
                    )
                except (UnicodeDecodeError, json.JSONDecodeError) as error:
                    raise SiblingManifestError(
                        f"{label} line {line_number} is invalid strict JSON: {error}"
                    ) from error
                _reject_nonfinite_numbers(record, f"{label} line {line_number}")
                if type(record) is not dict:
                    raise SiblingManifestError(f"{label} line {line_number} must be an object")
                if record.get("schema") != SIBLING_RECORD_SCHEMA or record.get("schema_version") != 1:
                    raise SiblingManifestError(f"{label} line {line_number} has wrong schema")
                if record.get("split") != expected_split:
                    raise SiblingManifestError(
                        f"{label} line {line_number} must have split={expected_split}"
                    )
                identifiers = {}
                for field in ("game_id", "parent_id", "position_id", "child_position_id"):
                    value = record.get(field)
                    if type(value) is not str or not value:
                        raise SiblingManifestError(
                            f"{label} line {line_number} has invalid {field}"
                        )
                    identifiers[field] = value
                for field in ("parent_id", "position_id", "child_position_id"):
                    if _POSITION_ID_RE.fullmatch(identifiers[field]) is None:
                        raise SiblingManifestError(
                            f"{label} line {line_number} has malformed {field}"
                        )
                game_ids.add(identifiers["game_id"])
                parent_ids.add(identifiers["parent_id"])
                position_ids.add(identifiers["position_id"])
                child_position_ids.add(identifiers["child_position_id"])
                records += 1
    except OSError as error:
        raise SiblingManifestError(f"cannot read {label} {path}: {error}") from error
    semantic_position_ids = position_ids | child_position_ids
    summary = {
        "bytes": byte_count,
        "sha256": digest.hexdigest(),
        "records": records,
        "parents": len(parent_ids),
        "games": len(game_ids),
        "game_ids_sha256": _identifier_set_sha256(game_ids),
        "semantic_position_ids_count": len(semantic_position_ids),
        "semantic_position_ids_sha256": _identifier_set_sha256(
            semantic_position_ids
        ),
    }
    for field, actual in summary.items():
        if field.startswith("semantic_position_ids_") and field not in expected:
            continue
        wanted = expected.get(field)
        if type(actual) is not type(wanted) or actual != wanted:
            raise SiblingManifestError(
                f"partition {label} {field} does not match manifest: "
                f"expected {wanted!r}, got {actual!r}"
            )
    return {
        **summary,
        "game_ids": game_ids,
        "parent_ids": parent_ids,
        "position_ids": position_ids,
        "child_position_ids": child_position_ids,
        "semantic_position_ids": semantic_position_ids,
    }


def verify_sibling_validation_partition(
    partition_manifest_path: str,
    *,
    sibling_manifest_path: str,
    data_role: str | None = None,
    data_path: str | None = None,
    protected_position_ids_path: str | None = None,
    source_train_path: str | None = None,
    source_val_path: str | None = None,
    training_path: str | None = None,
    model_selection_path: str | None = None,
    final_holdout_path: str | None = None,
    policy_exposure_receipt_path: str | None = None,
    policy_exposed_parent_ids_path: str | None = None,
    policy_exposed_semantic_position_ids_path: str | None = None,
) -> dict[str, Any]:
    """Verify filtered training plus deterministic selection/holdout outputs."""
    role_aliases = {
        None: None,
        "selection": "model_selection",
        "model-selection": "model_selection",
        "model_selection": "model_selection",
        "final-holdout": "final_holdout",
        "final_holdout": "final_holdout",
    }
    if data_role not in role_aliases:
        raise SiblingManifestError(
            "partition data role must be selection or final-holdout"
        )
    role = role_aliases[data_role]
    if (role is None) != (data_path is None):
        raise SiblingManifestError(
            "partition data role and dataset path must be provided together"
        )
    policy_paths = (
        policy_exposure_receipt_path,
        policy_exposed_parent_ids_path,
        policy_exposed_semantic_position_ids_path,
    )
    if any(
        path is not None
        for path in (training_path, data_path, model_selection_path, final_holdout_path)
    ) and any(path is None for path in policy_paths):
        raise SiblingManifestError(
            "verifying partition datasets requires the policy exposure receipt, "
            "parent IDs, and semantic position IDs"
        )
    if POLICY_EXPOSURE_CONTRACT["role_accounting"] is None:
        raise SiblingManifestError(
            "policy-exposure role accounting is not pinned; partition consumption is sealed"
        )

    teacher, teacher_bytes, teacher_sha256 = _read_manifest(sibling_manifest_path)
    _validate_contract(teacher)
    _validate_full_teacher_contract(teacher)
    teacher_training = _teacher_split_summary(teacher, "train")
    teacher_validation = _teacher_validation_summary(teacher)
    teacher_provenance = _teacher_provenance(
        sibling_manifest_path,
        teacher,
        teacher_bytes,
        teacher_sha256,
        [],
    )

    manifest, manifest_bytes, manifest_sha256 = _read_manifest(
        partition_manifest_path
    )
    required_top = {
        "schema",
        "record_schema",
        "pipeline",
        "policy",
        "source",
        "outputs",
        "drops",
        "isolation",
    }
    if set(manifest) != required_top:
        raise SiblingManifestError(
            "partition manifest must contain exactly "
            + "/".join(sorted(required_top))
        )
    _exact(
        manifest,
        "schema",
        VALIDATION_PARTITION_MANIFEST_SCHEMA,
        "schema",
    )
    _exact(manifest, "record_schema", SIBLING_RECORD_SCHEMA, "record_schema")

    pipeline = _object(manifest, "pipeline")
    if set(pipeline) != {"source_revision", "tracked_tree_clean"}:
        raise SiblingManifestError(
            "partition pipeline must contain exactly source_revision/tracked_tree_clean"
        )
    revision = pipeline.get("source_revision")
    if not isinstance(revision, str) or _GIT_REVISION_RE.fullmatch(revision) is None:
        raise SiblingManifestError(
            "partition pipeline.source_revision must be a lowercase 40-digit Git commit"
        )
    _exact(pipeline, "tracked_tree_clean", True, "pipeline.tracked_tree_clean")

    policy = _object(manifest, "policy")
    policy_fields = {
        "algorithm",
        "domain",
        "seed",
        "source_role",
        "expected_source_games",
        "final_holdout_games",
        "rank_order",
        "priority",
        "drop_unit",
        "conflict_resolution",
        "semantic_position_set",
        "policy_exposure_policy",
    }
    if set(policy) != policy_fields:
        raise SiblingManifestError(
            "partition policy must contain exactly "
            + "/".join(sorted(policy_fields))
        )
    for field, expected_value in (
        ("algorithm", PARTITION_ALGORITHM),
        ("domain", PARTITION_DOMAIN),
        ("seed", PARTITION_SEED),
        ("source_role", "val"),
        ("rank_order", PARTITION_RANK_ORDER),
        ("priority", PARTITION_PRIORITY),
        ("drop_unit", PARTITION_DROP_UNIT),
        ("conflict_resolution", PARTITION_CONFLICT_RESOLUTION),
        ("semantic_position_set", PARTITION_SEMANTIC_POSITION_SET),
        ("policy_exposure_policy", PARTITION_POLICY_EXPOSURE_POLICY),
    ):
        _exact(policy, field, expected_value, f"policy.{field}")
    _exact(
        policy,
        "expected_source_games",
        PARTITION_EXPECTED_SOURCE_GAMES,
        "policy.expected_source_games",
    )
    _exact(
        policy,
        "final_holdout_games",
        PARTITION_FINAL_HOLDOUT_GAMES,
        "policy.final_holdout_games",
    )
    expected_games = PARTITION_EXPECTED_SOURCE_GAMES
    final_holdout_games = PARTITION_FINAL_HOLDOUT_GAMES

    source = _object(manifest, "source")
    if set(source) != {
        "teacher_manifest",
        "full_training",
        "full_validation",
        "policy_exposure_receipt",
        "policy_exposed_parent_ids",
        "policy_exposed_semantic_position_ids",
    }:
        raise SiblingManifestError(
            "partition source must contain exactly "
            "teacher_manifest/full_training/full_validation/policy exposure receipt and IDs"
        )
    source_teacher = _object(source, "teacher_manifest")
    if set(source_teacher) != {"schema", "bytes", "sha256"}:
        raise SiblingManifestError(
            "partition source.teacher_manifest must contain exactly schema/bytes/sha256"
        )
    _exact(
        source_teacher,
        "schema",
        TEACHER_MANIFEST_SCHEMA,
        "source.teacher_manifest.schema",
    )
    _nonnegative_integer(
        source_teacher.get("bytes"), "source.teacher_manifest.bytes"
    )
    _lower_sha256(
        source_teacher.get("sha256"), "source.teacher_manifest.sha256"
    )
    if source_teacher["bytes"] != teacher_bytes or source_teacher["sha256"] != teacher_sha256:
        raise SiblingManifestError(
            "partition source teacher manifest identity does not match supplied manifest"
        )

    source_summary_fields = {
        "bytes",
        "sha256",
        "records",
        "parents",
        "games",
        "game_ids_sha256",
    }
    source_training = _object(source, "full_training")
    if set(source_training) != source_summary_fields:
        raise SiblingManifestError(
            "partition source.full_training has unexpected fields"
        )
    _nonnegative_integer(source_training.get("bytes"), "source.full_training.bytes")
    _lower_sha256(source_training.get("sha256"), "source.full_training.sha256")
    for field in ("records", "parents", "games"):
        _positive_integer(source_training.get(field), f"source.full_training.{field}")
    _lower_sha256(
        source_training.get("game_ids_sha256"),
        "source.full_training.game_ids_sha256",
    )
    for field, expected_value in teacher_training.items():
        if (
            type(source_training.get(field)) is not type(expected_value)
            or source_training.get(field) != expected_value
        ):
            raise SiblingManifestError(
                f"partition source.full_training.{field} does not match base teacher manifest"
            )
    if source_training["games"] != PARTITION_EXPECTED_SOURCE_TRAINING_GAMES:
        raise SiblingManifestError(
            "partition source full_training game count does not match policy"
        )

    source_validation = _object(source, "full_validation")
    if set(source_validation) != source_summary_fields:
        raise SiblingManifestError(
            "partition source.full_validation has unexpected fields"
        )
    _nonnegative_integer(source_validation.get("bytes"), "source.full_validation.bytes")
    _lower_sha256(source_validation.get("sha256"), "source.full_validation.sha256")
    for field in ("records", "parents", "games"):
        _positive_integer(
            source_validation.get(field), f"source.full_validation.{field}"
        )
    _lower_sha256(
        source_validation.get("game_ids_sha256"),
        "source.full_validation.game_ids_sha256",
    )
    for field, expected_value in teacher_validation.items():
        if type(source_validation.get(field)) is not type(expected_value) or source_validation.get(
            field
        ) != expected_value:
            raise SiblingManifestError(
                f"partition source.full_validation.{field} does not match base teacher manifest"
            )
    if expected_games != source_validation["games"]:
        raise SiblingManifestError(
            "partition expected_source_games does not match source validation"
        )

    policy_receipt_source = _object(source, "policy_exposure_receipt")
    _exact_keys(
        policy_receipt_source,
        set(POLICY_EXPOSURE_CONTRACT["receipt"]),
        "source.policy_exposure_receipt",
    )
    policy_parent_source = _object(source, "policy_exposed_parent_ids")
    _exact_keys(
        policy_parent_source,
        set(POLICY_EXPOSURE_CONTRACT["parent_ids"]),
        "source.policy_exposed_parent_ids",
    )
    policy_semantic_source = _object(
        source, "policy_exposed_semantic_position_ids"
    )
    _exact_keys(
        policy_semantic_source,
        set(POLICY_EXPOSURE_CONTRACT["semantic_position_ids"]),
        "source.policy_exposed_semantic_position_ids",
    )
    for source_value, contract_key, label in (
        (policy_receipt_source, "receipt", "policy_exposure_receipt"),
        (policy_parent_source, "parent_ids", "policy_exposed_parent_ids"),
        (
            policy_semantic_source,
            "semantic_position_ids",
            "policy_exposed_semantic_position_ids",
        ),
    ):
        for field, expected_value in POLICY_EXPOSURE_CONTRACT[contract_key].items():
            _exact(
                source_value,
                field,
                expected_value,
                f"source.{label}.{field}",
            )

    outputs = _object(manifest, "outputs")
    if set(outputs) != {
        "model_training",
        "model_selection",
        "final_holdout",
        "protected_position_ids",
    }:
        raise SiblingManifestError(
            "partition outputs must contain model_training/model_selection/"
            "final_holdout/protected_position_ids"
        )
    training_output = _partition_file_output(
        outputs,
        "model_training",
        expected_format=PARTITION_OUTPUT_FORMAT,
        dataset=True,
    )
    selection_output = _partition_file_output(
        outputs,
        "model_selection",
        expected_format=PARTITION_OUTPUT_FORMAT,
        dataset=True,
    )
    holdout_output = _partition_file_output(
        outputs,
        "final_holdout",
        expected_format=PARTITION_OUTPUT_FORMAT,
        dataset=True,
    )
    protected_output = _partition_file_output(
        outputs,
        "protected_position_ids",
        expected_format=PROTECTED_POSITION_IDS_FORMAT,
        dataset=False,
    )
    if holdout_output["games"] != final_holdout_games:
        raise SiblingManifestError(
            "partition final_holdout output game count does not match policy"
        )
    if selection_output["games"] != expected_games - final_holdout_games:
        raise SiblingManifestError(
            "partition model_selection output game count does not match policy"
        )
    if training_output["games"] != PARTITION_EXPECTED_SOURCE_TRAINING_GAMES:
        raise SiblingManifestError(
            "partition model_training output game count does not match policy"
        )
    if training_output["game_ids_sha256"] != source_training["game_ids_sha256"]:
        raise SiblingManifestError(
            "partition model_training game IDs do not match full_training"
        )

    drops = _object(manifest, "drops")
    drop_fields = {
        "training_policy_exposed_records",
        "training_policy_exposed_parents",
        "training_semantic_conflict_records",
        "training_semantic_conflict_parents",
        "selection_policy_exposed_records",
        "selection_policy_exposed_parents",
        "holdout_policy_exposed_records",
        "holdout_policy_exposed_parents",
        "selection_conflict_records",
        "selection_conflict_parents",
        "parent_id_overlap_parents",
        "semantic_position_overlap_parents",
        "policy_exposed_unmatched_parent_ids",
    }
    if set(drops) != drop_fields:
        raise SiblingManifestError(
            "partition drops must contain exactly " + "/".join(sorted(drop_fields))
        )
    for field in drop_fields:
        _nonnegative_integer(drops.get(field), f"drops.{field}")
    selection_drop_causes = (
        drops["parent_id_overlap_parents"],
        drops["semantic_position_overlap_parents"],
    )
    if not (
        max(selection_drop_causes) <= drops["selection_conflict_parents"]
        <= sum(selection_drop_causes)
    ):
        raise SiblingManifestError(
            "partition selection dropped-parent causes do not balance"
        )
    if (
        drops["training_policy_exposed_records"] == 0
        and drops["training_semantic_conflict_records"] == 0
        and (
            training_output["bytes"] != source_training["bytes"]
            or training_output["sha256"] != source_training["sha256"]
        )
    ):
        raise SiblingManifestError(
            "partition unchanged model_training bytes do not match full_training"
        )
    if (
        training_output["records"]
        + drops["training_policy_exposed_records"]
        + drops["training_semantic_conflict_records"]
        != source_training["records"]
    ):
        raise SiblingManifestError("partition training record accounting does not balance")
    if (
        training_output["parents"]
        + drops["training_policy_exposed_parents"]
        + drops["training_semantic_conflict_parents"]
        != source_training["parents"]
    ):
        raise SiblingManifestError("partition training parent accounting does not balance")
    if (
        selection_output["records"]
        + holdout_output["records"]
        + drops["selection_policy_exposed_records"]
        + drops["holdout_policy_exposed_records"]
        + drops["selection_conflict_records"]
        != source_validation["records"]
    ):
        raise SiblingManifestError("partition record accounting does not balance")
    if (
        selection_output["parents"]
        + holdout_output["parents"]
        + drops["selection_policy_exposed_parents"]
        + drops["holdout_policy_exposed_parents"]
        + drops["selection_conflict_parents"]
        != source_validation["parents"]
    ):
        raise SiblingManifestError("partition parent accounting does not balance")
    role_accounting = POLICY_EXPOSURE_CONTRACT["role_accounting"]
    for drop_field, role_field in (
        ("training_policy_exposed_records", "training_records"),
        ("training_policy_exposed_parents", "training_parents"),
        ("selection_policy_exposed_records", "selection_records"),
        ("selection_policy_exposed_parents", "selection_parents"),
        ("holdout_policy_exposed_records", "holdout_records"),
        ("holdout_policy_exposed_parents", "holdout_parents"),
        ("policy_exposed_unmatched_parent_ids", "unmatched_parent_ids"),
    ):
        if drops[drop_field] != role_accounting[role_field]:
            raise SiblingManifestError(
                f"partition policy exposure audit mismatch for {drop_field}"
            )

    isolation = _object(manifest, "isolation")
    isolation_fields = {
        "game_overlap",
        "parent_overlap",
        "position_overlap",
        "child_position_overlap",
        "selection_position_to_holdout_child_overlap",
        "selection_child_to_holdout_position_overlap",
        "semantic_position_union_overlap",
        "training_to_selection_semantic_position_union_overlap",
        "training_to_holdout_semantic_position_union_overlap",
        "training_to_evaluation_semantic_position_union_overlap",
    }
    if set(isolation) != isolation_fields:
        raise SiblingManifestError(
            "partition isolation must contain exactly "
            + "/".join(sorted(isolation_fields))
        )
    for field in isolation_fields:
        _exact(isolation, field, 0, f"isolation.{field}")

    source_training_scan = (
        _scan_partition_jsonl(
            source_train_path,
            "source training",
            expected_split="train",
            expected=source_training,
        )
        if source_train_path is not None
        else None
    )
    source_validation_scan = (
        _scan_partition_jsonl(
            source_val_path,
            "source validation",
            expected_split="val",
            expected=source_validation,
        )
        if source_val_path is not None
        else None
    )

    policy_parent_ids = None
    policy_semantic_ids = None
    if policy_exposure_receipt_path is not None:
        load_policy_exposure_receipt(
            policy_exposure_receipt_path,
            expected=policy_receipt_source,
        )
        policy_parent_ids, _policy_parent_fingerprint = (
            load_policy_exposed_parent_ids(
                policy_exposed_parent_ids_path,
                expected=policy_parent_source,
            )
        )
        policy_semantic_ids, _policy_semantic_fingerprint = (
            load_policy_exposed_semantic_position_ids(
                policy_exposed_semantic_position_ids_path,
                expected=policy_semantic_source,
            )
        )

    verified_outputs: list[str] = []
    training_scan = None
    if training_path is not None:
        training_scan = _scan_partition_jsonl(
            training_path,
            "model_training",
            expected_split="train",
            expected=training_output,
        )
        verified_outputs.append("model_training")
    selection_path = model_selection_path
    holdout_path = final_holdout_path
    if role is not None and data_path is not None:
        if role == "model_selection":
            if selection_path is not None and os.path.realpath(selection_path) != os.path.realpath(data_path):
                raise SiblingManifestError("conflicting model-selection dataset paths")
            selection_path = data_path
        else:
            if holdout_path is not None and os.path.realpath(holdout_path) != os.path.realpath(data_path):
                raise SiblingManifestError("conflicting final-holdout dataset paths")
            holdout_path = data_path
    selection_scan = None
    if selection_path is not None:
        selection_scan = _scan_partition_jsonl(
            selection_path,
            "model_selection",
            expected_split="val",
            expected=selection_output,
        )
        verified_outputs.append("model_selection")
    holdout_scan = None
    if holdout_path is not None:
        holdout_scan = _scan_partition_jsonl(
            holdout_path,
            "final_holdout",
            expected_split="val",
            expected=holdout_output,
        )
        verified_outputs.append("final_holdout")
    protected_ids = None
    if protected_position_ids_path is not None:
        protected_ids, _protected_fingerprint = load_protected_position_ids(
            protected_position_ids_path,
            expected=protected_output,
        )
        verified_outputs.append("protected_position_ids")

    output_scans = {
        "model_training": training_scan,
        "model_selection": selection_scan,
        "final_holdout": holdout_scan,
    }
    if policy_parent_ids is not None and policy_semantic_ids is not None:
        for label, scan in output_scans.items():
            if scan is None:
                continue
            if scan["parent_ids"] & policy_parent_ids:
                raise SiblingManifestError(
                    f"partition {label} contains a policy-exposed parent"
                )
            if scan["semantic_position_ids"] & policy_semantic_ids:
                raise SiblingManifestError(
                    f"partition {label} contains a policy-exposed semantic position"
                )
    scan_pairs = (
        ("model_training", training_scan, "model_selection", selection_scan),
        ("model_training", training_scan, "final_holdout", holdout_scan),
        ("model_selection", selection_scan, "final_holdout", holdout_scan),
    )
    for left_label, left, right_label, right in scan_pairs:
        if left is None or right is None:
            continue
        overlap = left["semantic_position_ids"] & right["semantic_position_ids"]
        if overlap:
            raise SiblingManifestError(
                f"partition semantic union overlap between {left_label} and {right_label}"
            )
    if protected_ids is not None:
        if holdout_scan is not None and holdout_scan["semantic_position_ids"] != protected_ids:
            raise SiblingManifestError(
                "protected position IDs are not exactly the final-holdout semantic union"
            )
        for label, scan in (
            ("model_training", training_scan),
            ("model_selection", selection_scan),
        ):
            if scan is not None and scan["semantic_position_ids"] & protected_ids:
                raise SiblingManifestError(
                    f"partition {label} overlaps protected final-holdout positions"
                )
    if source_training_scan is not None and training_scan is not None:
        if not training_scan["parent_ids"] <= source_training_scan["parent_ids"]:
            raise SiblingManifestError("model training contains a parent outside source training")
    if source_validation_scan is not None:
        for label, scan in (("model_selection", selection_scan), ("final_holdout", holdout_scan)):
            if scan is not None and not scan["parent_ids"] <= source_validation_scan["parent_ids"]:
                raise SiblingManifestError(f"{label} contains a parent outside source validation")

    replay_exclusion = None
    if (
        policy_semantic_ids is not None
        and selection_scan is not None
        and protected_ids is not None
    ):
        replay_exclusion_ids = (
            policy_semantic_ids
            | selection_scan["semantic_position_ids"]
            | protected_ids
        )
        replay_exclusion = {
            "semantic_position_ids_count": len(replay_exclusion_ids),
            "semantic_position_ids_sha256": _identifier_set_sha256(
                replay_exclusion_ids
            ),
        }

    return {
        "path": os.path.abspath(partition_manifest_path),
        "bytes": manifest_bytes,
        "sha256": manifest_sha256,
        "schema": VALIDATION_PARTITION_MANIFEST_SCHEMA,
        "record_schema": SIBLING_RECORD_SCHEMA,
        "verified_outputs": verified_outputs,
        "pipeline": dict(pipeline),
        "policy": dict(policy),
        "source": {
            "teacher_manifest": dict(source_teacher),
            "full_training": dict(source_training),
            "full_validation": dict(source_validation),
            "policy_exposure_receipt": dict(policy_receipt_source),
            "policy_exposed_parent_ids": dict(policy_parent_source),
            "policy_exposed_semantic_position_ids": dict(policy_semantic_source),
        },
        "outputs": {
            "model_training": training_output,
            "model_selection": selection_output,
            "final_holdout": holdout_output,
            "protected_position_ids": protected_output,
        },
        "drops": dict(drops),
        "isolation": dict(isolation),
        "replay_exclusion": replay_exclusion,
        "teacher_manifest": teacher_provenance,
    }
