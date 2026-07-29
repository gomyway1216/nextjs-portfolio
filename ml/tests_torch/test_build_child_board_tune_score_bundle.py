from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

import torch


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_child_board_tune_score_bundle as BUILDER  # noqa: E402
import listwise_policy_value as lpv  # noqa: E402
import train  # noqa: E402


QWEIGHTS = lpv.read_live_board_qweights("public/shogi-nnue-weights.bin")
START = (
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/"
    "PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
)


def _group(parent_id: str) -> lpv.ParentGroup:
    board, hands, _turn, _king = train.parse_sfen(START)
    padded = tuple(
        board[: train.MAX_PIECES]
        + [train.PAD_IDX] * (train.MAX_PIECES - len(board))
    )
    examples = []
    for index, move in enumerate(("2g2f", "7g7f")):
        child = lpv.child_sfen_after_usi(START, move)
        child_cp = lpv.score_child_sfens_with_live_nnue(
            QWEIGHTS, [child]
        )[0]
        examples.append(
            lpv.MoveExample(
                move=move,
                teacher_cp=float(100 - index * 100),
                teacher_rank=index + 1,
                child_position_id=train.position_id_from_sfen(child),
                child_sfen=child,
                features=lpv.encode_explicit_move(START, move),
                base_parent_cp=-child_cp,
            )
        )
    return lpv.ParentGroup(
        parent_id=parent_id,
        game_id=f"game-{parent_id}",
        position_id=f"position-{parent_id}",
        parent_sfen=START,
        parent_board=padded,
        parent_hands=tuple(hands),
        semantic_position_ids=frozenset(
            [f"position-{parent_id}"]
            + [example.child_position_id for example in examples]
        ),
        examples=tuple(examples),
        source_role="browser-all-legal",
    )


class _Teacher(torch.nn.Module):
    requires_child_planes = True

    def __init__(self, offset: float) -> None:
        super().__init__()
        self.offset = offset

    def forward(self, batch):
        combined = batch["base_cp"] + self.offset
        return combined, combined * 0, combined[:, 0]


class _Student(torch.nn.Module):
    requires_child_planes = True

    def forward(self, batch):
        combined = batch["base_cp"] + 3.0
        return combined, combined * 0


class TuneScoreBundleBuilderTest(unittest.TestCase):
    def test_scores_all_four_roles_on_identical_projected_moves(self):
        groups = {
            "browser_tune": [_group("browser-parent")],
            "v9_tune": [_group("v9-parent")],
        }
        raw, rows = BUILDER._score_payload(
            groups,
            teachers={42: _Teacher(1.0), 314159: _Teacher(2.0)},
            student_model=_Student(),
            device="cpu",
            parent_batch_size=1,
        )
        parsed = [json.loads(line) for line in raw.splitlines()]
        self.assertEqual(rows, 4)
        self.assertEqual(
            [(row["domain"], row["parent_id"], row["move"]) for row in parsed],
            [
                ("browser_tune", "browser-parent", "2g2f"),
                ("browser_tune", "browser-parent", "7g7f"),
                ("v9_tune", "v9-parent", "2g2f"),
                ("v9_tune", "v9-parent", "7g7f"),
            ],
        )
        for row in parsed:
            self.assertEqual(
                set(row["scores"]),
                {
                    "exact_live",
                    "seed42_teacher",
                    "seed314159_teacher",
                    "frozen_student",
                },
            )
            self.assertEqual(
                row["scores"]["seed42_teacher"],
                row["scores"]["exact_live"] + 1.0,
            )
            self.assertEqual(
                row["scores"]["seed314159_teacher"],
                row["scores"]["exact_live"] + 2.0,
            )
            self.assertEqual(
                row["scores"]["frozen_student"],
                row["scores"]["exact_live"] + 3.0,
            )

    def test_v9_candidate_subset_never_fabricates_added_teacher_labels(self):
        source = _group("v9-subset")
        projected = BUILDER._project_tune_groups(
            {"browser_tune": [source], "v9_tune": [source]}
        )
        self.assertEqual(
            [example.move for example in projected["v9_tune"][0].examples],
            ["2g2f", "7g7f"],
        )
        self.assertNotIn(
            "8g8f",
            {
                example.move
                for example in projected["v9_tune"][0].examples
            },
        )

    def test_incomplete_student_refuses_before_tune_derivation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            student_root = root / "student"
            student_root.mkdir()
            result = student_root / "result.json"
            result.write_text(
                json.dumps(
                    {
                        "schema": (
                            "shogi-child-board-root-policy-student-"
                            "runtime-result-v1"
                        ),
                        "status": "training-in-progress",
                        "tune_opened": False,
                        "sealed_opened": False,
                        "live_weights_changed": False,
                    }
                )
            )
            registry = {
                "outputs": {
                    "student_runtime": {"root": str(student_root)},
                    "tune": {
                        "root": str(root / "tune"),
                        "opened_marker": str(root / "tune/opened.json"),
                        "pending_result": str(root / "tune/pending.json"),
                        "result": str(root / "tune/result.json"),
                    },
                    "sealed": {
                        "opened_marker": str(root / "sealed/opened.json"),
                        "pending_result": str(root / "sealed/pending.json"),
                        "result": str(root / "sealed/result.json"),
                    },
                }
            }
            with self.assertRaisesRegex(
                BUILDER.BundleBuildError, "student terminal result is incomplete"
            ):
                BUILDER.build_tune_bundle(
                    repo_root=root,
                    output_root=root / "tune",
                    student_result_path=result,
                    device="cpu",
                    registry_override=registry,
                )
            self.assertFalse((root / "tune").exists())


if __name__ == "__main__":
    unittest.main()
