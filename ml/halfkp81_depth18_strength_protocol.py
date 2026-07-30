#!/usr/bin/env python3
"""Fail-closed contracts for the HalfKP81 hard-parent depth18 strength lane."""

from __future__ import annotations

import copy
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from typing import Any, Mapping


PREREGISTRATION_SCHEMA = "shogi-halfkp81-hard-depth18-strength-plan-v1"
TEACHER_PLAN_SCHEMA = "shogi-halfkp81-hard-depth18-teacher-plan-v1"
TEACHER_RECEIPT_SCHEMA = "shogi-halfkp81-hard-depth18-teacher-receipt-v1"
SELECTION_PLAN_SCHEMA = "shogi-halfkp81-hard-depth18-parent-selection-v1"
SELECTION_MANIFEST_SCHEMA = "halfkp81-depth18-hard-parent-selection-manifest-v2"
SELECTION_ROW_SCHEMA = "halfkp81-depth18-hard-parent-v2"
SELECTION_EVIDENCE_SCHEMA = (
    "shogi-halfkp81-depth18-authenticated-selection-evidence-v1"
)
LEGAL_MANIFEST_SCHEMA = "shogi-halfkp81-depth18-legal-count-manifest-v1"
LEGAL_MANIFEST_STATUS = (
    "complete-research-data-only-not-deployment-authorization"
)
OVERLAP_MANIFEST_SCHEMA = (
    "shogi-halfkp81-depth18-semantic-overlap-inventory-manifest-v1"
)
OVERLAP_MANIFEST_STATUS = (
    "complete-bound-direct-parent-child-and-selected-formal-opening-prefixes"
)
PHASE_PLAN_TO_SELECTION = {
    "opening-ply12-39": "opening",
    "midgame-ply40-79": "mid",
    "late-ply80-119": "late",
}
SELECTION_PHASE_BOUNDS = {
    "opening": (12, 39),
    "mid": (40, 79),
    "late": (80, 119),
}
OVERLAP_IDENTITY = {
    "rows": 243_368,
    "bytes": 21_903_120,
    "sha256": "34ef162aabf044e6af28da32ce8add43384fa4070afb87b99e1dcefd527dc809",
}
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")

EXPECTED_ROLE_COUNTS = {"fit": 6_144, "tune": 1_024, "sealed": 1_024}
EXPECTED_PREREGISTRATION_IDENTITY = {
    "path": "ml/halfkp81-hard-depth18-strength-v1-plan.json",
    "bytes": 5_855,
    "sha256": "fc25e155345cb61739e2ef5a9198511501b12340e8d05b56ee77ba267b232971",
    "schema": PREREGISTRATION_SCHEMA,
}
EXPECTED_PHASE_COUNTS = {
    "opening-ply12-39": 2_048,
    "midgame-ply40-79": 3_072,
    "late-ply80-119": 3_072,
}
EXPECTED_PHASE_SIDE_COUNTS = {
    "opening-ply12-39": {"b": 1_024, "w": 1_024},
    "midgame-ply40-79": {"b": 1_536, "w": 1_536},
    "late-ply80-119": {"b": 1_536, "w": 1_536},
}
EXPECTED_ROLE_SIDE_COUNTS = {
    "fit": {"b": 3_072, "w": 3_072},
    "tune": {"b": 512, "w": 512},
    "sealed": {"b": 512, "w": 512},
}
EXPECTED_SOURCE_ROWS = {
    "direct_replay_fit": 200_944,
    "direct_preservation_validation": 22_890,
    "hard_parent_pool": 800_000,
    "hard_parents": 8_192,
}
EXPECTED_SOURCE_IDENTITIES = {
    "direct_replay_fit": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "direct-teacher-halfkp81-v2-pilot-dataset/training.jsonl"
        ),
        "bytes": 131_814_955,
        "sha256": "2202971ba08cc1bf9be82050be53c6fada79f51f7e7c2a9763d0b57d64d71265",
    },
    "direct_preservation_validation": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "direct-teacher-halfkp81-v2-pilot-dataset/validation.jsonl"
        ),
        "bytes": 15_058_654,
        "sha256": "bbac963c100fb42adfdd2d8fc8b885fa551672694471bd878038b564d7e804d1",
    },
    "hard_parent_pool": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/large-scratch-806k-v1/"
            "wdl/train.teacher.wdl.jsonl"
        ),
        "bytes": 421_952_083,
        "sha256": "c83241eb95f3568fe75a95d903e348591af49daf07d23db1db266e9be14a633d",
    },
    "hard_parent_pool_manifest": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/large-scratch-806k-v1/"
            "wdl/train.teacher.wdl.manifest.json"
        ),
        "bytes": 2_123,
        "sha256": "900c60d5d8e4a3714e3c44ae91dc6f7d96c6dca1049ef70bb828bc76704b120b",
    },
    "initializer_checkpoint": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "halfkp81-epoch2-interpolation-v1/alpha-050.pt"
        ),
        "bytes": 191_656_679,
        "sha256": "ea36d0b9f0ecdf9543daf8f77fed42577ccc38deb6a964e8df78dc8549b6a8c4",
    },
    "initializer_export": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "halfkp81-epoch2-interpolation-v1/alpha-050-export/weights.bin"
        ),
        "bytes": 94_656_708,
        "sha256": "2b91060fe98c13d57341bdf0c773094c6489b7e508d6d6afd4051565dfb9b47c",
    },
    "live_baseline": {
        "path": "public/shogi-nnue-weights.bin",
        "bytes": 1_185_988,
        "sha256": "e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc",
    },
    "v9_teacher_authority_result": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-runs/"
            "floodgate-q1-2026-strength-first-v9/result.json"
        ),
        "bytes": 19_911,
        "sha256": "ccdefb750896471e8fca6740801e3b86d8d5a581d00edb0add34a16fa75e5d88",
    },
}
EXPECTED_V4_MEMO_IDENTITY = {
    "path": (
        "docs/data/"
        "shogi-direct-teacher-halfkp81-v4-formal-paired56-result-2026-07-29.json"
    ),
    "bytes": 6_860,
    "sha256": "04a4ca837a6955b0a692adc7a91c6eec4e45bf614ba8978f6a422542803a939e",
}
EXPECTED_OBJECTIVE = (
    "Use local compute on high-rated game positions where depth12 evaluation "
    "and game outcome disagree, replace the old score with fresh YaneuraOu "
    "depth18 sibling labels, preserve broad direct-teacher replay, and require "
    "direct-play evidence before promotion."
)
EXPECTED_CLAIM_BOUNDARY = (
    "This is a new independent strength family. The previous v4 candidate and "
    "the side-b-only cycle0 pool are closed inputs. Selection from balanced "
    "high-rated game positions, fresh depth18 targets, one training run, and "
    "every promotion threshold are fixed before execution; proxy gains alone "
    "never authorize a strength claim or live write."
)
EXPECTED_ENGINE = {
    "binary": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-data/"
            "floodgate-teacher-assets-v1/bin/yaneuraou"
        ),
        "bytes": 700_048,
        "sha256": "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1",
    },
    "eval_file": {
        "path": (
            "/Users/yudaiyaguchi/.codex/shogi-data/"
            "floodgate-teacher-assets-v1/eval/eval/nn.bin"
        ),
        "bytes": 64_217_066,
        "sha256": "1141d275bceec911156801f27303dc9ff5beb24f4f59144cc069306c59e80782",
    },
    "eval_tree_sha256": "639397609565fc2f113242503483addaf812b39c43a4d813d51b9c68ca51d568",
    "source_revision": "9133c527791c8b2f5f378a32df29a5e3752bd41b",
    "id": "YaneuraOu NNUE 9.60git 64APPLEM1",
}
EXPECTED_TEACHER = {
    "engine": "YaneuraOu NNUE 9.60git 64APPLEM1",
    "proposal_depth": 16,
    "proposal_multipv": 12,
    "stable_move_depth": 11,
    "rescore_depth": 18,
    "threads_per_process": 1,
    "hash_mib_per_process": 512,
    "processes": 13,
    "timeout_seconds_per_parent": 600,
    "minimum_rows_per_parent": 2,
    "maximum_rows_per_parent": 14,
    "expected_rows_point": 95_191,
    "maximum_rows": 114_688,
}
EXPECTED_TRAINING = {
    "initializer": "original-alpha-050-not-v3-or-v4-candidate",
    "representation": "HalfKP81",
    "epochs": 3,
    "seeds": 1,
    "parent_batch_fraction_direct_replay": 0.5,
    "parent_batch_fraction_fresh_hard": 0.5,
    "direct_loss": "sigmoid-bce-k600",
    "direct_loss_fraction": 0.5,
    "groupwise_loss": "listnet-cp-over-600",
    "groupwise_loss_fraction": 0.5,
    "checkpoint_selection": "final-epoch-only",
}
EXPECTED_GATES = {
    "teacher_authentication_prefixes": [100, 500],
    "tune_parents": 1_024,
    "tune_top1_delta_percentage_points_minimum": 2.0,
    "tune_sibling_pair_delta_percentage_points_minimum": 1.0,
    "sealed_parents": 1_024,
    "sealed_top1_delta_percentage_points_minimum": 2.0,
    "sealed_sibling_pair_delta_percentage_points_minimum": 1.0,
    "old_validation_rows": 22_890,
    "old_validation_teacher_mae_cp_improvement_minimum": 5.0,
    "old_validation_pair_delta_minimum": 0.0,
    "int16_clipping_coordinates_maximum": 0,
    "wasm_parity_mismatches_maximum": 0,
    "nearest_rank_p99_9_ratio_maximum": 1.05,
    "absolute_max_cp_delta_maximum": 300.0,
    "runtime_slowdown_percent_maximum": 5.0,
    "fresh_screen_games": 56,
    "fresh_screen_halfpoints_denominator": 112,
    "fresh_screen_halfpoints_minimum": 62,
    "fresh_screen_technical_faults_maximum": 0,
}


class Halfkp81Depth18StrengthError(ValueError):
    """The immutable strength-lane contract was violated."""


@dataclass(frozen=True)
class AuthenticatedSelectionEvidence:
    """Evidence produced only after held-descriptor selection authentication."""

    document: Mapping[str, Any]


def canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
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


def file_identity(path: str, *, schema: str | None = None) -> dict[str, Any]:
    digest = hashlib.sha256()
    size = 0
    with open(path, "rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    result: dict[str, Any] = {
        "path": path,
        "bytes": size,
        "sha256": digest.hexdigest(),
    }
    if schema is not None:
        result["schema"] = schema
    return result


def load_strict_json_file(path: str, label: str) -> tuple[Any, dict[str, Any]]:
    try:
        with open(path, "rb") as handle:
            raw = handle.read()
        value = json.loads(
            raw,
            parse_constant=lambda constant: (_ for _ in ()).throw(
                Halfkp81Depth18StrengthError(
                    f"{label} contains non-finite number {constant}"
                )
            ),
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise Halfkp81Depth18StrengthError(f"{label} is unreadable JSON") from error
    if not isinstance(value, dict) or canonical_json_bytes(value) != raw:
        raise Halfkp81Depth18StrengthError(f"{label} is not canonical JSON")
    return value, {
        "path": path,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _identity(
    value: Any,
    *,
    label: str,
    absolute: bool,
    schema: str | None = None,
) -> dict[str, Any]:
    fields = {"path", "bytes", "sha256"}
    if schema is not None:
        fields.add("schema")
    if type(value) is not dict or set(value) != fields:
        raise Halfkp81Depth18StrengthError(f"{label} identity fields differ")
    path = value["path"]
    if (
        type(path) is not str
        or os.path.isabs(path) != absolute
        or type(value["bytes"]) is not int
        or value["bytes"] < 1
        or type(value["sha256"]) is not str
        or SHA256_RE.fullmatch(value["sha256"]) is None
        or (schema is not None and value["schema"] != schema)
    ):
        raise Halfkp81Depth18StrengthError(f"{label} identity is invalid")
    return copy.deepcopy(value)


def _exact(value: Mapping[str, Any], key: str, expected: Any) -> None:
    if value.get(key) != expected:
        raise Halfkp81Depth18StrengthError(f"{key} differs from preregistration")


def _stat_signature(value: os.stat_result) -> tuple[int, int, int, int, int]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )


def _read_descriptor(descriptor: int) -> bytes:
    chunks: list[bytes] = []
    while True:
        chunk = os.read(descriptor, 1024 * 1024)
        if not chunk:
            return b"".join(chunks)
        chunks.append(chunk)


def _read_held_regular_file(
    path: str, label: str
) -> tuple[bytes, dict[str, Any]]:
    candidate = Path(path)
    try:
        path_stat = candidate.lstat()
    except OSError as error:
        raise Halfkp81Depth18StrengthError(f"{label} cannot be statted") from error
    if stat.S_ISLNK(path_stat.st_mode) or not stat.S_ISREG(path_stat.st_mode):
        raise Halfkp81Depth18StrengthError(
            f"{label} must be a regular non-symlink file"
        )
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(candidate, flags)
    except OSError as error:
        raise Halfkp81Depth18StrengthError(f"{label} cannot be opened") from error
    try:
        before = os.fstat(descriptor)
        if (
            not stat.S_ISREG(before.st_mode)
            or (before.st_dev, before.st_ino)
            != (path_stat.st_dev, path_stat.st_ino)
        ):
            raise Halfkp81Depth18StrengthError(f"{label} changed during open")
        first = _read_descriptor(descriptor)
        after_first = os.fstat(descriptor)
        os.lseek(descriptor, 0, os.SEEK_SET)
        second = _read_descriptor(descriptor)
        after_second = os.fstat(descriptor)
        try:
            final_path_stat = candidate.lstat()
        except OSError as error:
            raise Halfkp81Depth18StrengthError(
                f"{label} disappeared during read"
            ) from error
        if (
            _stat_signature(before) != _stat_signature(after_first)
            or _stat_signature(before) != _stat_signature(after_second)
            or (final_path_stat.st_dev, final_path_stat.st_ino)
            != (before.st_dev, before.st_ino)
            or first != second
        ):
            raise Halfkp81Depth18StrengthError(
                f"{label} changed during stable held read"
            )
        return first, {
            "path": str(candidate.resolve()),
            "bytes": len(first),
            "sha256": hashlib.sha256(first).hexdigest(),
            "held_read_only_descriptor": True,
            "stable_double_read": True,
        }
    finally:
        os.close(descriptor)


def _strict_json_bytes(raw: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            raw,
            parse_constant=lambda constant: (_ for _ in ()).throw(
                Halfkp81Depth18StrengthError(
                    f"{label} contains non-finite number {constant}"
                )
            ),
        )
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as error:
        raise Halfkp81Depth18StrengthError(f"{label} is invalid JSON") from error
    if type(value) is not dict or canonical_json_bytes(value) != raw:
        raise Halfkp81Depth18StrengthError(f"{label} is not canonical JSON")
    return value


def _selection_set_digest(domain: str, values: list[str]) -> dict[str, Any]:
    ordered = sorted(set(values))
    raw = (
        domain.encode("ascii")
        + b"\0"
        + b"\n".join(value.encode("ascii") for value in ordered)
        + b"\n"
    )
    return {"count": len(ordered), "sha256": hashlib.sha256(raw).hexdigest()}


def _selection_phase(ply: int) -> str:
    for phase, (lower, upper) in SELECTION_PHASE_BOUNDS.items():
        if lower <= ply <= upper:
            return phase
    raise Halfkp81Depth18StrengthError("selected row lies outside phase windows")


def _validate_selection_rows(raw: bytes) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not raw.endswith(b"\n"):
        raise Halfkp81Depth18StrengthError("selection JSONL must end with LF")
    expected_keys = {
        "schema",
        "source_game_id",
        "game_id",
        "source_game_sha256",
        "position_id",
        "sfen",
        "recorded_move",
        "side_to_move",
        "ply",
        "phase",
        "old_depth12_cp",
        "old_outcome",
        "old_depth12_signals_usage",
        "minimum_player_rating",
        "sente_rating",
        "gote_rating",
        "legal_move_count",
        "hardness_cp_outcome_surprise",
        "hardness_tiebreak_sha256",
        "role",
    }
    records: list[dict[str, Any]] = []
    game_ids: set[str] = set()
    position_ids: set[str] = set()
    phase_side = {
        phase: {side: 0 for side in ("b", "w")}
        for phase in SELECTION_PHASE_BOUNDS
    }
    role_side = {
        role: {side: 0 for side in ("b", "w")}
        for role in EXPECTED_ROLE_COUNTS
    }
    role_games = {role: [] for role in EXPECTED_ROLE_COUNTS}
    role_positions = {role: [] for role in EXPECTED_ROLE_COUNTS}
    previous_order: tuple[Any, ...] | None = None
    role_order = {"fit": 0, "tune": 1, "sealed": 2}
    phase_order = {"opening": 0, "mid": 1, "late": 2}
    for line_number, line in enumerate(raw.splitlines(), start=1):
        try:
            record = json.loads(
                line,
                parse_constant=lambda constant: (_ for _ in ()).throw(
                    Halfkp81Depth18StrengthError(
                        f"selection line {line_number} contains {constant}"
                    )
                ),
            )
        except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as error:
            raise Halfkp81Depth18StrengthError(
                f"selection line {line_number} is invalid JSON"
            ) from error
        if (
            type(record) is not dict
            or set(record) != expected_keys
            or canonical_json_bytes(record) != line + b"\n"
        ):
            raise Halfkp81Depth18StrengthError(
                f"selection line {line_number} is not exact canonical JSON"
            )
        if record["schema"] != SELECTION_ROW_SCHEMA:
            raise Halfkp81Depth18StrengthError("selection row schema differs")
        game_id = record["game_id"]
        source_game_id = record["source_game_id"]
        position_id = record["position_id"]
        if (
            type(game_id) is not str
            or SHA256_RE.fullmatch(game_id.removeprefix("sha256:")) is None
            or not game_id.startswith("sha256:")
            or source_game_id != game_id
            or type(position_id) is not str
            or SHA256_RE.fullmatch(position_id.removeprefix("sha256:")) is None
            or not position_id.startswith("sha256:")
            or type(record["source_game_sha256"]) is not str
            or SHA256_RE.fullmatch(record["source_game_sha256"]) is None
            or game_id in game_ids
            or position_id in position_ids
        ):
            raise Halfkp81Depth18StrengthError(
                "selection game/position identity or isolation differs"
            )
        sfen = record["sfen"]
        if type(sfen) is not str or sfen != " ".join(sfen.split()):
            raise Halfkp81Depth18StrengthError("selection SFEN is not canonical")
        fields = sfen.split()
        side = record["side_to_move"]
        ply = record["ply"]
        if (
            len(fields) != 4
            or side not in ("b", "w")
            or fields[1] != side
            or type(ply) is not int
            or ply < 0
        ):
            raise Halfkp81Depth18StrengthError("selection side/ply contract differs")
        try:
            move_number = int(fields[3])
        except ValueError as error:
            raise Halfkp81Depth18StrengthError(
                "selection SFEN move number is invalid"
            ) from error
        computed_position_id = "sha256:" + hashlib.sha256(
            f"sfen-v1\0{' '.join(fields[:3])}".encode("utf-8")
        ).hexdigest()
        phase = _selection_phase(ply)
        role = record["role"]
        if (
            move_number != ply + 1
            or computed_position_id != position_id
            or record["phase"] != phase
            or role not in EXPECTED_ROLE_COUNTS
        ):
            raise Halfkp81Depth18StrengthError(
                "selection semantic position/phase/role differs"
            )
        integer_fields = (
            "old_depth12_cp",
            "minimum_player_rating",
            "sente_rating",
            "gote_rating",
            "legal_move_count",
            "hardness_cp_outcome_surprise",
        )
        if any(type(record[key]) is not int for key in integer_fields):
            raise Halfkp81Depth18StrengthError("selection integer fields differ")
        cp = record["old_depth12_cp"]
        outcome = record["old_outcome"]
        if (
            abs(cp) > 1_000
            or type(outcome) not in (int, float)
            or outcome not in (0, 0.5, 1)
            or record["legal_move_count"] < 2
            or record["minimum_player_rating"]
            != min(record["sente_rating"], record["gote_rating"])
            or record["old_depth12_signals_usage"]
            != "selection_only_never_teacher_target"
            or type(record["recorded_move"]) is not str
            or not record["recorded_move"]
        ):
            raise Halfkp81Depth18StrengthError("selection ranking inputs differ")
        target = 1_000 if outcome == 1 else (-1_000 if outcome == 0 else 0)
        surprise = abs(target - cp)
        tie_material = {
            "game_id": game_id,
            "minimum_player_rating": record["minimum_player_rating"],
            "old_depth12_cp": cp,
            "old_outcome": float(outcome),
            "position_id": position_id,
        }
        tie_sha = hashlib.sha256(canonical_json_bytes(tie_material)).hexdigest()
        if (
            record["hardness_cp_outcome_surprise"] != surprise
            or record["hardness_tiebreak_sha256"] != tie_sha
        ):
            raise Halfkp81Depth18StrengthError("selection hardness binding differs")
        order = (
            role_order[role],
            phase_order[phase],
            side,
            -surprise,
            -record["minimum_player_rating"],
            tie_sha,
        )
        if previous_order is not None and order < previous_order:
            raise Halfkp81Depth18StrengthError("selection row order differs")
        previous_order = order
        game_ids.add(game_id)
        position_ids.add(position_id)
        phase_side[phase][side] += 1
        role_side[role][side] += 1
        role_games[role].append(game_id)
        role_positions[role].append(position_id)
        records.append(record)
    if len(records) != 8_192:
        raise Halfkp81Depth18StrengthError("selection must contain exactly 8192 rows")
    expected_phase_side = {
        PHASE_PLAN_TO_SELECTION[name]: counts
        for name, counts in EXPECTED_PHASE_SIDE_COUNTS.items()
    }
    if phase_side != expected_phase_side or role_side != EXPECTED_ROLE_SIDE_COUNTS:
        raise Halfkp81Depth18StrengthError("selection phase/side or role/side quotas differ")
    role_sets = {
        role: {
            "game_ids": _selection_set_digest(
                f"halfkp81-depth18-selection-v2-{role}-game-ids",
                role_games[role],
            ),
            "position_ids": _selection_set_digest(
                f"halfkp81-depth18-selection-v2-{role}-position-ids",
                role_positions[role],
            ),
        }
        for role in EXPECTED_ROLE_COUNTS
    }
    return records, {
        "phase_side_counts": phase_side,
        "role_side_counts": role_side,
        "unique_game_ids": len(game_ids),
        "unique_position_ids": len(position_ids),
        "cross_role_game_id_overlap": 0,
        "role_sets": role_sets,
    }


def authenticate_selection_artifacts(
    selection_jsonl_path: str,
    selection_manifest_path: str,
    *,
    expected_source_revision: str,
) -> AuthenticatedSelectionEvidence:
    """Authenticate the complete selector output before teacher-plan authority."""

    if (
        type(expected_source_revision) is not str
        or REVISION_RE.fullmatch(expected_source_revision) is None
        or expected_source_revision == "0" * 40
    ):
        raise Halfkp81Depth18StrengthError("merged source revision is invalid")
    selection_raw, selection_held = _read_held_regular_file(
        selection_jsonl_path, "selection JSONL"
    )
    records, accounting = _validate_selection_rows(selection_raw)
    manifest_raw, manifest_held = _read_held_regular_file(
        selection_manifest_path, "selection manifest"
    )
    manifest = _strict_json_bytes(manifest_raw, "selection manifest")
    expected_manifest_fields = {
        "schema",
        "status",
        "exact_large_scratch_source",
        "legal_count_enriched_input",
        "legal_count_manifest",
        "complete_overlap_input",
        "complete_overlap_manifest",
        "complete_overlap_id_count",
        "output",
        "selection",
        "accounting",
        "rejection_counts",
    }
    if set(manifest) != expected_manifest_fields:
        raise Halfkp81Depth18StrengthError("selection manifest fields differ")
    if (
        manifest["schema"] != SELECTION_MANIFEST_SCHEMA
        or manifest["status"] != "selection-only-depth18-labeling-not-yet-run"
        or manifest["exact_large_scratch_source"]
        != {
            "bytes": EXPECTED_SOURCE_IDENTITIES["hard_parent_pool"]["bytes"],
            "rows": EXPECTED_SOURCE_ROWS["hard_parent_pool"],
            "sha256": EXPECTED_SOURCE_IDENTITIES["hard_parent_pool"]["sha256"],
            "row_schema": "shogi-floodgate-scratch-warm-teacher-v1",
        }
    ):
        raise Halfkp81Depth18StrengthError("selection source binding differs")
    output = manifest["output"]
    if (
        type(output) is not dict
        or output
        != {
            "path": selection_held["path"],
            "bytes": selection_held["bytes"],
            "sha256": selection_held["sha256"],
            "rows": len(records),
        }
    ):
        raise Halfkp81Depth18StrengthError("selection output identity differs")
    expected_short_phase_side = {
        PHASE_PLAN_TO_SELECTION[name]: counts
        for name, counts in EXPECTED_PHASE_SIDE_COUNTS.items()
    }
    expected_selection = {
        "hardness_order": [
            "cp_outcome_surprise_desc",
            "minimum_sente_gote_rating_desc",
            "sha256_asc",
        ],
        "old_depth12_cp_outcome_usage": "selection_only_never_teacher_target",
        "phase_side_quotas": expected_short_phase_side,
        "role_side_sizes": EXPECTED_ROLE_SIDE_COUNTS,
        "game_id_split_before_depth18_labels": True,
        "one_position_per_game_id": True,
        "source_game_id_equals_game_id": True,
        "endgame_excluded_for_source_parity_defect": True,
        "abs_old_depth12_cp_max": 1_000,
        "mate_scores_excluded": True,
        "legal_move_count_required_and_at_least": 2,
    }
    if manifest["selection"] != expected_selection or manifest["accounting"] != accounting:
        raise Halfkp81Depth18StrengthError(
            "selection manifest quotas/accounting differ from JSONL"
        )
    rejections = manifest["rejection_counts"]
    if (
        type(rejections) is not dict
        or any(type(key) is not str for key in rejections)
        or any(type(count) is not int or count < 0 for count in rejections.values())
    ):
        raise Halfkp81Depth18StrengthError("selection rejection accounting differs")

    enriched_identity = manifest["legal_count_enriched_input"]
    legal_manifest_identity = manifest["legal_count_manifest"]
    overlap_identity = manifest["complete_overlap_input"]
    overlap_manifest_identity = manifest["complete_overlap_manifest"]
    for label, identity in (
        ("legal enriched input", enriched_identity),
        ("legal manifest", legal_manifest_identity),
        ("overlap inventory", overlap_identity),
        ("overlap manifest", overlap_manifest_identity),
    ):
        if type(identity) is not dict:
            raise Halfkp81Depth18StrengthError(f"{label} binding is invalid")
    if (
        enriched_identity.get("rows") != EXPECTED_SOURCE_ROWS["hard_parent_pool"]
        or type(enriched_identity.get("bytes")) is not int
        or enriched_identity["bytes"] < 1
        or type(enriched_identity.get("sha256")) is not str
        or SHA256_RE.fullmatch(enriched_identity["sha256"]) is None
        or not os.path.isabs(str(enriched_identity.get("path")))
        or {
            key: overlap_identity.get(key)
            for key in ("rows", "bytes", "sha256")
        }
        != OVERLAP_IDENTITY
        or manifest["complete_overlap_id_count"] != OVERLAP_IDENTITY["rows"]
    ):
        raise Halfkp81Depth18StrengthError("selection referenced input binding differs")

    legal_raw, legal_held = _read_held_regular_file(
        str(legal_manifest_identity.get("path")), "legal-count manifest"
    )
    overlap_raw, overlap_held = _read_held_regular_file(
        str(overlap_identity.get("path")), "overlap inventory"
    )
    overlap_manifest_raw, overlap_manifest_held = _read_held_regular_file(
        str(overlap_manifest_identity.get("path")), "overlap manifest"
    )
    for label, recorded, held in (
        ("legal manifest", legal_manifest_identity, legal_held),
        ("overlap inventory", overlap_identity, overlap_held),
        ("overlap manifest", overlap_manifest_identity, overlap_manifest_held),
    ):
        if any(recorded.get(key) != held[key] for key in ("path", "bytes", "sha256")):
            raise Halfkp81Depth18StrengthError(f"{label} identity drift")
    try:
        import select_halfkp81_depth18_hard_parents as selector

        selector._verify_legal_manifest(
            Path(legal_held["path"]),
            legal_raw,
            expected_bytes=legal_held["bytes"],
            expected_sha256=legal_held["sha256"],
            input_identity=enriched_identity,
        )
        selector._verify_overlap_manifest(
            Path(overlap_manifest_held["path"]),
            overlap_manifest_raw,
            expected_bytes=overlap_manifest_held["bytes"],
            expected_sha256=overlap_manifest_held["sha256"],
            overlap_identity=overlap_identity,
        )
    except (ImportError, ValueError) as error:
        raise Halfkp81Depth18StrengthError(
            "selection referenced manifest authentication failed"
        ) from error
    if (
        len(overlap_raw) != OVERLAP_IDENTITY["bytes"]
        or hashlib.sha256(overlap_raw).hexdigest() != OVERLAP_IDENTITY["sha256"]
    ):
        raise Halfkp81Depth18StrengthError("overlap inventory content drift")

    selection_identity = {
        **selection_held,
        "rows": len(records),
        "schema": SELECTION_ROW_SCHEMA,
    }
    manifest_identity = {
        **manifest_held,
        "schema": SELECTION_MANIFEST_SCHEMA,
    }
    evidence = {
        "schema": SELECTION_EVIDENCE_SCHEMA,
        "status": "authenticated-selection-complete-teacher-plan-eligible",
        "source_revision": expected_source_revision,
        "selection_jsonl": selection_identity,
        "selection_manifest": manifest_identity,
        "phase_name_map": PHASE_PLAN_TO_SELECTION,
        "accounting": accounting,
        "bindings": {
            "exact_large_scratch_source": manifest["exact_large_scratch_source"],
            "legal_count_enriched_input": enriched_identity,
            "legal_count_manifest": legal_manifest_identity,
            "complete_overlap_input": overlap_identity,
            "complete_overlap_manifest": overlap_manifest_identity,
        },
        "verification": {
            "held_descriptor_double_read": True,
            "canonical_8192_rows": True,
            "phase_side_quotas": True,
            "role_side_quotas": True,
            "one_game_one_position": True,
            "cross_role_game_overlap_zero": True,
            "source_overlap_legal_bindings": True,
        },
    }
    return AuthenticatedSelectionEvidence(copy.deepcopy(evidence))


def validate_preregistration_document(value: Any) -> dict[str, Any]:
    required = {
        "schema",
        "status",
        "family",
        "objective",
        "claim_boundary",
        "source_inputs",
        "selection",
        "teacher",
        "training",
        "gates",
        "stop_rules",
        "forbidden",
        "current_state",
    }
    if type(value) is not dict or set(value) != required:
        raise Halfkp81Depth18StrengthError("preregistration fields differ")
    _exact(value, "schema", PREREGISTRATION_SCHEMA)
    _exact(value, "status", "prospective-not-executed")
    _exact(value, "family", "halfkp81-hard-depth18-strength-v1")
    _exact(value, "objective", EXPECTED_OBJECTIVE)
    _exact(value, "claim_boundary", EXPECTED_CLAIM_BOUNDARY)

    source = value["source_inputs"]
    if type(source) is not dict or set(source) != {
        "direct_replay_fit",
        "direct_preservation_validation",
        "hard_parent_pool",
        "hard_parent_pool_manifest",
        "initializer_checkpoint",
        "initializer_export",
        "live_baseline",
        "v9_teacher_authority_result",
        "v4_terminal_result_memo",
    }:
        raise Halfkp81Depth18StrengthError("source_inputs fields differ")
    row_bearing_sources = {
        "direct_replay_fit",
        "direct_preservation_validation",
        "hard_parent_pool",
    }
    for name in (
        "direct_replay_fit",
        "direct_preservation_validation",
        "hard_parent_pool",
        "hard_parent_pool_manifest",
        "initializer_checkpoint",
        "initializer_export",
        "live_baseline",
        "v9_teacher_authority_result",
    ):
        expected_fields = (
            {"identity", "rows"} if name in row_bearing_sources else {"identity"}
        )
        if type(source[name]) is not dict or set(source[name]) != expected_fields:
            raise Halfkp81Depth18StrengthError(f"{name} source fields differ")
        observed_identity = _identity(
            source[name]["identity"],
            label=name,
            absolute=name != "live_baseline",
        )
        if observed_identity != EXPECTED_SOURCE_IDENTITIES[name]:
            raise Halfkp81Depth18StrengthError(f"{name} identity differs")
    v4_memo_identity = _identity(
        source["v4_terminal_result_memo"]["identity"],
        label="v4 terminal result memo",
        absolute=False,
    )
    if (
        type(source["v4_terminal_result_memo"]) is not dict
        or set(source["v4_terminal_result_memo"]) != {"identity"}
        or v4_memo_identity != EXPECTED_V4_MEMO_IDENTITY
    ):
        raise Halfkp81Depth18StrengthError("v4 terminal result memo differs")
    observed_rows = {
        "direct_replay_fit": source["direct_replay_fit"]["rows"],
        "direct_preservation_validation": source[
            "direct_preservation_validation"
        ]["rows"],
        "hard_parent_pool": source["hard_parent_pool"]["rows"],
    }
    for key, count in observed_rows.items():
        if count != EXPECTED_SOURCE_ROWS[key]:
            raise Halfkp81Depth18StrengthError(f"{key} row count differs")

    selection = value["selection"]
    _exact(selection, "schema", SELECTION_PLAN_SCHEMA)
    _exact(selection, "parents", 8_192)
    _exact(selection, "role_counts", EXPECTED_ROLE_COUNTS)
    _exact(selection, "role_side_counts", EXPECTED_ROLE_SIDE_COUNTS)
    _exact(selection, "phase_counts", EXPECTED_PHASE_COUNTS)
    _exact(selection, "phase_side_counts", EXPECTED_PHASE_SIDE_COUNTS)
    _exact(selection, "split_unit", "game_id-before-labels")
    _exact(selection, "one_position_per_game", True)
    _exact(
        selection,
        "semantic_overlap_exclusion",
        "all-direct-train-validation-and-bound-selected-v2-v4-formal-opening-prefixes",
    )
    _exact(selection, "exclude_mate_scores", True)
    _exact(selection, "minimum_legal_moves", 2)
    _exact(selection, "old_cp_absolute_maximum", 1_000)
    _exact(
        selection,
        "ranking",
        "depth12-cp-outcome-surprise-desc-then-minimum-player-rating-desc-then-sha256",
    )
    _exact(selection, "old_depth12_cp_role", "selection-only-never-teacher-target")
    _exact(selection, "central_heavy_diagnostic_role", "exploratory-not-selector")

    if set(selection) != {
        "schema",
        "parents",
        "role_counts",
        "role_side_counts",
        "phase_counts",
        "phase_side_counts",
        "split_unit",
        "one_position_per_game",
        "semantic_overlap_exclusion",
        "exclude_mate_scores",
        "minimum_legal_moves",
        "old_cp_absolute_maximum",
        "ranking",
        "old_depth12_cp_role",
        "central_heavy_diagnostic_role",
    }:
        raise Halfkp81Depth18StrengthError("selection fields differ")
    _exact(value, "teacher", EXPECTED_TEACHER)
    _exact(value, "training", EXPECTED_TRAINING)
    _exact(value, "gates", EXPECTED_GATES)
    if value["stop_rules"] != [
        "any-incomplete-or-nondepth18-teacher-row-is-fatal",
        "stop-at-first-failed-gate",
        "no-extra-epoch-seed-qat-distillation-or-threshold-change",
        "no-same-candidate-continuation",
    ]:
        raise Halfkp81Depth18StrengthError("stop_rules differ")
    if value["forbidden"] != {
        "old_depth12_cp_as_teacher_target": False,
        "central_heavy_as_sole_selector_condition": False,
        "same_candidate_continuation": False,
        "threshold_change_after_results": False,
        "extra_epoch_or_seed": False,
        "qat_or_distillation": False,
        "live_weight_write_authorized": False,
    }:
        raise Halfkp81Depth18StrengthError("forbidden authority differs")
    if value["current_state"] != {
        "selection_executed": False,
        "teacher_executed": False,
        "training_executed": False,
        "formal_games": 0,
        "live_weights_changed": False,
    }:
        raise Halfkp81Depth18StrengthError("current_state differs")
    return copy.deepcopy(value)


def validate_teacher_plan(
    value: Any,
    *,
    authenticated_selection: AuthenticatedSelectionEvidence,
    expected_source_revision: str,
) -> dict[str, Any]:
    fields = {
        "schema",
        "status",
        "source_revision",
        "preregistration",
        "selection_manifest",
        "selection_evidence",
        "selection_roles",
        "engine",
        "teacher",
        "outputs",
        "authority",
    }
    if type(value) is not dict or set(value) != fields:
        raise Halfkp81Depth18StrengthError("teacher plan fields differ")
    _exact(value, "schema", TEACHER_PLAN_SCHEMA)
    _exact(value, "status", "sealed-not-executed")
    if (
        type(expected_source_revision) is not str
        or REVISION_RE.fullmatch(expected_source_revision) is None
        or expected_source_revision == "0" * 40
        or value["source_revision"] != expected_source_revision
    ):
        raise Halfkp81Depth18StrengthError(
            "source_revision differs from authenticated merged revision"
        )
    if type(authenticated_selection) is not AuthenticatedSelectionEvidence:
        raise Halfkp81Depth18StrengthError(
            "authenticated selection evidence object is required"
        )
    evidence = copy.deepcopy(dict(authenticated_selection.document))
    if (
        set(evidence)
        != {
            "schema",
            "status",
            "source_revision",
            "selection_jsonl",
            "selection_manifest",
            "phase_name_map",
            "accounting",
            "bindings",
            "verification",
        }
        or evidence["schema"] != SELECTION_EVIDENCE_SCHEMA
        or evidence["status"]
        != "authenticated-selection-complete-teacher-plan-eligible"
        or evidence["source_revision"] != expected_source_revision
        or evidence["phase_name_map"] != PHASE_PLAN_TO_SELECTION
        or type(evidence["accounting"]) is not dict
        or type(evidence["bindings"]) is not dict
        or type(evidence["verification"]) is not dict
        or type(evidence["selection_jsonl"]) is not dict
        or type(evidence["selection_manifest"]) is not dict
        or set(evidence["selection_manifest"])
        != {
            "path",
            "bytes",
            "sha256",
            "held_read_only_descriptor",
            "stable_double_read",
            "schema",
        }
        or set(evidence["selection_jsonl"])
        != {
            "path",
            "bytes",
            "sha256",
            "held_read_only_descriptor",
            "stable_double_read",
            "rows",
            "schema",
        }
        or evidence["selection_jsonl"].get("rows") != 8_192
        or evidence["selection_jsonl"].get("schema") != SELECTION_ROW_SCHEMA
        or evidence["selection_manifest"].get("schema")
        != SELECTION_MANIFEST_SCHEMA
        or evidence["accounting"].get("phase_side_counts")
        != {
            PHASE_PLAN_TO_SELECTION[name]: counts
            for name, counts in EXPECTED_PHASE_SIDE_COUNTS.items()
        }
        or evidence["accounting"].get("role_side_counts")
        != EXPECTED_ROLE_SIDE_COUNTS
        or evidence["verification"]
        != {
            "held_descriptor_double_read": True,
            "canonical_8192_rows": True,
            "phase_side_quotas": True,
            "role_side_quotas": True,
            "one_game_one_position": True,
            "cross_role_game_overlap_zero": True,
            "source_overlap_legal_bindings": True,
        }
    ):
        raise Halfkp81Depth18StrengthError(
            "authenticated selection evidence is invalid"
        )
    if value["selection_evidence"] != evidence:
        raise Halfkp81Depth18StrengthError(
            "teacher plan selection evidence differs"
        )
    preregistration_identity = _identity(
        value["preregistration"],
        label="preregistration",
        absolute=False,
        schema=PREREGISTRATION_SCHEMA,
    )
    if preregistration_identity != EXPECTED_PREREGISTRATION_IDENTITY:
        raise Halfkp81Depth18StrengthError("preregistration identity differs")
    selection_manifest_identity = _identity(
        value["selection_manifest"],
        label="selection manifest",
        absolute=True,
        schema=SELECTION_MANIFEST_SCHEMA,
    )
    evidence_manifest = evidence["selection_manifest"]
    authenticated_selection_identity = _identity(
        {
            key: evidence_manifest[key]
            for key in ("path", "bytes", "sha256", "schema")
        },
        label="authenticated selection manifest",
        absolute=True,
        schema=SELECTION_MANIFEST_SCHEMA,
    )
    if selection_manifest_identity != authenticated_selection_identity:
        raise Halfkp81Depth18StrengthError(
            "selection manifest identity differs from authenticated input"
        )
    if value["selection_roles"] != EXPECTED_ROLE_COUNTS:
        raise Halfkp81Depth18StrengthError("selection role counts differ")
    engine = value["engine"]
    if type(engine) is not dict or set(engine) != set(EXPECTED_ENGINE):
        raise Halfkp81Depth18StrengthError("engine fields differ")
    _identity(engine["binary"], label="engine binary", absolute=True)
    _identity(engine["eval_file"], label="engine eval file", absolute=True)
    if engine != EXPECTED_ENGINE:
        raise Halfkp81Depth18StrengthError("engine identity differs")
    if value["teacher"] != EXPECTED_TEACHER:
        raise Halfkp81Depth18StrengthError("teacher settings differ")
    outputs = value["outputs"]
    if type(outputs) is not dict or set(outputs) != {
        "directory",
        "plan_json",
        "fit_jsonl",
        "tune_jsonl",
        "sealed_jsonl",
        "receipt_json",
    }:
        raise Halfkp81Depth18StrengthError("teacher output fields differ")
    if not all(type(path) is str and os.path.isabs(path) for path in outputs.values()):
        raise Halfkp81Depth18StrengthError("teacher outputs must be absolute")
    directory = outputs["directory"]
    artifact_paths = [
        outputs[name]
        for name in (
            "plan_json",
            "fit_jsonl",
            "tune_jsonl",
            "sealed_jsonl",
            "receipt_json",
        )
    ]
    if (
        os.path.normpath(directory) != directory
        or any(os.path.normpath(path) != path for path in artifact_paths)
        or any(os.path.dirname(path) != directory for path in artifact_paths)
        or len(set(artifact_paths)) != len(artifact_paths)
    ):
        raise Halfkp81Depth18StrengthError(
            "teacher outputs must be distinct canonical children of directory"
        )
    if value["authority"] != {
        "may_execute_teacher": True,
        "may_train": False,
        "may_play_formal_games": False,
        "may_write_live_weights": False,
    }:
        raise Halfkp81Depth18StrengthError("teacher plan authority differs")
    return copy.deepcopy(value)


def validate_teacher_receipt(
    value: Any,
    *,
    expected_plan: Mapping[str, Any],
    authenticated_selection: AuthenticatedSelectionEvidence,
    expected_source_revision: str,
) -> dict[str, Any]:
    validate_teacher_plan(
        expected_plan,
        authenticated_selection=authenticated_selection,
        expected_source_revision=expected_source_revision,
    )
    fields = {
        "schema",
        "status",
        "teacher_plan",
        "completed_parents",
        "completed_rows",
        "role_parents",
        "role_rows",
        "depth",
        "technical_faults",
        "incomplete_parents",
        "old_depth12_targets",
        "outputs",
        "artifact_verification",
        "authority",
    }
    if type(value) is not dict or set(value) != fields:
        raise Halfkp81Depth18StrengthError("teacher receipt fields differ")
    _exact(value, "schema", TEACHER_RECEIPT_SCHEMA)
    _exact(value, "status", "structurally-complete-awaiting-artifact-verification")
    _identity(
        value["teacher_plan"],
        label="teacher plan",
        absolute=True,
        schema=TEACHER_PLAN_SCHEMA,
    )
    expected_plan_raw = canonical_json_bytes(expected_plan)
    expected_plan_identity = {
        "path": expected_plan["outputs"]["plan_json"],
        "bytes": len(expected_plan_raw),
        "sha256": hashlib.sha256(expected_plan_raw).hexdigest(),
        "schema": TEACHER_PLAN_SCHEMA,
    }
    if value["teacher_plan"] != expected_plan_identity:
        raise Halfkp81Depth18StrengthError("receipt teacher plan identity differs")
    if value["completed_parents"] != 8_192:
        raise Halfkp81Depth18StrengthError("teacher parent count differs")
    rows = value["completed_rows"]
    if type(rows) is not int or not 8_192 <= rows <= EXPECTED_TEACHER["maximum_rows"]:
        raise Halfkp81Depth18StrengthError("teacher row count is invalid")
    if value["role_parents"] != EXPECTED_ROLE_COUNTS:
        raise Halfkp81Depth18StrengthError("teacher role counts differ")
    role_rows = value["role_rows"]
    if (
        type(role_rows) is not dict
        or set(role_rows) != set(EXPECTED_ROLE_COUNTS)
        or any(
            type(count) is not int
            or count < EXPECTED_ROLE_COUNTS[role]
            or count
            > EXPECTED_ROLE_COUNTS[role]
            * EXPECTED_TEACHER["maximum_rows_per_parent"]
            for role, count in role_rows.items()
        )
        or sum(role_rows.values()) != rows
    ):
        raise Halfkp81Depth18StrengthError("teacher role rows are invalid")
    if (
        value["depth"] != 18
        or value["technical_faults"] != 0
        or value["incomplete_parents"] != 0
        or value["old_depth12_targets"] != 0
    ):
        raise Halfkp81Depth18StrengthError("teacher completion is invalid")
    outputs = value["outputs"]
    if type(outputs) is not dict or set(outputs) != {"fit", "tune", "sealed"}:
        raise Halfkp81Depth18StrengthError("teacher receipt outputs differ")
    for role in ("fit", "tune", "sealed"):
        identity = _identity(
            outputs[role], label=f"{role} teacher output", absolute=True
        )
        if identity["path"] != expected_plan["outputs"][f"{role}_jsonl"]:
            raise Halfkp81Depth18StrengthError(
                f"{role} teacher output path differs"
            )
    if len({outputs[role]["path"] for role in outputs}) != 3:
        raise Halfkp81Depth18StrengthError("teacher output paths are not distinct")
    if value["artifact_verification"] != {
        "held_descriptor_content_scan": False,
        "actual_bytes_sha256_rows_recomputed": False,
        "selected_parent_role_membership_recomputed": False,
        "every_target_depth18_recomputed": False,
        "old_depth12_target_absence_recomputed": False,
    }:
        raise Halfkp81Depth18StrengthError(
            "teacher artifact verification state differs"
        )
    if value["authority"] != {
        "may_build_training_plan": False,
        "may_train": False,
        "may_play_formal_games": False,
        "may_write_live_weights": False,
    }:
        raise Halfkp81Depth18StrengthError("teacher receipt authority differs")
    return copy.deepcopy(value)
