import importlib.util
import os
import sys
import unittest

import torch
from torch import nn


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from int16_forward import (  # noqa: E402
    ACT_SCALE,
    INT32_MAX,
    OUT_SCALE,
    W_SCALE,
    arithmetic_shift_six,
    effective_w1,
    int16_forward,
    int16_forward_batch,
    int16_forward_ste,
    quantize_model,
)
from train import BOARD_FEATS, DistillNet  # noqa: E402


EXPORT_SPEC = importlib.util.spec_from_file_location(
    "export_weights_for_int16_test", os.path.join(ML_DIR, "export-weights.py")
)
assert EXPORT_SPEC is not None and EXPORT_SPEC.loader is not None
EXPORT = importlib.util.module_from_spec(EXPORT_SPEC)
EXPORT_SPEC.loader.exec_module(EXPORT)


class TinyNet(nn.Module):
    """Small duck-typed DistillNet contract for exhaustive fixed-point tests."""

    def __init__(self, *, factored=False):
        super().__init__()
        self.features = "kp-factor" if factored else "board"
        self.kp = factored
        self.factored = factored
        self.board_feats = 6 if factored else 3
        self.hand_feats = 3 if factored else 2
        self.pad_idx = self.board_feats
        self.board = nn.EmbeddingBag(
            self.board_feats + 1, 2, mode="sum", padding_idx=self.pad_idx
        )
        self.hand = nn.Linear(self.hand_feats, 2)
        self.l2 = nn.Linear(2, 2)
        self.l3 = nn.Linear(2, 1)
        if factored:
            self.board_shared = nn.EmbeddingBag(3, 2, mode="sum", padding_idx=2)
            self.hand_shared = nn.Linear(1, 2, bias=False)

        with torch.no_grad():
            for parameter in self.parameters():
                parameter.fill_(0.01)
            self.hand.bias.fill_(0.2)
            self.l2.bias.fill_(0.2)
            self.l3.bias.fill_(0.1)
            self.board.weight[self.pad_idx].zero_()
            if factored:
                self.board_shared.weight[2].zero_()


def old_exporter_quantization(model):
    """Independent copy of the pre-refactor exporter equations."""
    with torch.no_grad():
        w1_board, w1_hand, b1 = model.materialized_w1()
        return {
            "w1_board": torch.round(w1_board * ACT_SCALE)
            .clamp(-32768, 32767)
            .to(torch.int16),
            "w1_hand": torch.round(w1_hand * ACT_SCALE)
            .clamp(-32768, 32767)
            .to(torch.int16),
            "b1": torch.round(b1 * ACT_SCALE).to(torch.int32),
            "w2": torch.round(model.l2.weight * W_SCALE)
            .clamp(-32768, 32767)
            .to(torch.int16),
            "b2": torch.round(model.l2.bias * ACT_SCALE * W_SCALE).to(torch.int32),
            "w3": torch.round(model.l3.weight.squeeze(0) * W_SCALE)
            .clamp(-32768, 32767)
            .to(torch.int16),
            "b3": torch.round(model.l3.bias * ACT_SCALE * W_SCALE).to(torch.int32),
        }


def scalar_reference(qweights, board_idx, hands, pad_idx):
    acc = [int(value) for value in qweights["b1"].tolist()]
    for feature in board_idx:
        if feature != pad_idx:
            for hidden, value in enumerate(qweights["w1_board"][feature].tolist()):
                acc[hidden] += int(value)
    for feature, count in enumerate(hands):
        for hidden, value in enumerate(qweights["w1_hand"][feature].tolist()):
            acc[hidden] += int(value) * int(count)
    h1 = [max(0, min(ACT_SCALE, value)) for value in acc]
    h2 = []
    for row, bias in zip(qweights["w2"].tolist(), qweights["b2"].tolist()):
        a2 = sum(int(weight) * value for weight, value in zip(row, h1)) + int(bias)
        # Python // is floor division, exactly matching signed arithmetic >> 6.
        h2.append(max(0, min(ACT_SCALE, a2 // W_SCALE)))
    return sum(
        int(weight) * value for weight, value in zip(qweights["w3"].tolist(), h2)
    ) + int(qweights["b3"].item())


class Int16ForwardTests(unittest.TestCase):
    def test_quantizer_is_byte_identical_to_old_exporter_for_all_feature_modes(self):
        for features in ("board", "kp", "kp-factor"):
            with self.subTest(features=features):
                torch.manual_seed(1234)
                model = DistillNet(features)
                expected = old_exporter_quantization(model)
                actual = quantize_model(model)
                exported, metadata = EXPORT.quantize(model, 600.0)
                self.assertEqual(metadata["scales"], {"act": 127, "w2": 64, "w3": 64})
                for name in expected:
                    self.assertTrue(torch.equal(actual[name], expected[name]), name)
                    self.assertTrue(torch.equal(exported[name], expected[name]), name)

    def test_round_half_even_int16_clamp_and_bias_rounding(self):
        model = TinyNet()
        with torch.no_grad():
            model.board.weight.zero_()
            model.board.weight[0] = torch.tensor([0.5, 1.5]) / ACT_SCALE
            model.board.weight[1] = torch.tensor([2.5, -0.5]) / ACT_SCALE
            model.board.weight[2] = torch.tensor([1_000_000.0, -1_000_000.0])
            model.hand.bias[:] = torch.tensor([0.5, 1.5]) / ACT_SCALE
            model.l2.bias[:] = torch.tensor([2.5, -0.5]) / OUT_SCALE

        quantized = quantize_model(model)
        self.assertEqual(quantized["w1_board"][0].tolist(), [0, 2])
        self.assertEqual(quantized["w1_board"][1].tolist(), [2, 0])
        self.assertEqual(quantized["w1_board"][2].tolist(), [32767, -32768])
        self.assertEqual(quantized["b1"].tolist(), [0, 2])
        self.assertEqual(quantized["b2"].tolist(), [2, 0])

        with torch.no_grad():
            model.l3.bias.fill_(1_000_000.0)
        with self.assertRaisesRegex(OverflowError, "b3 exceeds"):
            quantize_model(model)

    def test_signed_shift_is_arithmetic(self):
        values = torch.tensor([-129, -65, -64, -63, 0, 63, 64, 65, 129])
        self.assertEqual(
            arithmetic_shift_six(values).tolist(),
            [-3, -2, -1, -1, 0, 0, 1, 1, 2],
        )

    def test_batch_integer_forward_matches_scalar_arithmetic(self):
        qweights = {
            "w1_board": torch.tensor([[10, -3], [-4, 20], [7, 8]], dtype=torch.int16),
            "w1_hand": torch.tensor([[2, 1], [-5, 6]], dtype=torch.int16),
            "b1": torch.tensor([4, -2], dtype=torch.int32),
            "w2": torch.tensor([[64, -3], [-65, 70]], dtype=torch.int16),
            "b2": torch.tensor([-1, 63], dtype=torch.int32),
            "w3": torch.tensor([9, -11], dtype=torch.int16),
            "b3": torch.tensor([17], dtype=torch.int32),
        }
        board = torch.tensor([[0, 1, 3], [2, 2, 0]], dtype=torch.int64)
        hands = torch.tensor([[2, 0], [1, 3]], dtype=torch.float32)
        actual = int16_forward_batch(qweights, board, hands, pad_idx=3)
        expected = torch.tensor(
            [
                scalar_reference(qweights, board[0].tolist(), hands[0].tolist(), 3),
                scalar_reference(qweights, board[1].tolist(), hands[1].tolist(), 3),
            ],
            dtype=torch.int64,
        )
        self.assertTrue(torch.equal(actual, expected))
        self.assertEqual(
            int16_forward(qweights, board[0], hands[0], 3), int(expected[0].item())
        )
        self.assertEqual(EXPORT.int_forward(qweights, board[0], hands[0], 3), expected[0])

    def test_int32_accumulator_overflow_is_rejected_before_wraparound(self):
        qweights = {
            # The second term cancels the first. A final-only check would see
            # INT32_MAX and miss the transient deployed-int32 overflow.
            "w1_board": torch.tensor([[1], [-1]], dtype=torch.int16),
            "w1_hand": torch.tensor([[0]], dtype=torch.int16),
            "b1": torch.tensor([INT32_MAX], dtype=torch.int32),
            "w2": torch.tensor([[0]], dtype=torch.int16),
            "b2": torch.tensor([0], dtype=torch.int32),
            "w3": torch.tensor([0], dtype=torch.int16),
            "b3": torch.tensor([0], dtype=torch.int32),
        }
        with self.assertRaisesRegex(OverflowError, "first-layer board accumulator"):
            int16_forward(qweights, [0, 1], [0], pad_idx=2)

    def test_effective_factored_tables_keep_shared_and_delta_gradients(self):
        model = TinyNet(factored=True)
        board, hand, bias = effective_w1(model)
        self.assertEqual(tuple(board.shape), (6, 2))
        self.assertEqual(tuple(hand.shape), (3, 2))
        (board.sum() + hand.sum() + bias.sum()).backward()
        for name in (
            "board.weight",
            "hand.weight",
            "hand.bias",
            "board_shared.weight",
            "hand_shared.weight",
        ):
            parameter = dict(model.named_parameters())[name]
            self.assertIsNotNone(parameter.grad, name)
            self.assertTrue(torch.isfinite(parameter.grad).all(), name)

    def test_ste_forward_is_exact_and_all_parameters_receive_finite_gradients(self):
        cases = [
            (
                TinyNet(),
                torch.tensor([[0, 1, 3], [2, 3, 0]]),
                torch.tensor([[1.0, 0.0], [0.0, 2.0]]),
                None,
            ),
            (
                TinyNet(factored=True),
                torch.tensor([[0, 1, 6], [4, 5, 6]]),
                torch.tensor([[2.0], [1.0]]),
                torch.tensor([0, 2]),
            ),
        ]
        for model, board, hands, bucket in cases:
            with self.subTest(features=model.features):
                logits, out_q = int16_forward_ste(model, board, hands, bucket)
                self.assertEqual(logits.dtype, torch.float64)
                self.assertEqual(out_q.dtype, torch.int64)
                self.assertTrue(torch.equal(logits, out_q.to(torch.float64) / OUT_SCALE))
                logits.square().sum().backward()
                for name, parameter in model.named_parameters():
                    self.assertIsNotNone(parameter.grad, name)
                    self.assertTrue(torch.isfinite(parameter.grad).all(), name)

    def test_actual_kp_and_factored_models_match_integer_reference(self):
        for features in ("kp", "kp-factor"):
            with self.subTest(features=features):
                torch.manual_seed(7)
                model = DistillNet(features)
                bucket = torch.tensor([2], dtype=torch.int64)
                board = torch.tensor(
                    [[2 * BOARD_FEATS, 2 * BOARD_FEATS + 17, model.pad_idx]],
                    dtype=torch.int64,
                )
                hands = torch.zeros((1, 14), dtype=torch.float32)
                hands[0, 3] = 2
                logits, out_q = int16_forward_ste(model, board, hands, bucket)
                expanded_hands = torch.zeros((1, model.hand_feats), dtype=torch.float32)
                expanded_hands[0, 2 * 14 + 3] = 2
                expected = int16_forward_batch(
                    quantize_model(model), board, expanded_hands, model.pad_idx
                )
                self.assertTrue(torch.equal(out_q, expected))
                self.assertTrue(torch.equal(logits, expected.to(torch.float64) / OUT_SCALE))


if __name__ == "__main__":
    unittest.main()
