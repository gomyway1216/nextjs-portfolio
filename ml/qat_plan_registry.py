"""Versioned QAT plan dispatch without changing the WCSC36 verifier."""

from __future__ import annotations

import os
from typing import Any, Callable, Mapping

from fresh_qat_protocol import (
    FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH,
    FRESH_QAT_EXECUTION_PLAN_SCHEMA,
    FRESH_QAT_FINAL_CHECKPOINT_SCHEMA,
    FRESH_QAT_TRAINING_CONTRACT_SCHEMA,
    FRESH_QAT_TRAINING_RESULT_SCHEMA,
    verify_fresh_qat_experiment_plan,
)
from qat_protocol import (
    QAT_FINAL_CHECKPOINT_SCHEMA,
    QAT_PLAN_SCHEMA,
    QAT_TRAINING_CONTRACT_SCHEMA,
    QAT_TRAINING_RESULT_SCHEMA,
    verify_qat_experiment_plan as verify_wcsc36_qat_experiment_plan,
)


def verify_qat_experiment_plan(
    args: Any,
    training_runtime: Mapping[str, Any],
    *,
    tracking_verifier: Callable[[str, str], None],
) -> dict[str, Any]:
    """Dispatch only the exact fresh path; preserve every old fallback."""
    repo_root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
    fresh_path = os.path.join(repo_root, FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH)
    plan_argument = getattr(args, "experiment_plan", "")
    requested = (
        os.path.realpath(plan_argument)
        if isinstance(plan_argument, (str, bytes, os.PathLike))
        else None
    )
    if requested == fresh_path:
        return verify_fresh_qat_experiment_plan(
            args,
            training_runtime,
            tracking_verifier=tracking_verifier,
        )
    return verify_wcsc36_qat_experiment_plan(
        args,
        training_runtime,
        tracking_verifier=tracking_verifier,
    )


def resolve_qat_artifact_schemas(
    binding: Mapping[str, Any],
) -> dict[str, str]:
    """Resolve only an exact legacy or fresh plan/contract schema pair."""
    if type(binding) is not dict:
        raise ValueError("QAT plan binding must be an object")
    provenance = binding.get("provenance")
    contract = binding.get("contract")
    if type(provenance) is not dict or type(contract) is not dict:
        raise ValueError("QAT plan binding is missing plan/contract objects")
    schema_pair = (provenance.get("schema"), contract.get("schema"))
    if schema_pair == (QAT_PLAN_SCHEMA, QAT_TRAINING_CONTRACT_SCHEMA):
        return {
            "result": QAT_TRAINING_RESULT_SCHEMA,
            "checkpoint": QAT_FINAL_CHECKPOINT_SCHEMA,
        }
    if schema_pair == (
        FRESH_QAT_EXECUTION_PLAN_SCHEMA,
        FRESH_QAT_TRAINING_CONTRACT_SCHEMA,
    ):
        return {
            "result": FRESH_QAT_TRAINING_RESULT_SCHEMA,
            "checkpoint": FRESH_QAT_FINAL_CHECKPOINT_SCHEMA,
        }
    raise ValueError(
        "QAT plan/contract artifact-schema pair is unknown or hybrid: "
        f"{schema_pair!r}"
    )


__all__ = ["resolve_qat_artifact_schemas", "verify_qat_experiment_plan"]
