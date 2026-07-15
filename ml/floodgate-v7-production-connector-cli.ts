/**
 * Shared argumentless CLI boundary for the three fixed production connector
 * gates. The production runner is loaded only after argv has been rejected or
 * accepted, and both success and failure output are rebuilt from allowlists.
 */

import { types as nodeUtilTypes } from "node:util";

export const FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_SUCCESS_CONTRACT =
  "shogi-floodgate-v7-production-connector-cli-success-v1" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_SUCCESS_STATUS =
  "fixed-production-connector-gate-complete" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_FAILURE_CONTRACT =
  "shogi-floodgate-v7-production-connector-cli-failure-v1" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_FAILURE_STATUS =
  "fixed-production-connector-gate-did-not-issue-success" as const;

type Gate = "durable-prefix-100" | "durable-prefix-500" | "sealed-final-24000";
type RunnerExportName =
  | "runFloodgateV7ProductionConnectorPrefix100"
  | "runFloodgateV7ProductionConnectorPrefix500"
  | "runFloodgateV7ProductionConnectorFinal24000";

interface RunnerModule {
  readonly FloodgateV7ProductionConnectorRunnerError: new (
    ...arguments_: never[]
  ) => Error;
  readonly runFloodgateV7ProductionConnectorPrefix100: () => Promise<unknown>;
  readonly runFloodgateV7ProductionConnectorPrefix500: () => Promise<unknown>;
  readonly runFloodgateV7ProductionConnectorFinal24000: () => Promise<unknown>;
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
const RUNNER_CONTRACT =
  "shogi-floodgate-v7-production-connector-runner-v1" as const;
const RUNNER_STATUS =
  "registry-approved-current-bound-production-connector-gate-complete" as const;
const RUNNER_CLAIM_BOUNDARY =
  "one-fixed-production-gate-after-private-registry-approved-record-and-current-key-binding-without-public-run-binding-options-or-raw-connector-receipt-v1" as const;
const RUNNER_EXECUTION_BOUNDARY =
  "production-fixed-gate-private-registry-and-capability-owners" as const;
const REQUIRED_NODE_VERSION = "v22.13.0" as const;
const RUNNER_RECEIPT_KEYS = objectFreeze([
  "contract",
  "status",
  "claim_boundary",
  "execution_boundary",
  "gate",
  "checkpoint",
  "verification",
  "nonclaims",
] as const);
const RUNNER_CHECKPOINT_KEYS = objectFreeze([
  "target_parents",
  "sealed",
  "checkpoint_may_have_persisted",
] as const);
const RUNNER_VERIFICATION_KEYS = objectFreeze([
  "private_registry_claimed",
  "approved_record_binding_matched",
  "fresh_current_key_binding_validated",
  "connector_completed",
] as const);
const RUNNER_NONCLAIM_KEYS = objectFreeze([
  "run_id_disclosed",
  "approved_key_binding_disclosed",
  "connector_options_disclosed",
  "raw_connector_receipt_disclosed",
  "key_material_disclosed",
  "row_or_position_content_disclosed",
  "teacher_label",
  "optimizer_training",
  "weight",
  "live_evaluation_activation",
  "match",
  "playing_strength",
] as const);

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of reflectOwnKeys(descriptors)) {
    if (typeof key !== "string") continue;
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new NativeError("connector CLI record differs");
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
  keys?: readonly string[],
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError("connector CLI value is not a record");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(value);
  if (keys !== undefined && ownKeys.length !== keys.length) {
    throw new NativeError("connector CLI record key count differs");
  }
  for (const key of ownKeys) {
    if (
      typeof key !== "string" ||
      (keys !== undefined &&
        !nativeReflectApply(nativeArrayIncludes, keys, [key]))
    ) {
      throw new NativeError("connector CLI record key differs");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("connector CLI record is not plain data");
    }
  }
  return value as Record<string, unknown>;
}

function gateTarget(gate: Gate): 100 | 500 | 24_000 {
  return gate === "durable-prefix-100"
    ? 100
    : gate === "durable-prefix-500"
      ? 500
      : 24_000;
}

function sanitizedSuccess(value: unknown, gate: Gate): Readonly<object> {
  const receipt = dataRecord(value, RUNNER_RECEIPT_KEYS);
  const verification = dataRecord(
    receipt.verification,
    RUNNER_VERIFICATION_KEYS,
  );
  const checkpoint = dataRecord(receipt.checkpoint, RUNNER_CHECKPOINT_KEYS);
  const nonclaims = dataRecord(receipt.nonclaims, RUNNER_NONCLAIM_KEYS);
  if (
    receipt.contract !== RUNNER_CONTRACT ||
    receipt.status !== RUNNER_STATUS ||
    receipt.claim_boundary !== RUNNER_CLAIM_BOUNDARY ||
    receipt.execution_boundary !== RUNNER_EXECUTION_BOUNDARY ||
    receipt.gate !== gate ||
    checkpoint.target_parents !== gateTarget(gate) ||
    checkpoint.sealed !== (gate === "sealed-final-24000") ||
    checkpoint.checkpoint_may_have_persisted !== true ||
    verification.private_registry_claimed !== true ||
    verification.approved_record_binding_matched !== true ||
    verification.fresh_current_key_binding_validated !== true ||
    verification.connector_completed !== true
  ) {
    throw new NativeError("connector CLI success receipt differs");
  }
  for (const key of RUNNER_NONCLAIM_KEYS) {
    if (nonclaims[key] !== false) {
      throw new NativeError("connector CLI success nonclaim differs");
    }
  }
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_SUCCESS_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_SUCCESS_STATUS,
    gate,
    target_parents: gateTarget(gate),
    sealed: gate === "sealed-final-24000",
    checkpoint_may_have_persisted: true as const,
    fresh_current_key_binding_validated: true as const,
    raw_connector_receipt_disclosed: false as const,
    private_registry_values_disclosed: false as const,
    connector_options_disclosed: false as const,
    success_receipt_issued: true as const,
  });
}

function unknownFailure(gate: Gate, runnerInvoked: boolean): Readonly<object> {
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_FAILURE_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_FAILURE_STATUS,
    gate,
    phase: runnerInvoked ? "runner" : "capture",
    connector_invoked: runnerInvoked,
    checkpoint_may_have_persisted: runnerInvoked,
    retry_disposition: runnerInvoked
      ? "checkpoint-reconciliation-required"
      : "fresh-invocation-required",
    connector_phase: null,
    connector_retry_disposition: null,
    raw_connector_receipt_disclosed: false as const,
    private_registry_values_disclosed: false as const,
    connector_options_disclosed: false as const,
    success_receipt_issued: false as const,
  });
}

function isRunnerPhase(value: unknown): value is string {
  switch (value) {
    case "capture":
    case "registry-load":
    case "registry-claim":
    case "approved-record-load":
    case "approved-record-claim":
    case "approved-binding":
    case "current-binding":
    case "connector-enrollment-load":
    case "connector":
    case "receipt":
      return true;
    default:
      return false;
  }
}

function isConnectorPhase(value: unknown): value is string {
  switch (value) {
    case "capture":
    case "enrollment":
    case "readiness":
    case "coordinator-stage":
    case "handoff":
    case "key-prepare":
    case "key-instance":
    case "consumer":
    case "checkpoint":
    case "postflight":
    case "cleanup":
    case "receipt":
      return true;
    default:
      return false;
  }
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
    throw new NativeError("connector CLI runner failure field differs");
  }
  return descriptor.value;
}

function sanitizedRunnerFailure(
  value: unknown,
  gate: Gate,
  ErrorConstructor: RunnerModule["FloodgateV7ProductionConnectorRunnerError"],
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
    const failureGate = ownDataValue(descriptors, "gate");
    const connectorInvoked = ownDataValue(descriptors, "connector_invoked");
    const checkpointMayHavePersisted = ownDataValue(
      descriptors,
      "checkpoint_may_have_persisted",
    );
    const retryDisposition = ownDataValue(descriptors, "retry_disposition");
    const connectorPhase = ownDataValue(descriptors, "connector_phase");
    const connectorRetryDisposition = ownDataValue(
      descriptors,
      "connector_retry_disposition",
    );
    const rawReceiptDisclosed = ownDataValue(
      descriptors,
      "raw_connector_receipt_disclosed",
    );
    if (
      !isRunnerPhase(phase) ||
      failureGate !== gate ||
      typeof connectorInvoked !== "boolean" ||
      typeof checkpointMayHavePersisted !== "boolean" ||
      (retryDisposition !== "fresh-invocation-required" &&
        retryDisposition !== "operator-reconciliation-required" &&
        retryDisposition !== "checkpoint-reconciliation-required") ||
      (connectorPhase !== null && !isConnectorPhase(connectorPhase)) ||
      (connectorRetryDisposition !== null &&
        connectorRetryDisposition !== "provision-required" &&
        connectorRetryDisposition !== "operator-reconciliation-required" &&
        connectorRetryDisposition !== "checkpoint-reconciliation-required" &&
        connectorRetryDisposition !== "fresh-invocation-required") ||
      rawReceiptDisclosed !== false
    ) {
      return null;
    }

    const nestedFieldsAreNull =
      connectorPhase === null && connectorRetryDisposition === null;
    if (phase === "capture") {
      if (
        connectorInvoked ||
        checkpointMayHavePersisted ||
        retryDisposition !== "fresh-invocation-required" ||
        !nestedFieldsAreNull
      ) {
        return null;
      }
    } else if (phase === "connector") {
      if (!connectorInvoked) return null;
      if (nestedFieldsAreNull) {
        if (
          !checkpointMayHavePersisted ||
          retryDisposition !== "checkpoint-reconciliation-required"
        ) {
          return null;
        }
      } else if (
        connectorPhase === null ||
        connectorRetryDisposition === null ||
        checkpointMayHavePersisted !==
          (connectorRetryDisposition ===
            "checkpoint-reconciliation-required") ||
        retryDisposition !==
          (checkpointMayHavePersisted
            ? "checkpoint-reconciliation-required"
            : "operator-reconciliation-required")
      ) {
        return null;
      }
    } else if (phase === "receipt") {
      if (
        !connectorInvoked ||
        !checkpointMayHavePersisted ||
        retryDisposition !== "checkpoint-reconciliation-required" ||
        !nestedFieldsAreNull
      ) {
        return null;
      }
    } else if (
      connectorInvoked ||
      checkpointMayHavePersisted ||
      retryDisposition !== "operator-reconciliation-required" ||
      !nestedFieldsAreNull
    ) {
      return null;
    }

    return frozenRecord({
      contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_FAILURE_CONTRACT,
      status: FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_FAILURE_STATUS,
      gate,
      phase,
      connector_invoked: connectorInvoked,
      checkpoint_may_have_persisted: checkpointMayHavePersisted,
      retry_disposition: retryDisposition,
      connector_phase: connectorPhase,
      connector_retry_disposition: connectorRetryDisposition,
      raw_connector_receipt_disclosed: false as const,
      private_registry_values_disclosed: false as const,
      connector_options_disclosed: false as const,
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
          : new NativeError("production connector CLI output failed"),
      );
    }
  });
}

/** Test-only stream seam. It never loads or invokes a production runner. */
export function writeFloodgateV7ProductionConnectorOutputCoreForTests(
  stream: NodeJS.WriteStream,
  value: string,
): Promise<void> {
  if (arguments.length !== 2) {
    return NativePromise.reject(
      new TypeError("test production connector output accepts two arguments"),
    );
  }
  return writeOutput(stream, value);
}

async function executeCli(
  gate: Gate,
  runnerExportName: RunnerExportName,
): Promise<void> {
  let runnerInvoked = false;
  let runner: RunnerModule | undefined;
  try {
    if (
      process.argv.length !== 2 ||
      process.version !== REQUIRED_NODE_VERSION
    ) {
      throw new NativeError("production connector CLI invocation differs");
    }
    /* eslint-disable @typescript-eslint/no-require-imports -- Deliberately lazy after argv and runtime checks. */
    const loadedRunner =
      require("./floodgate-v7-production-connector-runner") as RunnerModule;
    /* eslint-enable @typescript-eslint/no-require-imports */
    runner = loadedRunner;
    const operation = runner[runnerExportName];
    if (typeof operation !== "function") {
      throw new NativeError("production connector runner export differs");
    }
    runnerInvoked = true;
    const rawRunnerReceipt = await nativeReflectApply(operation, undefined, []);
    const publicReceipt = sanitizedSuccess(rawRunnerReceipt, gate);
    try {
      await writeOutput(process.stdout, `${stringify(publicReceipt)}\n`);
      return;
    } catch {
      // A successful runner means the checkpoint may already be durable even
      // if serialization or the public stdout write did not complete.
      runnerInvoked = true;
      throw new NativeError("production connector success output failed");
    }
  } catch (failure) {
    process.exitCode = 1;
    let projection: Readonly<object>;
    try {
      projection =
        runner === undefined
          ? unknownFailure(gate, runnerInvoked)
          : (sanitizedRunnerFailure(
              failure,
              gate,
              runner.FloodgateV7ProductionConnectorRunnerError,
            ) ?? unknownFailure(gate, runnerInvoked));
    } catch {
      projection = unknownFailure(gate, runnerInvoked);
    }
    try {
      await writeOutput(process.stderr, `${stringify(projection)}\n`);
    } catch {
      // The fixed nonzero exit status remains authoritative if stderr closes.
    }
  }
}

export function runFloodgateV7ProductionConnectorPrefix100Cli(): Promise<void> {
  if (arguments.length !== 0) {
    return NativePromise.reject(
      new TypeError("prefix-100 connector CLI accepts no arguments"),
    );
  }
  return executeCli(
    "durable-prefix-100",
    "runFloodgateV7ProductionConnectorPrefix100",
  );
}

export function runFloodgateV7ProductionConnectorPrefix500Cli(): Promise<void> {
  if (arguments.length !== 0) {
    return NativePromise.reject(
      new TypeError("prefix-500 connector CLI accepts no arguments"),
    );
  }
  return executeCli(
    "durable-prefix-500",
    "runFloodgateV7ProductionConnectorPrefix500",
  );
}

export function runFloodgateV7ProductionConnectorFinal24000Cli(): Promise<void> {
  if (arguments.length !== 0) {
    return NativePromise.reject(
      new TypeError("final-24000 connector CLI accepts no arguments"),
    );
  }
  return executeCli(
    "sealed-final-24000",
    "runFloodgateV7ProductionConnectorFinal24000",
  );
}
