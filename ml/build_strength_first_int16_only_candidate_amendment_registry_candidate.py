#!/usr/bin/env python3
"""Build the deterministic READY registry for the int16-only amendment."""

from __future__ import annotations

import copy
from pathlib import Path
import sys
from typing import Any

import strength_first_int16_only_candidate_amendment as PROTOCOL
import strength_first_qat_selection_evaluator as SELECTION
import strength_first_representation_bridge_v3_protocol as BRIDGE


def _document_identity(
    root: Path, *, relative: str, schema: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    path = root / relative
    raw = path.read_bytes()
    return (
        PROTOCOL.file_identity(path, relative=relative, schema=schema),
        PROTOCOL.strict_json(raw, relative),
    )


def build_registry_candidate(
    *, repo_root: str | Path | None = None, require_pinned_match: bool = False
) -> dict[str, Any]:
    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    bridge_identity, bridge_value = _document_identity(
        root,
        relative=PROTOCOL.BRIDGE_REGISTRY_RELATIVE_PATH,
        schema=BRIDGE.REGISTRY_SCHEMA,
    )
    bridge = BRIDGE.validate_registry(bridge_value)
    selection_identity, selection_value = _document_identity(
        root,
        relative=PROTOCOL.SELECTION_REGISTRY_RELATIVE_PATH,
        schema=SELECTION.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_SCHEMA,
    )
    selection = SELECTION.validate_strength_first_selection_evaluator_registry_data(
        selection_value
    )
    stop_identity, stop_value = _document_identity(
        root,
        relative=PROTOCOL.BRIDGE_STOP_EVIDENCE_RELATIVE_PATH,
        schema=(
            "shogi-floodgate-strength-first-representation-bridge-v3-stop-evidence-v1"
        ),
    )
    stop = PROTOCOL.validate_bridge_stop_evidence(stop_value)
    if (
        root / PROTOCOL.BRIDGE_STOP_EVIDENCE_RELATIVE_PATH
    ).read_bytes() != PROTOCOL.canonical_json_bytes(stop):
        raise ValueError("bridge STOP evidence is not canonical JSON")
    if (
        selection["status"] != SELECTION.STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS
        or stop["outcome"]["status"] != "STOP"
        or stop["outcome"]["family_gate_passed"] is not False
        or stop["outcome"]["output_root_absent"] is not True
    ):
        raise ValueError("int16-only amendment inputs are not in the fixed STOP state")

    implementation = {
        name: PROTOCOL.file_identity(
            root / relative,
            relative=relative,
            schema="shogi-reviewed-python-source-v1",
        )
        for name, relative in PROTOCOL._SOURCE_PATHS.items()
    }
    inherited_closure = copy.deepcopy(bridge["dependencies"]["runtime_import_closure"])
    for name, identity in inherited_closure.items():
        observed = PROTOCOL.file_identity(
            root / identity["path"],
            relative=identity["path"],
            schema="shogi-reviewed-python-source-v1",
        )
        if observed != identity:
            raise ValueError(f"inherited bridge runtime source {name} drifted")

    models = {
        "stable": copy.deepcopy(bridge["models"]["stable"]),
        "seeds": [
            {
                "seed": source["seed"],
                "parent_result": copy.deepcopy(source["parent_result"]),
                "parent_checkpoint": copy.deepcopy(source["parent_checkpoint"]),
                "quantized_anchor": copy.deepcopy(source["quantized_anchor"]),
            }
            for source in bridge["models"]["seeds"]
        ],
    }
    selected = next(
        run for run in models["seeds"] if run["seed"] == PROTOCOL.SELECTED_SEED
    )
    if (
        selected["parent_checkpoint"]["epoch"] != 20
        or selected["parent_checkpoint"]["sha256"]
        != PROTOCOL.SELECTED_CHECKPOINT_SHA256
    ):
        raise ValueError("seed 42 epoch-20 candidate identity drifted")

    candidate = {
        "schema": PROTOCOL.REGISTRY_SCHEMA,
        "status": PROTOCOL.REGISTRY_STATUS,
        "recorded_date": "2026-07-20",
        "builder_command": PROTOCOL.BUILDER_COMMAND,
        "runner_command": PROTOCOL.RUNNER_COMMAND,
        "inputs": {
            "representation_bridge_registry": bridge_identity,
            "selection_evaluator_registry": selection_identity,
            "bridge_stop_evidence": stop_identity,
        },
        "implementation": implementation,
        "dependencies": {
            "inherited_bridge_runtime_import_closure": (
                "authenticated-from-bound-representation-bridge-registry"
            )
        },
        "bridge_stop": {
            "status": "STOP",
            "reason": "representation-family-gate-failed",
            "family_gate_passed": False,
            "output_root_absent": True,
            "representative_seed": 42,
            "ranked_parent_int16_seed_order": [43, 42, 44],
            "threshold_relaxed": False,
            "treated_as_pass": False,
        },
        "spent_selection": {
            "dataset": copy.deepcopy(selection["enrollments"]["selection_dataset"]),
            "records": 28_518,
            "parents": 4_798,
            "label_status": "already-spent-selection",
            "authorized_use": (
                "one-exact-int16-only-reauthentication-no-fresh-or-live-authority"
            ),
        },
        "models": models,
        "policy": {
            "metric_order": list(PROTOCOL.METRIC_ORDER),
            "strength_gates": copy.deepcopy(PROTOCOL.STRENGTH_GATE_POLICY),
            "evaluation": copy.deepcopy(PROTOCOL.EVALUATION_POLICY),
            "decision": copy.deepcopy(PROTOCOL.DECISION_POLICY),
        },
        "output": {
            "root": PROTOCOL.OUTPUT_ROOT,
            "files": copy.deepcopy(PROTOCOL.OUTPUT_FILES),
            "atomic_private_bundle": True,
            "no_output_on_failure": True,
            "commit_semantics": copy.deepcopy(PROTOCOL.COMMIT_SEMANTICS),
        },
        "boundary": copy.deepcopy(PROTOCOL.BOUNDARY),
        "nonclaims": copy.deepcopy(PROTOCOL.NONCLAIMS),
    }
    validated = PROTOCOL.validate_registry(candidate)
    if require_pinned_match:
        pinned = PROTOCOL.load_registry(root)
        if PROTOCOL.canonical_json_bytes(validated) != PROTOCOL.canonical_json_bytes(
            pinned
        ):
            raise ValueError("generated registry differs from pinned READY registry")
    return validated


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        print(
            "int16-only amendment registry STOP: arguments forbidden", file=sys.stderr
        )
        return 2
    try:
        candidate = build_registry_candidate()
    except (OSError, RuntimeError, ValueError) as error:
        print(f"int16-only amendment registry STOP: {error}", file=sys.stderr)
        return 1
    sys.stdout.buffer.write(PROTOCOL.canonical_json_bytes(candidate))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = ["build_registry_candidate", "main"]
