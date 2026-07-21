"""Closed protocol for the strength-first quantized-cell alignment family.

This family starts from the three completed strength-first checkpoints, keeps
their deployed integer tensors bit-exact, and changes only the float parameters
inside those integer quantization cells.  It never receives replay, selection,
or final-holdout data.
"""

from __future__ import annotations

from collections.abc import Mapping
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import re
from typing import Any

import strength_first_qat_training_bridge as BASE


ALIGNMENT_PLAN_SCHEMA = (
    "shogi-floodgate-strength-first-qat-constrained-alignment-v2-plan-v1"
)
ALIGNMENT_PLAN_STATUS = "exact-parent-checkpoints-ready-for-cell-alignment"
ALIGNMENT_CONTRACT_SCHEMA = (
    "shogi-floodgate-strength-first-qat-constrained-alignment-v2-contract-v1"
)
ALIGNMENT_RESULT_SCHEMA = (
    "shogi-floodgate-strength-first-qat-constrained-alignment-v2-result-v1"
)
ALIGNMENT_CHECKPOINT_SCHEMA = (
    "shogi-floodgate-strength-first-qat-constrained-alignment-v2-checkpoint-v1"
)
ALIGNMENT_PLAN_RELATIVE_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-strength-first-qat-constrained-alignment-v2-plan.json"
)
PARENT_PREFLIGHT_REGISTRY_RELATIVE_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-strength-first-qat-selection-preflight-registry.json"
)
ALIGNMENT_RUN_ROOT = (
    "ml/runs/" "floodgate-q1-2026-strength-first-int16-aware-constrained-alignment-v2"
)
ALIGNMENT_SEEDS = (42, 43, 44)
ALIGNMENT_SOURCE_PATHS = {
    "base_bridge": "ml/strength_first_qat_training_bridge.py",
    "base_training": "ml/train.py",
    "integer_forward": "ml/int16_forward.py",
    "alignment_core": "ml/strength_first_quantized_cell_alignment.py",
    "alignment_protocol": "ml/strength_first_qat_constrained_alignment_v2_protocol.py",
    "plan_builder": "ml/build_strength_first_qat_constrained_alignment_v2_plan_candidate.py",
    "alignment_trainer": "ml/train_strength_first_qat_constrained_alignment_v2.py",
    "alignment_launcher": "ml/run_strength_first_three_seed_constrained_alignment_v2.py",
}
ALIGNMENT_DEVELOPMENT = {
    "attempt_index": 2,
    "attempt_cap": 2,
    "spent_selection_received_by_training": False,
    "selection_metrics_received_by_training": False,
    "claim_limit": "float-int-alignment-only-not-playing-strength",
}
ALIGNMENT_TRAINING = {
    "family": "int16-aware-constrained-alignment-v2",
    "architecture": "2282-256-32-1-clipped-relu",
    "features": "board",
    "parent_epoch": 20,
    "local_epochs": 4,
    "epoch_offset": 20,
    "final_epoch": 24,
    "batch": 256,
    "torch_threads": 2,
    "optimizer": "AdamW",
    "learning_rate": 0.00001,
    "betas": [0.9, 0.999],
    "eps": 1e-8,
    "weight_decay": 0.0,
    "amsgrad": False,
    "optimizer_state": "fresh-not-resumed",
    "scheduler": "CosineAnnealingLR",
    "scheduler_t_max": 4,
    "batch_generator_seed": "seed+global_epoch",
    "huber_beta_logit": 0.015625,
    "policy_consistency_weight": 0.25,
    "k_sigmoid": 600.0,
    "policy_temperature_cp": 200.0,
    "integer_target_cache": (
        "precompute-once-from-seed-parent-anchor-exact-int16-forward"
    ),
    "integer_target_cache_chunk_rows": 8192,
    "integer_target_cache_dtype": "float32-normalized-logit",
    "integer_target_cache_reused_local_epochs": 4,
    "objective": (
        "smooth_l1(float_logit,detached_exact_int_logit)"
        "+0.25*mean_parent_kl(exact_int_policy||float_policy)"
    ),
    "quantized_cell_projection": (
        "restore-crossing-coordinates-to-seed-parent-and-clear-moments"
    ),
    "quantized_invariant_checks": [
        "after-every-optimizer-step",
        "after-every-epoch",
        "before-save",
        "after-strict-reload",
    ],
    "primary_rows": 278736,
    "primary_parents": 23980,
    "replay_rows": 0,
    "teacher_target_loss": False,
    "selection_evaluations": 0,
    "early_stopping": False,
    "candidate_artifact": "final.pt",
}
ALIGNMENT_BOUNDARY = {
    "local_only": True,
    "network": False,
    "training_only": True,
    "replay_read_authorized": False,
    "selection_label_read_authorized": False,
    "final_holdout_label_read_authorized": False,
    "candidate_selection_authorized": False,
    "production_weight_write_authorized": False,
}

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_PLAN_FIELDS = {
    "schema",
    "status",
    "development",
    "base_training",
    "implementation",
    "data",
    "runtime",
    "parents",
    "training",
    "slots",
    "boundary",
}


def _object_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def _reject_constant(value: str):
    raise ValueError(f"non-finite JSON number {value!r} is forbidden")


def _reject_nonfinite(value: Any, label: str) -> None:
    if type(value) is float and not math.isfinite(value):
        raise ValueError(f"{label} contains a non-finite number")
    if type(value) is dict:
        for key, child in value.items():
            _reject_nonfinite(child, f"{label}.{key}")
    elif type(value) is list:
        for index, child in enumerate(value):
            _reject_nonfinite(child, f"{label}[{index}]")


def strict_json(raw: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            raw,
            object_pairs_hook=_object_pairs,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise ValueError(f"invalid {label}: {error}") from error
    if type(value) is not dict:
        raise ValueError(f"{label} root must be an object")
    _reject_nonfinite(value, label)
    return value


def canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            indent=2,
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")


def file_identity(
    path: str | os.PathLike[str], *, relative: str, schema: str
) -> dict[str, Any]:
    raw = Path(path).read_bytes()
    return {
        "path": relative,
        "schema": schema,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _exact(value: Any, fields: set[str], label: str) -> dict[str, Any]:
    if type(value) is not dict or set(value) != fields:
        raise ValueError(f"{label} fields are not exact")
    return value


def _identity(
    value: Any, *, label: str, path: str | None = None, schema: str | None = None
) -> dict[str, Any]:
    identity = _exact(value, {"path", "schema", "bytes", "sha256"}, label)
    if (
        type(identity["path"]) is not str
        or not identity["path"]
        or (path is not None and identity["path"] != path)
        or type(identity["schema"]) is not str
        or not identity["schema"]
        or (schema is not None and identity["schema"] != schema)
        or type(identity["bytes"]) is not int
        or identity["bytes"] < 1
        or type(identity["sha256"]) is not str
        or _SHA256_RE.fullmatch(identity["sha256"]) is None
    ):
        raise ValueError(f"{label} identity is invalid")
    return identity


def expected_slots() -> list[dict[str, Any]]:
    return [
        {
            "id": f"floodgate-strength-first-int16-aware-constrained-alignment-v2-seed-{seed}",
            "seed": seed,
            "output": f"{ALIGNMENT_RUN_ROOT}/seed-{seed}",
        }
        for seed in ALIGNMENT_SEEDS
    ]


def validate_alignment_plan(plan: Mapping[str, Any]) -> dict[str, Any]:
    plan = _exact(
        dict(plan) if isinstance(plan, Mapping) else plan,
        _PLAN_FIELDS,
        "alignment plan",
    )
    if (
        plan["schema"] != ALIGNMENT_PLAN_SCHEMA
        or plan["status"] != ALIGNMENT_PLAN_STATUS
        or plan["development"] != ALIGNMENT_DEVELOPMENT
        or plan["training"] != ALIGNMENT_TRAINING
        or plan["slots"] != expected_slots()
        or plan["boundary"] != ALIGNMENT_BOUNDARY
    ):
        raise ValueError("alignment plan fixed recipe drifted")
    base = _exact(
        plan["base_training"],
        {"plan", "parent_preflight_registry"},
        "alignment base training",
    )
    _identity(
        base["plan"],
        label="alignment base plan",
        path=BASE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH,
        schema=BASE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
    )
    _identity(
        base["parent_preflight_registry"],
        label="alignment parent preflight registry",
        path=PARENT_PREFLIGHT_REGISTRY_RELATIVE_PATH,
        schema="shogi-floodgate-strength-first-qat-selection-preflight-registry-v1",
    )
    implementation = _exact(
        plan["implementation"],
        set(ALIGNMENT_SOURCE_PATHS),
        "alignment implementation",
    )
    for name, expected_path in ALIGNMENT_SOURCE_PATHS.items():
        _identity(
            implementation[name],
            label=f"alignment implementation {name}",
            path=expected_path,
            schema="shogi-reviewed-python-source-v1",
        )
    data = _exact(plan["data"], {"model_training"}, "alignment data")
    model_training = _exact(
        data["model_training"],
        {
            "path",
            "format",
            "bytes",
            "sha256",
            "records",
            "parents",
            "games",
            "game_ids_sha256",
            "parent_ids_sha256",
            "semantic_position_ids_count",
            "semantic_position_ids_sha256",
        },
        "alignment model training",
    )
    if (
        model_training["path"] != "train.jsonl"
        or model_training["records"] != ALIGNMENT_TRAINING["primary_rows"]
        or model_training["parents"] != ALIGNMENT_TRAINING["primary_parents"]
        or type(model_training["bytes"]) is not int
        or model_training["bytes"] < 1
    ):
        raise ValueError("alignment model-training identity drifted")
    for field in (
        "sha256",
        "game_ids_sha256",
        "parent_ids_sha256",
        "semantic_position_ids_sha256",
    ):
        if (
            type(model_training.get(field)) is not str
            or _SHA256_RE.fullmatch(model_training[field]) is None
        ):
            raise ValueError(f"alignment model-training {field} is invalid")
    runtime = _exact(
        plan["runtime"],
        {
            "platform",
            "system",
            "machine",
            "processor",
            "cpu_model",
            "logical_cpu_count",
            "device",
            "python_version",
            "torch_version",
            "torch_threads",
            "torch_interop_threads",
            "deterministic_algorithms",
            "deterministic_debug_mode",
        },
        "alignment runtime",
    )
    if (
        runtime["device"] != "cpu"
        or runtime["torch_threads"] != 2
        or runtime["torch_interop_threads"] != 1
        or runtime["deterministic_algorithms"] is not True
        or runtime["deterministic_debug_mode"] != "error"
    ):
        raise ValueError("alignment runtime drifted")
    parents = plan["parents"]
    if type(parents) is not list or len(parents) != 3:
        raise ValueError("alignment plan requires three parents")
    for parent, seed in zip(parents, ALIGNMENT_SEEDS):
        parent = _exact(
            parent,
            {"seed", "slot_id", "result", "checkpoint"},
            f"alignment parent {seed}",
        )
        expected_output = f"{BASE.STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{seed}"
        if (
            parent["seed"] != seed
            or parent["slot_id"] != f"floodgate-strength-first-int16-aware-seed-{seed}"
        ):
            raise ValueError(f"alignment parent {seed} slot drifted")
        _identity(
            parent["result"],
            label=f"alignment parent {seed} result",
            path=f"{expected_output}/result.json",
            schema=BASE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA,
        )
        checkpoint = _exact(
            parent["checkpoint"],
            {"path", "schema", "bytes", "sha256", "epoch"},
            f"alignment parent {seed} checkpoint",
        )
        _identity(
            {key: checkpoint[key] for key in ("path", "schema", "bytes", "sha256")},
            label=f"alignment parent {seed} checkpoint",
            path=f"{expected_output}/final.pt",
            schema=BASE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
        )
        if checkpoint["epoch"] != 20:
            raise ValueError(f"alignment parent {seed} checkpoint epoch drifted")
    if len({parent["checkpoint"]["sha256"] for parent in parents}) != 3:
        raise ValueError("alignment parent checkpoint identities are not distinct")
    return copy.deepcopy(plan)


def load_alignment_plan(
    repo_root: str | os.PathLike[str] | None = None,
) -> dict[str, Any]:
    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    path = root / ALIGNMENT_PLAN_RELATIVE_PATH
    try:
        raw = path.read_bytes()
    except OSError as error:
        raise ValueError("alignment plan is not published") from error
    return validate_alignment_plan(strict_json(raw, "alignment plan"))


def verify_registered_file(
    repo_root: str | os.PathLike[str],
    identity: Mapping[str, Any],
    label: str,
) -> bytes:
    root = Path(repo_root).resolve()
    registered = _identity(identity, label=label)
    path = (root / registered["path"]).resolve()
    try:
        path.relative_to(root)
    except ValueError as error:
        raise ValueError(f"{label} escapes the repository") from error
    if path != root / registered["path"]:
        raise ValueError(f"{label} path is not canonical")
    try:
        raw = path.read_bytes()
    except OSError as error:
        raise ValueError(f"{label} cannot be read") from error
    if (
        len(raw) != registered["bytes"]
        or hashlib.sha256(raw).hexdigest() != registered["sha256"]
    ):
        raise ValueError(f"{label} identity mismatch")
    return raw


def validate_runtime(plan: Mapping[str, Any], observed: Mapping[str, Any]) -> None:
    expected = plan["runtime"]
    if type(observed) is not dict or any(
        type(observed.get(field)) is not type(value) or observed.get(field) != value
        for field, value in expected.items()
    ):
        raise ValueError("alignment runtime differs from the plan")


def alignment_contract(plan: Mapping[str, Any], seed: int) -> dict[str, Any]:
    plan = validate_alignment_plan(plan)
    if type(seed) is not int or seed not in ALIGNMENT_SEEDS:
        raise ValueError("alignment seed is not registered")
    parent = next(value for value in plan["parents"] if value["seed"] == seed)
    slot = next(value for value in plan["slots"] if value["seed"] == seed)
    plan_bytes = canonical_json_bytes(plan)
    return {
        "schema": ALIGNMENT_CONTRACT_SCHEMA,
        "family": ALIGNMENT_TRAINING["family"],
        "seed": seed,
        "slot_id": slot["id"],
        "output": slot["output"],
        "alignment_plan_bytes": len(plan_bytes),
        "alignment_plan_sha256": hashlib.sha256(plan_bytes).hexdigest(),
        "parent_result_sha256": parent["result"]["sha256"],
        "parent_checkpoint_sha256": parent["checkpoint"]["sha256"],
        "parent_epoch": 20,
        "local_epochs": 4,
        "epoch_offset": 20,
        "final_epoch": 24,
        "model_training_sha256": plan["data"]["model_training"]["sha256"],
        "model_training_bytes": plan["data"]["model_training"]["bytes"],
        "model_training_records": plan["data"]["model_training"]["records"],
        "model_training_parents": plan["data"]["model_training"]["parents"],
        "training": copy.deepcopy(ALIGNMENT_TRAINING),
        "boundary": copy.deepcopy(ALIGNMENT_BOUNDARY),
    }


def cosine_learning_rates() -> list[float]:
    return [
        ALIGNMENT_TRAINING["learning_rate"]
        * (1.0 + math.cos(math.pi * local_epoch / 4.0))
        / 2.0
        for local_epoch in range(4)
    ]


__all__ = [
    "ALIGNMENT_BOUNDARY",
    "ALIGNMENT_CHECKPOINT_SCHEMA",
    "ALIGNMENT_CONTRACT_SCHEMA",
    "ALIGNMENT_DEVELOPMENT",
    "ALIGNMENT_PLAN_RELATIVE_PATH",
    "ALIGNMENT_PLAN_SCHEMA",
    "ALIGNMENT_PLAN_STATUS",
    "ALIGNMENT_RESULT_SCHEMA",
    "ALIGNMENT_RUN_ROOT",
    "ALIGNMENT_SEEDS",
    "ALIGNMENT_SOURCE_PATHS",
    "ALIGNMENT_TRAINING",
    "PARENT_PREFLIGHT_REGISTRY_RELATIVE_PATH",
    "alignment_contract",
    "canonical_json_bytes",
    "cosine_learning_rates",
    "expected_slots",
    "file_identity",
    "load_alignment_plan",
    "strict_json",
    "validate_alignment_plan",
    "validate_runtime",
    "verify_registered_file",
]
