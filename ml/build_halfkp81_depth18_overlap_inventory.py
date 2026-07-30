#!/usr/bin/env python3
"""Build the complete semantic-overlap inventory for HalfKP81 depth-18 selection.

The production CLI has no partial or generic mode.  It authenticates the exact
direct-teacher training and validation JSONL files, collects every parent and
child semantic position ID, authenticates the two tracked formal-opening
registries, and deterministically reconstructs every opening prefix position
from the pinned six-ply generator.  The sorted union is published create-only;
the canonical manifest is written last as the completion marker.

Opening fingerprints from historical inventories that do not carry a seed or
SFEN cannot be converted into semantic position IDs.  They are explicitly
accounted for in the manifest and are not represented as semantic IDs.  Every
selected opening in the two bound formal registries *is* derivable and all of
its positions (hirate plus the six post-move positions) are included.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
from typing import Callable, Mapping, Sequence


MANIFEST_SCHEMA = "shogi-halfkp81-depth18-semantic-overlap-inventory-manifest-v1"
MANIFEST_STATUS = (
    "complete-bound-direct-parent-child-and-selected-formal-opening-prefixes"
)
DIRECT_ROW_SCHEMA = "shogi-direct-teacher-halfkp81-v2-position-v1"
POSITION_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_JSONL_LINE_BYTES = 16 * 1024 * 1024
READ_CHUNK_BYTES = 1024 * 1024

DEFAULT_DIRECT_TRAIN = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "direct-teacher-halfkp81-v2-pilot-dataset/training.jsonl"
)
DEFAULT_DIRECT_VALIDATION = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "direct-teacher-halfkp81-v2-pilot-dataset/validation.jsonl"
)

DIRECT_EXPECTATIONS = {
    "training": {
        "bytes": 131_814_955,
        "sha256": ("2202971ba08cc1bf9be82050be53c6fada79f51f7e7c2a9763d0b57d64d71265"),
        "rows": 200_944,
        "role": "training",
    },
    "validation": {
        "bytes": 15_058_654,
        "sha256": ("bbac963c100fb42adfdd2d8fc8b885fa551672694471bd878038b564d7e804d1"),
        "rows": 22_890,
        "role": "validation",
    },
}

OPENING_EXPECTATIONS = {
    "v2": {
        "relative_path": (
            "ml/protocols/direct-teacher-halfkp81-v2-screen-openings.json"
        ),
        "bytes": 6_208,
        "sha256": ("cc521ace5dfaf39c3c97238a1877456ca55e9b42630c4d4413184a9da5f25744"),
        "schema": "shogi-direct-teacher-halfkp81-v2-screen-openings-v1",
        "status": "prospective-frozen-before-training-or-paired-play",
        "seed_start": 1_200_001,
        "opening_set_sha256": (
            "d2f439ac68e1f531d193af8732a2f878738b8a7a5d5dfc82b611e24f65376507"
        ),
    },
    "v4": {
        "relative_path": (
            "ml/protocols/direct-teacher-halfkp81-v4-fresh-opening-manifest.json"
        ),
        "bytes": 228_133,
        "sha256": ("8ec8422303f9504306a20ea41aa1755ba8d4a336b6118bfb958d91cda2ed64b9"),
        "schema": "shogi-direct-teacher-halfkp81-v4-fresh-opening-manifest-v1",
        "status": "frozen-after-v4-static-pass-before-paired-game-1",
        "seed_start": 1_300_001,
        "opening_set_sha256": (
            "c5a75357a7e9c75e3348cbb125e33fccbab3844142887f5648bdedd980a74641"
        ),
    },
}

# These are the complete tracked source closure used to turn a selected seed
# into canonical prefix SFENs.  The v4 registry independently binds the
# generator identity; the remaining files make the reconstruction dependency
# explicit instead of trusting an ambient TypeScript checkout.
DERIVATION_SOURCE_EXPECTATIONS = {
    "wasm-spike/nnue-fixed-time-opening.ts": {
        "bytes": 3_951,
        "sha256": ("d03bbdfe872b0cb9131b8aa91790852eceee6dc6561a0feca6f5f518be57b40e"),
    },
    "ml/shogi-sfen-codec.ts": {
        "bytes": 2_380,
        "sha256": ("fcf17a339e614f3be65d14c6279f80e4f3d70a1dd0ac8098c4565032c7a97025"),
    },
    "src/components/game/ShogiImproved/KyokumenImproved.ts": {
        "bytes": 69_691,
        "sha256": ("b2cd56c22d10656a074630cd18106bcbc14218125c08c6f3d22149805cb5666a"),
    },
    "src/components/game/ShogiImproved/GenerateMovesImproved.ts": {
        "bytes": 36_585,
        "sha256": ("3a17c296e74f028fad6c26ac3d71a253ddba20e6afc784b49bed57b328c04e97"),
    },
    "src/components/game/ShogiImproved/MoveListImproved.ts": {
        "bytes": 1_441,
        "sha256": ("eacee4b83e212aeb5fa999926710e21415861c48920f127357cb00bd396a4226"),
    },
    "src/components/game/ShogiImproved/TTEntryImproved.ts": {
        "bytes": 1_061,
        "sha256": ("f4231f915de4ba53610c5cb22c56d47d3f7b1ca6b09456f97027082337c8d52e"),
    },
    "src/components/game/ShogiImproved/types.ts": {
        "bytes": 6_764,
        "sha256": ("510fe873c845a563f367af9720f6c8b27024e647e41cee478fedb55a164c37d0"),
    },
    "package-lock.json": {
        "bytes": 587_336,
        "sha256": ("86055b3905cc61cef0a3bc4d6774fbfb3b6ea3fc4a1af7efa9234ab25ea7d656"),
    },
}
TSX_RUNTIME_EXPECTATION = {
    "path": "node_modules/tsx/dist/cli.mjs",
    "bytes": 120_402,
    "sha256": "5d5b2a9f9cf4d6a8b44326b676417e00b42ad04037ed173b7af82ea8146a4fc0",
}
NODE_RUNTIME_EXPECTATION = {
    "path": "/Users/yudaiyaguchi/.nvm/versions/node/v20.14.0/bin/node",
    "bytes": 94_127_856,
    "sha256": "6a1652accbb8aa20886987ecff2ad0dbaa01ceb3ce04a33a1ed21b5f6e4b3713",
}

DIRECT_ROW_KEYS = {
    "child_position_id",
    "child_sfen",
    "game_id",
    "parent_id",
    "position_id",
    "role",
    "schema",
    "source_row_sha256",
    "teacher_child_cp",
    "teacher_score_kind",
}
V2_ROOT_KEYS = {
    "authority",
    "prior_opening_inventory",
    "protocol",
    "schema",
    "selection",
    "status",
}
V4_ROOT_KEYS = {
    "authority",
    "bindings",
    "prior_opening_inventory",
    "schema",
    "selection",
    "status",
}
V2_SELECTION_KEYS = {
    "derived_seed_rule",
    "fingerprint_domain",
    "games_per_pair",
    "opening_set_sha256",
    "pair_index_within_harness",
    "pair_seed_scan_start",
    "pairs",
    "pairs_selected",
    "prior_inventory_overlap",
    "rule",
    "skipped",
    "within_selection_duplicates",
}
V4_SELECTION_KEYS = V2_SELECTION_KEYS | {"colors"}


class OverlapInventoryError(ValueError):
    """An input cannot prove the complete registered overlap closure."""


@dataclass(frozen=True)
class StableIdentity:
    path: str
    bytes: int
    sha256: str

    def json(self) -> dict[str, object]:
        return {
            "path": self.path,
            "bytes": self.bytes,
            "sha256": self.sha256,
        }


def _canonical_json(value: object) -> bytes:
    try:
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
    except (TypeError, ValueError) as error:
        raise OverlapInventoryError(f"cannot encode canonical JSON: {error}") from error


def _strict_json(raw: bytes, label: str) -> object:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as error:
        raise OverlapInventoryError(f"{label}: invalid UTF-8") from error

    def reject_duplicate(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                raise OverlapInventoryError(f"{label}: duplicate JSON key {key!r}")
            result[key] = value
        return result

    try:
        return json.loads(
            text,
            object_pairs_hook=reject_duplicate,
            parse_constant=lambda value: (_ for _ in ()).throw(
                OverlapInventoryError(f"{label}: non-finite JSON number {value!r}")
            ),
        )
    except (json.JSONDecodeError, RecursionError) as error:
        raise OverlapInventoryError(f"{label}: invalid JSON: {error}") from error


def _semantic_id(value: object, label: str) -> str:
    if type(value) is not str or POSITION_ID_RE.fullmatch(value) is None:
        raise OverlapInventoryError(
            f"{label}: expected lowercase sha256: semantic position ID"
        )
    return value


def _digest(value: object, label: str) -> str:
    if type(value) is not str or SHA256_RE.fullmatch(value) is None:
        raise OverlapInventoryError(f"{label}: expected lowercase SHA-256")
    return value


def _canonical_sfen(value: object, label: str) -> str:
    if type(value) is not str or value != value.strip():
        raise OverlapInventoryError(f"{label}: expected canonical SFEN text")
    fields = value.split()
    if len(fields) != 4 or fields[1] not in ("b", "w"):
        raise OverlapInventoryError(f"{label}: SFEN must have four fields")
    try:
        move_number = int(fields[3])
    except ValueError as error:
        raise OverlapInventoryError(
            f"{label}: SFEN move number is not an integer"
        ) from error
    if move_number <= 0 or str(move_number) != fields[3]:
        raise OverlapInventoryError(
            f"{label}: SFEN move number is not canonical positive decimal"
        )
    canonical = " ".join(fields)
    if canonical != value:
        raise OverlapInventoryError(f"{label}: SFEN whitespace is not canonical")
    return canonical


def _position_id_from_sfen(sfen: str) -> str:
    fields = _canonical_sfen(sfen, "SFEN").split()
    payload = f"sfen-v1\0{' '.join(fields[:3])}".encode("utf-8")
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def _stat_signature(value: os.stat_result) -> tuple[int, int, int, int, int]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )


def _open_bound_descriptor(
    path: Path, expected: Mapping[str, object], label: str
) -> tuple[int, os.stat_result]:
    try:
        lstat_value = path.lstat()
    except OSError as error:
        raise OverlapInventoryError(f"{label}: cannot stat {path}: {error}") from error
    if stat.S_ISLNK(lstat_value.st_mode):
        raise OverlapInventoryError(f"{label}: symlink inputs are forbidden")
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise OverlapInventoryError(f"{label}: cannot open {path}: {error}") from error
    try:
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode):
            raise OverlapInventoryError(f"{label}: input is not a regular file")
        if (lstat_value.st_dev, lstat_value.st_ino) != (
            opened.st_dev,
            opened.st_ino,
        ):
            raise OverlapInventoryError(f"{label}: path changed during open")
        if opened.st_size != expected["bytes"]:
            raise OverlapInventoryError(
                f"{label}: byte size drift: {opened.st_size} != {expected['bytes']}"
            )
        return descriptor, opened
    except BaseException:
        os.close(descriptor)
        raise


def _finish_stable_read(
    descriptor: int,
    path: Path,
    before: os.stat_result,
    first_sha256: str,
    expected: Mapping[str, object],
    label: str,
) -> StableIdentity:
    after_first = os.fstat(descriptor)
    if _stat_signature(after_first) != _stat_signature(before):
        raise OverlapInventoryError(f"{label}: file changed during first read")
    os.lseek(descriptor, 0, os.SEEK_SET)
    second_hasher = hashlib.sha256()
    second_bytes = 0
    while True:
        chunk = os.read(descriptor, READ_CHUNK_BYTES)
        if not chunk:
            break
        second_hasher.update(chunk)
        second_bytes += len(chunk)
    after_second = os.fstat(descriptor)
    try:
        current = path.lstat()
    except OSError as error:
        raise OverlapInventoryError(
            f"{label}: path disappeared after read: {error}"
        ) from error
    if _stat_signature(after_second) != _stat_signature(before) or (
        current.st_dev,
        current.st_ino,
    ) != (before.st_dev, before.st_ino):
        raise OverlapInventoryError(f"{label}: file changed during stable read")
    second_sha256 = second_hasher.hexdigest()
    if second_bytes != before.st_size or second_sha256 != first_sha256:
        raise OverlapInventoryError(f"{label}: stable second digest differs")
    if first_sha256 != expected["sha256"]:
        raise OverlapInventoryError(
            f"{label}: SHA-256 drift: {first_sha256} != {expected['sha256']}"
        )
    return StableIdentity(str(path.resolve()), before.st_size, first_sha256)


def _read_bound_file(
    path: Path, expected: Mapping[str, object], label: str
) -> tuple[bytes, StableIdentity]:
    descriptor, before = _open_bound_descriptor(path, expected, label)
    try:
        hasher = hashlib.sha256()
        chunks: list[bytes] = []
        while True:
            chunk = os.read(descriptor, READ_CHUNK_BYTES)
            if not chunk:
                break
            chunks.append(chunk)
            hasher.update(chunk)
        raw = b"".join(chunks)
        identity = _finish_stable_read(
            descriptor,
            path,
            before,
            hasher.hexdigest(),
            expected,
            label,
        )
        return raw, identity
    finally:
        os.close(descriptor)


def _validate_direct_row(
    value: object, *, role: str, line_number: int
) -> tuple[str, str]:
    label = f"{role} line {line_number}"
    if type(value) is not dict or set(value) != DIRECT_ROW_KEYS:
        raise OverlapInventoryError(f"{label}: direct row fields are not exact")
    if value["schema"] != DIRECT_ROW_SCHEMA:
        raise OverlapInventoryError(f"{label}: direct row schema drift")
    if value["role"] != role:
        raise OverlapInventoryError(f"{label}: direct row role drift")
    _semantic_id(value["game_id"], f"{label}.game_id")
    _semantic_id(value["parent_id"], f"{label}.parent_id")
    parent_id = _semantic_id(value["position_id"], f"{label}.position_id")
    child_id = _semantic_id(value["child_position_id"], f"{label}.child_position_id")
    child_sfen = _canonical_sfen(value["child_sfen"], f"{label}.child_sfen")
    if _position_id_from_sfen(child_sfen) != child_id:
        raise OverlapInventoryError(
            f"{label}: child_position_id does not bind child_sfen"
        )
    _digest(value["source_row_sha256"], f"{label}.source_row_sha256")
    if (
        type(value["teacher_child_cp"]) is not int
        or value["teacher_score_kind"] != "cp"
    ):
        raise OverlapInventoryError(f"{label}: direct CP label contract drift")
    if parent_id == child_id:
        raise OverlapInventoryError(f"{label}: parent and child positions coincide")
    return parent_id, child_id


def _scan_direct_jsonl(
    path: Path, expected: Mapping[str, object], label: str
) -> tuple[set[str], dict[str, object]]:
    descriptor, before = _open_bound_descriptor(path, expected, label)
    identifiers: set[str] = set()
    parent_ids: set[str] = set()
    child_ids: set[str] = set()
    hasher = hashlib.sha256()
    rows = 0
    try:
        with os.fdopen(os.dup(descriptor), "rb", buffering=READ_CHUNK_BYTES) as source:
            for raw_line in source:
                rows += 1
                if len(raw_line) > MAX_JSONL_LINE_BYTES:
                    raise OverlapInventoryError(
                        f"{label} line {rows}: exceeds line size limit"
                    )
                if not raw_line.endswith(b"\n") or raw_line == b"\n":
                    raise OverlapInventoryError(
                        f"{label} line {rows}: expected non-empty LF JSONL"
                    )
                hasher.update(raw_line)
                body = raw_line[:-1]
                value = _strict_json(body, f"{label} line {rows}")
                if _canonical_json(value) != raw_line:
                    raise OverlapInventoryError(
                        f"{label} line {rows}: row is not canonical JSONL"
                    )
                parent_id, child_id = _validate_direct_row(
                    value, role=str(expected["role"]), line_number=rows
                )
                parent_ids.add(parent_id)
                child_ids.add(child_id)
                identifiers.add(parent_id)
                identifiers.add(child_id)
        if rows != expected["rows"]:
            raise OverlapInventoryError(
                f"{label}: row count drift: {rows} != {expected['rows']}"
            )
        identity = _finish_stable_read(
            descriptor,
            path,
            before,
            hasher.hexdigest(),
            expected,
            label,
        )
    finally:
        os.close(descriptor)
    report = identity.json() | {
        "held_descriptor": True,
        "stable_second_digest": True,
        "rows": rows,
        "row_schema": DIRECT_ROW_SCHEMA,
        "role": expected["role"],
        "parent_id_observations": rows,
        "child_id_observations": rows,
        "unique_parent_ids": len(parent_ids),
        "unique_child_ids": len(child_ids),
        "unique_semantic_ids": len(identifiers),
        "position_id_format_validated": True,
        "child_position_id_matches_sfen": True,
        "canonical_jsonl": True,
    }
    return identifiers, report


def _opening_pair_entries(
    document: object, expected: Mapping[str, object], label: str
) -> tuple[list[dict[str, object]], dict[str, object]]:
    expected_root = V2_ROOT_KEYS if label == "v2" else V4_ROOT_KEYS
    expected_selection = V2_SELECTION_KEYS if label == "v2" else V4_SELECTION_KEYS
    if type(document) is not dict or set(document) != expected_root:
        raise OverlapInventoryError(f"{label}: opening root fields are not exact")
    if (
        document["schema"] != expected["schema"]
        or document["status"] != expected["status"]
    ):
        raise OverlapInventoryError(f"{label}: opening schema or status drift")
    selection = document["selection"]
    if type(selection) is not dict or set(selection) != expected_selection:
        raise OverlapInventoryError(f"{label}: opening selection fields are not exact")
    fixed_values = {
        "fingerprint_domain": "shogi-nnue-fixed-time-opening-v1\0",
        "derived_seed_rule": (
            "0x5eed00 + pair_seed * 15485863 " "+ pair_index_within_harness * 104729"
        ),
        "pair_index_within_harness": 0,
        "pair_seed_scan_start": expected["seed_start"],
        "pairs": 28,
        "games_per_pair": 2,
        "opening_set_sha256": expected["opening_set_sha256"],
        "prior_inventory_overlap": 0,
        "within_selection_duplicates": 0,
        "skipped": [],
    }
    for key, fixed in fixed_values.items():
        if selection.get(key) != fixed:
            raise OverlapInventoryError(f"{label}: opening selection {key} drift")
    if label == "v4" and selection.get("colors") != [
        "candidate-sente",
        "candidate-gote",
    ]:
        raise OverlapInventoryError(f"{label}: opening colors drift")
    entries = selection["pairs_selected"]
    if type(entries) is not list or len(entries) != 28:
        raise OverlapInventoryError(f"{label}: expected exactly 28 opening pairs")
    observed_fingerprints: set[str] = set()
    captured: list[dict[str, object]] = []
    for index, raw in enumerate(entries):
        entry_keys = {"pair_index", "seed", "derived_seed", "opening_fingerprint"}
        if type(raw) is not dict or set(raw) != entry_keys:
            raise OverlapInventoryError(
                f"{label}: opening pair {index} fields are not exact"
            )
        expected_seed = int(expected["seed_start"]) + index
        expected_derived = 0x5EED00 + expected_seed * 15_485_863
        if (
            raw["pair_index"] != index
            or raw["seed"] != expected_seed
            or raw["derived_seed"] != expected_derived
        ):
            raise OverlapInventoryError(
                f"{label}: opening pair {index} seed derivation drift"
            )
        fingerprint = _digest(
            raw["opening_fingerprint"],
            f"{label}.pairs_selected[{index}].opening_fingerprint",
        )
        if fingerprint in observed_fingerprints:
            raise OverlapInventoryError(
                f"{label}: duplicate selected opening fingerprint"
            )
        observed_fingerprints.add(fingerprint)
        captured.append(
            {
                "source": label,
                "pair_index": index,
                "seed": expected_seed,
                "opening_fingerprint": fingerprint,
            }
        )

    prior = document["prior_opening_inventory"]
    if type(prior) is not dict:
        raise OverlapInventoryError(f"{label}: malformed prior opening inventory")
    if label == "v2":
        non_derivable_count = prior.get("fingerprints")
        prior_digest = prior.get("canonical_list_sha256")
    else:
        fingerprints = prior.get("full_sorted_unique_fingerprints")
        if (
            type(fingerprints) is not list
            or any(
                type(value) is not str or SHA256_RE.fullmatch(value) is None
                for value in fingerprints
            )
            or fingerprints != sorted(set(fingerprints))
        ):
            raise OverlapInventoryError(
                "v4: prior fingerprint inventory is not sorted unique SHA-256"
            )
        non_derivable_count = len(fingerprints)
        if non_derivable_count != prior.get("union_fingerprints"):
            raise OverlapInventoryError("v4: prior fingerprint count drift")
        prior_digest = prior.get("canonical_list_sha256")
    if type(non_derivable_count) is not int or non_derivable_count < 0:
        raise OverlapInventoryError(f"{label}: prior fingerprint count is malformed")
    _digest(prior_digest, f"{label}.prior_opening_inventory digest")
    return captured, {
        "fingerprint_only_prior_inventory_count": non_derivable_count,
        "fingerprint_only_prior_inventory_canonical_list_sha256": prior_digest,
    }


def _load_opening_source(
    path: Path, expected: Mapping[str, object], label: str
) -> tuple[list[dict[str, object]], dict[str, object]]:
    raw, identity = _read_bound_file(path, expected, f"{label} opening source")
    document = _strict_json(raw, f"{label} opening source")
    entries, limitation = _opening_pair_entries(document, expected, label)
    report = identity.json() | {
        "held_descriptor": True,
        "stable_second_digest": True,
        "schema": expected["schema"],
        "status": expected["status"],
        "selected_openings": len(entries),
        **limitation,
    }
    return entries, report


def _bind_derivation_sources(repo_root: Path) -> list[dict[str, object]]:
    identities: list[dict[str, object]] = []
    for relative_path, expected in DERIVATION_SOURCE_EXPECTATIONS.items():
        _, identity = _read_bound_file(
            repo_root / relative_path,
            expected,
            f"opening derivation source {relative_path}",
        )
        identities.append(
            identity.json()
            | {
                "relative_path": relative_path,
                "held_descriptor": True,
                "stable_second_digest": True,
            }
        )
    return identities


_TSX_DERIVER = r"""
import { buildNnueFixedTimeOpening } from "./wasm-spike/nnue-fixed-time-opening";
import { KyokumenImproved } from "./src/components/game/ShogiImproved/KyokumenImproved";
import { toSfen } from "./ml/shogi-sfen-codec";

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const requests = JSON.parse(raw);
  const results = [];
  for (const request of requests) {
    const opening = buildNnueFixedTimeOpening(request.seed, 0);
    const position = new KyokumenImproved();
    position.initHirate();
    const sfens = [toSfen(position, 1)];
    for (let index = 0; index < opening.moves.length; index += 1) {
      const move = opening.moves[index].clone();
      move.capture = position.get(move.to);
      position.move(move);
      position.toggleTeban();
      sfens.push(toSfen(position, index + 2));
    }
    results.push({
      source: request.source,
      pair_index: request.pair_index,
      seed: request.seed,
      opening_fingerprint: opening.fingerprint,
      sfens,
    });
  }
  process.stdout.write(JSON.stringify(results));
}
main().catch((error) => {
  process.stderr.write(String(error?.stack ?? error));
  process.exitCode = 1;
});
"""


def _derive_opening_prefixes(
    repo_root: Path, entries: Sequence[Mapping[str, object]]
) -> tuple[list[dict[str, object]], dict[str, object]]:
    tsx = repo_root / str(TSX_RUNTIME_EXPECTATION["path"])
    node = Path(str(NODE_RUNTIME_EXPECTATION["path"]))
    _, tsx_identity = _read_bound_file(
        tsx, TSX_RUNTIME_EXPECTATION, "tsx opening-derivation runtime"
    )
    _, node_identity = _read_bound_file(
        node, NODE_RUNTIME_EXPECTATION, "Node opening-derivation runtime"
    )
    if not os.access(node, os.X_OK):
        raise OverlapInventoryError("bound Node runtime is not executable")
    request = _canonical_json(list(entries))
    environment = dict(os.environ)
    environment.update({"LC_ALL": "C", "LANG": "C"})
    try:
        process = subprocess.run(
            [str(node), str(tsx), "--eval", _TSX_DERIVER],
            cwd=repo_root,
            input=request,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=60,
            check=False,
            env=environment,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise OverlapInventoryError(
            f"opening reconstruction runtime failed: {error}"
        ) from error
    if process.returncode != 0 or process.stderr:
        diagnostic = process.stderr.decode("utf-8", errors="replace")[:1000]
        raise OverlapInventoryError(
            "opening reconstruction failed closed: "
            f"exit={process.returncode}, stderr={diagnostic!r}"
        )
    value = _strict_json(process.stdout, "opening reconstruction output")
    if type(value) is not list or len(value) != len(entries):
        raise OverlapInventoryError("opening reconstruction output count drift")
    results: list[dict[str, object]] = []
    all_ids: set[str] = set()
    by_source: dict[str, set[str]] = {}
    for index, (request_entry, raw_result) in enumerate(zip(entries, value)):
        expected_keys = {
            "source",
            "pair_index",
            "seed",
            "opening_fingerprint",
            "sfens",
        }
        if type(raw_result) is not dict or set(raw_result) != expected_keys:
            raise OverlapInventoryError(
                f"opening reconstruction result {index} fields are not exact"
            )
        for key in ("source", "pair_index", "seed", "opening_fingerprint"):
            if raw_result[key] != request_entry[key]:
                raise OverlapInventoryError(
                    f"opening reconstruction result {index} {key} drift"
                )
        sfens = raw_result["sfens"]
        if type(sfens) is not list or len(sfens) != 7:
            raise OverlapInventoryError(
                f"opening reconstruction result {index} lacks seven prefixes"
            )
        semantic_ids: list[str] = []
        for ply, raw_sfen in enumerate(sfens):
            sfen = _canonical_sfen(
                raw_sfen, f"opening reconstruction result {index}.sfens[{ply}]"
            )
            if int(sfen.split()[3]) != ply + 1:
                raise OverlapInventoryError(
                    f"opening reconstruction result {index} move number drift"
                )
            semantic_ids.append(_position_id_from_sfen(sfen))
        source = str(request_entry["source"])
        all_ids.update(semantic_ids)
        by_source.setdefault(source, set()).update(semantic_ids)
        results.append(
            {
                **dict(request_entry),
                "prefix_position_ids": semantic_ids,
            }
        )
    runtime_version = subprocess.run(
        [str(node), str(tsx), "--version"],
        cwd=repo_root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=10,
        check=False,
        env=environment,
    )
    if runtime_version.returncode != 0 or runtime_version.stderr:
        raise OverlapInventoryError("cannot bind tsx runtime version")
    report = {
        "runtime": {
            "command": (
                "/Users/yudaiyaguchi/.nvm/versions/node/v20.14.0/bin/node "
                "node_modules/tsx/dist/cli.mjs --eval <pinned inline deriver>"
            ),
            "node": node_identity.json(),
            "tsx": tsx_identity.json(),
            "tsx_version": runtime_version.stdout.decode("ascii").strip(),
            "inline_deriver_sha256": hashlib.sha256(
                _TSX_DERIVER.encode("utf-8")
            ).hexdigest(),
        },
        "selected_openings": len(entries),
        "prefix_positions_per_opening": 7,
        "prefix_position_observations": len(entries) * 7,
        "unique_semantic_ids": len(all_ids),
        "unique_semantic_ids_by_source": {
            source: len(values) for source, values in sorted(by_source.items())
        },
        "all_selected_fingerprints_derived": True,
        "non_derivable_selected_fingerprints": [],
        "coverage": "hirate-and-each-of-six-post-move-positions",
    }
    return results, report


def _publish_create_only(path: Path, raw: bytes, label: str) -> StableIdentity:
    path = path.resolve(strict=False)
    parent = path.parent
    if not parent.is_dir():
        raise OverlapInventoryError(f"{label}: parent directory does not exist")
    if path.exists() or path.is_symlink():
        raise OverlapInventoryError(f"{label}: destination already exists")
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=parent
    )
    temporary = Path(temporary_name)
    linked = False
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, 0o600)
        try:
            os.link(temporary, path, follow_symlinks=False)
        except OSError as error:
            raise OverlapInventoryError(
                f"{label}: create-only link failed: {error}"
            ) from error
        linked = True
        directory_descriptor = os.open(parent, os.O_RDONLY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        if not linked and path.exists():
            raise OverlapInventoryError(
                f"{label}: publication failed after unexpected destination creation"
            )
    return StableIdentity(str(path), len(raw), hashlib.sha256(raw).hexdigest())


OpeningDeriver = Callable[
    [Path, Sequence[Mapping[str, object]]],
    tuple[list[dict[str, object]], dict[str, object]],
]


def build_overlap_inventory(
    *,
    repo_root: Path,
    direct_train: Path,
    direct_validation: Path,
    output: Path,
    manifest: Path,
    direct_expectations: Mapping[str, Mapping[str, object]] = DIRECT_EXPECTATIONS,
    opening_expectations: Mapping[str, Mapping[str, object]] = OPENING_EXPECTATIONS,
    deriver: OpeningDeriver = _derive_opening_prefixes,
    bind_derivation_sources: bool = True,
) -> dict[str, object]:
    """Build and publish one immutable overlap inventory.

    Dependency injection is intentionally limited to unit tests.  The CLI
    always uses the production expectations, bound derivation closure, and
    real deterministic TypeScript generator.
    """

    repo_root = repo_root.resolve()
    output = output.resolve(strict=False)
    manifest = manifest.resolve(strict=False)
    protected_paths = {
        direct_train.resolve(),
        direct_validation.resolve(),
        *(
            (repo_root / value["relative_path"]).resolve()
            for value in opening_expectations.values()
        ),
    }
    if output == manifest or output in protected_paths or manifest in protected_paths:
        raise OverlapInventoryError("input, inventory, and manifest paths must differ")
    if (
        output.exists()
        or output.is_symlink()
        or manifest.exists()
        or manifest.is_symlink()
    ):
        raise OverlapInventoryError("inventory publication is create-only")

    train_ids, train_report = _scan_direct_jsonl(
        direct_train, direct_expectations["training"], "training"
    )
    validation_ids, validation_report = _scan_direct_jsonl(
        direct_validation, direct_expectations["validation"], "validation"
    )

    opening_entries: list[dict[str, object]] = []
    opening_reports: dict[str, dict[str, object]] = {}
    for label in ("v2", "v4"):
        expected = opening_expectations[label]
        entries, report = _load_opening_source(
            repo_root / str(expected["relative_path"]), expected, label
        )
        opening_entries.extend(entries)
        opening_reports[label] = report

    derivation_sources = (
        _bind_derivation_sources(repo_root) if bind_derivation_sources else []
    )
    derived_openings, derivation_report = deriver(repo_root, opening_entries)
    if len(derived_openings) != 56:
        raise OverlapInventoryError(
            "complete formal closure requires exactly 56 derived openings"
        )
    opening_ids = {
        semantic_id
        for opening in derived_openings
        for semantic_id in opening["prefix_position_ids"]
    }
    all_ids = train_ids | validation_ids | opening_ids
    if not all_ids:
        raise OverlapInventoryError("semantic overlap inventory is empty")
    sorted_ids = sorted(all_ids)
    inventory_raw = b"".join(
        _canonical_json({"position_id": position_id}) for position_id in sorted_ids
    )
    inventory_identity = _publish_create_only(
        output, inventory_raw, "semantic overlap inventory"
    )

    overlap_counts = {
        "training_and_validation": len(train_ids & validation_ids),
        "direct_and_formal_openings": len((train_ids | validation_ids) & opening_ids),
        "all_three_sources": len(train_ids & validation_ids & opening_ids),
    }
    manifest_value: dict[str, object] = {
        "schema": MANIFEST_SCHEMA,
        "status": MANIFEST_STATUS,
        "inputs": {
            "direct": {
                "training": train_report,
                "validation": validation_report,
            },
            "formal_openings": opening_reports,
            "derivation_sources": derivation_sources,
        },
        "derivation": derivation_report,
        "semantic_scope": {
            "direct_parent_and_child_ids": True,
            "formal_selected_opening_hirate_and_six_prefixes": True,
            "selected_formal_openings": 56,
            "selected_formal_prefix_position_observations": 392,
            "selected_formal_non_derivable_fingerprints": 0,
            "fingerprint_only_prior_inventories_are_not_semantic_ids": True,
            "fingerprint_only_prior_inventory_limitations": {
                label: {
                    "count": report["fingerprint_only_prior_inventory_count"],
                    "canonical_list_sha256": report[
                        "fingerprint_only_prior_inventory_canonical_list_sha256"
                    ],
                    "reason": (
                        "fingerprint-has-no-seed-sfen-or-invertible-position-payload"
                    ),
                }
                for label, report in opening_reports.items()
            },
        },
        "accounting": {
            "training_unique_semantic_ids": len(train_ids),
            "validation_unique_semantic_ids": len(validation_ids),
            "formal_opening_unique_semantic_ids": len(opening_ids),
            "union_unique_semantic_ids": len(all_ids),
            "cross_source_overlaps": overlap_counts,
        },
        "output": inventory_identity.json()
        | {
            "rows": len(sorted_ids),
            "row_schema": {"position_id": "sha256:<lowercase-64-hex>"},
            "canonical_jsonl": True,
            "sorted_bytewise_unique": True,
        },
        "publication": (
            "create-only-temp-fsync-hardlink-inventory-then-manifest-last-v1"
        ),
        "authority": {
            "teacher_generation_authorized": False,
            "training_authorized": False,
            "formal_match_authorized": False,
            "live_weight_write_authorized": False,
        },
    }
    manifest_raw = _canonical_json(manifest_value)
    _publish_create_only(manifest, manifest_raw, "overlap inventory manifest")
    return manifest_value


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="repository containing the exact tracked formal-opening sources",
    )
    parser.add_argument("--direct-train", type=Path, default=Path(DEFAULT_DIRECT_TRAIN))
    parser.add_argument(
        "--direct-validation",
        type=Path,
        default=Path(DEFAULT_DIRECT_VALIDATION),
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    manifest = build_overlap_inventory(
        repo_root=args.repo_root,
        direct_train=args.direct_train,
        direct_validation=args.direct_validation,
        output=args.output,
        manifest=args.manifest,
    )
    print(json.dumps(manifest["output"], sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
