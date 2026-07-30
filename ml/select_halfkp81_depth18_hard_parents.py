#!/usr/bin/env python3
"""Select balanced hard parents for fresh HalfKP81 depth-18 labeling.

Formal CLI execution accepts only a legal-count-enriched, authenticated view of
the exact 800k large-scratch WDL source.  The existing depth-12 CP/outcome are
selection signals only and are never teacher targets.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
from typing import Iterable, Iterator, Mapping, Sequence


INPUT_SCHEMA = "shogi-floodgate-scratch-warm-teacher-v1"
OUTPUT_SCHEMA = "halfkp81-depth18-hard-parent-v2"
MANIFEST_SCHEMA = "halfkp81-depth18-hard-parent-selection-manifest-v2"
LEGAL_MANIFEST_SCHEMA = "shogi-halfkp81-depth18-legal-count-manifest-v1"
LEGAL_MANIFEST_STATUS = (
    "complete-research-data-only-not-deployment-authorization"
)
LEGAL_TOOL_RELATIVE_PATH = "ml/enrich_halfkp81_depth18_legal_counts.ts"
LEGAL_RULES_CLOSURE_EXPECTATIONS = {
    "ml/enrich_halfkp81_depth18_legal_counts.ts": {
        "bytes": 30_138,
        "sha256": "46223237b2a54a3a24e7e390df285af9f663bb9e869f85a109ecdd81d9252d7c",
    },
    "ml/sibling-data.ts": {
        "bytes": 24_266,
        "sha256": "485657debcf5a150130c29217d22c964bc91616a8a152809591461fcb3808bdd",
    },
    "ml/usi-multipv.ts": {
        "bytes": 19_608,
        "sha256": "8e619926ffe64cbbb644316dea0e8ed48dfd70bf9142ca3f5d9ac6864f8d5f60",
    },
    "ml/shogi-sfen.ts": {
        "bytes": 7_033,
        "sha256": "421e73f70ba8f2a499c224b87f6c7a70a40378342295b6a4374d2ba345af5dba",
    },
    "ml/shogi-sfen-codec.ts": {
        "bytes": 2_380,
        "sha256": "fcf17a339e614f3be65d14c6279f80e4f3d70a1dd0ac8098c4565032c7a97025",
    },
    "src/components/game/ShogiImproved/GenerateMovesImproved.ts": {
        "bytes": 36_585,
        "sha256": "3a17c296e74f028fad6c26ac3d71a253ddba20e6afc784b49bed57b328c04e97",
    },
    "src/components/game/ShogiImproved/KyokumenImproved.ts": {
        "bytes": 69_691,
        "sha256": "b2cd56c22d10656a074630cd18106bcbc14218125c08c6f3d22149805cb5666a",
    },
    "src/components/game/ShogiImproved/PromotionRulesImproved.ts": {
        "bytes": 2_698,
        "sha256": "0ee4909a53193d38281e6e5d1ef5be9ca5d5f210b75cea2ce88686ee02e48c8f",
    },
    "src/components/game/ShogiImproved/MoveListImproved.ts": {
        "bytes": 1_441,
        "sha256": "eacee4b83e212aeb5fa999926710e21415861c48920f127357cb00bd396a4226",
    },
    "src/components/game/ShogiImproved/TTEntryImproved.ts": {
        "bytes": 1_061,
        "sha256": "f4231f915de4ba53610c5cb22c56d47d3f7b1ca6b09456f97027082337c8d52e",
    },
    "src/components/game/ShogiImproved/types.ts": {
        "bytes": 6_764,
        "sha256": "510fe873c845a563f367af9720f6c8b27024e647e41cee478fedb55a164c37d0",
    },
}
OVERLAP_MANIFEST_SCHEMA = (
    "shogi-halfkp81-depth18-semantic-overlap-inventory-manifest-v1"
)
OVERLAP_MANIFEST_STATUS = (
    "complete-bound-direct-parent-child-and-selected-formal-opening-prefixes"
)
OVERLAP_ROWS = 243_368
OVERLAP_BYTES = 21_903_120
OVERLAP_SHA256 = "34ef162aabf044e6af28da32ce8add43384fa4070afb87b99e1dcefd527dc809"

SOURCE_ROWS = 800_000
SOURCE_BYTES = 421_952_083
SOURCE_SHA256 = "c83241eb95f3568fe75a95d903e348591af49daf07d23db1db266e9be14a633d"
SOURCE_PATH = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/large-scratch-806k-v1/"
    "wdl/train.teacher.wdl.jsonl"
)

SEMANTIC_ID_RE = re.compile(r"sha256:[0-9a-f]{64}")
SHA256_RE = re.compile(r"[0-9a-f]{64}")
PHASES = (
    ("opening", 12, 39),
    ("mid", 40, 79),
    ("late", 80, 119),
)
PHASE_ORDER = {phase: index for index, (phase, _, _) in enumerate(PHASES)}
FORMAL_PHASE_QUOTAS = {"opening": 2_048, "mid": 3_072, "late": 3_072}
FORMAL_ROLE_SIZES = {"fit": 6_144, "tune": 1_024, "sealed": 1_024}
ROLE_ORDER = {"fit": 0, "tune": 1, "sealed": 2}
SIDES = ("b", "w")
BASE_INPUT_KEYS = {
    "schema",
    "split",
    "game_id",
    "game_sha256",
    "position_id",
    "sfen",
    "ply",
    "played_move",
    "ratings",
    "cp",
    "bestmove",
    "depth",
    "outcome",
}
OPTIONAL_INPUT_KEYS = {"legal_move_count", "candidate_count", "mate", "score_type"}


class SelectionError(ValueError):
    """An input or quota cannot safely satisfy the selection contract."""


@dataclass(frozen=True)
class SelectionPlan:
    phase_quotas: Mapping[str, int]
    role_sizes: Mapping[str, int]

    def validate(self) -> None:
        if set(self.phase_quotas) != set(PHASE_ORDER):
            raise SelectionError("phase quotas must name exactly opening/mid/late")
        if set(self.role_sizes) != set(ROLE_ORDER):
            raise SelectionError("role sizes must name exactly fit/tune/sealed")
        values = tuple(self.phase_quotas.values()) + tuple(self.role_sizes.values())
        if any(type(value) is not int or value <= 0 or value % 2 for value in values):
            raise SelectionError("all phase/role quotas must be positive even integers")
        if sum(self.phase_quotas.values()) != sum(self.role_sizes.values()):
            raise SelectionError("phase and role totals differ")

    @property
    def total(self) -> int:
        return sum(self.role_sizes.values())


@dataclass(frozen=True)
class PublishedFile:
    path: Path
    device: int
    inode: int
    bytes: int
    sha256: str


FORMAL_PLAN = SelectionPlan(FORMAL_PHASE_QUOTAS, FORMAL_ROLE_SIZES)


def _canonical_json(value: object) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
        + b"\n"
    )


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _set_digest(domain: str, values: Iterable[str]) -> dict[str, object]:
    ordered = sorted(set(values))
    raw = (
        domain.encode("ascii")
        + b"\0"
        + b"\n".join(value.encode("ascii") for value in ordered)
        + b"\n"
    )
    return {"count": len(ordered), "sha256": _sha256(raw)}


def _identity(path: Path, raw: bytes, *, rows: int | None = None) -> dict[str, object]:
    result: dict[str, object] = {
        "path": os.path.realpath(path),
        "bytes": len(raw),
        "sha256": _sha256(raw),
    }
    if rows is not None:
        result["rows"] = rows
    return result


def _read_stable_bytes(path: Path) -> bytes:
    try:
        first = path.read_bytes()
        second = path.read_bytes()
    except OSError as error:
        raise SelectionError(f"{path}: cannot read: {error}") from error
    if first != second:
        raise SelectionError(f"{path}: changed while being read")
    return first


def _read_stable(path: Path) -> bytes:
    first = _read_stable_bytes(path)
    if not first.endswith(b"\n"):
        raise SelectionError(f"{path}: must end with LF")
    return first


def _strict_json(raw: bytes, context: str) -> object:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise SelectionError(f"{context}: invalid UTF-8") from error
    try:
        return json.loads(
            text,
            parse_constant=lambda value: (_ for _ in ()).throw(
                SelectionError(f"{context}: non-finite JSON number {value}")
            ),
        )
    except (json.JSONDecodeError, RecursionError) as error:
        raise SelectionError(f"{context}: invalid JSON: {error}") from error


def _semantic_id(value: object, context: str) -> str:
    if type(value) is not str or SEMANTIC_ID_RE.fullmatch(value) is None:
        raise SelectionError(f"{context}: must be a lowercase sha256: semantic ID")
    return value


def _digest(value: object, context: str) -> str:
    if type(value) is not str or SHA256_RE.fullmatch(value) is None:
        raise SelectionError(f"{context}: must be a lowercase SHA-256")
    return value


def _canonical_text(value: object, context: str) -> str:
    if (
        type(value) is not str
        or not value
        or value != value.strip()
        or any(ord(character) < 0x20 for character in value)
    ):
        raise SelectionError(f"{context}: must be non-empty canonical text")
    return value


def _integer(value: object, context: str, *, minimum: int | None = None) -> int:
    if type(value) is not int or (minimum is not None and value < minimum):
        suffix = "" if minimum is None else f" >= {minimum}"
        raise SelectionError(f"{context}: must be an integer{suffix}")
    return value


def _position_id_from_sfen(sfen: str) -> str:
    fields = sfen.split()
    if len(fields) != 4 or fields[1] not in SIDES:
        raise SelectionError("SFEN must contain exactly four fields and side b/w")
    canonical = " ".join(fields[:3])
    return "sha256:" + hashlib.sha256(
        f"sfen-v1\0{canonical}".encode("utf-8")
    ).hexdigest()


def _phase_for_ply(ply: int) -> str | None:
    for phase, lower, upper in PHASES:
        if lower <= ply <= upper:
            return phase
    return None


def _legal_move_count(record: Mapping[str, object], context: str) -> int | None:
    values: list[int] = []
    for key in ("legal_move_count", "candidate_count"):
        if key in record:
            values.append(_integer(record[key], f"{context}.{key}", minimum=0))
    if values and any(value != values[0] for value in values[1:]):
        raise SelectionError(f"{context}: legal/candidate move counts disagree")
    return values[0] if values else None


def _is_mate_score(record: Mapping[str, object], cp: int) -> bool:
    if "mate" in record:
        _integer(record["mate"], "input mate score")
        return True
    score_type = record.get("score_type")
    return (
        type(score_type) is str
        and score_type.casefold() in ("mate", "checkmate", "tsumi")
    ) or abs(cp) >= 1_000_000


def _surprise_cp(cp: int, outcome: float) -> int:
    target = 1_000 if outcome == 1.0 else (-1_000 if outcome == 0.0 else 0)
    return abs(target - cp)


def _candidate_from_record(
    record: object,
    *,
    line_number: int,
    overlap_ids: set[str],
    require_legal_move_count: bool,
) -> tuple[dict[str, object] | None, str | None]:
    context = f"input line {line_number}"
    if type(record) is not dict:
        raise SelectionError(f"{context}: must be an object")
    keys = set(record)
    if not BASE_INPUT_KEYS <= keys or keys - BASE_INPUT_KEYS - OPTIONAL_INPUT_KEYS:
        missing = sorted(BASE_INPUT_KEYS - keys)
        extra = sorted(keys - BASE_INPUT_KEYS - OPTIONAL_INPUT_KEYS)
        raise SelectionError(
            f"{context}: input keys mismatch; missing={missing}, extra={extra}"
        )
    if record.get("schema") != INPUT_SCHEMA:
        raise SelectionError(f"{context}.schema: expected {INPUT_SCHEMA}")
    if record.get("split") != "train":
        raise SelectionError(f"{context}.split: expected train")
    game_id = _semantic_id(record.get("game_id"), f"{context}.game_id")
    game_sha256 = _digest(record.get("game_sha256"), f"{context}.game_sha256")
    position_id = _semantic_id(record.get("position_id"), f"{context}.position_id")
    sfen = _canonical_text(record.get("sfen"), f"{context}.sfen")
    try:
        computed_position_id = _position_id_from_sfen(sfen)
    except SelectionError as error:
        raise SelectionError(f"{context}.sfen: {error}") from error
    if position_id != computed_position_id:
        raise SelectionError(f"{context}: position_id does not match semantic SFEN")
    fields = sfen.split()
    side = fields[1]
    ply = _integer(record.get("ply"), f"{context}.ply", minimum=0)
    try:
        move_number = int(fields[3])
    except ValueError as error:
        raise SelectionError(f"{context}.sfen: invalid move number") from error
    if move_number - 1 != ply:
        raise SelectionError(f"{context}: ply does not match SFEN")
    recorded_move = _canonical_text(
        record.get("played_move"), f"{context}.played_move"
    )
    _canonical_text(record.get("bestmove"), f"{context}.bestmove")
    cp = _integer(record.get("cp"), f"{context}.cp")
    if _integer(record.get("depth"), f"{context}.depth", minimum=1) != 12:
        raise SelectionError(f"{context}: old CP is not authenticated depth-12")
    outcome_value = record.get("outcome")
    if type(outcome_value) not in (int, float) or outcome_value not in (0, 0.5, 1):
        raise SelectionError(f"{context}.outcome: must be 0, 0.5, or 1")
    outcome = float(outcome_value)
    ratings = record.get("ratings")
    if type(ratings) is not dict or set(ratings) != {"sente", "gote"}:
        raise SelectionError(f"{context}.ratings: expected exact sente/gote object")
    sente_rating = _integer(ratings["sente"], f"{context}.ratings.sente", minimum=0)
    gote_rating = _integer(ratings["gote"], f"{context}.ratings.gote", minimum=0)
    legal_count = _legal_move_count(record, context)
    if require_legal_move_count and legal_count is None:
        raise SelectionError(f"{context}: legal/candidate move count is required")

    phase = _phase_for_ply(ply)
    if position_id in overlap_ids:
        return None, "semantic_overlap"
    if phase is None:
        return None, "outside_phase_window"
    if _is_mate_score(record, cp):
        return None, "mate_score"
    if abs(cp) > 1_000:
        return None, "cp_out_of_range"
    if legal_count is not None and legal_count <= 1:
        return None, "forced_move"

    surprise = _surprise_cp(cp, outcome)
    minimum_rating = min(sente_rating, gote_rating)
    tie_material = {
        "game_id": game_id,
        "minimum_player_rating": minimum_rating,
        "old_depth12_cp": cp,
        "old_outcome": outcome,
        "position_id": position_id,
    }
    tie_sha = _sha256(_canonical_json(tie_material))
    return (
        {
            "schema": OUTPUT_SCHEMA,
            "source_game_id": game_id,
            "game_id": game_id,
            "source_game_sha256": game_sha256,
            "position_id": position_id,
            "sfen": sfen,
            "recorded_move": recorded_move,
            "side_to_move": side,
            "ply": ply,
            "phase": phase,
            "old_depth12_cp": cp,
            "old_outcome": outcome,
            "old_depth12_signals_usage": "selection_only_never_teacher_target",
            "minimum_player_rating": minimum_rating,
            "sente_rating": sente_rating,
            "gote_rating": gote_rating,
            "legal_move_count": legal_count,
            "hardness_cp_outcome_surprise": surprise,
            "hardness_tiebreak_sha256": tie_sha,
        },
        None,
    )


def _hardness_key(candidate: Mapping[str, object]) -> tuple[int, int, str]:
    return (
        -int(candidate["hardness_cp_outcome_surprise"]),
        -int(candidate["minimum_player_rating"]),
        str(candidate["hardness_tiebreak_sha256"]),
    )


def _select_positions(
    candidates: Sequence[dict[str, object]], plan: SelectionPlan
) -> list[dict[str, object]]:
    buckets: dict[tuple[str, str], list[dict[str, object]]] = {
        (phase, side): [] for phase in PHASE_ORDER for side in SIDES
    }
    for candidate in candidates:
        buckets[(str(candidate["phase"]), str(candidate["side_to_move"]))].append(
            candidate
        )
    for values in buckets.values():
        values.sort(key=_hardness_key)

    bucket_order = sorted(
        buckets,
        key=lambda bucket: (
            len(buckets[bucket]) / (plan.phase_quotas[bucket[0]] // 2),
            PHASE_ORDER[bucket[0]],
            bucket[1],
        ),
    )
    selected: list[dict[str, object]] = []
    used_games: set[str] = set()
    for phase, side in bucket_order:
        need = plan.phase_quotas[phase] // 2
        accepted = 0
        for candidate in buckets[(phase, side)]:
            game_id = str(candidate["game_id"])
            if game_id in used_games:
                continue
            selected.append(candidate)
            used_games.add(game_id)
            accepted += 1
            if accepted == need:
                break
        if accepted != need:
            raise SelectionError(
                f"insufficient eligible parents for {phase}/{side}: "
                f"selected {accepted}, require {need}"
            )
    if len(selected) != plan.total or len(used_games) != plan.total:
        raise AssertionError("internal selection/game total mismatch")
    return selected


def _assign_roles(
    selected: Sequence[dict[str, object]], plan: SelectionPlan
) -> list[dict[str, object]]:
    assignment: dict[str, str] = {}
    for side in SIDES:
        side_candidates = sorted(
            (candidate for candidate in selected if candidate["side_to_move"] == side),
            key=lambda candidate: hashlib.sha256(
                (
                    "halfkp81-depth18-role-v2:"
                    + str(candidate["game_id"])
                ).encode("ascii")
            ).hexdigest(),
        )
        cursor = 0
        for role in ("tune", "sealed", "fit"):
            count = plan.role_sizes[role] // 2
            chosen = side_candidates[cursor : cursor + count]
            if len(chosen) != count:
                raise SelectionError(f"insufficient {side} positions for role {role}")
            for candidate in chosen:
                assignment[str(candidate["game_id"])] = role
            cursor += count
        if cursor != len(side_candidates):
            raise AssertionError("internal side-role total mismatch")

    output: list[dict[str, object]] = []
    observed = {
        role: {side: 0 for side in SIDES}
        for role in ROLE_ORDER
    }
    role_games = {role: set() for role in ROLE_ORDER}
    for candidate in selected:
        enriched = dict(candidate)
        role = assignment[str(candidate["game_id"])]
        enriched["role"] = role
        output.append(enriched)
        observed[role][str(candidate["side_to_move"])] += 1
        role_games[role].add(str(candidate["game_id"]))
    expected = {
        role: {side: size // 2 for side in SIDES}
        for role, size in plan.role_sizes.items()
    }
    if observed != expected:
        raise AssertionError("internal role/side quota mismatch")
    if (
        role_games["fit"] & role_games["tune"]
        or role_games["fit"] & role_games["sealed"]
        or role_games["tune"] & role_games["sealed"]
    ):
        raise AssertionError("internal game-role leakage")
    output.sort(
        key=lambda candidate: (
            ROLE_ORDER[str(candidate["role"])],
            PHASE_ORDER[str(candidate["phase"])],
            str(candidate["side_to_move"]),
            _hardness_key(candidate),
        )
    )
    return output


def select_hard_parents(
    records: Iterable[object],
    *,
    overlap_ids: Iterable[str],
    require_legal_move_count: bool,
    plan: SelectionPlan = FORMAL_PLAN,
) -> tuple[list[dict[str, object]], dict[str, int], int]:
    """Validate and select rows; no depth-18 label is read or produced."""

    plan.validate()
    overlaps = set(overlap_ids)
    for semantic_id in overlaps:
        _semantic_id(semantic_id, "overlap ID")
    candidates: list[dict[str, object]] = []
    seen_positions: set[str] = set()
    game_contracts: dict[str, tuple[object, object, object]] = {}
    rejection_counts: dict[str, int] = {}
    rows = 0
    for line_number, record in enumerate(records, start=1):
        rows = line_number
        if type(record) is not dict:
            raise SelectionError(f"input line {line_number}: must be an object")
        position_id = _semantic_id(
            record.get("position_id"), f"input line {line_number}.position_id"
        )
        if position_id in seen_positions:
            raise SelectionError(f"duplicate position_id: {position_id}")
        seen_positions.add(position_id)
        candidate, reason = _candidate_from_record(
            record,
            line_number=line_number,
            overlap_ids=overlaps,
            require_legal_move_count=require_legal_move_count,
        )
        game_id = str(record["game_id"])
        ratings = record["ratings"]
        assert type(ratings) is dict
        game_contract = (
            record["game_sha256"],
            ratings["sente"],
            ratings["gote"],
        )
        existing_contract = game_contracts.setdefault(game_id, game_contract)
        if existing_contract != game_contract:
            raise SelectionError(f"game {game_id} has inconsistent provenance/ratings")
        if candidate is not None:
            candidates.append(candidate)
        else:
            assert reason is not None
            rejection_counts[reason] = rejection_counts.get(reason, 0) + 1
    selected = _select_positions(candidates, plan)
    return _assign_roles(selected, plan), rejection_counts, rows


def _iter_jsonl(raw: bytes, context: str) -> Iterator[object]:
    for line_number, line in enumerate(raw.splitlines(), start=1):
        if not line:
            raise SelectionError(f"{context}: blank line {line_number}")
        yield _strict_json(line, f"{context}: line {line_number}")


def _load_overlap_ids(paths: Sequence[Path]) -> tuple[set[str], dict[str, object]]:
    if len(paths) != 1:
        raise SelectionError("exactly one complete overlap-ID input is required")
    overlap_ids: set[str] = set()
    path = paths[0]
    raw = _read_stable(path)
    rows = 0
    previous: str | None = None
    for line_number, line in enumerate(raw.splitlines(), start=1):
        rows = line_number
        parsed = _strict_json(line, f"{path}: line {line_number}")
        if type(parsed) is not dict or set(parsed) != {"position_id"}:
            raise SelectionError(
                f"{path}: line {line_number} must contain only position_id"
            )
        semantic_id = _semantic_id(
            parsed["position_id"], f"{path}: line {line_number}.position_id"
        )
        if _canonical_json(parsed) != line + b"\n":
            raise SelectionError(f"{path}: line {line_number} is not canonical JSON")
        if previous is not None and semantic_id <= previous:
            raise SelectionError("overlap IDs must be bytewise sorted and unique")
        previous = semantic_id
        overlap_ids.add(semantic_id)
    if not overlap_ids:
        raise SelectionError("complete overlap-ID input must not be empty")
    return overlap_ids, _identity(path, raw, rows=rows)


def _verify_overlap_manifest(
    path: Path,
    raw: bytes,
    *,
    expected_bytes: int,
    expected_sha256: str,
    overlap_identity: Mapping[str, object],
) -> dict[str, object]:
    if len(raw) != expected_bytes or _sha256(raw) != expected_sha256:
        raise SelectionError("overlap manifest expected bytes/SHA-256 mismatch")
    if (
        overlap_identity.get("rows") != OVERLAP_ROWS
        or overlap_identity.get("bytes") != OVERLAP_BYTES
        or overlap_identity.get("sha256") != OVERLAP_SHA256
    ):
        raise SelectionError("overlap inventory differs from preregistered identity")
    value = _strict_json(raw, "overlap manifest")
    if type(value) is not dict or _canonical_json(value) != raw:
        raise SelectionError("overlap manifest must be canonical JSON")
    if set(value) != {
        "schema",
        "status",
        "inputs",
        "derivation",
        "semantic_scope",
        "accounting",
        "output",
        "publication",
        "authority",
    }:
        raise SelectionError("overlap manifest fields differ")
    if (
        value["schema"] != OVERLAP_MANIFEST_SCHEMA
        or value["status"] != OVERLAP_MANIFEST_STATUS
        or value["publication"]
        != "create-only-temp-fsync-hardlink-inventory-then-manifest-last-v1"
        or value["authority"]
        != {
            "teacher_generation_authorized": False,
            "training_authorized": False,
            "formal_match_authorized": False,
            "live_weight_write_authorized": False,
        }
    ):
        raise SelectionError("overlap manifest authority or completion differs")

    inputs = value["inputs"]
    if type(inputs) is not dict or set(inputs) != {
        "direct",
        "formal_openings",
        "derivation_sources",
    }:
        raise SelectionError("overlap manifest input fields differ")
    direct = inputs["direct"]
    expected_direct = {
        "training": {
            "path": (
                "/Users/yudaiyaguchi/.codex/shogi-runs/"
                "direct-teacher-halfkp81-v2-pilot-dataset/training.jsonl"
            ),
            "bytes": 131_814_955,
            "sha256": (
                "2202971ba08cc1bf9be82050be53c6fada79f51f7e7c2a9763d0b57d64d71265"
            ),
            "rows": 200_944,
            "role": "training",
        },
        "validation": {
            "path": (
                "/Users/yudaiyaguchi/.codex/shogi-runs/"
                "direct-teacher-halfkp81-v2-pilot-dataset/validation.jsonl"
            ),
            "bytes": 15_058_654,
            "sha256": (
                "bbac963c100fb42adfdd2d8fc8b885fa551672694471bd878038b564d7e804d1"
            ),
            "rows": 22_890,
            "role": "validation",
        },
    }
    if type(direct) is not dict or set(direct) != set(expected_direct):
        raise SelectionError("overlap direct inputs differ")
    for role, expected in expected_direct.items():
        report = direct[role]
        if (
            type(report) is not dict
            or any(report.get(key) != expected_value for key, expected_value in expected.items())
            or report.get("held_descriptor") is not True
            or report.get("stable_second_digest") is not True
            or report.get("row_schema")
            != "shogi-direct-teacher-halfkp81-v2-position-v1"
            or report.get("parent_id_observations") != expected["rows"]
            or report.get("child_id_observations") != expected["rows"]
            or report.get("position_id_format_validated") is not True
            or report.get("child_position_id_matches_sfen") is not True
            or report.get("canonical_jsonl") is not True
        ):
            raise SelectionError(f"overlap {role} closure is incomplete")

    formal = inputs["formal_openings"]
    formal_expected = {
        "v2": {
            "relative": "ml/protocols/direct-teacher-halfkp81-v2-screen-openings.json",
            "bytes": 6_208,
            "sha256": "cc521ace5dfaf39c3c97238a1877456ca55e9b42630c4d4413184a9da5f25744",
            "schema": "shogi-direct-teacher-halfkp81-v2-screen-openings-v1",
            "status": "prospective-frozen-before-training-or-paired-play",
            "prior_count": 3_198,
            "prior_sha256": "0dde79f19d21dbf671de9525dc87bd4e9c8a617e1a06e3a61f704f1dcbaed291",
        },
        "v4": {
            "relative": "ml/protocols/direct-teacher-halfkp81-v4-fresh-opening-manifest.json",
            "bytes": 228_133,
            "sha256": "8ec8422303f9504306a20ea41aa1755ba8d4a336b6118bfb958d91cda2ed64b9",
            "schema": "shogi-direct-teacher-halfkp81-v4-fresh-opening-manifest-v1",
            "status": "frozen-after-v4-static-pass-before-paired-game-1",
            "prior_count": 3_302,
            "prior_sha256": "0349fb8a37a3711958457e7ae0f283bb9dad18103f3c47492794c8238dd564d7",
        },
    }
    if type(formal) is not dict or set(formal) != set(formal_expected):
        raise SelectionError("overlap formal-opening inputs differ")
    repo_root = Path(__file__).resolve().parent.parent
    for label, expected in formal_expected.items():
        report = formal[label]
        if (
            type(report) is not dict
            or report.get("path") != str((repo_root / str(expected["relative"])).resolve())
            or any(
                report.get(key) != expected[key]
                for key in ("bytes", "sha256", "schema", "status")
            )
            or report.get("held_descriptor") is not True
            or report.get("stable_second_digest") is not True
            or report.get("selected_openings") != 28
            or report.get("fingerprint_only_prior_inventory_count")
            != expected["prior_count"]
            or report.get(
                "fingerprint_only_prior_inventory_canonical_list_sha256"
            )
            != expected["prior_sha256"]
        ):
            raise SelectionError(f"overlap {label} formal-opening closure differs")

    derivation_sources = inputs["derivation_sources"]
    if type(derivation_sources) is not list or len(derivation_sources) != 8:
        raise SelectionError("overlap derivation-source closure differs")
    for entry in derivation_sources:
        if type(entry) is not dict or set(entry) != {
            "path",
            "bytes",
            "sha256",
            "relative_path",
            "held_descriptor",
            "stable_second_digest",
        }:
            raise SelectionError("overlap derivation-source identity fields differ")
        source_path = Path(str(entry["path"]))
        if (
            source_path
            != (repo_root / str(entry["relative_path"])).resolve()
            or entry["held_descriptor"] is not True
            or entry["stable_second_digest"] is not True
        ):
            raise SelectionError("overlap derivation source binding differs")
        source_raw = _read_stable_bytes(source_path)
        if (
            len(source_raw) != entry["bytes"]
            or _sha256(source_raw) != entry["sha256"]
        ):
            raise SelectionError("overlap derivation source identity drift")

    derivation = value["derivation"]
    if (
        type(derivation) is not dict
        or derivation.get("selected_openings") != 56
        or derivation.get("prefix_positions_per_opening") != 7
        or derivation.get("prefix_position_observations") != 392
        or derivation.get("all_selected_fingerprints_derived") is not True
        or derivation.get("non_derivable_selected_fingerprints") != []
        or derivation.get("coverage")
        != "hirate-and-each-of-six-post-move-positions"
    ):
        raise SelectionError("overlap opening derivation is incomplete")
    runtime = derivation.get("runtime")
    expected_runtime_files = {
        "node": {
            "path": "/Users/yudaiyaguchi/.nvm/versions/node/v20.14.0/bin/node",
            "bytes": 94_127_856,
            "sha256": "6a1652accbb8aa20886987ecff2ad0dbaa01ceb3ce04a33a1ed21b5f6e4b3713",
        },
        "tsx": {
            "path": str((repo_root / "node_modules/tsx/dist/cli.mjs").resolve()),
            "bytes": 120_402,
            "sha256": "5d5b2a9f9cf4d6a8b44326b676417e00b42ad04037ed173b7af82ea8146a4fc0",
        },
    }
    if (
        type(runtime) is not dict
        or runtime.get("node") != expected_runtime_files["node"]
        or runtime.get("tsx") != expected_runtime_files["tsx"]
        or runtime.get("inline_deriver_sha256")
        != "ec1be5c54e25dfaccb6b04238672f9a08c210b4e0dbfdfd7bc08093c7eea0d79"
        or runtime.get("tsx_version") != "tsx v4.22.4\nnode v20.14.0"
    ):
        raise SelectionError("overlap derivation runtime identity differs")
    scope = value["semantic_scope"]
    if (
        type(scope) is not dict
        or scope.get("direct_parent_and_child_ids") is not True
        or scope.get("formal_selected_opening_hirate_and_six_prefixes") is not True
        or scope.get("selected_formal_openings") != 56
        or scope.get("selected_formal_prefix_position_observations") != 392
        or scope.get("selected_formal_non_derivable_fingerprints") != 0
        or scope.get("fingerprint_only_prior_inventories_are_not_semantic_ids")
        is not True
    ):
        raise SelectionError("overlap semantic scope differs")
    accounting = value["accounting"]
    if (
        type(accounting) is not dict
        or accounting
        != {
            "training_unique_semantic_ids": 218_239,
            "validation_unique_semantic_ids": 24_859,
            "formal_opening_unique_semantic_ids": 270,
            "union_unique_semantic_ids": OVERLAP_ROWS,
            "cross_source_overlaps": {
                "training_and_validation": 0,
                "direct_and_formal_openings": 0,
                "all_three_sources": 0,
            },
        }
    ):
        raise SelectionError("overlap accounting does not bind inventory")
    output = value["output"]
    if (
        type(output) is not dict
        or output
        != {
            **dict(overlap_identity),
            "row_schema": {"position_id": "sha256:<lowercase-64-hex>"},
            "canonical_jsonl": True,
            "sorted_bytewise_unique": True,
        }
    ):
        raise SelectionError("overlap manifest output does not bind inventory")
    return _identity(path, raw)


def _verify_legal_manifest(
    path: Path,
    raw: bytes,
    *,
    expected_bytes: int,
    expected_sha256: str,
    input_identity: Mapping[str, object],
) -> dict[str, object]:
    if len(raw) != expected_bytes or _sha256(raw) != expected_sha256:
        raise SelectionError("legal-count manifest expected bytes/SHA-256 mismatch")
    value = _strict_json(raw, "legal-count manifest")
    if type(value) is not dict or _canonical_json(value) != raw:
        raise SelectionError("legal-count manifest must be canonical JSON")
    if set(value) != {
        "schema",
        "status",
        "tool",
        "rules_closure",
        "input",
        "output",
        "accounting",
        "validation",
        "publication",
    }:
        raise SelectionError("legal-count manifest fields differ")
    if value["schema"] != LEGAL_MANIFEST_SCHEMA:
        raise SelectionError("legal-count manifest schema mismatch")
    if value["status"] != LEGAL_MANIFEST_STATUS:
        raise SelectionError("legal-count manifest status differs")
    closure = value["rules_closure"]
    expected_relative_paths = list(LEGAL_RULES_CLOSURE_EXPECTATIONS)
    if type(closure) is not list or len(closure) != len(expected_relative_paths):
        raise SelectionError("legal-count rules closure differs")
    repo_root = Path(__file__).resolve().parent.parent
    authenticated_closure: list[dict[str, object]] = []
    for index, relative_path in enumerate(expected_relative_paths):
        entry = closure[index]
        expected = LEGAL_RULES_CLOSURE_EXPECTATIONS[relative_path]
        source_path = (repo_root / relative_path).resolve()
        if (
            type(entry) is not dict
            or set(entry)
            != {
                "path",
                "relative_path",
                "bytes",
                "sha256",
                "held_read_only_descriptor",
                "stable_double_read",
            }
            or entry.get("path") != str(source_path)
            or entry.get("relative_path") != relative_path
            or entry.get("bytes") != expected["bytes"]
            or entry.get("sha256") != expected["sha256"]
            or entry.get("held_read_only_descriptor") is not True
            or entry.get("stable_double_read") is not True
        ):
            raise SelectionError("legal-count rules closure identity differs")
        source_raw = _read_stable_bytes(source_path)
        if (
            len(source_raw) != expected["bytes"]
            or _sha256(source_raw) != expected["sha256"]
        ):
            raise SelectionError("legal-count rules closure source drift")
        authenticated_closure.append(dict(entry))
    if (
        value["tool"] != authenticated_closure[0]
        or value["tool"].get("relative_path") != LEGAL_TOOL_RELATIVE_PATH
    ):
        raise SelectionError("legal-count execution tool identity differs")
    source = value["input"]
    output = value["output"]
    if type(source) is not dict or set(source) != {
        "path",
        "bytes",
        "sha256",
        "rows",
        "row_schema",
        "held_read_only_descriptor",
        "stable_double_read",
    }:
        raise SelectionError("legal-count manifest source fields differ")
    if type(output) is not dict or set(output) != {
        "file",
        "bytes",
        "sha256",
        "rows",
        "row_schema",
        "added_field",
        "input_order_preserved",
    }:
        raise SelectionError("legal-count manifest output fields differ")
    if (
        source.get("path") != SOURCE_PATH
        or source.get("bytes") != SOURCE_BYTES
        or source.get("sha256") != SOURCE_SHA256
        or source.get("rows") != SOURCE_ROWS
        or source.get("row_schema") != INPUT_SCHEMA
        or source.get("held_read_only_descriptor") is not True
        or source.get("stable_double_read") is not True
    ):
        raise SelectionError("legal-count manifest does not bind the exact 800k source")
    if (
        output.get("file") != Path(str(input_identity["path"])).name
        or output.get("bytes") != input_identity["bytes"]
        or output.get("sha256") != input_identity["sha256"]
        or output.get("rows") != input_identity["rows"]
        or output.get("row_schema") != INPUT_SCHEMA
        or output.get("added_field") != "legal_move_count"
        or output.get("input_order_preserved") is not True
    ):
        raise SelectionError("legal-count manifest output does not bind selector input")
    accounting = value["accounting"]
    if type(accounting) is not dict or set(accounting) != {
        "side_to_move_b",
        "side_to_move_w",
        "legal_move_count_at_most_one",
        "legal_move_count_zero",
        "legal_move_count_one",
    }:
        raise SelectionError("legal-count manifest accounting fields differ")
    if any(type(count) is not int or count < 0 for count in accounting.values()):
        raise SelectionError("legal-count manifest accounting is invalid")
    if (
        accounting["side_to_move_b"] + accounting["side_to_move_w"] != SOURCE_ROWS
        or accounting["legal_move_count_at_most_one"]
        != accounting["legal_move_count_zero"] + accounting["legal_move_count_one"]
        or accounting["legal_move_count_at_most_one"] > SOURCE_ROWS
    ):
        raise SelectionError("legal-count manifest accounting does not reconcile")
    validation = value["validation"]
    if (
        type(validation) is not dict
        or set(validation)
        != {
            "canonical_jsonl",
            "canonical_sfen_roundtrip",
            "ply_matches_move_number_minus_one",
            "position_id_matches_semantic_sfen",
            "recorded_moves_legal",
            "duplicate_position_ids",
            "rules_authority",
            "source_jsonl_contract",
        }
        or validation
        != {
            "canonical_jsonl": True,
            "canonical_sfen_roundtrip": True,
            "ply_matches_move_number_minus_one": True,
            "position_id_matches_semantic_sfen": True,
            "recorded_moves_legal": True,
            "duplicate_position_ids": 0,
            "rules_authority": "ml/shogi-sfen.ts#rulesCompleteLegalMoves",
            "source_jsonl_contract": "fixed-schema-compact-canonical-v1",
        }
    ):
        raise SelectionError("legal-count manifest validation is incomplete")
    if value["publication"] != "create-only-temp-fsync-hardlink-manifest-last-v1":
        raise SelectionError("legal-count manifest publication differs")
    return _identity(path, raw)


def _create_only_destination(path: Path, label: str) -> Path:
    absolute = Path(os.path.abspath(os.fspath(path)))
    if not absolute.parent.is_dir():
        raise SelectionError(f"{label}: parent directory does not exist")
    if os.path.lexists(absolute):
        raise SelectionError(f"{label}: destination already exists or is a symlink")
    return absolute


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _verify_published_file(
    published: PublishedFile, expected_raw: bytes, label: str
) -> None:
    try:
        before = os.stat(published.path, follow_symlinks=False)
    except OSError as error:
        raise SelectionError(f"{label}: cannot stat published file: {error}") from error
    expected_inode = (published.device, published.inode)
    if (
        not stat.S_ISREG(before.st_mode)
        or (before.st_dev, before.st_ino) != expected_inode
    ):
        raise SelectionError(f"{label}: published destination identity changed")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(published.path, flags)
        with os.fdopen(descriptor, "rb") as source:
            opened = os.fstat(source.fileno())
            observed_raw = source.read()
    except OSError as error:
        raise SelectionError(f"{label}: cannot verify published file: {error}") from error
    try:
        after = os.stat(published.path, follow_symlinks=False)
    except OSError as error:
        raise SelectionError(
            f"{label}: published file disappeared during verification: {error}"
        ) from error
    if (
        not stat.S_ISREG(opened.st_mode)
        or (opened.st_dev, opened.st_ino) != expected_inode
        or (after.st_dev, after.st_ino) != expected_inode
        or len(observed_raw) != published.bytes
        or _sha256(observed_raw) != published.sha256
        or observed_raw != expected_raw
    ):
        raise SelectionError(f"{label}: published file identity/content mismatch")


def _rollback_published_file(published: PublishedFile, label: str) -> None:
    try:
        observed = os.stat(published.path, follow_symlinks=False)
    except FileNotFoundError:
        return
    except OSError as error:
        raise SelectionError(f"{label}: cannot inspect rollback target: {error}") from error
    if (
        not stat.S_ISREG(observed.st_mode)
        or (observed.st_dev, observed.st_ino)
        != (published.device, published.inode)
    ):
        raise SelectionError(f"{label}: refusing to roll back a replaced destination")
    try:
        os.unlink(published.path)
        _fsync_directory(published.path.parent)
    except OSError as error:
        raise SelectionError(f"{label}: rollback failed: {error}") from error


def _publish_create_only(path: Path, raw: bytes, label: str) -> PublishedFile:
    absolute = _create_only_destination(path, label)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{absolute.name}.", suffix=".tmp", dir=absolute.parent
    )
    temporary = Path(temporary_name)
    published: PublishedFile | None = None
    try:
        with os.fdopen(descriptor, "wb") as target:
            target.write(raw)
            target.flush()
            os.fsync(target.fileno())
            temporary_stat = os.fstat(target.fileno())
            try:
                os.link(temporary, absolute, follow_symlinks=False)
            except FileExistsError as error:
                raise SelectionError(
                    f"{label}: destination appeared during create-only publication"
                ) from error
            except OSError as error:
                raise SelectionError(
                    f"{label}: create-only hardlink failed: {error}"
                ) from error
            published = PublishedFile(
                path=absolute,
                device=temporary_stat.st_dev,
                inode=temporary_stat.st_ino,
                bytes=len(raw),
                sha256=_sha256(raw),
            )
        assert published is not None
        linked_stat = os.stat(absolute, follow_symlinks=False)
        if (
            not stat.S_ISREG(linked_stat.st_mode)
            or (linked_stat.st_dev, linked_stat.st_ino)
            != (published.device, published.inode)
        ):
            raise SelectionError(f"{label}: hardlink identity mismatch")
        temporary.unlink()
        _fsync_directory(absolute.parent)
        _verify_published_file(published, raw, label)
        return published
    except BaseException as error:
        if published is not None:
            try:
                _rollback_published_file(published, label)
            except SelectionError as rollback_error:
                raise SelectionError(
                    f"{label}: publication failed and rollback was unsafe: "
                    f"{rollback_error}"
                ) from error
        raise
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def _publish_output_then_manifest(
    output_path: Path,
    output_raw: bytes,
    manifest_path: Path,
    manifest_raw: bytes,
) -> tuple[PublishedFile, PublishedFile]:
    output_absolute = _create_only_destination(output_path, "output JSONL")
    manifest_absolute = _create_only_destination(manifest_path, "output manifest")
    if output_absolute == manifest_absolute:
        raise SelectionError("output JSONL and manifest paths must differ")
    output = _publish_create_only(output_absolute, output_raw, "output JSONL")
    try:
        manifest = _publish_create_only(
            manifest_absolute, manifest_raw, "output manifest"
        )
    except BaseException as error:
        try:
            _rollback_published_file(output, "output JSONL")
        except SelectionError as rollback_error:
            raise SelectionError(
                "manifest publication failed and output rollback was unsafe: "
                f"{rollback_error}"
            ) from error
        raise
    return output, manifest


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--input-bytes", type=int, required=True)
    parser.add_argument("--input-sha256", required=True)
    parser.add_argument("--input-rows", type=int, required=True)
    parser.add_argument("--legal-count-manifest", type=Path, required=True)
    parser.add_argument("--legal-count-manifest-bytes", type=int, required=True)
    parser.add_argument("--legal-count-manifest-sha256", required=True)
    parser.add_argument(
        "--exclude-ids",
        type=Path,
        action="append",
        required=True,
        help="the one complete, sorted semantic-overlap JSONL inventory",
    )
    parser.add_argument("--overlap-manifest", type=Path, required=True)
    parser.add_argument("--overlap-manifest-bytes", type=int, required=True)
    parser.add_argument("--overlap-manifest-sha256", required=True)
    parser.add_argument("--output-jsonl", type=Path, required=True)
    parser.add_argument("--output-manifest", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = _arguments()
    _digest(args.input_sha256, "--input-sha256")
    _digest(args.legal_count_manifest_sha256, "--legal-count-manifest-sha256")
    _digest(args.overlap_manifest_sha256, "--overlap-manifest-sha256")
    if args.input_rows != SOURCE_ROWS:
        raise SelectionError(f"--input-rows must be exactly {SOURCE_ROWS}")
    if (
        args.input_bytes <= 0
        or args.legal_count_manifest_bytes <= 0
        or args.overlap_manifest_bytes <= 0
    ):
        raise SelectionError("expected byte lengths must be positive")
    output_path = _create_only_destination(args.output_jsonl, "output JSONL")
    manifest_path = _create_only_destination(args.output_manifest, "output manifest")
    if output_path == manifest_path:
        raise SelectionError("output JSONL and manifest paths must differ")

    input_raw = _read_stable(args.input)
    input_identity = _identity(args.input, input_raw, rows=args.input_rows)
    if (
        len(input_raw) != args.input_bytes
        or input_identity["sha256"] != args.input_sha256
    ):
        raise SelectionError("selector input expected bytes/SHA-256 mismatch")
    legal_raw = _read_stable(args.legal_count_manifest)
    legal_identity = _verify_legal_manifest(
        args.legal_count_manifest,
        legal_raw,
        expected_bytes=args.legal_count_manifest_bytes,
        expected_sha256=args.legal_count_manifest_sha256,
        input_identity=input_identity,
    )
    overlap_ids, overlap_identity = _load_overlap_ids(args.exclude_ids)
    overlap_manifest_raw = _read_stable(args.overlap_manifest)
    overlap_manifest_identity = _verify_overlap_manifest(
        args.overlap_manifest,
        overlap_manifest_raw,
        expected_bytes=args.overlap_manifest_bytes,
        expected_sha256=args.overlap_manifest_sha256,
        overlap_identity=overlap_identity,
    )
    selected, rejection_counts, observed_rows = select_hard_parents(
        _iter_jsonl(input_raw, str(args.input)),
        overlap_ids=overlap_ids,
        require_legal_move_count=True,
    )
    if observed_rows != args.input_rows:
        raise SelectionError(
            f"input row count {observed_rows} differs from expected {args.input_rows}"
        )
    output_raw = b"".join(_canonical_json(record) for record in selected)
    side_phase = {
        phase: {side: quota // 2 for side in SIDES}
        for phase, quota in FORMAL_PLAN.phase_quotas.items()
    }
    role_side = {
        role: {side: size // 2 for side in SIDES}
        for role, size in FORMAL_PLAN.role_sizes.items()
    }
    actual_phase_side = {
        phase: {
            side: sum(
                1
                for record in selected
                if record["phase"] == phase and record["side_to_move"] == side
            )
            for side in SIDES
        }
        for phase in PHASE_ORDER
    }
    actual_role_side = {
        role: {
            side: sum(
                1
                for record in selected
                if record["role"] == role and record["side_to_move"] == side
            )
            for side in SIDES
        }
        for role in ROLE_ORDER
    }
    role_sets = {
        role: {
            "game_ids": _set_digest(
                f"halfkp81-depth18-selection-v2-{role}-game-ids",
                (
                    str(record["game_id"])
                    for record in selected
                    if record["role"] == role
                ),
            ),
            "position_ids": _set_digest(
                f"halfkp81-depth18-selection-v2-{role}-position-ids",
                (
                    str(record["position_id"])
                    for record in selected
                    if record["role"] == role
                ),
            ),
        }
        for role in ROLE_ORDER
    }
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "status": "selection-only-depth18-labeling-not-yet-run",
        "exact_large_scratch_source": {
            "bytes": SOURCE_BYTES,
            "rows": SOURCE_ROWS,
            "sha256": SOURCE_SHA256,
            "row_schema": INPUT_SCHEMA,
        },
        "legal_count_enriched_input": input_identity,
        "legal_count_manifest": legal_identity,
        "complete_overlap_input": overlap_identity,
        "complete_overlap_manifest": overlap_manifest_identity,
        "complete_overlap_id_count": len(overlap_ids),
        "output": {
            "path": os.path.realpath(output_path),
            "bytes": len(output_raw),
            "sha256": _sha256(output_raw),
            "rows": len(selected),
        },
        "selection": {
            "hardness_order": [
                "cp_outcome_surprise_desc",
                "minimum_sente_gote_rating_desc",
                "sha256_asc",
            ],
            "old_depth12_cp_outcome_usage": "selection_only_never_teacher_target",
            "phase_side_quotas": side_phase,
            "role_side_sizes": role_side,
            "game_id_split_before_depth18_labels": True,
            "one_position_per_game_id": True,
            "source_game_id_equals_game_id": True,
            "endgame_excluded_for_source_parity_defect": True,
            "abs_old_depth12_cp_max": 1_000,
            "mate_scores_excluded": True,
            "legal_move_count_required_and_at_least": 2,
        },
        "accounting": {
            "phase_side_counts": actual_phase_side,
            "role_side_counts": actual_role_side,
            "unique_game_ids": len({record["game_id"] for record in selected}),
            "unique_position_ids": len(
                {record["position_id"] for record in selected}
            ),
            "cross_role_game_id_overlap": 0,
            "role_sets": role_sets,
        },
        "rejection_counts": dict(sorted(rejection_counts.items())),
    }
    manifest_raw = _canonical_json(manifest)
    _publish_output_then_manifest(
        output_path,
        output_raw,
        manifest_path,
        manifest_raw,
    )
    print(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
