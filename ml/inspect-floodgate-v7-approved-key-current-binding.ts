/**
 * Argumentless native-launcher-only operator readiness check for the fixed
 * approved/current-key binding. The verifier is loaded only after execution
 * provenance is claimed, and public output is rebuilt from exact allowlists.
 */

import { types as nodeUtilTypes } from "node:util";

import { assertFloodgateV7ProductionApplicationEntrypointContext } from "./floodgate-v7-production-application-source-provenance";
import { claimFloodgateV7ProductionNativeLauncherAttestation } from "./floodgate-v7-production-native-launcher-attestation";

export const FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLI_SUCCESS_CONTRACT =
  "shogi-floodgate-v7-approved-key-current-binding-readiness-cli-success-v1" as const;
export const FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLI_FAILURE_CONTRACT =
  "shogi-floodgate-v7-approved-key-current-binding-readiness-cli-failure-v1" as const;

interface CurrentBindingModule {
  readonly FloodgateV7ApprovedKeyCurrentBindingError: new (
    ...arguments_: never[]
  ) => Error;
  readonly verifyFloodgateV7ApprovedKeyCurrentBinding: () => Promise<unknown>;
}

type CurrentBindingPhase =
  | "capture"
  | "approved-record-load"
  | "current-key-inspection"
  | "approved-record-claim"
  | "expected-binding"
  | "comparison"
  | "receipt";

const NativeError = Error;
const NativePromise = Promise;
const NativeTypeError = TypeError;
const scheduleImmediate = setImmediate;
const jsonStringify = JSON.stringify.bind(JSON);
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const REQUIRED_NODE_VERSION = "v22.13.0" as const;
const ENTRYPOINT =
  "ml/inspect-floodgate-v7-approved-key-current-binding.ts" as const;
const CORE_CONTRACT =
  "shogi-floodgate-v7-approved-key-current-binding-preflight-v1" as const;
const CORE_STATUS =
  "approved-record-exactly-matches-fresh-current-key" as const;
const CORE_CLAIM_BOUNDARY =
  "read-only-memory-only-approved-record-to-fresh-current-key-binding-diagnostic-without-exported-sensitive-values-or-authority-v1" as const;
const CORE_EXECUTION_BOUNDARY =
  "production-fixed-current-euid-userinfo-home-approved-record-current-key-binding" as const;
const CORE_ALGORITHM =
  "approved-record-to-fresh-current-key-eight-field-strict-equality-v1" as const;
const TOP_KEYS = objectFreeze([
  "algorithm",
  "claim_boundary",
  "contract",
  "execution_boundary",
  "nonclaims",
  "status",
  "verification",
] as const);
const VERIFICATION_KEYS = objectFreeze([
  "approved_record_validated",
  "current_key_freshly_inspected",
  "exact_binding_match",
  "held_descriptors_revalidated",
  "memory_only",
  "sensitive_values_exported",
] as const);
const NONCLAIM_KEYS = objectFreeze([
  "single_use_capability_returned",
  "approved_claim_returned",
  "approval_created",
  "record_created_or_written",
  "key_created_or_written",
  "run_authority",
  "stage_authority",
  "connector_authority",
  "checkpoint_key_capability",
  "checkpoint",
  "runtime",
  "dataset_read",
  "teacher_label",
  "training",
  "weight",
  "live_evaluation_activation",
  "match",
  "playing_strength",
] as const);
const PHASES = objectFreeze([
  "capture",
  "approved-record-load",
  "current-key-inspection",
  "approved-record-claim",
  "expected-binding",
  "comparison",
  "receipt",
] as const);

function defineData(target: object, key: string, value: unknown): void {
  objectDefineProperty(target, key, {
    configurable: false,
    enumerable: true,
    writable: false,
    value,
  });
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of reflectOwnKeys(descriptors)) {
    if (typeof key !== "string") {
      throw new NativeError("current-binding CLI record differs");
    }
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new NativeError("current-binding CLI record differs");
    }
    defineData(output, key, descriptor.value);
  }
  return objectFreeze(output);
}

function hasExpectedKey(
  expectedKeys: readonly string[],
  candidate: string,
): boolean {
  for (const expected of expectedKeys) {
    if (candidate === expected) return true;
  }
  return false;
}

function dataRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError("current-binding CLI value is not a plain record");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (keys.length !== expectedKeys.length) {
    throw new NativeError("current-binding CLI record key count differs");
  }
  for (const key of keys) {
    if (typeof key !== "string" || !hasExpectedKey(expectedKeys, key)) {
      throw new NativeError("current-binding CLI record key differs");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("current-binding CLI record is not plain data");
    }
  }
  return value as Record<string, unknown>;
}

function sanitizedSuccess(value: unknown): Readonly<object> {
  const receipt = dataRecord(value, TOP_KEYS);
  const verification = dataRecord(receipt.verification, VERIFICATION_KEYS);
  const nonclaims = dataRecord(receipt.nonclaims, NONCLAIM_KEYS);
  if (
    receipt.contract !== CORE_CONTRACT ||
    receipt.status !== CORE_STATUS ||
    receipt.claim_boundary !== CORE_CLAIM_BOUNDARY ||
    receipt.execution_boundary !== CORE_EXECUTION_BOUNDARY ||
    receipt.algorithm !== CORE_ALGORITHM
  ) {
    throw new NativeError("current-binding CLI receipt differs");
  }
  for (const key of VERIFICATION_KEYS) {
    const expected = key === "sensitive_values_exported" ? false : true;
    if (verification[key] !== expected) {
      throw new NativeError("current-binding CLI verification differs");
    }
  }
  for (const key of NONCLAIM_KEYS) {
    if (nonclaims[key] !== false) {
      throw new NativeError("current-binding CLI nonclaim differs");
    }
  }
  return frozenRecord({
    contract: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLI_SUCCESS_CONTRACT,
    status: CORE_STATUS,
    claim_boundary: CORE_CLAIM_BOUNDARY,
    verification: frozenRecord({
      approved_record_validated: true as const,
      current_key_freshly_inspected: true as const,
      exact_binding_match: true as const,
      held_descriptors_revalidated: true as const,
      memory_only: true as const,
      sensitive_values_exported: false as const,
    }),
    nonclaims: publicNonclaims(),
    success_receipt_issued: true as const,
  });
}

function isPhase(value: unknown): value is CurrentBindingPhase {
  for (const phase of PHASES) {
    if (value === phase) return true;
  }
  return false;
}

function publicNonclaims(): Readonly<object> {
  return frozenRecord({
    sensitive_identity_values_disclosed: false as const,
    application_revision_path_or_digest_disclosed: false as const,
    key_identity_material_or_path_disclosed: false as const,
    uid_or_home_disclosed: false as const,
    approval_record_or_key_content_or_namespace_mutation_performed:
      false as const,
    reconciliation_performed: false as const,
    reconciliation_authority: false as const,
    run_stage_connector_or_checkpoint_authority: false as const,
    dataset_teacher_training_weight_live_match_or_strength_evidence:
      false as const,
    ignored_untracked_dependency_bytes_verified: false as const,
    same_uid_race_isolation: false as const,
    atomic_source_snapshot: false as const,
    tool_byte_closure_verified: false as const,
    atomic_process_lineage_snapshot: false as const,
    same_uid_or_ancestor_hostile_process_isolation: false as const,
    production_managed_namespace_or_file_content_mutation_performed:
      false as const,
    atime_invariance: false as const,
  });
}

function failurePhase(
  error: unknown,
  ErrorConstructor:
    | CurrentBindingModule["FloodgateV7ApprovedKeyCurrentBindingError"]
    | undefined,
): CurrentBindingPhase {
  try {
    if (
      ErrorConstructor === undefined ||
      typeof ErrorConstructor !== "function" ||
      nodeIsProxy(ErrorConstructor) ||
      error === null ||
      typeof error !== "object" ||
      nodeIsProxy(error) ||
      !(error instanceof ErrorConstructor)
    ) {
      return "capture";
    }
    const descriptors = objectGetOwnPropertyDescriptors(error);
    const phase = descriptors.phase;
    const receiptIssued = descriptors.receipt_issued;
    const authorityIssued = descriptors.authority_issued;
    if (
      phase !== undefined &&
      "value" in phase &&
      isPhase(phase.value) &&
      receiptIssued !== undefined &&
      "value" in receiptIssued &&
      receiptIssued.value === false &&
      authorityIssued !== undefined &&
      "value" in authorityIssued &&
      authorityIssued.value === false
    ) {
      return phase.value;
    }
  } catch {
    // Hostile constructors, proxies, or descriptors collapse to capture.
  }
  return "capture";
}

function sanitizedFailure(
  error?: unknown,
  ErrorConstructor?: CurrentBindingModule["FloodgateV7ApprovedKeyCurrentBindingError"],
): Readonly<object> {
  return frozenRecord({
    contract: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLI_FAILURE_CONTRACT,
    status: "approved-current-binding-readiness-did-not-issue-success" as const,
    phase: failurePhase(error, ErrorConstructor),
    approved_current_binding_ready: false as const,
    receipt_issued: false as const,
    nonclaims: publicNonclaims(),
    raw_failure_disclosed: false as const,
    private_values_disclosed: false as const,
    success_receipt_issued: false as const,
  });
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
        error instanceof NativeError
          ? error
          : new NativeError("approved current-binding CLI output failed"),
      );
    }
  });
}

/** Test-only output seam; it never loads or invokes the production verifier. */
export function writeFloodgateV7ApprovedKeyCurrentBindingOutputCoreForTests(
  stream: NodeJS.WriteStream,
  value: string,
): Promise<void> {
  if (arguments.length !== 2) {
    return NativePromise.reject(
      new NativeTypeError(
        "test current-binding output accepts exactly two arguments",
      ),
    );
  }
  return writeOutput(stream, value);
}

export async function runFloodgateV7ApprovedKeyCurrentBindingCli(): Promise<void> {
  let ErrorConstructor:
    | CurrentBindingModule["FloodgateV7ApprovedKeyCurrentBindingError"]
    | undefined;
  try {
    if (
      arguments.length !== 0 ||
      process.argv.length !== 2 ||
      process.version !== REQUIRED_NODE_VERSION
    ) {
      throw new NativeError("approved current-binding CLI invocation differs");
    }
    claimFloodgateV7ProductionNativeLauncherAttestation(ENTRYPOINT);
    assertFloodgateV7ProductionApplicationEntrypointContext(ENTRYPOINT);
    /* eslint-disable @typescript-eslint/no-require-imports -- Deliberately lazy after native launch and entrypoint guards. */
    const currentBinding =
      require("./floodgate-v7-approved-key-current-binding") as CurrentBindingModule;
    /* eslint-enable @typescript-eslint/no-require-imports */
    const operation = currentBinding.verifyFloodgateV7ApprovedKeyCurrentBinding;
    const errorConstructor =
      currentBinding.FloodgateV7ApprovedKeyCurrentBindingError;
    if (
      typeof operation !== "function" ||
      nodeIsProxy(operation) ||
      typeof errorConstructor !== "function" ||
      nodeIsProxy(errorConstructor)
    ) {
      throw new NativeError("approved current-binding module differs");
    }
    ErrorConstructor = errorConstructor;
    const verifyFloodgateV7ApprovedKeyCurrentBinding = operation;
    const receipt = await verifyFloodgateV7ApprovedKeyCurrentBinding();
    await writeOutput(
      process.stdout,
      `${jsonStringify(sanitizedSuccess(receipt))}\n`,
    );
  } catch (error) {
    process.exitCode = 1;
    const failure = sanitizedFailure(error, ErrorConstructor);
    try {
      await writeOutput(process.stderr, `${jsonStringify(failure)}\n`);
    } catch {
      // The nonzero exit remains authoritative if stderr is unavailable.
    }
  }
}

if (require.main === module) {
  void runFloodgateV7ApprovedKeyCurrentBindingCli();
}
