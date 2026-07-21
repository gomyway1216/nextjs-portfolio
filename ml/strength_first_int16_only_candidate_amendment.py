"""Closed contract for the strength-first int16-only candidate amendment.

Representation bridge v3 remains a real STOP.  This amendment does not turn
that STOP into a pass and does not relax its float-to-int16 threshold.  It
defines a separate, deployment-representation-only decision.  The metric order
and median rule predate the bridge; their concrete ``43, 42, 44`` outcome was
already observed on the spent data and is now post-hoc locked before any fresh
result exists.  This runner re-authenticates that outcome once with exact
production int16 inference and locks its median epoch-20 parent (seed 42).
Fresh-final data stays unopened until a later PR enrolls the private result.
"""

from __future__ import annotations

from collections.abc import Mapping
import copy
import hashlib
import json
import math
from pathlib import Path
import re
from typing import Any


REGISTRY_SCHEMA = (
    "shogi-floodgate-strength-first-int16-only-candidate-amendment-registry-v1"
)
REGISTRY_STATUS = "ready-one-spent-selection-int16-only-reauthentication"
REPORT_SCHEMA = (
    "shogi-floodgate-strength-first-int16-only-spent-development-evaluation-report-v1"
)
REPORT_STATUS = "complete-one-spent-selection-exact-int16-evaluation"
RECEIPT_SCHEMA = (
    "shogi-floodgate-strength-first-adaptive-int16-candidate-lock-receipt-v1"
)
RECEIPT_STATUS = "adaptive-int16-candidate-lock-awaiting-prospective-confirmation"
PUBLICATION_SCHEMA = (
    "shogi-floodgate-strength-first-int16-only-candidate-publication-v1"
)
PUBLICATION_STATUS = "complete-atomic-private-int16-only-publication"
COMMIT_RECEIPT_SCHEMA = (
    "shogi-floodgate-strength-first-int16-only-runtime-commit-receipt-v1"
)

REGISTRY_RELATIVE_PATH = (
    "ml/protocols/floodgate-q1-2026-strength-first-int16-only-candidate-"
    "amendment-registry.json"
)
BRIDGE_REGISTRY_RELATIVE_PATH = (
    "ml/protocols/floodgate-q1-2026-strength-first-representation-bridge-v3-"
    "registry.json"
)
BRIDGE_STOP_EVIDENCE_RELATIVE_PATH = (
    "docs/data/floodgate-strength-first-representation-bridge-v3-stop-"
    "2026-07-20.json"
)
SELECTION_REGISTRY_RELATIVE_PATH = (
    "ml/protocols/floodgate-q1-2026-strength-first-qat-selection-evaluator-"
    "registry.json"
)
OUTPUT_ROOT = (
    ".codex/shogi-runs/"
    "floodgate-q1-2026-strength-first-int16-only-candidate-amendment-v1"
)
OUTPUT_FILES = {
    "report": "evaluation-report.json",
    "receipt": "candidate-lock-receipt.json",
    "publication": "publication-result.json",
}
BUILDER_COMMAND = "python3 ml/build_strength_first_int16_only_candidate_amendment_registry_candidate.py"
RUNNER_COMMAND = "python3 ml/run_strength_first_int16_only_candidate_amendment.py"

SEEDS = (42, 43, 44)
EXPECTED_RANKED_SEED_ORDER = (43, 42, 44)
SELECTED_SEED = 42
SELECTED_CHECKPOINT_SHA256 = (
    "84ab533c7bf36183b83228c5dab5817dd730fcfae5d81be645569f45b5622a6a"
)
SELECTED_CHECKPOINT = {
    "path": "ml/runs/floodgate-q1-2026-strength-first-int16-aware/seed-42/final.pt",
    "schema": "shogi-floodgate-strength-first-qat-final-checkpoint-v2",
    "bytes": 2_383_633,
    "sha256": SELECTED_CHECKPOINT_SHA256,
    "epoch": 20,
}
METRIC_FIELDS = frozenset(
    {
        "value_mae_cp",
        "value_mse_cp2",
        "within_parent_pair_accuracy",
        "teacher_top1_accuracy",
    }
)
METRIC_ORDER = (
    "parent_int16_within_parent_pair_accuracy:max",
    "parent_int16_teacher_top1_accuracy:max",
    "parent_int16_value_mae_cp:min",
    "seed:ascending",
    "parent_checkpoint_sha256:ascending",
)
STRENGTH_GATE_POLICY = {
    "candidate_pair_strictly_above_stable": True,
    "candidate_top1_at_least_stable": True,
    "required_passing_seeds": [42, 43, 44],
    "comparison_absolute_tolerance": 1e-12,
}
EVALUATION_POLICY = {
    "model_order": ["stable", "seed-42", "seed-43", "seed-44"],
    "model_loop_workers": 1,
    "int16_model_evaluations": 4,
    "float_model_evaluations": 0,
    "aligned_checkpoint_loads": 0,
    "int16_reference": "int16_forward_batch",
    "int16_batch_rows": 4096,
    "torch_intraop_threads": 10,
    "torch_original_intraop_threads_restored": True,
}
DECISION_POLICY = {
    "expected_ranked_seed_order": [43, 42, 44],
    "representative": "median-of-three-parent-int16-ranking",
    "selected_seed": 42,
    "deployment_checkpoint_epoch": 20,
    "float_metrics_have_selection_authority": False,
    "aligned_epoch_24_has_deployment_authority": False,
    "bridge_stop_is_not_a_pass": True,
    "bridge_threshold_relaxed": False,
    "decision_class": "post-hoc-adaptive-candidate-lock-not-selection-pass",
    "seed_43_fallback_allowed": False,
    "fresh_final_failure_action": "retrain-entire-three-seed-family",
}
COMMIT_SEMANTICS = {
    "commit_point": "exclusive-directory-rename-returned-zero",
    "pre_commit_failure": "no-output-root-and-staging-removed",
    "post_commit_checks": "best-effort-diagnostics-not-a-success-condition",
    "parent_directory_fsync": "attempted-after-commit",
    "post_commit_fault_result": "committed-pass-with-recovery-receipt",
    "recovery": "do-not-delete-or-retry-verify-three-enrolled-files-at-target",
}
BOUNDARY = {
    "local_only": True,
    "network_requests": 0,
    "cloud_requests": 0,
    "spent_selection_label_reads": 1,
    "fresh_selection_label_reads": 0,
    "fresh_final_label_reads": 0,
    "legacy_holdout_label_reads": 0,
    "aligned_checkpoint_loads": 0,
    "float_model_evaluations": 0,
    "formal_ab_games": 0,
    "external_calibration_games": 0,
    "live_weights_changed": False,
}
NONCLAIMS = {
    "representation_bridge_passed": False,
    "candidate_strength_selected": False,
    "spent_metrics_are_independent_strength_evidence": False,
    "fresh_final_passed": False,
    "playing_strength_improved": False,
    "formal_ab_passed": False,
    "high_dan_calibrated": False,
    "production_promotion_authorized": False,
}

BRIDGE_STOP_REQUIRED_OBSERVATION = {
    "source_revision_observed": "6f36790d089e983a457b44c049e6bdb547af9778",
    "wall_seconds": 12.13,
    "maximum_resident_set_size_bytes": 739_557_376,
    "seed_42_pair_delta": -0.002636239233679505,
    "seed_42_pair_limit_absolute": 0.002,
    "ranked_parent_int16_seed_order": [43, 42, 44],
}
BRIDGE_STOP_EXACT_MODELS = {
    "stable_int16": {
        "teacher_top1_accuracy": 0.3034597749062109,
        "value_mae_cp": 526.6006381934217,
        "value_mse_cp2": 623131.3687144961,
        "within_parent_pair_accuracy": 0.5915841584158416,
    },
    "seed_42": {
        "aligned_float": {
            "teacher_top1_accuracy": 0.3186744476865361,
            "within_parent_pair_accuracy": 0.6039402720759881,
        },
        "aligned_float_to_parent_int16_delta": {
            "pair_limit_absolute": 0.002,
            "pair_observed": -0.002636239233679505,
            "pair_passed": False,
            "top1_limit_absolute": 0.005,
            "top1_observed": -0.0033347228011672003,
            "top1_passed": True,
        },
        "all_four_bridge_gates_passed": False,
        "parent_int16": {
            "teacher_top1_accuracy": 0.3153397248853689,
            "value_mae_cp": 405.9221193632092,
            "value_mse_cp2": 410465.4984571148,
            "within_parent_pair_accuracy": 0.6013040328423086,
        },
    },
    "seed_43": {
        "aligned_float": {
            "teacher_top1_accuracy": 0.318882867861609,
            "within_parent_pair_accuracy": 0.6037189084762135,
        },
        "aligned_float_to_parent_int16_delta": {
            "pair_limit_absolute": 0.002,
            "pair_observed": -0.0017306608709650728,
            "pair_passed": True,
            "top1_limit_absolute": 0.005,
            "top1_observed": -0.0027094622759483156,
            "top1_passed": True,
        },
        "all_four_bridge_gates_passed": True,
        "parent_int16": {
            "teacher_top1_accuracy": 0.3161734055856607,
            "value_mae_cp": 402.7880987446525,
            "value_mse_cp2": 408553.42411810084,
            "within_parent_pair_accuracy": 0.6019882476052484,
        },
    },
    "seed_44": {
        "aligned_float": {
            "teacher_top1_accuracy": 0.3192997082117549,
            "within_parent_pair_accuracy": 0.6018272558963214,
        },
        "aligned_float_to_parent_int16_delta": {
            "pair_limit_absolute": 0.002,
            "pair_observed": -0.0017709087981968574,
            "pair_passed": True,
            "top1_limit_absolute": 0.005,
            "top1_observed": -0.0006252605252188292,
            "top1_passed": True,
        },
        "all_four_bridge_gates_passed": True,
        "parent_int16": {
            "teacher_top1_accuracy": 0.3186744476865361,
            "value_mae_cp": 405.71302335367136,
            "value_mse_cp2": 410407.37639385654,
            "within_parent_pair_accuracy": 0.6000563470981245,
        },
    },
}

_SOURCE_PATHS = {
    "protocol": "ml/strength_first_int16_only_candidate_amendment.py",
    "adapter": "ml/strength_first_int16_only_candidate_eval_adapter.py",
    "runner": "ml/run_strength_first_int16_only_candidate_amendment.py",
    "registry_builder": (
        "ml/build_strength_first_int16_only_candidate_amendment_registry_candidate.py"
    ),
}
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_REGISTRY_FIELDS = {
    "schema",
    "status",
    "recorded_date",
    "builder_command",
    "runner_command",
    "inputs",
    "implementation",
    "dependencies",
    "bridge_stop",
    "spent_selection",
    "models",
    "policy",
    "output",
    "boundary",
    "nonclaims",
}


def strict_json(raw: bytes, label: str) -> dict[str, Any]:
    def pairs(values):
        result = {}
        for key, value in values:
            if key in result:
                raise ValueError(f"{label} contains duplicate key {key!r}")
            result[key] = value
        return result

    def reject(value):
        raise ValueError(f"{label} contains non-finite number {value!r}")

    try:
        value = json.loads(
            raw.decode("utf-8"), object_pairs_hook=pairs, parse_constant=reject
        )
    except (UnicodeError, json.JSONDecodeError, ValueError) as error:
        raise ValueError(f"{label} is not strict UTF-8 JSON") from error
    if type(value) is not dict:
        raise ValueError(f"{label} root must be an object")
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


def _exact(value: Any, fields: set[str], label: str) -> dict[str, Any]:
    if type(value) is not dict or set(value) != fields:
        raise ValueError(f"{label} fields are not exact")
    return value


def identity(
    value: Any,
    label: str,
    *,
    path: str | None = None,
    schema: str | None = None,
) -> dict[str, Any]:
    item = _exact(value, {"path", "schema", "bytes", "sha256"}, label)
    if (
        type(item["path"]) is not str
        or not item["path"]
        or (path is not None and item["path"] != path)
        or type(item["schema"]) is not str
        or not item["schema"]
        or (schema is not None and item["schema"] != schema)
        or type(item["bytes"]) is not int
        or item["bytes"] < 1
        or type(item["sha256"]) is not str
        or _SHA256_RE.fullmatch(item["sha256"]) is None
    ):
        raise ValueError(f"{label} identity is invalid")
    return item


def checkpoint_identity(value: Any, label: str, *, epoch: int) -> dict[str, Any]:
    item = _exact(value, {"path", "schema", "bytes", "sha256", "epoch"}, label)
    identity(
        {field: item[field] for field in ("path", "schema", "bytes", "sha256")},
        label,
    )
    if item["epoch"] != epoch:
        raise ValueError(f"{label} epoch must be {epoch}")
    return item


def file_identity(path: Path, *, relative: str, schema: str) -> dict[str, Any]:
    raw = path.read_bytes()
    return {
        "path": relative,
        "schema": schema,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def metric_set(value: Any, label: str) -> dict[str, float]:
    metrics = _exact(value, set(METRIC_FIELDS), label)
    normalized: dict[str, float] = {}
    for field in METRIC_FIELDS:
        metric = metrics[field]
        if type(metric) not in (int, float) or type(metric) is bool:
            raise ValueError(f"{label}.{field} is not numeric")
        normalized[field] = float(metric)
    if (
        any(not math.isfinite(metric) for metric in normalized.values())
        or normalized["value_mae_cp"] < 0.0
        or normalized["value_mse_cp2"] < 0.0
        or not 0.0 <= normalized["within_parent_pair_accuracy"] <= 1.0
        or not 0.0 <= normalized["teacher_top1_accuracy"] <= 1.0
    ):
        raise ValueError(f"{label} is outside its metric domain")
    return normalized


def ranking_key(run: Mapping[str, Any]) -> tuple[Any, ...]:
    metrics = metric_set(run["int16"], "parent int16 ranking metrics")
    checkpoint = checkpoint_identity(
        run["checkpoint"], "parent deployment checkpoint", epoch=20
    )
    seed = run["seed"]
    if type(seed) is not int or seed not in SEEDS:
        raise ValueError("ranking seed is invalid")
    return (
        -metrics["within_parent_pair_accuracy"],
        -metrics["teacher_top1_accuracy"],
        metrics["value_mae_cp"],
        seed,
        bytes.fromhex(checkpoint["sha256"]),
    )


def int16_strength_gate(
    candidate: Mapping[str, Any], stable: Mapping[str, Any]
) -> dict[str, Any]:
    candidate_metrics = metric_set(candidate, "candidate int16 metrics")
    stable_metrics = metric_set(stable, "stable int16 metrics")
    tolerance = STRENGTH_GATE_POLICY["comparison_absolute_tolerance"]
    pair_delta = (
        candidate_metrics["within_parent_pair_accuracy"]
        - stable_metrics["within_parent_pair_accuracy"]
    )
    top1_delta = (
        candidate_metrics["teacher_top1_accuracy"]
        - stable_metrics["teacher_top1_accuracy"]
    )
    pair_passed = pair_delta > tolerance
    top1_passed = top1_delta >= -tolerance
    return {
        "checks": [
            {
                "name": "candidate_pair_strictly_above_stable",
                "observed_delta": pair_delta,
                "passed": pair_passed,
            },
            {
                "name": "candidate_top1_at_least_stable",
                "observed_delta": top1_delta,
                "passed": top1_passed,
            },
        ],
        "passed": pair_passed and top1_passed,
    }


def validate_bridge_stop_evidence(value: Mapping[str, Any]) -> dict[str, Any]:
    evidence = _exact(
        dict(value) if isinstance(value, Mapping) else value,
        {
            "schema",
            "status",
            "recorded_date",
            "claim_boundary",
            "boundary",
            "first_authoritative_attempt",
            "diagnostic_rerun",
            "independent_diagnosis_reproduction",
            "models",
            "observation_provenance",
            "outcome",
        },
        "bridge STOP evidence",
    )
    try:
        attempt = _exact(
            evidence["first_authoritative_attempt"],
            {
                "command",
                "maximum_resident_set_size_bytes",
                "returncode",
                "stderr",
                "swaps",
                "system_cpu_seconds",
                "user_cpu_seconds",
                "wall_seconds",
            },
            "first authoritative bridge attempt",
        )
        diagnostic = _exact(
            evidence["diagnostic_rerun"],
            {
                "maximum_resident_set_size_bytes",
                "purpose",
                "returncode",
                "wall_seconds",
            },
            "bridge diagnostic rerun",
        )
        independent = _exact(
            evidence["independent_diagnosis_reproduction"],
            {
                "maximum_resident_set_size_bytes",
                "purpose",
                "returncode",
                "wall_seconds",
            },
            "independent bridge diagnosis",
        )
        outcome = _exact(
            evidence["outcome"],
            {
                "all_seeds_passed_both_representation_delta_gates",
                "family_gate_passed",
                "minimum_seed_count_passed",
                "output_root_absent",
                "ranked_parent_int16_seed_order",
                "representative_passed_all_four",
                "representative_seed",
                "seeds_passing_all_four",
                "status",
            },
            "bridge STOP outcome",
        )
        provenance = _exact(
            evidence["observation_provenance"],
            {
                "authenticated_by_bridge_output",
                "bridge_output_absent",
                "metric_context",
                "source_revision_observed",
            },
            "bridge STOP provenance",
        )
        boundary = _exact(
            evidence["boundary"],
            {
                "candidate_locked",
                "candidate_strength_selected",
                "external_calibration_games",
                "formal_ab_games",
                "fresh_final_label_reads",
                "fresh_selection_label_reads",
                "legacy_holdout_label_reads",
                "live_weights_changed",
                "local_only",
                "network_requests",
                "spent_selection_dataset_read_passes_total_observed",
            },
            "bridge STOP boundary",
        )
        models = _exact(
            evidence["models"],
            {"stable_int16", "seed_42", "seed_43", "seed_44"},
            "bridge STOP models",
        )
        seed_fields = {
            "aligned_float",
            "aligned_float_to_parent_int16_delta",
            "all_four_bridge_gates_passed",
            "parent_int16",
        }
        seed_42 = _exact(models["seed_42"], seed_fields, "bridge seed 42")
        seed_43 = _exact(models["seed_43"], seed_fields, "bridge seed 43")
        seed_44 = _exact(models["seed_44"], seed_fields, "bridge seed 44")
        delta_fields = {
            "pair_limit_absolute",
            "pair_observed",
            "pair_passed",
            "top1_limit_absolute",
            "top1_observed",
            "top1_passed",
        }
        delta_42 = _exact(
            seed_42["aligned_float_to_parent_int16_delta"],
            delta_fields,
            "bridge seed 42 delta",
        )
        for seed, item in ((42, seed_42), (43, seed_43), (44, seed_44)):
            _exact(
                item["aligned_float"],
                {"teacher_top1_accuracy", "within_parent_pair_accuracy"},
                f"bridge seed {seed} aligned float",
            )
            _exact(
                item["aligned_float_to_parent_int16_delta"],
                delta_fields,
                f"bridge seed {seed} delta",
            )
        _exact(models["stable_int16"], set(METRIC_FIELDS), "bridge stable int16")
    except (KeyError, TypeError) as error:
        raise ValueError("bridge STOP evidence is incomplete") from error
    if (
        evidence.get("schema")
        != "shogi-floodgate-strength-first-representation-bridge-v3-stop-evidence-v1"
        or evidence.get("status") != "recorded-real-stop-not-promoted"
        or evidence.get("recorded_date") != "2026-07-20"
        or evidence.get("claim_boundary")
        != (
            "operator-observed-real-bridge-stop-and-existing-spent-selection-"
            "reproduction-values-not-a-bridge-pass-fresh-result-strength-claim-"
            "or-live-promotion"
        )
        or attempt.get("command")
        != (
            "$HOME/.codex/shogi-data/floodgate-training-venv/bin/python3 "
            "ml/run_strength_first_representation_bridge_v3.py"
        )
        or attempt.get("returncode") != 1
        or attempt.get("stderr")
        != "representation bridge STOP: representation family gate failed"
        or attempt.get("wall_seconds")
        != BRIDGE_STOP_REQUIRED_OBSERVATION["wall_seconds"]
        or attempt.get("maximum_resident_set_size_bytes")
        != BRIDGE_STOP_REQUIRED_OBSERVATION["maximum_resident_set_size_bytes"]
        or attempt.get("swaps") != 0
        or attempt.get("user_cpu_seconds") != 13.38
        or attempt.get("system_cpu_seconds") != 8.15
        or diagnostic.get("returncode") != 1
        or diagnostic.get("wall_seconds") != 11.94
        or diagnostic.get("maximum_resident_set_size_bytes") != 777_322_496
        or diagnostic.get("purpose")
        != "timing-and-failure-reproduction-only-no-new-selection-decision"
        or independent.get("returncode") != 1
        or independent.get("wall_seconds") != 11.69
        or independent.get("maximum_resident_set_size_bytes") != 771_948_544
        or independent.get("purpose")
        != "independent-failure-and-metric-reproduction-no-new-selection-decision"
        or provenance.get("source_revision_observed")
        != BRIDGE_STOP_REQUIRED_OBSERVATION["source_revision_observed"]
        or provenance.get("authenticated_by_bridge_output") is not False
        or provenance.get("bridge_output_absent") is not True
        or provenance.get("metric_context")
        != (
            "the first attempt printed no metrics; values are operator-transcribed "
            "from diagnostic reproduction and match the existing public spent-"
            "selection reproduction under exact seven-tensor deployment identity"
        )
        or outcome.get("status") != "STOP"
        or outcome.get("family_gate_passed") is not False
        or outcome.get("output_root_absent") is not True
        or outcome.get("representative_seed") != 42
        or outcome.get("ranked_parent_int16_seed_order")
        != BRIDGE_STOP_REQUIRED_OBSERVATION["ranked_parent_int16_seed_order"]
        or outcome.get("seeds_passing_all_four") != 2
        or outcome.get("minimum_seed_count_passed") is not True
        or outcome.get("representative_passed_all_four") is not False
        or outcome.get("all_seeds_passed_both_representation_delta_gates") is not False
        or delta_42.get("pair_observed")
        != BRIDGE_STOP_REQUIRED_OBSERVATION["seed_42_pair_delta"]
        or delta_42.get("pair_limit_absolute")
        != BRIDGE_STOP_REQUIRED_OBSERVATION["seed_42_pair_limit_absolute"]
        or delta_42.get("pair_passed") is not False
        or seed_42.get("all_four_bridge_gates_passed") is not False
        or seed_43.get("all_four_bridge_gates_passed") is not True
        or seed_44.get("all_four_bridge_gates_passed") is not True
        or boundary.get("spent_selection_dataset_read_passes_total_observed") != 3
        or boundary.get("candidate_locked") is not False
        or boundary.get("fresh_final_label_reads") != 0
        or boundary.get("fresh_selection_label_reads") != 0
        or boundary.get("legacy_holdout_label_reads") != 0
        or boundary.get("live_weights_changed") is not False
        or boundary.get("candidate_strength_selected") is not False
        or boundary.get("local_only") is not True
        or boundary.get("network_requests") != 0
        or boundary.get("formal_ab_games") != 0
        or boundary.get("external_calibration_games") != 0
        or models != BRIDGE_STOP_EXACT_MODELS
    ):
        raise ValueError("bridge STOP evidence was altered or promoted")
    for label, metrics in (
        ("stable int16", models.get("stable_int16")),
        ("seed 42 parent int16", seed_42.get("parent_int16")),
        ("seed 43 parent int16", seed_43.get("parent_int16")),
        ("seed 44 parent int16", seed_44.get("parent_int16")),
    ):
        metric_set(metrics, label)
    return copy.deepcopy(evidence)


def validate_registry(value: Mapping[str, Any]) -> dict[str, Any]:
    registry = _exact(
        dict(value) if isinstance(value, Mapping) else value,
        _REGISTRY_FIELDS,
        "int16-only amendment registry",
    )
    if (
        registry["schema"] != REGISTRY_SCHEMA
        or registry["status"] != REGISTRY_STATUS
        or registry["recorded_date"] != "2026-07-20"
        or registry["builder_command"] != BUILDER_COMMAND
        or registry["runner_command"] != RUNNER_COMMAND
        or registry["boundary"] != BOUNDARY
        or registry["nonclaims"] != NONCLAIMS
    ):
        raise ValueError("int16-only amendment fixed registry boundary drifted")

    inputs = _exact(
        registry["inputs"],
        {
            "representation_bridge_registry",
            "selection_evaluator_registry",
            "bridge_stop_evidence",
        },
        "int16-only amendment inputs",
    )
    identity(
        inputs["representation_bridge_registry"],
        "representation bridge registry",
        path=BRIDGE_REGISTRY_RELATIVE_PATH,
        schema="shogi-floodgate-strength-first-representation-bridge-v3-registry-v1",
    )
    identity(
        inputs["selection_evaluator_registry"],
        "selection evaluator registry",
        path=SELECTION_REGISTRY_RELATIVE_PATH,
        schema="shogi-floodgate-strength-first-selection-evaluator-registry-v2",
    )
    identity(
        inputs["bridge_stop_evidence"],
        "bridge STOP evidence",
        path=BRIDGE_STOP_EVIDENCE_RELATIVE_PATH,
        schema="shogi-floodgate-strength-first-representation-bridge-v3-stop-evidence-v1",
    )

    implementation = _exact(
        registry["implementation"], set(_SOURCE_PATHS), "amendment implementation"
    )
    for name, relative in _SOURCE_PATHS.items():
        identity(
            implementation[name],
            f"amendment implementation {name}",
            path=relative,
            schema="shogi-reviewed-python-source-v1",
        )
    dependencies = _exact(
        registry["dependencies"],
        {"inherited_bridge_runtime_import_closure"},
        "amendment dependencies",
    )
    closure = dependencies["inherited_bridge_runtime_import_closure"]
    if closure != "authenticated-from-bound-representation-bridge-registry":
        raise ValueError("inherited bridge runtime closure binding drifted")

    stop = _exact(
        registry["bridge_stop"],
        {
            "status",
            "reason",
            "family_gate_passed",
            "output_root_absent",
            "representative_seed",
            "ranked_parent_int16_seed_order",
            "threshold_relaxed",
            "treated_as_pass",
        },
        "bridge STOP",
    )
    if stop != {
        "status": "STOP",
        "reason": "representation-family-gate-failed",
        "family_gate_passed": False,
        "output_root_absent": True,
        "representative_seed": 42,
        "ranked_parent_int16_seed_order": [43, 42, 44],
        "threshold_relaxed": False,
        "treated_as_pass": False,
    }:
        raise ValueError("representation bridge STOP was altered or promoted")

    spent = _exact(
        registry["spent_selection"],
        {"dataset", "records", "parents", "label_status", "authorized_use"},
        "spent selection",
    )
    identity(
        spent["dataset"],
        "spent selection dataset",
        schema="canonical-shogi-sibling-v1-jsonl-one-lf-per-row",
    )
    if (
        spent["records"] != 28_518
        or spent["parents"] != 4_798
        or spent["label_status"] != "already-spent-selection"
        or spent["authorized_use"]
        != "one-exact-int16-only-reauthentication-no-fresh-or-live-authority"
    ):
        raise ValueError("spent selection accounting drifted")

    models = _exact(registry["models"], {"stable", "seeds"}, "amendment models")
    stable = _exact(models["stable"], {"checkpoint", "epoch"}, "stable model")
    identity(stable["checkpoint"], "stable checkpoint")
    if stable["epoch"] != 27:
        raise ValueError("stable checkpoint epoch drifted")
    runs = models["seeds"]
    if type(runs) is not list or len(runs) != 3:
        raise ValueError("int16-only amendment requires exactly three parents")
    for run, seed in zip(runs, SEEDS):
        item = _exact(
            run,
            {"seed", "parent_result", "parent_checkpoint", "quantized_anchor"},
            f"int16-only seed {seed}",
        )
        if item["seed"] != seed:
            raise ValueError(f"int16-only seed {seed} order drifted")
        identity(item["parent_result"], f"seed {seed} parent result")
        checkpoint = checkpoint_identity(
            item["parent_checkpoint"], f"seed {seed} parent checkpoint", epoch=20
        )
        if seed == SELECTED_SEED and checkpoint != SELECTED_CHECKPOINT:
            raise ValueError("selected seed 42 checkpoint identity drifted")
        anchor = item["quantized_anchor"]
        if (
            type(anchor) is not dict
            or set(anchor) != {"schema", "aggregate_sha256", "tensors"}
            or anchor["schema"] != "shogi-strength-first-quantized-cell-anchor-v2"
            or type(anchor["aggregate_sha256"]) is not str
            or _SHA256_RE.fullmatch(anchor["aggregate_sha256"]) is None
            or type(anchor["tensors"]) is not dict
            or len(anchor["tensors"]) != 7
        ):
            raise ValueError(f"seed {seed} quantized anchor is invalid")

    policy = _exact(
        registry["policy"],
        {"metric_order", "strength_gates", "evaluation", "decision"},
        "int16-only policy",
    )
    if (
        policy["metric_order"] != list(METRIC_ORDER)
        or policy["strength_gates"] != STRENGTH_GATE_POLICY
        or policy["evaluation"] != EVALUATION_POLICY
        or policy["decision"] != DECISION_POLICY
    ):
        raise ValueError("int16-only amendment policy drifted")
    selected = next(run for run in runs if run["seed"] == SELECTED_SEED)
    if selected["parent_checkpoint"] != SELECTED_CHECKPOINT:
        raise ValueError("decision does not bind the selected checkpoint")

    output = _exact(
        registry["output"],
        {
            "root",
            "files",
            "atomic_private_bundle",
            "no_output_on_failure",
            "commit_semantics",
        },
        "int16-only output",
    )
    if (
        output["root"] != OUTPUT_ROOT
        or output["files"] != OUTPUT_FILES
        or output["atomic_private_bundle"] is not True
        or output["no_output_on_failure"] is not True
        or output["commit_semantics"] != COMMIT_SEMANTICS
    ):
        raise ValueError("int16-only output contract drifted")
    return copy.deepcopy(registry)


def load_registry(repo_root: str | Path | None = None) -> dict[str, Any]:
    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    return validate_registry(
        strict_json(root.joinpath(REGISTRY_RELATIVE_PATH).read_bytes(), "registry")
    )


__all__ = [
    "BOUNDARY",
    "BRIDGE_STOP_REQUIRED_OBSERVATION",
    "BRIDGE_STOP_EXACT_MODELS",
    "BRIDGE_REGISTRY_RELATIVE_PATH",
    "BRIDGE_STOP_EVIDENCE_RELATIVE_PATH",
    "BUILDER_COMMAND",
    "COMMIT_SEMANTICS",
    "COMMIT_RECEIPT_SCHEMA",
    "DECISION_POLICY",
    "EVALUATION_POLICY",
    "EXPECTED_RANKED_SEED_ORDER",
    "METRIC_FIELDS",
    "METRIC_ORDER",
    "NONCLAIMS",
    "OUTPUT_FILES",
    "OUTPUT_ROOT",
    "PUBLICATION_SCHEMA",
    "PUBLICATION_STATUS",
    "RECEIPT_SCHEMA",
    "RECEIPT_STATUS",
    "REGISTRY_RELATIVE_PATH",
    "REGISTRY_SCHEMA",
    "REGISTRY_STATUS",
    "REPORT_SCHEMA",
    "REPORT_STATUS",
    "RUNNER_COMMAND",
    "SEEDS",
    "SELECTED_CHECKPOINT_SHA256",
    "SELECTED_CHECKPOINT",
    "SELECTED_SEED",
    "SELECTION_REGISTRY_RELATIVE_PATH",
    "STRENGTH_GATE_POLICY",
    "canonical_json_bytes",
    "checkpoint_identity",
    "file_identity",
    "identity",
    "int16_strength_gate",
    "load_registry",
    "metric_set",
    "ranking_key",
    "strict_json",
    "validate_bridge_stop_evidence",
    "validate_registry",
]
