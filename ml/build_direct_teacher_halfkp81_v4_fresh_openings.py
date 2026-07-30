#!/usr/bin/env python3
"""Freeze the complete prior-opening snapshot and fresh v4 paired56 openings."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from typing import Any, Iterable, Sequence

import direct_teacher_halfkp81_v4_robust_protocol as V4


SCHEMA = "shogi-direct-teacher-halfkp81-v4-fresh-opening-manifest-v1"
STATUS = "frozen-after-v4-static-pass-before-paired-game-1"
HISTORICAL_PATH = "ml/protocols/bounded-quiet-history-existing-openings-v1.json"
V2_OPENINGS_PATH = "ml/protocols/direct-teacher-halfkp81-v2-screen-openings.json"
GENERATOR_PATH = "wasm-spike/nnue-fixed-time-opening.ts"
PAIR_SEED_START = 1_300_001
PAIR_COUNT = 28
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
LOG_OPENING_RE = re.compile(rb"\bopening=([0-9a-f]{64})\b")


class FreshOpeningBuildError(ValueError):
    """The prospective fresh-opening snapshot could not be frozen."""


def _canonical_json_bytes(value: Any) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
        + b"\n"
    )


def _identity(path: Path, *, recorded_path: str) -> dict[str, Any]:
    raw = path.read_bytes()
    return {
        "path": recorded_path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _canonical_list_sha256(values: Sequence[str]) -> str:
    raw = json.dumps(
        list(values),
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _opening_set_sha256(values: Sequence[str]) -> str:
    raw = json.dumps(
        list(values),
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(
        b"shogi-direct-teacher-halfkp81-v4-fresh-opening-set-v1\0" + raw
    ).hexdigest()


def _walk_opening_values(value: Any) -> Iterable[str]:
    if type(value) is dict:
        for key, item in value.items():
            if key == "opening_fingerprint":
                if type(item) is str and SHA256_RE.fullmatch(item):
                    yield item
            elif key == "opening_fingerprints":
                if type(item) is list:
                    for fingerprint in item:
                        if type(fingerprint) is str and SHA256_RE.fullmatch(
                            fingerprint
                        ):
                            yield fingerprint
            else:
                yield from _walk_opening_values(item)
    elif type(value) is list:
        for item in value:
            yield from _walk_opening_values(item)


def _strict_json(raw: bytes, label: str) -> Any:
    def pairs(items: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in items:
            if key in result:
                raise FreshOpeningBuildError(f"{label} has a duplicate JSON key")
            result[key] = value
        return result

    try:
        return json.loads(raw, object_pairs_hook=pairs)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise FreshOpeningBuildError(f"{label} is not strict JSON") from error


def scan_run_openings(run_root: Path) -> tuple[set[str], dict[str, Any]]:
    root = run_root.expanduser().resolve()
    if not root.is_dir():
        raise FreshOpeningBuildError("run-root is not a directory")
    fingerprints: set[str] = set()
    source_rows: list[str] = []
    files_scanned = 0
    files_with_openings = 0
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in {".json", ".log"}:
            continue
        files_scanned += 1
        raw = path.read_bytes()
        found: set[str]
        if path.suffix == ".json":
            found = set(_walk_opening_values(_strict_json(raw, str(path))))
        else:
            found = {item.decode("ascii") for item in LOG_OPENING_RE.findall(raw)}
        if not found:
            continue
        files_with_openings += 1
        fingerprints.update(found)
        relative = path.relative_to(root).as_posix()
        source_rows.append(f"{relative}\0{len(raw)}\0{hashlib.sha256(raw).hexdigest()}")
    source_digest = hashlib.sha256(
        ("\n".join(source_rows) + "\n").encode("utf-8")
    ).hexdigest()
    canonical_run_root = (Path.home() / ".codex" / "shogi-runs").resolve()
    reported_root = "~/.codex/shogi-runs" if root == canonical_run_root else str(root)
    return fingerprints, {
        "root": reported_root,
        "files_scanned": files_scanned,
        "files_with_openings": files_with_openings,
        "source_file_identity_list_sha256": source_digest,
        "unique_fingerprints": len(fingerprints),
    }


def scan_tracked_protocol_openings(
    repo_root: Path,
) -> tuple[set[str], dict[str, Any]]:
    root = repo_root.resolve()
    protocol_root = root / "ml" / "protocols"
    fingerprints: set[str] = set()
    source_rows: list[str] = []
    files_scanned = 0
    files_with_openings = 0
    for path in sorted(protocol_root.rglob("*.json")):
        if path.name == "direct-teacher-halfkp81-v4-fresh-opening-manifest.json":
            continue
        files_scanned += 1
        raw = path.read_bytes()
        found = set(_walk_opening_values(_strict_json(raw, str(path))))
        if not found:
            continue
        files_with_openings += 1
        fingerprints.update(found)
        relative = path.relative_to(root).as_posix()
        source_rows.append(f"{relative}\0{len(raw)}\0{hashlib.sha256(raw).hexdigest()}")
    source_digest = hashlib.sha256(
        ("\n".join(source_rows) + "\n").encode("utf-8")
    ).hexdigest()
    return fingerprints, {
        "root": "ml/protocols",
        "files_scanned": files_scanned,
        "files_with_openings": files_with_openings,
        "source_file_identity_list_sha256": source_digest,
        "unique_fingerprints": len(fingerprints),
    }


def _generate_openings(
    *,
    repo_root: Path,
    node: str,
    node_path: str,
    start: int,
    count: int,
) -> list[dict[str, Any]]:
    script = """
const { buildNnueFixedTimeOpening } =
  require("./wasm-spike/nnue-fixed-time-opening.ts");
const start = Number(process.argv[1]);
const count = Number(process.argv[2]);
for (let seed = start; seed < start + count; seed += 1) {
  const opening = buildNnueFixedTimeOpening(seed, 0);
  process.stdout.write(JSON.stringify({
    seed,
    derived_seed: opening.derivedSeed,
    opening_fingerprint: opening.fingerprint,
  }) + "\\n");
}
"""
    environment = {"PATH": os.environ.get("PATH", "")}
    if node_path:
        environment["NODE_PATH"] = node_path
    try:
        completed = subprocess.run(
            [node, "-r", "tsx/cjs", "-e", script, str(start), str(count)],
            cwd=repo_root,
            env=environment,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise FreshOpeningBuildError("opening generator subprocess failed") from error
    rows = [
        _strict_json(line.encode("utf-8"), "opening generator row")
        for line in completed.stdout.splitlines()
        if line
    ]
    if len(rows) != count:
        raise FreshOpeningBuildError("opening generator row count differs")
    return rows


def build_manifest(
    *,
    repo_root: Path,
    run_root: Path,
    node: str,
    node_path: str,
) -> dict[str, Any]:
    root = repo_root.resolve()
    historical_path = root / HISTORICAL_PATH
    v2_path = root / V2_OPENINGS_PATH
    generator_path = root / GENERATOR_PATH
    historical_raw = historical_path.read_bytes()
    historical = _strict_json(historical_raw, "historical opening inventory")
    historical_values = historical.get("full_enrolled_sorted_unique_fingerprints")
    if (
        type(historical_values) is not list
        or historical_values != sorted(set(historical_values))
        or any(
            type(item) is not str or SHA256_RE.fullmatch(item) is None
            for item in historical_values
        )
    ):
        raise FreshOpeningBuildError("historical opening inventory is invalid")
    v2_raw = v2_path.read_bytes()
    v2 = _strict_json(v2_raw, "v2 prospective opening manifest")
    v2_values = [
        item["opening_fingerprint"]
        for item in v2.get("selection", {}).get("pairs_selected", [])
    ]
    if len(v2_values) != 28 or len(set(v2_values)) != 28:
        raise FreshOpeningBuildError("v2 prospective opening set is invalid")
    run_values, run_snapshot = scan_run_openings(run_root)
    tracked_values, tracked_snapshot = scan_tracked_protocol_openings(root)
    prior = sorted(
        set(historical_values) | set(v2_values) | run_values | tracked_values
    )
    generated = _generate_openings(
        repo_root=root,
        node=node,
        node_path=node_path,
        start=PAIR_SEED_START,
        count=512,
    )
    selected: list[dict[str, Any]] = []
    selected_fingerprints: set[str] = set()
    skipped: list[dict[str, Any]] = []
    for item in generated:
        fingerprint = item["opening_fingerprint"]
        if fingerprint in prior or fingerprint in selected_fingerprints:
            skipped.append(
                {
                    **item,
                    "reason": (
                        "prior-inventory-overlap"
                        if fingerprint in prior
                        else "within-selection-duplicate"
                    ),
                }
            )
            continue
        selected.append(
            {
                "pair_index": len(selected),
                **item,
            }
        )
        selected_fingerprints.add(fingerprint)
        if len(selected) == PAIR_COUNT:
            break
    if len(selected) != PAIR_COUNT:
        raise FreshOpeningBuildError("seed scan did not find 28 fresh openings")
    result_path = Path(V4.RESULT_PATH)
    result_identity = _identity(result_path, recorded_path=str(result_path))
    if result_identity != {
        "path": V4.RESULT_PATH,
        "bytes": 3_910,
        "sha256": "a5e02de08ad116578937bf81a1d27f5d9a9ab197e84fadf7f42efb20affb5b7a",
    }:
        raise FreshOpeningBuildError("formal v4 static result identity differs")
    fingerprints = [item["opening_fingerprint"] for item in selected]
    return {
        "schema": SCHEMA,
        "status": STATUS,
        "bindings": {
            "v4_protocol": {
                **_identity(
                    root / V4.EXPECTED_PROTOCOL_IDENTITY["path"],
                    recorded_path=V4.EXPECTED_PROTOCOL_IDENTITY["path"],
                ),
                "schema": V4.PROTOCOL_SCHEMA,
            },
            "v4_static_result": {
                **result_identity,
                "schema": V4.RESULT_SCHEMA,
            },
            "opening_generator": _identity(
                generator_path,
                recorded_path=GENERATOR_PATH,
            ),
        },
        "prior_opening_inventory": {
            "historical": {
                **_identity(
                    historical_path,
                    recorded_path=HISTORICAL_PATH,
                ),
                "fingerprints": len(historical_values),
            },
            "v2_prospective": {
                **_identity(v2_path, recorded_path=V2_OPENINGS_PATH),
                "fingerprints": len(v2_values),
            },
            "private_run_snapshot": run_snapshot,
            "tracked_protocol_snapshot": tracked_snapshot,
            "union_fingerprints": len(prior),
            "canonical_list_sha256": _canonical_list_sha256(prior),
            "full_sorted_unique_fingerprints": prior,
        },
        "selection": {
            "rule": (
                "scan upward from 1300001 and accept the first 28 fingerprints "
                "absent from the frozen complete prior inventory and this selection"
            ),
            "pair_seed_scan_start": PAIR_SEED_START,
            "pairs": PAIR_COUNT,
            "games_per_pair": 2,
            "colors": ["candidate-sente", "candidate-gote"],
            "fingerprint_domain": "shogi-nnue-fixed-time-opening-v1\0",
            "derived_seed_rule": (
                "0x5eed00 + pair_seed * 15485863 + "
                "pair_index_within_harness * 104729"
            ),
            "pair_index_within_harness": 0,
            "skipped": skipped,
            "pairs_selected": selected,
            "opening_set_sha256": _opening_set_sha256(fingerprints),
            "prior_inventory_overlap": 0,
            "within_selection_duplicates": 0,
        },
        "authority": {
            "paired_game_1_authorized": False,
            "old_v3_paired56_authorized": False,
            "expanded_stage_authorized": False,
            "live_weight_write_authorized": False,
        },
    }


def _publish_create_only(path: Path, value: Any) -> None:
    raw = _canonical_json_bytes(value)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    descriptor = os.open(path, flags, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            descriptor = -1
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        if descriptor >= 0:
            os.close(descriptor)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=".")
    parser.add_argument(
        "--run-root",
        default=str(Path.home() / ".codex" / "shogi-runs"),
    )
    parser.add_argument(
        "--out",
        default=(
            "ml/protocols/" "direct-teacher-halfkp81-v4-fresh-opening-manifest.json"
        ),
    )
    parser.add_argument("--node", default=os.environ.get("NODE", "node"))
    parser.add_argument("--node-path", default=os.environ.get("NODE_PATH", ""))
    return parser.parse_args()


def main() -> int:
    arguments = parse_args()
    root = Path(arguments.repo_root).resolve()
    manifest = build_manifest(
        repo_root=root,
        run_root=Path(arguments.run_root),
        node=arguments.node,
        node_path=arguments.node_path,
    )
    output = Path(arguments.out)
    if not output.is_absolute():
        output = root / output
    _publish_create_only(output, manifest)
    print(
        json.dumps(
            _identity(output, recorded_path=output.relative_to(root).as_posix()),
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
