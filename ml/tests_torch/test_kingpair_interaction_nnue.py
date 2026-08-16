import os
import sys
import unittest

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from kingpair_interaction_nnue import (  # noqa: E402
    BOARD_FEATS,
    HAND_FEATS,
    KingPairInteractionNNUE,
    king_pair_relative_index,
)


class KingPairInteractionNNUETests(unittest.TestCase):
    def test_relative_king_bucket_uses_the_side_to_move_view(self):
        # own=(4,8), opponent=(4,0).  The opponent-view local king is the
        # 180-degree rotation of (4,0), namely square (4,8).
        buckets = torch.tensor([[4 * 9 + 8, 4 * 9 + 8]], dtype=torch.int64)
        self.assertEqual(int(king_pair_relative_index(buckets)[0]), 8 * 17)

        with self.assertRaisesRegex(ValueError, "out of range"):
            king_pair_relative_index(torch.tensor([[81, 0]], dtype=torch.int64))

    def test_forward_uses_both_views_and_preserves_the_cost_contract(self):
        torch.manual_seed(20260810)
        model = KingPairInteractionNNUE()
        buckets = torch.tensor([[76, 76], [67, 67]], dtype=torch.int64)
        pad = model.pad_idx
        board = torch.full((2, 2, 4), pad, dtype=torch.int64)
        for row in range(2):
            for view in range(2):
                bucket = int(buckets[row, view])
                board[row, view, 0] = bucket * BOARD_FEATS + view * 81 + row
                board[row, view, 1] = bucket * BOARD_FEATS + (14 + view) * 81 + 10
        hands = torch.zeros((2, 2, HAND_FEATS), dtype=torch.float32)
        hands[0, 0, 0] = 2
        hands[0, 1, 7] = 1

        output = model(board, hands, buckets)
        self.assertEqual(tuple(output.shape), (2,))
        self.assertTrue(bool(torch.isfinite(output).all()))
        output.square().sum().backward()
        self.assertIsNotNone(model.board_shared.weight.grad)
        self.assertIsNotNone(model.board_delta.weight.grad)
        self.assertIsNotNone(model.king_pair.weight.grad)

        contract = model.deployment_contract()
        self.assertEqual(contract["first_layer_lanes_per_position"], 256)
        self.assertLess(contract["dense_macs_per_eval"], 40_000)

    def test_materialized_first_layer_matches_factorized_accumulators(self):
        torch.manual_seed(81)
        model = KingPairInteractionNNUE()
        with torch.no_grad():
            model.board_delta.weight.normal_(std=0.002)
            model.board_delta.weight[model.pad_idx].zero_()
            model.hand_delta.weight.normal_(std=0.002)

        buckets = torch.tensor([[72, 70]], dtype=torch.int64)
        board = torch.full((1, 2, 3), model.pad_idx, dtype=torch.int64)
        board[0, 0, :2] = torch.tensor(
            [72 * BOARD_FEATS + 4, 72 * BOARD_FEATS + 130]
        )
        board[0, 1, :2] = torch.tensor(
            [70 * BOARD_FEATS + 9, 70 * BOARD_FEATS + 240]
        )
        hands = torch.zeros((1, 2, HAND_FEATS), dtype=torch.float32)
        hands[0, 0, 0] = 2
        hands[0, 1, 8] = 1

        factorized = model.view_accumulators(board, hands, buckets)
        table, hand_table, bias = model.materialized_first_layer()
        expected = []
        for view in range(2):
            active = board[0, view][board[0, view] != model.pad_idx]
            value = table[active].sum(dim=0)
            start = int(buckets[0, view]) * HAND_FEATS
            value = value + hands[0, view] @ hand_table[start : start + HAND_FEATS]
            value = value + bias
            expected.append(value)
        expected_tensor = torch.stack(expected).unsqueeze(0)
        self.assertTrue(torch.allclose(factorized, expected_tensor, atol=1e-6, rtol=0))


if __name__ == "__main__":
    unittest.main()
