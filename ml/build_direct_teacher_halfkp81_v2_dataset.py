#!/usr/bin/env python3
"""Build the immutable direct-teacher HalfKP81 v2 pilot dataset.

The builder is deliberately standard-library-only.  It authenticates the
pre-registered V9 source and every exclusion source before parsing data,
reconstructs the original V9 fit membership, keeps only direct depth-16 child
CP labels, removes duplicate child positions, and publishes a game-isolated
90/10 train/validation dataset with a create-only manifest and receipt.

It does not create an optimizer, train a model, run a match, or write live
weights.  The receipt is written last and is the completion marker.
"""

from __future__ import annotations

import argparse
import copy
from dataclasses import dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import tempfile
from typing import Any, Iterable, Iterator, Mapping, Sequence

import direct_teacher_halfkp81_v2_protocol as PROTOCOL


DEFAULT_PROTOCOL = "ml/protocols/direct-teacher-halfkp81-v2-plan.json"
DEFAULT_PHASE1_RESULT = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "child-board-strength-candidate-v1-phase1/result.json"
)
DEFAULT_OUTPUT_DIR = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "direct-teacher-halfkp81-v2-pilot-dataset"
)
PHASE1_RESULT_EXPECTED = {
    "path": DEFAULT_PHASE1_RESULT,
    "bytes": 33615,
    "sha256": "97c60e28f7f7cf6cd7b3c5d83fb87349afaae2759a280ef9c7dbe026c56bfb9d",
    "schema": "shogi-child-board-strength-candidate-result-v1",
    "status": "complete-phase1-two-scratch-checkpoints-frozen-tune-locked",
}
SCORE_BUNDLE_RECEIPT_EXPECTED = {
    "path": (
        "/Users/yudaiyaguchi/.codex/shogi-runs/"
        "child-board-strength-candidate-v1-tune/score-bundle-receipt.json"
    ),
    "bytes": 908,
    "sha256": "9ec56c416264ff694c1b7a7b22e9aa1bc962027b17ca5e7cd860b232884ca206",
    "schema": "shogi-child-board-strength-candidate-score-bundle-receipt-v1",
}
DATASET_RECEIPT_SCHEMA = (
    "shogi-direct-teacher-halfkp81-v2-pilot-dataset-receipt-v1"
)
DATASET_RECEIPT_STATUS = "complete-create-only-pilot-data-training-not-started"
SOURCE_ROW_SHA256_ALGORITHM = "json-bytes-without-lf-sha256-v1"
ID_SET_SHA256_ALGORITHM = "sorted-unique-ascii-each-with-lf-sha256-v1"
POSITION_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
SOURCE_ROW_FIELDS = {
    "child_position_id",
    "child_sfen",
    "cp",
    "game_id",
    "move",
    "parent_id",
    "parent_ply",
    "parent_sfen",
    "ply",
    "position_id",
    "schema",
    "schema_version",
    "sfen",
    "sources",
    "split",
    "teacher_child_cp",
    "teacher_parent_cp",
    "teacher_rank",
    "teacher_score_kind",
}
SOURCE_MATE_FIELDS = {"teacher_mate", "teacher_mate_sign"}
SOURCE_ROW_KEYSETS = (
    frozenset(SOURCE_ROW_FIELDS),
    frozenset(SOURCE_ROW_FIELDS | SOURCE_MATE_FIELDS),
)
MATE_CP_SENTINEL = 1_000_000


@dataclass(frozen=True)
class DirectRow:
    game_id: str
    parent_id: str
    position_id: str
    parent_sfen: str
    child_position_id: str
    child_sfen: str
    move: str
    teacher_child_cp: int
    teacher_rank: int
    sources: tuple[str, ...]
    source_row_sha256: str

    @property
    def semantic_ids(self) -> frozenset[str]:
        return frozenset((self.position_id, self.child_position_id))


@dataclass(frozen=True)
class ParentGroup:
    game_id: str
    parent_id: str
    position_id: str
    parent_sfen: str
    rows: tuple[DirectRow, ...]

    @property
    def semantic_ids(self) -> frozenset[str]:
        return frozenset(
            [self.position_id]
            + [row.child_position_id for row in self.rows]
        )


@dataclass(frozen=True)
class ExclusionInputs:
    spent_tune_parent_ids: frozenset[str]
    spent_tune_semantic_ids: frozenset[str]
    known_eval_ids: frozenset[str]
    fresh_selection_ids: frozenset[str]
    fresh_final_ids: frozenset[str]
    prior_protected_union: frozenset[str]
    phase1_browser_kept_semantic_ids: frozenset[str]
    phase1_receipt: Mapping[str, Any]
    spent_tune_receipt: Mapping[str, Any]


def _error(message: str) -> PROTOCOL.DirectTeacherHalfkpV2Error:
    return PROTOCOL.DirectTeacherHalfkpV2Error(message)


def _require_exact_keys(
    value: Any, expected: set[str], label: str
) -> Mapping[str, Any]:
    if type(value) is not dict or set(value) != expected:
        raise _error(f"{label} fields are not exact")
    return value


def _position_id(value: Any, label: str) -> str:
    if type(value) is not str or POSITION_ID_RE.fullmatch(value) is None:
        raise _error(f"{label} is not a canonical position ID")
    return value


def _nonempty_string(value: Any, label: str) -> str:
    if type(value) is not str or not value:
        raise _error(f"{label} must be a non-empty string")
    return value


def _identity_matches(
    actual: Mapping[str, Any],
    expected: Mapping[str, Any],
    label: str,
    *,
    fields: Sequence[str] = ("bytes", "sha256"),
) -> None:
    if any(actual.get(field) != expected.get(field) for field in fields):
        raise _error(f"{label} identity drift")


def _load_bound_json(
    path: str, expected: Mapping[str, Any], label: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    document, identity = PROTOCOL.load_strict_json_file(path, label)
    _identity_matches(identity, expected, label)
    if "schema" in expected and document.get("schema") != expected["schema"]:
        raise _error(f"{label} schema drift")
    if "status" in expected and document.get("status") != expected["status"]:
        raise _error(f"{label} status drift")
    return document, identity


def _resolve(path: str, repo_root: str) -> str:
    return path if os.path.isabs(path) else os.path.join(repo_root, path)


def _id_set_sha256(identifiers: Iterable[str]) -> str:
    digest = hashlib.sha256()
    for identifier in sorted(
        set(identifiers), key=lambda value: value.encode("ascii")
    ):
        digest.update(identifier.encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def _id_set_sha256_without_final_lf(identifiers: Iterable[str]) -> str:
    return hashlib.sha256(
        "\n".join(
            sorted(set(identifiers), key=lambda value: value.encode("ascii"))
        ).encode("ascii")
    ).hexdigest()


def _position_id_from_sfen(sfen: str) -> str:
    fields = sfen.split()
    if len(fields) != 4:
        raise _error("tune parent SFEN must have exactly four fields")
    canonical = " ".join(fields[:3])
    return "sha256:" + hashlib.sha256(
        f"sfen-v1\0{canonical}".encode("utf-8")
    ).hexdigest()


def _strict_jsonl(
    path: str,
    *,
    label: str,
    expected: Mapping[str, Any] | None = None,
) -> Iterator[tuple[int, bytes, dict[str, Any]]]:
    identity, line_count = PROTOCOL.stable_file_identity(
        path, label, require_jsonl=True
    )
    if expected is not None:
        _identity_matches(identity, expected, label)
        if "rows" in expected and line_count != expected["rows"]:
            raise _error(f"{label} row-count drift")
    with open(identity["path"], "rb") as source:
        for line_number, raw in enumerate(source, start=1):
            if raw == b"\n" or not raw.endswith(b"\n"):
                raise _error(f"{label}:{line_number}: non-canonical JSONL row")
            row = PROTOCOL.strict_json_bytes(
                raw[:-1], f"{label}:{line_number}"
            )
            yield line_number, raw[:-1], row


def _load_direct_source(
    source_binding: Mapping[str, Any],
    *,
    repo_root: str,
    source_role: str = "v9",
) -> list[ParentGroup]:
    if source_role not in {"v9", "browser"}:
        raise _error("unsupported sibling source role")
    source_label = (
        "direct teacher source"
        if source_role == "v9"
        else "phase-1 Browser source"
    )
    path = _resolve(str(source_binding["path"]), repo_root)
    grouped: dict[str, dict[str, Any]] = {}
    rows = 0
    game_ids: set[str] = set()
    for line_number, raw, record in _strict_jsonl(
        path, label=source_label, expected=source_binding
    ):
        label = f"{source_label}:{line_number}"
        row_fields = frozenset(record)
        if row_fields not in SOURCE_ROW_KEYSETS:
            raise _error(f"{label}: source row fields are not an allowed exact keyset")
        has_mate_fields = row_fields == SOURCE_ROW_KEYSETS[1]
        if (
            record["schema"] != "shogi-sibling-v1"
            or record["schema_version"] != 1
            or record["split"] != "train"
        ):
            raise _error(f"{label}: non-direct or wrong-role source row")
        for field in (
            "game_id",
            "parent_id",
            "position_id",
            "child_position_id",
        ):
            _position_id(record[field], f"{label}.{field}")
        for field in ("parent_sfen", "child_sfen", "sfen", "move"):
            _nonempty_string(record[field], f"{label}.{field}")
        if (
            type(record["teacher_child_cp"]) is not int
            or type(record["cp"]) is not int
            or type(record["teacher_parent_cp"]) is not int
            or record["teacher_child_cp"] != record["cp"]
            or record["teacher_parent_cp"] != -record["teacher_child_cp"]
            or record["child_sfen"] != record["sfen"]
        ):
            raise _error(f"{label}: child CP target contract drift")
        if has_mate_fields:
            teacher_mate = record["teacher_mate"]
            teacher_mate_sign = record["teacher_mate_sign"]
            if (
                type(teacher_mate) is not int
                or teacher_mate == 0
                or abs(teacher_mate) >= MATE_CP_SENTINEL
                or type(teacher_mate_sign) is not int
                or teacher_mate_sign not in (-1, 1)
                or (1 if teacher_mate > 0 else -1) != teacher_mate_sign
                or record["teacher_score_kind"] != "mate"
                or record["teacher_child_cp"]
                != -teacher_mate_sign
                * (MATE_CP_SENTINEL - abs(teacher_mate))
            ):
                raise _error(f"{label}: mate flag/sign/CP contract drift")
        elif record["teacher_score_kind"] != "cp":
            raise _error(f"{label}: CP row has non-CP teacher_score_kind")
        if (
            type(record["teacher_rank"]) is not int
            or record["teacher_rank"] < 1
            or type(record["parent_ply"]) is not int
            or type(record["ply"]) is not int
            or record["ply"] != record["parent_ply"] + 1
        ):
            raise _error(f"{label}: rank/ply contract drift")
        sources = record["sources"]
        allowed_sources = (
            {"played", "teacher"}
            if source_role == "v9"
            else {"all-legal-fixed-depth-teacher"}
        )
        if (
            type(sources) is not list
            or not sources
            or any(type(item) is not str or not item for item in sources)
            or not set(sources) <= allowed_sources
        ):
            raise _error(f"{label}: direct teacher provenance is absent")
        parent_id = str(record["parent_id"])
        metadata = (
            str(record["game_id"]),
            str(record["position_id"]),
            str(record["parent_sfen"]),
        )
        entry = grouped.setdefault(
            parent_id, {"metadata": metadata, "rows": []}
        )
        if entry["metadata"] != metadata:
            raise _error(f"{label}: parent metadata changed")
        direct = DirectRow(
            game_id=metadata[0],
            parent_id=parent_id,
            position_id=metadata[1],
            parent_sfen=metadata[2],
            child_position_id=str(record["child_position_id"]),
            child_sfen=str(record["child_sfen"]),
            move=str(record["move"]),
            teacher_child_cp=int(record["teacher_child_cp"]),
            teacher_rank=int(record["teacher_rank"]),
            sources=tuple(str(item) for item in sources),
            source_row_sha256=hashlib.sha256(raw).hexdigest(),
        )
        entry["rows"].append(direct)
        game_ids.add(direct.game_id)
        rows += 1
    if (
        rows != source_binding["rows"]
        or len(grouped) != source_binding["parents"]
        or len(game_ids) != source_binding["games"]
    ):
        raise _error("direct teacher source accounting drift")
    groups: list[ParentGroup] = []
    for parent_id in sorted(grouped, key=lambda value: value.encode("ascii")):
        entry = grouped[parent_id]
        candidates: list[DirectRow] = entry["rows"]
        if len(candidates) < 2:
            raise _error(f"source parent {parent_id} has fewer than two moves")
        moves = [row.move for row in candidates]
        ranks = sorted(row.teacher_rank for row in candidates)
        if len(set(moves)) != len(moves) or ranks != list(
            range(1, len(candidates) + 1)
        ):
            raise _error(f"source parent {parent_id} has duplicate moves/ranks")
        played = sum("played" in row.sources for row in candidates)
        if source_role == "v9":
            valid_source_profile = played == 1 and all(
                "all-legal-fixed-depth-teacher" not in row.sources
                for row in candidates
            )
        else:
            valid_source_profile = played == 0 and all(
                row.sources == ("all-legal-fixed-depth-teacher",)
                for row in candidates
            )
        if not valid_source_profile:
            raise _error(
                f"source parent {parent_id} has an invalid {source_role} profile"
            )
        ranked = sorted(candidates, key=lambda row: row.teacher_rank)
        if any(
            -ranked[index - 1].teacher_child_cp
            < -ranked[index].teacher_child_cp
            for index in range(1, len(ranked))
        ):
            raise _error(f"source parent {parent_id} has rank/CP contradiction")
        game_id, position_id, parent_sfen = entry["metadata"]
        groups.append(
            ParentGroup(
                game_id=game_id,
                parent_id=parent_id,
                position_id=position_id,
                parent_sfen=parent_sfen,
                rows=tuple(candidates),
            )
        )
    return groups


def _read_protected_ids(
    binding: Mapping[str, Any], *, repo_root: str, label: str
) -> frozenset[str]:
    path = _resolve(str(binding["path"]), repo_root)
    identity, _ = PROTOCOL.stable_file_identity(path, label)
    _identity_matches(identity, binding, label)
    raw = Path(identity["path"]).read_bytes()
    if not raw or not raw.endswith(b"\n") or b"\r" in raw:
        raise _error(f"{label} is not canonical LF text")
    try:
        decoded = raw[:-1].decode("ascii").split("\n")
    except UnicodeDecodeError as error:
        raise _error(f"{label} is not ASCII") from error
    if (
        any(POSITION_ID_RE.fullmatch(item) is None for item in decoded)
        or decoded != sorted(decoded)
        or len(decoded) != len(set(decoded))
    ):
        raise _error(f"{label} is not sorted unique canonical IDs")
    if (
        len(decoded) != binding["count"]
        or _id_set_sha256_without_final_lf(decoded)
        != binding["identifiers_sha256"]
    ):
        raise _error(f"{label} identifier receipt drift")
    return frozenset(decoded)


def _read_known_eval_ids(
    registered: Mapping[str, Any],
) -> frozenset[str]:
    sources = registered.get("sources")
    if type(sources) is not list or not sources:
        raise _error("phase-1 known-eval sources are absent")
    identifiers: set[str] = set()
    observed_sources: list[dict[str, Any]] = []
    have_sibling = have_scalar = False
    for source in sources:
        if type(source) is not dict:
            raise _error("known-eval source receipt is malformed")
        role = source.get("role")
        fields: tuple[str, ...]
        if role == "known-eval-sibling":
            fields = ("position_id", "child_position_id")
            have_sibling = True
        elif role == "known-eval-scalar":
            fields = ("position_id",)
            have_scalar = True
        else:
            raise _error("known-eval source role drift")
        rows = 0
        for line_number, _raw, row in _strict_jsonl(
            str(source["path"]), label=f"{role} source", expected=source
        ):
            for field in fields:
                identifiers.add(
                    _position_id(
                        row.get(field),
                        f"{role} source:{line_number}.{field}",
                    )
                )
            rows += 1
        observed_sources.append(
            {
                "path": os.path.realpath(str(source["path"])),
                "role": role,
                "bytes": source["bytes"],
                "sha256": source["sha256"],
                "rows": rows,
            }
        )
    if not have_sibling or not have_scalar:
        raise _error("known-eval source roles are incomplete")
    canonical = "\n".join(sorted(identifiers)).encode("ascii")
    observed = {
        "algorithm": (
            "strict-jsonl-semantic-position-union-bytewise-sort-unique-lf-v1"
        ),
        "sources": observed_sources,
        "count": len(identifiers),
        "bytes": len(canonical) + 1,
        "sha256": hashlib.sha256(canonical + b"\n").hexdigest(),
        "identifiers_sha256": hashlib.sha256(canonical).hexdigest(),
    }
    if observed != registered:
        raise _error("known-eval aggregate receipt drift")
    return frozenset(identifiers)


def _load_tune_source(
    source: Mapping[str, Any], *, label: str
) -> tuple[frozenset[str], frozenset[str]]:
    parent_ids: set[str] = set()
    semantic_ids: set[str] = set()
    for line_number, _raw, row in _strict_jsonl(
        str(source["path"]), label=label, expected=source
    ):
        context = f"{label}:{line_number}"
        _require_exact_keys(
            row, {"schema", "domain", "parent_id", "parent_sfen", "moves"}, context
        )
        if row["schema"] != "shogi-child-board-strength-candidate-tune-source-v1":
            raise _error(f"{context}: tune source schema drift")
        parent_id = _position_id(row["parent_id"], f"{context}.parent_id")
        parent_sfen = _nonempty_string(row["parent_sfen"], f"{context}.parent_sfen")
        moves = row["moves"]
        if type(moves) is not list or not moves:
            raise _error(f"{context}: tune source has no moves")
        parent_ids.add(parent_id)
        semantic_ids.add(_position_id_from_sfen(parent_sfen))
        child_ids: set[str] = set()
        for move_index, move in enumerate(moves):
            if type(move) is not dict:
                raise _error(f"{context}: tune move {move_index} is malformed")
            child_id = _position_id(
                move.get("child_position_id"),
                f"{context}.moves[{move_index}].child_position_id",
            )
            if child_id in child_ids:
                raise _error(f"{context}: duplicate tune child ID")
            child_ids.add(child_id)
            _nonempty_string(
                move.get("child_sfen"),
                f"{context}.moves[{move_index}].child_sfen",
            )
            teacher_cp = move.get("teacher_cp")
            if (
                type(teacher_cp) not in (int, float)
                or not math.isfinite(float(teacher_cp))
            ):
                raise _error(f"{context}: tune teacher CP is not finite")
            semantic_ids.add(child_id)
    return frozenset(parent_ids), frozenset(semantic_ids)


def _component_split(
    groups: Sequence[ParentGroup], *, seed: int, tune_modulus: int
) -> tuple[list[ParentGroup], list[ParentGroup], dict[str, Any]]:
    if not groups or seed < 0 or tune_modulus < 3:
        raise _error("invalid component split controls")
    parents = list(range(len(groups)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left: int, right: int) -> None:
        left_root, right_root = find(left), find(right)
        if left_root != right_root:
            parents[right_root] = left_root

    parent_ids: set[str] = set()
    game_owner: dict[str, int] = {}
    semantic_owner: dict[str, int] = {}
    for index, group in enumerate(groups):
        if group.parent_id in parent_ids:
            raise _error("component split requires unique parent IDs")
        parent_ids.add(group.parent_id)
        union(index, game_owner.setdefault(group.game_id, index))
        for identifier in group.semantic_ids:
            union(index, semantic_owner.setdefault(identifier, index))
    components: dict[int, list[int]] = {}
    for index in range(len(groups)):
        components.setdefault(find(index), []).append(index)
    assignment_rows: list[str] = []
    assignments: dict[int, str] = {}
    component_digests: set[str] = set()
    fit_components = tune_components = 0
    for indices in components.values():
        selected = [groups[index] for index in indices]
        identity = {
            "games": sorted({group.game_id for group in selected}),
            "parents": sorted(group.parent_id for group in selected),
            "semantic_position_ids": sorted(
                {
                    identifier
                    for group in selected
                    for identifier in group.semantic_ids
                }
            ),
        }
        canonical = json.dumps(
            identity,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        component_digest = hashlib.sha256(canonical).hexdigest()
        if component_digest in component_digests:
            raise _error("component identity digest collision")
        component_digests.add(component_digest)
        digest = hashlib.sha256(
            f"{seed}:{component_digest}".encode("ascii")
        ).digest()
        role = (
            "tune"
            if int.from_bytes(digest[:8], "big") % tune_modulus == 0
            else "fit"
        )
        fit_components += role == "fit"
        tune_components += role == "tune"
        assignment_rows.append(f"{component_digest}\t{role}")
        for index in indices:
            assignments[index] = role
    fit = [
        group for index, group in enumerate(groups) if assignments[index] == "fit"
    ]
    tune = [
        group for index, group in enumerate(groups) if assignments[index] == "tune"
    ]
    if not fit or not tune:
        raise _error("component fit/tune split is empty")
    fit_semantic = {item for group in fit for item in group.semantic_ids}
    tune_semantic = {item for group in tune for item in group.semantic_ids}
    fit_games = {group.game_id for group in fit}
    tune_games = {group.game_id for group in tune}
    if fit_semantic & tune_semantic or fit_games & tune_games:
        raise _error("component split leaked a game or semantic position")
    return fit, tune, {
        "algorithm": "game-semantic-connected-components-sha256-v1",
        "seed": seed,
        "tune_modulus": tune_modulus,
        "components": len(components),
        "fit_components": fit_components,
        "tune_components": tune_components,
        "fit_parents": len(fit),
        "tune_parents": len(tune),
        "fit_games": len(fit_games),
        "tune_games": len(tune_games),
        "game_overlap": 0,
        "semantic_position_overlap": 0,
        "component_assignments_sha256": hashlib.sha256(
            "\n".join(sorted(assignment_rows)).encode("ascii")
        ).hexdigest(),
    }


def _load_exclusions(
    *,
    protocol: Mapping[str, Any],
    phase1_result_path: str,
    repo_root: str,
) -> tuple[ExclusionInputs, Mapping[str, Any]]:
    phase1, phase1_identity = _load_bound_json(
        phase1_result_path,
        PHASE1_RESULT_EXPECTED,
        "phase-1 terminal result",
    )
    fit_receipt = phase1.get("fit_data_receipt")
    if type(fit_receipt) is not dict:
        raise _error("phase-1 fit-data receipt is absent")
    sources = fit_receipt.get("sources")
    if type(sources) is not dict:
        raise _error("phase-1 fit sources are absent")
    if sources.get("v9") != {
        key: protocol["inputs"]["direct_teacher_source"][key]
        for key in ("path", "bytes", "sha256", "rows", "parents", "games")
    }:
        raise _error("phase-1 V9 source binding drift")
    registered_protected = sources.get("protected_position_ids")
    if type(registered_protected) is not list or len(registered_protected) != 2:
        raise _error("phase-1 protected sources are absent")
    by_sha = {
        item["sha256"]: item
        for item in registered_protected
        if type(item) is dict and "sha256" in item
    }
    selection_binding = protocol["inputs"]["fresh_selection_protected"]
    final_binding = protocol["inputs"]["fresh_final_protected"]
    for binding, label in (
        (selection_binding, "fresh-selection protected IDs"),
        (final_binding, "fresh-final protected IDs"),
    ):
        registered = by_sha.get(binding["sha256"])
        expected_receipt = {
            key: binding[key]
            for key in ("path", "bytes", "sha256", "count", "identifiers_sha256")
        }
        if registered != expected_receipt:
            raise _error(f"phase-1 {label} receipt drift")
    selection_ids = _read_protected_ids(
        selection_binding, repo_root=repo_root, label="fresh-selection protected IDs"
    )
    final_ids = _read_protected_ids(
        final_binding, repo_root=repo_root, label="fresh-final protected IDs"
    )
    registered_known = sources.get("known_eval_position_ids")
    if type(registered_known) is not dict:
        raise _error("phase-1 known-eval receipt is absent")
    expected_known = protocol["inputs"]["known_eval_union"]
    for field in (
        "algorithm",
        "count",
        "bytes",
        "sha256",
        "identifiers_sha256",
    ):
        if registered_known.get(field) != expected_known[field]:
            raise _error("phase-1 known-eval aggregate drift")
    known_ids = _read_known_eval_ids(registered_known)
    prior_union = frozenset(selection_ids | final_ids | known_ids)
    prior_binding = protocol["inputs"]["prior_protected_union"]
    if (
        len(prior_union) != prior_binding["count"]
        or _id_set_sha256(prior_union) != prior_binding["sha256"]
    ):
        raise _error("prior protected union cannot be reconstructed exactly")
    browser_binding = sources.get("browser")
    if type(browser_binding) is not dict:
        raise _error("phase-1 Browser source binding is absent")
    browser_groups = _load_direct_source(
        browser_binding, repo_root=repo_root, source_role="browser"
    )
    browser_kept = [
        group
        for group in browser_groups
        if not (group.semantic_ids & prior_union)
    ]
    browser_dropped = [
        group.parent_id
        for group in browser_groups
        if group.semantic_ids & prior_union
    ]
    phase1_partition = fit_receipt.get("partition")
    if type(phase1_partition) is not dict or any(
        phase1_partition.get(field) != value
        for field, value in (
            ("browser_input_parents", len(browser_groups)),
            ("browser_kept_parents", len(browser_kept)),
            ("browser_dropped_parents", len(browser_dropped)),
            (
                "browser_dropped_parent_ids_sha256",
                hashlib.sha256(
                    "\n".join(sorted(browser_dropped)).encode("ascii")
                ).hexdigest(),
            ),
        )
    ):
        raise _error("phase-1 Browser protected partition drift")
    browser_kept_semantic_ids = frozenset(
        identifier
        for group in browser_kept
        for identifier in group.semantic_ids
    )

    tune_result_binding = protocol["inputs"]["spent_tune_result"]
    tune_result, _ = _load_bound_json(
        _resolve(str(tune_result_binding["path"]), repo_root),
        tune_result_binding,
        "spent tune result",
    )
    registered_score_receipt = tune_result.get("score_bundle_receipt")
    if type(registered_score_receipt) is not dict:
        raise _error("spent tune score-bundle receipt is absent")
    _identity_matches(
        registered_score_receipt,
        SCORE_BUNDLE_RECEIPT_EXPECTED,
        "spent tune score-bundle receipt binding",
    )
    score_receipt, score_identity = _load_bound_json(
        str(registered_score_receipt["path"]),
        SCORE_BUNDLE_RECEIPT_EXPECTED,
        "spent tune score-bundle receipt",
    )
    source_receipts = score_receipt.get("source_receipts")
    if type(source_receipts) is not dict or set(source_receipts) != {
        "browser_tune",
        "v9_tune",
    }:
        raise _error("spent tune source receipts are incomplete")
    browser_parents, browser_semantic = _load_tune_source(
        source_receipts["browser_tune"], label="browser spent tune source"
    )
    v9_parents, v9_semantic = _load_tune_source(
        source_receipts["v9_tune"], label="V9 spent tune source"
    )
    membership = protocol["inputs"]["spent_tune_membership"]
    if (
        len(browser_parents) != membership["browser_tune_parents"]
        or len(v9_parents) != membership["v9_tune_parents"]
    ):
        raise _error("spent tune parent membership drift")
    return (
        ExclusionInputs(
            spent_tune_parent_ids=frozenset(browser_parents | v9_parents),
            spent_tune_semantic_ids=frozenset(
                browser_semantic | v9_semantic
            ),
            known_eval_ids=known_ids,
            fresh_selection_ids=selection_ids,
            fresh_final_ids=final_ids,
            prior_protected_union=prior_union,
            phase1_browser_kept_semantic_ids=browser_kept_semantic_ids,
            phase1_receipt={
                **phase1_identity,
                "schema": PHASE1_RESULT_EXPECTED["schema"],
                "status": PHASE1_RESULT_EXPECTED["status"],
            },
            spent_tune_receipt={
                **score_identity,
                "schema": SCORE_BUNDLE_RECEIPT_EXPECTED["schema"],
                "parents": score_receipt.get("parents"),
                "rows": score_receipt.get("rows"),
            },
        ),
        fit_receipt,
    )


def _verify_fit_membership(
    groups: Sequence[ParentGroup],
    *,
    exclusions: ExclusionInputs,
    fit_receipt: Mapping[str, Any],
    direct_source_binding: Mapping[str, Any],
) -> tuple[list[ParentGroup], list[ParentGroup]]:
    protected = (
        exclusions.prior_protected_union
        | exclusions.phase1_browser_kept_semantic_ids
    )
    kept = [
        group for group in groups if not (group.semantic_ids & protected)
    ]
    dropped = [
        group.parent_id for group in groups if group.semantic_ids & protected
    ]
    partition = fit_receipt.get("partition")
    expected_partition = {
        "input": direct_source_binding["parents"],
        "kept": len(kept),
        "dropped": len(dropped),
        "dropped_sha256": hashlib.sha256(
            "\n".join(sorted(dropped)).encode("ascii")
        ).hexdigest(),
    }
    if type(partition) is not dict or any(
        partition.get(key) != value
        for key, value in (
            ("v9_input_parents", expected_partition["input"]),
            ("v9_kept_parents", expected_partition["kept"]),
            ("v9_dropped_parents", expected_partition["dropped"]),
            (
                "v9_dropped_parent_ids_sha256",
                expected_partition["dropped_sha256"],
            ),
        )
    ):
        raise _error("phase-1 V9 protected partition drift")
    fit_partition = fit_receipt.get("fit_partition")
    if type(fit_partition) is not dict or type(
        fit_partition.get("v9")
    ) is not dict:
        raise _error("phase-1 V9 fit partition is absent")
    split_seed = fit_partition.get("split_seed")
    tune_modulus = fit_partition.get("tune_modulus")
    if type(split_seed) is not int or type(tune_modulus) is not int:
        raise _error("phase-1 V9 split controls are invalid")
    fit, tune, observed = _component_split(
        kept, seed=split_seed, tune_modulus=tune_modulus
    )
    registered = fit_partition["v9"]
    for field in (
        "algorithm",
        "seed",
        "tune_modulus",
        "components",
        "fit_components",
        "fit_parents",
        "fit_games",
        "component_assignments_sha256",
    ):
        if registered.get(field) != observed[field]:
            raise _error(f"phase-1 V9 fit membership drift: {field}")
    if (
        len(fit) != direct_source_binding["fit_parents"]
        or len(tune) != direct_source_binding["tune_parents"]
    ):
        raise _error("V9 fit/tune parent counts drift")
    tune_parent_ids = {group.parent_id for group in tune}
    tune_semantic_ids = {
        identifier for group in tune for identifier in group.semantic_ids
    }
    registered_v9_parent_ids = (
        exclusions.spent_tune_parent_ids
        & {group.parent_id for group in groups}
    )
    if tune_parent_ids != registered_v9_parent_ids:
        raise _error("V9 spent tune parent IDs differ from reconstructed split")
    if not tune_semantic_ids <= exclusions.spent_tune_semantic_ids:
        raise _error("V9 spent tune semantic IDs differ from reconstructed split")
    return fit, tune


def _pilot_bucket(game_id: str) -> int:
    digest = hashlib.sha256(
        (PROTOCOL.EXPECTED_SPLIT["hash_domain"] + game_id).encode("ascii")
    ).digest()
    return int.from_bytes(digest, "big") % 10


def _role_for_game(game_id: str) -> str:
    return "validation" if _pilot_bucket(game_id) == 0 else "training"


def _row_document(row: DirectRow, role: str) -> dict[str, Any]:
    document = {
        "schema": PROTOCOL.ROW_SCHEMA,
        "role": role,
        "game_id": row.game_id,
        "parent_id": row.parent_id,
        "position_id": row.position_id,
        "child_position_id": row.child_position_id,
        "child_sfen": row.child_sfen,
        "teacher_child_cp": row.teacher_child_cp,
        "teacher_score_kind": "cp",
        "source_row_sha256": row.source_row_sha256,
    }
    _require_exact_keys(document, PROTOCOL.DATASET_ROW_FIELDS, "pilot row")
    return document


def _artifact(
    *,
    filename: str,
    payload: bytes,
    rows: Sequence[DirectRow],
) -> dict[str, Any]:
    game_ids = {row.game_id for row in rows}
    parent_ids = {row.parent_id for row in rows}
    position_ids = {row.position_id for row in rows}
    child_ids = {row.child_position_id for row in rows}
    semantic_ids = position_ids | child_ids
    return {
        "file": filename,
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "rows": len(rows),
        "parents": len(parent_ids),
        "games": len(game_ids),
        "row_schema": PROTOCOL.ROW_SCHEMA,
        "game_ids_sha256": _id_set_sha256(game_ids),
        "parent_ids_sha256": _id_set_sha256(parent_ids),
        "position_ids_sha256": _id_set_sha256(position_ids),
        "child_position_ids_sha256": _id_set_sha256(child_ids),
        "semantic_position_ids_sha256": _id_set_sha256(semantic_ids),
    }


def _role_sets(rows: Sequence[DirectRow]) -> dict[str, set[str]]:
    return {
        "games": {row.game_id for row in rows},
        "parents": {row.parent_id for row in rows},
        "positions": {row.position_id for row in rows},
        "children": {row.child_position_id for row in rows},
        "semantics": {
            identifier
            for row in rows
            for identifier in (row.position_id, row.child_position_id)
        },
    }


def build_dataset_documents(
    *,
    protocol: Mapping[str, Any],
    protocol_identity: Mapping[str, Any],
    fit_groups: Sequence[ParentGroup],
    exclusions: ExclusionInputs,
    generator_identity: Mapping[str, Any],
) -> tuple[dict[str, bytes], dict[str, Any], dict[str, Any]]:
    exclusion_roles = {
        "spent_tune_membership": (
            exclusions.spent_tune_parent_ids,
            exclusions.spent_tune_semantic_ids,
        ),
        "known_eval_union": (frozenset(), exclusions.known_eval_ids),
        "fresh_selection_protected": (
            frozenset(),
            exclusions.fresh_selection_ids,
        ),
        "fresh_final_protected": (frozenset(), exclusions.fresh_final_ids),
        "prior_protected_union": (
            frozenset(),
            exclusions.prior_protected_union,
        ),
    }
    excluded_games: set[str] = set()
    for group in fit_groups:
        for parent_ids, semantic_ids in exclusion_roles.values():
            if group.parent_id in parent_ids or group.semantic_ids & semantic_ids:
                excluded_games.add(group.game_id)
                break
    eligible_groups = [
        group for group in fit_groups if group.game_id not in excluded_games
    ]
    excluded_parents = len(fit_groups) - len(eligible_groups)
    pre_dedup_rows = sum(len(group.rows) for group in eligible_groups)
    pre_dedup_parent_ids = {group.parent_id for group in eligible_groups}
    pre_dedup_game_ids = {group.game_id for group in eligible_groups}
    canonical_by_child: dict[str, DirectRow] = {}
    for group in eligible_groups:
        for row in group.rows:
            current = canonical_by_child.get(row.child_position_id)
            if current is None:
                canonical_by_child[row.child_position_id] = row
                continue
            if (
                current.child_sfen != row.child_sfen
                or current.teacher_child_cp != row.teacher_child_cp
            ):
                raise _error(
                    "conflicting duplicate child position labels; STOP"
                )
            if (
                row.source_row_sha256,
                row.game_id,
                row.parent_id,
            ) < (
                current.source_row_sha256,
                current.game_id,
                current.parent_id,
            ):
                canonical_by_child[row.child_position_id] = row
    ordered = sorted(
        canonical_by_child.values(),
        key=lambda row: (
            row.child_position_id.encode("ascii"),
            row.source_row_sha256.encode("ascii"),
        ),
    )
    by_role = {
        "training": [
            row for row in ordered if _role_for_game(row.game_id) == "training"
        ],
        "validation": [
            row for row in ordered if _role_for_game(row.game_id) == "validation"
        ],
    }
    if not by_role["training"] or not by_role["validation"]:
        raise _error("pilot game hash produced an empty role; STOP")
    role_sets = {
        role: _role_sets(rows) for role, rows in by_role.items()
    }
    overlaps = {
        "game_overlap": len(
            role_sets["training"]["games"] & role_sets["validation"]["games"]
        ),
        "parent_overlap": len(
            role_sets["training"]["parents"] & role_sets["validation"]["parents"]
        ),
        "position_overlap": len(
            role_sets["training"]["positions"]
            & role_sets["validation"]["positions"]
        ),
        "child_position_overlap": len(
            role_sets["training"]["children"]
            & role_sets["validation"]["children"]
        ),
        "semantic_overlap": len(
            role_sets["training"]["semantics"]
            & role_sets["validation"]["semantics"]
        ),
    }
    if any(overlaps.values()):
        raise _error("pilot train/validation semantic isolation failed; STOP")
    output_payloads: dict[str, bytes] = {}
    output_identities: dict[str, Any] = {}
    for role in ("training", "validation"):
        payload = b"".join(
            PROTOCOL.canonical_json_bytes(_row_document(row, role))
            for row in by_role[role]
        )
        filename = f"{role}.jsonl"
        output_payloads[filename] = payload
        output_identities[role] = _artifact(
            filename=filename, payload=payload, rows=by_role[role]
        )
    all_output_rows = by_role["training"] + by_role["validation"]
    output_parent_ids = {row.parent_id for row in all_output_rows}
    output_semantic_ids = {
        identifier
        for row in all_output_rows
        for identifier in (row.position_id, row.child_position_id)
    }
    output_child_ids = {row.child_position_id for row in all_output_rows}
    exclusion_proofs: dict[str, Any] = {}
    exclusion_bindings = {
        "spent_tune_membership": protocol["inputs"]["spent_tune_membership"],
        "known_eval_union": protocol["inputs"]["known_eval_union"],
        "fresh_selection_protected": protocol["inputs"][
            "fresh_selection_protected"
        ],
        "fresh_final_protected": protocol["inputs"]["fresh_final_protected"],
        "prior_protected_union": protocol["inputs"]["prior_protected_union"],
    }
    for role, (parent_ids, semantic_ids) in exclusion_roles.items():
        proof = {
            "binding": copy.deepcopy(exclusion_bindings[role]),
            "parent_overlap": len(output_parent_ids & parent_ids),
            "position_overlap": len(
                {row.position_id for row in all_output_rows} & semantic_ids
            ),
            "child_position_overlap": len(output_child_ids & semantic_ids),
            "semantic_overlap": len(output_semantic_ids & semantic_ids),
        }
        if any(
            proof[field]
            for field in (
                "parent_overlap",
                "position_overlap",
                "child_position_overlap",
                "semantic_overlap",
            )
        ):
            raise _error(f"dataset exclusion overlap remained: {role}; STOP")
        exclusion_proofs[role] = proof
    eligible_games = {row.game_id for row in all_output_rows}
    eligible_parents = {row.parent_id for row in all_output_rows}
    manifest = {
        "schema": PROTOCOL.DATASET_MANIFEST_SCHEMA,
        "status": PROTOCOL.DATASET_STATUS,
        "protocol": {
            "path": protocol_identity["path"],
            "bytes": protocol_identity["bytes"],
            "sha256": protocol_identity["sha256"],
            "schema": PROTOCOL.PROTOCOL_SCHEMA,
        },
        "source": copy.deepcopy(protocol["inputs"]["direct_teacher_source"]),
        "exclusions": exclusion_proofs,
        "split": {
            **copy.deepcopy(PROTOCOL.EXPECTED_SPLIT),
            **overlaps,
        },
        "target": {
            **copy.deepcopy(PROTOCOL.EXPECTED_TARGET),
            "non_cp_rows": 0,
            "neural_teacher_rows": 0,
            "outcome_target_rows": 0,
            "nonfinite_targets": 0,
            "conflicting_duplicate_child_ids": 0,
        },
        "accounting": {
            "source_fit_parents": len(fit_groups),
            "excluded_whole_games": len(excluded_games),
            "excluded_parents": excluded_parents,
            "eligible_games": len(eligible_games),
            "eligible_parents": len(eligible_parents),
            "eligible_rows": len(all_output_rows),
            "training_games": output_identities["training"]["games"],
            "training_parents": output_identities["training"]["parents"],
            "training_rows": output_identities["training"]["rows"],
            "validation_games": output_identities["validation"]["games"],
            "validation_parents": output_identities["validation"]["parents"],
            "validation_rows": output_identities["validation"]["rows"],
        },
        "output": output_identities,
        "training_started": False,
        "live_weight_write_authorized": False,
    }
    manifest = PROTOCOL.validate_dataset_manifest_document(
        manifest,
        protocol=protocol,
        protocol_identity=protocol_identity,
    )
    manifest_payload = PROTOCOL.canonical_json_bytes(manifest)
    output_payloads["manifest.json"] = manifest_payload
    receipt = {
        "schema": DATASET_RECEIPT_SCHEMA,
        "status": DATASET_RECEIPT_STATUS,
        "protocol": copy.deepcopy(manifest["protocol"]),
        "generator": {
            **dict(generator_identity),
            "source_row_sha256_algorithm": SOURCE_ROW_SHA256_ALGORITHM,
            "id_set_sha256_algorithm": ID_SET_SHA256_ALGORITHM,
            "game_bucket_projection": "full-256-bit-big-endian-mod10",
        },
        "authenticated_inputs": {
            "direct_teacher_source": copy.deepcopy(
                protocol["inputs"]["direct_teacher_source"]
            ),
            "phase1_result": dict(exclusions.phase1_receipt),
            "spent_tune": dict(exclusions.spent_tune_receipt),
        },
        "manifest": {
            "file": "manifest.json",
            "bytes": len(manifest_payload),
            "sha256": hashlib.sha256(manifest_payload).hexdigest(),
            "schema": PROTOCOL.DATASET_MANIFEST_SCHEMA,
        },
        "artifacts": copy.deepcopy(output_identities),
        "deduplication": {
            "input_rows": pre_dedup_rows,
            "output_rows": len(all_output_rows),
            "exact_duplicate_child_rows_removed": (
                pre_dedup_rows - len(all_output_rows)
            ),
            "conflicting_duplicate_child_ids": 0,
            "parents_with_all_rows_removed": len(
                pre_dedup_parent_ids - output_parent_ids
            ),
            "games_with_all_rows_removed": len(
                pre_dedup_game_ids - eligible_games
            ),
        },
        "state": {
            "dataset_generation_complete": True,
            "optimizer_created": False,
            "training_started": False,
            "matches_started": False,
            "live_weights_changed": False,
            "live_weight_write_authorized": False,
        },
    }
    return output_payloads, manifest, receipt


def publish_dataset_create_only(
    payloads: Mapping[str, bytes],
    receipt: Mapping[str, Any],
    output_dir: str,
) -> dict[str, Any]:
    expected_payload_names = {"training.jsonl", "validation.jsonl", "manifest.json"}
    if set(payloads) != expected_payload_names:
        raise _error("dataset publication payload set is not exact")
    destination = os.path.abspath(output_dir)
    parent = os.path.dirname(destination)
    os.makedirs(parent, exist_ok=True)
    if os.path.lexists(destination):
        raise _error("refusing to overwrite an existing dataset directory")
    staging = tempfile.mkdtemp(
        prefix=f".{os.path.basename(destination)}.", suffix=".tmp", dir=parent
    )
    created = False
    try:
        complete_payloads = {
            **payloads,
            "receipt.json": PROTOCOL.canonical_json_bytes(receipt),
        }
        for filename, payload in complete_payloads.items():
            path = os.path.join(staging, filename)
            with open(path, "xb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(path, 0o444)
        os.mkdir(destination, 0o755)
        created = True
        for filename in (
            "training.jsonl",
            "validation.jsonl",
            "manifest.json",
            "receipt.json",
        ):
            try:
                os.link(
                    os.path.join(staging, filename),
                    os.path.join(destination, filename),
                )
            except FileExistsError as error:
                raise _error("dataset create-only publication collision") from error
        directory_fd = os.open(destination, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        os.chmod(destination, 0o555)
        parent_fd = os.open(parent, os.O_RDONLY)
        try:
            os.fsync(parent_fd)
        finally:
            os.close(parent_fd)
    except Exception:
        if created:
            for filename in (
                "receipt.json",
                "manifest.json",
                "validation.jsonl",
                "training.jsonl",
            ):
                try:
                    os.unlink(os.path.join(destination, filename))
                except FileNotFoundError:
                    pass
            try:
                os.rmdir(destination)
            except OSError:
                pass
        raise
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    receipt_payload = PROTOCOL.canonical_json_bytes(receipt)
    return {
        "path": os.path.realpath(destination),
        "receipt": {
            "path": os.path.realpath(os.path.join(destination, "receipt.json")),
            "bytes": len(receipt_payload),
            "sha256": hashlib.sha256(receipt_payload).hexdigest(),
        },
    }


def build(
    *,
    protocol_path: str,
    phase1_result_path: str,
    repo_root: str,
) -> tuple[dict[str, bytes], dict[str, Any], dict[str, Any]]:
    protocol, protocol_identity = PROTOCOL.load_strict_json_file(
        protocol_path, "direct-teacher HalfKP81 v2 protocol"
    )
    protocol = PROTOCOL.validate_protocol_document(protocol)
    source_binding = protocol["inputs"]["direct_teacher_source"]
    groups = _load_direct_source(source_binding, repo_root=repo_root)
    exclusions, fit_receipt = _load_exclusions(
        protocol=protocol,
        phase1_result_path=phase1_result_path,
        repo_root=repo_root,
    )
    fit, _tune = _verify_fit_membership(
        groups,
        exclusions=exclusions,
        fit_receipt=fit_receipt,
        direct_source_binding=source_binding,
    )
    generator_identity, _ = PROTOCOL.stable_file_identity(
        os.path.realpath(__file__), "pilot dataset generator"
    )
    return build_dataset_documents(
        protocol=protocol,
        protocol_identity=protocol_identity,
        fit_groups=fit,
        exclusions=exclusions,
        generator_identity=generator_identity,
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", default=DEFAULT_PROTOCOL)
    parser.add_argument("--phase1-result", default=DEFAULT_PHASE1_RESULT)
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    return parser


def main() -> int:
    args = _parser().parse_args()
    payloads, _manifest, receipt = build(
        protocol_path=args.protocol,
        phase1_result_path=args.phase1_result,
        repo_root=os.path.realpath(args.repo_root),
    )
    publication = publish_dataset_create_only(
        payloads, receipt, args.output_dir
    )
    print(
        json.dumps(
            publication,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
            allow_nan=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
