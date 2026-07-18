#!/usr/bin/env python3

import hashlib
import json
from pathlib import Path


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
SYMBOL_GRAPH_MODULE = "FloodgateV7ExternalTrustRootProtocol"
SYMBOL_GRAPH_NAME = (
    f"{SYMBOL_GRAPH_MODULE}.symbols.json"
)
EXPECTED_PUBLIC_SURFACE_SYMBOL_COUNT = 491
EXPECTED_PUBLIC_SURFACE_RELATIONSHIP_COUNT = 542
EXPECTED_PUBLIC_SURFACE_SHA256 = (
    "3e040bc6097a0d7ab1ea7c511b0e6fd32c8a2d7a5c5076ee00beba1a21ae8160"
)
CALLABLE_KINDS = {
    "swift.func",
    "swift.func.op",
    "swift.init",
    "swift.method",
    "swift.subscript",
    "swift.type.method",
    "swift.type.subscript",
}
FUNCTION_PROPERTY_KINDS = {
    "swift.property",
    "swift.type.property",
}
COMPOSED_CLOSURE_TYPE = "RuntimeLaunchPreimageClosureV1"
COMPOSED_CLOSURE_PARAMETER = (
    f"runtimeLaunchPreimageClosure: {COMPOSED_CLOSURE_TYPE}"
)
REQUIRED_FULL_ENTRYPOINTS = (
    ("TrustRootSupervisorSessionV1", "issueChallenge("),
    ("TrustRootVerifierCoreV1", "issueReceipt("),
    ("TrustRootSupervisorSessionV1", "issueAttestation("),
    ("OneShotAttestationConsumerV1", "consume("),
)
ALLOWED_RAW_POLICY_INITIALIZER = (
    "init(fixedArgv:fixedWorkingDirectory:fixedEnvironment:"
    "runtimeInstallPolicy:runtimeLaunchPolicy:sourceManifest:)"
)
ALLOWED_RAW_POLICY_PRODUCER = (
    "swift.type.method",
    "RuntimeLaunchPolicyRecordV1",
    "decodeCanonical(_:)",
)
FORBIDDEN_PARTIAL_ENTRYPOINTS = (
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


class VerificationError(Exception):
    pass


def fail(message: str) -> None:
    raise SystemExit(f"public API symbol-graph check failed: {message}")


def public_declarations(
    symbols: list[object],
) -> list[tuple[str, str, str, str]]:
    declarations: list[tuple[str, str, str, str]] = []
    for symbol in symbols:
        if not isinstance(symbol, dict):
            continue
        path_components = symbol.get("pathComponents")
        fragments = symbol.get("declarationFragments")
        kind = symbol.get("kind")
        if (
            not isinstance(path_components, list)
            or len(path_components) < 1
            or not isinstance(fragments, list)
            or not isinstance(kind, dict)
            or not isinstance(kind.get("identifier"), str)
        ):
            continue
        owner = (
            path_components[0]
            if len(path_components) > 1
            else "<global>"
        )
        symbol_name = path_components[-1]
        declaration = "".join(
            fragment.get("spelling", "")
            for fragment in fragments
            if isinstance(fragment, dict)
        )
        declarations.append(
            (
                kind["identifier"],
                owner,
                symbol_name,
                declaration,
            )
        )
    return declarations


def parameter_clause(declaration: str) -> str:
    start = declaration.find("(")
    if start == -1:
        return ""
    depth = 0
    for index in range(start, len(declaration)):
        character = declaration[index]
        if character == "(":
            depth += 1
        elif character == ")":
            depth -= 1
            if depth == 0:
                return declaration[start + 1:index]
    raise VerificationError(
        f"unbalanced callable declaration: {declaration}"
    )


def is_protocol_symbol_graph_filename(filename: str) -> bool:
    return (
        filename == SYMBOL_GRAPH_NAME
        or (
            filename.startswith(f"{SYMBOL_GRAPH_MODULE}@")
            and filename.endswith(".symbols.json")
        )
    )


def normalized_public_surface(
    symbols: list[object],
    relationships: list[object],
) -> tuple[int, int, str]:
    normalized: set[
        tuple[
            str,
            bool,
            str,
            tuple[str, ...],
            str,
            tuple[tuple[str, str, str], ...],
        ]
    ] = set()
    for symbol in symbols:
        if not isinstance(symbol, dict):
            raise VerificationError("symbol is not an object")
        access_level = symbol.get("accessLevel")
        spi = symbol.get("spi", False)
        kind = symbol.get("kind")
        path_components = symbol.get("pathComponents")
        identifier = symbol.get("identifier")
        declaration_fragments = symbol.get("declarationFragments")
        if (
            not isinstance(access_level, str)
            or not access_level
            or not isinstance(spi, bool)
            or not isinstance(kind, dict)
            or not isinstance(kind.get("identifier"), str)
            or not isinstance(path_components, list)
            or not path_components
            or not all(
                isinstance(component, str)
                for component in path_components
            )
            or not isinstance(identifier, dict)
            or not isinstance(identifier.get("precise"), str)
            or not identifier["precise"]
            or not isinstance(declaration_fragments, list)
        ):
            raise VerificationError(
                "symbol lacks a normalized access level, SPI marker, "
                "kind, path, precise identifier, or declaration"
            )
        normalized_fragments: list[tuple[str, str, str]] = []
        for fragment in declaration_fragments:
            if not isinstance(fragment, dict):
                raise VerificationError(
                    "symbol declaration fragment is not an object"
                )
            fragment_kind = fragment.get("kind")
            spelling = fragment.get("spelling")
            precise_identifier = fragment.get(
                "preciseIdentifier",
                "",
            )
            if (
                not isinstance(fragment_kind, str)
                or not isinstance(spelling, str)
                or not isinstance(precise_identifier, str)
            ):
                raise VerificationError(
                    "symbol declaration fragment lacks a normalized "
                    "kind, spelling, or precise identifier"
                )
            normalized_fragments.append(
                (
                    fragment_kind,
                    spelling,
                    precise_identifier,
                )
            )
        normalized.add(
            (
                access_level,
                spi,
                kind["identifier"],
                tuple(path_components),
                identifier["precise"],
                tuple(normalized_fragments),
            )
        )
    normalized_relationships: set[str] = set()
    for relationship in relationships:
        if not isinstance(relationship, dict):
            raise VerificationError(
                "symbol relationship is not an object"
            )
        if not all(
            isinstance(relationship.get(field), str)
            and relationship[field]
            for field in ("kind", "source", "target")
        ):
            raise VerificationError(
                "symbol relationship lacks a normalized kind, source, "
                "or target"
            )
        normalized_relationships.add(
            json.dumps(
                relationship,
                allow_nan=False,
                ensure_ascii=False,
                separators=(",", ":"),
                sort_keys=True,
            )
        )
    payload = json.dumps(
        {
            "relationships": [
                json.loads(relationship)
                for relationship in sorted(normalized_relationships)
            ],
            "symbols": [
                [
                    access_level,
                    spi,
                    kind,
                    list(path_components),
                    precise_identifier,
                    [
                        list(fragment)
                        for fragment in declaration_fragments
                    ],
                ]
                for (
                    access_level,
                    spi,
                    kind,
                    path_components,
                    precise_identifier,
                    declaration_fragments,
                ) in sorted(normalized)
            ],
        },
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return (
        len(normalized),
        len(normalized_relationships),
        hashlib.sha256(payload).hexdigest(),
    )


def verify_exact_public_surface(
    graph_label: str,
    symbols: list[object],
    relationships: list[object],
) -> None:
    (
        symbol_count,
        relationship_count,
        surface_sha256,
    ) = normalized_public_surface(symbols, relationships)
    if (
        symbol_count != EXPECTED_PUBLIC_SURFACE_SYMBOL_COUNT
        or relationship_count
        != EXPECTED_PUBLIC_SURFACE_RELATIONSHIP_COUNT
        or surface_sha256 != EXPECTED_PUBLIC_SURFACE_SHA256
    ):
        raise VerificationError(
            f"{graph_label}: public/SPI symbol surface mismatch: "
            f"symbols={symbol_count} "
            f"relationships={relationship_count} "
            f"sha256={surface_sha256}"
        )


def verify_public_api(
    graph_label: str,
    symbols: list[object],
    relationships: list[object],
    enforce_exact_surface: bool = True,
) -> None:
    if enforce_exact_surface:
        verify_exact_public_surface(
            graph_label,
            symbols,
            relationships,
        )
    declarations = public_declarations(symbols)
    callable_declarations = [
        (owner, symbol_name, declaration)
        for kind, owner, symbol_name, declaration in declarations
        if kind in CALLABLE_KINDS
    ]
    composed_entrypoints = [
        (owner, symbol_name, declaration)
        for owner, symbol_name, declaration in callable_declarations
        if COMPOSED_CLOSURE_TYPE in declaration
    ]

    for owner, method_prefix in REQUIRED_FULL_ENTRYPOINTS:
        matches = [
            declaration
            for symbol_owner, symbol_name, declaration in callable_declarations
            if symbol_owner == owner
            and symbol_name.startswith(method_prefix)
        ]
        if len(matches) != 1:
            raise VerificationError(
                f"{graph_label}: {owner}.{method_prefix} "
                f"expected once, found {len(matches)}"
            )
        if COMPOSED_CLOSURE_PARAMETER not in parameter_clause(matches[0]):
            raise VerificationError(
                f"{graph_label}: {owner}.{method_prefix} "
                "lacks the required composed-closure parameter"
            )
    if len(composed_entrypoints) != len(REQUIRED_FULL_ENTRYPOINTS):
        names = ", ".join(
            f"{owner}.{symbol_name}"
            for owner, symbol_name, _ in composed_entrypoints
        )
        raise VerificationError(
            f"{graph_label}: expected exactly "
            f"{len(REQUIRED_FULL_ENTRYPOINTS)} composed entrypoints, "
            f"found {len(composed_entrypoints)}: {names}"
        )

    raw_policy_consumers = []
    for kind, owner, symbol_name, declaration in declarations:
        if kind not in CALLABLE_KINDS:
            continue
        if "RuntimeLaunchPolicyRecordV1" not in declaration:
            continue
        allowed_closure_initializer = (
            kind == "swift.init"
            and owner == "RuntimeLaunchPreimageClosureV1"
            and symbol_name == ALLOWED_RAW_POLICY_INITIALIZER
        )
        allowed_raw_policy_producer = (
            (kind, owner, symbol_name) == ALLOWED_RAW_POLICY_PRODUCER
            and "RuntimeLaunchPolicyRecordV1"
            not in parameter_clause(declaration)
        )
        if (
            not allowed_closure_initializer
            and not allowed_raw_policy_producer
        ):
            raw_policy_consumers.append(f"{owner}.{symbol_name}")
    if raw_policy_consumers:
        raise VerificationError(
            f"{graph_label}: public callable accepts a raw launch policy: "
            + ", ".join(raw_policy_consumers)
        )

    security_typealiases = [
        symbol_name
        for kind, _, symbol_name, declaration in declarations
        if kind == "swift.typealias"
        and (
            COMPOSED_CLOSURE_TYPE in declaration
            or "RuntimeLaunchPolicyRecordV1" in declaration
        )
    ]
    if security_typealiases:
        raise VerificationError(
            f"{graph_label}: public security typealias is forbidden: "
            + ", ".join(security_typealiases)
        )

    protected_function_properties = [
        f"{owner}.{symbol_name}"
        for kind, owner, symbol_name, declaration in declarations
        if kind in FUNCTION_PROPERTY_KINDS
        and "->" in declaration
        and (
            COMPOSED_CLOSURE_TYPE in declaration
            or "RuntimeLaunchPolicyRecordV1" in declaration
        )
    ]
    if protected_function_properties:
        raise VerificationError(
            f"{graph_label}: public function property exposes a "
            "protected runtime-launch type: "
            + ", ".join(protected_function_properties)
        )

    for owner, method_prefix in FORBIDDEN_PARTIAL_ENTRYPOINTS:
        matches = [
            symbol_name
            for _, symbol_owner, symbol_name, _ in declarations
            if symbol_owner == owner
            and symbol_name.startswith(method_prefix)
        ]
        if matches:
            raise VerificationError(
                f"{graph_label}: {owner}.{method_prefix} "
                "is unexpectedly public"
            )


def expect_synthetic_rejection(
    graph_label: str,
    symbols: list[object],
    relationships: list[object],
    synthetic_symbol: dict[str, object],
    expected_fragment: str,
) -> None:
    try:
        verify_public_api(
            graph_label,
            [*symbols, synthetic_symbol],
            relationships,
            enforce_exact_surface=False,
        )
    except VerificationError as error:
        if expected_fragment not in str(error):
            raise VerificationError(
                f"{graph_label}: synthetic rejection had an unexpected "
                f"reason: {error}"
            ) from error
        return
    raise VerificationError(
        f"{graph_label}: synthetic regression unexpectedly passed"
    )


def run_synthetic_regression_checks(
    graph_label: str,
    symbols: list[object],
    relationships: list[object],
) -> None:
    symbol_base = {
        "accessLevel": "public",
        "identifier": {
            "precise": "synthetic:UnexpectedPublicSurface",
        },
        "declarationFragments": [],
    }
    try:
        verify_exact_public_surface(
            graph_label,
            [
                *symbols,
                {
                    **symbol_base,
                    "kind": {"identifier": "swift.var"},
                    "pathComponents": ["UnexpectedPublicSurface"],
                    "declarationFragments": [
                        {
                            "kind": "identifier",
                            "spelling": "UnexpectedPublicSurface",
                        }
                    ],
                },
            ],
            relationships,
        )
    except VerificationError as error:
        if "public/SPI symbol surface mismatch" not in str(error):
            raise
    else:
        raise VerificationError(
            f"{graph_label}: synthetic public surface unexpectedly passed"
        )
    declaration_symbol_index = next(
        (
            index
            for index, symbol in enumerate(symbols)
            if isinstance(symbol, dict)
            and isinstance(symbol.get("declarationFragments"), list)
            and any(
                isinstance(fragment, dict)
                and fragment.get("kind") == "typeIdentifier"
                and isinstance(fragment.get("spelling"), str)
                for fragment in symbol["declarationFragments"]
            )
        ),
        None,
    )
    if declaration_symbol_index is None:
        raise VerificationError(
            f"{graph_label}: no declaration-bearing symbol for the "
            "surface-hash self-check"
        )
    declaration_symbol = symbols[declaration_symbol_index]
    if not isinstance(declaration_symbol, dict):
        raise VerificationError(
            f"{graph_label}: declaration-bearing symbol is not an object"
        )
    mutated_declaration_fragments = []
    declaration_mutated = False
    for fragment in declaration_symbol["declarationFragments"]:
        if (
            not declaration_mutated
            and isinstance(fragment, dict)
            and fragment.get("kind") == "typeIdentifier"
            and isinstance(fragment.get("spelling"), str)
        ):
            mutated_declaration_fragments.append(
                {
                    **fragment,
                    "spelling": f"{fragment['spelling']}Mutated",
                    "preciseIdentifier": (
                        f"{fragment.get('preciseIdentifier', '')}Mutated"
                    ),
                }
            )
            declaration_mutated = True
        else:
            mutated_declaration_fragments.append(fragment)
    mutated_symbols = list(symbols)
    mutated_symbols[declaration_symbol_index] = {
        **declaration_symbol,
        "declarationFragments": mutated_declaration_fragments,
    }
    (
        mutated_count,
        mutated_relationship_count,
        mutated_sha256,
    ) = normalized_public_surface(
        mutated_symbols,
        relationships,
    )
    if mutated_count != EXPECTED_PUBLIC_SURFACE_SYMBOL_COUNT:
        raise VerificationError(
            f"{graph_label}: same-path declaration mutation changed "
            f"surface count to {mutated_count}"
        )
    if (
        mutated_relationship_count
        != EXPECTED_PUBLIC_SURFACE_RELATIONSHIP_COUNT
    ):
        raise VerificationError(
            f"{graph_label}: same-path declaration mutation changed "
            f"relationship count to {mutated_relationship_count}"
        )
    if mutated_sha256 == EXPECTED_PUBLIC_SURFACE_SHA256:
        raise VerificationError(
            f"{graph_label}: same-path declaration mutation did not "
            "change the public surface hash"
        )
    try:
        verify_exact_public_surface(
            graph_label,
            mutated_symbols,
            relationships,
        )
    except VerificationError as error:
        if "public/SPI symbol surface mismatch" not in str(error):
            raise
    else:
        raise VerificationError(
            f"{graph_label}: same-path declaration mutation "
            "unexpectedly passed"
        )
    conformance_relationship_index = next(
        (
            index
            for index, relationship in enumerate(relationships)
            if isinstance(relationship, dict)
            and relationship.get("kind") == "conformsTo"
            and isinstance(relationship.get("target"), str)
        ),
        None,
    )
    if conformance_relationship_index is None:
        raise VerificationError(
            f"{graph_label}: no conformance relationship for the "
            "surface-hash self-check"
        )
    conformance_relationship = relationships[
        conformance_relationship_index
    ]
    if not isinstance(conformance_relationship, dict):
        raise VerificationError(
            f"{graph_label}: conformance relationship is not an object"
        )
    mutated_relationships = list(relationships)
    mutated_relationships[conformance_relationship_index] = {
        **conformance_relationship,
        "target": f"{conformance_relationship['target']}Mutated",
        "targetFallback": (
            f"{conformance_relationship.get('targetFallback', '')}Mutated"
        ),
    }
    (
        relationship_mutation_symbol_count,
        relationship_mutation_count,
        relationship_mutation_sha256,
    ) = normalized_public_surface(symbols, mutated_relationships)
    if (
        relationship_mutation_symbol_count
        != EXPECTED_PUBLIC_SURFACE_SYMBOL_COUNT
        or relationship_mutation_count
        != EXPECTED_PUBLIC_SURFACE_RELATIONSHIP_COUNT
    ):
        raise VerificationError(
            f"{graph_label}: relationship-only mutation changed "
            "the normalized surface counts"
        )
    if relationship_mutation_sha256 == EXPECTED_PUBLIC_SURFACE_SHA256:
        raise VerificationError(
            f"{graph_label}: relationship-only mutation did not "
            "change the public surface hash"
        )
    try:
        verify_exact_public_surface(
            graph_label,
            symbols,
            mutated_relationships,
        )
    except VerificationError as error:
        if "public/SPI symbol surface mismatch" not in str(error):
            raise
    else:
        raise VerificationError(
            f"{graph_label}: relationship-only mutation "
            "unexpectedly passed"
        )
    expect_synthetic_rejection(
        graph_label,
        symbols,
        relationships,
        {
            **symbol_base,
            "kind": {"identifier": "swift.func"},
            "pathComponents": [
                "bypass(preimages:)",
            ],
            "declarationFragments": [
                {
                    "spelling": (
                        "func bypass(randomBytes: (Int) throws -> [UInt8], "
                        "preimages: "
                        "RuntimeLaunchPreimageClosureV1)"
                    )
                }
            ],
        },
        "expected exactly 4 composed entrypoints",
    )
    expect_synthetic_rejection(
        graph_label,
        symbols,
        relationships,
        {
            **symbol_base,
            "kind": {"identifier": "swift.init"},
            "pathComponents": [
                "UnexpectedHandoffV1",
                "init(preimages:)",
            ],
            "declarationFragments": [
                {
                    "spelling": (
                        "init(preimages: RuntimeLaunchPreimageClosureV1)"
                    )
                }
            ],
        },
        "expected exactly 4 composed entrypoints",
    )
    expect_synthetic_rejection(
        graph_label,
        symbols,
        relationships,
        {
            **symbol_base,
            "kind": {"identifier": "swift.method"},
            "pathComponents": [
                "TrustRootSupervisorSessionV1",
                "issueChallenge(manifest:)",
            ],
            "declarationFragments": [
                {
                    "spelling": (
                        "func issueChallenge("
                        "manifest: RepositorySourceManifestV1)"
                    )
                }
            ],
        },
        "expected once, found 2",
    )
    expect_synthetic_rejection(
        graph_label,
        symbols,
        relationships,
        {
            **symbol_base,
            "kind": {"identifier": "swift.func"},
            "pathComponents": [
                "bypass(runtimeLaunchPolicy:)",
            ],
            "declarationFragments": [
                {
                    "spelling": (
                        "func bypass(runtimeLaunchPolicy: "
                        "RuntimeLaunchPolicyRecordV1)"
                    )
                }
            ],
        },
        "public callable accepts a raw launch policy",
    )
    for kind, owner, symbol_name, declaration, expected_fragment in (
        (
            "swift.type.method",
            "UnexpectedHandoffV1",
            "makeRawBypass()",
            (
                "static func makeRawBypass() -> "
                "(RuntimeLaunchPolicyRecordV1) -> Bool"
            ),
            "public callable accepts a raw launch policy",
        ),
        (
            "swift.method",
            "UnexpectedHandoffV1",
            "makeClosureBypass()",
            (
                "func makeClosureBypass() -> "
                "(RuntimeLaunchPreimageClosureV1) -> Bool"
            ),
            "expected exactly 4 composed entrypoints",
        ),
    ):
        expect_synthetic_rejection(
            graph_label,
            symbols,
            relationships,
            {
                **symbol_base,
                "kind": {"identifier": kind},
                "pathComponents": [owner, symbol_name],
                "declarationFragments": [{"spelling": declaration}],
            },
            expected_fragment,
        )
    for alias_name, aliased_type in (
        ("Preimages", "RuntimeLaunchPreimageClosureV1"),
        ("RawPolicy", "RuntimeLaunchPolicyRecordV1"),
    ):
        expect_synthetic_rejection(
            graph_label,
            symbols,
            relationships,
            {
                **symbol_base,
                "kind": {"identifier": "swift.typealias"},
                "pathComponents": [alias_name],
                "declarationFragments": [
                    {
                        "spelling": (
                            f"typealias {alias_name} = {aliased_type}"
                        )
                    }
                ],
            },
            "public security typealias is forbidden",
        )
    for kind, property_name, property_type in (
        (
            "swift.property",
            "rawPolicyBypass",
            "(RuntimeLaunchPolicyRecordV1) -> Bool",
        ),
        (
            "swift.type.property",
            "closureBypass",
            "(RuntimeLaunchPreimageClosureV1) -> Bool",
        ),
    ):
        expect_synthetic_rejection(
            graph_label,
            symbols,
            relationships,
            {
                **symbol_base,
                "kind": {"identifier": kind},
                "pathComponents": [
                    "UnexpectedHandoffV1",
                    property_name,
                ],
                "declarationFragments": [
                    {
                        "spelling": (
                            f"static let {property_name}: {property_type}"
                            if kind == "swift.type.property"
                            else f"let {property_name}: {property_type}"
                        )
                    }
                ],
            },
            "public function property exposes a protected runtime-launch type",
        )
    for kind, symbol_name, declaration in (
        (
            "swift.func.op",
            "==(lhs:rhs:)",
            (
                "static func == (lhs: UnexpectedHandoffV1, "
                "rhs: RuntimeLaunchPolicyRecordV1) -> Bool"
            ),
        ),
        (
            "swift.subscript",
            "subscript(_:)",
            (
                "subscript(policy: RuntimeLaunchPolicyRecordV1) "
                "-> Bool"
            ),
        ),
        (
            "swift.type.subscript",
            "subscript(staticPolicy:)",
            (
                "static subscript("
                "staticPolicy: RuntimeLaunchPolicyRecordV1) -> Bool"
            ),
        ),
    ):
        expect_synthetic_rejection(
            graph_label,
            symbols,
            relationships,
            {
                **symbol_base,
                "kind": {"identifier": kind},
                "pathComponents": ["UnexpectedHandoffV1", symbol_name],
                "declarationFragments": [{"spelling": declaration}],
            },
            "public callable accepts a raw launch policy",
        )


def main() -> None:
    base_symbol_graphs = sorted(
        (PACKAGE_ROOT / ".build").glob(
            f"**/symbolgraph/{SYMBOL_GRAPH_NAME}"
        )
    )
    if not base_symbol_graphs:
        fail("expected at least one protocol symbol graph, found 0")
    if not is_protocol_symbol_graph_filename(SYMBOL_GRAPH_NAME):
        fail("base symbol-graph filename self-check failed")
    if not is_protocol_symbol_graph_filename(
        f"{SYMBOL_GRAPH_MODULE}@Swift.symbols.json"
    ):
        fail("extension symbol-graph shard self-check failed")
    if is_protocol_symbol_graph_filename(
        f"{SYMBOL_GRAPH_MODULE}Extra.symbols.json"
    ):
        fail("symbol-graph filename decoy self-check failed")

    symbol_graph_directories = sorted(
        {symbol_graph.parent for symbol_graph in base_symbol_graphs}
    )
    verified_file_count = 0
    for symbol_graph_directory in symbol_graph_directories:
        symbol_graph_files = sorted(
            path
            for path in symbol_graph_directory.glob(
                f"{SYMBOL_GRAPH_MODULE}*.symbols.json"
            )
            if is_protocol_symbol_graph_filename(path.name)
        )
        symbols: list[object] = []
        relationships: list[object] = []
        for symbol_graph_file in symbol_graph_files:
            with symbol_graph_file.open(encoding="utf-8") as handle:
                graph = json.load(handle)
            if not isinstance(graph, dict):
                fail(f"{symbol_graph_file}: graph is not an object")
            graph_symbols = graph.get("symbols")
            graph_relationships = graph.get("relationships")
            if not isinstance(graph_symbols, list):
                fail(f"{symbol_graph_file}: missing symbols array")
            if not isinstance(graph_relationships, list):
                fail(f"{symbol_graph_file}: missing relationships array")
            metadata = graph.get("metadata")
            module = graph.get("module")
            if not isinstance(metadata, dict) or not isinstance(module, dict):
                fail(
                    f"{symbol_graph_file}: missing calibration metadata "
                    "or module context"
                )
            format_version = metadata.get("formatVersion")
            generator = metadata.get("generator")
            module_platform = module.get("platform")
            if (
                not isinstance(format_version, dict)
                or not all(
                    type(format_version.get(component)) is int
                    for component in ("major", "minor", "patch")
                )
                or not isinstance(generator, str)
                or not generator
                or module.get("name") != SYMBOL_GRAPH_MODULE
                or not isinstance(module_platform, dict)
                or not module_platform
            ):
                fail(
                    f"{symbol_graph_file}: invalid symbol-graph "
                    "generator, format version, module name, or platform"
                )
            print(
                "public API symbol-graph calibration context: "
                f"file={symbol_graph_file.name} "
                f"metadata={json.dumps(metadata, sort_keys=True)} "
                f"module={json.dumps(module, sort_keys=True)}"
            )
            symbols.extend(graph_symbols)
            relationships.extend(graph_relationships)
        verified_file_count += len(symbol_graph_files)
        graph_label = ", ".join(
            str(path) for path in symbol_graph_files
        )
        try:
            verify_public_api(graph_label, symbols, relationships)
            run_synthetic_regression_checks(
                graph_label,
                symbols,
                relationships,
            )
        except VerificationError as error:
            fail(str(error))

    print(
        "public API symbol-graph check passed: "
        f"{len(symbol_graph_directories)} build configurations, "
        f"{verified_file_count} base/shard files, "
        f"{EXPECTED_PUBLIC_SURFACE_SYMBOL_COUNT} public/SPI symbols, "
        f"{EXPECTED_PUBLIC_SURFACE_RELATIONSHIP_COUNT} relationships, "
        f"{len(REQUIRED_FULL_ENTRYPOINTS)} exact composed entrypoints, "
        f"{len(FORBIDDEN_PARTIAL_ENTRYPOINTS)} partial entrypoints absent, "
        "0 public callable raw-policy consumers"
    )


if __name__ == "__main__":
    main()
