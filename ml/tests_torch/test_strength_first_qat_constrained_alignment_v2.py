from __future__ import annotations

import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

import torch


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_strength_first_qat_constrained_alignment_v2_plan_candidate as BUILDER  # noqa: E402
import strength_first_qat_constrained_alignment_v2_protocol as PROTOCOL  # noqa: E402
import strength_first_quantized_cell_alignment as ALIGN  # noqa: E402
import train as TRAIN  # noqa: E402
import train_strength_first_qat_constrained_alignment_v2 as ALIGN_TRAIN  # noqa: E402
import strength_first_qat_training_bridge as BASE  # noqa: E402


REPO = ML_DIR.parent


def expected_board_architecture() -> dict:
    model = TRAIN.DistillNet("board")
    return TRAIN.expected_arch(
        features="board",
        input_dim=model.board_feats + model.hand_feats,
        h1=model.H1,
        h2=model.H2,
        k=600.0,
        kp_buckets=1,
    )


class AlignmentParentValidationTests(unittest.TestCase):
    def test_parent_result_is_seed_epoch_and_artifact_exact(self):
        checkpoint_identity = {"bytes": 123, "sha256": "a" * 64}
        result = {
            "schema": BASE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA,
            "status": "complete",
            "completed_epochs": 20,
            "selection_labels_read": False,
            "selection_evaluations": 0,
            "early_stopping": False,
            "experiment_contract": {"seed": 42},
            "candidate_artifact": {
                "name": "final.pt",
                **checkpoint_identity,
            },
        }
        ALIGN_TRAIN._validate_parent_result(
            result,
            seed=42,
            checkpoint_identity=checkpoint_identity,
        )
        for path, bad in (
            (("completed_epochs",), 19),
            (("selection_labels_read",), True),
            (("experiment_contract", "seed"), 43),
            (("candidate_artifact", "sha256"), "b" * 64),
        ):
            with self.subTest(path=path):
                mutation = copy.deepcopy(result)
                target = mutation
                for field in path[:-1]:
                    target = target[field]
                target[path[-1]] = bad
                with self.assertRaisesRegex(ValueError, "parent seed 42"):
                    ALIGN_TRAIN._validate_parent_result(
                        mutation,
                        seed=42,
                        checkpoint_identity=checkpoint_identity,
                    )

    def test_parent_checkpoint_is_strict_epoch20_board_seed_match(self):
        architecture = expected_board_architecture()
        checkpoint = {
            "schema": BASE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
            "epoch": 20,
            "args": {"seed": 42, "features": "board"},
            "experiment_contract": {"seed": 42},
            "checkpoint_selection": {
                "mode": "final-only",
                "selection_labels_read": False,
                "selection_evaluations": 0,
                "early_stopping": False,
            },
            "arch": architecture,
        }
        ALIGN_TRAIN._validate_parent_checkpoint(
            checkpoint,
            seed=42,
            expected_architecture=architecture,
        )
        for path, bad in (
            (("epoch",), 19),
            (("args", "seed"), 43),
            (("args", "features"), "kp"),
            (("checkpoint_selection", "selection_labels_read"), True),
        ):
            with self.subTest(path=path):
                mutation = copy.deepcopy(checkpoint)
                target = mutation
                for field in path[:-1]:
                    target = target[field]
                target[path[-1]] = bad
                with self.assertRaisesRegex(ValueError, "parent seed 42"):
                    ALIGN_TRAIN._validate_parent_checkpoint(
                        mutation,
                        seed=42,
                        expected_architecture=architecture,
                    )


class AlignmentPublicationTests(unittest.TestCase):
    def test_strict_reload_passes_before_complete_directory_is_published(self):
        model = TRAIN.DistillNet("board")
        anchor = ALIGN.capture_quantized_anchor(model)
        checkpoint = {"model": model.state_dict(), "epoch": 24}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "seed-42"
            result = ALIGN_TRAIN._stage_verify_and_publish(
                output=output,
                checkpoint_value=checkpoint,
                result_without_candidate={
                    "schema": PROTOCOL.ALIGNMENT_RESULT_SCHEMA,
                    "status": "complete",
                    "live_weights_changed": False,
                },
                anchor=anchor,
            )
            self.assertEqual(
                sorted(path.name for path in output.iterdir()),
                ["final.pt", "result.json"],
            )
            persisted = json.loads((output / "result.json").read_text())
            self.assertEqual(persisted, result)
            self.assertFalse(persisted["live_weights_changed"])
            reloaded = torch.load(
                output / "final.pt",
                map_location="cpu",
                weights_only=True,
            )
            reloaded_model = TRAIN.DistillNet("board")
            reloaded_model.load_state_dict(reloaded["model"], strict=True)
            ALIGN.assert_quantized_anchor(
                reloaded_model,
                anchor,
                "test published strict reload",
            )

    def test_reload_invariant_failure_leaves_no_partial_output(self):
        model = TRAIN.DistillNet("board")
        anchor = ALIGN.capture_quantized_anchor(model)
        bad_state = {
            name: value.detach().clone() for name, value in model.state_dict().items()
        }
        bad_state["l3.bias"].add_(1.0)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "seed-42"
            with self.assertRaisesRegex(ValueError, "reload invariant failed"):
                ALIGN_TRAIN._stage_verify_and_publish(
                    output=output,
                    checkpoint_value={"model": bad_state, "epoch": 24},
                    result_without_candidate={
                        "schema": PROTOCOL.ALIGNMENT_RESULT_SCHEMA,
                        "status": "complete",
                        "live_weights_changed": False,
                    },
                    anchor=anchor,
                )
            self.assertFalse(output.exists())
            self.assertEqual(list(root.iterdir()), [])


class AlignmentTrainerBatchIntegrationTests(unittest.TestCase):
    def test_one_real_trainer_batch_preserves_all_seven_quantized_tensors(self):
        torch.manual_seed(42)
        model = TRAIN.DistillNet("board")
        anchor = ALIGN.capture_quantized_anchor(model)
        optimizer = torch.optim.AdamW(
            model.parameters(),
            lr=1e-5,
            betas=(0.9, 0.999),
            eps=1e-8,
            weight_decay=0.0,
            amsgrad=False,
        )
        board = torch.full(
            (4, 40),
            model.pad_idx,
            dtype=torch.long,
        )
        board[0, 0] = 0
        board[1, 0] = 1
        board[2, :2] = torch.tensor([2, 3])
        board[3, :2] = torch.tensor([4, 5])
        hands = torch.zeros(4, 14)
        bucket = torch.zeros(4, dtype=torch.long)
        exact_logits = ALIGN_TRAIN._precompute_exact_integer_logits(
            anchor,
            model=model,
            board=board,
            hands=hands,
        )
        self.assertTrue(
            torch.equal(
                exact_logits,
                ALIGN_TRAIN._exact_integer_logits(
                    anchor,
                    model=model,
                    board=board,
                    hands=hands,
                ),
            )
        )
        self.assertFalse(exact_logits.requires_grad)
        cache_receipt = ALIGN_TRAIN._integer_target_cache_receipt(
            exact_logits,
            seconds=0.25,
        )
        self.assertEqual(
            cache_receipt,
            {
                "rows": 4,
                "dtype": "float32",
                "bytes": 16,
                "chunk_rows": 8192,
                "seconds": 0.25,
                "source": "seed-parent-anchor",
                "reused_local_epochs": 4,
            },
        )

        with mock.patch.object(
            ALIGN_TRAIN,
            "_exact_integer_logits",
            side_effect=AssertionError("batch recomputed cached targets"),
        ):
            receipt = ALIGN_TRAIN._train_alignment_batch(
                model=model,
                optimizer=optimizer,
                anchor=anchor,
                board=board,
                hands=hands,
                bucket=bucket,
                exact_logits=exact_logits,
                parent_group_sizes=(2, 2),
            )

        self.assertTrue(torch.isfinite(torch.tensor(receipt["loss"])).item())
        projection = receipt["projection"]
        self.assertEqual(
            set(projection["quantized_crossing_coordinates"]),
            set(ALIGN.QUANTIZED_TENSOR_NAMES),
        )
        self.assertEqual(projection["forced_padding_coordinates"], 256)
        self.assertEqual(
            projection["total_restored_coordinates"],
            projection["total_quantized_crossing_coordinates"]
            + projection["forced_padding_coordinates"],
        )
        ALIGN.assert_quantized_anchor(
            model,
            anchor,
            "one real trainer batch",
        )


class AlignmentPreflightTests(unittest.TestCase):
    def test_dirty_tree_stops_before_any_output_slot_is_created(self):
        plan = BUILDER.build_alignment_plan_candidate(repo_root=REPO)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan_path = root / PROTOCOL.ALIGNMENT_PLAN_RELATIVE_PATH
            plan_path.parent.mkdir(parents=True)
            plan_path.write_bytes(PROTOCOL.canonical_json_bytes(plan))
            output = root / plan["slots"][0]["output"]
            with mock.patch.object(
                ALIGN_TRAIN,
                "_verify_recomputed_plan",
            ), mock.patch.object(
                ALIGN_TRAIN,
                "_verify_implementation_sources",
            ), mock.patch.object(
                PROTOCOL,
                "verify_registered_file",
                return_value=b"{}\n",
            ), mock.patch.object(
                ALIGN_TRAIN,
                "_load_exact_parent",
                return_value=(plan["parents"][0], b"parent"),
            ), mock.patch.object(
                TRAIN,
                "configure_sealed_torch_runtime",
                return_value=copy.deepcopy(plan["runtime"]),
            ), mock.patch.object(
                ALIGN_TRAIN,
                "_git_head",
                return_value="a" * 40,
            ), mock.patch.object(
                TRAIN,
                "verify_training_pipeline_revision",
                side_effect=ValueError(
                    "sibling training requires a clean Git worktree"
                ),
            ):
                with self.assertRaisesRegex(ValueError, "clean Git worktree"):
                    ALIGN_TRAIN.run_alignment_seed(
                        42,
                        repo_root=root,
                        home=root / "home",
                    )
            self.assertFalse(output.exists())
            self.assertFalse((root / PROTOCOL.ALIGNMENT_RUN_ROOT).exists())


if __name__ == "__main__":
    unittest.main()
