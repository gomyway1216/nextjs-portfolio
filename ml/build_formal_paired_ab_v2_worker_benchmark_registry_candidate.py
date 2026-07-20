#!/usr/bin/env python3
"""Build one review-only READY authority for the dedicated worker benchmark.

The command is argumentless and never edits the checked-in registry. It reads
one fixed enrollment artifact, authenticates the production WASM binding and a
separate production-preflighted opening manifest, then emits a candidate for
review. Emitting the candidate does not grant authority: the benchmark entry
continues to accept only the exact registry identity pinned in source.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
from typing import Any, Callable, Mapping, Sequence

import formal_paired_ab_local_launcher as legacy
import formal_paired_ab_v2_wasm_contract as formal_contract
import formal_paired_ab_v2_worker_benchmark as benchmark


BENCHMARK_ENROLLMENT_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-formal-paired-ab-v2-worker-benchmark-enrollment.json"
)
BENCHMARK_REGISTRY_CANDIDATE_COMMAND = (
    "python3 ml/build_formal_paired_ab_v2_worker_benchmark_registry_candidate.py"
)
_ENROLLMENT_FIELDS = frozenset(
    {
        "schema",
        "benchmark_id",
        "source_revision",
        "match_binding",
        "dedicated_openings_manifest",
        "openings_preflight_receipt",
        "sealed_formal_openings_read",
        "formal_pair_journals_created",
        "formal_games_started",
        "live_weight_write",
    }
)


class FormalAbV2WorkerBenchmarkRegistryCandidateError(ValueError):
    """The fixed enrollment cannot produce one reviewable READY candidate."""


def _read_json(root: Path, relative_path: str, label: str) -> dict:
    try:
        raw = legacy._read_repo_relative_regular(
            root,
            relative_path,
            label,
            maximum_bytes=8 * 1024 * 1024,
        )
        value = legacy._strict_json_loads(raw.decode("utf-8"))
    except (OSError, UnicodeDecodeError, ValueError) as error:
        raise FormalAbV2WorkerBenchmarkRegistryCandidateError(
            f"{label} cannot be read as strict JSON"
        ) from error
    if type(value) is not dict:
        raise FormalAbV2WorkerBenchmarkRegistryCandidateError(
            f"{label} must be one JSON object"
        )
    return value


def _validate_enrollment(value: Any) -> dict:
    try:
        enrollment = legacy._exact_dict(
            value, _ENROLLMENT_FIELDS, "worker benchmark enrollment"
        )
        if enrollment["schema"] != benchmark.BENCHMARK_ENROLLMENT_SCHEMA:
            raise ValueError("worker benchmark enrollment schema differs")
        benchmark_id = legacy._require_exact_semantic_id(
            enrollment["benchmark_id"], "worker benchmark enrollment ID"
        )
        revision = enrollment["source_revision"]
        if (
            type(revision) is not str
            or benchmark.REVISION_RE.fullmatch(revision) is None
        ):
            raise ValueError("worker benchmark enrollment revision is invalid")
        match_binding = benchmark._identity(
            enrollment["match_binding"],
            "worker benchmark enrollment match binding",
            schema=formal_contract.FORMAL_WASM_MATCH_BINDING_SCHEMA,
        )
        openings = benchmark._identity(
            enrollment["dedicated_openings_manifest"],
            "worker benchmark enrollment dedicated openings",
            schema=formal_contract.FORMAL_WASM_OPENINGS_MANIFEST_SCHEMA,
        )
        preflight = benchmark._identity(
            enrollment["openings_preflight_receipt"],
            "worker benchmark enrollment openings preflight",
            schema=formal_contract.FORMAL_WASM_OPENINGS_PREFLIGHT_SCHEMA,
        )
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkRegistryCandidateError(str(error)) from error
    if (
        enrollment["sealed_formal_openings_read"] is not False
        or enrollment["formal_pair_journals_created"] != 0
        or type(enrollment["formal_pair_journals_created"]) is not int
        or enrollment["formal_games_started"] != 0
        or type(enrollment["formal_games_started"]) is not int
        or enrollment["live_weight_write"] is not False
        or "worker-benchmark" not in openings["path"]
        or "worker-benchmark" not in preflight["path"]
    ):
        raise FormalAbV2WorkerBenchmarkRegistryCandidateError(
            "worker benchmark enrollment crosses the dedicated benchmark boundary"
        )
    return {
        "schema": benchmark.BENCHMARK_ENROLLMENT_SCHEMA,
        "benchmark_id": benchmark_id,
        "source_revision": revision,
        "match_binding": match_binding,
        "dedicated_openings_manifest": openings,
        "openings_preflight_receipt": preflight,
        "sealed_formal_openings_read": False,
        "formal_pair_journals_created": 0,
        "formal_games_started": 0,
        "live_weight_write": False,
    }


def _authenticate_enrolled_artifacts(root: Path, enrollment: Mapping[str, Any]) -> None:
    try:
        binding, _, _ = legacy._parse_identity_json(
            root, enrollment["match_binding"], "worker benchmark match binding"
        )
        openings, _, _ = legacy._parse_identity_json(
            root,
            enrollment["dedicated_openings_manifest"],
            "dedicated worker benchmark openings",
        )
        preflight, _, _ = legacy._parse_identity_json(
            root,
            enrollment["openings_preflight_receipt"],
            "dedicated worker benchmark openings preflight",
        )
        formal_contract.validate_formal_wasm_match_binding(root, binding)
        captured_openings = formal_contract.validate_formal_wasm_openings_manifest(
            openings
        )
        formal_contract.validate_formal_wasm_openings_preflight_receipt(
            captured_openings, preflight
        )
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkRegistryCandidateError(str(error)) from error


def build_formal_paired_ab_v2_worker_benchmark_registry_candidate(
    *,
    _repo_root: str | Path | None = None,
    _enrollment: Mapping[str, Any] | None = None,
    _git_head: Callable[[Path], str] = benchmark._git_head,
    _candidate_consumer: Callable[[Mapping[str, Any]], None] | None = None,
) -> dict:
    """Recompute one READY benchmark authority without running a game."""

    root = Path(
        Path(__file__).resolve().parents[1] if _repo_root is None else _repo_root
    ).resolve(strict=True)
    registry = benchmark.validate_worker_benchmark_registry_data(
        _read_json(
            root,
            benchmark.BENCHMARK_REGISTRY_PATH,
            "worker benchmark registry",
        )
    )
    enrollment = _validate_enrollment(
        _read_json(
            root,
            BENCHMARK_ENROLLMENT_PATH,
            "worker benchmark enrollment",
        )
        if _enrollment is None
        else dict(_enrollment)
    )
    revision = _git_head(root)
    if revision != enrollment["source_revision"]:
        raise FormalAbV2WorkerBenchmarkRegistryCandidateError(
            "worker benchmark enrollment revision differs from exact HEAD"
        )
    implementation = {
        name: benchmark._source_identity(root, relative)
        for name, relative in benchmark._IMPLEMENTATION_PATHS.items()
    }
    _authenticate_enrolled_artifacts(root, enrollment)
    candidate = {
        "schema": benchmark.BENCHMARK_REGISTRY_SCHEMA,
        "status": benchmark.BENCHMARK_REGISTRY_READY_STATUS,
        "reason": "reviewed-dedicated-benchmark-enrollment",
        "implementation": implementation,
        "enrollments": {
            "benchmark_id": enrollment["benchmark_id"],
            "source_revision": enrollment["source_revision"],
            "match_binding": copy.deepcopy(enrollment["match_binding"]),
            "dedicated_openings_manifest": copy.deepcopy(
                enrollment["dedicated_openings_manifest"]
            ),
            "openings_preflight_receipt": copy.deepcopy(
                enrollment["openings_preflight_receipt"]
            ),
        },
        "contract": copy.deepcopy(benchmark._REGISTRY_CONTRACT),
        "gates": copy.deepcopy(benchmark._READY_GATES),
        "boundary": copy.deepcopy(benchmark._REGISTRY_BOUNDARY),
        "nonclaims": copy.deepcopy(benchmark._REGISTRY_NONCLAIMS),
    }
    validated = benchmark.validate_worker_benchmark_registry_data(candidate)
    _authenticate_enrolled_artifacts(root, enrollment)
    for name, relative in benchmark._IMPLEMENTATION_PATHS.items():
        if benchmark._source_identity(root, relative) != implementation[name]:
            raise FormalAbV2WorkerBenchmarkRegistryCandidateError(
                f"worker benchmark implementation {name} changed during build"
            )
    if (
        registry["status"] == benchmark.BENCHMARK_REGISTRY_READY_STATUS
        and registry != validated
    ):
        raise FormalAbV2WorkerBenchmarkRegistryCandidateError(
            "tracked READY benchmark registry is not an idempotent recomputation"
        )
    if _candidate_consumer is not None:
        _candidate_consumer(copy.deepcopy(validated))
    return validated


def serialize_formal_paired_ab_v2_worker_benchmark_registry_candidate(
    candidate: Mapping[str, Any],
) -> bytes:
    try:
        validated = benchmark.validate_worker_benchmark_registry_data(candidate)
        if validated["status"] != benchmark.BENCHMARK_REGISTRY_READY_STATUS:
            raise ValueError("worker benchmark candidate is not READY")
        return (
            json.dumps(validated, ensure_ascii=False, allow_nan=False, indent=2) + "\n"
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise FormalAbV2WorkerBenchmarkRegistryCandidateError(
            "worker benchmark registry candidate cannot be serialized"
        ) from error


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        print(
            "[formal-ab-v2-worker-benchmark-registry-candidate] "
            "STOP: arguments are forbidden",
            file=sys.stderr,
        )
        return 2

    def emit(candidate: Mapping[str, Any]) -> None:
        raw = serialize_formal_paired_ab_v2_worker_benchmark_registry_candidate(
            candidate
        )
        written = sys.stdout.buffer.write(raw)
        if written != len(raw):
            raise OSError("worker benchmark registry stdout write was incomplete")
        sys.stdout.buffer.flush()

    try:
        build_formal_paired_ab_v2_worker_benchmark_registry_candidate(
            _candidate_consumer=emit
        )
    except (
        OSError,
        RuntimeError,
        FormalAbV2WorkerBenchmarkRegistryCandidateError,
        ValueError,
    ) as error:
        print(
            "[formal-ab-v2-worker-benchmark-registry-candidate] " f"STOP: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
