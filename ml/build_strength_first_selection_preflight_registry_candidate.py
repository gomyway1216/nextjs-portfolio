#!/usr/bin/env python3
"""Build the reviewed three-checkpoint preflight registry candidate.

The argumentless production entry reads only the tracked strength-first plan,
the currently tracked closed/ready registry, and the six local seed artifacts.
It strict-loads all three checkpoints through the existing preflight
validators, then writes one complete READY registry JSON object to stdout.
It never edits the tracked registry and has no selection-source, holdout, or
live-weight path.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
import copy
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
from typing import Any

import fresh_qat_selection_preflight as COMMON
import strength_first_qat_selection_preflight as PREFLIGHT
import strength_first_qat_training_bridge as BRIDGE


STRENGTH_FIRST_SELECTION_PREFLIGHT_REGISTRY_CANDIDATE_COMMAND = (
    "python3 " "ml/build_strength_first_selection_preflight_registry_candidate.py"
)


class StrengthFirstSelectionPreflightRegistryCandidateError(ValueError):
    """The six real artifacts cannot produce one reviewable registry."""


def _git_head(repo_root: str) -> str:
    try:
        raw = subprocess.run(
            [
                COMMON.FIXED_GIT_EXECUTABLE,
                *COMMON.FIXED_GIT_COMMAND_PREFIX,
                "rev-parse",
                "--verify",
                "HEAD^{commit}",
            ],
            cwd=repo_root,
            env=dict(COMMON.FIXED_GIT_ENVIRONMENT),
            check=True,
            capture_output=True,
            text=False,
        ).stdout
    except (OSError, subprocess.CalledProcessError) as error:
        raise StrengthFirstSelectionPreflightRegistryCandidateError(
            "cannot determine the registry-candidate audit revision"
        ) from error
    if (
        len(raw) != 41
        or raw[-1:] != b"\n"
        or COMMON.GIT_REVISION_RE.fullmatch(raw[:-1].decode("ascii", errors="ignore"))
        is None
    ):
        raise StrengthFirstSelectionPreflightRegistryCandidateError(
            "registry-candidate audit revision is invalid"
        )
    return raw[:-1].decode("ascii")


def _read_stable_regular_file(path: str, label: str) -> bytes:
    absolute = os.path.abspath(path)
    try:
        before = os.lstat(absolute)
        if (
            not stat.S_ISREG(before.st_mode)
            or os.path.realpath(absolute) != absolute
            or before.st_nlink != 1
        ):
            raise StrengthFirstSelectionPreflightRegistryCandidateError(
                f"{label} must be one canonical regular file"
            )
        raw = Path(absolute).read_bytes()
        after = os.lstat(absolute)
    except OSError as error:
        raise StrengthFirstSelectionPreflightRegistryCandidateError(
            f"{label} is absent or unreadable"
        ) from error
    if COMMON._stat_identity(before) != COMMON._stat_identity(after):
        raise StrengthFirstSelectionPreflightRegistryCandidateError(
            f"{label} changed while it was read"
        )
    if not raw:
        raise StrengthFirstSelectionPreflightRegistryCandidateError(f"{label} is empty")
    return raw


def _identity(
    *,
    path: str,
    schema: str,
    raw: bytes,
) -> dict[str, Any]:
    return {
        "path": path,
        "schema": schema,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _tracked_snapshot(
    *,
    root: str,
    relative: str,
    label: str,
    audit_revision: str,
    reader: Callable[[str, str], bytes],
    tracked_verifier: Callable[[str, str, bytes], None],
) -> tuple[str, bytes]:
    absolute = COMMON._registered_path(root, relative, label)
    raw = reader(absolute, label)
    tracked_verifier(absolute, audit_revision, raw)
    return absolute, raw


def _artifact_snapshot(
    *,
    root: str,
    expected: Mapping[str, Any],
    label: str,
    reader: Callable[[str, str], bytes],
) -> tuple[str, bytes, dict[str, Any]]:
    absolute = COMMON._registered_path(root, expected["path"], label)
    raw = reader(absolute, label)
    return (
        absolute,
        raw,
        _identity(
            path=expected["path"],
            schema=expected["schema"],
            raw=raw,
        ),
    )


def _training_pipeline_revision(
    results: Sequence[Mapping[str, Any]],
) -> str:
    revisions: list[str] = []
    for index, result in enumerate(results):
        pipeline = result.get("training_pipeline")
        if (
            type(pipeline) is not dict
            or set(pipeline) != {"source_revision", "tracked_tree_clean"}
            or type(pipeline["source_revision"]) is not str
            or COMMON.GIT_REVISION_RE.fullmatch(pipeline["source_revision"]) is None
            or pipeline["tracked_tree_clean"] is not True
        ):
            raise StrengthFirstSelectionPreflightRegistryCandidateError(
                f"seed result {index} has no exact clean training revision"
            )
        revisions.append(pipeline["source_revision"])
    if len(revisions) != 3 or len(set(revisions)) != 1:
        raise StrengthFirstSelectionPreflightRegistryCandidateError(
            "the three seed results do not share one training revision"
        )
    return revisions[0]


def build_strength_first_selection_preflight_registry_candidate(
    *,
    repo_root: str | os.PathLike[str] | None = None,
    revision_reader: Callable[[str], str] = _git_head,
    reader: Callable[[str, str], bytes] = _read_stable_regular_file,
    tracked_verifier: Callable[[str, str, bytes], None] = (
        lambda path, revision, raw: COMMON._verify_tracked_file(
            path,
            revision,
            raw,
        )
    ),
    checkpoint_loader: Callable[[bytes], Mapping[str, Any]] = (
        COMMON._torch_checkpoint_loader
    ),
    strict_model_validator: Callable[[Any, int], None] = (
        COMMON._torch_strict_model_validator
    ),
) -> dict[str, Any]:
    """Return one fully validated READY registry without persisting it."""

    root = os.path.realpath(
        os.fspath(
            repo_root
            if repo_root is not None
            else Path(__file__).resolve().parent.parent
        )
    )
    audit_revision = revision_reader(root)

    registry_path, registry_raw = _tracked_snapshot(
        root=root,
        relative=PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_RELATIVE_PATH,
        label="strength-first selection preflight registry",
        audit_revision=audit_revision,
        reader=reader,
        tracked_verifier=tracked_verifier,
    )
    registry = COMMON._strict_json(
        registry_raw,
        "strength-first selection preflight registry",
    )
    current_ready = PREFLIGHT._validate_registry(registry)

    plan_path, plan_raw = _tracked_snapshot(
        root=root,
        relative=BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH,
        label="strength-first QAT training plan",
        audit_revision=audit_revision,
        reader=reader,
        tracked_verifier=tracked_verifier,
    )
    plan = COMMON._strict_json(plan_raw, "strength-first QAT training plan")
    BRIDGE.validate_strength_first_qat_training_plan_data(plan)
    plan_identity = _identity(
        path=BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH,
        schema=BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
        raw=plan_raw,
    )

    snapshots: list[dict[str, Any]] = []
    for expected_run in PREFLIGHT._expected_registry_runs():
        result_path, result_raw, result_identity = _artifact_snapshot(
            root=root,
            expected=expected_run["result"],
            label=f"strength-first seed {expected_run['seed']} result",
            reader=reader,
        )
        checkpoint_path, checkpoint_raw, checkpoint_identity = _artifact_snapshot(
            root=root,
            expected=expected_run["checkpoint"],
            label=(f"strength-first seed {expected_run['seed']} checkpoint"),
            reader=reader,
        )
        result = COMMON._strict_json(
            result_raw,
            f"strength-first seed {expected_run['seed']} result",
        )
        snapshots.append(
            {
                "expected": expected_run,
                "result_path": result_path,
                "result_raw": result_raw,
                "result_identity": result_identity,
                "result": result,
                "checkpoint_path": checkpoint_path,
                "checkpoint_raw": checkpoint_raw,
                "checkpoint_identity": checkpoint_identity,
            }
        )

    candidate = copy.deepcopy(registry)
    candidate["status"] = PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_READY_STATUS
    candidate["training_plan"] = plan_identity
    candidate["training_pipeline_revision"] = _training_pipeline_revision(
        [snapshot["result"] for snapshot in snapshots]
    )
    candidate["runs"] = [
        {
            "slot_id": snapshot["expected"]["slot_id"],
            "seed": snapshot["expected"]["seed"],
            "output": snapshot["expected"]["output"],
            "result": snapshot["result_identity"],
            "checkpoint": snapshot["checkpoint_identity"],
        }
        for snapshot in snapshots
    ]
    candidate["artifact_identities_registered"] = True
    candidate["selection_preflight_ready"] = True
    if PREFLIGHT._validate_registry(candidate) is not True:
        raise StrengthFirstSelectionPreflightRegistryCandidateError(
            "generated selection preflight registry did not become READY"
        )
    if current_ready and not COMMON._typed_equal(registry, candidate):
        raise StrengthFirstSelectionPreflightRegistryCandidateError(
            "tracked READY registry differs from the recomputed candidate"
        )

    expected_slots = [
        {
            "id": run["slot_id"],
            "seed": run["seed"],
            "output": run["output"],
        }
        for run in candidate["runs"]
    ]
    if not COMMON._typed_equal(plan["slots"], expected_slots):
        raise StrengthFirstSelectionPreflightRegistryCandidateError(
            "training plan slots differ from the candidate registry"
        )

    parsed_results: list[Mapping[str, Any]] = []
    for snapshot, registered_run in zip(
        snapshots,
        candidate["runs"],
        strict=True,
    ):
        result = snapshot["result"]
        COMMON._validate_result(
            result,
            plan=plan,
            plan_path=plan_path,
            plan_identity=plan_identity,
            registry=candidate,
            registered_run=registered_run,
            checkpoint_receipt=snapshot["checkpoint_identity"],
            result_schema=BRIDGE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA,
            expected_plan_binding=PREFLIGHT._expected_plan_binding(
                plan,
                plan_path=plan_path,
                plan_identity=plan_identity,
                registered_run=registered_run,
            ),
            expected_contract=PREFLIGHT._expected_training_contract(
                plan,
                registered_run,
            ),
            label_prefix="strength-first",
        )
        parsed_results.append(result)
    shared_pipeline = parsed_results[0]["training_pipeline"]
    shared_runtime = parsed_results[0]["training_runtime"]
    if any(
        not COMMON._typed_equal(result["training_pipeline"], shared_pipeline)
        or not COMMON._typed_equal(result["training_runtime"], shared_runtime)
        for result in parsed_results[1:]
    ):
        raise StrengthFirstSelectionPreflightRegistryCandidateError(
            "the three seed results do not share one pipeline and runtime"
        )

    for snapshot, registered_run, result in zip(
        snapshots,
        candidate["runs"],
        parsed_results,
        strict=True,
    ):
        try:
            checkpoint = checkpoint_loader(snapshot["checkpoint_raw"])
        except Exception as error:
            if isinstance(error, ValueError):
                raise
            raise StrengthFirstSelectionPreflightRegistryCandidateError(
                f"seed {registered_run['seed']} checkpoint cannot strict-load"
            ) from error
        if not isinstance(checkpoint, Mapping):
            raise StrengthFirstSelectionPreflightRegistryCandidateError(
                f"seed {registered_run['seed']} checkpoint root is invalid"
            )
        metadata = COMMON._validate_checkpoint(
            checkpoint,
            result=result,
            plan=plan,
            plan_path=plan_path,
            root=root,
            registered_run=registered_run,
            strict_model_validator=strict_model_validator,
            checkpoint_schema=BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
            replay_exclusion=plan["artifacts"]["replay_exclusion"],
            replay_identity=plan["artifacts"]["replay"],
            label_prefix="strength-first",
        )
        if metadata != {
            "schema": BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
            "epoch": 20,
        }:
            raise StrengthFirstSelectionPreflightRegistryCandidateError(
                f"seed {registered_run['seed']} checkpoint metadata is incomplete"
            )

    if (
        reader(registry_path, "strength-first selection preflight registry")
        != (registry_raw)
        or reader(plan_path, "strength-first QAT training plan") != plan_raw
    ):
        raise StrengthFirstSelectionPreflightRegistryCandidateError(
            "tracked candidate inputs changed during validation"
        )
    for snapshot in snapshots:
        if (
            reader(
                snapshot["result_path"],
                f"strength-first seed {snapshot['expected']['seed']} result",
            )
            != snapshot["result_raw"]
            or reader(
                snapshot["checkpoint_path"],
                f"strength-first seed {snapshot['expected']['seed']} checkpoint",
            )
            != snapshot["checkpoint_raw"]
        ):
            raise StrengthFirstSelectionPreflightRegistryCandidateError(
                "seed artifact changed during candidate validation"
            )
    tracked_verifier(registry_path, audit_revision, registry_raw)
    tracked_verifier(plan_path, audit_revision, plan_raw)
    return copy.deepcopy(candidate)


def serialize_strength_first_selection_preflight_registry_candidate(
    candidate: Mapping[str, Any],
) -> bytes:
    copied = copy.deepcopy(dict(candidate))
    if PREFLIGHT._validate_registry(copied) is not True:
        raise StrengthFirstSelectionPreflightRegistryCandidateError(
            "only a READY preflight registry can be serialized"
        )
    return (
        json.dumps(
            copied,
            ensure_ascii=False,
            indent=2,
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        print(
            "[strength-first-preflight-registry-candidate] "
            "STOP: arguments are forbidden",
            file=sys.stderr,
        )
        return 2
    try:
        raw = serialize_strength_first_selection_preflight_registry_candidate(
            build_strength_first_selection_preflight_registry_candidate()
        )
    except (OSError, RuntimeError, ValueError) as error:
        print(
            f"[strength-first-preflight-registry-candidate] STOP: {error}",
            file=sys.stderr,
        )
        return 1
    written = sys.stdout.buffer.write(raw)
    if written != len(raw):
        print(
            "[strength-first-preflight-registry-candidate] "
            "STOP: stdout write was incomplete",
            file=sys.stderr,
        )
        return 1
    sys.stdout.buffer.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "STRENGTH_FIRST_SELECTION_PREFLIGHT_REGISTRY_CANDIDATE_COMMAND",
    "StrengthFirstSelectionPreflightRegistryCandidateError",
    "build_strength_first_selection_preflight_registry_candidate",
    "serialize_strength_first_selection_preflight_registry_candidate",
]
