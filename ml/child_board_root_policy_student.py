#!/usr/bin/env python3
"""Fit-only child-board root-policy student.

This module is deliberately independent of the bound teacher hashes.  It
contains only the immutable production-move projection, the preregistered
877,633-parameter student, and its distillation objective.  It cannot open
tune/sealed data, select a checkpoint, run a match, or write live weights.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
import math
from typing import Mapping, Sequence

import torch
import torch.nn as nn
import torch.nn.functional as F

import capacity_policy_value as cpv
import listwise_policy_value as lpv
import move_order_head as move_features


SCHEMA = "shogi-child-board-root-policy-student-v1"
FEATURE_VERSION = "dense-43-plane-shared-parent-child-livecp-root-v1"
MODEL_VARIANT = "shared-child16x2-residual-mlp-root-ordering-v1"
PRODUCTION_MOVE_UNIVERSE_SCHEMA = (
    "shogi-current-production-root-search-move-universe-v1"
)
PARAMETERS = 877_633
FP32_PAYLOAD_BYTES = PARAMETERS * 4
INPUT_PLANES = 43
BOARD_CHANNELS = 16
BOARD_BLOCKS = 2
BOARD_OUTPUT = 128
MOVE_EMBEDDING_WIDTH = 208
MOVE_INPUT = BOARD_OUTPUT * 3 + MOVE_EMBEDDING_WIDTH + 1
HIDDEN = 256
MLP_EXPANSION = 512
MLP_BLOCKS = 2
CP_SCALE = 600.0
INPUT_CP_SCALE = 3_000.0
TEMPERATURE_CP = 100.0
PAIR_GAP_CP = 50.0
BEST_MARGIN_CP = 50.0
TARGET_CLAMP_CP = 3_000.0
MOVE_VALUE_WEIGHT = 0.20
INITIALIZATION_SEED = 20_260_728
RANKS = "abcdefghi"


@dataclass(frozen=True)
class ProjectionRemoval:
    move: str
    reason: str


@dataclass(frozen=True)
class ProjectedParent:
    group: lpv.ParentGroup
    source_moves: tuple[str, ...]
    production_moves: tuple[str, ...]
    removals: tuple[ProjectionRemoval, ...]


def _is_nonpromoting_major_in_promotion_zone(
    parent_sfen: str,
    move: str,
) -> bool:
    """Mirror the current JS/WASM ``forcePromoteMajor`` membership rule."""

    if "*" in move or move.endswith("+"):
        return False
    if (
        len(move) != 4
        or move[0] not in "123456789"
        or move[1] not in RANKS
        or move[2] not in "123456789"
        or move[3] not in RANKS
    ):
        raise ValueError(f"invalid USI move in production projection: {move!r}")
    parsed = move_features.parse_parent_sfen(parent_sfen)
    side = parsed["side"]
    raw_board = parsed["raw_board"]
    if side not in ("b", "w") or not isinstance(raw_board, dict):
        raise ValueError("invalid parsed parent for production projection")
    source = (int(move[0]), RANKS.index(move[1]) + 1)
    occupant = raw_board.get(source)
    if (
        not isinstance(occupant, tuple)
        or len(occupant) != 2
        or type(occupant[0]) is not int
        or type(occupant[1]) is not bool
    ):
        raise ValueError(f"USI source is absent in production projection: {move!r}")
    piece_type, owner_is_sente = occupant
    if owner_is_sente != (side == "b"):
        raise ValueError(f"USI source is not owned by side to move: {move!r}")
    if piece_type not in (
        move_features.PIECE_TYPES["B"],
        move_features.PIECE_TYPES["R"],
    ):
        return False
    source_rank = RANKS.index(move[1]) + 1
    destination_rank = RANKS.index(move[3]) + 1
    if side == "b":
        return source_rank <= 3 or destination_rank <= 3
    return source_rank >= 7 or destination_rank >= 7


def project_group_to_production(group: lpv.ParentGroup) -> ProjectedParent:
    """Project a rules-complete parent group to current production membership."""

    if not group.examples:
        raise ValueError("cannot project a parent with zero moves")
    source_examples = sorted(group.examples, key=lambda example: example.move)
    if len({example.move for example in source_examples}) != len(source_examples):
        raise ValueError("production projection received duplicate USI moves")
    kept: list[lpv.MoveExample] = []
    removed: list[ProjectionRemoval] = []
    for example in source_examples:
        if _is_nonpromoting_major_in_promotion_zone(
            group.parent_sfen,
            example.move,
        ):
            removed.append(
                ProjectionRemoval(
                    move=example.move,
                    reason=(
                        "current-production-force-promote-unpromoted-bishop-rook"
                    ),
                )
            )
        else:
            kept.append(example)
    if not kept:
        raise ValueError("production projection removed every move")
    production_moves = tuple(example.move for example in kept)
    return ProjectedParent(
        group=replace(group, examples=tuple(kept)),
        source_moves=tuple(example.move for example in source_examples),
        production_moves=production_moves,
        removals=tuple(removed),
    )


def project_groups_to_production(
    groups: Sequence[lpv.ParentGroup],
) -> list[ProjectedParent]:
    projected = [project_group_to_production(group) for group in groups]
    parent_ids = [row.group.parent_id for row in projected]
    if len(set(parent_ids)) != len(parent_ids):
        raise ValueError("production projection requires unique parent IDs")
    return projected


def fixed_gelu(value: torch.Tensor) -> torch.Tensor:
    """The protocol's float32 tanh GELU, never PyTorch's exact variant."""

    return (
        0.5
        * value
        * (
            1.0
            + torch.tanh(
                math.sqrt(2.0 / math.pi)
                * (
                    value
                    + 0.044715 * value * value * value
                )
            )
        )
    )


class StudentBoardResidualBlock(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(
            BOARD_CHANNELS,
            BOARD_CHANNELS,
            3,
            padding=1,
            bias=False,
        )
        self.norm1 = nn.GroupNorm(4, BOARD_CHANNELS, eps=1e-5)
        self.conv2 = nn.Conv2d(
            BOARD_CHANNELS,
            BOARD_CHANNELS,
            3,
            padding=1,
            bias=False,
        )
        self.norm2 = nn.GroupNorm(4, BOARD_CHANNELS, eps=1e-5)

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        residual = value
        value = fixed_gelu(self.norm1(self.conv1(value)))
        value = self.norm2(self.conv2(value))
        return fixed_gelu(residual + value)


class SharedStudentBoardEncoder(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.stem = nn.Conv2d(
            INPUT_PLANES,
            BOARD_CHANNELS,
            3,
            padding=1,
            bias=False,
        )
        self.stem_norm = nn.GroupNorm(4, BOARD_CHANNELS, eps=1e-5)
        self.blocks = nn.ModuleList(
            StudentBoardResidualBlock() for _ in range(BOARD_BLOCKS)
        )
        self.projection = nn.Linear(BOARD_CHANNELS * 81, BOARD_OUTPUT)
        self.output_norm = nn.LayerNorm(BOARD_OUTPUT, eps=1e-5)

    def forward(self, planes: torch.Tensor) -> torch.Tensor:
        if planes.ndim != 4 or planes.shape[1:] != (INPUT_PLANES, 9, 9):
            raise ValueError("student board planes have an invalid shape")
        value = fixed_gelu(self.stem_norm(self.stem(planes)))
        for block in self.blocks:
            value = block(value)
        return self.output_norm(
            self.projection(value.flatten(start_dim=1))
        )


class StudentResidualMlpBlock(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.expand = nn.Linear(HIDDEN, MLP_EXPANSION)
        self.contract = nn.Linear(MLP_EXPANSION, HIDDEN)
        self.norm = nn.LayerNorm(HIDDEN, eps=1e-5)

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        residual = value
        value = self.contract(fixed_gelu(self.expand(value)))
        return fixed_gelu(self.norm(residual + value))


class ChildBoardRootPolicyStudent(nn.Module):
    """The preregistered 877,633-parameter root-ordering student."""

    requires_child_planes = True

    def __init__(self) -> None:
        super().__init__()
        self.board_encoder = SharedStudentBoardEncoder()
        self.from_square = nn.Embedding(82, 32)
        self.to_square = nn.Embedding(81, 32)
        self.moved_piece = nn.Embedding(15, 32)
        self.captured_piece = nn.Embedding(15, 16)
        self.action = nn.Embedding(8, 16)
        self.delta_file = nn.Embedding(17, 16)
        self.delta_rank = nn.Embedding(17, 16)
        self.self_king_relation = nn.Embedding(17 * 17, 16)
        self.enemy_king_relation = nn.Embedding(17 * 17, 16)
        self.ply_bucket = nn.Embedding(16, 16)
        self.input_projection = nn.Linear(MOVE_INPUT, HIDDEN)
        self.input_norm = nn.LayerNorm(HIDDEN, eps=1e-5)
        self.mlp_blocks = nn.ModuleList(
            StudentResidualMlpBlock() for _ in range(MLP_BLOCKS)
        )
        self.output = nn.Linear(HIDDEN, 1)
        self.reset_parameters()
        if self.parameter_count() != PARAMETERS:
            raise AssertionError("student parameter count drift")

    def reset_parameters(self) -> None:
        for module in self.modules():
            if isinstance(module, nn.Embedding):
                nn.init.normal_(module.weight, mean=0.0, std=0.02)
            elif isinstance(module, (nn.Conv2d, nn.Linear)):
                nn.init.kaiming_uniform_(module.weight, a=math.sqrt(5))
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
            elif isinstance(module, (nn.GroupNorm, nn.LayerNorm)):
                if module.weight is not None:
                    nn.init.ones_(module.weight)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
        nn.init.zeros_(self.output.weight)
        nn.init.zeros_(self.output.bias)

    def parameter_count(self) -> int:
        return sum(parameter.numel() for parameter in self.parameters())

    def forward(
        self,
        batch: Mapping[str, torch.Tensor],
    ) -> tuple[torch.Tensor, torch.Tensor]:
        parent_planes = batch["parent_planes"]
        child_planes = batch["child_planes"]
        valid = batch["valid"]
        if (
            parent_planes.ndim != 4
            or child_planes.ndim != 5
            or child_planes.shape[:2] != valid.shape
            or child_planes.shape[2:] != (INPUT_PLANES, 9, 9)
            or parent_planes.shape[0] != valid.shape[0]
        ):
            raise ValueError("student parent/child batch shapes do not match")
        batch_size, move_count = valid.shape
        if not bool(valid.any(dim=1).all()):
            raise ValueError("every student parent must contain a valid move")
        parent_features = self.board_encoder(parent_planes)
        flat_valid = valid.flatten()
        valid_children = child_planes.flatten(0, 1)[flat_valid]
        encoded_valid_children = self.board_encoder(valid_children)
        child_features_flat = encoded_valid_children.new_zeros(
            (batch_size * move_count, BOARD_OUTPUT)
        )
        child_features_flat = child_features_flat.index_copy(
            0,
            flat_valid.nonzero().squeeze(1),
            encoded_valid_children,
        )
        child_features = child_features_flat.reshape(
            batch_size,
            move_count,
            BOARD_OUTPUT,
        )
        expanded_parent = parent_features.unsqueeze(1).expand(
            -1,
            move_count,
            -1,
        )
        embeddings = torch.cat(
            (
                self.from_square(batch["from_square"]),
                self.to_square(batch["to_square"]),
                self.moved_piece(batch["moved_piece"]),
                self.captured_piece(batch["captured_piece"]),
                self.action(batch["action"]),
                self.delta_file(batch["delta_file"]),
                self.delta_rank(batch["delta_rank"]),
                self.self_king_relation(batch["self_king_relation"]),
                self.enemy_king_relation(batch["enemy_king_relation"]),
                self.ply_bucket(batch["ply_bucket"]),
            ),
            dim=-1,
        )
        if embeddings.shape[-1] != MOVE_EMBEDDING_WIDTH:
            raise AssertionError("student move embedding width drift")
        features = torch.cat(
            (
                expanded_parent,
                child_features,
                child_features - expanded_parent,
                embeddings,
                torch.tanh(
                    batch["base_cp"] / INPUT_CP_SCALE
                ).unsqueeze(-1),
            ),
            dim=-1,
        )
        if features.shape[-1] != MOVE_INPUT:
            raise AssertionError("student move input width drift")
        value = fixed_gelu(
            self.input_norm(self.input_projection(features))
        )
        for block in self.mlp_blocks:
            value = block(value)
        residual_cp = self.output(value).squeeze(-1) * CP_SCALE
        residual_cp = residual_cp.masked_fill(~valid, 0.0)
        combined_cp = (batch["base_cp"] + residual_cp).masked_fill(
            ~valid,
            0.0,
        )
        return combined_cp, residual_cp


def make_student_batch(
    groups: Sequence[lpv.ParentGroup],
    device: str | torch.device,
    *,
    pad_moves_to: int | None = None,
) -> dict[str, torch.Tensor]:
    return cpv.make_batch(
        groups,
        device,
        pad_moves_to=pad_moves_to,
        include_child_planes=True,
    )


def distillation_loss(
    combined_cp: torch.Tensor,
    teacher_cp: torch.Tensor,
    valid: torch.Tensor,
) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
    """The fixed four-term, tie-aware, single-domain objective."""

    if combined_cp.shape != teacher_cp.shape or valid.shape != teacher_cp.shape:
        raise ValueError("student loss tensors must have identical shapes")
    if not bool(valid.any(dim=1).all()):
        raise ValueError("every student loss row must contain a move")
    negative = torch.finfo(combined_cp.dtype).min
    masked_teacher = teacher_cp.masked_fill(~valid, negative)
    masked_prediction = combined_cp.masked_fill(~valid, negative)
    teacher_best = masked_teacher.max(dim=1, keepdim=True).values
    target_logits = (
        (teacher_cp - teacher_best).clamp(min=-2_000.0, max=0.0)
        / TEMPERATURE_CP
    ).masked_fill(~valid, negative)
    targets = torch.softmax(target_logits, dim=1)
    list_per_parent = -(
        targets
        * torch.log_softmax(masked_prediction / TEMPERATURE_CP, dim=1)
    ).sum(dim=1)

    pair_terms: list[torch.Tensor] = []
    margin_terms: list[torch.Tensor] = []
    move_terms: list[torch.Tensor] = []
    for row in range(combined_cp.shape[0]):
        teacher = teacher_cp[row, valid[row]]
        prediction = combined_cp[row, valid[row]]
        teacher_delta = teacher.unsqueeze(1) - teacher.unsqueeze(0)
        pair_mask = teacher_delta >= PAIR_GAP_CP
        if bool(pair_mask.any()):
            prediction_delta = (
                prediction.unsqueeze(1) - prediction.unsqueeze(0)
            )
            pair_terms.append(
                F.softplus(
                    -prediction_delta[pair_mask] / TEMPERATURE_CP
                )
            )
        best_mask = teacher == teacher.max()
        negative_mask = ~best_mask
        if bool(negative_mask.any()):
            strongest_best = prediction[best_mask].max()
            hardest_negative = prediction[negative_mask].max()
            margin_terms.append(
                F.relu(
                    BEST_MARGIN_CP
                    - (strongest_best - hardest_negative)
                )
                / TEMPERATURE_CP
            )
        else:
            margin_terms.append(prediction.sum() * 0.0)
        move_terms.append(
            F.smooth_l1_loss(
                prediction.clamp(
                    -TARGET_CLAMP_CP,
                    TARGET_CLAMP_CP,
                )
                / CP_SCALE,
                teacher.clamp(
                    -TARGET_CLAMP_CP,
                    TARGET_CLAMP_CP,
                )
                / CP_SCALE,
                beta=0.25,
            )
        )
    pair = (
        torch.cat(pair_terms).mean()
        if pair_terms
        else combined_cp.sum() * 0.0
    )
    components = {
        "listwise": list_per_parent.mean(),
        "pair": pair,
        "best_margin": torch.stack(margin_terms).mean(),
        "move_value": torch.stack(move_terms).mean(),
    }
    total = (
        components["listwise"]
        + components["pair"]
        + components["best_margin"]
        + MOVE_VALUE_WEIGHT * components["move_value"]
    )
    if not bool(torch.isfinite(total).item()):
        raise ValueError("student distillation loss became non-finite")
    return total, components


def stable_student_order(
    moves: Sequence[str],
    combined_cp: Sequence[float],
) -> tuple[str, ...]:
    if len(moves) != len(combined_cp) or len(set(moves)) != len(moves):
        raise ValueError("student order inputs are inconsistent")
    if any(not math.isfinite(float(value)) for value in combined_cp):
        raise ValueError("student order contains a non-finite score")
    return tuple(
        move
        for move, _score in sorted(
            zip(moves, combined_cp, strict=True),
            key=lambda row: (-float(row[1]), row[0].encode("ascii")),
        )
    )
