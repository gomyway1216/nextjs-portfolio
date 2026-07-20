"""Argumentless strict checkpoint preflight for fresh-selection teacher labels.

This adapter emits only portable tracked identities and aggregate checkpoint
evidence. It never opens the fresh-selection source, starts a teacher engine,
selects a candidate, or writes live weights.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
from collections.abc import Mapping
from typing import Any

import strength_first_qat_selection_preflight as PREFLIGHT
import strength_first_qat_training_bridge as BRIDGE


SUMMARY_SCHEMA = "shogi-floodgate-strength-first-selection-teacher-preflight-v1"
SUMMARY_STATUS = "three-candidate-checkpoints-strict-loaded"
REGISTRY_SCHEMA = PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_SCHEMA


def _canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def _portable_artifact(
    value: Mapping[str, Any],
    *,
    path: str,
    schema: str,
) -> dict[str, Any]:
    return {
        "path": path,
        "bytes": value["bytes"],
        "sha256": value["sha256"],
        "schema": schema,
    }


def build_strength_first_selection_teacher_preflight_summary(
    value: Mapping[str, Any],
    *,
    registry_raw: bytes,
) -> dict[str, Any]:
    """Build the exact portable projection consumed by the local TS runner."""

    if (
        value.get("schema")
        != PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_PREFLIGHT_SCHEMA
        or value.get("all_three_complete_before_selection_read") is not True
        or value.get("selection_labels_read") is not False
        or value.get("production_promotion_authorized") is not False
    ):
        raise ValueError("strength-first selection checkpoint preflight is incomplete")
    runs = value.get("runs")
    if not isinstance(runs, list) or len(runs) != 3:
        raise ValueError("strength-first selection requires exactly three checkpoints")

    plan = value["training_plan"]
    portable_plan = _portable_artifact(
        plan,
        path=BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH,
        schema=BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
    )
    portable_runs = []
    for run, seed in zip(runs, (42, 43, 44), strict=True):
        output = f"{BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{seed}"
        if (
            run.get("slot_id")
            != f"floodgate-strength-first-int16-aware-seed-{seed}"
            or run.get("seed") != seed
            or run.get("output") != output
            or run.get("checkpoint_metadata")
            != {
                "schema": BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
                "epoch": 20,
            }
        ):
            raise ValueError("strength-first selection checkpoint order drifted")
        portable_runs.append(
            {
                "slot_id": run["slot_id"],
                "seed": seed,
                "output": output,
                "result": _portable_artifact(
                    run["result"],
                    path=f"{output}/result.json",
                    schema=BRIDGE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA,
                ),
                "checkpoint": _portable_artifact(
                    run["checkpoint"],
                    path=f"{output}/final.pt",
                    schema=BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
                ),
                "checkpoint_metadata": dict(run["checkpoint_metadata"]),
            }
        )
    if (
        len({run["result"]["sha256"] for run in portable_runs}) != 3
        or len({run["checkpoint"]["sha256"] for run in portable_runs}) != 3
    ):
        raise ValueError("strength-first selection checkpoint identities are not distinct")

    projection = {
        "schema": PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_PREFLIGHT_SCHEMA,
        "training_plan": portable_plan,
        "training_pipeline": dict(value["training_pipeline"]),
        "runs": portable_runs,
    }
    registry_path = PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_RELATIVE_PATH
    return {
        "schema": SUMMARY_SCHEMA,
        "status": SUMMARY_STATUS,
        "training_plan": portable_plan,
        "selection_preflight_registry": {
            "path": registry_path,
            "bytes": len(registry_raw),
            "sha256": hashlib.sha256(registry_raw).hexdigest(),
            "schema": REGISTRY_SCHEMA,
        },
        "checkpoint_preflight_sha256": hashlib.sha256(
            _canonical_json(projection)
        ).hexdigest(),
        "strict_loaded_seeds": [42, 43, 44],
        "strict_loaded_checkpoints": 3,
        "selection_source_opened": False,
        "network_requests": 0,
        "live_weight_writes": 0,
    }


def _git_head(repo_root: str) -> str:
    environment = {
        "HOME": "/var/empty",
        "LANG": "C",
        "LC_ALL": "C",
        "PATH": "/usr/bin:/bin",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_CONFIG_SYSTEM": "/dev/null",
        "GIT_OPTIONAL_LOCKS": "0",
        "GIT_TERMINAL_PROMPT": "0",
    }
    result = subprocess.run(
        ["/usr/bin/git", "-C", repo_root, "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        env=environment,
    )
    revision = result.stdout.decode("ascii").strip()
    if len(revision) != 40 or any(character not in "0123456789abcdef" for character in revision):
        raise ValueError("selection teacher preflight Git revision is invalid")
    return revision


def run_strength_first_selection_teacher_preflight() -> dict[str, Any]:
    root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
    receipt = PREFLIGHT.preflight_strength_first_qat_selection(
        audit_revision=_git_head(root),
    )
    value = PREFLIGHT.call_strength_first_selection_reader(
        receipt,
        lambda preflight: dict(preflight),
    )
    registry_path = os.path.join(
        root,
        PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_REGISTRY_RELATIVE_PATH,
    )
    with open(registry_path, "rb") as handle:
        registry_raw = handle.read()
    return build_strength_first_selection_teacher_preflight_summary(
        value,
        registry_raw=registry_raw,
    )


def main(arguments: list[str]) -> int:
    if arguments:
        raise ValueError("selection teacher checkpoint preflight accepts no arguments")
    summary = run_strength_first_selection_teacher_preflight()
    sys.stdout.buffer.write(_canonical_json(summary) + b"\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except Exception as error:
        sys.stderr.write(f"selection teacher checkpoint preflight failed: {error}\n")
        raise SystemExit(1) from error
