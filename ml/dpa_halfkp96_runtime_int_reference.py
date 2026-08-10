"""Integer deployment contract for Dual-Perspective Antisymmetric HalfKP96.

The evaluator body is the model: two shared 96-lane HalfKP accumulators,
clipped to Q127, followed by one shared antisymmetric output vector.  There is
no auxiliary head, interaction trunk, checkpoint loader, or training code in
this runtime-only milestone.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence


ACTIVATION_SCALE = 127
OUTPUT_WEIGHT_SCALE = 64
BOARD_FEATURES = 81 * 28
HAND_FEATURES = 14
KING_BUCKETS = 81
HIDDEN = 96


@dataclass(frozen=True)
class DpaHalfkp96PayloadLayout:
    board_w1: int = 0
    hand_w1: int = KING_BUCKETS * BOARD_FEATURES * HIDDEN * 2
    first_bias: int = hand_w1 + KING_BUCKETS * HAND_FEATURES * HIDDEN * 2
    output_weight: int = first_bias + HIDDEN * 4
    total_bytes: int = output_weight + HIDDEN * 2


LAYOUT = DpaHalfkp96PayloadLayout()


def clamp_activation(value: int) -> int:
    return min(ACTIVATION_SCALE, max(0, value))


def forward_int(
    us_accumulator: Sequence[int],
    them_accumulator: Sequence[int],
    output_weight: Sequence[int],
) -> int:
    """Return raw Q8128 output, strictly antisymmetric under view exchange."""

    if len(us_accumulator) != HIDDEN or len(them_accumulator) != HIDDEN:
        raise ValueError("both first-layer accumulators must contain 96 lanes")
    if len(output_weight) != HIDDEN:
        raise ValueError("output_weight must contain 96 entries")
    return sum(
        weight * (clamp_activation(us) - clamp_activation(them))
        for us, them, weight in zip(
            us_accumulator, them_accumulator, output_weight, strict=True
        )
    )
