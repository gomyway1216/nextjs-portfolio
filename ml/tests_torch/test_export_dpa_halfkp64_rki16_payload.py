import hashlib
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import unittest

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from dpa_halfkp64_rki16_nnue import (  # noqa: E402
    DpaHalfkp64Rki16NNUE,
    HIDDEN,
    PAD_INDEX,
)
from dpa_halfkp64_rki16_runtime_int_reference import LAYOUT  # noqa: E402
from export_dpa_halfkp64_rki16_payload import (  # noqa: E402
    DpaPayloadExportError,
    export_checkpoint,
)
from train_dpa_halfkp64_rki16_nnue import (  # noqa: E402
    LEARNING_RATE,
    WEIGHT_DECAY,
    save_checkpoint,
)


def exact_fixture_model() -> DpaHalfkp64Rki16NNUE:
    model = DpaHalfkp64Rki16NNUE()
    with torch.no_grad():
        model.board_w1.zero_()
        model.hand_w1.zero_()
        model.output_weight.zero_()
        model.relative_self.zero_()
        model.relative_other.zero_()
        model.relative_output.zero_()
        model.first_bias.zero_()
        model.board_w1[0, 0] = 64.0 / 127.0
        model.board_w1[1, 0] = 32.0 / 127.0
        model.output_weight[0] = 96.0 / 64.0
    return model


def fixture_batch():
    board = torch.full((2, 2, 40), PAD_INDEX, dtype=torch.long)
    board[0, 0, 0] = 0
    board[0, 1, 0] = 1
    board[1, 0, 0] = 1
    board[1, 1, 0] = 0
    hands = torch.zeros((2, 2, 14), dtype=torch.float32)
    buckets = torch.zeros((2, 2), dtype=torch.long)
    return board, hands, buckets


def save_fixture(path: Path, model: DpaHalfkp64Rki16NNUE) -> None:
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY
    )
    save_checkpoint(path, model, optimizer, epoch=1)


class ExportDpaHalfkp64Rki16PayloadTests(unittest.TestCase):
    def test_exact_layout_zero_bias_create_only_and_parity_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            checkpoint = root / "synthetic.pt"
            payload = root / "weights.bin"
            report_path = root / "weights.report.json"
            save_fixture(checkpoint, exact_fixture_model())
            report = export_checkpoint(
                checkpoint,
                payload,
                report_path,
                parity_batches=(fixture_batch(),),
            )

            self.assertEqual(report["status"], "pass")
            self.assertEqual(payload.stat().st_size, LAYOUT.total_bytes)
            self.assertEqual(
                report["payload"]["sha256"],
                hashlib.sha256(payload.read_bytes()).hexdigest(),
            )
            self.assertEqual(
                report["quantization"]["clipping_coordinates_total"], 0
            )
            self.assertEqual(
                report["quantization"]["nonfinite_coordinates_total"], 0
            )
            self.assertEqual(report["parity"]["samples"], 2)
            self.assertEqual(report["parity"]["integer_overflow_count"], 0)
            self.assertLess(
                report["parity"]["float_vs_integer_max_abs"], 1e-6
            )
            self.assertEqual(json.loads(report_path.read_text()), report)

            raw = payload.read_bytes()
            self.assertEqual(struct.unpack_from("<h", raw, 0)[0], 64)
            self.assertEqual(
                struct.unpack_from("<h", raw, HIDDEN * 2)[0], 32
            )
            self.assertFalse(any(raw[LAYOUT.first_bias : LAYOUT.output_weight]))
            self.assertEqual(
                struct.unpack_from("<h", raw, LAYOUT.output_weight)[0], 96
            )
            self.assertFalse(any(raw[LAYOUT.relative_self :]))
            original_payload_sha = hashlib.sha256(raw).hexdigest()
            original_report_sha = hashlib.sha256(report_path.read_bytes()).hexdigest()
            with self.assertRaises(FileExistsError):
                export_checkpoint(
                    checkpoint,
                    payload,
                    report_path,
                    parity_batches=(fixture_batch(),),
                )
            self.assertEqual(
                hashlib.sha256(payload.read_bytes()).hexdigest(),
                original_payload_sha,
            )
            self.assertEqual(
                hashlib.sha256(report_path.read_bytes()).hexdigest(),
                original_report_sha,
            )

    def test_clipping_fails_before_any_artifact_is_published(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            checkpoint = root / "overflow.pt"
            payload = root / "weights.bin"
            report_path = root / "weights.report.json"
            model = exact_fixture_model()
            with torch.no_grad():
                model.output_weight[1] = 40_000.0 / 64.0
            save_fixture(checkpoint, model)
            with self.assertRaises(DpaPayloadExportError) as captured:
                export_checkpoint(
                    checkpoint,
                    payload,
                    report_path,
                    parity_batches=(fixture_batch(),),
                )
            self.assertIsNotNone(captured.exception.report)
            self.assertEqual(captured.exception.report["status"], "fail")
            self.assertEqual(
                captured.exception.report["quantization"][
                    "clipping_coordinates_total"
                ],
                1,
            )
            self.assertFalse(payload.exists())
            self.assertFalse(report_path.exists())


if __name__ == "__main__":
    unittest.main()
