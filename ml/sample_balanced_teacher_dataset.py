#!/usr/bin/env python3
"""Create one deterministic side-balanced subset of a depth-12 teacher JSONL.

The sampler keeps the rows with the smallest domain-separated SHA-256 ranks
for each side to move.  It validates the complete source before publishing,
never overwrites an artifact, and emits a manifest binding both identities.
"""

from __future__ import annotations

import argparse
import hashlib
import heapq
import json
import math
import os
from pathlib import Path
import re
import tempfile
from typing import Any


SCHEMA = "shogi-balanced-strong-teacher-sample-v1"
TEACHER_SCHEMA = "shogi-floodgate-scratch-warm-teacher-v1"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
POSITION_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
SPLITS = frozenset(("train", "val", "test"))
SIDES = ("b", "w")
DOMAIN = b"shogi-balanced-strong-teacher-sample-v1\0"


def _reject_duplicate_pairs(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"duplicate JSON object key: {key!r}")
        value[key] = item
    return value


def _reject_nonfinite(value: Any, context: str) -> None:
    if type(value) is float and not math.isfinite(value):
        raise ValueError(f"{context}: non-finite JSON number")
    if type(value) is dict:
        for key, child in value.items():
            _reject_nonfinite(child, f"{context}.{key}")
    elif type(value) is list:
        for index, child in enumerate(value):
            _reject_nonfinite(child, f"{context}[{index}]")


def strict_json_loads(raw: bytes, context: str):
    try:
        value = json.loads(
            raw,
            object_pairs_hook=_reject_duplicate_pairs,
            parse_constant=lambda token: (_ for _ in ()).throw(
                ValueError(f"non-finite JSON number: {token}")
            ),
        )
    except (UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError) as error:
        raise ValueError(f"{context}: invalid strict JSON: {error}") from error
    _reject_nonfinite(value, context)
    return value


def file_identity(path: str) -> dict[str, object]:
    digest = hashlib.sha256()
    byte_count = 0
    with open(path, "rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
            byte_count += len(chunk)
    return {
        "path": os.path.abspath(path),
        "bytes": byte_count,
        "sha256": digest.hexdigest(),
    }


def _validate_row(row: object, expected_split: str, line_number: int) -> tuple[str, str]:
    context = f"line {line_number}"
    if type(row) is not dict:
        raise ValueError(f"{context}: row must be an object")
    if row.get("schema") != TEACHER_SCHEMA:
        raise ValueError(f"{context}: teacher schema mismatch")
    if row.get("split") != expected_split:
        raise ValueError(f"{context}: split must be {expected_split}")
    position_id = row.get("position_id")
    if type(position_id) is not str or POSITION_ID_RE.fullmatch(position_id) is None:
        raise ValueError(f"{context}: position_id must be a lowercase SHA-256 identity")
    sfen = row.get("sfen")
    if type(sfen) is not str:
        raise ValueError(f"{context}: sfen must be text")
    fields = sfen.split()
    if len(fields) != 4 or fields[1] not in SIDES:
        raise ValueError(f"{context}: sfen side-to-move must be b or w")
    if type(row.get("cp")) is not int:
        raise ValueError(f"{context}: cp must be an integer")
    if row.get("depth") != 12:
        raise ValueError(f"{context}: depth must be exactly 12")
    return position_id, fields[1]


def _sample_rank(seed: str, position_id: str) -> int:
    payload = DOMAIN + seed.encode("utf-8") + b"\0" + position_id.encode("ascii")
    return int.from_bytes(hashlib.sha256(payload).digest(), "big")


def _publish_new(path: str, raw: bytes) -> None:
    destination = Path(path)
    if destination.exists():
        raise ValueError(f"refusing to overwrite existing artifact: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(
        prefix=f".{destination.name}.", dir=destination.parent
    )
    try:
        with os.fdopen(descriptor, "wb") as target:
            target.write(raw)
            target.flush()
            os.fsync(target.fileno())
        try:
            os.link(temporary, destination)
        except FileExistsError as error:
            raise ValueError(
                f"refusing to overwrite existing artifact: {destination}"
            ) from error
        os.unlink(temporary)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def sample_balanced_teacher_dataset(
    input_path: str,
    output_path: str,
    manifest_path: str,
    *,
    expected_input_sha256: str,
    expected_split: str,
    per_side: int,
    seed: str,
) -> dict[str, object]:
    if SHA256_RE.fullmatch(expected_input_sha256) is None:
        raise ValueError("expected input SHA-256 must be lowercase hexadecimal")
    if expected_split not in SPLITS:
        raise ValueError("expected split must be train, val, or test")
    if type(per_side) is not int or per_side < 1:
        raise ValueError("per-side count must be a positive integer")
    if type(seed) is not str or not seed or seed.strip() != seed or "\0" in seed:
        raise ValueError("seed must be non-empty canonical text")
    if Path(output_path).exists() or Path(manifest_path).exists():
        raise ValueError("refusing to overwrite an existing output or manifest")

    digest = hashlib.sha256()
    byte_count = 0
    rows = 0
    available = {side: 0 for side in SIDES}
    heaps: dict[str, list[tuple[int, str, bytes]]] = {side: [] for side in SIDES}
    seen_position_ids: set[str] = set()

    with open(input_path, "rb") as source:
        for line_number, raw_line in enumerate(source, start=1):
            digest.update(raw_line)
            byte_count += len(raw_line)
            if not raw_line.endswith(b"\n"):
                raise ValueError(f"line {line_number}: source must end every row with LF")
            if b"\r" in raw_line or raw_line.startswith(b"\xef\xbb\xbf"):
                raise ValueError(f"line {line_number}: source must be canonical UTF-8/LF")
            if not raw_line[:-1]:
                raise ValueError(f"line {line_number}: blank rows are forbidden")
            row = strict_json_loads(raw_line, f"line {line_number}")
            position_id, side = _validate_row(row, expected_split, line_number)
            if position_id in seen_position_ids:
                raise ValueError(f"line {line_number}: duplicate position_id {position_id}")
            seen_position_ids.add(position_id)
            available[side] += 1
            rows += 1

            rank = _sample_rank(seed, position_id)
            entry = (-rank, position_id, raw_line)
            side_heap = heaps[side]
            if len(side_heap) < per_side:
                heapq.heappush(side_heap, entry)
            elif rank < -side_heap[0][0]:
                heapq.heapreplace(side_heap, entry)

    actual_sha256 = digest.hexdigest()
    if actual_sha256 != expected_input_sha256:
        raise ValueError(
            "input identity mismatch: expected "
            f"{expected_input_sha256}, got {actual_sha256}"
        )
    for side in SIDES:
        if available[side] < per_side:
            raise ValueError(
                f"{expected_split} side {side} has {available[side]} rows; "
                f"requires {per_side}"
            )

    selected = [
        (-negative_rank, position_id, raw_line, side)
        for side in SIDES
        for negative_rank, position_id, raw_line in heaps[side]
    ]
    selected.sort(key=lambda item: (item[0], item[1]))
    output_raw = b"".join(item[2] for item in selected)
    _publish_new(output_path, output_raw)
    output_identity = file_identity(output_path)

    result: dict[str, object] = {
        "schema": SCHEMA,
        "sampling": {
            "algorithm": "smallest-domain-separated-sha256-ranks-per-side-v1",
            "seed": seed,
            "per_side": per_side,
        },
        "input": {
            "path": os.path.abspath(input_path),
            "bytes": byte_count,
            "sha256": actual_sha256,
            "rows": rows,
            "schema": TEACHER_SCHEMA,
            "split": expected_split,
            "available_by_side": available,
        },
        "output": {
            **output_identity,
            "rows": len(selected),
            "schema": TEACHER_SCHEMA,
            "split": expected_split,
            "selected_by_side": {side: per_side for side in SIDES},
        },
        "gates": {
            "input_identity_exact": True,
            "position_ids_unique": True,
            "both_sides_present": True,
            "selected_sides_equal": True,
        },
    }
    manifest_raw = (
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")
    _publish_new(manifest_path, manifest_raw)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--expected-input-sha256", required=True)
    parser.add_argument("--expected-split", choices=sorted(SPLITS), required=True)
    parser.add_argument("--per-side", type=int, required=True)
    parser.add_argument("--seed", required=True)
    args = parser.parse_args()
    result = sample_balanced_teacher_dataset(
        args.input,
        args.output,
        args.manifest,
        expected_input_sha256=args.expected_input_sha256,
        expected_split=args.expected_split,
        per_side=args.per_side,
        seed=args.seed,
    )
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
