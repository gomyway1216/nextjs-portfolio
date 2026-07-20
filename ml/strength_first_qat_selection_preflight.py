"""Fail-closed selection preflight for three strength-first QAT candidates.

The checked-in registry is intentionally closed until the exact strength-first
plan and all three final result/checkpoint identities exist.  The public path
uses the same immutable-byte, strict-model, and tracked-file boundary as the
fresh QAT preflight, but accepts only the strength-first schema/path family.
It does not read selection labels or the final holdout itself.

The receipt is only a one-shot accidental-misuse guard for cooperative callers
using the public API. Python code in this process can import module-private
state or call a selection reader directly, so this module does not claim
same-process authorization, cryptographic unforgeability, or security isolation.
"""

from __future__ import annotations

import hashlib
import json
import os
import weakref
from collections.abc import Callable, Mapping
from typing import Any

import fresh_qat_protocol as FRESH
import fresh_qat_selection_preflight as COMMON
import strength_first_qat_training_bridge as BRIDGE


STRENGTH_FIRST_QAT_SELECTION_REGISTRY_SCHEMA = (
    "shogi-floodgate-strength-first-qat-selection-preflight-registry-v1"
)
STRENGTH_FIRST_QAT_SELECTION_PREFLIGHT_SCHEMA = (
    "shogi-floodgate-strength-first-qat-selection-preflight-v1"
)
STRENGTH_FIRST_QAT_SELECTION_REGISTRY_RELATIVE_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-strength-first-qat-selection-preflight-registry.json"
)
STRENGTH_FIRST_QAT_SELECTION_BLOCKED_STATUS = (
    "awaiting-exact-strength-first-plan-and-three-final-run-identities"
)
STRENGTH_FIRST_QAT_SELECTION_READY_STATUS = (
    "exact-strength-first-plan-and-three-final-run-identities-ready"
)

_RECEIPT_BRAND = object()
_RECEIPT_STATES: weakref.WeakKeyDictionary[
    StrengthFirstQatSelectionPreflightReceipt,
    bytes,
] = weakref.WeakKeyDictionary()


def _data_only_blocker(detail: str) -> ValueError:
    return ValueError(
        "strength-first QAT selection is data-only blocked: exact tracked "
        "training plan and all three final result/checkpoint identities are "
        f"required ({detail})"
    )


def _expected_registry_runs() -> list[dict[str, Any]]:
    return [
        {
            "slot_id": f"floodgate-strength-first-int16-aware-seed-{seed}",
            "seed": seed,
            "output": f"{BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{seed}",
            "result": {
                "path": (
                    f"{BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/" f"seed-{seed}/result.json"
                ),
                "schema": BRIDGE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA,
            },
            "checkpoint": {
                "path": (
                    f"{BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/" f"seed-{seed}/final.pt"
                ),
                "schema": BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
            },
        }
        for seed in FRESH.FRESH_QAT_SLOT_ORDER
    ]


def _validate_registered_identity(
    value: Mapping[str, Any],
    *,
    ready: bool,
    label: str,
) -> None:
    if ready:
        if (
            type(value["bytes"]) is not int
            or value["bytes"] < 1
            or not COMMON._valid_sha256(value["sha256"])
        ):
            raise ValueError(f"{label} ready identity is invalid")
    elif value["bytes"] is not None or value["sha256"] is not None:
        raise ValueError(f"{label} blocked identity must remain null")


def _validate_registry(registry: dict[str, Any]) -> bool:
    COMMON._exact_keys(
        registry,
        {
            "schema",
            "status",
            "training_plan",
            "training_pipeline_revision",
            "runs",
            "artifact_identities_registered",
            "selection_preflight_ready",
        },
        "strength-first QAT selection registry",
    )
    if registry["schema"] != STRENGTH_FIRST_QAT_SELECTION_REGISTRY_SCHEMA:
        raise ValueError("strength-first QAT selection registry schema mismatch")
    status = registry["status"]
    if status == STRENGTH_FIRST_QAT_SELECTION_BLOCKED_STATUS:
        ready = False
    elif status == STRENGTH_FIRST_QAT_SELECTION_READY_STATUS:
        ready = True
    else:
        raise ValueError("strength-first QAT selection registry status mismatch")

    plan = registry["training_plan"]
    COMMON._exact_keys(
        plan,
        {"path", "schema", "bytes", "sha256"},
        "strength-first QAT selection registry training plan",
    )
    if (
        plan["path"] != BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH
        or plan["schema"] != BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA
    ):
        raise ValueError(
            "strength-first QAT selection training-plan path/schema mismatch"
        )
    _validate_registered_identity(plan, ready=ready, label="training plan")

    expected_runs = _expected_registry_runs()
    runs = registry["runs"]
    if type(runs) is not list or len(runs) != len(expected_runs):
        raise ValueError(
            "strength-first QAT selection registry must contain three runs"
        )
    for index, (run, expected) in enumerate(zip(runs, expected_runs)):
        label = f"strength-first QAT selection registry run {index}"
        COMMON._exact_keys(
            run,
            {"slot_id", "seed", "output", "result", "checkpoint"},
            label,
        )
        for field in ("slot_id", "seed", "output"):
            if (
                type(run[field]) is not type(expected[field])
                or run[field] != expected[field]
            ):
                raise ValueError(f"{label} {field} mismatch")
        for artifact_name in ("result", "checkpoint"):
            artifact = run[artifact_name]
            expected_artifact = expected[artifact_name]
            COMMON._exact_keys(
                artifact,
                {"path", "schema", "bytes", "sha256"},
                f"{label} {artifact_name}",
            )
            if (
                artifact["path"] != expected_artifact["path"]
                or artifact["schema"] != expected_artifact["schema"]
            ):
                raise ValueError(f"{label} {artifact_name} path/schema mismatch")
            _validate_registered_identity(
                artifact,
                ready=ready,
                label=f"{label} {artifact_name}",
            )

    if ready:
        if (
            type(registry["training_pipeline_revision"]) is not str
            or COMMON.GIT_REVISION_RE.fullmatch(registry["training_pipeline_revision"])
            is None
            or registry["artifact_identities_registered"] is not True
            or registry["selection_preflight_ready"] is not True
        ):
            raise ValueError(
                "strength-first QAT selection ready registry is incomplete"
            )
    elif (
        registry["training_pipeline_revision"] is not None
        or registry["artifact_identities_registered"] is not False
        or registry["selection_preflight_ready"] is not False
    ):
        raise ValueError(
            "strength-first QAT selection blocked registry contains identities"
        )
    return ready


def _expected_plan_binding(
    plan: Mapping[str, Any],
    *,
    plan_path: str,
    plan_identity: Mapping[str, Any],
    registered_run: Mapping[str, Any],
) -> dict[str, Any]:
    artifacts = plan["artifacts"]
    completion = artifacts["parent_completion"]
    model_training = artifacts["model_training"]
    return {
        "path": plan_path,
        "bytes": plan_identity["bytes"],
        "sha256": plan_identity["sha256"],
        "schema": BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
        "slot_id": registered_run["slot_id"],
        "slot_output": registered_run["output"],
        "teacher_result_sha256": artifacts["teacher_result"]["sha256"],
        "teacher_provenance_schema": plan["teacher_provenance"]["schema"],
        "teacher_provenance_status": plan["teacher_provenance"]["status"],
        "parent_completion_sha256": completion["sha256"],
        "input_parents": completion["records"],
        "forced_parents_skipped": completion["forced_parents_skipped"],
        "emitted_parent_groups": completion["emitted_parent_groups"],
        "model_training_parents": model_training["parents"],
        "equation_verified": True,
        "replacement_parents": 0,
        "resampled_parents": 0,
        "emitted_order_preserved": True,
    }


def _expected_training_contract(
    plan: Mapping[str, Any],
    registered_run: Mapping[str, Any],
) -> dict[str, Any]:
    slot = next(
        item for item in plan["slots"] if item["seed"] == registered_run["seed"]
    )
    return FRESH.build_fresh_qat_training_contract(
        {"inputs": {"model_training": plan["artifacts"]["model_training"]}},
        slot,
    )


def _preflight_strength_first_qat_selection(
    *,
    repo_root: str,
    tracking_verifier: Callable[[str, bytes], None],
    checkpoint_loader: Callable[[bytes], Mapping[str, Any]],
    strict_model_validator: Callable[[Any, int], None],
) -> dict[str, Any]:
    root = os.path.realpath(repo_root)
    registry_path = os.path.join(
        root,
        STRENGTH_FIRST_QAT_SELECTION_REGISTRY_RELATIVE_PATH,
    )
    try:
        registry_raw = COMMON._read_exact_file(
            registry_path,
            "strength-first QAT selection registry",
        )
    except ValueError as error:
        raise _data_only_blocker("tracked selection registry is absent") from error
    registry = COMMON._strict_json(
        registry_raw,
        "strength-first QAT selection registry",
    )
    ready = _validate_registry(registry)
    tracking_verifier(registry_path, registry_raw)
    if (
        COMMON._read_exact_file(
            registry_path,
            "strength-first QAT selection registry",
        )
        != registry_raw
    ):
        raise ValueError(
            "strength-first QAT selection registry changed during verification"
        )
    if not ready:
        raise _data_only_blocker("selection registry remains closed")

    plan_identity = registry["training_plan"]
    plan_receipt = COMMON._registered_snapshot(
        root,
        plan_identity,
        "strength-first QAT training plan",
    )
    plan_path = plan_receipt["path"]
    plan_raw = COMMON._read_exact_file(
        plan_path,
        "strength-first QAT training plan",
    )
    if (
        len(plan_raw) != plan_identity["bytes"]
        or hashlib.sha256(plan_raw).hexdigest() != plan_identity["sha256"]
    ):
        raise ValueError("strength-first QAT training plan changed after snapshot")
    plan = COMMON._strict_json(plan_raw, "strength-first QAT training plan")
    BRIDGE.validate_strength_first_qat_training_plan_data(plan)
    tracking_verifier(plan_path, plan_raw)

    registered_runs = registry["runs"]
    expected_slots = [
        {
            "id": run["slot_id"],
            "seed": run["seed"],
            "output": run["output"],
        }
        for run in registered_runs
    ]
    if not COMMON._typed_equal(plan["slots"], expected_slots):
        raise ValueError(
            "strength-first QAT selection run registry differs from plan slots"
        )

    artifact_receipts = []
    for registered_run in registered_runs:
        seed = registered_run["seed"]
        result_receipt, result_raw = COMMON._registered_content_snapshot(
            root,
            registered_run["result"],
            f"strength-first seed {seed} result",
        )
        checkpoint_receipt, checkpoint_raw = COMMON._registered_content_snapshot(
            root,
            registered_run["checkpoint"],
            f"strength-first seed {seed} checkpoint",
        )
        artifact_receipts.append(
            {
                "registered_run": registered_run,
                "result": result_receipt,
                "result_raw": result_raw,
                "checkpoint": checkpoint_receipt,
                "checkpoint_raw": checkpoint_raw,
            }
        )

    parsed_results = []
    for artifacts in artifact_receipts:
        registered_run = artifacts["registered_run"]
        seed = registered_run["seed"]
        result = COMMON._strict_json(
            artifacts["result_raw"],
            f"strength-first seed {seed} result",
        )
        COMMON._validate_result(
            result,
            plan=plan,
            plan_path=plan_path,
            plan_identity=plan_identity,
            registry=registry,
            registered_run=registered_run,
            checkpoint_receipt=artifacts["checkpoint"],
            result_schema=BRIDGE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA,
            expected_plan_binding=_expected_plan_binding(
                plan,
                plan_path=plan_path,
                plan_identity=plan_identity,
                registered_run=registered_run,
            ),
            expected_contract=_expected_training_contract(
                plan,
                registered_run,
            ),
            label_prefix="strength-first",
        )
        parsed_results.append({**artifacts, "result_value": result})

    shared_pipeline = parsed_results[0]["result_value"]["training_pipeline"]
    shared_runtime = parsed_results[0]["result_value"]["training_runtime"]
    if any(
        not COMMON._typed_equal(
            artifacts["result_value"]["training_pipeline"],
            shared_pipeline,
        )
        or not COMMON._typed_equal(
            artifacts["result_value"]["training_runtime"],
            shared_runtime,
        )
        for artifacts in parsed_results[1:]
    ):
        raise ValueError(
            "the three strength-first QAT runs do not share one " "pipeline/runtime"
        )

    runs = []
    for artifacts in parsed_results:
        registered_run = artifacts["registered_run"]
        seed = registered_run["seed"]
        try:
            checkpoint = checkpoint_loader(artifacts["checkpoint_raw"])
        except Exception as error:
            if isinstance(error, ValueError):
                raise
            raise ValueError(
                "cannot strict-load strength-first seed " f"{seed} checkpoint: {error}"
            ) from error
        if not isinstance(checkpoint, Mapping):
            raise ValueError(
                f"strength-first seed {seed} checkpoint root must be a mapping"
            )
        checkpoint_metadata = COMMON._validate_checkpoint(
            checkpoint,
            result=artifacts["result_value"],
            plan=plan,
            plan_path=plan_path,
            root=root,
            registered_run=registered_run,
            strict_model_validator=strict_model_validator,
            checkpoint_schema=(BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA),
            replay_exclusion=plan["artifacts"]["replay_exclusion"],
            replay_identity=plan["artifacts"]["replay"],
            label_prefix="strength-first",
        )
        runs.append(
            {
                "slot_id": registered_run["slot_id"],
                "seed": seed,
                "output": registered_run["output"],
                "result": dict(artifacts["result"]),
                "checkpoint": dict(artifacts["checkpoint"]),
                "checkpoint_metadata": checkpoint_metadata,
            }
        )

    if [run["seed"] for run in runs] != list(FRESH.FRESH_QAT_SLOT_ORDER):
        raise ValueError(
            "strength-first QAT selection runs are outside exact seed order"
        )
    if not all(
        run["checkpoint_metadata"]
        == {
            "schema": BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
            "epoch": 20,
        }
        for run in runs
    ):
        raise ValueError(
            "strength-first QAT selection checkpoint metadata is incomplete"
        )

    if (
        COMMON._read_exact_file(
            registry_path,
            "strength-first QAT selection registry",
        )
        != registry_raw
        or COMMON._read_exact_file(
            plan_path,
            "strength-first QAT training plan",
        )
        != plan_raw
    ):
        raise ValueError(
            "strength-first tracked preflight inputs changed during verification"
        )
    for artifacts in parsed_results:
        seed = artifacts["registered_run"]["seed"]
        if (
            COMMON._read_exact_file(
                artifacts["result"]["path"],
                f"strength-first seed {seed} result",
            )
            != artifacts["result_raw"]
        ):
            raise ValueError(
                f"strength-first seed {seed} result changed during preflight"
            )
        COMMON._registered_snapshot(
            root,
            artifacts["registered_run"]["checkpoint"],
            f"strength-first seed {seed} checkpoint",
        )

    return {
        "schema": STRENGTH_FIRST_QAT_SELECTION_PREFLIGHT_SCHEMA,
        "all_three_complete_before_selection_read": True,
        "selection_labels_read": False,
        "training_plan": plan_receipt,
        "training_pipeline": {
            "source_revision": registry["training_pipeline_revision"],
            "tracked_tree_clean": True,
        },
        "runs": runs,
        "reader_gate": "one-shot-public-api-accidental-misuse-guard",
        "same_process_python_authorization_enforced": False,
        "final_holdout": "not_opened_by_this_preflight",
        "production_promotion_authorized": False,
    }


class StrengthFirstQatSelectionPreflightReceipt:
    """One-shot public-API misuse guard, not a same-process authority token."""

    __slots__ = ("__weakref__",)

    def __init__(self, brand: object, value: Mapping[str, Any]) -> None:
        if brand is not _RECEIPT_BRAND:
            raise TypeError(
                "strength-first selection receipt requires the module-private "
                "misuse-guard brand"
            )
        serialized = (json.dumps(value, sort_keys=True, allow_nan=False) + "\n").encode(
            "utf-8"
        )
        _RECEIPT_STATES[self] = serialized

    def to_dict(self) -> dict[str, Any]:
        serialized = _RECEIPT_STATES.get(self)
        if serialized is None:
            raise ValueError(
                "strength-first selection receipt is invalid or already used"
            )
        return COMMON._strict_json(
            serialized,
            "strength-first QAT selection preflight receipt",
        )

    def _claim(self) -> dict[str, Any]:
        try:
            serialized = _RECEIPT_STATES.pop(self)
        except KeyError:
            raise ValueError(
                "strength-first selection receipt is invalid or already used"
            )
        return COMMON._strict_json(
            serialized,
            "strength-first QAT selection preflight receipt",
        )


def call_strength_first_selection_reader(
    receipt: StrengthFirstQatSelectionPreflightReceipt,
    selection_reader: Callable[[Mapping[str, Any]], Any],
) -> Any:
    """Use one guard once; this does not stop direct same-process reader calls."""

    if type(receipt) is not StrengthFirstQatSelectionPreflightReceipt:
        raise ValueError(
            "strength-first selection reader requires an unused " "preflight receipt"
        )
    if not callable(selection_reader):
        raise TypeError("strength-first selection reader must be callable")
    try:
        claimed = receipt._claim()
    except ValueError as error:
        raise ValueError(
            "strength-first selection reader requires an unused " "preflight receipt"
        ) from error
    return selection_reader(claimed)


def preflight_strength_first_qat_selection(
    *,
    audit_revision: str,
) -> StrengthFirstQatSelectionPreflightReceipt:
    """Return a fixed-path one-shot misuse guard, or stop before a reader."""

    root = os.path.realpath(
        os.path.join(os.path.abspath(os.path.dirname(__file__)), "..")
    )
    validated = _preflight_strength_first_qat_selection(
        repo_root=root,
        tracking_verifier=lambda path, raw: COMMON._verify_tracked_file(
            path,
            audit_revision,
            raw,
        ),
        checkpoint_loader=COMMON._torch_checkpoint_loader,
        strict_model_validator=COMMON._torch_strict_model_validator,
    )
    return StrengthFirstQatSelectionPreflightReceipt(
        _RECEIPT_BRAND,
        validated,
    )


__all__ = [
    "STRENGTH_FIRST_QAT_SELECTION_PREFLIGHT_SCHEMA",
    "STRENGTH_FIRST_QAT_SELECTION_REGISTRY_RELATIVE_PATH",
    "STRENGTH_FIRST_QAT_SELECTION_REGISTRY_SCHEMA",
    "StrengthFirstQatSelectionPreflightReceipt",
    "call_strength_first_selection_reader",
    "preflight_strength_first_qat_selection",
]
