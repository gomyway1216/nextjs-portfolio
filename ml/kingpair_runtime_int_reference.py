"""Integer contract for the candidate-only KingPair NNUE runtime.

This module deliberately excludes checkpoint loading and production asset
selection.  It freezes the byte layout and the new nonlinear fixed-point
operation so the later exporter and AssemblyScript candidate can share one
small, independently testable contract.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


ACTIVATION_SCALE = 127
DENSE_WEIGHT_SCALE = 64
DENSE_BIAS_SCALE = ACTIVATION_SCALE * DENSE_WEIGHT_SCALE

BOARD_FEATURES = 81 * 28
HAND_FEATURES = 14
KING_BUCKETS = 81
HIDDEN = 128
KING_RELATIVE_WIDTH = 17
KING_RELATIVE_BUCKETS = KING_RELATIVE_WIDTH * KING_RELATIVE_WIDTH
KING_EMBED = 16
MIXED = HIDDEN * 4 + KING_EMBED
MIX1 = 64
MIX2 = 32


@dataclass(frozen=True)
class KingPairPayloadLayout:
    """Headerless little-endian deployment payload offsets."""

    board_w1: int = 0
    hand_w1: int = KING_BUCKETS * BOARD_FEATURES * HIDDEN * 2
    first_bias: int = hand_w1 + KING_BUCKETS * HAND_FEATURES * HIDDEN * 2
    king_pair: int = first_bias + HIDDEN * 4
    mix1_weight: int = king_pair + KING_RELATIVE_BUCKETS * KING_EMBED * 2
    mix1_bias: int = mix1_weight + MIX1 * MIXED * 2
    mix2_weight: int = mix1_bias + MIX1 * 4
    mix2_bias: int = mix2_weight + MIX2 * MIX1 * 2
    output_weight: int = mix2_bias + MIX2 * 4
    output_bias: int = output_weight + MIX2 * 2
    total_bytes: int = output_bias + 4


LAYOUT = KingPairPayloadLayout()


def relative_king_index(own_bucket: int, opponent_view_bucket: int) -> int:
    """Match ``king_pair_relative_index`` without importing torch.

    ``opponent_view_bucket`` is expressed in the opponent's rotated local
    frame, exactly as the second dual-HalfKP bucket is stored by training.
    """

    if not 0 <= own_bucket < KING_BUCKETS:
        raise ValueError("own king bucket is out of range")
    if not 0 <= opponent_view_bucket < KING_BUCKETS:
        raise ValueError("opponent king bucket is out of range")
    opponent = KING_BUCKETS - 1 - opponent_view_bucket
    own_file, own_rank = divmod(own_bucket, 9)
    opponent_file, opponent_rank = divmod(opponent, 9)
    return (
        (opponent_file - own_file + 8) * KING_RELATIVE_WIDTH
        + opponent_rank
        - own_rank
        + 8
    )


def interaction_product_q(us_q: int, them_q: int) -> int:
    """Rescale a nonnegative Q127 product with nearest integer rounding."""

    if not 0 <= us_q <= ACTIVATION_SCALE:
        raise ValueError("us activation is outside [0, 127]")
    if not 0 <= them_q <= ACTIVATION_SCALE:
        raise ValueError("them activation is outside [0, 127]")
    return (us_q * them_q + ACTIVATION_SCALE // 2) // ACTIVATION_SCALE


def clamp_activation(value: int) -> int:
    return min(ACTIVATION_SCALE, max(0, value))


def _validate_matrix(
    matrix: Sequence[Sequence[int]], rows: int, columns: int, label: str
) -> None:
    if len(matrix) != rows or any(len(row) != columns for row in matrix):
        raise ValueError(f"{label} must have shape ({rows}, {columns})")


def _dense_clipped(
    inputs: Sequence[int],
    weights: Sequence[Sequence[int]],
    biases: Sequence[int],
) -> list[int]:
    if len(weights) != len(biases):
        raise ValueError("dense weight rows and biases must match")
    if any(len(row) != len(inputs) for row in weights):
        raise ValueError("dense weight width must match the input")
    output: list[int] = []
    for row, bias in zip(weights, biases, strict=True):
        accumulator = bias + sum(weight * value for weight, value in zip(row, inputs, strict=True))
        output.append(clamp_activation(accumulator >> 6))
    return output


def forward_dense_int(
    us_accumulator: Sequence[int],
    them_accumulator: Sequence[int],
    relative_embedding: Sequence[int],
    mix1_weight: Sequence[Sequence[int]],
    mix1_bias: Sequence[int],
    mix2_weight: Sequence[Sequence[int]],
    mix2_bias: Sequence[int],
    output_weight: Sequence[int],
    output_bias: int,
) -> int:
    """Return the raw quantized KingPair output from two W1 accumulators."""

    if len(us_accumulator) != HIDDEN or len(them_accumulator) != HIDDEN:
        raise ValueError("both first-layer accumulators must contain 128 lanes")
    if len(relative_embedding) != KING_EMBED:
        raise ValueError("relative embedding must contain 16 lanes")
    _validate_matrix(mix1_weight, MIX1, MIXED, "mix1_weight")
    _validate_matrix(mix2_weight, MIX2, MIX1, "mix2_weight")
    if len(mix1_bias) != MIX1 or len(mix2_bias) != MIX2:
        raise ValueError("dense bias shape is invalid")
    if len(output_weight) != MIX2:
        raise ValueError("output_weight must contain 32 entries")

    us = [clamp_activation(value) for value in us_accumulator]
    them = [clamp_activation(value) for value in them_accumulator]
    mixed = (
        us
        + them
        + [left - right for left, right in zip(us, them, strict=True)]
        + [interaction_product_q(left, right) for left, right in zip(us, them, strict=True)]
        + list(relative_embedding)
    )
    hidden1 = _dense_clipped(mixed, mix1_weight, mix1_bias)
    hidden2 = _dense_clipped(hidden1, mix2_weight, mix2_bias)
    return output_bias + sum(
        weight * value for weight, value in zip(output_weight, hidden2, strict=True)
    )
