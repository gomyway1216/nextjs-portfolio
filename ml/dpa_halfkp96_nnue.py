"""Dual-Perspective Antisymmetric HalfKP96 training model.

The model deliberately mirrors the integer runtime payload instead of adding a
training-only head.  One 81-bucket HalfKP table is shared by the side-to-move
and opponent views.  Their clipped 96-lane accumulators are subtracted before
one shared output dot product, so exchanging the two views negates the value
exactly.  There is no scalar output bias or dense interaction layer.
"""

from __future__ import annotations

from dataclasses import dataclass

import torch
from torch import nn
import torch.nn.functional as F

from train import BOARD_FEATS, HALFKP_BUCKETS, HAND_FEATS, MAX_PIECES


HIDDEN = 96
BOARD_FEATURES = HALFKP_BUCKETS * BOARD_FEATS
HAND_FEATURES = HALFKP_BUCKETS * HAND_FEATS
PAD_INDEX = BOARD_FEATURES
TRAINABLE_PARAMETERS = (
    BOARD_FEATURES * HIDDEN + HAND_FEATURES * HIDDEN + HIDDEN
)


@dataclass(frozen=True)
class DpaHalfkp96DeploymentTensors:
    """Float tensors in the exact order and shape expected by the exporter."""

    board_w1: torch.Tensor
    hand_w1: torch.Tensor
    first_bias: torch.Tensor
    output_weight: torch.Tensor


class DpaHalfkp96NNUE(nn.Module):
    """Shared HalfKP96 accumulators with a strictly antisymmetric output."""

    hidden = HIDDEN
    king_buckets = HALFKP_BUCKETS
    board_features = BOARD_FEATURES
    hand_features = HAND_FEATURES
    pad_index = PAD_INDEX

    def __init__(self) -> None:
        super().__init__()
        # Keep only deployable trainable values.  A parameter-free gather plus
        # mask is used instead of an extra learned Embedding padding row.
        self.board_w1 = nn.Parameter(torch.empty(BOARD_FEATURES, HIDDEN))
        self.hand_w1 = nn.Parameter(
            torch.empty(HALFKP_BUCKETS, HAND_FEATS, HIDDEN)
        )
        self.output_weight = nn.Parameter(torch.empty(HIDDEN))
        # The runtime layout reserves 96 i32 first-bias entries.  Any nonzero
        # shared bias would sit inside the clipped accumulators, so this family
        # fixes those slots to zero rather than pretending they cancel through
        # the nonlinearity.
        self.register_buffer(
            "first_bias", torch.zeros(HIDDEN), persistent=True
        )
        self.reset_parameters()

    def reset_parameters(self) -> None:
        """Deterministic under the caller's torch seed; always scratch init."""

        nn.init.normal_(self.board_w1, mean=0.0, std=0.01)
        nn.init.normal_(self.hand_w1, mean=0.0, std=0.01)
        nn.init.normal_(self.output_weight, mean=0.0, std=0.01)
        with torch.no_grad():
            self.first_bias.zero_()

    @staticmethod
    def _validate_inputs(
        board_indices: torch.Tensor,
        hands: torch.Tensor,
        buckets: torch.Tensor,
    ) -> None:
        if (
            board_indices.ndim != 3
            or board_indices.shape[1:] != (2, MAX_PIECES)
        ):
            raise ValueError(
                "board_indices must have shape (batch, 2, 40)"
            )
        if hands.ndim != 3 or hands.shape[1:] != (2, HAND_FEATS):
            raise ValueError("hands must have shape (batch, 2, 14)")
        if buckets.ndim != 2 or buckets.shape[1] != 2:
            raise ValueError("buckets must have shape (batch, 2)")
        if board_indices.shape[0] != hands.shape[0] or (
            buckets.shape[0] != hands.shape[0]
        ):
            raise ValueError("dual-perspective input batch sizes differ")
        if board_indices.dtype not in (torch.int32, torch.int64):
            raise TypeError("board_indices must use an integer dtype")
        if buckets.dtype not in (torch.int32, torch.int64):
            raise TypeError("buckets must use an integer dtype")

    def view_accumulators(
        self,
        board_indices: torch.Tensor,
        hands: torch.Tensor,
        buckets: torch.Tensor,
    ) -> torch.Tensor:
        """Return the two shared raw HalfKP accumulators.

        ``F.embedding`` and a fixed-shape mask are supported by MPS.  This
        avoids ``EmbeddingBag``'s platform-specific backward path and does not
        fall back to CPU.
        """

        self._validate_inputs(board_indices, hands, buckets)
        if bool(
            torch.any(
                (board_indices < 0) | (board_indices > self.pad_index)
            )
        ):
            raise ValueError("board feature index is outside the payload table")
        if bool(torch.any((buckets < 0) | (buckets >= self.king_buckets))):
            raise ValueError("king bucket is outside 0..80")

        batch = board_indices.shape[0]
        flat_board = board_indices.reshape(batch * 2, MAX_PIECES)
        active = flat_board != self.pad_index
        safe_board = torch.where(active, flat_board, torch.zeros_like(flat_board))
        board_terms = F.embedding(safe_board, self.board_w1)
        board_sum = (board_terms * active.unsqueeze(-1)).sum(dim=1)

        flat_hands = hands.reshape(batch * 2, HAND_FEATS)
        flat_buckets = buckets.reshape(batch * 2)
        hand_tables = self.hand_w1[flat_buckets]
        hand_sum = (hand_tables * flat_hands.unsqueeze(-1)).sum(dim=1)
        return (board_sum + hand_sum + self.first_bias).reshape(
            batch, 2, HIDDEN
        )

    def forward(
        self,
        board_indices: torch.Tensor,
        hands: torch.Tensor,
        buckets: torch.Tensor,
    ) -> torch.Tensor:
        accumulators = self.view_accumulators(board_indices, hands, buckets)
        clipped = torch.clamp(accumulators, 0.0, 1.0)
        difference = clipped[:, 0] - clipped[:, 1]
        return difference @ self.output_weight

    def deployment_tensors(self) -> DpaHalfkp96DeploymentTensors:
        """Return tensors matching the runtime payload's contiguous sections."""

        return DpaHalfkp96DeploymentTensors(
            board_w1=self.board_w1,
            hand_w1=self.hand_w1.reshape(HAND_FEATURES, HIDDEN),
            first_bias=torch.zeros_like(self.first_bias),
            output_weight=self.output_weight,
        )

    @classmethod
    def deployment_contract(cls) -> dict[str, int | str]:
        return {
            "family": "dpa-halfkp96",
            "perspectives": 2,
            "king_buckets": HALFKP_BUCKETS,
            "board_features_per_bucket": BOARD_FEATS,
            "hand_features_per_bucket": HAND_FEATS,
            "hidden_per_perspective": HIDDEN,
            "trainable_parameters": TRAINABLE_PARAMETERS,
            "scalar_output_bias": 0,
            "dense_interaction_layers": 0,
        }
