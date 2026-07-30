#!/usr/bin/env python3
"""Prepare and run the preregistered direct-teacher HalfKP81 v2 paired56 screen.

Preparation binds one passed static-sanity receipt, the frozen candidate and
live hashes, the pre-training opening manifest, the exact runtime, and the
match harness into a create-only screen plan.  Execution is impossible without
that plan.  Completed pair evidence and terminal results are create-only.
Only an authenticated technical-fault attempt may be resumed; a playing-
strength rejection is terminal for this pilot family.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable, Mapping, Sequence
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
from typing import Any

import direct_teacher_halfkp81_v2_protocol as protocol_v2
from nnue_fixed_time_gate import (
    ChildResult,
    PairResult,
    parse_pair_log,
)


OPENING_MANIFEST_SCHEMA = "shogi-direct-teacher-halfkp81-v2-screen-openings-v1"
SCREEN_PLAN_SCHEMA = "shogi-direct-teacher-halfkp81-v2-paired56-plan-v1"
RUN_SCHEMA = "shogi-direct-teacher-halfkp81-v2-paired56-run-v1"
ATTEMPT_SCHEMA = "shogi-direct-teacher-halfkp81-v2-paired56-attempt-v1"
PAIR_SCHEMA = "shogi-direct-teacher-halfkp81-v2-paired56-pair-v1"
FAULT_SCHEMA = "shogi-direct-teacher-halfkp81-v2-paired56-fault-v1"
RESULT_SCHEMA = "shogi-direct-teacher-halfkp81-v2-paired56-result-v1"
STATIC_SCHEMA = "shogi-direct-teacher-halfkp81-v2-static-sanity-result-v1"
TRAINER_SCHEMA = "shogi-direct-teacher-halfkp81-v2-trainer-result-v1"
RUNTIME_SANITY_SCHEMA = "shogi-direct-teacher-halfkp81-v2-runtime-sanity-v1"
STATIC_PASS_STATUS = "passed-all-checks-paired56-authorized"
PLAN_STATUS = "static-pass-bound-paired56-not-started"
PAIR_COUNT = 28
GAME_COUNT = 56
PAIR_WORKERS = 12
MILLISECONDS_PER_MOVE = 1_500
MAXIMUM_PLIES = 512
PASS_HALFPOINTS = 62
DENOMINATOR_HALFPOINTS = 112
CANDIDATE_BUCKETS = 81
LIVE_BUCKETS = 1
PAIR_SEED_START = 1_200_001
RUNTIME_PATH = "wasm-spike/artifacts/shogi-halfkp81-research.wasm"
HARNESS_PATH = "wasm-spike/match-nnue-vs-v3.ts"
CONTROLLER_PATH = "ml/direct_teacher_halfkp81_v2_screen.py"
OPENING_MANIFEST_PATH = "ml/protocols/direct-teacher-halfkp81-v2-screen-openings.json"
OPENING_INVENTORY_PATH = "ml/protocols/bounded-quiet-history-existing-openings-v1.json"
OPENING_SET_DOMAIN = "shogi-direct-teacher-halfkp81-v2-opening-set-v1\0"
PAIR_DIGEST_DOMAIN = "shogi-direct-teacher-halfkp81-v2-paired56-pair-v1\0"
RESULT_DIGEST_DOMAIN = "shogi-direct-teacher-halfkp81-v2-paired56-result-v1\0"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
PAIR_FILE_RE = re.compile(r"^pair-([0-9]{4})\.(json|log)$")


class DirectTeacherHalfkp81V2ScreenError(ValueError):
    """The paired56 plan, durable state, or result violated its contract."""


@dataclass(frozen=True)
class ScreenPair:
    pair_index: int
    seed: int
    opening_fingerprint: str
    candidate_sente: str
    candidate_gote: str
    legal_moves: int
    log_bytes: int
    log_sha256: str
    receipt_sha256: str

    @property
    def halfpoints(self) -> int:
        return _halfpoints(self.candidate_sente) + _halfpoints(self.candidate_gote)


PairExecutor = Callable[
    [str | Path, Mapping[str, Any], int, int],
    ChildResult,
]


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _canonical_json(value: object) -> bytes:
    return protocol_v2.canonical_json_bytes(value)


def _domain_digest(domain: str, value: object) -> str:
    raw = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return _sha256(domain.encode("utf-8") + raw)


def _exact(value: Any, fields: set[str], label: str) -> Mapping[str, Any]:
    if type(value) is not dict or set(value) != fields:
        raise DirectTeacherHalfkp81V2ScreenError(f"{label} fields differ")
    return value


def _identity(value: Any, label: str, *, buckets: int | None = None) -> dict[str, Any]:
    fields = {"path", "bytes", "sha256"} | (
        {"buckets"} if buckets is not None else set()
    )
    item = _exact(value, fields, label)
    if type(item["path"]) is not str or not item["path"] or "\0" in item["path"]:
        raise DirectTeacherHalfkp81V2ScreenError(f"{label} path is invalid")
    if type(item["bytes"]) is not int or item["bytes"] < 1:
        raise DirectTeacherHalfkp81V2ScreenError(f"{label} bytes are invalid")
    if type(item["sha256"]) is not str or SHA256_RE.fullmatch(item["sha256"]) is None:
        raise DirectTeacherHalfkp81V2ScreenError(f"{label} SHA-256 is invalid")
    if buckets is not None and item["buckets"] != buckets:
        raise DirectTeacherHalfkp81V2ScreenError(f"{label} bucket count differs")
    return dict(item)


def _document_identity(value: Any, label: str, schema: str) -> dict[str, Any]:
    item = _exact(value, {"path", "bytes", "sha256", "schema"}, label)
    captured = _identity(
        {key: item[key] for key in ("path", "bytes", "sha256")},
        label,
    )
    if item["schema"] != schema:
        raise DirectTeacherHalfkp81V2ScreenError(f"{label} schema differs")
    return {**captured, "schema": schema}


def _resolve(repo_root: str | Path, path_value: str) -> str:
    configured = Path(path_value).expanduser()
    if not configured.is_absolute():
        configured = Path(repo_root).resolve() / configured
    return str(configured.resolve())


def _actual_identity(
    repo_root: str | Path,
    path_value: str,
    label: str,
    *,
    buckets: int | None = None,
) -> dict[str, Any]:
    path = _resolve(repo_root, path_value)
    actual, _ = protocol_v2.stable_file_identity(path, label)
    recorded_path = (
        path_value if Path(path_value).is_absolute() else Path(path_value).as_posix()
    )
    result = {
        "path": recorded_path,
        "bytes": actual["bytes"],
        "sha256": actual["sha256"],
    }
    if buckets is not None:
        result["buckets"] = buckets
    return result


def _authenticate_identity(
    repo_root: str | Path,
    declared: Mapping[str, Any],
    label: str,
) -> None:
    actual = _actual_identity(repo_root, declared["path"], label)
    if actual["bytes"] != declared["bytes"] or actual["sha256"] != declared["sha256"]:
        raise DirectTeacherHalfkp81V2ScreenError(f"{label} identity differs")


def _load_json(path: str, label: str) -> tuple[dict[str, Any], dict[str, Any]]:
    try:
        value, identity = protocol_v2.load_strict_json_file(path, label)
    except protocol_v2.DirectTeacherHalfkpV2Error as error:
        raise DirectTeacherHalfkp81V2ScreenError(str(error)) from error
    return value, identity


def _opening_set_sha256(fingerprints: Sequence[str]) -> str:
    raw = json.dumps(
        list(fingerprints),
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return _sha256(OPENING_SET_DOMAIN.encode("utf-8") + raw)


def validate_opening_manifest(
    value: Any,
    *,
    repo_root: str | Path,
) -> dict[str, Any]:
    manifest = _exact(
        value,
        {
            "schema",
            "status",
            "protocol",
            "prior_opening_inventory",
            "selection",
            "authority",
        },
        "opening manifest",
    )
    if (
        manifest["schema"] != OPENING_MANIFEST_SCHEMA
        or manifest["status"] != "prospective-frozen-before-training-or-paired-play"
    ):
        raise DirectTeacherHalfkp81V2ScreenError("opening manifest boundary differs")
    protocol_binding = _document_identity(
        manifest["protocol"],
        "opening manifest protocol",
        protocol_v2.PROTOCOL_SCHEMA,
    )
    if protocol_binding["path"] != "ml/protocols/direct-teacher-halfkp81-v2-plan.json":
        raise DirectTeacherHalfkp81V2ScreenError("opening protocol path differs")
    _authenticate_identity(repo_root, protocol_binding, "opening protocol")

    inventory = _exact(
        manifest["prior_opening_inventory"],
        {"path", "bytes", "sha256", "fingerprints", "canonical_list_sha256"},
        "prior opening inventory",
    )
    inventory_identity = _identity(
        {key: inventory[key] for key in ("path", "bytes", "sha256")},
        "prior opening inventory",
    )
    if (
        inventory_identity["path"] != OPENING_INVENTORY_PATH
        or inventory["fingerprints"] != 3_198
        or inventory["canonical_list_sha256"]
        != "0dde79f19d21dbf671de9525dc87bd4e9c8a617e1a06e3a61f704f1dcbaed291"
    ):
        raise DirectTeacherHalfkp81V2ScreenError("prior opening inventory drifts")
    _authenticate_identity(repo_root, inventory_identity, "prior opening inventory")
    inventory_value, _inventory_file_identity = _load_json(
        _resolve(repo_root, inventory_identity["path"]),
        "prior opening inventory",
    )
    enrolled = inventory_value.get("full_enrolled_sorted_unique_fingerprints")
    if (
        type(enrolled) is not list
        or len(enrolled) != 3_198
        or any(
            type(item) is not str or SHA256_RE.fullmatch(item) is None
            for item in enrolled
        )
        or enrolled != sorted(set(enrolled))
        or _sha256(
            json.dumps(enrolled, ensure_ascii=False, separators=(",", ":")).encode(
                "utf-8"
            )
        )
        != inventory["canonical_list_sha256"]
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "prior opening inventory list is invalid"
        )

    selection = _exact(
        manifest["selection"],
        {
            "rule",
            "pair_seed_scan_start",
            "pairs",
            "games_per_pair",
            "fingerprint_domain",
            "derived_seed_rule",
            "pair_index_within_harness",
            "skipped",
            "pairs_selected",
            "opening_set_sha256",
            "prior_inventory_overlap",
            "within_selection_duplicates",
        },
        "opening selection",
    )
    if (
        selection["rule"]
        != (
            "scan upward from 1200001 and accept the first 28 fingerprints "
            "absent from the complete prior-opening inventory and the current selection"
        )
        or selection["pair_seed_scan_start"] != PAIR_SEED_START
        or selection["pairs"] != PAIR_COUNT
        or selection["games_per_pair"] != 2
        or selection["fingerprint_domain"] != "shogi-nnue-fixed-time-opening-v1\0"
        or selection["derived_seed_rule"]
        != ("0x5eed00 + pair_seed * 15485863 + " "pair_index_within_harness * 104729")
        or selection["pair_index_within_harness"] != 0
        or selection["skipped"] != []
        or selection["prior_inventory_overlap"] != 0
        or selection["within_selection_duplicates"] != 0
    ):
        raise DirectTeacherHalfkp81V2ScreenError("opening selection contract differs")
    selected = selection["pairs_selected"]
    if type(selected) is not list or len(selected) != PAIR_COUNT:
        raise DirectTeacherHalfkp81V2ScreenError("opening selection count differs")
    fingerprints: list[str] = []
    for index, raw in enumerate(selected):
        pair = _exact(
            raw,
            {"pair_index", "seed", "derived_seed", "opening_fingerprint"},
            f"opening pair {index}",
        )
        seed = PAIR_SEED_START + index
        fingerprint = pair["opening_fingerprint"]
        if (
            pair["pair_index"] != index
            or pair["seed"] != seed
            or pair["derived_seed"] != 0x5EED00 + seed * 15_485_863
            or type(fingerprint) is not str
            or SHA256_RE.fullmatch(fingerprint) is None
        ):
            raise DirectTeacherHalfkp81V2ScreenError(
                f"opening pair {index} binding differs"
            )
        fingerprints.append(fingerprint)
    if len(set(fingerprints)) != PAIR_COUNT or set(fingerprints).intersection(enrolled):
        raise DirectTeacherHalfkp81V2ScreenError(
            "selected openings repeat or overlap prior evidence"
        )
    if selection["opening_set_sha256"] != _opening_set_sha256(fingerprints):
        raise DirectTeacherHalfkp81V2ScreenError("opening set digest differs")
    if manifest["authority"] != {
        "candidate_inference_authorized": False,
        "paired_play_authorized": False,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
    }:
        raise DirectTeacherHalfkp81V2ScreenError("opening authority differs")
    return dict(manifest)


_STATIC_KEYS = tuple(protocol_v2.EXPECTED_STATIC_SANITY["checks"])


def _validate_trainer_result(
    value: Any,
    *,
    execution_plan_identity: Mapping[str, Any],
    dataset_manifest_identity: Mapping[str, Any],
) -> dict[str, Any]:
    result = _exact(
        value,
        {
            "schema",
            "status",
            "implementation",
            "execution_plan",
            "dataset_manifest",
            "training",
            "epochs_completed",
            "candidate_count",
            "checkpoint_selection",
            "best_checkpoint_selection",
            "additional_epoch_or_seed",
            "metrics",
            "artifacts",
            "live_weights",
            "paired56_authorized",
            "expanded_stage_authorized",
            "live_weight_write_authorized",
        },
        "trainer result",
    )
    if (
        result["schema"] != TRAINER_SCHEMA
        or result["status"] != "complete-final-epoch-frozen-static-pending"
        or result["epochs_completed"] != 1
        or result["candidate_count"] != 1
        or result["checkpoint_selection"] != "final-epoch-1-only"
        or result["best_checkpoint_selection"] is not False
        or result["additional_epoch_or_seed"] is not False
        or result["paired56_authorized"] is not False
        or result["expanded_stage_authorized"] is not False
        or result["live_weight_write_authorized"] is not False
    ):
        raise DirectTeacherHalfkp81V2ScreenError("trainer result boundary differs")
    if (
        _document_identity(
            result["execution_plan"],
            "trainer execution plan",
            protocol_v2.EXECUTION_PLAN_SCHEMA,
        )
        != execution_plan_identity
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "trainer execution-plan binding differs"
        )
    if (
        _document_identity(
            result["dataset_manifest"],
            "trainer dataset manifest",
            protocol_v2.DATASET_MANIFEST_SCHEMA,
        )
        != dataset_manifest_identity
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "trainer dataset-manifest binding differs"
        )
    for field in ("implementation", "training", "metrics", "artifacts", "live_weights"):
        if type(result[field]) is not dict:
            raise DirectTeacherHalfkp81V2ScreenError(
                f"trainer {field} is not an object"
            )
    artifacts = result["artifacts"]
    if set(artifacts) != {
        "final_checkpoint",
        "initializer_weights",
        "candidate_weights",
        "candidate_reference",
    }:
        raise DirectTeacherHalfkp81V2ScreenError("trainer artifact fields differ")
    candidate = _identity(
        artifacts["candidate_weights"],
        "trainer candidate weights",
        buckets=CANDIDATE_BUCKETS,
    )
    initializer_weights = _identity(
        artifacts["initializer_weights"],
        "trainer initializer weights",
        buckets=CANDIDATE_BUCKETS,
    )
    if candidate["sha256"] == initializer_weights["sha256"]:
        raise DirectTeacherHalfkp81V2ScreenError(
            "trainer candidate did not change from initializer export"
        )
    live = _exact(
        result["live_weights"],
        {"before", "after", "byte_exact_unchanged"},
        "trainer live weights",
    )
    before = _identity(live["before"], "trainer live before")
    after = _identity(live["after"], "trainer live after")
    if live["byte_exact_unchanged"] is not True or before != after:
        raise DirectTeacherHalfkp81V2ScreenError(
            "trainer did not preserve live weights byte-exact"
        )
    return dict(result)


def _static_check_passes(key: str, observed: Any, requirement: Any) -> bool:
    if key == "finite_training_and_inference":
        return observed is True and requirement is True
    if type(observed) not in (int, float) or not math.isfinite(float(observed)):
        return False
    if key in {
        "technical_faults_maximum",
        "float_export_roundtrip_mismatches_maximum",
        "wasm_parity_mismatches_maximum",
        "quantized_mean_abs_cp_delta_ratio_maximum",
        "quantized_max_abs_cp_delta_ratio_maximum",
        "research_runtime_search_slowdown_percent_maximum",
    }:
        return float(observed) <= float(requirement)
    return float(observed) >= float(requirement)


def _validate_static_result(
    value: Any,
    *,
    protocol_identity: Mapping[str, Any],
    execution_plan_identity: Mapping[str, Any],
    dataset_manifest_identity: Mapping[str, Any],
    execution_plan: Mapping[str, Any],
    trainer_result: Mapping[str, Any],
    trainer_identity: Mapping[str, Any],
) -> dict[str, Any]:
    result = _exact(
        value,
        {
            "schema",
            "status",
            "protocol",
            "execution_plan",
            "dataset_manifest",
            "initializer",
            "live_weights",
            "trainer_result",
            "candidate_weights",
            "runtime_sanity",
            "checks",
            "all_checks_passed",
            "technical_faults",
            "paired56_authorized",
            "expanded_stage_authorized",
            "live_weight_write_authorized",
        },
        "static sanity result",
    )
    if (
        result["schema"] != STATIC_SCHEMA
        or result["status"] != STATIC_PASS_STATUS
        or result["all_checks_passed"] is not True
        or result["technical_faults"] != 0
        or result["paired56_authorized"] is not True
        or result["expanded_stage_authorized"] is not False
        or result["live_weight_write_authorized"] is not False
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "static sanity did not authorize paired56"
        )
    if (
        _document_identity(
            result["protocol"],
            "static protocol",
            protocol_v2.PROTOCOL_SCHEMA,
        )
        != protocol_identity
    ):
        raise DirectTeacherHalfkp81V2ScreenError("static protocol binding differs")
    if (
        _document_identity(
            result["execution_plan"],
            "static execution plan",
            protocol_v2.EXECUTION_PLAN_SCHEMA,
        )
        != execution_plan_identity
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "static execution-plan binding differs"
        )
    if (
        _document_identity(
            result["dataset_manifest"],
            "static dataset manifest",
            protocol_v2.DATASET_MANIFEST_SCHEMA,
        )
        != dataset_manifest_identity
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "static dataset-manifest binding differs"
        )
    initializer = _identity(result["initializer"], "static initializer")
    if initializer != _identity(
        {
            key: execution_plan["inputs"]["initializer"][key]
            for key in ("path", "bytes", "sha256")
        },
        "execution initializer",
    ):
        raise DirectTeacherHalfkp81V2ScreenError("static initializer binding differs")
    live = _identity(result["live_weights"], "static live weights")
    if live != _identity(
        {
            key: execution_plan["inputs"]["live_weights"][key]
            for key in ("path", "bytes", "sha256")
        },
        "execution live weights",
    ):
        raise DirectTeacherHalfkp81V2ScreenError("static live-weight binding differs")
    if (
        _document_identity(
            result["trainer_result"],
            "static trainer result",
            TRAINER_SCHEMA,
        )
        != trainer_identity
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "static trainer-result binding differs"
        )
    candidate = _identity(
        result["candidate_weights"],
        "static candidate weights",
        buckets=CANDIDATE_BUCKETS,
    )
    if candidate != _identity(
        trainer_result["artifacts"]["candidate_weights"],
        "trainer candidate weights",
        buckets=CANDIDATE_BUCKETS,
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "static candidate differs from trainer candidate"
        )
    runtime_sanity = _document_identity(
        result["runtime_sanity"],
        "static runtime sanity",
        RUNTIME_SANITY_SCHEMA,
    )
    checks = _exact(result["checks"], set(_STATIC_KEYS), "static checks")
    expected_requirements = protocol_v2.EXPECTED_STATIC_SANITY["checks"]
    for key in _STATIC_KEYS:
        check = _exact(
            checks[key],
            {"observed", "requirement", "passed"},
            f"static check {key}",
        )
        observed = check["observed"]
        if (
            check["requirement"] != expected_requirements[key]
            or check["passed"] is not True
            or not _static_check_passes(
                key,
                observed,
                expected_requirements[key],
            )
        ):
            raise DirectTeacherHalfkp81V2ScreenError(
                f"static check did not pass exactly: {key}"
            )
    return {
        **dict(result),
        "candidate_weights": candidate,
        "initializer": initializer,
        "live_weights": live,
        "runtime_sanity": runtime_sanity,
    }


def _validate_runtime_sanity_document(
    value: Any,
    *,
    trainer_result: Mapping[str, Any],
    candidate_weights: Mapping[str, Any],
    runtime_wasm: Mapping[str, Any],
) -> dict[str, Any]:
    receipt = _exact(
        value,
        {
            "schema",
            "status",
            "runtime",
            "config",
            "models",
            "reference",
            "parity",
            "fixed_depth_search",
            "throughput",
            "technical_faults",
        },
        "runtime sanity receipt",
    )
    if (
        receipt["schema"] != RUNTIME_SANITY_SCHEMA
        or receipt["status"] != "complete-pass"
        or receipt["technical_faults"] != 0
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "runtime sanity did not complete cleanly"
        )
    runtime = _identity(receipt["runtime"], "runtime sanity WASM")
    if (
        runtime["bytes"] != runtime_wasm["bytes"]
        or runtime["sha256"] != runtime_wasm["sha256"]
    ):
        raise DirectTeacherHalfkp81V2ScreenError("runtime sanity WASM binding differs")
    expected_models = {
        "initializer": _identity(
            trainer_result["artifacts"]["initializer_weights"],
            "runtime initializer weights",
            buckets=CANDIDATE_BUCKETS,
        ),
        "candidate": _identity(
            candidate_weights,
            "runtime candidate weights",
            buckets=CANDIDATE_BUCKETS,
        ),
    }
    if receipt["models"] != expected_models:
        raise DirectTeacherHalfkp81V2ScreenError("runtime sanity model chain differs")
    if receipt["config"] != {
        "position_count": 1000,
        "search_cases": 6,
        "depth": 5,
        "q_depth": 8,
        "repetitions": 3,
        "minimum_timing_ms": 250,
        "slowdown_percent_maximum": 5,
        "k": 600,
        "buckets": 81,
    }:
        raise DirectTeacherHalfkp81V2ScreenError("runtime sanity configuration differs")
    for field in ("reference", "fixed_depth_search"):
        if type(receipt[field]) is not dict:
            raise DirectTeacherHalfkp81V2ScreenError(
                f"runtime sanity {field} is not an object"
            )
    parity = _exact(
        receipt["parity"],
        {"tested", "mismatches", "examples"},
        "runtime parity",
    )
    if (
        type(parity["tested"]) is not int
        or parity["tested"] < 1
        or parity["mismatches"] != 0
        or parity["examples"] != []
    ):
        raise DirectTeacherHalfkp81V2ScreenError("runtime parity did not pass")
    throughput = receipt["throughput"]
    if type(throughput) is not dict:
        raise DirectTeacherHalfkp81V2ScreenError("runtime throughput is not an object")
    for field in ("median_slowdown_percent", "aggregate_slowdown_percent"):
        observed = throughput.get(field)
        if (
            type(observed) not in (int, float)
            or not math.isfinite(float(observed))
            or float(observed) > 5
        ):
            raise DirectTeacherHalfkp81V2ScreenError(f"runtime {field} did not pass")
    return dict(receipt)


def _validate_dataset_firewall(
    execution_plan: Mapping[str, Any],
) -> dict[str, Any]:
    protocol_path = execution_plan["protocol"]["path"]
    dataset_path = execution_plan["dataset_manifest"]["path"]
    protocol, protocol_identity = _load_json(protocol_path, "screen-bound v2 protocol")
    protocol = protocol_v2.validate_protocol_document(protocol)
    if {
        **protocol_identity,
        "schema": protocol_v2.PROTOCOL_SCHEMA,
    } != execution_plan["protocol"]:
        raise DirectTeacherHalfkp81V2ScreenError(
            "execution plan protocol identity differs"
        )
    dataset, dataset_identity = _load_json(
        dataset_path, "screen-bound pilot dataset manifest"
    )
    protocol_v2.validate_dataset_manifest_document(
        dataset,
        protocol=protocol,
        protocol_identity=protocol_identity,
    )
    if {
        **dataset_identity,
        "schema": protocol_v2.DATASET_MANIFEST_SCHEMA,
    } != execution_plan["dataset_manifest"]:
        raise DirectTeacherHalfkp81V2ScreenError(
            "execution plan dataset-manifest identity differs"
        )
    return {
        "dataset_manifest": dict(execution_plan["dataset_manifest"]),
        "pilot_training_tune_protected_disjoint_verified": True,
        "excluded_parent_overlap": 0,
        "excluded_position_overlap": 0,
        "excluded_child_position_overlap": 0,
        "excluded_semantic_overlap": 0,
        "cross_role_game_parent_position_child_semantic_overlap": 0,
    }


def build_screen_plan(
    *,
    repo_root: str,
    execution_plan_path: str,
    trainer_result_path: str,
    static_result_path: str,
    opening_manifest_path: str | None = None,
) -> dict[str, Any]:
    root = Path(repo_root).resolve()
    execution, execution_identity = _load_json(execution_plan_path, "v2 execution plan")
    execution = protocol_v2.validate_execution_plan_document(execution)
    execution_binding = {
        **execution_identity,
        "schema": protocol_v2.EXECUTION_PLAN_SCHEMA,
    }
    trainer, trainer_identity_raw = _load_json(trainer_result_path, "v2 trainer result")
    trainer_binding = {
        **trainer_identity_raw,
        "schema": TRAINER_SCHEMA,
    }
    trainer = _validate_trainer_result(
        trainer,
        execution_plan_identity=execution_binding,
        dataset_manifest_identity=execution["dataset_manifest"],
    )
    static, static_identity = _load_json(static_result_path, "v2 static sanity result")
    static = _validate_static_result(
        static,
        protocol_identity=execution["protocol"],
        execution_plan_identity=execution_binding,
        dataset_manifest_identity=execution["dataset_manifest"],
        execution_plan=execution,
        trainer_result=trainer,
        trainer_identity=trainer_binding,
    )
    candidate = static["candidate_weights"]
    for label, item in (
        ("static initializer", static["initializer"]),
        ("static live weights", static["live_weights"]),
        ("frozen candidate weights", candidate),
        ("runtime sanity", static["runtime_sanity"]),
    ):
        _authenticate_identity(root, item, label)

    opening_path = opening_manifest_path or str(root / OPENING_MANIFEST_PATH)
    opening, opening_identity = _load_json(opening_path, "v2 paired56 openings")
    opening = validate_opening_manifest(opening, repo_root=root)
    opening_binding = {
        **opening_identity,
        "schema": OPENING_MANIFEST_SCHEMA,
    }

    live = _actual_identity(
        root,
        protocol_v2.EXPECTED_INPUTS["live_weights"]["path"],
        "immutable live weights",
        buckets=LIVE_BUCKETS,
    )
    expected_live = protocol_v2.EXPECTED_INPUTS["live_weights"]
    if (
        live["bytes"] != expected_live["bytes"]
        or live["sha256"] != expected_live["sha256"]
        or candidate["sha256"] == live["sha256"]
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "live identity drifted or candidate equals live"
        )
    runtime = _actual_identity(root, RUNTIME_PATH, "HalfKP81 research WASM")
    harness = _actual_identity(root, HARNESS_PATH, "fixed-time match harness")
    controller = _actual_identity(root, CONTROLLER_PATH, "paired56 controller")
    runtime_sanity_value, _ = _load_json(
        static["runtime_sanity"]["path"],
        "v2 runtime sanity result",
    )
    _validate_runtime_sanity_document(
        runtime_sanity_value,
        trainer_result=trainer,
        candidate_weights=candidate,
        runtime_wasm=runtime,
    )
    firewall = _validate_dataset_firewall(execution)
    selected = opening["selection"]["pairs_selected"]
    plan = {
        "schema": SCREEN_PLAN_SCHEMA,
        "status": PLAN_STATUS,
        "inputs": {
            "execution_plan": execution_binding,
            "trainer_result": trainer_binding,
            "static_sanity_result": {
                **static_identity,
                "schema": STATIC_SCHEMA,
            },
            "runtime_sanity": dict(static["runtime_sanity"]),
            "opening_manifest": opening_binding,
        },
        "assets": {
            "candidate_weights": candidate,
            "live_weights": live,
            "research_wasm": runtime,
            "match_harness": harness,
            "controller": controller,
        },
        "data_firewall": firewall,
        "match": {
            "pairs": PAIR_COUNT,
            "games": GAME_COUNT,
            "games_per_pair": 2,
            "colors": ["candidate-sente", "candidate-gote"],
            "pair_workers": PAIR_WORKERS,
            "milliseconds_per_move": MILLISECONDS_PER_MOVE,
            "maximum_plies": MAXIMUM_PLIES,
            "opening_book": False,
            "external_mate_solver": False,
            "fallback": False,
            "pair_seeds": [entry["seed"] for entry in selected],
            "opening_fingerprints": [
                entry["opening_fingerprint"] for entry in selected
            ],
            "opening_set_sha256": opening["selection"]["opening_set_sha256"],
        },
        "decision": {
            "score_unit": "candidate-halfpoints-win2-draw1-loss0",
            "denominator_halfpoints": DENOMINATOR_HALFPOINTS,
            "minimum_candidate_halfpoints": PASS_HALFPOINTS,
            "futility_stop": (
                "current candidate halfpoints plus every remaining possible "
                "halfpoint is below 62"
            ),
            "technical_faults_maximum": 0,
            "strength_failure_terminal": True,
            "technical_fault_resume_only": True,
            "pass_authorizes_only": "separately-preregistered-expanded-data-stage",
        },
        "authority": {
            "trainer_complete": True,
            "static_sanity_passed": True,
            "paired56_authorized": True,
            "expanded_stage_authorized": False,
            "live_weight_write_authorized": False,
        },
    }
    return validate_screen_plan(plan)


def validate_screen_plan(value: Any) -> dict[str, Any]:
    plan = _exact(
        value,
        {
            "schema",
            "status",
            "inputs",
            "assets",
            "data_firewall",
            "match",
            "decision",
            "authority",
        },
        "paired56 screen plan",
    )
    if plan["schema"] != SCREEN_PLAN_SCHEMA or plan["status"] != PLAN_STATUS:
        raise DirectTeacherHalfkp81V2ScreenError("screen plan boundary differs")
    inputs = _exact(
        plan["inputs"],
        {
            "execution_plan",
            "trainer_result",
            "static_sanity_result",
            "runtime_sanity",
            "opening_manifest",
        },
        "screen plan inputs",
    )
    _document_identity(
        inputs["execution_plan"],
        "screen execution plan",
        protocol_v2.EXECUTION_PLAN_SCHEMA,
    )
    trainer = inputs["trainer_result"]
    _document_identity(
        trainer,
        "screen trainer result",
        TRAINER_SCHEMA,
    )
    _document_identity(
        inputs["static_sanity_result"],
        "screen static result",
        STATIC_SCHEMA,
    )
    _document_identity(
        inputs["runtime_sanity"],
        "screen runtime sanity",
        RUNTIME_SANITY_SCHEMA,
    )
    _document_identity(
        inputs["opening_manifest"],
        "screen opening manifest",
        OPENING_MANIFEST_SCHEMA,
    )
    assets = _exact(
        plan["assets"],
        {
            "candidate_weights",
            "live_weights",
            "research_wasm",
            "match_harness",
            "controller",
        },
        "screen assets",
    )
    candidate = _identity(
        assets["candidate_weights"],
        "screen candidate weights",
        buckets=CANDIDATE_BUCKETS,
    )
    live = _identity(
        assets["live_weights"], "screen live weights", buckets=LIVE_BUCKETS
    )
    if candidate["sha256"] == live["sha256"]:
        raise DirectTeacherHalfkp81V2ScreenError("candidate and live hashes repeat")
    for role in ("research_wasm", "match_harness", "controller"):
        _identity(assets[role], f"screen {role}")
    if (
        assets["research_wasm"]["path"] != RUNTIME_PATH
        or assets["match_harness"]["path"] != HARNESS_PATH
        or assets["controller"]["path"] != CONTROLLER_PATH
    ):
        raise DirectTeacherHalfkp81V2ScreenError("screen executable path differs")
    firewall = _exact(
        plan["data_firewall"],
        {
            "dataset_manifest",
            "pilot_training_tune_protected_disjoint_verified",
            "excluded_parent_overlap",
            "excluded_position_overlap",
            "excluded_child_position_overlap",
            "excluded_semantic_overlap",
            "cross_role_game_parent_position_child_semantic_overlap",
        },
        "screen data firewall",
    )
    _document_identity(
        firewall["dataset_manifest"],
        "screen dataset manifest",
        protocol_v2.DATASET_MANIFEST_SCHEMA,
    )
    if firewall["pilot_training_tune_protected_disjoint_verified"] is not True or any(
        firewall[key] != 0
        for key in (
            "excluded_parent_overlap",
            "excluded_position_overlap",
            "excluded_child_position_overlap",
            "excluded_semantic_overlap",
            "cross_role_game_parent_position_child_semantic_overlap",
        )
    ):
        raise DirectTeacherHalfkp81V2ScreenError("screen data firewall did not pass")
    match = _exact(
        plan["match"],
        {
            "pairs",
            "games",
            "games_per_pair",
            "colors",
            "pair_workers",
            "milliseconds_per_move",
            "maximum_plies",
            "opening_book",
            "external_mate_solver",
            "fallback",
            "pair_seeds",
            "opening_fingerprints",
            "opening_set_sha256",
        },
        "screen match",
    )
    expected_seeds = list(range(PAIR_SEED_START, PAIR_SEED_START + PAIR_COUNT))
    fingerprints = match["opening_fingerprints"]
    if (
        match["pairs"] != PAIR_COUNT
        or match["games"] != GAME_COUNT
        or match["games_per_pair"] != 2
        or match["colors"] != ["candidate-sente", "candidate-gote"]
        or match["pair_workers"] != PAIR_WORKERS
        or match["milliseconds_per_move"] != MILLISECONDS_PER_MOVE
        or match["maximum_plies"] != MAXIMUM_PLIES
        or match["opening_book"] is not False
        or match["external_mate_solver"] is not False
        or match["fallback"] is not False
        or match["pair_seeds"] != expected_seeds
        or type(fingerprints) is not list
        or len(fingerprints) != PAIR_COUNT
        or len(set(fingerprints)) != PAIR_COUNT
        or any(
            type(item) is not str or SHA256_RE.fullmatch(item) is None
            for item in fingerprints
        )
        or match["opening_set_sha256"] != _opening_set_sha256(fingerprints)
    ):
        raise DirectTeacherHalfkp81V2ScreenError("screen match contract differs")
    if plan["decision"] != {
        "score_unit": "candidate-halfpoints-win2-draw1-loss0",
        "denominator_halfpoints": DENOMINATOR_HALFPOINTS,
        "minimum_candidate_halfpoints": PASS_HALFPOINTS,
        "futility_stop": (
            "current candidate halfpoints plus every remaining possible "
            "halfpoint is below 62"
        ),
        "technical_faults_maximum": 0,
        "strength_failure_terminal": True,
        "technical_fault_resume_only": True,
        "pass_authorizes_only": "separately-preregistered-expanded-data-stage",
    }:
        raise DirectTeacherHalfkp81V2ScreenError("screen decision contract differs")
    if plan["authority"] != {
        "trainer_complete": True,
        "static_sanity_passed": True,
        "paired56_authorized": True,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
    }:
        raise DirectTeacherHalfkp81V2ScreenError("screen authority differs")
    return dict(plan)


def _create_only(path: Path, raw: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if os.path.lexists(path):
        raise DirectTeacherHalfkp81V2ScreenError(
            f"refusing to overwrite create-only artifact: {path}"
        )
    temporary: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=f".{path.name}.",
            suffix=".tmp",
            dir=path.parent,
            delete=False,
        ) as handle:
            temporary = handle.name
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temporary, path)
        except FileExistsError as error:
            raise DirectTeacherHalfkp81V2ScreenError(
                f"refusing to overwrite create-only artifact: {path}"
            ) from error
        os.unlink(temporary)
        temporary = None
        parent = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    finally:
        if temporary is not None:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass


def publish_screen_plan(plan: Mapping[str, Any], output_path: str) -> dict[str, Any]:
    captured = validate_screen_plan(plan)
    raw = _canonical_json(captured)
    path = Path(output_path).expanduser().resolve()
    _create_only(path, raw)
    return {"path": str(path), "bytes": len(raw), "sha256": _sha256(raw)}


def _authenticate_screen_plan(
    repo_root: str | Path,
    plan_path: str,
    expected_sha256: str,
) -> tuple[dict[str, Any], str]:
    plan, identity = _load_json(plan_path, "paired56 screen plan")
    raw = Path(identity["path"]).read_bytes()
    if (
        identity["sha256"] != expected_sha256
        or raw != _canonical_json(plan)
        or SHA256_RE.fullmatch(expected_sha256) is None
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "screen plan is not the exact canonical requested plan"
        )
    plan = validate_screen_plan(plan)
    root = Path(repo_root).resolve()
    for role, item in plan["inputs"].items():
        _authenticate_identity(root, item, f"screen input {role}")
    for role, item in plan["assets"].items():
        _authenticate_identity(root, item, f"screen asset {role}")
    opening_value, _ = _load_json(
        _resolve(root, plan["inputs"]["opening_manifest"]["path"]),
        "screen opening manifest",
    )
    opening_value = validate_opening_manifest(opening_value, repo_root=root)
    if [
        entry["seed"] for entry in opening_value["selection"]["pairs_selected"]
    ] != plan["match"]["pair_seeds"] or [
        entry["opening_fingerprint"]
        for entry in opening_value["selection"]["pairs_selected"]
    ] != plan[
        "match"
    ][
        "opening_fingerprints"
    ]:
        raise DirectTeacherHalfkp81V2ScreenError(
            "screen opening plan differs from the frozen opening manifest"
        )
    static_value, _ = _load_json(
        plan["inputs"]["static_sanity_result"]["path"],
        "screen static sanity result",
    )
    execution_value, _ = _load_json(
        plan["inputs"]["execution_plan"]["path"],
        "screen execution plan",
    )
    execution_value = protocol_v2.validate_execution_plan_document(execution_value)
    trainer_value, _ = _load_json(
        plan["inputs"]["trainer_result"]["path"],
        "screen trainer result",
    )
    trainer_value = _validate_trainer_result(
        trainer_value,
        execution_plan_identity=plan["inputs"]["execution_plan"],
        dataset_manifest_identity=execution_value["dataset_manifest"],
    )
    static_value = _validate_static_result(
        static_value,
        protocol_identity=execution_value["protocol"],
        execution_plan_identity=plan["inputs"]["execution_plan"],
        dataset_manifest_identity=execution_value["dataset_manifest"],
        execution_plan=execution_value,
        trainer_result=trainer_value,
        trainer_identity=plan["inputs"]["trainer_result"],
    )
    if static_value["runtime_sanity"] != plan["inputs"]["runtime_sanity"]:
        raise DirectTeacherHalfkp81V2ScreenError(
            "screen runtime-sanity identity differs from static result"
        )
    runtime_sanity_value, _ = _load_json(
        plan["inputs"]["runtime_sanity"]["path"],
        "screen runtime sanity result",
    )
    _validate_runtime_sanity_document(
        runtime_sanity_value,
        trainer_result=trainer_value,
        candidate_weights=plan["assets"]["candidate_weights"],
        runtime_wasm=plan["assets"]["research_wasm"],
    )
    firewall = _validate_dataset_firewall(execution_value)
    if firewall != plan["data_firewall"]:
        raise DirectTeacherHalfkp81V2ScreenError("screen data firewall binding differs")
    return plan, identity["sha256"]


def _halfpoints(result: str) -> int:
    if result == "win":
        return 2
    if result == "draw":
        return 1
    if result == "loss":
        return 0
    raise DirectTeacherHalfkp81V2ScreenError("candidate result is invalid")


def _pair_body(
    screen_plan_sha256: str,
    parsed: PairResult,
) -> dict[str, Any]:
    return {
        "schema": PAIR_SCHEMA,
        "screen_plan_sha256": screen_plan_sha256,
        "pair_index": parsed.pair_index,
        "seed": parsed.seed,
        "opening_fingerprint": parsed.opening_fingerprint,
        "candidate_sente": parsed.candidate_sente,
        "candidate_gote": parsed.candidate_gote,
        "candidate_halfpoints": parsed.halfpoints,
        "legal_moves": parsed.legal_moves,
        "log_bytes": parsed.log_bytes,
        "log_sha256": parsed.log_sha256,
        "technical_fault": False,
    }


def _seal_pair(screen_plan_sha256: str, parsed: PairResult) -> dict[str, Any]:
    body = _pair_body(screen_plan_sha256, parsed)
    return {**body, "receipt_sha256": _domain_digest(PAIR_DIGEST_DOMAIN, body)}


def _capture_pair(
    value: Any,
    *,
    raw: bytes,
    raw_log: bytes,
    screen_plan_sha256: str,
    plan: Mapping[str, Any],
    pair_index: int,
) -> ScreenPair:
    receipt = _exact(
        value,
        {
            "schema",
            "screen_plan_sha256",
            "pair_index",
            "seed",
            "opening_fingerprint",
            "candidate_sente",
            "candidate_gote",
            "candidate_halfpoints",
            "legal_moves",
            "log_bytes",
            "log_sha256",
            "technical_fault",
            "receipt_sha256",
        },
        f"pair {pair_index} receipt",
    )
    seed = plan["match"]["pair_seeds"][pair_index]
    parsed = parse_pair_log(
        raw_log,
        pair_index,
        seed,
        plan["match"]["milliseconds_per_move"],
    )
    expected = _seal_pair(screen_plan_sha256, parsed)
    if (
        raw != _canonical_json(receipt)
        or receipt != expected
        or parsed.opening_fingerprint
        != plan["match"]["opening_fingerprints"][pair_index]
        or f"max-plies={MAXIMUM_PLIES}" not in raw_log.decode("utf-8")
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            f"pair {pair_index} receipt or opening binding differs"
        )
    return ScreenPair(
        pair_index=pair_index,
        seed=seed,
        opening_fingerprint=parsed.opening_fingerprint,
        candidate_sente=parsed.candidate_sente,
        candidate_gote=parsed.candidate_gote,
        legal_moves=parsed.legal_moves,
        log_bytes=parsed.log_bytes,
        log_sha256=parsed.log_sha256,
        receipt_sha256=receipt["receipt_sha256"],
    )


def analyze_screen(
    plan: Mapping[str, Any],
    pairs: Sequence[ScreenPair],
    *,
    technical_faults: int = 0,
) -> dict[str, Any]:
    ordered = sorted(pairs, key=lambda item: item.pair_index)
    if (
        type(technical_faults) is not int
        or technical_faults < 0
        or len({pair.pair_index for pair in ordered}) != len(ordered)
        or any(
            pair.pair_index < 0
            or pair.pair_index >= PAIR_COUNT
            or pair.seed != plan["match"]["pair_seeds"][pair.pair_index]
            or pair.opening_fingerprint
            != plan["match"]["opening_fingerprints"][pair.pair_index]
            for pair in ordered
        )
        or len({pair.opening_fingerprint for pair in ordered}) != len(ordered)
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "paired56 durable pair evidence is invalid"
        )
    games = len(ordered) * 2
    wins = sum(
        result == "win"
        for pair in ordered
        for result in (pair.candidate_sente, pair.candidate_gote)
    )
    draws = sum(
        result == "draw"
        for pair in ordered
        for result in (pair.candidate_sente, pair.candidate_gote)
    )
    losses = games - wins - draws
    halfpoints = wins * 2 + draws
    remaining_halfpoints = (GAME_COUNT - games) * 2
    maximum = halfpoints + remaining_halfpoints
    complete = len(ordered) == PAIR_COUNT
    if technical_faults:
        status = "technical-fault-no-strength-conclusion"
        strength_conclusion = False
        passed = False
        resume_authorized = True
        pilot_family_closed = False
    elif complete and halfpoints >= PASS_HALFPOINTS:
        status = "passed-62-of-112-expanded-stage-only"
        strength_conclusion = True
        passed = True
        resume_authorized = False
        pilot_family_closed = False
    elif complete or maximum < PASS_HALFPOINTS:
        status = (
            "failed-strength-complete-pilot-family-closed"
            if complete
            else "failed-strength-futility-pilot-family-closed"
        )
        strength_conclusion = True
        passed = False
        resume_authorized = False
        pilot_family_closed = True
    else:
        status = "pending"
        strength_conclusion = False
        passed = False
        resume_authorized = False
        pilot_family_closed = False
    result = {
        "schema": RESULT_SCHEMA,
        "status": status,
        "planned_pairs": PAIR_COUNT,
        "planned_games": GAME_COUNT,
        "completed_pairs": len(ordered),
        "completed_games": games,
        "candidate_wins": wins,
        "candidate_draws": draws,
        "candidate_losses": losses,
        "candidate_halfpoints": halfpoints,
        "observed_denominator_halfpoints": games * 2,
        "maximum_possible_final_halfpoints": maximum,
        "minimum_candidate_halfpoints": PASS_HALFPOINTS,
        "technical_faults": technical_faults,
        "all_moves_legal": all(pair.legal_moves >= 0 for pair in ordered),
        "all_openings_unique": True,
        "strength_conclusion_allowed": strength_conclusion,
        "passed": passed,
        "pilot_family_closed": pilot_family_closed,
        "technical_fault_resume_authorized": resume_authorized,
        "expanded_stage_authorized": passed,
        "live_weight_write_authorized": False,
        "pair_receipt_sha256s": [pair.receipt_sha256 for pair in ordered],
    }
    return {
        **result,
        "result_sha256": _domain_digest(RESULT_DIGEST_DOMAIN, result),
    }


def execute_pair_subprocess(
    repo_root: str | Path,
    plan: Mapping[str, Any],
    _pair_index: int,
    seed: int,
) -> ChildResult:
    root = Path(repo_root).resolve()
    assets = plan["assets"]
    command = [
        os.environ.get("NODE", "node"),
        "-r",
        "tsx/cjs",
        str(root / assets["match_harness"]["path"]),
        _resolve(root, assets["candidate_weights"]["path"]),
        "--vs",
        _resolve(root, assets["live_weights"]["path"]),
        "--games",
        "2",
        "--ms",
        str(MILLISECONDS_PER_MOVE),
        "--seed",
        str(seed),
        "--k",
        "600",
        "--scale-numer",
        "1",
        "--scale-denom",
        "1",
        "--max-plies",
        str(MAXIMUM_PLIES),
        "--wasm-path",
        _resolve(root, assets["research_wasm"]["path"]),
        "--buckets-a",
        str(CANDIDATE_BUCKETS),
        "--buckets-b",
        str(LIVE_BUCKETS),
        "--sha-a",
        assets["candidate_weights"]["sha256"],
        "--sha-b",
        assets["live_weights"]["sha256"],
        "--wasm-sha",
        assets["research_wasm"]["sha256"],
    ]
    completed = subprocess.run(
        command,
        cwd=root,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=max(120, MILLISECONDS_PER_MOVE * MAXIMUM_PLIES * 2 // 1_000),
        check=False,
        env={"PATH": os.environ.get("PATH", "")},
    )
    return ChildResult(completed.returncode, completed.stdout, completed.stderr)


def _read_pairs(
    output: Path,
    plan: Mapping[str, Any],
    screen_plan_sha256: str,
) -> dict[int, ScreenPair]:
    pairs_dir = output / "pairs"
    pairs_dir.mkdir(parents=True, exist_ok=True)
    entries = list(pairs_dir.iterdir())
    if any(
        PAIR_FILE_RE.fullmatch(entry.name) is None
        or entry.is_symlink()
        or not entry.is_file()
        for entry in entries
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "paired56 pair namespace contains an unknown artifact"
        )
    results: dict[int, ScreenPair] = {}
    for pair_index in range(PAIR_COUNT):
        stem = f"pair-{pair_index:04d}"
        receipt_path = pairs_dir / f"{stem}.json"
        log_path = pairs_dir / f"{stem}.log"
        if not receipt_path.exists() and not log_path.exists():
            continue
        if not receipt_path.exists() or not log_path.exists():
            raise DirectTeacherHalfkp81V2ScreenError(
                "paired56 contains an orphan pair artifact; "
                "record an exact technical fault before recovery"
            )
        receipt_raw = receipt_path.read_bytes()
        receipt_value = protocol_v2.strict_json_bytes(
            receipt_raw, f"pair {pair_index} receipt"
        )
        results[pair_index] = _capture_pair(
            receipt_value,
            raw=receipt_raw,
            raw_log=log_path.read_bytes(),
            screen_plan_sha256=screen_plan_sha256,
            plan=plan,
            pair_index=pair_index,
        )
    return results


def _attempt_files(output: Path) -> list[Path]:
    journal = output / "journal"
    journal.mkdir(parents=True, exist_ok=True)
    files = sorted(journal.glob("attempt-*.json"))
    if any(
        re.fullmatch(r"attempt-[0-9]{4}\.json", path.name) is None
        or path.is_symlink()
        or not path.is_file()
        for path in journal.iterdir()
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "paired56 attempt namespace contains an unknown artifact"
        )
    return files


def _load_attempt(path: Path, plan_sha256: str, index: int) -> dict[str, Any]:
    value, _identity_value = _load_json(str(path), f"paired56 attempt {index}")
    attempt = _exact(
        value,
        {
            "schema",
            "screen_plan_sha256",
            "attempt",
            "reason",
            "prior_fault_sha256",
        },
        f"paired56 attempt {index}",
    )
    if (
        attempt["schema"] != ATTEMPT_SCHEMA
        or attempt["screen_plan_sha256"] != plan_sha256
        or attempt["attempt"] != index
        or (
            index == 0
            and (
                attempt["reason"] != "initial"
                or attempt["prior_fault_sha256"] is not None
            )
        )
        or (
            index > 0
            and (
                attempt["reason"] != "exact-technical-fault-resume"
                or type(attempt["prior_fault_sha256"]) is not str
                or SHA256_RE.fullmatch(attempt["prior_fault_sha256"]) is None
            )
        )
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            f"paired56 attempt {index} binding differs"
        )
    return dict(attempt)


def _load_json_canonical(path: Path, label: str) -> dict[str, Any]:
    if path.is_symlink() or not path.is_file():
        raise DirectTeacherHalfkp81V2ScreenError(
            f"{label} must be a regular non-symlink file"
        )
    raw = path.read_bytes()
    value = protocol_v2.strict_json_bytes(raw, label)
    if raw != _canonical_json(value):
        raise DirectTeacherHalfkp81V2ScreenError(f"{label} is not canonical JSON")
    return value


def _fault_path(output: Path, attempt: int) -> Path:
    return output / "faults" / f"fault-{attempt:04d}.json"


def _attempt_result_path(output: Path, attempt: int) -> Path:
    return output / "attempt-results" / f"result-{attempt:04d}.json"


def _capture_fault(
    path: Path,
    *,
    plan_sha256: str,
    attempt: int,
) -> dict[str, Any]:
    fault = _exact(
        _load_json_canonical(path, f"paired56 fault {attempt}"),
        {
            "schema",
            "screen_plan_sha256",
            "attempt",
            "pair_indices",
            "evidence_sha256",
            "technical_faults",
            "strength_conclusion_allowed",
            "same_plan_resume_only",
            "live_weight_write_authorized",
        },
        f"paired56 fault {attempt}",
    )
    if (
        fault["schema"] != FAULT_SCHEMA
        or fault["screen_plan_sha256"] != plan_sha256
        or fault["attempt"] != attempt
        or type(fault["pair_indices"]) is not list
        or not fault["pair_indices"]
        or any(
            type(index) is not int or not 0 <= index < PAIR_COUNT
            for index in fault["pair_indices"]
        )
        or fault["technical_faults"] != len(fault["pair_indices"])
        or type(fault["evidence_sha256"]) is not str
        or SHA256_RE.fullmatch(fault["evidence_sha256"]) is None
        or fault["strength_conclusion_allowed"] is not False
        or fault["same_plan_resume_only"] is not True
        or fault["live_weight_write_authorized"] is not False
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            f"paired56 fault {attempt} binding differs"
        )
    return dict(fault)


def _start_or_resume_attempt(
    output: Path,
    plan_sha256: str,
    *,
    resume_technical_fault: bool,
) -> tuple[int, dict[str, Any] | None]:
    files = _attempt_files(output)
    attempts = [
        _load_attempt(path, plan_sha256, index) for index, path in enumerate(files)
    ]
    if not attempts:
        if resume_technical_fault:
            raise DirectTeacherHalfkp81V2ScreenError(
                "technical resume requested before an initial attempt"
            )
        attempt = {
            "schema": ATTEMPT_SCHEMA,
            "screen_plan_sha256": plan_sha256,
            "attempt": 0,
            "reason": "initial",
            "prior_fault_sha256": None,
        }
        _create_only(output / "journal" / "attempt-0000.json", _canonical_json(attempt))
        return 0, None
    latest = len(attempts) - 1
    fault_path = _fault_path(output, latest)
    attempt_result_path = _attempt_result_path(output, latest)
    if not fault_path.exists():
        raise DirectTeacherHalfkp81V2ScreenError(
            "existing paired56 attempt has no technical-fault receipt; "
            "strength and interrupted runs cannot be resumed"
        )
    fault = _capture_fault(fault_path, plan_sha256=plan_sha256, attempt=latest)
    if not attempt_result_path.exists():
        raise DirectTeacherHalfkp81V2ScreenError(
            "technical-fault attempt lacks its create-only result"
        )
    previous_result = _load_json_canonical(
        attempt_result_path, f"technical attempt result {latest}"
    )
    if (
        previous_result.get("status") != "technical-fault-no-strength-conclusion"
        or previous_result.get("technical_fault_resume_authorized") is not True
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "prior attempt is not an exact resumable technical fault"
        )
    if not resume_technical_fault:
        return latest, previous_result
    next_attempt = latest + 1
    attempt = {
        "schema": ATTEMPT_SCHEMA,
        "screen_plan_sha256": plan_sha256,
        "attempt": next_attempt,
        "reason": "exact-technical-fault-resume",
        "prior_fault_sha256": _sha256(_canonical_json(fault)),
    }
    _create_only(
        output / "journal" / f"attempt-{next_attempt:04d}.json",
        _canonical_json(attempt),
    )
    return next_attempt, None


def _technical_fault_evidence(errors: Sequence[tuple[int, Exception]]) -> str:
    rows = [
        {
            "pair_index": index,
            "error_type": type(error).__name__,
            "message_sha256": _sha256(str(error).encode("utf-8")),
        }
        for index, error in sorted(errors, key=lambda row: row[0])
    ]
    return _domain_digest(
        "shogi-direct-teacher-halfkp81-v2-paired56-fault-evidence-v1\0",
        rows,
    )


def _validate_output_namespace(output: Path) -> None:
    allowed_files = {"run.json", "result.json"}
    allowed_directories = {"journal", "attempt-results", "faults", "pairs"}
    for entry in output.iterdir():
        if entry.is_symlink():
            raise DirectTeacherHalfkp81V2ScreenError(
                "paired56 output namespace contains a symlink"
            )
        if entry.name in allowed_files:
            if not entry.is_file():
                raise DirectTeacherHalfkp81V2ScreenError(
                    "paired56 output file namespace differs"
                )
            continue
        if entry.name in allowed_directories:
            if not entry.is_dir():
                raise DirectTeacherHalfkp81V2ScreenError(
                    "paired56 output directory namespace differs"
                )
            continue
        raise DirectTeacherHalfkp81V2ScreenError(
            "paired56 output namespace contains an unknown artifact"
        )


def run_screen(
    *,
    repo_root: str,
    plan_path: str,
    plan_sha256: str,
    output_dir: str,
    resume_technical_fault: bool = False,
    executor: PairExecutor = execute_pair_subprocess,
) -> dict[str, Any]:
    plan, captured_sha256 = _authenticate_screen_plan(repo_root, plan_path, plan_sha256)
    output = Path(output_dir).expanduser().resolve()
    research_root = (Path.home() / ".codex" / "shogi-runs").resolve()
    research_root.mkdir(parents=True, exist_ok=True)
    try:
        relative = output.relative_to(research_root)
    except ValueError as error:
        raise DirectTeacherHalfkp81V2ScreenError(
            "paired56 output must be below ~/.codex/shogi-runs"
        ) from error
    if len(relative.parts) != 1 or not re.fullmatch(
        r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", relative.name
    ):
        raise DirectTeacherHalfkp81V2ScreenError(
            "paired56 output must be one safe named run directory"
        )
    output.mkdir(parents=True, exist_ok=True)
    _validate_output_namespace(output)
    run_path = output / "run.json"
    if not run_path.exists():
        run = {
            "schema": RUN_SCHEMA,
            "screen_plan_sha256": captured_sha256,
            "candidate_weights_sha256": plan["assets"]["candidate_weights"]["sha256"],
            "live_weights_sha256": plan["assets"]["live_weights"]["sha256"],
            "pair_workers": PAIR_WORKERS,
            "live_weight_write_authorized": False,
        }
        _create_only(run_path, _canonical_json(run))
    else:
        run = _load_json_canonical(run_path, "paired56 run")
        if run != {
            "schema": RUN_SCHEMA,
            "screen_plan_sha256": captured_sha256,
            "candidate_weights_sha256": plan["assets"]["candidate_weights"]["sha256"],
            "live_weights_sha256": plan["assets"]["live_weights"]["sha256"],
            "pair_workers": PAIR_WORKERS,
            "live_weight_write_authorized": False,
        }:
            raise DirectTeacherHalfkp81V2ScreenError("paired56 run binding differs")
    global_result = output / "result.json"
    if global_result.exists():
        if resume_technical_fault:
            raise DirectTeacherHalfkp81V2ScreenError(
                "strength-terminal paired56 result cannot be resumed"
            )
        return _load_json_canonical(global_result, "paired56 terminal result")
    attempt, prior_result = _start_or_resume_attempt(
        output,
        captured_sha256,
        resume_technical_fault=resume_technical_fault,
    )
    if prior_result is not None:
        return prior_result
    pairs = _read_pairs(output, plan, captured_sha256)
    initial = analyze_screen(plan, list(pairs.values()))
    if initial["status"] != "pending":
        _create_only(
            _attempt_result_path(output, attempt),
            _canonical_json(initial),
        )
        _create_only(global_result, _canonical_json(initial))
        return initial

    pending = [index for index in range(PAIR_COUNT) if index not in pairs]
    errors: list[tuple[int, Exception]] = []
    stop_submitting = False
    next_pending = iter(pending)
    root = Path(repo_root).resolve()
    with ThreadPoolExecutor(max_workers=PAIR_WORKERS) as pool:
        futures: dict[Future[ChildResult], int] = {}

        def fill() -> None:
            while not stop_submitting and len(futures) < PAIR_WORKERS:
                try:
                    pair_index = next(next_pending)
                except StopIteration:
                    return
                future = pool.submit(
                    executor,
                    root,
                    plan,
                    pair_index,
                    plan["match"]["pair_seeds"][pair_index],
                )
                futures[future] = pair_index

        fill()
        while futures:
            completed, _ = wait(futures, return_when=FIRST_COMPLETED)
            for future in sorted(completed, key=lambda item: futures[item]):
                pair_index = futures.pop(future)
                seed = plan["match"]["pair_seeds"][pair_index]
                try:
                    child = future.result()
                    if child.returncode != 0 or child.stderr:
                        raise DirectTeacherHalfkp81V2ScreenError(
                            "pair subprocess reported a technical fault"
                        )
                    if f"max-plies={MAXIMUM_PLIES}" not in child.stdout.decode("utf-8"):
                        raise DirectTeacherHalfkp81V2ScreenError(
                            "pair log does not bind maximum plies"
                        )
                    parsed = parse_pair_log(
                        child.stdout,
                        pair_index,
                        seed,
                        MILLISECONDS_PER_MOVE,
                    )
                    if parsed.opening_fingerprint != plan["match"][
                        "opening_fingerprints"
                    ][pair_index] or any(
                        prior.opening_fingerprint == parsed.opening_fingerprint
                        for prior in pairs.values()
                    ):
                        raise DirectTeacherHalfkp81V2ScreenError(
                            "pair opening fingerprint differs or repeats"
                        )
                    log_path = output / "pairs" / f"pair-{pair_index:04d}.log"
                    receipt_path = output / "pairs" / f"pair-{pair_index:04d}.json"
                    _create_only(log_path, child.stdout)
                    receipt = _seal_pair(captured_sha256, parsed)
                    _create_only(receipt_path, _canonical_json(receipt))
                    pairs[pair_index] = _capture_pair(
                        receipt,
                        raw=_canonical_json(receipt),
                        raw_log=child.stdout,
                        screen_plan_sha256=captured_sha256,
                        plan=plan,
                        pair_index=pair_index,
                    )
                except Exception as error:
                    errors.append((pair_index, error))
            current = analyze_screen(
                plan,
                list(pairs.values()),
                technical_faults=len(errors),
            )
            if errors or current["status"] != "pending":
                stop_submitting = True
            fill()

    result = analyze_screen(
        plan,
        list(pairs.values()),
        technical_faults=len(errors),
    )
    if errors:
        fault = {
            "schema": FAULT_SCHEMA,
            "screen_plan_sha256": captured_sha256,
            "attempt": attempt,
            "pair_indices": sorted(index for index, _error in errors),
            "evidence_sha256": _technical_fault_evidence(errors),
            "technical_faults": len(errors),
            "strength_conclusion_allowed": False,
            "same_plan_resume_only": True,
            "live_weight_write_authorized": False,
        }
        _create_only(_fault_path(output, attempt), _canonical_json(fault))
        _create_only(
            _attempt_result_path(output, attempt),
            _canonical_json(result),
        )
        return result
    if result["status"] == "pending":
        raise DirectTeacherHalfkp81V2ScreenError(
            "paired56 stopped without a terminal decision or technical fault"
        )
    _create_only(
        _attempt_result_path(output, attempt),
        _canonical_json(result),
    )
    _create_only(global_result, _canonical_json(result))
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    openings = subparsers.add_parser("validate-openings")
    openings.add_argument("--repo-root", default=".")
    openings.add_argument("--openings", default=OPENING_MANIFEST_PATH)

    prepare = subparsers.add_parser("prepare")
    prepare.add_argument("--repo-root", default=".")
    prepare.add_argument("--execution-plan", required=True)
    prepare.add_argument("--trainer-result", required=True)
    prepare.add_argument("--static-result", required=True)
    prepare.add_argument("--openings", default=OPENING_MANIFEST_PATH)
    prepare.add_argument("--out", required=True)

    run = subparsers.add_parser("run")
    run.add_argument("--repo-root", default=".")
    run.add_argument("--plan", required=True)
    run.add_argument("--plan-sha256", required=True)
    run.add_argument("--output-dir", required=True)
    run.add_argument("--resume-technical-fault", action="store_true")
    return parser


def main() -> int:
    arguments = _parser().parse_args()
    root = str(Path(arguments.repo_root).resolve())
    if arguments.command == "validate-openings":
        value, identity = _load_json(
            _resolve(root, arguments.openings), "v2 paired56 openings"
        )
        validate_opening_manifest(value, repo_root=root)
        print(
            json.dumps(
                {
                    "schema": "shogi-direct-teacher-halfkp81-v2-screen-openings-validation-v1",
                    "status": "valid-frozen-28-fresh-pairs-no-play-authority",
                    "opening_manifest": identity,
                    "paired_play_started": False,
                    "live_weight_write_authorized": False,
                },
                sort_keys=True,
                separators=(",", ":"),
            )
        )
        return 0
    if arguments.command == "prepare":
        plan = build_screen_plan(
            repo_root=root,
            execution_plan_path=arguments.execution_plan,
            trainer_result_path=arguments.trainer_result,
            static_result_path=arguments.static_result,
            opening_manifest_path=_resolve(root, arguments.openings),
        )
        identity = publish_screen_plan(plan, arguments.out)
        print(
            json.dumps(
                {
                    "schema": "shogi-direct-teacher-halfkp81-v2-paired56-plan-publication-v1",
                    "status": PLAN_STATUS,
                    "screen_plan": identity,
                    "paired_play_started": False,
                    "live_weight_write_authorized": False,
                },
                sort_keys=True,
                separators=(",", ":"),
            )
        )
        return 0
    result = run_screen(
        repo_root=root,
        plan_path=arguments.plan,
        plan_sha256=arguments.plan_sha256,
        output_dir=arguments.output_dir,
        resume_technical_fault=arguments.resume_technical_fault,
    )
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] != "technical-fault-no-strength-conclusion" else 2


if __name__ == "__main__":
    raise SystemExit(main())
