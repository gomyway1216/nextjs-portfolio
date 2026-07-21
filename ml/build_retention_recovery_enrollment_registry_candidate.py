#!/usr/bin/env python3
"""Rebuild the operator-recovered retention enrollment on stdout.

The argumentless command reads only the fixed durable files.  It computes byte
length, SHA-256, and a raw newline count without decoding JSON or accessing any
label field.  It never displays dataset contents and never edits the pinned
registry or the recovered files.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import stat
import sys
from typing import Any

import retention_recovery_enrollment_registry as REGISTRY


class RecoveryEnrollmentCandidateError(ValueError):
    """The fixed durable files cannot reproduce the pinned enrollment."""


def _stat_identity(value: os.stat_result) -> tuple[int, ...]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_uid,
        value.st_gid,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
        value.st_nlink,
    )


def _validate_recovery_root(path: Path) -> Path:
    absolute = Path(os.path.abspath(path))
    try:
        identity = os.lstat(absolute)
    except OSError as error:
        raise RecoveryEnrollmentCandidateError(
            "recovered data root cannot be read"
        ) from error
    if (
        os.path.realpath(absolute) != str(absolute)
        or not stat.S_ISDIR(identity.st_mode)
        or stat.S_IMODE(identity.st_mode) != 0o700
        or identity.st_uid != os.getuid()
    ):
        raise RecoveryEnrollmentCandidateError(
            "recovered data root is not a canonical owner-only directory"
        )
    return absolute


def _read_regular_file(path: Path, label: str) -> tuple[bytes, int, int]:
    """Read one canonical 0600 file without following links or parsing rows."""

    absolute = Path(os.path.abspath(path))
    descriptor = -1
    try:
        before = os.lstat(absolute)
        if (
            os.path.realpath(absolute) != str(absolute)
            or not stat.S_ISREG(before.st_mode)
            or before.st_nlink != 1
            or stat.S_IMODE(before.st_mode) != 0o600
            or before.st_uid != os.getuid()
        ):
            raise RecoveryEnrollmentCandidateError(
                f"{label} is not a canonical owner-only single-link regular file"
            )
        descriptor = os.open(
            absolute,
            os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0),
        )
        opened_before = os.fstat(descriptor)
        if _stat_identity(before) != _stat_identity(opened_before):
            raise RecoveryEnrollmentCandidateError(
                f"{label} changed before it could be read"
            )
        digest = hashlib.sha256()
        byte_count = 0
        row_count = 0
        last_byte = b""
        while block := os.read(descriptor, 1024 * 1024):
            digest.update(block)
            byte_count += len(block)
            row_count += block.count(b"\n")
            last_byte = block[-1:]
        opened_after = os.fstat(descriptor)
        after = os.lstat(absolute)
    except RecoveryEnrollmentCandidateError:
        raise
    except OSError as error:
        raise RecoveryEnrollmentCandidateError(f"{label} cannot be read") from error
    finally:
        if descriptor >= 0:
            os.close(descriptor)

    if (
        byte_count == 0
        or last_byte != b"\n"
        or before.st_size != byte_count
        or len(
            {
                _stat_identity(value)
                for value in (before, opened_before, opened_after, after)
            }
        )
        != 1
    ):
        raise RecoveryEnrollmentCandidateError(f"{label} changed while being read")
    return digest.digest(), byte_count, row_count


def _artifact_identity(path: Path, spec: dict[str, Any]) -> dict[str, Any]:
    digest, byte_count, rows = _read_regular_file(path, str(spec["role"]))
    return {
        "role": spec["role"],
        "path": f"{REGISTRY.RECOVERY_ROOT_DISPLAY}/{spec['filename']}",
        "bytes": byte_count,
        "rows": rows,
        "sha256": digest.hex(),
        "mode": "0600",
        "line_count_method": REGISTRY.LINE_COUNT_METHOD,
    }


def build_registry_candidate(
    *,
    repo_root: str | Path | None = None,
    data_root: str | Path | None = None,
    require_pinned_match: bool = True,
) -> dict[str, Any]:
    """Recompute and validate the exact recovery enrollment."""

    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    recovered_root = _validate_recovery_root(
        Path(
            data_root
            or Path.home()
            / ".codex/shogi-data/floodgate-q1-2026-retention-recovered-v1"
        )
    )
    artifacts = [
        _artifact_identity(recovered_root / spec["filename"], spec)
        for spec in REGISTRY._ROLE_SPECS
    ]
    candidate = REGISTRY.validate_registry(
        {
            "schema": REGISTRY.REGISTRY_SCHEMA,
            "status": REGISTRY.REGISTRY_STATUS,
            "recorded_date": "2026-07-20",
            "builder_command": REGISTRY.BUILDER_COMMAND,
            "classification": "operator-recovered",
            "artifacts": artifacts,
            "source_provenance_observations": (REGISTRY.SOURCE_PROVENANCE_OBSERVATIONS),
            "historical_evidence": REGISTRY.HISTORICAL_EVIDENCE,
            "boundary": REGISTRY.BOUNDARY,
            "claims": REGISTRY.CLAIMS,
            "next_step": "separate-reviewed-downstream-retention-gate-connection",
        }
    )
    if require_pinned_match and candidate != REGISTRY.load_registry(repo_root=root):
        raise RecoveryEnrollmentCandidateError(
            "recovered files do not reproduce the pinned registry"
        )
    return candidate


def serialize_registry_candidate(value: dict[str, Any]) -> bytes:
    return REGISTRY.canonical_json_bytes(REGISTRY.validate_registry(value))


def main(argv: list[str] | None = None) -> int:
    arguments = sys.argv[1:] if argv is None else argv
    if arguments:
        print("arguments are forbidden", file=sys.stderr)
        return 2
    try:
        candidate = build_registry_candidate()
    except (OSError, ValueError) as error:
        print(f"retention recovery enrollment blocked: {error}", file=sys.stderr)
        return 2
    sys.stdout.buffer.write(serialize_registry_candidate(candidate))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
