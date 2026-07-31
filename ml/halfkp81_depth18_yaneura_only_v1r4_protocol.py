#!/usr/bin/env python3
"""Fail-closed protocol for the v1r4 legal-MultiPV validator recovery."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Mapping

import halfkp81_depth18_yaneura_only_v1r3_protocol as V1R3


PLAN_SCHEMA = "shogi-halfkp81-hard-depth18-yaneura-only-recovery-plan-v1r4"
TEACHER_PLAN_SCHEMA = (
    "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r4"
)
TEACHER_WORK_SCHEMA = (
    "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r4"
)
FAMILY = "halfkp81-hard-depth18-yaneura-only-v1r4"
PLAN_STATUS = "prospective-legal-multipv-validator-recovery-not-executed"
FAILED_V1R3_REVISION = "6b4c5d13f628f14ea1836a08f36d9ad9dd05e266"
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")

EXPECTED_TRACKED_PLAN_IDENTITY = {
    "path": "ml/halfkp81-hard-depth18-yaneura-only-v1r4-plan.json",
    "bytes": 29_943,
    "sha256": "29d3356139d7df173150374fa30d117ce01cd5d40cce960be1fe812cc2ce1d7b",
    "schema": PLAN_SCHEMA,
}

EXPECTED_AUTHORITY = copy.deepcopy(V1R3.EXPECTED_AUTHORITY)
EXPECTED_RUNTIME_AUTHORITY = copy.deepcopy(V1R3.EXPECTED_RUNTIME_AUTHORITY)
EXPECTED_ENGINE = copy.deepcopy(V1R3.EXPECTED_ENGINE)
EXPECTED_GATES = copy.deepcopy(V1R3.EXPECTED_GATES)
EXPECTED_LEDGER_CANDIDATE_GENERATION = copy.deepcopy(
    V1R3.EXPECTED_LEDGER_CANDIDATE_GENERATION
)
EXPECTED_LIVE_BASELINE = copy.deepcopy(V1R3.EXPECTED_LIVE_BASELINE)
EXPECTED_PREDECESSOR_V1 = copy.deepcopy(V1R3.EXPECTED_PREDECESSOR_V1)
EXPECTED_PREDECESSOR_V1R2 = copy.deepcopy(V1R3.EXPECTED_FAILED_V1R2)
EXPECTED_PREDECESSOR_V3R3 = copy.deepcopy(V1R3.EXPECTED_PREDECESSOR_V3R3)
EXPECTED_REUSED_SELECTION = copy.deepcopy(V1R3.EXPECTED_REUSED_SELECTION)
EXPECTED_SELECTION_ROLES = copy.deepcopy(V1R3.EXPECTED_SELECTION_ROLES)
EXPECTED_TEACHER = copy.deepcopy(V1R3.EXPECTED_TEACHER)
EXPECTED_TRACKED_PARSER = copy.deepcopy(V1R3.EXPECTED_TRACKED_PARSER)
EXPECTED_TRAINING = copy.deepcopy(V1R3.EXPECTED_TRAINING)

_V1R3_FORMAL_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-hard-depth18-yaneura-only-v1r3"
)
_V1R3_PREFLIGHT_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-depth18-yaneura-only-v1r3-preflight"
)
_V1R3_LAUNCH_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/launch-agents/"
    "halfkp81-depth18-yaneura-only-v1r3-preflight512-6b4c5d13"
)
_V1R3_SERVICE_LABEL = (
    "com.meetyudai.shogi."
    "halfkp81-depth18-yaneura-v1r3-preflight512-6b4c5d13"
)
_V1R3_ENTRYPOINT = (
    "/Users/yudaiyaguchi/.codex/worktrees/541a/nextjs-portfolio/"
    "ml/run-halfkp81-depth18-yaneura-only-v1r3-preflight.ts"
)
_V1R3_FINGERPRINT = (
    "81bb70e785f8973fd04200385559e2fb738abaafe31dcecef5da242dbfa30643"
)
_V1R3_FAULT_PARENT = (
    "sha256:dc6230929aad5c53291c283200c456e2d178abcac1aec6537cf27aefcdb36a7f"
)
_V1R3_FAULT_MESSAGE = (
    f"preflight parent {_V1R3_FAULT_PARENT} "
    "search or legal-row evidence differs"
)
EXPECTED_FAILED_V1R3 = {
    "artifact_reuse_authorized": False,
    "completed_parents": 512,
    "family": V1R3.FAMILY,
    "formal_namespace": {
        "directory": _V1R3_FORMAL_DIRECTORY,
        "exact_entries": ["teacher-plan.json"],
    },
    "launch": {
        "entrypoint": _V1R3_ENTRYPOINT,
        "exact_entries": [
            f"{_V1R3_SERVICE_LABEL}.launch-agent.plist",
            f"{_V1R3_SERVICE_LABEL}.stderr.log",
            f"{_V1R3_SERVICE_LABEL}.stdout.log",
            "launch-spec.json",
        ],
        "launch_spec": {
            "bytes": 1_004,
            "path": f"{_V1R3_LAUNCH_DIRECTORY}/launch-spec.json",
            "sha256": (
                "ba7dd1dacc41cebb0ff495330b660ca8b40cda7ec2c129506cd22b764a185eb0"
            ),
        },
        "namespace": _V1R3_LAUNCH_DIRECTORY,
        "plist": {
            "bytes": 1_561,
            "path": (
                f"{_V1R3_LAUNCH_DIRECTORY}/{_V1R3_SERVICE_LABEL}."
                "launch-agent.plist"
            ),
            "sha256": (
                "9869bbc62538a822fdf5d0ae13e5bb89b5e95626e22d3b624544106525bf83fe"
            ),
        },
        "process_present": False,
        "service_label": _V1R3_SERVICE_LABEL,
        "service_present": False,
        "stderr": {
            "bytes": 337,
            "path": (
                f"{_V1R3_LAUNCH_DIRECTORY}/{_V1R3_SERVICE_LABEL}.stderr.log"
            ),
            "sha256": (
                "70467384daa0dc6cda3a1d0f1e7048c7164adcba2be2d518e8e4a21636ef5cf6"
            ),
        },
        "stdout": {
            "bytes": 0,
            "path": (
                f"{_V1R3_LAUNCH_DIRECTORY}/{_V1R3_SERVICE_LABEL}.stdout.log"
            ),
            "sha256": (
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            ),
        },
    },
    "milestones": {
        "100": {
            "bytes": 545,
            "completed_rows": 1_195,
            "parent_ids_sha256": (
                "db42c7ad26958a58e001e4a42595edcb0fb2593bda661d6a4ef7dade3b603008"
            ),
            "path": f"{_V1R3_PREFLIGHT_DIRECTORY}/teacher-milestone-100.json",
            "run_fingerprint": _V1R3_FINGERPRINT,
            "schema": "shogi-halfkp81-hard-depth18-teacher-milestone-v1",
            "sha256": (
                "5debb6904e96d5c83a43e9678f9ceeff532bf1bf8b998661e40e8fe8284b9849"
            ),
            "target_parents": 100,
            "technical_faults": 0,
            "work_entry_payloads_sha256": (
                "a1bac720c485c6bbaf3a91b648150c5e9d54d7a199e8026c39246ecd4dd29258"
            ),
        },
        "500": {
            "bytes": 545,
            "completed_rows": 5_990,
            "parent_ids_sha256": (
                "abe67854feb5be45bfa48fe69102536b6bccb008bf7b94821df74fab9eb93f9a"
            ),
            "path": f"{_V1R3_PREFLIGHT_DIRECTORY}/teacher-milestone-500.json",
            "run_fingerprint": _V1R3_FINGERPRINT,
            "schema": "shogi-halfkp81-hard-depth18-teacher-milestone-v1",
            "sha256": (
                "22a7150d81a050f0065a48b71fc5be632147d768e695cd5dcf75dbab1057cae6"
            ),
            "target_parents": 500,
            "technical_faults": 0,
            "work_entry_payloads_sha256": (
                "340464e9e3b4dfd9e1af2d15cb7bccf00ccc459c3cabcca682690111245ebf50"
            ),
        },
    },
    "output_artifacts": {
        "fit": {
            "bytes": 3_833_859,
            "path": f"{_V1R3_PREFLIGHT_DIRECTORY}/fit.jsonl",
            "rows": 4_605,
            "schema": "shogi-sibling-v1",
            "sha256": (
                "e21800bb81e3a19b296c7ae1151ba723049fd722223f85d9217539cd932949b9"
            ),
        },
        "sealed": {
            "bytes": 630_397,
            "path": f"{_V1R3_PREFLIGHT_DIRECTORY}/sealed.jsonl",
            "rows": 758,
            "schema": "shogi-sibling-v1",
            "sha256": (
                "5324cd1a518c3f86a1caa24d00a4f857af5a45a5e45a0373135f53981c35033a"
            ),
        },
        "tune": {
            "bytes": 641_253,
            "path": f"{_V1R3_PREFLIGHT_DIRECTORY}/tune.jsonl",
            "rows": 771,
            "schema": "shogi-sibling-v1",
            "sha256": (
                "cdcb74cb2eff90956883161c08f5e28217678ccdd22b5e06e50ff3a8c13be3f1"
            ),
        },
    },
    "preflight_namespace": {
        "directory": _V1R3_PREFLIGHT_DIRECTORY,
        "exact_entries": [
            "fit.jsonl",
            "preflight-terminal-fault.json",
            "sealed.jsonl",
            "teacher-milestone-100.json",
            "teacher-milestone-500.json",
            "teacher-receipt.json",
            "teacher-work.jsonl",
            "tune.jsonl",
        ],
    },
    "preflight_terminal_fault": {
        "bytes": 481,
        "engines_quit": 13,
        "engines_started": 13,
        "message": _V1R3_FAULT_MESSAGE,
        "path": f"{_V1R3_PREFLIGHT_DIRECTORY}/preflight-terminal-fault.json",
        "schema": (
            "shogi-halfkp81-hard-depth18-yaneura-only-"
            "preflight-terminal-fault-v1r3"
        ),
        "selected_parents": 512,
        "sha256": (
            "5129add99dea903a446c4098bd19e500b3740debf2d29d7c184e55890883d1d2"
        ),
        "status": "scratch-preflight-failed-no-formal-authority",
    },
    "recovery_reason": (
        "preflight-validator-required-multipv12-instead-of-generator-"
        "min12-legal-move-count"
    ),
    "requested_multipv_distribution": {
        "2": 1,
        "6": 1,
        "10": 1,
        "12": 509,
    },
    "reuse_completed_parents": 0,
    "reuse_teacher_rows": 0,
    "role_parents": {"fit": 384, "sealed": 64, "tune": 64},
    "role_rows": {"fit": 4_605, "sealed": 758, "tune": 771},
    "run_fingerprint": _V1R3_FINGERPRINT,
    "same_family_resume_authorized": False,
    "source_revision": FAILED_V1R3_REVISION,
    "status": "posthoc-preflight-validator-fault-family-stopped",
    "teacher_faults": 0,
    "teacher_plan": {
        "bytes": 20_689,
        "path": f"{_V1R3_FORMAL_DIRECTORY}/teacher-plan.json",
        "schema": V1R3.TEACHER_PLAN_SCHEMA,
        "sha256": (
            "9d8c62455ed9c58de226c95039786a956fbb891bcc25292fdc05d5a9733eef1d"
        ),
    },
    "teacher_receipt": {
        "bytes": 1_622,
        "completed_parents": 512,
        "completed_rows": 6_134,
        "incomplete_parents": 0,
        "path": f"{_V1R3_PREFLIGHT_DIRECTORY}/teacher-receipt.json",
        "schema": "shogi-halfkp81-hard-depth18-teacher-receipt-v1",
        "sha256": (
            "f18731c07b37bd89c4f037ca3275b42544718ce187ab00eda2fa52a5a2950d37"
        ),
        "status": "structurally-complete-awaiting-artifact-verification",
        "technical_faults": 0,
    },
    "teacher_rows": 6_134,
    "tracked_preregistration": copy.deepcopy(
        V1R3.EXPECTED_TRACKED_PLAN_IDENTITY
    ),
    "validator_fault_parent": _V1R3_FAULT_PARENT,
    "work_ledger": {
        "bytes": 7_600_387,
        "header_records": 1,
        "parent_records": 512,
        "path": f"{_V1R3_PREFLIGHT_DIRECTORY}/teacher-work.jsonl",
        "records": 513,
        "run_fingerprint": _V1R3_FINGERPRINT,
        "schema": V1R3.TEACHER_WORK_SCHEMA,
        "sha256": (
            "7fa1dec7f07411f1413facf4ac60bfcc600883537bf03ee5bd084240de6f245b"
        ),
        "teacher_rows": 6_134,
    },
}

_V1R4_PREFLIGHT_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-depth18-yaneura-only-v1r4-preflight"
)
EXPECTED_TECHNICAL_RECOVERY = {
    "cross_runtime_canonical_json": copy.deepcopy(
        V1R3.EXPECTED_TECHNICAL_RECOVERY["cross_runtime_canonical_json"]
    ),
    "formal_output_directory_initialization_changed": False,
    "preflight_validator_requested_multipv": {
        "expected": "min(12, legal_moves_count)",
        "generator_contract_changed": False,
        "maximum": 12,
        "validator_only_change": True,
    },
    "scratch_preflight_directory": {
        **copy.deepcopy(
            V1R3.EXPECTED_TECHNICAL_RECOVERY[
                "scratch_preflight_directory"
            ]
        ),
        "path": _V1R4_PREFLIGHT_DIRECTORY,
    },
    "selection_contract_changed": False,
    "strength_contract_changed": False,
    "teacher_generation_contract_changed": False,
    "timeout_extension_milliseconds": 0,
    "training_contract_changed": False,
}
EXPECTED_CHANGE_CONTROL = {
    "allowed_changes": [
        "validate-requested-multipv-as-min-12-and-legal-move-count",
        "bind-v1r3-complete-zero-teacher-fault-posthoc-validator-fault",
        "new-clean-merged-main-source-revision",
        "new-run-fingerprint",
        "new-create-only-output-namespace",
    ],
    "downstream_gates_must_equal_v1r3": True,
    "failed_v1r3_parent_rows_reused": 0,
    "failed_v1r3_teacher_rows_reused": 0,
    "selection_must_equal_v1r3": True,
    "strength_contract_must_equal_v1r3": True,
    "training_contract_must_equal_v1r3": True,
}

_OUTPUT_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-hard-depth18-yaneura-only-v1r4"
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
    "forbidden_failed_v1r3_revision": FAILED_V1R3_REVISION,
    "must_bind_new_clean_merged_main_revision": True,
    "new_run_fingerprint_required": True,
    "runtime_plan_source_revision_must_equal_authenticated_main_head": True,
    "tracked_plan_must_be_merged_before_runtime_plan": True,
    "uncommitted_changes_maximum": 0,
}


class YaneuraOnlyV1R4ProtocolError(ValueError):
    """Raised when the v1r4 legal-MultiPV recovery contract differs."""


def _require_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise YaneuraOnlyV1R4ProtocolError(
            f"{label} does not match YaneuraOu-only v1r4 preregistration"
        )


def _reject_constant(constant: str) -> Any:
    raise YaneuraOnlyV1R4ProtocolError(f"pinned JSON contains {constant}")


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
        raise YaneuraOnlyV1R4ProtocolError(
            f"invalid pinned {label}: {error}"
        ) from error
    if type(document) is not dict:
        raise YaneuraOnlyV1R4ProtocolError(f"{label} root must be an object")
    return document


def normalize_cross_runtime_document(
    value: Mapping[str, Any],
) -> dict[str, Any]:
    try:
        return V1R3.normalize_cross_runtime_document(value)
    except V1R3.YaneuraOnlyV1R3ProtocolError as error:
        raise YaneuraOnlyV1R4ProtocolError(str(error)) from error


def cross_runtime_canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    try:
        return V1R3.cross_runtime_canonical_json_bytes(value)
    except V1R3.YaneuraOnlyV1R3ProtocolError as error:
        raise YaneuraOnlyV1R4ProtocolError(str(error)) from error


def validate_plan_document(document: Mapping[str, Any]) -> dict[str, Any]:
    fields = {
        "authority",
        "change_control",
        "downstream_gates",
        "failed_v1r3",
        "family",
        "live_baseline",
        "output_namespace",
        "predecessor_v1",
        "predecessor_v1r2",
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
        raise YaneuraOnlyV1R4ProtocolError("plan fields differ")
    fixed = (
        ("authority", EXPECTED_AUTHORITY),
        ("change_control", EXPECTED_CHANGE_CONTROL),
        ("downstream_gates", EXPECTED_GATES),
        ("failed_v1r3", EXPECTED_FAILED_V1R3),
        ("family", FAMILY),
        ("live_baseline", EXPECTED_LIVE_BASELINE),
        ("output_namespace", EXPECTED_OUTPUT_NAMESPACE),
        ("predecessor_v1", EXPECTED_PREDECESSOR_V1),
        ("predecessor_v1r2", EXPECTED_PREDECESSOR_V1R2),
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
    failed = document["failed_v1r3"]
    if (
        failed["reuse_completed_parents"] != 0
        or failed["reuse_teacher_rows"] != 0
        or failed["artifact_reuse_authorized"] is not False
        or document["change_control"]["failed_v1r3_parent_rows_reused"] != 0
        or document["change_control"]["failed_v1r3_teacher_rows_reused"] != 0
    ):
        raise YaneuraOnlyV1R4ProtocolError(
            "failed v1r3 parent and teacher row reuse must remain zero"
        )
    return copy.deepcopy(dict(document))


def validate_tracked_plan_file(path: str | Path) -> dict[str, Any]:
    raw = Path(path).read_bytes()
    document = _parse_exact_identity(
        raw, EXPECTED_TRACKED_PLAN_IDENTITY, label="tracked plan"
    )
    if document.get("schema") != EXPECTED_TRACKED_PLAN_IDENTITY["schema"]:
        raise YaneuraOnlyV1R4ProtocolError("tracked plan schema differs")
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
        raise YaneuraOnlyV1R4ProtocolError(
            "source revision must be 40 lowercase hex"
        )
    if source_revision == FAILED_V1R3_REVISION:
        raise YaneuraOnlyV1R4ProtocolError(
            "failed v1r3 source revision is forbidden"
        )
    if source_revision != authenticated_main_head:
        raise YaneuraOnlyV1R4ProtocolError(
            "source revision must equal authenticated main head"
        )
    if not repository_clean:
        raise YaneuraOnlyV1R4ProtocolError("repository must be clean")
    if not tracked_plan_merged:
        raise YaneuraOnlyV1R4ProtocolError(
            "tracked YaneuraOu-only v1r4 preregistration must be merged"
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
        "predecessor_v1r3",
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
        raise YaneuraOnlyV1R4ProtocolError("teacher plan fields differ")
    _require_equal(document["schema"], TEACHER_PLAN_SCHEMA, "teacher schema")
    _require_equal(document["status"], "sealed-not-executed", "teacher status")
    if (
        not REVISION_RE.fullmatch(expected_source_revision)
        or expected_source_revision == FAILED_V1R3_REVISION
        or document["source_revision"] != expected_source_revision
    ):
        raise YaneuraOnlyV1R4ProtocolError("teacher source revision differs")
    fixed = (
        ("authority", EXPECTED_RUNTIME_AUTHORITY),
        ("downstream_gates", EXPECTED_GATES),
        ("engine", EXPECTED_ENGINE),
        ("outputs", EXPECTED_RUNTIME_OUTPUTS),
        ("predecessor_v1", EXPECTED_PREDECESSOR_V1),
        ("predecessor_v1r2", EXPECTED_PREDECESSOR_V1R2),
        ("predecessor_v1r3", EXPECTED_FAILED_V1R3),
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
        raise YaneuraOnlyV1R4ProtocolError("selection evidence fields differ")
    if (
        evidence.get("schema")
        != "shogi-halfkp81-depth18-authenticated-selection-evidence-v1"
        or evidence.get("status")
        != "authenticated-selection-complete-teacher-plan-eligible"
        or evidence.get("source_revision") != expected_source_revision
    ):
        raise YaneuraOnlyV1R4ProtocolError("selection evidence status differs")
    selected = evidence.get("selection_jsonl")
    manifest = evidence.get("selection_manifest")
    if not isinstance(selected, Mapping) or not isinstance(manifest, Mapping):
        raise YaneuraOnlyV1R4ProtocolError("selection identities are invalid")
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
    "EXPECTED_FAILED_V1R3",
    "EXPECTED_GATES",
    "EXPECTED_LEDGER_CANDIDATE_GENERATION",
    "EXPECTED_LIVE_BASELINE",
    "EXPECTED_OUTPUT_NAMESPACE",
    "EXPECTED_PREDECESSOR_V1",
    "EXPECTED_PREDECESSOR_V1R2",
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
    "FAILED_V1R3_REVISION",
    "FAMILY",
    "PLAN_SCHEMA",
    "PLAN_STATUS",
    "TEACHER_PLAN_SCHEMA",
    "TEACHER_WORK_SCHEMA",
    "YaneuraOnlyV1R4ProtocolError",
    "cross_runtime_canonical_json_bytes",
    "normalize_cross_runtime_document",
    "validate_plan_document",
    "validate_runtime_source_revision",
    "validate_teacher_plan",
    "validate_tracked_plan_file",
]
