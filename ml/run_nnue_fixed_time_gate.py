#!/usr/bin/env python3
"""Run or resume one preregistered fixed-time NNUE gate."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from nnue_fixed_time_gate import (
    NnueFixedTimeGateError,
    load_and_capture_manifest,
    run_gate,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run screen56, independent96, or formal768 from one fixed manifest."
    )
    parser.add_argument("manifest", type=Path)
    parser.add_argument("gate", choices=("screen56", "independent96", "formal768"))
    parser.add_argument("output_root", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    repo_root = Path(__file__).resolve().parents[1]
    try:
        manifest, _raw, manifest_sha256 = load_and_capture_manifest(
            repo_root, arguments.manifest
        )
        report = run_gate(
            repo_root,
            manifest,
            manifest_sha256,
            arguments.gate,
            arguments.output_root,
        )
        _post_manifest, _post_raw, post_sha256 = load_and_capture_manifest(
            repo_root, arguments.manifest
        )
        if post_sha256 != manifest_sha256:
            raise NnueFixedTimeGateError("manifest identity changed during the gate")
    except NnueFixedTimeGateError:
        print(
            json.dumps(
                {
                    "schema": "shogi-nnue-fixed-time-gate-cli-stop-v1",
                    "status": "STOP",
                    "reason": "fixed-time-gate-failed-closed",
                    "live_weight_write_authorized": False,
                },
                sort_keys=True,
                separators=(",", ":"),
            ),
            file=sys.stderr,
        )
        return 2
    print(json.dumps(report, sort_keys=True, separators=(",", ":")))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
