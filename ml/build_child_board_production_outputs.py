#!/usr/bin/env python3
"""Publish the strict post-build output descriptor consumed by tune gating.

Next/Turbopack assigns opaque names to route and Worker chunks.  This producer
discovers the six frozen output roles from the completed production graph,
proves the main Shogi route -> student Worker -> embedded-WASM dependency
chain, and publishes the descriptor create-only.  Missing, ambiguous,
symlinked, or escaped paths fail closed.
"""

from __future__ import annotations

import argparse
import base64
from collections.abc import Mapping, Sequence
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from typing import Any
import uuid


SCHEMA = "shogi-child-board-root-policy-production-build-outputs-v1"
DESCRIPTOR_RELATIVE_PATH = Path(
    ".next/shogi-production-build-outputs.json"
)
ROUTE_MANIFEST_RELATIVE_PATH = Path(
    ".next/server/app/games/shogi/page_client-reference-manifest.js"
)
WASM_SOURCE_RELATIVE_PATH = Path(
    "src/components/game/ShogiImproved/wasm/shogi.wasm"
)
SHOGI_CLIENT_MODULE = (
    "[project]/src/components/game/ShogiImproved/ShogiImproved.tsx"
)
STUDENT_TENSOR_URL = "/shogi-root-policy-student-v1.f32.bin"
STUDENT_MANIFEST_URL = (
    "/shogi-root-policy-student-v1.manifest.json"
)
STUDENT_MANIFEST_SCHEMA = (
    "shogi-child-board-root-policy-student-manifest-v1"
)
_BUILD_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_CHUNK_RELATIVE = re.compile(
    r"^static/chunks/[A-Za-z0-9_.-]+\.js$"
)
_WORKER_GROUP = re.compile(
    rb'"(?P<runtime>static/chunks/turbopack-worker-'
    rb'[A-Za-z0-9_.-]+\.js)",\[(?P<dependencies>'
    rb'(?:"static/chunks/[A-Za-z0-9_.-]+\.js",?)*)\]'
)


class BuildOutputsError(ValueError):
    """The production build graph cannot be bound without ambiguity."""


def _reject_constant(value: str) -> None:
    raise BuildOutputsError(f"non-finite JSON number is forbidden: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise BuildOutputsError(f"duplicate JSON key is forbidden: {key}")
        result[key] = value
    return result


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


def _require_directory(path: Path, label: str) -> Path:
    try:
        metadata = path.lstat()
    except OSError as error:
        raise BuildOutputsError(f"{label} is unavailable: {path}") from error
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
        raise BuildOutputsError(
            f"{label} must be a real non-symlink directory"
        )
    return path.resolve(strict=True)


def _relative_parts(relative: Path, label: str) -> tuple[str, ...]:
    if relative.is_absolute() or not relative.parts or any(
        part in {"", ".", ".."} for part in relative.parts
    ):
        raise BuildOutputsError(f"{label} must be a confined relative path")
    return relative.parts


def _read_confined_regular(
    root: Path,
    relative: Path,
    label: str,
) -> tuple[Path, bytes]:
    root_resolved = _require_directory(root, f"{label} root")
    current = root
    parts = _relative_parts(relative, label)
    for index, part in enumerate(parts):
        current = current / part
        try:
            metadata = current.lstat()
        except OSError as error:
            raise BuildOutputsError(
                f"{label} is unavailable: {current}"
            ) from error
        if stat.S_ISLNK(metadata.st_mode):
            raise BuildOutputsError(f"{label} crosses a symlink: {current}")
        if index < len(parts) - 1:
            if not stat.S_ISDIR(metadata.st_mode):
                raise BuildOutputsError(
                    f"{label} parent is not a directory: {current}"
                )
        elif not stat.S_ISREG(metadata.st_mode):
            raise BuildOutputsError(
                f"{label} must be a regular non-symlink file"
            )
    resolved = current.resolve(strict=True)
    if not resolved.is_relative_to(root_resolved):
        raise BuildOutputsError(f"{label} escapes its fixed root")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(current, flags)
        with os.fdopen(descriptor, "rb") as stream:
            return resolved, stream.read()
    except OSError as error:
        raise BuildOutputsError(
            f"{label} could not be read safely"
        ) from error


def _embedded_route_manifest(raw: bytes) -> dict[str, Any]:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise BuildOutputsError(
            "Shogi route client manifest is not UTF-8"
        ) from error
    marker = (
        'globalThis.__RSC_MANIFEST["/games/shogi/page"] = '
    )
    start = text.find(marker)
    if start < 0:
        raise BuildOutputsError(
            "Shogi route client manifest assignment is absent"
        )
    payload = text[start + len(marker) :]
    decoder = json.JSONDecoder(
        object_pairs_hook=_unique_object,
        parse_constant=_reject_constant,
    )
    try:
        document, end = decoder.raw_decode(payload)
    except (json.JSONDecodeError, BuildOutputsError) as error:
        raise BuildOutputsError(
            "Shogi route client manifest payload is not strict JSON"
        ) from error
    if payload[end:].strip() not in {"", ";"} or type(document) is not dict:
        raise BuildOutputsError(
            "Shogi route client manifest wrapper is malformed"
        )
    return document


def _route_chunk_urls(document: Mapping[str, Any]) -> tuple[str, ...]:
    modules = document.get("clientModules")
    if type(modules) is not dict:
        raise BuildOutputsError(
            "Shogi route client module graph is absent"
        )
    rows = [
        value
        for key, value in modules.items()
        if key
        in {
            SHOGI_CLIENT_MODULE,
            f"{SHOGI_CLIENT_MODULE} <module evaluation>",
        }
    ]
    if len(rows) != 2 or any(type(row) is not dict for row in rows):
        raise BuildOutputsError(
            "exact Shogi client module graph is absent"
        )
    chunk_lists = [row.get("chunks") for row in rows]
    if (
        any(type(chunks) is not list for chunks in chunk_lists)
        or chunk_lists[0] != chunk_lists[1]
        or any(type(url) is not str for url in chunk_lists[0])
    ):
        raise BuildOutputsError("Shogi client chunk graph is malformed")
    return tuple(chunk_lists[0])


def _url_to_chunk_relative(url: str, label: str) -> Path:
    prefix = "/_next/"
    if not url.startswith(prefix):
        raise BuildOutputsError(f"{label} URL is outside /_next")
    relative_text = url[len(prefix) :]
    if not _CHUNK_RELATIVE.fullmatch(relative_text):
        raise BuildOutputsError(f"{label} URL is not a static JS chunk")
    return Path(relative_text)


def _worker_dependency_groups(raw: bytes) -> list[tuple[Path, tuple[Path, ...]]]:
    groups: list[tuple[Path, tuple[Path, ...]]] = []
    for match in _WORKER_GROUP.finditer(raw):
        try:
            dependencies = json.loads(
                b"[" + match.group("dependencies") + b"]"
            )
        except json.JSONDecodeError as error:
            raise BuildOutputsError(
                "worker dependency array is malformed"
            ) from error
        if (
            type(dependencies) is not list
            or not dependencies
            or any(
                type(value) is not str
                or not _CHUNK_RELATIVE.fullmatch(value)
                for value in dependencies
            )
        ):
            raise BuildOutputsError(
                "worker dependency array is malformed"
            )
        groups.append(
            (
                Path(match.group("runtime").decode("ascii")),
                tuple(Path(value) for value in dependencies),
            )
        )
    if not groups:
        raise BuildOutputsError(
            "Turbopack worker dependency graph is absent"
        )
    return groups


def _single(
    candidates: Sequence[Path],
    label: str,
) -> Path:
    unique = tuple(dict.fromkeys(candidates))
    if len(unique) != 1:
        raise BuildOutputsError(
            f"exactly one {label} is required; found {len(unique)}"
        )
    return unique[0]


def _output_row(
    path: Path,
    *,
    media_type: str,
    url: str,
) -> dict[str, str]:
    return {
        "path": str(path.resolve(strict=True)),
        "media_type": media_type,
        "url": url,
    }


def _publish_create_only(
    path: Path,
    raw: bytes,
    *,
    build_root: Path,
) -> None:
    try:
        relative = path.relative_to(build_root)
    except ValueError as error:
        raise BuildOutputsError(
            "descriptor path is outside the production build root"
        ) from error
    parts = _relative_parts(relative, "descriptor path")
    if len(parts) != 1:
        raise BuildOutputsError(
            "descriptor must be a direct production build-root child"
        )
    _require_directory(build_root, "production build root")
    if path.exists() or path.is_symlink():
        _resolved, existing = _read_confined_regular(
            build_root, relative, "production build output descriptor"
        )
        if existing != raw:
            raise BuildOutputsError(
                "existing production build output descriptor drift"
            )
        return
    temporary = build_root / (
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
        directory = os.open(build_root, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    except OSError as error:
        raise BuildOutputsError(
            "create-only production build output descriptor publication failed"
        ) from error
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def produce_production_build_outputs(
    *,
    repo_root: Path,
    registry: Mapping[str, Any],
    descriptor_path: Path | None = None,
) -> dict[str, Any]:
    """Discover the exact production graph and publish its descriptor."""

    repo_root = _require_directory(repo_root, "repository root")
    build_root = _require_directory(
        repo_root / ".next", "production build root"
    )
    descriptor_path = (
        descriptor_path
        if descriptor_path is not None
        else repo_root / DESCRIPTOR_RELATIVE_PATH
    )
    if not descriptor_path.is_absolute():
        descriptor_path = repo_root / descriptor_path
    descriptor_path = descriptor_path.resolve(strict=False)

    build_id_path, build_id_raw = _read_confined_regular(
        build_root, Path("BUILD_ID"), "Next build ID"
    )
    del build_id_path
    try:
        build_id = build_id_raw.decode("ascii").strip()
    except UnicodeDecodeError as error:
        raise BuildOutputsError("Next build ID is not ASCII") from error
    if not _BUILD_ID.fullmatch(build_id):
        raise BuildOutputsError("Next build ID is malformed")
    manifest_relative = Path(
        f"static/{build_id}/_buildManifest.js"
    )
    production_manifest, _manifest_raw = _read_confined_regular(
        build_root,
        manifest_relative,
        "production build manifest",
    )

    route_relative = ROUTE_MANIFEST_RELATIVE_PATH.relative_to(".next")
    _route_manifest, route_raw = _read_confined_regular(
        build_root,
        route_relative,
        "Shogi route client manifest",
    )
    route_document = _embedded_route_manifest(route_raw)
    route_urls = _route_chunk_urls(route_document)
    route_chunks: list[tuple[Path, str, bytes]] = []
    for url in route_urls:
        relative = _url_to_chunk_relative(url, "Shogi route chunk")
        path, raw = _read_confined_regular(
            build_root, relative, "Shogi route chunk"
        )
        route_chunks.append((path, url, raw))
    main_candidates = [
        (path, url, raw)
        for path, url, raw in route_chunks
        if (
            b"shogi-ai.worker." in raw
            and b"turbopack-worker-" in raw
            and b"student_enabled" in raw
        )
    ]
    main_path = _single(
        [row[0] for row in main_candidates],
        "main Shogi search chunk",
    )
    main_path_row = next(
        row for row in main_candidates if row[0] == main_path
    )
    main_url = main_path_row[1]
    dependency_groups = _worker_dependency_groups(main_path_row[2])

    dependencies = {
        relative
        for _runtime, group in dependency_groups
        for relative in group
    }
    dependency_raw: dict[Path, bytes] = {}
    for relative in dependencies:
        _path, raw = _read_confined_regular(
            build_root, relative, "worker dependency chunk"
        )
        dependency_raw[relative] = raw
    student_relative = _single(
        [
            relative
            for relative, raw in dependency_raw.items()
            if (
                STUDENT_TENSOR_URL.encode("ascii") in raw
                and STUDENT_MANIFEST_URL.encode("ascii") in raw
                and STUDENT_MANIFEST_SCHEMA.encode("ascii") in raw
                and b"student is callable only at root ply zero" in raw
            )
        ],
        "student-capable worker chunk",
    )
    student_groups = [
        (runtime, group)
        for runtime, group in dependency_groups
        if student_relative in group
    ]
    if len(student_groups) != 1:
        raise BuildOutputsError(
            "student-capable worker must belong to exactly one worker graph"
        )
    runtime_relative, student_group = student_groups[0]
    _read_confined_regular(
        build_root, runtime_relative, "student worker runtime chunk"
    )

    _wasm_source, wasm_raw = _read_confined_regular(
        repo_root,
        WASM_SOURCE_RELATIVE_PATH,
        "frozen WASM source",
    )
    wasm_base64 = base64.b64encode(wasm_raw)
    wasm_sha256 = hashlib.sha256(wasm_raw).hexdigest().encode("ascii")
    wasm_relative = _single(
        [
            relative
            for relative in student_group
            if (
                wasm_base64 in dependency_raw[relative]
                and wasm_sha256 in dependency_raw[relative]
                and b"WebAssembly.Module" in dependency_raw[relative]
            )
        ],
        "student-worker embedded WASM chunk",
    )

    try:
        public = registry["outputs"]["public_student_assets"]
        tensor_relative = Path(public["tensor_path"])
        manifest_public_relative = Path(public["manifest_path"])
        tensor_url = public["tensor_url"]
        manifest_url = public["manifest_url"]
        tensor_media_type = public["tensor_media_type"]
    except (KeyError, TypeError) as error:
        raise BuildOutputsError(
            "public student asset registry is malformed"
        ) from error
    if (
        tensor_url != STUDENT_TENSOR_URL
        or manifest_url != STUDENT_MANIFEST_URL
        or type(tensor_media_type) is not str
        or not tensor_media_type
    ):
        raise BuildOutputsError(
            "public student asset registry path/URL contract mismatch"
        )
    tensor_path, _tensor_raw = _read_confined_regular(
        repo_root, tensor_relative, "public student tensor"
    )
    manifest_path, _student_manifest_raw = _read_confined_regular(
        repo_root,
        manifest_public_relative,
        "public student manifest",
    )

    student_worker_path, _ = _read_confined_regular(
        build_root, student_relative, "student-capable worker chunk"
    )
    wasm_path, _ = _read_confined_regular(
        build_root, wasm_relative, "student-worker embedded WASM chunk"
    )
    outputs = {
        "production_build_manifest": _output_row(
            production_manifest,
            media_type="application/javascript; charset=utf-8",
            url=f"/_next/{manifest_relative.as_posix()}",
        ),
        "main_search_chunk": _output_row(
            main_path,
            media_type="application/javascript; charset=utf-8",
            url=main_url,
        ),
        "student_worker_chunk": _output_row(
            student_worker_path,
            media_type="application/javascript; charset=utf-8",
            url=f"/_next/{student_relative.as_posix()}",
        ),
        "wasm_asset": _output_row(
            wasm_path,
            media_type="application/javascript; charset=utf-8",
            url=f"/_next/{wasm_relative.as_posix()}",
        ),
        "student_tensor": _output_row(
            tensor_path,
            media_type=tensor_media_type,
            url=tensor_url,
        ),
        "student_manifest": _output_row(
            manifest_path,
            media_type="application/json; charset=utf-8",
            url=manifest_url,
        ),
    }
    path_url_pairs = {
        (row["path"], row["url"]) for row in outputs.values()
    }
    if len(path_url_pairs) != len(outputs):
        raise BuildOutputsError(
            "production output path/URL pairs must be unique"
        )
    descriptor = {"schema": SCHEMA, "outputs": outputs}
    _publish_create_only(
        descriptor_path,
        _canonical(descriptor),
        build_root=build_root,
    )
    return descriptor


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        from child_board_strength_candidate_postphase_registry import (
            validate_checked_in_registry,
        )

        root = args.repo_root.resolve()
        registry = validate_checked_in_registry(root)
        descriptor = produce_production_build_outputs(
            repo_root=root,
            registry=registry,
        )
    except (BuildOutputsError, OSError) as error:
        raise SystemExit(
            f"production build output descriptor refused: {error}"
        ) from error
    print(
        json.dumps(
            {
                "schema": descriptor["schema"],
                "roles": sorted(descriptor["outputs"]),
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
