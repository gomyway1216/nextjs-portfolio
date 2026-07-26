#!/usr/bin/env python3
"""Explicit, collision-free parent/move policy residual over the live NNUE.

This module is deliberately research-only.  The deployed 1,185,988-byte board
NNUE remains a frozen value anchor.  A small explicit (non-hashed) head predicts
only a root move-ordering residual:

    parent_score(move) = -live_nnue(child) + residual(parent, move)

The head is not a path-dependent leaf evaluator and must never be placed in the
transposition-table value path.  Its only possible downstream use is root move
ordering after a later static, quantized, node-count, speed, and direct-play
gate.
"""

from __future__ import annotations

import array
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import random
import sys
from typing import Iterable, Mapping, Sequence

import torch
import torch.nn as nn
import torch.nn.functional as F

import move_order_head as legacy_move
import train
from int16_forward import OUT_SCALE, int16_forward_batch


SCHEMA = "shogi-listwise-policy-value-v1"
FEATURE_VERSION = "explicit-parent-piece-square-move-v1"
RESULT_SCHEMA = "shogi-listwise-policy-value-result-v1"
PROTOCOL_SCHEMA = "shogi-listwise-policy-value-plan-v1"

LIVE_NNUE_BYTES = 1_185_988
LIVE_NNUE_SHA256 = (
    "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc"
)
LIVE_NNUE_SCALE_K = 600.0
ALL_LEGAL_SOURCE = "all-legal-fixed-depth-teacher"

PARENT_DIM = 12
FROM_TO_DIM = 8
PIECE_DIM = 8
CAPTURE_DIM = 6
SMALL_DIM = 4
NEIGHBOR_DIM = 3
MOVE_INPUT_DIM = (
    PARENT_DIM
    + FROM_TO_DIM * 2
    + PIECE_DIM
    + CAPTURE_DIM
    + SMALL_DIM * 6
    + NEIGHBOR_DIM * 2
    + 1
)
HIDDEN_DIM = 32
MAX_HEAD_BYTES = 128 * 1024
RESIDUAL_LIMIT_CP = 1200.0

RANKS = "abcdefghi"
NEIGHBORS = legacy_move.NEIGHBORS


@dataclass(frozen=True)
class MoveFeatures:
    from_square: int
    to_square: int
    moved_piece: int
    captured_piece: int
    action: int
    delta_file: int
    delta_rank: int
    self_king_relation: int
    enemy_king_relation: int
    neighborhood: tuple[int, ...]
    ply_bucket: int


@dataclass(frozen=True)
class MoveExample:
    move: str
    teacher_cp: float
    teacher_rank: int
    child_position_id: str
    child_sfen: str
    features: MoveFeatures
    base_parent_cp: float


@dataclass(frozen=True)
class ParentGroup:
    parent_id: str
    game_id: str
    position_id: str
    parent_sfen: str
    parent_board: tuple[int, ...]
    parent_hands: tuple[float, ...]
    semantic_position_ids: frozenset[str]
    examples: tuple[MoveExample, ...]
    source_role: str


def file_fingerprint(path: str | Path) -> dict[str, object]:
    source = Path(path)
    digest = hashlib.sha256()
    byte_count = 0
    with source.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
            byte_count += len(block)
    return {
        "path": str(source.resolve()),
        "bytes": byte_count,
        "sha256": digest.hexdigest(),
    }


def _square_coords(index: int) -> tuple[int, int]:
    if not 0 <= index < 81:
        raise ValueError("normalized square is outside the board")
    return index // 9 + 1, index % 9 + 1


def _normalize_square(file_number: int, rank_number: int, side: str) -> int:
    if side == "w":
        file_number = 10 - file_number
        rank_number = 10 - rank_number
    return (file_number - 1) * 9 + (rank_number - 1)


def _parse_usi_square(value: str) -> tuple[int, int]:
    if len(value) != 2 or value[0] not in "123456789" or value[1] not in RANKS:
        raise ValueError(f"invalid USI square {value!r}")
    return int(value[0]), RANKS.index(value[1]) + 1


def _clip_relation(delta: int) -> int:
    return max(-8, min(8, delta)) + 8


def _occupant_code(board: Mapping[int, int], file_number: int, rank_number: int) -> int:
    if not (1 <= file_number <= 9 and 1 <= rank_number <= 9):
        return 29
    piece = int(board.get((file_number - 1) * 9 + (rank_number - 1), 0))
    if piece > 0:
        return piece
    if piece < 0:
        return 14 + (-piece)
    return 0


def encode_explicit_move(parent_sfen: str, move: str) -> MoveFeatures:
    """Encode bounded categorical features without hashing or collisions."""

    parsed = legacy_move.parse_parent_sfen(parent_sfen)
    side = str(parsed["side"])
    raw_board = parsed["raw_board"]
    board = parsed["board"]
    if not isinstance(raw_board, dict) or not isinstance(board, dict):
        raise ValueError("invalid parsed parent board")
    self_king = int(parsed["self_king"])
    enemy_king = int(parsed["enemy_king"])

    is_drop = "*" in move
    promote = move.endswith("+")
    if is_drop:
        if len(move) != 4 or move[1] != "*" or promote:
            raise ValueError(f"invalid USI drop {move!r}")
        moved_piece = legacy_move.DROP_TYPES.get(move[0].upper())
        if moved_piece is None:
            raise ValueError(f"invalid USI drop piece {move!r}")
        from_square = 81
        to_raw = _parse_usi_square(move[2:4])
    else:
        core = move[:-1] if promote else move
        if len(core) != 4:
            raise ValueError(f"invalid USI move {move!r}")
        from_raw = _parse_usi_square(core[:2])
        to_raw = _parse_usi_square(core[2:4])
        source = raw_board.get(from_raw)
        if source is None:
            raise ValueError(f"USI source is empty {move!r}")
        moved_piece, owner_is_sente = source
        if bool(owner_is_sente) != (side == "b"):
            raise ValueError(f"USI source is not owned by side to move {move!r}")
        from_square = _normalize_square(*from_raw, side)

    to_square = _normalize_square(*to_raw, side)
    destination = raw_board.get(to_raw)
    if is_drop and destination is not None:
        raise ValueError(f"USI drop destination is occupied {move!r}")
    if (
        not is_drop
        and destination is not None
        and bool(destination[1]) == (side == "b")
    ):
        raise ValueError(f"USI destination contains own piece {move!r}")
    captured_piece = 0 if destination is None else int(destination[0])

    to_file, to_rank = _square_coords(to_square)
    if is_drop:
        from_file = from_rank = 0
        dx = dy = 0
    else:
        from_file, from_rank = _square_coords(from_square)
        dx = to_file - from_file
        dy = to_rank - from_rank

    self_file, self_rank = _square_coords(self_king)
    enemy_file, enemy_rank = _square_coords(enemy_king)
    self_relation = (
        _clip_relation(to_file - self_file) * 17
        + _clip_relation(to_rank - self_rank)
    )
    enemy_relation = (
        _clip_relation(to_file - enemy_file) * 17
        + _clip_relation(to_rank - enemy_rank)
    )
    neighborhood: list[int] = []
    for delta_file, delta_rank in NEIGHBORS:
        neighborhood.append(
            _occupant_code(board, to_file + delta_file, to_rank + delta_rank)
        )
    for delta_file, delta_rank in NEIGHBORS:
        neighborhood.append(
            29
            if is_drop
            else _occupant_code(
                board, from_file + delta_file, from_rank + delta_rank
            )
        )

    action = int(is_drop) | (int(promote) << 1) | (int(captured_piece != 0) << 2)
    parent_ply = int(parent_sfen.split()[3]) - 1
    return MoveFeatures(
        from_square=from_square,
        to_square=to_square,
        moved_piece=int(moved_piece),
        captured_piece=captured_piece,
        action=action,
        delta_file=_clip_relation(dx),
        delta_rank=_clip_relation(dy),
        self_king_relation=self_relation,
        enemy_king_relation=enemy_relation,
        neighborhood=tuple(neighborhood),
        ply_bucket=min(15, max(0, parent_ply // 16)),
    )


def child_sfen_after_usi(parent_sfen: str, move: str) -> str:
    """Apply one USI transition and return its canonical child SFEN.

    This deliberately binds a sibling row's declared child to its parent and
    move instead of trusting three independently self-consistent strings.  The
    existing strict row validator still checks SFEN and identifier syntax.
    """

    parent_sfen = train._normalized_sfen(parent_sfen, "parent_sfen")
    board_text, side, hand_text, move_number_text = parent_sfen.split()
    board: dict[tuple[int, int], str] = {}
    for rank_number, row in enumerate(board_text.split("/"), start=1):
        file_number = 9
        offset = 0
        while offset < len(row):
            token = row[offset]
            if token.isdigit():
                file_number -= int(token)
                offset += 1
                continue
            if token == "+":
                offset += 1
                token += row[offset]
            board[(file_number, rank_number)] = token
            file_number -= 1
            offset += 1

    hands: dict[str, int] = {}
    if hand_text != "-":
        count_text = ""
        for token in hand_text:
            if token.isdigit():
                count_text += token
                continue
            hands[token] = int(count_text) if count_text else 1
            count_text = ""

    is_black = side == "b"
    is_drop = "*" in move
    promote = move.endswith("+")
    if is_drop:
        if len(move) != 4 or move[1] != "*" or promote:
            raise ValueError(f"invalid USI drop {move!r}")
        piece = move[0] if is_black else move[0].lower()
        if piece.upper() not in "PLNSGBR":
            raise ValueError(f"invalid USI drop piece {move!r}")
        destination = _parse_usi_square(move[2:4])
        if destination in board:
            raise ValueError(f"USI drop destination is occupied {move!r}")
        if hands.get(piece, 0) <= 0:
            raise ValueError(f"USI drop piece is absent from hand {move!r}")
        hands[piece] -= 1
        if hands[piece] == 0:
            del hands[piece]
        board[destination] = piece
    else:
        core = move[:-1] if promote else move
        if len(core) != 4:
            raise ValueError(f"invalid USI move {move!r}")
        source = _parse_usi_square(core[:2])
        destination = _parse_usi_square(core[2:4])
        piece = board.get(source)
        if piece is None:
            raise ValueError(f"USI source is empty {move!r}")
        piece_letter = piece[-1]
        if piece_letter.isupper() != is_black:
            raise ValueError(f"USI source is not owned by side to move {move!r}")
        captured = board.get(destination)
        if captured is not None:
            captured_letter = captured[-1]
            if captured_letter.isupper() == is_black:
                raise ValueError(f"USI destination contains own piece {move!r}")
            captured_base = captured_letter.upper()
            if captured_base == "K":
                raise ValueError(f"USI move captures a king {move!r}")
            hand_piece = captured_base if is_black else captured_base.lower()
            hands[hand_piece] = hands.get(hand_piece, 0) + 1
        del board[source]
        if promote:
            if piece.startswith("+") or piece_letter.upper() not in "PLNSBR":
                raise ValueError(f"invalid USI promotion {move!r}")
            piece = "+" + piece_letter
        board[destination] = piece

    rows: list[str] = []
    for rank_number in range(1, 10):
        row_parts: list[str] = []
        empty = 0
        for file_number in range(9, 0, -1):
            piece = board.get((file_number, rank_number))
            if piece is None:
                empty += 1
                continue
            if empty:
                row_parts.append(str(empty))
                empty = 0
            row_parts.append(piece)
        if empty:
            row_parts.append(str(empty))
        rows.append("".join(row_parts))
    hand = "".join(
        (str(hands[piece]) if hands.get(piece, 0) > 1 else "") + piece
        for piece in "RBGSNLPrbgsnlp"
        if hands.get(piece, 0) > 0
    )
    child = (
        f"{'/'.join(rows)} {'w' if is_black else 'b'} "
        f"{hand or '-'} {int(move_number_text) + 1}"
    )
    return train._normalized_sfen(child, "derived_child_sfen")


def validate_child_transition(
    parent_sfen: str,
    move: str,
    child_sfen: str,
) -> None:
    """Reject a row whose child is not the exact parent-plus-move transition."""

    derived = child_sfen_after_usi(parent_sfen, move)
    if derived != child_sfen:
        raise ValueError(
            f"move/child transition mismatch for {move!r}: "
            f"expected {derived!r}, got {child_sfen!r}"
        )


def read_live_board_qweights(
    path: str | Path,
    *,
    expected_sha256: str = LIVE_NNUE_SHA256,
) -> dict[str, torch.Tensor]:
    """Read the exact headerless production board-NNUE layout."""

    raw = Path(path).read_bytes()
    actual_sha256 = hashlib.sha256(raw).hexdigest()
    if len(raw) != LIVE_NNUE_BYTES or actual_sha256 != expected_sha256:
        raise ValueError(
            "live NNUE identity mismatch: "
            f"bytes={len(raw)} sha256={actual_sha256}"
        )
    offset = 0

    def take(typecode: str, count: int, shape: tuple[int, ...]) -> torch.Tensor:
        nonlocal offset
        itemsize = 2 if typecode == "h" else 4
        end = offset + count * itemsize
        values = array.array(typecode)
        values.frombytes(raw[offset:end])
        if values.itemsize != itemsize:
            raise ValueError("host integer layout cannot read NNUE weights")
        if sys.byteorder == "big":
            values.byteswap()
        offset = end
        dtype = torch.int16 if typecode == "h" else torch.int32
        return torch.tensor(values, dtype=dtype).reshape(shape)

    qweights = {
        "w1_board": take("h", 2268 * 256, (2268, 256)),
        "w1_hand": take("h", 14 * 256, (14, 256)),
        "b1": take("i", 256, (256,)),
        "w2": take("h", 32 * 256, (32, 256)),
        "b2": take("i", 32, (32,)),
        "w3": take("h", 32, (32,)),
        "b3": take("i", 1, (1,)),
    }
    if offset != len(raw):
        raise ValueError("live NNUE parser did not consume the exact asset")
    return qweights


def score_child_sfens_with_live_nnue(
    qweights: Mapping[str, torch.Tensor],
    child_sfens: Sequence[str],
    *,
    scale_k: float = LIVE_NNUE_SCALE_K,
    batch_size: int = 2048,
) -> list[float]:
    """Return exact deployed integer scores in each child's side-to-move view."""

    if not math.isfinite(scale_k) or scale_k <= 0 or batch_size <= 0:
        raise ValueError("invalid live NNUE scoring controls")
    scale_int = math.trunc(scale_k)
    if scale_int <= 0 or scale_int > 1_000_000:
        raise ValueError("live NNUE scale truncates outside production bounds")
    scores: list[float] = []
    for start in range(0, len(child_sfens), batch_size):
        board_rows: list[list[int]] = []
        hand_rows: list[list[float]] = []
        for sfen in child_sfens[start : start + batch_size]:
            board, hands, _turn, _king = train.parse_sfen(sfen)
            board_rows.append(
                board[: train.MAX_PIECES]
                + [train.PAD_IDX] * (train.MAX_PIECES - len(board))
            )
            hand_rows.append(hands)
        out_q = int16_forward_batch(
            qweights,
            torch.tensor(board_rows, dtype=torch.long),
            torch.tensor(hand_rows, dtype=torch.float32),
            train.PAD_IDX,
        )
        for raw_score in out_q.reshape(-1).tolist():
            numerator = int(raw_score) * scale_int
            truncated = (
                numerator // OUT_SCALE
                if numerator >= 0
                else -((-numerator) // OUT_SCALE)
            )
            scores.append(float(truncated))
    return [float(score) for score in scores]


def _validate_group_source(records: Sequence[dict[str, object]], role: str) -> None:
    played = sum("played" in row["sources"] for row in records)
    all_legal = all(row["sources"] == [ALL_LEGAL_SOURCE] for row in records)
    if role == "browser-all-legal":
        if played != 0 or not all_legal:
            raise ValueError("browser all-legal parent has an invalid source profile")
    elif role in ("v9", "v9-selection"):
        if played != 1 or any(ALL_LEGAL_SOURCE in row["sources"] for row in records):
            raise ValueError("V9 parent must contain exactly one played candidate")
    else:
        raise ValueError(f"unsupported input role {role!r}")


def load_groups(
    path: str | Path,
    *,
    role: str,
    expected_split: str,
    qweights: Mapping[str, torch.Tensor],
) -> tuple[list[ParentGroup], dict[str, object]]:
    """Strictly load one existing ``shogi-sibling-v1`` source."""

    source = Path(path)
    digest = hashlib.sha256()
    byte_count = 0
    rows = 0
    grouped: dict[str, dict[str, object]] = {}
    child_sfens: list[str] = []
    row_slots: list[tuple[str, int]] = []
    with source.open("rb") as handle:
        for line_number, raw in enumerate(handle, start=1):
            digest.update(raw)
            byte_count += len(raw)
            if raw == b"\n" or not raw.endswith(b"\n"):
                raise ValueError(f"{source}:{line_number}: expected one non-empty LF row")
            record = train.strict_json_loads(
                raw[:-1], f"{source}:{line_number}"
            )
            if type(record) is not dict:
                raise ValueError(f"{source}:{line_number}: row must be an object")
            declared_split = record.get("split")
            if declared_split is not None and declared_split != expected_split:
                raise ValueError(
                    f"{source}:{line_number}: declared split "
                    f"{declared_split!r}, expected {expected_split!r}"
                )
            # Some authenticated V9 partition outputs bind the role externally
            # and intentionally omit a row-local split.  Project only that
            # caller-pinned role before applying the existing strict validator.
            record = {**record, "split": expected_split}
            train._validate_strict_sibling_record(record, f"{source}:{line_number}")
            validate_child_transition(
                str(record["parent_sfen"]),
                str(record["move"]),
                str(record["child_sfen"]),
            )
            parent_id = record["parent_id"]
            entry = grouped.setdefault(
                parent_id,
                {
                    "game_id": record["game_id"],
                    "position_id": record["position_id"],
                    "parent_sfen": record["parent_sfen"],
                    "records": [],
                },
            )
            if (
                entry["game_id"] != record["game_id"]
                or entry["position_id"] != record["position_id"]
                or entry["parent_sfen"] != record["parent_sfen"]
            ):
                raise ValueError(f"{source}:{line_number}: parent metadata changed")
            records = entry["records"]
            if not isinstance(records, list):
                raise AssertionError("invalid internal group")
            records.append(record)
            row_slots.append((parent_id, len(records) - 1))
            child_sfens.append(record["child_sfen"])
            rows += 1

    child_scores = score_child_sfens_with_live_nnue(qweights, child_sfens)
    base_by_slot = {
        slot: -child_score for slot, child_score in zip(row_slots, child_scores, strict=True)
    }
    groups: list[ParentGroup] = []
    for parent_id in sorted(grouped):
        entry = grouped[parent_id]
        records = entry["records"]
        if not isinstance(records, list) or len(records) < 2:
            raise ValueError(f"{source}: parent {parent_id} has fewer than two moves")
        _validate_group_source(records, role)
        moves = [row["move"] for row in records]
        ranks = sorted(row["teacher_rank"] for row in records)
        if len(set(moves)) != len(moves) or ranks != list(range(1, len(records) + 1)):
            raise ValueError(f"{source}: duplicate moves or non-contiguous ranks")
        ranked = sorted(records, key=lambda row: row["teacher_rank"])
        if any(
            ranked[index - 1]["teacher_parent_cp"]
            < ranked[index]["teacher_parent_cp"]
            for index in range(1, len(ranked))
        ):
            raise ValueError(f"{source}: rank/cp contradiction")
        parent_sfen = str(entry["parent_sfen"])
        parent_board, parent_hands, _turn, _king = train.parse_sfen(parent_sfen)
        padded_parent = tuple(
            parent_board[: train.MAX_PIECES]
            + [train.PAD_IDX] * (train.MAX_PIECES - len(parent_board))
        )
        examples = tuple(
            MoveExample(
                move=str(row["move"]),
                teacher_cp=float(row["teacher_parent_cp"]),
                teacher_rank=int(row["teacher_rank"]),
                child_position_id=str(row["child_position_id"]),
                child_sfen=str(row["child_sfen"]),
                features=encode_explicit_move(parent_sfen, str(row["move"])),
                base_parent_cp=base_by_slot[(parent_id, index)],
            )
            for index, row in enumerate(records)
        )
        groups.append(
            ParentGroup(
                parent_id=parent_id,
                game_id=str(entry["game_id"]),
                position_id=str(entry["position_id"]),
                parent_sfen=parent_sfen,
                parent_board=padded_parent,
                parent_hands=tuple(parent_hands),
                semantic_position_ids=frozenset(
                    [str(entry["position_id"])]
                    + [example.child_position_id for example in examples]
                ),
                examples=examples,
                source_role=role,
            )
        )
    return groups, {
        "path": str(source.resolve()),
        "bytes": byte_count,
        "sha256": digest.hexdigest(),
        "rows": rows,
        "parents": len(groups),
        "games": len({group.game_id for group in groups}),
    }


def filter_semantic_conflicts(
    groups: Sequence[ParentGroup],
    protected_ids: set[str] | frozenset[str],
) -> tuple[list[ParentGroup], list[str]]:
    kept: list[ParentGroup] = []
    dropped: list[str] = []
    for group in groups:
        if group.semantic_position_ids & protected_ids:
            dropped.append(group.parent_id)
        else:
            kept.append(group)
    return kept, dropped


def semantic_union(groups: Iterable[ParentGroup]) -> set[str]:
    return {
        semantic_id
        for group in groups
        for semantic_id in group.semantic_position_ids
    }


def split_by_semantic_components(
    groups: Sequence[ParentGroup],
    *,
    seed: int,
    tune_modulus: int,
) -> tuple[list[ParentGroup], list[ParentGroup], dict[str, object]]:
    """Split whole game/semantic connected components deterministically.

    Game-disjointness alone is insufficient when the same parent or child
    position occurs in multiple games.  Union every group sharing a game or
    semantic position, then assign the entire component from a canonical
    identity.  Input order cannot affect membership or assignment.
    """

    if not groups:
        raise ValueError("cannot split zero parent groups")
    if seed < 0:
        raise ValueError("split seed must be non-negative")
    if tune_modulus < 3:
        raise ValueError("tune modulus must be at least three")

    parent_ids = [group.parent_id for group in groups]
    if len(set(parent_ids)) != len(parent_ids):
        raise ValueError("component split requires unique parent IDs")
    parents = list(range(len(groups)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left: int, right: int) -> None:
        left_root = find(left)
        right_root = find(right)
        if left_root != right_root:
            parents[right_root] = left_root

    game_owner: dict[str, int] = {}
    semantic_owner: dict[str, int] = {}
    for index, group in enumerate(groups):
        previous_game = game_owner.setdefault(group.game_id, index)
        union(index, previous_game)
        if not group.semantic_position_ids:
            raise ValueError("component split group has no semantic identity")
        for semantic_id in group.semantic_position_ids:
            previous_semantic = semantic_owner.setdefault(semantic_id, index)
            union(index, previous_semantic)

    components: dict[int, list[int]] = {}
    for index in range(len(groups)):
        components.setdefault(find(index), []).append(index)
    assignments: dict[int, str] = {}
    assignment_rows: list[str] = []
    fit_components = tune_components = 0
    component_digests: set[str] = set()
    for indices in components.values():
        component_groups = [groups[index] for index in indices]
        identity = {
            "games": sorted({group.game_id for group in component_groups}),
            "parents": sorted(group.parent_id for group in component_groups),
            "semantic_position_ids": sorted(
                semantic_union(component_groups)
            ),
        }
        canonical = json.dumps(
            identity,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        component_digest = hashlib.sha256(canonical).hexdigest()
        if component_digest in component_digests:
            raise ValueError("component identity digest collision")
        component_digests.add(component_digest)
        assignment_digest = hashlib.sha256(
            f"{seed}:{component_digest}".encode("ascii")
        ).digest()
        role = (
            "tune"
            if int.from_bytes(assignment_digest[:8], "big") % tune_modulus == 0
            else "fit"
        )
        if role == "tune":
            tune_components += 1
        else:
            fit_components += 1
        assignment_rows.append(f"{component_digest}\t{role}")
        for index in indices:
            assignments[index] = role

    fit = [
        group for index, group in enumerate(groups) if assignments[index] == "fit"
    ]
    tune = [
        group for index, group in enumerate(groups) if assignments[index] == "tune"
    ]
    if not fit or not tune:
        raise ValueError("deterministic component fit/tune split is empty")
    game_overlap = {group.game_id for group in fit} & {
        group.game_id for group in tune
    }
    semantic_overlap = semantic_union(fit) & semantic_union(tune)
    if game_overlap or semantic_overlap:
        raise AssertionError("component split leaked a game or semantic position")
    receipt = {
        "algorithm": "game-semantic-connected-components-sha256-v1",
        "seed": seed,
        "tune_modulus": tune_modulus,
        "components": len(components),
        "fit_components": fit_components,
        "tune_components": tune_components,
        "fit_parents": len(fit),
        "tune_parents": len(tune),
        "fit_games": len({group.game_id for group in fit}),
        "tune_games": len({group.game_id for group in tune}),
        "game_overlap": 0,
        "semantic_position_overlap": 0,
        "component_assignments_sha256": hashlib.sha256(
            "\n".join(sorted(assignment_rows)).encode("ascii")
        ).hexdigest(),
    }
    return fit, tune, receipt


class ExplicitResidualPolicy(nn.Module):
    """70-KiB-class explicit policy residual; no hash function or bucket."""

    def __init__(self) -> None:
        super().__init__()
        self.parent_board = nn.EmbeddingBag(
            train.BOARD_FEATS + 1,
            PARENT_DIM,
            mode="sum",
            padding_idx=train.PAD_IDX,
        )
        self.parent_hand = nn.Linear(train.HAND_FEATS, PARENT_DIM)
        self.from_square = nn.Embedding(82, FROM_TO_DIM)
        self.to_square = nn.Embedding(81, FROM_TO_DIM)
        self.moved_piece = nn.Embedding(15, PIECE_DIM)
        self.captured_piece = nn.Embedding(15, CAPTURE_DIM)
        self.action = nn.Embedding(8, SMALL_DIM)
        self.delta_file = nn.Embedding(17, SMALL_DIM)
        self.delta_rank = nn.Embedding(17, SMALL_DIM)
        self.self_king_relation = nn.Embedding(17 * 17, SMALL_DIM)
        self.enemy_king_relation = nn.Embedding(17 * 17, SMALL_DIM)
        self.neighborhood = nn.Embedding(16 * 30, NEIGHBOR_DIM)
        self.ply_bucket = nn.Embedding(16, SMALL_DIM)
        self.hidden = nn.Linear(MOVE_INPUT_DIM, HIDDEN_DIM)
        self.output = nn.Linear(HIDDEN_DIM, 1)
        self.reset_parameters()

    def reset_parameters(self) -> None:
        for module in self.modules():
            if isinstance(module, nn.Embedding) or isinstance(module, nn.EmbeddingBag):
                nn.init.normal_(module.weight, std=0.01)
                if module.padding_idx is not None:
                    with torch.no_grad():
                        module.weight[module.padding_idx].zero_()
        nn.init.normal_(self.parent_hand.weight, std=0.01)
        nn.init.zeros_(self.parent_hand.bias)
        nn.init.kaiming_uniform_(self.hidden.weight, a=math.sqrt(5))
        nn.init.zeros_(self.hidden.bias)
        nn.init.zeros_(self.output.weight)
        nn.init.zeros_(self.output.bias)

    def forward(self, batch: Mapping[str, torch.Tensor]) -> tuple[torch.Tensor, torch.Tensor]:
        parent = self.parent_board(batch["parent_board"]) + self.parent_hand(
            batch["parent_hands"]
        )
        parent = torch.tanh(parent).unsqueeze(1).expand(
            -1, batch["from_square"].shape[1], -1
        )
        neighborhood = batch["neighborhood"]
        slot_offsets = (
            torch.arange(16, device=neighborhood.device).view(1, 1, 16) * 30
        )
        neighbor_vectors = self.neighborhood(neighborhood + slot_offsets)
        destination_neighbors = neighbor_vectors[:, :, :8].sum(dim=2)
        origin_neighbors = neighbor_vectors[:, :, 8:].sum(dim=2)
        features = torch.cat(
            (
                parent,
                self.from_square(batch["from_square"]),
                self.to_square(batch["to_square"]),
                self.moved_piece(batch["moved_piece"]),
                self.captured_piece(batch["captured_piece"]),
                self.action(batch["action"]),
                self.delta_file(batch["delta_file"]),
                self.delta_rank(batch["delta_rank"]),
                self.self_king_relation(batch["self_king_relation"]),
                self.enemy_king_relation(batch["enemy_king_relation"]),
                destination_neighbors,
                origin_neighbors,
                self.ply_bucket(batch["ply_bucket"]),
                (batch["base_cp"] / LIVE_NNUE_SCALE_K).unsqueeze(-1),
            ),
            dim=-1,
        )
        if features.shape[-1] != MOVE_INPUT_DIM:
            raise ValueError("explicit feature width changed")
        residual = self.output(torch.tanh(self.hidden(features))).squeeze(-1)
        residual = residual.clamp(-RESIDUAL_LIMIT_CP, RESIDUAL_LIMIT_CP)
        combined = batch["base_cp"] + residual
        return combined, residual


def make_batch(
    groups: Sequence[ParentGroup],
    device: str | torch.device,
) -> dict[str, torch.Tensor]:
    if not groups:
        raise ValueError("cannot batch zero parent groups")
    max_moves = max(len(group.examples) for group in groups)
    batch = len(groups)
    values: dict[str, torch.Tensor] = {
        "parent_board": torch.tensor(
            [group.parent_board for group in groups], dtype=torch.long
        ),
        "parent_hands": torch.tensor(
            [group.parent_hands for group in groups], dtype=torch.float32
        ),
        "from_square": torch.zeros((batch, max_moves), dtype=torch.long),
        "to_square": torch.zeros((batch, max_moves), dtype=torch.long),
        "moved_piece": torch.zeros((batch, max_moves), dtype=torch.long),
        "captured_piece": torch.zeros((batch, max_moves), dtype=torch.long),
        "action": torch.zeros((batch, max_moves), dtype=torch.long),
        "delta_file": torch.zeros((batch, max_moves), dtype=torch.long),
        "delta_rank": torch.zeros((batch, max_moves), dtype=torch.long),
        "self_king_relation": torch.zeros((batch, max_moves), dtype=torch.long),
        "enemy_king_relation": torch.zeros((batch, max_moves), dtype=torch.long),
        "neighborhood": torch.zeros((batch, max_moves, 16), dtype=torch.long),
        "ply_bucket": torch.zeros((batch, max_moves), dtype=torch.long),
        "teacher_cp": torch.zeros((batch, max_moves), dtype=torch.float32),
        "base_cp": torch.zeros((batch, max_moves), dtype=torch.float32),
        "valid": torch.zeros((batch, max_moves), dtype=torch.bool),
    }
    for group_index, group in enumerate(groups):
        for move_index, example in enumerate(group.examples):
            feature = example.features
            for key in (
                "from_square",
                "to_square",
                "moved_piece",
                "captured_piece",
                "action",
                "delta_file",
                "delta_rank",
                "self_king_relation",
                "enemy_king_relation",
                "ply_bucket",
            ):
                values[key][group_index, move_index] = getattr(feature, key)
            values["neighborhood"][group_index, move_index] = torch.tensor(
                feature.neighborhood
            )
            values["teacher_cp"][group_index, move_index] = example.teacher_cp
            values["base_cp"][group_index, move_index] = example.base_parent_cp
            values["valid"][group_index, move_index] = True
    return {key: value.to(device) for key, value in values.items()}


def listwise_policy_value_loss(
    combined_cp: torch.Tensor,
    residual_cp: torch.Tensor,
    teacher_cp: torch.Tensor,
    valid: torch.Tensor,
    *,
    temperature_cp: float,
    pair_gap_cp: float,
    value_weight: float,
    pair_weight: float,
    residual_l2_weight: float,
) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
    if (
        combined_cp.shape != teacher_cp.shape
        or residual_cp.shape != teacher_cp.shape
        or valid.shape != teacher_cp.shape
    ):
        raise ValueError("policy/value tensors must have identical shapes")
    if not bool(valid.any(dim=1).all()):
        raise ValueError("every parent must contain at least one candidate")
    if temperature_cp <= 0 or pair_gap_cp <= 0:
        raise ValueError("temperature and pair gap must be positive")

    negative = torch.finfo(combined_cp.dtype).min
    teacher_masked = teacher_cp.masked_fill(~valid, negative)
    prediction_masked = combined_cp.masked_fill(~valid, negative)
    teacher_best = teacher_masked.max(dim=1, keepdim=True).values
    target_logits = (
        (teacher_cp - teacher_best).clamp(min=-RESIDUAL_LIMIT_CP, max=0)
        / temperature_cp
    ).masked_fill(~valid, negative)
    targets = torch.softmax(target_logits, dim=1)
    policy_per_parent = -(
        targets * torch.log_softmax(prediction_masked / temperature_cp, dim=1)
    ).sum(dim=1)

    value_terms = F.smooth_l1_loss(
        combined_cp / LIVE_NNUE_SCALE_K,
        teacher_cp / LIVE_NNUE_SCALE_K,
        beta=0.25,
        reduction="none",
    )
    valid_counts = valid.sum(dim=1).clamp(min=1)
    value_per_parent = (
        value_terms.masked_fill(~valid, 0).sum(dim=1) / valid_counts
    )
    shrink_per_parent = (
        (residual_cp / LIVE_NNUE_SCALE_K)
        .square()
        .masked_fill(~valid, 0)
        .sum(dim=1)
        / valid_counts
    )

    pair_losses: list[torch.Tensor] = []
    for row in range(combined_cp.shape[0]):
        count = int(valid[row].sum().item())
        teacher = teacher_cp[row, :count]
        prediction = combined_cp[row, :count]
        teacher_delta = teacher.unsqueeze(1) - teacher.unsqueeze(0)
        eligible = teacher_delta >= pair_gap_cp
        if bool(eligible.any()):
            prediction_delta = prediction.unsqueeze(1) - prediction.unsqueeze(0)
            pair_losses.append(
                F.softplus(-prediction_delta[eligible] / temperature_cp).mean()
            )
        else:
            pair_losses.append(prediction.sum() * 0.0)
    pair_per_parent = torch.stack(pair_losses)
    components = {
        "policy": policy_per_parent.mean(),
        "value": value_per_parent.mean(),
        "pair": pair_per_parent.mean(),
        "residual_l2": shrink_per_parent.mean(),
    }
    total = (
        components["policy"]
        + value_weight * components["value"]
        + pair_weight * components["pair"]
        + residual_l2_weight * components["residual_l2"]
    )
    return total, components


def score_groups(
    model: ExplicitResidualPolicy | None,
    groups: Sequence[ParentGroup],
    *,
    device: str,
    batch_size: int,
    pair_gap_cp: float,
) -> dict[str, float | int]:
    if not groups:
        raise ValueError("cannot score zero parent groups")
    if model is not None:
        model.eval()
    parent_count = top1_correct = pair_count = pair_correct = 0
    regret_sum = 0.0
    with torch.no_grad():
        for start in range(0, len(groups), batch_size):
            selected = groups[start : start + batch_size]
            batch = make_batch(selected, device)
            logits = (
                batch["base_cp"]
                if model is None
                else model(batch)[0]
            )
            valid = batch["valid"]
            teacher = batch["teacher_cp"]
            negative = torch.finfo(logits.dtype).min
            logits = logits.masked_fill(~valid, negative)
            teacher_masked = teacher.masked_fill(~valid, negative)
            teacher_best_values = teacher_masked.max(dim=1).values
            predicted_best_values = logits.max(dim=1).values
            teacher_best = valid & (
                teacher == teacher_best_values.unsqueeze(1)
            )
            predicted_best = valid & (
                logits == predicted_best_values.unsqueeze(1)
            )
            top1_correct += int(
                torch.all(~predicted_best | teacher_best, dim=1).sum().item()
            )
            chosen = logits.argmax(dim=1)
            chosen_cp = teacher.gather(1, chosen.unsqueeze(1)).squeeze(1)
            regret_sum += float((teacher_best_values - chosen_cp).sum().item())
            for row, group in enumerate(selected):
                count = len(group.examples)
                teacher_row = teacher[row, :count]
                prediction_row = logits[row, :count]
                delta = teacher_row.unsqueeze(1) - teacher_row.unsqueeze(0)
                eligible = delta >= pair_gap_cp
                prediction_delta = (
                    prediction_row.unsqueeze(1) - prediction_row.unsqueeze(0)
                )
                pair_correct += int((prediction_delta[eligible] > 0).sum().item())
                pair_count += int(eligible.sum().item())
            parent_count += len(selected)
    if pair_count == 0:
        raise ValueError("scoring set contains no eligible pair")
    return {
        "parents": parent_count,
        "top1_correct": top1_correct,
        "top1_accuracy": top1_correct / parent_count,
        "pair_count": pair_count,
        "pair_accuracy": pair_correct / pair_count,
        "mean_regret_cp": regret_sum / parent_count,
    }


def selection_key(
    model_metrics: Mapping[str, Mapping[str, float | int]],
    base_metrics: Mapping[str, Mapping[str, float | int]],
) -> tuple[float, float, float]:
    domains = sorted(model_metrics)
    top1_gains = [
        float(model_metrics[name]["top1_accuracy"])
        - float(base_metrics[name]["top1_accuracy"])
        for name in domains
    ]
    pair_gains = [
        float(model_metrics[name]["pair_accuracy"])
        - float(base_metrics[name]["pair_accuracy"])
        for name in domains
    ]
    regret_changes = [
        float(model_metrics[name]["mean_regret_cp"])
        - float(base_metrics[name]["mean_regret_cp"])
        for name in domains
    ]
    return min(top1_gains), min(pair_gains), -max(regret_changes)


def quantize_export(
    model: ExplicitResidualPolicy,
    out_dir: str | Path,
) -> tuple[ExplicitResidualPolicy, dict[str, object]]:
    """Symmetric per-tensor int16 export used only by the static pilot gate."""

    target = Path(out_dir)
    target.mkdir(parents=True, exist_ok=True)
    restored = ExplicitResidualPolicy()
    restored_state: dict[str, torch.Tensor] = {}
    metadata_tensors: list[dict[str, object]] = []
    chunks: list[bytes] = []
    for name, tensor in model.state_dict().items():
        source = tensor.detach().cpu().to(torch.float32).contiguous()
        maximum = float(source.abs().max().item())
        scale = 32760.0 / maximum if maximum > 0 else 1.0
        quantized = torch.round(source * scale).clamp(-32768, 32767).to(torch.int16)
        values = array.array("h", quantized.view(-1).tolist())
        if values.itemsize != 2:
            raise RuntimeError("host int16 layout is unsupported")
        if sys.byteorder == "big":
            values.byteswap()
        payload = values.tobytes()
        chunks.append(payload)
        restored_state[name] = quantized.to(torch.float32).reshape(source.shape) / scale
        metadata_tensors.append(
            {
                "name": name,
                "shape": list(source.shape),
                "elements": source.numel(),
                "scale": scale,
                "bytes": len(payload),
            }
        )
    artifact = b"".join(chunks)
    if len(artifact) > MAX_HEAD_BYTES:
        raise ValueError(
            f"quantized policy head is {len(artifact)} bytes, above {MAX_HEAD_BYTES}"
        )
    restored.load_state_dict(restored_state, strict=True)
    weights_path = target / "weights.bin"
    weights_path.write_bytes(artifact)
    metadata = {
        "schema": SCHEMA,
        "feature_version": FEATURE_VERSION,
        "dtype": "int16-little-endian-per-tensor-symmetric-scale",
        "bytes": len(artifact),
        "sha256": hashlib.sha256(artifact).hexdigest(),
        "tensors": metadata_tensors,
        "live_nnue_embedded": False,
        "live_nnue_bytes_unchanged": LIVE_NNUE_BYTES,
        "runtime_scope": "research-root-move-order-only",
    }
    (target / "weights.meta.json").write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return restored, metadata


__all__ = [
    "ExplicitResidualPolicy",
    "FEATURE_VERSION",
    "LIVE_NNUE_BYTES",
    "LIVE_NNUE_SHA256",
    "MAX_HEAD_BYTES",
    "MOVE_INPUT_DIM",
    "MoveExample",
    "MoveFeatures",
    "PROTOCOL_SCHEMA",
    "ParentGroup",
    "SCHEMA",
    "child_sfen_after_usi",
    "encode_explicit_move",
    "file_fingerprint",
    "filter_semantic_conflicts",
    "listwise_policy_value_loss",
    "load_groups",
    "make_batch",
    "quantize_export",
    "read_live_board_qweights",
    "score_child_sfens_with_live_nnue",
    "score_groups",
    "selection_key",
    "semantic_union",
    "split_by_semantic_components",
    "validate_child_transition",
]
