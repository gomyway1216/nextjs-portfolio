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


STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA = (
    "shogi-floodgate-strength-first-qat-training-plan-v1"
)
STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA = (
    "shogi-floodgate-strength-first-qat-training-result-v1"
)
STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA = (
    "shogi-floodgate-strength-first-qat-final-checkpoint-v1"
)
STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-strength-first-qat-training-plan.json"
)
STRENGTH_FIRST_QAT_PLAN_STATUS = (
    "exact-24000-teacher-artifacts-ready-for-three-seed-training"
)
STRENGTH_FIRST_QAT_RUN_ROOT = (
    "ml/runs/floodgate-q1-2026-strength-first-int16-aware"
)
STRENGTH_FIRST_TRAIN_FORMAT = (
    "canonical-shogi-sibling-v1-jsonl-one-lf-per-row"
)
STRENGTH_FIRST_ROLE_BUNDLE_SCHEMA = (
    "shogi-floodgate-label-free-role-bundle-v2"
)
STRENGTH_FIRST_ROLE_BUNDLE_STATUS = "complete-label-free-role-bundle"
STRENGTH_FIRST_TEACHER_MANIFEST_SCHEMA = (
    "shogi-strength-first-sibling-teacher-manifest-v1"
)
STRENGTH_FIRST_TEACHER_RESULT_SCHEMA = (
    "shogi-floodgate-strength-first-teacher-postflight-result-v1"
)
STRENGTH_FIRST_TEACHER_RESULT_STATUS = (
    "complete-training-only-postflight-bound"
)

_TEACHER_RUN_DIRECTORY = (
    ".codex/shogi-runs/floodgate-q1-2026-strength-first-v7"
)
_ROLE_BUNDLE_DIRECTORY = (
    ".codex/shogi-bundles/floodgate-q1-2026-label-free-role-bundle-v2"
)
_SEALED_INPUT_DIRECTORY = (
    ".codex/shogi-data/wcsc36-sealed-training-inputs"
)
_TRAINING_PYTHON = (
    ".codex/shogi-data/floodgate-training-venv/bin/python3"
)
_PLAN_FIELDS = {
    "schema",
    "status",
    "artifacts",
    "runtime",
    "training",
    "slots",
    "boundary",
}
_ARTIFACT_FIELDS = {
    "role_bundle_manifest",
    "input_training",
    "teacher_manifest",
    "teacher_result",
    "teacher_work",
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
_TEACHER_COMPLETION_FIELDS = {
    "input_parents",
    "completed_parents",
    "forced_parents_skipped",
    "forced_skip_reasons",
    "emitted_parent_groups",
    "run_fingerprint",
}
_FORCED_SKIP_REASON_FIELDS = {
    "fewer_than_two_legal_moves",
    "search_timeout_no_label",
}
_TIMEOUT_SKIP_DIVISOR = 1_000
_TEACHER_STAGED_OUTPUT_FIELDS = {
    "work",
    "train",
    "parent_completion",
    "manifest",
    "staged_result",
}


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
            _typed_equal(left, right)
            for left, right in zip(value, expected)
        )
    return value == expected


def _validate_forced_skip_reasons(
    value: Any,
    *,
    forced_parents_skipped: int,
    target_parents: int,
    label: str,
) -> dict[str, int]:
    reasons = _exact(value, _FORCED_SKIP_REASON_FIELDS, label)
    if (
        type(target_parents) is not int
        or target_parents <= 0
        or type(forced_parents_skipped) is not int
        or forced_parents_skipped < 0
        or any(type(count) is not int or count < 0 for count in reasons.values())
        or sum(reasons.values()) != forced_parents_skipped
        or reasons["search_timeout_no_label"]
        > (target_parents + _TIMEOUT_SKIP_DIVISOR - 1)
        // _TIMEOUT_SKIP_DIVISOR
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
    input_order, input_metadata, input_summary = (
        ACCOUNTING._scan_input_bytes(input_raw, binding)
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
            train_group["records"]
            != completion_record["train_group_records"]
            or train_group["sha256"]
            != completion_record["train_group_sha256"]
        ):
            raise ValueError(
                "fresh QAT train group differs from completion evidence"
            )

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


def validate_strength_first_qat_training_plan_data(
    plan: Mapping[str, Any],
) -> Mapping[str, Any]:
    """Validate the future data-only plan without reading artifacts."""

    plan = _exact(plan, _PLAN_FIELDS, "strength-first plan")
    ACCOUNTING._require_plain_json(plan, "strength-first plan")
    if (
        plan["schema"] != STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA
        or plan["status"] != STRENGTH_FIRST_QAT_PLAN_STATUS
    ):
        raise ValueError("strength-first plan schema/status mismatch")
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
        artifacts["teacher_manifest"],
        path="manifest.json",
        label="strength-first teacher manifest",
    )
    _file_identity(
        artifacts["teacher_result"],
        path="result.json",
        label="strength-first teacher result",
    )
    _file_identity(
        artifacts["teacher_work"],
        path="work.jsonl",
        label="strength-first teacher work",
    )
    if not _typed_equal(
        artifacts["input_training"],
        ACCOUNTING.PRODUCTION_INPUT_TRAINING_BINDING,
    ):
        raise ValueError(
            "strength-first input differs from the fixed role bundle"
        )

    completion = _exact(
        artifacts["parent_completion"],
        _COMPLETION_FIELDS,
        "strength-first parent completion",
    )
    if (
        completion["path"] != "parent-completion.jsonl"
        or completion["format"]
        != ACCOUNTING.FRESH_QAT_PARENT_COMPLETION_FORMAT
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
        or completion["forced_parents_skipped"]
        + completion["emitted_parent_groups"]
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
        or model["records"] < model["parents"] * 2
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
) -> dict[str, str]:
    """Resolve every fixed path used by the argumentless local launcher."""

    root = Path(
        repo_root
        if repo_root is not None
        else Path(__file__).resolve().parent.parent
    ).resolve()
    home_root = Path(home if home is not None else Path.home()).expanduser()
    teacher = home_root / _TEACHER_RUN_DIRECTORY
    role = home_root / _ROLE_BUNDLE_DIRECTORY
    sealed = home_root / _SEALED_INPUT_DIRECTORY
    return {
        "repo_root": str(root),
        "experiment_plan": str(
            root / STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH
        ),
        "teacher_manifest": str(teacher / "manifest.json"),
        "teacher_result": str(teacher / "result.json"),
        "teacher_work": str(teacher / "work.jsonl"),
        "parent_completion": str(teacher / "parent-completion.jsonl"),
        "model_training": str(teacher / "train.jsonl"),
        "role_bundle_manifest": str(role / "manifest.json"),
        "input_training": str(role / "training.raw.jsonl"),
        "holdout_protected_position_ids": str(
            role / "fresh-final-holdout.protected-position-ids.txt"
        ),
        "policy_exposure_receipt": str(
            role / "replay-exclusion-receipt.json"
        ),
        "policy_exposed_parent_ids": str(
            role / "training.protected-position-ids.txt"
        ),
        "policy_exposed_semantic_position_ids": str(
            role / "fresh-selection.protected-position-ids.txt"
        ),
        "replay_exclusion": str(
            role / "replay-excluded-position-ids.txt"
        ),
        "replay": str(sealed / "runOp1-train.jsonl"),
        "warm_initializer": str(sealed / "runOp1-best.pt"),
        "python": str(home_root / _TRAINING_PYTHON),
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
    raw_parents = (
        training.get("raw_parents")
        if type(training) is dict
        else None
    )
    if not _typed_equal(
        raw_parents,
        expected_input,
    ):
        raise ValueError("strength-first role-bundle input differs")
    replay_exclusion = manifest.get("replay_exclusion")
    identifiers = (
        replay_exclusion.get("identifiers")
        if type(replay_exclusion) is dict
        else None
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
) -> None:
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
        raise ValueError(
            "strength-first teacher manifest output binding mismatch"
        )
    manifest_skip_reasons = _validate_forced_skip_reasons(
        manifest.get("forced_skip_reasons"),
        forced_parents_skipped=artifacts["parent_completion"][
            "forced_parents_skipped"
        ],
        target_parents=artifacts["parent_completion"]["records"],
        label="strength-first teacher manifest forced skip reasons",
    )

    if (
        type(result) is not dict
        or result.get("schema") != STRENGTH_FIRST_TEACHER_RESULT_SCHEMA
        or result.get("status") != STRENGTH_FIRST_TEACHER_RESULT_STATUS
    ):
        raise ValueError("strength-first teacher result schema/status mismatch")
    completion = _exact(
        result.get("completion"),
        _TEACHER_COMPLETION_FIELDS,
        "strength-first teacher result completion",
    )
    _validate_forced_skip_reasons(
        completion["forced_skip_reasons"],
        forced_parents_skipped=completion["forced_parents_skipped"],
        target_parents=completion["completed_parents"],
        label="strength-first teacher result forced skip reasons",
    )
    if (
        completion["input_parents"] != ACCOUNTING.FRESH_QAT_INPUT_PARENTS
        or completion["completed_parents"]
        != ACCOUNTING.FRESH_QAT_INPUT_PARENTS
        or completion["forced_parents_skipped"]
        != artifacts["parent_completion"]["forced_parents_skipped"]
        or not _typed_equal(
            completion["forced_skip_reasons"],
            manifest_skip_reasons,
        )
        or completion["emitted_parent_groups"]
        != artifacts["parent_completion"]["emitted_parent_groups"]
        or completion["forced_parents_skipped"]
        + completion["emitted_parent_groups"]
        != completion["completed_parents"]
    ):
        raise ValueError("strength-first teacher result completion mismatch")
    _sha256(
        completion["run_fingerprint"],
        "strength-first teacher result run fingerprint",
    )

    staged = _exact(
        result.get("staged_outputs"),
        _TEACHER_STAGED_OUTPUT_FIELDS,
        "strength-first teacher staged outputs",
    )
    expected = {
        "work": artifacts["teacher_work"],
        "train": artifacts["model_training"],
        "parent_completion": artifacts["parent_completion"],
        "manifest": artifacts["teacher_manifest"],
    }
    for name, identity in expected.items():
        binding = _file_identity(
            staged[name],
            path=identity["path"],
            label=f"strength-first teacher staged {name}",
        )
        if not _typed_equal(binding, _identity_projection(identity)):
            raise ValueError(
                f"strength-first teacher staged {name} binding mismatch"
            )
    _file_identity(
        staged["staged_result"],
        path="staged-result.json",
        label="strength-first teacher staged result",
    )


def _verify_strength_first_qat_training_plan(
    args: Any,
    training_runtime: Mapping[str, Any],
    *,
    tracking_verifier: Callable[[str, str], None],
    repo_root: str,
    local_paths: Mapping[str, str],
    artifact_reader: Callable[[str], bytes],
    fingerprint_verifier: Callable[
        [str, Mapping[str, Any], str], None
    ],
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
    teacher_manifest_raw = _read_bound(
        local_paths["teacher_manifest"],
        artifacts["teacher_manifest"],
        "teacher manifest",
        artifact_reader,
    )
    teacher_result_raw = _read_bound(
        local_paths["teacher_result"],
        artifacts["teacher_result"],
        "teacher result",
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
    for name in (
        "teacher_work",
        "replay_exclusion",
        "replay",
        "warm_initializer",
    ):
        fingerprint_verifier(
            local_paths[name],
            artifacts[name],
            name.replace("_", " "),
        )
    _validate_teacher_documents(
        ACCOUNTING._strict_json_loads(
            teacher_manifest_raw.decode("utf-8"),
            "strength-first teacher manifest",
        ),
        ACCOUNTING._strict_json_loads(
            teacher_result_raw.decode("utf-8"),
            "strength-first teacher result",
        ),
        artifacts,
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
            "schema": STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
            "slot_id": selected["id"],
            "slot_output": selected["output"],
            "teacher_manifest_sha256": artifacts["teacher_manifest"]["sha256"],
            "teacher_result_sha256": artifacts["teacher_result"]["sha256"],
            "teacher_work_sha256": artifacts["teacher_work"]["sha256"],
            "parent_completion_sha256": artifacts["parent_completion"][
                "sha256"
            ],
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
    return _verify_strength_first_qat_training_plan(
        args,
        training_runtime,
        tracking_verifier=tracking_verifier,
        repo_root=root,
        local_paths=default_strength_first_local_paths(repo_root=root),
        artifact_reader=lambda path: Path(path).read_bytes(),
        fingerprint_verifier=_verify_fingerprint,
    )


__all__ = [
    "STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH",
    "STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA",
    "STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA",
    "STRENGTH_FIRST_QAT_PLAN_STATUS",
    "STRENGTH_FIRST_QAT_RUN_ROOT",
    "STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA",
    "STRENGTH_FIRST_TEACHER_MANIFEST_SCHEMA",
    "STRENGTH_FIRST_TEACHER_RESULT_SCHEMA",
    "STRENGTH_FIRST_TEACHER_RESULT_STATUS",
    "STRENGTH_FIRST_TRAIN_FORMAT",
    "default_strength_first_local_paths",
    "load_strength_first_qat_training_plan",
    "validate_strength_first_qat_training_plan_data",
    "verify_strength_first_qat_training_plan",
]
