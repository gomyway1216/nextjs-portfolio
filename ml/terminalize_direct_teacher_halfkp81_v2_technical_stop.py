#!/usr/bin/env python3
"""Authenticate and terminalize the spent HalfKP81 v2 MPS attempt.

This command is intentionally specific to the single execution-plan claim that
stopped at the initializer baseline forward.  It reads only the immutable claim,
execution plan, failure log, initializer export, and live weights.  It never
imports torch, creates an optimizer, opens a training dataset, or changes an old
run artifact.  Its only write is one canonical, create-only terminal receipt in
a separate directory.
"""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
from typing import Any, Mapping, Sequence

import direct_teacher_halfkp81_v2_protocol as protocol_v2


SCHEMA = "shogi-direct-teacher-halfkp81-v2-technical-stop-v1"
STATUS = "closed-technical-stop-before-optimizer-no-retry"
CLAIM_SCHEMA = "shogi-direct-teacher-halfkp81-v2-one-shot-claim-v1"
EXECUTION_PLAN_SCHEMA = protocol_v2.EXECUTION_PLAN_SCHEMA
PIPELINE_REVISION = "34729b041e99d70865bf5e714f46dde35590e3cb"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")

RUN_ROOT = Path(
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "direct-teacher-halfkp81-v2-pilot-one-shot-v1"
)
CLAIM_PATH = Path(
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    ".direct-teacher-halfkp81-v2-one-shot-claims/"
    "c6fd910efffd9a9d62925d7ba8b229c1fcb50264b3e82a5868b6a8f5c0e19751.json"
)
EXECUTION_PLAN_PATH = RUN_ROOT / "execution-plan.json"
FAILURE_LOG_PATH = RUN_ROOT / "trainer.log"
OUTPUT_DIRECTORY = RUN_ROOT / "trainer-output"
INITIALIZER_EXPORT_PATH = OUTPUT_DIRECTORY / "initializer-weights.bin"
LIVE_WEIGHTS_PATH = Path(
    "/private/tmp/shogi-direct-teacher-halfkp81-v2-run/" "public/shogi-nnue-weights.bin"
)
TERMINAL_RESULT_PATH = Path(
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "direct-teacher-halfkp81-v2-technical-stop-v1/result.json"
)

EXPECTED_CLAIM = {
    "path": str(CLAIM_PATH),
    "bytes": 688,
    "sha256": "a39863b10138de37ee3b016806705d001322b9c7c5039baf928717d5457574f7",
    "schema": CLAIM_SCHEMA,
}
EXPECTED_EXECUTION_PLAN = {
    "path": str(EXECUTION_PLAN_PATH),
    "bytes": 7_131,
    "sha256": "c6fd910efffd9a9d62925d7ba8b229c1fcb50264b3e82a5868b6a8f5c0e19751",
    "schema": EXECUTION_PLAN_SCHEMA,
}
EXPECTED_FAILURE_LOG = {
    "path": str(FAILURE_LOG_PATH),
    "bytes": 465,
    "sha256": "b8e81e9e84524c11fe5d90ac840cec901a31445c6f658e2e4e21d24b9ff7bd6c",
}
EXPECTED_INITIALIZER_EXPORT = {
    "path": str(INITIALIZER_EXPORT_PATH),
    "bytes": 94_656_708,
    "sha256": "2b91060fe98c13d57341bdf0c773094c6489b7e508d6d6afd4051565dfb9b47c",
}
EXPECTED_LIVE_WEIGHTS = {
    "path": str(LIVE_WEIGHTS_PATH),
    "bytes": 1_185_988,
    "sha256": "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
}
EXPECTED_OUTPUT_ENTRIES = ["initializer-weights.bin"]

EXPECTED_OBSERVED_STATE = {
    "failure_phase": "initializer-baseline-inference-before-optimizer",
    "failure_operator": "aten::_embedding_bag",
    "failure_device": "mps",
    "output_entries": EXPECTED_OUTPUT_ENTRIES,
    "optimizer_created": False,
    "optimizer_steps": 0,
    "training_batches": 0,
    "training_rows": 0,
    "training_metrics": 0,
    "candidate_weights_published": False,
    "final_checkpoint_published": False,
    "trainer_result_published": False,
    "static_sanity_published": False,
}
EXPECTED_DECISION = {
    "old_execution_plan_retry_authorized": False,
    "claim_deletion_authorized": False,
    "old_output_mutation_authorized": False,
    "paired56_authorized": False,
    "expanded_stage_authorized": False,
    "live_weight_write_authorized": False,
    "technical_successor_requires_new_protocol_and_execution_plan": True,
}
EXPECTED_AUTHORITY = {
    "technical_stop_terminal": True,
    "playing_strength_evidence": False,
    "candidate_created": False,
    "selection_metric_observed": False,
}


class TechnicalStopError(ValueError):
    """The historical attempt or terminal receipt violates its fixed boundary."""


def _exact(value: Any, fields: set[str], label: str) -> Mapping[str, Any]:
    if type(value) is not dict or set(value) != fields:
        raise TechnicalStopError(f"{label} fields are not exact")
    return value


def _identity_shape(
    value: Any,
    label: str,
    *,
    schema: str | None = None,
) -> dict[str, Any]:
    fields = {"path", "bytes", "sha256"} | ({"schema"} if schema is not None else set())
    item = _exact(value, fields, label)
    if (
        type(item["path"]) is not str
        or not os.path.isabs(item["path"])
        or "\0" in item["path"]
        or os.path.realpath(item["path"]) != item["path"]
        or type(item["bytes"]) is not int
        or item["bytes"] < 1
        or type(item["sha256"]) is not str
        or SHA256_RE.fullmatch(item["sha256"]) is None
        or (schema is not None and item["schema"] != schema)
    ):
        raise TechnicalStopError(f"{label} identity is invalid")
    return dict(item)


def _authenticate_identity(
    path: str | Path,
    expected: Mapping[str, Any],
    label: str,
) -> dict[str, Any]:
    try:
        observed, _lines = protocol_v2.stable_file_identity(str(path), label)
    except protocol_v2.DirectTeacherHalfkpV2Error as error:
        raise TechnicalStopError(str(error)) from error
    expected_base = {key: expected[key] for key in ("path", "bytes", "sha256")}
    if observed != expected_base:
        raise TechnicalStopError(f"{label} identity differs from the fixed attempt")
    return observed


def _load_fixed_json(
    path: str | Path,
    expected: Mapping[str, Any],
    label: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    try:
        value, observed = protocol_v2.load_strict_json_file(str(path), label)
    except protocol_v2.DirectTeacherHalfkpV2Error as error:
        raise TechnicalStopError(str(error)) from error
    if observed != {key: expected[key] for key in ("path", "bytes", "sha256")}:
        raise TechnicalStopError(f"{label} identity differs from the fixed attempt")
    return value, observed


def _read_fixed_bytes(
    path: str | Path,
    expected: Mapping[str, Any],
    label: str,
) -> bytes:
    observed = _authenticate_identity(path, expected, label)
    with open(observed["path"], "rb") as source:
        raw = source.read()
    if (
        len(raw) != observed["bytes"]
        or hashlib.sha256(raw).hexdigest() != observed["sha256"]
    ):
        raise TechnicalStopError(f"{label} changed after authentication")
    return raw


def _validate_claim(
    claim: Mapping[str, Any],
    plan_identity: Mapping[str, Any],
) -> None:
    item = _exact(
        claim,
        {
            "schema",
            "status",
            "owner",
            "execution_plan",
            "output_path",
            "live_weight_write_authorized",
        },
        "one-shot claim",
    )
    owner = _exact(
        item["owner"],
        {"kind", "pid", "pipeline_revision"},
        "one-shot claim owner",
    )
    claimed_plan = _identity_shape(
        item["execution_plan"],
        "claimed execution plan",
        schema=EXECUTION_PLAN_SCHEMA,
    )
    if (
        item["schema"] != CLAIM_SCHEMA
        or item["status"] != "exclusive-one-shot-claimed-no-retry"
        or owner["kind"] != "direct-teacher-halfkp81-v2-one-shot-trainer"
        or type(owner["pid"]) is not int
        or owner["pid"] <= 0
        or owner["pipeline_revision"] != PIPELINE_REVISION
        or claimed_plan != plan_identity
        or item["output_path"] != str(OUTPUT_DIRECTORY)
        or item["live_weight_write_authorized"] is not False
    ):
        raise TechnicalStopError("one-shot claim binding differs")


def _validate_execution_plan(plan: Mapping[str, Any]) -> None:
    inputs = plan.get("inputs")
    live = inputs.get("live_weights") if type(inputs) is dict else None
    if (
        plan.get("schema") != EXECUTION_PLAN_SCHEMA
        or plan.get("status") != "pilot-data-bound-training-not-started"
        or type(plan.get("training")) is not dict
        or plan["training"].get("device") != "mps"
        or plan["training"].get("candidate_count") != 1
        or plan["training"].get("epochs") != 1
        or plan["training"].get("seed") != 42
        or type(live) is not dict
        or {key: live.get(key) for key in ("path", "bytes", "sha256")}
        != EXPECTED_LIVE_WEIGHTS
        or live.get("role") != "immutable-live-baseline-never-writable"
    ):
        raise TechnicalStopError("execution plan boundary differs")


def _validate_failure_log(raw: bytes) -> None:
    try:
        message = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise TechnicalStopError("failure log is not UTF-8") from error
    if (
        message.count("\n") != 1
        or not message.endswith("\n")
        or not message.startswith("[direct-teacher-halfkp81-v2] STOP: ")
        or "aten::_embedding_bag" not in message
        or "not currently implemented for the MPS device" not in message
        or "PYTORCH_ENABLE_MPS_FALLBACK=1" not in message
    ):
        raise TechnicalStopError("failure log does not describe the fixed MPS stop")


def _output_entries() -> list[str]:
    try:
        entries = sorted(entry.name for entry in os.scandir(OUTPUT_DIRECTORY))
    except OSError as error:
        raise TechnicalStopError(
            "old trainer output directory cannot be inspected"
        ) from error
    if entries != EXPECTED_OUTPUT_ENTRIES:
        raise TechnicalStopError("old trainer output entries differ")
    return entries


def _authenticate_attempt() -> dict[str, Any]:
    if any(
        os.path.realpath(str(path)) != str(path)
        for path in (
            CLAIM_PATH,
            EXECUTION_PLAN_PATH,
            FAILURE_LOG_PATH,
            OUTPUT_DIRECTORY,
            INITIALIZER_EXPORT_PATH,
            LIVE_WEIGHTS_PATH,
        )
    ):
        raise TechnicalStopError("fixed attempt path changed or traverses a symlink")
    plan, plan_identity = _load_fixed_json(
        EXECUTION_PLAN_PATH,
        EXPECTED_EXECUTION_PLAN,
        "spent execution plan",
    )
    plan_receipt = {
        **plan_identity,
        "schema": EXECUTION_PLAN_SCHEMA,
    }
    _validate_execution_plan(plan)
    claim, claim_identity = _load_fixed_json(
        CLAIM_PATH,
        EXPECTED_CLAIM,
        "spent one-shot claim",
    )
    _validate_claim(claim, plan_receipt)
    log_raw = _read_fixed_bytes(
        FAILURE_LOG_PATH,
        EXPECTED_FAILURE_LOG,
        "technical-stop log",
    )
    _validate_failure_log(log_raw)
    initializer_identity = _authenticate_identity(
        INITIALIZER_EXPORT_PATH,
        EXPECTED_INITIALIZER_EXPORT,
        "frozen initializer export",
    )
    live_identity = _authenticate_identity(
        LIVE_WEIGHTS_PATH,
        EXPECTED_LIVE_WEIGHTS,
        "immutable live weights",
    )
    entries = _output_entries()
    return {
        "schema": SCHEMA,
        "status": STATUS,
        "evidence": {
            "claim": {**claim_identity, "schema": CLAIM_SCHEMA},
            "execution_plan": plan_receipt,
            "failure_log": {
                **EXPECTED_FAILURE_LOG,
            },
            "initializer_export": initializer_identity,
            "live_weights": live_identity,
            "pipeline_revision": PIPELINE_REVISION,
            "output_directory": str(OUTPUT_DIRECTORY),
        },
        "observed_state": {
            **EXPECTED_OBSERVED_STATE,
            "output_entries": entries,
        },
        "decision": dict(EXPECTED_DECISION),
        "authority": dict(EXPECTED_AUTHORITY),
    }


def validate_terminal_receipt(value: Any) -> dict[str, Any]:
    receipt = _exact(
        value,
        {"schema", "status", "evidence", "observed_state", "decision", "authority"},
        "technical-stop receipt",
    )
    evidence = _exact(
        receipt["evidence"],
        {
            "claim",
            "execution_plan",
            "failure_log",
            "initializer_export",
            "live_weights",
            "pipeline_revision",
            "output_directory",
        },
        "technical-stop evidence",
    )
    if (
        receipt["schema"] != SCHEMA
        or receipt["status"] != STATUS
        or _identity_shape(
            evidence["claim"],
            "terminal claim",
            schema=CLAIM_SCHEMA,
        )
        != EXPECTED_CLAIM
        or _identity_shape(
            evidence["execution_plan"],
            "terminal execution plan",
            schema=EXECUTION_PLAN_SCHEMA,
        )
        != EXPECTED_EXECUTION_PLAN
        or _identity_shape(evidence["failure_log"], "terminal failure log")
        != EXPECTED_FAILURE_LOG
        or _identity_shape(
            evidence["initializer_export"],
            "terminal initializer export",
        )
        != EXPECTED_INITIALIZER_EXPORT
        or _identity_shape(evidence["live_weights"], "terminal live weights")
        != EXPECTED_LIVE_WEIGHTS
        or evidence["pipeline_revision"] != PIPELINE_REVISION
        or evidence["output_directory"] != str(OUTPUT_DIRECTORY)
        or receipt["observed_state"] != EXPECTED_OBSERVED_STATE
        or receipt["decision"] != EXPECTED_DECISION
        or receipt["authority"] != EXPECTED_AUTHORITY
    ):
        raise TechnicalStopError("technical-stop receipt differs from fixed evidence")
    return dict(receipt)


def _path_within(path: Path, root: Path) -> bool:
    absolute = os.path.realpath(path)
    boundary = os.path.realpath(root)
    return absolute == boundary or absolute.startswith(boundary + os.sep)


def _prepare_terminal_parent(path: Path) -> None:
    parent = path.parent
    if _path_within(path, RUN_ROOT) or _path_within(path, CLAIM_PATH.parent):
        raise TechnicalStopError("terminal receipt would mutate the spent attempt")
    created = False
    try:
        os.mkdir(parent, 0o700)
        created = True
    except FileExistsError:
        pass
    try:
        metadata = os.lstat(parent)
    except OSError as error:
        raise TechnicalStopError(
            "terminal receipt directory cannot be inspected"
        ) from error
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or stat.S_ISLNK(metadata.st_mode)
        or metadata.st_uid != os.getuid()
        or metadata.st_mode & 0o777 != 0o700
    ):
        raise TechnicalStopError(
            "terminal receipt directory must be an owned non-symlink 0700 directory"
        )
    if created:
        descriptor = os.open(parent.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def _publish_create_only(path: Path, raw: bytes) -> dict[str, Any]:
    if path != TERMINAL_RESULT_PATH:
        raise TechnicalStopError("terminal receipt path differs from the fixed path")
    _prepare_terminal_parent(path)
    if os.path.lexists(path):
        raise TechnicalStopError("technical-stop receipt already exists")
    temporary_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w+b",
            prefix=f".{path.name}.",
            suffix=".tmp",
            dir=path.parent,
            delete=False,
        ) as temporary:
            temporary_path = temporary.name
            temporary.write(raw)
            temporary.flush()
            os.fsync(temporary.fileno())
        try:
            os.link(temporary_path, path)
        except FileExistsError as error:
            raise TechnicalStopError("technical-stop receipt already exists") from error
        os.unlink(temporary_path)
        temporary_path = None
        descriptor = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        identity = _authenticate_identity(
            path,
            {
                "path": str(path),
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
            },
            "published technical-stop receipt",
        )
        return identity
    finally:
        if temporary_path is not None:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass


def terminalize(*, out_path: str | Path = TERMINAL_RESULT_PATH) -> dict[str, Any]:
    out = Path(os.path.realpath(out_path))
    if out != TERMINAL_RESULT_PATH:
        raise TechnicalStopError("terminal receipt path differs from the fixed path")
    if os.path.lexists(out):
        raise TechnicalStopError("technical-stop receipt already exists")
    first = validate_terminal_receipt(_authenticate_attempt())
    second = validate_terminal_receipt(_authenticate_attempt())
    if second != first:
        raise TechnicalStopError("spent attempt changed during terminalization")
    raw = protocol_v2.canonical_json_bytes(second)
    identity = _publish_create_only(out, raw)
    observed, observed_identity = protocol_v2.load_strict_json_file(
        str(out), "published technical-stop receipt"
    )
    if validate_terminal_receipt(observed) != second or observed_identity != identity:
        raise TechnicalStopError("published technical-stop receipt changed")
    return {
        "receipt": {
            **identity,
            "schema": SCHEMA,
        },
        "status": STATUS,
        "old_execution_plan_retry_authorized": False,
        "live_weight_write_authorized": False,
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(TERMINAL_RESULT_PATH))
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = terminalize(out_path=args.out)
    except (
        TechnicalStopError,
        protocol_v2.DirectTeacherHalfkpV2Error,
        OSError,
        ValueError,
    ) as error:
        print(
            f"[direct-teacher-halfkp81-v2-terminalizer] STOP: {error}", file=sys.stderr
        )
        return 1
    print(
        protocol_v2.canonical_json_bytes(result).decode("utf-8"),
        end="",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
