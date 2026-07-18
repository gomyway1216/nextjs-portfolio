import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const packageRelative =
  "native/floodgate-v7-aws-witness-adapter-contract";
const sourceRelative = `${packageRelative}/Sources/FloodgateV7AWSWitnessAdapterContract`;
const testsRelative = `${packageRelative}/Tests`;
const evidenceRelative =
  "docs/data/floodgate-v7-aws-witness-adapter-contract-2026-07-18.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-aws-witness-adapter-contract.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-aws-witness-adapter-contract.en.md";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function raw(relativePath: string): Buffer {
  return fs.readFileSync(path.join(repositoryRoot, relativePath));
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function evidence() {
  return JSON.parse(read(evidenceRelative));
}

function numberedSections(article: string): number[] {
  return Array.from(article.matchAll(/^## ([0-9]+)\. /gmu), (match) =>
    Number(match[1]),
  );
}

describe("Floodgate v7 AWS witness adapter-contract publication boundary", () => {
  it("keeps production closed and every operational counter at zero", () => {
    const record = evidence();
    expect(record).toMatchObject({
      schema:
        "shogi-floodgate-v7-aws-witness-adapter-contract-evidence-v1",
      evidence_date: "2026-07-18",
      evidence_timezone: "America/Los_Angeles",
      publication_state: {
        status: "LOCAL-PASS-EXACT-REVIEW-CI-PENDING",
        claims_final: false,
        implementation_snapshot_final: false,
        required_next_action: "independent-exact-review-then-pr-ci",
      },
      revision: {
        base_revision: "ec64549e429803d406383376162eaeb9456df9ef",
        implementation_revision: null,
        implementation_tree: null,
        pull_request: null,
        exact_commit_review: "PENDING",
        continuous_integration: "PENDING",
      },
      scope: {
        status: "UNAVAILABLE",
        operational_decision: "STOP",
        separate_source_and_test_swift_package_only: true,
        aws_sdk_dependency_present: false,
        cloud_resource_present: false,
        credentials_present: false,
        network_transport_present: false,
        lambda_or_api_entrypoint_present: false,
        infrastructure_as_code_present: false,
        async_provider_compatible_with_preserved_service_core: false,
        preflight_operation_postflight_sequence_orchestrated: false,
        real_dynamodb_call_present: false,
        real_kms_call_present: false,
        production_execution_performed: false,
        teacher_execution_performed: false,
        live_evaluator_changed: false,
      },
    });
    expect(
      Object.values(record.production_counters).every((value) => value === 0),
    ).toBe(true);
    expect(
      Object.values(record.nonclaims).every((value) => value === false),
    ).toBe(true);
  });

  it("pins the isolated package graph, source inventory, and preserved core", () => {
    const record = evidence();
    expect(record.package_boundary).toMatchObject({
      package: "FloodgateV7AWSWitnessAdapterContract",
      target: "FloodgateV7AWSWitnessAdapterContract",
      package_products: 0,
      external_dependencies: 0,
      local_dependencies: ["FloodgateV7ExternalTrustRootProtocol"],
      source_files: 5,
      test_files: 1,
      production_consumers: 0,
      public_symbols: 0,
      spi_symbols: 0,
      public_relationships: 0,
    });
    const sourceFiles = fs
      .readdirSync(path.join(repositoryRoot, sourceRelative))
      .filter((name) => name.endsWith(".swift"))
      .sort();
    expect(sourceFiles).toEqual(
      Object.keys(record.package_boundary.source_import_allowlist).sort(),
    );
    for (const [name, imports] of Object.entries(
      record.package_boundary.source_import_allowlist,
    ) as [string, string[]][]) {
      const source = read(`${sourceRelative}/${name}`);
      expect(
        Array.from(source.matchAll(/^import ([A-Za-z0-9_]+)$/gmu), (match) =>
          match[1],
        ),
        name,
      ).toEqual(imports);
      expect(source, name).not.toMatch(
        /\b(?:public|open|package)\s+(?:actor|class|enum|extension|func|let|protocol|struct|subscript|typealias|var)\b/u,
      );
      expect(source, name).not.toContain("import AWS");
      expect(source, name).not.toContain("URLSession");
      expect(source, name).not.toContain("FileManager");
      expect(source, name).not.toContain("ProcessInfo");
      expect(source, name).not.toContain("@main");
    }

    expect(record.preserved_service_core.status).toBe("EXACT");
    for (const entry of record.preserved_service_core.files as {
      path: string;
      bytes: number;
      sha256: string;
    }[]) {
      const bytes = raw(entry.path);
      expect(bytes.byteLength, entry.path).toBe(entry.bytes);
      expect(sha256(bytes), entry.path).toBe(entry.sha256);
    }
  });

  it("fixes exact generation, KMS, STATE/OP/ATTEMPT, and outcome rules", () => {
    const record = evidence();
    expect(record.store_generation_contract).toMatchObject({
      provider_metadata: "DynamoDB-DescribeTable",
      required_observations: ["preflight", "postflight"],
      table_arn_pinned_and_exact: true,
      table_id_pinned_across_preflight_postflight: true,
      table_status_required: "ACTIVE",
      validates_two_supplied_observations: true,
      operation_sequence_orchestration_present: false,
      table_id_format: "LOWERCASE-ASCII-UUID-SHAPE",
      unknown_fields: "STOP",
      generation_domain: "FGV7AWSGEN1",
      restore_with_new_table_id: "NEW-GENERATION-ID",
      actual_describe_table_call_present: false,
    });
    expect(record.kms_contract).toMatchObject({
      key_id: "PINNED-KEY-ARN",
      key_spec: "ECC_NIST_EDWARDS25519",
      key_usage: "SIGN_VERIFY",
      signing_algorithms_exact: [
        "ED25519_SHA_512",
        "ED25519_PH_SHA_512",
      ],
      capability_order_significant: false,
      sign_request_algorithm: "ED25519_SHA_512",
      message_type: "RAW",
      grant_tokens: [],
      spki_encoding: "RFC8410-ED25519-EXACT-44-BYTES",
      raw_public_key_bytes: 32,
      canonical_compressed_y_required: true,
      small_order_public_key: "STOP",
      signature_bytes: 64,
      response_signature_verified_over_exact_originating_raw_request: true,
      unknown_fields: "STOP",
    });
    expect(record.dynamodb_contract.transact_get).toMatchObject({
      item_count: 2,
      order: ["STATE", "OP"],
      missing_state: "STOP",
      missing_operation: "ALLOWED-FOR-NEW-OPERATION",
      extra_response: "STOP",
      unknown_fields: "STOP",
      state_signer_must_match_bound_kms_key: true,
      operation_endpoint_must_match_state: true,
    });
    expect(record.dynamodb_contract.record_families).toEqual([
      "STATE",
      "OP",
      "ATTEMPT",
    ]);
    expect(record.dynamodb_contract.transact_write).toMatchObject({
      action_count: 3,
      order: [
        "conditional-STATE-update",
        "create-only-OP-put",
        "create-only-ATTEMPT-put",
      ],
      client_request_token_length: 36,
      client_request_token_is_durable_ledger: false,
      submit_builds_and_revalidates_exact_request_internally: true,
      permanent_idempotency_records: ["OP", "ATTEMPT"],
    });
    expect(record.provider_outcome_mapping).toEqual({
      explicit_http_200_matching_token_nonempty_request_id_no_unknown_fields:
        "COMMITTED",
      conditional_check_failed: "DEFINITIVE-CAS-LOSS",
      transaction_conflict_or_throttling: "TRANSIENT-CONFLICT",
      request_timeout_network_unavailable_internal_server_error: "AMBIGUOUS",
      transaction_in_progress: "AMBIGUOUS",
      access_denied_resource_not_found_validation_idempotent_parameter_mismatch:
        "STOP",
      unknown_provider_failure: "STOP",
      untyped_provider_throw: "AMBIGUOUS",
      unknown_success: "STOP",
    });

    const sources = fs
      .readdirSync(path.join(repositoryRoot, sourceRelative))
      .map((name) => read(`${sourceRelative}/${name}`))
      .join("\n");
    for (const marker of [
      'Array("FGV7AWSGEN1".utf8)',
      "preflight.tableID == postflight.tableID",
      "ECC_NIST_EDWARDS25519",
      "ED25519_SHA_512",
      "ED25519_PH_SHA_512",
      'case raw = "RAW"',
      "isValidSignature",
      "ed25519SmallOrder",
      '"STATE"',
      '"OP#',
      '"ATTEMPT#',
      "request.actions.count == 3",
      "case .requestTimeout",
      "return .ambiguous",
    ]) {
      expect(sources, marker).toContain(marker);
    }
  });

  it("requires the exact fail-closed CI and boundary verifier", () => {
    const workflow = read(".github/workflows/ci.yml");
    const boundary = read(
      `${testsRelative}/verify-aws-witness-adapter-contract-boundary.py`,
    );
    for (const marker of [
      "  aws_witness_adapter_contract:",
      "    name: AWS witness adapter contract (source only)",
      "    runs-on: macos-latest",
      "    timeout-minutes: 10",
      "      contents: read",
      "          xcrun swift test",
      `          --package-path\n          ${packageRelative}`,
      `          ${packageRelative}/Tests/verify-aws-witness-adapter-contract-boundary.py`,
      "        if: always()",
      "        uses: actions/upload-artifact@v7",
      `${packageRelative}/.build/**/symbolgraph/FloodgateV7AWSWitnessAdapterContract*.symbols.json`,
      "          if-no-files-found: error",
      "          include-hidden-files: true",
    ]) {
      expect(workflow, marker).toContain(marker);
    }
    for (const marker of [
      "EXPECTED_CI_JOB",
      "PRESERVED_CORE",
      "EXPOSED_DECLARATION",
      "FORBIDDEN_SOURCE_MARKERS",
      "verify_package_graph",
      "verify_sources",
      "verify_preserved_service_core",
      "verify_ci_job",
      "verify_symbol_graph",
      '--include-spi-symbols',
      "payload.get(\"symbols\") != []",
      "payload.get(\"relationships\") != []",
    ]) {
      expect(boundary, marker).toContain(marker);
    }
    expect(workflow).not.toContain(
      "continue-on-error: true\n  aws_witness_adapter_contract",
    );
  });

  it("publishes matching Japanese and English limits, measurements, and next gates", () => {
    const record = evidence();
    expect(record.validation).toMatchObject({
      swift_package_tests: {
        status: "PASS",
        tests_passed: 21,
        tests_failed: 0,
      },
      boundary_checker: {
        status: "PASS",
        package_products: 0,
        external_dependencies: 0,
        production_consumers: 0,
        public_or_spi_symbols: 0,
        preserved_service_core: "EXACT",
      },
      repository_compatibility_tests: {
        status: "PASS",
        files_passed: 2,
        tests_passed: 9,
        tests_failed: 0,
      },
      publication_boundary_tests: {
        status: "PASS",
        files_passed: 1,
        tests_passed: 5,
        tests_failed: 0,
      },
      main_post_merge_ci: {
        revision: "ec64549e429803d406383376162eaeb9456df9ef",
        run_id: 29663849790,
        status: "PASS",
      },
      pull_request_ci: {
        status: "PENDING",
      },
    });
    expect(record.next_gates).toHaveLength(8);
    expect(record.preserved_service_core).toMatchObject({
      provider_closure_mode: "SYNCHRONOUS",
      async_aws_provider_compatible: false,
      required_successor: "ASYNC-OR-STRICT-NONBLOCKING-CONTINUATION",
    });

    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);
    expect(numberedSections(japanese)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(numberedSections(english)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const article of [japanese, english]) {
      expect(article).toContain("UNAVAILABLE / STOP");
      expect(article).toContain("21 / 21");
      expect(article).toContain("9 / 9");
      expect(article).toContain("29663849790");
      expect(article).toContain("STATE");
      expect(article).toContain("OP");
      expect(article).toContain("ATTEMPT");
      expect(article).toContain("ED25519_SHA_512");
      expect(article).toContain("ED25519_PH_SHA_512");
      expect(article).toContain("SYNCHRONOUS");
      expect(article).toContain("TableId");
      expect(article).toContain("100");
      expect(article).toContain("500");
      expect(article).toContain("24,000");
    }
  });
});
