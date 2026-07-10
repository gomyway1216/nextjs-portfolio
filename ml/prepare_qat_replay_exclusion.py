#!/usr/bin/env python3
"""Build the label-free replay exclusion set for the sealed int16-aware runs.

The preparation step may inspect the already-consumed model-selection split, but
the training process receives only this sorted set of semantic position IDs.  No
final-holdout JSONL is accepted: holdout coverage comes exclusively from the
pre-published protected-ID file.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
from typing import Iterable


POSITION_ID_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
IDENTIFIER_FORMAT = "sorted-unique-sha256-position-id-utf8-lf-v1"


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def identifier_set_sha256(identifiers: Iterable[str]) -> str:
    return hashlib.sha256("\n".join(sorted(identifiers)).encode("utf-8")).hexdigest()


def _reject_constant(value: str):
    raise ValueError(f"non-finite JSON number {value!r} is forbidden")


def _object_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def read_canonical_ids(path: str, label: str) -> tuple[set[str], dict[str, object]]:
    with open(path, "rb") as source:
        raw = source.read()
    if raw and not raw.endswith(b"\n"):
        raise ValueError(f"{label} must end with LF")
    try:
        text = raw.decode("ascii")
    except UnicodeDecodeError as error:
        raise ValueError(f"{label} must be ASCII") from error
    rows = text.splitlines()
    if rows != sorted(set(rows)):
        raise ValueError(f"{label} must be sorted and unique")
    if any(POSITION_ID_RE.fullmatch(row) is None for row in rows):
        raise ValueError(f"{label} contains an invalid position ID")
    identifiers = set(rows)
    return identifiers, {
        "path": os.path.abspath(path),
        "bytes": len(raw),
        "sha256": sha256_bytes(raw),
        "count": len(identifiers),
        "identifiers_sha256": identifier_set_sha256(identifiers),
    }


def read_selection_ids(path: str) -> tuple[set[str], dict[str, object]]:
    with open(path, "rb") as source:
        raw = source.read()
    identifiers: set[str] = set()
    records = 0
    for line_number, line in enumerate(raw.splitlines(), 1):
        if not line.strip():
            raise ValueError(f"selection line {line_number} is empty")
        try:
            row = json.loads(
                line,
                object_pairs_hook=_object_pairs,
                parse_constant=_reject_constant,
            )
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            raise ValueError(f"invalid selection JSON at line {line_number}: {error}") from error
        if type(row) is not dict or row.get("schema") != "shogi-sibling-v1":
            raise ValueError(f"selection line {line_number} has the wrong schema")
        for field in ("position_id", "child_position_id"):
            identifier = row.get(field)
            if not isinstance(identifier, str) or POSITION_ID_RE.fullmatch(identifier) is None:
                raise ValueError(
                    f"selection line {line_number} has an invalid {field}"
                )
            identifiers.add(identifier)
        records += 1
    if records == 0:
        raise ValueError("selection data is empty")
    return identifiers, {
        "path": os.path.abspath(path),
        "bytes": len(raw),
        "sha256": sha256_bytes(raw),
        "records": records,
        "semantic_position_ids_count": len(identifiers),
        "semantic_position_ids_sha256": identifier_set_sha256(identifiers),
    }


def build_replay_exclusion(
    selection_path: str,
    policy_path: str,
    protected_path: str,
) -> tuple[bytes, dict[str, object]]:
    selection_ids, selection = read_selection_ids(selection_path)
    policy_ids, policy = read_canonical_ids(policy_path, "policy-exposed IDs")
    protected_ids, protected = read_canonical_ids(protected_path, "holdout protected IDs")
    components = {
        "policy_exposed": policy_ids,
        "model_selection": selection_ids,
        "final_holdout_protected": protected_ids,
    }
    labels = tuple(components)
    for left_index, left in enumerate(labels):
        for right in labels[left_index + 1 :]:
            overlap = components[left] & components[right]
            if overlap:
                raise ValueError(
                    f"semantic overlap between {left} and {right}: {min(overlap)}"
                )
    identifiers = set().union(*components.values())
    raw = ("\n".join(sorted(identifiers)) + "\n").encode("ascii")
    receipt = {
        "schema": "shogi-int16-aware-replay-exclusion-preparation-v1",
        "selection": selection,
        "policy_exposed_ids": policy,
        "final_holdout_protected_ids": protected,
        "output": {
            "format": IDENTIFIER_FORMAT,
            "bytes": len(raw),
            "sha256": sha256_bytes(raw),
            "count": len(identifiers),
            "identifiers_sha256": identifier_set_sha256(identifiers),
        },
    }
    return raw, receipt


def atomic_write(path: str, raw: bytes) -> None:
    target = os.path.abspath(path)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(
        prefix=f".{os.path.basename(target)}.", dir=os.path.dirname(target)
    )
    try:
        with os.fdopen(descriptor, "wb") as destination:
            destination.write(raw)
            destination.flush()
            os.fsync(destination.fileno())
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--selection-data", required=True)
    parser.add_argument("--policy-exposed-ids", required=True)
    parser.add_argument("--holdout-protected-ids", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    raw, receipt = build_replay_exclusion(
        args.selection_data,
        args.policy_exposed_ids,
        args.holdout_protected_ids,
    )
    atomic_write(args.out, raw)
    receipt["output"]["path"] = os.path.abspath(args.out)
    print(json.dumps(receipt, ensure_ascii=False, sort_keys=True, allow_nan=False))


if __name__ == "__main__":
    main()
