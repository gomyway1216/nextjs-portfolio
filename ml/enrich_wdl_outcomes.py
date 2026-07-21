#!/usr/bin/env python3
"""Stream a teacher JSONL into a side-to-move WDL-enriched JSONL.

The join key is the authenticated CSA body SHA-256. Every referenced object is
checked against the raw-lock index before its terminal result is used. The
tool never mutates an input row in place and never overwrites an output.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import math
import os
from pathlib import Path
import re
import tempfile
from typing import BinaryIO


SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
CSA_MOVE_RE = re.compile(
    r"^[+-][0-9]{4}(?:FU|KY|KE|GI|KI|KA|HI|OU|TO|NY|NK|NG|UM|RY)$"
)
SUPPORTED_TERMINALS = frozenset(("TORYO", "SENNICHITE", "KACHI", "TIME_UP"))
TEACHER_SCHEMA = "shogi-floodgate-scratch-warm-teacher-v1"
SPLITS = frozenset(("train", "val", "test"))


def _reject_duplicate_pairs(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"duplicate JSON object key: {key!r}")
        value[key] = item
    return value


def strict_json_loads(raw: bytes | str, context: str):
    try:
        value = json.loads(
            raw,
            object_pairs_hook=_reject_duplicate_pairs,
            parse_constant=lambda value: (_ for _ in ()).throw(
                ValueError(f"non-finite JSON number: {value}")
            ),
        )
    except (UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError) as error:
        raise ValueError(f"{context}: invalid strict JSON: {error}") from error
    _reject_nonfinite_numbers(value, context)
    return value


def _reject_nonfinite_numbers(value, context: str) -> None:
    if type(value) is float and not math.isfinite(value):
        raise ValueError(f"{context}: non-finite JSON number")
    if type(value) is dict:
        for key, child in value.items():
            _reject_nonfinite_numbers(child, f"{context}.{key}")
    elif type(value) is list:
        for index, child in enumerate(value):
            _reject_nonfinite_numbers(child, f"{context}[{index}]")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def dataset_game_id_from_sha256(game_sha256: str) -> str:
    """Reproduce import-csa-games.ts's Floodgate dataset identity domain."""
    if type(game_sha256) is not str or SHA256_RE.fullmatch(game_sha256) is None:
        raise ValueError("game_sha256 is invalid")
    payload = b"floodgate-game-v1\0" + game_sha256.encode("ascii")
    return f"sha256:{sha256_bytes(payload)}"


def file_identity(path: str) -> dict[str, object]:
    digest = hashlib.sha256()
    byte_count = 0
    with open(path, "rb") as source:
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            byte_count += len(chunk)
    return {
        "path": os.path.abspath(path),
        "bytes": byte_count,
        "sha256": digest.hexdigest(),
    }


def parse_csa_game_result(raw: bytes) -> tuple[str, str | None]:
    """Return ``(terminal, winner)`` where winner is ``b``, ``w`` or draw."""
    try:
        decoded = raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise ValueError("CSA object is not valid UTF-8") from error
    if decoded.startswith("\ufeff"):
        raise ValueError("CSA object must not contain a UTF-8 BOM")
    if "\0" in decoded:
        raise ValueError("CSA object must not contain NUL")
    text = decoded.replace("\r\n", "\n")
    if "\r" in text:
        raise ValueError("CSA object contains a bare CR")

    initial_side = None
    next_side = None
    move_count = 0
    terminal = None
    for raw_line in text.split("\n"):
        whole_line = raw_line.strip()
        if not whole_line or whole_line.startswith("'"):
            continue
        for raw_statement in raw_line.split(","):
            statement = raw_statement.strip()
            if not statement:
                continue
            if statement.startswith("%"):
                terminal = statement[1:].strip()
                if terminal not in SUPPORTED_TERMINALS:
                    raise ValueError(f"unsupported CSA terminal: {terminal!r}")
                break
            if statement in ("+", "-"):
                if initial_side is not None or move_count:
                    raise ValueError("duplicate or misplaced CSA initial side")
                initial_side = "b" if statement == "+" else "w"
                next_side = initial_side
                continue
            if CSA_MOVE_RE.fullmatch(statement):
                if next_side is None:
                    raise ValueError("CSA move appeared before the initial side")
                move_side = "b" if statement[0] == "+" else "w"
                if move_side != next_side:
                    raise ValueError("CSA move side does not alternate")
                move_count += 1
                next_side = "w" if next_side == "b" else "b"
        if terminal is not None:
            break

    if initial_side is None:
        raise ValueError("CSA record has no initial side")
    if move_count == 0:
        raise ValueError("CSA record has no played moves")
    if terminal is None or next_side is None:
        raise ValueError("CSA record has no supported terminal")
    if terminal == "SENNICHITE":
        return terminal, None
    if terminal == "KACHI":
        return terminal, next_side
    # Resignation and timeout are reported by the side whose turn it is.
    return terminal, "w" if next_side == "b" else "b"


def outcome_for_side(winner: str | None, side_to_move: str) -> float:
    if side_to_move not in ("b", "w"):
        raise ValueError(f"invalid SFEN side to move: {side_to_move!r}")
    if winner is None:
        return 0.5
    return 1.0 if winner == side_to_move else 0.0


def _require_exact_int(value, context: str, *, positive: bool = False) -> int:
    if type(value) is not int or (positive and value <= 0):
        qualifier = "positive " if positive else ""
        raise ValueError(f"{context} must be a {qualifier}integer")
    return value


def load_raw_index(manifest_path: str, raw_root: str):
    manifest_bytes = Path(manifest_path).read_bytes()
    manifest = strict_json_loads(manifest_bytes, manifest_path)
    if type(manifest) is not dict or type(manifest.get("csa_index")) is not list:
        raise ValueError("raw-lock manifest must contain a csa_index array")

    root = os.path.realpath(raw_root)
    if not os.path.isdir(root):
        raise ValueError(f"raw-lock root is not a directory: {raw_root}")
    by_sha = {}
    for index, raw_entry in enumerate(manifest["csa_index"]):
        context = f"csa_index[{index}]"
        if type(raw_entry) is not dict:
            raise ValueError(f"{context} must be an object")
        digest = raw_entry.get("sha256")
        if type(digest) is not str or SHA256_RE.fullmatch(digest) is None:
            raise ValueError(f"{context}.sha256 is invalid")
        if digest in by_sha:
            raise ValueError(f"ambiguous/colliding csa_index SHA-256: {digest}")
        object_name = raw_entry.get("object")
        game_id = raw_entry.get("game_id")
        if type(object_name) is not str or not object_name:
            raise ValueError(f"{context}.object is invalid")
        if type(game_id) is not str or not game_id:
            raise ValueError(f"{context}.game_id is invalid")
        byte_count = _require_exact_int(
            raw_entry.get("bytes"), f"{context}.bytes", positive=True
        )
        object_path = os.path.realpath(os.path.join(root, object_name))
        try:
            contained = os.path.commonpath((root, object_path)) == root
        except ValueError:
            contained = False
        if not contained or object_path == root:
            raise ValueError(f"{context}.object escapes the raw-lock root")
        by_sha[digest] = {
            "bytes": byte_count,
            "game_id": game_id,
            "object": object_name,
            "path": object_path,
            "sha256": digest,
        }
    return by_sha, {
        "path": os.path.abspath(manifest_path),
        "root": root,
        "bytes": len(manifest_bytes),
        "sha256": sha256_bytes(manifest_bytes),
        "csa_index_rows": len(by_sha),
    }


def _read_verified_object(entry: dict[str, object]) -> bytes:
    path = str(entry["path"])
    try:
        raw = Path(path).read_bytes()
    except OSError as error:
        raise ValueError(f"cannot read raw-lock CSA object: {entry['object']}") from error
    if len(raw) != entry["bytes"] or sha256_bytes(raw) != entry["sha256"]:
        raise ValueError(f"raw-lock CSA object identity mismatch: {entry['object']}")
    return raw


def _temporary_binary(path: str) -> tuple[BinaryIO, str]:
    directory = os.path.dirname(os.path.abspath(path))
    if not os.path.isdir(directory):
        raise ValueError(f"output directory does not exist: {directory}")
    descriptor, temporary = tempfile.mkstemp(
        prefix=f".{os.path.basename(path)}.", suffix=".tmp", dir=directory
    )
    return os.fdopen(descriptor, "wb"), temporary


def _publish_noreplace(temporary: str, target: str) -> None:
    absolute = os.path.abspath(target)
    try:
        os.link(temporary, absolute)
    except FileExistsError as error:
        raise ValueError(f"refusing to overwrite existing output: {absolute}") from error
    os.unlink(temporary)
    directory_descriptor = os.open(os.path.dirname(absolute), os.O_RDONLY)
    try:
        os.fsync(directory_descriptor)
    finally:
        os.close(directory_descriptor)


def _rollback_published_file(path: str, identity: tuple[int, int]) -> None:
    """Remove only the inode this invocation published, never a replacement."""
    try:
        observed = os.stat(path, follow_symlinks=False)
    except FileNotFoundError:
        return
    if (observed.st_dev, observed.st_ino) != identity:
        raise ValueError(f"cannot roll back replaced output safely: {path}")
    os.unlink(path)
    directory_descriptor = os.open(os.path.dirname(os.path.abspath(path)), os.O_RDONLY)
    try:
        os.fsync(directory_descriptor)
    finally:
        os.close(directory_descriptor)


def _check_path_isolation(paths: dict[str, str]) -> None:
    items = list(paths.items())
    for index, (label, path) in enumerate(items):
        absolute = os.path.realpath(os.path.abspath(path))
        for other_label, other_path in items[:index]:
            other_absolute = os.path.realpath(os.path.abspath(other_path))
            if absolute == other_absolute:
                raise ValueError(f"{label} aliases {other_label}: {path}")


def enrich_dataset(
    input_path: str,
    raw_manifest_path: str,
    raw_root: str,
    output_path: str,
    output_manifest_path: str,
) -> dict[str, object]:
    """Validate, stream, enrich, and atomically publish a new dataset."""
    _check_path_isolation(
        {
            "input": input_path,
            "raw manifest": raw_manifest_path,
            "output": output_path,
            "output manifest": output_manifest_path,
        }
    )
    raw_index, raw_manifest_identity = load_raw_index(raw_manifest_path, raw_root)
    if os.path.lexists(output_path) or os.path.lexists(output_manifest_path):
        raise ValueError("refusing to overwrite an existing output or output manifest")

    input_digest = hashlib.sha256()
    output_digest = hashlib.sha256()
    input_bytes = 0
    output_bytes = 0
    rows = 0
    split_rows = Counter()
    row_outcomes = Counter()
    terminal_rows = Counter()
    terminal_games = Counter()
    absolute_game_results = Counter()
    game_cache: dict[str, tuple[str, str | None]] = {}
    used_object_bytes = 0
    output_file = None
    output_temporary = None
    manifest_temporary = None
    try:
        output_file, output_temporary = _temporary_binary(output_path)
        with open(input_path, "rb") as source:
            for line_number, raw_line in enumerate(source, start=1):
                input_digest.update(raw_line)
                input_bytes += len(raw_line)
                if not raw_line.strip():
                    raise ValueError(f"input line {line_number}: blank row is forbidden")
                row = strict_json_loads(raw_line, f"input line {line_number}")
                if type(row) is not dict:
                    raise ValueError(f"input line {line_number}: row must be an object")
                if row.get("schema") != TEACHER_SCHEMA:
                    raise ValueError(
                        f"input line {line_number}: expected {TEACHER_SCHEMA!r} schema"
                    )
                if "outcome" in row:
                    raise ValueError(
                        f"input line {line_number}: outcome already exists; refusing to overwrite"
                    )
                digest = row.get("game_sha256")
                if type(digest) is not str or SHA256_RE.fullmatch(digest) is None:
                    raise ValueError(f"input line {line_number}: game_sha256 is invalid")
                entry = raw_index.get(digest)
                if entry is None:
                    raise ValueError(
                        f"input line {line_number}: game_sha256 is absent from csa_index"
                    )
                expected_dataset_game_id = dataset_game_id_from_sha256(digest)
                if row.get("game_id") != expected_dataset_game_id:
                    raise ValueError(
                        f"input line {line_number}: game_id differs from the "
                        "floodgate-game-v1 identity derived from game_sha256"
                    )
                split = row.get("split")
                if split not in SPLITS:
                    raise ValueError(f"input line {line_number}: split is invalid")
                sfen = row.get("sfen")
                if type(sfen) is not str:
                    raise ValueError(f"input line {line_number}: sfen is missing")
                sfen_fields = sfen.strip().split()
                if len(sfen_fields) != 4 or sfen_fields[1] not in ("b", "w"):
                    raise ValueError(f"input line {line_number}: invalid SFEN side to move")
                side_to_move = sfen_fields[1]
                if "side_to_move" in row and row["side_to_move"] != side_to_move:
                    raise ValueError(
                        f"input line {line_number}: side_to_move differs from SFEN"
                    )

                if digest not in game_cache:
                    raw_csa = _read_verified_object(entry)
                    terminal, winner = parse_csa_game_result(raw_csa)
                    game_cache[digest] = (terminal, winner)
                    used_object_bytes += len(raw_csa)
                    terminal_games[terminal] += 1
                    absolute_game_results[
                        "draw" if winner is None else f"{winner}_win"
                    ] += 1
                terminal, winner = game_cache[digest]
                outcome = outcome_for_side(winner, side_to_move)
                row["outcome"] = outcome
                encoded = (
                    json.dumps(
                        row,
                        ensure_ascii=False,
                        separators=(",", ":"),
                        allow_nan=False,
                    )
                    + "\n"
                ).encode("utf-8")
                output_file.write(encoded)
                output_digest.update(encoded)
                output_bytes += len(encoded)
                rows += 1
                split_rows[split] += 1
                row_outcomes[{0.0: "loss", 0.5: "draw", 1.0: "win"}[outcome]] += 1
                terminal_rows[terminal] += 1
        if rows == 0:
            raise ValueError("input dataset has no rows")
        observed_input_identity = file_identity(input_path)
        if (
            observed_input_identity["bytes"] != input_bytes
            or observed_input_identity["sha256"] != input_digest.hexdigest()
        ):
            raise ValueError("input dataset changed while it was being enriched")
        output_file.flush()
        os.fsync(output_file.fileno())
        output_file.close()
        output_file = None

        manifest = {
            "schema": "shogi-teacher-wdl-enrichment-v1",
            "contract": {
                "input_schema": TEACHER_SCHEMA,
                "join_key": "teacher.game_sha256 == raw_lock.csa_index.sha256",
                "game_identity": (
                    "teacher.game_id == 'sha256:' + "
                    "sha256('floodgate-game-v1\\0' + teacher.game_sha256)"
                ),
                "target_field": "outcome",
                "target_perspective": "sfen_side_to_move",
                "target_values": {"loss": 0.0, "draw": 0.5, "win": 1.0},
                "terminal_policy": {
                    "TORYO": "side_to_move_loses",
                    "TIME_UP": "side_to_move_loses",
                    "KACHI": "side_to_move_wins",
                    "SENNICHITE": "draw",
                },
            },
            "input": {
                "path": os.path.abspath(input_path),
                "bytes": input_bytes,
                "sha256": input_digest.hexdigest(),
                "rows": rows,
            },
            "raw_lock": raw_manifest_identity,
            "output": {
                "path": os.path.abspath(output_path),
                "bytes": output_bytes,
                "sha256": output_digest.hexdigest(),
                "rows": rows,
            },
            "counts": {
                "unique_games": len(game_cache),
                "verified_csa_object_bytes": used_object_bytes,
                "split_rows": dict(sorted(split_rows.items())),
                "row_outcomes": dict(sorted(row_outcomes.items())),
                "terminal_rows": dict(sorted(terminal_rows.items())),
                "terminal_games": dict(sorted(terminal_games.items())),
                "absolute_game_results": dict(sorted(absolute_game_results.items())),
                "missing_joins": 0,
                "ambiguous_or_colliding_index_rows": 0,
                "game_id_mismatches": 0,
            },
        }
        manifest_bytes = (
            json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
        ).encode("utf-8")
        manifest_file, manifest_temporary = _temporary_binary(output_manifest_path)
        try:
            manifest_file.write(manifest_bytes)
            manifest_file.flush()
            os.fsync(manifest_file.fileno())
        finally:
            manifest_file.close()

        output_stat = os.stat(output_temporary, follow_symlinks=False)
        output_identity = (output_stat.st_dev, output_stat.st_ino)
        _publish_noreplace(output_temporary, output_path)
        output_temporary = None
        try:
            _publish_noreplace(manifest_temporary, output_manifest_path)
            manifest_temporary = None
        except Exception:
            _rollback_published_file(output_path, output_identity)
            raise
        return manifest
    finally:
        if output_file is not None:
            output_file.close()
        for temporary in (output_temporary, manifest_temporary):
            if temporary is not None:
                try:
                    os.unlink(temporary)
                except FileNotFoundError:
                    pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="teacher JSONL to enrich")
    parser.add_argument(
        "--raw-lock-manifest", required=True, help="authenticated raw-lock manifest JSON"
    )
    parser.add_argument(
        "--raw-lock-root",
        required=True,
        help="directory against which csa_index object paths are resolved",
    )
    parser.add_argument("--output", required=True, help="new WDL-enriched JSONL")
    parser.add_argument(
        "--manifest-out", required=True, help="new enrichment evidence manifest JSON"
    )
    args = parser.parse_args()
    try:
        result = enrich_dataset(
            args.input,
            args.raw_lock_manifest,
            args.raw_lock_root,
            args.output,
            args.manifest_out,
        )
    except (OSError, ValueError) as error:
        raise SystemExit(f"[enrich-wdl] rejected: {error}") from error
    print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
