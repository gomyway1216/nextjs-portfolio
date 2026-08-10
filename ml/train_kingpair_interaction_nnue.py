#!/usr/bin/env python3
"""Run stage 1 of the fixed KingPair Interaction NNUE training pipeline.

This two-epoch run is an architecture/bootstrap checkpoint only.  It is never
eligible for deployment: the candidate gate is evaluated only after the same
model has continued on the preregistered corpus of at least ten million unique
teacher-labelled positions.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
import math
import os
from pathlib import Path
import random
import sys
import time

import torch
import torch.nn.functional as F

import train
from kingpair_interaction_nnue import KingPairInteractionNNUE


SCHEMA = "shogi-kingpair-interaction-bootstrap-result-v1"
SEED = 20260810
EPOCHS = 2
BATCH_SIZE = 1024
LEARNING_RATE = 1e-4
WEIGHT_DECAY = 1e-5
K_SIGMOID = 600.0
CP_CLAMP = 3000
RANK_WEIGHT = 0.25
RANK_PAIR_MIN = 50.0
RANK_PAIR_MAX = 600.0
RANK_MARGIN_CP = 50.0
RANK_SAMPLES_PER_BATCH = 8192
PRODUCTION_CHECKPOINT = Path.home() / ".codex" / "shogi-runs" / (
    "halfkp81-g3-full-all-seed42/epoch2.pt"
)
PRODUCTION_CHECKPOINT_SHA256 = (
    "c7d250ab808cd8719594dae5ed69c54bd1c978fe90cb479bd0ed06594bd1cff9"
)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sampled_rank_loss(
    outputs: torch.Tensor,
    cp: torch.Tensor,
    generator: torch.Generator,
    *,
    samples: int = RANK_SAMPLES_PER_BATCH,
) -> torch.Tensor | None:
    """Bounded random-pair ranking loss for one minibatch."""

    if outputs.ndim != 1 or cp.shape != outputs.shape:
        raise ValueError("rank loss expects matching one-dimensional tensors")
    count = outputs.shape[0]
    if count < 2 or samples <= 0:
        return None
    left = torch.randint(0, count, (samples,), generator=generator)
    right = torch.randint(0, count, (samples,), generator=generator)
    delta = cp[left] - cp[right]
    mask = (delta >= RANK_PAIR_MIN) & (delta <= RANK_PAIR_MAX)
    if not bool(mask.any()):
        return None
    left = left[mask].to(outputs.device)
    right = right[mask].to(outputs.device)
    margin = RANK_MARGIN_CP / K_SIGMOID
    return F.relu(margin - (outputs[left] - outputs[right])).mean()


def load_validation_metadata(path: Path) -> tuple[list[str], list[str | None]]:
    sources: list[str] = []
    parent_ids: list[str | None] = []
    with path.open("r", encoding="utf-8") as rows:
        for line in rows:
            record = json.loads(line)
            sources.append(record["source"])
            parent = record.get("parent_id")
            parent_ids.append(parent if isinstance(parent, str) and parent else None)
    return sources, parent_ids


def fixed_pair_indices(
    cp: torch.Tensor,
    indices: list[int],
    *,
    seed: int,
    samples: int = 200_000,
) -> tuple[torch.Tensor, torch.Tensor]:
    if len(indices) < 2:
        return torch.empty(0, dtype=torch.long), torch.empty(0, dtype=torch.long)
    generator = random.Random(seed)
    left: list[int] = []
    right: list[int] = []
    attempts = min(samples * 3, max(samples, len(indices) * 60))
    for _ in range(attempts):
        a = indices[generator.randrange(len(indices))]
        b = indices[generator.randrange(len(indices))]
        if a != b and abs(float(cp[a] - cp[b])) > 100.0:
            left.append(a)
            right.append(b)
            if len(left) >= samples:
                break
    return torch.tensor(left, dtype=torch.long), torch.tensor(right, dtype=torch.long)


def metric_report(
    outputs: torch.Tensor,
    cp: torch.Tensor,
    sources: list[str],
    parent_ids: list[str | None],
) -> dict[str, dict[str, float | int | None]]:
    if outputs.shape != cp.shape or len(sources) != outputs.shape[0]:
        raise ValueError("metric inputs have inconsistent lengths")
    source_indices: dict[str, list[int]] = defaultdict(list)
    for index, source in enumerate(sources):
        source_indices[source].append(index)

    result: dict[str, dict[str, float | int | None]] = {}
    for source, indices in sorted(source_indices.items()):
        idx = torch.tensor(indices, dtype=torch.long)
        source_out = outputs[idx]
        source_cp = cp[idx]
        mae = float((source_out * K_SIGMOID - source_cp).abs().mean())
        left, right = fixed_pair_indices(
            cp, indices, seed=SEED + int(hashlib.sha256(source.encode()).hexdigest()[:8], 16)
        )
        pair_accuracy = None
        if left.numel():
            agreement = ((outputs[left] - outputs[right]) * (cp[left] - cp[right])) > 0
            pair_accuracy = float(agreement.float().mean())

        groups: dict[str, list[int]] = defaultdict(list)
        for global_index in indices:
            parent = parent_ids[global_index]
            if parent:
                groups[parent].append(global_index)
        sibling_correct = sibling_total = top1_correct = top1_total = 0
        for group in groups.values():
            if len(group) < 2:
                continue
            group_idx = torch.tensor(group, dtype=torch.long)
            teacher = cp[group_idx]
            prediction = outputs[group_idx]
            for first in range(len(group)):
                for second in range(first + 1, len(group)):
                    delta = float(teacher[first] - teacher[second])
                    if abs(delta) < RANK_PAIR_MIN or delta == 0:
                        continue
                    sibling_correct += int(
                        delta * float(prediction[first] - prediction[second]) > 0
                    )
                    sibling_total += 1
            teacher_best = teacher == teacher.max()
            predicted_best = prediction == prediction.max()
            top1_correct += int(bool(torch.all(~predicted_best | teacher_best)))
            top1_total += 1

        result[source] = {
            "rows": len(indices),
            "mae_cp": mae,
            "pair_accuracy": pair_accuracy,
            "pair_samples": int(left.numel()),
            "sibling_pair_accuracy": (
                sibling_correct / sibling_total if sibling_total else None
            ),
            "sibling_pairs": sibling_total,
            "sibling_top1": top1_correct / top1_total if top1_total else None,
            "sibling_parents": top1_total,
        }
    return result


def evaluate_outputs(
    model,
    board: torch.Tensor,
    hands: torch.Tensor,
    buckets: torch.Tensor,
    *,
    device: torch.device,
    production: bool = False,
) -> torch.Tensor:
    model.eval()
    outputs = []
    with torch.no_grad():
        for offset in range(0, board.shape[0], 4096):
            if production:
                batch_board = board[offset : offset + 4096, 0].to(device)
                batch_hands = hands[offset : offset + 4096, 0].to(device)
                batch_buckets = buckets[offset : offset + 4096, 0].to(device)
            else:
                batch_board = board[offset : offset + 4096].to(device)
                batch_hands = hands[offset : offset + 4096].to(device)
                batch_buckets = buckets[offset : offset + 4096].to(device)
            output = model(batch_board, batch_hands, batch_buckets)
            if not bool(torch.isfinite(output).all()):
                raise RuntimeError("validation produced a non-finite output")
            outputs.append(output.cpu())
    return torch.cat(outputs)


def static_gate(baseline: dict, candidate: dict) -> dict:
    failures: list[str] = []
    total_rows = 0
    weighted_baseline_mae = weighted_candidate_mae = 0.0
    for source in sorted(candidate):
        before = baseline[source]
        after = candidate[source]
        rows = int(after["rows"])
        total_rows += rows
        weighted_baseline_mae += rows * float(before["mae_cp"])
        weighted_candidate_mae += rows * float(after["mae_cp"])
        if (
            after["pair_accuracy"] is not None
            and before["pair_accuracy"] is not None
            and float(after["pair_accuracy"]) < float(before["pair_accuracy"])
        ):
            failures.append(f"{source}: pair accuracy regressed")

        sibling_pairs = int(after["sibling_pairs"])
        if sibling_pairs:
            required_gain = 0.005 if source == "aoba-depth12-top4" else 0.002
            if float(after["sibling_pair_accuracy"]) < (
                float(before["sibling_pair_accuracy"]) + required_gain
            ):
                failures.append(f"{source}: sibling pair gain below {required_gain}")
            if float(after["sibling_top1"]) < float(before["sibling_top1"]):
                failures.append(f"{source}: sibling top1 regressed")

    baseline_mae = weighted_baseline_mae / total_rows
    candidate_mae = weighted_candidate_mae / total_rows
    if baseline_mae - candidate_mae < 10.0:
        failures.append("weighted validation MAE improved by less than 10cp")
    return {
        "status": "pass" if not failures else "fail",
        "weighted_baseline_mae_cp": baseline_mae,
        "weighted_candidate_mae_cp": candidate_mae,
        "mae_improvement_cp": baseline_mae - candidate_mae,
        "failures": failures,
    }


def atomic_checkpoint(path: Path, payload: dict) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    torch.save(payload, temporary)
    os.replace(temporary, path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--device", choices=("mps", "cpu"), default="mps")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    train_path = args.data_root / "train.jsonl"
    validation_path = args.data_root / "validation.jsonl"
    manifest_path = args.data_root / "manifest.json"
    for path in (train_path, validation_path, manifest_path, PRODUCTION_CHECKPOINT):
        if not path.is_file():
            raise SystemExit(f"missing required input: {path}")
    if file_sha256(PRODUCTION_CHECKPOINT) != PRODUCTION_CHECKPOINT_SHA256:
        raise SystemExit("production initializer checkpoint SHA mismatch")

    args.out.mkdir(parents=True, exist_ok=True)
    final_path = args.out / "kingpair-interaction-bootstrap.pt"
    result_path = args.out / "bootstrap-result.json"
    progress_path = args.out / "last-completed-epoch.pt"
    curve_path = args.out / "curve.jsonl"
    if final_path.exists() or result_path.exists():
        raise SystemExit("refusing to overwrite a completed training run")
    if progress_path.exists() and not args.resume:
        raise SystemExit("durable progress exists; use --resume")

    torch.manual_seed(SEED)
    random.seed(SEED)
    if args.device == "mps" and not torch.backends.mps.is_available():
        raise SystemExit("MPS is unavailable")
    device = torch.device(args.device)
    if device.type == "cpu":
        torch.set_num_threads(max(1, min(8, os.cpu_count() or 1)))

    print("[kingpair] loading training corpus", flush=True)
    train_tensors = train.load_dataset(
        str(train_path), K_SIGMOID, CP_CLAMP, features="halfkp-dual-factor"
    )
    print("[kingpair] loading validation corpus", flush=True)
    validation_tensors = train.load_dataset(
        str(validation_path), K_SIGMOID, CP_CLAMP, features="halfkp-dual-factor"
    )
    tb, th, ty, tcp, tbk = train_tensors
    vb, vh, _vy, vcp, vbk = validation_tensors
    validation_sources, validation_parents = load_validation_metadata(validation_path)
    if len(validation_sources) != vb.shape[0]:
        raise SystemExit("validation metadata/tensor length mismatch")

    production_payload = torch.load(
        PRODUCTION_CHECKPOINT, map_location="cpu", weights_only=True
    )
    production = train.DistillNet("halfkp-factor")
    production.load_state_dict(production_payload["model"], strict=True)
    production = production.to(device)
    baseline_outputs = evaluate_outputs(
        production, vb, vh, vbk, device=device, production=True
    )
    baseline_metrics = metric_report(
        baseline_outputs, vcp, validation_sources, validation_parents
    )
    del production, production_payload
    if device.type == "mps":
        torch.mps.empty_cache()

    model = KingPairInteractionNNUE().to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)
    start_epoch = 1
    if args.resume:
        durable = torch.load(progress_path, map_location="cpu", weights_only=False)
        model.load_state_dict(durable["model"], strict=True)
        optimizer.load_state_dict(durable["optimizer"])
        scheduler.load_state_dict(durable["scheduler"])
        start_epoch = int(durable["epoch"]) + 1
        if start_epoch > EPOCHS:
            raise SystemExit("durable checkpoint already completed every epoch")

    curve_rows = []
    if curve_path.exists():
        curve_rows = curve_path.read_text(encoding="utf-8").splitlines()
    n_train = tb.shape[0]
    print(
        f"[kingpair] start rows={n_train} validation={vb.shape[0]} "
        f"parameters={sum(p.numel() for p in model.parameters())} "
        f"device={device} epochs={EPOCHS} batch={BATCH_SIZE}",
        flush=True,
    )

    for epoch in range(start_epoch, EPOCHS + 1):
        started = time.time()
        model.train()
        permutation = torch.randperm(n_train, generator=torch.Generator().manual_seed(SEED + epoch))
        pair_generator = torch.Generator().manual_seed(SEED * 10 + epoch)
        total_loss = 0.0
        rows_seen = 0
        for step, offset in enumerate(range(0, n_train, BATCH_SIZE), start=1):
            selected = permutation[offset : offset + BATCH_SIZE]
            board = tb[selected].to(device)
            hands = th[selected].to(device)
            target = ty[selected].to(device)
            buckets = tbk[selected].to(device)
            output = model(board, hands, buckets)
            value_loss = F.mse_loss(torch.sigmoid(output), target)
            ranking = sampled_rank_loss(output, tcp[selected], pair_generator)
            loss = value_loss if ranking is None else value_loss + RANK_WEIGHT * ranking
            if not bool(torch.isfinite(loss)):
                raise SystemExit("training produced non-finite loss")
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            total_loss += float(loss.detach().cpu()) * selected.shape[0]
            rows_seen += selected.shape[0]
            if step % 200 == 0:
                print(
                    f"[kingpair] epoch={epoch}/{EPOCHS} step={step} "
                    f"rows={rows_seen}/{n_train} loss={total_loss / rows_seen:.6f}",
                    flush=True,
                )
        scheduler.step()
        candidate_outputs = evaluate_outputs(model, vb, vh, vbk, device=device)
        candidate_metrics = metric_report(
            candidate_outputs, vcp, validation_sources, validation_parents
        )
        gate = static_gate(baseline_metrics, candidate_metrics)
        elapsed = time.time() - started
        curve = {
            "epoch": epoch,
            "train_loss": total_loss / rows_seen,
            "seconds": elapsed,
            "learning_rate": scheduler.get_last_lr()[0],
            "gate": gate,
        }
        curve_rows.append(json.dumps(curve, sort_keys=True, allow_nan=False))
        train.atomic_write_text(str(curve_path), "\n".join(curve_rows) + "\n")
        atomic_checkpoint(
            progress_path,
            {
                "schema": SCHEMA,
                "epoch": epoch,
                "model": model.state_dict(),
                "optimizer": optimizer.state_dict(),
                "scheduler": scheduler.state_dict(),
                "recipe": {
                    "seed": SEED,
                    "epochs": EPOCHS,
                    "batch": BATCH_SIZE,
                    "learning_rate": LEARNING_RATE,
                    "weight_decay": WEIGHT_DECAY,
                    "rank_weight": RANK_WEIGHT,
                },
            },
        )
        print(
            f"[kingpair] epoch={epoch}/{EPOCHS} complete sec={elapsed:.1f} "
            f"mae_gain={gate['mae_improvement_cp']:.3f} gate={gate['status']}",
            flush=True,
        )

    checkpoint = {
        "schema": SCHEMA,
        "epoch": EPOCHS,
        "model": model.state_dict(),
        "architecture": {
            "name": model.features,
            "parameters": sum(parameter.numel() for parameter in model.parameters()),
            "deployment": model.deployment_contract(),
        },
        "recipe": {
            "seed": SEED,
            "epochs": EPOCHS,
            "batch": BATCH_SIZE,
            "learning_rate": LEARNING_RATE,
            "weight_decay": WEIGHT_DECAY,
            "k": K_SIGMOID,
            "cp_clamp": CP_CLAMP,
            "rank_weight": RANK_WEIGHT,
            "rank_pair_min": RANK_PAIR_MIN,
            "rank_pair_max": RANK_PAIR_MAX,
            "rank_margin_cp": RANK_MARGIN_CP,
        },
    }
    atomic_checkpoint(final_path, checkpoint)
    final_outputs = evaluate_outputs(model, vb, vh, vbk, device=device)
    candidate_metrics = metric_report(
        final_outputs, vcp, validation_sources, validation_parents
    )
    gate = static_gate(baseline_metrics, candidate_metrics)
    result = {
        "schema": SCHEMA,
        "status": "bootstrap-complete",
        "deployment_eligible": False,
        "next_required_stage": "reinitialize-same-architecture-for-10m-then-continue-to-50m",
        "data_manifest": {
            "path": str(manifest_path),
            "bytes": manifest_path.stat().st_size,
            "sha256": file_sha256(manifest_path),
        },
        "production_checkpoint": {
            "path": str(PRODUCTION_CHECKPOINT),
            "sha256": PRODUCTION_CHECKPOINT_SHA256,
        },
        "candidate_checkpoint": {
            "path": str(final_path),
            "bytes": final_path.stat().st_size,
            "sha256": file_sha256(final_path),
        },
        "baseline": baseline_metrics,
        "candidate": candidate_metrics,
        "diagnostic_only_static_gate": gate,
    }
    train.atomic_write_text(
        str(result_path), json.dumps(result, indent=2, sort_keys=True, allow_nan=False) + "\n"
    )
    print(
        f"[kingpair] complete checkpoint={result['candidate_checkpoint']['sha256']} "
        "deployment_gate=not-run-bootstrap-only",
        flush=True,
    )


if __name__ == "__main__":
    main()
