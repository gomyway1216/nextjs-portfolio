"""Real local browser/WASM pair runner for formal paired A/B v2.

The earlier local launcher remains a hash-pinned historical publication. This
module composes its ready-registry validation, event binding, private receipt
directory checks, and authoritative v2 decoder with the executable two-player
WASM adapter. Today's checked-in registry is still closed; the production
entry becomes reachable only when that earlier module code-pins one reviewed
ready-registry identity.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor, as_completed
import copy
import os
from pathlib import Path
import stat
import subprocess
from typing import Any

import formal_paired_ab_local_launcher as legacy
import formal_paired_ab_v2_wasm_contract as formal_contract


PAIR_COUNT = legacy.PAIR_COUNT
GAME_COUNT = legacy.GAME_COUNT
PAIR_WORKER_CANDIDATES = formal_contract.PAIR_WORKER_CANDIDATES
MAX_PAIR_WORKERS = formal_contract.MAX_PAIR_WORKERS
NNUE_BYTES = 1_185_988
MAX_PLIES = 512
PAIR_REQUEST_SCHEMA = "shogi-formal-paired-ab-v2-wasm-pair-request-v1"
PAIR_RECEIPT_SCHEMA = "shogi-formal-paired-ab-v2-wasm-pair-receipt-v1"
PAIR_RECEIPT_FILE_SUFFIX = ".receipt.json"
PAIR_ENTRY_PATH = "ml/run-formal-paired-ab-v2-wasm-pair.ts"
OPENINGS_PREFLIGHT_ENTRY_PATH = (
    "ml/run-formal-paired-ab-v2-openings-preflight.ts"
)
NODE_RELATIVE_PATH = ".nvm/versions/node/v22.13.0/bin/node"
WASM_BYTES = 35_597
WASM_SHA256 = "e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c"

_PAIR_RECEIPT_FIELDS = frozenset(
    {
        "schema",
        "status",
        "execution_boundary",
        "request_sha256",
        "pair_index",
        "opening_id",
        "seed",
        "candidate_weights_sha256",
        "stable_weights_sha256",
        "match_binding_sha256",
        "search_contract",
        "schedule",
        "games",
        "summary",
        "cleanup",
        "safety",
        "receipt_sha256",
    }
)
_TRANSCRIPT_FIELDS = frozenset(
    {
        "game_index",
        "game_id",
        "candidate_color",
        "result",
        "termination",
        "plies",
        "moves",
        "move_receipt_sha256s",
        "final_sfen",
        "transcript_sha256",
        "launcher_receipt",
    }
)
_CLEANUP_FIELDS = frozenset(
    {
        "candidate_closed_and_reaped",
        "stable_closed_and_reaped",
        "assets_revalidated_after_games",
        "cleanup_receipt_sha256",
    }
)
_GAME_EVENT_FIELDS = frozenset(
    {
        "game_index",
        "game_id",
        "candidate_color",
        "result",
        "transcript_sha256",
    }
)
_COMPLETION_EVENT_FIELDS = frozenset(
    {
        "games_sha256",
        "pair_receipt_sha256",
        "cleanup_receipt_sha256",
    }
)


class FormalAbV2WasmMatchLauncherError(legacy.FormalAbLocalLauncherError):
    """Fail-closed real WASM pair launcher error."""


class FormalAbV2WasmMatchTechnicalFault(legacy.FormalAbLocalTechnicalFault):
    """A real pair failed after its journal was durably started."""


def _pair_receipt_file_name(pair_index: int) -> str:
    return f"{legacy.PAIR_FILE_PREFIX}{pair_index:03d}" f"{PAIR_RECEIPT_FILE_SUFFIX}"


def _domain_digest(domain: str, payload: Mapping) -> str:
    return legacy._sha256_text(domain + "\0" + legacy._canonical_json(payload))


def _wasm_pair_request(captured: Mapping, pair: Mapping) -> dict:
    if pair["seed"] > (1 << 53) - 1:
        raise FormalAbV2WasmMatchLauncherError(
            "pair seed must be exactly representable by Node"
        )

    def weight_identity(name: str) -> dict:
        identity = captured["assets"][name]
        return {
            "path": identity["path"],
            "bytes": identity["bytes"],
            "sha256": identity["sha256"],
        }

    return {
        "schema": PAIR_REQUEST_SCHEMA,
        "pair_index": pair["pair_index"],
        "opening_id": pair["opening_id"],
        "opening": copy.deepcopy(pair["opening"]),
        "seed": pair["seed"],
        "games": copy.deepcopy(pair["games"]),
        "candidate_weights": weight_identity("candidate_weights"),
        "stable_weights": weight_identity("stable_weights"),
        "match_binding_sha256": captured["match_binding_identity"]["sha256"],
    }


def _validate_pair_receipt(value: Any, captured: Mapping, pair: Mapping) -> dict:
    receipt = legacy._exact_dict(value, _PAIR_RECEIPT_FIELDS, "local WASM pair receipt")
    request = _wasm_pair_request(captured, pair)
    expected_header = {
        "schema": PAIR_RECEIPT_SCHEMA,
        "status": "complete",
        "execution_boundary": "authenticated-content-addressed-local-assets",
        "request_sha256": _domain_digest(
            "shogi-formal-paired-ab-v2-wasm-pair-request-v1", request
        ),
        "pair_index": pair["pair_index"],
        "opening_id": pair["opening_id"],
        "seed": pair["seed"],
        "candidate_weights_sha256": captured["assets"]["candidate_weights"]["sha256"],
        "stable_weights_sha256": captured["assets"]["stable_weights"]["sha256"],
        "match_binding_sha256": captured["match_binding_identity"]["sha256"],
    }
    for key, expected in expected_header.items():
        if type(receipt[key]) is not type(expected) or receipt[key] != expected:
            raise FormalAbV2WasmMatchTechnicalFault(
                f"pair receipt {key} differs from the enrolled request"
            )
    legacy._require_exact_json(
        receipt["search_contract"],
        {
            "engine": "production-browser-wasm-v20",
            "wasm_bytes": WASM_BYTES,
            "wasm_sha256": WASM_SHA256,
            "fixed_depth": 11,
            "quiescence_depth": 10,
            "nnue_scale_k": 600,
            "reset_before_every_move": True,
            "book": False,
            "fallback": "forbidden",
        },
        "local WASM pair receipt.search_contract",
    )
    legacy._require_exact_json(
        receipt["schedule"],
        {
            "pairs": 1,
            "games": 2,
            "games_per_pair": 2,
            "candidate_colors": ["sente", "gote"],
        },
        "local WASM pair receipt.schedule",
    )
    legacy._require_exact_json(
        receipt["safety"],
        {
            "local_only": True,
            "network": False,
            "cloud": False,
            "aws": False,
            "live_weight_write": False,
        },
        "local WASM pair receipt.safety",
    )

    games = receipt["games"]
    if type(games) is not list or len(games) != 2:
        raise FormalAbV2WasmMatchTechnicalFault(
            "pair receipt requires exactly two games"
        )
    captured_games: list[dict] = []
    results: list[str] = []
    transcript_sha256s: list[str] = []
    for game_index, raw_transcript in enumerate(games):
        transcript = legacy._exact_dict(
            raw_transcript,
            _TRANSCRIPT_FIELDS,
            f"local WASM pair receipt.games[{game_index}]",
        )
        planned = pair["games"][game_index]
        for key in ("game_index", "game_id", "candidate_color"):
            if (
                type(transcript[key]) is not type(planned[key])
                or transcript[key] != planned[key]
            ):
                raise FormalAbV2WasmMatchTechnicalFault(
                    "transcript differs from the enrolled game order"
                )
        if transcript["result"] not in ("win", "draw", "loss"):
            raise FormalAbV2WasmMatchTechnicalFault("transcript result is invalid")
        if transcript["termination"] not in (
            "no-legal-moves",
            "fourfold-repetition",
            "perpetual-check",
            "max-plies",
        ):
            raise FormalAbV2WasmMatchTechnicalFault("transcript termination is invalid")
        moves = transcript["moves"]
        move_receipts = transcript["move_receipt_sha256s"]
        plies = transcript["plies"]
        if (
            type(plies) is not int
            or plies < 0
            or plies > MAX_PLIES
            or type(moves) is not list
            or len(moves) != plies
            or any(
                type(move) is not str or legacy._USI_MOVE_RE.fullmatch(move) is None
                for move in moves
            )
            or type(move_receipts) is not list
            or len(move_receipts) != plies
        ):
            raise FormalAbV2WasmMatchTechnicalFault("transcript move vector is invalid")
        for digest in move_receipts:
            legacy._require_exact_sha256(digest, "move receipt SHA-256")
        try:
            final_sfen = legacy._normalized_sfen(
                transcript["final_sfen"],
                f"local WASM pair receipt.games[{game_index}].final_sfen",
            )
        except ValueError as error:
            raise FormalAbV2WasmMatchTechnicalFault(
                "transcript final SFEN is invalid"
            ) from error
        transcript_body = {
            "game_index": transcript["game_index"],
            "game_id": transcript["game_id"],
            "candidate_color": transcript["candidate_color"],
            "result": transcript["result"],
            "termination": transcript["termination"],
            "plies": plies,
            "moves": moves,
            "move_receipt_sha256s": move_receipts,
            "final_sfen": final_sfen,
        }
        transcript_sha256 = _domain_digest(
            "shogi-formal-paired-ab-v2-wasm-game-transcript-v1",
            transcript_body,
        )
        if transcript["transcript_sha256"] != transcript_sha256:
            raise FormalAbV2WasmMatchTechnicalFault("transcript digest differs")
        launcher_receipt = legacy._validate_game_receipt(
            transcript["launcher_receipt"], captured, pair, planned
        )
        if launcher_receipt["result"] != transcript["result"]:
            raise FormalAbV2WasmMatchTechnicalFault(
                "transcript and launcher result differ"
            )
        captured_games.append(dict(transcript))
        results.append(transcript["result"])
        transcript_sha256s.append(transcript_sha256)

    legacy._require_exact_json(
        receipt["summary"],
        {
            "candidate_wins": results.count("win"),
            "draws": results.count("draw"),
            "candidate_losses": results.count("loss"),
            "games": 2,
        },
        "local WASM pair receipt.summary",
    )
    cleanup = legacy._exact_dict(
        receipt["cleanup"], _CLEANUP_FIELDS, "local WASM pair receipt.cleanup"
    )
    cleanup_sha256 = _domain_digest(
        "shogi-formal-paired-ab-v2-wasm-cleanup-v1",
        {
            "candidate_closed_and_reaped": True,
            "stable_closed_and_reaped": True,
            "assets_revalidated_after_games": True,
            "candidate_weights_sha256": expected_header["candidate_weights_sha256"],
            "stable_weights_sha256": expected_header["stable_weights_sha256"],
            "transcript_sha256s": transcript_sha256s,
        },
    )
    legacy._require_exact_json(
        cleanup,
        {
            "candidate_closed_and_reaped": True,
            "stable_closed_and_reaped": True,
            "assets_revalidated_after_games": True,
            "cleanup_receipt_sha256": cleanup_sha256,
        },
        "local WASM pair receipt.cleanup",
    )
    body = {key: receipt[key] for key in receipt if key != "receipt_sha256"}
    if receipt["receipt_sha256"] != _domain_digest(
        "shogi-formal-paired-ab-v2-wasm-pair-receipt-v1", body
    ):
        raise FormalAbV2WasmMatchTechnicalFault("pair receipt digest differs")
    return {**dict(receipt), "games": captured_games}


def _create_runtime_receipt(path: Path, receipt: Mapping) -> str:
    raw = f"{legacy._canonical_json(receipt)}\n".encode("utf-8")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags, 0o600)
    try:
        legacy._validate_pair_journal_descriptor(descriptor)
        legacy._write_all(descriptor, raw, "pair runtime receipt")
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return legacy._sha256_bytes(raw)


def _read_private_file(path: Path, maximum_bytes: int, label: str) -> bytes:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise FormalAbV2WasmMatchLauncherError(
            f"{label} cannot be opened safely"
        ) from error
    try:
        legacy._validate_pair_journal_descriptor(descriptor)
        with os.fdopen(descriptor, "rb", closefd=False) as stream:
            raw = stream.read(maximum_bytes + 1)
    finally:
        os.close(descriptor)
    if len(raw) > maximum_bytes:
        raise FormalAbV2WasmMatchLauncherError(f"{label} is oversized")
    return raw


def _parse_runtime_journal(path: Path, captured: Mapping, pair: Mapping) -> dict:
    raw = _read_private_file(path, 512 * 1024, "pair journal")
    if not raw.endswith(b"\n") or raw.startswith(b"\n"):
        raise FormalAbV2WasmMatchLauncherError("pair journal is not canonical JSONL")
    events: list[dict] = []
    previous_sha256: str | None = None
    for line_index, raw_line in enumerate(raw.splitlines(keepends=True)):
        try:
            event = legacy._strict_json_loads(raw_line[:-1].decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as error:
            raise FormalAbV2WasmMatchLauncherError(
                "pair journal JSON is invalid"
            ) from error
        if legacy._event_bytes(event) != raw_line:
            raise FormalAbV2WasmMatchLauncherError(
                "pair journal is not canonical JSONL"
            )
        common = legacy._common_event(
            captured, pair, event.get("event"), previous_sha256
        )
        for key, expected in common.items():
            if type(event.get(key)) is not type(expected) or event.get(key) != expected:
                raise FormalAbV2WasmMatchLauncherError(
                    f"pair journal event {line_index} binding differs"
                )
        events.append(event)
        previous_sha256 = legacy._sha256_bytes(raw_line)
    if not events or events[0]["event"] != "pair-started":
        raise FormalAbV2WasmMatchLauncherError(
            "pair journal must start with pair-started"
        )
    if any(event["event"] == "technical-fault" for event in events):
        raise FormalAbV2WasmMatchTechnicalFault(
            "pair journal records a terminal technical fault"
        )
    if len(events) != 4 or [event["event"] for event in events] != [
        "pair-started",
        "game-completed",
        "game-completed",
        "pair-completed",
    ]:
        raise FormalAbV2WasmMatchLauncherError(
            "partial pair journal cannot be resumed or replayed"
        )
    start_fields = frozenset(legacy._common_event(captured, pair, "", None))
    if set(events[0]) != start_fields:
        raise FormalAbV2WasmMatchLauncherError(
            "pair-started event fields are not exact"
        )
    games: list[dict] = []
    transcript_sha256s: list[str] = []
    for game_index in (0, 1):
        event = events[game_index + 1]
        planned = pair["games"][game_index]
        if set(event) != start_fields | _GAME_EVENT_FIELDS:
            raise FormalAbV2WasmMatchLauncherError(
                "game-completed event fields are not exact"
            )
        for key in ("game_index", "game_id", "candidate_color"):
            if type(event[key]) is not type(planned[key]) or event[key] != planned[key]:
                raise FormalAbV2WasmMatchLauncherError(
                    "journal game differs from the enrolled order"
                )
        if type(event["result"]) is not str or event["result"] not in (
            "win",
            "draw",
            "loss",
        ):
            raise FormalAbV2WasmMatchLauncherError("journal game result is invalid")
        transcript_sha256s.append(
            legacy._require_exact_sha256(
                event["transcript_sha256"], "journal transcript SHA-256"
            )
        )
        games.append(
            {
                "game_index": planned["game_index"],
                "game_id": planned["game_id"],
                "candidate_color": planned["candidate_color"],
                "result": event["result"],
            }
        )
    completion = events[3]
    if set(completion) != start_fields | _COMPLETION_EVENT_FIELDS:
        raise FormalAbV2WasmMatchLauncherError(
            "pair-completed event fields are not exact"
        )
    if completion["games_sha256"] != legacy._sha256_text(legacy._canonical_json(games)):
        raise FormalAbV2WasmMatchLauncherError("pair-completed games digest differs")
    return {
        "result": {
            "pair_index": pair["pair_index"],
            "opening_id": pair["opening_id"],
            "games": games,
        },
        "pair_receipt_sha256": legacy._require_exact_sha256(
            completion["pair_receipt_sha256"],
            "journal pair receipt SHA-256",
        ),
        "cleanup_receipt_sha256": legacy._require_exact_sha256(
            completion["cleanup_receipt_sha256"],
            "journal cleanup receipt SHA-256",
        ),
        "transcript_sha256s": transcript_sha256s,
    }


def _load_completed_prefix(receipt_dir: Path, captured: Mapping) -> list[dict]:
    journals = {legacy._pair_file_name(index): index for index in range(PAIR_COUNT)}
    receipts = {_pair_receipt_file_name(index): index for index in range(PAIR_COUNT)}
    observed_journals: dict[int, Path] = {}
    observed_receipts: dict[int, Path] = {}
    for entry in receipt_dir.iterdir():
        if entry.name in journals:
            observed_journals[journals[entry.name]] = entry
        elif entry.name in receipts:
            observed_receipts[receipts[entry.name]] = entry
        else:
            raise FormalAbV2WasmMatchLauncherError(
                "receipt directory contains an unknown entry"
            )
    if observed_journals and set(observed_journals) != set(
        range(max(observed_journals) + 1)
    ):
        raise FormalAbV2WasmMatchLauncherError(
            "pair journals must form a contiguous ordered prefix"
        )
    completed: list[dict] = []
    for pair_index in range(len(observed_journals)):
        pair = captured["pairs"][pair_index]
        parsed = _parse_runtime_journal(observed_journals[pair_index], captured, pair)
        receipt_path = observed_receipts.pop(pair_index, None)
        if receipt_path is None:
            raise FormalAbV2WasmMatchLauncherError(
                "pair journal is missing its runtime receipt sidecar"
            )
        raw = _read_private_file(receipt_path, 4 * 1024 * 1024, "pair runtime receipt")
        if (
            not raw.endswith(b"\n")
            or legacy._sha256_bytes(raw) != parsed["pair_receipt_sha256"]
        ):
            raise FormalAbV2WasmMatchLauncherError(
                "pair runtime receipt sidecar identity differs"
            )
        try:
            value = legacy._strict_json_loads(raw[:-1].decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as error:
            raise FormalAbV2WasmMatchLauncherError(
                "pair runtime receipt sidecar JSON is invalid"
            ) from error
        if f"{legacy._canonical_json(value)}\n".encode("utf-8") != raw:
            raise FormalAbV2WasmMatchLauncherError(
                "pair runtime receipt sidecar is not canonical JSON"
            )
        validated = _validate_pair_receipt(value, captured, pair)
        if (
            validated["cleanup"]["cleanup_receipt_sha256"]
            != parsed["cleanup_receipt_sha256"]
            or [game["transcript_sha256"] for game in validated["games"]]
            != parsed["transcript_sha256s"]
        ):
            raise FormalAbV2WasmMatchLauncherError(
                "journal bindings differ from the runtime receipt sidecar"
            )
        completed.append(parsed["result"])
    if observed_receipts:
        raise FormalAbV2WasmMatchLauncherError(
            "receipt directory contains an orphan runtime receipt sidecar"
        )
    return completed


def _run_one_pair(
    captured: Mapping,
    receipt_dir: Path,
    pair: Mapping,
    start_sha256: str,
    execute_pair: Callable[[Mapping], Mapping],
) -> dict:
    journal_path = receipt_dir / legacy._pair_file_name(pair["pair_index"])
    try:
        receipt = _validate_pair_receipt(
            execute_pair(_wasm_pair_request(captured, pair)), captured, pair
        )
        receipt_file_sha256 = _create_runtime_receipt(
            receipt_dir / _pair_receipt_file_name(pair["pair_index"]), receipt
        )
    except Exception as error:
        legacy._append_pair_event(
            journal_path,
            legacy._technical_fault_event(
                captured, pair, pair["games"][0], start_sha256
            ),
        )
        if isinstance(error, FormalAbV2WasmMatchTechnicalFault):
            raise
        raise FormalAbV2WasmMatchTechnicalFault(
            "local WASM pair adapter raised a technical fault"
        ) from error

    previous_sha256 = start_sha256
    games: list[dict] = []
    for game, transcript in zip(pair["games"], receipt["games"], strict=True):
        result = {
            "game_index": game["game_index"],
            "game_id": game["game_id"],
            "candidate_color": game["candidate_color"],
            "result": transcript["result"],
        }
        previous_sha256 = legacy._append_pair_event(
            journal_path,
            {
                **legacy._common_event(
                    captured, pair, "game-completed", previous_sha256
                ),
                **result,
                "transcript_sha256": transcript["transcript_sha256"],
            },
        )
        games.append(result)
    legacy._append_pair_event(
        journal_path,
        {
            **legacy._common_event(captured, pair, "pair-completed", previous_sha256),
            "games_sha256": legacy._sha256_text(legacy._canonical_json(games)),
            "pair_receipt_sha256": receipt_file_sha256,
            "cleanup_receipt_sha256": receipt["cleanup"]["cleanup_receipt_sha256"],
        },
    )
    return {
        "pair_index": pair["pair_index"],
        "opening_id": pair["opening_id"],
        "games": games,
    }


def _run_captured(
    captured: Mapping,
    receipt_directory: str | Path,
    execute_pair: Callable[[Mapping], Mapping],
    recapture: Callable[[], Mapping],
) -> dict:
    attempt_index = captured["registry"]["attempt_index"]
    if type(attempt_index) is not int or attempt_index != 0:
        raise FormalAbV2WasmMatchLauncherError(
            "formal WASM execution is attempt-zero only"
        )
    for pair in captured["pairs"]:
        seed = pair["seed"]
        if (
            type(seed) is not int
            or seed < 1
            or seed > formal_contract.MAX_SAFE_SEED
        ):
            raise FormalAbV2WasmMatchLauncherError(
                "all pair seeds must be integers from 1 through "
                "Number.MAX_SAFE_INTEGER"
            )

    workers = captured["registry"]["pair_workers"]
    if type(workers) is not int or workers not in PAIR_WORKER_CANDIDATES:
        raise FormalAbV2WasmMatchLauncherError(
            "real WASM runner requires a benchmark-eligible 2, 4, 8, or 12 "
            "pair workers"
        )

    receipt_dir = legacy._safe_receipt_directory(receipt_directory, create=True)
    completed = _load_completed_prefix(receipt_dir, captured)

    next_pair = len(completed)
    while next_pair < PAIR_COUNT:
        batch = captured["pairs"][next_pair : next_pair + workers]
        starts: list[tuple[dict, str]] = []
        for pair in batch:
            start_event = legacy._common_event(captured, pair, "pair-started", None)
            start_sha256 = legacy._create_pair_journal(
                receipt_dir / legacy._pair_file_name(pair["pair_index"]),
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
                    execute_pair,
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
            if isinstance(first_error, legacy.FormalAbLocalLauncherError):
                raise first_error
            raise FormalAbV2WasmMatchTechnicalFault(
                "local formal A/B pair batch failed"
            ) from first_error
        for pair, _ in starts:
            completed.append(batch_results[pair["pair_index"]])
        next_pair += len(batch)

    journal_results = _load_completed_prefix(receipt_dir, captured)
    legacy._require_exact_json(journal_results, completed, "completed pair journals")
    result = {
        "schema": legacy.FORMAL_AB_V2_RESULT_SCHEMA,
        "plan": legacy._PLAN_IDENTITY,
        "protocol_amendment_sha256": legacy.FORMAL_AB_V2_AMENDMENT_SHA256,
        "experiment_id": captured["registry"]["experiment_id"],
        "run_id": captured["registry"]["run_id"],
        "attempt_index": captured["registry"]["attempt_index"],
        "attempt_ledger_sha256": captured["attempt_ledger_identity"]["sha256"],
        "rerun_authorization_sha256": (
            None
            if captured["rerun_authorization_identity"] is None
            else captured["rerun_authorization_identity"]["sha256"]
        ),
        "candidate_weights_sha256": captured["assets"]["candidate_weights"]["sha256"],
        "stable_weights_sha256": captured["assets"]["stable_weights"]["sha256"],
        "match_binding_sha256": captured["match_binding_identity"]["sha256"],
        "run_status": "complete",
        "technical_fault_count": 0,
        "pairs": journal_results,
    }
    recaptured = recapture()
    for key in (
        "registry_sha256",
        "attempt_ledger_identity",
        "rerun_authorization_identity",
        "openings_manifest_identity",
        "match_binding_identity",
        "assets",
    ):
        legacy._require_exact_json(
            recaptured[key], captured[key], f"post-run enrollment.{key}"
        )
    legacy.decode_pair_score_units(result)
    return result


def run_ready_wasm_pairs_core_for_tests(
    repo_root: str | Path,
    registry_path: str | Path,
    receipt_directory: str | Path,
    execute_pair: Callable[[Mapping], Mapping],
) -> dict:
    """Test-only injected pair seam using the real journal and v2 decoder."""

    captured = legacy.validate_ready_local_run_registry_core_for_tests(
        repo_root, registry_path
    )
    if not callable(execute_pair):
        raise FormalAbV2WasmMatchLauncherError(
            "local WASM pair adapter is not callable"
        )
    return _run_captured(
        captured,
        receipt_directory,
        execute_pair,
        lambda: legacy.validate_ready_local_run_registry_core_for_tests(
            repo_root, registry_path
        ),
    )


def _execute_pair_subprocess(repo_root: Path, request: Mapping) -> dict:
    node = Path.home() / NODE_RELATIVE_PATH
    entry = repo_root / PAIR_ENTRY_PATH
    try:
        node_metadata = node.stat()
        entry_metadata = entry.stat()
    except OSError as error:
        raise FormalAbV2WasmMatchTechnicalFault(
            "fixed local Node or WASM pair entry is unavailable"
        ) from error
    if (
        not stat.S_ISREG(node_metadata.st_mode)
        or node_metadata.st_uid != os.geteuid()
        or stat.S_IMODE(node_metadata.st_mode) & 0o111 == 0
        or not stat.S_ISREG(entry_metadata.st_mode)
        or entry_metadata.st_uid != os.geteuid()
    ):
        raise FormalAbV2WasmMatchTechnicalFault(
            "fixed local Node or WASM pair entry identity is invalid"
        )
    completed = subprocess.run(
        [
            os.fspath(node),
            "-r",
            "tsx/cjs",
            os.fspath(entry),
        ],
        cwd=repo_root,
        env={"PATH": "/usr/bin:/bin"},
        input=f"{legacy._canonical_json(request)}\n",
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if (
        completed.returncode != 0
        or not completed.stdout.endswith("\n")
        or completed.stdout.startswith("\n")
        or completed.stdout.count("\n") != 1
        or len(completed.stdout.encode("utf-8")) > 4 * 1024 * 1024
    ):
        stderr_bytes = completed.stderr.encode("utf-8")
        raise FormalAbV2WasmMatchTechnicalFault(
            "local WASM pair subprocess reported a technical fault "
            f"(code={completed.returncode}, "
            f"stderr_bytes={len(stderr_bytes)}, "
            f"stderr_sha256={legacy._sha256_bytes(stderr_bytes)})"
        )
    try:
        receipt = legacy._strict_json_loads(completed.stdout[:-1])
    except ValueError as error:
        raise FormalAbV2WasmMatchTechnicalFault(
            "local WASM pair subprocess receipt is invalid"
        ) from error
    if f"{legacy._canonical_json(receipt)}\n" != completed.stdout:
        raise FormalAbV2WasmMatchTechnicalFault(
            "local WASM pair subprocess receipt is not canonical JSON"
        )
    return receipt


def _execute_openings_preflight_subprocess(
    repo_root: Path,
    manifest: Mapping,
) -> dict:
    node = Path.home() / NODE_RELATIVE_PATH
    entry = repo_root / OPENINGS_PREFLIGHT_ENTRY_PATH
    try:
        node_metadata = node.stat()
        entry_metadata = entry.stat()
    except OSError as error:
        raise FormalAbV2WasmMatchLauncherError(
            "fixed local Node or openings preflight entry is unavailable"
        ) from error
    if (
        not stat.S_ISREG(node_metadata.st_mode)
        or node_metadata.st_uid != os.geteuid()
        or stat.S_IMODE(node_metadata.st_mode) & 0o111 == 0
        or not stat.S_ISREG(entry_metadata.st_mode)
        or entry_metadata.st_uid != os.geteuid()
    ):
        raise FormalAbV2WasmMatchLauncherError(
            "fixed local Node or openings preflight entry identity is invalid"
        )
    completed = subprocess.run(
        [
            os.fspath(node),
            "-r",
            "tsx/cjs",
            os.fspath(entry),
        ],
        cwd=repo_root,
        env={"PATH": "/usr/bin:/bin"},
        input=f"{legacy._canonical_json(manifest)}\n",
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if (
        completed.returncode != 0
        or not completed.stdout.endswith("\n")
        or completed.stdout.startswith("\n")
        or completed.stdout.count("\n") != 1
        or len(completed.stdout.encode("utf-8")) > 16 * 1024
    ):
        stderr_bytes = completed.stderr.encode("utf-8")
        raise FormalAbV2WasmMatchLauncherError(
            "local openings preflight subprocess failed "
            f"(code={completed.returncode}, "
            f"stderr_bytes={len(stderr_bytes)}, "
            f"stderr_sha256={legacy._sha256_bytes(stderr_bytes)})"
        )
    try:
        receipt = legacy._strict_json_loads(completed.stdout[:-1])
    except ValueError as error:
        raise FormalAbV2WasmMatchLauncherError(
            "local openings preflight receipt is invalid"
        ) from error
    if f"{legacy._canonical_json(receipt)}\n" != completed.stdout:
        raise FormalAbV2WasmMatchLauncherError(
            "local openings preflight receipt is not canonical JSON"
        )
    return receipt


def preflight_formal_wasm_openings(
    repo_root: str | Path,
    manifest: Mapping,
) -> dict:
    """Apply every opening with production rules before journals may exist."""

    root = Path(repo_root).resolve(strict=True)
    captured_manifest = formal_contract.validate_formal_wasm_openings_manifest(
        manifest
    )
    receipt = formal_contract.validate_formal_wasm_openings_preflight_receipt(
        captured_manifest,
        _execute_openings_preflight_subprocess(root, captured_manifest),
    )
    return {
        "manifest": captured_manifest,
        "preflight_receipt": receipt,
    }


def run_pinned_ready_wasm_pairs(
    repo_root: str | Path,
    receipt_directory: str | Path,
) -> dict:
    """Execute only the one code-pinned reviewed ready registry."""

    root = Path(repo_root).resolve(strict=True)
    captured = legacy.validate_pinned_ready_local_run_registry(root)
    for name in ("candidate_weights", "stable_weights"):
        if captured["assets"][name]["bytes"] != NNUE_BYTES:
            raise FormalAbV2WasmMatchLauncherError(
                f"pinned {name} byte length differs from the WASM layout"
            )
    if captured["assets"]["local_match_adapter"]["path"] != PAIR_ENTRY_PATH:
        raise FormalAbV2WasmMatchLauncherError(
            "pinned local match adapter path differs from the executable entry"
        )
    return _run_captured(
        captured,
        receipt_directory,
        lambda request: _execute_pair_subprocess(root, request),
        lambda: legacy.validate_pinned_ready_local_run_registry(root),
    )
