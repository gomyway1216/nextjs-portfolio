#!/usr/bin/env python3
"""Execute the one-shot read-only HalfKP81 v4 robust adjudication.

This runner never trains or mutates weights. It reauthenticates the closed v3
artifacts, recomputes the already-known diagnostic observations, claims the new
v4 namespace, and publishes only the static adjudication receipt.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
from pathlib import Path
import secrets
import stat
import subprocess
from typing import Any, Mapping, Sequence

import direct_teacher_halfkp81_v4_robust_protocol as PROTOCOL


TRACKED_PROTOCOL = (
    Path(__file__).resolve().parent
    / "protocols"
    / "direct-teacher-halfkp81-v4-robust-adjudication-plan.json"
)


class DirectTeacherHalfkpV4RunError(ValueError):
    """The formal v4 adjudication could not be executed safely."""


def _resolve(repo_root: str, path: str) -> str:
    return path if os.path.isabs(path) else os.path.join(repo_root, path)


def _planned_file_identity(
    expected: Mapping[str, Any],
    *,
    repo_root: str,
    label: str,
) -> dict[str, Any]:
    observed = PROTOCOL.file_identity(_resolve(repo_root, expected["path"]), label)
    if any(observed[field] != expected[field] for field in ("bytes", "sha256")):
        raise DirectTeacherHalfkpV4RunError(f"{label} identity differs")
    return copy.deepcopy(dict(expected))


def _planned_json(
    expected: Mapping[str, Any],
    *,
    repo_root: str,
    label: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    path = _resolve(repo_root, expected["path"])
    value, observed = PROTOCOL.load_strict_json_file(path, label)
    if any(observed[field] != expected[field] for field in ("bytes", "sha256")):
        raise DirectTeacherHalfkpV4RunError(f"{label} identity differs")
    if type(value) is not dict or value.get("schema") != expected.get("schema"):
        raise DirectTeacherHalfkpV4RunError(f"{label} schema differs")
    return value, copy.deepcopy(dict(expected))


def _git_output(repo_root: str, *args: str) -> str:
    try:
        return subprocess.run(
            ["git", *args],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError) as error:
        raise DirectTeacherHalfkpV4RunError(f"git {' '.join(args)} failed") from error


def verify_source_revision(*, repo_root: str, diagnosis_merge_revision: str) -> str:
    revision = _git_output(repo_root, "rev-parse", "HEAD")
    dirty = _git_output(repo_root, "status", "--porcelain")
    if dirty:
        raise DirectTeacherHalfkpV4RunError("tracked source tree is not clean")
    try:
        subprocess.run(
            [
                "git",
                "merge-base",
                "--is-ancestor",
                diagnosis_merge_revision,
                revision,
            ],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise DirectTeacherHalfkpV4RunError(
            "merged diagnosis revision is not an ancestor of the execution revision"
        ) from error
    return revision


def _ensure_secure_directory(path: str) -> str:
    absolute = os.path.abspath(path)
    if not os.path.isabs(path) or path != absolute:
        raise DirectTeacherHalfkpV4RunError("publication directory is not canonical")
    current = os.path.sep
    for component in Path(absolute).parts[1:]:
        current = os.path.join(current, component)
        try:
            info = os.lstat(current)
        except FileNotFoundError:
            try:
                os.mkdir(current, 0o700)
            except FileExistsError:
                pass
            info = os.lstat(current)
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            raise DirectTeacherHalfkpV4RunError(
                f"publication directory component is unsafe: {current}"
            )
        if info.st_uid not in {0, os.getuid()} or info.st_mode & 0o022:
            raise DirectTeacherHalfkpV4RunError(
                f"publication directory ownership/mode is unsafe: {current}"
            )
    return absolute


def publish_create_only(value: Mapping[str, Any], *, path: str) -> dict[str, Any]:
    if not os.path.isabs(path) or path != os.path.abspath(path):
        raise DirectTeacherHalfkpV4RunError("publication path is not canonical")
    parent = _ensure_secure_directory(os.path.dirname(path))
    raw = PROTOCOL.canonical_json_bytes(value)
    directory_flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        directory_flags |= os.O_DIRECTORY
    if hasattr(os, "O_NOFOLLOW"):
        directory_flags |= os.O_NOFOLLOW
    directory_fd = os.open(parent, directory_flags)
    temporary_name = f".v4-tmp-{os.getpid()}-{secrets.token_hex(16)}"
    target_name = os.path.basename(path)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        try:
            descriptor = os.open(
                temporary_name,
                flags,
                0o600,
                dir_fd=directory_fd,
            )
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(raw)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temporary_name, 0o600, dir_fd=directory_fd)
            try:
                os.link(
                    temporary_name,
                    target_name,
                    src_dir_fd=directory_fd,
                    dst_dir_fd=directory_fd,
                    follow_symlinks=False,
                )
            except FileExistsError as error:
                raise DirectTeacherHalfkpV4RunError(
                    f"create-only publication already exists: {path}"
                ) from error
            os.fsync(directory_fd)
        finally:
            try:
                os.unlink(temporary_name, dir_fd=directory_fd)
            except FileNotFoundError:
                pass
            os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    return PROTOCOL.identity_for_bytes(path, raw)


def _claim_path(protocol_identity: Mapping[str, Any]) -> str:
    if protocol_identity != PROTOCOL.EXPECTED_PROTOCOL_IDENTITY:
        raise DirectTeacherHalfkpV4RunError("formal protocol identity differs")
    return os.path.join(PROTOCOL.CLAIM_DIRECTORY_PATH, "claim.json")


def preflight_publication(protocol_identity: Mapping[str, Any]) -> None:
    claim_path = _claim_path(protocol_identity)
    if os.path.lexists(PROTOCOL.CLAIM_DIRECTORY_PATH):
        raise DirectTeacherHalfkpV4RunError(
            "formal v4 family claim namespace is already consumed"
        )
    for path in (claim_path, PROTOCOL.RESULT_PATH):
        if os.path.lexists(path):
            raise DirectTeacherHalfkpV4RunError(
                f"formal v4 slot is already consumed: {path}"
            )


def publish_family_claim_once(
    value: Mapping[str, Any],
    *,
    protocol_identity: Mapping[str, Any],
) -> dict[str, Any]:
    claim_path = _claim_path(protocol_identity)
    parent = _ensure_secure_directory(os.path.dirname(PROTOCOL.CLAIM_DIRECTORY_PATH))
    if os.path.dirname(PROTOCOL.CLAIM_DIRECTORY_PATH) != parent:
        raise DirectTeacherHalfkpV4RunError("claim namespace parent differs")
    try:
        os.mkdir(PROTOCOL.CLAIM_DIRECTORY_PATH, 0o700)
    except FileExistsError as error:
        raise DirectTeacherHalfkpV4RunError(
            "formal v4 family claim namespace is already consumed"
        ) from error
    # If publication fails after the exclusive namespace claim, the directory
    # intentionally remains and the family cannot retry under another key.
    return publish_create_only(value, path=claim_path)


def _load_protocol(
    path: str, *, repo_root: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    value, observed = PROTOCOL.load_strict_json_file(path, "tracked v4 protocol")
    protocol = PROTOCOL.validate_protocol_document(value)
    relative = os.path.relpath(os.path.realpath(path), os.path.realpath(repo_root))
    if relative.startswith("../") or relative != (
        "ml/protocols/direct-teacher-halfkp81-v4-robust-adjudication-plan.json"
    ):
        raise DirectTeacherHalfkpV4RunError("v4 protocol path differs")
    identity = {
        "path": relative,
        "bytes": observed["bytes"],
        "sha256": observed["sha256"],
        "schema": PROTOCOL.PROTOCOL_SCHEMA,
    }
    if identity != PROTOCOL.EXPECTED_PROTOCOL_IDENTITY:
        raise DirectTeacherHalfkpV4RunError("tracked v4 protocol identity differs")
    return protocol, identity


def _recompute_observations(
    *,
    protocol: Mapping[str, Any],
    v3_static: Mapping[str, Any],
    repo_root: str,
) -> dict[str, float | int]:
    try:
        import analyze_direct_teacher_halfkp81_v3_quantization as DIAGNOSIS
    except ImportError as error:
        raise DirectTeacherHalfkpV4RunError(
            "merged diagnosis analyzer is unavailable"
        ) from error
    expected_analyzer = protocol["diagnosis_dependency"]["analyzer"]
    if os.path.realpath(str(DIAGNOSIS.__file__)) != os.path.realpath(
        _resolve(repo_root, expected_analyzer["path"])
    ):
        raise DirectTeacherHalfkpV4RunError("diagnosis module origin differs")
    diagnosis = DIAGNOSIS.analyze()
    observations = PROTOCOL.observations_from_diagnosis(
        diagnosis,
        v3_static=v3_static,
    )
    if observations != protocol["known_observations"]:
        raise DirectTeacherHalfkpV4RunError(
            "recomputed observations differ from values disclosed before preregistration"
        )
    for label, expected in DIAGNOSIS.EXPECTED_FILES.items():
        observed = PROTOCOL.file_identity(
            str(expected["path"]),
            f"{label} after v4 recomputation",
        )
        if any(
            observed[field] != expected[field] for field in ("path", "bytes", "sha256")
        ):
            raise DirectTeacherHalfkpV4RunError(
                f"{label} changed during v4 recomputation"
            )
    validation = diagnosis.get("inputs", {}).get("validation_dataset")
    if type(validation) is not dict:
        raise DirectTeacherHalfkpV4RunError(
            "validation identity is absent after v4 recomputation"
        )
    validation_observed = PROTOCOL.file_identity(
        str(validation["path"]),
        "validation dataset after v4 recomputation",
    )
    if any(
        validation_observed[field] != validation[field]
        for field in ("path", "bytes", "sha256")
    ):
        raise DirectTeacherHalfkpV4RunError(
            "validation dataset changed during v4 recomputation"
        )
    return observations


def run(
    *,
    protocol_path: str,
    repo_root: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    repo_root = os.path.realpath(repo_root)
    protocol, protocol_identity = _load_protocol(
        os.path.realpath(protocol_path),
        repo_root=repo_root,
    )
    dependency = protocol["diagnosis_dependency"]
    diagnosis_memo, diagnosis_identity = _planned_json(
        dependency["memo"],
        repo_root=repo_root,
        label="merged v3 diagnosis memo",
    )
    PROTOCOL.validate_diagnosis_memo(diagnosis_memo, protocol=protocol)
    _planned_file_identity(
        dependency["analyzer"],
        repo_root=repo_root,
        label="merged v3 diagnosis analyzer",
    )
    v3_static, v3_static_identity = _planned_json(
        protocol["source_v3"]["static_result"],
        repo_root=repo_root,
        label="closed v3 static result",
    )
    PROTOCOL.validate_closed_v3_static(v3_static)
    candidate_identity = _planned_file_identity(
        protocol["candidate"],
        repo_root=repo_root,
        label="frozen v3 candidate",
    )

    source_revision = verify_source_revision(
        repo_root=repo_root,
        diagnosis_merge_revision=dependency["merge_revision"],
    )
    preflight_publication(protocol_identity)
    observations = _recompute_observations(
        protocol=protocol,
        v3_static=v3_static,
        repo_root=repo_root,
    )

    # Reauthenticate every mutable external input after the long read-only
    # tensor pass and before consuming the new claim.
    _planned_json(
        dependency["memo"],
        repo_root=repo_root,
        label="v3 diagnosis memo after recomputation",
    )
    _planned_json(
        protocol["source_v3"]["static_result"],
        repo_root=repo_root,
        label="v3 static result after recomputation",
    )
    candidate_after = _planned_file_identity(
        protocol["candidate"],
        repo_root=repo_root,
        label="frozen v3 candidate after recomputation",
    )
    if candidate_after != candidate_identity:
        raise DirectTeacherHalfkpV4RunError("frozen candidate changed")
    protocol_after, protocol_identity_after = _load_protocol(
        os.path.realpath(protocol_path),
        repo_root=repo_root,
    )
    if protocol_after != protocol or protocol_identity_after != protocol_identity:
        raise DirectTeacherHalfkpV4RunError(
            "tracked v4 protocol changed during recomputation"
        )
    _planned_file_identity(
        dependency["analyzer"],
        repo_root=repo_root,
        label="merged v3 diagnosis analyzer after recomputation",
    )
    source_revision_after = verify_source_revision(
        repo_root=repo_root,
        diagnosis_merge_revision=dependency["merge_revision"],
    )
    if source_revision_after != source_revision:
        raise DirectTeacherHalfkpV4RunError(
            "source revision changed during recomputation"
        )

    claim = PROTOCOL.build_claim(
        protocol_identity=protocol_identity,
        diagnosis_identity=diagnosis_identity,
        candidate_identity=candidate_identity,
        source_revision=source_revision,
        owner_pid=os.getpid(),
        repo_root=repo_root,
    )
    claim_identity = publish_family_claim_once(
        claim,
        protocol_identity=protocol_identity,
    )
    result = PROTOCOL.build_result(
        protocol_identity=protocol_identity,
        diagnosis_identity=diagnosis_identity,
        v3_static_identity=v3_static_identity,
        candidate_identity=candidate_identity,
        claim=claim,
        observations=observations,
        repo_root=repo_root,
    )
    PROTOCOL.validate_result(result, repo_root=repo_root)
    result_identity = publish_create_only(result, path=PROTOCOL.RESULT_PATH)
    return result, claim_identity, result_identity


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the frozen-candidate HalfKP81 v4 robust adjudication."
    )
    parser.add_argument(
        "--protocol",
        default=str(TRACKED_PROTOCOL),
        help="exact tracked v4 protocol",
    )
    parser.add_argument(
        "--repo-root",
        default=str(Path(__file__).resolve().parent.parent),
        help="clean repository root containing the merged diagnosis",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    result, claim_identity, result_identity = run(
        protocol_path=args.protocol,
        repo_root=args.repo_root,
    )
    print(
        json.dumps(
            {
                "result": result,
                "claim_identity": claim_identity,
                "result_identity": result_identity,
            },
            ensure_ascii=False,
            sort_keys=True,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
