#!/usr/bin/env python3
"""Produce the real sealed-512 four-role score bundle.

The producer is deliberately separate from the one-shot metric scorer.  It
strict-loads both frozen phase-1 teacher checkpoints and the terminal student
checkpoint, evaluates every sealed legal move, and publishes only immutable
content-addressed artifacts.  A missing student terminal result, a failed tune
result, or any label/receipt drift stops before the first output byte.
"""

from __future__ import annotations

import argparse
from collections.abc import Mapping, Sequence
import hashlib
import json
import math
import os
from pathlib import Path
import stat
from typing import Any
import uuid

import torch

import capacity_policy_value as cpv
import child_board_root_policy_student as student
import child_board_strength_candidate_postphase_registry as registry_module
import listwise_policy_value as lpv


PHASE1_RESULT = Path(
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "child-board-strength-candidate-v1-phase1/result.json"
)
PHASE1_RESULT_SCHEMA = "shogi-child-board-strength-candidate-result-v1"
PHASE1_RESULT_STATUS = "complete-phase1-two-scratch-checkpoints-frozen-tune-locked"
STUDENT_RESULT_SCHEMA = "shogi-child-board-root-policy-student-runtime-result-v1"
STUDENT_RESULT_STATUS = "complete-fit-only-student-frozen-tune-locked"
ARTIFACT_RECEIPT_SCHEMA = "shogi-child-board-strength-candidate-artifact-set-v1"
SCORE_ROW_SCHEMA = "shogi-child-board-strength-candidate-score-row-v1"
SCORE_RECEIPT_SCHEMA = "shogi-child-board-strength-candidate-score-bundle-receipt-v1"
LABEL_RECEIPT_SCHEMA = "shogi-child-board-strength-candidate-sealed-label-receipt-v1"
DOMAIN = "sealed512"
ROLE_ORDER = (
    "exact_live",
    "seed42_teacher",
    "seed314159_teacher",
    "frozen_student",
)
TEACHER_PARAMETERS = 6_168_130


class BundleError(ValueError):
    """A frozen input or immutable output violated the registered contract."""


def _reject_constant(value: str) -> None:
    raise BundleError(f"non-finite JSON number is forbidden: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise BundleError(f"duplicate JSON key is forbidden: {key}")
        result[key] = value
    return result


def _strict_json(raw: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, BundleError) as error:
        raise BundleError(f"{label} is not strict UTF-8 JSON: {error}") from error
    if type(value) is not dict:
        raise BundleError(f"{label} root must be an object")
    return value


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


def _read_regular(path: Path, label: str) -> bytes:
    try:
        before = path.lstat()
    except OSError as error:
        raise BundleError(f"{label} is unavailable: {path}") from error
    if stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(before.st_mode):
        raise BundleError(f"{label} must be a regular non-symlink file")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
        with os.fdopen(descriptor, "rb") as stream:
            raw = stream.read()
    except OSError as error:
        raise BundleError(f"{label} could not be read safely") from error
    after = path.lstat()
    if (
        before.st_dev != after.st_dev
        or before.st_ino != after.st_ino
        or before.st_size != after.st_size
        or before.st_mtime_ns != after.st_mtime_ns
    ):
        raise BundleError(f"{label} changed while reading")
    return raw


def _identity(path: Path, raw: bytes | None = None) -> dict[str, object]:
    captured = _read_regular(path, str(path)) if raw is None else raw
    return {
        "path": str(path),
        "bytes": len(captured),
        "sha256": hashlib.sha256(captured).hexdigest(),
    }


def _verify_identity(
    registered: object,
    *,
    path: Path,
    raw: bytes,
    label: str,
) -> None:
    if type(registered) is not dict or set(registered) != {
        "path",
        "bytes",
        "sha256",
    }:
        raise BundleError(f"{label} identity keys mismatch")
    if registered != _identity(path, raw):
        raise BundleError(f"{label} path/byte/SHA identity mismatch")


def _atomic_create(path: Path, raw: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists():
        existing = _read_regular(path, f"existing {path.name}")
        if existing != raw:
            raise BundleError(f"existing immutable output differs: {path}")
        return
    temporary = path.parent / (f".{path.name}.tmp-{os.getpid()}-{uuid.uuid4().hex}")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(temporary, flags, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, path)
        temporary.unlink()
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    except OSError as error:
        raise BundleError(f"create-only publication failed: {path}") from error
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def _mapping(value: object, label: str) -> Mapping[str, Any]:
    if type(value) is not dict:
        raise BundleError(f"{label} must be an object")
    return value


def _verified_phase1() -> tuple[Mapping[str, Any], Mapping[int, Mapping[str, Any]]]:
    raw = _read_regular(PHASE1_RESULT, "phase-1 result")
    result = _strict_json(raw, "phase-1 result")
    if (
        result.get("schema") != PHASE1_RESULT_SCHEMA
        or result.get("status") != PHASE1_RESULT_STATUS
        or result.get("tune_opened") is not False
        or result.get("sealed_opened") is not False
        or result.get("live_weights_changed") is not False
    ):
        raise BundleError("phase-1 result is not frozen and closed")
    training = _mapping(result.get("training"), "phase-1 training")
    finals = training.get("final_checkpoints")
    if type(finals) is not list or len(finals) != 2:
        raise BundleError("phase-1 final checkpoint set is incomplete")
    by_seed: dict[int, Mapping[str, Any]] = {}
    for entry in finals:
        captured = _mapping(entry, "phase-1 checkpoint entry")
        seed = captured.get("seed")
        checkpoint = _mapping(captured.get("checkpoint"), "phase-1 checkpoint identity")
        if type(seed) is not int or seed not in (42, 314159):
            raise BundleError("phase-1 checkpoint seed mismatch")
        path = Path(str(checkpoint.get("path")))
        raw_checkpoint = _read_regular(path, f"seed-{seed} checkpoint")
        _verify_identity(
            checkpoint,
            path=path,
            raw=raw_checkpoint,
            label=f"seed-{seed} checkpoint",
        )
        receipt_path = path.with_name(f"seed-{seed}-final-receipt.json")
        receipt = _strict_json(
            _read_regular(receipt_path, f"seed-{seed} checkpoint receipt"),
            f"seed-{seed} checkpoint receipt",
        )
        if (
            receipt.get("schema")
            != "shogi-child-board-strength-candidate-checkpoint-receipt-v1"
            or receipt.get("seed") != seed
            or receipt.get("checkpoint") != checkpoint
        ):
            raise BundleError(f"seed-{seed} checkpoint receipt mismatch")
        by_seed[seed] = captured
    if set(by_seed) != {42, 314159}:
        raise BundleError("phase-1 checkpoint seeds are incomplete")
    return result, by_seed


def _load_teacher(
    entry: Mapping[str, Any],
    *,
    seed: int,
    device: str,
) -> cpv.OfflineChildBoardCapacityPolicyValue:
    checkpoint = _mapping(entry["checkpoint"], f"seed-{seed} checkpoint")
    value = torch.load(
        str(checkpoint["path"]),
        map_location="cpu",
        weights_only=False,
    )
    if (
        type(value) is not dict
        or value.get("seed") != seed
        or value.get("parameters") != TEACHER_PARAMETERS
        or type(value.get("model")) is not dict
    ):
        raise BundleError(f"seed-{seed} checkpoint metadata mismatch")
    model = cpv.OfflineChildBoardCapacityPolicyValue()
    model.load_state_dict(value["model"], strict=True)
    return model.to(device).eval()


def _verified_student(
    output: Mapping[str, Any],
) -> tuple[Mapping[str, Any], Path, bytes]:
    result_path = Path(str(output["result"]))
    result_raw = _read_regular(result_path, "student terminal result")
    result = _strict_json(result_raw, "student terminal result")
    if (
        result.get("schema") != STUDENT_RESULT_SCHEMA
        or result.get("status") != STUDENT_RESULT_STATUS
        or result.get("tune_opened") is not False
        or result.get("sealed_opened") is not False
        or result.get("live_weights_changed") is not False
    ):
        raise BundleError(
            "student terminal result is absent, incomplete, or already opened"
        )
    training = _mapping(result.get("training"), "student training")
    registered = training.get("final_checkpoint")
    if type(registered) is not dict:
        raise BundleError("student final checkpoint identity is absent")
    checkpoint_path = Path(str(registered.get("path")))
    checkpoint_raw = _read_regular(checkpoint_path, "student final checkpoint")
    _verify_identity(
        registered,
        path=checkpoint_path,
        raw=checkpoint_raw,
        label="student final checkpoint",
    )
    value = torch.load(
        checkpoint_path,
        map_location="cpu",
        weights_only=False,
    )
    if (
        type(value) is not dict
        or value.get("checkpoint_schema")
        != "shogi-child-board-root-policy-student-final-checkpoint-v1"
        or value.get("schema") != student.SCHEMA
        or value.get("feature_version") != student.FEATURE_VERSION
        or value.get("model_variant") != student.MODEL_VARIANT
        or value.get("parameters") != student.PARAMETERS
        or value.get("phase") != "mixed"
        or value.get("completed_epoch") != 12
        or type(value.get("model")) is not dict
    ):
        raise BundleError("student final checkpoint metadata mismatch")
    return value, checkpoint_path, checkpoint_raw


def _load_student(
    checkpoint: Mapping[str, Any],
    *,
    device: str,
) -> student.ChildBoardRootPolicyStudent:
    model = student.ChildBoardRootPolicyStudent()
    model.load_state_dict(checkpoint["model"], strict=True)
    return model.to(device).eval()


def _verified_tune_pass(
    outputs: Mapping[str, Any], contract: Mapping[str, Any]
) -> None:
    tune_output = _mapping(outputs["tune"], "tune outputs")
    path = Path(str(tune_output["result"]))
    result = _strict_json(_read_regular(path, "one-shot tune result"), "tune result")
    tune = _mapping(contract["tune"], "tune contract")
    if (
        result.get("schema") != tune_output["result_schema"]
        or result.get("status") != tune["success_status"]
        or result.get("pass") is not True
        or result.get("tune_opened") is not True
        or result.get("sealed_labels_generated") is not False
        or result.get("sealed_scores_opened") is not False
        or result.get("live_weights_changed") is not False
    ):
        raise BundleError("sealed scoring requires the exact successful tune result")


def _verified_labels(
    sealed_output: Mapping[str, Any],
    sealed_contract: Mapping[str, Any],
) -> tuple[Path, bytes, dict[str, Any]]:
    labels_path = Path(str(sealed_output["labels"]))
    receipt_path = Path(str(sealed_output["label_receipt"]))
    labels_raw = _read_regular(labels_path, "sealed labels")
    receipt_raw = _read_regular(receipt_path, "sealed label receipt")
    receipt = _strict_json(receipt_raw, "sealed label receipt")
    output = _mapping(receipt.get("output"), "sealed label output")
    if (
        receipt.get("schema") != LABEL_RECEIPT_SCHEMA
        or receipt.get("status") != "complete-sealed512-labels-candidate-scoring-locked"
        or receipt.get("parents") != sealed_contract["parents"]
        or receipt.get("candidate_scores_opened") is not False
        or receipt.get("live_weights_changed") is not False
    ):
        raise BundleError("sealed label receipt is not complete and locked")
    _verify_identity(
        output,
        path=labels_path,
        raw=labels_raw,
        label="sealed labels",
    )
    return (
        labels_path,
        labels_raw,
        {
            **_identity(receipt_path, receipt_raw),
        },
    )


def _predict_teacher(
    model: cpv.OfflineChildBoardCapacityPolicyValue,
    groups: Sequence[lpv.ParentGroup],
    *,
    device: str,
    batch_size: int,
) -> dict[tuple[str, str], float]:
    output: dict[tuple[str, str], float] = {}
    model.eval()
    with torch.no_grad():
        for start in range(0, len(groups), batch_size):
            selected = groups[start : start + batch_size]
            batch = cpv.make_batch(
                selected,
                device,
                include_child_planes=True,
            )
            prediction = model(batch)[0].detach().cpu()
            for row, group in enumerate(selected):
                for column, example in enumerate(group.examples):
                    value = float(prediction[row, column].item())
                    if not math.isfinite(value):
                        raise BundleError("teacher prediction became non-finite")
                    output[(group.parent_id, example.move)] = value
    return output


def _predict_student(
    model: student.ChildBoardRootPolicyStudent,
    groups: Sequence[lpv.ParentGroup],
    *,
    device: str,
    batch_size: int,
) -> dict[tuple[str, str], float]:
    output: dict[tuple[str, str], float] = {}
    model.eval()
    with torch.no_grad():
        for start in range(0, len(groups), batch_size):
            selected = groups[start : start + batch_size]
            batch = student.make_student_batch(selected, device)
            prediction = model(batch)[0].detach().cpu()
            for row, group in enumerate(selected):
                for column, example in enumerate(group.examples):
                    value = float(prediction[row, column].item())
                    if not math.isfinite(value):
                        raise BundleError("student prediction became non-finite")
                    output[(group.parent_id, example.move)] = value
    return output


def build_score_bundle(
    groups: Sequence[lpv.ParentGroup],
    predictions: Mapping[str, Mapping[tuple[str, str], float]],
) -> tuple[bytes, int]:
    """Build the registered strict domain/parent/move ordering."""

    if set(predictions) != set(ROLE_ORDER):
        raise BundleError("score prediction roles are incomplete")
    rows: list[dict[str, object]] = []
    ordered_groups = sorted(groups, key=lambda group: group.parent_id.encode())
    if len({group.parent_id for group in ordered_groups}) != len(ordered_groups):
        raise BundleError("sealed parent IDs are duplicated")
    for group in ordered_groups:
        examples = sorted(group.examples, key=lambda example: example.move.encode())
        if len(examples) < 2 or len({example.move for example in examples}) != len(
            examples
        ):
            raise BundleError(f"sealed parent {group.parent_id} is incomplete")
        for example in examples:
            key = (group.parent_id, example.move)
            scores: dict[str, float] = {}
            for role in ROLE_ORDER:
                try:
                    score = float(predictions[role][key])
                except KeyError as error:
                    raise BundleError(f"missing {role} score for {key}") from error
                if not math.isfinite(score):
                    raise BundleError(f"non-finite {role} score for {key}")
                scores[role] = 0.0 if score == 0.0 else score
            teacher_cp = float(example.teacher_cp)
            if not math.isfinite(teacher_cp):
                raise BundleError(f"non-finite teacher score for {key}")
            rows.append(
                {
                    "schema": SCORE_ROW_SCHEMA,
                    "domain": DOMAIN,
                    "parent_id": group.parent_id,
                    "move": example.move,
                    "teacher_cp": (0.0 if teacher_cp == 0.0 else teacher_cp),
                    "scores": scores,
                }
            )
    return b"".join(_canonical(row) for row in rows), len(rows)


def produce(*, repo_root: Path | None = None, device: str = "cpu") -> dict[str, object]:
    if device not in ("cpu", "mps"):
        raise BundleError("sealed score device must be cpu or mps")
    if device == "mps" and not torch.backends.mps.is_available():
        raise BundleError("sealed score MPS device is unavailable")
    registry = registry_module.validate_checked_in_registry(repo_root)
    outputs = _mapping(registry["outputs"], "registry outputs")
    contract = _mapping(registry["execution_contract"], "execution contract")
    sealed_output = _mapping(outputs["sealed"], "sealed outputs")
    sealed_contract = _mapping(contract["sealed"], "sealed contract")

    # Every protected prerequisite is verified before any output publication.
    _verified_tune_pass(outputs, contract)
    labels_path, _labels_raw, label_receipt_identity = _verified_labels(
        sealed_output, sealed_contract
    )
    _phase1, teachers = _verified_phase1()
    student_output = _mapping(outputs["student_runtime"], "student output")
    student_checkpoint, student_path, student_raw = _verified_student(student_output)
    root = (
        repo_root.resolve()
        if repo_root is not None
        else Path(__file__).resolve().parent.parent
    )
    live_path = root / "public/shogi-nnue-weights.bin"
    live_raw = _read_regular(live_path, "exact live NNUE")
    if (
        len(live_raw) != lpv.LIVE_NNUE_BYTES
        or hashlib.sha256(live_raw).hexdigest() != lpv.LIVE_NNUE_SHA256
    ):
        raise BundleError("exact live NNUE identity mismatch")
    qweights = lpv.read_live_board_qweights(live_path)
    groups, labels_identity = lpv.load_groups(
        labels_path,
        role="browser-all-legal",
        expected_split="sealed",
        qweights=qweights,
    )
    if labels_identity["parents"] != sealed_contract["parents"]:
        raise BundleError("sealed loaded parent count mismatch")

    teacher42 = _load_teacher(teachers[42], seed=42, device=device)
    teacher314159 = _load_teacher(teachers[314159], seed=314159, device=device)
    frozen_student = _load_student(student_checkpoint, device=device)
    try:
        predictions = {
            "exact_live": {
                (group.parent_id, example.move): float(example.base_parent_cp)
                for group in groups
                for example in group.examples
            },
            "seed42_teacher": _predict_teacher(
                teacher42, groups, device=device, batch_size=16
            ),
            "seed314159_teacher": _predict_teacher(
                teacher314159, groups, device=device, batch_size=16
            ),
            "frozen_student": _predict_student(
                frozen_student, groups, device=device, batch_size=32
            ),
        }
    finally:
        del teacher42, teacher314159, frozen_student

    bundle_raw, row_count = build_score_bundle(groups, predictions)
    artifact_path = Path(str(sealed_output["artifact_receipt"]))
    bundle_path = Path(str(sealed_output["score_bundle"]))
    bundle_receipt_path = Path(str(sealed_output["score_bundle_receipt"]))
    artifacts = {
        "exact_live": {
            **_identity(live_path, live_raw),
            "role": "exact_live",
        },
        "seed42_teacher": {
            **_identity(
                Path(str(teachers[42]["checkpoint"]["path"])),
                _read_regular(
                    Path(str(teachers[42]["checkpoint"]["path"])),
                    "seed-42 checkpoint",
                ),
            ),
            "role": "seed42_teacher",
        },
        "seed314159_teacher": {
            **_identity(
                Path(str(teachers[314159]["checkpoint"]["path"])),
                _read_regular(
                    Path(str(teachers[314159]["checkpoint"]["path"])),
                    "seed-314159 checkpoint",
                ),
            ),
            "role": "seed314159_teacher",
        },
        "frozen_student": {
            **_identity(student_path, student_raw),
            "role": "frozen_student",
        },
    }
    artifact_receipt = {
        "schema": ARTIFACT_RECEIPT_SCHEMA,
        "artifacts": artifacts,
        "tune_opened": True,
        "sealed_labels_generated": True,
        "sealed_scores_opened": False,
        "live_weights_changed": False,
    }
    artifact_raw = _canonical(artifact_receipt)
    bundle_identity = _identity(bundle_path, bundle_raw)
    bundle_receipt = {
        "schema": SCORE_RECEIPT_SCHEMA,
        "lane": "sealed",
        "bundle": bundle_identity,
        "domains": [DOMAIN],
        "artifact_receipt_sha256": hashlib.sha256(artifact_raw).hexdigest(),
        "source_receipts": {DOMAIN: label_receipt_identity},
        "rows": row_count,
        "parents": len(groups),
    }
    bundle_receipt_raw = _canonical(bundle_receipt)

    # Publish dependencies first and the receipt last. Any exact existing file
    # is validation-only; any differing file closes this producer attempt.
    _atomic_create(artifact_path, artifact_raw)
    _atomic_create(bundle_path, bundle_raw)
    _atomic_create(bundle_receipt_path, bundle_receipt_raw)
    return {
        "schema": "shogi-child-board-sealed512-score-bundle-producer-v1",
        "status": "complete-real-four-role-score-bundle",
        "artifacts": _identity(artifact_path, artifact_raw),
        "bundle": bundle_identity,
        "receipt": _identity(bundle_receipt_path, bundle_receipt_raw),
        "parents": len(groups),
        "rows": row_count,
        "device": device,
        "live_weights_changed": False,
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path)
    parser.add_argument("--device", choices=("cpu", "mps"), default="cpu")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    result = produce(repo_root=args.repo_root, device=args.device)
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
