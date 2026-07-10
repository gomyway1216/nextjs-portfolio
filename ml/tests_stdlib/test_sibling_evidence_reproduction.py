import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from sibling_evidence_reproduction import (  # noqa: E402
    EvidenceReproductionError,
    PINNED_FILE_LABELS,
    TOOL_SOURCE_FILES,
    _decode_json,
    collect_reproduction_pins,
    reproduce_selection_evidence,
)


class EvidenceReproductionTests(unittest.TestCase):
    def test_json_decoder_rejects_nonfinite_constants(self):
        with self.assertRaisesRegex(
            EvidenceReproductionError, "contains non-finite JSON number NaN"
        ):
            _decode_json(b'{"value": NaN}', "fixture")

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        (self.root / "ml").mkdir()
        self.tool_paths = {}
        for label, relative in TOOL_SOURCE_FILES.items():
            path = self.root / relative
            path.write_text(f"# {label}\n", encoding="utf-8")
            self.tool_paths[label] = path

        self.interpreter = self.root / "python"
        self.interpreter.write_bytes(b"pinned-python")
        self.interpreter.chmod(0o700)
        self.files = {}
        for label in (
            "checkpoint",
            "selection_data",
            "sibling_manifest",
            "validation_partition_manifest",
            "policy_exposure_receipt",
            "policy_exposed_parent_ids",
            "policy_exposed_semantic_position_ids",
            "holdout_protected_position_ids",
        ):
            path = self.root / f"{label}.dat"
            path.write_bytes(f"{label}\n".encode())
            self.files[label] = path
        self.expected_weights = self.root / "weights.bin"
        self.expected_weights.write_bytes(b"exact-weight-bytes")
        self.expected_meta = self.root / "weights.meta.json"
        self.expected_meta.write_bytes(b'{"format":"test"}\n')
        self.expected_report = self.root / "selection.json"
        self.report = self._make_report()
        self.expected_report.write_text(
            json.dumps(self.report, sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        self.call_args = {
            "repo_root": str(self.root),
            "python_interpreter": str(self.interpreter),
            "checkpoint_path": str(self.files["checkpoint"]),
            "selection_data_path": str(self.files["selection_data"]),
            "sibling_manifest_path": str(self.files["sibling_manifest"]),
            "validation_partition_manifest_path": str(
                self.files["validation_partition_manifest"]
            ),
            "policy_exposure_receipt_path": str(
                self.files["policy_exposure_receipt"]
            ),
            "policy_exposed_parent_ids_path": str(
                self.files["policy_exposed_parent_ids"]
            ),
            "policy_exposed_semantic_position_ids_path": str(
                self.files["policy_exposed_semantic_position_ids"]
            ),
            "holdout_protected_position_ids_path": str(
                self.files["holdout_protected_position_ids"]
            ),
            "expected_weights_path": str(self.expected_weights),
            "expected_weights_meta_path": str(self.expected_meta),
            "expected_selection_report_path": str(self.expected_report),
        }
        snapshot = collect_reproduction_pins(**self.call_args)
        self.assertEqual(snapshot["labels"], list(PINNED_FILE_LABELS))
        self.pins = snapshot["pinned_sha256"]

    def tearDown(self):
        self.temporary.cleanup()

    @staticmethod
    def _sha(path):
        import hashlib

        return hashlib.sha256(path.read_bytes()).hexdigest()

    def _make_report(self):
        floating = {
            "value_mae_cp": 10.0,
            "value_mse_cp2": 100.0,
            "within_parent_pair_accuracy": 0.6,
            "teacher_top1_accuracy": 0.5,
        }
        integer = {
            "value_mae_cp": 11.0,
            "value_mse_cp2": 121.0,
            "within_parent_pair_accuracy": 0.59,
            "teacher_top1_accuracy": 0.5,
        }
        integer["delta_from_float"] = {
            key: integer[key] - floating[key] for key in floating
        }
        manifest = self.files["sibling_manifest"]
        partition = self.files["validation_partition_manifest"]
        data = self.files["selection_data"]
        checkpoint = self.files["checkpoint"]
        return {
            "schema": "shogi-sibling-eval-v2",
            "data": {
                "path": str(data),
                "sha256": self._sha(data),
                "bytes": data.stat().st_size,
                "sibling_manifest_sha256": self._sha(manifest),
                "sibling_manifest_bytes": manifest.stat().st_size,
                "pipeline_source_revision": "a" * 40,
                "teacher_runtime_snapshot": {"engine": "test"},
                "sibling_manifest": {
                    "sha256": self._sha(manifest),
                    "bytes": manifest.stat().st_size,
                },
                "data_role": "selection",
                "validation_partition_manifest": {
                    "sha256": self._sha(partition),
                    "bytes": partition.stat().st_size,
                },
                "records": 2,
                "parents": 1,
                "eligible_pairs": 1,
                "pair_min_cp": 50.0,
                "value_target": "clamped_child_cp",
                "value_cp_clamp": 3000,
                "ranking_target": "unclamped_parent_cp_equals_negative_child_cp",
            },
            "models": [
                {
                    "name": "candidate",
                    "checkpoint": str(checkpoint),
                    "checkpoint_sha256": self._sha(checkpoint),
                    "checkpoint_bytes": checkpoint.stat().st_size,
                    "checkpoint_epoch": 3,
                    "training_provenance": {
                        "status": "verified_same_model_selection_partition"
                    },
                    "k_sigmoid": 600.0,
                    "production_k_int": 600,
                    "float": floating,
                    "quantized_int16": integer,
                }
            ],
        }

    def _mock_runner(self, *, bad_weights=False, report=None, mutate_source=False):
        computed_report = copy.deepcopy(report if report is not None else self.report)

        def run(command, **kwargs):
            if str(self.tool_paths["export_tool"]) in command:
                out = Path(command[command.index("--out-dir") + 1])
                (out / "weights.bin").write_bytes(
                    b"tampered" if bad_weights else self.expected_weights.read_bytes()
                )
                (out / "weights.meta.json").write_bytes(self.expected_meta.read_bytes())
                stdout = "exported"
            elif str(self.tool_paths["eval_tool"]) in command:
                out = Path(command[command.index("--json-out") + 1])
                out.write_text(json.dumps(computed_report), encoding="utf-8")
                if mutate_source:
                    self.tool_paths["train_source"].write_text(
                        "# changed\n", encoding="utf-8"
                    )
                stdout = "evaluated"
            else:
                runtime = {
                    "python_implementation": "CPython",
                    "python_version": "3.13.0",
                    "python_executable": str(self.interpreter),
                    "platform": "test-platform",
                    "machine": "arm64",
                    "torch_version": "2.test",
                    "torch_threads": 2,
                    "torch_interop_threads": 1,
                }
                stdout = json.dumps(runtime)
            return subprocess.CompletedProcess(command, 0, stdout=stdout, stderr="")

        return run

    def _reproduce(self):
        return reproduce_selection_evidence(
            **self.call_args,
            model_name="candidate",
            pinned_sha256=self.pins,
        )

    def test_fixed_commands_use_sanitized_environment_and_no_shell(self):
        with mock.patch(
            "sibling_evidence_reproduction.subprocess.run",
            side_effect=self._mock_runner(),
        ) as run:
            result = self._reproduce()

        self.assertEqual(result["status"], "reproduced_exactly")
        self.assertEqual(run.call_count, 3)
        calls = run.call_args_list
        for call in calls:
            command = call.args[0]
            kwargs = call.kwargs
            self.assertEqual(command[:3], [str(self.interpreter), "-I", "-B"])
            self.assertIs(kwargs["shell"], False)
            self.assertIs(kwargs["stdin"], subprocess.DEVNULL)
            self.assertNotIn("PYTHONPATH", kwargs["env"])
            self.assertNotIn("VIRTUAL_ENV", kwargs["env"])
            self.assertNotEqual(kwargs["cwd"], str(self.root))
        export_command = calls[1].args[0]
        self.assertIn(str(self.tool_paths["export_tool"]), export_command)
        self.assertNotIn("--json", export_command)
        eval_command = calls[2].args[0]
        self.assertIn(str(self.tool_paths["eval_tool"]), eval_command)
        for option in (
            "--validation-partition-manifest",
            "--policy-exposure-receipt",
            "--policy-exposed-parent-ids",
            "--policy-exposed-semantic-position-ids",
            "--holdout-protected-position-ids",
            "--json-out",
        ):
            self.assertIn(option, eval_command)
        self.assertTrue(result["evidence"]["export"]["weights_byte_exact"])
        self.assertEqual(
            result["interpreter"]["runtime"]["python_version"], "3.13.0"
        )

    def test_pin_mismatch_rejects_before_subprocess(self):
        self.files["checkpoint"].write_bytes(b"changed")
        with mock.patch("sibling_evidence_reproduction.subprocess.run") as run:
            with self.assertRaisesRegex(EvidenceReproductionError, "checkpoint differs"):
                self._reproduce()
        run.assert_not_called()

    def test_export_and_report_tampering_are_rejected(self):
        with mock.patch(
            "sibling_evidence_reproduction.subprocess.run",
            side_effect=self._mock_runner(bad_weights=True),
        ):
            with self.assertRaisesRegex(EvidenceReproductionError, "weights.bin differs"):
                self._reproduce()

        tampered = copy.deepcopy(self.report)
        tampered["models"][0]["float"]["value_mae_cp"] = 10.25
        tampered["models"][0]["quantized_int16"]["delta_from_float"][
            "value_mae_cp"
        ] = 11.0 - 10.25
        with mock.patch(
            "sibling_evidence_reproduction.subprocess.run",
            side_effect=self._mock_runner(report=tampered),
        ):
            with self.assertRaisesRegex(EvidenceReproductionError, "float metrics differ"):
                self._reproduce()

    def test_source_change_during_subprocess_is_rejected(self):
        with mock.patch(
            "sibling_evidence_reproduction.subprocess.run",
            side_effect=self._mock_runner(mutate_source=True),
        ):
            with self.assertRaisesRegex(EvidenceReproductionError, "changed during"):
                self._reproduce()


if __name__ == "__main__":
    unittest.main()
