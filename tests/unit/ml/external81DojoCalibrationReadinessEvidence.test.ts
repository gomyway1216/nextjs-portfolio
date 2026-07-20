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
  it("binds the exact policy, offline verifier, and fixture tests", () => {
    const evidence = JSON.parse(read(EVIDENCE));

    expect(evidence).toMatchObject({
      schema: "shogi-external-81dojo-calibration-readiness-evidence-v1",
      recorded_date: "2026-07-20",
      status: "READY_FOR_CANDIDATE_BINDING_NOT_EXTERNAL_EXECUTION",
      implementation_anchor: {
        revision: "06ee2a14ffd1e56f3db2c65cd5f4984785ef336f",
        tree: "fc554c228c8d0f2d7f9760a0f223afa5045821a0",
        base_revision: "5ce9efb34613a86b5f881ae97d182b1e69cfca59",
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
      server_api_access_authorized: false,
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
      trace_binds_protocol_candidate_runtime_server_game_and_server_record: true,
    });
    expect(evidence.preregistration_publication_contract).toMatchObject({
      protocol_core_schema: "shogi-external-81dojo-candidate-protocol-core-v1",
      data_only_document_schema:
        "shogi-external-81dojo-protocol-publication-document-v1",
      merged_main_binding_schema:
        "shogi-external-81dojo-merged-main-publication-binding-v1",
      branch: "main",
      document_binds_exact_protocol_core_sha256: true,
      game_1_must_follow_merge_and_protocol_assembly: true,
      offline_verifier_independently_proves_remote_merge: false,
      independent_public_commit_check_required: true,
    });
    expect(evidence.ledger_and_receipt).toMatchObject({
      authoritative_storage: "immutable-entry-directory-v1",
      jsonl_role: "derived-view-only",
      every_game_timestamp_after_merged_publication_and_protocol_assembly: true,
      atomic_nofollow_required_for_local_append: true,
      every_existing_ancestor_symlink_rejected: true,
      whole_candidate_prefix_validated_before_any_temp_write: true,
      temp_fsync_exclusive_link_publish_directory_fsync: true,
      partial_temp_write_is_not_authoritative: true,
    });
    expect(policy.ledger_contract).toMatchObject({
      authoritative_storage: "immutable-entry-directory-v1",
      public_merged_main_protocol_commitment_before_game_1: true,
      self_asserted_timestamp_is_not_preregistration_proof: true,
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
      calibration_games_or_credentials_sent_to_preview: false,
    });
    expect(
      Object.values(evidence.nonclaims).every((value) => value === false),
    ).toBe(true);
    expect(verifier).not.toMatch(
      /^\s*(?:from|import)\s+(?:boto|google|requests|selenium|playwright|socket|urllib|webbrowser)\b/mu,
    );
    expect(verifier).not.toMatch(/\bsubprocess\b/u);
    expect(verifier).toContain("manual official-client relay");
    expect(verifier).toContain("O_NOFOLLOW");
    expect(verifier).toContain("candidate_raw = raw + encoded");
    expect(verifier).toContain("os.link(");
    expect(verifier).not.toContain("O_APPEND");
    expect(japaneseText).toContain("外部対局0局、候補未選定、実行許可なし");
    expect(japaneseText).toContain(
      "AWS、GCP、Firebase、Vercelはこの校正には使わない",
    );
    expect(englishText).toContain(
      "zero external games, no selected candidate, and no execution authorization",
    );
    expect(englishText).toContain(
      "AWS, GCP, Firebase, and Vercel are not used for this calibration",
    );
  });
});
