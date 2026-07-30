#!/usr/bin/env python3
"""Publish a metadata-only v3 binding for the immutable v2 JSONL bytes."""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Mapping

import build_direct_teacher_halfkp81_v2_plan as V2_PLAN
import direct_teacher_halfkp81_v2_protocol as V2
import direct_teacher_halfkp81_v3_cpu_protocol as PROTOCOL


DEFAULT_PROTOCOL = "ml/protocols/direct-teacher-halfkp81-v3-cpu-plan.json"


def _require_identity(
    observed: Mapping[str, Any], expected: Mapping[str, Any], label: str
) -> None:
    for field in ("path", "bytes", "sha256"):
        if observed.get(field) != expected.get(field):
            raise PROTOCOL.DirectTeacherHalfkpV3CpuError(f"{label} {field} differs")


def _actual_role_sets(path: str, *, role: str) -> dict[str, set[str]]:
    result = {
        "game_ids": set(),
        "parent_ids": set(),
        "position_ids": set(),
        "child_position_ids": set(),
        "semantic_position_ids": set(),
    }
    with open(path, "rb") as source:
        for line_number, raw in enumerate(source, start=1):
            if not raw.endswith(b"\n") or raw == b"\n":
                raise PROTOCOL.DirectTeacherHalfkpV3CpuError(
                    f"{role} row {line_number} framing differs"
                )
            row = V2.strict_json_bytes(raw[:-1], f"{role} row {line_number}")
            if (
                set(row) != V2.DATASET_ROW_FIELDS
                or V2.canonical_json_bytes(row) != raw
                or row["schema"] != V2.ROW_SCHEMA
                or row["role"] != role
            ):
                raise PROTOCOL.DirectTeacherHalfkpV3CpuError(
                    f"{role} row {line_number} contract differs"
                )
            for target, field in (
                ("game_ids", "game_id"),
                ("parent_ids", "parent_id"),
                ("position_ids", "position_id"),
                ("child_position_ids", "child_position_id"),
            ):
                result[target].add(row[field])
            result["semantic_position_ids"].update(
                (row["position_id"], row["child_position_id"])
            )
    return result


def build_metadata_manifest(
    *,
    protocol_path: str,
    terminal_result_path: str,
    source_manifest_path: str,
) -> dict[str, Any]:
    protocol_raw, protocol_identity = PROTOCOL.load_strict_json_file(
        protocol_path, "v3 CPU protocol"
    )
    protocol = PROTOCOL.validate_protocol_document(protocol_raw)
    terminal_raw, terminal_identity = PROTOCOL.load_strict_json_file(
        terminal_result_path, "v2 terminal technical-stop result"
    )
    terminal = PROTOCOL.verify_terminal_evidence(terminal_raw, protocol=protocol)
    if (
        os.path.realpath(terminal_result_path)
        != protocol["predecessor"]["terminal_result"]["path"]
    ):
        raise PROTOCOL.DirectTeacherHalfkpV3CpuError("v2 terminal result path differs")
    source_raw, source_identity = V2.load_strict_json_file(
        source_manifest_path, "v2 source dataset manifest"
    )
    _require_identity(
        source_identity, protocol["source_dataset"]["manifest"], "source manifest"
    )
    old_protocol_path = source_raw["protocol"]["path"]
    old_protocol_raw, old_protocol_identity = V2.load_strict_json_file(
        old_protocol_path, "v2 source protocol"
    )
    old_protocol = V2.validate_protocol_document(old_protocol_raw)
    source_manifest = V2.validate_dataset_manifest_document(
        source_raw,
        protocol=old_protocol,
        protocol_identity=old_protocol_identity,
    )
    verified = V2_PLAN._verify_dataset_outputs(
        source_manifest, manifest_path=source_manifest_path
    )
    role_sets = {
        role: _actual_role_sets(verified[role]["path"], role=role)
        for role in ("training", "validation")
    }
    overlap_counts = {
        field: len(role_sets["training"][field] & role_sets["validation"][field])
        for field in (
            "game_ids",
            "parent_ids",
            "position_ids",
            "child_position_ids",
            "semantic_position_ids",
        )
    }
    if any(overlap_counts.values()):
        raise PROTOCOL.DirectTeacherHalfkpV3CpuError(
            "v3 metadata rebind cross-role overlap differs"
        )
    datasets: dict[str, Any] = {}
    for role in ("training", "validation"):
        datasets[role] = {
            "path": verified[role]["path"],
            "bytes": verified[role]["bytes"],
            "sha256": verified[role]["sha256"],
            "rows": verified[role]["rows"],
            "games": verified[role]["games"],
            "parents": verified[role]["parents"],
            "row_schema": V2.ROW_SCHEMA,
            **{field: verified[role][field] for field in PROTOCOL.ID_SET_FIELDS},
        }
    document = {
        "schema": PROTOCOL.MANIFEST_SCHEMA,
        "status": "complete-metadata-only-byte-identical-rebind",
        "mode": "metadata-only-exact-existing-jsonl-no-row-generation",
        "protocol": {
            **protocol_identity,
            "schema": PROTOCOL.PROTOCOL_SCHEMA,
        },
        "predecessor_terminal": {
            **terminal_identity,
            "schema": PROTOCOL.TERMINAL_SCHEMA,
            "status": PROTOCOL.TERMINAL_STATUS,
        },
        "source_manifest": {
            **source_identity,
            "schema": V2.DATASET_MANIFEST_SCHEMA,
        },
        "datasets": datasets,
        "accounting": {
            "source_rows_read": sum(
                datasets[role]["rows"] for role in ("training", "validation")
            ),
            "row_bytes_written": 0,
            "jsonl_files_created": 0,
            "jsonl_files_copied": 0,
            "jsonl_files_hardlinked": 0,
            "cross_role_overlap_counts": overlap_counts,
        },
        "authority": {
            "metadata_rebind_complete": True,
            "optimizer_creation_authorized": False,
            "training_started": False,
            "paired56_authorized": False,
            "live_weight_write_authorized": False,
        },
    }
    del terminal
    return PROTOCOL.validate_metadata_manifest(
        document,
        protocol=protocol,
        protocol_identity=protocol_identity,
        terminal_identity=terminal_identity,
    )


def publish_create_only(value: Mapping[str, Any], out_path: str) -> dict[str, Any]:
    try:
        return V2_PLAN.publish_create_only(value, out_path)
    except V2.DirectTeacherHalfkpV2Error as error:
        raise PROTOCOL.DirectTeacherHalfkpV3CpuError(str(error)) from error


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", default=DEFAULT_PROTOCOL)
    parser.add_argument("--terminal-result", required=True)
    parser.add_argument("--source-manifest", required=True)
    parser.add_argument("--out", required=True)
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        manifest = build_metadata_manifest(
            protocol_path=args.protocol,
            terminal_result_path=args.terminal_result,
            source_manifest_path=args.source_manifest,
        )
        identity = publish_create_only(manifest, args.out)
    except (
        PROTOCOL.DirectTeacherHalfkpV3CpuError,
        V2.DirectTeacherHalfkpV2Error,
        OSError,
        TypeError,
        ValueError,
    ) as error:
        print(f"[direct-teacher-halfkp81-v3-cpu-rebind] STOP: {error}")
        return 1
    print(
        json.dumps(
            {
                "schema": (
                    "shogi-direct-teacher-halfkp81-v3-cpu-" "metadata-rebind-receipt-v1"
                ),
                "status": "metadata-only-rebind-complete-training-not-started",
                "manifest": identity,
                "row_bytes_written": 0,
                "live_weight_write_authorized": False,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
