#!/usr/bin/env python3
"""Generate, train, resume, and terminalize the bound root-policy student.

The public CLI is intentionally fail-closed and fixed to the preregistered
output.  Testable helpers accept temporary roots, but no CLI flag can redirect
the real run.  Tune, sealed, match, deployment, and live-weight operations do
not exist in this module.
"""

from __future__ import annotations

import argparse
from contextlib import ExitStack
from dataclasses import asdict, dataclass, replace
import hashlib
import heapq
import json
import math
import os
from pathlib import Path
import random
import shutil
import subprocess
import sys
import time
from typing import BinaryIO, Iterable, Iterator, Mapping, Sequence

import torch

import capacity_policy_value as cpv
import capacity_policy_value_data as data_contract
import child_board_root_policy_student as student
import listwise_policy_value as lpv
import train


PROTOCOL_PATH = (
    Path(__file__).parent
    / "protocols"
    / "child-board-root-policy-student-runtime-v1-plan.json"
)
PROTOCOL_BYTES = 65_314
PROTOCOL_SHA256 = (
    "6bc5478a76bf52005bf133c097bcb8741a8dd7cf0cf568e2ae4d7c0d65a58db0"
)
PROTOCOL_SCHEMA = "shogi-child-board-root-policy-student-runtime-plan-v1"
PHASE1_RESULT_PATH = Path(
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "child-board-strength-candidate-v1-phase1/result.json"
)
PHASE1_RESULT_BYTES = 33_615
PHASE1_RESULT_SHA256 = (
    "97c60e28f7f7cf6cd7b3c5d83fb87349afaae2759a280ef9c7dbe026c56bfb9d"
)
OUTPUT = Path(
    "/Users/yudaiyaguchi/.codex/shogi-runs/"
    "child-board-root-policy-student-runtime-v1"
)
DISTILLATION_PATH = OUTPUT / "fit-distillation.seed42.jsonl"
DISTILLATION_RECEIPT_PATH = OUTPUT / "fit-distillation.seed42.receipt.json"
PARITY_PATH = OUTPUT / "parity-1024.fit-only.jsonl"
PARITY_RECEIPT_PATH = OUTPUT / "parity-1024.fit-only.receipt.json"
LAST_CHECKPOINT_PATH = OUTPUT / "last-completed-epoch.pt"
FINAL_CHECKPOINT_PATH = OUTPUT / "student-final-mixed-epoch12.pt"
TENSOR_PATH = OUTPUT / "student-root-ordering.f32.bin"
MANIFEST_PATH = OUTPUT / "student-root-ordering.manifest.json"
RESULT_PATH = OUTPUT / "result.json"
MOVE_UNIVERSE_PATH = OUTPUT / "production-root-move-universe.jsonl"
MOVE_UNIVERSE_RECEIPT_PATH = (
    OUTPUT / "production-root-move-universe.receipt.json"
)
MOVE_UNIVERSE_BRIDGE_PATH = (
    Path(__file__).parent
    / "child-board-root-move-universe-bridge.ts"
)
DISTILLATION_SCHEMA = "shogi-child-board-root-policy-distillation-v2"
DISTILLATION_SHARD_RECEIPT_SCHEMA = (
    "shogi-child-board-root-policy-distillation-shard-receipt-v1"
)
DISTILLATION_RECEIPT_SCHEMA = (
    "shogi-child-board-root-policy-distillation-receipt-v1"
)
PARITY_SCHEMA = "shogi-child-board-root-policy-parity-fixture-v1"
PARITY_RECEIPT_SCHEMA = (
    "shogi-child-board-root-policy-parity-fixture-receipt-v1"
)
CHECKPOINT_SCHEMA = "shogi-child-board-root-policy-student-checkpoint-v1"
FINAL_CHECKPOINT_SCHEMA = (
    "shogi-child-board-root-policy-student-final-checkpoint-v1"
)
MANIFEST_SCHEMA = "shogi-child-board-root-policy-student-manifest-v1"
RESULT_SCHEMA = "shogi-child-board-root-policy-student-runtime-result-v1"
RESULT_STATUS = "complete-fit-only-student-frozen-tune-locked"
MOVE_UNIVERSE_RECORD_SCHEMA = (
    "shogi-production-root-move-universe-verification-record-v2"
)
MOVE_UNIVERSE_RECEIPT_SCHEMA = (
    "shogi-production-root-move-universe-verification-receipt-v2"
)
MOVE_UNIVERSE_REQUEST_SCHEMA = (
    "shogi-production-root-move-universe-request-v2"
)
MOVE_UNIVERSE_RESPONSE_SCHEMA = (
    "shogi-production-root-move-universe-response-v2"
)
MOVE_UNIVERSE_WASM_BYTES = 36_545
MOVE_UNIVERSE_WASM_SHA256 = (
    "9142b6b0f0b993596ff3fffa1e05f0d0846bc7672b3f2fc7c90b9f4feaae4c31"
)
MOVE_UNIVERSE_WASM_BUFFER_OFFSET = 7_128_112
# Updated only when the reviewed bridge source changes. The verifier checks
# this identity before spawning Node or opening a teacher checkpoint.
MOVE_UNIVERSE_BRIDGE_BYTES = 12_340
MOVE_UNIVERSE_BRIDGE_SHA256 = (
    "5d15c0a1399a4f352b4d52b0eb9f9f0514943ac995cfda92b5b050a6e2c5a65d"
)
SHARDS = 64
V9_PRETRAIN_EPOCHS = 4
MIXED_EPOCHS = 12
BROWSER_BATCH = 32
V9_BATCH = 256
V9_PER_BROWSER = 3
LEARNING_RATE = 0.0003
WEIGHT_DECAY = 0.0001
GRADIENT_CLIP = 5.0
DOMAIN_ORDINAL = {"browser": 0, "v9": 1}


@dataclass(frozen=True)
class FitInputs:
    fit: dict[str, list[lpv.ParentGroup]]
    protected_ids: frozenset[str]
    original_tune_ids: frozenset[str]


def _strict_json(path: str | Path) -> dict[str, object]:
    source = Path(path)
    raw = source.read_bytes()

    def reject_constant(value: str) -> None:
        raise ValueError(f"{source}: invalid JSON constant {value}")

    parsed = json.loads(raw, parse_constant=reject_constant)
    if type(parsed) is not dict:
        raise ValueError(f"{source}: expected one JSON object")
    return parsed


def _fingerprint(path: str | Path) -> dict[str, object]:
    return lpv.file_fingerprint(path)


def _canonical_json(value: object) -> bytes:
    return (
        json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        + b"\n"
    )


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _atomic_publish_bytes(path: Path, payload: bytes) -> None:
    """Create one immutable final file, or validate its exact existing bytes."""

    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.is_symlink() or not path.is_file() or path.read_bytes() != payload:
            raise ValueError(f"immutable artifact mismatch: {path}")
        return
    temporary = path.with_suffix(path.suffix + ".tmp")
    if temporary.exists():
        if temporary.is_dir() or temporary.is_symlink():
            raise ValueError(f"invalid unpublished temporary: {temporary}")
        temporary.unlink()
    with temporary.open("xb") as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
    _fsync_directory(path.parent)


def _atomic_replace_torch(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    if temporary.exists():
        if temporary.is_dir() or temporary.is_symlink():
            raise ValueError(f"invalid checkpoint temporary: {temporary}")
        temporary.unlink()
    torch.save(value, temporary)
    with temporary.open("rb") as handle:
        os.fsync(handle.fileno())
    os.replace(temporary, path)
    _fsync_directory(path.parent)


def _atomic_publish_torch(path: Path, value: object) -> None:
    if path.exists():
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"invalid immutable checkpoint: {path}")
        return
    _atomic_replace_torch(path, value)


def _torch_semantic_equal(observed: object, expected: object) -> bool:
    """Compare a torch artifact without depending on serialization bytes."""

    if isinstance(expected, torch.Tensor):
        return (
            isinstance(observed, torch.Tensor)
            and observed.shape == expected.shape
            and observed.dtype == expected.dtype
            and torch.equal(observed.cpu(), expected.cpu())
        )
    if isinstance(expected, Mapping):
        return (
            isinstance(observed, Mapping)
            and list(observed.keys()) == list(expected.keys())
            and all(
                _torch_semantic_equal(observed[key], value)
                for key, value in expected.items()
            )
        )
    if isinstance(expected, list):
        return (
            isinstance(observed, list)
            and len(observed) == len(expected)
            and all(
                _torch_semantic_equal(observed_value, expected_value)
                for observed_value, expected_value in zip(
                    observed,
                    expected,
                    strict=True,
                )
            )
        )
    if isinstance(expected, tuple):
        return (
            isinstance(observed, tuple)
            and len(observed) == len(expected)
            and all(
                _torch_semantic_equal(observed_value, expected_value)
                for observed_value, expected_value in zip(
                    observed,
                    expected,
                    strict=True,
                )
            )
        )
    return type(observed) is type(expected) and observed == expected


def _verified_protocol() -> tuple[dict[str, object], dict[str, object]]:
    raw = PROTOCOL_PATH.read_bytes()
    identity = {
        "path": str(PROTOCOL_PATH.resolve()),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    if (
        identity["bytes"] != PROTOCOL_BYTES
        or identity["sha256"] != PROTOCOL_SHA256
    ):
        raise ValueError("bound student protocol identity drift")
    document = _strict_json(PROTOCOL_PATH)
    if document.get("schema") != PROTOCOL_SCHEMA:
        raise ValueError("bound student protocol schema drift")
    bindings = document.get("teacher_checkpoint_bindings")
    if type(bindings) is not dict:
        raise ValueError("teacher checkpoint bindings are absent")
    for role in ("designated_distillation_teacher", "replication_teacher"):
        row = bindings.get(role)
        if (
            type(row) is not dict
            or not isinstance(row.get("checkpoint_sha256"), str)
            or len(row["checkpoint_sha256"]) != 64
        ):
            raise ValueError("student protocol retains an unresolved teacher")
    return document, identity


def _verified_phase1(
    protocol: Mapping[str, object],
) -> tuple[dict[str, object], dict[int, dict[str, object]]]:
    result_identity = _fingerprint(PHASE1_RESULT_PATH)
    if (
        result_identity["bytes"] != PHASE1_RESULT_BYTES
        or result_identity["sha256"] != PHASE1_RESULT_SHA256
    ):
        raise ValueError("phase-1 terminal result identity drift")
    result = _strict_json(PHASE1_RESULT_PATH)
    if (
        result.get("schema") != "shogi-child-board-strength-candidate-result-v1"
        or result.get("status")
        != "complete-phase1-two-scratch-checkpoints-frozen-tune-locked"
        or result.get("tune_opened") is not False
        or result.get("sealed_opened") is not False
        or result.get("live_weights_changed") is not False
    ):
        raise ValueError("phase-1 terminal result is not fit-only locked")
    training = result.get("training")
    if type(training) is not dict:
        raise ValueError("phase-1 training receipt is absent")
    finals = training.get("final_checkpoints")
    if type(finals) is not list or len(finals) != 2:
        raise ValueError("phase-1 final checkpoint receipts are incomplete")
    by_seed: dict[int, dict[str, object]] = {}
    for row in finals:
        if type(row) is not dict or type(row.get("seed")) is not int:
            raise ValueError("phase-1 checkpoint receipt is malformed")
        checkpoint = row.get("checkpoint")
        if type(checkpoint) is not dict:
            raise ValueError("phase-1 checkpoint identity is absent")
        actual = _fingerprint(str(checkpoint.get("path")))
        if (
            actual["bytes"] != checkpoint.get("bytes")
            or actual["sha256"] != checkpoint.get("sha256")
        ):
            raise ValueError("phase-1 checkpoint file drift")
        by_seed[int(row["seed"])] = row
    bindings = protocol["teacher_checkpoint_bindings"]
    if not isinstance(bindings, Mapping):
        raise AssertionError("verified protocol lost bindings")
    expected = {
        42: bindings["designated_distillation_teacher"]["checkpoint_sha256"],
        314159: bindings["replication_teacher"]["checkpoint_sha256"],
    }
    if set(by_seed) != set(expected) or any(
        by_seed[seed]["checkpoint"]["sha256"] != digest
        for seed, digest in expected.items()
    ):
        raise ValueError("bound teacher checkpoint mismatch")
    return result, by_seed


def _validate_pinned_sources(protocol: Mapping[str, object]) -> None:
    forward = protocol.get("exact_forward_contract")
    universe = protocol.get("production_move_universe")
    if type(forward) is not dict or type(universe) is not dict:
        raise ValueError("student source bindings are absent")
    receipts = list(forward.get("pinned_feature_sources", []))
    receipts += list(forward.get("pinned_feature_tests", []))
    receipts += list(universe.get("source_receipts", []))
    for receipt in receipts:
        if type(receipt) is not dict or not isinstance(receipt.get("path"), str):
            raise ValueError("student source receipt is malformed")
        actual = _fingerprint(receipt["path"])
        if (
            actual["bytes"] != receipt.get("bytes")
            or actual["sha256"] != receipt.get("sha256")
        ):
            raise ValueError(f"student pinned source drift: {receipt['path']}")
    fit_sources = protocol.get("fit_sources")
    if type(fit_sources) is not dict:
        raise ValueError("student fit-source bindings are absent")
    live_nnue = fit_sources.get("live_nnue_anchor")
    if type(live_nnue) is not dict:
        raise ValueError("student live-NNUE binding is absent")
    actual_live = _fingerprint(str(live_nnue.get("path")))
    if (
        actual_live["bytes"] != live_nnue.get("bytes")
        or actual_live["sha256"] != live_nnue.get("sha256")
    ):
        raise ValueError("student live-NNUE anchor drift")


def _load_fit_groups_from_phase1(
    phase1: Mapping[str, object],
) -> FitInputs:
    receipt = phase1.get("fit_data_receipt")
    if type(receipt) is not dict:
        raise ValueError("phase-1 fit-data receipt is absent")
    sources = receipt.get("sources")
    if type(sources) is not dict:
        raise ValueError("phase-1 fit sources are absent")
    qweights = lpv.read_live_board_qweights("public/shogi-nnue-weights.bin")
    browser_source = sources.get("browser")
    v9_source = sources.get("v9")
    if type(browser_source) is not dict or type(v9_source) is not dict:
        raise ValueError("phase-1 domain sources are absent")
    browser, observed_browser = lpv.load_groups(
        str(browser_source["path"]),
        role="browser-all-legal",
        expected_split="train",
        qweights=qweights,
    )
    v9, observed_v9 = lpv.load_groups(
        str(v9_source["path"]),
        role="v9",
        expected_split="train",
        qweights=qweights,
    )
    if observed_browser != browser_source or observed_v9 != v9_source:
        raise ValueError("phase-1 fit source receipt drift")
    protected_sets: list[frozenset[str]] = []
    observed_protected: list[dict[str, object]] = []
    registered_protected = sources.get("protected_position_ids")
    if type(registered_protected) is not list:
        raise ValueError("phase-1 protected receipts are absent")
    for registered in registered_protected:
        if type(registered) is not dict:
            raise ValueError("phase-1 protected receipt is malformed")
        identifiers, observed = data_contract.read_protected_position_ids(
            str(registered["path"])
        )
        if observed != registered:
            raise ValueError("phase-1 protected receipt drift")
        protected_sets.append(identifiers)
        observed_protected.append(observed)
    known = sources.get("known_eval_position_ids")
    if type(known) is not dict or type(known.get("sources")) is not list:
        raise ValueError("phase-1 known-eval receipt is absent")
    siblings = [
        row["path"]
        for row in known["sources"]
        if row.get("role") == "known-eval-sibling"
    ]
    scalars = [
        row["path"]
        for row in known["sources"]
        if row.get("role") == "known-eval-scalar"
    ]
    known_ids, observed_known = data_contract.read_known_eval_position_ids(
        sibling_paths=siblings,
        scalar_paths=scalars,
    )
    if observed_known != known:
        raise ValueError("phase-1 known-eval receipt drift")
    protected_sets.append(known_ids)
    browser_kept, v9_kept, observed_partition = (
        data_contract.partition_sources(
            browser=browser,
            v9=v9,
            spent_groups=[],
            protected_sets=protected_sets,
        )
    )
    if observed_partition != receipt.get("partition"):
        raise ValueError("phase-1 domain partition drift")
    fit_partition = receipt.get("fit_partition")
    if type(fit_partition) is not dict:
        raise ValueError("phase-1 fit partition controls are absent")
    split_seed = int(fit_partition.get("split_seed", -1))
    tune_modulus = int(fit_partition.get("tune_modulus", -1))
    browser_fit, browser_tune, browser_split = (
        lpv.split_by_semantic_components(
            browser_kept,
            seed=split_seed,
            tune_modulus=tune_modulus,
        )
    )
    v9_fit, v9_tune, v9_split = lpv.split_by_semantic_components(
        v9_kept,
        seed=split_seed,
        tune_modulus=tune_modulus,
    )
    for domain, observed in (
        ("browser", browser_split),
        ("v9", v9_split),
    ):
        expected = fit_partition.get(domain)
        if type(expected) is not dict or any(
            observed.get(key) != expected.get(key)
            for key in (
                "algorithm",
                "seed",
                "tune_modulus",
                "components",
                "fit_components",
                "fit_parents",
                "fit_games",
                "component_assignments_sha256",
            )
        ):
            raise ValueError(f"phase-1 {domain} fit membership drift")
    if len(browser_fit) != 875 or len(v9_fit) != 19_264:
        raise ValueError("phase-1 fit parent count drift")
    return FitInputs(
        fit={"browser": browser_fit, "v9": v9_fit},
        protected_ids=frozenset().union(*protected_sets),
        original_tune_ids=(
            lpv.semantic_union(browser_tune)
            | lpv.semantic_union(v9_tune)
        ),
    )


def _project_fit_groups(
    fit: Mapping[str, Sequence[lpv.ParentGroup]],
) -> dict[str, list[student.ProjectedParent]]:
    if set(fit) != {"browser", "v9"}:
        raise ValueError("student fit domains drifted before projection")
    projected: dict[str, list[student.ProjectedParent]] = {}
    for domain in ("browser", "v9"):
        projected[domain] = sorted(
            student.project_groups_to_production(fit[domain]),
            key=lambda row: row.group.parent_id.encode("ascii"),
        )
    return projected


def _bridge_source_identity() -> dict[str, object]:
    identity = _fingerprint(MOVE_UNIVERSE_BRIDGE_PATH)
    if (
        identity["bytes"] != MOVE_UNIVERSE_BRIDGE_BYTES
        or identity["sha256"] != MOVE_UNIVERSE_BRIDGE_SHA256
    ):
        raise ValueError("production move-universe bridge source drift")
    identity["path"] = "ml/child-board-root-move-universe-bridge.ts"
    return identity


def _compatible_node_executable() -> str:
    """Prefer the repository's pinned NVM Node, then the active PATH."""

    repository = Path(__file__).parent.parent
    requested = (repository / ".nvmrc").read_text(encoding="ascii").strip()
    nvm_root = Path(os.environ.get("NVM_DIR", Path.home() / ".nvm"))
    pinned = nvm_root / "versions" / "node" / f"v{requested}" / "bin" / "node"
    if pinned.is_file() and not pinned.is_symlink():
        return str(pinned)
    active = shutil.which("node")
    if active is None:
        raise ValueError("production move-universe Node executable is absent")
    return active


def _strict_json_line(raw: str, context: str) -> dict[str, object]:
    if not raw.endswith("\n") or raw == "\n":
        raise ValueError(f"{context}: missing canonical JSONL response")

    def reject_constant(value: str) -> None:
        raise ValueError(f"{context}: invalid JSON constant {value}")

    parsed = json.loads(raw, parse_constant=reject_constant)
    if type(parsed) is not dict:
        raise ValueError(f"{context}: expected one JSON object")
    return parsed


def _semantic_id_digest(identifiers: Iterable[str]) -> str:
    digest = hashlib.sha256()
    for identifier in sorted(set(identifiers), key=lambda value: value.encode("ascii")):
        digest.update(identifier.encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def _float_text(value: float) -> str:
    if not math.isfinite(value):
        raise ValueError("move-universe value is non-finite")
    return format(float(value), ".9g")


def _project_rules_complete_moves(
    parent_sfen: str,
    rules_complete_usi: Sequence[str],
) -> tuple[tuple[str, ...], tuple[student.ProjectionRemoval, ...]]:
    if (
        not rules_complete_usi
        or any(not isinstance(move, str) for move in rules_complete_usi)
        or list(rules_complete_usi)
        != sorted(rules_complete_usi, key=lambda move: move.encode("ascii"))
        or len(set(rules_complete_usi)) != len(rules_complete_usi)
    ):
        raise ValueError("rules-complete move universe is not canonical")
    production: list[str] = []
    removals: list[student.ProjectionRemoval] = []
    for move in rules_complete_usi:
        if student._is_nonpromoting_major_in_promotion_zone(
            parent_sfen,
            move,
        ):
            removals.append(
                student.ProjectionRemoval(
                    move=move,
                    reason=(
                        "current-production-force-promote-unpromoted-bishop-rook"
                    ),
                )
            )
        else:
            production.append(move)
    if not production:
        raise ValueError("rules-complete projection removed every move")
    return tuple(production), tuple(removals)


def verify_production_move_universe(
    projected: Mapping[str, Sequence[student.ProjectedParent]],
    *,
    protocol: Mapping[str, object],
    protocol_identity: Mapping[str, object],
    protected_ids: frozenset[str],
    original_tune_ids: frozenset[str],
    output_path: Path,
    receipt_path: Path,
    bridge_command: Sequence[str] | None = None,
) -> tuple[
    dict[str, object],
    dict[str, list[student.ProjectedParent]],
]:
    """Verify and expand every fit parent before a teacher can be loaded."""

    bridge_identity = _bridge_source_identity()
    universe = protocol.get("production_move_universe")
    if type(universe) is not dict:
        raise ValueError("production move-universe protocol is absent")
    source_receipts = universe.get("source_receipts")
    if type(source_receipts) is not list or len(source_receipts) != 5:
        raise ValueError("production move-universe source receipts drifted")
    command = list(
        bridge_command
        or (
            _compatible_node_executable(),
            "-r",
            "tsx/cjs",
            str(MOVE_UNIVERSE_BRIDGE_PATH),
        )
    )
    if not command or not all(isinstance(part, str) and part for part in command):
        raise ValueError("production move-universe bridge command is invalid")

    process = subprocess.Popen(
        command,
        cwd=Path(__file__).parent.parent,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        bufsize=1,
    )
    if (
        process.stdin is None
        or process.stdout is None
        or process.stderr is None
    ):
        process.kill()
        raise ValueError("production move-universe bridge pipes are absent")

    verified: list[
        tuple[
            str,
            student.ProjectedParent,
            tuple[str, ...],
            tuple[str, ...],
            tuple[student.ProjectionRemoval, ...],
            list[str],
            list[str],
        ]
    ] = []
    sequence = 0
    domain_counts = {"browser": 0, "v9": 0}
    node_runtime: dict[str, object] | None = None
    try:
        for domain in ("browser", "v9"):
            rows = projected.get(domain)
            if not isinstance(rows, Sequence):
                raise ValueError(
                    "projected production move-universe domain is absent"
                )
            previous_parent_id: bytes | None = None
            for projected_parent in rows:
                parent_id = projected_parent.group.parent_id
                parent_key = parent_id.encode("ascii")
                if (
                    previous_parent_id is not None
                    and parent_key <= previous_parent_id
                ):
                    raise ValueError(
                        "projected move-universe parent order drift"
                    )
                previous_parent_id = parent_key
                request = {
                    "schema": MOVE_UNIVERSE_REQUEST_SCHEMA,
                    "sequence": sequence,
                    "domain": domain,
                    "parent_id": parent_id,
                    "parent_sfen": projected_parent.group.parent_sfen,
                }
                process.stdin.write(
                    _canonical_json(request).decode("utf-8")
                )
                process.stdin.flush()
                response = _strict_json_line(
                    process.stdout.readline(),
                    f"production move-universe bridge response {sequence}",
                )
                if set(response) != {
                    "schema",
                    "sequence",
                    "domain",
                    "parent_id",
                    "parent_sfen",
                    "rules_complete_usi",
                    "js_usi",
                    "wasm_usi",
                    "wasm",
                    "node",
                }:
                    raise ValueError(
                        "production move-universe bridge response fields drift"
                    )
                expected_identity = (
                    sequence,
                    domain,
                    parent_id,
                    projected_parent.group.parent_sfen,
                )
                observed_identity = (
                    response.get("sequence"),
                    response.get("domain"),
                    response.get("parent_id"),
                    response.get("parent_sfen"),
                )
                if (
                    response.get("schema") != MOVE_UNIVERSE_RESPONSE_SCHEMA
                    or observed_identity != expected_identity
                ):
                    raise ValueError(
                        "production move-universe bridge response identity drift"
                    )
                rules_complete_usi = response.get("rules_complete_usi")
                js_usi = response.get("js_usi")
                wasm_usi = response.get("wasm_usi")
                if (
                    type(rules_complete_usi) is not list
                    or type(js_usi) is not list
                    or type(wasm_usi) is not list
                ):
                    raise ValueError(
                        "production move-universe arrays are absent "
                        f"for {domain}/{parent_id}"
                    )
                production_usi, removals = _project_rules_complete_moves(
                    projected_parent.group.parent_sfen,
                    rules_complete_usi,
                )
                source_candidates = (
                    projected_parent.source_candidate_moves
                    or projected_parent.source_moves
                )
                if not set(source_candidates).issubset(rules_complete_usi):
                    raise ValueError(
                        "source candidates are outside rules-complete moves "
                        f"for {domain}/{parent_id}"
                    )
                if domain == "browser" and tuple(rules_complete_usi) != tuple(
                    source_candidates
                ):
                    raise ValueError(
                        "browser all-legal source membership mismatch "
                        f"for {parent_id}"
                    )
                if (
                    js_usi != list(production_usi)
                    or wasm_usi != list(production_usi)
                ):
                    raise ValueError(
                        "production move-universe membership mismatch "
                        f"for {domain}/{parent_id}"
                    )
                wasm = response.get("wasm")
                if (
                    type(wasm) is not dict
                    or set(wasm)
                    != {
                        "bytes",
                        "sha256",
                        "root_move_buffer_offset",
                        "legal_moves",
                        "second_search_depth",
                        "second_search_nodes",
                        "second_search_leaves",
                    }
                    or wasm.get("bytes") != MOVE_UNIVERSE_WASM_BYTES
                    or wasm.get("sha256") != MOVE_UNIVERSE_WASM_SHA256
                    or wasm.get("root_move_buffer_offset")
                    != MOVE_UNIVERSE_WASM_BUFFER_OFFSET
                    or wasm.get("legal_moves") != len(production_usi)
                    or wasm.get("second_search_nodes") != 1
                    or wasm.get("second_search_leaves") != 0
                    or wasm.get("second_search_depth") not in (0, 1)
                ):
                    raise ValueError(
                        "production move-universe WASM extraction drift"
                    )
                node = response.get("node")
                if (
                    type(node) is not dict
                    or set(node) != {"exec_path", "version"}
                    or not isinstance(node.get("exec_path"), str)
                    or not isinstance(node.get("version"), str)
                ):
                    raise ValueError(
                        "production move-universe Node identity is absent"
                    )
                if node_runtime is None:
                    node_runtime = dict(node)
                elif node != node_runtime:
                    raise ValueError(
                        "production move-universe Node runtime changed"
                    )
                verified.append(
                    (
                        domain,
                        projected_parent,
                        tuple(source_candidates),
                        tuple(rules_complete_usi),
                        removals,
                        js_usi,
                        wasm_usi,
                    )
                )
                domain_counts[domain] += 1
                sequence += 1
        process.stdin.close()
        return_code = process.wait(timeout=30)
        stderr = process.stderr.read()
        if return_code != 0 or stderr:
            raise ValueError(
                "production move-universe bridge did not exit cleanly: "
                f"code={return_code} stderr={stderr.strip()!r}"
            )
    except BaseException:
        if process.poll() is None:
            process.kill()
        process.wait()
        raise
    finally:
        for handle in (process.stdin, process.stdout, process.stderr):
            if not handle.closed:
                handle.close()

    if node_runtime is None or not verified:
        raise ValueError("production move-universe verification was vacuous")
    derived: list[tuple[str, str]] = []
    for (
        _domain,
        projected_parent,
        _source_candidates,
        rules_complete_usi,
        _removals,
        _js_usi,
        _wasm_usi,
    ) in verified:
        production_usi, _ = _project_rules_complete_moves(
            projected_parent.group.parent_sfen,
            rules_complete_usi,
        )
        for move in production_usi:
            child_sfen = lpv.child_sfen_after_usi(
                projected_parent.group.parent_sfen,
                move,
            )
            derived.append(
                (child_sfen, train.position_id_from_sfen(child_sfen))
            )
    qweights = lpv.read_live_board_qweights("public/shogi-nnue-weights.bin")
    child_scores = lpv.score_child_sfens_with_live_nnue(
        qweights,
        [child_sfen for child_sfen, _child_id in derived],
    )
    score_offset = 0
    records: list[dict[str, object]] = []
    expanded: dict[str, list[student.ProjectedParent]] = {
        "browser": [],
        "v9": [],
    }
    domain_original_candidates = {"browser": 0, "v9": 0}
    domain_rules_complete_moves = {"browser": 0, "v9": 0}
    domain_added_moves = {"browser": 0, "v9": 0}
    domain_projection_removals = {"browser": 0, "v9": 0}
    domain_production_moves = {"browser": 0, "v9": 0}
    expanded_semantic_by_domain: dict[str, set[str]] = {
        "browser": set(),
        "v9": set(),
    }
    for (
        domain,
        projected_parent,
        source_candidates,
        rules_complete_usi,
        removals,
        js_usi,
        wasm_usi,
    ) in verified:
        production_usi, expected_removals = _project_rules_complete_moves(
            projected_parent.group.parent_sfen,
            rules_complete_usi,
        )
        if removals != expected_removals:
            raise AssertionError("production projection changed in one run")
        original_by_move = {
            example.move: example
            for example in projected_parent.group.examples
        }
        examples: list[lpv.MoveExample] = []
        move_records: list[dict[str, object]] = []
        for move in production_usi:
            child_sfen, child_position_id = derived[score_offset]
            child_side_cp = child_scores[score_offset]
            score_offset += 1
            base_parent_cp = -child_side_cp
            original = original_by_move.get(move)
            if original is not None and (
                original.child_sfen != child_sfen
                or original.child_position_id != child_position_id
                or original.base_parent_cp != base_parent_cp
            ):
                raise ValueError(
                    "source child derivation/live baseline mismatch "
                    f"for {domain}/{projected_parent.group.parent_id}/{move}"
                )
            examples.append(
                lpv.MoveExample(
                    move=move,
                    teacher_cp=(
                        original.teacher_cp if original is not None else 0.0
                    ),
                    teacher_rank=(
                        original.teacher_rank if original is not None else 0
                    ),
                    child_position_id=child_position_id,
                    child_sfen=child_sfen,
                    features=lpv.encode_explicit_move(
                        projected_parent.group.parent_sfen,
                        move,
                    ),
                    base_parent_cp=base_parent_cp,
                )
            )
            move_records.append(
                {
                    "usi": move,
                    "child_sfen": child_sfen,
                    "child_position_id": child_position_id,
                    "child_side_live_nnue_cp": _float_text(child_side_cp),
                    "base_parent_cp": _float_text(base_parent_cp),
                    "was_original_candidate": move in source_candidates,
                }
            )
        semantic_ids = frozenset(
            [projected_parent.group.position_id]
            + [example.child_position_id for example in examples]
        )
        if semantic_ids & protected_ids:
            raise ValueError(
                "expanded fit move universe overlaps protected/known-eval IDs"
            )
        if semantic_ids & original_tune_ids:
            raise ValueError(
                "expanded fit move universe overlaps original tune IDs"
            )
        expanded_semantic_by_domain[domain].update(semantic_ids)
        expanded_group = replace(
            projected_parent.group,
            semantic_position_ids=semantic_ids,
            examples=tuple(examples),
        )
        expanded_parent = student.ProjectedParent(
            group=expanded_group,
            source_moves=rules_complete_usi,
            production_moves=production_usi,
            removals=removals,
            source_candidate_moves=source_candidates,
        )
        expanded[domain].append(expanded_parent)
        source_set = set(source_candidates)
        added = sum(move not in source_set for move in production_usi)
        domain_original_candidates[domain] += len(source_candidates)
        domain_rules_complete_moves[domain] += len(rules_complete_usi)
        domain_added_moves[domain] += added
        domain_projection_removals[domain] += len(removals)
        domain_production_moves[domain] += len(production_usi)
        records.append(
            {
                "schema": MOVE_UNIVERSE_RECORD_SCHEMA,
                "domain": domain,
                "game_id": expanded_group.game_id,
                "parent_id": expanded_group.parent_id,
                "position_id": expanded_group.position_id,
                "parent_sfen": expanded_group.parent_sfen,
                "source_candidate_usi": list(source_candidates),
                "rules_complete_usi": list(rules_complete_usi),
                "projection_removals": [
                    asdict(removal) for removal in removals
                ],
                "production_usi": list(production_usi),
                "production_js_usi": js_usi,
                "production_wasm_usi": wasm_usi,
                "moves": move_records,
            }
        )
    if score_offset != len(derived) or score_offset != len(child_scores):
        raise AssertionError("expanded move scoring was not consumed exactly")
    cross_domain = (
        expanded_semantic_by_domain["browser"]
        & expanded_semantic_by_domain["v9"]
    )
    if cross_domain:
        raise ValueError("expanded fit domains retain semantic overlap")
    payload = b"".join(_canonical_json(record) for record in records)
    if output_path.exists() != receipt_path.exists():
        raise ValueError("partial production move-universe publication")
    _atomic_publish_bytes(output_path, payload)
    artifact = _fingerprint(output_path)
    receipt = {
        "schema": MOVE_UNIVERSE_RECEIPT_SCHEMA,
        "status": (
            "complete-all-fit-parents-rules-js-wasm-expanded-firewall-exact"
        ),
        "artifact": artifact,
        "parents": len(records),
        "domain_parents": domain_counts,
        "domain_original_candidates": domain_original_candidates,
        "domain_rules_complete_moves": domain_rules_complete_moves,
        "domain_added_moves": domain_added_moves,
        "domain_projection_removals": domain_projection_removals,
        "domain_production_moves": domain_production_moves,
        "production_moves": sum(domain_production_moves.values()),
        "protocol": dict(protocol_identity),
        "bridge_source": bridge_identity,
        "node": node_runtime,
        "wasm": {
            "bytes": MOVE_UNIVERSE_WASM_BYTES,
            "sha256": MOVE_UNIVERSE_WASM_SHA256,
            "root_move_buffer_offset": MOVE_UNIVERSE_WASM_BUFFER_OFFSET,
        },
        "production_move_universe_sources": source_receipts,
        "rules_complete_projected_equals_production_js": True,
        "rules_complete_projected_equals_production_wasm": True,
        "semantic_firewall": {
            "protected_ids": len(protected_ids),
            "protected_ids_sha256": _semantic_id_digest(protected_ids),
            "original_tune_ids": len(original_tune_ids),
            "original_tune_ids_sha256": _semantic_id_digest(
                original_tune_ids
            ),
            "expanded_browser_ids": len(
                expanded_semantic_by_domain["browser"]
            ),
            "expanded_browser_ids_sha256": _semantic_id_digest(
                expanded_semantic_by_domain["browser"]
            ),
            "expanded_v9_ids": len(expanded_semantic_by_domain["v9"]),
            "expanded_v9_ids_sha256": _semantic_id_digest(
                expanded_semantic_by_domain["v9"]
            ),
            "protected_overlap": 0,
            "original_tune_overlap": 0,
            "cross_domain_overlap": 0,
        },
        "teacher_inference_started": False,
    }
    _atomic_publish_bytes(receipt_path, _canonical_json(receipt))
    if _strict_json(receipt_path) != receipt:
        raise ValueError("production move-universe receipt changed after publish")
    return receipt, expanded


def validate_existing_production_move_universe(
    projected: Mapping[str, Sequence[student.ProjectedParent]],
    *,
    protocol: Mapping[str, object],
    protocol_identity: Mapping[str, object],
    protected_ids: frozenset[str],
    original_tune_ids: frozenset[str],
    output_path: Path,
    receipt_path: Path,
) -> dict[str, object]:
    """Fully revalidate an expanded artifact without opening a teacher."""

    if (
        not output_path.is_file()
        or output_path.is_symlink()
        or not receipt_path.is_file()
        or receipt_path.is_symlink()
    ):
        raise ValueError("production move-universe publication is absent")
    universe = protocol.get("production_move_universe")
    if type(universe) is not dict:
        raise ValueError("production move-universe protocol is absent")
    source_receipts = universe.get("source_receipts")
    if type(source_receipts) is not list or len(source_receipts) != 5:
        raise ValueError("production move-universe source receipts drifted")
    bridge_identity = _bridge_source_identity()
    receipt = _strict_json(receipt_path)
    node = receipt.get("node")
    if (
        type(node) is not dict
        or set(node) != {"exec_path", "version"}
        or not isinstance(node.get("exec_path"), str)
        or not isinstance(node.get("version"), str)
    ):
        raise ValueError("production move-universe Node receipt is invalid")

    previous: tuple[int, bytes] | None = None
    domain_counts = {"browser": 0, "v9": 0}
    domain_original_candidates = {"browser": 0, "v9": 0}
    domain_rules_complete_moves = {"browser": 0, "v9": 0}
    domain_added_moves = {"browser": 0, "v9": 0}
    domain_projection_removals = {"browser": 0, "v9": 0}
    domain_production_moves = {"browser": 0, "v9": 0}
    expanded_semantic_by_domain: dict[str, set[str]] = {
        "browser": set(),
        "v9": set(),
    }
    expected_by_domain = {
        domain: {
            row.group.parent_id: row
            for row in projected.get(domain, ())
        }
        for domain in ("browser", "v9")
    }
    child_sfens: list[str] = []
    recorded_live_values: list[tuple[str, str]] = []
    parents = 0
    with output_path.open("rb") as handle:
        for line_number, raw in enumerate(handle, start=1):
            parsed = json.loads(raw)
            if raw != _canonical_json(parsed) or type(parsed) is not dict:
                raise ValueError(
                    f"production move-universe row {line_number} "
                    "is not canonical JSON"
                )
            if set(parsed) != {
                "schema",
                "domain",
                "game_id",
                "parent_id",
                "position_id",
                "parent_sfen",
                "source_candidate_usi",
                "rules_complete_usi",
                "projection_removals",
                "production_usi",
                "production_js_usi",
                "production_wasm_usi",
                "moves",
            }:
                raise ValueError(
                    "production move-universe artifact fields drifted"
                )
            domain = parsed.get("domain")
            parent_id = parsed.get("parent_id")
            source_candidate_usi = parsed.get("source_candidate_usi")
            rules_complete_usi = parsed.get("rules_complete_usi")
            production_usi = parsed.get("production_usi")
            removals = parsed.get("projection_removals")
            moves = parsed.get("moves")
            if (
                parsed.get("schema") != MOVE_UNIVERSE_RECORD_SCHEMA
                or domain not in DOMAIN_ORDINAL
                or not isinstance(parent_id, str)
                or type(source_candidate_usi) is not list
                or type(rules_complete_usi) is not list
                or type(production_usi) is not list
                or type(removals) is not list
                or type(moves) is not list
            ):
                raise ValueError(
                    "production move-universe artifact semantics drifted"
                )
            expected_parent = expected_by_domain[domain].get(parent_id)
            expected_source_candidates = (
                ()
                if expected_parent is None
                else (
                    expected_parent.source_candidate_moves
                    or expected_parent.source_moves
                )
            )
            expected_production, expected_removals = (
                _project_rules_complete_moves(
                    str(parsed.get("parent_sfen")),
                    rules_complete_usi,
                )
            )
            if (
                expected_parent is None
                or parsed.get("game_id") != expected_parent.group.game_id
                or parsed.get("position_id")
                != expected_parent.group.position_id
                or parsed.get("parent_sfen")
                != expected_parent.group.parent_sfen
                or source_candidate_usi
                != list(expected_source_candidates)
                or not set(source_candidate_usi).issubset(
                    rules_complete_usi
                )
                or (
                    domain == "browser"
                    and source_candidate_usi != rules_complete_usi
                )
                or production_usi != list(expected_production)
                or removals
                != [asdict(removal) for removal in expected_removals]
                or parsed.get("production_js_usi") != production_usi
                or parsed.get("production_wasm_usi") != production_usi
                or [move.get("usi") for move in moves] != production_usi
            ):
                raise ValueError(
                    "production move-universe artifact membership drifted"
                )
            semantic_ids = {expected_parent.group.position_id}
            for move, move_record in zip(
                production_usi,
                moves,
                strict=True,
            ):
                if type(move_record) is not dict or set(move_record) != {
                    "usi",
                    "child_sfen",
                    "child_position_id",
                    "child_side_live_nnue_cp",
                    "base_parent_cp",
                    "was_original_candidate",
                }:
                    raise ValueError(
                        "production move-universe child record drifted"
                    )
                child_sfen = lpv.child_sfen_after_usi(
                    expected_parent.group.parent_sfen,
                    move,
                )
                child_position_id = train.position_id_from_sfen(child_sfen)
                if (
                    move_record.get("child_sfen") != child_sfen
                    or move_record.get("child_position_id")
                    != child_position_id
                    or move_record.get("was_original_candidate")
                    != (move in source_candidate_usi)
                    or not isinstance(
                        move_record.get("child_side_live_nnue_cp"),
                        str,
                    )
                    or not isinstance(
                        move_record.get("base_parent_cp"),
                        str,
                    )
                ):
                    raise ValueError(
                        "production move-universe child derivation drifted"
                    )
                child_sfens.append(child_sfen)
                recorded_live_values.append(
                    (
                        move_record["child_side_live_nnue_cp"],
                        move_record["base_parent_cp"],
                    )
                )
                semantic_ids.add(child_position_id)
            if semantic_ids & protected_ids:
                raise ValueError(
                    "expanded fit move universe overlaps protected/known-eval IDs"
                )
            if semantic_ids & original_tune_ids:
                raise ValueError(
                    "expanded fit move universe overlaps original tune IDs"
                )
            expanded_semantic_by_domain[domain].update(semantic_ids)
            key = DOMAIN_ORDINAL[domain], parent_id.encode("ascii")
            if previous is not None and key <= previous:
                raise ValueError(
                    "production move-universe artifact order drifted"
                )
            previous = key
            domain_counts[domain] += 1
            domain_original_candidates[domain] += len(
                source_candidate_usi
            )
            domain_rules_complete_moves[domain] += len(rules_complete_usi)
            domain_added_moves[domain] += sum(
                move not in set(source_candidate_usi)
                for move in production_usi
            )
            domain_projection_removals[domain] += len(removals)
            domain_production_moves[domain] += len(production_usi)
            parents += 1
    if any(
        domain_counts[domain] != len(expected_by_domain[domain])
        for domain in ("browser", "v9")
    ):
        raise ValueError("production move-universe parent membership drifted")
    cross_domain = (
        expanded_semantic_by_domain["browser"]
        & expanded_semantic_by_domain["v9"]
    )
    if cross_domain:
        raise ValueError("expanded fit domains retain semantic overlap")
    qweights = lpv.read_live_board_qweights("public/shogi-nnue-weights.bin")
    observed_scores = lpv.score_child_sfens_with_live_nnue(
        qweights,
        child_sfens,
    )
    if any(
        recorded != (_float_text(score), _float_text(-score))
        for recorded, score in zip(
            recorded_live_values,
            observed_scores,
            strict=True,
        )
    ):
        raise ValueError("production move-universe live baseline drifted")
    expected = {
        "schema": MOVE_UNIVERSE_RECEIPT_SCHEMA,
        "status": (
            "complete-all-fit-parents-rules-js-wasm-expanded-firewall-exact"
        ),
        "artifact": _fingerprint(output_path),
        "parents": parents,
        "domain_parents": domain_counts,
        "domain_original_candidates": domain_original_candidates,
        "domain_rules_complete_moves": domain_rules_complete_moves,
        "domain_added_moves": domain_added_moves,
        "domain_projection_removals": domain_projection_removals,
        "domain_production_moves": domain_production_moves,
        "production_moves": sum(domain_production_moves.values()),
        "protocol": dict(protocol_identity),
        "bridge_source": bridge_identity,
        "node": node,
        "wasm": {
            "bytes": MOVE_UNIVERSE_WASM_BYTES,
            "sha256": MOVE_UNIVERSE_WASM_SHA256,
            "root_move_buffer_offset": MOVE_UNIVERSE_WASM_BUFFER_OFFSET,
        },
        "production_move_universe_sources": source_receipts,
        "rules_complete_projected_equals_production_js": True,
        "rules_complete_projected_equals_production_wasm": True,
        "semantic_firewall": {
            "protected_ids": len(protected_ids),
            "protected_ids_sha256": _semantic_id_digest(protected_ids),
            "original_tune_ids": len(original_tune_ids),
            "original_tune_ids_sha256": _semantic_id_digest(
                original_tune_ids
            ),
            "expanded_browser_ids": len(
                expanded_semantic_by_domain["browser"]
            ),
            "expanded_browser_ids_sha256": _semantic_id_digest(
                expanded_semantic_by_domain["browser"]
            ),
            "expanded_v9_ids": len(expanded_semantic_by_domain["v9"]),
            "expanded_v9_ids_sha256": _semantic_id_digest(
                expanded_semantic_by_domain["v9"]
            ),
            "protected_overlap": 0,
            "original_tune_overlap": 0,
            "cross_domain_overlap": 0,
        },
        "teacher_inference_started": False,
    }
    if (
        parents != 20_139
        or domain_counts != {"browser": 875, "v9": 19_264}
        or receipt != expected
    ):
        raise ValueError("production move-universe receipt mismatch")
    return receipt


def shard_for_parent(domain: str, parent_id: str) -> int:
    if domain not in DOMAIN_ORDINAL or not parent_id:
        raise ValueError("invalid distillation shard identity")
    digest = hashlib.sha256(
        f"student-distill-v1:{domain}:{parent_id}".encode("ascii")
    ).digest()
    return int.from_bytes(digest[:8], "big") % SHARDS


def _content_address(
    *,
    shard: int,
    parent_keys: Sequence[tuple[str, str]],
    protocol_identity: Mapping[str, object],
    teacher_identity: Mapping[str, object],
    fit_sources: Mapping[str, object],
    feature_sources: Sequence[Mapping[str, object]],
    move_universe_receipt: Mapping[str, object],
) -> str:
    value = {
        "schema": DISTILLATION_SCHEMA,
        "shard": shard,
        "teacher_sha256": teacher_identity["sha256"],
        "protocol_sha256": protocol_identity["sha256"],
        "fit_sources": fit_sources,
        "parent_keys": [list(row) for row in parent_keys],
        "feature_sources": list(feature_sources),
        "production_move_universe": move_universe_receipt,
    }
    return hashlib.sha256(_canonical_json(value)).hexdigest()


def _float32_text(value: float) -> str:
    if not math.isfinite(value):
        raise ValueError("distillation output is non-finite")
    return format(float(value), ".9g")


def _record_for_prediction(
    domain: str,
    projected: student.ProjectedParent,
    prediction: Sequence[float],
) -> dict[str, object]:
    group = projected.group
    if len(prediction) != len(group.examples):
        raise ValueError("teacher prediction width drift")
    moves = []
    for example, teacher_cp in zip(
        group.examples,
        prediction,
        strict=True,
    ):
        moves.append(
            {
                "usi": example.move,
                "child_position_id": example.child_position_id,
                "child_sfen": example.child_sfen,
                "child_side_live_nnue_cp": _float32_text(
                    -example.base_parent_cp
                ),
                "base_parent_cp": _float32_text(example.base_parent_cp),
                "teacher_combined_parent_cp": _float32_text(teacher_cp),
            }
        )
    return {
        "schema": DISTILLATION_SCHEMA,
        "domain": domain,
        "game_id": group.game_id,
        "parent_id": group.parent_id,
        "position_id": group.position_id,
        "parent_sfen": group.parent_sfen,
        "source_candidate_usi": list(projected.source_candidate_moves),
        "source_rules_complete_usi": list(projected.source_moves),
        "production_usi": list(projected.production_moves),
        "projection_removals": [
            asdict(removal) for removal in projected.removals
        ],
        "moves": moves,
    }


def _teacher_records(
    rows: Sequence[tuple[str, student.ProjectedParent]],
    teacher_model: cpv.OfflineChildBoardCapacityPolicyValue,
    *,
    device: str,
) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    teacher_model.eval()
    with torch.no_grad():
        for domain in ("browser", "v9"):
            selected = [row for row in rows if row[0] == domain]
            batch_size = BROWSER_BATCH if domain == "browser" else V9_BATCH
            for start in range(0, len(selected), batch_size):
                chunk = selected[start : start + batch_size]
                groups = [row[1].group for row in chunk]
                # The batch is built only after projection.  Filtering logits
                # from a larger set-forward is structurally impossible here.
                batch = cpv.make_batch(
                    groups,
                    device,
                    include_child_planes=True,
                )
                prediction = teacher_model(batch)[0].detach().cpu()
                valid = batch["valid"].detach().cpu()
                for row_index, (row_domain, projected) in enumerate(chunk):
                    count = int(valid[row_index].sum().item())
                    records.append(
                        _record_for_prediction(
                            row_domain,
                            projected,
                            prediction[row_index, :count].tolist(),
                        )
                    )
    return sorted(
        records,
        key=lambda row: (
            DOMAIN_ORDINAL[str(row["domain"])],
            str(row["parent_id"]).encode("ascii"),
        ),
    )


class DistillationShardStore:
    def __init__(
        self,
        root: Path,
        *,
        protocol_identity: Mapping[str, object],
        teacher_identity: Mapping[str, object],
        fit_sources: Mapping[str, object],
        feature_sources: Sequence[Mapping[str, object]],
        move_universe_receipt: Mapping[str, object],
    ) -> None:
        self.root = root
        self.protocol_identity = dict(protocol_identity)
        self.teacher_identity = dict(teacher_identity)
        self.fit_sources = dict(fit_sources)
        self.feature_sources = [dict(row) for row in feature_sources]
        self.move_universe_receipt = dict(move_universe_receipt)
        self.shard_root = root / "distillation-shards"

    def paths(
        self,
        shard: int,
        parent_keys: Sequence[tuple[str, str]],
    ) -> tuple[Path, Path, str]:
        address = _content_address(
            shard=shard,
            parent_keys=parent_keys,
            protocol_identity=self.protocol_identity,
            teacher_identity=self.teacher_identity,
            fit_sources=self.fit_sources,
            feature_sources=self.feature_sources,
            move_universe_receipt=self.move_universe_receipt,
        )
        base = self.shard_root / f"shard-{shard:02d}-{address}"
        return (
            base.with_suffix(".jsonl"),
            base.with_suffix(".receipt.json"),
            address,
        )

    def validate(
        self,
        shard: int,
        parent_keys: Sequence[tuple[str, str]],
    ) -> dict[str, object] | None:
        path, receipt_path, address = self.paths(shard, parent_keys)
        if not path.exists() and not receipt_path.exists():
            return None
        if (
            not path.is_file()
            or path.is_symlink()
            or not receipt_path.is_file()
            or receipt_path.is_symlink()
        ):
            raise ValueError(f"incomplete immutable distillation shard {shard}")
        receipt = _strict_json(receipt_path)
        actual = _fingerprint(path)
        observed_keys: list[tuple[str, str]] = []
        with path.open("rb") as handle:
            for line_number, raw in enumerate(handle, start=1):
                key = _line_key(raw, path)
                row = json.loads(raw)
                if raw != _canonical_json(row):
                    raise ValueError(
                        f"distillation shard {shard}:{line_number} "
                        "is not canonical JSON"
                    )
                observed_keys.append(
                    (
                        str(row["domain"]),
                        str(row["parent_id"]),
                    )
                )
        expected = {
            "schema": DISTILLATION_SHARD_RECEIPT_SCHEMA,
            "status": "complete-immutable",
            "shard": shard,
            "content_address": address,
            "parents": len(parent_keys),
            "parent_keys": [list(row) for row in parent_keys],
            "artifact": actual,
            "teacher": self.teacher_identity,
            "protocol": self.protocol_identity,
            "production_move_universe": self.move_universe_receipt,
        }
        if receipt != expected or observed_keys != list(parent_keys):
            raise ValueError(f"distillation shard receipt mismatch {shard}")
        return receipt

    def publish(
        self,
        shard: int,
        parent_keys: Sequence[tuple[str, str]],
        records: Sequence[Mapping[str, object]],
    ) -> dict[str, object]:
        if self.validate(shard, parent_keys) is not None:
            raise ValueError("attempted to regenerate a valid shard")
        path, receipt_path, address = self.paths(shard, parent_keys)
        observed_keys = [
            (str(row["domain"]), str(row["parent_id"])) for row in records
        ]
        if observed_keys != list(parent_keys):
            raise ValueError("distillation shard record order drift")
        payload = b"".join(_canonical_json(row) for row in records)
        _atomic_publish_bytes(path, payload)
        artifact = _fingerprint(path)
        receipt = {
            "schema": DISTILLATION_SHARD_RECEIPT_SCHEMA,
            "status": "complete-immutable",
            "shard": shard,
            "content_address": address,
            "parents": len(parent_keys),
            "parent_keys": [list(row) for row in parent_keys],
            "artifact": artifact,
            "teacher": self.teacher_identity,
            "protocol": self.protocol_identity,
            "production_move_universe": self.move_universe_receipt,
        }
        _atomic_publish_bytes(receipt_path, _canonical_json(receipt))
        return receipt

    def validate_final(
        self,
        *,
        output_path: Path,
        receipt_path: Path,
        expected_parent_keys_by_shard: (
            Mapping[int, Sequence[tuple[str, str]]] | None
        ) = None,
    ) -> dict[str, object]:
        if (
            not output_path.is_file()
            or output_path.is_symlink()
            or not receipt_path.is_file()
            or receipt_path.is_symlink()
        ):
            raise ValueError("final distillation publication is incomplete")
        receipt = _strict_json(receipt_path)
        embedded_shards = receipt.get("shards")
        if type(embedded_shards) is not list or len(embedded_shards) != SHARDS:
            raise ValueError("final distillation shard receipts are incomplete")

        receipts: list[dict[str, object]] = []
        paths: list[Path] = []
        for shard, embedded in enumerate(embedded_shards):
            if type(embedded) is not dict:
                raise ValueError(
                    f"final distillation shard receipt {shard} is malformed"
                )
            raw_keys = embedded.get("parent_keys")
            if type(raw_keys) is not list or any(
                type(row) is not list
                or len(row) != 2
                or row[0] not in DOMAIN_ORDINAL
                or not isinstance(row[1], str)
                or not row[1]
                for row in raw_keys
            ):
                raise ValueError(
                    f"final distillation shard keys {shard} are malformed"
                )
            parent_keys = [
                (str(row[0]), str(row[1])) for row in raw_keys
            ]
            if (
                parent_keys
                != sorted(
                    parent_keys,
                    key=lambda row: (
                        DOMAIN_ORDINAL[row[0]],
                        row[1].encode("ascii"),
                    ),
                )
                or any(
                    shard_for_parent(domain, parent_id) != shard
                    for domain, parent_id in parent_keys
                )
                or (
                    expected_parent_keys_by_shard is not None
                    and parent_keys
                    != list(expected_parent_keys_by_shard[shard])
                )
            ):
                raise ValueError(
                    f"final distillation shard keys {shard} drifted"
                )
            validated = self.validate(shard, parent_keys)
            if validated is None or validated != embedded:
                raise ValueError(
                    f"final distillation shard receipt {shard} drifted"
                )
            path, _receipt_path, _address = self.paths(shard, parent_keys)
            paths.append(path)
            receipts.append(validated)

        parents = production_moves = removals = 0
        with ExitStack() as stack:
            shard_handles = [
                stack.enter_context(path.open("rb")) for path in paths
            ]
            final_handle = stack.enter_context(output_path.open("rb"))
            heap: list[tuple[tuple[int, bytes], int, bytes]] = []
            for index, handle in enumerate(shard_handles):
                raw = handle.readline()
                if raw:
                    heapq.heappush(
                        heap,
                        (_line_key(raw, paths[index]), index, raw),
                    )
            previous: tuple[int, bytes] | None = None
            while heap:
                key, index, shard_raw = heapq.heappop(heap)
                final_raw = final_handle.readline()
                if final_raw != shard_raw:
                    raise ValueError(
                        "final distillation differs from its 64 shards"
                    )
                final_key = _line_key(final_raw, output_path)
                if final_key != key or (
                    previous is not None and final_key <= previous
                ):
                    raise ValueError("final distillation merge order drift")
                previous = final_key
                parsed = json.loads(final_raw)
                production = parsed.get("production_usi")
                removed = parsed.get("projection_removals")
                if (
                    parsed.get("schema") != DISTILLATION_SCHEMA
                    or type(production) is not list
                    or type(removed) is not list
                ):
                    raise ValueError("final distillation row semantics drifted")
                parents += 1
                production_moves += len(production)
                removals += len(removed)
                next_raw = shard_handles[index].readline()
                if next_raw:
                    heapq.heappush(
                        heap,
                        (
                            _line_key(next_raw, paths[index]),
                            index,
                            next_raw,
                        ),
                    )
            if final_handle.readline():
                raise ValueError("final distillation has unbound extra rows")

        expected = {
            "schema": DISTILLATION_RECEIPT_SCHEMA,
            "status": "complete-fit-only-projected-set",
            "artifact": _fingerprint(output_path),
            "parents": parents,
            "production_moves": production_moves,
            "removed_nonpromoting_bishop_rook_moves": removals,
            "shards": receipts,
            "teacher": self.teacher_identity,
            "protocol": self.protocol_identity,
            "production_move_universe": self.move_universe_receipt,
            "tune_parents": 0,
            "sealed_parents": 0,
            "replication_teacher_parents": 0,
            "direct_or_external_parents": 0,
        }
        if receipt != expected:
            raise ValueError("final distillation receipt mismatch")
        return receipt

    def finalize(
        self,
        parent_keys_by_shard: Mapping[int, Sequence[tuple[str, str]]],
        *,
        output_path: Path,
        receipt_path: Path,
    ) -> dict[str, object]:
        receipts: list[dict[str, object]] = []
        paths: list[Path] = []
        for shard in range(SHARDS):
            keys = parent_keys_by_shard[shard]
            receipt = self.validate(shard, keys)
            if receipt is None:
                raise ValueError(f"distillation shard {shard} is missing")
            path, _receipt_path, _address = self.paths(shard, keys)
            paths.append(path)
            receipts.append(receipt)
        if output_path.exists() or receipt_path.exists():
            if not output_path.exists() or not receipt_path.exists():
                raise ValueError("partial final distillation publication")
            return self.validate_final(
                output_path=output_path,
                receipt_path=receipt_path,
                expected_parent_keys_by_shard=parent_keys_by_shard,
            )

        output_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = output_path.with_suffix(output_path.suffix + ".tmp")
        if temporary.exists():
            temporary.unlink()
        with ExitStack() as stack:
            handles = [
                stack.enter_context(path.open("rb")) for path in paths
            ]
            heap: list[tuple[tuple[int, bytes], int, bytes]] = []
            for index, handle in enumerate(handles):
                raw = handle.readline()
                if raw:
                    key = _line_key(raw, paths[index])
                    heapq.heappush(heap, (key, index, raw))
            previous: tuple[int, bytes] | None = None
            parents = moves = removed = 0
            with temporary.open("xb") as output:
                while heap:
                    key, index, raw = heapq.heappop(heap)
                    if previous is not None and key <= previous:
                        raise ValueError("64-way distillation merge order drift")
                    previous = key
                    parsed = json.loads(raw)
                    parents += 1
                    moves += len(parsed["production_usi"])
                    removed += len(parsed["projection_removals"])
                    output.write(raw)
                    next_raw = handles[index].readline()
                    if next_raw:
                        heapq.heappush(
                            heap,
                            (_line_key(next_raw, paths[index]), index, next_raw),
                        )
                output.flush()
                os.fsync(output.fileno())
        os.replace(temporary, output_path)
        _fsync_directory(output_path.parent)
        artifact = _fingerprint(output_path)
        receipt = {
            "schema": DISTILLATION_RECEIPT_SCHEMA,
            "status": "complete-fit-only-projected-set",
            "artifact": artifact,
            "parents": parents,
            "production_moves": moves,
            "removed_nonpromoting_bishop_rook_moves": removed,
            "shards": receipts,
            "teacher": self.teacher_identity,
            "protocol": self.protocol_identity,
            "production_move_universe": self.move_universe_receipt,
            "tune_parents": 0,
            "sealed_parents": 0,
            "replication_teacher_parents": 0,
            "direct_or_external_parents": 0,
        }
        _atomic_publish_bytes(receipt_path, _canonical_json(receipt))
        return self.validate_final(
            output_path=output_path,
            receipt_path=receipt_path,
            expected_parent_keys_by_shard=parent_keys_by_shard,
        )


def _line_key(raw: bytes, context: Path) -> tuple[int, bytes]:
    if not raw.endswith(b"\n") or raw == b"\n":
        raise ValueError(f"{context}: non-canonical JSONL row")
    row = json.loads(raw)
    domain = row.get("domain")
    parent_id = row.get("parent_id")
    if domain not in DOMAIN_ORDINAL or not isinstance(parent_id, str):
        raise ValueError(f"{context}: invalid merged parent identity")
    return DOMAIN_ORDINAL[domain], parent_id.encode("ascii")


def load_teacher(
    checkpoint_receipt: Mapping[str, object],
    *,
    device: str,
) -> cpv.OfflineChildBoardCapacityPolicyValue:
    checkpoint = checkpoint_receipt.get("checkpoint")
    if type(checkpoint) is not dict:
        raise ValueError("teacher checkpoint receipt is malformed")
    value = torch.load(
        str(checkpoint["path"]),
        map_location="cpu",
        weights_only=False,
    )
    if (
        type(value) is not dict
        or value.get("seed") != 42
        or value.get("parameters") != 6_168_130
        or type(value.get("model")) is not dict
    ):
        raise ValueError("seed-42 teacher checkpoint metadata drift")
    model = cpv.OfflineChildBoardCapacityPolicyValue()
    model.load_state_dict(value["model"], strict=True)
    return model.to(device).eval()


def generate_distillation(
    projected_fit: Mapping[str, Sequence[student.ProjectedParent]],
    teacher_model: cpv.OfflineChildBoardCapacityPolicyValue,
    store: DistillationShardStore,
    *,
    device: str,
    output_path: Path,
    receipt_path: Path,
) -> dict[str, object]:
    by_shard: dict[int, list[tuple[str, student.ProjectedParent]]] = {
        index: [] for index in range(SHARDS)
    }
    for domain in ("browser", "v9"):
        for row in projected_fit[domain]:
            by_shard[shard_for_parent(domain, row.group.parent_id)].append(
                (domain, row)
            )
    parent_keys_by_shard: dict[int, list[tuple[str, str]]] = {}
    for shard in range(SHARDS):
        rows = sorted(
            by_shard[shard],
            key=lambda row: (
                DOMAIN_ORDINAL[row[0]],
                row[1].group.parent_id.encode("ascii"),
            ),
        )
        parent_keys = [
            (domain, projected.group.parent_id)
            for domain, projected in rows
        ]
        parent_keys_by_shard[shard] = parent_keys
        if store.validate(shard, parent_keys) is None:
            records = _teacher_records(
                rows,
                teacher_model,
                device=device,
            )
            store.publish(shard, parent_keys, records)
    return store.finalize(
        parent_keys_by_shard,
        output_path=output_path,
        receipt_path=receipt_path,
    )


def _distillation_parent_keys_by_shard(
    projected_fit: Mapping[str, Sequence[student.ProjectedParent]],
) -> dict[int, list[tuple[str, str]]]:
    keys: dict[int, list[tuple[str, str]]] = {
        shard: [] for shard in range(SHARDS)
    }
    for domain in ("browser", "v9"):
        for projected in projected_fit[domain]:
            parent_id = projected.group.parent_id
            keys[shard_for_parent(domain, parent_id)].append(
                (domain, parent_id)
            )
    for shard in range(SHARDS):
        keys[shard].sort(
            key=lambda row: (
                DOMAIN_ORDINAL[row[0]],
                row[1].encode("ascii"),
            )
        )
    return keys


def _downstream_artifacts_exist(output: Path) -> bool:
    return any(
        path.exists() or path.is_symlink()
        for path in (
            output / LAST_CHECKPOINT_PATH.name,
            output / FINAL_CHECKPOINT_PATH.name,
            output / TENSOR_PATH.name,
            output / MANIFEST_PATH.name,
            output / RESULT_PATH.name,
        )
    )


def _require_existing_regular_file(path: Path, label: str) -> None:
    if not path.is_file() or path.is_symlink():
        raise ValueError(f"existing downstream state requires {label}")


def _validate_existing_preparation(
    projected_fit: Mapping[str, Sequence[student.ProjectedParent]],
    store: DistillationShardStore,
    *,
    distillation_path: Path,
    distillation_receipt_path: Path,
    parity_path: Path,
    parity_receipt_path: Path,
) -> tuple[dict[str, object], dict[str, object]]:
    _require_existing_regular_file(
        distillation_path,
        "complete final distillation artifact",
    )
    _require_existing_regular_file(
        distillation_receipt_path,
        "complete final distillation receipt",
    )
    _require_existing_regular_file(parity_path, "complete parity artifact")
    _require_existing_regular_file(
        parity_receipt_path,
        "complete parity receipt",
    )
    distillation_receipt = store.validate_final(
        output_path=distillation_path,
        receipt_path=distillation_receipt_path,
        expected_parent_keys_by_shard=_distillation_parent_keys_by_shard(
            projected_fit
        ),
    )
    # The publisher is also the full immutable parity validator: both files
    # already exist, so it can only accept their exact recomputed bytes.
    parity_receipt = publish_parity_fixture(
        distillation_path,
        distillation_receipt,
        output_path=parity_path,
        receipt_path=parity_receipt_path,
    )
    return distillation_receipt, parity_receipt


def _read_distillation_records(path: Path) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    previous: tuple[int, bytes] | None = None
    with path.open("rb") as handle:
        for line_number, raw in enumerate(handle, start=1):
            key = _line_key(raw, path)
            if previous is not None and key <= previous:
                raise ValueError(
                    f"{path}:{line_number}: global record order drift"
                )
            previous = key
            row = json.loads(raw)
            if row.get("schema") != DISTILLATION_SCHEMA:
                raise ValueError(
                    f"{path}:{line_number}: distillation schema drift"
                )
            records.append(row)
    return records


def load_distillation_groups(
    path: Path,
) -> dict[str, list[lpv.ParentGroup]]:
    by_domain: dict[str, list[lpv.ParentGroup]] = {
        "browser": [],
        "v9": [],
    }
    for row in _read_distillation_records(path):
        domain = row["domain"]
        if domain not in by_domain:
            raise ValueError("distillation record domain drift")
        parent_sfen = str(row["parent_sfen"])
        parent_board, parent_hands, _turn, _king = train.parse_sfen(
            parent_sfen
        )
        padded_parent = tuple(
            parent_board[: train.MAX_PIECES]
            + [train.PAD_IDX]
            * (train.MAX_PIECES - len(parent_board))
        )
        moves = row.get("moves")
        production_usi = row.get("production_usi")
        if type(moves) is not list or type(production_usi) is not list:
            raise ValueError("distillation move arrays are absent")
        if [move.get("usi") for move in moves] != production_usi:
            raise ValueError("distillation move order drift")
        scores = [float(move["teacher_combined_parent_cp"]) for move in moves]
        ranking = sorted(
            range(len(moves)),
            key=lambda index: (
                -scores[index],
                str(moves[index]["usi"]).encode("ascii"),
            ),
        )
        rank_by_index = {
            index: rank + 1 for rank, index in enumerate(ranking)
        }
        examples = tuple(
            lpv.MoveExample(
                move=str(move["usi"]),
                teacher_cp=scores[index],
                teacher_rank=rank_by_index[index],
                child_position_id=str(move["child_position_id"]),
                child_sfen=str(move["child_sfen"]),
                features=lpv.encode_explicit_move(
                    parent_sfen,
                    str(move["usi"]),
                ),
                base_parent_cp=float(move["base_parent_cp"]),
            )
            for index, move in enumerate(moves)
        )
        position_id = str(row["position_id"])
        by_domain[domain].append(
            lpv.ParentGroup(
                parent_id=str(row["parent_id"]),
                game_id=str(row["game_id"]),
                position_id=position_id,
                parent_sfen=parent_sfen,
                parent_board=padded_parent,
                parent_hands=tuple(parent_hands),
                semantic_position_ids=frozenset(
                    [position_id]
                    + [example.child_position_id for example in examples]
                ),
                examples=examples,
                source_role=(
                    "browser-all-legal" if domain == "browser" else "v9"
                ),
            )
        )
    if len(by_domain["browser"]) != 875 or len(by_domain["v9"]) != 19_264:
        raise ValueError("distillation fit parent count drift")
    return by_domain


def publish_parity_fixture(
    distillation_path: Path,
    distillation_receipt: Mapping[str, object],
    *,
    output_path: Path,
    receipt_path: Path,
) -> dict[str, object]:
    records = _read_distillation_records(distillation_path)
    selected: list[dict[str, object]] = []
    parent_hashes: dict[str, str] = {}
    for domain in ("browser", "v9"):
        domain_rows = [row for row in records if row["domain"] == domain]
        ranked = sorted(
            domain_rows,
            key=lambda row: hashlib.sha256(
                (
                    "child-board-student-parity-v1:"
                    f"{domain}:{row['parent_id']}"
                ).encode("ascii")
            ).digest(),
        )[:512]
        if len(ranked) != 512:
            raise ValueError("parity fixture fit source is incomplete")
        selected.extend(ranked)
        parent_hashes[domain] = hashlib.sha256(
            "\n".join(str(row["parent_id"]) for row in ranked).encode("ascii")
        ).hexdigest()
    payload = b"".join(_canonical_json(row) for row in selected)
    _atomic_publish_bytes(output_path, payload)
    artifact = _fingerprint(output_path)
    receipt = {
        "schema": PARITY_RECEIPT_SCHEMA,
        "status": "complete-fit-only-frozen-before-optimizer",
        "fixture_schema": PARITY_SCHEMA,
        "artifact": artifact,
        "parents": 1024,
        "browser_parents": 512,
        "v9_parents": 512,
        "parent_ids_sha256": parent_hashes,
        "source_distillation": distillation_receipt["artifact"],
        "tune_parents": 0,
        "sealed_parents": 0,
    }
    _atomic_publish_bytes(receipt_path, _canonical_json(receipt))
    return receipt


def _batch_loss(
    model: student.ChildBoardRootPolicyStudent,
    groups: Sequence[lpv.ParentGroup],
    *,
    device: str,
    pad_moves_to: int,
) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
    batch = student.make_student_batch(
        groups,
        device,
        pad_moves_to=pad_moves_to,
    )
    combined, _residual = model(batch)
    return student.distillation_loss(
        combined,
        batch["teacher_cp"],
        batch["valid"],
    )


def _train_step(
    model: student.ChildBoardRootPolicyStudent,
    optimizer: torch.optim.Optimizer,
    domain_batches: Sequence[tuple[Sequence[lpv.ParentGroup], int]],
    *,
    device: str,
) -> tuple[float, dict[str, float]]:
    losses: list[torch.Tensor] = []
    parts_by_domain: list[dict[str, torch.Tensor]] = []
    for groups, padding in domain_batches:
        loss, parts = _batch_loss(
            model,
            groups,
            device=device,
            pad_moves_to=padding,
        )
        losses.append(loss)
        parts_by_domain.append(parts)
    total = sum(losses)
    optimizer.zero_grad(set_to_none=True)
    total.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), GRADIENT_CLIP)
    optimizer.step()
    component_names = ("listwise", "pair", "best_margin", "move_value")
    components = {
        name: sum(
            float(parts[name].detach().cpu().item())
            for parts in parts_by_domain
        )
        for name in component_names
    }
    return float(total.detach().cpu().item()), components


def _v9_rotation(
    groups: Sequence[lpv.ParentGroup],
    *,
    epoch: int,
    count: int,
) -> list[lpv.ParentGroup]:
    ordered = sorted(groups, key=lambda group: group.parent_id)
    if not ordered or count <= 0:
        raise ValueError("invalid V9 rotation inputs")
    start = ((epoch - 1) * count) % len(ordered)
    return [ordered[(start + index) % len(ordered)] for index in range(count)]


def _balanced_slices(
    values: Sequence[lpv.ParentGroup],
    count: int,
) -> list[list[lpv.ParentGroup]]:
    if count <= 0 or len(values) < count:
        raise ValueError("cannot split the V9 rotation into empty slices")
    return [
        list(
            values[
                index * len(values) // count :
                (index + 1) * len(values) // count
            ]
        )
        for index in range(count)
    ]


def _mps_rng_state() -> torch.Tensor:
    if not hasattr(torch.mps, "get_rng_state"):
        raise ValueError("MPS RNG state is not readable")
    return torch.mps.get_rng_state().cpu()


def _checkpoint_value(
    model: student.ChildBoardRootPolicyStudent,
    optimizer: torch.optim.Optimizer,
    *,
    phase: str,
    completed_epoch: int,
    curve: Sequence[Mapping[str, object]],
    protocol_identity: Mapping[str, object],
    distillation_identity: Mapping[str, object],
    teacher_hashes: Mapping[str, str],
    device: str,
) -> dict[str, object]:
    value: dict[str, object] = {
        "checkpoint_schema": CHECKPOINT_SCHEMA,
        "schema": student.SCHEMA,
        "feature_version": student.FEATURE_VERSION,
        "model_variant": student.MODEL_VARIANT,
        "parameters": student.PARAMETERS,
        "seed": student.INITIALIZATION_SEED,
        "phase": phase,
        "completed_epoch": completed_epoch,
        "protocol": dict(protocol_identity),
        "distillation": dict(distillation_identity),
        "teacher_hashes": dict(teacher_hashes),
        "model": model.state_dict(),
        "optimizer": optimizer.state_dict(),
        "cpu_rng_state": torch.get_rng_state(),
        "python_rng_state": random.getstate(),
        "curve": list(curve),
    }
    if device == "mps":
        value["mps_rng_state"] = _mps_rng_state()
    return value


def _validate_checkpoint_metadata(
    value: Mapping[str, object],
    *,
    protocol_identity: Mapping[str, object],
    distillation_identity: Mapping[str, object],
    teacher_hashes: Mapping[str, str],
    device: str | None = None,
) -> None:
    expected_keys = {
        "checkpoint_schema",
        "schema",
        "feature_version",
        "model_variant",
        "parameters",
        "seed",
        "phase",
        "completed_epoch",
        "protocol",
        "distillation",
        "teacher_hashes",
        "model",
        "optimizer",
        "cpu_rng_state",
        "python_rng_state",
        "curve",
    }
    if device == "mps" or device is None and "mps_rng_state" in value:
        expected_keys.add("mps_rng_state")
    if (
        set(value) != expected_keys
        or value.get("checkpoint_schema") != CHECKPOINT_SCHEMA
        or value.get("schema") != student.SCHEMA
        or value.get("feature_version") != student.FEATURE_VERSION
        or value.get("model_variant") != student.MODEL_VARIANT
        or value.get("parameters") != student.PARAMETERS
        or value.get("seed") != student.INITIALIZATION_SEED
        or value.get("protocol") != protocol_identity
        or value.get("distillation") != distillation_identity
        or value.get("teacher_hashes") != teacher_hashes
        or value.get("phase") not in ("v9-pretrain", "mixed")
        or type(value.get("completed_epoch")) is not int
        or not isinstance(value.get("model"), Mapping)
        or not isinstance(value.get("optimizer"), Mapping)
        or not isinstance(value.get("cpu_rng_state"), torch.Tensor)
        or type(value.get("curve")) is not list
    ):
        raise ValueError("student exact-resume checkpoint metadata drift")
    phase = value["phase"]
    epoch = int(value["completed_epoch"])
    if (
        phase == "v9-pretrain"
        and not 1 <= epoch <= V9_PRETRAIN_EPOCHS
        or phase == "mixed"
        and not 1 <= epoch <= MIXED_EPOCHS
    ):
        raise ValueError("student exact-resume epoch drift")
    expected_curve_rows = (
        epoch if phase == "v9-pretrain" else V9_PRETRAIN_EPOCHS + epoch
    )
    curve = value["curve"]
    if len(curve) != expected_curve_rows or any(
        type(row) is not dict for row in curve
    ):
        raise ValueError("student exact-resume curve drift")

    model_state = value["model"]
    if (
        not isinstance(model_state, Mapping)
        or list(model_state) != list(student.STATE_TENSOR_SHAPES)
    ):
        raise ValueError("student exact-resume model state drift")
    parameters = 0
    for name, shape in student.STATE_TENSOR_SHAPES.items():
        tensor = model_state[name]
        if (
            not isinstance(tensor, torch.Tensor)
            or tensor.device.type != "cpu"
            or tensor.dtype != torch.float32
            or tuple(tensor.shape) != shape
            or not bool(torch.isfinite(tensor).all())
        ):
            raise ValueError("student exact-resume model state drift")
        parameters += tensor.numel()
    if parameters != student.PARAMETERS:
        raise ValueError("student exact-resume model state drift")

    optimizer_state = value["optimizer"]
    if (
        not isinstance(optimizer_state, Mapping)
        or set(optimizer_state) != {"state", "param_groups"}
        or not isinstance(optimizer_state["state"], Mapping)
        or type(optimizer_state["param_groups"]) is not list
        or len(optimizer_state["param_groups"]) != 1
    ):
        raise ValueError("student exact-resume optimizer state drift")
    parameter_ids = list(range(len(student.STATE_TENSOR_SHAPES)))
    expected_group = {
        "lr": LEARNING_RATE,
        "betas": (0.9, 0.999),
        "eps": 1e-8,
        "weight_decay": WEIGHT_DECAY,
        "amsgrad": False,
        "maximize": False,
        "foreach": None,
        "capturable": False,
        "differentiable": False,
        "fused": None,
        "decoupled_weight_decay": True,
        "params": parameter_ids,
    }
    if not _torch_semantic_equal(
        optimizer_state["param_groups"][0],
        expected_group,
    ):
        raise ValueError("student exact-resume optimizer state drift")
    states = optimizer_state["state"]
    if set(states) != set(parameter_ids):
        raise ValueError("student exact-resume optimizer state drift")
    observed_step: float | None = None
    for parameter_id, shape in enumerate(student.STATE_TENSOR_SHAPES.values()):
        state = states[parameter_id]
        if not isinstance(state, Mapping) or set(state) != {
            "step",
            "exp_avg",
            "exp_avg_sq",
        }:
            raise ValueError("student exact-resume optimizer state drift")
        step = state["step"]
        if (
            not isinstance(step, torch.Tensor)
            or step.device.type != "cpu"
            or step.dtype != torch.float32
            or step.shape != ()
            or not bool(torch.isfinite(step))
        ):
            raise ValueError("student exact-resume optimizer state drift")
        step_value = float(step.item())
        if step_value < 1 or not step_value.is_integer():
            raise ValueError("student exact-resume optimizer state drift")
        if observed_step is None:
            observed_step = step_value
        elif step_value != observed_step:
            raise ValueError("student exact-resume optimizer state drift")
        for name in ("exp_avg", "exp_avg_sq"):
            tensor = state[name]
            if (
                not isinstance(tensor, torch.Tensor)
                or tensor.device.type != "cpu"
                or tensor.dtype != torch.float32
                or tuple(tensor.shape) != shape
                or not bool(torch.isfinite(tensor).all())
            ):
                raise ValueError("student exact-resume optimizer state drift")

    cpu_rng_state = value["cpu_rng_state"]
    if (
        not isinstance(cpu_rng_state, torch.Tensor)
        or cpu_rng_state.device.type != "cpu"
        or cpu_rng_state.dtype != torch.uint8
        or cpu_rng_state.ndim != 1
        or cpu_rng_state.numel() == 0
    ):
        raise ValueError("student exact-resume CPU RNG state drift")
    try:
        cpu_generator = torch.Generator(device="cpu")
        cpu_generator.set_state(cpu_rng_state)
    except (RuntimeError, TypeError) as error:
        raise ValueError(
            "student exact-resume CPU RNG state drift"
        ) from error
    if not torch.equal(cpu_generator.get_state(), cpu_rng_state):
        raise ValueError("student exact-resume CPU RNG state drift")

    try:
        python_generator = random.Random()
        python_generator.setstate(value["python_rng_state"])
    except (TypeError, ValueError) as error:
        raise ValueError(
            "student exact-resume Python RNG state drift"
        ) from error
    if python_generator.getstate() != value["python_rng_state"]:
        raise ValueError("student exact-resume Python RNG state drift")

    if "mps_rng_state" in expected_keys:
        mps_rng_state = value["mps_rng_state"]
        if (
            not isinstance(mps_rng_state, torch.Tensor)
            or mps_rng_state.device.type != "cpu"
            or mps_rng_state.dtype != torch.uint8
            or mps_rng_state.ndim != 1
            or mps_rng_state.numel() == 0
        ):
            raise ValueError("student exact-resume MPS RNG state drift")
        if device == "mps":
            if not torch.backends.mps.is_available():
                raise ValueError("student exact-resume MPS is unavailable")
            current_mps_state = _mps_rng_state()
            if (
                current_mps_state.dtype != mps_rng_state.dtype
                or current_mps_state.shape != mps_rng_state.shape
            ):
                raise ValueError("student exact-resume MPS RNG state drift")


def _next_epoch(phase: str | None, completed: int) -> tuple[str, int] | None:
    if phase is None:
        return "v9-pretrain", 1
    if phase == "v9-pretrain" and completed < V9_PRETRAIN_EPOCHS:
        return phase, completed + 1
    if phase == "v9-pretrain" and completed == V9_PRETRAIN_EPOCHS:
        return "mixed", 1
    if phase == "mixed" and completed < MIXED_EPOCHS:
        return phase, completed + 1
    if phase == "mixed" and completed == MIXED_EPOCHS:
        return None
    raise ValueError("student checkpoint schedule position is invalid")


def train_student(
    groups: Mapping[str, Sequence[lpv.ParentGroup]],
    *,
    output: Path,
    device: str,
    protocol_identity: Mapping[str, object],
    distillation_identity: Mapping[str, object],
    teacher_hashes: Mapping[str, str],
    stop_after: tuple[str, int] | None = None,
) -> dict[str, object]:
    checkpoint_path = output / LAST_CHECKPOINT_PATH.name
    if device == "mps" and not torch.backends.mps.is_available():
        raise ValueError("student training requires available MPS")
    existing_checkpoint: dict[str, object] | None = None
    if checkpoint_path.exists():
        loaded = torch.load(
            checkpoint_path,
            map_location="cpu",
            weights_only=False,
        )
        if type(loaded) is not dict:
            raise ValueError("student exact-resume checkpoint is malformed")
        _validate_checkpoint_metadata(
            loaded,
            protocol_identity=protocol_identity,
            distillation_identity=distillation_identity,
            teacher_hashes=teacher_hashes,
            device=device,
        )
        if (
            loaded.get("phase") == "mixed"
            and loaded.get("completed_epoch") == MIXED_EPOCHS
        ):
            return {
                "phase": "mixed",
                "completed_epoch": MIXED_EPOCHS,
                "curve": list(loaded["curve"]),
                "checkpoint": _fingerprint(checkpoint_path),
                "training_complete_terminalize_only": True,
            }
        existing_checkpoint = loaded
    random.seed(student.INITIALIZATION_SEED)
    torch.manual_seed(student.INITIALIZATION_SEED)
    if device == "mps":
        if not hasattr(torch.mps, "manual_seed"):
            raise ValueError("student training requires seedable MPS")
        torch.mps.manual_seed(student.INITIALIZATION_SEED)
    model = student.ChildBoardRootPolicyStudent().to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=LEARNING_RATE,
        weight_decay=WEIGHT_DECAY,
    )
    curve: list[dict[str, object]] = []
    phase: str | None = None
    completed = 0
    if existing_checkpoint is not None:
        checkpoint = existing_checkpoint
        model.load_state_dict(checkpoint["model"], strict=True)
        optimizer.load_state_dict(checkpoint["optimizer"])
        torch.set_rng_state(checkpoint["cpu_rng_state"])
        random.setstate(checkpoint["python_rng_state"])
        if device == "mps":
            state = checkpoint.get("mps_rng_state")
            if not isinstance(state, torch.Tensor):
                raise ValueError("student MPS RNG state is absent")
            torch.mps.set_rng_state(state)
        phase = str(checkpoint["phase"])
        completed = int(checkpoint["completed_epoch"])
        curve = list(checkpoint["curve"])
    while (next_position := _next_epoch(phase, completed)) is not None:
        next_phase, epoch = next_position
        model.train()
        started = time.monotonic()
        loss_sum = 0.0
        component_sums = {
            "listwise": 0.0,
            "pair": 0.0,
            "best_margin": 0.0,
            "move_value": 0.0,
        }
        if next_phase == "v9-pretrain":
            batches = data_contract.bucketed_batches(
                groups["v9"],
                epoch=epoch,
                seed=student.INITIALIZATION_SEED,
                maximum_parents=V9_BATCH,
            )
            domain_steps = [
                ((batch, boundary),) for boundary, batch in batches
            ]
            browser_parents = 0
            v9_parents = len(groups["v9"])
        else:
            browser_batches = data_contract.bucketed_batches(
                groups["browser"],
                epoch=epoch,
                seed=student.INITIALIZATION_SEED,
                maximum_parents=BROWSER_BATCH,
            )
            v9_count = len(groups["browser"]) * V9_PER_BROWSER
            rotating_v9 = _v9_rotation(
                groups["v9"],
                epoch=epoch,
                count=v9_count,
            )
            v9_slices = _balanced_slices(
                rotating_v9,
                len(browser_batches),
            )
            domain_steps = []
            for (browser_padding, browser_batch), v9_batch in zip(
                browser_batches,
                v9_slices,
                strict=True,
            ):
                v9_padding = max(
                    data_contract.move_bucket(group) for group in v9_batch
                )
                domain_steps.append(
                    (
                        (browser_batch, browser_padding),
                        (v9_batch, v9_padding),
                    )
                )
            browser_parents = len(groups["browser"])
            v9_parents = v9_count
        for domain_step in domain_steps:
            loss, components = _train_step(
                model,
                optimizer,
                domain_step,
                device=device,
            )
            loss_sum += loss
            for name, value in components.items():
                component_sums[name] += value
        row = {
            "phase": next_phase,
            "epoch": epoch,
            "batches": len(domain_steps),
            "browser_parents": browser_parents,
            "v9_parents": v9_parents,
            "loss": loss_sum / len(domain_steps),
            "components": {
                name: value / len(domain_steps)
                for name, value in component_sums.items()
            },
            "seconds": time.monotonic() - started,
        }
        curve.append(row)
        phase, completed = next_phase, epoch
        checkpoint = _checkpoint_value(
            model,
            optimizer,
            phase=phase,
            completed_epoch=completed,
            curve=curve,
            protocol_identity=protocol_identity,
            distillation_identity=distillation_identity,
            teacher_hashes=teacher_hashes,
            device=device,
        )
        _atomic_replace_torch(checkpoint_path, checkpoint)
        print(json.dumps(row, sort_keys=True), flush=True)
        if stop_after == (phase, completed):
            break
    return {
        "phase": phase,
        "completed_epoch": completed,
        "curve": curve,
        "checkpoint": _fingerprint(checkpoint_path),
    }


def _tensor_bytes(value: torch.Tensor) -> bytes:
    tensor = value.detach().cpu().to(torch.float32).contiguous()
    if sys.byteorder != "little":
        raise ValueError("runtime tensor export requires a little-endian host")
    return bytes(tensor.view(torch.uint8).flatten().tolist())


def _state_payload(
    model_state: Mapping[str, torch.Tensor],
) -> tuple[bytes, list[dict[str, object]]]:
    names = sorted(model_state, key=lambda name: name.encode("utf-8"))
    payload = bytearray()
    tensors: list[dict[str, object]] = []
    parameters = 0
    for name in names:
        value = model_state[name]
        if not isinstance(value, torch.Tensor):
            raise ValueError("student model state contains a non-tensor")
        raw = _tensor_bytes(value)
        offset = len(payload)
        payload.extend(raw)
        parameters += value.numel()
        tensors.append(
            {
                "name": name,
                "shape": list(value.shape),
                "dtype": "float32-le",
                "offset": offset,
                "length": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
            }
        )
    if parameters != student.PARAMETERS or len(payload) != student.FP32_PAYLOAD_BYTES:
        raise ValueError("student runtime tensor size drift")
    return bytes(payload), tensors


def terminalize_only(
    *,
    output: Path,
    protocol_identity: Mapping[str, object],
    distillation_receipt: Mapping[str, object],
    parity_receipt: Mapping[str, object],
    teacher_hashes: Mapping[str, str],
) -> dict[str, object]:
    result_path = output / RESULT_PATH.name
    if result_path.exists():
        result = _strict_json(result_path)
        if (
            result.get("schema") != RESULT_SCHEMA
            or result.get("status") != RESULT_STATUS
            or result.get("protocol") != protocol_identity
            or result.get("teacher_hashes") != teacher_hashes
            or result.get("tune_opened") is not False
            or result.get("sealed_opened") is not False
            or result.get("live_weights_changed") is not False
            or result.get("distillation") != distillation_receipt
            or result.get("parity_fixture") != parity_receipt
        ):
            raise ValueError("student terminal result drift")
        training = result.get("training")
        artifacts = result.get("runtime_artifacts")
        if (
            type(training) is not dict
            or type(artifacts) is not dict
            or training.get("last_checkpoint")
            != _fingerprint(output / LAST_CHECKPOINT_PATH.name)
            or training.get("final_checkpoint")
            != _fingerprint(output / FINAL_CHECKPOINT_PATH.name)
            or artifacts.get("tensor")
            != _fingerprint(output / TENSOR_PATH.name)
            or artifacts.get("manifest")
            != _fingerprint(output / MANIFEST_PATH.name)
        ):
            raise ValueError("student terminal artifact drift")
        return result
    last_path = output / LAST_CHECKPOINT_PATH.name
    checkpoint = torch.load(
        last_path,
        map_location="cpu",
        weights_only=False,
    )
    if type(checkpoint) is not dict:
        raise ValueError("student mixed-12 checkpoint is malformed")
    _validate_checkpoint_metadata(
        checkpoint,
        protocol_identity=protocol_identity,
        distillation_identity=distillation_receipt["artifact"],
        teacher_hashes=teacher_hashes,
    )
    if checkpoint.get("phase") != "mixed" or checkpoint.get(
        "completed_epoch"
    ) != MIXED_EPOCHS:
        raise ValueError("terminalize-only requires mixed epoch 12")
    model_state = checkpoint["model"]
    if not isinstance(model_state, Mapping):
        raise ValueError("student terminal model state is absent")
    final_value = {
        "checkpoint_schema": FINAL_CHECKPOINT_SCHEMA,
        "schema": student.SCHEMA,
        "feature_version": student.FEATURE_VERSION,
        "model_variant": student.MODEL_VARIANT,
        "parameters": student.PARAMETERS,
        "seed": student.INITIALIZATION_SEED,
        "phase": "mixed",
        "completed_epoch": MIXED_EPOCHS,
        "protocol": dict(protocol_identity),
        "distillation": dict(distillation_receipt["artifact"]),
        "teacher_hashes": dict(teacher_hashes),
        "curve": checkpoint["curve"],
        "source_last_checkpoint": _fingerprint(last_path),
        "model": model_state,
    }
    final_path = output / FINAL_CHECKPOINT_PATH.name
    _atomic_publish_torch(final_path, final_value)
    # Validate an existing final by its semantic model, not by reserializing it.
    observed_final = torch.load(
        final_path,
        map_location="cpu",
        weights_only=False,
    )
    if not _torch_semantic_equal(observed_final, final_value):
        raise ValueError("student final checkpoint semantic drift")
    payload, tensors = _state_payload(model_state)
    tensor_path = output / TENSOR_PATH.name
    _atomic_publish_bytes(tensor_path, payload)
    tensor_identity = _fingerprint(tensor_path)
    manifest = {
        "schema": MANIFEST_SCHEMA,
        "model_schema": student.SCHEMA,
        "feature_version": student.FEATURE_VERSION,
        "model_variant": student.MODEL_VARIANT,
        "parameters": student.PARAMETERS,
        "format": (
            "bytewise-utf8-name-order-contiguous-row-major-"
            "little-endian-float32-no-padding"
        ),
        "payload": tensor_identity,
        "tensors": tensors,
        "protocol": dict(protocol_identity),
        "teacher_hashes": dict(teacher_hashes),
    }
    manifest_path = output / MANIFEST_PATH.name
    _atomic_publish_bytes(manifest_path, _canonical_json(manifest))
    manifest_identity = _fingerprint(manifest_path)
    if _strict_json(manifest_path) != manifest:
        raise ValueError("student runtime manifest drift")
    if _strict_json(output / PARITY_RECEIPT_PATH.name) != parity_receipt:
        raise ValueError("student parity receipt changed during terminalization")
    result = {
        "schema": RESULT_SCHEMA,
        "status": RESULT_STATUS,
        "protocol": dict(protocol_identity),
        "teacher_hashes": dict(teacher_hashes),
        "distillation": distillation_receipt,
        "parity_fixture": parity_receipt,
        "training": {
            "seed": student.INITIALIZATION_SEED,
            "v9_pretrain_epochs": V9_PRETRAIN_EPOCHS,
            "mixed_epochs": MIXED_EPOCHS,
            "checkpoint_selection": "mixed epoch 12 final only",
            "curve": checkpoint["curve"],
            "last_checkpoint": _fingerprint(last_path),
            "final_checkpoint": _fingerprint(final_path),
        },
        "runtime_artifacts": {
            "tensor": tensor_identity,
            "manifest": manifest_identity,
        },
        "tune_opened": False,
        "sealed_opened": False,
        "runtime_admission_executed": False,
        "formal_games": 0,
        "external_games": 0,
        "live_weights_changed": False,
    }
    _atomic_publish_bytes(result_path, _canonical_json(result))
    return result


def _identities(
    protocol: Mapping[str, object],
    protocol_identity: Mapping[str, object],
    phase1: Mapping[str, object],
    finals: Mapping[int, Mapping[str, object]],
) -> tuple[dict[str, str], list[dict[str, object]], dict[str, object]]:
    bindings = protocol["teacher_checkpoint_bindings"]
    teacher_hashes = {
        "seed42": str(
            bindings["designated_distillation_teacher"]["checkpoint_sha256"]
        ),
        "seed314159": str(
            bindings["replication_teacher"]["checkpoint_sha256"]
        ),
    }
    forward = protocol["exact_forward_contract"]
    feature_sources = [
        {
            "path": row["path"],
            "bytes": row["bytes"],
            "sha256": row["sha256"],
        }
        for row in (
            list(forward["pinned_feature_sources"])
            + list(forward["pinned_feature_tests"])
        )
    ]
    fit_sources = phase1["fit_data_receipt"]
    teacher_identity = dict(finals[42]["checkpoint"])
    teacher_identity["seed"] = 42
    teacher_identity["protocol_sha256"] = protocol_identity["sha256"]
    return teacher_hashes, feature_sources, {
        "fit_sources": fit_sources,
        "teacher_identity": teacher_identity,
    }


def run(mode: str) -> dict[str, object]:
    if mode not in ("prepare", "train", "terminalize", "all"):
        raise ValueError("unknown student execution mode")
    protocol, protocol_identity = _verified_protocol()
    phase1, finals = _verified_phase1(protocol)
    _validate_pinned_sources(protocol)
    teacher_hashes, feature_sources, identities = _identities(
        protocol,
        protocol_identity,
        phase1,
        finals,
    )
    OUTPUT.mkdir(parents=True, exist_ok=True)
    move_universe_receipt: dict[str, object]
    distillation_receipt: dict[str, object]
    parity_receipt: dict[str, object]
    fit_inputs = _load_fit_groups_from_phase1(phase1)
    projected_fit = _project_fit_groups(fit_inputs.fit)
    if mode in ("prepare", "all"):
        if _downstream_artifacts_exist(OUTPUT):
            move_universe_receipt = (
                validate_existing_production_move_universe(
                    projected_fit,
                    protocol=protocol,
                    protocol_identity=protocol_identity,
                    protected_ids=fit_inputs.protected_ids,
                    original_tune_ids=fit_inputs.original_tune_ids,
                    output_path=OUTPUT / MOVE_UNIVERSE_PATH.name,
                    receipt_path=(
                        OUTPUT / MOVE_UNIVERSE_RECEIPT_PATH.name
                    ),
                )
            )
            store = DistillationShardStore(
                OUTPUT,
                protocol_identity=protocol_identity,
                teacher_identity=identities["teacher_identity"],
                fit_sources=identities["fit_sources"],
                feature_sources=feature_sources,
                move_universe_receipt=move_universe_receipt,
            )
            (
                distillation_receipt,
                parity_receipt,
            ) = _validate_existing_preparation(
                projected_fit,
                store,
                distillation_path=DISTILLATION_PATH,
                distillation_receipt_path=DISTILLATION_RECEIPT_PATH,
                parity_path=PARITY_PATH,
                parity_receipt_path=PARITY_RECEIPT_PATH,
            )
        else:
            if not torch.backends.mps.is_available():
                raise ValueError("student preparation requires available MPS")
            (
                move_universe_receipt,
                projected_fit,
            ) = verify_production_move_universe(
                projected_fit,
                protocol=protocol,
                protocol_identity=protocol_identity,
                protected_ids=fit_inputs.protected_ids,
                original_tune_ids=fit_inputs.original_tune_ids,
                output_path=OUTPUT / MOVE_UNIVERSE_PATH.name,
                receipt_path=OUTPUT / MOVE_UNIVERSE_RECEIPT_PATH.name,
            )
            store = DistillationShardStore(
                OUTPUT,
                protocol_identity=protocol_identity,
                teacher_identity=identities["teacher_identity"],
                fit_sources=identities["fit_sources"],
                feature_sources=feature_sources,
                move_universe_receipt=move_universe_receipt,
            )
            # Teacher checkpoint bytes cannot be opened until every fit parent
            # has matched the production JS and actual pinned-WASM sets.
            teacher_model = load_teacher(finals[42], device="mps")
            distillation_receipt = generate_distillation(
                projected_fit,
                teacher_model,
                store,
                device="mps",
                output_path=DISTILLATION_PATH,
                receipt_path=DISTILLATION_RECEIPT_PATH,
            )
            del teacher_model
            parity_receipt = publish_parity_fixture(
                DISTILLATION_PATH,
                distillation_receipt,
                output_path=PARITY_PATH,
                receipt_path=PARITY_RECEIPT_PATH,
            )
        if mode == "prepare":
            return {
                "production_move_universe": move_universe_receipt,
                "distillation": distillation_receipt,
                "parity_fixture": parity_receipt,
            }
    else:
        move_universe_receipt = validate_existing_production_move_universe(
            projected_fit,
            protocol=protocol,
            protocol_identity=protocol_identity,
            protected_ids=fit_inputs.protected_ids,
            original_tune_ids=fit_inputs.original_tune_ids,
            output_path=OUTPUT / MOVE_UNIVERSE_PATH.name,
            receipt_path=OUTPUT / MOVE_UNIVERSE_RECEIPT_PATH.name,
        )
        store = DistillationShardStore(
            OUTPUT,
            protocol_identity=protocol_identity,
            teacher_identity=identities["teacher_identity"],
            fit_sources=identities["fit_sources"],
            feature_sources=feature_sources,
            move_universe_receipt=move_universe_receipt,
        )
        distillation_receipt = store.validate_final(
            output_path=DISTILLATION_PATH,
            receipt_path=DISTILLATION_RECEIPT_PATH,
        )
        parity_receipt = _strict_json(PARITY_RECEIPT_PATH)
    if (
        distillation_receipt.get("production_move_universe")
        != move_universe_receipt
        or
        distillation_receipt.get("artifact")
        != _fingerprint(DISTILLATION_PATH)
        or parity_receipt.get("artifact") != _fingerprint(PARITY_PATH)
    ):
        raise ValueError("student pre-optimizer artifact drift")
    if mode in ("train", "all"):
        groups = load_distillation_groups(DISTILLATION_PATH)
        training = train_student(
            groups,
            output=OUTPUT,
            device="mps",
            protocol_identity=protocol_identity,
            distillation_identity=distillation_receipt["artifact"],
            teacher_hashes=teacher_hashes,
        )
        if mode == "train":
            return training
    return terminalize_only(
        output=OUTPUT,
        protocol_identity=protocol_identity,
        distillation_receipt=distillation_receipt,
        parity_receipt=parity_receipt,
        teacher_hashes=teacher_hashes,
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "mode",
        choices=("prepare", "train", "terminalize", "all"),
    )
    args = parser.parse_args()
    result = run(args.mode)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
