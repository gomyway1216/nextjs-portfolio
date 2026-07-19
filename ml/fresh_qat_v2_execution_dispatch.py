"""Additive, fail-closed dispatch for a future fresh QAT v2 plan.

The checked-in activation anchor is permanently closed.  A later reviewed
change may add, but must never replace the anchor with, one exact ready
successor.  Until that separate file exists, the production entry point stops
before reading an execution plan, parent-accounting proposal, training JSONL,
any other training artifact, or a Torch runtime.

This module is stdlib-only and neither imports Torch nor starts training.
Synthetic tests can exercise the future ready shape through injected readers;
the checked-in repository has no ready successor and therefore grants no
authority.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import stat
from typing import Any

import fresh_qat_parent_accounting_v2 as ACCOUNTING
import fresh_qat_protocol as FRESH


FRESH_QAT_V2_EXECUTION_PLAN_SCHEMA = (
    "shogi-floodgate-fresh-qat-execution-plan-v2"
)
FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH = (
    "ml/protocols/floodgate-q1-2026-fresh-qat-execution-plan-v2.json"
)
FRESH_QAT_V2_ACTIVATION_ANCHOR_SCHEMA = (
    "shogi-floodgate-fresh-qat-v2-activation-anchor-v1"
)
FRESH_QAT_V2_ACTIVATION_ANCHOR_RELATIVE_PATH = (
    "ml/protocols/floodgate-q1-2026-fresh-qat-v2-activation-anchor.json"
)
FRESH_QAT_V2_ACTIVATION_ANCHOR_BYTES = 3_387
FRESH_QAT_V2_ACTIVATION_ANCHOR_SHA256 = (
    "c6b22c202087f0142cc73c37fc033a8e322cb12867a59d9ed027be9eb89eaca7"
)
FRESH_QAT_V2_ACTIVATION_ANCHOR_CANONICAL_SHA256 = (
    "2721d7e8df559ea7262518664a5cc3bb8232bea70bf5fce96781c1a7ab81ee8c"
)
FRESH_QAT_V2_READY_SUCCESSOR_SCHEMA = (
    "shogi-floodgate-fresh-qat-v2-ready-successor-v1"
)
FRESH_QAT_V2_READY_SUCCESSOR_RELATIVE_PATH = (
    "ml/protocols/floodgate-q1-2026-fresh-qat-v2-ready-successor.json"
)
FRESH_QAT_V2_PARENT_ACCOUNTING_PROPOSAL_RELATIVE_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-fresh-qat-parent-accounting-proposal-v2.json"
)
FRESH_QAT_V2_TRAIN_RELATIVE_PATH = (
    "ml/data/floodgate-q1-2026-fresh-qat-v2/train.jsonl"
)
FRESH_QAT_V2_INPUT_TRAINING_RELATIVE_PATH = "training.raw.jsonl"
FRESH_QAT_V2_PARENT_COMPLETION_RELATIVE_PATH = (
    "parent-completion.jsonl"
)
FRESH_QAT_V2_TRAIN_FORMAT = (
    "canonical-shogi-sibling-v1-jsonl-one-lf-per-row"
)
FRESH_QAT_V2_INPUT_PARENTS = 24_000
FRESH_QAT_V2_ANCHOR_STATUS = (
    "permanently-closed-anchor-awaiting-additive-ready-successor"
)
FRESH_QAT_V2_READY_STATUS = (
    "ready-exact-v2-plan-parent-accounting-and-train-identities"
)
FRESH_QAT_V2_PLAN_STATUS = (
    "ready-successor-bound-parent-accounting-execution-plan-v2"
)
FRESH_QAT_V2_PROPOSAL_STATUS = (
    "materialized-proposal-only-not-enrolled-or-authorized"
)
FRESH_QAT_V2_PROPOSAL_BOUNDARY = (
    "production-finalizer-authenticated-proposal-only"
)
FRESH_QAT_V2_SCHEMA_PAIR = {
    "execution_plan": FRESH_QAT_V2_EXECUTION_PLAN_SCHEMA,
    "training_contract": FRESH.FRESH_QAT_TRAINING_CONTRACT_SCHEMA,
}

_LOWER_SHA256 = frozenset("0123456789abcdef")
_DEFAULT_UNBOUND_PROTOCOL_MAX_BYTES = 1_048_576
_DIR_FD_OPEN_SUPPORTED = os.open in os.supports_dir_fd
_DIR_FD_STAT_SUPPORTED = os.stat in os.supports_dir_fd
_NOFOLLOW_STAT_SUPPORTED = os.stat in os.supports_follow_symlinks
_ANCHOR_IDENTITY = {
    "path": FRESH_QAT_V2_ACTIVATION_ANCHOR_RELATIVE_PATH,
    "bytes": FRESH_QAT_V2_ACTIVATION_ANCHOR_BYTES,
    "sha256": FRESH_QAT_V2_ACTIVATION_ANCHOR_SHA256,
    "schema": FRESH_QAT_V2_ACTIVATION_ANCHOR_SCHEMA,
}
_CLOSED_V2_REGISTRY_IDENTITY = {
    "path": ACCOUNTING.FRESH_QAT_PLAN_REGISTRY_PATH_V2,
    "bytes": ACCOUNTING.FRESH_QAT_PLAN_REGISTRY_BYTES_V2,
    "sha256": ACCOUNTING.FRESH_QAT_PLAN_REGISTRY_SHA256_V2,
    "schema": ACCOUNTING.FRESH_QAT_PLAN_REGISTRY_SCHEMA_V2,
}
_V1_PLAN_REGISTRY_IDENTITY = {
    "path": FRESH.FRESH_QAT_REGISTRY_RELATIVE_PATH,
    "bytes": 409,
    "sha256": "9a1af8144cda4a222e300676c1475d69314c5ac32fe6a11a58adf7acfe5d9a00",
    "schema": FRESH.FRESH_QAT_REGISTRY_SCHEMA,
}
_V1_SELECTION_REGISTRY_IDENTITY = {
    "path": (
        "ml/protocols/"
        "floodgate-q1-2026-fresh-qat-selection-preflight-registry.json"
    ),
    "bytes": 2_294,
    "sha256": "7593d5675884431e5fbcc71c7925b7f094c3ab48f6de9f74850b195f57aedd39",
    "schema": "shogi-floodgate-fresh-qat-selection-preflight-registry-v1",
}
_PREREGISTERED_PLAN_IDENTITY = {
    "path": FRESH.FRESH_QAT_PREREGISTERED_PLAN_RELATIVE_PATH,
    "bytes": FRESH.FRESH_QAT_PREREGISTERED_PLAN_BYTES,
    "sha256": FRESH.FRESH_QAT_PREREGISTERED_PLAN_SHA256,
    "schema": FRESH.FRESH_QAT_PREREGISTERED_PLAN_SCHEMA,
}
_ROLE_BUNDLE_RESULT_IDENTITY = {
    "path": "ml/protocols/floodgate-q1-2026-role-bundle-result.json",
    "bytes": 14_735,
    "sha256": "56009b1abaf83a75ae66ea8abf62e1f9f7214ad1aa687f7808972679e4af3ccf",
    "schema": "shogi-floodgate-role-bundle-result-v1",
}

_READY_FIELDS = frozenset(
    {
        "schema",
        "status",
        "activation_anchor",
        "closed_parent_accounting_registry",
        "execution_plan",
        "parent_accounting_proposal",
        "input_training",
        "parent_completion",
        "train_jsonl",
        "parent_accounting",
        "allowed_schema_pair",
        "gates",
        "authority",
        "nonclaims",
    }
)
_INPUT_TRAINING_IDENTITY_FIELDS = frozenset(
    {
        "path",
        "format",
        "bytes",
        "sha256",
        "parents",
        "games",
        "game_ids_sha256",
        "parent_ids_sha256",
        "position_ids_count",
        "position_ids_sha256",
    }
)
_PARENT_COMPLETION_IDENTITY_FIELDS = frozenset(
    {
        "path",
        "format",
        "bytes",
        "sha256",
        "records",
        "forced_parents_skipped",
        "emitted_parent_groups",
        "parent_ids_sha256",
        "forced_parent_ids_sha256",
        "emitted_parent_ids_sha256",
    }
)
_PROPOSAL_UPSTREAM_FIELDS = frozenset(
    {
        "preregistered_plan",
        "role_bundle_result",
        "input_training",
        "parent_completion",
    }
)
_PLAN_FIELDS = frozenset(
    {
        "schema",
        "status",
        "activation",
        "parent_accounting",
        "preregistered_plan",
        "inputs",
        "runtime",
        "training",
        "slots",
        "selection",
    }
)
_PROPOSAL_FIELDS = frozenset(
    {
        "schema",
        "status",
        "materialization_boundary",
        "protocol_amendment_sha256",
        "execution_plan_schema",
        "upstream",
        "parent_accounting",
        "model_training",
        "training_contracts",
        "unchanged_contracts",
        "authority",
        "nonclaims",
    }
)
_MODEL_TRAINING_FIELDS = frozenset(
    {
        "bytes",
        "sha256",
        "records",
        "parents",
        "games",
        "semantic_position_ids_count",
        "semantic_position_ids_sha256",
    }
)
_TRAIN_IDENTITY_FIELDS = frozenset(
    {
        "path",
        "format",
        "bytes",
        "sha256",
        "records",
        "parents",
        "games",
        "game_ids_sha256",
        "parent_ids_sha256",
        "semantic_position_ids_count",
        "semantic_position_ids_sha256",
    }
)
_ACCOUNTING_COUNT_FIELDS = frozenset(
    {
        "input_parents",
        "forced_parents_skipped",
        "emitted_parent_groups",
        "equation",
        "equation_verified",
        "model_training_parents",
    }
)
_PROPOSAL_ACCOUNTING_FIELDS = frozenset(
    {
        *_ACCOUNTING_COUNT_FIELDS,
        "input_parent_ids_sha256",
        "forced_parent_ids_sha256",
        "emitted_parent_ids_sha256",
        "input_position_ids_sha256",
        "forced_position_ids_sha256",
        "emitted_position_ids_sha256",
        "input_parent_tuple_sequence_sha256",
        "forced_parent_tuple_sequence_sha256",
        "emitted_parent_tuple_sequence_sha256",
        "replacement_parents",
        "resampled_parents",
        "emitted_order_preserved",
    }
)
_UNCHANGED_CONTRACT_FIELDS = frozenset(
    {
        "training",
        "slots",
        "selection",
        "training_contract_canonical_sha256",
        "slot_registry_canonical_sha256",
        "selection_contract_canonical_sha256",
    }
)
_PROPOSAL_AUTHORITY_FIELDS = frozenset(
    {
        "teacher_execution_authorized",
        "artifact_enrollment_authorized",
        "training_dispatch_authorized",
        "selection_reader_authorized",
        "holdout_reader_authorized",
        "promotion_authorized",
        "production_weight_write_authorized",
    }
)
_PROPOSAL_NONCLAIM_FIELDS = frozenset(
    {
        "teacher_origin_authenticated_by_this_materializer",
        "completion_origin_authenticated_by_this_materializer",
        "artifact_enrolled",
        "training_executed",
        "candidate_selected",
        "strength_improved",
        "high_dan_calibrated",
        "live_weights_changed",
    }
)
_READY_GATE_FIELDS = frozenset(
    {
        "immutable_predecessors_verified",
        "execution_plan_identity_registered",
        "parent_accounting_proposal_identity_registered",
        "input_training_identity_registered",
        "parent_completion_evidence_enrolled",
        "train_identity_registered",
        "parent_accounting_equation_verified",
        "source_accounting_recomputation_required",
        "schema_pair_whitelisted",
        "training_dispatch_ready",
    }
)
_READY_AUTHORITY_FIELDS = frozenset(
    {
        "artifact_read_authorized",
        "torch_read_authorized",
        "training_contract_issue_authorized",
        "training_dispatch_authorized",
        "selection_reader_authorized",
        "holdout_reader_authorized",
        "production_weight_write_authorized",
    }
)
_READY_NONCLAIM_FIELDS = frozenset(
    {
        "teacher_labels_generated_by_this_successor",
        "training_executed",
        "candidate_selected",
        "strength_improved",
        "high_dan_calibrated",
        "live_weights_changed",
    }
)


class FreshQATV2ActivationStop(ValueError):
    """A closed v2 activation boundary stopped before training dispatch."""

    def __init__(self, phase: str, detail: str):
        super().__init__(f"fresh QAT v2 STOP [{phase}]: {detail}")
        self.phase = phase
        self.artifact_reads_authorized = False
        self.torch_reads_authorized = False
        self.training_contract_issued = False
        self.training_dispatch_authorized = False


class FreshQATV2NoTrainableParentGroups(FreshQATV2ActivationStop):
    """The successor declares E=0, so fail before source authentication."""

    def __init__(self):
        super().__init__(
            "parent-accounting",
            "successor declares all 24000 parents forced; "
            "source authentication was not reached",
        )


class _SecureFileAccessError(ValueError):
    """A path-redacted repository or local file access failure."""


def _reject_nonfinite(value: str) -> None:
    raise ValueError(f"non-finite JSON value is forbidden: {value}")


def _strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key is forbidden: {key}")
        result[key] = value
    return result


def _require_plain_json(value: Any, label: str) -> None:
    if value is None or type(value) in (str, int, bool):
        return
    if type(value) is float:
        if not math.isfinite(value):
            raise ValueError(f"{label} contains a non-finite float")
        return
    if type(value) is list:
        for index, item in enumerate(value):
            _require_plain_json(item, f"{label}[{index}]")
        return
    if type(value) is dict:
        for key, item in value.items():
            if type(key) is not str:
                raise ValueError(f"{label} contains a non-string key")
            _require_plain_json(item, f"{label}.{key}")
        return
    raise ValueError(f"{label} contains a non-JSON type")


def _strict_json(raw: bytes, label: str) -> Any:
    if type(raw) is not bytes:
        raise ValueError(f"{label} must be exact bytes")
    try:
        text = raw.decode("utf-8")
        value = json.loads(
            text,
            object_pairs_hook=_strict_object,
            parse_constant=_reject_nonfinite,
        )
    except (UnicodeError, json.JSONDecodeError, ValueError) as error:
        raise ValueError(f"{label} is not strict JSON: {error}") from error
    _require_plain_json(value, label)
    return value


def _canonical_bytes(value: Any) -> bytes:
    _require_plain_json(value, "canonical value")
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _canonical_sha256(value: Any) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _typed_equal(value: Any, expected: Any) -> bool:
    if type(value) is not type(expected):
        return False
    if type(expected) is dict:
        return set(value) == set(expected) and all(
            _typed_equal(value[key], expected[key]) for key in expected
        )
    if type(expected) is list:
        return len(value) == len(expected) and all(
            _typed_equal(item, expected_item)
            for item, expected_item in zip(value, expected)
        )
    return value == expected


def _exact_fields(
    value: Any,
    expected: frozenset[str] | set[str],
    label: str,
) -> dict[str, Any]:
    if (
        type(value) is not dict
        or any(type(key) is not str for key in value)
        or set(value) != set(expected)
    ):
        raise ValueError(f"{label} fields are not exact")
    return value


def _require_sha256(value: Any, label: str) -> str:
    if (
        type(value) is not str
        or len(value) != 64
        or any(character not in _LOWER_SHA256 for character in value)
    ):
        raise ValueError(f"{label} is not a lowercase SHA-256")
    return value


def _require_identity(
    value: Any,
    label: str,
    *,
    expected_path: str,
    expected_schema: str | None = None,
    expected_format: str | None = None,
) -> dict[str, Any]:
    expected_fields = {"path", "bytes", "sha256"}
    if expected_schema is not None:
        expected_fields.add("schema")
    if expected_format is not None:
        expected_fields.add("format")
    identity = _exact_fields(value, expected_fields, label)
    if identity["path"] != expected_path:
        raise ValueError(f"{label} path mismatch")
    if type(identity["bytes"]) is not int or identity["bytes"] < 1:
        raise ValueError(f"{label} byte identity is invalid")
    _require_sha256(identity["sha256"], f"{label}.sha256")
    if expected_schema is not None and identity["schema"] != expected_schema:
        raise ValueError(f"{label} schema mismatch")
    if expected_format is not None and identity["format"] != expected_format:
        raise ValueError(f"{label} format mismatch")
    return identity


def _read_regular_file(
    path: str,
    label: str,
    *,
    expected_bytes: int | None = None,
    max_bytes: int | None = None,
    repository_root: str | None = None,
) -> bytes:
    if (expected_bytes is None) == (max_bytes is None):
        raise ValueError("fresh QAT v2 internal read bound mismatch")
    limit = expected_bytes if expected_bytes is not None else max_bytes
    if type(limit) is not int or limit < 1:
        raise ValueError("fresh QAT v2 internal read limit mismatch")

    if type(path) is not str or not path:
        raise ValueError(f"{label} path must be a non-empty string")
    try:
        absolute = os.path.abspath(path)
    except OSError:
        raise _SecureFileAccessError(
            f"{label} secure file access failed"
        ) from None
    if repository_root is None:
        # Preserve caller-selected external path semantics: an ancestor alias
        # may resolve to its canonical directory, but the final component must
        # still be a non-symlink regular file.
        try:
            directory = os.path.realpath(os.path.dirname(absolute))
        except OSError:
            raise _SecureFileAccessError(
                f"{label} secure file access failed"
            ) from None
        final_name = os.path.basename(absolute)
    else:
        if type(repository_root) is not str:
            raise ValueError("fresh QAT v2 internal repository root mismatch")
        try:
            canonical_root = os.path.realpath(repository_root)
        except OSError:
            raise _SecureFileAccessError(
                f"{label} secure file access failed"
            ) from None
        if repository_root != canonical_root:
            raise ValueError("fresh QAT v2 internal repository root mismatch")
        try:
            relative = os.path.relpath(absolute, canonical_root)
            parts = tuple(part for part in relative.split(os.sep) if part)
        except (TypeError, ValueError, OSError):
            raise ValueError(
                "fresh QAT v2 internal repository path mismatch"
            ) from None
        if (
            not parts
            or any(part in (".", "..") for part in parts)
            or absolute != os.path.join(canonical_root, *parts)
        ):
            raise ValueError(
                "fresh QAT v2 internal repository path mismatch"
            )
        directory = os.path.join(canonical_root, *parts[:-1])
        final_name = parts[-1]

    if not final_name or final_name in (".", ".."):
        raise ValueError(f"{label} path is invalid")
    if (
        any(
            not hasattr(os, name)
            for name in ("O_DIRECTORY", "O_NOFOLLOW", "O_NONBLOCK")
        )
        or not _DIR_FD_OPEN_SUPPORTED
        or not _DIR_FD_STAT_SUPPORTED
        or not _NOFOLLOW_STAT_SUPPORTED
    ):
        raise ValueError(f"{label} secure file access is unsupported")

    directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    file_flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
    if hasattr(os, "O_CLOEXEC"):
        directory_flags |= os.O_CLOEXEC
        file_flags |= os.O_CLOEXEC

    directory_descriptors: list[int] = []
    descriptor: int | None = None
    try:
        current = os.open(os.sep, directory_flags)
        directory_descriptors.append(current)
        for component in (
            part for part in directory.split(os.sep) if part
        ):
            current = os.open(
                component,
                directory_flags,
                dir_fd=current,
            )
            directory_descriptors.append(current)
            if not stat.S_ISDIR(os.fstat(current).st_mode):
                raise ValueError(f"{label} parent must be a directory")

        parent_descriptor = directory_descriptors[-1]
        before = os.stat(
            final_name,
            dir_fd=parent_descriptor,
            follow_symlinks=False,
        )
        if stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(before.st_mode):
            raise ValueError(f"{label} must be a regular non-symlink file")
        if expected_bytes is not None and before.st_size != expected_bytes:
            raise ValueError(f"{label} byte length mismatch")
        if before.st_size > limit:
            raise ValueError(f"{label} exceeds the maximum byte length")

        descriptor = os.open(
            final_name,
            file_flags,
            dir_fd=parent_descriptor,
        )
        opened = os.fstat(descriptor)
        if (
            not stat.S_ISREG(opened.st_mode)
            or (opened.st_dev, opened.st_ino)
            != (before.st_dev, before.st_ino)
            or opened.st_size != before.st_size
        ):
            raise ValueError(f"{label} changed before bounded read")

        chunks: list[bytes] = []
        remaining = limit + 1
        while remaining:
            chunk = os.read(descriptor, min(65_536, remaining))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        raw = b"".join(chunks)
        after = os.fstat(descriptor)
        if (
            opened.st_dev,
            opened.st_ino,
            opened.st_size,
            opened.st_mtime_ns,
            opened.st_ctime_ns,
        ) != (
            after.st_dev,
            after.st_ino,
            after.st_size,
            after.st_mtime_ns,
            after.st_ctime_ns,
        ):
            raise ValueError(f"{label} changed during bounded read")
    except OSError:
        raise _SecureFileAccessError(
            f"{label} secure file access failed"
        ) from None
    finally:
        if descriptor is not None:
            try:
                os.close(descriptor)
            except OSError:
                pass
        for directory_descriptor in reversed(directory_descriptors):
            try:
                os.close(directory_descriptor)
            except OSError:
                pass

    if len(raw) > limit:
        raise ValueError(f"{label} exceeds the maximum byte length")
    if expected_bytes is not None and len(raw) != expected_bytes:
        raise ValueError(f"{label} byte length mismatch")
    return raw


def _default_reader(path: str) -> bytes:
    return _read_regular_file(
        path,
        "fresh QAT v2 unbound protocol",
        max_bytes=_DEFAULT_UNBOUND_PROTOCOL_MAX_BYTES,
    )


def _read_with_reader(
    reader: Callable[[str], bytes],
    path: str,
    label: str,
    expected_bytes: int,
    *,
    repository_root: str | None = None,
) -> bytes:
    if reader is _default_reader:
        return _read_regular_file(
            path,
            label,
            expected_bytes=expected_bytes,
            repository_root=repository_root,
        )
    raw = reader(path)
    if type(raw) is not bytes:
        raise ValueError(f"{label} reader did not return exact bytes")
    return raw


def _read_unbound_with_reader(
    reader: Callable[[str], bytes],
    path: str,
    label: str,
    max_bytes: int,
    *,
    repository_root: str,
) -> bytes:
    if reader is _default_reader:
        return _read_regular_file(
            path,
            label,
            max_bytes=max_bytes,
            repository_root=repository_root,
        )
    raw = reader(path)
    if type(raw) is not bytes:
        raise ValueError(f"{label} reader did not return exact bytes")
    if len(raw) > max_bytes:
        raise ValueError(f"{label} exceeds the maximum byte length")
    return raw


def _read_bound_file(
    root: str,
    identity: Mapping[str, Any],
    label: str,
    reader: Callable[[str], bytes],
) -> bytes:
    relative = identity["path"]
    if (
        type(relative) is not str
        or os.path.isabs(relative)
        or os.path.normpath(relative) != relative
        or relative == ".."
        or relative.startswith(".." + os.sep)
    ):
        raise ValueError(f"{label} path is not a fixed repository-relative path")
    absolute = os.path.join(root, relative)
    raw = _read_with_reader(
        reader,
        absolute,
        label,
        identity["bytes"],
        repository_root=root,
    )
    if len(raw) != identity["bytes"]:
        raise ValueError(f"{label} byte length mismatch")
    if hashlib.sha256(raw).hexdigest() != identity["sha256"]:
        raise ValueError(f"{label} SHA-256 mismatch")
    return raw


def validate_fresh_qat_v2_activation_anchor_data(
    anchor: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Validate the exact permanent closed anchor as a plain JSON value."""

    if type(anchor) is not dict:
        raise ValueError("fresh QAT v2 activation anchor must be an object")
    _require_plain_json(anchor, "fresh QAT v2 activation anchor")
    if anchor.get("schema") != FRESH_QAT_V2_ACTIVATION_ANCHOR_SCHEMA:
        raise ValueError("fresh QAT v2 activation anchor schema mismatch")
    if anchor.get("status") != FRESH_QAT_V2_ANCHOR_STATUS:
        raise ValueError("fresh QAT v2 activation anchor status mismatch")
    if (
        _canonical_sha256(anchor)
        != FRESH_QAT_V2_ACTIVATION_ANCHOR_CANONICAL_SHA256
    ):
        raise ValueError("fresh QAT v2 activation anchor differs")
    return anchor


def validate_fresh_qat_v2_activation_anchor(
    path: str | Path,
) -> Mapping[str, Any]:
    """Validate exact checked-in anchor bytes and its closed value."""

    try:
        absolute = os.path.abspath(os.fsdecode(os.fspath(path)))
    except (TypeError, ValueError, UnicodeError, OSError):
        raise ValueError(
            "fresh QAT v2 activation anchor path is invalid"
        ) from None
    raw = _read_regular_file(
        absolute,
        "fresh QAT v2 activation anchor",
        expected_bytes=FRESH_QAT_V2_ACTIVATION_ANCHOR_BYTES,
    )
    if hashlib.sha256(raw).hexdigest() != FRESH_QAT_V2_ACTIVATION_ANCHOR_SHA256:
        raise ValueError("fresh QAT v2 activation anchor SHA-256 mismatch")
    anchor = _strict_json(raw, "fresh QAT v2 activation anchor")
    return validate_fresh_qat_v2_activation_anchor_data(anchor)


def _validate_accounting_counts(value: Any) -> dict[str, Any]:
    accounting = _exact_fields(
        value,
        _ACCOUNTING_COUNT_FIELDS,
        "fresh QAT v2 ready parent accounting",
    )
    for field in (
        "input_parents",
        "forced_parents_skipped",
        "emitted_parent_groups",
        "model_training_parents",
    ):
        if type(accounting[field]) is not int:
            raise ValueError(f"fresh QAT v2 {field} must be an integer")
    forced = accounting["forced_parents_skipped"]
    emitted = accounting["emitted_parent_groups"]
    if (
        accounting["input_parents"] != FRESH_QAT_V2_INPUT_PARENTS
        or forced < 0
        or emitted < 0
        or forced + emitted != FRESH_QAT_V2_INPUT_PARENTS
        or accounting["model_training_parents"] != emitted
        or accounting["equation"]
        != "forced_parents_skipped+emitted_parent_groups=input_parents"
        or accounting["equation_verified"] is not True
    ):
        raise ValueError("fresh QAT v2 F+E=24000 accounting mismatch")
    if emitted == 0:
        raise FreshQATV2NoTrainableParentGroups()
    return accounting


def _validate_input_training_identity(value: Any) -> dict[str, Any]:
    identity = _exact_fields(
        value,
        _INPUT_TRAINING_IDENTITY_FIELDS,
        "fresh QAT v2 input-training identity",
    )
    if (
        identity["path"] != FRESH_QAT_V2_INPUT_TRAINING_RELATIVE_PATH
        or identity["format"]
        != ACCOUNTING.PRODUCTION_INPUT_TRAINING_BINDING["format"]
    ):
        raise ValueError("fresh QAT v2 input-training path/format mismatch")
    for field in (
        "bytes",
        "parents",
        "games",
        "position_ids_count",
    ):
        if type(identity[field]) is not int:
            raise ValueError(
                f"fresh QAT v2 input-training {field} must be an integer"
            )
    if (
        identity["bytes"] < 1
        or identity["parents"] != FRESH_QAT_V2_INPUT_PARENTS
        or identity["games"] < 1
        or identity["games"] > 1_000
        or identity["position_ids_count"] != FRESH_QAT_V2_INPUT_PARENTS
    ):
        raise ValueError("fresh QAT v2 input-training accounting mismatch")
    for field in (
        "sha256",
        "game_ids_sha256",
        "parent_ids_sha256",
        "position_ids_sha256",
    ):
        _require_sha256(
            identity[field],
            f"fresh QAT v2 input-training {field}",
        )
    return identity


def _validate_parent_completion_identity(
    value: Any,
    accounting: Mapping[str, Any],
) -> dict[str, Any]:
    identity = _exact_fields(
        value,
        _PARENT_COMPLETION_IDENTITY_FIELDS,
        "fresh QAT v2 parent-completion identity",
    )
    if (
        identity["path"] != FRESH_QAT_V2_PARENT_COMPLETION_RELATIVE_PATH
        or identity["format"] != ACCOUNTING.FRESH_QAT_PARENT_COMPLETION_FORMAT
    ):
        raise ValueError("fresh QAT v2 parent-completion path/format mismatch")
    for field in (
        "bytes",
        "records",
        "forced_parents_skipped",
        "emitted_parent_groups",
    ):
        if type(identity[field]) is not int:
            raise ValueError(
                f"fresh QAT v2 parent-completion {field} must be an integer"
            )
    if (
        identity["bytes"] < 1
        or identity["records"] != FRESH_QAT_V2_INPUT_PARENTS
        or identity["forced_parents_skipped"]
        != accounting["forced_parents_skipped"]
        or identity["emitted_parent_groups"]
        != accounting["emitted_parent_groups"]
    ):
        raise ValueError("fresh QAT v2 parent-completion accounting mismatch")
    for field in (
        "sha256",
        "parent_ids_sha256",
        "forced_parent_ids_sha256",
        "emitted_parent_ids_sha256",
    ):
        _require_sha256(
            identity[field],
            f"fresh QAT v2 parent-completion {field}",
        )
    return identity


def _validate_train_identity(
    value: Any,
    accounting: Mapping[str, Any],
) -> dict[str, Any]:
    train = _exact_fields(
        value,
        _TRAIN_IDENTITY_FIELDS,
        "fresh QAT v2 train identity",
    )
    if (
        train["path"] != FRESH_QAT_V2_TRAIN_RELATIVE_PATH
        or train["format"] != FRESH_QAT_V2_TRAIN_FORMAT
    ):
        raise ValueError("fresh QAT v2 train path/format mismatch")
    emitted = accounting["emitted_parent_groups"]
    for field in (
        "bytes",
        "records",
        "parents",
        "games",
        "semantic_position_ids_count",
    ):
        if type(train[field]) is not int:
            raise ValueError(f"fresh QAT v2 train {field} must be an integer")
    if (
        train["bytes"] < 1
        or train["parents"] != emitted
        or train["records"] < emitted * 2
        or train["games"] < 1
        or train["games"] > 1_000
        or train["semantic_position_ids_count"] < emitted
    ):
        raise ValueError("fresh QAT v2 train accounting mismatch")
    for field in (
        "sha256",
        "game_ids_sha256",
        "parent_ids_sha256",
        "semantic_position_ids_sha256",
    ):
        _require_sha256(train[field], f"fresh QAT v2 train {field}")
    return train


def validate_fresh_qat_v2_ready_successor_data(
    successor: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Validate the exact future ready-successor shape without reading artifacts."""

    successor = _exact_fields(
        successor,
        _READY_FIELDS,
        "fresh QAT v2 ready successor",
    )
    _require_plain_json(successor, "fresh QAT v2 ready successor")
    if successor["schema"] != FRESH_QAT_V2_READY_SUCCESSOR_SCHEMA:
        raise ValueError("fresh QAT v2 ready successor schema mismatch")
    if successor["status"] != FRESH_QAT_V2_READY_STATUS:
        raise ValueError("fresh QAT v2 ready successor status mismatch")
    if not _typed_equal(successor["activation_anchor"], _ANCHOR_IDENTITY):
        raise ValueError("fresh QAT v2 successor anchor identity mismatch")
    if not _typed_equal(
        successor["closed_parent_accounting_registry"],
        _CLOSED_V2_REGISTRY_IDENTITY,
    ):
        raise ValueError("fresh QAT v2 successor predecessor mismatch")
    _require_identity(
        successor["execution_plan"],
        "fresh QAT v2 execution-plan identity",
        expected_path=FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH,
        expected_schema=FRESH_QAT_V2_EXECUTION_PLAN_SCHEMA,
    )
    _require_identity(
        successor["parent_accounting_proposal"],
        "fresh QAT v2 proposal identity",
        expected_path=FRESH_QAT_V2_PARENT_ACCOUNTING_PROPOSAL_RELATIVE_PATH,
        expected_schema=ACCOUNTING.FRESH_QAT_PARENT_ACCOUNTING_PROPOSAL_SCHEMA,
    )
    accounting = _validate_accounting_counts(successor["parent_accounting"])
    _validate_input_training_identity(successor["input_training"])
    _validate_parent_completion_identity(
        successor["parent_completion"],
        accounting,
    )
    _validate_train_identity(successor["train_jsonl"], accounting)
    if not _typed_equal(
        successor["allowed_schema_pair"],
        FRESH_QAT_V2_SCHEMA_PAIR,
    ):
        raise ValueError("fresh QAT v2 schema pair is not whitelisted")
    gates = _exact_fields(
        successor["gates"],
        _READY_GATE_FIELDS,
        "fresh QAT v2 ready gates",
    )
    if any(value is not True for value in gates.values()):
        raise ValueError("fresh QAT v2 ready successor contains a closed gate")
    authority = _exact_fields(
        successor["authority"],
        _READY_AUTHORITY_FIELDS,
        "fresh QAT v2 ready authority",
    )
    expected_authority = {
        "artifact_read_authorized": True,
        "torch_read_authorized": True,
        "training_contract_issue_authorized": True,
        "training_dispatch_authorized": True,
        "selection_reader_authorized": False,
        "holdout_reader_authorized": False,
        "production_weight_write_authorized": False,
    }
    if not _typed_equal(authority, expected_authority):
        raise ValueError("fresh QAT v2 ready authority differs")
    nonclaims = _exact_fields(
        successor["nonclaims"],
        _READY_NONCLAIM_FIELDS,
        "fresh QAT v2 ready nonclaims",
    )
    if any(value is not False for value in nonclaims.values()):
        raise ValueError("fresh QAT v2 ready successor makes an observed claim")
    return successor


def _validate_model_training(
    value: Any,
    emitted: int,
) -> dict[str, Any]:
    model = _exact_fields(
        value,
        _MODEL_TRAINING_FIELDS,
        "fresh QAT v2 model training",
    )
    for field in (
        "bytes",
        "records",
        "parents",
        "games",
        "semantic_position_ids_count",
    ):
        if type(model[field]) is not int:
            raise ValueError(f"fresh QAT v2 model training {field} is invalid")
    if (
        model["bytes"] < 1
        or model["parents"] != emitted
        or model["records"] < emitted * 2
        or model["games"] < 1
        or model["games"] > 1_000
        or model["semantic_position_ids_count"] < emitted
    ):
        raise ValueError("fresh QAT v2 model training accounting mismatch")
    _require_sha256(model["sha256"], "fresh QAT v2 model training sha256")
    _require_sha256(
        model["semantic_position_ids_sha256"],
        "fresh QAT v2 model training semantic-position SHA-256",
    )
    return model


def _fixed_slots() -> list[dict[str, Any]]:
    return [
        {
            "id": f"floodgate-fresh-int16-aware-seed-{seed}",
            "seed": seed,
            "output": f"{FRESH.FRESH_QAT_RUN_ROOT}/seed-{seed}",
        }
        for seed in FRESH.FRESH_QAT_SLOT_ORDER
    ]


def _validate_unchanged_contracts(value: Any) -> dict[str, Any]:
    unchanged = _exact_fields(
        value,
        _UNCHANGED_CONTRACT_FIELDS,
        "fresh QAT v2 unchanged contracts",
    )
    expected = {
        "training": FRESH.FRESH_QAT_REQUIRED_TRAINING,
        "slots": _fixed_slots(),
        "selection": FRESH.FRESH_QAT_REQUIRED_SELECTION,
        "training_contract_canonical_sha256": (
            ACCOUNTING.FRESH_QAT_TRAINING_CONTRACT_CANONICAL_SHA256
        ),
        "slot_registry_canonical_sha256": (
            ACCOUNTING.FRESH_QAT_SLOT_REGISTRY_CANONICAL_SHA256
        ),
        "selection_contract_canonical_sha256": (
            ACCOUNTING.FRESH_QAT_SELECTION_CONTRACT_CANONICAL_SHA256
        ),
    }
    if not _typed_equal(unchanged, expected):
        raise ValueError("fresh QAT v2 unchanged contracts differ")
    return unchanged


def _validate_proposal(
    proposal: Any,
    successor: Mapping[str, Any],
) -> dict[str, Any]:
    proposal = _exact_fields(
        proposal,
        _PROPOSAL_FIELDS,
        "fresh QAT v2 parent-accounting proposal",
    )
    _require_plain_json(proposal, "fresh QAT v2 parent-accounting proposal")
    if (
        proposal["schema"]
        != ACCOUNTING.FRESH_QAT_PARENT_ACCOUNTING_PROPOSAL_SCHEMA
        or proposal["status"] != FRESH_QAT_V2_PROPOSAL_STATUS
        or proposal["materialization_boundary"]
        != FRESH_QAT_V2_PROPOSAL_BOUNDARY
        or proposal["protocol_amendment_sha256"]
        != ACCOUNTING.FRESH_QAT_PARENT_ACCOUNTING_AMENDMENT_SHA256
        or proposal["execution_plan_schema"]
        != FRESH_QAT_V2_EXECUTION_PLAN_SCHEMA
    ):
        raise ValueError("fresh QAT v2 proposal contract mismatch")
    upstream = _exact_fields(
        proposal["upstream"],
        _PROPOSAL_UPSTREAM_FIELDS,
        "fresh QAT v2 proposal upstream",
    )
    expected_upstream = {
        "preregistered_plan": _PREREGISTERED_PLAN_IDENTITY,
        "role_bundle_result": _ROLE_BUNDLE_RESULT_IDENTITY,
        "input_training": successor["input_training"],
        "parent_completion": successor["parent_completion"],
    }
    if not _typed_equal(upstream, expected_upstream):
        raise ValueError(
            "fresh QAT v2 proposal upstream differs from enrolled sources"
        )
    proposal_accounting = _exact_fields(
        proposal["parent_accounting"],
        _PROPOSAL_ACCOUNTING_FIELDS,
        "fresh QAT v2 proposal parent accounting",
    )
    counts = {
        field: proposal_accounting.get(field)
        for field in _ACCOUNTING_COUNT_FIELDS
    }
    if not _typed_equal(counts, successor["parent_accounting"]):
        raise ValueError("fresh QAT v2 proposal F/E accounting mismatch")
    if (
        proposal_accounting["replacement_parents"] != 0
        or proposal_accounting["resampled_parents"] != 0
        or proposal_accounting["emitted_order_preserved"] is not True
    ):
        raise ValueError("fresh QAT v2 proposal changed parent membership")
    if (
        proposal_accounting["input_parent_ids_sha256"]
        != upstream["input_training"]["parent_ids_sha256"]
        or proposal_accounting["input_position_ids_sha256"]
        != upstream["input_training"]["position_ids_sha256"]
        or proposal_accounting["input_parent_ids_sha256"]
        != upstream["parent_completion"]["parent_ids_sha256"]
        or proposal_accounting["forced_parent_ids_sha256"]
        != upstream["parent_completion"]["forced_parent_ids_sha256"]
        or proposal_accounting["emitted_parent_ids_sha256"]
        != upstream["parent_completion"]["emitted_parent_ids_sha256"]
    ):
        raise ValueError(
            "fresh QAT v2 proposal accounting differs from enrolled sources"
        )
    for field in _PROPOSAL_ACCOUNTING_FIELDS - _ACCOUNTING_COUNT_FIELDS - {
        "replacement_parents",
        "resampled_parents",
        "emitted_order_preserved",
    }:
        _require_sha256(
            proposal_accounting[field],
            f"fresh QAT v2 proposal accounting {field}",
        )
    emitted = counts["emitted_parent_groups"]
    proposal_model = _validate_train_identity(
        proposal["model_training"],
        counts,
    )
    train = successor["train_jsonl"]
    if not _typed_equal(proposal_model, train):
        raise ValueError("fresh QAT v2 proposal and train identity mismatch")
    contracts = proposal["training_contracts"]
    if type(contracts) is not list or len(contracts) != len(
        FRESH.FRESH_QAT_SLOT_ORDER
    ):
        raise ValueError("fresh QAT v2 proposal training contracts differ")
    unchanged = _validate_unchanged_contracts(
        proposal["unchanged_contracts"]
    )
    plan_stub = {"inputs": {"model_training": proposal_model}}
    expected_contracts = [
        FRESH.build_fresh_qat_training_contract(plan_stub, slot)
        for slot in unchanged["slots"]
    ]
    if not _typed_equal(contracts, expected_contracts):
        raise ValueError("fresh QAT v2 proposal training contracts differ")
    if any(
        contract.get("schema") != FRESH.FRESH_QAT_TRAINING_CONTRACT_SCHEMA
        or contract.get("model_training_parents") != emitted
        for contract in contracts
    ):
        raise ValueError("fresh QAT v2 proposal contract schema/E mismatch")
    authority = _exact_fields(
        proposal["authority"],
        _PROPOSAL_AUTHORITY_FIELDS,
        "fresh QAT v2 proposal authority",
    )
    if any(value is not False for value in authority.values()):
        raise ValueError("fresh QAT v2 proposal grants authority")
    nonclaims = _exact_fields(
        proposal["nonclaims"],
        _PROPOSAL_NONCLAIM_FIELDS,
        "fresh QAT v2 proposal nonclaims",
    )
    if any(value is not False for value in nonclaims.values()):
        raise ValueError("fresh QAT v2 proposal makes an observed claim")
    return proposal


def _validate_plan(
    plan: Any,
    proposal: Mapping[str, Any],
    successor: Mapping[str, Any],
) -> dict[str, Any]:
    plan = _exact_fields(plan, _PLAN_FIELDS, "fresh QAT v2 execution plan")
    _require_plain_json(plan, "fresh QAT v2 execution plan")
    if (
        plan["schema"] != FRESH_QAT_V2_EXECUTION_PLAN_SCHEMA
        or plan["status"] != FRESH_QAT_V2_PLAN_STATUS
    ):
        raise ValueError("fresh QAT v2 execution-plan contract mismatch")
    expected_activation = {
        "anchor": copy.deepcopy(_ANCHOR_IDENTITY),
        "closed_parent_accounting_registry": copy.deepcopy(
            _CLOSED_V2_REGISTRY_IDENTITY
        ),
        "parent_accounting_proposal": copy.deepcopy(
            successor["parent_accounting_proposal"]
        ),
    }
    if not _typed_equal(plan["activation"], expected_activation):
        raise ValueError("fresh QAT v2 plan activation binding mismatch")
    if not _typed_equal(
        plan["parent_accounting"],
        proposal["parent_accounting"],
    ):
        raise ValueError("fresh QAT v2 plan/proposal accounting mismatch")
    emitted = successor["parent_accounting"]["emitted_parent_groups"]
    model = _validate_model_training(
        plan.get("inputs", {}).get("model_training"),
        emitted,
    )
    proposal_model = proposal["model_training"]
    for field in _MODEL_TRAINING_FIELDS:
        if model[field] != proposal_model[field]:
            raise ValueError("fresh QAT v2 plan/proposal train mismatch")

    # Reuse the unchanged v1 shape verifier for every non-accounting field.
    # Only the three v1 fixed-cardinality checks are replaced in a detached
    # projection; the exact v2 model identity was validated above.
    projection = {
        field: copy.deepcopy(plan[field])
        for field in (
            "preregistered_plan",
            "inputs",
            "runtime",
            "training",
            "slots",
            "selection",
        )
    }
    projection["schema"] = FRESH.FRESH_QAT_EXECUTION_PLAN_SCHEMA
    projected_model = projection["inputs"]["model_training"]
    projected_model["parents"] = FRESH_QAT_V2_INPUT_PARENTS
    projected_model["records"] = max(
        FRESH_QAT_V2_INPUT_PARENTS,
        projected_model["records"],
    )
    projected_model["games"] = 1_000
    projected_model["semantic_position_ids_count"] = max(
        FRESH_QAT_V2_INPUT_PARENTS,
        projected_model["semantic_position_ids_count"],
    )
    FRESH._validate_plan_shape(projection)
    return plan


def _verify_artifact_identity(
    root: str,
    identity: Mapping[str, Any],
    label: str,
    reader: Callable[[str], bytes],
) -> bytes:
    raw = _read_bound_file(root, identity, label, reader)
    reread = _read_bound_file(root, identity, label, reader)
    if reread != raw:
        raise ValueError(f"{label} changed during verification")
    return raw


def _exact_repository_path(
    value: Any,
    root: str,
    relative_path: str,
    mismatch_message: str,
) -> str:
    if type(value) is not str or not value:
        raise ValueError(mismatch_message)
    parts = tuple(part for part in relative_path.split("/") if part)
    if not parts or any(part in (".", "..") for part in parts):
        raise ValueError("fresh QAT v2 internal repository path mismatch")

    expected = os.path.join(root, *parts)
    absolute = os.path.abspath(value)
    lexical_root = absolute
    for _ in parts:
        lexical_root = os.path.dirname(lexical_root)

    if (
        os.path.realpath(lexical_root) != root
        or absolute != os.path.join(lexical_root, *parts)
        or os.path.realpath(absolute) != expected
    ):
        raise ValueError(mismatch_message)

    # A symlink may exist above the repository (for example /tmp on macOS),
    # but no component selected inside the repository may be a symlink.
    current = lexical_root
    for part in parts:
        current = os.path.join(current, part)
        if os.path.islink(current):
            raise ValueError(mismatch_message)
    return expected


def _exact_requested_plan_path(args: Any, root: str) -> str:
    value = getattr(args, "experiment_plan", None)
    return _exact_repository_path(
        value,
        root,
        FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH,
        "fresh QAT v2 plan must be the exact non-symlink "
        f"{FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH}",
    )


def _validate_args_and_runtime(
    args: Any,
    plan: Mapping[str, Any],
    training_runtime: Mapping[str, Any],
    root: str,
    artifact_reader: Callable[[str], bytes],
) -> tuple[Mapping[str, Any], dict[str, dict[str, Any]]]:
    if type(training_runtime) is not dict:
        raise ValueError("fresh QAT v2 training runtime must be an object")
    if getattr(args, "val_data", None):
        raise ValueError("fresh QAT v2 may not receive model-selection data")
    if getattr(args, "experiment_family", None) != "int16-aware":
        raise ValueError("fresh QAT v2 experiment family mismatch")
    seed = getattr(args, "seed", None)
    selected = next(
        (slot for slot in plan["slots"] if slot["seed"] == seed),
        None,
    )
    if selected is None:
        raise ValueError("fresh QAT v2 seed is not preregistered")
    _exact_repository_path(
        getattr(args, "out", None),
        root,
        selected["output"],
        "fresh QAT v2 output path mismatch",
    )
    for field, expected in plan["runtime"].items():
        actual = training_runtime.get(field)
        if type(actual) is not type(expected) or actual != expected:
            raise ValueError(f"fresh QAT v2 runtime {field} mismatch")
    for field in ("mps_built", "mps_available", "cuda_available"):
        if type(training_runtime.get(field)) is not bool:
            raise ValueError(f"fresh QAT v2 runtime {field} must be boolean")

    selection_filename = FRESH.FRESH_QAT_SELECTION_PROTECTED_FILENAME
    holdout = getattr(args, "holdout_protected_position_ids", None)
    if type(holdout) is not str or not holdout:
        raise ValueError("fresh QAT v2 holdout protected path is required")
    input_paths = {
        "sibling_teacher_manifest": getattr(args, "sibling_manifest", None),
        "validation_partition_manifest": getattr(
            args, "validation_partition_manifest", None
        ),
        "model_training": getattr(args, "data", None),
        "replay": getattr(args, "replay_data", None),
        "warm_initializer": getattr(args, "init_ckpt", None),
        "policy_exposure_receipt": getattr(
            args, "policy_exposure_receipt", None
        ),
        "policy_exposed_parent_ids": getattr(
            args, "policy_exposed_parent_ids", None
        ),
        "policy_exposed_semantic_position_ids": getattr(
            args, "policy_exposed_semantic_position_ids", None
        ),
        "holdout_protected_position_ids": holdout,
        "fresh_selection_protected_position_ids": os.path.join(
            os.path.dirname(os.path.abspath(holdout)),
            selection_filename,
        ),
        "replay_exclusion": getattr(
            args, "replay_excluded_position_ids", None
        ),
    }
    input_paths["model_training"] = _exact_repository_path(
        input_paths["model_training"],
        root,
        FRESH_QAT_V2_TRAIN_RELATIVE_PATH,
        "fresh QAT v2 model-training path mismatch",
    )
    verified: dict[str, dict[str, Any]] = {}
    for field, path_value in input_paths.items():
        if type(path_value) is not str or not path_value:
            raise ValueError(f"fresh QAT v2 {field} path is required")
        identity = plan["inputs"][field]
        raw = _read_with_reader(
            artifact_reader,
            path_value,
            f"fresh QAT v2 {field}",
            identity["bytes"],
            repository_root=(
                root if field == "model_training" else None
            ),
        )
        if (
            len(raw) != identity["bytes"]
            or hashlib.sha256(raw).hexdigest() != identity["sha256"]
        ):
            raise ValueError(f"fresh QAT v2 {field} identity mismatch")
        if (
            _read_with_reader(
                artifact_reader,
                path_value,
                f"fresh QAT v2 {field}",
                identity["bytes"],
                repository_root=(
                    root if field == "model_training" else None
                ),
            )
            != raw
        ):
            raise ValueError(f"fresh QAT v2 {field} changed during verification")
        verified[field] = {
            "path": os.path.abspath(path_value),
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        }
    return selected, verified


def _dispatch_fresh_qat_v2_execution_plan(
    args: Any,
    *,
    tracking_verifier: Callable[[str, str], None],
    repo_root: str,
    protocol_reader: Callable[[str], bytes],
    artifact_reader: Callable[[str], bytes],
    training_runtime_reader: Callable[[], Mapping[str, Any]],
) -> dict[str, Any]:
    root = os.path.realpath(repo_root)
    plan_path = _exact_requested_plan_path(args, root)
    revision = getattr(args, "pipeline_revision", None)
    if type(revision) is not str or not revision:
        raise ValueError("fresh QAT v2 pipeline revision is required")

    anchor_path = os.path.join(
        root, FRESH_QAT_V2_ACTIVATION_ANCHOR_RELATIVE_PATH
    )
    anchor_raw = _read_with_reader(
        protocol_reader,
        anchor_path,
        "fresh QAT v2 activation anchor",
        FRESH_QAT_V2_ACTIVATION_ANCHOR_BYTES,
        repository_root=root,
    )
    if (
        len(anchor_raw) != FRESH_QAT_V2_ACTIVATION_ANCHOR_BYTES
        or hashlib.sha256(anchor_raw).hexdigest()
        != FRESH_QAT_V2_ACTIVATION_ANCHOR_SHA256
    ):
        raise ValueError("fresh QAT v2 activation anchor identity mismatch")
    anchor = _strict_json(anchor_raw, "fresh QAT v2 activation anchor")
    validate_fresh_qat_v2_activation_anchor_data(anchor)
    tracking_verifier(anchor_path, revision)
    if (
        _read_with_reader(
            protocol_reader,
            anchor_path,
            "fresh QAT v2 activation anchor",
            FRESH_QAT_V2_ACTIVATION_ANCHOR_BYTES,
            repository_root=root,
        )
        != anchor_raw
    ):
        raise ValueError("fresh QAT v2 activation anchor changed")

    successor_path = os.path.join(
        root, FRESH_QAT_V2_READY_SUCCESSOR_RELATIVE_PATH
    )
    try:
        successor_raw = _read_unbound_with_reader(
            protocol_reader,
            successor_path,
            "fresh QAT v2 ready successor",
            _DEFAULT_UNBOUND_PROTOCOL_MAX_BYTES,
            repository_root=root,
        )
    except (FileNotFoundError, OSError, _SecureFileAccessError):
        raise FreshQATV2ActivationStop(
            "ready-successor",
            "additive ready successor is absent",
        ) from None
    successor = _strict_json(
        successor_raw,
        "fresh QAT v2 ready successor",
    )
    validate_fresh_qat_v2_ready_successor_data(successor)
    tracking_verifier(successor_path, revision)
    if (
        _read_unbound_with_reader(
            protocol_reader,
            successor_path,
            "fresh QAT v2 ready successor",
            _DEFAULT_UNBOUND_PROTOCOL_MAX_BYTES,
            repository_root=root,
        )
        != successor_raw
    ):
        raise ValueError("fresh QAT v2 ready successor changed")

    for identity, label in (
        (_V1_PLAN_REGISTRY_IDENTITY, "fresh QAT v1 plan registry"),
        (_V1_SELECTION_REGISTRY_IDENTITY, "fresh QAT v1 selection registry"),
        (_CLOSED_V2_REGISTRY_IDENTITY, "fresh QAT closed v2 registry"),
    ):
        raw = _verify_artifact_identity(
            root, identity, label, protocol_reader
        )
        tracking_verifier(os.path.join(root, identity["path"]), revision)
        if identity is _CLOSED_V2_REGISTRY_IDENTITY:
            closed = _strict_json(raw, label)
            ACCOUNTING.validate_closed_fresh_qat_plan_registry_v2_data(
                closed
            )

    proposal_identity = successor["parent_accounting_proposal"]
    plan_identity = successor["execution_plan"]
    input_identity = successor["input_training"]
    completion_identity = successor["parent_completion"]
    train_identity = successor["train_jsonl"]
    proposal_raw = _verify_artifact_identity(
        root,
        proposal_identity,
        "fresh QAT v2 parent-accounting proposal",
        artifact_reader,
    )
    plan_raw = _verify_artifact_identity(
        root,
        plan_identity,
        "fresh QAT v2 execution plan",
        artifact_reader,
    )
    input_raw = _verify_artifact_identity(
        root,
        input_identity,
        "fresh QAT v2 exact input training",
        artifact_reader,
    )
    completion_raw = _verify_artifact_identity(
        root,
        completion_identity,
        "fresh QAT v2 enrolled parent completion",
        artifact_reader,
    )
    train_raw = _verify_artifact_identity(
        root,
        train_identity,
        "fresh QAT v2 train JSONL",
        artifact_reader,
    )
    for identity in (
        proposal_identity,
        plan_identity,
        input_identity,
        completion_identity,
        train_identity,
    ):
        tracking_verifier(os.path.join(root, identity["path"]), revision)

    proposal = _strict_json(
        proposal_raw,
        "fresh QAT v2 parent-accounting proposal",
    )
    source_validated_proposal = (
        ACCOUNTING.validate_fresh_qat_parent_accounting_proposal_v2(
            proposal,
            input_raw,
            completion_raw,
            train_raw,
        )
    )
    if not _typed_equal(source_validated_proposal, proposal):
        raise ValueError(
            "fresh QAT v2 source-accounting validator returned another proposal"
        )
    _validate_proposal(proposal, successor)
    plan = _strict_json(plan_raw, "fresh QAT v2 execution plan")
    _validate_plan(plan, proposal, successor)
    training_runtime = training_runtime_reader()
    selected, verified_inputs = _validate_args_and_runtime(
        args,
        plan,
        training_runtime,
        root,
        artifact_reader,
    )
    contract = FRESH.build_fresh_qat_training_contract(plan, selected)
    expected_contract = next(
        item
        for item in proposal["training_contracts"]
        if item["seed"] == selected["seed"]
    )
    if not _typed_equal(contract, expected_contract):
        raise ValueError("fresh QAT v2 selected training contract mismatch")
    if (
        contract["schema"] != FRESH.FRESH_QAT_TRAINING_CONTRACT_SCHEMA
        or contract["model_training_parents"]
        != successor["parent_accounting"]["emitted_parent_groups"]
    ):
        raise ValueError("fresh QAT v2 emitted-parent contract mismatch")
    return {
        "provenance": {
            "path": plan_path,
            "bytes": plan_identity["bytes"],
            "sha256": plan_identity["sha256"],
            "schema": FRESH_QAT_V2_EXECUTION_PLAN_SCHEMA,
            "slot_id": selected["id"],
            "slot_output": selected["output"],
            "parent_accounting_proposal_sha256": proposal_identity["sha256"],
            "emitted_parent_groups": successor["parent_accounting"][
                "emitted_parent_groups"
            ],
            "forced_parents_skipped": successor["parent_accounting"][
                "forced_parents_skipped"
            ],
            "verified_input_sha256": {
                field: identity["sha256"]
                for field, identity in verified_inputs.items()
            },
        },
        "contract": contract,
        "replay_exclusion": copy.deepcopy(plan["inputs"]["replay_exclusion"]),
        "activation": {
            "anchor_sha256": FRESH_QAT_V2_ACTIVATION_ANCHOR_SHA256,
            "ready_successor_sha256": hashlib.sha256(
                successor_raw
            ).hexdigest(),
            "authority_source": "additive-tracked-ready-successor-v1",
        },
    }


def dispatch_fresh_qat_v2_execution_plan_core_for_tests(
    args: Any,
    *,
    tracking_verifier: Callable[[str, str], None],
    repo_root: str,
    protocol_reader: Callable[[str], bytes],
    artifact_reader: Callable[[str], bytes],
    training_runtime_reader: Callable[[], Mapping[str, Any]],
) -> dict[str, Any]:
    """Exercise the future route with explicit synthetic readers only."""

    return _dispatch_fresh_qat_v2_execution_plan(
        args,
        tracking_verifier=tracking_verifier,
        repo_root=repo_root,
        protocol_reader=protocol_reader,
        artifact_reader=artifact_reader,
        training_runtime_reader=training_runtime_reader,
    )


def verify_fresh_qat_v2_execution_plan(
    args: Any,
    training_runtime: Mapping[str, Any],
    *,
    tracking_verifier: Callable[[str, str], None],
) -> dict[str, Any]:
    """Production shell: currently always STOPs because successor is absent."""

    root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
    return _dispatch_fresh_qat_v2_execution_plan(
        args,
        tracking_verifier=tracking_verifier,
        repo_root=root,
        protocol_reader=_default_reader,
        artifact_reader=_default_reader,
        training_runtime_reader=lambda: training_runtime,
    )


__all__ = [
    "FRESH_QAT_V2_ACTIVATION_ANCHOR_BYTES",
    "FRESH_QAT_V2_ACTIVATION_ANCHOR_RELATIVE_PATH",
    "FRESH_QAT_V2_ACTIVATION_ANCHOR_SCHEMA",
    "FRESH_QAT_V2_ACTIVATION_ANCHOR_SHA256",
    "FRESH_QAT_V2_EXECUTION_PLAN_RELATIVE_PATH",
    "FRESH_QAT_V2_EXECUTION_PLAN_SCHEMA",
    "FRESH_QAT_V2_INPUT_TRAINING_RELATIVE_PATH",
    "FRESH_QAT_V2_PARENT_COMPLETION_RELATIVE_PATH",
    "FRESH_QAT_V2_READY_SUCCESSOR_RELATIVE_PATH",
    "FRESH_QAT_V2_READY_SUCCESSOR_SCHEMA",
    "FRESH_QAT_V2_SCHEMA_PAIR",
    "FRESH_QAT_V2_TRAIN_FORMAT",
    "FRESH_QAT_V2_TRAIN_RELATIVE_PATH",
    "FreshQATV2ActivationStop",
    "FreshQATV2NoTrainableParentGroups",
    "dispatch_fresh_qat_v2_execution_plan_core_for_tests",
    "validate_fresh_qat_v2_activation_anchor",
    "validate_fresh_qat_v2_activation_anchor_data",
    "validate_fresh_qat_v2_ready_successor_data",
    "verify_fresh_qat_v2_execution_plan",
]
