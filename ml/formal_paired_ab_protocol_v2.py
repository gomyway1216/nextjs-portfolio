"""Fail-closed v2 preregistration for the formal paired A/B strength gate.

V2 is an explicit pre-result amendment of the immutable v1 192-pair plan.  It
requires a complete 384-pair / 768-game result and zero recorded technical
faults.  This module cannot start matches, read weights, unlock holdouts, or
authorize production.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import hashlib
import json
from pathlib import Path
import random

from formal_paired_ab_protocol import (
    FRESH_SIBLING_PLAN_BYTES,
    FRESH_SIBLING_PLAN_PATH,
    FRESH_SIBLING_PLAN_SCHEMA,
    FRESH_SIBLING_PLAN_SHA256,
    _reject_nonfinite_constant,
    _score_units,
    _strict_object,
    validate_closed_formal_ab_registry_data,
)


FORMAL_AB_V2_RESULT_SCHEMA = "shogi-floodgate-formal-paired-ab-result-v2"
FORMAL_AB_V2_ANALYSIS_SCHEMA = "shogi-floodgate-formal-paired-ab-analysis-v2"
FORMAL_AB_V2_REGISTRY_SCHEMA = "shogi-floodgate-formal-paired-ab-registry-v2"
FORMAL_AB_V2_AMENDMENT_SCHEMA = "shogi-floodgate-formal-paired-ab-protocol-amendment-v2"

ORIGINAL_V1_REGISTRY_PATH = (
    "ml/protocols/floodgate-q1-2026-formal-paired-ab-registry.json"
)
ORIGINAL_V1_REGISTRY_BYTES = 1_642
ORIGINAL_V1_REGISTRY_SHA256 = (
    "79e5b559c7d58bc5facec207bcc26813c2e797ff27f95068eea8b4110e10de50"
)
ORIGINAL_V1_REGISTRY_SCHEMA = "shogi-floodgate-formal-paired-ab-registry-v1"

FORMAL_AB_V2_AMENDMENT_PATH = (
    "ml/protocols/floodgate-q1-2026-formal-paired-ab-v2-amendment.json"
)
FORMAL_AB_V2_AMENDMENT_BYTES = 4_459
FORMAL_AB_V2_AMENDMENT_SHA256 = (
    "3ce939d40e011503f2ab27db235de8ad144322a876f1cfcfdcea5b17b8d2157c"
)
FORMAL_AB_V2_REGISTRY_PATH = (
    "ml/protocols/floodgate-q1-2026-formal-paired-ab-v2-registry.json"
)
FORMAL_AB_V2_REGISTRY_BYTES = 3_480
FORMAL_AB_V2_REGISTRY_SHA256 = (
    "fbd3f8c87a046a5d5f448106434aca4861a85056d48512194818860b7e9c39b9"
)

PAIR_COUNT = 384
GAME_COUNT = 768
BOOTSTRAP_SEED = 20_260_710
BOOTSTRAP_REPLICATES = 100_000
ONE_SIDED_95_LOWER_RANK = 5_000
TWO_SIDED_95_LOWER_RANK = 2_500
SCORE_DENOMINATOR = PAIR_COUNT * 4
SAFETY_THRESHOLD_NUMERATOR = 45
SAFETY_THRESHOLD_DENOMINATOR = 100
STRONGER_THRESHOLD_NUMERATOR = 50
STRONGER_THRESHOLD_DENOMINATOR = 100
NORMAL_APPROXIMATION_Z = 1.96
PAIR_SCORE_VARIANCE_UPPER_BOUND = 0.25
MAXIMUM_ATTEMPTS_PER_EXPERIMENT = 2

_RESULT_FIELDS = frozenset(
    {
        "schema",
        "plan",
        "protocol_amendment_sha256",
        "experiment_id",
        "run_id",
        "attempt_index",
        "attempt_ledger_sha256",
        "rerun_authorization_sha256",
        "candidate_weights_sha256",
        "stable_weights_sha256",
        "match_binding_sha256",
        "run_status",
        "technical_fault_count",
        "pairs",
    }
)
_PAIR_FIELDS = frozenset({"pair_index", "opening_id", "games"})
_GAME_FIELDS = frozenset({"game_index", "game_id", "candidate_color", "result"})


def _strict_json_loads(raw: str):
    return json.loads(
        raw,
        object_pairs_hook=_strict_object,
        parse_constant=_reject_nonfinite_constant,
    )


def _require_exact_json(value, expected, label: str) -> None:
    """Recursively require exact JSON types and values, including bool versus int."""

    if type(value) is not type(expected):
        raise ValueError(f"{label} type differs from preregistration")
    if type(expected) is dict:
        if any(type(key) is not str for key in value) or set(value) != set(expected):
            raise ValueError(f"{label} fields differ from preregistration")
        for key, expected_value in expected.items():
            _require_exact_json(value[key], expected_value, f"{label}.{key}")
        return
    if type(expected) is list:
        if len(value) != len(expected):
            raise ValueError(f"{label} length differs from preregistration")
        for index, expected_value in enumerate(expected):
            _require_exact_json(value[index], expected_value, f"{label}[{index}]")
        return
    if value != expected:
        raise ValueError(f"{label} differs from preregistration")


def _require_exact_dict(value, fields: frozenset[str], label: str) -> dict:
    if (
        type(value) is not dict
        or any(type(key) is not str for key in value)
        or set(value) != set(fields)
    ):
        raise ValueError(f"{label} fields are not exact")
    return value


def _require_exact_sha256(value, label: str) -> str:
    if (
        type(value) is not str
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise ValueError(f"{label} is not a lowercase SHA-256")
    if value == "0" * 64:
        raise ValueError(f"{label} is a placeholder SHA-256")
    return value


def _require_exact_semantic_id(value, label: str) -> str:
    if (
        type(value) is not str
        or not value.startswith("sha256:")
        or len(value) != 71
        or any(character not in "0123456789abcdef" for character in value[7:])
    ):
        raise ValueError(f"{label} is not a canonical sha256 semantic ID")
    if value == "sha256:" + "0" * 64:
        raise ValueError(f"{label} is a placeholder semantic ID")
    return value


_PLAN_IDENTITY = {
    "path": FRESH_SIBLING_PLAN_PATH,
    "bytes": FRESH_SIBLING_PLAN_BYTES,
    "sha256": FRESH_SIBLING_PLAN_SHA256,
    "schema": FRESH_SIBLING_PLAN_SCHEMA,
}
_V1_REGISTRY_IDENTITY = {
    "path": ORIGINAL_V1_REGISTRY_PATH,
    "bytes": ORIGINAL_V1_REGISTRY_BYTES,
    "sha256": ORIGINAL_V1_REGISTRY_SHA256,
    "schema": ORIGINAL_V1_REGISTRY_SCHEMA,
}
_AMENDMENT_IDENTITY = {
    "path": FORMAL_AB_V2_AMENDMENT_PATH,
    "bytes": FORMAL_AB_V2_AMENDMENT_BYTES,
    "sha256": FORMAL_AB_V2_AMENDMENT_SHA256,
    "schema": FORMAL_AB_V2_AMENDMENT_SCHEMA,
}

_FIXED_DECISION_RULE = {
    "pairs": PAIR_COUNT,
    "games": GAME_COUNT,
    "games_per_pair": 2,
    "colors_per_pair": ["candidate-sente", "candidate-gote"],
    "bootstrap_seed": BOOTSTRAP_SEED,
    "bootstrap_replicates": BOOTSTRAP_REPLICATES,
    "resampling_unit": "two-game-color-swapped-opening-pair",
    "one_sided_95_lower_rank": ONE_SIDED_95_LOWER_RANK,
    "two_sided_95_lower_rank": TWO_SIDED_95_LOWER_RANK,
    "safety_gate": "one-sided-95-lower-strictly-above-0.45",
    "stronger_claim_gate": "two-sided-95-lower-strictly-above-0.50",
    "partial_pair_policy": (
        "no-statistical-or-adoption-decision-from-valid-partial-pairs"
    ),
    "analyzable_result_gate": (
        "exactly-384-pairs-and-768-games-with-zero-technical-faults"
    ),
    "technical_fault_policy": (
        "immediately-invalidate-and-stop-without-a-strength-conclusion"
    ),
    "same_run_fault_retry_policy": "cannot-be-erased-or-retried",
    "maximum_attempts_per_experiment": MAXIMUM_ATTEMPTS_PER_EXPERIMENT,
    "attempt_ledger_policy": (
        "append-only-ledger-retains-every-attempt-fault-and-partial-result-identity"
    ),
    "rerun_authorization_policy": (
        "at-most-one-new-run-authorized-from-technical-evidence-before-any-"
        "result-unblinding"
    ),
    "faulted_attempt_result_policy": (
        "sealed-and-unread-until-rerun-decision-is-immutably-recorded"
    ),
    "second_fault_policy": (
        "experiment-stops-without-strength-conclusion-and-candidate-cannot-rerun"
    ),
    "precision_statement": (
        "normal-approximation-planning-half-width-about-0.05001-not-a-guarantee"
    ),
    "acceptance_statistic": "full-run-pair-bootstrap-only",
}

_EXPECTED_AMENDMENT = {
    "schema": FORMAL_AB_V2_AMENDMENT_SCHEMA,
    "status": "preregistered-blocked",
    "recorded_date": "2026-07-18",
    "original_plan": _PLAN_IDENTITY,
    "original_v1_registry": _V1_REGISTRY_IDENTITY,
    "amendment": {
        "scope": "formal-paired-ab-sample-size-completion-and-technical-fault-gate-only",
        "reason": (
            "the-original-192-pair-design-has-about-7.07-percentage-points-"
            "worst-case-normal-approximation-half-width-and-is-too-coarse-for-"
            "the-intended-five-point-planning-scale"
        ),
        "v1_disposition": "retired-before-execution-and-preserved-byte-for-byte",
        "replacement_registry": {
            "path": FORMAL_AB_V2_REGISTRY_PATH,
            "schema": FORMAL_AB_V2_REGISTRY_SCHEMA,
        },
        "fixed_decision_rule": _FIXED_DECISION_RULE,
        "replacement_pairs": PAIR_COUNT,
        "replacement_games": GAME_COUNT,
        "completion_policy": (
            "no-statistical-or-adoption-decision-from-valid-partial-pairs"
        ),
        "analyzable_result_policy": (
            "exactly-384-pairs-and-768-games-with-zero-technical-faults"
        ),
        "technical_fault_policy": (
            "any-technical-fault-immediately-invalidates-and-stops-the-run-"
            "without-a-strength-conclusion"
        ),
        "fault_retry_policy": (
            "same-run-retry-forbidden-and-at-most-one-new-run-requires-blinded-"
            "prior-authorization-and-an-append-only-attempt-ledger"
        ),
        "precision_basis": {
            "method": ("bounded-pair-score-normal-approximation-for-planning-only"),
            "pair_score_variance_upper_bound": "0.25",
            "normal_approximation_z": "1.96",
            "original_192_pair_half_width": "0.07073",
            "replacement_384_pair_half_width": "0.05001",
            "bootstrap_width_is_data_dependent": True,
            "guaranteed_maximum_half_width": False,
            "power_guarantee": False,
            "acceptance_uses_this_approximation": False,
        },
    },
    "pre_result_state": {
        "fresh_candidate_selected": False,
        "candidate_weights_enrolled": 0,
        "upstream_receipts_enrolled": 0,
        "v1_execution_authorized": False,
        "v1_pairs_observed": 0,
        "v1_games_observed": 0,
        "v2_attempts_observed": 0,
        "v2_pairs_observed": 0,
        "v2_games_observed": 0,
        "external_calibration_games_observed": 0,
        "live_weights_changed": False,
    },
    "authority": {
        "execution_authorized": False,
        "result_reader_authorized": False,
        "promotion_authorized": False,
        "production_weight_write_authorized": False,
    },
    "nonclaims": {
        "matches_executed": False,
        "strength_improved": False,
        "high_dan_calibrated": False,
        "live_weights_changed": False,
    },
}

_EXPECTED_CLOSED_REGISTRY = {
    "schema": FORMAL_AB_V2_REGISTRY_SCHEMA,
    "status": "blocked",
    "reason": "artifact-identities-match-binding-and-upstream-receipts-not-enrolled",
    "supersession": {
        "amendment": _AMENDMENT_IDENTITY,
        "original_v1_registry": _V1_REGISTRY_IDENTITY,
    },
    "plan": _PLAN_IDENTITY,
    "fixed_protocol": _FIXED_DECISION_RULE,
    "enrollments": {
        "candidate_weights": None,
        "stable_weights": None,
        "selection_receipt": None,
        "fresh_final_holdout_receipt": None,
        "legacy_final_holdout_receipt": None,
        "retention_receipt": None,
        "known_regression_receipt": None,
        "production_parity_receipt": None,
        "openings_manifest": None,
        "match_binding": None,
        "attempt_ledger": None,
        "rerun_authorization": None,
    },
    "gates": {
        "all_upstream_receipts_verified": False,
        "attempt_ledger_verified": False,
        "rerun_authorization_verified": False,
        "execution_authorized": False,
        "complete_result_verified": False,
        "zero_technical_faults_verified": False,
        "result_reader_authorized": False,
        "promotion_authorized": False,
        "production_weight_write_authorized": False,
    },
    "nonclaims": {
        "matches_executed": False,
        "pairs_observed": 0,
        "games_observed": 0,
        "strength_improved": False,
        "high_dan_calibrated": False,
        "live_weights_changed": False,
    },
}


def validate_formal_ab_v2_amendment_data(amendment: Mapping) -> Mapping:
    """Validate the exact pre-result amendment, including all zero observations."""

    _require_exact_json(amendment, _EXPECTED_AMENDMENT, "formal A/B v2 amendment")
    return amendment


def _read_pinned_json_identity(repo_root: Path, identity: Mapping, label: str):
    path = repo_root / identity["path"]
    raw = path.read_bytes()
    if len(raw) != identity["bytes"]:
        raise ValueError(f"{label} byte length differs from amendment")
    if hashlib.sha256(raw).hexdigest() != identity["sha256"]:
        raise ValueError(f"{label} SHA-256 differs from amendment")
    payload = _strict_json_loads(raw.decode("utf-8"))
    if type(payload) is not dict or type(payload.get("schema")) is not str:
        raise ValueError(f"{label} schema is invalid")
    if payload["schema"] != identity["schema"]:
        raise ValueError(f"{label} schema differs from amendment")
    return payload


def validate_formal_ab_v2_amendment_chain(repo_root: str | Path) -> Mapping:
    """Verify that v2 explicitly descends from unchanged plan and v1 registry."""

    root = Path(repo_root)
    amendment = _read_pinned_json_identity(
        root, _AMENDMENT_IDENTITY, "formal A/B v2 amendment"
    )
    validate_formal_ab_v2_amendment_data(amendment)
    _read_pinned_json_identity(root, _PLAN_IDENTITY, "fresh sibling plan")
    v1_registry = _read_pinned_json_identity(
        root, _V1_REGISTRY_IDENTITY, "formal A/B v1 registry"
    )
    validate_closed_formal_ab_registry_data(v1_registry)
    return amendment


def validate_closed_formal_ab_v2_registry_data(registry: Mapping) -> Mapping:
    """Validate the exact all-closed v2 registry."""

    _require_exact_json(registry, _EXPECTED_CLOSED_REGISTRY, "formal A/B v2 registry")
    return registry


def validate_closed_formal_ab_v2_registry(path: str | Path) -> Mapping:
    """Validate the registry and its on-disk supersession chain."""

    registry_path = Path(path).resolve()
    raw = registry_path.read_bytes()
    if len(raw) != FORMAL_AB_V2_REGISTRY_BYTES:
        raise ValueError("formal A/B v2 registry byte length differs")
    if hashlib.sha256(raw).hexdigest() != FORMAL_AB_V2_REGISTRY_SHA256:
        raise ValueError("formal A/B v2 registry SHA-256 differs")
    registry = _strict_json_loads(raw.decode("utf-8"))
    validate_closed_formal_ab_v2_registry_data(registry)
    validate_formal_ab_v2_amendment_chain(registry_path.parents[2])
    return registry


def decode_pair_score_units(
    payload: Mapping,
) -> tuple[list[int], dict[str, str | int | None]]:
    """Strict-decode one complete v2 result into 384 paired score numerators."""

    result = _require_exact_dict(payload, _RESULT_FIELDS, "formal A/B v2 result")
    if (
        type(result.get("schema")) is not str
        or result["schema"] != FORMAL_AB_V2_RESULT_SCHEMA
    ):
        raise ValueError("formal A/B v2 result schema is invalid")
    _require_exact_json(result.get("plan"), _PLAN_IDENTITY, "formal A/B v2 plan")
    if (
        type(result.get("protocol_amendment_sha256")) is not str
        or result["protocol_amendment_sha256"] != FORMAL_AB_V2_AMENDMENT_SHA256
    ):
        raise ValueError("formal A/B v2 result amendment identity is invalid")
    experiment_id = _require_exact_semantic_id(
        result.get("experiment_id"), "formal A/B v2 experiment_id"
    )
    run_id = _require_exact_semantic_id(result.get("run_id"), "formal A/B v2 run_id")
    if run_id == experiment_id:
        raise ValueError("formal A/B v2 run and experiment identities must differ")
    attempt_index = result.get("attempt_index")
    if type(attempt_index) is not int or attempt_index not in (0, 1):
        raise ValueError("formal A/B v2 attempt_index must be integer 0 or 1")
    attempt_ledger_sha256 = _require_exact_sha256(
        result.get("attempt_ledger_sha256"), "attempt_ledger_sha256"
    )
    rerun_authorization = result.get("rerun_authorization_sha256")
    if attempt_index == 0:
        if rerun_authorization is not None:
            raise ValueError(
                "formal A/B v2 first attempt cannot carry rerun authorization"
            )
    else:
        rerun_authorization = _require_exact_sha256(
            rerun_authorization, "rerun_authorization_sha256"
        )
    candidate_sha256 = _require_exact_sha256(
        result.get("candidate_weights_sha256"), "candidate_weights_sha256"
    )
    stable_sha256 = _require_exact_sha256(
        result.get("stable_weights_sha256"), "stable_weights_sha256"
    )
    if candidate_sha256 == stable_sha256:
        raise ValueError("candidate and stable weight identities must differ")
    match_binding_sha256 = _require_exact_sha256(
        result.get("match_binding_sha256"), "match_binding_sha256"
    )
    if type(result.get("run_status")) is not str or result["run_status"] != "complete":
        raise ValueError("formal A/B v2 result is not a complete run")
    technical_fault_count = result.get("technical_fault_count")
    if type(technical_fault_count) is not int or technical_fault_count != 0:
        raise ValueError(
            "formal A/B v2 result has a technical fault and is not analyzable"
        )

    pairs = result.get("pairs")
    if type(pairs) is not list or len(pairs) != PAIR_COUNT:
        raise ValueError("formal A/B v2 result requires exactly 384 pairs")

    opening_ids: set[str] = set()
    game_ids: set[str] = set()
    pair_units: list[int] = []
    for pair_index, raw_pair in enumerate(pairs):
        pair = _require_exact_dict(
            raw_pair, _PAIR_FIELDS, f"formal A/B v2 pair {pair_index}"
        )
        if type(pair.get("pair_index")) is not int or pair["pair_index"] != pair_index:
            raise ValueError(
                "formal A/B v2 pair indices must be contiguous and ordered"
            )
        opening_id = _require_exact_semantic_id(
            pair.get("opening_id"), f"formal A/B v2 pair {pair_index} opening_id"
        )
        if opening_id in opening_ids:
            raise ValueError("formal A/B v2 opening IDs must be unique by pair")
        opening_ids.add(opening_id)

        games = pair.get("games")
        if type(games) is not list or len(games) != 2:
            raise ValueError("formal A/B v2 pair requires exactly two games")
        expected_colors = ("sente", "gote")
        units = 0
        for game_index, raw_game in enumerate(games):
            game = _require_exact_dict(
                raw_game,
                _GAME_FIELDS,
                f"formal A/B v2 pair {pair_index} game {game_index}",
            )
            if (
                type(game.get("game_index")) is not int
                or game["game_index"] != game_index
            ):
                raise ValueError("formal A/B v2 game indices must be 0 then 1")
            if (
                type(game.get("candidate_color")) is not str
                or game["candidate_color"] != expected_colors[game_index]
            ):
                raise ValueError(
                    "formal A/B v2 pair must contain candidate sente then candidate gote"
                )
            game_id = _require_exact_semantic_id(
                game.get("game_id"),
                f"formal A/B v2 pair {pair_index} game {game_index} game_id",
            )
            if game_id in game_ids:
                raise ValueError("formal A/B v2 game IDs must be globally unique")
            game_ids.add(game_id)
            units += _score_units(game.get("result"))
        pair_units.append(units)

    if len(game_ids) != GAME_COUNT:
        raise ValueError("formal A/B v2 result requires exactly 768 unique games")
    return pair_units, {
        "experiment_id": experiment_id,
        "run_id": run_id,
        "attempt_index": attempt_index,
        "attempt_ledger_sha256": attempt_ledger_sha256,
        "rerun_authorization_sha256": rerun_authorization,
        "candidate_weights_sha256": candidate_sha256,
        "stable_weights_sha256": stable_sha256,
        "match_binding_sha256": match_binding_sha256,
        "technical_fault_count": technical_fault_count,
    }


def _paired_bootstrap_lower_numerators(
    pair_units: Sequence[int],
    *,
    seed: int = BOOTSTRAP_SEED,
    replicates: int = BOOTSTRAP_REPLICATES,
) -> tuple[int, int]:
    if len(pair_units) != PAIR_COUNT:
        raise ValueError("paired bootstrap requires exactly 384 pair scores")
    if (
        type(seed) is not int
        or type(replicates) is not int
        or replicates < 40
        or replicates % 40 != 0
    ):
        raise ValueError("paired bootstrap seed/replicate count is invalid")
    if any(type(value) is not int or value < 0 or value > 4 for value in pair_units):
        raise ValueError("paired bootstrap score is outside 0..4")

    if len(set(pair_units)) == 1:
        replicate_numerators = [pair_units[0] * PAIR_COUNT] * replicates
    else:
        rng = random.Random(seed)
        replicate_numerators = []
        append = replicate_numerators.append
        for _ in range(replicates):
            total = 0
            for _pair in range(PAIR_COUNT):
                total += pair_units[rng.randrange(PAIR_COUNT)]
            append(total)
        replicate_numerators.sort()

    one_rank = (replicates * ONE_SIDED_95_LOWER_RANK) // BOOTSTRAP_REPLICATES
    two_rank = (replicates * TWO_SIDED_95_LOWER_RANK) // BOOTSTRAP_REPLICATES
    if one_rank < 1 or two_rank < 1:
        raise ValueError("paired bootstrap test replicate count is too small")
    return replicate_numerators[one_rank - 1], replicate_numerators[two_rank - 1]


def _ratio(numerator: int) -> dict[str, int | float]:
    return {
        "numerator": numerator,
        "denominator": SCORE_DENOMINATOR,
        "decimal": numerator / SCORE_DENOMINATOR,
    }


def analyze_formal_paired_ab_v2(payload: Mapping) -> dict[str, object]:
    """Return the full-run v2 analysis, never promotion authority."""

    pair_units, identities = decode_pair_score_units(payload)
    one_sided_lower, two_sided_lower = _paired_bootstrap_lower_numerators(pair_units)
    point_numerator = sum(pair_units)
    safety_passed = (
        one_sided_lower * SAFETY_THRESHOLD_DENOMINATOR
        > SAFETY_THRESHOLD_NUMERATOR * SCORE_DENOMINATOR
    )
    stronger_passed = (
        two_sided_lower * STRONGER_THRESHOLD_DENOMINATOR
        > STRONGER_THRESHOLD_NUMERATOR * SCORE_DENOMINATOR
    )
    return {
        "schema": FORMAL_AB_V2_ANALYSIS_SCHEMA,
        **identities,
        "protocol_amendment_sha256": FORMAL_AB_V2_AMENDMENT_SHA256,
        "counts": {"pairs": PAIR_COUNT, "games": GAME_COUNT},
        "point_score_rate": _ratio(point_numerator),
        "bootstrap": {
            "seed": BOOTSTRAP_SEED,
            "replicates": BOOTSTRAP_REPLICATES,
            "resampling_unit": "two-game-color-swapped-opening-pair",
            "one_sided_95_lower_rank": ONE_SIDED_95_LOWER_RANK,
            "one_sided_95_lower": _ratio(one_sided_lower),
            "two_sided_95_lower_rank": TWO_SIDED_95_LOWER_RANK,
            "two_sided_95_lower": _ratio(two_sided_lower),
        },
        "gates": {
            "complete_384_pairs_768_games": True,
            "technical_faults_exactly_zero": True,
            "safety_strictly_above_0_45": safety_passed,
            "stronger_claim_strictly_above_0_50": stronger_passed,
            "formal_ab_passed": safety_passed and stronger_passed,
        },
        "authority": {
            "promotion_authorized": False,
            "production_weight_write_authorized": False,
        },
        "nonclaims": {
            "strength_improved": False,
            "high_dan_calibrated": False,
        },
    }


def validate_formal_ab_v2_promotion_receipt(_receipt: Mapping) -> None:
    """Fail closed until independent evidence reconstruction is implemented."""

    raise ValueError(
        "formal A/B v2 promotion authorization is not implemented; "
        "production remains STOP"
    )
