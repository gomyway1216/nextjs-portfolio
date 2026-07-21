#!/usr/bin/env python3
"""Build the canonical review input for one three-stage fixed-time NNUE gate."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from nnue_fixed_time_gate import build_manifest_template


def _identity(repo_root: Path, path_value: Path, buckets: int | None = None) -> dict:
    path = path_value.expanduser().resolve()
    payload = path.read_bytes()
    try:
        recorded_path = path.relative_to(repo_root).as_posix()
    except ValueError:
        recorded_path = str(path)
    value = {
        "path": recorded_path,
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }
    if buckets is not None:
        value["buckets"] = buckets
    return value


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("stable", type=Path)
    parser.add_argument("research_wasm", type=Path)
    parser.add_argument("--candidate-buckets", type=int, required=True)
    parser.add_argument("--stable-buckets", type=int, required=True)
    parser.add_argument("--ms", type=int, default=500)
    parser.add_argument("--screen-seed-start", type=int, required=True)
    parser.add_argument("--independent-seed-start", type=int, required=True)
    parser.add_argument("--formal-seed-start", type=int, required=True)
    parser.add_argument("--screen-workers", type=int, default=7)
    parser.add_argument("--independent-workers", type=int, default=8)
    parser.add_argument("--formal-workers", type=int, default=12)
    parser.add_argument(
        "--output",
        type=Path,
        help="Write the immutable manifest to this path instead of stdout.",
    )
    return parser


def main() -> int:
    arguments = _parser().parse_args()
    repo_root = Path(__file__).resolve().parents[1]
    assets = {
        "candidate_weights": _identity(
            repo_root, arguments.candidate, arguments.candidate_buckets
        ),
        "stable_weights": _identity(
            repo_root, arguments.stable, arguments.stable_buckets
        ),
        "research_wasm": _identity(repo_root, arguments.research_wasm),
        "match_harness": _identity(
            repo_root, repo_root / "wasm-spike/match-nnue-vs-v3.ts"
        ),
    }
    identity_preimage = {
        "assets": assets,
        "milliseconds_per_move": arguments.ms,
        "seed_starts": [
            arguments.screen_seed_start,
            arguments.independent_seed_start,
            arguments.formal_seed_start,
        ],
    }
    experiment_id = "sha256:" + hashlib.sha256(
        (
            "shogi-nnue-fixed-time-experiment-v1\0"
            + json.dumps(identity_preimage, sort_keys=True, separators=(",", ":"))
        ).encode()
    ).hexdigest()
    manifest = build_manifest_template(
        experiment_id=experiment_id,
        assets=assets,
        milliseconds_per_move=arguments.ms,
        seed_starts={
            "screen56": arguments.screen_seed_start,
            "independent96": arguments.independent_seed_start,
            "formal768": arguments.formal_seed_start,
        },
        pair_workers={
            "screen56": arguments.screen_workers,
            "independent96": arguments.independent_workers,
            "formal768": arguments.formal_workers,
        },
    )
    encoded = json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    if arguments.output is None:
        print(encoded, end="")
    else:
        output = arguments.output.expanduser().resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(encoded, encoding="utf-8")
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
