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

import train as train_module  # noqa: E402

from checkpoint_compat import expected_arch, sha256_file  # noqa: E402
from sibling_manifest import (  # noqa: E402
    LABEL_POLICY,
    RUNTIME_SNAPSHOT_CONTRACT,
)
from train import (  # noqa: E402
    DistillNet,
    atomic_torch_save,
    atomic_write_text,
    identifier_set_sha256,
    load_stable_torch_checkpoint,
    main as train_main,
)
from ml.tests_torch.test_eval_sibling import write_sealed_fixture  # noqa: E402


STARTPOS = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
PIPELINE_REVISION = "0123456789abcdef0123456789abcdef01234567"
TRAINING_REVISION = "f" * 40


def sealed_training_arguments(fixture, out_dir):
    return [
        "--data",
        fixture["train"],
        "--val-data",
        fixture["selection"],
        "--sibling-manifest",
        fixture["teacher"],
        "--validation-partition-manifest",
        fixture["partition"],
        "--experiment-plan",
        fixture["plan"],
        "--holdout-protected-position-ids",
        fixture["protected"],
        "--policy-exposure-receipt",
        fixture["policy_receipt"],
        "--policy-exposed-parent-ids",
        fixture["policy_parent_ids"],
        "--policy-exposed-semantic-position-ids",
        fixture["policy_semantic_ids"],
        "--pipeline-revision",
        TRAINING_REVISION,
        "--replay-data",
        fixture["replay"],
        "--out",
        out_dir,
        "--loss",
        "sibling-ranking",
        "--experiment-series",
        "scratch",
        "--select-metric",
        "sibling-pair",
        "--epochs",
        "40",
        "--device",
        "cpu",
    ]


def run_training_in_process(arguments):
    arguments = [*arguments, "--replay-limit", "2"]
    clean_pipeline = {
        "source_revision": TRAINING_REVISION,
        "tracked_tree_clean": True,
    }
    replay_path = arguments[arguments.index("--replay-data") + 1]
    replay_sha256 = sha256_file(replay_path)
    init_sha256 = None
    if "--init-ckpt" in arguments:
        init_sha256 = sha256_file(arguments[arguments.index("--init-ckpt") + 1])
    contracts = {
        "warm": {
            **train_module.SEALED_EXPERIMENT_CONTRACTS["warm"],
            "init_sha256": init_sha256 or train_module.SEALED_WARM_INIT_SHA256,
        },
        "scratch": dict(train_module.SEALED_EXPERIMENT_CONTRACTS["scratch"]),
    }
    series = arguments[arguments.index("--experiment-series") + 1]
    seed = int(arguments[arguments.index("--seed") + 1]) if "--seed" in arguments else 42
    slot_id = f"{series}-seed-{seed}"
    plan_path = arguments[arguments.index("--experiment-plan") + 1]
    plan_provenance = {
        "path": os.path.abspath(plan_path),
        "bytes": os.path.getsize(plan_path),
        "sha256": sha256_file(plan_path),
        "schema": "shogi-sibling-six-run-plan-v1",
        "slot_id": slot_id,
        "slot_output": f"ml/runs/wcsc36-six-run/{slot_id}",
        "selection_tie_break": [
            "series:warm-before-scratch",
            "seed:ascending",
            "checkpoint_sha256:ascending",
        ],
    }
    with mock.patch.object(sys, "argv", ["train.py", *arguments]), mock.patch(
        "train.verify_training_pipeline_revision",
        return_value=clean_pipeline,
    ), mock.patch("train.SEALED_REPLAY_SHA256", replay_sha256), mock.patch(
        "train.SEALED_EXPERIMENT_CONTRACTS", contracts
    ), mock.patch(
        "train.SEALED_REPLAY_ROWS", 2
    ), mock.patch(
        "train.verify_sealed_experiment_plan",
        return_value=plan_provenance,
    ):
        return train_main()


def write_replay(path):
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        target.write(json.dumps({"sfen": STARTPOS, "cp": 0}, sort_keys=True) + "\n")
        target.write(json.dumps({"sfen": STARTPOS, "cp": 100}, sort_keys=True) + "\n")
class WarmStartCheckpointTest(unittest.TestCase):
    def test_atomic_curve_rewrite_preserves_previous_file_on_replace_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            curve = os.path.join(tmp, "curve.csv")
            with open(curve, "w", encoding="utf-8") as target:
                target.write("old\n")
            with mock.patch("train.os.replace", side_effect=OSError("replace failed")):
                with self.assertRaisesRegex(OSError, "replace failed"):
                    atomic_write_text(curve, "new\n")
            with open(curve, encoding="utf-8") as source:
                self.assertEqual(source.read(), "old\n")
            self.assertFalse(any(name.endswith(".tmp") for name in os.listdir(tmp)))

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
            original_sha256 = fingerprint["sha256"]

            def replace_after_load(source, **kwargs):
                value = real_load(source, **kwargs)
                os.replace(replacement, checkpoint)
                return value

            with mock.patch("train.torch.load", side_effect=replace_after_load) as load:
                loaded_again, fingerprint_again = load_stable_torch_checkpoint(
                    checkpoint, weights_only=True
                )
            self.assertIs(load.call_args.kwargs["weights_only"], True)
            self.assertEqual(loaded_again["generation"], 1)
            self.assertEqual(fingerprint_again["sha256"], original_sha256)
            self.assertNotEqual(fingerprint_again["sha256"], sha256_file(checkpoint))

            with mock.patch("train.torch.load") as rejected_load:
                with self.assertRaisesRegex(ValueError, "sealed expected identity"):
                    load_stable_torch_checkpoint(
                        checkpoint,
                        weights_only=True,
                        expected_sha256="0" * 64,
                    )
            rejected_load.assert_not_called()

    def test_sibling_cli_requires_manifest_production_contract_and_no_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture = write_sealed_fixture(tmp)

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
                    fixture["train"],
                    "--val-data",
                    fixture["selection"],
                    "--out",
                    os.path.join(tmp, "missing-manifest"),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(missing.returncode, 0)
            self.assertIn("requires --sibling-manifest", missing.stdout + missing.stderr)

            base_source_arguments = sealed_training_arguments(
                fixture, os.path.join(tmp, "rejected-base-source")
            )
            base_source_arguments[
                base_source_arguments.index(fixture["train"])
            ] = fixture["source_train"]
            rejected_base_source = subprocess.run(
                [
                    sys.executable,
                    os.path.join(ML_DIR, "train.py"),
                    *base_source_arguments,
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(rejected_base_source.returncode, 0)
            self.assertIn(
                "manifest source.selected_parent_ids_sha256",
                rejected_base_source.stdout + rejected_base_source.stderr,
            )

            limited_arguments = sealed_training_arguments(
                fixture, os.path.join(tmp, "limited")
            ) + ["--limit", "1"]
            limited = subprocess.run(
                [
                    sys.executable,
                    os.path.join(ML_DIR, "train.py"),
                    *limited_arguments,
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(limited.returncode, 0)
            self.assertIn("can split a parent group", limited.stdout + limited.stderr)

    def test_warm_series_loads_fixed_initializer_with_exact_schedule(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture = write_sealed_fixture(tmp)
            init_path = os.path.join(tmp, "initializer.pt")
            out_dir = os.path.join(tmp, "warm")

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

            rejected_arguments = sealed_training_arguments(
                fixture, os.path.join(tmp, "rejected")
            ) + [
                "--experiment-series",
                "warm",
                "--init-ckpt",
                init_path,
                "--lr",
                "0.0001",
                "--epochs",
                "20",
            ]
            with self.assertRaisesRegex(SystemExit, "allow_legacy_init"):
                run_training_in_process(rejected_arguments)

            completed_arguments = sealed_training_arguments(fixture, out_dir) + [
                "--init-ckpt",
                init_path,
                "--allow-legacy-init",
                "--experiment-series",
                "warm",
                "--lr",
                "0.0001",
                "--epochs",
                "20",
            ]
            epoch_zero_states = []
            real_atomic_save = train_module.atomic_torch_save

            def observe_checkpoint(value, path):
                if value.get("epoch") == 0:
                    epoch_zero_states.append(
                        {
                            key: tensor.detach().clone()
                            for key, tensor in value["model"].items()
                        }
                    )
                return real_atomic_save(value, path)

            with mock.patch(
                "train.atomic_torch_save", side_effect=observe_checkpoint
            ):
                run_training_in_process(completed_arguments)

            initializer_state = torch.load(
                init_path, map_location="cpu", weights_only=False
            )["model"]
            self.assertTrue(epoch_zero_states)
            for name, tensor in initializer_state.items():
                self.assertTrue(
                    torch.equal(epoch_zero_states[0][name], tensor),
                    f"epoch-0 initializer tensor changed: {name}",
                )

            warm = torch.load(os.path.join(out_dir, "best.pt"), map_location="cpu", weights_only=False)
            self.assertGreaterEqual(warm["epoch"], 0)
            self.assertEqual(warm["init_checkpoint"]["sha256"], sha256_file(init_path))
            self.assertEqual(warm["init_checkpoint"]["epoch"], 7)
            self.assertEqual(
                warm["init_checkpoint"]["legacy_arch_inferred_fields"], ["schema"]
            )
            self.assertEqual(warm["checkpoint_selection"]["resolved"], "sibling-pair")
            manifest_provenance = warm["data_provenance"]["sibling_manifest"]
            self.assertEqual(
                manifest_provenance["sha256"], sha256_file(fixture["teacher"])
            )
            self.assertEqual(
                manifest_provenance["bytes"], os.path.getsize(fixture["teacher"])
            )
            self.assertEqual(manifest_provenance["label_policy"], LABEL_POLICY)
            self.assertEqual(
                manifest_provenance["teacher_runtime_snapshot"],
                {
                    **RUNTIME_SNAPSHOT_CONTRACT,
                    "engine_argument_file_count": 0,
                    "eval_tree_present": True,
                },
            )
            self.assertEqual(
                manifest_provenance["pipeline"]["source_revision"],
                "8e376e887fac19fb31c07f147e17e84b1d5fc4b2",
            )
            self.assertNotIn("optimizer", warm)
            with open(os.path.join(out_dir, "curve.csv"), encoding="utf-8") as curve:
                rows = curve.read().strip().splitlines()
            self.assertEqual(len(rows), 22)
            self.assertTrue(rows[1].startswith("0,nan,"))
            self.assertTrue(os.path.isfile(os.path.join(out_dir, "best-value.pt")))
            self.assertTrue(os.path.isfile(os.path.join(out_dir, "best-sibling.pt")))
            self.assertTrue(os.path.isfile(os.path.join(out_dir, "result.json")))

    def test_scratch_series_writes_finite_metrics_and_exact_replay_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            fixture = write_sealed_fixture(tmp)
            replay_data = fixture["replay"]
            out_dir = os.path.join(tmp, "scratch")
            arguments = sealed_training_arguments(fixture, out_dir)
            run_training_in_process(arguments)
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
                "uniform_without_replacement_after_semantic_exclusion",
            )
            self.assertEqual(
                replay_provenance["sha256"],
                sha256_file(replay_data),
            )
            self.assertEqual(replay_provenance["usable_rows"], 2)
            expected_val_child_ids = set()
            expected_selection_semantic_ids = set()
            with open(fixture["selection"], encoding="utf-8") as source:
                for line in source:
                    row = json.loads(line)
                    expected_val_child_ids.add(row["child_position_id"])
                    expected_selection_semantic_ids.update(
                        (row["position_id"], row["child_position_id"])
                    )
            self.assertEqual(
                replay_provenance["validation_child_position_ids_sha256"],
                identifier_set_sha256(expected_val_child_ids),
            )
            self.assertEqual(
                replay_provenance["excluded_validation_child_position_ids"],
                len(expected_val_child_ids),
            )
            self.assertEqual(
                replay_provenance[
                    "excluded_model_selection_semantic_position_ids"
                ],
                len(expected_selection_semantic_ids),
            )
            self.assertGreater(
                replay_provenance[
                    "excluded_final_holdout_protected_position_ids"
                ],
                0,
            )
            self.assertTrue(os.path.isfile(os.path.join(out_dir, "best.pt")))
            self.assertTrue(os.path.isfile(os.path.join(out_dir, "best-value.pt")))
            self.assertTrue(os.path.isfile(os.path.join(out_dir, "best-sibling.pt")))
            result_path = os.path.join(out_dir, "result.json")
            with open(result_path, encoding="utf-8") as source:
                result = json.load(source)
            self.assertEqual(result["schema"], "shogi-sibling-training-result-v1")
            self.assertEqual(result["status"], "complete")
            self.assertEqual(
                result["training_pipeline"], checkpoint["training_pipeline"]
            )
            self.assertEqual(result["training_runtime"], checkpoint["training_runtime"])
            self.assertEqual(result["training_runtime"]["torch_threads"], 2)
            self.assertEqual(result["training_runtime"]["torch_interop_threads"], 1)
            self.assertIs(
                result["training_runtime"]["deterministic_algorithms"], True
            )
            self.assertEqual(
                result["training_runtime"]["deterministic_debug_mode"], "error"
            )
            for name, fingerprint in result["artifacts"].items():
                artifact = os.path.join(out_dir, name)
                self.assertEqual(fingerprint["sha256"], sha256_file(artifact))
                self.assertEqual(fingerprint["bytes"], os.path.getsize(artifact))


if __name__ == "__main__":
    unittest.main()
