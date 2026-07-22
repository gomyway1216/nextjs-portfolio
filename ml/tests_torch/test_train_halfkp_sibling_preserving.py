import json
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import train  # noqa: E402
import train_halfkp_sibling_preserving as preserving  # noqa: E402


TRAIN_PARENT = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
TRAIN_CHILDREN = (
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2",
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL w - 2",
)
VAL_PARENT = "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 3"
VAL_CHILDREN = (
    "lnsgkgsnl/1r5b1/pppppp2p/6pp1/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL b - 4",
    "lnsgkgsnl/1r5b1/p1pppp1pp/1p4p2/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL b - 4",
)
REPLAY_SFENS = (
    "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL w - 3",
    "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL b - 4",
    "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P4P1/PP1PPPP1P/1B5R1/LNSGKGSNL w - 5",
)
PRESERVATION_SFENS = (
    "lnsgkgsnl/1r5b1/pppp1pppp/4p4/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 2",
    "lnsgkgsnl/1r5b1/pppp1pppp/4p4/9/4P4/PPPP1PPPP/1B5R1/LNSGKGSNL b - 3",
)


def sibling_rows(split, game_id, parent_id, parent_sfen, children, moves, ply):
    rows = []
    for rank, (child, move, parent_cp) in enumerate(
        zip(children, moves, (300, 0), strict=True), start=1
    ):
        rows.append(
            {
                "schema": "shogi-sibling-v1",
                "schema_version": 1,
                "game_id": game_id,
                "parent_id": parent_id,
                "position_id": train.position_id_from_sfen(parent_sfen),
                "parent_sfen": parent_sfen,
                "parent_ply": ply,
                "ply": ply + 1,
                "move": move,
                "sources": ["played", "teacher"] if rank == 1 else ["teacher"],
                "sfen": child,
                "child_position_id": train.position_id_from_sfen(child),
                "cp": -parent_cp,
                "child_sfen": child,
                "teacher_child_cp": -parent_cp,
                "teacher_parent_cp": parent_cp,
                "teacher_rank": rank,
                "teacher_score_kind": "cp",
                "split": split,
            }
        )
    return rows


def write_rows(path, rows):
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        for row in rows:
            target.write(json.dumps(row, sort_keys=True) + "\n")


def write_protocol(path, *, initializer, data, val, replay, preservation):
    def source(candidate, rows=None):
        fingerprint = preserving._file_fingerprint(candidate)
        if rows is not None:
            fingerprint["rows"] = rows
        return fingerprint

    payload = {
        "schema": preserving.PROTOCOL_SCHEMA,
        "inputs": {
            "initializer": source(initializer),
            "legal_sibling_training": source(data, 2),
            "legal_sibling_validation": source(val, 2),
            "value_replay": source(replay, 3),
            "value_preservation_validation": source(preservation, 2),
        },
        "training": {
            "epochs": 1,
            "batch": 2,
            "rank_pair_min_cp": 50.0,
            "rank_pair_max_cp": 600.0,
            "rank_margin_cp": 50.0,
            "policy_temperature_cp": 200.0,
            "value_replay_ratio_rows": 1.0,
            "prospective_slots": [
                {
                    "id": "smoke-seed42",
                    "seed": 42,
                    "learning_rate": 1e-20,
                    "rank_weight": 1.0,
                    "policy_weight": 0.25,
                }
            ],
        },
        "epoch_admission_relative_to_initializer": {
            "minimum_sibling_pair_gain": 0.0,
            "minimum_sibling_top1_gain": 0.0,
            "maximum_value_mae_regression_cp": 10.0,
            "maximum_value_loss_relative_increase": 0.02,
        },
    }
    payload["inputs"]["value_replay"]["sample_rows"] = 2
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        json.dump(payload, target, sort_keys=True)
        target.write("\n")


class HalfkpSiblingPreservingTest(unittest.TestCase):
    @staticmethod
    def _metadata_rows(rows):
        metadata = json.loads(json.dumps(rows))
        for row in metadata:
            row["raw_cp"] = row["cp"]
            row["declared_child_position_id"] = row["child_position_id"]
        return metadata

    def test_metadata_validator_accepts_legacy_and_explicit_all_legal_groups(self):
        train_meta = self._metadata_rows(
            sibling_rows(
                "train",
                "train-game",
                "train-parent",
                TRAIN_PARENT,
                TRAIN_CHILDREN,
                ("7g7f", "2g2f"),
                0,
            )
        )
        for row in train_meta:
            row["sources"] = [preserving.ALL_LEGAL_FIXED_DEPTH_SOURCE]
        val_meta = self._metadata_rows(
            sibling_rows(
                "val",
                "val-game",
                "val-parent",
                VAL_PARENT,
                VAL_CHILDREN,
                ("3c3d", "8c8d"),
                2,
            )
        )

        train_groups, val_groups = preserving._validate_split_metadata(
            train_meta, val_meta
        )

        self.assertEqual(train_groups, [[0, 1]])
        self.assertEqual(val_groups, [[0, 1]])
        with self.assertRaisesRegex(SystemExit, "exactly one played source"):
            train.validate_sibling_metadata(train_meta, "train")
        self.assertEqual(
            train.validate_sibling_metadata(
                train_meta, "train", allow_all_legal_fixed_depth=True
            ),
            [[0, 1]],
        )
        self.assertTrue(
            all(
                row["sources"] == [preserving.ALL_LEGAL_FIXED_DEPTH_SOURCE]
                for row in train_meta
            )
        )

    def test_metadata_validator_rejects_ambiguous_all_legal_provenance(self):
        base_train = self._metadata_rows(
            sibling_rows(
                "train",
                "train-game",
                "train-parent",
                TRAIN_PARENT,
                TRAIN_CHILDREN,
                ("7g7f", "2g2f"),
                0,
            )
        )
        val_meta = self._metadata_rows(
            sibling_rows(
                "val",
                "val-game",
                "val-parent",
                VAL_PARENT,
                VAL_CHILDREN,
                ("3c3d", "8c8d"),
                2,
            )
        )
        mutations = [
            (
                "mixed",
                [
                    [preserving.ALL_LEGAL_FIXED_DEPTH_SOURCE],
                    ["teacher"],
                ],
            ),
            (
                "played",
                [
                    ["played", preserving.ALL_LEGAL_FIXED_DEPTH_SOURCE],
                    [preserving.ALL_LEGAL_FIXED_DEPTH_SOURCE],
                ],
            ),
            (
                "extra source",
                [
                    ["teacher", preserving.ALL_LEGAL_FIXED_DEPTH_SOURCE],
                    ["teacher", preserving.ALL_LEGAL_FIXED_DEPTH_SOURCE],
                ],
            ),
            ("teacher only", [["teacher"], ["teacher"]]),
        ]
        for name, sources in mutations:
            with self.subTest(name=name):
                train_meta = json.loads(json.dumps(base_train))
                for row, row_sources in zip(train_meta, sources, strict=True):
                    row["sources"] = row_sources
                with self.assertRaisesRegex(
                    ValueError, "explicit all-legal-fixed-depth-teacher group"
                ):
                    preserving._validate_split_metadata(train_meta, val_meta)

        missing = json.loads(json.dumps(base_train))
        for row in missing:
            row["sources"] = [preserving.ALL_LEGAL_FIXED_DEPTH_SOURCE]
        del missing[1]["sources"]
        with self.assertRaisesRegex(ValueError, "sources must be a non-empty array"):
            preserving._validate_split_metadata(missing, val_meta)

    def test_committed_protocol_commands_bind_every_run_to_the_protocol(self):
        path = os.path.join(
            ML_DIR, "protocols", "halfkp-sibling-preservation-v1-plan.json"
        )
        with open(path, encoding="utf-8") as source:
            protocol = json.load(source)
        commands = protocol["complete_training_commands_from_repository_root"]
        self.assertEqual(len(commands), 3)
        for command in commands:
            self.assertIn(
                "--protocol ml/protocols/halfkp-sibling-preservation-v1-plan.json",
                command,
            )

    def test_protocol_hash_and_slot_mismatch_stop_before_dataset_load_or_optimizer(self):
        with tempfile.TemporaryDirectory() as tmp:
            paths = {}
            for name in ("initializer", "data", "val", "replay", "preservation"):
                candidate = os.path.join(tmp, name)
                with open(candidate, "wb") as target:
                    target.write(name.encode("ascii"))
                paths[name] = candidate
            protocol = os.path.join(tmp, "protocol.json")
            write_protocol(protocol, **paths)
            with open(paths["data"], "ab") as target:
                target.write(b"-replaced")
            args = SimpleNamespace(
                protocol=protocol,
                init_ckpt=paths["initializer"],
                data=paths["data"],
                val_data=paths["val"],
                replay_data=paths["replay"],
                preservation_val_data=paths["preservation"],
                out=os.path.join(tmp, "run"),
                epochs=1,
                batch=2,
                replay_limit=2,
                replay_ratio=1.0,
                lr=1e-20,
                k=600.0,
                cp_clamp=3000,
                device="cpu",
                torch_threads=1,
                seed=42,
                rank_weight=1.0,
                rank_pair_min=50.0,
                rank_pair_max=600.0,
                rank_margin_cp=50.0,
                policy_weight=0.25,
                policy_temp_cp=200.0,
                min_pair_gain=0.0,
                min_top1_gain=0.0,
                max_value_mae_regression_cp=10.0,
                max_value_loss_relative=0.02,
            )
            with mock.patch.object(
                preserving.sibling_research, "load_role_bound_dataset"
            ) as load_dataset, mock.patch.object(
                torch.optim, "AdamW"
            ) as optimizer, self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                preserving.run(args)
            load_dataset.assert_not_called()
            optimizer.assert_not_called()
            with open(paths["data"], "wb") as target:
                target.write(b"data")
            args.lr = 2e-20
            with mock.patch.object(
                preserving.sibling_research, "load_role_bound_dataset"
            ) as load_dataset, mock.patch.object(
                torch.optim, "AdamW"
            ) as optimizer, self.assertRaisesRegex(ValueError, "slot mismatch"):
                preserving.run(args)
            load_dataset.assert_not_called()
            optimizer.assert_not_called()

    def test_strict_value_source_rejects_noninteger_cp(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "bad.jsonl")
            write_rows(path, [{"sfen": PRESERVATION_SFENS[0], "cp": 1.5}])
            with self.assertRaisesRegex(ValueError, "cp must be an integer"):
                preserving._strict_value_source(path)

    def test_admission_requires_ranking_gain_and_value_preservation(self):
        args = SimpleNamespace(
            min_pair_gain=0.01,
            min_top1_gain=0.0,
            max_value_mae_regression_cp=10.0,
            max_value_loss_relative=0.02,
        )
        baseline_sibling = {
            "sibling_pair_accuracy": 0.60,
            "sibling_top1_accuracy": 0.25,
        }
        baseline_value = {"value_loss": 0.1, "value_mae_cp": 400.0}
        passed = preserving._admission(
            {"sibling_pair_accuracy": 0.62, "sibling_top1_accuracy": 0.25},
            {"value_loss": 0.101, "value_mae_cp": 405.0},
            baseline_sibling,
            baseline_value,
            args,
        )
        self.assertTrue(passed["passed"])
        failed = preserving._admission(
            {"sibling_pair_accuracy": 0.62, "sibling_top1_accuracy": 0.25},
            {"value_loss": 0.11, "value_mae_cp": 405.0},
            baseline_sibling,
            baseline_value,
            args,
        )
        self.assertFalse(failed["passed"])

    def test_one_epoch_halfkp_warm_smoke_never_changes_live_weights(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = os.path.join(tmp, "train.jsonl")
            val = os.path.join(tmp, "val.jsonl")
            replay = os.path.join(tmp, "replay.jsonl")
            preservation = os.path.join(tmp, "preservation.jsonl")
            initializer_path = os.path.join(tmp, "halfkp.pt")
            protocol_path = os.path.join(tmp, "protocol.json")
            output = os.path.join(tmp, "run")
            write_rows(
                data,
                sibling_rows(
                    "train",
                    "train-game",
                    "train-parent",
                    TRAIN_PARENT,
                    TRAIN_CHILDREN,
                    ("7g7f", "2g2f"),
                    0,
                ),
            )
            write_rows(
                val,
                sibling_rows(
                    "val",
                    "val-game",
                    "val-parent",
                    VAL_PARENT,
                    VAL_CHILDREN,
                    ("3c3d", "8c8d"),
                    2,
                ),
            )
            write_rows(
                replay,
                [
                    {"sfen": sfen, "cp": cp}
                    for sfen, cp in zip(REPLAY_SFENS, (100, -100, 0), strict=True)
                ],
            )
            write_rows(
                preservation,
                [
                    {"sfen": sfen, "cp": cp}
                    for sfen, cp in zip(PRESERVATION_SFENS, (80, -80), strict=True)
                ],
            )
            model = train.DistillNet("halfkp-factor")
            arch = train.expected_arch(
                features="halfkp-factor",
                input_dim=model.arch_input_dim,
                h1=train.DistillNet.H1,
                h2=train.DistillNet.H2,
                k=600.0,
                kp_buckets=model.bucket_count,
            )
            torch.save({"model": model.state_dict(), "arch": arch, "epoch": 2}, initializer_path)
            write_protocol(
                protocol_path,
                initializer=initializer_path,
                data=data,
                val=val,
                replay=replay,
                preservation=preservation,
            )
            result = preserving.run(
                SimpleNamespace(
                    protocol=protocol_path,
                    data=data,
                    val_data=val,
                    replay_data=replay,
                    preservation_val_data=preservation,
                    init_ckpt=initializer_path,
                    out=output,
                    epochs=1,
                    batch=2,
                    replay_limit=2,
                    replay_ratio=1.0,
                    lr=1e-20,
                    k=600.0,
                    cp_clamp=3000,
                    device="cpu",
                    torch_threads=1,
                    seed=42,
                    rank_weight=1.0,
                    rank_pair_min=50.0,
                    rank_pair_max=600.0,
                    rank_margin_cp=50.0,
                    policy_weight=0.25,
                    policy_temp_cp=200.0,
                    min_pair_gain=0.0,
                    min_top1_gain=0.0,
                    max_value_mae_regression_cp=10.0,
                    max_value_loss_relative=0.02,
                )
            )
            self.assertFalse(result["live_weight_changed"])
            self.assertEqual(result["initializer"]["arch"]["features"], "halfkp-factor")
            self.assertEqual(
                result["semantic_overlap"]["sibling_vs_preservation_after_exclusion"],
                0,
            )
            self.assertEqual(result["best_epoch"], 1)
            self.assertEqual(sorted(os.listdir(output)), ["best.pt", "last.pt", "result.json"])
            for name in ("best.pt", "last.pt"):
                checkpoint = torch.load(
                    os.path.join(output, name),
                    map_location="cpu",
                    weights_only=True,
                )
                self.assertEqual(
                    set(checkpoint["sources"]),
                    {
                        "sibling_train",
                        "sibling_val",
                        "value_replay",
                        "value_preservation_val",
                    },
                )
                self.assertEqual(
                    checkpoint["sources"]["value_replay"]["sample"]["rows"], 2
                )
                self.assertEqual(
                    checkpoint["sources"]["sibling_train"]["verified_input"][
                        "sha256"
                    ],
                    preserving._file_fingerprint(data)["sha256"],
                )
                self.assertEqual(
                    checkpoint["semantic_exclusion"][
                        "sibling_vs_preservation_after_exclusion"
                    ],
                    0,
                )


if __name__ == "__main__":
    unittest.main()
