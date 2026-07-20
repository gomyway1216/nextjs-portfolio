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
    "bytes": 1_924,
    "sha256": "b899a83a96b0acda21d7f284e0843a08d749476c68bf2dcc6e3ae8928abf0d01",
    "schema": "shogi-formal-paired-ab-v2-worker-benchmark-registry-v1",
}

# Formal execution remains closed until a real benchmark receipt and the
# separate formal READY registry have both been reviewed and code-pinned.
PINNED_FORMAL_READY_REGISTRY_IDENTITY: dict[str, Any] | None = None
