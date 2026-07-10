#!/usr/bin/env python3
"""One-shot selection audit for the three preregistered int16-aware runs.

The command validates all three atomic completion markers and final checkpoint
metadata before the evaluation callback can receive the model-selection path.
It never accepts a final-holdout path and never authorizes production promotion.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable, Mapping, Sequence
import hashlib
import importlib.util
import json
import math
import os
import re
import subprocess
import tempfile
from typing import Any

from qat_protocol import (
    QAT_FINAL_CHECKPOINT_SCHEMA,
    QAT_PLAN_BYTES,
    QAT_PLAN_SCHEMA,
    QAT_PLAN_SHA256,
    QAT_SLOT_ORDER,
    QAT_TRAINING_CONTRACT_SCHEMA,
    QAT_TRAINING_RESULT_SCHEMA,
    _strict_json,
    _validate_plan_shape,
)


QAT_SELECTION_AUDIT_SCHEMA = "shogi-int16-aware-selection-audit-v1"
QAT_SELECTION_PREFLIGHT_SCHEMA = "shogi-int16-aware-selection-preflight-v1"
SEALED_EVAL_REPORT_SCHEMA = "shogi-sibling-eval-v2"
GIT_REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
METRIC_FIELDS = {
    "value_mae_cp",
    "value_mse_cp2",
    "within_parent_pair_accuracy",
    "teacher_top1_accuracy",
}
MODEL_FIELDS = {
    "name",
    "checkpoint",
    "checkpoint_sha256",
    "checkpoint_bytes",
    "checkpoint_epoch",
    "training_provenance",
    "k_sigmoid",
    "production_k_int",
    "float",
    "quantized_int16",
}
DATA_FIELDS = {
    "path",
    "sha256",
    "bytes",
    "sibling_manifest_sha256",
    "sibling_manifest_bytes",
    "pipeline_source_revision",
    "teacher_runtime_snapshot",
    "sibling_manifest",
    "data_role",
    "validation_partition_manifest",
    "records",
    "parents",
    "eligible_pairs",
    "pair_min_cp",
    "value_target",
    "value_cp_clamp",
    "ranking_target",
}
RESULT_FIELDS = {
    "schema",
    "status",
    "experiment_plan",
    "experiment_contract",
    "training_pipeline",
    "training_runtime",
    "completed_epochs",
    "selection_labels_read",
    "selection_evaluations",
    "early_stopping",
    "candidate_artifact",
    "training_history",
}
RESULT_PLAN_FIELDS = {
    "path",
    "bytes",
    "sha256",
    "schema",
    "slot_id",
    "slot_output",
    "verified_input_sha256",
}
HISTORY_FIELDS = {
    "epoch",
    "combined_task_loss",
    "float_task_loss",
    "ste_task_loss",
    "learning_rate",
}
QAT_PROVENANCE_FIELDS = {
    "status",
    "teacher_manifest_sha256",
    "validation_partition_sha256",
    "training_pipeline_source_revision",
    "experiment_plan_sha256",
    "slot_id",
    "seed",
    "source_train_sha256",
    "model_training_sha256",
    "model_selection_sha256",
    "final_holdout_sha256",
    "replay_exclusion_sha256",
    "selection_labels_read_during_training",
    "selection_evaluations_during_training",
    "final_holdout_labels_read",
}


def _read_json(path: str, label: str) -> tuple[dict[str, Any], bytes]:
    try:
        with open(path, "rb") as source:
            raw = source.read()
    except OSError as error:
        raise ValueError(f"cannot read {label}: {error}") from error
    return _strict_json(raw, label), raw


def _sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    try:
        with open(path, "rb") as source:
            while block := source.read(1024 * 1024):
                digest.update(block)
    except OSError as error:
        raise ValueError(f"cannot hash {path}: {error}") from error
    return digest.hexdigest()


def _file_receipt(path: str) -> dict[str, Any]:
    real_path = os.path.realpath(path)
    if not os.path.isfile(real_path):
        raise ValueError(f"required file is missing: {path}")
    before = os.stat(real_path)
    sha256 = _sha256_file(real_path)
    after = os.stat(real_path)
    if (
        before.st_dev,
        before.st_ino,
        before.st_size,
        before.st_mtime_ns,
        before.st_ctime_ns,
    ) != (
        after.st_dev,
        after.st_ino,
        after.st_size,
        after.st_mtime_ns,
        after.st_ctime_ns,
    ):
        raise ValueError(f"file changed while being hashed: {path}")
    return {
        "path": os.path.abspath(path),
        "bytes": before.st_size,
        "sha256": sha256,
    }


def _require_exact(value: Any, fields: set[str], label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping) or set(value) != fields:
        raise ValueError(f"{label} fields are not exact")
    return value


def _typed_equal(actual: Any, expected: Any) -> bool:
    """Compare JSON/checkpoint metadata without Python's bool/int coercions."""
    if isinstance(expected, Mapping):
        return (
            isinstance(actual, Mapping)
            and set(actual) == set(expected)
            and all(_typed_equal(actual[key], value) for key, value in expected.items())
        )
    if isinstance(expected, list):
        return (
            type(actual) is list
            and len(actual) == len(expected)
            and all(_typed_equal(found, wanted) for found, wanted in zip(actual, expected))
        )
    return type(actual) is type(expected) and actual == expected


def _nonempty_string_fields(value: Mapping[str, Any], fields: Sequence[str]) -> bool:
    return all(isinstance(value.get(field), str) and bool(value[field]) for field in fields)


def _require_sha256(value: Any, label: str) -> str:
    if not isinstance(value, str) or SHA256_RE.fullmatch(value) is None:
        raise ValueError(f"{label} is not a lowercase SHA-256")
    return value


def _load_plan(path: str) -> tuple[dict[str, Any], dict[str, Any]]:
    plan, raw = _read_json(path, "int16-aware plan")
    sha256 = hashlib.sha256(raw).hexdigest()
    if len(raw) != QAT_PLAN_BYTES or sha256 != QAT_PLAN_SHA256:
        raise ValueError("int16-aware plan identity mismatch")
    _validate_plan_shape(plan)
    return plan, {
        "path": os.path.abspath(path),
        "bytes": len(raw),
        "sha256": sha256,
        "schema": QAT_PLAN_SCHEMA,
    }


def _plan_input_sha256(plan: Mapping[str, Any]) -> dict[str, str]:
    return {field: value["sha256"] for field, value in plan["inputs"].items()}


def _expected_contract(plan: Mapping[str, Any], seed: int) -> dict[str, Any]:
    training = plan["inputs"]["model_training"]
    return {
        "schema": QAT_TRAINING_CONTRACT_SCHEMA,
        "family": "int16-aware",
        "slot_id": f"int16-aware-seed-{seed}",
        "seed": seed,
        "loss": "sibling-ranking",
        "model_training_sha256": training["sha256"],
        "model_training_bytes": training["bytes"],
        "model_training_records": training["records"],
        "model_training_parents": training["parents"],
        "init_checkpoint_sha256": plan["inputs"]["warm_initializer"]["sha256"],
        "replay_sha256": plan["inputs"]["replay"]["sha256"],
        "learning_rate": 0.0001,
        "epochs": 20,
        "batch": 256,
        "k": 600.0,
        "cp_clamp": 3000,
        "rank_weight": 1.0,
        "rank_pair_min": 50.0,
        "rank_pair_max": 600.0,
        "rank_margin_cp": 50.0,
        "policy_weight": 0.25,
        "policy_temp_cp": 200.0,
        "features": "board",
        "device": "cpu",
        "torch_threads": 2,
        "replay_limit": 500000,
        "replay_ratio": 1.0,
        "primary_limit": 0,
        "allow_legacy_init": True,
        "objective": "0.5*float_full_task+0.5*int16_ste_full_task",
        "checkpoint_policy": "fixed-final-epoch-only",
        "candidate_artifact": "final.pt",
        "selection_evaluations": 0,
        "early_stopping": False,
    }


def _validate_history(value: Any, label: str) -> list[Mapping[str, Any]]:
    if not isinstance(value, list) or len(value) != 20:
        raise ValueError(f"{label} must contain exactly 20 epochs")
    for epoch, receipt in enumerate(value, 1):
        receipt = _require_exact(receipt, HISTORY_FIELDS, f"{label}[{epoch - 1}]")
        if type(receipt["epoch"]) is not int or receipt["epoch"] != epoch:
            raise ValueError(f"{label} epoch sequence mismatch")
        for field in HISTORY_FIELDS - {"epoch"}:
            metric = receipt[field]
            if type(metric) is not float or not math.isfinite(metric) or metric < 0.0:
                raise ValueError(f"{label} {field} is invalid")
        if not math.isclose(
            receipt["combined_task_loss"],
            0.5 * (receipt["float_task_loss"] + receipt["ste_task_loss"]),
            rel_tol=1e-12,
            abs_tol=1e-12,
        ):
            raise ValueError(f"{label} combined task loss is not the fixed 0.5/0.5 mix")
        expected_lr = 0.0001 * (1.0 + math.cos(math.pi * (epoch - 1) / 20.0)) / 2.0
        if not math.isclose(
            receipt["learning_rate"], expected_lr, rel_tol=1e-12, abs_tol=1e-16
        ):
            raise ValueError(f"{label} learning-rate schedule mismatch at epoch {epoch}")
    return value


def _validate_result(
    result: Mapping[str, Any],
    *,
    plan: Mapping[str, Any],
    plan_path: str,
    slot: Mapping[str, Any],
    candidate: Mapping[str, Any],
) -> None:
    _require_exact(result, RESULT_FIELDS, f"seed {slot['seed']} result")
    if (
        result["schema"] != QAT_TRAINING_RESULT_SCHEMA
        or result["status"] != "complete"
        or type(result["completed_epochs"]) is not int
        or result["completed_epochs"] != 20
        or result["selection_labels_read"] is not False
        or type(result["selection_evaluations"]) is not int
        or result["selection_evaluations"] != 0
        or result["early_stopping"] is not False
    ):
        raise ValueError(f"seed {slot['seed']} result is not a final-only completion")
    expected_plan = {
        "path": result.get("experiment_plan", {}).get("path")
        if isinstance(result.get("experiment_plan"), Mapping)
        else None,
        "bytes": QAT_PLAN_BYTES,
        "sha256": QAT_PLAN_SHA256,
        "schema": QAT_PLAN_SCHEMA,
        "slot_id": slot["id"],
        "slot_output": slot["output"],
        "verified_input_sha256": _plan_input_sha256(plan),
    }
    result_plan = _require_exact(
        result["experiment_plan"], RESULT_PLAN_FIELDS, "result experiment plan"
    )
    if not _typed_equal(result_plan, expected_plan) or os.path.realpath(
        result_plan["path"]
    ) != os.path.realpath(plan_path):
        raise ValueError(f"seed {slot['seed']} result plan binding mismatch")
    expected_contract = _expected_contract(plan, slot["seed"])
    contract = _require_exact(
        result["experiment_contract"], set(expected_contract), "result experiment contract"
    )
    if not _typed_equal(contract, expected_contract):
        raise ValueError(f"seed {slot['seed']} result contract mismatch")
    pipeline = _require_exact(
        result["training_pipeline"],
        {"source_revision", "tracked_tree_clean"},
        "training pipeline",
    )
    if (
        not isinstance(pipeline["source_revision"], str)
        or GIT_REVISION_RE.fullmatch(pipeline["source_revision"]) is None
        or pipeline["tracked_tree_clean"] is not True
    ):
        raise ValueError(f"seed {slot['seed']} training pipeline is invalid")
    runtime = result["training_runtime"]
    expected_runtime_fields = set(plan["runtime"]) | {
        "mps_built",
        "mps_available",
        "cuda_available",
    }
    _require_exact(runtime, expected_runtime_fields, "training runtime")
    for field, expected in plan["runtime"].items():
        if type(runtime[field]) is not type(expected) or runtime[field] != expected:
            raise ValueError(f"seed {slot['seed']} runtime {field} mismatch")
    if any(
        type(runtime[field]) is not bool
        for field in ("mps_built", "mps_available", "cuda_available")
    ):
        raise ValueError(f"seed {slot['seed']} runtime flags are invalid")
    artifact = _require_exact(
        result["candidate_artifact"], {"name", "bytes", "sha256"}, "candidate artifact"
    )
    if (
        artifact["name"] != "final.pt"
        or type(artifact["bytes"]) is not int
        or artifact["bytes"] != candidate["bytes"]
        or not isinstance(artifact["sha256"], str)
        or artifact["sha256"] != candidate["sha256"]
    ):
        raise ValueError(f"seed {slot['seed']} candidate artifact mismatch")
    _validate_history(result["training_history"], f"seed {slot['seed']} history")


def _torch_checkpoint_preflight(
    checkpoint_path: str,
    result: Mapping[str, Any],
    slot: Mapping[str, Any],
    plan: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Load metadata and tensors without opening any selection dataset."""
    try:
        import torch
        from checkpoint_compat import validate_arch
        from train import DistillNet

        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    except Exception as error:
        raise ValueError(f"cannot load seed {slot['seed']} final checkpoint: {error}") from error
    expected_fields = {
        "schema",
        "model",
        "epoch",
        "args",
        "arch",
        "init_checkpoint",
        "data_provenance",
        "training_pipeline",
        "training_runtime",
        "experiment_plan",
        "experiment_contract",
        "objective",
        "checkpoint_selection",
        "training_history",
    }
    _require_exact(checkpoint, expected_fields, "final checkpoint")
    if (
        checkpoint["schema"] != QAT_FINAL_CHECKPOINT_SCHEMA
        or type(checkpoint["epoch"]) is not int
        or checkpoint["epoch"] != result["completed_epochs"]
    ):
        raise ValueError(f"seed {slot['seed']} checkpoint is not the final epoch")
    for field in (
        "experiment_plan",
        "experiment_contract",
        "training_pipeline",
        "training_runtime",
        "training_history",
    ):
        if not _typed_equal(checkpoint[field], result[field]):
            raise ValueError(f"seed {slot['seed']} checkpoint/result {field} mismatch")
    if plan is None:
        plan_path = result.get("experiment_plan", {}).get("path")
        if not isinstance(plan_path, str) or not plan_path:
            raise ValueError(f"seed {slot['seed']} checkpoint plan path is missing")
        plan, _ = _load_plan(plan_path)
    args = checkpoint["args"]
    if not isinstance(args, Mapping) or args.get("val_data") not in (None, ""):
        raise ValueError(f"seed {slot['seed']} checkpoint received selection labels")
    expected_args = {
        "experiment_family": "int16-aware",
        "experiment_series": None,
        "seed": slot["seed"],
        "loss": "sibling-ranking",
        "epochs": result["completed_epochs"],
        "batch": 256,
        "lr": 0.0001,
        "k": 600.0,
        "cp_clamp": 3000,
        "rank_weight": 1.0,
        "rank_pair_min": 50.0,
        "rank_pair_max": 600.0,
        "rank_margin_cp": 50.0,
        "policy_weight": 0.25,
        "policy_temp_cp": 200.0,
        "features": "board",
        "device": "cpu",
        "torch_threads": 2,
        "replay_limit": result["experiment_contract"]["replay_limit"],
        "replay_ratio": 1.0,
        "limit": 0,
        "select_metric": "auto",
        "allow_legacy_init": True,
        "pipeline_revision": result["training_pipeline"]["source_revision"],
    }
    if any(
        type(args.get(field)) is not type(expected)
        or args.get(field) != expected
        for field, expected in expected_args.items()
    ):
        raise ValueError(f"seed {slot['seed']} checkpoint invocation contract mismatch")
    required_paths = (
        "data",
        "sibling_manifest",
        "validation_partition_manifest",
        "experiment_plan",
        "holdout_protected_position_ids",
        "policy_exposure_receipt",
        "policy_exposed_parent_ids",
        "policy_exposed_semantic_position_ids",
        "replay_data",
        "replay_excluded_position_ids",
        "init_ckpt",
        "out",
    )
    if any(not isinstance(args.get(field), str) or not args[field] for field in required_paths):
        raise ValueError(f"seed {slot['seed']} checkpoint path contract mismatch")
    normalized_output = os.path.normpath(args["out"])
    normalized_slot = os.path.normpath(slot["output"])
    if normalized_output != normalized_slot and not normalized_output.endswith(
        os.sep + normalized_slot
    ):
        raise ValueError(f"seed {slot['seed']} checkpoint output slot mismatch")
    expected_arch = {
        "schema": 1,
        "features": "board",
        "input": 2282,
        "h1": 256,
        "h2": 32,
        "k": 600.0,
        "kp_buckets": 1,
    }
    try:
        validate_arch(checkpoint.get("arch"), expected_arch)
    except ValueError as error:
        raise ValueError(f"seed {slot['seed']} checkpoint architecture mismatch")
    initializer = checkpoint.get("init_checkpoint")
    if (
        not isinstance(initializer, Mapping)
        or set(initializer)
        != {"path", "sha256", "bytes", "epoch", "legacy_arch_inferred_fields"}
        or not isinstance(initializer.get("path"), str)
        or not initializer["path"]
        or initializer.get("sha256")
        != result["experiment_contract"]["init_checkpoint_sha256"]
        or type(initializer.get("bytes")) is not int
        or initializer.get("bytes") != plan["inputs"]["warm_initializer"]["bytes"]
        or type(initializer.get("epoch")) is not int
        or initializer.get("epoch") != 27
        or initializer.get("legacy_arch_inferred_fields") != ["schema"]
    ):
        raise ValueError(f"seed {slot['seed']} checkpoint initializer mismatch")
    objective = {
        "float_task_weight": 0.5,
        "ste_task_weight": 0.5,
        "float_task": ["value", "rank", "policy", "replay_value"],
        "ste_task": ["value", "rank", "policy", "replay_value"],
        "primary_batch_shared": True,
        "replay_indices_shared": True,
    }
    if not _typed_equal(checkpoint.get("objective"), objective):
        raise ValueError(f"seed {slot['seed']} checkpoint objective mismatch")
    selection = checkpoint.get("checkpoint_selection")
    if not _typed_equal(selection, {
        "mode": "final-only",
        "selection_labels_read": False,
        "selection_evaluations": 0,
        "early_stopping": False,
        "candidate_artifact": "final.pt",
    }):
        raise ValueError(f"seed {slot['seed']} checkpoint selection contract mismatch")
    data = checkpoint.get("data_provenance")
    if (
        not isinstance(data, Mapping)
        or not _typed_equal(data.get("model_selection"), {
            "labels_read": False,
            "path_received_by_training_cli": False,
            "epoch_evaluations": 0,
        })
        or not _typed_equal(
            data.get("final_holdout"),
            {"labels_read": False, "status": "sealed_not_opened"},
        )
    ):
        raise ValueError(f"seed {slot['seed']} checkpoint isolation contract mismatch")
    if set(data) != {
        "train",
        "replay",
        "replay_exclusion",
        "model_selection",
        "final_holdout",
    }:
        raise ValueError(f"seed {slot['seed']} checkpoint data fields are not exact")
    contract = result["experiment_contract"]
    train = data.get("train")
    replay = data.get("replay")
    exclusion = data.get("replay_exclusion")
    expected_train = {
        "path": train.get("path") if isinstance(train, Mapping) else None,
        "real_path": train.get("real_path") if isinstance(train, Mapping) else None,
        "sha256": contract["model_training_sha256"],
        "bytes": contract["model_training_bytes"],
        "usable_rows": contract["model_training_records"],
        "selection": "all",
        "requested_limit": 0,
        "role": "model_training",
    }
    expected_replay = {
        "path": replay.get("path") if isinstance(replay, Mapping) else None,
        "real_path": replay.get("real_path") if isinstance(replay, Mapping) else None,
        "sha256": contract["replay_sha256"],
        "bytes": plan["inputs"]["replay"]["bytes"],
        "usable_rows": contract["replay_limit"],
        "selection": "uniform_without_replacement_after_semantic_exclusion",
        "requested_limit": contract["replay_limit"],
        "sample_seed": slot["seed"] + 2,
        "replay_ratio": 1.0,
        "excluded_semantic_position_ids": plan["inputs"]["replay_exclusion"]["count"],
        "excluded_semantic_position_ids_sha256": plan["inputs"]["replay_exclusion"][
            "identifiers_sha256"
        ],
        "eligible_rows_after_semantic_exclusion": (
            replay.get("eligible_rows_after_semantic_exclusion")
            if isinstance(replay, Mapping)
            else None
        ),
        "excluded_rows_before_sampling": (
            replay.get("excluded_rows_before_sampling")
            if isinstance(replay, Mapping)
            else None
        ),
    }
    exclusion_contract = plan["inputs"]["replay_exclusion"]
    expected_exclusion = {
        "path": exclusion.get("path") if isinstance(exclusion, Mapping) else None,
        **{
            field: exclusion_contract[field]
            for field in (
                "format",
                "bytes",
                "sha256",
                "count",
                "identifiers_sha256",
            )
        },
    }
    if (
        not isinstance(train, Mapping)
        or not _typed_equal(train, expected_train)
        or not _nonempty_string_fields(train, ("path", "real_path"))
        or not isinstance(replay, Mapping)
        or not _typed_equal(replay, expected_replay)
        or not _nonempty_string_fields(replay, ("path", "real_path"))
        or type(replay["eligible_rows_after_semantic_exclusion"]) is not int
        or replay["eligible_rows_after_semantic_exclusion"] < contract["replay_limit"]
        or type(replay["excluded_rows_before_sampling"]) is not int
        or replay["excluded_rows_before_sampling"] < 0
        or not isinstance(exclusion, Mapping)
        or not _typed_equal(exclusion, expected_exclusion)
        or not _nonempty_string_fields(exclusion, ("path",))
    ):
        raise ValueError(f"seed {slot['seed']} checkpoint training inputs mismatch")
    model = checkpoint.get("model")
    expected_state_shapes = {
        "board.weight": (2269, 256),
        "hand.weight": (256, 14),
        "hand.bias": (256,),
        "l2.weight": (32, 256),
        "l2.bias": (32,),
        "l3.weight": (1, 32),
        "l3.bias": (1,),
    }
    if not isinstance(model, Mapping) or set(model) != set(expected_state_shapes):
        raise ValueError(f"seed {slot['seed']} checkpoint model is missing")
    for name, tensor in model.items():
        if (
            not isinstance(tensor, torch.Tensor)
            or tuple(tensor.shape) != expected_state_shapes[name]
            or tensor.dtype != torch.float32
        ):
            raise ValueError(f"seed {slot['seed']} model tensor {name} is invalid")
        if not bool(torch.isfinite(tensor).all().item()):
            raise ValueError(f"seed {slot['seed']} model tensor {name} is non-finite")
    try:
        strict_model = DistillNet("board")
        strict_model.load_state_dict(model, strict=True)
    except (KeyError, RuntimeError, ValueError) as error:
        raise ValueError(
            f"seed {slot['seed']} model cannot strict-load into DistillNet: {error}"
        ) from error
    return {"schema": checkpoint["schema"], "epoch": checkpoint["epoch"]}


def preflight_run_results(
    run_root: str,
    plan_path: str,
    *,
    expected_training_revision: str | None = None,
    checkpoint_validator: Callable[[str, Mapping[str, Any], Mapping[str, Any]], Any]
    | None = None,
) -> dict[str, Any]:
    """Validate three completions without accepting or reading selection data."""
    plan, plan_receipt = _load_plan(plan_path)
    if checkpoint_validator is None:
        checkpoint_validator = lambda path, result, slot: _torch_checkpoint_preflight(
            path, result, slot, plan
        )
    runs = []
    shared_pipeline = None
    shared_runtime = None
    for slot in plan["slots"]:
        seed = slot["seed"]
        if seed not in QAT_SLOT_ORDER:
            raise ValueError("plan contains an unregistered seed")
        directory = os.path.join(os.path.abspath(run_root), f"seed-{seed}")
        result_path = os.path.join(directory, "result.json")
        checkpoint_path = os.path.join(directory, "final.pt")
        result, result_raw = _read_json(result_path, f"seed {seed} result")
        candidate = _file_receipt(checkpoint_path)
        _validate_result(
            result,
            plan=plan,
            plan_path=plan_path,
            slot=slot,
            candidate=candidate,
        )
        checkpoint_metadata = checkpoint_validator(checkpoint_path, result, slot)
        pipeline = dict(result["training_pipeline"])
        runtime = dict(result["training_runtime"])
        if expected_training_revision is not None and pipeline["source_revision"] != expected_training_revision:
            raise ValueError(f"seed {seed} training revision mismatch")
        if shared_pipeline is None:
            shared_pipeline, shared_runtime = pipeline, runtime
        elif pipeline != shared_pipeline or runtime != shared_runtime:
            raise ValueError("the three runs do not share one pipeline/runtime")
        runs.append(
            {
                "slot_id": slot["id"],
                "seed": seed,
                "result_manifest": {
                    "path": os.path.abspath(result_path),
                    "bytes": len(result_raw),
                    "sha256": hashlib.sha256(result_raw).hexdigest(),
                },
                "candidate": candidate,
                "checkpoint_metadata": checkpoint_metadata,
            }
        )
    if [run["seed"] for run in runs] != list(QAT_SLOT_ORDER):
        raise ValueError("completion markers are outside the exact three-seed order")
    return {
        "schema": QAT_SELECTION_PREFLIGHT_SCHEMA,
        "all_three_complete_before_selection_read": True,
        "plan": plan_receipt,
        "training_pipeline": shared_pipeline,
        "training_runtime": shared_runtime,
        "runs": runs,
    }


def _metric_set(value: Any, label: str) -> dict[str, float]:
    value = _require_exact(value, METRIC_FIELDS, label)
    normalized = {}
    for field in METRIC_FIELDS:
        metric = value[field]
        if type(metric) not in (int, float) or not math.isfinite(metric):
            raise ValueError(f"{label}.{field} is non-finite")
        normalized[field] = float(metric)
    if (
        normalized["value_mae_cp"] < 0.0
        or normalized["value_mse_cp2"] < 0.0
        or not 0.0 <= normalized["within_parent_pair_accuracy"] <= 1.0
        or not 0.0 <= normalized["teacher_top1_accuracy"] <= 1.0
    ):
        raise ValueError(f"{label} is outside its metric domain")
    return normalized


def _model_metrics(model: Mapping[str, Any], label: str) -> tuple[dict[str, float], dict[str, float]]:
    floating = _metric_set(model["float"], f"{label}.float")
    quantized_value = _require_exact(
        model["quantized_int16"], METRIC_FIELDS | {"delta_from_float"}, f"{label}.int16"
    )
    quantized = _metric_set(
        {field: quantized_value[field] for field in METRIC_FIELDS}, f"{label}.int16"
    )
    delta = _require_exact(
        quantized_value["delta_from_float"], METRIC_FIELDS, f"{label}.delta"
    )
    for field in METRIC_FIELDS:
        observed = delta[field]
        expected = quantized[field] - floating[field]
        if type(observed) not in (int, float) or not math.isfinite(observed) or not math.isclose(
            float(observed), expected, rel_tol=0.0, abs_tol=1e-15
        ):
            raise ValueError(f"{label} float/int16 delta mismatch for {field}")
    return floating, quantized


def _selection_key(run: Mapping[str, Any]) -> tuple[Any, ...]:
    metrics = run["int16"]
    return (
        -metrics["within_parent_pair_accuracy"],
        -metrics["teacher_top1_accuracy"],
        metrics["value_mae_cp"],
        run["seed"],
        bytes.fromhex(run["checkpoint"]["sha256"]),
    )


def _gate_results(
    floating: Mapping[str, float],
    quantized: Mapping[str, float],
    stable: Mapping[str, Any],
) -> dict[str, Any]:
    checks = [
        {
            "id": "int16_pair_strictly_above_stable",
            "candidate": quantized["within_parent_pair_accuracy"],
            "reference": stable["int16_within_parent_pair_accuracy"],
            "operator": ">",
            "passed": quantized["within_parent_pair_accuracy"]
            > stable["int16_within_parent_pair_accuracy"],
        },
        {
            "id": "int16_top1_at_least_stable",
            "candidate": quantized["teacher_top1_accuracy"],
            "reference": stable["int16_teacher_top1_accuracy"],
            "operator": ">=",
            "passed": quantized["teacher_top1_accuracy"]
            >= stable["int16_teacher_top1_accuracy"],
        },
        {
            "id": "absolute_float_to_int16_pair_delta",
            "observed": quantized["within_parent_pair_accuracy"]
            - floating["within_parent_pair_accuracy"],
            "absolute_limit": 0.002,
            "operator": "abs<=",
            "passed": abs(
                quantized["within_parent_pair_accuracy"]
                - floating["within_parent_pair_accuracy"]
            )
            <= 0.002,
        },
        {
            "id": "absolute_float_to_int16_top1_delta",
            "observed": quantized["teacher_top1_accuracy"]
            - floating["teacher_top1_accuracy"],
            "absolute_limit": 0.005,
            "operator": "abs<=",
            "passed": abs(
                quantized["teacher_top1_accuracy"]
                - floating["teacher_top1_accuracy"]
            )
            <= 0.005,
        },
    ]
    return {
        "checks": checks,
        "all_four_passed": all(check["passed"] for check in checks),
        "both_quantization_delta_gates_passed": checks[2]["passed"]
        and checks[3]["passed"],
    }


def select_from_report(
    report: Mapping[str, Any],
    preflight: Mapping[str, Any],
    stable_receipt: Mapping[str, Any],
    plan: Mapping[str, Any],
) -> dict[str, Any]:
    """Validate the sole report, rank seeds, and recompute every family gate."""
    _require_exact(report, {"schema", "data", "models"}, "selection report")
    if report["schema"] != SEALED_EVAL_REPORT_SCHEMA:
        raise ValueError("selection report schema mismatch")
    data = _require_exact(report["data"], DATA_FIELDS, "selection report data")
    selection = plan["post_training_selection"]["model_selection"]
    if (
        data.get("data_role") != "selection"
        or data.get("bytes") != selection["bytes"]
        or data.get("sha256") != selection["sha256"]
        or data.get("records") != selection["records"]
        or data.get("parents") != selection["parents"]
        or data.get("pair_min_cp") != 50.0
        or data.get("value_cp_clamp") != 3000
        or data.get("value_target") != "clamped_child_cp"
        or data.get("ranking_target")
        != "unclamped_parent_cp_equals_negative_child_cp"
        or type(data.get("eligible_pairs")) is not int
        or data["eligible_pairs"] <= 0
    ):
        raise ValueError("selection report dataset contract mismatch")
    partition = data.get("validation_partition_manifest")
    if (
        not isinstance(partition, Mapping)
        or partition.get("sha256")
        != plan["inputs"]["validation_partition_manifest"]["sha256"]
        or data.get("sibling_manifest_sha256")
        != plan["inputs"]["sibling_teacher_manifest"]["sha256"]
    ):
        raise ValueError("selection report provenance mismatch")
    source_train_sha256 = (
        partition.get("source", {}).get("full_training", {}).get("sha256")
        if isinstance(partition.get("source"), Mapping)
        else None
    )
    manifest = data.get("sibling_manifest")
    manifest_train_sha256 = (
        manifest.get("outputs", {}).get("train_sha256")
        if isinstance(manifest, Mapping)
        and isinstance(manifest.get("outputs"), Mapping)
        else None
    )
    if (
        not isinstance(source_train_sha256, str)
        or source_train_sha256 != manifest_train_sha256
    ):
        raise ValueError("selection report source-training provenance mismatch")
    models = report["models"]
    expected_names = ["stable"] + [f"int16-aware-seed-{seed}" for seed in QAT_SLOT_ORDER]
    if not isinstance(models, list) or [model.get("name") for model in models] != expected_names:
        raise ValueError("selection report must contain stable plus the exact three seeds")

    stable_model = _require_exact(models[0], MODEL_FIELDS, "stable model")
    if (
        stable_model["checkpoint_sha256"] != stable_receipt["sha256"]
        or stable_model["checkpoint_bytes"] != stable_receipt["bytes"]
        or stable_model["k_sigmoid"] != 600.0
        or stable_model["production_k_int"] != 600
        or not isinstance(stable_model["training_provenance"], Mapping)
        or stable_model["training_provenance"].get("status") != "legacy_unverified"
    ):
        raise ValueError("stable selection model identity mismatch")
    stable_float, stable_int16 = _model_metrics(stable_model, "stable")
    stable_contract = plan["post_training_selection"]["stable"]
    if (
        stable_receipt["sha256"] != stable_contract["checkpoint_sha256"]
        or stable_int16["within_parent_pair_accuracy"]
        != stable_contract["int16_within_parent_pair_accuracy"]
        or stable_int16["teacher_top1_accuracy"]
        != stable_contract["int16_teacher_top1_accuracy"]
    ):
        raise ValueError("stable metrics differ from the preregistered reference")

    runs = []
    for index, (model_value, preflight_run) in enumerate(
        zip(models[1:], preflight["runs"]), 1
    ):
        model = _require_exact(model_value, MODEL_FIELDS, f"candidate model {index}")
        seed = preflight_run["seed"]
        candidate = preflight_run["candidate"]
        if (
            model["checkpoint_sha256"] != candidate["sha256"]
            or model["checkpoint_bytes"] != candidate["bytes"]
            or model["checkpoint_epoch"] != 20
            or model["k_sigmoid"] != 600.0
            or model["production_k_int"] != 600
        ):
            raise ValueError(f"seed {seed} report/checkpoint identity mismatch")
        provenance = _require_exact(
            model["training_provenance"], QAT_PROVENANCE_FIELDS, f"seed {seed} provenance"
        )
        if (
            provenance["status"] != "verified_int16_aware_final_only_selection"
            or provenance["seed"] != seed
            or provenance["slot_id"] != preflight_run["slot_id"]
            or provenance["training_pipeline_source_revision"]
            != preflight["training_pipeline"]["source_revision"]
            or provenance["experiment_plan_sha256"] != QAT_PLAN_SHA256
            or provenance["selection_labels_read_during_training"] is not False
            or provenance["selection_evaluations_during_training"] != 0
            or provenance["final_holdout_labels_read"] is not False
            or provenance["teacher_manifest_sha256"]
            != plan["inputs"]["sibling_teacher_manifest"]["sha256"]
            or provenance["validation_partition_sha256"]
            != plan["inputs"]["validation_partition_manifest"]["sha256"]
            or provenance["model_training_sha256"]
            != plan["inputs"]["model_training"]["sha256"]
            or provenance["model_selection_sha256"]
            != plan["post_training_selection"]["model_selection"]["sha256"]
            or provenance["replay_exclusion_sha256"]
            != plan["inputs"]["replay_exclusion"]["sha256"]
            or provenance["final_holdout_sha256"]
            != partition["outputs"]["final_holdout"]["sha256"]
            or provenance["source_train_sha256"] != source_train_sha256
        ):
            raise ValueError(f"seed {seed} selection provenance mismatch")
        floating, quantized = _model_metrics(model, f"seed {seed}")
        runs.append(
            {
                "slot_id": preflight_run["slot_id"],
                "seed": seed,
                "checkpoint": candidate,
                "float": floating,
                "int16": quantized,
                "gates": _gate_results(floating, quantized, stable_contract),
            }
        )
    ranked = sorted(runs, key=_selection_key)
    representative = ranked[1]
    all_four_count = sum(run["gates"]["all_four_passed"] for run in runs)
    all_quantization = all(
        run["gates"]["both_quantization_delta_gates_passed"] for run in runs
    )
    family_checks = {
        "representative_passed_all_four": representative["gates"]["all_four_passed"],
        "seeds_passing_all_four": all_four_count,
        "minimum_seeds_passing_all_four": 2,
        "minimum_seed_count_passed": all_four_count >= 2,
        "all_seeds_passed_both_quantization_delta_gates": all_quantization,
    }
    family_passed = (
        family_checks["representative_passed_all_four"]
        and family_checks["minimum_seed_count_passed"]
        and all_quantization
    )
    return {
        "stable": {"checkpoint": dict(stable_receipt), "float": stable_float, "int16": stable_int16},
        "runs": runs,
        "ranked_seed_order": [run["seed"] for run in ranked],
        "representative_seed": representative["seed"],
        "family_gate": {**family_checks, "passed": family_passed},
    }


def run_selection(
    *,
    run_root: str,
    plan_path: str,
    stable_checkpoint: str,
    evaluation_runner: Callable[[Sequence[tuple[str, str]]], Mapping[str, Any]],
    expected_training_revision: str | None = None,
    checkpoint_validator: Callable[[str, Mapping[str, Any], Mapping[str, Any]], Any]
    | None = None,
) -> dict[str, Any]:
    """Preflight first; only then hand checkpoint paths to the selection runner."""
    preflight = preflight_run_results(
        run_root,
        plan_path,
        expected_training_revision=expected_training_revision,
        checkpoint_validator=checkpoint_validator,
    )
    plan, plan_receipt = _load_plan(plan_path)
    stable = _file_receipt(stable_checkpoint)
    stable_expected = plan["post_training_selection"]["stable"]["checkpoint_sha256"]
    if stable["sha256"] != stable_expected:
        raise ValueError("stable checkpoint identity mismatch")
    specs = [("stable", stable_checkpoint)] + [
        (run["slot_id"], run["candidate"]["path"]) for run in preflight["runs"]
    ]
    report = evaluation_runner(specs)
    selection = select_from_report(report, preflight, stable, plan)
    second_preflight = preflight_run_results(
        run_root,
        plan_path,
        expected_training_revision=expected_training_revision,
        checkpoint_validator=checkpoint_validator,
    )
    if second_preflight != preflight:
        raise ValueError("training artifacts changed during selection evaluation")
    if _file_receipt(stable_checkpoint) != stable:
        raise ValueError("stable checkpoint changed during selection evaluation")
    return {
        "schema": QAT_SELECTION_AUDIT_SCHEMA,
        "status": (
            "static_selection_pass"
            if selection["family_gate"]["passed"]
            else "static_selection_fail"
        ),
        "run_plan": plan_receipt,
        "preflight": preflight,
        "selection": selection,
        "selection_report": report,
        "final_holdout": "not_opened_by_this_command",
        "production_promotion_authorized": False,
    }


def verify_clean_revision(expected_revision: str) -> dict[str, Any]:
    if not isinstance(expected_revision, str) or GIT_REVISION_RE.fullmatch(expected_revision) is None:
        raise ValueError("audit revision must be a lowercase 40-digit Git revision")
    repo_root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
    try:
        head = subprocess.run(
            ["git", "-C", repo_root, "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        status = subprocess.run(
            ["git", "-C", repo_root, "status", "--porcelain=v1", "--untracked-files=normal"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError) as error:
        raise ValueError(f"cannot verify audit pipeline: {error}") from error
    if head != expected_revision or status:
        raise ValueError("selection audit requires the exact clean Git revision")
    return {"source_revision": head, "tracked_tree_clean": True}


def _atomic_write_new_json(path: str, value: Mapping[str, Any]) -> None:
    target = os.path.abspath(path)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    serialized = (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False)
        + "\n"
    ).encode("utf-8")
    descriptor, temporary = tempfile.mkstemp(
        prefix=f".{os.path.basename(target)}.", suffix=".tmp", dir=os.path.dirname(target)
    )
    try:
        with os.fdopen(descriptor, "wb") as destination:
            destination.write(serialized)
            destination.flush()
            os.fsync(destination.fileno())
        try:
            os.link(temporary, target)
        except FileExistsError as error:
            raise ValueError(f"refusing to overwrite existing audit: {target}") from error
        directory_fd = os.open(os.path.dirname(target), os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def _portable_paths(value: Any, repo_root: str) -> Any:
    if isinstance(value, Mapping):
        return {key: _portable_paths(item, repo_root) for key, item in value.items()}
    if isinstance(value, list):
        return [_portable_paths(item, repo_root) for item in value]
    if isinstance(value, str) and os.path.isabs(value):
        real = os.path.realpath(value)
        relative = os.path.relpath(real, repo_root)
        if relative != ".." and not relative.startswith(".." + os.sep):
            return relative.replace(os.sep, "/")
        return f"<external:{os.path.basename(real)}>"
    return value


def _load_eval_module():
    path = os.path.join(os.path.dirname(__file__), "eval-sibling.py")
    spec = importlib.util.spec_from_file_location("qat_selection_eval", path)
    if spec is None or spec.loader is None:
        raise ValueError("cannot load eval-sibling.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-root", required=True)
    parser.add_argument("--run-plan", required=True)
    parser.add_argument("--stable-checkpoint", required=True)
    parser.add_argument("--selection-data", required=True)
    parser.add_argument("--sibling-manifest", required=True)
    parser.add_argument("--validation-partition-manifest", required=True)
    parser.add_argument("--policy-exposure-receipt", required=True)
    parser.add_argument("--policy-exposed-parent-ids", required=True)
    parser.add_argument("--policy-exposed-semantic-position-ids", required=True)
    parser.add_argument("--holdout-protected-position-ids", required=True)
    parser.add_argument("--training-revision", required=True)
    parser.add_argument("--audit-revision", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    try:
        pipeline_before = verify_clean_revision(args.audit_revision)
        evaluator = _load_eval_module()

        def evaluate(specs):
            return evaluator.evaluate_checkpoints(
                args.selection_data,
                specs,
                sibling_manifest_path=args.sibling_manifest,
                validation_partition_manifest_path=args.validation_partition_manifest,
                policy_exposure_receipt_path=args.policy_exposure_receipt,
                policy_exposed_parent_ids_path=args.policy_exposed_parent_ids,
                policy_exposed_semantic_position_ids_path=(
                    args.policy_exposed_semantic_position_ids
                ),
                protected_position_ids_path=args.holdout_protected_position_ids,
                data_role="selection",
                include_quantized=True,
            )

        audit = run_selection(
            run_root=args.run_root,
            plan_path=args.run_plan,
            stable_checkpoint=args.stable_checkpoint,
            evaluation_runner=evaluate,
            expected_training_revision=args.training_revision,
        )
        pipeline_after = verify_clean_revision(args.audit_revision)
        if pipeline_after != pipeline_before:
            raise ValueError("audit pipeline changed during evaluation")
        audit["audit_pipeline"] = pipeline_before
        repo_root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
        _atomic_write_new_json(args.out, _portable_paths(audit, repo_root))
    except (OSError, RuntimeError, ValueError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
