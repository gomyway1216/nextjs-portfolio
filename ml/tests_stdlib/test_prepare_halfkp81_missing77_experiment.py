import os
from pathlib import Path
import sys
import unittest


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import prepare_halfkp81_missing77_experiment as subject  # noqa: E402


def record(parent_id: str, rank: int, *, position: str | None = None, child: str | None = None):
    return {
        "schema": "shogi-sibling-v1",
        "parent_id": parent_id,
        "teacher_rank": rank,
        "game_id": f"game-{parent_id}",
        "position_id": position or f"position-{parent_id}",
        "child_position_id": child or f"child-{parent_id}-{rank}",
    }


def wrapper(parent_id: str, role: str):
    return {
        "schema": subject.WORK_SCHEMA,
        "kind": "parent",
        "parent_id": parent_id,
        "role": role,
        "teacher_entry": {"records": [record(parent_id, 1), record(parent_id, 2)]},
    }


class Missing77PreparationTest(unittest.TestCase):
    def test_partition_preserves_roles_and_rows(self):
        roles, parents = subject.partition_completed_rows(
            [wrapper("fit-parent", "fit"), wrapper("tune-parent", "tune"), wrapper("sealed-parent", "sealed")]
        )

        self.assertEqual(parents, {"fit": 1, "tune": 1, "sealed": 1})
        self.assertEqual({role: len(rows) for role, rows in roles.items()}, {"fit": 2, "tune": 2, "sealed": 2})
        self.assertEqual(roles["fit"][0]["parent_id"], "fit-parent")

    def test_partition_rejects_duplicate_parent_or_row_rebinding(self):
        duplicate = wrapper("same", "fit")
        with self.assertRaisesRegex(subject.Missing77PreparationError, "duplicate parent_id"):
            subject.partition_completed_rows([duplicate, duplicate])

        rebound = wrapper("outer", "fit")
        rebound["teacher_entry"]["records"][1]["parent_id"] = "other"
        with self.assertRaisesRegex(subject.Missing77PreparationError, "row parent binding"):
            subject.partition_completed_rows([rebound])

    def test_frozen_disclosure_keeps_tune_complete_and_exact_formal_failed(self):
        self.assertEqual(subject.MISSING["by_role"], {"fit": 10, "tune": 0, "sealed": 67})
        self.assertEqual(sum(subject.MISSING["by_role"].values()), 77)
        self.assertEqual(subject.EXPECTED_PARENT_COUNTS["tune"], 1_024)
        self.assertEqual(subject.RUNS_ROOT, Path.home() / ".codex" / "shogi-runs")

    def test_overlap_filter_protects_sealed_then_tune_by_whole_parent(self):
        fit_kept = wrapper("fit-kept", "fit")
        fit_dropped = wrapper("fit-dropped", "fit")
        fit_dropped["teacher_entry"]["records"][0]["child_position_id"] = "tune-child"
        tune_kept = wrapper("tune-kept", "tune")
        tune_kept["teacher_entry"]["records"][0]["child_position_id"] = "tune-child"
        tune_dropped = wrapper("tune-dropped", "tune")
        tune_dropped["teacher_entry"]["records"][0]["position_id"] = "sealed-child"
        sealed = wrapper("sealed", "sealed")
        sealed["teacher_entry"]["records"][0]["child_position_id"] = "sealed-child"
        completed, _parents = subject.partition_completed_rows(
            [fit_kept, fit_dropped, tune_kept, tune_dropped, sealed]
        )

        filtered, disclosure = subject.exclude_cross_role_leakage(completed)

        self.assertEqual({row["parent_id"] for row in filtered["fit"]}, {"fit-kept"})
        self.assertEqual({row["parent_id"] for row in filtered["tune"]}, {"tune-kept"})
        self.assertEqual({row["parent_id"] for row in filtered["sealed"]}, {"sealed"})
        self.assertEqual(
            disclosure["excluded_parent_counts"],
            {"fit": 1, "tune": 1, "sealed": 0},
        )


if __name__ == "__main__":
    unittest.main()
