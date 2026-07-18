import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const moduleRelative = "native/floodgate-v7-external-trust-root-protocol";
const packageRelative = `${moduleRelative}/Package.swift`;
const serviceSourceRelative = `${moduleRelative}/Sources/FloodgateV7RemoteWitnessServiceCore/DurableRemoteWitnessServiceCoreV1.swift`;
const serviceTestsRelative = `${moduleRelative}/Tests/FloodgateV7RemoteWitnessServiceCoreTests/DurableRemoteWitnessServiceCoreTests.swift`;
const boundaryRelative = `${moduleRelative}/Tests/verify-remote-witness-service-core-boundary.py`;
const evidenceRelative =
  "docs/data/floodgate-v7-durable-witness-service-core-2026-07-18.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-durable-witness-service-core.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-durable-witness-service-core.en.md";
const reviewedAnchorRevision = "8074545c2c4cdc2fae606169490c978008c7b4fd";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function raw(relativePath: string): Buffer {
  return fs.readFileSync(path.join(repositoryRoot, relativePath));
}

function rawAtRevision(revision: string, relativePath: string): Buffer {
  return execFileSync(
    "git",
    ["--no-replace-objects", "show", `${revision}:${relativePath}`],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_SYSTEM: "/dev/null",
      },
    },
  );
}

function assertGitAncestor(ancestor: string, descendant: string): void {
  execFileSync(
    "git",
    [
      "--no-replace-objects",
      "merge-base",
      "--is-ancestor",
      ancestor,
      descendant,
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_SYSTEM: "/dev/null",
      },
      stdio: "pipe",
    },
  );
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

describe("Floodgate v7 durable witness service-core publication boundary", () => {
  it("keeps revision authority pending and every operational counter at zero", () => {
    const record = evidence();

    expect(record).toMatchObject({
      schema: "shogi-floodgate-v7-durable-witness-service-core-evidence-v1",
      evidence_date: "2026-07-18",
      evidence_timezone: "America/Los_Angeles",
      publication_state: {
        status: "ANCHOR-REVIEW-PASS-POST-ANCHOR-REMEDIATION-REVIEW-CI-PENDING",
        claims_final: false,
        implementation_snapshot_final: false,
        reviewed_anchor_snapshot_final: true,
        validation_counts_final: true,
        required_next_action:
          "exact-review-post-anchor-remediation-and-complete-pr-ci",
      },
      revision: {
        base_revision: "9aacb89670f566ab3b5d219e815f490580713455",
        implementation_revision: reviewedAnchorRevision,
        implementation_tree: "78313441b72c5eadb74cf9da95e7ab28ba7f4795",
        pull_request: 506,
        implementation_exact_commit_review: "PASS",
        implementation_exact_commit_reviewers: 2,
        implementation_exact_commit_findings: {
          p0: 0,
          p1: 0,
          p2: 0,
        },
        publication_revision: reviewedAnchorRevision,
        publication_tree: "78313441b72c5eadb74cf9da95e7ab28ba7f4795",
        publication_exact_commit_review: "PASS",
        publication_exact_commit_reviewers: 2,
        publication_exact_commit_findings: {
          p0: 0,
          p1: 0,
          p2: 0,
        },
        continuous_integration: "PENDING",
      },
      scope: {
        status: "UNAVAILABLE",
        operational_decision: "STOP",
        source_and_test_service_core_only: true,
        post_sign_state_revalidation_contract_present: true,
        independent_observed_store_generation_contract_present: true,
        accepted_operation_state_lineage_contract_present: true,
        endpoint_generation_cryptographic_binding_present: true,
        service_target_published_as_package_product: false,
        service_target_public_or_spi_symbols: 0,
        service_target_production_consumers: 0,
        cloud_provider_adapter_present: false,
        real_transactional_read_present: false,
        physical_store_generation_observer_present: false,
        network_transport_present: false,
        root_writer_present: false,
        production_entrypoint_present: false,
        production_execution_performed: false,
        live_evaluator_changed: false,
      },
    });
    expect(
      Object.values(record.production_counters).every((value) => value === 0),
    ).toBe(true);
    expect(
      Object.values(record.nonclaims).every((value) => value === false),
    ).toBe(true);
    expect(record.validation.focused_vitest).toEqual({
      status: "PASS",
      files_passed: 1,
      tests_passed: 5,
      tests_failed: 0,
    });
    expect(record.validation.github_ci).toEqual({
      status: "PENDING",
      swift_tests_measured: false,
      service_symbol_graph_measured: false,
      boundary_script_measured: false,
    });
  });

  it("pins the reviewed anchor separately from the post-anchor boundary remediation", () => {
    const record = evidence();
    const expectedImplementationPaths = [
      ".github/workflows/ci.yml",
      packageRelative,
      serviceSourceRelative,
      serviceTestsRelative,
      boundaryRelative,
    ];

    expect(record.implementation_surface.candidate_paths).toEqual(
      expectedImplementationPaths,
    );
    expect(
      record.implementation_surface.exact_committed_snapshot_revision,
    ).toBe(reviewedAnchorRevision);
    assertGitAncestor(reviewedAnchorRevision, "HEAD");
    expect(
      record.implementation_surface.exact_committed_snapshot.map(
        (entry: { path: string }) => entry.path,
      ),
    ).toEqual(expectedImplementationPaths);
    for (const entry of record.implementation_surface
      .exact_committed_snapshot as {
      path: string;
      bytes: number;
      sha256: string;
    }[]) {
      const bytes = rawAtRevision(reviewedAnchorRevision, entry.path);
      expect(bytes.byteLength, entry.path).toBe(entry.bytes);
      expect(sha256(bytes), entry.path).toBe(entry.sha256);
      // The reviewed workflow bytes remain pinned above at the anchor. Current
      // CI orchestration may add independent fail-closed jobs without
      // rewriting that historical snapshot; the focused workflow contract
      // tests validate the live external-trust-root job itself.
      if (
        entry.path !== boundaryRelative &&
        entry.path !== ".github/workflows/ci.yml"
      ) {
        expect(raw(entry.path).equals(bytes), entry.path).toBe(true);
      }
    }

    expect(record.post_anchor_ci_remediation).toMatchObject({
      status: "LOCAL-PASS-EXACT-REVIEW-PENDING-CI-PENDING",
      base_revision: "a6e4a68b16e5bc9d67c66d9aee4c11566d09f21c",
      reason: "close-symbol-graph-shard-and-documentation-visibility-escapes",
      exact_review: "PENDING",
      continuous_integration: "PENDING",
      boundary_snapshot: {
        path: boundaryRelative,
        bytes: 13964,
        sha256:
          "9090aadad9c13a8ce4686eb1471dfe93f8f9deccef3ac81700def1146e72ee43",
      },
      actual_swift_5_10_probe: {
        source_declaration_kind: "public-extension",
        base_graph: {
          filename: "FloodgateSymbolGraphProbe.symbols.json",
          module_name: "FloodgateSymbolGraphProbe",
          symbols: 0,
          relationships: 0,
        },
        extension_shard_graph: {
          filename: "FloodgateSymbolGraphProbe@Swift.symbols.json",
          module_name: "FloodgateSymbolGraphProbe",
          symbols: 1,
          relationships: 1,
        },
        temporary_probe_source_removed: true,
        documentation_visibility_escape_probe: {
          source_declaration_kind: "documentation-hidden-public-extension",
          emitted_extension_shards: 0,
          base_graph_symbols: 0,
          base_graph_relationships: 0,
          separate_client_member_access_typechecked: true,
          checker_decision: "REJECT",
        },
      },
    });
    assertGitAncestor(record.post_anchor_ci_remediation.base_revision, "HEAD");
    assertGitAncestor(
      reviewedAnchorRevision,
      record.post_anchor_ci_remediation.base_revision,
    );
    const remediationBytes = raw(
      record.post_anchor_ci_remediation.boundary_snapshot.path,
    );
    expect(remediationBytes.byteLength).toBe(
      record.post_anchor_ci_remediation.boundary_snapshot.bytes,
    );
    expect(sha256(remediationBytes)).toBe(
      record.post_anchor_ci_remediation.boundary_snapshot.sha256,
    );

    expect(
      record.legacy_pr504_publication.edited_by_this_publication_candidate,
    ).toBe(false);
    for (const entry of record.legacy_pr504_publication.artifacts as {
      path: string;
      bytes: number;
      sha256: string;
    }[]) {
      const bytes = raw(entry.path);
      expect(bytes.byteLength, entry.path).toBe(entry.bytes);
      expect(sha256(bytes), entry.path).toBe(entry.sha256);
    }
  });

  it("pins transaction order, exact-plan ambiguity, immutable outbox, expiry retry, and generation STOP", () => {
    const record = evidence();
    const source = read(serviceSourceRelative);
    const tests = read(serviceTestsRelative);
    const advance = source.slice(
      source.indexOf("private func handleNewAdvance("),
      source.indexOf("private func receiptForInitialRetry("),
    );
    const orderedMarkers = [
      "let currentSHA256",
      "let preparedReceipt = try prepareFreshReceipt(",
      "let operation =",
      "let plan = DurableRemoteWitnessCommitPlanV1(",
      "for _ in 0..<Self.maximumExactCommitAttempts",
      "switch try commit(plan)",
      "let reconciled = try transactionalRead(",
      "return try requireStoredReceiptFresh(",
    ];
    let previous = -1;
    for (const marker of orderedMarkers) {
      const index = advance.indexOf(marker);
      expect(index, marker).toBeGreaterThan(previous);
      previous = index;
    }

    expect(source).toContain("maximumAcceptedOperationCount = 4_096");
    expect(source).toContain("maximumJournalSequence: UInt64 = 4_096");
    expect(source).toContain("maximumExactCommitAttempts = 3");
    expect(source).toContain("for _ in 0..<Self.maximumExactCommitAttempts");
    expect(source).toContain("case .ambiguous, .transientConflict:");
    expect(source).toContain("case .definitiveCASLoss:");
    expect(source).toContain("case .committed:");
    expect(source).toContain("immutableInitialReceipt");
    expect(source).toContain("storeGenerationID");
    expect(source).toContain("observedStoreGenerationID");
    expect(source).toContain('Array("FGV7DEI1".utf8)');
    expect(source).toContain(
      "endpointBindingDomain\n                    + witnessID.bytes\n                    + storeGenerationID.bytes",
    );
    expect(source).toContain(
      "snapshot.currentCheckpoint,\n                current: operation.acceptedCheckpoint",
    );
    expect(source).toContain("issueLinearizableStateReceipt(");
    expect(source).toContain("finishPreparedReceipt(");
    expect(source).toContain("notBeforeUnixSeconds");
    expect(source).toContain("!= request.expectedCheckpointSHA256");
    expect(source).toContain("!= request.canonicalSHA256()");
    expect(source).toContain("candidateAttemptAlias");
    expect(tests.match(/^\s*func test/gmu)).toHaveLength(23);
    for (const testName of [
      "testQueryStopsIfStateAdvancesAfterSigningBeforeRevalidation",
      "testRejectedAdvanceStopsIfStateChangesBeforeRevalidation",
      "testTransientConflictResendsOnlyTheExactPlan",
      "testConcurrentExactRequestReturnsDurableWinnerReceipt",
      "testDefinitiveDifferentForkCASLossReturnsRevalidatedRejection",
      "testRepeatedAmbiguityStopsWithoutInferringAbsent",
      "testExpiredDelayedRetryGetsFreshReceiptWithoutWrite",
      "testExpiredRetryRevalidatesDurableOperationAfterSigning",
      "testInitialRetryStopsForForkedCurrentState",
      "testInitialRetryStopsForDirectAndMultiStepDivergentForks",
      "testCommitCanPersistButExpiredResponseStopsUntilRetry",
      "testClockRollbackAfterCommitStopsTheResponse",
      "testClockRollbackWhileRefreshingExpiredReceiptStops",
      "testQueryOnlyAdvanceAndWrongGenerationStopBeforeSigning",
      "testWrongSignerAliasedIdentityAndEndpointGenerationReuseStop",
    ]) {
      expect(tests).toContain(testName);
    }

    expect(record.transaction_contract.commit_plan_fields).toEqual([
      "exactAttemptID",
      "deploymentIdentity",
      "expectedCheckpointSHA256",
      "expectedAcceptedOperationCount",
      "replacementCheckpoint",
      "createOnlyOperation",
    ]);
    expect(
      record.transaction_contract.exact_attempt_id_rejected_aliases,
    ).toEqual([
      "operationID",
      "clientNonce",
      "witnessID",
      "endpointID",
      "witnessSignerKeyID",
      "storeGenerationID",
      "expectedCheckpointSHA256",
      "candidateCheckpointSHA256",
      "requestSHA256",
    ]);
    expect(record.ambiguous_commit).toMatchObject({
      same_exact_plan_resent: true,
      transient_conflict_same_exact_plan_resent: true,
      receipt_resigned_between_ambiguous_attempts: false,
      maximum_attempts: 3,
      three_ambiguous_results: "STOP-WITHOUT-INFERRING-ABSENCE",
      definitive_cas_loss_same_request_winner:
        "RETURN-ONLY-DURABLE-WINNER-RECEIPT",
      definitive_cas_loss_different_fork:
        "RETURN-FRESH-REJECTION-ONLY-AFTER-EXACT-POST-SIGN-STATE-REVALIDATION",
    });
    expect(record.immutable_receipt_outbox).toMatchObject({
      contract_present: true,
      durable_provider_implemented: false,
      initial_receipt_in_same_abstract_commit_plan_as_checkpoint: true,
      response_before_commit: false,
      response_before_durable_reconciliation: false,
      initial_and_expired_retry_require_matching_operation_state_lineage: true,
      equal_sequence_requires_exact_accepted_checkpoint: true,
      direct_successor_requires_full_validate_successor_including_previous_digest: true,
      more_than_one_step_without_immutable_intermediates: "STOP",
      proof_carrying_multi_step_snapshot_present: false,
      maximum_retry_lineage_distance_without_intermediate_proof: 1,
    });
    expect(record.expiry_retry).toMatchObject({
      receipt_maximum_lifetime_seconds: 30,
      expired_initial_receipt_changes_stored_operation: false,
      expired_exact_retry_signs_fresh_receipt_for_accepted_checkpoint: true,
      expired_exact_retry_post_sign_transactional_reread: true,
      expired_exact_retry_requires_same_immutable_operation_and_observed_generation: true,
      expired_exact_retry_commits: false,
      clock_samples_monotonically_chained_across_sign_commit_reconcile_and_response: true,
      exact_or_direct_successor_retry_recovers_with_fresh_receipt: true,
      more_than_one_later_advance_without_intermediate_proof: "STOP",
    });
    expect(record.restore_generation).toMatchObject({
      store_generation_id_in_fixed_deployment_identity: true,
      observed_store_generation_id_is_a_separate_snapshot_field: true,
      observed_store_generation_must_come_from_provider_metadata_independent_of_restored_data: true,
      endpoint_id_cryptographically_binds_witness_and_store_generation: true,
      endpoint_binding_domain: "FGV7DEI1",
      endpoint_id_formula: "SHA256(FGV7DEI1 || witnessID || storeGenerationID)",
      transactional_snapshot_generation_must_match: true,
      mismatch_decision: "STOP-BEFORE-SIGNING",
      restore_generation_provisioner_implemented: false,
      restore_generation_rotation_implemented: false,
      restored_table_binding_established: false,
    });
  });

  it("keeps the target outside products and production while measuring 127 Swift tests and an empty service graph", () => {
    const record = evidence();
    const packageSource = read(packageRelative);
    const source = read(serviceSourceRelative);
    const boundary = read(boundaryRelative);
    const ci = read(".github/workflows/ci.yml");

    expect(packageSource).toContain(
      'name: "FloodgateV7RemoteWitnessServiceCore"',
    );
    expect(packageSource).not.toMatch(
      /\.library\(\s*name:\s*"FloodgateV7RemoteWitnessServiceCore"/u,
    );
    expect(source.match(/^import [A-Za-z0-9_]+$/gmu)).toEqual([
      "import CryptoKit",
      "import Foundation",
      "import FloodgateV7ExternalTrustRootProtocol",
    ]);
    expect(source).not.toMatch(
      /^\s*(?:public|open|package)\s+(?:class|enum|func|let|protocol|struct|typealias|var)\b/gmu,
    );
    for (const marker of [
      "DynamoDB",
      "URLSession",
      "FileManager",
      "ProcessInfo",
      "UserDefaults",
      "getenv(",
      "import AWS",
      "import Darwin",
      "import Glibc",
    ]) {
      expect(source).not.toContain(marker);
    }
    expect(boundary).toContain(
      "service-core must not be published as a product",
    );
    expect(boundary).toContain(
      "service-core is reachable from a non-test target",
    );
    expect(boundary).toContain(
      "service-core public/SPI symbol graph is not exactly ",
    );
    expect(boundary).toContain(
      "expected at least one generated service-core symbol graph",
    );
    expect(boundary).toContain("SYMBOL_GRAPH_SHARD_PATTERN");
    expect(boundary).toContain("run_synthetic_shard_regression_checks");
    expect(boundary).toContain("run_synthetic_source_regression_checks");
    expect(boundary).toContain("EXPOSED_SOURCE_DECLARATION_PATTERN");
    expect(boundary).toContain('"@_documentation"');
    expect(boundary).toContain(
      'shard_name = f"{SERVICE_TARGET}@Swift.symbols.json"',
    );
    expect(boundary).toContain(
      'other_shard_name = f"{SERVICE_TARGET}@Other.symbols.json"',
    );
    expect(boundary).toContain(
      "unknown matching service-core symbol graph filename",
    );
    expect(boundary).toContain(
      "service-core exposes a public, open, or package declaration",
    );
    expect(boundary).toContain(
      "(?:class|enum|extension|func|let|protocol|struct|typealias|var)",
    );
    expect(boundary).toContain('.rglob("*.swift")');
    expect(ci).toContain("verify-remote-witness-service-core-boundary.py");
    expect(ci).toContain("FloodgateV7RemoteWitnessServiceCore*.symbols.json");

    expect(record.validation.swift_package_tests).toMatchObject({
      status: "PASS",
      tests_present: 127,
      tests_passed: 127,
      tests_failed: 0,
      service_core_tests_present: 23,
      service_core_tests_passed: 23,
      service_core_tests_failed: 0,
    });
    expect(record.validation.swift_release_build).toMatchObject({
      status: "PASS",
      swift_reported_seconds: 0.21,
      wall_seconds: 0.38,
    });
    expect(record.validation.local_service_symbol_graph).toMatchObject({
      status: "PASS",
      measurement_kind: "MEASURED-LOCAL-ONLY",
      symbols: 0,
      relationships: 0,
    });
    expect(record.validation.service_boundary_script).toEqual({
      status: "PASS",
      products: 0,
      external_dependencies: 0,
      production_consumers: 0,
      public_or_spi_symbols: 0,
      all_discovered_symbol_graphs_verified: true,
      base_and_extension_shards_verified: true,
      exact_module_name_required: true,
      empty_extension_shard_accepted: true,
      nonempty_extension_shard_rejected: true,
      unknown_matching_filename_rejected: true,
      actual_swift_5_10_extension_shard_probe: true,
      attribute_prefixed_public_declaration_rejected: true,
      documentation_visibility_suppression_rejected: true,
      separate_client_access_escape_probe: true,
      wall_seconds: 0.49,
    });
  });

  it("keeps bilingual provider context and the next operational gates fail closed", () => {
    const record = evidence();
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);
    const expectedSections = Array.from({ length: 8 }, (_, index) => index + 1);

    expect(numberedSections(japanese)).toEqual(expectedSections);
    expect(numberedSections(english)).toEqual(expectedSections);
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-durable-witness-service-core.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-durable-witness-service-core.md",
    );
    for (const marker of [
      "UNAVAILABLE / STOP",
      "127 / 127",
      "23 / 23",
      "storeGenerationID",
      "observedStoreGenerationID",
      "FGV7DEI1",
      "previousWitnessedCheckpointSHA256",
      "immutableInitialReceipt",
      "definitiveCASLoss",
      "0 public / SPI",
      "@_documentation",
      "@Module",
      "post-anchor",
      "DynamoDB",
      "KMS",
      "live weights",
    ]) {
      expect(japanese, marker).toContain(marker);
      expect(english, marker).toContain(marker);
    }
    for (const url of Object.values(
      record.provider_context.official_primary_docs,
    ) as string[]) {
      expect(japanese, url).toContain(url);
      expect(english, url).toContain(url);
    }
    expect(record.provider_context).toMatchObject({
      provider_selected: false,
      adapter_implemented: false,
      aws_resources_created: 0,
      dynamodb_transaction_client_token_replaces_service_operation_ledger: false,
      dynamodb_restore_creates_new_table: true,
    });

    const gates = record.next_gates as string[];
    expect(gates[0]).toBe("post-anchor-ci-remediation-exact-review");
    expect(
      gates.indexOf("fixed-provider-adapter-and-atomic-durable-store"),
    ).toBeLessThan(gates.indexOf("teacher-prefix-100"));
    expect(gates.indexOf("teacher-prefix-100")).toBeLessThan(
      gates.indexOf("teacher-prefix-500"),
    );
    expect(gates.indexOf("teacher-prefix-500")).toBeLessThan(
      gates.indexOf("teacher-24000"),
    );
    expect(gates.at(-1)).toBe("evidence-gated-live-weight-change");
  });
});
