#!/usr/bin/env python3
"""Mechanically bind the two frozen phase-1 teacher checkpoint hashes.

This command is intentionally narrow.  It verifies the exact preregistered
pre-bind protocol, an explicitly byte/SHA-bound phase-1 terminal result, and
the actual checkpoint bytes before replacing exactly two JSON string values.
It does not import torch, inspect checkpoint contents, or open tune/sealed
data.
"""

from __future__ import annotations

import argparse
from collections.abc import Mapping, Sequence
import hashlib
import json
import os
from pathlib import Path
import stat
import uuid
from typing import Any


PREBIND_PROTOCOL_SCHEMA = (
    "shogi-child-board-root-policy-student-runtime-plan-v1"
)
PREBIND_PROTOCOL_BYTES = 57_496
PREBIND_PROTOCOL_SHA256 = (
    "e011bfd0d415ef580d80983e33bd88fd970af92d2c944dddd01784160d61fc47"
)
PARENT_PROTOCOL_BYTES = 42_427
PARENT_PROTOCOL_SHA256 = (
    "b9b8256433cec77da8d32a6d05018b9a5e405e5b57fdabe299490a5f9f90cfe2"
)
PHASE1_RESULT_SCHEMA = "shogi-child-board-strength-candidate-result-v1"
PHASE1_RESULT_STATUS = (
    "complete-phase1-two-scratch-checkpoints-frozen-tune-locked"
)
BINDING_RECEIPT_SCHEMA = (
    "shogi-child-board-root-policy-student-teacher-binding-v1"
)
BINDING_RECEIPT_STATUS = "complete-two-teacher-hashes-mechanically-bound"
CHECKPOINT_RECEIPT_SCHEMA = (
    "shogi-child-board-strength-candidate-checkpoint-receipt-v1"
)

SEED_42_POINTER = (
    "/teacher_checkpoint_bindings/designated_distillation_teacher/"
    "checkpoint_sha256"
)
SEED_314159_POINTER = (
    "/teacher_checkpoint_bindings/replication_teacher/checkpoint_sha256"
)
CHANGED_JSON_POINTERS = (SEED_42_POINTER, SEED_314159_POINTER)
PLACEHOLDERS = {
    42: "__BIND_PHASE1_SEED_42_FINAL_CHECKPOINT_SHA256__",
    314159: "__BIND_PHASE1_SEED_314159_FINAL_CHECKPOINT_SHA256__",
}

_HEX = frozenset("0123456789abcdef")


class BindingError(ValueError):
    """The prospective binding contract was not met."""


def _reject_constant(value: str) -> None:
    raise BindingError(f"non-finite JSON number is forbidden: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise BindingError(f"duplicate JSON key is forbidden: {key}")
        result[key] = value
    return result


def _strict_json_bytes(raw: bytes, label: str) -> dict[str, Any]:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise BindingError(f"{label} is not UTF-8") from error
    try:
        value = json.loads(
            text,
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (json.JSONDecodeError, BindingError) as error:
        raise BindingError(f"{label} is not strict JSON: {error}") from error
    if type(value) is not dict:
        raise BindingError(f"{label} root must be an object")
    return value


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _require_sha256(value: object, label: str) -> str:
    if (
        type(value) is not str
        or len(value) != 64
        or any(character not in _HEX for character in value)
    ):
        raise BindingError(f"{label} must be 64 lowercase hex characters")
    return value


def _read_regular_no_symlink(path: Path, label: str) -> bytes:
    try:
        metadata = path.lstat()
    except OSError as error:
        raise BindingError(f"{label} is unavailable: {path}") from error
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise BindingError(f"{label} must be a regular non-symlink file")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
        with os.fdopen(descriptor, "rb") as stream:
            raw = stream.read()
    except OSError as error:
        raise BindingError(f"{label} could not be read safely: {path}") from error
    return raw


def _pointer_get(document: Mapping[str, Any], pointer: str) -> Any:
    current: Any = document
    if not pointer.startswith("/"):
        raise BindingError(f"invalid JSON pointer: {pointer}")
    for escaped in pointer[1:].split("/"):
        part = escaped.replace("~1", "/").replace("~0", "~")
        if type(current) is dict and part in current:
            current = current[part]
        else:
            raise BindingError(f"JSON pointer is absent: {pointer}")
    return current


def _escape_pointer_part(value: str) -> str:
    return value.replace("~", "~0").replace("/", "~1")


def _changed_pointers(before: Any, after: Any, pointer: str = "") -> list[str]:
    if type(before) is not type(after):
        return [pointer]
    if type(before) is dict:
        if set(before) != set(after):
            return [pointer]
        changed: list[str] = []
        for key in before:
            child = f"{pointer}/{_escape_pointer_part(key)}"
            changed.extend(_changed_pointers(before[key], after[key], child))
        return changed
    if type(before) is list:
        if len(before) != len(after):
            return [pointer]
        changed = []
        for index, (left, right) in enumerate(zip(before, after)):
            changed.extend(
                _changed_pointers(left, right, f"{pointer}/{index}")
            )
        return changed
    return [] if before == after else [pointer]


def _validate_prebind_protocol(
    raw: bytes,
    *,
    expected_bytes: int = PREBIND_PROTOCOL_BYTES,
    expected_sha256: str = PREBIND_PROTOCOL_SHA256,
) -> dict[str, Any]:
    if len(raw) != expected_bytes or _sha256(raw) != expected_sha256:
        raise BindingError("pre-bind protocol byte/SHA identity mismatch")
    protocol = _strict_json_bytes(raw, "pre-bind protocol")
    if protocol.get("schema") != PREBIND_PROTOCOL_SCHEMA:
        raise BindingError("pre-bind protocol schema mismatch")
    bindings = protocol.get("teacher_checkpoint_bindings")
    if type(bindings) is not dict:
        raise BindingError("teacher checkpoint bindings are absent")
    if bindings.get("only_unresolved_slots") != list(CHANGED_JSON_POINTERS):
        raise BindingError("only_unresolved_slots is not the exact two-slot list")
    for seed, pointer in zip((42, 314159), CHANGED_JSON_POINTERS):
        placeholder = PLACEHOLDERS[seed]
        if _pointer_get(protocol, pointer) != placeholder:
            raise BindingError(f"seed-{seed} placeholder mismatch")
        encoded = json.dumps(placeholder).encode("ascii")
        if raw.count(encoded) != 1:
            raise BindingError(
                f"seed-{seed} placeholder must occur exactly once as a JSON value"
            )
    if sum(raw.count(value.encode("ascii")) for value in PLACEHOLDERS.values()) != 2:
        raise BindingError("pre-bind protocol contains an unexpected placeholder")
    terminal = bindings.get("phase1_terminal_result")
    expected_terminal = {
        "required_schema": PHASE1_RESULT_SCHEMA,
        "required_status": PHASE1_RESULT_STATUS,
        "required_parent_protocol_sha256": PARENT_PROTOCOL_SHA256,
        "required_tune_opened": False,
        "required_sealed_opened": False,
        "required_live_weights_changed": False,
    }
    if type(terminal) is not dict or any(
        terminal.get(key) != value
        for key, value in expected_terminal.items()
    ):
        raise BindingError("pre-bind phase-1 terminal gates mismatch")
    return protocol


def _checkpoint_identity(
    receipt: object,
    *,
    seed: int,
) -> dict[str, object]:
    if type(receipt) is not dict:
        raise BindingError(f"seed-{seed} final checkpoint receipt is not an object")
    if receipt.get("schema") != CHECKPOINT_RECEIPT_SCHEMA:
        raise BindingError(f"seed-{seed} checkpoint receipt schema mismatch")
    if type(receipt.get("seed")) is not int or receipt["seed"] != seed:
        raise BindingError(f"seed-{seed} checkpoint receipt seed mismatch")
    identity = receipt.get("checkpoint")
    if type(identity) is not dict or set(identity) != {"path", "bytes", "sha256"}:
        raise BindingError(f"seed-{seed} checkpoint identity is malformed")
    checkpoint_path = identity.get("path")
    checkpoint_bytes = identity.get("bytes")
    checkpoint_sha = _require_sha256(
        identity.get("sha256"), f"seed-{seed} checkpoint SHA-256"
    )
    if (
        type(checkpoint_path) is not str
        or not Path(checkpoint_path).is_absolute()
        or type(checkpoint_bytes) is not int
        or checkpoint_bytes < 1
    ):
        raise BindingError(f"seed-{seed} checkpoint path/bytes are malformed")
    raw = _read_regular_no_symlink(
        Path(checkpoint_path), f"seed-{seed} checkpoint"
    )
    if len(raw) != checkpoint_bytes or _sha256(raw) != checkpoint_sha:
        raise BindingError(f"seed-{seed} actual checkpoint byte/SHA mismatch")
    return {
        "path": checkpoint_path,
        "bytes": checkpoint_bytes,
        "sha256": checkpoint_sha,
    }


def _validate_phase1_result(
    raw: bytes,
    *,
    expected_bytes: int,
    expected_sha256: str,
) -> tuple[dict[str, Any], dict[int, dict[str, object]], dict[int, str]]:
    _require_sha256(expected_sha256, "expected phase-1 result SHA-256")
    if expected_bytes < 1:
        raise BindingError("expected phase-1 result bytes must be positive")
    if len(raw) != expected_bytes or _sha256(raw) != expected_sha256:
        raise BindingError("phase-1 result byte/SHA identity mismatch")
    result = _strict_json_bytes(raw, "phase-1 result")
    if result.get("schema") != PHASE1_RESULT_SCHEMA:
        raise BindingError("phase-1 result schema mismatch")
    if result.get("status") != PHASE1_RESULT_STATUS:
        raise BindingError("phase-1 result status mismatch")
    protocol = result.get("protocol")
    if (
        type(protocol) is not dict
        or protocol.get("bytes") != PARENT_PROTOCOL_BYTES
        or protocol.get("sha256") != PARENT_PROTOCOL_SHA256
    ):
        raise BindingError("phase-1 parent protocol identity mismatch")
    for gate in ("tune_opened", "sealed_opened", "live_weights_changed"):
        if type(result.get(gate)) is not bool or result[gate] is not False:
            raise BindingError(f"phase-1 gate must be false: {gate}")
    training = result.get("training")
    receipts = (
        training.get("final_checkpoints")
        if type(training) is dict
        else None
    )
    if type(receipts) is not list or len(receipts) != 2:
        raise BindingError("phase-1 result must contain exactly two checkpoints")
    by_seed: dict[int, tuple[int, dict[str, Any]]] = {}
    for index, receipt in enumerate(receipts):
        seed = receipt.get("seed") if type(receipt) is dict else None
        if type(seed) is not int or seed not in (42, 314159) or seed in by_seed:
            raise BindingError("phase-1 checkpoint seeds must be unique 42/314159")
        by_seed[seed] = (index, receipt)
    if set(by_seed) != {42, 314159}:
        raise BindingError("phase-1 checkpoint seeds must be exactly 42/314159")
    identities: dict[int, dict[str, object]] = {}
    source_pointers: dict[int, str] = {}
    for seed in (42, 314159):
        index, receipt = by_seed[seed]
        identities[seed] = _checkpoint_identity(receipt, seed=seed)
        source_pointers[seed] = (
            f"/training/final_checkpoints/{index}/checkpoint/sha256"
        )
    return result, identities, source_pointers


def bind_protocol_bytes(
    prebind_raw: bytes,
    phase1_result_raw: bytes,
    *,
    phase1_result_bytes: int,
    phase1_result_sha256: str,
    expected_prebind_bytes: int = PREBIND_PROTOCOL_BYTES,
    expected_prebind_sha256: str = PREBIND_PROTOCOL_SHA256,
) -> tuple[bytes, dict[str, Any]]:
    """Return post-bind bytes and verified source material for the receipt."""

    before = _validate_prebind_protocol(
        prebind_raw,
        expected_bytes=expected_prebind_bytes,
        expected_sha256=expected_prebind_sha256,
    )
    result, checkpoints, source_pointers = _validate_phase1_result(
        phase1_result_raw,
        expected_bytes=phase1_result_bytes,
        expected_sha256=phase1_result_sha256,
    )
    postbind_raw = prebind_raw
    for seed in (42, 314159):
        old = json.dumps(PLACEHOLDERS[seed]).encode("ascii")
        new = json.dumps(checkpoints[seed]["sha256"]).encode("ascii")
        if postbind_raw.count(old) != 1:
            raise BindingError(f"seed-{seed} replacement count is not one")
        postbind_raw = postbind_raw.replace(old, new, 1)
    after = _strict_json_bytes(postbind_raw, "post-bind protocol")
    changed = _changed_pointers(before, after)
    if changed != list(CHANGED_JSON_POINTERS):
        raise BindingError(
            f"post-bind JSON changed outside exact two slots: {changed}"
        )
    for seed, pointer in zip((42, 314159), CHANGED_JSON_POINTERS):
        if _pointer_get(after, pointer) != checkpoints[seed]["sha256"]:
            raise BindingError(f"seed-{seed} post-bind value mismatch")
    return postbind_raw, {
        "phase1_result": result,
        "checkpoints": checkpoints,
        "source_pointers": source_pointers,
        "changed_json_pointers": changed,
    }


def _canonical_json(value: Mapping[str, object]) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
        + b"\n"
    )


def _atomic_publish(path: Path, raw: bytes, *, replace: bool) -> None:
    parent = path.parent
    try:
        parent_resolved = parent.resolve(strict=True)
    except OSError as error:
        raise BindingError(f"output parent is unavailable: {parent}") from error
    if not parent_resolved.is_dir():
        raise BindingError(f"output parent is not a directory: {parent}")
    temporary = parent / f".{path.name}.tmp-{os.getpid()}-{uuid.uuid4().hex}"
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_NOFOLLOW", 0)
    )
    try:
        descriptor = os.open(temporary, flags, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        if replace:
            os.replace(temporary, path)
        else:
            os.link(temporary, path)
            temporary.unlink()
        directory_fd = os.open(parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    except OSError as error:
        raise BindingError(f"atomic publication failed: {path}") from error
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def bind_and_publish(
    args: argparse.Namespace,
    *,
    expected_prebind_bytes: int = PREBIND_PROTOCOL_BYTES,
    expected_prebind_sha256: str = PREBIND_PROTOCOL_SHA256,
) -> dict[str, Any]:
    protocol_path = Path(args.protocol)
    result_path = Path(args.phase1_result)
    bound_path = Path(args.bound_protocol_out)
    receipt_path = Path(args.receipt_out)
    prebind_raw = _read_regular_no_symlink(protocol_path, "pre-bind protocol")
    result_raw = _read_regular_no_symlink(result_path, "phase-1 result")
    postbind_raw, evidence = bind_protocol_bytes(
        prebind_raw,
        result_raw,
        phase1_result_bytes=args.phase1_result_bytes,
        phase1_result_sha256=args.phase1_result_sha256,
        expected_prebind_bytes=expected_prebind_bytes,
        expected_prebind_sha256=expected_prebind_sha256,
    )
    same_protocol_path = (
        protocol_path.absolute() == bound_path.absolute()
    )
    if receipt_path.exists():
        raise BindingError("binding receipt already exists")
    if not same_protocol_path and bound_path.exists():
        raise BindingError("bound protocol output already exists")
    checkpoints = evidence["checkpoints"]
    source_pointers = evidence["source_pointers"]
    receipt: dict[str, Any] = {
        "schema": BINDING_RECEIPT_SCHEMA,
        "status": BINDING_RECEIPT_STATUS,
        "source_phase1_result": {
            "path": str(result_path),
            "bytes": len(result_raw),
            "sha256": _sha256(result_raw),
            "schema": PHASE1_RESULT_SCHEMA,
            "status": PHASE1_RESULT_STATUS,
            "parent_protocol_sha256": PARENT_PROTOCOL_SHA256,
            "tune_opened": False,
            "sealed_opened": False,
            "live_weights_changed": False,
        },
        "prebind_protocol": {
            "path": str(protocol_path),
            "bytes": len(prebind_raw),
            "sha256": _sha256(prebind_raw),
            "schema": PREBIND_PROTOCOL_SCHEMA,
        },
        "bindings": [
            {
                "seed": seed,
                "json_pointer": pointer,
                "source_json_pointer": source_pointers[seed],
                "checkpoint": checkpoints[seed],
            }
            for seed, pointer in zip((42, 314159), CHANGED_JSON_POINTERS)
        ],
        "postbind_protocol": {
            "path": str(bound_path),
            "bytes": len(postbind_raw),
            "sha256": _sha256(postbind_raw),
            "schema": PREBIND_PROTOCOL_SCHEMA,
        },
        "changed_json_pointers": list(CHANGED_JSON_POINTERS),
        "replacement_count": 2,
        "authority": (
            "fit-only-seed42-distillation-and-student-implementation-only"
        ),
        "tune_opened": False,
        "sealed_opened": False,
        "live_weights_changed": False,
        "strength_claim_authorized": False,
        "deployment_authorized": False,
    }
    _atomic_publish(bound_path, postbind_raw, replace=same_protocol_path)
    _atomic_publish(receipt_path, _canonical_json(receipt), replace=False)
    return receipt


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", required=True, type=Path)
    parser.add_argument("--phase1-result", required=True, type=Path)
    parser.add_argument("--phase1-result-bytes", required=True, type=int)
    parser.add_argument("--phase1-result-sha256", required=True)
    parser.add_argument("--bound-protocol-out", required=True, type=Path)
    parser.add_argument("--receipt-out", required=True, type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        receipt = bind_and_publish(args)
    except BindingError as error:
        raise SystemExit(f"binding refused: {error}") from error
    print(json.dumps(receipt, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
