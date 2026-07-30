#!/usr/bin/env python3
"""Authenticate selection evidence and publish one immutable depth18 plan.

This command does not run the teacher and does not create any formal JSONL or
receipt artifact.  It only publishes ``teacher-plan.json`` after authenticating
the selected parents, the merged source revision, the tracked preregistration,
and the pinned YaneuraOu assets.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import secrets
import stat
import subprocess
from typing import Any, Mapping

import halfkp81_depth18_strength_protocol as PROTOCOL


REPO_ROOT = Path(__file__).resolve().parents[1]
PLAN_FILENAME = "teacher-plan.json"
FORMAL_OUTPUT_FILENAMES = {
    "fit_jsonl": "fit.jsonl",
    "tune_jsonl": "tune.jsonl",
    "sealed_jsonl": "sealed.jsonl",
    "work_jsonl": "teacher-work.jsonl",
    "milestone_100_json": "teacher-milestone-100.json",
    "milestone_500_json": "teacher-milestone-500.json",
    "terminal_fault_json": "teacher-terminal-fault.json",
    "receipt_json": "teacher-receipt.json",
    "verified_artifact_receipt_json": ("teacher-verified-artifact-receipt.json"),
}
PUBLICATION_RECEIPT_SCHEMA = (
    "shogi-halfkp81-hard-depth18-teacher-plan-publication-receipt-v1"
)


class TeacherPlanPublicationError(PROTOCOL.Halfkp81Depth18StrengthError):
    """Teacher-plan authentication or create-only publication failed."""


def _read_descriptor(descriptor: int) -> bytes:
    chunks: list[bytes] = []
    while True:
        chunk = os.read(descriptor, 1024 * 1024)
        if not chunk:
            return b"".join(chunks)
        chunks.append(chunk)


def _held_regular_file(path: Path, label: str) -> tuple[bytes, os.stat_result]:
    try:
        before_path = path.lstat()
    except OSError as error:
        raise TeacherPlanPublicationError(f"{label} cannot be statted") from error
    if stat.S_ISLNK(before_path.st_mode) or not stat.S_ISREG(before_path.st_mode):
        raise TeacherPlanPublicationError(f"{label} must be a regular non-symlink file")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise TeacherPlanPublicationError(f"{label} cannot be opened") from error
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or (before.st_dev, before.st_ino) != (
            before_path.st_dev,
            before_path.st_ino,
        ):
            raise TeacherPlanPublicationError(f"{label} changed during open")
        first = _read_descriptor(descriptor)
        after_first = os.fstat(descriptor)
        os.lseek(descriptor, 0, os.SEEK_SET)
        second = _read_descriptor(descriptor)
        after_second = os.fstat(descriptor)
        try:
            after_path = path.lstat()
        except OSError as error:
            raise TeacherPlanPublicationError(
                f"{label} disappeared during authentication"
            ) from error
        signatures = {
            (
                value.st_dev,
                value.st_ino,
                value.st_size,
                value.st_mtime_ns,
                value.st_ctime_ns,
            )
            for value in (before, after_first, after_second, after_path)
        }
        if len(signatures) != 1 or first != second:
            raise TeacherPlanPublicationError(
                f"{label} changed during stable held read"
            )
        return first, before
    finally:
        os.close(descriptor)


def _verify_declared_file_identity(
    declared: Mapping[str, Any],
    *,
    repo_root: Path,
    label: str,
) -> bytes:
    declared_path = declared.get("path")
    if type(declared_path) is not str:
        raise TeacherPlanPublicationError(f"{label} path is invalid")
    path = Path(declared_path)
    if not path.is_absolute():
        path = repo_root / path
    raw, _file_stat = _held_regular_file(path, label)
    if len(raw) != declared.get("bytes") or hashlib.sha256(
        raw
    ).hexdigest() != declared.get("sha256"):
        raise TeacherPlanPublicationError(f"{label} differs from fixed bytes/SHA-256")
    return raw


def _verify_preregistration(repo_root: Path) -> None:
    raw = _verify_declared_file_identity(
        PROTOCOL.EXPECTED_PREREGISTRATION_IDENTITY,
        repo_root=repo_root,
        label="tracked preregistration",
    )
    try:
        value = json.loads(
            raw,
            parse_constant=lambda constant: (_ for _ in ()).throw(
                TeacherPlanPublicationError(
                    f"tracked preregistration contains {constant}"
                )
            ),
        )
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as error:
        raise TeacherPlanPublicationError(
            "tracked preregistration is invalid JSON"
        ) from error
    if type(value) is not dict or PROTOCOL.canonical_json_bytes(value) != raw:
        raise TeacherPlanPublicationError(
            "tracked preregistration is not canonical JSON"
        )
    PROTOCOL.validate_preregistration_document(value)


def _verify_engine_assets(repo_root: Path) -> None:
    engine = PROTOCOL.EXPECTED_ENGINE
    _verify_declared_file_identity(
        engine["binary"], repo_root=repo_root, label="YaneuraOu binary"
    )
    _verify_declared_file_identity(
        engine["eval_file"], repo_root=repo_root, label="YaneuraOu eval file"
    )
    eval_file = engine["eval_file"]
    tree_payload = (
        "eval-tree-v1\0"
        + json.dumps(
            {
                "path": Path(str(eval_file["path"])).name,
                "bytes": eval_file["bytes"],
                "sha256": eval_file["sha256"],
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    ).encode("utf-8")
    if hashlib.sha256(tree_payload).hexdigest() != engine["eval_tree_sha256"]:
        raise TeacherPlanPublicationError("YaneuraOu eval-tree identity differs")


def _verify_merged_revision(revision: str, repo_root: Path) -> None:
    if (
        type(revision) is not str
        or PROTOCOL.REVISION_RE.fullmatch(revision) is None
        or revision == "0" * 40
    ):
        raise TeacherPlanPublicationError("expected merged revision is invalid")
    environment = {
        "LANG": "C",
        "LC_ALL": "C",
        "PATH": "/usr/bin:/bin",
        "TZ": "UTC",
    }

    def git(*arguments: str) -> str:
        return subprocess.run(
            ["/usr/bin/git", *arguments],
            cwd=repo_root,
            env=environment,
            check=True,
            capture_output=True,
            text=True,
        ).stdout

    try:
        head = git("rev-parse", "--verify", "HEAD^{commit}").strip()
        remote_main = git(
            "rev-parse", "--verify", "refs/remotes/origin/main^{commit}"
        ).strip()
        status = git(
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise TeacherPlanPublicationError(
            "cannot authenticate exact merged source revision"
        ) from error
    if head != revision or remote_main != revision:
        raise TeacherPlanPublicationError(
            "expected revision must equal clean HEAD and origin/main"
        )
    if status:
        raise TeacherPlanPublicationError("teacher plan source checkout is not clean")


def _canonical_output_directory(path: str) -> Path:
    if type(path) is not str:
        raise TeacherPlanPublicationError(
            "output directory must be an absolute canonical path"
        )
    candidate = Path(path)
    if not candidate.is_absolute() or os.path.normpath(path) != path:
        raise TeacherPlanPublicationError(
            "output directory must be an absolute canonical path"
        )
    try:
        path_stat = candidate.lstat()
    except FileNotFoundError:
        try:
            candidate.mkdir(mode=0o700)
        except OSError as error:
            raise TeacherPlanPublicationError(
                "output directory could not be created"
            ) from error
        path_stat = candidate.lstat()
    except OSError as error:
        raise TeacherPlanPublicationError(
            "output directory cannot be statted"
        ) from error
    if stat.S_ISLNK(path_stat.st_mode) or not stat.S_ISDIR(path_stat.st_mode):
        raise TeacherPlanPublicationError(
            "output directory must be a real non-symlink directory"
        )
    return candidate


def build_teacher_plan(
    *,
    selection_jsonl_path: str,
    selection_manifest_path: str,
    expected_merged_revision: str,
    output_directory: str,
    repo_root: Path = REPO_ROOT,
) -> dict[str, Any]:
    """Reauthenticate every authority input and construct the sealed plan."""

    root = repo_root.resolve()
    _verify_merged_revision(expected_merged_revision, root)
    _verify_preregistration(root)
    _verify_engine_assets(root)
    evidence = PROTOCOL.authenticate_selection_artifacts(
        selection_jsonl_path,
        selection_manifest_path,
        expected_source_revision=expected_merged_revision,
    )
    directory = _canonical_output_directory(output_directory)
    evidence_document = copy.deepcopy(dict(evidence.document))
    manifest = evidence_document["selection_manifest"]
    outputs = {
        "directory": str(directory),
        "plan_json": str(directory / PLAN_FILENAME),
        **{
            field: str(directory / filename)
            for field, filename in FORMAL_OUTPUT_FILENAMES.items()
        },
    }
    plan = {
        "schema": PROTOCOL.TEACHER_PLAN_SCHEMA,
        "status": "sealed-not-executed",
        "source_revision": expected_merged_revision,
        "preregistration": copy.deepcopy(PROTOCOL.EXPECTED_PREREGISTRATION_IDENTITY),
        "selection_manifest": {
            key: manifest[key] for key in ("path", "bytes", "sha256", "schema")
        },
        "selection_evidence": evidence_document,
        "selection_roles": copy.deepcopy(PROTOCOL.EXPECTED_ROLE_COUNTS),
        "engine": copy.deepcopy(PROTOCOL.EXPECTED_ENGINE),
        "teacher": copy.deepcopy(PROTOCOL.EXPECTED_TEACHER),
        "outputs": outputs,
        "authority": {
            "may_execute_teacher": True,
            "may_train": False,
            "may_play_formal_games": False,
            "may_write_live_weights": False,
        },
    }
    return _validate_and_recheck_teacher_plan(
        plan,
        evidence=evidence,
        expected_merged_revision=expected_merged_revision,
        repo_root=root,
    )


def _validate_and_recheck_teacher_plan(
    plan: Mapping[str, Any],
    *,
    evidence: PROTOCOL.AuthenticatedSelectionEvidence,
    expected_merged_revision: str,
    repo_root: Path,
) -> dict[str, Any]:
    validated = PROTOCOL.validate_teacher_plan(
        plan,
        authenticated_selection=evidence,
        expected_source_revision=expected_merged_revision,
    )
    _verify_merged_revision(expected_merged_revision, repo_root)
    return validated


def _open_output_directory(directory: Path) -> int:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(directory, flags)
    except OSError as error:
        raise TeacherPlanPublicationError(
            "output directory cannot be opened safely"
        ) from error
    try:
        opened = os.fstat(descriptor)
        current = directory.lstat()
    except OSError as error:
        os.close(descriptor)
        raise TeacherPlanPublicationError(
            "output directory changed during safe open"
        ) from error
    if not stat.S_ISDIR(opened.st_mode) or (opened.st_dev, opened.st_ino) != (
        current.st_dev,
        current.st_ino,
    ):
        os.close(descriptor)
        raise TeacherPlanPublicationError("output directory changed during safe open")
    return descriptor


def _verify_output_directory(directory: Path, descriptor: int) -> None:
    try:
        opened = os.fstat(descriptor)
        current = directory.lstat()
    except OSError as error:
        raise TeacherPlanPublicationError(
            "output directory changed during publication"
        ) from error
    if (
        not stat.S_ISDIR(opened.st_mode)
        or stat.S_ISLNK(current.st_mode)
        or (opened.st_dev, opened.st_ino) != (current.st_dev, current.st_ino)
    ):
        raise TeacherPlanPublicationError("output directory changed during publication")


def _name_exists(directory_fd: int, name: str) -> bool:
    try:
        os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    except FileNotFoundError:
        return False
    except OSError as error:
        raise TeacherPlanPublicationError(
            f"cannot inspect reserved output {name}"
        ) from error
    return True


def _read_published(directory_fd: int, name: str) -> tuple[bytes, os.stat_result]:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(name, flags, dir_fd=directory_fd)
    except OSError as error:
        raise TeacherPlanPublicationError(
            "published teacher plan cannot be opened safely"
        ) from error
    try:
        file_stat = os.fstat(descriptor)
        if not stat.S_ISREG(file_stat.st_mode):
            raise TeacherPlanPublicationError(
                "published teacher plan is not a regular file"
            )
        return _read_descriptor(descriptor), file_stat
    finally:
        os.close(descriptor)


def _verify_published_file(
    *,
    directory_fd: int,
    name: str,
    raw: bytes,
    expected_inode: tuple[int, int],
) -> None:
    observed_raw, observed = _read_published(directory_fd, name)
    after = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    if (
        (observed.st_dev, observed.st_ino) != expected_inode
        or (after.st_dev, after.st_ino) != expected_inode
        or observed_raw != raw
        or hashlib.sha256(observed_raw).digest() != hashlib.sha256(raw).digest()
    ):
        raise TeacherPlanPublicationError(
            "published teacher plan identity/content differs"
        )


def _rollback_published_file(
    *,
    directory_fd: int,
    name: str,
    raw: bytes,
    expected_inode: tuple[int, int],
) -> None:
    try:
        _verify_published_file(
            directory_fd=directory_fd,
            name=name,
            raw=raw,
            expected_inode=expected_inode,
        )
        os.unlink(name, dir_fd=directory_fd)
        os.fsync(directory_fd)
    except (OSError, TeacherPlanPublicationError) as error:
        raise TeacherPlanPublicationError(
            "teacher plan publication failed and rollback was unsafe"
        ) from error


def publish_teacher_plan(
    plan: Mapping[str, Any],
    *,
    output_directory: str,
) -> dict[str, Any]:
    """Publish canonical ``teacher-plan.json`` once, without replacement."""

    directory = _canonical_output_directory(output_directory)
    expected_path = str(directory / PLAN_FILENAME)
    if plan.get("outputs", {}).get("plan_json") != expected_path:
        raise TeacherPlanPublicationError(
            "teacher plan output path differs from publication target"
        )
    raw = PROTOCOL.canonical_json_bytes(plan)
    directory_fd = _open_output_directory(directory)
    temporary_name = f".{PLAN_FILENAME}.{secrets.token_hex(16)}.tmp"
    temporary_created = False
    published_inode: tuple[int, int] | None = None
    try:
        for name in (PLAN_FILENAME, *FORMAL_OUTPUT_FILENAMES.values()):
            if _name_exists(directory_fd, name):
                raise TeacherPlanPublicationError(
                    f"reserved output already exists: {name}"
                )
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        try:
            temporary_fd = os.open(temporary_name, flags, 0o600, dir_fd=directory_fd)
        except OSError as error:
            raise TeacherPlanPublicationError(
                "teacher plan temporary file creation failed"
            ) from error
        temporary_created = True
        try:
            written = 0
            while written < len(raw):
                count = os.write(temporary_fd, raw[written:])
                if count < 1:
                    raise TeacherPlanPublicationError(
                        "teacher plan temporary write made no progress"
                    )
                written += count
            os.fsync(temporary_fd)
            temporary_stat = os.fstat(temporary_fd)
            published_inode = (temporary_stat.st_dev, temporary_stat.st_ino)
        finally:
            os.close(temporary_fd)
        try:
            os.link(
                temporary_name,
                PLAN_FILENAME,
                src_dir_fd=directory_fd,
                dst_dir_fd=directory_fd,
                follow_symlinks=False,
            )
        except FileExistsError as error:
            raise TeacherPlanPublicationError(
                "teacher plan destination appeared during create-only publication"
            ) from error
        except OSError as error:
            raise TeacherPlanPublicationError(
                "teacher plan create-only hardlink failed"
            ) from error
        try:
            _verify_published_file(
                directory_fd=directory_fd,
                name=PLAN_FILENAME,
                raw=raw,
                expected_inode=published_inode,
            )
            _verify_output_directory(directory, directory_fd)
            for name in FORMAL_OUTPUT_FILENAMES.values():
                if _name_exists(directory_fd, name):
                    raise TeacherPlanPublicationError(
                        f"reserved formal output appeared during publication: {name}"
                    )
            os.fsync(directory_fd)
        except (OSError, TeacherPlanPublicationError):
            _rollback_published_file(
                directory_fd=directory_fd,
                name=PLAN_FILENAME,
                raw=raw,
                expected_inode=published_inode,
            )
            raise
        os.unlink(temporary_name, dir_fd=directory_fd)
        temporary_created = False
        os.fsync(directory_fd)
    finally:
        try:
            if temporary_created:
                try:
                    os.unlink(temporary_name, dir_fd=directory_fd)
                    os.fsync(directory_fd)
                except FileNotFoundError:
                    pass
        finally:
            os.close(directory_fd)
    return {
        "path": expected_path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": PROTOCOL.TEACHER_PLAN_SCHEMA,
    }


def build_and_publish(
    *,
    selection_jsonl_path: str,
    selection_manifest_path: str,
    expected_merged_revision: str,
    output_directory: str,
    repo_root: Path = REPO_ROOT,
) -> dict[str, Any]:
    plan = build_teacher_plan(
        selection_jsonl_path=selection_jsonl_path,
        selection_manifest_path=selection_manifest_path,
        expected_merged_revision=expected_merged_revision,
        output_directory=output_directory,
        repo_root=repo_root,
    )
    return publish_teacher_plan(plan, output_directory=output_directory)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selection-jsonl", required=True)
    parser.add_argument("--selection-manifest", required=True)
    parser.add_argument("--expected-merged-revision", required=True)
    parser.add_argument("--output-directory", required=True)
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        identity = build_and_publish(
            selection_jsonl_path=args.selection_jsonl,
            selection_manifest_path=args.selection_manifest,
            expected_merged_revision=args.expected_merged_revision,
            output_directory=args.output_directory,
        )
    except (
        OSError,
        TypeError,
        ValueError,
        TeacherPlanPublicationError,
        PROTOCOL.Halfkp81Depth18StrengthError,
    ) as error:
        print(f"[halfkp81-depth18-teacher-plan] STOP: {error}")
        return 1
    print(
        json.dumps(
            {
                "schema": PUBLICATION_RECEIPT_SCHEMA,
                "status": "teacher-plan-published-teacher-not-started",
                "teacher_plan": identity,
                "formal_artifacts_created": False,
                "may_write_live_weights": False,
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
