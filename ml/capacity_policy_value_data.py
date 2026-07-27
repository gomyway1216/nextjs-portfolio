#!/usr/bin/env python3
"""Data and batching contracts for the offline capacity diagnostic."""

from __future__ import annotations

import hashlib
from pathlib import Path
import random
import re
from typing import Iterable, Mapping, Sequence

import listwise_policy_value as lpv
import train


POSITION_ID = re.compile(r"^sha256:[0-9a-f]{64}$")
MOVE_BUCKETS = (16, 32, 64, 96, 128, 192, 272)


def read_protected_position_ids(
    path: str | Path,
) -> tuple[frozenset[str], dict[str, object]]:
    source = Path(path)
    raw = source.read_bytes()
    if not raw or not raw.endswith(b"\n") or b"\r" in raw:
        raise ValueError("protected position IDs are not canonical LF text")
    decoded = raw[:-1].decode("ascii").split("\n")
    if any(not POSITION_ID.fullmatch(value) for value in decoded):
        raise ValueError("protected position IDs contain an invalid identifier")
    if decoded != sorted(decoded) or len(decoded) != len(set(decoded)):
        raise ValueError("protected position IDs are not sorted and unique")
    identifiers = frozenset(decoded)
    identity_bytes = "\n".join(decoded).encode("ascii")
    return identifiers, {
        "path": str(source.resolve()),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "count": len(decoded),
        "identifiers_sha256": hashlib.sha256(identity_bytes).hexdigest(),
    }


def read_known_eval_position_ids(
    *,
    sibling_paths: Sequence[str | Path],
    scalar_paths: Sequence[str | Path],
) -> tuple[frozenset[str], dict[str, object]]:
    if not sibling_paths or not scalar_paths:
        raise ValueError("known-eval exposure inputs are incomplete")
    identifiers: set[str] = set()
    sources: list[dict[str, object]] = []
    specifications = [
        (Path(path), ("position_id", "child_position_id"))
        for path in sibling_paths
    ] + [(Path(path), ("position_id",)) for path in scalar_paths]
    for source, fields in specifications:
        digest = hashlib.sha256()
        byte_count = row_count = 0
        with source.open("rb") as handle:
            for line_number, raw in enumerate(handle, start=1):
                digest.update(raw)
                byte_count += len(raw)
                if raw == b"\n" or not raw.endswith(b"\n"):
                    raise ValueError(
                        f"{source}:{line_number}: non-canonical JSONL row"
                    )
                record = train.strict_json_loads(
                    raw[:-1], f"{source}:{line_number}"
                )
                if type(record) is not dict:
                    raise ValueError(
                        f"{source}:{line_number}: expected an object"
                    )
                for field in fields:
                    value = record.get(field)
                    if not isinstance(value, str) or not POSITION_ID.fullmatch(
                        value
                    ):
                        raise ValueError(
                            f"{source}:{line_number}: invalid {field}"
                        )
                    identifiers.add(value)
                row_count += 1
        sources.append(
            {
                "path": str(source.resolve()),
                "role": (
                    "known-eval-sibling"
                    if len(fields) == 2
                    else "known-eval-scalar"
                ),
                "bytes": byte_count,
                "sha256": digest.hexdigest(),
                "rows": row_count,
            }
        )
    ordered = sorted(identifiers)
    identity_bytes = "\n".join(ordered).encode("ascii")
    canonical_file = identity_bytes + b"\n"
    return frozenset(ordered), {
        "algorithm": (
            "strict-jsonl-semantic-position-union-bytewise-sort-unique-lf-v1"
        ),
        "sources": sources,
        "count": len(ordered),
        "bytes": len(canonical_file),
        "sha256": hashlib.sha256(canonical_file).hexdigest(),
        "identifiers_sha256": hashlib.sha256(identity_bytes).hexdigest(),
    }


def combined_semantics(
    groups: Iterable[lpv.ParentGroup],
    protected_sets: Iterable[set[str] | frozenset[str]],
) -> set[str]:
    result = lpv.semantic_union(groups)
    for protected in protected_sets:
        result.update(protected)
    return result


def partition_sources(
    *,
    browser: Sequence[lpv.ParentGroup],
    v9: Sequence[lpv.ParentGroup],
    spent_groups: Sequence[lpv.ParentGroup],
    protected_sets: Sequence[set[str] | frozenset[str]],
) -> tuple[list[lpv.ParentGroup], list[lpv.ParentGroup], dict[str, object]]:
    """Protect external semantics, then give retained Browser parents priority."""

    protected = combined_semantics(spent_groups, protected_sets)
    browser_kept, browser_dropped = lpv.filter_semantic_conflicts(
        browser, protected
    )
    v9_kept, v9_dropped = lpv.filter_semantic_conflicts(
        v9,
        protected | lpv.semantic_union(browser_kept),
    )
    overlap = lpv.semantic_union(browser_kept) & lpv.semantic_union(v9_kept)
    if overlap:
        raise ValueError("capacity training domains retain semantic overlap")
    return browser_kept, v9_kept, {
        "browser_input_parents": len(browser),
        "browser_kept_parents": len(browser_kept),
        "browser_dropped_parents": len(browser_dropped),
        "browser_dropped_parent_ids_sha256": hashlib.sha256(
            "\n".join(sorted(browser_dropped)).encode("ascii")
        ).hexdigest(),
        "v9_input_parents": len(v9),
        "v9_kept_parents": len(v9_kept),
        "v9_dropped_parents": len(v9_dropped),
        "v9_dropped_parent_ids_sha256": hashlib.sha256(
            "\n".join(sorted(v9_dropped)).encode("ascii")
        ).hexdigest(),
        "cross_domain_semantic_overlap": 0,
    }


def move_bucket(group: lpv.ParentGroup) -> int:
    count = len(group.examples)
    for boundary in MOVE_BUCKETS:
        if count <= boundary:
            return boundary
    raise ValueError(f"parent has {count} moves above the registered maximum")


def bucketed_batches(
    groups: Sequence[lpv.ParentGroup],
    *,
    epoch: int,
    seed: int,
    maximum_parents: int,
) -> list[tuple[int, list[lpv.ParentGroup]]]:
    if not groups or epoch < 0 or seed < 0 or maximum_parents <= 0:
        raise ValueError("invalid capacity bucketed-batch controls")
    buckets: dict[int, list[lpv.ParentGroup]] = {}
    for group in groups:
        buckets.setdefault(move_bucket(group), []).append(group)
    batches: list[tuple[int, list[lpv.ParentGroup]]] = []
    for boundary in sorted(buckets):
        selected = sorted(
            buckets[boundary], key=lambda group: group.parent_id
        )
        random.Random(seed + epoch * 10_000 + boundary).shuffle(selected)
        batches.extend(
            (boundary, selected[start : start + maximum_parents])
            for start in range(0, len(selected), maximum_parents)
        )
    random.Random(seed + epoch * 1_000_003).shuffle(batches)
    return batches


def lowest_parent_subset(
    groups: Sequence[lpv.ParentGroup],
    count: int,
) -> tuple[list[lpv.ParentGroup], dict[str, object]]:
    if count <= 0 or len(groups) < count:
        raise ValueError("capacity sentinel subset is unavailable")
    selected = sorted(groups, key=lambda group: group.parent_id)[:count]
    parent_ids = "\n".join(group.parent_id for group in selected).encode("ascii")
    return selected, {
        "parents": count,
        "selection": "lexicographically-lowest-parent-id",
        "parent_ids_sha256": hashlib.sha256(parent_ids).hexdigest(),
    }


def require_exact_receipt(
    observed: Mapping[str, object],
    expected: Mapping[str, object],
    label: str,
) -> None:
    if observed != expected:
        raise ValueError(f"{label} receipt drift")
