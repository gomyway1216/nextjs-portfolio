#!/usr/bin/env python3
"""Strict contracts shared by the direct-teacher HalfKP81 v3 CPU successor."""

from __future__ import annotations

import copy
import os
import re
from typing import Any, Mapping

import direct_teacher_halfkp81_v2_protocol as V2


PROTOCOL_SCHEMA = "shogi-direct-teacher-halfkp81-v3-cpu-plan-v1"
PROTOCOL_STATUS = "prospective-successor-blocked-until-v2-terminal"
TERMINAL_SCHEMA = "shogi-direct-teacher-halfkp81-v2-technical-stop-v1"
TERMINAL_STATUS = "closed-technical-stop-before-optimizer-no-retry"
MANIFEST_SCHEMA = "shogi-direct-teacher-halfkp81-v3-cpu-metadata-manifest-v1"
EXECUTION_PLAN_SCHEMA = "shogi-direct-teacher-halfkp81-v3-cpu-pilot-execution-plan-v1"
ROW_SCHEMA = V2.ROW_SCHEMA
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")

EXPECTED_TRAINING = {
    **copy.deepcopy(V2.EXPECTED_TRAINING),
    "device": "cpu",
}
EXPECTED_CPU_EXECUTION = {
    "torch_version": "2.2.1",
    "python_version": "3.9.6",
    "machine": "arm64",
    "physical_cores": 14,
    "logical_cores": 14,
    "torch_num_threads": 14,
    "torch_num_interop_threads": 14,
    "deterministic_algorithms": True,
    "deterministic_warn_only": False,
    "environment": {
        "PYTHONHASHSEED": "42",
        "PYTORCH_ENABLE_MPS_FALLBACK": "0",
        "OMP_NUM_THREADS": "14",
        "MKL_NUM_THREADS": "14",
        "OPENBLAS_NUM_THREADS": "14",
        "VECLIB_MAXIMUM_THREADS": "14",
    },
}
EXPECTED_CAPABILITY_PROBE = {
    "timing": "after-all-input-and-initializer-validation-before-one-shot-claim",
    "device": "cpu",
    "rows": 2048,
    "source": "seed42-first-training-batch-on-two-isolated-model-copies",
    "requires": [
        "finite-forward",
        "finite-direct-bce",
        "finite-backward-gradient-for-every-parameter",
        "two-run-output-sha256-equality",
        "two-run-gradient-sha256-equality",
        "no-optimizer",
        "no-parameter-step",
        "no-strength-metric",
    ],
}
EXPECTED_STATIC_SANITY = {
    "claim": "catastrophic-regression-screen-only-not-playing-strength-evidence",
    "all_checks_required": True,
    "checks": copy.deepcopy(V2.EXPECTED_STATIC_SANITY["checks"]),
    "reference": (
        "exact frozen alpha-0.50 initializer on the unchanged validation bytes"
    ),
    "any_miss": "STOP before paired play and close the v3 CPU family",
}
EXPECTED_STOP_RULES = [
    "The consumed v2 claim, output, and execution plan are immutable and never retried.",
    (
        "STOP before v3 manifest publication unless the exact v2 terminal "
        "result and every nested evidence identity reauthenticate."
    ),
    (
        "STOP before v3 claim unless metadata-only dataset rebinding, "
        "five-set isolation, CPU environment, initializer, and real "
        "forward/backward capability probe all pass."
    ),
    (
        "After a v3 miss, do not add data, epochs, seeds, checkpoints, "
        "retries, device fallbacks, or change a threshold."
    ),
    (
        "No v3 state authorizes a write to public/shogi-nnue-weights.bin "
        "or any live flag."
    ),
]
EXPECTED_CURRENT_STATE = {
    "predecessor_terminal_bound": False,
    "metadata_manifest_published": False,
    "execution_plan_published": False,
    "capability_probe_passed": False,
    "claim_created": False,
    "optimizer_created": False,
    "training_started": False,
    "checkpoint_frozen": False,
    "static_sanity_executed": False,
    "paired_games": 0,
    "expanded_stage_authorized": False,
    "live_weights_changed": False,
}
EXPECTED_TERMINAL_OBSERVED = {
    "failure_phase": "initializer-baseline-inference-before-optimizer",
    "failure_operator": "aten::_embedding_bag",
    "failure_device": "mps",
    "output_entries": ["initializer-weights.bin"],
    "optimizer_created": False,
    "optimizer_steps": 0,
    "training_batches": 0,
    "training_rows": 0,
    "training_metrics": 0,
    "candidate_weights_published": False,
    "final_checkpoint_published": False,
    "trainer_result_published": False,
    "static_sanity_published": False,
}
EXPECTED_TERMINAL_DECISION = {
    "old_execution_plan_retry_authorized": False,
    "claim_deletion_authorized": False,
    "old_output_mutation_authorized": False,
    "paired56_authorized": False,
    "expanded_stage_authorized": False,
    "live_weight_write_authorized": False,
    "technical_successor_requires_new_protocol_and_execution_plan": True,
}
EXPECTED_TERMINAL_AUTHORITY = {
    "technical_stop_terminal": True,
    "playing_strength_evidence": False,
    "candidate_created": False,
    "selection_metric_observed": False,
}
IDENTITY_FIELDS = {"path", "bytes", "sha256"}
ID_SET_FIELDS = {
    "game_ids_sha256",
    "parent_ids_sha256",
    "position_ids_sha256",
    "child_position_ids_sha256",
    "semantic_position_ids_sha256",
}


class DirectTeacherHalfkpV3CpuError(ValueError):
    """The v3 CPU successor contract was violated."""


def _plain_identity(
    value: Any,
    *,
    label: str,
    schema: str | None = None,
) -> dict[str, Any]:
    expected = set(IDENTITY_FIELDS)
    if schema is not None:
        expected.add("schema")
    if type(value) is not dict or set(value) != expected:
        raise DirectTeacherHalfkpV3CpuError(f"{label} identity fields are not exact")
    if (
        type(value["path"]) is not str
        or not os.path.isabs(value["path"])
        or type(value["bytes"]) is not int
        or value["bytes"] < 1
        or type(value["sha256"]) is not str
        or SHA256_RE.fullmatch(value["sha256"]) is None
        or (schema is not None and value["schema"] != schema)
    ):
        raise DirectTeacherHalfkpV3CpuError(f"{label} identity is invalid")
    return dict(value)


def _same_identity(
    observed: Mapping[str, Any],
    expected: Mapping[str, Any],
    *,
    label: str,
) -> None:
    for field in ("path", "bytes", "sha256"):
        if observed.get(field) != expected.get(field):
            raise DirectTeacherHalfkpV3CpuError(
                f"{label} {field} differs from the fixed successor contract"
            )


def load_strict_json_file(path: str, label: str) -> tuple[Any, dict[str, Any]]:
    return V2.load_strict_json_file(path, label)


def stable_file_identity(
    path: str, label: str, *, require_jsonl: bool = False
) -> tuple[dict[str, Any], int]:
    return V2.stable_file_identity(path, label, require_jsonl=require_jsonl)


def validate_protocol_document(value: Any) -> dict[str, Any]:
    expected_keys = {
        "schema",
        "status",
        "family",
        "claim_boundary",
        "predecessor",
        "source_dataset",
        "inputs",
        "training",
        "cpu_execution",
        "capability_probe",
        "static_sanity",
        "paired_screen",
        "stop_rules",
        "current_state",
    }
    if type(value) is not dict or set(value) != expected_keys:
        raise DirectTeacherHalfkpV3CpuError("v3 protocol fields are not exact")
    if (
        value["schema"] != PROTOCOL_SCHEMA
        or value["status"] != PROTOCOL_STATUS
        or value["family"] != "direct-teacher-halfkp81-v3-cpu"
        or type(value["claim_boundary"]) is not str
        or "not a retry" not in value["claim_boundary"]
    ):
        raise DirectTeacherHalfkpV3CpuError("v3 protocol identity/status differs")
    if value["training"] != EXPECTED_TRAINING:
        raise DirectTeacherHalfkpV3CpuError(
            "v3 training must differ from v2 only by device=cpu"
        )
    if {
        key
        for key in EXPECTED_TRAINING
        if EXPECTED_TRAINING[key] != V2.EXPECTED_TRAINING[key]
    } != {"device"}:
        raise DirectTeacherHalfkpV3CpuError("v3/v2 training diff escaped device")
    if value["cpu_execution"] != EXPECTED_CPU_EXECUTION:
        raise DirectTeacherHalfkpV3CpuError("v3 CPU execution contract differs")
    if value["capability_probe"] != EXPECTED_CAPABILITY_PROBE:
        raise DirectTeacherHalfkpV3CpuError("v3 capability probe differs")
    if (
        value["static_sanity"] != EXPECTED_STATIC_SANITY
        or value["paired_screen"] != V2.EXPECTED_PAIRED_SCREEN
    ):
        raise DirectTeacherHalfkpV3CpuError(
            "v3 static or paired56 decision conditions changed"
        )
    predecessor = value["predecessor"]
    if type(predecessor) is not dict or set(predecessor) != {
        "terminal_result",
        "execution_plan",
        "claim",
        "failure_log",
        "initializer_export",
        "pipeline_revision",
        "observed_state",
    }:
        raise DirectTeacherHalfkpV3CpuError("v3 predecessor fields are not exact")
    terminal = predecessor["terminal_result"]
    if terminal != {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "direct-teacher-halfkp81-v2-technical-stop-v1/result.json"
        ),
        "schema": TERMINAL_SCHEMA,
        "status": TERMINAL_STATUS,
    }:
        raise DirectTeacherHalfkpV3CpuError("v2 terminal slot differs")
    for label, schema in (
        ("execution_plan", V2.EXECUTION_PLAN_SCHEMA),
        ("claim", "shogi-direct-teacher-halfkp81-v2-one-shot-claim-v1"),
    ):
        _plain_identity(predecessor[label], label=label, schema=schema)
    for label in ("failure_log", "initializer_export"):
        _plain_identity(predecessor[label], label=label)
    if (
        type(predecessor["pipeline_revision"]) is not str
        or REVISION_RE.fullmatch(predecessor["pipeline_revision"]) is None
        or predecessor["observed_state"].get("optimizer_created") is not False
        or predecessor["observed_state"].get("training_batches") != 0
        or predecessor["observed_state"].get("training_rows") != 0
        or predecessor["observed_state"].get("playing_strength_evidence") is not False
    ):
        raise DirectTeacherHalfkpV3CpuError("v2 zero-training boundary differs")
    source = value["source_dataset"]
    if type(source) is not dict or set(source) != {
        "manifest",
        "training",
        "validation",
        "rebind",
    }:
        raise DirectTeacherHalfkpV3CpuError("source dataset fields are not exact")
    _plain_identity(
        source["manifest"],
        label="source dataset manifest",
        schema=V2.DATASET_MANIFEST_SCHEMA,
    )
    for role in ("training", "validation"):
        item = source[role]
        expected = {
            "path",
            "bytes",
            "sha256",
            "rows",
            "games",
            "parents",
            *ID_SET_FIELDS,
        }
        if (
            type(item) is not dict
            or set(item) != expected
            or type(item["path"]) is not str
            or not os.path.isabs(item["path"])
            or any(
                type(item[field]) is not int or item[field] < 1
                for field in ("bytes", "rows", "games", "parents")
            )
            or any(
                type(item[field]) is not str or SHA256_RE.fullmatch(item[field]) is None
                for field in {"sha256", *ID_SET_FIELDS}
            )
        ):
            raise DirectTeacherHalfkpV3CpuError(f"source {role} contract is invalid")
    if source["rebind"] != "metadata-only-exact-existing-jsonl-no-row-regeneration":
        raise DirectTeacherHalfkpV3CpuError("dataset rebind mode differs")
    inputs = value["inputs"]
    if type(inputs) is not dict or set(inputs) != {
        "initializer",
        "live_weights",
        "runtime_wasm",
    }:
        raise DirectTeacherHalfkpV3CpuError("v3 input fields are not exact")
    for label in inputs:
        item = inputs[label]
        if type(item) is not dict or set(item) != IDENTITY_FIELDS:
            raise DirectTeacherHalfkpV3CpuError(f"{label} fields are not exact")
        if (
            type(item["path"]) is not str
            or type(item["bytes"]) is not int
            or item["bytes"] < 1
            or type(item["sha256"]) is not str
            or SHA256_RE.fullmatch(item["sha256"]) is None
        ):
            raise DirectTeacherHalfkpV3CpuError(f"{label} is invalid")
    if (
        value["stop_rules"] != EXPECTED_STOP_RULES
        or value["current_state"] != EXPECTED_CURRENT_STATE
    ):
        raise DirectTeacherHalfkpV3CpuError("v3 stop/current state differs")
    return copy.deepcopy(value)


def validate_terminal_result(
    value: Any, *, protocol: Mapping[str, Any]
) -> dict[str, Any]:
    expected_keys = {
        "schema",
        "status",
        "evidence",
        "observed_state",
        "decision",
        "authority",
    }
    if type(value) is not dict or set(value) != expected_keys:
        raise DirectTeacherHalfkpV3CpuError("v2 terminal result fields are not exact")
    if value["schema"] != TERMINAL_SCHEMA or value["status"] != TERMINAL_STATUS:
        raise DirectTeacherHalfkpV3CpuError("v2 terminal result schema/status differs")
    evidence = value["evidence"]
    if type(evidence) is not dict or set(evidence) != {
        "claim",
        "execution_plan",
        "failure_log",
        "initializer_export",
        "live_weights",
        "pipeline_revision",
        "output_directory",
    }:
        raise DirectTeacherHalfkpV3CpuError("terminal evidence fields are not exact")
    predecessor = protocol["predecessor"]
    for label, schema in (
        ("claim", predecessor["claim"]["schema"]),
        ("execution_plan", predecessor["execution_plan"]["schema"]),
    ):
        observed = _plain_identity(evidence[label], label=label, schema=schema)
        _same_identity(observed, predecessor[label], label=label)
    for label in ("failure_log", "initializer_export"):
        observed = _plain_identity(evidence[label], label=label)
        _same_identity(observed, predecessor[label], label=label)
    live = _plain_identity(evidence["live_weights"], label="live weights")
    expected_live = protocol["inputs"]["live_weights"]
    if (
        live["bytes"] != expected_live["bytes"]
        or live["sha256"] != expected_live["sha256"]
    ):
        raise DirectTeacherHalfkpV3CpuError("terminal live weights differ")
    if (
        evidence["pipeline_revision"] != predecessor["pipeline_revision"]
        or evidence["output_directory"]
        != os.path.dirname(predecessor["initializer_export"]["path"])
        or value["observed_state"] != EXPECTED_TERMINAL_OBSERVED
        or value["decision"] != EXPECTED_TERMINAL_DECISION
        or value["authority"] != EXPECTED_TERMINAL_AUTHORITY
    ):
        raise DirectTeacherHalfkpV3CpuError(
            "terminal zero-training state or authority differs"
        )
    return copy.deepcopy(value)


def verify_terminal_evidence(
    value: Mapping[str, Any], *, protocol: Mapping[str, Any]
) -> dict[str, Any]:
    terminal = validate_terminal_result(value, protocol=protocol)
    evidence = terminal["evidence"]
    for label in (
        "claim",
        "execution_plan",
        "failure_log",
        "initializer_export",
        "live_weights",
    ):
        identity, _lines = stable_file_identity(
            evidence[label]["path"], f"terminal {label}"
        )
        _same_identity(identity, evidence[label], label=label)
    output_directory = evidence["output_directory"]
    if (
        not os.path.isabs(output_directory)
        or os.path.islink(output_directory)
        or not os.path.isdir(output_directory)
        or sorted(os.listdir(output_directory)) != ["initializer-weights.bin"]
        or os.path.realpath(evidence["initializer_export"]["path"])
        != os.path.join(os.path.realpath(output_directory), "initializer-weights.bin")
    ):
        raise DirectTeacherHalfkpV3CpuError("terminal output directory differs")
    claim, claim_identity = load_strict_json_file(
        evidence["claim"]["path"], "consumed v2 claim"
    )
    _same_identity(claim_identity, evidence["claim"], label="claim")
    if (
        claim.get("status") != "exclusive-one-shot-claimed-no-retry"
        or claim.get("execution_plan") != evidence["execution_plan"]
        or claim.get("output_path") != output_directory
        or claim.get("live_weight_write_authorized") is not False
    ):
        raise DirectTeacherHalfkpV3CpuError("consumed v2 claim binding differs")
    return terminal


def validate_metadata_manifest(
    value: Any,
    *,
    protocol: Mapping[str, Any],
    protocol_identity: Mapping[str, Any],
    terminal_identity: Mapping[str, Any],
) -> dict[str, Any]:
    expected_keys = {
        "schema",
        "status",
        "mode",
        "protocol",
        "predecessor_terminal",
        "source_manifest",
        "datasets",
        "accounting",
        "authority",
    }
    if type(value) is not dict or set(value) != expected_keys:
        raise DirectTeacherHalfkpV3CpuError("v3 metadata manifest fields are not exact")
    if (
        value["schema"] != MANIFEST_SCHEMA
        or value["status"] != "complete-metadata-only-byte-identical-rebind"
        or value["mode"] != "metadata-only-exact-existing-jsonl-no-row-generation"
    ):
        raise DirectTeacherHalfkpV3CpuError("v3 metadata manifest status differs")
    expected_protocol = {
        **{key: protocol_identity[key] for key in ("path", "bytes", "sha256")},
        "schema": PROTOCOL_SCHEMA,
    }
    expected_terminal = {
        **{key: terminal_identity[key] for key in ("path", "bytes", "sha256")},
        "schema": TERMINAL_SCHEMA,
        "status": TERMINAL_STATUS,
    }
    if (
        value["protocol"] != expected_protocol
        or value["predecessor_terminal"] != expected_terminal
    ):
        raise DirectTeacherHalfkpV3CpuError("v3 manifest bindings differ")
    _plain_identity(
        value["source_manifest"],
        label="source manifest",
        schema=V2.DATASET_MANIFEST_SCHEMA,
    )
    for role in ("training", "validation"):
        dataset = value["datasets"].get(role)
        expected = {
            "path",
            "bytes",
            "sha256",
            "rows",
            "games",
            "parents",
            "row_schema",
            *ID_SET_FIELDS,
        }
        if (
            type(dataset) is not dict
            or set(dataset) != expected
            or dataset["row_schema"] != ROW_SCHEMA
            or dataset["path"] != protocol["source_dataset"][role]["path"]
        ):
            raise DirectTeacherHalfkpV3CpuError(f"v3 {role} binding differs")
        for field in expected - {"row_schema"}:
            if dataset[field] != protocol["source_dataset"][role][field]:
                raise DirectTeacherHalfkpV3CpuError(
                    f"v3 {role} {field} differs from protocol"
                )
    if value["accounting"] != {
        "source_rows_read": (
            protocol["source_dataset"]["training"]["rows"]
            + protocol["source_dataset"]["validation"]["rows"]
        ),
        "row_bytes_written": 0,
        "jsonl_files_created": 0,
        "jsonl_files_copied": 0,
        "jsonl_files_hardlinked": 0,
        "cross_role_overlap_counts": {
            "game_ids": 0,
            "parent_ids": 0,
            "position_ids": 0,
            "child_position_ids": 0,
            "semantic_position_ids": 0,
        },
    }:
        raise DirectTeacherHalfkpV3CpuError("v3 metadata accounting differs")
    if value["authority"] != {
        "metadata_rebind_complete": True,
        "optimizer_creation_authorized": False,
        "training_started": False,
        "paired56_authorized": False,
        "live_weight_write_authorized": False,
    }:
        raise DirectTeacherHalfkpV3CpuError("v3 manifest authority differs")
    return copy.deepcopy(value)


def validate_execution_plan(value: Any) -> dict[str, Any]:
    expected_keys = {
        "schema",
        "status",
        "protocol",
        "predecessor_terminal",
        "metadata_manifest",
        "inputs",
        "training",
        "cpu_execution",
        "capability_probe",
        "static_sanity",
        "paired_screen",
        "authority",
    }
    if type(value) is not dict or set(value) != expected_keys:
        raise DirectTeacherHalfkpV3CpuError("v3 execution plan fields are not exact")
    if (
        value["schema"] != EXECUTION_PLAN_SCHEMA
        or value["status"] != "bound-cpu-pilot-ready-for-capability-probe"
        or value["training"] != EXPECTED_TRAINING
        or value["cpu_execution"] != EXPECTED_CPU_EXECUTION
        or value["capability_probe"] != EXPECTED_CAPABILITY_PROBE
        or value["static_sanity"] != EXPECTED_STATIC_SANITY
        or value["paired_screen"] != V2.EXPECTED_PAIRED_SCREEN
    ):
        raise DirectTeacherHalfkpV3CpuError("v3 execution plan contract differs")
    for label, schema in (
        ("protocol", PROTOCOL_SCHEMA),
        ("predecessor_terminal", TERMINAL_SCHEMA),
        ("metadata_manifest", MANIFEST_SCHEMA),
    ):
        _plain_identity(value[label], label=label, schema=schema)
    inputs = value["inputs"]
    if type(inputs) is not dict or set(inputs) != {
        "initializer",
        "live_weights",
        "runtime_wasm",
        "training_dataset",
        "validation_dataset",
    }:
        raise DirectTeacherHalfkpV3CpuError("v3 execution inputs differ")
    if value["authority"] != {
        "capability_probe_required_before_claim": True,
        "optimizer_creation_authorized_only_after_claim": True,
        "paired56_authorized_only_after_static_pass": True,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
    }:
        raise DirectTeacherHalfkpV3CpuError("v3 execution authority differs")
    return copy.deepcopy(value)
