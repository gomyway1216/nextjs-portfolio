"""Local-only formal paired A/B v2 orchestration.

The checked-in v2 registry is intentionally closed, so the argumentless CLI
always stops before creating a receipt directory or invoking a match adapter.
The dependency-injected executable core is explicitly test-only.  A future
production activation must add one code-pinned checked-in ready-registry
identity; no production function accepts a caller-selected registry.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor, as_completed
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
from typing import Any

from formal_paired_ab_protocol import (
    FRESH_SIBLING_PLAN_BYTES,
    FRESH_SIBLING_PLAN_PATH,
    FRESH_SIBLING_PLAN_SCHEMA,
    FRESH_SIBLING_PLAN_SHA256,
    validate_closed_formal_ab_registry_data,
)
from formal_paired_ab_protocol_v2 import (
    FORMAL_AB_V2_AMENDMENT_BYTES,
    FORMAL_AB_V2_AMENDMENT_PATH,
    FORMAL_AB_V2_AMENDMENT_SCHEMA,
    FORMAL_AB_V2_AMENDMENT_SHA256,
    FORMAL_AB_V2_REGISTRY_BYTES,
    FORMAL_AB_V2_REGISTRY_PATH,
    FORMAL_AB_V2_REGISTRY_SCHEMA,
    FORMAL_AB_V2_REGISTRY_SHA256,
    FORMAL_AB_V2_RESULT_SCHEMA,
    GAME_COUNT,
    ORIGINAL_V1_REGISTRY_BYTES,
    ORIGINAL_V1_REGISTRY_PATH,
    ORIGINAL_V1_REGISTRY_SCHEMA,
    ORIGINAL_V1_REGISTRY_SHA256,
    PAIR_COUNT,
    _require_exact_json,
    _require_exact_semantic_id,
    _require_exact_sha256,
    _strict_json_loads,
    decode_pair_score_units,
    validate_closed_formal_ab_v2_registry_data,
    validate_formal_ab_v2_amendment_data,
)
from fresh_qat_parent_accounting_v2 import _normalized_sfen


LOCAL_RUN_REGISTRY_SCHEMA = "shogi-floodgate-formal-paired-ab-local-run-registry-v1"
LOCAL_OPENINGS_MANIFEST_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-local-openings-manifest-v1"
)
LOCAL_MATCH_BINDING_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-local-match-binding-v1"
)
LOCAL_PAIR_EVENT_SCHEMA = "shogi-floodgate-formal-paired-ab-local-pair-event-v1"
LOCAL_GAME_REQUEST_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-local-game-request-v1"
)
LOCAL_GAME_RECEIPT_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-local-game-receipt-v1"
)
LOCAL_CLI_RECEIPT_SCHEMA = "shogi-floodgate-formal-paired-ab-local-cli-receipt-v1"
LOCAL_ATTEMPT_LEDGER_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-local-attempt-ledger-v1"
)
LOCAL_RERUN_AUTHORIZATION_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-local-rerun-authorization-v1"
)

PAIR_WORKER_CANDIDATES = (2, 4, 8, 12)
MAX_PAIR_WORKERS = max(PAIR_WORKER_CANDIDATES)
ZERO_SHA256 = "0" * 64
PAIR_FILE_PREFIX = "pair-"
PAIR_FILE_SUFFIX = ".jsonl"

# Production remains closed.  A future reviewed code change must replace this
# with an exact path/bytes/SHA-256/schema identity for one checked-in ready
# registry.  The executable injected core below remains CoreForTests.
_PINNED_READY_RUN_REGISTRY_IDENTITY: dict[str, Any] | None = None

_CORE_FOR_TESTS_DETERMINISTIC_OPTIONS = {
    "fixture_only": True,
    "options_are_pinned_not_interpreted_by_launcher": True,
}

_PLAN_IDENTITY = {
    "path": FRESH_SIBLING_PLAN_PATH,
    "bytes": FRESH_SIBLING_PLAN_BYTES,
    "sha256": FRESH_SIBLING_PLAN_SHA256,
    "schema": FRESH_SIBLING_PLAN_SCHEMA,
}
_SOURCE_REGISTRY_IDENTITY = {
    "path": FORMAL_AB_V2_REGISTRY_PATH,
    "bytes": FORMAL_AB_V2_REGISTRY_BYTES,
    "sha256": FORMAL_AB_V2_REGISTRY_SHA256,
    "schema": FORMAL_AB_V2_REGISTRY_SCHEMA,
}
_AMENDMENT_IDENTITY = {
    "path": FORMAL_AB_V2_AMENDMENT_PATH,
    "bytes": FORMAL_AB_V2_AMENDMENT_BYTES,
    "sha256": FORMAL_AB_V2_AMENDMENT_SHA256,
    "schema": FORMAL_AB_V2_AMENDMENT_SCHEMA,
}
_ORIGINAL_V1_REGISTRY_IDENTITY = {
    "path": ORIGINAL_V1_REGISTRY_PATH,
    "bytes": ORIGINAL_V1_REGISTRY_BYTES,
    "sha256": ORIGINAL_V1_REGISTRY_SHA256,
    "schema": ORIGINAL_V1_REGISTRY_SCHEMA,
}

_IDENTITY_FIELDS = frozenset({"path", "bytes", "sha256"})
_SCHEMA_IDENTITY_FIELDS = frozenset({"path", "bytes", "sha256", "schema"})
_RUN_REGISTRY_FIELDS = frozenset(
    {
        "schema",
        "status",
        "source_registry",
        "plan",
        "protocol_amendment_sha256",
        "experiment_id",
        "run_id",
        "attempt_index",
        "attempt_ledger",
        "rerun_authorization",
        "openings_manifest",
        "match_binding",
        "pair_workers",
        "execution_boundary",
    }
)
_OPENINGS_MANIFEST_FIELDS = frozenset({"schema", "pairs"})
_OPENING_PAIR_FIELDS = frozenset(
    {"pair_index", "opening_id", "opening", "seed", "games"}
)
_OPENING_FIELDS = frozenset({"sfen", "usi_moves"})
_GAME_PLAN_FIELDS = frozenset(
    {"game_index", "game_id", "candidate_color"}
)
_MATCH_BINDING_FIELDS = frozenset(
    {
        "schema",
        "engine_protocol",
        "opening_protocol",
        "result_protocol",
        "assets",
        "deterministic_options",
        "safety",
    }
)
_MATCH_ASSET_FIELDS = frozenset(
    {
        "candidate_weights",
        "stable_weights",
        "yaneuraou_engine",
        "yaneuraou_engine_receipt",
        "yaneuraou_eval",
        "local_match_adapter",
    }
)
_SAFETY_FIELDS = frozenset(
    {
        "local_only",
        "network",
        "aws",
        "external_calibration",
        "live_weight_write",
        "automatic_run",
    }
)
_YANEURAOU_RECEIPT_FIELDS = frozenset(
    {
        "schema",
        "source_repository",
        "source_commit",
        "source_commit_date",
        "build_directory",
        "build_command",
        "compiler",
        "compiler_target",
        "engine_id",
        "binary_bytes",
        "binary_sha256",
    }
)
_GAME_RECEIPT_FIELDS = frozenset(
    {
        "schema",
        "pair_index",
        "opening_id",
        "game_index",
        "game_id",
        "candidate_color",
        "seed",
        "candidate_weights_sha256",
        "stable_weights_sha256",
        "match_binding_sha256",
        "result",
        "technical_fault",
    }
)
_ATTEMPT_LEDGER_FIELDS = frozenset(
    {
        "schema",
        "experiment_id",
        "candidate_weights_sha256",
        "stable_weights_sha256",
        "openings_manifest_sha256",
        "match_binding_sha256",
        "attempts",
    }
)
_ATTEMPT_RECORD_FIELDS = frozenset(
    {
        "attempt_index",
        "run_id",
        "disposition",
        "technical_fault_evidence_sha256",
        "result_unblinded",
    }
)
_RERUN_AUTHORIZATION_FIELDS = frozenset(
    {
        "schema",
        "experiment_id",
        "authorized_attempt_index",
        "authorized_run_id",
        "prior_attempt_index",
        "prior_run_id",
        "attempt_ledger_sha256",
        "technical_fault_evidence_sha256",
        "authorization_basis",
        "prior_result_unblinded",
    }
)
_USI_MOVE_RE = re.compile(
    r"^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$"
)


class FormalAbLocalLauncherError(ValueError):
    """Base fail-closed local launcher error."""


class FormalAbLocalLauncherBlocked(FormalAbLocalLauncherError):
    """The tracked registry is closed, so no match may start."""


class FormalAbLocalTechnicalFault(FormalAbLocalLauncherError):
    """A match adapter failed after a pair had been durably started."""


def _exact_dict(value: Any, fields: frozenset[str], label: str) -> dict:
    if (
        type(value) is not dict
        or any(type(key) is not str for key in value)
        or set(value) != set(fields)
    ):
        raise FormalAbLocalLauncherError(f"{label} fields are not exact")
    return value


def _canonical_json(value: Any) -> str:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
            sort_keys=True,
        )
    except (TypeError, ValueError) as error:
        raise FormalAbLocalLauncherError("value is not canonical JSON") from error


def _sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _sha256_text(text: str) -> str:
    return _sha256_bytes(text.encode("utf-8"))


def _semantic_id(domain: str, payload: Mapping) -> str:
    return f"sha256:{_sha256_text(domain + chr(0) + _canonical_json(payload))}"


def _safe_relative_parts(path_value: Any, label: str) -> tuple[str, ...]:
    if (
        type(path_value) is not str
        or path_value == ""
        or path_value.strip() != path_value
        or "\0" in path_value
        or "\\" in path_value
    ):
        raise FormalAbLocalLauncherError(f"{label}.path is invalid")
    path = Path(path_value)
    parts = path.parts
    if path.is_absolute() or not parts or any(part in ("", ".", "..") for part in parts):
        raise FormalAbLocalLauncherError(f"{label}.path must be a safe relative path")
    return tuple(parts)


def _validate_identity(value: Any, label: str, *, schema: bool = False) -> dict:
    fields = _SCHEMA_IDENTITY_FIELDS if schema else _IDENTITY_FIELDS
    identity = _exact_dict(value, fields, label)
    _safe_relative_parts(identity["path"], label)
    byte_count = identity["bytes"]
    if type(byte_count) is not int or byte_count <= 0:
        raise FormalAbLocalLauncherError(f"{label}.bytes is invalid")
    _require_exact_sha256(identity["sha256"], f"{label}.sha256")
    if schema and (
        type(identity["schema"]) is not str
        or identity["schema"] == ""
        or identity["schema"].strip() != identity["schema"]
    ):
        raise FormalAbLocalLauncherError(f"{label}.schema is invalid")
    return identity


def _open_repo_relative_regular(
    repo_root: Path,
    relative_path: str,
    label: str,
    *,
    require_read_only: bool = False,
) -> int:
    """Open one repository file without following any relative path component."""

    parts = _safe_relative_parts(relative_path, label)
    if (
        not hasattr(os, "O_NOFOLLOW")
        or not hasattr(os, "O_DIRECTORY")
        or os.open not in os.supports_dir_fd
    ):
        raise FormalAbLocalLauncherError(
            f"{label} requires no-follow directory-descriptor support"
        )
    root = repo_root.resolve(strict=True)
    directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    directories: list[int] = []
    descriptor: int | None = None
    try:
        root_descriptor = os.open(root, directory_flags)
        directories.append(root_descriptor)
        root_metadata = os.fstat(root_descriptor)
        if (
            not stat.S_ISDIR(root_metadata.st_mode)
            or root_metadata.st_uid != os.geteuid()
        ):
            raise FormalAbLocalLauncherError(
                f"{label} repository root is not a current-user-owned directory"
            )
        current = root_descriptor
        for component in parts[:-1]:
            current = os.open(
                component,
                directory_flags,
                dir_fd=current,
            )
            directories.append(current)
            metadata = os.fstat(current)
            if (
                not stat.S_ISDIR(metadata.st_mode)
                or metadata.st_uid != os.geteuid()
            ):
                raise FormalAbLocalLauncherError(
                    f"{label} path component is not a current-user-owned directory"
                )
        descriptor = os.open(
            parts[-1],
            os.O_RDONLY | os.O_NOFOLLOW,
            dir_fd=current,
        )
        metadata = os.fstat(descriptor)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or metadata.st_nlink != 1
        ):
            raise FormalAbLocalLauncherError(
                f"{label} must be one current-user-owned regular inode"
            )
        if require_read_only and stat.S_IMODE(metadata.st_mode) & 0o222:
            raise FormalAbLocalLauncherError(
                f"{label} must be an immutable read-only regular inode"
            )
        return descriptor
    except OSError as error:
        if descriptor is not None:
            os.close(descriptor)
        raise FormalAbLocalLauncherError(f"{label} cannot be opened safely") from error
    except BaseException:
        if descriptor is not None:
            os.close(descriptor)
        raise
    finally:
        for directory in reversed(directories):
            os.close(directory)


def _read_repo_relative_regular(
    repo_root: Path,
    relative_path: str,
    label: str,
    *,
    maximum_bytes: int | None = None,
    require_read_only: bool = False,
) -> bytes:
    descriptor = _open_repo_relative_regular(
        repo_root,
        relative_path,
        label,
        require_read_only=require_read_only,
    )
    try:
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            if maximum_bytes is None:
                return stream.read()
            return stream.read(maximum_bytes + 1)
    finally:
        os.close(descriptor)


def _read_exact_artifact(
    repo_root: Path,
    identity_value: Any,
    label: str,
    *,
    schema: bool = False,
    require_read_only: bool = False,
) -> tuple[bytes, dict]:
    identity = _validate_identity(identity_value, label, schema=schema)
    raw = _read_repo_relative_regular(
        repo_root,
        identity["path"],
        label,
        maximum_bytes=identity["bytes"],
        require_read_only=require_read_only,
    )
    if len(raw) != identity["bytes"]:
        raise FormalAbLocalLauncherError(f"{label} byte length differs")
    if _sha256_bytes(raw) != identity["sha256"]:
        raise FormalAbLocalLauncherError(f"{label} SHA-256 differs")

    if schema:
        try:
            payload = _strict_json_loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as error:
            raise FormalAbLocalLauncherError(f"{label} JSON is invalid") from error
        if (
            type(payload) is not dict
            or type(payload.get("schema")) is not str
            or payload["schema"] != identity["schema"]
        ):
            raise FormalAbLocalLauncherError(f"{label} schema differs")
    return raw, identity


def _parse_identity_json(
    repo_root: Path,
    identity_value: Any,
    label: str,
    *,
    require_read_only: bool = False,
) -> tuple[dict, dict, bytes]:
    raw, identity = _read_exact_artifact(
        repo_root,
        identity_value,
        label,
        schema=True,
        require_read_only=require_read_only,
    )
    payload = _strict_json_loads(raw.decode("utf-8"))
    return payload, identity, raw


def _validate_closed_protocol_chain_no_follow(repo_root: Path) -> None:
    """Validate the complete closed preregistration through no-follow opens."""

    registry, _, _ = _parse_identity_json(
        repo_root,
        _SOURCE_REGISTRY_IDENTITY,
        "formal A/B v2 source registry",
    )
    validate_closed_formal_ab_v2_registry_data(registry)
    amendment, _, _ = _parse_identity_json(
        repo_root,
        _AMENDMENT_IDENTITY,
        "formal A/B v2 amendment",
    )
    validate_formal_ab_v2_amendment_data(amendment)
    _read_exact_artifact(
        repo_root,
        _PLAN_IDENTITY,
        "fresh sibling plan",
        schema=True,
    )
    original_registry, _, _ = _parse_identity_json(
        repo_root,
        _ORIGINAL_V1_REGISTRY_IDENTITY,
        "formal A/B v1 registry",
    )
    validate_closed_formal_ab_registry_data(original_registry)


def _expected_opening_id(opening: Mapping) -> str:
    return _semantic_id("shogi-formal-ab-v2-opening-v1", opening)


def _expected_game_id(
    opening_id: str, pair_index: int, game_index: int, candidate_color: str
) -> str:
    return _semantic_id(
        "shogi-formal-ab-v2-game-v1",
        {
            "candidate_color": candidate_color,
            "game_index": game_index,
            "opening_id": opening_id,
            "pair_index": pair_index,
        },
    )


def _validate_openings_manifest(payload: Any) -> list[dict]:
    manifest = _exact_dict(
        payload, _OPENINGS_MANIFEST_FIELDS, "local openings manifest"
    )
    if manifest["schema"] != LOCAL_OPENINGS_MANIFEST_SCHEMA:
        raise FormalAbLocalLauncherError("local openings manifest schema differs")
    pairs = manifest["pairs"]
    if type(pairs) is not list or len(pairs) != PAIR_COUNT:
        raise FormalAbLocalLauncherError(
            "local openings manifest requires exactly 384 ordered pairs"
        )

    opening_ids: set[str] = set()
    game_ids: set[str] = set()
    seeds: set[int] = set()
    captured_pairs: list[dict] = []
    for pair_index, raw_pair in enumerate(pairs):
        pair = _exact_dict(
            raw_pair, _OPENING_PAIR_FIELDS, f"opening pair {pair_index}"
        )
        if type(pair["pair_index"]) is not int or pair["pair_index"] != pair_index:
            raise FormalAbLocalLauncherError(
                "opening pair indices must be contiguous and ordered"
            )
        opening = _exact_dict(
            pair["opening"], _OPENING_FIELDS, f"opening pair {pair_index}.opening"
        )
        try:
            sfen = _normalized_sfen(
                opening["sfen"], f"opening pair {pair_index}.sfen"
            )
        except ValueError as error:
            raise FormalAbLocalLauncherError(
                f"opening pair {pair_index} is not canonical SFEN"
            ) from error
        moves = opening["usi_moves"]
        if (
            type(moves) is not list
            or any(
                type(move) is not str
                or move == ""
                or move.strip() != move
                or "\0" in move
                or _USI_MOVE_RE.fullmatch(move) is None
                for move in moves
            )
        ):
            raise FormalAbLocalLauncherError(
                f"opening pair {pair_index} is not canonical SFEN/USI text"
            )
        opening_id = _require_exact_semantic_id(
            pair["opening_id"], f"opening pair {pair_index}.opening_id"
        )
        if opening_id != _expected_opening_id(opening):
            raise FormalAbLocalLauncherError(
                f"opening pair {pair_index} ID does not bind its opening"
            )
        if opening_id in opening_ids:
            raise FormalAbLocalLauncherError("opening IDs must be unique")
        opening_ids.add(opening_id)
        seed = pair["seed"]
        if (
            type(seed) is not int
            or seed < 1
            or seed > (1 << 63) - 1
            or seed in seeds
        ):
            raise FormalAbLocalLauncherError(
                "opening seeds must be unique positive signed 64-bit integers"
            )
        seeds.add(seed)
        games = pair["games"]
        if type(games) is not list or len(games) != 2:
            raise FormalAbLocalLauncherError(
                f"opening pair {pair_index} requires exactly two games"
            )
        captured_games = []
        for game_index, raw_game in enumerate(games):
            game = _exact_dict(
                raw_game,
                _GAME_PLAN_FIELDS,
                f"opening pair {pair_index}.games[{game_index}]",
            )
            expected_color = "sente" if game_index == 0 else "gote"
            if (
                type(game["game_index"]) is not int
                or game["game_index"] != game_index
                or game["candidate_color"] != expected_color
            ):
                raise FormalAbLocalLauncherError(
                    "each pair must order candidate sente then candidate gote"
                )
            game_id = _require_exact_semantic_id(
                game["game_id"],
                f"opening pair {pair_index}.games[{game_index}].game_id",
            )
            if game_id != _expected_game_id(
                opening_id, pair_index, game_index, expected_color
            ):
                raise FormalAbLocalLauncherError(
                    f"game {pair_index}/{game_index} ID does not bind its plan"
                )
            if game_id in game_ids:
                raise FormalAbLocalLauncherError("game IDs must be globally unique")
            game_ids.add(game_id)
            captured_games.append(dict(game))
        captured_pairs.append(
            {
                "pair_index": pair_index,
                "opening_id": opening_id,
                "opening": {
                    "sfen": sfen,
                    "usi_moves": list(moves),
                },
                "seed": seed,
                "games": captured_games,
            }
        )
    if len(game_ids) != GAME_COUNT:
        raise FormalAbLocalLauncherError("opening manifest must bind 768 games")
    return captured_pairs


def _validate_match_binding(
    repo_root: Path, payload: Any
) -> tuple[dict, dict[str, dict]]:
    binding = _exact_dict(payload, _MATCH_BINDING_FIELDS, "local match binding")
    if binding["schema"] != LOCAL_MATCH_BINDING_SCHEMA:
        raise FormalAbLocalLauncherError("local match binding schema differs")
    if (
        binding["engine_protocol"] != "USI"
        or binding["opening_protocol"] != "SFEN+USI"
        or binding["result_protocol"] != "candidate-perspective-win-draw-loss"
    ):
        raise FormalAbLocalLauncherError(
            "local match binding must use the existing USI/SFEN result protocol"
        )
    assets = _exact_dict(
        binding["assets"], _MATCH_ASSET_FIELDS, "local match binding.assets"
    )
    captured_assets: dict[str, dict] = {}
    engine_receipt: dict | None = None
    for name in sorted(_MATCH_ASSET_FIELDS):
        raw, identity = _read_exact_artifact(
            repo_root,
            assets[name],
            f"local match binding.assets.{name}",
            schema=name == "yaneuraou_engine_receipt",
        )
        captured_assets[name] = dict(identity)
        if name == "yaneuraou_engine_receipt":
            engine_receipt = _strict_json_loads(raw.decode("utf-8"))
    engine_receipt = _exact_dict(
        engine_receipt,
        _YANEURAOU_RECEIPT_FIELDS,
        "local YaneuraOu engine receipt",
    )
    if engine_receipt["schema"] != "shogi-teacher-engine-receipt-v1":
        raise FormalAbLocalLauncherError("YaneuraOu engine receipt schema differs")
    if (
        type(engine_receipt["binary_bytes"]) is not int
        or engine_receipt["binary_bytes"]
        != captured_assets["yaneuraou_engine"]["bytes"]
        or engine_receipt["binary_sha256"]
        != captured_assets["yaneuraou_engine"]["sha256"]
    ):
        raise FormalAbLocalLauncherError(
            "YaneuraOu engine receipt does not bind the enrolled binary"
        )
    if (
        captured_assets["candidate_weights"]["sha256"]
        == captured_assets["stable_weights"]["sha256"]
    ):
        raise FormalAbLocalLauncherError(
            "candidate and stable weight identities must differ"
        )
    options = binding["deterministic_options"]
    _require_exact_json(
        options,
        _CORE_FOR_TESTS_DETERMINISTIC_OPTIONS,
        "CoreForTests deterministic options",
    )
    safety = _exact_dict(
        binding["safety"], _SAFETY_FIELDS, "local match binding.safety"
    )
    expected_safety = {
        "local_only": True,
        "network": False,
        "aws": False,
        "external_calibration": False,
        "live_weight_write": False,
        "automatic_run": False,
    }
    _require_exact_json(safety, expected_safety, "local match binding.safety")
    return dict(binding), captured_assets


def _validate_attempt_artifacts(
    *,
    registry: Mapping,
    attempt_ledger: Any,
    attempt_ledger_identity: Mapping,
    rerun_authorization: Any,
    openings_manifest_identity: Mapping,
    match_binding_identity: Mapping,
    assets: Mapping[str, Mapping],
) -> None:
    """Bind the pre-run attempt state to this exact enrolled experiment."""

    ledger = _exact_dict(
        attempt_ledger,
        _ATTEMPT_LEDGER_FIELDS,
        "local attempt ledger",
    )
    expected_ledger_binding = {
        "schema": LOCAL_ATTEMPT_LEDGER_SCHEMA,
        "experiment_id": registry["experiment_id"],
        "candidate_weights_sha256": assets["candidate_weights"]["sha256"],
        "stable_weights_sha256": assets["stable_weights"]["sha256"],
        "openings_manifest_sha256": openings_manifest_identity["sha256"],
        "match_binding_sha256": match_binding_identity["sha256"],
    }
    for key, expected_value in expected_ledger_binding.items():
        if (
            type(ledger[key]) is not type(expected_value)
            or ledger[key] != expected_value
        ):
            raise FormalAbLocalLauncherError(
                f"local attempt ledger {key} differs from enrolled experiment"
            )

    attempt_index = registry["attempt_index"]
    attempts = ledger["attempts"]
    if type(attempts) is not list or len(attempts) != attempt_index:
        raise FormalAbLocalLauncherError(
            "local attempt ledger must contain exactly the prior attempts"
        )
    if attempt_index == 0:
        if rerun_authorization is not None:
            raise FormalAbLocalLauncherError(
                "first attempt cannot carry rerun authorization"
            )
        return

    prior = _exact_dict(
        attempts[0],
        _ATTEMPT_RECORD_FIELDS,
        "local attempt ledger.attempts[0]",
    )
    prior_run_id = _require_exact_semantic_id(
        prior["run_id"],
        "local attempt ledger.attempts[0].run_id",
    )
    if prior_run_id in (registry["experiment_id"], registry["run_id"]):
        raise FormalAbLocalLauncherError(
            "prior attempt run identity must differ from experiment and rerun"
        )
    evidence_sha256 = _require_exact_sha256(
        prior["technical_fault_evidence_sha256"],
        "local attempt ledger.attempts[0].technical_fault_evidence_sha256",
    )
    expected_prior = {
        "attempt_index": 0,
        "run_id": prior_run_id,
        "disposition": "technical-fault",
        "technical_fault_evidence_sha256": evidence_sha256,
        "result_unblinded": False,
    }
    _require_exact_json(
        prior,
        expected_prior,
        "local attempt ledger.attempts[0]",
    )

    authorization = _exact_dict(
        rerun_authorization,
        _RERUN_AUTHORIZATION_FIELDS,
        "local rerun authorization",
    )
    expected_authorization = {
        "schema": LOCAL_RERUN_AUTHORIZATION_SCHEMA,
        "experiment_id": registry["experiment_id"],
        "authorized_attempt_index": 1,
        "authorized_run_id": registry["run_id"],
        "prior_attempt_index": 0,
        "prior_run_id": prior_run_id,
        "attempt_ledger_sha256": attempt_ledger_identity["sha256"],
        "technical_fault_evidence_sha256": evidence_sha256,
        "authorization_basis": "technical-fault-before-result-unblinding",
        "prior_result_unblinded": False,
    }
    _require_exact_json(
        authorization,
        expected_authorization,
        "local rerun authorization",
    )


def _validate_ready_local_run_registry_core_for_tests(
    repo_root: str | Path,
    registry_path: str | Path,
    *,
    expected_registry_identity: Mapping | None = None,
) -> dict:
    """Test-only reader for a synthetic ready registry and its local artifacts."""

    supplied_root = Path(repo_root).absolute()
    root = supplied_root.resolve(strict=True)
    registry_file = Path(registry_path)
    if registry_file.is_absolute():
        try:
            registry_file = registry_file.relative_to(supplied_root)
        except ValueError as error:
            try:
                registry_file = registry_file.relative_to(root)
            except ValueError:
                raise FormalAbLocalLauncherError(
                    "CoreForTests registry must be repository relative"
                ) from error
    registry_relative = registry_file.as_posix()
    _safe_relative_parts(registry_relative, "CoreForTests local run registry")
    expected_identity = (
        None
        if expected_registry_identity is None
        else _validate_identity(
            expected_registry_identity,
            "pinned local run registry",
            schema=True,
        )
    )
    if (
        expected_identity is not None
        and expected_identity["path"] != registry_relative
    ):
        raise FormalAbLocalLauncherError("pinned local run registry path differs")
    raw = _read_repo_relative_regular(
        root,
        registry_relative,
        "CoreForTests local run registry",
        maximum_bytes=(
            expected_identity["bytes"]
            if expected_identity is not None
            else 8 * 1024 * 1024
        ),
        # Git records only regular/executable modes and normally checks a
        # tracked data file out as 0644.  Exact code-pinned path/bytes/hash/
        # schema, no-follow opening, ownership, and single-link checks provide
        # the production identity boundary without an impossible Git mode.
        require_read_only=False,
    )
    if expected_identity is not None:
        if len(raw) != expected_identity["bytes"]:
            raise FormalAbLocalLauncherError(
                "pinned local run registry byte length differs"
            )
        if _sha256_bytes(raw) != expected_identity["sha256"]:
            raise FormalAbLocalLauncherError(
                "pinned local run registry SHA-256 differs"
            )
    registry_sha256 = _sha256_bytes(raw)
    try:
        registry = _strict_json_loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as error:
        raise FormalAbLocalLauncherError("local run registry JSON is invalid") from error
    registry = _exact_dict(registry, _RUN_REGISTRY_FIELDS, "local run registry")
    if registry["schema"] != LOCAL_RUN_REGISTRY_SCHEMA:
        raise FormalAbLocalLauncherError("local run registry schema differs")
    if (
        expected_identity is not None
        and registry["schema"] != expected_identity["schema"]
    ):
        raise FormalAbLocalLauncherError("pinned local run registry schema differs")
    if registry["status"] != "ready-local-only":
        raise FormalAbLocalLauncherBlocked(
            "local formal A/B candidate identities are not enrolled"
        )
    _require_exact_json(
        registry["source_registry"],
        _SOURCE_REGISTRY_IDENTITY,
        "local run registry.source_registry",
    )
    _require_exact_json(
        registry["plan"], _PLAN_IDENTITY, "local run registry.plan"
    )
    _validate_closed_protocol_chain_no_follow(root)
    if registry["protocol_amendment_sha256"] != FORMAL_AB_V2_AMENDMENT_SHA256:
        raise FormalAbLocalLauncherError("protocol amendment identity differs")

    experiment_id = _require_exact_semantic_id(
        registry["experiment_id"], "local run registry.experiment_id"
    )
    run_id = _require_exact_semantic_id(
        registry["run_id"], "local run registry.run_id"
    )
    if experiment_id == run_id:
        raise FormalAbLocalLauncherError("experiment and run identities must differ")
    attempt_index = registry["attempt_index"]
    if type(attempt_index) is not int or attempt_index not in (0, 1):
        raise FormalAbLocalLauncherError("attempt_index must be integer 0 or 1")
    attempt_ledger, attempt_ledger_identity, _ = _parse_identity_json(
        root,
        registry["attempt_ledger"],
        "local attempt ledger",
        require_read_only=True,
    )
    if attempt_ledger_identity["schema"] != LOCAL_ATTEMPT_LEDGER_SCHEMA:
        raise FormalAbLocalLauncherError("local attempt ledger schema differs")
    rerun = registry["rerun_authorization"]
    rerun_authorization: dict | None = None
    rerun_identity: dict | None = None
    if attempt_index == 0:
        if rerun is not None:
            raise FormalAbLocalLauncherError(
                "first attempt cannot carry rerun authorization"
            )
    else:
        rerun_authorization, rerun_identity, _ = _parse_identity_json(
            root,
            rerun,
            "local rerun authorization",
            require_read_only=True,
        )
        if rerun_identity["schema"] != LOCAL_RERUN_AUTHORIZATION_SCHEMA:
            raise FormalAbLocalLauncherError(
                "local rerun authorization schema differs"
            )
    workers = registry["pair_workers"]
    if type(workers) is not int or workers not in PAIR_WORKER_CANDIDATES:
        raise FormalAbLocalLauncherError("pair_workers must be exactly 2, 4, 8, or 12")
    if registry["execution_boundary"] != (
        "argumentless-local-only-reviewed-enrollment-no-network-aws-external-or-live"
    ):
        raise FormalAbLocalLauncherError("execution boundary differs")

    openings, openings_identity, _ = _parse_identity_json(
        root, registry["openings_manifest"], "local openings manifest"
    )
    match_binding, match_identity, _ = _parse_identity_json(
        root, registry["match_binding"], "local match binding"
    )
    captured_pairs = _validate_openings_manifest(openings)
    captured_binding, captured_assets = _validate_match_binding(root, match_binding)
    _validate_attempt_artifacts(
        registry=registry,
        attempt_ledger=attempt_ledger,
        attempt_ledger_identity=attempt_ledger_identity,
        rerun_authorization=rerun_authorization,
        openings_manifest_identity=openings_identity,
        match_binding_identity=match_identity,
        assets=captured_assets,
    )
    return {
        "registry_sha256": registry_sha256,
        "registry": dict(registry),
        "pairs": captured_pairs,
        "attempt_ledger_identity": dict(attempt_ledger_identity),
        "rerun_authorization_identity": (
            None if rerun_identity is None else dict(rerun_identity)
        ),
        "openings_manifest_identity": dict(openings_identity),
        "match_binding_identity": dict(match_identity),
        "match_binding": captured_binding,
        "assets": captured_assets,
    }


def validate_ready_local_run_registry_core_for_tests(
    repo_root: str | Path, registry_path: str | Path
) -> dict:
    """Explicit CoreForTests boundary; never a production activation API."""

    return _validate_ready_local_run_registry_core_for_tests(
        repo_root,
        registry_path,
    )


def validate_pinned_ready_local_run_registry(repo_root: str | Path) -> dict:
    """Validate the one future code-pinned registry; currently always STOP."""

    if _PINNED_READY_RUN_REGISTRY_IDENTITY is None:
        raise FormalAbLocalLauncherBlocked(
            "no code-pinned checked-in ready registry is enrolled"
        )
    return _validate_ready_local_run_registry_core_for_tests(
        repo_root,
        _PINNED_READY_RUN_REGISTRY_IDENTITY["path"],
        expected_registry_identity=_PINNED_READY_RUN_REGISTRY_IDENTITY,
    )


def _pair_file_name(pair_index: int) -> str:
    return f"{PAIR_FILE_PREFIX}{pair_index:03d}{PAIR_FILE_SUFFIX}"


def _safe_receipt_directory(path_value: str | Path, *, create: bool) -> Path:
    receipt_dir = Path(path_value)
    if create and not receipt_dir.exists():
        receipt_dir.mkdir(mode=0o700)
    try:
        metadata = receipt_dir.lstat()
    except OSError as error:
        raise FormalAbLocalLauncherError(
            "receipt directory cannot be inspected"
        ) from error
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or metadata.st_uid != os.geteuid()
        or metadata.st_nlink < 2
        or stat.S_IMODE(metadata.st_mode) != 0o700
    ):
        raise FormalAbLocalLauncherError(
            "receipt directory must be one current-user-owned 0700 directory"
        )
    return receipt_dir


def _common_event(
    captured: Mapping, pair: Mapping, event: str, previous_sha256: str | None
) -> dict:
    return {
        "schema": LOCAL_PAIR_EVENT_SCHEMA,
        "event": event,
        "registry_sha256": captured["registry_sha256"],
        "plan_sha256": FRESH_SIBLING_PLAN_SHA256,
        "protocol_amendment_sha256": FORMAL_AB_V2_AMENDMENT_SHA256,
        "openings_manifest_sha256": captured["openings_manifest_identity"]["sha256"],
        "match_binding_sha256": captured["match_binding_identity"]["sha256"],
        "candidate_weights_sha256": captured["assets"]["candidate_weights"]["sha256"],
        "stable_weights_sha256": captured["assets"]["stable_weights"]["sha256"],
        "pair_index": pair["pair_index"],
        "opening_id": pair["opening_id"],
        "seed": pair["seed"],
        "previous_event_sha256": previous_sha256,
    }


def _event_bytes(event: Mapping) -> bytes:
    return f"{_canonical_json(event)}\n".encode("utf-8")


def _write_all(descriptor: int, raw: bytes, label: str) -> None:
    remaining = memoryview(raw)
    while remaining:
        try:
            written = os.write(descriptor, remaining)
        except OSError as error:
            raise FormalAbLocalLauncherError(f"{label} write failed") from error
        if type(written) is not int or written <= 0 or written > len(remaining):
            raise FormalAbLocalLauncherError(f"{label} write was incomplete")
        remaining = remaining[written:]


def _validate_pair_journal_descriptor(descriptor: int) -> None:
    metadata = os.fstat(descriptor)
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != os.geteuid()
        or metadata.st_nlink != 1
        or stat.S_IMODE(metadata.st_mode) != 0o600
    ):
        raise FormalAbLocalLauncherError(
            "pair journal must be one current-user-owned 0600 regular inode"
        )


def _create_pair_journal(path_value: Path, start_event: Mapping) -> str:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path_value, flags, 0o600)
    try:
        _validate_pair_journal_descriptor(descriptor)
        raw = _event_bytes(start_event)
        _write_all(descriptor, raw, "pair journal")
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return _sha256_bytes(raw)


def _append_pair_event(path_value: Path, event: Mapping) -> str:
    flags = os.O_WRONLY | os.O_APPEND
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path_value, flags)
    try:
        _validate_pair_journal_descriptor(descriptor)
        raw = _event_bytes(event)
        _write_all(descriptor, raw, "pair journal")
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return _sha256_bytes(raw)


def _validate_game_receipt(
    value: Any,
    captured: Mapping,
    pair: Mapping,
    game: Mapping,
) -> dict:
    receipt = _exact_dict(value, _GAME_RECEIPT_FIELDS, "local game receipt")
    expected = {
        "schema": LOCAL_GAME_RECEIPT_SCHEMA,
        "pair_index": pair["pair_index"],
        "opening_id": pair["opening_id"],
        "game_index": game["game_index"],
        "game_id": game["game_id"],
        "candidate_color": game["candidate_color"],
        "seed": pair["seed"],
        "candidate_weights_sha256": captured["assets"]["candidate_weights"]["sha256"],
        "stable_weights_sha256": captured["assets"]["stable_weights"]["sha256"],
        "match_binding_sha256": captured["match_binding_identity"]["sha256"],
        "technical_fault": False,
    }
    for key, expected_value in expected.items():
        if type(receipt[key]) is not type(expected_value) or receipt[key] != expected_value:
            raise FormalAbLocalTechnicalFault(
                f"local game receipt {key} differs from enrolled request"
            )
    if type(receipt["result"]) is not str or receipt["result"] not in (
        "win",
        "draw",
        "loss",
    ):
        raise FormalAbLocalTechnicalFault("local game receipt result is invalid")
    return dict(receipt)


def _game_request(captured: Mapping, pair: Mapping, game: Mapping) -> dict:
    return {
        "schema": LOCAL_GAME_REQUEST_SCHEMA,
        "pair_index": pair["pair_index"],
        "opening_id": pair["opening_id"],
        "opening": copy.deepcopy(pair["opening"]),
        "game_index": game["game_index"],
        "game_id": game["game_id"],
        "candidate_color": game["candidate_color"],
        "seed": pair["seed"],
        "candidate_weights": copy.deepcopy(
            captured["assets"]["candidate_weights"]
        ),
        "stable_weights": copy.deepcopy(captured["assets"]["stable_weights"]),
        "yaneuraou_engine": copy.deepcopy(captured["assets"]["yaneuraou_engine"]),
        "yaneuraou_engine_receipt": copy.deepcopy(
            captured["assets"]["yaneuraou_engine_receipt"]
        ),
        "yaneuraou_eval": copy.deepcopy(captured["assets"]["yaneuraou_eval"]),
        "local_match_adapter": copy.deepcopy(
            captured["assets"]["local_match_adapter"]
        ),
        "match_binding_sha256": captured["match_binding_identity"]["sha256"],
        "deterministic_options": copy.deepcopy(
            captured["match_binding"]["deterministic_options"]
        ),
        "network": False,
        "aws": False,
        "external_calibration": False,
        "live_weight_write": False,
    }


def _parse_pair_journal(
    path_value: Path, captured: Mapping, expected_pair: Mapping
) -> dict:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(path_value, flags)
    except OSError as error:
        raise FormalAbLocalLauncherError(
            "pair journal must be one current-user-owned 0600 regular inode"
        ) from error
    try:
        _validate_pair_journal_descriptor(descriptor)
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            raw = stream.read()
    finally:
        os.close(descriptor)
    if not raw.endswith(b"\n") or raw.startswith(b"\n"):
        raise FormalAbLocalLauncherError("pair journal is not canonical JSONL")
    raw_lines = raw.splitlines(keepends=True)
    events: list[dict] = []
    previous_sha256: str | None = None
    for line_index, raw_line in enumerate(raw_lines):
        try:
            event = _strict_json_loads(raw_line[:-1].decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as error:
            raise FormalAbLocalLauncherError("pair journal JSON is invalid") from error
        if _event_bytes(event) != raw_line:
            raise FormalAbLocalLauncherError("pair journal is not canonical JSONL")
        common = _common_event(
            captured, expected_pair, event.get("event"), previous_sha256
        )
        for key, expected_value in common.items():
            if event.get(key) != expected_value or type(event.get(key)) is not type(
                expected_value
            ):
                raise FormalAbLocalLauncherError(
                    f"pair journal event {line_index} binding differs"
                )
        events.append(event)
        previous_sha256 = _sha256_bytes(raw_line)

    if not events or events[0]["event"] != "pair-started":
        raise FormalAbLocalLauncherError("pair journal must start with pair-started")
    start_fields = frozenset(_common_event(captured, expected_pair, "", None))
    if set(events[0]) != start_fields:
        raise FormalAbLocalLauncherError("pair-started event fields are not exact")
    if any(event["event"] == "technical-fault" for event in events):
        raise FormalAbLocalTechnicalFault(
            "pair journal records a terminal technical fault"
        )
    if len(events) != 4:
        raise FormalAbLocalLauncherError(
            "partial pair journal cannot be resumed or replayed"
        )
    if [event["event"] for event in events] != [
        "pair-started",
        "game-completed",
        "game-completed",
        "pair-completed",
    ]:
        raise FormalAbLocalLauncherError(
            "pair journal game events are duplicate, missing, or out of order"
        )
    game_results = []
    for game_index in (0, 1):
        event = events[game_index + 1]
        expected_game = expected_pair["games"][game_index]
        event_fields = start_fields | frozenset(
            {"game_index", "game_id", "candidate_color", "result"}
        )
        if set(event) != event_fields:
            raise FormalAbLocalLauncherError(
                "game-completed event fields are not exact"
            )
        for key in ("game_index", "game_id", "candidate_color"):
            if (
                event[key] != expected_game[key]
                or type(event[key]) is not type(expected_game[key])
            ):
                raise FormalAbLocalLauncherError(
                    "pair journal game is duplicate, missing, or out of order"
                )
        if type(event["result"]) is not str or event["result"] not in (
            "win",
            "draw",
            "loss",
        ):
            raise FormalAbLocalLauncherError("pair journal result is invalid")
        game_results.append(
            {
                "game_index": expected_game["game_index"],
                "game_id": expected_game["game_id"],
                "candidate_color": expected_game["candidate_color"],
                "result": event["result"],
            }
        )
    completion = events[3]
    completion_fields = start_fields | frozenset({"games_sha256"})
    if set(completion) != completion_fields:
        raise FormalAbLocalLauncherError("pair-completed event fields are not exact")
    expected_games_sha256 = _sha256_text(_canonical_json(game_results))
    if completion["games_sha256"] != expected_games_sha256:
        raise FormalAbLocalLauncherError("pair-completed games digest differs")
    return {
        "pair_index": expected_pair["pair_index"],
        "opening_id": expected_pair["opening_id"],
        "games": game_results,
    }


def _load_completed_prefix(receipt_dir: Path, captured: Mapping) -> list[dict]:
    allowed_names = {
        _pair_file_name(index): index for index in range(PAIR_COUNT)
    }
    observed: dict[int, Path] = {}
    for entry in receipt_dir.iterdir():
        if entry.name not in allowed_names:
            raise FormalAbLocalLauncherError(
                "receipt directory contains an unknown entry"
            )
        observed[allowed_names[entry.name]] = entry
    if observed and set(observed) != set(range(max(observed) + 1)):
        raise FormalAbLocalLauncherError(
            "pair journals must form a contiguous ordered prefix"
        )
    completed = []
    for pair_index in range(len(observed)):
        completed.append(
            _parse_pair_journal(
                observed[pair_index], captured, captured["pairs"][pair_index]
            )
        )
    return completed


def _technical_fault_event(
    captured: Mapping,
    pair: Mapping,
    game: Mapping,
    previous_sha256: str,
) -> dict:
    return {
        **_common_event(
            captured, pair, "technical-fault", previous_sha256
        ),
        "game_index": game["game_index"],
        "game_id": game["game_id"],
        "candidate_color": game["candidate_color"],
        "failure_kind": "local-match-adapter-technical-fault",
    }


def _run_one_pair(
    captured: Mapping,
    receipt_dir: Path,
    pair: Mapping,
    start_sha256: str,
    execute_game: Callable[[Mapping], Mapping],
) -> dict:
    journal_path = receipt_dir / _pair_file_name(pair["pair_index"])
    previous_sha256 = start_sha256
    games = []
    for game in pair["games"]:
        try:
            receipt = _validate_game_receipt(
                execute_game(_game_request(captured, pair, game)),
                captured,
                pair,
                game,
            )
        except Exception as error:
            fault_event = _technical_fault_event(
                captured, pair, game, previous_sha256
            )
            _append_pair_event(journal_path, fault_event)
            if isinstance(error, FormalAbLocalTechnicalFault):
                raise
            raise FormalAbLocalTechnicalFault(
                "local match adapter raised a technical fault"
            ) from error
        game_result = {
            "game_index": game["game_index"],
            "game_id": game["game_id"],
            "candidate_color": game["candidate_color"],
            "result": receipt["result"],
        }
        game_event = {
            **_common_event(
                captured, pair, "game-completed", previous_sha256
            ),
            **game_result,
        }
        previous_sha256 = _append_pair_event(journal_path, game_event)
        games.append(game_result)
    completion_event = {
        **_common_event(
            captured, pair, "pair-completed", previous_sha256
        ),
        "games_sha256": _sha256_text(_canonical_json(games)),
    }
    _append_pair_event(journal_path, completion_event)
    return {
        "pair_index": pair["pair_index"],
        "opening_id": pair["opening_id"],
        "games": games,
    }


def run_ready_local_formal_ab_v2_core_for_tests(
    repo_root: str | Path,
    registry_path: str | Path,
    receipt_directory: str | Path,
    execute_game: Callable[[Mapping], Mapping],
) -> dict:
    """CoreForTests: run exact pairs only through an injected stub adapter."""

    captured = validate_ready_local_run_registry_core_for_tests(
        repo_root, registry_path
    )
    if not callable(execute_game):
        raise FormalAbLocalLauncherError("local match adapter is not callable")
    receipt_dir = _safe_receipt_directory(receipt_directory, create=True)
    completed = _load_completed_prefix(receipt_dir, captured)

    next_pair = len(completed)
    workers = captured["registry"]["pair_workers"]
    while next_pair < PAIR_COUNT:
        batch = captured["pairs"][next_pair : next_pair + workers]
        starts: list[tuple[dict, str]] = []
        for pair in batch:
            start_event = _common_event(
                captured, pair, "pair-started", None
            )
            start_sha256 = _create_pair_journal(
                receipt_dir / _pair_file_name(pair["pair_index"]),
                start_event,
            )
            starts.append((pair, start_sha256))

        batch_results: dict[int, dict] = {}
        first_error: Exception | None = None
        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(
                    _run_one_pair,
                    captured,
                    receipt_dir,
                    pair,
                    start_sha256,
                    execute_game,
                ): pair["pair_index"]
                for pair, start_sha256 in starts
            }
            for future in as_completed(futures):
                pair_index = futures[future]
                try:
                    batch_results[pair_index] = future.result()
                except Exception as error:
                    if first_error is None:
                        first_error = error
        if first_error is not None:
            if isinstance(first_error, FormalAbLocalLauncherError):
                raise first_error
            raise FormalAbLocalTechnicalFault(
                "local formal A/B pair batch failed"
            ) from first_error
        for pair, _ in starts:
            completed.append(batch_results[pair["pair_index"]])
        next_pair += len(batch)

    journal_results = _load_completed_prefix(receipt_dir, captured)
    _require_exact_json(
        journal_results,
        completed,
        "completed pair journals",
    )
    result = {
        "schema": FORMAL_AB_V2_RESULT_SCHEMA,
        "plan": _PLAN_IDENTITY,
        "protocol_amendment_sha256": FORMAL_AB_V2_AMENDMENT_SHA256,
        "experiment_id": captured["registry"]["experiment_id"],
        "run_id": captured["registry"]["run_id"],
        "attempt_index": captured["registry"]["attempt_index"],
        "attempt_ledger_sha256": captured["attempt_ledger_identity"]["sha256"],
        "rerun_authorization_sha256": (
            None
            if captured["rerun_authorization_identity"] is None
            else captured["rerun_authorization_identity"]["sha256"]
        ),
        "candidate_weights_sha256": captured["assets"]["candidate_weights"][
            "sha256"
        ],
        "stable_weights_sha256": captured["assets"]["stable_weights"]["sha256"],
        "match_binding_sha256": captured["match_binding_identity"]["sha256"],
        "run_status": "complete",
        "technical_fault_count": 0,
        "pairs": journal_results,
    }
    recaptured = validate_ready_local_run_registry_core_for_tests(
        repo_root, registry_path
    )
    for key in (
        "registry_sha256",
        "attempt_ledger_identity",
        "rerun_authorization_identity",
        "openings_manifest_identity",
        "match_binding_identity",
        "assets",
    ):
        _require_exact_json(
            recaptured[key], captured[key], f"post-run local enrollment.{key}"
        )
    decode_pair_score_units(result)
    return result


def argumentless_closed_preflight(repo_root: str | Path) -> None:
    """Validate today's exact closed registry and stop without side effects."""

    root = Path(repo_root).resolve(strict=True)
    _validate_closed_protocol_chain_no_follow(root)
    validate_pinned_ready_local_run_registry(root)
    raise FormalAbLocalLauncherBlocked(
        "local formal A/B candidate identities are not enrolled; zero games started"
    )


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        print(
            _canonical_json(
                {
                    "schema": LOCAL_CLI_RECEIPT_SCHEMA,
                    "status": "STOP",
                    "reason": "arguments-forbidden",
                    "pairs_started": 0,
                    "games_started": 0,
                }
            ),
            file=sys.stderr,
        )
        return 2
    try:
        argumentless_closed_preflight(Path(__file__).resolve().parents[1])
    except FormalAbLocalLauncherBlocked:
        print(
            _canonical_json(
                {
                    "schema": LOCAL_CLI_RECEIPT_SCHEMA,
                    "status": "STOP",
                    "reason": "candidate-identities-not-enrolled",
                    "pairs_started": 0,
                    "games_started": 0,
                }
            )
        )
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
