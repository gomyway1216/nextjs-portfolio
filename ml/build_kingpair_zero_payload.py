"""Build the candidate-only all-zero KingPair runtime payload.

The payload is intentionally not a model candidate.  It exists only to make
the two runtime arms return the same constant evaluation while measuring the
cost of the KingPair architecture.  The command refuses to overwrite files.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

from kingpair_runtime_int_reference import LAYOUT


ZERO_CHUNK = bytes(1024 * 1024)


def zero_payload_sha256(size: int = LAYOUT.total_bytes) -> str:
    digest = hashlib.sha256()
    remaining = size
    while remaining:
        chunk = ZERO_CHUNK[: min(remaining, len(ZERO_CHUNK))]
        digest.update(chunk)
        remaining -= len(chunk)
    return digest.hexdigest()


ZERO_PAYLOAD_SHA256 = zero_payload_sha256()


def build_zero_payload(output: Path) -> dict[str, int | str]:
    output = output.resolve()
    if not output.is_absolute():
        raise ValueError("output must be absolute")
    if output.exists():
        raise FileExistsError(f"refusing to overwrite {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(f".{output.name}.{os.getpid()}.tmp")
    try:
        with temporary.open("xb") as handle:
            remaining = LAYOUT.total_bytes
            while remaining:
                chunk = ZERO_CHUNK[: min(remaining, len(ZERO_CHUNK))]
                handle.write(chunk)
                remaining -= len(chunk)
            handle.flush()
            os.fsync(handle.fileno())
        # Atomic create-only publication.  ``os.replace`` would overwrite a
        # file created after the preflight check; a hard link fails closed
        # with FileExistsError instead.
        os.link(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)
    actual = hashlib.sha256(output.read_bytes()).hexdigest()
    if actual != ZERO_PAYLOAD_SHA256:
        output.unlink(missing_ok=True)
        raise RuntimeError(
            f"zero payload identity mismatch: expected {ZERO_PAYLOAD_SHA256}, got {actual}"
        )
    return {
        "path": str(output),
        "bytes": output.stat().st_size,
        "sha256": actual,
        "deployment_eligible": False,
        "purpose": "runtime-skeleton-zero-output-only",
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
