#!/usr/bin/env python3
"""Build a sealed two-arm HalfKP self-play training plan.

The dataset manifest is only a declaration: this builder streams and hashes
the published train/validation files again before binding them and the champion
initializer into a canonical plan.  Publication is fresh and atomic.  The plan
does not authorize a live-weight write.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import tempfile
from typing import Any, Mapping


DATASET_MANIFEST_SCHEMA = "shogi-nnue-selfplay-dataset-manifest-v1"
ROW_SCHEMA = "shogi-nnue-selfplay-position-v1"
TRAINING_PLAN_SCHEMA = "shogi-halfkp-selfplay-training-plan-v1"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_STREAM_CHUNK_BYTES = 4 * 1024 * 1024
_MAX_MANIFEST_BYTES = 16 * 1024 * 1024

FIXED_TRAINING = {
    "features": "halfkp-factor",
    "loss": "sigmoid",
    "epochs": 2,
    "batch": 256,
    "learning_rate": 3e-6,
    "k": 600.0,
    "cp_clamp": 3000,
    "device": "mps",
    "seed": 42,
}
ARM_GRID = (
    ("lambda-0.50", 0.50, 0.50),
    ("lambda-0.75", 0.75, 0.25),
)


class SelfplayTrainingPlanError(ValueError):
    """An input cannot be bound into a sealed self-play training plan."""


def _reject_constant(value: str) -> None:
    raise SelfplayTrainingPlanError(f"non-finite JSON number is forbidden: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise SelfplayTrainingPlanError(f"duplicate JSON key is forbidden: {key}")
        result[key] = value
    return result


def _strict_json(raw: bytes, label: str) -> Mapping[str, Any]:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise SelfplayTrainingPlanError(f"{label} is not UTF-8") from error
    try:
        value = json.loads(
            text,
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except SelfplayTrainingPlanError:
        raise
    except (TypeError, ValueError, json.JSONDecodeError) as error:
        raise SelfplayTrainingPlanError(f"{label} is not strict JSON: {error}") from error
    if type(value) is not dict:
        raise SelfplayTrainingPlanError(f"{label} root must be an object")
    return value


def canonical_json_bytes(value: object) -> bytes:
    try:
        encoded = json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as error:
        raise SelfplayTrainingPlanError(f"plan is not canonical JSON data: {error}") from error
    return (encoded + "\n").encode("utf-8")


def _require_regular_file(path: str, label: str) -> tuple[str, os.stat_result]:
    absolute = os.path.abspath(path)
    try:
        path_stat = os.lstat(absolute)
    except OSError as error:
        raise SelfplayTrainingPlanError(f"{label} cannot be inspected: {absolute}") from error
    if stat.S_ISLNK(path_stat.st_mode) or not stat.S_ISREG(path_stat.st_mode):
        raise SelfplayTrainingPlanError(f"{label} must be a regular non-symlink file")
    return os.path.realpath(absolute), path_stat


def _stable_stream_identity(
    path: str,
    label: str,
    *,
    jsonl: bool = False,
) -> tuple[dict[str, object], int | None]:
    real_path, path_stat = _require_regular_file(path, label)
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise SelfplayTrainingPlanError(f"{label} cannot be opened: {path}") from error
    digest = hashlib.sha256()
    byte_count = 0
    line_count = 0
    previous_was_lf = False
    first_byte = True
    last_byte: int | None = None
    try:
        before = os.fstat(descriptor)
        if (
            before.st_dev != path_stat.st_dev
            or before.st_ino != path_stat.st_ino
            or not stat.S_ISREG(before.st_mode)
        ):
            raise SelfplayTrainingPlanError(f"{label} changed before hashing")
        while True:
            chunk = os.read(descriptor, _STREAM_CHUNK_BYTES)
            if not chunk:
                break
            digest.update(chunk)
            byte_count += len(chunk)
            if jsonl:
                if b"\r" in chunk:
                    raise SelfplayTrainingPlanError(f"{label} JSONL contains CR bytes")
                if first_byte and chunk[0] == 0x0A:
                    raise SelfplayTrainingPlanError(f"{label} JSONL starts with a blank row")
                if previous_was_lf and chunk[0] == 0x0A:
                    raise SelfplayTrainingPlanError(f"{label} JSONL contains a blank row")
                if b"\n\n" in chunk:
                    raise SelfplayTrainingPlanError(f"{label} JSONL contains a blank row")
                line_count += chunk.count(b"\n")
                previous_was_lf = chunk[-1] == 0x0A
                first_byte = False
                last_byte = chunk[-1]
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    stable_fields = (
        "st_dev",
        "st_ino",
        "st_mode",
        "st_nlink",
        "st_size",
        "st_mtime_ns",
        "st_ctime_ns",
    )
    if any(getattr(before, field) != getattr(after, field) for field in stable_fields):
        raise SelfplayTrainingPlanError(f"{label} changed while hashing")
    if after.st_size != byte_count or byte_count < 1:
        raise SelfplayTrainingPlanError(f"{label} is empty or changed while hashing")
    if jsonl and last_byte != 0x0A:
        raise SelfplayTrainingPlanError(f"{label} JSONL must end with LF")
    return (
        {
            "path": real_path,
            "bytes": byte_count,
            "sha256": digest.hexdigest(),
        },
        line_count if jsonl else None,
    )


def _read_manifest(path: str) -> tuple[Mapping[str, Any], str]:
    identity, _ = _stable_stream_identity(path, "dataset manifest")
    if identity["bytes"] > _MAX_MANIFEST_BYTES:
        raise SelfplayTrainingPlanError("dataset manifest is unreasonably large")
    try:
        with open(identity["path"], "rb") as source:
            raw = source.read()
    except OSError as error:
        raise SelfplayTrainingPlanError("dataset manifest cannot be read") from error
    if len(raw) != identity["bytes"] or hashlib.sha256(raw).hexdigest() != identity["sha256"]:
        raise SelfplayTrainingPlanError("dataset manifest changed after hashing")
    return _strict_json(raw, "dataset manifest"), str(identity["path"])


def _positive_integer(value: object, label: str) -> int:
    if type(value) is not int or value < 1 or value > 2**53 - 1:
        raise SelfplayTrainingPlanError(f"{label} must be a positive safe integer")
    return value


def _declared_sha256(value: object, label: str) -> str:
    if type(value) is not str or SHA256_RE.fullmatch(value) is None:
        raise SelfplayTrainingPlanError(f"{label} must be a lowercase SHA-256")
    return value


def _dataset_input(
    entry: object,
    dataset_directory: str,
    role: str,
) -> dict[str, object]:
    if type(entry) is not dict:
        raise SelfplayTrainingPlanError(f"dataset manifest output.{role} must be an object")
    required = {"file", "bytes", "sha256", "records", "row_schema"}
    if not required.issubset(entry):
        missing = ", ".join(sorted(required - set(entry)))
        raise SelfplayTrainingPlanError(
            f"dataset manifest output.{role} is missing: {missing}"
        )
    filename = entry["file"]
    if (
        type(filename) is not str
        or not filename
        or filename in (".", "..")
        or os.path.basename(filename) != filename
    ):
        raise SelfplayTrainingPlanError(
            f"dataset manifest output.{role}.file must be a safe basename"
        )
    declared_bytes = _positive_integer(entry["bytes"], f"output.{role}.bytes")
    declared_records = _positive_integer(entry["records"], f"output.{role}.records")
    declared_sha = _declared_sha256(entry["sha256"], f"output.{role}.sha256")
    if entry["row_schema"] != ROW_SCHEMA:
        raise SelfplayTrainingPlanError(f"output.{role}.row_schema mismatch")
    actual, line_count = _stable_stream_identity(
        os.path.join(dataset_directory, filename),
        f"{role} dataset",
        jsonl=True,
    )
    if actual["bytes"] != declared_bytes or actual["sha256"] != declared_sha:
        raise SelfplayTrainingPlanError(
            f"{role} dataset bytes/SHA-256 differ from its manifest"
        )
    if line_count != declared_records:
        raise SelfplayTrainingPlanError(
            f"{role} dataset has {line_count} rows, manifest declares {declared_records}"
        )
    return {
        **actual,
        "rows": declared_records,
        "row_schema": ROW_SCHEMA,
    }


def build_training_plan(
    *,
    dataset_manifest_path: str,
    dataset_dir: str,
    initializer_path: str,
) -> dict[str, object]:
    dataset_directory = os.path.realpath(os.path.abspath(dataset_dir))
    try:
        directory_stat = os.stat(dataset_directory)
    except OSError as error:
        raise SelfplayTrainingPlanError(
            f"dataset directory cannot be inspected: {dataset_directory}"
        ) from error
    if not stat.S_ISDIR(directory_stat.st_mode):
        raise SelfplayTrainingPlanError("dataset directory must be a directory")
    manifest, manifest_real_path = _read_manifest(dataset_manifest_path)
    if os.path.dirname(manifest_real_path) != dataset_directory:
        raise SelfplayTrainingPlanError(
            "dataset manifest must be stored directly in --dataset-dir"
        )
    if manifest.get("schema") != DATASET_MANIFEST_SCHEMA:
        raise SelfplayTrainingPlanError("dataset manifest schema mismatch")
    if manifest.get("live_weight_write_authorized", False) is not False:
        raise SelfplayTrainingPlanError(
            "dataset manifest must not authorize a live-weight write"
        )
    output = manifest.get("output")
    if type(output) is not dict or set(output) != {"train", "validation"}:
        raise SelfplayTrainingPlanError(
            "dataset manifest output must contain exactly train and validation"
        )
    training_dataset = _dataset_input(output["train"], dataset_directory, "train")
    validation_dataset = _dataset_input(
        output["validation"], dataset_directory, "validation"
    )
    if training_dataset["path"] == validation_dataset["path"]:
        raise SelfplayTrainingPlanError("train and validation must be distinct files")
    initializer, _ = _stable_stream_identity(initializer_path, "champion initializer")
    bindings = {
        "training_dataset_sha256": training_dataset["sha256"],
        "validation_dataset_sha256": validation_dataset["sha256"],
        "initializer_sha256": initializer["sha256"],
    }
    prospective_arms = [
        {
            "id": arm_id,
            "search_score_fraction": search_fraction,
            "wdl_mix": wdl_mix,
            **bindings,
        }
        for arm_id, search_fraction, wdl_mix in ARM_GRID
    ]
    return {
        "schema": TRAINING_PLAN_SCHEMA,
        "inputs": {
            "champion_initializer": initializer,
            "training_dataset": training_dataset,
            "validation_dataset": validation_dataset,
        },
        "training": {
            **FIXED_TRAINING,
            "prospective_arms": prospective_arms,
        },
    }


def _publish_fresh(path: str, payload: bytes) -> dict[str, object]:
    target = os.path.join(
        os.path.realpath(os.path.dirname(os.path.abspath(path))),
        os.path.basename(path),
    )
    parent = os.path.dirname(target)
    if not os.path.isdir(parent):
        raise SelfplayTrainingPlanError(f"output parent does not exist: {parent}")
    if os.path.lexists(target):
        raise SelfplayTrainingPlanError(f"refusing to overwrite output: {target}")
    descriptor, temporary = tempfile.mkstemp(
        prefix=f".{os.path.basename(target)}.", suffix=".tmp", dir=parent
    )
    temporary_live = True
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
            os.fchmod(output.fileno(), 0o444)
        try:
            os.link(temporary, target)
        except FileExistsError as error:
            raise SelfplayTrainingPlanError(
                f"output appeared during publication: {target}"
            ) from error
        os.unlink(temporary)
        temporary_live = False
        try:
            directory_fd = os.open(parent, os.O_RDONLY)
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
    return {
        "path": target,
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }


def build_and_publish(
    *,
    dataset_manifest_path: str,
    dataset_dir: str,
    initializer_path: str,
    out_path: str,
) -> tuple[dict[str, object], dict[str, object]]:
    plan = build_training_plan(
        dataset_manifest_path=dataset_manifest_path,
        dataset_dir=dataset_dir,
        initializer_path=initializer_path,
    )
    identity = _publish_fresh(out_path, canonical_json_bytes(plan))
    return plan, identity


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-manifest", required=True)
    parser.add_argument("--dataset-dir", required=True)
    parser.add_argument("--initializer", required=True)
    parser.add_argument("--out", required=True)
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        _, identity = build_and_publish(
            dataset_manifest_path=args.dataset_manifest,
            dataset_dir=args.dataset_dir,
            initializer_path=args.initializer,
            out_path=args.out,
        )
    except (OSError, SelfplayTrainingPlanError) as error:
        print(f"[halfkp-selfplay-plan] rejected: {error}", file=os.sys.stderr)
        return 1
    print(
        "[halfkp-selfplay-plan] complete: "
        f"path={identity['path']} bytes={identity['bytes']} "
        f"sha256={identity['sha256']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
