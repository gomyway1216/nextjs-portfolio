#!/usr/bin/env python3
"""Research-only live-board warm start on fixed-depth all-legal siblings.

This lane deliberately keeps the deployed one-bucket ``board`` architecture.
It binds the live checkpoint, live exported bytes, sibling splits, replay set,
and preservation set by SHA-256 before allocating an optimizer.  A candidate
is written only inside a new output directory and only when every prospective
float, exported-int16, ranking, preservation, coverage, and export gate passes.
The live asset is never a write target.
"""

from __future__ import annotations

import argparse
import array
from collections import defaultdict
import hashlib
import json
import math
import os
import random
import sys
import tempfile
import time
from pathlib import Path

import torch
import torch.nn.functional as F

from int16_forward import OUT_SCALE, int16_forward_batch, quantize_model
import train
import train_halfkp_sibling_preserving as preserving
import train_sibling_research as sibling_research


RESULT_SCHEMA = "shogi-board-all-legal-warmstart-training-v1"
PROTOCOL_SCHEMA = "shogi-board-all-legal-warmstart-plan-v1"
TRACKED_PROTOCOL_PATH = (
    Path(__file__).resolve().parent
    / "protocols"
    / "board-all-legal-warmstart-v1-plan.json"
)
TRACKED_PROTOCOL_BYTES = 13_159
TRACKED_PROTOCOL_SHA256 = (
    "636a7569e317182593e34d024c94d7a4f354f714f64c5202c7d64f6ac75f33b5"
)
FEATURES = "board"
ALL_LEGAL_SOURCE = "all-legal-fixed-depth-teacher"
LIVE_EXPORT_BYTES = 1_185_988
LIVE_LEGACY_ARCH = {
    "input": 2282,
    "h1": 256,
    "h2": 32,
    "k": 600.0,
    "features": "board",
    "kp_buckets": 1,
}
EXPORT_LAYOUT = (
    ("w1_board", "h", 2268 * 256),
    ("w1_hand", "h", 14 * 256),
    ("b1", "i", 256),
    ("w2", "h", 32 * 256),
    ("b2", "i", 32),
    ("w3", "h", 32),
    ("b3", "i", 1),
)
STATIC_GATE_KEYS = {
    "all_checks_required",
    "failure_is_closed",
    "validation_parents",
    "minimum_top1_correct_parents",
    "minimum_top1_accuracy",
    "minimum_recall_at_3_gain",
    "minimum_recall_at_5_gain",
    "minimum_ndcg_at_5_gain",
    "minimum_pair50",
    "minimum_pair200_gain",
    "maximum_value_loss_ratio",
    "maximum_value_loss",
    "maximum_value_mae_regression_cp",
    "maximum_value_mae_cp",
    "maximum_float_to_int16_top1_loss_parents",
    "maximum_float_to_int16_pair50_drop",
    "maximum_float_to_int16_ndcg_at_5_drop",
    "expected_export_bytes",
    "minimum_export_roundtrip_parity_positions",
    "parity_position_selection",
    "maximum_faults",
    "maximum_semantic_overlap",
    "ndcg_temperature_cp",
    "ndcg_clamp_cp",
    "candidate_source",
    "on_failure",
}


def _fingerprint_bytes(value: bytes) -> dict[str, object]:
    return {"bytes": len(value), "sha256": hashlib.sha256(value).hexdigest()}


def _read_bytes(path: str) -> tuple[bytes, dict[str, object]]:
    with open(path, "rb") as source:
        value = source.read()
    return value, {
        "path": os.path.abspath(path),
        **_fingerprint_bytes(value),
    }


def _valid_sha256(value: object) -> bool:
    return (
        type(value) is str
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )


def _require_identity(path: str, expected: object, label: str) -> dict[str, object]:
    if (
        type(expected) is not dict
        or type(expected.get("bytes")) is not int
        or expected["bytes"] < 1
        or not _valid_sha256(expected.get("sha256"))
    ):
        raise ValueError(f"protocol {label} identity is invalid")
    _raw, observed = _read_bytes(path)
    if (
        observed["bytes"] != expected["bytes"]
        or observed["sha256"] != expected["sha256"]
    ):
        raise ValueError(
            f"protocol {label} identity mismatch: expected "
            f"{expected['bytes']}B/{expected['sha256']}, got "
            f"{observed['bytes']}B/{observed['sha256']}"
        )
    return observed


def _validate_static_gate(gate: object) -> dict[str, object]:
    if type(gate) is not dict or set(gate) != STATIC_GATE_KEYS:
        actual = set(gate) if type(gate) is dict else set()
        raise ValueError(
            "static gate keys mismatch: "
            f"missing={sorted(STATIC_GATE_KEYS - actual)!r} "
            f"extra={sorted(actual - STATIC_GATE_KEYS)!r}"
        )
    if gate["all_checks_required"] is not True or gate["failure_is_closed"] is not True:
        raise ValueError("static gate must be conjunctive and fail closed")
    positive_ints = (
        "validation_parents",
        "expected_export_bytes",
        "minimum_export_roundtrip_parity_positions",
    )
    nonnegative_ints = (
        "minimum_top1_correct_parents",
        "maximum_float_to_int16_top1_loss_parents",
        "maximum_faults",
        "maximum_semantic_overlap",
    )
    for name in positive_ints:
        if type(gate[name]) is not int or gate[name] <= 0:
            raise ValueError(f"static gate {name} must be a positive integer")
    for name in nonnegative_ints:
        if type(gate[name]) is not int or gate[name] < 0:
            raise ValueError(f"static gate {name} must be a non-negative integer")
    unit_interval = (
        "minimum_top1_accuracy",
        "minimum_pair50",
    )
    bounded_nonnegative_floats = (
        "minimum_recall_at_3_gain",
        "minimum_recall_at_5_gain",
        "minimum_ndcg_at_5_gain",
        "minimum_pair200_gain",
        "maximum_float_to_int16_pair50_drop",
        "maximum_float_to_int16_ndcg_at_5_drop",
    )
    nonnegative_floats = (
        "maximum_value_loss",
        "maximum_value_mae_regression_cp",
        "maximum_value_mae_cp",
    )
    positive_floats = (
        "maximum_value_loss_ratio",
        "ndcg_temperature_cp",
        "ndcg_clamp_cp",
    )
    for name in unit_interval:
        value = gate[name]
        if type(value) is not float or not math.isfinite(value) or not 0 <= value <= 1:
            raise ValueError(f"static gate {name} must be a finite float in [0,1]")
    for name in nonnegative_floats:
        value = gate[name]
        if type(value) is not float or not math.isfinite(value) or value < 0:
            raise ValueError(f"static gate {name} must be a finite non-negative float")
    for name in bounded_nonnegative_floats:
        value = gate[name]
        if type(value) is not float or not math.isfinite(value) or not 0 <= value <= 1:
            raise ValueError(f"static gate {name} must be a finite float in [0,1]")
    for name in positive_floats:
        value = gate[name]
        if type(value) is not float or not math.isfinite(value) or value <= 0:
            raise ValueError(f"static gate {name} must be a finite positive float")
    for name in ("parity_position_selection", "candidate_source", "on_failure"):
        if type(gate[name]) is not str or not gate[name]:
            raise ValueError(f"static gate {name} must be a non-empty string")
    if gate["minimum_top1_correct_parents"] > gate["validation_parents"]:
        raise ValueError("static gate top1 count exceeds validation parents")
    if (
        gate["maximum_float_to_int16_top1_loss_parents"]
        > gate["validation_parents"]
    ):
        raise ValueError("static gate quantized top1 loss exceeds validation parents")
    if (
        gate["minimum_top1_accuracy"]
        != gate["minimum_top1_correct_parents"] / gate["validation_parents"]
    ):
        raise ValueError("static gate top1 count and accuracy disagree")
    if gate["maximum_value_loss_ratio"] < 1.0:
        raise ValueError("static gate value-loss ratio must be at least one")
    if gate["expected_export_bytes"] != LIVE_EXPORT_BYTES:
        raise ValueError("static gate does not require the exact live export bytes")
    if gate["maximum_faults"] != 0 or gate["maximum_semantic_overlap"] != 0:
        raise ValueError("static gate must permit zero faults and zero overlap")
    return gate


def _verify_protocol(
    args: argparse.Namespace,
    *,
    allow_unpinned_protocol_for_tests: bool = False,
    protocol_path_for_tests: str | None = None,
) -> dict[str, object]:
    if allow_unpinned_protocol_for_tests:
        if not protocol_path_for_tests:
            raise ValueError("test protocol seam requires an explicit path")
        protocol_path = Path(protocol_path_for_tests)
    else:
        if protocol_path_for_tests is not None:
            raise ValueError("protocol substitution is test-only")
        protocol_path = TRACKED_PROTOCOL_PATH
    raw, protocol_identity = _read_bytes(str(protocol_path))
    if not allow_unpinned_protocol_for_tests and (
        protocol_identity["bytes"] != TRACKED_PROTOCOL_BYTES
        or protocol_identity["sha256"] != TRACKED_PROTOCOL_SHA256
    ):
        raise ValueError(
            "tracked protocol identity mismatch: expected "
            f"{TRACKED_PROTOCOL_BYTES}B/{TRACKED_PROTOCOL_SHA256}, got "
            f"{protocol_identity['bytes']}B/{protocol_identity['sha256']}"
        )
    protocol = train.strict_json_loads(raw, "board all-legal warm-start protocol")
    if type(protocol) is not dict or protocol.get("schema") != PROTOCOL_SCHEMA:
        raise ValueError("board all-legal warm-start protocol schema mismatch")
    inputs = protocol.get("inputs")
    training = protocol.get("training")
    gate = _validate_static_gate(protocol.get("static_gate"))
    if type(inputs) is not dict or type(training) is not dict or type(gate) is not dict:
        raise ValueError("protocol must contain inputs, training, and static_gate")

    common = {
        "epochs": args.epochs,
        "batch": args.batch,
        "replay_limit": args.replay_limit,
        "replay_ratio": args.replay_ratio,
        "k": args.k,
        "cp_clamp": args.cp_clamp,
        "rank_pair_min_cp": args.rank_pair_min,
        "rank_pair_max_cp": args.rank_pair_max,
        "rank_margin_cp": args.rank_margin_cp,
        "policy_temperature_cp": args.policy_temp_cp,
        "device": args.device,
        "torch_threads": args.torch_threads,
    }
    mismatches = [
        f"{name}: expected {training.get(name)!r}, got {actual!r}"
        for name, actual in common.items()
        if type(actual) is not type(training.get(name))
        or actual != training.get(name)
    ]
    final_contract = {
        "arm_count": 1,
        "optimizer": "AdamW",
        "weight_decay": 0.0,
        "checkpoint_policy": "fixed-final-epoch-3-only",
        "early_stopping": False,
        "candidate_validation_evaluations_before_final_checkpoint_freeze": 0,
        "live_baseline_evaluations_before_optimizer_creation": 1,
        "candidate_validation_path_used_by_optimizer": False,
        "replay_sample_seed": args.seed + 1009,
        "preservation_exclusion_seed": args.seed + 2003,
        "trainer_and_evaluator_source_hashes_must_be_recorded_before_optimizer_creation": True,
    }
    for name, expected in final_contract.items():
        actual = training.get(name)
        if type(actual) is not type(expected) or actual != expected:
            mismatches.append(f"{name}: expected {expected!r}, got {actual!r}")
    slots = training.get("prospective_slots")
    if type(slots) is not list or len(slots) != 1:
        raise ValueError("protocol must contain exactly one prospective training slot")
    selected = [
        slot
        for slot in slots
        if type(slot) is dict
        and (
            args.seed,
            args.lr,
            args.rank_weight,
            args.policy_weight,
        )
        == (
            slot.get("seed"),
            slot.get("learning_rate"),
            slot.get("rank_weight"),
            slot.get("policy_weight"),
        )
        and all(
            type(actual) is type(expected)
            for actual, expected in zip(
                (args.seed, args.lr, args.rank_weight, args.policy_weight),
                (
                    slot.get("seed"),
                    slot.get("learning_rate"),
                    slot.get("rank_weight"),
                    slot.get("policy_weight"),
                ),
                strict=True,
            )
        )
    ]
    if mismatches or len(selected) != 1:
        detail = "; ".join(mismatches) if mismatches else "training slot mismatch"
        raise ValueError(f"protocol training argument mismatch ({detail})")

    bindings = {
        "initializer": args.init_ckpt,
        "live_weights": args.live_weights,
        "dataset_manifest": args.dataset_manifest,
        "legal_sibling_training": args.data,
        "legal_sibling_validation": args.val_data,
        "value_replay": args.replay_data,
        "value_preservation_validation": args.preservation_val_data,
    }
    verified = {}
    for role, path in bindings.items():
        if role not in inputs:
            raise ValueError(f"protocol input {role} is absent")
        verified[role] = _require_identity(path, inputs[role], role)
    return {
        "schema": protocol["schema"],
        "protocol": protocol_identity,
        "protocol_path": str(protocol_path.resolve()),
        "selected_slot": dict(selected[0]),
        "inputs": verified,
        "expected_inputs": inputs,
        "static_gate": gate,
        "input_consistency": protocol.get("input_consistency"),
        "registered_baselines": protocol.get("registered_baselines"),
    }


def _validate_dataset_manifest(
    manifest_path: str,
    protocol: dict[str, object],
    *,
    train_rows: int,
    train_parents: int,
    train_games: int,
    val_rows: int,
    val_parents: int,
    val_games: int,
    allow_unsealed_dataset_for_tests: bool,
) -> None:
    if allow_unsealed_dataset_for_tests:
        return
    raw, _identity = _read_bytes(manifest_path)
    manifest = train.strict_json_loads(raw, "all-legal dataset manifest")
    if (
        type(manifest) is not dict
        or manifest.get("schema")
        != "shogi-browser-confusion-ranking-dataset-manifest-v1"
    ):
        raise ValueError("all-legal dataset manifest schema mismatch")
    common = ((manifest.get("input") or {}).get("common_binding") or {})
    policy = manifest.get("policy") or {}
    accounting = manifest.get("accounting") or {}
    output = manifest.get("output") or {}
    if (
        common.get("label_policy")
        != "all-rules-complete-legal-child-positions-independent-fixed-depth-v1"
        or ((common.get("teacher") or {}).get("fixed_depth") != 12)
        or policy.get("teacher_depth") != 12
        or common.get("incomplete_parent_policy")
        != "discard-whole-parent-only-on-typed-fixed-depth-incomplete-v1"
    ):
        raise ValueError("dataset manifest does not bind complete depth-12 legal sets")
    observed = {
        "train": {
            "records": train_rows,
            "parents": train_parents,
            "games": train_games,
        },
        "validation": {
            "records": val_rows,
            "parents": val_parents,
            "games": val_games,
        },
    }
    expected_roles = {
        "train": "legal_sibling_training",
        "validation": "legal_sibling_validation",
    }
    for manifest_role, protocol_role in expected_roles.items():
        registered = protocol["expected_inputs"][protocol_role]
        declared = output.get(manifest_role)
        if type(declared) is not dict:
            raise ValueError(f"dataset manifest output {manifest_role} is absent")
        for field in ("bytes", "sha256"):
            if declared.get(field) != registered.get(field):
                raise ValueError(
                    f"dataset manifest {manifest_role} {field} differs from protocol"
                )
        registered_counts = {
            "records": registered.get("rows"),
            "parents": registered.get("parents"),
            "games": registered.get("games"),
        }
        for field, expected in registered_counts.items():
            if type(expected) is int and declared.get(field) != expected:
                raise ValueError(
                    f"dataset manifest {manifest_role} {field} differs from protocol"
                )
        for field, actual in observed[manifest_role].items():
            if declared.get(field) != actual:
                raise ValueError(
                    f"dataset manifest {manifest_role} {field} differs from loaded data"
                )
    for field in (
        "train_validation_game_overlap",
        "train_validation_parent_overlap",
        "train_validation_position_overlap",
        "train_validation_child_position_overlap",
        "train_validation_semantic_union_overlap",
    ):
        if accounting.get(field) != 0:
            raise ValueError(f"dataset manifest {field} must be zero")
    consistency = protocol.get("input_consistency")
    if (
        type(consistency) is not dict
        or consistency.get("all_legal_source_required_on_every_sibling_row")
        != ALL_LEGAL_SOURCE
        or consistency.get("training_validation_semantic_union_overlap") != 0
    ):
        raise ValueError("protocol all-legal consistency binding is invalid")


def _verify_output_isolation(output_path: str, input_paths) -> str:
    output = os.path.realpath(output_path)
    for path in input_paths:
        source = os.path.realpath(path)
        try:
            common = os.path.commonpath((output, source))
        except ValueError as error:
            raise ValueError("output/input path roots cannot be compared") from error
        if output == source or common in (output, source):
            raise ValueError(
                f"output path aliases or contains a bound input: {source}"
            )
    return output


def _require_live_unchanged(
    live_weights_path: str,
    before_bytes: bytes,
    before_identity: dict[str, object],
) -> dict[str, object]:
    after_bytes, after_identity = _read_bytes(live_weights_path)
    if after_bytes != before_bytes or after_identity != before_identity:
        raise ValueError("live weights changed during the research run")
    return after_identity


def _validate_registered_live_baseline(
    registered: object,
    ranking: dict[str, float | int],
    value: dict[str, float],
    *,
    allow_unsealed_dataset_for_tests: bool,
) -> None:
    if allow_unsealed_dataset_for_tests:
        return
    if type(registered) is not dict:
        raise ValueError("protocol registered baselines are absent")
    expected_ranking = registered.get("exact_live_int16_on_643_parents")
    expected_value = registered.get("exact_live_int16_value_on_2959_rows")
    if type(expected_ranking) is not dict or type(expected_value) is not dict:
        raise ValueError("protocol exact live baselines are absent")
    for field in (
        "parents",
        "top1_correct",
        "top1",
        "recall_at_3_correct",
        "recall_at_3",
        "recall_at_5_correct",
        "recall_at_5",
        "ndcg_at_5",
        "pair50_correct",
        "pair50_total",
        "pair50",
        "pair200_correct",
        "pair200_total",
        "pair200",
    ):
        if (
            type(ranking.get(field)) is not type(expected_ranking.get(field))
            or ranking.get(field) != expected_ranking.get(field)
        ):
            raise ValueError(f"exact live ranking baseline drifted at {field}")
    for field in ("value_loss", "value_mae_cp"):
        if (
            type(value.get(field)) is not type(expected_value.get(field))
            or value.get(field) != expected_value.get(field)
        ):
            raise ValueError(f"exact live value baseline drifted at {field}")


def _implementation_identities() -> dict[str, dict[str, object]]:
    root = Path(__file__).resolve().parent
    return {
        name: _read_bytes(str(root / filename))[1]
        for name, filename in (
            ("runner", "train_board_all_legal_warmstart.py"),
            ("training_core", "train.py"),
            ("int16_reference", "int16_forward.py"),
            ("sibling_loader", "train_sibling_research.py"),
            ("preservation_helpers", "train_halfkp_sibling_preserving.py"),
        )
    }


def _create_optimizer(
    model: train.DistillNet,
    args: argparse.Namespace,
    *,
    live_baseline_evaluated_before_optimizer: bool,
):
    if live_baseline_evaluated_before_optimizer is not True:
        raise ValueError("live baseline must be validated before optimizer creation")
    return torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.0)


def _require_all_legal(metadata, label: str) -> None:
    for index, row in enumerate(metadata):
        if row.get("sources") != [ALL_LEGAL_SOURCE]:
            raise ValueError(
                f"{label} row {index} is not an explicit {ALL_LEGAL_SOURCE} row"
            )


def _serialized_board_weights(model: train.DistillNet) -> bytes:
    if (
        model.features != FEATURES
        or model.bucket_count != 1
        or model.dual
        or model.arch_input_dim != 2282
    ):
        raise ValueError("candidate is not the deployed one-bucket board architecture")
    quantized = quantize_model(model)
    if set(quantized) != {name for name, _typecode, _count in EXPORT_LAYOUT}:
        raise ValueError("quantized board tensors do not match the live layout")
    chunks = []
    for name, typecode, count in EXPORT_LAYOUT:
        tensor = quantized[name].detach().cpu().contiguous().view(-1)
        if tensor.numel() != count:
            raise ValueError(f"{name} has {tensor.numel()} values, expected {count}")
        values = array.array(typecode, tensor.tolist())
        expected_itemsize = 2 if typecode == "h" else 4
        if values.itemsize != expected_itemsize:
            raise ValueError("host integer layout cannot reproduce live weights")
        if sys.byteorder == "big":
            values.byteswap()
        chunks.append(values.tobytes())
    result = b"".join(chunks)
    if len(result) != LIVE_EXPORT_BYTES:
        raise ValueError(
            f"board export is {len(result)} bytes, expected {LIVE_EXPORT_BYTES}"
        )
    return result


def _deserialized_board_weights(value: bytes) -> dict[str, torch.Tensor]:
    if len(value) != LIVE_EXPORT_BYTES:
        raise ValueError("serialized board weights have the wrong byte count")
    result = {}
    offset = 0
    for name, typecode, count in EXPORT_LAYOUT:
        itemsize = 2 if typecode == "h" else 4
        chunk = value[offset : offset + count * itemsize]
        values = array.array(typecode)
        values.frombytes(chunk)
        if sys.byteorder == "big":
            values.byteswap()
        dtype = torch.int16 if typecode == "h" else torch.int32
        result[name] = torch.tensor(values, dtype=dtype)
        offset += count * itemsize
    if offset != len(value):
        raise ValueError("serialized board layout has trailing bytes")
    result["w1_board"] = result["w1_board"].reshape(2268, 256)
    result["w1_hand"] = result["w1_hand"].reshape(14, 256)
    result["w2"] = result["w2"].reshape(32, 256)
    return result


def _load_initializer(
    checkpoint_path: str,
    live_weights_path: str,
) -> tuple[train.DistillNet, dict[str, object], bytes]:
    checkpoint, fingerprint = train.load_stable_torch_checkpoint(
        os.path.realpath(checkpoint_path), weights_only=True
    )
    if type(checkpoint) is not dict or checkpoint.get("arch") != LIVE_LEGACY_ARCH:
        raise ValueError("initializer is not the exact legacy live board architecture")
    model = train.DistillNet(FEATURES)
    try:
        model.load_state_dict(checkpoint["model"], strict=True)
    except (KeyError, RuntimeError, TypeError, ValueError) as error:
        raise ValueError(f"incompatible live initializer: {error}") from error
    train.require_finite_model_parameters(model, "live initializer")
    exported = _serialized_board_weights(model)
    live_bytes, live_identity = _read_bytes(live_weights_path)
    if exported != live_bytes:
        raise ValueError(
            "initializer export is not byte-identical to the bound live weights"
        )
    arch = train.expected_arch(
        features=FEATURES,
        input_dim=model.arch_input_dim,
        h1=train.DistillNet.H1,
        h2=train.DistillNet.H2,
        k=600.0,
        kp_buckets=1,
    )
    return model, {
        "path": os.path.abspath(checkpoint_path),
        **fingerprint,
        "epoch": checkpoint.get("epoch"),
        "source_arch": dict(LIVE_LEGACY_ARCH),
        "normalized_arch": arch,
        "live_export": live_identity,
        "exact_live_export_match": True,
    }, exported


def _model_outputs(model, tensors, device: str) -> torch.Tensor:
    board, hands, targets, _cp, bucket = tensors
    outputs = []
    model.eval()
    with torch.no_grad():
        for start in range(0, targets.shape[0], 4096):
            end = start + 4096
            outputs.append(
                model(
                    board[start:end].to(device),
                    hands[start:end].to(device),
                    bucket[start:end].to(device),
                ).cpu()
            )
    return torch.cat(outputs)


def _int16_out_q_from_q(
    qweights: dict[str, torch.Tensor], board: torch.Tensor, hands: torch.Tensor
) -> torch.Tensor:
    outputs = []
    for start in range(0, board.shape[0], 4096):
        end = start + 4096
        out_q = int16_forward_batch(
            qweights, board[start:end], hands[start:end], train.PAD_IDX
        )
        outputs.append(out_q)
    return torch.cat(outputs)


def _production_cp_from_out_q(out_q: torch.Tensor) -> torch.Tensor:
    """Match production's signed integer CP conversion (truncate toward zero)."""

    if not isinstance(out_q, torch.Tensor) or out_q.is_floating_point():
        raise TypeError("out_q must be an integer tensor")
    return torch.div(
        out_q.to(torch.int64) * 600,
        OUT_SCALE,
        rounding_mode="trunc",
    )


def _int16_production_cp_from_q(
    qweights: dict[str, torch.Tensor],
    board: torch.Tensor,
    hands: torch.Tensor,
) -> torch.Tensor:
    return _production_cp_from_out_q(
        _int16_out_q_from_q(qweights, board, hands)
    )


def _int16_value_logits_from_q(
    qweights: dict[str, torch.Tensor],
    board: torch.Tensor,
    hands: torch.Tensor,
) -> torch.Tensor:
    return (
        _int16_production_cp_from_q(qweights, board, hands).to(torch.float32)
        / 600.0
    )


def _int16_production_cp(model, board, hands) -> torch.Tensor:
    qweights = {
        name: value.detach().cpu() for name, value in quantize_model(model).items()
    }
    return _int16_production_cp_from_q(qweights, board, hands)


def ranking_metrics(
    outputs: torch.Tensor,
    child_cp: torch.Tensor,
    metadata,
    *,
    ndcg_temperature_cp: float,
    ndcg_clamp_cp: float,
) -> dict[str, float | int]:
    """Pessimistic tie-safe ranking metrics over complete legal-move groups."""

    if (
        outputs.ndim != 1
        or outputs.shape != child_cp.shape
        or not bool(torch.isfinite(outputs).all().item())
        or not bool(torch.isfinite(child_cp).all().item())
    ):
        raise ValueError("ranking inputs must be equal finite vectors")
    if ndcg_temperature_cp <= 0 or ndcg_clamp_cp <= 0:
        raise ValueError("NDCG temperature and clamp must be positive")
    groups = defaultdict(list)
    for index, row in enumerate(metadata):
        groups[row["parent_id"]].append(index)
    top1 = recall3 = recall5 = 0
    pair50_correct = pair50_total = 0
    pair200_correct = pair200_total = 0
    ndcg_sum = 0.0
    for indices in groups.values():
        idx = torch.tensor(indices, dtype=torch.long)
        teacher = (-child_cp[idx]).to(torch.float64)
        predicted = (-outputs[idx]).to(torch.float64)
        teacher_best = teacher == teacher.max()
        best_predicted = predicted[teacher_best].max()
        pessimistic_rank = (
            int((predicted > best_predicted).sum().item())
            + int(((predicted == best_predicted) & ~teacher_best).sum().item())
            + 1
        )
        top1 += int(pessimistic_rank <= 1)
        recall3 += int(pessimistic_rank <= 3)
        recall5 += int(pessimistic_rank <= 5)
        for left in range(len(indices)):
            for right in range(left + 1, len(indices)):
                teacher_delta = float(teacher[left] - teacher[right])
                predicted_delta = float(predicted[left] - predicted[right])
                absolute = abs(teacher_delta)
                if absolute >= 50 and teacher_delta:
                    pair50_total += 1
                    pair50_correct += int(teacher_delta * predicted_delta > 0)
                if absolute >= 200 and teacher_delta:
                    pair200_total += 1
                    pair200_correct += int(teacher_delta * predicted_delta > 0)
        relative = (teacher - teacher.max()).clamp(min=-ndcg_clamp_cp, max=0)
        gains = torch.exp(relative / ndcg_temperature_cp)
        # Teacher-worst first is the deterministic pessimistic tie-break.
        predicted_order = sorted(
            range(len(indices)),
            key=lambda item: (-float(predicted[item]), float(gains[item]), item),
        )
        ideal_order = sorted(
            range(len(indices)), key=lambda item: (-float(gains[item]), item)
        )
        limit = min(5, len(indices))
        discounts = [1.0 / math.log2(rank + 2) for rank in range(limit)]
        dcg = sum(
            float(gains[predicted_order[rank]]) * discounts[rank]
            for rank in range(limit)
        )
        ideal = sum(
            float(gains[ideal_order[rank]]) * discounts[rank]
            for rank in range(limit)
        )
        if ideal <= 0 or not math.isfinite(dcg) or not math.isfinite(ideal):
            raise ValueError("NDCG produced an invalid denominator")
        ndcg_sum += dcg / ideal
    parents = len(groups)
    if parents == 0 or pair50_total == 0 or pair200_total == 0:
        raise ValueError("ranking validation has insufficient coverage")
    return {
        "parents": parents,
        "top1_correct": top1,
        "top1": top1 / parents,
        "recall_at_3_correct": recall3,
        "recall_at_3": recall3 / parents,
        "recall_at_5_correct": recall5,
        "recall_at_5": recall5 / parents,
        "ndcg_at_5": ndcg_sum / parents,
        "pair50_correct": pair50_correct,
        "pair50_total": pair50_total,
        "pair50": pair50_correct / pair50_total,
        "pair200_correct": pair200_correct,
        "pair200_total": pair200_total,
        "pair200": pair200_correct / pair200_total,
    }


def _value_metrics(outputs: torch.Tensor, targets: torch.Tensor, k: float):
    if outputs.shape != targets.shape or not bool(torch.isfinite(outputs).all().item()):
        raise ValueError("value validation outputs are invalid")
    target_logit = torch.logit(targets.clamp(1e-6, 1.0 - 1e-6))
    return {
        "value_loss": float(F.mse_loss(torch.sigmoid(outputs), targets).item()),
        "value_mae_cp": float((outputs - target_logit).abs().mean().item() * k),
    }


def _atomic_write_bytes(path: str, value: bytes) -> None:
    target = os.path.abspath(path)
    directory = os.path.dirname(target)
    descriptor, temporary = tempfile.mkstemp(
        dir=directory, prefix=f".{os.path.basename(target)}.", suffix=".tmp"
    )
    try:
        with os.fdopen(descriptor, "wb") as output:
            descriptor = -1
            output.write(value)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
        temporary = ""
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        if temporary:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass


def _gate(
    *,
    float_ranking,
    int16_ranking,
    live_ranking,
    int16_value,
    live_value,
    export_bytes: bytes,
    parity: dict[str, int],
    faults: int,
    semantic_overlap: int,
    contract: dict[str, object],
) -> dict[str, object]:
    _validate_static_gate(contract)
    checks = {
        "coverage": int16_ranking["parents"] == contract["validation_parents"],
        "top1": int16_ranking["top1_correct"]
        >= contract["minimum_top1_correct_parents"],
        "top1_accuracy": int16_ranking["top1"]
        >= contract["minimum_top1_accuracy"],
        "recall_at_3": int16_ranking["recall_at_3"] - live_ranking["recall_at_3"]
        >= contract["minimum_recall_at_3_gain"],
        "recall_at_5": int16_ranking["recall_at_5"] - live_ranking["recall_at_5"]
        >= contract["minimum_recall_at_5_gain"],
        "ndcg_at_5": int16_ranking["ndcg_at_5"] - live_ranking["ndcg_at_5"]
        >= contract["minimum_ndcg_at_5_gain"],
        "pair50": int16_ranking["pair50"] >= contract["minimum_pair50"],
        "pair200": int16_ranking["pair200"] - live_ranking["pair200"]
        >= contract["minimum_pair200_gain"],
        "value_loss": int16_value["value_loss"]
        <= live_value["value_loss"] * contract["maximum_value_loss_ratio"]
        and int16_value["value_loss"] <= contract["maximum_value_loss"],
        "value_mae": int16_value["value_mae_cp"] - live_value["value_mae_cp"]
        <= contract["maximum_value_mae_regression_cp"]
        and int16_value["value_mae_cp"] <= contract["maximum_value_mae_cp"],
        "float_to_int16_top1": float_ranking["top1_correct"]
        - int16_ranking["top1_correct"]
        <= contract["maximum_float_to_int16_top1_loss_parents"],
        "float_to_int16_pair50": float_ranking["pair50"] - int16_ranking["pair50"]
        <= contract["maximum_float_to_int16_pair50_drop"],
        "float_to_int16_ndcg": float_ranking["ndcg_at_5"]
        - int16_ranking["ndcg_at_5"]
        <= contract["maximum_float_to_int16_ndcg_at_5_drop"],
        "export_bytes": len(export_bytes) == contract["expected_export_bytes"],
        "export_roundtrip_parity": parity["matched"] == parity["tested"]
        and parity["tested"]
        >= contract["minimum_export_roundtrip_parity_positions"],
        "faults": faults <= contract["maximum_faults"],
        "semantic_overlap": semantic_overlap
        <= contract["maximum_semantic_overlap"],
    }
    finite = all(
        math.isfinite(float(value))
        for metrics in (float_ranking, int16_ranking, live_ranking, int16_value, live_value)
        for value in metrics.values()
    )
    checks["finite"] = finite
    return {
        "passed": all(checks.values()),
        "checks": checks,
        "observed": {
            "float": float_ranking,
            "int16": int16_ranking,
            "live_int16": live_ranking,
            "candidate_value_int16": int16_value,
            "live_value_int16": live_value,
            "export": {**_fingerprint_bytes(export_bytes), "roundtrip": parity},
            "faults": faults,
            "semantic_overlap": semantic_overlap,
        },
    }


def _validate_args(args: argparse.Namespace) -> None:
    if os.path.exists(args.out):
        raise ValueError(f"output already exists: {args.out}")
    if (
        type(args.epochs) is not int
        or type(args.batch) is not int
        or type(args.replay_limit) is not int
        or args.epochs < 1
        or args.batch < 2
        or args.replay_limit < 1
    ):
        raise ValueError("epochs, replay_limit, and batch must be positive")
    if type(args.k) is not float or args.k != 600.0:
        raise ValueError("k must be the exact float 600.0")
    if type(args.torch_threads) is not int or args.torch_threads < 1:
        raise ValueError("torch_threads must be a positive integer")
    for name in ("lr", "replay_ratio", "policy_temp_cp"):
        value = getattr(args, name)
        if type(value) not in (int, float) or not math.isfinite(value) or value <= 0:
            raise ValueError(f"{name} must be finite and positive")
    for name in (
        "rank_weight",
        "rank_pair_min",
        "rank_pair_max",
        "rank_margin_cp",
        "policy_weight",
    ):
        value = getattr(args, name)
        if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
            raise ValueError(f"{name} must be finite and non-negative")
    if args.rank_pair_max < args.rank_pair_min:
        raise ValueError("rank_pair_max must be at least rank_pair_min")
    if args.rank_weight == 0 and args.policy_weight == 0:
        raise ValueError("rank_weight and policy_weight cannot both be zero")
    if type(args.cp_clamp) is not int or args.cp_clamp <= 0:
        raise ValueError("cp_clamp must be a positive integer")


def run(
    args: argparse.Namespace,
    *,
    allow_unpinned_protocol_for_tests: bool = False,
    protocol_path_for_tests: str | None = None,
    allow_unsealed_dataset_for_tests: bool = False,
) -> dict[str, object]:
    if allow_unsealed_dataset_for_tests and not allow_unpinned_protocol_for_tests:
        raise ValueError("unsealed dataset use requires the unpinned test seam")
    _validate_args(args)
    protocol = _verify_protocol(
        args,
        allow_unpinned_protocol_for_tests=allow_unpinned_protocol_for_tests,
        protocol_path_for_tests=protocol_path_for_tests,
    )
    output_realpath = _verify_output_isolation(
        args.out,
        (
            args.data,
            args.val_data,
            args.replay_data,
            args.preservation_val_data,
            args.init_ckpt,
            args.live_weights,
            args.dataset_manifest,
            protocol["protocol_path"],
        ),
    )
    live_before_bytes, live_before = _read_bytes(args.live_weights)
    gate_contract = protocol["static_gate"]
    ndcg_temperature = gate_contract.get("ndcg_temperature_cp")
    ndcg_clamp = gate_contract.get("ndcg_clamp_cp")
    if (
        type(ndcg_temperature) not in (int, float)
        or type(ndcg_clamp) not in (int, float)
        or ndcg_temperature <= 0
        or ndcg_clamp <= 0
    ):
        raise ValueError("protocol NDCG contract is invalid")

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
        args.data, "train", k_sigmoid=args.k, cp_clamp=args.cp_clamp, features=FEATURES
    )
    val_loaded = sibling_research.load_role_bound_dataset(
        args.val_data, "val", k_sigmoid=args.k, cp_clamp=args.cp_clamp, features=FEATURES
    )
    tb, th, ty, _tcp, tbk, train_meta, train_source = train_loaded
    vb, vh, vy, _vcp, vbk, val_meta, val_source = val_loaded
    _require_all_legal(train_meta, "train")
    _require_all_legal(val_meta, "val")
    train_groups, val_groups = preserving._validate_split_metadata(train_meta, val_meta)
    if len(val_groups) != gate_contract["validation_parents"]:
        raise ValueError("validation parent coverage differs from the protocol")
    train_cp = train.raw_sibling_cp(train_meta)
    val_cp = train.raw_sibling_cp(val_meta)
    _validate_dataset_manifest(
        args.dataset_manifest,
        protocol,
        train_rows=int(ty.shape[0]),
        train_parents=len(train_groups),
        train_games=len({row["game_id"] for row in train_meta}),
        val_rows=int(vy.shape[0]),
        val_parents=len(val_groups),
        val_games=len({row["game_id"] for row in val_meta}),
        allow_unsealed_dataset_for_tests=allow_unsealed_dataset_for_tests,
    )
    if (
        args.rank_weight > 0
        and sibling_research._eligible_pair_count(
            train_cp, train_groups, args.rank_pair_min, args.rank_pair_max
        )
        == 0
    ):
        raise ValueError("training has no eligible sibling ranking pair")

    protected = preserving._semantic_ids(train_meta) | preserving._semantic_ids(val_meta)
    if not allow_unsealed_dataset_for_tests:
        expected_semantic_ids = protocol["input_consistency"].get(
            "sibling_parent_and_child_semantic_ids"
        )
        if type(expected_semantic_ids) is not int or len(protected) != expected_semantic_ids:
            raise ValueError(
                "all-legal sibling semantic coverage differs from the protocol"
            )
    preservation_preflight, preservation_ids = preserving._strict_value_source(
        args.preservation_val_data
    )
    replay_preflight, _ = preserving._strict_value_source(
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
    if preservation[2].shape[0] == 0:
        raise ValueError("preservation validation is empty after semantic exclusion")
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
    if ry.shape[0] == 0:
        raise ValueError("replay is empty after semantic exclusion")

    observed_sources = {
        "legal_sibling_training": train_source["source"],
        "legal_sibling_validation": val_source["source"],
        "value_replay": replay_preflight,
        "value_preservation_validation": preservation_preflight,
    }
    for role, observed in observed_sources.items():
        expected = protocol["inputs"][role]
        if (
            observed["bytes"] != expected["bytes"]
            or observed["sha256"] != expected["sha256"]
        ):
            raise ValueError(f"{role} changed after strict loading")
        expected_rows = protocol["expected_inputs"][role].get("rows")
        actual_rows = (
            int(ty.shape[0])
            if role == "legal_sibling_training"
            else int(vy.shape[0])
            if role == "legal_sibling_validation"
            else int(observed["rows"])
        )
        if type(expected_rows) is int and actual_rows != expected_rows:
            raise ValueError(f"{role} row count differs from the protocol")
    if (
        preservation_fingerprint["sha256"] != preservation_preflight["sha256"]
        or replay_fingerprint["sha256"] != replay_preflight["sha256"]
    ):
        raise ValueError("value dataset changed after strict preflight")

    model, initializer, _live_export = _load_initializer(
        args.init_ckpt, args.live_weights
    )
    if (
        initializer["sha256"] != protocol["inputs"]["initializer"]["sha256"]
        or initializer["live_export"]["sha256"]
        != protocol["inputs"]["live_weights"]["sha256"]
    ):
        raise ValueError("initializer/live identity changed after protocol preflight")
    model = model.to(device)
    implementation = _implementation_identities()
    live_q = _deserialized_board_weights(live_before_bytes)
    live_val_cp = _int16_production_cp_from_q(live_q, vb, vh)
    live_value_logits = _int16_value_logits_from_q(
        live_q, preservation[0], preservation[1]
    )
    live_ranking = ranking_metrics(
        live_val_cp,
        val_cp,
        val_meta,
        ndcg_temperature_cp=ndcg_temperature,
        ndcg_clamp_cp=ndcg_clamp,
    )
    live_value = _value_metrics(live_value_logits, preservation[2], args.k)
    _validate_registered_live_baseline(
        protocol["registered_baselines"],
        live_ranking,
        live_value,
        allow_unsealed_dataset_for_tests=allow_unsealed_dataset_for_tests,
    )
    live_baseline_evaluated_before_optimizer = True
    optimizer = _create_optimizer(
        model,
        args,
        live_baseline_evaluated_before_optimizer=(
            live_baseline_evaluated_before_optimizer
        ),
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=args.epochs
    )
    Path(output_realpath).mkdir(parents=True)
    curve = []
    for epoch in range(1, args.epochs + 1):
        started = time.monotonic()
        model.train()
        generator = torch.Generator().manual_seed(args.seed + epoch)
        replay_order = torch.randperm(ry.shape[0], generator=generator)
        replay_cursor = 0
        loss_sum = rows = 0
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
        train.require_finite_model_parameters(model, f"epoch {epoch} candidate")
        row = {
            "epoch": epoch,
            "train_loss": loss_sum / rows,
            "seconds": time.monotonic() - started,
        }
        curve.append(row)
        print(json.dumps(row, sort_keys=True), flush=True)

    # The model is now frozen at the single preregistered final epoch.  No
    # validation metric or live-baseline metric was computed in the epoch loop.
    float_val_outputs = (
        _model_outputs(model, (vb, vh, vy, _vcp, vbk), device) * args.k
    )
    float_ranking = ranking_metrics(
        float_val_outputs,
        val_cp,
        val_meta,
        ndcg_temperature_cp=ndcg_temperature,
        ndcg_clamp_cp=ndcg_clamp,
    )
    candidate_export = _serialized_board_weights(model)
    candidate_q = _deserialized_board_weights(candidate_export)
    int16_val_outputs = _int16_production_cp_from_q(candidate_q, vb, vh)
    int16_ranking = ranking_metrics(
        int16_val_outputs,
        val_cp,
        val_meta,
        ndcg_temperature_cp=ndcg_temperature,
        ndcg_clamp_cp=ndcg_clamp,
    )
    int16_value_outputs = _int16_value_logits_from_q(
        candidate_q, preservation[0], preservation[1]
    )
    int16_value = _value_metrics(int16_value_outputs, preservation[2], args.k)
    parity_rows = min(
        int(vy.shape[0]),
        max(
            200,
            int(gate_contract["minimum_export_roundtrip_parity_positions"]),
        ),
    )
    in_memory_q = {
        name: value.detach().cpu()
        for name, value in quantize_model(model).items()
    }
    expected_parity = _int16_production_cp_from_q(
        in_memory_q, vb[:parity_rows], vh[:parity_rows]
    )
    actual_parity = _int16_production_cp_from_q(
        candidate_q, vb[:parity_rows], vh[:parity_rows]
    )
    parity = {
        "tested": parity_rows,
        "matched": int((expected_parity == actual_parity).sum().item()),
    }
    admission = _gate(
        float_ranking=float_ranking,
        int16_ranking=int16_ranking,
        live_ranking=live_ranking,
        int16_value=int16_value,
        live_value=live_value,
        export_bytes=candidate_export,
        parity=parity,
        faults=0,
        semantic_overlap=0,
        contract=gate_contract,
    )
    checkpoint = {
        "model": model.state_dict(),
        "epoch": args.epochs,
        "arch": initializer["normalized_arch"],
        "args": vars(args),
        "initializer": initializer,
        "protocol": protocol,
        "implementation": implementation,
        "validation": admission,
        "candidate_validation_evaluations_before_final_checkpoint_freeze": 0,
        "live_baseline_evaluated_before_optimizer_creation": (
            live_baseline_evaluated_before_optimizer
        ),
        "live_weight_changed": False,
    }
    train.atomic_torch_save(checkpoint, os.path.join(output_realpath, "last.pt"))
    best_epoch = args.epochs if admission["passed"] else None
    if admission["passed"]:
        train.atomic_torch_save(checkpoint, os.path.join(output_realpath, "best.pt"))
        _atomic_write_bytes(
            os.path.join(output_realpath, "candidate-weights.bin"),
            candidate_export,
        )

    live_after = _require_live_unchanged(
        args.live_weights, live_before_bytes, live_before
    )
    result = {
        "schema": RESULT_SCHEMA,
        "status": (
            "complete-static-candidate-not-authorized-for-live"
            if best_epoch is not None
            else "complete-static-rejected"
        ),
        "features": FEATURES,
        "device": device,
        "seed": args.seed,
        "initializer": initializer,
        "implementation": implementation,
        "rows": {
            "sibling_train": int(ty.shape[0]),
            "sibling_val": int(vy.shape[0]),
            "value_replay": int(ry.shape[0]),
            "value_preservation_val": int(preservation[2].shape[0]),
        },
        "parents": {"train": len(train_groups), "val": len(val_groups)},
        "sources": observed_sources,
        "semantic_exclusion": {
            "protected_sibling_position_ids": len(protected),
            "sibling_vs_preservation_overlap_excluded": len(
                protected & preservation_ids
            ),
            "replay_excluded_position_ids": len(protected | preservation_ids),
            "final_overlap": 0,
        },
        "live_baseline": {"ranking": live_ranking, "value": live_value},
        "static_evaluation": admission,
        "candidate_validation_evaluations_before_final_checkpoint_freeze": 0,
        "live_baseline_evaluated_before_optimizer_creation": (
            live_baseline_evaluated_before_optimizer
        ),
        "candidate_epoch": args.epochs,
        "best_epoch": best_epoch,
        "curve": curve,
        "live_weight_identity": {
            "before": live_before,
            "after": live_after,
            "byte_exact_unchanged": True,
        },
        "live_weight_changed": False,
        "live_weight_path_write_attempted": False,
        "required_next_gate": (
            "direct-paired-engine-screen"
            if best_epoch is not None
            else "stop-this-preregistered-lane-without-more-tuning"
        ),
        "difference_from_prior_failed_lanes": (
            "exact live one-bucket board warm start with all-legal siblings, "
            "value replay/preservation, and exported-int16 multi-metric gates; "
            "not the prior scratch V9 or HalfKP recipe"
        ),
    }
    train.atomic_write_text(
        os.path.join(output_realpath, "result.json"),
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
    parser.add_argument("--live-weights", required=True)
    parser.add_argument("--dataset-manifest", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch", type=int, default=256)
    parser.add_argument("--replay-limit", type=int, default=500000)
    parser.add_argument("--replay-ratio", type=float, default=1.0)
    parser.add_argument("--lr", type=float, default=1e-5)
    parser.add_argument("--k", type=float, default=600.0)
    parser.add_argument("--cp-clamp", type=int, default=3000)
    parser.add_argument("--device", choices=("cpu", "mps", "cuda"), default="mps")
    parser.add_argument("--torch-threads", type=int, default=14)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--rank-weight", type=float, default=0.25)
    parser.add_argument("--rank-pair-min", type=float, default=50.0)
    parser.add_argument("--rank-pair-max", type=float, default=600.0)
    parser.add_argument("--rank-margin-cp", type=float, default=50.0)
    parser.add_argument("--policy-weight", type=float, default=0.0625)
    parser.add_argument("--policy-temp-cp", type=float, default=50.0)
    args = parser.parse_args()
    try:
        run(args)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"[board-all-legal-warmstart] STOP: {error}", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
