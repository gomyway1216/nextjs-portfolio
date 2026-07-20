"""Pre-result WASM enrollment contract for formal paired A/B v2.

This module deliberately does not activate a ready registry.  It supplies the
strict match-binding, opening-manifest, attempt-zero, safe-seed, and worker
selection contract that the next activation bridge must consume.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
import copy
from pathlib import Path
from typing import Any

import formal_paired_ab_local_launcher as legacy


PAIR_COUNT = 384
GAME_COUNT = 768
MAX_SAFE_SEED = (1 << 53) - 1
PAIR_WORKER_CANDIDATES = (2, 4, 8, 12)
MAX_PAIR_WORKERS = max(PAIR_WORKER_CANDIDATES)
NNUE_BYTES = 1_185_988
WASM_BYTES = 35_597
WASM_SHA256 = "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c"

FORMAL_WASM_MATCH_BINDING_SCHEMA = (
    "shogi-formal-paired-ab-v2-wasm-match-binding-v2"
)
FORMAL_WASM_OPENINGS_MANIFEST_SCHEMA = (
    "shogi-formal-paired-ab-v2-wasm-openings-manifest-v2"
)
FORMAL_WASM_OPENINGS_PREFLIGHT_SCHEMA = (
    "shogi-formal-paired-ab-v2-wasm-openings-preflight-v1"
)

PAIR_ENTRY_PATH = "ml/run-formal-paired-ab-v2-wasm-pair.ts"
MATCH_ADAPTER_PATH = "ml/formal-paired-ab-v2-wasm-match-adapter.ts"
ISOLATED_PLAYER_PATH = "ml/formal-paired-ab-v2-wasm-player-child.ts"
WASM_MODULE_SOURCE_PATH = (
    "src/components/game/ShogiImproved/wasm/shogiWasmBase64.ts"
)

MATCH_ASSET_PATHS = {
    "pair_entry": PAIR_ENTRY_PATH,
    "match_adapter": MATCH_ADAPTER_PATH,
    "isolated_player": ISOLATED_PLAYER_PATH,
    "wasm_module_source": WASM_MODULE_SOURCE_PATH,
}

SEARCH_CONTRACT = {
    "engine": "production-browser-wasm-v20",
    "clock": "none",
    "fixed_depth": 11,
    "quiescence_depth": 10,
    "nnue_scale_k": 600,
    "wasm_bytes": WASM_BYTES,
    "wasm_sha256": WASM_SHA256,
    "reset_before_every_move": True,
    "book": False,
    "fallback": "forbidden",
    "max_plies": 512,
    "adjudication": (
        "legal-moves-fourfold-repetition-with-perpetual-check-loss-"
        "and-max-plies-draw-v1"
    ),
}

PAIR_WORKER_POLICY = {
    "benchmark_candidates": list(PAIR_WORKER_CANDIDATES),
    "safe_maximum": MAX_PAIR_WORKERS,
    "selection_condition": (
        "highest-median-pairs-per-second-after-exact-transcript-hash-equality"
    ),
}

SAFETY_CONTRACT = {
    "local_only": True,
    "network": False,
    "cloud": False,
    "aws": False,
    "gcp": False,
    "external_calibration": False,
    "live_weight_write": False,
    "automatic_run": False,
}

OPENING_SELECTION_RULE = {
    "label_blind": True,
    "opening_ply": 16,
    "ranking": "sha256-domain-source-game-id-byte-order",
    "duplicate_policy": "keep-first-ranked-semantic-final-position",
    "required_openings": PAIR_COUNT,
}

_MATCH_BINDING_FIELDS = frozenset(
    {
        "schema",
        "engine_protocol",
        "opening_protocol",
        "result_protocol",
        "assets",
        "search_contract",
        "pair_worker_policy",
        "safety",
    }
)
_MATCH_ASSET_FIELDS = frozenset(
    {
        "candidate_weights",
        "stable_weights",
        *MATCH_ASSET_PATHS,
    }
)
_OPENINGS_MANIFEST_FIELDS = frozenset(
    {"schema", "source_manifest_sha256", "selection_rule", "pairs"}
)
_OPENING_PAIR_FIELDS = frozenset(
    {
        "pair_index",
        "source_game_id",
        "opening_id",
        "opening",
        "seed",
        "games",
    }
)
_OPENING_FIELDS = frozenset({"sfen", "usi_moves"})
_GAME_PLAN_FIELDS = frozenset({"game_index", "game_id", "candidate_color"})
_PREFLIGHT_FIELDS = frozenset(
    {
        "schema",
        "status",
        "manifest_sha256",
        "pairs",
        "games",
        "source_games",
        "semantic_final_positions",
        "source_game_ids_sha256",
        "semantic_final_position_ids_sha256",
        "receipt_sha256",
    }
)


class FormalAbV2WasmContractError(ValueError):
    """The pre-result formal WASM enrollment contract is invalid."""


def _exact_dict(value: Any, fields: frozenset[str], label: str) -> dict:
    try:
        return legacy._exact_dict(value, fields, label)
    except legacy.FormalAbLocalLauncherError as error:
        raise FormalAbV2WasmContractError(str(error)) from error


def _require_exact_json(observed: Any, expected: Any, label: str) -> None:
    try:
        legacy._require_exact_json(observed, expected, label)
    except ValueError as error:
        raise FormalAbV2WasmContractError(str(error)) from error


def _require_sha256(value: Any, label: str) -> str:
    try:
        return legacy._require_exact_sha256(value, label)
    except ValueError as error:
        raise FormalAbV2WasmContractError(str(error)) from error


def _require_semantic_id(value: Any, label: str) -> str:
    try:
        return legacy._require_exact_semantic_id(value, label)
    except ValueError as error:
        raise FormalAbV2WasmContractError(str(error)) from error


def _domain_digest(domain: str, payload: Mapping | list) -> str:
    return legacy._sha256_text(domain + "\0" + legacy._canonical_json(payload))


def validate_formal_wasm_run_envelope(registry: Mapping) -> int:
    """Reject reruns and non-benchmarked worker counts before any journal."""

    if not isinstance(registry, Mapping):
        raise FormalAbV2WasmContractError("formal WASM registry must be a mapping")
    if registry.get("attempt_index") != 0:
        raise FormalAbV2WasmContractError(
            "formal WASM execution is attempt-zero only"
        )
    if registry.get("rerun_authorization") is not None:
        raise FormalAbV2WasmContractError(
            "attempt-zero formal WASM execution cannot carry rerun authorization"
        )
    workers = registry.get("pair_workers")
    if type(workers) is not int or workers not in PAIR_WORKER_CANDIDATES:
        raise FormalAbV2WasmContractError(
            "pair_workers must be selected from the benchmark candidates "
            "2, 4, 8, or 12"
        )
    return workers


def _validate_match_binding(
    payload: Any,
    read_asset: Callable[[str, Mapping], Mapping],
) -> tuple[dict, dict[str, dict]]:
    binding = _exact_dict(
        payload,
        _MATCH_BINDING_FIELDS,
        "formal WASM match binding",
    )
    if binding["schema"] != FORMAL_WASM_MATCH_BINDING_SCHEMA:
        raise FormalAbV2WasmContractError("formal WASM match binding schema differs")
    expected_protocols = {
        "engine_protocol": "production-browser-wasm-v20",
        "opening_protocol": "SFEN+USI",
        "result_protocol": "candidate-perspective-win-draw-loss",
    }
    for field, expected in expected_protocols.items():
        if binding[field] != expected:
            raise FormalAbV2WasmContractError(
                f"formal WASM match binding {field} differs"
            )

    assets = _exact_dict(
        binding["assets"],
        _MATCH_ASSET_FIELDS,
        "formal WASM match binding.assets",
    )
    captured_assets: dict[str, dict] = {}
    for name in sorted(_MATCH_ASSET_FIELDS):
        try:
            identity = dict(read_asset(name, assets[name]))
        except (OSError, ValueError, TypeError) as error:
            raise FormalAbV2WasmContractError(
                f"formal WASM match binding asset {name} is invalid"
            ) from error
        _require_sha256(identity.get("sha256"), f"{name} SHA-256")
        if (
            type(identity.get("path")) is not str
            or type(identity.get("bytes")) is not int
            or identity["bytes"] <= 0
        ):
            raise FormalAbV2WasmContractError(
                f"formal WASM match binding asset {name} identity is invalid"
            )
        captured_assets[name] = identity

    for name, expected_path in MATCH_ASSET_PATHS.items():
        if captured_assets[name]["path"] != expected_path:
            raise FormalAbV2WasmContractError(
                f"formal WASM match binding {name} path differs from the real runner"
            )
    for name in ("candidate_weights", "stable_weights"):
        if captured_assets[name]["bytes"] != NNUE_BYTES:
            raise FormalAbV2WasmContractError(
                f"formal WASM {name} byte length differs from NNUE layout"
            )
    if (
        captured_assets["candidate_weights"]["path"]
        == captured_assets["stable_weights"]["path"]
        or captured_assets["candidate_weights"]["sha256"]
        == captured_assets["stable_weights"]["sha256"]
    ):
        raise FormalAbV2WasmContractError(
            "candidate and stable weights must have distinct path and SHA-256"
        )
    _require_exact_json(
        binding["search_contract"],
        SEARCH_CONTRACT,
        "formal WASM search contract",
    )
    _require_exact_json(
        binding["pair_worker_policy"],
        PAIR_WORKER_POLICY,
        "formal WASM pair-worker policy",
    )
    _require_exact_json(
        binding["safety"],
        SAFETY_CONTRACT,
        "formal WASM safety contract",
    )
    return copy.deepcopy(binding), captured_assets


def validate_formal_wasm_match_binding(
    repo_root: str | Path,
    payload: Any,
) -> tuple[dict, dict[str, dict]]:
    """Validate exact real-runner assets from one repository root."""

    root = Path(repo_root).resolve(strict=True)

    def read_asset(name: str, identity: Mapping) -> Mapping:
        _raw, captured = legacy._read_exact_artifact(
            root,
            identity,
            f"formal WASM match binding.assets.{name}",
        )
        return captured

    return _validate_match_binding(payload, read_asset)


def validate_formal_wasm_match_binding_core_for_tests(
    payload: Any,
    read_asset: Callable[[str, Mapping], Mapping],
) -> tuple[dict, dict[str, dict]]:
    """Dependency-injected identity seam; never a production activation API."""

    if not callable(read_asset):
        raise FormalAbV2WasmContractError("CoreForTests asset reader is not callable")
    return _validate_match_binding(payload, read_asset)


def _expected_opening_id(opening: Mapping) -> str:
    return legacy._semantic_id("shogi-formal-ab-v2-opening-v1", opening)


def _expected_game_id(
    opening_id: str,
    pair_index: int,
    game_index: int,
    candidate_color: str,
) -> str:
    return legacy._semantic_id(
        "shogi-formal-ab-v2-game-v1",
        {
            "candidate_color": candidate_color,
            "game_index": game_index,
            "opening_id": opening_id,
            "pair_index": pair_index,
        },
    )


def validate_formal_wasm_openings_manifest(payload: Any) -> dict:
    """Validate structural bindings before the production-rules TS preflight."""

    manifest = _exact_dict(
        payload,
        _OPENINGS_MANIFEST_FIELDS,
        "formal WASM openings manifest",
    )
    if manifest["schema"] != FORMAL_WASM_OPENINGS_MANIFEST_SCHEMA:
        raise FormalAbV2WasmContractError(
            "formal WASM openings manifest schema differs"
        )
    source_manifest_sha256 = _require_sha256(
        manifest["source_manifest_sha256"],
        "source manifest SHA-256",
    )
    _require_exact_json(
        manifest["selection_rule"],
        OPENING_SELECTION_RULE,
        "formal WASM opening selection rule",
    )
    if type(manifest["pairs"]) is not list or len(manifest["pairs"]) != PAIR_COUNT:
        raise FormalAbV2WasmContractError(
            "formal WASM openings manifest requires exactly 384 pairs"
        )

    source_game_ids: set[str] = set()
    opening_ids: set[str] = set()
    game_ids: set[str] = set()
    seeds: set[int] = set()
    captured_pairs: list[dict] = []
    for pair_index, raw_pair in enumerate(manifest["pairs"]):
        pair = _exact_dict(
            raw_pair,
            _OPENING_PAIR_FIELDS,
            f"formal WASM opening pair {pair_index}",
        )
        if type(pair["pair_index"]) is not int or pair["pair_index"] != pair_index:
            raise FormalAbV2WasmContractError(
                "formal WASM opening pair indices must be contiguous and ordered"
            )
        source_game_id = _require_semantic_id(
            pair["source_game_id"],
            f"formal WASM opening pair {pair_index}.source_game_id",
        )
        if source_game_id in source_game_ids:
            raise FormalAbV2WasmContractError(
                "formal WASM openings require one distinct source game per pair"
            )
        source_game_ids.add(source_game_id)
        opening = _exact_dict(
            pair["opening"],
            _OPENING_FIELDS,
            f"formal WASM opening pair {pair_index}.opening",
        )
        try:
            sfen = legacy._normalized_sfen(
                opening["sfen"],
                f"formal WASM opening pair {pair_index}.sfen",
            )
        except ValueError as error:
            raise FormalAbV2WasmContractError(
                f"formal WASM opening pair {pair_index} has invalid SFEN"
            ) from error
        moves = opening["usi_moves"]
        if (
            type(moves) is not list
            or len(moves) != OPENING_SELECTION_RULE["opening_ply"]
            or any(
                type(move) is not str
                or legacy._USI_MOVE_RE.fullmatch(move) is None
                for move in moves
            )
        ):
            raise FormalAbV2WasmContractError(
                f"formal WASM opening pair {pair_index} move vector differs"
            )
        captured_opening = {"sfen": sfen, "usi_moves": list(moves)}
        opening_id = _require_semantic_id(
            pair["opening_id"],
            f"formal WASM opening pair {pair_index}.opening_id",
        )
        if (
            opening_id != _expected_opening_id(captured_opening)
            or opening_id in opening_ids
        ):
            raise FormalAbV2WasmContractError(
                f"formal WASM opening pair {pair_index} identity differs or repeats"
            )
        opening_ids.add(opening_id)
        seed = pair["seed"]
        if (
            type(seed) is not int
            or seed < 1
            or seed > MAX_SAFE_SEED
            or seed in seeds
        ):
            raise FormalAbV2WasmContractError(
                "formal WASM opening seeds must be unique integers from 1 "
                "through Number.MAX_SAFE_INTEGER"
            )
        seeds.add(seed)
        if type(pair["games"]) is not list or len(pair["games"]) != 2:
            raise FormalAbV2WasmContractError(
                f"formal WASM opening pair {pair_index} requires two games"
            )
        captured_games: list[dict] = []
        for game_index, raw_game in enumerate(pair["games"]):
            game = _exact_dict(
                raw_game,
                _GAME_PLAN_FIELDS,
                f"formal WASM opening pair {pair_index}.games[{game_index}]",
            )
            color = "sente" if game_index == 0 else "gote"
            expected_game_id = _expected_game_id(
                opening_id,
                pair_index,
                game_index,
                color,
            )
            if (
                game["game_index"] != game_index
                or game["candidate_color"] != color
                or game["game_id"] != expected_game_id
                or expected_game_id in game_ids
            ):
                raise FormalAbV2WasmContractError(
                    f"formal WASM opening pair {pair_index} game plan differs"
                )
            game_ids.add(expected_game_id)
            captured_games.append(dict(game))
        captured_pairs.append(
            {
                "pair_index": pair_index,
                "source_game_id": source_game_id,
                "opening_id": opening_id,
                "opening": captured_opening,
                "seed": seed,
                "games": captured_games,
            }
        )
    if len(source_game_ids) != PAIR_COUNT or len(game_ids) != GAME_COUNT:
        raise FormalAbV2WasmContractError(
            "formal WASM opening manifest accounting differs"
        )
    return {
        "schema": FORMAL_WASM_OPENINGS_MANIFEST_SCHEMA,
        "source_manifest_sha256": source_manifest_sha256,
        "selection_rule": copy.deepcopy(OPENING_SELECTION_RULE),
        "pairs": captured_pairs,
    }


def validate_formal_wasm_openings_preflight_receipt(
    manifest: Mapping,
    value: Any,
) -> dict:
    """Bind a production-rules preflight PASS to the exact manifest."""

    receipt = _exact_dict(
        value,
        _PREFLIGHT_FIELDS,
        "formal WASM openings preflight receipt",
    )
    expected_header = {
        "schema": FORMAL_WASM_OPENINGS_PREFLIGHT_SCHEMA,
        "status": "PASS",
        "manifest_sha256": _domain_digest(
            "shogi-formal-paired-ab-v2-wasm-openings-manifest-v2",
            manifest,
        ),
        "pairs": PAIR_COUNT,
        "games": GAME_COUNT,
        "source_games": PAIR_COUNT,
        "semantic_final_positions": PAIR_COUNT,
    }
    for field, expected in expected_header.items():
        if type(receipt[field]) is not type(expected) or receipt[field] != expected:
            raise FormalAbV2WasmContractError(
                f"formal WASM openings preflight {field} differs"
            )
    _require_sha256(
        receipt["source_game_ids_sha256"],
        "preflight source game IDs SHA-256",
    )
    _require_sha256(
        receipt["semantic_final_position_ids_sha256"],
        "preflight semantic final position IDs SHA-256",
    )
    body = {field: receipt[field] for field in receipt if field != "receipt_sha256"}
    expected_receipt_sha256 = _domain_digest(
        "shogi-formal-paired-ab-v2-wasm-openings-preflight-v1",
        body,
    )
    if receipt["receipt_sha256"] != expected_receipt_sha256:
        raise FormalAbV2WasmContractError(
            "formal WASM openings preflight receipt digest differs"
        )
    return dict(receipt)
