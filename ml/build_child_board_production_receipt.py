#!/usr/bin/env python3
"""Create the one-shot production-build receipt required before tune.

The build itself may emit hashed chunk names, so its exact six output roles are
provided by a strict post-build descriptor.  This producer verifies every
source/output byte, the clean public-main tree, the completed frozen student,
the build environment, and protected-state closure before it publishes the
create-only receipt.
"""

from __future__ import annotations

import argparse
from collections.abc import Mapping, Sequence
import hashlib
import json
import os
from pathlib import Path
import platform
import stat
import subprocess
from typing import Any
import uuid

from build_child_board_production_outputs import (
    BuildOutputsError,
    produce_production_build_outputs,
)


SCHEMA = "shogi-child-board-root-policy-production-build-receipt-v1"
STATUS = "complete-production-build-frozen-tune-locked"
STUDENT_STATUS = "complete-fit-only-student-frozen-tune-locked"
PUBLICATION_SCHEMA = (
    "shogi-child-board-root-policy-public-assets-receipt-v1"
)
PUBLICATION_STATUS = "complete-frozen-student-public-assets-create-only"
OUTPUT_ROLES = (
    "production_build_manifest",
    "main_search_chunk",
    "student_worker_chunk",
    "wasm_asset",
    "student_tensor",
    "student_manifest",
)
SOURCE_PATHS = {
    "search": "src/components/game/ShogiImproved/shogiAiWorkerClient.ts",
    "worker": "src/components/game/ShogiImproved/shogi-ai.worker.ts",
    "wasm_wrapper": "src/components/game/ShogiImproved/wasmEngine.ts",
    "wasm_source": "src/components/game/ShogiImproved/wasm/shogi.wasm",
    "transposition_table": "src/components/game/ShogiImproved/sharedTT.ts",
    "package_manifest": "package.json",
    "lockfile": "package-lock.json",
    "next_config": "next.config.ts",
    "typescript_config": "tsconfig.json",
    "live_nnue": "public/shogi-nnue-weights.bin",
    "build_output_descriptor": (
        "ml/build_child_board_production_outputs.py"
    ),
}
ENVIRONMENT_ALLOWLIST = (
    "CI",
    "NEXT_TELEMETRY_DISABLED",
    "NODE_ENV",
)


class BuildReceiptError(ValueError):
    """The production build graph is incomplete or not reproducibly bound."""


def _reject_constant(value: str) -> None:
    raise BuildReceiptError(f"non-finite JSON number is forbidden: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise BuildReceiptError(f"duplicate JSON key is forbidden: {key}")
        result[key] = value
    return result


def _read_regular(path: Path, label: str) -> bytes:
    try:
        metadata = path.lstat()
    except OSError as error:
        raise BuildReceiptError(f"{label} is unavailable: {path}") from error
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise BuildReceiptError(f"{label} must be a regular non-symlink file")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
        with os.fdopen(descriptor, "rb") as stream:
            return stream.read()
    except OSError as error:
        raise BuildReceiptError(f"{label} could not be read safely") from error


def _strict_json(path: Path, label: str) -> dict[str, Any]:
    raw = _read_regular(path, label)
    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BuildReceiptError(f"{label} is not strict UTF-8 JSON") from error
    if type(value) is not dict:
        raise BuildReceiptError(f"{label} root must be an object")
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


def _fingerprint(path: Path) -> dict[str, object]:
    resolved = path.resolve(strict=True)
    raw = _read_regular(resolved, str(resolved))
    return {
        "path": str(resolved),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _publish_create_only(path: Path, raw: bytes) -> None:
    if path.exists():
        if _read_regular(path, "production build receipt") != raw:
            raise BuildReceiptError("existing production build receipt drift")
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
        descriptor = os.open(temporary, flags, 0o600)
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
        raise BuildReceiptError(
            "create-only production build receipt publication failed"
        ) from error
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def _run(
    command: Sequence[str],
    *,
    cwd: Path,
) -> str:
    try:
        completed = subprocess.run(
            list(command),
            cwd=cwd,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        stderr = getattr(error, "stderr", "")
        raise BuildReceiptError(
            f"command failed: {' '.join(command)}: {stderr}".strip()
        ) from error
    return completed.stdout.strip()


def _require_student(
    result_path: Path,
) -> tuple[dict[str, Any], dict[str, object], dict[str, object]]:
    result = _strict_json(result_path, "student terminal result")
    if (
        result.get("schema")
        != "shogi-child-board-root-policy-student-runtime-result-v1"
        or result.get("status") != STUDENT_STATUS
        or result.get("tune_opened") is not False
        or result.get("sealed_opened") is not False
        or result.get("live_weights_changed") is not False
    ):
        raise BuildReceiptError("student terminal result is not complete and locked")
    runtime = result.get("runtime_artifacts")
    if type(runtime) is not dict:
        raise BuildReceiptError("student runtime artifact receipts are absent")
    captured: dict[str, dict[str, object]] = {}
    for name in ("tensor", "manifest"):
        identity = runtime.get(name)
        if type(identity) is not dict or type(identity.get("path")) is not str:
            raise BuildReceiptError(f"student {name} identity is malformed")
        actual = _fingerprint(Path(identity["path"]))
        if identity != actual:
            raise BuildReceiptError(f"student {name} identity drift")
        captured[name] = actual
    return result, captured["tensor"], captured["manifest"]


def _require_closed(registry: Mapping[str, Any]) -> None:
    for lane in ("tune", "sealed"):
        outputs = registry["outputs"][lane]
        for key in ("opened_marker", "pending_result", "result"):
            if Path(outputs[key]).exists():
                raise BuildReceiptError(
                    f"{lane} protected scoring state is already open"
                )


def _require_publication(
    repo_root: Path,
    registry: Mapping[str, Any],
    *,
    student_result_identity: Mapping[str, object],
    tensor: Mapping[str, object],
    manifest: Mapping[str, object],
    student_result_path: Path,
) -> dict[str, object]:
    receipt_path = student_result_path.parent / "public-assets.receipt.json"
    receipt = _strict_json(
        receipt_path, "public asset publication receipt"
    )
    try:
        public = registry["outputs"]["public_student_assets"]
        tensor_path = repo_root / public["tensor_path"]
        manifest_path = repo_root / public["manifest_path"]
    except (KeyError, TypeError) as error:
        raise BuildReceiptError(
            "public student asset registry is malformed"
        ) from error
    public_tensor = _fingerprint(tensor_path)
    public_manifest = _fingerprint(manifest_path)
    live_nnue = _fingerprint(repo_root / SOURCE_PATHS["live_nnue"])
    registry_identity = receipt.get("registry")
    registry_valid = (
        type(registry_identity) is dict
        and type(registry_identity.get("path")) is str
        and _fingerprint(Path(registry_identity["path"]))
        == registry_identity
    )
    if (
        set(receipt)
        != {
            "schema",
            "status",
            "registry",
            "student_result",
            "source_artifacts",
            "public_artifacts",
            "live_nnue",
            "tune_opened",
            "sealed_opened",
            "live_weights_changed",
        }
        or receipt.get("schema") != PUBLICATION_SCHEMA
        or receipt.get("status") != PUBLICATION_STATUS
        or not registry_valid
        or receipt.get("student_result") != student_result_identity
        or receipt.get("source_artifacts")
        != {"tensor": tensor, "manifest": manifest}
        or receipt.get("public_artifacts")
        != {"tensor": public_tensor, "manifest": public_manifest}
        or receipt.get("live_nnue") != live_nnue
        or receipt.get("tune_opened") is not False
        or receipt.get("sealed_opened") is not False
        or receipt.get("live_weights_changed") is not False
        or public_tensor["bytes"] != tensor["bytes"]
        or public_tensor["sha256"] != tensor["sha256"]
        or public_manifest["bytes"] != manifest["bytes"]
        or public_manifest["sha256"] != manifest["sha256"]
    ):
        raise BuildReceiptError(
            "public student asset publication is absent or drifted"
        )
    return _fingerprint(receipt_path)


def _find_student_runtime(repo_root: Path) -> Path:
    candidates: list[Path] = []
    root = repo_root / "src/components/game/ShogiImproved"
    for path in root.glob("*.ts"):
        raw = _read_regular(path, "student runtime source")
        if (
            b"/shogi-root-policy-student-v1.f32.bin" in raw
            and b"/shogi-root-policy-student-v1.manifest.json" in raw
        ):
            candidates.append(path)
    if len(candidates) != 1:
        raise BuildReceiptError(
            "exactly one tensor-and-manifest-bound student runtime source "
            "must exist before the production build"
        )
    return candidates[0]


def _source_receipts(
    repo_root: Path,
    *,
    student_tensor: Mapping[str, object],
    student_manifest: Mapping[str, object],
    publication_receipt: Mapping[str, object],
    source_paths_override: Mapping[str, Path] | None,
) -> dict[str, dict[str, object]]:
    if source_paths_override is None:
        paths = {
            role: repo_root / relative
            for role, relative in SOURCE_PATHS.items()
        }
        paths["student_runtime"] = _find_student_runtime(repo_root)
    else:
        paths = dict(source_paths_override)
    required = {"student_runtime", *SOURCE_PATHS}
    if set(paths) != required:
        raise BuildReceiptError("production source role set mismatch")
    receipts = {role: _fingerprint(path) for role, path in paths.items()}
    receipts["student_tensor"] = dict(student_tensor)
    receipts["student_manifest"] = dict(student_manifest)
    receipts["public_asset_publication"] = dict(publication_receipt)
    return receipts


def _output_receipts(
    descriptor: Mapping[str, Any],
) -> dict[str, dict[str, object]]:
    if (
        set(descriptor) != {"schema", "outputs"}
        or descriptor["schema"]
        != "shogi-child-board-root-policy-production-build-outputs-v1"
        or type(descriptor["outputs"]) is not dict
        or set(descriptor["outputs"]) != set(OUTPUT_ROLES)
    ):
        raise BuildReceiptError("post-build output descriptor role set mismatch")
    outputs: dict[str, dict[str, object]] = {}
    seen: set[tuple[str, str]] = set()
    for role in OUTPUT_ROLES:
        row = descriptor["outputs"][role]
        if (
            type(row) is not dict
            or set(row) != {"path", "media_type", "url"}
            or type(row["path"]) is not str
            or type(row["media_type"]) is not str
            or not row["media_type"]
            or type(row["url"]) is not str
            or not row["url"]
        ):
            raise BuildReceiptError(f"output descriptor malformed: {role}")
        identity = _fingerprint(Path(row["path"]))
        key = (identity["path"], row["url"])
        if key in seen:
            raise BuildReceiptError("production output path/URL pairs must be unique")
        seen.add(key)
        outputs[role] = {
            **identity,
            "media_type": row["media_type"],
            "url": row["url"],
        }
    return outputs


def _verify_existing_receipt(
    receipt: Mapping[str, Any],
    *,
    student_result_identity: Mapping[str, object],
) -> None:
    expected_keys = {
        "schema",
        "status",
        "student_result",
        "sources",
        "outputs",
        "environment",
        "tune_opened",
        "sealed_opened",
        "live_weights_changed",
    }
    if (
        set(receipt) != expected_keys
        or receipt.get("schema") != SCHEMA
        or receipt.get("status") != STATUS
        or receipt.get("student_result") != student_result_identity
        or receipt.get("tune_opened") is not False
        or receipt.get("sealed_opened") is not False
        or receipt.get("live_weights_changed") is not False
        or type(receipt.get("sources")) is not dict
        or type(receipt.get("outputs")) is not dict
        or type(receipt.get("environment")) is not dict
    ):
        raise BuildReceiptError("existing production build receipt drift")
    if set(receipt["outputs"]) != set(OUTPUT_ROLES):
        raise BuildReceiptError("existing production output role set drift")
    for collection_name in ("sources", "outputs"):
        for role, identity in receipt[collection_name].items():
            required = {"path", "bytes", "sha256"}
            if (
                type(identity) is not dict
                or not required.issubset(identity)
                or type(identity["path"]) is not str
            ):
                raise BuildReceiptError(
                    f"existing {collection_name} identity malformed: {role}"
                )
            actual = _fingerprint(Path(identity["path"]))
            if any(identity[key] != actual[key] for key in required):
                raise BuildReceiptError(
                    f"existing {collection_name} identity drift: {role}"
                )


def produce_production_build_receipt(
    *,
    repo_root: Path,
    registry: Mapping[str, Any],
    outputs_descriptor_path: Path,
    result_path: Path,
    run_build: bool = True,
    source_paths_override: Mapping[str, Path] | None = None,
    environment_override: Mapping[str, object] | None = None,
) -> dict[str, Any]:
    """Execute/attest the single build and publish its immutable receipt."""

    student_result_path = Path(
        registry["outputs"]["student_runtime"]["result"]
    )
    _student, tensor, manifest = _require_student(student_result_path)
    _require_closed(registry)
    student_result_identity = _fingerprint(student_result_path)
    publication_receipt = _require_publication(
        repo_root,
        registry,
        student_result_identity=student_result_identity,
        tensor=tensor,
        manifest=manifest,
        student_result_path=student_result_path,
    )
    if result_path.exists():
        existing = _strict_json(result_path, "production build receipt")
        _verify_existing_receipt(
            existing,
            student_result_identity=student_result_identity,
        )
        return existing
    sources = _source_receipts(
        repo_root,
        student_tensor=tensor,
        student_manifest=manifest,
        publication_receipt=publication_receipt,
        source_paths_override=source_paths_override,
    )
    if environment_override is None:
        if _run(
            ["git", "status", "--porcelain", "--untracked-files=no"],
            cwd=repo_root,
        ):
            raise BuildReceiptError("tracked worktree must be clean before build")
        commit = _run(["git", "rev-parse", "HEAD"], cwd=repo_root)
        remote_main = _run(
            ["git", "rev-parse", "origin/main"], cwd=repo_root
        )
        if commit != remote_main:
            raise BuildReceiptError("production build must use current public main")
        tree = _run(["git", "rev-parse", "HEAD^{tree}"], cwd=repo_root)
        if run_build:
            subprocess.run(
                ["npm", "run", "build"],
                cwd=repo_root,
                check=True,
            )
            produce_production_build_outputs(
                repo_root=repo_root,
                registry=registry,
                descriptor_path=outputs_descriptor_path,
            )
        package = _strict_json(repo_root / "package.json", "package manifest")
        dependencies = {
            **(
                package.get("dependencies")
                if type(package.get("dependencies")) is dict
                else {}
            ),
            **(
                package.get("devDependencies")
                if type(package.get("devDependencies")) is dict
                else {}
            ),
        }
        environment: Mapping[str, object] = {
            "node": _run(["node", "--version"], cwd=repo_root),
            "npm": _run(["npm", "--version"], cwd=repo_root),
            "next": dependencies.get("next"),
            "typescript": dependencies.get("typescript"),
            "os": platform.system(),
            "architecture": platform.machine(),
            "build_command": ["npm", "run", "build"],
            "environment_allowlist": {
                key: os.environ[key]
                for key in ENVIRONMENT_ALLOWLIST
                if key in os.environ
            },
            "source_git_commit": commit,
            "clean_tracked_tree_sha256": tree,
        }
    else:
        environment = dict(environment_override)
    descriptor = _strict_json(
        outputs_descriptor_path, "post-build output descriptor"
    )
    outputs = _output_receipts(descriptor)
    if (
        outputs["student_tensor"]["sha256"] != tensor["sha256"]
        or outputs["student_tensor"]["bytes"] != tensor["bytes"]
        or outputs["student_manifest"]["sha256"] != manifest["sha256"]
        or outputs["student_manifest"]["bytes"] != manifest["bytes"]
    ):
        raise BuildReceiptError(
            "emitted student assets differ from frozen runtime artifacts"
        )
    receipt = {
        "schema": SCHEMA,
        "status": STATUS,
        "student_result": student_result_identity,
        "sources": sources,
        "outputs": outputs,
        "environment": environment,
        "tune_opened": False,
        "sealed_opened": False,
        "live_weights_changed": False,
    }
    _publish_create_only(result_path, _canonical(receipt))
    return receipt


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument(
        "--outputs-descriptor",
        type=Path,
        default=Path(".next/shogi-production-build-outputs.json"),
    )
    parser.add_argument(
        "--result",
        type=Path,
        default=Path(
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "child-board-root-policy-student-runtime-v1/"
            "production-build-receipt.json"
        ),
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="validate an already completed one-shot build",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        from child_board_strength_candidate_postphase_registry import (
            validate_checked_in_registry,
        )

        root = args.repo_root.resolve()
        registry = validate_checked_in_registry(root)
        receipt = produce_production_build_receipt(
            repo_root=root,
            registry=registry,
            outputs_descriptor_path=(
                args.outputs_descriptor
                if args.outputs_descriptor.is_absolute()
                else root / args.outputs_descriptor
            ),
            result_path=args.result,
            run_build=not args.skip_build,
        )
    except (
        OSError,
        subprocess.CalledProcessError,
        BuildOutputsError,
        BuildReceiptError,
    ) as error:
        raise SystemExit(f"production build receipt refused: {error}") from error
    print(
        json.dumps(
            {
                "schema": receipt["schema"],
                "status": receipt["status"],
                "student_result": receipt["student_result"],
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
