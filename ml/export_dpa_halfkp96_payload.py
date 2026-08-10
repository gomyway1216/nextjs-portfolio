#!/usr/bin/env python3
"""Export a DPA-HalfKP96 checkpoint to the fixed integer runtime payload.

The scales and byte layout are imported from the runtime reference.  They are
not searched or fitted.  Board/hand weights use signed int16 Q127, the 96
reserved first-bias int32 values are always zero, and output weights use signed
int16 Q64.  Any non-finite value or coordinate requiring int16 clipping aborts
before publication.
"""

from __future__ import annotations

import argparse
import array
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Iterable, Iterator, Sequence

import torch

from dpa_halfkp96_nnue import DpaHalfkp96NNUE, HIDDEN, PAD_INDEX
from dpa_halfkp96_runtime_int_reference import (
    ACTIVATION_SCALE,
    BOARD_FEATURES as BOARD_FEATURES_PER_BUCKET,
    HAND_FEATURES as HAND_FEATURES_PER_BUCKET,
    KING_BUCKETS,
    LAYOUT,
    OUTPUT_WEIGHT_SCALE,
)
from train_dpa_halfkp96_nnue import CHECKPOINT_FAMILY


INT16_MIN = -(2**15)
INT16_MAX = 2**15 - 1
INT32_MIN = -(2**31)
INT32_MAX = 2**31 - 1
OUTPUT_SCALE = ACTIVATION_SCALE * OUTPUT_WEIGHT_SCALE
PAYLOAD_FORMAT = "dpa-halfkp96-runtime-v1"
BOARD_ROWS = KING_BUCKETS * BOARD_FEATURES_PER_BUCKET
HAND_ROWS = KING_BUCKETS * HAND_FEATURES_PER_BUCKET
MAX_BOARD_PIECES = 40
MAX_HAND_PIECES = 38


class DpaPayloadExportError(ValueError):
    """A checkpoint cannot be represented by the fixed runtime payload."""

    def __init__(self, message: str, report: dict[str, object] | None = None):
        super().__init__(message)
        self.report = report


@dataclass(frozen=True)
class QuantizedDpaHalfkp96:
    board_w1: torch.Tensor
    hand_w1: torch.Tensor
    first_bias: torch.Tensor
    output_weight: torch.Tensor


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _quantize_i16(
    value: torch.Tensor,
    *,
    scale: int,
    name: str,
) -> tuple[torch.Tensor | None, dict[str, int | float | None]]:
    source = value.detach().cpu()
    finite = torch.isfinite(source)
    nonfinite = int((~finite).sum().item())
    finite_values = source[finite]
    rounded = torch.round(source * scale) if nonfinite == 0 else None
    below = (
        int((rounded < INT16_MIN).sum().item()) if rounded is not None else 0
    )
    above = (
        int((rounded > INT16_MAX).sum().item()) if rounded is not None else 0
    )
    stats: dict[str, int | float | None] = {
        "values": source.numel(),
        "scale": scale,
        "float_min": (
            float(finite_values.min().item()) if finite_values.numel() else None
        ),
        "float_max": (
            float(finite_values.max().item()) if finite_values.numel() else None
        ),
        "nonfinite_coordinates": nonfinite,
        "clipped_low_coordinates": below,
        "clipped_high_coordinates": above,
        "clipping_coordinates": below + above,
    }
    if nonfinite or below or above:
        return None, stats
    assert rounded is not None
    return rounded.to(torch.int16), stats


@torch.no_grad()
def quantize_model(
    model: DpaHalfkp96NNUE,
) -> tuple[QuantizedDpaHalfkp96, dict[str, object]]:
    tensors = model.deployment_tensors()
    if tuple(tensors.board_w1.shape) != (BOARD_ROWS, HIDDEN):
        raise DpaPayloadExportError("board W1 shape differs from runtime layout")
    if tuple(tensors.hand_w1.shape) != (HAND_ROWS, HIDDEN):
        raise DpaPayloadExportError("hand W1 shape differs from runtime layout")
    if tuple(tensors.output_weight.shape) != (HIDDEN,):
        raise DpaPayloadExportError("output weight shape differs from runtime layout")
    if bool(torch.any(model.first_bias.detach().cpu() != 0)):
        raise DpaPayloadExportError("checkpoint first_bias must be identically zero")

    board, board_stats = _quantize_i16(
        tensors.board_w1,
        scale=ACTIVATION_SCALE,
        name="board_w1",
    )
    hand, hand_stats = _quantize_i16(
        tensors.hand_w1,
        scale=ACTIVATION_SCALE,
        name="hand_w1",
    )
    output, output_stats = _quantize_i16(
        tensors.output_weight,
        scale=OUTPUT_WEIGHT_SCALE,
        name="output_weight",
    )
    quantization: dict[str, object] = {
        "fixed_scales": {
            "first_layer": ACTIVATION_SCALE,
            "activation": ACTIVATION_SCALE,
            "output_weight": OUTPUT_WEIGHT_SCALE,
            "dequantized_output_denominator": OUTPUT_SCALE,
        },
        "board_w1": board_stats,
        "hand_w1": hand_stats,
        "first_bias": {
            "values": HIDDEN,
            "dtype": "int32",
            "fixed_zero": True,
            "nonzero_coordinates": 0,
        },
        "output_weight": output_stats,
    }
    clipping = sum(
        int(stats["clipping_coordinates"])
        for stats in (board_stats, hand_stats, output_stats)
    )
    nonfinite = sum(
        int(stats["nonfinite_coordinates"])
        for stats in (board_stats, hand_stats, output_stats)
    )
    quantization["clipping_coordinates_total"] = clipping
    quantization["nonfinite_coordinates_total"] = nonfinite
    if clipping or nonfinite:
        report = {
            "format": PAYLOAD_FORMAT,
            "status": "fail",
            "quantization": quantization,
        }
        raise DpaPayloadExportError(
            "fixed quantization requires clipping or contains non-finite values",
            report,
        )
    assert board is not None and hand is not None and output is not None
    return (
        QuantizedDpaHalfkp96(
            board_w1=board.contiguous(),
            hand_w1=hand.contiguous(),
            first_bias=torch.zeros(HIDDEN, dtype=torch.int32),
            output_weight=output.contiguous(),
        ),
        quantization,
    )


def _validated_payload(q: QuantizedDpaHalfkp96) -> None:
    if q.board_w1.dtype != torch.int16 or tuple(q.board_w1.shape) != (
        BOARD_ROWS,
        HIDDEN,
    ):
        raise DpaPayloadExportError("quantized board W1 is malformed")
    if q.hand_w1.dtype != torch.int16 or tuple(q.hand_w1.shape) != (
        HAND_ROWS,
        HIDDEN,
    ):
        raise DpaPayloadExportError("quantized hand W1 is malformed")
    if q.first_bias.dtype != torch.int32 or tuple(q.first_bias.shape) != (HIDDEN,):
        raise DpaPayloadExportError("quantized first bias is malformed")
    if bool(torch.any(q.first_bias != 0)):
        raise DpaPayloadExportError("quantized first bias is not zero")
    if q.output_weight.dtype != torch.int16 or tuple(q.output_weight.shape) != (
        HIDDEN,
    ):
        raise DpaPayloadExportError("quantized output weight is malformed")


@torch.no_grad()
def integer_forward(
    q: QuantizedDpaHalfkp96,
    board_indices: torch.Tensor,
    hands: torch.Tensor,
    buckets: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Return raw Q8128 outputs and raw first-layer accumulators on CPU."""

    _validated_payload(q)
    if board_indices.ndim != 3 or tuple(board_indices.shape[1:]) != (
        2,
        MAX_BOARD_PIECES,
    ):
        raise DpaPayloadExportError("parity board input must be (batch,2,40)")
    if hands.ndim != 3 or tuple(hands.shape[1:]) != (2, 14):
        raise DpaPayloadExportError("parity hand input must be (batch,2,14)")
    if buckets.ndim != 2 or tuple(buckets.shape[1:]) != (2,):
        raise DpaPayloadExportError("parity bucket input must be (batch,2)")
    board = board_indices.detach().cpu().long()
    hand_counts = hands.detach().cpu()
    bucket = buckets.detach().cpu().long()
    if not bool(torch.all(hand_counts == torch.round(hand_counts))):
        raise DpaPayloadExportError("runtime hand counts must be integral")
    hand_counts = hand_counts.long()
    if bool(torch.any((hand_counts < 0) | (hand_counts > 18))) or bool(
        torch.any(hand_counts.sum(dim=2) > MAX_HAND_PIECES)
    ):
        raise DpaPayloadExportError("runtime hand inventory is out of range")
    if bool(torch.any((board < 0) | (board > PAD_INDEX))):
        raise DpaPayloadExportError("parity board index is out of range")
    if bool(torch.any((bucket < 0) | (bucket >= 81))):
        raise DpaPayloadExportError("parity bucket is out of range")

    batch = board.shape[0]
    flat_board = board.reshape(batch * 2, MAX_BOARD_PIECES)
    active = flat_board != PAD_INDEX
    safe = torch.where(active, flat_board, torch.zeros_like(flat_board))
    board_sum = (
        q.board_w1[safe].long() * active.unsqueeze(-1)
    ).sum(dim=1)
    flat_hands = hand_counts.reshape(batch * 2, 14)
    flat_buckets = bucket.reshape(batch * 2)
    hand_sum = (
        q.hand_w1.reshape(
            KING_BUCKETS, HAND_FEATURES_PER_BUCKET, HIDDEN
        )[flat_buckets].long()
        * flat_hands.unsqueeze(-1)
    ).sum(dim=1)
    accumulators = (
        board_sum + hand_sum + q.first_bias.long()
    ).reshape(batch, 2, HIDDEN)
    clipped = torch.clamp(accumulators, 0, ACTIVATION_SCALE)
    raw_output = (
        (clipped[:, 0] - clipped[:, 1]) * q.output_weight.long()
    ).sum(dim=1)
    return raw_output, accumulators


@torch.no_grad()
def float_integer_parity_report(
    model: DpaHalfkp96NNUE,
    q: QuantizedDpaHalfkp96,
    batches: Iterable[tuple[torch.Tensor, torch.Tensor, torch.Tensor]],
) -> dict[str, int | float | None]:
    """Compare float outputs with payload-exact integer outputs."""

    model = model.cpu().eval()
    absolute_errors: list[torch.Tensor] = []
    accumulator_overflow = 0
    output_overflow = 0
    samples = 0
    accumulator_min: int | None = None
    accumulator_max: int | None = None
    raw_output_min: int | None = None
    raw_output_max: int | None = None
    for board, hands, buckets in batches:
        float_output = model(board.cpu(), hands.cpu(), buckets.cpu())
        raw_output, accumulators = integer_forward(q, board, hands, buckets)
        integer_output = raw_output.to(torch.float64) / OUTPUT_SCALE
        absolute_errors.append(
            (float_output.to(torch.float64) - integer_output).abs()
        )
        samples += int(raw_output.numel())
        accumulator_overflow += int(
            ((accumulators < INT32_MIN) | (accumulators > INT32_MAX)).sum()
        )
        output_overflow += int(
            ((raw_output < INT32_MIN) | (raw_output > INT32_MAX)).sum()
        )
        local_acc_min = int(accumulators.min())
        local_acc_max = int(accumulators.max())
        local_out_min = int(raw_output.min())
        local_out_max = int(raw_output.max())
        accumulator_min = (
            local_acc_min
            if accumulator_min is None
            else min(accumulator_min, local_acc_min)
        )
        accumulator_max = (
            local_acc_max
            if accumulator_max is None
            else max(accumulator_max, local_acc_max)
        )
        raw_output_min = (
            local_out_min
            if raw_output_min is None
            else min(raw_output_min, local_out_min)
        )
        raw_output_max = (
            local_out_max
            if raw_output_max is None
            else max(raw_output_max, local_out_max)
        )
    if absolute_errors:
        errors = torch.cat(absolute_errors)
        mean_error: float | None = float(errors.mean())
        maximum_error: float | None = float(errors.max())
    else:
        mean_error = maximum_error = None
    theoretical_first_layer_abs_max = (
        MAX_BOARD_PIECES + MAX_HAND_PIECES
    ) * INT16_MAX
    theoretical_output_abs_max = HIDDEN * INT16_MAX * ACTIVATION_SCALE
    theoretical_overflows = int(
        theoretical_first_layer_abs_max > INT32_MAX
    ) + int(theoretical_output_abs_max > INT32_MAX)
    return {
        "samples": samples,
        "float_vs_integer_mean_abs": mean_error,
        "float_vs_integer_max_abs": maximum_error,
        "accumulator_min": accumulator_min,
        "accumulator_max": accumulator_max,
        "raw_output_min": raw_output_min,
        "raw_output_max": raw_output_max,
        "sampled_accumulator_int32_overflows": accumulator_overflow,
        "sampled_output_int32_overflows": output_overflow,
        "theoretical_first_layer_abs_max": theoretical_first_layer_abs_max,
        "theoretical_first_layer_fits_int32": (
            theoretical_first_layer_abs_max <= INT32_MAX
        ),
        "theoretical_output_abs_max": theoretical_output_abs_max,
        "theoretical_output_fits_int32": theoretical_output_abs_max <= INT32_MAX,
        "integer_overflow_count": (
            accumulator_overflow + output_overflow + theoretical_overflows
        ),
    }


def _write_integer_tensor(
    target,
    tensor: torch.Tensor,
    typecode: str,
    *,
    chunk_elements: int = 262_144,
) -> None:
    flat = tensor.detach().cpu().contiguous().view(-1)
    expected_size = 2 if typecode == "h" else 4 if typecode == "i" else None
    if expected_size is None:
        raise DpaPayloadExportError("unsupported integer payload type")
    for start in range(0, flat.numel(), chunk_elements):
        values = array.array(
            typecode, flat[start : start + chunk_elements].tolist()
        )
        if values.itemsize != expected_size:
            raise DpaPayloadExportError("host integer width differs from payload")
        if sys.byteorder == "big":
            values.byteswap()
        target.write(values.tobytes())


def _write_payload(path: Path, q: QuantizedDpaHalfkp96) -> None:
    with path.open("xb") as target:
        _write_integer_tensor(target, q.board_w1, "h")
        _write_integer_tensor(target, q.hand_w1, "h")
        _write_integer_tensor(target, q.first_bias, "i")
        _write_integer_tensor(target, q.output_weight, "h")
        target.flush()
        os.fsync(target.fileno())
    if path.stat().st_size != LAYOUT.total_bytes:
        raise DpaPayloadExportError("serialized payload length differs from runtime")


def _write_json(path: Path, value: dict[str, object]) -> None:
    raw = (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False)
        + "\n"
    ).encode("utf-8")
    with path.open("xb") as target:
        target.write(raw)
        target.flush()
        os.fsync(target.fileno())


def _publish_pair(
    payload_path: Path,
    report_path: Path,
    payload_temp: Path,
    report_temp: Path,
) -> None:
    payload_linked = False
    try:
        os.link(payload_temp, payload_path)
        payload_linked = True
        os.link(report_temp, report_path)
    except OSError as error:
        if payload_linked:
            payload_path.unlink(missing_ok=True)
        raise FileExistsError("refusing to overwrite export artifact") from error
    finally:
        payload_temp.unlink(missing_ok=True)
        report_temp.unlink(missing_ok=True)
    for parent in {payload_path.parent, report_path.parent}:
        descriptor = os.open(parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def _load_model(checkpoint: Path) -> DpaHalfkp96NNUE:
    payload = torch.load(checkpoint, map_location="cpu", weights_only=False)
    if not isinstance(payload, dict) or payload.get("family") != CHECKPOINT_FAMILY:
        raise DpaPayloadExportError("checkpoint family mismatch")
    model = DpaHalfkp96NNUE()
    try:
        model.load_state_dict(payload["model"], strict=True)
    except (KeyError, RuntimeError) as error:
        raise DpaPayloadExportError("checkpoint model state mismatch") from error
    if payload.get("deployment_contract") != model.deployment_contract():
        raise DpaPayloadExportError("checkpoint deployment contract mismatch")
    return model.eval()


def export_checkpoint(
    checkpoint: Path,
    payload_path: Path,
    report_path: Path,
    *,
    parity_batches: Iterable[
        tuple[torch.Tensor, torch.Tensor, torch.Tensor]
    ] = (),
) -> dict[str, object]:
    """Quantize, verify, then atomically create the payload/report artifacts."""

    checkpoint = checkpoint.resolve()
    payload_path = payload_path.resolve()
    report_path = report_path.resolve()
    if payload_path == report_path:
        raise DpaPayloadExportError("payload and report paths must differ")
    if payload_path.exists() or report_path.exists():
        raise FileExistsError("export artifacts are create-only")
    if not checkpoint.is_file():
        raise FileNotFoundError(checkpoint)

    model = _load_model(checkpoint)
    q, quantization = quantize_model(model)
    parity = float_integer_parity_report(model, q, parity_batches)
    if int(parity["integer_overflow_count"]) != 0:
        raise DpaPayloadExportError("integer parity evaluation overflowed")

    payload_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    payload_temp = payload_path.with_name(f".{payload_path.name}.{os.getpid()}.tmp")
    report_temp = report_path.with_name(f".{report_path.name}.{os.getpid()}.tmp")
    try:
        _write_payload(payload_temp, q)
        payload_identity = {
            "path": str(payload_path),
            "bytes": payload_temp.stat().st_size,
            "sha256": file_sha256(payload_temp),
        }
        report: dict[str, object] = {
            "format": PAYLOAD_FORMAT,
            "status": "pass",
            "checkpoint": {
                "path": str(checkpoint),
                "bytes": checkpoint.stat().st_size,
                "sha256": file_sha256(checkpoint),
            },
            "payload": payload_identity,
            "layout": {
                "board_w1": LAYOUT.board_w1,
                "hand_w1": LAYOUT.hand_w1,
                "first_bias": LAYOUT.first_bias,
                "output_weight": LAYOUT.output_weight,
                "total_bytes": LAYOUT.total_bytes,
            },
            "quantization": quantization,
            "parity": parity,
        }
        _write_json(report_temp, report)
        _publish_pair(payload_path, report_path, payload_temp, report_temp)
        return report
    finally:
        payload_temp.unlink(missing_ok=True)
        report_temp.unlink(missing_ok=True)


def parity_batches_from_jsonl(
    path: Path,
    *,
    maximum: int,
    batch_size: int = 256,
) -> Iterator[tuple[torch.Tensor, torch.Tensor, torch.Tensor]]:
    """Stream compact ``{sfen}`` rows into bounded parity batches."""

    from train_dpa_halfkp96_nnue import TrainingExample, collate_examples

    pending: list[TrainingExample] = []
    seen = 0
    with path.open("r", encoding="utf-8") as source:
        for line_number, line in enumerate(source, 1):
            if seen == maximum:
                break
            try:
                record = json.loads(line)
            except json.JSONDecodeError as error:
                raise DpaPayloadExportError(
                    f"parity line {line_number} is invalid JSON"
                ) from error
            if not isinstance(record, dict) or not isinstance(record.get("sfen"), str):
                raise DpaPayloadExportError(
                    f"parity line {line_number} needs a string sfen"
                )
            pending.append(
                TrainingExample(sfen=record["sfen"], cp=0, source="parity")
            )
            seen += 1
            if len(pending) == batch_size:
                batch = collate_examples(pending)
                yield batch.board_indices, batch.hands, batch.buckets
                pending.clear()
    if pending:
        batch = collate_examples(pending)
        yield batch.board_indices, batch.hands, batch.buckets


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--payload", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--verify-jsonl", type=Path)
    parser.add_argument("--verify-rows", type=int, default=1024)
    args = parser.parse_args(argv)
    if args.verify_rows < 0:
        parser.error("--verify-rows must be non-negative")
    batches: Iterable[tuple[torch.Tensor, torch.Tensor, torch.Tensor]] = ()
    if args.verify_jsonl is not None:
        batches = parity_batches_from_jsonl(
            args.verify_jsonl, maximum=args.verify_rows
        )
    try:
        report = export_checkpoint(
            args.checkpoint,
            args.payload,
            args.report,
            parity_batches=batches,
        )
    except DpaPayloadExportError as error:
        failure = error.report or {"status": "fail", "error": str(error)}
        print(json.dumps(failure, sort_keys=True, allow_nan=False))
        return 1
    print(json.dumps(report, sort_keys=True, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
