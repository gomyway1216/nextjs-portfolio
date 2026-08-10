import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from dpa_halfkp96_nnue import (  # noqa: E402
    BOARD_FEATURES,
    DpaHalfkp96NNUE,
    HAND_FEATURES,
    HIDDEN,
    PAD_INDEX,
    TRAINABLE_PARAMETERS,
)
from dpa_halfkp96_runtime_int_reference import LAYOUT  # noqa: E402
from train import MAX_PIECES  # noqa: E402
from train_dpa_halfkp96_nnue import (  # noqa: E402
    DpaTrainingError,
    LEARNING_RATE,
    SEED,
    TrainingExample,
    WEIGHT_DECAY,
    iter_aoba_examples,
    iter_legacy_examples,
    load_checkpoint,
    mixed_batch_stream,
    mixed_example_stream,
    same_parent_teacher_pair_ranking_loss,
    save_checkpoint,
)


START_SFEN = (
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/"
    "LNSGKGSNL b - 1"
)


def fixture_inputs(batch: int = 2):
    generator = torch.Generator().manual_seed(7)
    board = torch.randint(
        0, BOARD_FEATURES, (batch, 2, MAX_PIECES), generator=generator
    )
    board[:, :, -3:] = PAD_INDEX
    hands = torch.randint(
        0, 3, (batch, 2, 14), generator=generator
    ).float()
    buckets = torch.randint(0, 81, (batch, 2), generator=generator)
    return board, hands, buckets


class DpaHalfkp96NnueTests(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(SEED)

    def test_payload_shape_parameter_count_and_strict_antisymmetry(self):
        model = DpaHalfkp96NNUE()
        trainable = sum(
            parameter.numel()
            for parameter in model.parameters()
            if parameter.requires_grad
        )
        self.assertEqual(trainable, TRAINABLE_PARAMETERS)
        self.assertEqual(trainable, 17_744_928)
        self.assertFalse(model.first_bias.requires_grad)

        payload = model.deployment_tensors()
        self.assertEqual(payload.board_w1.shape, (BOARD_FEATURES, HIDDEN))
        self.assertEqual(payload.hand_w1.shape, (HAND_FEATURES, HIDDEN))
        self.assertEqual(payload.first_bias.shape, (HIDDEN,))
        self.assertEqual(payload.output_weight.shape, (HIDDEN,))
        self.assertTrue(bool(torch.all(payload.first_bias == 0)))
        self.assertEqual(payload.board_w1.numel() * 2, LAYOUT.hand_w1)
        self.assertEqual(
            payload.hand_w1.numel() * 2,
            LAYOUT.first_bias - LAYOUT.hand_w1,
        )
        self.assertEqual(
            payload.first_bias.numel() * 4,
            LAYOUT.output_weight - LAYOUT.first_bias,
        )
        self.assertEqual(
            payload.output_weight.numel() * 2,
            LAYOUT.total_bytes - LAYOUT.output_weight,
        )

        board, hands, buckets = fixture_inputs()
        forward = model(board, hands, buckets)
        reverse = model(
            board.flip(1), hands.flip(1), buckets.flip(1)
        )
        torch.testing.assert_close(forward, -reverse, rtol=0.0, atol=1e-7)

    def test_forward_is_finite_and_backward_reaches_only_payload_weights(self):
        model = DpaHalfkp96NNUE()
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

    def test_streaming_readers_mix_exactly_one_legacy_to_four_fresh(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            legacy_root = root / "legacy"
            fresh_root = root / "fresh"
            legacy_root.mkdir()
            fresh_root.mkdir()
            (legacy_root / "legacy-00000-of-00001.jsonl").write_text(
                "\n".join(
                    json.dumps(
                        {
                            "sfen": START_SFEN,
                            "cp": cp,
                            "semantic_position_id": f"sha256:legacy-{cp}",
                        }
                    )
                    for cp in (25, -25)
                )
                + "\n",
                encoding="utf-8",
            )
            moves = [
                {
                    "child_sfen": START_SFEN.replace(" b ", " w "),
                    "teacher_child_cp": cp,
                    "teacher_rank": rank,
                }
                for rank, cp in enumerate((-240, -80, 90, 260), 1)
            ]
            parents = [
                {
                    "schema": "shogi-kingpair-aoba-parent-label-v1",
                    "position_id": f"sha256:parent-{offset}",
                    "engine_sha256": "a" * 64,
                    "eval_sha256": "b" * 64,
                    "moves": moves,
                }
                for offset in range(2)
            ]
            (fresh_root / "teacher-00000-of-00001.jsonl").write_text(
                "\n".join(
                    (
                        json.dumps({"schema": "header"}),
                        *(json.dumps(parent) for parent in parents),
                        json.dumps({"schema": "footer"}),
                    )
                )
                + "\n",
                encoding="utf-8",
            )

            legacy_factory = lambda cycle: iter_legacy_examples(  # noqa: E731
                legacy_root, seed=SEED + cycle
            )
            fresh_factory = lambda cycle: iter_aoba_examples(  # noqa: E731
                fresh_root, seed=SEED + cycle
            )
            batches = list(
                mixed_batch_stream(
                    legacy_factory,
                    fresh_factory,
                    device="cpu",
                    batch_size=5,
                    legacy_exposures=2,
                    fresh_exposures=8,
                )
            )
            self.assertEqual(len(batches), 2)
            sources = [source for batch in batches for source in batch.sources]
            self.assertEqual(sources.count("legacy"), 2)
            self.assertEqual(sources.count("aoba-depth12-top4"), 8)
            self.assertTrue(
                all(batch.board_indices.shape == (5, 2, 40) for batch in batches)
            )
            self.assertTrue(
                all(batch.hands.shape == (5, 2, 14) for batch in batches)
            )

    def test_fixed_mix_rejects_short_or_extra_arms(self):
        def examples(count: int, source: str):
            return [
                TrainingExample(sfen=START_SFEN, cp=index, source=source)
                for index in range(count)
            ]

        for legacy_rows, fresh_rows, message in (
            (1, 8, "ended at 1 rows"),
            (3, 8, "more than the fixed 2 rows"),
            (2, 7, "ended at 7 rows"),
            (2, 9, "more than the fixed 8 rows"),
        ):
            with self.subTest(legacy_rows=legacy_rows, fresh_rows=fresh_rows):
                with self.assertRaisesRegex(DpaTrainingError, message):
                    list(
                        mixed_example_stream(
                            lambda _cycle: iter(examples(legacy_rows, "legacy")),
                            lambda _cycle: iter(examples(fresh_rows, "fresh")),
                            legacy_exposures=2,
                            fresh_exposures=8,
                        )
                    )

    def test_pair_loss_is_same_parent_same_teacher_and_prefers_order(self):
        cp = torch.tensor([200.0, 0.0, -200.0, 200.0, 0.0])
        parents = ("p", "p", "p", "p", "q")
        teachers = ("t", "t", "other", "t", "t")
        correct = torch.tensor([2.0, 0.0, 100.0, 1.0, -100.0])
        reversed_order = torch.tensor([-2.0, 0.0, -100.0, 1.0, 100.0])
        good_loss, good_pairs = same_parent_teacher_pair_ranking_loss(
            correct, cp, parents, teachers
        )
        bad_loss, bad_pairs = same_parent_teacher_pair_ranking_loss(
            reversed_order, cp, parents, teachers
        )
        # Only rows 0,1,3 share both identities. Their valid comparisons are
        # (0,1) and (1,3); rows with another parent/teacher cannot leak in.
        self.assertEqual(good_pairs, 2)
        self.assertEqual(bad_pairs, 2)
        self.assertLess(float(good_loss), float(bad_loss))

    def test_checkpoint_roundtrip_preserves_model_and_fixed_contract(self):
        model = DpaHalfkp96NNUE()
        optimizer = torch.optim.AdamW(
            model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY
        )
        board, hands, buckets = fixture_inputs(batch=1)
        expected = model(board, hands, buckets).detach()
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "epoch-01.pt"
            save_checkpoint(checkpoint, model, optimizer, epoch=1)
            restored = DpaHalfkp96NNUE()
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
