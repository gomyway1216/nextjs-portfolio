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
        "cpu_execution": copy.deepcopy(PROTOCOL.EXPECTED_CPU_EXECUTION),
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
                cpu_runtime=copy.deepcopy(PROTOCOL.EXPECTED_CPU_EXECUTION),
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
            self.assertEqual(old_claim.read_bytes(), old_before)
            published = json.loads(new_claim.read_text())
            self.assertEqual(published, document)
            with self.assertRaisesRegex(
                DIRECT.DirectTeacherV3CpuTrainingError, "rerun refused"
            ):
                DIRECT.acquire_one_shot_claim(document, path=str(new_claim))

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
