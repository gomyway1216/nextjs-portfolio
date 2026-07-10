#!/usr/bin/env python3
"""Torch-independent checkpoint architecture validation helpers.

`train.py` loads the actual `.pt` file with PyTorch, but the compatibility
contract itself is plain dictionaries so it can be pinned in the default CI
without installing Torch.
"""

from __future__ import annotations

import hashlib
from typing import Any, Mapping


ARCH_FIELDS = ("schema", "features", "input", "h1", "h2", "k", "kp_buckets")


class CheckpointCompatibilityError(ValueError):
    """Raised before training when a warm-start checkpoint is incompatible."""


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def expected_arch(
    *,
    features: str,
    input_dim: int,
    h1: int,
    h2: int,
    k: float,
    kp_buckets: int,
) -> dict[str, Any]:
    return {
        "schema": 1,
        "features": features,
        "input": input_dim,
        "h1": h1,
        "h2": h2,
        "k": float(k),
        "kp_buckets": kp_buckets,
    }


def validate_arch(actual: Mapping[str, Any] | None, expected: Mapping[str, Any]) -> None:
    if not isinstance(actual, Mapping):
        raise CheckpointCompatibilityError("checkpoint arch metadata is missing")

    problems: list[str] = []
    for field in ARCH_FIELDS:
        if field not in actual:
            problems.append(f"{field}: expected {expected.get(field)!r}, actual <missing>")
            continue
        wanted = expected.get(field)
        found = actual[field]
        if field == "k":
            try:
                equal = float(found) == float(wanted)
            except (TypeError, ValueError):
                equal = False
        else:
            equal = found == wanted
        if not equal:
            problems.append(f"{field}: expected {wanted!r}, actual {found!r}")

    if problems:
        raise CheckpointCompatibilityError(
            "incompatible warm-start checkpoint (" + "; ".join(problems) + ")"
        )
