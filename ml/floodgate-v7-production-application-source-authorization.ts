/**
 * Minimal pre-mutation authorization boundary for the fixed Floodgate v7
 * production application.
 *
 * A public CLI loads this module before loading any mutation graph. The module
 * checks the fixed entrypoint context, verifies the complete tracked Git byte
 * and mode closure, and mints one opaque capability. Ordinary mutation owners
 * consume that exact object in a fixed two-stage order. Registry provisioning
 * instead consumes the bootstrap capability into an opaque continuation and
 * can mint a distinct installer capability only after it has fixed the exact
 * installation input. A module loaded from a different checkout has different
 * WeakMaps and cannot claim, continue, or arm either capability.
 */

import { types as nodeUtilTypes } from "node:util";

import {
  assertFloodgateV7ProductionApplicationEntrypointContext,
  captureFloodgateV7ProductionApplicationSourceProvenance,
  FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT,
} from "./floodgate-v7-production-application-source-provenance";

export const FLOODGATE_V7_PRODUCTION_APPLICATION_EXECUTION_CAPABILITY_CONTRACT =
  "shogi-floodgate-v7-production-application-execution-capability-v2" as const;
export const FLOODGATE_V7_PRODUCTION_APPLICATION_EXECUTION_CAPABILITY_STATUS =
  "opaque-fixed-entry-exact-clean-tracked-source-late-armed-capability" as const;
export const FLOODGATE_V7_PRODUCTION_REGISTRY_PROVISIONER_CONTINUATION_CONTRACT =
  "shogi-floodgate-v7-production-registry-provisioner-continuation-v1" as const;
export const FLOODGATE_V7_PRODUCTION_REGISTRY_PROVISIONER_CONTINUATION_STATUS =
  "opaque-bootstrap-consumed-installer-not-armed" as const;

export type FloodgateV7ProductionApplicationExecutionPurpose =
  | "durable-prefix-100"
  | "durable-prefix-500"
  | "sealed-final-24000"
  | "training-label-finalization-24000"
  | "production-registry-provision";

export type FloodgateV7ProductionApplicationExecutionStage =
  "runner-entry" | "outer-owner" | "provisioner" | "installer";

export interface FloodgateV7ProductionApplicationExecutionCapability {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_APPLICATION_EXECUTION_CAPABILITY_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRODUCTION_APPLICATION_EXECUTION_CAPABILITY_STATUS;
}

export interface FloodgateV7ProductionRegistryProvisionerContinuation {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_REGISTRY_PROVISIONER_CONTINUATION_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRODUCTION_REGISTRY_PROVISIONER_CONTINUATION_STATUS;
}

export class FloodgateV7ProductionApplicationSourceAuthorizationError extends Error {
  readonly phase!: "capture" | "entrypoint" | "source-verification" | "claim";
  readonly capability_issued!: false;
  readonly persistent_mutation_performed!: false;
  readonly sensitive_values_disclosed!: false;

  constructor(
    phase: "capture" | "entrypoint" | "source-verification" | "claim",
  ) {
    super("Floodgate v7 production application source authorization failed");
    defineField(
      this,
      "name",
      "FloodgateV7ProductionApplicationSourceAuthorizationError",
      false,
    );
    defineField(
      this,
      "stack",
      "FloodgateV7ProductionApplicationSourceAuthorizationError: authorization failed",
      false,
    );
    defineField(this, "phase", phase, true);
    defineField(this, "capability_issued", false, true);
    defineField(this, "persistent_mutation_performed", false, true);
    defineField(this, "sensitive_values_disclosed", false, true);
    objectFreeze(this);
  }
}

interface CapabilityState {
  readonly purpose: FloodgateV7ProductionApplicationExecutionPurpose;
  readonly stages: readonly FloodgateV7ProductionApplicationExecutionStage[];
  nextStage: number;
}

interface ProvisionerContinuationState {
  readonly purpose: "production-registry-provision";
}

const NativePromise = Promise;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectPrototype = Object.prototype;
const reflectOwnKeys = Reflect.ownKeys;
const reflectApply = Reflect.apply;
const nodeIsProxy = nodeUtilTypes.isProxy;
const REQUIRED_NODE_VERSION = "v22.13.0" as const;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const productionCapabilities = new WeakMap<object, CapabilityState>();
const testCapabilities = new WeakMap<object, CapabilityState>();
const productionProvisionerContinuations = new WeakMap<
  object,
  ProvisionerContinuationState
>();
const testProvisionerContinuations = new WeakMap<
  object,
  ProvisionerContinuationState
>();
const REGISTRY_PROVISIONER_STAGES = objectFreeze(["provisioner"] as const);
const REGISTRY_INSTALLER_STAGES = objectFreeze(["installer"] as const);
const ORDINARY_EXECUTION_STAGES = objectFreeze([
  "runner-entry",
  "outer-owner",
] as const);

function defineField(
  target: object,
  key: PropertyKey,
  value: unknown,
  enumerable: boolean,
): void {
  objectDefineProperty(target, key, {
    configurable: false,
    enumerable,
    writable: false,
    value,
  });
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of reflectOwnKeys(descriptors)) {
    if (typeof key !== "string") continue;
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new FloodgateV7ProductionApplicationSourceAuthorizationError(
        "capture",
      );
    }
    defineField(output, key, descriptor.value, descriptor.enumerable ?? false);
  }
  return objectFreeze(output);
}

function capturePurpose(
  value: unknown,
): FloodgateV7ProductionApplicationExecutionPurpose {
  if (
    value !== "durable-prefix-100" &&
    value !== "durable-prefix-500" &&
    value !== "sealed-final-24000" &&
    value !== "training-label-finalization-24000" &&
    value !== "production-registry-provision"
  ) {
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError(
      "capture",
    );
  }
  return value;
}

function captureStage(
  value: unknown,
): FloodgateV7ProductionApplicationExecutionStage {
  if (
    value !== "runner-entry" &&
    value !== "outer-owner" &&
    value !== "provisioner" &&
    value !== "installer"
  ) {
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError("claim");
  }
  return value;
}

function expectedEntrypoint(
  purpose: FloodgateV7ProductionApplicationExecutionPurpose,
): string {
  switch (purpose) {
    case "durable-prefix-100":
      return "ml/run-floodgate-v7-production-connector-prefix-100.ts";
    case "durable-prefix-500":
      return "ml/run-floodgate-v7-production-connector-prefix-500.ts";
    case "sealed-final-24000":
      return "ml/run-floodgate-v7-production-connector-final-24000.ts";
    case "training-label-finalization-24000":
      return "ml/run-floodgate-v7-training-label-production.ts";
    case "production-registry-provision":
      return "ml/provision-floodgate-v7-production-connector-registry.ts";
  }
}

function expectedStages(
  purpose: FloodgateV7ProductionApplicationExecutionPurpose,
): readonly FloodgateV7ProductionApplicationExecutionStage[] {
  return purpose === "production-registry-provision"
    ? REGISTRY_PROVISIONER_STAGES
    : ORDINARY_EXECUTION_STAGES;
}

function validateSourceBinding(value: unknown): void {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError(
      "source-verification",
    );
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  const layout = descriptors.layout;
  const revision = descriptors.revision;
  if (
    keys.length !== 2 ||
    keys[0] !== "layout" ||
    keys[1] !== "revision" ||
    layout === undefined ||
    !("value" in layout) ||
    layout.enumerable !== true ||
    layout.value !== FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT ||
    revision === undefined ||
    !("value" in revision) ||
    revision.enumerable !== true ||
    typeof revision.value !== "string" ||
    !REVISION_RE.test(revision.value)
  ) {
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError(
      "source-verification",
    );
  }
}

function issueCapability(
  purpose: FloodgateV7ProductionApplicationExecutionPurpose,
  stages: readonly FloodgateV7ProductionApplicationExecutionStage[],
  registry: WeakMap<object, CapabilityState>,
): Readonly<FloodgateV7ProductionApplicationExecutionCapability> {
  const capability = frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_APPLICATION_EXECUTION_CAPABILITY_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_APPLICATION_EXECUTION_CAPABILITY_STATUS,
  });
  registry.set(capability, { purpose, stages, nextStage: 0 });
  return capability;
}

async function authorizeInto(
  purpose: FloodgateV7ProductionApplicationExecutionPurpose,
  captureSource: () => Promise<unknown>,
  registry: WeakMap<object, CapabilityState>,
): Promise<Readonly<FloodgateV7ProductionApplicationExecutionCapability>> {
  try {
    validateSourceBinding(await reflectApply(captureSource, undefined, []));
  } catch {
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError(
      "source-verification",
    );
  }
  return issueCapability(purpose, expectedStages(purpose), registry);
}

/**
 * Production bootstrap. It finishes the tracked-source closure before the
 * caller lazily loads any mutation-capable module.
 */
export function authorizeFloodgateV7ProductionApplicationExecution(
  purposeValue: FloodgateV7ProductionApplicationExecutionPurpose,
): Promise<Readonly<FloodgateV7ProductionApplicationExecutionCapability>> {
  let purpose: FloodgateV7ProductionApplicationExecutionPurpose;
  try {
    if (arguments.length !== 1 || process.version !== REQUIRED_NODE_VERSION) {
      throw new FloodgateV7ProductionApplicationSourceAuthorizationError(
        "capture",
      );
    }
    purpose = capturePurpose(purposeValue);
    assertFloodgateV7ProductionApplicationEntrypointContext(
      expectedEntrypoint(purpose),
    );
  } catch {
    return NativePromise.reject(
      new FloodgateV7ProductionApplicationSourceAuthorizationError(
        "entrypoint",
      ),
    );
  }
  return authorizeInto(
    purpose,
    captureFloodgateV7ProductionApplicationSourceProvenance,
    productionCapabilities,
  );
}

function claimFrom(
  capability: Readonly<FloodgateV7ProductionApplicationExecutionCapability>,
  purpose: FloodgateV7ProductionApplicationExecutionPurpose,
  stage: FloodgateV7ProductionApplicationExecutionStage,
  registry: WeakMap<object, CapabilityState>,
): void {
  if (
    capability === null ||
    typeof capability !== "object" ||
    nodeIsProxy(capability)
  ) {
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError("claim");
  }
  const state = registry.get(capability);
  if (state === undefined) {
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError("claim");
  }
  const expected = state.stages[state.nextStage];
  if (state.purpose !== purpose || expected !== stage) {
    registry.delete(capability);
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError("claim");
  }
  state.nextStage += 1;
  if (state.nextStage === state.stages.length) {
    registry.delete(capability);
  }
}

function claimProvisionerIntoContinuation(
  capability: Readonly<FloodgateV7ProductionApplicationExecutionCapability>,
  capabilityRegistry: WeakMap<object, CapabilityState>,
  continuationRegistry: WeakMap<object, ProvisionerContinuationState>,
): Readonly<FloodgateV7ProductionRegistryProvisionerContinuation> {
  claimFrom(
    capability,
    "production-registry-provision",
    "provisioner",
    capabilityRegistry,
  );
  const continuation = frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_REGISTRY_PROVISIONER_CONTINUATION_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_REGISTRY_PROVISIONER_CONTINUATION_STATUS,
  });
  continuationRegistry.set(continuation, {
    purpose: "production-registry-provision",
  });
  return continuation;
}

function armInstallerFromContinuation(
  continuation: Readonly<FloodgateV7ProductionRegistryProvisionerContinuation>,
  continuationRegistry: WeakMap<object, ProvisionerContinuationState>,
  capabilityRegistry: WeakMap<object, CapabilityState>,
): Readonly<FloodgateV7ProductionApplicationExecutionCapability> {
  if (
    continuation === null ||
    typeof continuation !== "object" ||
    nodeIsProxy(continuation) ||
    continuationRegistry.get(continuation)?.purpose !==
      "production-registry-provision"
  ) {
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError("claim");
  }
  continuationRegistry.delete(continuation);
  return issueCapability(
    "production-registry-provision",
    REGISTRY_INSTALLER_STAGES,
    capabilityRegistry,
  );
}

function revokeFrom<T>(value: object, registry: WeakMap<object, T>): void {
  registry.delete(value);
}

/** Consume one exact production capability stage in fixed order. */
export function claimFloodgateV7ProductionApplicationExecution(
  capability: Readonly<FloodgateV7ProductionApplicationExecutionCapability>,
  purposeValue: FloodgateV7ProductionApplicationExecutionPurpose,
  stageValue: FloodgateV7ProductionApplicationExecutionStage,
): void {
  if (arguments.length !== 3) {
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError("claim");
  }
  claimFrom(
    capability,
    capturePurpose(purposeValue),
    captureStage(stageValue),
    productionCapabilities,
  );
}

/**
 * Consume the production registry bootstrap and return an unarmed, opaque
 * continuation. The original capability is dead before this function returns.
 */
export function claimFloodgateV7ProductionRegistryProvisionerApplicationExecution(
  capability: Readonly<FloodgateV7ProductionApplicationExecutionCapability>,
): Readonly<FloodgateV7ProductionRegistryProvisionerContinuation> {
  if (arguments.length !== 1) {
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError("claim");
  }
  return claimProvisionerIntoContinuation(
    capability,
    productionCapabilities,
    productionProvisionerContinuations,
  );
}

/** Mint one distinct production installer capability from an unarmed continuation. */
export function armFloodgateV7ProductionRegistryInstallerApplicationExecution(
  continuation: Readonly<FloodgateV7ProductionRegistryProvisionerContinuation>,
): Readonly<FloodgateV7ProductionApplicationExecutionCapability> {
  if (arguments.length !== 1) {
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError("claim");
  }
  return armInstallerFromContinuation(
    continuation,
    productionProvisionerContinuations,
    productionCapabilities,
  );
}

/** Idempotently revoke an unarmed production registry continuation. */
export function revokeFloodgateV7ProductionRegistryProvisionerContinuation(
  continuation: Readonly<FloodgateV7ProductionRegistryProvisionerContinuation>,
): void {
  if (arguments.length !== 1) return;
  revokeFrom(continuation, productionProvisionerContinuations);
}

/** Idempotently revoke a production execution capability if it is still live. */
export function revokeFloodgateV7ProductionApplicationExecution(
  capability: Readonly<FloodgateV7ProductionApplicationExecutionCapability>,
): void {
  if (arguments.length !== 1) return;
  revokeFrom(capability, productionCapabilities);
}

/** Test-only source-verification seam backed by a separate capability registry. */
export function authorizeFloodgateV7ProductionApplicationExecutionCoreForTests(
  purposeValue: FloodgateV7ProductionApplicationExecutionPurpose,
  captureSource: () => Promise<unknown>,
): Promise<Readonly<FloodgateV7ProductionApplicationExecutionCapability>> {
  let purpose: FloodgateV7ProductionApplicationExecutionPurpose;
  try {
    if (
      arguments.length !== 2 ||
      typeof captureSource !== "function" ||
      nodeIsProxy(captureSource)
    ) {
      throw new FloodgateV7ProductionApplicationSourceAuthorizationError(
        "capture",
      );
    }
    purpose = capturePurpose(purposeValue);
  } catch {
    return NativePromise.reject(
      new FloodgateV7ProductionApplicationSourceAuthorizationError("capture"),
    );
  }
  return authorizeInto(purpose, captureSource, testCapabilities);
}

/** Test-only claim backed by the separate test registry. */
export function claimFloodgateV7ProductionApplicationExecutionCoreForTests(
  capability: Readonly<FloodgateV7ProductionApplicationExecutionCapability>,
  purposeValue: FloodgateV7ProductionApplicationExecutionPurpose,
  stageValue: FloodgateV7ProductionApplicationExecutionStage,
): void {
  if (arguments.length !== 3) {
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError("claim");
  }
  claimFrom(
    capability,
    capturePurpose(purposeValue),
    captureStage(stageValue),
    testCapabilities,
  );
}

/** Test-only bootstrap consumption backed by the isolated test registries. */
export function claimFloodgateV7ProductionRegistryProvisionerApplicationExecutionCoreForTests(
  capability: Readonly<FloodgateV7ProductionApplicationExecutionCapability>,
): Readonly<FloodgateV7ProductionRegistryProvisionerContinuation> {
  if (arguments.length !== 1) {
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError("claim");
  }
  return claimProvisionerIntoContinuation(
    capability,
    testCapabilities,
    testProvisionerContinuations,
  );
}

/** Test-only late installer arming backed by the isolated test registries. */
export function armFloodgateV7ProductionRegistryInstallerApplicationExecutionCoreForTests(
  continuation: Readonly<FloodgateV7ProductionRegistryProvisionerContinuation>,
): Readonly<FloodgateV7ProductionApplicationExecutionCapability> {
  if (arguments.length !== 1) {
    throw new FloodgateV7ProductionApplicationSourceAuthorizationError("claim");
  }
  return armInstallerFromContinuation(
    continuation,
    testProvisionerContinuations,
    testCapabilities,
  );
}

/** Test-only idempotent continuation revocation. */
export function revokeFloodgateV7ProductionRegistryProvisionerContinuationCoreForTests(
  continuation: Readonly<FloodgateV7ProductionRegistryProvisionerContinuation>,
): void {
  if (arguments.length !== 1) return;
  revokeFrom(continuation, testProvisionerContinuations);
}

/** Test-only idempotent execution-capability revocation. */
export function revokeFloodgateV7ProductionApplicationExecutionCoreForTests(
  capability: Readonly<FloodgateV7ProductionApplicationExecutionCapability>,
): void {
  if (arguments.length !== 1) return;
  revokeFrom(capability, testCapabilities);
}
