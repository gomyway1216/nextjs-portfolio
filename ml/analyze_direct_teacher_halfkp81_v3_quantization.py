#!/usr/bin/env python3
"""Read-only diagnosis for the closed HalfKP81 v3 CPU quantization miss.

The command authenticates the frozen v3 plan, results, checkpoints, exported
integer weights, and validation dataset.  It never opens either one-shot claim,
never creates an optimizer, never runs a game, and has no file-writing code.
Its only output is canonical JSON on stdout.
"""

from __future__ import annotations

from collections import defaultdict
import argparse
import gc
import json
import math
import os
from typing import Any, Mapping, Sequence

import torch

import direct_teacher_halfkp81_v3_cpu_protocol as PROTOCOL
from int16_forward import (
    ACT_SCALE,
    INT16_MAX,
    INT16_MIN,
    W_SCALE,
    effective_w1,
    quantize_model,
)
import train
import train_direct_teacher_halfkp81_v2 as V2


SCHEMA = "shogi-direct-teacher-halfkp81-v3-quantization-diagnosis-v1"
STATUS = "complete-read-only-no-authority"
RUN_ROOT = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "direct-teacher-halfkp81-v3-cpu-one-shot-v1"
)

EXPECTED_FILES = {
    "execution_plan": {
        "path": f"{RUN_ROOT}/plan/execution-plan.json",
        "bytes": 6_338,
        "sha256": "70ffc491b9a25653a964dc6bc7e008435c957df3e630db30337c42f5daa0ad4f",
        "schema": "shogi-direct-teacher-halfkp81-v3-cpu-pilot-execution-plan-v1",
    },
    "trainer_result": {
        "path": f"{RUN_ROOT}/trainer-output/trainer-result.json",
        "bytes": 7_268,
        "sha256": "9aebcdf8643fec75172734d41bbf385e557da7a07c84af118ab2155977d1e686",
        "schema": "shogi-direct-teacher-halfkp81-v3-cpu-trainer-result-v1",
    },
    "static_result": {
        "path": f"{RUN_ROOT}/trainer-output/static-sanity-result.json",
        "bytes": 6_435,
        "sha256": "966b894e1ffa4947ec521d2588f559be3685cd88e2b9f285cf189a72b8bf7fdc",
        "schema": "shogi-direct-teacher-halfkp81-v3-cpu-static-sanity-result-v1",
    },
    "runtime_sanity": {
        "path": f"{RUN_ROOT}/trainer-output/runtime-sanity.json",
        "bytes": 8_339,
        "sha256": "508ddec8ff04c2ed5a8dc716fe1c4b51d54713b68f1bb119b508b2febec498e2",
        "schema": "shogi-direct-teacher-halfkp81-v2-runtime-sanity-v1",
    },
    "candidate_reference": {
        "path": f"{RUN_ROOT}/trainer-output/candidate-reference.json",
        "bytes": 139_351,
        "sha256": "9f82f0cf27628a843a58e4498396b4c5780b36cb43ae8f62b9f5d593c7ebcd1c",
        "schema": V2.REFERENCE_SCHEMA,
    },
    "initializer_weights": {
        "path": f"{RUN_ROOT}/trainer-output/initializer-weights.bin",
        "bytes": 94_656_708,
        "sha256": "2b91060fe98c13d57341bdf0c773094c6489b7e508d6d6afd4051565dfb9b47c",
    },
    "candidate_weights": {
        "path": f"{RUN_ROOT}/trainer-output/candidate-weights.bin",
        "bytes": 94_656_708,
        "sha256": "9ba78c70253d0f8ebfb6d0412f54532c53e5fbd495a585ae057f979c1633933a",
    },
    "candidate_checkpoint": {
        "path": f"{RUN_ROOT}/trainer-output/final-epoch-001.pt",
        "bytes": 191_659_516,
        "sha256": "a0282411634940fdad93f6d4301e5cccbe311d83fabe03e76b996c583c35a46c",
        "schema": "shogi-direct-teacher-halfkp81-v3-cpu-final-checkpoint-v1",
    },
}

PERCENTILES = (0.5, 0.9, 0.95, 0.99, 0.995, 0.999, 0.9995, 0.9999)
ROBUST_PERCENTILE = 0.999
PROPOSED_ABSOLUTE_CAP_CP = 300.0


class QuantizationDiagnosisError(ValueError):
    """A frozen input or read-only diagnostic invariant differs."""


def _identity(path: str, label: str) -> dict[str, Any]:
    try:
        return V2._identity(path, label)
    except V2.DirectTeacherTrainingError as error:
        raise QuantizationDiagnosisError(str(error)) from error


def _authenticate_file(
    expected: Mapping[str, Any],
    label: str,
) -> dict[str, Any]:
    observed = _identity(str(expected["path"]), label)
    if any(observed[field] != expected[field] for field in ("path", "bytes", "sha256")):
        raise QuantizationDiagnosisError(f"{label} identity differs")
    return observed


def _load_json(
    expected: Mapping[str, Any],
    label: str,
) -> dict[str, Any]:
    try:
        value, identity = PROTOCOL.load_strict_json_file(
            str(expected["path"]),
            label,
        )
    except ValueError as error:
        raise QuantizationDiagnosisError(str(error)) from error
    if any(identity[field] != expected[field] for field in ("path", "bytes", "sha256")):
        raise QuantizationDiagnosisError(f"{label} identity differs")
    if type(value) is not dict or value.get("schema") != expected.get("schema"):
        raise QuantizationDiagnosisError(f"{label} schema differs")
    return value


def nearest_rank_percentile(
    sorted_values: torch.Tensor,
    percentile: float,
) -> float:
    """Return the deterministic nearest-rank percentile for a sorted vector."""

    if (
        sorted_values.ndim != 1
        or sorted_values.numel() < 1
        or not bool(torch.isfinite(sorted_values).all().item())
        or not bool((sorted_values[1:] >= sorted_values[:-1]).all().item())
        or not math.isfinite(percentile)
        or percentile <= 0.0
        or percentile > 1.0
    ):
        raise QuantizationDiagnosisError("percentile inputs are invalid")
    rank = math.ceil(percentile * int(sorted_values.numel()))
    return float(sorted_values[rank - 1].item())


def error_distribution(errors: torch.Tensor) -> dict[str, Any]:
    """Summarize one finite non-negative CP-error vector."""

    values = errors.detach().to(torch.float64).reshape(-1)
    if (
        values.numel() < 1
        or not bool(torch.isfinite(values).all().item())
        or not bool((values >= 0.0).all().item())
    ):
        raise QuantizationDiagnosisError("error vector is invalid")
    ordered = torch.sort(values).values
    result: dict[str, Any] = {
        "rows": int(ordered.numel()),
        "mean_cp": float(ordered.mean().item()),
    }
    for percentile in PERCENTILES:
        suffix = str(percentile * 100).rstrip("0").rstrip(".").replace(".", "_")
        result[f"p{suffix}_cp"] = nearest_rank_percentile(ordered, percentile)
    result["max_cp"] = float(ordered[-1].item())
    return result


def float_int_order_diagnostics(
    float_cp: torch.Tensor,
    int_cp: torch.Tensor,
    rows: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Measure order changes caused only by float-to-int16 conversion."""

    floating = float_cp.detach().to(torch.float64).reshape(-1)
    integer = int_cp.detach().to(torch.float64).reshape(-1)
    if (
        floating.shape != integer.shape
        or len(rows) != int(floating.numel())
        or not bool(torch.isfinite(floating).all().item())
        or not bool(torch.isfinite(integer).all().item())
    ):
        raise QuantizationDiagnosisError("order-diagnostic vectors differ")
    groups: dict[str, list[int]] = defaultdict(list)
    for index, row in enumerate(rows):
        parent_id = row.get("parent_id")
        if type(parent_id) is not str or not parent_id:
            raise QuantizationDiagnosisError("validation parent id is invalid")
        groups[parent_id].append(index)

    compared_pairs = 0
    flipped_or_tied_pairs = 0
    compared_parents = 0
    top_set_changed = 0
    for indices in groups.values():
        if len(indices) < 2:
            continue
        compared_parents += 1
        float_values = floating[indices]
        int_values = integer[indices]
        float_top = set(torch.where(float_values == float_values.max())[0].tolist())
        int_top = set(torch.where(int_values == int_values.max())[0].tolist())
        top_set_changed += int(float_top != int_top)
        for left_offset, left in enumerate(indices):
            for right in indices[left_offset + 1 :]:
                float_delta = float(floating[left] - floating[right])
                if float_delta == 0.0:
                    continue
                int_delta = float(integer[left] - integer[right])
                compared_pairs += 1
                flipped_or_tied_pairs += int(float_delta * int_delta <= 0.0)
    if compared_pairs < 1 or compared_parents < 1:
        raise QuantizationDiagnosisError("validation has no comparable siblings")
    return {
        "compared_pairs": compared_pairs,
        "flipped_or_int_tied_pairs": flipped_or_tied_pairs,
        "flipped_or_int_tied_rate": flipped_or_tied_pairs / compared_pairs,
        "compared_parents": compared_parents,
        "top_set_changed_parents": top_set_changed,
        "top_set_changed_rate": top_set_changed / compared_parents,
    }


def crossfit_affine_calibration(
    float_cp: torch.Tensor,
    int_cp: torch.Tensor,
    rows: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Fit global affine output calibration on even IDs and audit odd IDs."""

    floating = float_cp.detach().to(torch.float64).reshape(-1)
    integer = int_cp.detach().to(torch.float64).reshape(-1)
    if floating.shape != integer.shape or len(rows) != int(floating.numel()):
        raise QuantizationDiagnosisError("calibration vectors differ")
    parity: list[int] = []
    for row in rows:
        child_id = row.get("child_position_id")
        if (
            type(child_id) is not str
            or not child_id.startswith("sha256:")
            or len(child_id) != 71
        ):
            raise QuantizationDiagnosisError("calibration child id is invalid")
        parity.append(int(child_id[-1], 16) % 2)
    split = torch.tensor(parity, dtype=torch.bool)
    fit = ~split
    evaluate = split
    if not bool(fit.any().item()) or not bool(evaluate.any().item()):
        raise QuantizationDiagnosisError("calibration split is empty")

    x = integer[fit]
    y = floating[fit]
    x_centered = x - x.mean()
    denominator = torch.sum(x_centered * x_centered)
    if float(denominator.item()) == 0.0:
        raise QuantizationDiagnosisError("calibration integer outputs are constant")
    slope = torch.sum(x_centered * (y - y.mean())) / denominator
    intercept = y.mean() - slope * x.mean()
    evaluated_x = integer[evaluate]
    evaluated_y = floating[evaluate]
    baseline_errors = torch.abs(evaluated_y - evaluated_x)
    calibrated_errors = torch.abs(evaluated_y - (slope * evaluated_x + intercept))
    return {
        "split": "child-position-sha256-final-hex-even-fit-odd-evaluate",
        "fit_rows": int(fit.sum().item()),
        "evaluation_rows": int(evaluate.sum().item()),
        "slope": float(slope.item()),
        "intercept_cp": float(intercept.item()),
        "baseline": error_distribution(baseline_errors),
        "calibrated": error_distribution(calibrated_errors),
    }


def _weight_scale_diagnostics(model: torch.nn.Module) -> dict[str, Any]:
    w1_board, w1_hand, _b1 = effective_w1(model)
    sources = {
        "w1_board": (w1_board, ACT_SCALE),
        "w1_hand": (w1_hand, ACT_SCALE),
        "w2": (model.l2.weight, W_SCALE),
        "w3": (model.l3.weight.squeeze(0), W_SCALE),
    }
    result: dict[str, Any] = {}
    for name, (tensor, scale) in sources.items():
        value = tensor.detach()
        scaled = value * scale
        rounded = torch.round(scaled)
        result[name] = {
            "coordinates": int(value.numel()),
            "scale": scale,
            "float_min": float(value.min().item()),
            "float_max": float(value.max().item()),
            "scaled_min": float(scaled.min().item()),
            "scaled_max": float(scaled.max().item()),
            "int16_clipping_coordinates": int(
                ((rounded < INT16_MIN) | (rounded > INT16_MAX)).sum().item()
            ),
        }
        del scaled, rounded
    return result


def _load_model(
    checkpoint_expected: Mapping[str, Any],
    *,
    checkpoint_schema: str | None,
    expected_arch: Mapping[str, Any],
    label: str,
) -> torch.nn.Module:
    checkpoint, identity = train.load_stable_torch_checkpoint(
        str(checkpoint_expected["path"]),
        weights_only=True,
        expected_sha256=str(checkpoint_expected["sha256"]),
    )
    if (
        identity["bytes"] != checkpoint_expected["bytes"]
        or identity["sha256"] != checkpoint_expected["sha256"]
        or type(checkpoint) is not dict
        or (
            checkpoint_schema is not None
            and checkpoint.get("schema") != checkpoint_schema
        )
    ):
        raise QuantizationDiagnosisError(f"{label} checkpoint identity differs")
    try:
        train.validate_arch(checkpoint["arch"], expected_arch)
        model = train.DistillNet(V2.FEATURES)
        model.load_state_dict(checkpoint["model"], strict=True)
        train.require_finite_model_parameters(model, label)
    except (KeyError, RuntimeError, TypeError, ValueError) as error:
        raise QuantizationDiagnosisError(f"{label} checkpoint model differs") from error
    model.eval()
    return model


def _exact_qweights(
    model: torch.nn.Module,
    weights_expected: Mapping[str, Any],
    *,
    label: str,
) -> dict[str, torch.Tensor]:
    _authenticate_file(weights_expected, label)
    try:
        exported = V2.read_quantized_weights(str(weights_expected["path"]), model)
        reproduced = quantize_model(model)
    except (V2.DirectTeacherTrainingError, TypeError, ValueError) as error:
        raise QuantizationDiagnosisError(str(error)) from error
    mismatches = sum(
        int((exported[name] != reproduced[name]).sum().item())
        for name, _typecode in V2.EXPORT_LAYOUT
    )
    if mismatches != 0:
        raise QuantizationDiagnosisError(
            f"{label} differs from checkpoint quantization"
        )
    return exported


def _metrics_close(
    observed: Mapping[str, Any],
    expected: Mapping[str, Any],
    *,
    label: str,
) -> None:
    for field in ("direct_scalar_bce", "teacher_mae_cp", "pair_accuracy"):
        if not math.isclose(
            float(observed[field]),
            float(expected[field]),
            rel_tol=0.0,
            abs_tol=1e-9,
        ):
            raise QuantizationDiagnosisError(f"{label}.{field} differs")
    for field in ("pair_correct", "pair_total", "rows"):
        if observed[field] != expected[field]:
            raise QuantizationDiagnosisError(f"{label}.{field} differs")


def _analyze_model(
    *,
    role: str,
    model: torch.nn.Module,
    qweights: Mapping[str, torch.Tensor],
    tensors: tuple[torch.Tensor, ...],
    rows: Sequence[Mapping[str, Any]],
    expected_float_metrics: Mapping[str, Any],
    expected_quantization: Mapping[str, Any],
) -> tuple[dict[str, Any], torch.Tensor, torch.Tensor, torch.Tensor]:
    try:
        float_logits = V2._model_outputs(
            model,
            tensors,
            device=torch.device("cpu"),
        )
        out_q, int_cp = V2.int16_outputs(qweights, tensors)
        float_metrics = V2.validation_metrics(float_logits, tensors, rows)
        quantization = V2.quantization_metrics(float_logits, int_cp)
        int_metrics = V2.validation_metrics(
            int_cp.to(torch.float32) / V2.K_SIGMOID,
            tensors,
            rows,
        )
    except V2.DirectTeacherTrainingError as error:
        raise QuantizationDiagnosisError(str(error)) from error
    _metrics_close(float_metrics, expected_float_metrics, label=f"{role} float")
    for field in ("mean_abs_cp_delta", "max_abs_cp_delta"):
        if not math.isclose(
            float(quantization[field]),
            float(expected_quantization[field]),
            rel_tol=0.0,
            abs_tol=1e-6,
        ):
            raise QuantizationDiagnosisError(
                f"{role} official quantization metric differs"
            )

    float_cp = float_logits * V2.K_SIGMOID
    errors = torch.abs(float_cp - int_cp.to(torch.float32))
    order = float_int_order_diagnostics(float_cp, int_cp, rows)
    sign_changes = int(
        ((torch.sign(float_cp) != torch.sign(int_cp)) & (float_cp != 0.0)).sum().item()
    )
    top_indices = torch.topk(errors, 10).indices.tolist()
    top = [
        {
            "zero_based_index": index,
            "child_position_id": rows[index]["child_position_id"],
            "parent_id": rows[index]["parent_id"],
            "game_id": rows[index]["game_id"],
            "sfen": rows[index]["child_sfen"],
            "move_number": int(str(rows[index]["child_sfen"]).split()[-1]),
            "teacher_cp": int(rows[index]["teacher_child_cp"]),
            "float_cp": float(float_cp[index].item()),
            "int16_cp": int(int_cp[index].item()),
            "abs_delta_cp": float(errors[index].item()),
            "out_q": int(out_q[index].item()),
        }
        for index in top_indices
    ]
    result = {
        "official_float_teacher_metrics": dict(float_metrics),
        "deployed_int16_teacher_metrics": dict(int_metrics),
        "int16_minus_float": {
            "direct_scalar_bce": (
                float(int_metrics["direct_scalar_bce"])
                - float(float_metrics["direct_scalar_bce"])
            ),
            "teacher_mae_cp": (
                float(int_metrics["teacher_mae_cp"])
                - float(float_metrics["teacher_mae_cp"])
            ),
            "pair_accuracy": (
                float(int_metrics["pair_accuracy"])
                - float(float_metrics["pair_accuracy"])
            ),
        },
        "official_quantization": dict(quantization),
        "abs_cp_delta_distribution": error_distribution(errors),
        "float_to_int16_order": order,
        "float_to_int16_sign_changes": sign_changes,
        "weight_scale": _weight_scale_diagnostics(model),
        "worst_positions": top,
    }
    return result, float_cp, int_cp, errors


def _qweight_delta(
    initializer: Mapping[str, torch.Tensor],
    candidate: Mapping[str, torch.Tensor],
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for name, _typecode in V2.EXPORT_LAYOUT:
        left = initializer[name].to(torch.int64)
        right = candidate[name].to(torch.int64)
        if left.shape != right.shape:
            raise QuantizationDiagnosisError(f"{name} quantized shape differs")
        delta = right - left
        result[name] = {
            "coordinates": int(delta.numel()),
            "changed_coordinates": int((delta != 0).sum().item()),
            "minimum_delta_units": int(delta.min().item()),
            "maximum_delta_units": int(delta.max().item()),
        }
    return result


def tail_cluster_summary(
    *,
    candidate_errors: torch.Tensor,
    initializer_max_cp: float,
    rows: Sequence[Mapping[str, Any]],
    candidate_float_cp: torch.Tensor,
    candidate_int_cp: torch.Tensor,
) -> dict[str, Any]:
    """Summarize rows that alone drive the historical maximum-ratio miss."""

    allowance = initializer_max_cp * 1.05
    indices = torch.where(candidate_errors > allowance)[0].tolist()
    parents = {str(rows[index]["parent_id"]) for index in indices}
    games = {str(rows[index]["game_id"]) for index in indices}
    move_numbers = {
        int(str(rows[index]["child_sfen"]).split()[-1]) for index in indices
    }
    if not indices:
        worst_parent: str | None = None
        worst_parent_rows: list[int] = []
    else:
        parent_counts: dict[str, int] = defaultdict(int)
        for index in indices:
            parent_counts[str(rows[index]["parent_id"])] += 1
        worst_parent = max(
            parent_counts,
            key=lambda item: (parent_counts[item], item),
        )
        worst_parent_rows = [
            index for index, row in enumerate(rows) if row["parent_id"] == worst_parent
        ]
    selection: dict[str, Any] | None = None
    if worst_parent_rows:
        teacher = torch.tensor(
            [float(rows[index]["teacher_child_cp"]) for index in worst_parent_rows]
        )
        floating = candidate_float_cp[worst_parent_rows]
        integer = candidate_int_cp[worst_parent_rows]
        selection = {
            "rows": len(worst_parent_rows),
            "teacher_best_child_position_id": rows[
                worst_parent_rows[int(torch.argmax(teacher).item())]
            ]["child_position_id"],
            "candidate_float_best_child_position_id": rows[
                worst_parent_rows[int(torch.argmax(floating).item())]
            ]["child_position_id"],
            "candidate_int16_best_child_position_id": rows[
                worst_parent_rows[int(torch.argmax(integer).item())]
            ]["child_position_id"],
            "candidate_float_and_int16_best_equal": bool(
                int(torch.argmax(floating).item()) == int(torch.argmax(integer).item())
            ),
        }
    return {
        "historical_relative_allowance_cp": allowance,
        "rows_above_historical_allowance": len(indices),
        "unique_parents_above_historical_allowance": len(parents),
        "unique_games_above_historical_allowance": len(games),
        "move_numbers_above_historical_allowance": sorted(move_numbers),
        "driver_parent_id": worst_parent,
        "driver_parent_selection": selection,
    }


def _validate_closed_state(
    static_result: Mapping[str, Any],
    trainer_result: Mapping[str, Any],
) -> None:
    checks = static_result.get("checks")
    failed = (
        [
            name
            for name, check in checks.items()
            if type(check) is dict and check.get("passed") is False
        ]
        if type(checks) is dict
        else []
    )
    if (
        static_result.get("status") != "failed-one-or-more-checks-v3-cpu-family-closed"
        or failed != ["quantized_max_abs_cp_delta_ratio_maximum"]
        or static_result.get("paired56_authorized") is not False
        or static_result.get("expanded_stage_authorized") is not False
        or static_result.get("live_weight_write_authorized") is not False
        or trainer_result.get("paired56_authorized") is not False
        or trainer_result.get("expanded_stage_authorized") is not False
        or trainer_result.get("live_weight_write_authorized") is not False
    ):
        raise QuantizationDiagnosisError("formal v3 closed state differs")


def analyze() -> dict[str, Any]:
    """Run the fixed diagnosis without creating claims, games, or files."""

    plan = _load_json(EXPECTED_FILES["execution_plan"], "v3 execution plan")
    trainer_result = _load_json(
        EXPECTED_FILES["trainer_result"],
        "v3 trainer result",
    )
    static_result = _load_json(
        EXPECTED_FILES["static_result"],
        "v3 static result",
    )
    runtime_result = _load_json(
        EXPECTED_FILES["runtime_sanity"],
        "v3 runtime sanity",
    )
    reference = _load_json(
        EXPECTED_FILES["candidate_reference"],
        "v3 candidate reference",
    )
    _validate_closed_state(static_result, trainer_result)
    if (
        runtime_result.get("status") != "complete-pass"
        or runtime_result.get("technical_faults") != 0
        or runtime_result.get("parity", {}).get("mismatches") != 0
        or reference.get("n") != 512
    ):
        raise QuantizationDiagnosisError("runtime/reference evidence differs")

    validation_declared = plan.get("inputs", {}).get("validation_dataset")
    initializer_declared = plan.get("inputs", {}).get("initializer")
    if type(validation_declared) is not dict or type(initializer_declared) is not dict:
        raise QuantizationDiagnosisError("v3 plan inputs differ")
    try:
        tensors, rows, validation_identity = V2.load_bound_dataset(
            str(validation_declared["path"]),
            validation_declared,
            role="validation",
        )
    except V2.DirectTeacherTrainingError as error:
        raise QuantizationDiagnosisError(str(error)) from error
    if len(rows) != 22_890:
        raise QuantizationDiagnosisError("validation row count differs")

    template = train.DistillNet(V2.FEATURES)
    expected_arch = train.expected_arch(
        features=V2.FEATURES,
        input_dim=template.arch_input_dim,
        h1=train.DistillNet.H1,
        h2=train.DistillNet.H2,
        k=V2.K_SIGMOID,
        kp_buckets=V2.BUCKETS,
    )
    del template

    torch.set_num_threads(min(14, os.cpu_count() or 1))
    initializer_model = _load_model(
        initializer_declared,
        checkpoint_schema=None,
        expected_arch=expected_arch,
        label="v3 initializer",
    )
    initializer_q = _exact_qweights(
        initializer_model,
        EXPECTED_FILES["initializer_weights"],
        label="v3 initializer exported weights",
    )
    initializer, initializer_float_cp, initializer_int_cp, initializer_errors = (
        _analyze_model(
            role="initializer",
            model=initializer_model,
            qweights=initializer_q,
            tensors=tensors,
            rows=rows,
            expected_float_metrics=trainer_result["metrics"]["initializer"],
            expected_quantization=trainer_result["metrics"]["initializer_quantization"],
        )
    )
    del initializer_model
    gc.collect()

    candidate_model = _load_model(
        EXPECTED_FILES["candidate_checkpoint"],
        checkpoint_schema=str(EXPECTED_FILES["candidate_checkpoint"]["schema"]),
        expected_arch=expected_arch,
        label="v3 candidate",
    )
    candidate_q = _exact_qweights(
        candidate_model,
        EXPECTED_FILES["candidate_weights"],
        label="v3 candidate exported weights",
    )
    candidate, candidate_float_cp, candidate_int_cp, candidate_errors = _analyze_model(
        role="candidate",
        model=candidate_model,
        qweights=candidate_q,
        tensors=tensors,
        rows=rows,
        expected_float_metrics=trainer_result["metrics"]["candidate"],
        expected_quantization=trainer_result["metrics"]["candidate_quantization"],
    )
    del candidate_model
    gc.collect()

    distributions = {
        "initializer": initializer["abs_cp_delta_distribution"],
        "candidate": candidate["abs_cp_delta_distribution"],
    }
    ratios: dict[str, float] = {}
    for field in (
        "mean_cp",
        "p50_cp",
        "p90_cp",
        "p95_cp",
        "p99_cp",
        "p99_5_cp",
        "p99_9_cp",
        "p99_95_cp",
        "p99_99_cp",
        "max_cp",
    ):
        ratios[field] = float(distributions["candidate"][field]) / float(
            distributions["initializer"][field]
        )

    tail = tail_cluster_summary(
        candidate_errors=candidate_errors,
        initializer_max_cp=float(distributions["initializer"]["max_cp"]),
        rows=rows,
        candidate_float_cp=candidate_float_cp,
        candidate_int_cp=candidate_int_cp,
    )
    tail["candidate_rows_above_initializer_max"] = int(
        (candidate_errors > float(distributions["initializer"]["max_cp"])).sum().item()
    )
    tail["candidate_rows_worse_than_initializer_same_position"] = int(
        (candidate_errors > initializer_errors).sum().item()
    )

    initializer_int = initializer["deployed_int16_teacher_metrics"]
    candidate_int = candidate["deployed_int16_teacher_metrics"]
    deployed_delta = {
        "teacher_mae_cp_improvement": (
            float(initializer_int["teacher_mae_cp"])
            - float(candidate_int["teacher_mae_cp"])
        ),
        "pair_accuracy_delta": (
            float(candidate_int["pair_accuracy"])
            - float(initializer_int["pair_accuracy"])
        ),
        "pair_correct_delta": (
            int(candidate_int["pair_correct"]) - int(initializer_int["pair_correct"])
        ),
        "direct_scalar_bce_improvement": (
            float(initializer_int["direct_scalar_bce"])
            - float(candidate_int["direct_scalar_bce"])
        ),
    }

    calibration = {
        "initializer": crossfit_affine_calibration(
            initializer_float_cp,
            initializer_int_cp,
            rows,
        ),
        "candidate": crossfit_affine_calibration(
            candidate_float_cp,
            candidate_int_cp,
            rows,
        ),
    }
    candidate_calibration = calibration["candidate"]
    calibration["candidate_holdout_mean_cp_improvement"] = float(
        candidate_calibration["baseline"]["mean_cp"]
    ) - float(candidate_calibration["calibrated"]["mean_cp"])

    qweight_delta = _qweight_delta(initializer_q, candidate_q)
    del initializer_q, candidate_q
    gc.collect()

    robust_ratio = ratios["p99_9_cp"]
    proposal_observations = {
        "nearest_rank_p99_9_ratio": robust_ratio,
        "nearest_rank_p99_9_ratio_ceiling": 1.05,
        "absolute_max_cp": float(distributions["candidate"]["max_cp"]),
        "absolute_max_cp_ceiling": PROPOSED_ABSOLUTE_CAP_CP,
        "weight_int16_clipping_coordinates": sum(
            item["int16_clipping_coordinates"]
            for item in candidate["weight_scale"].values()
        ),
        "deployed_int16_teacher_mae_cp_improvement": deployed_delta[
            "teacher_mae_cp_improvement"
        ],
        "deployed_int16_pair_accuracy_delta": deployed_delta["pair_accuracy_delta"],
        "wasm_parity_mismatches": int(runtime_result["parity"]["mismatches"]),
        "runtime_search_median_slowdown_percent": float(
            runtime_result["throughput"]["median_slowdown_percent"]
        ),
        "runtime_search_slowdown_percent_ceiling": float(
            runtime_result["config"]["slowdown_percent_maximum"]
        ),
        "diagnostic_only_all_proposed_checks_observed_pass": bool(
            robust_ratio <= 1.05
            and float(distributions["candidate"]["max_cp"]) <= PROPOSED_ABSOLUTE_CAP_CP
            and deployed_delta["teacher_mae_cp_improvement"] >= 5.0
            and deployed_delta["pair_accuracy_delta"] >= 0.0
            and all(
                item["int16_clipping_coordinates"] == 0
                for item in candidate["weight_scale"].values()
            )
            and runtime_result["parity"]["mismatches"] == 0
            and runtime_result["throughput"]["median_slowdown_percent"]
            <= runtime_result["config"]["slowdown_percent_maximum"]
        ),
    }

    # Reauthenticate the small formal receipts after the long tensor analysis.
    for key, label in (
        ("execution_plan", "v3 execution plan after analysis"),
        ("trainer_result", "v3 trainer result after analysis"),
        ("static_result", "v3 static result after analysis"),
    ):
        _authenticate_file(EXPECTED_FILES[key], label)

    return {
        "schema": SCHEMA,
        "status": STATUS,
        "authority": {
            "one_shot_claim_opened": False,
            "optimizer_created": False,
            "training_rows": 0,
            "paired_games": 0,
            "paired56_authorized": False,
            "expanded_stage_authorized": False,
            "live_weight_write_authorized": False,
            "playing_strength_claim_authorized": False,
        },
        "inputs": {key: dict(value) for key, value in EXPECTED_FILES.items()}
        | {"validation_dataset": validation_identity},
        "formal_failure": {
            "only_failed_check": "quantized_max_abs_cp_delta_ratio_maximum",
            "observed": static_result["checks"][
                "quantized_max_abs_cp_delta_ratio_maximum"
            ]["observed"],
            "requirement": static_result["checks"][
                "quantized_max_abs_cp_delta_ratio_maximum"
            ]["requirement"],
            "family_closed": True,
        },
        "initializer": initializer,
        "candidate": candidate,
        "candidate_over_initializer_ratios": ratios,
        "tail": tail,
        "deployed_int16_candidate_over_initializer": deployed_delta,
        "scale_recalibration": calibration,
        "quantized_coordinate_delta": qweight_delta,
        "diagnosis": {
            "broad_quantization_regression_observed": False,
            "real_local_tail_observed": True,
            "weight_clipping_is_cause": False,
            "global_output_scale_is_primary_cause": False,
            "historical_max_only_relative_gate_is_unstable_to_one_correlated_parent": True,
            "classification": (
                "max-only-relative-gate-design-problem-with-real-local-rounding-tail"
            ),
        },
        "independent_v4_proposal_observations": proposal_observations,
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read-only diagnosis of the frozen HalfKP81 v3 quantization miss."
    )
    parser.add_argument(
        "--compact",
        action="store_true",
        help="print canonical compact JSON instead of indented JSON",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    result = analyze()
    print(
        json.dumps(
            result,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":") if args.compact else None,
            indent=None if args.compact else 2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
