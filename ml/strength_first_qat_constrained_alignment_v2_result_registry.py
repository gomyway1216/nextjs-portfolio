"""Strict public registry for the completed constrained-alignment v2 run.

The registry proves only that the three fixed local jobs completed and that an
independent checkpoint reload found the same seven deployed integer tensors as
each seed's parent.  It deliberately carries no candidate-selection, holdout,
playing-strength, or production authority.
"""

from __future__ import annotations

from collections.abc import Mapping
import copy
from pathlib import Path
from typing import Any

import strength_first_qat_constrained_alignment_v2_protocol as ALIGNMENT


RESULT_REGISTRY_SCHEMA = (
    "shogi-floodgate-strength-first-qat-constrained-alignment-v2-result-registry-v1"
)
RESULT_REGISTRY_STATUS = "complete-representation-alignment-only"
RESULT_REGISTRY_RELATIVE_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-strength-first-qat-constrained-alignment-v2-result-registry.json"
)
RESULT_REGISTRY_BUILDER_COMMAND = (
    "$HOME/.codex/shogi-data/floodgate-training-venv/bin/python3 "
    "ml/build_strength_first_qat_constrained_alignment_v2_result_registry_candidate.py"
)
RUN_SOURCE_REVISION = "a6fefc3f41543e35b9745da7f22fc8c7f2f6112f"
RUN_OBSERVATION = {
    "provenance": (
        "operator-transcribed-from-terminal-time-output-"
        "not-authenticated-by-result-registry-builder"
    ),
    "authenticated_by_builder": False,
    "command": "python3 ml/run_strength_first_three_seed_constrained_alignment_v2.py",
    "concurrent_processes": 3,
    "seeds": [42, 43, 44],
    "threads_per_process": 2,
    "returncodes": {"42": 0, "43": 0, "44": 0},
    "wall_seconds": 92.69,
    "user_cpu_seconds": 263.29,
    "system_cpu_seconds": 63.90,
    "maximum_resident_set_size_bytes": 1_860_321_280,
    "swaps": 0,
}
RESULT_BOUNDARY = {
    "local_only": True,
    "network_requests": 0,
    "replay_rows_read": 0,
    "selection_labels_read": False,
    "selection_evaluations": 0,
    "final_holdout_labels_read": False,
    "candidate_selected": False,
    "formal_ab_games": 0,
    "external_calibration_games": 0,
    "live_weights_changed": False,
}
RESULT_CLAIMS = {
    "representation_alignment_completed": True,
    "exact_parent_integer_tensors_preserved": True,
    "playing_strength_improved": False,
    "high_dan_calibrated": False,
    "live_model_changed": False,
}
QUANTIZED_TENSOR_NAMES = (
    "w1_board",
    "w1_hand",
    "b1",
    "w2",
    "b2",
    "w3",
    "b3",
)

_REGISTRY_FIELDS = {
    "schema",
    "status",
    "recorded_date",
    "builder_command",
    "plan",
    "run_observation",
    "runs",
    "boundary",
    "claims",
    "next_step",
}
_RUN_FIELDS = {
    "seed",
    "source_revision",
    "result",
    "checkpoint",
    "parent",
    "integer_target_cache",
    "training_history",
    "quantized_equality",
}
_HISTORY_FIELDS = {
    "local_epoch",
    "global_epoch",
    "rows",
    "parents",
    "learning_rate",
    "loss",
    "huber",
    "parent_policy_kl",
    "seconds",
    "quantized_crossing_coordinates",
    "forced_padding_coordinates",
    "total_restored_coordinates",
}
_Q_EQUALITY_FIELDS = {
    "method",
    "tensor_names",
    "tensors_equal",
    "equal_tensor_count",
    "all_equal",
    "parent",
    "candidate",
}


def _exact(value: Any, fields: set[str], label: str) -> dict[str, Any]:
    if type(value) is not dict or set(value) != fields:
        raise ValueError(f"{label} fields are not exact")
    return value


def _finite_number(value: Any, label: str, *, nonnegative: bool = True) -> None:
    import math

    if type(value) not in (int, float) or type(value) is bool:
        raise ValueError(f"{label} is not numeric")
    if not math.isfinite(float(value)) or (nonnegative and value < 0):
        raise ValueError(f"{label} is invalid")


def _anchor_identity(value: Any, label: str) -> dict[str, Any]:
    identity = _exact(
        value,
        {"schema", "aggregate_sha256", "tensors"},
        label,
    )
    if (
        identity["schema"] != "shogi-strength-first-quantized-cell-anchor-v2"
        or type(identity["aggregate_sha256"]) is not str
        or ALIGNMENT._SHA256_RE.fullmatch(identity["aggregate_sha256"]) is None
    ):
        raise ValueError(f"{label} header is invalid")
    tensors = _exact(identity["tensors"], set(QUANTIZED_TENSOR_NAMES), label)
    for name in QUANTIZED_TENSOR_NAMES:
        tensor = _exact(tensors[name], {"dtype", "shape", "sha256"}, f"{label} {name}")
        expected_dtype = "int32" if name in {"b1", "b2", "b3"} else "int16"
        if (
            tensor["dtype"] != expected_dtype
            or type(tensor["shape"]) is not list
            or not tensor["shape"]
            or any(type(size) is not int or size < 1 for size in tensor["shape"])
            or type(tensor["sha256"]) is not str
            or ALIGNMENT._SHA256_RE.fullmatch(tensor["sha256"]) is None
        ):
            raise ValueError(f"{label} {name} is invalid")
    return identity


def _validate_history(value: Any, seed: int) -> list[dict[str, Any]]:
    if type(value) is not list or len(value) != 4:
        raise ValueError(f"alignment seed {seed} history must contain four epochs")
    history = []
    for index, raw_epoch in enumerate(value, start=1):
        epoch = _exact(raw_epoch, _HISTORY_FIELDS, f"alignment seed {seed} epoch")
        if (
            epoch["local_epoch"] != index
            or epoch["global_epoch"] != 20 + index
            or epoch["rows"] != ALIGNMENT.ALIGNMENT_TRAINING["primary_rows"]
            or epoch["parents"] != ALIGNMENT.ALIGNMENT_TRAINING["primary_parents"]
        ):
            raise ValueError(f"alignment seed {seed} epoch accounting drifted")
        for field in (
            "learning_rate",
            "loss",
            "huber",
            "parent_policy_kl",
            "seconds",
        ):
            _finite_number(epoch[field], f"alignment seed {seed} epoch {field}")
        for field in (
            "quantized_crossing_coordinates",
            "forced_padding_coordinates",
            "total_restored_coordinates",
        ):
            if type(epoch[field]) is not int or epoch[field] < 0:
                raise ValueError(f"alignment seed {seed} epoch {field} is invalid")
        if (
            epoch["total_restored_coordinates"]
            != epoch["quantized_crossing_coordinates"]
            + epoch["forced_padding_coordinates"]
        ):
            raise ValueError(f"alignment seed {seed} restoration accounting drifted")
        history.append(copy.deepcopy(epoch))
    return history


def validate_result_registry(value: Mapping[str, Any]) -> dict[str, Any]:
    """Validate the exact public completion record without private run files."""

    registry = _exact(
        dict(value) if isinstance(value, Mapping) else value,
        _REGISTRY_FIELDS,
        "alignment result registry",
    )
    if (
        registry["schema"] != RESULT_REGISTRY_SCHEMA
        or registry["status"] != RESULT_REGISTRY_STATUS
        or registry["recorded_date"] != "2026-07-20"
        or registry["builder_command"] != RESULT_REGISTRY_BUILDER_COMMAND
        or registry["run_observation"] != RUN_OBSERVATION
        or registry["boundary"] != RESULT_BOUNDARY
        or registry["claims"] != RESULT_CLAIMS
        or registry["next_step"]
        != "spent-selection-representation-check-then-untouched-fresh-final-and-formal-ab"
    ):
        raise ValueError("alignment result registry fixed boundary drifted")
    ALIGNMENT._identity(
        registry["plan"],
        label="alignment result registry plan",
        path=ALIGNMENT.ALIGNMENT_PLAN_RELATIVE_PATH,
        schema=ALIGNMENT.ALIGNMENT_PLAN_SCHEMA,
    )
    runs = registry["runs"]
    if type(runs) is not list or len(runs) != 3:
        raise ValueError("alignment result registry requires three runs")
    seen_paths: set[str] = set()
    seen_hashes: set[str] = set()
    validated_runs = []
    for run, seed, slot in zip(
        runs, ALIGNMENT.ALIGNMENT_SEEDS, ALIGNMENT.expected_slots()
    ):
        run = _exact(run, _RUN_FIELDS, f"alignment result seed {seed}")
        if run["seed"] != seed or run["source_revision"] != RUN_SOURCE_REVISION:
            raise ValueError(f"alignment result seed {seed} provenance drifted")
        result = ALIGNMENT._identity(
            run["result"],
            label=f"alignment seed {seed} result",
            path=f"{slot['output']}/result.json",
            schema=ALIGNMENT.ALIGNMENT_RESULT_SCHEMA,
        )
        checkpoint = ALIGNMENT._identity(
            run["checkpoint"],
            label=f"alignment seed {seed} checkpoint",
            path=f"{slot['output']}/final.pt",
            schema=ALIGNMENT.ALIGNMENT_CHECKPOINT_SCHEMA,
        )
        parent = _exact(
            run["parent"],
            {"seed", "slot_id", "result", "checkpoint"},
            f"alignment seed {seed} parent",
        )
        expected_parent_output = (
            f"{ALIGNMENT.BASE.STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{seed}"
        )
        if (
            parent["seed"] != seed
            or parent["slot_id"] != f"floodgate-strength-first-int16-aware-seed-{seed}"
        ):
            raise ValueError(f"alignment seed {seed} parent slot drifted")
        ALIGNMENT._identity(
            parent["result"],
            label=f"alignment seed {seed} parent result",
            path=f"{expected_parent_output}/result.json",
            schema=ALIGNMENT.BASE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA,
        )
        parent_checkpoint = _exact(
            parent["checkpoint"],
            {"path", "schema", "bytes", "sha256", "epoch"},
            f"alignment seed {seed} parent checkpoint",
        )
        ALIGNMENT._identity(
            {
                key: parent_checkpoint[key]
                for key in ("path", "schema", "bytes", "sha256")
            },
            label=f"alignment seed {seed} parent checkpoint",
            path=f"{expected_parent_output}/final.pt",
            schema=ALIGNMENT.BASE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
        )
        if parent_checkpoint["epoch"] != 20:
            raise ValueError(f"alignment seed {seed} parent checkpoint epoch drifted")
        cache = _exact(
            run["integer_target_cache"],
            {
                "rows",
                "dtype",
                "bytes",
                "chunk_rows",
                "seconds",
                "source",
                "reused_local_epochs",
            },
            f"alignment seed {seed} integer cache",
        )
        if (
            cache["rows"] != ALIGNMENT.ALIGNMENT_TRAINING["primary_rows"]
            or cache["dtype"] != "float32"
            or cache["bytes"] != 1_114_944
            or cache["chunk_rows"] != 8192
            or cache["source"] != "seed-parent-anchor"
            or cache["reused_local_epochs"] != 4
        ):
            raise ValueError(f"alignment seed {seed} integer cache drifted")
        _finite_number(cache["seconds"], f"alignment seed {seed} cache seconds")
        history = _validate_history(run["training_history"], seed)
        equality = _exact(
            run["quantized_equality"],
            _Q_EQUALITY_FIELDS,
            f"alignment seed {seed} quantized equality",
        )
        expected_names = list(QUANTIZED_TENSOR_NAMES)
        expected_equal = {name: True for name in QUANTIZED_TENSOR_NAMES}
        parent_anchor = _anchor_identity(equality["parent"], "parent anchor")
        candidate_anchor = _anchor_identity(equality["candidate"], "candidate anchor")
        if (
            equality["method"] != "independent-strict-load-quantize-model-torch-equal"
            or equality["tensor_names"] != expected_names
            or equality["tensors_equal"] != expected_equal
            or equality["equal_tensor_count"] != 7
            or equality["all_equal"] is not True
            or parent_anchor != candidate_anchor
        ):
            raise ValueError(f"alignment seed {seed} integer equality is incomplete")
        for identity in (result, checkpoint):
            if identity["path"] in seen_paths or identity["sha256"] in seen_hashes:
                raise ValueError(
                    "alignment result identities are not pairwise distinct"
                )
            seen_paths.add(identity["path"])
            seen_hashes.add(identity["sha256"])
        validated_runs.append(
            {
                **copy.deepcopy(run),
                "training_history": history,
            }
        )
    return {
        **copy.deepcopy(registry),
        "runs": validated_runs,
    }


def load_result_registry(*, repo_root: str | Path | None = None) -> dict[str, Any]:
    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    path = root / RESULT_REGISTRY_RELATIVE_PATH
    return validate_result_registry(
        ALIGNMENT.strict_json(path.read_bytes(), "alignment result registry")
    )


__all__ = [
    "RESULT_BOUNDARY",
    "RESULT_CLAIMS",
    "RESULT_REGISTRY_BUILDER_COMMAND",
    "RESULT_REGISTRY_RELATIVE_PATH",
    "RESULT_REGISTRY_SCHEMA",
    "RESULT_REGISTRY_STATUS",
    "RUN_OBSERVATION",
    "RUN_SOURCE_REVISION",
    "load_result_registry",
    "validate_result_registry",
]
