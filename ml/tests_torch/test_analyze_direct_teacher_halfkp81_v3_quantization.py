from __future__ import annotations

import json
from pathlib import Path
import sys
import unittest

import torch


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import analyze_direct_teacher_halfkp81_v3_quantization as DIAG  # noqa: E402


def _rows(parent_ids: list[str]) -> list[dict[str, str]]:
    return [
        {
            "parent_id": parent_id,
            "game_id": f"sha256:{index:064x}",
            "child_position_id": f"sha256:{index + 100:064x}",
            "child_sfen": f"fixture b - {index + 1}",
            "teacher_child_cp": index,
        }
        for index, parent_id in enumerate(parent_ids)
    ]


class DirectTeacherHalfkp81V3QuantizationDiagnosisTests(unittest.TestCase):
    def test_nearest_rank_distribution_is_deterministic(self) -> None:
        values = torch.tensor([4.0, 1.0, 3.0, 2.0])
        observed = DIAG.error_distribution(values)
        self.assertEqual(observed["rows"], 4)
        self.assertEqual(observed["mean_cp"], 2.5)
        self.assertEqual(observed["p50_cp"], 2.0)
        self.assertEqual(observed["p90_cp"], 4.0)
        self.assertEqual(observed["max_cp"], 4.0)

    def test_float_int_order_diagnostics_counts_flip_tie_and_top_change(self) -> None:
        rows = _rows(["parent-a", "parent-a", "parent-a", "parent-b", "parent-b"])
        floating = torch.tensor([3.0, 2.0, 1.0, 1.0, 0.0])
        integer = torch.tensor([1.0, 1.0, 2.0, 1.0, 0.0])
        observed = DIAG.float_int_order_diagnostics(floating, integer, rows)
        self.assertEqual(observed["compared_pairs"], 4)
        self.assertEqual(observed["flipped_or_int_tied_pairs"], 3)
        self.assertEqual(observed["compared_parents"], 2)
        self.assertEqual(observed["top_set_changed_parents"], 1)

    def test_crossfit_affine_calibration_recovers_global_scale_and_bias(self) -> None:
        ids = [
            "sha256:" + ("0" * 63) + suffix for suffix in ("0", "1", "2", "3", "4", "5")
        ]
        rows = [
            {
                "parent_id": "parent",
                "game_id": "game",
                "child_position_id": child_id,
                "child_sfen": f"fixture b - {index + 1}",
            }
            for index, child_id in enumerate(ids)
        ]
        integer = torch.tensor([-3.0, -2.0, -1.0, 1.0, 2.0, 3.0])
        floating = integer * 1.25 + 7.0
        observed = DIAG.crossfit_affine_calibration(floating, integer, rows)
        self.assertAlmostEqual(observed["slope"], 1.25)
        self.assertAlmostEqual(observed["intercept_cp"], 7.0)
        self.assertAlmostEqual(observed["calibrated"]["max_cp"], 0.0)

    def test_tail_cluster_summary_exposes_one_correlated_parent(self) -> None:
        rows = _rows(["parent-a", "parent-a", "parent-a", "parent-b"])
        rows[0]["game_id"] = rows[1]["game_id"] = "game-a"
        rows[2]["game_id"] = "game-a"
        errors = torch.tensor([220.0, 230.0, 20.0, 10.0])
        floating = torch.tensor([4.0, 3.0, 2.0, 1.0])
        integer = torch.tensor([5.0, 4.0, 2.0, 1.0])
        observed = DIAG.tail_cluster_summary(
            candidate_errors=errors,
            initializer_max_cp=200.0,
            rows=rows,
            candidate_float_cp=floating,
            candidate_int_cp=integer,
        )
        self.assertEqual(observed["rows_above_historical_allowance"], 2)
        self.assertEqual(observed["unique_parents_above_historical_allowance"], 1)
        self.assertEqual(observed["unique_games_above_historical_allowance"], 1)
        self.assertTrue(
            observed["driver_parent_selection"]["candidate_float_and_int16_best_equal"]
        )

    def test_tracked_memo_pins_closed_state_and_v4_proposal(self) -> None:
        memo_path = (
            REPO_ROOT
            / "docs"
            / "data"
            / "shogi-direct-teacher-halfkp81-v3-quantization-diagnosis-2026-07-29.json"
        )
        memo = json.loads(memo_path.read_text(encoding="utf-8"))
        self.assertEqual(
            memo["bindings"]["static_result"]["sha256"],
            DIAG.EXPECTED_FILES["static_result"]["sha256"],
        )
        self.assertEqual(
            memo["distribution"]["candidate_over_initializer_ratio"]["p99_9"],
            1.0134990893119955,
        )
        self.assertEqual(memo["tail"]["rows_above_historical_allowance"], 3)
        self.assertEqual(memo["tail"]["unique_parents_above_historical_allowance"], 1)
        self.assertEqual(memo["scale_and_clipping"]["candidate_weight_clipping"], 0)
        self.assertEqual(
            memo["recommendation"]["selected"],
            "independent-v4-frozen-candidate-robust-adjudication",
        )
        self.assertFalse(memo["authority"]["paired56_authorized"])
        self.assertFalse(memo["authority"]["live_weight_write_authorized"])


if __name__ == "__main__":
    unittest.main()
