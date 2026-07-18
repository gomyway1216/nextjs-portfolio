#!/usr/bin/env python3

import json
from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SYMBOL_GRAPH_NAME = (
    "FloodgateV7ExternalTrustRootProtocol.symbols.json"
)


def fail(message: str) -> None:
    raise SystemExit(f"public API symbol-graph check failed: {message}")


symbol_graphs = list(
    (PACKAGE_ROOT / ".build").glob(
        f"**/symbolgraph/{SYMBOL_GRAPH_NAME}"
    )
)
if len(symbol_graphs) != 1:
    fail(
        "expected exactly one protocol symbol graph, "
        f"found {len(symbol_graphs)}"
    )

with symbol_graphs[0].open(encoding="utf-8") as handle:
    graph = json.load(handle)

symbols = graph.get("symbols")
if not isinstance(symbols, list):
    fail("missing symbols array")

public_functions: list[tuple[str, str, str]] = []
for symbol in symbols:
    path_components = symbol.get("pathComponents")
    fragments = symbol.get("declarationFragments")
    if (
        not isinstance(path_components, list)
        or len(path_components) < 2
        or not isinstance(fragments, list)
    ):
        continue
    declaration = "".join(
        fragment.get("spelling", "")
        for fragment in fragments
        if isinstance(fragment, dict)
    )
    public_functions.append(
        (path_components[0], path_components[1], declaration)
    )

required_full_entrypoints = (
    ("TrustRootSupervisorSessionV1", "issueChallenge("),
    ("TrustRootVerifierCoreV1", "issueReceipt("),
    ("TrustRootSupervisorSessionV1", "issueAttestation("),
    ("OneShotAttestationConsumerV1", "consume("),
)
for owner, method_prefix in required_full_entrypoints:
    matches = [
        declaration
        for symbol_owner, symbol_name, declaration
        in public_functions
        if symbol_owner == owner
        and symbol_name.startswith(method_prefix)
    ]
    if len(matches) != 1:
        fail(
            f"{owner}.{method_prefix} expected once, "
            f"found {len(matches)}"
        )
    declaration = matches[0]
    if (
        "runtimeLaunchPreimageClosure: "
        "RuntimeLaunchPreimageClosureV1"
        not in declaration
    ):
        fail(
            f"{owner}.{method_prefix} lacks the composed closure"
        )
    if "runtimeLaunchPolicy:" in declaration:
        fail(
            f"{owner}.{method_prefix} exposes a raw launch policy"
        )

forbidden_partial_entrypoints = (
    ("SupervisorChallengeV1", "verify("),
    ("VerifierReceiptV1", "verify("),
    ("OneShotAttestationV1", "verify("),
    (
        "RepositorySourceManifestV1",
        "validateRuntimeLaunchPolicy(",
    ),
    ("TrustRootSupervisorCoreV1", "issueChallenge("),
    ("TrustRootSupervisorCoreV1", "issueAttestation("),
)
for owner, method_prefix in forbidden_partial_entrypoints:
    matches = [
        symbol_name
        for symbol_owner, symbol_name, _ in public_functions
        if symbol_owner == owner
        and symbol_name.startswith(method_prefix)
    ]
    if matches:
        fail(f"{owner}.{method_prefix} is unexpectedly public")

print(
    "public API symbol-graph check passed: "
    "4 composed entrypoints, 6 partial entrypoints absent"
)
