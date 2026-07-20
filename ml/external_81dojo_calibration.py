"""Offline-only 81Dojo calibration protocol, ledger, and receipt verifier.

This module never contacts 81Dojo, controls a browser or official client,
reads credentials, starts an engine, or changes live weights.  It binds a
future candidate and its production runtime before game 1, appends manually
captured game observations to a local hash-chained JSONL ledger, and issues a
complete receipt only after all 200 observations pass the fixed primary gate.

The opponent-cluster bootstrap is report-only.  It cannot override, weaken, or
replace the primary requirement that every post-game rating for games 171
through 200 is at least 2050.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
import argparse
import copy
from datetime import date, datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import random
import re
import secrets
import stat
import sys
from typing import Any


POLICY_SCHEMA = "shogi-external-81dojo-calibration-policy-v1"
PROTOCOL_SCHEMA = "shogi-external-81dojo-candidate-protocol-v1"
GAME_SCHEMA = "shogi-external-81dojo-game-ledger-entry-v1"
SERVER_RECORD_SCHEMA = "shogi-external-81dojo-manual-server-record-v1"
TRACE_SCHEMA = "shogi-external-81dojo-candidate-trace-v1"
RECEIPT_SCHEMA = "shogi-external-81dojo-calibration-receipt-v1"
PROTOCOL_CORE_SCHEMA = "shogi-external-81dojo-candidate-protocol-core-v1"
PUBLICATION_DOCUMENT_SCHEMA = "shogi-external-81dojo-protocol-publication-document-v1"
PUBLICATION_BINDING_SCHEMA = "shogi-external-81dojo-merged-main-publication-binding-v1"

POLICY_PATH = "ml/protocols/floodgate-q1-2026-external-81dojo-calibration-policy.json"
# Filled from the checked-in file after formatting.  Keeping these constants in
# the verifier prevents a later policy edit from silently changing an enrolled
# candidate protocol.
POLICY_BYTES = 3997
POLICY_SHA256 = "189d67b92b1b9160cb7506fe2ae020c58e5a270b1210f23c352bcc2185561c32"

CHECKED_DATE = "2026-07-20"
GAME_COUNT = 200
STABILITY_FIRST_GAME = 171
STABILITY_LAST_GAME = 200
FIVE_DAN_MINIMUM_RATING = 2050
BOOTSTRAP_SEED = 20_260_720
BOOTSTRAP_REPLICATES = 100_000
MAX_LEDGER_BYTES = 64 * 1024 * 1024

ZERO_SEMANTIC_ID = "sha256:" + "0" * 64
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
GIT_ID_RE = re.compile(r"^[0-9a-f]{40}$")
SEMANTIC_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
USI_MOVE_RE = re.compile(r"^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$")
UTC_SECOND_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
SERVER_GAME_ID_RE = re.compile(r"^[A-Za-z0-9._:/-]{1,200}$")

OFFICIAL_SOURCES = {
    "checked_date": CHECKED_DATE,
    "terms_url": "https://81dojo.com/jp/terms.html",
    "rank_table_url": "https://system.81dojo.com/pages/ranks",
    "rank_threshold_announcement_url": ("https://81dojo.com/announcements/260411.html"),
    "rated_time_control_announcement_url": (
        "https://81dojo.com/announcements/260517.html"
    ),
    "rating_system_url": "https://81dojo.com/documents/Rating_System",
}

FIXED_TIME_CONTROL = {
    "main_minutes": 10,
    "byoyomi_seconds": 30,
    "split_time_seconds": 0,
    "rating_coefficient_reference": "1.0",
}

FIXED_PAIRING = {
    "mode": "official-auto-match",
    "selected_opponents": False,
    "settings_fixed_before_game_1": True,
}

FIXED_MATCH = {
    "platform": "81Dojo",
    "account_name_prefix": "COM_",
    "official_client_only": True,
    "external_server_or_ui_automation": False,
    "relay_mode": "manual-official-client-only",
    "rated": True,
    "initial_position": "hirate",
    "time_control": FIXED_TIME_CONTROL,
    "pairing": FIXED_PAIRING,
    "games": GAME_COUNT,
}

CANDIDATE_RUNTIME_CONTRACT = {
    "runtime": "production-worker-wasm-nnue-master",
    "difficulty": "master",
    "max_time_ms_per_move": 5000,
    "max_depth": 32,
    "quiescence_depth_max": 12,
    "opening_book": True,
    "required_assets": ["weights", "worker", "wasm", "opening_book"],
    "reference_hardware_binding": True,
    "exact_candidate_move_trace_required": True,
}

LEDGER_CONTRACT = {
    "authoritative_storage": "immutable-entry-directory-v1",
    "derived_view_format": "canonical-jsonl-utf8-lf-v1",
    "append_only": True,
    "public_merged_main_protocol_commitment_before_game_1": True,
    "self_asserted_timestamp_is_not_preregistration_proof": True,
    "validate_complete_candidate_prefix_before_publish": True,
    "atomic_temp_fsync_exclusive_publish_directory_fsync": True,
    "reject_symlink_in_every_existing_ancestor": True,
    "sha256_hash_chain": True,
    "sequence": "exactly-1-through-200-with-no-gaps",
    "candidate_rating_continuity": True,
    "account_rated_game_count_continuity": True,
    "server_game_ids_unique": True,
    "official_client_manual_export_identity_required": True,
    "candidate_trace_identity_required": True,
    "all_candidate_moves_match_server_record": True,
    "credentials_or_chat_forbidden": True,
}

PRIMARY_DECISION = {
    "authority": "primary",
    "required_games": GAME_COUNT,
    "stability_window_games_inclusive": [
        STABILITY_FIRST_GAME,
        STABILITY_LAST_GAME,
    ],
    "minimum_post_game_rating": FIVE_DAN_MINIMUM_RATING,
    "every_rating_in_window_must_pass": True,
    "missing_selected_or_faulted_game": "stop",
    "candidate_trace_mismatch": "stop",
    "claim": (
        "81dojo-five-dan-threshold-maintained-for-games-171-through-200-"
        "under-this-protocol-only"
    ),
}

AUXILIARY_STATISTICS = {
    "authority": "report-only-never-primary",
    "method": "opponent-identity-cluster-percentile-bootstrap",
    "score": "win-1-draw-0.5-loss-0",
    "seed": BOOTSTRAP_SEED,
    "replicates": BOOTSTRAP_REPLICATES,
    "confidence": "two-sided-95-percent",
    "cluster": "opponent-public-identity-sha256",
    "windows": ["games-1-through-200", "games-171-through-200"],
    "rank_conversion": False,
}

POLICY_TOP_FIELDS = frozenset(
    {
        "schema",
        "status",
        "recorded_date",
        "official_sources",
        "fixed_match",
        "candidate_runtime_contract",
        "ledger_contract",
        "primary_decision",
        "auxiliary_statistics",
        "unresolved",
        "authority",
        "nonclaims",
    }
)
PROTOCOL_FIELDS = frozenset(
    {
        "schema",
        "status",
        "experiment_id",
        "assembled_at_utc",
        "preregistration_publication",
        "policy",
        "candidate",
        "upstream",
        "execution_environment",
        "account",
        "authorization",
        "fixed_match",
        "ledger_contract",
        "primary_decision",
        "auxiliary_statistics",
        "protocol_sha256",
    }
)
PROTOCOL_CORE_FIELDS = frozenset(
    {
        "schema",
        "experiment_id",
        "policy",
        "candidate",
        "upstream",
        "execution_environment",
        "account",
        "authorization",
        "fixed_match",
        "ledger_contract",
        "primary_decision",
        "auxiliary_statistics",
    }
)
PUBLICATION_DOCUMENT_FIELDS = frozenset(
    {
        "schema",
        "status",
        "recorded_at_utc",
        "protocol_core_sha256",
        "authority",
        "nonclaims",
    }
)
PUBLICATION_BINDING_FIELDS = frozenset(
    {
        "schema",
        "repository_url",
        "branch",
        "data_path",
        "artifact",
        "document",
        "merged_main_revision",
        "merged_main_tree",
        "merged_at_utc",
    }
)
CANDIDATE_FIELDS = frozenset(
    {
        "repository_revision",
        "repository_tree",
        "weights",
        "worker",
        "wasm",
        "opening_book",
        "runtime",
    }
)
UPSTREAM_FIELDS = frozenset(
    {
        "selection_receipt_sha256",
        "fresh_final_receipt_sha256",
        "legacy_final_receipt_sha256",
        "retention_receipt_sha256",
        "known_regression_receipt_sha256",
        "production_parity_receipt_sha256",
        "formal_ab_receipt_sha256",
        "all_internal_gates_passed",
    }
)
ENVIRONMENT_FIELDS = frozenset(
    {
        "hardware_id",
        "cpu",
        "memory_bytes",
        "operating_system",
        "browser",
        "official_client",
    }
)
ACCOUNT_FIELDS = frozenset(
    {
        "public_account_id_sha256",
        "name_prefix_verified",
        "rating_established",
        "rating_before_game_1",
        "rated_games_before_game_1",
    }
)
AUTHORIZATION_FIELDS = frozenset(
    {
        "rules_reverified_date",
        "user_authorization_receipt_sha256",
        "manual_relay_confirmed",
        "official_client_confirmed",
        "external_server_or_ui_automation",
        "execution_authorized",
    }
)
IDENTITY_FIELDS = frozenset({"path", "bytes", "sha256", "schema"})
ASSET_FIELDS = frozenset({"bytes", "sha256"})
CLIENT_FIELDS = frozenset({"name", "version", "artifact"})

GAME_FIELDS = frozenset(
    {
        "schema",
        "protocol_sha256",
        "sequence",
        "previous_entry_sha256",
        "server_game_id",
        "played_at_utc",
        "candidate_color",
        "candidate_rating_before",
        "candidate_rating_after",
        "account_rated_games_before",
        "account_rated_games_after",
        "opponent_public_id_sha256",
        "opponent_rating_before",
        "result_for_candidate",
        "termination",
        "rated",
        "rating_counted",
        "initial_position",
        "time_control",
        "pairing",
        "selected_opponent",
        "technical_fault",
        "server_record",
        "candidate_trace",
        "entry_sha256",
    }
)
OBSERVATION_FIELDS = frozenset(
    {
        "server_game_id",
        "played_at_utc",
        "candidate_color",
        "candidate_rating_before",
        "candidate_rating_after",
        "account_rated_games_before",
        "account_rated_games_after",
        "opponent_public_id_sha256",
        "opponent_rating_before",
        "result_for_candidate",
        "termination",
        "rating_counted",
        "selected_opponent",
        "technical_fault",
        "server_record",
        "candidate_trace",
    }
)
SERVER_RECORD_FIELDS = frozenset(
    {
        "schema",
        "artifact",
        "normalized_moves",
        "normalized_moves_sha256",
        "manual_export_attestation_sha256",
    }
)
TRACE_FIELDS = frozenset(
    {
        "schema",
        "protocol_sha256",
        "server_game_id",
        "candidate_binding_sha256",
        "runtime_binding_sha256",
        "server_record_artifact",
        "server_normalized_moves_sha256",
        "artifact",
        "runtime_receipt_sha256",
        "decisions",
        "decisions_sha256",
    }
)
TRACE_DECISION_FIELDS = frozenset({"ply", "usi", "decision_receipt_sha256"})
FAULT_FIELDS = frozenset({"kind", "evidence_sha256"})
PUBLIC_REPOSITORY_URL = "https://github.com/gomyway1216/nextjs-portfolio"
PUBLICATION_DATA_PATH_RE = re.compile(r"^docs/data/[a-z0-9][a-z0-9._-]{1,180}\.json$")
ENTRY_FILE_RE = re.compile(r"^(\d{6})\.json$")
TEMP_ENTRY_FILE_RE = re.compile(r"^\.tmp-[0-9]+-[0-9a-f]{32}$")


def _reject_nonfinite_constant(value: str):
    raise ValueError(f"non-finite JSON number is forbidden: {value}")


def _strict_object(pairs):
    result = {}
    for key, value in pairs:
        if type(key) is not str:
            raise ValueError("JSON object key is not a plain string")
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def strict_json_loads(raw: str):
    if type(raw) is not str:
        raise ValueError("JSON input must be plain text")
    return json.loads(
        raw,
        object_pairs_hook=_strict_object,
        parse_constant=_reject_nonfinite_constant,
    )


def _capture_plain_json(value: Any, label: str = "value") -> Any:
    if value is None or type(value) in (bool, int, str):
        return value
    if type(value) is list:
        return [
            _capture_plain_json(item, f"{label}[{index}]")
            for index, item in enumerate(value)
        ]
    if type(value) is dict:
        if any(type(key) is not str for key in value):
            raise ValueError(f"{label} has a non-string key")
        return {
            key: _capture_plain_json(item, f"{label}.{key}")
            for key, item in value.items()
        }
    raise ValueError(f"{label} is not exact JSON data")


def canonical_json_bytes(value: Any) -> bytes:
    captured = _capture_plain_json(value)
    return json.dumps(
        captured,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _body_digest(domain: str, body: Mapping) -> str:
    return hashlib.sha256(
        domain.encode("utf-8") + canonical_json_bytes(body)
    ).hexdigest()


def _semantic_body_digest(domain: str, body: Any) -> str:
    return f"sha256:{hashlib.sha256(domain.encode('utf-8') + canonical_json_bytes(body)).hexdigest()}"


def _exact_dict(value: Any, fields: frozenset[str], label: str) -> dict:
    if (
        type(value) is not dict
        or any(type(key) is not str for key in value)
        or set(value) != set(fields)
    ):
        raise ValueError(f"{label} fields are not exact")
    return value


def _exact_value(value: Any, expected: Any, label: str) -> None:
    if type(value) is not type(expected):
        raise ValueError(f"{label} type differs from the fixed policy")
    if type(expected) is dict:
        _exact_dict(value, frozenset(expected), label)
        for key, expected_value in expected.items():
            _exact_value(value[key], expected_value, f"{label}.{key}")
        return
    if type(expected) is list:
        if len(value) != len(expected):
            raise ValueError(f"{label} length differs from the fixed policy")
        for index, expected_value in enumerate(expected):
            _exact_value(value[index], expected_value, f"{label}[{index}]")
        return
    if value != expected:
        raise ValueError(f"{label} differs from the fixed policy")


def _sha256(value: Any, label: str, *, allow_zero: bool = False) -> str:
    if type(value) is not str or SHA256_RE.fullmatch(value) is None:
        raise ValueError(f"{label} is not a lowercase SHA-256")
    if not allow_zero and value == "0" * 64:
        raise ValueError(f"{label} is a placeholder SHA-256")
    return value


def _semantic_id(value: Any, label: str) -> str:
    if (
        type(value) is not str
        or SEMANTIC_ID_RE.fullmatch(value) is None
        or value == ZERO_SEMANTIC_ID
    ):
        raise ValueError(f"{label} is not a non-placeholder semantic SHA-256 ID")
    return value


def _git_id(value: Any, label: str) -> str:
    if (
        type(value) is not str
        or GIT_ID_RE.fullmatch(value) is None
        or value == "0" * 40
    ):
        raise ValueError(f"{label} is not a non-placeholder 40-hex git ID")
    return value


def _positive_int(value: Any, label: str, maximum: int = 2**53 - 1) -> int:
    if type(value) is not int or value <= 0 or value > maximum:
        raise ValueError(f"{label} is not a positive safe integer")
    return value


def _nonnegative_int(value: Any, label: str, maximum: int = 2**53 - 1) -> int:
    if type(value) is not int or value < 0 or value > maximum:
        raise ValueError(f"{label} is not a nonnegative safe integer")
    return value


def _bounded_text(value: Any, label: str, maximum: int = 500) -> str:
    if (
        type(value) is not str
        or not value
        or value.strip() != value
        or "\0" in value
        or len(value.encode("utf-8")) > maximum
    ):
        raise ValueError(f"{label} is not bounded canonical text")
    return value


def _asset(value: Any, label: str) -> dict:
    asset = _exact_dict(value, ASSET_FIELDS, label)
    _positive_int(asset["bytes"], f"{label}.bytes")
    _sha256(asset["sha256"], f"{label}.sha256")
    return asset


def _date(value: Any, label: str) -> str:
    if type(value) is not str:
        raise ValueError(f"{label} is not a date")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"{label} is not an ISO date") from error
    if parsed.isoformat() != value:
        raise ValueError(f"{label} is not a canonical ISO date")
    return value


def _utc_second(value: Any, label: str) -> datetime:
    if type(value) is not str or UTC_SECOND_RE.fullmatch(value) is None:
        raise ValueError(f"{label} is not canonical UTC second text")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as error:
        raise ValueError(f"{label} is not a valid UTC timestamp") from error
    if parsed.tzinfo != timezone.utc:
        raise ValueError(f"{label} is not UTC")
    return parsed


def validate_fixed_policy(policy: Mapping) -> Mapping:
    policy = _exact_dict(policy, POLICY_TOP_FIELDS, "81Dojo policy")
    if policy["schema"] != POLICY_SCHEMA:
        raise ValueError("81Dojo policy schema differs")
    if policy["status"] != "blocked-before-candidate-account-and-manual-relay":
        raise ValueError("81Dojo policy is not closed")
    if policy["recorded_date"] != CHECKED_DATE:
        raise ValueError("81Dojo policy recorded date differs")
    _exact_value(policy["official_sources"], OFFICIAL_SOURCES, "official_sources")
    _exact_value(policy["fixed_match"], FIXED_MATCH, "fixed_match")
    _exact_value(
        policy["candidate_runtime_contract"],
        CANDIDATE_RUNTIME_CONTRACT,
        "candidate_runtime_contract",
    )
    _exact_value(policy["ledger_contract"], LEDGER_CONTRACT, "ledger_contract")
    _exact_value(policy["primary_decision"], PRIMARY_DECISION, "primary_decision")
    _exact_value(
        policy["auxiliary_statistics"],
        AUXILIARY_STATISTICS,
        "auxiliary_statistics",
    )
    _exact_value(
        policy["unresolved"],
        {
            "candidate_selected": False,
            "candidate_runtime_bound": False,
            "internal_gates_passed": False,
            "official_com_account_ready": False,
            "user_external_authorization_recorded": False,
            "manual_relay_confirmed": False,
            "official_client_bound": False,
            "external_games_observed": 0,
        },
        "unresolved",
    )
    _exact_value(
        policy["authority"],
        {
            "execution_authorized": False,
            "external_write_authorized": False,
            "live_weight_write_authorized": False,
            "promotion_authorized": False,
        },
        "authority",
    )
    _exact_value(
        policy["nonclaims"],
        {
            "external_games_executed": False,
            "candidate_stronger": False,
            "high_dan_calibrated": False,
            "universal_human_rank_established": False,
            "live_weights_changed": False,
        },
        "nonclaims",
    )
    return policy


def load_checked_in_policy(repo_root: str | Path) -> tuple[Mapping, Mapping]:
    root = Path(repo_root)
    path = root / POLICY_PATH
    raw = path.read_bytes()
    if len(raw) != POLICY_BYTES:
        raise ValueError("81Dojo policy byte length differs")
    digest = hashlib.sha256(raw).hexdigest()
    if digest != POLICY_SHA256:
        raise ValueError("81Dojo policy SHA-256 differs")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("81Dojo policy is not UTF-8") from error
    policy = strict_json_loads(text)
    validate_fixed_policy(policy)
    identity = {
        "path": POLICY_PATH,
        "bytes": len(raw),
        "sha256": digest,
        "schema": POLICY_SCHEMA,
    }
    return policy, identity


def _validate_policy_identity(value: Any) -> dict:
    identity = _exact_dict(value, IDENTITY_FIELDS, "protocol.policy")
    _exact_value(
        identity,
        {
            "path": POLICY_PATH,
            "bytes": POLICY_BYTES,
            "sha256": POLICY_SHA256,
            "schema": POLICY_SCHEMA,
        },
        "protocol.policy",
    )
    return identity


def _validate_candidate(value: Any) -> dict:
    candidate = _exact_dict(value, CANDIDATE_FIELDS, "protocol.candidate")
    _git_id(candidate["repository_revision"], "candidate.repository_revision")
    _git_id(candidate["repository_tree"], "candidate.repository_tree")
    for name in ("weights", "worker", "wasm", "opening_book"):
        _asset(candidate[name], f"candidate.{name}")
    _exact_value(candidate["runtime"], CANDIDATE_RUNTIME_CONTRACT, "candidate.runtime")
    return candidate


def _validate_upstream(value: Any) -> dict:
    upstream = _exact_dict(value, UPSTREAM_FIELDS, "protocol.upstream")
    for key in sorted(UPSTREAM_FIELDS - {"all_internal_gates_passed"}):
        _sha256(upstream[key], f"upstream.{key}")
    if upstream["all_internal_gates_passed"] is not True:
        raise ValueError("all internal gates must pass before external calibration")
    return upstream


def _validate_environment(value: Any) -> dict:
    environment = _exact_dict(
        value, ENVIRONMENT_FIELDS, "protocol.execution_environment"
    )
    for key in ("hardware_id", "cpu", "operating_system", "browser"):
        _bounded_text(environment[key], f"execution_environment.{key}")
    _positive_int(environment["memory_bytes"], "execution_environment.memory_bytes")
    client = _exact_dict(
        environment["official_client"],
        CLIENT_FIELDS,
        "execution_environment.official_client",
    )
    _bounded_text(client["name"], "official_client.name")
    _bounded_text(client["version"], "official_client.version")
    _asset(client["artifact"], "official_client.artifact")
    return environment


def _validate_account(value: Any) -> dict:
    account = _exact_dict(value, ACCOUNT_FIELDS, "protocol.account")
    _semantic_id(
        account["public_account_id_sha256"], "account.public_account_id_sha256"
    )
    if account["name_prefix_verified"] is not True:
        raise ValueError("official COM_ account prefix is not verified")
    if account["rating_established"] is not True:
        raise ValueError("81Dojo rating must be established before game 1")
    _nonnegative_int(
        account["rating_before_game_1"], "account.rating_before_game_1", 10_000
    )
    _nonnegative_int(
        account["rated_games_before_game_1"],
        "account.rated_games_before_game_1",
    )
    return account


def _validate_authorization(value: Any) -> dict:
    authorization = _exact_dict(value, AUTHORIZATION_FIELDS, "protocol.authorization")
    checked = _date(authorization["rules_reverified_date"], "rules_reverified_date")
    if checked < CHECKED_DATE:
        raise ValueError("81Dojo rules were not reverified on or after 2026-07-20")
    _sha256(
        authorization["user_authorization_receipt_sha256"],
        "user_authorization_receipt_sha256",
    )
    if authorization["manual_relay_confirmed"] is not True:
        raise ValueError("manual official-client relay is not confirmed")
    if authorization["official_client_confirmed"] is not True:
        raise ValueError("official client use is not confirmed")
    if authorization["external_server_or_ui_automation"] is not False:
        raise ValueError("external server or UI automation is forbidden")
    if authorization["execution_authorized"] is not True:
        raise ValueError("external execution is not authorized")
    return authorization


def _protocol_body(protocol: Mapping) -> dict:
    return {
        key: copy.deepcopy(protocol[key])
        for key in protocol
        if key != "protocol_sha256"
    }


def _protocol_core_body(protocol: Mapping) -> dict:
    return {
        "schema": PROTOCOL_CORE_SCHEMA,
        **{
            key: copy.deepcopy(protocol[key])
            for key in PROTOCOL_CORE_FIELDS
            if key != "schema"
        },
    }


def validate_candidate_protocol_core(core: Mapping) -> Mapping:
    core = _exact_dict(core, PROTOCOL_CORE_FIELDS, "81Dojo candidate protocol core")
    if core["schema"] != PROTOCOL_CORE_SCHEMA:
        raise ValueError("candidate protocol core schema differs")
    _semantic_id(core["experiment_id"], "protocol.experiment_id")
    _validate_policy_identity(core["policy"])
    _validate_candidate(core["candidate"])
    _validate_upstream(core["upstream"])
    _validate_environment(core["execution_environment"])
    _validate_account(core["account"])
    _validate_authorization(core["authorization"])
    _exact_value(core["fixed_match"], FIXED_MATCH, "protocol.fixed_match")
    _exact_value(core["ledger_contract"], LEDGER_CONTRACT, "protocol.ledger_contract")
    _exact_value(
        core["primary_decision"], PRIMARY_DECISION, "protocol.primary_decision"
    )
    _exact_value(
        core["auxiliary_statistics"],
        AUXILIARY_STATISTICS,
        "protocol.auxiliary_statistics",
    )
    return core


def protocol_core_sha256(core: Mapping) -> str:
    validate_candidate_protocol_core(core)
    return _semantic_body_digest(
        "shogi-external-81dojo-candidate-protocol-core-v1\0", core
    )


def build_candidate_protocol_core(
    *,
    experiment_id: str,
    policy_identity: Mapping,
    candidate: Mapping,
    upstream: Mapping,
    execution_environment: Mapping,
    account: Mapping,
    authorization: Mapping,
) -> Mapping:
    core = {
        "schema": PROTOCOL_CORE_SCHEMA,
        "experiment_id": _capture_plain_json(experiment_id),
        "policy": _capture_plain_json(policy_identity),
        "candidate": _capture_plain_json(candidate),
        "upstream": _capture_plain_json(upstream),
        "execution_environment": _capture_plain_json(execution_environment),
        "account": _capture_plain_json(account),
        "authorization": _capture_plain_json(authorization),
        "fixed_match": copy.deepcopy(FIXED_MATCH),
        "ledger_contract": copy.deepcopy(LEDGER_CONTRACT),
        "primary_decision": copy.deepcopy(PRIMARY_DECISION),
        "auxiliary_statistics": copy.deepcopy(AUXILIARY_STATISTICS),
    }
    validate_candidate_protocol_core(core)
    return core


def build_preregistration_publication_document(
    core: Mapping, *, recorded_at_utc: str
) -> Mapping:
    validate_candidate_protocol_core(core)
    recorded_at = _utc_second(recorded_at_utc, "publication.recorded_at_utc")
    rules_date = date.fromisoformat(core["authorization"]["rules_reverified_date"])
    if recorded_at.date() < rules_date:
        raise ValueError("publication document predates rules reverification")
    return {
        "schema": PUBLICATION_DOCUMENT_SCHEMA,
        "status": "public-pre-game-protocol-core-commitment",
        "recorded_at_utc": recorded_at_utc,
        "protocol_core_sha256": protocol_core_sha256(core),
        "authority": "data-only-no-execution-authority",
        "nonclaims": {
            "external_games_executed": False,
            "candidate_high_dan_established": False,
            "live_weights_changed": False,
        },
    }


def encode_preregistration_publication_document(document: Mapping) -> bytes:
    _validate_publication_document(document)
    return canonical_json_bytes(document) + b"\n"


def bind_merged_main_publication(
    document: Mapping,
    *,
    data_path: str,
    merged_main_revision: str,
    merged_main_tree: str,
    merged_at_utc: str,
) -> Mapping:
    document = _capture_plain_json(document, "publication document")
    _validate_publication_document(document)
    if (
        type(data_path) is not str
        or PUBLICATION_DATA_PATH_RE.fullmatch(data_path) is None
    ):
        raise ValueError("publication data path is not a data-only JSON path")
    merged_at = _utc_second(merged_at_utc, "publication.merged_at_utc")
    recorded_at = _utc_second(
        document["recorded_at_utc"], "publication.document.recorded_at_utc"
    )
    if merged_at < recorded_at:
        raise ValueError("merged-main publication predates its document")
    raw = encode_preregistration_publication_document(document)
    binding = {
        "schema": PUBLICATION_BINDING_SCHEMA,
        "repository_url": PUBLIC_REPOSITORY_URL,
        "branch": "main",
        "data_path": data_path,
        "artifact": {
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        },
        "document": document,
        "merged_main_revision": merged_main_revision,
        "merged_main_tree": merged_main_tree,
        "merged_at_utc": merged_at_utc,
    }
    _validate_publication_binding(binding, document["protocol_core_sha256"])
    return binding


def _validate_publication_document(value: Any) -> dict:
    document = _exact_dict(
        value, PUBLICATION_DOCUMENT_FIELDS, "protocol publication document"
    )
    if document["schema"] != PUBLICATION_DOCUMENT_SCHEMA:
        raise ValueError("publication document schema differs")
    if document["status"] != "public-pre-game-protocol-core-commitment":
        raise ValueError("publication document status differs")
    _utc_second(document["recorded_at_utc"], "publication.document.recorded_at_utc")
    _semantic_id(
        document["protocol_core_sha256"],
        "publication.document.protocol_core_sha256",
    )
    if document["authority"] != "data-only-no-execution-authority":
        raise ValueError("publication document authority differs")
    _exact_value(
        document["nonclaims"],
        {
            "external_games_executed": False,
            "candidate_high_dan_established": False,
            "live_weights_changed": False,
        },
        "publication.document.nonclaims",
    )
    return document


def _validate_publication_binding(value: Any, expected_core_sha256: str) -> dict:
    binding = _exact_dict(
        value, PUBLICATION_BINDING_FIELDS, "protocol.preregistration_publication"
    )
    if binding["schema"] != PUBLICATION_BINDING_SCHEMA:
        raise ValueError("publication binding schema differs")
    if binding["repository_url"] != PUBLIC_REPOSITORY_URL:
        raise ValueError("publication repository differs")
    if binding["branch"] != "main":
        raise ValueError("protocol commitment was not published on main")
    if (
        type(binding["data_path"]) is not str
        or PUBLICATION_DATA_PATH_RE.fullmatch(binding["data_path"]) is None
    ):
        raise ValueError("publication data path is not a data-only JSON path")
    document = _validate_publication_document(binding["document"])
    if document["protocol_core_sha256"] != expected_core_sha256:
        raise ValueError("publication belongs to another protocol core")
    raw = encode_preregistration_publication_document(document)
    _exact_value(
        binding["artifact"],
        {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()},
        "publication.artifact",
    )
    _git_id(binding["merged_main_revision"], "publication.merged_main_revision")
    _git_id(binding["merged_main_tree"], "publication.merged_main_tree")
    merged_at = _utc_second(binding["merged_at_utc"], "publication.merged_at_utc")
    recorded_at = _utc_second(
        document["recorded_at_utc"], "publication.document.recorded_at_utc"
    )
    if merged_at < recorded_at:
        raise ValueError("merged-main publication predates its document")
    return binding


def validate_candidate_protocol(protocol: Mapping) -> Mapping:
    protocol = _exact_dict(protocol, PROTOCOL_FIELDS, "81Dojo candidate protocol")
    if protocol["schema"] != PROTOCOL_SCHEMA:
        raise ValueError("candidate protocol schema differs")
    if (
        protocol["status"]
        != "requires-public-merged-main-commitment-before-external-game-1"
    ):
        raise ValueError("candidate protocol publication requirement differs")
    assembled_at = _utc_second(
        protocol["assembled_at_utc"], "protocol.assembled_at_utc"
    )
    core = _protocol_core_body(protocol)
    validate_candidate_protocol_core(core)
    publication = _validate_publication_binding(
        protocol["preregistration_publication"], protocol_core_sha256(core)
    )
    merged_at = _utc_second(publication["merged_at_utc"], "publication.merged_at_utc")
    if assembled_at < merged_at:
        raise ValueError("candidate protocol assembly predates merged publication")
    expected = _body_digest(
        "shogi-external-81dojo-candidate-protocol-v1\0",
        _protocol_body(protocol),
    )
    if protocol["protocol_sha256"] != expected:
        raise ValueError("candidate protocol SHA-256 differs")
    return protocol


def build_candidate_protocol(
    *,
    core: Mapping,
    assembled_at_utc: str,
    preregistration_publication: Mapping,
) -> Mapping:
    core = _capture_plain_json(core, "candidate protocol core")
    validate_candidate_protocol_core(core)
    body = {
        "schema": PROTOCOL_SCHEMA,
        "status": ("requires-public-merged-main-commitment-before-external-game-1"),
        "assembled_at_utc": _capture_plain_json(assembled_at_utc),
        "preregistration_publication": _capture_plain_json(preregistration_publication),
        **{key: copy.deepcopy(core[key]) for key in core if key != "schema"},
    }
    protocol = {
        **body,
        "protocol_sha256": _body_digest(
            "shogi-external-81dojo-candidate-protocol-v1\0", body
        ),
    }
    validate_candidate_protocol(protocol)
    return protocol


def normalized_moves_sha256(moves: Sequence[str]) -> str:
    captured = _capture_plain_json(moves, "normalized moves")
    if type(captured) is not list:
        raise ValueError("normalized moves must be a list")
    for index, move in enumerate(captured):
        if type(move) is not str or USI_MOVE_RE.fullmatch(move) is None:
            raise ValueError(f"normalized moves[{index}] is not canonical USI")
    return _semantic_body_digest(
        "shogi-external-81dojo-normalized-server-moves-v1\0", captured
    )


def trace_decisions_sha256(decisions: Sequence[Mapping]) -> str:
    captured = _capture_plain_json(decisions, "trace decisions")
    if type(captured) is not list:
        raise ValueError("trace decisions must be a list")
    return _semantic_body_digest(
        "shogi-external-81dojo-candidate-trace-decisions-v1\0", captured
    )


def candidate_binding_sha256(protocol: Mapping) -> str:
    return _semantic_body_digest(
        "shogi-external-81dojo-candidate-binding-v1\0",
        protocol["candidate"],
    )


def runtime_binding_sha256(protocol: Mapping) -> str:
    return _semantic_body_digest(
        "shogi-external-81dojo-runtime-binding-v1\0",
        {
            "candidate": protocol["candidate"],
            "execution_environment": protocol["execution_environment"],
        },
    )


def _validate_server_record(value: Any) -> dict:
    record = _exact_dict(value, SERVER_RECORD_FIELDS, "game.server_record")
    if record["schema"] != SERVER_RECORD_SCHEMA:
        raise ValueError("server record schema differs")
    _asset(record["artifact"], "server_record.artifact")
    moves = record["normalized_moves"]
    if type(moves) is not list or not moves:
        raise ValueError("server record normalized moves are empty")
    expected = normalized_moves_sha256(moves)
    if record["normalized_moves_sha256"] != expected:
        raise ValueError("server record normalized move digest differs")
    _sha256(
        record["manual_export_attestation_sha256"],
        "server_record.manual_export_attestation_sha256",
    )
    return record


def _validate_trace(
    value: Any,
    protocol: Mapping,
    server_game_id: str,
    server_record: Mapping,
) -> dict:
    trace = _exact_dict(value, TRACE_FIELDS, "game.candidate_trace")
    if trace["schema"] != TRACE_SCHEMA:
        raise ValueError("candidate trace schema differs")
    if trace["protocol_sha256"] != protocol["protocol_sha256"]:
        raise ValueError("candidate trace belongs to another protocol")
    if trace["server_game_id"] != server_game_id:
        raise ValueError("candidate trace belongs to another server game")
    if trace["candidate_binding_sha256"] != candidate_binding_sha256(protocol):
        raise ValueError("candidate trace belongs to another candidate")
    if trace["runtime_binding_sha256"] != runtime_binding_sha256(protocol):
        raise ValueError("candidate trace belongs to another runtime")
    _exact_value(
        trace["server_record_artifact"],
        server_record["artifact"],
        "candidate_trace.server_record_artifact",
    )
    if (
        trace["server_normalized_moves_sha256"]
        != server_record["normalized_moves_sha256"]
    ):
        raise ValueError("candidate trace belongs to another server record")
    _asset(trace["artifact"], "candidate_trace.artifact")
    _sha256(trace["runtime_receipt_sha256"], "candidate_trace.runtime_receipt_sha256")
    decisions = trace["decisions"]
    if type(decisions) is not list:
        raise ValueError("candidate trace decisions are not a list")
    for index, decision_value in enumerate(decisions):
        decision = _exact_dict(
            decision_value, TRACE_DECISION_FIELDS, f"trace.decisions[{index}]"
        )
        _positive_int(decision["ply"], f"trace.decisions[{index}].ply", 10_000)
        if (
            type(decision["usi"]) is not str
            or USI_MOVE_RE.fullmatch(decision["usi"]) is None
        ):
            raise ValueError(f"trace.decisions[{index}].usi is not canonical")
        _sha256(
            decision["decision_receipt_sha256"],
            f"trace.decisions[{index}].decision_receipt_sha256",
        )
    expected = trace_decisions_sha256(decisions)
    if trace["decisions_sha256"] != expected:
        raise ValueError("candidate trace decision digest differs")
    return trace


def _validate_trace_matches_server(
    color: str, server_record: Mapping, trace: Mapping
) -> None:
    moves = server_record["normalized_moves"]
    first_ply = 1 if color == "sente" else 2
    expected_plies = list(range(first_ply, len(moves) + 1, 2))
    decisions = trace["decisions"]
    actual_plies = [decision["ply"] for decision in decisions]
    if actual_plies != expected_plies:
        raise ValueError("candidate trace has missing, duplicate, or opposing plies")
    for decision in decisions:
        if decision["usi"] != moves[decision["ply"] - 1]:
            raise ValueError("candidate trace move differs from server record")


def _validate_fault(value: Any) -> None:
    if value is None:
        return
    fault = _exact_dict(value, FAULT_FIELDS, "game.technical_fault")
    _bounded_text(fault["kind"], "technical_fault.kind", 100)
    _sha256(fault["evidence_sha256"], "technical_fault.evidence_sha256")


def _game_body(entry: Mapping) -> dict:
    return {key: copy.deepcopy(entry[key]) for key in entry if key != "entry_sha256"}


def _protocol_game_boundary(protocol: Mapping) -> datetime:
    assembled_at = _utc_second(
        protocol["assembled_at_utc"], "protocol.assembled_at_utc"
    )
    merged_at = _utc_second(
        protocol["preregistration_publication"]["merged_at_utc"],
        "publication.merged_at_utc",
    )
    return max(assembled_at, merged_at)


def validate_game_entry(entry: Mapping, protocol: Mapping) -> Mapping:
    validate_candidate_protocol(protocol)
    entry = _exact_dict(entry, GAME_FIELDS, "81Dojo game ledger entry")
    if entry["schema"] != GAME_SCHEMA:
        raise ValueError("game ledger entry schema differs")
    if entry["protocol_sha256"] != protocol["protocol_sha256"]:
        raise ValueError("game ledger entry belongs to another protocol")
    _positive_int(entry["sequence"], "game.sequence", GAME_COUNT)
    if entry["sequence"] == 1:
        if entry["previous_entry_sha256"] is not None:
            raise ValueError("first game must not name a previous entry")
    else:
        _sha256(entry["previous_entry_sha256"], "game.previous_entry_sha256")
    if (
        type(entry["server_game_id"]) is not str
        or SERVER_GAME_ID_RE.fullmatch(entry["server_game_id"]) is None
    ):
        raise ValueError("server_game_id is not bounded canonical text")
    played_at = _utc_second(entry["played_at_utc"], "game.played_at_utc")
    if played_at <= _protocol_game_boundary(protocol):
        raise ValueError(
            "game timestamp is not after merged publication and protocol assembly"
        )
    if entry["candidate_color"] not in ("sente", "gote"):
        raise ValueError("candidate_color is not sente or gote")
    for key in (
        "candidate_rating_before",
        "candidate_rating_after",
        "opponent_rating_before",
    ):
        _nonnegative_int(entry[key], f"game.{key}", 10_000)
    before_count = _nonnegative_int(
        entry["account_rated_games_before"], "game.account_rated_games_before"
    )
    after_count = _nonnegative_int(
        entry["account_rated_games_after"], "game.account_rated_games_after"
    )
    if after_count != before_count + 1:
        raise ValueError("account rated-game count did not increase by exactly one")
    _semantic_id(entry["opponent_public_id_sha256"], "game.opponent_public_id_sha256")
    if entry["result_for_candidate"] not in ("win", "draw", "loss"):
        raise ValueError("result_for_candidate differs")
    _bounded_text(entry["termination"], "game.termination", 100)
    if type(entry["rated"]) is not bool:
        raise ValueError("game.rated is not boolean")
    if type(entry["rating_counted"]) is not bool:
        raise ValueError("game.rating_counted is not boolean")
    if entry["initial_position"] != "hirate":
        raise ValueError("external game is not hirate")
    _exact_value(entry["time_control"], FIXED_TIME_CONTROL, "game.time_control")
    _exact_value(entry["pairing"], FIXED_PAIRING, "game.pairing")
    if type(entry["selected_opponent"]) is not bool:
        raise ValueError("game.selected_opponent is not boolean")
    _validate_fault(entry["technical_fault"])
    server_record = _validate_server_record(entry["server_record"])
    trace = _validate_trace(
        entry["candidate_trace"],
        protocol,
        entry["server_game_id"],
        server_record,
    )
    _validate_trace_matches_server(entry["candidate_color"], server_record, trace)
    expected = _body_digest(
        "shogi-external-81dojo-game-ledger-entry-v1\0", _game_body(entry)
    )
    if entry["entry_sha256"] != expected:
        raise ValueError("game ledger entry SHA-256 differs")
    return entry


def build_game_entry(
    protocol: Mapping,
    *,
    sequence: int,
    previous_entry_sha256: str | None,
    observation: Mapping,
) -> Mapping:
    validate_candidate_protocol(protocol)
    observation = _exact_dict(
        _capture_plain_json(observation), OBSERVATION_FIELDS, "game observation"
    )
    body = {
        "schema": GAME_SCHEMA,
        "protocol_sha256": protocol["protocol_sha256"],
        "sequence": sequence,
        "previous_entry_sha256": previous_entry_sha256,
        **observation,
        "rated": True,
        "initial_position": "hirate",
        "time_control": copy.deepcopy(FIXED_TIME_CONTROL),
        "pairing": copy.deepcopy(FIXED_PAIRING),
    }
    entry = {
        **body,
        "entry_sha256": _body_digest(
            "shogi-external-81dojo-game-ledger-entry-v1\0", body
        ),
    }
    validate_game_entry(entry, protocol)
    return entry


def encode_ledger_entry(entry: Mapping) -> bytes:
    return canonical_json_bytes(entry) + b"\n"


def parse_ledger(raw: bytes, protocol: Mapping) -> list[Mapping]:
    validate_candidate_protocol(protocol)
    if type(raw) is not bytes:
        raise ValueError("ledger must be exact bytes")
    if len(raw) > MAX_LEDGER_BYTES:
        raise ValueError("ledger exceeds the local size bound")
    if not raw:
        return []
    if not raw.endswith(b"\n") or b"\r" in raw or b"\0" in raw:
        raise ValueError("ledger is not canonical UTF-8 LF JSONL")
    rows = raw.splitlines(keepends=True)
    if len(rows) > GAME_COUNT:
        raise ValueError("ledger exceeds 200 games")
    games: list[Mapping] = []
    server_ids: set[str] = set()
    previous_timestamp = _protocol_game_boundary(protocol)
    expected_rating = protocol["account"]["rating_before_game_1"]
    expected_rated_games = protocol["account"]["rated_games_before_game_1"]
    previous_entry_sha256: str | None = None
    for index, line in enumerate(rows):
        try:
            text = line[:-1].decode("utf-8")
        except UnicodeDecodeError as error:
            raise ValueError(f"ledger row {index + 1} is not UTF-8") from error
        entry = strict_json_loads(text)
        if encode_ledger_entry(entry) != line:
            raise ValueError(f"ledger row {index + 1} is not canonical JSON")
        validate_game_entry(entry, protocol)
        sequence = index + 1
        if entry["sequence"] != sequence:
            raise ValueError("ledger sequence has a gap or reorder")
        if entry["previous_entry_sha256"] != previous_entry_sha256:
            raise ValueError("ledger hash chain differs")
        if entry["server_game_id"] in server_ids:
            raise ValueError("ledger repeats a server game ID")
        server_ids.add(entry["server_game_id"])
        timestamp = _utc_second(entry["played_at_utc"], "game.played_at_utc")
        if timestamp <= previous_timestamp:
            if not games:
                raise ValueError(
                    "first ledger timestamp is not after merged publication"
                )
            raise ValueError("ledger timestamps are not strictly increasing")
        previous_timestamp = timestamp
        if entry["candidate_rating_before"] != expected_rating:
            raise ValueError("candidate rating continuity differs")
        expected_rating = entry["candidate_rating_after"]
        if entry["account_rated_games_before"] != expected_rated_games:
            raise ValueError("account rated-game count continuity differs")
        expected_rated_games = entry["account_rated_games_after"]
        previous_entry_sha256 = entry["entry_sha256"]
        games.append(entry)
    return games


def verify_append_only_extension(
    previous_raw: bytes, current_raw: bytes, protocol: Mapping
) -> Mapping:
    previous = parse_ledger(previous_raw, protocol)
    current = parse_ledger(current_raw, protocol)
    if not current_raw.startswith(previous_raw):
        raise ValueError("current ledger rewrote or removed a published prefix")
    if len(current) < len(previous):
        raise ValueError("current ledger is shorter than its published prefix")
    return {
        "previous_games": len(previous),
        "current_games": len(current),
        "games_appended": len(current) - len(previous),
        "previous_sha256": hashlib.sha256(previous_raw).hexdigest(),
        "current_sha256": hashlib.sha256(current_raw).hexdigest(),
        "prefix_exact": True,
    }


def _absolute_ledger_directory(path: str | Path) -> Path:
    raw = os.fspath(path)
    if type(raw) is not str or not raw or "\0" in raw:
        raise ValueError("ledger directory path is invalid")
    return Path(os.path.abspath(raw))


def _reject_existing_symlink_ancestors(path: Path) -> None:
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current /= part
        try:
            info = os.lstat(current)
        except FileNotFoundError:
            return
        if stat.S_ISLNK(info.st_mode):
            raise ValueError(f"ledger path has a symlink component: {current}")


def _require_atomic_directory_primitives() -> tuple[int, int]:
    no_follow = getattr(os, "O_NOFOLLOW", None)
    directory = getattr(os, "O_DIRECTORY", None)
    if type(no_follow) is not int or type(directory) is not int:
        raise OSError("platform lacks atomic symlink-safe directory primitives")
    return no_follow, directory


def _verify_private_directory(info: os.stat_result, label: str) -> None:
    if not stat.S_ISDIR(info.st_mode):
        raise ValueError(f"{label} is not a directory")
    if info.st_uid != os.geteuid():
        raise ValueError(f"{label} owner differs")
    if stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError(f"{label} mode must be exactly 0700")


def _verify_private_file(info: os.stat_result, label: str) -> None:
    if not stat.S_ISREG(info.st_mode):
        raise ValueError(f"{label} is not a regular file")
    if info.st_uid != os.geteuid() or info.st_nlink != 1:
        raise ValueError(f"{label} owner or link count differs")
    if stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError(f"{label} mode must be exactly 0600")


def _open_authoritative_storage(
    ledger_directory: str | Path, *, create: bool, exclusive: bool
) -> tuple[Path, int, int, int]:
    path = _absolute_ledger_directory(ledger_directory)
    _reject_existing_symlink_ancestors(path)
    no_follow, directory_flag = _require_atomic_directory_primitives()
    if not path.parent.is_dir():
        raise ValueError("ledger directory parent must already exist")
    if create:
        try:
            os.mkdir(path, 0o700)
        except FileExistsError:
            pass
    _reject_existing_symlink_ancestors(path)
    root_flags = os.O_RDONLY | no_follow | directory_flag
    if hasattr(os, "O_CLOEXEC"):
        root_flags |= os.O_CLOEXEC
    root_fd = os.open(path, root_flags)
    lock_fd = -1
    entries_fd = -1
    try:
        _verify_private_directory(os.fstat(root_fd), "ledger directory")
        if create:
            try:
                os.mkdir("entries", 0o700, dir_fd=root_fd)
            except FileExistsError:
                pass
        lock_flags = os.O_RDWR | no_follow
        if create:
            lock_flags |= os.O_CREAT
        if hasattr(os, "O_CLOEXEC"):
            lock_flags |= os.O_CLOEXEC
        lock_fd = os.open(".lock", lock_flags, 0o600, dir_fd=root_fd)
        _verify_private_file(os.fstat(lock_fd), "ledger lock")
        fcntl.flock(lock_fd, fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
        entries_fd = os.open("entries", root_flags, dir_fd=root_fd)
        _verify_private_directory(os.fstat(entries_fd), "ledger entries directory")
        return path, root_fd, lock_fd, entries_fd
    except BaseException:
        if entries_fd >= 0:
            os.close(entries_fd)
        if lock_fd >= 0:
            os.close(lock_fd)
        os.close(root_fd)
        raise


def _close_authoritative_storage(root_fd: int, lock_fd: int, entries_fd: int) -> None:
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
    finally:
        os.close(entries_fd)
        os.close(lock_fd)
        os.close(root_fd)


def _read_exact_file(fd: int, size: int, label: str) -> bytes:
    if size < 0 or size > MAX_LEDGER_BYTES:
        raise ValueError(f"{label} exceeds the local size bound")
    chunks = []
    remaining = size
    while remaining:
        chunk = os.read(fd, min(remaining, 1024 * 1024))
        if not chunk:
            raise ValueError(f"{label} short read")
        chunks.append(chunk)
        remaining -= len(chunk)
    if os.read(fd, 1):
        raise ValueError(f"{label} grew while being read")
    return b"".join(chunks)


def _read_authoritative_entries(entries_fd: int, no_follow: int) -> bytes:
    final_names: list[tuple[int, str]] = []
    for name in os.listdir(entries_fd):
        match = ENTRY_FILE_RE.fullmatch(name)
        if match is not None:
            final_names.append((int(match.group(1)), name))
            continue
        if TEMP_ENTRY_FILE_RE.fullmatch(name) is not None:
            info = os.stat(name, dir_fd=entries_fd, follow_symlinks=False)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid():
                raise ValueError("ledger temporary entry is not a private file")
            continue
        raise ValueError(f"ledger entries directory has unknown member: {name}")
    final_names.sort()
    rows = bytearray()
    for expected_sequence, (sequence, name) in enumerate(final_names, start=1):
        if sequence != expected_sequence:
            raise ValueError("authoritative ledger entry filenames have a gap")
        flags = os.O_RDONLY | no_follow
        if hasattr(os, "O_CLOEXEC"):
            flags |= os.O_CLOEXEC
        fd = os.open(name, flags, dir_fd=entries_fd)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode):
                raise ValueError(f"ledger entry {name} is not a regular file")
            if info.st_uid != os.geteuid() or info.st_nlink not in (1, 2):
                raise ValueError(f"ledger entry {name} owner or link count differs")
            if stat.S_IMODE(info.st_mode) != 0o400:
                raise ValueError(f"ledger entry {name} mode must be exactly 0400")
            row = _read_exact_file(fd, info.st_size, f"ledger entry {name}")
        finally:
            os.close(fd)
        if row.count(b"\n") != 1 or not row.endswith(b"\n"):
            raise ValueError(f"ledger entry {name} is not one canonical JSONL row")
        rows.extend(row)
        if len(rows) > MAX_LEDGER_BYTES:
            raise ValueError("ledger exceeds the local size bound")
    return bytes(rows)


def authoritative_ledger_jsonl(
    ledger_directory: str | Path, protocol: Mapping
) -> bytes:
    """Return the canonical JSONL derived view of immutable authoritative files."""

    validate_candidate_protocol(protocol)
    _, root_fd, lock_fd, entries_fd = _open_authoritative_storage(
        ledger_directory, create=False, exclusive=False
    )
    try:
        no_follow, _ = _require_atomic_directory_primitives()
        raw = _read_authoritative_entries(entries_fd, no_follow)
        parse_ledger(raw, protocol)
        return raw
    finally:
        _close_authoritative_storage(root_fd, lock_fd, entries_fd)


def _write_complete_temp_file(fd: int, encoded: bytes) -> None:
    written = 0
    while written < len(encoded):
        count = os.write(fd, encoded[written:])
        if count <= 0:
            raise OSError("temporary ledger entry write made no progress")
        written += count
    os.fchmod(fd, 0o400)
    os.fsync(fd)


def append_local_game(
    ledger_directory: str | Path, protocol: Mapping, observation: Mapping
) -> Mapping:
    """Atomically publish one validated immutable local entry.

    Authoritative state is a private directory of one-file-per-game entries.
    JSONL is only a derived view.  A candidate prefix is fully validated before
    any temporary file is created; a complete fsynced temporary file is then
    hard-linked to its final name without overwrite and the directory is
    fsynced.  No network, engine, credential, or live-weight surface exists.
    """

    validate_candidate_protocol(protocol)
    _, root_fd, lock_fd, entries_fd = _open_authoritative_storage(
        ledger_directory, create=True, exclusive=True
    )
    try:
        no_follow, _ = _require_atomic_directory_primitives()
        raw = _read_authoritative_entries(entries_fd, no_follow)
        games = parse_ledger(raw, protocol)
        if len(games) >= GAME_COUNT:
            raise ValueError("ledger already contains all 200 games")
        entry = build_game_entry(
            protocol,
            sequence=len(games) + 1,
            previous_entry_sha256=games[-1]["entry_sha256"] if games else None,
            observation=observation,
        )
        encoded = encode_ledger_entry(entry)
        candidate_raw = raw + encoded
        parse_ledger(candidate_raw, protocol)

        temp_name = f".tmp-{os.getpid()}-{secrets.token_hex(16)}"
        final_name = f"{entry['sequence']:06d}.json"
        temp_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | no_follow
        if hasattr(os, "O_CLOEXEC"):
            temp_flags |= os.O_CLOEXEC
        temp_fd = os.open(temp_name, temp_flags, 0o600, dir_fd=entries_fd)
        try:
            _write_complete_temp_file(temp_fd, encoded)
        finally:
            os.close(temp_fd)
        os.link(
            temp_name,
            final_name,
            src_dir_fd=entries_fd,
            dst_dir_fd=entries_fd,
            follow_symlinks=False,
        )
        os.fsync(entries_fd)
        os.unlink(temp_name, dir_fd=entries_fd)
        os.fsync(entries_fd)
        return entry
    finally:
        _close_authoritative_storage(root_fd, lock_fd, entries_fd)


def _score_units(game: Mapping) -> int:
    return {"win": 2, "draw": 1, "loss": 0}[game["result_for_candidate"]]


def _rate_text(value: float) -> str:
    return f"{value:.8f}"


def _cluster_bootstrap(games: Sequence[Mapping]) -> Mapping:
    if not games:
        raise ValueError("cluster bootstrap requires games")
    clusters: dict[str, list[int]] = defaultdict(list)
    for game in games:
        clusters[game["opponent_public_id_sha256"]].append(_score_units(game))
    cluster_ids = sorted(clusters)
    cluster_summaries = [
        (sum(clusters[cluster_id]), len(clusters[cluster_id]))
        for cluster_id in cluster_ids
    ]
    rng = random.Random(BOOTSTRAP_SEED)
    rates: list[float] = []
    cluster_count = len(cluster_ids)
    for _ in range(BOOTSTRAP_REPLICATES):
        units = 0
        game_count = 0
        for cluster_units, cluster_games in rng.choices(
            cluster_summaries, k=cluster_count
        ):
            units += cluster_units
            game_count += cluster_games
        rates.append(units / (2 * game_count))
    rates.sort()
    lower_index = BOOTSTRAP_REPLICATES * 25 // 1000
    upper_index = BOOTSTRAP_REPLICATES * 975 // 1000 - 1
    point_units = sum(_score_units(game) for game in games)
    return {
        "games": len(games),
        "opponent_clusters": cluster_count,
        "point_score_units": point_units,
        "point_score_denominator": 2 * len(games),
        "point_score_rate": _rate_text(point_units / (2 * len(games))),
        "bootstrap_seed": BOOTSTRAP_SEED,
        "bootstrap_replicates": BOOTSTRAP_REPLICATES,
        "lower_index_zero_based": lower_index,
        "upper_index_zero_based": upper_index,
        "two_sided_95_lower": _rate_text(rates[lower_index]),
        "two_sided_95_upper": _rate_text(rates[upper_index]),
    }


def _receipt_body(receipt: Mapping) -> dict:
    return {
        key: copy.deepcopy(receipt[key]) for key in receipt if key != "receipt_sha256"
    }


def finalize_calibration(protocol: Mapping, ledger_raw: bytes) -> Mapping:
    validate_candidate_protocol(protocol)
    games = parse_ledger(ledger_raw, protocol)
    if len(games) != GAME_COUNT:
        raise ValueError("complete calibration requires exactly 200 games")
    if any(
        game["rated"] is not True or game["rating_counted"] is not True
        for game in games
    ):
        raise ValueError("every calibration game must be counted as rated")
    if any(game["selected_opponent"] is not False for game in games):
        raise ValueError("selected pairing invalidates external calibration")
    if any(game["technical_fault"] is not None for game in games):
        raise ValueError("technical fault invalidates external calibration")
    stability_games = games[STABILITY_FIRST_GAME - 1 : STABILITY_LAST_GAME]
    stability_ratings = [game["candidate_rating_after"] for game in stability_games]
    if len(stability_ratings) != 30:
        raise ValueError("stability rating window is incomplete")
    minimum_rating = min(stability_ratings)
    if minimum_rating < FIVE_DAN_MINIMUM_RATING:
        raise ValueError("post-game rating fell below 2050 in games 171 through 200")
    body = {
        "schema": RECEIPT_SCHEMA,
        "status": "complete-pass",
        "claim_boundary": (
            "candidate-bound-manual-official-client-81dojo-five-dan-threshold-"
            "maintenance-under-this-protocol-only"
        ),
        "protocol_sha256": protocol["protocol_sha256"],
        "experiment_id": protocol["experiment_id"],
        "candidate": copy.deepcopy(protocol["candidate"]),
        "execution_environment": copy.deepcopy(protocol["execution_environment"]),
        "account_public_id_sha256": protocol["account"]["public_account_id_sha256"],
        "rules_reverified_date": protocol["authorization"]["rules_reverified_date"],
        "preregistration_boundary": {
            "authority": (
                "requires-independent-public-merged-main-verification-" "before-game-1"
            ),
            "repository_url": protocol["preregistration_publication"]["repository_url"],
            "branch": protocol["preregistration_publication"]["branch"],
            "data_path": protocol["preregistration_publication"]["data_path"],
            "artifact": copy.deepcopy(
                protocol["preregistration_publication"]["artifact"]
            ),
            "merged_main_revision": protocol["preregistration_publication"][
                "merged_main_revision"
            ],
            "merged_main_tree": protocol["preregistration_publication"][
                "merged_main_tree"
            ],
            "merged_at_utc": protocol["preregistration_publication"]["merged_at_utc"],
        },
        "ledger": {
            "bytes": len(ledger_raw),
            "sha256": hashlib.sha256(ledger_raw).hexdigest(),
            "games": len(games),
            "first_entry_sha256": games[0]["entry_sha256"],
            "head_entry_sha256": games[-1]["entry_sha256"],
            "server_game_ids_unique": True,
            "rating_continuity_verified": True,
            "rated_game_count_continuity_verified": True,
            "candidate_trace_matches_all_moves": True,
            "technical_faults": 0,
            "selected_pairings": 0,
        },
        "primary_decision": {
            "authority": "primary",
            "passed": True,
            "games_required": GAME_COUNT,
            "games_completed": len(games),
            "stability_window_games_inclusive": [
                STABILITY_FIRST_GAME,
                STABILITY_LAST_GAME,
            ],
            "minimum_required_post_game_rating": FIVE_DAN_MINIMUM_RATING,
            "observed_minimum_post_game_rating": minimum_rating,
            "every_rating_in_window_passed": True,
        },
        "auxiliary_statistics": {
            "authority": "report-only-never-primary",
            "rank_conversion": False,
            "all_games": _cluster_bootstrap(games),
            "stability_window": _cluster_bootstrap(stability_games),
        },
        "nonclaims": {
            "bootstrap_authorizes_primary_decision": False,
            "universal_human_rank_established": False,
            "other_platform_rank_established": False,
            "official_server_cryptographic_attestation": False,
            "offline_verifier_independently_proves_remote_merge": False,
            "self_asserted_timestamp_is_preregistration_proof": False,
            "live_weight_change": False,
        },
    }
    receipt = {
        **body,
        "receipt_sha256": _body_digest(
            "shogi-external-81dojo-calibration-receipt-v1\0", body
        ),
    }
    return receipt


def load_protocol_file(path: str | Path) -> Mapping:
    raw = Path(path).read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("candidate protocol is not UTF-8") from error
    protocol = strict_json_loads(text)
    return validate_candidate_protocol(protocol)


def _print_json(value: Mapping) -> None:
    sys.stdout.buffer.write(canonical_json_bytes(value) + b"\n")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Offline-only 81Dojo calibration ledger verifier"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    verify = subparsers.add_parser("verify-final")
    verify.add_argument("--protocol", required=True)
    verify.add_argument("--ledger", required=True)

    prefix = subparsers.add_parser("verify-prefix")
    prefix.add_argument("--protocol", required=True)
    prefix.add_argument("--previous", required=True)
    prefix.add_argument("--current", required=True)

    append = subparsers.add_parser("append-local")
    append.add_argument("--protocol", required=True)
    append.add_argument(
        "--ledger-directory", "--ledger", dest="ledger_directory", required=True
    )
    append.add_argument("--observation", required=True)

    derive = subparsers.add_parser("derive-local-jsonl")
    derive.add_argument("--protocol", required=True)
    derive.add_argument("--ledger-directory", required=True)

    args = parser.parse_args(argv)
    protocol = load_protocol_file(args.protocol)
    if args.command == "verify-final":
        _print_json(finalize_calibration(protocol, Path(args.ledger).read_bytes()))
        return 0
    if args.command == "verify-prefix":
        _print_json(
            verify_append_only_extension(
                Path(args.previous).read_bytes(),
                Path(args.current).read_bytes(),
                protocol,
            )
        )
        return 0
    if args.command == "append-local":
        observation_raw = Path(args.observation).read_text(encoding="utf-8")
        observation = strict_json_loads(observation_raw)
        _print_json(append_local_game(args.ledger_directory, protocol, observation))
        return 0
    if args.command == "derive-local-jsonl":
        sys.stdout.buffer.write(
            authoritative_ledger_jsonl(args.ledger_directory, protocol)
        )
        return 0
    raise AssertionError("unreachable command")


if __name__ == "__main__":
    raise SystemExit(main())
