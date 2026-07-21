"""Build, but never install, the constrained-alignment v2 plan candidate."""

from __future__ import annotations

import copy
import hashlib
from pathlib import Path
import sys
from typing import Any

import strength_first_qat_constrained_alignment_v2_protocol as PROTOCOL
import strength_first_qat_training_bridge as BASE


class AlignmentPlanCandidateError(ValueError):
    """The exact base artifacts cannot produce one alignment plan."""


def _read(path: Path, label: str) -> bytes:
    try:
        return path.read_bytes()
    except OSError as error:
        raise AlignmentPlanCandidateError(f"{label} cannot be read") from error


def _identity(raw: bytes, *, path: str, schema: str) -> dict[str, Any]:
    return {
        "path": path,
        "schema": schema,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def build_alignment_plan_candidate(
    *, repo_root: str | Path | None = None
) -> dict[str, Any]:
    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    base_plan_path = root / BASE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH
    base_raw = _read(base_plan_path, "base strength-first plan")
    base_plan = PROTOCOL.strict_json(base_raw, "base strength-first plan")
    BASE.validate_strength_first_qat_training_plan_data(base_plan)

    registry_path = root / PROTOCOL.PARENT_PREFLIGHT_REGISTRY_RELATIVE_PATH
    registry_raw = _read(registry_path, "parent selection preflight registry")
    registry = PROTOCOL.strict_json(
        registry_raw,
        "parent selection preflight registry",
    )
    if (
        set(registry)
        != {
            "schema",
            "status",
            "training_plan",
            "training_pipeline_revision",
            "runs",
            "artifact_identities_registered",
            "selection_preflight_ready",
        }
        or registry["schema"]
        != "shogi-floodgate-strength-first-qat-selection-preflight-registry-v1"
        or registry["status"]
        != "exact-strength-first-plan-and-three-final-run-identities-ready"
        or registry["artifact_identities_registered"] is not True
        or registry["selection_preflight_ready"] is not True
    ):
        raise AlignmentPlanCandidateError(
            "parent selection preflight registry is not exactly ready"
        )
    expected_base_identity = _identity(
        base_raw,
        path=BASE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH,
        schema=BASE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
    )
    if registry["training_plan"] != expected_base_identity:
        raise AlignmentPlanCandidateError(
            "parent preflight registry does not bind the base plan"
        )
    expected_seed_order = list(PROTOCOL.ALIGNMENT_SEEDS)
    runs = registry["runs"]
    if (
        type(runs) is not list
        or [run.get("seed") for run in runs] != expected_seed_order
    ):
        raise AlignmentPlanCandidateError(
            "parent preflight registry does not contain the exact seed order"
        )
    parents = []
    for run, seed in zip(runs, PROTOCOL.ALIGNMENT_SEEDS):
        expected_output = f"{BASE.STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{seed}"
        if (
            set(run) != {"slot_id", "seed", "output", "result", "checkpoint"}
            or run["slot_id"] != f"floodgate-strength-first-int16-aware-seed-{seed}"
            or run["output"] != expected_output
            or set(run["result"]) != {"path", "schema", "bytes", "sha256"}
            or set(run["checkpoint"]) != {"path", "schema", "bytes", "sha256"}
        ):
            raise AlignmentPlanCandidateError(
                f"parent seed {seed} registry entry drifted"
            )
        parents.append(
            {
                "seed": seed,
                "slot_id": run["slot_id"],
                "result": copy.deepcopy(run["result"]),
                "checkpoint": {
                    **copy.deepcopy(run["checkpoint"]),
                    "epoch": 20,
                },
            }
        )

    implementation = {}
    for name, relative in PROTOCOL.ALIGNMENT_SOURCE_PATHS.items():
        raw = _read(root / relative, f"alignment source {name}")
        implementation[name] = _identity(
            raw,
            path=relative,
            schema="shogi-reviewed-python-source-v1",
        )

    candidate = {
        "schema": PROTOCOL.ALIGNMENT_PLAN_SCHEMA,
        "status": PROTOCOL.ALIGNMENT_PLAN_STATUS,
        "development": copy.deepcopy(PROTOCOL.ALIGNMENT_DEVELOPMENT),
        "base_training": {
            "plan": expected_base_identity,
            "parent_preflight_registry": _identity(
                registry_raw,
                path=PROTOCOL.PARENT_PREFLIGHT_REGISTRY_RELATIVE_PATH,
                schema=(
                    "shogi-floodgate-strength-first-qat-"
                    "selection-preflight-registry-v1"
                ),
            ),
        },
        "implementation": implementation,
        "data": {
            "model_training": copy.deepcopy(base_plan["artifacts"]["model_training"])
        },
        "runtime": copy.deepcopy(base_plan["runtime"]),
        "parents": parents,
        "training": copy.deepcopy(PROTOCOL.ALIGNMENT_TRAINING),
        "slots": PROTOCOL.expected_slots(),
        "boundary": copy.deepcopy(PROTOCOL.ALIGNMENT_BOUNDARY),
    }
    PROTOCOL.validate_alignment_plan(candidate)
    plan_path = root / PROTOCOL.ALIGNMENT_PLAN_RELATIVE_PATH
    if plan_path.exists():
        existing = _read(plan_path, "tracked alignment plan")
        if existing != PROTOCOL.canonical_json_bytes(candidate):
            raise AlignmentPlanCandidateError(
                "tracked alignment plan differs from the recomputed candidate"
            )
    return candidate


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        print("alignment plan builder accepts no arguments", file=sys.stderr)
        return 2
    try:
        candidate = build_alignment_plan_candidate()
        raw = PROTOCOL.canonical_json_bytes(candidate)
        written = sys.stdout.buffer.write(raw)
        sys.stdout.buffer.flush()
        if written != len(raw):
            raise AlignmentPlanCandidateError(
                "alignment plan candidate stdout write was incomplete"
            )
    except (OSError, ValueError) as error:
        print(f"[alignment-plan-candidate] STOP: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "AlignmentPlanCandidateError",
    "build_alignment_plan_candidate",
]
