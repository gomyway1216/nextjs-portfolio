#!/usr/bin/env python3
"""End-to-end local fresh-selection lane for strength-first QAT.

The checked-in registry is closed, so today's argumentless command stops
before it creates the strict-load preflight or opens private selection
artifacts.  The same production path is complete for a later reviewed READY
registry: it consumes the public three-checkpoint preflight once, verifies the
fixed selection-teacher authority and dataset, runs the real float/int16
evaluator for stable plus seeds 42/43/44, recomputes every fixed gate, and
publishes one privacy-safe receipt with exclusive crash-safe semantics.

This module never receives a final-holdout path and never authorizes a live
weight write or production promotion.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
import copy
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tempfile
from typing import Any

import fresh_qat_protocol as FRESH
import sibling_selection_protocol as SIBLING
import strength_first_qat_selection_eval_adapter as ADAPTER
import strength_first_qat_selection_preflight as PREFLIGHT
import strength_first_qat_training_bridge as BRIDGE
from fresh_qat_selection_preflight import _verify_tracked_file


STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_SCHEMA = (
    "shogi-floodgate-strength-first-selection-evaluator-registry-v2"
)
STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-strength-first-qat-selection-evaluator-registry.json"
)
STRENGTH_FIRST_SELECTION_EVALUATOR_BLOCKED_STATUS = (
    "awaiting-exact-plan-three-checkpoints-and-selection-teacher"
)
STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS = (
    "exact-plan-three-checkpoints-and-selection-teacher-ready"
)
STRENGTH_FIRST_SELECTION_PUBLICATION_ENROLLED_STATUS = (
    "candidate-selected-publication-enrolled"
)
STRENGTH_FIRST_SELECTION_TEACHER_AUTHORITY_SCHEMA = (
    "shogi-floodgate-strength-first-selection-teacher-authority-v2"
)
STRENGTH_FIRST_SELECTION_TEACHER_MANIFEST_SCHEMA = (
    "shogi-floodgate-strength-first-selection-teacher-manifest-v2"
)
STRENGTH_FIRST_SELECTION_TEACHER_RESULT_SCHEMA = (
    "shogi-floodgate-strength-first-selection-teacher-result-v2"
)
STRENGTH_FIRST_SELECTION_DATASET_SCHEMA = (
    "canonical-shogi-sibling-v1-jsonl-one-lf-per-row"
)
STRENGTH_FIRST_SELECTION_WORK_SCHEMA = "shogi-sibling-teacher-work-v2"
STRENGTH_FIRST_STABLE_CHECKPOINT_IDENTITY_SCHEMA = (
    "shogi-int16-aware-stable-checkpoint-v1"
)
STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA = (
    "shogi-floodgate-strength-first-three-seed-candidate-selection-receipt-v2"
)
STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_SCHEMA = (
    "shogi-floodgate-strength-first-selection-publication-result-v2"
)
STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_STATUS = (
    "complete-evaluation-report-and-selection-receipt-published"
)
STRENGTH_FIRST_SELECTION_EVALUATOR_CLI_SCHEMA = (
    "shogi-floodgate-strength-first-selection-evaluator-cli-v1"
)
STRENGTH_FIRST_SELECTION_EVALUATOR_EVIDENCE_SCHEMA = (
    "shogi-floodgate-strength-first-selection-evaluator-foundation-evidence-v1"
)
STRENGTH_FIRST_SELECTION_TEACHER_STATUS = (
    "complete-fresh-selection-only-postflight-bound"
)
STRENGTH_FIRST_SELECTION_RECEIPT_STATUS = (
    "complete-static-family-pass-no-holdout-or-live-authority"
)
STRENGTH_FIRST_SELECTION_PARENT_COUNT = 4_800
STRENGTH_FIRST_SELECTION_GAME_COUNT = 200
STRENGTH_FIRST_SELECTION_TIMEOUT_SKIP_LIMIT = (
    STRENGTH_FIRST_SELECTION_PARENT_COUNT + 999
) // 1_000
STRENGTH_FIRST_SELECTION_TIMEOUT_MS = 600_000
STRENGTH_FIRST_SELECTION_PROPOSAL_MULTIPV = 6
STRENGTH_FIRST_SELECTION_PROPOSAL_DEPTH = 14
STRENGTH_FIRST_SELECTION_RESCORE_DEPTH = 16
STRENGTH_FIRST_SELECTION_LABEL_POLICY = (
    "initial-multipv-plus-played-independent-single-move-rescore-"
    "final-mate-v7-timeout-quarantine"
)
STRENGTH_FIRST_SELECTION_TEACHER_ROOT = (
    ".codex/shogi-runs/floodgate-q1-2026-strength-first-selection-v2"
)
STRENGTH_FIRST_SELECTION_AUTHORITY_PATH = (
    f"{STRENGTH_FIRST_SELECTION_TEACHER_ROOT}/authority.json"
)
STRENGTH_FIRST_SELECTION_MANIFEST_PATH = (
    f"{STRENGTH_FIRST_SELECTION_TEACHER_ROOT}/manifest.json"
)
STRENGTH_FIRST_SELECTION_RESULT_PATH = (
    f"{STRENGTH_FIRST_SELECTION_TEACHER_ROOT}/result.json"
)
STRENGTH_FIRST_SELECTION_DATASET_PATH = (
    f"{STRENGTH_FIRST_SELECTION_TEACHER_ROOT}/selection.jsonl"
)
STRENGTH_FIRST_SELECTION_WORK_PATH = (
    f"{STRENGTH_FIRST_SELECTION_TEACHER_ROOT}/work.jsonl"
)
STRENGTH_FIRST_SELECTION_RECEIPT_PATH = (
    f"{STRENGTH_FIRST_SELECTION_TEACHER_ROOT}/selection-receipt.json"
)
STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_PATH = (
    f"{STRENGTH_FIRST_SELECTION_TEACHER_ROOT}/selection-evaluation-report.json"
)
STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_PATH = (
    f"{STRENGTH_FIRST_SELECTION_TEACHER_ROOT}/selection-publication-result.json"
)
STRENGTH_FIRST_STABLE_CHECKPOINT_PATH = (
    ".codex/shogi-data/wcsc36-sealed-training-inputs/runOp1-best.pt"
)
_EVALUATOR_SOURCE_PATH = "ml/strength_first_qat_selection_evaluator.py"
_ADAPTER_SOURCE_PATH = "ml/strength_first_qat_selection_eval_adapter.py"
_PREFLIGHT_SOURCE_PATH = "ml/strength_first_qat_selection_preflight.py"
_EVAL_CORE_SOURCE_PATH = "ml/eval-sibling.py"
_GATE_SOURCE_PATH = "ml/sibling_selection_protocol.py"
_SOURCE_IDENTITY_SCHEMA = "shogi-reviewed-python-source-v1"
_GIT_REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_METRIC_FIELDS = {
    "value_mae_cp",
    "value_mse_cp2",
    "within_parent_pair_accuracy",
    "teacher_top1_accuracy",
}
_MODEL_FIELDS = {
    "name",
    "checkpoint",
    "k_sigmoid",
    "production_k_int",
    "float",
    "quantized_int16",
}
_COMPLETION_FIELDS = {
    "input_games",
    "input_parents",
    "completed_parents",
    "forced_parents_skipped",
    "forced_skip_reasons",
    "parent_accounting",
    "emitted_parent_groups",
    "dataset_records",
    "sealed",
}
_TEACHER_BOUNDARY = {
    "role": "fresh_selection",
    "checkpoint_preflight_required_before_label_generation": True,
    "training_rows_read": False,
    "final_holdout_read": False,
    "network": False,
    "candidate_selection_decision_made": False,
    "live_weight_write_authorized": False,
}
_RECEIPT_BOUNDARY = {
    "local_only": True,
    "selection_labels_read": True,
    "final_holdout_read": False,
    "formal_ab_authorized": False,
    "production_promotion_authorized": False,
    "live_weight_write_authorized": False,
}
_PUBLICATION_RESULT_BOUNDARY = {
    "local_only": True,
    "evaluation_report_and_receipt_published_same_run": True,
    "result_committed_last": True,
    "deterministic_replay_required_before_final_holdout": True,
    "final_holdout_read": False,
    "production_promotion_authorized": False,
    "live_weight_write_authorized": False,
}
_REGISTRY_BOUNDARY = {
    "local_only": True,
    "fixed_private_paths": True,
    "max_workers": 2,
    "network": False,
    "aws": False,
    "gcp": False,
    "vercel": False,
    "external_calibration": False,
    "final_holdout_read": False,
    "live_weight_write": False,
}
_BLOCKED_GATES = {
    "implementation_sources_enrolled": False,
    "training_plan_enrolled": False,
    "three_checkpoint_preflight_enrolled": False,
    "selection_teacher_enrolled": False,
    "local_selection_evaluation_authorized": False,
    "candidate_selected_publication_enrolled": False,
    "deterministic_selection_evaluation_replay_required": False,
    "final_holdout_read_authorized": False,
    "production_weight_write_authorized": False,
}
_READY_GATES = {
    "implementation_sources_enrolled": True,
    "training_plan_enrolled": True,
    "three_checkpoint_preflight_enrolled": True,
    "selection_teacher_enrolled": True,
    "local_selection_evaluation_authorized": True,
    "candidate_selected_publication_enrolled": False,
    "deterministic_selection_evaluation_replay_required": False,
    "final_holdout_read_authorized": False,
    "production_weight_write_authorized": False,
}
_PUBLICATION_ENROLLED_GATES = {
    **_READY_GATES,
    "candidate_selected_publication_enrolled": True,
    "deterministic_selection_evaluation_replay_required": True,
    "final_holdout_read_authorized": True,
}
_NONCLAIMS = {
    "real_candidate_selected": False,
    "selection_receipts_emitted": 0,
    "final_holdout_label_reads": 0,
    "formal_ab_games": 0,
    "external_calibration_games": 0,
    "live_weights_changed": False,
    "strength_improved": False,
    "high_dan_calibrated": False,
}
_PUBLICATION_ENROLLED_NONCLAIMS = {
    **_NONCLAIMS,
    "real_candidate_selected": True,
    "selection_receipts_emitted": 1,
}
_BASE_PLAN_IDENTITY = {
    "path": "ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json",
    "bytes": 10_890,
    "sha256": ("ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af"),
    "schema": "shogi-floodgate-fresh-sibling-plan-v1",
}
_STRENGTH_FIRST_AMENDMENT_IDENTITY = {
    "path": ("ml/protocols/" "floodgate-q1-2026-strength-first-teacher-amendment.json"),
    "bytes": 5_123,
    "sha256": ("7bb1a6ef3116f81f6e40ea1440f40b08751e96087eadc018b48ab1d4dd910e7e"),
    "schema": "shogi-floodgate-q1-2026-strength-first-teacher-amendment-v1",
}
_ROLE_BUNDLE_RESULT_IDENTITY = {
    "path": "ml/protocols/floodgate-q1-2026-role-bundle-result.json",
    "bytes": 14_735,
    "sha256": ("56009b1abaf83a75ae66ea8abf62e1f9f7214ad1aa687f7808972679e4af3ccf"),
    "schema": "shogi-floodgate-role-bundle-result-v1",
}
_SELECTION_SOURCE = {
    "path": (
        ".codex/shogi-bundles/"
        "floodgate-q1-2026-label-free-role-bundle-v2/"
        "fresh-selection.raw.jsonl"
    ),
    "format": "shogi-floodgate-label-free-raw-parent-jsonl-v1",
    "bytes": 3_073_306,
    "sha256": ("76e43969374704a77745fd329e5d22059d036fb8235626af91421fbeba16a4d9"),
    "records": 4_800,
    "games": 200,
    "game_ids_sha256": (
        "417e2e1053d9f222e82478840f9021c68d88948fec6c9db927538ebadd77e0cb"
    ),
    "parent_ids_sha256": (
        "db24301a7168e84de2474939e8d2b865b670b448aa6ccba2999a4e19df111a3f"
    ),
    "position_ids_count": 4_800,
    "position_ids_sha256": (
        "3e0c7c049bc4e0799854a4371266278c61ce53184ae14f6be82c40ab73ef02c0"
    ),
}
_FIXED_PATHS = {
    "training_plan": BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH,
    "selection_preflight_registry": (
        PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_RELATIVE_PATH
    ),
    "selection_source": _SELECTION_SOURCE["path"],
    "selection_teacher_authority": STRENGTH_FIRST_SELECTION_AUTHORITY_PATH,
    "selection_teacher_manifest": STRENGTH_FIRST_SELECTION_MANIFEST_PATH,
    "selection_teacher_result": STRENGTH_FIRST_SELECTION_RESULT_PATH,
    "selection_teacher_work": STRENGTH_FIRST_SELECTION_WORK_PATH,
    "selection_dataset": STRENGTH_FIRST_SELECTION_DATASET_PATH,
    "stable_checkpoint": STRENGTH_FIRST_STABLE_CHECKPOINT_PATH,
    "selection_evaluation_report": STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_PATH,
    "selection_receipt": STRENGTH_FIRST_SELECTION_RECEIPT_PATH,
    "selection_publication_result": STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_PATH,
}
_IMPLEMENTATION_PATHS = {
    "evaluator": _EVALUATOR_SOURCE_PATH,
    "adapter": _ADAPTER_SOURCE_PATH,
    "preflight": _PREFLIGHT_SOURCE_PATH,
    "real_eval_core": _EVAL_CORE_SOURCE_PATH,
    "metric_gates": _GATE_SOURCE_PATH,
}
_IMPLEMENTATION_FIELDS = set(_IMPLEMENTATION_PATHS)
_ENROLLMENT_FIELDS = {
    "training_plan",
    "selection_preflight_registry",
    "checkpoint_preflight_sha256",
    "selection_teacher_run_fingerprint",
    "selection_teacher_authority",
    "selection_teacher_manifest",
    "selection_teacher_result",
    "selection_teacher_work",
    "selection_dataset",
    "stable_checkpoint",
    "selection_evaluation_origin_registry",
    "selection_evaluation_report",
    "selection_receipt",
    "selection_publication_result",
}
_REGISTRY_FIELDS = {
    "schema",
    "status",
    "protocol",
    "selection_contract",
    "fixed_paths",
    "implementation",
    "enrollments",
    "gates",
    "boundary",
    "nonclaims",
}


class StrengthFirstSelectionBlocked(RuntimeError):
    """The exact data-only enrollment or preflight is not ready."""


class StrengthFirstSelectionGateFailed(RuntimeError):
    """All models were evaluated, but the preregistered family gate failed."""


@dataclass(frozen=True)
class _SelectionDependencies:
    read_bytes: Callable[[str], bytes]
    fingerprint: Callable[[str], Mapping[str, Any]]
    verify_tracked: Callable[[str, bytes], None]
    claim_preflight: Callable[[Callable[[Mapping[str, Any]], Any]], Any]
    validate_plan: Callable[[Mapping[str, Any]], Any]
    validate_parent_accounting: Callable[..., Any]
    evaluate: Callable[..., Mapping[str, Any]]
    publish: Callable[[str, bytes, str], Mapping[str, Any]]


def _exact_dict(
    value: Any,
    fields: set[str],
    label: str,
) -> dict[str, Any]:
    if (
        type(value) is not dict
        or any(type(key) is not str for key in value)
        or set(value) != fields
    ):
        raise ValueError(f"{label} fields are not exact")
    return value


def _typed_equal(value: Any, expected: Any) -> bool:
    if type(value) is not type(expected):
        return False
    if type(expected) is dict:
        return set(value) == set(expected) and all(
            _typed_equal(value[key], expected[key]) for key in expected
        )
    if type(expected) is list:
        return len(value) == len(expected) and all(
            _typed_equal(left, right) for left, right in zip(value, expected)
        )
    return value == expected


def _sha256(value: Any, label: str, *, nonzero: bool = True) -> str:
    if (
        type(value) is not str
        or _SHA256_RE.fullmatch(value) is None
        or (nonzero and value == "0" * 64)
    ):
        raise ValueError(f"{label} is not a valid lowercase SHA-256")
    return value


def _canonical_path(value: Any, label: str) -> str:
    path = (
        PurePosixPath(value)
        if type(value) is str and value and "\\" not in value
        else None
    )
    if (
        path is None
        or ":" in value
        or path.is_absolute()
        or str(path) != value
        or any(part in ("", ".", "..") for part in path.parts)
    ):
        raise ValueError(f"{label} is not a canonical relative path")
    return value


def _identity(value: Any, label: str) -> dict[str, Any]:
    identity = _exact_dict(
        value,
        {"path", "bytes", "sha256", "schema"},
        label,
    )
    _canonical_path(identity["path"], f"{label}.path")
    if (
        type(identity["bytes"]) is not int
        or identity["bytes"] < 1
        or type(identity["schema"]) is not str
        or not identity["schema"]
    ):
        raise ValueError(f"{label} identity is invalid")
    _sha256(identity["sha256"], f"{label}.sha256")
    return identity


def _strict_json(raw: bytes, label: str) -> dict[str, Any]:
    if type(raw) is not bytes or not raw:
        raise ValueError(f"{label} must be nonempty immutable bytes")

    def object_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"{label} contains a duplicate JSON key")
            result[key] = value
        return result

    def reject_constant(value):
        raise ValueError(f"{label} contains a non-finite value: {value}")

    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=object_pairs,
            parse_constant=reject_constant,
        )
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"{label} is not strict UTF-8 JSON") from error
    if type(value) is not dict:
        raise ValueError(f"{label} root must be an object")
    return value


def _canonical_json_payload_bytes(value: dict[str, Any]) -> bytes:
    if type(value) is not dict:
        raise ValueError("canonical JSON root must be an exact object")
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _canonical_json_bytes(value: dict[str, Any]) -> bytes:
    return _canonical_json_payload_bytes(value) + b"\n"


def _checkpoint_preflight_sha256(value: dict[str, Any]) -> str:
    """Match the teacher preflight's canonical payload hash without file LF."""

    return hashlib.sha256(_canonical_json_payload_bytes(value)).hexdigest()


def _validate_protocol_file(
    repo_root: Path,
    identity: Mapping[str, Any],
    dependencies: _SelectionDependencies,
    label: str,
) -> bytes:
    path = repo_root / identity["path"]
    raw = dependencies.read_bytes(str(path))
    if (
        len(raw) != identity["bytes"]
        or hashlib.sha256(raw).hexdigest() != identity["sha256"]
        or _strict_json(raw, label).get("schema") != identity["schema"]
    ):
        raise ValueError(f"{label} identity mismatch")
    dependencies.verify_tracked(str(path), raw)
    return raw


def _validate_registry(
    value: Mapping[str, Any],
) -> tuple[dict[str, Any], bool]:
    registry = _exact_dict(
        dict(value) if isinstance(value, Mapping) else value,
        _REGISTRY_FIELDS,
        "selection evaluator registry",
    )
    if registry["schema"] != STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_SCHEMA:
        raise ValueError("selection evaluator registry schema mismatch")
    protocol = _exact_dict(
        registry["protocol"],
        {
            "base_plan",
            "strength_first_amendment",
            "role_bundle_result",
            "fresh_selection_source",
        },
        "selection evaluator protocol",
    )
    if (
        not _typed_equal(protocol["base_plan"], _BASE_PLAN_IDENTITY)
        or not _typed_equal(
            protocol["strength_first_amendment"],
            _STRENGTH_FIRST_AMENDMENT_IDENTITY,
        )
        or not _typed_equal(
            protocol["role_bundle_result"],
            _ROLE_BUNDLE_RESULT_IDENTITY,
        )
        or not _typed_equal(
            protocol["fresh_selection_source"],
            _SELECTION_SOURCE,
        )
    ):
        raise ValueError("selection evaluator protocol identity mismatch")
    if not _typed_equal(
        registry["selection_contract"], FRESH.FRESH_QAT_REQUIRED_SELECTION
    ):
        raise ValueError("selection evaluator fixed selection contract mismatch")
    if not _typed_equal(registry["fixed_paths"], _FIXED_PATHS):
        raise ValueError("selection evaluator fixed paths mismatch")
    implementation = _exact_dict(
        registry["implementation"],
        _IMPLEMENTATION_FIELDS,
        "selection evaluator implementation",
    )
    enrollments = _exact_dict(
        registry["enrollments"],
        _ENROLLMENT_FIELDS,
        "selection evaluator enrollments",
    )
    gates = _exact_dict(
        registry["gates"],
        set(_BLOCKED_GATES),
        "selection evaluator gates",
    )
    if not _typed_equal(registry["boundary"], _REGISTRY_BOUNDARY):
        raise ValueError("selection evaluator boundary mismatch")

    if registry["status"] == STRENGTH_FIRST_SELECTION_EVALUATOR_BLOCKED_STATUS:
        if any(value is not None for value in implementation.values()) or any(
            value is not None for value in enrollments.values()
        ):
            raise ValueError("blocked selection evaluator registry has an enrollment")
        if not _typed_equal(gates, _BLOCKED_GATES):
            raise ValueError("blocked selection evaluator registry has an open gate")
        if not _typed_equal(registry["nonclaims"], _NONCLAIMS):
            raise ValueError("blocked selection evaluator nonclaims mismatch")
        return registry, False
    terminal = (
        registry["status"] == STRENGTH_FIRST_SELECTION_PUBLICATION_ENROLLED_STATUS
    )
    if (
        registry["status"] != STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS
        and not terminal
    ):
        raise ValueError("selection evaluator registry status mismatch")

    for name, expected_path in _IMPLEMENTATION_PATHS.items():
        identity = _identity(
            implementation[name],
            f"selection evaluator implementation {name}",
        )
        if (
            identity["path"] != expected_path
            or identity["schema"] != _SOURCE_IDENTITY_SCHEMA
        ):
            raise ValueError(
                f"selection evaluator implementation {name} identity mismatch"
            )
    expected_enrollment_paths = {
        "training_plan": _FIXED_PATHS["training_plan"],
        "selection_preflight_registry": _FIXED_PATHS["selection_preflight_registry"],
        "selection_teacher_authority": _FIXED_PATHS["selection_teacher_authority"],
        "selection_teacher_manifest": _FIXED_PATHS["selection_teacher_manifest"],
        "selection_teacher_result": _FIXED_PATHS["selection_teacher_result"],
        "selection_teacher_work": _FIXED_PATHS["selection_teacher_work"],
        "selection_dataset": _FIXED_PATHS["selection_dataset"],
        "stable_checkpoint": _FIXED_PATHS["stable_checkpoint"],
    }
    expected_enrollment_schemas = {
        "training_plan": BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
        "selection_preflight_registry": (
            PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_SCHEMA
        ),
        "selection_teacher_authority": (
            STRENGTH_FIRST_SELECTION_TEACHER_AUTHORITY_SCHEMA
        ),
        "selection_teacher_manifest": (
            STRENGTH_FIRST_SELECTION_TEACHER_MANIFEST_SCHEMA
        ),
        "selection_teacher_result": (STRENGTH_FIRST_SELECTION_TEACHER_RESULT_SCHEMA),
        "selection_teacher_work": STRENGTH_FIRST_SELECTION_WORK_SCHEMA,
        "selection_dataset": STRENGTH_FIRST_SELECTION_DATASET_SCHEMA,
        "stable_checkpoint": STRENGTH_FIRST_STABLE_CHECKPOINT_IDENTITY_SCHEMA,
    }
    identities = {}
    for name, expected_path in expected_enrollment_paths.items():
        identity = _identity(
            enrollments[name],
            f"selection evaluator enrollment {name}",
        )
        if (
            identity["path"] != expected_path
            or identity["schema"] != expected_enrollment_schemas[name]
        ):
            raise ValueError(f"selection evaluator enrollment {name} identity mismatch")
        identities[name] = identity
    for name in (
        "checkpoint_preflight_sha256",
        "selection_teacher_run_fingerprint",
    ):
        _sha256(enrollments[name], f"selection evaluator {name}")
    if len({item["path"] for item in identities.values()}) != len(identities):
        raise ValueError("selection evaluator enrollment paths are not distinct")
    if len({item["sha256"] for item in identities.values()}) != len(identities):
        raise ValueError("selection evaluator enrollment hashes are not distinct")
    publication_fields = (
        "selection_evaluation_origin_registry",
        "selection_evaluation_report",
        "selection_receipt",
        "selection_publication_result",
    )
    if not terminal:
        if any(enrollments[name] is not None for name in publication_fields):
            raise ValueError("pre-evaluation registry contains a publication")
        if not _typed_equal(gates, _READY_GATES):
            raise ValueError("ready selection evaluator gates mismatch")
        if not _typed_equal(registry["nonclaims"], _NONCLAIMS):
            raise ValueError("ready selection evaluator nonclaims mismatch")
        return registry, True

    expected_publication_paths = {
        "selection_evaluation_origin_registry": (
            STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
        ),
        "selection_evaluation_report": _FIXED_PATHS["selection_evaluation_report"],
        "selection_receipt": _FIXED_PATHS["selection_receipt"],
        "selection_publication_result": _FIXED_PATHS["selection_publication_result"],
    }
    expected_publication_schemas = {
        "selection_evaluation_origin_registry": (
            STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_SCHEMA
        ),
        "selection_evaluation_report": (
            ADAPTER.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_SCHEMA
        ),
        "selection_receipt": STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA,
        "selection_publication_result": (
            STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_SCHEMA
        ),
    }
    publication_identities = {}
    for name in publication_fields:
        identity = _identity(
            enrollments[name],
            f"selection evaluator enrollment {name}",
        )
        if (
            identity["path"] != expected_publication_paths[name]
            or identity["schema"] != expected_publication_schemas[name]
        ):
            raise ValueError(f"selection evaluator enrollment {name} identity mismatch")
        publication_identities[name] = identity
    ready_preimage = copy.deepcopy(registry)
    ready_preimage["status"] = STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS
    for name in publication_fields:
        ready_preimage["enrollments"][name] = None
    ready_preimage["gates"] = copy.deepcopy(_READY_GATES)
    ready_preimage["nonclaims"] = copy.deepcopy(_NONCLAIMS)
    ready_preimage_raw = _canonical_json_bytes(ready_preimage)
    expected_origin_identity = {
        "path": STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH,
        "bytes": len(ready_preimage_raw),
        "sha256": hashlib.sha256(ready_preimage_raw).hexdigest(),
        "schema": STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_SCHEMA,
    }
    if not _typed_equal(
        publication_identities["selection_evaluation_origin_registry"],
        expected_origin_identity,
    ):
        raise ValueError(
            "selection evaluation origin registry is not the exact READY preimage"
        )
    if (
        len(
            {
                publication_identities[name]["path"]
                for name in (
                    "selection_evaluation_report",
                    "selection_receipt",
                    "selection_publication_result",
                )
            }
        )
        != 3
    ):
        raise ValueError("selection publication paths are not distinct")
    if len({identity["sha256"] for identity in publication_identities.values()}) != len(
        publication_identities
    ):
        raise ValueError("selection publication hashes are not distinct")
    if not _typed_equal(gates, _PUBLICATION_ENROLLED_GATES):
        raise ValueError("publication-enrolled selection evaluator gates mismatch")
    if not _typed_equal(
        registry["nonclaims"],
        _PUBLICATION_ENROLLED_NONCLAIMS,
    ):
        raise ValueError("publication-enrolled selection nonclaims mismatch")
    return registry, True


def validate_strength_first_selection_evaluator_registry_data(
    value: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Validate the exact closed state or one completely enrolled READY state."""

    registry, _ready = _validate_registry(value)
    return copy.deepcopy(registry)


def _read_registered(
    path: str,
    identity: Mapping[str, Any],
    dependencies: _SelectionDependencies,
    label: str,
) -> bytes:
    raw = dependencies.read_bytes(path)
    if (
        type(raw) is not bytes
        or len(raw) != identity["bytes"]
        or hashlib.sha256(raw).hexdigest() != identity["sha256"]
    ):
        raise ValueError(f"{label} identity mismatch")
    return raw


def _portable_artifact(
    identity: Mapping[str, Any],
    *,
    path: str,
    schema: str,
) -> dict[str, Any]:
    return {
        "path": _canonical_path(path, "portable artifact path"),
        "bytes": identity["bytes"],
        "sha256": identity["sha256"],
        "schema": schema,
    }


def _validate_preflight(
    value: Mapping[str, Any],
    *,
    registry: Mapping[str, Any],
    repo_root: Path,
) -> tuple[dict[str, Any], dict[str, Any]]:
    preflight = _exact_dict(
        dict(value) if isinstance(value, Mapping) else value,
        {
            "schema",
            "all_three_complete_before_selection_read",
            "selection_labels_read",
            "training_plan",
            "training_pipeline",
            "runs",
            "reader_gate",
            "same_process_python_authorization_enforced",
            "final_holdout",
            "production_promotion_authorized",
        },
        "strength-first selection preflight",
    )
    if (
        preflight["schema"] != PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_PREFLIGHT_SCHEMA
        or preflight["all_three_complete_before_selection_read"] is not True
        or preflight["selection_labels_read"] is not False
        or preflight["same_process_python_authorization_enforced"] is not False
        or preflight["final_holdout"] != "not_opened_by_this_preflight"
        or preflight["production_promotion_authorized"] is not False
    ):
        raise ValueError("strength-first selection preflight is incomplete")
    enrollment = registry["enrollments"]
    plan = _exact_dict(
        preflight["training_plan"],
        {"path", "bytes", "sha256", "schema"},
        "strength-first selection preflight plan",
    )
    plan_path = str(repo_root / _FIXED_PATHS["training_plan"])
    if os.path.realpath(plan["path"]) != os.path.realpath(
        plan_path
    ) or not _typed_equal(
        {
            "path": _FIXED_PATHS["training_plan"],
            "bytes": plan["bytes"],
            "sha256": plan["sha256"],
            "schema": plan["schema"],
        },
        enrollment["training_plan"],
    ):
        raise ValueError("strength-first selection preflight plan drifted")
    pipeline = _exact_dict(
        preflight["training_pipeline"],
        {"source_revision", "tracked_tree_clean"},
        "strength-first selection preflight pipeline",
    )
    if (
        type(pipeline["source_revision"]) is not str
        or _GIT_REVISION_RE.fullmatch(pipeline["source_revision"]) is None
        or pipeline["tracked_tree_clean"] is not True
    ):
        raise ValueError("strength-first selection preflight pipeline is invalid")

    runs = preflight["runs"]
    if type(runs) is not list or len(runs) != 3:
        raise ValueError("strength-first selection requires exactly three runs")
    portable_runs = []
    expected_seeds = (42, 43, 44)
    for index, (run, seed) in enumerate(zip(runs, expected_seeds)):
        run = _exact_dict(
            run,
            {
                "slot_id",
                "seed",
                "output",
                "result",
                "checkpoint",
                "checkpoint_metadata",
            },
            f"strength-first selection preflight runs[{index}]",
        )
        expected_slot = f"floodgate-strength-first-int16-aware-seed-{seed}"
        expected_output = f"{BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{seed}"
        if (
            run["slot_id"] != expected_slot
            or run["seed"] != seed
            or type(run["seed"]) is not int
            or run["output"] != expected_output
        ):
            raise ValueError(
                f"strength-first selection preflight runs[{index}] order drifted"
            )
        result = _exact_dict(
            run["result"],
            {"path", "bytes", "sha256"},
            f"strength-first selection preflight runs[{index}].result",
        )
        checkpoint = _exact_dict(
            run["checkpoint"],
            {"path", "bytes", "sha256"},
            f"strength-first selection preflight runs[{index}].checkpoint",
        )
        metadata = _exact_dict(
            run["checkpoint_metadata"],
            {"schema", "epoch"},
            f"strength-first selection preflight runs[{index}].metadata",
        )
        result_relative = f"{expected_output}/result.json"
        checkpoint_relative = f"{expected_output}/final.pt"
        if (
            os.path.realpath(result["path"])
            != os.path.realpath(repo_root / result_relative)
            or os.path.realpath(checkpoint["path"])
            != os.path.realpath(repo_root / checkpoint_relative)
            or type(result["bytes"]) is not int
            or result["bytes"] < 1
            or type(checkpoint["bytes"]) is not int
            or checkpoint["bytes"] < 1
            or _sha256(result["sha256"], "preflight result SHA-256")
            == _sha256(checkpoint["sha256"], "preflight checkpoint SHA-256")
            or metadata
            != {
                "schema": BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
                "epoch": 20,
            }
        ):
            raise ValueError(
                f"strength-first selection preflight runs[{index}] artifact drifted"
            )
        portable_runs.append(
            {
                "slot_id": expected_slot,
                "seed": seed,
                "output": expected_output,
                "result": _portable_artifact(
                    result,
                    path=result_relative,
                    schema=BRIDGE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA,
                ),
                "checkpoint": _portable_artifact(
                    checkpoint,
                    path=checkpoint_relative,
                    schema=BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
                ),
                "checkpoint_metadata": copy.deepcopy(metadata),
            }
        )
    if (
        len({run["checkpoint"]["sha256"] for run in portable_runs}) != 3
        or len({run["result"]["sha256"] for run in portable_runs}) != 3
    ):
        raise ValueError("strength-first selection run identities are not distinct")
    projection = {
        "schema": PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_PREFLIGHT_SCHEMA,
        "training_plan": copy.deepcopy(enrollment["training_plan"]),
        "training_pipeline": copy.deepcopy(pipeline),
        "runs": portable_runs,
    }
    if (
        _checkpoint_preflight_sha256(projection)
        != enrollment["checkpoint_preflight_sha256"]
    ):
        raise ValueError("strength-first selection checkpoint preflight drifted")
    return preflight, projection


def _strict_jsonl_objects(raw: bytes, label: str) -> list[dict[str, Any]]:
    if (
        type(raw) is not bytes
        or not raw
        or not raw.endswith(b"\n")
        or raw.endswith(b"\n\n")
        or b"\r" in raw
    ):
        raise ValueError(f"{label} is not exact LF-terminated JSONL")
    rows = []
    for index, line in enumerate(raw[:-1].split(b"\n"), start=1):
        if not line:
            raise ValueError(f"{label} line {index} is empty")
        rows.append(_strict_json(line, f"{label} line {index}"))
    return rows


def _identifier_digest(values: list[str]) -> str:
    unique = set(values)
    if len(unique) != len(values):
        raise ValueError("parent accounting contains a duplicate identifier")
    encoded = "\n".join(sorted(unique, key=lambda value: value.encode("utf-8")))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _validate_selection_parent_accounting(
    *,
    source_raw: bytes,
    work_raw: bytes,
    dataset_raw: bytes,
    completion: Mapping[str, Any],
    generation_run_fingerprint: str,
    source_identity: Mapping[str, Any],
) -> dict[str, Any]:
    """Recompute every emitted/omitted parent and bind its exact skip reason."""

    _sha256(
        generation_run_fingerprint,
        "selection teacher generation run fingerprint",
    )
    if (
        len(source_raw) != source_identity["bytes"]
        or hashlib.sha256(source_raw).hexdigest() != source_identity["sha256"]
    ):
        raise ValueError("selection source identity mismatch during parent accounting")
    source_rows = _strict_jsonl_objects(source_raw, "selection source")
    if len(source_rows) != source_identity["records"]:
        raise ValueError("selection source parent count drifted")
    source_ids = []
    for index, row in enumerate(source_rows, start=1):
        parent_id = row.get("parent_id")
        if type(parent_id) is not str or not parent_id:
            raise ValueError(f"selection source line {index} has no parent ID")
        source_ids.append(parent_id)
    source_id_set = set(source_ids)
    if len(source_id_set) != len(source_ids):
        raise ValueError("selection source parent IDs are not unique")
    source_digest = _identifier_digest(source_ids)
    if source_digest != source_identity["parent_ids_sha256"]:
        raise ValueError("selection source parent digest drifted")

    work_rows = _strict_jsonl_objects(work_raw, "selection teacher work")
    if len(work_rows) != len(source_rows) + 1:
        raise ValueError("selection teacher work is not complete for every parent")
    header = _exact_dict(
        work_rows[0],
        {
            "schema",
            "kind",
            "run_fingerprint",
            "source_raw_sha256",
            "selected_parent_ids_sha256",
            "label_policy",
            "pipeline",
        },
        "selection teacher work header",
    )
    if (
        header["schema"] != STRENGTH_FIRST_SELECTION_WORK_SCHEMA
        or header["kind"] != "header"
        or header["run_fingerprint"] != generation_run_fingerprint
        or header["source_raw_sha256"] != source_identity["sha256"]
        or header["selected_parent_ids_sha256"] != source_digest
        or header["label_policy"] != STRENGTH_FIRST_SELECTION_LABEL_POLICY
    ):
        raise ValueError("selection teacher work header binding mismatch")
    pipeline = _exact_dict(
        header["pipeline"],
        {"source_revision", "tracked_tree_clean"},
        "selection teacher work pipeline",
    )
    if (
        type(pipeline["source_revision"]) is not str
        or _GIT_REVISION_RE.fullmatch(pipeline["source_revision"]) is None
        or pipeline["tracked_tree_clean"] is not True
    ):
        raise ValueError("selection teacher work pipeline is not exact clean HEAD")

    work_ids: list[str] = []
    forced_ids: list[str] = []
    emitted_ids: list[str] = []
    fewer_ids: list[str] = []
    timeout_ids: list[str] = []
    emitted_records: list[dict[str, Any]] = []
    seen_work_ids: set[str] = set()
    for index, row in enumerate(work_rows[1:], start=2):
        parent_id = row.get("parent_id")
        if (
            type(parent_id) is not str
            or not parent_id
            or parent_id not in source_id_set
            or parent_id in seen_work_ids
            or row.get("schema") != STRENGTH_FIRST_SELECTION_WORK_SCHEMA
            or row.get("run_fingerprint") != generation_run_fingerprint
        ):
            raise ValueError(
                f"selection teacher work line {index} parent binding failed"
            )
        payload_sha256 = row.get("payload_sha256")
        payload = {key: value for key, value in row.items() if key != "payload_sha256"}
        if (
            type(payload_sha256) is not str
            or _SHA256_RE.fullmatch(payload_sha256) is None
            or hashlib.sha256(_canonical_json_payload_bytes(payload)).hexdigest()
            != payload_sha256
        ):
            raise ValueError(f"selection teacher work line {index} payload drifted")
        work_ids.append(parent_id)
        seen_work_ids.add(parent_id)
        if row.get("kind") == "parent":
            completed_fields = {
                "schema",
                "kind",
                "run_fingerprint",
                "payload_sha256",
                "parent_id",
                "candidate_set_sha256",
                "candidate_moves",
                "initial_search",
                "exact_search",
                "records",
            }
            if set(row) not in (
                completed_fields,
                completed_fields | {"proposal_fallback"},
            ):
                raise ValueError(
                    f"selection teacher work line {index} parent fields drifted"
                )
            records = row.get("records")
            if type(records) is not list or len(records) < 2:
                raise ValueError(
                    f"selection teacher work line {index} has incomplete records"
                )
            for record in records:
                if type(record) is not dict or record.get("parent_id") != parent_id:
                    raise ValueError(
                        f"selection teacher work line {index} record parent drifted"
                    )
                emitted_records.append(record)
            emitted_ids.append(parent_id)
            continue
        if row.get("kind") != "skip":
            raise ValueError(f"selection teacher work line {index} kind is unsupported")
        forced_ids.append(parent_id)
        reason = row.get("reason")
        legal_moves = row.get("legal_moves")
        if reason == "fewer-than-two-legal-moves":
            if (
                set(row)
                != {
                    "schema",
                    "kind",
                    "run_fingerprint",
                    "payload_sha256",
                    "parent_id",
                    "reason",
                    "legal_moves",
                }
                or type(legal_moves) is not int
                or not 0 <= legal_moves < 2
            ):
                raise ValueError(
                    f"selection teacher work line {index} forced-move reason drifted"
                )
            fewer_ids.append(parent_id)
        elif reason == "search-timeout-no-label":
            timeout = row.get("timeout")
            phase = timeout.get("phase") if type(timeout) is dict else None
            expected_multipv = (
                min(STRENGTH_FIRST_SELECTION_PROPOSAL_MULTIPV, legal_moves)
                if type(legal_moves) is int and phase == "proposal"
                else 1
            )
            expected_limit = {
                "depth": (
                    STRENGTH_FIRST_SELECTION_PROPOSAL_DEPTH
                    if phase == "proposal"
                    else STRENGTH_FIRST_SELECTION_RESCORE_DEPTH
                )
            }
            expected_searchmove_count = 0 if phase == "proposal" else 1
            if (
                set(row)
                != {
                    "schema",
                    "kind",
                    "run_fingerprint",
                    "payload_sha256",
                    "parent_id",
                    "reason",
                    "legal_moves",
                    "timeout",
                }
                or type(legal_moves) is not int
                or legal_moves < 2
                or type(timeout) is not dict
                or set(timeout)
                != {
                    "phase",
                    "requested_multipv",
                    "requested_limit",
                    "searchmoves",
                    "timeout_ms",
                }
                or timeout.get("phase") not in {"proposal", "independent-rescore"}
                or type(timeout.get("requested_multipv")) is not int
                or timeout["requested_multipv"] != expected_multipv
                or not _typed_equal(timeout.get("requested_limit"), expected_limit)
                or type(timeout.get("searchmoves")) is not list
                or len(timeout["searchmoves"]) != expected_searchmove_count
                or any(
                    type(move) is not str or not move for move in timeout["searchmoves"]
                )
                or type(timeout.get("timeout_ms")) is not int
                or timeout["timeout_ms"] != STRENGTH_FIRST_SELECTION_TIMEOUT_MS
            ):
                raise ValueError(
                    f"selection teacher work line {index} timeout reason drifted"
                )
            timeout_ids.append(parent_id)
        else:
            # In particular, proposal-incomplete-no-label remains fatal.
            raise ValueError(
                f"selection teacher work line {index} has a forbidden skip reason"
            )

    bytewise_work_ids = sorted(work_ids, key=lambda value: value.encode("utf-8"))
    if work_ids != bytewise_work_ids or set(work_ids) != source_id_set:
        raise ValueError("selection teacher work parent coverage or order drifted")
    dataset_rows = _strict_jsonl_objects(dataset_raw, "selection dataset")
    for index, (line, row) in enumerate(
        zip(dataset_raw[:-1].split(b"\n"), dataset_rows), start=1
    ):
        if line != _canonical_json_payload_bytes(row):
            raise ValueError(f"selection dataset line {index} is not canonical")
    if not _typed_equal(dataset_rows, emitted_records):
        raise ValueError("selection dataset does not match completed work records")

    actual_accounting = {
        "parent_ids_sha256": source_digest,
        "forced_parent_ids_sha256": _identifier_digest(forced_ids),
        "emitted_parent_ids_sha256": _identifier_digest(emitted_ids),
        "fewer_than_two_legal_moves_parent_ids_sha256": _identifier_digest(fewer_ids),
        "search_timeout_parent_ids_sha256": _identifier_digest(timeout_ids),
    }
    if (
        len(forced_ids) != completion["forced_parents_skipped"]
        or len(emitted_ids) != completion["emitted_parent_groups"]
        or len(emitted_records) != completion["dataset_records"]
        or len(fewer_ids)
        != completion["forced_skip_reasons"]["fewer_than_two_legal_moves"]
        or len(timeout_ids)
        != completion["forced_skip_reasons"]["search_timeout_no_label"]
        or not _typed_equal(completion["parent_accounting"], actual_accounting)
    ):
        raise ValueError("selection teacher parent accounting does not recompute")
    return actual_accounting


def _validate_selection_parent_accounting_paths(
    *,
    source_path: str,
    source_identity: Mapping[str, Any],
    work_path: str,
    work_identity: Mapping[str, Any],
    dataset_path: str,
    dataset_identity: Mapping[str, Any],
    completion: Mapping[str, Any],
    generation_run_fingerprint: str,
    read_bytes: Callable[[str], bytes],
) -> dict[str, Any]:
    snapshots = {}
    for name, path, identity in (
        ("source", source_path, source_identity),
        ("work", work_path, work_identity),
        ("dataset", dataset_path, dataset_identity),
    ):
        raw = read_bytes(path)
        if (
            type(raw) is not bytes
            or len(raw) != identity["bytes"]
            or hashlib.sha256(raw).hexdigest() != identity["sha256"]
        ):
            raise ValueError(f"selection {name} identity mismatch during accounting")
        snapshots[name] = raw
    return _validate_selection_parent_accounting(
        source_raw=snapshots["source"],
        work_raw=snapshots["work"],
        dataset_raw=snapshots["dataset"],
        completion=completion,
        generation_run_fingerprint=generation_run_fingerprint,
        source_identity=source_identity,
    )


def _validate_completion(value: Any) -> dict[str, Any]:
    completion = _exact_dict(
        value,
        _COMPLETION_FIELDS,
        "selection teacher completion",
    )
    reasons = _exact_dict(
        completion["forced_skip_reasons"],
        {"fewer_than_two_legal_moves", "search_timeout_no_label"},
        "selection teacher forced skip reasons",
    )
    accounting = _exact_dict(
        completion["parent_accounting"],
        {
            "parent_ids_sha256",
            "forced_parent_ids_sha256",
            "emitted_parent_ids_sha256",
            "fewer_than_two_legal_moves_parent_ids_sha256",
            "search_timeout_parent_ids_sha256",
        },
        "selection teacher parent accounting",
    )
    forced = completion["forced_parents_skipped"]
    emitted = completion["emitted_parent_groups"]
    records = completion["dataset_records"]
    for field, digest in accounting.items():
        _sha256(digest, f"selection teacher parent accounting {field}")
    if (
        completion["input_games"] != STRENGTH_FIRST_SELECTION_GAME_COUNT
        or type(completion["input_games"]) is not int
        or completion["input_parents"] != STRENGTH_FIRST_SELECTION_PARENT_COUNT
        or type(completion["input_parents"]) is not int
        or completion["completed_parents"] != STRENGTH_FIRST_SELECTION_PARENT_COUNT
        or type(completion["completed_parents"]) is not int
        or type(forced) is not int
        or forced < 0
        or type(reasons["fewer_than_two_legal_moves"]) is not int
        or reasons["fewer_than_two_legal_moves"] < 0
        or type(reasons["search_timeout_no_label"]) is not int
        or not 0
        <= reasons["search_timeout_no_label"]
        <= STRENGTH_FIRST_SELECTION_TIMEOUT_SKIP_LIMIT
        or reasons["fewer_than_two_legal_moves"] + reasons["search_timeout_no_label"]
        != forced
        or accounting["parent_ids_sha256"] != _SELECTION_SOURCE["parent_ids_sha256"]
        or type(emitted) is not int
        or emitted < 1
        or emitted + forced != STRENGTH_FIRST_SELECTION_PARENT_COUNT
        or type(records) is not int
        or records < 2 * emitted
        or completion["sealed"] is not True
    ):
        raise ValueError("selection teacher completion is incomplete")
    return completion


def _validate_teacher_documents(
    *,
    authority: Mapping[str, Any],
    manifest: Mapping[str, Any],
    result: Mapping[str, Any],
    registry: Mapping[str, Any],
) -> tuple[dict[str, Any], str]:
    enrollment = registry["enrollments"]
    authority = _exact_dict(
        dict(authority),
        {
            "schema",
            "status",
            "role",
            "source",
            "training_plan",
            "selection_preflight_registry",
            "checkpoint_preflight_sha256",
            "artifacts",
            "completion",
            "generation_run_fingerprint",
            "run_fingerprint",
            "boundary",
        },
        "selection teacher authority",
    )
    manifest = _exact_dict(
        dict(manifest),
        {
            "schema",
            "status",
            "role",
            "source",
            "dataset",
            "work",
            "completion",
            "generation_run_fingerprint",
            "run_fingerprint",
            "boundary",
        },
        "selection teacher manifest",
    )
    result = _exact_dict(
        dict(result),
        {
            "schema",
            "status",
            "role",
            "manifest",
            "dataset",
            "work",
            "completion",
            "generation_run_fingerprint",
            "run_fingerprint",
            "postflight_complete",
            "boundary",
        },
        "selection teacher result",
    )
    artifacts = _exact_dict(
        authority["artifacts"],
        {"manifest", "result", "dataset", "work"},
        "selection teacher authority artifacts",
    )
    completion = _validate_completion(authority["completion"])
    generation_run_fingerprint = _sha256(
        authority["generation_run_fingerprint"],
        "selection teacher generation run fingerprint",
    )
    if (
        authority["schema"] != STRENGTH_FIRST_SELECTION_TEACHER_AUTHORITY_SCHEMA
        or manifest["schema"] != STRENGTH_FIRST_SELECTION_TEACHER_MANIFEST_SCHEMA
        or result["schema"] != STRENGTH_FIRST_SELECTION_TEACHER_RESULT_SCHEMA
        or authority["status"] != STRENGTH_FIRST_SELECTION_TEACHER_STATUS
        or manifest["status"] != STRENGTH_FIRST_SELECTION_TEACHER_STATUS
        or result["status"] != STRENGTH_FIRST_SELECTION_TEACHER_STATUS
        or authority["role"] != "fresh_selection"
        or manifest["role"] != "fresh_selection"
        or result["role"] != "fresh_selection"
        or not _typed_equal(authority["source"], _SELECTION_SOURCE)
        or not _typed_equal(manifest["source"], _SELECTION_SOURCE)
        or not _typed_equal(authority["training_plan"], enrollment["training_plan"])
        or not _typed_equal(
            authority["selection_preflight_registry"],
            enrollment["selection_preflight_registry"],
        )
        or authority["checkpoint_preflight_sha256"]
        != enrollment["checkpoint_preflight_sha256"]
        or not _typed_equal(
            artifacts,
            {
                "manifest": enrollment["selection_teacher_manifest"],
                "result": enrollment["selection_teacher_result"],
                "dataset": enrollment["selection_dataset"],
                "work": enrollment["selection_teacher_work"],
            },
        )
        or not _typed_equal(manifest["dataset"], enrollment["selection_dataset"])
        or not _typed_equal(manifest["work"], enrollment["selection_teacher_work"])
        or not _typed_equal(
            result["manifest"], enrollment["selection_teacher_manifest"]
        )
        or not _typed_equal(result["dataset"], enrollment["selection_dataset"])
        or not _typed_equal(result["work"], enrollment["selection_teacher_work"])
        or not _typed_equal(manifest["completion"], completion)
        or not _typed_equal(result["completion"], completion)
        or manifest["generation_run_fingerprint"] != generation_run_fingerprint
        or result["generation_run_fingerprint"] != generation_run_fingerprint
        or authority["run_fingerprint"]
        != enrollment["selection_teacher_run_fingerprint"]
        or manifest["run_fingerprint"]
        != enrollment["selection_teacher_run_fingerprint"]
        or result["run_fingerprint"] != enrollment["selection_teacher_run_fingerprint"]
        or not _typed_equal(authority["boundary"], _TEACHER_BOUNDARY)
        or not _typed_equal(manifest["boundary"], _TEACHER_BOUNDARY)
        or not _typed_equal(result["boundary"], _TEACHER_BOUNDARY)
        or result["postflight_complete"] is not True
    ):
        raise ValueError("selection teacher authority binding mismatch")
    return completion, generation_run_fingerprint


def _metric_set(value: Any, label: str) -> dict[str, float]:
    metrics = _exact_dict(value, _METRIC_FIELDS, label)
    normalized = {}
    for field in _METRIC_FIELDS:
        metric = metrics[field]
        if type(metric) not in (int, float) or not math.isfinite(metric):
            raise ValueError(f"{label}.{field} is not finite")
        normalized[field] = float(metric)
    if (
        normalized["value_mae_cp"] < 0.0
        or normalized["value_mse_cp2"] < 0.0
        or not 0.0 <= normalized["within_parent_pair_accuracy"] <= 1.0
        or not 0.0 <= normalized["teacher_top1_accuracy"] <= 1.0
    ):
        raise ValueError(f"{label} is outside its metric domain")
    return normalized


def _model_metrics(
    model: Mapping[str, Any],
    label: str,
) -> tuple[dict[str, float], dict[str, float]]:
    floating = _metric_set(model["float"], f"{label}.float")
    quantized_value = _exact_dict(
        model["quantized_int16"],
        _METRIC_FIELDS | {"delta_from_float"},
        f"{label}.quantized_int16",
    )
    quantized = _metric_set(
        {field: quantized_value[field] for field in _METRIC_FIELDS},
        f"{label}.quantized_int16",
    )
    delta = _exact_dict(
        quantized_value["delta_from_float"],
        _METRIC_FIELDS,
        f"{label}.delta_from_float",
    )
    for field in _METRIC_FIELDS:
        observed = delta[field]
        expected = quantized[field] - floating[field]
        if (
            type(observed) not in (int, float)
            or not math.isfinite(observed)
            or not math.isclose(
                float(observed),
                expected,
                rel_tol=0.0,
                abs_tol=1e-15,
            )
        ):
            raise ValueError(f"{label} float/int16 delta mismatch for {field}")
    return floating, quantized


def _selection_key(run: Mapping[str, Any]) -> tuple[Any, ...]:
    metrics = run["int16"]
    return (
        -metrics["within_parent_pair_accuracy"],
        -metrics["teacher_top1_accuracy"],
        metrics["value_mae_cp"],
        run["seed"],
        bytes.fromhex(run["checkpoint"]["sha256"]),
    )


def _validate_report_and_build_receipt(
    report: Mapping[str, Any],
    *,
    registry: Mapping[str, Any],
    preflight_projection: Mapping[str, Any],
    completion: Mapping[str, Any],
) -> dict[str, Any]:
    report = _exact_dict(
        dict(report) if isinstance(report, Mapping) else report,
        {"schema", "status", "data", "models", "execution"},
        "strength-first selection evaluation report",
    )
    if (
        report["schema"] != ADAPTER.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_SCHEMA
        or report["status"] != ADAPTER.STRENGTH_FIRST_SELECTION_EVALUATION_STATUS
    ):
        raise ValueError("strength-first selection evaluation is partial")
    data = _exact_dict(
        report["data"],
        {
            "bytes",
            "sha256",
            "records",
            "parents",
            "eligible_pairs",
            "pair_min_cp",
            "value_cp_clamp",
            "value_target",
            "ranking_target",
        },
        "strength-first selection evaluation data",
    )
    dataset = registry["enrollments"]["selection_dataset"]
    if (
        data["bytes"] != dataset["bytes"]
        or data["sha256"] != dataset["sha256"]
        or data["records"] != completion["dataset_records"]
        or data["parents"] != completion["emitted_parent_groups"]
        or type(data["eligible_pairs"]) is not int
        or data["eligible_pairs"] < 1
        or data["pair_min_cp"] != 50.0
        or data["value_cp_clamp"] != 3_000
        or data["value_target"] != "clamped_child_cp"
        or data["ranking_target"] != "unclamped_parent_cp_equals_negative_child_cp"
    ):
        raise ValueError("strength-first selection evaluation dataset drifted")
    execution = _exact_dict(
        report["execution"],
        {
            "evaluation_count_per_model",
            "requested_max_workers",
            "actual_workers",
            "network_requests",
        },
        "strength-first selection evaluation execution",
    )
    if (
        execution["evaluation_count_per_model"] != 1
        or type(execution["evaluation_count_per_model"]) is not int
        or type(execution["requested_max_workers"]) is not int
        or not 1 <= execution["requested_max_workers"] <= 2
        or type(execution["actual_workers"]) is not int
        or not 1 <= execution["actual_workers"] <= 2
        or execution["actual_workers"] > execution["requested_max_workers"]
        or execution["network_requests"] != 0
        or type(execution["network_requests"]) is not int
    ):
        raise ValueError("strength-first selection evaluation execution drifted")
    models = report["models"]
    if (
        type(models) is not list
        or len(models) != 4
        or [model.get("name") for model in models]
        != list(ADAPTER.STRENGTH_FIRST_SELECTION_MODEL_ORDER)
    ):
        raise ValueError(
            "strength-first selection report requires stable plus exact three seeds"
        )
    stable_identity = registry["enrollments"]["stable_checkpoint"]
    stable_model = _exact_dict(
        models[0],
        _MODEL_FIELDS,
        "strength-first selection stable model",
    )
    stable_checkpoint = _exact_dict(
        stable_model["checkpoint"],
        {"bytes", "sha256", "epoch"},
        "strength-first selection stable checkpoint",
    )
    if (
        stable_checkpoint
        != {
            "bytes": stable_identity["bytes"],
            "sha256": stable_identity["sha256"],
            "epoch": 27,
        }
        or stable_model["k_sigmoid"] != 600.0
        or stable_model["production_k_int"] != 600
    ):
        raise ValueError("strength-first stable evaluation identity mismatch")
    stable_float, stable_int16 = _model_metrics(
        stable_model,
        "strength-first selection stable",
    )

    runs = []
    preflight_runs = preflight_projection["runs"]
    for index, (model_value, run) in enumerate(zip(models[1:], preflight_runs)):
        model = _exact_dict(
            model_value,
            _MODEL_FIELDS,
            f"strength-first selection candidate {index}",
        )
        checkpoint = _exact_dict(
            model["checkpoint"],
            {"bytes", "sha256", "epoch"},
            f"strength-first selection candidate {index} checkpoint",
        )
        expected_checkpoint = run["checkpoint"]
        if (
            model["name"] != run["slot_id"]
            or checkpoint
            != {
                "bytes": expected_checkpoint["bytes"],
                "sha256": expected_checkpoint["sha256"],
                "epoch": 20,
            }
            or model["k_sigmoid"] != 600.0
            or model["production_k_int"] != 600
        ):
            raise ValueError(
                f"strength-first selection candidate {index} identity mismatch"
            )
        floating, quantized = _model_metrics(
            model,
            f"strength-first selection candidate {index}",
        )
        gate_metrics = {
            "float": {
                field: floating[field]
                for field in (
                    "within_parent_pair_accuracy",
                    "teacher_top1_accuracy",
                    "value_mae_cp",
                )
            },
            "int16": {
                field: quantized[field]
                for field in (
                    "within_parent_pair_accuracy",
                    "teacher_top1_accuracy",
                    "value_mae_cp",
                )
            },
        }
        stable_gate_metrics = {
            field: stable_int16[field]
            for field in (
                "within_parent_pair_accuracy",
                "teacher_top1_accuracy",
                "value_mae_cp",
            )
        }
        gates = SIBLING.selection_gate_results(
            gate_metrics["float"],
            gate_metrics["int16"],
            stable_gate_metrics,
        )
        if (
            type(gates) is not dict
            or set(gates) != {"checks", "passed"}
            or type(gates["checks"]) is not list
            or len(gates["checks"]) != 4
            or type(gates["passed"]) is not bool
        ):
            raise ValueError("generic selection gate result is invalid")
        runs.append(
            {
                "slot_id": run["slot_id"],
                "seed": run["seed"],
                "result": copy.deepcopy(run["result"]),
                "checkpoint": copy.deepcopy(run["checkpoint"]),
                "float": floating,
                "int16": quantized,
                "gates": copy.deepcopy(gates),
            }
        )
    ranked = sorted(runs, key=_selection_key)
    representative = ranked[1]
    seeds_passing = sum(run["gates"]["passed"] for run in runs)
    all_delta_gates = all(
        run["gates"]["checks"][2]["passed"] and run["gates"]["checks"][3]["passed"]
        for run in runs
    )
    family_gate = {
        "representative_passed_all_four": representative["gates"]["passed"],
        "seeds_passing_all_four": seeds_passing,
        "minimum_seeds_passing_all_four": 2,
        "minimum_seed_count_passed": seeds_passing >= 2,
        "all_seeds_passed_both_quantization_delta_gates": all_delta_gates,
        "passed": (
            representative["gates"]["passed"] and seeds_passing >= 2 and all_delta_gates
        ),
    }
    if family_gate["passed"] is not True:
        raise StrengthFirstSelectionGateFailed(
            "strength-first fresh-selection static family gate failed"
        )
    selected = representative
    return {
        "schema": STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA,
        "status": STRENGTH_FIRST_SELECTION_RECEIPT_STATUS,
        "training_plan": copy.deepcopy(registry["enrollments"]["training_plan"]),
        "checkpoint_preflight": {
            "sha256": registry["enrollments"]["checkpoint_preflight_sha256"],
            "training_pipeline": copy.deepcopy(
                preflight_projection["training_pipeline"]
            ),
            "all_three_strict_loaded_before_teacher_read": True,
        },
        "selection_teacher": {
            "run_fingerprint": registry["enrollments"][
                "selection_teacher_run_fingerprint"
            ],
            "authority": copy.deepcopy(
                registry["enrollments"]["selection_teacher_authority"]
            ),
            "manifest": copy.deepcopy(
                registry["enrollments"]["selection_teacher_manifest"]
            ),
            "result": copy.deepcopy(
                registry["enrollments"]["selection_teacher_result"]
            ),
            "dataset": copy.deepcopy(dataset),
            "completion": copy.deepcopy(completion),
        },
        "stable": {
            "checkpoint": copy.deepcopy(stable_identity),
            "float": stable_float,
            "int16": stable_int16,
        },
        "runs": runs,
        "selection_metric_order": copy.deepcopy(
            FRESH.FRESH_QAT_REQUIRED_SELECTION["metric_order"]
        ),
        "ranked_seed_order": [run["seed"] for run in ranked],
        "representative_seed": selected["seed"],
        "selected": {
            "slot_id": selected["slot_id"],
            "seed": selected["seed"],
            "checkpoint": copy.deepcopy(selected["checkpoint"]),
        },
        "family_gate": family_gate,
        "evaluation": {
            "schema": report["schema"],
            "dataset": copy.deepcopy(data),
            "evaluation_count_per_model": 1,
            "max_workers": execution["requested_max_workers"],
            "network_requests": 0,
        },
        "boundary": copy.deepcopy(_RECEIPT_BOUNDARY),
    }


def _resolved_home_path(home_root: Path, relative: str) -> str:
    expected = home_root / relative
    absolute = os.path.abspath(expected)
    if os.path.realpath(absolute) != absolute:
        raise ValueError(f"fixed private path is not canonical: {relative}")
    return absolute


def _artifact_unchanged(
    path: str,
    identity: Mapping[str, Any],
    dependencies: _SelectionDependencies,
    label: str,
) -> None:
    observed = dependencies.fingerprint(path)
    if (
        type(observed) is not dict
        or observed.get("bytes") != identity["bytes"]
        or observed.get("sha256") != identity["sha256"]
    ):
        raise ValueError(f"{label} changed during selection evaluation")


def _execute_ready_selection(
    preflight_value: Mapping[str, Any],
    *,
    registry: Mapping[str, Any],
    origin_registry_identity: Mapping[str, Any],
    repo_root: Path,
    home_root: Path,
    dependencies: _SelectionDependencies,
    tracked_snapshots: list[tuple[str, bytes]],
) -> dict[str, Any]:
    _preflight, projection = _validate_preflight(
        preflight_value,
        registry=registry,
        repo_root=repo_root,
    )
    enrollment = registry["enrollments"]
    private_paths = {
        name: _resolved_home_path(home_root, _FIXED_PATHS[name])
        for name in (
            "selection_source",
            "selection_teacher_authority",
            "selection_teacher_manifest",
            "selection_teacher_result",
            "selection_teacher_work",
            "selection_dataset",
            "stable_checkpoint",
            "selection_evaluation_report",
            "selection_receipt",
            "selection_publication_result",
        )
    }
    authority_raw = _read_registered(
        private_paths["selection_teacher_authority"],
        enrollment["selection_teacher_authority"],
        dependencies,
        "selection teacher authority",
    )
    manifest_raw = _read_registered(
        private_paths["selection_teacher_manifest"],
        enrollment["selection_teacher_manifest"],
        dependencies,
        "selection teacher manifest",
    )
    result_raw = _read_registered(
        private_paths["selection_teacher_result"],
        enrollment["selection_teacher_result"],
        dependencies,
        "selection teacher result",
    )
    completion, generation_run_fingerprint = _validate_teacher_documents(
        authority=_strict_json(authority_raw, "selection teacher authority"),
        manifest=_strict_json(manifest_raw, "selection teacher manifest"),
        result=_strict_json(result_raw, "selection teacher result"),
        registry=registry,
    )
    dependencies.validate_parent_accounting(
        source_path=private_paths["selection_source"],
        source_identity=_SELECTION_SOURCE,
        work_path=private_paths["selection_teacher_work"],
        work_identity=enrollment["selection_teacher_work"],
        dataset_path=private_paths["selection_dataset"],
        dataset_identity=enrollment["selection_dataset"],
        completion=completion,
        generation_run_fingerprint=generation_run_fingerprint,
    )
    for name in (
        "selection_source",
        "selection_teacher_work",
        "selection_dataset",
        "stable_checkpoint",
    ):
        expected_identity = (
            _SELECTION_SOURCE if name == "selection_source" else enrollment[name]
        )
        _artifact_unchanged(
            private_paths[name],
            expected_identity,
            dependencies,
            name.replace("_", " "),
        )
    for run in projection["runs"]:
        for artifact_name in ("result", "checkpoint"):
            artifact = run[artifact_name]
            _artifact_unchanged(
                str(repo_root / artifact["path"]),
                artifact,
                dependencies,
                f"seed {run['seed']} {artifact_name}",
            )

    checkpoint_specs = [
        {
            "name": "stable",
            "path": private_paths["stable_checkpoint"],
            "bytes": enrollment["stable_checkpoint"]["bytes"],
            "sha256": enrollment["stable_checkpoint"]["sha256"],
            "epoch": 27,
        }
    ] + [
        {
            "name": run["slot_id"],
            "path": str(repo_root / run["checkpoint"]["path"]),
            "bytes": run["checkpoint"]["bytes"],
            "sha256": run["checkpoint"]["sha256"],
            "epoch": 20,
        }
        for run in projection["runs"]
    ]
    if enrollment["stable_checkpoint"]["sha256"] in {
        spec["sha256"] for spec in checkpoint_specs[1:]
    }:
        raise ValueError(
            "stable and strength-first candidate checkpoint identities overlap"
        )
    report = dependencies.evaluate(
        data_path=private_paths["selection_dataset"],
        dataset_identity={
            "bytes": enrollment["selection_dataset"]["bytes"],
            "sha256": enrollment["selection_dataset"]["sha256"],
        },
        checkpoint_specs=checkpoint_specs,
        expected_records=completion["dataset_records"],
        expected_parents=completion["emitted_parent_groups"],
        max_workers=_REGISTRY_BOUNDARY["max_workers"],
    )
    receipt = _validate_report_and_build_receipt(
        report,
        registry=registry,
        preflight_projection=projection,
        completion=completion,
    )

    for name in (
        "selection_source",
        "selection_teacher_authority",
        "selection_teacher_manifest",
        "selection_teacher_result",
        "selection_teacher_work",
        "selection_dataset",
        "stable_checkpoint",
    ):
        expected_identity = (
            _SELECTION_SOURCE if name == "selection_source" else enrollment[name]
        )
        _artifact_unchanged(
            private_paths[name],
            expected_identity,
            dependencies,
            name.replace("_", " "),
        )
    for run in projection["runs"]:
        for artifact_name in ("result", "checkpoint"):
            artifact = run[artifact_name]
            _artifact_unchanged(
                str(repo_root / artifact["path"]),
                artifact,
                dependencies,
                f"seed {run['seed']} {artifact_name}",
            )
    for path, raw in tracked_snapshots:
        if dependencies.read_bytes(path) != raw:
            raise ValueError(
                "tracked selection input changed during selection evaluation"
            )
        dependencies.verify_tracked(path, raw)
    report_raw = _canonical_json_bytes(dict(report))
    report_identity = {
        "path": STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_PATH,
        "bytes": len(report_raw),
        "sha256": hashlib.sha256(report_raw).hexdigest(),
        "schema": ADAPTER.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_SCHEMA,
    }
    receipt_raw = _canonical_json_bytes(receipt)
    receipt_identity = {
        "path": STRENGTH_FIRST_SELECTION_RECEIPT_PATH,
        "bytes": len(receipt_raw),
        "sha256": hashlib.sha256(receipt_raw).hexdigest(),
        "schema": STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA,
    }
    publication_result = {
        "schema": STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_SCHEMA,
        "status": STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_STATUS,
        "evaluation_origin_registry": copy.deepcopy(origin_registry_identity),
        "evaluation_report": copy.deepcopy(report_identity),
        "selection_receipt": copy.deepcopy(receipt_identity),
        "selected_seed": receipt["selected"]["seed"],
        "selected_checkpoint": copy.deepcopy(receipt["selected"]["checkpoint"]),
        "boundary": copy.deepcopy(_PUBLICATION_RESULT_BOUNDARY),
    }
    publication_result_raw = _canonical_json_bytes(publication_result)
    publication_result_identity = {
        "path": STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_PATH,
        "bytes": len(publication_result_raw),
        "sha256": hashlib.sha256(publication_result_raw).hexdigest(),
        "schema": STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_SCHEMA,
    }
    published_report = dependencies.publish(
        private_paths["selection_evaluation_report"],
        report_raw,
        ADAPTER.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_SCHEMA,
    )
    published_receipt = dependencies.publish(
        private_paths["selection_receipt"],
        receipt_raw,
        STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA,
    )
    # This is the sole completion marker and is always committed last.
    published_result = dependencies.publish(
        private_paths["selection_publication_result"],
        publication_result_raw,
        STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_SCHEMA,
    )
    if (
        not _typed_equal(published_report, report_identity)
        or not _typed_equal(published_receipt, receipt_identity)
        or not _typed_equal(published_result, publication_result_identity)
    ):
        raise ValueError("selection publication identity mismatch")
    return {
        "evaluation_report": report_identity,
        "receipt": receipt,
        "publication": receipt_identity,
        "completion": publication_result_identity,
    }


def _run_strength_first_selection_evaluator(
    *,
    repo_root: str,
    home_root: str,
    dependencies: _SelectionDependencies,
) -> dict[str, Any]:
    """Identical closed/READY composition used by production and hermetic tests."""

    root = Path(repo_root).resolve()
    home = Path(home_root).expanduser().resolve()
    registry_path = root / STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
    registry_raw = dependencies.read_bytes(str(registry_path))
    registry = _strict_json(registry_raw, "selection evaluator registry")
    registry, ready = _validate_registry(registry)
    dependencies.verify_tracked(str(registry_path), registry_raw)
    if registry["status"] == STRENGTH_FIRST_SELECTION_PUBLICATION_ENROLLED_STATUS:
        raise StrengthFirstSelectionBlocked("selection publication is already enrolled")
    origin_registry_canonical_raw = _canonical_json_bytes(registry)
    origin_registry_identity = {
        "path": STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH,
        "bytes": len(origin_registry_canonical_raw),
        "sha256": hashlib.sha256(origin_registry_canonical_raw).hexdigest(),
        "schema": STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_SCHEMA,
    }
    tracked_snapshots = [(str(registry_path), registry_raw)]
    for name, identity in registry["protocol"].items():
        if name == "fresh_selection_source":
            continue
        raw = _validate_protocol_file(
            root,
            identity,
            dependencies,
            f"selection evaluator protocol {name}",
        )
        tracked_snapshots.append((str(root / identity["path"]), raw))
    if not ready:
        raise StrengthFirstSelectionBlocked(
            "selection evaluator registry remains data-only closed"
        )

    for name, identity in registry["implementation"].items():
        path = root / identity["path"]
        raw = _read_registered(
            str(path),
            identity,
            dependencies,
            f"selection evaluator implementation {name}",
        )
        dependencies.verify_tracked(str(path), raw)
        tracked_snapshots.append((str(path), raw))
    for name in ("training_plan", "selection_preflight_registry"):
        identity = registry["enrollments"][name]
        path = root / identity["path"]
        raw = _read_registered(
            str(path),
            identity,
            dependencies,
            f"selection evaluator {name}",
        )
        dependencies.verify_tracked(str(path), raw)
        tracked_snapshots.append((str(path), raw))
        if name == "training_plan":
            plan = _strict_json(raw, "strength-first selection training plan")
            dependencies.validate_plan(plan)
        elif (
            _strict_json(raw, "strength-first selection preflight registry").get(
                "schema"
            )
            != PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_SCHEMA
        ):
            raise ValueError("strength-first selection preflight registry drifted")
    return dependencies.claim_preflight(
        lambda preflight: _execute_ready_selection(
            preflight,
            registry=registry,
            origin_registry_identity=origin_registry_identity,
            repo_root=root,
            home_root=home,
            dependencies=dependencies,
            tracked_snapshots=tracked_snapshots,
        )
    )


def _file_fingerprint(path: str) -> dict[str, Any]:
    digest = hashlib.sha256()
    try:
        before = os.lstat(path)
        if not stat.S_ISREG(before.st_mode) or os.path.realpath(
            path
        ) != os.path.abspath(path):
            raise ValueError("selection artifact must be a canonical regular file")
        with open(path, "rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
        after = os.lstat(path)
    except OSError as error:
        raise ValueError("selection artifact cannot be fingerprinted") from error
    before_identity = (
        before.st_dev,
        before.st_ino,
        before.st_mode,
        before.st_size,
        before.st_mtime_ns,
        before.st_ctime_ns,
        before.st_nlink,
    )
    after_identity = (
        after.st_dev,
        after.st_ino,
        after.st_mode,
        after.st_size,
        after.st_mtime_ns,
        after.st_ctime_ns,
        after.st_nlink,
    )
    if before_identity != after_identity:
        raise ValueError("selection artifact changed while being fingerprinted")
    return {"bytes": before.st_size, "sha256": digest.hexdigest()}


def _publish_artifact_exclusive(
    path: str,
    raw: bytes,
    schema: str,
) -> dict[str, Any]:
    if type(raw) is not bytes or not raw:
        raise ValueError("selection publication bytes are empty")
    expected_by_schema = {
        (
            ADAPTER.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_SCHEMA
        ): STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_PATH,
        (
            STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA
        ): STRENGTH_FIRST_SELECTION_RECEIPT_PATH,
        (
            STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_SCHEMA
        ): STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_PATH,
    }
    relative = expected_by_schema.get(schema)
    if relative is None or not os.path.abspath(path).endswith(
        f"{os.sep}{relative.replace('/', os.sep)}"
    ):
        raise ValueError("selection publication fixed path/schema mismatch")
    value = _strict_json(raw, "selection publication")
    if value.get("schema") != schema or _canonical_json_bytes(value) != raw:
        raise ValueError("selection publication schema or canonical bytes mismatch")
    target = os.path.abspath(path)
    parent = os.path.dirname(target)
    if os.path.realpath(target) != target or not os.path.isdir(parent):
        raise ValueError("selection publication target is not fixed")
    parent_stat = os.lstat(parent)
    if (
        not stat.S_ISDIR(parent_stat.st_mode)
        or parent_stat.st_uid != os.geteuid()
        or stat.S_IMODE(parent_stat.st_mode) != 0o700
    ):
        raise ValueError("selection publication directory must be current-user 0700")
    if os.path.lexists(target):
        raise ValueError("refusing to overwrite existing selection publication")

    descriptor, temporary = tempfile.mkstemp(
        prefix=f".{Path(path).name}.",
        suffix=".tmp",
        dir=parent,
    )
    installed = False
    try:
        os.fchmod(descriptor, 0o600)
        output = os.fdopen(descriptor, "wb", closefd=True)
        descriptor = -1
        with output:
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
        try:
            os.link(temporary, target, follow_symlinks=False)
        except FileExistsError as error:
            raise ValueError(
                "refusing to overwrite existing selection publication"
            ) from error
        installed = True
        os.unlink(temporary)
        temporary = ""
        directory_fd = os.open(parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        final_stat = os.lstat(target)
        if (
            not stat.S_ISREG(final_stat.st_mode)
            or stat.S_IMODE(final_stat.st_mode) != 0o600
            or final_stat.st_uid != os.geteuid()
            or final_stat.st_nlink != 1
            or Path(target).read_bytes() != raw
        ):
            raise ValueError("published selection artifact failed revalidation")
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        if temporary:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass
        if installed and not os.path.isfile(target):
            raise ValueError("selection publication was lost")
    return {
        "path": relative,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": schema,
    }


def _publish_receipt_exclusive(path: str, raw: bytes) -> dict[str, Any]:
    """Backward-compatible focused seam for the receipt-only publisher test."""

    return _publish_artifact_exclusive(
        path,
        raw,
        STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA,
    )


def _git_head(repo_root: str) -> str:
    try:
        raw = subprocess.run(
            [
                "/usr/bin/git",
                "--no-replace-objects",
                "--no-optional-locks",
                "rev-parse",
                "--verify",
                "HEAD^{commit}",
            ],
            cwd=repo_root,
            env={
                "PATH": "/usr/bin:/bin",
                "HOME": "/dev/null",
                "GIT_CONFIG_NOSYSTEM": "1",
                "GIT_CONFIG_GLOBAL": "/dev/null",
                "GIT_CONFIG_SYSTEM": "/dev/null",
                "GIT_OPTIONAL_LOCKS": "0",
                "GIT_TERMINAL_PROMPT": "0",
                "LC_ALL": "C",
                "LANG": "C",
            },
            check=True,
            capture_output=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError) as error:
        raise ValueError(
            "cannot determine exact selection evaluator revision"
        ) from error
    try:
        revision = raw.decode("ascii").strip()
    except UnicodeError as error:
        raise ValueError("selection evaluator revision is not ASCII") from error
    if _GIT_REVISION_RE.fullmatch(revision) is None:
        raise ValueError("selection evaluator revision is invalid")
    return revision


def run_strength_first_qat_selection_evaluator() -> dict[str, Any]:
    """Run the argumentless fixed local lane, or stop before sensitive reads."""

    root = os.path.realpath(Path(__file__).resolve().parent.parent)
    home = os.path.realpath(Path.home())
    audit_revision = _git_head(root)

    def claim_preflight(callback):
        receipt = PREFLIGHT.preflight_strength_first_qat_selection(
            audit_revision=audit_revision,
        )
        return PREFLIGHT.call_strength_first_selection_reader(receipt, callback)

    dependencies = _SelectionDependencies(
        read_bytes=lambda path: Path(path).read_bytes(),
        fingerprint=_file_fingerprint,
        verify_tracked=lambda path, raw: _verify_tracked_file(
            path,
            audit_revision,
            raw,
        ),
        claim_preflight=claim_preflight,
        validate_plan=BRIDGE.validate_strength_first_qat_training_plan_data,
        validate_parent_accounting=lambda **kwargs: (
            _validate_selection_parent_accounting_paths(
                read_bytes=lambda path: Path(path).read_bytes(),
                **kwargs,
            )
        ),
        evaluate=ADAPTER.evaluate_strength_first_selection,
        publish=_publish_artifact_exclusive,
    )
    return _run_strength_first_selection_evaluator(
        repo_root=root,
        home_root=home,
        dependencies=dependencies,
    )


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        reason = "arguments-forbidden"
    else:
        try:
            result = run_strength_first_qat_selection_evaluator()
        except StrengthFirstSelectionBlocked:
            reason = "exact-selection-inputs-not-ready"
        except StrengthFirstSelectionGateFailed:
            reason = "static-family-gate-failed"
        except (OSError, ValueError) as error:
            print(f"[strength-first-selection] STOP: {error}", file=sys.stderr)
            return 1
        else:
            receipt = result["receipt"]
            print(
                json.dumps(
                    {
                        "schema": STRENGTH_FIRST_SELECTION_EVALUATOR_CLI_SCHEMA,
                        "status": "PASS",
                        "selected_seed": receipt["selected"]["seed"],
                        "evaluation_report": result["evaluation_report"],
                        "receipt": result["publication"],
                        "publication_result": result["completion"],
                        "final_holdout_label_reads": 0,
                        "live_weights_changed": False,
                    },
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
            return 0
    print(
        json.dumps(
            {
                "schema": STRENGTH_FIRST_SELECTION_EVALUATOR_CLI_SCHEMA,
                "status": "STOP",
                "reason": reason,
                "selection_teacher_artifacts_read": 0,
                "candidate_evaluations": 0,
                "selection_receipts_emitted": 0,
                "final_holdout_label_reads": 0,
                "live_weights_changed": False,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 2


__all__ = [
    "STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA",
    "STRENGTH_FIRST_SELECTION_EVALUATOR_BLOCKED_STATUS",
    "STRENGTH_FIRST_SELECTION_EVALUATOR_EVIDENCE_SCHEMA",
    "STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS",
    "STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH",
    "STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_SCHEMA",
    "STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_PATH",
    "STRENGTH_FIRST_SELECTION_PUBLICATION_ENROLLED_STATUS",
    "STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_PATH",
    "STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_SCHEMA",
    "STRENGTH_FIRST_SELECTION_TEACHER_AUTHORITY_SCHEMA",
    "StrengthFirstSelectionBlocked",
    "StrengthFirstSelectionGateFailed",
    "run_strength_first_qat_selection_evaluator",
    "validate_strength_first_selection_evaluator_registry_data",
]


if __name__ == "__main__":
    raise SystemExit(main())
