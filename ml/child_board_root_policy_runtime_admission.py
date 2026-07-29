#!/usr/bin/env python3
"""Publish the one-shot child-board root-policy runtime admission result.

The browser runner owns measurement.  This publisher does not trust a browser
PASS bit: it authenticates the frozen student/build/sealed receipts and
recomputes every parity, latency, and harness decision from the complete raw
observations.  A completed gate miss is published once with ``admitted:false``;
an absent, malformed, or unauthorized input publishes nothing.
"""

from __future__ import annotations

import argparse
from collections.abc import Mapping, Sequence
import hashlib
import json
import math
import os
from pathlib import Path
import stat
from typing import Any
import uuid

import build_child_board_production_receipt as BUILD
import child_board_postphase_scoring as SCORING
import child_board_strength_candidate_postphase_registry as REGISTRY


SCHEMA = "shogi-child-board-root-policy-runtime-admission-result-v1"
SUCCESS_STATUS = "complete-runtime-admitted-formal-locked"
FAILURE_STATUS = "complete-runtime-admission-failed-lane-closed"
HARNESS_SCHEMA = (
    "shogi-child-board-root-policy-runtime-admission-harness-result-v1"
)
PARITY_SCHEMA = "shogi-child-board-root-policy-parity-result-v1"
LATENCY_SCHEMA = "shogi-child-board-root-policy-m4-pro-latency-result-v1"
SEALED_SCHEMA = "shogi-child-board-strength-candidate-sealed-result-v1"
SEALED_STATUS = "complete-one-shot-sealed-pass-runtime-admission-authorized"
STUDENT_SCHEMA = "shogi-child-board-root-policy-student-runtime-result-v1"
STUDENT_STATUS = "complete-fit-only-student-frozen-tune-locked"

FIXTURE_PARENTS = 1_024
BROWSER_PARENTS = 512
V9_PARENTS = 512
WARMUP_ROOTS = 100
REPEATS = 3
HARNESS_FAULT_CASES = 16 * 2 * 7 * REPEATS

INCREMENTAL_LIMITS = {
    "p50_milliseconds": 12.0,
    "p95_milliseconds": 25.0,
    "p99_milliseconds": 40.0,
    "maximum_milliseconds": 75.0,
}
END_TO_END_LIMITS = {
    "p50_milliseconds": 20.0,
    "p95_milliseconds": 40.0,
    "p99_milliseconds": 60.0,
    "maximum_milliseconds": 100.0,
}

DEFAULT_RUN_ROOT = Path(
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "child-board-root-policy-student-runtime-v1"
)
_SHA256_HEX = frozenset("0123456789abcdef")


class RuntimeAdmissionError(ValueError):
    """The one-shot runtime admission input or publication is invalid."""


def _reject_constant(value: str) -> None:
    raise RuntimeAdmissionError(f"non-finite JSON number is forbidden: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise RuntimeAdmissionError(
                f"duplicate JSON key is forbidden: {key}"
            )
        result[key] = value
    return result


def _read_regular(path: Path, label: str) -> bytes:
    try:
        metadata = path.lstat()
    except OSError as error:
        raise RuntimeAdmissionError(f"{label} is unavailable: {path}") from error
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise RuntimeAdmissionError(f"{label} must be a regular non-symlink file")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
        with os.fdopen(descriptor, "rb") as stream:
            return stream.read()
    except OSError as error:
        raise RuntimeAdmissionError(f"{label} could not be read safely") from error


def _strict_json(path: Path, label: str) -> tuple[dict[str, Any], bytes]:
    raw = _read_regular(path, label)
    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeAdmissionError(
            f"{label} is not strict UTF-8 JSON"
        ) from error
    if type(value) is not dict:
        raise RuntimeAdmissionError(f"{label} root must be an object")
    return value, raw


def _canonical(value: object) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
        + b"\n"
    )


def _identity(path: Path, raw: bytes | None = None) -> dict[str, object]:
    payload = _read_regular(path, str(path)) if raw is None else raw
    return {
        "path": str(path.resolve(strict=True)),
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }


def _require_identity(
    value: object,
    *,
    path: Path,
    label: str,
) -> dict[str, object]:
    actual = _identity(path)
    if type(value) is not dict or set(value) != {"path", "bytes", "sha256"}:
        raise RuntimeAdmissionError(f"{label} identity is malformed")
    try:
        registered_path = str(Path(value["path"]).resolve(strict=True))
    except (OSError, TypeError) as error:
        raise RuntimeAdmissionError(f"{label} path is unavailable") from error
    if {
        "path": registered_path,
        "bytes": value["bytes"],
        "sha256": value["sha256"],
    } != actual:
        raise RuntimeAdmissionError(f"{label} identity drift")
    return actual


def _exact_keys(
    value: Mapping[str, Any],
    expected: set[str],
    label: str,
) -> None:
    if type(value) is not dict or set(value) != expected:
        raise RuntimeAdmissionError(f"{label} fields differ")


def _is_sha256(value: object) -> bool:
    return (
        type(value) is str
        and len(value) == 64
        and all(character in _SHA256_HEX for character in value)
    )


def _finite_nonnegative(value: object, label: str) -> float:
    if type(value) not in (int, float):
        raise RuntimeAdmissionError(f"{label} must be numeric")
    number = float(value)
    if not math.isfinite(number) or number < 0:
        raise RuntimeAdmissionError(f"{label} must be finite and non-negative")
    return number


def nearest_rank(values: Sequence[float], percentile: float) -> float:
    """Protocol percentile: one-indexed nearest rank ``ceil(p*N)``."""

    if (
        not values
        or not 0 < percentile <= 1
        or any(not math.isfinite(value) or value < 0 for value in values)
    ):
        raise RuntimeAdmissionError("latency samples are incomplete or invalid")
    ordered = sorted(values)
    return ordered[math.ceil(percentile * len(ordered)) - 1]


def _latency_summary(values: Sequence[float]) -> dict[str, float]:
    return {
        "p50_milliseconds": nearest_rank(values, 0.50),
        "p95_milliseconds": nearest_rank(values, 0.95),
        "p99_milliseconds": nearest_rank(values, 0.99),
        "maximum_milliseconds": nearest_rank(values, 1.00),
    }


def _validate_student(
    student: Mapping[str, Any],
) -> tuple[dict[str, object], dict[str, object], dict[str, object]]:
    if (
        student.get("schema") != STUDENT_SCHEMA
        or student.get("status") != STUDENT_STATUS
        or student.get("tune_opened") is not False
        or student.get("sealed_opened") is not False
        or student.get("runtime_admission_executed") is not False
        or student.get("live_weights_changed") is not False
    ):
        raise RuntimeAdmissionError("student terminal result is not frozen")
    runtime = student.get("runtime_artifacts")
    parity_fixture = student.get("parity_fixture")
    if type(runtime) is not dict or type(parity_fixture) is not dict:
        raise RuntimeAdmissionError("student artifact graph is absent")
    tensor_value = runtime.get("tensor")
    manifest_value = runtime.get("manifest")
    fixture_value = parity_fixture.get("artifact")
    for value, label in (
        (tensor_value, "student tensor"),
        (manifest_value, "student manifest"),
        (fixture_value, "parity fixture"),
    ):
        if type(value) is not dict or type(value.get("path")) is not str:
            raise RuntimeAdmissionError(f"{label} identity is malformed")
    tensor = _require_identity(
        tensor_value,
        path=Path(tensor_value["path"]),
        label="student tensor",
    )
    manifest = _require_identity(
        manifest_value,
        path=Path(manifest_value["path"]),
        label="student manifest",
    )
    fixture = _require_identity(
        fixture_value,
        path=Path(fixture_value["path"]),
        label="parity fixture",
    )
    if (
        parity_fixture.get("schema")
        != "shogi-child-board-root-policy-parity-fixture-receipt-v1"
        or parity_fixture.get("status")
        != "complete-fit-only-frozen-before-optimizer"
        or parity_fixture.get("parents") != FIXTURE_PARENTS
        or parity_fixture.get("browser_parents") != BROWSER_PARENTS
        or parity_fixture.get("v9_parents") != V9_PARENTS
        or parity_fixture.get("tune_parents") != 0
        or parity_fixture.get("sealed_parents") != 0
    ):
        raise RuntimeAdmissionError("parity fixture receipt is not frozen fit-only")
    return tensor, manifest, fixture


def _validate_sealed(
    sealed: Mapping[str, Any],
    *,
    contract: Mapping[str, Any],
    frozen_checkpoint_sha256: str,
) -> None:
    try:
        SCORING._validate_terminal_result(  # type: ignore[attr-defined]
            sealed,
            lane="sealed",
            contract=contract,
        )
    except (KeyError, SCORING.ScoringError) as error:
        raise RuntimeAdmissionError("sealed terminal result is invalid") from error
    artifacts = sealed.get("artifacts")
    artifact_sha256 = sealed.get("artifact_sha256")
    if (
        sealed.get("schema") != SEALED_SCHEMA
        or sealed.get("status") != SEALED_STATUS
        or sealed.get("pass") is not True
        or sealed.get("tune_opened") is not True
        or sealed.get("sealed_labels_generated") is not True
        or sealed.get("sealed_scores_opened") is not True
        or sealed.get("live_weights_changed") is not False
        or sealed.get("deployment_authorized") is not False
        or type(artifacts) is not dict
        or set(artifacts)
        != {"seed42_teacher", "seed314159_teacher", "frozen_student"}
        or any(
            type(value) is not dict or value.get("pass") is not True
            for value in artifacts.values()
        )
        or type(artifact_sha256) is not dict
        or artifact_sha256.get("frozen_student") != frozen_checkpoint_sha256
    ):
        raise RuntimeAdmissionError(
            "sealed passage does not authorize runtime admission"
        )


def _validate_harness(
    value: Mapping[str, Any],
) -> tuple[dict[str, bool], list[str]]:
    expected = {
        "schema",
        "status",
        "providerKind",
        "admitted",
        "harnessChecksPassed",
        "tensorSpecificAdmission",
        "fixtureCount",
        "warmupRoots",
        "measuredRoots",
        "repeats",
        "fixtureIdentityReceipt",
        "warmupInferenceCalls",
        "measuredRootInferenceCalls",
        "rootInferenceCalls",
        "disabledInferenceCalls",
        "nonRootStudentCalls",
        "studentToEvaluatorFlows",
        "studentToTtFlows",
        "studentToUiFlows",
        "disabledByteParityReceipts",
        "determinismReceipts",
        "latency",
        "faultsChecked",
        "staticDependencyViolations",
        "failures",
        "liveWeightsChanged",
        "tuneOpened",
        "sealedOpened",
    }
    _exact_keys(value, expected, "runtime harness result")
    if (
        value["schema"] != HARNESS_SCHEMA
        or value["providerKind"] != "frozen-student"
        or value["admitted"] is not False
        or value["tensorSpecificAdmission"]
        != "harness-pass-awaiting-authorized-publication"
        or value["fixtureCount"] != FIXTURE_PARENTS
        or value["warmupRoots"] != WARMUP_ROOTS
        or value["measuredRoots"] != FIXTURE_PARENTS
        or value["repeats"] != REPEATS
        or value["liveWeightsChanged"] is not False
        or value["tuneOpened"] is not False
        or value["sealedOpened"] is not False
    ):
        raise RuntimeAdmissionError("runtime harness contract differs")
    failures = value["failures"]
    static = value["staticDependencyViolations"]
    if type(failures) is not list or not all(type(item) is str for item in failures):
        raise RuntimeAdmissionError("runtime harness failures are malformed")
    if type(static) is not list or not all(type(item) is str for item in static):
        raise RuntimeAdmissionError("runtime harness static failures are malformed")
    byte_receipt = value["fixtureIdentityReceipt"]
    if (
        type(byte_receipt) is not dict
        or set(byte_receipt) != {"bytes", "sha256"}
        or type(byte_receipt["bytes"]) is not int
        or byte_receipt["bytes"] < 1
        or not _is_sha256(byte_receipt["sha256"])
    ):
        raise RuntimeAdmissionError("runtime harness fixture identity is malformed")
    disabled_receipts = value["disabledByteParityReceipts"]
    determinism_receipts = value["determinismReceipts"]
    if (
        type(disabled_receipts) is not list
        or type(determinism_receipts) is not list
        or len(disabled_receipts) != FIXTURE_PARENTS
        or len(determinism_receipts) != FIXTURE_PARENTS
    ):
        raise RuntimeAdmissionError("runtime harness receipt table is incomplete")
    for receipt in [*disabled_receipts, *determinism_receipts]:
        if (
            type(receipt) is not dict
            or set(receipt) != {"bytes", "sha256"}
            or type(receipt["bytes"]) is not int
            or receipt["bytes"] < 0
            or not _is_sha256(receipt["sha256"])
        ):
            raise RuntimeAdmissionError(
                "runtime harness byte receipt is malformed"
            )
    harness_latency = value["latency"]
    if (
        type(harness_latency) is not dict
        or set(harness_latency)
        != {
            "rawIncrementalMilliseconds",
            "rawEndToEndMilliseconds",
            "incrementalP50Milliseconds",
            "incrementalP95Milliseconds",
            "endToEndP50Milliseconds",
            "endToEndP95Milliseconds",
        }
        or type(harness_latency["rawIncrementalMilliseconds"]) is not list
        or type(harness_latency["rawEndToEndMilliseconds"]) is not list
        or len(harness_latency["rawIncrementalMilliseconds"])
        != FIXTURE_PARENTS
        or len(harness_latency["rawEndToEndMilliseconds"])
        != FIXTURE_PARENTS
    ):
        raise RuntimeAdmissionError("runtime harness latency table is incomplete")
    checks = {
        "harness_complete": (
            value["status"] == "complete-frozen-student-harness-pass"
            and value["harnessChecksPassed"] is True
        ),
        "disabled_inference_zero": value["disabledInferenceCalls"] == 0,
        "non_root_student_calls_zero": value["nonRootStudentCalls"] == 0,
        "student_to_evaluator_flows_zero": value["studentToEvaluatorFlows"] == 0,
        "student_to_tt_flows_zero": value["studentToTtFlows"] == 0,
        "student_to_ui_flows_zero": value["studentToUiFlows"] == 0,
        "dependency_firewall": len(static) == 0,
        "harness_failures_zero": len(failures) == 0,
        "warmup_inference_count": value["warmupInferenceCalls"] == WARMUP_ROOTS,
        "measured_inference_count": (
            value["measuredRootInferenceCalls"]
            == FIXTURE_PARENTS * REPEATS
        ),
        "root_inference_count": (
            value["rootInferenceCalls"]
            == WARMUP_ROOTS + FIXTURE_PARENTS * REPEATS
        ),
        "fault_case_count": value["faultsChecked"] == HARNESS_FAULT_CASES,
    }
    counters = (
        "warmupInferenceCalls",
        "measuredRootInferenceCalls",
        "rootInferenceCalls",
        "disabledInferenceCalls",
        "nonRootStudentCalls",
        "studentToEvaluatorFlows",
        "studentToTtFlows",
        "studentToUiFlows",
        "faultsChecked",
    )
    if any(
        type(value[name]) is not int or value[name] < 0
        for name in counters
    ):
        raise RuntimeAdmissionError("runtime harness counters are malformed")
    return checks, [*failures, *static]


def _validate_parity(
    value: Mapping[str, Any],
    *,
    fixture: Mapping[str, object],
    tensor: Mapping[str, object],
    manifest: Mapping[str, object],
    build_receipt: Mapping[str, object],
) -> dict[str, bool]:
    expected = {
        "schema",
        "status",
        "fixture",
        "student_tensor",
        "student_manifest",
        "production_build_receipt",
        "parents",
        "browser_parents",
        "v9_parents",
        "projected_moves",
        "parent_and_production_usi_sequence_matches",
        "live_nnue_child_cp_exact_matches",
        "finite_output_matches",
        "top1_matches",
        "pair_direction_matches",
        "pair_direction_total",
        "maximum_absolute_combined_cp_error",
        "mean_absolute_combined_cp_error",
        "stable_order_matches",
        "stable_order_total",
        "technical_faults",
        "live_weights_changed",
    }
    _exact_keys(value, expected, "parity result")
    if (
        value["schema"] != PARITY_SCHEMA
        or value["status"] != "complete-frozen-student-parity-measured"
        or value["fixture"] != fixture
        or value["student_tensor"] != tensor
        or value["student_manifest"] != manifest
        or value["production_build_receipt"] != build_receipt
        or value["parents"] != FIXTURE_PARENTS
        or value["browser_parents"] != BROWSER_PARENTS
        or value["v9_parents"] != V9_PARENTS
        or value["live_weights_changed"] is not False
    ):
        raise RuntimeAdmissionError("parity result binding differs")
    integers = (
        "projected_moves",
        "parent_and_production_usi_sequence_matches",
        "live_nnue_child_cp_exact_matches",
        "finite_output_matches",
        "top1_matches",
        "pair_direction_matches",
        "pair_direction_total",
        "stable_order_matches",
        "stable_order_total",
        "technical_faults",
    )
    if any(type(value[key]) is not int or value[key] < 0 for key in integers):
        raise RuntimeAdmissionError("parity counters are malformed")
    maximum_error = _finite_nonnegative(
        value["maximum_absolute_combined_cp_error"],
        "maximum parity error",
    )
    mean_error = _finite_nonnegative(
        value["mean_absolute_combined_cp_error"],
        "mean parity error",
    )
    projected = value["projected_moves"]
    return {
        "fixture_and_model_sha_match": True,
        "parent_and_production_usi_sequence_match": (
            value["parent_and_production_usi_sequence_matches"]
            == FIXTURE_PARENTS
        ),
        "live_nnue_child_cp_exact_match": (
            value["live_nnue_child_cp_exact_matches"] == projected
        ),
        "finite_outputs": value["finite_output_matches"] == projected,
        "top1_match": value["top1_matches"] == FIXTURE_PARENTS,
        "pair_direction_match": (
            value["pair_direction_total"] > 0
            and value["pair_direction_matches"]
            == value["pair_direction_total"]
        ),
        "maximum_absolute_combined_cp_error": maximum_error <= 0.5,
        "mean_absolute_combined_cp_error": mean_error <= 0.05,
        "stable_order_match": (
            value["stable_order_total"] > 0
            and value["stable_order_matches"] == value["stable_order_total"]
        ),
        "parity_technical_faults_zero": value["technical_faults"] == 0,
    }


def _validate_latency(
    value: Mapping[str, Any],
    *,
    fixture: Mapping[str, object],
    tensor: Mapping[str, object],
    manifest: Mapping[str, object],
    build_receipt: Mapping[str, object],
    build_environment: Mapping[str, object],
) -> tuple[dict[str, bool], dict[str, object]]:
    expected = {
        "schema",
        "status",
        "fixture",
        "student_tensor",
        "student_manifest",
        "production_build_receipt",
        "environment",
        "warmup_roots",
        "idle_quiescence_milliseconds",
        "measured_roots",
        "request_sequence_numbers",
        "response_sequence_numbers",
        "raw_incremental_milliseconds",
        "raw_end_to_end_milliseconds",
        "summaries",
        "technical_faults",
        "live_weights_changed",
    }
    _exact_keys(value, expected, "latency result")
    if (
        value["schema"] != LATENCY_SCHEMA
        or value["status"] != "complete-m4-pro-production-chromium-measured"
        or value["fixture"] != fixture
        or value["student_tensor"] != tensor
        or value["student_manifest"] != manifest
        or value["production_build_receipt"] != build_receipt
        or value["warmup_roots"] != WARMUP_ROOTS
        or value["idle_quiescence_milliseconds"] != 5_000
        or value["measured_roots"] != FIXTURE_PARENTS
        or value["live_weights_changed"] is not False
    ):
        raise RuntimeAdmissionError("latency result binding differs")
    environment = value["environment"]
    _exact_keys(
        environment,
        {
            "hardware_chip",
            "os",
            "architecture",
            "power_source",
            "low_power_mode",
            "foreground",
            "browser_name",
            "browser_version",
            "wasm",
            "inference_workers",
            "devtools_open",
            "clock",
            "explicit_gc",
            "build_git_commit",
        },
        "latency environment",
    )
    environment_ok = (
        environment["hardware_chip"] == "Apple M4 Pro"
        and type(environment["os"]) is str
        and bool(environment["os"])
        and environment["architecture"] == "arm64"
        and environment["power_source"] == "AC"
        and environment["low_power_mode"] is False
        and environment["foreground"] is True
        and environment["browser_name"] == "Chromium"
        and type(environment["browser_version"]) is str
        and bool(environment["browser_version"])
        and environment["wasm"] is True
        and type(environment["inference_workers"]) is int
        and environment["inference_workers"] == 1
        and environment["devtools_open"] is False
        and environment["clock"] == "performance.now()"
        and environment["explicit_gc"] is False
        and environment["build_git_commit"]
        == build_environment.get("source_git_commit")
    )
    requests = value["request_sequence_numbers"]
    responses = value["response_sequence_numbers"]
    if (
        type(requests) is not list
        or type(responses) is not list
        or len(requests) != FIXTURE_PARENTS
        or requests != responses
        or any(type(item) is not int or item <= 0 for item in requests)
        or len(set(requests)) != FIXTURE_PARENTS
    ):
        raise RuntimeAdmissionError("latency sequence numbers are incomplete")
    raw_incremental = value["raw_incremental_milliseconds"]
    raw_end_to_end = value["raw_end_to_end_milliseconds"]
    if (
        type(raw_incremental) is not list
        or type(raw_end_to_end) is not list
        or len(raw_incremental) != FIXTURE_PARENTS
        or len(raw_end_to_end) != FIXTURE_PARENTS
    ):
        raise RuntimeAdmissionError("latency raw sample count differs")
    incremental = [
        _finite_nonnegative(item, "incremental latency")
        for item in raw_incremental
    ]
    end_to_end = [
        _finite_nonnegative(item, "end-to-end latency")
        for item in raw_end_to_end
    ]
    incremental_summary = _latency_summary(incremental)
    end_to_end_summary = _latency_summary(end_to_end)
    expected_summaries = {
        "incremental": incremental_summary,
        "end_to_end": end_to_end_summary,
    }
    if value["summaries"] != expected_summaries:
        raise RuntimeAdmissionError("latency summaries were not exactly recomputed")
    if type(value["technical_faults"]) is not int or value["technical_faults"] < 0:
        raise RuntimeAdmissionError("latency technical fault count is malformed")
    checks = {
        "m4_pro_environment": environment_ok,
        **{
            f"incremental_{key}_maximum": incremental_summary[key] <= limit
            for key, limit in INCREMENTAL_LIMITS.items()
        },
        **{
            f"end_to_end_{key}_maximum": end_to_end_summary[key] <= limit
            for key, limit in END_TO_END_LIMITS.items()
        },
        "latency_technical_faults_zero": value["technical_faults"] == 0,
    }
    return checks, {
        "incremental": incremental_summary,
        "end_to_end": end_to_end_summary,
        "limits": {
            "incremental": dict(INCREMENTAL_LIMITS),
            "end_to_end": dict(END_TO_END_LIMITS),
        },
    }


def decide_runtime_admission(
    *,
    harness: Mapping[str, Any],
    parity: Mapping[str, Any],
    latency: Mapping[str, Any],
    fixture: Mapping[str, object],
    tensor: Mapping[str, object],
    manifest: Mapping[str, object],
    build_receipt: Mapping[str, object],
    build_environment: Mapping[str, object],
) -> dict[str, object]:
    """Validate complete observations and recompute the terminal decision."""

    harness_checks, harness_failures = _validate_harness(harness)
    parity_checks = _validate_parity(
        parity,
        fixture=fixture,
        tensor=tensor,
        manifest=manifest,
        build_receipt=build_receipt,
    )
    latency_checks, latency_summary = _validate_latency(
        latency,
        fixture=fixture,
        tensor=tensor,
        manifest=manifest,
        build_receipt=build_receipt,
        build_environment=build_environment,
    )
    checks = {
        "harness": harness_checks,
        "parity": parity_checks,
        "latency": latency_checks,
    }
    failed = [
        f"{group}.{name}"
        for group, group_checks in checks.items()
        for name, passed in group_checks.items()
        if not passed
    ]
    failed.extend(f"harness.reported:{value}" for value in harness_failures)
    admitted = not failed
    return {
        "admitted": admitted,
        "status": SUCCESS_STATUS if admitted else FAILURE_STATUS,
        "checks": checks,
        "failures": failed,
        "latency": latency_summary,
    }


def _publish_create_only(path: Path, raw: bytes) -> None:
    if path.exists():
        if _read_regular(path, "runtime admission result") != raw:
            raise RuntimeAdmissionError("existing runtime admission result drift")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.parent / (
        f".{path.name}.tmp-{os.getpid()}-{uuid.uuid4().hex}"
    )
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_NOFOLLOW", 0)
    )
    try:
        descriptor = os.open(temporary, flags, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, path)
        temporary.unlink()
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    except OSError as error:
        raise RuntimeAdmissionError(
            "create-only runtime admission publication failed"
        ) from error
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def run_runtime_admission(
    *,
    repo_root: Path,
    registry: Mapping[str, Any],
    paths_override: Mapping[str, Path] | None = None,
) -> dict[str, Any]:
    """Validate the authorized frozen graph and publish its one result."""

    student_output = registry["outputs"]["student_runtime"]
    sealed_output = registry["outputs"]["sealed"]
    defaults = {
        "student_result": Path(student_output["result"]),
        "sealed_result": Path(sealed_output["result"]),
        "production_build_receipt": DEFAULT_RUN_ROOT
        / "production-build-receipt.json",
        "harness_result": DEFAULT_RUN_ROOT
        / "runtime-admission-harness-result.json",
        "parity_result": DEFAULT_RUN_ROOT / "parity-1024-result.json",
        "latency_result": DEFAULT_RUN_ROOT / "m4-pro-latency-result.json",
        "result": DEFAULT_RUN_ROOT / "runtime-admission-result.json",
    }
    paths = defaults if paths_override is None else dict(paths_override)
    if set(paths) != set(defaults):
        raise RuntimeAdmissionError("runtime admission path set mismatch")

    student, student_raw = _strict_json(
        paths["student_result"], "student terminal result"
    )
    student_identity = _identity(paths["student_result"], student_raw)
    tensor, manifest, fixture = _validate_student(student)
    training = student.get("training")
    if type(training) is not dict:
        raise RuntimeAdmissionError("student training receipt is absent")
    checkpoint = training.get("final_checkpoint")
    if type(checkpoint) is not dict or type(checkpoint.get("path")) is not str:
        raise RuntimeAdmissionError("student final checkpoint is absent")
    frozen_checkpoint = _require_identity(
        checkpoint,
        path=Path(checkpoint["path"]),
        label="student final checkpoint",
    )

    sealed, sealed_raw = _strict_json(
        paths["sealed_result"], "sealed terminal result"
    )
    _validate_sealed(
        sealed,
        contract=registry["execution_contract"],
        frozen_checkpoint_sha256=str(frozen_checkpoint["sha256"]),
    )

    build, build_raw = _strict_json(
        paths["production_build_receipt"], "production build receipt"
    )
    try:
        BUILD._verify_existing_receipt(  # type: ignore[attr-defined]
            build,
            student_result_identity=student_identity,
        )
    except (BUILD.BuildReceiptError, OSError) as error:
        raise RuntimeAdmissionError(
            "production build receipt is invalid"
        ) from error
    build_identity = _identity(paths["production_build_receipt"], build_raw)
    outputs = build.get("outputs")
    if (
        type(outputs) is not dict
        or outputs.get("student_tensor", {}).get("sha256") != tensor["sha256"]
        or outputs.get("student_tensor", {}).get("bytes") != tensor["bytes"]
        or outputs.get("student_manifest", {}).get("sha256")
        != manifest["sha256"]
        or outputs.get("student_manifest", {}).get("bytes")
        != manifest["bytes"]
    ):
        raise RuntimeAdmissionError("production build student assets differ")

    harness, harness_raw = _strict_json(
        paths["harness_result"], "runtime harness result"
    )
    parity, parity_raw = _strict_json(paths["parity_result"], "parity result")
    latency, latency_raw = _strict_json(
        paths["latency_result"], "latency result"
    )
    decision = decide_runtime_admission(
        harness=harness,
        parity=parity,
        latency=latency,
        fixture=fixture,
        tensor=tensor,
        manifest=manifest,
        build_receipt=build_identity,
        build_environment=build["environment"],
    )
    result = {
        "schema": SCHEMA,
        "status": decision["status"],
        "admitted": decision["admitted"],
        "inputs": {
            "student_result": student_identity,
            "sealed_result": _identity(paths["sealed_result"], sealed_raw),
            "production_build_receipt": build_identity,
            "runtime_harness_result": _identity(
                paths["harness_result"], harness_raw
            ),
            "parity_result": _identity(paths["parity_result"], parity_raw),
            "latency_result": _identity(paths["latency_result"], latency_raw),
        },
        "artifacts": {
            "student_checkpoint": frozen_checkpoint,
            "student_tensor": tensor,
            "student_manifest": manifest,
            "parity_fixture": fixture,
        },
        "checks": decision["checks"],
        "failures": decision["failures"],
        "latency": decision["latency"],
        "formal_registry_creation_authorized": decision["admitted"],
        "formal_games_authorized": False,
        "external_calibration_authorized": False,
        "deployment_authorized": False,
        "live_weights_changed": False,
        "rerun_allowed": False,
    }
    _publish_create_only(paths["result"], _canonical(result))
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    root = args.repo_root.resolve()
    try:
        registry = REGISTRY.validate_checked_in_registry(root)
        result = run_runtime_admission(repo_root=root, registry=registry)
    except (
        OSError,
        RuntimeAdmissionError,
        REGISTRY.RegistryError,
    ) as error:
        raise SystemExit(f"runtime admission refused: {error}") from error
    print(
        json.dumps(
            {
                "schema": result["schema"],
                "status": result["status"],
                "admitted": result["admitted"],
                "failures": result["failures"],
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0 if result["admitted"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
