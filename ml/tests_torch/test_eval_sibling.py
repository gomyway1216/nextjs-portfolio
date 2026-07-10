import copy
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from checkpoint_compat import expected_arch, sha256_file  # noqa: E402
from sibling_manifest import (  # noqa: E402
    CANDIDATE_EXECUTION_ORDER,
    EXACT_RESCORE_MODE,
    LABEL_POLICY,
    RECORD_MANIFEST_SCHEMA,
    RUNTIME_SNAPSHOT_CONTRACT,
    SEARCH_STATE_RESET,
    SYNTHESIZED_RANK_ORDER,
    TEACHER_MANIFEST_SCHEMA,
)
from train import DistillNet, position_id_from_sfen  # noqa: E402


SPEC = importlib.util.spec_from_file_location(
    "eval_sibling", os.path.join(ML_DIR, "eval-sibling.py")
)
assert SPEC is not None and SPEC.loader is not None
EVAL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EVAL)


EMPTY_PARENT = "9/9/9/9/9/9/9/9/9 w 3P 1"
EMPTY_WITH_TWO_PAWNS = "9/9/9/9/9/9/9/9/9 b 2P 2"
EMPTY_WITH_ONE_PAWN = "9/9/9/9/9/9/9/9/9 b P 2"
PIPELINE_REVISION = "0123456789abcdef0123456789abcdef01234567"


def write_siblings(
    path,
    *,
    sign_mismatch=False,
    game_id="game-val",
    parent_id="parent-val",
    split="val",
):
    rows = [
        {
            "schema": "shogi-sibling-v1",
            "schema_version": 1,
            "game_id": game_id,
            "parent_id": parent_id,
            "position_id": position_id_from_sfen(EMPTY_PARENT),
            "parent_sfen": EMPTY_PARENT,
            "parent_ply": 0,
            "ply": 1,
            "move": "7g7f",
            "sources": ["played", "teacher"],
            "sfen": EMPTY_WITH_TWO_PAWNS,
            "child_sfen": EMPTY_WITH_TWO_PAWNS,
            "child_position_id": position_id_from_sfen(EMPTY_WITH_TWO_PAWNS),
            "cp": 100,
            "teacher_child_cp": 100,
            "teacher_parent_cp": 100 if sign_mismatch else -100,
            "teacher_rank": 2,
            "teacher_score_kind": "cp",
            "split": split,
        },
        {
            "schema": "shogi-sibling-v1",
            "schema_version": 1,
            "game_id": game_id,
            "parent_id": parent_id,
            "position_id": position_id_from_sfen(EMPTY_PARENT),
            "parent_sfen": EMPTY_PARENT,
            "parent_ply": 0,
            "ply": 1,
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
            "split": split,
        },
    ]
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        for row in rows:
            target.write(json.dumps(row, sort_keys=True) + "\n")


def write_sibling_manifest(path, val_path, train_path=None):
    train_path = val_path if train_path is None else train_path
    manifest = {
        "schema": TEACHER_MANIFEST_SCHEMA,
        "record_manifest_schema": RECORD_MANIFEST_SCHEMA,
        "search": {
            "label_policy": LABEL_POLICY,
            "exact_rescore_mode": EXACT_RESCORE_MODE,
            "search_state_reset_before_proposal": SEARCH_STATE_RESET,
            "search_state_reset_before_each_candidate": SEARCH_STATE_RESET,
            "tt_reset_before_proposal": True,
            "tt_reset_before_each_candidate": True,
            "candidate_execution_order": CANDIDATE_EXECUTION_ORDER,
            "synthesized_rank_order": SYNTHESIZED_RANK_ORDER,
        },
        "pipeline": {
            "source_revision": PIPELINE_REVISION,
            "tracked_tree_clean": True,
        },
        "teacher": {
            "engine_bin_sha256": "a" * 64,
            "engine_bin_bytes": 1,
            "engine_args": [],
            "engine_arg_files": [],
            "eval_sha256": None,
            "eval_files": [],
            "runtime_snapshot": {
                **RUNTIME_SNAPSHOT_CONTRACT,
                "engine_argument_file_count": 0,
                "eval_tree_present": False,
            },
        },
        "outputs": {
            "train_sha256": sha256_file(train_path),
            "val_sha256": sha256_file(val_path),
            "train_bytes": os.path.getsize(train_path),
            "val_bytes": os.path.getsize(val_path),
        },
    }
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        json.dump(manifest, target, indent=2, sort_keys=True)
        target.write("\n")


def attach_sibling_training_provenance(
    checkpoint_path,
    manifest_path,
    train_path,
    val_path,
):
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    manifest_provenance = EVAL.verify_sibling_manifest(
        manifest_path,
        train_path=train_path,
        val_path=val_path,
    )

    def source_provenance(path):
        with open(path, encoding="utf-8") as source:
            usable_rows = sum(1 for line in source if line.strip())
        return {
            "path": os.path.abspath(path),
            "sha256": sha256_file(path),
            "bytes": os.path.getsize(path),
            "usable_rows": usable_rows,
            "selection": "all",
            "requested_limit": 0,
        }

    checkpoint["args"] = {"loss": "sibling-ranking"}
    checkpoint["data_provenance"] = {
        "sibling_manifest": manifest_provenance,
        "train": source_provenance(train_path),
        "validation": source_provenance(val_path),
        "replay": None,
    }
    torch.save(checkpoint, checkpoint_path)


def write_hand_model(path, slope, bias=0.0, *, make_nonfinite=False):
    model = DistillNet("board")
    with torch.no_grad():
        for parameter in model.parameters():
            parameter.zero_()
        # Child CP increases with the child's pawn-in-hand count.  Because move
        # selection is from the parent, the candidate with the *lower* child
        # output must win.  A sub-quantum slope lets the int16 path tie while
        # the float path still resolves that order.
        model.hand.weight[0, 0] = slope
        model.hand.bias[0] = bias
        model.l2.weight[0, 0] = 1.0
        model.l3.weight[0, 0] = 1.0
        if make_nonfinite:
            model.l3.bias[0] = float("nan")
    arch = expected_arch(
        features="board",
        input_dim=model.board_feats + model.hand_feats,
        h1=DistillNet.H1,
        h2=DistillNet.H2,
        k=600.0,
        kp_buckets=1,
    )
    torch.save({"model": model.state_dict(), "epoch": 3, "arch": arch}, path)


def read_bytes(path):
    with open(path, "rb") as source:
        return source.read()


def read_text(path):
    with open(path, encoding="utf-8") as source:
        return source.read()


class SiblingHoldoutEvaluationTest(unittest.TestCase):
    def test_validation_loader_requires_val_split(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = os.path.join(tmp, "train-labelled.jsonl")
            write_siblings(data)
            with open(data, encoding="utf-8") as source:
                rows = [json.loads(line) for line in source]
            with open(data, "w", encoding="utf-8", newline="\n") as target:
                for row in rows:
                    row["split"] = "train"
                    target.write(json.dumps(row, sort_keys=True) + "\n")
            with self.assertRaisesRegex(ValueError, r"split='train'.*expected 'val'"):
                EVAL.load_validation_data(data, 3000)

    def test_reports_verified_and_legacy_unverified_training_provenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            train_data = os.path.join(tmp, "train.jsonl")
            val_data = os.path.join(tmp, "val.jsonl")
            manifest = os.path.join(tmp, "manifest.json")
            verified = os.path.join(tmp, "verified.pt")
            legacy = os.path.join(tmp, "legacy.pt")
            write_siblings(
                train_data,
                game_id="game-train",
                parent_id="parent-train",
                split="train",
            )
            write_siblings(val_data)
            write_sibling_manifest(manifest, val_data, train_data)
            write_hand_model(verified, slope=0.003)
            write_hand_model(legacy, slope=-0.003, bias=0.1)
            attach_sibling_training_provenance(
                verified,
                manifest,
                train_data,
                val_data,
            )

            report = EVAL.evaluate_checkpoints(
                val_data,
                [("verified", verified), ("legacy", legacy)],
                sibling_manifest_path=manifest,
                include_quantized=False,
            )
            self.assertEqual(
                report["models"][0]["training_provenance"]["status"],
                "verified_same_sibling_manifest",
            )
            self.assertEqual(
                report["models"][1]["training_provenance"]["status"],
                "legacy_unverified",
            )
            self.assertIn(
                "no sibling-manifest-bound training provenance",
                report["models"][1]["training_provenance"]["reason"],
            )
            table = EVAL.format_table(report)
            self.assertIn("verified_same_sibling_manifest", table)
            self.assertIn("legacy_unverified", table)

    def test_rejects_present_but_mismatched_checkpoint_training_provenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            train_data = os.path.join(tmp, "train.jsonl")
            val_data = os.path.join(tmp, "val.jsonl")
            manifest = os.path.join(tmp, "manifest.json")
            base_checkpoint = os.path.join(tmp, "base.pt")
            write_siblings(
                train_data,
                game_id="game-train",
                parent_id="parent-train",
                split="train",
            )
            write_siblings(val_data)
            write_sibling_manifest(manifest, val_data, train_data)
            write_hand_model(base_checkpoint, slope=0.003)
            attach_sibling_training_provenance(
                base_checkpoint,
                manifest,
                train_data,
                val_data,
            )
            base = torch.load(base_checkpoint, map_location="cpu", weights_only=False)
            cases = [
                (
                    "different manifest",
                    lambda value: value["data_provenance"]["sibling_manifest"].__setitem__(
                        "sha256", "0" * 64
                    ),
                    "manifest sha256",
                ),
                (
                    "validation used as train",
                    lambda value: value["data_provenance"]["train"].update(
                        {
                            "sha256": sha256_file(val_data),
                            "bytes": os.path.getsize(val_data),
                        }
                    ),
                    "checkpoint train",
                ),
                (
                    "partial validation",
                    lambda value: value["data_provenance"]["validation"].__setitem__(
                        "selection", "prefix"
                    ),
                    "complete manifest split",
                ),
                (
                    "manifest verified only val",
                    lambda value: value["data_provenance"]["sibling_manifest"].__setitem__(
                        "verified_splits", ["val"]
                    ),
                    "both splits",
                ),
                (
                    "different pipeline",
                    lambda value: value["data_provenance"]["sibling_manifest"][
                        "pipeline"
                    ].__setitem__("source_revision", "f" * 40),
                    "pipeline provenance",
                ),
                (
                    "different runtime snapshot",
                    lambda value: value["data_provenance"]["sibling_manifest"][
                        "teacher_runtime_snapshot"
                    ].__setitem__("engine_argument_file_count", 99),
                    "teacher_runtime_snapshot",
                ),
                (
                    "declared sibling without provenance",
                    lambda value: value.__setitem__("data_provenance", None),
                    "missing data_provenance",
                ),
                (
                    "present provenance without manifest",
                    lambda value: value.__setitem__("data_provenance", {"train": {}}),
                    "not bound to a sibling manifest",
                ),
            ]
            for index, (label, mutate, expected) in enumerate(cases):
                with self.subTest(label=label):
                    candidate = copy.deepcopy(base)
                    mutate(candidate)
                    checkpoint = os.path.join(tmp, f"bad-{index}.pt")
                    torch.save(candidate, checkpoint)
                    with self.assertRaisesRegex(ValueError, expected):
                        EVAL.evaluate_checkpoints(
                            val_data,
                            [("model", checkpoint)],
                            sibling_manifest_path=manifest,
                            include_quantized=False,
                        )

    def test_cli_requires_manifest_and_rejects_valid_unpublished_validation(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = os.path.join(tmp, "val.jsonl")
            checkpoint = os.path.join(tmp, "model.pt")
            manifest = os.path.join(tmp, "manifest.json")
            write_siblings(data)
            write_hand_model(checkpoint, slope=0.003)

            with self.assertRaises(SystemExit) as missing:
                EVAL.main(
                    [
                        "--data",
                        data,
                        "--checkpoint",
                        f"model={checkpoint}",
                        "--no-quantized",
                    ]
                )
            self.assertEqual(missing.exception.code, 2)

            write_sibling_manifest(manifest, data)
            # Both rows remain formally valid v1 sibling rows; only their
            # publication identity no longer matches the manifest commit marker.
            write_siblings(data, game_id="next-val", parent_id="next-parent")
            with self.assertRaisesRegex(ValueError, r"outputs\.val_(bytes|sha256)"):
                EVAL.evaluate_checkpoints(
                    data,
                    [("model", checkpoint)],
                    sibling_manifest_path=manifest,
                )

    def test_json_output_cannot_overwrite_data_or_checkpoint_realpath(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = os.path.join(tmp, "val.jsonl")
            checkpoint = os.path.join(tmp, "model.pt")
            manifest = os.path.join(tmp, "manifest.json")
            write_siblings(data)
            write_hand_model(checkpoint, slope=0.003)
            write_sibling_manifest(manifest, data)
            data_before = read_bytes(data)
            checkpoint_before = read_bytes(checkpoint)
            manifest_before = read_bytes(manifest)

            for output in (data, checkpoint, manifest):
                with self.subTest(output=output):
                    with self.assertRaises(SystemExit) as caught:
                        EVAL.main(
                            [
                                "--data",
                                data,
                                "--sibling-manifest",
                                manifest,
                                "--checkpoint",
                                f"model={checkpoint}",
                                "--no-quantized",
                                "--json-out",
                                output,
                            ]
                        )
                    self.assertEqual(caught.exception.code, 2)
            self.assertEqual(read_bytes(data), data_before)
            self.assertEqual(read_bytes(checkpoint), checkpoint_before)
            self.assertEqual(read_bytes(manifest), manifest_before)

            alias = os.path.join(tmp, "checkpoint-alias.json")
            os.symlink(checkpoint, alias)
            with self.assertRaisesRegex(ValueError, "must not overwrite checkpoint"):
                EVAL.validate_json_output_path(alias, data, [("model", checkpoint)])

    def test_atomic_json_write_preserves_old_target_on_replace_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = os.path.join(tmp, "report.json")
            with open(output, "w", encoding="utf-8") as target:
                target.write("old\n")

            with mock.patch.object(EVAL.os, "replace", side_effect=OSError("replace failed")):
                with self.assertRaisesRegex(OSError, "replace failed"):
                    EVAL.atomic_write_json(output, '{"new": true}')
            self.assertEqual(read_text(output), "old\n")
            self.assertEqual(
                [name for name in os.listdir(tmp) if name.endswith(".tmp")], []
            )

            real_replace = os.replace
            real_fsync = os.fsync
            with mock.patch.object(EVAL.os, "replace", wraps=real_replace) as replaced:
                with mock.patch.object(EVAL.os, "fsync", wraps=real_fsync) as fsynced:
                    EVAL.atomic_write_json(output, '{"new": true}')
            self.assertEqual(read_text(output), '{"new": true}\n')
            self.assertEqual(replaced.call_count, 1)
            self.assertGreaterEqual(fsynced.call_count, 1)
            temporary, installed = replaced.call_args.args
            self.assertEqual(os.path.dirname(temporary), tmp)
            self.assertEqual(installed, output)
            self.assertEqual(
                [name for name in os.listdir(tmp) if name.endswith(".tmp")], []
            )

    def test_production_cp_conversion_truncates_distinct_out_q_values_to_a_tie(self):
        self.assertEqual(EVAL.production_cp_from_out_q(1, 600.0), 0)
        self.assertEqual(EVAL.production_cp_from_out_q(2, 600.0), 0)
        self.assertEqual(EVAL.production_cp_from_out_q(-1, 600.0), 0)
        self.assertEqual(EVAL.production_cp_from_out_q(14, 600.0), 1)
        self.assertEqual(EVAL.production_cp_from_out_q(-14, 600.0), -1)

    def test_parent_sign_and_float_to_quantized_order_change(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = os.path.join(tmp, "val.jsonl")
            good = os.path.join(tmp, "good.pt")
            bad = os.path.join(tmp, "bad.pt")
            manifest = os.path.join(tmp, "manifest.json")
            write_siblings(data)
            write_hand_model(good, slope=0.003)
            write_hand_model(bad, slope=-0.003, bias=0.1)
            write_sibling_manifest(manifest, data)

            report = EVAL.evaluate_checkpoints(
                data,
                [("good", good), ("bad", bad)],
                sibling_manifest_path=manifest,
                pair_min_cp=50.0,
                include_quantized=True,
            )

            self.assertEqual(report["schema"], "shogi-sibling-eval-v1")
            self.assertEqual(report["data"]["records"], 2)
            self.assertEqual(report["data"]["parents"], 1)
            self.assertEqual(report["data"]["eligible_pairs"], 1)
            self.assertEqual(report["data"]["sibling_manifest_sha256"], sha256_file(manifest))
            self.assertEqual(report["data"]["sibling_manifest_bytes"], os.path.getsize(manifest))
            self.assertEqual(report["data"]["pipeline_source_revision"], PIPELINE_REVISION)
            self.assertEqual(report["data"]["sibling_manifest"]["label_policy"], LABEL_POLICY)
            self.assertEqual(
                report["data"]["teacher_runtime_snapshot"],
                {
                    **RUNTIME_SNAPSHOT_CONTRACT,
                    "engine_argument_file_count": 0,
                    "eval_tree_present": False,
                },
            )
            self.assertEqual([model["name"] for model in report["models"]], ["good", "bad"])

            good_result = report["models"][0]
            # The child with one pawn has the lower float child CP. Negating
            # once makes it the correct parent-side best move.
            self.assertEqual(good_result["float"]["within_parent_pair_accuracy"], 1.0)
            self.assertEqual(good_result["float"]["teacher_top1_accuracy"], 1.0)
            # 0.003 * 127 rounds to zero, so int16 ties both candidates. The
            # first row is deliberately not teacher-best, making the change
            # visible in both ranking adoption gates.
            quantized = good_result["quantized_int16"]
            self.assertEqual(quantized["within_parent_pair_accuracy"], 0.0)
            self.assertEqual(quantized["teacher_top1_accuracy"], 0.0)
            self.assertEqual(
                quantized["delta_from_float"]["within_parent_pair_accuracy"], -1.0
            )
            self.assertEqual(quantized["delta_from_float"]["teacher_top1_accuracy"], -1.0)

            # Reversing the float relation is wrong under the same child->parent sign rule.
            self.assertEqual(
                report["models"][1]["float"]["within_parent_pair_accuracy"], 0.0
            )
            self.assertEqual(report["models"][1]["float"]["teacher_top1_accuracy"], 0.0)

            # The complete report is strict machine-readable JSON (no NaN).
            encoded = json.dumps(report, allow_nan=False, sort_keys=True)
            self.assertEqual(json.loads(encoded)["data"]["value_target"], "clamped_child_cp")

    def test_rejects_teacher_child_sign_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = os.path.join(tmp, "bad-sign.jsonl")
            checkpoint = os.path.join(tmp, "model.pt")
            manifest = os.path.join(tmp, "manifest.json")
            write_siblings(data, sign_mismatch=True)
            write_hand_model(checkpoint, slope=0.003)
            write_sibling_manifest(manifest, data)

            with self.assertRaisesRegex(ValueError, "sign mismatch"):
                EVAL.evaluate_checkpoints(
                    data,
                    [("model", checkpoint)],
                    sibling_manifest_path=manifest,
                )

    def test_rejects_nonfinite_checkpoint_parameters(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = os.path.join(tmp, "val.jsonl")
            checkpoint = os.path.join(tmp, "nan.pt")
            manifest = os.path.join(tmp, "manifest.json")
            write_siblings(data)
            write_hand_model(checkpoint, slope=0.003, make_nonfinite=True)
            write_sibling_manifest(manifest, data)

            with self.assertRaisesRegex(ValueError, "non-finite"):
                EVAL.evaluate_checkpoints(
                    data,
                    [("model", checkpoint)],
                    sibling_manifest_path=manifest,
                )


if __name__ == "__main__":
    unittest.main()
