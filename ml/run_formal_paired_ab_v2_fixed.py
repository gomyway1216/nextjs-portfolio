#!/usr/bin/env python3
"""Argumentless fixed formal paired A/B v2 production CLI.

The benchmark-bound runner, READY registry, authority, receipts, openings, and
attempt ledger remain source-pinned elsewhere.  This entry accepts no caller
inputs and publishes only the fixed analyzer's validated public aggregate.
"""

from __future__ import annotations

import math
import sys
from typing import Any, Callable, Mapping

import formal_paired_ab_local_launcher as legacy
import formal_paired_ab_protocol_v2 as formal_protocol
import formal_paired_ab_v2_benchmark_bound_runner as bound_runner
import formal_paired_ab_v2_worker_benchmark_bridge as bridge


FORMAL_CLI_RECEIPT_SCHEMA = "shogi-formal-paired-ab-v2-benchmark-bound-cli-receipt-v1"
_PUBLIC_ANALYSIS_FIELDS = frozenset(
    {
        "schema",
        "experiment_id",
        "run_id",
        "attempt_index",
        "attempt_ledger_sha256",
        "rerun_authorization_sha256",
        "candidate_weights_sha256",
        "stable_weights_sha256",
        "match_binding_sha256",
        "technical_fault_count",
        "protocol_amendment_sha256",
        "counts",
        "point_score_rate",
        "bootstrap",
        "gates",
        "authority",
        "nonclaims",
    }
)
_RATIO_FIELDS = frozenset({"numerator", "denominator", "decimal"})
_BOOTSTRAP_FIELDS = frozenset(
    {
        "seed",
        "replicates",
        "resampling_unit",
        "one_sided_95_lower_rank",
        "one_sided_95_lower",
        "two_sided_95_lower_rank",
        "two_sided_95_lower",
    }
)
_GATE_FIELDS = frozenset(
    {
        "complete_384_pairs_768_games",
        "technical_faults_exactly_zero",
        "safety_strictly_above_0_45",
        "stronger_claim_strictly_above_0_50",
        "formal_ab_passed",
    }
)


class FormalAbV2FixedCliError(ValueError):
    """The fixed formal CLI cannot safely publish its public aggregate."""


def _validate_ratio(value: Any, label: str) -> int:
    ratio = formal_protocol._require_exact_dict(value, _RATIO_FIELDS, label)
    numerator = ratio["numerator"]
    denominator = ratio["denominator"]
    decimal = ratio["decimal"]
    if (
        type(numerator) is not int
        or not 0 <= numerator <= formal_protocol.SCORE_DENOMINATOR
        or type(denominator) is not int
        or denominator != formal_protocol.SCORE_DENOMINATOR
    ):
        raise FormalAbV2FixedCliError(f"{label} fraction differs")
    expected_decimal = numerator / denominator
    if (
        type(decimal) is not float
        or not math.isfinite(decimal)
        or decimal.hex() != expected_decimal.hex()
    ):
        raise FormalAbV2FixedCliError(f"{label} decimal differs")
    return numerator


def _validate_public_analysis(value: Mapping[str, Any]) -> dict[str, Any]:
    """Accept exactly the fixed analyzer aggregate, never private run detail."""

    analysis = formal_protocol._require_exact_dict(
        value, _PUBLIC_ANALYSIS_FIELDS, "formal public analysis"
    )
    formal_protocol._require_exact_json(
        analysis["schema"],
        formal_protocol.FORMAL_AB_V2_ANALYSIS_SCHEMA,
        "formal public analysis schema",
    )
    experiment_id = formal_protocol._require_exact_semantic_id(
        analysis["experiment_id"], "formal public analysis experiment_id"
    )
    run_id = formal_protocol._require_exact_semantic_id(
        analysis["run_id"], "formal public analysis run_id"
    )
    if run_id == experiment_id:
        raise FormalAbV2FixedCliError(
            "formal public analysis run and experiment identities match"
        )
    attempt_index = analysis["attempt_index"]
    if type(attempt_index) is not int or attempt_index not in (0, 1):
        raise FormalAbV2FixedCliError("formal public analysis attempt index differs")
    formal_protocol._require_exact_sha256(
        analysis["attempt_ledger_sha256"],
        "formal public analysis attempt ledger",
    )
    rerun_authorization = analysis["rerun_authorization_sha256"]
    if attempt_index == 0:
        if rerun_authorization is not None:
            raise FormalAbV2FixedCliError(
                "formal public analysis first attempt has rerun authority"
            )
    else:
        formal_protocol._require_exact_sha256(
            rerun_authorization, "formal public analysis rerun authorization"
        )
    candidate_sha256 = formal_protocol._require_exact_sha256(
        analysis["candidate_weights_sha256"],
        "formal public analysis candidate weights",
    )
    stable_sha256 = formal_protocol._require_exact_sha256(
        analysis["stable_weights_sha256"],
        "formal public analysis stable weights",
    )
    if candidate_sha256 == stable_sha256:
        raise FormalAbV2FixedCliError("formal public analysis weight identities match")
    formal_protocol._require_exact_sha256(
        analysis["match_binding_sha256"],
        "formal public analysis match binding",
    )
    if (
        type(analysis["technical_fault_count"]) is not int
        or analysis["technical_fault_count"] != 0
    ):
        raise FormalAbV2FixedCliError(
            "formal public analysis technical fault count differs"
        )
    formal_protocol._require_exact_json(
        analysis["protocol_amendment_sha256"],
        formal_protocol.FORMAL_AB_V2_AMENDMENT_SHA256,
        "formal public analysis protocol amendment",
    )
    formal_protocol._require_exact_json(
        analysis["counts"],
        {
            "pairs": formal_protocol.PAIR_COUNT,
            "games": formal_protocol.GAME_COUNT,
        },
        "formal public analysis counts",
    )
    _validate_ratio(analysis["point_score_rate"], "formal point score rate")

    bootstrap = formal_protocol._require_exact_dict(
        analysis["bootstrap"], _BOOTSTRAP_FIELDS, "formal public bootstrap"
    )
    for field, expected in (
        ("seed", formal_protocol.BOOTSTRAP_SEED),
        ("replicates", formal_protocol.BOOTSTRAP_REPLICATES),
        ("resampling_unit", "two-game-color-swapped-opening-pair"),
        ("one_sided_95_lower_rank", formal_protocol.ONE_SIDED_95_LOWER_RANK),
        ("two_sided_95_lower_rank", formal_protocol.TWO_SIDED_95_LOWER_RANK),
    ):
        formal_protocol._require_exact_json(
            bootstrap[field], expected, f"formal public bootstrap.{field}"
        )
    one_sided_lower = _validate_ratio(
        bootstrap["one_sided_95_lower"], "formal one-sided bootstrap lower"
    )
    two_sided_lower = _validate_ratio(
        bootstrap["two_sided_95_lower"], "formal two-sided bootstrap lower"
    )
    if two_sided_lower > one_sided_lower:
        raise FormalAbV2FixedCliError(
            "formal public bootstrap lower bounds are inconsistent"
        )

    safety_passed = (
        one_sided_lower * formal_protocol.SAFETY_THRESHOLD_DENOMINATOR
        > formal_protocol.SAFETY_THRESHOLD_NUMERATOR * formal_protocol.SCORE_DENOMINATOR
    )
    stronger_passed = (
        two_sided_lower * formal_protocol.STRONGER_THRESHOLD_DENOMINATOR
        > formal_protocol.STRONGER_THRESHOLD_NUMERATOR
        * formal_protocol.SCORE_DENOMINATOR
    )
    gates = formal_protocol._require_exact_dict(
        analysis["gates"], _GATE_FIELDS, "formal public gates"
    )
    formal_protocol._require_exact_json(
        gates,
        {
            "complete_384_pairs_768_games": True,
            "technical_faults_exactly_zero": True,
            "safety_strictly_above_0_45": safety_passed,
            "stronger_claim_strictly_above_0_50": stronger_passed,
            "formal_ab_passed": safety_passed and stronger_passed,
        },
        "formal public gates",
    )
    formal_protocol._require_exact_json(
        analysis["authority"],
        {
            "promotion_authorized": False,
            "production_weight_write_authorized": False,
        },
        "formal public analysis authority",
    )
    formal_protocol._require_exact_json(
        analysis["nonclaims"],
        {
            "strength_improved": False,
            "high_dan_calibrated": False,
        },
        "formal public analysis nonclaims",
    )
    return dict(analysis)


def _cli_stop(reason: str) -> dict[str, Any]:
    return {
        "schema": FORMAL_CLI_RECEIPT_SCHEMA,
        "status": "STOP",
        "reason": reason,
        "public_analysis_emitted": False,
        "production_weight_write_authorized": False,
    }


def _main_core_for_tests(
    arguments: list[str],
    run: Callable[[], Mapping[str, Any]],
    analyze: Callable[[Mapping[str, Any]], Mapping[str, Any]],
) -> int:
    """Injected CLI seam; production paths and authority remain fixed."""

    if arguments:
        print(
            legacy._canonical_json(_cli_stop("arguments-forbidden")),
            file=sys.stderr,
        )
        return 2
    try:
        result = run()
        analysis = _validate_public_analysis(analyze(result))
        serialized = legacy._canonical_json(analysis)
    except bridge.FormalAbV2WorkerBenchmarkBlocked:
        print(
            legacy._canonical_json(_cli_stop("formal-ready-registry-blocked")),
            file=sys.stderr,
        )
        return 2
    except Exception:
        print(
            legacy._canonical_json(_cli_stop("formal-run-failed-closed")),
            file=sys.stderr,
        )
        return 2
    print(serialized)
    return 0


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    return _main_core_for_tests(
        arguments,
        bound_runner.run_pinned_ready_wasm_pairs,
        formal_protocol.analyze_formal_paired_ab_v2,
    )


if __name__ == "__main__":
    raise SystemExit(main())
