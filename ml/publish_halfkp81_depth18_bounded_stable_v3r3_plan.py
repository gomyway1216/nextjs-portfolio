#!/usr/bin/env python3
"""Authenticate and create-only publish the bounded-stable v3r3 plan."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
from typing import Any, Mapping

import halfkp81_depth18_bounded_stable_v3_protocol as V3
import halfkp81_depth18_bounded_stable_v3r2_protocol as V3R2
import halfkp81_depth18_bounded_stable_v3r3_protocol as PROTOCOL
import halfkp81_depth18_strength_protocol as SELECTION_PROTOCOL
import publish_halfkp81_depth18_teacher_plan as BASE_PUBLISHER


REPO_ROOT = Path(__file__).resolve().parents[1]
FAILED_V3R2_ENTRYPOINT = (
    "/Users/yudaiyaguchi/.codex/worktrees/541a/nextjs-portfolio/"
    "ml/run-halfkp81-depth18-bounded-stable-v3r2-teacher.ts"
)


class BoundedStableV3R3PublicationError(
    PROTOCOL.BoundedStableV3R3ProtocolError
):
    """Raised when v3r3 authority authentication or publication fails."""


def _as_publication_error(
    error: Exception,
) -> BoundedStableV3R3PublicationError:
    return BoundedStableV3R3PublicationError(str(error))


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
    if revision == PROTOCOL.FAILED_V3R2_REVISION:
        raise BoundedStableV3R3PublicationError(
            "failed v3r2 source revision is forbidden"
        )
    try:
        BASE_PUBLISHER._verify_merged_revision(revision, repo_root)
    except BASE_PUBLISHER.TeacherPlanPublicationError as error:
        raise _as_publication_error(error) from error


def _verify_tracked_preregistration(repo_root: Path) -> dict[str, Any]:
    try:
        raw = _verify_declared_file(
            PROTOCOL.EXPECTED_TRACKED_PLAN_IDENTITY,
            repo_root=repo_root,
            label="tracked v3r3 preregistration",
        )
        return PROTOCOL.validate_plan_document(json.loads(raw))
    except (
        OSError,
        UnicodeDecodeError,
        json.JSONDecodeError,
        PROTOCOL.BoundedStableV3R3ProtocolError,
    ) as error:
        raise BoundedStableV3R3PublicationError(
            f"tracked v3r3 preregistration authentication failed: {error}"
        ) from error


def _verify_diagnostic_receipt(repo_root: Path) -> dict[str, Any]:
    try:
        raw = _verify_declared_file(
            PROTOCOL.EXPECTED_DIAGNOSTIC_RECEIPT_IDENTITY,
            repo_root=repo_root,
            label="confirmed fd3 diagnostic receipt",
        )
        document = json.loads(raw)
        return PROTOCOL.validate_diagnostic_document(document)
    except (
        OSError,
        UnicodeDecodeError,
        json.JSONDecodeError,
        PROTOCOL.BoundedStableV3R3ProtocolError,
    ) as error:
        raise BoundedStableV3R3PublicationError(
            f"fd3 diagnostic receipt authentication failed: {error}"
        ) from error


def _verify_v3_strength_contract(repo_root: Path) -> None:
    raw = _verify_declared_file(
        PROTOCOL.EXPECTED_V3_STRENGTH_CONTRACT,
        repo_root=repo_root,
        label="unchanged v3 strength contract",
    )
    try:
        document = V3.parse_strict_json_bytes(raw, "v3 strength contract")
        V3.validate_plan_document(document)
    except V3.BoundedStableV3ProtocolError as error:
        raise BoundedStableV3R3PublicationError(
            f"v3 strength contract authentication failed: {error}"
        ) from error


def _verify_exact_directory_entries(
    path: Path, expected_entries: list[str]
) -> None:
    try:
        path_stat = path.lstat()
        entries = sorted(child.name for child in path.iterdir())
    except OSError as error:
        raise BoundedStableV3R3PublicationError(
            "failed v3r2 formal namespace cannot be authenticated"
        ) from error
    if stat.S_ISLNK(path_stat.st_mode) or not stat.S_ISDIR(path_stat.st_mode):
        raise BoundedStableV3R3PublicationError(
            "failed v3r2 formal namespace is not a real directory"
        )
    if entries != sorted(expected_entries):
        raise BoundedStableV3R3PublicationError(
            "failed v3r2 formal namespace entries differ"
        )


def _verify_failed_v3r2_artifacts(repo_root: Path) -> None:
    failed = PROTOCOL.EXPECTED_FAILED_V3R2
    namespace = failed["formal_namespace"]
    _verify_exact_directory_entries(
        Path(namespace["directory"]), namespace["exact_entries"]
    )

    tracked_raw = _verify_declared_file(
        failed["tracked_recovery_plan"],
        repo_root=repo_root,
        label="failed v3r2 tracked plan",
    )
    try:
        V3R2.validate_plan_document(
            V3R2.parse_pinned_tracked_plan_bytes(tracked_raw)
        )
    except V3R2.BoundedStableV3R2ProtocolError as error:
        raise BoundedStableV3R3PublicationError(
            f"failed v3r2 tracked plan binding differs: {error}"
        ) from error

    plan_raw = _verify_declared_file(
        failed["teacher_plan"],
        repo_root=repo_root,
        label="failed v3r2 teacher plan",
    )
    plan = _strict_canonical_document(plan_raw, "failed v3r2 teacher plan")
    try:
        V3R2.validate_teacher_plan(
            plan,
            authenticated_selection=plan.get("selection_evidence", {}),
            expected_source_revision=failed["source_revision"],
        )
    except V3R2.BoundedStableV3R2ProtocolError as error:
        raise BoundedStableV3R3PublicationError(
            f"failed v3r2 teacher plan binding differs: {error}"
        ) from error

    work_raw = _verify_declared_file(
        failed["work_ledger"],
        repo_root=repo_root,
        label="failed v3r2 work ledger",
    )
    lines = work_raw.splitlines(keepends=True)
    if len(lines) != failed["work_ledger"]["records"]:
        raise BoundedStableV3R3PublicationError(
            "failed v3r2 work ledger record count differs"
        )
    records = [
        _strict_canonical_document(
            line, f"failed v3r2 work ledger record {index}"
        )
        for index, line in enumerate(lines, start=1)
    ]
    headers = [record for record in records if record.get("kind") == "header"]
    parents = [record for record in records if record.get("kind") == "parent"]
    if (
        len(headers) != failed["work_ledger"]["header_records"]
        or len(parents) != failed["work_ledger"]["parent_records"]
        or any(
            record.get("run_fingerprint") != failed["run_fingerprint"]
            for record in records
        )
        or headers[0].get("teacher_plan") != failed["teacher_plan"]
    ):
        raise BoundedStableV3R3PublicationError(
            "failed v3r2 work ledger structure differs"
        )
    teacher_rows = sum(
        len(record.get("teacher_entry", {}).get("records", []))
        for record in parents
    )
    if teacher_rows != failed["work_ledger"]["teacher_rows"]:
        raise BoundedStableV3R3PublicationError(
            "failed v3r2 work ledger teacher rows differ"
        )

    fault_raw = _verify_declared_file(
        failed["terminal_fault"],
        repo_root=repo_root,
        label="failed v3r2 terminal fault",
    )
    fault = _strict_canonical_document(fault_raw, "failed v3r2 terminal fault")
    fault_expected = failed["terminal_fault"]
    for field in (
        "schema",
        "status",
        "run_fingerprint",
        "completed_parents",
        "incomplete_parents",
        "technical_faults",
        "message",
    ):
        if fault.get(field) != fault_expected[field]:
            raise BoundedStableV3R3PublicationError(
                f"failed v3r2 terminal fault {field} differs"
            )
    if (
        fault.get("teacher_plan") != failed["teacher_plan"]
        or fault.get("authority", {}).get("may_resume_same_family") is not False
        or fault.get("authority", {}).get("may_train") is not False
        or fault.get("authority", {}).get("may_write_live_weights") is not False
    ):
        raise BoundedStableV3R3PublicationError(
            "failed v3r2 terminal authority differs"
        )

    for label, identity in (
        ("failed v3r2 launch plist", failed["launch"]["plist"]),
        ("failed v3r2 stderr", failed["launch"]["stderr"]),
        ("failed v3r2 stdout", failed["launch"]["stdout"]),
    ):
        _verify_declared_file(identity, repo_root=repo_root, label=label)


def _verify_failed_v3r2_quiescent() -> None:
    environment = {
        "LANG": "C",
        "LC_ALL": "C",
        "PATH": "/usr/bin:/bin",
        "TZ": "UTC",
    }
    label = PROTOCOL.EXPECTED_FAILED_V3R2["launch"]["service_label"]
    try:
        service = subprocess.run(
            ["/bin/launchctl", "print", f"gui/{os.getuid()}/{label}"],
            env=environment,
            check=False,
            capture_output=True,
            text=True,
        )
        process = subprocess.run(
            ["/usr/bin/pgrep", "-f", FAILED_V3R2_ENTRYPOINT],
            env=environment,
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError as error:
        raise BoundedStableV3R3PublicationError(
            "failed v3r2 quiescent state cannot be authenticated"
        ) from error
    if service.returncode == 0:
        raise BoundedStableV3R3PublicationError(
            "failed v3r2 launchd service is still present"
        )
    if process.returncode == 0:
        raise BoundedStableV3R3PublicationError(
            "failed v3r2 teacher process is still present"
        )
    if process.returncode != 1:
        raise BoundedStableV3R3PublicationError(
            "failed v3r2 process absence check failed"
        )


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
    if (
        hashlib.sha256(tree_payload).hexdigest()
        != PROTOCOL.EXPECTED_ENGINE["eval_tree_sha256"]
    ):
        raise BoundedStableV3R3PublicationError(
            "YaneuraOu eval-tree identity differs"
        )


def _verify_live_baseline(repo_root: Path) -> None:
    _verify_declared_file(
        PROTOCOL.EXPECTED_LIVE_BASELINE,
        repo_root=repo_root,
        label="unchanged live baseline",
    )


def build_teacher_plan(
    *,
    selection_jsonl_path: str,
    selection_manifest_path: str,
    expected_merged_revision: str,
    output_directory: str,
    repo_root: Path = REPO_ROOT,
) -> dict[str, Any]:
    """Authenticate the confirmed recovery boundary and build a sealed plan."""

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
    _verify_diagnostic_receipt(root)
    _verify_v3_strength_contract(root)
    _verify_failed_v3r2_artifacts(root)
    _verify_failed_v3r2_quiescent()
    _verify_engine_assets(root)
    _verify_live_baseline(root)
    try:
        evidence = SELECTION_PROTOCOL.authenticate_selection_artifacts(
            selection_jsonl_path,
            selection_manifest_path,
            expected_source_revision=expected_merged_revision,
        )
    except SELECTION_PROTOCOL.Halfkp81Depth18StrengthError as error:
        raise BoundedStableV3R3PublicationError(
            f"selection authentication failed: {error}"
        ) from error

    if output_directory != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]:
        raise BoundedStableV3R3PublicationError(
            "output directory differs from create-only v3r3 namespace"
        )
    try:
        directory = BASE_PUBLISHER._canonical_output_directory(output_directory)
    except BASE_PUBLISHER.TeacherPlanPublicationError as error:
        raise _as_publication_error(error) from error
    if str(directory) != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]:
        raise BoundedStableV3R3PublicationError(
            "canonical v3r3 output differs"
        )

    evidence_document = copy.deepcopy(dict(evidence.document))
    plan = {
        "authority": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_AUTHORITY),
        "diagnostic_receipt": copy.deepcopy(
            PROTOCOL.EXPECTED_DIAGNOSTIC_RECEIPT_IDENTITY
        ),
        "engine": copy.deepcopy(PROTOCOL.EXPECTED_ENGINE),
        "outputs": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_OUTPUTS),
        "predecessor_v2": copy.deepcopy(PROTOCOL.EXPECTED_PREDECESSOR_V2),
        "predecessor_v3": copy.deepcopy(PROTOCOL.EXPECTED_PREDECESSOR_V3),
        "predecessor_v3r2": copy.deepcopy(PROTOCOL.EXPECTED_FAILED_V3R2),
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
    if plan.get("schema") != PROTOCOL.TEACHER_PLAN_SCHEMA:
        raise BoundedStableV3R3PublicationError(
            "v3r3 teacher plan schema differs"
        )
    if plan.get("outputs") != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS:
        raise BoundedStableV3R3PublicationError("v3r3 teacher outputs differ")
    if output_directory != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]:
        raise BoundedStableV3R3PublicationError(
            "v3r3 publication namespace differs"
        )
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
    except (
        OSError,
        TypeError,
        ValueError,
        BoundedStableV3R3PublicationError,
    ) as error:
        print(f"[halfkp81-depth18-bounded-stable-v3r3-plan] STOP: {error}")
        return 1
    print(json.dumps(identity, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
