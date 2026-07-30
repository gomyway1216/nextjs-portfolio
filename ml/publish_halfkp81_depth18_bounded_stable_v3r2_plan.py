#!/usr/bin/env python3
"""Authenticate and create-only publish the bounded-stable v3r2 plan."""

from __future__ import annotations

import argparse
import copy
import json
import os
from pathlib import Path
import stat
import subprocess
from typing import Any, Mapping

import halfkp81_depth18_bounded_stable_v3_protocol as V3
import halfkp81_depth18_bounded_stable_v3r2_protocol as PROTOCOL
import halfkp81_depth18_strength_protocol as SELECTION_PROTOCOL
import publish_halfkp81_depth18_teacher_plan as BASE_PUBLISHER


REPO_ROOT = Path(__file__).resolve().parents[1]
FAILED_V3_ENTRYPOINT = (
    "/Users/yudaiyaguchi/.codex/worktrees/541a/nextjs-portfolio/"
    "ml/run-halfkp81-depth18-bounded-stable-v3-teacher.ts"
)


class BoundedStableV3R2PublicationError(
    PROTOCOL.BoundedStableV3R2ProtocolError
):
    """Raised when v3r2 authority authentication or publication fails."""


def _as_publication_error(
    error: Exception,
) -> BoundedStableV3R2PublicationError:
    return BoundedStableV3R2PublicationError(str(error))


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
    if revision == PROTOCOL.FAILED_V3_REVISION:
        raise BoundedStableV3R2PublicationError(
            "failed v3 source revision is forbidden"
        )
    try:
        BASE_PUBLISHER._verify_merged_revision(revision, repo_root)
    except BASE_PUBLISHER.TeacherPlanPublicationError as error:
        raise _as_publication_error(error) from error


def _verify_tracked_preregistration(repo_root: Path) -> dict[str, Any]:
    """Accept the pinned reviewed pretty JSON; reject every other byte string."""

    try:
        raw = _verify_declared_file(
            PROTOCOL.EXPECTED_TRACKED_PLAN_IDENTITY,
            repo_root=repo_root,
            label="tracked v3r2 preregistration",
        )
        document = PROTOCOL.parse_pinned_tracked_plan_bytes(raw)
        return PROTOCOL.validate_plan_document(document)
    except (OSError, PROTOCOL.BoundedStableV3R2ProtocolError) as error:
        raise BoundedStableV3R2PublicationError(
            f"tracked v3r2 preregistration authentication failed: {error}"
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
        raise BoundedStableV3R2PublicationError(
            f"v3 strength contract authentication failed: {error}"
        ) from error


def _verify_exact_directory_entries(
    path: Path, expected_entries: list[str]
) -> None:
    try:
        path_stat = path.lstat()
        entries = sorted(child.name for child in path.iterdir())
    except OSError as error:
        raise BoundedStableV3R2PublicationError(
            "failed v3 formal namespace cannot be authenticated"
        ) from error
    if stat.S_ISLNK(path_stat.st_mode) or not stat.S_ISDIR(path_stat.st_mode):
        raise BoundedStableV3R2PublicationError(
            "failed v3 formal namespace is not a real directory"
        )
    if entries != sorted(expected_entries):
        raise BoundedStableV3R2PublicationError(
            "failed v3 formal namespace entries differ"
        )


def _verify_failed_v3_artifacts(repo_root: Path) -> None:
    failed = PROTOCOL.EXPECTED_FAILED_V3
    namespace = failed["formal_namespace"]
    _verify_exact_directory_entries(
        Path(namespace["directory"]), namespace["exact_entries"]
    )
    plan_raw = _verify_declared_file(
        failed["teacher_plan"],
        repo_root=repo_root,
        label="failed v3 teacher plan",
    )
    plan = _strict_canonical_document(plan_raw, "failed v3 teacher plan")
    try:
        V3.validate_teacher_plan(
            plan,
            authenticated_selection=plan.get("selection_evidence", {}),
            expected_source_revision=failed["source_revision"],
        )
    except V3.BoundedStableV3ProtocolError as error:
        raise BoundedStableV3R2PublicationError(
            f"failed v3 teacher plan binding differs: {error}"
        ) from error
    if (
        plan.get("schema") != failed["teacher_plan"]["schema"]
        or plan.get("status") != "sealed-not-executed"
        or plan.get("outputs", {}).get("directory") != namespace["directory"]
        or failed["completed_parents"] != 0
        or failed["teacher_rows"] != 0
        or failed["terminal_fault_artifact_present"] is not False
    ):
        raise BoundedStableV3R2PublicationError(
            "failed v3 zero-row terminal state differs"
        )

    launch = failed["launch"]
    for label, identity in (
        ("failed v3 launch plist", launch["plist"]),
        ("failed v3 stderr", launch["stderr"]),
        ("failed v3 stdout", launch["stdout"]),
    ):
        _verify_declared_file(identity, repo_root=repo_root, label=label)


def _verify_failed_v3_quiescent() -> None:
    """Require both the failed launchd service and its entrypoint to be absent."""

    environment = {
        "LANG": "C",
        "LC_ALL": "C",
        "PATH": "/usr/bin:/bin",
        "TZ": "UTC",
    }
    label = PROTOCOL.EXPECTED_FAILED_V3["launch"]["service_label"]
    try:
        service = subprocess.run(
            ["/bin/launchctl", "print", f"gui/{os.getuid()}/{label}"],
            env=environment,
            check=False,
            capture_output=True,
            text=True,
        )
        process = subprocess.run(
            ["/usr/bin/pgrep", "-f", FAILED_V3_ENTRYPOINT],
            env=environment,
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError as error:
        raise BoundedStableV3R2PublicationError(
            "failed v3 quiescent state cannot be authenticated"
        ) from error
    if service.returncode == 0:
        raise BoundedStableV3R2PublicationError(
            "failed v3 launchd service is still present"
        )
    if process.returncode == 0:
        raise BoundedStableV3R2PublicationError(
            "failed v3 teacher process is still present"
        )
    if process.returncode != 1:
        raise BoundedStableV3R2PublicationError(
            "failed v3 process absence check failed"
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
    import hashlib

    if (
        hashlib.sha256(tree_payload).hexdigest()
        != PROTOCOL.EXPECTED_ENGINE["eval_tree_sha256"]
    ):
        raise BoundedStableV3R2PublicationError(
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
    """Authenticate the fixed recovery boundary and build a sealed plan."""

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
    _verify_v3_strength_contract(root)
    _verify_failed_v3_artifacts(root)
    _verify_failed_v3_quiescent()
    _verify_engine_assets(root)
    try:
        evidence = SELECTION_PROTOCOL.authenticate_selection_artifacts(
            selection_jsonl_path,
            selection_manifest_path,
            expected_source_revision=expected_merged_revision,
        )
    except SELECTION_PROTOCOL.Halfkp81Depth18StrengthError as error:
        raise BoundedStableV3R2PublicationError(
            f"selection authentication failed: {error}"
        ) from error

    if output_directory != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]:
        raise BoundedStableV3R2PublicationError(
            "output directory differs from create-only v3r2 namespace"
        )
    try:
        directory = BASE_PUBLISHER._canonical_output_directory(output_directory)
    except BASE_PUBLISHER.TeacherPlanPublicationError as error:
        raise _as_publication_error(error) from error
    if str(directory) != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]:
        raise BoundedStableV3R2PublicationError(
            "canonical v3r2 output differs"
        )

    evidence_document = copy.deepcopy(dict(evidence.document))
    plan = {
        "authority": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_AUTHORITY),
        "engine": copy.deepcopy(PROTOCOL.EXPECTED_ENGINE),
        "outputs": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_OUTPUTS),
        "predecessor_v2": copy.deepcopy(PROTOCOL.EXPECTED_PREDECESSOR_V2),
        "predecessor_v3": copy.deepcopy(PROTOCOL.EXPECTED_FAILED_V3),
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
    """Create only the canonical v3r2 teacher plan."""

    if plan.get("schema") != PROTOCOL.TEACHER_PLAN_SCHEMA:
        raise BoundedStableV3R2PublicationError(
            "v3r2 teacher plan schema differs"
        )
    if plan.get("outputs") != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS:
        raise BoundedStableV3R2PublicationError("v3r2 teacher outputs differ")
    if output_directory != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]:
        raise BoundedStableV3R2PublicationError(
            "v3r2 publication namespace differs"
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
        BoundedStableV3R2PublicationError,
    ) as error:
        print(f"[halfkp81-depth18-bounded-stable-v3r2-plan] STOP: {error}")
        return 1
    print(json.dumps(identity, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
