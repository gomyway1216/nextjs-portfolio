import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../../..");
const evidencePath = path.join(
  repositoryRoot,
  "docs/data/floodgate-raw-authentication-worker-production-2026-07-19.json",
);
const japanesePath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-raw-authentication-worker-production.md",
);
const englishPath = path.join(
  repositoryRoot,
  "docs/blog-shogi-floodgate-raw-authentication-worker-production.en.md",
);

function evidence(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(evidencePath, "utf8")) as Record<
    string,
    unknown
  >;
}

function objectField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): Record<string, unknown> {
  const candidate = value[key];
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    Array.isArray(candidate)
  ) {
    throw new Error(`expected ${key} to be an object`);
  }
  return candidate as Record<string, unknown>;
}

function numberField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): number {
  const candidate = value[key];
  if (typeof candidate !== "number") {
    throw new Error(`expected ${key} to be numeric`);
  }
  return candidate;
}

describe("Floodgate production raw-authentication worker evidence", () => {
  it("binds the self-contained worker and current loaded-source closure", () => {
    expect(evidence()).toMatchObject({
      schema:
        "shogi-floodgate-raw-authentication-worker-production-evidence-v1",
      status:
        "production-raw-authentication-wired-and-real-full-pass-exactly-equivalent-formal-and-live-unchanged",
      scope: {
        production_raw_verifier_wired: true,
        production_workers: 12,
        formal_teacher_namespace_touched: false,
        teacher_generation_started_by_this_change: false,
        training_started_by_this_change: false,
        live_weight_changes: 0,
        runtime_network_used: false,
        aws_used: false,
        gcp_or_firebase_used: false,
        vercel_compute_used: false,
      },
      worker_source_closure: {
        bundle_schema: "shogi-floodgate-raw-verification-worker-bundle-v1",
        bundle_path: "ml/floodgate-raw-verification-worker.cjs",
        bundle_bytes: 54297,
        bundle_sha256:
          "21e96f036d663d4ffea2f90abf49d638958e7798950f0e72dfce7286fb525f09",
        external_runtime_dependencies: "node-builtins-only",
        typescript_or_tsx_loaded_after_spawn: false,
        worker_started_from_verified_in_memory_source: true,
        worker_exec_argv: [],
        required_node_version: "v22.13.0",
        bundle_file_descriptor_held_until_all_workers_exit: true,
        symlink_rejected: true,
        path_swap_rejected: true,
        in_place_mutation_and_restore_rejected: true,
        parent_directory_churn_rejected: true,
        loaded_source_exact_clean_revision_captured_before_spawn: true,
        same_loaded_source_revision_reverified_after_all_workers_exit: true,
        tracked_bundle_rebuild_checked_in_normal_unit_validation: true,
      },
      source_authority_separation: {
        historical_semantic_verifier_revision:
          "e8a9197608cb48b1160b6707d97b0c4f78f90a1d",
        historical_semantic_verifier_root_is_worker_source_root: false,
        distinct_root_and_revision_integration_test_passed: true,
      },
      worker_policy: {
        workers: 12,
        one_active_task_per_worker: true,
        input_ordered_result_merge: true,
        lowest_input_index_failure_wins: true,
        task_timeout_ms: 60000,
        shutdown_timeout_ms: 5000,
        raw_bytes_cross_worker_boundary: false,
      },
    });
  });

  it("records the accepted real full-pass arithmetic and exact equivalence", () => {
    const record = evidence();
    const measured = objectField(record, "real_full_raw_pass");
    const serial = objectField(measured, "serial");
    const parallel = objectField(measured, "production_12_worker");
    const serialMs = numberField(serial, "elapsed_ms");
    const parallelMs = numberField(parallel, "elapsed_ms");
    expect(measured).toMatchObject({
      tasks: 36349,
      order: ["serial", "source-closed-production-12-worker"],
      speedup: 2.0220494834682516,
      saved_ms_per_pass: 16025.661375999998,
      report_deep_strict_equality: true,
      candidate_manifest_serialization_equivalence: true,
      raw_manifest_bytes_unchanged: true,
      private_paths_urls_receipts_or_digests_published: false,
    });
    expect(numberField(measured, "speedup")).toBeCloseTo(
      serialMs / parallelMs,
      14,
    );
    expect(numberField(measured, "saved_ms_per_pass")).toBeCloseTo(
      serialMs - parallelMs,
      10,
    );
    expect(numberField(serial, "observed_peak_rss_bytes")).toBe(355041280);
    expect(numberField(parallel, "observed_peak_rss_bytes")).toBe(754171904);
  });

  it("labels the four-pass value as a projection and rejects the broken timer", () => {
    const record = evidence();
    const measured = objectField(record, "real_full_raw_pass");
    const projection = objectField(
      record,
      "effect_on_historical_full_authentication",
    );
    expect(projection).toMatchObject({
      historical_elapsed_ms: 1088743,
      raw_passes: 4,
      projected_saved_ms_if_all_four_passes_match_the_measured_production_gain: 64102.64550399999,
      projected_elapsed_ms: 1024640.354496,
      projection_not_a_measured_full_authentication: true,
      full_authentication_deliberately_not_duplicated: true,
      serial_floor_if_raw_verification_were_free_ms: 961920.646164,
    });
    expect(
      numberField(
        projection,
        "projected_saved_ms_if_all_four_passes_match_the_measured_production_gain",
      ),
    ).toBeCloseTo(numberField(measured, "saved_ms_per_pass") * 4, 10);
    expect(numberField(projection, "projected_elapsed_ms")).toBeCloseTo(
      numberField(projection, "historical_elapsed_ms") -
        numberField(
          projection,
          "projected_saved_ms_if_all_four_passes_match_the_measured_production_gain",
        ),
      10,
    );
    expect(record.excluded_measurements).toEqual([
      expect.objectContaining({
        name: "reverse-order-inline-timer-attempt",
        operations_completed: true,
        report_deep_strict_equality: true,
        raw_manifest_bytes_unchanged: true,
        timings_accepted: false,
      }),
    ]);
  });

  it("publishes matching Japanese and English boundaries without private data", () => {
    const japanese = fs.readFileSync(japanesePath, "utf8");
    const english = fs.readFileSync(englishPath, "utf8");
    for (const article of [japanese, english]) {
      for (const value of [
        "36,349",
        "31,705.588",
        "15,679.927",
        "2.022",
        "16,025.661",
        "64.102",
        "17.08",
        "12",
        "v22.13.0",
        "e8a919",
        "source",
        "formal",
        "live",
      ]) {
        expect(article).toContain(value);
      }
      expect(article).not.toMatch(
        /(?:\/Users\/|\/private\/|parent_sfen|secret-(?:game|parent|position))/iu,
      );
    }
    expect(JSON.stringify(evidence())).not.toMatch(
      /(?:\/Users\/|\/private\/|parent_sfen|secret-(?:game|parent|position))/iu,
    );
  });
});
