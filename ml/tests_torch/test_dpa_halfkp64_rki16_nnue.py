import os
from pathlib import Path
import sys
import tempfile
import unittest

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from dpa_halfkp64_rki16_nnue import (  # noqa: E402
    BOARD_FEATURES,
    DpaHalfkp64Rki16NNUE,
    HAND_FEATURES,
    HIDDEN,
    PAD_INDEX,
    RELATIVE_HIDDEN,
    TRAINABLE_PARAMETERS,
)
from train import MAX_PIECES  # noqa: E402
from train_dpa_halfkp64_rki16_nnue import (  # noqa: E402
    LEARNING_RATE,
    WEIGHT_DECAY,
    load_checkpoint,
    save_checkpoint,
)


def fixture_inputs(batch: int = 3):
    generator = torch.Generator().manual_seed(17)
    board = torch.randint(
        0, BOARD_FEATURES, (batch, 2, MAX_PIECES), generator=generator
    )
    board[:, :, -3:] = PAD_INDEX
    hands = torch.randint(
        0, 3, (batch, 2, 14), generator=generator
    ).float()
    buckets = torch.randint(0, 81, (batch, 2), generator=generator)
    return board, hands, buckets


class DpaHalfkp64Rki16NnueTests(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(20260810)

    def test_payload_parameter_count_and_strict_antisymmetry(self):
        model = DpaHalfkp64Rki16NNUE()
        trainable = sum(
            parameter.numel()
            for parameter in model.parameters()
            if parameter.requires_grad
        )
        self.assertEqual(trainable, TRAINABLE_PARAMETERS)
        self.assertEqual(trainable, 11_832_560)
        self.assertFalse(model.first_bias.requires_grad)

        payload = model.deployment_tensors()
        self.assertEqual(payload.board_w1.shape, (BOARD_FEATURES, HIDDEN))
        self.assertEqual(payload.hand_w1.shape, (HAND_FEATURES, HIDDEN))
        self.assertEqual(payload.first_bias.shape, (HIDDEN,))
        self.assertEqual(payload.output_weight.shape, (HIDDEN,))
        self.assertEqual(payload.relative_self.shape, (81, RELATIVE_HIDDEN))
        self.assertEqual(payload.relative_other.shape, (81, RELATIVE_HIDDEN))
        self.assertEqual(payload.relative_output.shape, (RELATIVE_HIDDEN,))
        self.assertTrue(bool(torch.all(payload.first_bias == 0)))

        board, hands, buckets = fixture_inputs()
        forward = model(board, hands, buckets)
        reverse = model(board.flip(1), hands.flip(1), buckets.flip(1))
        torch.testing.assert_close(forward, -reverse, rtol=0.0, atol=1e-7)

    def test_relative_term_is_integrated_and_backward_reaches_all_weights(self):
        model = DpaHalfkp64Rki16NNUE()
        board, hands, buckets = fixture_inputs()
        output = model(board, hands, buckets)
        loss = output.square().mean()
        self.assertTrue(bool(torch.isfinite(output).all()))
        self.assertTrue(bool(torch.isfinite(loss)))
        loss.backward()
        for name, parameter in model.named_parameters():
            self.assertIsNotNone(parameter.grad, name)
            self.assertTrue(bool(torch.isfinite(parameter.grad).all()), name)
        self.assertIsNone(model.first_bias.grad)

        with torch.no_grad():
            model.board_w1.zero_()
            model.hand_w1.zero_()
            model.output_weight.zero_()
            model.relative_self.zero_()
            model.relative_other.zero_()
            model.relative_output.zero_()
            model.relative_self[3, 0] = 1.0
            model.relative_other[68, 0] = 1.0
            model.relative_output[0] = 2.0
        selected_buckets = torch.tensor([[3, 12]])
        selected_board = torch.full((1, 2, MAX_PIECES), PAD_INDEX)
        selected_hands = torch.zeros((1, 2, 14))
        value = model(selected_board, selected_hands, selected_buckets)
        self.assertGreater(float(value), 0.0)
        reverse = model(
            selected_board.flip(1),
            selected_hands.flip(1),
            selected_buckets.flip(1),
        )
        torch.testing.assert_close(value, -reverse, rtol=0.0, atol=0.0)

    def test_deployment_contract_has_no_auxiliary_head_or_scalar_bias(self):
        contract = DpaHalfkp64Rki16NNUE.deployment_contract()
        self.assertEqual(contract["family"], "dpa-halfkp64-rki16")
        self.assertEqual(contract["relative_king_lanes"], 16)
        self.assertEqual(contract["scalar_output_bias"], 0)
        self.assertEqual(contract["auxiliary_heads"], 0)
        self.assertEqual(contract["trainable_parameters"], 11_832_560)

    def test_checkpoint_roundtrip_is_same_family_and_create_only(self):
        model = DpaHalfkp64Rki16NNUE()
        optimizer = torch.optim.AdamW(
            model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY
        )
        board, hands, buckets = fixture_inputs(batch=1)
        expected = model(board, hands, buckets).detach()
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "epoch-01.pt"
            save_checkpoint(checkpoint, model, optimizer, epoch=1)
            restored = DpaHalfkp64Rki16NNUE()
            restored_optimizer = torch.optim.AdamW(
                restored.parameters(),
                lr=LEARNING_RATE,
                weight_decay=WEIGHT_DECAY,
            )
            self.assertEqual(
                load_checkpoint(checkpoint, restored, restored_optimizer), 1
            )
            actual = restored(board, hands, buckets).detach()
            torch.testing.assert_close(actual, expected, rtol=0.0, atol=0.0)
            with self.assertRaises(FileExistsError):
                save_checkpoint(checkpoint, model, optimizer, epoch=1)


if __name__ == "__main__":
    unittest.main()
