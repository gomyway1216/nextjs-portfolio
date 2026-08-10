#!/usr/bin/env python3
"""Read-only coverage and score audit for a KingPair 10M Aoba fixture.

The admitted input is ordinary sibling-style JSONL augmented with the two
preflight facts that are not part of the historical sibling schema:
``source_position_domain`` and ``teacher_bound == "exact"``.  Rejected search
observations are supplied separately, so a bound or incomplete result can be
counted without ever becoming a training label.

This module loads only the selected, stdlib-only feature functions from the
live ``train.py`` syntax tree and checks the live KingPair dimensions before
applying its scalar 17x17 relative-king formula.  The audit therefore reuses
the live representation without importing Torch or loading a checkpoint.
"""

from __future__ import annotations

import argparse
import ast
from collections import Counter
import copy
from dataclasses import dataclass
import json
import math
from pathlib import Path
from typing import Callable, Iterable, Iterator, Mapping, Sequence


PROTOCOL_SCHEMA = "shogi-kingpair-interaction-nnue-10m-fast-plan-v1"
DEFAULT_PROTOCOL = (
    Path(__file__).resolve().parent
    / "protocols"
    / "kingpair-interaction-nnue-10m-fast-v1-plan.json"
)
PHASES = ("opening", "mid", "late")
MATE_SCORE_CP = 1_000_000
MAX_NON_MATE_CP = 900_000
MAX_MATE_DISTANCE = MATE_SCORE_CP - MAX_NON_MATE_CP - 1
REJECT_REASONS = (
    "lowerbound",
    "upperbound",
    "incomplete",
    "technical-fault",
)
QUANTILES = (
    ("min", 0.0),
    ("p01", 0.01),
    ("p05", 0.05),
    ("p25", 0.25),
    ("p50", 0.50),
    ("p75", 0.75),
    ("p95", 0.95),
    ("p99", 0.99),
    ("max", 1.0),
)


class AuditError(ValueError):
    """The fixture cannot prove the preregistered data contract."""


@dataclass(frozen=True)
class AuditContract:
    domains: tuple[str, ...]
    maximum_single_domain_fraction: float
    board_features_per_bucket: int = 2_268
    maximum_active_features: int = 40
    king_buckets: int = 81
    relative_king_buckets: int = 17 * 17


@dataclass(frozen=True)
class EncodedPosition:
    """The live model-facing representation of one child SFEN."""

    active_views: tuple[tuple[int, ...], tuple[int, ...]]
    king_buckets: tuple[int, int]
    relative_king_index: int


FeatureEncoder = Callable[[str], EncodedPosition]


def _reject_nonfinite_json(token: str) -> None:
    raise AuditError(f"non-finite JSON number {token}")


def _json_object(raw: str, context: str) -> dict[str, object]:
    try:
        value = json.loads(raw, parse_constant=_reject_nonfinite_json)
    except (json.JSONDecodeError, TypeError) as error:
        raise AuditError(f"{context}: invalid JSON") from error
    if not isinstance(value, dict):
        raise AuditError(f"{context}: row must be a JSON object")
    return value


def load_contract(path: Path = DEFAULT_PROTOCOL) -> AuditContract:
    """Read the already-preregistered protocol; do not create a new schema."""

    protocol = _json_object(path.read_text(encoding="utf-8"), "protocol")
    if protocol.get("schema") != PROTOCOL_SCHEMA:
        raise AuditError("protocol schema does not match the 10M fast lane")
    try:
        candidate = protocol["candidate"]
        fresh = protocol["training_data"]["fresh_aoba"]
    except (KeyError, TypeError) as error:
        raise AuditError("protocol is missing the candidate or fresh-Aoba contract") from error
    if not isinstance(candidate, dict) or not isinstance(fresh, dict):
        raise AuditError("protocol candidate/fresh-Aoba contract is malformed")
    domains = fresh.get("source_position_domains")
    maximum = fresh.get("maximum_single_source_position_domain_fraction")
    if (
        candidate.get("perspectives") != 2
        or "relative-king-17x17" not in candidate.get("explicit_interactions", [])
        or fresh.get("exact_only") is not True
        or fresh.get("depth") != 12
        or fresh.get("multipv") != 4
        or not isinstance(domains, list)
        or not domains
        or any(not isinstance(value, str) or not value for value in domains)
        or len(set(domains)) != len(domains)
        or type(maximum) not in (int, float)
        or not math.isfinite(float(maximum))
        or not 0.0 < float(maximum) <= 1.0
    ):
        raise AuditError("protocol's KingPair/Aoba fixture contract is malformed")
    return AuditContract(tuple(domains), float(maximum))


def _assignment_targets(node: ast.Assign) -> set[str]:
    return {
        target.id
        for target in node.targets
        if isinstance(target, ast.Name)
    }


def _load_train_feature_namespace() -> dict[str, object]:
    """Compile the live parser functions without importing train.py's Torch stack."""

    path = Path(__file__).resolve().parent / "train.py"
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    assignment_names = {
        "PIECE_INDEX",
        "PROMOTED_INDEX",
        "PROMOTED_REMAP",
        "HAND_ORDER",
        "NUM_PLANES",
        "NUM_SQ",
        "BOARD_FEATS",
        "HAND_FEATS",
        "KP_BUCKETS",
        "HALFKP_BUCKETS",
        "FEATURE_BUCKET_COUNTS",
        "MAX_PIECES",
        "MATE_SCORE_CP",
        "MAX_NON_MATE_CP",
    }
    function_names = {
        "kp_bucket",
        "feature_bucket_count",
        "feature_bucket",
        "parse_sfen",
        "dual_views_from_normalized_features",
        "parse_sfen_dual",
    }
    nodes: list[ast.stmt] = []
    observed_assignments: set[str] = set()
    observed_functions: set[str] = set()
    for node in tree.body:
        if isinstance(node, ast.Assign):
            targets = _assignment_targets(node)
            if targets & assignment_names:
                nodes.append(copy.deepcopy(node))
                observed_assignments.update(targets & assignment_names)
        elif isinstance(node, ast.FunctionDef) and node.name in function_names:
            nodes.append(copy.deepcopy(node))
            observed_functions.add(node.name)
    if observed_assignments != assignment_names or observed_functions != function_names:
        raise AuditError("live train.py no longer exposes the required feature contract")
    module = ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[]))
    namespace: dict[str, object] = {}
    exec(compile(module, str(path), "exec"), namespace)
    return namespace


def _load_kingpair_contract() -> dict[str, int]:
    """Read the model dimensions and require its relative-index entrypoint."""

    path = Path(__file__).resolve().parent / "kingpair_interaction_nnue.py"
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    constant_names = {
        "NUM_SQUARES",
        "KING_RELATIVE_WIDTH",
        "KING_RELATIVE_BUCKETS",
    }
    constant_nodes: list[ast.stmt] = []
    observed_constants: set[str] = set()
    relative_function: ast.FunctionDef | None = None
    model_class: ast.ClassDef | None = None
    for node in tree.body:
        if isinstance(node, ast.Assign):
            targets = _assignment_targets(node)
            if targets & constant_names:
                constant_nodes.append(copy.deepcopy(node))
                observed_constants.update(targets & constant_names)
        elif isinstance(node, ast.FunctionDef) and node.name == "king_pair_relative_index":
            relative_function = copy.deepcopy(node)
        elif isinstance(node, ast.ClassDef) and node.name == "KingPairInteractionNNUE":
            model_class = node
    if (
        observed_constants != constant_names
        or relative_function is None
        or model_class is None
    ):
        raise AuditError("live KingPair model no longer exposes the required contract")

    model_dimensions: dict[str, int] = {}
    for node in model_class.body:
        if not isinstance(node, ast.Assign):
            continue
        names = _assignment_targets(node)
        for name in names & {"HIDDEN", "KING_EMBED", "MIX1", "MIX2"}:
            value = ast.literal_eval(node.value)
            if type(value) is not int:
                raise AuditError("live KingPair dense dimensions are not integers")
            model_dimensions[name] = value
    if model_dimensions != {"HIDDEN": 128, "KING_EMBED": 16, "MIX1": 64, "MIX2": 32}:
        raise AuditError("live KingPair dense dimensions drifted from the protocol")

    module = ast.fix_missing_locations(ast.Module(body=constant_nodes, type_ignores=[]))
    namespace: dict[str, object] = {}
    exec(compile(module, str(path), "exec"), namespace)
    return {name: int(namespace[name]) for name in constant_names}


def load_live_feature_encoder(contract: AuditContract) -> FeatureEncoder:
    """Bind to the real training encoder and real KingPair relative-index code."""

    train = _load_train_feature_namespace()
    kingpair = _load_kingpair_contract()
    if (
        train["BOARD_FEATS"] != contract.board_features_per_bucket
        or train["MAX_PIECES"] != contract.maximum_active_features
        or train["feature_bucket_count"]("halfkp-dual") != contract.king_buckets
        or train["MATE_SCORE_CP"] != MATE_SCORE_CP
        or train["MAX_NON_MATE_CP"] != MAX_NON_MATE_CP
        or kingpair["NUM_SQUARES"] != contract.king_buckets
        or kingpair["KING_RELATIVE_WIDTH"] != 17
        or kingpair["KING_RELATIVE_BUCKETS"] != contract.relative_king_buckets
    ):
        raise AuditError("live train.py/KingPair dimensions drifted from the protocol")

    def encode(sfen: str) -> EncodedPosition:
        views, _hands, _black_to_move, king_squares = train["parse_sfen_dual"](sfen)
        buckets = tuple(
            train["feature_bucket"]("halfkp-dual", square)
            for square in king_squares
        )
        if len(buckets) != 2:
            raise AuditError("live encoder did not return two king buckets")
        materialized = tuple(
            tuple(bucket * int(train["BOARD_FEATS"]) + feature for feature in view)
            for bucket, view in zip(buckets, views)
        )
        own = buckets[0]
        opponent_in_own_view = kingpair["NUM_SQUARES"] - 1 - buckets[1]
        own_file, own_rank = divmod(own, 9)
        opponent_file, opponent_rank = divmod(opponent_in_own_view, 9)
        relative = (
            (opponent_file - own_file + 8) * kingpair["KING_RELATIVE_WIDTH"]
            + opponent_rank
            - own_rank
            + 8
        )
        return EncodedPosition(
            active_views=(materialized[0], materialized[1]),
            king_buckets=(buckets[0], buckets[1]),
            relative_king_index=relative,
        )

    return encode


def _strict_int(value: object, label: str) -> int:
    if type(value) is not int:
        raise AuditError(f"{label} must be an integer")
    return value


def _nonempty_string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value or value != value.strip():
        raise AuditError(f"{label} must be a non-empty trimmed string")
    return value


def _alias(record: Mapping[str, object], names: Sequence[str], label: str) -> object:
    present = [(name, record[name]) for name in names if name in record]
    if not present:
        raise AuditError(f"{label} is missing")
    first = present[0][1]
    if any(value != first for _name, value in present[1:]):
        raise AuditError(f"{label} aliases disagree")
    return first


def _mate_to_parent_cp(mate: int, sign: int) -> int:
    return sign * (MATE_SCORE_CP - min(abs(mate), MAX_MATE_DISTANCE))


class _ExactIntegerDistribution:
    """Streaming exact quantiles with memory proportional to distinct CP values."""

    def __init__(self) -> None:
        self.counts: Counter[int] = Counter()
        self.negative = 0
        self.zero = 0
        self.positive = 0

    def add(self, value: int) -> None:
        self.counts[value] += 1
        if value < 0:
            self.negative += 1
        elif value > 0:
            self.positive += 1
        else:
            self.zero += 1

    def report(self) -> dict[str, object]:
        total = sum(self.counts.values())
        if total == 0:
            return {
                "count": 0,
                "negative": 0,
                "zero": 0,
                "positive": 0,
                "nearest_rank": {},
            }
        targets = {
            name: int(math.floor((total - 1) * probability + 0.5))
            for name, probability in QUANTILES
        }
        quantiles: dict[str, int] = {}
        cumulative = 0
        pending = sorted(targets.items(), key=lambda item: item[1])
        target_index = 0
        for value, count in sorted(self.counts.items()):
            cumulative += count
            while target_index < len(pending) and pending[target_index][1] < cumulative:
                quantiles[pending[target_index][0]] = value
                target_index += 1
        return {
            "count": total,
            "negative": self.negative,
            "zero": self.zero,
            "positive": self.positive,
            "nearest_rank": quantiles,
        }


class FixtureAudit:
    def __init__(self, contract: AuditContract, encoder: FeatureEncoder) -> None:
        self.contract = contract
        self.encoder = encoder
        self.rows = 0
        self.domain_counts = Counter({domain: 0 for domain in contract.domains})
        self.phase_counts = Counter({phase: 0 for phase in PHASES})
        self.active_counts = (Counter(), Counter())
        self.king_counts = (
            [0] * contract.king_buckets,
            [0] * contract.king_buckets,
        )
        self.relative_counts = [0] * contract.relative_king_buckets
        self.score_kind_counts = Counter({"cp": 0, "mate": 0})
        self.child_cp = _ExactIntegerDistribution()
        self.sign_checks = 0
        self.reject_counts = Counter({reason: 0 for reason in REJECT_REASONS})

    def add_admitted(self, record: Mapping[str, object], context: str) -> None:
        domain = _nonempty_string(
            _alias(record, ("source_position_domain", "domain"), f"{context} domain"),
            f"{context} domain",
        )
        if domain not in self.contract.domains:
            raise AuditError(f"{context}: unregistered source position domain {domain!r}")
        phase = _nonempty_string(record.get("phase"), f"{context} phase")
        if phase not in PHASES:
            raise AuditError(f"{context}: phase must be one of {PHASES}")
        if record.get("teacher_bound") != "exact":
            raise AuditError(f"{context}: admitted Aoba row is not explicitly exact")

        child_sfen = _nonempty_string(
            _alias(record, ("child_sfen", "sfen"), f"{context} child SFEN"),
            f"{context} child SFEN",
        )
        child_cp = _strict_int(record.get("teacher_child_cp"), f"{context} teacher_child_cp")
        parent_cp = _strict_int(record.get("teacher_parent_cp"), f"{context} teacher_parent_cp")
        cp_alias = _strict_int(record.get("cp"), f"{context} cp")
        if child_cp != cp_alias or child_cp != -parent_cp:
            raise AuditError(f"{context}: child CP alias/sign does not match parent perspective")

        score_kind = record.get("teacher_score_kind")
        if score_kind == "cp":
            if "teacher_mate" in record or "teacher_mate_sign" in record:
                raise AuditError(f"{context}: CP row carries mate metadata")
            if abs(parent_cp) > MAX_NON_MATE_CP:
                raise AuditError(f"{context}: CP row enters the reserved mate band")
        elif score_kind == "mate":
            mate = _strict_int(record.get("teacher_mate"), f"{context} teacher_mate")
            sign = _strict_int(record.get("teacher_mate_sign"), f"{context} teacher_mate_sign")
            if mate == 0 or sign not in (-1, 1) or (1 if mate > 0 else -1) != sign:
                raise AuditError(f"{context}: mate distance/sign is contradictory")
            if parent_cp != _mate_to_parent_cp(mate, sign):
                raise AuditError(f"{context}: mate CP mapping is inconsistent")
        else:
            raise AuditError(f"{context}: invalid teacher_score_kind")

        try:
            encoded = self.encoder(child_sfen)
        except (AuditError, TypeError, ValueError) as error:
            raise AuditError(f"{context}: child SFEN feature encoding failed: {error}") from error
        self._validate_encoded(encoded, context)

        self.rows += 1
        self.domain_counts[domain] += 1
        self.phase_counts[phase] += 1
        self.score_kind_counts[str(score_kind)] += 1
        self.child_cp.add(child_cp)
        self.sign_checks += 1

    def _validate_encoded(self, encoded: EncodedPosition, context: str) -> None:
        if len(encoded.active_views) != 2 or len(encoded.king_buckets) != 2:
            raise AuditError(f"{context}: HalfKP row must contain exactly two views")
        if len(encoded.active_views[0]) != len(encoded.active_views[1]):
            raise AuditError(f"{context}: dual HalfKP active counts disagree")
        for view_index, (active, bucket) in enumerate(
            zip(encoded.active_views, encoded.king_buckets)
        ):
            if type(bucket) is not int or not 0 <= bucket < self.contract.king_buckets:
                raise AuditError(f"{context}: king bucket {view_index} is out of range")
            if not 0 < len(active) <= self.contract.maximum_active_features:
                raise AuditError(f"{context}: HalfKP active row {view_index} has invalid length")
            lower = bucket * self.contract.board_features_per_bucket
            upper = lower + self.contract.board_features_per_bucket
            if any(type(feature) is not int or not lower <= feature < upper for feature in active):
                raise AuditError(f"{context}: active feature is outside its HalfKP king bucket")
            if len(set(active)) != len(active):
                raise AuditError(f"{context}: HalfKP active row contains duplicate features")
            self.active_counts[view_index][len(active)] += 1
            self.king_counts[view_index][bucket] += 1
        relative = encoded.relative_king_index
        if type(relative) is not int or not 0 <= relative < self.contract.relative_king_buckets:
            raise AuditError(f"{context}: relative king 17x17 index is out of range")
        self.relative_counts[relative] += 1

    def add_rejected(self, record: Mapping[str, object], context: str) -> None:
        reason = record.get("reason")
        if reason not in REJECT_REASONS:
            raise AuditError(f"{context}: invalid reject reason")
        forbidden_labels = {
            "cp",
            "teacher_child_cp",
            "teacher_parent_cp",
            "teacher_mate",
            "teacher_mate_sign",
        }
        if any(field in record for field in forbidden_labels):
            raise AuditError(f"{context}: rejected search observation became a label")
        self.reject_counts[str(reason)] += 1

    def report(self) -> dict[str, object]:
        if self.rows == 0:
            raise AuditError("fixture contains no admitted exact Aoba rows")
        maximum_domain = max(self.domain_counts.values()) / self.rows
        failures = []
        if maximum_domain > self.contract.maximum_single_domain_fraction:
            failures.append("maximum-single-source-position-domain-fraction")
        if self.reject_counts["technical-fault"] != 0:
            failures.append("technical-faults")

        def count_report(counts: Sequence[int]) -> dict[str, object]:
            return {
                "counts": list(counts),
                "unseen": [index for index, count in enumerate(counts) if count == 0],
            }

        active = []
        for counts in self.active_counts:
            active.append(
                {
                    "counts": {str(key): counts[key] for key in sorted(counts)},
                    "minimum": min(counts),
                    "maximum": max(counts),
                }
            )
        bound_rejects = self.reject_counts["lowerbound"] + self.reject_counts["upperbound"]
        return {
            "status": "pass" if not failures else "fail",
            "failures": failures,
            "rows": {
                "admitted_exact": self.rows,
                "bound_rejects": bound_rejects,
                "incomplete_rejects": self.reject_counts["incomplete"],
                "technical_faults": self.reject_counts["technical-fault"],
            },
            "feature_coverage": {
                "halfkp_active_features_per_view": active,
                "king_buckets": [
                    count_report(self.king_counts[0]),
                    count_report(self.king_counts[1]),
                ],
                "relative_king_17x17": count_report(self.relative_counts),
            },
            "source_coverage": {
                "domains": {
                    "counts": {
                        domain: self.domain_counts[domain]
                        for domain in self.contract.domains
                    },
                    "unseen": [
                        domain
                        for domain in self.contract.domains
                        if self.domain_counts[domain] == 0
                    ],
                    "maximum_observed_fraction": maximum_domain,
                    "maximum_allowed_fraction": self.contract.maximum_single_domain_fraction,
                },
                "phases": {
                    "counts": {phase: self.phase_counts[phase] for phase in PHASES},
                    "unseen": [phase for phase in PHASES if self.phase_counts[phase] == 0],
                },
            },
            "teacher_score": {
                "perspective": "child-side-to-move",
                "parent_child_sign_checks": self.sign_checks,
                "score_kind_counts": dict(self.score_kind_counts),
                "child_cp": self.child_cp.report(),
                "bounds": {
                    "exact_admitted": self.rows,
                    "lowerbound_rejects": self.reject_counts["lowerbound"],
                    "upperbound_rejects": self.reject_counts["upperbound"],
                    "incomplete_rejects": self.reject_counts["incomplete"],
                },
            },
        }


def _jsonl(path: Path, role: str) -> Iterator[tuple[dict[str, object], str]]:
    with path.open("r", encoding="utf-8") as source:
        for line_number, raw in enumerate(source, 1):
            if not raw.strip():
                raise AuditError(f"{path}:{line_number}: blank {role} row")
            context = f"{path}:{line_number}"
            yield _json_object(raw, context), context


def audit_fixture(
    admitted: Iterable[tuple[Mapping[str, object], str]],
    rejected: Iterable[tuple[Mapping[str, object], str]],
    *,
    contract: AuditContract,
    encoder: FeatureEncoder,
) -> dict[str, object]:
    audit = FixtureAudit(contract, encoder)
    for record, context in admitted:
        audit.add_admitted(record, context)
    for record, context in rejected:
        audit.add_rejected(record, context)
    return audit.report()


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rows", nargs="+", type=Path, help="admitted exact JSONL")
    parser.add_argument(
        "--rejects",
        action="append",
        type=Path,
        default=[],
        help="bound/incomplete/fault observation JSONL (repeatable)",
    )
    parser.add_argument("--protocol", type=Path, default=DEFAULT_PROTOCOL)
    args = parser.parse_args(argv)
    try:
        contract = load_contract(args.protocol)
        encoder = load_live_feature_encoder(contract)
        admitted = (
            row
            for path in args.rows
            for row in _jsonl(path, "admitted")
        )
        rejected = (
            row
            for path in args.rejects
            for row in _jsonl(path, "rejected")
        )
        result = audit_fixture(
            admitted,
            rejected,
            contract=contract,
            encoder=encoder,
        )
    except (AuditError, OSError) as error:
        print(json.dumps({"status": "error", "error": str(error)}, sort_keys=True))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
