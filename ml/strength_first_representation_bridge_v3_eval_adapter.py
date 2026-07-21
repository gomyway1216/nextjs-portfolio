"""Real metric adapter for representation bridge v3.

The adapter first authenticates every parent/aligned result and checkpoint,
strict-loads all six checkpoints, and proves seven-tensor equality.  Only the
separate evaluation function can open the already-spent selection dataset.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
import copy
from pathlib import Path
from types import ModuleType
from typing import Any

import torch

from int16_forward import (
    OUT_SCALE,
    int16_forward_batch,
    quantize_model,
)
import strength_first_qat_selection_eval_adapter as BASE
import strength_first_qat_selection_evaluator as SELECTION
import strength_first_representation_bridge_v3_protocol as PROTOCOL
from strength_first_quantized_cell_alignment import (
    QUANTIZED_TENSOR_NAMES,
    anchor_identity,
    capture_quantized_anchor,
)


INT16_BATCH_ROWS = 4_096
EVALUATION_TORCH_THREADS = 10


def _production_cp_batch(out_q: torch.Tensor, k_sigmoid: float) -> torch.Tensor:
    if out_q.dtype != torch.int64 or out_q.ndim != 1:
        raise ValueError("batched int16 output must be a one-dimensional int64 tensor")
    k_int = int(k_sigmoid)
    if float(k_int) != float(k_sigmoid) or not 1 <= k_int <= 1_000_000:
        raise ValueError("production sigmoid scale must be an exact positive integer")
    product = out_q * k_int
    magnitude = torch.div(product.abs(), OUT_SCALE, rounding_mode="floor")
    cp = torch.where(product < 0, -magnitude, magnitude)
    return cp.clamp(-1_000_000, 1_000_000).to(torch.float64)


@torch.no_grad()
def exact_int16_predictions(
    model: Any,
    board: torch.Tensor,
    hands: torch.Tensor,
    k_sigmoid: float,
    *,
    batch_rows: int = INT16_BATCH_ROWS,
) -> torch.Tensor:
    """Vectorized exact production integer inference in bounded row chunks."""

    if type(batch_rows) is not int or batch_rows < 1:
        raise ValueError("int16 batch rows must be a positive integer")
    qweights = quantize_model(model)
    chunks = []
    for start in range(0, board.shape[0], batch_rows):
        out_q = int16_forward_batch(
            qweights,
            board[start : start + batch_rows],
            hands[start : start + batch_rows],
            model.pad_idx,
        )
        chunks.append(_production_cp_batch(out_q, k_sigmoid))
    if not chunks:
        raise ValueError("int16 evaluation requires at least one row")
    predictions = torch.cat(chunks)
    if not bool(torch.isfinite(predictions).all().item()):
        raise ValueError("batched int16 inference produced a non-finite prediction")
    return predictions


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


def _load_checkpoint(
    *,
    path: str,
    identity: Mapping[str, Any],
    expected_epoch: int,
    expected_internal_schema: str | None,
    label: str,
    evaluator: ModuleType,
) -> dict[str, Any]:
    model, checkpoint, k_sigmoid, observed = evaluator.load_model(path)
    if (
        type(observed) is not dict
        or observed.get("bytes") != identity["bytes"]
        or observed.get("sha256") != identity["sha256"]
        or not isinstance(checkpoint, Mapping)
        or checkpoint.get("epoch") != expected_epoch
        or (
            expected_internal_schema is not None
            and checkpoint.get("schema") != expected_internal_schema
        )
        or type(k_sigmoid) not in (int, float)
        or float(k_sigmoid) != 600.0
    ):
        raise ValueError(f"{label} checkpoint contract mismatch")
    return {
        "model": model,
        "identity": copy.deepcopy(dict(identity)),
        "epoch": expected_epoch,
        "k_sigmoid": 600.0,
        "path": path,
    }


def prevalidate_family(
    *,
    registry: Mapping[str, Any],
    repo_root: str | Path,
    home_root: str | Path,
    evaluator: ModuleType | None = None,
    fingerprint: Callable[[str], Mapping[str, Any]] = SELECTION._file_fingerprint,
) -> dict[str, Any]:
    """Authenticate all model artifacts and q proofs without reading labels."""

    validated = PROTOCOL.validate_registry(registry)
    repo = Path(repo_root).resolve()
    home = Path(home_root).expanduser().resolve()
    real = evaluator if evaluator is not None else BASE._load_real_eval_module()

    stable_spec = validated["models"]["stable"]
    stable_identity = stable_spec["checkpoint"]
    stable_path = _resolved(home, stable_identity["path"], "stable checkpoint")
    stable = _load_checkpoint(
        path=stable_path,
        identity=stable_identity,
        expected_epoch=27,
        expected_internal_schema=None,
        label="stable",
        evaluator=real,
    )

    prepared = []
    proofs = []
    watched = [(stable_path, copy.deepcopy(stable_identity), "stable checkpoint")]
    for spec, seed in zip(validated["models"]["seeds"], PROTOCOL.SEEDS):
        parent_result_path = _resolved(
            repo, spec["parent_result"]["path"], f"seed {seed} parent result"
        )
        aligned_result_path = _resolved(
            repo, spec["aligned_result"]["path"], f"seed {seed} aligned result"
        )
        _require_fingerprint(
            parent_result_path,
            spec["parent_result"],
            label=f"seed {seed} parent result",
            fingerprint=fingerprint,
        )
        _require_fingerprint(
            aligned_result_path,
            spec["aligned_result"],
            label=f"seed {seed} aligned result",
            fingerprint=fingerprint,
        )

        parent_path = _resolved(
            repo, spec["parent_checkpoint"]["path"], f"seed {seed} parent checkpoint"
        )
        aligned_path = _resolved(
            repo,
            spec["aligned_checkpoint"]["path"],
            f"seed {seed} aligned checkpoint",
        )
        parent = _load_checkpoint(
            path=parent_path,
            identity=spec["parent_checkpoint"],
            expected_epoch=20,
            expected_internal_schema=(
                "shogi-floodgate-strength-first-qat-final-checkpoint-v2"
            ),
            label=f"seed {seed} parent",
            evaluator=real,
        )
        aligned = _load_checkpoint(
            path=aligned_path,
            identity=spec["aligned_checkpoint"],
            expected_epoch=24,
            expected_internal_schema=(
                "shogi-floodgate-strength-first-qat-constrained-alignment-v2-"
                "checkpoint-v1"
            ),
            label=f"seed {seed} aligned witness",
            evaluator=real,
        )

        captured_parent = capture_quantized_anchor(parent["model"])
        captured_aligned = capture_quantized_anchor(aligned["model"])
        parent_anchor = anchor_identity(captured_parent)
        aligned_anchor = anchor_identity(captured_aligned)
        tensors_equal = {
            name: bool(
                torch.equal(
                    captured_parent.quantized[name],
                    captured_aligned.quantized[name],
                )
            )
            for name in QUANTIZED_TENSOR_NAMES
        }
        if (
            tuple(QUANTIZED_TENSOR_NAMES) != PROTOCOL.QUANTIZED_TENSOR_NAMES
            or not all(tensors_equal.values())
            or parent_anchor != aligned_anchor
            or parent_anchor != spec["quantized_anchor"]
        ):
            raise ValueError(f"seed {seed} seven-tensor equivalence failed")
        proofs.append(
            {
                "schema": PROTOCOL.QUANTIZED_PROOF_SCHEMA,
                "seed": seed,
                "method": "independent-strict-load-quantize-model-torch-equal",
                "tensor_names": list(PROTOCOL.QUANTIZED_TENSOR_NAMES),
                "tensors_equal": tensors_equal,
                "equal_tensor_count": 7,
                "all_equal": True,
                "parent": parent_anchor,
                "aligned_witness": aligned_anchor,
            }
        )
        prepared.extend(
            (
                {
                    "name": f"seed-{seed}-parent-deployment",
                    "role": "parent",
                    "seed": seed,
                    **parent,
                },
                {
                    "name": f"seed-{seed}-aligned-witness",
                    "role": "aligned-witness",
                    "seed": seed,
                    **aligned,
                },
            )
        )
        watched.extend(
            (
                (
                    parent_result_path,
                    copy.deepcopy(spec["parent_result"]),
                    f"seed {seed} parent result",
                ),
                (
                    parent_path,
                    copy.deepcopy(spec["parent_checkpoint"]),
                    f"seed {seed} parent checkpoint",
                ),
                (
                    aligned_result_path,
                    copy.deepcopy(spec["aligned_result"]),
                    f"seed {seed} aligned result",
                ),
                (
                    aligned_path,
                    copy.deepcopy(spec["aligned_checkpoint"]),
                    f"seed {seed} aligned checkpoint",
                ),
            )
        )

    return {
        "stable": {"name": "stable", "role": "stable", "seed": None, **stable},
        "models": prepared,
        "quantized_proofs": proofs,
        "watched_artifacts": watched,
        "selection_labels_read": False,
    }


def evaluate_spent_selection(
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
    """Evaluate stable, parents, and witnesses on the already-spent labels."""

    real = evaluator if evaluator is not None else BASE._load_real_eval_module()
    (
        board,
        hands,
        bucket,
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
        != {
            "bytes": dataset_identity["bytes"],
            "sha256": dataset_identity["sha256"],
        }
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
    parent_int16_by_seed: dict[int, dict[str, float]] = {}
    float_evaluations = 0
    int16_evaluations = 0
    q_derived_int16_evaluations = 0
    original_threads = torch.get_num_threads()
    original_interop_threads = torch.get_num_interop_threads()
    torch.set_num_threads(EVALUATION_TORCH_THREADS)
    try:
        for item in (prepared["stable"], *prepared["models"]):
            floating_predictions = real.float_predictions(
                item["model"],
                board,
                hands,
                bucket,
                item["k_sigmoid"],
                BASE.STRENGTH_FIRST_SELECTION_BATCH_SIZE,
            )
            floating = PROTOCOL.metric_set(
                real.calculate_metrics(
                    floating_predictions,
                    clamped_cp,
                    raw_cp,
                    metadata,
                    BASE.STRENGTH_FIRST_SELECTION_PAIR_MIN_CP,
                ),
                f"{item['name']} float metrics",
            )
            float_evaluations += 1
            if item["role"] == "aligned-witness":
                if item["seed"] not in parent_int16_by_seed:
                    raise ValueError("aligned witness preceded its q-equivalent parent")
                integer = copy.deepcopy(parent_int16_by_seed[item["seed"]])
                int16_source = "derived-from-seven-tensor-equivalent-parent"
                q_derived_int16_evaluations += 1
            else:
                integer_predictions = exact_int16_predictions(
                    item["model"],
                    board,
                    hands,
                    item["k_sigmoid"],
                    batch_rows=INT16_BATCH_ROWS,
                )
                integer = PROTOCOL.metric_set(
                    real.calculate_metrics(
                        integer_predictions,
                        clamped_cp,
                        raw_cp,
                        metadata,
                        BASE.STRENGTH_FIRST_SELECTION_PAIR_MIN_CP,
                    ),
                    f"{item['name']} int16 metrics",
                )
                int16_source = "evaluated-exact-int16-forward-batch"
                int16_evaluations += 1
                if item["role"] == "parent":
                    parent_int16_by_seed[item["seed"]] = copy.deepcopy(integer)
            evaluations.append(
                {
                    "name": item["name"],
                    "role": item["role"],
                    "seed": item["seed"],
                    "checkpoint": {
                        **copy.deepcopy(item["identity"]),
                        "epoch": item["epoch"],
                    },
                    "float": floating,
                    "int16": integer,
                    "int16_source": int16_source,
                }
            )
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
            "authorized_use": "representation-only-no-strength-claim",
        },
        "models": evaluations,
        "quantized_proofs": copy.deepcopy(prepared["quantized_proofs"]),
        "execution": {
            "model_count": 7,
            "model_loop_workers": 1,
            "float_model_evaluations": float_evaluations,
            "int16_model_evaluations": int16_evaluations,
            "q_equivalent_int16_derivations": q_derived_int16_evaluations,
            "int16_reference": "int16_forward_batch",
            "int16_batch_rows": INT16_BATCH_ROWS,
            "torch_intraop_threads": EVALUATION_TORCH_THREADS,
            "torch_original_intraop_threads": original_threads,
            "torch_original_intraop_threads_restored": True,
            "torch_interop_threads": original_interop_threads,
            "torch_interop_threads_unchanged": True,
            "network_requests": 0,
        },
        "boundary": copy.deepcopy(PROTOCOL.BOUNDARY),
    }


__all__ = [
    "EVALUATION_TORCH_THREADS",
    "INT16_BATCH_ROWS",
    "evaluate_spent_selection",
    "exact_int16_predictions",
    "prevalidate_family",
]
