#!/usr/bin/env python3
"""Fail-closed protocol for the bounded-stable v3r2 technical recovery."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Mapping

import halfkp81_depth18_bounded_stable_v3_protocol as V3


PLAN_SCHEMA = "shogi-halfkp81-hard-depth18-bounded-stable-recovery-plan-v3r2"
TEACHER_PLAN_SCHEMA = (
    "shogi-halfkp81-hard-depth18-bounded-stable-teacher-plan-v3r2"
)
FAMILY = "halfkp81-hard-depth18-bounded-stable-v3r2"
PLAN_STATUS = "prospective-technical-recovery-not-executed"
FAILED_V3_REVISION = "28a3310a9f16fafc4b192b090dcc3cdf2600de09"
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")

EXPECTED_TRACKED_PLAN_IDENTITY = {
    "path": "ml/halfkp81-hard-depth18-bounded-stable-v3r2-plan.json",
    "bytes": 5_378,
    "sha256": "a543e03804b9215abab25eb34f3937f5cc1fa212fc12af80b7a25e923665a7e5",
    "schema": PLAN_SCHEMA,
}

EXPECTED_AUTHORITY = copy.deepcopy(V3.EXPECTED_AUTHORITY)
EXPECTED_RUNTIME_AUTHORITY = copy.deepcopy(V3.EXPECTED_RUNTIME_AUTHORITY)
EXPECTED_ENGINE = copy.deepcopy(V3.EXPECTED_ENGINE)
EXPECTED_GATES = copy.deepcopy(V3.EXPECTED_GATES)
EXPECTED_LIVE_BASELINE = copy.deepcopy(V3.EXPECTED_LIVE_BASELINE)
EXPECTED_PREDECESSOR_V2 = copy.deepcopy(V3.EXPECTED_PREDECESSOR_V2)
EXPECTED_REUSED_SELECTION = copy.deepcopy(V3.EXPECTED_REUSED_SELECTION)
EXPECTED_SELECTION_ROLES = copy.deepcopy(V3.EXPECTED_SELECTION_ROLES)
EXPECTED_TEACHER = copy.deepcopy(V3.EXPECTED_TEACHER)
EXPECTED_TRAINING = copy.deepcopy(V3.EXPECTED_TRAINING)

EXPECTED_V3_STRENGTH_CONTRACT = {
    "bytes": 8_607,
    "path": "ml/halfkp81-hard-depth18-bounded-stable-v3-plan.json",
    "schema": V3.PLAN_SCHEMA,
    "sha256": "e72510d0e34a2904810591f12bc909c1ae9f770abb596195161ab9dd9d9375f1",
}

_V3_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-hard-depth18-bounded-stable-v3"
)
_V3_LAUNCH_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/launch-agents/"
    "halfkp81-depth18-bounded-stable-v3-28a3310a"
)
_V3_SERVICE_LABEL = (
    "com.meetyudai.shogi.halfkp81-depth18-bounded-v3-28a3310a"
)
EXPECTED_FAILED_V3 = {
    "completed_parents": 0,
    "family": V3.FAMILY,
    "formal_namespace": {
        "directory": _V3_DIRECTORY,
        "exact_entries": ["teacher-plan.json"],
        "terminal_fault_artifact_present": False,
    },
    "launch": {
        "plist": {
            "bytes": 1_488,
            "path": (
                f"{_V3_LAUNCH_DIRECTORY}/{_V3_SERVICE_LABEL}."
                "launch-agent.plist"
            ),
            "sha256": (
                "1a9098cde06ea960f5132ddc9f42be452e323c5daaf266216f091ec7bc3837da"
            ),
        },
        "process_present": False,
        "service_label": _V3_SERVICE_LABEL,
        "service_present": False,
        "stderr": {
            "bytes": 120,
            "path": f"{_V3_LAUNCH_DIRECTORY}/{_V3_SERVICE_LABEL}.stderr.log",
            "sha256": (
                "2ed0a84c5a4995b68a615649ade6607d41e7482fdcc80d3668648a39dc326e85"
            ),
        },
        "stdout": {
            "bytes": 0,
            "path": f"{_V3_LAUNCH_DIRECTORY}/{_V3_SERVICE_LABEL}.stdout.log",
            "sha256": (
                "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
            ),
        },
    },
    "source_revision": FAILED_V3_REVISION,
    "status": "technical-launch-fault-family-stopped",
    "teacher_plan": {
        "bytes": 9_103,
        "path": f"{_V3_DIRECTORY}/teacher-plan.json",
        "schema": V3.TEACHER_PLAN_SCHEMA,
        "sha256": (
            "6b69cb61044df051999191e6204be098205aa2301690f2a1becc0730baf9eda5"
        ),
    },
    "teacher_rows": 0,
    "terminal_fault_artifact_present": False,
}

EXPECTED_CHANGE_CONTROL = {
    "allowed_changes": [
        "tracked-preregistration-parser-exact-identity-json-parse",
        "new-clean-merged-main-source-revision",
        "new-create-only-output-namespace",
    ],
    "failed_v3_parent_rows_reused": 0,
    "failed_v3_teacher_rows_reused": 0,
    "strength_contract": EXPECTED_V3_STRENGTH_CONTRACT,
    "strength_contract_must_equal_v3": True,
    "v2_parent_rows_reused": 0,
    "v2_teacher_rows_reused": 0,
}

_OUTPUT_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-hard-depth18-bounded-stable-v3r2"
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
    "forbidden_failed_v3_revision": FAILED_V3_REVISION,
    "must_bind_new_clean_merged_main_revision": True,
    "runtime_plan_source_revision_must_equal_authenticated_main_head": True,
    "tracked_plan_must_be_merged_before_runtime_plan": True,
    "uncommitted_changes_maximum": 0,
}
EXPECTED_TRACKED_PARSER = {
    "duplicate_key_policy": "safe-by-exact-pinned-bytes-and-sha256",
    "format": "pretty-json-with-one-terminal-lf",
    "parser": "json-parse-semantics",
    "require_exact_bytes_and_sha256_before_parse": True,
    "require_canonical-json-reencoding": False,
}


class BoundedStableV3R2ProtocolError(ValueError):
    """Raised when the fixed v3r2 recovery contract differs."""


def _require_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise BoundedStableV3R2ProtocolError(
            f"{label} does not match v3r2 preregistration"
        )


def _reject_constant(constant: str) -> Any:
    raise BoundedStableV3R2ProtocolError(
        f"tracked v3r2 preregistration contains {constant}"
    )


def parse_pinned_tracked_plan_bytes(raw: bytes) -> Mapping[str, Any]:
    """Authenticate fixed pretty bytes before applying JSON.parse semantics.

    Duplicate-key rejection is intentionally unnecessary here: no alternate
    byte string is accepted, and the pinned reviewed document contains no
    duplicate keys. JSON.parse-compatible last-key semantics are therefore
    safe without requiring a canonical re-encoding.
    """

    identity = {
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    expected = {
        key: EXPECTED_TRACKED_PLAN_IDENTITY[key]
        for key in ("bytes", "sha256")
    }
    _require_equal(identity, expected, "tracked plan byte identity")
    try:
        document = json.loads(raw, parse_constant=_reject_constant)
    except (
        UnicodeDecodeError,
        json.JSONDecodeError,
        RecursionError,
    ) as error:
        raise BoundedStableV3R2ProtocolError(
            f"invalid pinned tracked preregistration: {error}"
        ) from error
    if type(document) is not dict:
        raise BoundedStableV3R2ProtocolError(
            "tracked preregistration root must be an object"
        )
    return document


def canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    """Encode runtime artifacts canonically; tracked pretty JSON is exempt."""

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
    expected_fields = {
        "authority",
        "change_control",
        "failed_v3",
        "family",
        "live_baseline",
        "output_namespace",
        "schema",
        "source_revision_policy",
        "status",
        "tracked_preregistration_parser",
    }
    if not isinstance(document, Mapping):
        raise BoundedStableV3R2ProtocolError("plan must be an object")
    _require_equal(set(document), expected_fields, "plan fields")
    _require_equal(document["schema"], PLAN_SCHEMA, "schema")
    _require_equal(document["family"], FAMILY, "family")
    _require_equal(document["status"], PLAN_STATUS, "status")
    _require_equal(document["authority"], EXPECTED_AUTHORITY, "authority")
    _require_equal(
        document["change_control"], EXPECTED_CHANGE_CONTROL, "change control"
    )
    _require_equal(document["failed_v3"], EXPECTED_FAILED_V3, "failed v3")
    _require_equal(
        document["live_baseline"], EXPECTED_LIVE_BASELINE, "live baseline"
    )
    _require_equal(
        document["output_namespace"],
        EXPECTED_OUTPUT_NAMESPACE,
        "output namespace",
    )
    _require_equal(
        document["source_revision_policy"],
        EXPECTED_SOURCE_REVISION_POLICY,
        "source revision policy",
    )
    _require_equal(
        document["tracked_preregistration_parser"],
        EXPECTED_TRACKED_PARSER,
        "tracked preregistration parser",
    )
    if any(
        document["change_control"][key] != 0
        for key in (
            "failed_v3_parent_rows_reused",
            "failed_v3_teacher_rows_reused",
            "v2_parent_rows_reused",
            "v2_teacher_rows_reused",
        )
    ):
        raise BoundedStableV3R2ProtocolError(
            "v2 and failed-v3 rows must not be reused"
        )
    if document["failed_v3"]["completed_parents"] != 0:
        raise BoundedStableV3R2ProtocolError("failed v3 completed parents drifted")
    if document["failed_v3"]["teacher_rows"] != 0:
        raise BoundedStableV3R2ProtocolError("failed v3 teacher rows drifted")
    return copy.deepcopy(dict(document))


def validate_tracked_plan_file(path: str | Path) -> dict[str, Any]:
    raw = Path(path).read_bytes()
    document = parse_pinned_tracked_plan_bytes(raw)
    if document.get("schema") != EXPECTED_TRACKED_PLAN_IDENTITY["schema"]:
        raise BoundedStableV3R2ProtocolError("tracked plan schema differs")
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
        raise BoundedStableV3R2ProtocolError(
            "source revision must be 40 lowercase hex"
        )
    if source_revision == FAILED_V3_REVISION:
        raise BoundedStableV3R2ProtocolError(
            "failed v3 source revision is forbidden"
        )
    if source_revision != authenticated_main_head:
        raise BoundedStableV3R2ProtocolError(
            "source revision must equal authenticated main head"
        )
    if not repository_clean:
        raise BoundedStableV3R2ProtocolError("repository must be clean")
    if not tracked_plan_merged:
        raise BoundedStableV3R2ProtocolError(
            "tracked v3r2 preregistration must be merged"
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
        "engine",
        "outputs",
        "predecessor_v2",
        "predecessor_v3",
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
        raise BoundedStableV3R2ProtocolError("teacher plan fields differ")
    _require_equal(document["schema"], TEACHER_PLAN_SCHEMA, "teacher schema")
    _require_equal(document["status"], "sealed-not-executed", "teacher status")
    if (
        not REVISION_RE.fullmatch(expected_source_revision)
        or expected_source_revision == FAILED_V3_REVISION
        or document["source_revision"] != expected_source_revision
    ):
        raise BoundedStableV3R2ProtocolError(
            "teacher plan source revision differs"
        )
    fixed = (
        ("authority", EXPECTED_RUNTIME_AUTHORITY),
        ("engine", EXPECTED_ENGINE),
        ("outputs", EXPECTED_RUNTIME_OUTPUTS),
        ("predecessor_v2", EXPECTED_PREDECESSOR_V2),
        ("predecessor_v3", EXPECTED_FAILED_V3),
        ("preregistration", EXPECTED_TRACKED_PLAN_IDENTITY),
        ("selection_manifest", EXPECTED_REUSED_SELECTION["manifest"]),
        ("selection_roles", EXPECTED_SELECTION_ROLES),
        ("teacher", EXPECTED_TEACHER),
    )
    for field, expected in fixed:
        _require_equal(document[field], expected, f"teacher {field}")

    evidence = copy.deepcopy(dict(authenticated_selection))
    evidence_fields = {
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
    if set(evidence) != evidence_fields:
        raise BoundedStableV3R2ProtocolError("selection evidence fields differ")
    if (
        evidence.get("schema")
        != "shogi-halfkp81-depth18-authenticated-selection-evidence-v1"
        or evidence.get("status")
        != "authenticated-selection-complete-teacher-plan-eligible"
        or evidence.get("source_revision") != expected_source_revision
    ):
        raise BoundedStableV3R2ProtocolError("selection evidence status differs")
    selected = evidence.get("selection_jsonl")
    manifest = evidence.get("selection_manifest")
    if not isinstance(selected, Mapping) or not isinstance(manifest, Mapping):
        raise BoundedStableV3R2ProtocolError("selection identities are invalid")
    _require_equal(
        {key: selected.get(key) for key in ("path", "bytes", "sha256", "rows", "schema")},
        EXPECTED_REUSED_SELECTION["jsonl"],
        "selected parents",
    )
    _require_equal(
        {key: manifest.get(key) for key in ("path", "bytes", "sha256", "schema")},
        EXPECTED_REUSED_SELECTION["manifest"],
        "selection manifest",
    )
    _require_equal(document["selection_evidence"], evidence, "selection evidence")
    return copy.deepcopy(dict(document))


__all__ = [
    "BoundedStableV3R2ProtocolError",
    "EXPECTED_AUTHORITY",
    "EXPECTED_CHANGE_CONTROL",
    "EXPECTED_ENGINE",
    "EXPECTED_FAILED_V3",
    "EXPECTED_GATES",
    "EXPECTED_LIVE_BASELINE",
    "EXPECTED_OUTPUT_NAMESPACE",
    "EXPECTED_PREDECESSOR_V2",
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
    "FAILED_V3_REVISION",
    "FAMILY",
    "PLAN_SCHEMA",
    "PLAN_STATUS",
    "TEACHER_PLAN_SCHEMA",
    "canonical_json_bytes",
    "parse_pinned_tracked_plan_bytes",
    "validate_plan_document",
    "validate_runtime_source_revision",
    "validate_teacher_plan",
    "validate_tracked_plan_file",
]
