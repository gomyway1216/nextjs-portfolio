import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from build_kingpair_interaction_dataset import (  # noqa: E402
    SourcePaths,
    build_dataset,
    canonical_position_id,
    held_out_game,
    selected_child_board_moves,
)


SFEN_A = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
SFEN_B = "lnsgkgsnl/1r5b1/ppppppppp/9/9/P8/1PPPPPPPP/1B5R1/LNSGKGSNL w - 2"


def write_rows(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")


class KingPairDatasetBuilderTests(unittest.TestCase):
    def test_child_selection_is_deterministic_and_capped(self):
        moves = [
            {
                "child_position_id": f"sha256:{index:064x}",
                "child_sfen": SFEN_A,
                "teacher_combined_parent_cp": str(index),
            }
            for index in range(40)
        ]
        first = selected_child_board_moves({"moves": moves}, 7)
        second = selected_child_board_moves({"moves": list(reversed(moves))}, 7)
        self.assertEqual(first, second)
        self.assertEqual(len(first), 7)

    def test_split_is_stable(self):
        values = [held_out_game(f"game-{index}") for index in range(100)]
        self.assertEqual(values, [held_out_game(f"game-{index}") for index in range(100)])
        self.assertGreater(sum(values), 0)
        self.assertLess(sum(values), 30)

    def test_builds_disjoint_create_only_partitions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = SourcePaths(**{name: root / f"{name}.jsonl" for name in SourcePaths.__dataclass_fields__})
            scratch = {
                "sfen": SFEN_A,
                "cp": 12,
                "game_id": "scratch-game",
                "position_id": canonical_position_id(SFEN_A),
            }
            direct = {
                "child_sfen": SFEN_B,
                "teacher_child_cp": -20,
                "game_id": "direct-game",
                "child_position_id": canonical_position_id(SFEN_B),
                "parent_id": "parent",
            }
            sibling = {
                "sfen": SFEN_B,
                "child_sfen": SFEN_B,
                "cp": -20,
                "teacher_child_cp": -20,
                "game_id": "sibling-game",
                "child_position_id": canonical_position_id(SFEN_B),
                "parent_id": "parent",
                "teacher_rank": 1,
            }
            child = {
                "game_id": "child-game",
                "parent_id": "child-parent",
                "moves": [
                    {
                        "child_sfen": SFEN_A,
                        "child_position_id": canonical_position_id(SFEN_A),
                        "teacher_combined_parent_cp": "-12.0",
                    }
                ],
            }
            write_rows(paths.large_train, [scratch])
            write_rows(paths.large_validation, [scratch])
            write_rows(paths.direct_train, [direct])
            write_rows(paths.direct_validation, [direct])
            write_rows(paths.aoba_train, [sibling])
            write_rows(paths.aoba_validation, [sibling])
            write_rows(paths.v9_train, [sibling])
            write_rows(paths.child_board, [child])

            output = root / "out"
            manifest = build_dataset(paths, output, child_board_cap=1)
            train_ids = {
                json.loads(line)["position_id"] for line in (output / "train.jsonl").read_text().splitlines()
            }
            val_ids = {
                json.loads(line)["position_id"]
                for line in (output / "validation.jsonl").read_text().splitlines()
            }
            self.assertFalse(train_ids & val_ids)
            self.assertEqual(manifest["semantic_overlap"], 0)
            with self.assertRaises(FileExistsError):
                build_dataset(paths, output, child_board_cap=1)

    def test_position_id_mismatch_is_rejected(self):
        self.assertNotEqual(
            canonical_position_id(SFEN_A),
            "sha256:" + hashlib.sha256(SFEN_A.encode()).hexdigest(),
        )


if __name__ == "__main__":
    unittest.main()
