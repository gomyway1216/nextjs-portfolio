#!/usr/bin/env python3
"""Fail-closed preregistration contract for bounded-stable HalfKP81 v3."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Mapping


PLAN_SCHEMA = "shogi-halfkp81-hard-depth18-bounded-stable-plan-v3"
TEACHER_PLAN_SCHEMA = (
    "shogi-halfkp81-hard-depth18-bounded-stable-teacher-plan-v3"
)
FAMILY = "halfkp81-hard-depth18-bounded-stable-v3"
PLAN_STATUS = "prospective-not-executed"
PREDECESSOR_REVISION = "551759a171ac7fed5cf4a5b7cc2279dc60eea6bd"
PREDECESSOR_FINGERPRINT = (
    "beb31082f6b59659ee5496efdee7fade6994dd72251b8bc6a2c078e962d0c26e"
)
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")

EXPECTED_TRACKED_PLAN_IDENTITY = {
    "path": "ml/halfkp81-hard-depth18-bounded-stable-v3-plan.json",
    "bytes": 8_607,
    "sha256": "e72510d0e34a2904810591f12bc909c1ae9f770abb596195161ab9dd9d9375f1",
    "schema": PLAN_SCHEMA,
}

EXPECTED_SELECTION_ROLES = {"fit": 6_144, "tune": 1_024, "sealed": 1_024}

EXPECTED_ENGINE = {
    "binary": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-data/"
            "floodgate-teacher-assets-v1/bin/yaneuraou"
        ),
        "bytes": 700_048,
        "sha256": (
            "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1"
        ),
    },
    "eval_file": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-data/"
            "floodgate-teacher-assets-v1/eval/eval/nn.bin"
        ),
        "bytes": 64_217_066,
        "sha256": (
            "1141d275bceec911156801f27303dc9ff5beb24f4f59144cc069306c59e80782"
        ),
    },
    "eval_tree_sha256": (
        "639397609565fc2f113242503483addaf812b39c43a4d813d51b9c68ca51d568"
    ),
    "source_revision": "9133c527791c8b2f5f378a32df29a5e3752bd41b",
    "id": "YaneuraOu NNUE 9.60git 64APPLEM1",
}

EXPECTED_RUNTIME_AUTHORITY = {
    "may_execute_teacher": True,
    "may_train": False,
    "may_play_formal_games": False,
    "may_write_live_weights": False,
}

EXPECTED_AUTHORITY = {
    "may_execute_teacher": False,
    "may_play_formal_games": False,
    "may_publish_teacher_plan_after_new_merged_source_authentication": True,
    "may_train": False,
    "may_write_live_weights": False,
}

EXPECTED_FORBIDDEN = {
    "accept_partial_stable_result": False,
    "change_fixed_gate_after_execution": False,
    "extra_epoch_or_seed_after_gate_miss": False,
    "pool_wide_poison_on_stable_timeout": False,
    "qat_after_gate_miss": False,
    "reuse_v2_parent_or_teacher_rows": False,
    "threshold_change_after_gate_miss": False,
    "use_old_depth6_or_depth12_cp_as_teacher_target": False,
    "write_live_weights_before_all_formal_evidence": False,
}

EXPECTED_GATES = {
    "absolute_max_cp_delta_maximum": 300.0,
    "fresh_screen_games": 56,
    "fresh_screen_halfpoints_denominator": 112,
    "fresh_screen_halfpoints_minimum": 62,
    "fresh_screen_technical_faults_maximum": 0,
    "int16_clipping_coordinates_maximum": 0,
    "nearest_rank_p99_9_ratio_maximum": 1.05,
    "old_validation_pair_delta_minimum": 0.0,
    "old_validation_rows": 22_890,
    "old_validation_teacher_mae_cp_improvement_minimum": 5.0,
    "runtime_slowdown_percent_maximum": 5.0,
    "sealed_parents": 1_024,
    "sealed_sibling_pair_delta_percentage_points_minimum": 1.0,
    "sealed_top1_delta_percentage_points_minimum": 2.0,
    "teacher_authentication_prefixes": [100, 500],
    "tune_parents": 1_024,
    "tune_sibling_pair_delta_percentage_points_minimum": 1.0,
    "tune_top1_delta_percentage_points_minimum": 2.0,
    "wasm_parity_mismatches_maximum": 0,
}

EXPECTED_LIVE_BASELINE = {
    "path": "public/shogi-nnue-weights.bin",
    "bytes": 1_185_988,
    "sha256": "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
}

_OUTPUT_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "halfkp81-hard-depth18-bounded-stable-v3"
)
EXPECTED_OUTPUT_NAMESPACE = {
    "collision_policy": "create-only-fail-if-any-target-exists",
    "directory": _OUTPUT_DIRECTORY,
    "fit_jsonl": f"{_OUTPUT_DIRECTORY}/fit.jsonl",
    "milestone_100_json": f"{_OUTPUT_DIRECTORY}/teacher-milestone-100.json",
    "milestone_500_json": f"{_OUTPUT_DIRECTORY}/teacher-milestone-500.json",
    "plan_json": f"{_OUTPUT_DIRECTORY}/teacher-plan.json",
    "receipt_json": f"{_OUTPUT_DIRECTORY}/teacher-receipt.json",
    "sealed_jsonl": f"{_OUTPUT_DIRECTORY}/sealed.jsonl",
    "terminal_fault_json": f"{_OUTPUT_DIRECTORY}/teacher-terminal-fault.json",
    "tune_jsonl": f"{_OUTPUT_DIRECTORY}/tune.jsonl",
    "verified_artifact_receipt_json": (
        f"{_OUTPUT_DIRECTORY}/teacher-verified-artifact-receipt.json"
    ),
    "work_jsonl": f"{_OUTPUT_DIRECTORY}/teacher-work.jsonl",
}
EXPECTED_RUNTIME_OUTPUTS = {
    key: value
    for key, value in EXPECTED_OUTPUT_NAMESPACE.items()
    if key != "collision_policy"
}

EXPECTED_PREDECESSOR_V2 = {
    "diagnosis": {
        "exact_isolated_600_second_completed": 9,
        "exact_isolated_600_second_completion_seconds": [
            4.918,
            19.942,
            113.397,
            138.268,
            164.488,
            265.056,
            345.625,
            514.222,
            547.152,
        ],
        "exact_isolated_600_second_timeouts": 4,
        "parents_examined": 13,
        "pool_deadlock_observed": False,
        "result": (
            "multiple-genuine-stable-depth11-long-tail-searches-"
            "not-single-parent-misattribution"
        ),
        "transport_fault_observed": False,
    },
    "family": "halfkp81-hard-depth18-engine-evaldir-v2",
    "reuse_completed_parents": 0,
    "reuse_teacher_rows": 0,
    "run_fingerprint": PREDECESSOR_FINGERPRINT,
    "same_family_resume_authorized": False,
    "source_revision": PREDECESSOR_REVISION,
    "teacher_plan": {
        "bytes": 6_617,
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "halfkp81-hard-depth18-engine-evaldir-v2/teacher-plan.json"
        ),
        "schema": "shogi-halfkp81-hard-depth18-teacher-plan-v2",
        "sha256": (
            "b9fbac546c6c77386c43b9318eb7639f3cf74882ff995fa4e117d82d092bacd1"
        ),
    },
    "terminal_fault": {
        "bytes": 866,
        "completed_parents": 49,
        "incomplete_parents": 8_143,
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "halfkp81-hard-depth18-engine-evaldir-v2/"
            "teacher-terminal-fault.json"
        ),
        "run_fingerprint": PREDECESSOR_FINGERPRINT,
        "schema": "shogi-halfkp81-hard-depth18-teacher-terminal-fault-v1",
        "sha256": (
            "f3c90ccfd165a84fcf5843c3cd6975ec8459791528d7ee9db7ac0b2bf7a0f4db"
        ),
        "status": "terminal-fault-family-stopped",
        "technical_faults": 1,
    },
    "tracked_recovery_plan": {
        "bytes": 5_889,
        "path": "ml/halfkp81-hard-depth18-engine-evaldir-v2-plan.json",
        "schema": "shogi-halfkp81-hard-depth18-engine-evaldir-recovery-plan-v2",
        "sha256": (
            "58410d65bb553486c51c2ab332abba21ddcc8ef743af27378208ffcb3ec8baf2"
        ),
    },
    "work_ledger": {
        "bytes": 793_176,
        "header_records": 1,
        "parent_records": 49,
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "halfkp81-hard-depth18-engine-evaldir-v2/teacher-work.jsonl"
        ),
        "records": 50,
        "run_fingerprint": PREDECESSOR_FINGERPRINT,
        "schema": "shogi-halfkp81-hard-depth18-teacher-work-v1",
        "sha256": (
            "6b5682abe23c87cc5e9923808b904ebf41ce7b59030f32927988b7c5628d529e"
        ),
        "teacher_rows": 585,
    },
}

EXPECTED_REUSED_SELECTION = {
    "jsonl": {
        "bytes": 7_268_777,
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "halfkp81-hard-depth18-strength-v1/hard-parents.jsonl"
        ),
        "rows": 8_192,
        "schema": "halfkp81-depth18-hard-parent-v2",
        "sha256": (
            "e591aa6d90ca3640b4b0e5963de53e92da0b2541434aaa100f9e5ea7ab83f4e4"
        ),
    },
    "manifest": {
        "bytes": 3_234,
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "halfkp81-hard-depth18-strength-v1/hard-parents.manifest.json"
        ),
        "schema": "halfkp81-depth18-hard-parent-selection-manifest-v2",
        "sha256": (
            "6823b77be9171fe63cb30cbd2955bd871474cf8ebf662fc203824c673aa3e187"
        ),
    },
}

EXPECTED_SOURCE_REVISION_POLICY = {
    "forbidden_predecessor_revision": PREDECESSOR_REVISION,
    "must_bind_new_clean_merged_main_revision": True,
    "runtime_plan_source_revision_must_equal_authenticated_main_head": True,
    "tracked_plan_must_be_merged_before_runtime_plan": True,
    "uncommitted_changes_maximum": 0,
}

EXPECTED_TEACHER = {
    "candidate_policy": {
        "deduplication": "USI-move-exact-before-depth18-rescore",
        "recorded_move": {"required": True},
        "stable_depth11": {
            "accept_partial_result": False,
            "budget_milliseconds": 20_000,
            "completed_move_requires_independent_depth18_rescore": True,
            "cooperative_deadline_required": True,
            "omission_must_be_explicit_in_parent_ledger": True,
            "optional": True,
            "pool_wide_poison_on_timeout": False,
            "requested_depth": 11,
            "timed_out_worker_replacement": "worker-local-clean-replacement",
        },
        "yaneuraou_depth16_multipv": {
            "depth": 16,
            "multipv": 12,
            "required": True,
        },
    },
    "engine": "YaneuraOu NNUE 9.60git 64APPLEM1",
    "expected_rows_point": 95_191,
    "hash_mib_per_process": 512,
    "maximum_rows": 114_688,
    "maximum_rows_per_parent": 14,
    "minimum_rows_per_parent": 2,
    "processes": 13,
    "rescore_policy": {
        "all_deduplicated_candidates_independently_rescored": True,
        "depth": 18,
        "old_depth6_or_depth12_cp_target_rows": 0,
    },
    "threads_per_process": 1,
    "timeout_seconds_per_parent": 600,
}

EXPECTED_TRAINING = {
    "checkpoint_selection": "final-epoch-only",
    "direct_loss": "sigmoid-bce-k600",
    "direct_loss_fraction": 0.5,
    "epochs": 3,
    "groupwise_loss": "listnet-cp-over-600",
    "groupwise_loss_fraction": 0.5,
    "initializer": "original-alpha-050-not-v3-or-v4-candidate",
    "parent_batch_fraction_direct_replay": 0.5,
    "parent_batch_fraction_fresh_hard": 0.5,
    "representation": "HalfKP81",
    "seeds": 1,
}


class BoundedStableV3ProtocolError(ValueError):
    """Raised when the preregistered v3 contract drifts."""


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise BoundedStableV3ProtocolError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def parse_strict_json_bytes(
    raw: bytes, label: str = "JSON document"
) -> Mapping[str, Any]:
    """Reject duplicate keys and non-object roots in already authenticated bytes."""

    try:
        document = json.loads(raw, object_pairs_hook=_reject_duplicate_keys)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise BoundedStableV3ProtocolError(f"invalid {label}: {exc}") from exc
    if not isinstance(document, Mapping):
        raise BoundedStableV3ProtocolError(f"{label} root must be an object")
    return document


def load_strict_json_file(path: str | Path) -> tuple[Mapping[str, Any], bytes]:
    """Read JSON bytes once, reject duplicate keys, and return the mapping."""

    raw = Path(path).read_bytes()
    document = parse_strict_json_bytes(raw, str(path))
    return document, raw


def canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    """Encode a protocol artifact in the repository's canonical JSON form."""

    return (
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
        + b"\n"
    )


def _require_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise BoundedStableV3ProtocolError(f"{label} does not match preregistration")


def validate_plan_document(document: Mapping[str, Any]) -> dict[str, Any]:
    """Validate every fixed preregistration field without granting execution."""

    if not isinstance(document, Mapping):
        raise BoundedStableV3ProtocolError("plan must be an object")
    expected_root_keys = {
        "authority",
        "family",
        "forbidden",
        "gates",
        "live_baseline",
        "output_namespace",
        "predecessor_v2",
        "reused_selection",
        "schema",
        "source_revision_policy",
        "status",
        "teacher",
        "training",
    }
    _require_equal(set(document), expected_root_keys, "root keys")
    _require_equal(document.get("schema"), PLAN_SCHEMA, "schema")
    _require_equal(document.get("family"), FAMILY, "family")
    _require_equal(document.get("status"), PLAN_STATUS, "status")
    _require_equal(document.get("authority"), EXPECTED_AUTHORITY, "authority")
    _require_equal(document.get("forbidden"), EXPECTED_FORBIDDEN, "forbidden")
    _require_equal(document.get("gates"), EXPECTED_GATES, "gates")
    _require_equal(
        document.get("live_baseline"), EXPECTED_LIVE_BASELINE, "live baseline"
    )
    _require_equal(
        document.get("output_namespace"),
        EXPECTED_OUTPUT_NAMESPACE,
        "output namespace",
    )
    _require_equal(
        document.get("predecessor_v2"),
        EXPECTED_PREDECESSOR_V2,
        "predecessor v2",
    )
    _require_equal(
        document.get("reused_selection"),
        EXPECTED_REUSED_SELECTION,
        "reused selection",
    )
    _require_equal(
        document.get("source_revision_policy"),
        EXPECTED_SOURCE_REVISION_POLICY,
        "source revision policy",
    )
    _require_equal(document.get("teacher"), EXPECTED_TEACHER, "teacher")
    _require_equal(document.get("training"), EXPECTED_TRAINING, "training")

    predecessor = document["predecessor_v2"]
    if predecessor["work_ledger"]["parent_records"] != 49:
        raise BoundedStableV3ProtocolError("v2 parent accounting drifted")
    if predecessor["work_ledger"]["teacher_rows"] != 585:
        raise BoundedStableV3ProtocolError("v2 row accounting drifted")
    if predecessor["reuse_completed_parents"] != 0:
        raise BoundedStableV3ProtocolError("v2 parents must not be reused")
    if predecessor["reuse_teacher_rows"] != 0:
        raise BoundedStableV3ProtocolError("v2 rows must not be reused")

    stable = document["teacher"]["candidate_policy"]["stable_depth11"]
    if not stable["optional"] or stable["budget_milliseconds"] != 20_000:
        raise BoundedStableV3ProtocolError("stable lane must be optional and 20s")
    if stable["accept_partial_result"]:
        raise BoundedStableV3ProtocolError("partial stable results are forbidden")
    if stable["pool_wide_poison_on_timeout"]:
        raise BoundedStableV3ProtocolError("stable timeout must remain worker-local")

    proposal = document["teacher"]["candidate_policy"][
        "yaneuraou_depth16_multipv"
    ]
    recorded = document["teacher"]["candidate_policy"]["recorded_move"]
    rescore = document["teacher"]["rescore_policy"]
    if proposal != {"depth": 16, "multipv": 12, "required": True}:
        raise BoundedStableV3ProtocolError("required YaneuraOu proposal drifted")
    if recorded != {"required": True}:
        raise BoundedStableV3ProtocolError("recorded move must remain required")
    if rescore["depth"] != 18 or not rescore[
        "all_deduplicated_candidates_independently_rescored"
    ]:
        raise BoundedStableV3ProtocolError("fresh independent depth18 is required")
    if rescore["old_depth6_or_depth12_cp_target_rows"] != 0:
        raise BoundedStableV3ProtocolError("old shallow CP cannot be a target")

    return copy.deepcopy(dict(document))


def validate_tracked_plan_file(path: str | Path) -> dict[str, Any]:
    """Authenticate the exact immutable tracked preregistration bytes."""

    document, raw = load_strict_json_file(path)
    identity = {
        "path": EXPECTED_TRACKED_PLAN_IDENTITY["path"],
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "schema": document.get("schema"),
    }
    _require_equal(identity, EXPECTED_TRACKED_PLAN_IDENTITY, "tracked plan identity")
    return validate_plan_document(document)


def validate_runtime_source_revision(
    document: Mapping[str, Any],
    *,
    source_revision: str,
    authenticated_main_head: str,
    repository_clean: bool,
    tracked_plan_merged: bool,
) -> str:
    """Apply the post-merge source gate before a runtime plan may be built."""

    validate_plan_document(document)
    if not REVISION_RE.fullmatch(source_revision):
        raise BoundedStableV3ProtocolError("source revision must be 40 lowercase hex")
    if not REVISION_RE.fullmatch(authenticated_main_head):
        raise BoundedStableV3ProtocolError(
            "authenticated main head must be 40 lowercase hex"
        )
    if source_revision == PREDECESSOR_REVISION:
        raise BoundedStableV3ProtocolError("v2 source revision is forbidden")
    if source_revision != authenticated_main_head:
        raise BoundedStableV3ProtocolError(
            "source revision must equal authenticated main head"
        )
    if not repository_clean:
        raise BoundedStableV3ProtocolError("repository must be clean")
    if not tracked_plan_merged:
        raise BoundedStableV3ProtocolError("tracked preregistration must be merged")
    return source_revision


def validate_teacher_plan(
    document: Mapping[str, Any],
    *,
    authenticated_selection: Mapping[str, Any],
    expected_source_revision: str,
) -> dict[str, Any]:
    """Validate the sealed runtime plan built after the preregistration merge."""

    fields = {
        "authority",
        "engine",
        "outputs",
        "predecessor_v2",
        "preregistration",
        "schema",
        "selection_evidence",
        "selection_manifest",
        "selection_roles",
        "source_revision",
        "status",
        "teacher",
    }
    if not isinstance(document, Mapping) or set(document) != fields:
        raise BoundedStableV3ProtocolError("teacher plan fields differ")
    _require_equal(document["schema"], TEACHER_PLAN_SCHEMA, "teacher plan schema")
    _require_equal(document["status"], "sealed-not-executed", "teacher plan status")
    if (
        not REVISION_RE.fullmatch(expected_source_revision)
        or expected_source_revision == PREDECESSOR_REVISION
        or document["source_revision"] != expected_source_revision
    ):
        raise BoundedStableV3ProtocolError(
            "teacher plan source revision differs from new merged source"
        )
    _require_equal(
        document["preregistration"],
        EXPECTED_TRACKED_PLAN_IDENTITY,
        "teacher plan preregistration",
    )
    _require_equal(
        document["predecessor_v2"],
        EXPECTED_PREDECESSOR_V2,
        "teacher plan predecessor",
    )
    _require_equal(document["engine"], EXPECTED_ENGINE, "teacher plan engine")
    _require_equal(document["teacher"], EXPECTED_TEACHER, "teacher plan teacher")
    _require_equal(
        document["outputs"], EXPECTED_RUNTIME_OUTPUTS, "teacher plan outputs"
    )
    _require_equal(
        document["selection_roles"],
        EXPECTED_SELECTION_ROLES,
        "teacher plan selection roles",
    )
    _require_equal(
        document["authority"],
        EXPECTED_RUNTIME_AUTHORITY,
        "teacher plan authority",
    )
    evidence = copy.deepcopy(dict(authenticated_selection))
    expected_evidence_fields = {
        "schema",
        "status",
        "source_revision",
        "selection_jsonl",
        "selection_manifest",
        "phase_name_map",
        "accounting",
        "bindings",
        "verification",
    }
    if set(evidence) != expected_evidence_fields:
        raise BoundedStableV3ProtocolError("selection evidence fields differ")
    if (
        evidence.get("schema")
        != "shogi-halfkp81-depth18-authenticated-selection-evidence-v1"
        or evidence.get("status")
        != "authenticated-selection-complete-teacher-plan-eligible"
        or evidence.get("source_revision") != expected_source_revision
    ):
        raise BoundedStableV3ProtocolError("selection evidence status differs")
    selected = evidence.get("selection_jsonl")
    manifest = evidence.get("selection_manifest")
    if not isinstance(selected, Mapping) or not isinstance(manifest, Mapping):
        raise BoundedStableV3ProtocolError("selection evidence identities are invalid")
    selected_identity = {
        key: selected.get(key)
        for key in ("path", "bytes", "sha256", "rows", "schema")
    }
    manifest_identity = {
        key: manifest.get(key) for key in ("path", "bytes", "sha256", "schema")
    }
    _require_equal(
        selected_identity,
        EXPECTED_REUSED_SELECTION["jsonl"],
        "teacher plan selected parents",
    )
    _require_equal(
        manifest_identity,
        EXPECTED_REUSED_SELECTION["manifest"],
        "teacher plan selection manifest",
    )
    _require_equal(
        document["selection_manifest"],
        EXPECTED_REUSED_SELECTION["manifest"],
        "teacher plan selection manifest binding",
    )
    _require_equal(
        document["selection_evidence"], evidence, "teacher plan selection evidence"
    )
    return copy.deepcopy(dict(document))


__all__ = [
    "BoundedStableV3ProtocolError",
    "EXPECTED_AUTHORITY",
    "EXPECTED_FORBIDDEN",
    "EXPECTED_GATES",
    "EXPECTED_ENGINE",
    "EXPECTED_LIVE_BASELINE",
    "EXPECTED_OUTPUT_NAMESPACE",
    "EXPECTED_RUNTIME_OUTPUTS",
    "EXPECTED_PREDECESSOR_V2",
    "EXPECTED_REUSED_SELECTION",
    "EXPECTED_RUNTIME_AUTHORITY",
    "EXPECTED_SELECTION_ROLES",
    "EXPECTED_SOURCE_REVISION_POLICY",
    "EXPECTED_TEACHER",
    "EXPECTED_TRACKED_PLAN_IDENTITY",
    "EXPECTED_TRAINING",
    "FAMILY",
    "PLAN_SCHEMA",
    "PLAN_STATUS",
    "PREDECESSOR_REVISION",
    "TEACHER_PLAN_SCHEMA",
    "canonical_json_bytes",
    "load_strict_json_file",
    "parse_strict_json_bytes",
    "validate_plan_document",
    "validate_runtime_source_revision",
    "validate_teacher_plan",
    "validate_tracked_plan_file",
]
