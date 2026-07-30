#!/usr/bin/env python3
"""One-shot trainer and static gate for direct-teacher HalfKP81 v2.

The command has no tunable training arguments.  It consumes the create-only
execution plan produced by :mod:`build_direct_teacher_halfkp81_v2_plan`,
reconstructs and exactly compares that plan before optimizer creation, trains
the single preregistered seed-42 candidate for exactly one epoch on MPS, freezes
that final epoch, exports isolated 81-bucket research weights, and emits a
fail-closed static-sanity receipt.

Nothing in this module writes the live weight path.  A static pass authorizes
only the separately preregistered paired-56 screen.
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
import re
import subprocess
import sys
import tempfile
import time
from typing import Any, BinaryIO, Callable, Iterable, Mapping, Sequence

import torch
import torch.nn.functional as F

import build_direct_teacher_halfkp81_v2_plan as PLAN
import direct_teacher_halfkp81_v2_protocol as PROTOCOL
from int16_forward import OUT_SCALE, int16_forward_batch, quantize_model
import train


TRAINER_RESULT_SCHEMA = "shogi-direct-teacher-halfkp81-v2-trainer-result-v1"
STATIC_RESULT_SCHEMA = "shogi-direct-teacher-halfkp81-v2-static-sanity-result-v1"
CHECKPOINT_SCHEMA = "shogi-direct-teacher-halfkp81-v2-final-checkpoint-v1"
REFERENCE_SCHEMA = "shogi-direct-teacher-halfkp81-v2-int16-reference-v1"
RUNTIME_SCHEMA = "shogi-direct-teacher-halfkp81-v2-runtime-sanity-v1"
CLAIM_SCHEMA = "shogi-direct-teacher-halfkp81-v2-one-shot-claim-v1"
FEATURES = "halfkp-factor"
BUCKETS = 81
K_SIGMOID = 600.0
CP_CLAMP = 3000
SEED = 42
BATCH = 2048
LEARNING_RATE = 0.000003
EPOCHS = 1
WEIGHT_DECAY = 0.0
REFERENCE_LIMIT = 512
RUNTIME_WASM = "wasm-spike/artifacts/shogi-halfkp81-research.wasm"
RUNTIME_SCRIPT = "wasm-spike/direct-teacher-halfkp81-v2-runtime-sanity.ts"
EXPECTED_RUNTIME_WASM = {
    "bytes": 35837,
    "sha256": "1b95659d54fc897e2ff766583ccc2035a0932929fcb9520800c3a5ca2b1430db",
}
EXPECTED_EXPORT_BYTES = 94_656_708
ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
ROW_KEYS = {
    "schema",
    "role",
    "game_id",
    "parent_id",
    "position_id",
    "child_position_id",
    "child_sfen",
    "teacher_child_cp",
    "teacher_score_kind",
    "source_row_sha256",
}
EXPORT_LAYOUT = (
    ("w1_board", "h"),
    ("w1_hand", "h"),
    ("b1", "i"),
    ("w2", "h"),
    ("b2", "i"),
    ("w3", "h"),
    ("b3", "i"),
)


class DirectTeacherTrainingError(ValueError):
    """The fixed training or static-sanity contract was violated."""


def _identity(path: str, label: str) -> dict[str, Any]:
    identity, _lines = PROTOCOL.stable_file_identity(path, label)
    return identity


def _identity_with_schema(path: str, label: str, schema: str) -> dict[str, Any]:
    return {**_identity(path, label), "schema": schema}


def _atomic_publish_create_only(
    path: str,
    *,
    label: str,
    writer: Callable[[BinaryIO], None],
    expected_bytes: int | None = None,
) -> dict[str, Any]:
    """Publish only a complete, fsynced same-directory temporary file."""

    absolute = os.path.abspath(path)
    directory = os.path.dirname(absolute)
    if not os.path.isdir(directory):
        raise DirectTeacherTrainingError(
            f"{label} output directory does not exist: {directory}"
        )
    if os.path.lexists(absolute):
        raise DirectTeacherTrainingError(f"refusing to overwrite {label}: {absolute}")
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w+b",
            prefix=f".{os.path.basename(absolute)}.",
            suffix=".tmp",
            dir=directory,
            delete=False,
        ) as temporary:
            temporary_path = temporary.name
            writer(temporary)
            temporary.flush()
            os.fsync(temporary.fileno())
        temporary_identity = _identity(temporary_path, f"temporary {label}")
        if (
            expected_bytes is not None
            and temporary_identity["bytes"] != expected_bytes
        ):
            raise DirectTeacherTrainingError(
                f"{label} bytes differ before publication: "
                f"{temporary_identity['bytes']} != {expected_bytes}"
            )
        try:
            os.link(temporary_path, absolute)
        except FileExistsError as error:
            raise DirectTeacherTrainingError(
                f"refusing to overwrite {label}: {absolute}"
            ) from error
        os.unlink(temporary_path)
        temporary_path = None
        directory_fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        final_identity = _identity(absolute, label)
        if any(
            final_identity[field] != temporary_identity[field]
            for field in ("bytes", "sha256")
        ):
            raise DirectTeacherTrainingError(
                f"{label} changed during atomic publication"
            )
        return final_identity
    finally:
        if temporary_path is not None:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass


def _require_exact_identity(
    observed: Mapping[str, Any], expected: Mapping[str, Any], label: str
) -> None:
    for field in ("bytes", "sha256"):
        if (
            type(observed.get(field)) is not type(expected.get(field))
            or observed.get(field) != expected.get(field)
        ):
            raise DirectTeacherTrainingError(
                f"{label} {field} differs: expected {expected.get(field)!r}, "
                f"got {observed.get(field)!r}"
            )


def _resolve_repo_path(path: str, repo_root: str) -> str:
    return path if os.path.isabs(path) else os.path.join(repo_root, path)


def load_and_rebuild_execution_plan(
    execution_plan_path: str, *, repo_root: str
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Rebuild the plan from its protocol and manifest before optimizer creation."""

    plan, plan_identity = PROTOCOL.load_strict_json_file(
        execution_plan_path, "direct-teacher v2 execution plan"
    )
    plan = PROTOCOL.validate_execution_plan_document(plan)
    protocol_path = str(plan["protocol"]["path"])
    manifest_path = str(plan["dataset_manifest"]["path"])
    protocol, protocol_identity = PROTOCOL.load_strict_json_file(
        protocol_path, "direct-teacher v2 protocol"
    )
    protocol = PROTOCOL.validate_protocol_document(protocol)
    manifest, manifest_identity = PROTOCOL.load_strict_json_file(
        manifest_path, "direct-teacher v2 dataset manifest"
    )
    manifest = PROTOCOL.validate_dataset_manifest_document(
        manifest,
        protocol=protocol,
        protocol_identity=protocol_identity,
    )
    _require_exact_identity(protocol_identity, plan["protocol"], "protocol")
    _require_exact_identity(
        manifest_identity, plan["dataset_manifest"], "dataset manifest"
    )
    rebuilt = PLAN.build_execution_plan(
        protocol_path=protocol_path,
        dataset_manifest_path=manifest_path,
        repo_root=repo_root,
    )
    if rebuilt != plan:
        raise DirectTeacherTrainingError(
            "execution plan does not equal a fresh strict reconstruction"
        )
    return plan, plan_identity, protocol, manifest


def validate_fixed_training_contract(plan: Mapping[str, Any]) -> None:
    if plan.get("training") != PROTOCOL.EXPECTED_TRAINING:
        raise DirectTeacherTrainingError("training recipe is not the fixed v2 recipe")
    fixed = plan["training"]
    expected = {
        "candidate_count": 1,
        "features": FEATURES,
        "parameter_scope": "all",
        "objective": "direct-scalar-sigmoid-bce",
        "k": 600,
        "cp_clamp": CP_CLAMP,
        "wdl_mix": 0,
        "rank_weight": 0,
        "policy_weight": 0,
        "seed": SEED,
        "batch": BATCH,
        "learning_rate": LEARNING_RATE,
        "epochs": EPOCHS,
        "optimizer": "AdamW",
        "weight_decay": 0,
        "scheduler": "constant",
        "device": "mps",
        "checkpoint_selection": "final-epoch-1-only",
        "best_checkpoint_selection": False,
        "early_stopping": False,
        "additional_seed": False,
    }
    if fixed != expected:
        raise DirectTeacherTrainingError("fixed training constants drifted")


def _strict_row(raw: bytes, *, role: str, line_number: int) -> dict[str, Any]:
    label = f"{role} dataset line {line_number}"
    if not raw.endswith(b"\n") or raw == b"\n" or b"\r" in raw:
        raise DirectTeacherTrainingError(f"{label} must be one non-empty LF row")
    row = PROTOCOL.strict_json_bytes(raw[:-1], label)
    if set(row) != ROW_KEYS:
        raise DirectTeacherTrainingError(f"{label} fields are not exact")
    if PROTOCOL.canonical_json_bytes(row) != raw:
        raise DirectTeacherTrainingError(f"{label} is not canonical JSONL")
    if row["schema"] != PROTOCOL.ROW_SCHEMA or row["role"] != role:
        raise DirectTeacherTrainingError(f"{label} schema/role mismatch")
    for field in (
        "game_id",
        "parent_id",
        "position_id",
        "child_position_id",
    ):
        if type(row[field]) is not str or ID_RE.fullmatch(row[field]) is None:
            raise DirectTeacherTrainingError(f"{label}.{field} is invalid")
    if (
        type(row["source_row_sha256"]) is not str
        or SHA256_RE.fullmatch(row["source_row_sha256"]) is None
    ):
        raise DirectTeacherTrainingError(f"{label}.source_row_sha256 is invalid")
    if row["teacher_score_kind"] != "cp":
        raise DirectTeacherTrainingError(f"{label} is not a direct CP teacher row")
    if type(row["teacher_child_cp"]) is not int:
        raise DirectTeacherTrainingError(f"{label}.teacher_child_cp must be an integer")
    sfen = row["child_sfen"]
    if type(sfen) is not str or not sfen:
        raise DirectTeacherTrainingError(f"{label}.child_sfen is invalid")
    try:
        actual_child_id = train.position_id_from_sfen(sfen)
    except (TypeError, ValueError) as error:
        raise DirectTeacherTrainingError(f"{label}.child_sfen is invalid") from error
    if actual_child_id != row["child_position_id"]:
        raise DirectTeacherTrainingError(
            f"{label}.child_position_id does not match child_sfen"
        )
    return row


def load_bound_dataset(
    path: str,
    declared: Mapping[str, Any],
    *,
    role: str,
) -> tuple[tuple[torch.Tensor, ...], list[dict[str, Any]], dict[str, Any]]:
    """Strictly parse one manifest-bound role into HalfKP81 tensors."""

    identity, line_count = PROTOCOL.stable_file_identity(
        path, f"{role} dataset", require_jsonl=True
    )
    _require_exact_identity(identity, declared, f"{role} dataset")
    if line_count != declared.get("rows"):
        raise DirectTeacherTrainingError(f"{role} dataset row count differs")

    rows: list[dict[str, Any]] = []
    board_rows: list[list[int]] = []
    hand_rows: list[list[float]] = []
    targets: list[float] = []
    clamped_cps: list[float] = []
    buckets: list[int] = []
    previous_child_id: str | None = None
    child_ids: set[str] = set()
    parsed_digest = hashlib.sha256()
    parsed_bytes = 0
    parsed_lines = 0
    with open(identity["path"], "rb") as source:
        for line_number, raw in enumerate(source, start=1):
            parsed_digest.update(raw)
            parsed_bytes += len(raw)
            parsed_lines = line_number
            row = _strict_row(raw, role=role, line_number=line_number)
            child_id = row["child_position_id"]
            if previous_child_id is not None and child_id <= previous_child_id:
                raise DirectTeacherTrainingError(
                    f"{role} rows must be strictly bytewise child_position_id sorted"
                )
            if child_id in child_ids:
                raise DirectTeacherTrainingError(f"{role} repeats child_position_id")
            previous_child_id = child_id
            child_ids.add(child_id)
            try:
                indices, hands, _black_to_move, king_square = train.parse_sfen(
                    row["child_sfen"]
                )
            except (IndexError, TypeError, ValueError) as error:
                raise DirectTeacherTrainingError(
                    f"{role} line {line_number} cannot be encoded"
                ) from error
            if king_square < 0:
                raise DirectTeacherTrainingError(
                    f"{role} line {line_number} has no side-to-move king"
                )
            bucket = train.feature_bucket(FEATURES, king_square)
            bucketed = [bucket * train.BOARD_FEATS + item for item in indices]
            padded = bucketed[: train.MAX_PIECES] + [BUCKETS * train.BOARD_FEATS] * (
                train.MAX_PIECES - len(bucketed)
            )
            cp = max(-CP_CLAMP, min(CP_CLAMP, row["teacher_child_cp"]))
            board_rows.append(padded)
            hand_rows.append(hands)
            clamped_cps.append(float(cp))
            targets.append(1.0 / (1.0 + math.exp(-float(cp) / K_SIGMOID)))
            buckets.append(bucket)
            rows.append(row)
    if (
        parsed_bytes != identity["bytes"]
        or parsed_digest.hexdigest() != identity["sha256"]
        or parsed_lines != line_count
    ):
        raise DirectTeacherTrainingError(
            f"{role} dataset changed between identity capture and parsing"
        )

    actual_counts = {
        "rows": len(rows),
        "parents": len({row["parent_id"] for row in rows}),
        "games": len({row["game_id"] for row in rows}),
        "game_ids_sha256": PROTOCOL.id_set_sha256(
            {row["game_id"] for row in rows}
        ),
        "parent_ids_sha256": PROTOCOL.id_set_sha256(
            {row["parent_id"] for row in rows}
        ),
        "position_ids_sha256": PROTOCOL.id_set_sha256(
            {row["position_id"] for row in rows}
        ),
        "child_position_ids_sha256": PROTOCOL.id_set_sha256(
            {row["child_position_id"] for row in rows}
        ),
        "semantic_position_ids_sha256": PROTOCOL.id_set_sha256(
            {
                identifier
                for row in rows
                for identifier in (row["position_id"], row["child_position_id"])
            }
        ),
    }
    for field, observed in actual_counts.items():
        if observed != declared.get(field):
            raise DirectTeacherTrainingError(
                f"{role} dataset {field} differs: {observed} != {declared.get(field)}"
            )
    if not rows:
        raise DirectTeacherTrainingError(f"{role} dataset is empty")
    tensors = (
        torch.tensor(board_rows, dtype=torch.long),
        torch.tensor(hand_rows, dtype=torch.float32),
        torch.tensor(targets, dtype=torch.float32),
        torch.tensor(clamped_cps, dtype=torch.float32),
        torch.tensor(buckets, dtype=torch.long),
    )
    return tensors, rows, {**identity, **actual_counts, "row_schema": PROTOCOL.ROW_SCHEMA}


def dataset_identifier_sets(
    rows: Sequence[Mapping[str, Any]],
) -> dict[str, set[str]]:
    """Recompute every cross-role isolation set from parsed rows."""

    games = {str(row["game_id"]) for row in rows}
    parents = {str(row["parent_id"]) for row in rows}
    positions = {str(row["position_id"]) for row in rows}
    children = {str(row["child_position_id"]) for row in rows}
    return {
        "game_ids": games,
        "parent_ids": parents,
        "position_ids": positions,
        "child_position_ids": children,
        "semantic_position_ids": positions | children,
    }


def require_zero_cross_role_overlap(
    training_rows: Sequence[Mapping[str, Any]],
    validation_rows: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Fail before optimizer creation if any actual ID set crosses roles."""

    training_sets = dataset_identifier_sets(training_rows)
    validation_sets = dataset_identifier_sets(validation_rows)
    overlap_counts: dict[str, int] = {}
    for label in (
        "game_ids",
        "parent_ids",
        "position_ids",
        "child_position_ids",
        "semantic_position_ids",
    ):
        overlap = training_sets[label] & validation_sets[label]
        overlap_counts[label] = len(overlap)
        if overlap:
            raise DirectTeacherTrainingError(
                f"training/validation {label} overlap"
            )
    return {
        "status": "verified-zero-cross-role-overlap",
        "overlap_counts": overlap_counts,
    }


def direct_scalar_bce(logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
    if logits.shape != targets.shape:
        raise DirectTeacherTrainingError("direct BCE logits/targets shape mismatch")
    if not bool(torch.isfinite(logits).all().item()) or not bool(
        torch.isfinite(targets).all().item()
    ):
        raise DirectTeacherTrainingError("direct BCE inputs are non-finite")
    if not bool(((targets >= 0.0) & (targets <= 1.0)).all().item()):
        raise DirectTeacherTrainingError("direct BCE targets escape [0,1]")
    return F.binary_cross_entropy_with_logits(logits, targets)


def _model_outputs(
    model: torch.nn.Module,
    tensors: tuple[torch.Tensor, ...],
    *,
    device: torch.device,
    batch_size: int = 4096,
) -> torch.Tensor:
    board, hands, targets, _cps, buckets = tensors
    outputs: list[torch.Tensor] = []
    model.eval()
    with torch.no_grad():
        for start in range(0, int(targets.shape[0]), batch_size):
            stop = min(start + batch_size, int(targets.shape[0]))
            values = model(
                board[start:stop].to(device),
                hands[start:stop].to(device),
                buckets[start:stop].to(device),
            )
            if not bool(torch.isfinite(values).all().item()):
                raise DirectTeacherTrainingError("inference produced non-finite values")
            outputs.append(values.detach().cpu())
    return torch.cat(outputs)


def pair_accuracy(
    outputs: torch.Tensor,
    child_cp: torch.Tensor,
    rows: Sequence[Mapping[str, Any]],
) -> tuple[float, int, int]:
    if outputs.shape != child_cp.shape or outputs.ndim != 1:
        raise DirectTeacherTrainingError("pair metric vectors differ")
    groups: dict[str, list[int]] = defaultdict(list)
    for index, row in enumerate(rows):
        groups[str(row["parent_id"])].append(index)
    correct = 0
    total = 0
    for indices in groups.values():
        for left_offset, left in enumerate(indices):
            for right in indices[left_offset + 1 :]:
                teacher_delta = float(child_cp[left] - child_cp[right])
                if teacher_delta == 0:
                    continue
                predicted_delta = float(outputs[left] - outputs[right])
                correct += int(teacher_delta * predicted_delta > 0)
                total += 1
    if total == 0:
        raise DirectTeacherTrainingError("validation has no non-tied teacher pair")
    return correct / total, correct, total


def validation_metrics(
    outputs: torch.Tensor,
    tensors: tuple[torch.Tensor, ...],
    rows: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    targets = tensors[2]
    child_cp = tensors[3]
    loss = F.binary_cross_entropy_with_logits(outputs, targets).item()
    mae = torch.mean(torch.abs(outputs * K_SIGMOID - child_cp)).item()
    pair, correct, total = pair_accuracy(outputs, child_cp, rows)
    metrics = {
        "direct_scalar_bce": float(loss),
        "teacher_mae_cp": float(mae),
        "pair_accuracy": float(pair),
        "pair_correct": correct,
        "pair_total": total,
        "rows": int(outputs.shape[0]),
        "teacher_cp_basis": "teacher_child_cp-clamped-to-plus-minus-3000",
    }
    if not all(
        math.isfinite(value)
        for key, value in metrics.items()
        if key in ("direct_scalar_bce", "teacher_mae_cp", "pair_accuracy")
    ):
        raise DirectTeacherTrainingError("validation metrics are non-finite")
    return metrics


def train_exactly_one_epoch(
    model: torch.nn.Module,
    tensors: tuple[torch.Tensor, ...],
    *,
    device: torch.device,
    one_shot_claim: Mapping[str, Any],
) -> dict[str, Any]:
    reauthenticate_one_shot_claim(one_shot_claim)
    if any(not parameter.requires_grad for parameter in model.parameters()):
        raise DirectTeacherTrainingError("all model parameters must be trainable")
    parameters = tuple(model.parameters())
    optimizer = torch.optim.AdamW(
        parameters, lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY
    )
    optimizer_ids = {
        id(parameter)
        for group in optimizer.param_groups
        for parameter in group["params"]
    }
    if optimizer_ids != {id(parameter) for parameter in parameters}:
        raise DirectTeacherTrainingError("optimizer does not own every parameter exactly")
    board, hands, targets, _cps, buckets = tensors
    generator = torch.Generator(device="cpu").manual_seed(SEED)
    order = torch.randperm(int(targets.shape[0]), generator=generator)
    model.train()
    loss_sum = 0.0
    consumed = 0
    started = time.monotonic()
    for start in range(0, int(targets.shape[0]), BATCH):
        selected = order[start : start + BATCH]
        logits = model(
            board[selected].to(device),
            hands[selected].to(device),
            buckets[selected].to(device),
        )
        loss = direct_scalar_bce(logits, targets[selected].to(device))
        if not bool(torch.isfinite(loss).item()):
            raise DirectTeacherTrainingError("training loss is non-finite")
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        for name, parameter in model.named_parameters():
            if parameter.grad is None or not bool(
                torch.isfinite(parameter.grad).all().item()
            ):
                raise DirectTeacherTrainingError(
                    f"all-parameter gradient missing/non-finite: {name}"
                )
        optimizer.step()
        rows = int(selected.shape[0])
        loss_sum += float(loss.item()) * rows
        consumed += rows
    if consumed != int(targets.shape[0]):
        raise DirectTeacherTrainingError("one epoch did not consume every training row")
    train.require_finite_model_parameters(model, "direct-teacher epoch 1 final")
    return {
        "epoch": 1,
        "rows": consumed,
        "direct_scalar_bce": loss_sum / consumed,
        "seconds": time.monotonic() - started,
        "optimizer": "AdamW",
        "scheduler": "constant-none",
        "learning_rate": LEARNING_RATE,
        "weight_decay": WEIGHT_DECAY,
        "batch": BATCH,
        "seed": SEED,
        "parameter_scope": "all",
    }


def _write_tensor(target, tensor: torch.Tensor, typecode: str) -> None:
    flat = tensor.detach().cpu().contiguous().view(-1)
    expected_itemsize = 2 if typecode == "h" else 4 if typecode == "i" else 0
    if expected_itemsize == 0:
        raise DirectTeacherTrainingError("unsupported export type")
    for start in range(0, flat.numel(), 262_144):
        values = array.array(typecode, flat[start : start + 262_144].tolist())
        if values.itemsize != expected_itemsize:
            raise DirectTeacherTrainingError("host integer size differs")
        if sys.byteorder == "big":
            values.byteswap()
        target.write(values.tobytes())


def export_quantized_weights(
    model: torch.nn.Module, path: str
) -> tuple[dict[str, torch.Tensor], dict[str, Any]]:
    qweights = quantize_model(model)

    def write_export(target: BinaryIO) -> None:
        for name, typecode in EXPORT_LAYOUT:
            _write_tensor(target, qweights[name], typecode)

    identity = _atomic_publish_create_only(
        path,
        label="HalfKP81 research export",
        writer=write_export,
        expected_bytes=EXPECTED_EXPORT_BYTES,
    )
    return qweights, {**identity, "buckets": BUCKETS}


def read_quantized_weights(
    path: str, model: torch.nn.Module
) -> dict[str, torch.Tensor]:
    """Read the exact exported layout back into integer tensors."""

    with open(path, "rb") as source:
        raw = source.read()
    if len(raw) != EXPECTED_EXPORT_BYTES:
        raise DirectTeacherTrainingError("roundtrip export byte count differs")
    shapes = {
        "w1_board": (model.board_feats, train.DistillNet.H1),
        "w1_hand": (model.hand_feats, train.DistillNet.H1),
        "b1": (train.DistillNet.H1,),
        "w2": (train.DistillNet.H2, train.DistillNet.H1),
        "b2": (train.DistillNet.H2,),
        "w3": (train.DistillNet.H2,),
        "b3": (1,),
    }
    offset = 0
    result: dict[str, torch.Tensor] = {}
    for name, typecode in EXPORT_LAYOUT:
        shape = shapes[name]
        count = math.prod(shape)
        itemsize = 2 if typecode == "h" else 4
        end = offset + count * itemsize
        values = array.array(typecode)
        values.frombytes(raw[offset:end])
        if values.itemsize != itemsize or len(values) != count:
            raise DirectTeacherTrainingError(f"roundtrip component {name} is truncated")
        if sys.byteorder == "big":
            values.byteswap()
        dtype = torch.int16 if typecode == "h" else torch.int32
        result[name] = torch.tensor(values, dtype=dtype).reshape(shape)
        offset = end
    if offset != len(raw):
        raise DirectTeacherTrainingError("roundtrip parser did not consume the export")
    return result


def _expanded_hands(
    raw_hands: torch.Tensor, buckets: torch.Tensor
) -> torch.Tensor:
    batch = int(raw_hands.shape[0])
    expanded = raw_hands.new_zeros(batch, BUCKETS, train.HAND_FEATS)
    expanded[torch.arange(batch), buckets] = raw_hands
    return expanded.reshape(batch, BUCKETS * train.HAND_FEATS)


def int16_outputs(
    qweights: Mapping[str, torch.Tensor],
    tensors: tuple[torch.Tensor, ...],
    *,
    batch_size: int = 512,
) -> tuple[torch.Tensor, torch.Tensor]:
    board, hands, targets, _cp, buckets = tensors
    out_q_parts: list[torch.Tensor] = []
    for start in range(0, int(targets.shape[0]), batch_size):
        stop = min(start + batch_size, int(targets.shape[0]))
        out_q_parts.append(
            int16_forward_batch(
                qweights,
                board[start:stop],
                _expanded_hands(hands[start:stop], buckets[start:stop]),
                BUCKETS * train.BOARD_FEATS,
            ).cpu()
        )
    out_q = torch.cat(out_q_parts)
    cp = torch.div(
        out_q.to(torch.int64) * int(K_SIGMOID),
        OUT_SCALE,
        rounding_mode="trunc",
    )
    return out_q, cp


def quantization_metrics(
    float_outputs: torch.Tensor, int_cp: torch.Tensor
) -> dict[str, float]:
    errors = torch.abs(float_outputs * K_SIGMOID - int_cp.to(torch.float32))
    result = {
        "mean_abs_cp_delta": float(errors.mean().item()),
        "max_abs_cp_delta": float(errors.max().item()),
    }
    if not all(math.isfinite(value) and value >= 0 for value in result.values()):
        raise DirectTeacherTrainingError("quantization metrics are invalid")
    return result


def safe_ratio(candidate: float, initializer: float) -> float:
    if not all(math.isfinite(value) and value >= 0 for value in (candidate, initializer)):
        raise DirectTeacherTrainingError("quantization ratio inputs are invalid")
    if initializer == 0:
        return 1.0 if candidate == 0 else sys.float_info.max
    return candidate / initializer


def _canonical_create_only(path: str, value: Mapping[str, Any]) -> dict[str, Any]:
    raw = PROTOCOL.canonical_json_bytes(value)

    def write_receipt(target: BinaryIO) -> None:
        target.write(raw)

    return _atomic_publish_create_only(
        path,
        label=os.path.basename(path),
        writer=write_receipt,
        expected_bytes=len(raw),
    )


def acquire_one_shot_claim(
    *,
    execution_plan: Mapping[str, Any],
    implementation: Mapping[str, Any],
    output_path: str,
    claim_root: str,
) -> dict[str, Any]:
    """Atomically consume one global claim keyed only by execution-plan SHA."""

    plan_sha256 = str(execution_plan["sha256"])
    if SHA256_RE.fullmatch(plan_sha256) is None:
        raise DirectTeacherTrainingError("execution plan SHA-256 is invalid for claim")
    revision = implementation.get("source_revision")
    if type(revision) is not str or re.fullmatch(r"[0-9a-f]{40}", revision) is None:
        raise DirectTeacherTrainingError("pipeline revision is invalid for claim")
    requested_claim_root = os.path.abspath(claim_root)
    if os.path.islink(requested_claim_root):
        raise DirectTeacherTrainingError("one-shot claim root must not be a symlink")
    claim_root = os.path.realpath(requested_claim_root)
    claim_root_created = False
    try:
        os.mkdir(claim_root, 0o700)
        claim_root_created = True
    except FileExistsError:
        pass
    claim_stat = os.lstat(claim_root)
    if (
        not os.path.isdir(claim_root)
        or os.path.islink(claim_root)
        or claim_stat.st_uid != os.getuid()
        or claim_stat.st_mode & 0o077
    ):
        raise DirectTeacherTrainingError(
            "one-shot claim root must be an owned non-symlink 0700 directory"
        )
    if claim_root_created:
        parent_fd = os.open(os.path.dirname(claim_root), os.O_RDONLY)
        try:
            os.fsync(parent_fd)
        finally:
            os.close(parent_fd)
    claim_path = os.path.join(claim_root, f"{plan_sha256}.json")
    owner = {
        "kind": "direct-teacher-halfkp81-v2-one-shot-trainer",
        "pid": os.getpid(),
        "pipeline_revision": revision,
    }
    document = {
        "schema": CLAIM_SCHEMA,
        "status": "exclusive-one-shot-claimed-no-retry",
        "owner": owner,
        "execution_plan": dict(execution_plan),
        "output_path": os.path.realpath(output_path),
        "live_weight_write_authorized": False,
    }
    try:
        identity = _canonical_create_only(claim_path, document)
    except DirectTeacherTrainingError as error:
        if os.path.lexists(claim_path):
            raise DirectTeacherTrainingError(
                "execution plan already has a one-shot claim; rerun refused"
            ) from error
        raise
    observed, observed_identity = PROTOCOL.load_strict_json_file(
        claim_path, "one-shot training claim"
    )
    if observed != document or any(
        observed_identity[field] != identity[field] for field in ("bytes", "sha256")
    ):
        raise DirectTeacherTrainingError(
            "one-shot claim changed during post-publication authentication"
        )
    return {
        "identity": {**identity, "schema": CLAIM_SCHEMA},
        "status": document["status"],
        "owner": owner,
        "execution_plan": dict(execution_plan),
        "output_path": document["output_path"],
        "live_weight_write_authorized": False,
    }


def validate_one_shot_claim_receipt(
    value: Any,
    *,
    execution_plan: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    expected_keys = {
        "identity",
        "status",
        "owner",
        "execution_plan",
        "output_path",
        "live_weight_write_authorized",
    }
    if type(value) is not dict or set(value) != expected_keys:
        raise DirectTeacherTrainingError("one-shot claim receipt fields are not exact")
    _validate_public_identity(
        value["identity"], label="one-shot claim", schema=CLAIM_SCHEMA
    )
    _validate_public_identity(
        value["execution_plan"],
        label="claimed execution plan",
        schema=PROTOCOL.EXECUTION_PLAN_SCHEMA,
    )
    owner = value["owner"]
    if (
        type(owner) is not dict
        or set(owner) != {"kind", "pid", "pipeline_revision"}
        or owner["kind"] != "direct-teacher-halfkp81-v2-one-shot-trainer"
        or type(owner["pid"]) is not int
        or owner["pid"] <= 0
        or type(owner["pipeline_revision"]) is not str
        or re.fullmatch(r"[0-9a-f]{40}", owner["pipeline_revision"]) is None
        or value["status"] != "exclusive-one-shot-claimed-no-retry"
        or type(value["output_path"]) is not str
        or not os.path.isabs(value["output_path"])
        or value["live_weight_write_authorized"] is not False
    ):
        raise DirectTeacherTrainingError("one-shot claim receipt is invalid")
    if execution_plan is not None and value["execution_plan"] != execution_plan:
        raise DirectTeacherTrainingError(
            "one-shot claim is not bound to the execution plan"
        )
    return dict(value)


def reauthenticate_one_shot_claim(
    value: Any,
    *,
    execution_plan: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    receipt = validate_one_shot_claim_receipt(
        value, execution_plan=execution_plan
    )
    expected_document = {
        "schema": CLAIM_SCHEMA,
        "status": receipt["status"],
        "owner": receipt["owner"],
        "execution_plan": receipt["execution_plan"],
        "output_path": receipt["output_path"],
        "live_weight_write_authorized": False,
    }
    observed, observed_identity = PROTOCOL.load_strict_json_file(
        receipt["identity"]["path"], "one-shot training claim"
    )
    if observed != expected_document or any(
        observed_identity[field] != receipt["identity"][field]
        for field in ("path", "bytes", "sha256")
    ):
        raise DirectTeacherTrainingError(
            "one-shot claim bytes or binding changed after acquisition"
        )
    return receipt


def build_reference(
    *,
    rows: Sequence[Mapping[str, Any]],
    float_outputs: torch.Tensor,
    out_q: torch.Tensor,
    int_cp: torch.Tensor,
    candidate_weights: Mapping[str, Any],
) -> dict[str, Any]:
    count = min(len(rows), REFERENCE_LIMIT)
    positions = [
        {
            "child_position_id": rows[index]["child_position_id"],
            "sfen": rows[index]["child_sfen"],
            "float_logit": float(float_outputs[index].item()),
            "cp_float": float(float_outputs[index].item() * K_SIGMOID),
            "out_q": int(out_q[index].item()),
            "cp_int": int(int_cp[index].item()),
        }
        for index in range(count)
    ]
    return {
        "schema": REFERENCE_SCHEMA,
        "candidate_weights": {
            key: candidate_weights[key]
            for key in ("path", "bytes", "sha256", "buckets")
        },
        "features": FEATURES,
        "k_sigmoid": K_SIGMOID,
        "k_int": int(K_SIGMOID),
        "positions": positions,
        "n": count,
    }


def validate_runtime_receipt(
    value: Any,
    *,
    initializer_weights: Mapping[str, Any],
    candidate_weights: Mapping[str, Any],
    reference: Mapping[str, Any],
    reference_identity: Mapping[str, Any],
    wasm_identity: Mapping[str, Any],
) -> dict[str, Any]:
    expected_keys = {
        "schema",
        "status",
        "runtime",
        "config",
        "models",
        "reference",
        "parity",
        "fixed_depth_search",
        "throughput",
        "technical_faults",
    }
    if type(value) is not dict or set(value) != expected_keys:
        raise DirectTeacherTrainingError("runtime sanity fields are not exact")
    if value["schema"] != RUNTIME_SCHEMA or value["status"] not in (
        "complete-pass",
        "complete-fail",
    ):
        raise DirectTeacherTrainingError("runtime sanity schema/status mismatch")
    if value["runtime"] != dict(wasm_identity):
        raise DirectTeacherTrainingError("runtime WASM binding mismatch")
    if value["models"] != {
        "initializer": {
            key: initializer_weights[key]
            for key in ("path", "bytes", "sha256", "buckets")
        },
        "candidate": {
            key: candidate_weights[key]
            for key in ("path", "bytes", "sha256", "buckets")
        },
    }:
        raise DirectTeacherTrainingError("runtime model binding mismatch")
    if value["reference"] != {
        **{
            key: reference_identity[key]
            for key in ("path", "bytes", "sha256")
        },
        "schema": REFERENCE_SCHEMA,
        "positions": reference["n"],
    }:
        raise DirectTeacherTrainingError("runtime reference binding mismatch")
    config = value["config"]
    if config != {
        "position_count": 1000,
        "search_cases": 6,
        "depth": 5,
        "q_depth": 8,
        "repetitions": 3,
        "minimum_timing_ms": 250,
        "slowdown_percent_maximum": 5,
        "k": 600,
        "buckets": 81,
    }:
        raise DirectTeacherTrainingError("runtime config drifted")
    parity = value["parity"]
    if (
        type(parity) is not dict
        or set(parity) != {"tested", "mismatches", "examples"}
        or parity["tested"] != reference["n"]
        or type(parity["mismatches"]) is not int
        or parity["mismatches"] < 0
    ):
        raise DirectTeacherTrainingError("runtime parity receipt is invalid")
    faults = value["technical_faults"]
    if type(faults) is not int or faults < 0:
        raise DirectTeacherTrainingError("runtime technical fault count is invalid")
    throughput = value["throughput"]
    throughput_keys = {
        "method",
        "rows",
        "initializer_aggregate_nps",
        "candidate_aggregate_nps",
        "median_slowdown_percent",
        "aggregate_slowdown_percent",
        "slowdown_percent_maximum",
        "passed",
    }
    if type(throughput) is not dict or set(throughput) != throughput_keys:
        raise DirectTeacherTrainingError("runtime throughput is invalid")
    for field in ("median_slowdown_percent", "aggregate_slowdown_percent"):
        metric = throughput.get(field)
        if type(metric) not in (int, float) or not math.isfinite(float(metric)):
            raise DirectTeacherTrainingError(f"runtime {field} is invalid")
    speed_pass = (
        float(throughput["median_slowdown_percent"]) <= 5
        and float(throughput["aggregate_slowdown_percent"]) <= 5
    )
    if (
        throughput["slowdown_percent_maximum"] != 5
        or type(throughput["passed"]) is not bool
        or throughput["passed"] is not speed_pass
    ):
        raise DirectTeacherTrainingError("runtime throughput status contradicts metrics")
    fixed = value["fixed_depth_search"]
    if (
        type(fixed) is not dict
        or set(fixed)
        != {"cases", "corpus_positions", "generating_king_moves", "rows"}
        or fixed["cases"] != 6
        or fixed["corpus_positions"] != 1000
        or type(fixed["generating_king_moves"]) is not int
        or fixed["generating_king_moves"] < 1
        or type(fixed["rows"]) is not list
        or len(fixed["rows"]) != 6
    ):
        raise DirectTeacherTrainingError("runtime fixed-depth receipt is invalid")
    should_pass = (
        parity["mismatches"] == 0
        and faults == 0
        and speed_pass
    )
    if (value["status"] == "complete-pass") is not should_pass:
        raise DirectTeacherTrainingError("runtime status contradicts its measurements")
    return dict(value)


def _check(observed: Any, requirement: Any, passed: bool) -> dict[str, Any]:
    return {"observed": observed, "requirement": requirement, "passed": bool(passed)}


def _validate_public_identity(
    value: Any, *, label: str, schema: str | None = None, buckets: int | None = None
) -> dict[str, Any]:
    expected_keys = {"path", "bytes", "sha256"}
    if schema is not None:
        expected_keys.add("schema")
    if buckets is not None:
        expected_keys.add("buckets")
    if type(value) is not dict or set(value) != expected_keys:
        raise DirectTeacherTrainingError(f"{label} identity fields are not exact")
    if (
        type(value["path"]) is not str
        or not os.path.isabs(value["path"])
        or type(value["bytes"]) is not int
        or value["bytes"] < 1
        or type(value["sha256"]) is not str
        or SHA256_RE.fullmatch(value["sha256"]) is None
    ):
        raise DirectTeacherTrainingError(f"{label} identity is invalid")
    if schema is not None and value["schema"] != schema:
        raise DirectTeacherTrainingError(f"{label} schema differs")
    if buckets is not None and value["buckets"] != buckets:
        raise DirectTeacherTrainingError(f"{label} bucket count differs")
    return dict(value)


def validate_static_sanity_result(value: Any) -> dict[str, Any]:
    expected_keys = {
        "schema",
        "status",
        "protocol",
        "execution_plan",
        "dataset_manifest",
        "initializer",
        "live_weights",
        "one_shot_claim",
        "trainer_result",
        "candidate_weights",
        "runtime_sanity",
        "checks",
        "all_checks_passed",
        "technical_faults",
        "paired56_authorized",
        "expanded_stage_authorized",
        "live_weight_write_authorized",
    }
    if type(value) is not dict or set(value) != expected_keys:
        raise DirectTeacherTrainingError("static sanity fields are not exact")
    if value["schema"] != STATIC_RESULT_SCHEMA:
        raise DirectTeacherTrainingError("static sanity schema differs")
    _validate_public_identity(
        value["protocol"], label="static protocol", schema=PROTOCOL.PROTOCOL_SCHEMA
    )
    _validate_public_identity(
        value["execution_plan"],
        label="static execution plan",
        schema=PROTOCOL.EXECUTION_PLAN_SCHEMA,
    )
    _validate_public_identity(
        value["dataset_manifest"],
        label="static dataset manifest",
        schema=PROTOCOL.DATASET_MANIFEST_SCHEMA,
    )
    _validate_public_identity(value["initializer"], label="static initializer")
    _validate_public_identity(value["live_weights"], label="static live weights")
    validate_one_shot_claim_receipt(
        value["one_shot_claim"], execution_plan=value["execution_plan"]
    )
    _validate_public_identity(
        value["trainer_result"],
        label="static trainer result",
        schema=TRAINER_RESULT_SCHEMA,
    )
    _validate_public_identity(
        value["candidate_weights"],
        label="static candidate weights",
        buckets=BUCKETS,
    )
    _validate_public_identity(
        value["runtime_sanity"],
        label="static runtime sanity",
        schema=RUNTIME_SCHEMA,
    )
    checks = value["checks"]
    contract = PROTOCOL.EXPECTED_STATIC_SANITY["checks"]
    if type(checks) is not dict or set(checks) != set(contract):
        raise DirectTeacherTrainingError("static sanity check set differs")
    for name, requirement in contract.items():
        item = checks[name]
        if (
            type(item) is not dict
            or set(item) != {"observed", "requirement", "passed"}
            or type(item["passed"]) is not bool
            or type(item["requirement"]) is not type(requirement)
            or item["requirement"] != requirement
        ):
            raise DirectTeacherTrainingError(f"static sanity check differs: {name}")
        observed = item["observed"]
        if name == "finite_training_and_inference":
            expected_pass = type(observed) is bool and observed is True
        else:
            if (
                type(observed) not in (int, float)
                or type(observed) is bool
                or not math.isfinite(float(observed))
            ):
                raise DirectTeacherTrainingError(
                    f"static sanity observation is invalid: {name}"
                )
            expected_pass = (
                observed >= requirement
                if name
                in {
                    "teacher_mae_cp_improvement_minimum",
                    "pair_accuracy_delta_minimum",
                }
                else observed <= requirement
            )
        if item["passed"] is not expected_pass:
            raise DirectTeacherTrainingError(
                f"static sanity pass flag contradicts observation: {name}"
            )
    all_passed = all(item["passed"] for item in checks.values())
    if (
        type(value["technical_faults"]) is not int
        or value["technical_faults"] < 0
        or value["technical_faults"]
        != checks["technical_faults_maximum"]["observed"]
        or type(value["all_checks_passed"]) is not bool
        or value["all_checks_passed"] is not all_passed
        or type(value["paired56_authorized"]) is not bool
        or value["paired56_authorized"] is not all_passed
        or value["expanded_stage_authorized"] is not False
        or value["live_weight_write_authorized"] is not False
    ):
        raise DirectTeacherTrainingError("static sanity authority contradicts checks")
    expected_status = (
        "passed-all-checks-paired56-authorized"
        if all_passed
        else "failed-one-or-more-checks-pilot-family-closed"
    )
    if value["status"] != expected_status:
        raise DirectTeacherTrainingError("static sanity status contradicts checks")
    return dict(value)


def build_static_sanity_result(
    *,
    protocol: Mapping[str, Any],
    execution_plan: Mapping[str, Any],
    dataset_manifest: Mapping[str, Any],
    initializer: Mapping[str, Any],
    live_weights: Mapping[str, Any],
    one_shot_claim: Mapping[str, Any],
    trainer_result: Mapping[str, Any],
    candidate_weights: Mapping[str, Any],
    runtime_sanity: Mapping[str, Any],
    baseline_metrics: Mapping[str, Any],
    candidate_metrics: Mapping[str, Any],
    initializer_quantization: Mapping[str, float],
    candidate_quantization: Mapping[str, float],
    runtime_receipt: Mapping[str, Any],
    finite_training_and_inference: bool,
    export_roundtrip_mismatches: int,
) -> dict[str, Any]:
    contract = PROTOCOL.EXPECTED_STATIC_SANITY["checks"]
    mae_improvement = float(baseline_metrics["teacher_mae_cp"]) - float(
        candidate_metrics["teacher_mae_cp"]
    )
    pair_delta = float(candidate_metrics["pair_accuracy"]) - float(
        baseline_metrics["pair_accuracy"]
    )
    mean_ratio = safe_ratio(
        candidate_quantization["mean_abs_cp_delta"],
        initializer_quantization["mean_abs_cp_delta"],
    )
    max_ratio = safe_ratio(
        candidate_quantization["max_abs_cp_delta"],
        initializer_quantization["max_abs_cp_delta"],
    )
    runtime_parity = int(runtime_receipt["parity"]["mismatches"])
    technical_faults = int(runtime_receipt["technical_faults"])
    runtime_slowdown = max(
        float(runtime_receipt["throughput"]["median_slowdown_percent"]),
        float(runtime_receipt["throughput"]["aggregate_slowdown_percent"]),
    )
    checks = {
        "finite_training_and_inference": _check(
            finite_training_and_inference, True, finite_training_and_inference
        ),
        "technical_faults_maximum": _check(
            technical_faults,
            contract["technical_faults_maximum"],
            technical_faults <= contract["technical_faults_maximum"],
        ),
        "float_export_roundtrip_mismatches_maximum": _check(
            export_roundtrip_mismatches,
            contract["float_export_roundtrip_mismatches_maximum"],
            export_roundtrip_mismatches
            <= contract["float_export_roundtrip_mismatches_maximum"],
        ),
        "wasm_parity_mismatches_maximum": _check(
            runtime_parity,
            contract["wasm_parity_mismatches_maximum"],
            runtime_parity <= contract["wasm_parity_mismatches_maximum"],
        ),
        "teacher_mae_cp_improvement_minimum": _check(
            mae_improvement,
            contract["teacher_mae_cp_improvement_minimum"],
            mae_improvement >= contract["teacher_mae_cp_improvement_minimum"],
        ),
        "pair_accuracy_delta_minimum": _check(
            pair_delta,
            contract["pair_accuracy_delta_minimum"],
            pair_delta >= contract["pair_accuracy_delta_minimum"],
        ),
        "quantized_mean_abs_cp_delta_ratio_maximum": _check(
            mean_ratio,
            contract["quantized_mean_abs_cp_delta_ratio_maximum"],
            mean_ratio
            <= contract["quantized_mean_abs_cp_delta_ratio_maximum"],
        ),
        "quantized_max_abs_cp_delta_ratio_maximum": _check(
            max_ratio,
            contract["quantized_max_abs_cp_delta_ratio_maximum"],
            max_ratio <= contract["quantized_max_abs_cp_delta_ratio_maximum"],
        ),
        "research_runtime_search_slowdown_percent_maximum": _check(
            runtime_slowdown,
            contract["research_runtime_search_slowdown_percent_maximum"],
            runtime_slowdown
            <= contract["research_runtime_search_slowdown_percent_maximum"],
        ),
    }
    all_passed = all(item["passed"] is True for item in checks.values())
    result = {
        "schema": STATIC_RESULT_SCHEMA,
        "status": (
            "passed-all-checks-paired56-authorized"
            if all_passed
            else "failed-one-or-more-checks-pilot-family-closed"
        ),
        "protocol": dict(protocol),
        "execution_plan": dict(execution_plan),
        "dataset_manifest": dict(dataset_manifest),
        "initializer": dict(initializer),
        "live_weights": dict(live_weights),
        "one_shot_claim": validate_one_shot_claim_receipt(
            one_shot_claim, execution_plan=execution_plan
        ),
        "trainer_result": dict(trainer_result),
        "candidate_weights": {
            key: candidate_weights[key]
            for key in ("path", "bytes", "sha256", "buckets")
        },
        "runtime_sanity": dict(runtime_sanity),
        "checks": checks,
        "all_checks_passed": all_passed,
        "technical_faults": technical_faults,
        "paired56_authorized": all_passed,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
    }
    return validate_static_sanity_result(result)


def _assert_path_isolation(
    out_dir: str, inputs: Iterable[str], live_path: str
) -> None:
    output = os.path.realpath(out_dir)
    for path in inputs:
        source = os.path.realpath(path)
        if output == source or output.startswith(source + os.sep):
            raise DirectTeacherTrainingError("output directory is inside an input")
        if source.startswith(output + os.sep):
            raise DirectTeacherTrainingError("input is inside the output directory")
    if output == os.path.realpath(live_path) or os.path.realpath(live_path).startswith(
        output + os.sep
    ):
        raise DirectTeacherTrainingError("output aliases or contains live weights")


def run(
    args: argparse.Namespace,
    *,
    allow_cpu_for_tests: bool = False,
    runtime_runner=subprocess.run,
) -> dict[str, Any]:
    repo_root = os.path.realpath(args.repo_root)
    plan, plan_identity, protocol, manifest = load_and_rebuild_execution_plan(
        args.execution_plan, repo_root=repo_root
    )
    validate_fixed_training_contract(plan)
    implementation = train.verify_training_pipeline_revision(args.pipeline_revision)

    initializer_path = str(plan["inputs"]["initializer"]["path"])
    live_path = str(plan["inputs"]["live_weights"]["path"])
    train_path = str(plan["inputs"]["training_dataset"]["path"])
    validation_path = str(plan["inputs"]["validation_dataset"]["path"])
    claim_root = os.path.join(
        os.path.dirname(
            os.path.dirname(
                os.path.realpath(str(plan["dataset_manifest"]["path"]))
            )
        ),
        ".direct-teacher-halfkp81-v2-one-shot-claims",
    )
    wasm_path = os.path.join(repo_root, RUNTIME_WASM)
    runtime_script = os.path.join(repo_root, RUNTIME_SCRIPT)
    input_paths = (
        args.execution_plan,
        str(plan["protocol"]["path"]),
        str(plan["dataset_manifest"]["path"]),
        initializer_path,
        live_path,
        train_path,
        validation_path,
        wasm_path,
        runtime_script,
    )
    _assert_path_isolation(args.out, input_paths, live_path)
    if os.path.lexists(args.out):
        raise DirectTeacherTrainingError("output slot already exists")

    live_before = _identity(live_path, "immutable live weights before training")
    _require_exact_identity(live_before, plan["inputs"]["live_weights"], "live weights")
    wasm_identity = _identity(wasm_path, "HalfKP81 research WASM")
    _require_exact_identity(wasm_identity, EXPECTED_RUNTIME_WASM, "runtime WASM")
    _identity(runtime_script, "direct-teacher runtime sanity script")

    training_tensors, training_rows, training_identity = load_bound_dataset(
        train_path, plan["inputs"]["training_dataset"], role="training"
    )
    validation_tensors, validation_rows, validation_identity = load_bound_dataset(
        validation_path, plan["inputs"]["validation_dataset"], role="validation"
    )
    dataset_disjointness = require_zero_cross_role_overlap(
        training_rows, validation_rows
    )

    if not allow_cpu_for_tests and not torch.backends.mps.is_available():
        raise DirectTeacherTrainingError("fixed MPS device is unavailable")
    execution_plan_receipt = {
        **plan_identity,
        "schema": PROTOCOL.EXECUTION_PLAN_SCHEMA,
    }
    device = torch.device("cpu" if allow_cpu_for_tests else "mps")
    torch.manual_seed(SEED)
    random.seed(SEED)
    model = train.DistillNet(FEATURES)
    expected_arch = train.expected_arch(
        features=FEATURES,
        input_dim=model.arch_input_dim,
        h1=train.DistillNet.H1,
        h2=train.DistillNet.H2,
        k=K_SIGMOID,
        kp_buckets=BUCKETS,
    )
    checkpoint, initializer_identity = train.load_stable_torch_checkpoint(
        initializer_path,
        weights_only=True,
        expected_sha256=PROTOCOL.EXPECTED_INPUTS["initializer"]["sha256"],
    )
    _require_exact_identity(
        initializer_identity, PROTOCOL.EXPECTED_INPUTS["initializer"], "initializer"
    )
    try:
        train.validate_arch(checkpoint["arch"], expected_arch)
        model.load_state_dict(checkpoint["model"], strict=True)
    except (KeyError, RuntimeError, TypeError, ValueError) as error:
        raise DirectTeacherTrainingError("initializer architecture/model mismatch") from error
    train.require_finite_model_parameters(model, "exact HalfKP81 initializer")
    if any(not parameter.requires_grad for parameter in model.parameters()):
        raise DirectTeacherTrainingError("initializer is not all-parameter trainable")
    one_shot_claim = acquire_one_shot_claim(
        execution_plan=execution_plan_receipt,
        implementation=implementation,
        output_path=args.out,
        claim_root=claim_root,
    )
    reauthenticate_one_shot_claim(
        one_shot_claim, execution_plan=execution_plan_receipt
    )

    os.mkdir(args.out, 0o700)
    initializer_weights_path = os.path.join(args.out, "initializer-weights.bin")
    candidate_weights_path = os.path.join(args.out, "candidate-weights.bin")
    final_checkpoint_path = os.path.join(args.out, "final-epoch-001.pt")
    reference_path = os.path.join(args.out, "candidate-reference.json")
    runtime_path = os.path.join(args.out, "runtime-sanity.json")
    trainer_result_path = os.path.join(args.out, "trainer-result.json")
    static_result_path = os.path.join(args.out, "static-sanity-result.json")

    initializer_q, initializer_weights = export_quantized_weights(
        model, initializer_weights_path
    )
    model = model.to(device)
    baseline_outputs = _model_outputs(model, validation_tensors, device=device)
    baseline_metrics = validation_metrics(
        baseline_outputs, validation_tensors, validation_rows
    )
    initializer_out_q, initializer_int_cp = int16_outputs(
        initializer_q, validation_tensors
    )
    initializer_quantization = quantization_metrics(
        baseline_outputs, initializer_int_cp
    )
    del initializer_q

    training_receipt = train_exactly_one_epoch(
        model,
        training_tensors,
        device=device,
        one_shot_claim=one_shot_claim,
    )
    candidate_outputs = _model_outputs(model, validation_tensors, device=device)
    candidate_metrics = validation_metrics(
        candidate_outputs, validation_tensors, validation_rows
    )
    model = model.to("cpu")
    if device.type == "mps":
        torch.mps.empty_cache()
    train.require_finite_model_parameters(model, "frozen final epoch")
    final_checkpoint = {
        "schema": CHECKPOINT_SCHEMA,
        "epoch": 1,
        "model": model.state_dict(),
        "arch": expected_arch,
        "training": dict(PROTOCOL.EXPECTED_TRAINING),
        "execution_plan": execution_plan_receipt,
        "one_shot_claim": one_shot_claim,
        "initializer": {
            **initializer_identity,
            "path": os.path.realpath(initializer_path),
        },
        "datasets": {
            "training": training_identity,
            "validation": validation_identity,
            "cross_role_disjointness": dataset_disjointness,
        },
        "selection": "final-epoch-1-only-no-best-selection",
        "live_weight_write_authorized": False,
    }
    train.atomic_torch_save(final_checkpoint, final_checkpoint_path)
    final_checkpoint_identity = _identity_with_schema(
        final_checkpoint_path, "final epoch checkpoint", CHECKPOINT_SCHEMA
    )

    candidate_q, candidate_weights = export_quantized_weights(
        model, candidate_weights_path
    )
    roundtrip_q = read_quantized_weights(candidate_weights_path, model)
    export_roundtrip_mismatches = sum(
        int((candidate_q[name] != roundtrip_q[name]).sum().item())
        for name, _typecode in EXPORT_LAYOUT
    )
    candidate_out_q, candidate_int_cp = int16_outputs(roundtrip_q, validation_tensors)
    candidate_quantization = quantization_metrics(
        candidate_outputs, candidate_int_cp
    )
    in_memory_out_q = int16_outputs(candidate_q, validation_tensors)[0]
    export_roundtrip_mismatches += int(
        (candidate_out_q != in_memory_out_q).sum().item()
    )
    reference = build_reference(
        rows=validation_rows,
        float_outputs=candidate_outputs,
        out_q=candidate_out_q,
        int_cp=candidate_int_cp,
        candidate_weights=candidate_weights,
    )
    reference_identity = _canonical_create_only(reference_path, reference)

    live_after_training = _identity(
        live_path, "immutable live weights after training/export"
    )
    if live_after_training != live_before:
        raise DirectTeacherTrainingError("live weights changed during training/export")
    one_shot_claim = reauthenticate_one_shot_claim(
        one_shot_claim, execution_plan=execution_plan_receipt
    )

    trainer_result = {
        "schema": TRAINER_RESULT_SCHEMA,
        "status": "complete-final-epoch-frozen-static-pending",
        "implementation": implementation,
        "execution_plan": execution_plan_receipt,
        "one_shot_claim": one_shot_claim,
        "dataset_manifest": {
            **_identity(str(plan["dataset_manifest"]["path"]), "dataset manifest"),
            "schema": PROTOCOL.DATASET_MANIFEST_SCHEMA,
        },
        "training": training_receipt,
        "epochs_completed": 1,
        "candidate_count": 1,
        "checkpoint_selection": "final-epoch-1-only",
        "best_checkpoint_selection": False,
        "additional_epoch_or_seed": False,
        "metrics": {
            "initializer": baseline_metrics,
            "candidate": candidate_metrics,
            "initializer_quantization": initializer_quantization,
            "candidate_quantization": candidate_quantization,
        },
        "artifacts": {
            "final_checkpoint": final_checkpoint_identity,
            "initializer_weights": initializer_weights,
            "candidate_weights": candidate_weights,
            "candidate_reference": {
                **reference_identity,
                "schema": REFERENCE_SCHEMA,
                "positions": reference["n"],
            },
        },
        "live_weights": {
            "before": live_before,
            "after": live_after_training,
            "byte_exact_unchanged": True,
        },
        "paired56_authorized": False,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
    }
    trainer_result_identity = {
        **_canonical_create_only(trainer_result_path, trainer_result),
        "schema": TRAINER_RESULT_SCHEMA,
    }

    command = [
        "node",
        "-r",
        "tsx/cjs",
        runtime_script,
        "--wasm",
        wasm_path,
        "--initializer",
        initializer_weights_path,
        "--candidate",
        candidate_weights_path,
        "--reference",
        reference_path,
        "--out",
        runtime_path,
    ]
    completed = runtime_runner(
        command,
        cwd=repo_root,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode not in (0, 1) or not os.path.exists(runtime_path):
        raise DirectTeacherTrainingError(
            "runtime sanity did not produce a complete pass/fail receipt"
        )
    runtime_raw, runtime_identity = PROTOCOL.load_strict_json_file(
        runtime_path, "runtime sanity receipt"
    )
    runtime_receipt = validate_runtime_receipt(
        runtime_raw,
        initializer_weights=initializer_weights,
        candidate_weights=candidate_weights,
        reference=reference,
        reference_identity=reference_identity,
        wasm_identity=wasm_identity,
    )
    if (completed.returncode == 0) is not (
        runtime_receipt["status"] == "complete-pass"
    ):
        raise DirectTeacherTrainingError("runtime exit status contradicts its receipt")

    one_shot_claim = reauthenticate_one_shot_claim(
        one_shot_claim, execution_plan=execution_plan_receipt
    )
    static_result = build_static_sanity_result(
        protocol=dict(plan["protocol"]),
        execution_plan={
            **execution_plan_receipt,
        },
        dataset_manifest=dict(plan["dataset_manifest"]),
        initializer={
            **initializer_identity,
            "path": os.path.realpath(initializer_path),
        },
        live_weights=live_before,
        one_shot_claim=one_shot_claim,
        trainer_result=trainer_result_identity,
        candidate_weights=candidate_weights,
        runtime_sanity={
            **runtime_identity,
            "schema": RUNTIME_SCHEMA,
        },
        baseline_metrics=baseline_metrics,
        candidate_metrics=candidate_metrics,
        initializer_quantization=initializer_quantization,
        candidate_quantization=candidate_quantization,
        runtime_receipt=runtime_receipt,
        finite_training_and_inference=True,
        export_roundtrip_mismatches=export_roundtrip_mismatches,
    )
    _canonical_create_only(static_result_path, static_result)
    live_final = _identity(live_path, "immutable live weights after static sanity")
    if live_final != live_before:
        raise DirectTeacherTrainingError("live weights changed during static sanity")
    return static_result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execution-plan", required=True)
    parser.add_argument("--pipeline-revision", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--repo-root", default=".")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = run(args)
    except (
        DirectTeacherTrainingError,
        PROTOCOL.DirectTeacherHalfkpV2Error,
        OSError,
        RuntimeError,
        ValueError,
    ) as error:
        print(f"[direct-teacher-halfkp81-v2] STOP: {error}", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "schema": STATIC_RESULT_SCHEMA,
                "status": result["status"],
                "paired56_authorized": result["paired56_authorized"],
                "live_weight_write_authorized": False,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0 if result["paired56_authorized"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
