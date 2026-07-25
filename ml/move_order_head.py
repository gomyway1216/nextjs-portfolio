#!/usr/bin/env python3
"""Feature encoding and metrics for a tiny, evaluator-independent move-order head.

The head is a signed feature-hashed linear model.  It never evaluates a leaf
position and cannot change the NNUE value function.  Each legal move receives a
small fixed set of parent-position/move features; inference is only signed
int16 table lookups and integer additions.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path
from typing import Iterable

import torch


SCHEMA = "shogi-move-order-head-v1"
BUCKETS = 65_536
PAD_INDEX = 0
FEATURE_VERSION = "signed-fnv1a64k-parent-move-v1"
PIECE_TYPES = {
    "P": 1,
    "L": 2,
    "N": 3,
    "S": 4,
    "G": 5,
    "B": 6,
    "R": 7,
    "K": 8,
    "+P": 9,
    "+L": 10,
    "+N": 11,
    "+S": 12,
    "+B": 13,
    "+R": 14,
}
DROP_TYPES = {
    piece: kind
    for piece, kind in PIECE_TYPES.items()
    if len(piece) == 1 and piece != "K"
}
RANKS = "abcdefghi"
NEIGHBORS = (
    (-1, -1),
    (0, -1),
    (1, -1),
    (-1, 0),
    (1, 0),
    (-1, 1),
    (0, 1),
    (1, 1),
)


@dataclass(frozen=True)
class MoveExample:
    move: str
    teacher_cp: float
    teacher_rank: int
    feature_indices: tuple[int, ...]
    feature_signs: tuple[int, ...]


@dataclass(frozen=True)
class ParentGroup:
    parent_id: str
    game_id: str
    position_id: str
    parent_sfen: str
    examples: tuple[MoveExample, ...]


def _strict_json(raw: str, context: str) -> dict[str, object]:
    def reject_constant(value: str) -> None:
        raise ValueError(f"{context}: invalid JSON constant {value}")

    value = json.loads(raw, parse_constant=reject_constant)
    if type(value) is not dict:
        raise ValueError(f"{context}: expected one JSON object")
    return value


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


def _piece_token(raw: str, promoted: bool) -> str:
    base = raw.upper()
    return f"+{base}" if promoted else base


def _square_index(file_number: int, rank_number: int) -> int:
    if not (1 <= file_number <= 9 and 1 <= rank_number <= 9):
        raise ValueError("square is outside the 9x9 board")
    return (file_number - 1) * 9 + (rank_number - 1)


def _square_coords(index: int) -> tuple[int, int]:
    if not 0 <= index < 81:
        raise ValueError("square index is outside the 9x9 board")
    return index // 9 + 1, index % 9 + 1


def _normalize_square(file_number: int, rank_number: int, side: str) -> int:
    if side == "w":
        file_number = 10 - file_number
        rank_number = 10 - rank_number
    return _square_index(file_number, rank_number)


def _parse_usi_square(token: str) -> tuple[int, int]:
    if len(token) != 2 or token[0] not in "123456789" or token[1] not in RANKS:
        raise ValueError(f"invalid USI square: {token!r}")
    return int(token[0]), RANKS.index(token[1]) + 1


def parse_parent_sfen(sfen: str) -> dict[str, object]:
    fields = sfen.strip().split()
    if len(fields) < 4 or fields[1] not in ("b", "w"):
        raise ValueError("invalid parent SFEN")
    board_field, side = fields[0], fields[1]
    ranks = board_field.split("/")
    if len(ranks) != 9:
        raise ValueError("SFEN board must contain nine ranks")

    raw_board: dict[tuple[int, int], tuple[int, bool]] = {}
    normalized_board: dict[int, int] = {}
    self_king = None
    enemy_king = None
    for rank_number, row in enumerate(ranks, start=1):
        file_number = 9
        promoted = False
        for character in row:
            if character.isdigit():
                if promoted:
                    raise ValueError("promotion marker before empty SFEN run")
                file_number -= int(character)
                continue
            if character == "+":
                if promoted:
                    raise ValueError("duplicate SFEN promotion marker")
                promoted = True
                continue
            if not 1 <= file_number <= 9:
                raise ValueError("SFEN rank overflows the board")
            owner_is_sente = character.isupper()
            token = _piece_token(character, promoted)
            piece_type = PIECE_TYPES.get(token)
            if piece_type is None:
                raise ValueError(f"unsupported SFEN piece: {token!r}")
            raw_board[(file_number, rank_number)] = (piece_type, owner_is_sente)
            normalized = _normalize_square(file_number, rank_number, side)
            mover_is_sente = side == "b"
            signed_piece = (
                piece_type if owner_is_sente == mover_is_sente else -piece_type
            )
            normalized_board[normalized] = signed_piece
            if piece_type == PIECE_TYPES["K"]:
                if signed_piece > 0:
                    self_king = normalized
                else:
                    enemy_king = normalized
            file_number -= 1
            promoted = False
        if promoted or file_number != 0:
            raise ValueError("SFEN rank does not contain exactly nine files")
    if self_king is None or enemy_king is None:
        raise ValueError("parent SFEN must contain both kings")
    return {
        "side": side,
        "raw_board": raw_board,
        "board": normalized_board,
        "self_king": self_king,
        "enemy_king": enemy_king,
    }


def _fnv_feature(family: int, values: Iterable[int]) -> tuple[int, int]:
    value = (0x811C9DC5 ^ (family & 0xFFFFFFFF)) & 0xFFFFFFFF
    for item in values:
        value ^= item & 0xFFFFFFFF
        value = (value * 0x01000193) & 0xFFFFFFFF
    value ^= value >> 16
    value = (value * 0x7FEB352D) & 0xFFFFFFFF
    value ^= value >> 15
    bucket = value & (BUCKETS - 1)
    sign = 1 if value & BUCKETS else -1
    return bucket + 1, sign


def _occupant_code(board: dict[int, int], file_number: int, rank_number: int) -> int:
    if not (1 <= file_number <= 9 and 1 <= rank_number <= 9):
        return 29
    piece = board.get(_square_index(file_number, rank_number), 0)
    if piece > 0:
        return piece
    if piece < 0:
        return 14 + (-piece)
    return 0


def _clip_delta(value: int) -> int:
    return max(-8, min(8, value)) + 8


def _zone(file_number: int, rank_number: int) -> int:
    return min(2, (file_number - 1) // 3) * 3 + min(2, (rank_number - 1) // 3)


def encode_move(
    parent: dict[str, object], move: str
) -> tuple[tuple[int, ...], tuple[int, ...]]:
    side = parent["side"]
    raw_board = parent["raw_board"]
    board = parent["board"]
    self_king = int(parent["self_king"])
    enemy_king = int(parent["enemy_king"])
    if (
        not isinstance(side, str)
        or not isinstance(raw_board, dict)
        or not isinstance(board, dict)
    ):
        raise ValueError("invalid parsed parent")

    is_drop = "*" in move
    promote = move.endswith("+")
    if is_drop:
        if len(move) != 4 or move[1] != "*" or promote:
            raise ValueError(f"invalid USI drop: {move!r}")
        piece_type = DROP_TYPES.get(move[0].upper())
        if piece_type is None:
            raise ValueError(f"invalid USI drop piece: {move!r}")
        from_index = 81
        to_raw = _parse_usi_square(move[2:4])
    else:
        core = move[:-1] if promote else move
        if len(core) != 4:
            raise ValueError(f"invalid USI move: {move!r}")
        from_raw = _parse_usi_square(core[:2])
        to_raw = _parse_usi_square(core[2:4])
        source = raw_board.get(from_raw)
        if source is None:
            raise ValueError(f"USI source is empty: {move!r}")
        piece_type, owner_is_sente = source
        if owner_is_sente != (side == "b"):
            raise ValueError(f"USI source is not owned by side to move: {move!r}")
        from_index = _normalize_square(*from_raw, side)

    to_index = _normalize_square(*to_raw, side)
    destination = raw_board.get(to_raw)
    if is_drop and destination is not None:
        raise ValueError(f"USI drop destination is occupied: {move!r}")
    capture_type = 0 if destination is None else int(destination[0])
    if (
        not is_drop
        and destination is not None
        and bool(destination[1]) == (side == "b")
    ):
        raise ValueError(f"USI destination contains own piece: {move!r}")

    to_file, to_rank = _square_coords(to_index)
    if is_drop:
        from_file, from_rank = 0, 0
        dx = dy = 0
        distance = 0
        blockers = 0
    else:
        from_file, from_rank = _square_coords(from_index)
        dx, dy = to_file - from_file, to_rank - from_rank
        distance = max(abs(dx), abs(dy))
        blockers = 0
        step_file = 0 if dx == 0 else 1 if dx > 0 else -1
        step_rank = 0 if dy == 0 else 1 if dy > 0 else -1
        if dx == 0 or dy == 0 or abs(dx) == abs(dy):
            cursor_file = from_file + step_file
            cursor_rank = from_rank + step_rank
            while (cursor_file, cursor_rank) != (to_file, to_rank):
                if board.get(_square_index(cursor_file, cursor_rank), 0) != 0:
                    blockers += 1
                cursor_file += step_file
                cursor_rank += step_rank

    self_king_file, self_king_rank = _square_coords(self_king)
    enemy_king_file, enemy_king_rank = _square_coords(enemy_king)
    to_self_dx, to_self_dy = to_file - self_king_file, to_rank - self_king_rank
    to_enemy_dx, to_enemy_dy = to_file - enemy_king_file, to_rank - enemy_king_rank
    self_distance = min(8, abs(to_self_dx) + abs(to_self_dy))
    enemy_distance = min(8, abs(to_enemy_dx) + abs(to_enemy_dy))
    action_code = int(is_drop) | (int(promote) << 1) | (int(capture_type != 0) << 2)

    descriptors: list[tuple[int, tuple[int, ...]]] = [
        (1, (piece_type,)),
        (2, (from_index,)),
        (3, (to_index,)),
        (4, (piece_type, from_index)),
        (5, (piece_type, to_index)),
        (6, (from_index, to_index)),
        (7, (piece_type, capture_type)),
        (8, (piece_type, int(promote))),
        (9, (piece_type, int(is_drop))),
        (10, (_clip_delta(dx), _clip_delta(dy))),
        (11, (piece_type, _clip_delta(dx), _clip_delta(dy))),
        (12, (piece_type, distance)),
        (13, (_clip_delta(to_enemy_dx), _clip_delta(to_enemy_dy))),
        (14, (piece_type, _clip_delta(to_enemy_dx), _clip_delta(to_enemy_dy))),
        (15, (_clip_delta(to_self_dx), _clip_delta(to_self_dy))),
        (16, (piece_type, _clip_delta(to_self_dx), _clip_delta(to_self_dy))),
        (17, (piece_type, enemy_distance)),
        (18, (piece_type, self_distance)),
        (19, (piece_type, to_rank)),
        (20, (piece_type, to_file)),
        (21, (piece_type, from_rank)),
        (22, (piece_type, from_file)),
        (23, (piece_type, action_code)),
        (24, (piece_type, capture_type, to_index)),
        (25, (piece_type, from_index, to_index, int(promote))),
        (26, (piece_type, blockers, distance)),
        (27, (piece_type, _clip_delta(from_rank - to_rank))),
        (28, (piece_type, _zone(to_file, to_rank))),
        (
            29,
            (
                piece_type,
                9 if is_drop else _zone(from_file, from_rank),
                _zone(to_file, to_rank),
            ),
        ),
        (30, (piece_type, min(8, abs(to_file - 5) + abs(to_rank - 5)))),
    ]
    for index, (delta_file, delta_rank) in enumerate(NEIGHBORS):
        descriptors.append(
            (
                100 + index,
                (
                    piece_type,
                    _occupant_code(board, to_file + delta_file, to_rank + delta_rank),
                ),
            )
        )
    if not is_drop:
        for index, (delta_file, delta_rank) in enumerate(NEIGHBORS):
            descriptors.append(
                (
                    120 + index,
                    (
                        piece_type,
                        _occupant_code(
                            board,
                            from_file + delta_file,
                            from_rank + delta_rank,
                        ),
                    ),
                )
            )

    hashed = tuple(_fnv_feature(family, values) for family, values in descriptors)
    return tuple(item[0] for item in hashed), tuple(item[1] for item in hashed)


def load_groups(
    path: str | Path, expected_split: str | None = None
) -> tuple[list[ParentGroup], dict[str, object]]:
    source = Path(path)
    digest = hashlib.sha256()
    byte_count = 0
    rows = 0
    grouped: dict[str, dict[str, object]] = {}
    with source.open("rb") as handle:
        for line_number, raw in enumerate(handle, start=1):
            digest.update(raw)
            byte_count += len(raw)
            if not raw.endswith(b"\n") or raw == b"\n":
                raise ValueError(
                    f"{source}:{line_number}: expected one non-empty LF row"
                )
            record = _strict_json(raw[:-1].decode("utf-8"), f"{source}:{line_number}")
            if record.get("schema") != "shogi-sibling-v1":
                raise ValueError(f"{source}:{line_number}: sibling schema mismatch")
            split = record.get("split")
            if expected_split is not None and split != expected_split:
                raise ValueError(
                    f"{source}:{line_number}: expected split {expected_split!r}"
                )
            parent_id = record.get("parent_id")
            game_id = record.get("game_id")
            position_id = record.get("position_id")
            parent_sfen = record.get("parent_sfen")
            move = record.get("move")
            teacher_cp = record.get("teacher_parent_cp")
            teacher_rank = record.get("teacher_rank")
            if (
                not isinstance(parent_id, str)
                or not isinstance(game_id, str)
                or not isinstance(position_id, str)
                or not isinstance(parent_sfen, str)
                or not isinstance(move, str)
                or type(teacher_cp) not in (int, float)
                or not math.isfinite(float(teacher_cp))
                or type(teacher_rank) is not int
                or teacher_rank < 1
            ):
                raise ValueError(f"{source}:{line_number}: invalid sibling row")
            entry = grouped.setdefault(
                parent_id,
                {
                    "game_id": game_id,
                    "position_id": position_id,
                    "parent_sfen": parent_sfen,
                    "records": [],
                },
            )
            if (
                entry["parent_sfen"] != parent_sfen
                or entry["game_id"] != game_id
                or entry["position_id"] != position_id
            ):
                raise ValueError(
                    f"{source}:{line_number}: parent identity changed within group"
                )
            records = entry["records"]
            if not isinstance(records, list):
                raise AssertionError("invalid internal group")
            records.append((move, float(teacher_cp), teacher_rank))
            rows += 1

    groups: list[ParentGroup] = []
    for parent_id in sorted(grouped):
        entry = grouped[parent_id]
        parent_sfen = str(entry["parent_sfen"])
        records = entry["records"]
        if not isinstance(records, list) or len(records) < 2:
            raise ValueError(f"{source}: parent {parent_id} has fewer than two moves")
        moves = [record[0] for record in records]
        ranks = sorted(record[2] for record in records)
        if len(set(moves)) != len(moves) or ranks != list(range(1, len(records) + 1)):
            raise ValueError(
                f"{source}: parent {parent_id} has duplicate moves or invalid ranks"
            )
        parsed = parse_parent_sfen(parent_sfen)
        examples = []
        for move, teacher_cp, teacher_rank in sorted(records, key=lambda item: item[0]):
            indices, signs = encode_move(parsed, move)
            examples.append(
                MoveExample(
                    move=move,
                    teacher_cp=teacher_cp,
                    teacher_rank=teacher_rank,
                    feature_indices=indices,
                    feature_signs=signs,
                )
            )
        groups.append(
            ParentGroup(
                parent_id,
                str(entry["game_id"]),
                str(entry["position_id"]),
                parent_sfen,
                tuple(examples),
            )
        )
    return groups, {
        "path": str(source.resolve()),
        "bytes": byte_count,
        "sha256": digest.hexdigest(),
        "rows": rows,
        "parents": len(groups),
    }


class MoveOrderHead(torch.nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.weights = torch.nn.Embedding(BUCKETS + 1, 1, padding_idx=PAD_INDEX)
        torch.nn.init.zeros_(self.weights.weight)

    def forward(self, indices: torch.Tensor, signs: torch.Tensor) -> torch.Tensor:
        return (self.weights(indices).squeeze(-1) * signs).sum(dim=-1)


def make_batch(groups: list[ParentGroup], device: str) -> tuple[torch.Tensor, ...]:
    if not groups:
        raise ValueError("cannot batch zero parent groups")
    max_moves = max(len(group.examples) for group in groups)
    max_features = max(
        len(example.feature_indices) for group in groups for example in group.examples
    )
    shape = (len(groups), max_moves, max_features)
    indices = torch.zeros(shape, dtype=torch.long)
    signs = torch.zeros(shape, dtype=torch.float32)
    teacher_cp = torch.full(
        (len(groups), max_moves), float("-inf"), dtype=torch.float32
    )
    valid = torch.zeros((len(groups), max_moves), dtype=torch.bool)
    for group_index, group in enumerate(groups):
        for move_index, example in enumerate(group.examples):
            count = len(example.feature_indices)
            indices[group_index, move_index, :count] = torch.tensor(
                example.feature_indices
            )
            signs[group_index, move_index, :count] = torch.tensor(example.feature_signs)
            teacher_cp[group_index, move_index] = example.teacher_cp
            valid[group_index, move_index] = True
    return (
        indices.to(device),
        signs.to(device),
        teacher_cp.to(device),
        valid.to(device),
    )


def listwise_pair_loss(
    logits: torch.Tensor,
    teacher_cp: torch.Tensor,
    valid: torch.Tensor,
    *,
    temperature_cp: float,
    pair_gap_cp: float,
    pair_weight: float,
) -> tuple[torch.Tensor, dict[str, float]]:
    masked_logits = logits.masked_fill(~valid, -1.0e9)
    best_cp = teacher_cp.masked_fill(~valid, -1.0e9).max(dim=1, keepdim=True).values
    target_logits = (
        (teacher_cp - best_cp).clamp(min=-1200.0, max=0.0) / temperature_cp
    ).masked_fill(~valid, -1.0e9)
    targets = torch.softmax(target_logits, dim=1)
    listwise = -(targets * torch.log_softmax(masked_logits, dim=1)).sum(dim=1).mean()

    better = teacher_cp.unsqueeze(2) - teacher_cp.unsqueeze(1)
    pair_mask = valid.unsqueeze(2) & valid.unsqueeze(1) & (better >= pair_gap_cp)
    predicted = logits.unsqueeze(2) - logits.unsqueeze(1)
    pair_importance = (better.abs().clamp(max=600.0) / 600.0).masked_fill(
        ~pair_mask, 0.0
    )
    pair_terms = torch.nn.functional.softplus(-predicted) * pair_importance
    pair_counts = pair_mask.sum(dim=(1, 2)).clamp(min=1)
    pairwise = (pair_terms.sum(dim=(1, 2)) / pair_counts).mean()
    total = listwise + pair_weight * pairwise
    return total, {
        "listwise_loss": float(listwise.detach().cpu().item()),
        "pairwise_loss": float(pairwise.detach().cpu().item()),
    }


def score_groups(
    model: MoveOrderHead,
    groups: list[ParentGroup],
    *,
    device: str,
    batch_size: int,
    pair_gap_cp: float,
    temperature_cp: float,
) -> dict[str, float | int]:
    model.eval()
    parent_count = 0
    correct = 0
    regret_sum = 0.0
    pair_correct = 0.0
    pair_count = 0
    ndcg_sum = 0.0
    cross_entropy_sum = 0.0
    with torch.no_grad():
        for start in range(0, len(groups), batch_size):
            batch_groups = groups[start : start + batch_size]
            indices, signs, teacher_cp, valid = make_batch(batch_groups, device)
            logits = model(indices, signs).masked_fill(~valid, -1.0e9)
            best_values = teacher_cp.masked_fill(~valid, -1.0e9).max(dim=1).values
            teacher_best = valid & (teacher_cp == best_values.unsqueeze(1))
            predicted_best_values = logits.max(dim=1).values
            predicted_best = valid & (logits == predicted_best_values.unsqueeze(1))
            correct += int(
                torch.all(~predicted_best | teacher_best, dim=1).sum().item()
            )
            chosen_indices = logits.argmax(dim=1)
            chosen_values = teacher_cp.gather(1, chosen_indices.unsqueeze(1)).squeeze(1)
            regret_sum += float((best_values - chosen_values).sum().item())

            best_cp = (
                teacher_cp.masked_fill(~valid, -1.0e9).max(dim=1, keepdim=True).values
            )
            target_logits = (
                (teacher_cp - best_cp).clamp(min=-1200.0, max=0.0) / temperature_cp
            ).masked_fill(~valid, -1.0e9)
            targets = torch.softmax(target_logits, dim=1)
            cross_entropy_sum += float(
                (-(targets * torch.log_softmax(logits, dim=1)).sum(dim=1)).sum().item()
            )

            for row, group in enumerate(batch_groups):
                count = len(group.examples)
                row_logits = logits[row, :count].cpu()
                row_cp = teacher_cp[row, :count].cpu()
                better = row_cp.unsqueeze(1) - row_cp.unsqueeze(0)
                eligible = better >= pair_gap_cp
                prediction = row_logits.unsqueeze(1) - row_logits.unsqueeze(0)
                pair_correct += float((prediction[eligible] > 0).sum().item())
                pair_count += int(eligible.sum().item())

                relevance = torch.softmax(
                    ((row_cp - row_cp.max()).clamp(min=-1200.0) / temperature_cp),
                    dim=0,
                )
                predicted_order = torch.argsort(row_logits, descending=True)[:5]
                ideal_order = torch.argsort(row_cp, descending=True)[:5]
                discounts = 1.0 / torch.log2(
                    torch.arange(2, 2 + len(predicted_order), dtype=torch.float32)
                )
                dcg = float((relevance[predicted_order] * discounts).sum().item())
                idcg = float((relevance[ideal_order] * discounts).sum().item())
                ndcg_sum += 1.0 if idcg == 0 else dcg / idcg
            parent_count += len(batch_groups)
    if parent_count == 0 or pair_count == 0:
        raise ValueError("evaluation set has no parents or eligible pairs")
    return {
        "parents": parent_count,
        "top1_correct": correct,
        "top1_accuracy": correct / parent_count,
        "mean_regret_cp": regret_sum / parent_count,
        "pair_count": pair_count,
        "pair_accuracy": pair_correct / pair_count,
        "ndcg_at_5": ndcg_sum / parent_count,
        "cross_entropy": cross_entropy_sum / parent_count,
    }
