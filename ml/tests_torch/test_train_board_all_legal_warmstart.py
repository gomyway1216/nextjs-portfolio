import hashlib
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import train  # noqa: E402
import train_board_all_legal_warmstart as board_warmstart  # noqa: E402


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
PRESERVATION_SFEN = (
    "lnsgkgsnl/1r5b1/pppppp1pp/6p2/9/2P6/"
    "PP1PPPPPP/1B5R1/LNSGKGSNL b - 3"
)
REPLAY_SFEN = (
    "lnsgkgsnl/1r5b1/p1ppppppp/1p7/9/7P1/"
    "PPPPPPP1P/1B5R1/LNSGKGSNL b - 3"
)


def sibling_rows(
    *, split, game_id, parent_id, parent_sfen, children, moves, parent_ply
):
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
                "parent_ply": parent_ply,
                "ply": parent_ply + 1,
                "move": move,
                "sources": [board_warmstart.ALL_LEGAL_SOURCE],
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


def write_jsonl(path, rows):
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        for row in rows:
            target.write(json.dumps(row, sort_keys=True) + "\n")


def identity(path, *, rows=None):
    with open(path, "rb") as source:
        raw = source.read()
    result = {
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    if rows is not None:
        result["rows"] = rows
    return result


class BoardAllLegalWarmstartTest(unittest.TestCase):
    def test_production_cp_truncates_positive_and_negative_toward_zero(self):
        out_q = torch.tensor(
            [-8129, -8128, -14, -13, -1, 0, 1, 13, 14, 8128, 8129],
            dtype=torch.int64,
        )
        self.assertEqual(
            board_warmstart._production_cp_from_out_q(out_q).tolist(),
            [-600, -600, -1, 0, 0, 0, 0, 0, 1, 600, 600],
        )
        with self.assertRaisesRegex(TypeError, "integer tensor"):
            board_warmstart._production_cp_from_out_q(out_q.float())

    def test_optimizer_creation_requires_a_prevalidated_live_baseline(self):
        model = train.DistillNet("board")
        args = SimpleNamespace(lr=1e-5)
        with self.assertRaisesRegex(ValueError, "before optimizer creation"):
            board_warmstart._create_optimizer(
                model,
                args,
                live_baseline_evaluated_before_optimizer=False,
            )
        with mock.patch.object(
            torch.optim, "AdamW", return_value="optimizer"
        ) as adamw:
            self.assertEqual(
                board_warmstart._create_optimizer(
                    model,
                    args,
                    live_baseline_evaluated_before_optimizer=True,
                ),
                "optimizer",
            )
        adamw.assert_called_once()

    def test_real_tracked_plan_passes_manifest_completeness_validation(self):
        plan = json.loads(
            board_warmstart.TRACKED_PROTOCOL_PATH.read_text(encoding="utf-8")
        )
        consistency = plan["input_consistency"]
        self.assertEqual(
            consistency["training_validation_semantic_union_overlap"], 0
        )
        self.assertNotIn(
            "training_validation_parent_child_semantic_union_overlap",
            consistency,
        )
        board_warmstart._validate_dataset_manifest(
            plan["inputs"]["dataset_manifest"]["path"],
            {
                "expected_inputs": plan["inputs"],
                "input_consistency": consistency,
            },
            train_rows=plan["inputs"]["legal_sibling_training"]["rows"],
            train_parents=plan["inputs"]["legal_sibling_training"]["parents"],
            train_games=plan["inputs"]["legal_sibling_training"]["games"],
            val_rows=plan["inputs"]["legal_sibling_validation"]["rows"],
            val_parents=plan["inputs"]["legal_sibling_validation"]["parents"],
            val_games=plan["inputs"]["legal_sibling_validation"]["games"],
            allow_unsealed_dataset_for_tests=False,
        )

    def test_wrong_k_type_or_value_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = {
                "out": os.path.join(tmp, "run"),
                "epochs": 3,
                "batch": 2,
                "replay_limit": 1,
                "lr": 1e-5,
                "k": 600.0,
                "replay_ratio": 1.0,
                "policy_temp_cp": 50.0,
                "torch_threads": 1,
                "rank_weight": 0.25,
                "rank_pair_min": 50.0,
                "rank_pair_max": 600.0,
                "rank_margin_cp": 50.0,
                "policy_weight": 0.0625,
                "cp_clamp": 3000,
            }
            for wrong in (600, 601.0, True):
                with self.subTest(k=wrong), self.assertRaisesRegex(
                    ValueError, "exact float 600.0"
                ):
                    board_warmstart._validate_args(
                        SimpleNamespace(**{**base, "k": wrong})
                    )

    def test_altered_tracked_plan_is_rejected_before_argument_use(self):
        with tempfile.TemporaryDirectory() as tmp:
            altered = Path(tmp) / "altered.json"
            altered.write_bytes(
                board_warmstart.TRACKED_PROTOCOL_PATH.read_bytes() + b"\n"
            )
            with mock.patch.object(
                board_warmstart, "TRACKED_PROTOCOL_PATH", altered
            ), self.assertRaisesRegex(ValueError, "tracked protocol identity mismatch"):
                board_warmstart._verify_protocol(SimpleNamespace())

    def test_static_gate_rejects_negative_bool_nan_and_extra_keys(self):
        plan = json.loads(
            board_warmstart.TRACKED_PROTOCOL_PATH.read_text(encoding="utf-8")
        )
        gate = plan["static_gate"]
        board_warmstart._validate_static_gate(gate)
        mutations = (
            ("maximum_value_loss", -1.0),
            ("minimum_pair50", True),
            ("minimum_ndcg_at_5_gain", float("nan")),
        )
        for field, value in mutations:
            with self.subTest(field=field), self.assertRaises(ValueError):
                board_warmstart._validate_static_gate(
                    {**gate, field: value}
                )
        with self.assertRaisesRegex(ValueError, "keys mismatch"):
            board_warmstart._validate_static_gate({**gate, "unexpected": 1})

    def test_missing_input_sha_and_live_mutation_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = os.path.join(tmp, "source.bin")
            with open(source, "wb") as target:
                target.write(b"bound")
            with self.assertRaisesRegex(ValueError, "identity is invalid"):
                board_warmstart._require_identity(
                    source, {"bytes": 5}, "missing-sha"
                )
            before_bytes, before_identity = board_warmstart._read_bytes(source)
            with open(source, "wb") as target:
                target.write(b"mutated")
            with self.assertRaisesRegex(ValueError, "changed during"):
                board_warmstart._require_live_unchanged(
                    source, before_bytes, before_identity
                )

    def test_ranking_metrics_are_pessimistic_for_tied_predictions(self):
        metadata = [{"parent_id": "p"} for _ in range(3)]
        metrics = board_warmstart.ranking_metrics(
            torch.zeros(3),
            torch.tensor([-300.0, -100.0, 0.0]),
            metadata,
            ndcg_temperature_cp=100.0,
            ndcg_clamp_cp=1200.0,
        )
        self.assertEqual(metrics["top1_correct"], 0)
        self.assertEqual(metrics["recall_at_3_correct"], 1)
        self.assertEqual(metrics["pair50"], 0.0)
        self.assertEqual(metrics["pair200"], 0.0)
        self.assertLess(metrics["ndcg_at_5"], 1.0)

    def test_all_legal_role_rejects_a_played_row(self):
        rows = sibling_rows(
            split="train",
            game_id="g",
            parent_id="p",
            parent_sfen=TRAIN_PARENT,
            children=TRAIN_CHILDREN,
            moves=("7g7f", "2g2f"),
            parent_ply=0,
        )
        rows[0]["sources"] = ["played", "teacher"]
        with self.assertRaisesRegex(ValueError, "not an explicit"):
            board_warmstart._require_all_legal(rows, "train")

    def test_one_epoch_run_binds_live_export_and_never_writes_live_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            train_path = os.path.join(tmp, "train.jsonl")
            val_path = os.path.join(tmp, "val.jsonl")
            replay_path = os.path.join(tmp, "replay.jsonl")
            preservation_path = os.path.join(tmp, "preservation.jsonl")
            checkpoint_path = os.path.join(tmp, "live.pt")
            live_weights_path = os.path.join(tmp, "live-weights.bin")
            manifest_path = os.path.join(tmp, "manifest.json")
            protocol_path = os.path.join(tmp, "protocol.json")
            output = os.path.join(tmp, "run")
            train_rows = sibling_rows(
                split="train",
                game_id="train-game",
                parent_id="train-parent",
                parent_sfen=TRAIN_PARENT,
                children=TRAIN_CHILDREN,
                moves=("7g7f", "2g2f"),
                parent_ply=0,
            )
            val_rows = sibling_rows(
                split="val",
                game_id="val-game",
                parent_id="val-parent",
                parent_sfen=VAL_PARENT,
                children=VAL_CHILDREN,
                moves=("3c3d", "8c8d"),
                parent_ply=0,
            )
            write_jsonl(train_path, train_rows)
            write_jsonl(val_path, val_rows)
            write_jsonl(replay_path, [{"sfen": REPLAY_SFEN, "cp": 25}])
            write_jsonl(
                preservation_path, [{"sfen": PRESERVATION_SFEN, "cp": -15}]
            )

            model = train.DistillNet("board")
            with torch.no_grad():
                for parameter in model.parameters():
                    parameter.zero_()
            torch.save(
                {
                    "model": model.state_dict(),
                    "epoch": 27,
                    "arch": dict(board_warmstart.LIVE_LEGACY_ARCH),
                },
                checkpoint_path,
            )
            live_weights = board_warmstart._serialized_board_weights(model)
            with open(live_weights_path, "wb") as target:
                target.write(live_weights)
            with open(manifest_path, "w", encoding="utf-8") as target:
                json.dump({"schema": "synthetic-unsealed-test-manifest"}, target)
            protocol = {
                "schema": board_warmstart.PROTOCOL_SCHEMA,
                "inputs": {
                    "initializer": identity(checkpoint_path),
                    "live_weights": identity(live_weights_path),
                    "dataset_manifest": identity(manifest_path),
                    "legal_sibling_training": identity(
                        train_path, rows=len(train_rows)
                    ),
                    "legal_sibling_validation": identity(
                        val_path, rows=len(val_rows)
                    ),
                    "value_replay": identity(replay_path, rows=1),
                    "value_preservation_validation": identity(
                        preservation_path, rows=1
                    ),
                },
                "training": {
                    "epochs": 3,
                    "batch": 2,
                    "replay_limit": 1,
                    "replay_ratio": 0.5,
                    "k": 600.0,
                    "cp_clamp": 3000,
                    "rank_pair_min_cp": 50.0,
                    "rank_pair_max_cp": 600.0,
                    "rank_margin_cp": 50.0,
                    "policy_temperature_cp": 50.0,
                    "device": "cpu",
                    "torch_threads": 1,
                    "arm_count": 1,
                    "optimizer": "AdamW",
                    "weight_decay": 0.0,
                    "checkpoint_policy": "fixed-final-epoch-3-only",
                    "early_stopping": False,
                    "candidate_validation_evaluations_before_final_checkpoint_freeze": 0,
                    "live_baseline_evaluations_before_optimizer_creation": 1,
                    "candidate_validation_path_used_by_optimizer": False,
                    "replay_sample_seed": 1051,
                    "preservation_exclusion_seed": 2045,
                    "trainer_and_evaluator_source_hashes_must_be_recorded_before_optimizer_creation": True,
                    "prospective_slots": [
                        {
                            "id": "test",
                            "seed": 42,
                            "learning_rate": 1e-20,
                            "rank_weight": 0.25,
                            "policy_weight": 0.0625,
                        }
                    ],
                },
                "static_gate": {
                    "all_checks_required": True,
                    "failure_is_closed": True,
                    "validation_parents": 1,
                    "minimum_top1_correct_parents": 0,
                    "minimum_top1_accuracy": 0.0,
                    "minimum_recall_at_3_gain": 0.0,
                    "minimum_recall_at_5_gain": 0.0,
                    "minimum_ndcg_at_5_gain": 0.0,
                    "minimum_pair50": 0.0,
                    "minimum_pair200_gain": 0.0,
                    "maximum_value_loss_ratio": 2.0,
                    "maximum_value_loss": 1.0,
                    "maximum_value_mae_regression_cp": 1000.0,
                    "maximum_value_mae_cp": 2000.0,
                    "maximum_float_to_int16_top1_loss_parents": 1,
                    "maximum_float_to_int16_pair50_drop": 1.0,
                    "maximum_float_to_int16_ndcg_at_5_drop": 1.0,
                    "expected_export_bytes": board_warmstart.LIVE_EXPORT_BYTES,
                    "minimum_export_roundtrip_parity_positions": 2,
                    "maximum_faults": 0,
                    "maximum_semantic_overlap": 0,
                    "ndcg_temperature_cp": 100.0,
                    "ndcg_clamp_cp": 1200.0,
                    "parity_position_selection": "first test rows",
                    "candidate_source": "fixed final epoch 3 only",
                    "on_failure": "reject test candidate",
                },
            }
            with open(protocol_path, "w", encoding="utf-8") as target:
                json.dump(protocol, target, sort_keys=True)
            live_before = identity(live_weights_path)
            result = board_warmstart.run(
                SimpleNamespace(
                    data=train_path,
                    val_data=val_path,
                    replay_data=replay_path,
                    preservation_val_data=preservation_path,
                    init_ckpt=checkpoint_path,
                    live_weights=live_weights_path,
                    dataset_manifest=manifest_path,
                    out=output,
                    epochs=3,
                    batch=2,
                    replay_limit=1,
                    replay_ratio=0.5,
                    lr=1e-20,
                    k=600.0,
                    cp_clamp=3000,
                    device="cpu",
                    torch_threads=1,
                    seed=42,
                    rank_weight=0.25,
                    rank_pair_min=50.0,
                    rank_pair_max=600.0,
                    rank_margin_cp=50.0,
                    policy_weight=0.0625,
                    policy_temp_cp=50.0,
                ),
                allow_unpinned_protocol_for_tests=True,
                protocol_path_for_tests=protocol_path,
                allow_unsealed_dataset_for_tests=True,
            )
            self.assertEqual(result["status"], "complete-static-candidate-not-authorized-for-live")
            self.assertFalse(result["live_weight_changed"])
            self.assertFalse(result["live_weight_path_write_attempted"])
            self.assertEqual(
                result[
                    "candidate_validation_evaluations_before_final_checkpoint_freeze"
                ],
                0,
            )
            self.assertTrue(
                result["live_baseline_evaluated_before_optimizer_creation"]
            )
            self.assertEqual([set(row) for row in result["curve"]], [
                {"epoch", "train_loss", "seconds"},
                {"epoch", "train_loss", "seconds"},
                {"epoch", "train_loss", "seconds"},
            ])
            self.assertEqual(result["candidate_epoch"], 3)
            self.assertTrue(
                result["live_weight_identity"]["byte_exact_unchanged"]
            )
            self.assertEqual(identity(live_weights_path), live_before)
            self.assertEqual(
                os.path.getsize(os.path.join(output, "candidate-weights.bin")),
                board_warmstart.LIVE_EXPORT_BYTES,
            )
            self.assertEqual(
                sorted(os.listdir(output)),
                [
                    "best.pt",
                    "candidate-weights.bin",
                    "last.pt",
                    "result.json",
                ],
            )

    def test_live_initializer_export_mismatch_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            checkpoint_path = os.path.join(tmp, "live.pt")
            live_weights_path = os.path.join(tmp, "live.bin")
            model = train.DistillNet("board")
            torch.save(
                {
                    "model": model.state_dict(),
                    "epoch": 27,
                    "arch": dict(board_warmstart.LIVE_LEGACY_ARCH),
                },
                checkpoint_path,
            )
            exported = bytearray(board_warmstart._serialized_board_weights(model))
            exported[0] ^= 1
            with open(live_weights_path, "wb") as target:
                target.write(exported)
            with self.assertRaisesRegex(ValueError, "not byte-identical"):
                board_warmstart._load_initializer(
                    checkpoint_path, live_weights_path
                )


if __name__ == "__main__":
    unittest.main()
