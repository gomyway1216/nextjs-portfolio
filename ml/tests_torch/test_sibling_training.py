import json
import math
import os
import random
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import train as train_module  # noqa: E402
import build_strength_first_qat_training_plan_candidate as strength_builder  # noqa: E402
import fresh_qat_protocol as fresh_qat_protocol  # noqa: E402
import qat_protocol as qat_protocol  # noqa: E402

from train import (  # noqa: E402
    INT16_AWARE_CANDIDATE_ARTIFACT,
    INT16_AWARE_EPOCHS,
    identifier_set_sha256,
    int16_aware_dual_task_loss,
    load_replay_dataset,
    load_dataset_with_metadata,
    cp_sigmoid_target,
    configure_sealed_torch_runtime,
    create_new_output_directory,
    contiguous_parent_slices,
    dataset_provenance,
    grouped_batches,
    mate_to_cp,
    mix_replay_value_loss,
    position_id_from_sfen,
    raw_sibling_cp,
    require_finite_model_parameters,
    run_int16_aware_training,
    sealed_experiment_contract,
    sealed_run_tie_break_key,
    require_same_file_fingerprint,
    sibling_selection_key,
    sibling_metrics,
    sibling_policy_loss,
    sibling_ranking_loss,
    teacher_policy_targets,
    main as train_main,
    validate_disjoint_splits,
    validate_int16_aware_training_contract,
    validate_partition_dataset_summary,
    validate_sibling_metadata,
    validate_training_hyperparameters,
    validate_training_path_isolation,
    verify_training_pipeline_revision,
    verify_sealed_experiment_plan,
)


PARENT_SFEN = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
CHILD_A = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2"
CHILD_B = "lnsgkgsnl/1r5b1/ppppppppp/9/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL w - 2"


def sibling_row(
    move,
    rank,
    parent_cp,
    *,
    child_sfen=None,
    sources=None,
    score_kind="cp",
    mate=None,
    mate_sign=None,
    split="train",
):
    child = child_sfen or (CHILD_A if move == "7g7f" else CHILD_B)
    row = {
        "schema": "shogi-sibling-v1",
        "schema_version": 1,
        "game_id": "game",
        "parent_id": "parent",
        "position_id": position_id_from_sfen(PARENT_SFEN),
        "parent_sfen": PARENT_SFEN,
        "parent_ply": 0,
        "ply": 1,
        "move": move,
        "sources": sources if sources is not None else (["played", "teacher"] if rank == 1 else ["teacher"]),
        "sfen": child,
        "child_position_id": position_id_from_sfen(child),
        "cp": -parent_cp,
        "child_sfen": child,
        "teacher_child_cp": -parent_cp,
        "teacher_parent_cp": parent_cp,
        "teacher_rank": rank,
        "teacher_score_kind": score_kind,
        "split": split,
        "raw_cp": -parent_cp,
    }
    if score_kind == "mate":
        row["teacher_mate"] = mate
        row["teacher_mate_sign"] = mate_sign
    return row


def write_rows(path, rows):
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        for row in rows:
            persisted = {key: value for key, value in row.items() if key != "raw_cp"}
            target.write(json.dumps(persisted, sort_keys=True) + "\n")


class SiblingTrainingPipelineTest(unittest.TestCase):
    def test_production_six_run_plan_hash_matches_committed_plan_bytes(self):
        plan_path = os.path.join(
            ML_DIR, "protocols", "wcsc36-six-run-plan.json"
        )
        self.assertEqual(
            train_module.SEALED_SIX_RUN_PLAN_SHA256,
            train_module.sha256_file(plan_path),
        )

    def test_final_tie_break_is_series_then_seed_then_checkpoint_sha(self):
        candidates = [
            ("scratch", 42, "0" * 64),
            ("warm", 43, "0" * 64),
            ("warm", 42, "f" * 64),
            ("warm", 42, "0" * 64),
        ]
        self.assertEqual(
            sorted(candidates, key=lambda value: sealed_run_tie_break_key(*value)),
            [
                ("warm", 42, "0" * 64),
                ("warm", 42, "f" * 64),
                ("warm", 43, "0" * 64),
                ("scratch", 42, "0" * 64),
            ],
        )

    def test_int16_aware_contract_is_warm_final_only_and_never_receives_val_data(self):
        values = {
            "experiment_family": "int16-aware",
            "experiment_series": None,
            "val_data": "",
            "loss": "sibling-ranking",
            "seed": 42,
            "epochs": 20,
            "batch": 256,
            "lr": 1e-4,
            "k": 600.0,
            "cp_clamp": 3000,
            "rank_weight": 1.0,
            "rank_pair_min": 50.0,
            "rank_pair_max": 600.0,
            "rank_margin_cp": 50.0,
            "policy_weight": 0.25,
            "policy_temp_cp": 200.0,
            "features": "board",
            "device": "cpu",
            "torch_threads": 2,
            "replay_limit": 500_000,
            "replay_ratio": 1.0,
            "limit": 0,
            "select_metric": "auto",
            "allow_legacy_init": True,
            "data": "training.jsonl",
            "sibling_manifest": "teacher-manifest.json",
            "validation_partition_manifest": "partition-manifest.json",
            "experiment_plan": "int16-aware-plan.json",
            "holdout_protected_position_ids": "holdout-ids.txt",
            "policy_exposure_receipt": "policy-receipt.json",
            "policy_exposed_parent_ids": "policy-parent-ids.txt",
            "policy_exposed_semantic_position_ids": "policy-position-ids.txt",
            "replay_data": "replay.jsonl",
            "replay_excluded_position_ids": "replay-excluded-ids.txt",
            "init_ckpt": "runOp1.pt",
            "pipeline_revision": "a" * 40,
        }
        validate_int16_aware_training_contract(SimpleNamespace(**values))
        self.assertEqual(INT16_AWARE_EPOCHS, 20)
        self.assertEqual(INT16_AWARE_CANDIDATE_ARTIFACT, "final.pt")

        for field, bad in (
            ("val_data", "selection.jsonl"),
            ("seed", 45),
            ("epochs", 19),
            ("init_ckpt", ""),
            ("experiment_series", "warm"),
            ("select_metric", "sibling-pair"),
            ("replay_excluded_position_ids", ""),
        ):
            with self.subTest(field=field):
                with self.assertRaises(ValueError):
                    validate_int16_aware_training_contract(
                        SimpleNamespace(**{**values, field: bad})
                    )

    def test_int16_aware_loss_shares_primary_and_replay_rows_across_full_tasks(self):
        class RecordingModel(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.weight = torch.nn.Parameter(torch.tensor(0.2))
                self.calls = []

            def forward(self, board, hands, bucket=None):
                self.calls.append(
                    (board.data_ptr(), hands.data_ptr(), bucket.data_ptr())
                )
                return board[:, 0].to(torch.float32) * self.weight

        model = RecordingModel()
        primary_board = torch.tensor([[1], [2]], dtype=torch.long)
        primary_hands = torch.zeros(2, 14)
        primary_bucket = torch.zeros(2, dtype=torch.long)
        primary_targets = torch.tensor([0.6, 0.4])
        primary_cp = torch.tensor([-300.0, -100.0])
        replay_board = torch.tensor([[3], [4]], dtype=torch.long)
        replay_hands = torch.zeros(2, 14)
        replay_bucket = torch.zeros(2, dtype=torch.long)
        replay_targets = torch.tensor([0.7, 0.3])
        ste_calls = []

        def fake_ste(_model, board, hands, bucket):
            ste_calls.append(
                (board.data_ptr(), hands.data_ptr(), bucket.data_ptr())
            )
            raw = board[:, 0].to(torch.float64) * _model.weight.to(torch.float64)
            out_q = torch.round(raw.detach() * 8128.0).to(torch.int64)
            exact = out_q.to(torch.float64) / 8128.0
            logits = raw + (exact - raw).detach()
            return logits, out_q

        combined, float_task, ste_task = int16_aware_dual_task_loss(
            model,
            primary_board,
            primary_hands,
            primary_bucket,
            primary_targets,
            primary_cp,
            (2,),
            k_sigmoid=600.0,
            rank_weight=1.0,
            rank_pair_min=50.0,
            rank_pair_max=600.0,
            rank_margin_cp=50.0,
            policy_weight=0.25,
            policy_temp_cp=200.0,
            replay_batch=(
                replay_board,
                replay_hands,
                replay_bucket,
                replay_targets,
            ),
            ste_forward=fake_ste,
        )
        self.assertTrue(
            torch.allclose(combined, 0.5 * float_task + 0.5 * ste_task)
        )
        float_outputs = primary_board[:, 0].to(torch.float32) * model.weight
        float_replay_outputs = replay_board[:, 0].to(torch.float32) * model.weight
        expected_float_value = mix_replay_value_loss(
            torch.nn.functional.mse_loss(
                torch.sigmoid(float_outputs), primary_targets
            ),
            torch.nn.functional.mse_loss(
                torch.sigmoid(float_replay_outputs), replay_targets
            ),
            sibling_rows=2,
            replay_rows=2,
        )
        expected_float = (
            expected_float_value
            + sibling_ranking_loss(
                float_outputs,
                primary_cp,
                (2,),
                margin_logit=50.0 / 600.0,
                pair_min=50.0,
                pair_max=600.0,
            )
            + 0.25
            * sibling_policy_loss(
                float_outputs,
                primary_cp,
                (2,),
                k_sigmoid=600.0,
                temperature_cp=200.0,
            )
        )
        self.assertTrue(torch.allclose(float_task, expected_float))
        self.assertEqual(model.calls[0], ste_calls[0])
        self.assertEqual(model.calls[1], ste_calls[1])
        combined.backward()
        self.assertIsNotNone(model.weight.grad)
        self.assertTrue(torch.isfinite(model.weight.grad))

    def test_int16_aware_final_boundary_rejects_nonfinite_parameters(self):
        model = torch.nn.Linear(2, 1)
        require_finite_model_parameters(model, "fixture")
        with torch.no_grad():
            model.weight[0, 0] = float("inf")
        with self.assertRaisesRegex(ValueError, "weight.*non-finite"):
            require_finite_model_parameters(model, "fixture")

    def test_int16_aware_scheduler_matches_preregistered_epoch_receipts(self):
        parameter = torch.nn.Parameter(torch.tensor(0.0))
        optimizer = torch.optim.AdamW([parameter], lr=0.0001)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=20
        )
        observed = []
        for _epoch in range(1, 21):
            observed.append(optimizer.param_groups[0]["lr"])
            parameter.grad = torch.zeros_like(parameter)
            optimizer.step()
            scheduler.step()
        expected = [
            0.0001 * (1.0 + math.cos(math.pi * (epoch - 1) / 20.0)) / 2.0
            for epoch in range(1, 21)
        ]
        for epoch, (found, wanted) in enumerate(zip(observed, expected), 1):
            self.assertTrue(
                math.isclose(found, wanted, rel_tol=1e-12, abs_tol=1e-16),
                f"epoch {epoch}: {found!r} != {wanted!r}",
            )

    def test_int16_aware_run_emits_only_atomic_final_candidate_and_result_marker(self):
        with tempfile.TemporaryDirectory() as tmp:
            initializer_path = os.path.join(tmp, "runOp1.pt")
            initializer_model = train_module.DistillNet("board")
            initializer_arch = train_module.expected_arch(
                features="board",
                input_dim=(
                    initializer_model.board_feats + initializer_model.hand_feats
                ),
                h1=train_module.DistillNet.H1,
                h2=train_module.DistillNet.H2,
                k=600.0,
                kp_buckets=1,
            )
            torch.save(
                {
                    "model": initializer_model.state_dict(),
                    "arch": initializer_arch,
                    "epoch": 20,
                },
                initializer_path,
            )
            initializer_sha256 = train_module.sha256_file(initializer_path)

            exclusion_path = os.path.join(tmp, "replay-excluded.txt")
            exclusion_id = "sha256:" + "0" * 64
            exclusion_raw = (exclusion_id + "\n").encode()
            with open(exclusion_path, "wb") as target:
                target.write(exclusion_raw)
            exclusion_contract = {
                "format": "sorted-unique-sha256-position-id-utf8-lf-v1",
                "bytes": len(exclusion_raw),
                "sha256": train_module.hashlib.sha256(exclusion_raw).hexdigest(),
                "count": 1,
                "identifiers_sha256": train_module.identifier_set_sha256(
                    {exclusion_id}
                ),
            }
            replay_sha256 = "1" * 64
            args = SimpleNamespace(
                experiment_family="int16-aware",
                experiment_series=None,
                data=os.path.join(tmp, "model-training.jsonl"),
                val_data="",
                sibling_manifest=os.path.join(tmp, "teacher-manifest.json"),
                validation_partition_manifest=os.path.join(
                    tmp, "partition-manifest.json"
                ),
                experiment_plan=os.path.join(tmp, "int16-aware-plan.json"),
                holdout_protected_position_ids=os.path.join(
                    tmp, "holdout-ids.txt"
                ),
                policy_exposure_receipt=os.path.join(tmp, "policy-receipt.json"),
                policy_exposed_parent_ids=os.path.join(
                    tmp, "policy-parent-ids.txt"
                ),
                policy_exposed_semantic_position_ids=os.path.join(
                    tmp, "policy-position-ids.txt"
                ),
                pipeline_revision="a" * 40,
                replay_data=os.path.join(tmp, "replay.jsonl"),
                replay_excluded_position_ids=exclusion_path,
                replay_limit=2,
                replay_ratio=1.0,
                out=os.path.join(tmp, "qat-run"),
                epochs=1,
                batch=256,
                lr=1e-4,
                k=600.0,
                cp_clamp=3000,
                val_ratio=0.1,
                limit=0,
                device="cpu",
                torch_threads=2,
                seed=42,
                features="board",
                loss="sibling-ranking",
                rank_weight=1.0,
                rank_pair_min=50.0,
                rank_pair_max=600.0,
                rank_margin_cp=50.0,
                policy_weight=0.25,
                policy_temp_cp=200.0,
                select_metric="auto",
                init_ckpt=initializer_path,
                allow_legacy_init=True,
            )
            board = torch.full((2, 40), train_module.PAD_IDX, dtype=torch.long)
            board[0, 0] = 0
            board[1, 0] = 1
            hands = torch.zeros(2, 14)
            targets = torch.tensor([0.6, 0.4])
            cp = torch.tensor([-300.0, -100.0])
            bucket = torch.zeros(2, dtype=torch.long)
            metadata = [
                sibling_row("7g7f", 1, 300),
                sibling_row("2g2f", 2, 100),
            ]
            train_fingerprint = {"bytes": 123, "sha256": "2" * 64}
            replay_fingerprint = {
                "bytes": 456,
                "sha256": replay_sha256,
                "eligible_rows_after_semantic_exclusion": 2,
                "excluded_rows_before_sampling": 0,
            }
            runtime = {
                "device": "cpu",
                "torch_threads": 2,
                "torch_interop_threads": 1,
            }
            pipeline = {
                "source_revision": args.pipeline_revision,
                "tracked_tree_clean": True,
            }
            plan_binding = {
                "provenance": {
                    "schema": qat_protocol.QAT_PLAN_SCHEMA,
                    "slot_id": "seed-42",
                    "verified_input_sha256": {
                        "replay_exclusion": exclusion_contract["sha256"]
                    },
                },
                "contract": {
                    "schema": qat_protocol.QAT_TRAINING_CONTRACT_SCHEMA,
                    "init_checkpoint_sha256": initializer_sha256,
                    "replay_sha256": replay_sha256,
                    "model_training_sha256": train_fingerprint["sha256"],
                    "model_training_bytes": train_fingerprint["bytes"],
                    "model_training_records": 2,
                    "model_training_parents": 1,
                    "replay_limit": 2,
                },
                "replay_exclusion": exclusion_contract,
            }

            with mock.patch.object(
                train_module, "SEALED_REPLAY_ROWS", 2
            ), mock.patch.object(
                train_module, "INT16_AWARE_EPOCHS", 1
            ), mock.patch.object(
                train_module,
                "configure_sealed_torch_runtime",
                return_value=runtime,
            ), mock.patch.object(
                train_module,
                "verify_training_pipeline_revision",
                return_value=pipeline,
            ) as verify_pipeline, mock.patch.object(
                train_module,
                "load_dataset_with_metadata",
                return_value=(
                    board,
                    hands,
                    targets,
                    cp,
                    bucket,
                    metadata,
                    train_fingerprint,
                ),
            ), mock.patch.object(
                train_module,
                "load_replay_dataset",
                return_value=(
                    board.clone(),
                    hands.clone(),
                    targets.clone(),
                    cp.clone(),
                    bucket.clone(),
                    replay_fingerprint,
                ),
            ), mock.patch.object(
                train_module,
                "validate_sibling_metadata",
                return_value=[[0, 1]],
            ), mock.patch.object(
                train_module, "semantic_position_ids", return_value=set()
            ), mock.patch.object(
                train_module,
                "verify_qat_experiment_plan",
                return_value=plan_binding,
            ):
                run_int16_aware_training(args)

            self.assertEqual(
                sorted(os.listdir(args.out)),
                ["final.pt", "result.json"],
            )
            with open(os.path.join(args.out, "result.json"), encoding="utf-8") as source:
                result = json.load(source)
            self.assertEqual(result["status"], "complete")
            self.assertEqual(
                result["schema"],
                qat_protocol.QAT_TRAINING_RESULT_SCHEMA,
            )
            self.assertEqual(result["completed_epochs"], 1)
            self.assertEqual(result["selection_evaluations"], 0)
            self.assertFalse(result["selection_labels_read"])
            self.assertFalse(result["early_stopping"])
            self.assertEqual(result["candidate_artifact"]["name"], "final.pt")
            checkpoint = torch.load(
                os.path.join(args.out, "final.pt"),
                map_location="cpu",
                weights_only=True,
            )
            self.assertEqual(checkpoint["checkpoint_selection"]["mode"], "final-only")
            self.assertEqual(
                checkpoint["schema"],
                qat_protocol.QAT_FINAL_CHECKPOINT_SCHEMA,
            )
            self.assertEqual(
                checkpoint["checkpoint_selection"]["selection_evaluations"], 0
            )
            self.assertEqual(len(checkpoint["training_history"]), 1)
            self.assertEqual(verify_pipeline.call_count, 2)

            args.out = os.path.join(tmp, "fresh-qat-run")
            plan_binding["provenance"][
                "schema"
            ] = fresh_qat_protocol.FRESH_QAT_EXECUTION_PLAN_SCHEMA
            plan_binding["contract"][
                "schema"
            ] = fresh_qat_protocol.FRESH_QAT_TRAINING_CONTRACT_SCHEMA
            with mock.patch.object(
                train_module, "SEALED_REPLAY_ROWS", 2
            ), mock.patch.object(
                train_module, "INT16_AWARE_EPOCHS", 1
            ), mock.patch.object(
                train_module,
                "configure_sealed_torch_runtime",
                return_value=runtime,
            ), mock.patch.object(
                train_module,
                "verify_training_pipeline_revision",
                return_value=pipeline,
            ), mock.patch.object(
                train_module,
                "load_dataset_with_metadata",
                return_value=(
                    board,
                    hands,
                    targets,
                    cp,
                    bucket,
                    metadata,
                    train_fingerprint,
                ),
            ), mock.patch.object(
                train_module,
                "load_replay_dataset",
                return_value=(
                    board.clone(),
                    hands.clone(),
                    targets.clone(),
                    cp.clone(),
                    bucket.clone(),
                    replay_fingerprint,
                ),
            ), mock.patch.object(
                train_module,
                "validate_sibling_metadata",
                return_value=[[0, 1]],
            ), mock.patch.object(
                train_module, "semantic_position_ids", return_value=set()
            ), mock.patch.object(
                train_module,
                "verify_qat_experiment_plan",
                return_value=plan_binding,
            ):
                run_int16_aware_training(args)

            with open(os.path.join(args.out, "result.json"), encoding="utf-8") as source:
                fresh_result = json.load(source)
            self.assertEqual(
                fresh_result["schema"],
                fresh_qat_protocol.FRESH_QAT_TRAINING_RESULT_SCHEMA,
            )
            fresh_checkpoint = torch.load(
                os.path.join(args.out, "final.pt"),
                map_location="cpu",
                weights_only=True,
            )
            self.assertEqual(
                fresh_checkpoint["schema"],
                fresh_qat_protocol.FRESH_QAT_FINAL_CHECKPOINT_SCHEMA,
            )

    def test_six_run_plan_pins_exact_grid_inputs_runtime_and_output_slot(self):
        with tempfile.TemporaryDirectory() as tmp:
            paths = {}
            for index, field in enumerate(
                (
                    "sibling_manifest",
                    "validation_partition_manifest",
                    "data",
                    "val_data",
                    "replay_data",
                    "policy_exposure_receipt",
                    "policy_exposed_parent_ids",
                    "policy_exposed_semantic_position_ids",
                    "holdout_protected_position_ids",
                )
            ):
                path = os.path.join(tmp, f"{field}.bin")
                with open(path, "wb") as target:
                    target.write(f"input-{index}\n".encode())
                paths[field] = path
            warm_init = os.path.join(tmp, "warm.pt")
            with open(warm_init, "wb") as target:
                target.write(b"warm-init\n")
            input_fields = {
                "sibling_teacher_manifest": "sibling_manifest",
                "validation_partition_manifest": "validation_partition_manifest",
                "model_training": "data",
                "model_selection": "val_data",
                "replay": "replay_data",
                "policy_exposure_receipt": "policy_exposure_receipt",
                "policy_exposed_parent_ids": "policy_exposed_parent_ids",
                "policy_exposed_semantic_position_ids": (
                    "policy_exposed_semantic_position_ids"
                ),
                "holdout_protected_position_ids": "holdout_protected_position_ids",
            }
            input_hashes = {
                plan_field: train_module.sha256_file(paths[arg_field])
                for plan_field, arg_field in input_fields.items()
            }
            input_hashes["warm_initializer"] = train_module.sha256_file(warm_init)
            runtime = {
                "platform": "test-platform",
                "system": "test-system",
                "machine": "test-machine",
                "processor": "test-processor",
                "cpu_model": "test-cpu",
                "logical_cpu_count": 12,
                "device": "cpu",
                "python_version": "test-python",
                "torch_version": "test-torch",
                "torch_threads": 2,
                "torch_interop_threads": 1,
                "deterministic_algorithms": True,
                "deterministic_debug_mode": "error",
            }
            slots = []
            for series, seed in train_module.SEALED_SIX_RUN_SLOT_ORDER:
                contract = train_module.SEALED_EXPERIMENT_CONTRACTS[series]
                slots.append(
                    {
                        "id": f"{series}-seed-{seed}",
                        "series": series,
                        "seed": seed,
                        "learning_rate": contract["learning_rate"],
                        "epochs": contract["epochs"],
                        "initializer_required": series == "warm",
                        "output": f"ml/runs/wcsc36-six-run/{series}-seed-{seed}",
                    }
                )
            revision = "a" * 40
            plan = {
                "schema": train_module.SEALED_SIX_RUN_PLAN_SCHEMA,
                "common": {"input_sha256": input_hashes, "runtime": runtime},
                "slots": slots,
                "selection_tie_break": list(
                    train_module.SEALED_SELECTION_TIE_BREAK
                ),
            }
            plan_path = os.path.join(tmp, "plan.json")

            def write_plan():
                with open(plan_path, "w", encoding="utf-8", newline="\n") as target:
                    json.dump(plan, target, indent=2, sort_keys=True)
                    target.write("\n")

            write_plan()
            repo_root = os.path.realpath(os.path.join(ML_DIR, ".."))
            args = SimpleNamespace(
                **paths,
                init_ckpt="",
                experiment_plan=plan_path,
                experiment_series="scratch",
                seed=43,
                pipeline_revision=revision,
                out=os.path.join(
                    repo_root, "ml/runs/wcsc36-six-run/scratch-seed-43"
                ),
            )
            tracking_calls = []
            with mock.patch.object(
                train_module,
                "SEALED_SIX_RUN_PLAN_SHA256",
                train_module.sha256_file(plan_path),
            ), mock.patch.object(
                train_module,
                "SEALED_REPLAY_SHA256",
                input_hashes["replay"],
            ), mock.patch.object(
                train_module,
                "SEALED_WARM_INIT_SHA256",
                input_hashes["warm_initializer"],
            ):
                provenance = verify_sealed_experiment_plan(
                    args,
                    runtime,
                    tracking_verifier=lambda path, rev: tracking_calls.append(
                        (path, rev)
                    ),
                )
            self.assertEqual(provenance["slot_id"], "scratch-seed-43")
            self.assertEqual(tracking_calls, [(plan_path, revision)])

            plan["training_pipeline_revision"] = revision
            write_plan()
            with mock.patch.object(
                train_module,
                "SEALED_SIX_RUN_PLAN_SHA256",
                train_module.sha256_file(plan_path),
            ), self.assertRaisesRegex(ValueError, "experiment plan must contain exactly"):
                verify_sealed_experiment_plan(
                    args,
                    runtime,
                    tracking_verifier=lambda *_args: None,
                )
            plan.pop("training_pipeline_revision")
            plan["common"]["input_sha256"]["model_training"] = None
            write_plan()
            with mock.patch.object(
                train_module,
                "SEALED_SIX_RUN_PLAN_SHA256",
                train_module.sha256_file(plan_path),
            ), self.assertRaisesRegex(ValueError, "null/TBD"):
                verify_sealed_experiment_plan(
                    args,
                    runtime,
                    tracking_verifier=lambda *_args: None,
                )

    def test_new_output_slot_is_claimed_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = os.path.join(tmp, "runs", "slot")
            create_new_output_directory(output)
            self.assertTrue(os.path.isdir(output))
            with self.assertRaisesRegex(ValueError, "already exists"):
                create_new_output_directory(output)

    def test_sealed_experiment_grid_is_exact_and_seed_limited(self):
        values = {
            "experiment_series": "scratch",
            "seed": 42,
            "batch": 256,
            "k": 600.0,
            "cp_clamp": 3000,
            "rank_weight": 1.0,
            "rank_pair_min": 50.0,
            "rank_pair_max": 600.0,
            "rank_margin_cp": 50.0,
            "policy_weight": 0.25,
            "policy_temp_cp": 200.0,
            "features": "board",
            "device": "cpu",
            "torch_threads": 2,
            "replay_limit": 500_000,
            "replay_ratio": 1.0,
            "limit": 0,
            "epochs": 40,
            "lr": 1e-3,
            "allow_legacy_init": False,
            "loss": "sibling-ranking",
            "select_metric": "sibling-pair",
            "replay_data": "runOp1-train.jsonl",
            "init_ckpt": "",
        }
        contract = sealed_experiment_contract(SimpleNamespace(**values))
        self.assertEqual(contract["series"], "scratch")
        self.assertEqual(contract["device"], "cpu")
        self.assertEqual(contract["torch_threads"], 2)
        for field, bad in (
            ("seed", 45),
            ("batch", 255),
            ("device", "auto"),
            ("torch_threads", 1),
            ("select_metric", "auto"),
            ("epochs", 39),
        ):
            with self.subTest(field=field):
                candidate = {**values, field: bad}
                with self.assertRaisesRegex(ValueError, field):
                    sealed_experiment_contract(SimpleNamespace(**candidate))

    def test_sealed_torch_runtime_sets_and_receipts_exact_determinism(self):
        completed = SimpleNamespace(stdout="Apple M4 Max\n")
        with mock.patch.dict(
            os.environ,
            {"PATH": "/usr/bin:/bin"},
        ), mock.patch.object(
            train_module.torch, "set_num_threads"
        ) as set_threads, mock.patch.object(
            train_module.torch, "set_num_interop_threads"
        ) as set_interop, mock.patch.object(
            train_module.torch, "get_num_threads", return_value=2
        ), mock.patch.object(
            train_module.torch, "get_num_interop_threads", return_value=1
        ), mock.patch.object(
            train_module.torch, "use_deterministic_algorithms"
        ) as use_deterministic, mock.patch.object(
            train_module.torch, "set_deterministic_debug_mode"
        ) as set_debug, mock.patch.object(
            train_module.torch,
            "are_deterministic_algorithms_enabled",
            return_value=True,
        ), mock.patch.object(
            train_module.torch, "get_deterministic_debug_mode", return_value=2
        ), mock.patch.object(
            train_module.subprocess, "run", return_value=completed
        ) as read_cpu_model, mock.patch.object(
            train_module.platform, "platform", return_value="macOS-test"
        ), mock.patch.object(
            train_module.platform, "system", return_value="Darwin"
        ), mock.patch.object(
            train_module.platform, "machine", return_value="arm64"
        ), mock.patch.object(
            train_module.platform, "processor", return_value="arm"
        ), mock.patch.object(
            train_module.platform, "python_version", return_value="3.11.10"
        ), mock.patch.object(
            train_module.os, "cpu_count", return_value=16
        ), mock.patch.object(
            train_module.torch, "__version__", "2.3.0"
        ):
            receipt = configure_sealed_torch_runtime(2)

        set_threads.assert_called_once_with(2)
        set_interop.assert_called_once_with(1)
        use_deterministic.assert_called_once_with(True)
        set_debug.assert_called_once_with("error")
        read_cpu_model.assert_called_once_with(
            [
                train_module.DARWIN_SYSCTL_EXECUTABLE,
                "-n",
                "machdep.cpu.brand_string",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        self.assertEqual(
            receipt,
            {
                "platform": "macOS-test",
                "system": "Darwin",
                "machine": "arm64",
                "processor": "arm",
                "cpu_model": "Apple M4 Max",
                "logical_cpu_count": 16,
                "python_version": "3.11.10",
                "torch_version": "2.3.0",
                "device": "cpu",
                "torch_threads": 2,
                "torch_interop_threads": 1,
                "deterministic_algorithms": True,
                "deterministic_debug_mode": "error",
            },
        )

    def test_runtime_cpu_model_is_identical_for_builder_and_launcher_paths(self):
        completed = SimpleNamespace(stdout="Apple M4 Pro\n")
        normal_path = os.environ.get("PATH", "")
        models = []
        with mock.patch.object(
            train_module.subprocess,
            "run",
            return_value=completed,
        ) as run:
            for path in (
                strength_builder._FIXED_RUNTIME_ENVIRONMENT["PATH"],
                normal_path,
            ):
                with mock.patch.dict(os.environ, {"PATH": path}):
                    models.append(
                        train_module._runtime_cpu_model(
                            "Darwin",
                            "arm",
                            "arm64",
                        )
                    )

        self.assertEqual(models, ["Apple M4 Pro", "Apple M4 Pro"])
        self.assertEqual(
            run.call_args_list,
            [
                mock.call(
                    [
                        train_module.DARWIN_SYSCTL_EXECUTABLE,
                        "-n",
                        "machdep.cpu.brand_string",
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                ),
                mock.call(
                    [
                        train_module.DARWIN_SYSCTL_EXECUTABLE,
                        "-n",
                        "machdep.cpu.brand_string",
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                ),
            ],
        )

    def test_runtime_cpu_model_preserves_non_darwin_and_failure_fallbacks(self):
        with mock.patch.object(train_module.subprocess, "run") as run:
            self.assertEqual(
                train_module._runtime_cpu_model(
                    "Linux",
                    "x86_64",
                    "x86_64",
                ),
                "x86_64",
            )
        run.assert_not_called()

        for failed_lookup in (
            FileNotFoundError(),
            train_module.subprocess.CalledProcessError(
                1,
                [train_module.DARWIN_SYSCTL_EXECUTABLE],
            ),
        ):
            with self.subTest(failed_lookup=type(failed_lookup).__name__):
                with mock.patch.object(
                    train_module.subprocess,
                    "run",
                    side_effect=failed_lookup,
                ):
                    self.assertEqual(
                        train_module._runtime_cpu_model(
                            "Darwin",
                            "arm",
                            "arm64",
                        ),
                        "arm",
                    )

        with mock.patch.object(
            train_module.subprocess,
            "run",
            return_value=SimpleNamespace(stdout="\n"),
        ):
            self.assertEqual(
                train_module._runtime_cpu_model(
                    "Darwin",
                    "",
                    "arm64",
                ),
                "arm64",
            )

    def test_training_outputs_cannot_alias_any_input_or_each_other(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "run")
            os.mkdir(out)
            data = os.path.join(tmp, "data.jsonl")
            with open(data, "wb") as target:
                target.write(b"{}\n")
            args = SimpleNamespace(
                data=data,
                val_data="",
                sibling_manifest="",
                validation_partition_manifest="",
                experiment_plan="",
                holdout_protected_position_ids="",
                policy_exposure_receipt="",
                policy_exposed_parent_ids="",
                policy_exposed_semantic_position_ids="",
                replay_data="",
                init_ckpt="",
                out=out,
            )
            validate_training_path_isolation(args)
            os.symlink(data, os.path.join(out, "best.pt"))
            with self.assertRaisesRegex(ValueError, "prospective output best.pt"):
                validate_training_path_isolation(args)
    def test_training_hyperparameters_reject_nonfinite_or_ineffective_values(self):
        valid = {
            "k": 600.0,
            "cp_clamp": 3000,
            "epochs": 1,
            "init_ckpt": "",
            "batch": 256,
            "lr": 1e-3,
            "val_ratio": 0.1,
            "limit": 0,
            "replay_ratio": 1.0,
            "replay_limit": 500_000,
            "rank_weight": 1.0,
            "policy_weight": 0.25,
            "rank_pair_min": 50.0,
            "rank_pair_max": 600.0,
            "rank_margin_cp": 50.0,
            "policy_temp_cp": 200.0,
            "loss": "sibling-ranking",
        }
        mutations = [
            ("nan k", {"k": float("nan")}),
            ("sub-production k", {"k": 0.5}),
            ("oversized k", {"k": 1_000_001.0}),
            ("zero clamp", {"cp_clamp": 0}),
            ("oversized clamp", {"cp_clamp": 1_000_001}),
            ("negative epochs", {"epochs": -1}),
            ("zero scratch epochs", {"epochs": 0}),
            ("zero batch", {"batch": 0}),
            ("nan lr", {"lr": float("nan")}),
            ("zero lr", {"lr": 0.0}),
            ("nan val ratio", {"val_ratio": float("nan")}),
            ("full val ratio", {"val_ratio": 1.0}),
            ("negative limit", {"limit": -1}),
            ("nan replay ratio", {"replay_ratio": float("nan")}),
            ("negative replay ratio", {"replay_ratio": -1.0}),
            ("negative replay limit", {"replay_limit": -1}),
            ("nan rank weight", {"rank_weight": float("nan")}),
            ("negative policy weight", {"policy_weight": -0.1}),
            ("negative pair min", {"rank_pair_min": -1.0}),
            ("infinite pair max", {"rank_pair_max": float("inf")}),
            ("reversed pair range", {"rank_pair_min": 601.0}),
            ("negative margin", {"rank_margin_cp": -1.0}),
            ("nan policy temperature", {"policy_temp_cp": float("nan")}),
            ("zero policy temperature", {"policy_temp_cp": 0.0}),
            ("ranking disabled", {"loss": "ranking", "rank_weight": 0.0}),
            (
                "all sibling objectives disabled",
                {"rank_weight": 0.0, "policy_weight": 0.0},
            ),
            (
                "positive rank weight with empty range",
                {"rank_pair_min": 0.0, "rank_pair_max": 0.0},
            ),
        ]
        for label, mutation in mutations:
            with self.subTest(label=label):
                candidate = {**valid, **mutation}
                with self.assertRaises(ValueError):
                    validate_training_hyperparameters(SimpleNamespace(**candidate))

        # Epoch zero remains an intentional initializer-evaluation mode.
        initializer_only = {**valid, "epochs": 0, "init_ckpt": "initializer.pt"}
        validate_training_hyperparameters(SimpleNamespace(**initializer_only))

        self.assertEqual(cp_sigmoid_target(-1_000_000, 1.0), 0.0)
        self.assertEqual(cp_sigmoid_target(1_000_000, 1.0), 1.0)

    def test_mate_band_rank_contract_is_revalidated_before_training(self):
        valid = [
            sibling_row("7g7f", 1, -35_281),
            sibling_row(
                "2g2f",
                2,
                mate_to_cp(-4, -1),
                score_kind="mate",
                mate=-4,
                mate_sign=-1,
            ),
        ]
        self.assertEqual(len(validate_sibling_metadata(valid, "test")), 1)
        self.assertEqual(mate_to_cp(0, -1), -1_000_000)

        bad_sign = [valid[0], {**valid[1], "teacher_mate": 4}]
        with self.assertRaisesRegex(SystemExit, "mate metadata|mate sign"):
            validate_sibling_metadata(bad_sign, "test")

        bad_order = [
            sibling_row("7g7f", 1, 10),
            sibling_row("2g2f", 2, 20),
        ]
        with self.assertRaisesRegex(SystemExit, "rank/cp contradiction"):
            validate_sibling_metadata(bad_order, "test")

    def test_sibling_metrics_reject_nonfinite_values(self):
        metadata = [{"parent_id": "A"}, {"parent_id": "A"}]
        with self.assertRaisesRegex(ValueError, "finite"):
            sibling_metrics(
                torch.tensor([float("nan"), 0.0]),
                torch.tensor([-100.0, 0.0]),
                metadata,
                pair_min=50.0,
            )

    def test_primary_sibling_loader_fails_closed_on_any_bad_row(self):
        start = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "partially-corrupt.jsonl")
            with open(path, "w", encoding="utf-8", newline="\n") as target:
                target.write(json.dumps({"sfen": start, "cp": 0}) + "\n")
                target.write("{broken-json\n")

            for strict in (False, True):
                with self.subTest(strict=strict):
                    with self.assertRaisesRegex(ValueError, "line 2: invalid strict JSON"):
                        load_dataset_with_metadata(
                            path, 600.0, 3000, strict=strict
                        )

    def test_binary_jsonl_loader_rejects_duplicate_and_nonfinite_numbers(self):
        start = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
        cases = (
            (
                "duplicate",
                ('{"sfen":' + json.dumps(start) + ',"cp":0,"cp":1}\n').encode(),
                "duplicate JSON object key",
            ),
            (
                "nan",
                ('{"sfen":' + json.dumps(start) + ',"cp":NaN}\n').encode(),
                "non-standard JSON numeric constant",
            ),
            (
                "infinity",
                ('{"sfen":' + json.dumps(start) + ',"cp":Infinity}\n').encode(),
                "non-standard JSON numeric constant",
            ),
            (
                "overflow",
                ('{"sfen":' + json.dumps(start) + ',"cp":1e999}\n').encode(),
                "non-finite number",
            ),
        )
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "strict.jsonl")
            for label, contents, expected in cases:
                with self.subTest(label=label):
                    with open(path, "wb") as target:
                        target.write(contents)
                    with self.assertRaisesRegex(ValueError, expected):
                        load_replay_dataset(path, 600.0, 3000, 0, "board", 44)

    def test_strict_loader_accepts_formal_schema_and_forward_compatible_sources(self):
        rows = [
            sibling_row(
                "7g7f",
                1,
                200,
                sources=["played", "teacher", "candidate-z"],
            ),
            sibling_row("2g2f", 2, -100),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "valid.jsonl")
            write_rows(path, rows)
            loaded = load_dataset_with_metadata(path, 600.0, 3000, strict=True)
            self.assertEqual(loaded[2].shape[0], 2)
            self.assertEqual(len(validate_sibling_metadata(loaded[5], "train")), 1)

    def test_strict_loader_rejects_row_contract_mutations(self):
        base = [sibling_row("7g7f", 1, 200), sibling_row("2g2f", 2, -100)]

        def forged_turn(row):
            changed = dict(row)
            changed["parent_sfen"] = PARENT_SFEN.replace(" b - 1", " x - 1")
            changed["position_id"] = position_id_from_sfen(changed["parent_sfen"])
            return changed

        mutations = {
            "schema": lambda row: {**row, "schema": "other"},
            "schema-version-bool": lambda row: {**row, "schema_version": True},
            "schema-version-float": lambda row: {**row, "schema_version": 1.0},
            "self-consistent-invalid-turn": forged_turn,
            "parent-position-id": lambda row: {**row, "position_id": "sha256:wrong"},
            "parent-ply-bool": lambda row: {**row, "parent_ply": False},
            "parent-ply-float": lambda row: {**row, "parent_ply": 0.0},
            "child-ply": lambda row: {**row, "ply": 2},
            "child-alias": lambda row: {**row, "child_sfen": CHILD_B},
            "child-position-id": lambda row: {**row, "child_position_id": "sha256:wrong"},
            "cp-bool": lambda row: {**row, "cp": True},
            "cp-float": lambda row: {**row, "cp": float(row["cp"])},
            "teacher-child-alias": lambda row: {**row, "teacher_child_cp": row["cp"] + 1},
            "teacher-parent-float": lambda row: {
                **row,
                "teacher_parent_cp": float(row["teacher_parent_cp"]),
            },
            "rank-bool": lambda row: {**row, "teacher_rank": True},
            "rank-float": lambda row: {**row, "teacher_rank": 1.0},
            "sources-empty": lambda row: {**row, "sources": []},
            "sources-duplicate": lambda row: {**row, "sources": ["played", "played"]},
            "sources-order": lambda row: {**row, "sources": ["candidate-z", "teacher"]},
            "sources-whitespace": lambda row: {**row, "sources": ["played", " x "]},
            "score-kind": lambda row: {**row, "teacher_score_kind": "unknown"},
            "cp-with-mate-field": lambda row: {**row, "teacher_mate": None},
            "split": lambda row: {**row, "split": "validation"},
        }
        with tempfile.TemporaryDirectory() as tmp:
            for name, mutate in mutations.items():
                with self.subTest(name=name):
                    rows = [mutate(base[0]), base[1]]
                    path = os.path.join(tmp, f"{name}.jsonl")
                    write_rows(path, rows)
                    with self.assertRaisesRegex(ValueError, "strict dataset rejected 1"):
                        load_dataset_with_metadata(path, 600.0, 3000, strict=True)

    def test_strict_loader_rejects_malformed_board_and_hand_grammar(self):
        malformed = {
            "eight-ranks": "9/9/9/9/9/9/9/9 b - 1",
            "short-rank": "8/9/9/9/9/9/9/9/9 b - 1",
            "zero-run": "90/9/9/9/9/9/9/9/9 b - 1",
            "bad-promotion": "+G8/9/9/9/9/9/9/9/9 b - 1",
            "bad-hand-piece": "9/9/9/9/9/9/9/9/9 b K 1",
            "bad-hand-count": "9/9/9/9/9/9/9/9/9 b 1P 1",
            "duplicate-hand-piece": "9/9/9/9/9/9/9/9/9 b P2P 1",
            "unordered-hand": "9/9/9/9/9/9/9/9/9 b PR 1",
        }
        base = [sibling_row("7g7f", 1, 200), sibling_row("2g2f", 2, -100)]
        with tempfile.TemporaryDirectory() as tmp:
            for name, bad_sfen in malformed.items():
                with self.subTest(name=name):
                    row = dict(base[0])
                    row["parent_sfen"] = bad_sfen
                    row["position_id"] = position_id_from_sfen(bad_sfen)
                    path = os.path.join(tmp, f"{name}.jsonl")
                    write_rows(path, [row, base[1]])
                    with self.assertRaisesRegex(ValueError, "strict dataset rejected 1"):
                        load_dataset_with_metadata(path, 600.0, 3000, strict=True)

    def test_strict_loader_rejects_non_integer_or_incomplete_mate_metadata(self):
        mate_cp = mate_to_cp(-4, -1)
        valid_mate = sibling_row(
            "2g2f",
            2,
            mate_cp,
            score_kind="mate",
            mate=-4,
            mate_sign=-1,
        )
        first = sibling_row("7g7f", 1, -35_281)
        mutations = {
            "mate-bool": {**valid_mate, "teacher_mate": True},
            "mate-float": {**valid_mate, "teacher_mate": -4.0},
            "sign-bool": {**valid_mate, "teacher_mate_sign": True},
            "sign-float": {**valid_mate, "teacher_mate_sign": -1.0},
            "missing-mate": {
                key: value for key, value in valid_mate.items() if key != "teacher_mate"
            },
        }
        with tempfile.TemporaryDirectory() as tmp:
            for name, row in mutations.items():
                with self.subTest(name=name):
                    path = os.path.join(tmp, f"{name}.jsonl")
                    write_rows(path, [first, row])
                    with self.assertRaisesRegex(ValueError, "strict dataset rejected 1"):
                        load_dataset_with_metadata(path, 600.0, 3000, strict=True)

    def test_group_contract_rejects_missing_played_and_inconsistent_parent_metadata(self):
        rows = [sibling_row("7g7f", 1, 200), sibling_row("2g2f", 2, -100)]
        no_played = [{**row, "sources": ["teacher"]} for row in rows]
        with self.assertRaisesRegex(SystemExit, "exactly one played"):
            validate_sibling_metadata(no_played, "train")

        inconsistent = [rows[0], {**rows[1], "parent_ply": 1, "ply": 2}]
        inconsistent[1]["parent_sfen"] = PARENT_SFEN.replace(" 1", " 2")
        inconsistent[1]["position_id"] = position_id_from_sfen(inconsistent[1]["parent_sfen"])
        inconsistent[1]["sfen"] = CHILD_B.replace(" 2", " 3")
        inconsistent[1]["child_sfen"] = inconsistent[1]["sfen"]
        inconsistent[1]["child_position_id"] = position_id_from_sfen(inconsistent[1]["sfen"])
        with self.assertRaisesRegex(SystemExit, "inconsistent group metadata"):
            validate_sibling_metadata(inconsistent, "train")

    def test_grouped_batches_emit_complete_contiguous_parent_partitions(self):
        groups = [[0, 2], [1, 3, 5], [4, 6, 7, 8]]
        batches = grouped_batches(
            groups,
            batch_size=3,
            generator=torch.Generator().manual_seed(17),
        )
        observed_groups = []
        for selection, group_sizes in batches:
            self.assertEqual(sum(group_sizes), selection.shape[0])
            if selection.shape[0] > 3:
                self.assertEqual(len(group_sizes), 1)
            for parent_slice in contiguous_parent_slices(
                group_sizes,
                selection.shape[0],
            ):
                observed_groups.append(selection[parent_slice].tolist())
        self.assertCountEqual(observed_groups, groups)

        with self.assertRaisesRegex(ValueError, "batch_size"):
            grouped_batches(groups, 0, torch.Generator())
        with self.assertRaisesRegex(ValueError, "positive integers"):
            list(contiguous_parent_slices((2, 0), 2))
        with self.assertRaisesRegex(ValueError, "partition every batch row"):
            list(contiguous_parent_slices((2, 2), 5))

    def test_ranking_loss_is_parent_local_and_equal_parent_weighted(self):
        # Values are expressed from the parent side here; train.py receives
        # their negatives because every model row is the child position.
        teacher_parent = torch.tensor([300.0, 100.0, -200.0, 400.0, -50.0])
        student_parent = torch.tensor([0.0, 0.2, -0.1, 1.0, 0.0], requires_grad=True)
        group_sizes = (3, 2)

        with mock.patch("train.torch.tensor", side_effect=AssertionError("index allocation")):
            loss = sibling_ranking_loss(
                -student_parent,
                -teacher_parent,
                group_sizes,
                margin_logit=0.1,
                pair_min=0.0,
                pair_max=10_000.0,
            )
        self.assertAlmostEqual(float(loss.detach()), 0.05, places=6)
        loss.backward()
        self.assertTrue(torch.isfinite(student_parent.grad).all())

        shifted = student_parent.detach().clone()
        shifted[3:] += 123.0
        shifted_loss = sibling_ranking_loss(
            -shifted,
            -teacher_parent,
            group_sizes,
            margin_logit=0.1,
            pair_min=0.0,
            pair_max=10_000.0,
        )
        self.assertAlmostEqual(float(shifted_loss), 0.05, places=6)

    def test_metrics_rank_only_within_each_parent(self):
        metadata = [
            {"parent_id": "A"},
            {"parent_id": "A"},
            {"parent_id": "B"},
            {"parent_id": "B"},
        ]
        child_cp = torch.tensor([-300.0, 100.0, -400.0, 50.0])
        perfect_child_prediction = child_cp / 600.0
        pair_acc, top1 = sibling_metrics(
            perfect_child_prediction,
            child_cp,
            metadata,
            pair_min=50.0,
        )
        self.assertEqual(pair_acc, 1.0)
        self.assertEqual(top1, 1.0)

    def test_top1_is_tie_safe_and_independent_of_teacher_rank_order(self):
        metadata = [{"parent_id": "A"}] * 3
        child_cp = torch.tensor([-300.0, -100.0, 50.0])
        all_tied_child_prediction = torch.zeros(3)
        _pair_acc, top1 = sibling_metrics(
            all_tied_child_prediction,
            child_cp,
            metadata,
            pair_min=50.0,
        )
        self.assertEqual(top1, 0.0)

        order = torch.tensor([2, 0, 1])
        _pair_acc, reordered_top1 = sibling_metrics(
            all_tied_child_prediction[order],
            child_cp[order],
            [metadata[int(index)] for index in order],
            pair_min=50.0,
        )
        self.assertEqual(reordered_top1, 0.0)

        # Teacher-side co-best moves are allowed when the predictor ties only
        # those moves, rather than tying them with a known-worse candidate.
        tied_teacher = torch.tensor([-300.0, -300.0, -100.0])
        predicted_child = torch.tensor([-1.0, -1.0, 0.0])
        _pair_acc, teacher_tie_top1 = sibling_metrics(
            predicted_child,
            tied_teacher,
            metadata,
            pair_min=50.0,
        )
        self.assertEqual(teacher_tie_top1, 1.0)

    def test_policy_targets_are_normalized_per_parent(self):
        teacher = torch.tensor([100.0 * math.log(4), 100.0 * math.log(2), 0.0])
        target = teacher_policy_targets(teacher, 100.0)
        expected = torch.tensor([4 / 7, 2 / 7, 1 / 7])
        self.assertTrue(torch.allclose(target, expected, atol=1e-7))

        child_cp = torch.tensor([-teacher[0], -teacher[1], -teacher[2], -400.0, 50.0])
        child_outputs = torch.tensor([0.0, 0.1, -0.2, -1.0, 0.0], requires_grad=True)
        group_sizes = (3, 2)
        with mock.patch("train.torch.tensor", side_effect=AssertionError("index allocation")):
            loss = sibling_policy_loss(
                child_outputs,
                child_cp,
                group_sizes,
                k_sigmoid=600.0,
                temperature_cp=100.0,
            )
        shifted = child_outputs.detach().clone()
        # A constant shift within one parent cannot change its policy.
        shifted[3:] += 50.0
        shifted_loss = sibling_policy_loss(
            shifted,
            child_cp,
            group_sizes,
            k_sigmoid=600.0,
            temperature_cp=100.0,
        )
        self.assertAlmostEqual(float(loss.detach()), float(shifted_loss), places=5)
        loss.backward()
        self.assertTrue(torch.isfinite(child_outputs.grad).all())

    def test_unclamped_teacher_scores_preserve_high_score_order(self):
        metadata = [{"raw_cp": -29_500}, {"raw_cp": -29_000}]
        child_cp = raw_sibling_cp(metadata)
        self.assertTrue(torch.equal(child_cp, torch.tensor([-29_500.0, -29_000.0])))

        # Both value targets clamp to -3000, but the sibling objective still
        # sees that the shorter mate/high-score line is better for the parent.
        student_parent = torch.tensor([0.0, 0.0], requires_grad=True)
        loss = sibling_ranking_loss(
            -student_parent,
            child_cp,
            (2,),
            margin_logit=0.1,
            pair_min=50.0,
            pair_max=600.0,
        )
        self.assertAlmostEqual(float(loss.detach()), 0.1, places=6)
        loss.backward()
        self.assertLess(float(student_parent.grad[0]), 0.0)
        self.assertGreater(float(student_parent.grad[1]), 0.0)

    def test_replay_rows_change_the_value_mixture_weight(self):
        sibling = torch.tensor(2.0)
        replay = torch.tensor(10.0)
        quarter = mix_replay_value_loss(sibling, replay, sibling_rows=4, replay_rows=1)
        equal = mix_replay_value_loss(sibling, replay, sibling_rows=4, replay_rows=4)
        self.assertAlmostEqual(float(quarter), 3.6, places=6)
        self.assertAlmostEqual(float(equal), 6.0, places=6)
        self.assertNotEqual(float(quarter), float(equal))

    def test_sibling_checkpoint_key_uses_documented_tie_breaks(self):
        baseline = sibling_selection_key(0.8, 0.6, 0.02)
        self.assertGreater(sibling_selection_key(0.81, 0.1, 1.0), baseline)
        self.assertGreater(sibling_selection_key(0.8, 0.7, 1.0), baseline)
        self.assertGreater(sibling_selection_key(0.8, 0.6, 0.01), baseline)
        self.assertGreater(
            sibling_selection_key(float("nan"), 0.7, 0.02),
            (-math.inf, -math.inf, -math.inf),
        )

    def test_replay_limit_samples_the_whole_file_deterministically(self):
        start = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "ordered.jsonl")
            with open(path, "w", encoding="utf-8", newline="\n") as target:
                for cp in range(20):
                    target.write(json.dumps({"sfen": start, "cp": cp}) + "\n")

            first = load_replay_dataset(path, 600.0, 3000, 5, "board", 44)
            second = load_replay_dataset(path, 600.0, 3000, 5, "board", 44)
            expected = sorted(random.Random(44).sample(range(20), 5))
            self.assertEqual(first[3].tolist(), [float(value) for value in expected])
            self.assertTrue(torch.equal(first[3], second[3]))
            self.assertNotEqual(first[3].tolist(), [0.0, 1.0, 2.0, 3.0, 4.0])

    def test_replay_samples_after_exclusion_and_rejects_an_underfilled_exact_sample(self):
        base = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b"
        sfens = [f"{base} {index + 1}P 1" for index in range(8)]
        excluded = {position_id_from_sfen(sfen) for sfen in sfens[:3]}
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "replay.jsonl")
            with open(path, "w", encoding="utf-8", newline="\n") as target:
                for cp, sfen in enumerate(sfens):
                    target.write(json.dumps({"sfen": sfen, "cp": cp}) + "\n")
            loaded = load_replay_dataset(
                path,
                600.0,
                3000,
                4,
                "board",
                44,
                excluded,
                include_fingerprint=True,
            )
            eligible_cps = list(range(3, 8))
            expected = sorted(random.Random(44).sample(eligible_cps, 4))
            self.assertEqual(loaded[3].tolist(), [float(value) for value in expected])
            self.assertEqual(
                loaded[5]["eligible_rows_after_semantic_exclusion"], 5
            )
            self.assertEqual(loaded[5]["excluded_rows_before_sampling"], 3)
            with self.assertRaisesRegex(ValueError, "eligible replay rows"):
                load_replay_dataset(
                    path,
                    600.0,
                    3000,
                    6,
                    "board",
                    44,
                    excluded,
                )

    def test_replay_fingerprint_detects_a_generation_change_during_load(self):
        start = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "replay.jsonl")
            with open(path, "w", encoding="utf-8", newline="\n") as target:
                target.write(json.dumps({"sfen": start, "cp": 10}) + "\n")
                target.write(json.dumps({"sfen": start, "cp": 20}) + "\n")
            loaded = load_replay_dataset(
                path,
                600.0,
                3000,
                1,
                "board",
                44,
                include_fingerprint=True,
            )
            before = loaded[5]
            current = dataset_provenance(path, 1, "test")
            require_same_file_fingerprint(before, current, "replay dataset")

            with open(path, "w", encoding="utf-8", newline="\n") as target:
                target.write(json.dumps({"sfen": start, "cp": 30}) + "\n")
                target.write(json.dumps({"sfen": start, "cp": 40}) + "\n")
            self.assertEqual(before["bytes"], os.path.getsize(path))
            changed = dataset_provenance(path, 1, "test")
            with self.assertRaisesRegex(ValueError, "changed while it was being loaded"):
                require_same_file_fingerprint(before, changed, "replay dataset")

    def test_replay_excludes_validation_child_transpositions(self):
        start = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
        distinct = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b P 1"
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "replay.jsonl")
            with open(path, "w", encoding="utf-8", newline="\n") as target:
                target.write(json.dumps({"sfen": start, "cp": 100}) + "\n")
                target.write(json.dumps({"sfen": distinct, "cp": 200}) + "\n")
            replay = load_replay_dataset(
                path,
                600.0,
                3000,
                0,
                "board",
                44,
                {position_id_from_sfen(start)},
            )
            self.assertEqual(replay[3].tolist(), [200.0])

    def test_replay_excludes_selection_semantic_union_and_holdout_protected_ids(self):
        selection_parent = (
            "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/"
            "LNSGKGSNL b - 1"
        )
        selection_child = selection_parent.replace(" b - 1", " b P 1")
        holdout_protected = selection_parent.replace(" b - 1", " b 2P 1")
        allowed = selection_parent.replace(" b - 1", " b 3P 1")
        excluded = {
            position_id_from_sfen(selection_parent),
            position_id_from_sfen(selection_child),
        } | {position_id_from_sfen(holdout_protected)}
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "replay.jsonl")
            with open(path, "w", encoding="utf-8", newline="\n") as target:
                for cp, sfen in enumerate(
                    (
                        selection_parent,
                        selection_child,
                        holdout_protected,
                        allowed,
                    ),
                    start=1,
                ):
                    target.write(json.dumps({"sfen": sfen, "cp": cp * 100}) + "\n")
            replay = load_replay_dataset(
                path,
                600.0,
                3000,
                0,
                "board",
                44,
                excluded,
            )
            self.assertEqual(replay[3].tolist(), [400.0])

    def test_training_pipeline_revision_requires_exact_clean_head(self):
        revision = "0123456789abcdef0123456789abcdef01234567"
        clean_results = [
            SimpleNamespace(stdout=revision + "\n"),
            SimpleNamespace(stdout=""),
        ]
        with mock.patch("train.subprocess.run", side_effect=clean_results) as run:
            provenance = verify_training_pipeline_revision(revision)
        self.assertEqual(
            provenance,
            {"source_revision": revision, "tracked_tree_clean": True},
        )
        self.assertEqual(run.call_count, 2)
        self.assertIn("--untracked-files=normal", run.call_args_list[1].args[0])

        with mock.patch(
            "train.subprocess.run",
            return_value=SimpleNamespace(stdout="f" * 40 + "\n"),
        ):
            with self.assertRaisesRegex(ValueError, "does not match HEAD"):
                verify_training_pipeline_revision(revision)

        dirty_results = [
            SimpleNamespace(stdout=revision + "\n"),
            SimpleNamespace(stdout=" M ml/train.py\n"),
        ]
        with mock.patch("train.subprocess.run", side_effect=dirty_results):
            with self.assertRaisesRegex(ValueError, "clean Git worktree"):
                verify_training_pipeline_revision(revision)

        with self.assertRaisesRegex(ValueError, "lowercase 40-digit"):
            verify_training_pipeline_revision(revision.upper())

    def test_partition_dataset_summary_recomputes_counts_and_game_identity(self):
        metadata = [
            {"parent_id": "parent-a", "game_id": "game-b"},
            {"parent_id": "parent-a", "game_id": "game-b"},
            {"parent_id": "parent-b", "game_id": "game-a"},
        ]
        expected = {
            "records": 3,
            "parents": 2,
            "games": 2,
            "game_ids_sha256": identifier_set_sha256({"game-a", "game-b"}),
        }
        validate_partition_dataset_summary(metadata, expected, "fixture")
        for field in expected:
            with self.subTest(field=field):
                wrong = dict(expected)
                wrong[field] = "0" * 64 if field == "game_ids_sha256" else 99
                with self.assertRaisesRegex(ValueError, field):
                    validate_partition_dataset_summary(metadata, wrong, "fixture")

    def test_sibling_training_has_no_unsealed_full_validation_fallback(self):
        legacy_arguments = [
            "train.py",
            "--loss",
            "sibling-ranking",
            "--data",
            "train.jsonl",
            "--val-data",
            "full-val.jsonl",
            "--sibling-manifest",
            "teacher-manifest.json",
        ]
        with mock.patch.object(sys, "argv", legacy_arguments):
            with self.assertRaisesRegex(
                SystemExit, "requires --validation-partition-manifest"
            ):
                train_main()

        partial_arguments = legacy_arguments + [
            "--validation-partition-manifest",
            "partition.json",
        ]
        with mock.patch.object(sys, "argv", partial_arguments):
            with self.assertRaisesRegex(
                SystemExit, "holdout-protected-position-ids.*pipeline-revision"
            ):
                train_main()

        with mock.patch.object(
            sys,
            "argv",
            [
                "train.py",
                "--validation-partition-manifest",
                "partition.json",
            ],
        ):
            with self.assertRaisesRegex(
                SystemExit, "only supported with --loss sibling-ranking"
            ):
                train_main()

    def test_child_position_identity_matches_schema_and_blocks_transposition_leakage(self):
        start = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 99"
        child_id = position_id_from_sfen(start)
        self.assertEqual(
            child_id,
            "sha256:8b7a6db5e99a9d4cbcbdd8c3d0ea78e0ba5ff73cf561276d5e1d133a86c412a8",
        )
        train = [{
            "game_id": "train-game",
            "parent_id": "train-parent",
            "position_id": "train-position",
            "child_position_id": child_id,
        }]
        val = [{
            "game_id": "val-game",
            "parent_id": "val-parent",
            "position_id": "val-position",
            "child_position_id": child_id,
        }]
        with self.assertRaisesRegex(SystemExit, "child_position_id"):
            validate_disjoint_splits(train, val)

        cross_semantic_train = [{
            "game_id": "train-game",
            "parent_id": "train-parent",
            "position_id": "position-a",
            "child_position_id": "transposition-x",
        }]
        cross_semantic_val = [{
            "game_id": "val-game",
            "parent_id": "val-parent",
            "position_id": "transposition-x",
            "child_position_id": "position-b",
        }]
        with self.assertRaisesRegex(SystemExit, "semantic position union"):
            validate_disjoint_splits(cross_semantic_train, cross_semantic_val)


if __name__ == "__main__":
    unittest.main()
