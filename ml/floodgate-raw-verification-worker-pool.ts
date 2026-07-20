import * as path from "node:path";
import { Worker } from "node:worker_threads";

import {
  assertFloodgateGitExactCleanRevision,
  captureFloodgateGitExactCleanRevision,
} from "./floodgate-git";
import { validateFloodgateRawReceipt } from "./floodgate-raw-lock";
import {
  FLOODGATE_RAW_VERIFICATION_WORKER_CONTROL_SCHEMA,
  FLOODGATE_RAW_VERIFICATION_WORKER_COUNT,
  FLOODGATE_RAW_VERIFICATION_WORKER_COUNT_MAX,
  FLOODGATE_RAW_VERIFICATION_WORKER_DATA_SCHEMA,
  FLOODGATE_RAW_VERIFICATION_WORKER_RESULT_SCHEMA,
  FLOODGATE_RAW_VERIFICATION_WORKER_TASK_SCHEMA,
  type FloodgateRawVerificationTaskInput,
  type FloodgateRawVerificationTaskResult,
  type FloodgateRawVerificationWorkerResult,
  type FloodgateRawVerificationWorkerTask,
} from "./floodgate-raw-verification-worker-protocol";
import {
  capturePinnedFloodgateRawVerificationWorkerBundle,
  type FloodgateRawVerificationWorkerBundleLease,
} from "./floodgate-raw-verification-worker-source";

export const FLOODGATE_RAW_VERIFICATION_PRODUCTION_WORKER_COUNT = 12 as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_MAX_OLD_GENERATION_MB =
  384 as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_MAX_YOUNG_GENERATION_MB =
  64 as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_STACK_MB = 4 as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_TASK_TIMEOUT_MS =
  60_000 as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_SHUTDOWN_TIMEOUT_MS =
  5_000 as const;

export interface FloodgateRawVerificationWorkerMetrics {
  readonly configured_workers: number;
  readonly spawned_workers: number;
  readonly tasks: number;
  readonly peak_in_flight_tasks: number;
  readonly max_tasks_per_worker: 1;
  readonly per_worker_max_old_generation_mb: typeof FLOODGATE_RAW_VERIFICATION_WORKER_MAX_OLD_GENERATION_MB;
  readonly aggregate_worker_max_old_generation_mb: number;
}

interface MutableMetrics {
  inFlight: number;
  peakInFlight: number;
}

let activeWorkerEndpointsForTests = 0;

interface PendingTask {
  readonly task: FloodgateRawVerificationWorkerTask;
  readonly resolve: (result: FloodgateRawVerificationTaskResult) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

interface FloodgateRawVerificationWorkerEndpointOptions {
  readonly index: number;
  readonly workerPath?: string;
  readonly workerSource?: string;
  readonly execArgv: readonly string[];
  readonly workerData: unknown;
  readonly taskTimeoutMs: number;
  readonly shutdownTimeoutMs: number;
}

interface FloodgateRawVerificationWorkerEndpointLike {
  execute(
    task: FloodgateRawVerificationWorkerTask,
  ): Promise<FloodgateRawVerificationTaskResult>;
  close(): Promise<void>;
  terminate(): Promise<void>;
}

function fail(message: string): never {
  throw new Error(`invalid Floodgate raw verification worker pool: ${message}`);
}

function workerCount(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > FLOODGATE_RAW_VERIFICATION_WORKER_COUNT_MAX
  ) {
    fail(
      `worker count must be an integer from 1 through ${FLOODGATE_RAW_VERIFICATION_WORKER_COUNT_MAX}`,
    );
  }
  return value;
}

function positiveTimeout(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(`${label} must be a positive safe integer`);
  }
  return value;
}

function taskInput(
  value: FloodgateRawVerificationTaskInput,
  ordinal: number,
): FloodgateRawVerificationWorkerTask {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join("\0") !== "receipt_kind\0url" ||
    typeof value.url !== "string" ||
    value.url.length === 0 ||
    !["daily_listing", "daily_rating", "period_end_inventory", "csa"].includes(
      value.receipt_kind,
    )
  ) {
    fail(`task ${ordinal} is invalid`);
  }
  return Object.freeze({
    schema: FLOODGATE_RAW_VERIFICATION_WORKER_TASK_SCHEMA,
    ordinal,
    receipt_kind: value.receipt_kind,
    url: value.url,
  });
}

function responseError(
  response: Extract<
    FloodgateRawVerificationWorkerResult,
    { status: "failure" }
  >,
): Error {
  const error = new Error(response.error.message);
  error.name = response.error.name;
  return error;
}

function plainRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return fail(`${label} is not a plain record`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  const record = plainRecord(value, label);
  if (Object.keys(record).sort().join("\0") !== [...keys].sort().join("\0")) {
    return fail(`${label} does not have the exact keys`);
  }
  return record;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.length === 0)
  ) {
    return fail(`${label} is not a nonempty-string array`);
  }
  return Object.freeze([...value]);
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return fail(`${label} is not a nonnegative safe integer`);
  }
  return value as number;
}

function capturedBodyIdentity(
  value: unknown,
  receipt: FloodgateRawVerificationTaskResult["receipt"],
  label: string,
): Readonly<{ readonly bytes: number; readonly sha256: string }> {
  const body = exactRecord(value, ["bytes", "sha256"], label);
  if (
    body.bytes !== receipt.response.bytes ||
    body.sha256 !== receipt.response.sha256
  ) {
    return fail(`${label} does not match the verified receipt`);
  }
  return Object.freeze({
    bytes: receipt.response.bytes,
    sha256: receipt.response.sha256,
  });
}

function captureTaskResult(
  value: unknown,
  task: FloodgateRawVerificationWorkerTask,
): FloodgateRawVerificationTaskResult {
  const expectedKeys =
    task.receipt_kind === "daily_listing" ||
    task.receipt_kind === "period_end_inventory"
      ? ["evidence", "receipt", "receipt_kind"]
      : ["receipt", "receipt_kind"];
  const result = exactRecord(
    value,
    expectedKeys,
    `task ${task.ordinal} result`,
  );
  if (result.receipt_kind !== task.receipt_kind) {
    return fail(`task ${task.ordinal} result has the wrong receipt kind`);
  }
  const receipt = validateFloodgateRawReceipt(result.receipt);
  if (receipt.kind !== task.receipt_kind || receipt.url !== task.url) {
    return fail(`task ${task.ordinal} receipt does not bind its input`);
  }
  if (task.receipt_kind === "daily_listing") {
    const evidence = exactRecord(
      result.evidence,
      ["all_official_csa_urls", "body", "target_csa_urls", "url"],
      `task ${task.ordinal} listing evidence`,
    );
    if (evidence.url !== task.url) {
      return fail(`task ${task.ordinal} listing evidence URL does not match`);
    }
    return Object.freeze({
      receipt_kind: "daily_listing" as const,
      receipt,
      evidence: Object.freeze({
        url: task.url,
        body: capturedBodyIdentity(
          evidence.body,
          receipt,
          `task ${task.ordinal} listing body`,
        ),
        all_official_csa_urls: stringArray(
          evidence.all_official_csa_urls,
          `task ${task.ordinal} official CSA URLs`,
        ),
        target_csa_urls: stringArray(
          evidence.target_csa_urls,
          `task ${task.ordinal} target CSA URLs`,
        ),
      }),
    });
  }
  if (task.receipt_kind === "period_end_inventory") {
    const evidence = exactRecord(
      result.evidence,
      ["body", "counts", "last_modified_at", "url"],
      `task ${task.ordinal} period evidence`,
    );
    if (
      evidence.url !== task.url ||
      typeof evidence.last_modified_at !== "string" ||
      evidence.last_modified_at.length === 0
    ) {
      return fail(`task ${task.ordinal} period evidence does not bind input`);
    }
    const counts = exactRecord(
      evidence.counts,
      ["groupZeroIdentities", "identitiesAtLeast3600And30Games", "ratingRows"],
      `task ${task.ordinal} period counts`,
    );
    return Object.freeze({
      receipt_kind: "period_end_inventory" as const,
      receipt,
      evidence: Object.freeze({
        url: task.url,
        body: capturedBodyIdentity(
          evidence.body,
          receipt,
          `task ${task.ordinal} period body`,
        ),
        last_modified_at: evidence.last_modified_at,
        counts: Object.freeze({
          ratingRows: nonnegativeInteger(
            counts.ratingRows,
            `task ${task.ordinal} rating rows`,
          ),
          groupZeroIdentities: nonnegativeInteger(
            counts.groupZeroIdentities,
            `task ${task.ordinal} group-zero identities`,
          ),
          identitiesAtLeast3600And30Games: nonnegativeInteger(
            counts.identitiesAtLeast3600And30Games,
            `task ${task.ordinal} eligible identities`,
          ),
        }),
      }),
    });
  }
  return Object.freeze({
    receipt_kind: task.receipt_kind,
    receipt,
  });
}

function captureResponse(
  value: unknown,
  task: FloodgateRawVerificationWorkerTask,
): FloodgateRawVerificationWorkerResult {
  const candidate = plainRecord(value, `task ${task.ordinal} worker response`);
  const response =
    candidate.status === "failure"
      ? exactRecord(
          value,
          ["error", "ordinal", "schema", "status"],
          `task ${task.ordinal} worker failure`,
        )
      : exactRecord(
          value,
          ["ordinal", "result", "schema", "status"],
          `task ${task.ordinal} worker success`,
        );
  if (
    response.schema !== FLOODGATE_RAW_VERIFICATION_WORKER_RESULT_SCHEMA ||
    response.ordinal !== task.ordinal ||
    (response.status !== "success" && response.status !== "failure")
  ) {
    return fail(`worker response does not bind task ${task.ordinal}`);
  }
  if (response.status === "failure") {
    const error = exactRecord(
      response.error,
      ["message", "name"],
      `task ${task.ordinal} worker error`,
    );
    if (typeof error.name !== "string" || typeof error.message !== "string") {
      return fail(`worker failure is malformed for task ${task.ordinal}`);
    }
    return Object.freeze({
      schema: FLOODGATE_RAW_VERIFICATION_WORKER_RESULT_SCHEMA,
      ordinal: task.ordinal,
      status: "failure" as const,
      error: Object.freeze({ name: error.name, message: error.message }),
    });
  }
  return Object.freeze({
    schema: FLOODGATE_RAW_VERIFICATION_WORKER_RESULT_SCHEMA,
    ordinal: task.ordinal,
    status: "success" as const,
    result: captureTaskResult(response.result, task),
  });
}

class FloodgateRawVerificationWorkerEndpoint {
  readonly #worker: Worker;
  readonly #taskTimeoutMs: number;
  readonly #shutdownTimeoutMs: number;
  #pending: PendingTask | undefined;
  #closed = false;
  #shutdownRequested = false;
  #terminalError: Error | undefined;
  readonly #exit: Promise<number>;

  constructor(options: FloodgateRawVerificationWorkerEndpointOptions) {
    this.#taskTimeoutMs = positiveTimeout(
      options.taskTimeoutMs,
      "task timeout",
    );
    this.#shutdownTimeoutMs = positiveTimeout(
      options.shutdownTimeoutMs,
      "shutdown timeout",
    );
    if (
      (options.workerPath === undefined) ===
      (options.workerSource === undefined)
    ) {
      fail("worker endpoint requires exactly one path or source");
    }
    this.#worker = new Worker(
      options.workerSource ?? (options.workerPath as string),
      {
        eval: options.workerSource !== undefined,
        execArgv: [...options.execArgv],
        name: `floodgate-raw-verifier-${options.index + 1}`,
        resourceLimits: {
          maxOldGenerationSizeMb:
            FLOODGATE_RAW_VERIFICATION_WORKER_MAX_OLD_GENERATION_MB,
          maxYoungGenerationSizeMb:
            FLOODGATE_RAW_VERIFICATION_WORKER_MAX_YOUNG_GENERATION_MB,
          stackSizeMb: FLOODGATE_RAW_VERIFICATION_WORKER_STACK_MB,
        },
        workerData: options.workerData,
      },
    );
    activeWorkerEndpointsForTests += 1;
    this.#exit = new Promise((resolve) => {
      this.#worker.once("exit", (code) => {
        activeWorkerEndpointsForTests -= 1;
        const pending = this.#takePending();
        this.#closed = true;
        if (pending) {
          const error = new Error(
            `raw verification worker exited with code ${code} before completing task ${pending.task.ordinal}`,
          );
          this.#terminalError ??= error;
          pending.reject(error);
        } else if (!this.#shutdownRequested) {
          this.#terminalError ??= new Error(
            `raw verification worker exited unexpectedly with code ${code}`,
          );
        }
        resolve(code);
      });
    });
    this.#worker.on("message", (value: unknown) => {
      const pending = this.#takePending();
      if (!pending) {
        this.#failEndpoint(
          new Error("raw verification worker emitted an unsolicited message"),
        );
        return;
      }
      try {
        const response = captureResponse(value, pending.task);
        if (response.status === "failure") {
          pending.reject(responseError(response));
        } else {
          pending.resolve(response.result);
        }
      } catch (error) {
        pending.reject(
          error instanceof Error
            ? error
            : new Error("raw verification worker response capture failed"),
        );
        this.#failEndpoint(
          error instanceof Error
            ? error
            : new Error("raw verification worker response capture failed"),
        );
      }
    });
    this.#worker.on("error", (error: unknown) => {
      const captured =
        error instanceof Error
          ? error
          : new Error("raw verification worker emitted a non-Error failure");
      const pending = this.#takePending();
      pending?.reject(captured);
      this.#failEndpoint(captured);
    });
  }

  #takePending(): PendingTask | undefined {
    const pending = this.#pending;
    this.#pending = undefined;
    if (pending) clearTimeout(pending.timeout);
    return pending;
  }

  #failEndpoint(error: Error): void {
    this.#terminalError ??= error;
    this.#closed = true;
    void this.#worker.terminate().catch(() => undefined);
  }

  #waitForExit(timeoutMs: number, label: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `raw verification worker ${label} timed out after ${timeoutMs} ms`,
          ),
        );
      }, timeoutMs);
      timeout.unref();
      void this.#exit.then((code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });
  }

  execute(
    task: FloodgateRawVerificationWorkerTask,
  ): Promise<FloodgateRawVerificationTaskResult> {
    if (this.#closed || this.#pending) {
      return Promise.reject(
        this.#terminalError ??
          new Error("raw verification worker endpoint is not idle"),
      );
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.#takePending();
        if (!pending) return;
        const error = new Error(
          `raw verification worker task ${task.ordinal} timed out after ${this.#taskTimeoutMs} ms`,
        );
        pending.reject(error);
        this.#failEndpoint(error);
      }, this.#taskTimeoutMs);
      timeout.unref();
      this.#pending = { task, resolve, reject, timeout };
      try {
        this.#worker.postMessage(task);
      } catch (error) {
        const pending = this.#takePending();
        const captured =
          error instanceof Error
            ? error
            : new Error("raw verification worker postMessage failed");
        pending?.reject(captured);
        this.#failEndpoint(captured);
      }
    });
  }

  async close(): Promise<void> {
    if (this.#closed) {
      let code: number;
      try {
        code = await this.#waitForExit(this.#shutdownTimeoutMs, "termination");
      } catch (error) {
        await this.#worker.terminate().catch(() => undefined);
        throw error;
      }
      if (this.#terminalError) throw this.#terminalError;
      if (code !== 0) {
        throw new Error(
          `raw verification worker exited unexpectedly with code ${code}`,
        );
      }
      return;
    }
    if (this.#pending) fail("cannot close a worker with an active task");
    this.#closed = true;
    this.#shutdownRequested = true;
    try {
      this.#worker.postMessage({
        schema: FLOODGATE_RAW_VERIFICATION_WORKER_CONTROL_SCHEMA,
        operation: "shutdown",
      });
    } catch (error) {
      await this.#worker.terminate().catch(() => undefined);
      throw error;
    }
    let code: number;
    try {
      code = await this.#waitForExit(this.#shutdownTimeoutMs, "shutdown");
    } catch (error) {
      await this.#worker.terminate().catch(() => undefined);
      throw error;
    }
    if (this.#terminalError) throw this.#terminalError;
    if (code !== 0) fail(`worker shutdown exited with code ${code}`);
  }

  async terminate(): Promise<void> {
    const pending = this.#takePending();
    this.#closed = true;
    this.#shutdownRequested = true;
    pending?.reject(new Error("raw verification worker was terminated"));
    await this.#worker.terminate();
  }
}

async function orderedMapWithBoundedWorkers<T, R>(
  values: readonly T[],
  configuredWorkers: number,
  operation: (value: T, ordinal: number, workerIndex: number) => Promise<R>,
  observeMetrics?: (
    metrics: Readonly<FloodgateRawVerificationWorkerMetrics>,
  ) => void,
): Promise<readonly R[]> {
  const spawned = Math.min(configuredWorkers, values.length);
  const metrics: MutableMetrics = { inFlight: 0, peakInFlight: 0 };
  if (values.length === 0) {
    observeMetrics?.(
      Object.freeze({
        configured_workers: configuredWorkers,
        spawned_workers: 0,
        tasks: 0,
        peak_in_flight_tasks: 0,
        max_tasks_per_worker: 1 as const,
        per_worker_max_old_generation_mb:
          FLOODGATE_RAW_VERIFICATION_WORKER_MAX_OLD_GENERATION_MB,
        aggregate_worker_max_old_generation_mb: 0,
      }),
    );
    return Object.freeze([]);
  }

  const results = new Array<R>(values.length);
  const completed = new Uint8Array(values.length);
  const errors = new Map<number, Error>();
  let next = 0;
  let lowestFailure = Number.POSITIVE_INFINITY;
  const run = async (workerIndex: number): Promise<void> => {
    for (;;) {
      const ordinal = next;
      next += 1;
      if (ordinal >= values.length || ordinal > lowestFailure) return;
      metrics.inFlight += 1;
      metrics.peakInFlight = Math.max(metrics.peakInFlight, metrics.inFlight);
      try {
        results[ordinal] = await operation(
          values[ordinal],
          ordinal,
          workerIndex,
        );
        completed[ordinal] = 1;
      } catch (error) {
        const captured =
          error instanceof Error
            ? error
            : new Error("ordered worker rejected a non-Error value");
        errors.set(ordinal, captured);
        lowestFailure = Math.min(lowestFailure, ordinal);
      } finally {
        metrics.inFlight -= 1;
      }
    }
  };

  try {
    await Promise.all(
      Array.from({ length: spawned }, (_, index) => run(index)),
    );
    if (errors.size > 0) {
      const first = [...errors].sort(([left], [right]) => left - right)[0];
      throw first[1];
    }
    if (completed.some((value) => value === 0)) {
      fail("successful worker run did not return every ordered result");
    }
    return Object.freeze(results);
  } finally {
    observeMetrics?.(
      Object.freeze({
        configured_workers: configuredWorkers,
        spawned_workers: spawned,
        tasks: values.length,
        peak_in_flight_tasks: metrics.peakInFlight,
        max_tasks_per_worker: 1 as const,
        per_worker_max_old_generation_mb:
          FLOODGATE_RAW_VERIFICATION_WORKER_MAX_OLD_GENERATION_MB,
        aggregate_worker_max_old_generation_mb:
          spawned * FLOODGATE_RAW_VERIFICATION_WORKER_MAX_OLD_GENERATION_MB,
      }),
    );
  }
}

async function verifyFloodgateRawReceiptsWithOrderedWorkersNonProduction(
  lockRoot: string,
  inputTasks: readonly FloodgateRawVerificationTaskInput[],
  configuredWorkers: number = FLOODGATE_RAW_VERIFICATION_WORKER_COUNT,
  observeMetrics?: (
    metrics: Readonly<FloodgateRawVerificationWorkerMetrics>,
  ) => void,
  endpointFactory?: (
    index: number,
  ) => FloodgateRawVerificationWorkerEndpointLike,
): Promise<readonly FloodgateRawVerificationTaskResult[]> {
  if (
    typeof lockRoot !== "string" ||
    lockRoot.length === 0 ||
    path.resolve(lockRoot) !== lockRoot
  ) {
    fail("lock root must be an absolute normalized path");
  }
  const count = workerCount(configuredWorkers);
  if (!Array.isArray(inputTasks)) fail("tasks must be an array");
  const tasks = inputTasks.map(taskInput);
  const spawned = Math.min(count, tasks.length);
  const createEndpoint =
    endpointFactory ??
    ((index: number) =>
      new FloodgateRawVerificationWorkerEndpoint({
        index,
        workerPath: path.join(
          __dirname,
          "floodgate-raw-verification-worker.ts",
        ),
        execArgv: ["--require", "tsx/cjs"],
        workerData: Object.freeze({
          schema: FLOODGATE_RAW_VERIFICATION_WORKER_DATA_SCHEMA,
          lock_root: lockRoot,
          runtime: Object.freeze({
            node_version: process.version,
            v8_version: process.versions.v8,
            modules_abi: process.versions.modules,
            executable_path: process.execPath,
            platform: process.platform,
            architecture: process.arch,
          }),
        }),
        taskTimeoutMs: FLOODGATE_RAW_VERIFICATION_WORKER_TASK_TIMEOUT_MS,
        shutdownTimeoutMs:
          FLOODGATE_RAW_VERIFICATION_WORKER_SHUTDOWN_TIMEOUT_MS,
      }));
  const endpoints: FloodgateRawVerificationWorkerEndpointLike[] = [];
  try {
    for (let index = 0; index < spawned; index += 1) {
      endpoints.push(createEndpoint(index));
    }
  } catch (error) {
    await Promise.all(
      endpoints.map((endpoint) => endpoint.terminate().catch(() => undefined)),
    );
    throw error;
  }

  let primaryError: unknown;
  try {
    return await orderedMapWithBoundedWorkers(
      tasks,
      count,
      (task, _ordinal, workerIndex) => endpoints[workerIndex].execute(task),
      observeMetrics,
    );
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await Promise.all(endpoints.map((endpoint) => endpoint.close()));
    } catch (closeError) {
      await Promise.all(
        endpoints.map((endpoint) =>
          endpoint.terminate().catch(() => undefined),
        ),
      );
      if (primaryError === undefined) throw closeError;
    }
  }
}

export interface FloodgateRawVerificationProductionDependencies {
  readonly captureExactCleanRevision: (
    repositoryRoot: string,
  ) => Promise<string>;
  readonly assertExactCleanRevision: (
    repositoryRoot: string,
    expectedRevision: string,
  ) => Promise<void>;
  readonly captureBundle: (
    repositoryRoot: string,
  ) => FloodgateRawVerificationWorkerBundleLease;
  readonly runWorkers?: (
    lockRoot: string,
    tasks: readonly FloodgateRawVerificationTaskInput[],
    bundle: FloodgateRawVerificationWorkerBundleLease,
    observeMetrics?: (
      metrics: Readonly<FloodgateRawVerificationWorkerMetrics>,
    ) => void,
  ) => Promise<readonly FloodgateRawVerificationTaskResult[]>;
}

function productionSourceRoot(repositoryRoot: string): string {
  if (
    typeof repositoryRoot !== "string" ||
    repositoryRoot.length === 0 ||
    path.resolve(repositoryRoot) !== repositoryRoot
  ) {
    fail("production repository root must be an absolute normalized path");
  }
  return repositoryRoot;
}

function productionWorkerData(
  lockRoot: string,
  bundle: FloodgateRawVerificationWorkerBundleLease,
): unknown {
  return Object.freeze({
    schema: FLOODGATE_RAW_VERIFICATION_WORKER_DATA_SCHEMA,
    lock_root: lockRoot,
    runtime: Object.freeze({ ...bundle.identity.runtime }),
  });
}

async function runPinnedProductionWorkers(
  lockRoot: string,
  tasks: readonly FloodgateRawVerificationTaskInput[],
  bundle: FloodgateRawVerificationWorkerBundleLease,
  observeMetrics?: (
    metrics: Readonly<FloodgateRawVerificationWorkerMetrics>,
  ) => void,
): Promise<readonly FloodgateRawVerificationTaskResult[]> {
  return verifyFloodgateRawReceiptsWithOrderedWorkersNonProduction(
    lockRoot,
    tasks,
    FLOODGATE_RAW_VERIFICATION_PRODUCTION_WORKER_COUNT,
    observeMetrics,
    (index) =>
      new FloodgateRawVerificationWorkerEndpoint({
        index,
        workerSource: `(function () {\n${bundle.source}\n})();`,
        execArgv: [],
        workerData: productionWorkerData(lockRoot, bundle),
        taskTimeoutMs: FLOODGATE_RAW_VERIFICATION_WORKER_TASK_TIMEOUT_MS,
        shutdownTimeoutMs:
          FLOODGATE_RAW_VERIFICATION_WORKER_SHUTDOWN_TIMEOUT_MS,
      }),
  );
}

async function verifyWithProductionSourceClosure(
  repositoryRootInput: string,
  lockRoot: string,
  tasks: readonly FloodgateRawVerificationTaskInput[],
  observeMetrics:
    | ((metrics: Readonly<FloodgateRawVerificationWorkerMetrics>) => void)
    | undefined,
  dependencies: FloodgateRawVerificationProductionDependencies,
): Promise<readonly FloodgateRawVerificationTaskResult[]> {
  const repositoryRoot = productionSourceRoot(repositoryRootInput);
  const bundle = dependencies.captureBundle(repositoryRoot);
  let primary: unknown;
  let result: readonly FloodgateRawVerificationTaskResult[] | undefined;
  let spawned = false;
  let sourceRevision: string | undefined;
  try {
    sourceRevision =
      await dependencies.captureExactCleanRevision(repositoryRoot);
    if (!/^[0-9a-f]{40}$/u.test(sourceRevision)) {
      fail("captured production source revision is not a 40-hex commit");
    }
    spawned = true;
    result = await (dependencies.runWorkers ?? runPinnedProductionWorkers)(
      lockRoot,
      tasks,
      bundle,
      observeMetrics,
    );
  } catch (error) {
    primary = error;
  }

  let closureFailure: unknown;
  try {
    bundle.assertUnchangedAndClose();
  } catch (error) {
    closureFailure = error;
  }
  if (spawned) {
    try {
      await dependencies.assertExactCleanRevision(
        repositoryRoot,
        sourceRevision as string,
      );
    } catch (error) {
      closureFailure ??= error;
    }
  }
  if (closureFailure !== undefined) {
    throw new AggregateError(
      primary === undefined ? [closureFailure] : [primary, closureFailure],
      "Floodgate raw-verification production source closure failed",
    );
  }
  if (primary !== undefined) throw primary;
  if (result === undefined) fail("production workers returned no result");
  return result;
}

/**
 * Production-only raw verification.
 *
 * Exactly twelve workers receive an in-memory, SHA-256-pinned, self-contained
 * CJS source. The exact Git revision is checked immediately before spawn and
 * again only after every endpoint has exited. The bundle inode and its parent
 * directories remain held throughout that interval.
 */
export function verifyFloodgateRawReceiptsWithPinnedOrderedWorkers(
  lockRoot: string,
  tasks: readonly FloodgateRawVerificationTaskInput[],
  observeMetrics?: (
    metrics: Readonly<FloodgateRawVerificationWorkerMetrics>,
  ) => void,
): Promise<readonly FloodgateRawVerificationTaskResult[]> {
  const repositoryRoot = path.resolve(__dirname, "..");
  return verifyWithProductionSourceClosure(
    repositoryRoot,
    lockRoot,
    tasks,
    observeMetrics,
    {
      captureExactCleanRevision: captureFloodgateGitExactCleanRevision,
      assertExactCleanRevision: assertFloodgateGitExactCleanRevision,
      captureBundle: capturePinnedFloodgateRawVerificationWorkerBundle,
    },
  );
}

/** Composition seam for source-closure ordering and fail-closed tests. */
export function verifyFloodgateRawReceiptsWithPinnedWorkersCoreForTests(
  repositoryRoot: string,
  lockRoot: string,
  tasks: readonly FloodgateRawVerificationTaskInput[],
  dependencies: FloodgateRawVerificationProductionDependencies,
): Promise<readonly FloodgateRawVerificationTaskResult[]> {
  return verifyWithProductionSourceClosure(
    repositoryRoot,
    lockRoot,
    tasks,
    undefined,
    dependencies,
  );
}

/**
 * Non-production test/benchmark seam.
 *
 * The worker entrypoint and its transitive TypeScript runtime have not yet
 * been pinned into the production verifier's exact-clean source closure.
 * Production code must not import or call this seam.
 */
export function verifyFloodgateRawReceiptsWithOrderedWorkersCoreForTests(
  lockRoot: string,
  tasks: readonly FloodgateRawVerificationTaskInput[],
  workers: number,
  observeMetrics?: (
    metrics: Readonly<FloodgateRawVerificationWorkerMetrics>,
  ) => void,
): Promise<readonly FloodgateRawVerificationTaskResult[]> {
  return verifyFloodgateRawReceiptsWithOrderedWorkersNonProduction(
    lockRoot,
    tasks,
    workers,
    observeMetrics,
  );
}

/**
 * Test-only fault-injection seam. Production code must not import or call it.
 */
export function verifyFloodgateRawReceiptsWithInjectedWorkerCoreForTests(
  lockRoot: string,
  tasks: readonly FloodgateRawVerificationTaskInput[],
  workers: number,
  options: Readonly<{
    workerPath: string;
    workerData: unknown;
    taskTimeoutMs: number;
    shutdownTimeoutMs: number;
    execArgv?: readonly string[];
  }>,
): Promise<readonly FloodgateRawVerificationTaskResult[]> {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    typeof options.workerPath !== "string" ||
    path.resolve(options.workerPath) !== options.workerPath
  ) {
    fail("injected worker path must be an absolute normalized path");
  }
  const taskTimeoutMs = positiveTimeout(options.taskTimeoutMs, "task timeout");
  const shutdownTimeoutMs = positiveTimeout(
    options.shutdownTimeoutMs,
    "shutdown timeout",
  );
  return verifyFloodgateRawReceiptsWithOrderedWorkersNonProduction(
    lockRoot,
    tasks,
    workers,
    undefined,
    (index) =>
      new FloodgateRawVerificationWorkerEndpoint({
        index,
        workerPath: options.workerPath,
        execArgv: options.execArgv ?? [],
        workerData: options.workerData,
        taskTimeoutMs,
        shutdownTimeoutMs,
      }),
  );
}

/** Test-only leak assertion seam. */
export function floodgateRawVerificationActiveWorkerCountCoreForTests(): number {
  return activeWorkerEndpointsForTests;
}

/** Deterministic scheduler seam; it creates no worker thread or filesystem I/O. */
export function mapFloodgateOrderedWorkersCoreForTests<T, R>(
  values: readonly T[],
  workers: number,
  operation: (value: T, ordinal: number, workerIndex: number) => Promise<R>,
  observeMetrics?: (
    metrics: Readonly<FloodgateRawVerificationWorkerMetrics>,
  ) => void,
): Promise<readonly R[]> {
  return orderedMapWithBoundedWorkers(
    values,
    workerCount(workers),
    operation,
    observeMetrics,
  );
}
