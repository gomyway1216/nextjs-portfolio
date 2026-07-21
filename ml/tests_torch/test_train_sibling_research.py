import json
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import train  # noqa: E402
import train_sibling_research as research  # noqa: E402


TRAIN_PARENT = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
TRAIN_CHILDREN = (
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2",
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL w - 2",
)
VAL_PARENT = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1"
VAL_CHILDREN = (
    "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 2",
    "lnsgkgsnl/1r5b1/p1ppppppp/1p7/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 2",
)


def sibling_rows(*, split, game_id, parent_id, parent_sfen, children, moves, parent_ply):
    rows = []
    for index, (child, move, parent_cp) in enumerate(
        zip(children, moves, (300, 0), strict=True), start=1
    ):
        row = {
            "schema": "shogi-sibling-v1",
            "schema_version": 1,
            "game_id": game_id,
            "parent_id": parent_id,
            "position_id": train.position_id_from_sfen(parent_sfen),
            "parent_sfen": parent_sfen,
            "parent_ply": parent_ply,
            "ply": parent_ply + 1,
            "move": move,
            "sources": ["played", "teacher"] if index == 1 else ["teacher"],
            "sfen": child,
            "child_position_id": train.position_id_from_sfen(child),
            "cp": -parent_cp,
            "child_sfen": child,
            "teacher_child_cp": -parent_cp,
            "teacher_parent_cp": parent_cp,
            "teacher_rank": index,
            "teacher_score_kind": "cp",
        }
        if split is not None:
            row["split"] = split
        rows.append(row)
    return rows


def write_rows(path, rows):
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        for row in rows:
            target.write(json.dumps(row, sort_keys=True) + "\n")


class SiblingResearchTrainingTest(unittest.TestCase):
    def test_hyperparameters_reject_nonfinite_and_disabled_ranking_objective(self):
        base = SimpleNamespace(
            lr=1e-3,
            k=600.0,
            policy_temp_cp=200.0,
            rank_weight=1.0,
            rank_pair_min=50.0,
            rank_pair_max=600.0,
            rank_margin_cp=50.0,
            policy_weight=0.25,
            cp_clamp=3000,
        )
        research._validate_hyperparameters(base)
        for overrides in (
            {"lr": float("nan")},
            {"rank_pair_min": 700.0, "rank_pair_max": 600.0},
            {"rank_weight": 0.0, "policy_weight": 0.0},
        ):
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                research._validate_hyperparameters(
                    SimpleNamespace(**{**vars(base), **overrides})
                )

    def test_projection_rejects_a_conflicting_declared_role(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = os.path.join(tmp, "source.jsonl")
            output = os.path.join(tmp, "output.jsonl")
            write_rows(source, [{"split": "train"}])
            with self.assertRaisesRegex(ValueError, "expected 'val'"):
                research._project_role(source, "val", output)

    def test_runner_rejects_every_cross_split_identity_leak(self):
        train_meta = sibling_rows(
            split="train",
            game_id="train-game",
            parent_id="train-parent",
            parent_sfen=TRAIN_PARENT,
            children=TRAIN_CHILDREN,
            moves=("7g7f", "2g2f"),
            parent_ply=0,
        )
        val_base = sibling_rows(
            split="val",
            game_id="val-game",
            parent_id="val-parent",
            parent_sfen=VAL_PARENT,
            children=VAL_CHILDREN,
            moves=("3c3d", "8c8d"),
            parent_ply=0,
        )
        for row in train_meta + val_base:
            row["raw_cp"] = row["cp"]
            row["declared_child_position_id"] = row["child_position_id"]

        mutations = {
            "game_id": ("game_id", train_meta[0]["game_id"]),
            "parent_id": ("parent_id", train_meta[0]["parent_id"]),
            "position_id": ("position_id", train_meta[0]["position_id"]),
            "child_position_id": (
                "child_position_id",
                train_meta[0]["child_position_id"],
            ),
            "cross_parent_child_semantic": (
                "position_id",
                train_meta[0]["child_position_id"],
            ),
        }
        for label, (field, value) in mutations.items():
            with self.subTest(label=label):
                val_meta = json.loads(json.dumps(val_base))
                for row in val_meta:
                    row[field] = value
                with self.assertRaisesRegex(ValueError, "leakage"):
                    research._validate_split_metadata(train_meta, val_meta)

    def test_one_epoch_scratch_run_binds_splitless_validation_and_stays_off_live(self):
        with tempfile.TemporaryDirectory() as tmp:
            train_path = os.path.join(tmp, "train.jsonl")
            val_path = os.path.join(tmp, "val.jsonl")
            output = os.path.join(tmp, "run")
            write_rows(
                train_path,
                sibling_rows(
                    split="train",
                    game_id="train-game",
                    parent_id="train-parent",
                    parent_sfen=TRAIN_PARENT,
                    children=TRAIN_CHILDREN,
                    moves=("7g7f", "2g2f"),
                    parent_ply=0,
                ),
            )
            write_rows(
                val_path,
                sibling_rows(
                    split=None,
                    game_id="val-game",
                    parent_id="val-parent",
                    parent_sfen=VAL_PARENT,
                    children=VAL_CHILDREN,
                    moves=("3c3d", "8c8d"),
                    parent_ply=0,
                ),
            )
            result = research.run(
                SimpleNamespace(
                    data=train_path,
                    val_data=val_path,
                    out=output,
                    epochs=1,
                    batch=2,
                    lr=1e-3,
                    k=600.0,
                    cp_clamp=3000,
                    device="cpu",
                    torch_threads=1,
                    seed=42,
                    features="board",
                    rank_weight=1.0,
                    rank_pair_min=50.0,
                    rank_pair_max=600.0,
                    rank_margin_cp=50.0,
                    policy_weight=0.25,
                    policy_temp_cp=200.0,
                    halfkp_lift_init="",
                )
            )
            self.assertEqual(result["parents"], {"train": 1, "val": 1})
            self.assertFalse(result["live_weight_changed"])
            self.assertEqual(result["best_epoch"], 1)
            self.assertEqual(
                sorted(os.listdir(output)),
                ["best.pt", "last.pt", "result.json"],
            )

    def test_halfkp_lift_keeps_epoch_zero_as_a_live_equivalent_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            train_path = os.path.join(tmp, "train.jsonl")
            val_path = os.path.join(tmp, "val.jsonl")
            output = os.path.join(tmp, "run")
            checkpoint_path = os.path.join(tmp, "board.pt")
            write_rows(
                train_path,
                sibling_rows(
                    split="train",
                    game_id="train-game",
                    parent_id="train-parent",
                    parent_sfen=TRAIN_PARENT,
                    children=TRAIN_CHILDREN,
                    moves=("7g7f", "2g2f"),
                    parent_ply=0,
                ),
            )
            write_rows(
                val_path,
                sibling_rows(
                    split=None,
                    game_id="val-game",
                    parent_id="val-parent",
                    parent_sfen=VAL_PARENT,
                    children=VAL_CHILDREN,
                    moves=("3c3d", "8c8d"),
                    parent_ply=0,
                ),
            )
            source = train.DistillNet("board")
            legacy_arch = train.expected_arch(
                features="board",
                input_dim=source.board_feats + source.hand_feats,
                h1=train.DistillNet.H1,
                h2=train.DistillNet.H2,
                k=600.0,
                kp_buckets=1,
            )
            legacy_arch.pop("schema")
            torch.save(
                {
                    "model": source.state_dict(),
                    "epoch": 4,
                    "arch": legacy_arch,
                },
                checkpoint_path,
            )
            result = research.run(
                SimpleNamespace(
                    data=train_path,
                    val_data=val_path,
                    out=output,
                    epochs=1,
                    batch=2,
                    lr=1e-20,
                    k=600.0,
                    cp_clamp=3000,
                    device="cpu",
                    torch_threads=1,
                    seed=42,
                    features="halfkp-factor",
                    halfkp_lift_init=checkpoint_path,
                    allow_legacy_init=True,
                    rank_weight=1.0,
                    rank_pair_min=50.0,
                    rank_pair_max=600.0,
                    rank_margin_cp=50.0,
                    policy_weight=0.25,
                    policy_temp_cp=200.0,
                )
            )
            self.assertEqual(result["initializer"]["epoch"], 4)
            self.assertEqual(
                result["initializer"]["legacy_arch_inferred_fields"],
                ["schema"],
            )
            self.assertEqual(result["curve"][0]["epoch"], 0)
            self.assertEqual(result["curve"][1]["epoch"], 1)
            best = torch.load(
                os.path.join(output, "best.pt"),
                map_location="cpu",
                weights_only=True,
            )
            self.assertIn(best["epoch"], (0, 1))
            self.assertEqual(best["arch"]["features"], "halfkp-factor")


if __name__ == "__main__":
    unittest.main()
