#!/usr/bin/env python3
"""Authenticate and create-only publish the bounded-stable v3 teacher plan."""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from typing import Any, Mapping

import halfkp81_depth18_bounded_stable_v3_protocol as PROTOCOL
import halfkp81_depth18_strength_protocol as SELECTION_PROTOCOL
import publish_halfkp81_depth18_teacher_plan as BASE_PUBLISHER


REPO_ROOT = Path(__file__).resolve().parents[1]


class BoundedStableV3PublicationError(
    PROTOCOL.BoundedStableV3ProtocolError
):
    """Raised when v3 authority authentication or publication fails."""


def _as_publication_error(error: Exception) -> BoundedStableV3PublicationError:
    return BoundedStableV3PublicationError(str(error))


def _verify_declared_file(
    declared: Mapping[str, Any],
    *,
    repo_root: Path,
    label: str,
) -> bytes:
    try:
        return BASE_PUBLISHER._verify_declared_file_identity(
            declared, repo_root=repo_root, label=label
        )
    except BASE_PUBLISHER.TeacherPlanPublicationError as error:
        raise _as_publication_error(error) from error


def _strict_canonical_document(raw: bytes, label: str) -> dict[str, Any]:
    try:
        return BASE_PUBLISHER._strict_canonical_document(raw, label)
    except BASE_PUBLISHER.TeacherPlanPublicationError as error:
        raise _as_publication_error(error) from error


def _verify_merged_revision(revision: str, repo_root: Path) -> None:
    if revision == PROTOCOL.PREDECESSOR_REVISION:
        raise BoundedStableV3PublicationError("v2 source revision is forbidden")
    try:
        BASE_PUBLISHER._verify_merged_revision(revision, repo_root)
    except BASE_PUBLISHER.TeacherPlanPublicationError as error:
        raise _as_publication_error(error) from error


def _verify_tracked_preregistration(repo_root: Path) -> dict[str, Any]:
    try:
        raw = _verify_declared_file(
            PROTOCOL.EXPECTED_TRACKED_PLAN_IDENTITY,
            repo_root=repo_root,
            label="tracked v3 preregistration",
        )
        document = PROTOCOL.parse_strict_json_bytes(
            raw, "tracked v3 preregistration"
        )
        return PROTOCOL.validate_plan_document(document)
    except (OSError, PROTOCOL.BoundedStableV3ProtocolError) as error:
        raise BoundedStableV3PublicationError(
            f"tracked v3 preregistration authentication failed: {error}"
        ) from error


def _verify_predecessor_v2(repo_root: Path) -> None:
    predecessor = PROTOCOL.EXPECTED_PREDECESSOR_V2
    plan_raw = _verify_declared_file(
        predecessor["teacher_plan"],
        repo_root=repo_root,
        label="v2 teacher plan",
    )
    plan = _strict_canonical_document(plan_raw, "v2 teacher plan")
    if (
        plan.get("schema") != predecessor["teacher_plan"]["schema"]
        or plan.get("source_revision") != predecessor["source_revision"]
        or plan.get("status") != "sealed-not-executed"
        or plan.get("authority", {}).get("may_write_live_weights") is not False
    ):
        raise BoundedStableV3PublicationError("v2 teacher plan binding differs")

    work_raw = _verify_declared_file(
        predecessor["work_ledger"],
        repo_root=repo_root,
        label="v2 teacher work ledger",
    )
    lines = work_raw.splitlines(keepends=True)
    if len(lines) != predecessor["work_ledger"]["records"]:
        raise BoundedStableV3PublicationError("v2 work ledger record count differs")
    records = [
        _strict_canonical_document(line, f"v2 work ledger record {index}")
        for index, line in enumerate(lines, start=1)
    ]
    headers = [record for record in records if record.get("kind") == "header"]
    parents = [record for record in records if record.get("kind") == "parent"]
    if (
        len(headers) != predecessor["work_ledger"]["header_records"]
        or len(parents) != predecessor["work_ledger"]["parent_records"]
        or any(
            record.get("run_fingerprint") != predecessor["run_fingerprint"]
            for record in records
        )
        or headers[0].get("teacher_plan") != predecessor["teacher_plan"]
    ):
        raise BoundedStableV3PublicationError("v2 work ledger structure differs")
    teacher_rows = sum(
        len(record.get("teacher_entry", {}).get("records", []))
        for record in parents
    )
    if teacher_rows != predecessor["work_ledger"]["teacher_rows"]:
        raise BoundedStableV3PublicationError("v2 work ledger teacher rows differ")

    fault_raw = _verify_declared_file(
        predecessor["terminal_fault"],
        repo_root=repo_root,
        label="v2 terminal fault",
    )
    fault = _strict_canonical_document(fault_raw, "v2 terminal fault")
    fault_expected = predecessor["terminal_fault"]
    for field in (
        "schema",
        "status",
        "run_fingerprint",
        "completed_parents",
        "incomplete_parents",
        "technical_faults",
    ):
        if fault.get(field) != fault_expected[field]:
            raise BoundedStableV3PublicationError(
                f"v2 terminal fault {field} differs"
            )
    if (
        fault.get("teacher_plan") != predecessor["teacher_plan"]
        or fault.get("authority", {}).get("may_resume_same_family") is not False
        or fault.get("authority", {}).get("may_train") is not False
        or fault.get("authority", {}).get("may_write_live_weights") is not False
    ):
        raise BoundedStableV3PublicationError("v2 terminal authority differs")


def _verify_engine_assets(repo_root: Path) -> None:
    for label, identity in (
        ("YaneuraOu binary", PROTOCOL.EXPECTED_ENGINE["binary"]),
        ("YaneuraOu eval file", PROTOCOL.EXPECTED_ENGINE["eval_file"]),
    ):
        _verify_declared_file(identity, repo_root=repo_root, label=label)
    eval_file = PROTOCOL.EXPECTED_ENGINE["eval_file"]
    tree_payload = (
        "eval-tree-v1\0"
        + json.dumps(
            {
                "path": Path(str(eval_file["path"])).name,
                "bytes": eval_file["bytes"],
                "sha256": eval_file["sha256"],
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    ).encode("utf-8")
    import hashlib

    if (
        hashlib.sha256(tree_payload).hexdigest()
        != PROTOCOL.EXPECTED_ENGINE["eval_tree_sha256"]
    ):
        raise BoundedStableV3PublicationError(
            "YaneuraOu eval-tree identity differs"
        )


def build_teacher_plan(
    *,
    selection_jsonl_path: str,
    selection_manifest_path: str,
    expected_merged_revision: str,
    output_directory: str,
    repo_root: Path = REPO_ROOT,
) -> dict[str, Any]:
    """Authenticate every v3 authority input and build a sealed plan."""

    root = repo_root.resolve()
    _verify_merged_revision(expected_merged_revision, root)
    preregistration = _verify_tracked_preregistration(root)
    PROTOCOL.validate_runtime_source_revision(
        preregistration,
        source_revision=expected_merged_revision,
        authenticated_main_head=expected_merged_revision,
        repository_clean=True,
        tracked_plan_merged=True,
    )
    _verify_predecessor_v2(root)
    _verify_engine_assets(root)
    try:
        evidence = SELECTION_PROTOCOL.authenticate_selection_artifacts(
            selection_jsonl_path,
            selection_manifest_path,
            expected_source_revision=expected_merged_revision,
        )
    except SELECTION_PROTOCOL.Halfkp81Depth18StrengthError as error:
        raise BoundedStableV3PublicationError(
            f"selection authentication failed: {error}"
        ) from error

    if output_directory != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]:
        raise BoundedStableV3PublicationError(
            "output directory differs from create-only v3 namespace"
        )
    try:
        directory = BASE_PUBLISHER._canonical_output_directory(output_directory)
    except BASE_PUBLISHER.TeacherPlanPublicationError as error:
        raise _as_publication_error(error) from error
    if str(directory) != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]:
        raise BoundedStableV3PublicationError("canonical v3 output differs")

    evidence_document = copy.deepcopy(dict(evidence.document))
    plan = {
        "authority": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_AUTHORITY),
        "engine": copy.deepcopy(PROTOCOL.EXPECTED_ENGINE),
        "outputs": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_OUTPUTS),
        "predecessor_v2": copy.deepcopy(PROTOCOL.EXPECTED_PREDECESSOR_V2),
        "preregistration": copy.deepcopy(
            PROTOCOL.EXPECTED_TRACKED_PLAN_IDENTITY
        ),
        "schema": PROTOCOL.TEACHER_PLAN_SCHEMA,
        "selection_evidence": evidence_document,
        "selection_manifest": copy.deepcopy(
            PROTOCOL.EXPECTED_REUSED_SELECTION["manifest"]
        ),
        "selection_roles": copy.deepcopy(PROTOCOL.EXPECTED_SELECTION_ROLES),
        "source_revision": expected_merged_revision,
        "status": "sealed-not-executed",
        "teacher": copy.deepcopy(PROTOCOL.EXPECTED_TEACHER),
    }
    validated = PROTOCOL.validate_teacher_plan(
        plan,
        authenticated_selection=evidence_document,
        expected_source_revision=expected_merged_revision,
    )
    _verify_merged_revision(expected_merged_revision, root)
    return validated


def publish_teacher_plan(
    plan: Mapping[str, Any],
    *,
    output_directory: str,
) -> dict[str, Any]:
    """Create only the canonical v3 teacher plan in the reserved namespace."""

    if plan.get("schema") != PROTOCOL.TEACHER_PLAN_SCHEMA:
        raise BoundedStableV3PublicationError("v3 teacher plan schema differs")
    if plan.get("outputs") != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS:
        raise BoundedStableV3PublicationError("v3 teacher outputs differ")
    if output_directory != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]:
        raise BoundedStableV3PublicationError("v3 publication namespace differs")
    try:
        identity = BASE_PUBLISHER.publish_teacher_plan(
            plan, output_directory=output_directory
        )
    except BASE_PUBLISHER.TeacherPlanPublicationError as error:
        raise _as_publication_error(error) from error
    return {**identity, "schema": PROTOCOL.TEACHER_PLAN_SCHEMA}


def build_and_publish(
    *,
    selection_jsonl_path: str,
    selection_manifest_path: str,
    expected_merged_revision: str,
    output_directory: str,
    repo_root: Path = REPO_ROOT,
) -> dict[str, Any]:
    plan = build_teacher_plan(
        selection_jsonl_path=selection_jsonl_path,
        selection_manifest_path=selection_manifest_path,
        expected_merged_revision=expected_merged_revision,
        output_directory=output_directory,
        repo_root=repo_root,
    )
    return publish_teacher_plan(plan, output_directory=output_directory)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selection-jsonl", required=True)
    parser.add_argument("--selection-manifest", required=True)
    parser.add_argument("--expected-merged-revision", required=True)
    parser.add_argument("--output-directory", required=True)
    return parser


def main() -> int:
    arguments = _parser().parse_args()
    try:
        identity = build_and_publish(
            selection_jsonl_path=arguments.selection_jsonl,
            selection_manifest_path=arguments.selection_manifest,
            expected_merged_revision=arguments.expected_merged_revision,
            output_directory=arguments.output_directory,
        )
    except (OSError, TypeError, ValueError, BoundedStableV3PublicationError) as error:
        print(f"[halfkp81-depth18-bounded-stable-v3-plan] STOP: {error}")
        return 1
    print(json.dumps(identity, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
