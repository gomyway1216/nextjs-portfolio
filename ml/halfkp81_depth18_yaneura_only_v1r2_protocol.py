#!/usr/bin/env python3
"""Fail-closed protocol for the cross-runtime canonical JSON v1r2 recovery."""

from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path
import re
from typing import Any, Mapping

import halfkp81_depth18_yaneura_only_v1_protocol as V1


PLAN_SCHEMA = "shogi-halfkp81-hard-depth18-yaneura-only-recovery-plan-v1r2"
TEACHER_PLAN_SCHEMA = (
    "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r2"
)
TEACHER_WORK_SCHEMA = (
    "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r2"
)
FAMILY = "halfkp81-hard-depth18-yaneura-only-v1r2"
PLAN_STATUS = "prospective-cross-runtime-canonical-recovery-not-executed"
FAILED_V1_REVISION = "b75007ccdb202f76380d316feb0a7b3afd6b0e15"
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
MAX_SAFE_INTEGER = 9_007_199_254_740_991
ALLOWED_NON_INTEGRAL_FLOATS = frozenset({0.5, 1.05})

EXPECTED_TRACKED_PLAN_IDENTITY = {
    "path": "ml/halfkp81-hard-depth18-yaneura-only-v1r2-plan.json",
    "bytes": 15_414,
    "sha256": "40baa5fa1978f81eaa2a3e4034321d4297d27c2a5e485bc9f754f55b4c00a5e0",
    "schema": PLAN_SCHEMA,
}

EXPECTED_AUTHORITY = copy.deepcopy(V1.EXPECTED_AUTHORITY)
EXPECTED_RUNTIME_AUTHORITY = copy.deepcopy(V1.EXPECTED_RUNTIME_AUTHORITY)
EXPECTED_ENGINE = copy.deepcopy(V1.EXPECTED_ENGINE)
EXPECTED_GATES = copy.deepcopy(V1.EXPECTED_GATES)
EXPECTED_LEDGER_CANDIDATE_GENERATION = copy.deepcopy(
    V1.EXPECTED_LEDGER_CANDIDATE_GENERATION
)
EXPECTED_LIVE_BASELINE = copy.deepcopy(V1.EXPECTED_LIVE_BASELINE)
EXPECTED_PREDECESSOR_V3R3 = copy.deepcopy(V1.EXPECTED_FAILED_V3R3)
EXPECTED_REUSED_SELECTION = copy.deepcopy(V1.EXPECTED_REUSED_SELECTION)
EXPECTED_SELECTION_ROLES = copy.deepcopy(V1.EXPECTED_SELECTION_ROLES)
EXPECTED_TEACHER = copy.deepcopy(V1.EXPECTED_TEACHER)
EXPECTED_TRACKED_PARSER = copy.deepcopy(V1.EXPECTED_TRACKED_PARSER)
EXPECTED_TRAINING = copy.deepcopy(V1.EXPECTED_TRAINING)

_V1_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-hard-depth18-yaneura-only-v1"
)
_V1_PREFLIGHT_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/launch-agents/"
    "halfkp81-depth18-yaneura-only-v1-preflight512-b75007cc"
)
_V1_PREFLIGHT_LABEL = (
    "com.meetyudai.shogi.halfkp81-depth18-yaneura-preflight512-b75007cc"
)
_V1_FAILURE_MESSAGE = (
    "[halfkp81-depth18-yaneura-only-v1-preflight] STOP: "
    "teacher plan is not canonical JSON with one terminal LF"
)
EXPECTED_FAILED_V1 = {
    "completed_parents": 0,
    "cross_runtime_projection": {
        "bytes": 11_838,
        "diagnostic_only_not_reusable": True,
        "integral_float_token_replacements": 8,
        "sha256": (
            "97f02d33ba5d57ca58335bb6e6b81e3573a070d220e7851714844e41656ed7c0"
        ),
        "source_byte_delta": -16,
    },
    "family": V1.FAMILY,
    "formal_namespace": {
        "directory": _V1_DIRECTORY,
        "exact_entries": ["teacher-plan.json"],
    },
    "preflight": {
        "entrypoint": (
            "/Users/yudaiyaguchi/.codex/worktrees/541a/nextjs-portfolio/"
            "ml/run-halfkp81-depth18-yaneura-only-v1-preflight.ts"
        ),
        "exact_entries": [
            (
                f"{_V1_PREFLIGHT_LABEL}.launch-agent.plist"
            ),
            f"{_V1_PREFLIGHT_LABEL}.stderr.log",
            f"{_V1_PREFLIGHT_LABEL}.stdout.log",
            "launch-spec.json",
        ],
        "failure_message": _V1_FAILURE_MESSAGE,
        "launch_spec": {
            "bytes": 991,
            "path": f"{_V1_PREFLIGHT_DIRECTORY}/launch-spec.json",
            "sha256": (
                "eb4b83d555f5e1a00def56e6c0f0f059a1a3a80580d4dee8c5f8b2a4da969da8"
            ),
        },
        "namespace": _V1_PREFLIGHT_DIRECTORY,
        "plist": {
            "bytes": 1_540,
            "path": (
                f"{_V1_PREFLIGHT_DIRECTORY}/{_V1_PREFLIGHT_LABEL}."
                "launch-agent.plist"
            ),
            "sha256": (
                "0866f89b7937522b1e7f8dc10ad8e9c54fc084a6270315d169d181541f63ff65"
            ),
        },
        "process_present": False,
        "service_label": _V1_PREFLIGHT_LABEL,
        "service_present": False,
        "stderr": {
            "bytes": 107,
            "path": (
                f"{_V1_PREFLIGHT_DIRECTORY}/{_V1_PREFLIGHT_LABEL}.stderr.log"
            ),
            "sha256": (
                "e4bfc9671b3d2c66b139c45d8e3b7be321de2ab9ea6a16873ca2352315b2222d"
            ),
        },
        "stdout": {
            "bytes": 0,
            "path": (
                f"{_V1_PREFLIGHT_DIRECTORY}/{_V1_PREFLIGHT_LABEL}.stdout.log"
            ),
            "sha256": (
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            ),
        },
    },
    "recovery_reason": (
        "python-json-emitted-integral-floats-with-dot-zero-while-"
        "ecmascript-json-stringify-emitted-integers"
    ),
    "reuse_completed_parents": 0,
    "reuse_teacher_rows": 0,
    "run_fingerprint_created": False,
    "same_family_resume_authorized": False,
    "source_revision": FAILED_V1_REVISION,
    "status": "preflight-terminal-technical-fault-family-stopped",
    "teacher_authentication_started": False,
    "teacher_plan": {
        "bytes": 11_854,
        "path": f"{_V1_DIRECTORY}/teacher-plan.json",
        "schema": V1.TEACHER_PLAN_SCHEMA,
        "sha256": (
            "6168b156a0ff7411a0019e82f8cbe8ef2fa16c80610955aa7a97f7444bfe3e32"
        ),
    },
    "teacher_rows": 0,
    "tracked_preregistration": copy.deepcopy(
        V1.EXPECTED_TRACKED_PLAN_IDENTITY
    ),
}

EXPECTED_TECHNICAL_RECOVERY = {
    "allowed_non_integral_floats": [0.5, 1.05],
    "cross_runtime_canonical_json": (
        "ecmascript-compatible-integral-float-normalization-v1"
    ),
    "integral_finite_float_encoding": "integer-decimal-no-fraction",
    "negative_zero_allowed": False,
    "non_finite_allowed": False,
    "non_integral_float_encoding": (
        "fixed-short-decimal-whitelist-0.5-and-1.05"
    ),
    "safe_integer_maximum": MAX_SAFE_INTEGER,
    "strength_contract_changed": False,
    "timeout_extension_milliseconds": 0,
}
EXPECTED_CHANGE_CONTROL = {
    "allowed_changes": [
        "normalize-integral-finite-floats-to-json-integers",
        "reject-negative-zero-nonfinite-unsafe-or-unregistered-floats",
        "bind-v1-zero-row-preflight-canonicalization-fault",
        "new-clean-merged-main-source-revision",
        "new-run-fingerprint",
        "new-create-only-output-namespace",
    ],
    "downstream_gates_must_equal_v1": True,
    "failed_v1_parent_rows_reused": 0,
    "failed_v1_teacher_rows_reused": 0,
    "selection_must_equal_v1": True,
    "strength_contract_must_equal_v1": True,
    "training_contract_must_equal_v1": True,
}

_OUTPUT_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-hard-depth18-yaneura-only-v1r2"
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
    "forbidden_failed_v1_revision": FAILED_V1_REVISION,
    "must_bind_new_clean_merged_main_revision": True,
    "new_run_fingerprint_required": True,
    "runtime_plan_source_revision_must_equal_authenticated_main_head": True,
    "tracked_plan_must_be_merged_before_runtime_plan": True,
    "uncommitted_changes_maximum": 0,
}


class YaneuraOnlyV1R2ProtocolError(ValueError):
    """Raised when the v1r2 canonicalization recovery contract differs."""


def _require_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise YaneuraOnlyV1R2ProtocolError(
            f"{label} does not match YaneuraOu-only v1r2 preregistration"
        )


def _reject_constant(constant: str) -> Any:
    raise YaneuraOnlyV1R2ProtocolError(f"pinned JSON contains {constant}")


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
        raise YaneuraOnlyV1R2ProtocolError(
            f"invalid pinned {label}: {error}"
        ) from error
    if type(document) is not dict:
        raise YaneuraOnlyV1R2ProtocolError(f"{label} root must be an object")
    return document


def _normalize_cross_runtime_value(value: Any) -> Any:
    if value is None or type(value) in (str, bool):
        return value
    if type(value) is int:
        if abs(value) > MAX_SAFE_INTEGER:
            raise YaneuraOnlyV1R2ProtocolError(
                "cross-runtime JSON rejects unsafe integers"
            )
        return value
    if type(value) is float:
        if not math.isfinite(value) or (
            value == 0.0 and math.copysign(1.0, value) < 0
        ):
            raise YaneuraOnlyV1R2ProtocolError(
                "cross-runtime JSON rejects non-finite numbers and negative zero"
            )
        if value.is_integer():
            integer = int(value)
            if abs(integer) > MAX_SAFE_INTEGER:
                raise YaneuraOnlyV1R2ProtocolError(
                    "cross-runtime JSON rejects unsafe integral floats"
                )
            return integer
        if value not in ALLOWED_NON_INTEGRAL_FLOATS:
            raise YaneuraOnlyV1R2ProtocolError(
                "cross-runtime JSON rejects unregistered non-integral floats"
            )
        return value
    if type(value) is list:
        return [_normalize_cross_runtime_value(item) for item in value]
    if type(value) is dict:
        if any(type(key) is not str for key in value):
            raise YaneuraOnlyV1R2ProtocolError(
                "cross-runtime JSON object keys must be strings"
            )
        return {
            key: _normalize_cross_runtime_value(item)
            for key, item in value.items()
        }
    raise YaneuraOnlyV1R2ProtocolError(
        f"cross-runtime JSON rejects {type(value).__name__}"
    )


def normalize_cross_runtime_document(
    value: Mapping[str, Any],
) -> dict[str, Any]:
    if type(value) is not dict:
        raise YaneuraOnlyV1R2ProtocolError(
            "cross-runtime JSON root must be an object"
        )
    return _normalize_cross_runtime_value(dict(value))


def cross_runtime_canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    normalized = normalize_cross_runtime_document(value)
    return (
        json.dumps(
            normalized,
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
        "failed_v1",
        "family",
        "live_baseline",
        "output_namespace",
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
        raise YaneuraOnlyV1R2ProtocolError("plan fields differ")
    fixed = (
        ("authority", EXPECTED_AUTHORITY),
        ("change_control", EXPECTED_CHANGE_CONTROL),
        ("downstream_gates", EXPECTED_GATES),
        ("failed_v1", EXPECTED_FAILED_V1),
        ("family", FAMILY),
        ("live_baseline", EXPECTED_LIVE_BASELINE),
        ("output_namespace", EXPECTED_OUTPUT_NAMESPACE),
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
        document["failed_v1"]["completed_parents"] != 0
        or document["failed_v1"]["teacher_rows"] != 0
        or document["failed_v1"]["reuse_completed_parents"] != 0
        or document["failed_v1"]["reuse_teacher_rows"] != 0
        or document["change_control"]["failed_v1_parent_rows_reused"] != 0
        or document["change_control"]["failed_v1_teacher_rows_reused"] != 0
    ):
        raise YaneuraOnlyV1R2ProtocolError(
            "failed v1 parent and teacher row reuse must remain zero"
        )
    return copy.deepcopy(dict(document))


def validate_tracked_plan_file(path: str | Path) -> dict[str, Any]:
    raw = Path(path).read_bytes()
    document = _parse_exact_identity(
        raw, EXPECTED_TRACKED_PLAN_IDENTITY, label="tracked plan"
    )
    if document.get("schema") != EXPECTED_TRACKED_PLAN_IDENTITY["schema"]:
        raise YaneuraOnlyV1R2ProtocolError("tracked plan schema differs")
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
        raise YaneuraOnlyV1R2ProtocolError(
            "source revision must be 40 lowercase hex"
        )
    if source_revision == FAILED_V1_REVISION:
        raise YaneuraOnlyV1R2ProtocolError(
            "failed v1 source revision is forbidden"
        )
    if source_revision != authenticated_main_head:
        raise YaneuraOnlyV1R2ProtocolError(
            "source revision must equal authenticated main head"
        )
    if not repository_clean:
        raise YaneuraOnlyV1R2ProtocolError("repository must be clean")
    if not tracked_plan_merged:
        raise YaneuraOnlyV1R2ProtocolError(
            "tracked YaneuraOu-only v1r2 preregistration must be merged"
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
        raise YaneuraOnlyV1R2ProtocolError("teacher plan fields differ")
    _require_equal(document["schema"], TEACHER_PLAN_SCHEMA, "teacher schema")
    _require_equal(document["status"], "sealed-not-executed", "teacher status")
    if (
        not REVISION_RE.fullmatch(expected_source_revision)
        or expected_source_revision == FAILED_V1_REVISION
        or document["source_revision"] != expected_source_revision
    ):
        raise YaneuraOnlyV1R2ProtocolError("teacher source revision differs")
    fixed = (
        ("authority", EXPECTED_RUNTIME_AUTHORITY),
        ("downstream_gates", EXPECTED_GATES),
        ("engine", EXPECTED_ENGINE),
        ("outputs", EXPECTED_RUNTIME_OUTPUTS),
        ("predecessor_v1", EXPECTED_FAILED_V1),
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
        raise YaneuraOnlyV1R2ProtocolError("selection evidence fields differ")
    if (
        evidence.get("schema")
        != "shogi-halfkp81-depth18-authenticated-selection-evidence-v1"
        or evidence.get("status")
        != "authenticated-selection-complete-teacher-plan-eligible"
        or evidence.get("source_revision") != expected_source_revision
    ):
        raise YaneuraOnlyV1R2ProtocolError("selection evidence status differs")
    selected = evidence.get("selection_jsonl")
    manifest = evidence.get("selection_manifest")
    if not isinstance(selected, Mapping) or not isinstance(manifest, Mapping):
        raise YaneuraOnlyV1R2ProtocolError("selection identities are invalid")
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
    normalized = normalize_cross_runtime_document(document)
    return copy.deepcopy(normalized)


__all__ = [
    "ALLOWED_NON_INTEGRAL_FLOATS",
    "EXPECTED_AUTHORITY",
    "EXPECTED_CHANGE_CONTROL",
    "EXPECTED_ENGINE",
    "EXPECTED_FAILED_V1",
    "EXPECTED_GATES",
    "EXPECTED_LEDGER_CANDIDATE_GENERATION",
    "EXPECTED_LIVE_BASELINE",
    "EXPECTED_OUTPUT_NAMESPACE",
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
    "FAILED_V1_REVISION",
    "FAMILY",
    "MAX_SAFE_INTEGER",
    "PLAN_SCHEMA",
    "PLAN_STATUS",
    "TEACHER_PLAN_SCHEMA",
    "TEACHER_WORK_SCHEMA",
    "YaneuraOnlyV1R2ProtocolError",
    "cross_runtime_canonical_json_bytes",
    "normalize_cross_runtime_document",
    "validate_plan_document",
    "validate_runtime_source_revision",
    "validate_teacher_plan",
    "validate_tracked_plan_file",
]
