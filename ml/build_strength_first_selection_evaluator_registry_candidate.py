#!/usr/bin/env python3
"""Build one review-only strength-first selection-evaluator registry candidate.

The production CLI is argumentless and writes exactly one pretty JSON
candidate to stdout.  It never edits the tracked registry.  A candidate is
emitted only after the five evaluator implementation sources are recomputed
from exact HEAD, the public three-checkpoint preflight has actually run, and
the fixed private selection-teacher artifacts plus stable checkpoint have
been bound and revalidated.  Final-holdout and live-weight paths are not part
of this builder.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
import copy
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
from typing import Any

import run_strength_first_selection_teacher_preflight as TEACHER_PREFLIGHT
import strength_first_qat_selection_evaluator as EVALUATOR
from fresh_qat_selection_preflight import _verify_tracked_file


STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_CANDIDATE_COMMAND = (
    "python3 ml/build_strength_first_selection_evaluator_registry_candidate.py"
)

_PREFLIGHT_SUMMARY_FIELDS = {
    "schema",
    "status",
    "training_plan",
    "selection_preflight_registry",
    "checkpoint_preflight_sha256",
    "strict_loaded_seeds",
    "strict_loaded_checkpoints",
    "selection_source_opened",
    "network_requests",
    "live_weight_writes",
}
_PRIVATE_DOCUMENTS = {
    "selection_teacher_authority": (
        EVALUATOR.STRENGTH_FIRST_SELECTION_TEACHER_AUTHORITY_SCHEMA
    ),
    "selection_teacher_manifest": (
        EVALUATOR.STRENGTH_FIRST_SELECTION_TEACHER_MANIFEST_SCHEMA
    ),
    "selection_teacher_result": (
        EVALUATOR.STRENGTH_FIRST_SELECTION_TEACHER_RESULT_SCHEMA
    ),
}


class StrengthFirstSelectionEvaluatorRegistryCandidateError(ValueError):
    """The fixed artifacts cannot produce one reviewable READY candidate."""


def _stat_identity(value: os.stat_result) -> tuple[int, ...]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_uid,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
        value.st_nlink,
    )


def _read_canonical_regular_file(path: str, label: str) -> bytes:
    absolute = os.path.abspath(path)
    descriptor = -1
    try:
        before = os.lstat(absolute)
        if (
            os.path.realpath(absolute) != absolute
            or not stat.S_ISREG(before.st_mode)
            or before.st_nlink != 1
        ):
            raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
                f"{label} is not a canonical regular file"
            )
        descriptor = os.open(
            absolute,
            os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0),
        )
        opened_before = os.fstat(descriptor)
        if (
            _stat_identity(before) != _stat_identity(opened_before)
            or not stat.S_ISREG(opened_before.st_mode)
            or opened_before.st_nlink != 1
        ):
            raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
                f"{label} changed before it could be read"
            )
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            raw = source.read()
        opened_after = os.fstat(descriptor)
        after = os.lstat(absolute)
    except OSError as error:
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            f"{label} cannot be read"
        ) from error
    finally:
        if descriptor >= 0:
            try:
                os.close(descriptor)
            except OSError:
                pass
    if (
        not raw
        or len(
            {
                _stat_identity(value)
                for value in (before, opened_before, opened_after, after)
            }
        )
        != 1
        or before.st_size != len(raw)
    ):
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            f"{label} changed while being read"
        )
    return raw


def _fingerprint_canonical_regular_file(path: str, label: str) -> dict[str, Any]:
    absolute = os.path.abspath(path)
    descriptor = -1
    try:
        before = os.lstat(absolute)
        if (
            os.path.realpath(absolute) != absolute
            or not stat.S_ISREG(before.st_mode)
            or before.st_nlink != 1
        ):
            raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
                f"{label} is not a canonical single-link regular file"
            )
        descriptor = os.open(
            absolute,
            os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0),
        )
        opened_before = os.fstat(descriptor)
        if (
            _stat_identity(before) != _stat_identity(opened_before)
            or not stat.S_ISREG(opened_before.st_mode)
            or opened_before.st_nlink != 1
        ):
            raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
                f"{label} changed before it could be fingerprinted"
            )
        digest = hashlib.sha256()
        byte_count = 0
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            byte_count += len(chunk)
        observed = {
            "bytes": byte_count,
            "sha256": digest.hexdigest(),
        }
        opened_after = os.fstat(descriptor)
        after = os.lstat(absolute)
    except (OSError, ValueError) as error:
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            f"{label} cannot be fingerprinted"
        ) from error
    finally:
        if descriptor >= 0:
            try:
                os.close(descriptor)
            except OSError:
                pass
    if (
        type(observed) is not dict
        or set(observed) != {"bytes", "sha256"}
        or type(observed["bytes"]) is not int
        or observed["bytes"] < 1
        or len(
            {
                _stat_identity(value)
                for value in (before, opened_before, opened_after, after)
            }
        )
        != 1
        or before.st_size != observed["bytes"]
    ):
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            f"{label} fingerprint is invalid"
        )
    EVALUATOR._sha256(observed["sha256"], f"{label} SHA-256")
    return copy.deepcopy(observed)


def _artifact_identity(
    *,
    path: str,
    schema: str,
    raw: bytes,
) -> dict[str, Any]:
    identity = {
        "path": path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": schema,
    }
    EVALUATOR._identity(identity, f"candidate artifact {path}")
    return identity


def _fingerprinted_identity(
    *,
    path: str,
    schema: str,
    fingerprint: Mapping[str, Any],
) -> dict[str, Any]:
    if type(fingerprint) is not dict or set(fingerprint) != {"bytes", "sha256"}:
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            f"candidate artifact {path} fingerprint fields are not exact"
        )
    identity = {
        "path": path,
        "bytes": fingerprint["bytes"],
        "sha256": fingerprint["sha256"],
        "schema": schema,
    }
    EVALUATOR._identity(identity, f"candidate artifact {path}")
    return identity


def _validate_checkpoint_preflight_summary(
    value: Mapping[str, Any],
) -> dict[str, Any]:
    summary = EVALUATOR._exact_dict(
        dict(value) if isinstance(value, Mapping) else value,
        _PREFLIGHT_SUMMARY_FIELDS,
        "selection teacher checkpoint preflight summary",
    )
    if (
        summary["schema"] != TEACHER_PREFLIGHT.SUMMARY_SCHEMA
        or summary["status"] != TEACHER_PREFLIGHT.SUMMARY_STATUS
        or summary["strict_loaded_seeds"] != [42, 43, 44]
        or summary["strict_loaded_checkpoints"] != 3
        or type(summary["strict_loaded_checkpoints"]) is not int
        or summary["selection_source_opened"] is not False
        or summary["network_requests"] != 0
        or type(summary["network_requests"]) is not int
        or summary["live_weight_writes"] != 0
        or type(summary["live_weight_writes"]) is not int
    ):
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            "selection teacher checkpoint preflight summary is incomplete"
        )
    plan = EVALUATOR._identity(
        summary["training_plan"],
        "selection teacher checkpoint preflight training plan",
    )
    registry = EVALUATOR._identity(
        summary["selection_preflight_registry"],
        "selection teacher checkpoint preflight registry",
    )
    if (
        plan["path"] != EVALUATOR._FIXED_PATHS["training_plan"]
        or plan["schema"] != EVALUATOR.BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA
        or registry["path"] != EVALUATOR._FIXED_PATHS["selection_preflight_registry"]
        or registry["schema"]
        != EVALUATOR.PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_SCHEMA
    ):
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            "selection teacher checkpoint preflight tracked identity drifted"
        )
    EVALUATOR._sha256(
        summary["checkpoint_preflight_sha256"],
        "selection teacher checkpoint preflight payload SHA-256",
    )
    return copy.deepcopy(summary)


def _tracked_snapshot(
    *,
    root: Path,
    relative: str,
    revision: str,
    label: str,
    read_tracked: Callable[[str], bytes],
    verify_tracked: Callable[[str, str, bytes], None],
) -> bytes:
    path = str(root / relative)
    try:
        raw = read_tracked(path)
    except OSError as error:
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            f"{label} cannot be read"
        ) from error
    if type(raw) is not bytes or not raw:
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            f"{label} is not nonempty exact bytes"
        )
    verify_tracked(path, revision, raw)
    return raw


def _require_summary_tracked_identity(
    *,
    root: Path,
    identity: Mapping[str, Any],
    revision: str,
    label: str,
    read_tracked: Callable[[str], bytes],
    verify_tracked: Callable[[str, str, bytes], None],
) -> tuple[str, bytes]:
    relative = identity["path"]
    raw = _tracked_snapshot(
        root=root,
        relative=relative,
        revision=revision,
        label=label,
        read_tracked=read_tracked,
        verify_tracked=verify_tracked,
    )
    if (
        len(raw) != identity["bytes"]
        or hashlib.sha256(raw).hexdigest() != identity["sha256"]
        or EVALUATOR._strict_json(raw, label).get("schema") != identity["schema"]
    ):
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            f"{label} differs from the strict-load preflight summary"
        )
    return str(root / relative), raw


def _resolve_private_path(home: Path, relative: str, label: str) -> str:
    try:
        return EVALUATOR._resolved_home_path(home, relative)
    except ValueError as error:
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            f"{label} fixed path is not canonical"
        ) from error


def build_strength_first_selection_evaluator_registry_candidate(
    *,
    _repo_root: str | None = None,
    _home_root: str | None = None,
    _git_head: Callable[[str], str] = EVALUATOR._git_head,
    _verify_tracked: Callable[[str, str, bytes], None] = _verify_tracked_file,
    _read_tracked: Callable[[str], bytes] = lambda path: Path(path).read_bytes(),
    _read_private: Callable[[str, str], bytes] = _read_canonical_regular_file,
    _fingerprint_private: Callable[
        [str, str], Mapping[str, Any]
    ] = _fingerprint_canonical_regular_file,
    _validate_training_plan: Callable[
        [Mapping[str, Any]], Mapping[str, Any]
    ] = EVALUATOR.BRIDGE.validate_strength_first_qat_training_plan_data,
    _validate_parent_accounting: Callable[..., Mapping[str, Any]] = (
        EVALUATOR._validate_selection_parent_accounting
    ),
    _run_checkpoint_preflight: Callable[
        [], Mapping[str, Any]
    ] = TEACHER_PREFLIGHT.run_strength_first_selection_teacher_preflight,
    _candidate_consumer: Callable[[Mapping[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Recompute the fixed blocked/READY registry as one exact READY candidate."""

    root = Path(
        _repo_root if _repo_root is not None else Path(__file__).resolve().parent.parent
    ).resolve()
    home = (
        Path(_home_root if _home_root is not None else Path.home())
        .expanduser()
        .resolve()
    )
    revision = _git_head(str(root))
    if (
        type(revision) is not str
        or EVALUATOR._GIT_REVISION_RE.fullmatch(revision) is None
    ):
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            "selection evaluator candidate revision is invalid"
        )

    tracked_snapshots: dict[str, bytes] = {}
    registry_relative = (
        EVALUATOR.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
    )
    registry_path = str(root / registry_relative)
    registry_raw = _tracked_snapshot(
        root=root,
        relative=registry_relative,
        revision=revision,
        label="selection evaluator registry",
        read_tracked=_read_tracked,
        verify_tracked=_verify_tracked,
    )
    tracked_snapshots[registry_path] = registry_raw
    registry = dict(
        EVALUATOR.validate_strength_first_selection_evaluator_registry_data(
            EVALUATOR._strict_json(registry_raw, "selection evaluator registry")
        )
    )

    implementation: dict[str, dict[str, Any]] = {}
    for name, relative in EVALUATOR._IMPLEMENTATION_PATHS.items():
        path = str(root / relative)
        raw = _tracked_snapshot(
            root=root,
            relative=relative,
            revision=revision,
            label=f"selection evaluator implementation {name}",
            read_tracked=_read_tracked,
            verify_tracked=_verify_tracked,
        )
        tracked_snapshots[path] = raw
        implementation[name] = _artifact_identity(
            path=relative,
            schema=EVALUATOR._SOURCE_IDENTITY_SCHEMA,
            raw=raw,
        )

    try:
        preflight_value = _run_checkpoint_preflight()
    except Exception as error:
        if isinstance(
            error,
            (
                OSError,
                RuntimeError,
                StrengthFirstSelectionEvaluatorRegistryCandidateError,
                ValueError,
            ),
        ):
            raise
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            "selection teacher checkpoint preflight failed"
        ) from error
    preflight = _validate_checkpoint_preflight_summary(preflight_value)
    plan_document: Mapping[str, Any] | None = None
    for name, label in (
        ("training_plan", "strength-first selection training plan"),
        (
            "selection_preflight_registry",
            "strength-first selection preflight registry",
        ),
    ):
        path, raw = _require_summary_tracked_identity(
            root=root,
            identity=preflight[name],
            revision=revision,
            label=label,
            read_tracked=_read_tracked,
            verify_tracked=_verify_tracked,
        )
        tracked_snapshots[path] = raw
        if name == "training_plan":
            plan_document = EVALUATOR._strict_json(raw, label)
            _validate_training_plan(plan_document)
    if plan_document is None:
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            "authenticated training plan was not loaded"
        )
    warm_initializer = EVALUATOR._exact_dict(
        plan_document["artifacts"]["warm_initializer"],
        {"path", "bytes", "sha256"},
        "strength-first training plan warm initializer",
    )
    expected_stable_path = (
        f"{EVALUATOR.BRIDGE._SEALED_INPUT_DIRECTORY}/" f"{warm_initializer['path']}"
    )
    if expected_stable_path != EVALUATOR._FIXED_PATHS["stable_checkpoint"]:
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            "stable checkpoint path differs from the authenticated "
            "training plan warm initializer"
        )

    private_document_raw: dict[str, bytes] = {}
    private_documents: dict[str, dict[str, Any]] = {}
    parsed_documents: dict[str, dict[str, Any]] = {}
    for name, schema in _PRIVATE_DOCUMENTS.items():
        relative = EVALUATOR._FIXED_PATHS[name]
        absolute = _resolve_private_path(home, relative, name.replace("_", " "))
        raw = _read_private(absolute, name.replace("_", " "))
        if type(raw) is not bytes or not raw:
            raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
                f"{name.replace('_', ' ')} is not nonempty exact bytes"
            )
        private_document_raw[absolute] = raw
        private_documents[name] = _artifact_identity(
            path=relative,
            schema=schema,
            raw=raw,
        )
        parsed_documents[name] = EVALUATOR._strict_json(
            raw,
            name.replace("_", " "),
        )

    private_artifact_raw: dict[str, bytes] = {}
    for name, schema in (
        ("selection_source", None),
        ("selection_teacher_work", EVALUATOR.STRENGTH_FIRST_SELECTION_WORK_SCHEMA),
        ("selection_dataset", EVALUATOR.STRENGTH_FIRST_SELECTION_DATASET_SCHEMA),
    ):
        relative = EVALUATOR._FIXED_PATHS[name]
        absolute = _resolve_private_path(home, relative, name.replace("_", " "))
        raw = _read_private(absolute, name.replace("_", " "))
        if type(raw) is not bytes or not raw:
            raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
                f"{name.replace('_', ' ')} is not nonempty exact bytes"
            )
        private_artifact_raw[absolute] = raw
        if schema is not None:
            private_documents[name] = _artifact_identity(
                path=relative,
                schema=schema,
                raw=raw,
            )

    large_artifact_fingerprints: dict[str, dict[str, Any]] = {}
    for name, schema in (
        (
            "stable_checkpoint",
            EVALUATOR.STRENGTH_FIRST_STABLE_CHECKPOINT_IDENTITY_SCHEMA,
        ),
    ):
        relative = EVALUATOR._FIXED_PATHS[name]
        absolute = _resolve_private_path(home, relative, name.replace("_", " "))
        observed = _fingerprint_private(absolute, name.replace("_", " "))
        identity = _fingerprinted_identity(
            path=relative,
            schema=schema,
            fingerprint=observed,
        )
        large_artifact_fingerprints[absolute] = {
            "bytes": identity["bytes"],
            "sha256": identity["sha256"],
        }
        private_documents[name] = identity
    if private_documents["stable_checkpoint"] != {
        "path": expected_stable_path,
        "bytes": warm_initializer["bytes"],
        "sha256": warm_initializer["sha256"],
        "schema": EVALUATOR.STRENGTH_FIRST_STABLE_CHECKPOINT_IDENTITY_SCHEMA,
    }:
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            "stable checkpoint differs from the authenticated training "
            "plan warm initializer"
        )

    authority = parsed_documents["selection_teacher_authority"]
    run_fingerprint = authority.get("run_fingerprint")
    EVALUATOR._sha256(
        run_fingerprint,
        "selection teacher run fingerprint",
    )
    if (
        authority.get("checkpoint_preflight_sha256")
        != preflight["checkpoint_preflight_sha256"]
    ):
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            "selection teacher authority differs from the no-LF checkpoint preflight"
        )

    candidate = copy.deepcopy(registry)
    candidate["status"] = EVALUATOR.STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS
    candidate["implementation"] = implementation
    enrollments = candidate["enrollments"]
    enrollments["training_plan"] = copy.deepcopy(preflight["training_plan"])
    enrollments["selection_preflight_registry"] = copy.deepcopy(
        preflight["selection_preflight_registry"]
    )
    enrollments["checkpoint_preflight_sha256"] = preflight[
        "checkpoint_preflight_sha256"
    ]
    enrollments["selection_teacher_run_fingerprint"] = run_fingerprint
    enrollments["selection_teacher_authority"] = private_documents[
        "selection_teacher_authority"
    ]
    enrollments["selection_teacher_manifest"] = private_documents[
        "selection_teacher_manifest"
    ]
    enrollments["selection_teacher_result"] = private_documents[
        "selection_teacher_result"
    ]
    enrollments["selection_teacher_work"] = private_documents["selection_teacher_work"]
    enrollments["selection_dataset"] = private_documents["selection_dataset"]
    enrollments["stable_checkpoint"] = private_documents["stable_checkpoint"]
    candidate["gates"] = copy.deepcopy(EVALUATOR._READY_GATES)

    validated = dict(
        EVALUATOR.validate_strength_first_selection_evaluator_registry_data(candidate)
    )
    completion, generation_run_fingerprint = EVALUATOR._validate_teacher_documents(
        authority=parsed_documents["selection_teacher_authority"],
        manifest=parsed_documents["selection_teacher_manifest"],
        result=parsed_documents["selection_teacher_result"],
        registry=validated,
    )
    _validate_parent_accounting(
        source_raw=private_artifact_raw[
            _resolve_private_path(
                home,
                EVALUATOR._FIXED_PATHS["selection_source"],
                "selection source",
            )
        ],
        work_raw=private_artifact_raw[
            _resolve_private_path(
                home,
                EVALUATOR._FIXED_PATHS["selection_teacher_work"],
                "selection teacher work",
            )
        ],
        dataset_raw=private_artifact_raw[
            _resolve_private_path(
                home,
                EVALUATOR._FIXED_PATHS["selection_dataset"],
                "selection dataset",
            )
        ],
        completion=completion,
        generation_run_fingerprint=generation_run_fingerprint,
        source_identity=EVALUATOR._SELECTION_SOURCE,
    )
    if (
        registry["status"] == EVALUATOR.STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS
        and not EVALUATOR._typed_equal(registry, validated)
    ):
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            "tracked READY selection evaluator registry is not an exact "
            "idempotent recomputation"
        )

    for path, expected_raw in tracked_snapshots.items():
        try:
            current_raw = _read_tracked(path)
        except OSError as error:
            raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
                "tracked selection evaluator input cannot be re-read"
            ) from error
        if current_raw != expected_raw:
            raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
                "tracked selection evaluator input changed before candidate emission"
            )
        _verify_tracked(path, revision, expected_raw)
    for path, expected_raw in private_document_raw.items():
        if _read_private(path, "selection teacher document") != expected_raw:
            raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
                "selection teacher document changed before candidate emission"
            )
    for path, expected_raw in private_artifact_raw.items():
        if _read_private(path, "selection accounting artifact") != expected_raw:
            raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
                "selection accounting artifact changed before candidate emission"
            )
    for path, expected in large_artifact_fingerprints.items():
        observed = _fingerprint_private(path, "selection evaluator artifact")
        if not EVALUATOR._typed_equal(dict(observed), expected):
            raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
                "selection evaluator artifact changed before candidate emission"
            )

    if _candidate_consumer is not None:
        _candidate_consumer(copy.deepcopy(validated))
    return validated


def serialize_strength_first_selection_evaluator_registry_candidate(
    candidate: Mapping[str, Any],
) -> bytes:
    """Serialize the existing registry layout as one pretty JSON value plus LF."""

    try:
        validated = EVALUATOR.validate_strength_first_selection_evaluator_registry_data(
            candidate
        )
        if (
            validated["status"]
            != EVALUATOR.STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS
        ):
            raise ValueError("selection evaluator registry candidate is not READY")
        return (
            json.dumps(
                validated,
                ensure_ascii=False,
                indent=2,
                allow_nan=False,
            )
            + "\n"
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise StrengthFirstSelectionEvaluatorRegistryCandidateError(
            "selection evaluator registry candidate cannot be serialized"
        ) from error


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        print(
            "[strength-first-selection-evaluator-registry-candidate] "
            "STOP: arguments are forbidden",
            file=sys.stderr,
        )
        return 2

    def emit(candidate: Mapping[str, Any]) -> None:
        serialized = serialize_strength_first_selection_evaluator_registry_candidate(
            candidate
        )
        written = sys.stdout.buffer.write(serialized)
        if written != len(serialized):
            raise OSError(
                "selection evaluator registry candidate stdout write was incomplete"
            )
        sys.stdout.buffer.flush()

    try:
        build_strength_first_selection_evaluator_registry_candidate(
            _candidate_consumer=emit,
        )
    except (
        OSError,
        RuntimeError,
        StrengthFirstSelectionEvaluatorRegistryCandidateError,
        ValueError,
    ) as error:
        print(
            "[strength-first-selection-evaluator-registry-candidate] " f"STOP: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_CANDIDATE_COMMAND",
    "StrengthFirstSelectionEvaluatorRegistryCandidateError",
    "build_strength_first_selection_evaluator_registry_candidate",
    "serialize_strength_first_selection_evaluator_registry_candidate",
]
