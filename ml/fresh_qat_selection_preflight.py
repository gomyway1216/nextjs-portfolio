"""Fail-closed three-run preflight for fresh Floodgate QAT selection.

The historical WCSC36 selection audit remains sealed in ``qat_selection_audit``.
This module has a separate registry and returns a one-shot public-API guard only
after all three result manifests and final checkpoints pass identity and
strict-load validation. Selection labels are not accepted by the preflight.
This is an accidental-misuse boundary, not cryptographic isolation from
adversarial Python code already executing inside this module's process.
"""

from __future__ import annotations

import hashlib
import io
import json
import math
import os
import re
import stat
import subprocess
import weakref
from collections.abc import Callable, Mapping
from typing import Any

from fresh_qat_protocol import (
    FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH,
    FRESH_QAT_EXECUTION_PLAN_SCHEMA,
    FRESH_QAT_FINAL_CHECKPOINT_SCHEMA,
    FRESH_QAT_REGISTRY_RELATIVE_PATH,
    FRESH_QAT_RUN_ROOT,
    FRESH_QAT_SLOT_ORDER,
    FRESH_QAT_TRAINING_RESULT_SCHEMA,
    FRESH_QAT_WARM_INITIALIZER_BYTES,
    FRESH_QAT_WARM_INITIALIZER_SHA256,
    _validate_plan_shape,
    _validate_registry as _validate_training_plan_registry,
    build_fresh_qat_training_contract,
)
from qat_protocol import _exact_keys, _sha256_file_snapshot, _strict_json


FRESH_QAT_SELECTION_REGISTRY_SCHEMA = (
    "shogi-floodgate-fresh-qat-selection-preflight-registry-v1"
)
FRESH_QAT_SELECTION_PREFLIGHT_SCHEMA = (
    "shogi-floodgate-fresh-qat-selection-preflight-v1"
)
FRESH_QAT_SELECTION_REGISTRY_RELATIVE_PATH = (
    "ml/protocols/floodgate-q1-2026-fresh-qat-selection-preflight-registry.json"
)
FRESH_QAT_SELECTION_BLOCKED_STATUS = (
    "awaiting-exact-fresh-plan-and-three-final-run-identities"
)
FRESH_QAT_SELECTION_READY_STATUS = (
    "exact-fresh-plan-and-three-final-run-identities-ready"
)
GIT_REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
FIXED_GIT_EXECUTABLE = "/usr/bin/git"
FIXED_GIT_ENVIRONMENT = {
    "PATH": "/usr/bin:/bin",
    "HOME": "/dev/null",
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": "/dev/null",
    "GIT_CONFIG_SYSTEM": "/dev/null",
    "GIT_GRAFT_FILE": "/dev/null",
    "GIT_OPTIONAL_LOCKS": "0",
    "GIT_TERMINAL_PROMPT": "0",
    "LC_ALL": "C",
    "LANG": "C",
}
FIXED_GIT_COMMAND_PREFIX = (
    "--no-replace-objects",
    "--no-optional-locks",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.untrackedCache=false",
    "-c",
    "core.preloadIndex=false",
    "-c",
    "core.ignoreStat=false",
    "-c",
    "core.trustctime=true",
    "-c",
    "core.checkStat=default",
)

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
CHECKPOINT_FIELDS = {
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

_RECEIPT_BRAND = object()
_RECEIPT_STATES: weakref.WeakKeyDictionary[FreshQatSelectionPreflightReceipt, bytes] = (
    weakref.WeakKeyDictionary()
)


def _valid_sha256(value: Any) -> bool:
    return isinstance(value, str) and SHA256_RE.fullmatch(value) is not None


def _typed_equal(actual: Any, expected: Any) -> bool:
    if type(actual) is not type(expected):
        return False
    if type(expected) is dict:
        return set(actual) == set(expected) and all(
            _typed_equal(actual[key], expected[key]) for key in expected
        )
    if type(expected) is list:
        return len(actual) == len(expected) and all(
            _typed_equal(found, wanted) for found, wanted in zip(actual, expected)
        )
    return actual == expected


def _read_exact_file(path: str, label: str) -> bytes:
    try:
        with open(path, "rb") as source:
            return source.read()
    except OSError as error:
        raise ValueError(f"cannot read {label}: {error}") from error


def _data_only_blocker(detail: str) -> ValueError:
    return ValueError(
        "fresh QAT selection is data-only blocked: exact tracked execution "
        "plan and all three final result/checkpoint identities are required "
        f"({detail})"
    )


def _expected_registry_runs() -> list[dict[str, Any]]:
    return [
        {
            "slot_id": f"floodgate-fresh-int16-aware-seed-{seed}",
            "seed": seed,
            "output": f"{FRESH_QAT_RUN_ROOT}/seed-{seed}",
            "result": {
                "path": f"{FRESH_QAT_RUN_ROOT}/seed-{seed}/result.json",
                "schema": FRESH_QAT_TRAINING_RESULT_SCHEMA,
            },
            "checkpoint": {
                "path": f"{FRESH_QAT_RUN_ROOT}/seed-{seed}/final.pt",
                "schema": FRESH_QAT_FINAL_CHECKPOINT_SCHEMA,
            },
        }
        for seed in FRESH_QAT_SLOT_ORDER
    ]


def _validate_registered_identity(
    value: Mapping[str, Any],
    *,
    ready: bool,
    label: str,
) -> None:
    if ready:
        if (
            type(value["bytes"]) is not int
            or value["bytes"] < 1
            or not _valid_sha256(value["sha256"])
        ):
            raise ValueError(f"{label} ready identity is invalid")
    elif value["bytes"] is not None or value["sha256"] is not None:
        raise ValueError(f"{label} blocked identity must remain null")


def _validate_registry(registry: dict[str, Any]) -> bool:
    _exact_keys(
        registry,
        {
            "schema",
            "status",
            "execution_plan",
            "training_pipeline_revision",
            "runs",
            "artifact_identities_registered",
            "selection_preflight_ready",
        },
        "fresh QAT selection registry",
    )
    if registry["schema"] != FRESH_QAT_SELECTION_REGISTRY_SCHEMA:
        raise ValueError("fresh QAT selection registry schema mismatch")
    status = registry["status"]
    if status == FRESH_QAT_SELECTION_BLOCKED_STATUS:
        ready = False
    elif status == FRESH_QAT_SELECTION_READY_STATUS:
        ready = True
    else:
        raise ValueError("fresh QAT selection registry status mismatch")

    plan = registry["execution_plan"]
    _exact_keys(
        plan,
        {"path", "schema", "bytes", "sha256"},
        "fresh QAT selection registry execution plan",
    )
    if (
        plan["path"] != FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH
        or plan["schema"] != FRESH_QAT_EXECUTION_PLAN_SCHEMA
    ):
        raise ValueError("fresh QAT selection execution-plan path/schema mismatch")
    _validate_registered_identity(plan, ready=ready, label="execution plan")

    expected_runs = _expected_registry_runs()
    runs = registry["runs"]
    if type(runs) is not list or len(runs) != len(expected_runs):
        raise ValueError("fresh QAT selection registry must contain three runs")
    for index, (run, expected) in enumerate(zip(runs, expected_runs)):
        label = f"fresh QAT selection registry run {index}"
        _exact_keys(
            run,
            {"slot_id", "seed", "output", "result", "checkpoint"},
            label,
        )
        for field in ("slot_id", "seed", "output"):
            if (
                type(run[field]) is not type(expected[field])
                or run[field] != expected[field]
            ):
                raise ValueError(f"{label} {field} mismatch")
        for artifact_name in ("result", "checkpoint"):
            artifact = run[artifact_name]
            expected_artifact = expected[artifact_name]
            _exact_keys(
                artifact,
                {"path", "schema", "bytes", "sha256"},
                f"{label} {artifact_name}",
            )
            if (
                artifact["path"] != expected_artifact["path"]
                or artifact["schema"] != expected_artifact["schema"]
            ):
                raise ValueError(f"{label} {artifact_name} path/schema mismatch")
            _validate_registered_identity(
                artifact,
                ready=ready,
                label=f"{label} {artifact_name}",
            )

    if ready:
        if (
            not isinstance(registry["training_pipeline_revision"], str)
            or GIT_REVISION_RE.fullmatch(registry["training_pipeline_revision"]) is None
            or registry["artifact_identities_registered"] is not True
            or registry["selection_preflight_ready"] is not True
        ):
            raise ValueError("fresh QAT selection ready registry is incomplete")
    elif (
        registry["training_pipeline_revision"] is not None
        or registry["artifact_identities_registered"] is not False
        or registry["selection_preflight_ready"] is not False
    ):
        raise ValueError("fresh QAT selection blocked registry contains identities")
    return ready


def _registered_path(root: str, relative_path: str, label: str) -> str:
    path = os.path.abspath(os.path.join(root, relative_path))
    if os.path.realpath(path) != path:
        raise ValueError(f"{label} path must not traverse a symlink")
    return path


def _registered_snapshot(
    root: str,
    identity: Mapping[str, Any],
    label: str,
) -> dict[str, Any]:
    path = _registered_path(root, identity["path"], label)
    snapshot = _sha256_file_snapshot(path, identity, label)
    return {
        "path": path,
        "bytes": snapshot["bytes"],
        "sha256": snapshot["sha256"],
    }


def _registered_content_snapshot(
    root: str,
    identity: Mapping[str, Any],
    label: str,
) -> tuple[dict[str, Any], bytes]:
    """Capture the exact registered bytes that later parsing/loading must use."""
    receipt = _registered_snapshot(root, identity, label)
    raw = _read_exact_file(receipt["path"], label)
    if (
        len(raw) != receipt["bytes"]
        or hashlib.sha256(raw).hexdigest() != receipt["sha256"]
    ):
        raise ValueError(f"{label} changed after identity snapshot")
    return receipt, raw


def _validate_history(value: Any, label: str) -> list[Mapping[str, Any]]:
    if type(value) is not list or len(value) != 20:
        raise ValueError(f"{label} must contain exactly 20 epochs")
    for epoch, receipt in enumerate(value, 1):
        _exact_keys(receipt, HISTORY_FIELDS, f"{label}[{epoch - 1}]")
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
            raise ValueError(f"{label} combined task loss mismatch")
        expected_lr = 0.0001 * (1.0 + math.cos(math.pi * (epoch - 1) / 20.0)) / 2.0
        if not math.isclose(
            receipt["learning_rate"],
            expected_lr,
            rel_tol=1e-12,
            abs_tol=1e-16,
        ):
            raise ValueError(f"{label} learning-rate schedule mismatch")
    return value


def _expected_verified_inputs(plan: Mapping[str, Any]) -> dict[str, str]:
    replay_components = plan["inputs"]["replay_exclusion"]["components"]
    return {
        "preregistered_plan": plan["preregistered_plan"]["sha256"],
        **{field: identity["sha256"] for field, identity in plan["inputs"].items()},
        **{
            f"replay_exclusion_component_{name}": identity["sha256"]
            for name, identity in replay_components.items()
        },
    }


def _validate_result(
    result: Mapping[str, Any],
    *,
    plan: Mapping[str, Any],
    plan_path: str,
    plan_identity: Mapping[str, Any],
    registry: Mapping[str, Any],
    registered_run: Mapping[str, Any],
    checkpoint_receipt: Mapping[str, Any],
) -> None:
    seed = registered_run["seed"]
    _exact_keys(result, RESULT_FIELDS, f"fresh seed {seed} result")
    if (
        result["schema"] != FRESH_QAT_TRAINING_RESULT_SCHEMA
        or result["status"] != "complete"
        or type(result["completed_epochs"]) is not int
        or result["completed_epochs"] != 20
        or result["selection_labels_read"] is not False
        or type(result["selection_evaluations"]) is not int
        or result["selection_evaluations"] != 0
        or result["early_stopping"] is not False
    ):
        raise ValueError(f"fresh seed {seed} result is not final-only")

    expected_plan = {
        "path": plan_path,
        "bytes": plan_identity["bytes"],
        "sha256": plan_identity["sha256"],
        "schema": FRESH_QAT_EXECUTION_PLAN_SCHEMA,
        "slot_id": registered_run["slot_id"],
        "slot_output": registered_run["output"],
        "verified_input_sha256": _expected_verified_inputs(plan),
    }
    _exact_keys(
        result["experiment_plan"],
        RESULT_PLAN_FIELDS,
        f"fresh seed {seed} result plan",
    )
    if not _typed_equal(result["experiment_plan"], expected_plan):
        raise ValueError(f"fresh seed {seed} result plan binding mismatch")

    slot = next(
        item for item in plan["slots"] if item["seed"] == registered_run["seed"]
    )
    expected_contract = build_fresh_qat_training_contract(plan, slot)
    _exact_keys(
        result["experiment_contract"],
        set(expected_contract),
        f"fresh seed {seed} result contract",
    )
    if not _typed_equal(result["experiment_contract"], expected_contract):
        raise ValueError(f"fresh seed {seed} result contract mismatch")

    pipeline = result["training_pipeline"]
    _exact_keys(
        pipeline,
        {"source_revision", "tracked_tree_clean"},
        f"fresh seed {seed} training pipeline",
    )
    if not _typed_equal(
        pipeline,
        {
            "source_revision": registry["training_pipeline_revision"],
            "tracked_tree_clean": True,
        },
    ):
        raise ValueError(f"fresh seed {seed} training pipeline mismatch")

    runtime = result["training_runtime"]
    expected_runtime_fields = set(plan["runtime"]) | {
        "mps_built",
        "mps_available",
        "cuda_available",
    }
    _exact_keys(runtime, expected_runtime_fields, f"fresh seed {seed} runtime")
    for field, expected in plan["runtime"].items():
        if type(runtime[field]) is not type(expected) or runtime[field] != expected:
            raise ValueError(f"fresh seed {seed} runtime {field} mismatch")
    if any(
        type(runtime[field]) is not bool
        for field in ("mps_built", "mps_available", "cuda_available")
    ):
        raise ValueError(f"fresh seed {seed} runtime flags are invalid")

    artifact = result["candidate_artifact"]
    _exact_keys(
        artifact,
        {"name", "bytes", "sha256"},
        f"fresh seed {seed} candidate artifact",
    )
    if not _typed_equal(
        artifact,
        {
            "name": "final.pt",
            "bytes": checkpoint_receipt["bytes"],
            "sha256": checkpoint_receipt["sha256"],
        },
    ):
        raise ValueError(f"fresh seed {seed} candidate artifact mismatch")
    _validate_history(result["training_history"], f"fresh seed {seed} history")


def _validate_checkpoint_data(
    checkpoint: Mapping[str, Any],
    *,
    plan: Mapping[str, Any],
    contract: Mapping[str, Any],
    seed: int,
) -> None:
    data = checkpoint["data_provenance"]
    _exact_keys(
        data,
        {
            "train",
            "replay",
            "replay_exclusion",
            "model_selection",
            "final_holdout",
        },
        f"fresh seed {seed} checkpoint data",
    )
    if not _typed_equal(
        data["model_selection"],
        {
            "labels_read": False,
            "path_received_by_training_cli": False,
            "epoch_evaluations": 0,
        },
    ) or not _typed_equal(
        data["final_holdout"],
        {"labels_read": False, "status": "sealed_not_opened"},
    ):
        raise ValueError(f"fresh seed {seed} checkpoint label isolation mismatch")

    train = data["train"]
    _exact_keys(
        train,
        {
            "path",
            "real_path",
            "sha256",
            "bytes",
            "usable_rows",
            "selection",
            "requested_limit",
            "role",
        },
        f"fresh seed {seed} checkpoint train provenance",
    )
    if (
        not isinstance(train["path"], str)
        or not train["path"]
        or not isinstance(train["real_path"], str)
        or not train["real_path"]
        or not _typed_equal(
            {field: train[field] for field in set(train) - {"path", "real_path"}},
            {
                "sha256": contract["model_training_sha256"],
                "bytes": contract["model_training_bytes"],
                "usable_rows": contract["model_training_records"],
                "selection": "all",
                "requested_limit": 0,
                "role": "model_training",
            },
        )
    ):
        raise ValueError(f"fresh seed {seed} checkpoint train provenance mismatch")

    replay = data["replay"]
    _exact_keys(
        replay,
        {
            "path",
            "real_path",
            "sha256",
            "bytes",
            "usable_rows",
            "selection",
            "requested_limit",
            "sample_seed",
            "replay_ratio",
            "excluded_semantic_position_ids",
            "excluded_semantic_position_ids_sha256",
            "eligible_rows_after_semantic_exclusion",
            "excluded_rows_before_sampling",
        },
        f"fresh seed {seed} checkpoint replay provenance",
    )
    replay_exclusion = plan["inputs"]["replay_exclusion"]
    if (
        not isinstance(replay["path"], str)
        or not replay["path"]
        or not isinstance(replay["real_path"], str)
        or not replay["real_path"]
        or replay["sha256"] != contract["replay_sha256"]
        or type(replay["bytes"]) is not int
        or replay["bytes"] != plan["inputs"]["replay"]["bytes"]
        or type(replay["usable_rows"]) is not int
        or replay["usable_rows"] != contract["replay_limit"]
        or replay["selection"] != "uniform_without_replacement_after_semantic_exclusion"
        or type(replay["requested_limit"]) is not int
        or replay["requested_limit"] != contract["replay_limit"]
        or type(replay["sample_seed"]) is not int
        or replay["sample_seed"] != seed + 2
        or type(replay["replay_ratio"]) is not float
        or replay["replay_ratio"] != 1.0
        or type(replay["excluded_semantic_position_ids"]) is not int
        or replay["excluded_semantic_position_ids"] != replay_exclusion["count"]
        or replay["excluded_semantic_position_ids_sha256"]
        != replay_exclusion["identifiers_sha256"]
        or type(replay["eligible_rows_after_semantic_exclusion"]) is not int
        or replay["eligible_rows_after_semantic_exclusion"] < contract["replay_limit"]
        or type(replay["excluded_rows_before_sampling"]) is not int
        or replay["excluded_rows_before_sampling"] < 0
    ):
        raise ValueError(f"fresh seed {seed} checkpoint replay provenance mismatch")

    exclusion = data["replay_exclusion"]
    _exact_keys(
        exclusion,
        {"path", "format", "bytes", "sha256", "count", "identifiers_sha256"},
        f"fresh seed {seed} checkpoint replay exclusion",
    )
    if (
        not isinstance(exclusion["path"], str)
        or not exclusion["path"]
        or not _typed_equal(
            {field: exclusion[field] for field in set(exclusion) - {"path"}},
            {
                field: replay_exclusion[field]
                for field in (
                    "format",
                    "bytes",
                    "sha256",
                    "count",
                    "identifiers_sha256",
                )
            },
        )
    ):
        raise ValueError(f"fresh seed {seed} checkpoint replay exclusion mismatch")


def _validate_checkpoint(
    checkpoint: Mapping[str, Any],
    *,
    result: Mapping[str, Any],
    plan: Mapping[str, Any],
    plan_path: str,
    root: str,
    registered_run: Mapping[str, Any],
    strict_model_validator: Callable[[Any, int], None],
) -> dict[str, Any]:
    seed = registered_run["seed"]
    _exact_keys(checkpoint, CHECKPOINT_FIELDS, f"fresh seed {seed} checkpoint")
    if (
        checkpoint["schema"] != FRESH_QAT_FINAL_CHECKPOINT_SCHEMA
        or type(checkpoint["epoch"]) is not int
        or checkpoint["epoch"] != 20
    ):
        raise ValueError(f"fresh seed {seed} checkpoint schema/epoch mismatch")
    for field in (
        "experiment_plan",
        "experiment_contract",
        "training_pipeline",
        "training_runtime",
        "training_history",
    ):
        if not _typed_equal(checkpoint[field], result[field]):
            raise ValueError(f"fresh seed {seed} checkpoint/result {field} mismatch")

    args = checkpoint["args"]
    if not isinstance(args, Mapping) or args.get("val_data") not in (None, ""):
        raise ValueError(f"fresh seed {seed} checkpoint received selection labels")
    expected_args = {
        "experiment_family": "int16-aware",
        "experiment_series": None,
        "seed": seed,
        "loss": "sibling-ranking",
        "epochs": 20,
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
        "replay_limit": 500_000,
        "replay_ratio": 1.0,
        "limit": 0,
        "select_metric": "auto",
        "allow_legacy_init": True,
        "pipeline_revision": result["training_pipeline"]["source_revision"],
    }
    if any(
        type(args.get(field)) is not type(expected) or args.get(field) != expected
        for field, expected in expected_args.items()
    ):
        raise ValueError(f"fresh seed {seed} checkpoint invocation mismatch")
    for field in (
        "data",
        "sibling_manifest",
        "validation_partition_manifest",
        "holdout_protected_position_ids",
        "policy_exposure_receipt",
        "policy_exposed_parent_ids",
        "policy_exposed_semantic_position_ids",
        "replay_data",
        "replay_excluded_position_ids",
        "init_ckpt",
    ):
        if not isinstance(args.get(field), str) or not args[field]:
            raise ValueError(f"fresh seed {seed} checkpoint path contract mismatch")
    if (
        not isinstance(args.get("experiment_plan"), str)
        or os.path.realpath(args["experiment_plan"]) != plan_path
        or not isinstance(args.get("out"), str)
        or os.path.realpath(args["out"])
        != _registered_path(root, registered_run["output"], "fresh output")
    ):
        raise ValueError(f"fresh seed {seed} checkpoint output/plan path mismatch")

    expected_arch = {
        "schema": 1,
        "features": "board",
        "input": 2282,
        "h1": 256,
        "h2": 32,
        "k": 600.0,
        "kp_buckets": 1,
    }
    if not _typed_equal(checkpoint["arch"], expected_arch):
        raise ValueError(f"fresh seed {seed} checkpoint architecture mismatch")
    initializer = checkpoint["init_checkpoint"]
    _exact_keys(
        initializer,
        {"path", "sha256", "bytes", "epoch", "legacy_arch_inferred_fields"},
        f"fresh seed {seed} checkpoint initializer",
    )
    if (
        not isinstance(initializer["path"], str)
        or not initializer["path"]
        or initializer["sha256"] != FRESH_QAT_WARM_INITIALIZER_SHA256
        or type(initializer["bytes"]) is not int
        or initializer["bytes"] != FRESH_QAT_WARM_INITIALIZER_BYTES
        or type(initializer["epoch"]) is not int
        or initializer["epoch"] != 27
        or not _typed_equal(initializer["legacy_arch_inferred_fields"], ["schema"])
    ):
        raise ValueError(f"fresh seed {seed} checkpoint initializer mismatch")
    if not _typed_equal(
        checkpoint["objective"],
        {
            "float_task_weight": 0.5,
            "ste_task_weight": 0.5,
            "float_task": ["value", "rank", "policy", "replay_value"],
            "ste_task": ["value", "rank", "policy", "replay_value"],
            "primary_batch_shared": True,
            "replay_indices_shared": True,
        },
    ):
        raise ValueError(f"fresh seed {seed} checkpoint objective mismatch")
    if not _typed_equal(
        checkpoint["checkpoint_selection"],
        {
            "mode": "final-only",
            "selection_labels_read": False,
            "selection_evaluations": 0,
            "early_stopping": False,
            "candidate_artifact": "final.pt",
        },
    ):
        raise ValueError(f"fresh seed {seed} checkpoint selection mismatch")

    _validate_checkpoint_data(
        checkpoint,
        plan=plan,
        contract=result["experiment_contract"],
        seed=seed,
    )
    strict_model_validator(checkpoint["model"], seed)
    return {"schema": checkpoint["schema"], "epoch": checkpoint["epoch"]}


def _torch_checkpoint_loader(raw: bytes) -> Mapping[str, Any]:
    try:
        if type(raw) is not bytes or not raw:
            raise TypeError("checkpoint input must be nonempty immutable bytes")
        import torch

        value = torch.load(
            io.BytesIO(raw),
            map_location="cpu",
            weights_only=True,
        )
    except Exception as error:
        raise ValueError(
            f"cannot strict-load fresh final checkpoint: {error}"
        ) from error
    if not isinstance(value, Mapping):
        raise ValueError("fresh final checkpoint root must be a mapping")
    return value


def _torch_strict_model_validator(model: Any, seed: int) -> None:
    try:
        import torch
        from train import DistillNet
    except Exception as error:
        raise ValueError(f"cannot import strict model validator: {error}") from error
    expected_shapes = {
        "board.weight": (2269, 256),
        "hand.weight": (256, 14),
        "hand.bias": (256,),
        "l2.weight": (32, 256),
        "l2.bias": (32,),
        "l3.weight": (1, 32),
        "l3.bias": (1,),
    }
    if not isinstance(model, Mapping) or set(model) != set(expected_shapes):
        raise ValueError(f"fresh seed {seed} checkpoint model fields mismatch")
    for name, tensor in model.items():
        if (
            not isinstance(tensor, torch.Tensor)
            or tuple(tensor.shape) != expected_shapes[name]
            or tensor.dtype != torch.float32
            or not bool(torch.isfinite(tensor).all().item())
        ):
            raise ValueError(f"fresh seed {seed} model tensor {name} is invalid")
    try:
        strict_model = DistillNet("board")
        strict_model.load_state_dict(model, strict=True)
    except (KeyError, RuntimeError, ValueError) as error:
        raise ValueError(
            f"fresh seed {seed} model cannot strict-load into DistillNet: {error}"
        ) from error


class FreshQatSelectionPreflightReceipt:
    """One-shot public-API guard created only by the fixed public preflight."""

    __slots__ = ("__weakref__",)

    def __init__(self, brand: object, value: Mapping[str, Any]) -> None:
        if brand is not _RECEIPT_BRAND:
            raise TypeError("fresh selection receipt cannot be constructed externally")
        serialized = (json.dumps(value, sort_keys=True, allow_nan=False) + "\n").encode(
            "utf-8"
        )
        _RECEIPT_STATES[self] = serialized

    def to_dict(self) -> dict[str, Any]:
        serialized = _RECEIPT_STATES.get(self)
        if serialized is None:
            raise ValueError("fresh selection receipt is invalid or already used")
        return _strict_json(serialized, "fresh QAT selection preflight receipt")

    def _claim(self) -> dict[str, Any]:
        try:
            serialized = _RECEIPT_STATES.pop(self)
        except KeyError:
            raise ValueError("fresh selection receipt is invalid or already used")
        return _strict_json(serialized, "fresh QAT selection preflight receipt")


def call_fresh_selection_reader(
    receipt: FreshQatSelectionPreflightReceipt,
    selection_reader: Callable[[Mapping[str, Any]], Any],
) -> Any:
    """Invoke one reader once, but only with a branded all-three receipt."""
    if (
        type(receipt) is not FreshQatSelectionPreflightReceipt
        or receipt not in _RECEIPT_STATES
    ):
        raise ValueError("fresh selection reader requires an unused preflight receipt")
    if not callable(selection_reader):
        raise TypeError("fresh selection reader must be callable")
    public_receipt = receipt._claim()
    return selection_reader(public_receipt)


def _preflight_fresh_qat_selection(
    *,
    repo_root: str,
    tracking_verifier: Callable[[str, bytes], None],
    checkpoint_loader: Callable[[bytes], Mapping[str, Any]],
    strict_model_validator: Callable[[Any, int], None],
) -> dict[str, Any]:
    root = os.path.realpath(repo_root)
    registry_path = os.path.join(
        root,
        FRESH_QAT_SELECTION_REGISTRY_RELATIVE_PATH,
    )
    try:
        registry_raw = _read_exact_file(
            registry_path,
            "fresh QAT selection registry",
        )
    except ValueError as error:
        raise _data_only_blocker("tracked selection registry is absent") from error
    registry = _strict_json(registry_raw, "fresh QAT selection registry")
    ready = _validate_registry(registry)
    tracking_verifier(registry_path, registry_raw)
    if _read_exact_file(registry_path, "fresh QAT selection registry") != registry_raw:
        raise ValueError("fresh QAT selection registry changed during verification")
    if not ready:
        raise _data_only_blocker("selection registry remains closed")

    training_registry_path = os.path.join(root, FRESH_QAT_REGISTRY_RELATIVE_PATH)
    training_registry_raw = _read_exact_file(
        training_registry_path,
        "fresh QAT training plan registry",
    )
    training_registry = _strict_json(
        training_registry_raw,
        "fresh QAT training plan registry",
    )
    if not _validate_training_plan_registry(training_registry):
        raise _data_only_blocker("fresh training plan registry remains closed")
    if not _typed_equal(
        training_registry["plan"],
        registry["execution_plan"],
    ):
        raise ValueError("fresh training/selection plan registry mismatch")
    tracking_verifier(training_registry_path, training_registry_raw)

    plan_identity = registry["execution_plan"]
    plan_receipt = _registered_snapshot(root, plan_identity, "fresh execution plan")
    plan_path = plan_receipt["path"]
    plan_raw = _read_exact_file(plan_path, "fresh execution plan")
    if (
        len(plan_raw) != plan_identity["bytes"]
        or hashlib.sha256(plan_raw).hexdigest() != plan_identity["sha256"]
    ):
        raise ValueError("fresh execution plan changed after snapshot")
    plan = _strict_json(plan_raw, "fresh execution plan")
    _validate_plan_shape(plan)
    tracking_verifier(plan_path, plan_raw)

    registered_runs = registry["runs"]
    artifact_receipts = []
    for registered_run in registered_runs:
        seed = registered_run["seed"]
        result_receipt, result_raw = _registered_content_snapshot(
            root,
            registered_run["result"],
            f"fresh seed {seed} result",
        )
        checkpoint_receipt, checkpoint_raw = _registered_content_snapshot(
            root,
            registered_run["checkpoint"],
            f"fresh seed {seed} checkpoint",
        )
        artifact_receipts.append(
            {
                "registered_run": registered_run,
                "result": result_receipt,
                "result_raw": result_raw,
                "checkpoint": checkpoint_receipt,
                "checkpoint_raw": checkpoint_raw,
            }
        )

    parsed_results = []
    for artifacts in artifact_receipts:
        registered_run = artifacts["registered_run"]
        seed = registered_run["seed"]
        result_raw = artifacts["result_raw"]
        result = _strict_json(result_raw, f"fresh seed {seed} result")
        _validate_result(
            result,
            plan=plan,
            plan_path=plan_path,
            plan_identity=plan_identity,
            registry=registry,
            registered_run=registered_run,
            checkpoint_receipt=artifacts["checkpoint"],
        )
        parsed_results.append(
            {
                **artifacts,
                "result_value": result,
            }
        )

    shared_pipeline = parsed_results[0]["result_value"]["training_pipeline"]
    shared_runtime = parsed_results[0]["result_value"]["training_runtime"]
    if any(
        not _typed_equal(
            artifacts["result_value"]["training_pipeline"],
            shared_pipeline,
        )
        or not _typed_equal(
            artifacts["result_value"]["training_runtime"],
            shared_runtime,
        )
        for artifacts in parsed_results[1:]
    ):
        raise ValueError("the three fresh QAT runs do not share one pipeline/runtime")

    runs = []
    for artifacts in parsed_results:
        registered_run = artifacts["registered_run"]
        seed = registered_run["seed"]
        try:
            checkpoint = checkpoint_loader(artifacts["checkpoint_raw"])
        except Exception as error:
            if isinstance(error, ValueError):
                raise
            raise ValueError(
                f"cannot strict-load fresh seed {seed} checkpoint: {error}"
            ) from error
        if not isinstance(checkpoint, Mapping):
            raise ValueError(f"fresh seed {seed} checkpoint root must be a mapping")
        checkpoint_metadata = _validate_checkpoint(
            checkpoint,
            result=artifacts["result_value"],
            plan=plan,
            plan_path=plan_path,
            root=root,
            registered_run=registered_run,
            strict_model_validator=strict_model_validator,
        )
        runs.append(
            {
                "slot_id": registered_run["slot_id"],
                "seed": seed,
                "output": registered_run["output"],
                "result": dict(artifacts["result"]),
                "checkpoint": dict(artifacts["checkpoint"]),
                "checkpoint_metadata": checkpoint_metadata,
            }
        )

    if [run["seed"] for run in runs] != list(FRESH_QAT_SLOT_ORDER):
        raise ValueError("fresh selection runs are outside exact seed order")
    if not all(
        run["checkpoint_metadata"]
        == {"schema": FRESH_QAT_FINAL_CHECKPOINT_SCHEMA, "epoch": 20}
        for run in runs
    ):
        raise ValueError("fresh selection checkpoint metadata is incomplete")

    if (
        _read_exact_file(registry_path, "fresh QAT selection registry") != registry_raw
        or _read_exact_file(
            training_registry_path,
            "fresh QAT training plan registry",
        )
        != training_registry_raw
        or _read_exact_file(plan_path, "fresh execution plan") != plan_raw
    ):
        raise ValueError("fresh tracked preflight inputs changed during verification")
    for artifacts in parsed_results:
        seed = artifacts["registered_run"]["seed"]
        if (
            _read_exact_file(
                artifacts["result"]["path"],
                f"fresh seed {seed} result",
            )
            != artifacts["result_raw"]
        ):
            raise ValueError(f"fresh seed {seed} result changed during preflight")
        _registered_snapshot(
            root,
            artifacts["registered_run"]["checkpoint"],
            f"fresh seed {seed} checkpoint",
        )

    receipt_value = {
        "schema": FRESH_QAT_SELECTION_PREFLIGHT_SCHEMA,
        "all_three_complete_before_selection_read": True,
        "selection_labels_read": False,
        "execution_plan": plan_receipt,
        "training_pipeline": {
            "source_revision": registry["training_pipeline_revision"],
            "tracked_tree_clean": True,
        },
        "runs": runs,
        "reader_gate": "one-shot-public-api-preflight-guard",
        "final_holdout": "not_opened_by_this_preflight",
        "production_promotion_authorized": False,
    }
    return receipt_value


def _git_single_line(raw: bytes, label: str) -> str:
    if (
        not raw.endswith(b"\n")
        or len(raw) <= 1
        or b"\n" in raw[:-1]
        or b"\r" in raw
        or b"\0" in raw
    ):
        raise ValueError(f"invalid fixed Git {label} output")
    try:
        return raw[:-1].decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError(f"invalid fixed Git {label} output") from error


def _ordinary_index_flags(raw: bytes) -> bool:
    if not raw:
        return True
    if not raw.endswith(b"\0"):
        return False
    return all(
        len(record) > 2 and record.startswith(b"H ") for record in raw[:-1].split(b"\0")
    )


def _stat_identity(value: os.stat_result) -> tuple[int, ...]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
        value.st_nlink,
    )


def _verify_tracked_file(
    path: str,
    expected_revision: str,
    captured_bytes: bytes,
) -> None:
    if (
        not isinstance(expected_revision, str)
        or GIT_REVISION_RE.fullmatch(expected_revision) is None
    ):
        raise ValueError("audit revision must be a lowercase 40-hex SHA-1 Git revision")
    if type(captured_bytes) is not bytes or not captured_bytes:
        raise ValueError("tracked verification requires captured immutable bytes")
    try:
        git_stat = os.lstat(FIXED_GIT_EXECUTABLE)
    except OSError as error:
        raise ValueError("fixed Git executable is unavailable") from error
    if (
        not stat.S_ISREG(git_stat.st_mode)
        or not os.access(FIXED_GIT_EXECUTABLE, os.X_OK)
        or os.path.realpath(FIXED_GIT_EXECUTABLE) != FIXED_GIT_EXECUTABLE
    ):
        raise ValueError("fixed Git executable is unavailable")

    repo_root = os.path.realpath(
        os.path.join(os.path.abspath(os.path.dirname(__file__)), "..")
    )
    canonical_path = os.path.abspath(path)
    if (
        os.path.realpath(canonical_path) != canonical_path
        or os.path.commonpath((repo_root, canonical_path)) != repo_root
    ):
        raise ValueError("fresh selection tracked file is outside the repository")
    relative = os.path.relpath(canonical_path, repo_root)
    if (
        relative in ("", ".", "..")
        or relative.startswith(".." + os.sep)
        or "\0" in relative
        or "\n" in relative
        or "\r" in relative
    ):
        raise ValueError("fresh selection tracked file is outside the repository")
    relative_bytes = os.fsencode(relative)

    def git(*arguments: str) -> bytes:
        try:
            return subprocess.run(
                [
                    FIXED_GIT_EXECUTABLE,
                    *FIXED_GIT_COMMAND_PREFIX,
                    *arguments,
                ],
                cwd=repo_root,
                env=dict(FIXED_GIT_ENVIRONMENT),
                check=True,
                capture_output=True,
                text=False,
            ).stdout
        except (OSError, subprocess.CalledProcessError) as error:
            raise ValueError("cannot verify fresh selection tracked state") from error

    def capture_git_context() -> tuple[bytes, ...]:
        return (
            git("rev-parse", "--show-toplevel"),
            git("rev-parse", "--verify", "HEAD^{commit}"),
            git(
                "status",
                "--porcelain=v1",
                "-z",
                "--untracked-files=all",
            ),
            git("ls-files", "-v", "-z"),
            git(
                "ls-tree",
                "-r",
                "-l",
                "-z",
                "--full-tree",
                "HEAD",
                "--",
                relative,
            ),
            git("ls-files", "-s", "-z", "--", relative),
            git("rev-parse", "--show-object-format"),
        )

    initial = capture_git_context()
    top_level = _git_single_line(initial[0], "top-level")
    head = _git_single_line(initial[1], "HEAD")
    object_format = _git_single_line(initial[6], "object format")
    if top_level != repo_root:
        raise ValueError("fixed Git top-level does not match the repository")
    if object_format != "sha1":
        raise ValueError("fresh selection Git object format must be sha1")
    if GIT_REVISION_RE.fullmatch(head) is None or head != expected_revision:
        raise ValueError("fresh selection audit revision does not match exact HEAD")
    if initial[2]:
        raise ValueError(
            "fresh selection audit requires a clean non-ignored worktree and index"
        )
    if not _ordinary_index_flags(initial[3]):
        raise ValueError("fresh selection Git index contains special tracked flags")

    tree_raw = initial[4]
    if not tree_raw.endswith(b"\0") or tree_raw[:-1].count(b"\0") != 0:
        raise ValueError("fresh selection tracked HEAD entry is invalid")
    tree_header, separator, tree_path = tree_raw[:-1].partition(b"\t")
    tree_fields = tree_header.split()
    if (
        separator != b"\t"
        or tree_path != relative_bytes
        or len(tree_fields) != 4
        or tree_fields[1] != b"blob"
        or tree_fields[0] not in (b"100644", b"100755")
        or re.fullmatch(rb"[0-9a-f]{40}", tree_fields[2]) is None
        or re.fullmatch(rb"(?:0|[1-9][0-9]*)", tree_fields[3]) is None
    ):
        raise ValueError("fresh selection tracked HEAD entry is invalid")
    tree_mode = tree_fields[0].decode("ascii")
    tree_object = tree_fields[2].decode("ascii")
    tree_bytes = int(tree_fields[3])

    index_raw = initial[5]
    if not index_raw.endswith(b"\0") or index_raw[:-1].count(b"\0") != 0:
        raise ValueError("fresh selection tracked index entry is invalid")
    index_header, separator, index_path = index_raw[:-1].partition(b"\t")
    index_fields = index_header.split()
    if (
        separator != b"\t"
        or index_path != relative_bytes
        or len(index_fields) != 3
        or index_fields[2] != b"0"
        or index_fields[0].decode("ascii", "ignore") != tree_mode
        or index_fields[1].decode("ascii", "ignore") != tree_object
    ):
        raise ValueError("fresh selection tracked index entry is invalid")

    try:
        before = os.lstat(canonical_path)
        current_bytes = _read_exact_file(canonical_path, "tracked preflight input")
        after = os.lstat(canonical_path)
    except OSError as error:
        raise ValueError("cannot verify fresh selection tracked bytes") from error
    if (
        not stat.S_ISREG(before.st_mode)
        or _stat_identity(before) != _stat_identity(after)
        or os.path.realpath(canonical_path) != canonical_path
        or current_bytes != captured_bytes
        or before.st_size != len(captured_bytes)
        or (tree_mode == "100755") != bool(before.st_mode & 0o111)
        or tree_bytes != len(captured_bytes)
    ):
        raise ValueError("fresh selection tracked bytes or mode differ from HEAD")
    blob_header = f"blob {len(captured_bytes)}\0".encode("ascii")
    actual_object = hashlib.sha1(blob_header + captured_bytes).hexdigest()
    if actual_object != tree_object:
        raise ValueError("fresh selection tracked bytes or mode differ from HEAD")

    final = capture_git_context()
    if final != initial:
        raise ValueError("fresh selection Git state changed during verification")


def preflight_fresh_qat_selection(
    *,
    audit_revision: str,
) -> FreshQatSelectionPreflightReceipt:
    """Return a one-shot API guard, or fail before any selection reader exists."""
    root = os.path.realpath(
        os.path.join(os.path.abspath(os.path.dirname(__file__)), "..")
    )
    validated = _preflight_fresh_qat_selection(
        repo_root=root,
        tracking_verifier=lambda path, raw: _verify_tracked_file(
            path,
            audit_revision,
            raw,
        ),
        checkpoint_loader=_torch_checkpoint_loader,
        strict_model_validator=_torch_strict_model_validator,
    )
    return FreshQatSelectionPreflightReceipt(_RECEIPT_BRAND, validated)


__all__ = [
    "FRESH_QAT_SELECTION_PREFLIGHT_SCHEMA",
    "FRESH_QAT_SELECTION_REGISTRY_RELATIVE_PATH",
    "FRESH_QAT_SELECTION_REGISTRY_SCHEMA",
    "FreshQatSelectionPreflightReceipt",
    "call_fresh_selection_reader",
    "preflight_fresh_qat_selection",
]
