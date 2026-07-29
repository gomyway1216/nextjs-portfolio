#!/usr/bin/env python3
"""Publish a completed frozen student to its create-only public asset paths.

This is the mandatory bridge between terminalization and the one-shot
production build receipt. It never trains, opens tune/sealed data, changes the
live NNUE, or overwrites an existing public asset.
"""

from __future__ import annotations

import argparse
import ast
from collections.abc import Mapping, Sequence
import hashlib
import json
import os
from pathlib import Path
import stat
from typing import Any
import uuid


SCHEMA = "shogi-child-board-root-policy-public-assets-receipt-v1"
STATUS = "complete-frozen-student-public-assets-create-only"
STUDENT_RESULT_SCHEMA = (
    "shogi-child-board-root-policy-student-runtime-result-v1"
)
STUDENT_STATUS = "complete-fit-only-student-frozen-tune-locked"
MANIFEST_SCHEMA = "shogi-child-board-root-policy-student-manifest-v1"
MODEL_SCHEMA = "shogi-child-board-root-policy-student-v1"
FEATURE_VERSION = "dense-43-plane-shared-parent-child-livecp-root-v1"
MODEL_VARIANT = "shared-child16x2-residual-mlp-root-ordering-v1"
FORMAT = (
    "bytewise-utf8-name-order-contiguous-row-major-"
    "little-endian-float32-no-padding"
)
PARAMETERS = 877_633
PAYLOAD_BYTES = PARAMETERS * 4
LIVE_NNUE_BYTES = 1_185_988
LIVE_NNUE_SHA256 = (
    "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc"
)
SHA256_HEX = frozenset("0123456789abcdef")


class PublicAssetPublicationError(ValueError):
    """The frozen student is incomplete, drifted, or unsafe to publish."""


def _reject_constant(value: str) -> None:
    raise PublicAssetPublicationError(
        f"non-finite JSON number is forbidden: {value}"
    )


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise PublicAssetPublicationError(
                f"duplicate JSON key is forbidden: {key}"
            )
        result[key] = value
    return result


def _read_regular(path: Path, label: str) -> bytes:
    try:
        metadata = path.lstat()
    except OSError as error:
        raise PublicAssetPublicationError(
            f"{label} is unavailable: {path}"
        ) from error
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise PublicAssetPublicationError(
            f"{label} must be a regular non-symlink file"
        )
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
        with os.fdopen(descriptor, "rb") as stream:
            return stream.read()
    except OSError as error:
        raise PublicAssetPublicationError(
            f"{label} could not be read safely"
        ) from error


def _strict_json(path: Path, label: str) -> dict[str, Any]:
    raw = _read_regular(path, label)
    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PublicAssetPublicationError(
            f"{label} is not strict UTF-8 JSON"
        ) from error
    if type(value) is not dict:
        raise PublicAssetPublicationError(f"{label} root must be an object")
    return value


def _canonical(value: object) -> bytes:
    return (
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
        + b"\n"
    )


def _identity(path: Path) -> dict[str, object]:
    resolved = path.resolve(strict=True)
    raw = _read_regular(resolved, str(resolved))
    return {
        "path": str(resolved),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _predicted_identity(path: Path, raw: bytes) -> dict[str, object]:
    return {
        "path": str(path.resolve(strict=False)),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _publish_create_only(path: Path, raw: bytes, label: str) -> None:
    if path.exists():
        if _read_regular(path, label) != raw:
            raise PublicAssetPublicationError(f"existing {label} drift")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.parent / (
        f".{path.name}.tmp-{os.getpid()}-{uuid.uuid4().hex}"
    )
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_NOFOLLOW", 0)
    )
    try:
        descriptor = os.open(temporary, flags, 0o644)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, path)
        temporary.unlink()
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    except OSError as error:
        raise PublicAssetPublicationError(
            f"create-only {label} publication failed"
        ) from error
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def _student_shapes(repo_root: Path) -> Mapping[str, tuple[int, ...]]:
    source = repo_root / "ml/child_board_root_policy_student.py"
    tree = ast.parse(
        _read_regular(source, "student model source").decode("utf-8"),
        filename=str(source),
    )
    for node in tree.body:
        if (
            isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name)
                and target.id == "STATE_TENSOR_SHAPES"
                for target in node.targets
            )
        ):
            value = ast.literal_eval(node.value)
            if (
                type(value) is not dict
                or any(
                    type(name) is not str
                    or type(shape) is not tuple
                    or any(type(dimension) is not int for dimension in shape)
                    for name, shape in value.items()
                )
            ):
                break
            return value
    raise PublicAssetPublicationError(
        "student STATE_TENSOR_SHAPES contract is unavailable"
    )


def _valid_sha(value: object) -> bool:
    return (
        type(value) is str
        and len(value) == 64
        and all(token in SHA256_HEX for token in value)
    )


def _require_student(
    result_path: Path,
) -> tuple[dict[str, Any], Path, Path]:
    result = _strict_json(result_path, "student terminal result")
    if (
        result.get("schema") != STUDENT_RESULT_SCHEMA
        or result.get("status") != STUDENT_STATUS
        or result.get("tune_opened") is not False
        or result.get("sealed_opened") is not False
        or result.get("live_weights_changed") is not False
    ):
        raise PublicAssetPublicationError(
            "student terminal result is not complete and locked"
        )
    runtime = result.get("runtime_artifacts")
    if type(runtime) is not dict:
        raise PublicAssetPublicationError(
            "student runtime artifact identities are absent"
        )
    paths: dict[str, Path] = {}
    for name in ("tensor", "manifest"):
        expected = runtime.get(name)
        if type(expected) is not dict or type(expected.get("path")) is not str:
            raise PublicAssetPublicationError(
                f"student {name} identity is malformed"
            )
        path = Path(expected["path"])
        if _identity(path) != expected:
            raise PublicAssetPublicationError(
                f"student {name} identity drift"
            )
        paths[name] = path
    return result, paths["tensor"], paths["manifest"]


def _validate_manifest(
    manifest_path: Path,
    tensor_path: Path,
    *,
    expected_shapes: Mapping[str, tuple[int, ...]],
) -> dict[str, Any]:
    manifest = _strict_json(manifest_path, "student manifest")
    if (
        set(manifest)
        != {
            "schema",
            "model_schema",
            "feature_version",
            "model_variant",
            "parameters",
            "format",
            "payload",
            "tensors",
            "protocol",
            "teacher_hashes",
        }
        or manifest.get("schema") != MANIFEST_SCHEMA
        or manifest.get("model_schema") != MODEL_SCHEMA
        or manifest.get("feature_version") != FEATURE_VERSION
        or manifest.get("model_variant") != MODEL_VARIANT
        or manifest.get("parameters") != PARAMETERS
        or manifest.get("format") != FORMAT
        or type(manifest.get("protocol")) is not dict
        or type(manifest.get("teacher_hashes")) is not dict
    ):
        raise PublicAssetPublicationError(
            "student manifest model contract mismatch"
        )
    tensor_raw = _read_regular(tensor_path, "student tensor")
    tensor_identity = _identity(tensor_path)
    payload = manifest.get("payload")
    if payload != tensor_identity or len(tensor_raw) != PAYLOAD_BYTES:
        raise PublicAssetPublicationError(
            "student manifest payload identity mismatch"
        )
    tensors = manifest.get("tensors")
    expected_names = sorted(expected_shapes, key=lambda value: value.encode())
    if type(tensors) is not list or len(tensors) != len(expected_names):
        raise PublicAssetPublicationError(
            "student manifest tensor set mismatch"
        )
    offset = 0
    parameters = 0
    for index, (row, name) in enumerate(zip(tensors, expected_names)):
        shape = expected_shapes[name]
        length = 4
        for dimension in shape:
            length *= dimension
        if (
            type(row) is not dict
            or set(row)
            != {"name", "shape", "dtype", "offset", "length", "sha256"}
            or row.get("name") != name
            or row.get("shape") != list(shape)
            or row.get("dtype") != "float32-le"
            or row.get("offset") != offset
            or row.get("length") != length
            or not _valid_sha(row.get("sha256"))
            or hashlib.sha256(
                tensor_raw[offset : offset + length]
            ).hexdigest()
            != row["sha256"]
        ):
            raise PublicAssetPublicationError(
                f"student manifest tensor layout mismatch at index {index}"
            )
        parameters += length // 4
        offset += length
    if offset != PAYLOAD_BYTES or parameters != PARAMETERS:
        raise PublicAssetPublicationError(
            "student manifest parameter total mismatch"
        )
    return manifest


def _public_paths(
    repo_root: Path,
    registry: Mapping[str, Any],
) -> tuple[Path, Path]:
    try:
        public = registry["outputs"]["public_student_assets"]
        tensor_relative = public["tensor_path"]
        manifest_relative = public["manifest_path"]
    except (KeyError, TypeError) as error:
        raise PublicAssetPublicationError(
            "public student asset registry is malformed"
        ) from error
    if (
        tensor_relative
        != "public/shogi-root-policy-student-v1.f32.bin"
        or manifest_relative
        != "public/shogi-root-policy-student-v1.manifest.json"
        or public.get("tensor_url")
        != "/shogi-root-policy-student-v1.f32.bin"
        or public.get("manifest_url")
        != "/shogi-root-policy-student-v1.manifest.json"
    ):
        raise PublicAssetPublicationError(
            "public student asset registry drift"
        )
    return repo_root / tensor_relative, repo_root / manifest_relative


def publish_student_public_assets(
    *,
    repo_root: Path,
    registry: Mapping[str, Any],
    result_path: Path,
    receipt_path: Path,
    registry_path: Path,
    expected_shapes_override: Mapping[str, tuple[int, ...]] | None = None,
    expected_live_nnue_override: Mapping[str, object] | None = None,
    check_only: bool = False,
) -> dict[str, Any]:
    """Validate the terminal graph, publish both assets, then its receipt."""

    result, tensor_path, manifest_path = _require_student(result_path)
    shapes = (
        expected_shapes_override
        if expected_shapes_override is not None
        else _student_shapes(repo_root)
    )
    manifest = _validate_manifest(
        manifest_path,
        tensor_path,
        expected_shapes=shapes,
    )
    if (
        manifest.get("protocol") != result.get("protocol")
        or manifest.get("teacher_hashes") != result.get("teacher_hashes")
    ):
        raise PublicAssetPublicationError(
            "student result and manifest binding mismatch"
        )
    live_nnue_path = repo_root / "public/shogi-nnue-weights.bin"
    live_nnue = _identity(live_nnue_path)
    expected_live_nnue = (
        expected_live_nnue_override
        if expected_live_nnue_override is not None
        else {
            "bytes": LIVE_NNUE_BYTES,
            "sha256": LIVE_NNUE_SHA256,
        }
    )
    if any(
        live_nnue.get(key) != value
        for key, value in expected_live_nnue.items()
    ):
        raise PublicAssetPublicationError("exact live NNUE identity drift")
    public_tensor, public_manifest = _public_paths(repo_root, registry)
    tensor_raw = _read_regular(tensor_path, "student tensor")
    manifest_raw = _read_regular(manifest_path, "student manifest")
    expected_public_tensor = _predicted_identity(public_tensor, tensor_raw)
    expected_public_manifest = _predicted_identity(
        public_manifest, manifest_raw
    )
    for path, raw, label in (
        (public_tensor, tensor_raw, "public student tensor"),
        (public_manifest, manifest_raw, "public student manifest"),
    ):
        if path.exists() and _read_regular(path, label) != raw:
            raise PublicAssetPublicationError(f"existing {label} drift")
    receipt = {
        "schema": SCHEMA,
        "status": STATUS,
        "registry": _identity(registry_path),
        "student_result": _identity(result_path),
        "source_artifacts": {
            "tensor": _identity(tensor_path),
            "manifest": _identity(manifest_path),
        },
        "public_artifacts": {
            "tensor": expected_public_tensor,
            "manifest": expected_public_manifest,
        },
        "live_nnue": live_nnue,
        "tune_opened": False,
        "sealed_opened": False,
        "live_weights_changed": False,
    }
    raw_receipt = _canonical(receipt)
    if check_only:
        return receipt
    if receipt_path.exists():
        if _read_regular(
            receipt_path, "public asset publication receipt"
        ) != raw_receipt:
            raise PublicAssetPublicationError(
                "existing public asset publication receipt drift"
            )
        if (
            _identity(public_tensor) != expected_public_tensor
            or _identity(public_manifest) != expected_public_manifest
        ):
            raise PublicAssetPublicationError(
                "existing public student asset identity drift"
            )
        return receipt
    _publish_create_only(
        public_tensor, tensor_raw, "public student tensor"
    )
    _publish_create_only(
        public_manifest, manifest_raw, "public student manifest"
    )
    if (
        _identity(public_tensor) != expected_public_tensor
        or _identity(public_manifest) != expected_public_manifest
    ):
        raise PublicAssetPublicationError(
            "published student asset identity mismatch"
        )
    _publish_create_only(
        receipt_path,
        raw_receipt,
        "public asset publication receipt",
    )
    return receipt


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument(
        "--result",
        type=Path,
        default=Path(
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "child-board-root-policy-student-runtime-v1/result.json"
        ),
    )
    parser.add_argument(
        "--receipt",
        type=Path,
        default=Path(
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "child-board-root-policy-student-runtime-v1/"
            "public-assets.receipt.json"
        ),
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="validate the complete graph without writing public assets",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        from child_board_strength_candidate_postphase_registry import (
            REGISTRY_RELATIVE_PATH,
            validate_checked_in_registry,
        )

        root = args.repo_root.resolve()
        registry = validate_checked_in_registry(root)
        receipt = publish_student_public_assets(
            repo_root=root,
            registry=registry,
            result_path=args.result,
            receipt_path=args.receipt,
            registry_path=root / REGISTRY_RELATIVE_PATH,
            check_only=args.check_only,
        )
    except (OSError, SyntaxError, PublicAssetPublicationError) as error:
        raise SystemExit(
            f"student public asset publication refused: {error}"
        ) from error
    print(
        json.dumps(
            {
                "schema": receipt["schema"],
                "status": (
                    "validated-ready-not-published"
                    if args.check_only
                    else receipt["status"]
                ),
                "public_artifacts": receipt["public_artifacts"],
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
