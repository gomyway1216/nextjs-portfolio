/**
 * Reproducible microbenchmark for the Floodgate role-lock one-game probe.
 *
 * This emulates the removed production shape (including conversion of the
 * caller's blocked Set to the pure allocator's legacy-ID array and the former
 * sampler Set clone) and compares it with the serialization-free sampler. The
 * current full allocator and direct probe share the exact sampler, so parity is
 * a wrapper-level guard rather than an independent second algorithm. This is a
 * synthetic performance measurement, not a full-verifier or playing-strength
 * benchmark.
 *
 * Run:
 *   node --expose-gc -r tsx/cjs ml/benchmark-floodgate-role-probe.ts
 *
 * Optional:
 *   ... --sizes 0,10000,100000,1000000 --samples 4
 */

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import * as os from "node:os";

import {
  DEFAULT_FLOODGATE_GAME_RANK_DOMAINS,
  DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS,
  FLOODGATE_ALLOCATION_SEED,
  allocateFloodgateRolesPure,
  sampleFloodgatePlannedGameParentsForRoleLock,
  type FloodgatePureGameInput,
  type FloodgateRole,
} from "./floodgate-roles";

export const FLOODGATE_ROLE_PROBE_BENCHMARK_SCHEMA =
  "shogi-floodgate-role-probe-benchmark-v1" as const;

const DEFAULT_SIZES = Object.freeze([0, 10_000, 50_000, 100_000, 250_000]);
const DEFAULT_SAMPLES = 4;
const MAX_BLOCKED_IDS = 1_000_000;
const MAX_SAMPLES = 20;
const EMPTY_COUNTS: Readonly<Record<FloodgateRole, number>> = Object.freeze({
  fresh_final_holdout: 0,
  fresh_selection: 0,
  training: 0,
});

export interface FloodgateRoleProbeBenchmarkOptions {
  readonly blockedIdCounts: readonly number[];
  readonly samples: number;
}

export interface FloodgateRoleProbeBenchmarkMeasurement {
  readonly blocked_ids: number;
  readonly legacy_ms_samples: readonly number[];
  readonly sampler_ms_samples: readonly number[];
  readonly legacy_ms_median: number;
  readonly sampler_ms_median: number;
  readonly median_speedup: number;
  readonly exact_parent_parity: true;
  readonly selected_parents: number;
  readonly parent_projection_sha256: string;
}

export interface FloodgateRoleProbeBenchmarkReport {
  readonly schema: typeof FLOODGATE_ROLE_PROBE_BENCHMARK_SCHEMA;
  readonly generated_at: string;
  readonly runtime: Readonly<{
    node: string;
    platform: string;
    arch: string;
    cpu_model: string;
    logical_cpus: number;
    available_parallelism: number;
    total_memory_bytes: number;
    explicit_gc: boolean;
  }>;
  readonly method: Readonly<{
    fixture: string;
    clock: "process.hrtime.bigint";
    warmup: string;
    ordering: string;
    blocked_set_construction_timed: false;
    legacy_set_to_array_conversion_timed: true;
    removed_sampler_set_clone_emulated: true;
    equality_check_timed: false;
    parity_scope: string;
    summary: "median";
  }>;
  readonly fixture_game_json_sha256: string;
  readonly samples_per_path: number;
  readonly measurements: readonly FloodgateRoleProbeBenchmarkMeasurement[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function shaId(value: string): string {
  return `sha256:${sha256(value)}`;
}

function identity(value: string): string {
  return `${value}+${sha256(`identity:${value}`).slice(0, 32)}`;
}

function parentId(gameId: string, ply: number): string {
  return shaId(`parent-occurrence-v1\0${gameId}\0${ply}`);
}

function fixtureHand(tag: number): string {
  let remaining = tag + 1;
  let hand = "";
  for (const piece of ["r", "b", "g", "s", "n", "l", "p"]) {
    const count = remaining % 19;
    remaining = Math.floor(remaining / 19);
    if (count > 0) hand += `${count > 1 ? count : ""}${piece}`;
  }
  if (remaining !== 0) throw new Error("fixture tag exceeds hand encoding");
  return hand || "-";
}

function fixtureSfen(tag: number, ply: number): string {
  return `4k4/9/9/9/9/9/9/9/K8 b ${fixtureHand(tag)} ${ply + 1}`;
}

function benchmarkGame(): FloodgatePureGameInput {
  const gameId = shaId("floodgate-role-probe-benchmark-game-v1");
  return {
    game_id: gameId,
    player_identities: [
      identity("benchmark-sente"),
      identity("benchmark-gote"),
    ],
    parents: Array.from({ length: 32 }, (_, index) => {
      const ply = 16 + index;
      return {
        parent_id: parentId(gameId, ply),
        parent_sfen: fixtureSfen(701_000 + index, ply),
        ply,
      };
    }),
  };
}

function forceGc(): void {
  (globalThis as { gc?: () => void }).gc?.();
}

function elapsedMilliseconds<T>(operation: () => T): readonly [T, number] {
  const started = process.hrtime.bigint();
  const result = operation();
  const elapsed = process.hrtime.bigint() - started;
  return [result, Number(elapsed) / 1_000_000];
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function validateOptions(
  options: FloodgateRoleProbeBenchmarkOptions,
): FloodgateRoleProbeBenchmarkOptions {
  if (
    !Number.isSafeInteger(options.samples) ||
    options.samples < 1 ||
    options.samples > MAX_SAMPLES
  ) {
    throw new Error(`samples must be an integer from 1 through ${MAX_SAMPLES}`);
  }
  if (options.blockedIdCounts.length === 0) {
    throw new Error("at least one blocked-ID count is required");
  }
  for (const count of options.blockedIdCounts) {
    if (
      !Number.isSafeInteger(count) ||
      Object.is(count, -0) ||
      count < 0 ||
      count > MAX_BLOCKED_IDS
    ) {
      throw new Error(
        `blocked-ID counts must be integers from 0 through ${MAX_BLOCKED_IDS}`,
      );
    }
  }
  return {
    blockedIdCounts: [...new Set(options.blockedIdCounts)],
    samples: options.samples,
  };
}

function legacyProbe(
  game: FloodgatePureGameInput,
  blocked: ReadonlySet<string>,
): readonly unknown[] {
  // The shared sampler no longer clones its global Set. Add that one missing
  // timed clone; the current full allocator supplies the remaining legacy-ID
  // conversion, canonicalization, and digest work.
  const emulatedFormerSamplerClone = new Set(blocked);
  const allocated = allocateFloodgateRolesPure([game], {
    seed: FLOODGATE_ALLOCATION_SEED,
    legacyProtectedPositionIds: [...emulatedFormerSamplerClone],
    roleGameCounts: {
      ...EMPTY_COUNTS,
      fresh_final_holdout: 1,
    },
    gameRankDomains: DEFAULT_FLOODGATE_GAME_RANK_DOMAINS,
    parentRankDomains: DEFAULT_FLOODGATE_PARENT_RANK_DOMAINS,
  }).output.roles.fresh_final_holdout[0];
  if (allocated === undefined) {
    throw new Error("legacy benchmark probe did not allocate its fixture game");
  }
  return allocated.parents;
}

function samplerProbe(
  game: FloodgatePureGameInput,
  blocked: ReadonlySet<string>,
): readonly unknown[] {
  const parents = sampleFloodgatePlannedGameParentsForRoleLock(game, blocked);
  if (parents === null) {
    throw new Error(
      "optimized benchmark probe did not allocate its fixture game",
    );
  }
  return parents;
}

/** Run the fixed synthetic comparison and retain every raw timing sample. */
export function runFloodgateRoleProbeBenchmark(
  rawOptions: FloodgateRoleProbeBenchmarkOptions,
): FloodgateRoleProbeBenchmarkReport {
  const options = validateOptions(rawOptions);
  const game = benchmarkGame();

  // Three small untimed passes initialize the TS/JIT/module path for both sides.
  const warmupBlocked = new Set<string>();
  for (let warmup = 0; warmup < 3; warmup += 1) {
    legacyProbe(game, warmupBlocked);
    samplerProbe(game, warmupBlocked);
  }

  const measurements = options.blockedIdCounts.map((blockedIdCount) => {
    const blocked = new Set(
      Array.from({ length: blockedIdCount }, (_, index) =>
        shaId(`floodgate-role-probe-unrelated-block-v1:${index}`),
      ),
    );
    const legacySamples: number[] = [];
    const samplerSamples: number[] = [];
    let expected: readonly unknown[] | undefined;
    let actual: readonly unknown[] | undefined;

    for (let sample = 0; sample < options.samples; sample += 1) {
      const runLegacy = (): void => {
        forceGc();
        const [parents, milliseconds] = elapsedMilliseconds(() =>
          legacyProbe(game, blocked),
        );
        expected = parents;
        legacySamples.push(milliseconds);
      };
      const runSampler = (): void => {
        forceGc();
        const [parents, milliseconds] = elapsedMilliseconds(() =>
          samplerProbe(game, blocked),
        );
        actual = parents;
        samplerSamples.push(milliseconds);
      };
      // Alternate order to reduce systematic thermal/order bias.
      if (sample % 2 === 0) {
        runLegacy();
        runSampler();
      } else {
        runSampler();
        runLegacy();
      }
      if (!isDeepStrictEqual(actual, expected)) {
        throw new Error(
          `parent parity failed with ${blockedIdCount} blocked IDs`,
        );
      }
    }

    if (actual === undefined || expected === undefined) {
      throw new Error("benchmark completed without both parent projections");
    }
    const legacyMedian = median(legacySamples);
    const samplerMedian = median(samplerSamples);
    return Object.freeze({
      blocked_ids: blockedIdCount,
      legacy_ms_samples: Object.freeze(legacySamples),
      sampler_ms_samples: Object.freeze(samplerSamples),
      legacy_ms_median: legacyMedian,
      sampler_ms_median: samplerMedian,
      median_speedup: legacyMedian / samplerMedian,
      exact_parent_parity: true as const,
      selected_parents: actual.length,
      parent_projection_sha256: sha256(JSON.stringify(actual)),
    });
  });

  const cpu = os.cpus()[0];
  return Object.freeze({
    schema: FLOODGATE_ROLE_PROBE_BENCHMARK_SCHEMA,
    generated_at: new Date().toISOString(),
    runtime: Object.freeze({
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu_model: cpu?.model ?? "unknown",
      logical_cpus: os.cpus().length,
      available_parallelism: os.availableParallelism(),
      total_memory_bytes: os.totalmem(),
      explicit_gc: typeof (globalThis as { gc?: () => void }).gc === "function",
    }),
    method: Object.freeze({
      fixture: "fixed-valid-32-parent-cheap-semantics-v1",
      clock: "process.hrtime.bigint" as const,
      warmup: "three untimed legacy/sampler pairs at zero blocked IDs",
      ordering: "legacy-first for even samples; sampler-first for odd samples",
      blocked_set_construction_timed: false as const,
      legacy_set_to_array_conversion_timed: true as const,
      removed_sampler_set_clone_emulated: true as const,
      equality_check_timed: false as const,
      parity_scope:
        "current full-artifact allocator versus the direct shared sampler; not two independent parent algorithms",
      summary: "median" as const,
    }),
    fixture_game_json_sha256: sha256(JSON.stringify(game)),
    samples_per_path: options.samples,
    measurements: Object.freeze(measurements),
  });
}

function parseArguments(
  argv: readonly string[],
): FloodgateRoleProbeBenchmarkOptions {
  let blockedIdCounts: readonly number[] = DEFAULT_SIZES;
  let samples = DEFAULT_SAMPLES;
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined || !["--sizes", "--samples"].includes(flag)) {
      throw new Error(
        "usage: benchmark-floodgate-role-probe.ts [--sizes 0,10000,...] [--samples 4]",
      );
    }
    if (seen.has(flag)) throw new Error(`${flag} may be specified only once`);
    seen.add(flag);
    if (flag === "--sizes") {
      blockedIdCounts = value.split(",").map((entry) => Number(entry));
    } else {
      samples = Number(value);
    }
  }
  return validateOptions({ blockedIdCounts, samples });
}

export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const report = runFloodgateRoleProbeBenchmark(parseArguments(argv));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
