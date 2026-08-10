#!/usr/bin/env python3
"""Build the fixed 2M legacy arm for the KingPair 10M fast lane.

The source is scanned twice and indexed in a temporary on-disk SQLite table.
Membership is the lowest deterministic SHA-256 priorities over unique semantic
positions, never a source prefix.  Only the final compact rows, JSONL shards,
and one manifest are published.  Every published file uses create-only I/O and
the manifest is written last.
"""

from __future__ import annotations

import argparse
import ast
import copy
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import tempfile
from typing import Callable, Iterator, Mapping, Sequence


DEFAULT_SOURCE = Path(
    "/Users/yudaiyaguchi/.codex/shogi-data/"
    "wcsc36-sealed-training-inputs/runOp1-train.jsonl"
)
EXPECTED_SOURCE_SHA256 = (
    "2207eba555fc0109fe2842ff8f92cb08d42e47893d9aabd863b3f552371a56cb"
)
EXPECTED_SOURCE_BYTES = 800_451_089
EXPECTED_SOURCE_ROWS = 5_892_192
EXPECTED_VALID_ROWS = 5_889_953
EXPECTED_INVALID_SFEN_ROWS = 2_239
TARGET_ROWS = 2_000_000
DEFAULT_SHARD_ROWS = 100_000
PRIORITY_DOMAIN = b"kingpair-10m-fast-legacy-uniform-v1\0"
SEMANTIC_DOMAIN = b"sfen-v1\0"
MANIFEST_SCHEMA = "shogi-kingpair-legacy-2m-manifest-v1"


class LegacyShardError(ValueError):
    """The source or proposed publication violates the fixed legacy arm."""


@dataclass(frozen=True)
class SourcePin:
    sha256: str
    bytes: int
    rows: int
    valid_rows: int
    invalid_sfen_rows: int


REAL_SOURCE_PIN = SourcePin(
    EXPECTED_SOURCE_SHA256,
    EXPECTED_SOURCE_BYTES,
    EXPECTED_SOURCE_ROWS,
    EXPECTED_VALID_ROWS,
    EXPECTED_INVALID_SFEN_ROWS,
)


@dataclass(frozen=True)
class ParsedRow:
    sfen: str
    canonical_sfen: str
    cp: int
    semantic: bytes
    priority: bytes
    payload_sha256: bytes


@dataclass(frozen=True)
class SourceScan:
    sha256: str
    bytes: int
    rows: int
    valid_rows: int
    invalid_sfen_rows: int


def _reject_constant(value: str) -> None:
    raise LegacyShardError(f"non-finite JSON constant {value}")


def _assignment_targets(node: ast.Assign) -> set[str]:
    return {
        target.id
        for target in node.targets
        if isinstance(target, ast.Name)
    }


def load_inventory_validator() -> Callable[[str], str]:
    """Load the audited board/hand parsers without importing their Torch trainer."""

    path = Path(__file__).resolve().parent / "train_bonapiece_halfkp.py"
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    assignment_names = {"HAND_ORDER", "INVENTORY"}
    function_names = {"_parse_board", "_parse_hands"}
    nodes: list[ast.stmt] = []
    found_assignments: set[str] = set()
    found_functions: set[str] = set()
    for node in tree.body:
        if isinstance(node, ast.Assign):
            names = _assignment_targets(node)
            if names & assignment_names:
                nodes.append(copy.deepcopy(node))
                found_assignments.update(names & assignment_names)
        elif isinstance(node, ast.FunctionDef) and node.name in function_names:
            nodes.append(copy.deepcopy(node))
            found_functions.add(node.name)
    if found_assignments != assignment_names or found_functions != function_names:
        raise LegacyShardError("audited SFEN inventory parser contract is unavailable")
    namespace: dict[str, object] = {}
    module = ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[]))
    exec(compile(module, str(path), "exec"), namespace)
    parse_board = namespace["_parse_board"]
    parse_hands = namespace["_parse_hands"]
    inventory = namespace["INVENTORY"]
    if not callable(parse_board) or not callable(parse_hands) or not isinstance(inventory, dict):
        raise LegacyShardError("audited SFEN inventory parser is malformed")

    def validate(sfen: str) -> str:
        if not isinstance(sfen, str):
            raise ValueError("SFEN must be text")
        fields = sfen.split()
        if len(fields) not in (3, 4):
            raise ValueError("SFEN must contain three or four fields")
        board_text, turn_text, hand_text = fields[:3]
        if turn_text not in ("b", "w"):
            raise ValueError("SFEN turn must be 'b' or 'w'")
        if len(fields) == 4 and (
            not fields[3].isdigit() or int(fields[3]) <= 0
        ):
            raise ValueError("SFEN move number must be a positive integer")
        board_pieces, _kings = parse_board(board_text)
        hands = parse_hands(hand_text)
        counts = {kind: 0 for kind in inventory}
        for _owner, inventory_kind, _board_kind, _square in board_pieces:
            counts[inventory_kind] += 1
        hand_keys: set[tuple[bool, str]] = set()
        for owner_black, kind, count in hands:
            key = (owner_black, kind)
            if key in hand_keys:
                raise ValueError(f"SFEN hand repeats {kind} for one color")
            hand_keys.add(key)
            counts[kind] += count
        for kind, maximum in inventory.items():
            if counts[kind] > maximum:
                raise ValueError(f"SFEN has too many {kind} pieces")
        return " ".join(fields[:3])

    return validate


def _semantic_id(canonical_sfen: str) -> bytes:
    return hashlib.sha256(SEMANTIC_DOMAIN + canonical_sfen.encode("utf-8")).digest()


def _selection_priority(semantic: bytes) -> bytes:
    return hashlib.sha256(PRIORITY_DOMAIN + semantic).digest()


def _parse_source_row(
    raw: bytes,
    line_number: int,
    validate_sfen: Callable[[str], str],
) -> ParsedRow | None:
    if not raw.strip():
        raise LegacyShardError(f"line {line_number}: blank JSONL row")
    try:
        decoded = raw.decode("utf-8", errors="strict")
        record = json.loads(decoded, parse_constant=_reject_constant)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise LegacyShardError(f"line {line_number}: invalid strict JSON") from error
    if not isinstance(record, dict):
        raise LegacyShardError(f"line {line_number}: row must be an object")
    cp = record.get("cp")
    ply = record.get("ply")
    depth = record.get("depth")
    bestmove = record.get("bestmove")
    if type(cp) is not int:
        raise LegacyShardError(f"line {line_number}: cp must be an integer")
    if type(ply) is not int or ply < 0:
        raise LegacyShardError(f"line {line_number}: ply must be a non-negative integer")
    if type(depth) is not int or depth < 1:
        raise LegacyShardError(f"line {line_number}: depth must be positive")
    if not isinstance(bestmove, str) or not bestmove or bestmove != bestmove.strip():
        raise LegacyShardError(f"line {line_number}: bestmove must be non-empty")
    sfen = record.get("sfen")
    try:
        canonical_sfen = validate_sfen(sfen)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    semantic = _semantic_id(canonical_sfen)
    payload = canonical_sfen.encode("utf-8") + b"\0" + str(cp).encode("ascii")
    return ParsedRow(
        sfen=sfen,  # type: ignore[arg-type]
        canonical_sfen=canonical_sfen,
        cp=cp,
        semantic=semantic,
        priority=_selection_priority(semantic),
        payload_sha256=hashlib.sha256(payload).digest(),
    )


def _scan_source(
    source: Path,
    validate_sfen: Callable[[str], str],
    consume: Callable[[ParsedRow, int], None] | None = None,
) -> SourceScan:
    digest = hashlib.sha256()
    byte_count = 0
    rows = 0
    valid_rows = 0
    invalid_sfen_rows = 0
    with source.open("rb") as stream:
        for line_number, raw in enumerate(stream, 1):
            rows = line_number
            digest.update(raw)
            byte_count += len(raw)
            parsed = _parse_source_row(raw, line_number, validate_sfen)
            if parsed is None:
                invalid_sfen_rows += 1
                continue
            valid_rows += 1
            if consume is not None:
                consume(parsed, line_number)
    return SourceScan(
        digest.hexdigest(), byte_count, rows, valid_rows, invalid_sfen_rows
    )


def _verify_pin(scan: SourceScan, pin: SourcePin, label: str) -> None:
    if scan != SourceScan(
        pin.sha256,
        pin.bytes,
        pin.rows,
        pin.valid_rows,
        pin.invalid_sfen_rows,
    ):
        raise LegacyShardError(f"{label} does not match the pinned runOp1 identity")


def _configure_index(connection: sqlite3.Connection) -> None:
    connection.execute("PRAGMA journal_mode=OFF")
    connection.execute("PRAGMA synchronous=OFF")
    connection.execute("PRAGMA temp_store=FILE")
    connection.execute("PRAGMA cache_size=-32768")
    connection.execute(
        """
        CREATE TABLE candidates (
          semantic BLOB PRIMARY KEY,
          priority BLOB NOT NULL,
          first_line INTEGER NOT NULL,
          payload_sha256 BLOB NOT NULL,
          duplicate_rows INTEGER NOT NULL DEFAULT 0,
          conflicted INTEGER NOT NULL DEFAULT 0
        ) WITHOUT ROWID
        """
    )


def _index_row(connection: sqlite3.Connection, row: ParsedRow, line_number: int) -> None:
    connection.execute(
        """
        INSERT INTO candidates
          (semantic, priority, first_line, payload_sha256)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(semantic) DO UPDATE SET
          duplicate_rows = candidates.duplicate_rows + 1,
          conflicted = MAX(
            candidates.conflicted,
            candidates.payload_sha256 != excluded.payload_sha256
          )
        """,
        (row.semantic, row.priority, line_number, row.payload_sha256),
    )


def _freeze_selection(
    connection: sqlite3.Connection, target_rows: int
) -> dict[str, object]:
    connection.commit()
    connection.execute(
        "CREATE INDEX candidates_priority ON candidates(conflicted, priority, semantic)"
    )
    unique_positions, duplicate_rows, conflicted_positions = connection.execute(
        """
        SELECT COUNT(*), COALESCE(SUM(duplicate_rows), 0), COALESCE(SUM(conflicted), 0)
        FROM candidates
        """
    ).fetchone()
    eligible = connection.execute(
        "SELECT COUNT(*) FROM candidates WHERE conflicted = 0"
    ).fetchone()[0]
    if eligible < target_rows:
        raise LegacyShardError(
            f"only {eligible} unique non-conflicting rows remain; need {target_rows}"
        )
    connection.execute(
        """
        CREATE TABLE selected (
          semantic BLOB PRIMARY KEY,
          first_line INTEGER NOT NULL UNIQUE
        ) WITHOUT ROWID
        """
    )
    connection.execute(
        """
        INSERT INTO selected (semantic, first_line)
        SELECT semantic, first_line
        FROM candidates
        WHERE conflicted = 0
        ORDER BY priority, semantic
        LIMIT ?
        """,
        (target_rows,),
    )
    selected = connection.execute("SELECT COUNT(*) FROM selected").fetchone()[0]
    if selected != target_rows:
        raise LegacyShardError("SQLite selection did not produce the exact target")
    digest = hashlib.sha256()
    maximum_priority = None
    for semantic, priority in connection.execute(
        """
        SELECT selected.semantic, candidates.priority
        FROM selected JOIN candidates USING (semantic)
        ORDER BY candidates.priority, selected.semantic
        """
    ):
        digest.update(semantic.hex().encode("ascii") + b"\n")
        maximum_priority = priority.hex()
    connection.commit()
    return {
        "valid_rows": int(unique_positions + duplicate_rows),
        "unique_semantic_positions": int(unique_positions),
        "duplicate_rows_removed": int(duplicate_rows),
        "conflicting_semantic_positions_removed": int(conflicted_positions),
        "eligible_unique_semantic_positions": int(eligible),
        "selected_rows": int(selected),
        "selected_semantic_ids_sha256": digest.hexdigest(),
        "maximum_selected_priority_sha256": maximum_priority,
    }


class _ShardWriter:
    def __init__(self, output_root: Path, target_rows: int, shard_rows: int) -> None:
        self.output_root = output_root
        self.target_rows = target_rows
        self.shard_rows = shard_rows
        self.shard_count = math.ceil(target_rows / shard_rows)
        self.index = -1
        self.current = None
        self.current_digest = None
        self.current_bytes = 0
        self.current_rows = 0
        self.total_rows = 0
        self.shards: list[dict[str, object]] = []

    def _open_next(self) -> None:
        self.close_current()
        self.index += 1
        name = (
            f"legacy-{self.index:05d}-of-{self.shard_count:05d}.jsonl"
        )
        self.current = (self.output_root / name).open("xb")
        self.current_digest = hashlib.sha256()
        self.current_bytes = 0
        self.current_rows = 0

    def write(self, row: Mapping[str, object]) -> None:
        if self.current is None or self.current_rows == self.shard_rows:
            self._open_next()
        raw = (
            json.dumps(row, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
            + "\n"
        ).encode("utf-8")
        self.current.write(raw)
        self.current_digest.update(raw)
        self.current_bytes += len(raw)
        self.current_rows += 1
        self.total_rows += 1

    def close_current(self) -> None:
        if self.current is None:
            return
        self.current.flush()
        os.fsync(self.current.fileno())
        name = Path(self.current.name).name
        self.current.close()
        self.shards.append(
            {
                "name": name,
                "rows": self.current_rows,
                "bytes": self.current_bytes,
                "sha256": self.current_digest.hexdigest(),
            }
        )
        self.current = None
        self.current_digest = None

    def finish(self) -> list[dict[str, object]]:
        self.close_current()
        if self.total_rows != self.target_rows or len(self.shards) != self.shard_count:
            raise LegacyShardError("shard writer did not emit the exact fixed arm")
        return self.shards


def _write_manifest(path: Path, manifest: Mapping[str, object]) -> None:
    raw = (
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")
    with path.open("xb") as target:
        target.write(raw)
        target.flush()
        os.fsync(target.fileno())
    descriptor = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def build_legacy_shards(
    source: Path,
    output_root: Path,
    *,
    pin: SourcePin = REAL_SOURCE_PIN,
    target_rows: int = TARGET_ROWS,
    shard_rows: int = DEFAULT_SHARD_ROWS,
) -> dict[str, object]:
    """Build one immutable compact arm. Tests may inject only source-size pins."""

    if type(target_rows) is not int or target_rows <= 0:
        raise LegacyShardError("target_rows must be a positive integer")
    if type(shard_rows) is not int or shard_rows <= 0:
        raise LegacyShardError("shard_rows must be a positive integer")
    if output_root.exists():
        raise LegacyShardError("output root is create-only")
    if not source.is_file():
        raise LegacyShardError("source must be a regular file")
    validate_sfen = load_inventory_validator()

    with tempfile.TemporaryDirectory(prefix="kingpair-legacy-index-") as directory:
        connection = sqlite3.connect(str(Path(directory) / "selection.sqlite3"))
        try:
            _configure_index(connection)
            first_scan = _scan_source(
                source,
                validate_sfen,
                lambda row, line: _index_row(connection, row, line),
            )
            _verify_pin(first_scan, pin, "first source pass")
            selection = _freeze_selection(connection, target_rows)
            if selection["valid_rows"] != pin.valid_rows:
                raise LegacyShardError("semantic index valid-row accounting drifted")

            output_root.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            output_root.mkdir(mode=0o700)
            writer = _ShardWriter(output_root, target_rows, shard_rows)
            selected_lines: Iterator[tuple[int]] = iter(
                connection.execute("SELECT first_line FROM selected ORDER BY first_line")
            )
            next_selected = next(selected_lines, None)

            def emit_if_selected(row: ParsedRow, line_number: int) -> None:
                nonlocal next_selected
                if next_selected is None or line_number != next_selected[0]:
                    return
                writer.write(
                    {
                        "cp": row.cp,
                        "semantic_position_id": f"sha256:{row.semantic.hex()}",
                        "sfen": row.sfen,
                    }
                )
                next_selected = next(selected_lines, None)

            try:
                second_scan = _scan_source(source, validate_sfen, emit_if_selected)
            finally:
                writer.close_current()
            _verify_pin(second_scan, pin, "second source pass")
            if second_scan != first_scan or next_selected is not None:
                raise LegacyShardError("source changed or selected lines disappeared")
            shards = writer.finish()
        finally:
            connection.close()

    manifest: dict[str, object] = {
        "schema": MANIFEST_SCHEMA,
        "status": "complete",
        "source": {
            "path": str(source),
            "bytes": pin.bytes,
            "sha256": pin.sha256,
            "rows": pin.rows,
            "valid_rows": pin.valid_rows,
            "quarantined_invalid_sfen_rows": pin.invalid_sfen_rows,
        },
        "selection": {
            "algorithm": "lowest-sha256-over-unique-semantic-position-v1",
            "priority_domain": PRIORITY_DOMAIN[:-1].decode("ascii"),
            "source_order_does_not_select_membership": True,
            "target_rows": target_rows,
            **selection,
        },
        "format": {
            "kind": "compact-streaming-jsonl",
            "row_fields": ["cp", "semantic_position_id", "sfen"],
            "output_order": "source-line-order-after-hash-membership",
            "shard_rows": shard_rows,
            "shard_count": len(shards),
        },
        "shards": shards,
    }
    _write_manifest(output_root / "manifest.json", manifest)
    return manifest


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--shard-rows", type=int, default=DEFAULT_SHARD_ROWS)
    args = parser.parse_args(argv)
    try:
        manifest = build_legacy_shards(
            args.source,
            args.output_root,
            shard_rows=args.shard_rows,
        )
    except (LegacyShardError, OSError, sqlite3.Error) as error:
        print(json.dumps({"status": "error", "error": str(error)}, sort_keys=True))
        return 1
    print(
        json.dumps(
            {
                "status": manifest["status"],
                "selected_rows": manifest["selection"]["selected_rows"],
                "shard_count": manifest["format"]["shard_count"],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
