import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const moduleRelative = "native/floodgate-v7-external-trust-root-protocol";
const sourceRelative = `${moduleRelative}/Sources/FloodgateV7ExternalTrustRootProtocol`;
const swiftTestRelative = `${moduleRelative}/Tests/FloodgateV7ExternalTrustRootProtocolTests`;
const evidenceRelative =
  "docs/data/floodgate-v7-authority-current-state-2026-07-18.json";
const fixtureRelative =
  "tests/fixtures/floodgate-v7-authority-current-state-golden-v1.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-authority-current-state.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-authority-current-state.en.md";
const packageRelative = `${moduleRelative}/Package.swift`;
const supervisorMainRelative = `${moduleRelative}/Sources/FloodgateV7TrustRootSupervisor/main.swift`;
const verifierMainRelative = `${moduleRelative}/Sources/FloodgateV7TrustRootVerifier/main.swift`;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function gitOutput(arguments_: string[]): string {
  return execFileSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      LANG: "C",
      LC_ALL: "C",
      NODE_ENV: "test",
      PATH: "/usr/bin:/bin",
    },
  }).trim();
}

function numberedSections(article: string): number[] {
  return Array.from(article.matchAll(/^## ([0-9]+)\. /gmu), (match) =>
    Number(match[1]),
  );
}

describe("Floodgate v7 authority current-state evidence boundary", () => {
  it("records a source-only UNAVAILABLE / STOP snapshot with every production counter at zero", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    expect(evidence).toMatchObject({
      schema: "shogi-floodgate-v7-authority-current-state-evidence-v1",
      evidence_date: "2026-07-18",
      evidence_timezone: "America/Los_Angeles",
      revision: {
        merge_base_revision: "985a09cf957af7b86fde6e8e0857dcd31f8b9d1b",
        implementation_revision: "5b7f0281811532ebb06d5c1c1f3bea2240e05b86",
        implementation_tree: "fbe47f96f06a946bc4ec44c04aadddded069c4d8",
        pull_request: null,
        implementation_exact_commit_review: "PASS",
        implementation_exact_commit_reviewers: 2,
        implementation_exact_commit_findings: {
          p0: 0,
          p1: 0,
          p2: 0,
        },
        publication_revision: "59cca9876b7114d2a728166aa6850ef58e452786",
        publication_tree: "ce63b5fd023d4c5cf89dbeab9437fee25501172f",
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
        source_and_test_boundary_only: true,
        read_only_authority_state_store_source_present: true,
        writer_source_present: false,
        provisioner_source_present: false,
        real_root_state_present: false,
        real_root_state_read: false,
        runnable_production_protocol_entrypoint_available: false,
        production_execution_performed: false,
        production_inspector_available: false,
        production_inspector_run: false,
        live_evaluator_changed: false,
      },
    });
    expect(
      Object.values(evidence.production_counters).every((value) => value === 0),
    ).toBe(true);
    expect(evidence.nonclaims).toMatchObject({
      root_owned_authority_state_provisioned: false,
      durable_writer_implemented: false,
      restart_persistent_rollback_protection_established: false,
      malicious_root_writer_excluded: false,
      offline_rollback_excluded: false,
      signed_release_artifact_installed: false,
      production_inspector_implemented: false,
      teacher_dataset_created: false,
      training_completed: false,
      formal_ab_completed: false,
      external_calibration_completed: false,
      live_weight_changed: false,
      playing_strength_improved: false,
      stable_high_dan_established: false,
    });
  });

  it("pins the fixed state root and all 76 / 112 / 200-byte record facts to the independent fixture", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const fixture = JSON.parse(read(fixtureRelative));

    expect(evidence.canonical_state_root).toMatchObject({
      path: fixture.state_root,
      fixed_in_production_source: true,
      production_owner_uid: 0,
      production_group_gid: 0,
      production_mode_octal: "0755",
      real_path_created_by_this_change: false,
      real_path_opened_by_validation: false,
    });
    expect(evidence.canonical_records).toMatchObject({
      byte_order: "big-endian",
      authority_public_key: {
        swift_type: "AuthorityPublicKeyRecordV1",
        magic: "FGV7APK1",
        encoded_bytes: 76,
      },
      activation_head_journal_header: {
        swift_type: "ActivationHeadJournalHeaderV1",
        magic: "FGV7AJH1",
        encoded_bytes: 112,
        entry_byte_count: 200,
      },
      activation_head_journal_entry: {
        swift_type: "ActivationHeadJournalEntryV1",
        magic: "FGV7AJE1",
        encoded_bytes: 200,
        first_entry_previous_digest: "SHA-256(canonical-journal-header)",
        sequence_must_equal_expected_activation_head_sequence: true,
        authority_key_id_must_equal_header_key_id: true,
      },
    });
    expect(evidence.golden_fixture).toMatchObject({
      status: "synthetic-test-only-not-operational-evidence",
      reuses_authority_public_key_exactly: true,
      reuses_expected_activation_head_v1_exactly: true,
      journal_id_hex: fixture.journal_id_derivation.journal_id_hex,
      authority_public_key_record_sha256:
        fixture.records.authority_public_key.sha256,
      journal_header_sha256:
        fixture.records.activation_head_journal_header.sha256,
      journal_entry_1_sha256:
        fixture.records.activation_head_journal_entry_1.sha256,
      independent_node_parser_reconstructs_every_byte_hash_and_offset: true,
      independent_node_parser_checks_all_cross_links: true,
      every_one_bit_exact_transcript_drift_rejected: true,
    });
    expect(evidence.validation.golden_parser_vitest).toEqual({
      status: "PASS",
      files_passed: 1,
      tests_passed: 7,
      tests_failed: 0,
    });
    expect(evidence.validation.publication_evidence_vitest).toEqual({
      status: "PASS",
      files_passed: 1,
      tests_passed: 6,
      tests_failed: 0,
    });
    expect(evidence.validation.local_public_symbol_graph).toEqual({
      status: "PASS",
      toolchain: "Xcode-15.3-Apple-Swift-5.10",
      measurement_kind: "MEASURED",
      symbols: 516,
      relationships: 570,
      normalized_sha256:
        "879f1001337dafa13f078756220990a8cb5eb106153189468f2b9ab249e1a59a",
      semantic_gate: "PASS",
    });
    expect(evidence.validation.ci_public_symbol_graph_projection).toEqual({
      status: "PENDING-REMOTE-CONFIRMATION",
      toolchain: "Xcode-26.5-Swift-6.3.2",
      measurement_kind: "DERIVED-NOT-REMOTELY-MEASURED",
      symbols: 516,
      relationships: 609,
      normalized_sha256:
        "1d2cc49fc73fb21b1b99dd8bc8d68288bebbae30c907df56436767eb0150f7ce",
      derivation:
        "previously-observed-SendableMetatype-and-Sendable-fragment-toolchain-transform",
      counted_as_ci_evidence: false,
    });
  });

  it("pins the named Swift source/tests and the conservative read-only store contract", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const canonicalSource = read(
      `${sourceRelative}/AuthorityStateCanonicalRecordsV1.swift`,
    );
    const storeSource = read(
      `${sourceRelative}/TrustRootAuthorityStateStoreV1.swift`,
    );
    const handoffSource = read(
      `${sourceRelative}/VerifierSupervisorCoreV1.swift`,
    );
    const surfaceGate = read(
      `${moduleRelative}/Tests/verify-public-api-symbol-graph.py`,
    );

    expect(evidence.implementation_surface).toMatchObject({
      source_files: [
        "AuthorityStateCanonicalRecordsV1.swift",
        "TrustRootAuthorityStateStoreV1.swift",
      ],
      test_files: [
        "AuthorityStateCanonicalRecordTests.swift",
        "TrustRootAuthorityStateStoreTests.swift",
      ],
      integration_test_files: ["AuthenticatedHandoffTests.swift"],
      integration_files: [
        "AuthenticatedProtocolStateV1.swift",
        "VerifierSupervisorCoreV1.swift",
      ],
      golden_fixture:
        "tests/fixtures/floodgate-v7-authority-current-state-golden-v1.json",
      node_golden_test:
        "tests/unit/ml/floodgateV7AuthorityCurrentStateGolden.test.ts",
      compatibility_evidence_test:
        "tests/unit/ml/floodgateV7RuntimePolicyPreimagesEvidence.test.ts",
      package_manifest_changed: false,
      supervisor_main_changed: false,
      verifier_main_changed: false,
      fixed_stop_executables_preserved: true,
    });
    for (const name of evidence.implementation_surface.source_files) {
      expect(
        fs.existsSync(path.join(repositoryRoot, sourceRelative, name)),
      ).toBe(true);
    }
    for (const name of evidence.implementation_surface.test_files) {
      expect(
        fs.existsSync(path.join(repositoryRoot, swiftTestRelative, name)),
      ).toBe(true);
    }
    for (const [type, magic, size] of [
      ["AuthorityPublicKeyRecordV1", "FGV7APK1", 76],
      ["ActivationHeadJournalHeaderV1", "FGV7AJH1", 112],
      ["ActivationHeadJournalEntryV1", "FGV7AJE1", 200],
    ] as const) {
      expect(canonicalSource).toContain(`public struct ${type}`);
      expect(canonicalSource).toContain(`canonicalByteCount = ${size}`);
      expect(canonicalSource).toContain(`Array("${magic}".utf8)`);
    }
    expect(storeSource).toContain('"/ExternalTrustRoot/v1/state"');
    expect(storeSource).toContain("LOCK_SH | LOCK_NB");
    expect(storeSource).toContain("advisory and inode-scoped");
    expect(storeSource).toContain("observeMetadataOnlyChild");
    expect(storeSource).toContain("maximumJournalEntryCount = 4_096");
    expect(storeSource).toContain("private var highWater:");
    expect(storeSource).toContain("requireNoExtendedACL");
    expect(storeSource).toContain("O_NOFOLLOW");
    expect(surfaceGate).toContain("FORBIDDEN_AUTHORITY_PARAMETER_MARKERS");
    expect(surfaceGate).toContain(
      "public callable exposes caller-injected authority state",
    );
    const publicReceiptStart = handoffSource.indexOf(
      "    public static func issueReceipt(",
    );
    const internalReceiptStart = handoffSource.indexOf(
      "\n    static func issueReceipt(",
      publicReceiptStart,
    );
    expect(publicReceiptStart).toBeGreaterThanOrEqual(0);
    expect(internalReceiptStart).toBeGreaterThan(publicReceiptStart);
    const publicReceiptWrapper = handoffSource.slice(
      publicReceiptStart,
      internalReceiptStart,
    );
    expect(publicReceiptWrapper).toContain("authorityStateStore: .production");
    expect(publicReceiptWrapper.match(/authorityStateStore:/gu)).toHaveLength(
      1,
    );
    expect(evidence.read_only_store_contract).toMatchObject({
      production_root_is_not_caller_redirectable: true,
      test_root_injection_is_internal_and_test_only: true,
      fresh_load_before_each_security_stage: true,
      unchanged_token_check_after_each_security_stage: true,
      shared_nonblocking_flock: true,
      lock_contention_decision: "STOP",
      flock_scope:
        "advisory-inode-scoped-cooperating-process-coordination-only",
      flock_is_security_boundary_against_ignoring_privileged_writer: false,
      extended_acl_object_rejected_on_every_fd_opened_node: true,
      pending_directory_mode_octal: "0700",
      pending_directory_extended_acl_inspected_by_non_root_reader: false,
      pending_directory_contents_read_by_non_root_reader: false,
      process_lifetime_high_water_sequence: true,
      process_lifetime_same_sequence_digest_pin: true,
      restart_persistent_external_anchor: false,
      restart_persistent_root_or_offline_rollback_protection: false,
    });
  });

  it("keeps Package.swift and both fixed STOP main files byte-identical to the merge base", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const mergeBase = gitOutput([
      "--no-replace-objects",
      "merge-base",
      "HEAD",
      "origin/main",
    ]);
    expect(mergeBase).toBe(evidence.revision.merge_base_revision);

    for (const relativePath of [
      packageRelative,
      supervisorMainRelative,
      verifierMainRelative,
    ]) {
      const currentBlob = gitOutput(["hash-object", relativePath]);
      const baseBlob = gitOutput(["rev-parse", `${mergeBase}:${relativePath}`]);
      expect(currentBlob, relativePath).toBe(baseBlob);
    }

    const exactMain = [
      "import Darwin",
      "",
      "private let unavailableExitCode: Int32 = 78",
      "",
      "_exit(unavailableExitCode)",
      "",
    ].join("\n");
    expect(read(supervisorMainRelative)).toBe(exactMain);
    expect(read(verifierMainRelative)).toBe(exactMain);
  });

  it("keeps the nine-section Japanese and English articles aligned on claims and open gates", () => {
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);

    expect(numberedSections(japanese)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(numberedSections(english)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const article of [japanese, english]) {
      for (const required of [
        "UNAVAILABLE / STOP",
        "/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1/state",
        "AuthorityPublicKeyRecordV1",
        "ActivationHeadJournalHeaderV1",
        "ActivationHeadJournalEntryV1",
        "ExpectedActivationHeadV1",
        "76",
        "112",
        "200",
        "4,096",
        "flock",
        "advisory",
        "inode-scoped",
        "root/offline rollback",
        "exit 78",
        "1 file / 7 tests",
        "PASS",
        "target Mac compatibility probe",
        "PENDING",
        "985a09cf957af7b86fde6e8e0857dcd31f8b9d1b",
        "879f1001337dafa13f078756220990a8cb5eb106153189468f2b9ab249e1a59a",
        "1d2cc49fc73fb21b1b99dd8bc8d68288bebbae30c907df56436767eb0150f7ce",
        "derived / remote confirmation pending",
      ]) {
        expect(article).toContain(required);
      }
    }
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-authority-current-state.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-authority-current-state.md",
    );
  });

  it("labels exclusive publication as a future writer contract rather than implementation evidence", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);

    expect(evidence.future_writer_contract).toEqual({
      status: "FROZEN-DESIGN-ONLY-NOT-IMPLEMENTED",
      per_entry_publication: true,
      same_lock_inode_exclusive_flock_required: true,
      full_state_revalidation_under_lock_required: true,
      next_contiguous_sequence_required: true,
      previous_record_digest_required: true,
      exclusive_pending_file_creation_required: true,
      exact_200_byte_write_required: true,
      file_and_directory_fsync_required: true,
      no_replace_atomic_publication_required: true,
      writer_tests_run: false,
      production_write_run: false,
    });
    expect(japanese).toContain(
      "これは**frozen future contract**であり、writer実装の成功報告ではない。",
    );
    expect(english).toContain(
      "This is a **frozen future contract**, not a successful writer implementation.",
    );
    expect(evidence.validation).toMatchObject({
      swift_tests: {
        status: "PASS",
        tests_passed: 82,
        tests_failed: 0,
        main_agent_duration_seconds: 2.61,
      },
      swift_release_build: "PASS",
      public_symbol_graph_checks: "LOCAL-PASS-REMOTE-PENDING",
      target_mac_compatibility_probe: "PENDING",
      prettier: "PASS",
      json_parse: "PASS",
      eslint_zero_errors: true,
      ml_standard_library_tests: {
        status: "PASS",
        tests_passed: 101,
        tests_failed: 0,
      },
      next_production_build: "PASS",
      full_repository_suite: {
        status: "PASS",
        files_passed: 183,
        tests_passed: 3245,
        tests_skipped: 1,
        tests_failed: 0,
        max_workers: 4,
        duration_seconds: 313.3,
      },
      continuous_integration: "PENDING",
      exact_commit_review: "IMPLEMENTATION-AND-PUBLICATION-PASS",
    });
  });
});
