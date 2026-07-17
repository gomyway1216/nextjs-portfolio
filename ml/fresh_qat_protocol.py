"""Fail-closed binding for the fresh Floodgate QAT execution plan.

The preregistered experiment describes the data split and frozen training
method, but the exact teacher, partition, and training artifact identities do
not exist yet.  A separate tracked registry therefore remains closed until a
reviewed data-only change publishes one exact execution-plan snapshot.
"""

from __future__ import annotations

import hashlib
import os
from typing import Any, Callable, Mapping

from qat_protocol import (
    LOWER_SHA256_RE,
    QAT_TRAINING_CONTRACT_SCHEMA,
    _exact_keys,
    _sha256_file_snapshot,
    _strict_json,
)


FRESH_QAT_EXECUTION_PLAN_SCHEMA = "shogi-floodgate-fresh-qat-execution-plan-v1"
FRESH_QAT_REGISTRY_SCHEMA = "shogi-floodgate-fresh-qat-plan-registry-v1"
FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH = (
    "ml/protocols/floodgate-q1-2026-fresh-qat-execution-plan.json"
)
FRESH_QAT_REGISTRY_RELATIVE_PATH = (
    "ml/protocols/floodgate-q1-2026-fresh-qat-plan-registry.json"
)
FRESH_QAT_PREREGISTERED_PLAN_RELATIVE_PATH = (
    "ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json"
)
FRESH_QAT_PREREGISTERED_PLAN_SCHEMA = "shogi-floodgate-fresh-sibling-plan-v1"
FRESH_QAT_PREREGISTERED_PLAN_BYTES = 10_890
FRESH_QAT_PREREGISTERED_PLAN_SHA256 = (
    "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af"
)
FRESH_QAT_BLOCKED_STATUS = (
    "awaiting-exact-tracked-execution-plan-and-artifact-identities"
)
FRESH_QAT_READY_STATUS = "exact-tracked-execution-plan-ready"
FRESH_QAT_SLOT_ORDER = (42, 43, 44)
FRESH_QAT_RUN_ROOT = "ml/runs/floodgate-q1-2026-fresh-int16-aware"
FRESH_QAT_WARM_INITIALIZER_BYTES = 2_375_274
FRESH_QAT_WARM_INITIALIZER_SHA256 = (
    "571ca3090cd0f41772514547ea5ac1d5bcd32f3f79820511645e298dbaa65ff8"
)
FRESH_QAT_REPLAY_BYTES = 800_451_089
FRESH_QAT_REPLAY_SHA256 = (
    "2207eba555fc0109fe2842ff8f92cb08d42e47893d9aabd863b3f552371a56cb"
)
FRESH_QAT_REPLAY_ROWS = 500_000
FRESH_QAT_ID_SET_FORMAT = "sorted-unique-sha256-position-id-utf8-lf-v1"

FRESH_QAT_REQUIRED_TRAINING = {
    "family": "int16-aware",
    "loss": "sibling-ranking",
    "architecture": "2282-256-32-1-clipped-relu",
    "features": "board",
    "initializer": {
        "kind": "fixed-warm-model-only",
        "bytes": FRESH_QAT_WARM_INITIALIZER_BYTES,
        "sha256": FRESH_QAT_WARM_INITIALIZER_SHA256,
    },
    "objective": "0.5*float_full_task+0.5*exact_int16_ste_full_task",
    "optimizer": "AdamW",
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
    "device": "cpu",
    "torch_threads": 2,
    "primary_limit": 0,
    "replay_limit": FRESH_QAT_REPLAY_ROWS,
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
    "allow_legacy_init": True,
}

FRESH_QAT_REQUIRED_SELECTION = {
    "precondition": (
        "all-three-final-checkpoints-and-results-strict-load-before-first-"
        "selection-label-read"
    ),
    "stable_recomputed_on_same_fresh_selection": True,
    "metric_order": [
        "int16-pair-accuracy:max",
        "int16-teacher-top1:max",
        "int16-value-mae-cp:min",
        "seed:ascending",
        "checkpoint-sha256:ascending",
    ],
    "representative": "median-ranked-seed",
    "per_seed_gates": [
        "int16-pair-accuracy-strictly-above-stable",
        "int16-top1-at-least-stable",
        "absolute-float-to-int16-pair-delta-at-most-0.002",
        "absolute-float-to-int16-top1-delta-at-most-0.005",
    ],
    "family_gate": {
        "representative_passes_all_four": True,
        "minimum_seeds_passing_all_four": 2,
        "all_seeds_pass_both_quantization_delta_gates": True,
    },
    "evaluations_per_checkpoint": 1,
    "used_wcsc36_selection_reopened": False,
}

_RUNTIME_FIELDS = {
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
}
_INPUT_FIELDS = {
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
_ID_SET_INPUT_FIELDS = {
    "policy_exposed_parent_ids",
    "policy_exposed_semantic_position_ids",
    "holdout_protected_position_ids",
}


def _valid_sha256(value: Any) -> bool:
    return isinstance(value, str) and LOWER_SHA256_RE.fullmatch(value) is not None


def _typed_equal(value: Any, expected: Any) -> bool:
    if type(value) is not type(expected):
        return False
    if type(expected) is dict:
        return set(value) == set(expected) and all(
            _typed_equal(value[key], expected[key]) for key in expected
        )
    if type(expected) is list:
        return len(value) == len(expected) and all(
            _typed_equal(item, expected_item)
            for item, expected_item in zip(value, expected)
        )
    return value == expected


def _require_file_identity(value: Any, label: str) -> None:
    _exact_keys(value, {"bytes", "sha256"}, label)
    if type(value["bytes"]) is not int or value["bytes"] < 1:
        raise ValueError(f"{label} byte contract is invalid")
    if not _valid_sha256(value["sha256"]):
        raise ValueError(f"{label} SHA-256 contract is invalid")


def _require_identifier_set_identity(value: Any, label: str) -> None:
    _exact_keys(
        value,
        {"bytes", "sha256", "count", "identifiers_sha256"},
        label,
    )
    if type(value["bytes"]) is not int or value["bytes"] < 1:
        raise ValueError(f"{label} byte contract is invalid")
    if type(value["count"]) is not int or value["count"] < 1:
        raise ValueError(f"{label} count contract is invalid")
    if not _valid_sha256(value["sha256"]) or not _valid_sha256(
        value["identifiers_sha256"]
    ):
        raise ValueError(f"{label} SHA-256 contract is invalid")


def _require_replay_exclusion_identity(value: Any, label: str) -> None:
    fields = {
        "format",
        "bytes",
        "sha256",
        "count",
        "identifiers_sha256",
        "components",
    }
    _exact_keys(value, fields, label)
    if value["format"] != FRESH_QAT_ID_SET_FORMAT:
        raise ValueError(f"{label} format mismatch")
    if type(value["bytes"]) is not int or value["bytes"] < 1:
        raise ValueError(f"{label} byte contract is invalid")
    if type(value["count"]) is not int or value["count"] < 1:
        raise ValueError(f"{label} count contract is invalid")
    if not _valid_sha256(value["sha256"]) or not _valid_sha256(
        value["identifiers_sha256"]
    ):
        raise ValueError(f"{label} SHA-256 contract is invalid")
    if value["components"] != [
        "legacy",
        "fresh_final_holdout",
        "fresh_selection",
    ]:
        raise ValueError(f"{label} components mismatch")


def _require_model_training_identity(value: Any) -> None:
    label = "fresh QAT model_training"
    _exact_keys(
        value,
        {
            "bytes",
            "sha256",
            "records",
            "parents",
            "games",
            "semantic_position_ids_count",
            "semantic_position_ids_sha256",
        },
        label,
    )
    if type(value["bytes"]) is not int or value["bytes"] < 1:
        raise ValueError(f"{label} byte contract is invalid")
    if not _valid_sha256(value["sha256"]) or not _valid_sha256(
        value["semantic_position_ids_sha256"]
    ):
        raise ValueError(f"{label} SHA-256 contract is invalid")
    if (
        type(value["records"]) is not int
        or value["records"] < 24_000
        or value["parents"] != 24_000
        or type(value["parents"]) is not int
        or value["games"] != 1_000
        or type(value["games"]) is not int
        or type(value["semantic_position_ids_count"]) is not int
        or value["semantic_position_ids_count"] < 24_000
    ):
        raise ValueError(f"{label} accounting contract is invalid")


def _validate_registry(registry: dict[str, Any]) -> bool:
    _exact_keys(
        registry,
        {
            "schema",
            "status",
            "plan",
            "artifact_identities_registered",
            "training_dispatch_ready",
        },
        "fresh QAT plan registry",
    )
    if registry["schema"] != FRESH_QAT_REGISTRY_SCHEMA:
        raise ValueError("fresh QAT plan registry schema mismatch")
    plan = registry["plan"]
    _exact_keys(
        plan,
        {"schema", "path", "bytes", "sha256"},
        "fresh QAT registry plan",
    )
    if (
        plan["schema"] != FRESH_QAT_EXECUTION_PLAN_SCHEMA
        or plan["path"] != FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH
    ):
        raise ValueError("fresh QAT registry plan schema/path mismatch")

    status = registry["status"]
    if status == FRESH_QAT_BLOCKED_STATUS:
        if (
            plan["bytes"] is not None
            or plan["sha256"] is not None
            or registry["artifact_identities_registered"] is not False
            or registry["training_dispatch_ready"] is not False
        ):
            raise ValueError("fresh QAT blocked registry contains invented identities")
        return False
    if status != FRESH_QAT_READY_STATUS:
        raise ValueError("fresh QAT registry status mismatch")
    if (
        type(plan["bytes"]) is not int
        or plan["bytes"] < 1
        or not _valid_sha256(plan["sha256"])
        or registry["artifact_identities_registered"] is not True
        or registry["training_dispatch_ready"] is not True
    ):
        raise ValueError("fresh QAT ready registry is incomplete")
    return True


def _validate_plan_shape(plan: dict[str, Any]) -> None:
    _exact_keys(
        plan,
        {
            "schema",
            "preregistered_plan",
            "inputs",
            "runtime",
            "training",
            "slots",
            "selection",
        },
        "fresh QAT execution plan",
    )
    if plan["schema"] != FRESH_QAT_EXECUTION_PLAN_SCHEMA:
        raise ValueError("fresh QAT execution plan schema mismatch")
    preregistered_plan = plan["preregistered_plan"]
    expected_preregistered_plan = {
        "path": FRESH_QAT_PREREGISTERED_PLAN_RELATIVE_PATH,
        "bytes": FRESH_QAT_PREREGISTERED_PLAN_BYTES,
        "sha256": FRESH_QAT_PREREGISTERED_PLAN_SHA256,
        "schema": FRESH_QAT_PREREGISTERED_PLAN_SCHEMA,
    }
    if not _typed_equal(preregistered_plan, expected_preregistered_plan):
        raise ValueError("fresh QAT preregistered plan identity mismatch")

    inputs = plan["inputs"]
    _exact_keys(inputs, _INPUT_FIELDS, "fresh QAT execution plan inputs")
    for field in (
        "sibling_teacher_manifest",
        "validation_partition_manifest",
        "policy_exposure_receipt",
    ):
        _require_file_identity(inputs[field], f"fresh QAT {field}")
    _require_model_training_identity(inputs["model_training"])
    for field in _ID_SET_INPUT_FIELDS:
        _require_identifier_set_identity(inputs[field], f"fresh QAT {field}")
    _require_replay_exclusion_identity(
        inputs["replay_exclusion"],
        "fresh QAT replay_exclusion",
    )
    _require_file_identity(inputs["replay"], "fresh QAT replay")
    _require_file_identity(inputs["warm_initializer"], "fresh QAT warm_initializer")
    if inputs["replay"] != {
        "bytes": FRESH_QAT_REPLAY_BYTES,
        "sha256": FRESH_QAT_REPLAY_SHA256,
    }:
        raise ValueError("fresh QAT replay identity mismatch")
    if inputs["warm_initializer"] != {
        "bytes": FRESH_QAT_WARM_INITIALIZER_BYTES,
        "sha256": FRESH_QAT_WARM_INITIALIZER_SHA256,
    }:
        raise ValueError("fresh QAT warm-only initializer identity mismatch")

    runtime = plan["runtime"]
    _exact_keys(runtime, _RUNTIME_FIELDS, "fresh QAT runtime")
    if not _typed_equal(plan["training"], FRESH_QAT_REQUIRED_TRAINING):
        raise ValueError("fresh QAT warm-only final training contract mismatch")
    expected_slots = [
        {
            "id": f"floodgate-fresh-int16-aware-seed-{seed}",
            "seed": seed,
            "output": f"{FRESH_QAT_RUN_ROOT}/seed-{seed}",
        }
        for seed in FRESH_QAT_SLOT_ORDER
    ]
    if not _typed_equal(plan["slots"], expected_slots):
        raise ValueError("fresh QAT slot registry mismatch")
    if not _typed_equal(plan["selection"], FRESH_QAT_REQUIRED_SELECTION):
        raise ValueError("fresh QAT post-training selection contract mismatch")


def _read_exact_file(path: str, label: str) -> bytes:
    try:
        with open(path, "rb") as source:
            return source.read()
    except OSError as error:
        raise ValueError(f"cannot read {label}: {error}") from error


def _data_only_blocker(detail: str) -> ValueError:
    return ValueError(
        "fresh QAT is data-only blocked: exact tracked fresh execution plan "
        f"snapshot and real artifact identities are required ({detail})"
    )


def _verify_fresh_qat_experiment_plan(
    args: Any,
    training_runtime: Mapping[str, Any],
    *,
    tracking_verifier: Callable[[str, str], None],
    repo_root: str,
) -> dict[str, Any]:
    """Internal verifier; ``repo_root`` injection is only for synthetic tests."""
    root = os.path.realpath(repo_root)
    plan_argument = getattr(args, "experiment_plan", "")
    if not isinstance(plan_argument, str) or not plan_argument:
        raise ValueError("fresh QAT training requires --experiment-plan")
    plan_path = os.path.realpath(plan_argument)
    expected_plan_path = os.path.join(root, FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH)
    if plan_path != expected_plan_path:
        raise ValueError(
            "fresh QAT plan must be the tracked "
            f"{FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH}"
        )

    registry_path = os.path.join(root, FRESH_QAT_REGISTRY_RELATIVE_PATH)
    try:
        registry_raw = _read_exact_file(registry_path, "fresh QAT plan registry")
    except ValueError as error:
        raise _data_only_blocker("tracked registry is not published") from error
    registry = _strict_json(registry_raw, "fresh QAT plan registry")
    ready = _validate_registry(registry)
    tracking_verifier(registry_path, args.pipeline_revision)
    if _read_exact_file(registry_path, "fresh QAT plan registry") != registry_raw:
        raise ValueError("fresh QAT plan registry changed during verification")
    if not ready:
        raise _data_only_blocker("registry remains closed without placeholders")

    plan_identity = registry["plan"]
    plan_fingerprint = _sha256_file_snapshot(
        plan_path,
        plan_identity,
        "fresh QAT execution plan",
    )
    plan_raw = _read_exact_file(plan_path, "fresh QAT execution plan")
    if (
        len(plan_raw) != plan_identity["bytes"]
        or hashlib.sha256(plan_raw).hexdigest() != plan_identity["sha256"]
    ):
        raise ValueError("fresh QAT execution plan snapshot mismatch")
    plan = _strict_json(plan_raw, "fresh QAT execution plan")
    _validate_plan_shape(plan)
    tracking_verifier(plan_path, args.pipeline_revision)
    if _read_exact_file(plan_path, "fresh QAT execution plan") != plan_raw:
        raise ValueError("fresh QAT execution plan changed during verification")

    preregistered_path = os.path.join(root, FRESH_QAT_PREREGISTERED_PLAN_RELATIVE_PATH)
    preregistered_fingerprint = _sha256_file_snapshot(
        preregistered_path,
        plan["preregistered_plan"],
        "fresh QAT preregistered sibling plan",
    )
    tracking_verifier(preregistered_path, args.pipeline_revision)

    if getattr(args, "val_data", None):
        raise ValueError("fresh QAT training may not receive model-selection data")
    if getattr(args, "experiment_family", None) != "int16-aware":
        raise ValueError("fresh QAT experiment family mismatch")

    selected_slot = next(
        (slot for slot in plan["slots"] if slot["seed"] == args.seed),
        None,
    )
    if selected_slot is None:
        raise ValueError("fresh QAT seed is not preregistered")
    expected_output = os.path.realpath(os.path.join(root, selected_slot["output"]))
    if os.path.realpath(args.out) != expected_output:
        raise ValueError(
            f"fresh QAT seed {args.seed} must use output " f"{selected_slot['output']}"
        )

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
        "holdout_protected_position_ids": (args.holdout_protected_position_ids),
        "replay_exclusion": args.replay_excluded_position_ids,
    }
    for field, path in input_paths.items():
        if not isinstance(path, str) or not path:
            raise ValueError(f"fresh QAT {field} path is required")
    verified_inputs = {
        field: _sha256_file_snapshot(
            input_paths[field],
            plan["inputs"][field],
            field,
        )
        for field in input_paths
    }

    runtime = plan["runtime"]
    for field, expected in runtime.items():
        actual = training_runtime.get(field)
        if type(actual) is not type(expected) or actual != expected:
            raise ValueError(
                f"fresh QAT runtime {field} mismatch: expected "
                f"{expected!r}, got {actual!r}"
            )
    for field in ("mps_built", "mps_available", "cuda_available"):
        if type(training_runtime.get(field)) is not bool:
            raise ValueError(f"fresh QAT runtime {field} must be boolean")

    model_training = plan["inputs"]["model_training"]
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
        "init_checkpoint_sha256": FRESH_QAT_WARM_INITIALIZER_SHA256,
        "replay_sha256": FRESH_QAT_REPLAY_SHA256,
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
        "replay_limit": FRESH_QAT_REPLAY_ROWS,
        "replay_ratio": 1.0,
        "primary_limit": 0,
        "allow_legacy_init": True,
        "objective": FRESH_QAT_REQUIRED_TRAINING["objective"],
        "checkpoint_policy": "fixed-final-epoch-only",
        "candidate_artifact": "final.pt",
        "selection_evaluations": 0,
        "early_stopping": False,
    }
    provenance = {
        "path": os.path.abspath(plan_path),
        "bytes": plan_fingerprint["bytes"],
        "sha256": plan_fingerprint["sha256"],
        "schema": FRESH_QAT_EXECUTION_PLAN_SCHEMA,
        "slot_id": selected_slot["id"],
        "slot_output": selected_slot["output"],
        "verified_input_sha256": {
            "preregistered_plan": preregistered_fingerprint["sha256"],
            **{
                field: fingerprint["sha256"]
                for field, fingerprint in verified_inputs.items()
            },
        },
    }
    return {
        "provenance": provenance,
        "contract": contract,
        "replay_exclusion": dict(plan["inputs"]["replay_exclusion"]),
    }


def verify_fresh_qat_experiment_plan(
    args: Any,
    training_runtime: Mapping[str, Any],
    *,
    tracking_verifier: Callable[[str, str], None],
) -> dict[str, Any]:
    """Bind training to the registered fresh plan, or fail data-only closed."""
    repo_root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
    return _verify_fresh_qat_experiment_plan(
        args,
        training_runtime,
        tracking_verifier=tracking_verifier,
        repo_root=repo_root,
    )


__all__ = [
    "FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH",
    "FRESH_QAT_EXECUTION_PLAN_SCHEMA",
    "FRESH_QAT_REGISTRY_RELATIVE_PATH",
    "FRESH_QAT_REGISTRY_SCHEMA",
    "FRESH_QAT_SLOT_ORDER",
    "verify_fresh_qat_experiment_plan",
]
