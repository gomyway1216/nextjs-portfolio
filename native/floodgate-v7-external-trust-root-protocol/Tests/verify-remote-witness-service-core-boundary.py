#!/usr/bin/env python3

import json
from pathlib import Path
import re
import subprocess


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SERVICE_TARGET = "FloodgateV7RemoteWitnessServiceCore"
PROTOCOL_TARGET = "FloodgateV7ExternalTrustRootProtocol"
SERVICE_TEST_TARGET = "FloodgateV7RemoteWitnessServiceCoreTests"
SERVICE_SOURCE = (
    PACKAGE_ROOT
    / "Sources"
    / SERVICE_TARGET
    / "DurableRemoteWitnessServiceCoreV1.swift"
)
SYMBOL_GRAPH_NAME = f"{SERVICE_TARGET}.symbols.json"


def fail(message: str) -> None:
    raise SystemExit(
        "remote witness service-core boundary check failed: "
        f"{message}"
    )


def dependency_name(value: object) -> str:
    if (
        not isinstance(value, dict)
        or set(value) != {"byName"}
        or not isinstance(value["byName"], list)
        or len(value["byName"]) != 2
        or not isinstance(value["byName"][0], str)
        or value["byName"][1] is not None
    ):
        fail(f"unsupported target dependency shape: {value!r}")
    return value["byName"][0]


def load_dump_package() -> dict:
    completed = subprocess.run(
        [
            "xcrun",
            "swift",
            "package",
            "--package-path",
            str(PACKAGE_ROOT),
            "dump-package",
        ],
        check=True,
        capture_output=True,
        encoding="utf-8",
        env={
            "HOME": str(Path.home()),
            "LANG": "C",
            "LC_ALL": "C",
            "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
        },
    )
    payload = json.loads(completed.stdout)
    if not isinstance(payload, dict):
        fail("dump-package root is not an object")
    return payload


def verify_package_graph(payload: dict) -> None:
    if payload.get("dependencies") != []:
        fail("the Swift package gained an external dependency")
    products = payload.get("products")
    targets = payload.get("targets")
    if not isinstance(products, list) or not isinstance(targets, list):
        fail("dump-package products or targets are invalid")
    product_targets: list[str] = []
    for product in products:
        if not isinstance(product, dict):
            fail("dump-package product is invalid")
        values = product.get("targets")
        if not isinstance(values, list) or not all(
            isinstance(value, str) for value in values
        ):
            fail("dump-package product targets are invalid")
        product_targets.extend(values)
    if SERVICE_TARGET in product_targets:
        fail("service-core must not be published as a product")

    by_name: dict[str, dict] = {}
    for target in targets:
        if (
            not isinstance(target, dict)
            or not isinstance(target.get("name"), str)
            or target["name"] in by_name
        ):
            fail("dump-package target table is invalid")
        by_name[target["name"]] = target
    if SERVICE_TARGET not in by_name or SERVICE_TEST_TARGET not in by_name:
        fail("service-core source or test target is missing")

    service = by_name[SERVICE_TARGET]
    if (
        service.get("type") != "regular"
        or service.get("settings") != []
        or service.get("resources") != []
        or service.get("exclude") != []
    ):
        fail("service-core has settings, resources, exclusions, or wrong type")
    service_dependencies = [
        dependency_name(value)
        for value in service.get("dependencies", [])
    ]
    if service_dependencies != [PROTOCOL_TARGET]:
        fail("service-core dependency graph is not exact")

    consumers: dict[str, list[str]] = {}
    for name, target in by_name.items():
        names = [
            dependency_name(value)
            for value in target.get("dependencies", [])
        ]
        if SERVICE_TARGET in names:
            consumers[name] = names
    if consumers != {
        SERVICE_TEST_TARGET: [PROTOCOL_TARGET, SERVICE_TARGET]
    }:
        fail(
            "service-core is reachable from a non-test target or "
            "the test graph drifted"
        )


def verify_source_boundary() -> None:
    source_files = sorted(
        path.relative_to(PACKAGE_ROOT).as_posix()
        for path in (PACKAGE_ROOT / "Sources" / SERVICE_TARGET).rglob("*.swift")
    )
    expected = [SERVICE_SOURCE.relative_to(PACKAGE_ROOT).as_posix()]
    if source_files != expected:
        fail(f"service-core source files drifted: {source_files!r}")
    source = SERVICE_SOURCE.read_text(encoding="utf-8")
    imports = re.findall(r"(?m)^import ([A-Za-z0-9_]+)$", source)
    if imports != ["CryptoKit", "Foundation", PROTOCOL_TARGET]:
        fail(f"service-core imports drifted: {imports!r}")
    if re.search(
        r"(?m)^\s*(?:public|open|package)\s+"
        r"(?:class|enum|func|let|protocol|struct|typealias|var)\b",
        source,
    ):
        fail("service-core exposes a public, open, or package declaration")
    forbidden_markers = (
        "@_cdecl",
        "@_spi",
        "CloudFormation",
        "DynamoDB",
        "FileManager",
        "ProcessInfo",
        "Terraform",
        "URLSession",
        "UserDefaults",
        "getenv(",
        "import AWS",
        "import Darwin",
        "import Glibc",
        "unsafeFlags",
    )
    present = [marker for marker in forbidden_markers if marker in source]
    if present:
        fail(f"service-core contains forbidden capabilities: {present!r}")


def verify_zero_symbol_graph() -> None:
    graphs = sorted(
        PACKAGE_ROOT.glob(f".build/**/symbolgraph/{SYMBOL_GRAPH_NAME}")
    )
    if not graphs:
        fail("expected at least one generated service-core symbol graph")
    for graph in graphs:
        payload = json.loads(graph.read_text(encoding="utf-8"))
        if (
            not isinstance(payload, dict)
            or not isinstance(payload.get("module"), dict)
            or payload["module"].get("name") != SERVICE_TARGET
            or payload.get("symbols") != []
            or payload.get("relationships") != []
        ):
            fail(
                "service-core public/SPI symbol graph is not exactly "
                f"empty: {graph}"
            )


def main() -> None:
    verify_package_graph(load_dump_package())
    verify_source_boundary()
    verify_zero_symbol_graph()
    print(
        "remote witness service-core boundary check passed: "
        "0 products, 0 external dependencies, 0 production consumers, "
        "0 public/SPI symbols"
    )


if __name__ == "__main__":
    main()
