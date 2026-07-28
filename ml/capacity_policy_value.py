#!/usr/bin/env python3
"""Large offline parent-position policy/value capacity diagnostic.

This model is intentionally not a browser or production artifact.  It asks a
single diagnostic question: can a materially larger, collision-free model
learn the legal-move ordering supplied by the existing authenticated teachers?

The deployed NNUE remains a frozen input feature.  The model predicts an
unbounded policy residual over that exact score and a separate parent value.
No quantization, WASM integration, match authorization, or live-weight write is
implemented here.
"""

from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Mapping, Sequence

import torch
import torch.nn as nn
import torch.nn.functional as F

import listwise_policy_value as lpv
import train


SCHEMA = "shogi-capacity-policy-value-v1"
FEATURE_VERSION = "dense-43-plane-resnet-set-policy-v1"
BOARD_PLANES = 28
HAND_PLANES = 14
PLY_PLANES = 1
INPUT_PLANES = BOARD_PLANES + HAND_PLANES + PLY_PLANES
SPATIAL_CHANNELS = 64
RESIDUAL_BLOCKS = 6
GLOBAL_DIM = 384
MOVE_DIM = 256
SET_LAYERS = 4
SET_HEADS = 8
SET_FF_DIM = 1024
MOVE_INPUT_DIM = 721
CP_SCALE = 600.0
TARGET_CLAMP_CP = 3_000.0
HAND_MAXIMA = (18.0, 4.0, 4.0, 4.0, 4.0, 2.0, 2.0) * 2
OBJECTIVE_V1 = "legacy-capacity-policy-value-v1"
OBJECTIVE_V2 = "gate-aligned-micro-pair-hard-negative-v2"


@dataclass(frozen=True)
class LossWeights:
    pair: float = 0.25
    best_margin: float = 0.25
    move_value: float = 0.20
    state_value: float = 0.10


V2_LOSS_WEIGHTS = LossWeights(
    pair=1.0,
    best_margin=1.0,
    move_value=0.20,
    state_value=0.0,
)


class SpatialResidualBlock(nn.Module):
    def __init__(self, channels: int) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(
            channels, channels, 3, padding=1, bias=False
        )
        self.norm1 = nn.GroupNorm(16, channels)
        self.conv2 = nn.Conv2d(
            channels, channels, 3, padding=1, bias=False
        )
        self.norm2 = nn.GroupNorm(16, channels)

    def forward(self, value: torch.Tensor) -> torch.Tensor:
        residual = value
        value = F.gelu(self.norm1(self.conv1(value)))
        value = self.norm2(self.conv2(value))
        return F.gelu(residual + value)


class OfflineCapacityPolicyValue(nn.Module):
    """Approximately six-million-parameter offline policy/value model."""

    def __init__(self) -> None:
        super().__init__()
        self.stem = nn.Conv2d(
            INPUT_PLANES,
            SPATIAL_CHANNELS,
            3,
            padding=1,
            bias=False,
        )
        self.stem_norm = nn.GroupNorm(16, SPATIAL_CHANNELS)
        self.spatial_blocks = nn.ModuleList(
            SpatialResidualBlock(SPATIAL_CHANNELS)
            for _ in range(RESIDUAL_BLOCKS)
        )
        self.global_projection = nn.Linear(
            SPATIAL_CHANNELS * 81, GLOBAL_DIM
        )
        self.global_norm = nn.LayerNorm(GLOBAL_DIM)

        self.drop_source = nn.Parameter(torch.empty(SPATIAL_CHANNELS))
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
        self.move_projection = nn.Linear(MOVE_INPUT_DIM, MOVE_DIM)
        self.move_norm = nn.LayerNorm(MOVE_DIM)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=MOVE_DIM,
            nhead=SET_HEADS,
            dim_feedforward=SET_FF_DIM,
            dropout=0.1,
            activation="gelu",
            batch_first=True,
            norm_first=True,
        )
        self.move_set = nn.TransformerEncoder(
            encoder_layer,
            num_layers=SET_LAYERS,
            enable_nested_tensor=False,
        )
        self.move_set_norm = nn.LayerNorm(MOVE_DIM)
        self.policy_output = nn.Sequential(
            nn.Linear(MOVE_DIM, 128),
            nn.GELU(),
            nn.Linear(128, 1),
        )
        self.state_value = nn.Sequential(
            nn.Linear(GLOBAL_DIM, MOVE_DIM),
            nn.GELU(),
            nn.Linear(MOVE_DIM, 1),
        )
        self.reset_parameters()

    def reset_parameters(self) -> None:
        for module in self.modules():
            if isinstance(module, nn.Embedding):
                nn.init.normal_(module.weight, std=0.02)
            elif isinstance(module, (nn.Conv2d, nn.Linear)):
                nn.init.kaiming_uniform_(module.weight, a=math.sqrt(5))
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
        nn.init.normal_(self.drop_source, std=0.02)
        nn.init.zeros_(self.policy_output[-1].weight)
        nn.init.zeros_(self.policy_output[-1].bias)
        nn.init.zeros_(self.state_value[-1].weight)
        nn.init.zeros_(self.state_value[-1].bias)

    @staticmethod
    def parameter_count() -> int:
        model = OfflineCapacityPolicyValue()
        return sum(parameter.numel() for parameter in model.parameters())

    def forward(
        self, batch: Mapping[str, torch.Tensor]
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        planes = batch["parent_planes"]
        spatial = F.gelu(self.stem_norm(self.stem(planes)))
        for block in self.spatial_blocks:
            spatial = block(spatial)
        global_features = self.global_norm(
            self.global_projection(spatial.flatten(start_dim=1))
        )

        batch_size, move_count = batch["from_square"].shape
        flat_spatial = spatial.flatten(start_dim=2).transpose(1, 2)
        to_features = flat_spatial.gather(
            1,
            batch["to_square"].unsqueeze(-1).expand(
                batch_size, move_count, SPATIAL_CHANNELS
            ),
        )
        from_indices = batch["from_square"].clamp(max=80)
        from_features = flat_spatial.gather(
            1,
            from_indices.unsqueeze(-1).expand(
                batch_size, move_count, SPATIAL_CHANNELS
            ),
        )
        from_features = torch.where(
            (batch["from_square"] == 81).unsqueeze(-1),
            self.drop_source.view(1, 1, -1),
            from_features,
        )
        expanded_global = global_features.unsqueeze(1).expand(
            -1, move_count, -1
        )
        move_inputs = torch.cat(
            (
                expanded_global,
                from_features,
                to_features,
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
                torch.tanh(batch["base_cp"] / 3_000.0).unsqueeze(-1),
            ),
            dim=-1,
        )
        if move_inputs.shape[-1] != MOVE_INPUT_DIM:
            raise ValueError(
                f"capacity move feature width changed: {move_inputs.shape[-1]}"
            )
        tokens = F.gelu(self.move_norm(self.move_projection(move_inputs)))
        valid = batch["valid"]
        tokens = tokens.masked_fill(~valid.unsqueeze(-1), 0.0)
        tokens = self.move_set(tokens, src_key_padding_mask=~valid)
        tokens = self.move_set_norm(tokens)
        residual_cp = self.policy_output(tokens).squeeze(-1) * CP_SCALE
        residual_cp = residual_cp.masked_fill(~valid, 0.0)
        combined_cp = batch["base_cp"] + residual_cp
        parent_value_cp = self.state_value(global_features).squeeze(-1) * CP_SCALE
        return combined_cp, residual_cp, parent_value_cp


def _parent_planes(group: lpv.ParentGroup) -> torch.Tensor:
    planes = torch.zeros((INPUT_PLANES, 9, 9), dtype=torch.float32)
    for feature in group.parent_board:
        if feature == train.PAD_IDX:
            continue
        if not 0 <= feature < train.BOARD_FEATS:
            raise ValueError("parent board contains an invalid feature")
        piece_plane, square = divmod(feature, 81)
        if planes[piece_plane, square // 9, square % 9] != 0:
            raise ValueError("parent board contains two pieces on one square")
        planes[piece_plane, square // 9, square % 9] = 1.0
    for index, (count, maximum) in enumerate(
        zip(group.parent_hands, HAND_MAXIMA, strict=True)
    ):
        if not math.isfinite(count) or count < 0:
            raise ValueError("parent hand count is invalid")
        if count > maximum:
            raise ValueError("parent hand count exceeds the physical maximum")
        planes[BOARD_PLANES + index].fill_(float(count) / maximum)
    ply = int(group.parent_sfen.split()[3]) - 1
    if ply < 0:
        raise ValueError("parent SFEN has an invalid ply")
    planes[-1].fill_(float(min(ply, 255)) / 255.0)
    return planes


def make_batch(
    groups: Sequence[lpv.ParentGroup],
    device: str | torch.device,
    *,
    pad_moves_to: int | None = None,
) -> dict[str, torch.Tensor]:
    base = lpv.make_batch(groups, "cpu")
    actual_moves = int(base["valid"].shape[1])
    if pad_moves_to is not None:
        if pad_moves_to < actual_moves:
            raise ValueError("capacity move padding is smaller than the batch")
        padding = pad_moves_to - actual_moves
        if padding:
            for key, value in tuple(base.items()):
                if key in ("parent_board", "parent_hands"):
                    continue
                if value.ndim < 2 or value.shape[1] != actual_moves:
                    raise ValueError(
                        f"capacity batch field {key!r} cannot be move-padded"
                    )
                pad = [0, 0] * value.ndim
                pad[-3] = padding
                base[key] = F.pad(value, tuple(pad))
    base["parent_planes"] = torch.stack(
        [_parent_planes(group) for group in groups]
    )
    return {key: value.to(device) for key, value in base.items()}


def policy_value_loss(
    combined_cp: torch.Tensor,
    residual_cp: torch.Tensor,
    parent_value_cp: torch.Tensor,
    teacher_cp: torch.Tensor,
    valid: torch.Tensor,
    *,
    temperature_cp: float,
    pair_gap_cp: float,
    best_margin_cp: float,
    weights: LossWeights | None = None,
    objective: str = OBJECTIVE_V1,
) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
    if (
        combined_cp.shape != residual_cp.shape
        or combined_cp.shape != teacher_cp.shape
        or combined_cp.shape != valid.shape
        or parent_value_cp.shape != teacher_cp.shape[:1]
    ):
        raise ValueError("capacity policy/value tensor shapes do not match")
    if not bool(valid.any(dim=1).all()):
        raise ValueError("every capacity parent must contain a legal move")
    if temperature_cp <= 0 or pair_gap_cp <= 0 or best_margin_cp <= 0:
        raise ValueError("capacity loss scales must be positive")
    if objective not in (OBJECTIVE_V1, OBJECTIVE_V2):
        raise ValueError(f"unknown capacity objective: {objective}")
    if weights is None:
        weights = (
            LossWeights() if objective == OBJECTIVE_V1 else V2_LOSS_WEIGHTS
        )
    elif objective == OBJECTIVE_V2 and weights != V2_LOSS_WEIGHTS:
        raise ValueError("capacity objective v2 weights are fixed")

    negative = torch.finfo(combined_cp.dtype).min
    teacher_masked = teacher_cp.masked_fill(~valid, negative)
    prediction_masked = combined_cp.masked_fill(~valid, negative)
    teacher_best = teacher_masked.max(dim=1, keepdim=True).values
    target_logits = (
        (teacher_cp - teacher_best).clamp(min=-2_000.0, max=0.0)
        / temperature_cp
    ).masked_fill(~valid, negative)
    targets = torch.softmax(target_logits, dim=1)
    policy_per_parent = -(
        targets * torch.log_softmax(prediction_masked / temperature_cp, dim=1)
    ).sum(dim=1)

    pair_losses: list[torch.Tensor] = []
    pair_micro_losses: list[torch.Tensor] = []
    best_margin_losses: list[torch.Tensor] = []
    move_value_losses: list[torch.Tensor] = []
    for row in range(combined_cp.shape[0]):
        if objective == OBJECTIVE_V1:
            count = int(valid[row].sum().item())
            teacher = teacher_cp[row, :count]
            prediction = combined_cp[row, :count]
        else:
            teacher = teacher_cp[row, valid[row]]
            prediction = combined_cp[row, valid[row]]
        teacher_delta = teacher.unsqueeze(1) - teacher.unsqueeze(0)
        pair_mask = teacher_delta >= pair_gap_cp
        prediction_delta = prediction.unsqueeze(1) - prediction.unsqueeze(0)
        eligible_pair_losses = F.softplus(
            -prediction_delta[pair_mask] / temperature_cp
        )
        if objective == OBJECTIVE_V1:
            pair_losses.append(
                eligible_pair_losses.mean()
                if bool(pair_mask.any())
                else prediction.sum() * 0.0
            )

            best_index = teacher.argmax()
            rest = torch.ones(
                count, dtype=torch.bool, device=teacher.device
            )
            rest[best_index] = False
            if bool(rest.any()):
                best_margin_losses.append(
                    F.relu(
                        best_margin_cp
                        - (
                            prediction[best_index]
                            - prediction[rest]
                        )
                    ).mean()
                    / temperature_cp
                )
            else:
                best_margin_losses.append(prediction.sum() * 0.0)
        else:
            if bool(pair_mask.any()):
                pair_micro_losses.append(eligible_pair_losses)
            teacher_best_mask = teacher == teacher.max()
            teacher_negative_mask = ~teacher_best_mask
            if bool(teacher_negative_mask.any()):
                strongest_best = prediction[teacher_best_mask].max()
                hardest_negative = prediction[teacher_negative_mask].max()
                best_margin_losses.append(
                    F.relu(
                        best_margin_cp
                        - (strongest_best - hardest_negative)
                    )
                    / temperature_cp
                )
            else:
                best_margin_losses.append(prediction.sum() * 0.0)

        move_value_losses.append(
            F.smooth_l1_loss(
                prediction.clamp(-TARGET_CLAMP_CP, TARGET_CLAMP_CP) / CP_SCALE,
                teacher.clamp(-TARGET_CLAMP_CP, TARGET_CLAMP_CP) / CP_SCALE,
                beta=0.25,
            )
        )

    state_target = teacher_best.squeeze(1).clamp(
        -TARGET_CLAMP_CP, TARGET_CLAMP_CP
    )
    state_value = F.smooth_l1_loss(
        parent_value_cp.clamp(-TARGET_CLAMP_CP, TARGET_CLAMP_CP) / CP_SCALE,
        state_target / CP_SCALE,
        beta=0.25,
    )
    pair_component = (
        torch.stack(pair_losses).mean()
        if objective == OBJECTIVE_V1
        else torch.cat(pair_micro_losses).mean()
        if pair_micro_losses
        else combined_cp.sum() * 0.0
    )
    components = {
        "policy": policy_per_parent.mean(),
        "pair": pair_component,
        "best_margin": torch.stack(best_margin_losses).mean(),
        "move_value": torch.stack(move_value_losses).mean(),
        "state_value": state_value,
    }
    if objective == OBJECTIVE_V1:
        total = (
            components["policy"]
            + weights.pair * components["pair"]
            + weights.best_margin * components["best_margin"]
            + weights.move_value * components["move_value"]
            + weights.state_value * components["state_value"]
        )
    else:
        # A zero state weight means no state-head gradient or AdamW decay.
        total = (
            components["policy"]
            + weights.pair * components["pair"]
            + weights.best_margin * components["best_margin"]
            + weights.move_value * components["move_value"]
        )
    if not bool(torch.isfinite(total).item()):
        raise ValueError("capacity loss became non-finite")
    return total, components


def score_groups(
    model: OfflineCapacityPolicyValue | None,
    groups: Sequence[lpv.ParentGroup],
    *,
    device: str,
    parent_batch_size: int,
    pair_gap_cp: float,
) -> dict[str, float | int]:
    """Score groups with pessimistic tie handling and exact live baseline."""

    if not groups:
        raise ValueError("cannot score zero capacity parents")
    if parent_batch_size <= 0 or pair_gap_cp <= 0:
        raise ValueError("invalid capacity scoring controls")
    if model is not None:
        model.eval()
    parents = top1 = pair_count = pair_correct = 0
    regret_sum = 0.0
    with torch.no_grad():
        for start in range(0, len(groups), parent_batch_size):
            selected = groups[start : start + parent_batch_size]
            batch = make_batch(selected, device)
            prediction = (
                batch["base_cp"]
                if model is None
                else model(batch)[0]
            )
            valid = batch["valid"]
            teacher = batch["teacher_cp"]
            negative = torch.finfo(prediction.dtype).min
            prediction = prediction.masked_fill(~valid, negative)
            teacher_masked = teacher.masked_fill(~valid, negative)
            teacher_best_value = teacher_masked.max(dim=1).values
            predicted_best_value = prediction.max(dim=1).values
            teacher_best = valid & (
                teacher == teacher_best_value.unsqueeze(1)
            )
            predicted_best = valid & (
                prediction == predicted_best_value.unsqueeze(1)
            )
            top1 += int(
                torch.all(~predicted_best | teacher_best, dim=1).sum().item()
            )
            chosen = prediction.argmax(dim=1)
            regret_sum += float(
                (
                    teacher_best_value
                    - teacher.gather(1, chosen.unsqueeze(1)).squeeze(1)
                ).sum().item()
            )
            for row, group in enumerate(selected):
                count = len(group.examples)
                teacher_row = teacher[row, :count]
                prediction_row = prediction[row, :count]
                teacher_delta = (
                    teacher_row.unsqueeze(1) - teacher_row.unsqueeze(0)
                )
                eligible = teacher_delta >= pair_gap_cp
                prediction_delta = (
                    prediction_row.unsqueeze(1) - prediction_row.unsqueeze(0)
                )
                pair_correct += int(
                    (prediction_delta[eligible] > 0).sum().item()
                )
                pair_count += int(eligible.sum().item())
            parents += len(selected)
    if pair_count == 0:
        raise ValueError("capacity scoring set has no eligible pair")
    return {
        "parents": parents,
        "top1_correct": top1,
        "top1_accuracy": top1 / parents,
        "pair_count": pair_count,
        "pair_accuracy": pair_correct / pair_count,
        "mean_regret_cp": regret_sum / parents,
    }
