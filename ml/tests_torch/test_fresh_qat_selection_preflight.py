import io
from pathlib import Path
import sys
import unittest

import torch


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import fresh_qat_protocol as FRESH  # noqa: E402
import fresh_qat_selection_preflight as PREFLIGHT  # noqa: E402
from train import DistillNet  # noqa: E402


class FreshQatSelectionTorchPreflightTests(unittest.TestCase):
    def test_fixed_loader_and_model_validator_use_captured_checkpoint_bytes(self):
        model = DistillNet("board")
        buffer = io.BytesIO()
        torch.save(
            {
                "schema": FRESH.FRESH_QAT_FINAL_CHECKPOINT_SCHEMA,
                "model": model.state_dict(),
            },
            buffer,
        )
        raw = buffer.getvalue()

        checkpoint = PREFLIGHT._torch_checkpoint_loader(raw)
        self.assertEqual(
            checkpoint["schema"],
            FRESH.FRESH_QAT_FINAL_CHECKPOINT_SCHEMA,
        )
        PREFLIGHT._torch_strict_model_validator(checkpoint["model"], 42)

        for invalid in (bytearray(raw), "/tmp/not-checkpoint-bytes"):
            with self.subTest(type=type(invalid).__name__), self.assertRaisesRegex(
                ValueError,
                "cannot strict-load fresh final checkpoint",
            ):
                PREFLIGHT._torch_checkpoint_loader(invalid)


if __name__ == "__main__":
    unittest.main()
