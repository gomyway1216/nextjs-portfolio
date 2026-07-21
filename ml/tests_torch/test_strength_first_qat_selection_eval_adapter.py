from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import strength_first_qat_selection_eval_adapter as adapter  # noqa: E402
from train import position_id_from_sfen  # noqa: E402


EMPTY_PARENT = "9/9/9/9/9/9/9/9/9 w 3P 1"
EMPTY_WITH_TWO_PAWNS = "9/9/9/9/9/9/9/9/9 b 2P 2"
EMPTY_WITH_ONE_PAWN = "9/9/9/9/9/9/9/9/9 b P 2"


def splitless_sibling_rows() -> list[dict]:
    shared = {
        "schema": "shogi-sibling-v1",
        "schema_version": 1,
        "game_id": "synthetic-game",
        "parent_id": "synthetic-parent",
        "position_id": position_id_from_sfen(EMPTY_PARENT),
        "parent_sfen": EMPTY_PARENT,
        "parent_ply": 0,
        "ply": 1,
    }
    return [
        {
            **shared,
            "move": "7g7f",
            "sources": ["played", "teacher"],
            "sfen": EMPTY_WITH_TWO_PAWNS,
            "child_sfen": EMPTY_WITH_TWO_PAWNS,
            "child_position_id": position_id_from_sfen(EMPTY_WITH_TWO_PAWNS),
            "cp": 100,
            "teacher_child_cp": 100,
            "teacher_parent_cp": -100,
            "teacher_rank": 2,
            "teacher_score_kind": "cp",
        },
        {
            **shared,
            "move": "2g2f",
            "sources": ["teacher"],
            "sfen": EMPTY_WITH_ONE_PAWN,
            "child_sfen": EMPTY_WITH_ONE_PAWN,
            "child_position_id": position_id_from_sfen(EMPTY_WITH_ONE_PAWN),
            "cp": -100,
            "teacher_child_cp": -100,
            "teacher_parent_cp": 100,
            "teacher_rank": 1,
            "teacher_score_kind": "cp",
        },
    ]


class StrengthFirstSelectionRealLoaderIntegrationTest(unittest.TestCase):
    def test_splitless_projection_reaches_real_loader_and_preserves_identity(self):
        raw = b"".join(
            json.dumps(
                row,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
                allow_nan=False,
            ).encode("utf-8")
            + b"\n"
            for row in splitless_sibling_rows()
        )
        with tempfile.TemporaryDirectory() as temporary:
            data_path = Path(temporary) / "selection.jsonl"
            data_path.write_bytes(raw)
            data_path.chmod(0o600)
            loaded = adapter._load_splitless_fresh_selection_as_validation(
                evaluator=adapter._load_real_eval_module(),
                data_path=str(data_path),
                dataset_bytes=len(raw),
                dataset_sha256=hashlib.sha256(raw).hexdigest(),
                expected_records=2,
            )

        self.assertEqual(len(loaded[5]), 2)
        self.assertEqual(loaded[6], [[0, 1]])
        self.assertEqual(
            loaded[7],
            {
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
            },
        )


if __name__ == "__main__":
    unittest.main()
