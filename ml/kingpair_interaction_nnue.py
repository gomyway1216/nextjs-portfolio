"""Cost-bounded dual-perspective KingPair interaction NNUE.

This is intentionally a new evaluator family rather than another head on the
production 256-wide HalfKP accumulator.  Each perspective uses a shared
128-wide HalfKP table, so updating both accumulators costs the same number of
first-layer lanes as the production single-perspective 256-wide table.  The
dense trunk receives explicit difference and elementwise interaction terms,
plus an embedding of the two kings' relative displacement.

The training representation is factorized into a king-independent shared
table and an 81-bucket delta table.  ``materialized_first_layer`` combines
them into the deployment table; the factorization adds no runtime work.
"""

from __future__ import annotations

import torch
from torch import nn
import torch.nn.functional as F

from train import BOARD_FEATS, HAND_FEATS, HALFKP_BUCKETS


NUM_SQUARES = 81
KING_RELATIVE_WIDTH = 17
KING_RELATIVE_BUCKETS = KING_RELATIVE_WIDTH * KING_RELATIVE_WIDTH


def king_pair_relative_index(buckets: torch.Tensor) -> torch.Tensor:
    """Return the opponent-king displacement in the side-to-move view.

    ``buckets[:, 0]`` is the side-to-move king in its local coordinates.
    ``buckets[:, 1]`` is the opponent king after the standard dual-view
    ownership swap and 180-degree rotation, so it is rotated back before the
    displacement is calculated.
    """

    if buckets.ndim != 2 or buckets.shape[1] != 2:
        raise ValueError("dual HalfKP buckets must have shape (batch, 2)")
    if buckets.dtype not in (torch.int32, torch.int64):
        raise TypeError("dual HalfKP buckets must use an integer dtype")
    if bool(torch.any((buckets < 0) | (buckets >= NUM_SQUARES))):
        raise ValueError("dual HalfKP king square is out of range")

    own = buckets[:, 0]
    opponent_in_own_view = (NUM_SQUARES - 1) - buckets[:, 1]
    own_file, own_rank = torch.div(own, 9, rounding_mode="floor"), own % 9
    opp_file = torch.div(opponent_in_own_view, 9, rounding_mode="floor")
    opp_rank = opponent_in_own_view % 9
    delta_file = opp_file - own_file + 8
    delta_rank = opp_rank - own_rank + 8
    return delta_file * KING_RELATIVE_WIDTH + delta_rank


class KingPairInteractionNNUE(nn.Module):
    """128x2 HalfKP accumulators with explicit king/piece interactions."""

    HIDDEN = 128
    KING_EMBED = 16
    MIX1 = 64
    MIX2 = 32

    def __init__(self) -> None:
        super().__init__()
        self.features = "halfkp-dual-kingpair-interaction"
        self.bucket_count = HALFKP_BUCKETS
        self.board_feats = HALFKP_BUCKETS * BOARD_FEATS
        self.hand_feats = HALFKP_BUCKETS * HAND_FEATS
        self.pad_idx = self.board_feats

        self.board_delta = nn.EmbeddingBag(
            self.board_feats + 1,
            self.HIDDEN,
            mode="sum",
            padding_idx=self.pad_idx,
        )
        self.hand_delta = nn.Linear(self.hand_feats, self.HIDDEN)
        self.board_shared = nn.EmbeddingBag(
            BOARD_FEATS + 1,
            self.HIDDEN,
            mode="sum",
            padding_idx=BOARD_FEATS,
        )
        self.hand_shared = nn.Linear(HAND_FEATS, self.HIDDEN, bias=False)
        self.king_pair = nn.Embedding(KING_RELATIVE_BUCKETS, self.KING_EMBED)

        mix_input = self.HIDDEN * 4 + self.KING_EMBED
        self.mix1 = nn.Linear(mix_input, self.MIX1)
        self.mix2 = nn.Linear(self.MIX1, self.MIX2)
        self.output = nn.Linear(self.MIX2, 1)

        nn.init.normal_(self.board_shared.weight, std=0.01)
        nn.init.normal_(self.king_pair.weight, std=0.01)
        with torch.no_grad():
            self.board_shared.weight[BOARD_FEATS].zero_()
            self.board_delta.weight.zero_()
            self.hand_delta.weight.zero_()
            self.board_delta.weight[self.pad_idx].zero_()

    def _expanded_hands(
        self, hands: torch.Tensor, buckets: torch.Tensor
    ) -> torch.Tensor:
        if hands.ndim != 3 or hands.shape[1:] != (2, HAND_FEATS):
            raise ValueError("dual HalfKP hands must have shape (batch, 2, 14)")
        if buckets.shape != hands.shape[:2]:
            raise ValueError("dual HalfKP buckets must match the hand batch")
        batch = hands.shape[0]
        expanded = hands.new_zeros(batch, 2, self.bucket_count, HAND_FEATS)
        rows = torch.arange(batch, device=hands.device).unsqueeze(1).expand(-1, 2)
        views = torch.arange(2, device=hands.device).unsqueeze(0).expand(batch, -1)
        expanded[rows, views, buckets] = hands
        return expanded.reshape(batch * 2, self.hand_feats)

    def view_accumulators(
        self,
        board_idx: torch.Tensor,
        hands: torch.Tensor,
        buckets: torch.Tensor,
    ) -> torch.Tensor:
        if board_idx.ndim != 3 or board_idx.shape[1] != 2:
            raise ValueError("dual HalfKP board indices must have shape (batch, 2, active)")
        if buckets.ndim != 2 or buckets.shape != board_idx.shape[:2]:
            raise ValueError("dual HalfKP buckets must match the board batch")
        if hands.shape[:2] != board_idx.shape[:2]:
            raise ValueError("dual HalfKP hands must match the board batch")

        batch, views, active = board_idx.shape
        flat_board = board_idx.reshape(batch * views, active)
        flat_hands = hands.reshape(batch * views, HAND_FEATS)
        expanded_hands = self._expanded_hands(hands, buckets)
        raw_board = torch.where(
            flat_board == self.pad_idx,
            torch.full_like(flat_board, BOARD_FEATS),
            flat_board % BOARD_FEATS,
        )

        shared = self.board_shared(raw_board) + F.linear(
            flat_hands, self.hand_shared.weight, self.hand_delta.bias
        )
        delta = self.board_delta(flat_board) + F.linear(
            expanded_hands, self.hand_delta.weight, None
        )
        return (shared + delta).reshape(batch, 2, self.HIDDEN)

    def forward(
        self,
        board_idx: torch.Tensor,
        hands: torch.Tensor,
        buckets: torch.Tensor,
    ) -> torch.Tensor:
        accumulators = self.view_accumulators(board_idx, hands, buckets)
        us = torch.clamp(accumulators[:, 0], 0.0, 1.0)
        them = torch.clamp(accumulators[:, 1], 0.0, 1.0)
        relative = self.king_pair(king_pair_relative_index(buckets))
        mixed = torch.cat((us, them, us - them, us * them, relative), dim=1)
        hidden1 = torch.clamp(self.mix1(mixed), 0.0, 1.0)
        hidden2 = torch.clamp(self.mix2(hidden1), 0.0, 1.0)
        return self.output(hidden2).squeeze(-1)

    def materialized_first_layer(self) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Return deployment board/hand tables and their shared bias."""

        with torch.no_grad():
            board = self.board_delta.weight[: self.board_feats]
            board = board + self.board_shared.weight[:BOARD_FEATS].repeat(
                self.bucket_count, 1
            )
            hand = self.hand_delta.weight.t().contiguous()
            hand = hand + self.hand_shared.weight.t().repeat(self.bucket_count, 1)
            return board, hand, self.hand_delta.bias

    @classmethod
    def deployment_contract(cls) -> dict[str, int]:
        """Static dimensions used by the later exporter/runtime gate."""

        first_layer_lanes_per_position = 2 * cls.HIDDEN
        dense_macs = (cls.HIDDEN * 4 + cls.KING_EMBED) * cls.MIX1
        dense_macs += cls.MIX1 * cls.MIX2 + cls.MIX2
        return {
            "perspectives": 2,
            "hidden_per_perspective": cls.HIDDEN,
            "first_layer_lanes_per_position": first_layer_lanes_per_position,
            "king_relative_buckets": KING_RELATIVE_BUCKETS,
            "dense_macs_per_eval": dense_macs,
        }
