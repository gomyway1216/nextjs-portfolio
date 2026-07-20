#!/usr/bin/env python3
"""Build one review-only terminal selection-evaluator registry candidate.

The argumentless production CLI reads the tracked READY registry and the
three fixed private publication artifacts, deterministically replays stable
plus seeds 42/43/44, and writes one pretty JSON candidate to stdout.  It does
not edit the tracked registry, read the fresh-final source, consult a
downstream registry, or authorize a live-weight write.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
import copy
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any

from fresh_qat_selection_preflight import _verify_tracked_file
import run_strength_first_fresh_final_teacher_preflight as FRESH_FINAL
import strength_first_qat_selection_eval_adapter as EVALUATION
import strength_first_qat_selection_evaluator as EVALUATOR


STRENGTH_FIRST_SELECTION_PUBLICATION_REGISTRY_CANDIDATE_COMMAND = (
    "~/.codex/shogi-data/floodgate-training-venv/bin/python3 "
    "ml/build_strength_first_selection_publication_registry_candidate.py"
)

_PUBLICATION_FIELDS = (
    "selection_evaluation_origin_registry",
    "selection_evaluation_report",
    "selection_receipt",
    "selection_publication_result",
)


class StrengthFirstSelectionPublicationRegistryCandidateError(ValueError):
    """The exact publication cannot produce one terminal registry candidate."""


@dataclass(frozen=True)
class _Dependencies:
    read_bytes: Callable[[str], bytes]
    verify_tracked: Callable[[str, bytes], None]
    read_private_artifact: Callable[[str], bytes]
    replay_evaluation: Callable[..., Mapping[str, Any]]


def _identity(*, path: str, raw: bytes, schema: str) -> dict[str, Any]:
    return {
        "path": path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": schema,
    }


def _ready_preimage(registry: Mapping[str, Any]) -> dict[str, Any]:
    ready = copy.deepcopy(dict(registry))
    if (
        ready["status"]
        == EVALUATOR.STRENGTH_FIRST_SELECTION_PUBLICATION_ENROLLED_STATUS
    ):
        ready["status"] = (
            EVALUATOR.STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS
        )
        for name in _PUBLICATION_FIELDS:
            ready["enrollments"][name] = None
        ready["gates"] = copy.deepcopy(EVALUATOR._READY_GATES)
        ready["nonclaims"] = copy.deepcopy(EVALUATOR._NONCLAIMS)
    if (
        ready["status"]
        != EVALUATOR.STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS
    ):
        raise StrengthFirstSelectionPublicationRegistryCandidateError(
            "tracked selection evaluator registry is not READY"
        )
    validated = dict(
        EVALUATOR.validate_strength_first_selection_evaluator_registry_data(
            ready
        )
    )
    return validated


def _read_tracked_identity(
    *,
    repo_root: Path,
    identity: Mapping[str, Any],
    label: str,
    dependencies: _Dependencies,
) -> tuple[str, bytes]:
    registered = EVALUATOR._identity(identity, label)
    absolute = str(repo_root / registered["path"])
    raw = dependencies.read_bytes(absolute)
    if (
        type(raw) is not bytes
        or len(raw) != registered["bytes"]
        or hashlib.sha256(raw).hexdigest() != registered["sha256"]
    ):
        raise StrengthFirstSelectionPublicationRegistryCandidateError(
            f"{label} identity mismatch"
        )
    if registered["path"].endswith(".json"):
        value = FRESH_FINAL._strict_json(raw, label)
        if value.get("schema") != registered["schema"]:
            raise StrengthFirstSelectionPublicationRegistryCandidateError(
                f"{label} schema mismatch"
            )
    dependencies.verify_tracked(absolute, raw)
    return absolute, raw


def _read_publications(
    *,
    home_root: Path,
    registry: Mapping[str, Any],
    dependencies: _Dependencies,
) -> dict[str, tuple[dict[str, Any], bytes]]:
    specifications = (
        (
            "selection_evaluation_report",
            EVALUATOR.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_PATH,
        ),
        (
            "selection_receipt",
            EVALUATOR.STRENGTH_FIRST_SELECTION_RECEIPT_PATH,
        ),
        (
            "selection_publication_result",
            EVALUATOR.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_PATH,
        ),
    )
    publications: dict[str, tuple[dict[str, Any], bytes]] = {}
    for name, expected_relative in specifications:
        relative = registry["fixed_paths"][name]
        if relative != expected_relative:
            raise StrengthFirstSelectionPublicationRegistryCandidateError(
                f"{name} fixed path drifted"
            )
        absolute = home_root / relative
        if os.path.realpath(absolute) != os.path.abspath(absolute):
            raise StrengthFirstSelectionPublicationRegistryCandidateError(
                f"{name} fixed path is not canonical"
            )
        raw = dependencies.read_private_artifact(str(absolute))
        value = FRESH_FINAL._strict_json(raw, name.replace("_", " "))
        publications[name] = (value, raw)
    return publications


def build_strength_first_selection_publication_registry_candidate_core(
    *,
    repo_root: str,
    home_root: str,
    dependencies: _Dependencies,
    _candidate_consumer: Callable[[Mapping[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Recompute one terminal candidate without editing any tracked file."""

    root = Path(repo_root).resolve()
    home = Path(home_root).expanduser().resolve()
    registry_path = (
        root
        / EVALUATOR.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
    )
    registry_raw = dependencies.read_bytes(str(registry_path))
    registry = FRESH_FINAL._strict_json(
        registry_raw,
        "selection evaluator registry",
    )
    registry = dict(
        EVALUATOR.validate_strength_first_selection_evaluator_registry_data(
            registry
        )
    )
    dependencies.verify_tracked(str(registry_path), registry_raw)
    ready = _ready_preimage(registry)
    ready_raw = EVALUATOR._canonical_json_bytes(ready)
    tracked_snapshots: dict[str, bytes] = {str(registry_path): registry_raw}

    for name, identity in ready["protocol"].items():
        if name == "fresh_selection_source":
            continue
        absolute, raw = _read_tracked_identity(
            repo_root=root,
            identity=identity,
            label=f"selection evaluator protocol {name}",
            dependencies=dependencies,
        )
        tracked_snapshots[absolute] = raw
    for name, identity in ready["implementation"].items():
        absolute, raw = _read_tracked_identity(
            repo_root=root,
            identity=identity,
            label=f"selection evaluator implementation {name}",
            dependencies=dependencies,
        )
        tracked_snapshots[absolute] = raw
    for name in ("training_plan", "selection_preflight_registry"):
        absolute, raw = _read_tracked_identity(
            repo_root=root,
            identity=ready["enrollments"][name],
            label=f"selection evaluator enrollment {name}",
            dependencies=dependencies,
        )
        tracked_snapshots[absolute] = raw

    publications = _read_publications(
        home_root=home,
        registry=ready,
        dependencies=dependencies,
    )
    report, report_raw = publications["selection_evaluation_report"]
    receipt, receipt_raw = publications["selection_receipt"]
    publication_result, publication_result_raw = publications[
        "selection_publication_result"
    ]
    report_identity = _identity(
        path=EVALUATOR.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_PATH,
        raw=report_raw,
        schema=EVALUATION.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_SCHEMA,
    )
    receipt_identity = _identity(
        path=EVALUATOR.STRENGTH_FIRST_SELECTION_RECEIPT_PATH,
        raw=receipt_raw,
        schema=EVALUATOR.STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA,
    )
    publication_result_identity = _identity(
        path=EVALUATOR.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_PATH,
        raw=publication_result_raw,
        schema=EVALUATOR.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_SCHEMA,
    )
    origin_registry_identity = _identity(
        path=(
            EVALUATOR
            .STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
        ),
        raw=ready_raw,
        schema=EVALUATOR.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_SCHEMA,
    )

    candidate = copy.deepcopy(ready)
    candidate["status"] = (
        EVALUATOR.STRENGTH_FIRST_SELECTION_PUBLICATION_ENROLLED_STATUS
    )
    enrollments = candidate["enrollments"]
    enrollments["selection_evaluation_origin_registry"] = (
        origin_registry_identity
    )
    enrollments["selection_evaluation_report"] = report_identity
    enrollments["selection_receipt"] = receipt_identity
    enrollments["selection_publication_result"] = publication_result_identity
    candidate["gates"] = copy.deepcopy(EVALUATOR._PUBLICATION_ENROLLED_GATES)
    candidate["nonclaims"] = copy.deepcopy(
        EVALUATOR._PUBLICATION_ENROLLED_NONCLAIMS
    )
    candidate = dict(
        EVALUATOR.validate_strength_first_selection_evaluator_registry_data(
            candidate
        )
    )

    for value, raw, label in (
        (report, report_raw, "selection evaluation report"),
        (receipt, receipt_raw, "selection receipt"),
        (
            publication_result,
            publication_result_raw,
            "selection publication result",
        ),
    ):
        if EVALUATOR._canonical_json_bytes(value) != raw:
            raise StrengthFirstSelectionPublicationRegistryCandidateError(
                f"{label} is not canonical JSON"
            )
    publication = FRESH_FINAL._strict_publication_result(publication_result)
    if (
        not EVALUATOR._typed_equal(
            publication["evaluation_origin_registry"],
            origin_registry_identity,
        )
        or not EVALUATOR._typed_equal(
            publication["evaluation_report"],
            report_identity,
        )
        or not EVALUATOR._typed_equal(
            publication["selection_receipt"],
            receipt_identity,
        )
    ):
        raise StrengthFirstSelectionPublicationRegistryCandidateError(
            "selection publication result binding mismatch"
        )
    try:
        selected = receipt["selected"]
        selected_seed = selected["seed"]
        selected_checkpoint = selected["checkpoint"]
    except (KeyError, TypeError) as error:
        raise StrengthFirstSelectionPublicationRegistryCandidateError(
            "selection receipt selected candidate is incomplete"
        ) from error
    if (
        not EVALUATOR._typed_equal(
            publication["selected_seed"],
            selected_seed,
        )
        or not EVALUATOR._typed_equal(
            publication["selected_checkpoint"],
            selected_checkpoint,
        )
    ):
        raise StrengthFirstSelectionPublicationRegistryCandidateError(
            "selection publication selected candidate mismatch"
        )

    replayed_report = FRESH_FINAL._replay_selection_evaluation(
        receipt=receipt,
        registry=candidate,
        repo_root=root,
        home_root=home,
        replay=dependencies.replay_evaluation,
    )
    FRESH_FINAL.build_fresh_final_teacher_selection_preflight(
        registry=candidate,
        registry_raw=EVALUATOR._canonical_json_bytes(candidate),
        evaluation_report=report,
        evaluation_report_raw=report_raw,
        receipt=receipt,
        receipt_raw=receipt_raw,
        publication_result=publication_result,
        publication_result_raw=publication_result_raw,
        replayed_evaluation_report=replayed_report,
    )
    if (
        registry["status"]
        == EVALUATOR.STRENGTH_FIRST_SELECTION_PUBLICATION_ENROLLED_STATUS
        and not EVALUATOR._typed_equal(registry, candidate)
    ):
        raise StrengthFirstSelectionPublicationRegistryCandidateError(
            "tracked terminal registry is not an idempotent recomputation"
        )

    for absolute, expected_raw in tracked_snapshots.items():
        current_raw = dependencies.read_bytes(absolute)
        if current_raw != expected_raw:
            raise StrengthFirstSelectionPublicationRegistryCandidateError(
                "tracked selection publication input changed before emission"
            )
        dependencies.verify_tracked(absolute, current_raw)
    current_publications = _read_publications(
        home_root=home,
        registry=ready,
        dependencies=dependencies,
    )
    for name, (_value, expected_raw) in publications.items():
        if current_publications[name][1] != expected_raw:
            raise StrengthFirstSelectionPublicationRegistryCandidateError(
                "private selection publication changed before emission"
            )

    if _candidate_consumer is not None:
        _candidate_consumer(copy.deepcopy(candidate))
    return candidate


def serialize_strength_first_selection_publication_registry_candidate(
    candidate: Mapping[str, Any],
) -> bytes:
    """Serialize one validated terminal registry candidate plus one LF."""

    try:
        validated = (
            EVALUATOR.validate_strength_first_selection_evaluator_registry_data(
                candidate
            )
        )
        if (
            validated["status"]
            != EVALUATOR.STRENGTH_FIRST_SELECTION_PUBLICATION_ENROLLED_STATUS
        ):
            raise ValueError("selection publication registry is not terminal")
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
        raise StrengthFirstSelectionPublicationRegistryCandidateError(
            "selection publication registry candidate cannot be serialized"
        ) from error


def build_strength_first_selection_publication_registry_candidate(
    *,
    _candidate_consumer: Callable[[Mapping[str, Any]], None] | None = None,
) -> dict[str, Any]:
    root = os.path.realpath(Path(__file__).resolve().parent.parent)
    home = os.path.realpath(Path.home())
    revision = EVALUATOR._git_head(root)
    dependencies = _Dependencies(
        read_bytes=lambda path: Path(path).read_bytes(),
        verify_tracked=lambda path, raw: _verify_tracked_file(
            path,
            revision,
            raw,
        ),
        read_private_artifact=FRESH_FINAL._read_private_artifact,
        replay_evaluation=EVALUATION.evaluate_strength_first_selection,
    )
    return build_strength_first_selection_publication_registry_candidate_core(
        repo_root=root,
        home_root=home,
        dependencies=dependencies,
        _candidate_consumer=_candidate_consumer,
    )


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        print(
            "[strength-first-selection-publication-registry-candidate] "
            "STOP: arguments are forbidden",
            file=sys.stderr,
        )
        return 2

    def emit(candidate: Mapping[str, Any]) -> None:
        serialized = (
            serialize_strength_first_selection_publication_registry_candidate(
                candidate
            )
        )
        written = sys.stdout.buffer.write(serialized)
        if written != len(serialized):
            raise OSError(
                "selection publication registry candidate stdout write was incomplete"
            )
        sys.stdout.buffer.flush()

    try:
        build_strength_first_selection_publication_registry_candidate(
            _candidate_consumer=emit,
        )
    except (
        OSError,
        RuntimeError,
        StrengthFirstSelectionPublicationRegistryCandidateError,
        ValueError,
    ) as error:
        print(
            "[strength-first-selection-publication-registry-candidate] "
            f"STOP: {error}",
            file=sys.stderr,
        )
        return 1
    return 0


__all__ = [
    "STRENGTH_FIRST_SELECTION_PUBLICATION_REGISTRY_CANDIDATE_COMMAND",
    "StrengthFirstSelectionPublicationRegistryCandidateError",
    "build_strength_first_selection_publication_registry_candidate",
    "build_strength_first_selection_publication_registry_candidate_core",
    "serialize_strength_first_selection_publication_registry_candidate",
]


if __name__ == "__main__":
    raise SystemExit(main())
