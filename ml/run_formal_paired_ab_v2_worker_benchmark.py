#!/usr/bin/env python3
"""Argumentless production entry for the code-pinned formal A/B benchmark.

The checked-in registry is BLOCKED, so today's entry validates that exact
state and stops before starting a benchmark round. A later reviewed registry
may authorize only the dedicated 12-pair benchmark; this entry has no formal
pair-journal or live-weight API.
"""

from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any, Callable, Mapping

import formal_paired_ab_v2_worker_benchmark_bridge as benchmark


CLI_RECEIPT_SCHEMA = "shogi-formal-paired-ab-v2-worker-benchmark-cli-receipt-v1"


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=True,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _stop(reason: str) -> dict[str, Any]:
    return {
        "schema": CLI_RECEIPT_SCHEMA,
        "status": "STOP",
        "reason": reason,
        "benchmark_rounds_started": 0,
        "benchmark_pairs_started": 0,
        "benchmark_games_started": 0,
        "formal_pair_journals_created": 0,
        "formal_pairs_started": 0,
        "formal_games_started": 0,
        "network_requests": 0,
        "cloud_jobs": 0,
        "live_weight_write": False,
    }


def _main_core_for_tests(
    arguments: list[str],
    repo_root: str | Path,
    run: Callable[[], tuple[Mapping[str, Any], Path]],
) -> int:
    """Injected CLI seam; production authority and output remain argumentless."""

    if arguments:
        print(_canonical_json(_stop("arguments-forbidden")))
        return 2
    try:
        receipt, receipt_path = run()
        captured = benchmark.validate_pinned_worker_benchmark_registry(repo_root)
        validated = benchmark.validate_bound_worker_benchmark_receipt(
            receipt,
            expected_registry=captured["registry"],
            expected_registry_identity=captured["registry_identity"],
        )
        if receipt_path.name != benchmark.BENCHMARK_OUTPUT_RECEIPT_NAME:
            raise benchmark.FormalAbV2WorkerBenchmarkError(
                "worker benchmark receipt publication path differs"
            )
    except benchmark.FormalAbV2WorkerBenchmarkBlocked:
        print(_canonical_json(_stop("benchmark-registry-blocked")))
        return 2
    except (
        OSError,
        RuntimeError,
        benchmark.FormalAbV2WorkerBenchmarkError,
        ValueError,
    ):
        print(_canonical_json(_stop("benchmark-failed-closed")))
        return 2
    print(_canonical_json(validated))
    return 0


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    return _main_core_for_tests(
        arguments,
        Path(__file__).resolve().parents[1],
        benchmark.run_pinned_worker_benchmark,
    )


if __name__ == "__main__":
    raise SystemExit(main())
