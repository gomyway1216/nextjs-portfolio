"""Determinism-gated 2/4/8/12 pair-worker benchmark harness.

The harness is intentionally candidate-agnostic and does not enroll or launch
formal games on its own.  A later reviewed bridge may provide an authenticated
round callback. Selection is impossible unless every round returns the exact
same ordered transcript SHA-256 vector.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
import statistics
import time
from typing import Any

import formal_paired_ab_local_launcher as legacy
from formal_paired_ab_v2_wasm_contract import PAIR_WORKER_CANDIDATES


BENCHMARK_PAIRS_PER_ROUND = 2
BENCHMARK_GAMES_PER_ROUND = BENCHMARK_PAIRS_PER_ROUND * 2
BENCHMARK_SEQUENCE = (2, 4, 8, 12, 12, 8, 4, 2, 2, 4, 8, 12)
REPETITIONS_PER_SETTING = 3
BENCHMARK_ROUND_RESULT_SCHEMA = (
    "shogi-formal-paired-ab-v2-worker-benchmark-round-result-v1"
)
BENCHMARK_RECEIPT_SCHEMA = (
    "shogi-formal-paired-ab-v2-worker-benchmark-receipt-v1"
)
SELECTION_CONDITION = (
    "highest-median-pairs-per-second-after-exact-transcript-hash-equality"
)

_ROUND_RESULT_FIELDS = frozenset(
    {
        "schema",
        "pairs",
        "games",
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
        "technical_fault_count",
        "transcript_sha256s",
    }
)


class FormalAbV2WorkerBenchmarkError(ValueError):
    """The worker benchmark cannot make a deterministic safe selection."""


def _exact_dict(value: Any, fields: frozenset[str], label: str) -> dict:
    try:
        return legacy._exact_dict(value, fields, label)
    except legacy.FormalAbLocalLauncherError as error:
        raise FormalAbV2WorkerBenchmarkError(str(error)) from error


def _domain_digest(domain: str, payload: Mapping | list) -> str:
    return legacy._sha256_text(domain + "\0" + legacy._canonical_json(payload))


def _validated_transcript_vector(value: Any, label: str) -> list[str]:
    if (
        type(value) is not list
        or len(value) != BENCHMARK_GAMES_PER_ROUND
    ):
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
    """Select the fastest median only after byte-exact transcript equality."""

    if type(observations) is not list or len(observations) != len(
        BENCHMARK_SEQUENCE
    ):
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
                "each pair-worker setting requires exactly three repetitions"
            )
        median_elapsed_ns = int(statistics.median(elapsed))
        timing_summary.append(
            {
                "pair_workers": workers,
                "repetitions": REPETITIONS_PER_SETTING,
                "median_elapsed_ns": median_elapsed_ns,
                "median_pairs_per_second_milli": (
                    BENCHMARK_PAIRS_PER_ROUND * 1_000_000_000_000
                )
                // median_elapsed_ns,
            }
        )
    selected = min(
        timing_summary,
        key=lambda row: (row["median_elapsed_ns"], row["pair_workers"]),
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
                "elapsed_ns": finished_ns - started_ns,
                "pairs": result["pairs"],
                "games": result["games"],
                "technical_fault_count": result["technical_fault_count"],
                "transcript_sha256s": result["transcript_sha256s"],
            }
        )
    return select_formal_ab_v2_pair_workers(observations)
