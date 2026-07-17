/**
 * Argumentless public CLI for the fixed fresh prefix-100 read-only preflight.
 * Runtime and argv are checked before the implementation is loaded, and all
 * output is rebuilt from fixed allowlists.
 */

import { types as nodeUtilTypes } from "node:util";

import { assertFloodgateV7ProductionApplicationEntrypointContext } from "./floodgate-v7-production-application-source-provenance";

export const FLOODGATE_V7_PREFIX_100_PREFLIGHT_CLI_SUCCESS_CONTRACT =
  "shogi-floodgate-v7-production-prefix-100-preflight-cli-success-v3" as const;
export const FLOODGATE_V7_PREFIX_100_PREFLIGHT_CLI_FAILURE_CONTRACT =
  "shogi-floodgate-v7-production-prefix-100-preflight-cli-failure-v3" as const;

interface PreflightModule {
  readonly FloodgateV7ProductionPrefix100PreflightError: new (
    ...arguments_: never[]
  ) => Error;
  readonly inspectFloodgateV7ProductionPrefix100Preflight: () => Promise<unknown>;
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
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const REQUIRED_NODE_VERSION = "v22.13.0" as const;
const CORE_CONTRACT =
  "shogi-floodgate-v7-production-prefix-100-read-only-preflight-v3" as const;
const CORE_STATUS =
  "fresh-zero-work-application-source-bound-prefix-100-read-only-preconditions-observed" as const;
const CORE_CLAIM_BOUNDARY =
  "point-in-time-fixed-current-user-exact-clean-application-source-bound-read-only-observation-without-gate-authority-or-persistent-mutation-v3" as const;
const CORE_EXECUTION_BOUNDARY =
  "production-fixed-current-euid-userinfo-home-application-source-bound-common-os-lock" as const;
const TOP_KEYS = objectFreeze([
  "contract",
  "status",
  "claim_boundary",
  "execution_boundary",
  "gate",
  "decision",
  "outer_control",
  "verification",
  "nonclaims",
] as const);
const DECISION_KEYS = objectFreeze([
  "result",
  "scope",
  "gate_invocation_authorized",
] as const);
const VERIFICATION_KEYS = objectFreeze([
  "common_os_lock_acquired_nonblocking",
  "common_os_lock_held_through_all_checks",
  "registry_anchor_held_descriptor_and_bytes_revalidated",
  "private_registry_claimed_and_fixed_configuration_validated",
  "application_source_binding_matched_to_exact_clean_tracked_application_closure",
  "verifier_source_artifact_closure_rechecked",
  "deployment_key_metadata_ready",
  "approved_enrollment_loaded_and_registry_binding_matched",
  "fresh_current_key_binding_validated",
  "registry_root_and_runs_parent_held_descriptors_revalidated",
  "runs_parent_current_euid_exact_0700_and_empty_twice",
  "stage_destination_authorization_lease_and_work_absent_twice",
  "outer_control_absent_or_exact_empty_twice",
  "filesystem_namespace_or_file_content_mutation_performed",
  "common_os_lock_released_before_receipt",
] as const);
const NONCLAIM_KEYS = objectFreeze([
  "path_run_id_record_digest_key_instance_uid_or_inode_disclosed",
  "key_material_or_raw_error_disclosed",
  "registry_or_control_created_written_removed",
  "stage_checkpoint_or_authorization_lease_created_written_removed",
  "registry_or_approved_capability_returned",
  "application_source_revision_disclosed",
  "application_source_path_disclosed",
  "application_source_digest_disclosed",
  "ignored_untracked_dependency_bytes_verified",
  "same_uid_race_isolation",
  "atomic_source_snapshot",
  "reviewed_git_head_or_ci_status",
  "kill_reboot_drill_or_monitor_owner",
  "human_gate_approval",
  "gate_invoked",
  "checkpoint",
  "dataset_read",
  "teacher_label",
  "training",
  "weight",
  "live_evaluation_activation",
  "match",
  "playing_strength",
] as const);

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  for (const [key, descriptor] of Object.entries(
    objectGetOwnPropertyDescriptors(value),
  )) {
    if (!("value" in descriptor)) {
      throw new NativeError("preflight CLI record differs");
    }
    objectDefineProperty(output, key, {
      configurable: false,
      enumerable: true,
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
    throw new NativeError("preflight CLI value is not a record");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(value);
  if (ownKeys.length !== keys.length) {
    throw new NativeError("preflight CLI record key count differs");
  }
  for (const key of ownKeys) {
    if (typeof key !== "string" || !keys.includes(key)) {
      throw new NativeError("preflight CLI record key differs");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("preflight CLI record is not plain data");
    }
  }
  return value as Record<string, unknown>;
}

function sanitizedSuccess(value: unknown): Readonly<object> {
  const receipt = dataRecord(value, TOP_KEYS);
  const decision = dataRecord(receipt.decision, DECISION_KEYS);
  const verification = dataRecord(receipt.verification, VERIFICATION_KEYS);
  const nonclaims = dataRecord(receipt.nonclaims, NONCLAIM_KEYS);
  if (
    receipt.contract !== CORE_CONTRACT ||
    receipt.status !== CORE_STATUS ||
    receipt.claim_boundary !== CORE_CLAIM_BOUNDARY ||
    receipt.execution_boundary !== CORE_EXECUTION_BOUNDARY ||
    receipt.gate !== "durable-prefix-100" ||
    (receipt.outer_control !== "absent-pristine" &&
      receipt.outer_control !== "present-exact-empty") ||
    decision.result !== "GO" ||
    decision.scope !== "read-only-core-preconditions-only" ||
    decision.gate_invocation_authorized !== false
  ) {
    throw new NativeError("preflight CLI receipt differs");
  }
  for (const key of VERIFICATION_KEYS) {
    const expected =
      key === "filesystem_namespace_or_file_content_mutation_performed"
        ? false
        : true;
    if (verification[key] !== expected) {
      throw new NativeError("preflight CLI verification differs");
    }
  }
  if (NONCLAIM_KEYS.some((key) => nonclaims[key] !== false)) {
    throw new NativeError("preflight CLI nonclaim differs");
  }
  return frozenRecord({
    contract: FLOODGATE_V7_PREFIX_100_PREFLIGHT_CLI_SUCCESS_CONTRACT,
    status: CORE_STATUS,
    claim_boundary: CORE_CLAIM_BOUNDARY,
    execution_boundary: CORE_EXECUTION_BOUNDARY,
    gate: "durable-prefix-100" as const,
    decision: frozenRecord({
      result: "GO" as const,
      scope: "read-only-core-preconditions-only" as const,
      gate_invocation_authorized: false as const,
    }),
    outer_control: receipt.outer_control,
    verification: frozenRecord(
      Object.fromEntries(
        VERIFICATION_KEYS.map((key) => [
          key,
          key === "filesystem_namespace_or_file_content_mutation_performed"
            ? false
            : true,
        ]),
      ),
    ),
    nonclaims: frozenRecord(
      Object.fromEntries(NONCLAIM_KEYS.map((key) => [key, false])),
    ),
    success_receipt_issued: true as const,
  });
}

function isPhase(value: unknown): value is string {
  return [
    "capture",
    "production-identity",
    "outer-gate-lock",
    "runs-namespace-open",
    "initial-snapshot",
    "outer-control",
    "registry-load",
    "registry-claim",
    "registry-fixed-configuration",
    "application-source",
    "verifier-readiness",
    "key-readiness",
    "approved-record-load",
    "approved-record-claim",
    "approved-binding",
    "current-binding",
    "final-snapshot",
    "cleanup",
    "receipt",
  ].includes(value as string);
}

function isRetryDisposition(value: unknown): value is string {
  return (
    value === "wait-for-current-owner-then-fresh-preflight" ||
    value === "fix-environment-then-fresh-preflight" ||
    value === "operator-reconciliation-required-no-gate"
  );
}

function sanitizedFailure(
  value?: unknown,
  ErrorConstructor?: PreflightModule["FloodgateV7ProductionPrefix100PreflightError"],
): Readonly<object> {
  let phase = "capture";
  let retryDisposition = "fix-environment-then-fresh-preflight";
  try {
    if (
      ErrorConstructor !== undefined &&
      value !== null &&
      typeof value === "object" &&
      !nodeIsProxy(value) &&
      value instanceof ErrorConstructor
    ) {
      const descriptors = objectGetOwnPropertyDescriptors(value);
      const phaseDescriptor = descriptors.phase;
      const retryDescriptor = descriptors.retry_disposition;
      const gateDescriptor = descriptors.gate;
      const mutationDescriptor = descriptors.persistent_mutation_performed;
      const invokedDescriptor = descriptors.gate_invoked;
      if (
        phaseDescriptor !== undefined &&
        "value" in phaseDescriptor &&
        retryDescriptor !== undefined &&
        "value" in retryDescriptor &&
        gateDescriptor !== undefined &&
        "value" in gateDescriptor &&
        mutationDescriptor !== undefined &&
        "value" in mutationDescriptor &&
        invokedDescriptor !== undefined &&
        "value" in invokedDescriptor &&
        isPhase(phaseDescriptor.value) &&
        isRetryDisposition(retryDescriptor.value) &&
        gateDescriptor.value === "durable-prefix-100" &&
        mutationDescriptor.value === false &&
        invokedDescriptor.value === false
      ) {
        phase = phaseDescriptor.value;
        retryDisposition = retryDescriptor.value;
      }
    }
  } catch {
    phase = "capture";
    retryDisposition = "fix-environment-then-fresh-preflight";
  }
  return frozenRecord({
    contract: FLOODGATE_V7_PREFIX_100_PREFLIGHT_CLI_FAILURE_CONTRACT,
    status: "fresh-prefix-100-preflight-did-not-issue-go" as const,
    gate: "durable-prefix-100" as const,
    decision: "NO-GO" as const,
    phase,
    retry_disposition: retryDisposition,
    persistent_mutation_performed: false as const,
    gate_invoked: false as const,
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
          : new NativeError("preflight CLI output failed"),
      );
    }
  });
}

/** Test-only output seam; it never loads or invokes production preflight. */
export function writeFloodgateV7ProductionPrefix100PreflightOutputCoreForTests(
  stream: NodeJS.WriteStream,
  value: string,
): Promise<void> {
  if (arguments.length !== 2) {
    return NativePromise.reject(
      new TypeError("preflight output test seam accepts two arguments"),
    );
  }
  return writeOutput(stream, value);
}

export async function runFloodgateV7ProductionPrefix100PreflightCli(): Promise<void> {
  let preflight: PreflightModule | undefined;
  try {
    if (
      arguments.length !== 0 ||
      process.argv.length !== 2 ||
      process.version !== REQUIRED_NODE_VERSION
    ) {
      throw new NativeError("preflight CLI invocation differs");
    }
    assertFloodgateV7ProductionApplicationEntrypointContext(
      "ml/inspect-floodgate-v7-production-prefix-100-preflight.ts",
    );
    /* eslint-disable @typescript-eslint/no-require-imports -- Deliberately lazy after argv and runtime guards. */
    preflight =
      require("./floodgate-v7-production-prefix-100-preflight") as PreflightModule;
    /* eslint-enable @typescript-eslint/no-require-imports */
    const operation = preflight.inspectFloodgateV7ProductionPrefix100Preflight;
    if (typeof operation !== "function") {
      throw new NativeError("preflight export differs");
    }
    const receipt = await Reflect.apply(operation, undefined, []);
    await writeOutput(
      process.stdout,
      `${stringify(sanitizedSuccess(receipt))}\n`,
    );
  } catch (error) {
    process.exitCode = 1;
    const failure = sanitizedFailure(
      error,
      preflight?.FloodgateV7ProductionPrefix100PreflightError,
    );
    try {
      await writeOutput(process.stderr, `${stringify(failure)}\n`);
    } catch {
      // The nonzero exit remains authoritative if stderr is unavailable.
    }
  }
}

if (require.main === module) {
  void runFloodgateV7ProductionPrefix100PreflightCli();
}
