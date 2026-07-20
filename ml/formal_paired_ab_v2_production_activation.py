"""Fail-closed production-activation foundation for formal paired A/B v2.

The production entry accepts no arguments and the only checked-in activation
registry is exactly closed.  It can validate the preregistration chain and
report STOP, but it has no route to an engine, game process, network client, or
live-weight writer.

The deterministic composition function is explicitly CoreForTests.  It proves
that a future reviewed enrollment can bind every required identity and exactly
384 color-swapped pairs / 768 games without granting production authority or
executing a game.
"""

from __future__ import annotations

from collections.abc import Mapping
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
    ORIGINAL_V1_REGISTRY_BYTES,
    ORIGINAL_V1_REGISTRY_PATH,
    ORIGINAL_V1_REGISTRY_SCHEMA,
    ORIGINAL_V1_REGISTRY_SHA256,
    validate_closed_formal_ab_v2_registry_data,
    validate_formal_ab_v2_amendment_data,
)
from fresh_qat_parent_accounting_v2 import _normalized_sfen


ACTIVATION_REGISTRY_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-v2-production-activation-registry-v1"
)
ACTIVATION_REGISTRY_PATH = (
    "ml/protocols/"
    "floodgate-q1-2026-formal-paired-ab-v2-production-activation-registry.json"
)
ACTIVATION_REGISTRY_BYTES = 2_604
ACTIVATION_REGISTRY_SHA256 = (
    "90749b092a16b800ed909ba53235b5bf8eda0d330330ada5386790b33fad14f1"
)
ACTIVATION_CLI_RECEIPT_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-v2-production-activation-cli-receipt-v1"
)
ACTIVATION_COMPOSITION_INPUT_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-v2-test-composition-input-v1"
)
ACTIVATION_COMPOSITION_RECEIPT_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-v2-test-composition-receipt-v1"
)
OPENING_SCHEDULE_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-v2-opening-schedule-v1"
)
TIME_CONTROL_SCHEMA = "shogi-floodgate-formal-paired-ab-v2-time-control-v1"
WEIGHTS_SCHEMA = "shogi-int16-nnue-weights-bin-v1"
MATCH_ADAPTER_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-v2-local-match-adapter-v1"
)
RESULT_RECEIPT_SCHEMA = (
    "shogi-floodgate-strength-first-downstream-gates-result-v1"
)
RETENTION_RECEIPT_SCHEMA = (
    "shogi-floodgate-strength-first-retention-receipt-v1"
)
ROLLBACK_RECEIPT_SCHEMA = (
    "shogi-floodgate-formal-paired-ab-v2-rollback-readiness-receipt-v1"
)

PAIR_COUNT = 384
GAMES_PER_PAIR = 2
GAME_COUNT = 768
MAX_PAIR_WORKERS = 6
COLORS = ["sente", "gote"]

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_SEMANTIC_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_USI_MOVE_RE = re.compile(
    r"^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$"
)

_IDENTITY_FIELDS = frozenset({"path", "bytes", "sha256", "schema"})
_COMPOSITION_FIELDS = frozenset(
    {
        "schema",
        "experiment_id",
        "run_id",
        "candidate_weights",
        "stable_weights",
        "openings_manifest",
        "colors",
        "time_control",
        "pair_workers",
        "match_adapter",
        "receipts",
        "safety",
    }
)
_CONTENT_RECORD_FIELDS = frozenset({"identity", "payload"})
_OPENINGS_FIELDS = frozenset({"schema", "pairs"})
_PAIR_FIELDS = frozenset(
    {"pair_index", "opening_id", "opening", "games"}
)
_OPENING_FIELDS = frozenset({"sfen", "usi_moves"})
_GAME_FIELDS = frozenset(
    {"game_index", "game_id", "candidate_color"}
)
_TIME_CONTROL_FIELDS = frozenset(
    {
        "schema",
        "main_time_ms",
        "byoyomi_ms",
        "increment_ms",
        "maximum_moves",
        "adjudication",
    }
)
_RECEIPT_FIELDS = frozenset(
    {"result_receipt", "retention_receipt", "rollback_receipt"}
)
_SAFETY_FIELDS = frozenset(
    {
        "test_only",
        "production_authority",
        "execute_games",
        "engine_access",
        "network_access",
        "live_weight_write",
    }
)

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
_V1_REGISTRY_IDENTITY = {
    "path": ORIGINAL_V1_REGISTRY_PATH,
    "bytes": ORIGINAL_V1_REGISTRY_BYTES,
    "sha256": ORIGINAL_V1_REGISTRY_SHA256,
    "schema": ORIGINAL_V1_REGISTRY_SCHEMA,
}
_ACTIVATION_REGISTRY_IDENTITY = {
    "path": ACTIVATION_REGISTRY_PATH,
    "bytes": ACTIVATION_REGISTRY_BYTES,
    "sha256": ACTIVATION_REGISTRY_SHA256,
    "schema": ACTIVATION_REGISTRY_SCHEMA,
}

_EXPECTED_SAFETY = {
    "test_only": True,
    "production_authority": False,
    "execute_games": False,
    "engine_access": False,
    "network_access": False,
    "live_weight_write": False,
}

_EXPECTED_CLOSED_REGISTRY = {
    "schema": ACTIVATION_REGISTRY_SCHEMA,
    "status": "closed-awaiting-reviewed-enrollments",
    "reason": (
        "candidate-stable-openings-time-control-adapter-and-required-"
        "receipts-not-enrolled"
    ),
    "protocol": {
        "source_registry": _SOURCE_REGISTRY_IDENTITY,
        "amendment": _AMENDMENT_IDENTITY,
        "plan": _PLAN_IDENTITY,
        "pairs": PAIR_COUNT,
        "games_per_pair": GAMES_PER_PAIR,
        "games": GAME_COUNT,
        "colors": COLORS,
        "result_protocol": "candidate-perspective-win-draw-loss",
    },
    "enrollments": {
        "experiment_id": None,
        "run_id": None,
        "candidate_weights": None,
        "stable_weights": None,
        "openings_manifest": None,
        "time_control": None,
        "pair_workers": None,
        "match_adapter": None,
        "result_receipt": None,
        "retention_receipt": None,
        "rollback_receipt": None,
    },
    "gates": {
        "candidate_and_stable_distinct": False,
        "openings_verified": False,
        "colors_verified": False,
        "time_control_verified": False,
        "pair_workers_verified": False,
        "match_adapter_verified": False,
        "result_receipt_verified": False,
        "retention_receipt_verified": False,
        "rollback_receipt_verified": False,
        "exact_768_game_accounting_verified": False,
        "execution_authorized": False,
        "production_weight_write_authorized": False,
    },
    "boundary": {
        "argumentless_production_entry": True,
        "caller_selected_registry": False,
        "automatic_activation": False,
        "engine_access": False,
        "game_process_access": False,
        "network_access": False,
        "live_weight_access": False,
    },
    "nonclaims": {
        "candidate_selected": False,
        "formal_attempts_started": 0,
        "pairs_started": 0,
        "games_started": 0,
        "engine_processes_started": 0,
        "network_requests": 0,
        "live_weight_changes": 0,
        "strength_improved": False,
        "high_dan_calibrated": False,
    },
}


class FormalAbV2ActivationError(ValueError):
    """Base fail-closed activation-foundation error."""


class FormalAbV2ActivationBlocked(FormalAbV2ActivationError):
    """The exact production activation registry remains closed."""


def _strict_object(pairs):
    result = {}
    for key, value in pairs:
        if type(key) is not str or key in result:
            raise FormalAbV2ActivationError("JSON object keys are not unique strings")
        result[key] = value
    return result


def _reject_nonfinite(value):
    raise FormalAbV2ActivationError(f"non-finite JSON value: {value}")


def _strict_json_loads(raw: str):
    try:
        return json.loads(
            raw,
            object_pairs_hook=_strict_object,
            parse_constant=_reject_nonfinite,
        )
    except (TypeError, ValueError) as error:
        if isinstance(error, FormalAbV2ActivationError):
            raise
        raise FormalAbV2ActivationError("JSON is invalid") from error


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
        raise FormalAbV2ActivationError("value is not canonical JSON") from error


def _canonical_artifact_bytes(value: Mapping) -> bytes:
    return f"{_canonical_json(value)}\n".encode("utf-8")


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _exact_dict(value: Any, fields: frozenset[str], label: str) -> dict:
    if (
        type(value) is not dict
        or any(type(key) is not str for key in value)
        or set(value) != set(fields)
    ):
        raise FormalAbV2ActivationError(f"{label} fields are not exact")
    return value


def _require_exact_json(value: Any, expected: Any, label: str) -> None:
    if type(value) is not type(expected):
        raise FormalAbV2ActivationError(f"{label} type differs")
    if type(expected) is dict:
        if any(type(key) is not str for key in value) or set(value) != set(expected):
            raise FormalAbV2ActivationError(f"{label} fields differ")
        for key, expected_value in expected.items():
            _require_exact_json(value[key], expected_value, f"{label}.{key}")
        return
    if type(expected) is list:
        if len(value) != len(expected):
            raise FormalAbV2ActivationError(f"{label} length differs")
        for index, expected_value in enumerate(expected):
            _require_exact_json(
                value[index], expected_value, f"{label}[{index}]"
            )
        return
    if value != expected:
        raise FormalAbV2ActivationError(f"{label} differs")


def _safe_relative_path(value: Any, label: str) -> str:
    if (
        type(value) is not str
        or value == ""
        or value.strip() != value
        or "\0" in value
        or "\\" in value
    ):
        raise FormalAbV2ActivationError(f"{label}.path is invalid")
    path = Path(value)
    if (
        path.is_absolute()
        or not path.parts
        or any(part in ("", ".", "..") for part in path.parts)
    ):
        raise FormalAbV2ActivationError(
            f"{label}.path must be a safe relative path"
        )
    return value


def _require_sha256(value: Any, label: str) -> str:
    if type(value) is not str or _SHA256_RE.fullmatch(value) is None:
        raise FormalAbV2ActivationError(f"{label} is not a lowercase SHA-256")
    if value == "0" * 64:
        raise FormalAbV2ActivationError(f"{label} is a placeholder SHA-256")
    return value


def _require_semantic_id(value: Any, label: str) -> str:
    if type(value) is not str or _SEMANTIC_ID_RE.fullmatch(value) is None:
        raise FormalAbV2ActivationError(
            f"{label} is not a canonical SHA-256 semantic ID"
        )
    if value == "sha256:" + "0" * 64:
        raise FormalAbV2ActivationError(
            f"{label} is a placeholder semantic ID"
        )
    return value


def _validate_identity(
    value: Any,
    label: str,
    *,
    expected_schema: str | None = None,
) -> dict:
    identity = _exact_dict(value, _IDENTITY_FIELDS, label)
    _safe_relative_path(identity["path"], label)
    if type(identity["bytes"]) is not int or identity["bytes"] <= 0:
        raise FormalAbV2ActivationError(f"{label}.bytes is invalid")
    _require_sha256(identity["sha256"], f"{label}.sha256")
    if (
        type(identity["schema"]) is not str
        or identity["schema"] == ""
        or identity["schema"].strip() != identity["schema"]
    ):
        raise FormalAbV2ActivationError(f"{label}.schema is invalid")
    if expected_schema is not None and identity["schema"] != expected_schema:
        raise FormalAbV2ActivationError(f"{label}.schema differs")
    return dict(identity)


def _open_repository_file(
    repo_root: Path,
    relative_path: str,
    label: str,
) -> int:
    """Open one current-user-owned regular file without following components."""

    _safe_relative_path(relative_path, label)
    if (
        not hasattr(os, "O_NOFOLLOW")
        or not hasattr(os, "O_DIRECTORY")
        or os.open not in os.supports_dir_fd
    ):
        raise FormalAbV2ActivationError(
            f"{label} requires no-follow descriptor support"
        )
    root = repo_root.resolve(strict=True)
    directories: list[int] = []
    descriptor: int | None = None
    try:
        current = os.open(
            root,
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
        )
        directories.append(current)
        root_metadata = os.fstat(current)
        if (
            not stat.S_ISDIR(root_metadata.st_mode)
            or root_metadata.st_uid != os.geteuid()
        ):
            raise FormalAbV2ActivationError(
                f"{label} repository root is not a current-user directory"
            )
        parts = Path(relative_path).parts
        for component in parts[:-1]:
            current = os.open(
                component,
                os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                dir_fd=current,
            )
            directories.append(current)
            metadata = os.fstat(current)
            if (
                not stat.S_ISDIR(metadata.st_mode)
                or metadata.st_uid != os.geteuid()
            ):
                raise FormalAbV2ActivationError(
                    f"{label} path component is not a current-user directory"
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
            raise FormalAbV2ActivationError(
                f"{label} is not one current-user regular inode"
            )
        return descriptor
    except OSError as error:
        if descriptor is not None:
            os.close(descriptor)
        raise FormalAbV2ActivationError(f"{label} cannot be opened safely") from error
    except BaseException:
        if descriptor is not None:
            os.close(descriptor)
        raise
    finally:
        for directory in reversed(directories):
            os.close(directory)


def _read_exact_artifact(
    repo_root: Path,
    identity_value: Any,
    label: str,
) -> tuple[bytes, dict]:
    identity = _validate_identity(identity_value, label)
    descriptor = _open_repository_file(
        repo_root,
        identity["path"],
        label,
    )
    try:
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            raw = stream.read(identity["bytes"] + 1)
    finally:
        os.close(descriptor)
    if len(raw) != identity["bytes"]:
        raise FormalAbV2ActivationError(f"{label} byte length differs")
    if _sha256(raw) != identity["sha256"]:
        raise FormalAbV2ActivationError(f"{label} SHA-256 differs")
    return raw, identity


def _read_exact_json(
    repo_root: Path,
    identity_value: Any,
    label: str,
) -> tuple[dict, dict]:
    raw, identity = _read_exact_artifact(repo_root, identity_value, label)
    try:
        payload = _strict_json_loads(raw.decode("utf-8"))
    except UnicodeDecodeError as error:
        raise FormalAbV2ActivationError(f"{label} is not UTF-8 JSON") from error
    if (
        type(payload) is not dict
        or payload.get("schema") != identity["schema"]
        or type(payload.get("schema")) is not str
    ):
        raise FormalAbV2ActivationError(f"{label} schema differs")
    return payload, identity


def _validate_closed_protocol_chain(repo_root: Path) -> None:
    source, _ = _read_exact_json(
        repo_root,
        _SOURCE_REGISTRY_IDENTITY,
        "formal A/B v2 source registry",
    )
    try:
        validate_closed_formal_ab_v2_registry_data(source)
    except ValueError as error:
        raise FormalAbV2ActivationError(
            "formal A/B v2 source registry is invalid"
        ) from error

    amendment, _ = _read_exact_json(
        repo_root,
        _AMENDMENT_IDENTITY,
        "formal A/B v2 amendment",
    )
    try:
        validate_formal_ab_v2_amendment_data(amendment)
    except ValueError as error:
        raise FormalAbV2ActivationError(
            "formal A/B v2 amendment is invalid"
        ) from error

    plan, _ = _read_exact_json(
        repo_root,
        _PLAN_IDENTITY,
        "formal A/B source plan",
    )
    if plan["schema"] != FRESH_SIBLING_PLAN_SCHEMA:
        raise FormalAbV2ActivationError("formal A/B source plan schema differs")

    v1, _ = _read_exact_json(
        repo_root,
        _V1_REGISTRY_IDENTITY,
        "formal A/B v1 registry",
    )
    try:
        validate_closed_formal_ab_registry_data(v1)
    except ValueError as error:
        raise FormalAbV2ActivationError(
            "formal A/B v1 registry is invalid"
        ) from error


def validate_closed_production_activation_registry(
    repo_root: str | Path,
) -> dict:
    """Validate the one exact closed registry and its immutable protocol chain."""

    root = Path(repo_root).resolve(strict=True)
    registry, _ = _read_exact_json(
        root,
        _ACTIVATION_REGISTRY_IDENTITY,
        "formal A/B v2 production activation registry",
    )
    _require_exact_json(
        registry,
        _EXPECTED_CLOSED_REGISTRY,
        "formal A/B v2 production activation registry",
    )
    _validate_closed_protocol_chain(root)
    return _strict_json_loads(_canonical_json(registry))


def _expected_opening_id(opening: Mapping) -> str:
    raw = (
        "shogi-formal-ab-v2-opening-v1"
        + "\0"
        + _canonical_json(opening)
    ).encode("utf-8")
    return f"sha256:{_sha256(raw)}"


def _expected_game_id(
    opening_id: str,
    pair_index: int,
    game_index: int,
    candidate_color: str,
) -> str:
    raw = (
        "shogi-formal-ab-v2-game-v1"
        + "\0"
        + _canonical_json(
            {
                "candidate_color": candidate_color,
                "game_index": game_index,
                "opening_id": opening_id,
                "pair_index": pair_index,
            }
        )
    ).encode("utf-8")
    return f"sha256:{_sha256(raw)}"


def _validate_content_record(
    value: Any,
    label: str,
    *,
    expected_schema: str,
) -> tuple[dict, dict]:
    record = _exact_dict(value, _CONTENT_RECORD_FIELDS, label)
    identity = _validate_identity(
        record["identity"],
        f"{label}.identity",
        expected_schema=expected_schema,
    )
    payload = record["payload"]
    if type(payload) is not dict or payload.get("schema") != expected_schema:
        raise FormalAbV2ActivationError(f"{label}.payload schema differs")
    raw = _canonical_artifact_bytes(payload)
    if identity["bytes"] != len(raw):
        raise FormalAbV2ActivationError(f"{label}.identity bytes differ")
    if identity["sha256"] != _sha256(raw):
        raise FormalAbV2ActivationError(f"{label}.identity SHA-256 differs")
    return (
        _strict_json_loads(_canonical_json(payload)),
        identity,
    )


def _validate_openings(value: Any) -> tuple[dict, dict]:
    payload, identity = _validate_content_record(
        value,
        "CoreForTests openings manifest",
        expected_schema=OPENING_SCHEDULE_SCHEMA,
    )
    manifest = _exact_dict(
        payload,
        _OPENINGS_FIELDS,
        "CoreForTests openings manifest payload",
    )
    pairs = manifest["pairs"]
    if type(pairs) is not list or len(pairs) != PAIR_COUNT:
        raise FormalAbV2ActivationError(
            "CoreForTests openings require exactly 384 ordered pairs"
        )
    opening_ids: set[str] = set()
    game_ids: set[str] = set()
    for pair_index, raw_pair in enumerate(pairs):
        pair = _exact_dict(
            raw_pair,
            _PAIR_FIELDS,
            f"CoreForTests opening pair {pair_index}",
        )
        if (
            type(pair["pair_index"]) is not int
            or pair["pair_index"] != pair_index
        ):
            raise FormalAbV2ActivationError(
                "CoreForTests pair indices must be contiguous and ordered"
            )
        opening = _exact_dict(
            pair["opening"],
            _OPENING_FIELDS,
            f"CoreForTests opening pair {pair_index}.opening",
        )
        try:
            normalized_sfen = _normalized_sfen(
                opening["sfen"],
                f"CoreForTests opening pair {pair_index}.sfen",
            )
        except ValueError as error:
            raise FormalAbV2ActivationError(
                f"CoreForTests opening pair {pair_index} SFEN is invalid"
            ) from error
        if (
            type(opening["sfen"]) is not str
            or normalized_sfen != opening["sfen"]
        ):
            raise FormalAbV2ActivationError(
                f"CoreForTests opening pair {pair_index} SFEN is not canonical"
            )
        moves = opening["usi_moves"]
        if (
            type(moves) is not list
            or any(
                type(move) is not str
                or _USI_MOVE_RE.fullmatch(move) is None
                for move in moves
            )
        ):
            raise FormalAbV2ActivationError(
                f"CoreForTests opening pair {pair_index} USI moves are invalid"
            )
        normalized_opening = {
            "sfen": normalized_sfen,
            "usi_moves": list(moves),
        }
        opening_id = _require_semantic_id(
            pair["opening_id"],
            f"CoreForTests opening pair {pair_index}.opening_id",
        )
        if opening_id != _expected_opening_id(normalized_opening):
            raise FormalAbV2ActivationError(
                f"CoreForTests opening pair {pair_index} ID differs"
            )
        if opening_id in opening_ids:
            raise FormalAbV2ActivationError(
                "CoreForTests opening IDs must be unique"
            )
        opening_ids.add(opening_id)
        games = pair["games"]
        if type(games) is not list or len(games) != GAMES_PER_PAIR:
            raise FormalAbV2ActivationError(
                "CoreForTests each pair requires exactly two games"
            )
        for game_index, raw_game in enumerate(games):
            game = _exact_dict(
                raw_game,
                _GAME_FIELDS,
                f"CoreForTests pair {pair_index} game {game_index}",
            )
            expected_color = COLORS[game_index]
            if (
                type(game["game_index"]) is not int
                or game["game_index"] != game_index
                or type(game["candidate_color"]) is not str
                or game["candidate_color"] != expected_color
            ):
                raise FormalAbV2ActivationError(
                    "CoreForTests games must order candidate sente then gote"
                )
            game_id = _require_semantic_id(
                game["game_id"],
                f"CoreForTests pair {pair_index} game {game_index}.game_id",
            )
            if game_id != _expected_game_id(
                opening_id,
                pair_index,
                game_index,
                expected_color,
            ):
                raise FormalAbV2ActivationError(
                    f"CoreForTests pair {pair_index} game {game_index} ID differs"
                )
            if game_id in game_ids:
                raise FormalAbV2ActivationError(
                    "CoreForTests game IDs must be globally unique"
                )
            game_ids.add(game_id)
    if len(game_ids) != GAME_COUNT:
        raise FormalAbV2ActivationError(
            "CoreForTests openings must account for exactly 768 games"
        )
    return payload, identity


def _validate_time_control(value: Any) -> tuple[dict, dict]:
    payload, identity = _validate_content_record(
        value,
        "CoreForTests time control",
        expected_schema=TIME_CONTROL_SCHEMA,
    )
    control = _exact_dict(
        payload,
        _TIME_CONTROL_FIELDS,
        "CoreForTests time control payload",
    )
    for field in ("main_time_ms", "byoyomi_ms", "increment_ms"):
        if type(control[field]) is not int or control[field] < 0:
            raise FormalAbV2ActivationError(
                f"CoreForTests time control {field} is invalid"
            )
    if control["main_time_ms"] + control["byoyomi_ms"] + control["increment_ms"] <= 0:
        raise FormalAbV2ActivationError(
            "CoreForTests time control must provide positive thinking time"
        )
    if (
        type(control["maximum_moves"]) is not int
        or control["maximum_moves"] < 1
        or control["maximum_moves"] > 10_000
    ):
        raise FormalAbV2ActivationError(
            "CoreForTests time control maximum_moves is invalid"
        )
    if control["adjudication"] != "adapter-terminal-or-maximum-moves-draw":
        raise FormalAbV2ActivationError(
            "CoreForTests time control adjudication differs"
        )
    return payload, identity


def compose_formal_ab_v2_activation_core_for_tests(
    value: Mapping[str, Any],
) -> dict:
    """Build a deterministic, non-executable test composition receipt.

    This interface accepts synthetic identities for adversarial unit tests.  It
    is not reachable from the production entry and never reads an artifact,
    starts an engine or game, accesses a network, or writes live weights.
    """

    composition = _exact_dict(
        value,
        _COMPOSITION_FIELDS,
        "CoreForTests activation composition",
    )
    if composition["schema"] != ACTIVATION_COMPOSITION_INPUT_SCHEMA:
        raise FormalAbV2ActivationError(
            "CoreForTests activation composition schema differs"
        )
    experiment_id = _require_semantic_id(
        composition["experiment_id"],
        "CoreForTests experiment_id",
    )
    run_id = _require_semantic_id(
        composition["run_id"],
        "CoreForTests run_id",
    )
    if experiment_id == run_id:
        raise FormalAbV2ActivationError(
            "CoreForTests experiment and run identities must differ"
        )
    candidate = _validate_identity(
        composition["candidate_weights"],
        "CoreForTests candidate weights",
        expected_schema=WEIGHTS_SCHEMA,
    )
    stable = _validate_identity(
        composition["stable_weights"],
        "CoreForTests stable weights",
        expected_schema=WEIGHTS_SCHEMA,
    )
    if candidate["sha256"] == stable["sha256"]:
        raise FormalAbV2ActivationError(
            "CoreForTests candidate and stable weights must differ"
        )
    _, openings_identity = _validate_openings(
        composition["openings_manifest"]
    )
    _require_exact_json(
        composition["colors"],
        COLORS,
        "CoreForTests candidate colors",
    )
    _, time_control_identity = _validate_time_control(
        composition["time_control"]
    )
    workers = composition["pair_workers"]
    if (
        type(workers) is not int
        or workers < 1
        or workers > MAX_PAIR_WORKERS
    ):
        raise FormalAbV2ActivationError(
            "CoreForTests pair_workers must be an integer from 1 through 6"
        )
    adapter = _validate_identity(
        composition["match_adapter"],
        "CoreForTests match adapter",
        expected_schema=MATCH_ADAPTER_SCHEMA,
    )
    receipts = _exact_dict(
        composition["receipts"],
        _RECEIPT_FIELDS,
        "CoreForTests receipts",
    )
    captured_receipts = {
        "result_receipt": _validate_identity(
            receipts["result_receipt"],
            "CoreForTests result receipt",
            expected_schema=RESULT_RECEIPT_SCHEMA,
        ),
        "retention_receipt": _validate_identity(
            receipts["retention_receipt"],
            "CoreForTests retention receipt",
            expected_schema=RETENTION_RECEIPT_SCHEMA,
        ),
        "rollback_receipt": _validate_identity(
            receipts["rollback_receipt"],
            "CoreForTests rollback receipt",
            expected_schema=ROLLBACK_RECEIPT_SCHEMA,
        ),
    }
    receipt_digests = [
        receipt["sha256"] for receipt in captured_receipts.values()
    ]
    if len(set(receipt_digests)) != len(receipt_digests):
        raise FormalAbV2ActivationError(
            "CoreForTests receipt identities must be distinct"
        )
    safety = _exact_dict(
        composition["safety"],
        _SAFETY_FIELDS,
        "CoreForTests safety",
    )
    _require_exact_json(safety, _EXPECTED_SAFETY, "CoreForTests safety")

    binding = {
        "protocol": {
            "source_registry": _SOURCE_REGISTRY_IDENTITY,
            "amendment": _AMENDMENT_IDENTITY,
            "plan": _PLAN_IDENTITY,
        },
        "experiment_id": experiment_id,
        "run_id": run_id,
        "candidate_weights": candidate,
        "stable_weights": stable,
        "openings_manifest": openings_identity,
        "candidate_colors": list(COLORS),
        "time_control": time_control_identity,
        "pair_workers": workers,
        "match_adapter": adapter,
        "receipts": captured_receipts,
        "accounting": {
            "pairs": PAIR_COUNT,
            "games_per_pair": GAMES_PER_PAIR,
            "games": GAME_COUNT,
            "candidate_sente_games": PAIR_COUNT,
            "candidate_gote_games": PAIR_COUNT,
        },
        "safety": dict(_EXPECTED_SAFETY),
    }
    binding_sha256 = _sha256(_canonical_artifact_bytes(binding))
    return {
        "schema": ACTIVATION_COMPOSITION_RECEIPT_SCHEMA,
        "status": "test-only-composition-complete-no-execution-authority",
        "binding": _strict_json_loads(_canonical_json(binding)),
        "binding_sha256": binding_sha256,
        "authority": {
            "execute_games": False,
            "production_activation": False,
            "production_weight_write": False,
        },
        "observations": {
            "pairs_started": 0,
            "games_started": 0,
            "engine_processes_started": 0,
            "network_requests": 0,
            "live_weight_changes": 0,
        },
    }


def argumentless_production_preflight() -> None:
    """Validate the fixed repository registry, then stop with zero access."""

    repo_root = Path(__file__).resolve().parents[1]
    validate_closed_production_activation_registry(repo_root)
    raise FormalAbV2ActivationBlocked(
        "formal A/B v2 production activation enrollments are closed"
    )


def _cli_receipt(reason: str) -> dict:
    return {
        "schema": ACTIVATION_CLI_RECEIPT_SCHEMA,
        "status": "STOP",
        "reason": reason,
        "pairs_started": 0,
        "games_started": 0,
        "engine_processes_started": 0,
        "network_requests": 0,
        "live_weight_changes": 0,
    }


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        print(
            _canonical_json(_cli_receipt("arguments-forbidden")),
            file=sys.stderr,
        )
        return 2
    try:
        argumentless_production_preflight()
    except FormalAbV2ActivationBlocked:
        print(_canonical_json(_cli_receipt("enrollments-closed")))
        return 2
    except FormalAbV2ActivationError:
        print(
            _canonical_json(_cli_receipt("activation-registry-invalid")),
            file=sys.stderr,
        )
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
