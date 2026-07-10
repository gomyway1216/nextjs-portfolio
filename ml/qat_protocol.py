"""Fail-closed binding for the preregistered WCSC36 int16-aware experiment."""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
from typing import Any, Callable, Mapping


QAT_PLAN_SCHEMA = "shogi-int16-aware-experiment-plan-v1"
QAT_TRAINING_CONTRACT_SCHEMA = "shogi-int16-aware-training-experiment-v1"
QAT_TRAINING_RESULT_SCHEMA = "shogi-int16-aware-training-result-v1"
QAT_FINAL_CHECKPOINT_SCHEMA = "shogi-int16-aware-final-checkpoint-v1"
QAT_PLAN_RELATIVE_PATH = "ml/protocols/wcsc36-int16-aware-plan.json"
QAT_PLAN_BYTES = 8152
QAT_PLAN_SHA256 = "bef7863a5f6c85d5d6c5b97cc21aef48d17dae137ffd679efeda764d352a6b6b"
QAT_SLOT_ORDER = (42, 43, 44)
LOWER_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def _reject_constant(value: str):
    raise ValueError(f"non-finite JSON number {value!r} is forbidden")


def _object_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def _strict_json(raw: bytes, label: str) -> dict[str, Any]:
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
    return value


def _exact_keys(value: Any, expected: set[str], label: str) -> None:
    if type(value) is not dict or set(value) != expected:
        raise ValueError(
            f"{label} must contain exactly {', '.join(sorted(expected))}"
        )


def _sha256_file_snapshot(
    path: str,
    expected: Mapping[str, Any],
    label: str,
) -> dict[str, Any]:
    real_path = os.path.realpath(path)
    try:
        before = os.stat(real_path, follow_symlinks=True)
    except OSError as error:
        raise ValueError(f"cannot stat {label}: {error}") from error
    if not stat.S_ISREG(before.st_mode):
        raise ValueError(f"{label} must be a regular file")
    expected_bytes = expected.get("bytes")
    expected_sha256 = expected.get("sha256")
    if type(expected_bytes) is not int or expected_bytes < 1:
        raise ValueError(f"{label} byte contract is invalid")
    if not isinstance(expected_sha256, str) or LOWER_SHA256_RE.fullmatch(
        expected_sha256
    ) is None:
        raise ValueError(f"{label} SHA-256 contract is invalid")
    if before.st_size != expected_bytes:
        raise ValueError(
            f"{label} byte mismatch: expected {expected_bytes}, got {before.st_size}"
        )
    digest = hashlib.sha256()
    try:
        with open(real_path, "rb") as source:
            while block := source.read(1024 * 1024):
                digest.update(block)
    except OSError as error:
        raise ValueError(f"cannot read {label}: {error}") from error
    try:
        after = os.stat(real_path, follow_symlinks=True)
    except OSError as error:
        raise ValueError(f"cannot restat {label}: {error}") from error
    identity_before = (
        before.st_dev,
        before.st_ino,
        before.st_size,
        before.st_mtime_ns,
        before.st_ctime_ns,
    )
    identity_after = (
        after.st_dev,
        after.st_ino,
        after.st_size,
        after.st_mtime_ns,
        after.st_ctime_ns,
    )
    if identity_before != identity_after:
        raise ValueError(f"{label} changed while it was being verified")
    actual_sha256 = digest.hexdigest()
    if actual_sha256 != expected_sha256:
        raise ValueError(
            f"{label} SHA-256 mismatch: expected {expected_sha256}, "
            f"got {actual_sha256}"
        )
    return {
        "path": os.path.abspath(path),
        "real_path": real_path,
        "bytes": before.st_size,
        "sha256": actual_sha256,
    }


def _validate_plan_shape(plan: dict[str, Any]) -> None:
    _exact_keys(
        plan,
        {
            "schema",
            "hypothesis",
            "inputs",
            "runtime",
            "model",
            "fixed_point",
            "objective",
            "optimizer",
            "training",
            "slots",
            "post_training_selection",
            "failure_policy",
            "promotion",
        },
        "int16-aware plan",
    )
    if plan["schema"] != QAT_PLAN_SCHEMA:
        raise ValueError("int16-aware plan schema mismatch")
    hypothesis = plan["hypothesis"]
    if (
        type(hypothesis) is not dict
        or hypothesis.get("development_attempt_index") != 1
        or hypothesis.get("family_cap") != 1
        or hypothesis.get("claim_limit")
        != "development-screening-only-not-strength-or-causality"
    ):
        raise ValueError("int16-aware hypothesis contract mismatch")
    training = plan["training"]
    required_training = {
        "epochs": 20,
        "batch": 256,
        "primary_limit": 0,
        "replay_limit": 500000,
        "replay_ratio": 1.0,
        "torch_seed": "seed",
        "python_random_seed": "seed",
        "replay_sample_seed": "seed+2",
        "epoch_batch_and_replay_generator_seed": "seed+epoch",
        "selection_path_received": False,
        "selection_evaluations_during_training": 0,
        "final_holdout_labels_received": False,
        "checkpoint_policy": "fixed-final-epoch-only",
        "candidate_artifact": "final.pt",
        "early_stopping": False,
    }
    if training != required_training:
        raise ValueError("int16-aware final-only training contract mismatch")
    objective = plan["objective"]
    if (
        type(objective) is not dict
        or objective.get("formula") != "0.5*float_full_task+0.5*int16_ste_full_task"
        or objective.get("float_full_task_weight") != 0.5
        or objective.get("int16_ste_full_task_weight") != 0.5
        or objective.get("primary_batch_shared_between_branches") is not True
        or objective.get("replay_indices_shared_between_branches") is not True
    ):
        raise ValueError("int16-aware dual-task objective mismatch")
    slots = plan["slots"]
    expected_slots = [
        {
            "id": f"int16-aware-seed-{seed}",
            "seed": seed,
            "output": f"ml/runs/wcsc36-int16-aware/seed-{seed}",
        }
        for seed in QAT_SLOT_ORDER
    ]
    if slots != expected_slots:
        raise ValueError("int16-aware slot registry mismatch")
    selection = plan["post_training_selection"]
    if (
        type(selection) is not dict
        or selection.get("precondition")
        != "all-three-complete-result-markers-validated-before-first-selection-read"
        or selection.get("evaluations_per_checkpoint") != 1
        or selection.get("representative") != "median-ranked-seed"
        or selection.get("family_gate")
        != {
            "representative_must_pass_all_four": True,
            "minimum_seeds_passing_all_four": 2,
            "all_seeds_must_pass_both_quantization_delta_gates": True,
        }
    ):
        raise ValueError("int16-aware post-training selection contract mismatch")


def verify_qat_experiment_plan(
    args: Any,
    training_runtime: Mapping[str, Any],
    *,
    tracking_verifier: Callable[[str, str], None],
) -> dict[str, Any]:
    """Bind one training invocation to one exact final-only QAT plan slot."""
    repo_root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
    if not getattr(args, "experiment_plan", ""):
        raise ValueError("int16-aware training requires --experiment-plan")
    plan_path = os.path.realpath(args.experiment_plan)
    expected_plan_path = os.path.join(repo_root, QAT_PLAN_RELATIVE_PATH)
    if plan_path != expected_plan_path:
        raise ValueError(
            f"int16-aware plan must be the tracked {QAT_PLAN_RELATIVE_PATH}"
        )
    try:
        with open(plan_path, "rb") as source:
            raw = source.read()
    except OSError as error:
        raise ValueError(f"cannot read int16-aware plan: {error}") from error
    plan_sha256 = hashlib.sha256(raw).hexdigest()
    if len(raw) != QAT_PLAN_BYTES or plan_sha256 != QAT_PLAN_SHA256:
        raise ValueError(
            "int16-aware plan bytes are not the preregistered snapshot: "
            f"expected {QAT_PLAN_BYTES}/{QAT_PLAN_SHA256}, "
            f"got {len(raw)}/{plan_sha256}"
        )
    plan = _strict_json(raw, "int16-aware plan")
    _validate_plan_shape(plan)
    tracking_verifier(plan_path, args.pipeline_revision)
    try:
        with open(plan_path, "rb") as source:
            final_raw = source.read()
    except OSError as error:
        raise ValueError(f"cannot re-read int16-aware plan: {error}") from error
    if final_raw != raw:
        raise ValueError("int16-aware plan changed during verification")

    if getattr(args, "val_data", None):
        raise ValueError("int16-aware training may not receive model-selection data")
    if getattr(args, "experiment_family", None) != "int16-aware":
        raise ValueError("int16-aware experiment family mismatch")

    inputs = plan["inputs"]
    expected_input_fields = {
        "sibling_teacher_manifest",
        "validation_partition_manifest",
        "model_training",
        "replay",
        "warm_initializer",
        "policy_exposure_receipt",
        "policy_exposed_parent_ids",
        "policy_exposed_semantic_position_ids",
        "holdout_protected_position_ids",
        "replay_exclusion",
    }
    _exact_keys(inputs, expected_input_fields, "int16-aware plan inputs")
    input_paths = {
        "sibling_teacher_manifest": args.sibling_manifest,
        "validation_partition_manifest": args.validation_partition_manifest,
        "model_training": args.data,
        "replay": args.replay_data,
        "warm_initializer": args.init_ckpt,
        "policy_exposure_receipt": args.policy_exposure_receipt,
        "policy_exposed_parent_ids": args.policy_exposed_parent_ids,
        "policy_exposed_semantic_position_ids": (
            args.policy_exposed_semantic_position_ids
        ),
        "holdout_protected_position_ids": args.holdout_protected_position_ids,
        "replay_exclusion": args.replay_excluded_position_ids,
    }
    verified_inputs = {
        field: _sha256_file_snapshot(input_paths[field], inputs[field], field)
        for field in input_paths
    }

    runtime = plan["runtime"]
    _exact_keys(
        runtime,
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
        "int16-aware runtime",
    )
    for field, expected in runtime.items():
        actual = training_runtime.get(field)
        if type(actual) is not type(expected) or actual != expected:
            raise ValueError(
                f"int16-aware runtime {field} mismatch: expected {expected!r}, "
                f"got {actual!r}"
            )
    for field in ("mps_built", "mps_available", "cuda_available"):
        if type(training_runtime.get(field)) is not bool:
            raise ValueError(f"int16-aware runtime {field} must be boolean")

    selected_slot = next(
        (slot for slot in plan["slots"] if slot["seed"] == args.seed), None
    )
    if selected_slot is None:
        raise ValueError("int16-aware seed is not preregistered")
    expected_output = os.path.realpath(os.path.join(repo_root, selected_slot["output"]))
    if os.path.realpath(args.out) != expected_output:
        raise ValueError(
            f"int16-aware seed {args.seed} must use output {selected_slot['output']}"
        )

    model_training = inputs["model_training"]
    contract = {
        "schema": QAT_TRAINING_CONTRACT_SCHEMA,
        "family": "int16-aware",
        "slot_id": selected_slot["id"],
        "seed": args.seed,
        "loss": "sibling-ranking",
        "model_training_sha256": model_training["sha256"],
        "model_training_bytes": model_training["bytes"],
        "model_training_records": model_training["records"],
        "model_training_parents": model_training["parents"],
        "init_checkpoint_sha256": inputs["warm_initializer"]["sha256"],
        "replay_sha256": inputs["replay"]["sha256"],
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
    provenance = {
        "path": os.path.abspath(plan_path),
        "bytes": len(raw),
        "sha256": plan_sha256,
        "schema": QAT_PLAN_SCHEMA,
        "slot_id": selected_slot["id"],
        "slot_output": selected_slot["output"],
        "verified_input_sha256": {
            field: fingerprint["sha256"]
            for field, fingerprint in verified_inputs.items()
        },
    }
    replay_exclusion = dict(inputs["replay_exclusion"])
    return {
        "provenance": provenance,
        "contract": contract,
        "replay_exclusion": replay_exclusion,
    }


__all__ = [
    "QAT_PLAN_SCHEMA",
    "QAT_TRAINING_CONTRACT_SCHEMA",
    "QAT_TRAINING_RESULT_SCHEMA",
    "QAT_FINAL_CHECKPOINT_SCHEMA",
    "QAT_PLAN_RELATIVE_PATH",
    "QAT_PLAN_BYTES",
    "QAT_PLAN_SHA256",
    "QAT_SLOT_ORDER",
    "verify_qat_experiment_plan",
]
