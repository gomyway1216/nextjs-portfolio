import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const EVIDENCE = path.join(
  ROOT,
  "docs/data/shogi-external-81dojo-calibration-readiness-2026-07-20.json",
);
const POLICY = path.join(
  ROOT,
  "ml/protocols/floodgate-q1-2026-external-81dojo-calibration-policy.json",
);
const VERIFIER = path.join(ROOT, "ml/external_81dojo_calibration.py");
const JAPANESE = path.join(
  ROOT,
  "docs/blog-shogi-external-81dojo-calibration-readiness.md",
);
const ENGLISH = path.join(
  ROOT,
  "docs/blog-shogi-external-81dojo-calibration-readiness.en.md",
);

function read(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("external 81Dojo calibration readiness publication", () => {
  it("binds the exact policy, calibration verifier, and fixture tests", () => {
    const evidence = JSON.parse(read(EVIDENCE));

    expect(evidence).toMatchObject({
      schema: "shogi-external-81dojo-calibration-readiness-evidence-v1",
      recorded_date: "2026-07-20",
      status: "READY_FOR_CANDIDATE_BINDING_NOT_EXTERNAL_EXECUTION",
      implementation_anchor: {
        revision: "86b1d9e30dda4326bf67fbc1b82f8db23b94f6fb",
        tree: "c478fab41badaf1191c1003375ac9a5d35badffd",
        base_revision: "bae76159216bb46897adf94b1d062c0417fd239c",
        branch: "codex/shogi-81dojo-calibration-protocol",
      },
    });
    for (const artifact of Object.values(
      evidence.implementation_artifacts,
    ) as Array<{ path: string; bytes: number; sha256: string }>) {
      const bytes = fs.readFileSync(path.join(ROOT, artifact.path));
      expect(bytes.byteLength).toBe(artifact.bytes);
      expect(sha256(bytes)).toBe(artifact.sha256);
    }
    expect(evidence.validation).toMatchObject({
      focused_tests_passed: 23,
      focused_tests_failed: 0,
      focused_duration_seconds: 30.417,
      independent_review_round_blockers_addressed: [5, 6],
      independent_review_blockers_addressed_total: 11,
      final_bounded_rereview_tests_passed: 9,
      final_bounded_rereview_p0: 0,
      final_bounded_rereview_p1: 0,
      final_bounded_rereview_p2: 0,
      live_network_calls_in_python_fixtures: 0,
    });
  });

  it("matches the fixed external protocol and keeps execution closed", () => {
    const evidence = JSON.parse(read(EVIDENCE));
    const policy = JSON.parse(read(POLICY));

    expect(evidence.official_sources).toEqual(policy.official_sources);
    expect(evidence.fixed_external_protocol).toMatchObject({
      platform: "81Dojo",
      official_com_account_prefix: "COM_",
      official_client_only: true,
      relay: "manual-official-client-only",
      external_server_or_ui_automation: false,
      rated: true,
      initial_position: "hirate",
      main_minutes: 10,
      byoyomi_seconds: 30,
      split_time_seconds: 0,
      rating_coefficient_reference: "1.0",
      pairing: "official-auto-match",
      selected_opponents: false,
      games: 200,
    });
    expect(evidence.authorization_boundary).toEqual({
      external_execution_authorized: false,
      external_write_authorized: false,
      "81dojo_server_api_access_authorized": false,
      public_github_read_only_publication_verification_enabled: true,
      github_credential_access_authorized: false,
      browser_or_ui_automation_authorized: false,
      credential_access_authorized: false,
      manual_official_client_relay_authorized: false,
      live_weight_write_authorized: false,
      promotion_authorized: false,
    });
    expect(evidence.current_state).toMatchObject({
      candidate_selected: false,
      candidate_runtime_bound: false,
      internal_gates_passed: false,
      user_external_authorization_recorded: false,
      candidate_core_publication_merged_to_main: false,
      candidate_core_publication_independently_verified: false,
      external_games_observed: 0,
      ledger_entries: 0,
      complete_receipts: 0,
    });
    expect(evidence.candidate_runtime_binding).toMatchObject({
      public_merged_main_data_only_core_commitment_required_before_game_1: true,
      self_asserted_assembly_time_is_preregistration_proof: false,
      trace_receipt_schema: "shogi-external-81dojo-candidate-trace-v2",
      runtime_and_every_decision_are_exact_canonical_content_receipts: true,
      outer_wrapper_relabel_cannot_reuse_nested_receipt_bytes: true,
    });
    expect(evidence.preregistration_publication_contract).toMatchObject({
      protocol_core_schema: "shogi-external-81dojo-candidate-protocol-core-v1",
      data_only_document_schema:
        "shogi-external-81dojo-protocol-publication-document-v1",
      merged_main_binding_schema:
        "shogi-external-81dojo-merged-main-publication-binding-v1",
      github_verification_schema:
        "shogi-external-81dojo-github-publication-verification-v1",
      branch: "main",
      server_branch_ref: "refs/heads/main",
      fixed_api_host: "api.github.com",
      network_method: "read-only-public-GET",
      authorization_header_or_token_used: false,
      document_binds_exact_protocol_core_sha256: true,
      github_pr_must_be_server_reported_merged_to_exact_repository_main: true,
      github_server_merged_at_and_merge_commit_sha_required: true,
      live_main_must_descend_from_recorded_head_and_merge_commit: true,
      github_commit_tree_and_contents_path_blob_bytes_required: true,
      local_git_revision_tree_blob_and_bytes_cross_checked: true,
      local_origin_ref_or_committer_time_alone_is_proof: false,
      terminal_receipt_live_reverifies_github: true,
      game_1_must_follow_merge_and_protocol_assembly: true,
      fail_closed_if_github_cannot_be_reverified_at_finalization: true,
    });
    expect(evidence.ledger_and_receipt).toMatchObject({
      authoritative_storage: "immutable-entry-directory-v1",
      jsonl_role: "derived-view-only",
      every_game_timestamp_after_merged_publication_and_protocol_assembly: true,
      atomic_nofollow_required_for_local_append: true,
      descriptor_relative_walk_rejects_every_symlink_component: true,
      opened_root_lock_and_entries_inode_binding_reverified: true,
      first_namespace_parent_lock_root_and_entries_fsync_ordered: true,
      whole_candidate_prefix_validated_before_any_temp_write: true,
      temp_fsync_exclusive_link_publish_directory_fsync: true,
      partial_temp_write_is_not_authoritative: true,
      exact_retry_after_commit_is_idempotent: true,
      terminal_receipt_accepts_only_locked_authoritative_directory: true,
      terminal_receipt_binds_full_file_identity_and_content_manifest: true,
      arbitrary_jsonl_cannot_issue_terminal_receipt: true,
    });
    expect(policy.ledger_contract).toMatchObject({
      authoritative_storage: "immutable-entry-directory-v1",
      public_merged_main_protocol_commitment_before_game_1: true,
      self_asserted_timestamp_is_not_preregistration_proof: true,
      github_api_tls_pr_merge_time_main_ancestry_tree_blob_path_bytes: true,
      local_git_object_tree_blob_cross_check: true,
      terminal_receipt_reverifies_live_github_publication: true,
    });
  });

  it("uses the rating-stability rule as primary and bootstrap as auxiliary", () => {
    const evidence = JSON.parse(read(EVIDENCE));

    expect(evidence.primary_decision).toMatchObject({
      authority: "primary",
      required_games: 200,
      stability_window_games_inclusive: [171, 200],
      minimum_post_game_rating: 2050,
      every_post_game_rating_in_window_must_pass: true,
      missing_game: "STOP",
      selected_opponent: "STOP",
      technical_fault: "STOP",
      candidate_trace_mismatch: "STOP",
    });
    expect(evidence.auxiliary_statistics).toMatchObject({
      authority: "report-only-never-primary",
      method: "opponent-identity-cluster-percentile-bootstrap",
      seed: 20260720,
      replicates: 100000,
      confidence: "two-sided-95-percent",
      cluster_totals_and_sizes_precomputed: true,
      rank_conversion: false,
      can_override_primary_decision: false,
    });
  });

  it("publishes zero external activity and no unsupported strength claim", () => {
    const evidence = JSON.parse(read(EVIDENCE));
    const verifier = read(VERIFIER);
    const japaneseText = read(JAPANESE);
    const englishText = read(ENGLISH);

    expect(
      Object.values(evidence.calibration_execution_counters).every(
        (value) => value === 0,
      ),
    ).toBe(true);
    expect(evidence.repository_delivery).toMatchObject({
      pull_request_created: true,
      pull_request_number: 567,
      pull_request_ready_for_review: true,
      automatic_vercel_preview_triggered_by_existing_repository_integration: true,
      vercel_preview_is_calibration_execution: false,
      vercel_preview_status_is_not_a_calibration_gate: true,
      calibration_games_or_credentials_sent_to_preview: false,
    });
    expect(
      Object.values(evidence.nonclaims).every((value) => value === false),
    ).toBe(true);
    expect(verifier).not.toMatch(
      /^\s*(?:from|import)\s+(?:boto|google|requests|selenium|playwright|webbrowser)\b/mu,
    );
    expect(verifier).toContain("http.client.HTTPSConnection");
    expect(verifier).toContain('PUBLIC_GITHUB_API_HOST = "api.github.com"');
    expect(verifier).toContain('"GET"');
    expect(verifier).not.toContain('"Authorization"');
    expect(verifier).not.toMatch(/"(?:POST|PUT|PATCH|DELETE)"/u);
    expect(verifier).toContain('"/usr/bin/git"');
    expect(verifier).toContain('"--no-replace-objects"');
    expect(verifier).not.toMatch(/"(?:fetch|push|clone|ls-remote)"/u);
    expect(verifier).toContain("manual official-client relay");
    expect(verifier).toContain("O_NOFOLLOW");
    expect(verifier).toContain("_open_absolute_parent_descriptor");
    expect(verifier).toContain("AppendIndeterminateError");
    expect(verifier).toContain("authoritative_manifest");
    expect(verifier).toContain("TRACE_RECEIPT_SCHEMA");
    expect(verifier).toContain("candidate_raw = raw + encoded");
    expect(verifier).toContain("os.link(");
    expect(verifier).not.toContain("O_APPEND");
    expect(japaneseText).toContain("外部対局0局、候補未選定、実行許可なし");
    expect(japaneseText).toContain(
      "AWS、GCP、Firebase、Vercelはこの校正の計算・保存・実行には使わない",
    );
    expect(japaneseText).toContain("public GitHub APIへのread-only TLS GET");
    expect(englishText).toContain(
      "zero external games, no selected candidate, and no execution authorization",
    );
    expect(englishText).toContain(
      "AWS, GCP, Firebase, and Vercel are not used to compute, store, or execute this calibration",
    );
    expect(englishText).toContain("public read-only GitHub API TLS GET");
  });
});
