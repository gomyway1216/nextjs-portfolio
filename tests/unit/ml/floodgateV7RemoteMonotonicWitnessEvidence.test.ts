import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const moduleRelative = "native/floodgate-v7-external-trust-root-protocol";
const sourceRelative = `${moduleRelative}/Sources/FloodgateV7ExternalTrustRootProtocol`;
const evidenceRelative =
  "docs/data/floodgate-v7-remote-monotonic-witness-2026-07-18.json";
const fixtureRelative =
  "tests/fixtures/floodgate-v7-remote-monotonic-witness-golden-v1.json";
const japaneseArticleRelative =
  "docs/blog-shogi-floodgate-v7-remote-monotonic-witness.md";
const englishArticleRelative =
  "docs/blog-shogi-floodgate-v7-remote-monotonic-witness.en.md";

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

describe("Floodgate v7 remote monotonic witness evidence boundary", () => {
  it("pins the reviewed implementation commit while every production counter stays zero", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    expect(evidence).toMatchObject({
      schema: "shogi-floodgate-v7-remote-monotonic-witness-evidence-v1",
      evidence_date: "2026-07-18",
      evidence_timezone: "America/Los_Angeles",
      revision: {
        merge_base_revision: "62e5d944cf8c605e705f491bb5fcfcfb5fadbe8c",
        implementation_revision: "b6bc5146f7512db9653a7e04aacaf363f65e3735",
        implementation_tree: "d448abfc901cbf0570d43adfb50768c52e244282",
        latest_main_revision_integrated:
          "bb08e6019b1a42f631be06e400df01b1baf336f4",
        integration_merge_revision: "92f3f5850c2896fb4194a1d4b885ec9e378a75b6",
        implementation_exact_commit_review: "PASS",
        implementation_exact_commit_reviewers: 2,
        implementation_exact_commit_findings: {
          p0: 0,
          p1: 0,
          p2: 0,
        },
        publication_revision: null,
        publication_tree: null,
        pull_request: null,
        continuous_integration: "PENDING",
      },
      scope: {
        status: "UNAVAILABLE",
        operational_decision: "STOP",
        source_and_test_boundary_only: true,
        provider_neutral_wire_protocol_source_present: true,
        reference_in_memory_state_machine_source_present: true,
        internal_local_comparison_gate_source_present: true,
        production_network_transport_present: false,
        durable_remote_provider_present: false,
        production_witness_key_present: false,
        production_advance_authorization_present: false,
        production_entrypoint_available: false,
        production_execution_performed: false,
        live_evaluator_changed: false,
      },
    });
    expect(evidence.scope).toEqual({
      status: "UNAVAILABLE",
      operational_decision: "STOP",
      source_and_test_boundary_only: true,
      provider_neutral_wire_protocol_source_present: true,
      reference_in_memory_state_machine_source_present: true,
      internal_local_comparison_gate_source_present: true,
      production_network_transport_present: false,
      durable_remote_provider_present: false,
      production_witness_key_present: false,
      production_advance_authorization_present: false,
      production_entrypoint_available: false,
      production_execution_performed: false,
      live_evaluator_changed: false,
    });
    expect(evidence.production_counters).toEqual({
      remote_endpoints_created: 0,
      remote_database_tables_created: 0,
      production_witness_keys_created: 0,
      production_network_requests: 0,
      root_state_reads: 0,
      root_state_writes: 0,
      writer_runs: 0,
      provisioner_runs: 0,
      inspector_runs: 0,
      teacher_positions_generated: 0,
      training_runs: 0,
      formal_ab_games: 0,
      external_calibration_games: 0,
      live_weight_changes: 0,
    });
    expect(evidence.completed_prerequisites).toEqual({
      authority_evidence_post_merge_fix_pull_request: 503,
      authority_evidence_post_merge_fix_state: "MERGED",
      authority_evidence_post_merge_fix_merge_revision:
        "bb08e6019b1a42f631be06e400df01b1baf336f4",
      merge_method: "regular-merge-commit",
    });
    expect(evidence.nonclaims).toEqual({
      restart_persistent_remote_rollback_protection_established: false,
      offline_rollback_excluded: false,
      malicious_witness_signer_excluded: false,
      split_view_excluded: false,
      provider_operator_and_signer_collusion_excluded: false,
      durable_transactional_receipt_outbox_implemented: false,
      advance_authentication_and_authorization_implemented: false,
      fixed_tls_endpoint_and_key_pinning_implemented: false,
      root_owned_writer_implemented: false,
      production_inspector_implemented: false,
      teacher_dataset_created: false,
      training_completed: false,
      formal_ab_completed: false,
      external_calibration_completed: false,
      playing_strength_improved: false,
      stable_high_dan_established: false,
      live_weight_changed: false,
    });

    expect(
      gitOutput([
        "--no-replace-objects",
        "rev-parse",
        `${evidence.revision.implementation_revision}^{tree}`,
      ]),
    ).toBe(evidence.revision.implementation_tree);
    expect(
      gitOutput([
        "--no-replace-objects",
        "rev-parse",
        `${evidence.revision.implementation_revision}^`,
      ]),
    ).toBe(evidence.revision.merge_base_revision);
    expect(
      gitOutput([
        "--no-replace-objects",
        "show",
        "-s",
        "--format=%P",
        evidence.revision.integration_merge_revision,
      ]),
    ).toBe(
      `${evidence.revision.implementation_revision} ${evidence.revision.latest_main_revision_integrated}`,
    );
    expect(
      gitOutput([
        "--no-replace-objects",
        "merge-base",
        "--is-ancestor",
        evidence.revision.integration_merge_revision,
        "HEAD",
      ]),
    ).toBe("");

    const pinnedPaths = evidence.implementation_surface
      .exact_changed_paths as string[];
    expect(pinnedPaths).toEqual([...pinnedPaths].sort());
    const committedPaths = gitOutput([
      "--no-replace-objects",
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      evidence.revision.implementation_revision,
    ])
      .split("\n")
      .filter(Boolean)
      .sort();
    expect(committedPaths).toEqual(pinnedPaths);
    for (const relativePath of pinnedPaths) {
      const currentBlob = gitOutput(["hash-object", relativePath]);
      const pinnedBlob = gitOutput([
        "--no-replace-objects",
        "rev-parse",
        `${evidence.revision.implementation_revision}:${relativePath}`,
      ]);
      expect(currentBlob, relativePath).toBe(pinnedBlob);
    }
  });

  it("binds the 212 / 418 / 530-byte facts and hashes to the independent fixture", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const fixture = JSON.parse(read(fixtureRelative));

    expect(evidence.canonical_records).toMatchObject({
      byte_order: "big-endian",
      checkpoint: {
        swift_type: "AuthorityRollbackCheckpointV1",
        magic: "FGV7ARC1",
        encoded_bytes: 212,
        golden_sha256: fixture.records.checkpoint_1.sha256,
      },
      request: {
        swift_type: "RemoteMonotonicWitnessRequestV1",
        magic: "FGV7RWR1",
        encoded_bytes: 418,
        query_zero_tail_bytes: 276,
        query_golden_sha256: fixture.records.query_request.sha256,
        advance_golden_sha256: fixture.records.advance_request.sha256,
      },
      receipt: {
        swift_type: "RemoteMonotonicWitnessReceiptV1",
        magic: "FGV7RCP1",
        encoded_bytes: 530,
        signature_payload_bytes: 466,
        signature_bytes: 64,
        maximum_lifetime_seconds: 30,
        fixed_signature_golden_sha256: fixture.records.canonical_receipt.sha256,
        signed_golden_sha256: fixture.records.signed_receipt.sha256,
      },
    });
    expect(fixture.nonclaims).toMatchObject({
      real_remote_endpoint_exists: false,
      durable_remote_state_exists: false,
      production_witness_key_exists: false,
      production_execution: false,
      live_weights_changed: false,
    });
  });

  it("pins the transaction ordering, 4096-entry ledger, and three-sample trusted clock in source", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const records = read(
      `${sourceRelative}/RemoteMonotonicWitnessRecordsV1.swift`,
    );
    const machine = read(
      `${sourceRelative}/RemoteMonotonicWitnessStateMachineV1.swift`,
    );
    const gate = read(`${sourceRelative}/RemoteMonotonicWitnessGateV1.swift`);
    const publicSurfaceGate = read(
      `${moduleRelative}/Tests/verify-public-api-symbol-graph.py`,
    );

    for (const [type, magic, byteCount] of [
      ["AuthorityRollbackCheckpointV1", "FGV7ARC1", 212],
      ["RemoteMonotonicWitnessRequestV1", "FGV7RWR1", 418],
      ["RemoteMonotonicWitnessReceiptV1", "FGV7RCP1", 530],
    ] as const) {
      expect(records).toContain(`public struct ${type}`);
      expect(records).toContain(`canonicalByteCount = ${byteCount}`);
      expect(records).toContain(`Array("${magic}".utf8)`);
    }
    expect(machine).toContain("maximumAcceptedOperationCount = 4_096");
    expect(machine).toMatch(
      /initialCheckpoint\.journalSequence\s*<= UInt64\(Self\.maximumAcceptedOperationCount\)/u,
    );
    expect(machine).toMatch(
      /candidate\.journalSequence\s*<= UInt64\(Self\.maximumAcceptedOperationCount\)/u,
    );
    expect(machine).toContain("acceptedRequestSHA256ByOperationID");
    expect(machine).toContain("case acceptedRetry");
    expect(machine).toContain("case commit");
    expect(machine.indexOf("let receipt =")).toBeLessThan(
      machine.indexOf("currentCheckpoint = candidate"),
    );
    expect(gate.match(/try trustedUnixClock\(\)/gu)).toHaveLength(3);
    expect(gate.match(/receipt\.verifiedCheckpoint\(/gu)).toHaveLength(2);
    expect(gate.indexOf("let requestStartedAtUnixSeconds")).toBeLessThan(
      gate.indexOf("let before = try store.freshSnapshot()"),
    );
    expect(gate).toContain("try store.requireUnchanged(before.token)");
    expect(
      gate.indexOf("try store.requireUnchanged(before.token)"),
    ).toBeLessThan(gate.indexOf("let completedAtUnixSeconds"));
    expect(publicSurfaceGate).toContain("ALLOWED_WITNESS_DATA_CALLABLES");
    expect(publicSurfaceGate).toContain("ALLOWED_WITNESS_DATA_PROPERTIES");
    expect(publicSurfaceGate).toContain("PROTECTED_WITNESS_PUBLIC_TYPES");
    expect(publicSurfaceGate).toContain(
      "public property exposes a protected witness type",
    );
    expect(evidence.reference_state_machine).toMatchObject({
      status: "IN-MEMORY-REFERENCE-NOT-PRODUCTION-PERSISTENCE",
      concurrent_two_fork_result: "exactly-one-accepted",
      accepted_operation_ledger_capacity: 4096,
      maximum_journal_sequence: 4096,
      maximum_new_checkpoint_commits_from_sequence_one: 4095,
      advance_to_sequence_4097: "STOP",
      delayed_exact_retry_after_intervening_advance:
        "ACCEPTED-WITH-ORIGINAL-CANDIDATE",
      accepted_operation_id_reuse_with_drift: "STOP",
      rejected_operation_ids_recorded: false,
      rejected_operation_id_later_reuse_excluded: false,
      role_alias_failure_changes_state: false,
      invalid_time_changes_state: false,
      signer_failure_changes_state: false,
      crash_durable_atomicity_established: false,
    });
    expect(evidence.local_comparison_gate).toMatchObject({
      status: "INTERNAL-TEST-ONLY-NOT-PRODUCTION-WIRED",
      request_start_clock_sampled_before_first_local_snapshot: true,
      internal_test_inputs_caller_supplied: true,
      receipt_binding_to_supplied_nonce_operation_id_and_key: true,
      clock_and_fetch_callbacks_control_test_execution: true,
      clock_and_fetch_identity_receipt_bound: false,
      nonce_unpredictability_established: false,
      production_public_key_pinning_established: false,
      receipt_checked_at_receive_and_completion: true,
      trusted_clock_samples: [
        "request-start",
        "receipt-received",
        "local-reread-complete",
      ],
      trusted_clock_rollback_decision: "STOP",
      receive_expiry_decision: "STOP",
      completion_expiry_decision: "STOP",
      remote_old_decision: "STOP",
      remote_ahead_decision: "STOP",
      same_sequence_fork_decision: "STOP",
    });
  });

  it("records measured local validation separately from the derived CI projection", () => {
    const evidence = JSON.parse(read(evidenceRelative));

    expect(evidence.validation).toMatchObject({
      node_runtime: "node-v22.13.0",
      swift_tests: {
        status: "PASS",
        tests_passed: 104,
        tests_failed: 0,
      },
      swift_release_build: "PASS",
      node_focused_tests: {
        status: "PASS",
        files_passed: 2,
        tests_passed: 9,
        tests_failed: 0,
        golden_tests_passed: 5,
        compatibility_evidence_tests_passed: 4,
      },
      signed_receipt_one_bit_mutation: {
        status: "PASS",
        byte_positions_tested: 530,
        verification_failures_expected: 530,
        unexpected_acceptances: 0,
      },
      local_public_symbol_graph: {
        status: "PASS",
        measurement_kind: "MEASURED",
        symbols: 575,
        relationships: 635,
        normalized_sha256:
          "57ff6311d811d0f4ae3459cdc65d0a87c2595f78a45d91565ba714f5c39f2461",
        semantic_gate: "PASS",
      },
      ci_public_symbol_graph_projection: {
        status: "PENDING-REMOTE-CONFIRMATION",
        measurement_kind: "DERIVED-NOT-REMOTELY-MEASURED",
        symbols: 575,
        relationships: 678,
        normalized_sha256:
          "1c7cfd318999e04a46513d96895f6b345801b948937fdc01a7064fe42d16266a",
        counted_as_ci_evidence: false,
      },
      implementation_exact_commit_review: {
        status: "PASS",
        reviewers: 2,
        p0: 0,
        p1: 0,
        p2: 0,
      },
      target_mac_compatibility_probe: "PENDING",
      continuous_integration: "PENDING",
    });
  });

  it("keeps the nine-section Japanese and English articles aligned on facts and nonclaims", () => {
    const japanese = read(japaneseArticleRelative);
    const english = read(englishArticleRelative);

    expect(numberedSections(japanese)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(numberedSections(english)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const article of [japanese, english]) {
      for (const required of [
        "UNAVAILABLE / STOP",
        "b6bc5146f7512db9653a7e04aacaf363f65e3735",
        "d448abfc901cbf0570d43adfb50768c52e244282",
        "212",
        "418",
        "530",
        "30",
        "4,096",
        "104 / 104",
        "9 / 9",
        "57ff6311d811d0f4ae3459cdc65d0a87c2595f78a45d91565ba714f5c39f2461",
        "1c7cfd318999e04a46513d96895f6b345801b948937fdc01a7064fe42d16266a",
        "derived / remote confirmation pending",
        "P0 / P1 / P2 = 0 / 0 / 0",
        "split view",
        "DynamoDB",
        "Cloudflare Durable Objects",
        "Cloud Spanner",
      ]) {
        expect(article).toContain(required);
      }
    }
    expect(japanese).toContain(
      "blog-shogi-floodgate-v7-remote-monotonic-witness.en.md",
    );
    expect(english).toContain(
      "blog-shogi-floodgate-v7-remote-monotonic-witness.md",
    );
  });

  it("orders provider deployment before teacher generation and keeps live last", () => {
    const evidence = JSON.parse(read(evidenceRelative));
    const gates = evidence.next_gates as string[];

    expect(evidence.provider_research).toEqual({
      status: "RESEARCHED-NOT-SELECTED-NOT-DEPLOYED",
      first_spike_candidate:
        "AWS-API-Gateway-Lambda-DynamoDB-strong-read-conditional-write-KMS",
      alternatives: ["Cloudflare-Durable-Objects", "Google-Cloud-Spanner"],
      single_provider_control_plane_rollback_excluded: false,
      independent_quorum_or_public_log_required_for_final_threat_model: true,
    });
    expect(gates[0]).toBe("remote-protocol-PR-CI-and-regular-merge");
    expect(gates).not.toContain("merge-PR-503-with-regular-merge-commit");
    expect(
      gates.indexOf("fixed-provider-durable-CAS-KMS-and-authorization"),
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
