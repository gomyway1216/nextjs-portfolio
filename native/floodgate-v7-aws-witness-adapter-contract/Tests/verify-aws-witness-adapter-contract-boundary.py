#!/usr/bin/env python3

import hashlib
import json
from pathlib import Path
import re
import subprocess


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PACKAGE_ROOT.parents[1]
TARGET = "FloodgateV7AWSWitnessAdapterContract"
TEST_TARGET = f"{TARGET}Tests"
PROTOCOL_PACKAGE_IDENTITY = (
    "floodgate-v7-external-trust-root-protocol"
)
PROTOCOL_TARGET = "FloodgateV7ExternalTrustRootProtocol"
PROTOCOL_ROOT = (
    REPOSITORY_ROOT
    / "native"
    / PROTOCOL_PACKAGE_IDENTITY
)
SOURCE_ROOT = PACKAGE_ROOT / "Sources" / TARGET
TEST_ROOT = PACKAGE_ROOT / "Tests"

EXPECTED_SOURCES = {
    "AWSWitnessProviderDTOsV1.swift": ["Foundation"],
    "AWSWitnessStoreGenerationV1.swift": [
        "CryptoKit",
        "Foundation",
        PROTOCOL_TARGET,
    ],
    "DynamoWitnessRecordCodecV1.swift": [
        "CryptoKit",
        "Foundation",
        PROTOCOL_TARGET,
    ],
    "DynamoWitnessTransactionContractV1.swift": [
        "CryptoKit",
        "Foundation",
        PROTOCOL_TARGET,
    ],
    "KMSWitnessContractV1.swift": [
        "CryptoKit",
        "Foundation",
        PROTOCOL_TARGET,
    ],
}
EXPECTED_TESTS = {
    (
        f"{TEST_TARGET}/"
        "AWSWitnessAdapterContractTests.swift"
    ),
    "verify-aws-witness-adapter-contract-boundary.py",
}
PRESERVED_CORE = {
    (
        "native/floodgate-v7-external-trust-root-protocol/"
        "Package.swift"
    ): (
        1_589,
        "94e342afc86a647b4bed8d0f997daeebccc1f6ffd7a780fc42214fe66fbcd36d",
    ),
    (
        "native/floodgate-v7-external-trust-root-protocol/"
        "Sources/FloodgateV7RemoteWitnessServiceCore/"
        "DurableRemoteWitnessServiceCoreV1.swift"
    ): (
        27_556,
        "6101fa441e1482189a349a2257004c679a1e69f0a8029022e5eb09ef1a4a143a",
    ),
    (
        "native/floodgate-v7-external-trust-root-protocol/"
        "Tests/FloodgateV7RemoteWitnessServiceCoreTests/"
        "DurableRemoteWitnessServiceCoreTests.swift"
    ): (
        53_082,
        "f1dc6f4af8e0896bc8219867b644e12973b3a45967d978f3f46c5c49791ca012",
    ),
    (
        "native/floodgate-v7-external-trust-root-protocol/"
        "Tests/verify-remote-witness-service-core-boundary.py"
    ): (
        13_964,
        "9090aadad9c13a8ce4686eb1471dfe93f8f9deccef3ac81700def1146e72ee43",
    ),
}

EXPOSED_DECLARATION = re.compile(
    r"\b(?:public|open|package)\s+"
    r"(?:actor|class|enum|extension|func|let|protocol|"
    r"struct|subscript|typealias|var)\b"
)
FORBIDDEN_SOURCE_MARKERS = (
    "@_cdecl",
    "@_documentation",
    "@_spi",
    "@main",
    "AWS_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY",
    "AWSCredential",
    "CloudFormation",
    "DispatchSemaphore",
    "DynamoDBClient",
    "FileManager",
    "KMSClient",
    "Lambda",
    "ProcessInfo",
    "Terraform",
    "Thread.sleep",
    "URLSession",
    "UserDefaults",
    "accessKeyID",
    "dispatch_semaphore",
    "getenv(",
    "import AWS",
    "import Darwin",
    "import Glibc",
    "secretAccessKey",
    "unsafeFlags",
)
REQUIRED_MARKERS = (
    "AWSWitnessTransactGetProviderV1",
    "AWSWitnessTransactWriteProviderV1",
    "AWSWitnessDescribeTableProviderV1",
    "AWSWitnessKMSGetPublicKeyProviderV1",
    "AWSWitnessKMSSignProviderV1",
    'Array("FGV7AWSGEN1".utf8)',
    "preflight.tableID == postflight.tableID",
    "ECC_NIST_EDWARDS25519",
    "ED25519_SHA_512",
    "ED25519_PH_SHA_512",
    'case raw = "RAW"',
    "subjectPublicKeyInfoDER",
    "isValidSignature",
    "ed25519SmallOrder",
    "RFC 8032 section 5.1.3",
    "squareRootExponent",
    "state.witnessSignerKeyID",
    "operation.request.endpointID",
    "transactionInProgress",
    '"STATE"',
    '"OP#',
    '"ATTEMPT#',
    "items.count == 2",
    "request.actions.count == 3",
    "clientRequestToken.utf8.count",
    "case committed",
    "case definitiveCASLoss",
    "case transientConflict",
    "case ambiguous",
    "case stop",
)
SYMBOL_GRAPH_BASE = f"{TARGET}.symbols.json"
SYMBOL_GRAPH_SHARD = re.compile(
    rf"^{re.escape(TARGET)}@[A-Za-z_][A-Za-z0-9_]*"
    r"\.symbols\.json$"
)
EXPECTED_CI_JOB = """  aws_witness_adapter_contract:
    name: AWS witness adapter contract (source only)
    runs-on: macos-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7

      - name: Record Swift contract calibration context
        run: |
          xcodebuild -version
          xcrun swift --version

      - name: Run SDK-free AWS adapter contract tests
        run: >-
          xcrun swift test
          --package-path
          native/floodgate-v7-aws-witness-adapter-contract

      - name: Verify AWS adapter contract isolation and public surface
        run: >-
          /usr/bin/python3
          native/floodgate-v7-aws-witness-adapter-contract/Tests/verify-aws-witness-adapter-contract-boundary.py

      - name: Preserve AWS adapter contract symbol graphs
        if: always()
        uses: actions/upload-artifact@v7
        with:
          name: floodgate-v7-aws-adapter-contract-symbol-graphs-${{ runner.os }}-${{ runner.arch }}-${{ github.sha }}-${{ github.run_attempt }}
          path: |
            native/floodgate-v7-aws-witness-adapter-contract/.build/**/symbolgraph/FloodgateV7AWSWitnessAdapterContract*.symbols.json
          if-no-files-found: error
          include-hidden-files: true
          retention-days: 14
"""


def fail(message: str) -> None:
    raise SystemExit(
        "AWS witness adapter-contract boundary check failed: "
        f"{message}"
    )


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
    value = json.loads(completed.stdout)
    if not isinstance(value, dict):
        fail("dump-package root is not an object")
    return value


def product_dependency(value: object) -> tuple[str, str]:
    if (
        not isinstance(value, dict)
        or set(value) != {"product"}
        or not isinstance(value["product"], list)
        or len(value["product"]) != 4
        or not isinstance(value["product"][0], str)
        or not isinstance(value["product"][1], str)
        or value["product"][2:] != [None, None]
    ):
        fail(f"unsupported product dependency shape: {value!r}")
    return value["product"][0], value["product"][1]


def by_name_dependency(value: object) -> str:
    if (
        not isinstance(value, dict)
        or set(value) != {"byName"}
        or not isinstance(value["byName"], list)
        or len(value["byName"]) != 2
        or not isinstance(value["byName"][0], str)
        or value["byName"][1] is not None
    ):
        fail(f"unsupported by-name dependency shape: {value!r}")
    return value["byName"][0]


def is_supported_filesystem_dependency(
    value: object,
) -> bool:
    if not isinstance(value, dict):
        return False
    keys = set(value)
    legacy_keys = {
        "identity",
        "path",
        "productFilter",
    }
    swift_6_3_keys = legacy_keys | {"traits"}
    if keys == legacy_keys:
        pass
    elif keys == swift_6_3_keys:
        if value.get("traits") != [
            {"name": "default"}
        ]:
            return False
    else:
        return False
    return (
        value.get("identity")
        == PROTOCOL_PACKAGE_IDENTITY
        and value.get("productFilter") is None
        and isinstance(value.get("path"), str)
        and Path(value["path"]).resolve()
        == PROTOCOL_ROOT.resolve()
    )


def verify_package_graph(payload: dict) -> None:
    if payload.get("name") != TARGET:
        fail("package name drifted")
    if payload.get("products") != []:
        fail("contract target became a package product")
    if payload.get("toolsVersion") != {"_version": "5.10.0"}:
        fail("Swift tools version drifted")

    dependencies = payload.get("dependencies")
    if not isinstance(dependencies, list) or len(dependencies) != 1:
        fail("package dependency count is not exactly one")
    dependency = dependencies[0]
    if (
        not isinstance(dependency, dict)
        or set(dependency) != {"fileSystem"}
        or not isinstance(dependency["fileSystem"], list)
        or len(dependency["fileSystem"]) != 1
    ):
        fail("dependency is not the one local filesystem package")
    filesystem = dependency["fileSystem"][0]
    if not is_supported_filesystem_dependency(
        filesystem
    ):
        fail("local protocol dependency identity or path drifted")

    targets = payload.get("targets")
    if not isinstance(targets, list) or len(targets) != 2:
        fail("target count is not exactly source plus tests")
    by_name = {
        target.get("name"): target
        for target in targets
        if isinstance(target, dict)
        and isinstance(target.get("name"), str)
    }
    if set(by_name) != {TARGET, TEST_TARGET}:
        fail("source/test target names drifted")
    source = by_name[TARGET]
    tests = by_name[TEST_TARGET]
    for target, expected_type in (
        (source, "regular"),
        (tests, "test"),
    ):
        if (
            target.get("type") != expected_type
            or target.get("settings") != []
            or target.get("resources") != []
            or target.get("exclude") != []
        ):
            fail("target gained settings, resources, exclusions, or wrong type")
    if [
        product_dependency(value)
        for value in source.get("dependencies", [])
    ] != [(PROTOCOL_TARGET, PROTOCOL_PACKAGE_IDENTITY)]:
        fail("source target dependency is not exact")
    test_dependencies = tests.get("dependencies", [])
    if (
        len(test_dependencies) != 2
        or by_name_dependency(test_dependencies[0]) != TARGET
        or product_dependency(test_dependencies[1])
        != (PROTOCOL_TARGET, PROTOCOL_PACKAGE_IDENTITY)
    ):
        fail("test target dependency graph drifted")


def verify_sources() -> None:
    sources = {
        path.name: path
        for path in SOURCE_ROOT.rglob("*.swift")
    }
    if set(sources) != set(EXPECTED_SOURCES):
        fail(f"source inventory drifted: {sorted(sources)!r}")
    all_source = ""
    for name, expected_imports in EXPECTED_SOURCES.items():
        source = sources[name].read_text(encoding="utf-8")
        imports = re.findall(
            r"(?m)^import ([A-Za-z0-9_]+)$",
            source,
        )
        if imports != expected_imports:
            fail(f"{name} import list drifted: {imports!r}")
        if EXPOSED_DECLARATION.search(source):
            fail(f"{name} exposes a public/open/package declaration")
        present = [
            marker
            for marker in FORBIDDEN_SOURCE_MARKERS
            if marker in source
        ]
        if present:
            fail(f"{name} contains forbidden capabilities: {present!r}")
        all_source += source
    missing = [
        marker
        for marker in REQUIRED_MARKERS
        if marker not in all_source
    ]
    if missing:
        fail(f"required contract markers are missing: {missing!r}")

    test_inventory = {
        path.relative_to(TEST_ROOT).as_posix()
        for path in TEST_ROOT.rglob("*")
        if path.is_file()
    }
    if test_inventory != EXPECTED_TESTS:
        fail(f"test inventory drifted: {sorted(test_inventory)!r}")


def verify_preserved_service_core() -> None:
    for relative, (expected_bytes, expected_sha256) in (
        PRESERVED_CORE.items()
    ):
        path = REPOSITORY_ROOT / relative
        try:
            value = path.read_bytes()
        except OSError as error:
            fail(f"cannot read preserved core path {relative}: {error}")
        if len(value) != expected_bytes:
            fail(f"preserved core byte count drifted: {relative}")
        if hashlib.sha256(value).hexdigest() != expected_sha256:
            fail(f"preserved core SHA-256 drifted: {relative}")


def verify_ci_job() -> None:
    workflow = (
        REPOSITORY_ROOT / ".github" / "workflows" / "ci.yml"
    ).read_text(encoding="utf-8")
    marker = "  aws_witness_adapter_contract:\n"
    if workflow.count(marker) != 1:
        fail("CI contract job key is missing or duplicated")
    start = workflow.index(marker)
    following = re.search(
        r"(?m)^  [a-z][a-z0-9_]+:\n",
        workflow[start + len(marker) :],
    )
    end = (
        len(workflow)
        if following is None
        else start + len(marker) + following.start()
    )
    if workflow[start:end] != EXPECTED_CI_JOB + "\n":
        fail("CI contract job body drifted")


def verify_symbol_graph() -> None:
    subprocess.run(
        [
            "xcrun",
            "swift",
            "package",
            "--package-path",
            str(PACKAGE_ROOT),
            "dump-symbol-graph",
            "--minimum-access-level",
            "public",
            "--include-spi-symbols",
            "--skip-synthesized-members",
        ],
        check=True,
        env={
            "HOME": str(Path.home()),
            "LANG": "C",
            "LC_ALL": "C",
            "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
        },
    )
    graphs = sorted(
        (PACKAGE_ROOT / ".build").glob(
            f"**/symbolgraph/{TARGET}*.symbols.json"
        )
    )
    if not graphs:
        fail("contract symbol graph was not generated")
    directories = sorted({graph.parent for graph in graphs})
    for directory in directories:
        matching = sorted(
            directory.glob(f"{TARGET}*.symbols.json")
        )
        names = {graph.name for graph in matching}
        if SYMBOL_GRAPH_BASE not in names:
            fail(f"symbol graph base missing in {directory}")
        unknown = [
            name
            for name in names
            if name != SYMBOL_GRAPH_BASE
            and SYMBOL_GRAPH_SHARD.fullmatch(name) is None
        ]
        if unknown:
            fail(f"unknown symbol graph shards: {unknown!r}")
        for graph in matching:
            try:
                payload = json.loads(
                    graph.read_text(encoding="utf-8")
                )
            except (OSError, UnicodeError, json.JSONDecodeError) as error:
                fail(f"cannot read symbol graph {graph}: {error}")
            if (
                not isinstance(payload, dict)
                or not isinstance(payload.get("module"), dict)
                or payload["module"].get("name") != TARGET
                or payload.get("symbols") != []
                or payload.get("relationships") != []
            ):
                fail(f"contract symbol graph is not exactly empty: {graph}")


def synthetic_source_regressions() -> None:
    for source in (
        "public struct Escape {}",
        "@_documentation(visibility: internal) "
        "public extension String {}",
        "package enum Escape {}",
    ):
        if EXPOSED_DECLARATION.search(source) is None:
            fail(f"source exposure regex missed synthetic escape: {source}")
    for marker in (
        "import AWSDynamoDB",
        "URLSession.shared",
        "@main struct Escape {}",
    ):
        if not any(value in marker for value in FORBIDDEN_SOURCE_MARKERS):
            fail(f"forbidden-marker gate missed synthetic escape: {marker}")
    legacy_dependency = {
        "identity": PROTOCOL_PACKAGE_IDENTITY,
        "path": str(PROTOCOL_ROOT),
        "productFilter": None,
    }
    swift_6_3_dependency = {
        **legacy_dependency,
        "traits": [{"name": "default"}],
    }
    if (
        not is_supported_filesystem_dependency(
            legacy_dependency
        )
        or not is_supported_filesystem_dependency(
            swift_6_3_dependency
        )
    ):
        fail("supported SwiftPM dependency schema was rejected")
    for mutation in (
        {
            **swift_6_3_dependency,
            "nameForTargetDependencyResolutionOnly": None,
        },
        {
            **swift_6_3_dependency,
            "traits": [],
        },
        {
            **swift_6_3_dependency,
            "traits": None,
        },
        {
            **swift_6_3_dependency,
            "traits": [
                {
                    "name": "default",
                    "condition": None,
                }
            ],
        },
        {
            **swift_6_3_dependency,
            "traits": [{"name": "other"}],
        },
        {
            **swift_6_3_dependency,
            "traits": [
                {"name": "default"},
                {"name": "other"},
            ],
        },
        {
            **legacy_dependency,
            "productFilter": [],
        },
        {
            **legacy_dependency,
            "identity": "other-protocol",
        },
        {
            **legacy_dependency,
            "path": str(PROTOCOL_ROOT.parent),
        },
        {
            **legacy_dependency,
            "path": 7,
        },
        {
            **legacy_dependency,
            "unexpected": None,
        },
    ):
        if is_supported_filesystem_dependency(
            mutation
        ):
            fail("unsupported SwiftPM dependency schema was accepted")


def main() -> None:
    verify_package_graph(load_dump_package())
    verify_sources()
    verify_preserved_service_core()
    verify_ci_job()
    synthetic_source_regressions()
    verify_symbol_graph()
    print(
        "AWS witness adapter-contract boundary check passed: "
        "0 products, 0 external dependencies, 0 production consumers, "
        "0 public/SPI symbols, preserved service core exact"
    )


if __name__ == "__main__":
    main()
