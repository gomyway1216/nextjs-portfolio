/**
 * Aggregate-only MultiPV 6 throughput benchmark for the fresh-selection lane.
 *
 * The production entry point uses the same authenticated 42-position prefix
 * and fixed search policy in ABBA order: 12, 13, 13, 12 engine processes.
 * It never publishes labels, positions, fingerprints, or model artifacts.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  advanceStrengthFirstSiblingTeacherDatasetCoreForTests,
  type AdvanceStrengthFirstSiblingTeacherCoreForTestsOptions,
} from "./generate-sibling-teacher";
import {
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
  loadFloodgateStrengthFirstFastTrainingInput,
  projectFloodgateStrengthFirstFastTrainingInputForTeacher,
  type FloodgateStrengthFirstFastTrainingInput,
} from "./floodgate-strength-first-fast-training-input";
import {
  FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH,
  acquireFreshSelectionFormalTeacherExclusionCoreForTests,
  validateFreshSelectionTeacherSearchPolicy,
  type FreshSelectionTeacherSearchPolicy,
} from "./floodgate-fresh-selection-teacher-runner";
import { captureFloodgateGitExactCleanRevision } from "./floodgate-git";
import { FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS } from "./floodgate-production-teacher-asset-authority";
import { verifyPinnedFloodgateStrengthFirstV8TeacherAuthority } from "./floodgate-strength-first-v8-teacher-authority";
import {
  acquireFloodgateStrengthFirstTeacherRunLockCoreForTests,
  commitFloodgateStrengthFirstTeacherPrivateJson,
  ensureFloodgateStrengthFirstTeacherPrivateDirectory,
} from "./floodgate-strength-first-teacher-runner";
import type { AuthenticatedFloodgateTrainingRows } from "./floodgate-training-row-consumer";

export const FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_SCHEMA =
  "shogi-floodgate-strength-first-fresh-lane-multipv6-benchmark-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_STATUS =
  "complete-aggregate-only" as const;
export const FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_OUTPUT_DIRECTORY =
  "floodgate-q1-2026-strength-first-fresh-lane-multipv6-benchmark-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_NODE_VERSION =
  "v22.13.0" as const;
export const FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS =
  42 as const;
export const FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_ORDER =
  Object.freeze([12, 13, 13, 12] as const);
export const FLOODGATE_STRENGTH_FIRST_FRESH_LANE_MINIMUM_SPEEDUP_PPM =
  1_010_000 as const;
export const FLOODGATE_STRENGTH_FIRST_FRESH_LANE_PAIR_FAVORS_13_BOUNDARY_PPM =
  1_000_000 as const;
export const FLOODGATE_STRENGTH_FIRST_FRESH_LANE_SEARCH_POLICY_BYTES =
  1_349 as const;
export const FLOODGATE_STRENGTH_FIRST_FRESH_LANE_SEARCH_POLICY_SHA256 =
  "074efd7b58a3a93939247c0b0e3d2d80d9806d7d074586a7f050229948d859b3" as const;

type Lane = 12 | 13;

export interface FloodgateStrengthFirstFreshLaneBenchmarkPaths {
  readonly home: string;
  readonly repositoryRoot: string;
  readonly outputRoot: string;
  readonly receipt: string;
  readonly searchPolicy: string;
  readonly assetRoot: string;
}

export interface FloodgateStrengthFirstFreshLaneRuntime {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly nodeVersion: string;
  readonly availableParallelism: number;
  readonly effectiveUserId: number;
}

export interface FloodgateStrengthFirstFreshLaneTrial {
  readonly ordinal: 1 | 2 | 3 | 4;
  readonly parallel_engines: Lane;
  readonly elapsed_ms: number;
  readonly parents_per_second_ppm: number;
  readonly target_parents: 42;
  readonly completed_parents: 42;
  readonly forced_parents_skipped: 0;
  readonly emitted_parent_groups: 42;
  readonly work_records: 43;
  readonly current_work_records: 43;
  readonly run_fingerprint: string;
}

interface PrefixOutcome {
  readonly status: "local-work-prefix-complete-not-an-authentication-receipt";
  readonly target_parents: number;
  readonly completed_parents: number;
  readonly forced_parents_skipped: number;
  readonly forced_skip_reasons: Readonly<{
    readonly fewer_than_two_legal_moves: number;
    readonly search_timeout_no_label: number;
    readonly proposal_incomplete_no_label?: number;
  }>;
  readonly emitted_parent_groups: number;
  readonly run_fingerprint: string;
  readonly work: Readonly<{ readonly records: number }>;
  readonly current_work: Readonly<{ readonly records: number }>;
}

export interface FloodgateStrengthFirstFreshLaneTrialRequest {
  readonly input: Readonly<AuthenticatedFloodgateTrainingRows>;
  readonly revision: string;
  readonly outputRoot: string;
  readonly assetRoot: string;
  readonly policy: Readonly<FreshSelectionTeacherSearchPolicy>;
  readonly ordinal: 1 | 2 | 3 | 4;
  readonly parallelEngines: Lane;
}

export interface FloodgateStrengthFirstFreshLaneTrialDependencies {
  readonly nowMs: () => number;
  readonly removeStage: (stageRoot: string) => Promise<void>;
  readonly generate: (
    input: Readonly<AuthenticatedFloodgateTrainingRows>,
    options: AdvanceStrengthFirstSiblingTeacherCoreForTestsOptions,
  ) => Promise<Readonly<PrefixOutcome>>;
}

export interface FloodgateStrengthFirstFreshLaneInputPublicIdentity {
  readonly schema: string;
  readonly role: string;
  readonly policy: string;
  readonly manifest: unknown;
  readonly source: unknown;
}

const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const FORBIDDEN_AGGREGATE_KEYS = new Set([
  "assets",
  "game_id",
  "game_ids",
  "label",
  "labels",
  "manifest",
  "move",
  "moves",
  "parent_id",
  "parent_ids",
  "path",
  "position_id",
  "position_ids",
  "revision",
  "rows",
  "run_fingerprint",
  "runner_revision",
  "sfen",
  "sha256",
  "source",
]);

function fail(message: string): never {
  throw new Error(`fresh-lane benchmark: ${message}`);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail("canonical JSON rejects this number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  fail(`canonical JSON rejects ${typeof value}`);
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function medianPair(left: number, right: number): number {
  return Math.round((left + right) / 2);
}

function speedupPpm(elapsed12: number, elapsed13: number): number {
  if (
    !Number.isSafeInteger(elapsed12) ||
    !Number.isSafeInteger(elapsed13) ||
    elapsed12 <= 0 ||
    elapsed13 <= 0
  ) {
    fail("elapsed times must be positive safe integers");
  }
  return Math.round((elapsed12 * 1_000_000) / elapsed13);
}

function assertAggregateKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertAggregateKeys(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_AGGREGATE_KEYS.has(key)) {
      fail(`aggregate receipt contains forbidden field ${key}`);
    }
    assertAggregateKeys(child);
  }
}

export function floodgateStrengthFirstFreshLaneBenchmarkPaths(
  homeInput: string,
  repositoryInput: string,
): Readonly<FloodgateStrengthFirstFreshLaneBenchmarkPaths> {
  const home = path.resolve(homeInput);
  const repositoryRoot = path.resolve(repositoryInput);
  const outputRoot = path.join(
    home,
    ".codex",
    "shogi-runs",
    FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_OUTPUT_DIRECTORY,
  );
  return Object.freeze({
    home,
    repositoryRoot,
    outputRoot,
    receipt: path.join(outputRoot, "receipt.json"),
    searchPolicy: path.join(
      repositoryRoot,
      FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH,
    ),
    assetRoot: path.join(
      home,
      ...FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
    ),
  });
}

export function assertFloodgateStrengthFirstFreshLaneBenchmarkPathsForTests(
  value: Readonly<FloodgateStrengthFirstFreshLaneBenchmarkPaths>,
): void {
  const expected = floodgateStrengthFirstFreshLaneBenchmarkPaths(
    value.home,
    value.repositoryRoot,
  );
  if (!sameJson(value, expected)) {
    fail("fixed home, repository, policy, asset, or output path drifted");
  }
}

export function assertFloodgateStrengthFirstFreshLaneBenchmarkRuntimeForTests(
  runtime: Readonly<FloodgateStrengthFirstFreshLaneRuntime>,
): void {
  if (
    runtime.platform !== "darwin" ||
    runtime.arch !== "arm64" ||
    runtime.nodeVersion !==
      FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_NODE_VERSION ||
    !Number.isSafeInteger(runtime.availableParallelism) ||
    runtime.availableParallelism < 13 ||
    !Number.isSafeInteger(runtime.effectiveUserId) ||
    runtime.effectiveUserId < 0
  ) {
    fail(
      "requires Node v22.13.0 on darwin arm64 with at least 13 logical CPUs and a POSIX user",
    );
  }
}

export function assertFloodgateStrengthFirstFreshLaneBenchmarkCliArguments(
  args: readonly string[],
): void {
  if (!Array.isArray(args) || args.length !== 0) {
    fail("the production entry point accepts no arguments");
  }
}

export function formatFloodgateStrengthFirstFreshLaneBenchmarkErrorForTests(
  error: unknown,
): string {
  const message = error instanceof Error ? error.message : String(error);
  return /^fresh-lane benchmark(?: failed)?:/u.test(message)
    ? message
    : `fresh-lane benchmark failed: ${message}`;
}

export function floodgateStrengthFirstFreshLaneInputPublicIdentityForTests(
  input: Readonly<FloodgateStrengthFirstFastTrainingInput>,
): Readonly<FloodgateStrengthFirstFreshLaneInputPublicIdentity> {
  return Object.freeze({
    schema: input.schema,
    role: input.role,
    policy: input.policy,
    manifest: input.manifest,
    source: input.source,
  });
}

export function assertFloodgateStrengthFirstFreshLaneInputPostflightForTests(
  before: Readonly<FloodgateStrengthFirstFastTrainingInput>,
  after: Readonly<FloodgateStrengthFirstFastTrainingInput>,
): void {
  if (
    !sameJson(
      floodgateStrengthFirstFreshLaneInputPublicIdentityForTests(before),
      floodgateStrengthFirstFreshLaneInputPublicIdentityForTests(after),
    )
  ) {
    fail("authenticated training input changed during benchmark");
  }
}

export function validateFloodgateStrengthFirstFreshLaneSearchPolicyForTests(
  file: string,
  repositoryRootInput: string,
  bytes: Uint8Array,
  availableParallelism: number,
): Readonly<FreshSelectionTeacherSearchPolicy> {
  const repositoryRoot = path.resolve(repositoryRootInput);
  const expectedPath = path.join(
    repositoryRoot,
    FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH,
  );
  if (path.resolve(file) !== expectedPath) {
    fail("search-policy path drifted");
  }
  if (
    bytes.byteLength !==
      FLOODGATE_STRENGTH_FIRST_FRESH_LANE_SEARCH_POLICY_BYTES ||
    createHash("sha256").update(bytes).digest("hex") !==
      FLOODGATE_STRENGTH_FIRST_FRESH_LANE_SEARCH_POLICY_SHA256
  ) {
    fail("search-policy bytes drifted");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    fail("search policy is not JSON");
  }
  const policy = validateFreshSelectionTeacherSearchPolicy(
    parsed as Readonly<FreshSelectionTeacherSearchPolicy>,
    availableParallelism,
  );
  if (
    policy.teacher.proposal.multipv !== 6 ||
    policy.teacher.proposal.depth !== 14 ||
    policy.teacher.typed_incomplete_proposal_fallback
      .allowed_only_when_legal_moves_at_most !== 6 ||
    policy.teacher.independent_rescore.depth !== 16 ||
    policy.runtime.parallel_engines !== 12 ||
    policy.runtime.hash_mb_per_engine !== 512 ||
    policy.runtime.timeout_ms_per_search !== 600_000 ||
    policy.runtime.network !== false
  ) {
    fail("search-policy semantics drifted");
  }
  if (availableParallelism < 13) {
    fail("13-lane comparison exceeds available parallelism");
  }
  return policy;
}

function assertTrial(
  trial: Readonly<FloodgateStrengthFirstFreshLaneTrial>,
  ordinal: number,
  parallelEngines: Lane,
): void {
  if (
    trial.ordinal !== ordinal ||
    trial.parallel_engines !== parallelEngines ||
    !Number.isSafeInteger(trial.elapsed_ms) ||
    trial.elapsed_ms <= 0 ||
    !Number.isSafeInteger(trial.parents_per_second_ppm) ||
    trial.parents_per_second_ppm <= 0 ||
    trial.target_parents !==
      FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS ||
    trial.completed_parents !==
      FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS ||
    trial.forced_parents_skipped !== 0 ||
    trial.emitted_parent_groups !==
      FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS ||
    trial.work_records !==
      FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS + 1 ||
    trial.current_work_records !==
      FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS + 1 ||
    !SHA256_RE.test(trial.run_fingerprint)
  ) {
    fail(`trial ${ordinal} is incomplete or drifted`);
  }
  const expectedRate = Math.round(
    (FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS *
      1_000_000_000) /
      trial.elapsed_ms,
  );
  if (trial.parents_per_second_ppm !== expectedRate) {
    fail(`trial ${ordinal} throughput does not match elapsed time`);
  }
}

export function buildFloodgateStrengthFirstFreshLaneBenchmarkReceiptForTests(
  trialsInput: readonly Readonly<FloodgateStrengthFirstFreshLaneTrial>[],
): Readonly<Record<string, unknown>> {
  if (trialsInput.length !== 4) {
    fail("exactly four ABBA trials are required");
  }
  const trials = [...trialsInput];
  for (const [index, parallelEngines] of
    FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_ORDER.entries()) {
    assertTrial(trials[index], index + 1, parallelEngines);
  }
  if (
    trials[0].run_fingerprint !== trials[3].run_fingerprint ||
    trials[1].run_fingerprint !== trials[2].run_fingerprint ||
    trials[0].run_fingerprint === trials[1].run_fingerprint
  ) {
    fail("same-lane work identity mismatched or cross-lane identity collided");
  }

  const elapsed12 = Object.freeze([
    trials[0].elapsed_ms,
    trials[3].elapsed_ms,
  ] as const);
  const elapsed13 = Object.freeze([
    trials[1].elapsed_ms,
    trials[2].elapsed_ms,
  ] as const);
  const median12 = medianPair(elapsed12[0], elapsed12[1]);
  const median13 = medianPair(elapsed13[0], elapsed13[1]);
  const pair1 = speedupPpm(trials[0].elapsed_ms, trials[1].elapsed_ms);
  const pair2 = speedupPpm(trials[3].elapsed_ms, trials[2].elapsed_ms);
  const median = speedupPpm(median12, median13);
  const pair1Favors13 =
    pair1 >
    FLOODGATE_STRENGTH_FIRST_FRESH_LANE_PAIR_FAVORS_13_BOUNDARY_PPM;
  const pair2Favors13 =
    pair2 >
    FLOODGATE_STRENGTH_FIRST_FRESH_LANE_PAIR_FAVORS_13_BOUNDARY_PPM;
  const medianPass =
    median >= FLOODGATE_STRENGTH_FIRST_FRESH_LANE_MINIMUM_SPEEDUP_PPM;
  const selected = pair1Favors13 && pair2Favors13 && medianPass ? 13 : 12;

  const receipt = Object.freeze({
    schema: FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_SCHEMA,
    status: FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_STATUS,
    claim_boundary:
      "local-throughput-only-not-teacher-training-model-selection-or-playing-strength-evidence",
    runtime: Object.freeze({
      local_only: true,
      target_parents_per_trial:
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS,
      total_trials: 4,
      total_parent_slots:
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS * 4,
      trial_lane_order:
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_ORDER,
      threads_per_engine: 1,
      hash_mb_per_engine: 512,
      proposal_multipv: 6,
      proposal_depth: 14,
      exact_fallback_max_legal_moves: 6,
      independent_rescore_multipv: 1,
      independent_rescore_depth: 16,
      timeout_ms_per_search: 600_000,
      network_requests: 0,
      cloud_services: 0,
      shared_policy_writes: 0,
      model_writes: 0,
      live_weight_changes: 0,
    }),
    trials: Object.freeze(
      trials.map((trial) =>
        Object.freeze({
          ordinal: trial.ordinal,
          parallel_engines: trial.parallel_engines,
          elapsed_ms: trial.elapsed_ms,
          parents_per_second_ppm: trial.parents_per_second_ppm,
          target_parents: trial.target_parents,
          completed_parents: trial.completed_parents,
          forced_parents_skipped: trial.forced_parents_skipped,
          emitted_parent_groups: trial.emitted_parent_groups,
          work_records: trial.work_records,
          current_work_records: trial.current_work_records,
        }),
      ),
    ),
    comparison: Object.freeze({
      lane_12_elapsed_ms: elapsed12,
      lane_12_median_elapsed_ms: median12,
      lane_13_elapsed_ms: elapsed13,
      lane_13_median_elapsed_ms: median13,
      abba_pair_1_lane_13_speedup_ppm: pair1,
      abba_pair_2_lane_13_speedup_ppm: pair2,
      lane_13_median_speedup_ppm: median,
      abba_pair_favors_lane_13_boundary_ppm:
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_PAIR_FAVORS_13_BOUNDARY_PPM,
      minimum_speedup_to_select_lane_13_ppm:
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_MINIMUM_SPEEDUP_PPM,
      abba_pair_1_favors_lane_13: pair1Favors13,
      abba_pair_2_favors_lane_13: pair2Favors13,
      median_passed: medianPass,
      selected_parallel_engines: selected,
    }),
    private_payload_fields_emitted: 0,
  });
  assertAggregateKeys(receipt);
  return receipt;
}

export function assertFloodgateStrengthFirstFreshLaneAggregateReceiptForTests(
  receipt: unknown,
): void {
  assertAggregateKeys(receipt);
}

export async function runFloodgateStrengthFirstFreshLaneTrialCoreForTests(
  request: Readonly<FloodgateStrengthFirstFreshLaneTrialRequest>,
  dependencies: Readonly<FloodgateStrengthFirstFreshLaneTrialDependencies>,
): Promise<Readonly<FloodgateStrengthFirstFreshLaneTrial>> {
  const expectedLane =
    FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_ORDER[
      request.ordinal - 1
    ];
  if (
    expectedLane !== request.parallelEngines ||
    !REVISION_RE.test(request.revision)
  ) {
    fail("trial order, lane, or revision drifted");
  }
  const stageRoot = path.join(
    path.resolve(request.outputRoot),
    `disposable-${request.ordinal}-${request.parallelEngines}`,
  );
  await dependencies.removeStage(stageRoot);
  const started = dependencies.nowMs();
  try {
    const policy = request.policy;
    const outcome = await dependencies.generate(request.input, {
      stageRoot,
      runnerRevision: request.revision,
      engineBin: path.join(request.assetRoot, "engine", "yaneuraou"),
      engineArgs: Object.freeze([]),
      engineReceipt: path.join(
        request.assetRoot,
        "engine",
        "yaneuraou-receipt.json",
      ),
      authenticatedInputPolicy:
        FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
      evalDir: path.join(request.assetRoot, "eval"),
      multipv: policy.teacher.proposal.multipv,
      proposalDepth: policy.teacher.proposal.depth,
      depth: policy.teacher.independent_rescore.depth,
      proposalIncompleteAllLegalFallbackMaxMoves:
        policy.teacher.typed_incomplete_proposal_fallback
          .allowed_only_when_legal_moves_at_most,
      engines: request.parallelEngines,
      fvScale: 20,
      hashMb: policy.runtime.hash_mb_per_engine,
      timeoutMs: policy.runtime.timeout_ms_per_search,
      targetParents:
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS,
      finalize: false,
    });
    const elapsedMs = Math.round(dependencies.nowMs() - started);
    if (
      outcome.status !==
        "local-work-prefix-complete-not-an-authentication-receipt" ||
      outcome.target_parents !==
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS ||
      outcome.completed_parents !==
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS ||
      outcome.forced_parents_skipped !== 0 ||
      outcome.forced_skip_reasons.fewer_than_two_legal_moves !== 0 ||
      outcome.forced_skip_reasons.search_timeout_no_label !== 0 ||
      (outcome.forced_skip_reasons.proposal_incomplete_no_label ?? 0) !== 0 ||
      outcome.emitted_parent_groups !==
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS ||
      outcome.work.records !==
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS + 1 ||
      outcome.current_work.records !==
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS + 1 ||
      !SHA256_RE.test(outcome.run_fingerprint) ||
      !Number.isSafeInteger(elapsedMs) ||
      elapsedMs <= 0
    ) {
      fail("trial did not complete the exact no-skip 42-position workload");
    }
    return Object.freeze({
      ordinal: request.ordinal,
      parallel_engines: request.parallelEngines,
      elapsed_ms: elapsedMs,
      parents_per_second_ppm: Math.round(
        (FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS *
          1_000_000_000) /
          elapsedMs,
      ),
      target_parents:
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS,
      completed_parents:
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS,
      forced_parents_skipped: 0,
      emitted_parent_groups:
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS,
      work_records:
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS + 1,
      current_work_records:
        FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_TARGET_PARENTS + 1,
      run_fingerprint: outcome.run_fingerprint,
    });
  } finally {
    await dependencies.removeStage(stageRoot);
  }
}

async function readPinnedPolicy(
  paths: Readonly<FloodgateStrengthFirstFreshLaneBenchmarkPaths>,
  availableParallelism: number,
): Promise<Readonly<FreshSelectionTeacherSearchPolicy>> {
  const stat = await fs.promises.lstat(paths.searchPolicy);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail("search policy must be a tracked regular file");
  }
  const bytes = await fs.promises.readFile(paths.searchPolicy);
  return validateFloodgateStrengthFirstFreshLaneSearchPolicyForTests(
    paths.searchPolicy,
    paths.repositoryRoot,
    bytes,
    availableParallelism,
  );
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await fs.promises.lstat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function acquireFormalExclusion(
  paths: Readonly<FloodgateStrengthFirstFreshLaneBenchmarkPaths>,
  effectiveUserId: number,
): Promise<() => Promise<void>> {
  return acquireFreshSelectionFormalTeacherExclusionCoreForTests(
    paths.home,
    paths.repositoryRoot,
    effectiveUserId,
    {
      prepareDirectory: ensureFloodgateStrengthFirstTeacherPrivateDirectory,
      acquireLock: (outputRoot, uid) =>
        acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
          outputRoot,
          uid,
          {
            lockfExecutable: "/usr/bin/lockf",
            acquisitionTimeoutMs: 10_000,
          },
        ),
    },
  );
}

export async function runFloodgateStrengthFirstFreshLaneBenchmark(): Promise<
  Readonly<Record<string, unknown>>
> {
  if (typeof process.geteuid !== "function") {
    fail("POSIX effective user ID is unavailable");
  }
  const runtime = Object.freeze({
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    availableParallelism: os.availableParallelism(),
    effectiveUserId: process.geteuid(),
  });
  assertFloodgateStrengthFirstFreshLaneBenchmarkRuntimeForTests(runtime);
  const paths = floodgateStrengthFirstFreshLaneBenchmarkPaths(
    os.homedir(),
    path.resolve(__dirname, ".."),
  );
  assertFloodgateStrengthFirstFreshLaneBenchmarkPathsForTests(paths);

  const previousUmask = process.umask(0o077);
  let releaseFormal: (() => Promise<void>) | undefined;
  let releaseBenchmark: (() => Promise<void>) | undefined;
  try {
    const revision = await captureFloodgateGitExactCleanRevision(
      paths.repositoryRoot,
    );
    const policy = await readPinnedPolicy(
      paths,
      runtime.availableParallelism,
    );
    await verifyPinnedFloodgateStrengthFirstV8TeacherAuthority();
    releaseFormal = await acquireFormalExclusion(
      paths,
      runtime.effectiveUserId,
    );
    await ensureFloodgateStrengthFirstTeacherPrivateDirectory(
      path.dirname(paths.outputRoot),
      runtime.effectiveUserId,
    );
    await ensureFloodgateStrengthFirstTeacherPrivateDirectory(
      paths.outputRoot,
      runtime.effectiveUserId,
    );
    if (await pathExists(paths.receipt)) {
      fail("receipt already exists; benchmark output is append-only");
    }
    releaseBenchmark =
      await acquireFloodgateStrengthFirstTeacherRunLockCoreForTests(
        paths.outputRoot,
        runtime.effectiveUserId,
        {
          lockfExecutable: "/usr/bin/lockf",
          acquisitionTimeoutMs: 10_000,
        },
      );

    const fast = await loadFloodgateStrengthFirstFastTrainingInput(paths.home);
    const input = projectFloodgateStrengthFirstFastTrainingInputForTeacher(
      fast,
      revision,
    );
    const trials: Readonly<FloodgateStrengthFirstFreshLaneTrial>[] = [];
    for (const [index, parallelEngines] of
      FLOODGATE_STRENGTH_FIRST_FRESH_LANE_BENCHMARK_ORDER.entries()) {
      trials.push(
        await runFloodgateStrengthFirstFreshLaneTrialCoreForTests(
          {
            input,
            revision,
            outputRoot: paths.outputRoot,
            assetRoot: paths.assetRoot,
            policy,
            ordinal: (index + 1) as 1 | 2 | 3 | 4,
            parallelEngines,
          },
          {
            nowMs: () => performance.now(),
            removeStage: (stageRoot) =>
              fs.promises.rm(stageRoot, { recursive: true, force: true }),
            generate: (trainingInput, options) =>
              advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
                trainingInput,
                options,
              ) as Promise<Readonly<PrefixOutcome>>,
          },
        ),
      );
    }

    const postRevision = await captureFloodgateGitExactCleanRevision(
      paths.repositoryRoot,
    );
    if (postRevision !== revision) {
      fail("repository revision changed during benchmark");
    }
    const postPolicy = await readPinnedPolicy(
      paths,
      runtime.availableParallelism,
    );
    if (!sameJson(postPolicy, policy)) {
      fail("search policy changed during benchmark");
    }
    const postFast = await loadFloodgateStrengthFirstFastTrainingInput(
      paths.home,
    );
    assertFloodgateStrengthFirstFreshLaneInputPostflightForTests(
      fast,
      postFast,
    );
    await verifyPinnedFloodgateStrengthFirstV8TeacherAuthority();

    const receipt =
      buildFloodgateStrengthFirstFreshLaneBenchmarkReceiptForTests(trials);
    await commitFloodgateStrengthFirstTeacherPrivateJson(
      paths.receipt,
      paths.outputRoot,
      runtime.effectiveUserId,
      receipt,
    );
    return receipt;
  } finally {
    try {
      await releaseBenchmark?.();
    } finally {
      try {
        await releaseFormal?.();
      } finally {
        process.umask(previousUmask);
      }
    }
  }
}
