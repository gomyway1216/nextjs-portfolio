/**
 * Minimal source authorization for the isolated Floodgate v7 production
 * recovery operator.
 *
 * The capability registry in this module is intentionally disjoint from every
 * production-application capability registry. Its sole current stage can only
 * authorize the explicit NOT-YET-IMPLEMENTED/STOP boundary.
 */

import { types as nodeUtilTypes } from "node:util";

import {
  assertFloodgateV7ProductionRecoveryOperatorEntrypointContext,
  captureFloodgateV7ProductionRecoveryOperatorSourceProvenance,
  FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_SOURCE_LAYOUT,
} from "./floodgate-v7-production-recovery-operator-source-provenance";
import { claimFloodgateV7ProductionRecoveryOperatorNativeLauncherAttestation } from "./floodgate-v7-production-recovery-operator-native-launcher-attestation";

export const FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_EXECUTION_CAPABILITY_CONTRACT =
  "shogi-floodgate-v7-production-recovery-operator-execution-capability-v1" as const;
export const FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_EXECUTION_CAPABILITY_STATUS =
  "opaque-fixed-recovery-entry-exact-clean-tracked-source-stop-only-capability" as const;

export type FloodgateV7ProductionRecoveryOperatorExecutionPurpose =
  "inspect-stale-prefix-100";
export type FloodgateV7ProductionRecoveryOperatorExecutionStage = "stop-entry";

export interface FloodgateV7ProductionRecoveryOperatorExecutionCapability {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_EXECUTION_CAPABILITY_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_EXECUTION_CAPABILITY_STATUS;
}

export class FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError extends Error {
  readonly phase!: "capture" | "entrypoint" | "source-verification" | "claim";
  readonly capability_issued!: false;
  readonly persistent_mutation_performed!: false;
  readonly sensitive_values_disclosed!: false;

  constructor(
    phase: "capture" | "entrypoint" | "source-verification" | "claim",
  ) {
    super(
      "Floodgate v7 production recovery operator source authorization failed",
    );
    defineField(
      this,
      "name",
      "FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError",
      false,
    );
    defineField(
      this,
      "stack",
      "FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError: authorization failed",
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
  readonly purpose: FloodgateV7ProductionRecoveryOperatorExecutionPurpose;
  readonly stage: FloodgateV7ProductionRecoveryOperatorExecutionStage;
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
const ENTRYPOINT =
  "ml/inspect-floodgate-v7-production-stale-prefix-100-recovery.ts" as const;

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
      throw new FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError(
        "capture",
      );
    }
    defineField(output, key, descriptor.value, descriptor.enumerable ?? false);
  }
  return objectFreeze(output);
}

function capturePurpose(
  value: unknown,
): FloodgateV7ProductionRecoveryOperatorExecutionPurpose {
  if (value !== "inspect-stale-prefix-100") {
    throw new FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError(
      "capture",
    );
  }
  return value;
}

function captureStage(
  value: unknown,
): FloodgateV7ProductionRecoveryOperatorExecutionStage {
  if (value !== "stop-entry") {
    throw new FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError(
      "claim",
    );
  }
  return value;
}

function validateSourceBinding(value: unknown): void {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError(
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
    layout.value !== FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_SOURCE_LAYOUT ||
    revision === undefined ||
    !("value" in revision) ||
    revision.enumerable !== true ||
    typeof revision.value !== "string" ||
    !REVISION_RE.test(revision.value)
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError(
      "source-verification",
    );
  }
}

function issueCapability(
  purpose: FloodgateV7ProductionRecoveryOperatorExecutionPurpose,
  registry: WeakMap<object, CapabilityState>,
): Readonly<FloodgateV7ProductionRecoveryOperatorExecutionCapability> {
  const capability = frozenRecord({
    contract:
      FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_EXECUTION_CAPABILITY_CONTRACT,
    status:
      FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_EXECUTION_CAPABILITY_STATUS,
  });
  registry.set(capability, { purpose, stage: "stop-entry" });
  return capability;
}

async function authorizeInto(
  purpose: FloodgateV7ProductionRecoveryOperatorExecutionPurpose,
  captureSource: () => Promise<unknown>,
  registry: WeakMap<object, CapabilityState>,
): Promise<Readonly<FloodgateV7ProductionRecoveryOperatorExecutionCapability>> {
  try {
    validateSourceBinding(await reflectApply(captureSource, undefined, []));
  } catch {
    throw new FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError(
      "source-verification",
    );
  }
  return issueCapability(purpose, registry);
}

/** Production bootstrap for the sole recovery STOP entrypoint. */
export function authorizeFloodgateV7ProductionRecoveryOperatorExecution(
  purposeValue: FloodgateV7ProductionRecoveryOperatorExecutionPurpose,
): Promise<Readonly<FloodgateV7ProductionRecoveryOperatorExecutionCapability>> {
  let purpose: FloodgateV7ProductionRecoveryOperatorExecutionPurpose;
  try {
    if (arguments.length !== 1 || process.version !== REQUIRED_NODE_VERSION) {
      throw new FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError(
        "capture",
      );
    }
    purpose = capturePurpose(purposeValue);
    claimFloodgateV7ProductionRecoveryOperatorNativeLauncherAttestation(
      ENTRYPOINT,
    );
    assertFloodgateV7ProductionRecoveryOperatorEntrypointContext(ENTRYPOINT);
  } catch {
    return NativePromise.reject(
      new FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError(
        "entrypoint",
      ),
    );
  }
  return authorizeInto(
    purpose,
    captureFloodgateV7ProductionRecoveryOperatorSourceProvenance,
    productionCapabilities,
  );
}

function claimFrom(
  capability: Readonly<FloodgateV7ProductionRecoveryOperatorExecutionCapability>,
  purpose: FloodgateV7ProductionRecoveryOperatorExecutionPurpose,
  stage: FloodgateV7ProductionRecoveryOperatorExecutionStage,
  registry: WeakMap<object, CapabilityState>,
): void {
  if (
    capability === null ||
    typeof capability !== "object" ||
    nodeIsProxy(capability)
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError(
      "claim",
    );
  }
  const state = registry.get(capability);
  registry.delete(capability);
  if (
    state === undefined ||
    state.purpose !== purpose ||
    state.stage !== stage
  ) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError(
      "claim",
    );
  }
}

/** Consume the exact production recovery STOP capability once. */
export function claimFloodgateV7ProductionRecoveryOperatorExecution(
  capability: Readonly<FloodgateV7ProductionRecoveryOperatorExecutionCapability>,
  purposeValue: FloodgateV7ProductionRecoveryOperatorExecutionPurpose,
  stageValue: FloodgateV7ProductionRecoveryOperatorExecutionStage,
): void {
  if (arguments.length !== 3) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError(
      "claim",
    );
  }
  claimFrom(
    capability,
    capturePurpose(purposeValue),
    captureStage(stageValue),
    productionCapabilities,
  );
}

/** Test-only source-verification seam with a separate capability registry. */
export function authorizeFloodgateV7ProductionRecoveryOperatorExecutionCoreForTests(
  purposeValue: FloodgateV7ProductionRecoveryOperatorExecutionPurpose,
  captureSource: () => Promise<unknown>,
): Promise<Readonly<FloodgateV7ProductionRecoveryOperatorExecutionCapability>> {
  let purpose: FloodgateV7ProductionRecoveryOperatorExecutionPurpose;
  try {
    if (
      arguments.length !== 2 ||
      typeof captureSource !== "function" ||
      nodeIsProxy(captureSource)
    ) {
      throw new FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError(
        "capture",
      );
    }
    purpose = capturePurpose(purposeValue);
  } catch {
    return NativePromise.reject(
      new FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError(
        "capture",
      ),
    );
  }
  return authorizeInto(purpose, captureSource, testCapabilities);
}

/** Test-only one-shot claim backed by the isolated test registry. */
export function claimFloodgateV7ProductionRecoveryOperatorExecutionCoreForTests(
  capability: Readonly<FloodgateV7ProductionRecoveryOperatorExecutionCapability>,
  purposeValue: FloodgateV7ProductionRecoveryOperatorExecutionPurpose,
  stageValue: FloodgateV7ProductionRecoveryOperatorExecutionStage,
): void {
  if (arguments.length !== 3) {
    throw new FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError(
      "claim",
    );
  }
  claimFrom(
    capability,
    capturePurpose(purposeValue),
    captureStage(stageValue),
    testCapabilities,
  );
}
