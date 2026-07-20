"""Exact, training-only bridge for the strength-first Floodgate artifacts.

The plan named below is intentionally absent until the real 24,000-parent
teacher run finishes. A later data-only change can add that one exact plan.
This bridge then rechecks the fixed local inputs, reuses the existing neutral
input/completion/train scanner, and issues only the three warm-training
contracts. It never reads selection or holdout labels and has no selection,
promotion, or live-weight authority.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
import copy
import hashlib
import os
from pathlib import Path
from typing import Any

import fresh_qat_parent_accounting_v2 as ACCOUNTING
import fresh_qat_protocol as FRESH


STRENGTH_FIRST_QAT_EXECUTION_PLAN_V2_SCHEMA = (
    "shogi-floodgate-strength-first-qat-training-plan-v2"
)
STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA = (
    "shogi-floodgate-strength-first-qat-training-plan-v3"
)
STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA = (
    "shogi-floodgate-strength-first-qat-training-result-v2"
)
STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA = (
    "shogi-floodgate-strength-first-qat-final-checkpoint-v2"
)
STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH = (
    "ml/protocols/" "floodgate-q1-2026-strength-first-qat-training-plan.json"
)
STRENGTH_FIRST_QAT_PLAN_STATUS = (
    "exact-24000-teacher-artifacts-ready-for-three-seed-training"
)
STRENGTH_FIRST_QAT_RUN_ROOT = "ml/runs/floodgate-q1-2026-strength-first-int16-aware"
STRENGTH_FIRST_TRAIN_FORMAT = "canonical-shogi-sibling-v1-jsonl-one-lf-per-row"
STRENGTH_FIRST_ROLE_BUNDLE_SCHEMA = "shogi-floodgate-label-free-role-bundle-v2"
STRENGTH_FIRST_ROLE_BUNDLE_STATUS = "complete-label-free-role-bundle"
STRENGTH_FIRST_TEACHER_MANIFEST_SCHEMA = (
    "shogi-strength-first-sibling-teacher-manifest-v1"
)
STRENGTH_FIRST_TEACHER_RESULT_SCHEMA = (
    "shogi-floodgate-strength-first-teacher-postflight-result-v2"
)
STRENGTH_FIRST_TEACHER_RESULT_STATUS = "complete-training-only-postflight-bound"
STRENGTH_FIRST_V9_TEACHER_RESULT_SCHEMA = (
    "shogi-floodgate-strength-first-v9-teacher-result-v1"
)
STRENGTH_FIRST_V9_TEACHER_RESULT_STATUS = (
    "complete-training-only-fast-input-postflight-bound"
)
STRENGTH_FIRST_V8_PROVENANCE_SUMMARY_SCHEMA = (
    "shogi-floodgate-strength-first-v8-downstream-provenance-v1"
)
STRENGTH_FIRST_V8_PROVENANCE_SUMMARY_STATUS = (
    "verified-v8-teacher-source-ready-for-training-plan-review"
)
STRENGTH_FIRST_V9_PROVENANCE_SUMMARY_SCHEMA = (
    "shogi-floodgate-strength-first-v9-downstream-provenance-v1"
)
STRENGTH_FIRST_V9_PROVENANCE_SUMMARY_STATUS = (
    "verified-v9-teacher-source-ready-for-training-plan-review"
)
STRENGTH_FIRST_V8_MILESTONE_TARGETS = [100, 500]

_TEACHER_RUN_DIRECTORIES = {
    "v8": ".codex/shogi-runs/floodgate-q1-2026-strength-first-v8",
    "v9": ".codex/shogi-runs/floodgate-q1-2026-strength-first-v9",
}
_ROLE_BUNDLE_DIRECTORY = (
    ".codex/shogi-bundles/floodgate-q1-2026-label-free-role-bundle-v2"
)
_SEALED_INPUT_DIRECTORY = ".codex/shogi-data/wcsc36-sealed-training-inputs"
_TRAINING_PYTHON = ".codex/shogi-data/floodgate-training-venv/bin/python3"
_PROVENANCE_NODE = ".nvm/versions/node/v22.13.0/bin/node"
_PLAN_FIELDS = {
    "schema",
    "status",
    "artifacts",
    "teacher_provenance",
    "runtime",
    "training",
    "slots",
    "boundary",
}
_ARTIFACT_FIELDS = {
    "role_bundle_manifest",
    "input_training",
    "teacher_result",
    "parent_completion",
    "model_training",
    "replay_exclusion",
    "replay",
    "warm_initializer",
}
_COMPLETION_FIELDS = {
    "path",
    "format",
    "bytes",
    "sha256",
    "records",
    "forced_parents_skipped",
    "emitted_parent_groups",
    "parent_ids_sha256",
    "forced_parent_ids_sha256",
    "emitted_parent_ids_sha256",
}
_MODEL_FIELDS = {
    "path",
    "format",
    "bytes",
    "sha256",
    "records",
    "parents",
    "games",
    "game_ids_sha256",
    "parent_ids_sha256",
    "semantic_position_ids_count",
    "semantic_position_ids_sha256",
}
_REPLAY_EXCLUSION_FIELDS = {
    "path",
    "format",
    "bytes",
    "sha256",
    "count",
    "identifiers_sha256",
}
_RUNTIME_FIELDS = {
    "platform",
    "system",
    "machine",
    "processor",
    "cpu_model",
    "logical_cpu_count",
    "device",
    "python_version",
    "torch_version",
    "torch_threads",
    "torch_interop_threads",
    "deterministic_algorithms",
    "deterministic_debug_mode",
}
_BOUNDARY = {
    "training_only": True,
    "selection_label_read_authorized": False,
    "holdout_label_read_authorized": False,
    "candidate_selection_authorized": False,
    "production_weight_write_authorized": False,
}
_FORCED_SKIP_REASON_FIELDS = {
    "fewer_than_two_legal_moves",
    "search_timeout_no_label",
}
_V9_FORCED_SKIP_REASON_FIELD = "proposal_incomplete_no_label"
_TIMEOUT_SKIP_DIVISOR = 1_000
_V8_TEACHER_RESULT_FIELDS = {
    "schema",
    "status",
    "claim_boundary",
    "runner",
    "production_asset_preflight",
    "authenticated_input",
    "consumer_postflight",
    "teacher",
    "milestones",
    "completion",
    "staged_outputs",
    "publication",
}
_V9_TEACHER_RESULT_FIELDS = _V8_TEACHER_RESULT_FIELDS - {"consumer_postflight"}
_TEACHER_COMPLETION_FIELDS = {
    "input_parents",
    "completed_parents",
    "forced_parents_skipped",
    "forced_skip_reasons",
    "emitted_parent_groups",
    "run_fingerprint",
}
_TEACHER_MILESTONE_FIELDS = {
    "targets",
    "prefix_100",
    "prefix_500",
}
_TEACHER_STAGED_OUTPUT_FIELDS = {
    "work",
    "train",
    "parent_completion",
    "manifest",
    "staged_result",
}
_TEACHER_PROVENANCE_FIELDS = {
    "schema",
    "status",
    "target_parents",
    "emitted_parent_groups",
    "forced_parents_skipped",
    "fewer_than_two_legal_moves",
    "search_timeout_no_label",
    "train_records",
    "milestone_targets",
    "local_only",
    "network_requests",
    "cloud_services",
    "live_weight_changes",
    "training_only",
    "private_identifiers_disclosed",
    "private_digests_disclosed",
}
_V9_TEACHER_PROVENANCE_FIELDS = (
    _TEACHER_PROVENANCE_FIELDS | {_V9_FORCED_SKIP_REASON_FIELD}
)


def _validate_teacher_provenance_summary(value: Any) -> dict[str, Any]:
    """Validate the privacy-safe output of the sole TypeScript authority."""

    if type(value) is not dict:
        raise ValueError("strength-first teacher provenance summary mismatch")
    if (
        value.get("schema") == STRENGTH_FIRST_V8_PROVENANCE_SUMMARY_SCHEMA
        and value.get("status") == STRENGTH_FIRST_V8_PROVENANCE_SUMMARY_STATUS
    ):
        generation = "v8"
        fields = _TEACHER_PROVENANCE_FIELDS
    elif (
        value.get("schema") == STRENGTH_FIRST_V9_PROVENANCE_SUMMARY_SCHEMA
        and value.get("status") == STRENGTH_FIRST_V9_PROVENANCE_SUMMARY_STATUS
    ):
        generation = "v9"
        fields = _V9_TEACHER_PROVENANCE_FIELDS
    else:
        raise ValueError("strength-first teacher provenance summary mismatch")
    summary = _exact(
        value,
        fields,
        f"strength-first {generation} teacher provenance summary",
    )
    proposal_incomplete = summary.get(_V9_FORCED_SKIP_REASON_FIELD, 0)
    if (
        type(summary["target_parents"]) is not int
        or summary["target_parents"] != ACCOUNTING.FRESH_QAT_INPUT_PARENTS
        or type(summary["emitted_parent_groups"]) is not int
        or summary["emitted_parent_groups"] < 1
        or type(summary["forced_parents_skipped"]) is not int
        or summary["forced_parents_skipped"] < 0
        or summary["emitted_parent_groups"] + summary["forced_parents_skipped"]
        != summary["target_parents"]
        or type(summary["fewer_than_two_legal_moves"]) is not int
        or summary["fewer_than_two_legal_moves"] < 0
        or type(summary["search_timeout_no_label"]) is not int
        or summary["search_timeout_no_label"] < 0
        or type(proposal_incomplete) is not int
        or proposal_incomplete < 0
        or summary["fewer_than_two_legal_moves"]
        + summary["search_timeout_no_label"]
        + proposal_incomplete
        != summary["forced_parents_skipped"]
        or summary["search_timeout_no_label"] + proposal_incomplete
        > (
            summary["target_parents"] + _TIMEOUT_SKIP_DIVISOR - 1
        )
        // _TIMEOUT_SKIP_DIVISOR
        or type(summary["train_records"]) is not int
        or summary["train_records"] < summary["emitted_parent_groups"] * 2
        or not _typed_equal(
            summary["milestone_targets"],
            STRENGTH_FIRST_V8_MILESTONE_TARGETS,
        )
        or summary["local_only"] is not True
        or summary["network_requests"] != 0
        or type(summary["network_requests"]) is not int
        or summary["cloud_services"] != 0
        or type(summary["cloud_services"]) is not int
        or summary["live_weight_changes"] != 0
        or type(summary["live_weight_changes"]) is not int
        or summary["training_only"] is not True
        or summary["private_identifiers_disclosed"] is not False
        or summary["private_digests_disclosed"] is not False
    ):
        raise ValueError("strength-first teacher provenance summary mismatch")
    return summary


def _teacher_generation(summary: Mapping[str, Any]) -> str:
    validated = _validate_teacher_provenance_summary(summary)
    return (
        "v9"
        if validated["schema"] == STRENGTH_FIRST_V9_PROVENANCE_SUMMARY_SCHEMA
        else "v8"
    )


def _exact(value: Any, fields: set[str], label: str) -> dict[str, Any]:
    if type(value) is not dict or set(value) != fields:
        raise ValueError(f"{label} fields are not exact")
    return value


def _sha256(value: Any, label: str) -> str:
    if (
        type(value) is not str
        or len(value) != 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise ValueError(f"{label} is not a lowercase SHA-256")
    return value


def _typed_equal(value: Any, expected: Any) -> bool:
    if type(value) is not type(expected):
        return False
    if type(expected) is dict:
        return set(value) == set(expected) and all(
            _typed_equal(value[key], expected[key]) for key in expected
        )
    if type(expected) is list:
        return len(value) == len(expected) and all(
            _typed_equal(left, right) for left, right in zip(value, expected)
        )
    return value == expected


def _validate_forced_skip_reasons(
    value: Any,
    *,
    forced_parents_skipped: int,
    target_parents: int,
    label: str,
    teacher_generation: str = "v8",
) -> dict[str, int]:
    allowed_fields = _FORCED_SKIP_REASON_FIELDS
    if (
        teacher_generation == "v9"
        and type(value) is dict
        and _V9_FORCED_SKIP_REASON_FIELD in value
    ):
        allowed_fields = allowed_fields | {_V9_FORCED_SKIP_REASON_FIELD}
    reasons = _exact(value, allowed_fields, label)
    proposal_incomplete = reasons.get(_V9_FORCED_SKIP_REASON_FIELD, 0)
    if (
        teacher_generation not in {"v8", "v9"}
        or type(target_parents) is not int
        or target_parents <= 0
        or type(forced_parents_skipped) is not int
        or forced_parents_skipped < 0
        or any(type(count) is not int or count < 0 for count in reasons.values())
        or sum(reasons.values()) != forced_parents_skipped
        or reasons["search_timeout_no_label"] + proposal_incomplete
        > (target_parents + _TIMEOUT_SKIP_DIVISOR - 1) // _TIMEOUT_SKIP_DIVISOR
    ):
        raise ValueError(f"{label} accounting mismatch")
    return reasons


def scan_strength_first_training_artifacts_exact(
    input_raw: Any,
    completion_raw: Any,
    train_raw: Any,
    *,
    expected_input_binding: Mapping[str, Any],
    expected_completion_binding: Mapping[str, Any],
) -> dict[str, Any]:
    """Recompute the frozen v2 row accounting without changing that module."""

    binding = ACCOUNTING._normalize_input_binding(expected_input_binding)
    completion_binding = ACCOUNTING._normalize_completion_binding(
        expected_completion_binding
    )
    input_order, input_metadata, input_summary = ACCOUNTING._scan_input_bytes(
        input_raw, binding
    )
    (
        completion,
        forced_order,
        completion_emitted_order,
        completion_records,
    ) = ACCOUNTING._scan_completion_bytes(
        completion_raw,
        completion_binding,
        input_order,
        input_metadata,
    )
    train, emitted_order, train_groups = ACCOUNTING._scan_train_bytes(
        train_raw, input_order, input_metadata
    )
    if emitted_order != completion_emitted_order:
        raise ValueError(
            "fresh QAT train groups differ from explicit completion dispositions"
        )
    for parent_id in input_order:
        completion_record = completion_records[parent_id]
        train_group = train_groups.get(parent_id)
        if completion_record["forced_parent_skipped"]:
            if train_group is not None:
                raise ValueError(
                    "fresh QAT forced completion unexpectedly emitted a group"
                )
            continue
        if train_group is None:
            raise ValueError(
                "fresh QAT non-forced completion is missing its train group"
            )
        if (
            train_group["records"] != completion_record["train_group_records"]
            or train_group["sha256"] != completion_record["train_group_sha256"]
        ):
            raise ValueError("fresh QAT train group differs from completion evidence")

    input_count = len(input_order)
    forced_count = len(forced_order)
    emitted_count = len(emitted_order)
    if (
        forced_count + emitted_count != input_count
        or completion["records"] != input_count
        or train["parents"] != emitted_count
    ):
        raise ValueError("fresh QAT parent accounting equation failed")
    return {
        "input_training": binding,
        "input_summary": input_summary,
        "parent_completion": completion,
        "model_training": train,
        "parent_accounting": {
            "input_parents": input_count,
            "forced_parents_skipped": forced_count,
            "emitted_parent_groups": emitted_count,
            "model_training_parents": emitted_count,
            "equation_verified": True,
            "replacement_parents": 0,
            "resampled_parents": 0,
            "emitted_order_preserved": True,
        },
    }


def _file_identity(
    value: Any,
    *,
    path: str,
    label: str,
) -> dict[str, Any]:
    identity = _exact(value, {"path", "bytes", "sha256"}, label)
    if (
        identity["path"] != path
        or type(identity["bytes"]) is not int
        or identity["bytes"] < 1
    ):
        raise ValueError(f"{label} path/bytes mismatch")
    _sha256(identity["sha256"], f"{label} SHA-256")
    return identity


def _fixed_slots() -> list[dict[str, Any]]:
    return [
        {
            "id": f"floodgate-strength-first-int16-aware-seed-{seed}",
            "seed": seed,
            "output": f"{STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{seed}",
        }
        for seed in FRESH.FRESH_QAT_SLOT_ORDER
    ]


def build_strength_first_qat_training_plan_data(
    *,
    artifacts: Mapping[str, Any],
    teacher_provenance: Mapping[str, Any],
    runtime: Mapping[str, Any],
) -> dict[str, Any]:
    """Build and validate one exact training-only plan data object."""

    generation = _teacher_generation(teacher_provenance)
    plan = {
        "schema": (
            STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA
            if generation == "v9"
            else STRENGTH_FIRST_QAT_EXECUTION_PLAN_V2_SCHEMA
        ),
        "status": STRENGTH_FIRST_QAT_PLAN_STATUS,
        "artifacts": copy.deepcopy(artifacts),
        "teacher_provenance": copy.deepcopy(teacher_provenance),
        "runtime": copy.deepcopy(runtime),
        "training": copy.deepcopy(FRESH.FRESH_QAT_REQUIRED_TRAINING),
        "slots": _fixed_slots(),
        "boundary": copy.deepcopy(_BOUNDARY),
    }
    validate_strength_first_qat_training_plan_data(plan)
    return plan


def validate_strength_first_qat_training_plan_data(
    plan: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Validate the future data-only plan without reading artifacts."""

    plan = _exact(plan, _PLAN_FIELDS, "strength-first plan")
    ACCOUNTING._require_plain_json(plan, "strength-first plan")
    if plan["status"] != STRENGTH_FIRST_QAT_PLAN_STATUS:
        raise ValueError("strength-first plan schema/status mismatch")
    teacher_provenance = _validate_teacher_provenance_summary(
        plan["teacher_provenance"],
    )
    generation = _teacher_generation(teacher_provenance)
    expected_plan_schema = (
        STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA
        if generation == "v9"
        else STRENGTH_FIRST_QAT_EXECUTION_PLAN_V2_SCHEMA
    )
    if plan["schema"] != expected_plan_schema:
        raise ValueError("strength-first plan schema/source mismatch")
    artifacts = _exact(
        plan["artifacts"],
        _ARTIFACT_FIELDS,
        "strength-first plan artifacts",
    )
    _file_identity(
        artifacts["role_bundle_manifest"],
        path="manifest.json",
        label="strength-first role-bundle manifest",
    )
    _file_identity(
        artifacts["teacher_result"],
        path="result.json",
        label="strength-first teacher result",
    )
    if not _typed_equal(
        artifacts["input_training"],
        ACCOUNTING.PRODUCTION_INPUT_TRAINING_BINDING,
    ):
        raise ValueError("strength-first input differs from the fixed role bundle")

    completion = _exact(
        artifacts["parent_completion"],
        _COMPLETION_FIELDS,
        "strength-first parent completion",
    )
    if (
        completion["path"] != "parent-completion.jsonl"
        or completion["format"] != ACCOUNTING.FRESH_QAT_PARENT_COMPLETION_FORMAT
        or any(
            type(completion[field]) is not int or completion[field] < 0
            for field in (
                "bytes",
                "records",
                "forced_parents_skipped",
                "emitted_parent_groups",
            )
        )
        or completion["bytes"] < 1
        or completion["records"] != ACCOUNTING.FRESH_QAT_INPUT_PARENTS
        or completion["forced_parents_skipped"] + completion["emitted_parent_groups"]
        != completion["records"]
        or completion["emitted_parent_groups"] < 1
    ):
        raise ValueError("strength-first parent-completion accounting mismatch")
    for field in (
        "sha256",
        "parent_ids_sha256",
        "forced_parent_ids_sha256",
        "emitted_parent_ids_sha256",
    ):
        _sha256(completion[field], f"strength-first completion {field}")

    model = _exact(
        artifacts["model_training"],
        _MODEL_FIELDS,
        "strength-first model training",
    )
    if (
        model["path"] != "train.jsonl"
        or model["format"] != STRENGTH_FIRST_TRAIN_FORMAT
        or any(
            type(model[field]) is not int
            for field in (
                "bytes",
                "records",
                "parents",
                "games",
                "semantic_position_ids_count",
            )
        )
        or model["bytes"] < 1
        or model["parents"] != completion["emitted_parent_groups"]
        or model["parents"] != teacher_provenance["emitted_parent_groups"]
        or model["records"] < model["parents"] * 2
        or model["records"] != teacher_provenance["train_records"]
        or not 1 <= model["games"] <= ACCOUNTING.FRESH_QAT_INPUT_GAMES
        or model["semantic_position_ids_count"] < model["parents"]
    ):
        raise ValueError("strength-first model-training accounting mismatch")
    for field in (
        "sha256",
        "game_ids_sha256",
        "parent_ids_sha256",
        "semantic_position_ids_sha256",
    ):
        _sha256(model[field], f"strength-first model training {field}")
    if (
        completion["records"] != teacher_provenance["target_parents"]
        or completion["forced_parents_skipped"]
        != teacher_provenance["forced_parents_skipped"]
        or completion["emitted_parent_groups"]
        != teacher_provenance["emitted_parent_groups"]
    ):
        raise ValueError(
            "strength-first plan artifacts differ from teacher provenance"
        )

    exclusion = _exact(
        artifacts["replay_exclusion"],
        _REPLAY_EXCLUSION_FIELDS,
        "strength-first replay exclusion",
    )
    if (
        exclusion["path"] != "replay-excluded-position-ids.txt"
        or exclusion["format"] != FRESH.FRESH_QAT_ID_SET_FORMAT
        or type(exclusion["bytes"]) is not int
        or exclusion["bytes"] < 1
        or type(exclusion["count"]) is not int
        or exclusion["count"] < 1
    ):
        raise ValueError("strength-first replay-exclusion identity mismatch")
    _sha256(exclusion["sha256"], "strength-first replay-exclusion SHA-256")
    _sha256(
        exclusion["identifiers_sha256"],
        "strength-first replay-exclusion identifier SHA-256",
    )

    replay = _file_identity(
        artifacts["replay"],
        path="runOp1-train.jsonl",
        label="strength-first replay",
    )
    initializer = _file_identity(
        artifacts["warm_initializer"],
        path="runOp1-best.pt",
        label="strength-first initializer",
    )
    if replay != {
        "path": "runOp1-train.jsonl",
        "bytes": FRESH.FRESH_QAT_REPLAY_BYTES,
        "sha256": FRESH.FRESH_QAT_REPLAY_SHA256,
    }:
        raise ValueError("strength-first fixed replay drifted")
    if initializer != {
        "path": "runOp1-best.pt",
        "bytes": FRESH.FRESH_QAT_WARM_INITIALIZER_BYTES,
        "sha256": FRESH.FRESH_QAT_WARM_INITIALIZER_SHA256,
    }:
        raise ValueError("strength-first fixed initializer drifted")
    if not _typed_equal(plan["training"], FRESH.FRESH_QAT_REQUIRED_TRAINING):
        raise ValueError("strength-first frozen training contract drifted")
    if not _typed_equal(plan["slots"], _fixed_slots()):
        raise ValueError("strength-first three-seed grid drifted")
    if not _typed_equal(plan["boundary"], _BOUNDARY):
        raise ValueError("strength-first training-only boundary drifted")

    runtime = _exact(
        plan["runtime"],
        _RUNTIME_FIELDS,
        "strength-first runtime",
    )
    if (
        runtime["device"] != "cpu"
        or runtime["torch_threads"] != 2
        or runtime["torch_interop_threads"] != 1
        or runtime["deterministic_algorithms"] is not True
        or runtime["deterministic_debug_mode"] != "error"
    ):
        raise ValueError("strength-first deterministic CPU runtime drifted")
    return plan


def load_strength_first_qat_training_plan(
    path: str | os.PathLike[str],
) -> dict[str, Any]:
    """Load the plan, or STOP until real teacher hashes exist."""

    try:
        raw = Path(path).read_bytes()
    except OSError as error:
        raise ValueError(
            "strength-first QAT training STOP: add the exact data-only plan "
            "after the real 24,000-parent teacher artifacts exist"
        ) from error
    plan = ACCOUNTING._strict_json_loads(
        raw.decode("utf-8"),
        "strength-first plan",
    )
    validate_strength_first_qat_training_plan_data(plan)
    return copy.deepcopy(plan)


def default_strength_first_local_paths(
    *,
    repo_root: str | os.PathLike[str] | None = None,
    home: str | os.PathLike[str] | None = None,
    teacher_generation: str = "v8",
) -> dict[str, str]:
    """Resolve every fixed path used by the argumentless local launcher."""

    if teacher_generation not in _TEACHER_RUN_DIRECTORIES:
        raise ValueError("strength-first teacher generation is unsupported")
    root = Path(
        repo_root if repo_root is not None else Path(__file__).resolve().parent.parent
    ).resolve()
    home_root = Path(home if home is not None else Path.home()).expanduser()
    teacher = home_root / _TEACHER_RUN_DIRECTORIES[teacher_generation]
    role = home_root / _ROLE_BUNDLE_DIRECTORY
    sealed = home_root / _SEALED_INPUT_DIRECTORY
    return {
        "repo_root": str(root),
        "experiment_plan": str(root / STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH),
        "teacher_manifest": str(teacher / "manifest.json"),
        "teacher_result": str(teacher / "result.json"),
        "teacher_work": str(teacher / "work.jsonl"),
        "teacher_staged_result": str(teacher / "staged-result.json"),
        "teacher_milestone_100": str(teacher / "milestone-100.json"),
        "teacher_milestone_500": str(teacher / "milestone-500.json"),
        "parent_completion": str(teacher / "parent-completion.jsonl"),
        "model_training": str(teacher / "train.jsonl"),
        "role_bundle_manifest": str(role / "manifest.json"),
        "input_training": str(role / "training.raw.jsonl"),
        "holdout_protected_position_ids": str(
            role / "fresh-final-holdout.protected-position-ids.txt"
        ),
        "policy_exposure_receipt": str(role / "replay-exclusion-receipt.json"),
        "policy_exposed_parent_ids": str(role / "training.protected-position-ids.txt"),
        "policy_exposed_semantic_position_ids": str(
            role / "fresh-selection.protected-position-ids.txt"
        ),
        "replay_exclusion": str(role / "replay-excluded-position-ids.txt"),
        "replay": str(sealed / "runOp1-train.jsonl"),
        "warm_initializer": str(sealed / "runOp1-best.pt"),
        "python": str(home_root / _TRAINING_PYTHON),
        "provenance_node": str(home_root / _PROVENANCE_NODE),
        "v8_provenance_node": str(home_root / _PROVENANCE_NODE),
    }


def _same_path(value: Any, expected: str, label: str) -> None:
    if (
        type(value) is not str
        or os.path.abspath(value) != expected
        or os.path.realpath(value) != expected
    ):
        raise ValueError(f"strength-first {label} path mismatch")


def _read_bound(
    path: str,
    identity: Mapping[str, Any],
    label: str,
    reader: Callable[[str], bytes],
) -> bytes:
    raw = reader(path)
    if (
        type(raw) is not bytes
        or len(raw) != identity["bytes"]
        or hashlib.sha256(raw).hexdigest() != identity["sha256"]
    ):
        raise ValueError(f"strength-first {label} identity mismatch")
    return raw


def _verify_fingerprint(
    path: str,
    identity: Mapping[str, Any],
    label: str,
) -> None:
    digest = hashlib.sha256()
    size = 0
    try:
        with open(path, "rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                size += len(block)
                digest.update(block)
    except OSError as error:
        raise ValueError(f"strength-first {label} cannot be read") from error
    if size != identity["bytes"] or digest.hexdigest() != identity["sha256"]:
        raise ValueError(f"strength-first {label} identity mismatch")


def _validate_role_manifest(
    manifest: Any,
    artifacts: Mapping[str, Any],
) -> None:
    if (
        type(manifest) is not dict
        or manifest.get("schema") != STRENGTH_FIRST_ROLE_BUNDLE_SCHEMA
        or manifest.get("status") != STRENGTH_FIRST_ROLE_BUNDLE_STATUS
    ):
        raise ValueError("strength-first role-bundle manifest mismatch")
    provenance = manifest.get("provenance")
    if type(provenance) is not dict or any(
        provenance.get(field) is not False
        for field in (
            "labeled_final_holdout_read",
            "labeled_selection_read",
            "teacher_or_candidate_scores_read",
        )
    ):
        raise ValueError("strength-first role bundle is not label-free")
    expected_input = dict(artifacts["input_training"])
    expected_input["records"] = expected_input.pop("parents")
    roles = manifest.get("roles")
    training = roles.get("training") if type(roles) is dict else None
    raw_parents = training.get("raw_parents") if type(training) is dict else None
    if not _typed_equal(
        raw_parents,
        expected_input,
    ):
        raise ValueError("strength-first role-bundle input differs")
    replay_exclusion = manifest.get("replay_exclusion")
    identifiers = (
        replay_exclusion.get("identifiers") if type(replay_exclusion) is dict else None
    )
    if not _typed_equal(
        identifiers,
        artifacts["replay_exclusion"],
    ):
        raise ValueError("strength-first role-bundle replay exclusion differs")


def _identity_projection(identity: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "path": identity["path"],
        "bytes": identity["bytes"],
        "sha256": identity["sha256"],
    }


def _validate_teacher_documents(
    manifest: Any,
    result: Any,
    artifacts: Mapping[str, Any],
    teacher_provenance: Mapping[str, Any],
) -> dict[str, dict[str, Any]]:
    """Recheck the versioned envelope and hashes proved by the TS core.

    The TypeScript verifier is the sole row-semantic authority. Python keeps
    this deliberately small: it binds the reviewed privacy-safe summary and
    plan artifacts to the outer result, then returns the private file
    identities that the caller must hash again immediately before training.
    """

    summary = _validate_teacher_provenance_summary(teacher_provenance)
    generation = _teacher_generation(summary)
    if (
        type(manifest) is not dict
        or manifest.get("schema") != STRENGTH_FIRST_TEACHER_MANIFEST_SCHEMA
        or manifest.get("status") != "complete-training-only"
    ):
        raise ValueError("strength-first teacher manifest mismatch")
    outputs = manifest.get("outputs")
    if (
        type(outputs) is not dict
        or set(outputs) != {"train"}
        or not _typed_equal(
            outputs["train"],
            artifacts["model_training"],
        )
        or not _typed_equal(
            manifest.get("parent_completion"),
            artifacts["parent_completion"],
        )
    ):
        raise ValueError("strength-first teacher manifest output binding mismatch")
    manifest_skip_reasons = _validate_forced_skip_reasons(
        manifest.get("forced_skip_reasons"),
        forced_parents_skipped=artifacts["parent_completion"]["forced_parents_skipped"],
        target_parents=artifacts["parent_completion"]["records"],
        label="strength-first teacher manifest forced skip reasons",
        teacher_generation=generation,
    )

    result = _exact(
        result,
        (
            _V9_TEACHER_RESULT_FIELDS
            if generation == "v9"
            else _V8_TEACHER_RESULT_FIELDS
        ),
        "strength-first teacher result",
    )
    expected_result_schema = (
        STRENGTH_FIRST_V9_TEACHER_RESULT_SCHEMA
        if generation == "v9"
        else STRENGTH_FIRST_TEACHER_RESULT_SCHEMA
    )
    expected_result_status = (
        STRENGTH_FIRST_V9_TEACHER_RESULT_STATUS
        if generation == "v9"
        else STRENGTH_FIRST_TEACHER_RESULT_STATUS
    )
    if (
        result["schema"] != expected_result_schema
        or result["status"] != expected_result_status
    ):
        raise ValueError("strength-first teacher result schema/status mismatch")
    runner = result["runner"]
    if (
        type(runner) is not dict
        or runner.get("local_only") is not summary["local_only"]
        or runner.get("network_requests") != summary["network_requests"]
        or not _typed_equal(runner.get("cloud_services"), [])
        or summary["cloud_services"] != 0
        or runner.get("live_weight_changes")
        != summary["live_weight_changes"]
    ):
        raise ValueError("strength-first teacher result execution boundary mismatch")
    completion = _exact(
        result["completion"],
        _TEACHER_COMPLETION_FIELDS,
        "strength-first teacher result completion",
    )
    _validate_forced_skip_reasons(
        completion["forced_skip_reasons"],
        forced_parents_skipped=completion["forced_parents_skipped"],
        target_parents=completion["completed_parents"],
        label="strength-first teacher result forced skip reasons",
        teacher_generation=generation,
    )
    if (
        completion["input_parents"] != summary["target_parents"]
        or completion["completed_parents"] != summary["target_parents"]
        or completion["forced_parents_skipped"]
        != summary["forced_parents_skipped"]
        or not _typed_equal(
            completion["forced_skip_reasons"],
            manifest_skip_reasons,
        )
        or completion["forced_skip_reasons"]["fewer_than_two_legal_moves"]
        != summary["fewer_than_two_legal_moves"]
        or completion["forced_skip_reasons"]["search_timeout_no_label"]
        != summary["search_timeout_no_label"]
        or completion["forced_skip_reasons"].get(
            _V9_FORCED_SKIP_REASON_FIELD,
            0,
        )
        != summary.get(_V9_FORCED_SKIP_REASON_FIELD, 0)
        or completion["emitted_parent_groups"]
        != summary["emitted_parent_groups"]
        or completion["forced_parents_skipped"] + completion["emitted_parent_groups"]
        != completion["completed_parents"]
    ):
        raise ValueError("strength-first teacher result completion mismatch")
    _sha256(
        completion["run_fingerprint"],
        "strength-first teacher result run fingerprint",
    )

    milestones = _exact(
        result["milestones"],
        _TEACHER_MILESTONE_FIELDS,
        "strength-first teacher milestones",
    )
    if not _typed_equal(
        milestones["targets"],
        [
            *summary["milestone_targets"],
            summary["target_parents"],
        ],
    ):
        raise ValueError("strength-first teacher milestone targets mismatch")
    staged = _exact(
        result["staged_outputs"],
        _TEACHER_STAGED_OUTPUT_FIELDS,
        "strength-first teacher staged outputs",
    )
    bindings = {
        "teacher_milestone_100": _file_identity(
            milestones["prefix_100"],
            path="milestone-100.json",
            label="strength-first teacher milestone 100",
        ),
        "teacher_milestone_500": _file_identity(
            milestones["prefix_500"],
            path="milestone-500.json",
            label="strength-first teacher milestone 500",
        ),
        "teacher_work": _file_identity(
            staged["work"],
            path="work.jsonl",
            label="strength-first teacher staged work",
        ),
        "model_training": _file_identity(
            staged["train"],
            path="train.jsonl",
            label="strength-first teacher staged train",
        ),
        "parent_completion": _file_identity(
            staged["parent_completion"],
            path="parent-completion.jsonl",
            label="strength-first teacher staged parent completion",
        ),
        "teacher_manifest": _file_identity(
            staged["manifest"],
            path="manifest.json",
            label="strength-first teacher staged manifest",
        ),
        "teacher_staged_result": _file_identity(
            staged["staged_result"],
            path="staged-result.json",
            label="strength-first teacher staged result",
        ),
    }
    if (
        not _typed_equal(
            bindings["model_training"],
            _identity_projection(artifacts["model_training"]),
        )
        or not _typed_equal(
            bindings["parent_completion"],
            _identity_projection(artifacts["parent_completion"]),
        )
    ):
        raise ValueError(
            "strength-first teacher staged training artifacts differ from plan"
        )
    return bindings


def validate_strength_first_qat_training_source_documents(
    *,
    role_manifest: Any,
    teacher_manifest: Any,
    teacher_result: Any,
    teacher_provenance: Mapping[str, Any],
    artifacts: Mapping[str, Any],
) -> dict[str, dict[str, Any]]:
    """Cross-bind the label-free role and terminal teacher documents."""

    _validate_role_manifest(role_manifest, artifacts)
    return _validate_teacher_documents(
        teacher_manifest,
        teacher_result,
        artifacts,
        teacher_provenance,
    )


def _verify_strength_first_qat_training_plan(
    args: Any,
    training_runtime: Mapping[str, Any],
    *,
    tracking_verifier: Callable[[str, str], None],
    repo_root: str,
    local_paths: Mapping[str, str],
    artifact_reader: Callable[[str], bytes],
    fingerprint_verifier: Callable[[str, Mapping[str, Any], str], None],
) -> dict[str, Any]:
    root = os.path.realpath(repo_root)
    expected_plan = os.path.join(
        root,
        *STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH.split("/"),
    )
    _same_path(
        getattr(args, "experiment_plan", None),
        expected_plan,
        "plan",
    )
    plan_raw = artifact_reader(expected_plan)
    plan = ACCOUNTING._strict_json_loads(
        plan_raw.decode("utf-8"),
        "strength-first plan",
    )
    validate_strength_first_qat_training_plan_data(plan)
    revision = getattr(args, "pipeline_revision", None)
    if type(revision) is not str or not revision:
        raise ValueError("strength-first pipeline revision is required")
    tracking_verifier(expected_plan, revision)
    if artifact_reader(expected_plan) != plan_raw:
        raise ValueError("strength-first plan changed during verification")

    argument_paths = {
        "data": "model_training",
        "sibling_manifest": "teacher_manifest",
        "validation_partition_manifest": "role_bundle_manifest",
        "holdout_protected_position_ids": "holdout_protected_position_ids",
        "policy_exposure_receipt": "policy_exposure_receipt",
        "policy_exposed_parent_ids": "policy_exposed_parent_ids",
        "policy_exposed_semantic_position_ids": (
            "policy_exposed_semantic_position_ids"
        ),
        "replay_data": "replay",
        "replay_excluded_position_ids": "replay_exclusion",
        "init_ckpt": "warm_initializer",
    }
    for argument, path_name in argument_paths.items():
        _same_path(
            getattr(args, argument, None),
            local_paths[path_name],
            argument,
        )
    if getattr(args, "val_data", None):
        raise ValueError("strength-first training may not receive selection labels")
    if getattr(args, "experiment_family", None) != "int16-aware":
        raise ValueError("strength-first experiment family mismatch")
    if type(training_runtime) is not dict or any(
        type(training_runtime.get(field)) is not type(expected)
        or training_runtime.get(field) != expected
        for field, expected in plan["runtime"].items()
    ):
        raise ValueError("strength-first runtime differs from the exact plan")

    selected = next(
        (slot for slot in plan["slots"] if slot["seed"] == args.seed),
        None,
    )
    if selected is None:
        raise ValueError("strength-first seed is not registered")
    _same_path(
        getattr(args, "out", None),
        os.path.join(root, *selected["output"].split("/")),
        "output",
    )

    artifacts = plan["artifacts"]
    role_raw = _read_bound(
        local_paths["role_bundle_manifest"],
        artifacts["role_bundle_manifest"],
        "role-bundle manifest",
        artifact_reader,
    )
    _validate_role_manifest(
        ACCOUNTING._strict_json_loads(
            role_raw.decode("utf-8"),
            "strength-first role-bundle manifest",
        ),
        artifacts,
    )
    teacher_result_raw = _read_bound(
        local_paths["teacher_result"],
        artifacts["teacher_result"],
        "teacher result",
        artifact_reader,
    )
    teacher_result = ACCOUNTING._strict_json_loads(
        teacher_result_raw.decode("utf-8"),
        "strength-first teacher result",
    )
    staged = (
        teacher_result.get("staged_outputs")
        if type(teacher_result) is dict
        else None
    )
    if type(staged) is not dict:
        raise ValueError("strength-first teacher staged outputs are absent")
    teacher_manifest_identity = _file_identity(
        staged.get("manifest"),
        path="manifest.json",
        label="strength-first teacher staged manifest",
    )
    teacher_manifest_raw = _read_bound(
        local_paths["teacher_manifest"],
        teacher_manifest_identity,
        "teacher manifest",
        artifact_reader,
    )
    input_raw = _read_bound(
        local_paths["input_training"],
        artifacts["input_training"],
        "input training",
        artifact_reader,
    )
    completion_raw = _read_bound(
        local_paths["parent_completion"],
        artifacts["parent_completion"],
        "parent completion",
        artifact_reader,
    )
    train_raw = _read_bound(
        local_paths["model_training"],
        artifacts["model_training"],
        "model training",
        artifact_reader,
    )
    private_bindings = _validate_teacher_documents(
        ACCOUNTING._strict_json_loads(
            teacher_manifest_raw.decode("utf-8"),
            "strength-first teacher manifest",
        ),
        teacher_result,
        artifacts,
        plan["teacher_provenance"],
    )
    for name in (
        "teacher_work",
        "teacher_staged_result",
        "teacher_milestone_100",
        "teacher_milestone_500",
    ):
        fingerprint_verifier(
            local_paths[name],
            private_bindings[name],
            name.replace("_", " "),
        )
    for name in ("replay_exclusion", "replay", "warm_initializer"):
        fingerprint_verifier(
            local_paths[name],
            artifacts[name],
            name.replace("_", " "),
        )

    accounting = scan_strength_first_training_artifacts_exact(
        input_raw,
        completion_raw,
        train_raw,
        expected_input_binding=artifacts["input_training"],
        expected_completion_binding=artifacts["parent_completion"],
    )
    actual_model = {
        "path": "train.jsonl",
        "format": STRENGTH_FIRST_TRAIN_FORMAT,
        **accounting["model_training"],
    }
    if (
        not _typed_equal(
            accounting["input_training"],
            artifacts["input_training"],
        )
        or not _typed_equal(
            accounting["parent_completion"],
            artifacts["parent_completion"],
        )
        or not _typed_equal(actual_model, artifacts["model_training"])
        or accounting["parent_accounting"]["input_parents"]
        != ACCOUNTING.FRESH_QAT_INPUT_PARENTS
    ):
        raise ValueError("strength-first exact source accounting mismatch")

    contract = FRESH.build_fresh_qat_training_contract(
        {"inputs": {"model_training": accounting["model_training"]}},
        selected,
    )
    return {
        "provenance": {
            "path": expected_plan,
            "bytes": len(plan_raw),
            "sha256": hashlib.sha256(plan_raw).hexdigest(),
            "schema": plan["schema"],
            "slot_id": selected["id"],
            "slot_output": selected["output"],
            "teacher_result_sha256": artifacts["teacher_result"]["sha256"],
            "teacher_provenance_schema": plan["teacher_provenance"]["schema"],
            "teacher_provenance_status": plan["teacher_provenance"]["status"],
            "parent_completion_sha256": artifacts["parent_completion"]["sha256"],
            **accounting["parent_accounting"],
        },
        "contract": contract,
        "replay_exclusion": copy.deepcopy(artifacts["replay_exclusion"]),
        "boundary": copy.deepcopy(_BOUNDARY),
    }


def verify_strength_first_qat_training_plan(
    args: Any,
    training_runtime: Mapping[str, Any],
    *,
    tracking_verifier: Callable[[str, str], None],
) -> dict[str, Any]:
    """Verify the fixed local artifacts and issue one training-only binding."""

    root = os.path.realpath(Path(__file__).resolve().parent.parent)
    plan_path = os.path.join(
        root,
        *STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH.split("/"),
    )
    plan = load_strength_first_qat_training_plan(plan_path)
    generation = _teacher_generation(plan["teacher_provenance"])
    return _verify_strength_first_qat_training_plan(
        args,
        training_runtime,
        tracking_verifier=tracking_verifier,
        repo_root=root,
        local_paths=default_strength_first_local_paths(
            repo_root=root,
            teacher_generation=generation,
        ),
        artifact_reader=lambda path: Path(path).read_bytes(),
        fingerprint_verifier=_verify_fingerprint,
    )


__all__ = [
    "STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH",
    "STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA",
    "STRENGTH_FIRST_QAT_EXECUTION_PLAN_V2_SCHEMA",
    "STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA",
    "STRENGTH_FIRST_QAT_PLAN_STATUS",
    "STRENGTH_FIRST_QAT_RUN_ROOT",
    "STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA",
    "STRENGTH_FIRST_TEACHER_MANIFEST_SCHEMA",
    "STRENGTH_FIRST_TEACHER_RESULT_SCHEMA",
    "STRENGTH_FIRST_TEACHER_RESULT_STATUS",
    "STRENGTH_FIRST_V9_TEACHER_RESULT_SCHEMA",
    "STRENGTH_FIRST_V9_TEACHER_RESULT_STATUS",
    "STRENGTH_FIRST_TRAIN_FORMAT",
    "STRENGTH_FIRST_V8_MILESTONE_TARGETS",
    "STRENGTH_FIRST_V8_PROVENANCE_SUMMARY_SCHEMA",
    "STRENGTH_FIRST_V8_PROVENANCE_SUMMARY_STATUS",
    "STRENGTH_FIRST_V9_PROVENANCE_SUMMARY_SCHEMA",
    "STRENGTH_FIRST_V9_PROVENANCE_SUMMARY_STATUS",
    "build_strength_first_qat_training_plan_data",
    "default_strength_first_local_paths",
    "load_strength_first_qat_training_plan",
    "validate_strength_first_qat_training_plan_data",
    "validate_strength_first_qat_training_source_documents",
    "verify_strength_first_qat_training_plan",
]
