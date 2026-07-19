"""Local-only formal paired A/B v2 orchestration.

The checked-in v2 registry is intentionally closed, so the argumentless CLI
always stops before creating a receipt directory or invoking a match adapter.
The dependency-injected core defines the future data-only execution boundary
and is exercised only with stub games in unit tests.
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
)
from formal_paired_ab_protocol_v2 import (
    FORMAL_AB_V2_AMENDMENT_SHA256,
    FORMAL_AB_V2_REGISTRY_BYTES,
    FORMAL_AB_V2_REGISTRY_PATH,
    FORMAL_AB_V2_REGISTRY_SCHEMA,
    FORMAL_AB_V2_REGISTRY_SHA256,
    FORMAL_AB_V2_RESULT_SCHEMA,
    GAME_COUNT,
    PAIR_COUNT,
    _require_exact_json,
    _require_exact_semantic_id,
    _require_exact_sha256,
    _strict_json_loads,
    decode_pair_score_units,
    validate_closed_formal_ab_v2_registry,
)


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

MAX_PAIR_WORKERS = 6
ZERO_SHA256 = "0" * 64
PAIR_FILE_PREFIX = "pair-"
PAIR_FILE_SUFFIX = ".jsonl"

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
        "attempt_ledger_sha256",
        "rerun_authorization_sha256",
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


def _validate_identity(value: Any, label: str, *, schema: bool = False) -> dict:
    fields = _SCHEMA_IDENTITY_FIELDS if schema else _IDENTITY_FIELDS
    identity = _exact_dict(value, fields, label)
    path_value = identity["path"]
    if (
        type(path_value) is not str
        or path_value == ""
        or path_value.strip() != path_value
        or "\0" in path_value
        or "\\" in path_value
    ):
        raise FormalAbLocalLauncherError(f"{label}.path is invalid")
    path_parts = Path(path_value).parts
    if Path(path_value).is_absolute() or any(part in ("", ".", "..") for part in path_parts):
        raise FormalAbLocalLauncherError(f"{label}.path must be a safe relative path")
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


def _read_exact_artifact(
    repo_root: Path,
    identity_value: Any,
    label: str,
    *,
    schema: bool = False,
) -> tuple[bytes, dict]:
    identity = _validate_identity(identity_value, label, schema=schema)
    root = repo_root.resolve(strict=True)
    artifact_path = root.joinpath(*Path(identity["path"]).parts)
    try:
        artifact_path.relative_to(root)
    except ValueError as error:
        raise FormalAbLocalLauncherError(f"{label}.path escapes repository") from error

    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(artifact_path, flags)
    except OSError as error:
        raise FormalAbLocalLauncherError(f"{label} cannot be opened safely") from error
    try:
        metadata = os.fstat(descriptor)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or metadata.st_nlink != 1
        ):
            raise FormalAbLocalLauncherError(
                f"{label} must be one current-user-owned regular inode"
            )
        with os.fdopen(os.dup(descriptor), "rb") as stream:
            raw = stream.read(identity["bytes"] + 1)
        if len(raw) != identity["bytes"]:
            raise FormalAbLocalLauncherError(f"{label} byte length differs")
        if _sha256_bytes(raw) != identity["sha256"]:
            raise FormalAbLocalLauncherError(f"{label} SHA-256 differs")
    finally:
        os.close(descriptor)

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
    repo_root: Path, identity_value: Any, label: str
) -> tuple[dict, dict, bytes]:
    raw, identity = _read_exact_artifact(
        repo_root, identity_value, label, schema=True
    )
    payload = _strict_json_loads(raw.decode("utf-8"))
    return payload, identity, raw


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
        sfen = opening["sfen"]
        moves = opening["usi_moves"]
        if (
            type(sfen) is not str
            or sfen == ""
            or sfen.strip() != sfen
            or "\0" in sfen
            or type(moves) is not list
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
    if type(options) is not dict or not options:
        raise FormalAbLocalLauncherError(
            "local match deterministic options must be a nonempty exact JSON object"
        )
    _canonical_json(options)
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


def validate_ready_local_run_registry(
    repo_root: str | Path, registry_path: str | Path
) -> dict:
    """Capture a reviewed ready registry and every enrolled local artifact."""

    root = Path(repo_root).resolve(strict=True)
    registry_file = Path(registry_path)
    if not registry_file.is_absolute():
        registry_file = root / registry_file
    try:
        registry_file.resolve(strict=True).relative_to(root)
    except (FileNotFoundError, ValueError) as error:
        raise FormalAbLocalLauncherError(
            "local run registry must be a repository-contained regular file"
        ) from error
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(registry_file, flags)
    except OSError as error:
        raise FormalAbLocalLauncherError(
            "local run registry cannot be opened safely"
        ) from error
    try:
        metadata = os.fstat(descriptor)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or metadata.st_nlink != 1
        ):
            raise FormalAbLocalLauncherError(
                "local run registry must be one current-user-owned regular inode"
            )
        with os.fdopen(os.dup(descriptor), "rb") as stream:
            raw = stream.read()
    finally:
        os.close(descriptor)
    registry_sha256 = _sha256_bytes(raw)
    try:
        registry = _strict_json_loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as error:
        raise FormalAbLocalLauncherError("local run registry JSON is invalid") from error
    registry = _exact_dict(registry, _RUN_REGISTRY_FIELDS, "local run registry")
    if registry["schema"] != LOCAL_RUN_REGISTRY_SCHEMA:
        raise FormalAbLocalLauncherError("local run registry schema differs")
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
    _read_exact_artifact(
        root, registry["source_registry"], "formal A/B v2 source registry", schema=True
    )
    validate_closed_formal_ab_v2_registry(root / FORMAL_AB_V2_REGISTRY_PATH)
    _read_exact_artifact(root, registry["plan"], "fresh sibling plan", schema=True)
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
    _require_exact_sha256(
        registry["attempt_ledger_sha256"], "attempt_ledger_sha256"
    )
    rerun = registry["rerun_authorization_sha256"]
    if attempt_index == 0:
        if rerun is not None:
            raise FormalAbLocalLauncherError(
                "first attempt cannot carry rerun authorization"
            )
    else:
        _require_exact_sha256(rerun, "rerun_authorization_sha256")
    workers = registry["pair_workers"]
    if type(workers) is not int or workers < 1 or workers > MAX_PAIR_WORKERS:
        raise FormalAbLocalLauncherError("pair_workers must be an integer from 1 to 6")
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
    return {
        "registry_sha256": registry_sha256,
        "registry": dict(registry),
        "pairs": captured_pairs,
        "openings_manifest_identity": dict(openings_identity),
        "match_binding_identity": dict(match_identity),
        "match_binding": captured_binding,
        "assets": captured_assets,
    }


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


def _create_pair_journal(path_value: Path, start_event: Mapping) -> str:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path_value, flags, 0o600)
    try:
        raw = _event_bytes(start_event)
        os.write(descriptor, raw)
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
        raw = _event_bytes(event)
        os.write(descriptor, raw)
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
        with os.fdopen(os.dup(descriptor), "rb") as stream:
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
        except BaseException as error:
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


def run_ready_local_formal_ab_v2(
    repo_root: str | Path,
    registry_path: str | Path,
    receipt_directory: str | Path,
    execute_game: Callable[[Mapping], Mapping],
) -> dict:
    """Run or resume exact pairs through an injected, already-enrolled adapter."""

    captured = validate_ready_local_run_registry(repo_root, registry_path)
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
        first_error: BaseException | None = None
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
                except BaseException as error:
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

    result = {
        "schema": FORMAL_AB_V2_RESULT_SCHEMA,
        "plan": _PLAN_IDENTITY,
        "protocol_amendment_sha256": FORMAL_AB_V2_AMENDMENT_SHA256,
        "experiment_id": captured["registry"]["experiment_id"],
        "run_id": captured["registry"]["run_id"],
        "attempt_index": captured["registry"]["attempt_index"],
        "attempt_ledger_sha256": captured["registry"]["attempt_ledger_sha256"],
        "rerun_authorization_sha256": captured["registry"][
            "rerun_authorization_sha256"
        ],
        "candidate_weights_sha256": captured["assets"]["candidate_weights"][
            "sha256"
        ],
        "stable_weights_sha256": captured["assets"]["stable_weights"]["sha256"],
        "match_binding_sha256": captured["match_binding_identity"]["sha256"],
        "run_status": "complete",
        "technical_fault_count": 0,
        "pairs": completed,
    }
    recaptured = validate_ready_local_run_registry(repo_root, registry_path)
    for key in (
        "registry_sha256",
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
    validate_closed_formal_ab_v2_registry(root / FORMAL_AB_V2_REGISTRY_PATH)
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
