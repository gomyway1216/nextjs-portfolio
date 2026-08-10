#!/usr/bin/env python3
"""Fixed two-epoch streaming trainer for DPA-HalfKP96.

The input mix is an exposure contract, not a merged in-memory dataset: two
million compact legacy rows and eight million Aoba child rows are consumed per
epoch in a deterministic 1:4 schedule.  Aoba siblings keep their parent and
teacher identities so ranking loss is formed only within the same parent and
teacher.  There is no validation selection, alternate seed, warm initializer,
or best checkpoint.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
from typing import Callable, Iterator, Sequence

import torch
import torch.nn.functional as F

from dpa_halfkp96_nnue import (
    BOARD_FEATURES,
    DpaHalfkp96NNUE,
    PAD_INDEX,
)
from train import BOARD_FEATS, MAX_PIECES, parse_sfen_dual


SEED = 20260810
EPOCHS = 2
BATCH_SIZE = 1024
LEARNING_RATE = 5e-5
WEIGHT_DECAY = 1e-5
LEGACY_EXPOSURES = 2_000_000
FRESH_EXPOSURES = 8_000_000
PAIR_GAP_MIN_CP = 50.0
PAIR_GAP_MAX_CP = 600.0
FRESH_PARENT_SCHEMA = "shogi-kingpair-aoba-parent-label-v1"
CHECKPOINT_FAMILY = "dpa-halfkp96-scratch-v1"


class DpaTrainingError(ValueError):
    """A fixed input or training contract was violated."""


@dataclass(frozen=True)
class TrainingExample:
    sfen: str
    cp: int
    source: str
    parent_id: str | None = None
    teacher_id: str | None = None
    teacher_rank: int | None = None


@dataclass(frozen=True)
class TrainingBatch:
    board_indices: torch.Tensor
    hands: torch.Tensor
    buckets: torch.Tensor
    cp: torch.Tensor
    sources: tuple[str, ...]
    parent_ids: tuple[str | None, ...]
    teacher_ids: tuple[str | None, ...]


ExampleFactory = Callable[[int], Iterator[TrainingExample]]


def _strict_json(line: str, label: str) -> object:
    try:
        return json.loads(
            line,
            parse_constant=lambda value: (_ for _ in ()).throw(
                DpaTrainingError(f"{label}: non-finite JSON constant {value}")
            ),
        )
    except json.JSONDecodeError as error:
        raise DpaTrainingError(f"{label}: invalid JSON") from error


def _ordered_shards(root: Path, pattern: str, seed: int) -> list[Path]:
    if not root.is_dir():
        raise DpaTrainingError(f"missing shard root: {root}")
    paths = list(root.glob(pattern))
    if not paths:
        raise DpaTrainingError(f"no {pattern} shards under {root}")
    return sorted(
        paths,
        key=lambda path: hashlib.sha256(
            f"{seed}\0{path.name}".encode("utf-8")
        ).digest(),
    )


def iter_legacy_examples(root: Path, *, seed: int) -> Iterator[TrainingExample]:
    """Stream compact ``{sfen, cp}`` legacy shards without retaining rows."""

    for path in _ordered_shards(root, "legacy-*.jsonl", seed):
        with path.open("r", encoding="utf-8") as source:
            for line_number, line in enumerate(source, 1):
                record = _strict_json(line, f"{path}:{line_number}")
                if not isinstance(record, dict):
                    raise DpaTrainingError(
                        f"{path}:{line_number}: legacy row must be an object"
                    )
                sfen = record.get("sfen")
                cp = record.get("cp")
                if not isinstance(sfen, str) or type(cp) is not int:
                    raise DpaTrainingError(
                        f"{path}:{line_number}: legacy row needs string sfen and integer cp"
                    )
                yield TrainingExample(sfen=sfen, cp=cp, source="legacy")


def iter_aoba_examples(root: Path, *, seed: int) -> Iterator[TrainingExample]:
    """Stream child SFEN/CP rows from immutable Aoba parent-label shards."""

    for path in _ordered_shards(root, "teacher-*.jsonl", seed):
        with path.open("r", encoding="utf-8") as source:
            for line_number, line in enumerate(source, 1):
                record = _strict_json(line, f"{path}:{line_number}")
                if not isinstance(record, dict):
                    raise DpaTrainingError(
                        f"{path}:{line_number}: teacher row must be an object"
                    )
                if record.get("schema") != FRESH_PARENT_SCHEMA:
                    # Headers, exact-bound rejects, and footers are not
                    # examples. Technical failures are never encoded as a
                    # parent-label row and therefore cannot leak into training.
                    continue
                parent_id = record.get("position_id")
                engine = record.get("engine_sha256")
                evaluation = record.get("eval_sha256")
                moves = record.get("moves")
                if (
                    not isinstance(parent_id, str)
                    or not isinstance(engine, str)
                    or not isinstance(evaluation, str)
                    or not isinstance(moves, list)
                    or len(moves) < 2
                ):
                    raise DpaTrainingError(
                        f"{path}:{line_number}: malformed Aoba parent label"
                    )
                teacher_id = f"{engine}:{evaluation}"
                seen_ranks: set[int] = set()
                for move_offset, move in enumerate(moves):
                    if not isinstance(move, dict):
                        raise DpaTrainingError(
                            f"{path}:{line_number}: move {move_offset} is not an object"
                        )
                    sfen = move.get("child_sfen")
                    cp = move.get("teacher_child_cp")
                    rank = move.get("teacher_rank")
                    if (
                        not isinstance(sfen, str)
                        or type(cp) is not int
                        or type(rank) is not int
                        or rank <= 0
                        or rank in seen_ranks
                    ):
                        raise DpaTrainingError(
                            f"{path}:{line_number}: malformed Aoba child label"
                        )
                    seen_ranks.add(rank)
                    yield TrainingExample(
                        sfen=sfen,
                        cp=cp,
                        source="aoba-depth12-top4",
                        parent_id=parent_id,
                        teacher_id=teacher_id,
                        teacher_rank=rank,
                    )


def _exact_count(
    factory: ExampleFactory,
    count: int,
) -> Iterator[TrainingExample]:
    if type(count) is not int or count < 0:
        raise DpaTrainingError("exposure count must be a non-negative integer")
    source = iter(factory(0))
    for produced in range(count):
        try:
            yield next(source)
        except StopIteration as error:
            raise DpaTrainingError(
                f"exposure arm ended at {produced} rows; expected exactly {count}"
            ) from error
    try:
        next(source)
    except StopIteration:
        return
    raise DpaTrainingError(
        f"exposure arm contains more than the fixed {count} rows"
    )


def mixed_example_stream(
    legacy_factory: ExampleFactory,
    fresh_factory: ExampleFactory,
    *,
    legacy_exposures: int = LEGACY_EXPOSURES,
    fresh_exposures: int = FRESH_EXPOSURES,
) -> Iterator[TrainingExample]:
    """Yield the exact 20:80 exposure mix as one legacy then four fresh rows."""

    if fresh_exposures != legacy_exposures * 4:
        raise DpaTrainingError("the fixed exposure contract must be exactly 20:80")
    legacy = iter(_exact_count(legacy_factory, legacy_exposures))
    fresh = iter(_exact_count(fresh_factory, fresh_exposures))
    for _ in range(legacy_exposures):
        yield next(legacy)
        for _fresh_offset in range(4):
            yield next(fresh)
    # Resume each bounded iterator once so its exact-size postcondition runs.
    for arm in (legacy, fresh):
        try:
            next(arm)
        except StopIteration:
            pass


def collate_examples(
    examples: Sequence[TrainingExample],
    *,
    device: torch.device | str = "cpu",
) -> TrainingBatch:
    """Encode one bounded batch directly into MPS-compatible dense tensors."""

    if not examples:
        raise DpaTrainingError("cannot collate an empty batch")
    board_rows: list[list[list[int]]] = []
    hand_rows: list[list[list[float]]] = []
    bucket_rows: list[list[int]] = []
    for offset, example in enumerate(examples):
        try:
            views, hands, _black_to_move, buckets = parse_sfen_dual(example.sfen)
        except (IndexError, KeyError, TypeError, ValueError) as error:
            raise DpaTrainingError(
                f"batch row {offset}: unusable dual-perspective SFEN"
            ) from error
        encoded_views: list[list[int]] = []
        for view in range(2):
            encoded = [
                buckets[view] * BOARD_FEATS + feature
                for feature in views[view][:MAX_PIECES]
            ]
            encoded.extend([PAD_INDEX] * (MAX_PIECES - len(encoded)))
            encoded_views.append(encoded)
        board_rows.append(encoded_views)
        hand_rows.append(hands)
        bucket_rows.append(buckets)

    target = torch.device(device)
    return TrainingBatch(
        board_indices=torch.tensor(
            board_rows, dtype=torch.long, device=target
        ),
        hands=torch.tensor(hand_rows, dtype=torch.float32, device=target),
        buckets=torch.tensor(bucket_rows, dtype=torch.long, device=target),
        cp=torch.tensor(
            [example.cp for example in examples],
            dtype=torch.float32,
            device=target,
        ),
        sources=tuple(example.source for example in examples),
        parent_ids=tuple(example.parent_id for example in examples),
        teacher_ids=tuple(example.teacher_id for example in examples),
    )


def mixed_batch_stream(
    legacy_factory: ExampleFactory,
    fresh_factory: ExampleFactory,
    *,
    device: torch.device | str,
    batch_size: int = BATCH_SIZE,
    legacy_exposures: int = LEGACY_EXPOSURES,
    fresh_exposures: int = FRESH_EXPOSURES,
) -> Iterator[TrainingBatch]:
    if type(batch_size) is not int or batch_size <= 0:
        raise DpaTrainingError("batch_size must be positive")
    pending: list[TrainingExample] = []
    for example in mixed_example_stream(
        legacy_factory,
        fresh_factory,
        legacy_exposures=legacy_exposures,
        fresh_exposures=fresh_exposures,
    ):
        pending.append(example)
        if len(pending) == batch_size:
            yield collate_examples(pending, device=device)
            pending.clear()
    if pending:
        yield collate_examples(pending, device=device)


def same_parent_teacher_pair_ranking_loss(
    predictions: torch.Tensor,
    cp: torch.Tensor,
    parent_ids: Sequence[str | None],
    teacher_ids: Sequence[str | None],
) -> tuple[torch.Tensor, int]:
    """Pairwise logistic loss for teacher gaps in the fixed 50..600cp band."""

    if predictions.ndim != 1 or cp.shape != predictions.shape:
        raise DpaTrainingError("ranking predictions and cp must be matching vectors")
    if len(parent_ids) != predictions.shape[0] or len(teacher_ids) != len(parent_ids):
        raise DpaTrainingError("ranking metadata length differs from predictions")
    groups: dict[tuple[str, str], list[int]] = defaultdict(list)
    # Length equality is checked above. Avoid zip(strict=...) so the trainer
    # remains compatible with the project's PyTorch/MPS Python 3.9 runtime.
    for index, (parent, teacher) in enumerate(zip(parent_ids, teacher_ids)):
        if parent is not None and teacher is not None:
            groups[(parent, teacher)].append(index)

    losses: list[torch.Tensor] = []
    for indices in groups.values():
        for left_offset, left in enumerate(indices):
            for right in indices[left_offset + 1 :]:
                teacher_delta = float(cp[left].detach() - cp[right].detach())
                gap = abs(teacher_delta)
                if PAIR_GAP_MIN_CP <= gap <= PAIR_GAP_MAX_CP:
                    direction = 1.0 if teacher_delta > 0.0 else -1.0
                    predicted_delta = predictions[left] - predictions[right]
                    losses.append(F.softplus(-direction * predicted_delta))
    if not losses:
        return predictions.sum() * 0.0, 0
    return torch.stack(losses).mean(), len(losses)


def training_objective(
    predictions: torch.Tensor,
    batch: TrainingBatch,
) -> tuple[torch.Tensor, dict[str, float | int]]:
    value_loss = F.smooth_l1_loss(predictions, batch.cp)
    pair_loss, pairs = same_parent_teacher_pair_ranking_loss(
        predictions,
        batch.cp,
        batch.parent_ids,
        batch.teacher_ids,
    )
    total = value_loss + pair_loss
    return total, {
        "value_smooth_l1": float(value_loss.detach()),
        "pair_ranking": float(pair_loss.detach()),
        "rank_pairs": pairs,
    }


def _checkpoint_payload(
    model: DpaHalfkp96NNUE,
    optimizer: torch.optim.Optimizer,
    epoch: int,
) -> dict[str, object]:
    return {
        "family": CHECKPOINT_FAMILY,
        "seed": SEED,
        "epoch": epoch,
        "model": model.state_dict(),
        "optimizer": optimizer.state_dict(),
        "training": {
            "epochs": EPOCHS,
            "batch_size": BATCH_SIZE,
            "learning_rate": LEARNING_RATE,
            "weight_decay": WEIGHT_DECAY,
            "legacy_exposures": LEGACY_EXPOSURES,
            "fresh_exposures": FRESH_EXPOSURES,
            "value_loss": "smooth_l1",
            "pair_gap_cp": [PAIR_GAP_MIN_CP, PAIR_GAP_MAX_CP],
            "initializer": "scratch",
            "best_selection": False,
        },
        "deployment_contract": model.deployment_contract(),
    }


def save_checkpoint(
    path: Path,
    model: DpaHalfkp96NNUE,
    optimizer: torch.optim.Optimizer,
    epoch: int,
) -> None:
    """Create one epoch checkpoint without replacing any existing artifact."""

    if path.exists():
        raise FileExistsError(f"refusing to overwrite checkpoint: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        with temporary.open("xb") as target:
            torch.save(_checkpoint_payload(model, optimizer, epoch), target)
            target.flush()
            os.fsync(target.fileno())
        os.link(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def load_checkpoint(
    path: Path,
    model: DpaHalfkp96NNUE,
    optimizer: torch.optim.Optimizer | None = None,
) -> int:
    """Load a same-family checkpoint for audit/roundtrip purposes."""

    payload = torch.load(path, map_location="cpu", weights_only=False)
    if not isinstance(payload, dict) or payload.get("family") != CHECKPOINT_FAMILY:
        raise DpaTrainingError("checkpoint family mismatch")
    if payload.get("seed") != SEED or type(payload.get("epoch")) is not int:
        raise DpaTrainingError("checkpoint seed/epoch contract mismatch")
    if payload.get("deployment_contract") != model.deployment_contract():
        raise DpaTrainingError("checkpoint deployment contract mismatch")
    model.load_state_dict(payload["model"], strict=True)
    if optimizer is not None:
        optimizer.load_state_dict(payload["optimizer"])
    return payload["epoch"]


def restore_latest_epoch(
    output_root: Path,
    model: DpaHalfkp96NNUE,
    optimizer: torch.optim.Optimizer,
) -> int:
    """Resume only from the latest contiguous durable epoch checkpoint."""

    first = output_root / "epoch-01.pt"
    second = output_root / "epoch-02.pt"
    if second.exists() and not first.exists():
        raise DpaTrainingError("epoch-02 exists without durable epoch-01")
    latest = second if second.exists() else first if first.exists() else None
    if latest is None:
        return 0
    epoch = load_checkpoint(latest, model, optimizer)
    expected = 2 if latest == second else 1
    if epoch != expected:
        raise DpaTrainingError("checkpoint filename and epoch disagree")
    return epoch


def _resolve_device(name: str) -> torch.device:
    if name == "mps":
        if not torch.backends.mps.is_available():
            raise DpaTrainingError("MPS was requested but is unavailable")
        return torch.device("mps")
    if name == "cpu":
        return torch.device("cpu")
    raise DpaTrainingError("device must be mps or cpu")


def train(
    legacy_root: Path,
    fresh_root: Path,
    output_root: Path,
    *,
    device_name: str = "mps",
) -> None:
    """Execute the fixed run. Tests exercise its components, not this 10M run."""

    device = _resolve_device(device_name)
    torch.manual_seed(SEED)
    if device.type == "mps":
        torch.mps.manual_seed(SEED)
    model = DpaHalfkp96NNUE().to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY
    )
    completed_epoch = restore_latest_epoch(output_root, model, optimizer)
    if completed_epoch == EPOCHS:
        print(json.dumps({"epoch": EPOCHS, "status": "already-complete"}), flush=True)
        return

    for epoch in range(completed_epoch + 1, EPOCHS + 1):
        model.train()
        batches = examples_seen = rank_pairs = 0
        value_sum = pair_sum = 0.0

        def legacy_factory(cycle: int) -> Iterator[TrainingExample]:
            return iter_legacy_examples(
                legacy_root, seed=SEED + epoch * 10_000 + cycle
            )

        def fresh_factory(cycle: int) -> Iterator[TrainingExample]:
            return iter_aoba_examples(
                fresh_root, seed=SEED + epoch * 20_000 + cycle
            )

        for batch in mixed_batch_stream(
            legacy_factory,
            fresh_factory,
            device=device,
        ):
            optimizer.zero_grad(set_to_none=True)
            predictions = model(
                batch.board_indices, batch.hands, batch.buckets
            )
            loss, parts = training_objective(predictions, batch)
            if not bool(torch.isfinite(loss)):
                raise RuntimeError("DPA-HalfKP96 produced a non-finite loss")
            loss.backward()
            optimizer.step()
            batches += 1
            examples_seen += batch.cp.shape[0]
            rank_pairs += int(parts["rank_pairs"])
            value_sum += float(parts["value_smooth_l1"])
            pair_sum += float(parts["pair_ranking"])
            if batches % 100 == 0:
                print(
                    json.dumps(
                        {
                            "epoch": epoch,
                            "batches": batches,
                            "examples": examples_seen,
                            "rank_pairs": rank_pairs,
                        },
                        sort_keys=True,
                    ),
                    flush=True,
                )
        if examples_seen != LEGACY_EXPOSURES + FRESH_EXPOSURES:
            raise RuntimeError("epoch exposure count drifted from the fixed 10M")
        save_checkpoint(
            output_root / f"epoch-{epoch:02d}.pt", model, optimizer, epoch
        )
        print(
            json.dumps(
                {
                    "epoch": epoch,
                    "status": "complete",
                    "examples": examples_seen,
                    "batches": batches,
                    "rank_pairs": rank_pairs,
                    "mean_batch_value_smooth_l1": value_sum / batches,
                    "mean_batch_pair_ranking": pair_sum / batches,
                },
                sort_keys=True,
            ),
            flush=True,
        )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--legacy-root", type=Path, required=True)
    parser.add_argument("--fresh-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--device", choices=("mps", "cpu"), default="mps")
    args = parser.parse_args(argv)
    train(
        args.legacy_root,
        args.fresh_root,
        args.output_root,
        device_name=args.device,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
