"""Versioned QAT plan dispatch without changing the WCSC36 verifier."""

from __future__ import annotations

import os
from typing import Any, Callable, Mapping

from fresh_qat_protocol import (
    FRESH_QAT_EXECUTION_PLAN_RELATIVE_PATH,
    verify_fresh_qat_experiment_plan,
)
from qat_protocol import (
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


__all__ = ["verify_qat_experiment_plan"]
