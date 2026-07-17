"""Fail-closed, Torch-independent protocol for the formal paired A/B gate.

This module can validate and analyze a completed 192-pair / 384-game result.
It deliberately cannot start matches, read weights, unlock holdouts, or authorize
production.  The checked-in registry remains closed until separately reviewed
artifact identities and upstream gate receipts are enrolled.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import json
from pathlib import Path
import random
import re


FORMAL_AB_RESULT_SCHEMA = "shogi-floodgate-formal-paired-ab-result-v1"
FORMAL_AB_ANALYSIS_SCHEMA = "shogi-floodgate-formal-paired-ab-analysis-v1"
FORMAL_AB_REGISTRY_SCHEMA = "shogi-floodgate-formal-paired-ab-registry-v1"
FRESH_SIBLING_PLAN_SCHEMA = "shogi-floodgate-fresh-sibling-plan-v1"
FRESH_SIBLING_PLAN_PATH = "ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json"
FRESH_SIBLING_PLAN_BYTES = 10_890
FRESH_SIBLING_PLAN_SHA256 = (
    "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af"
)
FORMAL_AB_REGISTRY_PATH = (
    "ml/protocols/floodgate-q1-2026-formal-paired-ab-registry.json"
)

PAIR_COUNT = 192
GAME_COUNT = 384
BOOTSTRAP_SEED = 20_260_710
BOOTSTRAP_REPLICATES = 100_000
ONE_SIDED_95_LOWER_RANK = 5_000
TWO_SIDED_95_LOWER_RANK = 2_500
SCORE_DENOMINATOR = PAIR_COUNT * 4
SAFETY_THRESHOLD_NUMERATOR = 45
SAFETY_THRESHOLD_DENOMINATOR = 100
STRONGER_THRESHOLD_NUMERATOR = 50
STRONGER_THRESHOLD_DENOMINATOR = 100

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_SEMANTIC_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")

_RESULT_FIELDS = frozenset(
    {
        "schema",
        "plan",
        "candidate_weights_sha256",
        "stable_weights_sha256",
        "match_binding_sha256",
        "pairs",
    }
)
_PLAN_FIELDS = frozenset({"path", "bytes", "sha256", "schema"})
_PAIR_FIELDS = frozenset({"pair_index", "opening_id", "games"})
_GAME_FIELDS = frozenset({"game_index", "game_id", "candidate_color", "result"})
_REGISTRY_FIELDS = frozenset(
    {
        "schema",
        "status",
        "reason",
        "plan",
        "fixed_protocol",
        "enrollments",
        "gates",
        "nonclaims",
    }
)
_FIXED_PROTOCOL_FIELDS = frozenset(
    {
        "pairs",
        "games",
        "games_per_pair",
        "colors_per_pair",
        "bootstrap_seed",
        "bootstrap_replicates",
        "resampling_unit",
        "one_sided_95_lower_rank",
        "two_sided_95_lower_rank",
        "safety_gate",
        "stronger_claim_gate",
    }
)
_ENROLLMENT_FIELDS = frozenset(
    {
        "candidate_weights",
        "stable_weights",
        "selection_receipt",
        "fresh_final_holdout_receipt",
        "legacy_final_holdout_receipt",
        "retention_receipt",
        "known_regression_receipt",
        "production_parity_receipt",
        "openings_manifest",
        "match_binding",
    }
)
_GATE_FIELDS = frozenset(
    {
        "all_upstream_receipts_verified",
        "execution_authorized",
        "result_reader_authorized",
        "promotion_authorized",
        "production_weight_write_authorized",
    }
)
_NONCLAIM_FIELDS = frozenset(
    {
        "matches_executed",
        "games_observed",
        "strength_improved",
        "high_dan_calibrated",
        "live_weights_changed",
    }
)


def _strict_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _reject_nonfinite_constant(value):
    raise ValueError(f"non-finite JSON value: {value}")


def _strict_json_loads(raw: str):
    return json.loads(
        raw,
        object_pairs_hook=_strict_object,
        parse_constant=_reject_nonfinite_constant,
    )


def _require_exact_mapping(value, fields: frozenset[str], label: str) -> Mapping:
    if not isinstance(value, Mapping) or set(value) != set(fields):
        raise ValueError(f"{label} fields are not exact")
    return value


def _require_sha256(value, label: str) -> str:
    if not isinstance(value, str) or _SHA256_RE.fullmatch(value) is None:
        raise ValueError(f"{label} is not a lowercase SHA-256")
    if value == "0" * 64:
        raise ValueError(f"{label} is a placeholder SHA-256")
    return value


def _require_semantic_id(value, label: str) -> str:
    if not isinstance(value, str) or _SEMANTIC_ID_RE.fullmatch(value) is None:
        raise ValueError(f"{label} is not a canonical sha256 semantic ID")
    if value == "sha256:" + "0" * 64:
        raise ValueError(f"{label} is a placeholder semantic ID")
    return value


def _require_exact_plan(value) -> Mapping:
    plan = _require_exact_mapping(value, _PLAN_FIELDS, "formal A/B plan")
    if (
        type(plan.get("path")) is not str
        or type(plan.get("bytes")) is not int
        or type(plan.get("sha256")) is not str
        or type(plan.get("schema")) is not str
    ):
        raise ValueError("formal A/B plan field types are invalid")
    _require_sha256(plan["sha256"], "formal A/B plan sha256")
    expected = {
        "path": FRESH_SIBLING_PLAN_PATH,
        "bytes": FRESH_SIBLING_PLAN_BYTES,
        "sha256": FRESH_SIBLING_PLAN_SHA256,
        "schema": FRESH_SIBLING_PLAN_SCHEMA,
    }
    if dict(plan) != expected:
        raise ValueError("formal A/B plan identity is not the preregistered plan")
    return plan


def _score_units(result: object) -> int:
    if type(result) is not str:
        raise ValueError("formal A/B game result is invalid")
    if result == "win":
        return 2
    if result == "draw":
        return 1
    if result == "loss":
        return 0
    raise ValueError("formal A/B game result is invalid")


def decode_pair_score_units(payload: Mapping) -> tuple[list[int], dict[str, str]]:
    """Strict-decode the formal result into 192 paired score numerators.

    One game is scored in half-point units (win=2, draw=1, loss=0).  A pair
    therefore contributes an integer from 0 through 4, so all gate comparisons
    can stay exact and avoid floating-point threshold ambiguity.
    """

    result = _require_exact_mapping(payload, _RESULT_FIELDS, "formal A/B result")
    if (
        type(result.get("schema")) is not str
        or result["schema"] != FORMAL_AB_RESULT_SCHEMA
    ):
        raise ValueError("formal A/B result schema is invalid")
    _require_exact_plan(result.get("plan"))
    candidate_sha256 = _require_sha256(
        result.get("candidate_weights_sha256"), "candidate_weights_sha256"
    )
    stable_sha256 = _require_sha256(
        result.get("stable_weights_sha256"), "stable_weights_sha256"
    )
    if candidate_sha256 == stable_sha256:
        raise ValueError("candidate and stable weight identities must differ")
    match_binding_sha256 = _require_sha256(
        result.get("match_binding_sha256"), "match_binding_sha256"
    )

    pairs = result.get("pairs")
    if type(pairs) is not list or len(pairs) != PAIR_COUNT:
        raise ValueError("formal A/B result requires exactly 192 pairs")

    opening_ids: set[str] = set()
    game_ids: set[str] = set()
    pair_units: list[int] = []
    for pair_index, raw_pair in enumerate(pairs):
        pair = _require_exact_mapping(
            raw_pair, _PAIR_FIELDS, f"formal A/B pair {pair_index}"
        )
        if type(pair.get("pair_index")) is not int or pair["pair_index"] != pair_index:
            raise ValueError("formal A/B pair indices must be contiguous and ordered")
        opening_id = _require_semantic_id(
            pair.get("opening_id"), f"formal A/B pair {pair_index} opening_id"
        )
        if opening_id in opening_ids:
            raise ValueError("formal A/B opening IDs must be unique by pair")
        opening_ids.add(opening_id)

        games = pair.get("games")
        if type(games) is not list or len(games) != 2:
            raise ValueError("formal A/B pair requires exactly two games")
        expected_colors = ("sente", "gote")
        units = 0
        for game_index, raw_game in enumerate(games):
            game = _require_exact_mapping(
                raw_game,
                _GAME_FIELDS,
                f"formal A/B pair {pair_index} game {game_index}",
            )
            if type(game.get("game_index")) is not int or game["game_index"] != game_index:
                raise ValueError("formal A/B game indices must be 0 then 1")
            if (
                type(game.get("candidate_color")) is not str
                or game["candidate_color"] != expected_colors[game_index]
            ):
                raise ValueError(
                    "formal A/B pair must contain candidate sente then candidate gote"
                )
            game_id = _require_semantic_id(
                game.get("game_id"),
                f"formal A/B pair {pair_index} game {game_index} game_id",
            )
            if game_id in game_ids:
                raise ValueError("formal A/B game IDs must be globally unique")
            game_ids.add(game_id)
            units += _score_units(game.get("result"))
        pair_units.append(units)

    if len(game_ids) != GAME_COUNT:
        raise ValueError("formal A/B result requires exactly 384 unique games")
    return pair_units, {
        "candidate_weights_sha256": candidate_sha256,
        "stable_weights_sha256": stable_sha256,
        "match_binding_sha256": match_binding_sha256,
    }


def _paired_bootstrap_lower_numerators(
    pair_units: Sequence[int],
    *,
    seed: int = BOOTSTRAP_SEED,
    replicates: int = BOOTSTRAP_REPLICATES,
) -> tuple[int, int]:
    if len(pair_units) != PAIR_COUNT:
        raise ValueError("paired bootstrap requires exactly 192 pair scores")
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


def analyze_formal_paired_ab(payload: Mapping) -> dict[str, object]:
    """Return the preregistered paired-bootstrap analysis, never authority."""

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
        "schema": FORMAL_AB_ANALYSIS_SCHEMA,
        **identities,
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
            "safety_strictly_above_0_45": safety_passed,
            "stronger_claim_strictly_above_0_50": stronger_passed,
        },
        "authority": {
            "promotion_authorized": False,
            "production_weight_write_authorized": False,
        },
        "nonclaims": {
            "human_rank_proved": False,
            "external_high_dan_calibrated": False,
        },
    }


def validate_closed_formal_ab_registry_data(registry: Mapping) -> Mapping:
    """Validate one decoded registry as an exact all-closed value."""

    root = _require_exact_mapping(registry, _REGISTRY_FIELDS, "formal A/B registry")
    if (
        type(root.get("schema")) is not str
        or root["schema"] != FORMAL_AB_REGISTRY_SCHEMA
    ):
        raise ValueError("formal A/B registry schema is invalid")
    if (
        type(root.get("status")) is not str
        or root["status"] != "blocked"
        or type(root.get("reason")) is not str
        or root["reason"]
        != "artifact-identities-and-upstream-receipts-not-enrolled"
    ):
        raise ValueError("formal A/B registry is not closed")
    _require_exact_plan(root.get("plan"))

    fixed = _require_exact_mapping(
        root.get("fixed_protocol"), _FIXED_PROTOCOL_FIELDS, "fixed_protocol"
    )
    expected_fixed = {
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
    }
    integer_fixed_fields = {
        "pairs",
        "games",
        "games_per_pair",
        "bootstrap_seed",
        "bootstrap_replicates",
        "one_sided_95_lower_rank",
        "two_sided_95_lower_rank",
    }
    if any(type(fixed.get(field)) is not int for field in integer_fixed_fields):
        raise ValueError("formal A/B fixed protocol numeric types are invalid")
    if type(fixed.get("colors_per_pair")) is not list:
        raise ValueError("formal A/B fixed colors are invalid")
    if any(
        type(value) is not str
        for value in (
            *fixed["colors_per_pair"],
            fixed.get("resampling_unit"),
            fixed.get("safety_gate"),
            fixed.get("stronger_claim_gate"),
        )
    ):
        raise ValueError("formal A/B fixed protocol string types are invalid")
    if dict(fixed) != expected_fixed:
        raise ValueError("formal A/B fixed protocol differs from preregistration")

    enrollments = _require_exact_mapping(
        root.get("enrollments"), _ENROLLMENT_FIELDS, "enrollments"
    )
    if any(value is not None for value in enrollments.values()):
        raise ValueError("formal A/B registry unexpectedly enrolls an artifact")
    gates = _require_exact_mapping(root.get("gates"), _GATE_FIELDS, "gates")
    if any(value is not False for value in gates.values()):
        raise ValueError("formal A/B registry unexpectedly opens a gate")
    nonclaims = _require_exact_mapping(
        root.get("nonclaims"), _NONCLAIM_FIELDS, "nonclaims"
    )
    if type(nonclaims.get("games_observed")) is not int or nonclaims[
        "games_observed"
    ] != 0:
        raise ValueError("formal A/B games_observed must be integer zero")
    boolean_nonclaims = set(_NONCLAIM_FIELDS) - {"games_observed"}
    if any(nonclaims[field] is not False for field in boolean_nonclaims):
        raise ValueError("formal A/B registry makes an unsupported claim")
    return root


def validate_closed_formal_ab_registry(path: str | Path) -> Mapping:
    """Validate that the checked-in registry still blocks every operation."""

    registry = _strict_json_loads(Path(path).read_text(encoding="utf-8"))
    return validate_closed_formal_ab_registry_data(registry)


def validate_formal_ab_promotion_receipt(_receipt: Mapping) -> None:
    """Fail closed until external evidence reconstruction is implemented."""

    raise ValueError(
        "formal A/B promotion authorization is not implemented; production remains STOP"
    )
