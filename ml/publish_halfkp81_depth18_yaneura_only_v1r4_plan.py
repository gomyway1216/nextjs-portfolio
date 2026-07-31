#!/usr/bin/env python3
"""Authenticate v1r3's posthoc fault and create-only publish v1r4."""

from __future__ import annotations

import argparse
from collections import Counter
import copy
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
from typing import Any, Mapping

import halfkp81_depth18_strength_protocol as SELECTION_PROTOCOL
import halfkp81_depth18_yaneura_only_v1r3_protocol as V1R3
import halfkp81_depth18_yaneura_only_v1r4_protocol as PROTOCOL
import publish_halfkp81_depth18_teacher_plan as BASE_PUBLISHER


REPO_ROOT = Path(__file__).resolve().parents[1]


class YaneuraOnlyV1R4PublicationError(
    PROTOCOL.YaneuraOnlyV1R4ProtocolError
):
    """Raised when v1r4 authentication or create-only publication fails."""


def _as_publication_error(
    error: Exception,
) -> YaneuraOnlyV1R4PublicationError:
    return YaneuraOnlyV1R4PublicationError(str(error))


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


def _strict_json_document(raw: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            raw,
            parse_constant=lambda constant: (_ for _ in ()).throw(
                YaneuraOnlyV1R4PublicationError(
                    f"{label} contains {constant}"
                )
            ),
        )
    except (
        UnicodeDecodeError,
        json.JSONDecodeError,
        RecursionError,
    ) as error:
        raise YaneuraOnlyV1R4PublicationError(
            f"{label} is invalid JSON"
        ) from error
    if type(value) is not dict:
        raise YaneuraOnlyV1R4PublicationError(
            f"{label} root must be an object"
        )
    return value


def _strict_canonical_document(raw: bytes, label: str) -> dict[str, Any]:
    document = _strict_json_document(raw, label)
    if PROTOCOL.cross_runtime_canonical_json_bytes(document) != raw:
        raise YaneuraOnlyV1R4PublicationError(
            f"{label} is not exact cross-runtime canonical JSON"
        )
    return document


def _verify_merged_revision(revision: str, repo_root: Path) -> None:
    if revision == PROTOCOL.FAILED_V1R3_REVISION:
        raise YaneuraOnlyV1R4PublicationError(
            "failed v1r3 source revision is forbidden"
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
            label="tracked YaneuraOu-only v1r4 preregistration",
        )
        return PROTOCOL.validate_plan_document(
            _strict_json_document(
                raw, "tracked YaneuraOu-only v1r4 preregistration"
            )
        )
    except (
        OSError,
        PROTOCOL.YaneuraOnlyV1R4ProtocolError,
    ) as error:
        raise YaneuraOnlyV1R4PublicationError(
            "tracked YaneuraOu-only v1r4 preregistration authentication "
            f"failed: {error}"
        ) from error


def _verify_exact_directory_entries(
    path: Path, expected_entries: list[str], *, label: str
) -> None:
    try:
        path_stat = path.lstat()
        entries = sorted(child.name for child in path.iterdir())
    except OSError as error:
        raise YaneuraOnlyV1R4PublicationError(
            f"{label} cannot be authenticated"
        ) from error
    if stat.S_ISLNK(path_stat.st_mode) or not stat.S_ISDIR(path_stat.st_mode):
        raise YaneuraOnlyV1R4PublicationError(
            f"{label} is not a real directory"
        )
    if entries != sorted(expected_entries):
        raise YaneuraOnlyV1R4PublicationError(f"{label} entries differ")


def _verify_v1r3_tracked_plan(repo_root: Path) -> None:
    raw = _verify_declared_file(
        PROTOCOL.EXPECTED_FAILED_V1R3["tracked_preregistration"],
        repo_root=repo_root,
        label="failed v1r3 tracked preregistration",
    )
    try:
        document = _strict_json_document(
            raw, "failed v1r3 tracked preregistration"
        )
        V1R3.validate_plan_document(document)
    except V1R3.YaneuraOnlyV1R3ProtocolError as error:
        raise YaneuraOnlyV1R4PublicationError(
            f"failed v1r3 tracked plan binding differs: {error}"
        ) from error


def _verify_v1r3_teacher_plan(
    failed: Mapping[str, Any], repo_root: Path
) -> None:
    plan_raw = _verify_declared_file(
        failed["teacher_plan"],
        repo_root=repo_root,
        label="failed v1r3 teacher plan",
    )
    plan = _strict_canonical_document(plan_raw, "failed v1r3 teacher plan")
    try:
        V1R3.validate_teacher_plan(
            plan,
            authenticated_selection=plan.get("selection_evidence", {}),
            expected_source_revision=failed["source_revision"],
        )
    except V1R3.YaneuraOnlyV1R3ProtocolError as error:
        raise YaneuraOnlyV1R4PublicationError(
            f"failed v1r3 teacher plan binding differs: {error}"
        ) from error


def _canonical_jsonl_records(
    raw: bytes,
    *,
    label: str,
) -> list[dict[str, Any]]:
    lines = raw.splitlines(keepends=True)
    if b"".join(lines) != raw or any(not line.endswith(b"\n") for line in lines):
        raise YaneuraOnlyV1R4PublicationError(
            f"{label} is not complete LF-terminated JSONL"
        )
    return [
        _strict_canonical_document(line, f"{label} record {index}")
        for index, line in enumerate(lines, start=1)
    ]


def _verify_v1r3_work_ledger(
    failed: Mapping[str, Any], repo_root: Path
) -> None:
    expected = failed["work_ledger"]
    raw = _verify_declared_file(
        expected,
        repo_root=repo_root,
        label="failed v1r3 work ledger",
    )
    records = _canonical_jsonl_records(raw, label="failed v1r3 work ledger")
    if len(records) != expected["records"]:
        raise YaneuraOnlyV1R4PublicationError(
            "failed v1r3 work ledger record count differs"
        )
    headers = [record for record in records if record.get("kind") == "header"]
    parents = [record for record in records if record.get("kind") == "parent"]
    if (
        len(headers) != expected["header_records"]
        or len(parents) != expected["parent_records"]
        or any(record.get("schema") != expected["schema"] for record in records)
        or any(
            record.get("run_fingerprint") != expected["run_fingerprint"]
            for record in records
        )
        or headers[0].get("teacher_plan") != failed["teacher_plan"]
        or headers[0].get("source_revision") != failed["source_revision"]
        or headers[0].get("teacher") != PROTOCOL.EXPECTED_TEACHER
    ):
        raise YaneuraOnlyV1R4PublicationError(
            "failed v1r3 work ledger header or binding differs"
        )

    parent_ids = [record.get("parent_id") for record in parents]
    if (
        any(type(parent_id) is not str for parent_id in parent_ids)
        or len(set(parent_ids)) != len(parent_ids)
    ):
        raise YaneuraOnlyV1R4PublicationError(
            "failed v1r3 work ledger parent identity differs"
        )
    role_parents = Counter(record.get("role") for record in parents)
    teacher_rows = sum(
        len(record.get("teacher_entry", {}).get("records", []))
        for record in parents
    )
    role_rows = {
        role: sum(
            len(record.get("teacher_entry", {}).get("records", []))
            for record in parents
            if record.get("role") == role
        )
        for role in ("fit", "sealed", "tune")
    }
    requested = Counter(
        str(
            record.get("teacher_entry", {})
            .get("initial_search", {})
            .get("requested_multipv")
        )
        for record in parents
    )
    if (
        dict(role_parents) != failed["role_parents"]
        or role_rows != failed["role_rows"]
        or teacher_rows != expected["teacher_rows"]
        or dict(requested) != failed["requested_multipv_distribution"]
    ):
        raise YaneuraOnlyV1R4PublicationError(
            "failed v1r3 work ledger accounting differs"
        )
    fault_matches = [
        record
        for record in parents
        if record.get("parent_id") == failed["validator_fault_parent"]
    ]
    if (
        len(fault_matches) != 1
        or fault_matches[0]["teacher_entry"]["initial_search"][
            "requested_multipv"
        ]
        != 6
        or len(fault_matches[0]["teacher_entry"]["records"]) != 6
    ):
        raise YaneuraOnlyV1R4PublicationError(
            "failed v1r3 validator-fault parent evidence differs"
        )


def _verify_v1r3_output_artifacts(
    failed: Mapping[str, Any], repo_root: Path
) -> None:
    for role in ("fit", "sealed", "tune"):
        expected = failed["output_artifacts"][role]
        raw = _verify_declared_file(
            expected,
            repo_root=repo_root,
            label=f"failed v1r3 {role} artifact",
        )
        records = _canonical_jsonl_records(
            raw, label=f"failed v1r3 {role} artifact"
        )
        if (
            len(records) != expected["rows"]
            or any(record.get("schema") != expected["schema"] for record in records)
        ):
            raise YaneuraOnlyV1R4PublicationError(
                f"failed v1r3 {role} artifact rows or schema differ"
            )


def _verify_v1r3_receipt_and_milestones(
    failed: Mapping[str, Any], repo_root: Path
) -> None:
    receipt_expected = failed["teacher_receipt"]
    receipt = _strict_canonical_document(
        _verify_declared_file(
            receipt_expected,
            repo_root=repo_root,
            label="failed v1r3 teacher receipt",
        ),
        "failed v1r3 teacher receipt",
    )
    for field in (
        "schema",
        "status",
        "completed_parents",
        "completed_rows",
        "incomplete_parents",
        "technical_faults",
    ):
        if receipt.get(field) != receipt_expected[field]:
            raise YaneuraOnlyV1R4PublicationError(
                f"failed v1r3 teacher receipt {field} differs"
            )
    receipt_outputs = receipt.get("outputs", {})
    if (
        receipt.get("teacher_plan") != failed["teacher_plan"]
        or receipt.get("role_parents") != failed["role_parents"]
        or receipt.get("role_rows") != failed["role_rows"]
        or receipt.get("old_depth12_targets") != 0
        or any(
            receipt_outputs.get(role)
            != {
                key: failed["output_artifacts"][role][key]
                for key in ("path", "bytes", "sha256")
            }
            for role in ("fit", "sealed", "tune")
        )
        or any(receipt.get("artifact_verification", {}).values())
        or receipt.get("authority", {}).get("may_train") is not False
    ):
        raise YaneuraOnlyV1R4PublicationError(
            "failed v1r3 teacher receipt bindings differ"
        )

    for milestone_name in ("100", "500"):
        expected = failed["milestones"][milestone_name]
        milestone = _strict_canonical_document(
            _verify_declared_file(
                expected,
                repo_root=repo_root,
                label=f"failed v1r3 milestone {milestone_name}",
            ),
            f"failed v1r3 milestone {milestone_name}",
        )
        for field in (
            "schema",
            "run_fingerprint",
            "target_parents",
            "completed_rows",
            "technical_faults",
            "parent_ids_sha256",
            "work_entry_payloads_sha256",
        ):
            if milestone.get(field) != expected[field]:
                raise YaneuraOnlyV1R4PublicationError(
                    f"failed v1r3 milestone {milestone_name} {field} differs"
                )
        if milestone.get("authority", {}).get("may_train") is not False:
            raise YaneuraOnlyV1R4PublicationError(
                f"failed v1r3 milestone {milestone_name} authority differs"
            )


def _verify_v1r3_fault(
    failed: Mapping[str, Any], repo_root: Path
) -> None:
    expected = failed["preflight_terminal_fault"]
    fault = _strict_canonical_document(
        _verify_declared_file(
            expected,
            repo_root=repo_root,
            label="failed v1r3 preflight terminal fault",
        ),
        "failed v1r3 preflight terminal fault",
    )
    for field in ("schema", "status", "selected_parents", "message"):
        if fault.get(field) != expected[field]:
            raise YaneuraOnlyV1R4PublicationError(
                f"failed v1r3 preflight terminal fault {field} differs"
            )
    cleanup = fault.get("process_cleanup", {})
    if (
        cleanup.get("engines_started") != expected["engines_started"]
        or cleanup.get("engines_quit") != expected["engines_quit"]
        or cleanup.get("active_engines_at_fault") != 0
        or fault.get("authority", {}).get("may_train") is not False
        or fault.get("authority", {}).get("may_write_live_weights") is not False
    ):
        raise YaneuraOnlyV1R4PublicationError(
            "failed v1r3 preflight cleanup or authority differs"
        )


def _verify_v1r3_launch(
    failed: Mapping[str, Any], repo_root: Path
) -> None:
    launch = failed["launch"]
    for label, identity in (
        ("failed v1r3 launch spec", launch["launch_spec"]),
        ("failed v1r3 launch plist", launch["plist"]),
        ("failed v1r3 stderr", launch["stderr"]),
        ("failed v1r3 stdout", launch["stdout"]),
    ):
        raw = _verify_declared_file(identity, repo_root=repo_root, label=label)
        if label.endswith("stdout") and raw:
            raise YaneuraOnlyV1R4PublicationError(
                "failed v1r3 stdout is not empty"
            )
    stderr_expected = (
        "[halfkp81-depth18-teacher] durable prefix 100/512, "
        "1195 depth18 rows, faults=0\n"
        "[halfkp81-depth18-teacher] durable prefix 500/512, "
        "5990 depth18 rows, faults=0\n"
        "[halfkp81-depth18-yaneura-only-v1r3-preflight] STOP: "
        f"{failed['preflight_terminal_fault']['message']}\n"
    ).encode("utf-8")
    stderr_raw = _verify_declared_file(
        launch["stderr"], repo_root=repo_root, label="failed v1r3 stderr"
    )
    if stderr_raw != stderr_expected:
        raise YaneuraOnlyV1R4PublicationError(
            "failed v1r3 stderr messages differ"
        )

    spec = _strict_json_document(
        _verify_declared_file(
            launch["launch_spec"],
            repo_root=repo_root,
            label="failed v1r3 launch spec",
        ),
        "failed v1r3 launch spec",
    )
    if (
        spec.get("entrypointPath") != launch["entrypoint"]
        or spec.get("formalOutputNamespace")
        != failed["formal_namespace"]["directory"]
        or spec.get("label") != launch["service_label"]
        or spec.get("teacherPlanPath") != failed["teacher_plan"]["path"]
        or spec.get("teacherPlanBytes") != failed["teacher_plan"]["bytes"]
        or spec.get("teacherPlanSha256")
        != failed["teacher_plan"]["sha256"]
    ):
        raise YaneuraOnlyV1R4PublicationError(
            "failed v1r3 launch binding differs"
        )


def _verify_failed_v1r3_artifacts(repo_root: Path) -> None:
    failed = PROTOCOL.EXPECTED_FAILED_V1R3
    _verify_exact_directory_entries(
        Path(failed["formal_namespace"]["directory"]),
        failed["formal_namespace"]["exact_entries"],
        label="failed v1r3 formal namespace",
    )
    _verify_exact_directory_entries(
        Path(failed["preflight_namespace"]["directory"]),
        failed["preflight_namespace"]["exact_entries"],
        label="failed v1r3 scratch preflight namespace",
    )
    _verify_exact_directory_entries(
        Path(failed["launch"]["namespace"]),
        failed["launch"]["exact_entries"],
        label="failed v1r3 launch namespace",
    )
    _verify_v1r3_tracked_plan(repo_root)
    _verify_v1r3_teacher_plan(failed, repo_root)
    _verify_v1r3_work_ledger(failed, repo_root)
    _verify_v1r3_output_artifacts(failed, repo_root)
    _verify_v1r3_receipt_and_milestones(failed, repo_root)
    _verify_v1r3_fault(failed, repo_root)
    _verify_v1r3_launch(failed, repo_root)


def _verify_failed_v1r3_quiescent() -> None:
    environment = {
        "LANG": "C",
        "LC_ALL": "C",
        "PATH": "/usr/bin:/bin",
        "TZ": "UTC",
    }
    launch = PROTOCOL.EXPECTED_FAILED_V1R3["launch"]
    try:
        service = subprocess.run(
            [
                "/bin/launchctl",
                "print",
                f"gui/{os.getuid()}/{launch['service_label']}",
            ],
            env=environment,
            check=False,
            capture_output=True,
            text=True,
        )
        process = subprocess.run(
            ["/usr/bin/pgrep", "-f", launch["entrypoint"]],
            env=environment,
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError as error:
        raise YaneuraOnlyV1R4PublicationError(
            "failed v1r3 quiescent state cannot be authenticated"
        ) from error
    if service.returncode == 0:
        raise YaneuraOnlyV1R4PublicationError(
            "failed v1r3 launchd service is still present"
        )
    if process.returncode == 0:
        raise YaneuraOnlyV1R4PublicationError(
            "failed v1r3 preflight process is still present"
        )
    if process.returncode != 1:
        raise YaneuraOnlyV1R4PublicationError(
            "failed v1r3 process absence check failed"
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
        raise YaneuraOnlyV1R4PublicationError(
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
    """Authenticate v1r3's complete-but-failed boundary and build v1r4."""

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
    _verify_failed_v1r3_artifacts(root)
    _verify_failed_v1r3_quiescent()
    _verify_engine_assets(root)
    _verify_live_baseline(root)
    try:
        evidence = SELECTION_PROTOCOL.authenticate_selection_artifacts(
            selection_jsonl_path,
            selection_manifest_path,
            expected_source_revision=expected_merged_revision,
        )
    except SELECTION_PROTOCOL.Halfkp81Depth18StrengthError as error:
        raise YaneuraOnlyV1R4PublicationError(
            f"selection authentication failed: {error}"
        ) from error

    if output_directory != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]:
        raise YaneuraOnlyV1R4PublicationError(
            "output directory differs from create-only v1r4 namespace"
        )
    try:
        directory = BASE_PUBLISHER._canonical_output_directory(output_directory)
    except BASE_PUBLISHER.TeacherPlanPublicationError as error:
        raise _as_publication_error(error) from error
    if str(directory) != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]:
        raise YaneuraOnlyV1R4PublicationError(
            "canonical v1r4 output differs"
        )

    evidence_document = copy.deepcopy(dict(evidence.document))
    plan = {
        "authority": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_AUTHORITY),
        "downstream_gates": copy.deepcopy(PROTOCOL.EXPECTED_GATES),
        "engine": copy.deepcopy(PROTOCOL.EXPECTED_ENGINE),
        "outputs": copy.deepcopy(PROTOCOL.EXPECTED_RUNTIME_OUTPUTS),
        "predecessor_v1": copy.deepcopy(PROTOCOL.EXPECTED_PREDECESSOR_V1),
        "predecessor_v1r2": copy.deepcopy(
            PROTOCOL.EXPECTED_PREDECESSOR_V1R2
        ),
        "predecessor_v1r3": copy.deepcopy(PROTOCOL.EXPECTED_FAILED_V1R3),
        "predecessor_v3r3": copy.deepcopy(
            PROTOCOL.EXPECTED_PREDECESSOR_V3R3
        ),
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
        "technical_recovery": copy.deepcopy(
            PROTOCOL.EXPECTED_TECHNICAL_RECOVERY
        ),
        "training": copy.deepcopy(PROTOCOL.EXPECTED_TRAINING),
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
        raise YaneuraOnlyV1R4PublicationError(
            "v1r4 teacher plan schema differs"
        )
    if plan.get("outputs") != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS:
        raise YaneuraOnlyV1R4PublicationError("v1r4 teacher outputs differ")
    if output_directory != PROTOCOL.EXPECTED_RUNTIME_OUTPUTS["directory"]:
        raise YaneuraOnlyV1R4PublicationError(
            "v1r4 publication namespace differs"
        )
    normalized = PROTOCOL.normalize_cross_runtime_document(plan)
    cross_runtime_raw = PROTOCOL.cross_runtime_canonical_json_bytes(normalized)
    python_raw = BASE_PUBLISHER.PROTOCOL.canonical_json_bytes(normalized)
    if cross_runtime_raw != python_raw:
        raise YaneuraOnlyV1R4PublicationError(
            "Python and ECMAScript-compatible canonical JSON differ"
        )
    try:
        identity = BASE_PUBLISHER.publish_teacher_plan(
            normalized, output_directory=output_directory
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
        YaneuraOnlyV1R4PublicationError,
    ) as error:
        print(f"[halfkp81-depth18-yaneura-only-v1r4-plan] STOP: {error}")
        return 1
    print(json.dumps(identity, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
