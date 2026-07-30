from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

import torch


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import direct_teacher_halfkp81_v2_protocol as V2_PROTOCOL  # noqa: E402
import direct_teacher_halfkp81_v3_cpu_protocol as PROTOCOL  # noqa: E402
import train_direct_teacher_halfkp81_v3_cpu as DIRECT  # noqa: E402


class TinyDirectModel(torch.nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.hand = torch.nn.Linear(2, 1)
        self.bucket_bias = torch.nn.Embedding(2, 1)

    def forward(self, _board, hands, bucket):
        return self.hand(hands).squeeze(-1) + self.bucket_bias(bucket).squeeze(-1)


class MissingGradientModel(TinyDirectModel):
    def __init__(self) -> None:
        super().__init__()
        self.unused = torch.nn.Parameter(torch.ones(1))


def _probe_inputs(rows: int = 2048):
    generator = torch.Generator(device="cpu").manual_seed(123)
    tensors = (
        torch.zeros((rows, 1), dtype=torch.long),
        torch.rand((rows, 2), generator=generator),
        torch.rand((rows,), generator=generator),
        torch.zeros((rows,), dtype=torch.float32),
        torch.arange(rows, dtype=torch.long) % 2,
    )
    data_rows = [{"child_position_id": f"sha256:{index:064x}"} for index in range(rows)]
    return tensors, data_rows


def _claim_document(path: str) -> dict:
    def identity(character, schema=None):
        return {
            "path": f"/tmp/{character}.json",
            "bytes": 10,
            "sha256": character * 64,
            **({"schema": schema} if schema else {}),
        }

    return {
        "schema": DIRECT.CLAIM_SCHEMA,
        "status": DIRECT.CLAIM_STATUS,
        "owner": {
            "kind": "direct-teacher-halfkp81-v3-cpu-one-shot-trainer",
            "pid": os.getpid(),
            "pipeline_revision": "a" * 40,
        },
        "execution_plan": identity("1", PROTOCOL.EXECUTION_PLAN_SCHEMA),
        "predecessor_terminal": identity("2", PROTOCOL.TERMINAL_SCHEMA),
        "metadata_manifest": identity("3", PROTOCOL.MANIFEST_SCHEMA),
        "capability_probe": identity("4", DIRECT.PROBE_SCHEMA),
        "cpu_execution": {
            **copy.deepcopy(PROTOCOL.EXPECTED_CPU_EXECUTION),
            "verified": True,
        },
        "output_path": path,
        "optimizer_creation_authorized": True,
        "additional_run_authorized": False,
        "live_weight_write_authorized": False,
    }


class DirectTeacherHalfkp81V3CpuTrainerTests(unittest.TestCase):
    def test_recipe_and_cli_have_no_tunable_successor_fields(self) -> None:
        self.assertEqual(DIRECT.SEED, 42)
        self.assertEqual(DIRECT.BATCH, 2048)
        self.assertEqual(DIRECT.LEARNING_RATE, 0.000003)
        self.assertEqual(DIRECT.WEIGHT_DECAY, 0.0)
        differences = {
            field
            for field in PROTOCOL.EXPECTED_TRAINING
            if PROTOCOL.EXPECTED_TRAINING[field] != V2_PROTOCOL.EXPECTED_TRAINING[field]
        }
        self.assertEqual(differences, {"device"})
        self.assertEqual(PROTOCOL.EXPECTED_TRAINING["device"], "cpu")
        cli_fields = {
            action.dest for action in DIRECT._parser()._actions if action.dest != "help"
        }
        self.assertEqual(
            cli_fields,
            {"execution_plan", "pipeline_revision", "out", "repo_root"},
        )

    def test_real_probe_is_deterministic_and_never_creates_optimizer(self) -> None:
        torch.manual_seed(42)
        model = TinyDirectModel()
        tensors, rows = _probe_inputs()
        before = DIRECT._model_parameter_sha256(model)
        with mock.patch.object(
            torch.optim,
            "AdamW",
            side_effect=AssertionError("probe must not construct an optimizer"),
        ):
            receipt = DIRECT.run_capability_probe(
                model=model,
                training_tensors=tensors,
                training_rows=rows,
                execution_plan={"sha256": "1" * 64},
                terminal={"sha256": "2" * 64},
                metadata_manifest={"sha256": "3" * 64},
                cpu_runtime={
                    **copy.deepcopy(PROTOCOL.EXPECTED_CPU_EXECUTION),
                    "verified": True,
                },
            )
        self.assertEqual(
            receipt["status"],
            "passed-real-cpu-forward-backward-before-claim",
        )
        self.assertEqual(receipt["selection"]["rows"], 2048)
        self.assertEqual(
            receipt["runs"][0]["output_sha256"],
            receipt["runs"][1]["output_sha256"],
        )
        self.assertEqual(
            receipt["runs"][0]["gradient_sha256"],
            receipt["runs"][1]["gradient_sha256"],
        )
        self.assertFalse(receipt["optimizer_created"])
        self.assertFalse(receipt["parameter_step"])
        self.assertFalse(receipt["strength_metric_observed"])
        self.assertEqual(DIRECT._model_parameter_sha256(model), before)
        DIRECT.validate_capability_probe(
            receipt,
            execution_plan={"sha256": "1" * 64},
            terminal={"sha256": "2" * 64},
            metadata_manifest={"sha256": "3" * 64},
        )
        for label, mutate in {
            "plan": lambda value: value["execution_plan"].__setitem__(
                "sha256", "f" * 64
            ),
            "gradient": lambda value: value["runs"][1].__setitem__(
                "gradient_sha256", "f" * 64
            ),
            "optimizer": lambda value: value.__setitem__("optimizer_created", True),
        }.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(receipt)
                mutate(changed)
                with self.assertRaises(DIRECT.DirectTeacherV3CpuTrainingError):
                    DIRECT.validate_capability_probe(
                        changed,
                        execution_plan={"sha256": "1" * 64},
                        terminal={"sha256": "2" * 64},
                        metadata_manifest={"sha256": "3" * 64},
                    )

    def test_probe_missing_gradient_fails_before_claim_or_optimizer(self) -> None:
        torch.manual_seed(42)
        tensors, rows = _probe_inputs()
        with (
            mock.patch.object(
                torch.optim,
                "AdamW",
                side_effect=AssertionError("probe must not construct an optimizer"),
            ),
            self.assertRaisesRegex(
                DIRECT.DirectTeacherV3CpuTrainingError, "gradient missing"
            ),
        ):
            DIRECT.run_capability_probe(
                model=MissingGradientModel(),
                training_tensors=tensors,
                training_rows=rows,
                execution_plan={"sha256": "1" * 64},
                terminal={"sha256": "2" * 64},
                metadata_manifest={"sha256": "3" * 64},
                cpu_runtime=copy.deepcopy(PROTOCOL.EXPECTED_CPU_EXECUTION),
            )

    def test_training_reauthenticates_claim_before_optimizer_creation(self) -> None:
        tensors, _rows = _probe_inputs(rows=4)
        with (
            mock.patch.object(
                DIRECT,
                "reauthenticate_claim",
                side_effect=DIRECT.DirectTeacherV3CpuTrainingError("claim changed"),
            ),
            mock.patch.object(torch.optim, "AdamW") as optimizer,
            self.assertRaisesRegex(
                DIRECT.DirectTeacherV3CpuTrainingError, "claim changed"
            ),
        ):
            DIRECT.train_exactly_one_epoch(
                TinyDirectModel(),
                tensors,
                claim={"identity": {}},
            )
        optimizer.assert_not_called()

    def test_v3_claim_namespace_is_create_only_and_leaves_v2_claim_untouched(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old_claim = root / "v2-claim.json"
            old_claim.write_bytes(b'{"status":"old-v2-consumed"}\n')
            old_before = old_claim.read_bytes()
            new_claim = root / DIRECT.CLAIM_DIRECTORY / ("1" * 64 + ".json")
            new_claim.parent.mkdir(mode=0o700)
            document = _claim_document(str(root / "output"))
            receipt = DIRECT.acquire_one_shot_claim(document, path=str(new_claim))
            self.assertEqual(receipt["status"], DIRECT.CLAIM_STATUS)
            self.assertEqual(
                DIRECT.reauthenticate_claim(
                    receipt,
                    execution_plan=document["execution_plan"],
                    terminal=document["predecessor_terminal"],
                    metadata_manifest=document["metadata_manifest"],
                    capability_probe=document["capability_probe"],
                ),
                receipt,
            )
            self.assertEqual(old_claim.read_bytes(), old_before)
            published = json.loads(new_claim.read_text())
            self.assertEqual(published, document)
            different_manifest = copy.deepcopy(document["metadata_manifest"])
            different_manifest["sha256"] = "f" * 64
            with self.assertRaisesRegex(
                DIRECT.DirectTeacherV3CpuTrainingError,
                "manifest binding differs",
            ):
                DIRECT.reauthenticate_claim(
                    receipt,
                    execution_plan=document["execution_plan"],
                    terminal=document["predecessor_terminal"],
                    metadata_manifest=different_manifest,
                    capability_probe=document["capability_probe"],
                )
            with self.assertRaisesRegex(
                DIRECT.DirectTeacherV3CpuTrainingError, "rerun refused"
            ):
                DIRECT.acquire_one_shot_claim(document, path=str(new_claim))

    def test_output_parent_is_real_writable_and_checked_before_claim(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "candidate"
            self.assertEqual(
                DIRECT.preflight_output_slot(str(output)),
                str(output.resolve()),
            )
            self.assertFalse(output.exists())
            self.assertEqual(
                list(root.glob(".direct-teacher-halfkp81-v3-cpu-output-preflight-*")),
                [],
            )

            output.mkdir()
            with self.assertRaisesRegex(
                DIRECT.DirectTeacherV3CpuTrainingError, "already exists"
            ):
                DIRECT.preflight_output_slot(str(output))

            missing = root / "missing" / "candidate"
            with self.assertRaisesRegex(
                DIRECT.DirectTeacherV3CpuTrainingError,
                "parent does not exist",
            ):
                DIRECT.preflight_output_slot(str(missing))

            real_parent = root / "real-parent"
            real_parent.mkdir()
            linked_parent = root / "linked-parent"
            linked_parent.symlink_to(real_parent, target_is_directory=True)
            with self.assertRaisesRegex(
                DIRECT.DirectTeacherV3CpuTrainingError, "symlink"
            ):
                DIRECT.preflight_output_slot(str(linked_parent / "candidate"))

    def test_static_validator_rejects_substituted_candidate_and_runtime(self) -> None:
        def identity(name, character, schema=None, buckets=None):
            result = {
                "path": f"/tmp/{name}",
                "bytes": 10,
                "sha256": character * 64,
            }
            if schema is not None:
                result["schema"] = schema
            if buckets is not None:
                result["buckets"] = buckets
            return result

        protocol_identity = identity("protocol.json", "1", PROTOCOL.PROTOCOL_SCHEMA)
        terminal_identity = identity("terminal.json", "2", PROTOCOL.TERMINAL_SCHEMA)
        manifest_identity = identity("manifest.json", "3", PROTOCOL.MANIFEST_SCHEMA)
        plan_identity = identity("plan.json", "4", PROTOCOL.EXECUTION_PLAN_SCHEMA)
        probe_identity = identity("probe.json", "5", DIRECT.PROBE_SCHEMA)
        trainer_identity = identity("trainer.json", "6", DIRECT.TRAINER_RESULT_SCHEMA)
        runtime_identity = identity("runtime.json", "7", DIRECT.V2.RUNTIME_SCHEMA)
        initializer = identity("initializer.pt", "8")
        live = identity("live.bin", "9")
        wasm = identity("runtime.wasm", "a")
        initializer_weights = identity("initializer-weights.bin", "b", buckets=81)
        candidate_weights = identity("candidate-weights.bin", "c", buckets=81)
        final_checkpoint = identity("final.pt", "d", DIRECT.CHECKPOINT_SCHEMA)
        reference_identity = {
            **identity("reference.json", "e"),
            "schema": DIRECT.V2.REFERENCE_SCHEMA,
            "positions": 1,
        }
        claim = {
            "identity": identity("claim.json", "f", DIRECT.CLAIM_SCHEMA),
            "owner": {"pipeline_revision": "a" * 40},
        }
        plan = {
            "protocol": protocol_identity,
            "predecessor_terminal": terminal_identity,
            "metadata_manifest": manifest_identity,
            "inputs": {
                "initializer": initializer,
                "live_weights": live,
                "runtime_wasm": wasm,
                "training_dataset": {"rows": 4},
                "validation_dataset": {"rows": 2},
            },
        }
        runtime_receipt = {
            "parity": {"mismatches": 0},
            "technical_faults": 0,
            "throughput": {
                "median_slowdown_percent": 0.0,
                "aggregate_slowdown_percent": 0.0,
            },
        }
        baseline = {
            "direct_scalar_bce": 0.5,
            "teacher_mae_cp": 100.0,
            "pair_accuracy": 0.7,
            "pair_correct": 7,
            "pair_total": 10,
            "rows": 2,
            "teacher_cp_basis": "fixed",
        }
        candidate = {
            **baseline,
            "teacher_mae_cp": 90.0,
            "pair_accuracy": 0.699,
        }
        initializer_quantization = {
            "mean_abs_cp_delta": 10.0,
            "max_abs_cp_delta": 20.0,
        }
        candidate_quantization = copy.deepcopy(initializer_quantization)
        trainer = {
            "schema": DIRECT.TRAINER_RESULT_SCHEMA,
            "status": "complete-final-epoch-frozen-static-pending",
            "implementation": {
                "source_revision": "a" * 40,
                "tracked_tree_clean": True,
            },
            "execution_plan": plan_identity,
            "predecessor_terminal": terminal_identity,
            "metadata_manifest": manifest_identity,
            "capability_probe": probe_identity,
            "one_shot_claim": claim,
            "cpu_execution": {
                **copy.deepcopy(PROTOCOL.EXPECTED_CPU_EXECUTION),
                "verified": True,
            },
            "training": {
                "epoch": 1,
                "rows": 4,
                "direct_scalar_bce": 0.5,
                "seconds": 1.0,
                "optimizer": "AdamW",
                "scheduler": "constant-none",
                "learning_rate": DIRECT.LEARNING_RATE,
                "weight_decay": DIRECT.WEIGHT_DECAY,
                "batch": DIRECT.BATCH,
                "seed": DIRECT.SEED,
                "parameter_scope": "all",
                "device": "cpu",
            },
            "epochs_completed": 1,
            "candidate_count": 1,
            "checkpoint_selection": "final-epoch-1-only",
            "best_checkpoint_selection": False,
            "additional_epoch_or_seed": False,
            "metrics": {
                "initializer": baseline,
                "candidate": candidate,
                "initializer_quantization": initializer_quantization,
                "candidate_quantization": candidate_quantization,
            },
            "artifacts": {
                "final_checkpoint": final_checkpoint,
                "initializer_weights": initializer_weights,
                "candidate_weights": candidate_weights,
                "candidate_reference": reference_identity,
            },
            "export_roundtrip_mismatches": 0,
            "live_weights": {
                "before": live,
                "after": live,
                "byte_exact_unchanged": True,
            },
            "paired56_authorized": False,
            "expanded_stage_authorized": False,
            "live_weight_write_authorized": False,
        }
        static = DIRECT.build_static_result(
            protocol=protocol_identity,
            execution_plan=plan_identity,
            terminal=terminal_identity,
            metadata_manifest=manifest_identity,
            capability_probe=probe_identity,
            claim=claim,
            initializer=initializer,
            live_weights=live,
            trainer_result=trainer_identity,
            candidate_weights=candidate_weights,
            runtime_sanity=runtime_identity,
            baseline_metrics=baseline,
            candidate_metrics=candidate,
            initializer_quantization=initializer_quantization,
            candidate_quantization=candidate_quantization,
            runtime_receipt=runtime_receipt,
            export_roundtrip_mismatches=0,
        )
        raw_by_path = {
            protocol_identity["path"]: {"schema": PROTOCOL.PROTOCOL_SCHEMA},
            terminal_identity["path"]: {"schema": PROTOCOL.TERMINAL_SCHEMA},
            manifest_identity["path"]: {"schema": PROTOCOL.MANIFEST_SCHEMA},
            plan_identity["path"]: plan,
            probe_identity["path"]: {"schema": DIRECT.PROBE_SCHEMA},
            trainer_identity["path"]: trainer,
            runtime_identity["path"]: {"schema": DIRECT.V2.RUNTIME_SCHEMA},
        }

        def load_matching(value, **_kwargs):
            return (
                copy.deepcopy(raw_by_path[value["path"]]),
                {key: value[key] for key in ("path", "bytes", "sha256")},
            )

        actual_files = {
            final_checkpoint["path"]: {
                key: final_checkpoint[key] for key in ("path", "bytes", "sha256")
            },
            wasm["path"]: wasm,
        }

        def validate(value, *, runtime_error=False):
            runtime_exception = (
                DIRECT.V2.DirectTeacherTrainingError("runtime model binding mismatch")
                if runtime_error
                else None
            )
            with (
                mock.patch.object(
                    DIRECT,
                    "_load_matching_json_identity",
                    side_effect=load_matching,
                ),
                mock.patch.object(
                    DIRECT.PROTOCOL,
                    "validate_protocol_document",
                    side_effect=lambda item: item,
                ),
                mock.patch.object(
                    DIRECT.PROTOCOL,
                    "verify_terminal_evidence",
                    side_effect=lambda item, **_kwargs: item,
                ),
                mock.patch.object(
                    DIRECT.PROTOCOL,
                    "validate_metadata_manifest",
                    side_effect=lambda item, **_kwargs: item,
                ),
                mock.patch.object(
                    DIRECT.PROTOCOL,
                    "validate_execution_plan",
                    return_value=plan,
                ),
                mock.patch.object(
                    DIRECT.PLAN, "build_execution_plan", return_value=plan
                ),
                mock.patch.object(
                    DIRECT,
                    "validate_capability_probe",
                    side_effect=lambda item, **_kwargs: item,
                ),
                mock.patch.object(DIRECT, "reauthenticate_claim", return_value=claim),
                mock.patch.object(
                    DIRECT,
                    "_reauthenticate_plain_file_identity",
                    side_effect=lambda item, **_kwargs: copy.deepcopy(item),
                ),
                mock.patch.object(
                    DIRECT,
                    "_identity",
                    side_effect=lambda path, _label: copy.deepcopy(actual_files[path]),
                ),
                mock.patch.object(
                    DIRECT.PROTOCOL,
                    "load_strict_json_file",
                    return_value=(
                        {
                            "schema": DIRECT.V2.REFERENCE_SCHEMA,
                            "n": 1,
                        },
                        {
                            key: reference_identity[key]
                            for key in ("path", "bytes", "sha256")
                        },
                    ),
                ),
                mock.patch.object(
                    DIRECT.V2,
                    "validate_runtime_receipt",
                    side_effect=runtime_exception,
                    return_value=runtime_receipt,
                ),
            ):
                return DIRECT.validate_static_result(value)

        self.assertEqual(validate(copy.deepcopy(static)), static)

        substituted_candidate = copy.deepcopy(static)
        substituted_candidate["candidate_weights"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(
            DIRECT.DirectTeacherV3CpuTrainingError,
            "candidate/trainer binding differs",
        ):
            validate(substituted_candidate)

        substituted_probe = copy.deepcopy(static)
        substituted_probe["capability_probe"]["sha256"] = "0" * 64
        with self.assertRaisesRegex(
            DIRECT.DirectTeacherV3CpuTrainingError,
            "trainer result binding",
        ):
            validate(substituted_probe)

        with self.assertRaisesRegex(
            DIRECT.DirectTeacherV3CpuTrainingError,
            "runtime model binding mismatch",
        ):
            validate(copy.deepcopy(static), runtime_error=True)

    def test_cpu_runtime_rejects_missing_fixed_environment_before_work(self) -> None:
        with (
            mock.patch.dict(os.environ, {}, clear=True),
            self.assertRaisesRegex(
                DIRECT.DirectTeacherV3CpuTrainingError,
                "fixed CPU environment differs",
            ),
        ):
            DIRECT.configure_and_verify_cpu_runtime()


if __name__ == "__main__":
    unittest.main()
