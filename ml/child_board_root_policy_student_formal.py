#!/usr/bin/env python3
"""Dedicated fail-closed controller for the student root-policy formal A/B.

This module deliberately does not import or invoke ``run_formal_paired_ab_v2_fixed``.
The old runner models two different NNUE files, while this experiment requires
one identical live NNUE and one candidate-only root-ordering student.

The checked-in registry is closed until the frozen tensor and the complete
runtime-admission receipt are enrolled.  Consequently the argumentless command
can currently perform authentication only; it cannot create an output
directory or start a game.  Pure helpers are exposed for fixture tests and for
the later reviewed READY-registry builder.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
import hashlib
import json
import math
import os
from pathlib import Path
import random
import sys
from typing import Any


REGISTRY_RELATIVE_PATH = (
    "ml/protocols/child-board-root-policy-student-formal-v1-registry.json"
)
REGISTRY_SCHEMA = "shogi-child-board-root-policy-student-formal-registry-v1"
BLOCKED_STATUS = "blocked"
READY_STATUS = "ready-frozen-runtime-admitted"
PAIR_REQUEST_SCHEMA = (
    "shogi-child-board-root-policy-student-formal-pair-request-v1"
)
PAIR_RECEIPT_SCHEMA = (
    "shogi-child-board-root-policy-student-formal-pair-receipt-v1"
)
CANDIDATE_ADAPTER_SCHEMA = (
    "shogi-child-board-root-policy-student-candidate-adapter-v1"
)
RESULT_SCHEMA = "shogi-child-board-root-policy-student-formal-result-v1"
PAIR_COUNT = 384
GAME_COUNT = 768
PAIR_WORKERS = 12
BOOTSTRAP_SEED = 20_260_710
BOOTSTRAP_REPLICATES = 100_000
ONE_SIDED_LOWER_RANK = 5_000
TWO_SIDED_LOWER_RANK = 2_500
SHA256_RE = frozenset("0123456789abcdef")

_REGISTRY_TOP_LEVEL = frozenset(
    {
        "schema",
        "status",
        "reason",
        "authority",
        "parent_contracts",
        "implementation",
        "fixed_protocol",
        "role_boundary",
        "content_addressing",
        "enrollments",
        "gates",
        "nonclaims",
    }
)
_IDENTITY_FIELDS = frozenset({"path", "bytes", "sha256"})
_PAIR_RESULT_UNITS = {"win": 2, "draw": 1, "loss": 0}
_PAIR_RECEIPT_FIELDS = frozenset(
    {
        "schema",
        "status",
        "request_sha256",
        "pair_index",
        "technical_fault_count",
        "games",
        "stable_student_tensor_reads",
        "stable_student_inference_calls",
        "candidate_student_inference_calls",
    }
)


class StudentFormalError(ValueError):
    """A registry, request, receipt, or result violated the fixed contract."""


class StudentFormalBlocked(StudentFormalError):
    """The prospective registry does not yet authorize formal game one."""


def _reject_constant(value: str) -> None:
    raise StudentFormalError(f"non-finite JSON number is forbidden: {value}")


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise StudentFormalError(f"duplicate JSON key is forbidden: {key}")
        result[key] = value
    return result


def strict_json_bytes(raw: bytes, label: str) -> dict[str, Any]:
    try:
        text = raw.decode("utf-8")
        value = json.loads(
            text,
            object_pairs_hook=_unique_object,
            parse_constant=_reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, StudentFormalError) as error:
        raise StudentFormalError(f"{label} is not strict UTF-8 JSON") from error
    if type(value) is not dict:
        raise StudentFormalError(f"{label} root must be an object")
    return value


def canonical_json_bytes(value: object) -> bytes:
    try:
        return (
            json.dumps(
                value,
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
                allow_nan=False,
            )
            + "\n"
        ).encode("utf-8")
    except (TypeError, ValueError) as error:
        raise StudentFormalError("value is not canonical-JSON serializable") from error


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _domain_sha256(domain: str, value: object) -> str:
    return _sha256(domain.encode("utf-8") + b"\0" + canonical_json_bytes(value))


def _exact_mapping(
    value: object, fields: frozenset[str], label: str
) -> Mapping[str, Any]:
    if (
        type(value) is not dict
        or any(type(key) is not str for key in value)
        or set(value) != fields
    ):
        raise StudentFormalError(f"{label} fields differ")
    return value


def _sha256_value(value: object, label: str) -> str:
    if (
        type(value) is not str
        or len(value) != 64
        or any(character not in SHA256_RE for character in value)
        or value == "0" * 64
    ):
        raise StudentFormalError(f"{label} is not a non-placeholder SHA-256")
    return value


def _identity(value: object, label: str) -> dict[str, Any]:
    row = _exact_mapping(value, _IDENTITY_FIELDS, label)
    if (
        type(row["path"]) is not str
        or not row["path"]
        or "\0" in row["path"]
        or type(row["bytes"]) is not int
        or row["bytes"] <= 0
    ):
        raise StudentFormalError(f"{label} path or byte count is invalid")
    return {
        "path": row["path"],
        "bytes": row["bytes"],
        "sha256": _sha256_value(row["sha256"], f"{label}.sha256"),
    }


def _validate_fixed_protocol(value: object) -> None:
    fixed = _exact_mapping(
        value,
        frozenset(
            {
                "pairs",
                "games",
                "games_per_pair",
                "colors_per_pair",
                "pair_workers",
                "search",
                "pairing",
                "technical_fault_policy",
                "decision",
            }
        ),
        "registry.fixed_protocol",
    )
    if (
        fixed["pairs"] != PAIR_COUNT
        or fixed["games"] != GAME_COUNT
        or fixed["games_per_pair"] != 2
        or fixed["colors_per_pair"]
        != ["candidate-sente", "candidate-gote"]
        or fixed["pair_workers"] != PAIR_WORKERS
    ):
        raise StudentFormalError("formal schedule differs from 384 paired games")
    search = fixed["search"]
    expected_search = {
        "engine": "production-browser-wasm-v20-with-admitted-root-rank",
        "fixed_depth": 11,
        "quiescence_depth": 10,
        "nnue_scale_k": 600,
        "clear_tt_before_every_move": True,
        "opening_book": False,
        "fallback": False,
        "clocks": False,
        "maximum_plies": 512,
    }
    if type(search) is not dict or search != expected_search:
        raise StudentFormalError("formal search controls differ")
    if fixed["pairing"] != {
        "same_opening_both_colors": True,
        "opening_schedule_frozen_before_game_1": True,
        "candidate_color_order": ["sente", "gote"],
        "partial_pairs_have_no_decision_authority": True,
    }:
        raise StudentFormalError("formal pairing controls differ")
    if fixed["technical_fault_policy"] != {
        "maximum_faults": 0,
        "first_fault_stops_run": True,
        "faulted_or_partial_run_has_strength_conclusion": False,
        "same_run_retry": False,
    }:
        raise StudentFormalError("formal technical-fault policy differs")
    decision = fixed["decision"]
    if (
        type(decision) is not dict
        or decision.get("acceptance_statistic")
        != "complete-run-pair-bootstrap-only"
        or decision.get("bootstrap_seed") != BOOTSTRAP_SEED
        or decision.get("bootstrap_replicates") != BOOTSTRAP_REPLICATES
        or decision.get("resampling_unit")
        != "two-game-color-swapped-opening-pair"
        or decision.get("one_sided_95_lower_rank")
        != ONE_SIDED_LOWER_RANK
        or decision.get("two_sided_95_lower_rank")
        != TWO_SIDED_LOWER_RANK
        or decision.get("safety_gate")
        != "one-sided-95-lower-strictly-above-0.45"
        or decision.get("stronger_claim_gate")
        != "two-sided-95-lower-strictly-above-0.50"
        or decision.get("external_requires_stronger_claim_gate") is not True
    ):
        raise StudentFormalError("formal decision rule differs")
    monitor = decision.get("sequential_monitor")
    if (
        type(monitor) is not dict
        or monitor.get("method") != "paired-score-sprt-diagnostic-v1"
        or monitor.get("null_score") != 0.45
        or monitor.get("alternative_score") != 0.55
        or monitor.get("alpha") != 0.05
        or monitor.get("beta") != 0.05
        or monitor.get("authority")
        != "diagnostic-only-no-early-strength-or-external-decision"
    ):
        raise StudentFormalError("sequential diagnostic differs")


def validate_registry_data(value: object) -> dict[str, Any]:
    """Validate the closed or later fully enrolled formal-v1 registry."""

    registry = _exact_mapping(value, _REGISTRY_TOP_LEVEL, "formal registry")
    if registry["schema"] != REGISTRY_SCHEMA:
        raise StudentFormalError("formal registry schema differs")
    if registry["status"] not in (BLOCKED_STATUS, READY_STATUS):
        raise StudentFormalError("formal registry status is invalid")
    _validate_fixed_protocol(registry["fixed_protocol"])
    authority = registry["authority"]
    gates = registry["gates"]
    enrollments = registry["enrollments"]
    nonclaims = registry["nonclaims"]
    if not all(
        type(section) is dict
        for section in (authority, gates, enrollments, nonclaims)
    ):
        raise StudentFormalError("formal registry state sections must be objects")
    if registry["status"] == BLOCKED_STATUS:
        if registry["reason"] != "frozen-student-and-runtime-admission-not-enrolled":
            raise StudentFormalError("blocked formal registry reason differs")
        if any(value is not None for value in enrollments.values()):
            raise StudentFormalError("blocked registry contains an enrollment")
        if any(value is not False for value in authority.values()):
            raise StudentFormalError("blocked registry grants authority")
        if any(value is not False for value in gates.values()):
            raise StudentFormalError("blocked registry records a passed gate")
        if (
            nonclaims.get("formal_games_started") != 0
            or nonclaims.get("formal_games_completed") != 0
            or nonclaims.get("live_weights_changed") is not False
            or nonclaims.get("production_assets_changed") is not False
            or nonclaims.get("production_flags_changed") is not False
        ):
            raise StudentFormalError("blocked registry contains a result claim")
    else:
        required = (
            "student_terminal_result",
            "student_tensor",
            "student_manifest",
            "live_nnue",
            "runtime_admission_result",
            "parity_result",
            "latency_result",
            "master_runtime_config",
            "production_build_manifest",
            "worker_source",
            "worker_asset",
            "wasm_source",
            "wasm_asset",
            "opening_manifest",
            "candidate_adapter",
            "stable_adapter",
        )
        for name in required:
            _identity(enrollments.get(name), f"registry.enrollments.{name}")
        if (
            type(enrollments.get("public_main_commit")) is not str
            or len(enrollments["public_main_commit"]) != 40
        ):
            raise StudentFormalError("READY registry commit is invalid")
        required_gates = (
            "tune_passed",
            "sealed_passed",
            "runtime_admission_passed",
            "all_content_identities_verified",
            "role_adapter_single_boolean_diff_verified",
            "stable_student_call_count_zero_verified",
            "execution_authorized",
        )
        if any(gates.get(name) is not True for name in required_gates):
            raise StudentFormalError("READY registry is missing an execution gate")
        if authority.get("execution_authorized") is not True:
            raise StudentFormalError("READY registry does not authorize execution")
    return dict(registry)


def load_registry(repo_root: str | Path) -> tuple[dict[str, Any], dict[str, Any]]:
    root = Path(repo_root).resolve(strict=True)
    path = (root / REGISTRY_RELATIVE_PATH).resolve(strict=True)
    if root not in path.parents or path.is_symlink() or not path.is_file():
        raise StudentFormalError("formal registry path is not one repository file")
    raw = path.read_bytes()
    registry = validate_registry_data(strict_json_bytes(raw, "formal registry"))
    parents = registry["parent_contracts"]
    if type(parents) is not dict:
        raise StudentFormalError("formal parent contracts must be an object")
    required = [
        parents.get("student_plan"),
        parents.get("strength_plan"),
        (
            parents.get("legacy_schedule_source", {}).get("registry")
            if type(parents.get("legacy_schedule_source")) is dict
            else None
        ),
        (
            parents.get("legacy_schedule_source", {}).get("amendment")
            if type(parents.get("legacy_schedule_source")) is dict
            else None
        ),
    ]
    for index, item in enumerate(required):
        if type(item) is not dict:
            raise StudentFormalError("formal parent contract identity is absent")
        captured = _identity(
            {key: item.get(key) for key in _IDENTITY_FIELDS},
            f"formal parent contract {index}",
        )
        parent_path = (root / captured["path"]).resolve(strict=True)
        if (
            root not in parent_path.parents
            or parent_path.is_symlink()
            or not parent_path.is_file()
        ):
            raise StudentFormalError("formal parent contract path escapes repository")
        parent_raw = parent_path.read_bytes()
        if (
            len(parent_raw) != captured["bytes"]
            or _sha256(parent_raw) != captured["sha256"]
        ):
            raise StudentFormalError("formal parent contract identity drift")
    return registry, {
        "path": REGISTRY_RELATIVE_PATH,
        "bytes": len(raw),
        "sha256": _sha256(raw),
        "schema": REGISTRY_SCHEMA,
    }


def assert_execution_authorized(registry: Mapping[str, Any]) -> None:
    captured = validate_registry_data(dict(registry))
    if (
        captured["status"] != READY_STATUS
        or captured["authority"]["execution_authorized"] is not True
        or captured["gates"]["execution_authorized"] is not True
    ):
        raise StudentFormalBlocked(
            "formal-v1 is blocked: frozen student tensor and complete runtime "
            "admission have not been enrolled; no game may start"
        )


def validate_role_binding(value: object) -> dict[str, Any]:
    """Require one shared build/NNUE and a candidate-only student toggle."""

    binding = _exact_mapping(
        value,
        frozenset(
            {
                "schema",
                "registry",
                "shared_assets",
                "student_assets",
                "candidate_adapter",
                "stable_adapter",
                "opening_manifest",
                "runtime_admission_result",
            }
        ),
        "role binding",
    )
    if binding["schema"] != "shogi-child-board-root-policy-formal-binding-v1":
        raise StudentFormalError("role binding schema differs")
    registry = _identity(binding["registry"], "role binding.registry")
    opening = _identity(binding["opening_manifest"], "role binding.opening_manifest")
    admission = _identity(
        binding["runtime_admission_result"], "role binding.runtime_admission_result"
    )
    shared = binding["shared_assets"]
    student = binding["student_assets"]
    if type(shared) is not dict or set(shared) != {
        "live_nnue",
        "worker_source",
        "worker_asset",
        "wasm_source",
        "wasm_asset",
        "production_build_manifest",
        "master_runtime_config",
    }:
        raise StudentFormalError("shared role assets differ")
    if type(student) is not dict or set(student) != {"tensor", "manifest"}:
        raise StudentFormalError("student role assets differ")
    shared_identities = {
        key: _identity(item, f"role binding.shared_assets.{key}")
        for key, item in shared.items()
    }
    student_identities = {
        key: _identity(item, f"role binding.student_assets.{key}")
        for key, item in student.items()
    }
    candidate_row = binding["candidate_adapter"]
    stable_row = binding["stable_adapter"]
    if type(candidate_row) is not dict or type(stable_row) is not dict:
        raise StudentFormalError("role adapters must be objects")
    if set(candidate_row) != {"identity", "config"} or set(stable_row) != {
        "identity",
        "config",
    }:
        raise StudentFormalError("role adapter binding fields differ")
    candidate_identity = _identity(
        candidate_row["identity"], "role binding.candidate_adapter.identity"
    )
    stable_identity = _identity(
        stable_row["identity"], "role binding.stable_adapter.identity"
    )
    candidate = candidate_row["config"]
    stable = stable_row["config"]
    if type(candidate) is not dict or type(stable) is not dict:
        raise StudentFormalError("role adapter configs must be objects")
    expected_fields = {"schema", "student_enabled"}
    if set(candidate) != expected_fields or set(stable) != expected_fields:
        raise StudentFormalError("role adapter fields differ")
    if (
        candidate["schema"] != CANDIDATE_ADAPTER_SCHEMA
        or stable["schema"] != CANDIDATE_ADAPTER_SCHEMA
        or candidate["student_enabled"] is not True
        or stable["student_enabled"] is not False
    ):
        raise StudentFormalError(
            "candidate/stable adapters must differ only by student_enabled"
        )
    return {
        "schema": binding["schema"],
        "registry": registry,
        "shared_assets": shared_identities,
        "student_assets": student_identities,
        "candidate_adapter": {
            "identity": candidate_identity,
            "config": dict(candidate),
        },
        "stable_adapter": {
            "identity": stable_identity,
            "config": dict(stable),
        },
        "opening_manifest": opening,
        "runtime_admission_result": admission,
    }


def build_pair_request(
    pair_index: int,
    opening: Mapping[str, Any],
    role_binding: Mapping[str, Any],
) -> dict[str, Any]:
    """Build one exact same-opening/color-swapped request."""

    binding = validate_role_binding(role_binding)
    if type(pair_index) is not int or not 0 <= pair_index < PAIR_COUNT:
        raise StudentFormalError("pair index is outside [0,384)")
    if (
        type(opening) is not dict
        or set(opening) != {"opening_id", "sfen", "usi_moves"}
        or type(opening["opening_id"]) is not str
        or not opening["opening_id"].startswith("sha256:")
        or len(opening["opening_id"]) != 71
        or any(character not in SHA256_RE for character in opening["opening_id"][7:])
        or opening["opening_id"][7:] == "0" * 64
        or type(opening["sfen"]) is not str
        or type(opening["usi_moves"]) is not list
        or any(type(move) is not str for move in opening["usi_moves"])
    ):
        raise StudentFormalError("opening row is invalid")
    body: dict[str, Any] = {
        "schema": PAIR_REQUEST_SCHEMA,
        "pair_index": pair_index,
        "opening": dict(opening),
        "games": [
            {"game_index": 0, "candidate_color": "sente"},
            {"game_index": 1, "candidate_color": "gote"},
        ],
        "role_binding": binding,
        "search": {
            "fixed_depth": 11,
            "quiescence_depth": 10,
            "nnue_scale_k": 600,
            "clear_tt_before_every_move": True,
            "opening_book": False,
            "fallback": False,
            "maximum_plies": 512,
        },
    }
    body["request_sha256"] = _domain_sha256(
        "shogi-child-board-root-policy-student-formal-pair-request-v1", body
    )
    return body


def validate_pair_receipt(
    value: object,
    request: Mapping[str, Any],
) -> dict[str, Any]:
    """Bind one complete pair receipt to its exact authenticated request."""

    receipt = _exact_mapping(value, _PAIR_RECEIPT_FIELDS, "pair receipt")
    if (
        receipt["schema"] != PAIR_RECEIPT_SCHEMA
        or receipt["status"] != "complete"
        or receipt["request_sha256"] != request.get("request_sha256")
        or receipt["pair_index"] != request.get("pair_index")
        or type(receipt["technical_fault_count"]) is not int
        or receipt["technical_fault_count"] != 0
        or type(receipt["stable_student_tensor_reads"]) is not int
        or receipt["stable_student_tensor_reads"] != 0
        or type(receipt["stable_student_inference_calls"]) is not int
        or receipt["stable_student_inference_calls"] != 0
        or type(receipt["candidate_student_inference_calls"]) is not int
        or receipt["candidate_student_inference_calls"] <= 0
    ):
        raise StudentFormalError("pair receipt authority or role accounting differs")
    games = receipt["games"]
    if type(games) is not list or len(games) != 2:
        raise StudentFormalError("pair receipt must contain two games")
    captured_games: list[dict[str, Any]] = []
    for game_index, game in enumerate(games):
        expected_color = "sente" if game_index == 0 else "gote"
        if (
            type(game) is not dict
            or set(game)
            != {"game_index", "candidate_color", "result", "technical_fault"}
            or game["game_index"] != game_index
            or game["candidate_color"] != expected_color
            or game["result"] not in _PAIR_RESULT_UNITS
            or game["technical_fault"] is not False
        ):
            raise StudentFormalError("pair receipt game accounting differs")
        captured_games.append(dict(game))
    return {
        **dict(receipt),
        "games": captured_games,
    }


def run_authenticated_schedule(
    registry: Mapping[str, Any],
    registry_identity: Mapping[str, Any],
    openings: Sequence[Mapping[str, Any]],
    role_binding: Mapping[str, Any],
    execute_pair: Callable[[Mapping[str, Any]], Mapping[str, Any]],
    *,
    pair_workers: int = PAIR_WORKERS,
) -> list[dict[str, Any]]:
    """Run the fixed schedule with bounded submission and first-fault stop.

    This orchestration surface is intentionally dependency-injected.  The
    checked-in registry is BLOCKED, so the production CLI cannot reach it.
    After runtime admission, the reviewed pair adapter can be enrolled as the
    executor without changing schedule, concurrency, accounting, or analysis.
    """

    assert_execution_authorized(registry)
    binding = validate_role_binding(role_binding)
    if binding["registry"] != _identity(
        registry_identity, "formal schedule registry identity"
    ):
        raise StudentFormalError("role binding registry identity differs")
    enrollments = registry["enrollments"]
    expected_binding = {
        "live_nnue": enrollments["live_nnue"],
        "worker_source": enrollments["worker_source"],
        "worker_asset": enrollments["worker_asset"],
        "wasm_source": enrollments["wasm_source"],
        "wasm_asset": enrollments["wasm_asset"],
        "production_build_manifest": enrollments["production_build_manifest"],
        "master_runtime_config": enrollments["master_runtime_config"],
    }
    if binding["shared_assets"] != expected_binding:
        raise StudentFormalError("role binding shared assets differ from registry")
    if binding["student_assets"] != {
        "tensor": enrollments["student_tensor"],
        "manifest": enrollments["student_manifest"],
    }:
        raise StudentFormalError("role binding student assets differ from registry")
    if (
        binding["opening_manifest"] != enrollments["opening_manifest"]
        or binding["runtime_admission_result"]
        != enrollments["runtime_admission_result"]
        or binding["candidate_adapter"]["identity"]
        != enrollments["candidate_adapter"]
        or binding["stable_adapter"]["identity"] != enrollments["stable_adapter"]
    ):
        raise StudentFormalError("role binding enrolled receipt differs from registry")
    if (
        type(pair_workers) is not int
        or pair_workers != PAIR_WORKERS
        or len(openings) != PAIR_COUNT
    ):
        raise StudentFormalError("formal schedule or pair-worker count differs")
    requests = [
        build_pair_request(index, opening, binding)
        for index, opening in enumerate(openings)
    ]
    receipts: dict[int, dict[str, Any]] = {}
    next_index = 0
    stopped = False
    first_error: BaseException | None = None

    with ThreadPoolExecutor(
        max_workers=PAIR_WORKERS,
        thread_name_prefix="student-formal-pair",
    ) as pool:
        pending: dict[Future[Mapping[str, Any]], int] = {}

        def submit_one(index: int) -> None:
            pending[pool.submit(execute_pair, requests[index])] = index

        while next_index < PAIR_COUNT and len(pending) < PAIR_WORKERS:
            submit_one(next_index)
            next_index += 1
        while pending and not stopped:
            completed, _ = wait(tuple(pending), return_when=FIRST_COMPLETED)
            for future in completed:
                index = pending.pop(future)
                try:
                    receipts[index] = validate_pair_receipt(
                        future.result(), requests[index]
                    )
                except BaseException as error:
                    first_error = error
                    stopped = True
                    break
            if stopped:
                for future in pending:
                    future.cancel()
                break
            while next_index < PAIR_COUNT and len(pending) < PAIR_WORKERS:
                submit_one(next_index)
                next_index += 1

    if first_error is not None:
        raise StudentFormalError(
            "formal pair technical fault; complete run is unanalyzable"
        ) from first_error
    if len(receipts) != PAIR_COUNT or set(receipts) != set(range(PAIR_COUNT)):
        raise StudentFormalError("formal schedule did not complete exactly 384 pairs")
    return [receipts[index] for index in range(PAIR_COUNT)]


def analyze_pair_receipts(
    receipts: Sequence[Mapping[str, Any]],
    *,
    bootstrap_replicates: int = BOOTSTRAP_REPLICATES,
    random_factory: Callable[[int], random.Random] = random.Random,
) -> dict[str, Any]:
    """Project authenticated receipts into the fixed complete-run analyzer."""

    projected = [
        {
            "pair_index": receipt["pair_index"],
            "games": [
                {
                    "game_index": game["game_index"],
                    "candidate_color": game["candidate_color"],
                    "result": game["result"],
                }
                for game in receipt["games"]
            ],
            "technical_fault_count": receipt["technical_fault_count"],
        }
        for receipt in receipts
    ]
    return analyze_complete_pair_results(
        projected,
        bootstrap_replicates=bootstrap_replicates,
        random_factory=random_factory,
    )


def sprt_diagnostic(pair_scores: Sequence[float]) -> dict[str, Any]:
    """Return a preregistered non-authoritative sequential diagnostic."""

    p0 = 0.45
    p1 = 0.55
    alpha = beta = 0.05
    llr = 0.0
    first_upper: int | None = None
    first_lower: int | None = None
    upper = math.log((1.0 - beta) / alpha)
    lower = math.log(beta / (1.0 - alpha))
    for index, score in enumerate(pair_scores, start=1):
        if type(score) not in (int, float) or not 0.0 <= float(score) <= 1.0:
            raise StudentFormalError("pair score must be finite and in [0,1]")
        captured = float(score)
        # A draw/paired fractional score contributes its Bernoulli log score.
        llr += captured * math.log(p1 / p0) + (1.0 - captured) * math.log(
            (1.0 - p1) / (1.0 - p0)
        )
        if first_upper is None and llr >= upper:
            first_upper = index
        if first_lower is None and llr <= lower:
            first_lower = index
    return {
        "schema": "shogi-child-board-root-policy-student-formal-sprt-diagnostic-v1",
        "pairs_observed": len(pair_scores),
        "log_likelihood_ratio": llr,
        "lower_boundary": lower,
        "upper_boundary": upper,
        "first_lower_crossing_pair": first_lower,
        "first_upper_crossing_pair": first_upper,
        "authority": "diagnostic-only-no-early-strength-or-external-decision",
    }


def analyze_complete_pair_results(
    pairs: Sequence[Mapping[str, Any]],
    *,
    bootstrap_replicates: int = BOOTSTRAP_REPLICATES,
    random_factory: Callable[[int], random.Random] = random.Random,
) -> dict[str, Any]:
    """Compute only the full-run preregistered pair-bootstrap decision."""

    if len(pairs) != PAIR_COUNT:
        raise StudentFormalError("formal analysis requires exactly 384 pairs")
    scores: list[float] = []
    seen_indices: set[int] = set()
    for expected_index, pair in enumerate(pairs):
        if (
            type(pair) is not dict
            or set(pair) != {"pair_index", "games", "technical_fault_count"}
            or pair["pair_index"] != expected_index
            or pair["pair_index"] in seen_indices
            or pair["technical_fault_count"] != 0
            or type(pair["technical_fault_count"]) is not int
            or type(pair["games"]) is not list
            or len(pair["games"]) != 2
        ):
            raise StudentFormalError("formal pair accounting is invalid")
        seen_indices.add(pair["pair_index"])
        results: list[str] = []
        for game_index, game in enumerate(pair["games"]):
            if (
                type(game) is not dict
                or set(game) != {"game_index", "candidate_color", "result"}
                or game["game_index"] != game_index
                or game["candidate_color"] != ("sente" if game_index == 0 else "gote")
                or game["result"] not in _PAIR_RESULT_UNITS
            ):
                raise StudentFormalError("formal game accounting is invalid")
            results.append(game["result"])
        scores.append(
            sum(_PAIR_RESULT_UNITS[result] for result in results) / 4.0
        )
    if (
        type(bootstrap_replicates) is not int
        or bootstrap_replicates != BOOTSTRAP_REPLICATES
    ):
        raise StudentFormalError("bootstrap replicate count differs")
    generator = random_factory(BOOTSTRAP_SEED)
    samples = sorted(
        sum(generator.choice(scores) for _ in range(PAIR_COUNT)) / PAIR_COUNT
        for _ in range(bootstrap_replicates)
    )
    point = sum(scores) / PAIR_COUNT
    one_sided_lower = samples[ONE_SIDED_LOWER_RANK - 1]
    two_sided_lower = samples[TWO_SIDED_LOWER_RANK - 1]
    return {
        "schema": "shogi-child-board-root-policy-student-formal-analysis-v1",
        "pairs": PAIR_COUNT,
        "games": GAME_COUNT,
        "technical_faults": 0,
        "candidate_score": point,
        "one_sided_95_lower": one_sided_lower,
        "two_sided_95_lower": two_sided_lower,
        "safety_gate_passed": one_sided_lower > 0.45,
        "stronger_claim_gate_passed": two_sided_lower > 0.50,
        "external_calibration_authorized": two_sided_lower > 0.50,
        "sprt_diagnostic": sprt_diagnostic(scores),
    }


def publish_create_only(path: str | Path, value: Mapping[str, Any]) -> dict[str, Any]:
    """Durably publish one immutable content-addressed receipt."""

    destination = Path(path)
    raw = canonical_json_bytes(dict(value))
    destination.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    descriptor = os.open(destination, flags, 0o600)
    try:
        offset = 0
        while offset < len(raw):
            offset += os.write(descriptor, raw[offset:])
        os.fsync(descriptor)
    except BaseException:
        os.close(descriptor)
        raise
    else:
        os.close(descriptor)
    parent = os.open(destination.parent, os.O_RDONLY)
    try:
        os.fsync(parent)
    finally:
        os.close(parent)
    return {
        "path": str(destination),
        "bytes": len(raw),
        "sha256": _sha256(raw),
    }


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        print("[student-formal-v1] STOP: arguments are forbidden", file=sys.stderr)
        return 2
    root = Path(__file__).resolve().parents[1]
    try:
        registry, identity = load_registry(root)
        assert_execution_authorized(registry)
    except StudentFormalBlocked as error:
        print(
            "[student-formal-v1] STOP: "
            f"{error}; authenticated registry {identity['sha256']}",
            file=sys.stderr,
        )
        return 2
    except (OSError, StudentFormalError) as error:
        print(f"[student-formal-v1] STOP: {error}", file=sys.stderr)
        return 2
    print("[student-formal-v1] STOP: READY execution dispatcher is not enrolled")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
