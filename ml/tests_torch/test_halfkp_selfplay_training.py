import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import tempfile
import unittest

import torch


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))
MODULE_PATH = ML_DIR / "run-halfkp-selfplay-training.py"
SPEC = importlib.util.spec_from_file_location("run_halfkp_selfplay_training", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
selfplay = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(selfplay)

import train  # noqa: E402


TRAIN_SFEN = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2"
VAL_SFEN = "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 3"


def identity(path):
    raw = Path(path).read_bytes()
    return {
        "path": os.path.realpath(path),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def checkpoint_args(**overrides):
    values = {
        "features": selfplay.FEATURES,
        "k": selfplay.K_SIGMOID,
    }
    values.update(overrides)
    return values


def write_initializer(path, *, arch=None):
    torch.save(
        {
            "model": {},
            "arch": arch or selfplay._expected_checkpoint_arch(),
            "args": checkpoint_args(),
            "epoch": 7,
        },
        path,
    )


def row(*, split, game_id, sfen, cp, outcome, source_game_id=None):
    side_to_move = sfen.split()[1]
    winner = (
        None
        if outcome == 0.5
        else (
            side_to_move
            if outcome == 1
            else ("w" if side_to_move == "b" else "b")
        )
    )
    return {
        "actor_weights_sha256": "a" * 64,
        "cp": cp,
        "game_id": game_id,
        "move": "3c3d",
        "opening_id": f"opening-{game_id}",
        "outcome": outcome,
        "ply": int(sfen.split()[3]) - 1,
        "position_id": train.position_id_from_sfen(sfen),
        "result": {"reason": "resign", "winner": winner},
        "schema": selfplay.ROW_SCHEMA,
        "search": {
            "depth": 12,
            "label_depth": 12,
            "leaves": 50,
            "nodes": 100,
            "play_depth": 4,
        },
        "sfen": sfen,
        "source_game_id": source_game_id or f"source-{game_id}",
        "split": split,
    }


def write_rows(path, rows):
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        for value in rows:
            target.write(json.dumps(value, sort_keys=True, allow_nan=False) + "\n")


class Fixture:
    def __init__(self, root):
        self.root = root
        self.init = os.path.join(root, "champion.pt")
        self.data = os.path.join(root, "train.jsonl")
        self.val = os.path.join(root, "val.jsonl")
        self.protocol = os.path.join(root, "protocol.json")
        self.out = os.path.join(root, "run")
        write_initializer(self.init)
        write_rows(
            self.data,
            [
                row(
                    split="train",
                    game_id="selfplay-game-train",
                    sfen=TRAIN_SFEN,
                    cp=120,
                    outcome=1.0,
                )
            ],
        )
        write_rows(
            self.val,
            [
                row(
                    split="val",
                    game_id="selfplay-game-val",
                    sfen=VAL_SFEN,
                    cp=-80,
                    outcome=0.5,
                )
            ],
        )
        self.write_protocol()

    def protocol_payload(self):
        init_identity = identity(self.init)
        train_identity = identity(self.data)
        val_identity = identity(self.val)
        train_entry = {
            **train_identity,
            "rows": 1,
            "row_schema": selfplay.ROW_SCHEMA,
        }
        val_entry = {
            **val_identity,
            "rows": 1,
            "row_schema": selfplay.ROW_SCHEMA,
        }
        arm_bindings = {
            "training_dataset_sha256": train_identity["sha256"],
            "validation_dataset_sha256": val_identity["sha256"],
            "initializer_sha256": init_identity["sha256"],
        }
        return {
            "schema": selfplay.PROTOCOL_SCHEMA,
            "inputs": {
                "champion_initializer": init_identity,
                "training_dataset": train_entry,
                "validation_dataset": val_entry,
            },
            "training": {
                "features": selfplay.FEATURES,
                "loss": selfplay.LOSS,
                "epochs": selfplay.EPOCHS,
                "batch": selfplay.BATCH,
                "learning_rate": selfplay.LEARNING_RATE,
                "k": selfplay.K_SIGMOID,
                "cp_clamp": selfplay.CP_CLAMP,
                "device": selfplay.DEVICE,
                "seed": selfplay.SEED,
                "prospective_arms": [
                    {
                        "id": "lambda-050",
                        "search_score_fraction": 0.50,
                        "wdl_mix": 0.50,
                        **arm_bindings,
                    },
                    {
                        "id": "lambda-075",
                        "search_score_fraction": 0.75,
                        "wdl_mix": 0.25,
                        **arm_bindings,
                    },
                ],
            },
        }

    def write_protocol(self, payload=None):
        if payload is None:
            payload = self.protocol_payload()
        with open(self.protocol, "w", encoding="utf-8", newline="\n") as target:
            json.dump(payload, target, sort_keys=True, allow_nan=False)
            target.write("\n")

    def args(self, *, arm="lambda-050"):
        protocol_identity = identity(self.protocol)
        return argparse.Namespace(
            protocol=self.protocol,
            protocol_bytes=protocol_identity["bytes"],
            protocol_sha256=protocol_identity["sha256"],
            data=self.data,
            val_data=self.val,
            init_ckpt=self.init,
            arm=arm,
            out=self.out,
        )


class HalfkpSelfplayTrainingTest(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        return Fixture(temporary.name)

    def test_selfplay_schema_with_side_to_move_outcome_is_accepted(self):
        fixture = self.fixture()
        raw = Path(fixture.data).read_bytes()

        summary = selfplay._dataset_summary(
            fixture.data,
            raw,
            expected_rows=1,
            expected_split="train",
        )

        self.assertEqual(summary["rows"], 1)
        self.assertEqual(summary["games"], 1)
        self.assertEqual(summary["source_games"], 1)
        self.assertEqual(summary["outcomes"], {"loss": 0, "draw": 0, "win": 1})

    def test_wrong_dataset_sha_is_rejected_before_launch(self):
        fixture = self.fixture()
        payload = fixture.protocol_payload()
        payload["inputs"]["training_dataset"]["sha256"] = "0" * 64
        fixture.write_protocol(payload)

        with self.assertRaisesRegex(ValueError, "training_dataset identity mismatch"):
            selfplay.run_selfplay_training(
                fixture.args(),
                command_runner=lambda *_args, **_kwargs: self.fail("must not launch"),
                mps_available=lambda: True,
            )

    def test_wrong_initializer_arch_is_rejected_before_launch(self):
        fixture = self.fixture()
        wrong_arch = selfplay._expected_checkpoint_arch()
        wrong_arch["features"] = "board"
        write_initializer(fixture.init, arch=wrong_arch)
        fixture.write_protocol()

        with self.assertRaisesRegex(ValueError, "initializer architecture mismatch"):
            selfplay.run_selfplay_training(
                fixture.args(),
                command_runner=lambda *_args, **_kwargs: self.fail("must not launch"),
                mps_available=lambda: True,
            )

    def test_existing_output_is_rejected_before_input_or_launch(self):
        fixture = self.fixture()
        os.mkdir(fixture.out)

        with self.assertRaisesRegex(ValueError, "existing output"):
            selfplay.run_selfplay_training(
                fixture.args(),
                command_runner=lambda *_args, **_kwargs: self.fail("must not launch"),
                mps_available=lambda: True,
            )

    def test_missing_selected_arm_is_rejected(self):
        fixture = self.fixture()

        with self.assertRaisesRegex(ValueError, "selected prospective arm is absent"):
            selfplay.run_selfplay_training(
                fixture.args(arm="lambda-missing"),
                command_runner=lambda *_args, **_kwargs: self.fail("must not launch"),
                mps_available=lambda: True,
            )

    def test_wdl_mix_point_75_is_forbidden_for_lambda_point_75(self):
        fixture = self.fixture()
        payload = fixture.protocol_payload()
        payload["training"]["prospective_arms"][1]["wdl_mix"] = 0.75
        fixture.write_protocol(payload)

        with self.assertRaisesRegex(ValueError, "lambda=0.75 must use wdl_mix=0.25"):
            selfplay.run_selfplay_training(
                fixture.args(arm="lambda-075"),
                command_runner=lambda *_args, **_kwargs: self.fail("must not launch"),
                mps_available=lambda: True,
            )

    def test_explicit_validation_game_and_position_leakage_are_rejected(self):
        for field in ("game_id", "position_id", "source_game_id"):
            with self.subTest(field=field):
                fixture = self.fixture()
                train_row = json.loads(Path(fixture.data).read_text(encoding="utf-8"))
                val_row = json.loads(Path(fixture.val).read_text(encoding="utf-8"))
                if field == "game_id":
                    val_row["game_id"] = train_row["game_id"]
                elif field == "position_id":
                    val_row["sfen"] = train_row["sfen"]
                    val_row["position_id"] = train_row["position_id"]
                    val_row["ply"] = train_row["ply"]
                else:
                    val_row["source_game_id"] = train_row["source_game_id"]
                write_rows(fixture.val, [val_row])
                fixture.write_protocol()
                with self.assertRaisesRegex(ValueError, rf"{field} leakage"):
                    selfplay.run_selfplay_training(
                        fixture.args(),
                        command_runner=lambda *_args, **_kwargs: self.fail("must not launch"),
                        mps_available=lambda: True,
                    )

    def test_one_generated_game_cannot_mix_source_game_ids(self):
        fixture = self.fixture()
        rows = [
            row(
                split="train",
                game_id="one-generated-game",
                source_game_id="source-a",
                sfen=TRAIN_SFEN,
                cp=120,
                outcome=1.0,
            ),
            row(
                split="train",
                game_id="one-generated-game",
                source_game_id="source-b",
                sfen=VAL_SFEN,
                cp=80,
                outcome=1.0,
            ),
        ]
        write_rows(fixture.data, rows)

        with self.assertRaisesRegex(ValueError, "mixed provenance/result"):
            selfplay._dataset_summary(
                fixture.data,
                Path(fixture.data).read_bytes(),
                expected_rows=2,
                expected_split="train",
            )

    def test_exact_command_and_completed_output_binding(self):
        fixture = self.fixture()
        args = fixture.args(arm="lambda-075")
        captured = []

        def fake_runner(command, *, check):
            self.assertFalse(check)
            captured.append(command)
            expected_args = {
                "data": os.path.realpath(fixture.data),
                "val_data": os.path.realpath(fixture.val),
                "out": os.path.realpath(fixture.out),
                "epochs": 2,
                "batch": 256,
                "lr": 3e-6,
                "k": 600.0,
                "cp_clamp": 3000,
                "wdl_mix": 0.25,
                "device": "mps",
                "seed": 42,
                "features": "halfkp-factor",
                "loss": "sigmoid",
                "init_ckpt": os.path.realpath(fixture.init),
                "limit": 0,
                "select_metric": "value-loss",
                "halfkp_train_scope": "all",
            }
            initializer = identity(fixture.init)
            init_binding = {
                "path": initializer["path"],
                "bytes": initializer["bytes"],
                "sha256": initializer["sha256"],
                "epoch": 7,
            }
            for name, epoch in (("best.pt", 1), ("last.pt", 2)):
                torch.save(
                    {
                        "model": {},
                        "arch": selfplay._expected_checkpoint_arch(),
                        "args": expected_args,
                        "init_checkpoint": init_binding,
                        "epoch": epoch,
                    },
                    os.path.join(fixture.out, name),
                )
            Path(fixture.out, "curve.csv").write_text(
                "epoch,train_loss\n0,nan\n1,0.1\n2,0.05\n", encoding="utf-8"
            )
            return SimpleNamespace(returncode=0)

        result = selfplay.run_selfplay_training(
            args,
            command_runner=fake_runner,
            mps_available=lambda: True,
        )

        expected_command = [
            os.sys.executable,
            str(MODULE_PATH.with_name("train.py")),
            "--data",
            os.path.realpath(fixture.data),
            "--val-data",
            os.path.realpath(fixture.val),
            "--out",
            os.path.realpath(fixture.out),
            "--epochs",
            "2",
            "--batch",
            "256",
            "--lr",
            "3e-06",
            "--k",
            "600.0",
            "--cp-clamp",
            "3000",
            "--wdl-mix",
            "0.25",
            "--device",
            "mps",
            "--seed",
            "42",
            "--features",
            "halfkp-factor",
            "--loss",
            "sigmoid",
            "--init-ckpt",
            os.path.realpath(fixture.init),
            "--limit",
            "0",
            "--select-metric",
            "value-loss",
            "--halfkp-train-scope",
            "all",
        ]
        self.assertEqual(captured, [expected_command])
        self.assertEqual(result["status"], "complete")
        self.assertEqual(result["selected_arm"]["wdl_mix"], 0.25)
        self.assertFalse(result["live_weights_changed"])
        saved = json.loads(Path(fixture.out, "result.json").read_text(encoding="utf-8"))
        self.assertEqual(saved, result)
        self.assertEqual(set(saved["artifacts"]), {"best.pt", "last.pt", "curve.csv"})


if __name__ == "__main__":
    unittest.main()
