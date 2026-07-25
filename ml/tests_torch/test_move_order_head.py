from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

import torch


ML_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ML_DIR))

import move_order_head as head  # noqa: E402
import train_move_order_head as trainer  # noqa: E402


START_SFEN_B = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
START_SFEN_W = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1"
DROP_SFEN = "4k4/9/9/9/9/9/9/9/4K4 b P 1"


class MoveOrderFeatureTests(unittest.TestCase):
    def test_side_to_move_rotation_has_identical_features(self) -> None:
        sente = head.encode_move(head.parse_parent_sfen(START_SFEN_B), "7g7f")
        gote = head.encode_move(head.parse_parent_sfen(START_SFEN_W), "3c3d")
        self.assertEqual(sente, gote)

    def test_drop_features_are_bounded_and_signed(self) -> None:
        indices, signs = head.encode_move(head.parse_parent_sfen(DROP_SFEN), "P*5e")
        self.assertGreaterEqual(len(indices), 30)
        self.assertEqual(len(indices), len(signs))
        self.assertTrue(all(1 <= index <= head.BUCKETS for index in indices))
        self.assertTrue(all(sign in (-1, 1) for sign in signs))

    def test_rejects_move_from_opponent_piece(self) -> None:
        with self.assertRaisesRegex(ValueError, "not owned"):
            head.encode_move(head.parse_parent_sfen(START_SFEN_B), "3c3d")

    def test_rejects_king_drop_and_drop_onto_occupied_square(self) -> None:
        parsed = head.parse_parent_sfen(DROP_SFEN)
        with self.assertRaisesRegex(ValueError, "drop piece"):
            head.encode_move(parsed, "K*5e")
        with self.assertRaisesRegex(ValueError, "occupied"):
            head.encode_move(parsed, "P*5i")

    def test_listwise_pair_loss_rewards_correct_order(self) -> None:
        teacher = torch.tensor([[100.0, 0.0]])
        valid = torch.tensor([[True, True]])
        bad, _ = head.listwise_pair_loss(
            torch.tensor([[0.0, 0.0]]),
            teacher,
            valid,
            temperature_cp=100.0,
            pair_gap_cp=50.0,
            pair_weight=0.25,
        )
        good, _ = head.listwise_pair_loss(
            torch.tensor([[0.5, -0.5]]),
            teacher,
            valid,
            temperature_cp=100.0,
            pair_gap_cp=50.0,
            pair_weight=0.25,
        )
        self.assertLess(float(good), float(bad))


class MoveOrderDataTests(unittest.TestCase):
    def _row(self, move: str, rank: int, cp: int) -> dict[str, object]:
        return {
            "schema": "shogi-sibling-v1",
            "schema_version": 1,
            "split": "train",
            "game_id": "sha256:game",
            "parent_id": "sha256:parent",
            "position_id": "sha256:position",
            "child_position_id": f"sha256:child-{rank}",
            "parent_sfen": DROP_SFEN,
            "child_sfen": DROP_SFEN,
            "move": move,
            "teacher_parent_cp": cp,
            "teacher_child_cp": -cp,
            "teacher_rank": rank,
            "teacher_score_kind": "cp",
            "sources": ["all-legal-fixed-depth-teacher"],
        }

    def test_loader_groups_and_sorts_moves_without_rank_order_leak(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "train.jsonl"
            rows = [self._row("P*5e", 1, 100), self._row("P*4e", 2, 0)]
            path.write_text(
                "".join(json.dumps(row, sort_keys=True) + "\n" for row in rows),
                encoding="utf-8",
            )
            groups, source = head.load_groups(path, "train")
        self.assertEqual(source["rows"], 2)
        self.assertEqual(source["parents"], 1)
        self.assertEqual(groups[0].game_id, "sha256:game")
        self.assertEqual(
            [example.move for example in groups[0].examples], ["P*4e", "P*5e"]
        )
        self.assertEqual(
            [example.teacher_rank for example in groups[0].examples], [2, 1]
        )

    def test_fit_tune_split_is_game_level(self) -> None:
        example = head.MoveExample("P*5e", 1.0, 1, (1,), (1,))
        groups = [
            head.ParentGroup(
                f"parent-{game}-{parent}",
                f"game-{game}",
                f"position-{game}-{parent}",
                DROP_SFEN,
                (example, example),
            )
            for game in range(30)
            for parent in range(2)
        ]
        fit, tune = trainer._split_fit_tune(groups, seed=42, modulus=5)
        fit_games = {group.game_id for group in fit}
        tune_games = {group.game_id for group in tune}
        self.assertFalse(fit_games & tune_games)
        self.assertEqual(len(fit) + len(tune), len(groups))

    def test_overlap_summary_covers_all_parent_identities(self) -> None:
        example = head.MoveExample("P*5e", 1.0, 1, (1,), (1,))
        left = [
            head.ParentGroup(
                "parent-a", "game-a", "position-a", DROP_SFEN, (example, example)
            )
        ]
        right = [
            head.ParentGroup(
                "parent-b", "game-a", "position-b", DROP_SFEN, (example, example)
            )
        ]
        self.assertEqual(
            trainer._overlap_summary(left, right),
            {"game_id": 1, "parent_id": 0, "position_id": 0, "parent_sfen": 1},
        )

    def test_metrics_are_strict_for_all_tied_predictions_and_order_invariant(
        self,
    ) -> None:
        examples = (
            head.MoveExample("P*3e", 300.0, 1, (1,), (1,)),
            head.MoveExample("P*4e", 100.0, 2, (1,), (1,)),
            head.MoveExample("P*5e", -50.0, 3, (1,), (1,)),
        )
        model = head.MoveOrderHead()
        for ordered in (examples, tuple(reversed(examples))):
            metrics = head.score_groups(
                model,
                [head.ParentGroup("parent", "game", "position", DROP_SFEN, ordered)],
                device="cpu",
                batch_size=1,
                pair_gap_cp=50.0,
                temperature_cp=100.0,
            )
            self.assertEqual(metrics["top1_correct"], 0)
            self.assertEqual(metrics["pair_accuracy"], 0.0)

    def test_quantized_export_is_exactly_128_kib(self) -> None:
        model = head.MoveOrderHead()
        with torch.no_grad():
            model.weights.weight[1:, 0].uniform_(-0.5, 0.5)
        with tempfile.TemporaryDirectory() as directory:
            restored, metadata = trainer._quantize_and_export(model, Path(directory))
            artifact = Path(directory) / "weights.bin"
            self.assertEqual(artifact.stat().st_size, 131_072)
            self.assertEqual(metadata["bytes"], 131_072)
            self.assertEqual(restored.weights.weight.shape, model.weights.weight.shape)
            self.assertEqual(
                os.path.getsize(Path(directory) / "weights.meta.json") > 0, True
            )


if __name__ == "__main__":
    unittest.main()
