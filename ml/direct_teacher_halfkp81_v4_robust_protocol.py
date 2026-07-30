#!/usr/bin/env python3
"""Strict contract for the frozen-candidate HalfKP81 v4 adjudication."""

from __future__ import annotations

import copy
import hashlib
import json
import math
import os
import re
import subprocess
from typing import Any, Mapping

import direct_teacher_halfkp81_v3_cpu_protocol as V3


PROTOCOL_SCHEMA = "shogi-direct-teacher-halfkp81-v4-robust-adjudication-plan-v1"
PROTOCOL_STATUS = "prospective-not-executed-diagnostic-values-known"
RESULT_SCHEMA = "shogi-direct-teacher-halfkp81-v4-robust-adjudication-result-v1"
CLAIM_SCHEMA = "shogi-direct-teacher-halfkp81-v4-robust-adjudication-claim-v1"
CLAIM_STATUS = "exclusive-v4-robust-adjudication-claimed-no-threshold-drift"
FAMILY = "direct-teacher-halfkp81-v4-frozen-candidate-robust-adjudication"
CLAIM_NAMESPACE = ".direct-teacher-halfkp81-v4-robust-adjudication-claims"
CLAIM_DIRECTORY_PATH = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    ".direct-teacher-halfkp81-v4-robust-adjudication-claims"
)
RESULT_PATH = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "direct-teacher-halfkp81-v4-robust-adjudication-v1/result.json"
)
DIAGNOSIS_SCHEMA = (
    "shogi-direct-teacher-halfkp81-v3-quantization-diagnosis-data-memo-v1"
)
V3_STATIC_SCHEMA = "shogi-direct-teacher-halfkp81-v3-cpu-static-sanity-result-v1"
V3_STATIC_STATUS = "failed-one-or-more-checks-v3-cpu-family-closed"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")

EXPECTED_THRESHOLDS = {
    "nearest_rank_p99_9_candidate_over_initializer_ratio_maximum": 1.05,
    "absolute_max_cp_delta_maximum": 300.0,
    "deployed_int16_teacher_mae_cp_improvement_minimum": 5.0,
    "deployed_int16_pair_accuracy_delta_minimum": 0.0,
    "weight_int16_clipping_coordinates_maximum": 0,
    "wasm_parity_mismatches_maximum": 0,
    "research_runtime_search_slowdown_percent_maximum": 5.0,
}
MINIMUM_CHECKS = {
    "deployed_int16_teacher_mae_cp_improvement_minimum",
    "deployed_int16_pair_accuracy_delta_minimum",
}
EXPECTED_KNOWN_OBSERVATIONS = {
    "nearest_rank_p99_9_candidate_over_initializer_ratio_maximum": (1.0134990893119955),
    "absolute_max_cp_delta_maximum": 238.4888916015625,
    "deployed_int16_teacher_mae_cp_improvement_minimum": 7.54571533203125,
    "deployed_int16_pair_accuracy_delta_minimum": 0.0004452720207253069,
    "weight_int16_clipping_coordinates_maximum": 0,
    "wasm_parity_mismatches_maximum": 0,
    "research_runtime_search_slowdown_percent_maximum": 2.495517211805487,
}
EXPECTED_CANDIDATE = {
    "path": (
        "/Users/yudaiyaguchi/.codex/shogi-runs/"
        "direct-teacher-halfkp81-v3-cpu-one-shot-v1/"
        "trainer-output/candidate-weights.bin"
    ),
    "bytes": 94_656_708,
    "sha256": "9ba78c70253d0f8ebfb6d0412f54532c53e5fbd495a585ae057f979c1633933a",
}
EXPECTED_PROTOCOL_IDENTITY = {
    "path": "ml/protocols/direct-teacher-halfkp81-v4-robust-adjudication-plan.json",
    "bytes": 6_444,
    "sha256": "08b7d32de73bd2b49808f808fa7ce5c737c577ceffa546e3041fafad9a0f7783",
    "schema": PROTOCOL_SCHEMA,
}
EXPECTED_DIAGNOSIS_DEPENDENCY = {
    "pull_request": 661,
    "merge_revision": "86b766a927bdd874fd3202613b025024db2a1f5c",
    "memo": {
        "path": (
            "docs/data/"
            "shogi-direct-teacher-halfkp81-v3-quantization-diagnosis-2026-07-29.json"
        ),
        "bytes": 7_508,
        "sha256": "d7d9cc7612151e011bd98a38e38ca36f2ecd96fbe508ad4f4dcff056b0ebbbd6",
        "schema": DIAGNOSIS_SCHEMA,
    },
    "analyzer": {
        "path": "ml/analyze_direct_teacher_halfkp81_v3_quantization.py",
        "bytes": 32_995,
        "sha256": "1998bbe0f75f01019ab8e05a464808f8ea456203c30d3b6933ad1c993960e51f",
    },
}
EXPECTED_V3_STATIC = {
    "path": (
        "/Users/yudaiyaguchi/.codex/shogi-runs/"
        "direct-teacher-halfkp81-v3-cpu-one-shot-v1/"
        "trainer-output/static-sanity-result.json"
    ),
    "bytes": 6_435,
    "sha256": "966b894e1ffa4947ec521d2588f559be3685cd88e2b9f285cf189a72b8bf7fdc",
    "schema": V3_STATIC_SCHEMA,
    "status": V3_STATIC_STATUS,
}
EXPECTED_CALCULATION = {
    "population": "all-22890-byte-authenticated-v3-validation-rows",
    "percentile": "nearest-rank",
    "percentile_probability": 0.999,
    "nearest_rank_index": "ceil(0.999*n)-1-on-ascending-absolute-cp-deltas",
    "ratio": "candidate-nearest-rank-p99.9-divided-by-initializer-nearest-rank-p99.9",
    "absolute_tail": "candidate-maximum-absolute-float-vs-deployed-int16-cp-delta",
    "teacher_metrics": "deployed-int16-candidate-minus-authenticated-initializer-on-identical-rows",
    "runtime_metrics": "authenticated-frozen-v3-runtime-sanity-receipt",
}
EXPECTED_PAIRED_SCREEN = {
    "authority": (
        "only-a-passing-v4-result-may-authorize-this-new-screen;"
        "the-closed-v3-paired56-authority-is-never-reused"
    ),
    "family": "direct-teacher-halfkp81-v4-fresh-opening-paired56",
    "fresh_opening_selection": {
        "pair_seed_scan_start": 1_300_001,
        "pairs": 28,
        "games_per_pair": 2,
        "colors": ["candidate-sente", "candidate-gote"],
        "prior_opening_fingerprint_overlap": 0,
        "selection": (
            "scan-upward-and-accept-the-first-28-color-swapped-opening-"
            "fingerprints-absent-from-the-complete-prior-opening-inventory"
        ),
        "manifest_freeze": "before-candidate-inference-or-game-1",
        "namespace": (
            "direct-teacher-halfkp81-v4-robust-adjudication-fresh-paired56-v1"
        ),
    },
    "search": {
        "milliseconds_per_move": 1_500,
        "opening_book": False,
        "external_mate_solver": False,
        "fallback": False,
        "maximum_plies": 512,
        "pair_workers": 12,
    },
    "decision": {
        "games": 56,
        "score_unit": "candidate-halfpoints-win2-draw1-loss0",
        "denominator_halfpoints": 112,
        "minimum_candidate_halfpoints": 62,
        "futility_stop": (
            "allowed-only-when-current-plus-all-remaining-halfpoints-is-below-62"
        ),
        "technical_faults_maximum": 0,
        "all_moves_legal": True,
        "pass_authorizes_only": "terminal-v4-paired-result-no-expanded-no-live",
        "first_playing_strength_evidence": True,
    },
}
EXPECTED_FORBIDDEN = {
    "v3_family_reopened": False,
    "v3_claim_changed": False,
    "old_v3_paired56_authorized": False,
    "additional_optimizer_created": False,
    "additional_training_rows": 0,
    "additional_epoch_or_seed": False,
    "candidate_weight_mutation": False,
    "threshold_drift_after_known_diagnosis": False,
    "expanded_stage_authorized": False,
    "live_weight_write_authorized": False,
    "playing_strength_claim_from_static": False,
}
EXPECTED_CURRENT_STATE = {
    "diagnosis_dependency_merged": True,
    "diagnostic_values_known": True,
    "v4_claim_created": False,
    "adjudication_executed": False,
    "fresh_v4_paired_games": 0,
    "old_v3_paired_games": 0,
    "expanded_stage_authorized": False,
    "live_weights_changed": False,
}


class DirectTeacherHalfkpV4RobustError(ValueError):
    """The frozen-candidate v4 adjudication contract was violated."""


def canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        + b"\n"
    )


def file_identity(path: str, label: str) -> dict[str, Any]:
    try:
        observed = V3.stable_file_identity(path, label)[0]
    except ValueError as error:
        raise DirectTeacherHalfkpV4RobustError(str(error)) from error
    return observed


def load_strict_json_file(path: str, label: str) -> tuple[Any, dict[str, Any]]:
    try:
        return V3.load_strict_json_file(path, label)
    except ValueError as error:
        raise DirectTeacherHalfkpV4RobustError(str(error)) from error


def _plain_identity(
    value: Any,
    *,
    label: str,
    schema: str | None = None,
    require_absolute: bool = True,
) -> dict[str, Any]:
    fields = {"path", "bytes", "sha256"}
    if schema is not None:
        fields.add("schema")
    if type(value) is not dict or set(value) != fields:
        raise DirectTeacherHalfkpV4RobustError(f"{label} identity fields differ")
    if (
        type(value["path"]) is not str
        or (require_absolute and not os.path.isabs(value["path"]))
        or (not require_absolute and os.path.isabs(value["path"]))
        or type(value["bytes"]) is not int
        or value["bytes"] < 1
        or type(value["sha256"]) is not str
        or SHA256_RE.fullmatch(value["sha256"]) is None
        or (schema is not None and value["schema"] != schema)
    ):
        raise DirectTeacherHalfkpV4RobustError(f"{label} identity is invalid")
    return copy.deepcopy(value)


def _same_identity(
    observed: Mapping[str, Any],
    expected: Mapping[str, Any],
    *,
    label: str,
) -> None:
    if any(
        observed.get(field) != expected.get(field)
        for field in ("path", "bytes", "sha256")
    ):
        raise DirectTeacherHalfkpV4RobustError(f"{label} identity differs")


def validate_protocol_document(value: Any) -> dict[str, Any]:
    fields = {
        "schema",
        "status",
        "family",
        "claim_boundary",
        "diagnosis_dependency",
        "source_v3",
        "candidate",
        "diagnostic_values_known_before_preregistration",
        "known_observations",
        "calculation",
        "thresholds",
        "claim",
        "paired_screen",
        "forbidden",
        "current_state",
    }
    if type(value) is not dict or set(value) != fields:
        raise DirectTeacherHalfkpV4RobustError("v4 protocol fields differ")
    if (
        value["schema"] != PROTOCOL_SCHEMA
        or value["status"] != PROTOCOL_STATUS
        or value["family"] != FAMILY
        or type(value["claim_boundary"]) is not str
        or "not a v3 retry" not in value["claim_boundary"]
        or "known before preregistration" not in value["claim_boundary"]
        or value["diagnostic_values_known_before_preregistration"] is not True
    ):
        raise DirectTeacherHalfkpV4RobustError("v4 identity/boundary differs")

    dependency = value["diagnosis_dependency"]
    if type(dependency) is not dict or set(dependency) != {
        "pull_request",
        "merge_revision",
        "memo",
        "analyzer",
    }:
        raise DirectTeacherHalfkpV4RobustError("diagnosis dependency fields differ")
    if dependency != EXPECTED_DIAGNOSIS_DEPENDENCY:
        raise DirectTeacherHalfkpV4RobustError("diagnosis merge dependency differs")
    _plain_identity(
        dependency["memo"],
        label="diagnosis memo",
        schema=DIAGNOSIS_SCHEMA,
        require_absolute=False,
    )
    _plain_identity(
        dependency["analyzer"],
        label="diagnosis analyzer",
        require_absolute=False,
    )

    source = value["source_v3"]
    if type(source) is not dict or set(source) != {
        "family",
        "claim_status",
        "family_closed",
        "static_result",
    }:
        raise DirectTeacherHalfkpV4RobustError("v3 source fields differ")
    if (
        source["family"] != "direct-teacher-halfkp81-v3-cpu"
        or source["claim_status"] != "exclusive-v3-cpu-one-shot-claimed-no-retry"
        or source["family_closed"] is not True
        or source["static_result"] != EXPECTED_V3_STATIC
    ):
        raise DirectTeacherHalfkpV4RobustError("closed v3 boundary differs")
    if value["candidate"] != EXPECTED_CANDIDATE:
        raise DirectTeacherHalfkpV4RobustError("frozen candidate differs")
    if value["known_observations"] != EXPECTED_KNOWN_OBSERVATIONS:
        raise DirectTeacherHalfkpV4RobustError("known diagnosis values differ")
    if (
        value["calculation"] != EXPECTED_CALCULATION
        or value["thresholds"] != EXPECTED_THRESHOLDS
    ):
        raise DirectTeacherHalfkpV4RobustError("v4 calculation/thresholds differ")

    claim = value["claim"]
    if claim != {
        "schema": CLAIM_SCHEMA,
        "status": CLAIM_STATUS,
        "namespace": CLAIM_NAMESPACE,
        "directory": CLAIM_DIRECTORY_PATH,
        "key": "single-family-claim.json-bound-to-exact-protocol-sha256",
        "timing": (
            "after-all-frozen-inputs-and-read-only-recomputation-reauthenticate;"
            "before-result-publication"
        ),
        "result_path": RESULT_PATH,
        "additional_claim_authorized": False,
    }:
        raise DirectTeacherHalfkpV4RobustError("v4 claim contract differs")
    if (
        value["paired_screen"] != EXPECTED_PAIRED_SCREEN
        or value["forbidden"] != EXPECTED_FORBIDDEN
        or value["current_state"] != EXPECTED_CURRENT_STATE
    ):
        raise DirectTeacherHalfkpV4RobustError(
            "v4 downstream/forbidden/current state differs"
        )
    return copy.deepcopy(value)


def validate_diagnosis_memo(
    value: Any, *, protocol: Mapping[str, Any]
) -> dict[str, Any]:
    if (
        type(value) is not dict
        or value.get("schema") != DIAGNOSIS_SCHEMA
        or value.get("status")
        != "complete-read-only-diagnosis-v3-remains-closed-no-authority"
        or value.get("formal_failure", {}).get("only_failed_check")
        != "quantized_max_abs_cp_delta_ratio_maximum"
        or value.get("formal_failure", {}).get("same_family_retry_authorized")
        is not False
        or value.get("recommendation", {}).get("selected")
        != "independent-v4-frozen-candidate-robust-adjudication"
        or value.get("recommendation", {}).get("proposal_only") is not True
        or value.get("recommendation", {}).get(
            "diagnostic_observations_known_before_preregistration"
        )
        is not True
        or value.get("recommendation", {}).get("same_v3_family_retry") is not False
        or value.get("recommendation", {}).get("no_optimizer") is not True
        or value.get("recommendation", {}).get("frozen_candidate_sha256")
        != protocol["candidate"]["sha256"]
        or value.get("recommendation", {}).get("proposed_static_checks")
        != protocol["thresholds"]
    ):
        raise DirectTeacherHalfkpV4RobustError("diagnosis memo contract differs")
    bindings = value.get("bindings", {})
    if (
        type(bindings) is not dict
        or bindings.get("candidate_weights", {}).get("bytes")
        != protocol["candidate"]["bytes"]
        or bindings.get("candidate_weights", {}).get("sha256")
        != protocol["candidate"]["sha256"]
        or bindings.get("static_result", {}).get("bytes")
        != protocol["source_v3"]["static_result"]["bytes"]
        or bindings.get("static_result", {}).get("sha256")
        != protocol["source_v3"]["static_result"]["sha256"]
        or bindings.get("static_result", {}).get("status") != V3_STATIC_STATUS
    ):
        raise DirectTeacherHalfkpV4RobustError("diagnosis input bindings differ")
    authority = value.get("authority")
    if authority != {
        "claim_opened_by_diagnosis": False,
        "optimizer_created": False,
        "training_rows": 0,
        "paired_games": 0,
        "paired56_authorized": False,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
        "playing_strength_claim_authorized": False,
    }:
        raise DirectTeacherHalfkpV4RobustError("diagnosis authority differs")
    return copy.deepcopy(value)


def validate_closed_v3_static(value: Any) -> dict[str, Any]:
    if (
        type(value) is not dict
        or value.get("schema") != V3_STATIC_SCHEMA
        or value.get("status") != V3_STATIC_STATUS
        or value.get("all_checks_passed") is not False
        or value.get("technical_faults") != 0
        or value.get("paired56_authorized") is not False
        or value.get("expanded_stage_authorized") is not False
        or value.get("live_weight_write_authorized") is not False
        or value.get("one_shot_claim", {}).get("status")
        != "exclusive-v3-cpu-one-shot-claimed-no-retry"
        or value.get("one_shot_claim", {}).get("additional_run_authorized") is not False
        or value.get("candidate_weights", {}).get("sha256")
        != EXPECTED_CANDIDATE["sha256"]
    ):
        raise DirectTeacherHalfkpV4RobustError("closed v3 static result differs")
    checks = value.get("checks")
    if type(checks) is not dict:
        raise DirectTeacherHalfkpV4RobustError("v3 static checks are absent")
    failed = sorted(name for name, item in checks.items() if not item.get("passed"))
    if failed != ["quantized_max_abs_cp_delta_ratio_maximum"]:
        raise DirectTeacherHalfkpV4RobustError("v3 failure set differs")
    return copy.deepcopy(value)


def observations_from_diagnosis(
    diagnosis: Mapping[str, Any],
    *,
    v3_static: Mapping[str, Any],
) -> dict[str, float | int]:
    if (
        diagnosis.get("schema")
        != "shogi-direct-teacher-halfkp81-v3-quantization-diagnosis-v1"
        or diagnosis.get("status") != "complete-read-only-no-authority"
        or diagnosis.get("authority", {}).get("optimizer_created") is not False
        or diagnosis.get("authority", {}).get("training_rows") != 0
        or diagnosis.get("inputs", {}).get("candidate_weights", {}).get("sha256")
        != EXPECTED_CANDIDATE["sha256"]
    ):
        raise DirectTeacherHalfkpV4RobustError("read-only diagnosis result differs")
    candidate = diagnosis.get("candidate", {})
    ratios = diagnosis.get("candidate_over_initializer_ratios", {})
    deployed = diagnosis.get("deployed_int16_candidate_over_initializer", {})
    scales = candidate.get("weight_scale", {})
    if type(scales) is not dict or not scales:
        raise DirectTeacherHalfkpV4RobustError("candidate scale diagnosis is absent")
    clipping_values = [
        item.get("int16_clipping_coordinates")
        for item in scales.values()
        if type(item) is dict
    ]
    if len(clipping_values) != len(scales) or any(
        type(item) is not int or item < 0 for item in clipping_values
    ):
        raise DirectTeacherHalfkpV4RobustError(
            "candidate clipping count is not a nonnegative integer"
        )
    clipping = sum(clipping_values)
    checks = v3_static["checks"]
    wasm_mismatches = checks["wasm_parity_mismatches_maximum"]["observed"]
    if type(wasm_mismatches) is not int or wasm_mismatches < 0:
        raise DirectTeacherHalfkpV4RobustError(
            "WASM mismatch count is not a nonnegative integer"
        )
    observed: dict[str, float | int] = {
        "nearest_rank_p99_9_candidate_over_initializer_ratio_maximum": float(
            ratios["p99_9_cp"]
        ),
        "absolute_max_cp_delta_maximum": float(
            candidate["abs_cp_delta_distribution"]["max_cp"]
        ),
        "deployed_int16_teacher_mae_cp_improvement_minimum": float(
            deployed["teacher_mae_cp_improvement"]
        ),
        "deployed_int16_pair_accuracy_delta_minimum": float(
            deployed["pair_accuracy_delta"]
        ),
        "weight_int16_clipping_coordinates_maximum": clipping,
        "wasm_parity_mismatches_maximum": wasm_mismatches,
        "research_runtime_search_slowdown_percent_maximum": float(
            checks["research_runtime_search_slowdown_percent_maximum"]["observed"]
        ),
    }
    if any(
        type(item) is bool
        or type(item) not in (int, float)
        or not math.isfinite(float(item))
        for item in observed.values()
    ):
        raise DirectTeacherHalfkpV4RobustError("v4 observation is non-finite")
    return observed


def build_checks(
    observations: Mapping[str, Any],
    *,
    thresholds: Mapping[str, Any] = EXPECTED_THRESHOLDS,
) -> dict[str, dict[str, Any]]:
    if (
        set(observations) != set(EXPECTED_THRESHOLDS)
        or thresholds != EXPECTED_THRESHOLDS
    ):
        raise DirectTeacherHalfkpV4RobustError("v4 observation/check set differs")
    checks: dict[str, dict[str, Any]] = {}
    for name, requirement in EXPECTED_THRESHOLDS.items():
        observed = observations[name]
        if (
            type(observed) is bool
            or type(observed) not in (int, float)
            or not math.isfinite(float(observed))
        ):
            raise DirectTeacherHalfkpV4RobustError(f"v4 observation is invalid: {name}")
        passed = (
            observed >= requirement
            if name in MINIMUM_CHECKS
            else observed <= requirement
        )
        checks[name] = {
            "observed": observed,
            "requirement": requirement,
            "passed": bool(passed),
        }
    return checks


def build_claim(
    *,
    protocol_identity: Mapping[str, Any],
    diagnosis_identity: Mapping[str, Any],
    candidate_identity: Mapping[str, Any],
    source_revision: str,
    owner_pid: int,
    repo_root: str,
) -> dict[str, Any]:
    if REVISION_RE.fullmatch(source_revision) is None or owner_pid < 1:
        raise DirectTeacherHalfkpV4RobustError("v4 claim owner is invalid")
    if (
        protocol_identity != EXPECTED_PROTOCOL_IDENTITY
        or diagnosis_identity != EXPECTED_DIAGNOSIS_DEPENDENCY["memo"]
        or candidate_identity != EXPECTED_CANDIDATE
    ):
        raise DirectTeacherHalfkpV4RobustError("v4 claim input identity differs")
    verify_source_revision_ancestry(source_revision, repo_root=repo_root)
    return {
        "schema": CLAIM_SCHEMA,
        "status": CLAIM_STATUS,
        "family": FAMILY,
        "namespace": CLAIM_NAMESPACE,
        "protocol": dict(protocol_identity),
        "diagnosis_dependency": dict(diagnosis_identity),
        "candidate": dict(candidate_identity),
        "source_revision": source_revision,
        "owner_pid": owner_pid,
        "diagnostic_values_known_before_preregistration": True,
        "optimizer_creation_authorized": False,
        "candidate_mutation_authorized": False,
        "old_v3_paired56_authorized": False,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
        "additional_claim_authorized": False,
    }


def validate_claim(
    value: Any,
    *,
    protocol_identity: Mapping[str, Any],
    diagnosis_identity: Mapping[str, Any],
    candidate_identity: Mapping[str, Any],
    repo_root: str,
) -> dict[str, Any]:
    expected_fields = {
        "schema",
        "status",
        "family",
        "namespace",
        "protocol",
        "diagnosis_dependency",
        "candidate",
        "source_revision",
        "owner_pid",
        "diagnostic_values_known_before_preregistration",
        "optimizer_creation_authorized",
        "candidate_mutation_authorized",
        "old_v3_paired56_authorized",
        "expanded_stage_authorized",
        "live_weight_write_authorized",
        "additional_claim_authorized",
    }
    if (
        type(value) is not dict
        or set(value) != expected_fields
        or value["schema"] != CLAIM_SCHEMA
        or value["status"] != CLAIM_STATUS
        or value["family"] != FAMILY
        or value["namespace"] != CLAIM_NAMESPACE
        or protocol_identity != EXPECTED_PROTOCOL_IDENTITY
        or diagnosis_identity != EXPECTED_DIAGNOSIS_DEPENDENCY["memo"]
        or candidate_identity != EXPECTED_CANDIDATE
        or value["protocol"] != EXPECTED_PROTOCOL_IDENTITY
        or value["diagnosis_dependency"] != EXPECTED_DIAGNOSIS_DEPENDENCY["memo"]
        or value["candidate"] != EXPECTED_CANDIDATE
        or type(value["source_revision"]) is not str
        or REVISION_RE.fullmatch(value["source_revision"]) is None
        or type(value["owner_pid"]) is not int
        or value["owner_pid"] < 1
        or value["diagnostic_values_known_before_preregistration"] is not True
        or any(
            value[field] is not False
            for field in (
                "optimizer_creation_authorized",
                "candidate_mutation_authorized",
                "old_v3_paired56_authorized",
                "expanded_stage_authorized",
                "live_weight_write_authorized",
                "additional_claim_authorized",
            )
        )
    ):
        raise DirectTeacherHalfkpV4RobustError("v4 claim differs")
    verify_source_revision_ancestry(value["source_revision"], repo_root=repo_root)
    return copy.deepcopy(value)


def build_result(
    *,
    protocol_identity: Mapping[str, Any],
    diagnosis_identity: Mapping[str, Any],
    v3_static_identity: Mapping[str, Any],
    candidate_identity: Mapping[str, Any],
    claim: Mapping[str, Any],
    observations: Mapping[str, Any],
    repo_root: str,
) -> dict[str, Any]:
    if (
        protocol_identity != EXPECTED_PROTOCOL_IDENTITY
        or diagnosis_identity != EXPECTED_DIAGNOSIS_DEPENDENCY["memo"]
        or v3_static_identity != EXPECTED_V3_STATIC
        or candidate_identity != EXPECTED_CANDIDATE
    ):
        raise DirectTeacherHalfkpV4RobustError("v4 result input identity differs")
    validate_claim(
        claim,
        protocol_identity=protocol_identity,
        diagnosis_identity=diagnosis_identity,
        candidate_identity=candidate_identity,
        repo_root=repo_root,
    )
    checks = build_checks(observations)
    all_passed = all(item["passed"] for item in checks.values())
    return {
        "schema": RESULT_SCHEMA,
        "status": (
            "passed-all-robust-checks-fresh-v4-paired56-authorized"
            if all_passed
            else "failed-one-or-more-robust-checks-v4-family-closed"
        ),
        "family": FAMILY,
        "protocol": dict(protocol_identity),
        "diagnosis_dependency": dict(diagnosis_identity),
        "source_v3_static_result": dict(v3_static_identity),
        "candidate": dict(candidate_identity),
        "claim": copy.deepcopy(claim),
        "diagnostic_values_known_before_preregistration": True,
        "checks": checks,
        "all_checks_passed": all_passed,
        "authority": {
            "fresh_v4_paired56_authorized": all_passed,
            "old_v3_paired56_authorized": False,
            "optimizer_creation_authorized": False,
            "additional_training_rows": 0,
            "candidate_mutation_authorized": False,
            "expanded_stage_authorized": False,
            "live_weight_write_authorized": False,
            "playing_strength_claim_authorized": False,
        },
    }


def validate_result(value: Any, *, repo_root: str) -> dict[str, Any]:
    fields = {
        "schema",
        "status",
        "family",
        "protocol",
        "diagnosis_dependency",
        "source_v3_static_result",
        "candidate",
        "claim",
        "diagnostic_values_known_before_preregistration",
        "checks",
        "all_checks_passed",
        "authority",
    }
    if (
        type(value) is not dict
        or set(value) != fields
        or value["schema"] != RESULT_SCHEMA
        or value["family"] != FAMILY
        or value["diagnostic_values_known_before_preregistration"] is not True
        or value["protocol"] != EXPECTED_PROTOCOL_IDENTITY
        or value["diagnosis_dependency"] != EXPECTED_DIAGNOSIS_DEPENDENCY["memo"]
        or value["source_v3_static_result"] != EXPECTED_V3_STATIC
        or value["candidate"] != EXPECTED_CANDIDATE
    ):
        raise DirectTeacherHalfkpV4RobustError("v4 result fields differ")
    claim = validate_claim(
        value["claim"],
        protocol_identity=value["protocol"],
        diagnosis_identity=value["diagnosis_dependency"],
        candidate_identity=value["candidate"],
        repo_root=repo_root,
    )
    observations = {
        name: item.get("observed")
        for name, item in value["checks"].items()
        if type(item) is dict
    }
    expected_checks = build_checks(observations)
    all_passed = all(item["passed"] for item in expected_checks.values())
    expected = build_result(
        protocol_identity=value["protocol"],
        diagnosis_identity=value["diagnosis_dependency"],
        v3_static_identity=value["source_v3_static_result"],
        candidate_identity=value["candidate"],
        claim=claim,
        observations=observations,
        repo_root=repo_root,
    )
    if value != expected or value["all_checks_passed"] is not all_passed:
        raise DirectTeacherHalfkpV4RobustError(
            "v4 result differs from deterministic reconstruction"
        )
    return copy.deepcopy(value)


def verify_source_revision_ancestry(source_revision: str, *, repo_root: str) -> None:
    """Require a real v4 source commit descending from the diagnosis dependency."""
    if (
        type(source_revision) is not str
        or REVISION_RE.fullmatch(source_revision) is None
    ):
        raise DirectTeacherHalfkpV4RobustError("v4 source revision is invalid")
    root = os.path.realpath(repo_root)
    try:
        subprocess.run(
            ["git", "cat-file", "-e", f"{source_revision}^{{commit}}"],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            [
                "git",
                "merge-base",
                "--is-ancestor",
                EXPECTED_DIAGNOSIS_DEPENDENCY["merge_revision"],
                source_revision,
            ],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        )
        for label, expected in (
            ("v4 protocol", EXPECTED_PROTOCOL_IDENTITY),
            ("diagnosis analyzer", EXPECTED_DIAGNOSIS_DEPENDENCY["analyzer"]),
        ):
            blob = subprocess.run(
                [
                    "git",
                    "cat-file",
                    "blob",
                    f"{source_revision}:{expected['path']}",
                ],
                cwd=root,
                check=True,
                capture_output=True,
            ).stdout
            if (
                len(blob) != expected["bytes"]
                or hashlib.sha256(blob).hexdigest() != expected["sha256"]
            ):
                raise DirectTeacherHalfkpV4RobustError(
                    f"{label} differs in the v4 source revision"
                )
    except (OSError, subprocess.CalledProcessError) as error:
        raise DirectTeacherHalfkpV4RobustError(
            "v4 source revision is absent or not descended from the diagnosis merge"
        ) from error


def identity_for_bytes(path: str, raw: bytes) -> dict[str, Any]:
    return {
        "path": path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
