import json
import math
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from train import (  # noqa: E402
    cp_sigmoid_target,
    load_dataset,
    mixed_sigmoid_target,
    validate_training_hyperparameters,
)


START = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"


class WdlMixedTargetTests(unittest.TestCase):
    def write_rows(self, rows):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        path = os.path.join(temporary.name, "teacher.jsonl")
        with open(path, "w", encoding="utf-8", newline="\n") as target:
            for row in rows:
                target.write(json.dumps(row, allow_nan=False) + "\n")
        return path

    def test_black_white_draw_targets_use_side_to_move_outcome(self):
        path = self.write_rows(
            [
                {"sfen": START, "cp": 0, "outcome": 1.0},
                {"sfen": START.replace(" b ", " w "), "cp": 0, "outcome": 0.0},
                {"sfen": START, "cp": 0, "outcome": 0.5},
            ]
        )
        _board, _hands, targets, _cp, _bucket = load_dataset(
            path, 600.0, 3000, wdl_mix=0.25
        )
        self.assertTrue(
            torch.equal(targets, torch.tensor([0.625, 0.375, 0.5]))
        )

    def test_wdl_mix_zero_is_bit_exact_and_does_not_require_outcome(self):
        rows = [
            {"sfen": START, "cp": 127},
            {"sfen": START.replace(" b ", " w "), "cp": -431, "outcome": "ignored"},
        ]
        path = self.write_rows(rows)
        legacy = load_dataset(path, 600.0, 3000)[2]
        explicit_zero = load_dataset(path, 600.0, 3000, wdl_mix=0.0)[2]
        self.assertTrue(torch.equal(legacy, explicit_zero))
        self.assertTrue(
            torch.equal(
                legacy,
                torch.tensor(
                    [cp_sigmoid_target(127, 600.0), cp_sigmoid_target(-431, 600.0)]
                ),
            )
        )

    def test_positive_mix_rejects_missing_invalid_and_nonfinite_outcomes(self):
        for outcome, expected in (
            (None, "outcome is required"),
            ("win", "finite number"),
            (0.25, "finite number"),
        ):
            row = {"sfen": START, "cp": 0}
            if outcome is not None:
                row["outcome"] = outcome
            path = self.write_rows([row])
            with self.subTest(outcome=outcome):
                with self.assertRaisesRegex(ValueError, expected):
                    load_dataset(path, 600.0, 3000, wdl_mix=0.25)

        path = self.write_rows([{"sfen": START, "cp": 0, "outcome": 1.0}])
        for value in (math.nan, math.inf, -0.01, 1.01):
            with self.subTest(wdl_mix=value):
                with self.assertRaisesRegex(ValueError, "wdl_mix must be finite"):
                    load_dataset(path, 600.0, 3000, wdl_mix=value)

    def test_formula_endpoints(self):
        teacher = cp_sigmoid_target(350, 600.0)
        self.assertEqual(mixed_sigmoid_target(teacher, 0.0, 0.0), teacher)
        self.assertEqual(mixed_sigmoid_target(teacher, 1.0, 1.0), 1.0)

    def test_mix_is_confined_to_ordinary_sigmoid_training(self):
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
            "wdl_mix": 0.25,
            "replay_ratio": 0.0,
            "replay_limit": 0,
            "rank_weight": 1.0,
            "policy_weight": 0.25,
            "rank_pair_min": 50.0,
            "rank_pair_max": 600.0,
            "rank_margin_cp": 50.0,
            "policy_temp_cp": 200.0,
            "loss": "sigmoid",
            "features": "board",
            "halfkp_train_scope": "all",
        }
        validate_training_hyperparameters(SimpleNamespace(**values))
        for loss in ("ranking", "sibling-ranking"):
            with self.subTest(loss=loss):
                with self.assertRaisesRegex(ValueError, "only supported"):
                    validate_training_hyperparameters(
                        SimpleNamespace(**{**values, "loss": loss})
                    )


if __name__ == "__main__":
    unittest.main()
