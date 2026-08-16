#!/usr/bin/env python3
"""Create-only zero payload for the HalfKP64+RKI16 runtime preflight."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path


TOTAL_BYTES = 23_665_376
ZERO_PAYLOAD_SHA256 = "e96b53d4538f423f6f6dc95f5b24e8743f7479714a092b86e2d0e3e8fcf33c9f"
ZERO_CHUNK = bytes(1024 * 1024)


def build_zero_payload(output: Path) -> dict[str, object]:
    output = output.resolve()
    if output.exists():
        raise FileExistsError(f"refusing to overwrite {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.{os.getpid()}.tmp")
    try:
        digest = hashlib.sha256()
        with temporary.open("xb") as handle:
            remaining = TOTAL_BYTES
            while remaining:
                chunk = ZERO_CHUNK[: min(remaining, len(ZERO_CHUNK))]
                handle.write(chunk)
                digest.update(chunk)
                remaining -= len(chunk)
            handle.flush()
            os.fsync(handle.fileno())
        if digest.hexdigest() != ZERO_PAYLOAD_SHA256:
            raise RuntimeError("zero payload SHA contract mismatch")
        os.link(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)
    return {
        "path": str(output),
        "bytes": output.stat().st_size,
        "sha256": ZERO_PAYLOAD_SHA256,
        "deployment_eligible": False,
        "purpose": "halfkp64-rki16-runtime-preflight-zero-output-only",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not args.out.is_absolute():
        parser.error("--out must be absolute")
    print(json.dumps(build_zero_payload(args.out), sort_keys=True))


if __name__ == "__main__":
    main()
