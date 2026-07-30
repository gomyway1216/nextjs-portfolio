#!/usr/bin/env python3
"""Fail-closed protocol for the independent YaneuraOu-only depth18 family."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Mapping

import halfkp81_depth18_bounded_stable_v3r3_protocol as V3R3


PLAN_SCHEMA = "shogi-halfkp81-hard-depth18-yaneura-only-plan-v1"
TEACHER_PLAN_SCHEMA = (
    "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1"
)
TEACHER_WORK_SCHEMA = (
    "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1"
)
FAMILY = "halfkp81-hard-depth18-yaneura-only-v1"
PLAN_STATUS = "prospective-independent-strength-family-not-executed"
FAILED_V3R3_REVISION = "ae0ab195b2c552df6e3364f6278fb1217f067baa"
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")

EXPECTED_TRACKED_PLAN_IDENTITY = {
    "path": "ml/halfkp81-hard-depth18-yaneura-only-v1-plan.json",
    "bytes": 11_049,
    "sha256": "b140ee6ec268708e596da6607742f784eaf16b5e9383f9722a36fd1c166a5472",
    "schema": PLAN_SCHEMA,
}

EXPECTED_AUTHORITY = copy.deepcopy(V3R3.EXPECTED_AUTHORITY)
EXPECTED_RUNTIME_AUTHORITY = copy.deepcopy(V3R3.EXPECTED_RUNTIME_AUTHORITY)
EXPECTED_ENGINE = copy.deepcopy(V3R3.EXPECTED_ENGINE)
EXPECTED_GATES = copy.deepcopy(V3R3.EXPECTED_GATES)
EXPECTED_LIVE_BASELINE = copy.deepcopy(V3R3.EXPECTED_LIVE_BASELINE)
EXPECTED_REUSED_SELECTION = copy.deepcopy(V3R3.EXPECTED_REUSED_SELECTION)
EXPECTED_SELECTION_ROLES = copy.deepcopy(V3R3.EXPECTED_SELECTION_ROLES)
EXPECTED_TRAINING = copy.deepcopy(V3R3.EXPECTED_TRAINING)
EXPECTED_TRACKED_PARSER = copy.deepcopy(V3R3.EXPECTED_TRACKED_PARSER)

_V3R3_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-hard-depth18-bounded-stable-v3r3"
)
_V3R3_LAUNCH_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/launch-agents/"
    "halfkp81-depth18-bounded-stable-v3r3-ae0ab195"
)
_V3R3_SERVICE_LABEL = (
    "com.meetyudai.shogi.halfkp81-depth18-bounded-v3r3-ae0ab195"
)
_V3R3_FINGERPRINT = (
    "21a821b962669063b0f15236afd7a80f957839cc247668b368ae320de123ff5b"
)
_V3R3_FAULT_MESSAGE = (
    "teacher labeling failed for parent "
    "sha256:5ed636cc10e9712de90ff4a9d8401edb757687ffb5eab6b21b4c02fd79258639: "
    "Floodgate production teacher asset authority failed: "
    "bounded stable worker startup timeout"
)
EXPECTED_FAILED_V3R3 = {
    "completed_parents": 162,
    "family": V3R3.FAMILY,
    "formal_namespace": {
        "directory": _V3R3_DIRECTORY,
        "exact_entries": [
            "teacher-milestone-100.json",
            "teacher-plan.json",
            "teacher-terminal-fault.json",
            "teacher-work.jsonl",
        ],
    },
    "launch": {
        "plist": {
            "bytes": 1_500,
            "path": (
                f"{_V3R3_LAUNCH_DIRECTORY}/{_V3R3_SERVICE_LABEL}."
                "launch-agent.plist"
            ),
            "sha256": (
                "bc4b8122c80341f7f154fe735329a96a10ad9ca4217885312c31c751298a99f0"
            ),
        },
        "process_present": False,
        "service_label": _V3R3_SERVICE_LABEL,
        "service_present": False,
        "stderr": {
            "bytes": 324,
            "path": f"{_V3R3_LAUNCH_DIRECTORY}/{_V3R3_SERVICE_LABEL}.stderr.log",
            "sha256": (
                "9ae7a72282bb8b8d32d4d50588bb63d34ef91688343dfd9f1337f73e8fe0b5aa"
            ),
        },
        "stdout": {
            "bytes": 0,
            "path": f"{_V3R3_LAUNCH_DIRECTORY}/{_V3R3_SERVICE_LABEL}.stdout.log",
            "sha256": (
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            ),
        },
    },
    "milestone_100": {
        "bytes": 545,
        "completed_rows": 1_198,
        "path": f"{_V3R3_DIRECTORY}/teacher-milestone-100.json",
        "run_fingerprint": _V3R3_FINGERPRINT,
        "schema": "shogi-halfkp81-hard-depth18-teacher-milestone-v1",
        "sha256": (
            "045392502cc9f5718913231a3e6960b930ea3e54b948711ff34ccbf60df9dfeb"
        ),
        "status": "durable-prefix-complete-not-training-authority",
        "target_parents": 100,
        "technical_faults": 0,
    },
    "reuse_completed_parents": 0,
    "reuse_teacher_rows": 0,
    "run_fingerprint": _V3R3_FINGERPRINT,
    "same_family_resume_authorized": False,
    "source_revision": FAILED_V3R3_REVISION,
    "status": "terminal-fault-family-stopped",
    "teacher_plan": {
        "bytes": 14_247,
        "path": f"{_V3R3_DIRECTORY}/teacher-plan.json",
        "schema": V3R3.TEACHER_PLAN_SCHEMA,
        "sha256": (
            "7d35f689043a0376618f892d57edcbc1ba017532799177f86176ee7a1f1476d2"
        ),
    },
    "terminal_fault": {
        "bytes": 885,
        "completed_parents": 162,
        "incomplete_parents": 8_030,
        "message": _V3R3_FAULT_MESSAGE,
        "path": f"{_V3R3_DIRECTORY}/teacher-terminal-fault.json",
        "run_fingerprint": _V3R3_FINGERPRINT,
        "schema": "shogi-halfkp81-hard-depth18-teacher-terminal-fault-v1",
        "sha256": (
            "9c092b3f4ee324489a2d6408ffb21032b5f3057ee29c5e01aeebb2cb624fae01"
        ),
        "status": "terminal-fault-family-stopped",
        "technical_faults": 1,
    },
    "tracked_preregistration": copy.deepcopy(
        V3R3.EXPECTED_TRACKED_PLAN_IDENTITY
    ),
    "work_ledger": {
        "bytes": 2_527_193,
        "header_records": 1,
        "parent_records": 162,
        "path": f"{_V3R3_DIRECTORY}/teacher-work.jsonl",
        "records": 163,
        "run_fingerprint": _V3R3_FINGERPRINT,
        "schema": "shogi-halfkp81-hard-depth18-teacher-work-v1",
        "sha256": (
            "9e8980bf02b409197d0f4de5281f53c50ab51be9750659404605b4d737c63c89"
        ),
        "teacher_rows": 1_948,
    },
}

EXPECTED_LEDGER_CANDIDATE_GENERATION = {
    "deduplication": "USI-move-exact-before-depth18-rescore",
    "maximum_rows_per_parent": 13,
    "mode": "yaneuraou-depth16-multipv12-plus-recorded-only",
    "proposal_depth": 16,
    "proposal_multipv": 12,
    "recorded_move_required": True,
    "rescore_depth": 18,
    "stable_wasm": "not-instantiated-or-called",
}
EXPECTED_TEACHER = {
    "candidate_policy": {
        "deduplication": "USI-move-exact-before-depth18-rescore",
        "recorded_move": {"required": True},
        "stable_wasm": {
            "allowed": False,
            "calls_per_parent": 0,
            "candidate_rows": 0,
            "worker_processes": 0,
        },
        "yaneuraou_depth16_multipv": {
            "depth": 16,
            "multipv": 12,
            "required": True,
        },
    },
    "engine": "YaneuraOu NNUE 9.60git 64APPLEM1",
    "hash_mib_per_process": 512,
    "ledger_candidate_generation": EXPECTED_LEDGER_CANDIDATE_GENERATION,
    "maximum_rows": 106_496,
    "maximum_rows_per_parent": 13,
    "minimum_rows_per_parent": 2,
    "processes": 13,
    "rescore_policy": {
        "all_deduplicated_candidates_independently_rescored": True,
        "depth": 18,
        "old_depth6_or_depth12_cp_target_rows": 0,
    },
    "threads_per_process": 1,
    "timeout_seconds_per_parent": 600,
}

EXPECTED_CHANGE_CONTROL = {
    "allowed_changes": [
        "remove-optional-stable-wasm-candidate-source",
        "maximum-rows-per-parent-from-14-to-13",
        "new-independent-strength-family",
        "new-clean-merged-main-source-revision",
        "new-run-fingerprint",
        "new-create-only-output-namespace",
    ],
    "downstream_gates_must_equal_v3r3": True,
    "failed_v3r3_parent_rows_reused": 0,
    "failed_v3r3_teacher_rows_reused": 0,
    "fixed_epochs": 3,
    "fixed_seeds": 1,
    "independent_family": True,
    "stable_timeout_extension_milliseconds": 0,
    "training_contract_must_equal_v3r3": True,
}

_OUTPUT_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-hard-depth18-yaneura-only-v1"
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
    "forbidden_failed_v3r3_revision": FAILED_V3R3_REVISION,
    "must_bind_new_clean_merged_main_revision": True,
    "new_run_fingerprint_must_differ_from_v3r3": True,
    "runtime_plan_source_revision_must_equal_authenticated_main_head": True,
    "tracked_plan_must_be_merged_before_runtime_plan": True,
    "uncommitted_changes_maximum": 0,
}


class YaneuraOnlyV1ProtocolError(ValueError):
    """Raised when the YaneuraOu-only v1 contract differs."""


def _require_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise YaneuraOnlyV1ProtocolError(
            f"{label} does not match YaneuraOu-only v1 preregistration"
        )


def _reject_constant(constant: str) -> Any:
    raise YaneuraOnlyV1ProtocolError(f"pinned JSON contains {constant}")


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
        raise YaneuraOnlyV1ProtocolError(
            f"invalid pinned {label}: {error}"
        ) from error
    if type(document) is not dict:
        raise YaneuraOnlyV1ProtocolError(f"{label} root must be an object")
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


def validate_plan_document(document: Mapping[str, Any]) -> dict[str, Any]:
    fields = {
        "authority",
        "change_control",
        "downstream_gates",
        "failed_v3r3",
        "family",
        "live_baseline",
        "output_namespace",
        "reused_selection",
        "schema",
        "selection_roles",
        "source_revision_policy",
        "status",
        "teacher",
        "tracked_preregistration_parser",
        "training",
    }
    if not isinstance(document, Mapping) or set(document) != fields:
        raise YaneuraOnlyV1ProtocolError("plan fields differ")
    fixed = (
        ("authority", EXPECTED_AUTHORITY),
        ("change_control", EXPECTED_CHANGE_CONTROL),
        ("downstream_gates", EXPECTED_GATES),
        ("failed_v3r3", EXPECTED_FAILED_V3R3),
        ("family", FAMILY),
        ("live_baseline", EXPECTED_LIVE_BASELINE),
        ("output_namespace", EXPECTED_OUTPUT_NAMESPACE),
        ("reused_selection", EXPECTED_REUSED_SELECTION),
        ("schema", PLAN_SCHEMA),
        ("selection_roles", EXPECTED_SELECTION_ROLES),
        ("source_revision_policy", EXPECTED_SOURCE_REVISION_POLICY),
        ("status", PLAN_STATUS),
        ("teacher", EXPECTED_TEACHER),
        ("tracked_preregistration_parser", EXPECTED_TRACKED_PARSER),
        ("training", EXPECTED_TRAINING),
    )
    for field, expected in fixed:
        _require_equal(document[field], expected, field)
    if (
        document["change_control"]["failed_v3r3_parent_rows_reused"] != 0
        or document["change_control"]["failed_v3r3_teacher_rows_reused"] != 0
        or document["failed_v3r3"]["reuse_completed_parents"] != 0
        or document["failed_v3r3"]["reuse_teacher_rows"] != 0
    ):
        raise YaneuraOnlyV1ProtocolError("v3r3 row reuse must remain zero")
    stable = document["teacher"]["candidate_policy"]["stable_wasm"]
    if stable != {
        "allowed": False,
        "calls_per_parent": 0,
        "candidate_rows": 0,
        "worker_processes": 0,
    }:
        raise YaneuraOnlyV1ProtocolError("stable WASM must remain disabled")
    if document["teacher"]["maximum_rows_per_parent"] != 13:
        raise YaneuraOnlyV1ProtocolError("maximum rows per parent must be 13")
    return copy.deepcopy(dict(document))


def validate_tracked_plan_file(path: str | Path) -> dict[str, Any]:
    raw = Path(path).read_bytes()
    document = _parse_exact_identity(
        raw, EXPECTED_TRACKED_PLAN_IDENTITY, label="tracked plan"
    )
    if document.get("schema") != EXPECTED_TRACKED_PLAN_IDENTITY["schema"]:
        raise YaneuraOnlyV1ProtocolError("tracked plan schema differs")
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
        raise YaneuraOnlyV1ProtocolError(
            "source revision must be 40 lowercase hex"
        )
    if source_revision == FAILED_V3R3_REVISION:
        raise YaneuraOnlyV1ProtocolError(
            "failed v3r3 source revision is forbidden"
        )
    if source_revision != authenticated_main_head:
        raise YaneuraOnlyV1ProtocolError(
            "source revision must equal authenticated main head"
        )
    if not repository_clean:
        raise YaneuraOnlyV1ProtocolError("repository must be clean")
    if not tracked_plan_merged:
        raise YaneuraOnlyV1ProtocolError(
            "tracked YaneuraOu-only v1 preregistration must be merged"
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
        "predecessor_v3r3",
        "preregistration",
        "schema",
        "selection_evidence",
        "selection_manifest",
        "selection_roles",
        "source_revision",
        "status",
        "teacher",
        "training",
    }
    if not isinstance(document, Mapping) or set(document) != fields:
        raise YaneuraOnlyV1ProtocolError("teacher plan fields differ")
    _require_equal(document["schema"], TEACHER_PLAN_SCHEMA, "teacher schema")
    _require_equal(document["status"], "sealed-not-executed", "teacher status")
    if (
        not REVISION_RE.fullmatch(expected_source_revision)
        or expected_source_revision == FAILED_V3R3_REVISION
        or document["source_revision"] != expected_source_revision
    ):
        raise YaneuraOnlyV1ProtocolError("teacher source revision differs")
    fixed = (
        ("authority", EXPECTED_RUNTIME_AUTHORITY),
        ("downstream_gates", EXPECTED_GATES),
        ("engine", EXPECTED_ENGINE),
        ("outputs", EXPECTED_RUNTIME_OUTPUTS),
        ("predecessor_v3r3", EXPECTED_FAILED_V3R3),
        ("preregistration", EXPECTED_TRACKED_PLAN_IDENTITY),
        ("selection_manifest", EXPECTED_REUSED_SELECTION["manifest"]),
        ("selection_roles", EXPECTED_SELECTION_ROLES),
        ("teacher", EXPECTED_TEACHER),
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
        raise YaneuraOnlyV1ProtocolError("selection evidence fields differ")
    if (
        evidence.get("schema")
        != "shogi-halfkp81-depth18-authenticated-selection-evidence-v1"
        or evidence.get("status")
        != "authenticated-selection-complete-teacher-plan-eligible"
        or evidence.get("source_revision") != expected_source_revision
    ):
        raise YaneuraOnlyV1ProtocolError("selection evidence status differs")
    selected = evidence.get("selection_jsonl")
    manifest = evidence.get("selection_manifest")
    if not isinstance(selected, Mapping) or not isinstance(manifest, Mapping):
        raise YaneuraOnlyV1ProtocolError("selection identities are invalid")
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
    "EXPECTED_AUTHORITY",
    "EXPECTED_CHANGE_CONTROL",
    "EXPECTED_ENGINE",
    "EXPECTED_FAILED_V3R3",
    "EXPECTED_GATES",
    "EXPECTED_LEDGER_CANDIDATE_GENERATION",
    "EXPECTED_LIVE_BASELINE",
    "EXPECTED_OUTPUT_NAMESPACE",
    "EXPECTED_REUSED_SELECTION",
    "EXPECTED_RUNTIME_AUTHORITY",
    "EXPECTED_RUNTIME_OUTPUTS",
    "EXPECTED_SELECTION_ROLES",
    "EXPECTED_SOURCE_REVISION_POLICY",
    "EXPECTED_TEACHER",
    "EXPECTED_TRACKED_PARSER",
    "EXPECTED_TRACKED_PLAN_IDENTITY",
    "EXPECTED_TRAINING",
    "FAILED_V3R3_REVISION",
    "FAMILY",
    "PLAN_SCHEMA",
    "PLAN_STATUS",
    "TEACHER_PLAN_SCHEMA",
    "TEACHER_WORK_SCHEMA",
    "YaneuraOnlyV1ProtocolError",
    "canonical_json_bytes",
    "validate_plan_document",
    "validate_runtime_source_revision",
    "validate_teacher_plan",
    "validate_tracked_plan_file",
]
