#!/usr/bin/python3
"""Darwin-only renameatx_np helper for held parent and source descriptors."""

from __future__ import annotations

import ctypes
import errno
import os
import stat
import sys
from typing import NoReturn, Optional


PARENT_FD = 3
SOURCE_FD = 4
RENAME_EXCL = 0x00000004
RENAME_NOFOLLOW_ANY = 0x00000010
PRECONDITION_EXIT = 72
DESTINATION_EXISTS_EXIT = 73
SYSCALL_FAILURE_EXIT = 74
INDETERMINATE_EXIT = 75


def fail(message: str, code: int) -> NoReturn:
    sys.stderr.write(f"{message}\n")
    raise SystemExit(code)


def basename(value: str, label: str) -> bytes:
    if (
        not value
        or value in {".", ".."}
        or "/" in value
        or "\x00" in value
        or any(ord(character) < 32 or ord(character) == 127 for character in value)
        or os.path.basename(value) != value
    ):
        fail(f"invalid {label} basename", PRECONDITION_EXIT)
    return os.fsencode(value)


def identity(value: str, label: str) -> int:
    try:
        parsed = int(value, 10)
    except ValueError:
        fail(f"invalid expected {label}", PRECONDITION_EXIT)
    if parsed < 0 or str(parsed) != value:
        fail(f"invalid expected {label}", PRECONDITION_EXIT)
    return parsed


def same_identity(value: os.stat_result, expected_dev: int, expected_ino: int) -> bool:
    return value.st_dev == expected_dev and value.st_ino == expected_ino


def owned_private_directory(value: os.stat_result) -> bool:
    return (
        stat.S_ISDIR(value.st_mode)
        and value.st_uid == os.geteuid()
        and stat.S_IMODE(value.st_mode) == 0o700
    )


def stat_at_parent(name: bytes) -> Optional[os.stat_result]:
    try:
        return os.stat(name, dir_fd=PARENT_FD, follow_symlinks=False)
    except FileNotFoundError:
        return None


def main() -> None:
    if sys.platform != "darwin":
        fail(
            "exclusive directory rename requires Darwin renameatx_np",
            PRECONDITION_EXIT,
        )
    if len(sys.argv) != 6 or sys.argv[1] not in {"inspect", "rename"}:
        fail(
            "usage: helper MODE SOURCE DESTINATION EXPECTED_DEV EXPECTED_INO",
            PRECONDITION_EXIT,
        )

    mode = sys.argv[1]
    source = basename(sys.argv[2], "source")
    destination = basename(sys.argv[3], "destination")
    if source == destination:
        fail("source and destination basenames must differ", PRECONDITION_EXIT)
    expected_dev = identity(sys.argv[4], "device")
    expected_ino = identity(sys.argv[5], "inode")

    try:
        parent_stat = os.fstat(PARENT_FD)
        held_source_stat = os.fstat(SOURCE_FD)
    except OSError as error:
        fail(
            f"invalid held descriptor: errno={error.errno}",
            PRECONDITION_EXIT,
        )
    if not owned_private_directory(parent_stat):
        fail("held parent is not an owner-only directory", PRECONDITION_EXIT)
    if not owned_private_directory(held_source_stat):
        fail("held source is not an owner-only directory", PRECONDITION_EXIT)
    if not same_identity(held_source_stat, expected_dev, expected_ino):
        fail("held source identity differs from expected", PRECONDITION_EXIT)

    try:
        source_at_parent = stat_at_parent(source)
        destination_at_parent = stat_at_parent(destination)
    except OSError as error:
        fail(
            f"pathname inspection failed: errno={error.errno}",
            PRECONDITION_EXIT,
        )
    source_matches = source_at_parent is not None and same_identity(
        source_at_parent,
        expected_dev,
        expected_ino,
    )
    destination_matches = destination_at_parent is not None and same_identity(
        destination_at_parent,
        expected_dev,
        expected_ino,
    )

    if mode == "inspect":
        if source_matches and not destination_matches:
            sys.stdout.write("source\n")
        elif destination_matches and source_at_parent is None:
            sys.stdout.write("destination\n")
        else:
            sys.stdout.write("other\n")
        return

    if source_at_parent is None:
        fail("source pathname is missing", PRECONDITION_EXIT)
    if not owned_private_directory(source_at_parent) or not same_identity(
        source_at_parent,
        expected_dev,
        expected_ino,
    ):
        fail("source pathname no longer names held source", PRECONDITION_EXIT)

    try:
        libc = ctypes.CDLL(None, use_errno=True)
        renameatx_np = libc.renameatx_np
    except (OSError, AttributeError) as error:
        fail(
            f"Darwin libc or renameatx_np is unavailable: {error}",
            PRECONDITION_EXIT,
        )
    renameatx_np.argtypes = [
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_uint,
    ]
    renameatx_np.restype = ctypes.c_int
    result = renameatx_np(
        PARENT_FD,
        source,
        PARENT_FD,
        destination,
        RENAME_EXCL | RENAME_NOFOLLOW_ANY,
    )
    if result != 0:
        error_number = ctypes.get_errno()
        message = os.strerror(error_number) if error_number else "unknown error"
        if error_number == errno.EEXIST:
            fail(
                f"exclusive rename destination exists: errno={error_number}: {message}",
                DESTINATION_EXISTS_EXIT,
            )
        fail(
            f"exclusive rename failed: errno={error_number}: {message}",
            SYSCALL_FAILURE_EXIT,
        )

    try:
        destination_after = stat_at_parent(destination)
        parent_after = os.fstat(PARENT_FD)
        held_source_after = os.fstat(SOURCE_FD)
    except OSError as error:
        fail(
            f"post-rename identity check failed: errno={error.errno}",
            INDETERMINATE_EXIT,
        )
    if (
        destination_after is None
        or not owned_private_directory(destination_after)
        or not same_identity(destination_after, expected_dev, expected_ino)
        or parent_after.st_dev != parent_stat.st_dev
        or parent_after.st_ino != parent_stat.st_ino
        or not same_identity(held_source_after, expected_dev, expected_ino)
    ):
        fail("post-rename identity changed", INDETERMINATE_EXIT)

    try:
        source_after = stat_at_parent(source)
    except OSError as error:
        fail(
            f"source postcondition failed: errno={error.errno}",
            INDETERMINATE_EXIT,
        )
    if source_after is None:
        return
    fail("source pathname exists after rename", INDETERMINATE_EXIT)


if __name__ == "__main__":
    main()
