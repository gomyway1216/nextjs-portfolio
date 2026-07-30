#!/usr/bin/env python3
"""Fail-closed protocol for the confirmed fd3 bounded-stable v3r3 recovery."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Mapping

import halfkp81_depth18_bounded_stable_v3_protocol as V3
import halfkp81_depth18_bounded_stable_v3r2_protocol as V3R2


PLAN_SCHEMA = "shogi-halfkp81-hard-depth18-bounded-stable-recovery-plan-v3r3"
TEACHER_PLAN_SCHEMA = (
    "shogi-halfkp81-hard-depth18-bounded-stable-teacher-plan-v3r3"
)
DIAGNOSTIC_SCHEMA = (
    "shogi-halfkp81-depth18-bounded-stable-fd3-diagnostic-receipt-v3r3"
)
FAMILY = "halfkp81-hard-depth18-bounded-stable-v3r3"
PLAN_STATUS = "prospective-confirmed-fd3-technical-recovery-not-executed"
FAILED_V3R2_REVISION = "f0ae74c208d3934849864c05cc68219f1834ef83"
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")

EXPECTED_TRACKED_PLAN_IDENTITY = {
    "path": "ml/halfkp81-hard-depth18-bounded-stable-v3r3-plan.json",
    "bytes": 7_815,
    "sha256": "5e4e8157d5848fbeca9ecf959d68ed6eca51b0017eb8296ea8ea0ef5bdc24ac7",
    "schema": PLAN_SCHEMA,
}
EXPECTED_DIAGNOSTIC_RECEIPT_IDENTITY = {
    "path": "ml/halfkp81-depth18-bounded-stable-v3r3-diagnostic-receipt.json",
    "bytes": 2_299,
    "sha256": "a6b6f5ed9b3305a51a66dda69bf1887313c9f87bcbc0a86d3ca2826fba23f51d",
    "schema": DIAGNOSTIC_SCHEMA,
}

EXPECTED_AUTHORITY = copy.deepcopy(V3.EXPECTED_AUTHORITY)
EXPECTED_RUNTIME_AUTHORITY = copy.deepcopy(V3.EXPECTED_RUNTIME_AUTHORITY)
EXPECTED_ENGINE = copy.deepcopy(V3.EXPECTED_ENGINE)
EXPECTED_GATES = copy.deepcopy(V3.EXPECTED_GATES)
EXPECTED_LIVE_BASELINE = copy.deepcopy(V3.EXPECTED_LIVE_BASELINE)
EXPECTED_PREDECESSOR_V2 = copy.deepcopy(V3.EXPECTED_PREDECESSOR_V2)
EXPECTED_PREDECESSOR_V3 = copy.deepcopy(V3R2.EXPECTED_FAILED_V3)
EXPECTED_REUSED_SELECTION = copy.deepcopy(V3.EXPECTED_REUSED_SELECTION)
EXPECTED_SELECTION_ROLES = copy.deepcopy(V3.EXPECTED_SELECTION_ROLES)
EXPECTED_TEACHER = copy.deepcopy(V3.EXPECTED_TEACHER)
EXPECTED_TRAINING = copy.deepcopy(V3.EXPECTED_TRAINING)
EXPECTED_V3_STRENGTH_CONTRACT = copy.deepcopy(
    V3R2.EXPECTED_V3_STRENGTH_CONTRACT
)

_V3R2_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-hard-depth18-bounded-stable-v3r2"
)
_V3R2_LAUNCH_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/launch-agents/"
    "halfkp81-depth18-bounded-stable-v3r2-f0ae74c2"
)
_V3R2_SERVICE_LABEL = (
    "com.meetyudai.shogi.halfkp81-depth18-bounded-v3r2-f0ae74c2"
)
_V3R2_FINGERPRINT = (
    "9d62c01f51dc4ae5a8fb24fb7193c50e93f33c4cefecad164b06dc63c8a3706e"
)
_V3R2_FAULT_MESSAGE = (
    "teacher labeling failed for parent "
    "sha256:811a0ccd95e02dc2dc84676669d04f7a326b556aa24fe74e65d14c8f84c91579: "
    "Floodgate production teacher asset authority failed: "
    "bounded stable worker startup timeout"
)
EXPECTED_FAILED_V3R2 = {
    "completed_parents": 94,
    "family": V3R2.FAMILY,
    "formal_namespace": {
        "directory": _V3R2_DIRECTORY,
        "exact_entries": [
            "teacher-plan.json",
            "teacher-terminal-fault.json",
            "teacher-work.jsonl",
        ],
    },
    "launch": {
        "plist": {
            "bytes": 1_500,
            "path": (
                f"{_V3R2_LAUNCH_DIRECTORY}/{_V3R2_SERVICE_LABEL}."
                "launch-agent.plist"
            ),
            "sha256": (
                "458a1e87a53dbc03919970bf157816cc15a5b08716b3955ab299ed8daf572cea"
            ),
        },
        "process_present": False,
        "service_label": _V3R2_SERVICE_LABEL,
        "service_present": False,
        "stderr": {
            "bytes": 244,
            "path": f"{_V3R2_LAUNCH_DIRECTORY}/{_V3R2_SERVICE_LABEL}.stderr.log",
            "sha256": (
                "bef63d5eb525f1dd0dd6a49b78cc33e852f6c142cc606af2058c343485fa27dc"
            ),
        },
        "stdout": {
            "bytes": 0,
            "path": f"{_V3R2_LAUNCH_DIRECTORY}/{_V3R2_SERVICE_LABEL}.stdout.log",
            "sha256": (
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            ),
        },
    },
    "run_fingerprint": _V3R2_FINGERPRINT,
    "same_family_resume_authorized": False,
    "source_revision": FAILED_V3R2_REVISION,
    "status": "terminal-fault-family-stopped",
    "teacher_plan": {
        "bytes": 10_827,
        "path": f"{_V3R2_DIRECTORY}/teacher-plan.json",
        "schema": V3R2.TEACHER_PLAN_SCHEMA,
        "sha256": (
            "53e3aaabf2d08b9c440478e94dc1ccbdca58334618523dfcccf5d80ed3a072a9"
        ),
    },
    "terminal_fault": {
        "bytes": 884,
        "completed_parents": 94,
        "incomplete_parents": 8_098,
        "message": _V3R2_FAULT_MESSAGE,
        "path": f"{_V3R2_DIRECTORY}/teacher-terminal-fault.json",
        "run_fingerprint": _V3R2_FINGERPRINT,
        "schema": "shogi-halfkp81-hard-depth18-teacher-terminal-fault-v1",
        "sha256": (
            "10cfd2bc38fab128c3c7eff54bd9a5c005d96bb097ae24f6e322d4521bd4c1e6"
        ),
        "status": "terminal-fault-family-stopped",
        "technical_faults": 1,
    },
    "tracked_recovery_plan": {
        "bytes": 5_378,
        "path": "ml/halfkp81-hard-depth18-bounded-stable-v3r2-plan.json",
        "schema": V3R2.PLAN_SCHEMA,
        "sha256": (
            "a543e03804b9215abab25eb34f3937f5cc1fa212fc12af80b7a25e923665a7e5"
        ),
    },
    "work_ledger": {
        "bytes": 1_463_884,
        "header_records": 1,
        "parent_records": 94,
        "path": f"{_V3R2_DIRECTORY}/teacher-work.jsonl",
        "records": 95,
        "run_fingerprint": _V3R2_FINGERPRINT,
        "schema": "shogi-halfkp81-hard-depth18-teacher-work-v1",
        "sha256": (
            "f182810f3629c6c57e81db759aca995eda4e4aa76787cd646a96295931856200"
        ),
        "teacher_rows": 1_125,
    },
}

EXPECTED_FD3_RECOVERY_CONTRACT = {
    "end_callback_must_complete_before_stdin_init_write": True,
    "source_transfer_and_init_share_one_deadline": True,
    "startup_total_budget_milliseconds": 120_000,
    "timeout_extension_milliseconds": 0,
}
EXPECTED_CHANGE_CONTROL = {
    "allowed_changes": [
        "await-fd3-source-transfer-end-callback-before-init-within-existing-startup-deadline",
        "bind-confirmed-diagnostic-stage-receipt",
        "new-clean-merged-main-source-revision",
        "new-run-fingerprint",
        "new-create-only-output-namespace",
    ],
    "failed_v3r2_parent_rows_reused": 0,
    "failed_v3r2_teacher_rows_reused": 0,
    "fd3_recovery_contract": EXPECTED_FD3_RECOVERY_CONTRACT,
    "strength_contract": EXPECTED_V3_STRENGTH_CONTRACT,
    "strength_contract_must_equal_v3": True,
    "v2_parent_rows_reused": 0,
    "v2_teacher_rows_reused": 0,
    "v3_parent_rows_reused": 0,
    "v3_teacher_rows_reused": 0,
}

_OUTPUT_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-hard-depth18-bounded-stable-v3r3"
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
    "forbidden_failed_v3r2_revision": FAILED_V3R2_REVISION,
    "must_bind_new_clean_merged_main_revision": True,
    "runtime_plan_source_revision_must_equal_authenticated_main_head": True,
    "tracked_plan_must_be_merged_before_runtime_plan": True,
    "uncommitted_changes_maximum": 0,
}
EXPECTED_TRACKED_PARSER = copy.deepcopy(V3R2.EXPECTED_TRACKED_PARSER)


class BoundedStableV3R3ProtocolError(ValueError):
    """Raised when the confirmed fd3 v3r3 recovery contract differs."""


def _require_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise BoundedStableV3R3ProtocolError(
            f"{label} does not match v3r3 preregistration"
        )


def _reject_constant(constant: str) -> Any:
    raise BoundedStableV3R3ProtocolError(
        f"pinned v3r3 JSON contains {constant}"
    )


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
        raise BoundedStableV3R3ProtocolError(
            f"invalid pinned {label}: {error}"
        ) from error
    if type(document) is not dict:
        raise BoundedStableV3R3ProtocolError(f"{label} root must be an object")
    return document


def canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
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


def validate_diagnostic_document(
    document: Mapping[str, Any],
) -> dict[str, Any]:
    fields = {
        "diagnosis",
        "excluded_causes",
        "failed_v3r2_binding",
        "load_reproduction",
        "permitted_recovery",
        "prohibited_changes",
        "schema",
        "status",
    }
    if not isinstance(document, Mapping) or set(document) != fields:
        raise BoundedStableV3R3ProtocolError(
            "diagnostic receipt fields differ"
        )
    _require_equal(document["schema"], DIAGNOSTIC_SCHEMA, "diagnostic schema")
    _require_equal(
        document["status"],
        "confirmed-technical-root-cause-recovery-eligible",
        "diagnostic status",
    )
    diagnosis = document["diagnosis"]
    if (
        diagnosis.get("status") != "root-cause-confirmed"
        or diagnosis.get("confirmed_root_cause")
        != "fd3-source-transfer-eof-was-not-confirmed-before-worker-init"
        or diagnosis.get("stalled_child_count") != 1
        or diagnosis.get("stalled_child_location")
        != "WORKER_BOOTSTRAP-readFileSync(3)-awaiting-EOF"
    ):
        raise BoundedStableV3R3ProtocolError("fd3 root cause differs")
    _require_equal(
        document["excluded_causes"],
        {
            "file_descriptor_leak": False,
            "parent_position_specific_failure": False,
            "wasm_identity_or_content_failure": False,
            "weights_identity_or_content_failure": False,
        },
        "excluded causes",
    )
    binding = document["failed_v3r2_binding"]
    if (
        binding.get("completed_parents") != 94
        or binding.get("teacher_rows") != 1_125
        or binding.get("run_fingerprint") != _V3R2_FINGERPRINT
        or binding.get("terminal_message") != _V3R2_FAULT_MESSAGE
    ):
        raise BoundedStableV3R3ProtocolError(
            "diagnostic failed-v3r2 binding differs"
        )
    reproduction = document["load_reproduction"]
    if (
        reproduction.get("high_cpu_load") is not True
        or reproduction.get("yaneuraou_hash_total_gib") != 6.5
        or reproduction.get("concurrent_replacement_wave") != 12
        or reproduction.get("result")
        != "reproduced-one-fd3-eof-waiting-child"
    ):
        raise BoundedStableV3R3ProtocolError("load reproduction differs")
    _require_equal(
        document["permitted_recovery"],
        {
            "fd3_end_callback_must_complete_before_init": True,
            "fd3_source_transfer_and_init_share_existing_startup_deadline": True,
            "new_create_only_namespace": True,
            "new_run_fingerprint": True,
            "new_source_revision": True,
            "startup_total_budget_milliseconds": 120_000,
        },
        "permitted recovery",
    )
    _require_equal(
        document["prohibited_changes"],
        {
            "change_candidate_policy": False,
            "change_strength_gate": False,
            "extend_startup_timeout": False,
            "reuse_v3r2_parent_or_teacher_rows": False,
        },
        "prohibited changes",
    )
    return copy.deepcopy(dict(document))


def validate_diagnostic_receipt_file(path: str | Path) -> dict[str, Any]:
    raw = Path(path).read_bytes()
    document = _parse_exact_identity(
        raw, EXPECTED_DIAGNOSTIC_RECEIPT_IDENTITY, label="diagnostic receipt"
    )
    if document.get("schema") != EXPECTED_DIAGNOSTIC_RECEIPT_IDENTITY["schema"]:
        raise BoundedStableV3R3ProtocolError("diagnostic schema identity differs")
    return validate_diagnostic_document(document)


def validate_plan_document(document: Mapping[str, Any]) -> dict[str, Any]:
    fields = {
        "authority",
        "change_control",
        "diagnostic_receipt",
        "failed_v3r2",
        "family",
        "live_baseline",
        "output_namespace",
        "schema",
        "source_revision_policy",
        "status",
        "tracked_preregistration_parser",
    }
    if not isinstance(document, Mapping) or set(document) != fields:
        raise BoundedStableV3R3ProtocolError("plan fields differ")
    fixed = (
        ("authority", EXPECTED_AUTHORITY),
        ("change_control", EXPECTED_CHANGE_CONTROL),
        ("diagnostic_receipt", EXPECTED_DIAGNOSTIC_RECEIPT_IDENTITY),
        ("failed_v3r2", EXPECTED_FAILED_V3R2),
        ("family", FAMILY),
        ("live_baseline", EXPECTED_LIVE_BASELINE),
        ("output_namespace", EXPECTED_OUTPUT_NAMESPACE),
        ("schema", PLAN_SCHEMA),
        ("source_revision_policy", EXPECTED_SOURCE_REVISION_POLICY),
        ("status", PLAN_STATUS),
        ("tracked_preregistration_parser", EXPECTED_TRACKED_PARSER),
    )
    for field, expected in fixed:
        _require_equal(document[field], expected, field)
    if any(
        document["change_control"][field] != 0
        for field in (
            "failed_v3r2_parent_rows_reused",
            "failed_v3r2_teacher_rows_reused",
            "v2_parent_rows_reused",
            "v2_teacher_rows_reused",
            "v3_parent_rows_reused",
            "v3_teacher_rows_reused",
        )
    ):
        raise BoundedStableV3R3ProtocolError(
            "all predecessor parent and teacher row reuse must remain zero"
        )
    recovery = document["change_control"]["fd3_recovery_contract"]
    if recovery["timeout_extension_milliseconds"] != 0:
        raise BoundedStableV3R3ProtocolError("startup timeout extension forbidden")
    if recovery["startup_total_budget_milliseconds"] != 120_000:
        raise BoundedStableV3R3ProtocolError("startup total budget changed")
    return copy.deepcopy(dict(document))


def validate_tracked_plan_file(path: str | Path) -> dict[str, Any]:
    raw = Path(path).read_bytes()
    document = _parse_exact_identity(
        raw, EXPECTED_TRACKED_PLAN_IDENTITY, label="tracked plan"
    )
    if document.get("schema") != EXPECTED_TRACKED_PLAN_IDENTITY["schema"]:
        raise BoundedStableV3R3ProtocolError("tracked plan schema differs")
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
        raise BoundedStableV3R3ProtocolError(
            "source revision must be 40 lowercase hex"
        )
    if source_revision == FAILED_V3R2_REVISION:
        raise BoundedStableV3R3ProtocolError(
            "failed v3r2 source revision is forbidden"
        )
    if source_revision != authenticated_main_head:
        raise BoundedStableV3R3ProtocolError(
            "source revision must equal authenticated main head"
        )
    if not repository_clean:
        raise BoundedStableV3R3ProtocolError("repository must be clean")
    if not tracked_plan_merged:
        raise BoundedStableV3R3ProtocolError(
            "tracked v3r3 preregistration must be merged"
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
        "diagnostic_receipt",
        "engine",
        "outputs",
        "predecessor_v2",
        "predecessor_v3",
        "predecessor_v3r2",
        "preregistration",
        "schema",
        "selection_evidence",
        "selection_manifest",
        "selection_roles",
        "source_revision",
        "status",
        "teacher",
    }
    if not isinstance(document, Mapping) or set(document) != fields:
        raise BoundedStableV3R3ProtocolError("teacher plan fields differ")
    _require_equal(document["schema"], TEACHER_PLAN_SCHEMA, "teacher schema")
    _require_equal(document["status"], "sealed-not-executed", "teacher status")
    if (
        not REVISION_RE.fullmatch(expected_source_revision)
        or expected_source_revision == FAILED_V3R2_REVISION
        or document["source_revision"] != expected_source_revision
    ):
        raise BoundedStableV3R3ProtocolError(
            "teacher source revision differs"
        )
    fixed = (
        ("authority", EXPECTED_RUNTIME_AUTHORITY),
        ("diagnostic_receipt", EXPECTED_DIAGNOSTIC_RECEIPT_IDENTITY),
        ("engine", EXPECTED_ENGINE),
        ("outputs", EXPECTED_RUNTIME_OUTPUTS),
        ("predecessor_v2", EXPECTED_PREDECESSOR_V2),
        ("predecessor_v3", EXPECTED_PREDECESSOR_V3),
        ("predecessor_v3r2", EXPECTED_FAILED_V3R2),
        ("preregistration", EXPECTED_TRACKED_PLAN_IDENTITY),
        ("selection_manifest", EXPECTED_REUSED_SELECTION["manifest"]),
        ("selection_roles", EXPECTED_SELECTION_ROLES),
        ("teacher", EXPECTED_TEACHER),
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
        raise BoundedStableV3R3ProtocolError("selection evidence fields differ")
    if (
        evidence.get("schema")
        != "shogi-halfkp81-depth18-authenticated-selection-evidence-v1"
        or evidence.get("status")
        != "authenticated-selection-complete-teacher-plan-eligible"
        or evidence.get("source_revision") != expected_source_revision
    ):
        raise BoundedStableV3R3ProtocolError("selection evidence status differs")
    selected = evidence.get("selection_jsonl")
    manifest = evidence.get("selection_manifest")
    if not isinstance(selected, Mapping) or not isinstance(manifest, Mapping):
        raise BoundedStableV3R3ProtocolError("selection identities are invalid")
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
    return copy.deepcopy(dict(document))


__all__ = [
    "BoundedStableV3R3ProtocolError",
    "DIAGNOSTIC_SCHEMA",
    "EXPECTED_AUTHORITY",
    "EXPECTED_CHANGE_CONTROL",
    "EXPECTED_DIAGNOSTIC_RECEIPT_IDENTITY",
    "EXPECTED_ENGINE",
    "EXPECTED_FAILED_V3R2",
    "EXPECTED_FD3_RECOVERY_CONTRACT",
    "EXPECTED_GATES",
    "EXPECTED_LIVE_BASELINE",
    "EXPECTED_OUTPUT_NAMESPACE",
    "EXPECTED_PREDECESSOR_V2",
    "EXPECTED_PREDECESSOR_V3",
    "EXPECTED_REUSED_SELECTION",
    "EXPECTED_RUNTIME_AUTHORITY",
    "EXPECTED_RUNTIME_OUTPUTS",
    "EXPECTED_SELECTION_ROLES",
    "EXPECTED_SOURCE_REVISION_POLICY",
    "EXPECTED_TEACHER",
    "EXPECTED_TRACKED_PARSER",
    "EXPECTED_TRACKED_PLAN_IDENTITY",
    "EXPECTED_TRAINING",
    "EXPECTED_V3_STRENGTH_CONTRACT",
    "FAILED_V3R2_REVISION",
    "FAMILY",
    "PLAN_SCHEMA",
    "PLAN_STATUS",
    "TEACHER_PLAN_SCHEMA",
    "canonical_json_bytes",
    "validate_diagnostic_document",
    "validate_diagnostic_receipt_file",
    "validate_plan_document",
    "validate_runtime_source_revision",
    "validate_teacher_plan",
    "validate_tracked_plan_file",
]
