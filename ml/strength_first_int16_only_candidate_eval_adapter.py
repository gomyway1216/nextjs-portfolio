"""Exact production-int16 adapter for the adaptive candidate-lock amendment.

Prevalidation authenticates stable plus the three epoch-20 parent checkpoints.
It deliberately has no aligned-checkpoint or float-forward path.  The separate
evaluation entry point is the only function that may open the already-spent
selection artifact.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
import copy
from pathlib import Path
from types import ModuleType
from typing import Any

import torch

import strength_first_int16_only_candidate_amendment as PROTOCOL
import strength_first_qat_selection_eval_adapter as BASE
import strength_first_qat_selection_evaluator as SELECTION
import strength_first_representation_bridge_v3_eval_adapter as BRIDGE_ADAPTER
from strength_first_quantized_cell_alignment import (
    anchor_identity,
    capture_quantized_anchor,
)


INT16_BATCH_ROWS = 4_096
EVALUATION_TORCH_THREADS = 10


def _resolved(root: Path, relative: str, label: str) -> str:
    candidate = (root / relative).absolute()
    if candidate.resolve() != candidate or not candidate.is_absolute():
        raise ValueError(f"{label} path is not canonical")
    return str(candidate)


def _require_fingerprint(
    path: str,
    identity: Mapping[str, Any],
    *,
    label: str,
    fingerprint: Callable[[str], Mapping[str, Any]],
) -> None:
    observed = fingerprint(path)
    if (
        type(observed) is not dict
        or observed.get("bytes") != identity["bytes"]
        or observed.get("sha256") != identity["sha256"]
    ):
        raise ValueError(f"{label} identity mismatch")


def prevalidate_parent_family(
    *,
    registry: Mapping[str, Any],
    repo_root: str | Path,
    home_root: str | Path,
    evaluator: ModuleType | None = None,
    fingerprint: Callable[[str], Mapping[str, Any]] = SELECTION._file_fingerprint,
) -> dict[str, Any]:
    """Authenticate only deployable checkpoints without reading any labels."""

    validated = PROTOCOL.validate_registry(registry)
    repo = Path(repo_root).resolve()
    home = Path(home_root).expanduser().resolve()
    real = evaluator if evaluator is not None else BASE._load_real_eval_module()

    stable_spec = validated["models"]["stable"]
    stable_identity = stable_spec["checkpoint"]
    stable_path = _resolved(home, stable_identity["path"], "stable checkpoint")
    stable = BRIDGE_ADAPTER._load_checkpoint(
        path=stable_path,
        identity=stable_identity,
        expected_epoch=27,
        expected_internal_schema=None,
        label="stable",
        evaluator=real,
    )

    models = []
    watched = [(stable_path, copy.deepcopy(stable_identity), "stable checkpoint")]
    for spec, seed in zip(validated["models"]["seeds"], PROTOCOL.SEEDS):
        result_path = _resolved(
            repo, spec["parent_result"]["path"], f"seed {seed} parent result"
        )
        _require_fingerprint(
            result_path,
            spec["parent_result"],
            label=f"seed {seed} parent result",
            fingerprint=fingerprint,
        )
        checkpoint_path = _resolved(
            repo,
            spec["parent_checkpoint"]["path"],
            f"seed {seed} parent checkpoint",
        )
        parent = BRIDGE_ADAPTER._load_checkpoint(
            path=checkpoint_path,
            identity=spec["parent_checkpoint"],
            expected_epoch=20,
            expected_internal_schema=(
                "shogi-floodgate-strength-first-qat-final-checkpoint-v2"
            ),
            label=f"seed {seed} parent",
            evaluator=real,
        )
        observed_anchor = anchor_identity(capture_quantized_anchor(parent["model"]))
        if observed_anchor != spec["quantized_anchor"]:
            raise ValueError(f"seed {seed} deployed integer tensor identity drifted")
        models.append(
            {
                "name": f"seed-{seed}",
                "role": "epoch-20-parent-deployment",
                "seed": seed,
                **parent,
                "quantized_anchor": observed_anchor,
            }
        )
        watched.extend(
            (
                (
                    result_path,
                    copy.deepcopy(spec["parent_result"]),
                    f"seed {seed} parent result",
                ),
                (
                    checkpoint_path,
                    copy.deepcopy(spec["parent_checkpoint"]),
                    f"seed {seed} parent checkpoint",
                ),
            )
        )
    return {
        "stable": {
            "name": "stable",
            "role": "stable",
            "seed": None,
            **stable,
        },
        "models": models,
        "watched_artifacts": watched,
        "selection_labels_read": False,
        "fresh_selection_labels_read": False,
        "fresh_final_labels_read": False,
        "legacy_holdout_labels_read": False,
        "aligned_checkpoints_loaded": 0,
        "float_model_evaluations": 0,
    }


def evaluate_spent_selection_int16_only(
    *,
    prepared: Mapping[str, Any],
    dataset_path: str,
    dataset_identity: Mapping[str, Any],
    expected_records: int,
    expected_parents: int,
    origin_registry_identity: Mapping[str, Any],
    artifact_bindings: list[Mapping[str, Any]],
    evaluator: ModuleType | None = None,
) -> dict[str, Any]:
    """Evaluate stable and three parents once; no float or aligned model exists."""

    if (
        prepared.get("selection_labels_read") is not False
        or prepared.get("fresh_selection_labels_read") is not False
        or prepared.get("fresh_final_labels_read") is not False
        or prepared.get("legacy_holdout_labels_read") is not False
        or prepared.get("aligned_checkpoints_loaded") != 0
        or prepared.get("float_model_evaluations") != 0
    ):
        raise ValueError("int16-only prevalidation boundary is incomplete")
    real = evaluator if evaluator is not None else BASE._load_real_eval_module()
    (
        board,
        hands,
        _bucket,
        clamped_cp,
        raw_cp,
        metadata,
        groups,
        observed_data,
    ) = BASE._load_splitless_fresh_selection_as_validation(
        evaluator=real,
        data_path=dataset_path,
        dataset_bytes=dataset_identity["bytes"],
        dataset_sha256=dataset_identity["sha256"],
        expected_records=expected_records,
    )
    if (
        observed_data
        != {"bytes": dataset_identity["bytes"], "sha256": dataset_identity["sha256"]}
        or len(metadata) != expected_records
        or len(groups) != expected_parents
    ):
        raise ValueError("spent selection accounting mismatch")
    eligible_pairs = real._eligible_pair_count(
        raw_cp, groups, BASE.STRENGTH_FIRST_SELECTION_PAIR_MIN_CP
    )
    if type(eligible_pairs) is not int or eligible_pairs < 1:
        raise ValueError("spent selection contains no eligible pair")

    evaluations = []
    original_threads = torch.get_num_threads()
    original_interop_threads = torch.get_num_interop_threads()
    torch.set_num_threads(EVALUATION_TORCH_THREADS)
    try:
        for item in (prepared["stable"], *prepared["models"]):
            predictions = BRIDGE_ADAPTER.exact_int16_predictions(
                item["model"],
                board,
                hands,
                item["k_sigmoid"],
                batch_rows=INT16_BATCH_ROWS,
            )
            metrics = PROTOCOL.metric_set(
                real.calculate_metrics(
                    predictions,
                    clamped_cp,
                    raw_cp,
                    metadata,
                    BASE.STRENGTH_FIRST_SELECTION_PAIR_MIN_CP,
                ),
                f"{item['name']} int16 metrics",
            )
            checkpoint = {
                **copy.deepcopy(item["identity"]),
                "epoch": item["epoch"],
            }
            evaluation = {
                "name": item["name"],
                "role": item["role"],
                "seed": item["seed"],
                "checkpoint": checkpoint,
                "int16": metrics,
                "int16_source": "evaluated-exact-int16-forward-batch",
            }
            if item["seed"] is not None:
                evaluation["quantized_anchor"] = copy.deepcopy(item["quantized_anchor"])
            evaluations.append(evaluation)
    finally:
        torch.set_num_threads(original_threads)
    if (
        torch.get_num_threads() != original_threads
        or torch.get_num_interop_threads() != original_interop_threads
    ):
        raise ValueError("Torch thread configuration was not restored")
    return {
        "schema": PROTOCOL.REPORT_SCHEMA,
        "status": PROTOCOL.REPORT_STATUS,
        "origin_registry": copy.deepcopy(dict(origin_registry_identity)),
        "artifact_bindings": copy.deepcopy(artifact_bindings),
        "data": {
            **copy.deepcopy(dict(dataset_identity)),
            "records": expected_records,
            "parents": expected_parents,
            "eligible_pairs": eligible_pairs,
            "label_status": "already-spent-selection",
            "authorized_use": (
                "adaptive-int16-candidate-lock-not-independent-strength-evidence"
            ),
        },
        "models": evaluations,
        "execution": {
            "model_count": 4,
            "model_loop_workers": 1,
            "int16_model_evaluations": 4,
            "float_model_evaluations": 0,
            "aligned_checkpoint_loads": 0,
            "int16_reference": "int16_forward_batch",
            "int16_batch_rows": INT16_BATCH_ROWS,
            "torch_intraop_threads": EVALUATION_TORCH_THREADS,
            "torch_original_intraop_threads": original_threads,
            "torch_original_intraop_threads_restored": True,
            "torch_interop_threads": original_interop_threads,
            "torch_interop_threads_unchanged": True,
            "spent_selection_label_reads": 1,
            "fresh_selection_label_reads": 0,
            "fresh_final_label_reads": 0,
            "legacy_holdout_label_reads": 0,
            "network_requests": 0,
            "cloud_requests": 0,
        },
        "boundary": copy.deepcopy(PROTOCOL.BOUNDARY),
    }


__all__ = [
    "EVALUATION_TORCH_THREADS",
    "INT16_BATCH_ROWS",
    "evaluate_spent_selection_int16_only",
    "prevalidate_parent_family",
]
