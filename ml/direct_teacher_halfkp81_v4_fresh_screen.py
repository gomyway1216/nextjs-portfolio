#!/usr/bin/env python3
"""Prepare and run the one-shot HalfKP81 v4 fresh-opening paired56 screen."""

from __future__ import annotations

import argparse
from collections.abc import Callable, Mapping, Sequence
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
from typing import Any

import build_direct_teacher_halfkp81_v4_fresh_openings as OPENING_BUILDER
import direct_teacher_halfkp81_v4_robust_protocol as V4
import run_direct_teacher_halfkp81_v4_robust_adjudication as V4_RUNNER
from nnue_fixed_time_gate import ChildResult, PairResult, parse_pair_log


OPENING_SCHEMA = "shogi-direct-teacher-halfkp81-v4-fresh-opening-manifest-v1"
PLAN_SCHEMA = "shogi-direct-teacher-halfkp81-v4-fresh-paired56-plan-v1"
RUN_SCHEMA = "shogi-direct-teacher-halfkp81-v4-fresh-paired56-run-v1"
PAIR_SCHEMA = "shogi-direct-teacher-halfkp81-v4-fresh-paired56-pair-v1"
RESULT_SCHEMA = "shogi-direct-teacher-halfkp81-v4-fresh-paired56-result-v1"
PAIR_COUNT = 28
GAME_COUNT = 56
PAIR_WORKERS = 12
MILLISECONDS_PER_MOVE = 1_500
MAXIMUM_PLIES = 512
PASS_HALFPOINTS = 62
DENOMINATOR_HALFPOINTS = 112
PAIR_SEED_START = 1_300_001
BUCKETS = 81
OPENING_MANIFEST_PATH = (
    "ml/protocols/direct-teacher-halfkp81-v4-fresh-opening-manifest.json"
)
CONTROLLER_PATH = "ml/direct_teacher_halfkp81_v4_fresh_screen.py"
RUNTIME_PATH = "wasm-spike/artifacts/shogi-halfkp81-research.wasm"
HARNESS_PATH = "wasm-spike/match-nnue-vs-v3.ts"
BUNDLE_PATH = "wasm-spike/match-nnue-vs-v3.bundle.cjs"
NODE_PATH = "/usr/local/bin/node"
PLAN_PATH = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "direct-teacher-halfkp81-v4-fresh-paired56-plan-v1/plan.json"
)
RUN_DIRECTORY = (
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "direct-teacher-halfkp81-v4-fresh-paired56-run-v1"
)
PAIR_DIGEST_DOMAIN = "shogi-direct-teacher-halfkp81-v4-fresh-paired56-pair-v1\0"
RESULT_DIGEST_DOMAIN = "shogi-direct-teacher-halfkp81-v4-fresh-paired56-result-v1\0"
TECHNICAL_FAULT_DIGEST_DOMAIN = (
    "shogi-direct-teacher-halfkp81-v4-fresh-paired56-technical-fault-v1\0"
)
OPENING_SET_DOMAIN = "shogi-direct-teacher-halfkp81-v4-fresh-opening-set-v1\0"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")

EXPECTED_OPENING_MANIFEST = {
    "path": OPENING_MANIFEST_PATH,
    "bytes": 228_133,
    "sha256": "8ec8422303f9504306a20ea41aa1755ba8d4a336b6118bfb958d91cda2ed64b9",
    "schema": OPENING_SCHEMA,
}
EXPECTED_STATIC_RESULT = {
    "path": V4.RESULT_PATH,
    "bytes": 3_910,
    "sha256": "a5e02de08ad116578937bf81a1d27f5d9a9ab197e84fadf7f42efb20affb5b7a",
    "schema": V4.RESULT_SCHEMA,
}
EXPECTED_CANDIDATE = {
    **V4.EXPECTED_CANDIDATE,
    "buckets": BUCKETS,
}
EXPECTED_INITIALIZER = {
    "path": (
        "/Users/yudaiyaguchi/.codex/shogi-runs/"
        "direct-teacher-halfkp81-v3-cpu-one-shot-v1/"
        "trainer-output/initializer-weights.bin"
    ),
    "bytes": 94_656_708,
    "sha256": "2b91060fe98c13d57341bdf0c773094c6489b7e508d6d6afd4051565dfb9b47c",
    "buckets": BUCKETS,
}
EXPECTED_RUNTIME = {
    "path": RUNTIME_PATH,
    "bytes": 35_837,
    "sha256": "1b95659d54fc897e2ff766583ccc2035a0932929fcb9520800c3a5ca2b1430db",
}
EXPECTED_HARNESS = {
    "path": HARNESS_PATH,
    "bytes": 16_401,
    "sha256": "370b35d14bfee4174d78812849005b82124b1e98f9215bbddd2da371741f933b",
}
EXPECTED_BUNDLE = {
    "path": BUNDLE_PATH,
    "bytes": 267_981,
    "sha256": "5ae052282d059493740f61c8ef283fb0f2ac77bb73c7501c7eee0232d1c5665e",
}
EXPECTED_NODE = {
    "path": NODE_PATH,
    "bytes": 189_769_216,
    "sha256": "cdd2e1eded8530fa2f7a828496ab1ed849d524510198f8c7c0bee9d81d1728d7",
}
EXPECTED_HISTORICAL = {
    "path": "ml/protocols/bounded-quiet-history-existing-openings-v1.json",
    "bytes": 278_625,
    "sha256": "093c504ec71192d35cc900daa74906d4c0205750f270ea157f08b3ba5948ac8d",
    "fingerprints": 3_198,
}
EXPECTED_V2_PROSPECTIVE = {
    "path": "ml/protocols/direct-teacher-halfkp81-v2-screen-openings.json",
    "bytes": 6_208,
    "sha256": "cc521ace5dfaf39c3c97238a1877456ca55e9b42630c4d4413184a9da5f25744",
    "fingerprints": 28,
}
EXPECTED_PRIVATE_SNAPSHOT = {
    "root": "~/.codex/shogi-runs",
    "files_scanned": 2_104,
    "files_with_openings": 1_456,
    "source_file_identity_list_sha256": (
        "ce47150039aba00d5cc2e1dde160e9cff4aa32dbadbd8dba0562415c73ec6ed5"
    ),
    "unique_fingerprints": 681,
}
EXPECTED_TRACKED_PROTOCOL_SNAPSHOT = {
    "root": "ml/protocols",
    "files_scanned": 78,
    "files_with_openings": 3,
    "source_file_identity_list_sha256": (
        "47ca49c7aa4a129540354d549eefd092330a18b47b8e625e917a5243a151d27d"
    ),
    "unique_fingerprints": 104,
}
EXPECTED_PRIOR_UNION_COUNT = 3_302
EXPECTED_PRIOR_UNION_SHA256 = (
    "0349fb8a37a3711958457e7ae0f283bb9dad18103f3c47492794c8238dd564d7"
)
EXPECTED_OPENING_SET_SHA256 = (
    "c5a75357a7e9c75e3348cbb125e33fccbab3844142887f5648bdedd980a74641"
)


class DirectTeacherHalfkp81V4FreshScreenError(ValueError):
    """The v4 fresh screen plan, inputs, or one-shot output violated contract."""


@dataclass(frozen=True)
class ScreenPair:
    pair_index: int
    seed: int
    opening_fingerprint: str
    candidate_sente: str
    candidate_gote: str
    legal_moves: int
    log_bytes: int
    log_sha256: str
    receipt_sha256: str

    @property
    def halfpoints(self) -> int:
        return _halfpoints(self.candidate_sente) + _halfpoints(self.candidate_gote)


PairExecutor = Callable[[str | Path, Mapping[str, Any], int, int], ChildResult]


def _canonical(value: Any) -> bytes:
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


def _sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _domain_digest(domain: str, value: Any) -> str:
    raw = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return _sha256(domain.encode("utf-8") + raw)


def _exact(value: Any, fields: set[str], label: str) -> Mapping[str, Any]:
    if type(value) is not dict or set(value) != fields:
        raise DirectTeacherHalfkp81V4FreshScreenError(f"{label} fields differ")
    return value


def _load_json(path: str, label: str) -> tuple[dict[str, Any], dict[str, Any]]:
    try:
        value, identity = V4.load_strict_json_file(path, label)
    except V4.DirectTeacherHalfkpV4RobustError as error:
        raise DirectTeacherHalfkp81V4FreshScreenError(str(error)) from error
    if type(value) is not dict:
        raise DirectTeacherHalfkp81V4FreshScreenError(f"{label} is not an object")
    return value, identity


def _resolve(repo_root: str | Path, path: str) -> str:
    configured = Path(path).expanduser()
    if not configured.is_absolute():
        configured = Path(repo_root).resolve() / configured
    return str(configured.resolve())


def _file_identity(
    repo_root: str | Path,
    expected: Mapping[str, Any],
    label: str,
) -> dict[str, Any]:
    path = _resolve(repo_root, expected["path"])
    try:
        observed = V4.file_identity(path, label)
    except V4.DirectTeacherHalfkpV4RobustError as error:
        raise DirectTeacherHalfkp81V4FreshScreenError(str(error)) from error
    if any(observed[field] != expected[field] for field in ("bytes", "sha256")):
        raise DirectTeacherHalfkp81V4FreshScreenError(f"{label} identity differs")
    return dict(expected)


def _authenticate_node_executable() -> dict[str, Any]:
    path = Path(NODE_PATH)
    try:
        info = path.lstat()
    except OSError as error:
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "pinned Node executable is unavailable"
        ) from error
    if (
        not stat.S_ISREG(info.st_mode)
        or path.resolve() != path
        or info.st_uid != 0
        or info.st_gid != 0
        or stat.S_IMODE(info.st_mode) != 0o755
    ):
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "pinned Node executable ownership or mode differs"
        )
    return _file_identity("/", EXPECTED_NODE, "pinned Node executable")


def _read_authenticated_bytes(
    repo_root: str | Path,
    expected: Mapping[str, Any],
    label: str,
) -> bytes:
    path = _resolve(repo_root, str(expected["path"]))
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(path, flags)
    except OSError as error:
        raise DirectTeacherHalfkp81V4FreshScreenError(
            f"{label} cannot be opened without following a symlink"
        ) from error
    try:
        before = os.fstat(descriptor)
        chunks: list[bytes] = []
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    raw = b"".join(chunks)
    stable_fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
    if (
        not stat.S_ISREG(before.st_mode)
        or any(
            getattr(before, field) != getattr(after, field) for field in stable_fields
        )
        or len(raw) != expected["bytes"]
        or _sha256(raw) != expected["sha256"]
    ):
        raise DirectTeacherHalfkp81V4FreshScreenError(
            f"{label} changed while being authenticated"
        )
    return raw


def _canonical_list_sha256(values: Sequence[str]) -> str:
    raw = json.dumps(
        list(values),
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return _sha256(raw)


def _opening_set_sha256(values: Sequence[str]) -> str:
    raw = json.dumps(
        list(values),
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return _sha256(OPENING_SET_DOMAIN.encode("utf-8") + raw)


def validate_opening_manifest(
    value: Any,
    *,
    repo_root: str | Path,
) -> dict[str, Any]:
    manifest = _exact(
        value,
        {
            "schema",
            "status",
            "bindings",
            "prior_opening_inventory",
            "selection",
            "authority",
        },
        "v4 opening manifest",
    )
    if (
        manifest["schema"] != OPENING_SCHEMA
        or manifest["status"] != "frozen-after-v4-static-pass-before-paired-game-1"
    ):
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "v4 opening manifest boundary differs"
        )
    bindings = _exact(
        manifest["bindings"],
        {"v4_protocol", "v4_static_result", "opening_generator"},
        "opening bindings",
    )
    if (
        bindings["v4_protocol"] != V4.EXPECTED_PROTOCOL_IDENTITY
        or bindings["v4_static_result"] != EXPECTED_STATIC_RESULT
        or bindings["opening_generator"]
        != {
            "path": "wasm-spike/nnue-fixed-time-opening.ts",
            "bytes": 3_951,
            "sha256": (
                "d03bbdfe872b0cb9131b8aa91790852eceee6dc6561a0feca6f5f518be57b40e"
            ),
        }
    ):
        raise DirectTeacherHalfkp81V4FreshScreenError("v4 opening bindings differ")
    for label, expected in (
        ("opening v4 protocol", V4.EXPECTED_PROTOCOL_IDENTITY),
        ("opening v4 result", EXPECTED_STATIC_RESULT),
        ("opening generator", bindings["opening_generator"]),
    ):
        _file_identity(repo_root, expected, label)

    inventory = _exact(
        manifest["prior_opening_inventory"],
        {
            "historical",
            "v2_prospective",
            "private_run_snapshot",
            "tracked_protocol_snapshot",
            "union_fingerprints",
            "canonical_list_sha256",
            "full_sorted_unique_fingerprints",
        },
        "v4 prior opening inventory",
    )
    if (
        inventory["historical"] != EXPECTED_HISTORICAL
        or inventory["v2_prospective"] != EXPECTED_V2_PROSPECTIVE
        or inventory["private_run_snapshot"] != EXPECTED_PRIVATE_SNAPSHOT
        or inventory["tracked_protocol_snapshot"] != EXPECTED_TRACKED_PROTOCOL_SNAPSHOT
        or inventory["union_fingerprints"] != EXPECTED_PRIOR_UNION_COUNT
        or inventory["canonical_list_sha256"] != EXPECTED_PRIOR_UNION_SHA256
    ):
        raise DirectTeacherHalfkp81V4FreshScreenError("v4 prior opening source differs")
    for label, expected in (
        ("historical opening inventory", EXPECTED_HISTORICAL),
        ("v2 prospective openings", EXPECTED_V2_PROSPECTIVE),
    ):
        _file_identity(repo_root, expected, label)
    prior = inventory["full_sorted_unique_fingerprints"]
    if (
        type(prior) is not list
        or len(prior) != EXPECTED_PRIOR_UNION_COUNT
        or prior != sorted(set(prior))
        or any(
            type(item) is not str or SHA256_RE.fullmatch(item) is None for item in prior
        )
        or _canonical_list_sha256(prior) != EXPECTED_PRIOR_UNION_SHA256
    ):
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "v4 prior opening union is invalid"
        )

    selection = _exact(
        manifest["selection"],
        {
            "rule",
            "pair_seed_scan_start",
            "pairs",
            "games_per_pair",
            "colors",
            "fingerprint_domain",
            "derived_seed_rule",
            "pair_index_within_harness",
            "skipped",
            "pairs_selected",
            "opening_set_sha256",
            "prior_inventory_overlap",
            "within_selection_duplicates",
        },
        "v4 opening selection",
    )
    if (
        selection["rule"]
        != (
            "scan upward from 1300001 and accept the first 28 fingerprints "
            "absent from the frozen complete prior inventory and this selection"
        )
        or selection["pair_seed_scan_start"] != PAIR_SEED_START
        or selection["pairs"] != PAIR_COUNT
        or selection["games_per_pair"] != 2
        or selection["colors"] != ["candidate-sente", "candidate-gote"]
        or selection["fingerprint_domain"] != "shogi-nnue-fixed-time-opening-v1\0"
        or selection["derived_seed_rule"]
        != ("0x5eed00 + pair_seed * 15485863 + " "pair_index_within_harness * 104729")
        or selection["pair_index_within_harness"] != 0
        or selection["skipped"] != []
        or selection["opening_set_sha256"] != EXPECTED_OPENING_SET_SHA256
        or selection["prior_inventory_overlap"] != 0
        or selection["within_selection_duplicates"] != 0
    ):
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "v4 opening selection contract differs"
        )
    selected = selection["pairs_selected"]
    if type(selected) is not list or len(selected) != PAIR_COUNT:
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "v4 opening selection count differs"
        )
    fingerprints: list[str] = []
    for index, raw in enumerate(selected):
        item = _exact(
            raw,
            {"pair_index", "seed", "derived_seed", "opening_fingerprint"},
            f"v4 opening {index}",
        )
        seed = PAIR_SEED_START + index
        fingerprint = item["opening_fingerprint"]
        if (
            item["pair_index"] != index
            or item["seed"] != seed
            or item["derived_seed"] != 0x5EED00 + seed * 15_485_863
            or type(fingerprint) is not str
            or SHA256_RE.fullmatch(fingerprint) is None
        ):
            raise DirectTeacherHalfkp81V4FreshScreenError(
                f"v4 opening {index} binding differs"
            )
        fingerprints.append(fingerprint)
    if (
        len(set(fingerprints)) != PAIR_COUNT
        or set(fingerprints).intersection(prior)
        or _opening_set_sha256(fingerprints) != EXPECTED_OPENING_SET_SHA256
    ):
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "v4 selected openings are not fresh and unique"
        )
    if manifest["authority"] != {
        "paired_game_1_authorized": False,
        "old_v3_paired56_authorized": False,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
    }:
        raise DirectTeacherHalfkp81V4FreshScreenError("opening-only authority differs")
    return json.loads(json.dumps(manifest))


def _git_output(repo_root: str, *args: str) -> str:
    try:
        return subprocess.run(
            ["/usr/bin/git", *args],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError) as error:
        raise DirectTeacherHalfkp81V4FreshScreenError(
            f"git {' '.join(args)} failed"
        ) from error


def verify_source_revision(repo_root: str) -> str:
    revision = _git_output(repo_root, "rev-parse", "HEAD")
    if REVISION_RE.fullmatch(revision) is None:
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "v4 screen source revision is invalid"
        )
    if _git_output(repo_root, "status", "--porcelain"):
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "v4 screen source tree is not clean"
        )
    try:
        subprocess.run(
            [
                "/usr/bin/git",
                "merge-base",
                "--is-ancestor",
                "417705166875150595d7c60620baa438ab3b3304",
                revision,
            ],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "merged v4 static protocol is not an ancestor"
        ) from error
    return revision


def _load_formal_static_result(repo_root: str) -> dict[str, Any]:
    value, identity = _load_json(V4.RESULT_PATH, "formal v4 static result")
    expected_identity = {
        "path": V4.RESULT_PATH,
        "bytes": identity["bytes"],
        "sha256": identity["sha256"],
        "schema": V4.RESULT_SCHEMA,
    }
    if expected_identity != EXPECTED_STATIC_RESULT:
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "formal v4 result identity differs"
        )
    try:
        validated = V4.validate_result(value, repo_root=repo_root)
    except V4.DirectTeacherHalfkpV4RobustError as error:
        raise DirectTeacherHalfkp81V4FreshScreenError(str(error)) from error
    authority = validated["authority"]
    if (
        validated["all_checks_passed"] is not True
        or validated["status"]
        != "passed-all-robust-checks-fresh-v4-paired56-authorized"
        or authority["fresh_v4_paired56_authorized"] is not True
        or authority["old_v3_paired56_authorized"] is not False
        or authority["optimizer_creation_authorized"] is not False
        or authority["expanded_stage_authorized"] is not False
        or authority["live_weight_write_authorized"] is not False
    ):
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "formal v4 result does not grant only fresh paired56"
        )
    return validated


def build_plan(*, repo_root: str) -> dict[str, Any]:
    root = str(Path(repo_root).resolve())
    source_revision = verify_source_revision(root)
    _load_formal_static_result(root)
    manifest_path = _resolve(root, OPENING_MANIFEST_PATH)
    manifest, identity = _load_json(manifest_path, "tracked v4 opening manifest")
    manifest = validate_opening_manifest(manifest, repo_root=root)
    manifest_identity = {
        "path": OPENING_MANIFEST_PATH,
        "bytes": identity["bytes"],
        "sha256": identity["sha256"],
        "schema": OPENING_SCHEMA,
    }
    if manifest_identity != EXPECTED_OPENING_MANIFEST:
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "tracked v4 opening manifest identity differs"
        )
    regenerated = OPENING_BUILDER._generate_openings(
        repo_root=Path(root),
        node=os.environ.get("NODE", "node"),
        node_path=os.environ.get("NODE_PATH", ""),
        start=PAIR_SEED_START,
        count=PAIR_COUNT,
    )
    expected_regenerated = [
        {
            "seed": item["seed"],
            "derived_seed": item["derived_seed"],
            "opening_fingerprint": item["opening_fingerprint"],
        }
        for item in manifest["selection"]["pairs_selected"]
    ]
    if regenerated != expected_regenerated:
        raise DirectTeacherHalfkp81V4FreshScreenError("v4 opening regeneration differs")
    candidate = _file_identity(root, EXPECTED_CANDIDATE, "frozen candidate")
    initializer = _file_identity(
        root, EXPECTED_INITIALIZER, "deployed int16 initializer"
    )
    runtime = _file_identity(root, EXPECTED_RUNTIME, "research WASM")
    harness = _file_identity(root, EXPECTED_HARNESS, "match harness")
    bundle = _file_identity(root, EXPECTED_BUNDLE, "standalone match bundle")
    node = _authenticate_node_executable()
    controller_path = Path(root) / CONTROLLER_PATH
    controller_observed = V4.file_identity(str(controller_path), "v4 screen controller")
    controller = {
        "path": CONTROLLER_PATH,
        "bytes": controller_observed["bytes"],
        "sha256": controller_observed["sha256"],
    }
    selected = manifest["selection"]["pairs_selected"]
    plan = {
        "schema": PLAN_SCHEMA,
        "status": "formal-v4-pass-bound-fresh-paired56-ready",
        "source_revision": source_revision,
        "inputs": {
            "v4_protocol": V4.EXPECTED_PROTOCOL_IDENTITY,
            "v4_static_result": EXPECTED_STATIC_RESULT,
            "fresh_opening_manifest": EXPECTED_OPENING_MANIFEST,
        },
        "assets": {
            "candidate_weights": candidate,
            "initializer_weights": initializer,
            "research_wasm": runtime,
            "match_harness": harness,
            "standalone_match_bundle": bundle,
            "node_executable": node,
            "controller": controller,
        },
        "opponent": {
            "role": "authenticated-deployed-int16-v3-initializer",
            "same_architecture": True,
            "same_bucket_count": True,
            "candidate_buckets": BUCKETS,
            "initializer_buckets": BUCKETS,
            "old_v2_live_baseline_used": False,
        },
        "match": {
            "family": "direct-teacher-halfkp81-v4-fresh-opening-paired56",
            "namespace": (
                "direct-teacher-halfkp81-v4-robust-adjudication-" "fresh-paired56-v1"
            ),
            "pairs": PAIR_COUNT,
            "games": GAME_COUNT,
            "games_per_pair": 2,
            "colors": ["candidate-sente", "candidate-gote"],
            "pair_workers": PAIR_WORKERS,
            "milliseconds_per_move": MILLISECONDS_PER_MOVE,
            "maximum_plies": MAXIMUM_PLIES,
            "opening_book": False,
            "external_mate_solver": False,
            "fallback": False,
            "pair_seeds": [item["seed"] for item in selected],
            "opening_fingerprints": [item["opening_fingerprint"] for item in selected],
            "opening_set_sha256": EXPECTED_OPENING_SET_SHA256,
        },
        "decision": {
            "score_unit": "candidate-halfpoints-win2-draw1-loss0",
            "denominator_halfpoints": DENOMINATOR_HALFPOINTS,
            "minimum_candidate_halfpoints": PASS_HALFPOINTS,
            "futility_stop": (
                "allowed-only-when-current-plus-all-remaining-halfpoints-" "is-below-62"
            ),
            "technical_faults_maximum": 0,
            "technical_fault_resume_authorized": False,
            "pass_authorizes_only": "terminal-v4-paired-result-no-expanded-no-live",
        },
        "authority": {
            "fresh_v4_paired56_authorized": True,
            "old_v3_paired56_authorized": False,
            "optimizer_creation_authorized": False,
            "additional_training_rows": 0,
            "candidate_mutation_authorized": False,
            "expanded_stage_authorized": False,
            "live_weight_write_authorized": False,
        },
    }
    return validate_plan(plan, repo_root=root)


def validate_plan(value: Any, *, repo_root: str) -> dict[str, Any]:
    plan = _exact(
        value,
        {
            "schema",
            "status",
            "source_revision",
            "inputs",
            "assets",
            "opponent",
            "match",
            "decision",
            "authority",
        },
        "v4 screen plan",
    )
    if (
        plan["schema"] != PLAN_SCHEMA
        or plan["status"] != "formal-v4-pass-bound-fresh-paired56-ready"
        or type(plan["source_revision"]) is not str
        or REVISION_RE.fullmatch(plan["source_revision"]) is None
        or plan["inputs"]
        != {
            "v4_protocol": V4.EXPECTED_PROTOCOL_IDENTITY,
            "v4_static_result": EXPECTED_STATIC_RESULT,
            "fresh_opening_manifest": EXPECTED_OPENING_MANIFEST,
        }
    ):
        raise DirectTeacherHalfkp81V4FreshScreenError("v4 screen plan boundary differs")
    assets = _exact(
        plan["assets"],
        {
            "candidate_weights",
            "initializer_weights",
            "research_wasm",
            "match_harness",
            "standalone_match_bundle",
            "node_executable",
            "controller",
        },
        "v4 screen assets",
    )
    if (
        assets["candidate_weights"] != EXPECTED_CANDIDATE
        or assets["initializer_weights"] != EXPECTED_INITIALIZER
        or assets["research_wasm"] != EXPECTED_RUNTIME
        or assets["match_harness"] != EXPECTED_HARNESS
        or assets["standalone_match_bundle"] != EXPECTED_BUNDLE
        or assets["node_executable"] != EXPECTED_NODE
        or type(assets["controller"]) is not dict
        or set(assets["controller"]) != {"path", "bytes", "sha256"}
        or assets["controller"]["path"] != CONTROLLER_PATH
    ):
        raise DirectTeacherHalfkp81V4FreshScreenError("v4 screen asset binding differs")
    for label, expected in assets.items():
        if label == "node_executable":
            continue
        _file_identity(repo_root, expected, f"v4 screen {label}")
    if plan["opponent"] != {
        "role": "authenticated-deployed-int16-v3-initializer",
        "same_architecture": True,
        "same_bucket_count": True,
        "candidate_buckets": BUCKETS,
        "initializer_buckets": BUCKETS,
        "old_v2_live_baseline_used": False,
    }:
        raise DirectTeacherHalfkp81V4FreshScreenError("v4 screen opponent differs")
    match = plan["match"]
    expected_seeds = list(range(PAIR_SEED_START, PAIR_SEED_START + PAIR_COUNT))
    fingerprints = match.get("opening_fingerprints")
    if (
        type(match) is not dict
        or set(match)
        != {
            "family",
            "namespace",
            "pairs",
            "games",
            "games_per_pair",
            "colors",
            "pair_workers",
            "milliseconds_per_move",
            "maximum_plies",
            "opening_book",
            "external_mate_solver",
            "fallback",
            "pair_seeds",
            "opening_fingerprints",
            "opening_set_sha256",
        }
        or match["family"] != "direct-teacher-halfkp81-v4-fresh-opening-paired56"
        or match["namespace"]
        != "direct-teacher-halfkp81-v4-robust-adjudication-fresh-paired56-v1"
        or match["pairs"] != PAIR_COUNT
        or match["games"] != GAME_COUNT
        or match["games_per_pair"] != 2
        or match["colors"] != ["candidate-sente", "candidate-gote"]
        or match["pair_workers"] != PAIR_WORKERS
        or match["milliseconds_per_move"] != MILLISECONDS_PER_MOVE
        or match["maximum_plies"] != MAXIMUM_PLIES
        or match["opening_book"] is not False
        or match["external_mate_solver"] is not False
        or match["fallback"] is not False
        or match["pair_seeds"] != expected_seeds
        or type(fingerprints) is not list
        or len(fingerprints) != PAIR_COUNT
        or len(set(fingerprints)) != PAIR_COUNT
        or any(
            type(item) is not str or SHA256_RE.fullmatch(item) is None
            for item in fingerprints
        )
        or match["opening_set_sha256"] != EXPECTED_OPENING_SET_SHA256
        or _opening_set_sha256(fingerprints) != EXPECTED_OPENING_SET_SHA256
    ):
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "v4 screen match contract differs"
        )
    if plan["decision"] != {
        "score_unit": "candidate-halfpoints-win2-draw1-loss0",
        "denominator_halfpoints": DENOMINATOR_HALFPOINTS,
        "minimum_candidate_halfpoints": PASS_HALFPOINTS,
        "futility_stop": (
            "allowed-only-when-current-plus-all-remaining-halfpoints-is-below-62"
        ),
        "technical_faults_maximum": 0,
        "technical_fault_resume_authorized": False,
        "pass_authorizes_only": "terminal-v4-paired-result-no-expanded-no-live",
    } or plan["authority"] != {
        "fresh_v4_paired56_authorized": True,
        "old_v3_paired56_authorized": False,
        "optimizer_creation_authorized": False,
        "additional_training_rows": 0,
        "candidate_mutation_authorized": False,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
    }:
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "v4 screen decision/authority differs"
        )
    return json.loads(json.dumps(plan))


def publish_plan(
    plan: Mapping[str, Any],
    *,
    repo_root: str,
    path: str = PLAN_PATH,
) -> dict[str, Any]:
    validated = validate_plan(plan, repo_root=repo_root)
    return V4_RUNNER.publish_create_only(validated, path=path)


def _authenticate_plan(
    repo_root: str, path: str = PLAN_PATH
) -> tuple[dict[str, Any], str]:
    value, identity = _load_json(path, "formal v4 fresh screen plan")
    if Path(path).read_bytes() != _canonical(value):
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "v4 fresh screen plan is not canonical"
        )
    plan = validate_plan(value, repo_root=repo_root)
    _authenticate_node_executable()
    if plan["source_revision"] != verify_source_revision(repo_root):
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "v4 fresh screen source revision differs"
        )
    _load_formal_static_result(repo_root)
    manifest, manifest_identity = _load_json(
        _resolve(repo_root, OPENING_MANIFEST_PATH),
        "tracked v4 opening manifest",
    )
    validate_opening_manifest(manifest, repo_root=repo_root)
    if any(
        manifest_identity[field] != EXPECTED_OPENING_MANIFEST[field]
        for field in ("bytes", "sha256")
    ):
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "v4 fresh opening manifest changed"
        )
    return plan, identity["sha256"]


def _halfpoints(result: str) -> int:
    if result == "win":
        return 2
    if result == "draw":
        return 1
    if result == "loss":
        return 0
    raise DirectTeacherHalfkp81V4FreshScreenError("candidate result is invalid")


def _pair_body(plan_sha256: str, parsed: PairResult) -> dict[str, Any]:
    return {
        "schema": PAIR_SCHEMA,
        "plan_sha256": plan_sha256,
        "pair_index": parsed.pair_index,
        "seed": parsed.seed,
        "opening_fingerprint": parsed.opening_fingerprint,
        "candidate_sente": parsed.candidate_sente,
        "candidate_gote": parsed.candidate_gote,
        "candidate_halfpoints": parsed.halfpoints,
        "legal_moves": parsed.legal_moves,
        "log_bytes": parsed.log_bytes,
        "log_sha256": parsed.log_sha256,
        "technical_fault": False,
    }


def _seal_pair(plan_sha256: str, parsed: PairResult) -> dict[str, Any]:
    body = _pair_body(plan_sha256, parsed)
    return {**body, "receipt_sha256": _domain_digest(PAIR_DIGEST_DOMAIN, body)}


def _screen_pair(parsed: PairResult, receipt: Mapping[str, Any]) -> ScreenPair:
    return ScreenPair(
        pair_index=parsed.pair_index,
        seed=parsed.seed,
        opening_fingerprint=parsed.opening_fingerprint,
        candidate_sente=parsed.candidate_sente,
        candidate_gote=parsed.candidate_gote,
        legal_moves=parsed.legal_moves,
        log_bytes=parsed.log_bytes,
        log_sha256=parsed.log_sha256,
        receipt_sha256=str(receipt["receipt_sha256"]),
    )


def analyze_screen(
    plan: Mapping[str, Any],
    pairs: Sequence[ScreenPair],
    *,
    technical_faults: int = 0,
) -> dict[str, Any]:
    ordered = sorted(pairs, key=lambda item: item.pair_index)
    if (
        type(technical_faults) is not int
        or technical_faults < 0
        or len({item.pair_index for item in ordered}) != len(ordered)
        or any(
            item.pair_index < 0
            or item.pair_index >= PAIR_COUNT
            or item.seed != plan["match"]["pair_seeds"][item.pair_index]
            or item.opening_fingerprint
            != plan["match"]["opening_fingerprints"][item.pair_index]
            or item.legal_moves <= 0
            for item in ordered
        )
        or len({item.opening_fingerprint for item in ordered}) != len(ordered)
    ):
        raise DirectTeacherHalfkp81V4FreshScreenError("v4 paired evidence is invalid")
    games = len(ordered) * 2
    wins = sum(
        result == "win"
        for pair in ordered
        for result in (pair.candidate_sente, pair.candidate_gote)
    )
    draws = sum(
        result == "draw"
        for pair in ordered
        for result in (pair.candidate_sente, pair.candidate_gote)
    )
    losses = games - wins - draws
    halfpoints = wins * 2 + draws
    maximum = halfpoints + (GAME_COUNT - games) * 2
    complete = len(ordered) == PAIR_COUNT
    if technical_faults:
        status = "technical-fault-v4-family-closed-no-strength-conclusion"
        strength_conclusion = False
        passed = False
        terminal = True
    elif complete and halfpoints >= PASS_HALFPOINTS:
        status = "passed-62-of-112-terminal-v4-paired-result"
        strength_conclusion = True
        passed = True
        terminal = True
    elif complete or maximum < PASS_HALFPOINTS:
        status = (
            "failed-strength-complete-v4-family-closed"
            if complete
            else "failed-strength-futility-v4-family-closed"
        )
        strength_conclusion = True
        passed = False
        terminal = True
    else:
        status = "pending"
        strength_conclusion = False
        passed = False
        terminal = False
    result = {
        "schema": RESULT_SCHEMA,
        "status": status,
        "terminal": terminal,
        "planned_pairs": PAIR_COUNT,
        "planned_games": GAME_COUNT,
        "completed_pairs": len(ordered),
        "completed_games": games,
        "candidate_wins": wins,
        "candidate_draws": draws,
        "candidate_losses": losses,
        "candidate_halfpoints": halfpoints,
        "observed_denominator_halfpoints": games * 2,
        "maximum_possible_final_halfpoints": maximum,
        "minimum_candidate_halfpoints": PASS_HALFPOINTS,
        "technical_faults": technical_faults,
        "all_moves_legal": all(item.legal_moves > 0 for item in ordered),
        "all_openings_unique": len({item.opening_fingerprint for item in ordered})
        == len(ordered),
        "strength_conclusion_allowed": strength_conclusion,
        "candidate_stronger_in_this_screen": passed,
        "first_playing_strength_evidence": strength_conclusion,
        "pair_receipt_sha256s": [item.receipt_sha256 for item in ordered],
        "authority": {
            "old_v3_paired56_authorized": False,
            "technical_fault_resume_authorized": False,
            "optimizer_creation_authorized": False,
            "additional_training_rows": 0,
            "candidate_mutation_authorized": False,
            "expanded_stage_authorized": False,
            "live_weight_write_authorized": False,
        },
    }
    return {
        **result,
        "result_sha256": _domain_digest(RESULT_DIGEST_DOMAIN, result),
    }


def execute_pair_subprocess(
    repo_root: str | Path,
    plan: Mapping[str, Any],
    _pair_index: int,
    seed: int,
) -> ChildResult:
    root = Path(repo_root).resolve()
    assets = plan["assets"]
    node = _authenticate_node_executable()
    bundle_raw = _read_authenticated_bytes(
        root,
        assets["standalone_match_bundle"],
        "standalone match bundle",
    )
    command_tail = [
        _resolve(root, assets["candidate_weights"]["path"]),
        "--vs",
        _resolve(root, assets["initializer_weights"]["path"]),
        "--games",
        "2",
        "--ms",
        str(MILLISECONDS_PER_MOVE),
        "--seed",
        str(seed),
        "--k",
        "600",
        "--scale-numer",
        "1",
        "--scale-denom",
        "1",
        "--max-plies",
        str(MAXIMUM_PLIES),
        "--wasm-path",
        _resolve(root, assets["research_wasm"]["path"]),
        "--buckets-a",
        str(BUCKETS),
        "--buckets-b",
        str(BUCKETS),
        "--sha-a",
        assets["candidate_weights"]["sha256"],
        "--sha-b",
        assets["initializer_weights"]["sha256"],
        "--wasm-sha",
        assets["research_wasm"]["sha256"],
    ]
    try:
        with tempfile.TemporaryFile(prefix=".v4-match-bundle-") as bundle:
            bundle.write(bundle_raw)
            bundle.flush()
            bundle.seek(0)
            command = [
                node["path"],
                f"/dev/fd/{bundle.fileno()}",
                *command_tail,
            ]
            completed = subprocess.run(
                command,
                cwd=root,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=max(
                    120,
                    MILLISECONDS_PER_MOVE * MAXIMUM_PLIES * 2 // 1_000,
                ),
                check=False,
                env={"PATH": "/usr/bin:/bin"},
                pass_fds=(bundle.fileno(),),
            )
    except (OSError, subprocess.TimeoutExpired) as error:
        evidence = _sha256(repr(error).encode("utf-8"))
        return ChildResult(124, b"", f"technical-fault:{evidence}".encode())
    return ChildResult(completed.returncode, completed.stdout, completed.stderr)


def _publish_bytes_create_only(raw: bytes, *, path: Path) -> None:
    parent = V4_RUNNER._ensure_secure_directory(str(path.parent))
    if Path(parent) != path.parent:
        raise DirectTeacherHalfkp81V4FreshScreenError("v4 output parent differs")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    directory_flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        directory_flags |= os.O_DIRECTORY
    if hasattr(os, "O_NOFOLLOW"):
        directory_flags |= os.O_NOFOLLOW
    directory_fd = os.open(parent, directory_flags)
    try:
        try:
            descriptor = os.open(path.name, flags, 0o600, dir_fd=directory_fd)
        except OSError as error:
            raise DirectTeacherHalfkp81V4FreshScreenError(
                f"v4 create-only output failed: {path}"
            ) from error
        try:
            with os.fdopen(descriptor, "wb") as handle:
                descriptor = -1
                handle.write(raw)
                handle.flush()
                os.fsync(handle.fileno())
            os.fsync(directory_fd)
        finally:
            if descriptor >= 0:
                os.close(descriptor)
    finally:
        os.close(directory_fd)


def _seal_technical_fault(
    *,
    plan_sha256: str,
    pair_index: int,
    seed: int,
    stage: str,
    error: BaseException,
    child: ChildResult | None,
) -> dict[str, Any]:
    body = {
        "schema": (
            "shogi-direct-teacher-halfkp81-v4-fresh-paired56-technical-fault-v1"
        ),
        "plan_sha256": plan_sha256,
        "pair_index": pair_index,
        "seed": seed,
        "stage": stage,
        "error_type": type(error).__name__,
        "error_message_sha256": _sha256(str(error).encode("utf-8")),
        "child": (
            None
            if child is None
            else {
                "returncode": child.returncode,
                "stdout_bytes": len(child.stdout),
                "stdout_sha256": _sha256(child.stdout),
                "stderr_bytes": len(child.stderr),
                "stderr_sha256": _sha256(child.stderr),
            }
        ),
        "technical_fault": True,
        "resume_authorized": False,
    }
    return {
        **body,
        "receipt_sha256": _domain_digest(TECHNICAL_FAULT_DIGEST_DOMAIN, body),
    }


def _reauthenticate_after_games(repo_root: str, plan: Mapping[str, Any]) -> None:
    if verify_source_revision(repo_root) != plan["source_revision"]:
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "source revision changed during v4 paired56"
        )
    _load_formal_static_result(repo_root)
    for label, expected in plan["assets"].items():
        if label == "node_executable":
            _authenticate_node_executable()
            continue
        _file_identity(repo_root, expected, f"post-screen {label}")


def _run_screen_core(
    *,
    repo_root: str,
    plan_path: str,
    output_dir: str,
    executor: PairExecutor,
    production: bool,
) -> dict[str, Any]:
    root = str(Path(repo_root).resolve())
    if production and executor is not execute_pair_subprocess:
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "formal v4 execution requires the fixed authenticated executor"
        )
    plan, plan_sha256 = _authenticate_plan(root, plan_path)
    output = Path(output_dir)
    if not output.is_absolute() or str(output) != os.path.abspath(output):
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "v4 output directory is not canonical"
        )
    research_root = str(Path.home() / ".codex" / "shogi-runs")
    expected_output = (
        output.name.startswith("v4-screen-test-")
        if not production
        else output.name == Path(RUN_DIRECTORY).name
    )
    if output.parent != Path(research_root) or not expected_output:
        raise DirectTeacherHalfkp81V4FreshScreenError("v4 output namespace differs")
    V4_RUNNER._ensure_secure_directory(research_root)
    try:
        os.mkdir(output, 0o700)
    except FileExistsError as error:
        raise DirectTeacherHalfkp81V4FreshScreenError(
            "v4 paired56 family is already consumed"
        ) from error
    pairs_dir = output / "pairs"
    pairs_dir.mkdir(mode=0o700)
    run_document = {
        "schema": RUN_SCHEMA,
        "status": "exclusive-v4-fresh-paired56-claimed-no-resume",
        "plan_sha256": plan_sha256,
        "source_revision": plan["source_revision"],
        "candidate_sha256": EXPECTED_CANDIDATE["sha256"],
        "initializer_sha256": EXPECTED_INITIALIZER["sha256"],
        "opening_set_sha256": EXPECTED_OPENING_SET_SHA256,
        "pair_workers": PAIR_WORKERS,
        "technical_fault_resume_authorized": False,
        "old_v3_paired56_authorized": False,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
    }
    V4_RUNNER.publish_create_only(run_document, path=str(output / "run.json"))

    pairs: dict[int, ScreenPair] = {}
    errors: list[tuple[int, str]] = []
    next_pair = iter(range(PAIR_COUNT))
    stop_submitting = False
    with ThreadPoolExecutor(max_workers=PAIR_WORKERS) as pool:
        futures: dict[Future[ChildResult], int] = {}

        def fill() -> None:
            while not stop_submitting and len(futures) < PAIR_WORKERS:
                try:
                    pair_index = next(next_pair)
                except StopIteration:
                    return
                future = pool.submit(
                    executor,
                    root,
                    plan,
                    pair_index,
                    plan["match"]["pair_seeds"][pair_index],
                )
                futures[future] = pair_index

        fill()
        while futures:
            completed, _pending = wait(futures, return_when=FIRST_COMPLETED)
            for future in sorted(completed, key=lambda item: futures[item]):
                pair_index = futures.pop(future)
                seed = plan["match"]["pair_seeds"][pair_index]
                child: ChildResult | None = None
                stage = "executor"
                try:
                    child = future.result()
                    stage = "subprocess"
                    if child.returncode != 0 or child.stderr:
                        raise DirectTeacherHalfkp81V4FreshScreenError(
                            "pair subprocess reported a technical fault"
                        )
                    stage = "parse"
                    parsed = parse_pair_log(
                        child.stdout,
                        pair_index,
                        seed,
                        MILLISECONDS_PER_MOVE,
                    )
                    if parsed.opening_fingerprint != plan["match"][
                        "opening_fingerprints"
                    ][
                        pair_index
                    ] or f"max-plies={MAXIMUM_PLIES}" not in child.stdout.decode(
                        "utf-8"
                    ):
                        raise DirectTeacherHalfkp81V4FreshScreenError(
                            "pair opening or maximum plies differs"
                        )
                    receipt = _seal_pair(plan_sha256, parsed)
                    _publish_bytes_create_only(
                        child.stdout,
                        path=pairs_dir / f"pair-{pair_index:04d}.log",
                    )
                    V4_RUNNER.publish_create_only(
                        receipt,
                        path=str(pairs_dir / f"pair-{pair_index:04d}.json"),
                    )
                    pairs[pair_index] = _screen_pair(parsed, receipt)
                except Exception as error:
                    fault = _seal_technical_fault(
                        plan_sha256=plan_sha256,
                        pair_index=pair_index,
                        seed=seed,
                        stage=stage,
                        error=error,
                        child=child,
                    )
                    if child is not None:
                        _publish_bytes_create_only(
                            child.stdout,
                            path=pairs_dir / f"pair-{pair_index:04d}.fault.stdout",
                        )
                        _publish_bytes_create_only(
                            child.stderr,
                            path=pairs_dir / f"pair-{pair_index:04d}.fault.stderr",
                        )
                    V4_RUNNER.publish_create_only(
                        fault,
                        path=str(pairs_dir / f"pair-{pair_index:04d}.fault.json"),
                    )
                    errors.append((pair_index, fault["receipt_sha256"]))
            current = analyze_screen(
                plan,
                list(pairs.values()),
                technical_faults=len(errors),
            )
            if errors or current["terminal"]:
                stop_submitting = True
            fill()

    try:
        _reauthenticate_after_games(root, plan)
    except Exception as error:
        fault = _seal_technical_fault(
            plan_sha256=plan_sha256,
            pair_index=-1,
            seed=-1,
            stage="post-screen-reauthentication",
            error=error,
            child=None,
        )
        V4_RUNNER.publish_create_only(
            fault,
            path=str(output / "post-screen.fault.json"),
        )
        errors.append((-1, fault["receipt_sha256"]))
    result = analyze_screen(
        plan,
        list(pairs.values()),
        technical_faults=len(errors),
    )
    if not result["terminal"]:
        error = DirectTeacherHalfkp81V4FreshScreenError(
            "nonterminal after worker drain"
        )
        fault = _seal_technical_fault(
            plan_sha256=plan_sha256,
            pair_index=-1,
            seed=-1,
            stage="worker-drain",
            error=error,
            child=None,
        )
        V4_RUNNER.publish_create_only(
            fault,
            path=str(output / "worker-drain.fault.json"),
        )
        errors.append((-1, fault["receipt_sha256"]))
        result = analyze_screen(
            plan,
            list(pairs.values()),
            technical_faults=len(errors),
        )
    result_body = {
        **{key: value for key, value in result.items() if key != "result_sha256"},
        "plan_sha256": plan_sha256,
        "technical_fault_evidence": [
            {"pair_index": index, "sha256": evidence}
            for index, evidence in sorted(errors)
        ],
    }
    result = {
        **result_body,
        "result_sha256": _domain_digest(RESULT_DIGEST_DOMAIN, result_body),
    }
    V4_RUNNER.publish_create_only(result, path=str(output / "result.json"))
    return result


def run_screen(
    *,
    repo_root: str,
    plan_path: str = PLAN_PATH,
    output_dir: str = RUN_DIRECTORY,
) -> dict[str, Any]:
    """Run the production screen with the fixed authenticated executor."""
    return _run_screen_core(
        repo_root=repo_root,
        plan_path=plan_path,
        output_dir=output_dir,
        executor=execute_pair_subprocess,
        production=True,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "run"))
    parser.add_argument("--repo-root", default=".")
    return parser.parse_args()


def main() -> int:
    arguments = parse_args()
    root = str(Path(arguments.repo_root).resolve())
    if arguments.command == "prepare":
        plan = build_plan(repo_root=root)
        identity = publish_plan(plan, repo_root=root)
        print(json.dumps(identity, sort_keys=True))
        return 0
    result = run_screen(repo_root=root)
    print(json.dumps(result, sort_keys=True))
    return 0 if result["status"] == "passed-62-of-112-terminal-v4-paired-result" else 1


if __name__ == "__main__":
    raise SystemExit(main())
