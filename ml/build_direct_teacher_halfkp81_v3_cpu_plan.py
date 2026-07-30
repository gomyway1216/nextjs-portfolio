#!/usr/bin/env python3
"""Build one create-only v3 CPU execution plan from authenticated metadata."""

from __future__ import annotations

import argparse
import copy
import json
import os
from typing import Any, Mapping

import build_direct_teacher_halfkp81_v2_plan as V2_PLAN
import direct_teacher_halfkp81_v2_protocol as V2
import direct_teacher_halfkp81_v3_cpu_protocol as PROTOCOL


DEFAULT_PROTOCOL = "ml/protocols/direct-teacher-halfkp81-v3-cpu-plan.json"


def _resolve(path: str, repo_root: str) -> str:
    return path if os.path.isabs(path) else os.path.join(repo_root, path)


def _verified_identity(
    declared: Mapping[str, Any], *, repo_root: str, label: str
) -> dict[str, Any]:
    observed, _lines = PROTOCOL.stable_file_identity(
        _resolve(str(declared["path"]), repo_root), label
    )
    if any(observed[field] != declared[field] for field in ("bytes", "sha256")):
        raise PROTOCOL.DirectTeacherHalfkpV3CpuError(f"{label} bytes/SHA-256 differs")
    return observed


def build_execution_plan(
    *,
    protocol_path: str,
    metadata_manifest_path: str,
    repo_root: str,
) -> dict[str, Any]:
    protocol_raw, protocol_identity = PROTOCOL.load_strict_json_file(
        protocol_path, "v3 CPU protocol"
    )
    protocol = PROTOCOL.validate_protocol_document(protocol_raw)
    terminal_path = protocol["predecessor"]["terminal_result"]["path"]
    terminal_raw, terminal_identity = PROTOCOL.load_strict_json_file(
        terminal_path, "v2 terminal technical-stop result"
    )
    PROTOCOL.verify_terminal_evidence(terminal_raw, protocol=protocol)
    manifest_raw, manifest_identity = PROTOCOL.load_strict_json_file(
        metadata_manifest_path, "v3 CPU metadata manifest"
    )
    manifest = PROTOCOL.validate_metadata_manifest(
        manifest_raw,
        protocol=protocol,
        protocol_identity=protocol_identity,
        terminal_identity=terminal_identity,
    )
    inputs = {
        "initializer": _verified_identity(
            protocol["inputs"]["initializer"],
            repo_root=repo_root,
            label="v3 initializer",
        ),
        "live_weights": _verified_identity(
            protocol["inputs"]["live_weights"],
            repo_root=repo_root,
            label="immutable live weights",
        ),
        "runtime_wasm": _verified_identity(
            protocol["inputs"]["runtime_wasm"],
            repo_root=repo_root,
            label="HalfKP81 runtime WASM",
        ),
    }
    for role in ("training", "validation"):
        declared = manifest["datasets"][role]
        observed, line_count = PROTOCOL.stable_file_identity(
            declared["path"], f"v3 {role} dataset", require_jsonl=True
        )
        if (
            observed["bytes"] != declared["bytes"]
            or observed["sha256"] != declared["sha256"]
            or line_count != declared["rows"]
        ):
            raise PROTOCOL.DirectTeacherHalfkpV3CpuError(f"v3 {role} dataset differs")
        inputs[f"{role}_dataset"] = {
            **observed,
            **{
                field: declared[field]
                for field in (
                    "rows",
                    "games",
                    "parents",
                    "row_schema",
                    *sorted(PROTOCOL.ID_SET_FIELDS),
                )
            },
        }
    plan = {
        "schema": PROTOCOL.EXECUTION_PLAN_SCHEMA,
        "status": "bound-cpu-pilot-ready-for-capability-probe",
        "protocol": {
            **protocol_identity,
            "schema": PROTOCOL.PROTOCOL_SCHEMA,
        },
        "predecessor_terminal": {
            **terminal_identity,
            "schema": PROTOCOL.TERMINAL_SCHEMA,
        },
        "metadata_manifest": {
            **manifest_identity,
            "schema": PROTOCOL.MANIFEST_SCHEMA,
        },
        "inputs": inputs,
        "training": copy.deepcopy(protocol["training"]),
        "cpu_execution": copy.deepcopy(protocol["cpu_execution"]),
        "capability_probe": copy.deepcopy(protocol["capability_probe"]),
        "static_sanity": copy.deepcopy(protocol["static_sanity"]),
        "paired_screen": copy.deepcopy(protocol["paired_screen"]),
        "authority": {
            "capability_probe_required_before_claim": True,
            "optimizer_creation_authorized_only_after_claim": True,
            "paired56_authorized_only_after_static_pass": True,
            "expanded_stage_authorized": False,
            "live_weight_write_authorized": False,
        },
    }
    return PROTOCOL.validate_execution_plan(plan)


def publish_create_only(value: Mapping[str, Any], out_path: str) -> dict[str, Any]:
    try:
        return V2_PLAN.publish_create_only(value, out_path)
    except V2.DirectTeacherHalfkpV2Error as error:
        raise PROTOCOL.DirectTeacherHalfkpV3CpuError(str(error)) from error


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", default=DEFAULT_PROTOCOL)
    parser.add_argument("--metadata-manifest", required=True)
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--out", required=True)
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        plan = build_execution_plan(
            protocol_path=args.protocol,
            metadata_manifest_path=args.metadata_manifest,
            repo_root=os.path.realpath(args.repo_root),
        )
        identity = publish_create_only(plan, args.out)
    except (
        PROTOCOL.DirectTeacherHalfkpV3CpuError,
        V2.DirectTeacherHalfkpV2Error,
        OSError,
        TypeError,
        ValueError,
    ) as error:
        print(f"[direct-teacher-halfkp81-v3-cpu-plan] STOP: {error}")
        return 1
    print(
        json.dumps(
            {
                "schema": (
                    "shogi-direct-teacher-halfkp81-v3-cpu-"
                    "plan-publication-receipt-v1"
                ),
                "status": "cpu-plan-published-training-not-started",
                "execution_plan": identity,
                "live_weight_write_authorized": False,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
