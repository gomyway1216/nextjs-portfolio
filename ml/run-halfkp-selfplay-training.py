#!/usr/bin/env python3
"""Run one sealed HalfKP self-play fine-tuning arm.

This wrapper deliberately leaves ``train.py`` unchanged.  It verifies the
protocol, initializer, explicit train/validation split, and prospective arm
before allowing ``train.py`` to create a fresh output directory.  A completed
run is accepted only after both checkpoints are rebound to the same inputs and
fixed command arguments.  This tool never writes the live evaluator.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from typing import Any, Callable, Mapping

import torch

import train
from checkpoint_compat import expected_arch, validate_arch


PROTOCOL_SCHEMA = "shogi-halfkp-selfplay-training-plan-v1"
ROW_SCHEMA = "shogi-nnue-selfplay-position-v1"
RESULT_SCHEMA = "shogi-halfkp-selfplay-training-result-v1"
FEATURES = "halfkp-factor"
LOSS = "sigmoid"
EPOCHS = 2
BATCH = 256
LEARNING_RATE = 3e-6
K_SIGMOID = 600.0
CP_CLAMP = 3000
DEVICE = "mps"
SEED = 42
EXPECTED_ARMS = {
    0.50: 0.50,
    0.75: 0.25,
}
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
POSITION_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
ROW_KEYS = {
    "actor_weights_sha256",
    "cp",
    "game_id",
    "move",
    "opening_id",
    "outcome",
    "ply",
    "position_id",
    "result",
    "schema",
    "search",
    "sfen",
    "source_game_id",
    "split",
}
SEARCH_KEYS = {"depth", "label_depth", "leaves", "nodes", "play_depth"}
RESULT_KEYS = {"reason", "winner"}
EXPECTED_ARCH = expected_arch(
    features=FEATURES,
    input_dim=train.INPUT_DIM * train.HALFKP_BUCKETS,
    h1=train.DistillNet.H1,
    h2=train.DistillNet.H2,
    k=K_SIGMOID,
    kp_buckets=train.HALFKP_BUCKETS,
)


def _strict_json(raw: bytes, label: str) -> Any:
    return train.strict_json_loads(raw, label)


def _read_stable_bytes(path: str, label: str) -> bytes:
    try:
        with open(path, "rb") as source:
            raw = source.read()
    except OSError as error:
        raise ValueError(f"{label} cannot be read: {path}") from error
    try:
        stat = os.stat(path)
    except OSError as error:
        raise ValueError(f"{label} disappeared while being read: {path}") from error
    if stat.st_size != len(raw):
        raise ValueError(f"{label} changed while being read: {path}")
    return raw


def _identity_from_bytes(path: str, raw: bytes) -> dict[str, object]:
    return {
        "path": os.path.realpath(path),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _file_identity(path: str, label: str) -> dict[str, object]:
    raw = _read_stable_bytes(path, label)
    return _identity_from_bytes(path, raw)


def _require_sha256(value: object, label: str) -> str:
    if type(value) is not str or SHA256_RE.fullmatch(value) is None:
        raise ValueError(f"{label} must be a lowercase SHA-256")
    return value


def _exact_keys(value: object, expected: set[str], label: str) -> Mapping[str, Any]:
    if type(value) is not dict or set(value) != expected:
        raise ValueError(
            f"{label} must contain exactly {', '.join(sorted(expected))}"
        )
    return value


def _same_typed_value(actual: object, expected: object) -> bool:
    return type(actual) is type(expected) and actual == expected


def _canonical_text(value: object, label: str) -> str:
    if (
        type(value) is not str
        or not value
        or value.strip() != value
        or any(ord(character) < 32 or ord(character) == 127 for character in value)
    ):
        raise ValueError(f"{label} must be non-empty canonical text")
    return value


def _nonnegative_integer(value: object, label: str, *, minimum: int = 0) -> int:
    if type(value) is not int or value < minimum or value > 2**53 - 1:
        raise ValueError(f"{label} must be a safe integer >= {minimum}")
    return value


def _verify_input_identity(
    entry: object,
    path: str,
    label: str,
    *,
    dataset: bool,
) -> tuple[Mapping[str, Any], dict[str, object], bytes]:
    keys = {"path", "bytes", "sha256"}
    if dataset:
        keys |= {"rows", "row_schema"}
    identity = _exact_keys(entry, keys, f"protocol input {label}")
    expected_path = identity["path"]
    if (
        type(expected_path) is not str
        or os.path.realpath(expected_path) != os.path.realpath(path)
    ):
        raise ValueError(f"protocol input {label} path mismatch")
    if type(identity["bytes"]) is not int or identity["bytes"] < 1:
        raise ValueError(f"protocol input {label} bytes must be a positive integer")
    expected_sha256 = _require_sha256(
        identity["sha256"], f"protocol input {label}.sha256"
    )
    if dataset:
        if type(identity["rows"]) is not int or identity["rows"] < 1:
            raise ValueError(f"protocol input {label} rows must be a positive integer")
        if identity["row_schema"] != ROW_SCHEMA:
            raise ValueError(f"protocol input {label} row schema mismatch")
    raw = _read_stable_bytes(path, label)
    actual = _identity_from_bytes(path, raw)
    if actual["bytes"] != identity["bytes"] or actual["sha256"] != expected_sha256:
        raise ValueError(
            f"protocol input {label} identity mismatch: expected "
            f"{identity['bytes']} bytes/{expected_sha256}, got "
            f"{actual['bytes']} bytes/{actual['sha256']}"
        )
    return identity, actual, raw


def _expected_checkpoint_arch() -> dict[str, object]:
    return dict(EXPECTED_ARCH)


def _load_checkpoint_bytes(raw: bytes, label: str) -> Mapping[str, Any]:
    try:
        checkpoint = torch.load(
            io.BytesIO(raw), map_location="cpu", weights_only=True
        )
    except Exception as error:
        raise ValueError(f"{label} is not a safe Torch checkpoint: {error}") from error
    if type(checkpoint) is not dict:
        raise ValueError(f"{label} root must be a dictionary")
    return checkpoint


def _validate_architecture(checkpoint: Mapping[str, Any], label: str) -> None:
    try:
        validate_arch(checkpoint.get("arch"), _expected_checkpoint_arch())
    except ValueError as error:
        raise ValueError(f"{label} architecture mismatch: {error}") from error
    checkpoint_args = checkpoint.get("args")
    if type(checkpoint_args) is not dict:
        raise ValueError(f"{label} args metadata is absent")
    if checkpoint_args.get("features") != FEATURES:
        raise ValueError(f"{label} args.features must be {FEATURES}")
    checkpoint_k = checkpoint_args.get("k")
    if (
        type(checkpoint_k) not in (int, float)
        or not math.isfinite(checkpoint_k)
        or float(checkpoint_k) != K_SIGMOID
    ):
        raise ValueError(f"{label} args.k must be {K_SIGMOID}")


def _validate_initializer(raw: bytes) -> Mapping[str, Any]:
    checkpoint = _load_checkpoint_bytes(raw, "champion initializer")
    _validate_architecture(checkpoint, "champion initializer")
    if not isinstance(checkpoint.get("model"), Mapping):
        raise ValueError("champion initializer model state is absent")
    return checkpoint


def _validate_fixed_training(training: object) -> Mapping[str, Any]:
    expected_keys = {
        "features",
        "loss",
        "epochs",
        "batch",
        "learning_rate",
        "k",
        "cp_clamp",
        "device",
        "seed",
        "prospective_arms",
    }
    value = _exact_keys(training, expected_keys, "protocol training")
    fixed = {
        "features": FEATURES,
        "loss": LOSS,
        "epochs": EPOCHS,
        "batch": BATCH,
        "learning_rate": LEARNING_RATE,
        "k": K_SIGMOID,
        "cp_clamp": CP_CLAMP,
        "device": DEVICE,
        "seed": SEED,
    }
    mismatches = [
        f"{field}: expected {expected!r}, got {value.get(field)!r}"
        for field, expected in fixed.items()
        if not _same_typed_value(value.get(field), expected)
    ]
    if mismatches:
        raise ValueError(
            "protocol fixed training mismatch (" + "; ".join(mismatches) + ")"
        )
    return value


def _validate_arms(
    arms: object,
    inputs: Mapping[str, Mapping[str, Any]],
    selected_arm_id: str,
) -> Mapping[str, Any]:
    if type(arms) is not list or len(arms) != 2:
        raise ValueError("protocol must contain exactly two prospective arms")
    required = {
        "id",
        "search_score_fraction",
        "wdl_mix",
        "training_dataset_sha256",
        "validation_dataset_sha256",
        "initializer_sha256",
    }
    by_fraction: dict[float, Mapping[str, Any]] = {}
    arm_ids: set[str] = set()
    selected = None
    for index, raw_arm in enumerate(arms):
        arm = _exact_keys(raw_arm, required, f"protocol arm {index}")
        arm_id = arm["id"]
        if type(arm_id) is not str or not arm_id or arm_id in arm_ids:
            raise ValueError("protocol prospective arm IDs must be unique non-empty strings")
        arm_ids.add(arm_id)
        fraction = arm["search_score_fraction"]
        if type(fraction) is not float or fraction not in EXPECTED_ARMS:
            raise ValueError(
                "protocol search-score fractions must be exactly 0.50 and 0.75"
            )
        if fraction in by_fraction:
            raise ValueError("protocol repeats a prospective search-score fraction")
        expected_mix = EXPECTED_ARMS[fraction]
        if type(arm["wdl_mix"]) is not float or arm["wdl_mix"] != expected_mix:
            raise ValueError(
                f"protocol arm lambda={fraction:.2f} must use wdl_mix={expected_mix:.2f}"
            )
        bindings = {
            "training_dataset_sha256": inputs["training_dataset"]["sha256"],
            "validation_dataset_sha256": inputs["validation_dataset"]["sha256"],
            "initializer_sha256": inputs["champion_initializer"]["sha256"],
        }
        for field, expected in bindings.items():
            _require_sha256(arm[field], f"protocol arm {index}.{field}")
            if arm[field] != expected:
                raise ValueError(
                    "both prospective arms must bind the same registered data and initializer"
                )
        by_fraction[fraction] = arm
        if arm_id == selected_arm_id:
            selected = arm
    if set(by_fraction) != set(EXPECTED_ARMS):
        raise ValueError("protocol prospective arm grid is incomplete")
    if selected is None:
        raise ValueError(f"selected prospective arm is absent: {selected_arm_id}")
    return selected


def _dataset_summary(
    path: str,
    raw: bytes,
    *,
    expected_rows: int,
    expected_split: str,
) -> dict[str, object]:
    if not raw.endswith(b"\n"):
        raise ValueError(f"{path}: dataset must end with LF")
    rows = 0
    game_ids: set[str] = set()
    position_ids: set[str] = set()
    source_game_ids: set[str] = set()
    games: dict[str, tuple[object, str, str, str, str, set[int]]] = {}
    outcomes = {"loss": 0, "draw": 0, "win": 0}
    for line_number, raw_line in enumerate(raw.splitlines(), start=1):
        if not raw_line:
            raise ValueError(f"{path}: line {line_number} is blank")
        record = _strict_json(raw_line, f"{path}: line {line_number}")
        if type(record) is not dict:
            raise ValueError(f"{path}: line {line_number} must be an object")
        _exact_keys(record, ROW_KEYS, f"{path}: line {line_number}")
        if record.get("schema") != ROW_SCHEMA:
            raise ValueError(f"{path}: line {line_number} row schema mismatch")
        if record.get("split") != expected_split:
            raise ValueError(
                f"{path}: line {line_number} split must be {expected_split!r}"
            )
        game_id = _canonical_text(
            record.get("game_id"), f"{path}: line {line_number} game_id"
        )
        source_game_id = _canonical_text(
            record.get("source_game_id"),
            f"{path}: line {line_number} source_game_id",
        )
        sfen = record.get("sfen")
        sfen_fields = sfen.strip().split() if type(sfen) is str else []
        if (
            type(sfen) is not str
            or len(sfen_fields) != 4
            or sfen_fields[1] not in ("b", "w")
        ):
            raise ValueError(f"{path}: line {line_number} SFEN is invalid")
        try:
            train.parse_sfen(sfen)
        except (IndexError, KeyError, TypeError, ValueError) as error:
            raise ValueError(f"{path}: line {line_number} SFEN is invalid: {error}") from error
        position_id = record.get("position_id")
        if (
            type(position_id) is not str
            or POSITION_ID_RE.fullmatch(position_id) is None
            or position_id != train.position_id_from_sfen(sfen)
        ):
            raise ValueError(
                f"{path}: line {line_number} position_id does not match SFEN"
            )
        if position_id in position_ids:
            raise ValueError(f"{path}: duplicate position_id {position_id}")
        cp = record.get("cp")
        if type(cp) is not int or abs(cp) > 2**53 - 1:
            raise ValueError(f"{path}: line {line_number} cp must be an integer")
        try:
            outcome = train.game_outcome_target(
                record.get("outcome"), f"{path}: line {line_number} outcome"
            )
        except ValueError as error:
            raise ValueError(str(error)) from error
        ply = _nonnegative_integer(
            record.get("ply"), f"{path}: line {line_number} ply"
        )
        if ply != int(sfen_fields[3]) - 1:
            raise ValueError(f"{path}: line {line_number} ply does not match SFEN")
        _canonical_text(record.get("move"), f"{path}: line {line_number} move")
        opening_id = _canonical_text(
            record.get("opening_id"), f"{path}: line {line_number} opening_id"
        )
        actor = _require_sha256(
            record.get("actor_weights_sha256"),
            f"{path}: line {line_number} actor_weights_sha256",
        )
        search = _exact_keys(
            record.get("search"), SEARCH_KEYS, f"{path}: line {line_number} search"
        )
        play_depth = _nonnegative_integer(
            search["play_depth"],
            f"{path}: line {line_number} search.play_depth",
            minimum=1,
        )
        label_depth = _nonnegative_integer(
            search["label_depth"],
            f"{path}: line {line_number} search.label_depth",
            minimum=1,
        )
        depth = _nonnegative_integer(
            search["depth"],
            f"{path}: line {line_number} search.depth",
            minimum=1,
        )
        nodes = _nonnegative_integer(
            search["nodes"],
            f"{path}: line {line_number} search.nodes",
            minimum=1,
        )
        leaves = _nonnegative_integer(
            search["leaves"],
            f"{path}: line {line_number} search.leaves",
            minimum=1,
        )
        if label_depth <= play_depth or depth > label_depth or leaves > nodes:
            raise ValueError(f"{path}: line {line_number} search evidence is inconsistent")
        result = _exact_keys(
            record.get("result"), RESULT_KEYS, f"{path}: line {line_number} result"
        )
        winner = result["winner"]
        if winner not in ("b", "w", None):
            raise ValueError(f"{path}: line {line_number} result.winner is invalid")
        reason = _canonical_text(
            result["reason"], f"{path}: line {line_number} result.reason"
        )
        expected_outcome = (
            0.5 if winner is None else (1.0 if winner == sfen_fields[1] else 0.0)
        )
        if outcome != expected_outcome:
            raise ValueError(
                f"{path}: line {line_number} outcome contradicts side-to-move result"
            )
        game_contract = (winner, reason, opening_id, actor, source_game_id)
        existing_game = games.get(game_id)
        if existing_game is None:
            games[game_id] = (*game_contract, {ply})
        else:
            if existing_game[:5] != game_contract:
                raise ValueError(f"{path}: game {game_id} has mixed provenance/result")
            if ply in existing_game[5]:
                raise ValueError(f"{path}: game {game_id} repeats ply {ply}")
            existing_game[5].add(ply)
        game_ids.add(game_id)
        position_ids.add(position_id)
        source_game_ids.add(source_game_id)
        outcomes[{0.0: "loss", 0.5: "draw", 1.0: "win"}[outcome]] += 1
        rows += 1
    if rows != expected_rows:
        raise ValueError(
            f"{path}: expected {expected_rows} rows from protocol, got {rows}"
        )
    return {
        "rows": rows,
        "games": len(game_ids),
        "source_games": len(source_game_ids),
        "game_ids": game_ids,
        "position_ids": position_ids,
        "source_game_ids": source_game_ids,
        "outcomes": outcomes,
    }


def _verify_protocol(args: argparse.Namespace) -> dict[str, Any]:
    protocol_raw = _read_stable_bytes(args.protocol, "training protocol")
    protocol_identity = _identity_from_bytes(args.protocol, protocol_raw)
    if (
        protocol_identity["bytes"] != args.protocol_bytes
        or protocol_identity["sha256"] != args.protocol_sha256
    ):
        raise ValueError("training protocol expected bytes/SHA-256 mismatch")
    protocol = _strict_json(protocol_raw, "training protocol")
    root = _exact_keys(protocol, {"schema", "inputs", "training"}, "training protocol")
    if root["schema"] != PROTOCOL_SCHEMA:
        raise ValueError("training protocol schema mismatch")
    input_registry = _exact_keys(
        root["inputs"],
        {"champion_initializer", "training_dataset", "validation_dataset"},
        "protocol inputs",
    )
    paths = {
        "champion_initializer": args.init_ckpt,
        "training_dataset": args.data,
        "validation_dataset": args.val_data,
    }
    verified_inputs: dict[str, dict[str, object]] = {}
    raw_inputs: dict[str, bytes] = {}
    entries: dict[str, Mapping[str, Any]] = {}
    for role, path in paths.items():
        entry, actual, raw = _verify_input_identity(
            input_registry[role],
            path,
            role,
            dataset=role != "champion_initializer",
        )
        entries[role] = entry
        verified_inputs[role] = actual
        raw_inputs[role] = raw
    _validate_initializer(raw_inputs["champion_initializer"])
    training = _validate_fixed_training(root["training"])
    selected_arm = _validate_arms(
        training["prospective_arms"], entries, args.arm
    )
    train_summary = _dataset_summary(
        args.data,
        raw_inputs["training_dataset"],
        expected_rows=entries["training_dataset"]["rows"],
        expected_split="train",
    )
    val_summary = _dataset_summary(
        args.val_data,
        raw_inputs["validation_dataset"],
        expected_rows=entries["validation_dataset"]["rows"],
        expected_split="val",
    )
    game_overlap = train_summary["game_ids"] & val_summary["game_ids"]
    if game_overlap:
        raise ValueError(
            f"explicit train/validation game_id leakage: {sorted(game_overlap)[0]}"
        )
    position_overlap = train_summary["position_ids"] & val_summary["position_ids"]
    if position_overlap:
        raise ValueError(
            "explicit train/validation position_id leakage: "
            f"{sorted(position_overlap)[0]}"
        )
    source_game_overlap = (
        train_summary["source_game_ids"] & val_summary["source_game_ids"]
    )
    if source_game_overlap:
        raise ValueError(
            "explicit train/validation source_game_id leakage: "
            f"{sorted(source_game_overlap)[0]}"
        )
    for summary in (train_summary, val_summary):
        summary.pop("game_ids")
        summary.pop("position_ids")
        summary.pop("source_game_ids")
    return {
        "protocol": protocol_identity,
        "inputs": verified_inputs,
        "training": {key: training[key] for key in training if key != "prospective_arms"},
        "selected_arm": dict(selected_arm),
        "dataset_summaries": {
            "training": train_summary,
            "validation": val_summary,
        },
    }


def build_command(args: argparse.Namespace, verified: Mapping[str, Any]) -> list[str]:
    paths = verified["inputs"]
    wdl_mix = verified["selected_arm"]["wdl_mix"]
    return [
        sys.executable,
        str(Path(__file__).resolve().with_name("train.py")),
        "--data",
        str(paths["training_dataset"]["path"]),
        "--val-data",
        str(paths["validation_dataset"]["path"]),
        "--out",
        os.path.realpath(args.out),
        "--epochs",
        str(EPOCHS),
        "--batch",
        str(BATCH),
        "--lr",
        str(LEARNING_RATE),
        "--k",
        str(K_SIGMOID),
        "--cp-clamp",
        str(CP_CLAMP),
        "--wdl-mix",
        str(wdl_mix),
        "--device",
        DEVICE,
        "--seed",
        str(SEED),
        "--features",
        FEATURES,
        "--loss",
        LOSS,
        "--init-ckpt",
        str(paths["champion_initializer"]["path"]),
        "--limit",
        "0",
        "--select-metric",
        "value-loss",
        "--halfkp-train-scope",
        "all",
    ]


def _validate_checkpoint(
    path: str,
    *,
    label: str,
    args: argparse.Namespace,
    verified: Mapping[str, Any],
) -> dict[str, object]:
    raw = _read_stable_bytes(path, label)
    identity = _identity_from_bytes(path, raw)
    checkpoint = _load_checkpoint_bytes(raw, label)
    _validate_architecture(checkpoint, label)
    checkpoint_args = checkpoint["args"]
    expected_args = {
        "data": verified["inputs"]["training_dataset"]["path"],
        "val_data": verified["inputs"]["validation_dataset"]["path"],
        "out": os.path.realpath(args.out),
        "epochs": EPOCHS,
        "batch": BATCH,
        "lr": LEARNING_RATE,
        "k": K_SIGMOID,
        "cp_clamp": CP_CLAMP,
        "wdl_mix": verified["selected_arm"]["wdl_mix"],
        "device": DEVICE,
        "seed": SEED,
        "features": FEATURES,
        "loss": LOSS,
        "init_ckpt": verified["inputs"]["champion_initializer"]["path"],
        "limit": 0,
        "select_metric": "value-loss",
        "halfkp_train_scope": "all",
    }
    mismatches = [
        f"{field}: expected {expected!r}, got {checkpoint_args.get(field)!r}"
        for field, expected in expected_args.items()
        if not _same_typed_value(checkpoint_args.get(field), expected)
    ]
    if mismatches:
        raise ValueError(f"{label} source/fixed args mismatch ({'; '.join(mismatches)})")
    init_binding = checkpoint.get("init_checkpoint")
    if type(init_binding) is not dict:
        raise ValueError(f"{label} initializer binding is absent")
    expected_init = verified["inputs"]["champion_initializer"]
    for field in ("path", "bytes", "sha256"):
        if init_binding.get(field) != expected_init[field]:
            raise ValueError(f"{label} initializer {field} mismatch")
    epoch = checkpoint.get("epoch")
    if type(epoch) is not int or not 0 <= epoch <= EPOCHS:
        raise ValueError(f"{label} epoch is outside the sealed run")
    if label == "last.pt" and epoch != EPOCHS:
        raise ValueError("last.pt does not contain the completed final epoch")
    return identity


def _atomic_write_json(path: str, payload: Mapping[str, Any]) -> None:
    target = os.path.abspath(path)
    directory = os.path.dirname(target)
    descriptor, temporary = tempfile.mkstemp(
        prefix=f".{os.path.basename(target)}.", suffix=".tmp", dir=directory
    )
    temporary_live = True
    try:
        with os.fdopen(descriptor, "wb") as output:
            encoded = (
                json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False)
                + "\n"
            ).encode("utf-8")
            output.write(encoded)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
        temporary_live = False
        try:
            directory_fd = os.open(directory, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            pass
    finally:
        if temporary_live:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass


def run_selfplay_training(
    args: argparse.Namespace,
    *,
    command_runner: Callable[..., Any] = subprocess.run,
    mps_available: Callable[[], bool] = torch.backends.mps.is_available,
) -> dict[str, Any]:
    if type(args.protocol_bytes) is not int or args.protocol_bytes < 1:
        raise ValueError("--protocol-bytes must be a positive integer")
    _require_sha256(args.protocol_sha256, "--protocol-sha256")
    if os.path.lexists(args.out):
        raise ValueError(f"refusing to reuse existing output path: {args.out}")
    output_parent = os.path.dirname(os.path.abspath(args.out))
    if not os.path.isdir(output_parent):
        raise ValueError(f"output parent directory does not exist: {output_parent}")
    if not mps_available():
        raise ValueError("sealed self-play training requires an available MPS device")
    verified = _verify_protocol(args)
    command = build_command(args, verified)
    try:
        os.mkdir(args.out, mode=0o700)
    except FileExistsError as error:
        raise ValueError(f"output path appeared before launch: {args.out}") from error
    completed = command_runner(command, check=False)
    if type(completed.returncode) is not int or completed.returncode != 0:
        raise RuntimeError(
            f"train.py failed with return code {getattr(completed, 'returncode', None)!r}"
        )
    if not os.path.isdir(args.out) or os.path.islink(args.out):
        raise ValueError("train.py did not create a regular fresh output directory")
    expected_names = ("best.pt", "last.pt", "curve.csv")
    artifacts: dict[str, dict[str, object]] = {}
    for name in expected_names:
        artifact_path = os.path.join(args.out, name)
        if os.path.islink(artifact_path) or not os.path.isfile(artifact_path):
            raise ValueError(f"completed training is missing regular artifact {name}")
    artifacts["best.pt"] = _validate_checkpoint(
        os.path.join(args.out, "best.pt"),
        label="best.pt",
        args=args,
        verified=verified,
    )
    artifacts["last.pt"] = _validate_checkpoint(
        os.path.join(args.out, "last.pt"),
        label="last.pt",
        args=args,
        verified=verified,
    )
    artifacts["curve.csv"] = _file_identity(
        os.path.join(args.out, "curve.csv"), "curve.csv"
    )
    if artifacts["curve.csv"]["bytes"] < 1:
        raise ValueError("curve.csv is empty")
    post_protocol = _file_identity(args.protocol, "training protocol postflight")
    if post_protocol != verified["protocol"]:
        raise ValueError("training protocol changed during training")
    for role, source in (
        ("champion_initializer", args.init_ckpt),
        ("training_dataset", args.data),
        ("validation_dataset", args.val_data),
    ):
        post_identity = _file_identity(source, f"{role} postflight")
        if post_identity != verified["inputs"][role]:
            raise ValueError(f"{role} changed during training")
    result = {
        "schema": RESULT_SCHEMA,
        "status": "complete",
        "live_weights_changed": False,
        "protocol": verified["protocol"],
        "selected_arm": verified["selected_arm"],
        "inputs": verified["inputs"],
        "dataset_summaries": verified["dataset_summaries"],
        "training": verified["training"],
        "train_command": command,
        "artifacts": artifacts,
    }
    result_path = os.path.join(args.out, "result.json")
    if os.path.lexists(result_path):
        raise ValueError("train.py unexpectedly created result.json")
    _atomic_write_json(result_path, result)
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", required=True)
    parser.add_argument("--protocol-bytes", required=True, type=int)
    parser.add_argument("--protocol-sha256", required=True)
    parser.add_argument("--data", required=True)
    parser.add_argument("--val-data", required=True)
    parser.add_argument("--init-ckpt", required=True)
    parser.add_argument("--arm", required=True)
    parser.add_argument("--out", required=True)
    return parser


def main() -> int:
    try:
        result = run_selfplay_training(_parser().parse_args())
    except (OSError, RuntimeError, ValueError) as error:
        print(f"[halfkp-selfplay] rejected: {error}", file=sys.stderr)
        return 1
    print(
        "[halfkp-selfplay] complete: "
        f"arm={result['selected_arm']['id']} "
        f"best={result['artifacts']['best.pt']['sha256']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
