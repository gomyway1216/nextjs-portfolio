#!/usr/bin/env python3
"""Receipt-gated preflight for the fresh-final sibling teacher.

The checked-in selection-evaluator registry is currently closed. Production
therefore emits a machine-readable STOP before opening the published
selection receipt, the private selection dataset, or any fresh-final row.

A future reviewed READY registry follows the same argumentless path: tracked
registry bindings are authenticated, the fixed private receipt is read once
with current-user file checks, and every ranking, metric gate, family gate,
and three-checkpoint preflight binding is recomputed. This module deliberately
does not consult the downstream READY registry, start an engine, or grant a
holdout/live-write authorization.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
from typing import Any

from fresh_qat_selection_preflight import _verify_tracked_file
import strength_first_downstream_gates as DOWNSTREAM
import strength_first_qat_selection_eval_adapter as EVALUATION
import strength_first_qat_selection_evaluator as SELECTION


SUMMARY_SCHEMA = (
    "shogi-floodgate-strength-first-fresh-final-teacher-selection-preflight-v1"
)
SUMMARY_STATUS = "selected-candidate-receipt-recomputed"
CLI_SCHEMA = "shogi-floodgate-strength-first-fresh-final-teacher-preflight-cli-v1"


class FreshFinalTeacherPreflightBlocked(RuntimeError):
    """The reviewed selection registry and receipt do not yet authorize work."""


@dataclass(frozen=True)
class _Dependencies:
    read_bytes: Callable[[str], bytes]
    verify_tracked: Callable[[str, bytes], None]
    read_private_artifact: Callable[[str], bytes]
    replay_evaluation: Callable[..., Mapping[str, Any]]


def _strict_json(raw: bytes, label: str) -> dict[str, Any]:
    if type(raw) is not bytes or not raw:
        raise ValueError(f"{label} must be nonempty immutable bytes")

    def object_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"{label} contains a duplicate JSON key")
            result[key] = value
        return result

    def reject_constant(value):
        raise ValueError(f"{label} contains a non-finite value: {value}")

    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=object_pairs,
            parse_constant=reject_constant,
        )
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"{label} is not strict UTF-8 JSON") from error
    if type(value) is not dict:
        raise ValueError(f"{label} root must be an object")
    return value


def _canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
        + b"\n"
    )


def _identity(
    *,
    path: str,
    raw: bytes,
    schema: str,
) -> dict[str, Any]:
    return {
        "path": path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": schema,
    }


def _validate_tracked_identity(
    repo_root: Path,
    identity: Mapping[str, Any],
    dependencies: _Dependencies,
    label: str,
) -> None:
    path = repo_root / identity["path"]
    raw = dependencies.read_bytes(str(path))
    if (
        type(raw) is not bytes
        or len(raw) != identity["bytes"]
        or hashlib.sha256(raw).hexdigest() != identity["sha256"]
    ):
        raise ValueError(f"{label} identity mismatch")
    if identity["path"].endswith(".json"):
        value = _strict_json(raw, label)
        if value.get("schema") != identity["schema"]:
            raise ValueError(f"{label} schema mismatch")
    dependencies.verify_tracked(str(path), raw)


def _strict_publication_result(
    value: Mapping[str, Any],
) -> dict[str, Any]:
    expected_fields = {
        "schema",
        "status",
        "evaluation_origin_registry",
        "evaluation_report",
        "selection_receipt",
        "selected_seed",
        "selected_checkpoint",
        "boundary",
    }
    if type(value) is not dict or set(value) != expected_fields:
        raise ValueError("selection publication result fields are not exact")
    if (
        value["schema"] != SELECTION.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_SCHEMA
        or value["status"]
        != SELECTION.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_STATUS
        or not SELECTION._typed_equal(
            value["boundary"],
            SELECTION._PUBLICATION_RESULT_BOUNDARY,
        )
    ):
        raise ValueError("selection publication result is incomplete")
    return dict(value)


def build_fresh_final_teacher_selection_preflight(
    *,
    registry: Mapping[str, Any],
    registry_raw: bytes,
    evaluation_report: Mapping[str, Any],
    evaluation_report_raw: bytes,
    receipt: Mapping[str, Any],
    receipt_raw: bytes,
    publication_result: Mapping[str, Any],
    publication_result_raw: bytes,
    replayed_evaluation_report: Mapping[str, Any],
) -> dict[str, Any]:
    """Replay the evaluator, rebuild the receipt, and return portable evidence."""

    for value, raw, label in (
        (evaluation_report, evaluation_report_raw, "selection evaluation report"),
        (receipt, receipt_raw, "selection receipt"),
        (publication_result, publication_result_raw, "selection publication result"),
    ):
        if _canonical_json_bytes(value) != raw:
            raise ValueError(f"{label} is not canonical JSON")
    enrolled = registry["enrollments"]
    evaluation_report_identity = _identity(
        path=SELECTION.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_PATH,
        raw=evaluation_report_raw,
        schema=EVALUATION.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_SCHEMA,
    )
    receipt_identity = _identity(
        path=SELECTION.STRENGTH_FIRST_SELECTION_RECEIPT_PATH,
        raw=receipt_raw,
        schema=SELECTION.STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA,
    )
    publication_result_identity = _identity(
        path=SELECTION.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_PATH,
        raw=publication_result_raw,
        schema=SELECTION.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_SCHEMA,
    )
    if (
        not SELECTION._typed_equal(
            evaluation_report_identity,
            enrolled["selection_evaluation_report"],
        )
        or not SELECTION._typed_equal(
            receipt_identity,
            enrolled["selection_receipt"],
        )
        or not SELECTION._typed_equal(
            publication_result_identity,
            enrolled["selection_publication_result"],
        )
    ):
        raise ValueError("selection publication identity is not enrolled")
    publication = _strict_publication_result(publication_result)
    if (
        not SELECTION._typed_equal(
            publication["evaluation_origin_registry"],
            enrolled["selection_evaluation_origin_registry"],
        )
        or not SELECTION._typed_equal(
            publication["evaluation_report"],
            evaluation_report_identity,
        )
        or not SELECTION._typed_equal(
            publication["selection_receipt"],
            receipt_identity,
        )
    ):
        raise ValueError("selection publication result binding mismatch")
    selected = DOWNSTREAM.validate_selection_receipt_against_evaluator_registry(
        receipt,
        evaluation_report=evaluation_report,
        replayed_evaluation_report=replayed_evaluation_report,
        selection_registry=registry,
    )
    if not SELECTION._typed_equal(
        publication["selected_seed"],
        selected["selected_seed"],
    ) or not SELECTION._typed_equal(
        publication["selected_checkpoint"],
        selected["selected_checkpoint"],
    ):
        raise ValueError("selection publication selected candidate mismatch")
    return {
        "schema": SUMMARY_SCHEMA,
        "status": SUMMARY_STATUS,
        "selection_evaluator_registry": _identity(
            path=(SELECTION.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH),
            raw=registry_raw,
            schema=SELECTION.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_SCHEMA,
        ),
        "selection_evaluation_report": evaluation_report_identity,
        "selection_receipt": receipt_identity,
        "selection_publication_result": publication_result_identity,
        "selected_seed": selected["selected_seed"],
        "selected_checkpoint": selected["selected_checkpoint"],
        "selection_evaluation_report_reads": 1,
        "selection_receipt_reads": 1,
        "selection_publication_result_reads": 1,
        "selection_dataset_reads": 1,
        "selection_checkpoint_evaluations": 4,
        "fresh_final_source_opened": False,
        "fresh_final_label_reads": 0,
        "teacher_engines_started": 0,
        "network_requests": 0,
        "cloud_requests": 0,
        "live_weight_writes": 0,
    }


def _replay_selection_evaluation(
    *,
    receipt: Mapping[str, Any],
    registry: Mapping[str, Any],
    repo_root: Path,
    home_root: Path,
    replay: Callable[..., Mapping[str, Any]],
) -> Mapping[str, Any]:
    try:
        runs = receipt["runs"]
        completion_value = receipt["selection_teacher"]["completion"]
    except (KeyError, TypeError) as error:
        raise ValueError("selection receipt cannot define replay inputs") from error
    completion = SELECTION._validate_completion(completion_value)
    if type(runs) is not list or len(runs) != 3:
        raise ValueError("selection replay requires exact three candidate runs")
    checkpoint_specs = []
    for expected_seed, run in zip((42, 43, 44), runs):
        if type(run) is not dict or run.get("seed") != expected_seed:
            raise ValueError("selection replay candidate order mismatch")
        checkpoint = SELECTION._identity(
            run.get("checkpoint"),
            f"selection replay seed {expected_seed} checkpoint",
        )
        expected_relative = (
            f"{SELECTION.BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/"
            f"seed-{expected_seed}/final.pt"
        )
        if (
            checkpoint["path"] != expected_relative
            or checkpoint["schema"]
            != SELECTION.BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA
        ):
            raise ValueError("selection replay candidate checkpoint drifted")
        checkpoint_specs.append(
            {
                "name": (
                    "floodgate-strength-first-int16-aware-" f"seed-{expected_seed}"
                ),
                "path": str(repo_root / expected_relative),
                "bytes": checkpoint["bytes"],
                "sha256": checkpoint["sha256"],
                "epoch": 20,
            }
        )
    stable = SELECTION._identity(
        registry["enrollments"]["stable_checkpoint"],
        "selection replay stable checkpoint",
    )
    dataset = SELECTION._identity(
        registry["enrollments"]["selection_dataset"],
        "selection replay dataset",
    )
    return replay(
        data_path=str(home_root / dataset["path"]),
        dataset_identity={
            "bytes": dataset["bytes"],
            "sha256": dataset["sha256"],
        },
        checkpoint_specs=[
            {
                "name": "stable",
                "path": str(home_root / stable["path"]),
                "bytes": stable["bytes"],
                "sha256": stable["sha256"],
                "epoch": 27,
            },
            *checkpoint_specs,
        ],
        expected_records=completion["dataset_records"],
        expected_parents=completion["emitted_parent_groups"],
        max_workers=2,
    )


def run_strength_first_fresh_final_teacher_preflight_core(
    *,
    repo_root: str,
    home_root: str,
    dependencies: _Dependencies,
) -> dict[str, Any]:
    root = Path(repo_root).resolve()
    home = Path(home_root).expanduser().resolve()
    registry_path = (
        root / SELECTION.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
    )
    registry_raw = dependencies.read_bytes(str(registry_path))
    registry = _strict_json(registry_raw, "selection evaluator registry")
    registry = dict(
        SELECTION.validate_strength_first_selection_evaluator_registry_data(registry)
    )
    dependencies.verify_tracked(str(registry_path), registry_raw)

    if (
        registry["status"]
        != SELECTION.STRENGTH_FIRST_SELECTION_PUBLICATION_ENROLLED_STATUS
    ):
        raise FreshFinalTeacherPreflightBlocked(
            "selected candidate publication is not enrolled and replay-ready"
        )

    for name, identity in registry["protocol"].items():
        if name == "fresh_selection_source":
            continue
        _validate_tracked_identity(
            root,
            identity,
            dependencies,
            f"selection evaluator protocol {name}",
        )
    for name, identity in registry["implementation"].items():
        _validate_tracked_identity(
            root,
            identity,
            dependencies,
            f"selection evaluator implementation {name}",
        )
    for name in ("training_plan", "selection_preflight_registry"):
        _validate_tracked_identity(
            root,
            registry["enrollments"][name],
            dependencies,
            f"selection evaluator enrollment {name}",
        )

    private_artifacts = {}
    for name, expected_path in (
        (
            "selection_evaluation_report",
            SELECTION.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_PATH,
        ),
        ("selection_receipt", SELECTION.STRENGTH_FIRST_SELECTION_RECEIPT_PATH),
        (
            "selection_publication_result",
            SELECTION.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_PATH,
        ),
    ):
        relative = registry["fixed_paths"][name]
        if relative != expected_path:
            raise ValueError(f"{name} fixed path drifted")
        artifact_path = home / relative
        if os.path.realpath(artifact_path) != os.path.abspath(artifact_path):
            raise ValueError(f"{name} fixed path is not canonical")
        private_artifacts[name] = dependencies.read_private_artifact(str(artifact_path))

    evaluation_report_raw = private_artifacts["selection_evaluation_report"]
    evaluation_report = _strict_json(
        evaluation_report_raw,
        "selection evaluation report",
    )
    receipt_raw = private_artifacts["selection_receipt"]
    receipt = _strict_json(receipt_raw, "selection receipt")
    publication_result_raw = private_artifacts["selection_publication_result"]
    publication_result = _strict_json(
        publication_result_raw,
        "selection publication result",
    )
    replayed_evaluation_report = _replay_selection_evaluation(
        receipt=receipt,
        registry=registry,
        repo_root=root,
        home_root=home,
        replay=dependencies.replay_evaluation,
    )
    return build_fresh_final_teacher_selection_preflight(
        registry=registry,
        registry_raw=registry_raw,
        evaluation_report=evaluation_report,
        evaluation_report_raw=evaluation_report_raw,
        receipt=receipt,
        receipt_raw=receipt_raw,
        publication_result=publication_result,
        publication_result_raw=publication_result_raw,
        replayed_evaluation_report=replayed_evaluation_report,
    )


def _read_private_artifact(path: str) -> bytes:
    parent = os.path.dirname(path)
    parent_stat = os.lstat(parent)
    if (
        not stat.S_ISDIR(parent_stat.st_mode)
        or parent_stat.st_uid != os.geteuid()
        or stat.S_IMODE(parent_stat.st_mode) != 0o700
    ):
        raise ValueError(
            "selection publication directory must be a current-user 0700 directory"
        )
    before = os.lstat(path)
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_uid != os.geteuid()
        or stat.S_IMODE(before.st_mode) != 0o600
        or before.st_nlink != 1
    ):
        raise ValueError(
            "selection publication must be a current-user 0600 regular file"
        )
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    try:
        opened = os.fstat(descriptor)
        if (
            opened.st_dev != before.st_dev
            or opened.st_ino != before.st_ino
            or not stat.S_ISREG(opened.st_mode)
        ):
            raise ValueError("selection publication changed before open")
        blocks = []
        while True:
            block = os.read(descriptor, 1024 * 1024)
            if not block:
                break
            blocks.append(block)
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    final = os.lstat(path)
    observed = (
        before.st_dev,
        before.st_ino,
        before.st_mode,
        before.st_size,
        before.st_mtime_ns,
        before.st_ctime_ns,
        before.st_nlink,
    )
    for current in (after, final):
        if (
            current.st_dev,
            current.st_ino,
            current.st_mode,
            current.st_size,
            current.st_mtime_ns,
            current.st_ctime_ns,
            current.st_nlink,
        ) != observed:
            raise ValueError("selection publication changed while being read")
    return b"".join(blocks)


def run_strength_first_fresh_final_teacher_preflight() -> dict[str, Any]:
    root = os.path.realpath(Path(__file__).resolve().parent.parent)
    home = os.path.realpath(Path.home())
    revision = SELECTION._git_head(root)
    dependencies = _Dependencies(
        read_bytes=lambda path: Path(path).read_bytes(),
        verify_tracked=lambda path, raw: _verify_tracked_file(
            path,
            revision,
            raw,
        ),
        read_private_artifact=_read_private_artifact,
        replay_evaluation=EVALUATION.evaluate_strength_first_selection,
    )
    return run_strength_first_fresh_final_teacher_preflight_core(
        repo_root=root,
        home_root=home,
        dependencies=dependencies,
    )


def _stop(reason: str, *, selection_evaluator_registry_reads: int) -> dict[str, Any]:
    return {
        "schema": CLI_SCHEMA,
        "status": "STOP",
        "reason": reason,
        "selection_evaluator_registry_reads": selection_evaluator_registry_reads,
        "selection_receipt_reads": 0,
        "selection_dataset_reads": 0,
        "fresh_final_source_reads": 0,
        "fresh_final_label_reads": 0,
        "teacher_engines_started": 0,
        "network_requests": 0,
        "cloud_requests": 0,
        "live_weight_writes": 0,
    }


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        summary = _stop(
            "arguments-forbidden",
            selection_evaluator_registry_reads=0,
        )
    else:
        try:
            summary = run_strength_first_fresh_final_teacher_preflight()
        except FreshFinalTeacherPreflightBlocked:
            summary = _stop(
                "selected-candidate-receipt-not-ready",
                selection_evaluator_registry_reads=1,
            )
        except (OSError, ValueError) as error:
            print(f"[fresh-final-teacher-preflight] STOP: {error}", file=sys.stderr)
            return 1
        else:
            sys.stdout.buffer.write(_canonical_json_bytes(summary))
            return 0
    sys.stdout.buffer.write(_canonical_json_bytes(summary))
    return 2


__all__ = [
    "CLI_SCHEMA",
    "FreshFinalTeacherPreflightBlocked",
    "SUMMARY_SCHEMA",
    "SUMMARY_STATUS",
    "build_fresh_final_teacher_selection_preflight",
    "run_strength_first_fresh_final_teacher_preflight",
    "run_strength_first_fresh_final_teacher_preflight_core",
]


if __name__ == "__main__":
    raise SystemExit(main())
