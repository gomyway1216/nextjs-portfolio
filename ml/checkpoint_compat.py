#!/usr/bin/env python3
"""Torch-independent checkpoint architecture validation helpers.

`train.py` loads the actual `.pt` file with PyTorch, but the compatibility
contract itself is plain dictionaries so it can be pinned in the default CI
without installing Torch.
"""

from __future__ import annotations

import hashlib
import math
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
    actual_fields = set(actual)
    expected_fields = set(ARCH_FIELDS)
    if actual_fields != expected_fields:
        missing = sorted(expected_fields - actual_fields)
        extra = sorted(actual_fields - expected_fields)
        if missing:
            problems.append(f"fields: missing {missing!r}")
        if extra:
            problems.append(f"fields: unexpected {extra!r}")
    for field in ARCH_FIELDS:
        if field not in actual:
            continue
        wanted = expected.get(field)
        found = actual[field]
        if field in {"schema", "input", "h1", "h2", "kp_buckets"}:
            equal = type(found) is int and type(wanted) is int and found == wanted
            if type(found) is not int:
                problems.append(f"{field}: expected exact integer, actual {found!r}")
                continue
        elif field == "features":
            equal = type(found) is str and type(wanted) is str and found == wanted
            if type(found) is not str:
                problems.append(f"{field}: expected exact string, actual {found!r}")
                continue
        elif field == "k":
            found_numeric = type(found) is float
            wanted_numeric = type(wanted) is float
            equal = (
                found_numeric
                and wanted_numeric
                and math.isfinite(found)
                and math.isfinite(wanted)
                and float(found) == float(wanted)
            )
            if not found_numeric or not math.isfinite(found):
                problems.append(f"{field}: expected exact finite float, actual {found!r}")
                continue
        else:
            equal = found == wanted
        if not equal:
            problems.append(f"{field}: expected {wanted!r}, actual {found!r}")

    if problems:
        raise CheckpointCompatibilityError(
            "incompatible warm-start checkpoint (" + "; ".join(problems) + ")"
        )
