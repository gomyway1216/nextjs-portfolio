#!/usr/bin/env python3
"""Compare checkpoints on one leak-free sibling validation set.

Every dataset row is a *child* position after one candidate move.  Its ``cp``
is therefore from the child's side to move, while move choice is made from the
parent.  Ranking metrics flip both teacher and prediction exactly once:

    parent_cp = -child_cp

Value MAE/MSE use the same clamped child-view CP target as ``train.py``.  The
within-parent pair and teacher-top1 metrics use unclamped CP so that mate/high
scores retain their order.  All models are evaluated on the exact same parsed
rows.  By default the report also runs the integer reference implementation
from ``export-weights.py`` and exposes float-to-int16 metric deltas.

Example:

    ml/venv/bin/python ml/eval-sibling.py \
      --data ml/data/wcsc36/val.jsonl \
      --sibling-manifest ml/data/wcsc36/manifest.json \
      --checkpoint stable=ml/runs/runOp1/best.pt \
      --checkpoint warm=ml/runs/wcsc36-warm/best.pt
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import sys
import tempfile
from typing import Any, Iterable, Mapping, Sequence

import torch


ML_DIR = os.path.dirname(os.path.abspath(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from checkpoint_compat import sha256_file  # noqa: E402
from sibling_manifest import verify_sibling_manifest  # noqa: E402
from train import (  # noqa: E402
    INPUT_DIM,
    DistillNet,
    load_stable_torch_checkpoint,
    load_dataset_with_metadata,
    raw_sibling_cp,
    sibling_metrics,
    validate_sibling_metadata,
)


REPORT_SCHEMA = "shogi-sibling-eval-v1"
DEFAULT_CP_CLAMP = 3000
DEFAULT_PAIR_MIN_CP = 50.0
PRODUCTION_CP_LIMIT = 1_000_000
PRODUCTION_CP_DENOMINATOR = 127 * 64


def _load_export_module():
    """Load the hyphenated exporter without duplicating its integer math."""
    path = os.path.join(ML_DIR, "export-weights.py")
    spec = importlib.util.spec_from_file_location("shogi_export_weights", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load quantization reference: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_checkpoint_specs(values: Sequence[str]) -> list[tuple[str, str]]:
    """Parse repeated ``NAME=PATH`` arguments while preserving CLI order."""
    parsed: list[tuple[str, str]] = []
    names: set[str] = set()
    for value in values:
        name, separator, path = value.partition("=")
        name = name.strip()
        path = path.strip()
        if not separator or not name or not path:
            raise ValueError(f"invalid checkpoint {value!r}; expected NAME=PATH")
        if name in names:
            raise ValueError(f"duplicate checkpoint name: {name}")
        names.add(name)
        parsed.append((name, path))
    if not parsed:
        raise ValueError("at least one checkpoint is required")
    return parsed


def _same_file_or_realpath(left: str, right: str) -> bool:
    left_real = os.path.realpath(os.path.abspath(left))
    right_real = os.path.realpath(os.path.abspath(right))
    if left_real == right_real:
        return True
    try:
        return os.path.exists(left) and os.path.exists(right) and os.path.samefile(left, right)
    except OSError:
        return False


def validate_json_output_path(
    output_path: str,
    data_path: str,
    checkpoint_specs: Sequence[tuple[str, str]],
    manifest_path: str | None = None,
) -> None:
    """Never let a report overwrite any byte source used to produce it."""
    inputs = [("validation data", data_path)] + [
        (f"checkpoint {name}", path) for name, path in checkpoint_specs
    ]
    if manifest_path:
        inputs.append(("sibling manifest", manifest_path))
    for label, input_path in inputs:
        if _same_file_or_realpath(output_path, input_path):
            raise ValueError(f"--json-out must not overwrite {label}: {input_path}")


def atomic_write_json(path: str, serialized: str) -> None:
    """Durably write in the target directory, then atomically replace the target."""
    target = os.path.abspath(path)
    directory = os.path.dirname(target)
    if not os.path.isdir(directory):
        raise ValueError(f"JSON output directory does not exist: {directory}")
    basename = os.path.basename(target) or "report.json"
    descriptor, temporary = tempfile.mkstemp(
        dir=directory,
        prefix=f".{basename}.",
        suffix=".tmp",
        text=True,
    )
    descriptor_open = True
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as target_file:
            descriptor_open = False
            target_file.write(serialized + "\n")
            target_file.flush()
            os.fsync(target_file.fileno())
        os.replace(temporary, target)
        temporary = ""
        try:
            directory_fd = os.open(directory, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            # The file itself is already fsynced and atomically installed;
            # directory fsync is unavailable on some filesystems.
            pass
    finally:
        if descriptor_open:
            os.close(descriptor)
        if temporary:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass


def _nonempty_line_count(path: str) -> int:
    with open(path, encoding="utf-8") as source:
        return sum(1 for line in source if line.strip())


def load_validation_data(path: str, cp_clamp: int):
    """Load once, reject silently skipped rows, and validate sibling groups."""
    if cp_clamp <= 0:
        raise ValueError("cp_clamp must be positive")
    if not os.path.isfile(path):
        raise ValueError(f"validation data does not exist: {path}")

    nonempty_rows = _nonempty_line_count(path)
    board, hands, _targets, clamped_cp, bucket, metadata = load_dataset_with_metadata(
        path,
        k_sigmoid=600.0,  # Only targets depend on K; they are unused here.
        cp_clamp=cp_clamp,
        features="board",
        strict=True,
    )
    if not metadata:
        raise ValueError("validation data has no usable rows")
    if len(metadata) != nonempty_rows:
        raise ValueError(
            "validation data contains malformed/unusable rows: "
            f"loaded {len(metadata)} of {nonempty_rows} non-empty rows"
        )

    # This is the same contract enforced before sibling-ranking training:
    # required provenance, unique moves, >=2 candidates, and exact sign.
    try:
        groups = validate_sibling_metadata(metadata, "validation")
    except SystemExit as error:
        raise ValueError(str(error)) from error

    raw_child_cp = raw_sibling_cp(metadata)
    for label, tensor in (
        ("clamped child cp", clamped_cp),
        ("raw child cp", raw_child_cp),
        ("hands", hands),
    ):
        if not torch.isfinite(tensor).all():
            raise ValueError(f"validation data contains non-finite {label}")

    return board, hands, bucket, clamped_cp, raw_child_cp, metadata, groups


def _checkpoint_arch(checkpoint: Mapping[str, Any], path: str) -> tuple[str, float]:
    """Resolve and strictly constrain the currently deployed board network."""
    arch = checkpoint.get("arch")
    if not isinstance(arch, Mapping):
        raise ValueError(f"{path}: checkpoint arch metadata is missing")
    args = checkpoint.get("args")
    args = args if isinstance(args, Mapping) else {}

    features = arch.get("features", args.get("features"))
    if features is None and arch.get("input") == INPUT_DIM:
        # runOp1 predates the explicit feature-name field, but its input size
        # uniquely identifies the current board representation.
        features = "board"
    if features != "board":
        raise ValueError(f"{path}: only the current board architecture is supported, got {features!r}")

    expected = {
        "input": INPUT_DIM,
        "h1": DistillNet.H1,
        "h2": DistillNet.H2,
    }
    for field, wanted in expected.items():
        found = arch.get(field)
        if found != wanted:
            raise ValueError(f"{path}: incompatible arch {field}: expected {wanted}, got {found!r}")
    try:
        k_sigmoid = float(arch.get("k", args.get("k", 600.0)))
    except (TypeError, ValueError) as error:
        raise ValueError(f"{path}: invalid sigmoid scale K") from error
    if not math.isfinite(k_sigmoid) or k_sigmoid <= 0:
        raise ValueError(f"{path}: sigmoid scale K must be finite and positive")
    return features, k_sigmoid


def load_model(path: str) -> tuple[DistillNet, Mapping[str, Any], float, Mapping[str, Any]]:
    if not os.path.isfile(path):
        raise ValueError(f"checkpoint does not exist: {path}")
    try:
        checkpoint, checkpoint_fingerprint = load_stable_torch_checkpoint(
            path,
            weights_only=True,
        )
    except Exception as error:
        raise ValueError(f"cannot load checkpoint {path}: {error}") from error
    if not isinstance(checkpoint, Mapping) or not isinstance(checkpoint.get("model"), Mapping):
        raise ValueError(f"{path}: checkpoint model state is missing")

    features, k_sigmoid = _checkpoint_arch(checkpoint, path)
    model = DistillNet(features)
    try:
        model.load_state_dict(checkpoint["model"], strict=True)
    except RuntimeError as error:
        raise ValueError(f"{path}: incompatible model state: {error}") from error
    for name, parameter in model.named_parameters():
        if not torch.isfinite(parameter).all():
            raise ValueError(f"{path}: model parameter {name} is non-finite")
    model.eval()
    return model, checkpoint, k_sigmoid, checkpoint_fingerprint


def verify_checkpoint_training_provenance(
    checkpoint: Mapping[str, Any],
    manifest_provenance: Mapping[str, Any],
    checkpoint_path: str,
) -> dict[str, Any]:
    """Bind new sibling checkpoints to this holdout; label legacy models clearly."""
    args = checkpoint.get("args")
    args = args if isinstance(args, Mapping) else {}
    loss = args.get("loss")
    data_provenance = checkpoint.get("data_provenance")
    if data_provenance is None:
        if loss == "sibling-ranking":
            raise ValueError(
                f"{checkpoint_path}: sibling checkpoint is missing data_provenance"
            )
        return {
            "status": "legacy_unverified",
            "reason": "checkpoint has no sibling-manifest-bound training provenance",
        }
    if not isinstance(data_provenance, Mapping):
        raise ValueError(f"{checkpoint_path}: checkpoint data_provenance is invalid")

    checkpoint_manifest = data_provenance.get("sibling_manifest")
    if not isinstance(checkpoint_manifest, Mapping):
        raise ValueError(
            f"{checkpoint_path}: present data_provenance is not bound to a sibling manifest"
        )
    if loss != "sibling-ranking":
        raise ValueError(
            f"{checkpoint_path}: sibling manifest provenance requires loss=sibling-ranking"
        )

    expected_manifest_fields = {
        "sha256": manifest_provenance["sha256"],
        "bytes": manifest_provenance["bytes"],
        "schema": manifest_provenance["schema"],
        "record_manifest_schema": manifest_provenance["record_manifest_schema"],
        "label_policy": manifest_provenance["label_policy"],
        "exact_rescore_mode": manifest_provenance["exact_rescore_mode"],
        "search_state_reset_before_proposal": manifest_provenance[
            "search_state_reset_before_proposal"
        ],
        "search_state_reset_before_each_candidate": manifest_provenance[
            "search_state_reset_before_each_candidate"
        ],
        "tt_reset_before_proposal": True,
        "tt_reset_before_each_candidate": True,
        "candidate_execution_order": manifest_provenance[
            "candidate_execution_order"
        ],
        "synthesized_rank_order": manifest_provenance["synthesized_rank_order"],
        "teacher_runtime_snapshot": manifest_provenance[
            "teacher_runtime_snapshot"
        ],
    }
    for field, expected in expected_manifest_fields.items():
        value = checkpoint_manifest.get(field)
        if type(value) is not type(expected) or value != expected:
            raise ValueError(
                f"{checkpoint_path}: checkpoint sibling manifest {field} "
                f"does not match evaluation manifest"
            )
    if checkpoint_manifest.get("verified_splits") != ["train", "val"]:
        raise ValueError(
            f"{checkpoint_path}: checkpoint sibling manifest was not verified against both splits"
        )
    checkpoint_pipeline = checkpoint_manifest.get("pipeline")
    expected_pipeline = manifest_provenance["pipeline"]
    if not isinstance(checkpoint_pipeline, Mapping) or dict(checkpoint_pipeline) != dict(
        expected_pipeline
    ):
        raise ValueError(
            f"{checkpoint_path}: checkpoint pipeline provenance does not match evaluation manifest"
        )

    expected_outputs = manifest_provenance["outputs"]
    checkpoint_outputs = checkpoint_manifest.get("outputs")
    if not isinstance(checkpoint_outputs, Mapping):
        raise ValueError(f"{checkpoint_path}: checkpoint manifest outputs are missing")
    for field, expected in expected_outputs.items():
        value = checkpoint_outputs.get(field)
        if type(value) is not type(expected) or value != expected:
            raise ValueError(
                f"{checkpoint_path}: checkpoint manifest output {field} does not match"
            )

    for role, output_prefix in (("train", "train"), ("validation", "val")):
        dataset = data_provenance.get(role)
        if not isinstance(dataset, Mapping):
            raise ValueError(f"{checkpoint_path}: checkpoint {role} provenance is missing")
        expected_bytes = expected_outputs[f"{output_prefix}_bytes"]
        expected_sha256 = expected_outputs[f"{output_prefix}_sha256"]
        if type(dataset.get("bytes")) is not int or dataset.get("bytes") != expected_bytes:
            raise ValueError(
                f"{checkpoint_path}: checkpoint {role} bytes do not match manifest"
            )
        if dataset.get("sha256") != expected_sha256:
            raise ValueError(
                f"{checkpoint_path}: checkpoint {role} sha256 does not match manifest"
            )
        requested_limit = dataset.get("requested_limit")
        if (
            dataset.get("selection") != "all"
            or type(requested_limit) is not int
            or requested_limit != 0
        ):
            raise ValueError(
                f"{checkpoint_path}: checkpoint {role} did not use the complete manifest split"
            )
        usable_rows = dataset.get("usable_rows")
        if type(usable_rows) is not int or usable_rows <= 0:
            raise ValueError(
                f"{checkpoint_path}: checkpoint {role} usable_rows is invalid"
            )

    return {
        "status": "verified_same_sibling_manifest",
        "manifest_sha256": manifest_provenance["sha256"],
        "pipeline_source_revision": manifest_provenance["pipeline"]["source_revision"],
        "train_sha256": expected_outputs["train_sha256"],
        "validation_sha256": expected_outputs["val_sha256"],
    }


def float_predictions(
    model: DistillNet,
    board: torch.Tensor,
    hands: torch.Tensor,
    bucket: torch.Tensor,
    k_sigmoid: float,
    batch_size: int,
) -> torch.Tensor:
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")
    chunks = []
    with torch.no_grad():
        for start in range(0, board.shape[0], batch_size):
            logits = model(
                board[start : start + batch_size],
                hands[start : start + batch_size],
                bucket[start : start + batch_size],
            )
            chunks.append(logits.to(dtype=torch.float64) * k_sigmoid)
    predictions = torch.cat(chunks)
    if not torch.isfinite(predictions).all():
        raise ValueError("model produced non-finite float predictions")
    return predictions


def quantized_predictions(
    model: DistillNet,
    board: torch.Tensor,
    hands: torch.Tensor,
    k_sigmoid: float,
) -> torch.Tensor:
    exporter = _load_export_module()
    qweights, _metadata = exporter.quantize(model, k_sigmoid)
    values = []
    for index in range(board.shape[0]):
        out_q = exporter.int_forward(
            qweights,
            board[index].tolist(),
            hands[index].tolist(),
            model.pad_idx,
        )
        values.append(production_cp_from_out_q(out_q, k_sigmoid))
    predictions = torch.tensor(values, dtype=torch.float64)
    if not torch.isfinite(predictions).all():
        raise ValueError("model produced non-finite quantized predictions")
    return predictions


def production_cp_from_out_q(out_q: int, k_sigmoid: float) -> int:
    """Mirror production WASM's single i64 division and clamp exactly."""
    if not isinstance(out_q, int):
        raise ValueError("quantized out_q must be an integer")
    if not math.isfinite(k_sigmoid):
        raise ValueError("sigmoid scale K must be finite")
    # wasmEngine.ts passes Math.trunc(scaleK) to the i32 setter.
    k_int = math.trunc(k_sigmoid)
    if k_int <= 0 or k_int > PRODUCTION_CP_LIMIT:
        raise ValueError("production sigmoid scale K must truncate into [1, 1000000]")
    product = out_q * k_int
    # Python // floors negatives; WASM i64 division truncates toward zero.
    cp = product // PRODUCTION_CP_DENOMINATOR if product >= 0 else -((-product) // PRODUCTION_CP_DENOMINATOR)
    return max(-PRODUCTION_CP_LIMIT, min(PRODUCTION_CP_LIMIT, cp))


def _eligible_pair_count(raw_child_cp: torch.Tensor, groups: Iterable[Sequence[int]], min_cp: float) -> int:
    total = 0
    for indices in groups:
        parent_cp = -raw_child_cp[torch.tensor(indices, dtype=torch.long)]
        for left in range(len(indices)):
            for right in range(left + 1, len(indices)):
                delta = abs(float(parent_cp[left] - parent_cp[right]))
                total += int(delta >= min_cp and delta != 0.0)
    return total


def calculate_metrics(
    predicted_child_cp: torch.Tensor,
    clamped_child_cp: torch.Tensor,
    raw_child_cp: torch.Tensor,
    metadata: Sequence[Mapping[str, Any]],
    pair_min_cp: float,
) -> dict[str, float]:
    """Value stays child-view; move-choice metrics flip to parent-view once."""
    if predicted_child_cp.shape != clamped_child_cp.shape:
        raise ValueError("prediction/target row count mismatch")
    difference = predicted_child_cp.to(torch.float64) - clamped_child_cp.to(torch.float64)
    mae = float(difference.abs().mean())
    mse = float(difference.square().mean())
    pair_accuracy, top1_accuracy = sibling_metrics(
        predicted_child_cp,
        raw_child_cp,
        metadata,
        pair_min_cp,
    )
    result = {
        "value_mae_cp": mae,
        "value_mse_cp2": mse,
        "within_parent_pair_accuracy": float(pair_accuracy),
        "teacher_top1_accuracy": float(top1_accuracy),
    }
    for field, value in result.items():
        if not math.isfinite(value):
            raise ValueError(f"metric {field} is non-finite; check --pair-min-cp and validation data")
    return result


def metric_delta(quantized: Mapping[str, float], floating: Mapping[str, float]) -> dict[str, float]:
    return {field: float(quantized[field] - floating[field]) for field in floating}


def evaluate_checkpoints(
    data_path: str,
    checkpoint_specs: Sequence[tuple[str, str]],
    *,
    sibling_manifest_path: str,
    pair_min_cp: float = DEFAULT_PAIR_MIN_CP,
    cp_clamp: int = DEFAULT_CP_CLAMP,
    batch_size: int = 4096,
    include_quantized: bool = True,
) -> dict[str, Any]:
    if pair_min_cp < 0 or not math.isfinite(pair_min_cp):
        raise ValueError("pair_min_cp must be finite and non-negative")
    if len({name for name, _path in checkpoint_specs}) != len(checkpoint_specs):
        raise ValueError("checkpoint names must be unique")
    if not checkpoint_specs:
        raise ValueError("at least one checkpoint is required")

    manifest_provenance = verify_sibling_manifest(
        sibling_manifest_path,
        val_path=data_path,
    )

    board, hands, bucket, clamped_cp, raw_cp, metadata, groups = load_validation_data(
        data_path, cp_clamp
    )
    data_bytes = os.path.getsize(data_path)
    data_sha256 = sha256_file(data_path)
    expected_output = manifest_provenance["outputs"]
    if (
        data_bytes != expected_output["val_bytes"]
        or data_sha256 != expected_output["val_sha256"]
    ):
        raise ValueError("validation dataset changed after sibling manifest verification")
    eligible_pairs = _eligible_pair_count(raw_cp, groups, pair_min_cp)
    if eligible_pairs == 0:
        raise ValueError(
            f"validation data has no unequal sibling pairs with |teacher delta| >= {pair_min_cp}cp"
        )

    models = []
    for name, checkpoint_path in checkpoint_specs:
        model, checkpoint, k_sigmoid, checkpoint_fingerprint = load_model(checkpoint_path)
        training_provenance = verify_checkpoint_training_provenance(
            checkpoint,
            manifest_provenance,
            checkpoint_path,
        )
        floating_predictions = float_predictions(
            model, board, hands, bucket, k_sigmoid, batch_size
        )
        floating = calculate_metrics(
            floating_predictions, clamped_cp, raw_cp, metadata, pair_min_cp
        )
        quantized = None
        if include_quantized:
            integer_predictions = quantized_predictions(model, board, hands, k_sigmoid)
            integer_metrics = calculate_metrics(
                integer_predictions, clamped_cp, raw_cp, metadata, pair_min_cp
            )
            quantized = {
                **integer_metrics,
                "delta_from_float": metric_delta(integer_metrics, floating),
            }
        models.append(
            {
                "name": name,
                "checkpoint": os.path.abspath(checkpoint_path),
                "checkpoint_sha256": checkpoint_fingerprint["sha256"],
                "checkpoint_bytes": checkpoint_fingerprint["bytes"],
                "checkpoint_epoch": checkpoint.get("epoch"),
                "training_provenance": training_provenance,
                "k_sigmoid": k_sigmoid,
                "production_k_int": math.trunc(k_sigmoid),
                "float": floating,
                "quantized_int16": quantized,
            }
        )

    report = {
        "schema": REPORT_SCHEMA,
        "data": {
            "path": os.path.abspath(data_path),
            "sha256": data_sha256,
            "bytes": data_bytes,
            "sibling_manifest_sha256": manifest_provenance["sha256"],
            "sibling_manifest_bytes": manifest_provenance["bytes"],
            "pipeline_source_revision": manifest_provenance["pipeline"][
                "source_revision"
            ],
            "teacher_runtime_snapshot": manifest_provenance[
                "teacher_runtime_snapshot"
            ],
            "sibling_manifest": manifest_provenance,
            "records": len(metadata),
            "parents": len(groups),
            "eligible_pairs": eligible_pairs,
            "pair_min_cp": float(pair_min_cp),
            "value_target": "clamped_child_cp",
            "value_cp_clamp": cp_clamp,
            "ranking_target": "unclamped_parent_cp_equals_negative_child_cp",
        },
        "models": models,
    }
    # Fail here rather than emitting JSON containing implementation-specific NaN.
    json.dumps(report, allow_nan=False)
    return report


def format_table(report: Mapping[str, Any]) -> str:
    data = report["data"]
    lines = [
        (
            f"data: records={data['records']} parents={data['parents']} "
            f"eligible_pairs={data['eligible_pairs']} min_cp={data['pair_min_cp']:g}"
        ),
        "model\tmode\ttraining_provenance\tMAE(cp)\tMSE(cp^2)\t"
        "pair_acc\tteacher_top1\tDelta_pair\tDelta_top1",
    ]
    for model in report["models"]:
        floating = model["float"]
        provenance_status = model["training_provenance"]["status"]
        lines.append(
            f"{model['name']}\tfloat\t{provenance_status}\t"
            f"{floating['value_mae_cp']:.3f}\t"
            f"{floating['value_mse_cp2']:.3f}\t"
            f"{floating['within_parent_pair_accuracy']:.6f}\t"
            f"{floating['teacher_top1_accuracy']:.6f}\t0.000000\t0.000000"
        )
        quantized = model["quantized_int16"]
        if quantized is not None:
            delta = quantized["delta_from_float"]
            lines.append(
                f"{model['name']}\tint16\t{provenance_status}\t"
                f"{quantized['value_mae_cp']:.3f}\t"
                f"{quantized['value_mse_cp2']:.3f}\t"
                f"{quantized['within_parent_pair_accuracy']:.6f}\t"
                f"{quantized['teacher_top1_accuracy']:.6f}\t"
                f"{delta['within_parent_pair_accuracy']:+.6f}\t"
                f"{delta['teacher_top1_accuracy']:+.6f}"
            )
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, help="pre-split sibling validation JSONL")
    parser.add_argument(
        "--sibling-manifest",
        required=True,
        help="v6-policy teacher manifest whose validation digest must match --data",
    )
    parser.add_argument(
        "--checkpoint",
        action="append",
        required=True,
        metavar="NAME=PATH",
        help="checkpoint to compare; repeat for every model",
    )
    parser.add_argument("--pair-min-cp", type=float, default=DEFAULT_PAIR_MIN_CP)
    parser.add_argument("--cp-clamp", type=int, default=DEFAULT_CP_CLAMP)
    parser.add_argument("--batch-size", type=int, default=4096)
    parser.add_argument("--no-quantized", action="store_true", help="skip int16 reference inference")
    parser.add_argument("--json", action="store_true", help="write machine-readable JSON to stdout")
    parser.add_argument("--json-out", help="also write machine-readable JSON to this path")
    args = parser.parse_args(argv)

    try:
        specs = parse_checkpoint_specs(args.checkpoint)
        if args.json_out:
            validate_json_output_path(
                args.json_out,
                args.data,
                specs,
                args.sibling_manifest,
            )
        report = evaluate_checkpoints(
            args.data,
            specs,
            sibling_manifest_path=args.sibling_manifest,
            pair_min_cp=args.pair_min_cp,
            cp_clamp=args.cp_clamp,
            batch_size=args.batch_size,
            include_quantized=not args.no_quantized,
        )
        serialized = json.dumps(
            report, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False
        )
        if args.json_out:
            atomic_write_json(args.json_out, serialized)
    except (OSError, RuntimeError, ValueError) as error:
        parser.error(str(error))

    print(serialized if args.json else format_table(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
