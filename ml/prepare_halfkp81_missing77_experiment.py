#!/usr/bin/env python3
"""Prepare the disclosed-missing-77 HalfKP81 research training inputs.

This adapter does not turn the incomplete 8,115/8,192 teacher run into a
successful formal run.  It accepts only the independently verified frozen
teacher-work identity, preserves the original fit/tune/sealed roles, and
emits inputs for the existing HalfKP sibling-preserving research trainer.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


PROTOCOL_SCHEMA = "shogi-halfkp-sibling-preservation-plan-v1"
WORK_SCHEMA = "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r11"
FROZEN_WORK = {
    "bytes": 173_791_669,
    "sha256": "b0d0f6902f15191b4bc65c0553640b217c6cfd5756a3f05bbf225b5908e3ed53",
    "parents": 8_115,
    "rows": 93_621,
}
EXPECTED_PARENT_COUNTS = {"fit": 6_134, "tune": 1_024, "sealed": 957}
EXPECTED_ROW_COUNTS = {"fit": 70_806, "tune": 11_767, "sealed": 11_048}
EXPECTED_EXPORTED_PARENT_COUNTS = {"fit": 6_124, "tune": 1_023, "sealed": 957}
EXPECTED_EXPORTED_ROW_COUNTS = {"fit": 70_686, "tune": 11_764, "sealed": 11_048}
MISSING = {
    "selected_parents": 8_192,
    "missing_parents": 77,
    "by_role": {"fit": 10, "tune": 0, "sealed": 67},
    "by_phase": {"late": 77},
    "by_side": {"b": 5, "w": 72},
    "parent_ids_sha256": (
        "40ba7e1d26a7ae6a55d6ac445b0197ff1f6b52a4858d2c16c6bf82b47e76aa86"
    ),
}
DEFAULT_INITIALIZER = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-epoch2-interpolation-v1/alpha-050.pt"
)
DEFAULT_REPLAY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "large-scratch-806k-v1/wdl/train.teacher.wdl.jsonl"
)
DEFAULT_PRESERVATION = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "large-scratch-806k-v1/wdl/val.teacher.wdl.jsonl"
)


class Missing77PreparationError(ValueError):
    """A frozen incomplete teacher artifact is not safe for research use."""


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise Missing77PreparationError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _strict_json(raw: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            raw,
            object_pairs_hook=_reject_duplicate_keys,
            parse_constant=lambda value: (_ for _ in ()).throw(
                Missing77PreparationError(
                    f"{label} contains non-finite number {value}"
                )
            ),
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise Missing77PreparationError(f"{label} is not strict JSON") from error
    if type(value) is not dict:
        raise Missing77PreparationError(f"{label} must be a JSON object")
    return value


def _canonical_line(value: Mapping[str, Any]) -> bytes:
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


def _identity(path: str) -> dict[str, Any]:
    candidate = os.path.realpath(path)
    digest = hashlib.sha256()
    rows = 0
    byte_count = 0
    with open(candidate, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
            byte_count += len(block)
            rows += block.count(b"\n")
    if byte_count == 0:
        raise Missing77PreparationError(f"input is empty: {candidate}")
    return {
        "path": candidate,
        "bytes": byte_count,
        "sha256": digest.hexdigest(),
        "rows": rows,
    }


def partition_completed_rows(
    values: Iterable[Mapping[str, Any]],
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, int]]:
    """Partition authenticated work wrappers without changing sibling rows."""

    roles: dict[str, list[dict[str, Any]]] = {
        "fit": [],
        "tune": [],
        "sealed": [],
    }
    parent_counts = {role: 0 for role in roles}
    seen_parents: set[str] = set()
    for offset, value in enumerate(values, start=2):
        if value.get("kind") != "parent" or value.get("schema") != WORK_SCHEMA:
            raise Missing77PreparationError(f"work line {offset} is not a v1r11 parent")
        role = value.get("role")
        parent_id = value.get("parent_id")
        teacher_entry = value.get("teacher_entry")
        if role not in roles or not isinstance(parent_id, str) or not parent_id:
            raise Missing77PreparationError(f"work line {offset} identity differs")
        if parent_id in seen_parents:
            raise Missing77PreparationError(f"duplicate parent_id: {parent_id}")
        if type(teacher_entry) is not dict or type(teacher_entry.get("records")) is not list:
            raise Missing77PreparationError(f"work line {offset} has no teacher records")
        records = teacher_entry["records"]
        if len(records) < 2:
            raise Missing77PreparationError(f"work line {offset} has fewer than two rows")
        for record in records:
            if type(record) is not dict or record.get("parent_id") != parent_id:
                raise Missing77PreparationError(
                    f"work line {offset} row parent binding differs"
                )
            roles[role].append(dict(record))
        seen_parents.add(parent_id)
        parent_counts[role] += 1
    return roles, parent_counts


_LEAKAGE_FIELDS = ("game_id", "parent_id", "position_id", "child_position_id")


def _identities(rows: Iterable[Mapping[str, Any]]) -> tuple[dict[str, set[str]], set[str]]:
    fields = {field: set() for field in _LEAKAGE_FIELDS}
    semantic: set[str] = set()
    for row in rows:
        for field in _LEAKAGE_FIELDS:
            value = row.get(field)
            if isinstance(value, str) and value:
                fields[field].add(value)
        for field in ("position_id", "child_position_id"):
            value = row.get(field)
            if isinstance(value, str) and value:
                semantic.add(value)
    return fields, semantic


def _collides(
    rows: Sequence[Mapping[str, Any]],
    protected: tuple[dict[str, set[str]], set[str]],
) -> bool:
    fields, semantic = _identities(rows)
    protected_fields, protected_semantic = protected
    return any(fields[field] & protected_fields[field] for field in _LEAKAGE_FIELDS) or bool(
        semantic & protected_semantic
    )


def _parent_groups(rows: Sequence[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        groups.setdefault(row["parent_id"], []).append(row)
    return groups


def exclude_cross_role_leakage(
    roles: Mapping[str, Sequence[dict[str, Any]]],
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
    """Protect sealed, then tune, by dropping whole lower-priority parents."""

    filtered = {"fit": [], "tune": [], "sealed": list(roles["sealed"])}
    excluded: dict[str, dict[str, list[dict[str, Any]]]] = {
        "fit": {},
        "tune": {},
        "sealed": {},
    }

    sealed_index = _identities(filtered["sealed"])
    for parent_id, rows in _parent_groups(list(roles["tune"])).items():
        if _collides(rows, sealed_index):
            excluded["tune"][parent_id] = rows
        else:
            filtered["tune"].extend(rows)

    protected = _identities([*filtered["sealed"], *filtered["tune"]])
    for parent_id, rows in _parent_groups(list(roles["fit"])).items():
        if _collides(rows, protected):
            excluded["fit"][parent_id] = rows
        else:
            filtered["fit"].extend(rows)

    excluded_ids = sorted(
        parent_id for groups in excluded.values() for parent_id in groups
    )
    excluded_parent_counts = {
        role: len(groups) for role, groups in excluded.items()
    }
    excluded_row_counts = {
        role: sum(len(rows) for rows in groups.values())
        for role, groups in excluded.items()
    }
    disclosure = {
        "policy": "sealed-priority-then-tune-drop-whole-lower-priority-parent",
        "fields": [*_LEAKAGE_FIELDS, "semantic-position-union"],
        "excluded_parent_counts": excluded_parent_counts,
        "excluded_row_counts": excluded_row_counts,
        "excluded_parent_ids_sha256": hashlib.sha256(
            "".join(f"{parent_id}\n" for parent_id in excluded_ids).encode("utf-8")
        ).hexdigest(),
    }
    return filtered, disclosure


def _publish_create_only(path: Path, payload: bytes) -> None:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    descriptor = os.open(path, flags, 0o600)
    try:
        with os.fdopen(descriptor, "wb", closefd=False) as target:
            target.write(payload)
            target.flush()
            os.fsync(target.fileno())
    finally:
        os.close(descriptor)


def _dataset_bytes(rows: Sequence[Mapping[str, Any]]) -> bytes:
    return b"".join(_canonical_line(row) for row in rows)


def prepare(
    *,
    work_path: str,
    output_directory: str,
    initializer_path: str,
    replay_path: str,
    preservation_path: str,
) -> dict[str, Any]:
    work_identity = _identity(work_path)
    if {
        key: work_identity[key] for key in ("bytes", "sha256")
    } != {key: FROZEN_WORK[key] for key in ("bytes", "sha256")}:
        raise Missing77PreparationError("frozen r14 teacher-work identity differs")
    raw = Path(work_path).read_bytes()
    if not raw.endswith(b"\n"):
        raise Missing77PreparationError("frozen r14 teacher-work lacks final LF")
    lines = raw.splitlines()
    header = _strict_json(lines[0], "teacher-work header")
    if (
        header.get("schema") != WORK_SCHEMA
        or header.get("record_kind") != "header"
        or header.get("status") != "formal-work-ledger-open"
    ):
        raise Missing77PreparationError("teacher-work header differs")
    values = [
        _strict_json(line, f"teacher-work line {index}")
        for index, line in enumerate(lines[1:], start=2)
    ]
    completed_roles, parent_counts = partition_completed_rows(values)
    row_counts = {role: len(rows) for role, rows in completed_roles.items()}
    if (
        len(values) != FROZEN_WORK["parents"]
        or sum(row_counts.values()) != FROZEN_WORK["rows"]
        or parent_counts != EXPECTED_PARENT_COUNTS
        or row_counts != EXPECTED_ROW_COUNTS
    ):
        raise Missing77PreparationError("completed role/row accounting differs")
    roles, overlap_exclusion = exclude_cross_role_leakage(completed_roles)
    exported_parent_counts = {
        role: len(_parent_groups(rows)) for role, rows in roles.items()
    }
    exported_row_counts = {role: len(rows) for role, rows in roles.items()}
    if (
        exported_parent_counts != EXPECTED_EXPORTED_PARENT_COUNTS
        or exported_row_counts != EXPECTED_EXPORTED_ROW_COUNTS
    ):
        raise Missing77PreparationError("cross-role overlap accounting differs")

    output = Path(output_directory).resolve()
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    output_paths = {
        "fit": output / "fit.jsonl",
        "tune": output / "tune.jsonl",
        "sealed": output / "sealed.jsonl",
    }
    try:
        for role, target in output_paths.items():
            _publish_create_only(target, _dataset_bytes(roles[role]))

        initializer = _identity(initializer_path)
        replay = _identity(replay_path)
        preservation = _identity(preservation_path)
        role_identities = {role: _identity(str(path)) for role, path in output_paths.items()}
        protocol = {
            "schema": PROTOCOL_SCHEMA,
            "claim_boundary": (
                "research-only missing-77 candidate; exact-8192 formal failed and "
                "this protocol grants no live-weight authority"
            ),
            "experimental_missing_data": {
                **MISSING,
                "exact_8192_formal_pass": False,
                "teacher_work": work_identity,
                "completed_parent_counts": parent_counts,
                "completed_row_counts": row_counts,
                "semantic_overlap_exclusion": overlap_exclusion,
                "exported_parent_counts": exported_parent_counts,
                "exported_row_counts": exported_row_counts,
                "effective_missing_parent_counts": {
                    "fit": 20,
                    "tune": 1,
                    "sealed": 67,
                },
                "effective_missing_parents": 88,
                "role_policy": "fit-trains-tune-selects-sealed-remains-held-out",
            },
            "inputs": {
                "initializer": initializer,
                "legal_sibling_training": role_identities["fit"],
                "legal_sibling_validation": role_identities["tune"],
                "sealed_sibling_validation": role_identities["sealed"],
                "value_replay": {
                    **replay,
                    "sample_rows": exported_row_counts["fit"],
                },
                "value_preservation_validation": preservation,
            },
            "training": {
                "trainer": "ml/train_halfkp_sibling_preserving.py",
                "epochs": 3,
                "batch": 256,
                "optimizer": "AdamW with zero weight decay",
                "rank_pair_min_cp": 50.0,
                "rank_pair_max_cp": 600.0,
                "rank_margin_cp": 50.0,
                "policy_temperature_cp": 200.0,
                "value_replay_ratio_rows": 1.0,
                "selection": (
                    "best tune sibling pair accuracy, then top-1, then preservation "
                    "loss, among admitted epochs only"
                ),
                "prospective_slots": [
                    {
                        "id": "missing77-balanced-seed42",
                        "seed": 42,
                        "learning_rate": 0.00001,
                        "rank_weight": 1.0,
                        "policy_weight": 0.25,
                    }
                ],
            },
            "epoch_admission_relative_to_initializer": {
                "minimum_sibling_pair_gain": 0.01,
                "minimum_sibling_top1_gain": 0.02,
                "maximum_value_mae_regression_cp": 0.0,
                "maximum_value_loss_relative_increase": 0.0,
            },
            "required_after_training": [
                "evaluate-the-selected-checkpoint-on-the-held-957-parent-sealed-set",
                "old-validation-int16-runtime-and-fresh56-gates-remain-required",
                "never-promote-from-this-research-result-alone",
            ],
        }
        protocol_path = output / "protocol.json"
        _publish_create_only(protocol_path, _canonical_line(protocol))
    except BaseException:
        # Preserve any create-only evidence for diagnosis; never overwrite it.
        raise

    return {
        "status": "missing77-research-inputs-prepared",
        "output_directory": str(output),
        "teacher_work": work_identity,
        "completed_parents": parent_counts,
        "completed_rows": row_counts,
        "exported_parents": exported_parent_counts,
        "exported_rows": exported_row_counts,
        "semantic_overlap_exclusion": overlap_exclusion,
        "missing": MISSING,
        "protocol": _identity(str(output / "protocol.json")),
        "datasets": {role: _identity(str(path)) for role, path in output_paths.items()},
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work", required=True)
    parser.add_argument("--output-directory", required=True)
    parser.add_argument("--initializer", default=DEFAULT_INITIALIZER)
    parser.add_argument("--replay", default=DEFAULT_REPLAY)
    parser.add_argument("--preservation", default=DEFAULT_PRESERVATION)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = prepare(
            work_path=args.work,
            output_directory=args.output_directory,
            initializer_path=args.initializer,
            replay_path=args.replay,
            preservation_path=args.preservation,
        )
    except (OSError, ValueError) as error:
        print(f"[halfkp81-missing77-prepare] STOP: {error}")
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
