#!/usr/bin/env python3
"""Warm-start HalfKP on legal sibling rankings without forgetting position value.

This is a research-only trainer.  It differs from the historical board-feature
sibling experiments in three material ways:

* the initializer is an already trained ``halfkp-factor`` checkpoint;
* every sibling minibatch is mixed with ordinary value-replay positions; and
* an independent value set may only admit a checkpoint when both sibling
  ranking and value-preservation gates pass relative to epoch zero.

The trainer never writes the live weight path.  An admitted ``best.pt`` still
requires the repository's paired engine-match gates before promotion.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import time
from pathlib import Path

import torch
import torch.nn.functional as F

import train
import train_sibling_research as sibling_research


RESULT_SCHEMA = "shogi-halfkp-sibling-preserving-training-v1"
FEATURES = "halfkp-factor"
PROTOCOL_SCHEMA = "shogi-halfkp-sibling-preservation-plan-v1"


def _file_fingerprint(path: str) -> dict[str, object]:
    digest = hashlib.sha256()
    byte_count = 0
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
            byte_count += len(block)
    return {
        "path": os.path.abspath(path),
        "bytes": byte_count,
        "sha256": digest.hexdigest(),
    }


def _verify_protocol_inputs(args: argparse.Namespace) -> dict[str, object]:
    """Bind every input by content before dataset parsing or optimizer creation."""

    with open(args.protocol, "rb") as source:
        protocol_raw = source.read()
    protocol_fingerprint = {
        "path": os.path.abspath(args.protocol),
        "bytes": len(protocol_raw),
        "sha256": hashlib.sha256(protocol_raw).hexdigest(),
    }
    protocol = train.strict_json_loads(protocol_raw, "HalfKP sibling protocol")
    if type(protocol) is not dict or protocol.get("schema") != PROTOCOL_SCHEMA:
        raise ValueError("HalfKP sibling protocol schema mismatch")
    inputs = protocol.get("inputs")
    if type(inputs) is not dict:
        raise ValueError("HalfKP sibling protocol has no input registry")
    training = protocol.get("training")
    admission = protocol.get("epoch_admission_relative_to_initializer")
    if type(training) is not dict or type(admission) is not dict:
        raise ValueError("HalfKP sibling protocol has no training/admission contract")

    exact_common = {
        "epochs": (args.epochs, training.get("epochs")),
        "batch": (args.batch, training.get("batch")),
        "replay_limit": (
            args.replay_limit,
            (inputs.get("value_replay") or {}).get("sample_rows"),
        ),
        "replay_ratio": (
            args.replay_ratio,
            training.get("value_replay_ratio_rows"),
        ),
        "rank_pair_min": (args.rank_pair_min, training.get("rank_pair_min_cp")),
        "rank_pair_max": (args.rank_pair_max, training.get("rank_pair_max_cp")),
        "rank_margin_cp": (
            args.rank_margin_cp,
            training.get("rank_margin_cp"),
        ),
        "policy_temp_cp": (
            args.policy_temp_cp,
            training.get("policy_temperature_cp"),
        ),
        "min_pair_gain": (
            args.min_pair_gain,
            admission.get("minimum_sibling_pair_gain"),
        ),
        "min_top1_gain": (
            args.min_top1_gain,
            admission.get("minimum_sibling_top1_gain"),
        ),
        "max_value_mae_regression_cp": (
            args.max_value_mae_regression_cp,
            admission.get("maximum_value_mae_regression_cp"),
        ),
        "max_value_loss_relative": (
            args.max_value_loss_relative,
            admission.get("maximum_value_loss_relative_increase"),
        ),
    }
    mismatches = [
        f"{name}: expected {expected!r}, got {actual!r}"
        for name, (actual, expected) in exact_common.items()
        if type(actual) is not type(expected) or actual != expected
    ]
    if mismatches:
        raise ValueError(
            "HalfKP sibling protocol common-argument mismatch ("
            + "; ".join(mismatches)
            + ")"
        )

    slots = training.get("prospective_slots")
    if type(slots) is not list or not slots:
        raise ValueError("HalfKP sibling protocol has no prospective slots")
    matching_slots = []
    for slot in slots:
        if type(slot) is not dict:
            raise ValueError("HalfKP sibling protocol contains an invalid slot")
        expected_slot = (
            slot.get("seed"),
            slot.get("learning_rate"),
            slot.get("rank_weight"),
            slot.get("policy_weight"),
        )
        actual_slot = (args.seed, args.lr, args.rank_weight, args.policy_weight)
        if all(
            type(actual) is type(expected) and actual == expected
            for actual, expected in zip(actual_slot, expected_slot, strict=True)
        ):
            matching_slots.append(slot)
    if len(matching_slots) != 1:
        raise ValueError(
            "HalfKP sibling protocol slot mismatch: seed/lr/rank/policy must "
            "match exactly one prospective slot"
        )
    selected_slot = dict(matching_slots[0])
    bindings = {
        "initializer": args.init_ckpt,
        "legal_sibling_training": args.data,
        "legal_sibling_validation": args.val_data,
        "value_replay": args.replay_data,
        "value_preservation_validation": args.preservation_val_data,
    }
    verified = {}
    expected_registry = {}
    for role, path in bindings.items():
        expected = inputs.get(role)
        if type(expected) is not dict:
            raise ValueError(f"protocol input {role} is absent")
        expected_sha256 = expected.get("sha256")
        if (
            not isinstance(expected_sha256, str)
            or len(expected_sha256) != 64
            or any(character not in "0123456789abcdef" for character in expected_sha256)
        ):
            raise ValueError(f"protocol input {role} SHA-256 is invalid")
        actual = _file_fingerprint(path)
        if actual["sha256"] != expected_sha256:
            raise ValueError(
                f"protocol input {role} SHA-256 mismatch: "
                f"expected {expected_sha256}, got {actual['sha256']}"
            )
        expected_bytes = expected.get("bytes")
        if type(expected_bytes) is int and actual["bytes"] != expected_bytes:
            raise ValueError(
                f"protocol input {role} byte count mismatch: "
                f"expected {expected_bytes}, got {actual['bytes']}"
            )
        verified[role] = actual
        expected_registry[role] = {
            "sha256": expected_sha256,
            "bytes": expected.get("bytes"),
            "rows": expected.get("rows"),
        }
    return {
        "schema": protocol["schema"],
        "protocol": protocol_fingerprint,
        "selected_slot": selected_slot,
        "inputs": verified,
        "expected_inputs": expected_registry,
    }


def _strict_value_source(
    path: str, *, collect_position_ids: bool = True
) -> tuple[dict[str, object], set[str]]:
    """Fail closed on every plain value row and return its semantic IDs."""

    digest = hashlib.sha256()
    byte_count = 0
    rows = 0
    position_ids: set[str] = set()
    with open(path, "rb") as source:
        for physical_line, raw_line in enumerate(source, start=1):
            digest.update(raw_line)
            byte_count += len(raw_line)
            if not raw_line.endswith(b"\n") or raw_line == b"\n":
                raise ValueError(
                    f"{path}: line {physical_line} must be one non-empty LF row"
                )
            record = train.strict_json_loads(
                raw_line[:-1], f"{path}: line {physical_line}"
            )
            if type(record) is not dict:
                raise ValueError(f"{path}: line {physical_line} must be an object")
            sfen = record.get("sfen")
            cp = record.get("cp")
            if not isinstance(sfen, str) or not sfen:
                raise ValueError(f"{path}: line {physical_line} has no SFEN")
            if type(cp) is not int:
                raise ValueError(f"{path}: line {physical_line} cp must be an integer")
            try:
                _idx, _hands, _side, king_sq = train.parse_sfen(sfen)
            except (IndexError, TypeError, ValueError) as error:
                raise ValueError(
                    f"{path}: line {physical_line} has invalid SFEN: {error}"
                ) from error
            if king_sq < 0:
                raise ValueError(
                    f"{path}: line {physical_line} has no side-to-move king"
                )
            if "outcome" in record:
                train.game_outcome_target(
                    record["outcome"], f"{path}: line {physical_line}: outcome"
                )
            if collect_position_ids:
                position_ids.add(train.position_id_from_sfen(sfen))
            rows += 1
    if rows == 0:
        raise ValueError(f"{path}: dataset is empty")
    return {
        "path": os.path.abspath(path),
        "bytes": byte_count,
        "sha256": digest.hexdigest(),
        "rows": rows,
    }, position_ids


def _semantic_ids(metadata) -> set[str]:
    identities: set[str] = set()
    for row in metadata:
        identities.add(row["position_id"])
        identities.add(row["child_position_id"])
    return identities


def _load_initializer(path: str, model: train.DistillNet, k: float):
    checkpoint, fingerprint = train.load_stable_torch_checkpoint(
        os.path.realpath(path), weights_only=True
    )
    expected = train.expected_arch(
        features=FEATURES,
        input_dim=model.arch_input_dim,
        h1=train.DistillNet.H1,
        h2=train.DistillNet.H2,
        k=k,
        kp_buckets=model.bucket_count,
    )
    try:
        train.validate_arch(checkpoint["arch"], expected)
        model.load_state_dict(checkpoint["model"], strict=True)
    except (KeyError, RuntimeError, TypeError, ValueError) as error:
        raise ValueError(f"incompatible HalfKP initializer: {error}") from error
    return {
        "path": os.path.abspath(path),
        "bytes": fingerprint["bytes"],
        "sha256": fingerprint["sha256"],
        "epoch": checkpoint.get("epoch"),
        "arch": expected,
    }


def _evaluate_value(model, tensors, device: str, k: float) -> dict[str, float]:
    board, hands, targets, _cp, bucket = tensors
    model.eval()
    loss_sum = 0.0
    mae_sum = 0.0
    count = 0
    with torch.no_grad():
        for start in range(0, targets.shape[0], 4096):
            end = start + 4096
            target = targets[start:end].to(device)
            output = model(
                board[start:end].to(device),
                hands[start:end].to(device),
                bucket[start:end].to(device),
            )
            loss_sum += F.mse_loss(
                torch.sigmoid(output), target, reduction="sum"
            ).item()
            target_logit = torch.logit(target.clamp(1e-6, 1.0 - 1e-6))
            mae_sum += (output - target_logit).abs().sum().item() * k
            count += int(target.shape[0])
    if count == 0:
        raise ValueError("value-preservation validation set is empty")
    metrics = {
        "value_loss": loss_sum / count,
        "value_mae_cp": mae_sum / count,
    }
    if not all(math.isfinite(value) for value in metrics.values()):
        raise ValueError("value-preservation validation produced non-finite metrics")
    return metrics


def _admission(
    sibling_metrics: dict[str, float],
    value_metrics: dict[str, float],
    baseline_sibling: dict[str, float],
    baseline_value: dict[str, float],
    args: argparse.Namespace,
) -> dict[str, object]:
    baseline_loss = baseline_value["value_loss"]
    if baseline_loss < 0 or not math.isfinite(baseline_loss):
        raise ValueError("baseline value loss must be finite and non-negative")
    loss_ratio = (
        value_metrics["value_loss"] / baseline_loss
        if baseline_loss > 0
        else (1.0 if value_metrics["value_loss"] == 0 else float("inf"))
    )
    checks = {
        "sibling_pair_gain": {
            "observed": sibling_metrics["sibling_pair_accuracy"]
            - baseline_sibling["sibling_pair_accuracy"],
            "required_minimum": args.min_pair_gain,
        },
        "sibling_top1_gain": {
            "observed": sibling_metrics["sibling_top1_accuracy"]
            - baseline_sibling["sibling_top1_accuracy"],
            "required_minimum": args.min_top1_gain,
        },
        "value_mae_regression_cp": {
            "observed": value_metrics["value_mae_cp"]
            - baseline_value["value_mae_cp"],
            "allowed_maximum": args.max_value_mae_regression_cp,
        },
        "value_loss_ratio": {
            "observed": loss_ratio,
            "allowed_maximum": 1.0 + args.max_value_loss_relative,
        },
    }
    checks["sibling_pair_gain"]["passed"] = (
        checks["sibling_pair_gain"]["observed"] >= args.min_pair_gain
    )
    checks["sibling_top1_gain"]["passed"] = (
        checks["sibling_top1_gain"]["observed"] >= args.min_top1_gain
    )
    checks["value_mae_regression_cp"]["passed"] = (
        checks["value_mae_regression_cp"]["observed"]
        <= args.max_value_mae_regression_cp
    )
    checks["value_loss_ratio"]["passed"] = (
        checks["value_loss_ratio"]["observed"]
        <= 1.0 + args.max_value_loss_relative
    )
    return {
        "passed": all(bool(check["passed"]) for check in checks.values()),
        "checks": checks,
    }


def _validate_args(args: argparse.Namespace) -> None:
    if args.epochs < 1 or args.batch < 2 or args.replay_limit < 1:
        raise ValueError("epochs, replay_limit, and batch must be positive")
    finite_positive = {
        "lr": args.lr,
        "k": args.k,
        "policy_temp_cp": args.policy_temp_cp,
        "replay_ratio": args.replay_ratio,
    }
    for name, value in finite_positive.items():
        if type(value) not in (int, float) or not math.isfinite(value) or value <= 0:
            raise ValueError(f"{name} must be finite and positive")
    finite_nonnegative = {
        "rank_weight": args.rank_weight,
        "rank_pair_min": args.rank_pair_min,
        "rank_pair_max": args.rank_pair_max,
        "rank_margin_cp": args.rank_margin_cp,
        "policy_weight": args.policy_weight,
        "min_pair_gain": args.min_pair_gain,
        "max_value_mae_regression_cp": args.max_value_mae_regression_cp,
        "max_value_loss_relative": args.max_value_loss_relative,
    }
    for name, value in finite_nonnegative.items():
        if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
            raise ValueError(f"{name} must be finite and non-negative")
    if not math.isfinite(args.min_top1_gain):
        raise ValueError("min_top1_gain must be finite")
    if args.rank_pair_max < args.rank_pair_min:
        raise ValueError("rank_pair_max must be at least rank_pair_min")
    if args.rank_weight == 0 and args.policy_weight == 0:
        raise ValueError("rank_weight and policy_weight cannot both be zero")
    if type(args.cp_clamp) is not int or args.cp_clamp <= 0:
        raise ValueError("cp_clamp must be a positive integer")


def run(args: argparse.Namespace) -> dict[str, object]:
    if os.path.exists(args.out):
        raise ValueError(f"output already exists: {args.out}")
    _validate_args(args)
    protocol_receipt = _verify_protocol_inputs(args)
    device = args.device
    if device == "auto":
        device = (
            "cuda"
            if torch.cuda.is_available()
            else "mps"
            if torch.backends.mps.is_available()
            else "cpu"
        )
    if device == "mps" and not torch.backends.mps.is_available():
        raise ValueError("MPS was requested but is unavailable")
    if device == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA was requested but is unavailable")

    torch.manual_seed(args.seed)
    random.seed(args.seed)
    if args.torch_threads:
        torch.set_num_threads(args.torch_threads)

    train_loaded = sibling_research.load_role_bound_dataset(
        args.data,
        "train",
        k_sigmoid=args.k,
        cp_clamp=args.cp_clamp,
        features=FEATURES,
    )
    val_loaded = sibling_research.load_role_bound_dataset(
        args.val_data,
        "val",
        k_sigmoid=args.k,
        cp_clamp=args.cp_clamp,
        features=FEATURES,
    )
    tb, th, ty, _tcp, tbk, train_meta, train_provenance = train_loaded
    vb, vh, vy, _vcp, vbk, val_meta, val_provenance = val_loaded
    train_groups, val_groups = sibling_research._validate_split_metadata(
        train_meta, val_meta
    )
    train_cp = train.raw_sibling_cp(train_meta)
    val_cp = train.raw_sibling_cp(val_meta)
    eligible_pairs = sibling_research._eligible_pair_count(
        train_cp, train_groups, args.rank_pair_min, args.rank_pair_max
    )
    if args.rank_weight > 0 and eligible_pairs == 0:
        raise ValueError("training has no eligible sibling ranking pair")

    protected = _semantic_ids(train_meta) | _semantic_ids(val_meta)
    preservation_preflight, preservation_ids = _strict_value_source(
        args.preservation_val_data
    )
    overlap = protected & preservation_ids
    replay_preflight, _ = _strict_value_source(
        args.replay_data, collect_position_ids=False
    )

    preservation_loaded = train.load_replay_dataset(
        args.preservation_val_data,
        args.k,
        args.cp_clamp,
        0,
        FEATURES,
        args.seed + 2003,
        exclude_position_ids=protected,
        include_fingerprint=True,
    )
    preservation = preservation_loaded[:5]
    preservation_fingerprint = preservation_loaded[5]
    if preservation_fingerprint["sha256"] != preservation_preflight["sha256"]:
        raise ValueError("preservation dataset changed after strict preflight")

    replay_loaded = train.load_replay_dataset(
        args.replay_data,
        args.k,
        args.cp_clamp,
        args.replay_limit,
        FEATURES,
        args.seed + 1009,
        exclude_position_ids=protected | preservation_ids,
        include_fingerprint=True,
    )
    rb, rh, ry, _rcp, rbk, replay_fingerprint = replay_loaded
    if replay_fingerprint["sha256"] != replay_preflight["sha256"]:
        raise ValueError("replay dataset changed after strict preflight")

    expected_inputs = protocol_receipt["inputs"]
    expected_registry = protocol_receipt["expected_inputs"]
    loaded_fingerprints = {
        "legal_sibling_training": train_provenance["source"],
        "legal_sibling_validation": val_provenance["source"],
        "value_replay": replay_preflight,
        "value_preservation_validation": preservation_preflight,
    }
    for role, observed in loaded_fingerprints.items():
        if observed["sha256"] != expected_inputs[role]["sha256"]:
            raise ValueError(f"protocol input {role} changed after preflight")
    observed_rows = {
        "legal_sibling_training": int(ty.shape[0]),
        "legal_sibling_validation": int(vy.shape[0]),
        "value_replay": int(replay_preflight["rows"]),
        "value_preservation_validation": int(preservation_preflight["rows"]),
    }
    for role, rows in observed_rows.items():
        expected_rows = expected_registry[role]["rows"]
        if type(expected_rows) is int and rows != expected_rows:
            raise ValueError(
                f"protocol input {role} row count mismatch: "
                f"expected {expected_rows}, got {rows}"
            )

    semantic_exclusion = {
        "sibling_semantic_ids": len(protected),
        "preservation_rows_before_exclusion": int(preservation_preflight["rows"]),
        "preservation_overlap_semantic_ids_excluded": len(overlap),
        "preservation_rows_after_exclusion": int(preservation[2].shape[0]),
        "sibling_vs_preservation_after_exclusion": 0,
        "replay_excluded_semantic_ids": len(protected | preservation_ids),
        "replay_rows_excluded_before_sampling": replay_fingerprint.get(
            "excluded_rows_before_sampling"
        ),
    }
    checkpoint_sources = {
        "sibling_train": {
            **train_provenance,
            "verified_input": expected_inputs["legal_sibling_training"],
            "rows": int(ty.shape[0]),
        },
        "sibling_val": {
            **val_provenance,
            "verified_input": expected_inputs["legal_sibling_validation"],
            "rows": int(vy.shape[0]),
        },
        "value_replay": {
            **replay_preflight,
            **replay_fingerprint,
            "verified_input": expected_inputs["value_replay"],
            "source_rows": int(replay_preflight["rows"]),
            "sample": {
                "method": "uniform-without-replacement-after-semantic-exclusion",
                "rows": int(ry.shape[0]),
                "seed": args.seed + 1009,
            },
        },
        "value_preservation_val": {
            **preservation_preflight,
            **preservation_fingerprint,
            "verified_input": expected_inputs["value_preservation_validation"],
            "source_rows": int(preservation_preflight["rows"]),
            "rows_after_semantic_exclusion": int(preservation[2].shape[0]),
        },
    }

    model = train.DistillNet(FEATURES)
    initializer = _load_initializer(args.init_ckpt, model, args.k)
    if initializer["sha256"] != expected_inputs["initializer"]["sha256"]:
        raise ValueError("protocol initializer changed after preflight")
    model = model.to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=args.lr, weight_decay=0.0
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=args.epochs
    )

    baseline_sibling = sibling_research._evaluate(
        model,
        vb,
        vh,
        vy,
        val_cp,
        vbk,
        val_meta,
        device,
        args.k,
        args.rank_pair_min,
    )
    baseline_value = _evaluate_value(model, preservation, device, args.k)
    Path(args.out).mkdir(parents=True)
    curve = [
        {
            "epoch": 0,
            "train_loss": None,
            "sibling": baseline_sibling,
            "preservation": baseline_value,
            "admission": {"passed": False, "reason": "initializer-baseline"},
            "seconds": 0.0,
        }
    ]
    best_key = (float("-inf"), float("-inf"), float("-inf"))
    best_epoch = None

    for epoch in range(1, args.epochs + 1):
        started = time.monotonic()
        model.train()
        generator = torch.Generator().manual_seed(args.seed + epoch)
        replay_order = torch.randperm(ry.shape[0], generator=generator)
        replay_cursor = 0
        loss_sum = 0.0
        rows = 0
        for selection, group_sizes in train.grouped_batches(
            train_groups, args.batch, generator
        ):
            replay_rows = max(1, round(selection.shape[0] * args.replay_ratio))
            if replay_rows > ry.shape[0]:
                raise ValueError("one replay minibatch exceeds the replay sample")
            if replay_cursor + replay_rows > replay_order.shape[0]:
                replay_order = torch.randperm(ry.shape[0], generator=generator)
                replay_cursor = 0
            replay_selection = replay_order[replay_cursor : replay_cursor + replay_rows]
            replay_cursor += replay_rows

            output = model(
                tb[selection].to(device),
                th[selection].to(device),
                tbk[selection].to(device),
            )
            replay_output = model(
                rb[replay_selection].to(device),
                rh[replay_selection].to(device),
                rbk[replay_selection].to(device),
            )
            loss = train.sibling_full_task_loss(
                output,
                ty[selection].to(device),
                train_cp[selection].to(device),
                group_sizes,
                k_sigmoid=args.k,
                rank_weight=args.rank_weight,
                rank_pair_min=args.rank_pair_min,
                rank_pair_max=args.rank_pair_max,
                rank_margin_cp=args.rank_margin_cp,
                policy_weight=args.policy_weight,
                policy_temp_cp=args.policy_temp_cp,
                replay_outputs=replay_output,
                replay_targets=ry[replay_selection].to(device),
            )
            if not bool(torch.isfinite(loss).item()):
                raise ValueError("training produced a non-finite loss")
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            loss_sum += float(loss.item()) * int(selection.shape[0])
            rows += int(selection.shape[0])
        scheduler.step()

        sibling_metrics = sibling_research._evaluate(
            model,
            vb,
            vh,
            vy,
            val_cp,
            vbk,
            val_meta,
            device,
            args.k,
            args.rank_pair_min,
        )
        value_metrics = _evaluate_value(model, preservation, device, args.k)
        admission = _admission(
            sibling_metrics,
            value_metrics,
            baseline_sibling,
            baseline_value,
            args,
        )
        checkpoint = {
            "model": model.state_dict(),
            "epoch": epoch,
            "arch": initializer["arch"],
            "args": vars(args),
            "initializer": initializer,
            "protocol": protocol_receipt,
            "sources": checkpoint_sources,
            "semantic_exclusion": semantic_exclusion,
            "rows": {
                "sibling_train": int(ty.shape[0]),
                "sibling_val": int(vy.shape[0]),
                "value_replay_sample": int(ry.shape[0]),
                "value_preservation_val": int(preservation[2].shape[0]),
            },
            "validation": {
                "sibling": sibling_metrics,
                "preservation": value_metrics,
                "admission": admission,
            },
            "selection": "preservation-gated-sibling-pair/top1/value-loss",
        }
        train.require_finite_model_parameters(model, f"epoch {epoch} candidate")
        train.atomic_torch_save(checkpoint, os.path.join(args.out, "last.pt"))
        key = train.sibling_selection_key(
            sibling_metrics["sibling_pair_accuracy"],
            sibling_metrics["sibling_top1_accuracy"],
            value_metrics["value_loss"],
        )
        if bool(admission["passed"]) and key > best_key:
            train.atomic_torch_save(checkpoint, os.path.join(args.out, "best.pt"))
            best_key = key
            best_epoch = epoch
        row = {
            "epoch": epoch,
            "train_loss": loss_sum / rows,
            "sibling": sibling_metrics,
            "preservation": value_metrics,
            "admission": admission,
            "seconds": time.monotonic() - started,
        }
        curve.append(row)
        print(json.dumps(row, sort_keys=True), flush=True)

    result = {
        "schema": RESULT_SCHEMA,
        "status": (
            "complete-candidate-admitted-not-authorized-for-live"
            if best_epoch is not None
            else "complete-no-admitted-candidate"
        ),
        "features": FEATURES,
        "device": device,
        "seed": args.seed,
        "initializer": initializer,
        "rows": {
            "sibling_train": int(ty.shape[0]),
            "sibling_val": int(vy.shape[0]),
            "value_replay": int(ry.shape[0]),
            "value_preservation_val": int(preservation[2].shape[0]),
        },
        "parents": {"train": len(train_groups), "val": len(val_groups)},
        "eligible_training_pairs": eligible_pairs,
        "sources": {
            **checkpoint_sources,
        },
        "protocol": protocol_receipt,
        "semantic_overlap": semantic_exclusion,
        "baseline": {
            "sibling": baseline_sibling,
            "preservation": baseline_value,
        },
        "best_epoch": best_epoch,
        "best_selection_key": None if best_epoch is None else list(best_key),
        "curve": curve,
        "live_weight_changed": False,
        "required_next_gate": "quantized-parity-then-direct-paired-engine-match-against-live",
        "difference_from_prior_failed_lane": (
            "HalfKP warm start plus equal-row value replay and an independent "
            "relative preservation gate; prior sibling runs used board features"
        ),
    }
    train.atomic_write_text(
        os.path.join(args.out, "result.json"),
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
    )
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    parser.add_argument("--val-data", required=True)
    parser.add_argument("--replay-data", required=True)
    parser.add_argument("--preservation-val-data", required=True)
    parser.add_argument("--init-ckpt", required=True)
    parser.add_argument("--protocol", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch", type=int, default=256)
    parser.add_argument("--replay-limit", type=int, default=500000)
    parser.add_argument("--replay-ratio", type=float, default=1.0)
    parser.add_argument("--lr", type=float, default=1e-5)
    parser.add_argument("--k", type=float, default=600.0)
    parser.add_argument("--cp-clamp", type=int, default=3000)
    parser.add_argument("--device", choices=("auto", "cpu", "mps", "cuda"), default="auto")
    parser.add_argument("--torch-threads", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--rank-weight", type=float, default=1.0)
    parser.add_argument("--rank-pair-min", type=float, default=50.0)
    parser.add_argument("--rank-pair-max", type=float, default=600.0)
    parser.add_argument("--rank-margin-cp", type=float, default=50.0)
    parser.add_argument("--policy-weight", type=float, default=0.25)
    parser.add_argument("--policy-temp-cp", type=float, default=200.0)
    parser.add_argument("--min-pair-gain", type=float, default=0.003)
    parser.add_argument("--min-top1-gain", type=float, default=0.0)
    parser.add_argument("--max-value-mae-regression-cp", type=float, default=10.0)
    parser.add_argument("--max-value-loss-relative", type=float, default=0.02)
    args = parser.parse_args()
    try:
        run(args)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"[halfkp-sibling-preserving] STOP: {error}", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
