"""Real local metric adapters for the post-selection strength gates.

The public functions in this module do no registry or authorization work.
They accept already-resolved, content-addressed local artifacts from
``strength_first_downstream_execution.py`` and reuse the existing strict JSON
and SFEN validation, checkpoint loader, production-int16 forward path, and
metric implementation. Torch is imported only when a real evaluation is
requested, so the standard-library control-plane tests remain dependency-free.
"""

from __future__ import annotations

import array
from collections.abc import Mapping
import hashlib
import importlib.util
import math
import os
from pathlib import Path
import re
import stat
import sys
from types import ModuleType
from typing import Any


CP_CLAMP = 3_000
PAIR_MIN_CP = 50.0
DECISIVE_CP = 1_500.0
DECISIVE_PAIR_MIN_CP = 100.0
RETENTION_PAIR_COUNT = 400_000
RETENTION_PAIR_SEED = 43
LEGACY_MATE_SCORE_CP = 30_000
LEGACY_MAX_MATE_DISTANCE = 1_000
BATCH_SIZE = 4_096
NNUE_WEIGHTS_BYTES = 1_185_988
EXPORT_WEIGHTS_SOURCE_BYTES = 9_729
EXPORT_WEIGHTS_SOURCE_SHA256 = (
    "04bb66fd9c2747a2cdda21f0823e44cae5bd45de6ac7d1fdb749d0aa73604099"
)
_CHECKPOINT_FIELDS = {"path", "bytes", "sha256", "schema"}
_DATASET_ROLES = (
    "fresh_final_holdout",
    "legacy_final_holdout",
    "general_retention",
    "opening_retention",
)
_LEGACY_RETENTION_REQUIRED_FIELDS = frozenset(
    {"sfen", "cp", "ply", "bestmove", "depth"}
)
_LEGACY_RETENTION_OPTIONAL_FIELDS = frozenset({"mate"})
_USI_MOVE_RE = re.compile(r"(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])\Z")


def _load_module(name: str, filename: str) -> ModuleType:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise ValueError(f"cannot load downstream evaluator dependency: {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _sha256(value: Any, label: str) -> str:
    if (
        type(value) is not str
        or len(value) != 64
        or value == "0" * 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise ValueError(f"{label} is not a lowercase SHA-256")
    return value


def _identity(value: Mapping[str, Any], label: str) -> dict[str, Any]:
    if (
        type(value) is not dict
        or set(value) != _CHECKPOINT_FIELDS
        or type(value["path"]) is not str
        or not value["path"]
        or type(value["bytes"]) is not int
        or value["bytes"] < 1
        or type(value["schema"]) is not str
        or not value["schema"]
    ):
        raise ValueError(f"{label} identity is invalid")
    _sha256(value["sha256"], f"{label} SHA-256")
    return dict(value)


def _require_fingerprint(
    observed: Mapping[str, Any],
    identity: Mapping[str, Any],
    label: str,
) -> None:
    if (
        type(observed) is not dict
        or observed.get("bytes") != identity["bytes"]
        or observed.get("sha256") != identity["sha256"]
    ):
        raise ValueError(f"{label} identity mismatch")


def _read_exact_file(
    path: str,
    identity: Mapping[str, Any],
    label: str,
) -> bytes:
    descriptor = -1
    try:
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(path, flags)
        before = os.fstat(descriptor)
        if (
            not stat.S_ISREG(before.st_mode)
            or before.st_nlink != 1
            or before.st_size != identity["bytes"]
        ):
            raise ValueError(f"{label} identity mismatch")
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            value = source.read(identity["bytes"] + 1)
        after = os.fstat(descriptor)
        current_path = os.stat(path, follow_symlinks=False)
    except OSError as error:
        raise ValueError(f"{label} cannot be read") from error
    finally:
        if descriptor >= 0:
            os.close(descriptor)
    if (
        len(value) != identity["bytes"]
        or hashlib.sha256(value).hexdigest() != identity["sha256"]
        or (
            before.st_dev,
            before.st_ino,
            before.st_nlink,
            before.st_size,
            before.st_mtime_ns,
            before.st_ctime_ns,
        )
        != (
            after.st_dev,
            after.st_ino,
            after.st_nlink,
            after.st_size,
            after.st_mtime_ns,
            after.st_ctime_ns,
        )
        or not stat.S_ISREG(current_path.st_mode)
        or current_path.st_nlink != 1
        or current_path.st_size != identity["bytes"]
        or (current_path.st_dev, current_path.st_ino)
        != (after.st_dev, after.st_ino)
    ):
        raise ValueError(f"{label} identity mismatch")
    return value


def _serialized_quantized_weights(
    exporter: ModuleType, model, k_sigmoid: float
) -> bytes:
    quantized, _ = exporter.quantize(model, k_sigmoid)
    chunks: list[bytes] = []
    for name, typecode in (
        ("w1_board", "h"),
        ("w1_hand", "h"),
        ("b1", "i"),
        ("w2", "h"),
        ("b2", "i"),
        ("w3", "h"),
        ("b3", "i"),
    ):
        values = array.array(typecode, quantized[name].flatten().tolist())
        expected_itemsize = 2 if typecode == "h" else 4
        if values.itemsize != expected_itemsize:
            raise ValueError("host integer layout cannot reproduce NNUE weights")
        if sys.byteorder == "big":
            values.byteswap()
        chunks.append(values.tobytes())
    return b"".join(chunks)


def _load_exact_model(
    evaluator: ModuleType,
    path: str,
    identity: Mapping[str, Any],
    *,
    epoch: int,
    label: str,
):
    model, checkpoint, k_sigmoid, fingerprint = evaluator.load_model(path)
    _require_fingerprint(fingerprint, identity, label)
    if (
        not isinstance(checkpoint, Mapping)
        or checkpoint.get("epoch") != epoch
        or type(k_sigmoid) not in (int, float)
        or not math.isfinite(k_sigmoid)
        or float(k_sigmoid) != 600.0
    ):
        raise ValueError(f"{label} metadata mismatch")
    return model, float(k_sigmoid)


def verify_checkpoint_weight_exports(
    *,
    candidate_checkpoint_path: str,
    candidate_checkpoint: Mapping[str, Any],
    candidate_weights_path: str,
    candidate_weights: Mapping[str, Any],
    stable_checkpoint_path: str,
    stable_checkpoint: Mapping[str, Any],
    stable_weights_path: str,
    stable_weights: Mapping[str, Any],
    evaluator: ModuleType | None = None,
    exporter: ModuleType | None = None,
) -> dict[str, Any]:
    """Reproduce both int16 files byte-for-byte from the enrolled checkpoints."""

    exporter_source = Path(__file__).with_name("export-weights.py")
    exporter_source_raw = exporter_source.read_bytes()
    if (
        len(exporter_source_raw) != EXPORT_WEIGHTS_SOURCE_BYTES
        or hashlib.sha256(exporter_source_raw).hexdigest()
        != EXPORT_WEIGHTS_SOURCE_SHA256
    ):
        raise ValueError("production int16 exporter source identity mismatch")
    eval_module = evaluator or _load_module(
        "strength_first_downstream_real_eval",
        "eval-sibling.py",
    )
    export_module = exporter or eval_module._load_export_module()
    pairs = (
        (
            "candidate",
            candidate_checkpoint_path,
            _identity(candidate_checkpoint, "candidate checkpoint"),
            20,
            candidate_weights_path,
            _identity(candidate_weights, "candidate weights"),
        ),
        (
            "stable",
            stable_checkpoint_path,
            _identity(stable_checkpoint, "stable checkpoint"),
            27,
            stable_weights_path,
            _identity(stable_weights, "stable weights"),
        ),
    )
    verified = {}
    for (
        label,
        checkpoint_path,
        checkpoint_identity,
        epoch,
        weights_path,
        weights_identity,
    ) in pairs:
        # Snapshot both source and target before any model deserialization.
        # The evaluator rechecks the checkpoint fingerprint while loading it;
        # the final reads below reject a path swap during reproduction.
        checkpoint_snapshot = _read_exact_file(
            checkpoint_path,
            checkpoint_identity,
            f"{label} checkpoint",
        )
        enrolled = _read_exact_file(
            weights_path,
            weights_identity,
            f"{label} weights",
        )
        model, k_sigmoid = _load_exact_model(
            eval_module,
            checkpoint_path,
            checkpoint_identity,
            epoch=epoch,
            label=f"{label} checkpoint",
        )
        reproduced = _serialized_quantized_weights(
            export_module,
            model,
            k_sigmoid,
        )
        if len(enrolled) != NNUE_WEIGHTS_BYTES or reproduced != enrolled:
            raise ValueError(
                f"{label} weights are not the byte-exact checkpoint export"
            )
        if (
            _read_exact_file(
                checkpoint_path,
                checkpoint_identity,
                f"{label} checkpoint after export",
            )
            != checkpoint_snapshot
            or _read_exact_file(
                weights_path,
                weights_identity,
                f"{label} weights after export",
            )
            != enrolled
        ):
            raise ValueError(f"{label} export inputs changed during reproduction")
        verified[label] = {
            "checkpoint_sha256": checkpoint_identity["sha256"],
            "weights_sha256": weights_identity["sha256"],
            "weights_bytes": len(enrolled),
        }
    return {
        "status": "candidate-and-stable-int16-exports-byte-exact",
        "exporter": {
            "path": "ml/export-weights.py",
            "bytes": EXPORT_WEIGHTS_SOURCE_BYTES,
            "sha256": EXPORT_WEIGHTS_SOURCE_SHA256,
            "schema": "shogi-production-int16-export-source-v1",
        },
        "models": verified,
    }


def _retention_metrics(
    *,
    evaluator: ModuleType,
    trainer: ModuleType,
    path: str,
    identity: Mapping[str, Any],
    label: str,
    candidate_model,
    candidate_k: float,
    stable_model,
    stable_k: float,
    torch_module,
) -> dict[str, dict[str, float]]:
    board, hands, raw_cp = _load_legacy_retention_dataset(
        trainer=trainer,
        path=path,
        identity=identity,
        label=label,
        torch_module=torch_module,
    )
    if (
        raw_cp.numel() < 2
        or not torch_module.isfinite(raw_cp).all()
        or not torch_module.isfinite(hands).all()
    ):
        raise ValueError("retention dataset row accounting is invalid")

    generator = torch_module.Generator().manual_seed(RETENTION_PAIR_SEED)
    first = torch_module.randint(
        0,
        raw_cp.shape[0],
        (RETENTION_PAIR_COUNT,),
        generator=generator,
    )
    second = torch_module.randint(
        0,
        raw_cp.shape[0],
        (RETENTION_PAIR_COUNT,),
        generator=generator,
    )
    truth_difference = raw_cp[first] - raw_cp[second]
    ordinary = truth_difference.abs() > DECISIVE_PAIR_MIN_CP
    decisive = (
        ordinary
        & (raw_cp[first].abs() > DECISIVE_CP)
        & (raw_cp[second].abs() > DECISIVE_CP)
    )
    if int(ordinary.sum().item()) < 1 or int(decisive.sum().item()) < 1:
        raise ValueError("retention dataset has no eligible deterministic pair")

    results: dict[str, dict[str, float]] = {}
    for name, model, k_sigmoid in (
        ("candidate", candidate_model, candidate_k),
        ("stable", stable_model, stable_k),
    ):
        predicted = evaluator.quantized_predictions(
            model,
            board,
            hands,
            k_sigmoid,
        )
        if not torch_module.isfinite(predicted).all():
            raise ValueError("retention model produced non-finite predictions")
        error = (
            predicted.to(torch_module.float64)
            - raw_cp.clamp(-CP_CLAMP, CP_CLAMP).to(torch_module.float64)
        ).abs()
        predicted_difference = predicted[first] - predicted[second]
        pair_accuracy = float(
            ((predicted_difference[ordinary] * truth_difference[ordinary]) > 0.0)
            .to(torch_module.float64)
            .mean()
            .item()
        )
        decisive_pair_accuracy = float(
            ((predicted_difference[decisive] * truth_difference[decisive]) > 0.0)
            .to(torch_module.float64)
            .mean()
            .item()
        )
        value_mae_cp = float(error.mean().item())
        if not all(
            math.isfinite(value)
            for value in (
                value_mae_cp,
                pair_accuracy,
                decisive_pair_accuracy,
            )
        ):
            raise ValueError("retention metric is non-finite")
        results[name] = {
            "value_mae_cp": value_mae_cp,
            "pair_accuracy": pair_accuracy,
            "decisive_pair_accuracy": decisive_pair_accuracy,
        }
    return results


def _legacy_integer(value: Any, label: str) -> int:
    """Validate one integer emitted by the JavaScript legacy generators."""

    if type(value) is not int:
        raise ValueError(f"{label} must be an integer")
    # The producer is JavaScript, so integers outside its exact range cannot
    # be authentic generator output. This also prevents float32 conversion
    # from silently creating infinities.
    if abs(value) > (2**53 - 1):
        raise ValueError(f"{label} is outside the exact generator integer range")
    return value


def _load_legacy_retention_dataset(
    *,
    trainer: ModuleType,
    path: str,
    identity: Mapping[str, Any],
    label: str,
    torch_module,
):
    """Strictly load one historical ``generate-teacher`` JSONL snapshot.

    General and opening retention predate the sibling-row schema. Their exact
    producer contract is ``{sfen, cp, ply, bestmove, depth}`` plus ``mate`` only
    for mate scores. Every byte is authenticated before parsing, and every row
    must be usable; this path never skips malformed legacy rows.
    """

    raw = _read_exact_file(path, identity, label)
    if not raw:
        raise ValueError(f"{label} is empty")
    if not raw.endswith(b"\n") or b"\r" in raw:
        raise ValueError(
            f"{label} must contain exactly one LF-terminated JSON row per line"
        )
    physical_rows = raw[:-1].split(b"\n")

    board_rows = []
    hand_rows = []
    raw_cps: list[float] = []
    position_keys: set[str] = set()
    for line_number, raw_line in enumerate(physical_rows, start=1):
        context = f"{label} line {line_number}"
        if not raw_line or not raw_line.strip():
            raise ValueError(f"{context}: blank JSONL row is forbidden")
        if raw_line != raw_line.strip():
            raise ValueError(f"{context}: surrounding JSON whitespace is forbidden")
        record = trainer.strict_json_loads(raw_line, context)
        if type(record) is not dict:
            raise ValueError(f"{context}: row must be a JSON object")
        fields = frozenset(record)
        if (
            not _LEGACY_RETENTION_REQUIRED_FIELDS <= fields
            or fields - _LEGACY_RETENTION_REQUIRED_FIELDS
            not in (frozenset(), _LEGACY_RETENTION_OPTIONAL_FIELDS)
        ):
            raise ValueError(f"{context}: legacy retention fields are not exact")

        sfen = trainer._normalized_sfen(record["sfen"], f"{context}.sfen")
        cp = _legacy_integer(record["cp"], f"{context}.cp")
        ply = _legacy_integer(record["ply"], f"{context}.ply")
        depth = _legacy_integer(record["depth"], f"{context}.depth")
        if ply < 0 or int(sfen.split()[3]) != ply + 1:
            raise ValueError(f"{context}: ply does not match SFEN move number")
        if depth <= 0:
            raise ValueError(f"{context}: depth must be positive")
        bestmove = record["bestmove"]
        if type(bestmove) is not str or _USI_MOVE_RE.fullmatch(bestmove) is None:
            raise ValueError(f"{context}: bestmove is not one canonical USI move")

        if "mate" in record:
            mate = _legacy_integer(record["mate"], f"{context}.mate")
            mate_sign = 1 if mate >= 0 else -1
            expected_cp = mate_sign * (
                LEGACY_MATE_SCORE_CP - min(abs(mate), LEGACY_MAX_MATE_DISTANCE)
            )
            if cp != expected_cp:
                raise ValueError(f"{context}: mate and cp are inconsistent")

        position_key = " ".join(sfen.split()[:3])
        if position_key in position_keys:
            raise ValueError(f"{context}: duplicate legacy retention position")
        position_keys.add(position_key)

        board, hands, _black_to_move, _king_square = trainer.parse_sfen(sfen)
        if len(board) > trainer.MAX_PIECES:
            raise ValueError(f"{context}: SFEN has too many board pieces")
        if any(
            type(value) not in (int, float) or not math.isfinite(float(value))
            for value in hands
        ):
            raise ValueError(f"{context}: SFEN produced invalid hand features")
        board_rows.append(board + [trainer.PAD_IDX] * (trainer.MAX_PIECES - len(board)))
        hand_rows.append(hands)
        raw_cps.append(float(cp))

    board_tensor = torch_module.tensor(board_rows, dtype=torch_module.long)
    hands_tensor = torch_module.tensor(hand_rows, dtype=torch_module.float32)
    cp_tensor = torch_module.tensor(raw_cps, dtype=torch_module.float32)
    if (
        not torch_module.isfinite(hands_tensor).all()
        or not torch_module.isfinite(cp_tensor).all()
    ):
        raise ValueError(f"{label} produced non-finite tensors")
    return board_tensor, hands_tensor, cp_tensor


def evaluate_int16_datasets(
    *,
    candidate_checkpoint_path: str,
    candidate_checkpoint: Mapping[str, Any],
    stable_checkpoint_path: str,
    stable_checkpoint: Mapping[str, Any],
    datasets: Mapping[str, tuple[str, Mapping[str, Any]]],
    evaluator: ModuleType | None = None,
    trainer: ModuleType | None = None,
    torch_module=None,
) -> dict[str, Any]:
    """Evaluate the selected and stable models on the exact four datasets."""

    if type(datasets) is not dict or set(datasets) != set(_DATASET_ROLES):
        raise ValueError("downstream int16 dataset roles are not exact")
    eval_module = evaluator or _load_module(
        "strength_first_downstream_real_eval",
        "eval-sibling.py",
    )
    train_module = trainer or _load_module(
        "strength_first_downstream_train",
        "train.py",
    )
    candidate_identity = _identity(candidate_checkpoint, "candidate checkpoint")
    stable_identity = _identity(stable_checkpoint, "stable checkpoint")
    candidate_model, candidate_k = _load_exact_model(
        eval_module,
        candidate_checkpoint_path,
        candidate_identity,
        epoch=20,
        label="candidate checkpoint",
    )
    stable_model, stable_k = _load_exact_model(
        eval_module,
        stable_checkpoint_path,
        stable_identity,
        epoch=27,
        label="stable checkpoint",
    )
    if torch_module is None:
        try:
            import torch as torch_module
        except ImportError as error:
            raise ValueError("real downstream evaluation requires Torch") from error

    measured: dict[str, dict[str, dict[str, float]]] = {}
    for role in ("fresh_final_holdout", "legacy_final_holdout"):
        data_path, identity_value = datasets[role]
        data_identity = _identity(identity_value, f"{role} dataset")
        (
            board,
            hands,
            _bucket,
            clamped_cp,
            raw_cp,
            metadata,
            _groups,
            fingerprint,
        ) = eval_module.load_validation_data(data_path, CP_CLAMP)
        _require_fingerprint(fingerprint, data_identity, f"{role} dataset")
        role_metrics = {}
        for name, model, k_sigmoid in (
            ("candidate", candidate_model, candidate_k),
            ("stable", stable_model, stable_k),
        ):
            predictions = eval_module.quantized_predictions(
                model,
                board,
                hands,
                k_sigmoid,
            )
            metrics = eval_module.calculate_metrics(
                predictions,
                clamped_cp,
                raw_cp,
                metadata,
                PAIR_MIN_CP,
            )
            role_metrics[name] = {
                **metrics,
            }
        measured[role] = role_metrics

    final_results = {}
    for role in ("fresh_final_holdout", "legacy_final_holdout"):
        values = measured[role]
        final_results[role] = {
            "candidate_int16_pair_accuracy": values["candidate"][
                "within_parent_pair_accuracy"
            ],
            "stable_int16_pair_accuracy": values["stable"][
                "within_parent_pair_accuracy"
            ],
            "candidate_int16_top1_accuracy": values["candidate"][
                "teacher_top1_accuracy"
            ],
            "stable_int16_top1_accuracy": values["stable"]["teacher_top1_accuracy"],
        }
    retention = {}
    for output_role, dataset_role in (
        ("general", "general_retention"),
        ("opening", "opening_retention"),
    ):
        data_path, identity_value = datasets[dataset_role]
        values = _retention_metrics(
            evaluator=eval_module,
            trainer=train_module,
            path=data_path,
            identity=_identity(
                identity_value,
                f"{dataset_role} dataset",
            ),
            label=f"{dataset_role} dataset",
            candidate_model=candidate_model,
            candidate_k=candidate_k,
            stable_model=stable_model,
            stable_k=stable_k,
            torch_module=torch_module,
        )
        retention[output_role] = {
            "candidate_value_mae_cp": values["candidate"]["value_mae_cp"],
            "stable_value_mae_cp": values["stable"]["value_mae_cp"],
            "candidate_pair_accuracy": values["candidate"]["pair_accuracy"],
            "stable_pair_accuracy": values["stable"]["pair_accuracy"],
            "candidate_decisive_pair_accuracy": values["candidate"][
                "decisive_pair_accuracy"
            ],
            "stable_decisive_pair_accuracy": values["stable"]["decisive_pair_accuracy"],
        }
    return {**final_results, "retention": retention}


__all__ = [
    "evaluate_int16_datasets",
    "verify_checkpoint_weight_exports",
]
