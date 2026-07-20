"""Fail-closed receipts between strength-first selection and formal A/B.

The checked-in registry intentionally contains no real candidate or evaluation
identity.  The argumentless production entry therefore validates that closed
state and stops before any candidate, holdout, retention, regression, or
browser reader can run.

The deterministic core in this module is explicitly test-only.  It defines the
five receipt contracts that a later production composition may issue only
after consuming the branded authorization supplied by the candidate-selection
lane and one-shot observations supplied by evidence-verifying evaluators.
Stored receipts can be reconstructed only from a separately branded,
registry-bound evidence bundle. No plain JSON claim can unlock these gates.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
import copy
import hashlib
import json
import math
import os
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
from qat_protocol import QAT_FINAL_CHECKPOINT_SCHEMA
from sibling_selection_protocol import CANDIDATE_SELECTION_RECEIPT_SCHEMA
from strength_first_qat_training_bridge import (
    STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
)


DOWNSTREAM_REGISTRY_SCHEMA = (
    "shogi-floodgate-strength-first-downstream-gates-registry-v1"
)
DOWNSTREAM_REGISTRY_RELATIVE_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-strength-first-downstream-gates-registry.json"
)
DOWNSTREAM_BLOCKED_STATUS = (
    "awaiting-branded-candidate-selection-and-exact-downstream-inputs"
)
DOWNSTREAM_READY_STATUS = (
    "branded-candidate-selection-and-exact-downstream-inputs-ready"
)
FINAL_HOLDOUT_RECEIPT_SCHEMA = (
    "shogi-floodgate-strength-first-final-holdout-receipt-v1"
)
RETENTION_RECEIPT_SCHEMA = (
    "shogi-floodgate-strength-first-retention-receipt-v1"
)
KNOWN_REGRESSION_RECEIPT_SCHEMA = (
    "shogi-floodgate-strength-first-known-regression-receipt-v1"
)
PRODUCTION_PARITY_RECEIPT_SCHEMA = (
    "shogi-floodgate-strength-first-production-parity-receipt-v1"
)
DOWNSTREAM_RESULT_SCHEMA = (
    "shogi-floodgate-strength-first-downstream-gates-result-v1"
)
DOWNSTREAM_CLI_RECEIPT_SCHEMA = (
    "shogi-floodgate-strength-first-downstream-gates-cli-receipt-v1"
)
DOWNSTREAM_EVIDENCE_BUNDLE_SCHEMA = (
    "shogi-floodgate-strength-first-verified-evidence-bundle-v1"
)
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
PRODUCTION_WORKER_IDENTITY_SCHEMA = (
    "shogi-floodgate-strength-first-production-worker-javascript-v1"
)
PRODUCTION_WASM_IDENTITY_SCHEMA = (
    "shogi-floodgate-strength-first-production-wasm-v1"
)

_STRENGTH_FIRST_AMENDMENT_IDENTITY = {
    "path": (
        "ml/protocols/"
        "floodgate-q1-2026-strength-first-teacher-amendment.json"
    ),
    "bytes": 5_123,
    "sha256": (
        "7bb1a6ef3116f81f6e40ea1440f40b08751e96087eadc018b48ab1d4dd910e7e"
    ),
    "schema": "shogi-floodgate-q1-2026-strength-first-teacher-amendment-v1",
}
_BASE_PLAN_IDENTITY = {
    "path": FRESH_SIBLING_PLAN_PATH,
    "bytes": FRESH_SIBLING_PLAN_BYTES,
    "sha256": FRESH_SIBLING_PLAN_SHA256,
    "schema": FRESH_SIBLING_PLAN_SCHEMA,
}
_ENROLLMENT_FIELDS = {
    "candidate_selection_receipt",
    "candidate_checkpoint",
    "stable_checkpoint",
    "candidate_weights",
    "stable_weights",
    "fresh_final_holdout",
    "legacy_final_holdout",
    "general_retention",
    "opening_retention",
    "known_regression_fixture",
    "production_worker",
    "production_wasm",
    "browser_time_budgets_ms",
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
    "enrollments",
    "gates",
    "boundary",
    "nonclaims",
}
_EVALUATION_ROLES = (
    "fresh_final_holdout",
    "legacy_final_holdout",
    "retention",
    "known_regression",
    "production_parity",
)
_ROLE_IDENTITY_SCHEMAS = {
    "candidate_selection_receipt": CANDIDATE_SELECTION_RECEIPT_SCHEMA,
    "candidate_checkpoint": STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
    "stable_checkpoint": QAT_FINAL_CHECKPOINT_SCHEMA,
    "candidate_weights": INT16_WEIGHTS_IDENTITY_SCHEMA,
    "stable_weights": INT16_WEIGHTS_IDENTITY_SCHEMA,
    "fresh_final_holdout": FRESH_FINAL_HOLDOUT_IDENTITY_SCHEMA,
    "legacy_final_holdout": LEGACY_FINAL_HOLDOUT_IDENTITY_SCHEMA,
    "general_retention": GENERAL_RETENTION_IDENTITY_SCHEMA,
    "opening_retention": OPENING_RETENTION_IDENTITY_SCHEMA,
    "known_regression_fixture": KNOWN_REGRESSION_FIXTURE_IDENTITY_SCHEMA,
    "production_worker": PRODUCTION_WORKER_IDENTITY_SCHEMA,
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
_USI_BESTMOVE_RE = re.compile(
    r"(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])\Z"
)
_PINNED_READY_REGISTRY_IDENTITY: dict[str, Any] | None = None
_CANDIDATE_AUTHORIZATION_MARKER = object()
_CANDIDATE_AUTHORIZATIONS: weakref.WeakKeyDictionary[
    CandidateSelectionAuthorization, dict[str, Any]
] = weakref.WeakKeyDictionary()
_CANDIDATE_AUTHORIZATION_LOCK = threading.Lock()
_EVALUATION_OBSERVATION_MARKER = object()
_EVALUATION_OBSERVATIONS: weakref.WeakKeyDictionary[
    VerifiedEvaluationObservation, bytes
] = weakref.WeakKeyDictionary()
_EVALUATION_OBSERVATION_LOCK = threading.Lock()
_EVIDENCE_BUNDLE_MARKER = object()
_EVIDENCE_BUNDLES: weakref.WeakKeyDictionary[
    VerifiedDownstreamEvidenceBundle, tuple[str, bytes, bytes]
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
            _typed_equal(left, right)
            for left, right in zip(value, expected)
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
        {"base_plan", "strength_first_amendment"},
        "downstream protocol",
    )
    if not _typed_equal(protocol["base_plan"], _BASE_PLAN_IDENTITY):
        raise ValueError("downstream base-plan identity mismatch")
    if not _typed_equal(
        protocol["strength_first_amendment"],
        _STRENGTH_FIRST_AMENDMENT_IDENTITY,
    ):
        raise ValueError("downstream strength-first amendment identity mismatch")
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
    enrolled_paths = [
        identity["path"] for identity in enrolled_identities.values()
    ]
    enrolled_hashes = [
        identity["sha256"] for identity in enrolled_identities.values()
    ]
    if (
        len(set(enrolled_paths)) != len(enrolled_paths)
        or len(set(enrolled_hashes)) != len(enrolled_hashes)
    ):
        raise ValueError(
            "downstream role identities must have pairwise-distinct paths "
            "and SHA-256 values"
        )
    budgets = enrollments["browser_time_budgets_ms"]
    if (
        type(budgets) is not list
        or not budgets
        or any(type(value) is not int or value <= 0 for value in budgets)
        or budgets != sorted(set(budgets))
    ):
        raise ValueError("downstream browser time budgets are not canonical")
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
) -> dict[str, Any]:
    enrollments = registry["enrollments"]
    return {
        "selection_receipt": copy.deepcopy(
            enrollments["candidate_selection_receipt"]
        ),
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

    validate_downstream_registry_data(registry)
    if registry["status"] != DOWNSTREAM_READY_STATUS:
        raise ValueError("test authorization requires a ready synthetic registry")
    if type(selected_seed) is not int or selected_seed not in (42, 43, 44):
        raise ValueError("selected seed is outside the preregistered grid")
    payload = _authorization_projection(registry)
    payload["selected_seed"] = selected_seed
    authorization = CandidateSelectionAuthorization(
        _CANDIDATE_AUTHORIZATION_MARKER
    )
    with _CANDIDATE_AUTHORIZATION_LOCK:
        _CANDIDATE_AUTHORIZATIONS[authorization] = payload
    return authorization


def _consume_candidate_selection_authorization(
    authorization: CandidateSelectionAuthorization,
) -> dict[str, Any]:
    if type(authorization) is not CandidateSelectionAuthorization:
        raise ValueError(
            "downstream gates require a branded candidate-selection authorization"
        )
    with _CANDIDATE_AUTHORIZATION_LOCK:
        payload = _CANDIDATE_AUTHORIZATIONS.pop(authorization, None)
    if payload is None:
        raise ValueError(
            "candidate-selection authorization is invalid or already consumed"
        )
    return payload


def _expected_measured_inputs(
    registry: Mapping[str, Any],
    role: str,
) -> dict[str, Any]:
    enrollments = registry["enrollments"]
    common = {
        "candidate_selection_receipt": copy.deepcopy(
            enrollments["candidate_selection_receipt"]
        ),
        "candidate_checkpoint": copy.deepcopy(
            enrollments["candidate_checkpoint"]
        ),
        "stable_checkpoint": copy.deepcopy(enrollments["stable_checkpoint"]),
        "candidate_weights": copy.deepcopy(enrollments["candidate_weights"]),
        "stable_weights": copy.deepcopy(enrollments["stable_weights"]),
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
            "fixture": copy.deepcopy(
                enrollments["known_regression_fixture"]
            ),
        }
    if role == "production_parity":
        return {
            **common,
            "production_worker": copy.deepcopy(
                enrollments["production_worker"]
            ),
            "production_wasm": copy.deepcopy(enrollments["production_wasm"]),
            "browser_time_budgets_ms": copy.deepcopy(
                enrollments["browser_time_budgets_ms"]
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
    if type(selected_seed) is not int or selected_seed not in (42, 43, 44):
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
        or selected_seed not in (42, 43, 44)
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
        field: copy.deepcopy(observation[field])
        for field in _OBSERVATION_BODY_FIELDS
    }
    body_raw = _canonical_json_bytes(body)
    if (
        evidence["bytes"] != len(body_raw)
        or evidence["sha256"] != hashlib.sha256(body_raw).hexdigest()
    ):
        raise ValueError(f"{role} observation evidence identity mismatch")
    enrolled = registry["enrollments"]
    enrolled_paths = {
        enrolled[name]["path"] for name in _ROLE_IDENTITY_SCHEMAS
    }
    enrolled_hashes = {
        enrolled[name]["sha256"] for name in _ROLE_IDENTITY_SCHEMAS
    }
    if (
        evidence["path"] in enrolled_paths
        or evidence["sha256"] in enrolled_hashes
    ):
        raise ValueError(
            f"{role} evidence identity collides with an enrolled input"
        )
    return observation


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
    if type(selected_seed) is not int or selected_seed not in (42, 43, 44):
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
    evidence_paths = [
        observation["evidence"]["path"]
        for observation in validated.values()
    ]
    evidence_hashes = [
        observation["evidence"]["sha256"]
        for observation in validated.values()
    ]
    if (
        len(set(evidence_paths)) != len(evidence_paths)
        or len(set(evidence_hashes)) != len(evidence_hashes)
    ):
        raise ValueError(
            "downstream evidence identities must be pairwise distinct"
        )
    return validated, candidate


def _issue_verified_downstream_evidence_bundle_for_tests(
    *,
    registry: Mapping[str, Any],
    authorization: CandidateSelectionAuthorization,
    observations: Mapping[str, Any],
) -> VerifiedDownstreamEvidenceBundle:
    """Test-only issuer; production must re-read and authenticate evidence."""

    validate_downstream_registry_data(registry)
    if registry["status"] != DOWNSTREAM_READY_STATUS:
        raise ValueError("test evidence bundle requires a ready registry")
    candidate = _consume_candidate_selection_authorization(authorization)
    bundle = {
        "schema": DOWNSTREAM_EVIDENCE_BUNDLE_SCHEMA,
        "observations": copy.deepcopy(observations),
    }
    _validate_evidence_bundle_data(
        bundle,
        registry=registry,
        candidate=candidate,
    )
    raw = _canonical_json_bytes(bundle)
    candidate_raw = _canonical_json_bytes(candidate)
    token = VerifiedDownstreamEvidenceBundle(_EVIDENCE_BUNDLE_MARKER)
    with _EVIDENCE_BUNDLE_LOCK:
        _EVIDENCE_BUNDLES[token] = (
            _canonical_json_sha256(dict(registry)),
            candidate_raw,
            raw,
        )
    return token


def _consume_verified_downstream_evidence_bundle(
    bundle: VerifiedDownstreamEvidenceBundle,
    *,
    registry: Mapping[str, Any],
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    if type(bundle) is not VerifiedDownstreamEvidenceBundle:
        raise ValueError(
            "stored downstream result requires branded verified evidence"
        )
    with _EVIDENCE_BUNDLE_LOCK:
        state = _EVIDENCE_BUNDLES.pop(bundle, None)
    if state is None:
        raise ValueError(
            "verified downstream evidence bundle is invalid or already consumed"
        )
    registry_sha256, candidate_raw, raw = state
    if registry_sha256 != _canonical_json_sha256(dict(registry)):
        raise ValueError("verified evidence registry binding mismatch")
    candidate = _strict_json_loads(
        candidate_raw,
        "verified evidence candidate authorization",
    )
    data = _strict_json_loads(raw, "verified downstream evidence bundle")
    return _validate_evidence_bundle_data(
        data,
        registry=registry,
        candidate=candidate,
    )


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
        "candidate_selection_receipt_sha256": authorization[
            "selection_receipt"
        ]["sha256"],
        "candidate_checkpoint_sha256": authorization["candidate_checkpoint"][
            "sha256"
        ],
        "stable_checkpoint_sha256": authorization["stable_checkpoint"]["sha256"],
        "candidate_weights_sha256": authorization["candidate_weights"]["sha256"],
        "stable_weights_sha256": authorization["stable_weights"]["sha256"],
        "production_weight_write_authorized": False,
    }


def _final_holdout_receipt(
    role: str,
    registry: Mapping[str, Any],
    observation: Mapping[str, Any],
    authorization: Mapping[str, Any],
) -> dict[str, Any]:
    observation = _validate_observation_data(
        observation,
        role=role,
        registry=registry,
        candidate=authorization,
    )
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
        "dataset": copy.deepcopy(
            observation["measured_inputs"]["dataset"]
        ),
        "metrics": {
            "candidate_int16_pair_accuracy": candidate_pair,
            "stable_int16_pair_accuracy": stable_pair,
            "candidate_int16_top1_accuracy": candidate_top1,
            "stable_int16_top1_accuracy": stable_top1,
        },
        "gate": (
            "candidate-int16-pair-and-top1-both-at-least-stable-on-same-data"
        ),
    }


def _retention_receipt(
    registry: Mapping[str, Any],
    observation: Mapping[str, Any],
    authorization: Mapping[str, Any],
) -> dict[str, Any]:
    observation = _validate_observation_data(
        observation,
        role="retention",
        registry=registry,
        candidate=authorization,
    )
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
        "datasets": copy.deepcopy(
            observation["measured_inputs"]["datasets"]
        ),
        "metrics": normalized,
        "gates": {
            "value_mae_cp": "candidate-at-most-1.05-times-stable",
            "pair_accuracy": "candidate-at-least-stable-minus-0.005",
            "decisive_pair_accuracy": (
                "candidate-at-least-stable-minus-0.005"
            ),
        },
    }


def _known_regression_receipt(
    registry: Mapping[str, Any],
    observation: Mapping[str, Any],
    authorization: Mapping[str, Any],
) -> dict[str, Any]:
    verified = _validate_observation_data(
        observation,
        role="known_regression",
        registry=registry,
        candidate=authorization,
    )
    result = _exact_dict(
        verified["result"],
        {"static_ranks", "fixed_depth_bestmoves", "timed_bestmoves"},
        "known-regression observation",
    )
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
        for time_ms in (800, 2_000, 4_000)
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
        "fixture": copy.deepcopy(
            verified["measured_inputs"]["fixture"]
        ),
        "bad_move": "P*8f",
        "stable_good_move": "3a4b",
        "static_ranks": {"P*8f": bad_rank, "3a4b": good_rank},
        "fixed_depth_bestmoves": dict(depths),
        "timed_bestmoves": normalized_timed,
        "gate": "all-P-star-8f-contract-checks-pass",
    }


def _production_parity_receipt(
    registry: Mapping[str, Any],
    observation: Mapping[str, Any],
    authorization: Mapping[str, Any],
) -> dict[str, Any]:
    verified = _validate_observation_data(
        observation,
        role="production_parity",
        registry=registry,
        candidate=authorization,
    )
    result = _exact_dict(
        verified["result"],
        {
            "loaded_weights_sha256",
            "production_worker_path_verified",
            "production_wasm_path_verified",
            "budget_runs",
            "console_errors",
            "runtime_errors",
        },
        "production parity observation",
    )
    if (
        result["loaded_weights_sha256"]
        != authorization["candidate_weights"]["sha256"]
        or result["production_worker_path_verified"] is not True
        or result["production_wasm_path_verified"] is not True
        or type(result["console_errors"]) is not int
        or result["console_errors"] != 0
        or type(result["runtime_errors"]) is not int
        or result["runtime_errors"] != 0
    ):
        raise DownstreamGateFailed("production_parity")
    budgets = verified["measured_inputs"]["browser_time_budgets_ms"]
    runs = result["budget_runs"]
    if type(runs) is not list or len(runs) != len(budgets):
        raise ValueError("production parity budget observations are not exact")
    normalized_runs = []
    for index, budget in enumerate(budgets):
        value = _exact_dict(
            runs[index],
            {"time_ms", "move_is_legal", "completed_within_budget"},
            f"production parity budget {index}",
        )
        if (
            type(value["time_ms"]) is not int
            or value["time_ms"] != budget
            or value["move_is_legal"] is not True
            or value["completed_within_budget"] is not True
        ):
            raise DownstreamGateFailed("production_parity_budget")
        normalized_runs.append(dict(value))
    return {
        **_common_receipt(PRODUCTION_PARITY_RECEIPT_SCHEMA, authorization),
        **_receipt_provenance(verified),
        "production_worker": copy.deepcopy(
            verified["measured_inputs"]["production_worker"]
        ),
        "production_wasm": copy.deepcopy(
            verified["measured_inputs"]["production_wasm"]
        ),
        "loaded_weights_sha256": result["loaded_weights_sha256"],
        "budget_runs": normalized_runs,
        "console_errors": 0,
        "runtime_errors": 0,
        "gate": "exact-candidate-production-worker-wasm-browser-all-pass",
    }


def run_strength_first_downstream_gates_core_for_tests(
    *,
    registry: Mapping[str, Any],
    authorization: CandidateSelectionAuthorization,
    evaluate_fresh_final: Callable[
        [Mapping[str, Any]], VerifiedEvaluationObservation
    ],
    evaluate_legacy_final: Callable[
        [Mapping[str, Any]], VerifiedEvaluationObservation
    ],
    evaluate_retention: Callable[
        [Mapping[str, Any]], VerifiedEvaluationObservation
    ],
    evaluate_known_regression: Callable[
        [Mapping[str, Any]], VerifiedEvaluationObservation
    ],
    evaluate_production_parity: Callable[
        [Mapping[str, Any]], VerifiedEvaluationObservation
    ],
) -> dict[str, Any]:
    """Test-only composition for the exact five post-selection receipts."""

    validate_downstream_registry_data(registry)
    if registry["status"] != DOWNSTREAM_READY_STATUS:
        raise DownstreamGatesBlocked("downstream registry remains data-only blocked")
    callbacks = (
        evaluate_fresh_final,
        evaluate_legacy_final,
        evaluate_retention,
        evaluate_known_regression,
        evaluate_production_parity,
    )
    if any(not callable(callback) for callback in callbacks):
        raise TypeError("every downstream evaluator must be callable")
    candidate = _consume_candidate_selection_authorization(authorization)
    if (
        type(candidate.get("selected_seed")) is not int
        or candidate["selected_seed"] not in (42, 43, 44)
    ):
        raise ValueError("candidate-selection authorization seed is invalid")
    expected = _authorization_projection(registry)
    expected["selected_seed"] = candidate["selected_seed"]
    if not _typed_equal(candidate, expected):
        raise ValueError("candidate-selection authorization differs from registry")
    context = copy.deepcopy(candidate)
    fresh_observation = _consume_verified_evaluation_observation(
        evaluate_fresh_final(copy.deepcopy(context))
    )
    fresh = _final_holdout_receipt(
        "fresh_final_holdout",
        registry,
        fresh_observation,
        candidate,
    )
    legacy_observation = _consume_verified_evaluation_observation(
        evaluate_legacy_final(copy.deepcopy(context))
    )
    legacy = _final_holdout_receipt(
        "legacy_final_holdout",
        registry,
        legacy_observation,
        candidate,
    )
    retention_observation = _consume_verified_evaluation_observation(
        evaluate_retention(copy.deepcopy(context))
    )
    retention = _retention_receipt(
        registry,
        retention_observation,
        candidate,
    )
    known_observation = _consume_verified_evaluation_observation(
        evaluate_known_regression(copy.deepcopy(context))
    )
    known = _known_regression_receipt(
        registry,
        known_observation,
        candidate,
    )
    parity_observation = _consume_verified_evaluation_observation(
        evaluate_production_parity(copy.deepcopy(context))
    )
    parity = _production_parity_receipt(
        registry,
        parity_observation,
        candidate,
    )
    return {
        "schema": DOWNSTREAM_RESULT_SCHEMA,
        "status": "complete-all-downstream-gates-pass",
        "selected_seed": candidate["selected_seed"],
        "candidate_selection_receipt": copy.deepcopy(
            candidate["selection_receipt"]
        ),
        "candidate_checkpoint": copy.deepcopy(candidate["candidate_checkpoint"]),
        "stable_checkpoint": copy.deepcopy(candidate["stable_checkpoint"]),
        "candidate_weights": copy.deepcopy(candidate["candidate_weights"]),
        "stable_weights": copy.deepcopy(candidate["stable_weights"]),
        "receipts": {
            "fresh_final_holdout": fresh,
            "legacy_final_holdout": legacy,
            "retention": retention,
            "known_regression": known,
            "production_parity": parity,
        },
        "formal_ab_enrollment_ready": True,
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

    validate_downstream_registry_data(registry)
    if registry["status"] != DOWNSTREAM_READY_STATUS:
        raise ValueError("downstream result validation requires a ready registry")
    result = _exact_dict(
        result,
        {
            "schema",
            "status",
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
    observations, candidate = _consume_verified_downstream_evidence_bundle(
        verified_evidence,
        registry=registry,
    )
    try:
        expected_receipts = {
            "fresh_final_holdout": _final_holdout_receipt(
                "fresh_final_holdout",
                registry,
                observations["fresh_final_holdout"],
                candidate,
            ),
            "legacy_final_holdout": _final_holdout_receipt(
                "legacy_final_holdout",
                registry,
                observations["legacy_final_holdout"],
                candidate,
            ),
            "retention": _retention_receipt(
                registry,
                observations["retention"],
                candidate,
            ),
            "known_regression": _known_regression_receipt(
                registry,
                observations["known_regression"],
                candidate,
            ),
            "production_parity": _production_parity_receipt(
                registry,
                observations["production_parity"],
                candidate,
            ),
        }
    except DownstreamGateFailed as error:
        raise ValueError(
            f"downstream result contains failed gate: {error.gate}"
        ) from error
    expected = {
        "schema": DOWNSTREAM_RESULT_SCHEMA,
        "status": "complete-all-downstream-gates-pass",
        "selected_seed": candidate["selected_seed"],
        "candidate_selection_receipt": copy.deepcopy(
            candidate["selection_receipt"]
        ),
        "candidate_checkpoint": copy.deepcopy(candidate["candidate_checkpoint"]),
        "stable_checkpoint": copy.deepcopy(candidate["stable_checkpoint"]),
        "candidate_weights": copy.deepcopy(candidate["candidate_weights"]),
        "stable_weights": copy.deepcopy(candidate["stable_weights"]),
        "receipts": expected_receipts,
        "formal_ab_enrollment_ready": True,
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
        PurePosixPath(path)
        if type(path) is str and "\\" not in path
        else None
    )
    if (
        canonical_path is None
        or not path
        or os.path.isabs(path)
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
        "candidate-selection authorization adapter has not landed"
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
    "receipt_identity",
    "run_strength_first_downstream_gates",
    "run_strength_first_downstream_gates_core_for_tests",
    "validate_downstream_result_data",
    "validate_downstream_registry_data",
]
