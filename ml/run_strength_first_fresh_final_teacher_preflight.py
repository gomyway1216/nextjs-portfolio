#!/usr/bin/env python3
"""Receipt-gated preflight for the fresh-final sibling teacher.

The checked-in selection-evaluator registry is currently closed. Production
therefore emits a machine-readable STOP before opening the published
selection receipt, the private selection dataset, or any fresh-final row.

A future reviewed READY registry follows the same argumentless path: tracked
registry bindings are authenticated, the fixed private receipt is read once
with current-user file checks, and every ranking, metric gate, family gate,
and three-checkpoint preflight binding is recomputed. This module deliberately
does not consult the downstream READY registry, start an engine, or grant a
holdout/live-write authorization.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
from typing import Any

from fresh_qat_selection_preflight import _verify_tracked_file
import strength_first_downstream_gates as DOWNSTREAM
import strength_first_qat_selection_evaluator as SELECTION


SUMMARY_SCHEMA = (
    "shogi-floodgate-strength-first-fresh-final-teacher-selection-preflight-v1"
)
SUMMARY_STATUS = "selected-candidate-receipt-recomputed"
CLI_SCHEMA = (
    "shogi-floodgate-strength-first-fresh-final-teacher-preflight-cli-v1"
)


class FreshFinalTeacherPreflightBlocked(RuntimeError):
    """The reviewed selection registry and receipt do not yet authorize work."""


@dataclass(frozen=True)
class _Dependencies:
    read_bytes: Callable[[str], bytes]
    verify_tracked: Callable[[str, bytes], None]
    read_private_receipt: Callable[[str], bytes]


def _strict_json(raw: bytes, label: str) -> dict[str, Any]:
    if type(raw) is not bytes or not raw:
        raise ValueError(f"{label} must be nonempty immutable bytes")

    def object_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"{label} contains a duplicate JSON key")
            result[key] = value
        return result

    def reject_constant(value):
        raise ValueError(f"{label} contains a non-finite value: {value}")

    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=object_pairs,
            parse_constant=reject_constant,
        )
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"{label} is not strict UTF-8 JSON") from error
    if type(value) is not dict:
        raise ValueError(f"{label} root must be an object")
    return value


def _canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
        + b"\n"
    )


def _identity(
    *,
    path: str,
    raw: bytes,
    schema: str,
) -> dict[str, Any]:
    return {
        "path": path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": schema,
    }


def _validate_tracked_identity(
    repo_root: Path,
    identity: Mapping[str, Any],
    dependencies: _Dependencies,
    label: str,
) -> None:
    path = repo_root / identity["path"]
    raw = dependencies.read_bytes(str(path))
    if (
        type(raw) is not bytes
        or len(raw) != identity["bytes"]
        or hashlib.sha256(raw).hexdigest() != identity["sha256"]
    ):
        raise ValueError(f"{label} identity mismatch")
    if identity["path"].endswith(".json"):
        value = _strict_json(raw, label)
        if value.get("schema") != identity["schema"]:
            raise ValueError(f"{label} schema mismatch")
    dependencies.verify_tracked(str(path), raw)


def build_fresh_final_teacher_selection_preflight(
    *,
    registry: Mapping[str, Any],
    registry_raw: bytes,
    receipt: Mapping[str, Any],
    receipt_raw: bytes,
) -> dict[str, Any]:
    """Recompute the receipt and return only portable, non-label evidence."""

    if _canonical_json_bytes(receipt) != receipt_raw:
        raise ValueError("selection receipt is not canonical JSON")
    selected = DOWNSTREAM.validate_selection_receipt_against_evaluator_registry(
        receipt,
        selection_registry=registry,
    )
    receipt_identity = _identity(
        path=SELECTION.STRENGTH_FIRST_SELECTION_RECEIPT_PATH,
        raw=receipt_raw,
        schema=SELECTION.STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA,
    )
    return {
        "schema": SUMMARY_SCHEMA,
        "status": SUMMARY_STATUS,
        "selection_evaluator_registry": _identity(
            path=(
                SELECTION
                .STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
            ),
            raw=registry_raw,
            schema=SELECTION.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_SCHEMA,
        ),
        "selection_receipt": receipt_identity,
        "selected_seed": selected["selected_seed"],
        "selected_checkpoint": selected["selected_checkpoint"],
        "selection_receipt_reads": 1,
        "selection_dataset_reads": 0,
        "fresh_final_source_opened": False,
        "fresh_final_label_reads": 0,
        "teacher_engines_started": 0,
        "network_requests": 0,
        "cloud_requests": 0,
        "live_weight_writes": 0,
    }


def run_strength_first_fresh_final_teacher_preflight_core(
    *,
    repo_root: str,
    home_root: str,
    dependencies: _Dependencies,
) -> dict[str, Any]:
    root = Path(repo_root).resolve()
    home = Path(home_root).expanduser().resolve()
    registry_path = (
        root
        / SELECTION.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
    )
    registry_raw = dependencies.read_bytes(str(registry_path))
    registry = _strict_json(registry_raw, "selection evaluator registry")
    registry = dict(
        SELECTION.validate_strength_first_selection_evaluator_registry_data(
            registry
        )
    )
    dependencies.verify_tracked(str(registry_path), registry_raw)

    if (
        registry["status"]
        != SELECTION.STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS
    ):
        raise FreshFinalTeacherPreflightBlocked(
            "selected candidate receipt is not enrolled and ready"
        )

    for name, identity in registry["protocol"].items():
        if name == "fresh_selection_source":
            continue
        _validate_tracked_identity(
            root,
            identity,
            dependencies,
            f"selection evaluator protocol {name}",
        )
    for name, identity in registry["implementation"].items():
        _validate_tracked_identity(
            root,
            identity,
            dependencies,
            f"selection evaluator implementation {name}",
        )
    for name in ("training_plan", "selection_preflight_registry"):
        _validate_tracked_identity(
            root,
            registry["enrollments"][name],
            dependencies,
            f"selection evaluator enrollment {name}",
        )

    receipt_relative = registry["fixed_paths"]["selection_receipt"]
    if receipt_relative != SELECTION.STRENGTH_FIRST_SELECTION_RECEIPT_PATH:
        raise ValueError("selection receipt fixed path drifted")
    receipt_path = home / receipt_relative
    if os.path.realpath(receipt_path) != os.path.abspath(receipt_path):
        raise ValueError("selection receipt fixed path is not canonical")
    receipt_raw = dependencies.read_private_receipt(str(receipt_path))
    receipt = _strict_json(receipt_raw, "selection receipt")
    return build_fresh_final_teacher_selection_preflight(
        registry=registry,
        registry_raw=registry_raw,
        receipt=receipt,
        receipt_raw=receipt_raw,
    )


def _read_private_receipt(path: str) -> bytes:
    before = os.lstat(path)
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_uid != os.geteuid()
        or stat.S_IMODE(before.st_mode) != 0o600
        or before.st_nlink != 1
    ):
        raise ValueError("selection receipt must be a current-user 0600 regular file")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    try:
        opened = os.fstat(descriptor)
        if (
            opened.st_dev != before.st_dev
            or opened.st_ino != before.st_ino
            or not stat.S_ISREG(opened.st_mode)
        ):
            raise ValueError("selection receipt changed before open")
        blocks = []
        while True:
            block = os.read(descriptor, 1024 * 1024)
            if not block:
                break
            blocks.append(block)
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    final = os.lstat(path)
    observed = (
        before.st_dev,
        before.st_ino,
        before.st_mode,
        before.st_size,
        before.st_mtime_ns,
        before.st_ctime_ns,
        before.st_nlink,
    )
    for current in (after, final):
        if (
            current.st_dev,
            current.st_ino,
            current.st_mode,
            current.st_size,
            current.st_mtime_ns,
            current.st_ctime_ns,
            current.st_nlink,
        ) != observed:
            raise ValueError("selection receipt changed while being read")
    return b"".join(blocks)


def run_strength_first_fresh_final_teacher_preflight() -> dict[str, Any]:
    root = os.path.realpath(Path(__file__).resolve().parent.parent)
    home = os.path.realpath(Path.home())
    revision = SELECTION._git_head(root)
    dependencies = _Dependencies(
        read_bytes=lambda path: Path(path).read_bytes(),
        verify_tracked=lambda path, raw: _verify_tracked_file(
            path,
            revision,
            raw,
        ),
        read_private_receipt=_read_private_receipt,
    )
    return run_strength_first_fresh_final_teacher_preflight_core(
        repo_root=root,
        home_root=home,
        dependencies=dependencies,
    )


def _stop(reason: str) -> dict[str, Any]:
    return {
        "schema": CLI_SCHEMA,
        "status": "STOP",
        "reason": reason,
        "selection_evaluator_registry_reads": 1,
        "selection_receipt_reads": 0,
        "selection_dataset_reads": 0,
        "fresh_final_source_reads": 0,
        "fresh_final_label_reads": 0,
        "teacher_engines_started": 0,
        "network_requests": 0,
        "cloud_requests": 0,
        "live_weight_writes": 0,
    }


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        summary = _stop("arguments-forbidden")
    else:
        try:
            summary = run_strength_first_fresh_final_teacher_preflight()
        except FreshFinalTeacherPreflightBlocked:
            summary = _stop("selected-candidate-receipt-not-ready")
        except (OSError, ValueError) as error:
            print(f"[fresh-final-teacher-preflight] STOP: {error}", file=sys.stderr)
            return 1
        else:
            sys.stdout.buffer.write(_canonical_json_bytes(summary))
            return 0
    sys.stdout.buffer.write(_canonical_json_bytes(summary))
    return 2


__all__ = [
    "CLI_SCHEMA",
    "FreshFinalTeacherPreflightBlocked",
    "SUMMARY_SCHEMA",
    "SUMMARY_STATUS",
    "build_fresh_final_teacher_selection_preflight",
    "run_strength_first_fresh_final_teacher_preflight",
    "run_strength_first_fresh_final_teacher_preflight_core",
]


if __name__ == "__main__":
    raise SystemExit(main())
