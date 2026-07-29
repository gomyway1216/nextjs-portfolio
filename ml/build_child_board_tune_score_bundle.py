#!/usr/bin/env python3
"""Build the immutable real-data tune score bundle.

The builder deliberately performs every unprotected prerequisite check before
it opens either tune partition.  It then re-derives the registered 196 Browser
and 4,411 V9 parents from the authenticated source graph, applies the pinned
production-move projection, and forwards the two frozen teachers and the
frozen student on identical move sets.
"""

from __future__ import annotations

import argparse
from collections.abc import Mapping, Sequence
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
from typing import Any
import uuid

import torch

import capacity_policy_value as cpv
import capacity_policy_value_data as data_contract
import child_board_root_policy_student as student
import child_board_strength_candidate_postphase_registry as REGISTRY
import child_board_tune_membership_clarification as TUNE_MEMBERSHIP
import listwise_policy_value as lpv


ARTIFACT_SCHEMA = "shogi-child-board-strength-candidate-artifact-set-v1"
ROW_SCHEMA = "shogi-child-board-strength-candidate-score-row-v1"
BUNDLE_RECEIPT_SCHEMA = (
    "shogi-child-board-strength-candidate-score-bundle-receipt-v1"
)
SOURCE_SCHEMA = "shogi-child-board-strength-candidate-tune-source-v1"
STUDENT_RESULT_STATUS = "complete-fit-only-student-frozen-tune-locked"
BUILD_RECEIPT_SCHEMA = (
    "shogi-child-board-root-policy-production-build-receipt-v1"
)


class BundleBuildError(ValueError):
    """A prerequisite or immutable output did not match the contract."""


def _reject_constant(value: str) -> None:
    raise BundleBuildError(f"non-finite JSON number is forbidden: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise BundleBuildError(f"duplicate JSON key is forbidden: {key}")
        result[key] = value
    return result


def _strict_json(path: Path, label: str) -> dict[str, Any]:
    raw = _read_regular(path, label)
    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BundleBuildError(f"{label} is not strict UTF-8 JSON") from error
    if type(value) is not dict:
        raise BundleBuildError(f"{label} root must be an object")
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
        metadata = path.lstat()
    except OSError as error:
        raise BundleBuildError(f"{label} is unavailable: {path}") from error
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise BundleBuildError(f"{label} must be a regular non-symlink file")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
        with os.fdopen(descriptor, "rb") as stream:
            return stream.read()
    except OSError as error:
        raise BundleBuildError(f"{label} could not be read safely") from error


def _fingerprint(path: Path) -> dict[str, object]:
    raw = _read_regular(path, str(path))
    return {
        "path": str(path),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _require_identity(
    identity: object,
    *,
    path: Path,
    label: str,
) -> dict[str, object]:
    actual = _fingerprint(path)
    if (
        type(identity) is not dict
        or set(identity) != {"path", "bytes", "sha256"}
        or identity != actual
    ):
        raise BundleBuildError(f"{label} identity mismatch")
    return actual


def _require_registered_file(
    registered: object,
    *,
    path: Path,
    label: str,
) -> dict[str, object]:
    if type(registered) is not dict:
        raise BundleBuildError(f"{label} receipt is malformed")
    actual = _fingerprint(path)
    if any(
        registered.get(key) != actual[key] for key in ("bytes", "sha256")
    ):
        raise BundleBuildError(f"{label} identity mismatch")
    return actual


def _publish_or_validate(path: Path, payload: bytes) -> None:
    if path.exists():
        if _read_regular(path, str(path)) != payload:
            raise BundleBuildError(f"immutable output mismatch: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.parent / (
        f".{path.name}.tmp-{os.getpid()}-{uuid.uuid4().hex}"
    )
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_NOFOLLOW", 0)
    )
    try:
        descriptor = os.open(temporary, flags, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(payload)
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
        raise BundleBuildError(
            f"create-only output publication failed: {path}"
        ) from error
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def _require_student_terminal(
    student_result_path: Path,
) -> tuple[dict[str, Any], dict[str, object]]:
    result = _strict_json(student_result_path, "student terminal result")
    if (
        result.get("schema")
        != "shogi-child-board-root-policy-student-runtime-result-v1"
        or result.get("status") != STUDENT_RESULT_STATUS
        or result.get("tune_opened") is not False
        or result.get("sealed_opened") is not False
        or result.get("live_weights_changed") is not False
    ):
        raise BundleBuildError(
            "student terminal result is incomplete or protected data is open"
        )
    training = result.get("training")
    runtime = result.get("runtime_artifacts")
    if type(training) is not dict or type(runtime) is not dict:
        raise BundleBuildError("student terminal artifact graph is absent")
    final = training.get("final_checkpoint")
    tensor = runtime.get("tensor")
    manifest = runtime.get("manifest")
    for identity, label in (
        (final, "frozen student checkpoint"),
        (tensor, "student tensor"),
        (manifest, "student manifest"),
    ):
        if type(identity) is not dict or type(identity.get("path")) is not str:
            raise BundleBuildError(f"{label} receipt is malformed")
        _require_identity(
            identity,
            path=Path(identity["path"]),
            label=label,
        )
    return result, dict(final)


def _require_build_receipt(
    build_receipt_path: Path,
    *,
    student_result_identity: Mapping[str, object],
) -> dict[str, Any]:
    receipt = _strict_json(build_receipt_path, "production build receipt")
    if (
        receipt.get("schema") != BUILD_RECEIPT_SCHEMA
        or receipt.get("status") != "complete-production-build-frozen-tune-locked"
        or receipt.get("student_result") != student_result_identity
        or receipt.get("tune_opened") is not False
        or receipt.get("sealed_opened") is not False
        or receipt.get("live_weights_changed") is not False
    ):
        raise BundleBuildError("production build receipt is incomplete or drifted")
    return receipt


def _phase1_and_models(
    phase1_result_path: Path,
) -> tuple[dict[str, Any], dict[int, dict[str, object]]]:
    phase1 = _strict_json(phase1_result_path, "phase-1 terminal result")
    if (
        phase1.get("schema")
        != "shogi-child-board-strength-candidate-result-v1"
        or phase1.get("status")
        != "complete-phase1-two-scratch-checkpoints-frozen-tune-locked"
        or phase1.get("tune_opened") is not False
        or phase1.get("sealed_opened") is not False
        or phase1.get("live_weights_changed") is not False
    ):
        raise BundleBuildError("phase-1 terminal result is not locked")
    training = phase1.get("training")
    finals = training.get("final_checkpoints") if type(training) is dict else None
    if type(finals) is not list or len(finals) != 2:
        raise BundleBuildError("phase-1 frozen checkpoints are incomplete")
    by_seed: dict[int, dict[str, object]] = {}
    for row in finals:
        if type(row) is not dict or type(row.get("seed")) is not int:
            raise BundleBuildError("phase-1 checkpoint receipt is malformed")
        seed = int(row["seed"])
        checkpoint = row.get("checkpoint")
        if seed not in (42, 314159) or type(checkpoint) is not dict:
            raise BundleBuildError("phase-1 seed/checkpoint mismatch")
        _require_identity(
            checkpoint,
            path=Path(str(checkpoint.get("path"))),
            label=f"seed-{seed} teacher",
        )
        by_seed[seed] = dict(checkpoint)
    if set(by_seed) != {42, 314159}:
        raise BundleBuildError("phase-1 seed set mismatch")
    return phase1, by_seed


def _load_tune_groups(
    parent_protocol: Mapping[str, Any],
    *,
    repo_root: Path,
) -> dict[str, list[lpv.ParentGroup]]:
    receipt = parent_protocol.get("data_receipt")
    if type(receipt) is not dict:
        raise BundleBuildError("parent tune data receipt is absent")
    sources = receipt.get("sources")
    fit_tune = receipt.get("fit_tune")
    if type(sources) is not dict or type(fit_tune) is not dict:
        raise BundleBuildError("parent tune source/split receipt is absent")
    inputs = parent_protocol.get("inputs")
    live = inputs.get("live_nnue") if type(inputs) is dict else None
    if type(live) is not dict or type(live.get("path")) is not str:
        raise BundleBuildError("parent live NNUE receipt is absent")
    live_path = Path(live["path"])
    if not live_path.is_absolute():
        live_path = repo_root / live_path
    _require_registered_file(live, path=live_path, label="exact live NNUE")
    qweights = lpv.read_live_board_qweights(live_path)
    browser_source = sources.get("browser")
    v9_source = sources.get("v9")
    if type(browser_source) is not dict or type(v9_source) is not dict:
        raise BundleBuildError("domain source receipts are absent")
    browser, observed_browser = lpv.load_groups(
        browser_source["path"],
        role="browser-all-legal",
        expected_split="train",
        qweights=qweights,
    )
    v9, observed_v9 = lpv.load_groups(
        v9_source["path"],
        role="v9",
        expected_split="train",
        qweights=qweights,
    )
    protected_sets: list[frozenset[str]] = []
    observed_protected: list[dict[str, object]] = []
    for registered in sources.get("protected_position_ids", []):
        identifiers, observed = data_contract.read_protected_position_ids(
            registered["path"]
        )
        protected_sets.append(identifiers)
        observed_protected.append(observed)
    known = sources.get("known_eval_position_ids")
    if type(known) is not dict or type(known.get("sources")) is not list:
        raise BundleBuildError("known-eval source receipt is absent")
    siblings = [
        row["path"]
        for row in known["sources"]
        if row.get("role") == "known-eval-sibling"
    ]
    scalars = [
        row["path"]
        for row in known["sources"]
        if row.get("role") == "known-eval-scalar"
    ]
    known_ids, observed_known = data_contract.read_known_eval_position_ids(
        sibling_paths=siblings,
        scalar_paths=scalars,
    )
    protected_sets.append(known_ids)
    browser_kept, v9_kept, observed_partition = (
        data_contract.partition_sources(
            browser=browser,
            v9=v9,
            spent_groups=[],
            protected_sets=protected_sets,
        )
    )
    split_seed = int(fit_tune.get("split_seed", -1))
    tune_modulus = int(fit_tune.get("tune_modulus", -1))
    _browser_fit, browser_tune, browser_split = (
        lpv.split_by_semantic_components(
            browser_kept,
            seed=split_seed,
            tune_modulus=tune_modulus,
        )
    )
    _v9_fit, v9_tune, v9_split = lpv.split_by_semantic_components(
        v9_kept,
        seed=split_seed,
        tune_modulus=tune_modulus,
    )
    observed = {
        "sources": {
            "browser": observed_browser,
            "v9": observed_v9,
            "protected_position_ids": observed_protected,
            "known_eval_position_ids": observed_known,
        },
        "partition": observed_partition,
        "fit_tune": {
            "algorithm": "game-semantic-connected-components-sha256-v1",
            "split_seed": split_seed,
            "tune_modulus": tune_modulus,
            "browser": browser_split,
            "v9": v9_split,
        },
    }
    if observed != receipt:
        raise BundleBuildError("authenticated tune partition receipt drift")
    if len(browser_tune) != 196 or len(v9_tune) != 4_411:
        raise BundleBuildError("registered tune parent count drift")
    return {"browser_tune": browser_tune, "v9_tune": v9_tune}


def _project_tune_groups(
    groups: Mapping[str, Sequence[lpv.ParentGroup]],
) -> dict[str, list[lpv.ParentGroup]]:
    """Project exactly the authenticated source candidates, adding no labels."""

    projected: dict[str, list[lpv.ParentGroup]] = {}
    for domain in ("browser_tune", "v9_tune"):
        rows = student.project_groups_to_production(groups[domain])
        projected[domain] = [
            row.group
            for row in sorted(
                rows,
                key=lambda value: value.group.parent_id.encode("ascii"),
            )
        ]
        if any(len(group.examples) < 2 for group in projected[domain]):
            raise BundleBuildError(
                f"{domain} contains fewer than two projected source moves"
            )
    return projected


def _source_payload(
    domain: str,
    groups: Sequence[lpv.ParentGroup],
) -> bytes:
    rows: list[bytes] = []
    for group in groups:
        rows.append(
            _canonical(
                {
                    "schema": SOURCE_SCHEMA,
                    "domain": domain,
                    "parent_id": group.parent_id,
                    "parent_sfen": group.parent_sfen,
                    "moves": [
                        {
                            "move": example.move,
                            "teacher_cp": example.teacher_cp,
                            "exact_live_cp": example.base_parent_cp,
                            "child_position_id": example.child_position_id,
                            "child_sfen": example.child_sfen,
                        }
                        for example in sorted(
                            group.examples,
                            key=lambda value: value.move.encode("ascii"),
                        )
                    ],
                }
            )
        )
    return b"".join(rows)


def _load_teacher(
    checkpoint_identity: Mapping[str, object],
    *,
    seed: int,
    device: str,
) -> cpv.OfflineChildBoardCapacityPolicyValue:
    value = torch.load(
        str(checkpoint_identity["path"]),
        map_location="cpu",
        weights_only=False,
    )
    if (
        type(value) is not dict
        or value.get("seed") != seed
        or value.get("parameters") != 6_168_130
        or type(value.get("model")) is not dict
    ):
        raise BundleBuildError(f"seed-{seed} teacher checkpoint metadata drift")
    model = cpv.OfflineChildBoardCapacityPolicyValue()
    model.load_state_dict(value["model"], strict=True)
    return model.to(device).eval()


def _load_student(
    checkpoint_identity: Mapping[str, object],
    *,
    device: str,
) -> student.ChildBoardRootPolicyStudent:
    value = torch.load(
        str(checkpoint_identity["path"]),
        map_location="cpu",
        weights_only=False,
    )
    if (
        type(value) is not dict
        or value.get("checkpoint_schema")
        != "shogi-child-board-root-policy-student-final-checkpoint-v1"
        or value.get("schema") != student.SCHEMA
        or value.get("parameters") != student.PARAMETERS
        or value.get("phase") != "mixed"
        or value.get("completed_epoch") != 12
        or type(value.get("model")) is not dict
    ):
        raise BundleBuildError("frozen student checkpoint metadata drift")
    model = student.ChildBoardRootPolicyStudent()
    model.load_state_dict(value["model"], strict=True)
    return model.to(device).eval()


def _score_payload(
    groups: Mapping[str, Sequence[lpv.ParentGroup]],
    *,
    teachers: Mapping[int, cpv.OfflineChildBoardCapacityPolicyValue],
    student_model: student.ChildBoardRootPolicyStudent,
    device: str,
    parent_batch_size: int,
) -> tuple[bytes, int]:
    rows: list[bytes] = []
    count = 0
    with torch.inference_mode():
        for domain in ("browser_tune", "v9_tune"):
            domain_groups = groups[domain]
            for start in range(0, len(domain_groups), parent_batch_size):
                selected = domain_groups[start : start + parent_batch_size]
                batch = cpv.make_batch(
                    selected,
                    device,
                    include_child_planes=True,
                )
                seed42 = teachers[42](batch)[0].detach().cpu()
                seed314159 = teachers[314159](batch)[0].detach().cpu()
                frozen_student = student_model(batch)[0].detach().cpu()
                exact_live = batch["base_cp"].detach().cpu()
                teacher_cp = batch["teacher_cp"].detach().cpu()
                for parent_index, group in enumerate(selected):
                    for move_index, example in enumerate(group.examples):
                        row = {
                            "schema": ROW_SCHEMA,
                            "domain": domain,
                            "parent_id": group.parent_id,
                            "move": example.move,
                            "teacher_cp": float(
                                teacher_cp[parent_index, move_index].item()
                            ),
                            "scores": {
                                "exact_live": float(
                                    exact_live[parent_index, move_index].item()
                                ),
                                "seed42_teacher": float(
                                    seed42[parent_index, move_index].item()
                                ),
                                "seed314159_teacher": float(
                                    seed314159[parent_index, move_index].item()
                                ),
                                "frozen_student": float(
                                    frozen_student[
                                        parent_index, move_index
                                    ].item()
                                ),
                            },
                        }
                        rows.append(_canonical(row))
                        count += 1
    return b"".join(rows), count


def build_tune_bundle(
    *,
    repo_root: Path,
    output_root: Path | None = None,
    student_result_path: Path | None = None,
    phase1_result_path: Path | None = None,
    build_receipt_path: Path | None = None,
    device: str,
    parent_batch_size: int = 32,
    registry_override: Mapping[str, Any] | None = None,
    parent_protocol_override: Mapping[str, Any] | None = None,
    tune_groups_override: Mapping[str, Sequence[lpv.ParentGroup]] | None = None,
    models_override: tuple[
        Mapping[int, cpv.OfflineChildBoardCapacityPolicyValue],
        student.ChildBoardRootPolicyStudent,
    ]
    | None = None,
) -> dict[str, object]:
    """Build or byte-validate the complete immutable tune inputs."""

    if parent_batch_size < 1:
        raise BundleBuildError("parent batch size must be positive")
    registry = (
        dict(registry_override)
        if registry_override is not None
        else REGISTRY.validate_checked_in_registry(repo_root)
    )
    tune_clarification = (
        TUNE_MEMBERSHIP.validate(repo_root)
        if registry_override is None
        else None
    )
    registered_root = Path(registry["outputs"]["tune"]["root"])
    output = registered_root if output_root is None else output_root
    student_output = Path(registry["outputs"]["student_runtime"]["root"])
    student_result = (
        student_output / "result.json"
        if student_result_path is None
        else student_result_path
    )
    # All of these checks precede loading or deriving either tune partition.
    student_terminal, student_checkpoint = _require_student_terminal(
        student_result
    )
    student_result_identity = _fingerprint(student_result)
    build_receipt = (
        student_output / "production-build-receipt.json"
        if build_receipt_path is None
        else build_receipt_path
    )
    _require_build_receipt(
        build_receipt,
        student_result_identity=student_result_identity,
    )
    for lane in ("tune", "sealed"):
        lane_outputs = registry["outputs"][lane]
        for key in ("opened_marker", "pending_result", "result"):
            if Path(lane_outputs[key]).exists():
                raise BundleBuildError(
                    f"{lane} protected scoring state is already open"
                )
    phase1_path = (
        Path(
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "child-board-strength-candidate-v1-phase1/result.json"
        )
        if phase1_result_path is None
        else phase1_result_path
    )
    _phase1, teacher_identities = _phase1_and_models(phase1_path)
    parent_protocol = (
        dict(parent_protocol_override)
        if parent_protocol_override is not None
        else _strict_json(
            repo_root / REGISTRY.PARENT_PROTOCOL_RELATIVE_PATH,
            "parent protocol",
        )
    )
    live = parent_protocol["inputs"]["live_nnue"]
    groups = (
        {key: list(value) for key, value in tune_groups_override.items()}
        if tune_groups_override is not None
        else _load_tune_groups(parent_protocol, repo_root=repo_root)
    )
    projected = _project_tune_groups(groups)
    if tune_clarification is not None:
        registered_membership = tune_clarification["tune_membership"]
        for domain in ("browser_tune", "v9_tune"):
            if (
                len(projected[domain])
                != registered_membership[domain]["parents"]
                or sum(len(group.examples) for group in projected[domain])
                != registered_membership[domain]["projected_source_moves"]
            ):
                raise BundleBuildError(
                    f"{domain} prospective source membership drift"
                )
    if models_override is None:
        teachers = {
            seed: _load_teacher(identity, seed=seed, device=device)
            for seed, identity in teacher_identities.items()
        }
        student_model = _load_student(student_checkpoint, device=device)
    else:
        teachers, student_model = models_override
        if set(teachers) != {42, 314159}:
            raise BundleBuildError("teacher model override seed set mismatch")
        for model in [*teachers.values(), student_model]:
            model.to(device).eval()

    output.mkdir(parents=True, exist_ok=True)
    source_paths = {
        "browser_tune": output / "browser-tune-source.jsonl",
        "v9_tune": output / "v9-tune-source.jsonl",
    }
    for domain, path in source_paths.items():
        _publish_or_validate(path, _source_payload(domain, projected[domain]))
    artifact_receipt = {
        "schema": ARTIFACT_SCHEMA,
        "artifacts": {
            "exact_live": {
                **_fingerprint(
                    (
                        Path(live["path"])
                        if Path(live["path"]).is_absolute()
                        else repo_root / Path(live["path"])
                    )
                ),
                "role": "exact_live",
            },
            "seed42_teacher": {
                **teacher_identities[42],
                "role": "seed42_teacher",
            },
            "seed314159_teacher": {
                **teacher_identities[314159],
                "role": "seed314159_teacher",
            },
            "frozen_student": {
                **student_checkpoint,
                "role": "frozen_student",
            },
        },
        "tune_opened": False,
        "sealed_labels_generated": False,
        "sealed_scores_opened": False,
        "live_weights_changed": False,
    }
    artifact_path = output / "artifacts.json"
    _publish_or_validate(artifact_path, _canonical(artifact_receipt))
    score_raw, row_count = _score_payload(
        projected,
        teachers=teachers,
        student_model=student_model,
        device=device,
        parent_batch_size=parent_batch_size,
    )
    score_path = output / "score-bundle.jsonl"
    _publish_or_validate(score_path, score_raw)
    artifact_raw = _read_regular(artifact_path, "artifact receipt")
    receipt = {
        "schema": BUNDLE_RECEIPT_SCHEMA,
        "lane": "tune",
        "bundle": _fingerprint(score_path),
        "domains": ["browser_tune", "v9_tune"],
        "artifact_receipt_sha256": hashlib.sha256(artifact_raw).hexdigest(),
        "source_receipts": {
            domain: _fingerprint(path)
            for domain, path in source_paths.items()
        },
        "rows": row_count,
        "parents": sum(len(value) for value in projected.values()),
    }
    receipt_path = output / "score-bundle-receipt.json"
    _publish_or_validate(receipt_path, _canonical(receipt))
    return {
        "schema": BUNDLE_RECEIPT_SCHEMA,
        "status": "complete-real-tune-score-bundle-frozen-unopened",
        "artifact_receipt": _fingerprint(artifact_path),
        "score_bundle": _fingerprint(score_path),
        "score_bundle_receipt": _fingerprint(receipt_path),
        "source_receipts": receipt["source_receipts"],
        "parents": receipt["parents"],
        "rows": row_count,
        "tune_opened": False,
        "sealed_scores_opened": False,
        "live_weights_changed": False,
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument(
        "--device",
        choices=("cpu", "mps"),
        default="mps" if torch.backends.mps.is_available() else "cpu",
    )
    parser.add_argument("--parent-batch-size", type=int, default=32)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = build_tune_bundle(
            repo_root=args.repo_root.resolve(),
            device=args.device,
            parent_batch_size=args.parent_batch_size,
        )
    except (OSError, RuntimeError, BundleBuildError, ValueError) as error:
        raise SystemExit(f"tune score-bundle build refused: {error}") from error
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
