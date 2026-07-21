from __future__ import annotations

import copy
from contextlib import redirect_stderr, redirect_stdout
import hashlib
import io
import math
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_strength_first_representation_bridge_v3_registry_candidate as BUILDER  # noqa: E402
import run_strength_first_representation_bridge_v3 as RUNNER  # noqa: E402
import strength_first_representation_bridge_v3_protocol as PROTOCOL  # noqa: E402


def metrics(pair: float, top1: float, mae: float = 400.0) -> dict[str, float]:
    return {
        "value_mae_cp": mae,
        "value_mse_cp2": mae * mae,
        "within_parent_pair_accuracy": pair,
        "teacher_top1_accuracy": top1,
    }


def origin_for(candidate: dict) -> dict:
    raw = PROTOCOL.canonical_json_bytes(candidate)
    return {
        "path": PROTOCOL.REGISTRY_RELATIVE_PATH,
        "schema": PROTOCOL.REGISTRY_SCHEMA,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def result_bindings(candidate: dict) -> list[dict]:
    return [
        {
            "seed": spec["seed"],
            "parent_result": copy.deepcopy(spec["parent_result"]),
            "aligned_result": copy.deepcopy(spec["aligned_result"]),
        }
        for spec in candidate["models"]["seeds"]
    ]


def report_for(candidate: dict) -> dict:
    stable_identity = candidate["models"]["stable"]["checkpoint"]
    stable_metrics = metrics(0.59, 0.30, 525.0)
    models = [
        {
            "name": "stable",
            "role": "stable",
            "seed": None,
            "checkpoint": {**stable_identity, "epoch": 27},
            "float": metrics(0.592, 0.301, 524.0),
            "int16": stable_metrics,
            "int16_source": "evaluated-exact-int16-forward-batch",
        }
    ]
    proofs = []
    values = {
        42: (0.603, 0.320, 405.0),
        43: (0.604, 0.319, 404.0),
        44: (0.602, 0.318, 403.0),
    }
    for spec in candidate["models"]["seeds"]:
        seed = spec["seed"]
        pair, top1, mae = values[seed]
        integer = metrics(pair, top1, mae)
        models.extend(
            (
                {
                    "name": f"seed-{seed}-parent-deployment",
                    "role": "parent",
                    "seed": seed,
                    "checkpoint": copy.deepcopy(spec["parent_checkpoint"]),
                    "float": metrics(pair - 0.003, top1 - 0.006, mae + 3.0),
                    "int16": integer,
                    "int16_source": "evaluated-exact-int16-forward-batch",
                },
                {
                    "name": f"seed-{seed}-aligned-witness",
                    "role": "aligned-witness",
                    "seed": seed,
                    "checkpoint": copy.deepcopy(spec["aligned_checkpoint"]),
                    "float": metrics(pair - 0.001, top1 - 0.002, mae + 1.0),
                    "int16": copy.deepcopy(integer),
                    "int16_source": ("derived-from-seven-tensor-equivalent-parent"),
                },
            )
        )
        proofs.append(
            {
                "schema": PROTOCOL.QUANTIZED_PROOF_SCHEMA,
                "seed": seed,
                "method": "independent-strict-load-quantize-model-torch-equal",
                "tensor_names": list(PROTOCOL.QUANTIZED_TENSOR_NAMES),
                "tensors_equal": {
                    name: True for name in PROTOCOL.QUANTIZED_TENSOR_NAMES
                },
                "equal_tensor_count": 7,
                "all_equal": True,
                "parent": copy.deepcopy(spec["quantized_anchor"]),
                "aligned_witness": copy.deepcopy(spec["quantized_anchor"]),
            }
        )
    return {
        "schema": PROTOCOL.REPORT_SCHEMA,
        "status": PROTOCOL.REPORT_STATUS,
        "origin_registry": origin_for(candidate),
        "artifact_bindings": result_bindings(candidate),
        "data": {
            **candidate["spent_selection"]["dataset"],
            "records": 28_518,
            "parents": 4_798,
            "eligible_pairs": 20_000,
            "label_status": "already-spent-selection",
            "authorized_use": "representation-only-no-strength-claim",
        },
        "models": models,
        "quantized_proofs": proofs,
        "execution": {
            "model_count": 7,
            "model_loop_workers": 1,
            "float_model_evaluations": 7,
            "int16_model_evaluations": 4,
            "q_equivalent_int16_derivations": 3,
            "int16_reference": "int16_forward_batch",
            "int16_batch_rows": 4_096,
            "torch_intraop_threads": 10,
            "torch_original_intraop_threads": 2,
            "torch_original_intraop_threads_restored": True,
            "torch_interop_threads": 1,
            "torch_interop_threads_unchanged": True,
            "network_requests": 0,
        },
        "boundary": copy.deepcopy(PROTOCOL.BOUNDARY),
    }


class RepresentationBridgeV3SafetyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.candidate = BUILDER.build_registry_candidate()
        cls.report = report_for(cls.candidate)

    def receipt(self, report: dict | None = None) -> dict:
        return RUNNER.build_parent_deployment_receipt(
            self.report if report is None else report,
            registry=self.candidate,
            origin_registry=origin_for(self.candidate),
        )

    def test_selected_checkpoint_is_parent_and_alignment_is_witness_only(self):
        receipt = self.receipt()
        selected_seed = receipt["representative_seed"]
        spec = next(
            run
            for run in self.candidate["models"]["seeds"]
            if run["seed"] == selected_seed
        )
        self.assertEqual(
            receipt["selected_deployment"]["checkpoint"],
            spec["parent_checkpoint"],
        )
        self.assertEqual(receipt["selected_deployment"]["epoch"], 20)
        self.assertEqual(
            receipt["alignment_witness"]["checkpoint"],
            spec["aligned_checkpoint"],
        )
        self.assertEqual(receipt["alignment_witness"]["epoch"], 24)
        self.assertFalse(receipt["alignment_witness"]["deployment_authority"])
        self.assertFalse(receipt["boundary"]["strength_claim_authorized"])
        self.assertFalse(receipt["nonclaims"]["production_promotion_authorized"])

    def test_witness_cannot_be_substituted_as_epoch_20_deployment(self):
        mutated = copy.deepcopy(self.report)
        mutated["models"][2]["checkpoint"]["epoch"] = 20
        with self.assertRaisesRegex(ValueError, "epoch must be 24"):
            self.receipt(mutated)

    def test_parent_cannot_be_relabelled_as_epoch_24(self):
        mutated = copy.deepcopy(self.report)
        mutated["models"][1]["checkpoint"]["epoch"] = 24
        with self.assertRaisesRegex(ValueError, "epoch must be 20"):
            self.receipt(mutated)

    def test_every_report_checkpoint_identity_field_is_bound_to_registry(self):
        cases = (
            (0, "stable"),
            (1, "parent"),
            (2, "witness"),
        )
        for index, role in cases:
            for field in ("path", "sha256", "bytes", "schema", "epoch"):
                with self.subTest(role=role, field=field):
                    mutated = copy.deepcopy(self.report)
                    checkpoint = mutated["models"][index]["checkpoint"]
                    if field == "path":
                        checkpoint[field] += ".substituted"
                    elif field == "sha256":
                        checkpoint[field] = "f" * 64
                    elif field == "bytes":
                        checkpoint[field] += 1
                    elif field == "schema":
                        checkpoint[field] += "-substituted"
                    else:
                        checkpoint[field] += 1
                    with self.assertRaises(ValueError):
                        self.receipt(mutated)

    def test_q_proof_method_is_exact(self):
        mutated = copy.deepcopy(self.report)
        mutated["quantized_proofs"][0]["method"] = "claimed-equal"
        with self.assertRaisesRegex(ValueError, "quantized proof"):
            self.receipt(mutated)

    def test_origin_registry_and_result_identities_are_exact(self):
        origin_mutation = copy.deepcopy(self.report)
        origin_mutation["origin_registry"]["sha256"] = "f" * 64
        with self.assertRaisesRegex(ValueError, "report is partial"):
            self.receipt(origin_mutation)
        result_mutation = copy.deepcopy(self.report)
        result_mutation["artifact_bindings"][0]["parent_result"]["bytes"] += 1
        with self.assertRaisesRegex(ValueError, "result identities"):
            self.receipt(result_mutation)

    def test_runtime_registry_hash_and_enrolled_result_mutations_stop(self):
        root = ML_DIR.parent
        _registry, origin = RUNNER._runtime_registry(root)
        changed_origin = {**origin, "sha256": "f" * 64}
        with self.assertRaisesRegex(ValueError, "origin registry changed"):
            RUNNER._require_registry_unchanged(root, changed_origin)

        changed_result = copy.deepcopy(self.candidate)
        changed_result["models"]["seeds"][0]["parent_result"]["bytes"] += 1
        with self.assertRaisesRegex(ValueError, "enrollment drifted"):
            RUNNER._validate_public_inputs(changed_result, root)

    def test_transitive_source_mutations_stop_before_label_evaluation(self):
        dependencies = (
            "metric_gates",
            "selection_adapter",
            "evaluation_core",
            "quantized_alignment",
            "int16_forward",
            "export_weights",
            "training_core",
            "checkpoint_compat",
        )
        root = ML_DIR.parent
        for name in dependencies:
            with self.subTest(name=name):
                mutated = copy.deepcopy(self.candidate)
                identity = mutated["dependencies"]["runtime_import_closure"][name]
                identity["sha256"] = "f" * 64
                dataset_loader_called = False
                with self.assertRaisesRegex(ValueError, "identity mismatch"):
                    RUNNER._validate_public_inputs(mutated, root)
                    dataset_loader_called = True
                self.assertFalse(dataset_loader_called)

    def test_temp_copy_runtime_source_tampering_stops_before_labels(self):
        source_root = ML_DIR.parent
        identities = [
            *self.candidate["implementation"].values(),
            *self.candidate["dependencies"]["runtime_import_closure"].values(),
            *self.candidate["inputs"].values(),
        ]
        for closure_name in ("export_weights", "training_core", "checkpoint_compat"):
            with self.subTest(source=closure_name):
                with tempfile.TemporaryDirectory() as temporary:
                    copied_root = Path(os.path.realpath(temporary))
                    for identity in identities:
                        destination = copied_root / identity["path"]
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(source_root / identity["path"], destination)
                    target_identity = self.candidate["dependencies"][
                        "runtime_import_closure"
                    ][closure_name]
                    target = copied_root / target_identity["path"]
                    target.write_bytes(target.read_bytes() + b"\n# injected mutation\n")
                    dataset_loader_called = False
                    with self.assertRaisesRegex(ValueError, "identity mismatch"):
                        RUNNER._validate_public_inputs(self.candidate, copied_root)
                        dataset_loader_called = True
                    self.assertFalse(dataset_loader_called)

    def test_family_gate_failure_produces_no_publication(self):
        mutated = copy.deepcopy(self.report)
        for index in (2, 4, 6):
            mutated["models"][index]["float"]["within_parent_pair_accuracy"] -= 0.01
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(os.path.realpath(temporary)) / "result"
            with self.assertRaises(RUNNER.RepresentationBridgeGateFailed):
                receipt = self.receipt(mutated)
                RUNNER.publish_private_bundle(
                    output_root=str(target),
                    report=mutated,
                    receipt=receipt,
                    origin_registry=origin_for(self.candidate),
                    artifact_bindings=result_bindings(self.candidate),
                )
            self.assertFalse(target.exists())

    def test_atomic_bundle_leaves_no_root_when_serialization_fails(self):
        receipt = self.receipt()
        invalid = copy.deepcopy(self.report)
        invalid["models"][0]["float"]["value_mae_cp"] = math.nan
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(os.path.realpath(temporary)) / "result"
            with self.assertRaises(ValueError):
                RUNNER.publish_private_bundle(
                    output_root=str(target),
                    report=invalid,
                    receipt=receipt,
                    origin_registry=origin_for(self.candidate),
                    artifact_bindings=result_bindings(self.candidate),
                )
            self.assertFalse(target.exists())

    def test_publication_rejects_mismatched_provenance_before_staging(self):
        receipt = self.receipt()
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(os.path.realpath(temporary)) / "result"
            changed_origin = {
                **origin_for(self.candidate),
                "sha256": "f" * 64,
            }
            with self.assertRaisesRegex(ValueError, "provenance is inconsistent"):
                RUNNER.publish_private_bundle(
                    output_root=str(target),
                    report=self.report,
                    receipt=receipt,
                    origin_registry=changed_origin,
                    artifact_bindings=result_bindings(self.candidate),
                )
            self.assertFalse(target.exists())

    def test_atomic_bundle_publishes_all_three_private_files(self):
        receipt = self.receipt()
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(os.path.realpath(temporary)) / "result"
            published = RUNNER.publish_private_bundle(
                output_root=str(target),
                report=self.report,
                receipt=receipt,
                origin_registry=origin_for(self.candidate),
                artifact_bindings=result_bindings(self.candidate),
            )
            self.assertEqual(
                published["publication"]["schema"], PROTOCOL.PUBLICATION_SCHEMA
            )
            self.assertTrue(published["commit_receipt"]["committed"])
            self.assertEqual(
                published["commit_receipt"]["post_commit_status"],
                "verified-and-parent-fsynced",
            )
            self.assertEqual(
                sorted(path.name for path in target.iterdir()),
                sorted(PROTOCOL.OUTPUT_FILES.values()),
            )
            self.assertEqual(target.stat().st_mode & 0o777, 0o700)
            self.assertTrue(
                all(path.stat().st_mode & 0o777 == 0o600 for path in target.iterdir())
            )

    def test_exclusive_commit_preserves_racing_target_and_cleans_staging(self):
        receipt = self.receipt()
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(os.path.realpath(temporary))
            target = parent / "result"

            def create_racing_target(path: Path) -> None:
                path.mkdir(mode=0o700)
                (path / "sentinel").write_text("keep", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "already exists"):
                RUNNER.publish_private_bundle(
                    output_root=str(target),
                    report=self.report,
                    receipt=receipt,
                    origin_registry=origin_for(self.candidate),
                    artifact_bindings=result_bindings(self.candidate),
                    _before_commit=create_racing_target,
                )
            self.assertEqual((target / "sentinel").read_text(), "keep")
            self.assertEqual(
                [path.name for path in parent.iterdir()],
                ["result"],
            )

    def test_post_commit_stat_fault_returns_committed_recovery_receipt(self):
        receipt = self.receipt()
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(os.path.realpath(temporary))
            target = parent / "result"

            def failed_stat(*_args, **_kwargs):
                raise OSError(5, "injected post-rename stat failure")

            published = RUNNER.publish_private_bundle(
                output_root=str(target),
                report=self.report,
                receipt=receipt,
                origin_registry=origin_for(self.candidate),
                artifact_bindings=result_bindings(self.candidate),
                _post_stat=failed_stat,
            )
            commit = published["commit_receipt"]
            self.assertTrue(commit["committed"])
            self.assertEqual(
                commit["post_commit_status"],
                "committed-recovery-verification-required",
            )
            self.assertIn(
                "target-inode-verification-indeterminate",
                commit["diagnostic_errors"],
            )
            self.assertEqual(len(list(target.iterdir())), 3)
            self.assertEqual([path.name for path in parent.iterdir()], ["result"])

    def test_fifth_fsync_fault_is_committed_not_false_stop(self):
        receipt = self.receipt()
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(os.path.realpath(temporary))
            target = parent / "result"
            calls = 0

            def fifth_fsync(descriptor: int) -> None:
                nonlocal calls
                calls += 1
                if calls == 5:
                    raise OSError(5, "injected parent fsync failure")
                os.fsync(descriptor)

            published = RUNNER.publish_private_bundle(
                output_root=str(target),
                report=self.report,
                receipt=receipt,
                origin_registry=origin_for(self.candidate),
                artifact_bindings=result_bindings(self.candidate),
                _fsync=fifth_fsync,
            )
            commit = published["commit_receipt"]
            self.assertEqual(calls, 5)
            self.assertTrue(commit["committed"])
            self.assertIn("parent-directory-fsync-failed", commit["diagnostic_errors"])
            self.assertEqual(len(list(target.iterdir())), 3)
            self.assertEqual([path.name for path in parent.iterdir()], ["result"])

    def test_post_commit_close_fault_is_committed_not_false_stop(self):
        receipt = self.receipt()
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(os.path.realpath(temporary))
            target = parent / "result"
            calls = 0

            def close_then_fail_once(descriptor: int) -> None:
                nonlocal calls
                calls += 1
                os.close(descriptor)
                if calls == 1:
                    raise OSError(5, "injected source descriptor close failure")

            published = RUNNER.publish_private_bundle(
                output_root=str(target),
                report=self.report,
                receipt=receipt,
                origin_registry=origin_for(self.candidate),
                artifact_bindings=result_bindings(self.candidate),
                _close=close_then_fail_once,
            )
            commit = published["commit_receipt"]
            self.assertTrue(commit["committed"])
            self.assertIn("source-descriptor-close-failed", commit["diagnostic_errors"])
            self.assertEqual(
                commit["post_commit_status"],
                "committed-recovery-verification-required",
            )
            self.assertEqual(len(list(target.iterdir())), 3)
            self.assertEqual([path.name for path in parent.iterdir()], ["result"])

    def test_cli_surfaces_committed_recovery_without_false_stop(self):
        recovery = PROTOCOL.COMMIT_SEMANTICS["recovery"]
        result = {
            "receipt": {"selected_deployment": {"seed": 43}},
            "commit_receipt": {
                "committed": True,
                "post_commit_status": "committed-recovery-verification-required",
                "diagnostic_errors": ["parent-directory-fsync-failed"],
                "recovery": recovery,
            },
        }
        standard_output = io.StringIO()
        standard_error = io.StringIO()
        with (
            mock.patch.object(RUNNER, "run_representation_bridge", return_value=result),
            redirect_stdout(standard_output),
            redirect_stderr(standard_error),
        ):
            return_code = RUNNER.main([])
        self.assertEqual(return_code, 0)
        self.assertEqual(standard_output.getvalue(), "")
        rendered = standard_error.getvalue()
        self.assertIn("COMMITTED-RECOVERY", rendered)
        self.assertIn("parent-directory-fsync-failed", rendered)
        self.assertIn(recovery, rendered)


if __name__ == "__main__":
    unittest.main()
