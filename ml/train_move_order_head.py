#!/usr/bin/env python3
"""Train one bounded, evaluator-independent move-ordering head."""

from __future__ import annotations

import argparse
import array
import hashlib
import io
import json
import math
import os
from pathlib import Path
import random
import time

import torch

import move_order_head as head


PROTOCOL_SCHEMA = "shogi-move-order-head-plan-v1"
RESULT_SCHEMA = "shogi-move-order-head-training-result-v1"


def _strict_json_file(path: str | Path) -> dict[str, object]:
    raw = Path(path).read_bytes()

    def reject_constant(value: str) -> None:
        raise ValueError(f"{path}: invalid JSON constant {value}")

    value = json.loads(raw, parse_constant=reject_constant)
    if type(value) is not dict:
        raise ValueError(f"{path}: expected a JSON object")
    return value


def _atomic_json(path: Path, value: dict[str, object]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def _protocol_receipt(args: argparse.Namespace) -> dict[str, object]:
    protocol_path = Path(args.protocol)
    protocol = _strict_json_file(protocol_path)
    if protocol.get("schema") != PROTOCOL_SCHEMA:
        raise ValueError("move-order protocol schema mismatch")
    inputs = protocol.get("inputs")
    training = protocol.get("training")
    gates = protocol.get("static_gates")
    if (
        type(inputs) is not dict
        or type(training) is not dict
        or type(gates) is not dict
    ):
        raise ValueError("move-order protocol is missing inputs, training, or gates")

    bindings = {
        "training": args.data,
        "validation": args.val_data,
        "external_validation": args.external_val_data,
    }
    verified_inputs: dict[str, object] = {}
    for role, path in bindings.items():
        expected = inputs.get(role)
        if type(expected) is not dict:
            raise ValueError(f"protocol input {role} is absent")
        actual = head.file_fingerprint(path)
        if actual["sha256"] != expected.get("sha256") or actual[
            "bytes"
        ] != expected.get("bytes"):
            raise ValueError(f"protocol input {role} identity mismatch")
        verified_inputs[role] = actual

    exact = {
        "epochs": args.epochs,
        "batch": args.batch,
        "learning_rate": args.lr,
        "temperature_cp": args.temperature_cp,
        "pair_gap_cp": args.pair_gap_cp,
        "pair_weight": args.pair_weight,
        "tune_modulus": args.tune_modulus,
        "seed": args.seed,
        "hash_buckets": head.BUCKETS,
    }
    for key, actual in exact.items():
        expected = training.get(key)
        if type(actual) is not type(expected) or actual != expected:
            raise ValueError(
                f"protocol training mismatch for {key}: expected {expected!r}, got {actual!r}"
            )
    protocol_raw = protocol_path.read_bytes()
    return {
        "protocol": {
            "path": str(protocol_path.resolve()),
            "bytes": len(protocol_raw),
            "sha256": hashlib.sha256(protocol_raw).hexdigest(),
        },
        "inputs": verified_inputs,
        "static_gates": gates,
    }


def _split_fit_tune(
    groups: list[head.ParentGroup], *, seed: int, modulus: int
) -> tuple[list[head.ParentGroup], list[head.ParentGroup]]:
    if modulus < 3:
        raise ValueError("tune modulus must be at least three")
    fit: list[head.ParentGroup] = []
    tune: list[head.ParentGroup] = []
    tune_games: dict[str, bool] = {}
    for group in groups:
        if group.game_id not in tune_games:
            digest = hashlib.sha256(f"{seed}:{group.game_id}".encode()).digest()
            tune_games[group.game_id] = int.from_bytes(digest[:8], "big") % modulus == 0
        target = tune if tune_games[group.game_id] else fit
        target.append(group)
    if not fit or not tune:
        raise ValueError("deterministic fit/tune split is empty")
    return fit, tune


def _selection_key(metrics: dict[str, float | int]) -> tuple[float, float, float]:
    return (
        float(metrics["top1_accuracy"]),
        float(metrics["pair_accuracy"]),
        -float(metrics["mean_regret_cp"]),
    )


def _overlap_summary(
    left: list[head.ParentGroup], right: list[head.ParentGroup]
) -> dict[str, int]:
    fields = ("game_id", "parent_id", "position_id", "parent_sfen")
    return {
        field: len(
            {getattr(group, field) for group in left}
            & {getattr(group, field) for group in right}
        )
        for field in fields
    }


def _train_one_epoch(
    model: head.MoveOrderHead,
    optimizer: torch.optim.Optimizer,
    groups: list[head.ParentGroup],
    *,
    epoch_seed: int,
    batch_size: int,
    device: str,
    temperature_cp: float,
    pair_gap_cp: float,
    pair_weight: float,
) -> dict[str, float]:
    shuffled = list(groups)
    random.Random(epoch_seed).shuffle(shuffled)
    model.train()
    loss_sum = 0.0
    listwise_sum = 0.0
    pairwise_sum = 0.0
    batches = 0
    for start in range(0, len(shuffled), batch_size):
        batch_groups = shuffled[start : start + batch_size]
        indices, signs, teacher_cp, valid = head.make_batch(batch_groups, device)
        logits = model(indices, signs)
        loss, parts = head.listwise_pair_loss(
            logits,
            teacher_cp,
            valid,
            temperature_cp=temperature_cp,
            pair_gap_cp=pair_gap_cp,
            pair_weight=pair_weight,
        )
        if not bool(torch.isfinite(loss).item()):
            raise ValueError("training produced a non-finite loss")
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        loss_sum += float(loss.detach().cpu().item())
        listwise_sum += parts["listwise_loss"]
        pairwise_sum += parts["pairwise_loss"]
        batches += 1
    return {
        "loss": loss_sum / batches,
        "listwise_loss": listwise_sum / batches,
        "pairwise_loss": pairwise_sum / batches,
    }


def _quantize_and_export(
    model: head.MoveOrderHead,
    out_dir: Path,
) -> tuple[head.MoveOrderHead, dict[str, object]]:
    weights = model.weights.weight.detach().cpu()[1:, 0]
    maximum = float(weights.abs().max().item())
    scale = 4096 if maximum == 0 else min(4096, max(1, math.floor(32760 / maximum)))
    quantized = torch.round(weights * scale).clamp(-32768, 32767).to(torch.int16)
    values = array.array("h", quantized.tolist())
    if values.itemsize != 2:
        raise RuntimeError("unexpected int16 array item size")
    if os.sys.byteorder == "big":
        values.byteswap()
    artifact = out_dir / "weights.bin"
    artifact.write_bytes(values.tobytes())

    restored = head.MoveOrderHead()
    with torch.no_grad():
        restored.weights.weight.zero_()
        restored.weights.weight[1:, 0].copy_(quantized.to(torch.float32) / scale)
    metadata = {
        "schema": head.SCHEMA,
        "feature_version": head.FEATURE_VERSION,
        "hash": "signed FNV-1a plus 32-bit avalanche",
        "buckets": head.BUCKETS,
        "dtype": "int16 little-endian",
        "scale": scale,
        "bytes": artifact.stat().st_size,
        "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
        "maximum_float_weight": maximum,
    }
    _atomic_json(out_dir / "weights.meta.json", metadata)
    return restored, metadata


def _validate_args(args: argparse.Namespace) -> None:
    if args.epochs < 1 or args.batch < 1 or args.seed < 0:
        raise ValueError("epochs, batch, and seed must be valid positive controls")
    for name in ("lr", "temperature_cp", "pair_gap_cp"):
        value = getattr(args, name)
        if not math.isfinite(value) or value <= 0:
            raise ValueError(f"{name} must be finite and positive")
    if not math.isfinite(args.pair_weight) or args.pair_weight < 0:
        raise ValueError("pair_weight must be finite and non-negative")


def run(args: argparse.Namespace) -> dict[str, object]:
    _validate_args(args)
    out_dir = Path(args.out)
    if out_dir.exists():
        raise ValueError(f"output already exists: {out_dir}")
    protocol = _protocol_receipt(args)
    device = args.device
    if device == "auto":
        device = (
            "cuda"
            if torch.cuda.is_available()
            else "mps" if torch.backends.mps.is_available() else "cpu"
        )
    if device == "mps" and not torch.backends.mps.is_available():
        raise ValueError("MPS was requested but is unavailable")
    if device == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA was requested but is unavailable")

    torch.manual_seed(args.seed)
    random.seed(args.seed)
    if args.torch_threads:
        torch.set_num_threads(args.torch_threads)

    load_started = time.monotonic()
    training_groups, training_source = head.load_groups(args.data, "train")
    validation_groups, validation_source = head.load_groups(args.val_data, "val")
    external_groups, external_source = head.load_groups(args.external_val_data, None)
    for role, source in (
        ("training", training_source),
        ("validation", validation_source),
        ("external_validation", external_source),
    ):
        expected = protocol["inputs"][role]
        if (
            source["sha256"] != expected["sha256"]
            or source["bytes"] != expected["bytes"]
        ):
            raise ValueError(f"{role} changed while it was loaded")
    train_validation_overlap = _overlap_summary(training_groups, validation_groups)
    if any(train_validation_overlap.values()):
        raise ValueError(
            "training and validation overlap: "
            + json.dumps(train_validation_overlap, sort_keys=True)
        )
    external_overlap = {
        "training": _overlap_summary(training_groups, external_groups),
        "validation": _overlap_summary(validation_groups, external_groups),
    }
    fit_groups, tune_groups = _split_fit_tune(
        training_groups, seed=args.seed, modulus=args.tune_modulus
    )
    load_seconds = time.monotonic() - load_started

    model = head.MoveOrderHead().to(device)
    baseline_validation = head.score_groups(
        model,
        validation_groups,
        device=device,
        batch_size=args.batch,
        pair_gap_cp=args.pair_gap_cp,
        temperature_cp=args.temperature_cp,
    )
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1.0e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    curve: list[dict[str, object]] = []
    best_key = (float("-inf"), float("-inf"), float("-inf"))
    best_state = None
    best_epoch = None

    for epoch in range(1, args.epochs + 1):
        started = time.monotonic()
        losses = _train_one_epoch(
            model,
            optimizer,
            fit_groups,
            epoch_seed=args.seed + epoch,
            batch_size=args.batch,
            device=device,
            temperature_cp=args.temperature_cp,
            pair_gap_cp=args.pair_gap_cp,
            pair_weight=args.pair_weight,
        )
        scheduler.step()
        tune_metrics = head.score_groups(
            model,
            tune_groups,
            device=device,
            batch_size=args.batch,
            pair_gap_cp=args.pair_gap_cp,
            temperature_cp=args.temperature_cp,
        )
        key = _selection_key(tune_metrics)
        if key > best_key:
            best_key = key
            best_epoch = epoch
            best_state = {
                name: tensor.detach().cpu().clone()
                for name, tensor in model.state_dict().items()
            }
        row = {
            "epoch": epoch,
            "learning_rate": scheduler.get_last_lr()[0],
            **losses,
            "tune": tune_metrics,
            "seconds": time.monotonic() - started,
        }
        curve.append(row)
        print(json.dumps(row, sort_keys=True), flush=True)

    if best_state is None or best_epoch is None:
        raise RuntimeError("training did not select a checkpoint")
    selected_tune_state = best_state
    model = head.MoveOrderHead().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1.0e-4)
    refit_scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=best_epoch
    )
    refit_curve: list[dict[str, object]] = []
    for epoch in range(1, best_epoch + 1):
        started = time.monotonic()
        losses = _train_one_epoch(
            model,
            optimizer,
            training_groups,
            epoch_seed=args.seed + 100_000 + epoch,
            batch_size=args.batch,
            device=device,
            temperature_cp=args.temperature_cp,
            pair_gap_cp=args.pair_gap_cp,
            pair_weight=args.pair_weight,
        )
        refit_scheduler.step()
        refit_curve.append(
            {
                "epoch": epoch,
                "learning_rate": refit_scheduler.get_last_lr()[0],
                **losses,
                "seconds": time.monotonic() - started,
            }
        )
    out_dir.mkdir(parents=True)
    refit_state = {
        name: tensor.detach().cpu().clone()
        for name, tensor in model.state_dict().items()
    }
    selection_buffer = io.BytesIO()
    torch.save(selected_tune_state["weights.weight"], selection_buffer)
    checkpoint = {
        "schema": head.SCHEMA,
        "feature_version": head.FEATURE_VERSION,
        "buckets": head.BUCKETS,
        "model": refit_state,
        "best_epoch": best_epoch,
        "selection_state_sha256": hashlib.sha256(
            selection_buffer.getvalue()
        ).hexdigest(),
        "protocol": protocol,
        "sources": {
            "training": training_source,
            "validation": validation_source,
            "external_validation": external_source,
        },
    }
    torch.save(checkpoint, out_dir / "best.pt")

    float_validation = head.score_groups(
        model,
        validation_groups,
        device=device,
        batch_size=args.batch,
        pair_gap_cp=args.pair_gap_cp,
        temperature_cp=args.temperature_cp,
    )
    float_external = head.score_groups(
        model,
        external_groups,
        device=device,
        batch_size=args.batch,
        pair_gap_cp=args.pair_gap_cp,
        temperature_cp=args.temperature_cp,
    )
    quantized_model, export = _quantize_and_export(model, out_dir)
    quantized_model = quantized_model.to(device)
    quantized_validation = head.score_groups(
        quantized_model,
        validation_groups,
        device=device,
        batch_size=args.batch,
        pair_gap_cp=args.pair_gap_cp,
        temperature_cp=args.temperature_cp,
    )
    quantized_external = head.score_groups(
        quantized_model,
        external_groups,
        device=device,
        batch_size=args.batch,
        pair_gap_cp=args.pair_gap_cp,
        temperature_cp=args.temperature_cp,
    )

    gates = protocol["static_gates"]
    if type(gates) is not dict:
        raise AssertionError("protocol gates disappeared")
    checks = {
        "validation_top1": {
            "observed": quantized_validation["top1_accuracy"],
            "required_minimum": gates["minimum_validation_top1"],
        },
        "validation_top1_correct": {
            "observed": quantized_validation["top1_correct"],
            "required_minimum": gates["minimum_validation_top1_correct"],
        },
        "validation_pair": {
            "observed": quantized_validation["pair_accuracy"],
            "required_minimum": gates["minimum_validation_pair_accuracy"],
        },
        "quantized_top1_non_regression": {
            "observed_parent_loss": int(float_validation["top1_correct"])
            - int(quantized_validation["top1_correct"]),
            "allowed_maximum": gates["maximum_quantized_top1_parent_loss"],
        },
        "quantized_pair_non_regression": {
            "observed_drop": float(float_validation["pair_accuracy"])
            - float(quantized_validation["pair_accuracy"]),
            "allowed_maximum": gates["maximum_quantized_pair_drop"],
        },
        "artifact_bytes": {
            "observed": export["bytes"],
            "allowed_maximum": gates["maximum_artifact_bytes"],
        },
    }
    for name, check in checks.items():
        if "required_minimum" in check:
            check["passed"] = float(check["observed"]) >= float(
                check["required_minimum"]
            )
        elif "observed_parent_loss" in check:
            check["passed"] = int(check["observed_parent_loss"]) <= int(
                check["allowed_maximum"]
            )
        elif "observed_drop" in check:
            check["passed"] = float(check["observed_drop"]) <= float(
                check["allowed_maximum"]
            )
        else:
            check["passed"] = int(check["observed"]) <= int(check["allowed_maximum"])
    passed = all(bool(check["passed"]) for check in checks.values())
    result = {
        "schema": RESULT_SCHEMA,
        "status": (
            "complete-static-admitted-not-live-authorized"
            if passed
            else "complete-static-rejected"
        ),
        "device": device,
        "feature_version": head.FEATURE_VERSION,
        "protocol": protocol,
        "sources": {
            "training": training_source,
            "validation": validation_source,
            "external_validation": external_source,
        },
        "parents": {
            "fit": len(fit_groups),
            "tune": len(tune_groups),
            "validation": len(validation_groups),
            "external_validation": len(external_groups),
        },
        "overlap": {
            "training_validation": train_validation_overlap,
            "external_diagnostic_only": external_overlap,
        },
        "training": {
            "epochs": args.epochs,
            "best_epoch": best_epoch,
            "selection_curve": curve,
            "refit_curve": refit_curve,
            "load_seconds": load_seconds,
        },
        "baseline_zero_head_validation": baseline_validation,
        "float": {
            "validation": float_validation,
            "external_validation": float_external,
        },
        "quantized": {
            "validation": quantized_validation,
            "external_validation": quantized_external,
        },
        "export": export,
        "static_gate": {"passed": passed, "checks": checks},
        "evaluator_changed": False,
        "live_weight_changed": False,
        "required_next_gate": (
            "research-wasm-root-only-fixed-depth-node-and-speed-gate"
            if passed
            else None
        ),
    }
    _atomic_json(out_dir / "result.json", result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--protocol", required=True)
    parser.add_argument("--data", required=True)
    parser.add_argument("--val-data", required=True)
    parser.add_argument("--external-val-data", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--epochs", type=int, default=64)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--lr", type=float, default=0.02)
    parser.add_argument("--temperature-cp", type=float, default=100.0)
    parser.add_argument("--pair-gap-cp", type=float, default=50.0)
    parser.add_argument("--pair-weight", type=float, default=0.25)
    parser.add_argument("--tune-modulus", type=int, default=10)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--device", choices=("auto", "cpu", "mps", "cuda"), default="auto"
    )
    parser.add_argument("--torch-threads", type=int, default=4)
    args = parser.parse_args()
    try:
        result = run(args)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"[move-order-head] STOP: {error}", flush=True)
        return 1
    print(
        json.dumps(
            {"status": result["status"], "static_gate": result["static_gate"]},
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
