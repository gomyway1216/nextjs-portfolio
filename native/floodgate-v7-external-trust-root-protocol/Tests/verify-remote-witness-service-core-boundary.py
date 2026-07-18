#!/usr/bin/env python3

import json
from pathlib import Path
import re
import subprocess
import tempfile


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
SYMBOL_GRAPH_SHARD_PATTERN = re.compile(
    rf"^{re.escape(SERVICE_TARGET)}@[A-Za-z_][A-Za-z0-9_]*"
    r"\.symbols\.json$"
)
EXPOSED_SOURCE_DECLARATION_PATTERN = re.compile(
    r"\b(?:public|open|package)\s+"
    r"(?:class|enum|extension|func|let|protocol|struct|typealias|var)\b"
)
FORBIDDEN_SOURCE_MARKERS = (
    "@_cdecl",
    "@_documentation",
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


def verify_no_exposed_source(source: str) -> None:
    if EXPOSED_SOURCE_DECLARATION_PATTERN.search(source):
        fail("service-core exposes a public, open, or package declaration")
    present = [
        marker
        for marker in FORBIDDEN_SOURCE_MARKERS
        if marker in source
    ]
    if present:
        fail(f"service-core contains forbidden capabilities: {present!r}")


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
    verify_no_exposed_source(source)


def expect_synthetic_source_rejection(
    source: str,
    expected_message: str,
) -> None:
    try:
        verify_no_exposed_source(source)
    except SystemExit as error:
        if expected_message not in str(error):
            fail(
                "synthetic source regression failed for the wrong reason: "
                f"{error}"
            )
    else:
        fail(
            "synthetic source regression unexpectedly passed: "
            f"{expected_message}"
        )


def run_synthetic_source_regression_checks() -> None:
    expect_synthetic_source_rejection(
        "@_documentation(visibility: internal) "
        "public extension String { var fgv7Escape: Int { count } }",
        "exposes a public, open, or package declaration",
    )
    expect_synthetic_source_rejection(
        "@_documentation(visibility: internal)\n"
        "internal extension String {}",
        "contains forbidden capabilities",
    )


def is_service_symbol_graph_filename(filename: str) -> bool:
    return (
        filename == SYMBOL_GRAPH_NAME
        or SYMBOL_GRAPH_SHARD_PATTERN.fullmatch(filename) is not None
    )


def verify_zero_symbol_graph(build_root: Path) -> None:
    matching_graphs = sorted(
        build_root.glob(
            f"**/symbolgraph/{SERVICE_TARGET}*.symbols.json"
        )
    )
    if not matching_graphs:
        fail("expected at least one generated service-core symbol graph")
    graph_directories = sorted({graph.parent for graph in matching_graphs})
    for graph_directory in graph_directories:
        directory_graphs = sorted(
            graph_directory.glob(
                f"{SERVICE_TARGET}*.symbols.json"
            )
        )
        unknown_graphs = [
            graph
            for graph in directory_graphs
            if not is_service_symbol_graph_filename(graph.name)
        ]
        if unknown_graphs:
            fail(
                "unknown matching service-core symbol graph filename(s): "
                f"{[graph.name for graph in unknown_graphs]!r}"
            )
        base_graph = graph_directory / SYMBOL_GRAPH_NAME
        if base_graph not in directory_graphs:
            fail(
                "service-core symbol-graph directory has matching shards "
                f"without the base graph: {graph_directory}"
            )
        for graph in directory_graphs:
            verify_zero_symbol_graph_file(graph)


def verify_zero_symbol_graph_file(graph: Path) -> None:
    try:
        payload = json.loads(graph.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        fail(f"cannot read service-core symbol graph {graph}: {error}")
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


def write_synthetic_graph(
    path: Path,
    *,
    symbols: list[object],
    relationships: list[object],
) -> None:
    payload = {
        "metadata": {
            "formatVersion": {
                "major": 0,
                "minor": 6,
                "patch": 0,
            },
            "generator": (
                "Apple Swift version 5.10 "
                "(swiftlang-5.10.0.12.7 clang-1500.3.9.3)"
            ),
        },
        "module": {
            "name": SERVICE_TARGET,
            "platform": {
                "architecture": "arm64",
                "vendor": "apple",
                "operatingSystem": {
                    "name": "macosx",
                    "minimumVersion": {
                        "major": 13,
                        "minor": 0,
                    },
                },
            },
        },
        "symbols": symbols,
        "relationships": relationships,
    }
    path.write_text(
        json.dumps(payload, sort_keys=True),
        encoding="utf-8",
    )


def expect_synthetic_rejection(
    build_root: Path,
    expected_message: str,
) -> None:
    try:
        verify_zero_symbol_graph(build_root)
    except SystemExit as error:
        if expected_message not in str(error):
            fail(
                "synthetic shard regression failed for the wrong reason: "
                f"{error}"
            )
    else:
        fail(
            "synthetic shard regression unexpectedly passed: "
            f"{expected_message}"
        )


def run_synthetic_shard_regression_checks() -> None:
    if not is_service_symbol_graph_filename(SYMBOL_GRAPH_NAME):
        fail("base service-core symbol-graph filename self-check failed")
    shard_name = f"{SERVICE_TARGET}@Swift.symbols.json"
    if not is_service_symbol_graph_filename(shard_name):
        fail("service-core extension-shard filename self-check failed")
    other_shard_name = f"{SERVICE_TARGET}@Other.symbols.json"
    if not is_service_symbol_graph_filename(other_shard_name):
        fail("service-core other-module shard filename self-check failed")
    if is_service_symbol_graph_filename(
        f"{SERVICE_TARGET}Extra.symbols.json"
    ):
        fail("service-core symbol-graph filename decoy self-check failed")

    with tempfile.TemporaryDirectory(
        prefix="floodgate-v7-service-symbolgraph-"
    ) as temporary_directory:
        graph_directory = (
            Path(temporary_directory)
            / "arm64-apple-macosx"
            / "symbolgraph"
        )
        graph_directory.mkdir(parents=True)
        base_graph = graph_directory / SYMBOL_GRAPH_NAME
        shard_graph = graph_directory / shard_name
        other_shard_graph = graph_directory / other_shard_name
        write_synthetic_graph(
            base_graph,
            symbols=[],
            relationships=[],
        )
        write_synthetic_graph(
            shard_graph,
            symbols=[],
            relationships=[],
        )
        write_synthetic_graph(
            other_shard_graph,
            symbols=[],
            relationships=[],
        )
        verify_zero_symbol_graph(Path(temporary_directory))

        write_synthetic_graph(
            shard_graph,
            symbols=[
                {
                    "identifier": {
                        "interfaceLanguage": "swift",
                        "precise": "synthetic-public-extension",
                    }
                }
            ],
            relationships=[],
        )
        expect_synthetic_rejection(
            Path(temporary_directory),
            "not exactly empty",
        )

        write_synthetic_graph(
            shard_graph,
            symbols=[],
            relationships=[],
        )
        write_synthetic_graph(
            other_shard_graph,
            symbols=[],
            relationships=[
                {
                    "kind": "synthetic-extension-relationship",
                    "source": "synthetic-source",
                    "target": "synthetic-target",
                }
            ],
        )
        expect_synthetic_rejection(
            Path(temporary_directory),
            "not exactly empty",
        )

        write_synthetic_graph(
            other_shard_graph,
            symbols=[],
            relationships=[],
        )
        unknown_graph = (
            graph_directory
            / f"{SERVICE_TARGET}Extra.symbols.json"
        )
        write_synthetic_graph(
            unknown_graph,
            symbols=[],
            relationships=[],
        )
        expect_synthetic_rejection(
            Path(temporary_directory),
            "unknown matching service-core symbol graph filename",
        )


def main() -> None:
    verify_package_graph(load_dump_package())
    verify_source_boundary()
    run_synthetic_source_regression_checks()
    run_synthetic_shard_regression_checks()
    verify_zero_symbol_graph(PACKAGE_ROOT / ".build")
    print(
        "remote witness service-core boundary check passed: "
        "0 products, 0 external dependencies, 0 production consumers, "
        "0 public/SPI symbols"
    )


if __name__ == "__main__":
    main()
