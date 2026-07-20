#!/usr/bin/env python3
"""Build one review-only v8 strength-first QAT plan candidate on stdout.

The production entry is argumentless and uses only the fixed local v8 teacher,
label-free role bundle, replay, initializer, and training interpreter.  It
never writes the tracked plan. A candidate is emitted only after the retained
teacher lock is acquired nonblockingly, every terminal artifact is stable,
the sole TypeScript provenance authority verifies the complete private v8
dataset, the exact 24,000-parent source accounting is recomputed, and the
target training runtime is measured. A later reviewed commit is still required
before training can use the candidate.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
import copy
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from typing import Any

import fresh_qat_parent_accounting_v2 as ACCOUNTING
import fresh_qat_protocol as FRESH
import strength_first_qat_training_bridge as BRIDGE


STRENGTH_FIRST_PLAN_CANDIDATE_COMMAND = (
    "python3 ml/build_strength_first_qat_training_plan_candidate.py"
)
STRENGTH_FIRST_V8_PROVENANCE_COMMAND = (
    "node -r tsx/cjs "
    "ml/verify-floodgate-strength-first-v8-downstream-provenance.ts"
)
STRENGTH_FIRST_TEACHER_LOCK_FILENAME = ".strength-first-teacher.lock"
_V8_PROVENANCE_ENTRY = (
    "ml/verify-floodgate-strength-first-v8-downstream-provenance.ts"
)
_PARSED_FILE_KEYS = (
    "role_bundle_manifest",
    "teacher_manifest",
    "teacher_result",
    "teacher_staged_result",
    "teacher_milestone_100",
    "teacher_milestone_500",
    "input_training",
    "parent_completion",
    "model_training",
    "replay_exclusion",
)
_FINGERPRINT_FILE_KEYS = (
    "teacher_work",
    "replay",
    "warm_initializer",
)
_TERMINAL_TEACHER_KEYS = (
    "teacher_result",
    "teacher_manifest",
    "teacher_work",
    "teacher_staged_result",
    "teacher_milestone_100",
    "teacher_milestone_500",
    "parent_completion",
    "model_training",
)
_RUNTIME_FIELDS = {
    "platform",
    "system",
    "machine",
    "processor",
    "cpu_model",
    "logical_cpu_count",
    "device",
    "python_version",
    "torch_version",
    "torch_threads",
    "torch_interop_threads",
    "deterministic_algorithms",
    "deterministic_debug_mode",
}
_POSITION_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_RUNTIME_PROBE = (
    "import json,sys;"
    "sys.path.insert(0,sys.argv[1]);"
    "import train;"
    "print(json.dumps(train.configure_sealed_torch_runtime(2),"
    "sort_keys=True,separators=(',',':'),allow_nan=False))"
)
_FIXED_RUNTIME_ENVIRONMENT = {
    "PATH": "/usr/bin:/bin",
    "HOME": "/var/empty",
    "LC_ALL": "C",
    "LANG": "C",
    "PYTHONNOUSERSITE": "1",
    "OMP_NUM_THREADS": "2",
    "MKL_NUM_THREADS": "2",
    "OPENBLAS_NUM_THREADS": "2",
    "VECLIB_MAXIMUM_THREADS": "2",
}
_INTERPRETER_STABLE_FIELDS = (
    "st_dev",
    "st_ino",
    "st_mode",
    "st_nlink",
    "st_uid",
    "st_size",
    "st_mtime_ns",
    "st_ctime_ns",
)


class StrengthFirstPlanCandidateError(ValueError):
    """The local artifacts cannot produce a reviewable plan candidate."""


def _strict_json(raw: bytes, label: str) -> dict[str, Any]:
    if type(raw) is not bytes:
        raise StrengthFirstPlanCandidateError(f"{label} is not exact bytes")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise StrengthFirstPlanCandidateError(f"{label} is not UTF-8 JSON") from error
    try:
        value = ACCOUNTING._strict_json_loads(text, label)
    except (TypeError, ValueError) as error:
        raise StrengthFirstPlanCandidateError(str(error)) from error
    if type(value) is not dict:
        raise StrengthFirstPlanCandidateError(f"{label} must be an object")
    return value


def _identity(path: str, raw: bytes) -> dict[str, Any]:
    return {
        "path": path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _require_file_identity(
    value: Any,
    *,
    path: str,
    label: str,
) -> dict[str, Any]:
    if type(value) is not dict or set(value) != {"path", "bytes", "sha256"}:
        raise StrengthFirstPlanCandidateError(f"{label} identity fields are not exact")
    if (
        value["path"] != path
        or type(value["bytes"]) is not int
        or value["bytes"] < 1
        or type(value["sha256"]) is not str
        or len(value["sha256"]) != 64
        or any(character not in "0123456789abcdef" for character in value["sha256"])
    ):
        raise StrengthFirstPlanCandidateError(f"{label} identity is invalid")
    return copy.deepcopy(value)


def _require_runtime(value: Any) -> dict[str, Any]:
    if type(value) is not dict or set(value) != _RUNTIME_FIELDS:
        raise StrengthFirstPlanCandidateError("training runtime fields are not exact")
    for field in (
        "platform",
        "system",
        "machine",
        "processor",
        "cpu_model",
        "python_version",
        "torch_version",
        "device",
        "deterministic_debug_mode",
    ):
        if type(value[field]) is not str:
            raise StrengthFirstPlanCandidateError(
                f"training runtime {field} is invalid"
            )
    for field in (
        "platform",
        "system",
        "machine",
        "cpu_model",
        "python_version",
        "torch_version",
    ):
        if not value[field]:
            raise StrengthFirstPlanCandidateError(f"training runtime {field} is empty")
    if (
        type(value["logical_cpu_count"]) is not int
        or value["logical_cpu_count"] < 1
        or value["device"] != "cpu"
        or value["torch_threads"] != 2
        or type(value["torch_threads"]) is not int
        or value["torch_interop_threads"] != 1
        or type(value["torch_interop_threads"]) is not int
        or value["deterministic_algorithms"] is not True
        or value["deterministic_debug_mode"] != "error"
    ):
        raise StrengthFirstPlanCandidateError("training runtime contract is invalid")
    return copy.deepcopy(value)


def _verify_canonical_replay_exclusion(
    raw: bytes,
    declared: Any,
) -> dict[str, Any]:
    if type(declared) is not dict:
        raise StrengthFirstPlanCandidateError("role-bundle replay exclusion is absent")
    if not raw or not raw.endswith(b"\n") or raw.endswith(b"\n\n") or b"\r" in raw:
        raise StrengthFirstPlanCandidateError(
            "replay exclusion framing is not canonical"
        )
    try:
        rows = raw[:-1].decode("ascii").split("\n")
    except UnicodeDecodeError as error:
        raise StrengthFirstPlanCandidateError(
            "replay exclusion is not canonical ASCII"
        ) from error
    encoded = [row.encode("ascii") for row in rows]
    if (
        any(_POSITION_ID_RE.fullmatch(row) is None for row in rows)
        or encoded != sorted(encoded)
        or len(rows) != len(set(rows))
    ):
        raise StrengthFirstPlanCandidateError(
            "replay exclusion identifiers are not canonical sorted unique IDs"
        )
    actual = {
        "path": "replay-excluded-position-ids.txt",
        "format": FRESH.FRESH_QAT_ID_SET_FORMAT,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "count": len(rows),
        "identifiers_sha256": hashlib.sha256(raw[:-1]).hexdigest(),
    }
    if type(declared) is not dict or declared != actual:
        raise StrengthFirstPlanCandidateError(
            "replay-exclusion manifest and canonical bytes differ"
        )
    return actual


def _derive_strength_first_qat_training_artifacts(
    *,
    role_bundle_manifest_raw: bytes,
    teacher_manifest_raw: bytes,
    teacher_result_raw: bytes,
    teacher_staged_result_raw: bytes,
    teacher_milestone_100_raw: bytes,
    teacher_milestone_500_raw: bytes,
    input_training_raw: bytes,
    parent_completion_raw: bytes,
    model_training_raw: bytes,
    replay_exclusion_raw: bytes,
    observed_fingerprints: Mapping[str, Mapping[str, Any]],
    teacher_provenance: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    if type(observed_fingerprints) is not dict or set(observed_fingerprints) != set(
        _FINGERPRINT_FILE_KEYS
    ):
        raise StrengthFirstPlanCandidateError("observed fingerprint set is not exact")
    role_manifest = _strict_json(
        role_bundle_manifest_raw,
        "strength-first role-bundle manifest",
    )
    teacher_manifest = _strict_json(
        teacher_manifest_raw,
        "strength-first teacher manifest",
    )
    teacher_result = _strict_json(
        teacher_result_raw,
        "strength-first teacher result",
    )
    completion_binding = teacher_manifest.get("parent_completion")
    try:
        accounting = BRIDGE.scan_strength_first_training_artifacts_exact(
            input_training_raw,
            parent_completion_raw,
            model_training_raw,
            expected_input_binding=(ACCOUNTING.PRODUCTION_INPUT_TRAINING_BINDING),
            expected_completion_binding=completion_binding,
        )
    except (TypeError, ValueError) as error:
        raise StrengthFirstPlanCandidateError(str(error)) from error

    replay_exclusion_parent = role_manifest.get("replay_exclusion")
    replay_exclusion = (
        replay_exclusion_parent.get("identifiers")
        if type(replay_exclusion_parent) is dict
        else None
    )
    replay_exclusion = _verify_canonical_replay_exclusion(
        replay_exclusion_raw,
        replay_exclusion,
    )

    teacher_work = _require_file_identity(
        observed_fingerprints["teacher_work"],
        path="work.jsonl",
        label="teacher work",
    )
    replay = _require_file_identity(
        observed_fingerprints["replay"],
        path="runOp1-train.jsonl",
        label="fixed replay",
    )
    warm_initializer = _require_file_identity(
        observed_fingerprints["warm_initializer"],
        path="runOp1-best.pt",
        label="warm initializer",
    )
    artifacts = {
        "role_bundle_manifest": _identity(
            "manifest.json",
            role_bundle_manifest_raw,
        ),
        "input_training": copy.deepcopy(accounting["input_training"]),
        "teacher_result": _identity(
            "result.json",
            teacher_result_raw,
        ),
        "parent_completion": copy.deepcopy(accounting["parent_completion"]),
        "model_training": {
            "path": "train.jsonl",
            "format": BRIDGE.STRENGTH_FIRST_TRAIN_FORMAT,
            **copy.deepcopy(accounting["model_training"]),
        },
        "replay_exclusion": copy.deepcopy(replay_exclusion),
        "replay": replay,
        "warm_initializer": warm_initializer,
    }
    try:
        private_bindings = (
            BRIDGE.validate_strength_first_qat_training_source_documents(
                role_manifest=role_manifest,
                teacher_manifest=teacher_manifest,
                teacher_result=teacher_result,
                teacher_provenance=teacher_provenance,
                artifacts=artifacts,
            )
        )
    except (TypeError, ValueError) as error:
        raise StrengthFirstPlanCandidateError(str(error)) from error
    actual_private = {
        "teacher_work": teacher_work,
        "teacher_manifest": _identity(
            "manifest.json",
            teacher_manifest_raw,
        ),
        "teacher_staged_result": _identity(
            "staged-result.json",
            teacher_staged_result_raw,
        ),
        "teacher_milestone_100": _identity(
            "milestone-100.json",
            teacher_milestone_100_raw,
        ),
        "teacher_milestone_500": _identity(
            "milestone-500.json",
            teacher_milestone_500_raw,
        ),
    }
    for name, identity in actual_private.items():
        if identity != private_bindings[name]:
            raise StrengthFirstPlanCandidateError(
                f"v8 outer result {name.replace('_', ' ')} binding differs"
            )

    if (
        accounting["parent_accounting"]["input_parents"]
        != ACCOUNTING.FRESH_QAT_INPUT_PARENTS
        or accounting["parent_accounting"]["replacement_parents"] != 0
        or accounting["parent_accounting"]["resampled_parents"] != 0
        or accounting["parent_accounting"]["equation_verified"] is not True
        or accounting["parent_accounting"]["emitted_order_preserved"] is not True
    ):
        raise StrengthFirstPlanCandidateError(
            "strength-first source accounting is not exact"
        )
    return copy.deepcopy(artifacts), copy.deepcopy(dict(teacher_provenance))


def _assemble_strength_first_qat_training_plan(
    artifacts: Mapping[str, Any],
    teacher_provenance: Mapping[str, Any],
    runtime: Mapping[str, Any],
) -> dict[str, Any]:
    try:
        plan = BRIDGE.build_strength_first_qat_training_plan_data(
            artifacts=artifacts,
            teacher_provenance=teacher_provenance,
            runtime=_require_runtime(runtime),
        )
    except (TypeError, ValueError) as error:
        raise StrengthFirstPlanCandidateError(str(error)) from error
    return copy.deepcopy(plan)


def build_strength_first_qat_training_plan_candidate_data(
    *,
    role_bundle_manifest_raw: bytes,
    teacher_manifest_raw: bytes,
    teacher_result_raw: bytes,
    teacher_staged_result_raw: bytes,
    teacher_milestone_100_raw: bytes,
    teacher_milestone_500_raw: bytes,
    input_training_raw: bytes,
    parent_completion_raw: bytes,
    model_training_raw: bytes,
    replay_exclusion_raw: bytes,
    observed_fingerprints: Mapping[str, Mapping[str, Any]],
    teacher_provenance: Mapping[str, Any],
    runtime: Mapping[str, Any],
) -> dict[str, Any]:
    """Recompute and return the exact plan object without writing it.

    ``observed_fingerprints`` contains the three large or opaque files that do
    not need to be materialized in memory by this builder.  This function is
    data-only: it has no filesystem, subprocess, selection, holdout, training,
    or live-weight side effects.
    """

    artifacts, verified_provenance = _derive_strength_first_qat_training_artifacts(
        role_bundle_manifest_raw=role_bundle_manifest_raw,
        teacher_manifest_raw=teacher_manifest_raw,
        teacher_result_raw=teacher_result_raw,
        teacher_staged_result_raw=teacher_staged_result_raw,
        teacher_milestone_100_raw=teacher_milestone_100_raw,
        teacher_milestone_500_raw=teacher_milestone_500_raw,
        input_training_raw=input_training_raw,
        parent_completion_raw=parent_completion_raw,
        model_training_raw=model_training_raw,
        replay_exclusion_raw=replay_exclusion_raw,
        observed_fingerprints=observed_fingerprints,
        teacher_provenance=teacher_provenance,
    )
    return _assemble_strength_first_qat_training_plan(
        artifacts,
        verified_provenance,
        runtime,
    )


def _canonical_real_path(path: str, label: str) -> str:
    if type(path) is not str or not path:
        raise StrengthFirstPlanCandidateError(f"{label} path is invalid")
    absolute = os.path.abspath(path)
    if os.path.realpath(absolute) != absolute:
        raise StrengthFirstPlanCandidateError(
            f"{label} path contains a symbolic-link component"
        )
    return absolute


def _snapshot_regular_file(
    path: str,
    *,
    label: str,
    materialize: bool,
) -> tuple[bytes | None, dict[str, Any], tuple[int, ...]]:
    absolute = _canonical_real_path(path, label)
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(absolute, flags)
    except OSError as error:
        raise StrengthFirstPlanCandidateError(
            f"{label} is absent or cannot be opened"
        ) from error
    chunks: list[bytes] | None = [] if materialize else None
    digest = hashlib.sha256()
    size = 0
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise StrengthFirstPlanCandidateError(f"{label} is not a regular file")
        get_effective_uid = getattr(os, "geteuid", None)
        if not callable(get_effective_uid):
            raise StrengthFirstPlanCandidateError(
                "effective-user ownership checks are unavailable"
            )
        if (
            before.st_uid != get_effective_uid()
            or before.st_nlink != 1
            or stat.S_IMODE(before.st_mode) not in (0o400, 0o600)
        ):
            raise StrengthFirstPlanCandidateError(
                f"{label} ownership, mode, or link count is invalid"
            )
        while True:
            block = os.read(descriptor, 1024 * 1024)
            if not block:
                break
            size += len(block)
            digest.update(block)
            if chunks is not None:
                chunks.append(block)
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
        raise StrengthFirstPlanCandidateError(f"{label} changed while being read")
    try:
        current = os.lstat(absolute)
    except OSError as error:
        raise StrengthFirstPlanCandidateError(
            f"{label} changed after being read"
        ) from error
    if (
        stat.S_ISLNK(current.st_mode)
        or current.st_dev != after.st_dev
        or current.st_ino != after.st_ino
        or current.st_size != after.st_size
        or current.st_mtime_ns != after.st_mtime_ns
        or current.st_ctime_ns != after.st_ctime_ns
        or os.path.realpath(absolute) != absolute
        or size != after.st_size
    ):
        raise StrengthFirstPlanCandidateError(
            f"{label} path or bytes changed during snapshot"
        )
    raw = b"".join(chunks) if chunks is not None else None
    stability = tuple(getattr(after, field) for field in stable_fields)
    return (
        raw,
        {
            "path": os.path.basename(absolute),
            "bytes": size,
            "sha256": digest.hexdigest(),
        },
        stability,
    )


def _revalidate_snapshot(
    path: str,
    stability: tuple[int, ...],
    *,
    label: str,
) -> None:
    absolute = _canonical_real_path(path, label)
    stable_fields = (
        "st_dev",
        "st_ino",
        "st_mode",
        "st_nlink",
        "st_size",
        "st_mtime_ns",
        "st_ctime_ns",
    )
    try:
        current = os.lstat(absolute)
    except OSError as error:
        raise StrengthFirstPlanCandidateError(
            f"{label} changed after snapshot"
        ) from error
    if (
        stat.S_ISLNK(current.st_mode)
        or tuple(getattr(current, field) for field in stable_fields) != stability
        or os.path.realpath(absolute) != absolute
    ):
        raise StrengthFirstPlanCandidateError(f"{label} changed after snapshot")


def _path_exists_without_following(path: str) -> bool:
    try:
        os.lstat(path)
    except FileNotFoundError:
        return False
    except OSError as error:
        raise StrengthFirstPlanCandidateError(
            "cannot inspect the strength-first run state"
        ) from error
    return True


def _acquire_teacher_run_lock(
    path: str,
) -> tuple[int, tuple[int, ...]]:
    absolute = _canonical_real_path(path, "retained v8 teacher lock")
    flags = os.O_RDWR | os.O_NONBLOCK
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(absolute, flags)
    except OSError as error:
        raise StrengthFirstPlanCandidateError(
            "retained v8 teacher lock is absent or cannot be opened"
        ) from error
    stable_fields = (
        "st_dev",
        "st_ino",
        "st_mode",
        "st_nlink",
        "st_size",
        "st_mtime_ns",
        "st_ctime_ns",
    )
    try:
        before = os.fstat(descriptor)
        get_effective_uid = getattr(os, "geteuid", None)
        if (
            not callable(get_effective_uid)
            or not stat.S_ISREG(before.st_mode)
            or before.st_uid != get_effective_uid()
            or before.st_nlink != 1
            or stat.S_IMODE(before.st_mode) != 0o600
        ):
            raise StrengthFirstPlanCandidateError(
                "retained v8 teacher lock identity is invalid"
            )
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (BlockingIOError, OSError) as error:
            raise StrengthFirstPlanCandidateError(
                "the v8 teacher is still active"
            ) from error
        current = os.lstat(absolute)
        stability = tuple(getattr(before, field) for field in stable_fields)
        if (
            stat.S_ISLNK(current.st_mode)
            or tuple(getattr(current, field) for field in stable_fields) != stability
        ):
            raise StrengthFirstPlanCandidateError(
                "retained v8 teacher lock changed during acquisition"
            )
        return descriptor, stability
    except BaseException:
        os.close(descriptor)
        raise


def _assert_teacher_run_lock(
    descriptor: int,
    path: str,
    stability: tuple[int, ...],
) -> None:
    absolute = _canonical_real_path(path, "retained v8 teacher lock")
    stable_fields = (
        "st_dev",
        "st_ino",
        "st_mode",
        "st_nlink",
        "st_size",
        "st_mtime_ns",
        "st_ctime_ns",
    )
    try:
        handle = os.fstat(descriptor)
        current = os.lstat(absolute)
    except OSError as error:
        raise StrengthFirstPlanCandidateError(
            "retained v8 teacher lock changed"
        ) from error
    if (
        stat.S_ISLNK(current.st_mode)
        or tuple(getattr(handle, field) for field in stable_fields) != stability
        or tuple(getattr(current, field) for field in stable_fields) != stability
    ):
        raise StrengthFirstPlanCandidateError("retained v8 teacher lock changed")


def _release_teacher_run_lock(descriptor: int) -> None:
    try:
        fcntl.flock(descriptor, fcntl.LOCK_UN)
    finally:
        os.close(descriptor)


def _snapshot_fixed_training_interpreter(
    path: str,
) -> tuple[str, dict[str, Any]]:
    python = os.path.abspath(path)
    parent = os.path.dirname(python)
    if os.path.realpath(parent) != parent:
        raise StrengthFirstPlanCandidateError(
            "fixed training interpreter parent contains a symbolic link"
        )
    try:
        entry = os.lstat(python)
        target = os.stat(python)
    except OSError as error:
        raise StrengthFirstPlanCandidateError(
            "fixed training interpreter is absent or cannot be inspected"
        ) from error
    get_effective_uid = getattr(os, "geteuid", None)
    effective_uid = get_effective_uid() if callable(get_effective_uid) else None
    if (
        effective_uid is None
        or not (stat.S_ISREG(entry.st_mode) or stat.S_ISLNK(entry.st_mode))
        or not stat.S_ISREG(target.st_mode)
        or not os.path.isfile(python)
        or not os.access(python, os.X_OK)
        or entry.st_uid not in (0, effective_uid)
        or target.st_uid not in (0, effective_uid)
        or target.st_nlink != 1
        or stat.S_IMODE(target.st_mode) & 0o022
    ):
        raise StrengthFirstPlanCandidateError(
            "fixed training interpreter identity is invalid"
        )
    return (
        python,
        {
            "entry": tuple(
                getattr(entry, field) for field in _INTERPRETER_STABLE_FIELDS
            ),
            "target": tuple(
                getattr(target, field) for field in _INTERPRETER_STABLE_FIELDS
            ),
            "realpath": os.path.realpath(python),
        },
    )


def _revalidate_fixed_training_interpreter(
    python: str,
    snapshot: Mapping[str, Any],
) -> None:
    try:
        entry = os.lstat(python)
        target = os.stat(python)
    except OSError as error:
        raise StrengthFirstPlanCandidateError(
            "fixed training interpreter changed during runtime probe"
        ) from error
    current = {
        "entry": tuple(getattr(entry, field) for field in _INTERPRETER_STABLE_FIELDS),
        "target": tuple(getattr(target, field) for field in _INTERPRETER_STABLE_FIELDS),
        "realpath": os.path.realpath(python),
    }
    if type(snapshot) is not dict or current != snapshot:
        raise StrengthFirstPlanCandidateError(
            "fixed training interpreter changed during runtime probe"
        )


def _probe_fixed_training_runtime(
    *,
    python_path: str,
    repo_root: str,
) -> dict[str, Any]:
    python, interpreter_snapshot = _snapshot_fixed_training_interpreter(python_path)
    ml_directory = os.path.join(os.path.abspath(repo_root), "ml")
    environment = dict(_FIXED_RUNTIME_ENVIRONMENT)
    temporary = os.environ.get("TMPDIR")
    if temporary:
        environment["TMPDIR"] = temporary
    try:
        completed = subprocess.run(
            [python, "-I", "-c", _RUNTIME_PROBE, ml_directory],
            cwd=repo_root,
            env=environment,
            check=True,
            capture_output=True,
            text=False,
            timeout=120,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        raise StrengthFirstPlanCandidateError(
            "fixed training runtime probe failed"
        ) from error
    finally:
        _revalidate_fixed_training_interpreter(
            python,
            interpreter_snapshot,
        )
    if (
        completed.stderr
        or not completed.stdout
        or len(completed.stdout) > 16_384
        or completed.stdout.count(b"\n") != 1
        or not completed.stdout.endswith(b"\n")
    ):
        raise StrengthFirstPlanCandidateError(
            "fixed training runtime probe output is invalid"
        )
    return _require_runtime(
        _strict_json(
            completed.stdout[:-1],
            "fixed training runtime probe",
        )
    )


def _verify_v8_downstream_provenance(
    *,
    node_path: str,
    repo_root: str,
    home: str,
) -> dict[str, Any]:
    """Run the sole row-semantic authority and accept only its safe summary."""

    node, interpreter_snapshot = _snapshot_fixed_training_interpreter(node_path)
    environment = dict(_FIXED_RUNTIME_ENVIRONMENT)
    environment["HOME"] = os.path.abspath(home)
    temporary = os.environ.get("TMPDIR")
    if temporary:
        environment["TMPDIR"] = temporary
    try:
        completed = subprocess.run(
            [
                node,
                "-r",
                "tsx/cjs",
                _V8_PROVENANCE_ENTRY,
            ],
            cwd=repo_root,
            env=environment,
            check=True,
            capture_output=True,
            text=False,
            timeout=300,
        )
    except subprocess.CalledProcessError as error:
        stderr = error.stderr
        detail = ""
        if type(stderr) is bytes and 0 < len(stderr) <= 1_024:
            try:
                decoded = stderr.decode("utf-8", errors="strict").strip()
            except UnicodeDecodeError:
                decoded = ""
            if decoded and "\x00" not in decoded and "\r" not in decoded:
                detail = f": {decoded}"
        raise StrengthFirstPlanCandidateError(
            f"v8 downstream provenance verification failed{detail}"
        ) from error
    except (OSError, subprocess.TimeoutExpired) as error:
        raise StrengthFirstPlanCandidateError(
            "v8 downstream provenance verification failed"
        ) from error
    finally:
        _revalidate_fixed_training_interpreter(
            node,
            interpreter_snapshot,
        )
    if (
        completed.stderr
        or not completed.stdout
        or len(completed.stdout) > 16_384
        or completed.stdout.count(b"\n") != 1
        or not completed.stdout.endswith(b"\n")
    ):
        raise StrengthFirstPlanCandidateError(
            "v8 downstream provenance verifier output is invalid"
        )
    summary = _strict_json(
        completed.stdout[:-1],
        "v8 downstream provenance summary",
    )
    try:
        BRIDGE._validate_teacher_provenance_summary(summary)
    except (TypeError, ValueError) as error:
        raise StrengthFirstPlanCandidateError(str(error)) from error
    return copy.deepcopy(summary)


def build_strength_first_qat_training_plan_candidate(
    *,
    repo_root: str | os.PathLike[str] | None = None,
    home: str | os.PathLike[str] | None = None,
    runtime_probe: Callable[..., Mapping[str, Any]] = (_probe_fixed_training_runtime),
    provenance_verifier: Callable[..., Mapping[str, Any]] = (
        _verify_v8_downstream_provenance
    ),
    _candidate_consumer: Callable[[Mapping[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Inspect the fixed local run and return a non-persisted plan candidate.

    The private consumer seam lets the production CLI emit stdout while the
    retained teacher lock and every source snapshot are still revalidated and
    held. Test and library callers leave it unset.
    """

    root = Path(
        repo_root if repo_root is not None else Path(__file__).resolve().parent.parent
    ).resolve()
    home_root = Path(home if home is not None else Path.home()).expanduser().resolve()
    paths = BRIDGE.default_strength_first_local_paths(
        repo_root=root,
        home=home_root,
    )
    plan_path = paths["experiment_plan"]
    teacher_root = os.path.dirname(paths["teacher_result"])
    lock_path = os.path.join(
        teacher_root,
        STRENGTH_FIRST_TEACHER_LOCK_FILENAME,
    )
    if _path_exists_without_following(plan_path):
        raise StrengthFirstPlanCandidateError(
            "the tracked strength-first plan already exists; refusing to overwrite it"
        )
    lock_descriptor, lock_stability = _acquire_teacher_run_lock(lock_path)
    try:
        if _path_exists_without_following(plan_path):
            raise StrengthFirstPlanCandidateError(
                "the tracked strength-first plan appeared during lock acquisition"
            )
        _assert_teacher_run_lock(
            lock_descriptor,
            lock_path,
            lock_stability,
        )
        for key in _TERMINAL_TEACHER_KEYS:
            if not _path_exists_without_following(paths[key]):
                raise StrengthFirstPlanCandidateError(
                    f"terminal v8 artifact is absent: {key}"
                )

        parsed: dict[str, bytes] = {}
        stability: dict[str, tuple[int, ...]] = {}
        for key in _PARSED_FILE_KEYS:
            raw, _identity_value, token = _snapshot_regular_file(
                paths[key],
                label=key.replace("_", " "),
                materialize=True,
            )
            if raw is None:
                raise StrengthFirstPlanCandidateError(
                    f"{key.replace('_', ' ')} snapshot is incomplete"
                )
            parsed[key] = raw
            stability[key] = token
        fingerprints: dict[str, dict[str, Any]] = {}
        for key in _FINGERPRINT_FILE_KEYS:
            _raw, identity, token = _snapshot_regular_file(
                paths[key],
                label=key.replace("_", " "),
                materialize=False,
            )
            fingerprints[key] = identity
            stability[key] = token

        _assert_teacher_run_lock(
            lock_descriptor,
            lock_path,
            lock_stability,
        )
        if _path_exists_without_following(plan_path):
            raise StrengthFirstPlanCandidateError(
                "the tracked strength-first plan appeared during candidate construction"
            )
        teacher_provenance = provenance_verifier(
            node_path=paths["v8_provenance_node"],
            repo_root=str(root),
            home=str(home_root),
        )
        artifacts, verified_provenance = _derive_strength_first_qat_training_artifacts(
            role_bundle_manifest_raw=parsed["role_bundle_manifest"],
            teacher_manifest_raw=parsed["teacher_manifest"],
            teacher_result_raw=parsed["teacher_result"],
            teacher_staged_result_raw=parsed["teacher_staged_result"],
            teacher_milestone_100_raw=parsed["teacher_milestone_100"],
            teacher_milestone_500_raw=parsed["teacher_milestone_500"],
            input_training_raw=parsed["input_training"],
            parent_completion_raw=parsed["parent_completion"],
            model_training_raw=parsed["model_training"],
            replay_exclusion_raw=parsed["replay_exclusion"],
            observed_fingerprints=fingerprints,
            teacher_provenance=teacher_provenance,
        )
        runtime = runtime_probe(
            python_path=paths["python"],
            repo_root=str(root),
        )
        plan = _assemble_strength_first_qat_training_plan(
            artifacts,
            verified_provenance,
            runtime,
        )
        for key, token in stability.items():
            _revalidate_snapshot(
                paths[key],
                token,
                label=key.replace("_", " "),
            )
        _assert_teacher_run_lock(
            lock_descriptor,
            lock_path,
            lock_stability,
        )
        if _path_exists_without_following(plan_path):
            raise StrengthFirstPlanCandidateError(
                "strength-first run state changed before candidate emission"
            )
        if _candidate_consumer is not None:
            _candidate_consumer(copy.deepcopy(plan))
        return plan
    finally:
        _release_teacher_run_lock(lock_descriptor)


def serialize_strength_first_qat_training_plan_candidate(
    plan: Mapping[str, Any],
) -> bytes:
    try:
        BRIDGE.validate_strength_first_qat_training_plan_data(plan)
        return (
            json.dumps(
                plan,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
                allow_nan=False,
            )
            + "\n"
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise StrengthFirstPlanCandidateError(
            "strength-first plan candidate cannot be serialized"
        ) from error


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        print(
            "[strength-first-plan-candidate] STOP: arguments are forbidden",
            file=sys.stderr,
        )
        return 2

    def emit(candidate: Mapping[str, Any]) -> None:
        serialized = serialize_strength_first_qat_training_plan_candidate(candidate)
        written = sys.stdout.buffer.write(serialized)
        if written != len(serialized):
            raise OSError("strength-first plan candidate stdout write was incomplete")
        sys.stdout.buffer.flush()

    try:
        build_strength_first_qat_training_plan_candidate(
            _candidate_consumer=emit,
        )
    except (
        OSError,
        RuntimeError,
        StrengthFirstPlanCandidateError,
        ValueError,
    ) as error:
        print(
            f"[strength-first-plan-candidate] STOP: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "STRENGTH_FIRST_PLAN_CANDIDATE_COMMAND",
    "STRENGTH_FIRST_V8_PROVENANCE_COMMAND",
    "StrengthFirstPlanCandidateError",
    "build_strength_first_qat_training_plan_candidate",
    "build_strength_first_qat_training_plan_candidate_data",
    "serialize_strength_first_qat_training_plan_candidate",
]
