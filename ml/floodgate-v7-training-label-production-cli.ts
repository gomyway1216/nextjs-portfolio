/**
 * Argumentless public CLI for the fixed production training-label owner. The
 * production runner is loaded only after argv and the exact runtime have been
 * accepted. Both success and failure are rebuilt from explicit allowlists.
 */

import { types as nodeUtilTypes } from "node:util";

export const FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_SUCCESS_CONTRACT =
  "shogi-floodgate-v7-training-label-production-cli-success-v1" as const;
export const FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_SUCCESS_STATUS =
  "fixed-production-training-label-finalization-complete" as const;
export const FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_FAILURE_CONTRACT =
  "shogi-floodgate-v7-training-label-production-cli-failure-v1" as const;
export const FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_FAILURE_STATUS =
  "fixed-production-training-label-finalization-did-not-issue-success" as const;

interface RunnerModule {
  readonly FloodgateV7TrainingLabelProductionRunnerError: new (
    ...arguments_: never[]
  ) => Error;
  readonly runFloodgateV7TrainingLabelProduction: () => Promise<unknown>;
}

const NativeError = Error;
const NativePromise = Promise;
const scheduleImmediate = setImmediate;
const stringify = JSON.stringify.bind(JSON);
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototype = Object.prototype;
const nativeReflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const nativeArrayIncludes = Array.prototype.includes;
const nativeRegExpExec = RegExp.prototype.exec;
const numberIsSafeInteger = Number.isSafeInteger;
const REQUIRED_NODE_VERSION = "v22.13.0" as const;
const MUTATION_PURPOSE = "training-label-finalization-24000" as const;
const RUNNER_CONTRACT =
  "shogi-floodgate-v7-training-label-production-runner-v1" as const;
const RUNNER_STATUS =
  "authenticated-training-label-artifacts-finalized-published-and-reverified-under-common-production-outer-gate" as const;
const RUNNER_CLAIM_BOUNDARY =
  "one-fixed-purpose-bound-production-training-label-finalization-without-path-run-key-identity-row-or-raw-receipt-disclosure-v1" as const;
const RUNNER_EXECUTION_BOUNDARY =
  "production-fixed-purpose-bound-outer-gate-owner-and-sanitized-artifact-evidence" as const;
const RUNNER_RECEIPT_KEYS = objectFreeze([
  "contract",
  "status",
  "claim_boundary",
  "execution_boundary",
  "mutation_purpose",
  "output",
  "verification",
  "nonclaims",
] as const);
const RUNNER_OUTPUT_KEYS = objectFreeze([
  "parents",
  "training_records",
  "work",
  "train",
  "result",
  "manifest",
] as const);
const FILE_EVIDENCE_KEYS = objectFreeze(["bytes", "sha256"] as const);
const RUNNER_VERIFICATION_KEYS = objectFreeze([
  "owner_completed",
  "destination_content_reverified",
  "purpose_bound_outer_lease_removed_durably",
  "common_os_lock_released",
] as const);
const RUNNER_NONCLAIM_KEYS = objectFreeze([
  "path_disclosed",
  "run_id_disclosed",
  "key_id_disclosed",
  "identity_disclosed",
  "mac_disclosed",
  "consumer_postflight_digest_disclosed",
  "raw_outer_receipt_disclosed",
  "raw_owner_receipt_disclosed",
  "raw_finalizer_receipt_disclosed",
  "row_or_position_content_disclosed",
  "teacher_truth",
  "optimizer_training",
  "weight",
  "live_evaluation_activation",
  "match",
  "playing_strength",
] as const);
const SHA256_RE = /^[0-9a-f]{64}$/;

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of reflectOwnKeys(descriptors)) {
    if (typeof key !== "string") continue;
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new NativeError("training-label CLI record differs");
    }
    objectDefineProperty(output, key, {
      configurable: false,
      enumerable: descriptor.enumerable,
      writable: false,
      value: descriptor.value,
    });
  }
  return objectFreeze(output);
}

function dataRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError("training-label CLI value is not a record");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(value);
  if (ownKeys.length !== keys.length) {
    throw new NativeError("training-label CLI record key count differs");
  }
  for (const key of ownKeys) {
    if (
      typeof key !== "string" ||
      !nativeReflectApply(nativeArrayIncludes, keys, [key])
    ) {
      throw new NativeError("training-label CLI record key differs");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("training-label CLI record is not plain data");
    }
  }
  return value as Record<string, unknown>;
}

function captureCount(value: unknown): number {
  if (!numberIsSafeInteger(value) || (value as number) < 0) {
    throw new NativeError("training-label CLI count differs");
  }
  return value as number;
}

function fileEvidence(value: unknown): Readonly<{
  bytes: number;
  sha256: string;
}> {
  const evidence = dataRecord(value, FILE_EVIDENCE_KEYS);
  if (
    !numberIsSafeInteger(evidence.bytes) ||
    (evidence.bytes as number) < 1 ||
    typeof evidence.sha256 !== "string" ||
    nativeReflectApply(nativeRegExpExec, SHA256_RE, [evidence.sha256]) === null
  ) {
    throw new NativeError("training-label CLI file evidence differs");
  }
  return frozenRecord({
    bytes: evidence.bytes as number,
    sha256: evidence.sha256,
  });
}

function sanitizedSuccess(value: unknown): Readonly<object> {
  const receipt = dataRecord(value, RUNNER_RECEIPT_KEYS);
  const output = dataRecord(receipt.output, RUNNER_OUTPUT_KEYS);
  const verification = dataRecord(
    receipt.verification,
    RUNNER_VERIFICATION_KEYS,
  );
  const nonclaims = dataRecord(receipt.nonclaims, RUNNER_NONCLAIM_KEYS);
  if (
    receipt.contract !== RUNNER_CONTRACT ||
    receipt.status !== RUNNER_STATUS ||
    receipt.claim_boundary !== RUNNER_CLAIM_BOUNDARY ||
    receipt.execution_boundary !== RUNNER_EXECUTION_BOUNDARY ||
    receipt.mutation_purpose !== MUTATION_PURPOSE ||
    verification.owner_completed !== true ||
    verification.destination_content_reverified !== true ||
    verification.purpose_bound_outer_lease_removed_durably !== true ||
    verification.common_os_lock_released !== true
  ) {
    throw new NativeError("training-label CLI success receipt differs");
  }
  for (const key of RUNNER_NONCLAIM_KEYS) {
    if (nonclaims[key] !== false) {
      throw new NativeError("training-label CLI success nonclaim differs");
    }
  }
  const parents = captureCount(output.parents);
  const trainingRecords = captureCount(output.training_records);
  if (parents !== 24_000) {
    throw new NativeError("training-label CLI parent count differs");
  }
  const work = fileEvidence(output.work);
  const train = fileEvidence(output.train);
  const result = fileEvidence(output.result);
  const manifest = fileEvidence(output.manifest);
  return frozenRecord({
    contract: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_SUCCESS_CONTRACT,
    status: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_SUCCESS_STATUS,
    mutation_purpose: MUTATION_PURPOSE,
    parents,
    training_records: trainingRecords,
    work_bytes: work.bytes,
    work_sha256: work.sha256,
    train_bytes: train.bytes,
    train_sha256: train.sha256,
    result_bytes: result.bytes,
    result_sha256: result.sha256,
    manifest_bytes: manifest.bytes,
    manifest_sha256: manifest.sha256,
    destination_content_reverified: true as const,
    purpose_bound_outer_lease_removed_durably: true as const,
    common_os_lock_released: true as const,
    raw_outer_receipt_disclosed: false as const,
    raw_owner_receipt_disclosed: false as const,
    raw_finalizer_receipt_disclosed: false as const,
    path_or_identity_disclosed: false as const,
    success_receipt_issued: true as const,
  });
}

function unknownFailure(runnerInvoked: boolean): Readonly<object> {
  return frozenRecord({
    contract: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_FAILURE_CONTRACT,
    status: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_FAILURE_STATUS,
    mutation_purpose: MUTATION_PURPOSE,
    phase: runnerInvoked ? "runner" : "capture",
    publication_may_have_occurred: runnerInvoked,
    lease_may_remain: runnerInvoked,
    cleanup_failure_count: runnerInvoked ? null : 0,
    retry_disposition: runnerInvoked
      ? "manual-publication-and-lease-reconciliation-required"
      : "fresh-invocation-required",
    raw_outer_receipt_disclosed: false as const,
    raw_owner_receipt_disclosed: false as const,
    raw_finalizer_receipt_disclosed: false as const,
    path_or_identity_disclosed: false as const,
    success_receipt_issued: false as const,
  });
}

function ownDataValue(
  descriptors: PropertyDescriptorMap,
  key: string,
): unknown {
  const descriptor = descriptors[key];
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable !== true
  ) {
    throw new NativeError("training-label CLI runner failure field differs");
  }
  return descriptor.value;
}

function sanitizedRunnerFailure(
  value: unknown,
  ErrorConstructor: RunnerModule["FloodgateV7TrainingLabelProductionRunnerError"],
): Readonly<object> | null {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      nodeIsProxy(value) ||
      !(value instanceof ErrorConstructor)
    ) {
      return null;
    }
    const descriptors = objectGetOwnPropertyDescriptors(value);
    const phase = ownDataValue(descriptors, "phase");
    const publicationMayHaveOccurred = ownDataValue(
      descriptors,
      "publication_may_have_occurred",
    );
    const leaseMayRemain = ownDataValue(descriptors, "lease_may_remain");
    const cleanupFailureCount = ownDataValue(
      descriptors,
      "cleanup_failure_count",
    );
    const retryDisposition = ownDataValue(descriptors, "retry_disposition");
    const rawOuterReceiptDisclosed = ownDataValue(
      descriptors,
      "raw_outer_receipt_disclosed",
    );
    const rawOwnerReceiptDisclosed = ownDataValue(
      descriptors,
      "raw_owner_receipt_disclosed",
    );
    const rawFinalizerReceiptDisclosed = ownDataValue(
      descriptors,
      "raw_finalizer_receipt_disclosed",
    );
    if (
      (phase !== "capture" && phase !== "outer-gate" && phase !== "receipt") ||
      typeof publicationMayHaveOccurred !== "boolean" ||
      typeof leaseMayRemain !== "boolean" ||
      (cleanupFailureCount !== null &&
        (!numberIsSafeInteger(cleanupFailureCount) ||
          (cleanupFailureCount as number) < 0)) ||
      (retryDisposition !== "fresh-invocation-required" &&
        retryDisposition !==
          "manual-publication-and-lease-reconciliation-required") ||
      rawOuterReceiptDisclosed !== false ||
      rawOwnerReceiptDisclosed !== false ||
      rawFinalizerReceiptDisclosed !== false
    ) {
      return null;
    }
    if (
      phase === "capture"
        ? publicationMayHaveOccurred ||
          leaseMayRemain ||
          cleanupFailureCount !== 0 ||
          retryDisposition !== "fresh-invocation-required"
        : !publicationMayHaveOccurred ||
          !leaseMayRemain ||
          cleanupFailureCount !== null ||
          retryDisposition !==
            "manual-publication-and-lease-reconciliation-required"
    ) {
      return null;
    }
    return frozenRecord({
      contract: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_FAILURE_CONTRACT,
      status: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_FAILURE_STATUS,
      mutation_purpose: MUTATION_PURPOSE,
      phase,
      publication_may_have_occurred: publicationMayHaveOccurred,
      lease_may_remain: leaseMayRemain,
      cleanup_failure_count: cleanupFailureCount as number | null,
      retry_disposition: retryDisposition,
      raw_outer_receipt_disclosed: false as const,
      raw_owner_receipt_disclosed: false as const,
      raw_finalizer_receipt_disclosed: false as const,
      path_or_identity_disclosed: false as const,
      success_receipt_issued: false as const,
    });
  } catch {
    return null;
  }
}

function writeOutput(stream: NodeJS.WriteStream, value: string): Promise<void> {
  return new NativePromise((resolve, reject) => {
    let settled = false;
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      scheduleImmediate(() => {
        stream.off("error", onError);
        reject(error);
      });
    };
    stream.on("error", onError);
    try {
      stream.write(value, (error) => {
        if (error) {
          onError(error);
          return;
        }
        if (settled) return;
        settled = true;
        stream.off("error", onError);
        resolve();
      });
    } catch (error) {
      onError(
        error instanceof Error
          ? error
          : new NativeError("production training-label CLI output failed"),
      );
    }
  });
}

/** Test-only stream seam. It never loads or invokes the production runner. */
export function writeFloodgateV7TrainingLabelProductionOutputCoreForTests(
  stream: NodeJS.WriteStream,
  value: string,
): Promise<void> {
  if (arguments.length !== 2) {
    return NativePromise.reject(
      new TypeError(
        "test production training-label output accepts two arguments",
      ),
    );
  }
  return writeOutput(stream, value);
}

async function executeCli(): Promise<void> {
  let runnerInvoked = false;
  let runner: RunnerModule | undefined;
  try {
    if (
      process.argv.length !== 2 ||
      process.version !== REQUIRED_NODE_VERSION
    ) {
      throw new NativeError("production training-label CLI invocation differs");
    }
    /* eslint-disable @typescript-eslint/no-require-imports -- Deliberately lazy after argv and runtime checks. */
    const loadedRunner =
      require("./floodgate-v7-training-label-production-runner") as RunnerModule;
    /* eslint-enable @typescript-eslint/no-require-imports */
    runner = loadedRunner;
    const operation = runner.runFloodgateV7TrainingLabelProduction;
    if (typeof operation !== "function") {
      throw new NativeError("production training-label runner export differs");
    }
    runnerInvoked = true;
    const rawRunnerReceipt = await nativeReflectApply(operation, undefined, []);
    const publicReceipt = sanitizedSuccess(rawRunnerReceipt);
    try {
      await writeOutput(process.stdout, `${stringify(publicReceipt)}\n`);
      return;
    } catch {
      throw new NativeError("production training-label success output failed");
    }
  } catch (failure) {
    process.exitCode = 1;
    let projection: Readonly<object>;
    try {
      projection =
        runner === undefined
          ? unknownFailure(runnerInvoked)
          : (sanitizedRunnerFailure(
              failure,
              runner.FloodgateV7TrainingLabelProductionRunnerError,
            ) ?? unknownFailure(runnerInvoked));
    } catch {
      projection = unknownFailure(runnerInvoked);
    }
    try {
      await writeOutput(process.stderr, `${stringify(projection)}\n`);
    } catch {
      // The fixed nonzero exit status remains authoritative if stderr closes.
    }
  }
}

export function runFloodgateV7TrainingLabelProductionCli(): Promise<void> {
  if (arguments.length !== 0) {
    return NativePromise.reject(
      new TypeError("production training-label CLI accepts no arguments"),
    );
  }
  return executeCli();
}
