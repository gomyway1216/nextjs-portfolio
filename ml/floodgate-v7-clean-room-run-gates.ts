/**
 * Source/test-only owner for one clean-room V3 checkpoint stream.
 *
 * This module deliberately has no fixed runner, package command, production
 * capability, deployment key, dataset opener, label finalizer, trainer, or
 * live-weight boundary. A trusted preparation owner may pass only the opaque
 * one-shot grant minted while consuming exactly one test preparation
 * capability. The core:
 *
 * 1. proves the prepared work namespaces are still empty and measures fresh
 *    available space against the fixed 20 GiB threshold;
 * 2. creates one test-origin parent coordinator and consumes its existing
 *    checkpoint handoff once;
 * 3. issues only one opaque checkpoint authority at a time in the fixed
 *    100 -> 500 -> 24,000 order;
 * 4. validates that the three V3 receipts are one continuous authenticated
 *    stream with exact 0 -> 100 -> 500 resume points; and
 * 5. aborts/drains and closes the owner on every failure.
 *
 * The injected gate executor is a test seam. Its receipts are never
 * operational evidence, but even this boundary accepts only exact one-shot
 * receipts registered after successful deployment-key V3 checkpoint and
 * lease close. A later reviewed operational owner must claim each authority
 * and invoke the existing stage, row, deployment-key, and V3 checkpoint
 * capability owners; this module does not recreate their authentication.
 */

import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  claimFloodgateV7CleanRoomPreparedLocalRunGrant,
  claimFloodgateV7CleanRoomPreparedRunGrantCoreForTests,
  type FloodgateV7CleanRoomPreparedLocalRunGrant,
  type FloodgateV7CleanRoomPreparedRunGrantForTests,
  type FloodgateV7CleanRoomTeacherPlanForTests,
} from "./floodgate-v7-clean-room-teacher-runner";
import { FLOODGATE_V7_DEPLOYMENT_KEY_ID } from "./floodgate-v7-deployment-key-authority";
import {
  claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests,
  createFloodgateV7ProductionParentCoordinatorCoreForTests,
  type FloodgateV7ProductionParentCoordinator,
  type FloodgateV7ProductionParentCoordinatorCheckpointHandoff,
} from "./floodgate-v7-production-parent-coordinator";
import type { FloodgateV7ProductionRuntimeOwnerCoreDependencies } from "./floodgate-v7-production-runtime-owner";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  claimFloodgateV7DeploymentKeyTeacherCheckpointV3ReceiptCoreForTests,
  type FloodgateV7TeacherCheckpointV3Gate,
  type FloodgateV7TeacherCheckpointV3Receipt,
  type FloodgateV7TeacherProducerController,
} from "./floodgate-v7-teacher-checkpoint";

export const FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CONTRACT =
  "shogi-floodgate-v7-clean-room-run-gates-v1" as const;
export const FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_STATUS =
  "test-only-three-gate-continuity-contract-complete-owner-closed" as const;
export const FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CLAIM_BOUNDARY =
  "single-test-preparation-capability-opaque-one-shot-run-grant-fresh-20-gib-capacity-preflight-one-test-coordinator-handoff-three-ordered-single-use-v3-gate-authorities-three-one-shot-successful-deployment-key-v3-receipt-claims-exact-0-100-500-resume-chain-abort-drain-close-not-operational-teacher-label-finalizer-training-weight-live-or-strength-evidence" as const;
export const FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_TRUST_BOUNDARY =
  "trusted-current-process-js-realm-pr1-test-prepared-plan-existing-test-parent-coordinator-handoff-and-injected-authenticated-checkpoint-executor-v1" as const;
export const FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_GIB = 20 as const;
export const FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_BYTES =
  BigInt(FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_GIB) *
  BigInt(1024) *
  BigInt(1024) *
  BigInt(1024);
export const FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_SEQUENCE = Object.freeze([
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
] as const);

export type FloodgateV7CleanRoomRunGatePhase =
  | "capture"
  | "capacity"
  | "coordinator"
  | "handoff"
  | "durable-prefix-100"
  | "durable-prefix-500"
  | "sealed-final-24000"
  | "finalizer-handoff"
  | "cleanup"
  | "receipt";

export type FloodgateV7CleanRoomRunGateWorkStateDisposition =
  | "definitely-absent-fresh-retry-allowed"
  | "preserved-partial-reconciliation-required";

export interface FloodgateV7CleanRoomRunGateFailureEvidenceForTests {
  readonly phase: FloodgateV7CleanRoomRunGatePhase;
  readonly work_state_may_exist: boolean;
  readonly work_state_disposition: FloodgateV7CleanRoomRunGateWorkStateDisposition;
  readonly cleanup_failure_count: number;
  readonly sensitive_values_disclosed: false;
}

export class FloodgateV7CleanRoomRunGateError extends Error {
  readonly phase: FloodgateV7CleanRoomRunGatePhase;
  readonly work_state_may_exist: boolean;
  readonly work_state_disposition: FloodgateV7CleanRoomRunGateWorkStateDisposition;
  readonly cleanup_failure_count: number;
  readonly sensitive_values_disclosed = false as const;

  constructor(
    phase: FloodgateV7CleanRoomRunGatePhase,
    workStateMayExist: boolean,
    cleanupFailureCount = 0,
  ) {
    super("Floodgate v7 clean-room run gate failed");
    this.name = "FloodgateV7CleanRoomRunGateError";
    this.phase = phase;
    this.work_state_may_exist = workStateMayExist;
    this.work_state_disposition = workStateMayExist
      ? "preserved-partial-reconciliation-required"
      : "definitely-absent-fresh-retry-allowed";
    this.cleanup_failure_count = cleanupFailureCount;
    Object.defineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: `${this.name}: ${this.message}`,
    });
    Object.freeze(this);
  }
}

export interface FloodgateV7CleanRoomRunGateCapabilityForTests {
  readonly contract: typeof FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CONTRACT;
  readonly execution_boundary: "test-only-opaque-single-use-gate-authority";
}

export interface FloodgateV7CleanRoomRunGateClaimForTests {
  readonly contract: typeof FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CONTRACT;
  readonly claim_boundary: typeof FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CLAIM_BOUNDARY;
  readonly execution_boundary: "test-only-injected-authenticated-checkpoint-executor";
  readonly gate: FloodgateV7TeacherCheckpointV3Gate;
  readonly runId: string;
  readonly plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>;
  readonly runBinding: Readonly<
    FloodgateV7ProductionParentCoordinatorCheckpointHandoff["runBinding"]
  >;
  readonly producerController: Readonly<FloodgateV7TeacherProducerController>;
}

export interface FloodgateV7CleanRoomRunGateStatfs {
  readonly bsize: bigint;
  readonly bavail: bigint;
}

export interface FloodgateV7CleanRoomRunGateDependenciesForTests {
  readonly statfs: (
    cleanRoomFilesystemPath: string,
  ) => Promise<Readonly<FloodgateV7CleanRoomRunGateStatfs>>;
  readonly runtimeOwnerDependencies: Readonly<FloodgateV7ProductionRuntimeOwnerCoreDependencies>;
  readonly executeAuthenticatedCheckpointGate: (
    capability: Readonly<FloodgateV7CleanRoomRunGateCapabilityForTests>,
  ) => Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>>;
  readonly observeFailureForTests:
    | ((
        evidence: Readonly<FloodgateV7CleanRoomRunGateFailureEvidenceForTests>,
      ) => void)
    | undefined;
}

/**
 * Fixed local-only extension. The exact checkpoint receipt is branded by the
 * local runner after the raw-key test core has closed its stage lease. The
 * handoff callback is invoked only after all three branded receipts pass the
 * same-stream continuity checks and the runtime owner closes successfully.
 */
export interface FloodgateV7CleanRoomLocalRunGateDependencies
  extends FloodgateV7CleanRoomRunGateDependenciesForTests {
  readonly expectedCheckpointKeyId: string;
  readonly claimAuthenticatedCheckpointReceipt: (
    receipt: Readonly<FloodgateV7TeacherCheckpointV3Receipt>,
  ) => Readonly<FloodgateV7TeacherCheckpointV3Receipt>;
  readonly finalizeSealedChainHandoff: () => Promise<void>;
}

export interface FloodgateV7CleanRoomRunGatesReceipt {
  readonly contract: typeof FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CONTRACT;
  readonly status: typeof FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CLAIM_BOUNDARY;
  readonly trust_boundary: typeof FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_TRUST_BOUNDARY;
  readonly execution_boundary: "test-only-source-contract-not-operational-evidence";
  readonly capacity: Readonly<{
    readonly minimum_free_gib: typeof FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_GIB;
    readonly threshold_passed: true;
    readonly exact_available_bytes_published: false;
    readonly path_or_volume_published: false;
  }>;
  readonly gates: readonly [
    Readonly<{
      readonly order: 1;
      readonly gate: "durable-prefix-100";
      readonly target_parents: 100;
      readonly completed_parents: 100;
      readonly resumed_parents: 0;
      readonly sealed: false;
    }>,
    Readonly<{
      readonly order: 2;
      readonly gate: "durable-prefix-500";
      readonly target_parents: 500;
      readonly completed_parents: 500;
      readonly resumed_parents: 100;
      readonly sealed: false;
    }>,
    Readonly<{
      readonly order: 3;
      readonly gate: "sealed-final-24000";
      readonly target_parents: 24_000;
      readonly completed_parents: 24_000;
      readonly resumed_parents: 500;
      readonly sealed: true;
    }>,
  ];
  readonly continuity: Readonly<{
    readonly one_prepared_capability_consumed: true;
    readonly one_parent_coordinator_created: true;
    readonly one_checkpoint_handoff_claimed: true;
    readonly one_authenticated_stage_work_stream: true;
    readonly same_run_key_and_stage_identity: true;
    readonly milestone_100_chain_equal: true;
    readonly milestone_500_chain_equal: true;
    readonly prefix_500_exactly_resumed_100: true;
    readonly final_24000_exactly_resumed_500: true;
    readonly work_bytes_strictly_increased: true;
    readonly work_digest_changed_at_each_advance: true;
    readonly next_authority_issued_only_after_prior_receipt: true;
    readonly each_gate_authority_claimed_once: true;
    readonly owner_closed_after_final_receipt: true;
  }>;
  readonly recovery: Readonly<{
    readonly failure_aborts_and_drains_started_owner: true;
    readonly owner_close_joined_after_failure: true;
    readonly pre_gate_absence_is_distinguished_from_partial_state: true;
    readonly partial_state_is_preserved_for_reconciliation: true;
    readonly automatic_partial_state_deletion: false;
  }>;
  readonly nonclaims: Readonly<{
    readonly exact_free_space_or_path: false;
    readonly production_authority: false;
    readonly operational_checkpoint: false;
    readonly private_dataset_read: false;
    readonly teacher_success: false;
    readonly label_finalized: false;
    readonly optimizer_training: false;
    readonly weight_changed: false;
    readonly live_evaluation_activation: false;
    readonly match: false;
    readonly playing_strength: false;
    readonly stable_high_dan: false;
  }>;
}

interface CapturedDependencies {
  readonly statfs: FloodgateV7CleanRoomRunGateDependenciesForTests["statfs"];
  readonly runtimeOwnerDependencies: Readonly<FloodgateV7ProductionRuntimeOwnerCoreDependencies>;
  readonly executeAuthenticatedCheckpointGate: FloodgateV7CleanRoomRunGateDependenciesForTests["executeAuthenticatedCheckpointGate"];
  readonly observeFailureForTests: FloodgateV7CleanRoomRunGateDependenciesForTests["observeFailureForTests"];
}

interface CapturedLocalDependencies extends CapturedDependencies {
  readonly expectedCheckpointKeyId: string;
  readonly claimAuthenticatedCheckpointReceipt: FloodgateV7CleanRoomLocalRunGateDependencies["claimAuthenticatedCheckpointReceipt"];
  readonly finalizeSealedChainHandoff: FloodgateV7CleanRoomLocalRunGateDependencies["finalizeSealedChainHandoff"];
}

interface CheckpointReceiptAuthority {
  readonly expectedKeyId: string;
  readonly claim: (
    receipt: Readonly<FloodgateV7TeacherCheckpointV3Receipt>,
  ) => Readonly<FloodgateV7TeacherCheckpointV3Receipt>;
}

interface PrivateDirectoryIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

interface CapacityPreflightSnapshot {
  readonly root: Readonly<PrivateDirectoryIdentity>;
  readonly publication: Readonly<PrivateDirectoryIdentity>;
  readonly state: Readonly<PrivateDirectoryIdentity>;
}

interface RunSession {
  readonly plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>;
  readonly runId: string;
  readonly handoff: Readonly<FloodgateV7ProductionParentCoordinatorCheckpointHandoff>;
  readonly controller: Readonly<FloodgateV7TeacherProducerController>;
  activeOrdinal: number;
  workStateMayExist: boolean;
  closed: boolean;
}

interface GateAuthorityState {
  readonly session: RunSession;
  readonly gate: FloodgateV7TeacherCheckpointV3Gate;
  readonly ordinal: number;
  claimed: boolean;
}

interface CapturedGateReceipt {
  readonly receipt: Readonly<FloodgateV7TeacherCheckpointV3Receipt>;
  readonly gate: FloodgateV7TeacherCheckpointV3Gate;
  readonly runId: string;
  readonly keyId: string;
  readonly stage: Readonly<{
    readonly basename: string;
    readonly parentDev: string;
    readonly parentIno: string;
    readonly dev: string;
    readonly ino: string;
  }>;
  readonly records: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly resumedParents: number;
  readonly milestone100Mac: string;
  readonly milestone500Mac: string | null;
}

const MODE_MASK = BigInt(0o7777);
const PRIVATE_DIRECTORY_MODE = BigInt(0o700);
const LOWER_HEX_64 = /^[0-9a-f]{64}$/;
const CANONICAL_DECIMAL = /^(?:0|[1-9][0-9]*)$/;
const SAFE_STAGE_BASENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const objectPrototype = Object.prototype;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectIsFrozen = Object.isFrozen;
const objectHasOwn = Object.hasOwn;
const reflectOwnKeys = Reflect.ownKeys;
const nativeArrayIsArray = Array.isArray;
const nativePromiseResolve = Promise.resolve.bind(Promise);
const gateAuthorities = new WeakMap<object, GateAuthorityState>();

function rejected<T>(reason: unknown): Promise<T> {
  return Promise.reject(reason);
}

function isPlainNonProxyObject(value: unknown): value is object {
  return (
    value !== null &&
    typeof value === "object" &&
    !nativeArrayIsArray(value) &&
    !nodeUtilTypes.isProxy(value) &&
    (objectGetPrototypeOf(value) === objectPrototype ||
      objectGetPrototypeOf(value) === null)
  );
}

function dataProperty(value: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new Error("required data property differs");
  }
  return descriptor.value;
}

function assertFunction(
  value: unknown,
  arity: number,
): asserts value is (...arguments_: never[]) => unknown {
  if (
    typeof value !== "function" ||
    nodeUtilTypes.isProxy(value) ||
    value.length !== arity
  ) {
    throw new Error("dependency function differs");
  }
}

function captureRuntimeOwnerDependencies(
  value: unknown,
): Readonly<FloodgateV7ProductionRuntimeOwnerCoreDependencies> {
  if (!isPlainNonProxyObject(value) || !objectIsFrozen(value)) {
    throw new Error("runtime owner dependencies differ");
  }
  const expected = Object.freeze({
    createStableRuntime: 0,
    createTeacherRuntime: 0,
    getStableRuntimeReceiptDigest: 1,
    getTeacherRuntimeReceiptDigest: 1,
  } as const);
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (
    keys.length !== 4 ||
    keys.some((key) => typeof key !== "string" || !objectHasOwn(expected, key))
  ) {
    throw new Error("runtime owner dependency keys differ");
  }
  for (const key of keys) {
    if (typeof key !== "string") {
      throw new Error("runtime owner dependency key differs");
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.writable ||
      descriptor.configurable
    ) {
      throw new Error("runtime owner dependency descriptor differs");
    }
    assertFunction(descriptor.value, expected[key as keyof typeof expected]);
  }
  return value as Readonly<FloodgateV7ProductionRuntimeOwnerCoreDependencies>;
}

function captureDependencies(
  value: FloodgateV7CleanRoomRunGateDependenciesForTests,
): Readonly<CapturedDependencies> {
  if (!isPlainNonProxyObject(value) || !objectIsFrozen(value)) {
    throw new Error("dependencies differ");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  const expected = new Set([
    "statfs",
    "runtimeOwnerDependencies",
    "executeAuthenticatedCheckpointGate",
    "observeFailureForTests",
  ]);
  if (
    keys.length !== expected.size ||
    keys.some((key) => typeof key !== "string" || !expected.has(key))
  ) {
    throw new Error("dependency keys differ");
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.writable ||
      descriptor.configurable
    ) {
      throw new Error("dependency descriptors differ");
    }
  }
  const statfs = dataProperty(value, "statfs");
  const runtimeOwnerDependencies = dataProperty(
    value,
    "runtimeOwnerDependencies",
  );
  const executeAuthenticatedCheckpointGate = dataProperty(
    value,
    "executeAuthenticatedCheckpointGate",
  );
  const observeFailureForTests = dataProperty(value, "observeFailureForTests");
  assertFunction(statfs, 1);
  assertFunction(executeAuthenticatedCheckpointGate, 1);
  if (observeFailureForTests !== undefined) {
    assertFunction(observeFailureForTests, 1);
  }
  return Object.freeze({
    statfs: statfs as FloodgateV7CleanRoomRunGateDependenciesForTests["statfs"],
    runtimeOwnerDependencies: captureRuntimeOwnerDependencies(
      runtimeOwnerDependencies,
    ),
    executeAuthenticatedCheckpointGate:
      executeAuthenticatedCheckpointGate as FloodgateV7CleanRoomRunGateDependenciesForTests["executeAuthenticatedCheckpointGate"],
    observeFailureForTests:
      observeFailureForTests as FloodgateV7CleanRoomRunGateDependenciesForTests["observeFailureForTests"],
  });
}

type FloodgateV7CleanRoomLocalCheckpointKeyBoundary =
  | "test-only-nondeployment-key"
  | "fixed-local-deployment-key";

function captureLocalDependencies(
  value: FloodgateV7CleanRoomLocalRunGateDependencies,
  checkpointKeyBoundary: FloodgateV7CleanRoomLocalCheckpointKeyBoundary,
): Readonly<CapturedLocalDependencies> {
  if (!isPlainNonProxyObject(value) || !objectIsFrozen(value)) {
    throw new Error("local dependencies differ");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  const expected = new Set([
    "statfs",
    "runtimeOwnerDependencies",
    "executeAuthenticatedCheckpointGate",
    "observeFailureForTests",
    "expectedCheckpointKeyId",
    "claimAuthenticatedCheckpointReceipt",
    "finalizeSealedChainHandoff",
  ]);
  if (
    keys.length !== expected.size ||
    keys.some((key) => typeof key !== "string" || !expected.has(key))
  ) {
    throw new Error("local dependency keys differ");
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.writable ||
      descriptor.configurable
    ) {
      throw new Error("local dependency descriptors differ");
    }
  }
  const common = captureDependencies(
    Object.freeze({
      statfs: dataProperty(value, "statfs"),
      runtimeOwnerDependencies: dataProperty(value, "runtimeOwnerDependencies"),
      executeAuthenticatedCheckpointGate: dataProperty(
        value,
        "executeAuthenticatedCheckpointGate",
      ),
      observeFailureForTests: dataProperty(value, "observeFailureForTests"),
    }) as FloodgateV7CleanRoomRunGateDependenciesForTests,
  );
  const expectedCheckpointKeyId = dataProperty(
    value,
    "expectedCheckpointKeyId",
  );
  const claimAuthenticatedCheckpointReceipt = dataProperty(
    value,
    "claimAuthenticatedCheckpointReceipt",
  );
  const finalizeSealedChainHandoff = dataProperty(
    value,
    "finalizeSealedChainHandoff",
  );
  if (!regexMatches(SAFE_KEY_ID, expectedCheckpointKeyId)) {
    throw new Error("local checkpoint key id differs");
  }
  if (
    (checkpointKeyBoundary === "test-only-nondeployment-key" &&
      expectedCheckpointKeyId === FLOODGATE_V7_DEPLOYMENT_KEY_ID) ||
    (checkpointKeyBoundary === "fixed-local-deployment-key" &&
      expectedCheckpointKeyId !== FLOODGATE_V7_DEPLOYMENT_KEY_ID)
  ) {
    throw new Error("local checkpoint key id differs");
  }
  assertFunction(claimAuthenticatedCheckpointReceipt, 1);
  assertFunction(finalizeSealedChainHandoff, 0);
  return Object.freeze({
    ...common,
    expectedCheckpointKeyId,
    claimAuthenticatedCheckpointReceipt:
      claimAuthenticatedCheckpointReceipt as FloodgateV7CleanRoomLocalRunGateDependencies["claimAuthenticatedCheckpointReceipt"],
    finalizeSealedChainHandoff:
      finalizeSealedChainHandoff as FloodgateV7CleanRoomLocalRunGateDependencies["finalizeSealedChainHandoff"],
  });
}

/**
 * Validate the immutable dependency seam before a preparation owner consumes
 * its one-shot capability.
 */
export function assertFloodgateV7CleanRoomRunGateDependenciesCoreForTests(
  value: FloodgateV7CleanRoomRunGateDependenciesForTests,
): void {
  if (arguments.length !== 1) {
    throw new FloodgateV7CleanRoomRunGateError("capture", false);
  }
  try {
    captureDependencies(value);
  } catch {
    throw new FloodgateV7CleanRoomRunGateError("capture", false);
  }
}

/** Validate the fixed local-only dependency composition before grant use. */
export function assertFloodgateV7CleanRoomLocalRunGateDependencies(
  value: FloodgateV7CleanRoomLocalRunGateDependencies,
): void {
  if (arguments.length !== 1) {
    throw new FloodgateV7CleanRoomRunGateError("capture", false);
  }
  try {
    captureLocalDependencies(value, "fixed-local-deployment-key");
  } catch {
    throw new FloodgateV7CleanRoomRunGateError("capture", false);
  }
}

/** Validate the nondeployment local composition used only by test grants. */
export function assertFloodgateV7CleanRoomLocalRunGateDependenciesCoreForTests(
  value: FloodgateV7CleanRoomLocalRunGateDependencies,
): void {
  if (arguments.length !== 1) {
    throw new FloodgateV7CleanRoomRunGateError("capture", false);
  }
  try {
    captureLocalDependencies(value, "test-only-nondeployment-key");
  } catch {
    throw new FloodgateV7CleanRoomRunGateError("capture", false);
  }
}

/** Native bigint statfs adapter for synthetic, home-external test plans. */
export async function statfsFloodgateV7CleanRoomRunGateCoreForTests(
  cleanRoomFilesystemPath: string,
): Promise<Readonly<FloodgateV7CleanRoomRunGateStatfs>> {
  if (arguments.length !== 1) {
    throw new FloodgateV7CleanRoomRunGateError("capacity", false);
  }
  const value = await fs.promises.statfs(cleanRoomFilesystemPath, {
    bigint: true,
  });
  return Object.freeze({
    bsize: value.bsize,
    bavail: value.bavail,
  });
}

async function privateDirectoryIdentity(
  directory: string,
  effectiveUserId: number,
): Promise<Readonly<PrivateDirectoryIdentity>> {
  const stat = await fs.promises.lstat(directory, { bigint: true });
  if (
    (await fs.promises.realpath(directory)) !== directory ||
    !stat.isDirectory() ||
    stat.uid !== BigInt(effectiveUserId) ||
    (stat.mode & MODE_MASK) !== PRIVATE_DIRECTORY_MODE
  ) {
    throw new Error("private directory differs");
  }
  return Object.freeze({ dev: stat.dev, ino: stat.ino });
}

async function directoryIsEmpty(directory: string): Promise<boolean> {
  const entries = await fs.promises.readdir(directory);
  return entries.length === 0;
}

async function workStateDefinitelyAbsent(
  plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>,
  expected?: Readonly<CapacityPreflightSnapshot>,
): Promise<boolean> {
  try {
    const root = await privateDirectoryIdentity(
      plan.cleanRoomRoot,
      plan.effectiveUserId,
    );
    const publication = await privateDirectoryIdentity(
      plan.targets.publicationParent,
      plan.effectiveUserId,
    );
    const state = await privateDirectoryIdentity(
      plan.targets.stateRoot,
      plan.effectiveUserId,
    );
    return (
      (expected === undefined ||
        (root.dev === expected.root.dev &&
          root.ino === expected.root.ino &&
          publication.dev === expected.publication.dev &&
          publication.ino === expected.publication.ino &&
          state.dev === expected.state.dev &&
          state.ino === expected.state.ino)) &&
      (await directoryIsEmpty(plan.targets.publicationParent)) &&
      (await directoryIsEmpty(plan.targets.stateRoot))
    );
  } catch {
    return false;
  }
}

async function preflightCapacity(
  plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>,
  statfs: CapturedDependencies["statfs"],
): Promise<Readonly<CapacityPreflightSnapshot>> {
  const rootBefore = await privateDirectoryIdentity(
    plan.cleanRoomRoot,
    plan.effectiveUserId,
  );
  const publicationBefore = await privateDirectoryIdentity(
    plan.targets.publicationParent,
    plan.effectiveUserId,
  );
  const stateBefore = await privateDirectoryIdentity(
    plan.targets.stateRoot,
    plan.effectiveUserId,
  );
  if (
    !(await directoryIsEmpty(plan.targets.publicationParent)) ||
    !(await directoryIsEmpty(plan.targets.stateRoot))
  ) {
    throw new FloodgateV7CleanRoomRunGateError("capacity", true);
  }
  const probePromise = statfs(plan.targets.publicationParent);
  if (
    !nodeUtilTypes.isPromise(probePromise) ||
    nodeUtilTypes.isProxy(probePromise)
  ) {
    throw new Error("statfs promise differs");
  }
  const probe = await probePromise;
  if (!isPlainNonProxyObject(probe)) {
    throw new Error("statfs receipt differs");
  }
  const bsize = dataProperty(probe, "bsize");
  const bavail = dataProperty(probe, "bavail");
  if (
    typeof bsize !== "bigint" ||
    typeof bavail !== "bigint" ||
    bsize <= BigInt(0) ||
    bavail < BigInt(0)
  ) {
    throw new Error("statfs values differ");
  }
  const rootAfter = await privateDirectoryIdentity(
    plan.cleanRoomRoot,
    plan.effectiveUserId,
  );
  const publicationAfter = await privateDirectoryIdentity(
    plan.targets.publicationParent,
    plan.effectiveUserId,
  );
  const stateAfter = await privateDirectoryIdentity(
    plan.targets.stateRoot,
    plan.effectiveUserId,
  );
  if (
    rootBefore.dev !== rootAfter.dev ||
    rootBefore.ino !== rootAfter.ino ||
    publicationBefore.dev !== publicationAfter.dev ||
    publicationBefore.ino !== publicationAfter.ino ||
    stateBefore.dev !== stateAfter.dev ||
    stateBefore.ino !== stateAfter.ino ||
    !(await directoryIsEmpty(plan.targets.publicationParent)) ||
    !(await directoryIsEmpty(plan.targets.stateRoot))
  ) {
    throw new FloodgateV7CleanRoomRunGateError("capacity", true);
  }
  if (bsize * bavail < FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_BYTES) {
    throw new FloodgateV7CleanRoomRunGateError("capacity", false);
  }
  return Object.freeze({
    root: rootAfter,
    publication: publicationAfter,
    state: stateAfter,
  });
}

function mintGateAuthority(
  session: RunSession,
  gate: FloodgateV7TeacherCheckpointV3Gate,
  ordinal: number,
): Readonly<FloodgateV7CleanRoomRunGateCapabilityForTests> {
  if (
    session.closed ||
    session.activeOrdinal !== ordinal ||
    FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_SEQUENCE[ordinal] !== gate
  ) {
    throw new Error("gate order differs");
  }
  const capability = Object.freeze({
    contract: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CONTRACT,
    execution_boundary: "test-only-opaque-single-use-gate-authority" as const,
  });
  gateAuthorities.set(capability, {
    session,
    gate,
    ordinal,
    claimed: false,
  });
  return capability;
}

/**
 * Consume one currently active test-only gate authority. The returned plan is
 * synthetic/test-origin and must be passed to existing authenticated
 * checkpoint capability owners; it is never a public receipt.
 */
export function claimFloodgateV7CleanRoomRunGateCoreForTests(
  capability: Readonly<FloodgateV7CleanRoomRunGateCapabilityForTests>,
): Readonly<FloodgateV7CleanRoomRunGateClaimForTests> {
  if (
    arguments.length !== 1 ||
    capability === null ||
    typeof capability !== "object"
  ) {
    throw new FloodgateV7CleanRoomRunGateError("capture", false);
  }
  const state = gateAuthorities.get(capability);
  if (
    state === undefined ||
    state.claimed ||
    state.session.closed ||
    state.session.activeOrdinal !== state.ordinal
  ) {
    throw new FloodgateV7CleanRoomRunGateError(
      (state?.gate ?? "capture") as FloodgateV7CleanRoomRunGatePhase,
      state?.session.workStateMayExist ?? false,
    );
  }
  state.claimed = true;
  state.session.workStateMayExist = true;
  gateAuthorities.delete(capability);
  return Object.freeze({
    contract: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CONTRACT,
    claim_boundary: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CLAIM_BOUNDARY,
    execution_boundary:
      "test-only-injected-authenticated-checkpoint-executor" as const,
    gate: state.gate,
    runId: state.session.runId,
    plan: state.session.plan,
    runBinding: state.session.handoff.runBinding,
    producerController: state.session.controller,
  });
}

function regexMatches(expression: RegExp, value: unknown): value is string {
  return (
    typeof value === "string" &&
    RegExp.prototype.exec.call(expression, value) !== null
  );
}

function safeInteger(value: unknown, minimum = 0): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
  );
}

function receiptRecord(value: unknown): Record<string, unknown> {
  if (!isPlainNonProxyObject(value) || !objectIsFrozen(value)) {
    throw new Error("checkpoint receipt differs");
  }
  return value as Record<string, unknown>;
}

function captureGateReceipt(
  receiptValue: Readonly<FloodgateV7TeacherCheckpointV3Receipt>,
  expectedGate: FloodgateV7TeacherCheckpointV3Gate,
  expectedRunId: string,
  expectedKeyId: string,
): Readonly<CapturedGateReceipt> {
  const receipt = receiptRecord(receiptValue);
  const stage = receiptRecord(receipt.stage);
  const work = receiptRecord(receipt.work);
  const gateContract = receiptRecord(receipt.gate_contract);
  const expected =
    expectedGate === FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100
      ? Object.freeze({
          status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
          sealed: false,
          target: 100,
          resumed: 0,
          records: 102,
        })
      : expectedGate ===
          FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500
        ? Object.freeze({
            status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
            sealed: false,
            target: 500,
            resumed: 100,
            records: 503,
          })
        : Object.freeze({
            status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
            sealed: true,
            target: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
            resumed: 500,
            records: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS + 4,
          });
  const milestone100Mac = work.milestone_100_mac;
  const milestone500Mac = work.milestone_500_mac;
  if (
    receipt.contract !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA ||
    receipt.status !== expected.status ||
    receipt.claim_boundary !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY ||
    receipt.algorithm !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM ||
    receipt.run_id !== expectedRunId ||
    receipt.key_id !== expectedKeyId ||
    receipt.gate !== expectedGate ||
    receipt.sealed !== expected.sealed ||
    gateContract.schema !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT.schema ||
    gateContract.durable_prefix_100_parents !== 100 ||
    gateContract.durable_prefix_500_parents !== 500 ||
    gateContract.sealed_final_parents !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
    !regexMatches(SAFE_STAGE_BASENAME, stage.basename) ||
    !regexMatches(CANONICAL_DECIMAL, stage.parent_dev) ||
    !regexMatches(CANONICAL_DECIMAL, stage.parent_ino) ||
    !regexMatches(CANONICAL_DECIMAL, stage.dev) ||
    !regexMatches(CANONICAL_DECIMAL, stage.ino) ||
    work.filename !== FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME ||
    work.format !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT ||
    work.training_parents !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
    work.records !== expected.records ||
    !safeInteger(work.bytes, 1) ||
    !regexMatches(LOWER_HEX_64, work.sha256) ||
    work.target_parents !== expected.target ||
    work.completed_parents !== expected.target ||
    work.resumed_parents !== expected.resumed ||
    work.durability !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY ||
    !regexMatches(LOWER_HEX_64, milestone100Mac) ||
    (expectedGate === FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100
      ? milestone500Mac !== null
      : !regexMatches(LOWER_HEX_64, milestone500Mac))
  ) {
    throw new Error("checkpoint gate receipt differs");
  }
  return Object.freeze({
    receipt: receiptValue,
    gate: expectedGate,
    runId: expectedRunId,
    keyId: expectedKeyId,
    stage: Object.freeze({
      basename: stage.basename as string,
      parentDev: stage.parent_dev as string,
      parentIno: stage.parent_ino as string,
      dev: stage.dev as string,
      ino: stage.ino as string,
    }),
    records: work.records as number,
    bytes: work.bytes as number,
    sha256: work.sha256 as string,
    resumedParents: work.resumed_parents as number,
    milestone100Mac,
    milestone500Mac: milestone500Mac as string | null,
  });
}

function sameStage(
  left: Readonly<CapturedGateReceipt>,
  right: Readonly<CapturedGateReceipt>,
): boolean {
  return (
    left.runId === right.runId &&
    left.keyId === right.keyId &&
    left.stage.basename === right.stage.basename &&
    left.stage.parentDev === right.stage.parentDev &&
    left.stage.parentIno === right.stage.parentIno &&
    left.stage.dev === right.stage.dev &&
    left.stage.ino === right.stage.ino
  );
}

function validateReceiptChain(
  receipts: readonly [
    Readonly<CapturedGateReceipt>,
    Readonly<CapturedGateReceipt>,
    Readonly<CapturedGateReceipt>,
  ],
): void {
  const [prefix100, prefix500, final] = receipts;
  if (
    !sameStage(prefix100, prefix500) ||
    !sameStage(prefix500, final) ||
    prefix100.milestone100Mac !== prefix500.milestone100Mac ||
    prefix500.milestone100Mac !== final.milestone100Mac ||
    prefix500.milestone500Mac === null ||
    prefix500.milestone500Mac !== final.milestone500Mac ||
    !(prefix100.bytes < prefix500.bytes && prefix500.bytes < final.bytes) ||
    prefix100.sha256 === prefix500.sha256 ||
    prefix500.sha256 === final.sha256 ||
    prefix100.sha256 === final.sha256
  ) {
    throw new Error("checkpoint stream continuity differs");
  }
}

function buildReceipt(): Readonly<FloodgateV7CleanRoomRunGatesReceipt> {
  return Object.freeze({
    contract: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CONTRACT,
    status: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_STATUS,
    claim_boundary: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_TRUST_BOUNDARY,
    execution_boundary:
      "test-only-source-contract-not-operational-evidence" as const,
    capacity: Object.freeze({
      minimum_free_gib: FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_MINIMUM_FREE_GIB,
      threshold_passed: true as const,
      exact_available_bytes_published: false as const,
      path_or_volume_published: false as const,
    }),
    gates: Object.freeze([
      Object.freeze({
        order: 1 as const,
        gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
        target_parents: 100 as const,
        completed_parents: 100 as const,
        resumed_parents: 0 as const,
        sealed: false as const,
      }),
      Object.freeze({
        order: 2 as const,
        gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
        target_parents: 500 as const,
        completed_parents: 500 as const,
        resumed_parents: 100 as const,
        sealed: false as const,
      }),
      Object.freeze({
        order: 3 as const,
        gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
        target_parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
        completed_parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
        resumed_parents: 500 as const,
        sealed: true as const,
      }),
    ] as const),
    continuity: Object.freeze({
      one_prepared_capability_consumed: true as const,
      one_parent_coordinator_created: true as const,
      one_checkpoint_handoff_claimed: true as const,
      one_authenticated_stage_work_stream: true as const,
      same_run_key_and_stage_identity: true as const,
      milestone_100_chain_equal: true as const,
      milestone_500_chain_equal: true as const,
      prefix_500_exactly_resumed_100: true as const,
      final_24000_exactly_resumed_500: true as const,
      work_bytes_strictly_increased: true as const,
      work_digest_changed_at_each_advance: true as const,
      next_authority_issued_only_after_prior_receipt: true as const,
      each_gate_authority_claimed_once: true as const,
      owner_closed_after_final_receipt: true as const,
    }),
    recovery: Object.freeze({
      failure_aborts_and_drains_started_owner: true as const,
      owner_close_joined_after_failure: true as const,
      pre_gate_absence_is_distinguished_from_partial_state: true as const,
      partial_state_is_preserved_for_reconciliation: true as const,
      automatic_partial_state_deletion: false as const,
    }),
    nonclaims: Object.freeze({
      exact_free_space_or_path: false as const,
      production_authority: false as const,
      operational_checkpoint: false as const,
      private_dataset_read: false as const,
      teacher_success: false as const,
      label_finalized: false as const,
      optimizer_training: false as const,
      weight_changed: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
      stable_high_dan: false as const,
    }),
  });
}

function failureEvidence(
  phase: FloodgateV7CleanRoomRunGatePhase,
  workStateMayExist: boolean,
  cleanupFailureCount: number,
): Readonly<FloodgateV7CleanRoomRunGateFailureEvidenceForTests> {
  return Object.freeze({
    phase,
    work_state_may_exist: workStateMayExist,
    work_state_disposition: workStateMayExist
      ? "preserved-partial-reconciliation-required"
      : "definitely-absent-fresh-retry-allowed",
    cleanup_failure_count: cleanupFailureCount,
    sensitive_values_disclosed: false as const,
  });
}

async function runCaptured(
  plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>,
  dependencies: Readonly<CapturedDependencies>,
  receiptAuthority: Readonly<CheckpointReceiptAuthority>,
  finalizeSealedChainHandoff?: () => Promise<void>,
): Promise<Readonly<FloodgateV7CleanRoomRunGatesReceipt>> {
  let phase: FloodgateV7CleanRoomRunGatePhase = "capacity";
  let workStateMayExist = false;
  let coordinator: FloodgateV7ProductionParentCoordinator | undefined;
  let handoff:
    | Readonly<FloodgateV7ProductionParentCoordinatorCheckpointHandoff>
    | undefined;
  let session: RunSession | undefined;
  let closeAttempted = false;
  let executorInvoked = false;
  let preflightSnapshot: Readonly<CapacityPreflightSnapshot> | undefined;
  let activeAuthority:
    | Readonly<FloodgateV7CleanRoomRunGateCapabilityForTests>
    | undefined;
  const capturedReceipts: Readonly<CapturedGateReceipt>[] = [];
  try {
    try {
      preflightSnapshot = await preflightCapacity(plan, dependencies.statfs);
    } catch (error) {
      if (error instanceof FloodgateV7CleanRoomRunGateError) throw error;
      workStateMayExist = !(await workStateDefinitelyAbsent(plan));
      throw error;
    }
    phase = "coordinator";
    const coordinatorPromise =
      createFloodgateV7ProductionParentCoordinatorCoreForTests(
        dependencies.runtimeOwnerDependencies,
      );
    if (
      !nodeUtilTypes.isPromise(coordinatorPromise) ||
      nodeUtilTypes.isProxy(coordinatorPromise)
    ) {
      throw new Error("coordinator promise differs");
    }
    coordinator = await coordinatorPromise;
    phase = "handoff";
    handoff =
      claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests(
        coordinator,
      );
    const runId = randomBytes(32).toString("hex");
    const controller = Object.freeze({
      produce: handoff.produce,
      abortAndDrain: handoff.abortAndDrain,
    });
    session = {
      plan,
      runId,
      handoff,
      controller,
      activeOrdinal: 0,
      workStateMayExist: false,
      closed: false,
    };
    for (
      let ordinal = 0;
      ordinal < FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_SEQUENCE.length;
      ordinal += 1
    ) {
      const gate = FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_SEQUENCE[ordinal];
      phase = gate;
      activeAuthority = mintGateAuthority(session, gate, ordinal);
      const state = gateAuthorities.get(activeAuthority);
      if (state === undefined) {
        throw new Error("gate authority registration differs");
      }
      executorInvoked = true;
      workStateMayExist = true;
      session.workStateMayExist = true;
      const gatePromise =
        dependencies.executeAuthenticatedCheckpointGate(activeAuthority);
      if (
        !nodeUtilTypes.isPromise(gatePromise) ||
        nodeUtilTypes.isProxy(gatePromise)
      ) {
        throw new Error("checkpoint promise differs");
      }
      const gateReceipt = await gatePromise;
      if (!state.claimed) {
        gateAuthorities.delete(activeAuthority);
        throw new Error("checkpoint authority was not claimed");
      }
      const authenticatedReceipt = receiptAuthority.claim(gateReceipt);
      const captured = captureGateReceipt(
        authenticatedReceipt,
        gate,
        runId,
        receiptAuthority.expectedKeyId,
      );
      capturedReceipts.push(captured);
      session.activeOrdinal = ordinal + 1;
      activeAuthority = undefined;
    }
    if (capturedReceipts.length !== 3) {
      phase = "receipt";
      throw new Error("checkpoint receipt count differs");
    }
    const chain = capturedReceipts as unknown as readonly [
      Readonly<CapturedGateReceipt>,
      Readonly<CapturedGateReceipt>,
      Readonly<CapturedGateReceipt>,
    ];
    validateReceiptChain(chain);
    phase = "cleanup";
    closeAttempted = true;
    await handoff.close();
    session.closed = true;
    if (finalizeSealedChainHandoff !== undefined) {
      phase = "finalizer-handoff";
      const handoffPromise = finalizeSealedChainHandoff();
      if (
        !nodeUtilTypes.isPromise(handoffPromise) ||
        nodeUtilTypes.isProxy(handoffPromise)
      ) {
        throw new Error("finalizer handoff promise differs");
      }
      await handoffPromise;
    }
    phase = "receipt";
    return buildReceipt();
  } catch (primary) {
    if (activeAuthority !== undefined) {
      const state = gateAuthorities.get(activeAuthority);
      if (state?.claimed === true) workStateMayExist = true;
      gateAuthorities.delete(activeAuthority);
    }
    if (session !== undefined) {
      workStateMayExist = workStateMayExist || session.workStateMayExist;
      session.closed = true;
    }
    if (primary instanceof FloodgateV7CleanRoomRunGateError) {
      workStateMayExist = workStateMayExist || primary.work_state_may_exist;
      phase = primary.phase;
    }
    const cleanupFailures: unknown[] = [];
    const owner = handoff ?? coordinator;
    if (owner !== undefined) {
      try {
        await owner.abortAndDrain();
      } catch (error) {
        cleanupFailures.push(error);
      }
      if (!closeAttempted) {
        closeAttempted = true;
        try {
          await owner.close();
        } catch (error) {
          cleanupFailures.push(error);
        }
      }
    }
    if (
      executorInvoked &&
      cleanupFailures.length === 0 &&
      preflightSnapshot !== undefined &&
      (await workStateDefinitelyAbsent(plan, preflightSnapshot))
    ) {
      workStateMayExist = false;
    }
    let cleanupFailureCount = cleanupFailures.length;
    if (dependencies.observeFailureForTests !== undefined) {
      try {
        dependencies.observeFailureForTests(
          failureEvidence(phase, workStateMayExist, cleanupFailureCount),
        );
      } catch {
        cleanupFailureCount += 1;
      }
    }
    throw new FloodgateV7CleanRoomRunGateError(
      phase,
      workStateMayExist,
      cleanupFailureCount,
    );
  }
}

/**
 * Execute the source/test-only sequence from the exact private grant minted
 * while PR1 consumed one test preparation capability. The plan itself is not
 * accepted at this boundary.
 */
export function runFloodgateV7CleanRoomRunGatesFromPreparedGrantCoreForTests(
  grant: Readonly<FloodgateV7CleanRoomPreparedRunGrantForTests>,
  dependenciesValue: FloodgateV7CleanRoomRunGateDependenciesForTests,
): Promise<Readonly<FloodgateV7CleanRoomRunGatesReceipt>> {
  if (arguments.length !== 2) {
    return rejected(new FloodgateV7CleanRoomRunGateError("capture", false));
  }
  let dependencies: Readonly<CapturedDependencies>;
  let plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>;
  try {
    dependencies = captureDependencies(dependenciesValue);
    plan = claimFloodgateV7CleanRoomPreparedRunGrantCoreForTests(grant);
    if (
      !isPlainNonProxyObject(plan) ||
      !objectIsFrozen(plan) ||
      !path.isAbsolute(plan.cleanRoomRoot) ||
      path.resolve(plan.cleanRoomRoot) !== plan.cleanRoomRoot ||
      plan.gateSequence.length !==
        FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_SEQUENCE.length ||
      plan.gateSequence.some(
        (gate, index) =>
          gate !== FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_SEQUENCE[index],
      )
    ) {
      throw new Error("prepared plan differs");
    }
  } catch {
    return rejected(new FloodgateV7CleanRoomRunGateError("capture", false));
  }
  return nativePromiseResolve().then(() =>
    runCaptured(
      plan,
      dependencies,
      Object.freeze({
        expectedKeyId: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
        claim:
          claimFloodgateV7DeploymentKeyTeacherCheckpointV3ReceiptCoreForTests,
      }),
    ),
  );
}

/**
 * Test-only local composition seam. It consumes the existing opaque test
 * grant, but exercises the exact local receipt-brand and post-close handoff
 * ordering used by the fixed route.
 */
export function runFloodgateV7CleanRoomRunGatesFromPreparedLocalGrantCoreForTests(
  grant: Readonly<FloodgateV7CleanRoomPreparedRunGrantForTests>,
  dependenciesValue: FloodgateV7CleanRoomLocalRunGateDependencies,
): Promise<Readonly<FloodgateV7CleanRoomRunGatesReceipt>> {
  if (arguments.length !== 2) {
    return rejected(new FloodgateV7CleanRoomRunGateError("capture", false));
  }
  let dependencies: Readonly<CapturedLocalDependencies>;
  let plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>;
  try {
    dependencies = captureLocalDependencies(
      dependenciesValue,
      "test-only-nondeployment-key",
    );
    plan = claimFloodgateV7CleanRoomPreparedRunGrantCoreForTests(grant);
  } catch {
    return rejected(new FloodgateV7CleanRoomRunGateError("capture", false));
  }
  return nativePromiseResolve().then(() =>
    runCaptured(
      plan,
      dependencies,
      Object.freeze({
        expectedKeyId: dependencies.expectedCheckpointKeyId,
        claim: dependencies.claimAuthenticatedCheckpointReceipt,
      }),
      dependencies.finalizeSealedChainHandoff,
    ),
  );
}

/**
 * Consume the exact fixed-preparation local grant. Unlike the source/test
 * route above, this accepts only the fixed current-user deployment key id and
 * its exact local receipt brand. The key remains a Mac-local filesystem
 * authority; this route has no external service or cloud dependency.
 */
export function runFloodgateV7CleanRoomRunGatesFromPreparedLocalGrant(
  grant: Readonly<FloodgateV7CleanRoomPreparedLocalRunGrant>,
  dependenciesValue: FloodgateV7CleanRoomLocalRunGateDependencies,
): Promise<Readonly<FloodgateV7CleanRoomRunGatesReceipt>> {
  if (arguments.length !== 2) {
    return rejected(new FloodgateV7CleanRoomRunGateError("capture", false));
  }
  let dependencies: Readonly<CapturedLocalDependencies>;
  let plan: Readonly<FloodgateV7CleanRoomTeacherPlanForTests>;
  try {
    dependencies = captureLocalDependencies(
      dependenciesValue,
      "fixed-local-deployment-key",
    );
    plan = claimFloodgateV7CleanRoomPreparedLocalRunGrant(grant);
    if (
      !isPlainNonProxyObject(plan) ||
      !objectIsFrozen(plan) ||
      !path.isAbsolute(plan.cleanRoomRoot) ||
      path.resolve(plan.cleanRoomRoot) !== plan.cleanRoomRoot ||
      plan.gateSequence.length !==
        FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_SEQUENCE.length ||
      plan.gateSequence.some(
        (gate, index) =>
          gate !== FLOODGATE_V7_CLEAN_ROOM_RUN_GATES_SEQUENCE[index],
      )
    ) {
      throw new Error("local prepared plan differs");
    }
  } catch {
    return rejected(new FloodgateV7CleanRoomRunGateError("capture", false));
  }
  return nativePromiseResolve().then(() =>
    runCaptured(
      plan,
      dependencies,
      Object.freeze({
        expectedKeyId: dependencies.expectedCheckpointKeyId,
        claim: dependencies.claimAuthenticatedCheckpointReceipt,
      }),
      dependencies.finalizeSealedChainHandoff,
    ),
  );
}
