"""Determinism-gated 2/4/8/12 pair-worker benchmark harness.

The harness is intentionally candidate-agnostic and does not enroll or launch
formal games on its own.  A later reviewed bridge may provide an authenticated
round callback. Selection is impossible unless every round returns the exact
same ordered transcript SHA-256 vector.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor, as_completed
import copy
import hashlib
import os
from pathlib import Path
import re
import stat
import threading
import time
from typing import Any

import formal_paired_ab_local_launcher as legacy
import formal_paired_ab_v2_wasm_contract as formal_contract
from formal_paired_ab_v2_wasm_contract import PAIR_WORKER_CANDIDATES


BENCHMARK_PAIRS_PER_ROUND = 12
BENCHMARK_GAMES_PER_ROUND = BENCHMARK_PAIRS_PER_ROUND * 2
BENCHMARK_SEQUENCE = (2, 4, 8, 12, 12, 8, 4, 2)
REPETITIONS_PER_SETTING = 2
BENCHMARK_ROUND_RESULT_SCHEMA = (
    "shogi-formal-paired-ab-v2-worker-benchmark-round-result-v1"
)
BENCHMARK_RECEIPT_SCHEMA = "shogi-formal-paired-ab-v2-worker-benchmark-receipt-v1"
BOUND_BENCHMARK_RECEIPT_SCHEMA = (
    "shogi-formal-paired-ab-v2-bound-worker-benchmark-receipt-v1"
)
BENCHMARK_REGISTRY_SCHEMA = "shogi-formal-paired-ab-v2-worker-benchmark-registry-v1"
BENCHMARK_REGISTRY_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-formal-paired-ab-v2-worker-benchmark-registry.json"
)
BENCHMARK_REGISTRY_BLOCKED_STATUS = "BLOCKED"
BENCHMARK_REGISTRY_READY_STATUS = "READY"
BENCHMARK_OUTPUT_DIRECTORY = (
    ".codex/shogi-runs/" "floodgate-q1-2026-formal-paired-ab-v2-worker-benchmark-v1"
)
BENCHMARK_OUTPUT_RECEIPT_NAME = "worker-benchmark-receipt.json"
BENCHMARK_ENROLLMENT_SCHEMA = "shogi-formal-paired-ab-v2-worker-benchmark-enrollment-v1"
FORMAL_READY_REGISTRY_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-v2-wasm-ready-run-registry-v1"
)
FORMAL_READY_STATUS = "ready-local-only-benchmark-bound"
FORMAL_ATTEMPT_LEDGER_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-v2-wasm-attempt-ledger-v1"
)
SOURCE_IDENTITY_SCHEMA = "git-tracked-source-v1"
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
SELECTION_CONDITION = (
    "lowest-two-sample-total-elapsed-ns-after-exact-transcript-hash-equality"
)

_PINNED_BENCHMARK_REGISTRY_IDENTITY = {
    "path": BENCHMARK_REGISTRY_PATH,
    "bytes": 1_809,
    "sha256": "6f911078671bccf9d40d53d6f1227f9cc90759dbf511de21dcfaeae83469b5b2",
    "schema": BENCHMARK_REGISTRY_SCHEMA,
}

# Formal execution deliberately remains closed. A later reviewed change may
# replace this with one exact READY registry identity only after enrolling a
# real bound benchmark receipt.
_PINNED_FORMAL_READY_REGISTRY_IDENTITY: dict[str, Any] | None = None

_IMPLEMENTATION_PATHS = {
    "wasm_contract": "ml/formal_paired_ab_v2_wasm_contract.py",
    "wasm_match_launcher": "ml/formal_paired_ab_v2_wasm_match_launcher.py",
    "pair_entry": "ml/run-formal-paired-ab-v2-wasm-pair.ts",
    "match_adapter": "ml/formal-paired-ab-v2-wasm-match-adapter.ts",
    "isolated_player": "ml/formal-paired-ab-v2-wasm-player-child.ts",
    "wasm_module_source": ("src/components/game/ShogiImproved/wasm/shogiWasmBase64.ts"),
}
_REGISTRY_FIELDS = frozenset(
    {
        "schema",
        "status",
        "reason",
        "implementation",
        "enrollments",
        "contract",
        "gates",
        "boundary",
        "nonclaims",
    }
)
_REGISTRY_ENROLLMENT_FIELDS = frozenset(
    {
        "benchmark_id",
        "source_revision",
        "match_binding",
        "dedicated_openings_manifest",
        "openings_preflight_receipt",
    }
)
_REGISTRY_GATE_FIELDS = frozenset(
    {
        "implementation_code_pinned",
        "candidate_and_stable_weights_verified",
        "dedicated_openings_verified",
        "production_rules_preflight_verified",
        "benchmark_execution_authorized",
        "formal_execution_authorized",
        "production_weight_write_authorized",
    }
)
_REGISTRY_BOUNDARY = {
    "argumentless_production_entry": True,
    "caller_selected_registry": False,
    "dedicated_benchmark_openings_only": True,
    "sealed_formal_openings_access": False,
    "formal_pair_journal_access": False,
    "network": False,
    "cloud": False,
    "aws": False,
    "gcp": False,
    "live_weight_write": False,
}
_REGISTRY_NONCLAIMS = {
    "benchmark_rounds_started": 0,
    "benchmark_pairs_started": 0,
    "benchmark_games_started": 0,
    "formal_pairs_started": 0,
    "formal_games_started": 0,
    "candidate_stronger": False,
    "high_dan_calibrated": False,
    "live_weights_changed": False,
}
_REGISTRY_CONTRACT = {
    "worker_candidates": list(PAIR_WORKER_CANDIDATES),
    "round_sequence": list(BENCHMARK_SEQUENCE),
    "pairs_per_round": BENCHMARK_PAIRS_PER_ROUND,
    "games_per_round": BENCHMARK_GAMES_PER_ROUND,
    "repetitions_per_setting": REPETITIONS_PER_SETTING,
    "selection_condition": SELECTION_CONDITION,
}
_BLOCKED_GATES = {field: False for field in _REGISTRY_GATE_FIELDS}
_READY_GATES = {
    "implementation_code_pinned": True,
    "candidate_and_stable_weights_verified": True,
    "dedicated_openings_verified": True,
    "production_rules_preflight_verified": True,
    "benchmark_execution_authorized": True,
    "formal_execution_authorized": False,
    "production_weight_write_authorized": False,
}
_FORMAL_READY_FIELDS = frozenset(
    {
        "schema",
        "status",
        "source_registry",
        "plan",
        "protocol_amendment_sha256",
        "experiment_id",
        "run_id",
        "attempt_index",
        "attempt_ledger",
        "rerun_authorization",
        "openings_manifest",
        "openings_preflight_receipt",
        "match_binding",
        "worker_benchmark_receipt",
        "pair_workers",
        "execution_boundary",
        "formal_execution_authorized",
        "production_weight_write_authorized",
    }
)
_FORMAL_ATTEMPT_LEDGER_FIELDS = frozenset(
    {
        "schema",
        "experiment_id",
        "candidate_weights_sha256",
        "stable_weights_sha256",
        "openings_manifest_sha256",
        "match_binding_sha256",
        "worker_benchmark_receipt_sha256",
        "attempts",
    }
)
FORMAL_EXECUTION_BOUNDARY = (
    "argumentless-local-only-reviewed-benchmark-bound-no-network-cloud-or-live"
)

_ROUND_RESULT_FIELDS = frozenset(
    {
        "schema",
        "pairs",
        "games",
        "peak_pair_workers_observed",
        "technical_fault_count",
        "transcript_sha256s",
    }
)
_OBSERVATION_FIELDS = frozenset(
    {
        "round_index",
        "pair_workers",
        "elapsed_ns",
        "pairs",
        "games",
        "peak_pair_workers_observed",
        "technical_fault_count",
        "transcript_sha256s",
    }
)


class FormalAbV2WorkerBenchmarkError(ValueError):
    """The worker benchmark cannot make a deterministic safe selection."""


class FormalAbV2WorkerBenchmarkBlocked(FormalAbV2WorkerBenchmarkError):
    """The reviewed benchmark or formal-run enrollment is still closed."""


def _exact_dict(value: Any, fields: frozenset[str], label: str) -> dict:
    try:
        return legacy._exact_dict(value, fields, label)
    except legacy.FormalAbLocalLauncherError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error


def _domain_digest(domain: str, payload: Mapping | list) -> str:
    return legacy._sha256_text(domain + "\0" + legacy._canonical_json(payload))


def _require_exact_json(value: Any, expected: Any, label: str) -> None:
    try:
        legacy._require_exact_json(value, expected, label)
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error


def _identity(value: Any, label: str, *, schema: str | None = None) -> dict:
    try:
        identity = dict(
            legacy._validate_identity(value, label, schema=schema is not None)
        )
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    if schema is not None and identity["schema"] != schema:
        raise FormalAbV2WorkerBenchmarkError(f"{label} schema differs")
    return identity


def _source_identity(repo_root: Path, relative_path: str) -> dict:
    try:
        raw = legacy._read_repo_relative_regular(
            repo_root,
            relative_path,
            f"worker benchmark implementation {relative_path}",
        )
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    if not raw:
        raise FormalAbV2WorkerBenchmarkError(
            f"worker benchmark implementation {relative_path} is empty"
        )
    return {
        "path": relative_path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": SOURCE_IDENTITY_SCHEMA,
    }


def _validate_registry_implementation(value: Any, *, ready: bool) -> dict:
    implementation = _exact_dict(
        value,
        frozenset(_IMPLEMENTATION_PATHS),
        "worker benchmark registry implementation",
    )
    if not ready:
        if any(item is not None for item in implementation.values()):
            raise FormalAbV2WorkerBenchmarkError(
                "blocked worker benchmark implementation must be empty"
            )
        return dict(implementation)
    captured = {}
    for name, expected_path in _IMPLEMENTATION_PATHS.items():
        identity = _identity(
            implementation[name],
            f"worker benchmark implementation {name}",
            schema=SOURCE_IDENTITY_SCHEMA,
        )
        if identity["path"] != expected_path:
            raise FormalAbV2WorkerBenchmarkError(
                f"worker benchmark implementation {name} path differs"
            )
        captured[name] = identity
    return captured


def validate_worker_benchmark_registry_data(value: Any) -> dict:
    """Validate BLOCKED or review-ready benchmark authority without executing."""

    registry = _exact_dict(value, _REGISTRY_FIELDS, "worker benchmark registry")
    if registry["schema"] != BENCHMARK_REGISTRY_SCHEMA:
        raise FormalAbV2WorkerBenchmarkError("worker benchmark registry schema differs")
    status = registry["status"]
    if status not in (
        BENCHMARK_REGISTRY_BLOCKED_STATUS,
        BENCHMARK_REGISTRY_READY_STATUS,
    ):
        raise FormalAbV2WorkerBenchmarkError("worker benchmark registry status differs")
    ready = status == BENCHMARK_REGISTRY_READY_STATUS
    expected_reason = (
        "reviewed-dedicated-benchmark-enrollment"
        if ready
        else "dedicated-benchmark-enrollment-not-reviewed"
    )
    if registry["reason"] != expected_reason:
        raise FormalAbV2WorkerBenchmarkError("worker benchmark registry reason differs")
    implementation = _validate_registry_implementation(
        registry["implementation"], ready=ready
    )
    enrollments = _exact_dict(
        registry["enrollments"],
        _REGISTRY_ENROLLMENT_FIELDS,
        "worker benchmark registry enrollments",
    )
    if not ready:
        if any(item is not None for item in enrollments.values()):
            raise FormalAbV2WorkerBenchmarkError(
                "blocked worker benchmark enrollments must be empty"
            )
        captured_enrollments = dict(enrollments)
    else:
        try:
            benchmark_id = legacy._require_exact_semantic_id(
                enrollments["benchmark_id"], "worker benchmark ID"
            )
        except ValueError as error:
            raise FormalAbV2WorkerBenchmarkError(str(error)) from error
        source_revision = enrollments["source_revision"]
        if (
            type(source_revision) is not str
            or REVISION_RE.fullmatch(source_revision) is None
        ):
            raise FormalAbV2WorkerBenchmarkError(
                "worker benchmark source revision is invalid"
            )
        match_binding = _identity(
            enrollments["match_binding"],
            "worker benchmark match binding",
            schema=formal_contract.FORMAL_WASM_MATCH_BINDING_SCHEMA,
        )
        openings = _identity(
            enrollments["dedicated_openings_manifest"],
            "dedicated worker benchmark openings",
            schema=formal_contract.FORMAL_WASM_OPENINGS_MANIFEST_SCHEMA,
        )
        preflight = _identity(
            enrollments["openings_preflight_receipt"],
            "dedicated worker benchmark openings preflight",
            schema=formal_contract.FORMAL_WASM_OPENINGS_PREFLIGHT_SCHEMA,
        )
        if (
            "worker-benchmark" not in openings["path"]
            or "worker-benchmark" not in preflight["path"]
            or openings["path"] == preflight["path"]
        ):
            raise FormalAbV2WorkerBenchmarkError(
                "benchmark openings and preflight must use dedicated worker-benchmark paths"
            )
        captured_enrollments = {
            "benchmark_id": benchmark_id,
            "source_revision": source_revision,
            "match_binding": match_binding,
            "dedicated_openings_manifest": openings,
            "openings_preflight_receipt": preflight,
        }
    _require_exact_json(
        registry["contract"], _REGISTRY_CONTRACT, "worker benchmark contract"
    )
    gates = _exact_dict(
        registry["gates"], _REGISTRY_GATE_FIELDS, "worker benchmark gates"
    )
    _require_exact_json(
        gates,
        _READY_GATES if ready else _BLOCKED_GATES,
        "worker benchmark gates",
    )
    _require_exact_json(
        registry["boundary"], _REGISTRY_BOUNDARY, "worker benchmark boundary"
    )
    _require_exact_json(
        registry["nonclaims"], _REGISTRY_NONCLAIMS, "worker benchmark nonclaims"
    )
    return {
        "schema": BENCHMARK_REGISTRY_SCHEMA,
        "status": status,
        "reason": expected_reason,
        "implementation": copy.deepcopy(implementation),
        "enrollments": copy.deepcopy(captured_enrollments),
        "contract": copy.deepcopy(_REGISTRY_CONTRACT),
        "gates": copy.deepcopy(_READY_GATES if ready else _BLOCKED_GATES),
        "boundary": copy.deepcopy(_REGISTRY_BOUNDARY),
        "nonclaims": copy.deepcopy(_REGISTRY_NONCLAIMS),
    }


def _validated_transcript_vector(value: Any, label: str) -> list[str]:
    if type(value) is not list or len(value) != BENCHMARK_GAMES_PER_ROUND:
        raise FormalAbV2WorkerBenchmarkError(
            f"{label} must contain exactly {BENCHMARK_GAMES_PER_ROUND} hashes"
        )
    captured: list[str] = []
    for index, digest in enumerate(value):
        try:
            captured.append(
                legacy._require_exact_sha256(
                    digest,
                    f"{label}[{index}]",
                )
            )
        except ValueError as error:
            raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    return captured


def select_formal_ab_v2_pair_workers(observations: Any) -> dict:
    """Select the lowest two-sample total after byte-exact transcript parity."""

    if type(observations) is not list or len(observations) != len(BENCHMARK_SEQUENCE):
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark requires the complete fixed round sequence"
        )
    captured: list[dict] = []
    reference_transcripts: list[str] | None = None
    elapsed_by_workers: dict[int, list[int]] = {
        workers: [] for workers in PAIR_WORKER_CANDIDATES
    }
    for round_index, (raw, expected_workers) in enumerate(
        zip(observations, BENCHMARK_SEQUENCE, strict=True)
    ):
        observation = _exact_dict(
            raw,
            _OBSERVATION_FIELDS,
            f"worker benchmark observation {round_index}",
        )
        if (
            observation["round_index"] != round_index
            or observation["pair_workers"] != expected_workers
            or type(observation["elapsed_ns"]) is not int
            or observation["elapsed_ns"] <= 0
            or observation["pairs"] != BENCHMARK_PAIRS_PER_ROUND
            or observation["games"] != BENCHMARK_GAMES_PER_ROUND
            or type(observation["peak_pair_workers_observed"]) is not int
            or observation["peak_pair_workers_observed"] != expected_workers
            or type(observation["technical_fault_count"]) is not int
            or observation["technical_fault_count"] != 0
        ):
            raise FormalAbV2WorkerBenchmarkError(
                f"worker benchmark observation {round_index} contract differs"
            )
        transcripts = _validated_transcript_vector(
            observation["transcript_sha256s"],
            f"worker benchmark observation {round_index}.transcript_sha256s",
        )
        if reference_transcripts is None:
            reference_transcripts = transcripts
        elif transcripts != reference_transcripts:
            raise FormalAbV2WorkerBenchmarkError(
                "pair-worker selection forbidden: transcript SHA-256 vectors "
                "are not exactly equal"
            )
        elapsed_by_workers[expected_workers].append(observation["elapsed_ns"])
        captured.append(
            {
                "round_index": round_index,
                "pair_workers": expected_workers,
                "peak_pair_workers_observed": observation["peak_pair_workers_observed"],
                "elapsed_ns": observation["elapsed_ns"],
                "transcript_vector_sha256": _domain_digest(
                    "shogi-formal-paired-ab-v2-worker-benchmark-transcripts-v1",
                    transcripts,
                ),
            }
        )

    if reference_transcripts is None:
        raise FormalAbV2WorkerBenchmarkError("worker benchmark has no transcripts")
    timing_summary: list[dict] = []
    for workers in PAIR_WORKER_CANDIDATES:
        elapsed = elapsed_by_workers[workers]
        if len(elapsed) != REPETITIONS_PER_SETTING:
            raise FormalAbV2WorkerBenchmarkError(
                "each pair-worker setting requires exactly two repetitions"
            )
        total_elapsed_ns = sum(elapsed)
        timing_summary.append(
            {
                "pair_workers": workers,
                "repetitions": REPETITIONS_PER_SETTING,
                "elapsed_ns_samples": list(elapsed),
                "total_elapsed_ns": total_elapsed_ns,
                "mean_elapsed_ns_numerator": total_elapsed_ns,
                "mean_elapsed_ns_denominator": REPETITIONS_PER_SETTING,
                "pairs_per_second_milli_at_mean_elapsed": (
                    BENCHMARK_PAIRS_PER_ROUND
                    * 1_000_000_000_000
                    * REPETITIONS_PER_SETTING
                )
                // max(1, total_elapsed_ns),
            }
        )
    selected = min(
        timing_summary,
        key=lambda row: (
            row["total_elapsed_ns"],
            row["pair_workers"],
        ),
    )["pair_workers"]
    body = {
        "schema": BENCHMARK_RECEIPT_SCHEMA,
        "status": "PASS",
        "worker_candidates": list(PAIR_WORKER_CANDIDATES),
        "round_sequence": list(BENCHMARK_SEQUENCE),
        "pairs_per_round": BENCHMARK_PAIRS_PER_ROUND,
        "games_per_round": BENCHMARK_GAMES_PER_ROUND,
        "transcript_hash_equality": "exact-pass",
        "reference_transcript_vector_sha256": _domain_digest(
            "shogi-formal-paired-ab-v2-worker-benchmark-transcripts-v1",
            reference_transcripts,
        ),
        "selection_condition": SELECTION_CONDITION,
        "selected_pair_workers": selected,
        "timing_summary": timing_summary,
        "rounds": captured,
        "formal_games_started": 0,
        "live_weight_write": False,
    }
    return {
        **body,
        "receipt_sha256": _domain_digest(
            "shogi-formal-paired-ab-v2-worker-benchmark-receipt-v1",
            body,
        ),
    }


def validate_formal_ab_v2_worker_benchmark_receipt(value: Any) -> dict:
    """Revalidate a complete deterministic worker-selection receipt."""

    fields = frozenset(
        {
            "schema",
            "status",
            "worker_candidates",
            "round_sequence",
            "pairs_per_round",
            "games_per_round",
            "transcript_hash_equality",
            "reference_transcript_vector_sha256",
            "selection_condition",
            "selected_pair_workers",
            "timing_summary",
            "rounds",
            "formal_games_started",
            "live_weight_write",
            "receipt_sha256",
        }
    )
    receipt = _exact_dict(value, fields, "worker benchmark receipt")
    expected_header = {
        "schema": BENCHMARK_RECEIPT_SCHEMA,
        "status": "PASS",
        "worker_candidates": list(PAIR_WORKER_CANDIDATES),
        "round_sequence": list(BENCHMARK_SEQUENCE),
        "pairs_per_round": BENCHMARK_PAIRS_PER_ROUND,
        "games_per_round": BENCHMARK_GAMES_PER_ROUND,
        "transcript_hash_equality": "exact-pass",
        "selection_condition": SELECTION_CONDITION,
        "formal_games_started": 0,
        "live_weight_write": False,
    }
    for field, expected in expected_header.items():
        _require_exact_json(
            receipt[field], expected, f"worker benchmark receipt.{field}"
        )
    try:
        reference_digest = legacy._require_exact_sha256(
            receipt["reference_transcript_vector_sha256"],
            "worker benchmark reference transcript vector SHA-256",
        )
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    rounds = receipt["rounds"]
    if type(rounds) is not list or len(rounds) != len(BENCHMARK_SEQUENCE):
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark receipt rounds are incomplete"
        )
    elapsed_by_workers = {workers: [] for workers in PAIR_WORKER_CANDIDATES}
    round_fields = frozenset(
        {
            "round_index",
            "pair_workers",
            "peak_pair_workers_observed",
            "elapsed_ns",
            "transcript_vector_sha256",
        }
    )
    for round_index, (raw, expected_workers) in enumerate(
        zip(rounds, BENCHMARK_SEQUENCE, strict=True)
    ):
        row = _exact_dict(raw, round_fields, f"worker benchmark round {round_index}")
        if (
            row["round_index"] != round_index
            or row["pair_workers"] != expected_workers
            or row["peak_pair_workers_observed"] != expected_workers
            or type(row["elapsed_ns"]) is not int
            or row["elapsed_ns"] <= 0
            or row["transcript_vector_sha256"] != reference_digest
        ):
            raise FormalAbV2WorkerBenchmarkError(
                f"worker benchmark receipt round {round_index} differs"
            )
        elapsed_by_workers[expected_workers].append(row["elapsed_ns"])
    timing = receipt["timing_summary"]
    if type(timing) is not list or len(timing) != len(PAIR_WORKER_CANDIDATES):
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark timing summary is incomplete"
        )
    timing_fields = frozenset(
        {
            "pair_workers",
            "repetitions",
            "elapsed_ns_samples",
            "total_elapsed_ns",
            "mean_elapsed_ns_numerator",
            "mean_elapsed_ns_denominator",
            "pairs_per_second_milli_at_mean_elapsed",
        }
    )
    captured_timing = []
    for raw, workers in zip(timing, PAIR_WORKER_CANDIDATES, strict=True):
        row = _exact_dict(raw, timing_fields, f"worker benchmark timing {workers}")
        samples = elapsed_by_workers[workers]
        total = sum(samples)
        expected = {
            "pair_workers": workers,
            "repetitions": REPETITIONS_PER_SETTING,
            "elapsed_ns_samples": samples,
            "total_elapsed_ns": total,
            "mean_elapsed_ns_numerator": total,
            "mean_elapsed_ns_denominator": REPETITIONS_PER_SETTING,
            "pairs_per_second_milli_at_mean_elapsed": (
                BENCHMARK_PAIRS_PER_ROUND * 1_000_000_000_000 * REPETITIONS_PER_SETTING
            )
            // max(1, total),
        }
        _require_exact_json(row, expected, f"worker benchmark timing {workers}")
        captured_timing.append(copy.deepcopy(expected))
    selected = min(
        captured_timing,
        key=lambda row: (row["total_elapsed_ns"], row["pair_workers"]),
    )["pair_workers"]
    if receipt["selected_pair_workers"] != selected:
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark selected pair workers differ from exact timing"
        )
    body = {key: receipt[key] for key in receipt if key != "receipt_sha256"}
    expected_digest = _domain_digest(
        "shogi-formal-paired-ab-v2-worker-benchmark-receipt-v1", body
    )
    if receipt["receipt_sha256"] != expected_digest:
        raise FormalAbV2WorkerBenchmarkError("worker benchmark receipt digest differs")
    return copy.deepcopy(dict(receipt))


def compose_bound_worker_benchmark_receipt(
    captured_registry: Mapping[str, Any],
    selection_receipt: Mapping[str, Any],
) -> dict:
    """Bind the measured selection to its reviewed pre-run authority."""

    registry = captured_registry.get("registry")
    registry_identity = captured_registry.get("registry_identity")
    assets = captured_registry.get("assets")
    if (
        type(registry) is not dict
        or registry.get("status") != BENCHMARK_REGISTRY_READY_STATUS
        or type(assets) is not dict
    ):
        raise FormalAbV2WorkerBenchmarkError(
            "bound benchmark receipt requires one captured READY registry"
        )
    selection = validate_formal_ab_v2_worker_benchmark_receipt(selection_receipt)
    enrollments = registry["enrollments"]
    body = {
        "schema": BOUND_BENCHMARK_RECEIPT_SCHEMA,
        "status": "PASS",
        "benchmark_registry": _identity(
            registry_identity,
            "bound benchmark registry identity",
            schema=BENCHMARK_REGISTRY_SCHEMA,
        ),
        "benchmark_id": enrollments["benchmark_id"],
        "source_revision": enrollments["source_revision"],
        "match_binding": copy.deepcopy(enrollments["match_binding"]),
        "dedicated_openings_manifest": copy.deepcopy(
            enrollments["dedicated_openings_manifest"]
        ),
        "openings_preflight_receipt": copy.deepcopy(
            enrollments["openings_preflight_receipt"]
        ),
        "candidate_weights": copy.deepcopy(assets["candidate_weights"]),
        "stable_weights": copy.deepcopy(assets["stable_weights"]),
        "selection": selection,
        "benchmark_rounds_started": len(BENCHMARK_SEQUENCE),
        "benchmark_pairs_started": (
            len(BENCHMARK_SEQUENCE) * BENCHMARK_PAIRS_PER_ROUND
        ),
        "benchmark_games_started": (
            len(BENCHMARK_SEQUENCE) * BENCHMARK_GAMES_PER_ROUND
        ),
        "formal_pair_journals_created": 0,
        "formal_pairs_started": 0,
        "formal_games_started": 0,
        "network_requests": 0,
        "cloud_jobs": 0,
        "live_weight_write": False,
    }
    return {
        **body,
        "receipt_sha256": _domain_digest(
            "shogi-formal-paired-ab-v2-bound-worker-benchmark-receipt-v1",
            body,
        ),
    }


def validate_bound_worker_benchmark_receipt(
    value: Any,
    *,
    expected_registry: Mapping[str, Any] | None = None,
) -> dict:
    """Validate the reviewable receipt used by the formal READY bridge."""

    fields = frozenset(
        {
            "schema",
            "status",
            "benchmark_registry",
            "benchmark_id",
            "source_revision",
            "match_binding",
            "dedicated_openings_manifest",
            "openings_preflight_receipt",
            "candidate_weights",
            "stable_weights",
            "selection",
            "benchmark_rounds_started",
            "benchmark_pairs_started",
            "benchmark_games_started",
            "formal_pair_journals_created",
            "formal_pairs_started",
            "formal_games_started",
            "network_requests",
            "cloud_jobs",
            "live_weight_write",
            "receipt_sha256",
        }
    )
    receipt = _exact_dict(value, fields, "bound worker benchmark receipt")
    if (
        receipt["schema"] != BOUND_BENCHMARK_RECEIPT_SCHEMA
        or receipt["status"] != "PASS"
        or type(receipt["source_revision"]) is not str
        or REVISION_RE.fullmatch(receipt["source_revision"]) is None
    ):
        raise FormalAbV2WorkerBenchmarkError(
            "bound worker benchmark receipt header differs"
        )
    try:
        benchmark_id = legacy._require_exact_semantic_id(
            receipt["benchmark_id"], "bound benchmark ID"
        )
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    registry_identity = _identity(
        receipt["benchmark_registry"],
        "bound benchmark registry",
        schema=BENCHMARK_REGISTRY_SCHEMA,
    )
    match_binding = _identity(
        receipt["match_binding"],
        "bound benchmark match binding",
        schema=formal_contract.FORMAL_WASM_MATCH_BINDING_SCHEMA,
    )
    openings = _identity(
        receipt["dedicated_openings_manifest"],
        "bound dedicated benchmark openings",
        schema=formal_contract.FORMAL_WASM_OPENINGS_MANIFEST_SCHEMA,
    )
    preflight = _identity(
        receipt["openings_preflight_receipt"],
        "bound dedicated benchmark preflight",
        schema=formal_contract.FORMAL_WASM_OPENINGS_PREFLIGHT_SCHEMA,
    )
    candidate = _identity(receipt["candidate_weights"], "bound candidate weights")
    stable = _identity(receipt["stable_weights"], "bound stable weights")
    if candidate["path"] == stable["path"] or candidate["sha256"] == stable["sha256"]:
        raise FormalAbV2WorkerBenchmarkError(
            "bound benchmark candidate and stable weights must differ"
        )
    validate_formal_ab_v2_worker_benchmark_receipt(receipt["selection"])
    expected_counters = {
        "benchmark_rounds_started": len(BENCHMARK_SEQUENCE),
        "benchmark_pairs_started": len(BENCHMARK_SEQUENCE) * BENCHMARK_PAIRS_PER_ROUND,
        "benchmark_games_started": len(BENCHMARK_SEQUENCE) * BENCHMARK_GAMES_PER_ROUND,
        "formal_pair_journals_created": 0,
        "formal_pairs_started": 0,
        "formal_games_started": 0,
        "network_requests": 0,
        "cloud_jobs": 0,
        "live_weight_write": False,
    }
    for field, expected in expected_counters.items():
        _require_exact_json(
            receipt[field], expected, f"bound worker benchmark receipt.{field}"
        )
    if expected_registry is not None:
        registry = validate_worker_benchmark_registry_data(expected_registry)
        if registry["status"] != BENCHMARK_REGISTRY_READY_STATUS:
            raise FormalAbV2WorkerBenchmarkError(
                "bound receipt expected registry is not READY"
            )
        enrollments = registry["enrollments"]
        expected_values = {
            "benchmark_id": enrollments["benchmark_id"],
            "source_revision": enrollments["source_revision"],
            "match_binding": enrollments["match_binding"],
            "dedicated_openings_manifest": enrollments["dedicated_openings_manifest"],
            "openings_preflight_receipt": enrollments["openings_preflight_receipt"],
        }
        observed_values = {
            "benchmark_id": benchmark_id,
            "source_revision": receipt["source_revision"],
            "match_binding": match_binding,
            "dedicated_openings_manifest": openings,
            "openings_preflight_receipt": preflight,
        }
        _require_exact_json(
            observed_values,
            expected_values,
            "bound worker benchmark enrollment",
        )
        del registry_identity
    body = {key: receipt[key] for key in receipt if key != "receipt_sha256"}
    expected_digest = _domain_digest(
        "shogi-formal-paired-ab-v2-bound-worker-benchmark-receipt-v1", body
    )
    if receipt["receipt_sha256"] != expected_digest:
        raise FormalAbV2WorkerBenchmarkError(
            "bound worker benchmark receipt digest differs"
        )
    return copy.deepcopy(dict(receipt))


def run_formal_ab_v2_worker_benchmark_core_for_tests(
    execute_round: Callable[[int, int], Mapping],
    *,
    monotonic_ns: Callable[[], int] = time.monotonic_ns,
) -> dict:
    """Small injected orchestration seam; it grants no production authority."""

    if not callable(execute_round) or not callable(monotonic_ns):
        raise FormalAbV2WorkerBenchmarkError(
            "CoreForTests benchmark dependencies must be callable"
        )
    observations: list[dict] = []
    for round_index, pair_workers in enumerate(BENCHMARK_SEQUENCE):
        started_ns = monotonic_ns()
        raw_result = execute_round(pair_workers, round_index)
        finished_ns = monotonic_ns()
        elapsed_ns = finished_ns - started_ns
        if elapsed_ns < 0:
            raise FormalAbV2WorkerBenchmarkError(
                "worker benchmark monotonic clock moved backwards"
            )
        result = _exact_dict(
            raw_result,
            _ROUND_RESULT_FIELDS,
            f"worker benchmark round result {round_index}",
        )
        if result["schema"] != BENCHMARK_ROUND_RESULT_SCHEMA:
            raise FormalAbV2WorkerBenchmarkError(
                f"worker benchmark round result {round_index} schema differs"
            )
        observations.append(
            {
                "round_index": round_index,
                "pair_workers": pair_workers,
                "elapsed_ns": max(1, elapsed_ns),
                "pairs": result["pairs"],
                "games": result["games"],
                "peak_pair_workers_observed": result["peak_pair_workers_observed"],
                "technical_fault_count": result["technical_fault_count"],
                "transcript_sha256s": result["transcript_sha256s"],
            }
        )
    return select_formal_ab_v2_pair_workers(observations)


def _git_head(repo_root: Path) -> str:
    """Read one exact HEAD without inheriting caller Git configuration."""

    import subprocess

    command = [
        "/usr/bin/git",
        "--no-replace-objects",
        "--no-optional-locks",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.untrackedCache=false",
        "-c",
        "core.preloadIndex=false",
        "rev-parse",
        "--verify",
        "HEAD^{commit}",
    ]
    environment = {
        "PATH": "/usr/bin:/bin",
        "HOME": "/var/empty",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_CONFIG_SYSTEM": "/dev/null",
        "GIT_OPTIONAL_LOCKS": "0",
        "GIT_TERMINAL_PROMPT": "0",
        "LC_ALL": "C",
        "LANG": "C",
    }
    try:
        completed = subprocess.run(
            command,
            cwd=repo_root,
            env=environment,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark cannot authenticate repository HEAD"
        ) from error
    raw = completed.stdout
    if type(raw) is not bytes or len(raw) != 41 or raw[-1:] != b"\n":
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark repository HEAD is not canonical"
        )
    try:
        revision = raw[:-1].decode("ascii")
    except UnicodeDecodeError as error:
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark repository HEAD is not canonical"
        ) from error
    if REVISION_RE.fullmatch(revision) is None:
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark repository HEAD is not canonical"
        )
    return revision


def _require_revision_ancestor(repo_root: Path, revision: str) -> None:
    import subprocess

    if type(revision) is not str or REVISION_RE.fullmatch(revision) is None:
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark source revision is invalid"
        )
    environment = {
        "PATH": "/usr/bin:/bin",
        "HOME": "/var/empty",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_CONFIG_SYSTEM": "/dev/null",
        "GIT_OPTIONAL_LOCKS": "0",
        "GIT_TERMINAL_PROMPT": "0",
        "LC_ALL": "C",
        "LANG": "C",
    }
    try:
        completed = subprocess.run(
            [
                "/usr/bin/git",
                "--no-replace-objects",
                "--no-optional-locks",
                "merge-base",
                "--is-ancestor",
                revision,
                "HEAD",
            ],
            cwd=repo_root,
            env=environment,
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError as error:
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark cannot verify source revision ancestry"
        ) from error
    if completed.returncode != 0:
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark source revision is not an ancestor of HEAD"
        )


def _registry_relative_path(repo_root: Path, registry_path: str | Path) -> str:
    supplied = Path(registry_path)
    if supplied.is_absolute():
        try:
            supplied = supplied.relative_to(repo_root)
        except ValueError as error:
            raise FormalAbV2WorkerBenchmarkError(
                "worker benchmark registry must be repository relative"
            ) from error
    relative = supplied.as_posix()
    try:
        legacy._safe_relative_parts(relative, "worker benchmark registry")
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    return relative


def capture_ready_worker_benchmark_registry(
    repo_root: str | Path,
    registry_path: str | Path,
    *,
    expected_registry_identity: Mapping[str, Any] | None = None,
    expected_revision: str | None = None,
) -> dict:
    """Authenticate one reviewed pre-run registry and all benchmark inputs."""

    root = Path(repo_root).resolve(strict=True)
    relative = _registry_relative_path(root, registry_path)
    expected_identity = (
        None
        if expected_registry_identity is None
        else _identity(
            expected_registry_identity,
            "pinned worker benchmark registry",
            schema=BENCHMARK_REGISTRY_SCHEMA,
        )
    )
    if expected_identity is not None and expected_identity["path"] != relative:
        raise FormalAbV2WorkerBenchmarkError(
            "pinned worker benchmark registry path differs"
        )
    try:
        raw = legacy._read_repo_relative_regular(
            root,
            relative,
            "worker benchmark registry",
            maximum_bytes=(
                expected_identity["bytes"]
                if expected_identity is not None
                else 8 * 1024 * 1024
            ),
        )
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    if expected_identity is not None and (
        len(raw) != expected_identity["bytes"]
        or hashlib.sha256(raw).hexdigest() != expected_identity["sha256"]
    ):
        raise FormalAbV2WorkerBenchmarkError(
            "pinned worker benchmark registry identity differs"
        )
    try:
        parsed = legacy._strict_json_loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as error:
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark registry JSON is invalid"
        ) from error
    registry = validate_worker_benchmark_registry_data(parsed)
    registry_identity = {
        "path": relative,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": BENCHMARK_REGISTRY_SCHEMA,
    }
    if registry["status"] != BENCHMARK_REGISTRY_READY_STATUS:
        raise FormalAbV2WorkerBenchmarkBlocked(
            "worker benchmark registry is BLOCKED; zero benchmark rounds started"
        )
    revision = registry["enrollments"]["source_revision"]
    if expected_revision is None:
        _require_revision_ancestor(root, revision)
    elif expected_revision != revision:
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark source revision differs from expected revision"
        )
    for name, relative_path in _IMPLEMENTATION_PATHS.items():
        observed = _source_identity(root, relative_path)
        _require_exact_json(
            observed,
            registry["implementation"][name],
            f"worker benchmark implementation {name}",
        )
    try:
        binding_payload, binding_identity, _ = legacy._parse_identity_json(
            root,
            registry["enrollments"]["match_binding"],
            "worker benchmark match binding",
        )
        openings_payload, openings_identity, _ = legacy._parse_identity_json(
            root,
            registry["enrollments"]["dedicated_openings_manifest"],
            "dedicated worker benchmark openings",
        )
        preflight_payload, preflight_identity, _ = legacy._parse_identity_json(
            root,
            registry["enrollments"]["openings_preflight_receipt"],
            "dedicated worker benchmark openings preflight",
        )
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    try:
        match_binding, assets = formal_contract.validate_formal_wasm_match_binding(
            root, binding_payload
        )
        openings = formal_contract.validate_formal_wasm_openings_manifest(
            openings_payload
        )
        preflight = formal_contract.validate_formal_wasm_openings_preflight_receipt(
            openings, preflight_payload
        )
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    return {
        "registry": registry,
        "registry_identity": registry_identity,
        "match_binding": match_binding,
        "match_binding_identity": dict(binding_identity),
        "dedicated_openings_manifest": openings,
        "dedicated_openings_manifest_identity": dict(openings_identity),
        "openings_preflight_receipt": preflight,
        "openings_preflight_receipt_identity": dict(preflight_identity),
        "pairs": copy.deepcopy(openings["pairs"][:BENCHMARK_PAIRS_PER_ROUND]),
        "assets": copy.deepcopy(assets),
    }


def validate_pinned_worker_benchmark_registry(repo_root: str | Path) -> dict:
    """Validate only the one code-pinned benchmark authority."""

    return capture_ready_worker_benchmark_registry(
        repo_root,
        _PINNED_BENCHMARK_REGISTRY_IDENTITY["path"],
        expected_registry_identity=_PINNED_BENCHMARK_REGISTRY_IDENTITY,
    )


def _run_real_wasm_benchmark_round(
    repo_root: Path,
    captured: Mapping[str, Any],
    pair_workers: int,
    round_index: int,
) -> dict:
    """Run one dedicated 12-pair round without creating formal journals."""

    import formal_paired_ab_v2_wasm_match_launcher as wasm_launcher

    if BENCHMARK_SEQUENCE[round_index] != pair_workers:
        raise FormalAbV2WorkerBenchmarkError(
            "production worker benchmark round order differs"
        )
    pairs = captured["pairs"]
    if type(pairs) is not list or len(pairs) != BENCHMARK_PAIRS_PER_ROUND:
        raise FormalAbV2WorkerBenchmarkError(
            "production worker benchmark dedicated pair set differs"
        )
    first_wave = threading.Barrier(pair_workers)
    lock = threading.Lock()
    active = 0
    peak = 0

    def execute(position: int, pair: Mapping[str, Any]) -> tuple[int, list[str]]:
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        try:
            if position < pair_workers:
                first_wave.wait(timeout=60)
            request = wasm_launcher._wasm_pair_request(captured, pair)
            receipt = wasm_launcher._validate_pair_receipt(
                wasm_launcher._execute_pair_subprocess(repo_root, request),
                captured,
                pair,
            )
            return (
                position,
                [game["transcript_sha256"] for game in receipt["games"]],
            )
        finally:
            with lock:
                active -= 1

    transcript_by_position: dict[int, list[str]] = {}
    first_error: Exception | None = None
    with ThreadPoolExecutor(max_workers=pair_workers) as executor:
        futures = {
            executor.submit(execute, position, pair): position
            for position, pair in enumerate(pairs)
        }
        for future in as_completed(futures):
            try:
                position, transcripts = future.result()
                transcript_by_position[position] = transcripts
            except Exception as error:
                if first_error is None:
                    first_error = error
    if first_error is not None:
        raise FormalAbV2WorkerBenchmarkError(
            "production worker benchmark round reported a technical fault"
        ) from first_error
    transcripts = [
        transcript
        for position in range(BENCHMARK_PAIRS_PER_ROUND)
        for transcript in transcript_by_position[position]
    ]
    return {
        "schema": BENCHMARK_ROUND_RESULT_SCHEMA,
        "pairs": BENCHMARK_PAIRS_PER_ROUND,
        "games": BENCHMARK_GAMES_PER_ROUND,
        "peak_pair_workers_observed": peak,
        "technical_fault_count": 0,
        "transcript_sha256s": transcripts,
    }


def run_captured_worker_benchmark(
    repo_root: str | Path,
    captured: Mapping[str, Any],
    *,
    execute_round: Callable[[int, int], Mapping] | None = None,
    monotonic_ns: Callable[[], int] = time.monotonic_ns,
) -> dict:
    """Execute all benchmark rounds and return one input-bound receipt."""

    root = Path(repo_root).resolve(strict=True)
    callback = execute_round
    if callback is None:

        def callback(workers: int, round_index: int) -> Mapping:
            return _run_real_wasm_benchmark_round(root, captured, workers, round_index)

    selection = run_formal_ab_v2_worker_benchmark_core_for_tests(
        callback,
        monotonic_ns=monotonic_ns,
    )
    return compose_bound_worker_benchmark_receipt(captured, selection)


def _directory_open_flags() -> int:
    if (
        not hasattr(os, "O_NOFOLLOW")
        or not hasattr(os, "O_DIRECTORY")
        or os.open not in os.supports_dir_fd
        or os.mkdir not in os.supports_dir_fd
        or os.stat not in os.supports_dir_fd
    ):
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark output requires descriptor-relative no-follow support"
        )
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    return flags


def _verify_owned_directory(
    metadata: os.stat_result,
    label: str,
    *,
    private: bool,
) -> None:
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or metadata.st_uid != os.geteuid()
        or (private and stat.S_IMODE(metadata.st_mode) != 0o700)
    ):
        suffix = (
            " current-user-owned 0700 directory"
            if private
            else " current-user-owned directory"
        )
        raise FormalAbV2WorkerBenchmarkError(f"{label} must be one{suffix}")


def _open_or_create_output_directory(
    parent_descriptor: int,
    component: str,
    label: str,
    *,
    private: bool,
) -> int:
    flags = _directory_open_flags()
    try:
        descriptor = os.open(component, flags, dir_fd=parent_descriptor)
    except FileNotFoundError:
        try:
            os.mkdir(component, 0o700, dir_fd=parent_descriptor)
            os.fsync(parent_descriptor)
        except FileExistsError:
            pass
        except OSError as error:
            raise FormalAbV2WorkerBenchmarkError(
                f"{label} cannot be created safely"
            ) from error
        try:
            descriptor = os.open(component, flags, dir_fd=parent_descriptor)
        except OSError as error:
            raise FormalAbV2WorkerBenchmarkError(
                f"{label} cannot be opened safely"
            ) from error
    except OSError as error:
        raise FormalAbV2WorkerBenchmarkError(
            f"{label} cannot be opened safely"
        ) from error
    try:
        _verify_owned_directory(os.fstat(descriptor), label, private=private)
    except BaseException:
        os.close(descriptor)
        raise
    return descriptor


def _reserve_worker_benchmark_output(
    home_root: str | Path,
    benchmark_id: str,
) -> dict:
    """Reserve the one output namespace before any benchmark game starts."""

    try:
        validated_id = legacy._require_exact_semantic_id(
            benchmark_id, "worker benchmark ID"
        )
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    home = Path(home_root).expanduser().resolve(strict=True)
    flags = _directory_open_flags()
    descriptors: list[int] = []
    try:
        home_descriptor = os.open(home, flags)
        descriptors.append(home_descriptor)
        _verify_owned_directory(
            os.fstat(home_descriptor), "worker benchmark home", private=False
        )
        current = home_descriptor
        components = Path(BENCHMARK_OUTPUT_DIRECTORY).parts
        for index, component in enumerate(components):
            following = _open_or_create_output_directory(
                current,
                component,
                f"worker benchmark output component {component}",
                private=index > 0,
            )
            descriptors.append(following)
            current = following
        parent_descriptor = current
        run_name = validated_id.removeprefix("sha256:")
        try:
            os.mkdir(run_name, 0o700, dir_fd=parent_descriptor)
            os.fsync(parent_descriptor)
        except FileExistsError as error:
            raise FormalAbV2WorkerBenchmarkError(
                "worker benchmark output is already reserved; automatic rerun is forbidden"
            ) from error
        except OSError as error:
            raise FormalAbV2WorkerBenchmarkError(
                "worker benchmark output cannot be reserved safely"
            ) from error
        run_descriptor = os.open(run_name, flags, dir_fd=parent_descriptor)
        descriptors.append(run_descriptor)
        run_metadata = os.fstat(run_descriptor)
        _verify_owned_directory(
            run_metadata, "worker benchmark run directory", private=True
        )
        path_metadata = os.stat(
            run_name,
            dir_fd=parent_descriptor,
            follow_symlinks=False,
        )
        if (path_metadata.st_dev, path_metadata.st_ino) != (
            run_metadata.st_dev,
            run_metadata.st_ino,
        ):
            raise FormalAbV2WorkerBenchmarkError(
                "worker benchmark output reservation identity differs"
            )
        reservation = {
            "benchmark_id": validated_id,
            "path": home / BENCHMARK_OUTPUT_DIRECTORY / run_name,
            "parent_descriptor": parent_descriptor,
            "run_descriptor": run_descriptor,
            "run_name": run_name,
            "device": run_metadata.st_dev,
            "inode": run_metadata.st_ino,
        }
        # The reservation retains only the final parent and run descriptors.
        for descriptor in descriptors[:-2]:
            os.close(descriptor)
        return reservation
    except BaseException:
        for descriptor in reversed(descriptors):
            try:
                os.close(descriptor)
            except OSError:
                pass
        raise


def _close_worker_benchmark_output_reservation(reservation: Mapping[str, Any]) -> None:
    for field in ("run_descriptor", "parent_descriptor"):
        descriptor = reservation.get(field)
        if type(descriptor) is int:
            try:
                os.close(descriptor)
            except OSError:
                pass


def _verify_worker_benchmark_output_reservation(
    reservation: Mapping[str, Any],
) -> None:
    run_descriptor = reservation["run_descriptor"]
    metadata = os.fstat(run_descriptor)
    _verify_owned_directory(metadata, "worker benchmark run directory", private=True)
    path_metadata = os.stat(
        reservation["run_name"],
        dir_fd=reservation["parent_descriptor"],
        follow_symlinks=False,
    )
    if (metadata.st_dev, metadata.st_ino) != (
        reservation["device"],
        reservation["inode"],
    ) or (path_metadata.st_dev, path_metadata.st_ino) != (
        metadata.st_dev,
        metadata.st_ino,
    ):
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark output reservation no longer names its inode"
        )


def _write_exclusive_json_at(
    directory_descriptor: int,
    name: str,
    value: Mapping[str, Any],
) -> None:
    raw = f"{legacy._canonical_json(value)}\n".encode("utf-8")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    descriptor = os.open(name, flags, 0o600, dir_fd=directory_descriptor)
    try:
        metadata = os.fstat(descriptor)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or metadata.st_nlink != 1
            or stat.S_IMODE(metadata.st_mode) != 0o600
        ):
            raise FormalAbV2WorkerBenchmarkError(
                "worker benchmark receipt is not one current-user-owned 0600 inode"
            )
        remaining = memoryview(raw)
        while remaining:
            written = os.write(descriptor, remaining)
            if type(written) is not int or written <= 0 or written > len(remaining):
                raise FormalAbV2WorkerBenchmarkError(
                    "worker benchmark receipt write was incomplete"
                )
            remaining = remaining[written:]
        os.fsync(descriptor)
        os.fsync(directory_descriptor)
    finally:
        os.close(descriptor)


def publish_bound_worker_benchmark_receipt(
    reservation: Mapping[str, Any],
    receipt: Mapping[str, Any],
) -> Path:
    """Publish once into an already-reserved private run directory."""

    validated = validate_bound_worker_benchmark_receipt(receipt)
    if validated["benchmark_id"] != reservation.get("benchmark_id"):
        raise FormalAbV2WorkerBenchmarkError(
            "worker benchmark receipt differs from its output reservation"
        )
    _verify_worker_benchmark_output_reservation(reservation)
    _write_exclusive_json_at(
        reservation["run_descriptor"],
        BENCHMARK_OUTPUT_RECEIPT_NAME,
        validated,
    )
    _verify_worker_benchmark_output_reservation(reservation)
    return reservation["path"] / BENCHMARK_OUTPUT_RECEIPT_NAME


def run_pinned_worker_benchmark(
    repo_root: str | Path,
    home_root: str | Path,
) -> tuple[dict, Path]:
    """Production API: one code-pinned benchmark, no caller-selected inputs."""

    captured = validate_pinned_worker_benchmark_registry(repo_root)
    reservation = _reserve_worker_benchmark_output(
        home_root, captured["registry"]["enrollments"]["benchmark_id"]
    )
    try:
        receipt = run_captured_worker_benchmark(repo_root, captured)
        return receipt, publish_bound_worker_benchmark_receipt(reservation, receipt)
    finally:
        _close_worker_benchmark_output_reservation(reservation)


def validate_formal_ready_registry_data(value: Any) -> dict:
    """Validate the post-receipt READY registry shape without opening files."""

    registry = _exact_dict(value, _FORMAL_READY_FIELDS, "formal WASM READY registry")
    if (
        registry["schema"] != FORMAL_READY_REGISTRY_SCHEMA
        or registry["status"] != FORMAL_READY_STATUS
    ):
        raise FormalAbV2WorkerBenchmarkError(
            "formal WASM READY registry header differs"
        )
    _require_exact_json(
        registry["source_registry"],
        legacy._SOURCE_REGISTRY_IDENTITY,
        "formal WASM READY source registry",
    )
    _require_exact_json(
        registry["plan"], legacy._PLAN_IDENTITY, "formal WASM READY plan"
    )
    if registry["protocol_amendment_sha256"] != legacy.FORMAL_AB_V2_AMENDMENT_SHA256:
        raise FormalAbV2WorkerBenchmarkError(
            "formal WASM READY protocol amendment differs"
        )
    try:
        experiment_id = legacy._require_exact_semantic_id(
            registry["experiment_id"], "formal WASM READY experiment ID"
        )
        run_id = legacy._require_exact_semantic_id(
            registry["run_id"], "formal WASM READY run ID"
        )
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    if experiment_id == run_id:
        raise FormalAbV2WorkerBenchmarkError(
            "formal WASM READY experiment and run IDs must differ"
        )
    if registry["attempt_index"] != 0 or type(registry["attempt_index"]) is not int:
        raise FormalAbV2WorkerBenchmarkError(
            "formal WASM READY registry is attempt-zero only"
        )
    if registry["rerun_authorization"] is not None:
        raise FormalAbV2WorkerBenchmarkError(
            "formal WASM READY registry cannot authorize a rerun"
        )
    attempt_ledger = _identity(
        registry["attempt_ledger"],
        "formal WASM READY attempt ledger",
        schema=FORMAL_ATTEMPT_LEDGER_SCHEMA,
    )
    openings = _identity(
        registry["openings_manifest"],
        "formal WASM READY openings",
        schema=formal_contract.FORMAL_WASM_OPENINGS_MANIFEST_SCHEMA,
    )
    openings_preflight = _identity(
        registry["openings_preflight_receipt"],
        "formal WASM READY openings preflight",
        schema=formal_contract.FORMAL_WASM_OPENINGS_PREFLIGHT_SCHEMA,
    )
    match_binding = _identity(
        registry["match_binding"],
        "formal WASM READY match binding",
        schema=formal_contract.FORMAL_WASM_MATCH_BINDING_SCHEMA,
    )
    benchmark_receipt = _identity(
        registry["worker_benchmark_receipt"],
        "formal WASM READY worker benchmark receipt",
        schema=BOUND_BENCHMARK_RECEIPT_SCHEMA,
    )
    workers = registry["pair_workers"]
    if type(workers) is not int or workers not in PAIR_WORKER_CANDIDATES:
        raise FormalAbV2WorkerBenchmarkError(
            "formal WASM READY pair workers must be exactly 2, 4, 8, or 12"
        )
    if (
        registry["execution_boundary"] != FORMAL_EXECUTION_BOUNDARY
        or registry["formal_execution_authorized"] is not True
        or registry["production_weight_write_authorized"] is not False
    ):
        raise FormalAbV2WorkerBenchmarkError(
            "formal WASM READY authority boundary differs"
        )
    return {
        "schema": FORMAL_READY_REGISTRY_SCHEMA,
        "status": FORMAL_READY_STATUS,
        "source_registry": copy.deepcopy(legacy._SOURCE_REGISTRY_IDENTITY),
        "plan": copy.deepcopy(legacy._PLAN_IDENTITY),
        "protocol_amendment_sha256": legacy.FORMAL_AB_V2_AMENDMENT_SHA256,
        "experiment_id": experiment_id,
        "run_id": run_id,
        "attempt_index": 0,
        "attempt_ledger": attempt_ledger,
        "rerun_authorization": None,
        "openings_manifest": openings,
        "openings_preflight_receipt": openings_preflight,
        "match_binding": match_binding,
        "worker_benchmark_receipt": benchmark_receipt,
        "pair_workers": workers,
        "execution_boundary": FORMAL_EXECUTION_BOUNDARY,
        "formal_execution_authorized": True,
        "production_weight_write_authorized": False,
    }


def capture_formal_ready_registry(
    repo_root: str | Path,
    registry_path: str | Path,
    *,
    expected_registry_identity: Mapping[str, Any] | None = None,
) -> dict:
    """Hard pre-journal gate for the future code-pinned formal run."""

    root = Path(repo_root).resolve(strict=True)
    relative = _registry_relative_path(root, registry_path)
    expected_identity = (
        None
        if expected_registry_identity is None
        else _identity(
            expected_registry_identity,
            "pinned formal WASM READY registry",
            schema=FORMAL_READY_REGISTRY_SCHEMA,
        )
    )
    if expected_identity is not None and expected_identity["path"] != relative:
        raise FormalAbV2WorkerBenchmarkError(
            "pinned formal WASM READY registry path differs"
        )
    try:
        raw = legacy._read_repo_relative_regular(
            root,
            relative,
            "formal WASM READY registry",
            maximum_bytes=(
                expected_identity["bytes"]
                if expected_identity is not None
                else 8 * 1024 * 1024
            ),
        )
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    if expected_identity is not None and (
        len(raw) != expected_identity["bytes"]
        or hashlib.sha256(raw).hexdigest() != expected_identity["sha256"]
    ):
        raise FormalAbV2WorkerBenchmarkError(
            "pinned formal WASM READY registry identity differs"
        )
    try:
        registry = validate_formal_ready_registry_data(
            legacy._strict_json_loads(raw.decode("utf-8"))
        )
        ledger_payload, ledger_identity, _ = legacy._parse_identity_json(
            root, registry["attempt_ledger"], "formal WASM attempt ledger"
        )
        openings_payload, openings_identity, _ = legacy._parse_identity_json(
            root, registry["openings_manifest"], "formal WASM openings"
        )
        preflight_payload, preflight_identity, _ = legacy._parse_identity_json(
            root,
            registry["openings_preflight_receipt"],
            "formal WASM openings preflight",
        )
        binding_payload, binding_identity, _ = legacy._parse_identity_json(
            root, registry["match_binding"], "formal WASM match binding"
        )
        benchmark_payload, benchmark_identity, _ = legacy._parse_identity_json(
            root,
            registry["worker_benchmark_receipt"],
            "formal WASM worker benchmark receipt",
        )
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    try:
        match_binding, assets = formal_contract.validate_formal_wasm_match_binding(
            root, binding_payload
        )
        openings = formal_contract.validate_formal_wasm_openings_manifest(
            openings_payload
        )
        formal_contract.validate_formal_wasm_openings_preflight_receipt(
            openings, preflight_payload
        )
        bound_receipt = validate_bound_worker_benchmark_receipt(benchmark_payload)
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    if (
        bound_receipt["match_binding"] != binding_identity
        or bound_receipt["candidate_weights"] != assets["candidate_weights"]
        or bound_receipt["stable_weights"] != assets["stable_weights"]
        or bound_receipt["selection"]["selected_pair_workers"]
        != registry["pair_workers"]
    ):
        raise FormalAbV2WorkerBenchmarkError(
            "formal WASM READY registry differs from its benchmark receipt"
        )
    dedicated_openings = bound_receipt["dedicated_openings_manifest"]
    if (
        dedicated_openings["path"] == openings_identity["path"]
        or dedicated_openings["sha256"] == openings_identity["sha256"]
    ):
        raise FormalAbV2WorkerBenchmarkError(
            "formal openings must be distinct from dedicated benchmark openings"
        )
    ledger = _exact_dict(
        ledger_payload,
        _FORMAL_ATTEMPT_LEDGER_FIELDS,
        "formal WASM attempt ledger",
    )
    expected_ledger = {
        "schema": FORMAL_ATTEMPT_LEDGER_SCHEMA,
        "experiment_id": registry["experiment_id"],
        "candidate_weights_sha256": assets["candidate_weights"]["sha256"],
        "stable_weights_sha256": assets["stable_weights"]["sha256"],
        "openings_manifest_sha256": openings_identity["sha256"],
        "match_binding_sha256": binding_identity["sha256"],
        "worker_benchmark_receipt_sha256": benchmark_identity["sha256"],
        "attempts": [],
    }
    _require_exact_json(ledger, expected_ledger, "formal WASM attempt ledger")
    try:
        legacy._validate_closed_protocol_chain_no_follow(root)
    except ValueError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error
    return {
        "registry_sha256": hashlib.sha256(raw).hexdigest(),
        "registry": registry,
        "pairs": copy.deepcopy(openings["pairs"]),
        "attempt_ledger_identity": dict(ledger_identity),
        "rerun_authorization_identity": None,
        "openings_manifest_identity": dict(openings_identity),
        "openings_preflight_receipt_identity": dict(preflight_identity),
        "match_binding_identity": dict(binding_identity),
        "match_binding": match_binding,
        "worker_benchmark_receipt_identity": dict(benchmark_identity),
        "worker_benchmark_receipt": bound_receipt,
        "assets": copy.deepcopy(assets),
    }


def validate_pinned_formal_ready_registry(repo_root: str | Path) -> dict:
    """Validate the one future formal registry; production is closed today."""

    if _PINNED_FORMAL_READY_REGISTRY_IDENTITY is None:
        raise FormalAbV2WorkerBenchmarkBlocked(
            "no code-pinned benchmark-bound formal READY registry is enrolled"
        )
    return capture_formal_ready_registry(
        repo_root,
        _PINNED_FORMAL_READY_REGISTRY_IDENTITY["path"],
        expected_registry_identity=_PINNED_FORMAL_READY_REGISTRY_IDENTITY,
    )


def build_formal_ready_registry_candidate(
    value: Mapping[str, Any],
) -> dict:
    """Compose a review-only formal READY candidate from exact receipt identities."""

    fields = frozenset(
        {
            "experiment_id",
            "run_id",
            "attempt_ledger",
            "openings_manifest",
            "openings_preflight_receipt",
            "match_binding",
            "worker_benchmark_receipt",
            "pair_workers",
        }
    )
    candidate = _exact_dict(value, fields, "formal READY candidate inputs")
    registry = {
        "schema": FORMAL_READY_REGISTRY_SCHEMA,
        "status": FORMAL_READY_STATUS,
        "source_registry": copy.deepcopy(legacy._SOURCE_REGISTRY_IDENTITY),
        "plan": copy.deepcopy(legacy._PLAN_IDENTITY),
        "protocol_amendment_sha256": legacy.FORMAL_AB_V2_AMENDMENT_SHA256,
        "experiment_id": candidate["experiment_id"],
        "run_id": candidate["run_id"],
        "attempt_index": 0,
        "attempt_ledger": copy.deepcopy(candidate["attempt_ledger"]),
        "rerun_authorization": None,
        "openings_manifest": copy.deepcopy(candidate["openings_manifest"]),
        "openings_preflight_receipt": copy.deepcopy(
            candidate["openings_preflight_receipt"]
        ),
        "match_binding": copy.deepcopy(candidate["match_binding"]),
        "worker_benchmark_receipt": copy.deepcopy(
            candidate["worker_benchmark_receipt"]
        ),
        "pair_workers": candidate["pair_workers"],
        "execution_boundary": FORMAL_EXECUTION_BOUNDARY,
        "formal_execution_authorized": True,
        "production_weight_write_authorized": False,
    }
    return validate_formal_ready_registry_data(registry)
