/**
 * Argumentless operator entry point for one immutable private production
 * connector-registry provisioning run. Operational configuration is derived
 * only by the provisioner after argv has been rejected and the implementation
 * has been loaded lazily.
 */

import { types as nodeUtilTypes } from "node:util";

import type {
  FloodgateV7ProductionConnectorRegistryProvisionerError,
  FloodgateV7ProductionConnectorRegistryProvisionerReceipt,
} from "./floodgate-v7-production-connector-registry-provisioner";

export const FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_CONTRACT =
  "shogi-floodgate-v7-production-connector-registry-provision-failure-v1" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_STATUS =
  "production-connector-registry-provisioning-did-not-issue-a-success-receipt" as const;

const REQUIRED_NODE_VERSION = "v22.13.0" as const;
const PROVISIONER_CONTRACT =
  "shogi-floodgate-v7-production-connector-registry-provisioner-v1" as const;
const PROVISIONER_STATUS =
  "immutable-private-run-registry-created-bound-and-postflight-validated" as const;
const PROVISIONER_EXECUTION_BOUNDARY =
  "production-fixed-current-euid-private-registry-provisioning" as const;
const scheduleImmediate = setImmediate;
const stringify = JSON.stringify.bind(JSON);
const nodeIsProxy = nodeUtilTypes.isProxy;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
let registryMayHaveBeenCreatedForPublicFailure = false;

const SUCCESS_KEYS = objectFreeze([
  "contract",
  "status",
  "execution_boundary",
  "verification",
  "nonclaims",
] as const);
const VERIFICATION_KEYS = objectFreeze([
  "approved_record_current_key_binding_checked",
  "approved_record_bound_into_registry",
  "run_id_generated_from_32_byte_csprng",
  "fixed_configuration_only",
  "create_only_install_succeeded",
  "registry_loader_postflight_succeeded",
  "exact_private_claim_postflight_succeeded",
  "sensitive_values_exported",
] as const);
const NONCLAIM_KEYS = objectFreeze([
  "run_id_disclosed",
  "approved_record_digest_disclosed",
  "key_instance_id_disclosed",
  "owner_uid_disclosed",
  "path_disclosed",
  "filesystem_identity_disclosed",
  "key_material_disclosed",
  "gate_executed",
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
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of reflectOwnKeys(descriptors)) {
    if (typeof key !== "string") continue;
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error("registry provision CLI record differs");
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

function exactDataRecord(
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
    throw new Error("registry provision CLI value differs");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(value);
  if (ownKeys.length !== keys.length) {
    throw new Error("registry provision CLI record size differs");
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = ownKeys[index];
    const descriptor = typeof key === "string" ? descriptors[key] : undefined;
    if (
      key !== keys[index] ||
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new Error("registry provision CLI record shape differs");
    }
  }
  return value as Record<string, unknown>;
}

function fixedFailureProjection(registryMayHaveBeenCreated: boolean) {
  return frozenRecord({
    contract:
      FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_STATUS,
    phase: registryMayHaveBeenCreated ? "unknown" : "capture",
    durability: registryMayHaveBeenCreated
      ? "registry-may-have-been-created"
      : "no-registry-change-established",
    registry_may_have_been_created: registryMayHaveBeenCreated,
    retry_disposition: registryMayHaveBeenCreated
      ? "registry-reconciliation-required"
      : "fresh-invocation-required",
    sensitive_values_disclosed: false as const,
    success_receipt_issued: false as const,
  });
}

const NO_CHANGE_OUTPUT_FAILURE = `${stringify(fixedFailureProjection(false))}\n`;
const POSSIBLY_CREATED_OUTPUT_FAILURE = `${stringify(
  fixedFailureProjection(true),
)}\n`;

type ProvisionerModule = Readonly<{
  FloodgateV7ProductionConnectorRegistryProvisionerError: new (
    ...arguments_: never[]
  ) => FloodgateV7ProductionConnectorRegistryProvisionerError;
  provisionFloodgateV7ProductionConnectorRegistry: () => Promise<
    Readonly<FloodgateV7ProductionConnectorRegistryProvisionerReceipt>
  >;
}>;

function writeOutput(stream: NodeJS.WriteStream, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
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
          : new Error("production connector registry output failed"),
      );
    }
  });
}

/** Test-only output boundary; it never loads or invokes the provisioner. */
export function writeFloodgateV7ProductionConnectorRegistryProvisionOutputCoreForTests(
  stream: NodeJS.WriteStream,
  value: string,
): Promise<void> {
  if (arguments.length !== 2) {
    return Promise.reject(
      new TypeError("test registry provision output accepts two arguments"),
    );
  }
  return writeOutput(stream, value);
}

function validFailurePhase(value: unknown): value is string {
  switch (value) {
    case "capture":
    case "approved-current-binding":
    case "approved-enrollment":
    case "configuration":
    case "entropy":
    case "installation":
    case "postflight":
      return true;
    default:
      return false;
  }
}

function sanitizedFailure(
  value: unknown,
  ErrorConstructor: ProvisionerModule["FloodgateV7ProductionConnectorRegistryProvisionerError"],
): Readonly<Record<string, unknown>> | null {
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
    const phase = descriptors.phase;
    const durability = descriptors.durability;
    const mayHaveCreated = descriptors.registry_may_have_been_created;
    const retryDisposition = descriptors.retry_disposition;
    if (
      phase === undefined ||
      !("value" in phase) ||
      !validFailurePhase(phase.value) ||
      durability === undefined ||
      !("value" in durability) ||
      (durability.value !== "no-registry-change-established" &&
        durability.value !== "registry-may-have-been-created") ||
      mayHaveCreated === undefined ||
      !("value" in mayHaveCreated) ||
      typeof mayHaveCreated.value !== "boolean" ||
      retryDisposition === undefined ||
      !("value" in retryDisposition) ||
      (retryDisposition.value !== "safe-to-retry-after-not-installed" &&
        retryDisposition.value !== "do-not-retry-existing-registry" &&
        retryDisposition.value !== "manual-reconciliation-required" &&
        retryDisposition.value !== "fresh-invocation-required" &&
        retryDisposition.value !== "registry-reconciliation-required") ||
      (mayHaveCreated.value === true) !==
        (durability.value === "registry-may-have-been-created") ||
      (mayHaveCreated.value === true &&
        (retryDisposition.value === "safe-to-retry-after-not-installed" ||
          retryDisposition.value === "fresh-invocation-required")) ||
      (phase.value === "postflight" &&
        (mayHaveCreated.value !== true ||
          retryDisposition.value !== "registry-reconciliation-required")) ||
      (phase.value === "installation" &&
        mayHaveCreated.value === false &&
        retryDisposition.value !== "safe-to-retry-after-not-installed" &&
        retryDisposition.value !== "do-not-retry-existing-registry" &&
        retryDisposition.value !== "manual-reconciliation-required") ||
      (phase.value !== "installation" &&
        phase.value !== "postflight" &&
        (mayHaveCreated.value !== false ||
          retryDisposition.value !== "fresh-invocation-required"))
    ) {
      return null;
    }
    return frozenRecord({
      contract:
        FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_CONTRACT,
      status:
        FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_STATUS,
      phase: phase.value,
      durability: durability.value,
      registry_may_have_been_created: mayHaveCreated.value,
      retry_disposition: retryDisposition.value,
      sensitive_values_disclosed: false as const,
      success_receipt_issued: false as const,
    });
  } catch {
    return null;
  }
}

function sanitizedSuccess(value: unknown): Readonly<Record<string, unknown>> {
  const receipt = exactDataRecord(value, SUCCESS_KEYS);
  const verification = exactDataRecord(receipt.verification, VERIFICATION_KEYS);
  const nonclaims = exactDataRecord(receipt.nonclaims, NONCLAIM_KEYS);
  if (
    receipt.contract !== PROVISIONER_CONTRACT ||
    receipt.status !== PROVISIONER_STATUS ||
    receipt.execution_boundary !== PROVISIONER_EXECUTION_BOUNDARY ||
    verification.approved_record_current_key_binding_checked !== true ||
    verification.approved_record_bound_into_registry !== true ||
    verification.run_id_generated_from_32_byte_csprng !== true ||
    verification.fixed_configuration_only !== true ||
    verification.create_only_install_succeeded !== true ||
    verification.registry_loader_postflight_succeeded !== true ||
    verification.exact_private_claim_postflight_succeeded !== true ||
    verification.sensitive_values_exported !== false
  ) {
    throw new Error("registry provision CLI success differs");
  }
  for (const key of NONCLAIM_KEYS) {
    if (nonclaims[key] !== false) {
      throw new Error("registry provision CLI nonclaim differs");
    }
  }
  return frozenRecord({
    contract: PROVISIONER_CONTRACT,
    status: PROVISIONER_STATUS,
    execution_boundary: PROVISIONER_EXECUTION_BOUNDARY,
    verification: frozenRecord({
      approved_record_current_key_binding_checked: true as const,
      approved_record_bound_into_registry: true as const,
      run_id_generated_from_32_byte_csprng: true as const,
      fixed_configuration_only: true as const,
      create_only_install_succeeded: true as const,
      registry_loader_postflight_succeeded: true as const,
      exact_private_claim_postflight_succeeded: true as const,
      sensitive_values_exported: false as const,
    }),
    nonclaims: frozenRecord({
      run_id_disclosed: false as const,
      approved_record_digest_disclosed: false as const,
      key_instance_id_disclosed: false as const,
      owner_uid_disclosed: false as const,
      path_disclosed: false as const,
      filesystem_identity_disclosed: false as const,
      key_material_disclosed: false as const,
      gate_executed: false as const,
      checkpoint: false as const,
      dataset_read: false as const,
      teacher_label: false as const,
      training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
}

async function main(): Promise<void> {
  if (process.argv.length !== 2 || process.version !== REQUIRED_NODE_VERSION) {
    throw new Error(
      "production connector registry provisioner invocation differs",
    );
  }

  // Keep this require after the argument check. Invalid argv must not even load
  // a module that captures or can touch the production namespace.
  const provisioner =
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Deliberate post-argv lazy production boundary.
    require("./floodgate-v7-production-connector-registry-provisioner") as ProvisionerModule;

  let receipt: Readonly<FloodgateV7ProductionConnectorRegistryProvisionerReceipt>;
  try {
    // From the instant this boundary is invoked, an unknown failure must assume
    // that create-only publication may have crossed its commit point.
    registryMayHaveBeenCreatedForPublicFailure = true;
    receipt =
      await provisioner.provisionFloodgateV7ProductionConnectorRegistry();
  } catch (failure) {
    const projection = sanitizedFailure(
      failure,
      provisioner.FloodgateV7ProductionConnectorRegistryProvisionerError,
    );
    if (projection !== null) {
      registryMayHaveBeenCreatedForPublicFailure =
        projection.registry_may_have_been_created === true;
      await writeOutput(process.stderr, `${stringify(projection)}\n`);
      process.exitCode = 1;
      return;
    }
    throw failure;
  }

  // Provisioning has succeeded before serialization or output starts. Any
  // subsequent failure must conservatively assume that the registry exists.
  await writeOutput(
    process.stdout,
    `${stringify(sanitizedSuccess(receipt))}\n`,
  );
}

if (require.main === module) {
  const suppressPublicStreamFailure = (): void => {
    process.exitCode = 1;
  };
  process.stdout.on("error", suppressPublicStreamFailure);
  process.stderr.on("error", suppressPublicStreamFailure);
  void main().catch(async () => {
    process.exitCode = 1;
    try {
      await writeOutput(
        process.stderr,
        registryMayHaveBeenCreatedForPublicFailure
          ? POSSIBLY_CREATED_OUTPUT_FAILURE
          : NO_CHANGE_OUTPUT_FAILURE,
      );
    } catch {
      // The fixed exit status remains authoritative if stderr is also closed.
    }
  });
}
