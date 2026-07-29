#!/usr/bin/env python3
"""Validate the v2 preregistration or bind a future pilot dataset.

``--validate-only`` reads only the tracked protocol.  The build mode verifies
the exact external source, initializer, immutable live weights, protection
artifacts, and future train/validation files before publishing one create-only
execution plan.  Neither mode creates data, an optimizer, a checkpoint, a
match, or a live-weight write.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import tempfile
from typing import Any, Mapping

import direct_teacher_halfkp81_v2_protocol as PROTOCOL


DEFAULT_PROTOCOL = "ml/protocols/direct-teacher-halfkp81-v2-plan.json"
VALIDATION_RECEIPT_SCHEMA = (
    "shogi-direct-teacher-halfkp81-v2-preregistration-validation-receipt-v1"
)


def _resolve(path: str, repo_root: str) -> str:
    return path if os.path.isabs(path) else os.path.join(repo_root, path)


def _expected_file_identity(
    declared: Mapping[str, Any],
    *,
    repo_root: str,
    label: str,
    require_jsonl: bool = False,
) -> dict[str, Any]:
    actual, line_count = PROTOCOL.stable_file_identity(
        _resolve(str(declared["path"]), repo_root),
        label,
        require_jsonl=require_jsonl,
    )
    if actual["bytes"] != declared["bytes"] or actual["sha256"] != declared["sha256"]:
        raise PROTOCOL.DirectTeacherHalfkpV2Error(
            f"{label} differs from its preregistered bytes/SHA-256"
        )
    if require_jsonl and "rows" in declared and line_count != declared["rows"]:
        raise PROTOCOL.DirectTeacherHalfkpV2Error(
            f"{label} has {line_count} rows, expected {declared['rows']}"
        )
    return {
        **actual,
        **{
            key: copy.deepcopy(value)
            for key, value in declared.items()
            if key not in {"path", "bytes", "sha256"}
        },
    }


def validate_preregistration(
    *, protocol_path: str
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    protocol, identity = PROTOCOL.load_strict_json_file(
        protocol_path, "direct-teacher HalfKP81 v2 protocol"
    )
    validated = PROTOCOL.validate_protocol_document(protocol)
    receipt = {
        "schema": VALIDATION_RECEIPT_SCHEMA,
        "status": "valid-preregistered-protocol-no-data-opened",
        "protocol": {
            **identity,
            "schema": PROTOCOL.PROTOCOL_SCHEMA,
            "status": PROTOCOL.PROTOCOL_STATUS,
        },
        "state": copy.deepcopy(validated["current_state"]),
        "authority": {
            "dataset_generation_started": False,
            "optimizer_creation_authorized": False,
            "training_started": False,
            "paired_play_started": False,
            "expanded_stage_authorized": False,
            "live_weight_write_authorized": False,
        },
    }
    return validated, identity, receipt


def _verify_protocol_inputs(
    protocol: Mapping[str, Any], *, repo_root: str
) -> dict[str, Any]:
    inputs = protocol["inputs"]
    verified = {
        "initializer": _expected_file_identity(
            inputs["initializer"],
            repo_root=repo_root,
            label="frozen alpha-0.50 initializer",
        ),
        "live_weights": _expected_file_identity(
            inputs["live_weights"],
            repo_root=repo_root,
            label="immutable live weights",
        ),
        "direct_teacher_source": _expected_file_identity(
            inputs["direct_teacher_source"],
            repo_root=repo_root,
            label="direct teacher source",
            require_jsonl=True,
        ),
        "fresh_selection_protected": _expected_file_identity(
            inputs["fresh_selection_protected"],
            repo_root=repo_root,
            label="fresh-selection protected IDs",
        ),
        "fresh_final_protected": _expected_file_identity(
            inputs["fresh_final_protected"],
            repo_root=repo_root,
            label="fresh-final protected IDs",
        ),
        "spent_tune_result": _expected_file_identity(
            inputs["spent_tune_result"],
            repo_root=repo_root,
            label="spent tune result",
        ),
        "spent_tune_membership": _expected_file_identity(
            inputs["spent_tune_membership"],
            repo_root=repo_root,
            label="spent tune membership",
        ),
    }
    prior_union = inputs["prior_protected_union"]
    prior_result = {
        "path": prior_union["source_result_path"],
        "bytes": prior_union["source_result_bytes"],
        "sha256": prior_union["source_result_sha256"],
    }
    _expected_file_identity(
        prior_result,
        repo_root=repo_root,
        label="prior protected-union source result",
    )
    return verified


def _verify_dataset_outputs(
    manifest: Mapping[str, Any], *, manifest_path: str
) -> dict[str, Any]:
    directory = os.path.dirname(os.path.realpath(manifest_path))
    verified: dict[str, Any] = {}
    for role in ("training", "validation"):
        declared = manifest["output"][role]
        actual, line_count = PROTOCOL.stable_file_identity(
            os.path.join(directory, declared["file"]),
            f"{role} pilot dataset",
            require_jsonl=True,
        )
        if (
            actual["bytes"] != declared["bytes"]
            or actual["sha256"] != declared["sha256"]
            or line_count != declared["rows"]
        ):
            raise PROTOCOL.DirectTeacherHalfkpV2Error(
                f"{role} pilot dataset differs from its manifest"
            )
        verified[role] = {
            **actual,
            "rows": declared["rows"],
            "parents": declared["parents"],
            "games": declared["games"],
            "row_schema": declared["row_schema"],
        }
    return verified


def build_execution_plan(
    *,
    protocol_path: str,
    dataset_manifest_path: str,
    repo_root: str,
) -> dict[str, Any]:
    protocol, protocol_identity, _receipt = validate_preregistration(
        protocol_path=protocol_path
    )
    manifest, manifest_identity = PROTOCOL.load_strict_json_file(
        dataset_manifest_path, "direct-teacher HalfKP81 v2 dataset manifest"
    )
    manifest = PROTOCOL.validate_dataset_manifest_document(
        manifest,
        protocol=protocol,
        protocol_identity=protocol_identity,
    )
    verified_inputs = _verify_protocol_inputs(protocol, repo_root=repo_root)
    verified_outputs = _verify_dataset_outputs(
        manifest, manifest_path=dataset_manifest_path
    )
    plan = {
        "schema": PROTOCOL.EXECUTION_PLAN_SCHEMA,
        "status": PROTOCOL.EXECUTION_STATUS,
        "protocol": {
            **protocol_identity,
            "schema": PROTOCOL.PROTOCOL_SCHEMA,
        },
        "dataset_manifest": {
            **manifest_identity,
            "schema": PROTOCOL.DATASET_MANIFEST_SCHEMA,
        },
        "inputs": {
            **verified_inputs,
            "training_dataset": verified_outputs["training"],
            "validation_dataset": verified_outputs["validation"],
        },
        "training": copy.deepcopy(protocol["training"]),
        "static_sanity": copy.deepcopy(protocol["static_sanity"]),
        "paired_screen": copy.deepcopy(protocol["paired_screen"]),
        "authority": {
            "data_generation_complete": True,
            "optimizer_creation_authorized": True,
            "static_sanity_authorized_after_training": True,
            "paired_screen_authorized_only_after_static_pass": True,
            "expanded_stage_authorized": False,
            "live_weight_write_authorized": False,
        },
    }
    return PROTOCOL.validate_execution_plan_document(plan)


def publish_create_only(plan: Mapping[str, Any], out_path: str) -> dict[str, Any]:
    raw = PROTOCOL.canonical_json_bytes(plan)
    absolute = os.path.abspath(out_path)
    directory = os.path.dirname(absolute)
    os.makedirs(directory, exist_ok=True)
    if os.path.lexists(absolute):
        raise PROTOCOL.DirectTeacherHalfkpV2Error(
            "refusing to overwrite an existing execution plan"
        )
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=f".{os.path.basename(absolute)}.",
            suffix=".tmp",
            dir=directory,
            delete=False,
        ) as temporary:
            temporary_path = temporary.name
            temporary.write(raw)
            temporary.flush()
            os.fsync(temporary.fileno())
        try:
            os.link(temporary_path, absolute)
        except FileExistsError as error:
            raise PROTOCOL.DirectTeacherHalfkpV2Error(
                "refusing to overwrite an existing execution plan"
            ) from error
        os.unlink(temporary_path)
        temporary_path = None
        directory_fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if temporary_path is not None:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass
    return {
        "path": os.path.realpath(absolute),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", default=DEFAULT_PROTOCOL)
    parser.add_argument("--validate-only", action="store_true")
    parser.add_argument("--dataset-manifest")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--out")
    return parser


def main() -> int:
    args = _parser().parse_args()
    if args.validate_only:
        if args.dataset_manifest is not None or args.out is not None:
            raise SystemExit("--validate-only forbids --dataset-manifest and --out")
        _protocol, _identity, receipt = validate_preregistration(
            protocol_path=args.protocol
        )
        print(
            json.dumps(
                receipt,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
                allow_nan=False,
            )
        )
        return 0
    if args.dataset_manifest is None or args.out is None:
        raise SystemExit("build mode requires --dataset-manifest and --out")
    plan = build_execution_plan(
        protocol_path=args.protocol,
        dataset_manifest_path=args.dataset_manifest,
        repo_root=os.path.realpath(args.repo_root),
    )
    identity = publish_create_only(plan, args.out)
    print(
        json.dumps(
            {
                "schema": "shogi-direct-teacher-halfkp81-v2-plan-publication-receipt-v1",
                "status": "pilot-execution-plan-published-training-not-started",
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
