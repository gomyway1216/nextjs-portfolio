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


def main(
    argv: list[str] | None = None,
    *,
    _repo_root: str | Path | None = None,
    _home_root: str | Path | None = None,
    _run: Callable[[str | Path, str | Path], tuple[Mapping[str, Any], Path]] = (
        benchmark.run_pinned_worker_benchmark
    ),
) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        print(_canonical_json(_stop("arguments-forbidden")), file=sys.stderr)
        return 2
    repo_root = (
        Path(__file__).resolve().parents[1] if _repo_root is None else Path(_repo_root)
    )
    home_root = Path.home() if _home_root is None else Path(_home_root)
    try:
        receipt, receipt_path = _run(repo_root, home_root)
        validated = benchmark.validate_bound_worker_benchmark_receipt(receipt)
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
        print(_canonical_json(_stop("benchmark-failed-closed")), file=sys.stderr)
        return 2
    print(_canonical_json(validated))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
