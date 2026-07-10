import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest import mock


MODULE_PATH = Path(__file__).resolve().parents[1] / "qat_protocol.py"
SPEC = importlib.util.spec_from_file_location("qat_protocol", MODULE_PATH)
QAT = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(QAT)
REPO_ROOT = MODULE_PATH.parents[1]
PLAN_PATH = REPO_ROOT / QAT.QAT_PLAN_RELATIVE_PATH


def load_plan():
    return json.loads(PLAN_PATH.read_bytes())


def valid_args(seed=42):
    return SimpleNamespace(
        experiment_plan=str(PLAN_PATH),
        pipeline_revision="a" * 40,
        val_data="",
        experiment_family="int16-aware",
        seed=seed,
        out=str(REPO_ROOT / f"ml/runs/wcsc36-int16-aware/seed-{seed}"),
        sibling_manifest="teacher.json",
        validation_partition_manifest="partition.json",
        data="training.jsonl",
        replay_data="replay.jsonl",
        init_ckpt="initializer.pt",
        policy_exposure_receipt="policy.json",
        policy_exposed_parent_ids="parents.txt",
        policy_exposed_semantic_position_ids="policy-positions.txt",
        holdout_protected_position_ids="holdout-positions.txt",
        replay_excluded_position_ids="replay-exclusion.txt",
    )


def valid_runtime():
    runtime = dict(load_plan()["runtime"])
    runtime.update(mps_built=True, mps_available=True, cuda_available=False)
    return runtime


class QatProtocolTests(unittest.TestCase):
    def test_plan_bytes_and_hash_are_sealed(self):
        raw = PLAN_PATH.read_bytes()
        self.assertEqual(len(raw), QAT.QAT_PLAN_BYTES)
        self.assertEqual(QAT.hashlib.sha256(raw).hexdigest(), QAT.QAT_PLAN_SHA256)
        QAT._validate_plan_shape(QAT._strict_json(raw, "plan"))

    def test_valid_binding_contains_final_only_contract(self):
        plan = load_plan()

        def fake_snapshot(path, expected, label):
            return {
                "path": str(path),
                "real_path": str(path),
                "bytes": expected["bytes"],
                "sha256": expected["sha256"],
            }

        tracker = mock.Mock()
        with mock.patch.object(QAT, "_sha256_file_snapshot", side_effect=fake_snapshot):
            binding = QAT.verify_qat_experiment_plan(
                valid_args(), valid_runtime(), tracking_verifier=tracker
            )

        tracker.assert_called_once_with(str(PLAN_PATH.resolve()), "a" * 40)
        self.assertEqual(binding["contract"]["seed"], 42)
        self.assertEqual(binding["contract"]["candidate_artifact"], "final.pt")
        self.assertEqual(binding["contract"]["selection_evaluations"], 0)
        self.assertFalse(binding["contract"]["early_stopping"])
        self.assertEqual(
            binding["contract"]["model_training_sha256"],
            plan["inputs"]["model_training"]["sha256"],
        )
        self.assertEqual(binding["replay_exclusion"], plan["inputs"]["replay_exclusion"])

    def test_selection_path_and_wrong_output_are_rejected(self):
        args = valid_args()
        args.val_data = "selection.jsonl"
        with self.assertRaisesRegex(ValueError, "may not receive model-selection"):
            QAT.verify_qat_experiment_plan(
                args, valid_runtime(), tracking_verifier=lambda *_: None
            )

        args = valid_args()
        args.out = str(REPO_ROOT / "ml/runs/wrong")
        with mock.patch.object(
            QAT,
            "_sha256_file_snapshot",
            side_effect=lambda path, expected, label: {
                "sha256": expected["sha256"],
                "bytes": expected["bytes"],
            },
        ):
            with self.assertRaisesRegex(ValueError, "must use output"):
                QAT.verify_qat_experiment_plan(
                    args, valid_runtime(), tracking_verifier=lambda *_: None
                )

    def test_runtime_and_plan_semantics_fail_closed(self):
        runtime = valid_runtime()
        runtime["torch_threads"] = 1
        with mock.patch.object(
            QAT,
            "_sha256_file_snapshot",
            side_effect=lambda path, expected, label: {
                "sha256": expected["sha256"],
                "bytes": expected["bytes"],
            },
        ):
            with self.assertRaisesRegex(ValueError, "torch_threads mismatch"):
                QAT.verify_qat_experiment_plan(
                    valid_args(), runtime, tracking_verifier=lambda *_: None
                )

        plan = load_plan()
        plan["training"]["selection_evaluations_during_training"] = 1
        with self.assertRaisesRegex(ValueError, "final-only training"):
            QAT._validate_plan_shape(plan)

        plan = load_plan()
        plan["post_training_selection"]["family_gate"][
            "minimum_seeds_passing_all_four"
        ] = 1
        with self.assertRaisesRegex(ValueError, "post-training selection"):
            QAT._validate_plan_shape(plan)

    def test_snapshot_verifier_checks_exact_bytes_and_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "artifact.bin"
            path.write_bytes(b"sealed\n")
            expected = {
                "bytes": 7,
                "sha256": QAT.hashlib.sha256(b"sealed\n").hexdigest(),
            }
            observed = QAT._sha256_file_snapshot(str(path), expected, "artifact")
            self.assertEqual(observed["bytes"], 7)
            self.assertEqual(observed["sha256"], expected["sha256"])
            with self.assertRaisesRegex(ValueError, "byte mismatch"):
                QAT._sha256_file_snapshot(
                    str(path), {**expected, "bytes": 8}, "artifact"
                )

    def test_strict_json_rejects_duplicate_and_nonfinite_values(self):
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            QAT._strict_json(b'{"a":1,"a":2}', "fixture")
        with self.assertRaisesRegex(ValueError, "non-finite"):
            QAT._strict_json(b'{"a":NaN}', "fixture")


if __name__ == "__main__":
    unittest.main()
