import os
import sys
import unittest
from dataclasses import replace
from unittest import mock

import torch
from torch import nn
from torch.nn import functional as F


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from int16_forward import quantize_model  # noqa: E402
import strength_first_quantized_cell_alignment as ALIGN  # noqa: E402
from strength_first_quantized_cell_alignment import (  # noqa: E402
    ANCHOR_SCHEMA,
    QUANTIZED_TENSOR_NAMES,
    alignment_consistency_loss,
    anchor_identity,
    assert_quantized_anchor,
    canonical_quantized_bit_hashes,
    capture_quantized_anchor,
    project_optimizer_step_to_anchor,
)


class TinyBoardDistillNet(nn.Module):
    """Small exact board DistillNet contract for projection tests."""

    def __init__(self):
        super().__init__()
        self.features = "board"
        self.kp = False
        self.factored = False
        self.board_feats = 4
        self.hand_feats = 2
        self.pad_idx = self.board_feats
        self.board = nn.EmbeddingBag(
            self.board_feats + 1,
            3,
            mode="sum",
            padding_idx=self.pad_idx,
        )
        self.hand = nn.Linear(self.hand_feats, 3)
        self.l2 = nn.Linear(3, 2)
        self.l3 = nn.Linear(2, 1)
        with torch.no_grad():
            for parameter in self.parameters():
                parameter.zero_()
            # The projector restores the captured parent pad row, rather than
            # assuming that its value happens to be zero.
            self.board.weight[self.pad_idx].fill_(0.125)


def initialized_adam(model):
    optimizer = torch.optim.Adam(model.parameters(), lr=0.0, amsgrad=True)
    zero_loss = sum(parameter.sum() for parameter in model.parameters()) * 0.0
    zero_loss.backward()
    optimizer.step()
    optimizer.zero_grad(set_to_none=True)
    return optimizer


class QuantizedCellProjectionTests(unittest.TestCase):
    def test_all_seven_quantized_masks_restore_the_correct_source_coordinates(self):
        model = TinyBoardDistillNet()
        anchor = capture_quantized_anchor(model)
        optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)

        with torch.no_grad():
            model.board.weight[0, 1] = 0.25
            # q[w1_hand][feature, hidden] maps to hand.weight[hidden, feature].
            model.hand.weight[2, 1] = 0.25
            model.hand.bias[0] = 0.25
            model.l2.weight[1, 2] = 0.25
            model.l2.bias[0] = 0.25
            # q[w3] maps to the only l3 weight row; b3 remains a length-1 scalar.
            model.l3.weight[0, 1] = 0.25
            model.l3.bias[0] = 0.25
            # This coordinate remains inside q=0 and must not be rolled back.
            model.board.weight[1, 2] = 1e-5

        expected_changed_coordinates = {
            "w1_board": [[0, 1]],
            "w1_hand": [[1, 2]],
            "b1": [[0]],
            "w2": [[1, 2]],
            "b2": [[0]],
            "w3": [[1]],
            "b3": [[0]],
        }
        before = quantize_model(model)
        for name in QUANTIZED_TENSOR_NAMES:
            changed = (before[name] != anchor.quantized[name]).nonzero().tolist()
            self.assertEqual(changed, expected_changed_coordinates[name], name)

        receipt = project_optimizer_step_to_anchor(model, optimizer, anchor)

        for name in QUANTIZED_TENSOR_NAMES:
            self.assertEqual(receipt["quantized_crossing_coordinates"][name], 1, name)
            self.assertTrue(
                torch.equal(quantize_model(model)[name], anchor.quantized[name]),
                name,
            )
        self.assertEqual(receipt["total_quantized_crossing_coordinates"], 7)
        self.assertEqual(receipt["forced_padding_coordinates"], 3)
        self.assertEqual(receipt["total_restored_coordinates"], 10)
        self.assertEqual(model.board.weight[0, 1].detach().item(), 0.0)
        self.assertEqual(model.hand.weight[2, 1].detach().item(), 0.0)
        self.assertEqual(model.hand.bias[0].detach().item(), 0.0)
        self.assertEqual(model.l2.weight[1, 2].detach().item(), 0.0)
        self.assertEqual(model.l2.bias[0].detach().item(), 0.0)
        self.assertEqual(model.l3.weight[0, 1].detach().item(), 0.0)
        self.assertEqual(model.l3.bias[0].detach().item(), 0.0)
        self.assertAlmostEqual(model.board.weight[1, 2].detach().item(), 1e-5)

    def test_pad_row_and_all_adam_moments_are_cleared_only_at_source_masks(self):
        model = TinyBoardDistillNet()
        anchor = capture_quantized_anchor(model)
        optimizer = initialized_adam(model)
        moment_values = {
            "exp_avg": 1.0,
            "exp_avg_sq": 2.0,
            "max_exp_avg_sq": 3.0,
        }
        for parameter in model.parameters():
            state = optimizer.state[parameter]
            for name, value in moment_values.items():
                state[name].fill_(value)
        step_before = optimizer.state[model.hand.weight]["step"].clone()

        with torch.no_grad():
            # q coordinate [feature=0, hidden=1].
            model.hand.weight[1, 0] = 0.25
            model.board.weight[model.pad_idx].fill_(9.0)

        receipt = project_optimizer_step_to_anchor(model, optimizer, anchor)

        self.assertTrue(
            torch.equal(
                model.board.weight[model.pad_idx],
                anchor.float_state["board.weight"][model.pad_idx],
            )
        )
        for name, original_value in moment_values.items():
            board_moment = optimizer.state[model.board.weight][name]
            hand_moment = optimizer.state[model.hand.weight][name]
            self.assertTrue(torch.equal(board_moment[model.pad_idx], torch.zeros(3)))
            self.assertEqual(float(board_moment[0, 0]), original_value)
            self.assertEqual(float(hand_moment[1, 0]), 0.0)
            self.assertEqual(float(hand_moment[0, 0]), original_value)
            self.assertEqual(receipt["cleared_moment_coordinates"][name], 4)
        self.assertTrue(
            torch.equal(optimizer.state[model.hand.weight]["step"], step_before)
        )
        assert_quantized_anchor(model, anchor, context="moment projection test")

    def test_assertion_detects_drift_and_projection_restores_invariant(self):
        model = TinyBoardDistillNet()
        anchor = capture_quantized_anchor(model)
        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
        assert_quantized_anchor(model, anchor)

        with torch.no_grad():
            model.l2.weight[0, 0] = 0.5
        with self.assertRaisesRegex(AssertionError, r"w2\(1\)"):
            assert_quantized_anchor(model, anchor, context="deliberate drift")

        project_optimizer_step_to_anchor(model, optimizer, anchor)
        assert_quantized_anchor(model, anchor)

    def test_anchor_hashes_are_canonical_ordered_and_bit_sensitive(self):
        model = TinyBoardDistillNet()
        anchor = capture_quantized_anchor(model)
        expected_hashes = {
            "w1_board": "475adbeb31b876dc12d500efe1d3e23c2080a0153a6454bb8fa62e91f4b0595d",
            "w1_hand": "0bcf86cf53a6e1026128587fbe6681e7b33902a4873d974233cc222fdacb4ad4",
            "b1": "bfe7729fefa9a772ab1056bc3480fbd33a04233823ace2f58dedeabbdce8d3c4",
            "w2": "82fae74f72dedff0dab657608f93ff94b7d55253236ccfc63d35c46b601514b9",
            "b2": "460d6f1790b530b46a6a75befa3f470f824b1ff193ad034b75cc26c819c7b498",
            "w3": "05454794f037db46b4e15d79bf7d944e276e53ab32bf7cd2f8123d631c2402a4",
            "b3": "dc576e1ddc4168ac83f7004257b7f8fb5275cb973b9204a24ead6383b16511e7",
        }
        self.assertEqual(dict(anchor.per_tensor_sha256), expected_hashes)
        self.assertEqual(
            anchor.aggregate_sha256,
            "bc8220da1229163c6d4950a2bf787907f9b18aaeb75dbff000666007ab934cb3",
        )
        identity = anchor_identity(anchor)
        self.assertEqual(identity["schema"], ANCHOR_SCHEMA)
        self.assertEqual(list(identity["tensors"]), list(QUANTIZED_TENSOR_NAMES))
        self.assertEqual(identity["aggregate_sha256"], anchor.aggregate_sha256)
        self.assertEqual(anchor.parent_state, anchor.float_state)
        self.assertEqual(anchor.qweights, anchor.quantized)
        self.assertEqual(anchor.tensor_sha256, anchor.per_tensor_sha256)
        for name in QUANTIZED_TENSOR_NAMES:
            self.assertRegex(anchor.per_tensor_sha256[name], r"^[0-9a-f]{64}$")
            self.assertEqual(
                identity["tensors"][name]["sha256"],
                anchor.per_tensor_sha256[name],
            )

        equivalent = {name: value.clone() for name, value in anchor.quantized.items()}
        equivalent["w2"] = equivalent["w2"].transpose(0, 1).contiguous().transpose(0, 1)
        per_tensor, aggregate = canonical_quantized_bit_hashes(equivalent)
        self.assertEqual(per_tensor, dict(anchor.per_tensor_sha256))
        self.assertEqual(aggregate, anchor.aggregate_sha256)

        changed = {name: value.clone() for name, value in anchor.quantized.items()}
        changed["w3"][0] = 1
        changed_per_tensor, changed_aggregate = canonical_quantized_bit_hashes(changed)
        self.assertNotEqual(changed_per_tensor["w3"], per_tensor["w3"])
        for name in set(QUANTIZED_TENSOR_NAMES) - {"w3"}:
            self.assertEqual(changed_per_tensor[name], per_tensor[name])
        self.assertNotEqual(changed_aggregate, aggregate)

        with torch.no_grad():
            model.board.weight[0, 0] = 1.0
        self.assertEqual(float(anchor.float_state["board.weight"][0, 0]), 0.0)

    def test_projection_requantizes_directly_and_capture_seal_rejects_mutation(self):
        model = TinyBoardDistillNet()
        anchor = capture_quantized_anchor(model)
        optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)
        with torch.no_grad():
            model.l3.bias[0] = 0.25
        with (
            mock.patch.object(
                ALIGN,
                "quantize_model",
                wraps=quantize_model,
            ) as quantizer,
            mock.patch.object(
                ALIGN,
                "canonical_quantized_bit_hashes",
                wraps=canonical_quantized_bit_hashes,
            ) as hasher,
        ):
            project_optimizer_step_to_anchor(model, optimizer, anchor)
        # One snapshot detects crossings; the second is the required direct
        # post-restore invariant check.
        self.assertEqual(quantizer.call_count, 2)
        self.assertEqual(hasher.call_count, 1)
        for name in QUANTIZED_TENSOR_NAMES:
            self.assertTrue(
                torch.equal(quantize_model(model)[name], anchor.quantized[name])
            )

        for mapping_name, tensor_name in (
            ("quantized", "w3"),
            ("float_state", "l3.weight"),
        ):
            with self.subTest(mapping_name=mapping_name):
                fresh_model = TinyBoardDistillNet()
                fresh_anchor = capture_quantized_anchor(fresh_model)
                fresh_optimizer = torch.optim.AdamW(
                    fresh_model.parameters(),
                    lr=1e-3,
                )
                value = getattr(fresh_anchor, mapping_name)[tensor_name]
                with torch.no_grad():
                    value.reshape(-1)[0].add_(1)
                with self.assertRaisesRegex(ValueError, "changed after capture"):
                    project_optimizer_step_to_anchor(
                        fresh_model,
                        fresh_optimizer,
                        fresh_anchor,
                    )

    def test_data_mutation_cannot_coherently_replace_parent_quantized_cell(self):
        model = TinyBoardDistillNet()
        anchor = capture_quantized_anchor(model)
        optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)
        original_quantized_version = anchor.quantized["w3"]._version
        original_float_version = anchor.float_state["l3.weight"]._version

        # `.data` bypasses PyTorch's normal in-place version counter.  Mutate
        # both sides coherently: without the authoritative content hash this
        # could redefine parent q=0 as q=1 and make the post-restore check pass.
        anchor.quantized["w3"].data[0] = 1
        anchor.float_state["l3.weight"].data[0, 0] = 1.0 / 64.0
        self.assertEqual(anchor.quantized["w3"]._version, original_quantized_version)
        self.assertEqual(
            anchor.float_state["l3.weight"]._version,
            original_float_version,
        )

        with self.assertRaisesRegex(ValueError, "quantized bits changed"):
            project_optimizer_step_to_anchor(model, optimizer, anchor)
        self.assertEqual(int(quantize_model(model)["w3"][0]), 0)

    def test_data_mutation_cannot_replace_same_cell_parent_float(self):
        model = TinyBoardDistillNet()
        anchor = capture_quantized_anchor(model)
        optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)
        original_float_version = anchor.float_state["l3.weight"]._version

        # 0.001 still quantizes to parent q=0, so the q anchor alone cannot
        # detect this exact-parent-float substitution.  Force the live model
        # across the cell so an unprotected projector would restore 0.001.
        anchor.float_state["l3.weight"].data[0, 0] = 0.001
        with torch.no_grad():
            model.l3.weight[0, 0] = 0.25
        self.assertEqual(
            anchor.float_state["l3.weight"]._version,
            original_float_version,
        )
        self.assertEqual(int(anchor.quantized["w3"][0]), 0)

        with self.assertRaisesRegex(ValueError, "parent float bits changed"):
            project_optimizer_step_to_anchor(model, optimizer, anchor)
        self.assertEqual(float(model.l3.weight[0, 0].detach()), 0.25)
        self.assertEqual(int(quantize_model(model)["w3"][0]), 16)

    def test_wrong_architecture_anchor_and_optimizer_shapes_are_rejected(self):
        model = TinyBoardDistillNet()
        model.features = "kp"
        with self.assertRaisesRegex(ValueError, "features"):
            capture_quantized_anchor(model)

        model = TinyBoardDistillNet()
        model.factored = True
        with self.assertRaisesRegex(ValueError, "factored"):
            capture_quantized_anchor(model)

        model = TinyBoardDistillNet()
        model.board_feats += 1
        with self.assertRaisesRegex(ValueError, "pad_idx"):
            capture_quantized_anchor(model)

        model = TinyBoardDistillNet()
        model.l3 = nn.Linear(2, 2)
        with self.assertRaisesRegex(ValueError, "l3"):
            capture_quantized_anchor(model)

        model = TinyBoardDistillNet()
        anchor = capture_quantized_anchor(model)
        malformed_quantized = dict(anchor.quantized)
        malformed_quantized["w1_board"] = malformed_quantized["w1_board"][:3]
        malformed_anchor = replace(anchor, quantized=malformed_quantized)
        with self.assertRaisesRegex(ValueError, "anchor w1_board"):
            assert_quantized_anchor(model, malformed_anchor)

        optimizer = initialized_adam(model)
        optimizer.state[model.l2.weight]["exp_avg"] = torch.zeros(1)
        with self.assertRaisesRegex(ValueError, "exp_avg.*l2.weight"):
            project_optimizer_step_to_anchor(model, optimizer, anchor)


class AlignmentConsistencyLossTests(unittest.TestCase):
    def test_loss_matches_smooth_l1_and_mean_per_parent_kl_and_detaches_target(self):
        float_logits = torch.tensor(
            [0.12, -0.08, 0.20, -0.05, 0.03],
            dtype=torch.float64,
            requires_grad=True,
        )
        exact_logits = torch.tensor(
            [0.10, -0.10, 0.15, -0.02, 0.08],
            dtype=torch.float64,
            requires_grad=True,
        )
        group_sizes = (2, 3)

        total, huber, policy = alignment_consistency_loss(
            float_logits,
            exact_logits,
            group_sizes,
        )

        detached = exact_logits.detach()
        expected_huber = F.smooth_l1_loss(
            float_logits,
            detached,
            reduction="mean",
            beta=1.0 / 64.0,
        )
        expected_parent_losses = []
        start = 0
        for size in group_sizes:
            parent_slice = slice(start, start + size)
            expected_parent_losses.append(
                F.kl_div(
                    F.log_softmax(-float_logits[parent_slice] * 600.0 / 200.0, dim=0),
                    F.softmax(-detached[parent_slice] * 600.0 / 200.0, dim=0),
                    reduction="sum",
                )
            )
            start += size
        expected_policy = torch.stack(expected_parent_losses).mean()
        self.assertTrue(torch.allclose(huber, expected_huber, atol=0.0, rtol=0.0))
        self.assertTrue(torch.allclose(policy, expected_policy, atol=0.0, rtol=0.0))
        self.assertTrue(torch.allclose(total, expected_huber + 0.25 * expected_policy))

        wrong_view_policy = torch.stack(
            [
                F.kl_div(
                    F.log_softmax(float_logits[:2] * 3.0, dim=0),
                    F.softmax(detached[:2] * 3.0, dim=0),
                    reduction="sum",
                ),
                F.kl_div(
                    F.log_softmax(float_logits[2:] * 3.0, dim=0),
                    F.softmax(detached[2:] * 3.0, dim=0),
                    reduction="sum",
                ),
            ]
        ).mean()
        self.assertFalse(torch.allclose(policy, wrong_view_policy))

        total.backward()
        self.assertIsNotNone(float_logits.grad)
        self.assertTrue(torch.isfinite(float_logits.grad).all())
        self.assertGreater(float(torch.count_nonzero(float_logits.grad)), 0)
        self.assertIsNone(exact_logits.grad)

    def test_group_partition_logit_shapes_and_types_are_exact(self):
        float_logits = torch.zeros(5, requires_grad=True)
        exact_logits = torch.zeros(5)
        for group_sizes in ((2, 2), (2, 0, 3), (2.0, 3), (), None):
            with self.subTest(group_sizes=group_sizes):
                with self.assertRaisesRegex(ValueError, "group_sizes"):
                    alignment_consistency_loss(
                        float_logits,
                        exact_logits,
                        group_sizes,
                    )

        with self.assertRaisesRegex(ValueError, "one-dimensional"):
            alignment_consistency_loss(
                float_logits.unsqueeze(1),
                exact_logits.unsqueeze(1),
                (5,),
            )
        with self.assertRaisesRegex(ValueError, "identical shapes"):
            alignment_consistency_loss(float_logits, exact_logits[:4], (5,))
        with self.assertRaisesRegex(TypeError, "normalized floating"):
            alignment_consistency_loss(
                float_logits,
                torch.zeros(5, dtype=torch.int64),
                (5,),
            )
        with self.assertRaisesRegex(ValueError, "finite"):
            alignment_consistency_loss(
                float_logits,
                torch.tensor([0.0, 0.0, float("nan"), 0.0, 0.0]),
                (5,),
            )


if __name__ == "__main__":
    unittest.main()
