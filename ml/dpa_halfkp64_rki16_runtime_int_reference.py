"""Integer deployment contract for HalfKP64 with RKI16."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


ACTIVATION_SCALE = 127
OUTPUT_WEIGHT_SCALE = 64
BOARD_FEATURES = 81 * 28
HAND_FEATURES = 14
KING_BUCKETS = 81
HIDDEN = 64
RELATIVE_HIDDEN = 16


@dataclass(frozen=True)
class DpaHalfkp64Rki16PayloadLayout:
    board_w1: int = 0
    hand_w1: int = KING_BUCKETS * BOARD_FEATURES * HIDDEN * 2
    first_bias: int = hand_w1 + KING_BUCKETS * HAND_FEATURES * HIDDEN * 2
    output_weight: int = first_bias + HIDDEN * 4
    relative_self: int = output_weight + HIDDEN * 2
    relative_other: int = relative_self + KING_BUCKETS * RELATIVE_HIDDEN * 2
    relative_output: int = relative_other + KING_BUCKETS * RELATIVE_HIDDEN * 2
    total_bytes: int = relative_output + RELATIVE_HIDDEN * 2


LAYOUT = DpaHalfkp64Rki16PayloadLayout()


def clamp_activation(value: int) -> int:
    return min(ACTIVATION_SCALE, max(0, value))


def forward_int(
    us_accumulator: Sequence[int],
    them_accumulator: Sequence[int],
    output_weight: Sequence[int],
    us_relative_self: Sequence[int],
    us_relative_other: Sequence[int],
    them_relative_self: Sequence[int],
    them_relative_other: Sequence[int],
    relative_output: Sequence[int],
) -> int:
    """Return the exact raw Q8128 output used by the WASM evaluator."""

    if len(us_accumulator) != HIDDEN or len(them_accumulator) != HIDDEN:
        raise ValueError("both main accumulators must contain 64 lanes")
    if len(output_weight) != HIDDEN:
        raise ValueError("main output weight must contain 64 entries")
    relative_vectors = (
        us_relative_self,
        us_relative_other,
        them_relative_self,
        them_relative_other,
        relative_output,
    )
    if any(len(vector) != RELATIVE_HIDDEN for vector in relative_vectors):
        raise ValueError("relative-king vectors must contain 16 entries")
    main = sum(
        weight * (clamp_activation(us) - clamp_activation(them))
        for us, them, weight in zip(
            us_accumulator, them_accumulator, output_weight, strict=True
        )
    )
    relative = sum(
        weight * (((us_self * us_other) >> 7) - ((them_self * them_other) >> 7))
        for us_self, us_other, them_self, them_other, weight in zip(
            us_relative_self,
            us_relative_other,
            them_relative_self,
            them_relative_other,
            relative_output,
            strict=True,
        )
    )
    return main + relative
