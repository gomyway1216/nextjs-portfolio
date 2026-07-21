#!/usr/bin/env python3
"""Rebuild the public constrained-alignment v2 completion registry.

The argumentless command reads the fixed three private run directories,
fingerprints every result/checkpoint, strict-loads both parent and aligned
checkpoints, independently quantizes both models, and emits one deterministic
review candidate to stdout.  It never edits either the run artifacts or the
checked-in registry.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
import copy
import hashlib
import os
from pathlib import Path
import stat
import sys
from typing import Any

import run_strength_first_three_seed_constrained_alignment_v2 as RUNNER
import strength_first_qat_constrained_alignment_v2_protocol as ALIGNMENT
import strength_first_qat_constrained_alignment_v2_result_registry as REGISTRY


class AlignmentResultRegistryCandidateError(ValueError):
    """The fixed real outputs cannot produce the pinned public registry."""


def _stat_identity(value: os.stat_result) -> tuple[int, ...]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_mode,
        value.st_uid,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
        value.st_nlink,
    )


def _read_regular(path: Path, label: str) -> bytes:
    absolute = path.absolute()
    descriptor = -1
    try:
        before = os.lstat(absolute)
        if (
            os.path.realpath(absolute) != str(absolute)
            or not stat.S_ISREG(before.st_mode)
            or before.st_nlink != 1
        ):
            raise AlignmentResultRegistryCandidateError(
                f"{label} is not a canonical single-link regular file"
            )
        descriptor = os.open(
            absolute,
            os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0),
        )
        opened_before = os.fstat(descriptor)
        if _stat_identity(before) != _stat_identity(opened_before):
            raise AlignmentResultRegistryCandidateError(
                f"{label} changed before it could be read"
            )
        chunks = []
        while block := os.read(descriptor, 1024 * 1024):
            chunks.append(block)
        raw = b"".join(chunks)
        opened_after = os.fstat(descriptor)
        after = os.lstat(absolute)
    except OSError as error:
        raise AlignmentResultRegistryCandidateError(
            f"{label} cannot be read"
        ) from error
    finally:
        if descriptor >= 0:
            os.close(descriptor)
    if (
        not raw
        or before.st_size != len(raw)
        or len(
            {
                _stat_identity(value)
                for value in (before, opened_before, opened_after, after)
            }
        )
        != 1
    ):
        raise AlignmentResultRegistryCandidateError(f"{label} changed while being read")
    return raw


def _identity(path: str, schema: str, raw: bytes) -> dict[str, Any]:
    return {
        "path": path,
        "schema": schema,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _independent_quantized_equality(
    parent_path: Path, candidate_path: Path, *, seed: int
) -> dict[str, Any]:
    """Strict-load and independently compare all seven deployed tensors."""

    try:
        import torch

        import train as TRAIN
        from int16_forward import quantize_model
        from strength_first_quantized_cell_alignment import (
            QUANTIZED_TENSOR_NAMES,
            anchor_identity,
            capture_quantized_anchor,
        )

        def load_model(path: Path, expected_schema: str, expected_epoch: int):
            checkpoint = torch.load(path, map_location="cpu", weights_only=True)
            if (
                type(checkpoint) is not dict
                or checkpoint.get("schema") != expected_schema
                or checkpoint.get("epoch") != expected_epoch
                or not isinstance(checkpoint.get("model"), Mapping)
            ):
                raise ValueError("checkpoint metadata is invalid")
            model = TRAIN.DistillNet("board")
            model.load_state_dict(checkpoint["model"], strict=True)
            return model

        parent_model = load_model(
            parent_path,
            "shogi-floodgate-strength-first-qat-final-checkpoint-v2",
            20,
        )
        candidate_model = load_model(
            candidate_path,
            ALIGNMENT.ALIGNMENT_CHECKPOINT_SCHEMA,
            24,
        )
        parent_q = quantize_model(parent_model)
        candidate_q = quantize_model(candidate_model)
        equal = {
            name: bool(torch.equal(parent_q[name], candidate_q[name]))
            for name in QUANTIZED_TENSOR_NAMES
        }
        parent_anchor = anchor_identity(capture_quantized_anchor(parent_model))
        candidate_anchor = anchor_identity(capture_quantized_anchor(candidate_model))
    except Exception as error:
        raise AlignmentResultRegistryCandidateError(
            f"alignment seed {seed} checkpoints failed independent strict reload"
        ) from error
    if (
        tuple(QUANTIZED_TENSOR_NAMES) != REGISTRY.QUANTIZED_TENSOR_NAMES
        or not all(equal.values())
        or parent_anchor != candidate_anchor
    ):
        raise AlignmentResultRegistryCandidateError(
            f"alignment seed {seed} changed a deployed integer tensor"
        )
    return {
        "method": "independent-strict-load-quantize-model-torch-equal",
        "tensor_names": list(QUANTIZED_TENSOR_NAMES),
        "tensors_equal": equal,
        "equal_tensor_count": len(equal),
        "all_equal": True,
        "parent": parent_anchor,
        "candidate": candidate_anchor,
    }


def build_alignment_result_registry_candidate(
    *,
    repo_root: str | Path | None = None,
    result_validator: Callable[..., Mapping[str, Any]] = RUNNER._validate_result,
    quantized_verifier: Callable[..., Mapping[str, Any]] = (
        _independent_quantized_equality
    ),
    require_pinned_match: bool = True,
) -> dict[str, Any]:
    """Recompute the exact registry from the fixed three completed runs."""

    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    plan_path = root / ALIGNMENT.ALIGNMENT_PLAN_RELATIVE_PATH
    plan_raw = _read_regular(plan_path, "alignment plan")
    plan = ALIGNMENT.validate_alignment_plan(
        ALIGNMENT.strict_json(plan_raw, "alignment plan")
    )
    plan_identity = _identity(
        ALIGNMENT.ALIGNMENT_PLAN_RELATIVE_PATH,
        ALIGNMENT.ALIGNMENT_PLAN_SCHEMA,
        plan_raw,
    )
    runs = []
    for slot in ALIGNMENT.expected_slots():
        seed = slot["seed"]
        output = root / slot["output"]
        result_path = output / "result.json"
        checkpoint_path = output / "final.pt"
        result_raw = _read_regular(result_path, f"alignment seed {seed} result")
        checkpoint_raw = _read_regular(
            checkpoint_path, f"alignment seed {seed} checkpoint"
        )
        result = dict(result_validator(repo_root=root, slot=slot))
        if (
            result != ALIGNMENT.strict_json(result_raw, f"alignment seed {seed} result")
            or result.get("training_pipeline")
            != {
                "source_revision": REGISTRY.RUN_SOURCE_REVISION,
                "tracked_tree_clean": True,
            }
            or result.get("contract", {}).get("alignment_plan_sha256")
            != plan_identity["sha256"]
            or result.get("contract", {}).get("alignment_plan_bytes")
            != plan_identity["bytes"]
        ):
            raise AlignmentResultRegistryCandidateError(
                f"alignment seed {seed} result provenance drifted"
            )
        candidate = result["candidate_artifact"]
        if (
            candidate["bytes"] != len(checkpoint_raw)
            or candidate["sha256"] != hashlib.sha256(checkpoint_raw).hexdigest()
        ):
            raise AlignmentResultRegistryCandidateError(
                f"alignment seed {seed} candidate identity drifted"
            )
        expected_parent = next(
            parent for parent in plan["parents"] if parent["seed"] == seed
        )
        if result.get("parent") != expected_parent:
            raise AlignmentResultRegistryCandidateError(
                f"alignment seed {seed} parent differs from registered alignment plan"
            )
        parent = copy.deepcopy(expected_parent)
        parent_result = parent["result"]
        parent_checkpoint = parent["checkpoint"]
        parent_result_raw = _read_regular(
            root / parent_result["path"], f"alignment seed {seed} parent result"
        )
        parent_checkpoint_raw = _read_regular(
            root / parent_checkpoint["path"],
            f"alignment seed {seed} parent checkpoint",
        )
        if (
            len(parent_result_raw) != parent_result["bytes"]
            or hashlib.sha256(parent_result_raw).hexdigest() != parent_result["sha256"]
            or len(parent_checkpoint_raw) != parent_checkpoint["bytes"]
            or hashlib.sha256(parent_checkpoint_raw).hexdigest()
            != parent_checkpoint["sha256"]
        ):
            raise AlignmentResultRegistryCandidateError(
                f"alignment seed {seed} parent identity drifted"
            )
        equality = dict(
            quantized_verifier(
                root / parent_checkpoint["path"], checkpoint_path, seed=seed
            )
        )
        if equality.get("candidate") != result["quantized_invariant"]:
            raise AlignmentResultRegistryCandidateError(
                f"alignment seed {seed} recorded invariant differs from reload"
            )
        runs.append(
            {
                "seed": seed,
                "source_revision": REGISTRY.RUN_SOURCE_REVISION,
                "result": _identity(
                    f"{slot['output']}/result.json",
                    ALIGNMENT.ALIGNMENT_RESULT_SCHEMA,
                    result_raw,
                ),
                "checkpoint": _identity(
                    f"{slot['output']}/final.pt",
                    ALIGNMENT.ALIGNMENT_CHECKPOINT_SCHEMA,
                    checkpoint_raw,
                ),
                "parent": copy.deepcopy(parent),
                "integer_target_cache": copy.deepcopy(result["integer_target_cache"]),
                "training_history": copy.deepcopy(result["training_history"]),
                "quantized_equality": equality,
            }
        )
    candidate = REGISTRY.validate_result_registry(
        {
            "schema": REGISTRY.RESULT_REGISTRY_SCHEMA,
            "status": REGISTRY.RESULT_REGISTRY_STATUS,
            "recorded_date": "2026-07-20",
            "builder_command": REGISTRY.RESULT_REGISTRY_BUILDER_COMMAND,
            "plan": plan_identity,
            "run_observation": copy.deepcopy(REGISTRY.RUN_OBSERVATION),
            "runs": runs,
            "boundary": copy.deepcopy(REGISTRY.RESULT_BOUNDARY),
            "claims": copy.deepcopy(REGISTRY.RESULT_CLAIMS),
            "next_step": (
                "spent-selection-representation-check-then-untouched-fresh-final-"
                "and-formal-ab"
            ),
        }
    )
    registry_path = root / REGISTRY.RESULT_REGISTRY_RELATIVE_PATH
    if require_pinned_match and registry_path.exists():
        pinned = REGISTRY.validate_result_registry(
            ALIGNMENT.strict_json(
                _read_regular(registry_path, "pinned alignment result registry"),
                "pinned alignment result registry",
            )
        )
        if pinned != candidate:
            raise AlignmentResultRegistryCandidateError(
                "pinned alignment result registry differs from exact recomputation"
            )
    return candidate


def serialize_alignment_result_registry_candidate(
    value: Mapping[str, Any],
) -> bytes:
    return ALIGNMENT.canonical_json_bytes(REGISTRY.validate_result_registry(value))


def main(argv: Sequence[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        print(
            "[alignment-result-registry] STOP: arguments are forbidden", file=sys.stderr
        )
        return 2
    try:
        raw = serialize_alignment_result_registry_candidate(
            build_alignment_result_registry_candidate()
        )
        written = sys.stdout.buffer.write(raw)
        if written != len(raw):
            raise OSError("alignment result registry stdout write was incomplete")
        sys.stdout.buffer.flush()
    except (OSError, RuntimeError, ValueError) as error:
        print(f"[alignment-result-registry] STOP: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "AlignmentResultRegistryCandidateError",
    "build_alignment_result_registry_candidate",
    "serialize_alignment_result_registry_candidate",
]
