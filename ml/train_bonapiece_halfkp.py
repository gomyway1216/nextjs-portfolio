#!/usr/bin/env python3
"""Research trainer for models using YaneuraOu's default BonaPiece semantics.

This module is deliberately separate from ``train.py`` and from every live
weight format.  Its feature constants are pinned to YaneuraOu revision
36e49e70c157fc4fb17813c02e63648e6284ff37 with ``DISTINGUISH_GOLDS`` off:

* 1,548 BonaPiece values (hand end 90), kings excluded;
* 81 * 1,548 HalfKP input dimensions;
* one shared 256-wide feature transformer; and
* either the standard dual-perspective 512 -> 32 -> 32 -> 1 shape, or a
  nonstandard speed-preserving side-to-move-only 256 -> 32 -> 1 shape.

The raw research export mirrors this repository's fixed-point convention but
is not a YaneuraOu ``.nnue`` file and is never a production/browser artifact.
"""

from __future__ import annotations

import argparse
import array
from dataclasses import dataclass
import hashlib
import json
import math
import os
import random
import sys
import tempfile
import time
from typing import Iterable

import torch
import torch.nn as nn
import torch.nn.functional as F


SOURCE_REVISION = "36e49e70c157fc4fb17813c02e63648e6284ff37"
SOURCE_URLS = (
    f"https://github.com/yaneurao/YaneuraOu/blob/{SOURCE_REVISION}/source/evaluate.h",
    f"https://github.com/yaneurao/YaneuraOu/blob/{SOURCE_REVISION}/source/eval/evaluate_bona_piece.cpp",
    f"https://github.com/yaneurao/YaneuraOu/blob/{SOURCE_REVISION}/source/eval/nnue/features/half_kp.cpp",
    f"https://github.com/yaneurao/YaneuraOu/blob/{SOURCE_REVISION}/source/eval/nnue/architectures/halfkp_256x2-32-32.h",
)

NUM_SQUARES = 81
FE_HAND_END = 90
FE_END = 1548
HALFKP_DIM = NUM_SQUARES * FE_END
NON_KING_PIECES = 38
H1 = 256
H2 = 32
H3 = 32

LEGACY_BOARD_FEATURES = 28 * NUM_SQUARES
LEGACY_HAND_FEATURES = 14
LEGACY_EXPORT_BYTES = 1_185_988

ACT_SCALE = 127
WEIGHT_SCALE = 64
OUTPUT_SCALE = ACT_SCALE * WEIGHT_SCALE

BONA_ZERO = 0

# Exact enum values from source/evaluate.h with DISTINGUISH_GOLDS disabled.
HAND_BASES = {
    "P": (1, 20),
    "L": (39, 44),
    "N": (49, 54),
    "S": (59, 64),
    "G": (69, 74),
    "B": (79, 82),
    "R": (85, 88),
}
BOARD_BASES = {
    "P": (90, 171),
    "L": (252, 333),
    "N": (414, 495),
    "S": (576, 657),
    "G": (738, 819),
    "B": (900, 981),
    "H": (1062, 1143),
    "R": (1224, 1305),
    "D": (1386, 1467),
}
INVENTORY = {"P": 18, "L": 4, "N": 4, "S": 4, "G": 4, "B": 2, "R": 2}
HAND_ORDER = "PLNSGBR"
HAND_CAPACITY = {"P": 18, "L": 4, "N": 4, "S": 4, "G": 4, "B": 2, "R": 2}

# Legacy custom board planes in the local perspective. Official BonaPiece
# collapses +P/+L/+N/+S into G, so those official rows deliberately inherit
# the legacy gold plane rather than one of the legacy promoted-piece planes.
LEGACY_BOARD_PLANE = {
    "P": 0,
    "L": 1,
    "N": 2,
    "S": 3,
    "G": 4,
    "B": 5,
    "R": 6,
    "H": 12,
    "D": 13,
}

LEGACY_COMPONENTS = (
    ("w1_board", "h", LEGACY_BOARD_FEATURES * H1, (LEGACY_BOARD_FEATURES, H1)),
    ("w1_hand", "h", LEGACY_HAND_FEATURES * H1, (LEGACY_HAND_FEATURES, H1)),
    ("b1", "i", H1, (H1,)),
    ("w2", "h", H2 * H1, (H2, H1)),
    ("b2", "i", H2, (H2,)),
    ("w3", "h", H2, (H2,)),
    ("b3", "i", 1, (1,)),
)

EXPORT_COMPONENTS = (
    ("w1", "h"),
    ("b1", "i"),
    ("w2", "h"),
    ("b2", "i"),
    ("w3", "h"),
    ("b3", "i"),
    ("w4", "h"),
    ("b4", "i"),
)

SINGLE_EXPORT_COMPONENTS = (
    ("w1", "h"),
    ("b1", "i"),
    ("w2", "h"),
    ("b2", "i"),
    ("w3", "h"),
    ("b3", "i"),
)

TOPOLOGIES = ("dual", "single")


def _flip_square(square: int) -> int:
    return NUM_SQUARES - 1 - square


def _halfkp_index(king_square: int, bona_piece: int) -> int:
    if not 0 <= king_square < NUM_SQUARES:
        raise ValueError("king square is outside the board")
    if not 0 <= bona_piece < FE_END:
        raise ValueError("BonaPiece is outside the pinned feature range")
    return king_square * FE_END + bona_piece


@dataclass(frozen=True)
class ParsedHalfKP:
    """One SFEN encoded in side-to-move, then opponent, perspective order."""

    halfkp: tuple[tuple[int, ...], tuple[int, ...]]
    bona_pieces: tuple[tuple[int, ...], tuple[int, ...]]
    king_squares: tuple[int, int]
    perspective_black: tuple[bool, bool]
    black_to_move: bool
    missing_pieces: int


def _parse_board(board_text: str):
    ranks = board_text.split("/")
    if len(ranks) != 9:
        raise ValueError("SFEN board must contain exactly nine ranks")

    pieces: list[tuple[bool, str, str, int]] = []
    kings: dict[bool, list[int]] = {True: [], False: []}
    for rank, row in enumerate(ranks):
        file_number = 9
        offset = 0
        expanded = 0
        while offset < len(row):
            token = row[offset]
            if token.isdigit():
                if token == "0":
                    raise ValueError("SFEN empty-square run cannot be zero")
                run = int(token)
                file_number -= run
                expanded += run
                offset += 1
                continue

            promoted = token == "+"
            if promoted:
                offset += 1
                if offset >= len(row):
                    raise ValueError("SFEN promotion marker has no piece")
                token = row[offset]
            upper = token.upper()
            if upper not in "PLNSGBRK":
                raise ValueError(f"unsupported SFEN board piece: {token!r}")
            if promoted and upper not in "PLNSBR":
                raise ValueError(f"piece {token!r} cannot be promoted")
            if not 1 <= file_number <= 9:
                raise ValueError("SFEN rank expands beyond nine squares")

            owner_black = token.isupper()
            square = (file_number - 1) * 9 + rank
            if upper == "K":
                kings[owner_black].append(square)
            else:
                if promoted and upper in "PLNS":
                    board_kind = "G"
                elif promoted and upper == "B":
                    board_kind = "H"
                elif promoted and upper == "R":
                    board_kind = "D"
                else:
                    board_kind = upper
                pieces.append((owner_black, upper, board_kind, square))
            file_number -= 1
            expanded += 1
            offset += 1
        if expanded != 9 or file_number != 0:
            raise ValueError(f"SFEN rank {rank + 1} does not expand to nine squares")

    for owner_black, owner_kings in kings.items():
        if len(owner_kings) != 1:
            color = "black" if owner_black else "white"
            raise ValueError(f"SFEN must contain exactly one {color} king")
    return pieces, {color: squares[0] for color, squares in kings.items()}


def _parse_hands(hand_text: str) -> list[tuple[bool, str, int]]:
    if hand_text == "-":
        return []
    result: list[tuple[bool, str, int]] = []
    offset = 0
    while offset < len(hand_text):
        number_start = offset
        while offset < len(hand_text) and hand_text[offset].isdigit():
            offset += 1
        count_text = hand_text[number_start:offset]
        if offset >= len(hand_text):
            raise ValueError("SFEN hand count has no piece")
        token = hand_text[offset]
        upper = token.upper()
        if upper not in HAND_ORDER:
            raise ValueError(f"unsupported SFEN hand piece: {token!r}")
        if count_text.startswith("0"):
            raise ValueError("SFEN hand count cannot start with zero")
        count = int(count_text) if count_text else 1
        if count <= 0:
            raise ValueError("SFEN hand count must be positive")
        result.append((token.isupper(), upper, count))
        offset += 1
    return result


def parse_sfen_bonapiece_halfkp(sfen: str) -> ParsedHalfKP:
    """Encode SFEN with the pinned default YaneuraOu BonaPiece semantics.

    A normal full-inventory position produces 38 non-king active features in
    each perspective.  Handicap/missing inventory is represented explicitly by
    repeated ``BONA_ZERO`` entries, matching ``EvalList::clear()``; excess
    inventory, malformed kings, or invalid SFEN fails closed.
    """

    if not isinstance(sfen, str):
        raise TypeError("sfen must be text")
    fields = sfen.split()
    if len(fields) not in (3, 4):
        raise ValueError("SFEN must contain three or four fields")
    board_text, turn_text, hand_text = fields[:3]
    if turn_text not in ("b", "w"):
        raise ValueError("SFEN turn must be 'b' or 'w'")
    if len(fields) == 4 and (not fields[3].isdigit() or int(fields[3]) <= 0):
        raise ValueError("SFEN move number must be a positive integer")

    board_pieces, kings = _parse_board(board_text)
    hands = _parse_hands(hand_text)

    inventory_counts = {kind: 0 for kind in INVENTORY}
    for _owner, inventory_kind, _board_kind, _square in board_pieces:
        inventory_counts[inventory_kind] += 1
    hand_counts: dict[tuple[bool, str], int] = {}
    for owner_black, kind, count in hands:
        key = (owner_black, kind)
        if key in hand_counts:
            raise ValueError(f"SFEN hand repeats {kind} for one color")
        hand_counts[key] = count
        inventory_counts[kind] += count

    for kind, maximum in INVENTORY.items():
        if inventory_counts[kind] > maximum:
            raise ValueError(
                f"SFEN has too many {kind} pieces: {inventory_counts[kind]} > {maximum}"
            )
    missing = sum(INVENTORY[kind] - inventory_counts[kind] for kind in INVENTORY)

    absolute_bona: dict[bool, list[int]] = {True: [], False: []}
    for perspective_black in (True, False):
        view = absolute_bona[perspective_black]
        for owner_black, _inventory_kind, board_kind, square in board_pieces:
            friend = owner_black == perspective_black
            base = BOARD_BASES[board_kind][0 if friend else 1]
            local_square = square if perspective_black else _flip_square(square)
            view.append(base + local_square)
        for owner_black in (True, False):
            for kind in HAND_ORDER:
                count = hand_counts.get((owner_black, kind), 0)
                friend = owner_black == perspective_black
                base = HAND_BASES[kind][0 if friend else 1]
                view.extend(base + slot for slot in range(count))
        view.extend([BONA_ZERO] * missing)
        view.sort()
        if len(view) != NON_KING_PIECES:
            raise AssertionError(
                f"internal inventory mismatch: {len(view)} != {NON_KING_PIECES}"
            )
        if any(not 0 <= value < FE_END for value in view):
            raise AssertionError("internal BonaPiece value escaped the pinned range")

    black_to_move = turn_text == "b"
    perspective_black = (black_to_move, not black_to_move)
    bona_views = tuple(tuple(absolute_bona[color]) for color in perspective_black)
    king_views = tuple(
        kings[color] if color else _flip_square(kings[color])
        for color in perspective_black
    )
    halfkp_views = tuple(
        tuple(_halfkp_index(king_square, bona) for bona in bona_view)
        for king_square, bona_view in zip(king_views, bona_views)
    )
    return ParsedHalfKP(
        halfkp=halfkp_views,  # type: ignore[arg-type]
        bona_pieces=bona_views,  # type: ignore[arg-type]
        king_squares=king_views,  # type: ignore[arg-type]
        perspective_black=perspective_black,
        black_to_move=black_to_move,
        missing_pieces=missing,
    )


def cp_sigmoid_target(cp: float, k_sigmoid: float) -> float:
    scaled = cp / k_sigmoid
    if scaled >= 0:
        return 1.0 / (1.0 + math.exp(-scaled))
    exp_scaled = math.exp(scaled)
    return exp_scaled / (1.0 + exp_scaled)


def probability_loss(
    logits: torch.Tensor,
    targets: torch.Tensor,
    power: float,
    *,
    reduction: str = "mean",
) -> torch.Tensor:
    """NNUE probability-space |prediction-target|**power objective.

    ``power=2.0`` deliberately dispatches to the historical MSE operation so
    the default is backward-compatible, while 2.6 can reproduce the commonly
    documented nnue-pytorch loss exponent comparison.
    """

    if type(power) not in (int, float) or not math.isfinite(power) or power < 1:
        raise ValueError("loss power must be finite and at least 1")
    if reduction not in ("mean", "sum", "none"):
        raise ValueError("loss reduction must be mean, sum, or none")
    probabilities = torch.sigmoid(logits)
    if float(power) == 2.0:
        return F.mse_loss(probabilities, targets, reduction=reduction)
    values = torch.abs(probabilities - targets).pow(power)
    if reduction == "mean":
        return values.mean()
    if reduction == "sum":
        return values.sum()
    return values


def _finite_number(value, name: str) -> float:
    if type(value) not in (int, float) or not math.isfinite(float(value)):
        raise ValueError(f"{name} must be a finite number")
    return float(value)


@dataclass(frozen=True)
class LoadedTeacherData:
    features: torch.Tensor
    targets: torch.Tensor
    cps: torch.Tensor
    rows: int
    outcome_rows: int
    input_rows: int
    skipped_rows: int
    skipped_json_rows: int
    skipped_sfen_rows: int
    bytes: int
    sha256: str


def _reject_json_constant(value: str):
    raise ValueError(f"non-standard JSON constant: {value}")


def load_teacher_jsonl(
    path: str,
    *,
    k_sigmoid: float = 600.0,
    cp_clamp: int = 3000,
    wdl_mix: float = 0.0,
    limit: int = 0,
    skip_malformed: bool = False,
) -> LoadedTeacherData:
    """Load teacher JSONL, optionally skipping only malformed JSON/SFEN rows.

    The default remains strictly fail-closed.  Even with ``skip_malformed``, a
    parsed row with an invalid/missing CP or outcome is never skipped: it is a
    teacher-label integrity failure and still aborts the load.
    """

    if not math.isfinite(k_sigmoid) or k_sigmoid <= 0:
        raise ValueError("k_sigmoid must be finite and positive")
    if type(cp_clamp) is not int or cp_clamp <= 0:
        raise ValueError("cp_clamp must be a positive integer")
    if not math.isfinite(wdl_mix) or not 0.0 <= wdl_mix <= 1.0:
        raise ValueError("wdl_mix must be finite and in [0, 1]")
    if type(limit) is not int or limit < 0:
        raise ValueError("limit must be a non-negative integer")
    if type(skip_malformed) is not bool:
        raise ValueError("skip_malformed must be a boolean")

    features: list[tuple[tuple[int, ...], tuple[int, ...]]] = []
    targets: list[float] = []
    cps: list[float] = []
    outcome_rows = 0
    input_rows = 0
    skipped_json_rows = 0
    skipped_sfen_rows = 0
    digest = hashlib.sha256()
    byte_count = 0
    with open(path, "rb") as source:
        for line_number, raw in enumerate(source, start=1):
            input_rows = line_number
            digest.update(raw)
            byte_count += len(raw)
            if not raw.strip():
                if skip_malformed:
                    skipped_json_rows += 1
                    continue
                raise ValueError(f"line {line_number}: blank JSONL row")
            if limit and len(features) >= limit:
                continue
            decoded = None
            try:
                decoded = raw.decode("utf-8", errors="strict")
                record = json.loads(
                    decoded,
                    parse_constant=_reject_json_constant,
                )
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
                if skip_malformed:
                    # JSON NaN/Infinity in a teacher label is not allowed to
                    # masquerade as a skippable syntax error. Decode that one
                    # narrow case so the CP/outcome validator below aborts.
                    if (
                        decoded is not None
                        and str(error).startswith("non-standard JSON constant:")
                    ):
                        try:
                            relaxed = json.loads(decoded)
                        except (json.JSONDecodeError, ValueError):
                            relaxed = None
                        bad_label_constant = isinstance(relaxed, dict) and any(
                            type(relaxed.get(name)) is float
                            and not math.isfinite(relaxed[name])
                            for name in ("cp", "outcome")
                        )
                        if bad_label_constant:
                            record = relaxed
                        else:
                            skipped_json_rows += 1
                            continue
                    else:
                        skipped_json_rows += 1
                        continue
                else:
                    raise ValueError(
                        f"line {line_number}: invalid strict JSON: {error}"
                    ) from error
            if not isinstance(record, dict):
                if skip_malformed:
                    skipped_json_rows += 1
                    continue
                raise ValueError(f"line {line_number}: row must be an object")
            try:
                encoded = parse_sfen_bonapiece_halfkp(record.get("sfen"))
            except (TypeError, ValueError):
                if skip_malformed:
                    skipped_sfen_rows += 1
                    continue
                raise
            # CP/outcome validation intentionally sits outside every skip
            # catch. A syntactically valid position must retain its label or
            # fail the whole run; it must never disappear silently.
            cp = _finite_number(record.get("cp"), f"line {line_number}: cp")
            cp = max(-cp_clamp, min(cp_clamp, cp))
            target = cp_sigmoid_target(cp, k_sigmoid)
            if "outcome" in record:
                outcome = _finite_number(
                    record["outcome"], f"line {line_number}: outcome"
                )
                if outcome not in (0.0, 0.5, 1.0):
                    raise ValueError(
                        f"line {line_number}: outcome must be one of 0, 0.5, 1"
                    )
                outcome_rows += 1
                if wdl_mix:
                    target = (1.0 - wdl_mix) * target + wdl_mix * outcome
            features.append(encoded.halfkp)
            targets.append(target)
            cps.append(cp)
    if not features:
        raise ValueError(f"teacher dataset is empty: {path}")
    return LoadedTeacherData(
        features=torch.tensor(features, dtype=torch.int32),
        targets=torch.tensor(targets, dtype=torch.float32),
        cps=torch.tensor(cps, dtype=torch.float32),
        rows=len(features),
        outcome_rows=outcome_rows,
        input_rows=input_rows,
        skipped_rows=skipped_json_rows + skipped_sfen_rows,
        skipped_json_rows=skipped_json_rows,
        skipped_sfen_rows=skipped_sfen_rows,
        bytes=byte_count,
        sha256=digest.hexdigest(),
    )


class BonaPieceHalfKPNet(nn.Module):
    """Shared HalfKP transformer with a dual or STM-only dense topology.

    ``dual`` remains the default and preserves the original research model's
    module construction and state-dict layout.  ``single`` deliberately uses
    only the first (side-to-move) view and retains the current repository
    evaluator's 256 -> 32 -> 1 dense shape for search-speed research.
    """

    def __init__(self, topology: str = "dual"):
        super().__init__()
        if topology not in TOPOLOGIES:
            raise ValueError(f"topology must be one of {', '.join(TOPOLOGIES)}")
        self.topology = topology
        self.transform = nn.EmbeddingBag(HALFKP_DIM, H1, mode="sum")
        self.b1 = nn.Parameter(torch.zeros(H1))
        if topology == "dual":
            self.l2 = nn.Linear(H1 * 2, H2)
            self.l3 = nn.Linear(H2, H3)
            self.l4 = nn.Linear(H3, 1)
        else:
            self.l2 = nn.Linear(H1, H2)
            self.l3 = nn.Linear(H2, 1)

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        if features.ndim != 3 or tuple(features.shape[1:]) != (2, NON_KING_PIECES):
            raise ValueError(
                f"features must have shape (N,2,{NON_KING_PIECES}), got {tuple(features.shape)}"
            )
        batch = features.shape[0]
        if self.topology == "dual":
            transformed = self.transform(features.reshape(batch * 2, NON_KING_PIECES))
            transformed = torch.clamp(transformed + self.b1, 0.0, 1.0)
            transformed = transformed.reshape(batch, H1 * 2)
            hidden2 = torch.clamp(self.l2(transformed), 0.0, 1.0)
            hidden3 = torch.clamp(self.l3(hidden2), 0.0, 1.0)
            return self.l4(hidden3).squeeze(-1)

        # parse_sfen_bonapiece_halfkp always orders views as side-to-move,
        # opponent.  The single topology intentionally ignores the latter.
        transformed = self.transform(features[:, 0, :])
        transformed = torch.clamp(transformed + self.b1, 0.0, 1.0)
        hidden2 = torch.clamp(self.l2(transformed), 0.0, 1.0)
        return self.l3(hidden2).squeeze(-1)


def _read_legacy_array(
    payload: bytes, offset: int, typecode: str, count: int, shape: tuple[int, ...]
) -> tuple[torch.Tensor, int]:
    values = array.array(typecode)
    itemsize = 2 if typecode == "h" else 4 if typecode == "i" else 0
    if not itemsize or values.itemsize != itemsize:
        raise RuntimeError(f"unsupported legacy component typecode: {typecode!r}")
    end = offset + count * itemsize
    values.frombytes(payload[offset:end])
    if sys.byteorder == "big":
        values.byteswap()
    dtype = torch.int16 if typecode == "h" else torch.int32
    return torch.tensor(values, dtype=dtype).reshape(shape), end


def load_legacy_custom_weights(path: str) -> tuple[dict[str, torch.Tensor], dict]:
    """Strictly parse the current 1,185,988-byte headerless legacy layout."""

    if not isinstance(path, str) or not path:
        raise ValueError("legacy weights path must be non-empty text")
    with open(path, "rb") as source:
        payload = source.read()
    if len(payload) != LEGACY_EXPORT_BYTES:
        raise ValueError(
            f"legacy weights must be exactly {LEGACY_EXPORT_BYTES} bytes, got {len(payload)}"
        )
    components = {}
    offset = 0
    for name, typecode, count, shape in LEGACY_COMPONENTS:
        components[name], offset = _read_legacy_array(
            payload, offset, typecode, count, shape
        )
    if offset != len(payload):
        raise AssertionError(f"legacy layout consumed {offset} of {len(payload)} bytes")
    return components, {
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "format": "shogi-distill-v1-headerless",
    }


@torch.no_grad()
def semantic_warm_initialize_from_legacy(
    model: BonaPieceHalfKPNet, path: str
) -> dict:
    """Deterministically lift the legacy quantized evaluator by feature meaning.

    This is intentionally not called an exact lift. The official default
    BonaPiece representation excludes kings and collapses promoted P/L/N/S,
    while the legacy custom planes included kings and separate promoted rows.
    """

    legacy, source = load_legacy_custom_weights(path)
    prototype = torch.zeros((FE_END, H1), dtype=model.transform.weight.dtype)

    legacy_board = legacy["w1_board"].to(prototype.dtype) / ACT_SCALE
    for kind, (friend_base, enemy_base) in BOARD_BASES.items():
        local_plane = LEGACY_BOARD_PLANE[kind]
        friend_start = local_plane * NUM_SQUARES
        enemy_start = (local_plane + 14) * NUM_SQUARES
        prototype[friend_base : friend_base + NUM_SQUARES].copy_(
            legacy_board[friend_start : friend_start + NUM_SQUARES]
        )
        prototype[enemy_base : enemy_base + NUM_SQUARES].copy_(
            legacy_board[enemy_start : enemy_start + NUM_SQUARES]
        )

    legacy_hand = legacy["w1_hand"].to(prototype.dtype) / ACT_SCALE
    for hand_index, kind in enumerate(HAND_ORDER):
        capacity = HAND_CAPACITY[kind]
        friend_base, enemy_base = HAND_BASES[kind]
        prototype[friend_base : friend_base + capacity].copy_(
            legacy_hand[hand_index].expand(capacity, -1)
        )
        prototype[enemy_base : enemy_base + capacity].copy_(
            legacy_hand[hand_index + 7].expand(capacity, -1)
        )

    # Each king bucket receives the same semantic board/hand prototype. BONA_ZERO
    # and every official gap stay exactly zero.
    for king_square in range(NUM_SQUARES):
        start = king_square * FE_END
        model.transform.weight[start : start + FE_END].copy_(prototype)
    model.b1.copy_(legacy["b1"].to(model.b1.dtype) / ACT_SCALE)

    model.l2.weight.zero_()
    model.l2.weight[:, :H1].copy_(
        legacy["w2"].to(model.l2.weight.dtype) / WEIGHT_SCALE
    )
    model.l2.bias.copy_(legacy["b2"].to(model.l2.bias.dtype) / OUTPUT_SCALE)
    if model.topology == "dual":
        model.l3.weight.copy_(
            torch.eye(H3, H2, dtype=model.l3.weight.dtype, device=model.l3.weight.device)
        )
        model.l3.bias.zero_()
        model.l4.weight.copy_(
            (legacy["w3"].to(model.l4.weight.dtype) / WEIGHT_SCALE).unsqueeze(0)
        )
        model.l4.bias.copy_(legacy["b3"].to(model.l4.bias.dtype) / OUTPUT_SCALE)
    else:
        # The STM-only topology has the same dense shape as the legacy live
        # evaluator, so W2 and the output copy directly with no identity layer.
        model.l3.weight.copy_(
            (legacy["w3"].to(model.l3.weight.dtype) / WEIGHT_SCALE).unsqueeze(0)
        )
        model.l3.bias.copy_(legacy["b3"].to(model.l3.bias.dtype) / OUTPUT_SCALE)

    metadata = {
        "schema": "shogi-bonapiece-halfkp-semantic-warm-init-v1",
        "mode": "legacy-semantic-warm",
        "deterministic": True,
        "exact_lift": False,
        "source": source,
        "mapping": {
            "board": "legacy local 28-plane rows copied to every king bucket",
            "hand": "legacy linear hand row copied to each official count slot",
            "promoted_pawn_lance_knight_silver": "legacy gold plane",
            "opponent_dense_tail": "zero",
            "inserted_hidden_layer": "32x32 identity",
        },
        "non_exact_reasons": [
            "official default BonaPiece HalfKP excludes both kings but legacy custom board features included them",
            "official default BonaPiece collapses promoted P/L/N/S into gold while legacy custom planes distinguished them",
        ],
        "target_binary_layout_changed": False,
    }
    if model.topology == "single":
        metadata = {
            "schema": "shogi-bonapiece-halfkp-single-semantic-warm-init-v1",
            "mode": "legacy-semantic-warm",
            "topology": "single",
            "deterministic": True,
            "exact_lift": False,
            "source": source,
            "mapping": {
                "board": "legacy local 28-plane rows copied to every king bucket",
                "hand": "legacy linear hand row copied to each official count slot",
                "promoted_pawn_lance_knight_silver": "legacy gold plane",
                "dense": "legacy W2 and output copied directly",
                "inserted_hidden_layer": False,
            },
            "non_exact_reasons": list(metadata["non_exact_reasons"]),
            "target_binary_layout_changed": True,
        }
    return metadata


def select_device(requested: str) -> torch.device:
    if requested == "auto":
        requested = "mps" if torch.backends.mps.is_available() else "cpu"
    if requested == "mps" and not torch.backends.mps.is_available():
        raise ValueError("MPS was requested but is unavailable")
    if requested not in ("mps", "cpu"):
        raise ValueError("device must be auto, mps, or cpu")
    return torch.device(requested)


def seed_everything(seed: int) -> None:
    if type(seed) is not int or seed < 0:
        raise ValueError("seed must be a non-negative integer")
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.backends.mps.is_available():
        torch.mps.manual_seed(seed)


def _quantize_weight(value: torch.Tensor, scale: int) -> torch.Tensor:
    if not bool(torch.isfinite(value).all()):
        raise ValueError("cannot export non-finite weights")
    return torch.round(value.detach().cpu() * scale).clamp(-32768, 32767).to(torch.int16)


def _quantize_bias(value: torch.Tensor, scale: int) -> torch.Tensor:
    if not bool(torch.isfinite(value).all()):
        raise ValueError("cannot export non-finite biases")
    source = value.detach().cpu()
    # Preserve the repository fixed-point contract's float32 operation order.
    # A single multiplication by 8128 can round a boundary value differently.
    scaled = (
        source * ACT_SCALE * WEIGHT_SCALE
        if scale == OUTPUT_SCALE
        else source * scale
    )
    rounded = torch.round(scaled)
    if rounded.numel() and (
        int(rounded.min()) < -(2**31) or int(rounded.max()) > 2**31 - 1
    ):
        raise OverflowError("quantized bias exceeds int32")
    return rounded.to(torch.int32)


@torch.no_grad()
def quantize_research_model(model: BonaPieceHalfKPNet) -> dict[str, torch.Tensor]:
    quantized = {
        "w1": _quantize_weight(model.transform.weight, ACT_SCALE),
        "b1": _quantize_bias(model.b1, ACT_SCALE),
        "w2": _quantize_weight(model.l2.weight, WEIGHT_SCALE),
        "b2": _quantize_bias(model.l2.bias, OUTPUT_SCALE),
        "w3": _quantize_weight(model.l3.weight, WEIGHT_SCALE),
        "b3": _quantize_bias(model.l3.bias, OUTPUT_SCALE),
    }
    if model.topology == "dual":
        quantized["w4"] = _quantize_weight(
            model.l4.weight.squeeze(0), WEIGHT_SCALE
        )
        quantized["b4"] = _quantize_bias(model.l4.bias, OUTPUT_SCALE)
    else:
        quantized["w3"] = quantized["w3"].squeeze(0)
    return quantized


def _require_int32(value: torch.Tensor, name: str) -> torch.Tensor:
    if value.numel() and (
        int(value.min()) < -(2**31) or int(value.max()) > 2**31 - 1
    ):
        raise OverflowError(f"{name} exceeds the signed int32 accumulator range")
    return value


@torch.no_grad()
def research_int16_forward(
    quantized: dict[str, torch.Tensor],
    features: torch.Tensor,
    topology: str = "dual",
) -> torch.Tensor:
    """Bit-level CPU reference for the exported research layout.

    Results are integer logits scaled by ``OUTPUT_SCALE``.  Accumulation uses
    int64 only to detect, rather than silently wrap, deployed int32 overflow.
    Right shifts are signed arithmetic shifts.
    """

    if topology not in TOPOLOGIES:
        raise ValueError(f"topology must be one of {', '.join(TOPOLOGIES)}")
    if features.ndim != 3 or tuple(features.shape[1:]) != (2, NON_KING_PIECES):
        raise ValueError(
            f"features must have shape (N,2,{NON_KING_PIECES}), got {tuple(features.shape)}"
        )
    indices = features.detach().cpu().to(torch.long)
    if indices.numel() and (
        int(indices.min()) < 0 or int(indices.max()) >= HALFKP_DIM
    ):
        raise ValueError("HalfKP feature index is out of range")
    expected = (
        {
            "w1": (HALFKP_DIM, H1),
            "b1": (H1,),
            "w2": (H2, H1 * 2),
            "b2": (H2,),
            "w3": (H3, H2),
            "b3": (H3,),
            "w4": (H3,),
            "b4": (1,),
        }
        if topology == "dual"
        else {
            "w1": (HALFKP_DIM, H1),
            "b1": (H1,),
            "w2": (H2, H1),
            "b2": (H2,),
            "w3": (H2,),
            "b3": (1,),
        }
    )
    for name, shape in expected.items():
        if name not in quantized or tuple(quantized[name].shape) != shape:
            raise ValueError(f"{name} must have shape {shape}")

    batch = indices.shape[0]
    w1 = quantized["w1"].to(torch.int64)
    selected_indices = (
        indices.reshape(batch * 2, NON_KING_PIECES)
        if topology == "dual"
        else indices[:, 0, :]
    )
    acc1 = w1[selected_indices].sum(dim=1)
    acc1 = _require_int32(acc1 + quantized["b1"].to(torch.int64), "acc1")
    h1 = torch.clamp(acc1, 0, ACT_SCALE).reshape(
        batch, H1 * (2 if topology == "dual" else 1)
    )

    acc2 = h1 @ quantized["w2"].to(torch.int64).transpose(0, 1)
    acc2 = _require_int32(acc2 + quantized["b2"].to(torch.int64), "acc2")
    h2 = torch.clamp(torch.bitwise_right_shift(acc2, 6), 0, ACT_SCALE)

    if topology == "single":
        output = h2 @ quantized["w3"].to(torch.int64)
        return _require_int32(
            output + quantized["b3"].to(torch.int64)[0], "output"
        )

    acc3 = h2 @ quantized["w3"].to(torch.int64).transpose(0, 1)
    acc3 = _require_int32(acc3 + quantized["b3"].to(torch.int64), "acc3")
    h3 = torch.clamp(torch.bitwise_right_shift(acc3, 6), 0, ACT_SCALE)

    output = h3 @ quantized["w4"].to(torch.int64)
    return _require_int32(output + quantized["b4"].to(torch.int64)[0], "output")


def expected_research_export_bytes(topology: str = "dual") -> int:
    if topology not in TOPOLOGIES:
        raise ValueError(f"topology must be one of {', '.join(TOPOLOGIES)}")
    if topology == "single":
        return (
            HALFKP_DIM * H1 * 2
            + H1 * 4
            + H2 * H1 * 2
            + H2 * 4
            + H2 * 2
            + 4
        )
    return (
        HALFKP_DIM * H1 * 2
        + H1 * 4
        + H2 * (H1 * 2) * 2
        + H2 * 4
        + H3 * H2 * 2
        + H3 * 4
        + H3 * 2
        + 4
    )


def _write_tensor_le(target, tensor: torch.Tensor, typecode: str) -> None:
    flat = tensor.detach().cpu().contiguous().view(-1)
    for start in range(0, flat.numel(), 262_144):
        values = array.array(typecode, flat[start : start + 262_144].tolist())
        if sys.byteorder == "big":
            values.byteswap()
        target.write(values.tobytes())


def export_research_weights(
    model: BonaPieceHalfKPNet,
    out_dir: str,
    k_sigmoid: float,
    initialization: dict | None = None,
    data: dict | None = None,
) -> dict:
    """Write the isolated raw research format plus an explicit metadata sidecar."""

    os.makedirs(out_dir, exist_ok=True)
    quantized = quantize_research_model(model)
    single = model.topology == "single"
    stem = (
        "bonapiece-halfkp-single-research.weights"
        if single
        else "bonapiece-halfkp-research.weights"
    )
    weight_path = os.path.join(out_dir, f"{stem}.bin")
    with open(weight_path, "wb") as target:
        components = SINGLE_EXPORT_COMPONENTS if single else EXPORT_COMPONENTS
        for name, typecode in components:
            _write_tensor_le(target, quantized[name], typecode)
    byte_count = os.path.getsize(weight_path)
    expected = expected_research_export_bytes(model.topology)
    if byte_count != expected:
        raise RuntimeError(f"research export size mismatch: {byte_count} != {expected}")
    with open(weight_path, "rb") as source:
        weight_sha256 = hashlib.sha256(source.read()).hexdigest()

    if not single:
        # Keep the original dual metadata byte-for-byte stable.
        metadata = {
            "format": "shogi-distill-research-v1-bonapiece-halfkp",
            "production_compatible": False,
            "yaneuraou_nnue_file": False,
            "source_revision": SOURCE_REVISION,
            "source_urls": list(SOURCE_URLS),
            "distinguish_golds": False,
            "fe_hand_end": FE_HAND_END,
            "fe_end": FE_END,
            "halfkp_dimensions": HALFKP_DIM,
            "active_features_per_perspective": NON_KING_PIECES,
            "dimensions": {"h1": H1, "perspectives": 2, "h2": H2, "h3": H3, "out": 1},
            "scales": {"activation": ACT_SCALE, "dense_weight": WEIGHT_SCALE},
            "k_sigmoid": k_sigmoid,
            "cp_formula": f"cp = out_q * {k_sigmoid} / {OUTPUT_SCALE}",
            "layout": [
                f"w1 int16 x {HALFKP_DIM}*{H1} (feature-major, shared perspectives)",
                f"b1 int32 x {H1}",
                f"w2 int16 x {H2}*{H1 * 2} (row-major)",
                f"b2 int32 x {H2}",
                f"w3 int16 x {H3}*{H2} (row-major)",
                f"b3 int32 x {H3}",
                f"w4 int16 x {H3}",
                "b4 int32 x 1",
            ],
            "weights": {"bytes": byte_count, "sha256": weight_sha256},
            "initialization": initialization,
        }
    else:
        metadata = {
            "format": "shogi-distill-research-v1-bonapiece-halfkp-single",
            "runtime_selector": 84,
            "topology": "single-perspective-side-to-move",
            "feature_semantics": "yaneuraou-default-bonapiece-halfkp",
            "nonstandard_topology": True,
            "production_compatible": False,
            "yaneuraou_nnue_file": False,
            "notices": [
                "Official default BonaPiece feature semantics are used with a nonstandard side-to-move-only network.",
                "This headerless research artifact is not a YaneuraOu .nnue file.",
            ],
            "source_revision": SOURCE_REVISION,
            "source_urls": list(SOURCE_URLS),
            "distinguish_golds": False,
            "fe_hand_end": FE_HAND_END,
            "fe_end": FE_END,
            "halfkp_dimensions": HALFKP_DIM,
            "active_features": NON_KING_PIECES,
            "perspective_order": "side-to-move only",
            "dimensions": {"h1": H1, "perspectives": 1, "h2": H2, "out": 1},
            "scales": {"activation": ACT_SCALE, "dense_weight": WEIGHT_SCALE},
            "k_sigmoid": k_sigmoid,
            "cp_formula": f"cp = out_q * {k_sigmoid} / {OUTPUT_SCALE}",
            "layout": [
                f"w1 int16 x {HALFKP_DIM}*{H1} (feature-major)",
                f"b1 int32 x {H1}",
                f"w2 int16 x {H2}*{H1} (row-major)",
                f"b2 int32 x {H2}",
                f"w3 int16 x {H2}",
                "b3 int32 x 1",
            ],
            "weights": {"bytes": byte_count, "sha256": weight_sha256},
            "initialization": initialization,
        }
    if data is not None:
        if not isinstance(data, dict):
            raise ValueError("export data metadata must be an object")
        metadata["data"] = data
    metadata_path = os.path.join(out_dir, f"{stem}.meta.json")
    with open(metadata_path, "w", encoding="utf-8", newline="\n") as target:
        json.dump(metadata, target, ensure_ascii=False, indent=2, sort_keys=True)
        target.write("\n")
    return metadata


def _atomic_torch_save(value, path: str) -> None:
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".checkpoint-", suffix=".pt", dir=directory)
    os.close(descriptor)
    try:
        torch.save(value, temporary)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _checkpoint_topology(checkpoint, action: str) -> str:
    if (
        not isinstance(checkpoint, dict)
        or checkpoint.get("schema")
        != "shogi-bonapiece-halfkp-training-checkpoint-v1"
    ):
        raise ValueError(f"{action} checkpoint has an incompatible schema")
    architecture = checkpoint.get("architecture")
    if not isinstance(architecture, dict):
        raise ValueError(f"{action} checkpoint is missing architecture metadata")
    topology = architecture.get("topology", "dual")
    if topology not in TOPOLOGIES:
        raise ValueError(f"{action} checkpoint has an incompatible topology")
    return topology


@torch.no_grad()
def evaluate(
    model: BonaPieceHalfKPNet,
    data: LoadedTeacherData,
    device: torch.device,
    batch_size: int,
    k_sigmoid: float,
    loss_power: float,
) -> tuple[float, float, float]:
    model.eval()
    outputs = []
    total_loss = 0.0
    for start in range(0, data.rows, batch_size):
        stop = min(start + batch_size, data.rows)
        features = data.features[start:stop].to(device=device, dtype=torch.long)
        targets = data.targets[start:stop].to(device)
        logits = model(features)
        total_loss += probability_loss(
            logits, targets, loss_power, reduction="sum"
        ).item()
        outputs.append(logits.cpu())
    logits = torch.cat(outputs)
    mae_cp = torch.mean(torch.abs(logits * k_sigmoid - data.cps)).item()
    half = data.rows // 2
    if half:
        left = torch.arange(half)
        right = torch.arange(data.rows - 1, data.rows - half - 1, -1)
        delta = data.cps[left] - data.cps[right]
        selected = torch.abs(delta) >= 100
        if bool(selected.any()):
            predicted = logits[left] - logits[right]
            pair_acc = float(((predicted[selected] * delta[selected]) > 0).float().mean())
        else:
            pair_acc = float("nan")
    else:
        pair_acc = float("nan")
    return total_loss / data.rows, mae_cp, pair_acc


def _loaded_data_metadata(
    data: LoadedTeacherData, *, skip_malformed: bool
) -> dict:
    return {
        "rows": data.rows,
        "loaded_rows": data.rows,
        "skipped_rows": data.skipped_rows,
        "skipped_json_rows": data.skipped_json_rows,
        "skipped_sfen_rows": data.skipped_sfen_rows,
        "input_rows": data.input_rows,
        "outcome_rows": data.outcome_rows,
        "bytes": data.bytes,
        "sha256": data.sha256,
        "malformed_policy": (
            "skip-json-sfen-only" if skip_malformed else "fail-closed"
        ),
    }


def train(args) -> None:
    seed_everything(args.seed)
    device = select_device(args.device)
    train_data = load_teacher_jsonl(
        args.train_data,
        k_sigmoid=args.k,
        cp_clamp=args.cp_clamp,
        wdl_mix=args.wdl_mix,
        limit=args.limit,
        skip_malformed=args.skip_malformed,
    )
    val_data = load_teacher_jsonl(
        args.val_data,
        k_sigmoid=args.k,
        cp_clamp=args.cp_clamp,
        wdl_mix=args.wdl_mix,
        limit=args.val_limit,
        skip_malformed=args.skip_malformed,
    )
    data_metadata = {
        "train": _loaded_data_metadata(
            train_data, skip_malformed=args.skip_malformed
        ),
        "val": _loaded_data_metadata(
            val_data, skip_malformed=args.skip_malformed
        ),
    }
    print(
        f"[bonapiece] device={device} train_loaded={train_data.rows} "
        f"train_skipped={train_data.skipped_rows} "
        f"(json={train_data.skipped_json_rows},sfen={train_data.skipped_sfen_rows}) "
        f"val_loaded={val_data.rows} val_skipped={val_data.skipped_rows} "
        f"(json={val_data.skipped_json_rows},sfen={val_data.skipped_sfen_rows}) "
        f"wdl_rows={train_data.outcome_rows}/{train_data.rows} "
        f"malformed_policy={data_metadata['train']['malformed_policy']}"
    )

    model = BonaPieceHalfKPNet(args.topology)
    if args.resume:
        initialization = None
        print(f"[bonapiece] initialization=resume checkpoint={args.resume}")
    elif args.init_mode == "legacy-semantic-warm":
        initialization = semantic_warm_initialize_from_legacy(
            model, args.legacy_weights
        )
        print(
            "[bonapiece] initialization=legacy-semantic-warm exact_lift=false "
            "(official representation excludes kings and collapses promoted P/L/N/S)"
        )
    else:
        initialization = (
            {
                "schema": "shogi-bonapiece-halfkp-scratch-init-v1",
                "mode": "scratch",
                "seed": args.seed,
                "deterministic_seeded_initialization": True,
            }
            if args.topology == "dual"
            else {
                "schema": "shogi-bonapiece-halfkp-single-scratch-init-v1",
                "mode": "scratch",
                "topology": "single",
                "seed": args.seed,
                "deterministic_seeded_initialization": True,
            }
        )
        print(f"[bonapiece] initialization=scratch seed={args.seed}")
    model = model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    start_epoch = 0
    if args.resume:
        checkpoint = torch.load(args.resume, map_location=device, weights_only=True)
        checkpoint_topology = _checkpoint_topology(checkpoint, "resume")
        if checkpoint_topology != args.topology:
            raise ValueError(
                f"resume checkpoint topology is {checkpoint_topology}, "
                f"not requested {args.topology}"
            )
        model.load_state_dict(checkpoint["model"])
        optimizer.load_state_dict(checkpoint["optimizer"])
        start_epoch = int(checkpoint["epoch"])
        initialization = checkpoint.get("initialization")
        if not isinstance(initialization, dict):
            raise ValueError("resume checkpoint is missing initialization metadata")

    os.makedirs(args.out, exist_ok=True)
    curve_path = os.path.join(args.out, "curve.csv")
    if start_epoch == 0:
        with open(curve_path, "w", encoding="utf-8", newline="\n") as curve:
            curve.write("epoch,train_loss,val_loss,val_mae_cp,val_pair_acc,seconds\n")

    for epoch in range(start_epoch + 1, args.epochs + 1):
        started = time.time()
        model.train()
        generator = torch.Generator(device="cpu").manual_seed(args.seed + epoch)
        permutation = torch.randperm(train_data.rows, generator=generator)
        total_loss = 0.0
        for start in range(0, train_data.rows, args.batch):
            selected = permutation[start : start + args.batch]
            features = train_data.features[selected].to(device=device, dtype=torch.long)
            targets = train_data.targets[selected].to(device)
            logits = model(features)
            loss = probability_loss(logits, targets, args.loss_power)
            if not bool(torch.isfinite(loss)):
                raise RuntimeError("training produced a non-finite loss")
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * selected.numel()

        train_loss = total_loss / train_data.rows
        val_loss, val_mae, pair_acc = evaluate(
            model, val_data, device, args.eval_batch, args.k, args.loss_power
        )
        seconds = time.time() - started
        print(
            f"[bonapiece] epoch {epoch}/{args.epochs} train={train_loss:.6f} "
            f"val={val_loss:.6f} mae={val_mae:.1f}cp pair={pair_acc:.4f} "
            f"({seconds:.1f}s)"
        )
        with open(curve_path, "a", encoding="utf-8", newline="\n") as curve:
            curve.write(
                f"{epoch},{train_loss:.8f},{val_loss:.8f},{val_mae:.3f},"
                f"{pair_acc:.6f},{seconds:.3f}\n"
            )

        architecture = {
            "features": "yaneuraou-default-bonapiece-halfkp",
            "source_revision": SOURCE_REVISION,
            "fe_end": FE_END,
            "halfkp_dim": HALFKP_DIM,
            "active_features": NON_KING_PIECES,
            "layers": [256, 512, 32, 32, 1],
            "k": args.k,
        }
        if args.topology == "single":
            architecture = {
                "features": "yaneuraou-default-bonapiece-halfkp",
                "source_revision": SOURCE_REVISION,
                "topology": "single",
                "nonstandard_side_to_move_only": True,
                "yaneuraou_nnue_file": False,
                "fe_end": FE_END,
                "halfkp_dim": HALFKP_DIM,
                "active_features": NON_KING_PIECES,
                "layers": [256, 32, 1],
                "k": args.k,
            }
        checkpoint = {
            "schema": "shogi-bonapiece-halfkp-training-checkpoint-v1",
            "epoch": epoch,
            "model": model.state_dict(),
            "optimizer": optimizer.state_dict(),
            "metrics": {
                "train_loss": train_loss,
                "val_loss": val_loss,
                "val_mae_cp": val_mae,
                "val_pair_acc": pair_acc,
            },
            "architecture": architecture,
            "initialization": initialization,
            "data": data_metadata,
            "args": vars(args),
        }
        _atomic_torch_save(checkpoint, os.path.join(args.out, f"epoch-{epoch:03d}.pt"))

    if args.export:
        export_research_weights(
            model, args.out, args.k, initialization, data=data_metadata
        )


def build_argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-data")
    parser.add_argument("--val-data")
    parser.add_argument("--out", required=True)
    parser.add_argument(
        "--topology",
        choices=TOPOLOGIES,
        default="dual",
        help=(
            "dual preserves the standard two-perspective 512->32->32->1 "
            "research topology; single is a nonstandard side-to-move-only "
            "256->32->1 speed-preserving topology"
        ),
    )
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch", type=int, default=2048)
    parser.add_argument("--eval-batch", type=int, default=4096)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-5)
    parser.add_argument("--k", type=float, default=600.0)
    parser.add_argument("--cp-clamp", type=int, default=3000)
    parser.add_argument("--wdl-mix", type=float, default=0.0)
    parser.add_argument(
        "--loss-power",
        type=float,
        default=2.0,
        help="probability-space absolute-error exponent (2.0=MSE; compare 2.6)",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", choices=("auto", "mps", "cpu"), default="auto")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--val-limit", type=int, default=0)
    parser.add_argument(
        "--skip-malformed",
        action="store_true",
        help=(
            "explicitly skip and count only malformed JSON/SFEN rows; "
            "invalid CP/outcome labels still fail closed"
        ),
    )
    parser.add_argument("--resume", default="")
    parser.add_argument(
        "--init-mode",
        choices=("scratch", "legacy-semantic-warm"),
        default="scratch",
        help=(
            "scratch, or a deterministic non-exact semantic lift from the "
            "current 1,185,988-byte custom evaluator"
        ),
    )
    parser.add_argument(
        "--legacy-weights",
        default="",
        help=(
            "required with --init-mode legacy-semantic-warm; the lift is not "
            "exact because official BonaPiece excludes kings and collapses "
            "promoted P/L/N/S"
        ),
    )
    parser.add_argument("--export", action="store_true")
    parser.add_argument("--export-checkpoint", default="")
    return parser


def validate_training_arguments(args) -> None:
    """Fail closed before allocating the 125,388 x 256 parameter table."""

    if args.topology not in TOPOLOGIES:
        raise ValueError(f"topology must be one of {', '.join(TOPOLOGIES)}")
    if type(args.skip_malformed) is not bool:
        raise ValueError("skip-malformed must be a boolean")
    positive_integers = {
        "epochs": args.epochs,
        "batch": args.batch,
        "eval_batch": args.eval_batch,
        "cp_clamp": args.cp_clamp,
    }
    for name, value in positive_integers.items():
        if type(value) is not int or value <= 0:
            raise ValueError(f"{name.replace('_', '-')} must be a positive integer")
    for name in ("limit", "val_limit", "seed"):
        value = getattr(args, name)
        if type(value) is not int or value < 0:
            raise ValueError(f"{name.replace('_', '-')} must be a non-negative integer")
    if type(args.lr) not in (int, float) or not math.isfinite(args.lr) or args.lr <= 0:
        raise ValueError("lr must be finite and positive")
    if (
        type(args.weight_decay) not in (int, float)
        or not math.isfinite(args.weight_decay)
        or args.weight_decay < 0
    ):
        raise ValueError("weight-decay must be finite and non-negative")
    if type(args.k) not in (int, float) or not math.isfinite(args.k) or args.k <= 0:
        raise ValueError("k must be finite and positive")
    if (
        type(args.wdl_mix) not in (int, float)
        or not math.isfinite(args.wdl_mix)
        or not 0.0 <= args.wdl_mix <= 1.0
    ):
        raise ValueError("wdl-mix must be finite and in [0, 1]")
    if (
        type(args.loss_power) not in (int, float)
        or not math.isfinite(args.loss_power)
        or args.loss_power < 1
    ):
        raise ValueError("loss-power must be finite and at least 1")
    if args.init_mode == "legacy-semantic-warm" and not args.legacy_weights:
        raise ValueError(
            "--init-mode legacy-semantic-warm requires --legacy-weights"
        )
    if args.init_mode == "scratch" and args.legacy_weights:
        raise ValueError("--legacy-weights requires --init-mode legacy-semantic-warm")
    if args.resume and (
        args.init_mode != "scratch" or args.legacy_weights
    ):
        raise ValueError("--resume cannot be combined with a fresh warm initialization")


def main(argv: Iterable[str] | None = None) -> None:
    parser = build_argument_parser()
    args = parser.parse_args(argv)
    if args.export_checkpoint:
        checkpoint = torch.load(args.export_checkpoint, map_location="cpu", weights_only=True)
        try:
            checkpoint_topology = _checkpoint_topology(checkpoint, "export")
        except ValueError as error:
            parser.error(str(error))
        if args.topology != checkpoint_topology:
            parser.error(
                f"--topology {args.topology} does not match checkpoint "
                f"topology {checkpoint_topology}"
            )
        model = BonaPieceHalfKPNet(checkpoint_topology)
        model.load_state_dict(checkpoint["model"])
        k_sigmoid = float(checkpoint.get("architecture", {}).get("k", args.k))
        export_research_weights(
            model,
            args.out,
            k_sigmoid,
            checkpoint.get("initialization"),
            data=checkpoint.get("data"),
        )
        return
    if not args.train_data or not args.val_data:
        parser.error("--train-data and --val-data are required for training")
    try:
        validate_training_arguments(args)
    except ValueError as error:
        parser.error(str(error))
    train(args)


if __name__ == "__main__":
    main()
