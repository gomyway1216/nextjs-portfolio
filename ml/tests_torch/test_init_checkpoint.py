import json
import math
import os
import subprocess
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
from train import (  # noqa: E402
    DistillNet,
    atomic_torch_save,
    identifier_set_sha256,
    load_stable_torch_checkpoint,
    position_id_from_sfen,
)


STARTPOS = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
CHILD_7G7F = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2"
CHILD_2G2F = "lnsgkgsnl/1r5b1/ppppppppp/9/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL w - 2"
PIPELINE_REVISION = "0123456789abcdef0123456789abcdef01234567"


def write_siblings(path, game_id, parent_id):
    split = "val" if game_id.endswith("val") else "train"
    child_hand = "P" if split == "val" else "-"
    parent_sfen = STARTPOS.replace(" b - 1", f" b {child_hand} 1")
    children = [
        CHILD_7G7F.replace(" w - 2", f" w {child_hand} 2"),
        CHILD_2G2F.replace(" w - 2", f" w {child_hand} 2"),
    ]
    rows = [
        {
            "schema": "shogi-sibling-v1",
            "schema_version": 1,
            "game_id": game_id,
            "parent_id": parent_id,
            "position_id": position_id_from_sfen(parent_sfen),
            "parent_sfen": parent_sfen,
            "parent_ply": 0,
            "ply": 1,
            "move": "7g7f",
            "sources": ["played", "teacher"],
            "sfen": children[0],
            "child_sfen": children[0],
            "child_position_id": position_id_from_sfen(children[0]),
            "cp": -200,
            "teacher_child_cp": -200,
            "teacher_parent_cp": 200,
            "teacher_rank": 1,
            "teacher_score_kind": "cp",
            "split": split,
        },
        {
            "schema": "shogi-sibling-v1",
            "schema_version": 1,
            "game_id": game_id,
            "parent_id": parent_id,
            "position_id": position_id_from_sfen(parent_sfen),
            "parent_sfen": parent_sfen,
            "parent_ply": 0,
            "ply": 1,
            "move": "2g2f",
            "sources": ["teacher"],
            "sfen": children[1],
            "child_sfen": children[1],
            "child_position_id": position_id_from_sfen(children[1]),
            "cp": 100,
            "teacher_child_cp": 100,
            "teacher_parent_cp": -100,
            "teacher_rank": 2,
            "teacher_score_kind": "cp",
            "split": split,
        },
    ]
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        for row in rows:
            target.write(json.dumps(row, sort_keys=True) + "\n")


def write_replay(path):
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        target.write(json.dumps({"sfen": STARTPOS, "cp": 0}, sort_keys=True) + "\n")
        target.write(json.dumps({"sfen": STARTPOS, "cp": 100}, sort_keys=True) + "\n")


def write_sibling_manifest(path, train_path, val_path):
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


class WarmStartCheckpointTest(unittest.TestCase):
    def test_atomic_checkpoint_save_preserves_previous_file_on_replace_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            checkpoint = os.path.join(tmp, "model.pt")
            with open(checkpoint, "wb") as target:
                target.write(b"previous-checkpoint")

            with mock.patch("train.os.replace", side_effect=OSError("replace failed")):
                with self.assertRaisesRegex(OSError, "replace failed"):
                    atomic_torch_save({"value": torch.tensor([1, 2, 3])}, checkpoint)
            with open(checkpoint, "rb") as source:
                self.assertEqual(source.read(), b"previous-checkpoint")
            self.assertEqual(
                [name for name in os.listdir(tmp) if name.endswith(".tmp")],
                [],
            )

            atomic_torch_save({"value": torch.tensor([4, 5])}, checkpoint)
            saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
            self.assertTrue(torch.equal(saved["value"], torch.tensor([4, 5])))

    def test_checkpoint_fingerprint_is_for_the_loaded_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            checkpoint = os.path.join(tmp, "model.pt")
            replacement = os.path.join(tmp, "replacement.pt")
            torch.save({"generation": 1}, checkpoint)
            torch.save({"generation": 2}, replacement)

            loaded, fingerprint = load_stable_torch_checkpoint(
                checkpoint,
                weights_only=True,
            )
            self.assertEqual(loaded["generation"], 1)
            self.assertEqual(fingerprint["sha256"], sha256_file(checkpoint))
            self.assertEqual(fingerprint["bytes"], os.path.getsize(checkpoint))

            real_load = torch.load

            def replace_after_load(source, **kwargs):
                value = real_load(source, **kwargs)
                os.replace(replacement, checkpoint)
                return value

            with mock.patch("train.torch.load", side_effect=replace_after_load):
                with self.assertRaisesRegex(ValueError, "changed while it was being loaded"):
                    load_stable_torch_checkpoint(checkpoint, weights_only=True)

    def test_sibling_cli_requires_manifest_and_rejects_mixed_or_partial_inputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            train_data = os.path.join(tmp, "train.jsonl")
            val_data = os.path.join(tmp, "val.jsonl")
            alternate_val = os.path.join(tmp, "alternate-val.jsonl")
            manifest = os.path.join(tmp, "manifest.json")
            swapped_manifest = os.path.join(tmp, "swapped-manifest.json")
            write_siblings(train_data, "game-train", "parent-train")
            write_siblings(val_data, "game-val", "parent-val")
            write_siblings(alternate_val, "other-val", "other-parent")
            write_sibling_manifest(manifest, train_data, val_data)
            write_sibling_manifest(swapped_manifest, val_data, train_data)

            common = [
                sys.executable,
                os.path.join(ML_DIR, "train.py"),
                "--loss",
                "sibling-ranking",
                "--epochs",
                "1",
                "--device",
                "cpu",
            ]
            missing = subprocess.run(
                common
                + [
                    "--data",
                    train_data,
                    "--val-data",
                    val_data,
                    "--out",
                    os.path.join(tmp, "missing-manifest"),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(missing.returncode, 0)
            self.assertIn("requires --sibling-manifest", missing.stdout + missing.stderr)

            swapped = subprocess.run(
                common
                + [
                    "--data",
                    val_data,
                    "--val-data",
                    train_data,
                    "--sibling-manifest",
                    swapped_manifest,
                    "--out",
                    os.path.join(tmp, "swapped"),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(swapped.returncode, 0)
            self.assertRegex(swapped.stdout + swapped.stderr, r"split='val'.*expected 'train'")

            partial_publish = subprocess.run(
                common
                + [
                    "--data",
                    train_data,
                    "--val-data",
                    alternate_val,
                    "--sibling-manifest",
                    manifest,
                    "--out",
                    os.path.join(tmp, "partial-publish"),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(partial_publish.returncode, 0)
            self.assertIn("outputs.val_", partial_publish.stdout + partial_publish.stderr)

            limited = subprocess.run(
                common
                + [
                    "--data",
                    train_data,
                    "--val-data",
                    val_data,
                    "--sibling-manifest",
                    manifest,
                    "--limit",
                    "1",
                    "--out",
                    os.path.join(tmp, "limited"),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(limited.returncode, 0)
            self.assertIn("can split a parent group", limited.stdout + limited.stderr)

    def test_epoch_zero_preserves_the_initializer_exactly(self):
        with tempfile.TemporaryDirectory() as tmp:
            train_data = os.path.join(tmp, "train.jsonl")
            val_data = os.path.join(tmp, "val.jsonl")
            manifest = os.path.join(tmp, "manifest.json")
            init_path = os.path.join(tmp, "initializer.pt")
            out_dir = os.path.join(tmp, "warm")
            write_siblings(train_data, "game-train", "parent-train")
            write_siblings(val_data, "game-val", "parent-val")
            write_sibling_manifest(manifest, train_data, val_data)

            model = DistillNet("board")
            with torch.no_grad():
                for index, parameter in enumerate(model.parameters()):
                    parameter.fill_((index + 1) / 1000.0)
            arch = expected_arch(
                features="board",
                input_dim=model.board_feats + model.hand_feats,
                h1=DistillNet.H1,
                h2=DistillNet.H2,
                k=600,
                kp_buckets=1,
            )
            # Production runOp1 has the complete board/features contract but
            # predates only the explicit schema field.
            legacy_arch = dict(arch)
            del legacy_arch["schema"]
            torch.save({"model": model.state_dict(), "epoch": 7, "arch": legacy_arch}, init_path)

            rejected = subprocess.run(
                [
                    sys.executable,
                    os.path.join(ML_DIR, "train.py"),
                    "--data",
                    train_data,
                    "--val-data",
                    val_data,
                    "--sibling-manifest",
                    manifest,
                    "--out",
                    os.path.join(tmp, "rejected"),
                    "--loss",
                    "sibling-ranking",
                    "--init-ckpt",
                    init_path,
                    "--epochs",
                    "0",
                    "--device",
                    "cpu",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("--allow-legacy-init", rejected.stdout + rejected.stderr)

            completed = subprocess.run(
                [
                    sys.executable,
                    os.path.join(ML_DIR, "train.py"),
                    "--data",
                    train_data,
                    "--val-data",
                    val_data,
                    "--sibling-manifest",
                    manifest,
                    "--out",
                    out_dir,
                    "--loss",
                    "sibling-ranking",
                    "--init-ckpt",
                    init_path,
                    "--allow-legacy-init",
                    "--epochs",
                    "0",
                    "--device",
                    "cpu",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)

            warm = torch.load(os.path.join(out_dir, "best.pt"), map_location="cpu", weights_only=False)
            self.assertEqual(warm["epoch"], 0)
            self.assertEqual(warm["init_checkpoint"]["sha256"], sha256_file(init_path))
            self.assertEqual(warm["init_checkpoint"]["epoch"], 7)
            self.assertEqual(
                warm["init_checkpoint"]["legacy_arch_inferred_fields"], ["schema"]
            )
            self.assertEqual(warm["checkpoint_selection"]["resolved"], "sibling-pair")
            manifest_provenance = warm["data_provenance"]["sibling_manifest"]
            self.assertEqual(manifest_provenance["sha256"], sha256_file(manifest))
            self.assertEqual(manifest_provenance["bytes"], os.path.getsize(manifest))
            self.assertEqual(manifest_provenance["label_policy"], LABEL_POLICY)
            self.assertEqual(
                manifest_provenance["teacher_runtime_snapshot"],
                {
                    **RUNTIME_SNAPSHOT_CONTRACT,
                    "engine_argument_file_count": 0,
                    "eval_tree_present": False,
                },
            )
            self.assertEqual(
                manifest_provenance["pipeline"]["source_revision"],
                PIPELINE_REVISION,
            )
            self.assertNotIn("optimizer", warm)
            for name, expected in model.state_dict().items():
                self.assertTrue(torch.equal(warm["model"][name], expected), name)

            with open(os.path.join(out_dir, "curve.csv"), encoding="utf-8") as curve:
                rows = curve.read().strip().splitlines()
            self.assertEqual(len(rows), 2)
            self.assertTrue(rows[1].startswith("0,nan,"))
            self.assertTrue(os.path.isfile(os.path.join(out_dir, "best-value.pt")))
            self.assertTrue(os.path.isfile(os.path.join(out_dir, "best-sibling.pt")))

    def test_one_epoch_sibling_smoke_writes_finite_metrics(self):
        with tempfile.TemporaryDirectory() as tmp:
            train_data = os.path.join(tmp, "train.jsonl")
            val_data = os.path.join(tmp, "val.jsonl")
            replay_data = os.path.join(tmp, "replay.jsonl")
            manifest = os.path.join(tmp, "manifest.json")
            out_dir = os.path.join(tmp, "scratch")
            write_siblings(train_data, "game-train", "parent-train")
            write_siblings(val_data, "game-val", "parent-val")
            write_replay(replay_data)
            write_sibling_manifest(manifest, train_data, val_data)

            completed = subprocess.run(
                [
                    sys.executable,
                    os.path.join(ML_DIR, "train.py"),
                    "--data",
                    train_data,
                    "--val-data",
                    val_data,
                    "--sibling-manifest",
                    manifest,
                    "--out",
                    out_dir,
                    "--loss",
                    "sibling-ranking",
                    "--replay-data",
                    replay_data,
                    "--epochs",
                    "1",
                    "--device",
                    "cpu",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
            checkpoint = torch.load(
                os.path.join(out_dir, "last.pt"), map_location="cpu", weights_only=False
            )
            for field in (
                "val_loss",
                "val_mae_cp",
                "val_pair_acc",
                "val_sibling_pair_acc",
                "val_sibling_top1",
            ):
                self.assertTrue(math.isfinite(float(checkpoint[field])), field)
            replay_provenance = checkpoint["data_provenance"]["replay"]
            self.assertEqual(
                replay_provenance["selection"],
                "uniform_without_replacement_at_most",
            )
            self.assertEqual(
                replay_provenance["sha256"],
                sha256_file(replay_data),
            )
            self.assertEqual(replay_provenance["usable_rows"], 2)
            expected_val_child_ids = {
                position_id_from_sfen(CHILD_7G7F.replace(" w - 2", " w P 2")),
                position_id_from_sfen(CHILD_2G2F.replace(" w - 2", " w P 2")),
            }
            self.assertEqual(
                replay_provenance["validation_child_position_ids_sha256"],
                identifier_set_sha256(expected_val_child_ids),
            )
            self.assertEqual(
                replay_provenance["excluded_validation_child_position_ids"],
                2,
            )
            self.assertTrue(os.path.isfile(os.path.join(out_dir, "best.pt")))
            self.assertTrue(os.path.isfile(os.path.join(out_dir, "best-value.pt")))
            self.assertTrue(os.path.isfile(os.path.join(out_dir, "best-sibling.pt")))


if __name__ == "__main__":
    unittest.main()
