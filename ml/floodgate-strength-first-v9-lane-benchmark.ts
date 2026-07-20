/**
 * Short, local-only 12-vs-13 lane throughput benchmark for the v9 teacher.
 *
 * Each trial regenerates the same 42-parent prefix in a disposable nonformal
 * stage. No teacher labels or parent identifiers are published in the receipt.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { advanceStrengthFirstSiblingTeacherDatasetCoreForTests } from "./generate-sibling-teacher";
import {
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
  loadFloodgateStrengthFirstFastTrainingInput,
  projectFloodgateStrengthFirstFastTrainingInputForTeacher,
} from "./floodgate-strength-first-fast-training-input";
import { captureFloodgateGitExactCleanRevision } from "./floodgate-git";
import { FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS } from "./floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME,
  verifyPinnedFloodgateStrengthFirstV9TeacherAuthority,
} from "./floodgate-strength-first-v9-teacher-authority";
import {
  commitFloodgateStrengthFirstTeacherPrivateJson,
  ensureFloodgateStrengthFirstTeacherPrivateDirectory,
} from "./floodgate-strength-first-teacher-runner";

export const FLOODGATE_STRENGTH_FIRST_V9_LANE_BENCHMARK_SCHEMA =
  "shogi-floodgate-strength-first-v9-lane13-benchmark-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_V9_LANE_BENCHMARK_OUTPUT_DIRECTORY =
  "floodgate-q1-2026-strength-first-v9-lane13-benchmark" as const;
const TARGET_PARENTS = 42;
const LANE_ORDER = Object.freeze([12, 13, 13, 12] as const);
const MINIMUM_13_LANE_SPEEDUP_PPM = 1_010_000;

interface Trial {
  readonly ordinal: number;
  readonly parallel_engines: 12 | 13;
  readonly elapsed_ms: number;
  readonly parents_per_second_ppm: number;
  readonly completed_parents: 42;
  readonly forced_parents_skipped: number;
  readonly emitted_parent_groups: number;
  readonly run_fingerprint: string;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

async function runTrial(
  input: ReturnType<
    typeof projectFloodgateStrengthFirstFastTrainingInputForTeacher
  >,
  revision: string,
  assetRoot: string,
  outputRoot: string,
  lanes: 12 | 13,
  ordinal: number,
): Promise<Readonly<Trial>> {
  const stageRoot = path.join(outputRoot, `disposable-${ordinal}-${lanes}`);
  await fs.promises.rm(stageRoot, { recursive: true, force: true });
  const options = {
    stageRoot,
    runnerRevision: revision,
    engineBin: path.join(assetRoot, "engine", "yaneuraou"),
    engineArgs: Object.freeze([]),
    engineReceipt: path.join(assetRoot, "engine", "yaneuraou-receipt.json"),
    authenticatedInputPolicy:
      FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
    evalDir: path.join(assetRoot, "eval"),
    multipv: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME.proposal.multipv,
    proposalDepth: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME.proposal.depth,
    depth:
      FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME.independent_rescore.depth,
    fvScale: 20,
    hashMb: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME.hash_mb_per_engine,
    timeoutMs:
      FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME.timeout_ms_per_search,
  };
  const started = performance.now();
  try {
    const outcome = await advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
      input,
      {
        ...options,
        engines: lanes,
        targetParents: TARGET_PARENTS,
        finalize: false,
      },
    );
    const elapsedMs = Math.round(performance.now() - started);
    if (
      outcome.status !==
        "local-work-prefix-complete-not-an-authentication-receipt" ||
      outcome.target_parents !== TARGET_PARENTS ||
      outcome.completed_parents !== TARGET_PARENTS
    ) {
      throw new Error("lane benchmark did not complete its fixed prefix");
    }
    return Object.freeze({
      ordinal,
      parallel_engines: lanes,
      elapsed_ms: elapsedMs,
      parents_per_second_ppm: Math.round(
        (TARGET_PARENTS * 1_000_000_000) / elapsedMs,
      ),
      completed_parents: TARGET_PARENTS,
      forced_parents_skipped: outcome.forced_parents_skipped,
      emitted_parent_groups: outcome.emitted_parent_groups,
      run_fingerprint: outcome.run_fingerprint,
    });
  } finally {
    await fs.promises.rm(stageRoot, { recursive: true, force: true });
  }
}

export async function runFloodgateStrengthFirstV9LaneBenchmark(): Promise<
  Readonly<Record<string, unknown>>
> {
  if (
    process.platform !== "darwin" ||
    process.arch !== "arm64" ||
    process.version !== "v22.13.0" ||
    typeof process.geteuid !== "function"
  ) {
    throw new Error(
      "strength-first v9 lane benchmark requires Node v22.13.0 on darwin arm64",
    );
  }
  const home = os.userInfo().homedir;
  const repositoryRoot = path.resolve(__dirname, "..");
  const revision = await captureFloodgateGitExactCleanRevision(repositoryRoot);
  const authority =
    await verifyPinnedFloodgateStrengthFirstV9TeacherAuthority();
  const fast = await loadFloodgateStrengthFirstFastTrainingInput(home);
  const input = projectFloodgateStrengthFirstFastTrainingInputForTeacher(
    fast,
    revision,
  );
  const assetRoot = path.join(
    home,
    ...FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
  );
  const outputRoot = path.join(
    home,
    ".codex",
    "shogi-runs",
    FLOODGATE_STRENGTH_FIRST_V9_LANE_BENCHMARK_OUTPUT_DIRECTORY,
  );
  await fs.promises.rm(outputRoot, { recursive: true, force: true });
  await ensureFloodgateStrengthFirstTeacherPrivateDirectory(
    path.dirname(outputRoot),
    process.geteuid(),
  );
  await ensureFloodgateStrengthFirstTeacherPrivateDirectory(
    outputRoot,
    process.geteuid(),
  );
  const startedAt = new Date().toISOString();
  const trials: Readonly<Trial>[] = [];
  for (const [index, lanes] of LANE_ORDER.entries()) {
    trials.push(
      await runTrial(input, revision, assetRoot, outputRoot, lanes, index + 1),
    );
  }
  const elapsed12 = trials
    .filter((trial) => trial.parallel_engines === 12)
    .map((trial) => trial.elapsed_ms);
  const elapsed13 = trials
    .filter((trial) => trial.parallel_engines === 13)
    .map((trial) => trial.elapsed_ms);
  const median12 = median(elapsed12);
  const median13 = median(elapsed13);
  if (median12 <= 0 || median13 <= 0) {
    throw new Error("lane benchmark requires positive median elapsed times");
  }
  const speedupPpm = Math.round((median12 * 1_000_000) / median13);
  const selected = speedupPpm >= MINIMUM_13_LANE_SPEEDUP_PPM ? 13 : 12;
  const receipt = Object.freeze({
    schema: FLOODGATE_STRENGTH_FIRST_V9_LANE_BENCHMARK_SCHEMA,
    status: "complete-aggregate-only",
    claim_boundary:
      "short-private-throughput-benchmark-not-teacher-training-or-playing-strength-evidence",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    runner_revision: revision,
    runtime: Object.freeze({
      local_only: true,
      network_requests: 0,
      cloud_services: Object.freeze([]),
      live_weight_changes: 0,
      process_nice: os.getPriority(0),
      target_parents_per_trial: TARGET_PARENTS,
      trial_lane_order: LANE_ORDER,
      threads_per_engine: 1,
      hash_mb_per_engine:
        FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME.hash_mb_per_engine,
      proposal: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME.proposal,
      independent_rescore:
        FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME.independent_rescore,
    }),
    bindings: Object.freeze({
      fast_input_schema: fast.schema,
      fast_input_policy: fast.policy,
      manifest: fast.manifest,
      source: fast.source,
      assets: authority.assets,
    }),
    trials: Object.freeze(trials),
    comparison: Object.freeze({
      lane_12_elapsed_ms: Object.freeze(elapsed12),
      lane_12_median_elapsed_ms: median12,
      lane_13_elapsed_ms: Object.freeze(elapsed13),
      lane_13_median_elapsed_ms: median13,
      lane_13_speedup_vs_lane_12_median_ppm: speedupPpm,
      minimum_speedup_to_select_lane_13_ppm: MINIMUM_13_LANE_SPEEDUP_PPM,
      selected_parallel_engines: selected,
    }),
    private_payload_fields_emitted: 0,
  });
  await commitFloodgateStrengthFirstTeacherPrivateJson(
    path.join(outputRoot, "receipt.json"),
    outputRoot,
    process.geteuid(),
    receipt,
  );
  return receipt;
}

if (require.main === module) {
  void runFloodgateStrengthFirstV9LaneBenchmark()
    .then((receipt) => {
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`v9 lane benchmark failed: ${message}\n`);
      process.exitCode = 1;
    });
}
