"""Closed contract for the spent-selection representation bridge v3.

The bridge may use the already-spent selection labels only to check whether
the epoch-24 float representations agree with the unchanged deployed integer
tensors.  Ranking and every deployment identity remain attached to the
epoch-20 parents.  Nothing in this protocol is fresh strength evidence or
authority to change live weights.
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

import sibling_selection_protocol as GATES


REGISTRY_SCHEMA = "shogi-floodgate-strength-first-representation-bridge-v3-registry-v1"
REPORT_SCHEMA = (
    "shogi-floodgate-strength-first-representation-bridge-v3-evaluation-report-v1"
)
RECEIPT_SCHEMA = "shogi-floodgate-strength-first-representation-bridge-v3-parent-deployment-receipt-v1"
PUBLICATION_SCHEMA = (
    "shogi-floodgate-strength-first-representation-bridge-v3-publication-result-v1"
)
QUANTIZED_PROOF_SCHEMA = "shogi-floodgate-strength-first-seven-tensor-equivalence-v1"
REGISTRY_STATUS = "ready-spent-selection-representation-only"
REPORT_STATUS = "complete-spent-selection-representation-evaluation"
RECEIPT_STATUS = "complete-parent-deployment-selection-representation-witness-only"
PUBLICATION_STATUS = "complete-atomic-private-representation-publication"

REGISTRY_RELATIVE_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-strength-first-representation-bridge-v3-registry.json"
)
ALIGNMENT_REGISTRY_RELATIVE_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-strength-first-qat-constrained-alignment-v2-result-registry.json"
)
SELECTION_REGISTRY_RELATIVE_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-strength-first-qat-selection-evaluator-registry.json"
)
OUTPUT_ROOT = (
    ".codex/shogi-runs/" "floodgate-q1-2026-strength-first-representation-bridge-v3"
)
OUTPUT_FILES = {
    "report": "evaluation-report.json",
    "receipt": "parent-deployment-receipt.json",
    "publication": "publication-result.json",
}
BUILDER_COMMAND = (
    "python3 ml/build_strength_first_representation_bridge_v3_registry_candidate.py"
)
RUNNER_COMMAND = "python3 ml/run_strength_first_representation_bridge_v3.py"
SEEDS = (42, 43, 44)
QUANTIZED_TENSOR_NAMES = (
    "w1_board",
    "w1_hand",
    "b1",
    "w2",
    "b2",
    "w3",
    "b3",
)
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
GATE_POLICY = {
    "candidate_pair_strictly_above_stable": True,
    "candidate_top1_at_least_stable": True,
    "absolute_aligned_float_to_parent_int16_pair_delta_at_most": 0.002,
    "absolute_aligned_float_to_parent_int16_top1_delta_at_most": 0.005,
    "comparison_absolute_tolerance": 1e-12,
}
FAMILY_POLICY = {
    "representative_passes_all_four": True,
    "minimum_seeds_passing_all_four": 2,
    "all_seeds_pass_both_representation_delta_gates": True,
}
EVALUATION_POLICY = {
    "model_loop_workers": 1,
    "float_model_evaluations": 7,
    "int16_model_evaluations": 4,
    "q_equivalent_int16_derivations": 3,
    "int16_reference": "int16_forward_batch",
    "int16_batch_rows": 4096,
    "torch_intraop_threads": 10,
    "torch_original_intraop_threads_restored": True,
    "torch_interop_threads": "unchanged-runtime-observed-positive-integer",
}
COMMIT_SEMANTICS = {
    "commit_point": "exclusive-directory-rename-returned-zero",
    "pre_commit_failure": "no-output-root-and-staging-removed",
    "post_commit_checks": "best-effort-diagnostics-not-a-success-condition",
    "parent_directory_fsync": "attempted-after-commit",
    "post_commit_fault_result": "committed-pass-with-recovery-receipt",
    "recovery": ("do-not-delete-or-retry-verify-three-enrolled-files-at-target"),
}
BOUNDARY = {
    "local_only": True,
    "network_requests": 0,
    "selection_labels_previously_spent": True,
    "selection_use": "representation-only",
    "fresh_selection_labels": False,
    "fresh_final_labels_read": False,
    "formal_ab_games": 0,
    "external_calibration_games": 0,
    "strength_claim_authorized": False,
    "candidate_strength_selected": False,
    "live_weights_changed": False,
    "deployment_checkpoint_epoch": 20,
    "alignment_witness_epoch": 24,
}
NONCLAIMS = {
    "playing_strength_improved": False,
    "fresh_holdout_passed": False,
    "formal_ab_passed": False,
    "high_dan_calibrated": False,
    "production_promotion_authorized": False,
}

_SOURCE_PATHS = {
    "protocol": "ml/strength_first_representation_bridge_v3_protocol.py",
    "adapter": "ml/strength_first_representation_bridge_v3_eval_adapter.py",
    "runner": "ml/run_strength_first_representation_bridge_v3.py",
    "registry_builder": (
        "ml/build_strength_first_representation_bridge_v3_registry_candidate.py"
    ),
}
RUNTIME_IMPORT_CLOSURE_PATHS = {
    "checkpoint_compat": "ml/checkpoint_compat.py",
    "evaluation_core": "ml/eval-sibling.py",
    "export_weights": "ml/export-weights.py",
    "fresh_parent_accounting": "ml/fresh_qat_parent_accounting_v2.py",
    "fresh_protocol": "ml/fresh_qat_protocol.py",
    "fresh_selection_preflight": "ml/fresh_qat_selection_preflight.py",
    "fresh_execution_dispatch": "ml/fresh_qat_v2_execution_dispatch.py",
    "int16_forward": "ml/int16_forward.py",
    "qat_plan_registry": "ml/qat_plan_registry.py",
    "qat_protocol": "ml/qat_protocol.py",
    "runner": "ml/run_strength_first_representation_bridge_v3.py",
    "sibling_manifest": "ml/sibling_manifest.py",
    "metric_gates": "ml/sibling_selection_protocol.py",
    "alignment_protocol": (
        "ml/strength_first_qat_constrained_alignment_v2_protocol.py"
    ),
    "alignment_result_registry": (
        "ml/strength_first_qat_constrained_alignment_v2_result_registry.py"
    ),
    "selection_adapter": "ml/strength_first_qat_selection_eval_adapter.py",
    "selection_evaluator": "ml/strength_first_qat_selection_evaluator.py",
    "selection_preflight": "ml/strength_first_qat_selection_preflight.py",
    "training_bridge": "ml/strength_first_qat_training_bridge.py",
    "quantized_alignment": "ml/strength_first_quantized_cell_alignment.py",
    "representation_adapter": (
        "ml/strength_first_representation_bridge_v3_eval_adapter.py"
    ),
    "representation_protocol": (
        "ml/strength_first_representation_bridge_v3_protocol.py"
    ),
    "training_core": "ml/train.py",
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
            raw.decode("utf-8"),
            object_pairs_hook=pairs,
            parse_constant=reject,
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


def checkpoint_identity(
    value: Any,
    label: str,
    *,
    epoch: int,
) -> dict[str, Any]:
    item = _exact(
        value,
        {"path", "schema", "bytes", "sha256", "epoch"},
        label,
    )
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
        any(not math.isfinite(value) for value in normalized.values())
        or normalized["value_mae_cp"] < 0.0
        or normalized["value_mse_cp2"] < 0.0
        or not 0.0 <= normalized["within_parent_pair_accuracy"] <= 1.0
        or not 0.0 <= normalized["teacher_top1_accuracy"] <= 1.0
    ):
        raise ValueError(f"{label} is outside its metric domain")
    return normalized


def selection_key(run: Mapping[str, Any]) -> tuple[Any, ...]:
    metrics = metric_set(run["parent_int16"], "parent int16 ranking metrics")
    seed = run["seed"]
    checkpoint = checkpoint_identity(
        run["deployment_checkpoint"], "deployment checkpoint", epoch=20
    )
    if type(seed) is not int or seed not in SEEDS:
        raise ValueError("ranking seed is invalid")
    return (
        -metrics["within_parent_pair_accuracy"],
        -metrics["teacher_top1_accuracy"],
        metrics["value_mae_cp"],
        seed,
        bytes.fromhex(checkpoint["sha256"]),
    )


def representation_gates(
    *,
    aligned_float: Mapping[str, float],
    parent_int16: Mapping[str, float],
    stable_int16: Mapping[str, float],
) -> dict[str, Any]:
    """Reuse the production gates with aligned float as the q-equivalent witness."""

    aligned = metric_set(dict(aligned_float), "aligned float metrics")
    parent = metric_set(dict(parent_int16), "parent int16 metrics")
    stable = metric_set(dict(stable_int16), "stable int16 metrics")
    return GATES.selection_gate_results(aligned, parent, stable)


def _validate_quantized_anchor(value: Any, label: str) -> dict[str, Any]:
    anchor = _exact(value, {"schema", "aggregate_sha256", "tensors"}, label)
    if (
        anchor["schema"] != "shogi-strength-first-quantized-cell-anchor-v2"
        or type(anchor["aggregate_sha256"]) is not str
        or _SHA256_RE.fullmatch(anchor["aggregate_sha256"]) is None
    ):
        raise ValueError(f"{label} header is invalid")
    tensors = _exact(anchor["tensors"], set(QUANTIZED_TENSOR_NAMES), label)
    for name in QUANTIZED_TENSOR_NAMES:
        tensor = _exact(tensors[name], {"dtype", "shape", "sha256"}, f"{label}.{name}")
        expected_dtype = "int32" if name in {"b1", "b2", "b3"} else "int16"
        if (
            tensor["dtype"] != expected_dtype
            or type(tensor["shape"]) is not list
            or not tensor["shape"]
            or any(type(size) is not int or size < 1 for size in tensor["shape"])
            or type(tensor["sha256"]) is not str
            or _SHA256_RE.fullmatch(tensor["sha256"]) is None
        ):
            raise ValueError(f"{label}.{name} is invalid")
    return anchor


def validate_registry(value: Mapping[str, Any]) -> dict[str, Any]:
    registry = _exact(
        dict(value) if isinstance(value, Mapping) else value,
        _REGISTRY_FIELDS,
        "representation bridge registry",
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
        raise ValueError("representation bridge fixed registry boundary drifted")

    inputs = _exact(
        registry["inputs"],
        {"alignment_result_registry", "selection_evaluator_registry"},
        "representation bridge inputs",
    )
    identity(
        inputs["alignment_result_registry"],
        "alignment result registry",
        path=ALIGNMENT_REGISTRY_RELATIVE_PATH,
        schema=(
            "shogi-floodgate-strength-first-qat-constrained-alignment-v2-"
            "result-registry-v1"
        ),
    )
    identity(
        inputs["selection_evaluator_registry"],
        "selection evaluator registry",
        path=SELECTION_REGISTRY_RELATIVE_PATH,
        schema="shogi-floodgate-strength-first-selection-evaluator-registry-v2",
    )

    implementation = _exact(
        registry["implementation"], set(_SOURCE_PATHS), "bridge implementation"
    )
    for name, relative in _SOURCE_PATHS.items():
        identity(
            implementation[name],
            f"bridge implementation {name}",
            path=relative,
            schema="shogi-reviewed-python-source-v1",
        )

    dependencies = _exact(
        registry["dependencies"],
        {"runtime_import_closure"},
        "bridge dependencies",
    )
    closure = _exact(
        dependencies["runtime_import_closure"],
        set(RUNTIME_IMPORT_CLOSURE_PATHS),
        "runtime import closure",
    )
    for name, relative in RUNTIME_IMPORT_CLOSURE_PATHS.items():
        identity(
            closure[name],
            f"runtime import closure {name}",
            path=relative,
            schema="shogi-reviewed-python-source-v1",
        )
    for name in ("protocol", "adapter", "runner"):
        closure_name = {
            "protocol": "representation_protocol",
            "adapter": "representation_adapter",
            "runner": "runner",
        }[name]
        if implementation[name] != closure[closure_name]:
            raise ValueError(f"runtime implementation closure {name} drifted")

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
        or spent["authorized_use"] != "representation-only-no-strength-claim"
    ):
        raise ValueError("spent selection accounting drifted")

    models = _exact(registry["models"], {"stable", "seeds"}, "bridge models")
    stable = _exact(models["stable"], {"checkpoint", "epoch"}, "stable model")
    identity(stable["checkpoint"], "stable checkpoint")
    if stable["epoch"] != 27:
        raise ValueError("stable checkpoint epoch drifted")
    runs = models["seeds"]
    if type(runs) is not list or len(runs) != 3:
        raise ValueError("bridge requires exactly three seed pairs")
    for run, seed in zip(runs, SEEDS):
        run = _exact(
            run,
            {
                "seed",
                "parent_result",
                "parent_checkpoint",
                "aligned_result",
                "aligned_checkpoint",
                "quantized_anchor",
            },
            f"bridge seed {seed}",
        )
        if run["seed"] != seed:
            raise ValueError(f"bridge seed {seed} order drifted")
        identity(run["parent_result"], f"seed {seed} parent result")
        checkpoint_identity(
            run["parent_checkpoint"], f"seed {seed} parent checkpoint", epoch=20
        )
        identity(run["aligned_result"], f"seed {seed} aligned result")
        checkpoint_identity(
            run["aligned_checkpoint"], f"seed {seed} aligned checkpoint", epoch=24
        )
        _validate_quantized_anchor(run["quantized_anchor"], f"seed {seed} anchor")

    policy = _exact(
        registry["policy"],
        {
            "metric_order",
            "representative",
            "gates",
            "family_gate",
            "evaluation",
            "deployment",
            "witness",
        },
        "bridge policy",
    )
    if (
        policy["metric_order"] != list(METRIC_ORDER)
        or policy["representative"] != "median-of-three-parent-int16-ranking"
        or policy["gates"] != GATE_POLICY
        or policy["family_gate"] != FAMILY_POLICY
        or policy["evaluation"] != EVALUATION_POLICY
        or policy["deployment"] != "epoch-20-parent-checkpoint-only"
        or policy["witness"] != "epoch-24-aligned-checkpoint-never-deployed"
    ):
        raise ValueError("representation bridge selection policy drifted")

    output = _exact(
        registry["output"],
        {
            "root",
            "files",
            "atomic_private_bundle",
            "no_output_on_failure",
            "commit_semantics",
        },
        "bridge output",
    )
    if (
        output["root"] != OUTPUT_ROOT
        or output["files"] != OUTPUT_FILES
        or output["atomic_private_bundle"] is not True
        or output["no_output_on_failure"] is not True
        or output["commit_semantics"] != COMMIT_SEMANTICS
    ):
        raise ValueError("representation bridge output contract drifted")
    return copy.deepcopy(registry)


def load_registry(repo_root: str | Path | None = None) -> dict[str, Any]:
    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    return validate_registry(
        strict_json(root.joinpath(REGISTRY_RELATIVE_PATH).read_bytes(), "registry")
    )


__all__ = [
    "ALIGNMENT_REGISTRY_RELATIVE_PATH",
    "BOUNDARY",
    "COMMIT_SEMANTICS",
    "EVALUATION_POLICY",
    "FAMILY_POLICY",
    "GATE_POLICY",
    "METRIC_FIELDS",
    "NONCLAIMS",
    "OUTPUT_FILES",
    "OUTPUT_ROOT",
    "PUBLICATION_SCHEMA",
    "PUBLICATION_STATUS",
    "QUANTIZED_PROOF_SCHEMA",
    "QUANTIZED_TENSOR_NAMES",
    "RECEIPT_SCHEMA",
    "RECEIPT_STATUS",
    "RUNTIME_IMPORT_CLOSURE_PATHS",
    "REGISTRY_RELATIVE_PATH",
    "REGISTRY_SCHEMA",
    "REPORT_SCHEMA",
    "REPORT_STATUS",
    "SEEDS",
    "SELECTION_REGISTRY_RELATIVE_PATH",
    "canonical_json_bytes",
    "checkpoint_identity",
    "file_identity",
    "identity",
    "load_registry",
    "metric_set",
    "representation_gates",
    "selection_key",
    "strict_json",
    "validate_registry",
]
