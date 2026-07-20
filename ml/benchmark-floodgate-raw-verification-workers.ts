/**
 * Read-only benchmark for the non-production Floodgate raw-verification
 * worker foundation.
 *
 * This command deliberately does not connect the worker pool to the production
 * verifier. It validates a fixed prefix of real, already-locked CSA receipts
 * against the existing serial implementation and measures 1/4/8/12 workers.
 * Its JSON output omits the lock path, URLs, receipts, and digests.
 *
 * Run:
 *   npm run shogi:floodgate-raw-verification-worker-benchmark -- \
 *     --raw-lock /canonical/absolute/completed-raw-lock
 */

import { isDeepStrictEqual } from "node:util";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  readExistingFloodgateRawLockManifestFile,
  verifyExistingFloodgateRawReceipt,
} from "./floodgate-raw-lock";
import {
  verifyFloodgateRawReceiptsWithOrderedWorkersCoreForTests,
  type FloodgateRawVerificationWorkerMetrics,
} from "./floodgate-raw-verification-worker-pool";
import type {
  FloodgateRawVerificationTaskInput,
  FloodgateRawVerificationTaskResult,
} from "./floodgate-raw-verification-worker-protocol";

export const FLOODGATE_RAW_VERIFICATION_WORKER_BENCHMARK_SCHEMA =
  "shogi-floodgate-raw-verification-worker-benchmark-v1" as const;

const WORKER_COUNTS = Object.freeze([1, 4, 8, 12] as const);
const DEFAULT_TASKS = 4_000;
const DEFAULT_SAMPLES = 3;
const MAX_TASKS = 36_168;
const MAX_SAMPLES = 6;
const TRIAL_ORDERS = Object.freeze([
  Object.freeze([1, 4, 8, 12] as const),
  Object.freeze([12, 8, 4, 1] as const),
  Object.freeze([4, 12, 1, 8] as const),
]);

interface BenchmarkArguments {
  readonly rawLockRoot: string;
  readonly tasks: number;
  readonly samples: number;
}

interface TimedResult<T> {
  readonly elapsed_ms: number;
  readonly observed_peak_rss_bytes: number;
  readonly value: T;
}

interface WorkerMeasurement {
  readonly sample: number;
  readonly workers: (typeof WORKER_COUNTS)[number];
  readonly elapsed_ms: number;
  readonly observed_peak_rss_bytes: number;
  readonly exact_ordered_equivalence: true;
  readonly metrics: Readonly<FloodgateRawVerificationWorkerMetrics>;
}

function fail(message: string): never {
  throw new Error(
    `invalid Floodgate raw-verification worker benchmark: ${message}`,
  );
}

function positiveInteger(
  value: string,
  label: string,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    fail(`${label} must be an integer from 1 through ${maximum}`);
  }
  return parsed;
}

function parseArguments(argv: readonly string[]): BenchmarkArguments {
  let rawLockRoot: string | undefined;
  let tasks = DEFAULT_TASKS;
  let samples = DEFAULT_SAMPLES;
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      value === undefined ||
      !["--raw-lock", "--tasks", "--samples"].includes(flag)
    ) {
      fail(
        "usage: --raw-lock /canonical/absolute/completed-raw-lock [--tasks 4000] [--samples 3]",
      );
    }
    if (seen.has(flag)) fail(`${flag} may be specified only once`);
    seen.add(flag);
    if (flag === "--raw-lock") {
      rawLockRoot = value;
    } else if (flag === "--tasks") {
      tasks = positiveInteger(value, "tasks", MAX_TASKS);
    } else {
      samples = positiveInteger(value, "samples", MAX_SAMPLES);
    }
  }
  if (rawLockRoot === undefined) fail("--raw-lock is required");
  return Object.freeze({ rawLockRoot, tasks, samples });
}

async function timed<T>(operation: () => Promise<T>): Promise<TimedResult<T>> {
  global.gc?.();
  let observedPeakRss = process.memoryUsage().rss;
  const sampler = setInterval(() => {
    observedPeakRss = Math.max(observedPeakRss, process.memoryUsage().rss);
  }, 5);
  sampler.unref();
  const started = process.hrtime.bigint();
  try {
    const value = await operation();
    const elapsed = process.hrtime.bigint() - started;
    observedPeakRss = Math.max(observedPeakRss, process.memoryUsage().rss);
    return Object.freeze({
      elapsed_ms: Number(elapsed) / 1_000_000,
      observed_peak_rss_bytes: observedPeakRss,
      value,
    });
  } finally {
    clearInterval(sampler);
  }
}

async function serialResults(
  lockRoot: string,
  tasks: readonly FloodgateRawVerificationTaskInput[],
): Promise<readonly FloodgateRawVerificationTaskResult[]> {
  const results: FloodgateRawVerificationTaskResult[] = [];
  for (const task of tasks) {
    const verified = await verifyExistingFloodgateRawReceipt(
      lockRoot,
      task.url,
      task.receipt_kind,
    );
    results.push(
      Object.freeze({
        receipt_kind: "csa" as const,
        receipt: verified.receipt,
      }),
    );
  }
  return Object.freeze(results);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export async function runFloodgateRawVerificationWorkerBenchmark(
  input: BenchmarkArguments,
): Promise<Readonly<Record<string, unknown>>> {
  const rawLockRoot = await fs.promises.realpath(input.rawLockRoot);
  if (path.resolve(rawLockRoot) !== rawLockRoot) {
    fail("raw lock root did not resolve to a normalized absolute path");
  }
  const manifest = await readExistingFloodgateRawLockManifestFile(rawLockRoot);
  if (input.tasks > manifest.csa_index.length) {
    fail(`tasks exceeds the available ${manifest.csa_index.length} CSA rows`);
  }
  const tasks = Object.freeze(
    manifest.csa_index.slice(0, input.tasks).map((entry) =>
      Object.freeze({
        receipt_kind: "csa" as const,
        url: entry.url,
      }),
    ),
  );

  // Warm the page cache through the current implementation, then time a
  // second serial pass to obtain the exact expected result.
  await serialResults(rawLockRoot, tasks);
  const serial = await timed(() => serialResults(rawLockRoot, tasks));
  const measurements: WorkerMeasurement[] = [];
  for (let sample = 0; sample < input.samples; sample += 1) {
    const order = TRIAL_ORDERS[sample % TRIAL_ORDERS.length];
    for (const workers of order) {
      let metrics: FloodgateRawVerificationWorkerMetrics | undefined;
      const measured = await timed(() =>
        verifyFloodgateRawReceiptsWithOrderedWorkersCoreForTests(
          rawLockRoot,
          tasks,
          workers,
          (value) => {
            metrics = value;
          },
        ),
      );
      if (!isDeepStrictEqual(measured.value, serial.value)) {
        fail(`${workers}-worker result differs from the serial result`);
      }
      if (metrics === undefined) {
        fail(`${workers}-worker run did not report metrics`);
      }
      measurements.push(
        Object.freeze({
          sample: sample + 1,
          workers,
          elapsed_ms: measured.elapsed_ms,
          observed_peak_rss_bytes: measured.observed_peak_rss_bytes,
          exact_ordered_equivalence: true as const,
          metrics,
        }),
      );
    }
  }

  return Object.freeze({
    schema: FLOODGATE_RAW_VERIFICATION_WORKER_BENCHMARK_SCHEMA,
    generated_at: new Date().toISOString(),
    status:
      "non-production-worker-foundation-benchmark-live-and-formal-v7-unchanged",
    production_safety: Object.freeze({
      production_wiring: false,
      source_dependency_closure_complete: false,
      reason:
        "the worker entry and transitive tsx runtime are not yet code-pinned across spawn and completion",
    }),
    runtime: Object.freeze({
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu_model: os.cpus()[0]?.model ?? "unknown",
      logical_cpus: os.cpus().length,
      available_parallelism: os.availableParallelism(),
      total_memory_bytes: os.totalmem(),
    }),
    method: Object.freeze({
      fixture: "fixed canonical prefix of existing CSA receipts",
      fixture_private_fields_in_output: false,
      task_kind: "csa",
      tasks: input.tasks,
      samples_per_worker_count: input.samples,
      worker_counts: WORKER_COUNTS,
      page_cache_warmup_serial_passes: 1,
      serial_reference_passes_timed: 1,
      trial_orders: Object.freeze(
        Array.from(
          { length: input.samples },
          (_, index) => TRIAL_ORDERS[index % TRIAL_ORDERS.length],
        ),
      ),
      clock: "process.hrtime.bigint",
      memory:
        "process RSS sampled every 5 ms; an observation, not an allocation limit",
    }),
    serial_reference: Object.freeze({
      elapsed_ms: serial.elapsed_ms,
      observed_peak_rss_bytes: serial.observed_peak_rss_bytes,
      exact_results_retained_only_in_memory: true,
    }),
    measurements: Object.freeze(measurements),
    medians: Object.freeze(
      WORKER_COUNTS.map((workers) => {
        const group = measurements.filter(
          (measurement) => measurement.workers === workers,
        );
        const elapsed = median(
          group.map((measurement) => measurement.elapsed_ms),
        );
        return Object.freeze({
          workers,
          elapsed_ms: elapsed,
          speedup_over_serial_reference: serial.elapsed_ms / elapsed,
          observed_peak_rss_bytes: median(
            group.map((measurement) => measurement.observed_peak_rss_bytes),
          ),
          exact_ordered_equivalence: true as const,
        });
      }),
    ),
  });
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const report = await runFloodgateRawVerificationWorkerBenchmark(
    parseArguments(argv),
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
