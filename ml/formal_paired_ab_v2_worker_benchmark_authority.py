"""External code-pinned trust roots for the formal A/B worker benchmark.

This deliberately contains only reviewed registry identities.  It must stay
outside the benchmark registry's implementation inventory so that the central
orchestrator and its argumentless production runner can both be content-pinned
without creating a registry -> source -> registry hash cycle.
"""

from __future__ import annotations

from typing import Any


PINNED_BENCHMARK_REGISTRY_IDENTITY = {
    "path": (
        "ml/protocols/"
        "floodgate-q1-2026-formal-paired-ab-v2-worker-benchmark-registry.json"
    ),
    "bytes": 2_421,
    "sha256": "585efc2105219f97aed9391a3d57a330c0b42c90719e6568a4bc357a73e62984",
    "schema": "shogi-formal-paired-ab-v2-worker-benchmark-registry-v1",
}

# Formal execution remains closed until a real benchmark receipt and the
# separate formal READY registry have both been reviewed and code-pinned.
PINNED_FORMAL_READY_REGISTRY_IDENTITY: dict[str, Any] | None = None
