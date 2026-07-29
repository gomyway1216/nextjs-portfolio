#!/usr/bin/env python3
"""Validate the prospective exact-source tune-membership clarification."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


RELATIVE_PATH = (
    "ml/protocols/"
    "child-board-root-policy-student-tune-membership-v1.json"
)
BYTES = 3_428
SHA256 = "73e5af6081ed38108fd38b0b97405bbe22f27298f961610d2797352e90cc817b"
SCHEMA = (
    "shogi-child-board-root-policy-student-tune-"
    "membership-clarification-v1"
)
STATUS = "prospective-pre-tune-source-membership-fixed-unopened"


class ClarificationError(ValueError):
    """The prospective clarification bytes or critical semantics drifted."""


def validate(repo_root: Path) -> dict[str, Any]:
    path = repo_root / RELATIVE_PATH
    raw = path.read_bytes()
    if len(raw) != BYTES or hashlib.sha256(raw).hexdigest() != SHA256:
        raise ClarificationError("tune membership clarification identity drift")
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ClarificationError("tune membership clarification is invalid") from error
    tune = value.get("tune_membership")
    state = value.get("protected_state_at_registration")
    if (
        value.get("schema") != SCHEMA
        or value.get("status") != STATUS
        or type(tune) is not dict
        or type(state) is not dict
        or tune.get("browser_tune", {}).get("parents") != 196
        or tune.get("browser_tune", {}).get("projected_source_moves")
        != 16_564
        or tune.get("browser_tune", {}).get("new_moves_added") != 0
        or tune.get("v9_tune", {}).get("parents") != 4_411
        or tune.get("v9_tune", {}).get("projected_source_moves") != 51_306
        or tune.get("v9_tune", {}).get("new_moves_added") != 0
        or tune.get("v9_tune", {}).get("candidate_subset_only") is not True
        or any(
            state.get(key) is not False
            for key in (
                "student_terminal_result_complete",
                "production_build_receipt_complete",
                "tune_opened",
                "sealed_labels_generated",
                "sealed_scores_opened",
                "live_weights_changed",
            )
        )
        or state.get("formal_games_played") != 0
        or state.get("external_games_played") != 0
    ):
        raise ClarificationError("tune membership clarification contract drift")
    return value
