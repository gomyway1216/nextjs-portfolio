#!/usr/bin/env python3
"""Create immutable semantic-ID sets for the leak-free DPA data build."""

from __future__ import annotations

import argparse
import glob
import hashlib
import json
import os
from pathlib import Path
from typing import Sequence

from build_kingpair_legacy_2m_shards import (
    LegacyShardError,
    _load_exclusions,
    _semantic_id,
    load_inventory_validator,
)


SCHEMA = "shogi-dpa-semantic-id-sets-v3"


def _publish(path: Path, data: bytes) -> None:
    temporary = path.with_name(f"{path.name}.tmp.{os.getpid()}")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.write(descriptor, data)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    try:
        os.link(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def build_id_sets(
    legacy_root: Path,
    sealed_paths: Sequence[Path],
    output_root: Path,
) -> dict[str, object]:
    if output_root.exists():
        raise LegacyShardError(f"output root already exists: {output_root}")
    manifest_path = legacy_root / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    expected_rows = manifest.get("selection", {}).get("selected_rows")
    if not isinstance(expected_rows, int) or expected_rows < 1:
        raise LegacyShardError("legacy manifest selected_rows is invalid")

    validator = load_inventory_validator()
    legacy: set[str] = set()
    rows = 0
    names = sorted(glob.glob(str(legacy_root / "legacy-*.jsonl")))
    if not names:
        raise LegacyShardError("legacy root contains no shards")
    for name in names:
        with open(name, "rb") as stream:
            for raw in stream:
                rows += 1
                record = json.loads(raw)
                identifier = record.get("semantic_position_id")
                sfen = record.get("sfen")
                if not isinstance(identifier, str) or not isinstance(sfen, str):
                    raise LegacyShardError(f"invalid legacy row in {name}")
                expected = f"sha256:{_semantic_id(validator(sfen)).hex()}"
                if identifier != expected:
                    raise LegacyShardError(f"legacy identity mismatch in {name}")
                if identifier in legacy:
                    raise LegacyShardError(f"duplicate legacy identity: {identifier}")
                legacy.add(identifier)
    if rows != expected_rows or len(legacy) != expected_rows:
        raise LegacyShardError("legacy row count does not match its manifest")

    sealed_bytes, scans, _ = _load_exclusions(sealed_paths, (), validator)
    sealed = {f"sha256:{identifier.hex()}" for identifier in sealed_bytes}
    overlap = legacy & sealed
    if overlap:
        raise LegacyShardError(f"legacy/sealed semantic overlap: {len(overlap)}")

    newline = "\n"
    legacy_payload = (newline.join(sorted(legacy)) + newline).encode("utf-8")
    sealed_payload = (newline.join(sorted(sealed)) + newline).encode("utf-8")
    receipt: dict[str, object] = {
        "schema": SCHEMA,
        "legacy": {
            "rows": rows,
            "count": len(legacy),
            "bytes": len(legacy_payload),
            "sha256": hashlib.sha256(legacy_payload).hexdigest(),
            "manifest_path": str(manifest_path.resolve()),
            "manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
        },
        "sealed": {
            "count": len(sealed),
            "bytes": len(sealed_payload),
            "sha256": hashlib.sha256(sealed_payload).hexdigest(),
            "sources": [scan.__dict__ for scan in scans],
        },
        "overlap": 0,
    }
    receipt_payload = (
        json.dumps(receipt, sort_keys=True, separators=(",", ":")) + newline
    ).encode("utf-8")

    output_root.mkdir(mode=0o700, parents=True)
    try:
        _publish(output_root / "legacy2m-position-ids.txt", legacy_payload)
        _publish(output_root / "sealed-holdout-position-ids.txt", sealed_payload)
        _publish(output_root / "receipt.json", receipt_payload)
    except Exception:
        raise
    return receipt


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--legacy-root", type=Path, required=True)
    parser.add_argument("--sealed", type=Path, action="append", required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    arguments = parser.parse_args(argv)
    try:
        receipt = build_id_sets(
            arguments.legacy_root,
            arguments.sealed,
            arguments.output_root,
        )
    except (LegacyShardError, OSError, json.JSONDecodeError) as error:
        print(json.dumps({"status": "error", "error": str(error)}, sort_keys=True))
        return 1
    print(json.dumps({"status": "complete", **receipt}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
