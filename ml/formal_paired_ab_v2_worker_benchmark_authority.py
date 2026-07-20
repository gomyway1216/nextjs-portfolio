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
    "bytes": 2_383,
    "sha256": "15b47424a14f7464a45950adc6537ea62ab7f91fcb997b2c9e4e146392785fc6",
    "schema": "shogi-formal-paired-ab-v2-worker-benchmark-registry-v1",
}

# Formal execution remains closed until a real benchmark receipt and the
# separate formal READY registry have both been reviewed and code-pinned.
PINNED_FORMAL_READY_REGISTRY_IDENTITY: dict[str, Any] | None = None
