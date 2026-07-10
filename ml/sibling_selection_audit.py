#!/usr/bin/env python3
"""Verify the sealed six-run outputs and record selection-gate results.

This command never accepts or reads the final-holdout JSONL.  A failed
model-selection gate produces an audit receipt, not a candidate-selection
receipt, so it cannot unlock later evaluation accidentally.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
from collections.abc import Mapping
from typing import Any

from sibling_selection_protocol import (
    CANDIDATE_SELECTION_STRATEGY,
    MODEL_SELECTION_METRIC_ORDER,
    PAIR_DEGRADATION_LIMIT,
    RESULT_ARTIFACT_NAMES,
    SELECTION_TIE_BREAK,
    SIX_RUN_PLAN_SCHEMA,
    SIX_RUN_SLOT_ORDER,
    TRAINING_RESULT_SCHEMA,
    TOP1_DEGRADATION_LIMIT,
    WCSC36_SIX_RUN_EXECUTION_REVISION,
    WCSC36_SIX_RUN_TRAINING_RUNTIME,
    WCSC36_SIX_RUN_PLAN_SHA256,
    sealed_run_selection_key,
    selection_gate_results,
    select_sealed_candidate,
)
from sibling_evidence_reproduction import (
    EVIDENCE_REPRODUCTION_SCHEMA,
    collect_reproduction_pins,
    reproduce_selection_evidence,
)


SELECTION_AUDIT_SCHEMA = "shogi-sibling-six-run-selection-audit-v1"
SEALED_EVAL_REPORT_SCHEMA = "shogi-sibling-eval-v2"
GIT_REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
METRIC_FIELDS = (
    "within_parent_pair_accuracy",
    "teacher_top1_accuracy",
    "value_mae_cp",
)
ALL_EVAL_METRIC_FIELDS = set(METRIC_FIELDS) | {"value_mse_cp2"}
EVAL_REPORT_FIELDS = {"schema", "data", "models"}
EVAL_DATA_FIELDS = {
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
EVAL_MODEL_FIELDS = {
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
CANDIDATE_PROVENANCE_FIELDS = {
    "status",
    "teacher_manifest_sha256",
    "validation_partition_sha256",
    "training_pipeline_source_revision",
    "source_train_sha256",
    "model_training_sha256",
    "model_selection_sha256",
    "final_holdout_sha256",
}
LEGACY_PROVENANCE_FIELDS = {"status", "reason"}
RESULT_FIELDS = {
    "schema",
    "status",
    "experiment_plan",
    "experiment_contract",
    "training_pipeline",
    "training_runtime",
    "completed_epochs",
    "selection_metric",
    "best_value_loss",
    "best_sibling_key",
    "artifacts",
}
PLAN_COMMON_FIELDS = {"input_sha256", "runtime"}
PLAN_INPUT_FIELDS = {
    "sibling_teacher_manifest",
    "validation_partition_manifest",
    "model_training",
    "model_selection",
    "replay",
    "policy_exposure_receipt",
    "policy_exposed_parent_ids",
    "policy_exposed_semantic_position_ids",
    "holdout_protected_position_ids",
    "warm_initializer",
}
PLAN_RUNTIME_FIELDS = {
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
RESULT_PLAN_FIELDS = {
    "path",
    "bytes",
    "sha256",
    "schema",
    "slot_id",
    "slot_output",
    "selection_tie_break",
}
EXPERIMENT_CONTRACT_FIELDS = {
    "schema",
    "series",
    "seed",
    "loss",
    "init_checkpoint_sha256",
    "replay_sha256",
    "learning_rate",
    "epochs",
    "batch",
    "k",
    "cp_clamp",
    "rank_weight",
    "rank_pair_min",
    "rank_pair_max",
    "rank_margin_cp",
    "policy_weight",
    "policy_temp_cp",
    "select_metric",
    "features",
    "device",
    "torch_threads",
    "replay_limit",
    "replay_ratio",
    "primary_limit",
    "allow_legacy_init",
}
TRAINING_PIPELINE_FIELDS = {"source_revision", "tracked_tree_clean"}
TRAINING_RUNTIME_FIELDS = PLAN_RUNTIME_FIELDS | {
    "mps_built",
    "mps_available",
    "cuda_available",
}
ARTIFACT_RECEIPT_FIELDS = {"bytes", "sha256"}
EVIDENCE_CONFIG_FIELDS = {
    "python_interpreter",
    "selection_data",
    "sibling_manifest",
    "validation_partition_manifest",
    "policy_exposure_receipt",
    "policy_exposed_parent_ids",
    "policy_exposed_semantic_position_ids",
    "holdout_protected_position_ids",
    "stable_weights",
    "stable_weights_meta",
}


def _reject_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _read_json(path: str, label: str) -> tuple[dict[str, Any], bytes]:
    try:
        with open(path, "rb") as source:
            raw = source.read()
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_reject_duplicate_keys,
            parse_constant=lambda token: (_ for _ in ()).throw(
                ValueError(f"{label} contains non-finite JSON number {token}")
            ),
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read {label}: {error}") from error
    if type(value) is not dict:
        raise ValueError(f"{label} root must be an object")
    return value, raw


def _sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _display_path(path: str, repo_root: str) -> str:
    real = os.path.realpath(path)
    try:
        relative = os.path.relpath(real, repo_root)
    except ValueError:
        return real
    if relative != ".." and not relative.startswith(f"..{os.sep}"):
        return relative.replace(os.sep, "/")
    return real


def _file_receipt(path: str, repo_root: str) -> dict[str, Any]:
    real = os.path.realpath(path)
    if not os.path.isfile(real):
        raise ValueError(f"required artifact is missing: {path}")
    return {
        "path": _display_path(real, repo_root),
        "bytes": os.path.getsize(real),
        "sha256": _sha256_file(real),
    }


def _require_exact(value: Any, fields: set[str], label: str) -> Mapping:
    if not isinstance(value, Mapping) or set(value) != fields:
        raise ValueError(f"{label} fields are not exact")
    return value


def _require_sha256(value: Any, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise ValueError(f"{label} is not a lowercase SHA-256")
    return value


def _finite_metric(value: Any, label: str) -> float:
    if type(value) not in (int, float) or not math.isfinite(value):
        raise ValueError(f"{label} is not finite")
    return float(value)


def _metrics_from_report(
    report_path: str,
    *,
    expected_name: str,
    checkpoint: Mapping[str, Any],
    expected_provenance_status: str,
    plan_inputs: Mapping[str, str],
    expected_training_revision: str | None,
    max_epoch: int | None,
    repo_root: str,
) -> tuple[dict[str, float], dict[str, float], dict[str, Any], dict[str, Any]]:
    report, raw = _read_json(report_path, f"{expected_name} selection report")
    _require_exact(report, EVAL_REPORT_FIELDS, f"{expected_name} selection report")
    if report.get("schema") != SEALED_EVAL_REPORT_SCHEMA:
        raise ValueError(f"{expected_name} selection report schema mismatch")
    data = _require_exact(
        report.get("data"), EVAL_DATA_FIELDS, f"{expected_name} selection data"
    )
    if (
        data.get("data_role") != "selection"
        or data.get("sha256") != plan_inputs["model_selection"]
        or type(data.get("records")) is not int
        or data["records"] <= 0
        or type(data.get("parents")) is not int
        or data["parents"] <= 0
        or type(data.get("eligible_pairs")) is not int
        or data["eligible_pairs"] <= 0
        or data.get("pair_min_cp") != 50.0
        or data.get("value_cp_clamp") != 3000
        or data.get("value_target") != "clamped_child_cp"
        or data.get("ranking_target")
        != "unclamped_parent_cp_equals_negative_child_cp"
        or data.get("sibling_manifest_sha256")
        != plan_inputs["sibling_teacher_manifest"]
    ):
        raise ValueError(f"{expected_name} report is not sealed model selection")
    partition = data.get("validation_partition_manifest")
    if (
        not isinstance(partition, Mapping)
        or partition.get("sha256") != plan_inputs["validation_partition_manifest"]
        or partition.get("verified_outputs")
        != ["model_selection", "protected_position_ids"]
        or partition.get("outputs", {}).get("model_selection", {}).get("sha256")
        != plan_inputs["model_selection"]
        or partition.get("outputs", {}).get("model_training", {}).get("sha256")
        != plan_inputs["model_training"]
        or partition.get("outputs", {})
        .get("protected_position_ids", {})
        .get("sha256")
        != plan_inputs["holdout_protected_position_ids"]
        or partition.get("source", {}).get("teacher_manifest", {}).get("sha256")
        != plan_inputs["sibling_teacher_manifest"]
        or partition.get("source", {})
        .get("policy_exposure_receipt", {})
        .get("sha256")
        != plan_inputs["policy_exposure_receipt"]
        or partition.get("source", {})
        .get("policy_exposed_parent_ids", {})
        .get("sha256")
        != plan_inputs["policy_exposed_parent_ids"]
        or partition.get("source", {})
        .get("policy_exposed_semantic_position_ids", {})
        .get("sha256")
        != plan_inputs["policy_exposed_semantic_position_ids"]
    ):
        raise ValueError(f"{expected_name} selection partition provenance mismatch")
    models = report.get("models")
    if type(models) is not list or len(models) != 1:
        raise ValueError(f"{expected_name} report must contain exactly one model")
    model = _require_exact(
        models[0], EVAL_MODEL_FIELDS, f"{expected_name} selection model"
    )
    if (
        model.get("name") != expected_name
        or model.get("checkpoint_sha256") != checkpoint["sha256"]
        or model.get("checkpoint_bytes") != checkpoint["bytes"]
        or model.get("k_sigmoid") != 600.0
        or model.get("production_k_int") != 600
        or type(model.get("checkpoint_epoch")) is not int
        or model["checkpoint_epoch"] < 0
        or (max_epoch is not None and model["checkpoint_epoch"] > max_epoch)
    ):
        raise ValueError(f"{expected_name} report/checkpoint identity mismatch")
    provenance_fields = (
        CANDIDATE_PROVENANCE_FIELDS
        if expected_provenance_status == "verified_same_model_selection_partition"
        else LEGACY_PROVENANCE_FIELDS
    )
    provenance = _require_exact(
        model.get("training_provenance"),
        provenance_fields,
        f"{expected_name} training provenance",
    )
    if provenance.get("status") != expected_provenance_status:
        raise ValueError(f"{expected_name} training provenance status mismatch")
    if expected_training_revision is not None and (
        provenance.get("teacher_manifest_sha256")
        != plan_inputs["sibling_teacher_manifest"]
        or provenance.get("validation_partition_sha256")
        != plan_inputs["validation_partition_manifest"]
        or provenance.get("training_pipeline_source_revision")
        != expected_training_revision
        or provenance.get("model_training_sha256") != plan_inputs["model_training"]
        or provenance.get("model_selection_sha256") != plan_inputs["model_selection"]
        or provenance.get("final_holdout_sha256")
        != partition.get("outputs", {}).get("final_holdout", {}).get("sha256")
    ):
        raise ValueError(f"{expected_name} training provenance identity mismatch")
    floating = model.get("float")
    quantized = model.get("quantized_int16")
    _require_exact(floating, ALL_EVAL_METRIC_FIELDS, f"{expected_name} float metrics")
    _require_exact(
        quantized,
        ALL_EVAL_METRIC_FIELDS | {"delta_from_float"},
        f"{expected_name} int16 metrics",
    )
    float_metrics = {
        field: _finite_metric(floating.get(field), f"{expected_name}.float.{field}")
        for field in METRIC_FIELDS
    }
    int16_metrics = {
        field: _finite_metric(quantized.get(field), f"{expected_name}.int16.{field}")
        for field in METRIC_FIELDS
    }
    delta = quantized.get("delta_from_float")
    _require_exact(delta, ALL_EVAL_METRIC_FIELDS, f"{expected_name} int16 delta")
    for field in ALL_EVAL_METRIC_FIELDS:
        recorded = _finite_metric(delta.get(field), f"{expected_name}.delta.{field}")
        float_value = _finite_metric(
            floating.get(field), f"{expected_name}.float.{field}"
        )
        int16_value = _finite_metric(
            quantized.get(field), f"{expected_name}.int16.{field}"
        )
        if field in ("value_mae_cp", "value_mse_cp2") and (
            float_value < 0 or int16_value < 0
        ):
            raise ValueError(f"{expected_name} {field} is negative")
        if field in ("within_parent_pair_accuracy", "teacher_top1_accuracy") and (
            not 0 <= float_value <= 1 or not 0 <= int16_value <= 1
        ):
            raise ValueError(f"{expected_name} {field} is outside [0, 1]")
        actual = int16_value - float_value
        if not math.isclose(recorded, actual, rel_tol=0.0, abs_tol=1e-12):
            raise ValueError(f"{expected_name} report int16 delta mismatch")
    report_receipt = {
        "path": _display_path(report_path, repo_root),
        "bytes": len(raw),
        "sha256": _sha256_bytes(raw),
    }
    data_identity = {
        "sha256": data.get("sha256"),
        "bytes": data.get("bytes"),
        "records": data["records"],
        "parents": data["parents"],
        "eligible_pairs": data["eligible_pairs"],
        "pair_min_cp": data["pair_min_cp"],
    }
    _require_sha256(data_identity["sha256"], f"{expected_name} report data SHA-256")
    if (
        type(data_identity["bytes"]) is not int
        or data_identity["bytes"] <= 0
    ):
        raise ValueError(f"{expected_name} report data identity is invalid")
    return float_metrics, int16_metrics, report_receipt, data_identity


def evaluate_selection_gates(
    candidate_float: Mapping[str, float],
    candidate_int16: Mapping[str, float],
    stable_int16: Mapping[str, float],
) -> dict[str, Any]:
    return selection_gate_results(candidate_float, candidate_int16, stable_int16)


def verify_audit_pipeline_revision(
    expected_revision: str, repo_root: str
) -> dict[str, Any]:
    if GIT_REVISION_RE.fullmatch(expected_revision or "") is None:
        raise ValueError("--pipeline-revision must be a lowercase 40-digit Git commit")

    def git(*arguments: str) -> str:
        try:
            completed = subprocess.run(
                ["git", "-C", repo_root, *arguments],
                check=True,
                capture_output=True,
                text=True,
            )
        except (OSError, subprocess.CalledProcessError) as error:
            raise ValueError(f"cannot verify audit pipeline revision: {error}") from error
        return completed.stdout

    actual_revision = git("rev-parse", "HEAD").strip()
    if actual_revision != expected_revision:
        raise ValueError(
            f"--pipeline-revision {expected_revision} does not match HEAD {actual_revision}"
        )
    if git("status", "--porcelain=v1", "--untracked-files=normal"):
        raise ValueError("selection audit requires a clean Git worktree")
    return {
        "source_revision": actual_revision,
        "tracked_tree_clean": True,
    }


def _verify_training_result_contract(
    result: Mapping[str, Any],
    *,
    slot: Mapping[str, Any],
    slot_id: str,
    series: str,
    seed: int,
    plan: Mapping[str, Any],
    plan_receipt: Mapping[str, Any],
    run_plan_path: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    result_plan = _require_exact(
        result.get("experiment_plan"), RESULT_PLAN_FIELDS, f"{slot_id} experiment plan"
    )
    expected_result_plan = {
        "bytes": plan_receipt["bytes"],
        "sha256": plan_receipt["sha256"],
        "schema": SIX_RUN_PLAN_SCHEMA,
        "slot_id": slot_id,
        "slot_output": slot["output"],
        "selection_tie_break": list(SELECTION_TIE_BREAK),
    }
    for field, expected in expected_result_plan.items():
        if type(result_plan.get(field)) is not type(expected) or result_plan[field] != expected:
            raise ValueError(f"{slot_id} experiment plan {field} mismatch")
    if (
        not isinstance(result_plan.get("path"), str)
        or os.path.realpath(result_plan["path"]) != os.path.realpath(run_plan_path)
    ):
        raise ValueError(f"{slot_id} experiment plan path mismatch")

    contract = _require_exact(
        result.get("experiment_contract"),
        EXPERIMENT_CONTRACT_FIELDS,
        f"{slot_id} experiment contract",
    )
    inputs = plan["common"]["input_sha256"]
    expected_contract = {
        "schema": "shogi-sibling-training-experiment-v1",
        "series": series,
        "seed": seed,
        "loss": "sibling-ranking",
        "init_checkpoint_sha256": (
            inputs["warm_initializer"] if series == "warm" else None
        ),
        "replay_sha256": inputs["replay"],
        "learning_rate": slot["learning_rate"],
        "epochs": slot["epochs"],
        "batch": 256,
        "k": 600.0,
        "cp_clamp": 3000,
        "rank_weight": 1.0,
        "rank_pair_min": 50.0,
        "rank_pair_max": 600.0,
        "rank_margin_cp": 50.0,
        "policy_weight": 0.25,
        "policy_temp_cp": 200.0,
        "select_metric": "sibling-pair",
        "features": "board",
        "device": "cpu",
        "torch_threads": 2,
        "replay_limit": 500_000,
        "replay_ratio": 1.0,
        "primary_limit": 0,
        "allow_legacy_init": series == "warm",
    }
    for field, expected in expected_contract.items():
        if type(contract.get(field)) is not type(expected) or contract[field] != expected:
            raise ValueError(f"{slot_id} experiment contract {field} mismatch")

    if (
        type(result.get("completed_epochs")) is not int
        or result["completed_epochs"] != slot["epochs"]
    ):
        raise ValueError(f"{slot_id} completed epoch count mismatch")
    best_value = _finite_metric(result.get("best_value_loss"), f"{slot_id}.best_value_loss")
    if best_value < 0:
        raise ValueError(f"{slot_id} best value loss is negative")
    sibling_key = result.get("best_sibling_key")
    if type(sibling_key) is not list or len(sibling_key) != 3:
        raise ValueError(f"{slot_id} best sibling key is invalid")
    sibling_key = [
        _finite_metric(value, f"{slot_id}.best_sibling_key[{index}]")
        for index, value in enumerate(sibling_key)
    ]
    if not 0 <= sibling_key[0] <= 1 or not 0 <= sibling_key[1] <= 1 or sibling_key[2] > 0:
        raise ValueError(f"{slot_id} best sibling key is outside its domain")

    pipeline = dict(
        _require_exact(
            result.get("training_pipeline"),
            TRAINING_PIPELINE_FIELDS,
            f"{slot_id} training pipeline",
        )
    )
    if (
        GIT_REVISION_RE.fullmatch(pipeline.get("source_revision", "")) is None
        or pipeline.get("tracked_tree_clean") is not True
    ):
        raise ValueError(f"{slot_id} training pipeline is not an exact clean revision")
    if pipeline["source_revision"] != WCSC36_SIX_RUN_EXECUTION_REVISION:
        raise ValueError(
            f"{slot_id} training pipeline revision differs from the sealed execution"
        )

    runtime = dict(
        _require_exact(
            result.get("training_runtime"),
            TRAINING_RUNTIME_FIELDS,
            f"{slot_id} training runtime",
        )
    )
    for field, expected in plan["common"]["runtime"].items():
        if type(runtime.get(field)) is not type(expected) or runtime[field] != expected:
            raise ValueError(f"{slot_id} training runtime {field} mismatch")
    for field in ("mps_built", "mps_available", "cuda_available"):
        if type(runtime.get(field)) is not bool:
            raise ValueError(f"{slot_id} training runtime {field} must be boolean")
    if runtime != WCSC36_SIX_RUN_TRAINING_RUNTIME:
        raise ValueError(f"{slot_id} training runtime differs from the sealed execution")

    artifacts = _require_exact(
        result.get("artifacts"), set(RESULT_ARTIFACT_NAMES), f"{slot_id} artifacts"
    )
    for artifact_name, artifact in artifacts.items():
        artifact = _require_exact(
            artifact, ARTIFACT_RECEIPT_FIELDS, f"{slot_id} artifact {artifact_name}"
        )
        if type(artifact.get("bytes")) is not int or artifact["bytes"] <= 0:
            raise ValueError(f"{slot_id} artifact {artifact_name} byte count is invalid")
        _require_sha256(
            artifact.get("sha256"), f"{slot_id} artifact {artifact_name} SHA-256"
        )
    return pipeline, runtime


def _receipt_identity(receipt: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "bytes": receipt["bytes"],
        "sha256": receipt["sha256"],
    }


def _reproduce_one_evidence(
    *,
    slot_id: str,
    checkpoint_path: str,
    checkpoint_sha256: str,
    weights_path: str,
    weights_sha256: str,
    weights_meta_path: str,
    selection_report_path: str,
    selection_report_sha256: str,
    evidence_config: Mapping[str, str],
    plan_inputs: Mapping[str, str],
    plan_runtime: Mapping[str, Any],
    repo_root: str,
) -> dict[str, Any]:
    arguments = {
        "repo_root": os.path.abspath(repo_root),
        "python_interpreter": os.path.abspath(
            evidence_config["python_interpreter"]
        ),
        "checkpoint_path": os.path.abspath(checkpoint_path),
        "selection_data_path": os.path.abspath(evidence_config["selection_data"]),
        "sibling_manifest_path": os.path.abspath(
            evidence_config["sibling_manifest"]
        ),
        "validation_partition_manifest_path": os.path.abspath(
            evidence_config["validation_partition_manifest"]
        ),
        "policy_exposure_receipt_path": os.path.abspath(
            evidence_config["policy_exposure_receipt"]
        ),
        "policy_exposed_parent_ids_path": os.path.abspath(
            evidence_config["policy_exposed_parent_ids"]
        ),
        "policy_exposed_semantic_position_ids_path": os.path.abspath(
            evidence_config["policy_exposed_semantic_position_ids"]
        ),
        "holdout_protected_position_ids_path": os.path.abspath(
            evidence_config["holdout_protected_position_ids"]
        ),
        "expected_weights_path": os.path.abspath(weights_path),
        "expected_weights_meta_path": os.path.abspath(weights_meta_path),
        "expected_selection_report_path": os.path.abspath(selection_report_path),
    }
    inventory = collect_reproduction_pins(**arguments)
    pins = dict(inventory["pinned_sha256"])
    pins.update(
        {
            "checkpoint": checkpoint_sha256,
            "selection_data": plan_inputs["model_selection"],
            "sibling_manifest": plan_inputs["sibling_teacher_manifest"],
            "validation_partition_manifest": plan_inputs[
                "validation_partition_manifest"
            ],
            "policy_exposure_receipt": plan_inputs["policy_exposure_receipt"],
            "policy_exposed_parent_ids": plan_inputs[
                "policy_exposed_parent_ids"
            ],
            "policy_exposed_semantic_position_ids": plan_inputs[
                "policy_exposed_semantic_position_ids"
            ],
            "holdout_protected_position_ids": plan_inputs[
                "holdout_protected_position_ids"
            ],
            "expected_weights": weights_sha256,
            "expected_selection_report": selection_report_sha256,
        }
    )
    reproduced = reproduce_selection_evidence(
        **arguments,
        model_name=slot_id,
        pinned_sha256=pins,
    )
    if (
        reproduced.get("schema") != EVIDENCE_REPRODUCTION_SCHEMA
        or reproduced.get("status") != "reproduced_exactly"
    ):
        raise ValueError(f"{slot_id} evidence reproduction did not complete")
    runtime = reproduced["interpreter"]["runtime"]
    for field in ("platform", "machine", "python_version", "torch_version"):
        if runtime.get(field) != plan_runtime[field]:
            raise ValueError(f"{slot_id} evidence runtime {field} mismatch")
    export = reproduced["evidence"]["export"]
    selection_report = reproduced["evidence"]["selection_report"]
    if not (
        export.get("weights_byte_exact") is True
        and export.get("metadata_byte_exact") is True
        and selection_report.get("float_metrics_exact") is True
        and selection_report.get("int16_metrics_exact") is True
        and selection_report.get("core_data_provenance_exact") is True
    ):
        raise ValueError(f"{slot_id} evidence reproduction is not byte/metric exact")
    return reproduced


def _evidence_summary(
    slot_id: str, reproduced: Mapping[str, Any], repo_root: str
) -> dict[str, Any]:
    export = reproduced["evidence"]["export"]
    report = reproduced["evidence"]["selection_report"]
    return {
        "slot_id": slot_id,
        "status": reproduced["status"],
        "checkpoint": {
            **_receipt_identity(reproduced["sources"]["checkpoint"]),
            "path": _display_path(
                reproduced["sources"]["checkpoint"]["path"], repo_root
            ),
        },
        "export": {
            "weights_byte_exact": True,
            "metadata_byte_exact": True,
            "weights": {
                **_receipt_identity(export["existing_weights"]),
                "path": _display_path(export["existing_weights"]["path"], repo_root),
            },
            "weights_meta": {
                **_receipt_identity(export["existing_weights_meta"]),
                "path": _display_path(
                    export["existing_weights_meta"]["path"], repo_root
                ),
            },
            "reproduced_weights": _receipt_identity(
                export["reproduced_weights"]
            ),
            "reproduced_weights_meta": _receipt_identity(
                export["reproduced_weights_meta"]
            ),
        },
        "selection_report": {
            "float_metrics_exact": True,
            "int16_metrics_exact": True,
            "core_data_provenance_exact": True,
            "existing": {
                **_receipt_identity(report["existing"]),
                "path": _display_path(report["existing"]["path"], repo_root),
            },
            "reproduced": _receipt_identity(report["reproduced"]),
        },
    }


def _common_evidence_summary(
    reproduced: Mapping[str, Any], repo_root: str
) -> dict[str, Any]:
    interpreter = reproduced["interpreter"]
    tools = {
        label: {
            **_receipt_identity(receipt),
            "path": _display_path(receipt["path"], repo_root),
        }
        for label, receipt in reproduced["tools"].items()
    }
    sources = {
        label: {
            **_receipt_identity(receipt),
            "path": _display_path(receipt["path"], repo_root),
        }
        for label, receipt in reproduced["sources"].items()
        if label != "checkpoint"
    }
    return {
        "schema": EVIDENCE_REPRODUCTION_SCHEMA,
        "interpreter": {
            "launcher": interpreter["launcher"],
            "file": {
                **_receipt_identity(interpreter["file"]),
                "path": interpreter["file"]["path"],
            },
            "runtime": dict(interpreter["runtime"]),
        },
        "tools": tools,
        "shared_sources": sources,
        "execution": dict(reproduced["execution"]),
    }


def build_selection_audit(
    *,
    run_root: str,
    run_plan_path: str,
    stable_checkpoint_path: str,
    stable_selection_report_path: str,
    repo_root: str,
    evidence_config: Mapping[str, str],
    audit_pipeline: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    evidence_config = _require_exact(
        evidence_config, EVIDENCE_CONFIG_FIELDS, "evidence reproduction config"
    )
    for field, path in evidence_config.items():
        if not isinstance(path, str) or not path:
            raise ValueError(f"evidence reproduction path {field} is invalid")
    plan, plan_raw = _read_json(run_plan_path, "six-run plan")
    _require_exact(
        plan,
        {"schema", "common", "slots", "selection_tie_break"},
        "six-run plan",
    )
    if plan.get("schema") != SIX_RUN_PLAN_SCHEMA:
        raise ValueError("six-run plan schema mismatch")
    common = _require_exact(plan.get("common"), PLAN_COMMON_FIELDS, "six-run plan common")
    inputs = _require_exact(
        common.get("input_sha256"), PLAN_INPUT_FIELDS, "six-run plan input hashes"
    )
    for field, value in inputs.items():
        _require_sha256(value, f"six-run plan input {field}")
    runtime = _require_exact(
        common.get("runtime"), PLAN_RUNTIME_FIELDS, "six-run plan runtime"
    )
    if (
        runtime.get("device") != "cpu"
        or runtime.get("torch_threads") != 2
        or runtime.get("torch_interop_threads") != 1
        or runtime.get("deterministic_algorithms") is not True
        or runtime.get("deterministic_debug_mode") != "error"
    ):
        raise ValueError("six-run plan deterministic CPU runtime mismatch")
    if (
        type(plan.get("selection_tie_break")) is not list
        or tuple(plan["selection_tie_break"]) != SELECTION_TIE_BREAK
    ):
        raise ValueError("six-run plan selection tie-break mismatch")
    slots = plan.get("slots")
    if type(slots) is not list or len(slots) != len(SIX_RUN_SLOT_ORDER):
        raise ValueError("six-run plan does not contain exactly six slots")
    plan_pairs = tuple((slot.get("series"), slot.get("seed")) for slot in slots)
    if plan_pairs != SIX_RUN_SLOT_ORDER:
        raise ValueError("six-run plan slot order mismatch")
    plan_receipt = {
        "path": _display_path(run_plan_path, repo_root),
        "bytes": len(plan_raw),
        "sha256": _sha256_bytes(plan_raw),
        "schema": SIX_RUN_PLAN_SCHEMA,
    }
    if plan_receipt["sha256"] != WCSC36_SIX_RUN_PLAN_SHA256:
        raise ValueError("six-run plan SHA-256 differs from the production seal")
    stable_checkpoint = _file_receipt(stable_checkpoint_path, repo_root)
    planned_stable_sha = (
        plan.get("common", {})
        .get("input_sha256", {})
        .get("warm_initializer")
    )
    if stable_checkpoint["sha256"] != planned_stable_sha:
        raise ValueError("stable checkpoint differs from the sealed plan initializer")

    runs = []
    selection_data_identity = None
    shared_training_pipeline = None
    shared_training_runtime = None
    common_evidence = None
    reproduced_evidence = []
    for (series, seed), slot in zip(SIX_RUN_SLOT_ORDER, slots):
        slot_id = f"{series}-seed-{seed}"
        _require_exact(
            slot,
            {
                "id",
                "series",
                "seed",
                "learning_rate",
                "epochs",
                "initializer_required",
                "output",
            },
            f"six-run plan slot {slot_id}",
        )
        expected_slot = {
            "id": slot_id,
            "series": series,
            "seed": seed,
            "learning_rate": 0.0001 if series == "warm" else 0.001,
            "epochs": 20 if series == "warm" else 40,
            "initializer_required": series == "warm",
            "output": f"ml/runs/wcsc36-six-run/{slot_id}",
        }
        if dict(slot) != expected_slot:
            raise ValueError(f"six-run plan slot {slot_id} contract mismatch")
        slot_dir = os.path.join(run_root, slot_id)
        result_path = os.path.join(slot_dir, "result.json")
        checkpoint_path = os.path.join(slot_dir, "best-sibling.pt")
        export_path = os.path.join(slot_dir, "int16", "weights.bin")
        export_meta_path = os.path.join(slot_dir, "int16", "weights.meta.json")
        report_path = os.path.join(slot_dir, "int16-selection.json")

        result, result_raw = _read_json(result_path, f"{slot_id} result")
        _require_exact(result, RESULT_FIELDS, f"{slot_id} result")
        if (
            result.get("schema") != TRAINING_RESULT_SCHEMA
            or result.get("status") != "complete"
            or result.get("selection_metric") != "sibling-pair"
        ):
            raise ValueError(f"{slot_id} result contract mismatch")
        result_pipeline, result_runtime = _verify_training_result_contract(
            result,
            slot=slot,
            slot_id=slot_id,
            series=series,
            seed=seed,
            plan=plan,
            plan_receipt=plan_receipt,
            run_plan_path=run_plan_path,
        )
        if shared_training_pipeline is None:
            shared_training_pipeline = result_pipeline
            shared_training_runtime = result_runtime
        elif (
            result_pipeline != shared_training_pipeline
            or result_runtime != shared_training_runtime
        ):
            raise ValueError("six runs do not share one pipeline revision and runtime")
        artifacts = result.get("artifacts")
        if not isinstance(artifacts, Mapping) or set(artifacts) != set(
            RESULT_ARTIFACT_NAMES
        ):
            raise ValueError(f"{slot_id} result artifact set mismatch")
        for artifact_name in RESULT_ARTIFACT_NAMES:
            actual = _file_receipt(os.path.join(slot_dir, artifact_name), repo_root)
            expected = artifacts[artifact_name]
            if (
                not isinstance(expected, Mapping)
                or expected.get("bytes") != actual["bytes"]
                or expected.get("sha256") != actual["sha256"]
            ):
                raise ValueError(f"{slot_id} artifact changed: {artifact_name}")

        checkpoint = _file_receipt(checkpoint_path, repo_root)
        export = _file_receipt(export_path, repo_root)
        export_meta, _meta_raw = _read_json(export_meta_path, f"{slot_id} export metadata")
        bucket_count = export_meta.get("kp_buckets")
        if type(bucket_count) is not int or bucket_count <= 0:
            raise ValueError(f"{slot_id} export bucket count is invalid")
        export["bucket_count"] = bucket_count
        float_metrics, int16_metrics, report_receipt, data_identity = (
            _metrics_from_report(
                report_path,
                expected_name=slot_id,
                checkpoint=checkpoint,
                expected_provenance_status=(
                    "verified_same_model_selection_partition"
                ),
                plan_inputs=inputs,
                expected_training_revision=result_pipeline["source_revision"],
                max_epoch=slot["epochs"],
                repo_root=repo_root,
            )
        )
        reproduced = _reproduce_one_evidence(
            slot_id=slot_id,
            checkpoint_path=checkpoint_path,
            checkpoint_sha256=checkpoint["sha256"],
            weights_path=export_path,
            weights_sha256=export["sha256"],
            weights_meta_path=export_meta_path,
            selection_report_path=report_path,
            selection_report_sha256=report_receipt["sha256"],
            evidence_config=evidence_config,
            plan_inputs=inputs,
            plan_runtime=runtime,
            repo_root=repo_root,
        )
        current_common_evidence = _common_evidence_summary(reproduced, repo_root)
        if common_evidence is None:
            common_evidence = current_common_evidence
        elif current_common_evidence != common_evidence:
            raise ValueError("six evidence reproductions used different sources/runtime")
        reproduced_evidence.append(
            _evidence_summary(slot_id, reproduced, repo_root)
        )
        if selection_data_identity is None:
            selection_data_identity = data_identity
        elif selection_data_identity != data_identity:
            raise ValueError("six selection reports do not use one exact dataset")
        runs.append(
            {
                "slot_id": slot_id,
                "series": series,
                "seed": seed,
                "result_manifest": {
                    "path": _display_path(result_path, repo_root),
                    "bytes": len(result_raw),
                    "sha256": _sha256_bytes(result_raw),
                },
                "checkpoint": checkpoint,
                "export": export,
                "int16_selection_report": report_receipt,
                "int16_pair_accuracy": int16_metrics[
                    "within_parent_pair_accuracy"
                ],
                "int16_teacher_top1": int16_metrics["teacher_top1_accuracy"],
                "int16_value_mae_cp": int16_metrics["value_mae_cp"],
                "_float_metrics": float_metrics,
                "_int16_metrics": int16_metrics,
            }
        )

    stable_float, stable_int16, stable_report, stable_data_identity = (
        _metrics_from_report(
            stable_selection_report_path,
            expected_name="stable",
            checkpoint=stable_checkpoint,
            expected_provenance_status="legacy_unverified",
            plan_inputs=inputs,
            expected_training_revision=None,
            max_epoch=None,
            repo_root=repo_root,
        )
    )
    if stable_data_identity != selection_data_identity:
        raise ValueError("stable and six-run reports use different selection data")
    stable_reproduced = _reproduce_one_evidence(
        slot_id="stable",
        checkpoint_path=stable_checkpoint_path,
        checkpoint_sha256=stable_checkpoint["sha256"],
        weights_path=evidence_config["stable_weights"],
        weights_sha256=_sha256_file(evidence_config["stable_weights"]),
        weights_meta_path=evidence_config["stable_weights_meta"],
        selection_report_path=stable_selection_report_path,
        selection_report_sha256=stable_report["sha256"],
        evidence_config=evidence_config,
        plan_inputs=inputs,
        plan_runtime=runtime,
        repo_root=repo_root,
    )
    if _common_evidence_summary(stable_reproduced, repo_root) != common_evidence:
        raise ValueError("stable evidence reproduction used different sources/runtime")
    reproduced_evidence.append(
        _evidence_summary("stable", stable_reproduced, repo_root)
    )

    public_runs = [
        {key: value for key, value in run.items() if not key.startswith("_")}
        for run in runs
    ]
    representatives = []
    for series in ("warm", "scratch"):
        ordered = sorted(
            [run for run in public_runs if run["series"] == series],
            key=sealed_run_selection_key,
        )
        representatives.append(ordered[1])
    winner = select_sealed_candidate(public_runs)
    provisional_selection = {
        "slot_id": winner["slot_id"],
        "series": winner["series"],
        "seed": winner["seed"],
        "checkpoint_sha256": winner["checkpoint"]["sha256"],
        "export_sha256": winner["export"]["sha256"],
        "int16_selection_report_sha256": winner["int16_selection_report"][
            "sha256"
        ],
    }
    private_winner = next(run for run in runs if run["slot_id"] == winner["slot_id"])
    gates = evaluate_selection_gates(
        private_winner["_float_metrics"],
        private_winner["_int16_metrics"],
        stable_int16,
    )
    audit = {
        "schema": SELECTION_AUDIT_SCHEMA,
        "run_plan": plan_receipt,
        "training_pipeline": dict(shared_training_pipeline),
        "training_runtime": dict(shared_training_runtime),
        "runs": public_runs,
        "selection_data": selection_data_identity,
        "selection_strategy": CANDIDATE_SELECTION_STRATEGY,
        "selection_metric_order": list(MODEL_SELECTION_METRIC_ORDER),
        "selection_tie_break": list(SELECTION_TIE_BREAK),
        "representatives": [
            {
                "series": run["series"],
                "slot_id": run["slot_id"],
                "seed": run["seed"],
                "checkpoint_sha256": run["checkpoint"]["sha256"],
            }
            for run in representatives
        ],
        "provisional_candidate": provisional_selection,
        "stable": {
            "checkpoint_sha256": stable_checkpoint["sha256"],
            "int16_selection_report": stable_report,
            "float_metrics": stable_float,
            "int16_metrics": stable_int16,
        },
        "candidate_metrics": {
            "float": private_winner["_float_metrics"],
            "int16": private_winner["_int16_metrics"],
        },
        "selection_gates": gates,
        "candidate_selection_receipt": {
            "status": (
                "eligible_not_emitted_by_audit"
                if gates["passed"]
                else "not_emitted_selection_gate_failed"
            )
        },
        "final_holdout": {
            "status": "sealed_not_opened",
            "post_seal_training_selection_or_evaluation_labels_read": False,
            "partition_publication_parsed_labeled_source_validation": True,
        },
        "evidence_reproduction": {
            **common_evidence,
            "status": "all_six_candidates_and_stable_reproduced_exactly",
            "models": reproduced_evidence,
        },
    }
    if audit_pipeline is not None:
        audit["audit_pipeline"] = dict(audit_pipeline)
    return audit


def _write_new_json(path: str, value: Mapping[str, Any]) -> None:
    target = os.path.abspath(path)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    serialized = (
        json.dumps(
            value,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
            allow_nan=False,
        )
        + "\n"
    )
    try:
        with open(target, "x", encoding="utf-8", newline="\n") as output:
            output.write(serialized)
            output.flush()
            os.fsync(output.fileno())
    except FileExistsError as error:
        raise ValueError(f"audit output already exists: {target}") from error


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-root", required=True)
    parser.add_argument("--run-plan", required=True)
    parser.add_argument("--stable-checkpoint", required=True)
    parser.add_argument("--stable-selection-report", required=True)
    parser.add_argument("--evidence-python", required=True)
    parser.add_argument("--selection-data", required=True)
    parser.add_argument("--sibling-manifest", required=True)
    parser.add_argument("--validation-partition-manifest", required=True)
    parser.add_argument("--policy-exposure-receipt", required=True)
    parser.add_argument("--policy-exposed-parent-ids", required=True)
    parser.add_argument("--policy-exposed-semantic-position-ids", required=True)
    parser.add_argument("--holdout-protected-position-ids", required=True)
    parser.add_argument("--stable-weights", required=True)
    parser.add_argument("--stable-weights-meta", required=True)
    parser.add_argument("--pipeline-revision", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    repo_root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
    try:
        audit_pipeline = verify_audit_pipeline_revision(
            args.pipeline_revision, repo_root
        )
        audit = build_selection_audit(
            run_root=args.run_root,
            run_plan_path=args.run_plan,
            stable_checkpoint_path=args.stable_checkpoint,
            stable_selection_report_path=args.stable_selection_report,
            repo_root=repo_root,
            evidence_config={
                "python_interpreter": args.evidence_python,
                "selection_data": args.selection_data,
                "sibling_manifest": args.sibling_manifest,
                "validation_partition_manifest": (
                    args.validation_partition_manifest
                ),
                "policy_exposure_receipt": args.policy_exposure_receipt,
                "policy_exposed_parent_ids": args.policy_exposed_parent_ids,
                "policy_exposed_semantic_position_ids": (
                    args.policy_exposed_semantic_position_ids
                ),
                "holdout_protected_position_ids": (
                    args.holdout_protected_position_ids
                ),
                "stable_weights": args.stable_weights,
                "stable_weights_meta": args.stable_weights_meta,
            },
            audit_pipeline=audit_pipeline,
        )
        _write_new_json(args.out, audit)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(
        f"[selection-audit] candidate={audit['provisional_candidate']['slot_id']} "
        f"passed={str(audit['selection_gates']['passed']).lower()} out={args.out}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
