import { isMainThread, parentPort, workerData } from "node:worker_threads";

import { verifyExistingFloodgateRawReceipt } from "./floodgate-raw-lock";
import {
  parseFloodgateDailyArchiveEvidence,
  parseFloodgatePeriodEndInventoryEvidence,
} from "./floodgate-source";
import {
  FLOODGATE_RAW_VERIFICATION_WORKER_CONTROL_SCHEMA,
  FLOODGATE_RAW_VERIFICATION_WORKER_DATA_SCHEMA,
  FLOODGATE_RAW_VERIFICATION_WORKER_RESULT_SCHEMA,
  FLOODGATE_RAW_VERIFICATION_WORKER_TASK_SCHEMA,
  type FloodgateRawVerificationTaskResult,
  type FloodgateRawVerificationWorkerData,
  type FloodgateRawVerificationWorkerFailure,
  type FloodgateRawVerificationWorkerShutdown,
  type FloodgateRawVerificationWorkerSuccess,
  type FloodgateRawVerificationWorkerTask,
} from "./floodgate-raw-verification-worker-protocol";

const RECEIPT_KINDS = Object.freeze([
  "daily_listing",
  "daily_rating",
  "period_end_inventory",
  "csa",
] as const);

function fail(message: string): never {
  throw new Error(`invalid Floodgate raw verification worker: ${message}`);
}

function isPlainExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function captureWorkerData(value: unknown): FloodgateRawVerificationWorkerData {
  if (
    !isPlainExactRecord(value, ["lock_root", "schema"]) ||
    value.schema !== FLOODGATE_RAW_VERIFICATION_WORKER_DATA_SCHEMA ||
    typeof value.lock_root !== "string" ||
    value.lock_root.length === 0
  ) {
    fail("worker data is invalid");
  }
  return Object.freeze({
    schema: FLOODGATE_RAW_VERIFICATION_WORKER_DATA_SCHEMA,
    lock_root: value.lock_root,
  });
}

function captureTask(value: unknown): FloodgateRawVerificationWorkerTask {
  if (
    !isPlainExactRecord(value, ["ordinal", "receipt_kind", "schema", "url"]) ||
    value.schema !== FLOODGATE_RAW_VERIFICATION_WORKER_TASK_SCHEMA ||
    !Number.isSafeInteger(value.ordinal) ||
    (value.ordinal as number) < 0 ||
    !RECEIPT_KINDS.includes(
      value.receipt_kind as (typeof RECEIPT_KINDS)[number],
    ) ||
    typeof value.url !== "string" ||
    value.url.length === 0
  ) {
    fail("task is invalid");
  }
  return Object.freeze({
    schema: FLOODGATE_RAW_VERIFICATION_WORKER_TASK_SCHEMA,
    ordinal: value.ordinal as number,
    receipt_kind:
      value.receipt_kind as FloodgateRawVerificationWorkerTask["receipt_kind"],
    url: value.url,
  });
}

function isShutdown(
  value: unknown,
): value is FloodgateRawVerificationWorkerShutdown {
  return (
    isPlainExactRecord(value, ["operation", "schema"]) &&
    value.schema === FLOODGATE_RAW_VERIFICATION_WORKER_CONTROL_SCHEMA &&
    value.operation === "shutdown"
  );
}

async function verifyTask(
  lockRoot: string,
  task: FloodgateRawVerificationWorkerTask,
): Promise<FloodgateRawVerificationTaskResult> {
  const verified = await verifyExistingFloodgateRawReceipt(
    lockRoot,
    task.url,
    task.receipt_kind,
  );
  if (task.receipt_kind === "daily_listing") {
    const evidence = parseFloodgateDailyArchiveEvidence({
      listingUrl: task.url,
      listingBytes: verified.bytes,
    });
    return Object.freeze({
      receipt_kind: "daily_listing" as const,
      receipt: verified.receipt,
      evidence: Object.freeze({
        url: evidence.listing.location.url,
        body: evidence.listing.body,
        all_official_csa_urls: Object.freeze(
          evidence.allOfficialCsaLocations.map((location) => location.url),
        ),
        target_csa_urls: Object.freeze(
          evidence.targetCsaLocations.map((location) => location.url),
        ),
      }),
    });
  }
  if (task.receipt_kind === "period_end_inventory") {
    const evidence = parseFloodgatePeriodEndInventoryEvidence({
      ratingUrl: task.url,
      ratingBytes: verified.bytes,
    });
    return Object.freeze({
      receipt_kind: "period_end_inventory" as const,
      receipt: verified.receipt,
      evidence: Object.freeze({
        url: evidence.snapshot.url,
        body: evidence.snapshot.body,
        last_modified_at: evidence.snapshot.lastModifiedAt,
        counts: evidence.snapshot.counts,
      }),
    });
  }
  if (task.receipt_kind === "daily_rating") {
    return Object.freeze({
      receipt_kind: "daily_rating" as const,
      receipt: verified.receipt,
    });
  }
  return Object.freeze({
    receipt_kind: "csa" as const,
    receipt: verified.receipt,
  });
}

function errorFields(error: unknown): Readonly<{
  readonly name: string;
  readonly message: string;
}> {
  if (error instanceof Error) {
    return Object.freeze({ name: error.name, message: error.message });
  }
  return Object.freeze({
    name: "Error",
    message: "raw verification worker rejected a non-Error value",
  });
}

const port = parentPort;
if (isMainThread || port === null) {
  fail("module must run inside a worker thread");
}

const capturedWorkerData = captureWorkerData(workerData);
let active = false;

port.on("message", (message: unknown) => {
  if (isShutdown(message)) {
    if (active) fail("shutdown arrived while a task was active");
    port.close();
    return;
  }
  if (active) fail("received overlapping tasks");
  const task = captureTask(message);
  active = true;
  void verifyTask(capturedWorkerData.lock_root, task).then(
    (result) => {
      const response: FloodgateRawVerificationWorkerSuccess = {
        schema: FLOODGATE_RAW_VERIFICATION_WORKER_RESULT_SCHEMA,
        ordinal: task.ordinal,
        status: "success",
        result,
      };
      active = false;
      port.postMessage(response);
    },
    (error: unknown) => {
      const response: FloodgateRawVerificationWorkerFailure = {
        schema: FLOODGATE_RAW_VERIFICATION_WORKER_RESULT_SCHEMA,
        ordinal: task.ordinal,
        status: "failure",
        error: errorFields(error),
      };
      active = false;
      port.postMessage(response);
    },
  );
});
