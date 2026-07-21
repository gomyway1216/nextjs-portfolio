#!/usr/bin/env python3
"""Train one scratch NNUE directly on search-ranked sibling moves.

This is intentionally a small research lane.  It keeps the strict row and
train/validation leakage checks from ``train.py`` while omitting the historical
sealed six-run publication protocol.  The resulting checkpoint is never a
deployment authorization; it must win a direct engine match before promotion.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import tempfile
import time
from pathlib import Path

import torch
import torch.nn.functional as F

import train


RESULT_SCHEMA = "shogi-sibling-research-training-v1"


def _project_role(path: str, role: str, output_path: str) -> dict[str, object]:
    """Add a trusted external split role without relaxing sibling validation."""

    if role not in ("train", "val"):
        raise ValueError("role must be train or val")
    rows = 0
    digest = hashlib.sha256()
    source_bytes = 0
    with open(path, "rb") as source, open(output_path, "wb") as target:
        for physical_line, raw_line in enumerate(source, start=1):
            digest.update(raw_line)
            source_bytes += len(raw_line)
            if not raw_line.endswith(b"\n") or raw_line == b"\n":
                raise ValueError(
                    f"{path}: line {physical_line} must be one non-empty LF row"
                )
            record = train.strict_json_loads(
                raw_line[:-1], f"{path}: line {physical_line}"
            )
            if type(record) is not dict:
                raise ValueError(f"{path}: line {physical_line} must be an object")
            declared = record.get("split")
            if declared is not None and declared != role:
                raise ValueError(
                    f"{path}: line {physical_line} declares split={declared!r}, "
                    f"expected {role!r}"
                )
            projected = {**record, "split": role}
            target.write(
                json.dumps(
                    projected,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                    allow_nan=False,
                ).encode("utf-8")
                + b"\n"
            )
            rows += 1
    if rows == 0:
        raise ValueError(f"{path}: dataset is empty")
    return {
        "source": {
            "path": os.path.abspath(path),
            "bytes": source_bytes,
            "sha256": digest.hexdigest(),
        },
        "projected_rows": rows,
    }


def load_role_bound_dataset(
    path: str,
    role: str,
    *,
    k_sigmoid: float,
    cp_clamp: int,
    features: str,
):
    """Strict-load every row after binding the externally owned data role."""

    descriptor, projected_path = tempfile.mkstemp(
        prefix=f"shogi-sibling-{role}-", suffix=".jsonl"
    )
    os.close(descriptor)
    try:
        projection = _project_role(path, role, projected_path)
        loaded = train.load_dataset_with_metadata(
            projected_path,
            k_sigmoid,
            cp_clamp,
            0,
            features,
            strict=True,
            include_fingerprint=True,
        )
        if int(loaded[2].shape[0]) != projection["projected_rows"]:
            raise ValueError(f"{path}: strict loader did not consume every row")
        return (*loaded[:6], projection)
    finally:
        try:
            os.unlink(projected_path)
        except FileNotFoundError:
            pass


def _evaluate(
    model,
    board,
    hands,
    targets,
    raw_cp,
    bucket,
    metadata,
    device,
    k,
    pair_min,
):
    model.eval()
    predictions = []
    total_loss = 0.0
    total_mae = 0.0
    count = 0
    with torch.no_grad():
        for start in range(0, targets.shape[0], 4096):
            end = start + 4096
            output = model(
                board[start:end].to(device),
                hands[start:end].to(device),
                bucket[start:end].to(device),
            )
            target = targets[start:end].to(device)
            total_loss += F.mse_loss(
                torch.sigmoid(output), target, reduction="sum"
            ).item()
            target_logit = torch.logit(target.clamp(1e-6, 1 - 1e-6))
            total_mae += (output - target_logit).abs().sum().item() * k
            count += int(target.shape[0])
            predictions.append(output.cpu())
    output = torch.cat(predictions)
    sibling_pair, sibling_top1 = train.sibling_metrics(
        output, raw_cp, metadata, pair_min
    )
    metrics = {
        "value_loss": total_loss / count,
        "value_mae_cp": total_mae / count,
        "sibling_pair_accuracy": sibling_pair,
        "sibling_top1_accuracy": sibling_top1,
    }
    if not all(math.isfinite(value) for value in metrics.values()):
        raise ValueError("validation produced a non-finite metric")
    return metrics


def _validate_hyperparameters(args: argparse.Namespace) -> None:
    finite_positive = {
        "lr": args.lr,
        "k": args.k,
        "policy_temp_cp": args.policy_temp_cp,
    }
    for name, value in finite_positive.items():
        if type(value) not in (int, float) or not math.isfinite(value) or value <= 0:
            raise ValueError(f"{name} must be finite and positive")
    finite_nonnegative = {
        "rank_weight": args.rank_weight,
        "rank_pair_min": args.rank_pair_min,
        "rank_pair_max": args.rank_pair_max,
        "rank_margin_cp": args.rank_margin_cp,
        "policy_weight": args.policy_weight,
    }
    for name, value in finite_nonnegative.items():
        if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
            raise ValueError(f"{name} must be finite and non-negative")
    if args.rank_pair_max < args.rank_pair_min:
        raise ValueError("rank_pair_max must be at least rank_pair_min")
    if args.rank_weight > 0 and args.rank_pair_max <= 0:
        raise ValueError("positive rank_weight requires a positive rank_pair_max")
    if args.rank_weight == 0 and args.policy_weight == 0:
        raise ValueError("rank_weight and policy_weight cannot both be zero")
    if type(args.cp_clamp) is not int or args.cp_clamp <= 0:
        raise ValueError("cp_clamp must be a positive integer")


def _eligible_pair_count(
    child_cp, groups, pair_min: float, pair_max: float | None = None
) -> int:
    count = 0
    for group in groups:
        values = child_cp[torch.tensor(group, dtype=torch.long)]
        for left in range(len(group)):
            for right in range(left + 1, len(group)):
                difference = abs(float(values[left] - values[right]))
                count += int(
                    difference >= pair_min
                    and difference > 0
                    and (pair_max is None or difference <= pair_max)
                )
    return count


def _validate_split_metadata(train_meta, val_meta):
    try:
        train.validate_disjoint_splits(train_meta, val_meta)
        train_groups = train.validate_sibling_metadata(train_meta, "train")
        val_groups = train.validate_sibling_metadata(val_meta, "val")
    except SystemExit as error:
        raise ValueError(str(error)) from error
    return train_groups, val_groups


def run(args: argparse.Namespace) -> dict[str, object]:
    if os.path.exists(args.out):
        raise ValueError(f"output already exists: {args.out}")
    if args.epochs < 1 or args.batch < 2:
        raise ValueError("epochs must be positive and batch must be at least two")
    _validate_hyperparameters(args)
    halfkp_lift_init = getattr(args, "halfkp_lift_init", "")
    if args.features not in (
        "board",
        "kp",
        "kp-factor",
        "halfkp",
        "halfkp-factor",
    ):
        raise ValueError("unsupported feature mode")
    if halfkp_lift_init and args.features != "halfkp-factor":
        raise ValueError("halfkp_lift_init requires halfkp-factor features")
    if args.device == "auto":
        device = (
            "cuda"
            if torch.cuda.is_available()
            else "mps"
            if torch.backends.mps.is_available()
            else "cpu"
        )
    else:
        device = args.device
    if device == "mps" and not torch.backends.mps.is_available():
        raise ValueError("MPS was requested but is unavailable")
    if device == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA was requested but is unavailable")

    torch.manual_seed(args.seed)
    random.seed(args.seed)
    if args.torch_threads:
        torch.set_num_threads(args.torch_threads)

    train_loaded = load_role_bound_dataset(
        args.data,
        "train",
        k_sigmoid=args.k,
        cp_clamp=args.cp_clamp,
        features=args.features,
    )
    val_loaded = load_role_bound_dataset(
        args.val_data,
        "val",
        k_sigmoid=args.k,
        cp_clamp=args.cp_clamp,
        features=args.features,
    )
    tb, th, ty, _tcp, tbk, train_meta, train_provenance = train_loaded
    vb, vh, vy, _vcp, vbk, val_meta, val_provenance = val_loaded
    train_groups, val_groups = _validate_split_metadata(train_meta, val_meta)
    train_cp = train.raw_sibling_cp(train_meta)
    val_cp = train.raw_sibling_cp(val_meta)
    eligible_train_pairs = _eligible_pair_count(
        train_cp, train_groups, args.rank_pair_min, args.rank_pair_max
    )
    if args.rank_weight > 0 and eligible_train_pairs == 0:
        raise ValueError("training has no eligible sibling ranking pair")
    eligible_val_pairs = _eligible_pair_count(
        val_cp, val_groups, args.rank_pair_min
    )
    if eligible_val_pairs == 0:
        raise ValueError("validation has no eligible sibling ranking pair")

    model = train.DistillNet(args.features)
    initializer = None
    if halfkp_lift_init:
        initializer = train.load_halfkp_lift_initializer(
            model,
            halfkp_lift_init,
            k_sigmoid=args.k,
            allow_legacy=getattr(args, "allow_legacy_init", False),
        )
    model = model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=args.epochs
    )
    arch = train.expected_arch(
        features=args.features,
        input_dim=model.board_feats + model.hand_feats,
        h1=train.DistillNet.H1,
        h2=train.DistillNet.H2,
        k=args.k,
        kp_buckets=model.bucket_count,
    )
    Path(args.out).mkdir(parents=True)
    best_key = (float("-inf"), float("-inf"), float("-inf"))
    best_epoch = 0
    curve = []
    training_mode = (
        "live-exact-halfkp-lift-sibling-research"
        if initializer is not None
        else "scratch-search-ranked-sibling-research"
    )

    if initializer is not None:
        metrics = _evaluate(
            model,
            vb,
            vh,
            vy,
            val_cp,
            vbk,
            val_meta,
            device,
            args.k,
            args.rank_pair_min,
        )
        best_key = train.sibling_selection_key(
            metrics["sibling_pair_accuracy"],
            metrics["sibling_top1_accuracy"],
            metrics["value_loss"],
        )
        initial_checkpoint = {
            "model": model.state_dict(),
            "epoch": 0,
            "arch": arch,
            "args": vars(args),
            "validation": metrics,
            "selection": "sibling-pair, sibling-top1, value-loss",
            "training_mode": training_mode,
            "initializer": initializer,
            "rows": {"train": int(ty.shape[0]), "val": int(vy.shape[0])},
            "parents": {"train": len(train_groups), "val": len(val_groups)},
            "sources": {"train": train_provenance, "val": val_provenance},
        }
        train.require_finite_model_parameters(model, "HalfKP lift initializer")
        train.atomic_torch_save(initial_checkpoint, os.path.join(args.out, "best.pt"))
        train.atomic_torch_save(initial_checkpoint, os.path.join(args.out, "last.pt"))
        initial_row = {"epoch": 0, "train_loss": None, **metrics, "seconds": 0.0}
        curve.append(initial_row)
        print(json.dumps(initial_row, sort_keys=True), flush=True)

    for epoch in range(1, args.epochs + 1):
        started = time.monotonic()
        model.train()
        generator = torch.Generator().manual_seed(args.seed + epoch)
        loss_sum = 0.0
        row_count = 0
        for selection, group_sizes in train.grouped_batches(
            train_groups, args.batch, generator
        ):
            board = tb[selection].to(device)
            hands = th[selection].to(device)
            targets = ty[selection].to(device)
            bucket = tbk[selection].to(device)
            child_cp = train_cp[selection].to(device)
            output = model(board, hands, bucket)
            loss = train.sibling_full_task_loss(
                output,
                targets,
                child_cp,
                group_sizes,
                k_sigmoid=args.k,
                rank_weight=args.rank_weight,
                rank_pair_min=args.rank_pair_min,
                rank_pair_max=args.rank_pair_max,
                rank_margin_cp=args.rank_margin_cp,
                policy_weight=args.policy_weight,
                policy_temp_cp=args.policy_temp_cp,
            )
            if not torch.isfinite(loss):
                raise ValueError("training produced a non-finite loss")
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            loss_sum += loss.item() * int(selection.shape[0])
            row_count += int(selection.shape[0])
        scheduler.step()

        metrics = _evaluate(
            model,
            vb,
            vh,
            vy,
            val_cp,
            vbk,
            val_meta,
            device,
            args.k,
            args.rank_pair_min,
        )
        current_key = train.sibling_selection_key(
            metrics["sibling_pair_accuracy"],
            metrics["sibling_top1_accuracy"],
            metrics["value_loss"],
        )
        checkpoint = {
            "model": model.state_dict(),
            "epoch": epoch,
            "arch": arch,
            "args": vars(args),
            "validation": metrics,
            "selection": "sibling-pair, sibling-top1, value-loss",
            "training_mode": training_mode,
            "initializer": initializer,
            "rows": {"train": int(ty.shape[0]), "val": int(vy.shape[0])},
            "parents": {"train": len(train_groups), "val": len(val_groups)},
            "sources": {"train": train_provenance, "val": val_provenance},
        }
        train.require_finite_model_parameters(model, f"epoch {epoch} candidate")
        train.atomic_torch_save(checkpoint, os.path.join(args.out, "last.pt"))
        if current_key > best_key:
            best_key = current_key
            best_epoch = epoch
            train.atomic_torch_save(checkpoint, os.path.join(args.out, "best.pt"))
        row = {
            "epoch": epoch,
            "train_loss": loss_sum / row_count,
            **metrics,
            "seconds": time.monotonic() - started,
        }
        curve.append(row)
        print(json.dumps(row, sort_keys=True), flush=True)

    result = {
        "schema": RESULT_SCHEMA,
        "status": "complete-research-candidate-not-authorized-for-live",
        "device": device,
        "seed": args.seed,
        "features": args.features,
        "rows": {"train": int(ty.shape[0]), "val": int(vy.shape[0])},
        "parents": {"train": len(train_groups), "val": len(val_groups)},
        "eligible_training_pairs": eligible_train_pairs,
        "eligible_validation_pairs": eligible_val_pairs,
        "sources": {"train": train_provenance, "val": val_provenance},
        "initializer": initializer,
        "best_epoch": best_epoch,
        "best_selection_key": list(best_key),
        "curve": curve,
        "live_weight_changed": False,
        "required_next_gate": "direct-paired-engine-match-against-live",
        "trust_boundary": (
            "rows are strictly schema/SFEN/rank validated; parent-to-child move "
            "legality remains an invariant of the recorded teacher generator"
        ),
    }
    train.atomic_write_text(
        os.path.join(args.out, "result.json"),
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
    )
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    parser.add_argument("--val-data", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch", type=int, default=256)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--k", type=float, default=600.0)
    parser.add_argument("--cp-clamp", type=int, default=3000)
    parser.add_argument("--device", choices=("auto", "cpu", "mps", "cuda"), default="auto")
    parser.add_argument("--torch-threads", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--features",
        choices=("board", "kp", "kp-factor", "halfkp", "halfkp-factor"),
        default="board",
    )
    parser.add_argument(
        "--halfkp-lift-init",
        default="",
        help=(
            "lift an audited one-bucket board checkpoint into halfkp-factor "
            "shared weights with zero bucket deltas before research training"
        ),
    )
    parser.add_argument(
        "--allow-legacy-init",
        action="store_true",
        help="allow only the audited missing-schema inference for HalfKP lift",
    )
    parser.add_argument("--rank-weight", type=float, default=1.0)
    parser.add_argument("--rank-pair-min", type=float, default=50.0)
    parser.add_argument("--rank-pair-max", type=float, default=600.0)
    parser.add_argument("--rank-margin-cp", type=float, default=50.0)
    parser.add_argument("--policy-weight", type=float, default=0.25)
    parser.add_argument("--policy-temp-cp", type=float, default=200.0)
    args = parser.parse_args()
    try:
        run(args)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"[sibling-research] STOP: {error}", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
