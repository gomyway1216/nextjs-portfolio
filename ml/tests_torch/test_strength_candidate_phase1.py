import hashlib
import inspect
import json
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import capacity_policy_value as cpv  # noqa: E402
import train_capacity_policy_value as runner  # noqa: E402
from ml.tests_torch.test_capacity_policy_value import (  # noqa: E402
    synthetic_group,
    with_derived_children,
)


def strength_binding():
    return runner._protocol_binding(runner.TRACKED_STRENGTH_PROTOCOL_PATH)


class TinyStrengthModel(cpv.OfflineCapacityPolicyValue):
    def __init__(self):
        torch.nn.Module.__init__(self)
        self.weight = torch.nn.Parameter(torch.zeros(1))

    @classmethod
    def parameter_count(cls):
        return 1


def checkpoint_test_binding():
    return {**strength_binding(), "model_class": TinyStrengthModel}


def checkpoint_payload(
    *,
    global_epoch,
    protocol=None,
    fit=None,
):
    seed, phase, epoch = runner._strength_step_from_index(global_epoch)
    binding = checkpoint_test_binding()
    model = TinyStrengthModel()
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=3e-4, weight_decay=1e-4
    )
    for _step in range(global_epoch):
        optimizer.zero_grad()
        model.weight.sum().backward()
        optimizer.step()
    return {
        "checkpoint_schema": runner.STRENGTH_CHECKPOINT_SCHEMA,
        **runner._checkpoint_model_metadata(binding, detailed=True),
        "model_variant": runner.STRENGTH_MODEL_VARIANT,
        "objective": cpv.OBJECTIVE_V2,
        "optimizer_schema": "torch.optim.AdamW-v1",
        "seed": seed,
        "phase": phase,
        "completed_epoch": epoch,
        "global_epoch": global_epoch,
        "protocol": protocol or {"bytes": 7, "sha256": "protocol"},
        "fit_data_receipt": fit or {"fit": "receipt"},
        "spent_development_evidence": {"sha256": "spent"},
        "model": model.state_dict(),
        "optimizer": optimizer.state_dict(),
        "cpu_rng": torch.get_rng_state().clone(),
        "mps_rng": torch.tensor([1, 2, 3], dtype=torch.uint8),
        "training_curve": [
            {
                "seed": row_seed,
                "phase": row_phase,
                "epoch": row_epoch,
                "batches": 1,
            }
            for row_seed, row_phase, row_epoch in (
                runner._strength_step_from_index(index)
                for index in range(1, global_epoch + 1)
            )
        ],
    }


def publish_checkpoint(root, payload):
    runner._atomic_torch_save(root / "last.pt", payload)
    runner._atomic_json(
        root / "last-receipt.json",
        runner._strength_checkpoint_receipt(root / "last.pt", payload),
    )


class StrengthCandidatePhase1Tests(unittest.TestCase):
    def setUp(self):
        self._mps_rng_patch = None
        if os.environ.get("RUN_MPS_RESUME_SMOKE") != "1":
            self._mps_rng_patch = mock.patch.object(
                runner,
                "_mps_rng_state",
                return_value=torch.tensor([1, 2, 3], dtype=torch.uint8),
            )
            self._mps_rng_patch.start()

    def tearDown(self):
        if self._mps_rng_patch is not None:
            self._mps_rng_patch.stop()

    def test_registered_protocol_hash_architecture_and_binding_are_exact(self):
        raw = runner.TRACKED_STRENGTH_PROTOCOL_PATH.read_bytes()
        self.assertEqual(
            hashlib.sha256(raw).hexdigest(),
            runner.TRACKED_STRENGTH_PROTOCOL_SHA256,
        )
        protocol = json.loads(raw)
        self.assertEqual(protocol["schema"], runner.STRENGTH_PROTOCOL_SCHEMA)
        self.assertEqual(
            protocol["result_schema"], runner.STRENGTH_RESULT_SCHEMA
        )
        self.assertEqual(
            protocol["architecture"]["schema"],
            runner.STRENGTH_MODEL_SCHEMA,
        )
        self.assertEqual(
            protocol["architecture"]["model_variant"],
            runner.STRENGTH_MODEL_VARIANT,
        )
        self.assertEqual(protocol["architecture"]["parameters"], 6_168_130)
        binding = strength_binding()
        self.assertTrue(runner._is_strength_phase1(binding))
        self.assertIs(
            binding["model_class"],
            cpv.OfflineChildBoardCapacityPolicyValue,
        )

    def test_seed_order_is_fixed_and_resume_is_exactly_next_epoch(self):
        expected = (
            [(42, "v9", epoch) for epoch in range(1, 5)]
            + [(42, "mixed", epoch) for epoch in range(1, 13)]
            + [(314159, "v9", epoch) for epoch in range(1, 5)]
            + [(314159, "mixed", epoch) for epoch in range(1, 13)]
        )
        observed = [
            runner._strength_step_from_index(index)
            for index in range(1, 33)
        ]
        self.assertEqual(observed, expected)
        self.assertEqual(runner._strength_next_step(None), expected[0])
        for index, step in enumerate(expected[:-1], start=1):
            seed, phase, epoch = step
            self.assertEqual(
                runner._strength_next_step(
                    {
                        "seed": seed,
                        "phase": phase,
                        "completed_epoch": epoch,
                        "global_epoch": index,
                    }
                ),
                expected[index],
            )
        seed, phase, epoch = expected[-1]
        self.assertIsNone(
            runner._strength_next_step(
                {
                    "seed": seed,
                    "phase": phase,
                    "completed_epoch": epoch,
                    "global_epoch": 32,
                }
            )
        )
        self.assertEqual(expected[16], (314159, "v9", 1))

    def test_phase1_path_rejects_alternate_and_output_rejects_complete(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            expected = root / "registered"
            self.assertEqual(
                runner._strength_output_path(expected, expected),
                expected.resolve(),
            )
            with self.assertRaisesRegex(ValueError, "alternate output"):
                runner._strength_output_path(root / "alternate", expected)
            expected.mkdir()
            (expected / "result.json").write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "terminal result"):
                runner._strength_output_state(expected)

    def test_output_rejects_empty_extra_or_symlink_recovery(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            empty = root / "empty"
            empty.mkdir()
            with self.assertRaisesRegex(ValueError, "unique recovery"):
                runner._strength_output_state(empty)
            extra = root / "extra"
            extra.mkdir()
            (extra / "best.pt").write_bytes(b"x")
            with self.assertRaisesRegex(ValueError, "unique recovery"):
                runner._strength_output_state(extra)
            partial = root / "partial"
            partial.mkdir()
            (partial / "last.pt").write_bytes(b"x")
            self.assertEqual(
                runner._strength_output_state(partial), "resume"
            )
            receipt_only = root / "receipt-only"
            receipt_only.mkdir()
            (receipt_only / "last-receipt.json").write_text(
                "{}", encoding="utf-8"
            )
            with self.assertRaisesRegex(ValueError, "checkpoint is absent"):
                runner._strength_output_state(receipt_only)
            if hasattr(os, "symlink"):
                linked = root / "linked"
                linked.mkdir()
                (linked / "last-receipt.json").write_text(
                    "{}", encoding="utf-8"
                )
                os.symlink(partial / "last.pt", linked / "last.pt")
                with self.assertRaisesRegex(ValueError, "symlink"):
                    runner._strength_output_state(linked)

    def test_atomic_checkpoint_has_receipt_and_no_partial_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = checkpoint_payload(global_epoch=5)
            publish_checkpoint(root, payload)
            self.assertFalse((root / "last.pt.tmp").exists())
            self.assertFalse((root / "last-receipt.json.tmp").exists())
            loaded = runner._load_strength_last_checkpoint(
                root,
                binding=checkpoint_test_binding(),
                protocol_receipt=payload["protocol"],
                fit_data_receipt=payload["fit_data_receipt"],
            )
            self.assertEqual(loaded["global_epoch"], 5)
            self.assertEqual(
                runner._strength_next_step(loaded), (42, "mixed", 2)
            )

    def test_corrupt_mismatch_and_older_checkpoint_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            current = checkpoint_payload(global_epoch=6)
            publish_checkpoint(root, current)
            with (root / "last.pt").open("ab") as stream:
                stream.write(b"corrupt")
            with self.assertRaisesRegex(ValueError, "identity drift"):
                runner._load_strength_last_checkpoint(
                    root,
                    binding=checkpoint_test_binding(),
                    protocol_receipt=current["protocol"],
                    fit_data_receipt=current["fit_data_receipt"],
                )

            publish_checkpoint(root, current)
            with self.assertRaisesRegex(ValueError, "binding mismatch"):
                runner._load_strength_last_checkpoint(
                    root,
                    binding=checkpoint_test_binding(),
                    protocol_receipt={"bytes": 8, "sha256": "other"},
                    fit_data_receipt=current["fit_data_receipt"],
                )

            publish_checkpoint(root, current)
            older = checkpoint_payload(global_epoch=5)
            runner._atomic_torch_save(root / "last.pt", older)
            with self.assertRaisesRegex(ValueError, "rolled back"):
                runner._load_strength_last_checkpoint(
                    root,
                    binding=checkpoint_test_binding(),
                    protocol_receipt=current["protocol"],
                    fit_data_receipt=current["fit_data_receipt"],
                )

    def test_last_checkpoint_publish_window_regenerates_derived_receipt(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            first = checkpoint_payload(global_epoch=5)
            publish_checkpoint(root, first)
            (root / "last-receipt.json").unlink()
            loaded = runner._load_strength_last_checkpoint(
                root,
                binding=checkpoint_test_binding(),
                protocol_receipt=first["protocol"],
                fit_data_receipt=first["fit_data_receipt"],
            )
            self.assertEqual(loaded["global_epoch"], 5)
            self.assertTrue((root / "last-receipt.json").is_file())

            stale_receipt = json.loads(
                (root / "last-receipt.json").read_text(encoding="utf-8")
            )
            second = checkpoint_payload(global_epoch=6)
            runner._atomic_torch_save(root / "last.pt", second)
            loaded = runner._load_strength_last_checkpoint(
                root,
                binding=checkpoint_test_binding(),
                protocol_receipt=second["protocol"],
                fit_data_receipt=second["fit_data_receipt"],
            )
            self.assertEqual(loaded["global_epoch"], 6)
            current_receipt = json.loads(
                (root / "last-receipt.json").read_text(encoding="utf-8")
            )
            self.assertEqual(stale_receipt["global_epoch"], 5)
            self.assertEqual(current_receipt["global_epoch"], 6)

            publish_checkpoint(root, checkpoint_payload(global_epoch=4))
            runner._atomic_torch_save(
                root / "last.pt", checkpoint_payload(global_epoch=6)
            )
            with self.assertRaisesRegex(ValueError, "skipped an epoch"):
                runner._load_strength_last_checkpoint(
                    root,
                    binding=checkpoint_test_binding(),
                    protocol_receipt=second["protocol"],
                    fit_data_receipt=second["fit_data_receipt"],
                )
            publish_checkpoint(root, checkpoint_payload(global_epoch=5))
            stale_path = root / "last-receipt.json"
            malformed_stale = json.loads(
                stale_path.read_text(encoding="utf-8")
            )
            malformed_stale["schema"] = "wrong"
            runner._atomic_json(stale_path, malformed_stale)
            runner._atomic_torch_save(
                root / "last.pt", checkpoint_payload(global_epoch=6)
            )
            with self.assertRaisesRegex(ValueError, "stale.*malformed"):
                runner._load_strength_last_checkpoint(
                    root,
                    binding=checkpoint_test_binding(),
                    protocol_receipt=second["protocol"],
                    fit_data_receipt=second["fit_data_receipt"],
                )

    def test_unpublished_atomic_temporary_is_discarded(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = checkpoint_payload(global_epoch=5)
            publish_checkpoint(root, payload)
            (root / "last.pt.tmp").write_bytes(b"unpublished")
            (root / "last-receipt.json.tmp").write_bytes(b"unpublished")
            (root / "seed-42-final.pt.tmp").write_bytes(b"unpublished")
            (root / "seed-42-final-receipt.json.tmp").write_bytes(
                b"unpublished"
            )
            (root / "result.json.tmp").write_bytes(b"unpublished")
            self.assertEqual(runner._strength_output_state(root), "resume")
            self.assertFalse((root / "last.pt.tmp").exists())
            self.assertFalse((root / "last-receipt.json.tmp").exists())
            self.assertFalse((root / "seed-42-final.pt.tmp").exists())
            self.assertFalse(
                (root / "seed-42-final-receipt.json.tmp").exists()
            )
            self.assertFalse((root / "result.json.tmp").exists())
            loaded = runner._load_strength_last_checkpoint(
                root,
                binding=checkpoint_test_binding(),
                protocol_receipt=payload["protocol"],
                fit_data_receipt=payload["fit_data_receipt"],
            )
            self.assertEqual(loaded["global_epoch"], 5)

    def test_final_checkpoint_publish_window_regenerates_receipt(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            binding = checkpoint_test_binding()
            protocol = {"bytes": 7, "sha256": "protocol"}
            fit = {"fit": "receipt"}
            source_payload = checkpoint_payload(
                global_epoch=16, protocol=protocol, fit=fit
            )
            runner._atomic_torch_save(root / "last.pt", source_payload)
            source_last = runner._fingerprint(root / "last.pt")
            final = {
                "checkpoint_schema": (
                    runner.STRENGTH_FINAL_CHECKPOINT_SCHEMA
                ),
                **runner._checkpoint_model_metadata(
                    binding, detailed=True
                ),
                "model_variant": runner.STRENGTH_MODEL_VARIANT,
                "objective": cpv.OBJECTIVE_V2,
                "seed": 42,
                "completed_v9_epoch": 4,
                "completed_mixed_epoch": 12,
                "protocol": protocol,
                "fit_data_receipt": fit,
                "source_last_checkpoint": source_last,
                "model": source_payload["model"],
            }
            runner._atomic_torch_save(root / "seed-42-final.pt", final)
            receipts = runner._validate_frozen_strength_receipts(
                root,
                binding=binding,
                protocol_receipt=protocol,
                fit_data_receipt=fit,
                completed_global_epoch=16,
            )
            self.assertEqual([receipt["seed"] for receipt in receipts], [42])
            self.assertTrue(
                (root / "seed-42-final-receipt.json").is_file()
            )
            receipt_path = root / "seed-42-final-receipt.json"
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
            receipt["checkpoint"]["sha256"] = "0" * 64
            receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "receipt mismatch"):
                runner._validate_frozen_strength_receipts(
                    root,
                    binding=binding,
                    protocol_receipt=protocol,
                    fit_data_receipt=fit,
                    completed_global_epoch=16,
                )
            runner._atomic_json(
                receipt_path,
                runner._frozen_strength_receipt(
                    checkpoint_path := root / "seed-42-final.pt",
                    binding=binding,
                    protocol_receipt=protocol,
                    fit_data_receipt=fit,
                    seed=42,
                    source_last_checkpoint=source_last,
                ),
            )

            raw = checkpoint_path.read_bytes()
            checkpoint_path.write_bytes(raw[: len(raw) // 2])
            with self.assertRaisesRegex(ValueError, "unreadable"):
                runner._validate_frozen_strength_receipts(
                    root,
                    binding=binding,
                    protocol_receipt=protocol,
                    fit_data_receipt=fit,
                    completed_global_epoch=16,
                )

    def test_final_checkpoint_rejects_incomplete_or_wrong_source_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            binding = checkpoint_test_binding()
            protocol = {"bytes": 7, "sha256": "protocol"}
            fit = {"fit": "receipt"}
            source_payload = checkpoint_payload(
                global_epoch=16, protocol=protocol, fit=fit
            )
            runner._atomic_torch_save(root / "last.pt", source_payload)
            source_last = runner._fingerprint(root / "last.pt")
            base = {
                "checkpoint_schema": (
                    runner.STRENGTH_FINAL_CHECKPOINT_SCHEMA
                ),
                **runner._checkpoint_model_metadata(
                    binding, detailed=True
                ),
                "model_variant": runner.STRENGTH_MODEL_VARIANT,
                "objective": cpv.OBJECTIVE_V2,
                "seed": 42,
                "completed_v9_epoch": 4,
                "completed_mixed_epoch": 12,
                "protocol": protocol,
                "fit_data_receipt": fit,
                "source_last_checkpoint": source_last,
                "model": {},
            }
            runner._atomic_torch_save(root / "seed-42-final.pt", base)
            with self.assertRaisesRegex(ValueError, "state keys"):
                runner._validate_frozen_strength_receipts(
                    root,
                    binding=binding,
                    protocol_receipt=protocol,
                    fit_data_receipt=fit,
                    completed_global_epoch=16,
                )
            changed_model = {
                name: value.clone()
                for name, value in source_payload["model"].items()
            }
            changed_model["weight"].add_(1.0)
            runner._atomic_torch_save(
                root / "seed-42-final.pt",
                {**base, "model": changed_model},
            )
            with self.assertRaisesRegex(ValueError, "differs from source"):
                runner._validate_frozen_strength_receipts(
                    root,
                    binding=binding,
                    protocol_receipt=protocol,
                    fit_data_receipt=fit,
                    completed_global_epoch=16,
                )
            valid_model = source_payload["model"]
            wrong_source = {**source_last, "sha256": "f" * 64}
            runner._atomic_torch_save(
                root / "seed-42-final.pt",
                {
                    **base,
                    "source_last_checkpoint": wrong_source,
                    "model": valid_model,
                },
            )
            with self.assertRaisesRegex(ValueError, "binding mismatch"):
                runner._validate_frozen_strength_receipts(
                    root,
                    binding=binding,
                    protocol_receipt=protocol,
                    fit_data_receipt=fit,
                    completed_global_epoch=16,
                )

    def test_checkpoint_order_and_rng_mismatch_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payload = checkpoint_payload(global_epoch=4)
            payload["global_epoch"] = 3
            publish_checkpoint(root, payload)
            with self.assertRaisesRegex(ValueError, "order mismatch"):
                runner._load_strength_last_checkpoint(
                    root,
                    binding=checkpoint_test_binding(),
                    protocol_receipt=payload["protocol"],
                    fit_data_receipt=payload["fit_data_receipt"],
                )
            payload = checkpoint_payload(global_epoch=4)
            payload["mps_rng"] = torch.tensor([], dtype=torch.uint8)
            publish_checkpoint(root, payload)
            with self.assertRaisesRegex(ValueError, "RNG state"):
                runner._load_strength_last_checkpoint(
                    root,
                    binding=checkpoint_test_binding(),
                    protocol_receipt=payload["protocol"],
                    fit_data_receipt=payload["fit_data_receipt"],
                )
            payload = checkpoint_payload(global_epoch=4)
            payload["cpu_rng"] = torch.tensor([1], dtype=torch.uint8)
            publish_checkpoint(root, payload)
            with self.assertRaisesRegex(ValueError, "RNG state"):
                runner._load_strength_last_checkpoint(
                    root,
                    binding=checkpoint_test_binding(),
                    protocol_receipt=payload["protocol"],
                    fit_data_receipt=payload["fit_data_receipt"],
                )
            payload = checkpoint_payload(global_epoch=4)
            payload["optimizer"]["state"][0]["exp_avg"] = torch.zeros(2)
            publish_checkpoint(root, payload)
            with self.assertRaisesRegex(ValueError, "optimizer tensor"):
                runner._load_strength_last_checkpoint(
                    root,
                    binding=checkpoint_test_binding(),
                    protocol_receipt=payload["protocol"],
                    fit_data_receipt=payload["fit_data_receipt"],
                )

    def test_cpu_and_mps_rng_are_restored_together(self):
        cpu = torch.get_rng_state().clone()
        mps = torch.tensor([9, 8, 7], dtype=torch.uint8)
        with mock.patch.object(torch, "set_rng_state") as set_cpu, mock.patch.object(
            torch.mps, "set_rng_state", create=True
        ) as set_mps:
            runner._restore_rng_states(cpu, mps)
        set_cpu.assert_called_once()
        set_mps.assert_called_once()
        self.assertTrue(torch.equal(set_cpu.call_args.args[0], cpu))
        self.assertTrue(torch.equal(set_mps.call_args.args[0], mps))

    def test_phase1_source_never_calls_protected_scoring_or_sentinel(self):
        source = inspect.getsource(runner._run_strength_phase1)
        for forbidden in (
            "_metrics(",
            "_capacity_gate(",
            "_sentinel_gate(",
            "lowest_parent_subset(",
            "best.pt",
        ):
            self.assertNotIn(forbidden, source)
        terminal_source = inspect.getsource(
            runner._terminalize_strength_phase1
        )
        self.assertNotIn("_load_and_partition(", terminal_source)
        self.assertNotIn("Optimizer", terminal_source)

    def test_terminal_resume_dispatch_skips_full_data_verification(self):
        args = SimpleNamespace(
            protocol=str(runner.TRACKED_STRENGTH_PROTOCOL_PATH),
            out="/registered/output",
            seed=42,
            seed42_result=None,
            device="mps",
            torch_threads=0,
        )
        terminal_checkpoint = {"global_epoch": 32}
        terminal_result = {"status": "terminalized"}
        with mock.patch.object(
            torch.backends.mps, "is_available", return_value=True
        ), mock.patch.object(
            runner,
            "_strength_output_path",
            return_value=Path("/registered/output"),
        ), mock.patch.object(
            runner, "_strength_output_state", return_value="resume"
        ), mock.patch.object(
            runner,
            "_load_strength_last_checkpoint",
            return_value=terminal_checkpoint,
        ) as load_checkpoint, mock.patch.object(
            runner,
            "_terminalize_strength_phase1",
            return_value=terminal_result,
        ) as terminalize, mock.patch.object(
            runner, "_verify_protocol"
        ) as full_verify, mock.patch.object(
            runner, "_load_and_partition"
        ) as load_data:
            self.assertIs(runner.run(args), terminal_result)
        terminalize.assert_called_once()
        expected_fit = runner._fit_only_data_receipt(
            json.loads(
                runner.TRACKED_STRENGTH_PROTOCOL_PATH.read_bytes()
            )["data_receipt"]
        )
        self.assertEqual(
            load_checkpoint.call_args.kwargs["fit_data_receipt"],
            expected_fit,
        )
        full_verify.assert_not_called()
        load_data.assert_not_called()

    def test_result_is_final_only_and_keeps_all_protected_sets_locked(self):
        binding = strength_binding()
        protocol = {
            "protocol": {"bytes": 1, "sha256": "p"},
            "document": {
                "phase1_training": {
                    "success_status": (
                        "complete-phase1-two-scratch-checkpoints-frozen-"
                        "tune-locked"
                    )
                }
            },
        }
        result = runner._strength_phase1_result(
            binding=binding,
            protocol=protocol,
            fit_data_receipt={"fit": "receipt"},
            spent_v3={"weights_reused": False},
            training_curve=[],
            final_receipts=[{"seed": 42}, {"seed": 314159}],
        )
        self.assertEqual(
            result["training"]["checkpoint_selection"],
            "mixed epoch 12 final checkpoint only",
        )
        self.assertEqual(
            [row["seed"] for row in result["training"]["final_checkpoints"]],
            [42, 314159],
        )
        self.assertFalse(result["training"]["best_checkpoint_selection"])
        self.assertFalse(result["sentinel_executed"])
        self.assertFalse(result["tune_opened"])
        self.assertFalse(result["sealed_opened"])
        self.assertFalse(result["v3_weights_reused"])
        self.assertFalse(result["inter_seed_state_reused"])

    @unittest.skipUnless(
        os.environ.get("RUN_MPS_RESUME_SMOKE") == "1"
        and torch.backends.mps.is_available(),
        "explicit MPS resume smoke only",
    )
    def test_mps_checkpoint_restores_and_takes_exact_next_step(self):
        args = SimpleNamespace(
            device="mps",
            lr=3e-4,
            weight_decay=1e-4,
            temperature_cp=100.0,
            pair_gap_cp=50.0,
            best_margin_cp=50.0,
            gradient_clip=5.0,
        )
        binding = strength_binding()
        group = with_derived_children(synthetic_group("mps-resume"))
        protocol = {"bytes": 7, "sha256": "protocol"}
        fit = {"fit": "receipt"}
        spent = {"sha256": "spent"}
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            model, optimizer = runner._new_strength_model_optimizer(
                binding, args, seed=42
            )
            loss, _parts = runner._loss(
                model,
                [group],
                device="mps",
                pad_moves_to=16,
                objective=cpv.OBJECTIVE_V2,
                args=args,
            )
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            runner._save_strength_last_checkpoint(
                root,
                binding=binding,
                protocol_receipt=protocol,
                fit_data_receipt=fit,
                spent_development_evidence=spent,
                seed=42,
                phase="v9",
                completed_epoch=1,
                model=model,
                optimizer=optimizer,
                training_curve=[
                    {
                        "seed": 42,
                        "phase": "v9",
                        "epoch": 1,
                        "batches": 1,
                    }
                ],
            )
            del optimizer, model
            torch.mps.empty_cache()
            checkpoint = runner._load_strength_last_checkpoint(
                root,
                binding=binding,
                protocol_receipt=protocol,
                fit_data_receipt=fit,
            )
            self.assertEqual(
                runner._strength_next_step(checkpoint), (42, "v9", 2)
            )
            resumed, resumed_optimizer = (
                runner._resume_strength_model_optimizer(
                    binding, args, checkpoint
                )
            )
            next_loss, _parts = runner._loss(
                resumed,
                [group],
                device="mps",
                pad_moves_to=16,
                objective=cpv.OBJECTIVE_V2,
                args=args,
            )
            resumed_optimizer.zero_grad()
            next_loss.backward()
            resumed_optimizer.step()
            torch.mps.synchronize()
            self.assertTrue(torch.isfinite(next_loss).item())


if __name__ == "__main__":
    unittest.main()
