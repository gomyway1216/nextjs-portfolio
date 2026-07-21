import os
import sys
import unittest
from types import SimpleNamespace
from unittest import mock

import torch
import torch.nn.functional as F


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from train import (  # noqa: E402
    BOARD_FEATS,
    DistillNet,
    configure_halfkp_training_scope,
    validate_training_hyperparameters,
)


def valid_args(**overrides):
    values = {
        "k": 600.0,
        "cp_clamp": 3000,
        "init_ckpt": "",
        "halfkp_lift_init": "",
        "epochs": 1,
        "batch": 2,
        "lr": 1e-3,
        "val_ratio": 0.1,
        "limit": 0,
        "replay_ratio": 0.0,
        "replay_limit": 0,
        "rank_weight": 1.0,
        "policy_weight": 0.25,
        "rank_pair_min": 50.0,
        "rank_pair_max": 600.0,
        "rank_margin_cp": 50.0,
        "policy_temp_cp": 200.0,
        "loss": "sigmoid",
        "features": "halfkp-factor",
        "halfkp_lift_init": "stable-board.pt",
        "halfkp_train_scope": "all",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class HalfkpTrainingControlsTests(unittest.TestCase):
    def small_model(self):
        h1 = mock.patch.object(DistillNet, "H1", 4)
        h2 = mock.patch.object(DistillNet, "H2", 3)
        h1.start()
        h2.start()
        self.addCleanup(h2.stop)
        self.addCleanup(h1.stop)
        return DistillNet("halfkp-factor")

    def test_delta_only_step_changes_only_effective_delta_tables(self):
        torch.manual_seed(7)
        model = self.small_model()
        with torch.no_grad():
            model.board_shared.weight.fill_(0.02)
            model.hand_shared.weight.fill_(0.01)
            model.hand.bias.fill_(0.1)
            model.l2.weight.fill_(0.2)
            model.l2.bias.fill_(0.1)
            model.l3.weight.fill_(0.3)
            model.l3.bias.fill_(0.0)
            model.board.weight[model.pad_idx].fill_(123.0)

        trainable = configure_halfkp_training_scope(model, "delta-only")
        self.assertEqual(set(trainable), {model.board.weight, model.hand.weight})
        frozen_before = {
            name: parameter.detach().clone()
            for name, parameter in model.named_parameters()
            if not parameter.requires_grad
        }
        pad_before = model.board.weight[model.pad_idx].detach().clone()
        self.assertEqual(float(pad_before.abs().sum()), 0.0)

        bucket = torch.tensor([3, 12], dtype=torch.long)
        board = torch.full((2, 2), model.pad_idx, dtype=torch.long)
        active_rows = [3 * BOARD_FEATS + 10, 12 * BOARD_FEATS + 20]
        board[:, 0] = torch.tensor(active_rows)
        hands = torch.zeros(2, 14)
        hands[0, 0] = 1.0
        hands[1, 1] = 2.0
        target = torch.tensor([0.9, 0.1])

        optimizer = torch.optim.AdamW(trainable, lr=1e-2)
        output = model(board, hands, bucket)
        loss = F.mse_loss(torch.sigmoid(output), target)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        for name, before in frozen_before.items():
            self.assertTrue(
                torch.equal(before, dict(model.named_parameters())[name]), name
            )
        self.assertFalse(
            torch.equal(
                model.board.weight[active_rows],
                torch.zeros_like(model.board.weight[active_rows]),
            )
        )
        self.assertFalse(torch.equal(model.hand.weight, torch.zeros_like(model.hand.weight)))
        self.assertTrue(torch.equal(pad_before, model.board.weight[model.pad_idx]))

    def test_all_scope_default_preserves_existing_behavior(self):
        model = self.small_model()
        trainable = configure_halfkp_training_scope(model)
        self.assertEqual(len(trainable), len(tuple(model.parameters())))
        self.assertTrue(all(parameter.requires_grad for parameter in model.parameters()))
        validate_training_hyperparameters(valid_args())

        legacy_compatible = valid_args()
        del legacy_compatible.halfkp_train_scope
        validate_training_hyperparameters(legacy_compatible)

    def test_incompatible_scopes_and_regularization_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "delta-only training requires"):
            configure_halfkp_training_scope(DistillNet("board"), "delta-only")
        with self.assertRaisesRegex(ValueError, "delta-only requires"):
            validate_training_hyperparameters(
                valid_args(features="board", halfkp_train_scope="delta-only")
            )
        with self.assertRaisesRegex(ValueError, "requires --halfkp-lift-init"):
            validate_training_hyperparameters(
                valid_args(halfkp_train_scope="delta-only", halfkp_lift_init="")
            )


if __name__ == "__main__":
    unittest.main()
