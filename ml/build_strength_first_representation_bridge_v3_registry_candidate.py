#!/usr/bin/env python3
"""Build the deterministic READY registry for representation bridge v3."""

from __future__ import annotations

import copy
from pathlib import Path
import sys
from typing import Any

import strength_first_qat_constrained_alignment_v2_result_registry as ALIGNMENT
import strength_first_qat_selection_evaluator as SELECTION
import strength_first_representation_bridge_v3_protocol as PROTOCOL


def _document_identity(
    root: Path, *, relative: str, schema: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    path = root / relative
    raw = path.read_bytes()
    identity = PROTOCOL.file_identity(path, relative=relative, schema=schema)
    return identity, PROTOCOL.strict_json(raw, relative)


def build_registry_candidate(
    *, repo_root: str | Path | None = None, require_pinned_match: bool = False
) -> dict[str, Any]:
    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    alignment_identity, alignment_value = _document_identity(
        root,
        relative=PROTOCOL.ALIGNMENT_REGISTRY_RELATIVE_PATH,
        schema=ALIGNMENT.RESULT_REGISTRY_SCHEMA,
    )
    selection_identity, selection_value = _document_identity(
        root,
        relative=PROTOCOL.SELECTION_REGISTRY_RELATIVE_PATH,
        schema=SELECTION.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_SCHEMA,
    )
    alignment = ALIGNMENT.validate_result_registry(alignment_value)
    selection = dict(
        SELECTION.validate_strength_first_selection_evaluator_registry_data(
            selection_value
        )
    )
    if (
        selection["status"] != SELECTION.STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS
        or alignment["boundary"]["selection_labels_read"] is not False
        or alignment["claims"]["playing_strength_improved"] is not False
        or alignment["claims"]["live_model_changed"] is not False
    ):
        raise ValueError("representation bridge input state is not READY")

    implementation = {
        name: PROTOCOL.file_identity(
            root / relative,
            relative=relative,
            schema="shogi-reviewed-python-source-v1",
        )
        for name, relative in PROTOCOL._SOURCE_PATHS.items()
    }
    seed_models = []
    for run, seed in zip(alignment["runs"], PROTOCOL.SEEDS):
        parent_checkpoint = {
            **copy.deepcopy(run["parent"]["checkpoint"]),
            "epoch": 20,
        }
        # The result registry already carries epoch on parents; normalize it
        # explicitly so the v3 registry has one exact shape for both roles.
        parent_checkpoint["epoch"] = 20
        aligned_checkpoint = {
            **copy.deepcopy(run["checkpoint"]),
            "epoch": 24,
        }
        seed_models.append(
            {
                "seed": seed,
                "parent_result": copy.deepcopy(run["parent"]["result"]),
                "parent_checkpoint": parent_checkpoint,
                "aligned_result": copy.deepcopy(run["result"]),
                "aligned_checkpoint": aligned_checkpoint,
                "quantized_anchor": copy.deepcopy(run["quantized_equality"]["parent"]),
            }
        )

    candidate = {
        "schema": PROTOCOL.REGISTRY_SCHEMA,
        "status": PROTOCOL.REGISTRY_STATUS,
        "recorded_date": "2026-07-20",
        "builder_command": PROTOCOL.BUILDER_COMMAND,
        "runner_command": PROTOCOL.RUNNER_COMMAND,
        "inputs": {
            "alignment_result_registry": alignment_identity,
            "selection_evaluator_registry": selection_identity,
        },
        "implementation": implementation,
        "dependencies": {
            "runtime_import_closure": {
                name: PROTOCOL.file_identity(
                    root / relative,
                    relative=relative,
                    schema="shogi-reviewed-python-source-v1",
                )
                for name, relative in PROTOCOL.RUNTIME_IMPORT_CLOSURE_PATHS.items()
            }
        },
        "spent_selection": {
            "dataset": copy.deepcopy(selection["enrollments"]["selection_dataset"]),
            "records": 28_518,
            "parents": 4_798,
            "label_status": "already-spent-selection",
            "authorized_use": "representation-only-no-strength-claim",
        },
        "models": {
            "stable": {
                "checkpoint": copy.deepcopy(
                    selection["enrollments"]["stable_checkpoint"]
                ),
                "epoch": 27,
            },
            "seeds": seed_models,
        },
        "policy": {
            "metric_order": list(PROTOCOL.METRIC_ORDER),
            "representative": "median-of-three-parent-int16-ranking",
            "gates": copy.deepcopy(PROTOCOL.GATE_POLICY),
            "family_gate": copy.deepcopy(PROTOCOL.FAMILY_POLICY),
            "evaluation": copy.deepcopy(PROTOCOL.EVALUATION_POLICY),
            "deployment": "epoch-20-parent-checkpoint-only",
            "witness": "epoch-24-aligned-checkpoint-never-deployed",
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
    if list(sys.argv[1:] if argv is None else argv):
        print(
            "representation bridge registry builder accepts no arguments",
            file=sys.stderr,
        )
        return 2
    try:
        candidate = build_registry_candidate()
    except (OSError, ValueError) as error:
        print(f"representation bridge registry STOP: {error}", file=sys.stderr)
        return 1
    sys.stdout.buffer.write(PROTOCOL.canonical_json_bytes(candidate))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
