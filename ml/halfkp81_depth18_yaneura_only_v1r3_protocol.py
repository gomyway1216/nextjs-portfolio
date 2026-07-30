#!/usr/bin/env python3
"""Fail-closed protocol for the v1r3 scratch-directory recovery."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Mapping

import halfkp81_depth18_yaneura_only_v1r2_protocol as V1R2


PLAN_SCHEMA = "shogi-halfkp81-hard-depth18-yaneura-only-recovery-plan-v1r3"
TEACHER_PLAN_SCHEMA = (
    "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r3"
)
TEACHER_WORK_SCHEMA = (
    "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r3"
)
FAMILY = "halfkp81-hard-depth18-yaneura-only-v1r3"
PLAN_STATUS = "prospective-scratch-directory-recovery-not-executed"
FAILED_V1R2_REVISION = "20ec3fdf4ba81c89af4ba02bb7483b75945ebf4a"
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")

EXPECTED_TRACKED_PLAN_IDENTITY = {
    "path": "ml/halfkp81-hard-depth18-yaneura-only-v1r3-plan.json",
    "bytes": 21_235,
    "sha256": "9474f94dc9f46ae4100f69680428e6171c0ac9200ddc53ed704369a97d6b10c7",
    "schema": PLAN_SCHEMA,
}

EXPECTED_AUTHORITY = copy.deepcopy(V1R2.EXPECTED_AUTHORITY)
EXPECTED_RUNTIME_AUTHORITY = copy.deepcopy(V1R2.EXPECTED_RUNTIME_AUTHORITY)
EXPECTED_ENGINE = copy.deepcopy(V1R2.EXPECTED_ENGINE)
EXPECTED_GATES = copy.deepcopy(V1R2.EXPECTED_GATES)
EXPECTED_LEDGER_CANDIDATE_GENERATION = copy.deepcopy(
    V1R2.EXPECTED_LEDGER_CANDIDATE_GENERATION
)
EXPECTED_LIVE_BASELINE = copy.deepcopy(V1R2.EXPECTED_LIVE_BASELINE)
EXPECTED_PREDECESSOR_V1 = copy.deepcopy(V1R2.EXPECTED_FAILED_V1)
EXPECTED_PREDECESSOR_V3R3 = copy.deepcopy(V1R2.EXPECTED_PREDECESSOR_V3R3)
EXPECTED_REUSED_SELECTION = copy.deepcopy(V1R2.EXPECTED_REUSED_SELECTION)
EXPECTED_SELECTION_ROLES = copy.deepcopy(V1R2.EXPECTED_SELECTION_ROLES)
EXPECTED_TEACHER = copy.deepcopy(V1R2.EXPECTED_TEACHER)
EXPECTED_TRACKED_PARSER = copy.deepcopy(V1R2.EXPECTED_TRACKED_PARSER)
EXPECTED_TRAINING = copy.deepcopy(V1R2.EXPECTED_TRAINING)

_V1R2_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-hard-depth18-yaneura-only-v1r2"
)
_V1R2_PREFLIGHT_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-depth18-yaneura-only-v1r2-preflight"
)
_V1R2_LAUNCH_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/launch-agents/"
    "halfkp81-depth18-yaneura-only-v1r2-preflight512-20ec3fdf"
)
_V1R2_SERVICE_LABEL = (
    "com.meetyudai.shogi."
    "halfkp81-depth18-yaneura-v1r2-preflight512-20ec3fdf"
)
_V1R2_ENTRYPOINT = (
    "/Users/yudaiyaguchi/.codex/worktrees/541a/nextjs-portfolio/"
    "ml/run-halfkp81-depth18-yaneura-only-v1r2-preflight.ts"
)
_V1R2_FINGERPRINT = (
    "12e80cb27485ffa0f95dfa21e68117150652781c80c5dd54783cc3b89ca3ce3a"
)
_V1R2_FAILURE_MESSAGE = (
    "ENOENT: no such file or directory, open "
    "'/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-depth18-yaneura-only-v1r2-preflight/teacher-work.jsonl'"
)
EXPECTED_FAILED_V1R2 = {
    "completed_parents": 0,
    "family": V1R2.FAMILY,
    "formal_namespace": {
        "directory": _V1R2_DIRECTORY,
        "exact_entries": ["teacher-plan.json"],
    },
    "launch": {
        "entrypoint": _V1R2_ENTRYPOINT,
        "exact_entries": [
            f"{_V1R2_SERVICE_LABEL}.launch-agent.plist",
            f"{_V1R2_SERVICE_LABEL}.stderr.log",
            f"{_V1R2_SERVICE_LABEL}.stdout.log",
            "launch-spec.json",
        ],
        "launch_spec": {
            "bytes": 1_004,
            "path": f"{_V1R2_LAUNCH_DIRECTORY}/launch-spec.json",
            "sha256": (
                "44fe8bb6b17dd1410bda8f9cd616a294f47d337203d786d27d9682182d2e8197"
            ),
        },
        "namespace": _V1R2_LAUNCH_DIRECTORY,
        "plist": {
            "bytes": 1_561,
            "path": (
                f"{_V1R2_LAUNCH_DIRECTORY}/{_V1R2_SERVICE_LABEL}."
                "launch-agent.plist"
            ),
            "sha256": (
                "7190f6eafb1ba300fa492a9d336169b4322bfda7855855c20aaf68bc82f0f71b"
            ),
        },
        "process_present": False,
        "service_label": _V1R2_SERVICE_LABEL,
        "service_present": False,
        "stderr": {
            "bytes": 197,
            "path": (
                f"{_V1R2_LAUNCH_DIRECTORY}/{_V1R2_SERVICE_LABEL}.stderr.log"
            ),
            "sha256": (
                "300748a256d542b143b96fd8076f34ffb84b0f1b27a8f7ce728c0d00577a58b6"
            ),
        },
        "stdout": {
            "bytes": 0,
            "path": (
                f"{_V1R2_LAUNCH_DIRECTORY}/{_V1R2_SERVICE_LABEL}.stdout.log"
            ),
            "sha256": (
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            ),
        },
    },
    "preflight_namespace": {
        "directory": _V1R2_PREFLIGHT_DIRECTORY,
        "exact_entries": [
            "preflight-terminal-fault.json",
            "teacher-terminal-fault.json",
        ],
    },
    "preflight_terminal_fault": {
        "bytes": 497,
        "engines_quit": 0,
        "engines_started": 0,
        "message": _V1R2_FAILURE_MESSAGE,
        "path": f"{_V1R2_PREFLIGHT_DIRECTORY}/preflight-terminal-fault.json",
        "schema": (
            "shogi-halfkp81-hard-depth18-yaneura-only-"
            "preflight-terminal-fault-v1r2"
        ),
        "selected_parents": 512,
        "sha256": (
            "13643215a0f16726625938196fa2cc4cdadfeef2fc06ae0f87070104ba5456e7"
        ),
        "status": "scratch-preflight-failed-no-formal-authority",
    },
    "recovery_reason": "scratch-preflight-output-directory-was-not-created",
    "reuse_completed_parents": 0,
    "reuse_teacher_rows": 0,
    "run_fingerprint": _V1R2_FINGERPRINT,
    "same_family_resume_authorized": False,
    "source_revision": FAILED_V1R2_REVISION,
    "status": "scratch-preflight-terminal-technical-fault-family-stopped",
    "teacher_plan": {
        "bytes": 15_649,
        "path": f"{_V1R2_DIRECTORY}/teacher-plan.json",
        "schema": V1R2.TEACHER_PLAN_SCHEMA,
        "sha256": (
            "e351e6cf07e68ac7047a453b88695af476bc7211bfc75a71bece774e044694ab"
        ),
    },
    "teacher_rows": 0,
    "terminal_fault": {
        "bytes": 823,
        "completed_parents": 0,
        "incomplete_parents": 512,
        "message": _V1R2_FAILURE_MESSAGE,
        "path": f"{_V1R2_PREFLIGHT_DIRECTORY}/teacher-terminal-fault.json",
        "run_fingerprint": _V1R2_FINGERPRINT,
        "schema": "shogi-halfkp81-hard-depth18-teacher-terminal-fault-v1",
        "sha256": (
            "6d21199a482ccfdeb53cce1e45b2c608916c0e9cd4db74cf3aa18c8bf2a410bc"
        ),
        "status": "terminal-fault-family-stopped",
        "technical_faults": 1,
    },
    "tracked_preregistration": copy.deepcopy(
        V1R2.EXPECTED_TRACKED_PLAN_IDENTITY
    ),
    "work_ledger_created": False,
}

_V1R3_PREFLIGHT_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-depth18-yaneura-only-v1r3-preflight"
)
EXPECTED_TECHNICAL_RECOVERY = {
    "cross_runtime_canonical_json": copy.deepcopy(
        V1R2.EXPECTED_TECHNICAL_RECOVERY
    ),
    "formal_output_directory_initialization_changed": False,
    "scratch_preflight_directory": {
        "create_before_initialize_work": True,
        "creation_policy": "create-only-fail-if-target-exists",
        "mode": "0700",
        "path": _V1R3_PREFLIGHT_DIRECTORY,
        "require_empty_real_directory": True,
        "symlink_allowed": False,
    },
    "selection_contract_changed": False,
    "strength_contract_changed": False,
    "teacher_generation_contract_changed": False,
    "timeout_extension_milliseconds": 0,
    "training_contract_changed": False,
}
EXPECTED_CHANGE_CONTROL = {
    "allowed_changes": [
        "create-v1r3-scratch-preflight-directory-mode-0700-before-initialize-work",
        "bind-v1r2-zero-row-preflight-directory-enoent-fault",
        "new-clean-merged-main-source-revision",
        "new-run-fingerprint",
        "new-create-only-output-namespace",
    ],
    "downstream_gates_must_equal_v1r2": True,
    "failed_v1r2_parent_rows_reused": 0,
    "failed_v1r2_teacher_rows_reused": 0,
    "selection_must_equal_v1r2": True,
    "strength_contract_must_equal_v1r2": True,
    "training_contract_must_equal_v1r2": True,
}

_OUTPUT_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-hard-depth18-yaneura-only-v1r3"
)
EXPECTED_OUTPUT_NAMESPACE = {
    "collision_policy": "create-only-fail-if-any-target-exists",
    "directory": _OUTPUT_DIRECTORY,
    "fit_jsonl": f"{_OUTPUT_DIRECTORY}/fit.jsonl",
    "milestone_100_json": f"{_OUTPUT_DIRECTORY}/teacher-milestone-100.json",
    "milestone_500_json": f"{_OUTPUT_DIRECTORY}/teacher-milestone-500.json",
    "plan_json": f"{_OUTPUT_DIRECTORY}/teacher-plan.json",
    "receipt_json": f"{_OUTPUT_DIRECTORY}/teacher-receipt.json",
    "sealed_jsonl": f"{_OUTPUT_DIRECTORY}/sealed.jsonl",
    "terminal_fault_json": f"{_OUTPUT_DIRECTORY}/teacher-terminal-fault.json",
    "tune_jsonl": f"{_OUTPUT_DIRECTORY}/tune.jsonl",
    "verified_artifact_receipt_json": (
        f"{_OUTPUT_DIRECTORY}/teacher-verified-artifact-receipt.json"
    ),
    "work_jsonl": f"{_OUTPUT_DIRECTORY}/teacher-work.jsonl",
}
EXPECTED_RUNTIME_OUTPUTS = {
    key: value
    for key, value in EXPECTED_OUTPUT_NAMESPACE.items()
    if key != "collision_policy"
}
EXPECTED_SOURCE_REVISION_POLICY = {
    "forbidden_failed_v1r2_revision": FAILED_V1R2_REVISION,
    "must_bind_new_clean_merged_main_revision": True,
    "new_run_fingerprint_required": True,
    "runtime_plan_source_revision_must_equal_authenticated_main_head": True,
    "tracked_plan_must_be_merged_before_runtime_plan": True,
    "uncommitted_changes_maximum": 0,
}


class YaneuraOnlyV1R3ProtocolError(ValueError):
    """Raised when the v1r3 directory recovery contract differs."""


def _require_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise YaneuraOnlyV1R3ProtocolError(
            f"{label} does not match YaneuraOu-only v1r3 preregistration"
        )


def _reject_constant(constant: str) -> Any:
    raise YaneuraOnlyV1R3ProtocolError(f"pinned JSON contains {constant}")


def _parse_exact_identity(
    raw: bytes,
    expected_identity: Mapping[str, Any],
    *,
    label: str,
) -> Mapping[str, Any]:
    _require_equal(
        {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()},
        {
            "bytes": expected_identity["bytes"],
            "sha256": expected_identity["sha256"],
        },
        f"{label} byte identity",
    )
    try:
        document = json.loads(raw, parse_constant=_reject_constant)
    except (
        UnicodeDecodeError,
        json.JSONDecodeError,
        RecursionError,
    ) as error:
        raise YaneuraOnlyV1R3ProtocolError(
            f"invalid pinned {label}: {error}"
        ) from error
    if type(document) is not dict:
        raise YaneuraOnlyV1R3ProtocolError(f"{label} root must be an object")
    return document


def normalize_cross_runtime_document(
    value: Mapping[str, Any],
) -> dict[str, Any]:
    try:
        return V1R2.normalize_cross_runtime_document(value)
    except V1R2.YaneuraOnlyV1R2ProtocolError as error:
        raise YaneuraOnlyV1R3ProtocolError(str(error)) from error


def cross_runtime_canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    try:
        return V1R2.cross_runtime_canonical_json_bytes(value)
    except V1R2.YaneuraOnlyV1R2ProtocolError as error:
        raise YaneuraOnlyV1R3ProtocolError(str(error)) from error


def validate_plan_document(document: Mapping[str, Any]) -> dict[str, Any]:
    fields = {
        "authority",
        "change_control",
        "downstream_gates",
        "failed_v1r2",
        "family",
        "live_baseline",
        "output_namespace",
        "predecessor_v1",
        "predecessor_v3r3",
        "reused_selection",
        "schema",
        "selection_roles",
        "source_revision_policy",
        "status",
        "teacher",
        "technical_recovery",
        "tracked_preregistration_parser",
        "training",
    }
    if not isinstance(document, Mapping) or set(document) != fields:
        raise YaneuraOnlyV1R3ProtocolError("plan fields differ")
    fixed = (
        ("authority", EXPECTED_AUTHORITY),
        ("change_control", EXPECTED_CHANGE_CONTROL),
        ("downstream_gates", EXPECTED_GATES),
        ("failed_v1r2", EXPECTED_FAILED_V1R2),
        ("family", FAMILY),
        ("live_baseline", EXPECTED_LIVE_BASELINE),
        ("output_namespace", EXPECTED_OUTPUT_NAMESPACE),
        ("predecessor_v1", EXPECTED_PREDECESSOR_V1),
        ("predecessor_v3r3", EXPECTED_PREDECESSOR_V3R3),
        ("reused_selection", EXPECTED_REUSED_SELECTION),
        ("schema", PLAN_SCHEMA),
        ("selection_roles", EXPECTED_SELECTION_ROLES),
        ("source_revision_policy", EXPECTED_SOURCE_REVISION_POLICY),
        ("status", PLAN_STATUS),
        ("teacher", EXPECTED_TEACHER),
        ("technical_recovery", EXPECTED_TECHNICAL_RECOVERY),
        ("tracked_preregistration_parser", EXPECTED_TRACKED_PARSER),
        ("training", EXPECTED_TRAINING),
    )
    for field, expected in fixed:
        _require_equal(document[field], expected, field)
    if (
        document["failed_v1r2"]["completed_parents"] != 0
        or document["failed_v1r2"]["teacher_rows"] != 0
        or document["failed_v1r2"]["reuse_completed_parents"] != 0
        or document["failed_v1r2"]["reuse_teacher_rows"] != 0
        or document["change_control"]["failed_v1r2_parent_rows_reused"] != 0
        or document["change_control"]["failed_v1r2_teacher_rows_reused"] != 0
        or document["failed_v1r2"]["work_ledger_created"] is not False
    ):
        raise YaneuraOnlyV1R3ProtocolError(
            "failed v1r2 parent and teacher row reuse must remain zero"
        )
    return copy.deepcopy(dict(document))


def validate_tracked_plan_file(path: str | Path) -> dict[str, Any]:
    raw = Path(path).read_bytes()
    document = _parse_exact_identity(
        raw, EXPECTED_TRACKED_PLAN_IDENTITY, label="tracked plan"
    )
    if document.get("schema") != EXPECTED_TRACKED_PLAN_IDENTITY["schema"]:
        raise YaneuraOnlyV1R3ProtocolError("tracked plan schema differs")
    return validate_plan_document(document)


def validate_runtime_source_revision(
    document: Mapping[str, Any],
    *,
    source_revision: str,
    authenticated_main_head: str,
    repository_clean: bool,
    tracked_plan_merged: bool,
) -> str:
    validate_plan_document(document)
    if not REVISION_RE.fullmatch(source_revision):
        raise YaneuraOnlyV1R3ProtocolError(
            "source revision must be 40 lowercase hex"
        )
    if source_revision == FAILED_V1R2_REVISION:
        raise YaneuraOnlyV1R3ProtocolError(
            "failed v1r2 source revision is forbidden"
        )
    if source_revision != authenticated_main_head:
        raise YaneuraOnlyV1R3ProtocolError(
            "source revision must equal authenticated main head"
        )
    if not repository_clean:
        raise YaneuraOnlyV1R3ProtocolError("repository must be clean")
    if not tracked_plan_merged:
        raise YaneuraOnlyV1R3ProtocolError(
            "tracked YaneuraOu-only v1r3 preregistration must be merged"
        )
    return source_revision


def validate_teacher_plan(
    document: Mapping[str, Any],
    *,
    authenticated_selection: Mapping[str, Any],
    expected_source_revision: str,
) -> dict[str, Any]:
    fields = {
        "authority",
        "downstream_gates",
        "engine",
        "outputs",
        "predecessor_v1",
        "predecessor_v1r2",
        "predecessor_v3r3",
        "preregistration",
        "schema",
        "selection_evidence",
        "selection_manifest",
        "selection_roles",
        "source_revision",
        "status",
        "teacher",
        "technical_recovery",
        "training",
    }
    if not isinstance(document, Mapping) or set(document) != fields:
        raise YaneuraOnlyV1R3ProtocolError("teacher plan fields differ")
    _require_equal(document["schema"], TEACHER_PLAN_SCHEMA, "teacher schema")
    _require_equal(document["status"], "sealed-not-executed", "teacher status")
    if (
        not REVISION_RE.fullmatch(expected_source_revision)
        or expected_source_revision == FAILED_V1R2_REVISION
        or document["source_revision"] != expected_source_revision
    ):
        raise YaneuraOnlyV1R3ProtocolError("teacher source revision differs")
    fixed = (
        ("authority", EXPECTED_RUNTIME_AUTHORITY),
        ("downstream_gates", EXPECTED_GATES),
        ("engine", EXPECTED_ENGINE),
        ("outputs", EXPECTED_RUNTIME_OUTPUTS),
        ("predecessor_v1", EXPECTED_PREDECESSOR_V1),
        ("predecessor_v1r2", EXPECTED_FAILED_V1R2),
        ("predecessor_v3r3", EXPECTED_PREDECESSOR_V3R3),
        ("preregistration", EXPECTED_TRACKED_PLAN_IDENTITY),
        ("selection_manifest", EXPECTED_REUSED_SELECTION["manifest"]),
        ("selection_roles", EXPECTED_SELECTION_ROLES),
        ("teacher", EXPECTED_TEACHER),
        ("technical_recovery", EXPECTED_TECHNICAL_RECOVERY),
        ("training", EXPECTED_TRAINING),
    )
    for field, expected in fixed:
        _require_equal(document[field], expected, f"teacher {field}")

    evidence = copy.deepcopy(dict(authenticated_selection))
    expected_evidence_fields = {
        "schema",
        "status",
        "source_revision",
        "selection_jsonl",
        "selection_manifest",
        "phase_name_map",
        "accounting",
        "bindings",
        "verification",
    }
    if set(evidence) != expected_evidence_fields:
        raise YaneuraOnlyV1R3ProtocolError("selection evidence fields differ")
    if (
        evidence.get("schema")
        != "shogi-halfkp81-depth18-authenticated-selection-evidence-v1"
        or evidence.get("status")
        != "authenticated-selection-complete-teacher-plan-eligible"
        or evidence.get("source_revision") != expected_source_revision
    ):
        raise YaneuraOnlyV1R3ProtocolError("selection evidence status differs")
    selected = evidence.get("selection_jsonl")
    manifest = evidence.get("selection_manifest")
    if not isinstance(selected, Mapping) or not isinstance(manifest, Mapping):
        raise YaneuraOnlyV1R3ProtocolError("selection identities are invalid")
    _require_equal(
        {
            key: selected.get(key)
            for key in ("path", "bytes", "sha256", "rows", "schema")
        },
        EXPECTED_REUSED_SELECTION["jsonl"],
        "selected parents",
    )
    _require_equal(
        {
            key: manifest.get(key)
            for key in ("path", "bytes", "sha256", "schema")
        },
        EXPECTED_REUSED_SELECTION["manifest"],
        "selection manifest",
    )
    _require_equal(document["selection_evidence"], evidence, "selection evidence")
    return copy.deepcopy(normalize_cross_runtime_document(document))


__all__ = [
    "EXPECTED_AUTHORITY",
    "EXPECTED_CHANGE_CONTROL",
    "EXPECTED_ENGINE",
    "EXPECTED_FAILED_V1R2",
    "EXPECTED_GATES",
    "EXPECTED_LEDGER_CANDIDATE_GENERATION",
    "EXPECTED_LIVE_BASELINE",
    "EXPECTED_OUTPUT_NAMESPACE",
    "EXPECTED_PREDECESSOR_V1",
    "EXPECTED_PREDECESSOR_V3R3",
    "EXPECTED_REUSED_SELECTION",
    "EXPECTED_RUNTIME_AUTHORITY",
    "EXPECTED_RUNTIME_OUTPUTS",
    "EXPECTED_SELECTION_ROLES",
    "EXPECTED_SOURCE_REVISION_POLICY",
    "EXPECTED_TEACHER",
    "EXPECTED_TECHNICAL_RECOVERY",
    "EXPECTED_TRACKED_PARSER",
    "EXPECTED_TRACKED_PLAN_IDENTITY",
    "EXPECTED_TRAINING",
    "FAILED_V1R2_REVISION",
    "FAMILY",
    "PLAN_SCHEMA",
    "PLAN_STATUS",
    "TEACHER_PLAN_SCHEMA",
    "TEACHER_WORK_SCHEMA",
    "YaneuraOnlyV1R3ProtocolError",
    "cross_runtime_canonical_json_bytes",
    "normalize_cross_runtime_document",
    "validate_plan_document",
    "validate_runtime_source_revision",
    "validate_teacher_plan",
    "validate_tracked_plan_file",
]
