"""Externally isolated 81Dojo calibration protocol, ledger, and verifier.

This module never contacts 81Dojo, controls a browser or official client,
reads credentials, starts an engine, or changes live weights.  Its sole
network operation is a read-only, fixed-host GitHub TLS API verification of
the preregistration merge and exact publication objects.  It binds a future
candidate and its production runtime before game 1, appends manually captured
game observations to a local immutable-entry ledger, and issues a complete
receipt only after all 200 observations pass the fixed primary gate and the
GitHub publication is reverified.

The opponent-cluster bootstrap is report-only.  It cannot override, weaken, or
replace the primary requirement that every post-game rating for games 171
through 200 is at least 2050.
"""

from __future__ import annotations

import base64
from collections import defaultdict
from collections.abc import Mapping, Sequence
import argparse
import copy
from datetime import date, datetime, timezone
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import random
import re
import secrets
import ssl
import stat
import subprocess
import sys
from typing import Any
from urllib.parse import quote, urlencode


_DIR_FD_OPEN_SUPPORTED = os.open in os.supports_dir_fd
_DIR_FD_MKDIR_SUPPORTED = os.mkdir in os.supports_dir_fd
_DIR_FD_STAT_SUPPORTED = os.stat in os.supports_dir_fd
_DIR_FD_UNLINK_SUPPORTED = os.unlink in os.supports_dir_fd
_DIR_FD_LINK_SUPPORTED = os.link in os.supports_dir_fd


POLICY_SCHEMA = "shogi-external-81dojo-calibration-policy-v1"
PROTOCOL_SCHEMA = "shogi-external-81dojo-candidate-protocol-v1"
GAME_SCHEMA = "shogi-external-81dojo-game-ledger-entry-v1"
SERVER_RECORD_SCHEMA = "shogi-external-81dojo-manual-server-record-v1"
TRACE_SCHEMA = "shogi-external-81dojo-candidate-trace-v2"
TRACE_RECEIPT_SCHEMA = "shogi-external-81dojo-candidate-trace-receipt-v1"
RUNTIME_RECEIPT_SCHEMA = "shogi-external-81dojo-runtime-receipt-v1"
DECISION_RECEIPT_SCHEMA = "shogi-external-81dojo-decision-receipt-v1"
RECEIPT_SCHEMA = "shogi-external-81dojo-calibration-receipt-v1"
PROTOCOL_CORE_SCHEMA = "shogi-external-81dojo-candidate-protocol-core-v1"
PUBLICATION_DOCUMENT_SCHEMA = "shogi-external-81dojo-protocol-publication-document-v1"
PUBLICATION_BINDING_SCHEMA = "shogi-external-81dojo-merged-main-publication-binding-v1"
PUBLICATION_VERIFICATION_SCHEMA = (
    "shogi-external-81dojo-github-publication-verification-v1"
)
APPEND_RESULT_SCHEMA = "shogi-external-81dojo-local-append-result-v1"
AUTHORITATIVE_MANIFEST_SCHEMA = "shogi-external-81dojo-authoritative-entry-manifest-v1"

POLICY_PATH = "ml/protocols/floodgate-q1-2026-external-81dojo-calibration-policy.json"
# Filled from the checked-in file after formatting.  Keeping these constants in
# the verifier prevents a later policy edit from silently changing an enrolled
# candidate protocol.
POLICY_BYTES = 4472
POLICY_SHA256 = "d88fc1dc40742c701af14197764c6e6760d64bb7f5d6015d1b0f82c8a92b5731"

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
PUBLIC_REPOSITORY_NAME = "gomyway1216/nextjs-portfolio"
PUBLIC_REPOSITORY_URL = f"https://github.com/{PUBLIC_REPOSITORY_NAME}"
PUBLIC_GITHUB_API_HOST = "api.github.com"
PUBLIC_GITHUB_API_PREFIX = f"/repos/{PUBLIC_REPOSITORY_NAME}"
PUBLIC_REMOTE_TRACKING_REF = "refs/heads/main"
PUBLIC_LOCAL_REMOTE_TRACKING_REF = "refs/remotes/origin/main"
MAX_GITHUB_API_RESPONSE_BYTES = 2 * 1024 * 1024

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
    "github_api_tls_pr_merge_time_main_ancestry_tree_blob_path_bytes": True,
    "local_git_object_tree_blob_cross_check": True,
    "terminal_receipt_reverifies_live_github_publication": True,
    "validate_complete_candidate_prefix_before_publish": True,
    "atomic_temp_fsync_exclusive_publish_directory_fsync": True,
    "descriptor_walk_rejects_symlink_in_every_path_component": True,
    "first_namespace_creation_parent_and_root_fsync": True,
    "post_publication_committed_or_indeterminate_reconciliation": True,
    "final_receipt_requires_authoritative_directory_manifest": True,
    "sha256_hash_chain": True,
    "sequence": "exactly-1-through-200-with-no-gaps",
    "candidate_rating_continuity": True,
    "account_rated_game_count_continuity": True,
    "server_game_ids_unique": True,
    "official_client_manual_export_identity_required": True,
    "candidate_trace_identity_required": True,
    "candidate_trace_content_receipts_bind_every_identity": True,
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
        "remote_tracking_ref",
        "pull_request_number",
        "pull_request_url",
        "data_path",
        "artifact",
        "document",
        "merged_main_revision",
        "merged_main_tree",
        "merged_main_blob",
        "merged_at_utc",
        "verification_receipt",
    }
)
PUBLICATION_VERIFICATION_FIELDS = frozenset(
    {
        "schema",
        "authority",
        "repository_url",
        "branch",
        "remote_tracking_ref",
        "pull_request_number",
        "pull_request_url",
        "observed_remote_main_revision",
        "repository_object_format",
        "merged_main_revision",
        "merged_main_tree",
        "merged_main_blob",
        "data_path",
        "artifact",
        "protocol_core_sha256",
        "merged_at_utc",
        "receipt_sha256",
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
        "receipt",
    }
)
CONTENT_RECEIPT_FIELDS = frozenset(
    {
        "document",
        "artifact",
        "receipt_sha256",
    }
)
TRACE_RECEIPT_FIELDS = frozenset(
    {
        "schema",
        "protocol_sha256",
        "server_game_id",
        "candidate_binding_sha256",
        "runtime_binding_sha256",
        "server_record_artifact",
        "server_normalized_moves_sha256",
        "runtime_receipt",
        "decisions",
        "decisions_sha256",
    }
)
RUNTIME_RECEIPT_FIELDS = frozenset(
    {
        "schema",
        "protocol_sha256",
        "server_game_id",
        "candidate_binding_sha256",
        "runtime_binding_sha256",
        "server_record_artifact",
        "server_normalized_moves_sha256",
        "execution_artifact",
    }
)
DECISION_RECEIPT_FIELDS = frozenset(
    {
        "schema",
        "protocol_sha256",
        "server_game_id",
        "candidate_binding_sha256",
        "runtime_binding_sha256",
        "server_record_artifact",
        "server_normalized_moves_sha256",
        "ply",
        "usi",
        "search_artifact",
    }
)
TRACE_DECISION_INPUT_FIELDS = frozenset({"ply", "usi", "search_artifact"})
FAULT_FIELDS = frozenset({"kind", "evidence_sha256"})
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


def _open_trusted_directory_descriptor(
    path: str | Path, label: str
) -> tuple[Path, int]:
    raw = os.fspath(path)
    if type(raw) is not str or not raw or "\0" in raw:
        raise ValueError(f"{label} path is invalid")
    absolute = Path(os.path.abspath(raw))
    no_follow = getattr(os, "O_NOFOLLOW", None)
    directory = getattr(os, "O_DIRECTORY", None)
    if (
        type(no_follow) is not int
        or type(directory) is not int
        or os.open not in os.supports_dir_fd
    ):
        raise OSError(f"{label} requires descriptor-relative no-follow support")
    flags = os.O_RDONLY | no_follow | directory
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    current = os.open(absolute.anchor, flags)
    try:
        for component in absolute.parts[1:]:
            following = os.open(component, flags, dir_fd=current)
            os.close(current)
            current = following
        info = os.fstat(current)
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid():
            raise ValueError(f"{label} is not a current-user-owned directory")
        return absolute, current
    except BaseException:
        os.close(current)
        raise


def _git_result(repo_fd: int, *arguments: str) -> subprocess.CompletedProcess:
    command = [
        "/usr/bin/git",
        "--no-optional-locks",
        "--no-replace-objects",
        *arguments,
    ]
    environment = {
        "HOME": "/var/empty",
        "LANG": "C",
        "LC_ALL": "C",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_TERMINAL_PROMPT": "0",
    }
    return subprocess.run(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        close_fds=True,
        pass_fds=(repo_fd,),
        env=environment,
        preexec_fn=lambda: os.fchdir(repo_fd),
    )


def _git_output(repo_fd: int, *arguments: str, binary: bool = False):
    result = _git_result(repo_fd, *arguments)
    if result.returncode != 0:
        detail = result.stderr.decode("utf-8", "replace").strip()[:500]
        raise ValueError(
            f"trusted local git verification failed ({' '.join(arguments)}): {detail}"
        )
    if binary:
        return result.stdout
    try:
        return result.stdout.decode("utf-8").strip()
    except UnicodeDecodeError as error:
        raise ValueError("trusted local git output is not UTF-8") from error


def _git_is_ancestor(repo_fd: int, ancestor: str, descendant: str) -> bool:
    result = _git_result(repo_fd, "merge-base", "--is-ancestor", ancestor, descendant)
    if result.returncode == 0:
        return True
    if result.returncode == 1:
        return False
    detail = result.stderr.decode("utf-8", "replace").strip()[:500]
    raise ValueError(f"trusted local git ancestry verification failed: {detail}")


def _normalized_repository_url(value: str) -> str:
    normalized = value.strip().removesuffix("/").removesuffix(".git")
    if normalized != PUBLIC_REPOSITORY_URL:
        raise ValueError("trusted local repository origin differs")
    return normalized


def _observe_publication_local_git(
    repository_root: str | Path,
    *,
    merged_main_revision: str,
    data_path: str,
    expected_document_raw: bytes,
) -> dict:
    _git_id(merged_main_revision, "publication.merged_main_revision")
    if (
        type(data_path) is not str
        or PUBLICATION_DATA_PATH_RE.fullmatch(data_path) is None
    ):
        raise ValueError("publication data path is not a data-only JSON path")
    _, repo_fd = _open_trusted_directory_descriptor(
        repository_root, "trusted publication repository"
    )
    try:
        _normalized_repository_url(_git_output(repo_fd, "remote", "get-url", "origin"))
        object_format = _git_output(repo_fd, "rev-parse", "--show-object-format")
        if object_format != "sha1":
            raise ValueError("trusted publication repository is not SHA-1 git")
        remote_head = _git_output(
            repo_fd,
            "rev-parse",
            "--verify",
            f"{PUBLIC_LOCAL_REMOTE_TRACKING_REF}^{{commit}}",
        )
        _git_id(remote_head, "publication.observed_local_origin_main_revision")
        actual_revision = _git_output(
            repo_fd,
            "rev-parse",
            "--verify",
            f"{merged_main_revision}^{{commit}}",
        )
        if actual_revision != merged_main_revision:
            raise ValueError("merged-main revision did not resolve exactly")
        if not _git_is_ancestor(repo_fd, merged_main_revision, remote_head):
            raise ValueError(
                "merged-main publication is not in trusted origin/main history"
            )
        tree = _git_output(repo_fd, "rev-parse", f"{merged_main_revision}^{{tree}}")
        _git_id(tree, "publication.merged_main_tree")
        blob = _git_output(repo_fd, "rev-parse", f"{merged_main_revision}:{data_path}")
        _git_id(blob, "publication.merged_main_blob")
        if _git_output(repo_fd, "cat-file", "-t", blob) != "blob":
            raise ValueError("publication path is not a git blob")
        blob_raw = _git_output(repo_fd, "cat-file", "blob", blob, binary=True)
        if blob_raw != expected_document_raw:
            raise ValueError("publication git blob bytes differ from the document")
        return {
            "repository_object_format": object_format,
            "observed_local_origin_main_revision": remote_head,
            "merged_main_revision": merged_main_revision,
            "merged_main_tree": tree,
            "merged_main_blob": blob,
        }
    finally:
        os.close(repo_fd)


def _github_api_json(path: str) -> Mapping:
    if (
        type(path) is not str
        or not path.startswith(PUBLIC_GITHUB_API_PREFIX + "/")
        or "\0" in path
        or "://" in path
    ):
        raise ValueError("GitHub API path is outside the fixed public repository")
    connection = http.client.HTTPSConnection(
        PUBLIC_GITHUB_API_HOST,
        timeout=20,
        context=ssl.create_default_context(),
    )
    try:
        connection.request(
            "GET",
            path,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "shogi-external-calibration-publication-verifier/1",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
        response = connection.getresponse()
        raw = response.read(MAX_GITHUB_API_RESPONSE_BYTES + 1)
        if len(raw) > MAX_GITHUB_API_RESPONSE_BYTES:
            raise ValueError("GitHub API response exceeds the fixed size bound")
        if response.status != 200:
            raise ValueError(f"GitHub API returned HTTP {response.status}")
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as error:
            raise ValueError("GitHub API response is not UTF-8") from error
        value = strict_json_loads(text)
        if type(value) is not dict:
            raise ValueError("GitHub API response is not a JSON object")
        return value
    finally:
        connection.close()


def _github_required_mapping(value: Any, label: str) -> Mapping:
    if type(value) is not dict:
        raise ValueError(f"{label} is not an object")
    return value


def _github_required_string(value: Any, label: str) -> str:
    if type(value) is not str or not value:
        raise ValueError(f"{label} is not a non-empty string")
    return value


def _verify_github_ancestor(ancestor: str, descendant: str, label: str) -> None:
    _git_id(ancestor, f"{label}.ancestor")
    _git_id(descendant, f"{label}.descendant")
    comparison = _github_api_json(
        f"{PUBLIC_GITHUB_API_PREFIX}/compare/{ancestor}...{descendant}"
    )
    merge_base = _github_required_mapping(
        comparison.get("merge_base_commit"), f"{label} merge base"
    )
    if (
        comparison.get("status") not in ("ahead", "identical")
        or merge_base.get("sha") != ancestor
    ):
        raise ValueError(f"{label} is not an ancestor relation")


def _observe_publication_github(
    *,
    pull_request_number: int,
    merged_main_revision: str,
    data_path: str,
    expected_document_raw: bytes,
    recorded_remote_main_revision: str | None = None,
) -> dict:
    pull_request_number = _positive_int(
        pull_request_number, "publication.pull_request_number", 100_000_000
    )
    _git_id(merged_main_revision, "publication.merged_main_revision")
    if (
        type(data_path) is not str
        or PUBLICATION_DATA_PATH_RE.fullmatch(data_path) is None
    ):
        raise ValueError("publication data path is not a data-only JSON path")

    pull = _github_api_json(f"{PUBLIC_GITHUB_API_PREFIX}/pulls/{pull_request_number}")
    base = _github_required_mapping(pull.get("base"), "GitHub pull request base")
    base_repo = _github_required_mapping(
        base.get("repo"), "GitHub pull request base repository"
    )
    if pull.get("number") != pull_request_number:
        raise ValueError("GitHub pull request number differs")
    if pull.get("state") != "closed" or pull.get("merged") is not True:
        raise ValueError("GitHub pull request is not merged")
    if (
        base.get("ref") != "main"
        or base_repo.get("full_name") != PUBLIC_REPOSITORY_NAME
    ):
        raise ValueError(
            "GitHub pull request was not merged into the fixed main branch"
        )
    if pull.get("merge_commit_sha") != merged_main_revision:
        raise ValueError("GitHub pull request merge commit differs")
    pull_request_url = f"{PUBLIC_REPOSITORY_URL}/pull/{pull_request_number}"
    if pull.get("html_url") != pull_request_url:
        raise ValueError("GitHub pull request URL differs")
    merged_at = _utc_second(pull.get("merged_at"), "GitHub pull request merged_at")

    reference = _github_api_json(f"{PUBLIC_GITHUB_API_PREFIX}/git/ref/heads/main")
    reference_object = _github_required_mapping(
        reference.get("object"), "GitHub main ref object"
    )
    if reference.get("ref") != PUBLIC_REMOTE_TRACKING_REF:
        raise ValueError("GitHub main ref name differs")
    if reference_object.get("type") != "commit":
        raise ValueError("GitHub main ref does not name a commit")
    remote_head = _github_required_string(
        reference_object.get("sha"), "GitHub main ref SHA"
    )
    _git_id(remote_head, "publication.observed_remote_main_revision")

    if recorded_remote_main_revision is None:
        _verify_github_ancestor(
            merged_main_revision,
            remote_head,
            "GitHub merged publication to current main",
        )
    else:
        _git_id(
            recorded_remote_main_revision,
            "publication.verification.observed_remote_main_revision",
        )
        _verify_github_ancestor(
            merged_main_revision,
            recorded_remote_main_revision,
            "GitHub merged publication to recorded main",
        )
        _verify_github_ancestor(
            recorded_remote_main_revision,
            remote_head,
            "GitHub recorded main to current main",
        )

    commit = _github_api_json(
        f"{PUBLIC_GITHUB_API_PREFIX}/git/commits/{merged_main_revision}"
    )
    tree_object = _github_required_mapping(commit.get("tree"), "GitHub commit tree")
    if commit.get("sha") != merged_main_revision:
        raise ValueError("GitHub commit identity differs")
    tree = _github_required_string(tree_object.get("sha"), "GitHub commit tree SHA")
    _git_id(tree, "publication.merged_main_tree")

    encoded_path = quote(data_path, safe="/")
    query = urlencode({"ref": merged_main_revision})
    content = _github_api_json(
        f"{PUBLIC_GITHUB_API_PREFIX}/contents/{encoded_path}?{query}"
    )
    if content.get("type") != "file" or content.get("path") != data_path:
        raise ValueError("GitHub publication path is not the exact data file")
    blob = _github_required_string(content.get("sha"), "GitHub publication blob SHA")
    _git_id(blob, "publication.merged_main_blob")
    if content.get("encoding") != "base64":
        raise ValueError("GitHub publication content is not base64")
    encoded_content = _github_required_string(
        content.get("content"), "GitHub publication content"
    )
    try:
        blob_raw = base64.b64decode(encoded_content.replace("\n", ""), validate=True)
    except (ValueError, base64.binascii.Error) as error:
        raise ValueError("GitHub publication content is invalid base64") from error
    if content.get("size") != len(blob_raw):
        raise ValueError("GitHub publication content size differs")
    if blob_raw != expected_document_raw:
        raise ValueError("GitHub publication blob bytes differ from the document")
    computed_blob = hashlib.sha1(
        f"blob {len(blob_raw)}\0".encode("ascii") + blob_raw
    ).hexdigest()
    if blob != computed_blob:
        raise ValueError("GitHub publication blob SHA differs from its exact bytes")
    return {
        "repository_object_format": "sha1",
        "pull_request_number": pull_request_number,
        "pull_request_url": pull_request_url,
        "observed_remote_main_revision": remote_head,
        "merged_main_revision": merged_main_revision,
        "merged_main_tree": tree,
        "merged_main_blob": blob,
        "merged_at_utc": merged_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def _observe_publication(
    repository_root: str | Path,
    *,
    pull_request_number: int,
    merged_main_revision: str,
    data_path: str,
    expected_document_raw: bytes,
    reverify_github: bool,
    recorded_remote_main_revision: str | None = None,
) -> dict:
    local = _observe_publication_local_git(
        repository_root,
        merged_main_revision=merged_main_revision,
        data_path=data_path,
        expected_document_raw=expected_document_raw,
    )
    if not reverify_github:
        return local
    github = _observe_publication_github(
        pull_request_number=pull_request_number,
        merged_main_revision=merged_main_revision,
        data_path=data_path,
        expected_document_raw=expected_document_raw,
        recorded_remote_main_revision=recorded_remote_main_revision,
    )
    _exact_value(
        {
            "repository_object_format": local["repository_object_format"],
            "merged_main_revision": local["merged_main_revision"],
            "merged_main_tree": local["merged_main_tree"],
            "merged_main_blob": local["merged_main_blob"],
        },
        {
            "repository_object_format": github["repository_object_format"],
            "merged_main_revision": github["merged_main_revision"],
            "merged_main_tree": github["merged_main_tree"],
            "merged_main_blob": github["merged_main_blob"],
        },
        "GitHub and local git publication objects",
    )
    return github


def _publication_verification_body(receipt: Mapping) -> dict:
    return {
        key: copy.deepcopy(receipt[key]) for key in receipt if key != "receipt_sha256"
    }


def _validate_publication_verification_receipt(value: Any) -> dict:
    receipt = _exact_dict(
        value,
        PUBLICATION_VERIFICATION_FIELDS,
        "protocol.preregistration_publication.verification_receipt",
    )
    if receipt["schema"] != PUBLICATION_VERIFICATION_SCHEMA:
        raise ValueError("publication verification receipt schema differs")
    if receipt["authority"] != "github-rest-api-tls-merge-and-object-verification":
        raise ValueError("publication verification receipt authority differs")
    if receipt["repository_url"] != PUBLIC_REPOSITORY_URL:
        raise ValueError("publication verification receipt repository differs")
    if receipt["branch"] != "main":
        raise ValueError("publication verification receipt branch differs")
    if receipt["remote_tracking_ref"] != PUBLIC_REMOTE_TRACKING_REF:
        raise ValueError("publication verification receipt remote ref differs")
    pull_request_number = _positive_int(
        receipt["pull_request_number"],
        "publication.verification.pull_request_number",
        100_000_000,
    )
    if (
        receipt["pull_request_url"]
        != f"{PUBLIC_REPOSITORY_URL}/pull/{pull_request_number}"
    ):
        raise ValueError("publication verification pull request URL differs")
    _git_id(
        receipt["observed_remote_main_revision"],
        "publication.verification.observed_remote_main_revision",
    )
    if receipt["repository_object_format"] != "sha1":
        raise ValueError("publication verification object format differs")
    for key in ("merged_main_revision", "merged_main_tree", "merged_main_blob"):
        _git_id(receipt[key], f"publication.verification.{key}")
    if (
        type(receipt["data_path"]) is not str
        or PUBLICATION_DATA_PATH_RE.fullmatch(receipt["data_path"]) is None
    ):
        raise ValueError("publication verification data path differs")
    _asset(receipt["artifact"], "publication.verification.artifact")
    _semantic_id(
        receipt["protocol_core_sha256"],
        "publication.verification.protocol_core_sha256",
    )
    _utc_second(receipt["merged_at_utc"], "publication.verification.merged_at_utc")
    expected = _body_digest(
        "shogi-external-81dojo-github-publication-verification-v1\0",
        _publication_verification_body(receipt),
    )
    if receipt["receipt_sha256"] != expected:
        raise ValueError("publication verification receipt SHA-256 differs")
    return receipt


def bind_merged_main_publication(
    document: Mapping,
    *,
    repository_root: str | Path,
    data_path: str,
    pull_request_number: int,
    merged_main_revision: str,
) -> Mapping:
    document = _capture_plain_json(document, "publication document")
    _validate_publication_document(document)
    if (
        type(data_path) is not str
        or PUBLICATION_DATA_PATH_RE.fullmatch(data_path) is None
    ):
        raise ValueError("publication data path is not a data-only JSON path")
    raw = encode_preregistration_publication_document(document)
    observed = _observe_publication(
        repository_root,
        pull_request_number=pull_request_number,
        merged_main_revision=merged_main_revision,
        data_path=data_path,
        expected_document_raw=raw,
        reverify_github=True,
    )
    recorded_at = _utc_second(
        document["recorded_at_utc"], "publication.document.recorded_at_utc"
    )
    merged_at = _utc_second(observed["merged_at_utc"], "publication.merged_at_utc")
    if merged_at < recorded_at:
        raise ValueError("merged-main publication predates its document")
    artifact = {
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    verification_body = {
        "schema": PUBLICATION_VERIFICATION_SCHEMA,
        "authority": "github-rest-api-tls-merge-and-object-verification",
        "repository_url": PUBLIC_REPOSITORY_URL,
        "branch": "main",
        "remote_tracking_ref": PUBLIC_REMOTE_TRACKING_REF,
        "pull_request_number": observed["pull_request_number"],
        "pull_request_url": observed["pull_request_url"],
        "observed_remote_main_revision": observed["observed_remote_main_revision"],
        "repository_object_format": observed["repository_object_format"],
        "merged_main_revision": merged_main_revision,
        "merged_main_tree": observed["merged_main_tree"],
        "merged_main_blob": observed["merged_main_blob"],
        "data_path": data_path,
        "artifact": artifact,
        "protocol_core_sha256": document["protocol_core_sha256"],
        "merged_at_utc": observed["merged_at_utc"],
    }
    verification_receipt = {
        **verification_body,
        "receipt_sha256": _body_digest(
            "shogi-external-81dojo-github-publication-verification-v1\0",
            verification_body,
        ),
    }
    binding = {
        "schema": PUBLICATION_BINDING_SCHEMA,
        "repository_url": PUBLIC_REPOSITORY_URL,
        "branch": "main",
        "remote_tracking_ref": PUBLIC_REMOTE_TRACKING_REF,
        "pull_request_number": observed["pull_request_number"],
        "pull_request_url": observed["pull_request_url"],
        "data_path": data_path,
        "artifact": artifact,
        "document": document,
        "merged_main_revision": merged_main_revision,
        "merged_main_tree": observed["merged_main_tree"],
        "merged_main_blob": observed["merged_main_blob"],
        "merged_at_utc": observed["merged_at_utc"],
        "verification_receipt": verification_receipt,
    }
    _validate_publication_binding(
        binding,
        document["protocol_core_sha256"],
        repository_root=repository_root,
        reverify_github=True,
    )
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


def _validate_publication_binding(
    value: Any,
    expected_core_sha256: str,
    *,
    repository_root: str | Path,
    reverify_github: bool = True,
) -> dict:
    binding = _exact_dict(
        value, PUBLICATION_BINDING_FIELDS, "protocol.preregistration_publication"
    )
    if binding["schema"] != PUBLICATION_BINDING_SCHEMA:
        raise ValueError("publication binding schema differs")
    if binding["repository_url"] != PUBLIC_REPOSITORY_URL:
        raise ValueError("publication repository differs")
    if binding["branch"] != "main":
        raise ValueError("protocol commitment was not published on main")
    if binding["remote_tracking_ref"] != PUBLIC_REMOTE_TRACKING_REF:
        raise ValueError("protocol commitment remote tracking ref differs")
    pull_request_number = _positive_int(
        binding["pull_request_number"],
        "publication.pull_request_number",
        100_000_000,
    )
    if (
        binding["pull_request_url"]
        != f"{PUBLIC_REPOSITORY_URL}/pull/{pull_request_number}"
    ):
        raise ValueError("publication pull request URL differs")
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
    _git_id(binding["merged_main_blob"], "publication.merged_main_blob")
    merged_at = _utc_second(binding["merged_at_utc"], "publication.merged_at_utc")
    recorded_at = _utc_second(
        document["recorded_at_utc"], "publication.document.recorded_at_utc"
    )
    if merged_at < recorded_at:
        raise ValueError("merged-main publication predates its document")
    verification = _validate_publication_verification_receipt(
        binding["verification_receipt"]
    )
    _exact_value(
        {
            "repository_url": verification["repository_url"],
            "branch": verification["branch"],
            "remote_tracking_ref": verification["remote_tracking_ref"],
            "pull_request_number": verification["pull_request_number"],
            "pull_request_url": verification["pull_request_url"],
            "merged_main_revision": verification["merged_main_revision"],
            "merged_main_tree": verification["merged_main_tree"],
            "merged_main_blob": verification["merged_main_blob"],
            "data_path": verification["data_path"],
            "artifact": verification["artifact"],
            "protocol_core_sha256": verification["protocol_core_sha256"],
            "merged_at_utc": verification["merged_at_utc"],
        },
        {
            "repository_url": binding["repository_url"],
            "branch": binding["branch"],
            "remote_tracking_ref": binding["remote_tracking_ref"],
            "pull_request_number": binding["pull_request_number"],
            "pull_request_url": binding["pull_request_url"],
            "merged_main_revision": binding["merged_main_revision"],
            "merged_main_tree": binding["merged_main_tree"],
            "merged_main_blob": binding["merged_main_blob"],
            "data_path": binding["data_path"],
            "artifact": binding["artifact"],
            "protocol_core_sha256": document["protocol_core_sha256"],
            "merged_at_utc": binding["merged_at_utc"],
        },
        "publication verification receipt binding",
    )
    if repository_root is _STRUCTURAL_VALIDATION_SENTINEL:
        return binding
    observed = _observe_publication(
        repository_root,
        pull_request_number=binding["pull_request_number"],
        merged_main_revision=binding["merged_main_revision"],
        data_path=binding["data_path"],
        expected_document_raw=raw,
        reverify_github=reverify_github,
        recorded_remote_main_revision=(
            verification["observed_remote_main_revision"] if reverify_github else None
        ),
    )
    observed_comparison = {
        "repository_object_format": observed["repository_object_format"],
        "merged_main_revision": observed["merged_main_revision"],
        "merged_main_tree": observed["merged_main_tree"],
        "merged_main_blob": observed["merged_main_blob"],
    }
    expected_observation = {
        "repository_object_format": verification["repository_object_format"],
        "merged_main_revision": binding["merged_main_revision"],
        "merged_main_tree": binding["merged_main_tree"],
        "merged_main_blob": binding["merged_main_blob"],
    }
    if reverify_github:
        observed_comparison.update(
            {
                "pull_request_number": observed["pull_request_number"],
                "pull_request_url": observed["pull_request_url"],
                "merged_at_utc": observed["merged_at_utc"],
            }
        )
        expected_observation.update(
            {
                "pull_request_number": binding["pull_request_number"],
                "pull_request_url": binding["pull_request_url"],
                "merged_at_utc": binding["merged_at_utc"],
            }
        )
    _exact_value(
        observed_comparison,
        expected_observation,
        (
            "publication GitHub and local git objects"
            if reverify_github
            else "publication trusted local git objects"
        ),
    )
    return binding


def _validate_candidate_protocol_common(
    protocol: Mapping,
    *,
    repository_root: str | Path | object,
    reverify_github: bool,
) -> Mapping:
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
        protocol["preregistration_publication"],
        protocol_core_sha256(core),
        repository_root=repository_root,
        reverify_github=reverify_github,
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


_STRUCTURAL_VALIDATION_SENTINEL = object()


def _validate_candidate_protocol_structure(protocol: Mapping) -> Mapping:
    return _validate_candidate_protocol_common(
        protocol,
        repository_root=_STRUCTURAL_VALIDATION_SENTINEL,
        reverify_github=False,
    )


def _validate_candidate_protocol_local(
    protocol: Mapping, *, repository_root: str | Path
) -> Mapping:
    """Validate exact local objects without consuming GitHub API rate limit."""

    return _validate_candidate_protocol_common(
        protocol,
        repository_root=repository_root,
        reverify_github=False,
    )


def validate_candidate_protocol(
    protocol: Mapping, *, repository_root: str | Path
) -> Mapping:
    """Reverify publication against GitHub's live TLS API and local objects."""

    return _validate_candidate_protocol_common(
        protocol,
        repository_root=repository_root,
        reverify_github=True,
    )


def build_candidate_protocol(
    *,
    core: Mapping,
    assembled_at_utc: str,
    preregistration_publication: Mapping,
    repository_root: str | Path,
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
    validate_candidate_protocol(protocol, repository_root=repository_root)
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
        "shogi-external-81dojo-candidate-trace-decisions-v2\0", captured
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


def _build_content_receipt(document: Mapping, *, domain: str) -> dict:
    captured = _capture_plain_json(document, "receipt document")
    if type(captured) is not dict:
        raise ValueError("receipt document is not an exact JSON object")
    raw = canonical_json_bytes(captured) + b"\n"
    return {
        "document": captured,
        "artifact": {
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        },
        "receipt_sha256": _body_digest(domain, captured),
    }


def _validate_content_receipt(
    value: Any,
    *,
    document_fields: frozenset[str],
    schema: str,
    domain: str,
    label: str,
) -> dict:
    envelope = _exact_dict(value, CONTENT_RECEIPT_FIELDS, label)
    document = _exact_dict(envelope["document"], document_fields, f"{label}.document")
    if document["schema"] != schema:
        raise ValueError(f"{label} schema differs")
    raw = canonical_json_bytes(document) + b"\n"
    _exact_value(
        envelope["artifact"],
        {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()},
        f"{label}.artifact",
    )
    expected = _body_digest(domain, document)
    if envelope["receipt_sha256"] != expected:
        raise ValueError(f"{label} domain-separated SHA-256 differs")
    return document


def _trace_binding_fields(
    protocol: Mapping, server_game_id: str, server_record: Mapping
) -> dict:
    return {
        "protocol_sha256": protocol["protocol_sha256"],
        "server_game_id": server_game_id,
        "candidate_binding_sha256": candidate_binding_sha256(protocol),
        "runtime_binding_sha256": runtime_binding_sha256(protocol),
        "server_record_artifact": copy.deepcopy(server_record["artifact"]),
        "server_normalized_moves_sha256": server_record["normalized_moves_sha256"],
    }


def build_candidate_trace(
    protocol: Mapping,
    *,
    server_game_id: str,
    server_record: Mapping,
    runtime_execution_artifact: Mapping,
    decisions: Sequence[Mapping],
) -> Mapping:
    """Build exact content receipts for one candidate runtime trace.

    The trace artifact is the canonical receipt document itself.  Its nested
    runtime and decision receipts repeat the protocol/candidate/runtime/game/
    server-record binding, so changing only an outer wrapper cannot make old
    receipt bytes valid for another candidate or game.
    """

    _validate_candidate_protocol_structure(protocol)
    if (
        type(server_game_id) is not str
        or SERVER_GAME_ID_RE.fullmatch(server_game_id) is None
    ):
        raise ValueError("candidate trace server game ID is invalid")
    server_record = _validate_server_record(server_record)
    runtime_execution_artifact = _capture_plain_json(
        runtime_execution_artifact, "runtime execution artifact"
    )
    _asset(runtime_execution_artifact, "runtime execution artifact")
    binding = _trace_binding_fields(protocol, server_game_id, server_record)
    runtime_document = {
        "schema": RUNTIME_RECEIPT_SCHEMA,
        **copy.deepcopy(binding),
        "execution_artifact": runtime_execution_artifact,
    }
    runtime_receipt = _build_content_receipt(
        runtime_document,
        domain="shogi-external-81dojo-runtime-receipt-v1\0",
    )
    captured_decisions = _capture_plain_json(decisions, "trace decision inputs")
    if type(captured_decisions) is not list:
        raise ValueError("trace decision inputs are not a list")
    decision_receipts = []
    for index, value in enumerate(captured_decisions):
        decision = _exact_dict(
            value,
            TRACE_DECISION_INPUT_FIELDS,
            f"trace decision inputs[{index}]",
        )
        ply = _positive_int(decision["ply"], f"trace decisions[{index}].ply", 10_000)
        usi = decision["usi"]
        if type(usi) is not str or USI_MOVE_RE.fullmatch(usi) is None:
            raise ValueError(f"trace decisions[{index}].usi is not canonical")
        _asset(
            decision["search_artifact"],
            f"trace decisions[{index}].search_artifact",
        )
        decision_document = {
            "schema": DECISION_RECEIPT_SCHEMA,
            **copy.deepcopy(binding),
            "ply": ply,
            "usi": usi,
            "search_artifact": copy.deepcopy(decision["search_artifact"]),
        }
        decision_receipts.append(
            _build_content_receipt(
                decision_document,
                domain="shogi-external-81dojo-decision-receipt-v1\0",
            )
        )
    trace_document = {
        "schema": TRACE_RECEIPT_SCHEMA,
        **copy.deepcopy(binding),
        "runtime_receipt": runtime_receipt,
        "decisions": decision_receipts,
        "decisions_sha256": trace_decisions_sha256(decision_receipts),
    }
    return {
        "schema": TRACE_SCHEMA,
        "receipt": _build_content_receipt(
            trace_document,
            domain="shogi-external-81dojo-candidate-trace-receipt-v1\0",
        ),
    }


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
    document = _validate_content_receipt(
        trace["receipt"],
        document_fields=TRACE_RECEIPT_FIELDS,
        schema=TRACE_RECEIPT_SCHEMA,
        domain="shogi-external-81dojo-candidate-trace-receipt-v1\0",
        label="candidate trace receipt",
    )
    expected_binding = _trace_binding_fields(protocol, server_game_id, server_record)
    for key, expected in expected_binding.items():
        _exact_value(
            document[key],
            expected,
            f"candidate trace receipt.{key}",
        )
    runtime_document = _validate_content_receipt(
        document["runtime_receipt"],
        document_fields=RUNTIME_RECEIPT_FIELDS,
        schema=RUNTIME_RECEIPT_SCHEMA,
        domain="shogi-external-81dojo-runtime-receipt-v1\0",
        label="candidate trace runtime receipt",
    )
    for key, expected in expected_binding.items():
        _exact_value(
            runtime_document[key],
            expected,
            f"candidate trace runtime receipt.{key}",
        )
    _asset(
        runtime_document["execution_artifact"],
        "candidate trace runtime receipt.execution_artifact",
    )
    decisions = document["decisions"]
    if type(decisions) is not list:
        raise ValueError("candidate trace decisions are not a list")
    for index, decision_receipt in enumerate(decisions):
        decision = _validate_content_receipt(
            decision_receipt,
            document_fields=DECISION_RECEIPT_FIELDS,
            schema=DECISION_RECEIPT_SCHEMA,
            domain="shogi-external-81dojo-decision-receipt-v1\0",
            label=f"candidate trace decision receipt[{index}]",
        )
        for key, expected in expected_binding.items():
            _exact_value(
                decision[key],
                expected,
                f"candidate trace decision receipt[{index}].{key}",
            )
        _positive_int(decision["ply"], f"trace.decisions[{index}].ply", 10_000)
        if (
            type(decision["usi"]) is not str
            or USI_MOVE_RE.fullmatch(decision["usi"]) is None
        ):
            raise ValueError(f"trace.decisions[{index}].usi is not canonical")
        _asset(
            decision["search_artifact"],
            f"trace.decisions[{index}].search_artifact",
        )
    expected = trace_decisions_sha256(decisions)
    if document["decisions_sha256"] != expected:
        raise ValueError("candidate trace decision digest differs")
    return document


def _validate_trace_matches_server(
    color: str, server_record: Mapping, trace: Mapping
) -> None:
    moves = server_record["normalized_moves"]
    first_ply = 1 if color == "sente" else 2
    expected_plies = list(range(first_ply, len(moves) + 1, 2))
    decisions = [
        decision_receipt["document"] for decision_receipt in trace["decisions"]
    ]
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


def _validate_game_entry_validated(entry: Mapping, protocol: Mapping) -> Mapping:
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


def validate_game_entry(
    entry: Mapping,
    protocol: Mapping,
    *,
    repository_root: str | Path,
) -> Mapping:
    _validate_candidate_protocol_local(protocol, repository_root=repository_root)
    return _validate_game_entry_validated(entry, protocol)


def _build_game_entry_validated(
    protocol: Mapping,
    *,
    sequence: int,
    previous_entry_sha256: str | None,
    observation: Mapping,
) -> Mapping:
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
    _validate_game_entry_validated(entry, protocol)
    return entry


def build_game_entry(
    protocol: Mapping,
    *,
    sequence: int,
    previous_entry_sha256: str | None,
    observation: Mapping,
    repository_root: str | Path,
) -> Mapping:
    _validate_candidate_protocol_local(protocol, repository_root=repository_root)
    return _build_game_entry_validated(
        protocol,
        sequence=sequence,
        previous_entry_sha256=previous_entry_sha256,
        observation=observation,
    )


def encode_ledger_entry(entry: Mapping) -> bytes:
    return canonical_json_bytes(entry) + b"\n"


def _parse_ledger_validated(raw: bytes, protocol: Mapping) -> list[Mapping]:
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
        _validate_game_entry_validated(entry, protocol)
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


def parse_ledger(
    raw: bytes,
    protocol: Mapping,
    *,
    repository_root: str | Path,
) -> list[Mapping]:
    """Parse a canonical JSONL diagnostic view without issuing a final receipt."""

    _validate_candidate_protocol_local(protocol, repository_root=repository_root)
    return _parse_ledger_validated(raw, protocol)


def verify_append_only_extension(
    previous_raw: bytes,
    current_raw: bytes,
    protocol: Mapping,
    *,
    repository_root: str | Path,
) -> Mapping:
    _validate_candidate_protocol_local(protocol, repository_root=repository_root)
    previous = _parse_ledger_validated(previous_raw, protocol)
    current = _parse_ledger_validated(current_raw, protocol)
    if not current_raw.startswith(previous_raw):
        raise ValueError("current ledger rewrote or removed a published prefix")
    if len(current) < len(previous):
        raise ValueError("current ledger is shorter than its published prefix")
    return {
        "authority": "diagnostic-only-not-final-receipt",
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
    absolute = Path(os.path.abspath(raw))
    if len(absolute.parts) < 2:
        raise ValueError("ledger directory must not be the filesystem root")
    return absolute


def _require_atomic_directory_primitives() -> tuple[int, int]:
    no_follow = getattr(os, "O_NOFOLLOW", None)
    directory = getattr(os, "O_DIRECTORY", None)
    if (
        type(no_follow) is not int
        or type(directory) is not int
        or not _DIR_FD_OPEN_SUPPORTED
        or not _DIR_FD_MKDIR_SUPPORTED
        or not _DIR_FD_STAT_SUPPORTED
        or not _DIR_FD_UNLINK_SUPPORTED
        or not _DIR_FD_LINK_SUPPORTED
    ):
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


def _directory_flags(no_follow: int, directory_flag: int) -> int:
    flags = os.O_RDONLY | no_follow | directory_flag
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    return flags


def _open_absolute_parent_descriptor(path: Path) -> tuple[int, str]:
    no_follow, directory_flag = _require_atomic_directory_primitives()
    flags = _directory_flags(no_follow, directory_flag)
    current = os.open(path.anchor, flags)
    try:
        for component in path.parts[1:-1]:
            following = os.open(component, flags, dir_fd=current)
            os.close(current)
            current = following
        return current, path.name
    except BaseException:
        os.close(current)
        raise


def _inode_identity(info: os.stat_result, mode: int) -> dict:
    return {
        "device": str(info.st_dev),
        "inode": str(info.st_ino),
        "owner": str(info.st_uid),
        "mode": f"{stat.S_IMODE(info.st_mode):04o}",
        "expected_mode": f"{mode:04o}",
    }


def _verify_storage_path_binding(storage: Mapping) -> None:
    path = storage["path"]
    parent_fd = -1
    check_fd = -1
    try:
        parent_fd, leaf = _open_absolute_parent_descriptor(path)
        no_follow, directory_flag = _require_atomic_directory_primitives()
        check_fd = os.open(
            leaf,
            _directory_flags(no_follow, directory_flag),
            dir_fd=parent_fd,
        )
        expected = os.fstat(storage["root_fd"])
        observed = os.fstat(check_fd)
        if (observed.st_dev, observed.st_ino) != (
            expected.st_dev,
            expected.st_ino,
        ):
            raise ValueError("ledger path no longer names the opened storage root")
        for name, descriptor, verifier, label in (
            (".lock", storage["lock_fd"], _verify_private_file, "ledger lock"),
            (
                "entries",
                storage["entries_fd"],
                _verify_private_directory,
                "ledger entries directory",
            ),
        ):
            path_info = os.stat(
                name,
                dir_fd=storage["root_fd"],
                follow_symlinks=False,
            )
            opened_info = os.fstat(descriptor)
            verifier(opened_info, label)
            if (path_info.st_dev, path_info.st_ino) != (
                opened_info.st_dev,
                opened_info.st_ino,
            ):
                raise ValueError(f"{label} path no longer names its opened inode")
    except OSError as error:
        raise ValueError(
            "ledger descriptor-walk postflight could not rebind the storage root"
        ) from error
    finally:
        if check_fd >= 0:
            os.close(check_fd)
        if parent_fd >= 0:
            os.close(parent_fd)


def _open_authoritative_storage(
    ledger_directory: str | Path, *, create: bool, exclusive: bool
) -> dict:
    path = _absolute_ledger_directory(ledger_directory)
    no_follow, directory_flag = _require_atomic_directory_primitives()
    root_flags = _directory_flags(no_follow, directory_flag)
    parent_fd = -1
    root_fd = -1
    lock_fd = -1
    entries_fd = -1
    try:
        parent_fd, leaf = _open_absolute_parent_descriptor(path)
        try:
            root_fd = os.open(leaf, root_flags, dir_fd=parent_fd)
        except FileNotFoundError:
            if not create:
                raise
            try:
                os.mkdir(leaf, 0o700, dir_fd=parent_fd)
            except FileExistsError:
                pass
            root_fd = os.open(leaf, root_flags, dir_fd=parent_fd)
        if create:
            # This also completes durability after a prior interrupted first
            # creation whose namespace entry happened to remain visible.
            os.fsync(parent_fd)
        _verify_private_directory(os.fstat(root_fd), "ledger directory")
        lock_flags = os.O_RDWR | no_follow
        if hasattr(os, "O_CLOEXEC"):
            lock_flags |= os.O_CLOEXEC
        lock_created = False
        if create:
            try:
                lock_fd = os.open(
                    ".lock",
                    lock_flags | os.O_CREAT | os.O_EXCL,
                    0o600,
                    dir_fd=root_fd,
                )
                lock_created = True
            except FileExistsError:
                lock_fd = os.open(".lock", lock_flags, dir_fd=root_fd)
        else:
            lock_fd = os.open(".lock", lock_flags, dir_fd=root_fd)
        _verify_private_file(os.fstat(lock_fd), "ledger lock")
        if create:
            # The lock inode and its root-directory name are durable before it
            # can authorize an append.
            os.fsync(lock_fd)
            os.fsync(root_fd)
        fcntl.flock(lock_fd, fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH)
        if create:
            try:
                os.mkdir("entries", 0o700, dir_fd=root_fd)
            except FileExistsError:
                pass
        entries_fd = os.open("entries", root_flags, dir_fd=root_fd)
        _verify_private_directory(os.fstat(entries_fd), "ledger entries directory")
        if create:
            # Commit either a newly created entries directory or the recovery
            # of one left visible by an interrupted earlier creation.
            os.fsync(root_fd)
        storage = {
            "path": path,
            "root_fd": root_fd,
            "lock_fd": lock_fd,
            "entries_fd": entries_fd,
            "root_identity": _inode_identity(os.fstat(root_fd), 0o700),
            "entries_identity": _inode_identity(os.fstat(entries_fd), 0o700),
            "lock_created": lock_created,
        }
        _verify_storage_path_binding(storage)
        os.close(parent_fd)
        return storage
    except BaseException:
        if entries_fd >= 0:
            os.close(entries_fd)
        if lock_fd >= 0:
            os.close(lock_fd)
        if root_fd >= 0:
            os.close(root_fd)
        if parent_fd >= 0:
            os.close(parent_fd)
        raise


def _close_authoritative_storage(storage: Mapping) -> None:
    try:
        fcntl.flock(storage["lock_fd"], fcntl.LOCK_UN)
    finally:
        os.close(storage["entries_fd"])
        os.close(storage["lock_fd"])
        os.close(storage["root_fd"])


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


def _read_authoritative_entries(storage: Mapping, no_follow: int) -> tuple[bytes, dict]:
    entries_fd = storage["entries_fd"]
    final_names: list[tuple[int, str]] = []
    temporary_infos: dict[str, os.stat_result] = {}
    for name in os.listdir(entries_fd):
        match = ENTRY_FILE_RE.fullmatch(name)
        if match is not None:
            final_names.append((int(match.group(1)), name))
            continue
        if TEMP_ENTRY_FILE_RE.fullmatch(name) is not None:
            info = os.stat(name, dir_fd=entries_fd, follow_symlinks=False)
            if (
                not stat.S_ISREG(info.st_mode)
                or info.st_uid != os.geteuid()
                or info.st_nlink not in (1, 2)
                or stat.S_IMODE(info.st_mode) not in (0o600, 0o400)
            ):
                raise ValueError("ledger temporary entry is not a private file")
            temporary_infos[name] = info
            continue
        raise ValueError(f"ledger entries directory has unknown member: {name}")
    final_names.sort()
    rows = bytearray()
    manifest_entries = []
    for expected_sequence, (sequence, name) in enumerate(final_names, start=1):
        if sequence != expected_sequence:
            raise ValueError("authoritative ledger entry filenames have a gap")
        flags = os.O_RDONLY | no_follow
        if hasattr(os, "O_CLOEXEC"):
            flags |= os.O_CLOEXEC
        before = os.stat(name, dir_fd=entries_fd, follow_symlinks=False)
        fd = os.open(name, flags, dir_fd=entries_fd)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode):
                raise ValueError(f"ledger entry {name} is not a regular file")
            if (before.st_dev, before.st_ino) != (info.st_dev, info.st_ino):
                raise ValueError(f"ledger entry {name} changed before open")
            if info.st_uid != os.geteuid() or info.st_nlink not in (1, 2):
                raise ValueError(f"ledger entry {name} owner or link count differs")
            if stat.S_IMODE(info.st_mode) != 0o400:
                raise ValueError(f"ledger entry {name} mode must be exactly 0400")
            row = _read_exact_file(fd, info.st_size, f"ledger entry {name}")
            after = os.fstat(fd)
            if (
                after.st_dev,
                after.st_ino,
                after.st_size,
                after.st_mtime_ns,
                after.st_ctime_ns,
            ) != (
                info.st_dev,
                info.st_ino,
                info.st_size,
                info.st_mtime_ns,
                info.st_ctime_ns,
            ):
                raise ValueError(f"ledger entry {name} changed during read")
        finally:
            os.close(fd)
        after_path = os.stat(name, dir_fd=entries_fd, follow_symlinks=False)
        if (
            after_path.st_dev,
            after_path.st_ino,
            after_path.st_uid,
            after_path.st_mode,
            after_path.st_nlink,
            after_path.st_size,
            after_path.st_mtime_ns,
            after_path.st_ctime_ns,
        ) != (
            info.st_dev,
            info.st_ino,
            info.st_uid,
            info.st_mode,
            info.st_nlink,
            info.st_size,
            info.st_mtime_ns,
            info.st_ctime_ns,
        ):
            raise ValueError(f"ledger entry {name} changed after read")
        if info.st_nlink == 2:
            matching_temporaries = [
                temporary_name
                for temporary_name, temporary_info in temporary_infos.items()
                if (temporary_info.st_dev, temporary_info.st_ino)
                == (info.st_dev, info.st_ino)
            ]
            if len(matching_temporaries) != 1:
                raise ValueError(
                    f"ledger entry {name} second link is not its private temp file"
                )
        if row.count(b"\n") != 1 or not row.endswith(b"\n"):
            raise ValueError(f"ledger entry {name} is not one canonical JSONL row")
        manifest_entries.append(
            {
                "sequence": sequence,
                "name": name,
                "bytes": len(row),
                "sha256": hashlib.sha256(row).hexdigest(),
                "device": str(info.st_dev),
                "inode": str(info.st_ino),
                "link_count": info.st_nlink,
            }
        )
        rows.extend(row)
        if len(rows) > MAX_LEDGER_BYTES:
            raise ValueError("ledger exceeds the local size bound")
    final_name_set = {name for _, name in final_names}
    for name in os.listdir(entries_fd):
        if ENTRY_FILE_RE.fullmatch(name) is not None:
            if name not in final_name_set:
                raise ValueError("authoritative ledger changed during directory read")
            continue
        if TEMP_ENTRY_FILE_RE.fullmatch(name) is not None:
            continue
        raise ValueError("ledger entries directory changed during read")
    manifest_body = {
        "schema": AUTHORITATIVE_MANIFEST_SCHEMA,
        "root_identity": copy.deepcopy(storage["root_identity"]),
        "entries_directory_identity": copy.deepcopy(storage["entries_identity"]),
        "entries": manifest_entries,
    }
    manifest = {
        **manifest_body,
        "manifest_sha256": _body_digest(
            "shogi-external-81dojo-authoritative-entry-manifest-v1\0",
            manifest_body,
        ),
    }
    return bytes(rows), manifest


def authoritative_ledger_jsonl(
    ledger_directory: str | Path,
    protocol: Mapping,
    *,
    repository_root: str | Path,
) -> bytes:
    """Return the canonical JSONL derived view of immutable authoritative files."""

    _validate_candidate_protocol_local(protocol, repository_root=repository_root)
    storage = _open_authoritative_storage(
        ledger_directory, create=False, exclusive=False
    )
    try:
        no_follow, _ = _require_atomic_directory_primitives()
        raw, _ = _read_authoritative_entries(storage, no_follow)
        _parse_ledger_validated(raw, protocol)
        _verify_storage_path_binding(storage)
        return raw
    finally:
        _close_authoritative_storage(storage)


def _write_complete_temp_file(fd: int, encoded: bytes) -> None:
    written = 0
    while written < len(encoded):
        count = os.write(fd, encoded[written:])
        if count <= 0:
            raise OSError("temporary ledger entry write made no progress")
        written += count
    os.fchmod(fd, 0o400)
    os.fsync(fd)


class AppendNotCommittedError(RuntimeError):
    status = "not-committed-safe-to-retry"


class AppendIndeterminateError(RuntimeError):
    status = "indeterminate-stop-and-inspect"


def _entry_observation(entry: Mapping) -> dict:
    return {key: copy.deepcopy(entry[key]) for key in OBSERVATION_FIELDS}


def _append_result(
    entry: Mapping,
    manifest: Mapping,
    *,
    reconciled_after_error: bool,
    recovered_existing_commit: bool,
) -> dict:
    name = f"{entry['sequence']:06d}.json"
    matches = [item for item in manifest["entries"] if item["name"] == name]
    if len(matches) != 1:
        raise AppendIndeterminateError(
            "committed entry is absent from the authoritative manifest"
        )
    return {
        "schema": APPEND_RESULT_SCHEMA,
        "status": "committed",
        "reconciled_after_error": reconciled_after_error,
        "recovered_existing_commit": recovered_existing_commit,
        "entry": copy.deepcopy(entry),
        "authoritative_entry": copy.deepcopy(matches[0]),
        "manifest_sha256": manifest["manifest_sha256"],
    }


def _read_and_validate_authoritative(
    storage: Mapping, protocol: Mapping
) -> tuple[bytes, list[Mapping], dict]:
    no_follow, _ = _require_atomic_directory_primitives()
    raw, manifest = _read_authoritative_entries(storage, no_follow)
    games = _parse_ledger_validated(raw, protocol)
    return raw, games, manifest


def _reconcile_publication_error(
    *,
    storage: Mapping,
    protocol: Mapping,
    entry: Mapping,
    encoded: bytes,
    temp_name: str,
    final_name: str,
    link_was_durable: bool,
    error: BaseException,
) -> Mapping:
    try:
        raw, games, manifest = _read_and_validate_authoritative(storage, protocol)
        del raw
    except BaseException as reconciliation_error:
        raise AppendIndeterminateError(
            "append failed after publication began and authoritative state "
            "cannot be reconciled"
        ) from reconciliation_error
    exact_commit = bool(
        games
        and games[-1]["sequence"] == entry["sequence"]
        and encode_ledger_entry(games[-1]) == encoded
    )
    if not exact_commit:
        if any(item["name"] == final_name for item in manifest["entries"]):
            raise AppendIndeterminateError(
                "append final name exists with a different authoritative entry"
            ) from error
        try:
            os.unlink(temp_name, dir_fd=storage["entries_fd"])
            os.fsync(storage["entries_fd"])
        except FileNotFoundError:
            pass
        except OSError:
            pass
        raise AppendNotCommittedError(
            "append did not publish an authoritative entry; retry is safe"
        ) from error
    if not link_was_durable:
        try:
            os.fsync(storage["entries_fd"])
            link_was_durable = True
        except OSError as fsync_error:
            raise AppendIndeterminateError(
                "exact entry is visible but durable publication is indeterminate"
            ) from fsync_error
    try:
        os.unlink(temp_name, dir_fd=storage["entries_fd"])
    except FileNotFoundError:
        pass
    except OSError:
        # A leftover private temp name is ignored by the authoritative reader.
        pass
    try:
        os.fsync(storage["entries_fd"])
    except OSError:
        if not link_was_durable:
            raise AppendIndeterminateError(
                "authoritative entry durability is indeterminate"
            ) from error
    try:
        _verify_storage_path_binding(storage)
    except BaseException as binding_error:
        raise AppendIndeterminateError(
            "committed entry exists but storage path binding is indeterminate"
        ) from binding_error
    _, games, manifest = _read_and_validate_authoritative(storage, protocol)
    if not games or encode_ledger_entry(games[-1]) != encoded:
        raise AppendIndeterminateError(
            "authoritative entry changed during publication reconciliation"
        ) from error
    return _append_result(
        entry,
        manifest,
        reconciled_after_error=True,
        recovered_existing_commit=False,
    )


def append_local_game(
    ledger_directory: str | Path,
    protocol: Mapping,
    observation: Mapping,
    *,
    repository_root: str | Path,
) -> Mapping:
    """Atomically publish one validated immutable local entry.

    Authoritative state is a private directory of one-file-per-game entries.
    JSONL is only a derived view.  A candidate prefix is fully validated before
    any temporary file is created; a complete fsynced temporary file is then
    hard-linked to its final name without overwrite and the directory is
    fsynced.  No network, engine, credential, or live-weight surface exists.
    """

    _validate_candidate_protocol_local(protocol, repository_root=repository_root)
    observation = _exact_dict(
        _capture_plain_json(observation), OBSERVATION_FIELDS, "game observation"
    )
    storage = _open_authoritative_storage(ledger_directory, create=True, exclusive=True)
    try:
        no_follow, _ = _require_atomic_directory_primitives()
        raw, games, manifest = _read_and_validate_authoritative(storage, protocol)
        if games and _entry_observation(games[-1]) == observation:
            os.fsync(storage["entries_fd"])
            _verify_storage_path_binding(storage)
            return _append_result(
                games[-1],
                manifest,
                reconciled_after_error=False,
                recovered_existing_commit=True,
            )
        if len(games) >= GAME_COUNT:
            raise ValueError("ledger already contains all 200 games")
        entry = _build_game_entry_validated(
            protocol,
            sequence=len(games) + 1,
            previous_entry_sha256=games[-1]["entry_sha256"] if games else None,
            observation=observation,
        )
        encoded = encode_ledger_entry(entry)
        candidate_raw = raw + encoded
        _parse_ledger_validated(candidate_raw, protocol)

        temp_name = f".tmp-{os.getpid()}-{secrets.token_hex(16)}"
        final_name = f"{entry['sequence']:06d}.json"
        temp_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | no_follow
        if hasattr(os, "O_CLOEXEC"):
            temp_flags |= os.O_CLOEXEC
        temp_fd = os.open(temp_name, temp_flags, 0o600, dir_fd=storage["entries_fd"])
        try:
            _write_complete_temp_file(temp_fd, encoded)
        finally:
            os.close(temp_fd)
        link_was_durable = False
        try:
            os.link(
                temp_name,
                final_name,
                src_dir_fd=storage["entries_fd"],
                dst_dir_fd=storage["entries_fd"],
                follow_symlinks=False,
            )
            os.fsync(storage["entries_fd"])
            link_was_durable = True
            os.unlink(temp_name, dir_fd=storage["entries_fd"])
            os.fsync(storage["entries_fd"])
            _verify_storage_path_binding(storage)
            _, games, manifest = _read_and_validate_authoritative(storage, protocol)
            if not games or encode_ledger_entry(games[-1]) != encoded:
                raise AppendIndeterminateError(
                    "published entry differs during append postflight"
                )
            return _append_result(
                entry,
                manifest,
                reconciled_after_error=False,
                recovered_existing_commit=False,
            )
        except AppendIndeterminateError:
            raise
        except Exception as error:
            return _reconcile_publication_error(
                storage=storage,
                protocol=protocol,
                entry=entry,
                encoded=encoded,
                temp_name=temp_name,
                final_name=final_name,
                link_was_durable=link_was_durable,
                error=error,
            )
    finally:
        _close_authoritative_storage(storage)


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


def finalize_calibration(
    ledger_directory: str | Path,
    protocol: Mapping,
    *,
    repository_root: str | Path,
) -> Mapping:
    """Issue a terminal receipt only from locked authoritative entry files."""

    validate_candidate_protocol(protocol, repository_root=repository_root)
    storage = _open_authoritative_storage(
        ledger_directory, create=False, exclusive=False
    )
    try:
        ledger_raw, games, manifest = _read_and_validate_authoritative(
            storage, protocol
        )
        _verify_storage_path_binding(storage)
    finally:
        _close_authoritative_storage(storage)
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
                "github-rest-api-tls-merge-time-main-ancestry-and-objects-reverified"
            ),
            "repository_url": protocol["preregistration_publication"]["repository_url"],
            "branch": protocol["preregistration_publication"]["branch"],
            "remote_tracking_ref": protocol["preregistration_publication"][
                "remote_tracking_ref"
            ],
            "pull_request_number": protocol["preregistration_publication"][
                "pull_request_number"
            ],
            "pull_request_url": protocol["preregistration_publication"][
                "pull_request_url"
            ],
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
            "merged_main_blob": protocol["preregistration_publication"][
                "merged_main_blob"
            ],
            "merged_at_utc": protocol["preregistration_publication"]["merged_at_utc"],
            "verification_receipt": copy.deepcopy(
                protocol["preregistration_publication"]["verification_receipt"]
            ),
        },
        "ledger": {
            "authority": "locked-immutable-entry-directory-only",
            "authoritative_manifest": manifest,
            "derived_jsonl": {
                "bytes": len(ledger_raw),
                "sha256": hashlib.sha256(ledger_raw).hexdigest(),
            },
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
            "81dojo_live_network_state_proven": False,
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


def load_protocol_file(
    path: str | Path,
    *,
    repository_root: str | Path,
    reverify_github: bool = True,
) -> Mapping:
    raw = Path(path).read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("candidate protocol is not UTF-8") from error
    protocol = strict_json_loads(text)
    if reverify_github:
        return validate_candidate_protocol(protocol, repository_root=repository_root)
    return _validate_candidate_protocol_local(protocol, repository_root=repository_root)


def _print_json(value: Mapping) -> None:
    sys.stdout.buffer.write(canonical_json_bytes(value) + b"\n")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Offline-only 81Dojo calibration ledger verifier"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    verify = subparsers.add_parser("verify-final")
    verify.add_argument("--protocol", required=True)
    verify.add_argument("--trusted-repository-root", required=True)
    verify.add_argument("--ledger-directory", required=True)

    prefix = subparsers.add_parser("verify-prefix")
    prefix.add_argument("--protocol", required=True)
    prefix.add_argument("--trusted-repository-root", required=True)
    prefix.add_argument("--previous", required=True)
    prefix.add_argument("--current", required=True)

    append = subparsers.add_parser("append-local")
    append.add_argument("--protocol", required=True)
    append.add_argument("--trusted-repository-root", required=True)
    append.add_argument(
        "--ledger-directory", "--ledger", dest="ledger_directory", required=True
    )
    append.add_argument("--observation", required=True)

    derive = subparsers.add_parser("derive-local-jsonl")
    derive.add_argument("--protocol", required=True)
    derive.add_argument("--trusted-repository-root", required=True)
    derive.add_argument("--ledger-directory", required=True)

    args = parser.parse_args(argv)
    protocol = load_protocol_file(
        args.protocol,
        repository_root=args.trusted_repository_root,
        reverify_github=args.command == "verify-final",
    )
    if args.command == "verify-final":
        _print_json(
            finalize_calibration(
                args.ledger_directory,
                protocol,
                repository_root=args.trusted_repository_root,
            )
        )
        return 0
    if args.command == "verify-prefix":
        _print_json(
            verify_append_only_extension(
                Path(args.previous).read_bytes(),
                Path(args.current).read_bytes(),
                protocol,
                repository_root=args.trusted_repository_root,
            )
        )
        return 0
    if args.command == "append-local":
        observation_raw = Path(args.observation).read_text(encoding="utf-8")
        observation = strict_json_loads(observation_raw)
        _print_json(
            append_local_game(
                args.ledger_directory,
                protocol,
                observation,
                repository_root=args.trusted_repository_root,
            )
        )
        return 0
    if args.command == "derive-local-jsonl":
        sys.stdout.buffer.write(
            authoritative_ledger_jsonl(
                args.ledger_directory,
                protocol,
                repository_root=args.trusted_repository_root,
            )
        )
        return 0
    raise AssertionError("unreachable command")


if __name__ == "__main__":
    raise SystemExit(main())
