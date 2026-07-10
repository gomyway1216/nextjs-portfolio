"""Strict, Torch-independent verification for sibling teacher manifests.

The teacher manifest is the commit marker for the two-file train/validation
publication.  Consumers must validate the policy and pipeline provenance and
bind both byte streams to the manifest before parsing any training rows.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Any


TEACHER_MANIFEST_SCHEMA = "shogi-sibling-teacher-manifest-v2"
RECORD_MANIFEST_SCHEMA = "shogi-sibling-manifest-v1"
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

    Training passes both ``train_path`` and ``val_path``.  Holdout evaluation
    passes only ``val_path`` because it must not depend on access to training
    bytes.  The returned mapping is safe to persist in checkpoints/reports.
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
