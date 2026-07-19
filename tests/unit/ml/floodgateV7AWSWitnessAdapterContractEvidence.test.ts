import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const packageRelative = "native/floodgate-v7-aws-witness-adapter-contract";
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
      schema: "shogi-floodgate-v7-aws-witness-adapter-contract-evidence-v1",
      evidence_date: "2026-07-18",
      evidence_timezone: "America/Los_Angeles",
      publication_state: {
        status: "LOCAL-PASS-EXACT-REREVIEW-PASS-CI-RERUN-PENDING",
        claims_final: false,
        implementation_snapshot_final: true,
        required_next_action: "pr-ci-rerun",
      },
      revision: {
        base_revision: "ec64549e429803d406383376162eaeb9456df9ef",
        latest_main_revision_integrated:
          "b8625ceeb8ee8ec536e9b11b9f57176161fc0b45",
        implementation_revision: "8dbdb680988241c1902d3bcd21a36b062aa3f890",
        implementation_tree: "db112752e1a91c779a4492a4fcac724b50ca4c20",
        pull_request: 508,
        exact_commit_review: "PASS-P0-0-P1-0-P2-0",
        reviewed_remediation_revision:
          "8dbdb680988241c1902d3bcd21a36b062aa3f890",
        reviewed_remediation_tree: "db112752e1a91c779a4492a4fcac724b50ca4c20",
        reviewed_publication_revision:
          "f332bdc8774593323ec91d567e01ca86a72ef097",
        reviewed_publication_tree: "8b7b5b57b6fea30dd538b725c1e1320709da7e5b",
        continuous_integration: "FIRST-RUN-FAILED-REMEDIATION-PENDING-RERUN",
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
        Array.from(
          source.matchAll(/^import ([A-Za-z0-9_]+)$/gmu),
          (match) => match[1],
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
      signing_algorithms_exact: ["ED25519_SHA_512", "ED25519_PH_SHA_512"],
      capability_order_significant: false,
      sign_request_algorithm: "ED25519_SHA_512",
      message_type: "RAW",
      grant_tokens: [],
      spki_encoding: "RFC8410-ED25519-EXACT-44-BYTES",
      raw_public_key_bytes: 32,
      canonical_compressed_y_required: true,
      rfc8032_point_decompression_required: true,
      non_curve_public_key: "STOP",
      zero_x_with_sign_bit: "STOP",
      small_order_public_key: "STOP",
      signature_bytes: 64,
      response_signature_verified_over_exact_originating_raw_request: true,
      unknown_fields: "STOP",
    });
    expect(
      record.validation.ed25519_independent_differential_review,
    ).toMatchObject({
      status: "PASS",
      implementation_revision: "ed3932f6ec9818340144abf7949545ed292b1261",
      implementation_tree: "e127fd5c21c6b611cd9c021257fe9c6d19a6f441",
      source_blob: "6f8822aa732bd4fc7e884d6dea8c8b0c81ca0bdd",
      oracle: "RFC8032-PYTHON-ARBITRARY-PRECISION-INDEPENDENT",
      unique_encodings: 4810,
      accepted: 2406,
      rejected: 2404,
      mismatches: 0,
      crashes: 0,
      coverage: {
        canonical_on_curve: 2064,
        canonical_y_nonresidue: 2032,
        rfc_keys_and_basepoint: 8,
        rfc_key_single_bit_mutations: 640,
        y_at_or_above_p_all_encodings: 38,
        small_order_encodings: 8,
        zero_x_sign_one_cases: 2,
      },
      debug: {
        duration_seconds: 43.816,
        mismatches: 0,
        crashes: 0,
      },
      release: {
        duration_seconds: 1.727,
        mismatches: 0,
        crashes: 0,
      },
      review_findings: {
        p0: 0,
        p1: 0,
        p2: 0,
      },
    });
    expect(record.dynamodb_contract.transact_get).toMatchObject({
      item_count: 2,
      order: ["STATE", "OP"],
      missing_state: "STOP",
      missing_operation: "ALLOWED-FOR-NEW-OPERATION",
      extra_response: "STOP",
      unknown_fields: "STOP",
      operation_key_encoding: "OP#-PLUS-64-LOWERCASE-ASCII-HEX",
      multibyte_operation_key: "STOP-WITHOUT-TRAP",
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
      "is_supported_filesystem_dependency",
      '"traits": [{"name": "default"}]',
      "--include-spi-symbols",
      'payload.get("symbols") != []',
      'payload.get("relationships") != []',
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
        tests_passed: 22,
        tests_failed: 0,
        debug_duration_seconds: 4.75,
        release_duration_seconds: 4.1,
      },
      boundary_checker: {
        status: "PASS",
        package_products: 0,
        external_dependencies: 0,
        production_consumers: 0,
        public_or_spi_symbols: 0,
        preserved_service_core: "EXACT",
        swiftpm_5_10_dependency_shape: ["identity", "path", "productFilter"],
        swiftpm_6_3_2_dependency_shape: [
          "identity",
          "path",
          "productFilter",
          "traits",
        ],
        swiftpm_6_3_2_traits_exact: [{ name: "default" }],
        real_payload_differential: "PASS-5.10-AND-6.3.2",
        swiftpm_5_10_payload: {
          bytes: 1946,
          sha256:
            "2dc78693d4f2643f15eb493db4270fe35bee5c2fd62bd177526440fd61246ee7",
        },
        swiftpm_6_3_2_payload: {
          bytes: 2096,
          sha256:
            "daf27c3f93a40dbdc4e694ace7304981f79a79bdfa8117202f940264bc73a293",
        },
        malformed_schema_and_path_cases_rejected: 86,
        path_aliases_accepted: 0,
        schema_validation_raises: 0,
      },
      repository_compatibility_tests: {
        status: "PASS",
        files_passed: 2,
        tests_passed: 10,
        tests_failed: 0,
      },
      publication_boundary_tests: {
        status: "PASS",
        files_passed: 1,
        tests_passed: 5,
        tests_failed: 0,
      },
      main_post_merge_ci: {
        revision: "b8625ceeb8ee8ec536e9b11b9f57176161fc0b45",
        run_id: 29666132754,
        status: "PASS",
        jobs_passed: 5,
        steps_passed: 59,
        security_run_id: 29666132781,
      },
      pull_request_ci: {
        status: "FIRST-RUN-FAILED-REMEDIATION-PENDING-RERUN",
        pull_request: 508,
        run_id: 29670280886,
        failed_job_id: 88147888708,
        failure_scope: "SWIFTPM-6.3.2-DUMP-PACKAGE-SCHEMA-CALIBRATION",
      },
      review_remediation: {
        status: "PASS-P0-0-P1-0-P2-0",
        pull_request: 508,
        unicode_operation_key: {
          review_source: "GEMINI-INLINE-REVIEW",
          resolution: "BYTE-INDEXED-LOWERCASE-ASCII-HEX-FAIL-CLOSED",
          regression_test: "testReadRejectsMultibyteOperationKeyWithoutTrap",
          debug_and_release: "PASS-22-OF-22",
          adversarial_cases: 3353124,
          non_ascii_scalar_placements_stopped_without_trap: 3335808,
          malformed_ascii_cases_rejected: 7549,
          canonical_ascii_variants_accepted: 1027,
          canonical_round_trips: 8192,
          length_and_prefix_cases: 548,
          failures_or_crashes: 0,
        },
        swiftpm_6_3_ci: {
          run_id: 29670280886,
          job_id: 88147888708,
          swift_version: "6.3.2",
          resolution: "ALLOW-ONLY-EXACT-SWIFT-5.10-OR-6.3.2-SCHEMA",
          official_6_3_2_real_payload: "PASS",
          local_5_10_real_payload: "PASS",
          negative_schema_mutations: "REJECTED",
          symbol_graph_upload_failure: "CASCADING-AFTER-EARLY-BOUNDARY-EXIT",
          path_alias_finding: "P2-RESOLVED",
          path_rule: "EXACT-CANONICAL-ABSOLUTE-STRING",
        },
      },
      full_repository_validation: {
        vitest: {
          status: "PASS",
          files_passed: 189,
          tests_passed: 3277,
          tests_skipped: 1,
          tests_failed: 0,
          duration_seconds: 329.41,
        },
        ml_stdlib: {
          status: "PASS",
          tests_passed: 138,
          tests_failed: 0,
          duration_seconds: 17.001,
        },
        production_build: {
          status: "PASS",
          duration_seconds: 48.71,
        },
        lint: {
          status: "PASS",
          errors: 0,
          existing_warnings: 157,
          duration_seconds: 29.7,
        },
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
      expect(article).toContain("22 / 22");
      expect(article).toContain("15 / 15");
      expect(article).toContain("29666132754");
      expect(article).toContain("29670280886");
      expect(article).toContain("6.3.2");
      expect(article).toContain("3,353,124");
      expect(article).toContain("3,277");
      expect(article).toContain("138 / 138");
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
