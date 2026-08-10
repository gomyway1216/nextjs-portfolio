#!/usr/bin/env python3
"""Build the fixed multi-teacher corpus for KingPair Interaction NNUE.

The builder reuses already completed Aoba/YaneuraOu label artifacts.  It does
not run an engine or copy an engine weight.  Validation rows are emitted first
and their semantic position ids are excluded from training; all remaining
rows are globally deduplicated by the canonical SFEN position id.
"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
from typing import Iterable, Iterator


RUNS = Path.home() / ".codex" / "shogi-runs"
SPLIT_DOMAIN = b"kingpair-interaction-nnue-v1\0"
SCHEMA = "shogi-kingpair-interaction-training-row-v1"
MANIFEST_SCHEMA = "shogi-kingpair-interaction-dataset-manifest-v1"
CHILD_BOARD_CAP = 32


@dataclass(frozen=True)
class SourcePaths:
    large_train: Path
    large_validation: Path
    direct_train: Path
    direct_validation: Path
    aoba_train: Path
    aoba_validation: Path
    v9_train: Path
    child_board: Path


DEFAULT_SOURCES = SourcePaths(
    large_train=RUNS / "large-scratch-806k-v1" / "train.teacher.jsonl",
    large_validation=RUNS / "large-scratch-806k-v1" / "val.teacher.jsonl",
    direct_train=(
        RUNS / "direct-teacher-halfkp81-v2-pilot-dataset" / "training.jsonl"
    ),
    direct_validation=(
        RUNS / "direct-teacher-halfkp81-v2-pilot-dataset" / "validation.jsonl"
    ),
    aoba_train=(
        RUNS / "aoba-halfkp-sibling-preserving-v2-20260809" / "train.jsonl"
    ),
    aoba_validation=(
        RUNS
        / "aoba-halfkp-sibling-preserving-v2-20260809"
        / "validation.jsonl"
    ),
    v9_train=RUNS / "floodgate-q1-2026-strength-first-v9" / "train.jsonl",
    child_board=(
        RUNS
        / "child-board-root-policy-student-runtime-v1"
        / "fit-distillation.seed42.jsonl"
    ),
)


EXPECTED_SHA256 = {
    "large_train": "51c7425bcb0c0ba7ec24570687017cbed633c224b54a1cd408d232860318ca29",
    "large_validation": "41bc47ffebedc4de6f53b6ec609191e40790e370426e3c68cb13c0f6667bde6d",
    "direct_train": "2202971ba08cc1bf9be82050be53c6fada79f51f7e7c2a9763d0b57d64d71265",
    "direct_validation": "bbac963c100fb42adfdd2d8fc8b885fa551672694471bd878038b564d7e804d1",
    "aoba_train": "82a579f4dda8f35826d7962e673b19427a435d6acc896e1935b19d1d5cca92b0",
    "aoba_validation": "5e615534e73465e644a7bb971451f2565dd255d4e5f989e6af13e703baa7cb0f",
    "v9_train": "4a18b186c255b66dd195ec4c781381bc10d583951acfa8a690a9c152467b9580",
    "child_board": "e06127ca3ba280da5d93465770ff39879d1ec29a89a2263dcf977d12543cd7e0",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_position_id(sfen: str) -> str:
    if not isinstance(sfen, str) or len(sfen.split()) != 4:
        raise ValueError("teacher row has an invalid four-field SFEN")
    canonical = " ".join(sfen.split()[:3])
    digest = hashlib.sha256(f"sfen-v1\0{canonical}".encode()).hexdigest()
    return f"sha256:{digest}"


def held_out_game(game_id: str) -> bool:
    if not isinstance(game_id, str) or not game_id:
        raise ValueError("teacher row has no game_id")
    digest = hashlib.sha256(SPLIT_DOMAIN + game_id.encode()).digest()
    return int.from_bytes(digest[:8], "big") % 10 == 0


def normalized_row(
    *,
    sfen: str,
    cp: int | float | str,
    game_id: str,
    position_id: str,
    source: str,
    split: str,
    parent_id: str | None = None,
    teacher_rank: int | None = None,
) -> dict:
    computed = canonical_position_id(sfen)
    if position_id != computed:
        raise ValueError(f"{source} position id does not match SFEN")
    numeric_cp = float(cp)
    if not math.isfinite(numeric_cp):
        raise ValueError(f"{source} teacher cp is non-finite")
    row = {
        "schema": SCHEMA,
        "split": split,
        "source": source,
        "game_id": game_id,
        "position_id": computed,
        "sfen": " ".join(sfen.split()),
        "cp": int(round(numeric_cp)),
    }
    if parent_id:
        row["parent_id"] = parent_id
    if teacher_rank is not None:
        row["teacher_rank"] = int(teacher_rank)
    return row


def json_lines(path: Path) -> Iterator[dict]:
    with path.open("r", encoding="utf-8") as source:
        for line_number, line in enumerate(source, start=1):
            if not line.strip():
                raise ValueError(f"{path}:{line_number}: blank row")
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"{path}:{line_number}: invalid JSON") from error
            if not isinstance(value, dict):
                raise ValueError(f"{path}:{line_number}: row is not an object")
            yield value


def direct_rows(path: Path, source: str, split: str) -> Iterator[dict]:
    for record in json_lines(path):
        if "child_sfen" in record:
            yield normalized_row(
                sfen=record["child_sfen"],
                cp=record["teacher_child_cp"],
                game_id=record["game_id"],
                position_id=record["child_position_id"],
                source=source,
                split=split,
                parent_id=record.get("parent_id"),
                teacher_rank=record.get("teacher_rank"),
            )
        else:
            yield normalized_row(
                sfen=record["sfen"],
                cp=record["cp"],
                game_id=record["game_id"],
                position_id=record["position_id"],
                source=source,
                split=split,
            )


def hashed_split_rows(path: Path, source: str, wanted_split: str) -> Iterator[dict]:
    for row in direct_rows(path, source, wanted_split):
        actual = "validation" if held_out_game(row["game_id"]) else "train"
        if actual == wanted_split:
            row["split"] = actual
            yield row


def selected_child_board_moves(record: dict, cap: int = CHILD_BOARD_CAP) -> list[dict]:
    moves = record.get("moves")
    if not isinstance(moves, list) or not moves:
        raise ValueError("child-board parent has no moves")

    def selection_key(move: dict) -> bytes:
        child_id = move.get("child_position_id")
        if not isinstance(child_id, str) or not child_id:
            raise ValueError("child-board move has no child_position_id")
        return hashlib.sha256(SPLIT_DOMAIN + b"child\0" + child_id.encode()).digest()

    return sorted(moves, key=selection_key)[:cap]


def child_board_rows(path: Path, wanted_split: str, cap: int) -> Iterator[dict]:
    for parent in json_lines(path):
        game_id = parent.get("game_id")
        actual = "validation" if held_out_game(game_id) else "train"
        if actual != wanted_split:
            continue
        for move in selected_child_board_moves(parent, cap):
            yield normalized_row(
                sfen=move["child_sfen"],
                cp=-float(move["teacher_combined_parent_cp"]),
                game_id=game_id,
                position_id=move["child_position_id"],
                source="child-board-depth-teacher",
                split=actual,
                parent_id=parent.get("parent_id"),
            )


def verify_inputs(paths: SourcePaths, expected: dict[str, str]) -> dict[str, dict]:
    identities = {}
    for name, path in paths.__dict__.items():
        if not path.is_file():
            raise FileNotFoundError(path)
        digest = sha256_file(path)
        wanted = expected.get(name)
        if wanted is not None and digest != wanted:
            raise ValueError(f"{name} SHA mismatch: expected {wanted}, got {digest}")
        identities[name] = {
            "path": str(path),
            "bytes": path.stat().st_size,
            "sha256": digest,
        }
    return identities


def _write_partition(
    output,
    rows: Iterable[dict],
    seen: set[str],
    counters: Counter,
) -> None:
    for row in rows:
        position_id = row["position_id"]
        source = row["source"]
        counters[f"{source}:input"] += 1
        if position_id in seen:
            counters[f"{source}:duplicate"] += 1
            continue
        seen.add(position_id)
        output.write(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n")
        counters[f"{source}:accepted"] += 1


def build_dataset(
    paths: SourcePaths,
    output_directory: Path,
    *,
    expected_sha256: dict[str, str] | None = None,
    child_board_cap: int = CHILD_BOARD_CAP,
) -> dict:
    if child_board_cap <= 0:
        raise ValueError("child-board cap must be positive")
    output_directory.mkdir(parents=True, exist_ok=True)
    final_train = output_directory / "train.jsonl"
    final_validation = output_directory / "validation.jsonl"
    final_manifest = output_directory / "manifest.json"
    for path in (final_train, final_validation, final_manifest):
        if path.exists():
            raise FileExistsError(f"refusing to overwrite {path}")

    identities = verify_inputs(paths, expected_sha256 or {})
    seen: set[str] = set()
    validation_ids: set[str] = set()
    counters: Counter = Counter()

    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=output_directory, delete=False
    ) as validation_output:
        validation_tmp = Path(validation_output.name)
        validation_sources = (
            direct_rows(paths.aoba_validation, "aoba-depth12-top4", "validation"),
            direct_rows(paths.direct_validation, "yaneura-depth16-child", "validation"),
            direct_rows(paths.large_validation, "yaneura-depth12-floodgate", "validation"),
            hashed_split_rows(paths.v9_train, "yaneura-depth18-sibling", "validation"),
            child_board_rows(paths.child_board, "validation", child_board_cap),
        )
        for rows in validation_sources:
            _write_partition(validation_output, rows, seen, counters)
        validation_ids.update(seen)

    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=output_directory, delete=False
    ) as train_output:
        train_tmp = Path(train_output.name)
        training_sources = (
            direct_rows(paths.aoba_train, "aoba-depth12-top4", "train"),
            direct_rows(paths.direct_train, "yaneura-depth16-child", "train"),
            hashed_split_rows(paths.v9_train, "yaneura-depth18-sibling", "train"),
            direct_rows(paths.large_train, "yaneura-depth12-floodgate", "train"),
            child_board_rows(paths.child_board, "train", child_board_cap),
        )
        for rows in training_sources:
            _write_partition(train_output, rows, seen, counters)

    train_count = sum(
        value for key, value in counters.items() if key.endswith(":accepted")
    ) - len(validation_ids)
    validation_count = len(validation_ids)
    os.replace(validation_tmp, final_validation)
    os.replace(train_tmp, final_train)
    outputs = {
        "train": {
            "path": str(final_train),
            "rows": train_count,
            "bytes": final_train.stat().st_size,
            "sha256": sha256_file(final_train),
        },
        "validation": {
            "path": str(final_validation),
            "rows": validation_count,
            "bytes": final_validation.stat().st_size,
            "sha256": sha256_file(final_validation),
        },
    }
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "split_domain": SPLIT_DOMAIN.rstrip(b"\0").decode(),
        "child_board_cap_per_parent": child_board_cap,
        "semantic_overlap": 0,
        "inputs": identities,
        "outputs": outputs,
        "counters": dict(sorted(counters.items())),
    }
    manifest_tmp = final_manifest.with_suffix(".json.tmp")
    manifest_tmp.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    os.replace(manifest_tmp, final_manifest)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    manifest = build_dataset(
        DEFAULT_SOURCES,
        args.out,
        expected_sha256=EXPECTED_SHA256,
    )
    print(json.dumps(manifest["outputs"], sort_keys=True))


if __name__ == "__main__":
    main()
