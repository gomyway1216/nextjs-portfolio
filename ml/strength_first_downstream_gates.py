"""Fail-closed receipts between strength-first selection and formal A/B.

The checked-in registry intentionally contains no real candidate or evaluation
identity.  The argumentless production entry therefore validates that closed
state and stops before any candidate, holdout, retention, regression, or
browser reader can run.

The deterministic core in this module defines the four local receipt contracts
that the production composition may issue only
after consuming the branded authorization supplied by the candidate-selection
lane and one-shot observations supplied by evidence-verifying evaluators.
Stored receipts can be reconstructed only from a separately branded,
registry-bound evidence bundle. No plain JSON claim can unlock these gates.
Passing these local receipts does not claim browser/Worker parity and cannot
authorize formal A/B enrollment.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
import copy
import hashlib
import json
import math
from pathlib import Path
from pathlib import PurePosixPath
import re
import sys
import threading
import weakref
from typing import Any

from formal_paired_ab_protocol import (
    FRESH_SIBLING_PLAN_BYTES,
    FRESH_SIBLING_PLAN_PATH,
    FRESH_SIBLING_PLAN_SCHEMA,
    FRESH_SIBLING_PLAN_SHA256,
)
from fresh_qat_protocol import FRESH_QAT_REQUIRED_SELECTION
from qat_protocol import QAT_FINAL_CHECKPOINT_SCHEMA
import sibling_selection_protocol as SIBLING_SELECTION
from strength_first_qat_training_bridge import (
    STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
    STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
    STRENGTH_FIRST_QAT_RUN_ROOT,
    STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA,
)


DOWNSTREAM_REGISTRY_SCHEMA = (
    "shogi-floodgate-strength-first-downstream-gates-registry-v1"
)
DOWNSTREAM_REGISTRY_RELATIVE_PATH = (
    "ml/protocols/" "floodgate-q1-2026-strength-first-downstream-gates-registry.json"
)
DOWNSTREAM_BLOCKED_STATUS = (
    "awaiting-branded-candidate-selection-and-exact-downstream-inputs"
)
DOWNSTREAM_READY_STATUS = (
    "branded-candidate-selection-and-exact-downstream-inputs-ready"
)
FINAL_HOLDOUT_RECEIPT_SCHEMA = "shogi-floodgate-strength-first-final-holdout-receipt-v1"
RETENTION_RECEIPT_SCHEMA = "shogi-floodgate-strength-first-retention-receipt-v1"
KNOWN_REGRESSION_RECEIPT_SCHEMA = (
    "shogi-floodgate-strength-first-known-regression-receipt-v1"
)
DOWNSTREAM_RESULT_SCHEMA = "shogi-floodgate-strength-first-downstream-gates-result-v1"
DOWNSTREAM_CLI_RECEIPT_SCHEMA = (
    "shogi-floodgate-strength-first-downstream-gates-cli-receipt-v1"
)
DOWNSTREAM_EVIDENCE_BUNDLE_SCHEMA = (
    "shogi-floodgate-strength-first-verified-evidence-bundle-v1"
)
STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA = (
    "shogi-floodgate-strength-first-three-seed-candidate-selection-receipt-v1"
)
DOWNSTREAM_REGISTRY_CANONICAL_IDENTITY_SCHEMA = (
    "shogi-floodgate-strength-first-downstream-registry-canonical-identity-v1"
)
_REGISTRY_CANONICALIZATION = "utf8-json-sort-keys-compact-lf-v1"
INT16_WEIGHTS_IDENTITY_SCHEMA = "shogi-int16-nnue-weights-bin-v1"
FRESH_FINAL_HOLDOUT_IDENTITY_SCHEMA = (
    "shogi-floodgate-strength-first-fresh-final-holdout-v1"
)
LEGACY_FINAL_HOLDOUT_IDENTITY_SCHEMA = (
    "shogi-floodgate-strength-first-legacy-final-holdout-v1"
)
GENERAL_RETENTION_IDENTITY_SCHEMA = (
    "shogi-floodgate-strength-first-general-retention-v1"
)
OPENING_RETENTION_IDENTITY_SCHEMA = (
    "shogi-floodgate-strength-first-opening-retention-v1"
)
KNOWN_REGRESSION_FIXTURE_IDENTITY_SCHEMA = (
    "shogi-floodgate-strength-first-known-regression-fixture-v1"
)
PRODUCTION_WASM_IDENTITY_SCHEMA = "shogi-floodgate-strength-first-production-wasm-v1"
SELECTION_TEACHER_AUTHORITY_IDENTITY_SCHEMA = (
    "shogi-floodgate-strength-first-selection-teacher-authority-v1"
)
SELECTION_TEACHER_MANIFEST_IDENTITY_SCHEMA = (
    "shogi-floodgate-strength-first-selection-teacher-manifest-v1"
)
SELECTION_TEACHER_RESULT_IDENTITY_SCHEMA = (
    "shogi-floodgate-strength-first-selection-teacher-result-v1"
)
SELECTION_DATASET_IDENTITY_SCHEMA = (
    "canonical-shogi-sibling-v1-jsonl-one-lf-per-row"
)
SELECTION_PREFLIGHT_SCHEMA = (
    "shogi-floodgate-strength-first-qat-selection-preflight-v1"
)
SELECTION_EVALUATION_REPORT_SCHEMA = (
    "shogi-floodgate-strength-first-selection-evaluation-report-v1"
)
CHECKPOINT_WEIGHT_EXPORT_CONTRACT_SCHEMA = (
    "shogi-floodgate-strength-first-checkpoint-weight-export-contract-v1"
)
_EXPORT_WEIGHTS_SOURCE_IDENTITY = {
    "path": "ml/export-weights.py",
    "bytes": 8_794,
    "sha256": ("954844bf646932dae21a689c521ca68cf94f106b25f6340f4311bf4b28e797b0"),
    "schema": "shogi-production-int16-export-source-v1",
}

_STRENGTH_FIRST_AMENDMENT_IDENTITY = {
    "path": ("ml/protocols/" "floodgate-q1-2026-strength-first-teacher-amendment.json"),
    "bytes": 5_123,
    "sha256": ("7bb1a6ef3116f81f6e40ea1440f40b08751e96087eadc018b48ab1d4dd910e7e"),
    "schema": "shogi-floodgate-q1-2026-strength-first-teacher-amendment-v1",
}
_STRENGTH_FIRST_V8_AMENDMENT_IDENTITY = {
    "path": (
        "ml/protocols/"
        "floodgate-q1-2026-strength-first-v8-hash-recovery-amendment.json"
    ),
    "bytes": 7_583,
    "sha256": ("cbfd73205e017673f64ef39bb95c7925ed7bf7a4fb9b061969ed85939d09d5a5"),
    "schema": ("shogi-floodgate-q1-2026-strength-first-v8-hash-recovery-amendment-v1"),
}
_BASE_PLAN_IDENTITY = {
    "path": FRESH_SIBLING_PLAN_PATH,
    "bytes": FRESH_SIBLING_PLAN_BYTES,
    "sha256": FRESH_SIBLING_PLAN_SHA256,
    "schema": FRESH_SIBLING_PLAN_SCHEMA,
}
_ENROLLMENT_FIELDS = {
    "candidate_selection_receipt",
    "candidate_selection_training_plan",
    "candidate_selection_checkpoint_preflight_sha256",
    "candidate_selection_teacher_run_fingerprint",
    "candidate_selection_teacher_authority",
    "candidate_selection_teacher_manifest",
    "candidate_selection_teacher_result",
    "candidate_selection_dataset",
    "candidate_checkpoint",
    "stable_checkpoint",
    "candidate_weights",
    "stable_weights",
    "fresh_final_holdout",
    "legacy_final_holdout",
    "general_retention",
    "opening_retention",
    "known_regression_fixture",
    "production_wasm",
    "local_wasm_time_budgets_ms",
}
_GATE_FIELDS = {
    "candidate_selection_receipt_enrolled",
    "candidate_selection_authorization_adapter_pinned",
    "exact_downstream_inputs_enrolled",
    "final_holdout_label_read_authorized",
    "downstream_evaluation_authorized",
    "all_downstream_receipts_verified",
    "formal_ab_enrollment_ready",
    "production_weight_write_authorized",
}
_BOUNDARY = {
    "local_only": True,
    "network": False,
    "aws": False,
    "gcp": False,
    "vercel": False,
    "external_calibration": False,
    "live_weight_write": False,
}
_NONCLAIMS = {
    "candidate_selected": False,
    "final_holdout_label_reads": 0,
    "downstream_receipts_emitted": 0,
    "formal_ab_games": 0,
    "external_calibration_games": 0,
    "strength_improved": False,
    "high_dan_calibrated": False,
    "live_weights_changed": False,
}
_BLOCKED_GATES = {
    "candidate_selection_receipt_enrolled": False,
    "candidate_selection_authorization_adapter_pinned": False,
    "exact_downstream_inputs_enrolled": False,
    "final_holdout_label_read_authorized": False,
    "downstream_evaluation_authorized": False,
    "all_downstream_receipts_verified": False,
    "formal_ab_enrollment_ready": False,
    "production_weight_write_authorized": False,
}
_READY_GATES = {
    "candidate_selection_receipt_enrolled": True,
    "candidate_selection_authorization_adapter_pinned": True,
    "exact_downstream_inputs_enrolled": True,
    "final_holdout_label_read_authorized": True,
    "downstream_evaluation_authorized": True,
    "all_downstream_receipts_verified": False,
    "formal_ab_enrollment_ready": False,
    "production_weight_write_authorized": False,
}
_REGISTRY_FIELDS = {
    "schema",
    "status",
    "protocol",
    "candidate_selection_contract",
    "enrollments",
    "gates",
    "boundary",
    "nonclaims",
}
_CANDIDATE_SELECTION_CONTRACT = {
    "receipt_schema": STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA,
    "training_plan_schema": STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
    "training_result_schema": STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA,
    "checkpoint_schema": STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
    "series": "warm",
    "seeds": [42, 43, 44],
    "run_count": 3,
    "candidate_artifact": "final.pt",
    "selection": copy.deepcopy(FRESH_QAT_REQUIRED_SELECTION),
    "warm_only": True,
    "wcsc36_six_run_receipt_compatible": False,
}
_EVALUATION_ROLES = (
    "fresh_final_holdout",
    "legacy_final_holdout",
    "retention",
    "known_regression",
)
_ROLE_IDENTITY_SCHEMAS = {
    "candidate_selection_receipt": (STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA),
    "candidate_selection_training_plan": (
        STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA
    ),
    "candidate_selection_teacher_authority": (
        SELECTION_TEACHER_AUTHORITY_IDENTITY_SCHEMA
    ),
    "candidate_selection_teacher_manifest": (
        SELECTION_TEACHER_MANIFEST_IDENTITY_SCHEMA
    ),
    "candidate_selection_teacher_result": (
        SELECTION_TEACHER_RESULT_IDENTITY_SCHEMA
    ),
    "candidate_selection_dataset": SELECTION_DATASET_IDENTITY_SCHEMA,
    "candidate_checkpoint": STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
    "stable_checkpoint": QAT_FINAL_CHECKPOINT_SCHEMA,
    "candidate_weights": INT16_WEIGHTS_IDENTITY_SCHEMA,
    "stable_weights": INT16_WEIGHTS_IDENTITY_SCHEMA,
    "fresh_final_holdout": FRESH_FINAL_HOLDOUT_IDENTITY_SCHEMA,
    "legacy_final_holdout": LEGACY_FINAL_HOLDOUT_IDENTITY_SCHEMA,
    "general_retention": GENERAL_RETENTION_IDENTITY_SCHEMA,
    "opening_retention": OPENING_RETENTION_IDENTITY_SCHEMA,
    "known_regression_fixture": KNOWN_REGRESSION_FIXTURE_IDENTITY_SCHEMA,
    "production_wasm": PRODUCTION_WASM_IDENTITY_SCHEMA,
}
_OBSERVATION_SCHEMAS = {
    role: f"shogi-floodgate-strength-first-{role.replace('_', '-')}-observation-v1"
    for role in _EVALUATION_ROLES
}
_EVIDENCE_SCHEMAS = {
    role: f"shogi-floodgate-strength-first-{role.replace('_', '-')}-evidence-v1"
    for role in _EVALUATION_ROLES
}
_OBSERVATION_BODY_FIELDS = {
    "schema",
    "role",
    "selected_seed",
    "measured_inputs",
    "result",
}
_OBSERVATION_FIELDS = _OBSERVATION_BODY_FIELDS | {"evidence"}
_SELECTION_RECEIPT_FIELDS = {
    "schema",
    "status",
    "training_plan",
    "checkpoint_preflight",
    "selection_teacher",
    "stable",
    "runs",
    "selection_metric_order",
    "ranked_seed_order",
    "representative_seed",
    "selected",
    "family_gate",
    "evaluation",
    "boundary",
}
_SELECTION_RECEIPT_STATUS = "complete-static-family-pass-no-holdout-or-live-authority"
_SELECTION_RECEIPT_BOUNDARY = {
    "local_only": True,
    "selection_labels_read": True,
    "final_holdout_read": False,
    "formal_ab_authorized": False,
    "production_promotion_authorized": False,
    "live_weight_write_authorized": False,
}
_SELECTION_METRIC_FIELDS = {
    "value_mae_cp",
    "value_mse_cp2",
    "within_parent_pair_accuracy",
    "teacher_top1_accuracy",
}
_USI_BESTMOVE_RE = re.compile(r"(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])\Z")
_PINNED_READY_REGISTRY_IDENTITY: dict[str, Any] | None = None
_CANDIDATE_AUTHORIZATION_MARKER = object()
_CANDIDATE_AUTHORIZATIONS: weakref.WeakKeyDictionary[
    CandidateSelectionAuthorization, tuple[bytes, bytes]
] = weakref.WeakKeyDictionary()
_CANDIDATE_AUTHORIZATION_LOCK = threading.Lock()
_EVALUATION_OBSERVATION_MARKER = object()
_EVALUATION_OBSERVATIONS: weakref.WeakKeyDictionary[
    VerifiedEvaluationObservation, bytes
] = weakref.WeakKeyDictionary()
_EVALUATION_OBSERVATION_LOCK = threading.Lock()
_EVIDENCE_BUNDLE_MARKER = object()
_EVIDENCE_BUNDLES: weakref.WeakKeyDictionary[
    VerifiedDownstreamEvidenceBundle, tuple[bytes, bytes, bytes]
] = weakref.WeakKeyDictionary()
_EVIDENCE_BUNDLE_LOCK = threading.Lock()


class DownstreamGatesBlocked(RuntimeError):
    """The data-only or candidate-authorization gate is still closed."""


class DownstreamGateFailed(RuntimeError):
    """A preregistered downstream gate failed and later gates must not run."""

    def __init__(self, gate: str):
        self.gate = gate
        super().__init__(f"strength-first downstream gate failed: {gate}")


class CandidateSelectionAuthorization:
    """Opaque one-shot projection; production issuance belongs to lane 1."""

    __slots__ = ("__weakref__",)

    def __init__(self, marker: object):
        if marker is not _CANDIDATE_AUTHORIZATION_MARKER:
            raise TypeError(
                "candidate-selection authorization cannot be constructed externally"
            )


class VerifiedEvaluationObservation:
    """One-shot evaluator output; production issuance belongs to its verifier."""

    __slots__ = ("__weakref__",)

    def __init__(self, marker: object):
        if marker is not _EVALUATION_OBSERVATION_MARKER:
            raise TypeError(
                "verified evaluation observation cannot be constructed externally"
            )

    def to_dict(self) -> dict[str, Any]:
        with _EVALUATION_OBSERVATION_LOCK:
            raw = _EVALUATION_OBSERVATIONS.get(self)
        if raw is None:
            raise ValueError(
                "verified evaluation observation is invalid or already consumed"
            )
        return _strict_json_loads(raw, "verified evaluation observation")


class VerifiedDownstreamEvidenceBundle:
    """One-shot revalidation input; production issuance belongs to evidence IO."""

    __slots__ = ("__weakref__",)

    def __init__(self, marker: object):
        if marker is not _EVIDENCE_BUNDLE_MARKER:
            raise TypeError(
                "verified downstream evidence bundle cannot be constructed externally"
            )

    def to_dict(self) -> dict[str, Any]:
        with _EVIDENCE_BUNDLE_LOCK:
            state = _EVIDENCE_BUNDLES.get(self)
        if state is None:
            raise ValueError(
                "verified downstream evidence bundle is invalid or already consumed"
            )
        return _strict_json_loads(state[2], "verified downstream evidence bundle")


def _exact_dict(value: Any, fields: set[str], label: str) -> dict[str, Any]:
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


def _sha256(value: Any, label: str) -> str:
    if (
        type(value) is not str
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
        or value == "0" * 64
    ):
        raise ValueError(f"{label} is not a non-placeholder lowercase SHA-256")
    return value


def _identity(value: Any, label: str) -> dict[str, Any]:
    identity = _exact_dict(value, {"path", "bytes", "sha256", "schema"}, label)
    raw_path = identity["path"]
    canonical_path = (
        PurePosixPath(raw_path)
        if type(raw_path) is str and "\\" not in raw_path
        else None
    )
    if (
        canonical_path is None
        or not raw_path
        or ":" in raw_path
        or canonical_path.is_absolute()
        or str(canonical_path) != raw_path
        or any(part in ("", ".", "..") for part in canonical_path.parts)
        or type(identity["bytes"]) is not int
        or identity["bytes"] < 1
        or type(identity["schema"]) is not str
        or not identity["schema"]
    ):
        raise ValueError(f"{label} identity is invalid")
    _sha256(identity["sha256"], f"{label} SHA-256")
    return identity


def _metric(value: Any, label: str, *, nonnegative: bool = False) -> float:
    if (
        type(value) not in (int, float)
        or not math.isfinite(value)
        or (nonnegative and value < 0)
    ):
        raise ValueError(f"{label} is not a finite metric")
    return float(value)


def _rate(value: Any, label: str) -> float:
    rate = _metric(value, label)
    if not 0.0 <= rate <= 1.0:
        raise ValueError(f"{label} is outside 0..1")
    return rate


def validate_downstream_registry_data(
    registry: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Validate either the exact closed state or a future fully enrolled state."""

    registry = _exact_dict(registry, _REGISTRY_FIELDS, "downstream registry")
    if registry["schema"] != DOWNSTREAM_REGISTRY_SCHEMA:
        raise ValueError("downstream registry schema mismatch")
    protocol = _exact_dict(
        registry["protocol"],
        {
            "base_plan",
            "strength_first_amendment",
            "strength_first_v8_amendment",
        },
        "downstream protocol",
    )
    if not _typed_equal(protocol["base_plan"], _BASE_PLAN_IDENTITY):
        raise ValueError("downstream base-plan identity mismatch")
    if not _typed_equal(
        protocol["strength_first_amendment"],
        _STRENGTH_FIRST_AMENDMENT_IDENTITY,
    ):
        raise ValueError("downstream strength-first amendment identity mismatch")
    if not _typed_equal(
        protocol["strength_first_v8_amendment"],
        _STRENGTH_FIRST_V8_AMENDMENT_IDENTITY,
    ):
        raise ValueError("downstream strength-first v8 amendment identity mismatch")
    if not _typed_equal(
        registry["candidate_selection_contract"],
        _CANDIDATE_SELECTION_CONTRACT,
    ):
        raise ValueError("downstream candidate-selection contract mismatch")
    enrollments = _exact_dict(
        registry["enrollments"],
        _ENROLLMENT_FIELDS,
        "downstream enrollments",
    )
    gates = _exact_dict(registry["gates"], _GATE_FIELDS, "downstream gates")
    if not _typed_equal(registry["boundary"], _BOUNDARY):
        raise ValueError("downstream local-only boundary mismatch")
    if not _typed_equal(registry["nonclaims"], _NONCLAIMS):
        raise ValueError("downstream nonclaims mismatch")

    if registry["status"] == DOWNSTREAM_BLOCKED_STATUS:
        if any(value is not None for value in enrollments.values()):
            raise ValueError("blocked downstream registry contains an enrollment")
        if not _typed_equal(gates, _BLOCKED_GATES):
            raise ValueError("blocked downstream registry contains an open gate")
        return registry
    if registry["status"] != DOWNSTREAM_READY_STATUS:
        raise ValueError("downstream registry status mismatch")
    enrolled_identities = {}
    for name, expected_schema in _ROLE_IDENTITY_SCHEMAS.items():
        identity = _identity(enrollments[name], f"downstream {name}")
        if identity["schema"] != expected_schema:
            raise ValueError(f"downstream {name} schema mismatch")
        enrolled_identities[name] = identity
    for name in (
        "candidate_selection_checkpoint_preflight_sha256",
        "candidate_selection_teacher_run_fingerprint",
    ):
        _sha256(enrollments[name], f"downstream {name}")
    enrolled_paths = [identity["path"] for identity in enrolled_identities.values()]
    enrolled_hashes = [identity["sha256"] for identity in enrolled_identities.values()]
    if len(set(enrolled_paths)) != len(enrolled_paths) or len(
        set(enrolled_hashes)
    ) != len(enrolled_hashes):
        raise ValueError(
            "downstream role identities must have pairwise-distinct paths "
            "and SHA-256 values"
        )
    budgets = enrollments["local_wasm_time_budgets_ms"]
    if (
        type(budgets) is not list
        or not budgets
        or any(type(value) is not int or value <= 0 for value in budgets)
        or budgets != sorted(set(budgets))
    ):
        raise ValueError("downstream local WASM time budgets are not canonical")
    if not _typed_equal(gates, _READY_GATES):
        raise ValueError("ready downstream registry gates mismatch")
    return registry


def _strict_json_loads(raw: bytes, label: str) -> dict[str, Any]:
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


def _canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    if type(value) is not dict:
        raise ValueError("canonical JSON root must be an exact object")
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")


def _canonical_json_sha256(value: Mapping[str, Any]) -> str:
    return hashlib.sha256(_canonical_json_bytes(value)).hexdigest()


def _remove_exactly_one_final_lf(raw: bytes, label: str) -> bytes:
    if (
        not raw.endswith(b"\n")
        or raw.endswith(b"\n\n")
        or raw.endswith(b"\r\n")
    ):
        raise ValueError(f"{label} must end with exactly one LF")
    return raw.removesuffix(b"\n")


def _registry_identity(raw: bytes) -> dict[str, Any]:
    return {
        "schema": DOWNSTREAM_REGISTRY_CANONICAL_IDENTITY_SCHEMA,
        "registry_schema": DOWNSTREAM_REGISTRY_SCHEMA,
        "canonicalization": _REGISTRY_CANONICALIZATION,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _capture_registry(
    registry: Mapping[str, Any],
) -> tuple[dict[str, Any], bytes, dict[str, Any]]:
    """Capture, validate, and identify one immutable canonical registry."""

    if type(registry) is not dict:
        raise ValueError("downstream registry must be an exact object")
    raw = _canonical_json_bytes(copy.deepcopy(registry))
    snapshot = _strict_json_loads(raw, "captured downstream registry")
    validate_downstream_registry_data(snapshot)
    return snapshot, raw, _registry_identity(raw)


def _load_fixed_registry(repo_root: Path) -> tuple[dict[str, Any], bytes]:
    path = repo_root / DOWNSTREAM_REGISTRY_RELATIVE_PATH
    try:
        raw = path.read_bytes()
    except OSError as error:
        raise ValueError("downstream registry is absent") from error
    registry = _strict_json_loads(raw, "downstream registry")
    validate_downstream_registry_data(registry)
    for name, identity in registry["protocol"].items():
        protocol_path = repo_root / identity["path"]
        try:
            protocol_raw = protocol_path.read_bytes()
        except OSError as error:
            raise ValueError(f"downstream protocol {name} is absent") from error
        if (
            len(protocol_raw) != identity["bytes"]
            or hashlib.sha256(protocol_raw).hexdigest() != identity["sha256"]
        ):
            raise ValueError(f"downstream protocol {name} identity mismatch")
        protocol = _strict_json_loads(
            protocol_raw,
            f"downstream protocol {name}",
        )
        if protocol.get("schema") != identity["schema"]:
            raise ValueError(f"downstream protocol {name} schema mismatch")
    return registry, raw


def _authorization_projection(
    registry: Mapping[str, Any],
    *,
    registry_raw: bytes | None = None,
) -> dict[str, Any]:
    if registry_raw is None:
        registry_raw = _canonical_json_bytes(registry)
    enrollments = registry["enrollments"]
    return {
        "downstream_registry": _registry_identity(registry_raw),
        "selection_receipt": copy.deepcopy(enrollments["candidate_selection_receipt"]),
        "candidate_checkpoint": copy.deepcopy(enrollments["candidate_checkpoint"]),
        "stable_checkpoint": copy.deepcopy(enrollments["stable_checkpoint"]),
        "candidate_weights": copy.deepcopy(enrollments["candidate_weights"]),
        "stable_weights": copy.deepcopy(enrollments["stable_weights"]),
        "selected_seed": 42,
        "static_family_passed": True,
        "final_holdout_label_read_authorized": True,
        "production_weight_write_authorized": False,
    }


def _issue_candidate_selection_authorization_for_tests(
    registry: Mapping[str, Any],
    *,
    selected_seed: int = 42,
) -> CandidateSelectionAuthorization:
    """Test-only issuer; it is not reachable from the production entry."""

    snapshot, registry_raw, _ = _capture_registry(registry)
    if snapshot["status"] != DOWNSTREAM_READY_STATUS:
        raise ValueError("test authorization requires a ready synthetic registry")
    if (
        type(selected_seed) is not int
        or selected_seed not in _CANDIDATE_SELECTION_CONTRACT["seeds"]
    ):
        raise ValueError("selected seed is outside the preregistered grid")
    payload = _authorization_projection(
        snapshot,
        registry_raw=registry_raw,
    )
    payload["selected_seed"] = selected_seed
    payload_raw = _canonical_json_bytes(payload)
    authorization = CandidateSelectionAuthorization(_CANDIDATE_AUTHORIZATION_MARKER)
    with _CANDIDATE_AUTHORIZATION_LOCK:
        _CANDIDATE_AUTHORIZATIONS[authorization] = (
            registry_raw,
            payload_raw,
        )
    return authorization


def _same_artifact_content(
    left: Mapping[str, Any],
    right: Mapping[str, Any],
    *,
    label: str,
) -> None:
    """Require the same artifact while allowing role-specific schema wrappers."""

    left_identity = _identity(left, f"{label} left identity")
    right_identity = _identity(right, f"{label} right identity")
    for field in ("path", "bytes", "sha256"):
        if not _typed_equal(left_identity[field], right_identity[field]):
            raise ValueError(f"{label} {field} mismatch")


def _selection_metrics(value: Any, label: str) -> dict[str, float]:
    metrics = _exact_dict(value, _SELECTION_METRIC_FIELDS, label)
    normalized = {}
    for field in _SELECTION_METRIC_FIELDS:
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


def _selection_rank_key(run: Mapping[str, Any]) -> tuple[Any, ...]:
    metrics = run["int16"]
    return (
        -metrics["within_parent_pair_accuracy"],
        -metrics["teacher_top1_accuracy"],
        metrics["value_mae_cp"],
        run["seed"],
        bytes.fromhex(run["checkpoint"]["sha256"]),
    )


def _validate_enrolled_candidate_selection_receipt(
    receipt: Mapping[str, Any],
    *,
    registry: Mapping[str, Any],
) -> int:
    """Validate the enrolled selection receipt before any holdout read."""

    receipt = _exact_dict(
        receipt,
        _SELECTION_RECEIPT_FIELDS,
        "candidate-selection receipt",
    )
    if (
        receipt["schema"] != STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA
        or receipt["status"] != _SELECTION_RECEIPT_STATUS
    ):
        raise ValueError("candidate-selection receipt status mismatch")
    if not _typed_equal(receipt["boundary"], _SELECTION_RECEIPT_BOUNDARY):
        raise ValueError("candidate-selection receipt boundary mismatch")
    enrollments = registry["enrollments"]
    training_plan = _identity(
        receipt["training_plan"],
        "candidate-selection receipt training plan",
    )
    if not _typed_equal(
        training_plan,
        enrollments["candidate_selection_training_plan"],
    ):
        raise ValueError("candidate-selection training plan identity mismatch")
    checkpoint_preflight = _exact_dict(
        receipt["checkpoint_preflight"],
        {
            "sha256",
            "training_pipeline",
            "all_three_strict_loaded_before_teacher_read",
        },
        "candidate-selection receipt checkpoint preflight",
    )
    pipeline = _exact_dict(
        checkpoint_preflight["training_pipeline"],
        {"source_revision", "tracked_tree_clean"},
        "candidate-selection receipt training pipeline",
    )
    if (
        checkpoint_preflight["sha256"]
        != enrollments["candidate_selection_checkpoint_preflight_sha256"]
        or checkpoint_preflight[
            "all_three_strict_loaded_before_teacher_read"
        ]
        is not True
        or type(pipeline["source_revision"]) is not str
        or re.fullmatch(r"[0-9a-f]{40}", pipeline["source_revision"]) is None
        or pipeline["tracked_tree_clean"] is not True
    ):
        raise ValueError("candidate-selection checkpoint preflight mismatch")
    teacher = _exact_dict(
        receipt["selection_teacher"],
        {
            "run_fingerprint",
            "authority",
            "manifest",
            "result",
            "dataset",
            "completion",
        },
        "candidate-selection receipt teacher",
    )
    for field in ("authority", "manifest", "result", "dataset"):
        expected = enrollments[
            f"candidate_selection_teacher_{field}"
            if field != "dataset"
            else "candidate_selection_dataset"
        ]
        if not _typed_equal(
            _identity(
                teacher[field],
                f"candidate-selection receipt teacher {field}",
            ),
            expected,
        ):
            raise ValueError(
                f"candidate-selection teacher {field} identity mismatch"
            )
    if (
        teacher["run_fingerprint"]
        != enrollments["candidate_selection_teacher_run_fingerprint"]
    ):
        raise ValueError("candidate-selection teacher run fingerprint mismatch")
    completion = _exact_dict(
        teacher["completion"],
        {
            "input_games",
            "input_parents",
            "completed_parents",
            "forced_parents_skipped",
            "forced_skip_reasons",
            "emitted_parent_groups",
            "dataset_records",
            "sealed",
        },
        "candidate-selection teacher completion",
    )
    forced_reasons = _exact_dict(
        completion["forced_skip_reasons"],
        {"fewer_than_two_legal_moves"},
        "candidate-selection teacher forced skip reasons",
    )
    if (
        completion["input_games"] != 200
        or completion["input_parents"] != 4_800
        or completion["completed_parents"] != 4_800
        or type(completion["forced_parents_skipped"]) is not int
        or completion["forced_parents_skipped"] < 0
        or forced_reasons["fewer_than_two_legal_moves"]
        != completion["forced_parents_skipped"]
        or type(completion["emitted_parent_groups"]) is not int
        or completion["emitted_parent_groups"] < 1
        or completion["emitted_parent_groups"]
        + completion["forced_parents_skipped"]
        != 4_800
        or type(completion["dataset_records"]) is not int
        or completion["dataset_records"]
        < 2 * completion["emitted_parent_groups"]
        or completion["sealed"] is not True
    ):
        raise ValueError("candidate-selection teacher completion mismatch")

    selected = _exact_dict(
        receipt["selected"],
        {"slot_id", "seed", "checkpoint"},
        "candidate-selection receipt selected candidate",
    )
    seed = selected["seed"]
    if (
        type(seed) is not int
        or seed not in _CANDIDATE_SELECTION_CONTRACT["seeds"]
        or selected["slot_id"] != f"floodgate-strength-first-int16-aware-seed-{seed}"
        or receipt["representative_seed"] != seed
    ):
        raise ValueError("candidate-selection receipt selected seed mismatch")
    _same_artifact_content(
        selected["checkpoint"],
        registry["enrollments"]["candidate_checkpoint"],
        label="candidate-selection selected checkpoint",
    )

    stable = _exact_dict(
        receipt["stable"],
        {"checkpoint", "float", "int16"},
        "candidate-selection receipt stable",
    )
    _same_artifact_content(
        stable["checkpoint"],
        registry["enrollments"]["stable_checkpoint"],
        label="candidate-selection stable checkpoint",
    )
    _selection_metrics(
        stable["float"],
        "candidate-selection stable float metrics",
    )
    stable_int16 = _selection_metrics(
        stable["int16"],
        "candidate-selection stable int16 metrics",
    )

    raw_runs = receipt["runs"]
    if (
        type(raw_runs) is not list
        or len(raw_runs) != _CANDIDATE_SELECTION_CONTRACT["run_count"]
    ):
        raise ValueError("candidate-selection receipt runs mismatch")
    runs = []
    for index, (raw_run, expected_seed) in enumerate(
        zip(raw_runs, _CANDIDATE_SELECTION_CONTRACT["seeds"])
    ):
        run = _exact_dict(
            raw_run,
            {
                "slot_id",
                "seed",
                "result",
                "checkpoint",
                "float",
                "int16",
                "gates",
            },
            f"candidate-selection receipt run {index}",
        )
        expected_slot = (
            f"floodgate-strength-first-int16-aware-seed-{expected_seed}"
        )
        if (
            type(run["seed"]) is not int
            or run["seed"] != expected_seed
            or run["slot_id"] != expected_slot
        ):
            raise ValueError("candidate-selection receipt run order mismatch")
        result_identity = _identity(
            run["result"],
            f"candidate-selection receipt run {index} result",
        )
        checkpoint_identity = _identity(
            run["checkpoint"],
            f"candidate-selection receipt run {index} checkpoint",
        )
        if (
            result_identity["schema"]
            != STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA
            or checkpoint_identity["schema"]
            != STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA
        ):
            raise ValueError(
                "candidate-selection receipt run artifact schema mismatch"
            )
        floating = _selection_metrics(
            run["float"],
            f"candidate-selection receipt run {index} float",
        )
        quantized = _selection_metrics(
            run["int16"],
            f"candidate-selection receipt run {index} int16",
        )
        expected_gates = SIBLING_SELECTION.selection_gate_results(
            floating,
            quantized,
            stable_int16,
        )
        if not _typed_equal(run["gates"], expected_gates):
            raise ValueError(
                "candidate-selection receipt run gates are not recomputable"
            )
        runs.append(
            {
                **run,
                "float": floating,
                "int16": quantized,
            }
        )
    preflight_projection = {
        "schema": SELECTION_PREFLIGHT_SCHEMA,
        "training_plan": copy.deepcopy(training_plan),
        "training_pipeline": copy.deepcopy(pipeline),
        "runs": [
            {
                "slot_id": run["slot_id"],
                "seed": run["seed"],
                "output": (
                    f"{STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{run['seed']}"
                ),
                "result": copy.deepcopy(run["result"]),
                "checkpoint": copy.deepcopy(run["checkpoint"]),
                "checkpoint_metadata": {
                    "schema": STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
                    "epoch": 20,
                },
            }
            for run in runs
        ],
    }
    preflight_raw = _remove_exactly_one_final_lf(
        _canonical_json_bytes(preflight_projection),
        "candidate-selection checkpoint preflight canonical JSON",
    )
    observed_preflight_sha256 = hashlib.sha256(preflight_raw).hexdigest()
    if observed_preflight_sha256 != checkpoint_preflight["sha256"]:
        raise ValueError(
            "candidate-selection checkpoint preflight is not recomputable"
        )
    selected_runs = [run for run in runs if run.get("seed") == seed]
    if len(selected_runs) != 1:
        raise ValueError("candidate-selection receipt selected run is not unique")
    selected_run = _exact_dict(
        selected_runs[0],
        {"slot_id", "seed", "result", "checkpoint", "float", "int16", "gates"},
        "candidate-selection receipt selected run",
    )
    if selected_run["slot_id"] != selected["slot_id"] or not _typed_equal(
        selected_run["checkpoint"], selected["checkpoint"]
    ):
        raise ValueError("candidate-selection receipt selected run mismatch")

    ranked_runs = sorted(runs, key=_selection_rank_key)
    ranked = receipt["ranked_seed_order"]
    if (
        type(ranked) is not list
        or ranked != [run["seed"] for run in ranked_runs]
        or ranked_runs[1]["seed"] != seed
    ):
        raise ValueError("candidate-selection receipt representative rank mismatch")
    if not _typed_equal(
        receipt["selection_metric_order"],
        _CANDIDATE_SELECTION_CONTRACT["selection"]["metric_order"],
    ):
        raise ValueError("candidate-selection receipt metric order mismatch")

    family = _exact_dict(
        receipt["family_gate"],
        {
            "representative_passed_all_four",
            "seeds_passing_all_four",
            "minimum_seeds_passing_all_four",
            "minimum_seed_count_passed",
            "all_seeds_passed_both_quantization_delta_gates",
            "passed",
        },
        "candidate-selection receipt family gate",
    )
    seeds_passing = sum(run["gates"]["passed"] for run in runs)
    all_delta_gates = all(
        run["gates"]["checks"][2]["passed"]
        and run["gates"]["checks"][3]["passed"]
        for run in runs
    )
    expected_family = {
        "representative_passed_all_four": ranked_runs[1]["gates"]["passed"],
        "seeds_passing_all_four": seeds_passing,
        "minimum_seeds_passing_all_four": 2,
        "minimum_seed_count_passed": seeds_passing >= 2,
        "all_seeds_passed_both_quantization_delta_gates": all_delta_gates,
        "passed": (
            ranked_runs[1]["gates"]["passed"]
            and seeds_passing >= 2
            and all_delta_gates
        ),
    }
    if not _typed_equal(family, expected_family) or family["passed"] is not True:
        raise ValueError("candidate-selection receipt family gate did not pass")

    evaluation = _exact_dict(
        receipt["evaluation"],
        {
            "schema",
            "dataset",
            "evaluation_count_per_model",
            "max_workers",
            "network_requests",
        },
        "candidate-selection receipt evaluation",
    )
    if (
        evaluation["schema"] != SELECTION_EVALUATION_REPORT_SCHEMA
        or evaluation["evaluation_count_per_model"] != 1
        or type(evaluation["max_workers"]) is not int
        or not 1 <= evaluation["max_workers"] <= 2
        or evaluation["network_requests"] != 0
    ):
        raise ValueError("candidate-selection receipt evaluation mismatch")
    evaluation_dataset = _exact_dict(
        evaluation["dataset"],
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
        "candidate-selection receipt evaluation dataset",
    )
    selection_dataset = enrollments["candidate_selection_dataset"]
    if (
        evaluation_dataset["bytes"] != selection_dataset["bytes"]
        or evaluation_dataset["sha256"] != selection_dataset["sha256"]
        or evaluation_dataset["records"] != completion["dataset_records"]
        or evaluation_dataset["parents"]
        != completion["emitted_parent_groups"]
        or type(evaluation_dataset["eligible_pairs"]) is not int
        or evaluation_dataset["eligible_pairs"] < 1
        or evaluation_dataset["pair_min_cp"] != 50.0
        or evaluation_dataset["value_cp_clamp"] != 3_000
        or evaluation_dataset["value_target"] != "clamped_child_cp"
        or evaluation_dataset["ranking_target"]
        != "unclamped_parent_cp_equals_negative_child_cp"
    ):
        raise ValueError("candidate-selection evaluation dataset mismatch")
    return seed


def validate_selection_receipt_against_evaluator_registry(
    receipt: Mapping[str, Any],
    *,
    evaluation_report: Mapping[str, Any],
    replayed_evaluation_report: Mapping[str, Any],
    selection_registry: Mapping[str, Any],
) -> dict[str, Any]:
    """Authenticate a replayed evaluator publication without downstream state.

    A receipt is not its own metric authority. The terminal evaluator registry
    must enroll the report/receipt/completion bundle, and the report must be
    reproduced from the exact dataset plus four checkpoint files before this
    adapter reconstructs the receipt byte-for-byte. This adapter is read-only
    and grants no downstream authorization.
    """

    import strength_first_qat_selection_evaluator as selection_evaluator

    validated = (
        selection_evaluator.validate_strength_first_selection_evaluator_registry_data(
            selection_registry
        )
    )
    if (
        validated["status"]
        != selection_evaluator.STRENGTH_FIRST_SELECTION_PUBLICATION_ENROLLED_STATUS
    ):
        raise ValueError("selection evaluator publication is not enrolled")
    if not _typed_equal(evaluation_report, replayed_evaluation_report):
        raise ValueError(
            "selection evaluation report does not match deterministic replay"
        )
    selected = _exact_dict(
        receipt.get("selected") if isinstance(receipt, Mapping) else None,
        {"slot_id", "seed", "checkpoint"},
        "candidate-selection receipt selected candidate",
    )
    enrollments = validated["enrollments"]
    adapter_registry = {
        "enrollments": {
            "candidate_selection_training_plan": enrollments["training_plan"],
            "candidate_selection_checkpoint_preflight_sha256": enrollments[
                "checkpoint_preflight_sha256"
            ],
            "candidate_selection_teacher_run_fingerprint": enrollments[
                "selection_teacher_run_fingerprint"
            ],
            "candidate_selection_teacher_authority": enrollments[
                "selection_teacher_authority"
            ],
            "candidate_selection_teacher_manifest": enrollments[
                "selection_teacher_manifest"
            ],
            "candidate_selection_teacher_result": enrollments[
                "selection_teacher_result"
            ],
            "candidate_selection_dataset": enrollments["selection_dataset"],
            "candidate_checkpoint": selected["checkpoint"],
            "stable_checkpoint": enrollments["stable_checkpoint"],
        }
    }
    seed = _validate_enrolled_candidate_selection_receipt(
        receipt,
        registry=adapter_registry,
    )
    checkpoint_preflight = receipt["checkpoint_preflight"]
    runs = receipt["runs"]
    preflight_projection = {
        "schema": SELECTION_PREFLIGHT_SCHEMA,
        "training_plan": copy.deepcopy(receipt["training_plan"]),
        "training_pipeline": copy.deepcopy(
            checkpoint_preflight["training_pipeline"]
        ),
        "runs": [
            {
                "slot_id": run["slot_id"],
                "seed": run["seed"],
                "output": (
                    f"{STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{run['seed']}"
                ),
                "result": copy.deepcopy(run["result"]),
                "checkpoint": copy.deepcopy(run["checkpoint"]),
                "checkpoint_metadata": {
                    "schema": STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
                    "epoch": 20,
                },
            }
            for run in runs
        ],
    }
    rebuilt = selection_evaluator._validate_report_and_build_receipt(
        evaluation_report,
        registry=validated,
        preflight_projection=preflight_projection,
        completion=receipt["selection_teacher"]["completion"],
    )
    if not _typed_equal(rebuilt, receipt):
        raise ValueError(
            "selection receipt does not match its enrolled evaluation report"
        )
    checkpoint = _identity(
        selected["checkpoint"],
        "candidate-selection receipt selected checkpoint",
    )
    return {
        "selected_seed": seed,
        "selected_checkpoint": copy.deepcopy(checkpoint),
    }


def _mint_candidate_selection_authorization_from_receipt_bytes(
    *,
    snapshot: Mapping[str, Any],
    registry_raw: bytes,
    receipt_raw: bytes,
) -> CandidateSelectionAuthorization:
    if snapshot["status"] != DOWNSTREAM_READY_STATUS:
        raise ValueError("candidate-selection authorization requires a ready registry")
    if type(receipt_raw) is not bytes or not receipt_raw:
        raise ValueError("candidate-selection receipt bytes are empty")
    enrolled = snapshot["enrollments"]["candidate_selection_receipt"]
    if (
        len(receipt_raw) != enrolled["bytes"]
        or hashlib.sha256(receipt_raw).hexdigest() != enrolled["sha256"]
    ):
        raise ValueError("candidate-selection receipt identity mismatch")
    receipt = _strict_json_loads(receipt_raw, "candidate-selection receipt")
    if _canonical_json_bytes(receipt) != receipt_raw:
        raise ValueError("candidate-selection receipt is not canonical JSON")
    seed = _validate_enrolled_candidate_selection_receipt(
        receipt,
        registry=snapshot,
    )
    payload = _authorization_projection(
        snapshot,
        registry_raw=registry_raw,
    )
    payload["selected_seed"] = seed
    authorization = CandidateSelectionAuthorization(_CANDIDATE_AUTHORIZATION_MARKER)
    with _CANDIDATE_AUTHORIZATION_LOCK:
        _CANDIDATE_AUTHORIZATIONS[authorization] = (
            registry_raw,
            _canonical_json_bytes(payload),
        )
    return authorization


def _issue_candidate_selection_authorization_from_receipt_bytes_for_tests(
    *,
    registry: Mapping[str, Any],
    receipt_raw: bytes,
) -> CandidateSelectionAuthorization:
    """Test-only dependency-injected receipt authenticator."""

    snapshot, registry_raw, _ = _capture_registry(registry)
    return _mint_candidate_selection_authorization_from_receipt_bytes(
        snapshot=snapshot,
        registry_raw=registry_raw,
        receipt_raw=receipt_raw,
    )


def issue_candidate_selection_authorization_from_enrolled_receipt(
) -> CandidateSelectionAuthorization:
    """Authenticate only the receipt enrolled by the code-pinned fixed registry."""

    repo_root = Path(__file__).resolve().parent.parent
    snapshot, tracked_registry_raw = _load_fixed_registry(repo_root)
    if snapshot["status"] != DOWNSTREAM_READY_STATUS:
        raise DownstreamGatesBlocked("fixed downstream registry is not ready")
    if _PINNED_READY_REGISTRY_IDENTITY is None:
        raise DownstreamGatesBlocked("ready downstream registry identity is not code-pinned")
    expected = _PINNED_READY_REGISTRY_IDENTITY
    if (
        len(tracked_registry_raw) != expected["bytes"]
        or hashlib.sha256(tracked_registry_raw).hexdigest() != expected["sha256"]
        or snapshot["schema"] != expected["schema"]
    ):
        raise ValueError("ready downstream registry identity mismatch")

    enrolled = snapshot["enrollments"]["candidate_selection_receipt"]
    candidate_path = repo_root / enrolled["path"]
    try:
        resolved_root = repo_root.resolve(strict=True)
        resolved_path = candidate_path.resolve(strict=True)
        metadata = resolved_path.stat()
    except OSError as error:
        raise ValueError("enrolled candidate-selection receipt is absent") from error
    if (
        resolved_path != candidate_path
        or resolved_path.parent != resolved_root
        and resolved_root not in resolved_path.parents
        or not metadata.is_file()
        or metadata.st_nlink != 1
    ):
        raise ValueError("enrolled candidate-selection receipt path is unsafe")
    try:
        receipt_raw = resolved_path.read_bytes()
    except OSError as error:
        raise ValueError("enrolled candidate-selection receipt is unreadable") from error
    return _mint_candidate_selection_authorization_from_receipt_bytes(
        snapshot=snapshot,
        registry_raw=_canonical_json_bytes(snapshot),
        receipt_raw=receipt_raw,
    )


def _consume_candidate_selection_authorization(
    authorization: CandidateSelectionAuthorization,
) -> tuple[dict[str, Any], dict[str, Any], bytes]:
    if type(authorization) is not CandidateSelectionAuthorization:
        raise ValueError(
            "downstream gates require a branded candidate-selection authorization"
        )
    with _CANDIDATE_AUTHORIZATION_LOCK:
        state = _CANDIDATE_AUTHORIZATIONS.pop(authorization, None)
    if state is None:
        raise ValueError(
            "candidate-selection authorization is invalid or already consumed"
        )
    registry_raw, payload_raw = state
    snapshot = _strict_json_loads(
        registry_raw,
        "candidate authorization registry snapshot",
    )
    validate_downstream_registry_data(snapshot)
    payload = _strict_json_loads(
        payload_raw,
        "candidate-selection authorization",
    )
    selected_seed = payload.get("selected_seed")
    if (
        type(selected_seed) is not int
        or selected_seed not in _CANDIDATE_SELECTION_CONTRACT["seeds"]
    ):
        raise ValueError("candidate-selection authorization seed is invalid")
    expected = _authorization_projection(
        snapshot,
        registry_raw=registry_raw,
    )
    expected["selected_seed"] = selected_seed
    if not _typed_equal(payload, expected):
        raise ValueError(
            "candidate-selection authorization differs from captured registry"
        )
    return payload, snapshot, registry_raw


def _consume_candidate_selection_authorization_for_registry(
    authorization: CandidateSelectionAuthorization,
    registry: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], bytes]:
    candidate, snapshot, registry_raw = _consume_candidate_selection_authorization(
        authorization
    )
    _, supplied_raw, _ = _capture_registry(registry)
    if supplied_raw != registry_raw:
        raise ValueError("candidate authorization registry snapshot mismatch")
    return candidate, snapshot, registry_raw


def _expected_measured_inputs(
    registry: Mapping[str, Any],
    role: str,
) -> dict[str, Any]:
    enrollments = registry["enrollments"]
    common = {
        "downstream_registry": _registry_identity(_canonical_json_bytes(registry)),
        "candidate_selection_receipt": copy.deepcopy(
            enrollments["candidate_selection_receipt"]
        ),
        "candidate_checkpoint": copy.deepcopy(enrollments["candidate_checkpoint"]),
        "stable_checkpoint": copy.deepcopy(enrollments["stable_checkpoint"]),
        "candidate_weights": copy.deepcopy(enrollments["candidate_weights"]),
        "stable_weights": copy.deepcopy(enrollments["stable_weights"]),
        "checkpoint_weight_export_contract": {
            "schema": CHECKPOINT_WEIGHT_EXPORT_CONTRACT_SCHEMA,
            "exporter": copy.deepcopy(_EXPORT_WEIGHTS_SOURCE_IDENTITY),
            "candidate": {
                "checkpoint_sha256": enrollments["candidate_checkpoint"]["sha256"],
                "weights_sha256": enrollments["candidate_weights"]["sha256"],
                "byte_exact_reproduction_required": True,
            },
            "stable": {
                "checkpoint_sha256": enrollments["stable_checkpoint"]["sha256"],
                "weights_sha256": enrollments["stable_weights"]["sha256"],
                "byte_exact_reproduction_required": True,
            },
        },
    }
    if role == "fresh_final_holdout":
        return {
            **common,
            "dataset": copy.deepcopy(enrollments["fresh_final_holdout"]),
        }
    if role == "legacy_final_holdout":
        return {
            **common,
            "dataset": copy.deepcopy(enrollments["legacy_final_holdout"]),
        }
    if role == "retention":
        return {
            **common,
            "datasets": {
                "general": copy.deepcopy(enrollments["general_retention"]),
                "opening": copy.deepcopy(enrollments["opening_retention"]),
            },
        }
    if role == "known_regression":
        return {
            **common,
            "fixture": copy.deepcopy(enrollments["known_regression_fixture"]),
            "production_wasm": copy.deepcopy(enrollments["production_wasm"]),
            "time_budgets_ms": copy.deepcopy(
                enrollments["local_wasm_time_budgets_ms"]
            ),
        }
    raise ValueError("downstream evaluation role is invalid")


def _issue_verified_evaluation_observation_for_tests(
    *,
    role: str,
    selected_seed: int,
    measured_inputs: Mapping[str, Any],
    result: Mapping[str, Any],
    evidence_path: str | None = None,
) -> VerifiedEvaluationObservation:
    """Test-only issuer; production must verify durable evaluator evidence."""

    if role not in _EVALUATION_ROLES:
        raise ValueError("test evaluation role is invalid")
    if (
        type(selected_seed) is not int
        or selected_seed not in _CANDIDATE_SELECTION_CONTRACT["seeds"]
    ):
        raise ValueError("test evaluation seed is invalid")
    if type(measured_inputs) is not dict or type(result) is not dict:
        raise ValueError("test evaluation payload must contain exact objects")
    body = {
        "schema": _OBSERVATION_SCHEMAS[role],
        "role": role,
        "selected_seed": selected_seed,
        "measured_inputs": copy.deepcopy(measured_inputs),
        "result": copy.deepcopy(result),
    }
    body_raw = _canonical_json_bytes(body)
    path = evidence_path or f"evidence/{role}.json"
    evidence = {
        "path": path,
        "bytes": len(body_raw),
        "sha256": hashlib.sha256(body_raw).hexdigest(),
        "schema": _EVIDENCE_SCHEMAS[role],
    }
    _identity(evidence, f"test {role} evidence")
    observation = {**body, "evidence": evidence}
    raw = _canonical_json_bytes(observation)
    token = VerifiedEvaluationObservation(_EVALUATION_OBSERVATION_MARKER)
    with _EVALUATION_OBSERVATION_LOCK:
        _EVALUATION_OBSERVATIONS[token] = raw
    return token


def _consume_verified_evaluation_observation(
    observation: VerifiedEvaluationObservation,
) -> dict[str, Any]:
    if type(observation) is not VerifiedEvaluationObservation:
        raise ValueError(
            "downstream evaluator must return a branded verified observation"
        )
    with _EVALUATION_OBSERVATION_LOCK:
        raw = _EVALUATION_OBSERVATIONS.pop(observation, None)
    if raw is None:
        raise ValueError(
            "verified evaluation observation is invalid or already consumed"
        )
    return _strict_json_loads(raw, "verified evaluation observation")


def _validate_observation_data(
    observation: Mapping[str, Any],
    *,
    role: str,
    registry: Mapping[str, Any],
    candidate: Mapping[str, Any],
) -> dict[str, Any]:
    if registry.get("status") != DOWNSTREAM_READY_STATUS:
        raise ValueError(f"{role} observation requires a ready downstream registry")
    observation = _exact_dict(
        observation,
        _OBSERVATION_FIELDS,
        f"{role} observation",
    )
    if (
        observation["schema"] != _OBSERVATION_SCHEMAS[role]
        or observation["role"] != role
    ):
        raise ValueError(f"{role} observation schema/role mismatch")
    selected_seed = observation["selected_seed"]
    if (
        type(selected_seed) is not int
        or selected_seed not in _CANDIDATE_SELECTION_CONTRACT["seeds"]
        or selected_seed != candidate["selected_seed"]
    ):
        raise ValueError(f"{role} observation selected seed mismatch")
    expected_inputs = _expected_measured_inputs(registry, role)
    if not _typed_equal(observation["measured_inputs"], expected_inputs):
        raise ValueError(f"{role} measured input identity mismatch")
    if type(observation["result"]) is not dict:
        raise ValueError(f"{role} observation result is not an exact object")
    evidence = _identity(
        observation["evidence"],
        f"{role} observation evidence",
    )
    if evidence["schema"] != _EVIDENCE_SCHEMAS[role]:
        raise ValueError(f"{role} observation evidence schema mismatch")
    body = {
        field: copy.deepcopy(observation[field]) for field in _OBSERVATION_BODY_FIELDS
    }
    body_raw = _canonical_json_bytes(body)
    if (
        evidence["bytes"] != len(body_raw)
        or evidence["sha256"] != hashlib.sha256(body_raw).hexdigest()
    ):
        raise ValueError(f"{role} observation evidence identity mismatch")
    enrolled = registry["enrollments"]
    enrolled_paths = {enrolled[name]["path"] for name in _ROLE_IDENTITY_SCHEMAS}
    enrolled_hashes = {enrolled[name]["sha256"] for name in _ROLE_IDENTITY_SCHEMAS}
    if evidence["path"] in enrolled_paths or evidence["sha256"] in enrolled_hashes:
        raise ValueError(f"{role} evidence identity collides with an enrolled input")
    return observation


def _require_pairwise_distinct_observation_evidence(
    observations: Mapping[str, Any],
) -> None:
    observations = _exact_dict(
        observations,
        set(_EVALUATION_ROLES),
        "downstream evidence observations",
    )
    evidence_paths = [
        observations[role]["evidence"]["path"] for role in _EVALUATION_ROLES
    ]
    evidence_hashes = [
        observations[role]["evidence"]["sha256"] for role in _EVALUATION_ROLES
    ]
    if len(set(evidence_paths)) != len(evidence_paths) or len(
        set(evidence_hashes)
    ) != len(evidence_hashes):
        raise ValueError("downstream evidence identities must be pairwise distinct")


def _validate_evidence_bundle_data(
    bundle: Mapping[str, Any],
    *,
    registry: Mapping[str, Any],
    candidate: Mapping[str, Any],
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    bundle = _exact_dict(
        bundle,
        {"schema", "observations"},
        "downstream evidence bundle",
    )
    if bundle["schema"] != DOWNSTREAM_EVIDENCE_BUNDLE_SCHEMA:
        raise ValueError("downstream evidence bundle schema mismatch")
    observations = _exact_dict(
        bundle["observations"],
        set(_EVALUATION_ROLES),
        "downstream evidence observations",
    )
    selected_seed = candidate.get("selected_seed")
    if (
        type(selected_seed) is not int
        or selected_seed not in _CANDIDATE_SELECTION_CONTRACT["seeds"]
    ):
        raise ValueError("downstream evidence candidate seed is invalid")
    expected_candidate = _authorization_projection(registry)
    expected_candidate["selected_seed"] = selected_seed
    if not _typed_equal(candidate, expected_candidate):
        raise ValueError("downstream evidence candidate differs from registry")
    for role in _EVALUATION_ROLES:
        observation = observations[role]
        if type(observation) is not dict:
            raise ValueError(f"{role} evidence observation is not an object")
        seed = observation.get("selected_seed")
        if type(seed) is not int or seed != selected_seed:
            raise ValueError(f"{role} evidence selected seed mismatch")
    validated = {
        role: _validate_observation_data(
            observations[role],
            role=role,
            registry=registry,
            candidate=candidate,
        )
        for role in _EVALUATION_ROLES
    }
    _require_pairwise_distinct_observation_evidence(validated)
    return validated, candidate


def _issue_verified_downstream_evidence_bundle_for_tests(
    *,
    registry: Mapping[str, Any],
    authorization: CandidateSelectionAuthorization,
    observations: Mapping[str, Any],
) -> VerifiedDownstreamEvidenceBundle:
    """Test-only issuer; production must re-read and authenticate evidence."""

    candidate, snapshot, registry_raw = (
        _consume_candidate_selection_authorization_for_registry(
            authorization,
            registry,
        )
    )
    if snapshot["status"] != DOWNSTREAM_READY_STATUS:
        raise ValueError("test evidence bundle requires a ready registry")
    bundle = {
        "schema": DOWNSTREAM_EVIDENCE_BUNDLE_SCHEMA,
        "observations": copy.deepcopy(observations),
    }
    _validate_evidence_bundle_data(
        bundle,
        registry=snapshot,
        candidate=candidate,
    )
    raw = _canonical_json_bytes(bundle)
    candidate_raw = _canonical_json_bytes(candidate)
    token = VerifiedDownstreamEvidenceBundle(_EVIDENCE_BUNDLE_MARKER)
    with _EVIDENCE_BUNDLE_LOCK:
        _EVIDENCE_BUNDLES[token] = (
            registry_raw,
            candidate_raw,
            raw,
        )
    return token


def _consume_verified_downstream_evidence_bundle(
    bundle: VerifiedDownstreamEvidenceBundle,
    *,
    registry: Mapping[str, Any],
) -> tuple[dict[str, dict[str, Any]], dict[str, Any], dict[str, Any]]:
    if type(bundle) is not VerifiedDownstreamEvidenceBundle:
        raise ValueError("stored downstream result requires branded verified evidence")
    with _EVIDENCE_BUNDLE_LOCK:
        state = _EVIDENCE_BUNDLES.pop(bundle, None)
    if state is None:
        raise ValueError(
            "verified downstream evidence bundle is invalid or already consumed"
        )
    registry_raw, candidate_raw, raw = state
    _, supplied_raw, _ = _capture_registry(registry)
    if supplied_raw != registry_raw:
        raise ValueError("verified evidence registry binding mismatch")
    snapshot = _strict_json_loads(
        registry_raw,
        "verified evidence registry snapshot",
    )
    validate_downstream_registry_data(snapshot)
    candidate = _strict_json_loads(
        candidate_raw,
        "verified evidence candidate authorization",
    )
    data = _strict_json_loads(raw, "verified downstream evidence bundle")
    observations, validated_candidate = _validate_evidence_bundle_data(
        data,
        registry=snapshot,
        candidate=candidate,
    )
    return observations, validated_candidate, snapshot


def _receipt_provenance(
    observation: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "evaluation_evidence": copy.deepcopy(observation["evidence"]),
        "measured_inputs_sha256": _canonical_json_sha256(
            observation["measured_inputs"]
        ),
    }


def _common_receipt(
    schema: str,
    authorization: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "schema": schema,
        "status": "pass",
        "downstream_registry": copy.deepcopy(authorization["downstream_registry"]),
        "candidate_selection_receipt_sha256": authorization["selection_receipt"][
            "sha256"
        ],
        "candidate_checkpoint_sha256": authorization["candidate_checkpoint"]["sha256"],
        "stable_checkpoint_sha256": authorization["stable_checkpoint"]["sha256"],
        "candidate_weights_sha256": authorization["candidate_weights"]["sha256"],
        "stable_weights_sha256": authorization["stable_weights"]["sha256"],
        "production_weight_write_authorized": False,
    }


def _final_holdout_receipt_from_validated_observation(
    role: str,
    registry: Mapping[str, Any],
    observation: Mapping[str, Any],
    authorization: Mapping[str, Any],
) -> dict[str, Any]:
    metrics = observation["result"]
    metrics = _exact_dict(
        metrics,
        {
            "candidate_int16_pair_accuracy",
            "stable_int16_pair_accuracy",
            "candidate_int16_top1_accuracy",
            "stable_int16_top1_accuracy",
        },
        f"{role} metrics",
    )
    candidate_pair = _rate(
        metrics["candidate_int16_pair_accuracy"],
        f"{role} candidate pair accuracy",
    )
    stable_pair = _rate(
        metrics["stable_int16_pair_accuracy"],
        f"{role} stable pair accuracy",
    )
    candidate_top1 = _rate(
        metrics["candidate_int16_top1_accuracy"],
        f"{role} candidate top-1 accuracy",
    )
    stable_top1 = _rate(
        metrics["stable_int16_top1_accuracy"],
        f"{role} stable top-1 accuracy",
    )
    passed = candidate_pair >= stable_pair and candidate_top1 >= stable_top1
    if not passed:
        raise DownstreamGateFailed(role)
    return {
        **_common_receipt(FINAL_HOLDOUT_RECEIPT_SCHEMA, authorization),
        **_receipt_provenance(observation),
        "role": role,
        "dataset": copy.deepcopy(observation["measured_inputs"]["dataset"]),
        "metrics": {
            "candidate_int16_pair_accuracy": candidate_pair,
            "stable_int16_pair_accuracy": stable_pair,
            "candidate_int16_top1_accuracy": candidate_top1,
            "stable_int16_top1_accuracy": stable_top1,
        },
        "gate": ("candidate-int16-pair-and-top1-both-at-least-stable-on-same-data"),
    }


def _retention_receipt_from_validated_observation(
    registry: Mapping[str, Any],
    observation: Mapping[str, Any],
    authorization: Mapping[str, Any],
) -> dict[str, Any]:
    metrics = observation["result"]
    metrics = _exact_dict(
        metrics,
        {"general", "opening"},
        "retention metrics",
    )
    normalized = {}
    for role in ("general", "opening"):
        values = _exact_dict(
            metrics[role],
            {
                "candidate_value_mae_cp",
                "stable_value_mae_cp",
                "candidate_pair_accuracy",
                "stable_pair_accuracy",
                "candidate_decisive_pair_accuracy",
                "stable_decisive_pair_accuracy",
            },
            f"{role} retention metrics",
        )
        candidate_mae = _metric(
            values["candidate_value_mae_cp"],
            f"{role} candidate MAE",
            nonnegative=True,
        )
        stable_mae = _metric(
            values["stable_value_mae_cp"],
            f"{role} stable MAE",
            nonnegative=True,
        )
        candidate_pair = _rate(
            values["candidate_pair_accuracy"],
            f"{role} candidate pair accuracy",
        )
        stable_pair = _rate(
            values["stable_pair_accuracy"],
            f"{role} stable pair accuracy",
        )
        candidate_decisive = _rate(
            values["candidate_decisive_pair_accuracy"],
            f"{role} candidate decisive-pair accuracy",
        )
        stable_decisive = _rate(
            values["stable_decisive_pair_accuracy"],
            f"{role} stable decisive-pair accuracy",
        )
        if not (
            candidate_mae <= stable_mae * 1.05
            and candidate_pair >= stable_pair - 0.005
            and candidate_decisive >= stable_decisive - 0.005
        ):
            raise DownstreamGateFailed(f"{role}_retention")
        normalized[role] = {
            "candidate_value_mae_cp": candidate_mae,
            "stable_value_mae_cp": stable_mae,
            "candidate_pair_accuracy": candidate_pair,
            "stable_pair_accuracy": stable_pair,
            "candidate_decisive_pair_accuracy": candidate_decisive,
            "stable_decisive_pair_accuracy": stable_decisive,
        }
    return {
        **_common_receipt(RETENTION_RECEIPT_SCHEMA, authorization),
        **_receipt_provenance(observation),
        "datasets": copy.deepcopy(observation["measured_inputs"]["datasets"]),
        "metrics": normalized,
        "gates": {
            "value_mae_cp": "candidate-at-most-1.05-times-stable",
            "pair_accuracy": "candidate-at-least-stable-minus-0.005",
            "decisive_pair_accuracy": ("candidate-at-least-stable-minus-0.005"),
        },
    }


def _known_regression_receipt_from_validated_observation(
    registry: Mapping[str, Any],
    observation: Mapping[str, Any],
    authorization: Mapping[str, Any],
) -> dict[str, Any]:
    verified = observation
    result = _exact_dict(
        verified["result"],
        {
            "schema",
            "status",
            "loaded_weights_sha256",
            "static_ranks",
            "fixed_depth_bestmoves",
            "timed_bestmoves",
            "wasm_module_identity",
            "safety",
        },
        "local WASM known-regression observation",
    )
    if (
        result["schema"]
        != "shogi-floodgate-strength-first-downstream-wasm-probe-result-v1"
        or result["status"] != "complete-local-wasm-module-probes"
        or result["loaded_weights_sha256"]
        != authorization["candidate_weights"]["sha256"]
    ):
        raise DownstreamGateFailed("known_regression_local_wasm_identity")
    wasm_identity = _exact_dict(
        result["wasm_module_identity"],
        {"path", "bytes", "sha256", "embedded_bytes_equal"},
        "known-regression local WASM identity",
    )
    enrolled_wasm = verified["measured_inputs"]["production_wasm"]
    if (
        type(wasm_identity["path"]) is not str
        or wasm_identity["path"] != enrolled_wasm["path"]
        or type(wasm_identity["bytes"]) is not int
        or wasm_identity["bytes"] != enrolled_wasm["bytes"]
        or type(wasm_identity["sha256"]) is not str
        or wasm_identity["sha256"] != enrolled_wasm["sha256"]
        or wasm_identity["embedded_bytes_equal"] is not True
    ):
        raise DownstreamGateFailed("known_regression_local_wasm_identity")
    safety = _exact_dict(
        result["safety"],
        {
            "local_only",
            "network",
            "cloud",
            "aws",
            "live_weight_write",
        },
        "known-regression local WASM safety",
    )
    if not _typed_equal(
        safety,
        {
            "local_only": True,
            "network": False,
            "cloud": False,
            "aws": False,
            "live_weight_write": False,
        },
    ):
        raise DownstreamGateFailed("known_regression_local_wasm_safety")
    ranks = _exact_dict(
        result["static_ranks"],
        {"P*8f", "3a4b"},
        "known-regression static ranks",
    )
    bad_rank = ranks["P*8f"]
    good_rank = ranks["3a4b"]
    if (
        type(bad_rank) is not int
        or type(good_rank) is not int
        or bad_rank <= 0
        or good_rank <= 0
        or bad_rank <= good_rank
    ):
        raise DownstreamGateFailed("known_regression_static")
    depths = _exact_dict(
        result["fixed_depth_bestmoves"],
        {"11", "12"},
        "known-regression fixed depths",
    )
    if any(
        type(depths[key]) is not str
        or _USI_BESTMOVE_RE.fullmatch(depths[key]) is None
        or depths[key] == "P*8f"
        for key in ("11", "12")
    ):
        raise DownstreamGateFailed("known_regression_fixed_depth")
    timed = result["timed_bestmoves"]
    expected = [
        (time_ms, run)
        for time_ms in verified["measured_inputs"]["time_budgets_ms"]
        for run in (1, 2, 3)
    ]
    if type(timed) is not list or len(timed) != len(expected):
        raise ValueError("known-regression timed observations are not exact")
    normalized_timed = []
    for index, (time_ms, run) in enumerate(expected):
        value = _exact_dict(
            timed[index],
            {"time_ms", "run", "bestmove"},
            f"known-regression timed observation {index}",
        )
        if (
            type(value["time_ms"]) is not int
            or value["time_ms"] != time_ms
            or type(value["run"]) is not int
            or value["run"] != run
            or type(value["bestmove"]) is not str
            or _USI_BESTMOVE_RE.fullmatch(value["bestmove"]) is None
            or value["bestmove"] == "P*8f"
        ):
            raise DownstreamGateFailed("known_regression_timed")
        normalized_timed.append(dict(value))
    return {
        **_common_receipt(KNOWN_REGRESSION_RECEIPT_SCHEMA, authorization),
        **_receipt_provenance(verified),
        "fixture": copy.deepcopy(verified["measured_inputs"]["fixture"]),
        "production_wasm": copy.deepcopy(enrolled_wasm),
        "loaded_weights_sha256": result["loaded_weights_sha256"],
        "bad_move": "P*8f",
        "stable_good_move": "3a4b",
        "static_ranks": {"P*8f": bad_rank, "3a4b": good_rank},
        "fixed_depth_bestmoves": dict(depths),
        "timed_bestmoves": normalized_timed,
        "wasm_module_identity": dict(wasm_identity),
        "safety": dict(safety),
        "gate": "exact-candidate-local-wasm-module-P-star-8f-checks-pass",
    }


def run_strength_first_downstream_gates_core_for_tests(
    *,
    registry: Mapping[str, Any],
    authorization: CandidateSelectionAuthorization,
    evaluate_fresh_final: Callable[[Mapping[str, Any]], VerifiedEvaluationObservation],
    evaluate_legacy_final: Callable[[Mapping[str, Any]], VerifiedEvaluationObservation],
    evaluate_retention: Callable[[Mapping[str, Any]], VerifiedEvaluationObservation],
    evaluate_known_regression: Callable[
        [Mapping[str, Any]], VerifiedEvaluationObservation
    ],
) -> dict[str, Any]:
    """Test-only composition for four local post-selection receipts."""

    callbacks = {
        "fresh_final_holdout": evaluate_fresh_final,
        "legacy_final_holdout": evaluate_legacy_final,
        "retention": evaluate_retention,
        "known_regression": evaluate_known_regression,
    }
    if any(not callable(callback) for callback in callbacks.values()):
        raise TypeError("every downstream evaluator must be callable")
    candidate, snapshot, _ = _consume_candidate_selection_authorization_for_registry(
        authorization,
        registry,
    )
    if snapshot["status"] != DOWNSTREAM_READY_STATUS:
        raise DownstreamGatesBlocked("downstream registry remains data-only blocked")
    contexts = {}
    for role in _EVALUATION_ROLES:
        context = copy.deepcopy(candidate)
        context["evaluation_role"] = role
        context["expected_measured_inputs"] = _expected_measured_inputs(
            snapshot,
            role,
        )
        contexts[role] = context
    observations = {
        role: _consume_verified_evaluation_observation(
            callbacks[role](copy.deepcopy(contexts[role]))
        )
        for role in _EVALUATION_ROLES
    }
    validated_observations = {
        role: _validate_observation_data(
            observations[role],
            role=role,
            registry=snapshot,
            candidate=candidate,
        )
        for role in _EVALUATION_ROLES
    }
    _require_pairwise_distinct_observation_evidence(validated_observations)
    fresh = _final_holdout_receipt_from_validated_observation(
        "fresh_final_holdout",
        snapshot,
        validated_observations["fresh_final_holdout"],
        candidate,
    )
    legacy = _final_holdout_receipt_from_validated_observation(
        "legacy_final_holdout",
        snapshot,
        validated_observations["legacy_final_holdout"],
        candidate,
    )
    retention = _retention_receipt_from_validated_observation(
        snapshot,
        validated_observations["retention"],
        candidate,
    )
    known = _known_regression_receipt_from_validated_observation(
        snapshot,
        validated_observations["known_regression"],
        candidate,
    )
    return {
        "schema": DOWNSTREAM_RESULT_SCHEMA,
        "status": "complete-local-downstream-checks-pass-formal-parity-pending",
        "downstream_registry": copy.deepcopy(candidate["downstream_registry"]),
        "selected_seed": candidate["selected_seed"],
        "candidate_selection_receipt": copy.deepcopy(candidate["selection_receipt"]),
        "candidate_checkpoint": copy.deepcopy(candidate["candidate_checkpoint"]),
        "stable_checkpoint": copy.deepcopy(candidate["stable_checkpoint"]),
        "candidate_weights": copy.deepcopy(candidate["candidate_weights"]),
        "stable_weights": copy.deepcopy(candidate["stable_weights"]),
        "receipts": {
            "fresh_final_holdout": fresh,
            "legacy_final_holdout": legacy,
            "retention": retention,
            "known_regression": known,
        },
        "formal_ab_enrollment_ready": False,
        "production_weight_write_authorized": False,
        "live_weights_changed": False,
    }


def validate_downstream_result_data(
    result: Mapping[str, Any],
    *,
    registry: Mapping[str, Any],
    verified_evidence: VerifiedDownstreamEvidenceBundle,
) -> Mapping[str, Any]:
    """Rebuild receipts only from separately reverified evaluator evidence."""

    result = _exact_dict(
        result,
        {
            "schema",
            "status",
            "downstream_registry",
            "selected_seed",
            "candidate_selection_receipt",
            "candidate_checkpoint",
            "stable_checkpoint",
            "candidate_weights",
            "stable_weights",
            "receipts",
            "formal_ab_enrollment_ready",
            "production_weight_write_authorized",
            "live_weights_changed",
        },
        "downstream result",
    )
    observations, candidate, snapshot = _consume_verified_downstream_evidence_bundle(
        verified_evidence,
        registry=registry,
    )
    if snapshot["status"] != DOWNSTREAM_READY_STATUS:
        raise ValueError("downstream result validation requires a ready registry")
    try:
        expected_receipts = {
            "fresh_final_holdout": _final_holdout_receipt_from_validated_observation(
                "fresh_final_holdout",
                snapshot,
                observations["fresh_final_holdout"],
                candidate,
            ),
            "legacy_final_holdout": _final_holdout_receipt_from_validated_observation(
                "legacy_final_holdout",
                snapshot,
                observations["legacy_final_holdout"],
                candidate,
            ),
            "retention": _retention_receipt_from_validated_observation(
                snapshot,
                observations["retention"],
                candidate,
            ),
            "known_regression": _known_regression_receipt_from_validated_observation(
                snapshot,
                observations["known_regression"],
                candidate,
            ),
        }
    except DownstreamGateFailed as error:
        raise ValueError(
            f"downstream result contains failed gate: {error.gate}"
        ) from error
    expected = {
        "schema": DOWNSTREAM_RESULT_SCHEMA,
        "status": "complete-local-downstream-checks-pass-formal-parity-pending",
        "downstream_registry": copy.deepcopy(candidate["downstream_registry"]),
        "selected_seed": candidate["selected_seed"],
        "candidate_selection_receipt": copy.deepcopy(candidate["selection_receipt"]),
        "candidate_checkpoint": copy.deepcopy(candidate["candidate_checkpoint"]),
        "stable_checkpoint": copy.deepcopy(candidate["stable_checkpoint"]),
        "candidate_weights": copy.deepcopy(candidate["candidate_weights"]),
        "stable_weights": copy.deepcopy(candidate["stable_weights"]),
        "receipts": expected_receipts,
        "formal_ab_enrollment_ready": False,
        "production_weight_write_authorized": False,
        "live_weights_changed": False,
    }
    if not _typed_equal(result, expected):
        raise ValueError("downstream result differs from reconstructed receipts")
    return result


def canonical_receipt_bytes(receipt: Mapping[str, Any]) -> bytes:
    """Canonical serialization for a later durable publisher."""

    return _canonical_json_bytes(receipt)


def receipt_identity(
    receipt: Mapping[str, Any],
    *,
    path: str,
) -> dict[str, Any]:
    """Bind one in-memory receipt without writing it."""

    canonical_path = (
        PurePosixPath(path) if type(path) is str and "\\" not in path else None
    )
    if (
        canonical_path is None
        or not path
        or ":" in path
        or canonical_path.is_absolute()
        or str(canonical_path) != path
        or any(part in ("", ".", "..") for part in canonical_path.parts)
    ):
        raise ValueError("receipt path must be a canonical relative path")
    raw = canonical_receipt_bytes(receipt)
    schema = receipt.get("schema") if type(receipt) is dict else None
    if type(schema) is not str or not schema:
        raise ValueError("receipt schema is absent")
    return {
        "path": path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": schema,
    }


def run_strength_first_downstream_gates() -> dict[str, Any]:
    """Argumentless production path; currently stops before every sensitive read."""

    repo_root = Path(__file__).resolve().parent.parent
    registry, raw = _load_fixed_registry(repo_root)
    if registry["status"] == DOWNSTREAM_BLOCKED_STATUS:
        raise DownstreamGatesBlocked(
            "candidate-selection authorization and exact downstream inputs "
            "are not enrolled"
        )
    if _PINNED_READY_REGISTRY_IDENTITY is None:
        raise DownstreamGatesBlocked(
            "ready downstream registry identity is not code-pinned"
        )
    expected = _PINNED_READY_REGISTRY_IDENTITY
    if (
        len(raw) != expected["bytes"]
        or hashlib.sha256(raw).hexdigest() != expected["sha256"]
        or registry["schema"] != expected["schema"]
    ):
        raise ValueError("ready downstream registry identity mismatch")
    raise DownstreamGatesBlocked(
        "trusted evaluator evidence publisher and production composition have not landed"
    )


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        reason = "arguments-forbidden"
    else:
        try:
            run_strength_first_downstream_gates()
        except DownstreamGatesBlocked:
            reason = "candidate-selection-and-downstream-inputs-not-ready"
        except (OSError, ValueError) as error:
            print(f"[strength-first-downstream] STOP: {error}", file=sys.stderr)
            return 1
        else:
            return 0
    print(
        json.dumps(
            {
                "schema": DOWNSTREAM_CLI_RECEIPT_SCHEMA,
                "status": "STOP",
                "reason": reason,
                "candidate_selection_authorizations_consumed": 0,
                "final_holdout_label_reads": 0,
                "downstream_receipts_emitted": 0,
                "formal_ab_games": 0,
                "live_weights_changed": False,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "CandidateSelectionAuthorization",
    "DOWNSTREAM_REGISTRY_RELATIVE_PATH",
    "DOWNSTREAM_REGISTRY_SCHEMA",
    "DOWNSTREAM_RESULT_SCHEMA",
    "DOWNSTREAM_EVIDENCE_BUNDLE_SCHEMA",
    "DownstreamGateFailed",
    "DownstreamGatesBlocked",
    "VerifiedDownstreamEvidenceBundle",
    "VerifiedEvaluationObservation",
    "canonical_receipt_bytes",
    "issue_candidate_selection_authorization_from_enrolled_receipt",
    "receipt_identity",
    "run_strength_first_downstream_gates",
    "run_strength_first_downstream_gates_core_for_tests",
    "validate_selection_receipt_against_evaluator_registry",
    "validate_downstream_result_data",
    "validate_downstream_registry_data",
]
