/**
 * Argumentless, read-only readiness inspection for the fixed Floodgate v7
 * production application checkout. No path, revision, digest, capability, or
 * mutation authority crosses this public boundary.
 */

import { types as nodeUtilTypes } from "node:util";

import {
  assertFloodgateV7ProductionApplicationEntrypointContext,
  captureFloodgateV7ProductionApplicationSourceProvenance,
  FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT,
} from "./floodgate-v7-production-application-source-provenance";
import { claimFloodgateV7ProductionNativeLauncherAttestation } from "./floodgate-v7-production-native-launcher-attestation";

export const FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CONTRACT =
  "shogi-floodgate-v7-production-application-source-readiness-v1" as const;
export const FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_STATUS =
  "fixed-application-source-exact-clean-tracked-closure-observed" as const;
export const FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CLAIM_BOUNDARY =
  "point-in-time-read-only-exact-clean-tracked-application-source-observation-without-registry-gate-or-deployment-authority-v1" as const;
export const FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_EXECUTION_BOUNDARY =
  "production-fixed-current-euid-userinfo-home-production-application" as const;
export const FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CLI_SUCCESS_CONTRACT =
  "shogi-floodgate-v7-production-application-source-readiness-cli-success-v1" as const;
export const FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CLI_FAILURE_CONTRACT =
  "shogi-floodgate-v7-production-application-source-readiness-cli-failure-v1" as const;

export interface FloodgateV7ProductionApplicationSourceReadinessReceipt {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CLAIM_BOUNDARY;
  readonly execution_boundary: typeof FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_EXECUTION_BOUNDARY;
  readonly verification: Readonly<{
    readonly fixed_current_euid_userinfo_home_repository_root: true;
    readonly exact_clean_tracked_source_closure_rechecked: true;
    readonly source_binding_captured_in_memory: true;
    readonly filesystem_namespace_or_file_content_mutation_performed: false;
    readonly sensitive_values_exported: false;
  }>;
  readonly nonclaims: Readonly<{
    readonly application_source_revision_disclosed: false;
    readonly application_source_path_disclosed: false;
    readonly application_source_digest_disclosed: false;
    readonly ignored_untracked_dependency_bytes_verified: false;
    readonly same_uid_race_isolation: false;
    readonly atomic_source_snapshot: false;
    readonly registry_created_loaded_or_modified: false;
    readonly gate_or_deployment_authority: false;
    readonly checkpoint: false;
    readonly teacher_label: false;
    readonly training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
  }>;
}

export class FloodgateV7ProductionApplicationSourceReadinessError extends Error {
  readonly phase!: "capture" | "source-verification" | "receipt";
  readonly source_ready!: false;
  readonly persistent_mutation_performed!: false;
  readonly sensitive_values_disclosed!: false;

  constructor(phase: "capture" | "source-verification" | "receipt") {
    super("Floodgate v7 production application source readiness failed");
    defineField(
      this,
      "name",
      "FloodgateV7ProductionApplicationSourceReadinessError",
      false,
    );
    defineField(
      this,
      "stack",
      "FloodgateV7ProductionApplicationSourceReadinessError: source readiness failed",
      false,
    );
    defineField(this, "phase", phase, true);
    defineField(this, "source_ready", false, true);
    defineField(this, "persistent_mutation_performed", false, true);
    defineField(this, "sensitive_values_disclosed", false, true);
    objectFreeze(this);
  }
}

const NativeError = Error;
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
const jsonStringify = JSON.stringify.bind(JSON);
const REQUIRED_NODE_VERSION = "v22.13.0" as const;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const ENTRYPOINT =
  "ml/inspect-floodgate-v7-production-application-source.ts" as const;

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
      throw new NativeError("source readiness record differs");
    }
    defineField(output, key, descriptor.value, descriptor.enumerable ?? false);
  }
  return objectFreeze(output);
}

function validateBinding(value: unknown): void {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new NativeError("source readiness binding differs");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (keys.length !== 2 || keys[0] !== "layout" || keys[1] !== "revision") {
    throw new NativeError("source readiness binding differs");
  }
  const layout = descriptors.layout;
  const revision = descriptors.revision;
  if (
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
    throw new NativeError("source readiness binding differs");
  }
}

function buildReceipt(): Readonly<FloodgateV7ProductionApplicationSourceReadinessReceipt> {
  return frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_STATUS,
    claim_boundary:
      FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CLAIM_BOUNDARY,
    execution_boundary:
      FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_EXECUTION_BOUNDARY,
    verification: frozenRecord({
      fixed_current_euid_userinfo_home_repository_root: true as const,
      exact_clean_tracked_source_closure_rechecked: true as const,
      source_binding_captured_in_memory: true as const,
      filesystem_namespace_or_file_content_mutation_performed: false as const,
      sensitive_values_exported: false as const,
    }),
    nonclaims: frozenRecord({
      application_source_revision_disclosed: false as const,
      application_source_path_disclosed: false as const,
      application_source_digest_disclosed: false as const,
      ignored_untracked_dependency_bytes_verified: false as const,
      same_uid_race_isolation: false as const,
      atomic_source_snapshot: false as const,
      registry_created_loaded_or_modified: false as const,
      gate_or_deployment_authority: false as const,
      checkpoint: false as const,
      teacher_label: false as const,
      training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
}

async function inspectWith(
  captureSource: () => Promise<unknown>,
): Promise<Readonly<FloodgateV7ProductionApplicationSourceReadinessReceipt>> {
  try {
    validateBinding(await reflectApply(captureSource, undefined, []));
  } catch {
    throw new FloodgateV7ProductionApplicationSourceReadinessError(
      "source-verification",
    );
  }
  try {
    return buildReceipt();
  } catch {
    throw new FloodgateV7ProductionApplicationSourceReadinessError("receipt");
  }
}

/** Test-only semantic boundary with no filesystem access. */
export function inspectFloodgateV7ProductionApplicationSourceReadinessCoreForTests(
  captureSource: () => Promise<unknown>,
): Promise<Readonly<FloodgateV7ProductionApplicationSourceReadinessReceipt>> {
  if (
    arguments.length !== 1 ||
    typeof captureSource !== "function" ||
    nodeIsProxy(captureSource)
  ) {
    return NativePromise.reject(
      new FloodgateV7ProductionApplicationSourceReadinessError("capture"),
    );
  }
  return inspectWith(captureSource);
}

/** Zero-argument production readiness observation. */
export function inspectFloodgateV7ProductionApplicationSourceReadiness(): Promise<
  Readonly<FloodgateV7ProductionApplicationSourceReadinessReceipt>
> {
  if (arguments.length !== 0) {
    return NativePromise.reject(
      new FloodgateV7ProductionApplicationSourceReadinessError("capture"),
    );
  }
  return inspectWith(captureFloodgateV7ProductionApplicationSourceProvenance);
}

function safeFailure(error: unknown): Readonly<object> {
  const phase =
    error instanceof FloodgateV7ProductionApplicationSourceReadinessError
      ? error.phase
      : "capture";
  return frozenRecord({
    contract:
      FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CLI_FAILURE_CONTRACT,
    status: "fixed-application-source-readiness-did-not-issue-success" as const,
    phase,
    source_ready: false as const,
    persistent_mutation_performed: false as const,
    sensitive_values_disclosed: false as const,
  });
}

async function runCli(): Promise<void> {
  try {
    if (
      process.argv.length !== 2 ||
      process.version !== REQUIRED_NODE_VERSION
    ) {
      throw new FloodgateV7ProductionApplicationSourceReadinessError("capture");
    }
    claimFloodgateV7ProductionNativeLauncherAttestation(ENTRYPOINT);
    assertFloodgateV7ProductionApplicationEntrypointContext(ENTRYPOINT);
    const receipt =
      await inspectFloodgateV7ProductionApplicationSourceReadiness();
    process.stdout.write(
      `${jsonStringify(
        frozenRecord({
          contract:
            FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CLI_SUCCESS_CONTRACT,
          status: "fixed-application-source-readiness-observed" as const,
          receipt,
        }),
      )}\n`,
    );
  } catch (error) {
    process.exitCode = 1;
    try {
      process.stderr.write(`${jsonStringify(safeFailure(error))}\n`);
    } catch {
      // The nonzero exit remains authoritative if stderr is unavailable.
    }
  }
}

if (require.main === module) {
  void runCli();
}
