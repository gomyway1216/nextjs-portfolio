import importlib.util
import json
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace

import torch
from torch import nn


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from int16_forward import (  # noqa: E402
    OUT_SCALE,
    int16_forward_batch,
    int16_forward_ste,
    quantize_model,
)
from train import (  # noqa: E402
    BOARD_FEATS,
    HALFKP_BUCKETS,
    HAND_FEATS,
    DistillNet,
    configure_halfkp_training_scope,
    dual_views_from_normalized_features,
    lift_board_model_to_halfkp_factor,
    load_dataset,
    parse_sfen,
    parse_sfen_dual,
)


EXPORT_SPEC = importlib.util.spec_from_file_location(
    "export_weights_for_dual_test", os.path.join(ML_DIR, "export-weights.py")
)
assert EXPORT_SPEC is not None and EXPORT_SPEC.loader is not None
EXPORT = importlib.util.module_from_spec(EXPORT_SPEC)
EXPORT_SPEC.loader.exec_module(EXPORT)


class DualHalfKPTests(unittest.TestCase):
    START = (
        "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/"
        "PPPPPPPPP/1B5R1/LNSGKGSNL b 2P3p 1"
    )

    def test_opponent_view_swaps_color_rotates_board_and_swaps_hands(self):
        indices, hands, black_to_move, king_sq = parse_sfen(self.START)
        dual_indices, dual_hands, dual_black_to_move, king_squares = (
            parse_sfen_dual(self.START)
        )
        self.assertTrue(black_to_move)
        self.assertEqual(dual_black_to_move, black_to_move)
        self.assertEqual(dual_indices[0], indices)
        self.assertEqual(dual_hands[0], hands)
        self.assertEqual(dual_hands[1], hands[7:] + hands[:7])
        self.assertEqual(king_squares[0], king_sq)

        expected_them = []
        opponent_king = None
        for feature in indices:
            plane, square = divmod(feature, 81)
            if plane == 21:
                opponent_king = 80 - square
            expected_them.append(
                ((plane + 14 if plane < 14 else plane - 14) * 81)
                + (80 - square)
            )
        self.assertEqual(dual_indices[1], expected_them)
        self.assertEqual(king_squares[1], opponent_king)

        direct = dual_views_from_normalized_features(indices, hands, king_sq)
        self.assertEqual(direct, (dual_indices, dual_hands, king_squares))

    def test_dataset_emits_two_deterministic_bucketed_views(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "dual.jsonl")
            with open(path, "w", encoding="utf-8", newline="\n") as target:
                target.write(json.dumps({"sfen": self.START, "cp": 17}) + "\n")
            board, hands, _targets, cp, buckets = load_dataset(
                path, 600.0, 3000, features="halfkp-dual-factor"
            )

        self.assertEqual(tuple(board.shape), (1, 2, 40))
        self.assertEqual(tuple(hands.shape), (1, 2, HAND_FEATS))
        self.assertEqual(tuple(buckets.shape), (1, 2))
        self.assertEqual(cp.tolist(), [17.0])
        pad_idx = HALFKP_BUCKETS * BOARD_FEATS
        for view in range(2):
            bucket = int(buckets[0, view])
            active = board[0, view][board[0, view] != pad_idx]
            self.assertTrue(bool((active >= bucket * BOARD_FEATS).all()))
            self.assertTrue(bool((active < (bucket + 1) * BOARD_FEATS).all()))
        self.assertEqual(hands[0, 1].tolist(), hands[0, 0, 7:].tolist() + hands[0, 0, :7].tolist())

    def test_board_lift_is_float_and_int16_bit_exact(self):
        torch.manual_seed(20260721)
        source = DistillNet("board")
        target = DistillNet("halfkp-dual-factor")
        lift_board_model_to_halfkp_factor(target, source)

        buckets = torch.tensor([[0, 80], [44, 17], [80, 0]], dtype=torch.int64)
        source_board = torch.tensor(
            [[0, 17, source.pad_idx], [120, 777, source.pad_idx], [80, 900, 1000]],
            dtype=torch.int64,
        )
        target_board = torch.empty((3, 2, 3), dtype=torch.int64)
        for row in range(3):
            for view in range(2):
                raw = source_board[row] if view == 0 else source_board[2 - row]
                active = raw != source.pad_idx
                target_board[row, view] = torch.where(
                    active,
                    raw + buckets[row, view] * BOARD_FEATS,
                    torch.full_like(raw, target.pad_idx),
                )
        source_hands = torch.zeros((3, HAND_FEATS), dtype=torch.float32)
        source_hands[0, 0] = 2
        source_hands[1, 6] = 1
        source_hands[2, 10] = 3
        target_hands = torch.zeros((3, 2, HAND_FEATS), dtype=torch.float32)
        target_hands[:, 0] = source_hands
        target_hands[:, 1] = source_hands.flip(0)

        with torch.no_grad():
            source_float = source(
                source_board, source_hands, torch.zeros(3, dtype=torch.int64)
            )
            target_float = target(target_board, target_hands, buckets)
        self.assertTrue(torch.equal(target_float, source_float))

        source_q = quantize_model(source)
        target_q = quantize_model(target)
        expanded_target_hands = torch.zeros(
            (3, 2, target.hand_feats), dtype=torch.float32
        )
        for row in range(3):
            for view in range(2):
                start = int(buckets[row, view]) * HAND_FEATS
                expanded_target_hands[row, view, start : start + HAND_FEATS] = (
                    target_hands[row, view]
                )
        source_int = int16_forward_batch(
            source_q, source_board, source_hands, source.pad_idx
        )
        target_int = int16_forward_batch(
            target_q, target_board, expanded_target_hands, target.pad_idx
        )
        self.assertTrue(torch.equal(target_int, source_int))
        self.assertTrue(torch.equal(target_q["w2"][:, :256], source_q["w2"]))
        self.assertEqual(int(torch.count_nonzero(target_q["w2"][:, 256:])), 0)
        self.assertTrue(
            torch.equal(target_q["w3"], torch.eye(32, dtype=torch.int16) * 64)
        )
        self.assertEqual(int(torch.count_nonzero(target_q["b3"])), 0)
        self.assertTrue(torch.equal(target_q["w4"], source_q["w3"]))
        self.assertTrue(torch.equal(target_q["b4"], source_q["b3"]))

    def test_export_has_shared_table_and_exact_v3_layout_size(self):
        model = DistillNet("halfkp-dual-factor")
        quantized, metadata = EXPORT.quantize(model, 600.0)
        byte_count = sum(
            tensor.numel() * tensor.element_size() for tensor in quantized.values()
        )
        self.assertEqual(byte_count, 94_675_268)
        self.assertEqual(metadata["format"], "shogi-distill-v3-dual-halfkp")
        self.assertEqual(metadata["features"], "halfkp-dual-factor")
        self.assertEqual(metadata["kp_buckets"], 81)
        self.assertEqual(metadata["dims"]["perspectives"], 2)
        self.assertEqual(metadata["layout"][-4:], [
            "w3 int16 x 32*32 (row-major)",
            "b3 int32 x 32",
            "w4 int16 x 32",
            "b4 int32 x 1",
        ])

    def test_small_dual_integer_forward_runs_all_four_layers(self):
        class TinyDual(nn.Module):
            def __init__(self):
                super().__init__()
                self.features = "halfkp-dual"
                self.dual = True
                self.factored = False
                self.board_feats = 3
                self.hand_feats = 2
                self.pad_idx = 3
                self.board = nn.EmbeddingBag(4, 2, mode="sum", padding_idx=3)
                self.hand = nn.Linear(2, 2)
                self.l2 = nn.Linear(4, 2)
                self.l3 = nn.Linear(2, 2)
                self.l4 = nn.Linear(2, 1)

        torch.manual_seed(9)
        model = TinyDual()
        board = torch.tensor([[[0, 3], [1, 2]], [[2, 0], [3, 1]]])
        hands = torch.tensor(
            [[[1.0, 0.0], [0.0, 2.0]], [[2.0, 1.0], [1.0, 1.0]]]
        )
        qweights = quantize_model(model)
        output = int16_forward_batch(qweights, board, hands, model.pad_idx)
        self.assertEqual(tuple(output.shape), (2,))
        self.assertEqual(output.dtype, torch.int64)
        self.assertTrue(bool(torch.isfinite(output.to(torch.float64)).all()))
        logits, ste_output = int16_forward_ste(model, board, hands)
        self.assertTrue(torch.equal(output, ste_output))
        self.assertTrue(torch.equal(logits, output.to(torch.float64) / OUT_SCALE))
        logits.square().sum().backward()
        for name, parameter in model.named_parameters():
            self.assertIsNotNone(parameter.grad, name)
            self.assertTrue(bool(torch.isfinite(parameter.grad).all()), name)

    def test_dual_delta_only_is_rejected_before_freezing_opponent_path(self):
        with self.assertRaisesRegex(
            ValueError, "freeze the zero-initialized opponent dense path"
        ):
            configure_halfkp_training_scope(
                SimpleNamespace(features="halfkp-dual-factor"), "delta-only"
            )


if __name__ == "__main__":
    unittest.main()
