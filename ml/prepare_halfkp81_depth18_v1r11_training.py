#!/usr/bin/env python3
"""Prepare, but never execute, the v1r11 HalfKP81 training handoff.

The independent TypeScript verifier is the only producer of a receipt with
training authority.  This consumer reopens every file named by that receipt,
checks the complete authority chain and the 6144/1024/1024 parent split, and
publishes one create-only handoff document.  It deliberately does not start an
optimizer: the tracked v1r11 preregistration does not fix a seed value, batch,
learning rate, optimizer, or device, and no current trainer implements its
exact BCE + ListNet objective.  Treating either existing trainer as compatible
would silently change the experiment.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
from typing import Any, Mapping, Sequence

import halfkp81_depth18_strength_protocol as PROTOCOL


HANDOFF_SCHEMA = "shogi-halfkp81-depth18-v1r11-training-handoff-v1"
HANDOFF_STATUS = "authenticated-create-only-training-handoff-blocked-before-optimizer"
TRACKED_PLAN_SCHEMA = (
    "shogi-halfkp81-hard-depth18-yaneura-only-parent-fallback-ac-power-continuity-plan-v1r11"
)
TEACHER_PLAN_SCHEMA = (
    "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11"
)
TEACHER_WORK_SCHEMA = (
    "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r11"
)
ROLE_COUNTS = {"fit": 6_144, "tune": 1_024, "sealed": 1_024}
ROLE_ORDER = ("fit", "tune", "sealed")
FIXED_INITIALIZER = {
    "path": (
        "/Users/yudaiyaguchi/.codex/shogi-runs/"
        "halfkp81-epoch2-interpolation-v1/alpha-050.pt"
    ),
    "bytes": 191_656_679,
    "sha256": "ea36d0b9f0ecdf9543daf8f77fed42577ccc38deb6a964e8df78dc8549b6a8c4",
}
FIXED_DIRECT_REPLAY = {
    "path": (
        "/Users/yudaiyaguchi/.codex/shogi-runs/"
        "direct-teacher-halfkp81-v2-pilot-dataset/training.jsonl"
    ),
    "bytes": 131_814_955,
    "sha256": "2202971ba08cc1bf9be82050be53c6fada79f51f7e7c2a9763d0b57d64d71265",
    "rows": 200_944,
    "schema": "shogi-direct-teacher-halfkp81-v2-position-v1",
}
CHAIN_SCHEMAS = {
    "raw_teacher_receipt": "shogi-halfkp81-hard-depth18-teacher-receipt-v1r11",
    "preformal_authority_ledger": (
        "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11"
    ),
    "preformal_authority_raw_receipt": (
        "shogi-halfkp81-depth18-yaneura-only-preformal-authority-receipt-v1r11"
    ),
    "preformal_authority_verified_receipt": (
        "shogi-halfkp81-depth18-yaneura-only-preformal-authority-verified-receipt-v1r11"
    ),
    "launchagent_authority_evidence": (
        "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11"
    ),
    "power_continuity_ledger": (
        "shogi-halfkp81-depth18-power-continuity-ledger-v1r11"
    ),
    "power_continuity_receipt": (
        "shogi-halfkp81-depth18-power-continuity-receipt-v1r11"
    ),
}
BLOCKERS = (
    "tracked-v1r11-plan-fixes-seed-count-one-but-not-the-seed-value",
    "tracked-v1r11-plan-does-not-fix-batch-learning-rate-optimizer-or-device",
    "ml-train-py-uses-sigmoid-output-mse-not-preregistered-sigmoid-bce",
    "direct-teacher-v2-trainer-has-bce-but-no-preregistered-listnet-mixed-parent-objective",
)


class V1R11TrainingHandoffError(ValueError):
    """A v1r11 artifact cannot safely reach the training boundary."""


def _canonical_bytes(value: Mapping[str, Any]) -> bytes:
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


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise V1R11TrainingHandoffError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _read_held(path: str, label: str) -> tuple[bytes, dict[str, Any]]:
    candidate = Path(path)
    try:
        path_stat = candidate.lstat()
    except OSError as error:
        raise V1R11TrainingHandoffError(f"{label} cannot be statted") from error
    if stat.S_ISLNK(path_stat.st_mode) or not stat.S_ISREG(path_stat.st_mode):
        raise V1R11TrainingHandoffError(
            f"{label} must be a regular non-symlink file"
        )
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(candidate, flags)
    except OSError as error:
        raise V1R11TrainingHandoffError(f"{label} cannot be opened") from error
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or (before.st_dev, before.st_ino) != (
            path_stat.st_dev,
            path_stat.st_ino,
        ):
            raise V1R11TrainingHandoffError(f"{label} changed during open")
        digest = hashlib.sha256()
        chunks: list[bytes] = []
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            chunks.append(chunk)
        after = os.fstat(descriptor)
        final = candidate.lstat()
        signature = lambda value: (
            value.st_dev,
            value.st_ino,
            value.st_size,
            value.st_mtime_ns,
            value.st_ctime_ns,
        )
        if (
            signature(before) != signature(after)
            or (final.st_dev, final.st_ino) != (before.st_dev, before.st_ino)
        ):
            raise V1R11TrainingHandoffError(f"{label} changed during read")
        raw = b"".join(chunks)
        if not raw or len(raw) != before.st_size:
            raise V1R11TrainingHandoffError(f"{label} is empty or changed")
        return raw, {
            "path": str(candidate.resolve()),
            "bytes": len(raw),
            "sha256": digest.hexdigest(),
        }
    finally:
        os.close(descriptor)


def _strict_json(raw: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            raw,
            object_pairs_hook=_reject_duplicate_keys,
            parse_constant=lambda constant: (_ for _ in ()).throw(
                V1R11TrainingHandoffError(
                    f"{label} contains non-finite number {constant}"
                )
            ),
        )
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as error:
        raise V1R11TrainingHandoffError(f"{label} is invalid JSON") from error
    if type(value) is not dict or _canonical_bytes(value) != raw:
        raise V1R11TrainingHandoffError(f"{label} is not canonical JSON")
    return value


def _load_json(path: str, label: str) -> tuple[dict[str, Any], dict[str, Any]]:
    raw, identity = _read_held(path, label)
    return _strict_json(raw, label), identity


def _declared_identity(
    value: Any, label: str, *, schema: str | None = None
) -> dict[str, Any]:
    fields = {"path", "bytes", "sha256"} | ({"schema"} if schema else set())
    if type(value) is not dict or set(value) != fields:
        raise V1R11TrainingHandoffError(f"{label} identity fields differ")
    if (
        type(value["path"]) is not str
        or not os.path.isabs(value["path"])
        or type(value["bytes"]) is not int
        or value["bytes"] < 1
        or type(value["sha256"]) is not str
        or len(value["sha256"]) != 64
        or any(character not in "0123456789abcdef" for character in value["sha256"])
        or (schema is not None and value["schema"] != schema)
    ):
        raise V1R11TrainingHandoffError(f"{label} identity is invalid")
    return copy.deepcopy(value)


def _reauthenticate_identity(
    value: Any, label: str, *, schema: str | None = None
) -> tuple[dict[str, Any], bytes]:
    declared = _declared_identity(value, label, schema=schema)
    raw, actual = _read_held(declared["path"], label)
    expected = {key: declared[key] for key in ("path", "bytes", "sha256")}
    if actual != expected:
        raise V1R11TrainingHandoffError(f"{label} bytes/SHA/path changed")
    return declared, raw


def _jsonl_parent_accounting(
    raw: bytes, label: str, expected_parents: int
) -> dict[str, Any]:
    if not raw.endswith(b"\n") or b"\r" in raw or b"\n\n" in raw:
        raise V1R11TrainingHandoffError(f"{label} is not strict LF JSONL")
    parents: dict[str, int] = {}
    for line_number, line in enumerate(raw.splitlines(), start=1):
        try:
            row = json.loads(
                line,
                object_pairs_hook=_reject_duplicate_keys,
                parse_constant=lambda constant: (_ for _ in ()).throw(
                    V1R11TrainingHandoffError(
                        f"{label} line {line_number} contains {constant}"
                    )
                ),
            )
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise V1R11TrainingHandoffError(
                f"{label} line {line_number} is invalid JSON"
            ) from error
        if type(row) is not dict or _canonical_bytes(row)[:-1] != line:
            raise V1R11TrainingHandoffError(
                f"{label} line {line_number} is not canonical JSON"
            )
        parent_id = row.get("parent_id")
        if type(parent_id) is not str or not parent_id:
            raise V1R11TrainingHandoffError(
                f"{label} line {line_number} has no parent_id"
            )
        parents[parent_id] = parents.get(parent_id, 0) + 1
    if len(parents) != expected_parents:
        raise V1R11TrainingHandoffError(
            f"{label} parent count differs: {len(parents)} != {expected_parents}"
        )
    if any(count < 2 or count > 13 for count in parents.values()):
        raise V1R11TrainingHandoffError(f"{label} violates 2..13 rows per parent")
    return {
        "parents": len(parents),
        "rows": sum(parents.values()),
        "parent_ids": frozenset(parents),
    }


def _verify_repo_revision(repo_root: str, revision: str) -> None:
    try:
        head = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        dirty = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=all"],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError) as error:
        raise V1R11TrainingHandoffError("cannot authenticate repository") from error
    if head != revision or dirty:
        raise V1R11TrainingHandoffError(
            "training handoff requires the exact clean teacher source revision"
        )


def _publish_create_only(directory: str, document: Mapping[str, Any]) -> str:
    target_directory = os.path.realpath(directory)
    if os.path.exists(target_directory):
        raise V1R11TrainingHandoffError("training output directory already exists")
    parent = os.path.dirname(target_directory)
    if not os.path.isdir(parent):
        raise V1R11TrainingHandoffError("training output parent does not exist")
    os.mkdir(target_directory, 0o700)
    target = os.path.join(target_directory, "training-handoff.json")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(target, flags, 0o600)
    try:
        raw = _canonical_bytes(document)
        written = os.write(descriptor, raw)
        if written != len(raw):
            raise V1R11TrainingHandoffError("short training handoff write")
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    directory_descriptor = os.open(target_directory, os.O_RDONLY)
    try:
        os.fsync(directory_descriptor)
    finally:
        os.close(directory_descriptor)
    return target


def prepare_training_handoff(
    *,
    verified_receipt_path: str,
    tracked_plan_path: str,
    output_directory: str,
    repo_root: str,
    role_counts: Mapping[str, int] = ROLE_COUNTS,
    fixed_initializer: Mapping[str, Any] = FIXED_INITIALIZER,
    fixed_direct_replay: Mapping[str, Any] = FIXED_DIRECT_REPLAY,
    require_clean_revision: bool = True,
) -> tuple[dict[str, Any], str]:
    tracked, tracked_identity = _load_json(tracked_plan_path, "tracked v1r11 plan")
    if (
        tracked.get("schema") != TRACKED_PLAN_SCHEMA
        or tracked.get("family") != "halfkp81-hard-depth18-yaneura-only-v1r11"
        or tracked.get("training") != PROTOCOL.EXPECTED_TRAINING
        or tracked.get("selection_roles") != dict(role_counts)
    ):
        raise V1R11TrainingHandoffError("tracked v1r11 training contract differs")

    receipt, receipt_identity = _load_json(
        verified_receipt_path, "verified v1r11 teacher receipt"
    )
    if receipt.get("schema") != PROTOCOL.V1R11_VERIFIED_TEACHER_RECEIPT_SCHEMA:
        raise V1R11TrainingHandoffError(
            "raw or non-v1r11 receipt has no training handoff authority"
        )
    source_revision = receipt.get("source_revision")
    run_fingerprint = receipt.get("run_fingerprint")
    if type(source_revision) is not str or type(run_fingerprint) is not str:
        raise V1R11TrainingHandoffError("receipt source/fingerprint is absent")
    if require_clean_revision:
        _verify_repo_revision(repo_root, source_revision)

    plan_identity, plan_raw = _reauthenticate_identity(
        receipt.get("teacher_plan"), "runtime teacher plan", schema=TEACHER_PLAN_SCHEMA
    )
    teacher_plan = _strict_json(plan_raw, "runtime teacher plan")
    if (
        teacher_plan.get("schema") != TEACHER_PLAN_SCHEMA
        or teacher_plan.get("source_revision") != source_revision
        or teacher_plan.get("selection_roles") != dict(role_counts)
    ):
        raise V1R11TrainingHandoffError("runtime teacher plan binding differs")

    work_identity, work_raw = _reauthenticate_identity(
        receipt.get("teacher_work"), "teacher work", schema=TEACHER_WORK_SCHEMA
    )
    first_work_line = work_raw.splitlines()[0] if work_raw else b""
    work_header = json.loads(first_work_line, object_pairs_hook=_reject_duplicate_keys)
    if (
        work_header.get("schema") != TEACHER_WORK_SCHEMA
        or work_header.get("source_revision") != source_revision
        or work_header.get("run_fingerprint") != run_fingerprint
        or work_header.get("teacher_plan") != plan_identity
    ):
        raise V1R11TrainingHandoffError("teacher work header binding differs")

    outputs: dict[str, dict[str, Any]] = {}
    accounting: dict[str, dict[str, Any]] = {}
    parent_sets: dict[str, frozenset[str]] = {}
    teacher_output = receipt.get("teacher_output")
    if type(teacher_output) is not dict or set(teacher_output) != set(ROLE_ORDER):
        raise V1R11TrainingHandoffError("teacher output roles differ")
    for role in ROLE_ORDER:
        identity, raw = _reauthenticate_identity(
            teacher_output[role],
            f"{role} teacher output",
            schema=PROTOCOL.V1R11_DATASET_SCHEMA,
        )
        observed = _jsonl_parent_accounting(raw, role, role_counts[role])
        parent_sets[role] = observed.pop("parent_ids")
        accounting[role] = observed
        outputs[role] = identity
    for left_index, left in enumerate(ROLE_ORDER):
        for right in ROLE_ORDER[left_index + 1 :]:
            if parent_sets[left] & parent_sets[right]:
                raise V1R11TrainingHandoffError(
                    f"teacher parent IDs overlap across {left}/{right}"
                )

    chain: dict[str, dict[str, Any]] = {}
    chain_documents: dict[str, dict[str, Any]] = {}
    for field, schema in CHAIN_SCHEMAS.items():
        identity, raw = _reauthenticate_identity(
            receipt.get(field), field.replace("_", " "), schema=schema
        )
        chain[field] = identity
        if field not in {
            "preformal_authority_ledger",
            "power_continuity_ledger",
        }:
            document = _strict_json(raw, field.replace("_", " "))
            if document.get("schema") != schema:
                raise V1R11TrainingHandoffError(f"{field} schema differs")
            if "source_revision" in document and document["source_revision"] != source_revision:
                raise V1R11TrainingHandoffError(f"{field} source revision differs")
            if "run_fingerprint" in document and document["run_fingerprint"] != run_fingerprint:
                raise V1R11TrainingHandoffError(f"{field} run fingerprint differs")
            chain_documents[field] = document

    raw_receipt = chain_documents["raw_teacher_receipt"]
    if (
        raw_receipt.get("status") != "complete-unverified-no-training-authority"
        or raw_receipt.get("teacher_plan") != plan_identity
        or raw_receipt.get("teacher_work") != work_identity
        or raw_receipt.get("teacher_output") != outputs
        or raw_receipt.get("authority")
        != {
            "may_train": False,
            "may_play_formal_games": False,
            "may_write_live_weights": False,
        }
        or any(raw_receipt.get(field) != chain[field] for field in CHAIN_SCHEMAS if field != "raw_teacher_receipt")
    ):
        raise V1R11TrainingHandoffError("raw receipt cross-binding differs")

    verifier = receipt.get("verifier")
    validated_receipt = PROTOCOL.validate_v1r11_verified_training_receipt(
        receipt,
        expected_plan_identity=plan_identity,
        expected_source_revision=source_revision,
        expected_run_fingerprint=run_fingerprint,
        expected_teacher_work=work_identity,
        expected_teacher_outputs=outputs,
        expected_authority_chain=chain,
        expected_verifier=verifier,
    )
    if validated_receipt != receipt:
        raise V1R11TrainingHandoffError("verified receipt reconstruction differs")

    for dependency in verifier["dependency_closure"]:
        if type(dependency) is not dict or set(dependency) != {"path", "bytes", "sha256"}:
            raise V1R11TrainingHandoffError("verifier dependency identity differs")
        dependency_path = os.path.realpath(os.path.join(repo_root, dependency["path"]))
        if not dependency_path.startswith(os.path.realpath(repo_root) + os.sep):
            raise V1R11TrainingHandoffError("verifier dependency escapes repository")
        raw, actual = _read_held(dependency_path, "verifier dependency")
        del raw
        if {
            "path": dependency["path"],
            "bytes": actual["bytes"],
            "sha256": actual["sha256"],
        } != dependency:
            raise V1R11TrainingHandoffError("verifier dependency bytes changed")

    initializer = dict(fixed_initializer)
    initializer_raw, initializer_actual = _read_held(
        initializer["path"], "original alpha-050 initializer"
    )
    del initializer_raw
    if initializer_actual != initializer:
        raise V1R11TrainingHandoffError("original initializer identity differs")
    replay = dict(fixed_direct_replay)
    replay_raw, replay_actual = _read_held(replay["path"], "direct replay fit")
    if replay_actual != {key: replay[key] for key in ("path", "bytes", "sha256")}:
        raise V1R11TrainingHandoffError("direct replay identity differs")
    if replay_raw.count(b"\n") != replay["rows"] or not replay_raw.endswith(b"\n"):
        raise V1R11TrainingHandoffError("direct replay row count differs")

    output_root = os.path.realpath(output_directory)
    input_paths = {
        os.path.realpath(identity["path"])
        for identity in [plan_identity, work_identity, *outputs.values(), *chain.values()]
    } | {
        os.path.realpath(initializer["path"]),
        os.path.realpath(replay["path"]),
        os.path.realpath(tracked_identity["path"]),
        os.path.realpath(receipt_identity["path"]),
    }
    if output_root in input_paths or any(
        input_path.startswith(output_root + os.sep) for input_path in input_paths
    ):
        raise V1R11TrainingHandoffError("training output would contain an input")

    handoff = {
        "schema": HANDOFF_SCHEMA,
        "status": HANDOFF_STATUS,
        "tracked_preregistration": {
            **tracked_identity,
            "schema": TRACKED_PLAN_SCHEMA,
        },
        "verified_teacher_receipt": {
            **receipt_identity,
            "schema": PROTOCOL.V1R11_VERIFIED_TEACHER_RECEIPT_SCHEMA,
        },
        "source_revision": source_revision,
        "run_fingerprint": run_fingerprint,
        "teacher_plan": plan_identity,
        "teacher_work": work_identity,
        "teacher_output": outputs,
        "authority_chain": chain,
        "teacher_accounting": accounting,
        "training_inputs": {
            "initializer": initializer,
            "direct_replay_fit": replay,
        },
        "frozen_training": copy.deepcopy(PROTOCOL.EXPECTED_TRAINING),
        "entrypoint_compatibility": {
            "compatible_existing_entrypoints": [],
            "blocked_reasons": list(BLOCKERS),
            "optimizer_started": False,
            "epochs_completed": 0,
            "training_runs_created": 0,
        },
        "output": {
            "directory": output_root,
            "handoff_json": os.path.join(output_root, "training-handoff.json"),
        },
        "authority": {
            "may_start_optimizer": False,
            "may_train_fixed_v1r11_candidate": False,
            "may_play_formal_games": False,
            "may_write_live_weights": False,
        },
    }
    target = _publish_create_only(output_root, handoff)
    return handoff, target


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verified-receipt", required=True)
    parser.add_argument("--tracked-plan", required=True)
    parser.add_argument("--output-directory", required=True)
    parser.add_argument("--repo-root", default=".")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        handoff, target = prepare_training_handoff(
            verified_receipt_path=args.verified_receipt,
            tracked_plan_path=args.tracked_plan,
            output_directory=args.output_directory,
            repo_root=args.repo_root,
        )
    except (OSError, ValueError) as error:
        print(f"[halfkp81-v1r11-training-handoff] STOP: {error}", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "schema": handoff["schema"],
                "status": handoff["status"],
                "path": target,
                "optimizer_started": False,
                "live_weight_write_authorized": False,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
