/**
 * Keep the portable-copy source preseal, filesystem seal, copy witnesses, and
 * composite destination seal inside one opaque owner lifecycle.
 *
 * This is a dormant filesystem-authority primitive. Its specialized
 * held-role-bundle borrow delegates one pathless, exact-nine-file snapshot to
 * a synchronous owner claim while the underlying descriptors remain held. It
 * does not perform source semantic verification, run a teacher, train a model,
 * or activate a weight.
 */

import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import {
  claimFloodgateV7PortableCopyHeldRoleBundleSnapshot,
  claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests,
  copyFloodgateV7PortableSourceByValue,
  copyFloodgateV7PortableSourceByValueCoreForTests,
  presealFloodgateV7PortableCopySource,
  presealFloodgateV7PortableCopySourceCoreForTests,
  revokeFloodgateV7PortableCopyCompositeDestinationSeal,
  revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests,
  sealFloodgateV7PortableCopyCompositeDestination,
  sealFloodgateV7PortableCopyCompositeDestinationCoreForTests,
  sealFloodgateV7PortableCopySourceFilesystem,
  sealFloodgateV7PortableCopySourceFilesystemCoreForTests,
  withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundle,
  withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests,
  withFloodgateV7PortableCopyCompositeDestinationRevalidation,
  withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests,
  type FloodgateV7CleanRoomCopyDependencies,
  type FloodgateV7PortableCopyCompositeDestinationSeal,
  type FloodgateV7PortableCopyHeldRoleBundleClaim,
  type FloodgateV7PortableCopyHeldRoleBundleSnapshot,
  type FloodgateV7PortableCopyKind,
  type FloodgateV7PortableCopySourceFilesystemSeal,
  type FloodgateV7PortableCopySourcePreseal,
  type FloodgateV7PortableCopyWitness,
  type FloodgateV7PortableCopyWitnessResult,
} from "./floodgate-v7-clean-room-copy";

export const FLOODGATE_V7_PORTABLE_COPY_OWNER_CONTRACT =
  "shogi-floodgate-v7-portable-copy-owner-v1" as const;
export const FLOODGATE_V7_PORTABLE_COPY_OWNER_CLAIM_BOUNDARY =
  "owner-private-exact-four-kind-source-preseal-filesystem-seal-copy-witness-composite-and-serialized-borrow-lifecycle-not-source-semantic-authenticity-held-descriptor-reads-exact-three-gate-teacher-training-live-weight-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_PORTABLE_COPY_OWNER_HELD_ROLE_BUNDLE_CONTRACT =
  "shogi-floodgate-v7-portable-copy-owner-held-role-bundle-v1" as const;
export const FLOODGATE_V7_PORTABLE_COPY_OWNER_HELD_ROLE_BUNDLE_CLAIM_BOUNDARY =
  "owner-and-bound-bridge-private-ephemeral-single-use-claim-over-one-composite-held-role-bundle-exact-nine-file-pathless-snapshot-callback-settlement-postflight-and-close-not-source-semantic-authenticity-exact-three-gate-teacher-training-live-weight-or-playing-strength-evidence" as const;

const FIXED_KINDS = Object.freeze([
  "raw-lock-tree",
  "role-lock-tree",
  "role-bundle-tree",
  "legacy-file",
] as const);

const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const arrayIsArray = Array.isArray;
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const stringIncludes = String.prototype.includes;
const stringStartsWith = String.prototype.startsWith;
const weakMapDelete = WeakMap.prototype.delete;
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;
const weakSetAdd = WeakSet.prototype.add;
const weakSetHas = WeakSet.prototype.has;
const isProxy = nodeUtilTypes.isProxy;
const pathIsAbsolute = path.isAbsolute;
const pathRelative = path.relative;
const pathResolve = path.resolve;
const pathSeparator = path.sep;

declare const portableCopyOwnerBrand: unique symbol;
declare const portableCopyOwnerPauseBrand: unique symbol;
declare const portableCopyOwnerBridgeBrand: unique symbol;
declare const portableCopyOwnerHeldRoleBundleClaimBrand: unique symbol;

export interface FloodgateV7PortableCopyOwner {
  readonly [portableCopyOwnerBrand]: true;
}

export interface FloodgateV7PortableCopyOwnerVerificationPause {
  readonly [portableCopyOwnerPauseBrand]: true;
}

export interface FloodgateV7PortableCopyOwnerBoundBridge {
  readonly [portableCopyOwnerBridgeBrand]: true;
}

export interface FloodgateV7PortableCopyOwnerHeldRoleBundleClaim {
  readonly [portableCopyOwnerHeldRoleBundleClaimBrand]: true;
}

export type FloodgateV7PortableCopyOwnerHeldRoleBundleSnapshot =
  FloodgateV7PortableCopyHeldRoleBundleSnapshot;

export interface FloodgateV7PortableCopyOwnerDependencies {
  readonly effectiveUserId: number;
  readonly maxEntries?: number;
  readonly maxTotalBytes?: number;
}

export interface FloodgateV7PortableCopyOwnerBinding {
  readonly kind: FloodgateV7PortableCopyKind;
  readonly source: string;
  readonly destination: string;
  readonly dependencies: FloodgateV7PortableCopyOwnerDependencies;
}

export interface FloodgateV7PortableCopyOwnerBindingForTests {
  readonly kind: FloodgateV7PortableCopyKind;
  readonly source: string;
  readonly destination: string;
  readonly dependencies: FloodgateV7CleanRoomCopyDependencies;
}

export interface FloodgateV7PortableCopyOwnerExactBinding {
  readonly kind: FloodgateV7PortableCopyKind;
  readonly source: string;
  readonly destination: string;
}

export interface FloodgateV7PortableCopyOwnerPresealResult {
  readonly owner: FloodgateV7PortableCopyOwner;
  readonly verificationPause: FloodgateV7PortableCopyOwnerVerificationPause;
}

type OwnerOperation = "preseal" | "bind" | "borrow" | "revoke";

export class FloodgateV7PortableCopyOwnerError extends Error {
  readonly contract = FLOODGATE_V7_PORTABLE_COPY_OWNER_CONTRACT;
  readonly operation: OwnerOperation;
  readonly sensitive_values_disclosed = false;
  readonly destination_write_may_have_started: boolean;
  readonly consumer_callback_may_have_started: boolean;
  readonly retry_disposition:
    | "fresh-preseal-allowed"
    | "manual-clean-room-reconciliation-required"
    | "manual-consumer-and-clean-room-reconciliation-required"
    | "manual-owner-reconciliation-required";

  constructor(operation: OwnerOperation) {
    super("Floodgate v7 portable copy owner failed");
    this.name = "FloodgateV7PortableCopyOwnerError";
    this.operation = operation;
    this.destination_write_may_have_started = operation !== "preseal";
    this.consumer_callback_may_have_started =
      operation === "borrow" || operation === "revoke";
    this.retry_disposition =
      operation === "preseal"
        ? "fresh-preseal-allowed"
        : operation === "bind"
          ? "manual-clean-room-reconciliation-required"
          : operation === "borrow"
            ? "manual-consumer-and-clean-room-reconciliation-required"
            : "manual-owner-reconciliation-required";
    objectFreeze(this);
  }
}

interface CapturedBinding {
  readonly kind: FloodgateV7PortableCopyKind;
  readonly source: string;
  readonly destination: string;
  readonly dependencies: FloodgateV7CleanRoomCopyDependencies;
}

interface CapturedExactBinding {
  readonly kind: FloodgateV7PortableCopyKind;
  readonly source: string;
  readonly destination: string;
}

type OwnerPhase = "presealed" | "binding" | "bound";

interface OwnerState {
  phase: OwnerPhase;
  readonly bindings: readonly CapturedBinding[];
  readonly preseals: readonly FloodgateV7PortableCopySourcePreseal[];
  readonly pause: object;
  composite?: FloodgateV7PortableCopyCompositeDestinationSeal;
  bridge?: object;
  activeHeldRoleBundleClaim?: object;
  inUse: boolean;
  invalidated: boolean;
}

interface OwnerHeldRoleBundleClaimState {
  readonly owner: object;
  readonly bridge: object;
  readonly underlyingClaim: FloodgateV7PortableCopyHeldRoleBundleClaim;
  consumed: boolean;
}

interface OwnerRegistry {
  readonly owners: WeakMap<object, OwnerState>;
  readonly pauses: WeakMap<object, object>;
  readonly bridges: WeakMap<object, object>;
  readonly issuedOwners: WeakSet<object>;
  readonly revokedOwners: WeakSet<object>;
  readonly issuedPauses: WeakSet<object>;
  readonly revokedPauses: WeakSet<object>;
  readonly issuedBridges: WeakSet<object>;
  readonly revokedBridges: WeakSet<object>;
  readonly heldRoleBundleClaims: WeakMap<object, OwnerHeldRoleBundleClaimState>;
  readonly issuedHeldRoleBundleClaims: WeakSet<object>;
  readonly revokedHeldRoleBundleClaims: WeakSet<object>;
}

interface UnderlyingPortableCopyApi {
  readonly preseal: (
    kind: FloodgateV7PortableCopyKind,
    source: string,
    destination: string,
    dependencies: FloodgateV7CleanRoomCopyDependencies,
  ) => Promise<FloodgateV7PortableCopySourcePreseal>;
  readonly seal: (
    kind: FloodgateV7PortableCopyKind,
    preseal: FloodgateV7PortableCopySourcePreseal,
  ) => Promise<FloodgateV7PortableCopySourceFilesystemSeal>;
  readonly copy: (
    kind: FloodgateV7PortableCopyKind,
    seal: FloodgateV7PortableCopySourceFilesystemSeal,
    destination: string,
  ) => Promise<Readonly<FloodgateV7PortableCopyWitnessResult>>;
  readonly composite: (
    witnesses: readonly FloodgateV7PortableCopyWitness[],
  ) => Promise<FloodgateV7PortableCopyCompositeDestinationSeal>;
  readonly withRevalidation: <Result>(
    composite: FloodgateV7PortableCopyCompositeDestinationSeal,
    operation: () => Result | Promise<Result>,
  ) => Promise<Result>;
  readonly withHeldRoleBundle: <Result>(
    composite: FloodgateV7PortableCopyCompositeDestinationSeal,
    operation: (
      claim: FloodgateV7PortableCopyHeldRoleBundleClaim,
    ) => Result | Promise<Result>,
  ) => Promise<Result>;
  readonly claimHeldRoleBundleSnapshot: (
    claim: FloodgateV7PortableCopyHeldRoleBundleClaim,
  ) => FloodgateV7PortableCopyOwnerHeldRoleBundleSnapshot;
  readonly revoke: (
    composite: FloodgateV7PortableCopyCompositeDestinationSeal,
  ) => void;
}

const PRODUCTION_DEPENDENCY_KEYS = Object.freeze([
  "effectiveUserId",
  "maxEntries",
  "maxTotalBytes",
] as const);
const TEST_DEPENDENCY_KEYS = Object.freeze([
  ...PRODUCTION_DEPENDENCY_KEYS,
  "maxConcurrencyForTests",
  "afterSourceInventoryForTests",
  "afterFileCopiedForTests",
  "beforeFinalRevalidationForTests",
  "closeCopiedFileHandleForTests",
] as const);

function applyFunction<Result>(
  operation: (...arguments_: never[]) => Result,
  receiver: unknown,
  arguments_: unknown[],
): Result {
  return reflectApply(operation, receiver, arguments_) as Result;
}

function isArray(value: unknown): value is unknown[] {
  return applyFunction(arrayIsArray, undefined, [value]) as boolean;
}

function getWeakMapValue<Key extends object, Value>(
  map: WeakMap<Key, Value>,
  key: Key,
): Value | undefined {
  return applyFunction(weakMapGet, map, [key]) as Value | undefined;
}

function setWeakMapValue<Key extends object, Value>(
  map: WeakMap<Key, Value>,
  key: Key,
  value: Value,
): void {
  applyFunction(weakMapSet, map, [key, value]);
}

function deleteWeakMapValue<Key extends object, Value>(
  map: WeakMap<Key, Value>,
  key: Key,
): boolean {
  return applyFunction(weakMapDelete, map, [key]) as boolean;
}

function weakSetContains<Value extends object>(
  set: WeakSet<Value>,
  value: Value,
): boolean {
  return applyFunction(weakSetHas, set, [value]) as boolean;
}

function addWeakSetValue<Value extends object>(
  set: WeakSet<Value>,
  value: Value,
): void {
  applyFunction(weakSetAdd, set, [value]);
}

function stringContains(value: string, search: string): boolean {
  return applyFunction(stringIncludes, value, [search]) as boolean;
}

function stringBeginsWith(value: string, search: string): boolean {
  return applyFunction(stringStartsWith, value, [search]) as boolean;
}

function opaqueCapability<Value>(): Value {
  return objectFreeze(objectCreate(null)) as Value;
}

function tokenObject(value: unknown): object | undefined {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null ||
    applyFunction(isProxy, nodeUtilTypes, [value])
  ) {
    return undefined;
  }
  return value;
}

function canonicalAbsolutePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    stringContains(value, "\0") ||
    stringContains(value, "\n") ||
    !applyFunction(pathIsAbsolute, path, [value]) ||
    applyFunction(pathResolve, path, [value]) !== value
  ) {
    throw new Error("owner path differs");
  }
  return value;
}

function captureKind(
  value: unknown,
  index: number,
): FloodgateV7PortableCopyKind {
  const expected = FIXED_KINDS[index];
  if (value !== expected) throw new Error("owner kind differs");
  return expected;
}

function sameOrDescendant(ancestor: string, candidate: string): boolean {
  const relative = applyFunction(pathRelative, path, [ancestor, candidate]);
  return (
    relative === "" ||
    (relative !== ".." &&
      !stringBeginsWith(relative, `..${pathSeparator}`) &&
      !applyFunction(pathIsAbsolute, path, [relative]))
  );
}

function pathsOverlap(left: string, right: string): boolean {
  return sameOrDescendant(left, right) || sameOrDescendant(right, left);
}

function assertAllNamespacesDisjoint(
  bindings: readonly (CapturedBinding | CapturedExactBinding)[],
): void {
  for (let left = 0; left < 4; left += 1) {
    const leftBinding = bindings[left];
    if (leftBinding === undefined) throw new Error("owner binding absent");
    for (let right = left + 1; right < 4; right += 1) {
      const rightBinding = bindings[right];
      if (
        rightBinding === undefined ||
        pathsOverlap(leftBinding.source, rightBinding.source) ||
        pathsOverlap(leftBinding.destination, rightBinding.destination)
      ) {
        throw new Error("owner namespaces overlap");
      }
    }
    for (let sourceIndex = 0; sourceIndex < 4; sourceIndex += 1) {
      const sourceBinding = bindings[sourceIndex];
      if (
        sourceBinding === undefined ||
        pathsOverlap(leftBinding.destination, sourceBinding.source)
      ) {
        throw new Error("owner source and destination namespaces overlap");
      }
    }
  }
}

function capturePlainDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    isArray(value) ||
    applyFunction(isProxy, nodeUtilTypes, [value]) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new Error("owner binding differs");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  if (keys.length !== allowedKeys.length) {
    throw new Error("owner binding shape differs");
  }
  for (let index = 0; index < keys.length; index += 1) {
    const candidate = keys[index];
    let allowed = false;
    for (
      let allowedIndex = 0;
      allowedIndex < allowedKeys.length;
      allowedIndex += 1
    ) {
      if (candidate === allowedKeys[allowedIndex]) {
        allowed = true;
        break;
      }
    }
    if (!allowed) throw new Error("owner binding key differs");
  }
  const captured: Record<string, unknown> = objectCreate(null) as Record<
    string,
    unknown
  >;
  for (let index = 0; index < allowedKeys.length; index += 1) {
    const key = allowedKeys[index];
    if (key === undefined) throw new Error("owner binding key differs");
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new Error("owner binding descriptor differs");
    }
    captured[key] = descriptor.value;
  }
  return objectFreeze(captured);
}

function captureDependencies(
  value: unknown,
  allowTestHooks: boolean,
): FloodgateV7CleanRoomCopyDependencies {
  if (
    value === null ||
    typeof value !== "object" ||
    isArray(value) ||
    applyFunction(isProxy, nodeUtilTypes, [value]) ||
    (objectGetPrototypeOf(value) !== objectPrototype &&
      objectGetPrototypeOf(value) !== null)
  ) {
    throw new Error("owner dependencies differ");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const keys = reflectOwnKeys(descriptors);
  const allowed = allowTestHooks
    ? TEST_DEPENDENCY_KEYS
    : PRODUCTION_DEPENDENCY_KEYS;
  if (keys.length < 1 || keys.length > allowed.length) {
    throw new Error("owner dependency shape differs");
  }
  const captured: Record<string, unknown> = objectCreate(null) as Record<
    string,
    unknown
  >;
  let effectiveUserIdSeen = false;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string") {
      throw new Error("owner dependency key differs");
    }
    let accepted = false;
    for (
      let allowedIndex = 0;
      allowedIndex < allowed.length;
      allowedIndex += 1
    ) {
      if (key === allowed[allowedIndex]) {
        accepted = true;
        break;
      }
    }
    const descriptor = descriptors[key];
    if (!accepted || descriptor === undefined || !("value" in descriptor)) {
      throw new Error("owner dependency descriptor differs");
    }
    captured[key] = descriptor.value;
    if (key === "effectiveUserId") effectiveUserIdSeen = true;
  }
  if (!effectiveUserIdSeen) {
    throw new Error("owner effective user differs");
  }
  return objectFreeze(
    captured,
  ) as unknown as FloodgateV7CleanRoomCopyDependencies;
}

function captureFixedList(
  value: unknown,
  withDependencies: true,
  allowTestHooks: boolean,
): readonly CapturedBinding[];
function captureFixedList(
  value: unknown,
  withDependencies: false,
  allowTestHooks?: false,
): readonly CapturedExactBinding[];
function captureFixedList(
  value: unknown,
  withDependencies: boolean,
  allowTestHooks = false,
): readonly (CapturedBinding | CapturedExactBinding)[] {
  if (
    !isArray(value) ||
    applyFunction(isProxy, nodeUtilTypes, [value]) ||
    objectGetPrototypeOf(value) !== arrayPrototype
  ) {
    throw new Error("owner binding list differs");
  }
  const descriptors = objectGetOwnPropertyDescriptors(
    value,
  ) as unknown as Record<PropertyKey, PropertyDescriptor | undefined>;
  const keys = reflectOwnKeys(descriptors);
  const lengthDescriptor = descriptors.length;
  if (
    keys.length !== 5 ||
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    lengthDescriptor.value !== 4
  ) {
    throw new Error("owner binding list shape differs");
  }
  const captured: (CapturedBinding | CapturedExactBinding)[] = [];
  for (let index = 0; index < 4; index += 1) {
    const itemDescriptor = descriptors[`${index}`];
    if (itemDescriptor === undefined || !("value" in itemDescriptor)) {
      throw new Error("owner binding item differs");
    }
    const item = capturePlainDataRecord(
      itemDescriptor.value,
      withDependencies
        ? ["kind", "source", "destination", "dependencies"]
        : ["kind", "source", "destination"],
    );
    const common = {
      kind: captureKind(item.kind, index),
      source: canonicalAbsolutePath(item.source),
      destination: canonicalAbsolutePath(item.destination),
    };
    captured[index] = withDependencies
      ? objectFreeze({
          ...common,
          dependencies: captureDependencies(item.dependencies, allowTestHooks),
        })
      : objectFreeze(common);
  }
  assertAllNamespacesDisjoint(captured);
  return objectFreeze(captured);
}

function exactBindingsMatch(
  captured: readonly CapturedBinding[],
  claimed: readonly CapturedExactBinding[],
): boolean {
  for (let index = 0; index < 4; index += 1) {
    const left = captured[index];
    const right = claimed[index];
    if (
      left === undefined ||
      right === undefined ||
      left.kind !== right.kind ||
      left.source !== right.source ||
      left.destination !== right.destination
    ) {
      return false;
    }
  }
  return true;
}

async function settleFour<Value>(
  promises: readonly [
    Promise<Value>,
    Promise<Value>,
    Promise<Value>,
    Promise<Value>,
  ],
): Promise<readonly [Value, Value, Value, Value]> {
  const settleOne = async (
    promise: Promise<Value>,
  ): Promise<
    | Readonly<{ readonly fulfilled: true; readonly value: Value }>
    | Readonly<{ readonly fulfilled: false }>
  > => {
    try {
      return objectFreeze({ fulfilled: true as const, value: await promise });
    } catch {
      return objectFreeze({ fulfilled: false as const });
    }
  };
  // Attach a native async-await rejection handler to every already-started
  // operation before awaiting any one of them. This both drains all four and
  // avoids Promise.allSettled consulting a mutable Promise.resolve property.
  const firstSettlement = settleOne(promises[0]);
  const secondSettlement = settleOne(promises[1]);
  const thirdSettlement = settleOne(promises[2]);
  const fourthSettlement = settleOne(promises[3]);
  const first = await firstSettlement;
  const second = await secondSettlement;
  const third = await thirdSettlement;
  const fourth = await fourthSettlement;
  if (
    !first.fulfilled ||
    !second.fulfilled ||
    !third.fulfilled ||
    !fourth.fulfilled
  ) {
    throw new Error("owner stage failed");
  }
  return objectFreeze([first.value, second.value, third.value, fourth.value]);
}

function operationIsPlainArity(value: unknown, expected: number): boolean {
  if (
    typeof value !== "function" ||
    applyFunction(isProxy, nodeUtilTypes, [value])
  ) {
    return false;
  }
  const length = objectGetOwnPropertyDescriptors(value).length;
  return length !== undefined && "value" in length && length.value === expected;
}

function operationIsPlainZeroArity(value: unknown): value is () => unknown {
  return operationIsPlainArity(value, 0);
}

function operationIsPlainUnary(
  value: unknown,
): value is (
  claim: FloodgateV7PortableCopyOwnerHeldRoleBundleClaim,
) => unknown {
  return operationIsPlainArity(value, 1);
}

function createRegistry(): OwnerRegistry {
  return objectFreeze({
    owners: new WeakMap<object, OwnerState>(),
    pauses: new WeakMap<object, object>(),
    bridges: new WeakMap<object, object>(),
    issuedOwners: new WeakSet<object>(),
    revokedOwners: new WeakSet<object>(),
    issuedPauses: new WeakSet<object>(),
    revokedPauses: new WeakSet<object>(),
    issuedBridges: new WeakSet<object>(),
    revokedBridges: new WeakSet<object>(),
    heldRoleBundleClaims: new WeakMap<object, OwnerHeldRoleBundleClaimState>(),
    issuedHeldRoleBundleClaims: new WeakSet<object>(),
    revokedHeldRoleBundleClaims: new WeakSet<object>(),
  });
}

function createOwnerApi(
  registry: OwnerRegistry,
  underlying: UnderlyingPortableCopyApi,
  allowTestHooks: boolean,
) {
  const invalidate = (owner: object, state: OwnerState): boolean => {
    state.invalidated = true;
    state.inUse = false;
    deleteWeakMapValue(registry.owners, owner);
    addWeakSetValue(registry.revokedOwners, owner);

    deleteWeakMapValue(registry.pauses, state.pause);
    if (weakSetContains(registry.issuedPauses, state.pause)) {
      addWeakSetValue(registry.revokedPauses, state.pause);
    }

    if (state.bridge !== undefined) {
      deleteWeakMapValue(registry.bridges, state.bridge);
      if (weakSetContains(registry.issuedBridges, state.bridge)) {
        addWeakSetValue(registry.revokedBridges, state.bridge);
      }
    }

    const heldRoleBundleClaim = state.activeHeldRoleBundleClaim;
    state.activeHeldRoleBundleClaim = undefined;
    if (heldRoleBundleClaim !== undefined) {
      deleteWeakMapValue(registry.heldRoleBundleClaims, heldRoleBundleClaim);
      if (
        weakSetContains(
          registry.issuedHeldRoleBundleClaims,
          heldRoleBundleClaim,
        )
      ) {
        addWeakSetValue(
          registry.revokedHeldRoleBundleClaims,
          heldRoleBundleClaim,
        );
      }
    }

    const composite = state.composite;
    state.composite = undefined;
    if (composite === undefined) return false;
    try {
      underlying.revoke(composite);
      return false;
    } catch {
      return true;
    }
  };

  const preseal = async (
    argumentCount: number,
    bindingsValue: readonly (
      | FloodgateV7PortableCopyOwnerBinding
      | FloodgateV7PortableCopyOwnerBindingForTests
    )[],
  ): Promise<Readonly<FloodgateV7PortableCopyOwnerPresealResult>> => {
    try {
      if (argumentCount !== 1) throw new Error("argument count differs");
      const bindings = captureFixedList(bindingsValue, true, allowTestHooks);
      const preseals = await settleFour([
        underlying.preseal(
          bindings[0].kind,
          bindings[0].source,
          bindings[0].destination,
          bindings[0].dependencies,
        ),
        underlying.preseal(
          bindings[1].kind,
          bindings[1].source,
          bindings[1].destination,
          bindings[1].dependencies,
        ),
        underlying.preseal(
          bindings[2].kind,
          bindings[2].source,
          bindings[2].destination,
          bindings[2].dependencies,
        ),
        underlying.preseal(
          bindings[3].kind,
          bindings[3].source,
          bindings[3].destination,
          bindings[3].dependencies,
        ),
      ]);
      const owner = opaqueCapability<FloodgateV7PortableCopyOwner>();
      const verificationPause =
        opaqueCapability<FloodgateV7PortableCopyOwnerVerificationPause>();
      const ownerObject = owner as object;
      const pauseObject = verificationPause as object;
      setWeakMapValue(registry.owners, ownerObject, {
        phase: "presealed",
        bindings,
        preseals,
        pause: pauseObject,
        inUse: false,
        invalidated: false,
      });
      setWeakMapValue(registry.pauses, pauseObject, ownerObject);
      addWeakSetValue(registry.issuedOwners, ownerObject);
      addWeakSetValue(registry.issuedPauses, pauseObject);
      return objectFreeze({ owner, verificationPause });
    } catch {
      throw new FloodgateV7PortableCopyOwnerError("preseal");
    }
  };

  const bind = async (
    argumentCount: number,
    ownerValue: FloodgateV7PortableCopyOwner,
    pauseValue: FloodgateV7PortableCopyOwnerVerificationPause,
    exactBindingsValue: readonly FloodgateV7PortableCopyOwnerExactBinding[],
  ): Promise<FloodgateV7PortableCopyOwnerBoundBridge> => {
    let owner: object | undefined;
    let state: OwnerState | undefined;
    try {
      if (argumentCount !== 3) throw new Error("argument count differs");
      owner = tokenObject(ownerValue);
      const pause = tokenObject(pauseValue);
      if (owner === undefined || pause === undefined) {
        throw new Error("owner token differs");
      }
      state = getWeakMapValue(registry.owners, owner);
      if (
        state === undefined ||
        state.phase !== "presealed" ||
        state.invalidated ||
        state.pause !== pause ||
        getWeakMapValue(registry.pauses, pause) !== owner
      ) {
        if (state !== undefined) invalidate(owner, state);
        throw new Error("owner pause differs");
      }
      const exactBindings = captureFixedList(exactBindingsValue, false);
      if (!exactBindingsMatch(state.bindings, exactBindings)) {
        invalidate(owner, state);
        throw new Error("owner exact binding differs");
      }

      state.phase = "binding";
      deleteWeakMapValue(registry.pauses, pause);
      addWeakSetValue(registry.revokedPauses, pause);

      const seals = await settleFour([
        underlying.seal(state.bindings[0].kind, state.preseals[0]),
        underlying.seal(state.bindings[1].kind, state.preseals[1]),
        underlying.seal(state.bindings[2].kind, state.preseals[2]),
        underlying.seal(state.bindings[3].kind, state.preseals[3]),
      ]);
      if (state.invalidated) throw new Error("owner revoked while sealing");

      const copies = await settleFour([
        underlying.copy(
          state.bindings[0].kind,
          seals[0],
          state.bindings[0].destination,
        ),
        underlying.copy(
          state.bindings[1].kind,
          seals[1],
          state.bindings[1].destination,
        ),
        underlying.copy(
          state.bindings[2].kind,
          seals[2],
          state.bindings[2].destination,
        ),
        underlying.copy(
          state.bindings[3].kind,
          seals[3],
          state.bindings[3].destination,
        ),
      ]);
      if (state.invalidated) throw new Error("owner revoked while copying");

      const composite = await underlying.composite([
        copies[0].witness,
        copies[1].witness,
        copies[2].witness,
        copies[3].witness,
      ]);
      state.composite = composite;
      if (state.invalidated) throw new Error("owner revoked while composing");

      const bridge =
        opaqueCapability<FloodgateV7PortableCopyOwnerBoundBridge>();
      const bridgeObject = bridge as object;
      state.phase = "bound";
      state.bridge = bridgeObject;
      setWeakMapValue(registry.bridges, bridgeObject, owner);
      addWeakSetValue(registry.issuedBridges, bridgeObject);
      return bridge;
    } catch {
      if (owner !== undefined && state !== undefined) {
        invalidate(owner, state);
      }
      throw new FloodgateV7PortableCopyOwnerError("bind");
    }
  };

  const withRevalidation = async <Result>(
    argumentCount: number,
    ownerValue: FloodgateV7PortableCopyOwner,
    bridgeValue: FloodgateV7PortableCopyOwnerBoundBridge,
    operationValue: () => Result | Promise<Result>,
  ): Promise<Result> => {
    let owner: object | undefined;
    let state: OwnerState | undefined;
    try {
      if (argumentCount !== 3) throw new Error("argument count differs");
      owner = tokenObject(ownerValue);
      const bridge = tokenObject(bridgeValue);
      if (owner === undefined || bridge === undefined) {
        throw new Error("owner borrow token differs");
      }
      state = getWeakMapValue(registry.owners, owner);
      if (
        state === undefined ||
        state.phase !== "bound" ||
        state.invalidated ||
        state.composite === undefined ||
        state.bridge !== bridge ||
        getWeakMapValue(registry.bridges, bridge) !== owner ||
        !operationIsPlainZeroArity(operationValue)
      ) {
        if (state !== undefined && state.bridge === bridge) {
          invalidate(owner, state);
        }
        throw new Error("owner borrow differs");
      }
      if (state.inUse) {
        invalidate(owner, state);
        throw new Error("owner borrow already active");
      }
      state.inUse = true;
      const result = await underlying.withRevalidation(
        state.composite,
        operationValue,
      );
      if (state.invalidated) throw new Error("owner borrow revoked");
      state.inUse = false;
      return result;
    } catch {
      if (owner !== undefined && state !== undefined) {
        invalidate(owner, state);
      }
      throw new FloodgateV7PortableCopyOwnerError("borrow");
    }
  };

  const withHeldRoleBundle = async <Result>(
    argumentCount: number,
    ownerValue: FloodgateV7PortableCopyOwner,
    bridgeValue: FloodgateV7PortableCopyOwnerBoundBridge,
    operationValue: (
      claim: FloodgateV7PortableCopyOwnerHeldRoleBundleClaim,
    ) => Result | Promise<Result>,
  ): Promise<Result> => {
    let owner: object | undefined;
    let state: OwnerState | undefined;
    try {
      if (argumentCount !== 3) throw new Error("argument count differs");
      owner = tokenObject(ownerValue);
      const bridge = tokenObject(bridgeValue);
      if (owner === undefined || bridge === undefined) {
        throw new Error("owner held-role-bundle token differs");
      }
      state = getWeakMapValue(registry.owners, owner);
      if (
        state === undefined ||
        state.phase !== "bound" ||
        state.invalidated ||
        state.composite === undefined ||
        state.bridge !== bridge ||
        getWeakMapValue(registry.bridges, bridge) !== owner ||
        !operationIsPlainUnary(operationValue)
      ) {
        throw new Error("owner held-role-bundle borrow differs");
      }
      if (state.inUse || state.activeHeldRoleBundleClaim !== undefined) {
        throw new Error("owner held-role-bundle borrow already active");
      }
      const activeOwner = owner;
      const activeBridge = bridge;
      const activeState = state;
      const composite = state.composite;
      activeState.inUse = true;
      let callbackEntered = false;
      let callbackClaimState: OwnerHeldRoleBundleClaimState | undefined;
      const result = await underlying.withHeldRoleBundle<Result>(
        composite,
        (
          underlyingClaim: FloodgateV7PortableCopyHeldRoleBundleClaim,
        ): Result | Promise<Result> => {
          if (
            callbackEntered ||
            activeState.invalidated ||
            activeState.phase !== "bound" ||
            activeState.bridge !== activeBridge ||
            !activeState.inUse ||
            activeState.activeHeldRoleBundleClaim !== undefined
          ) {
            throw new Error("owner held-role-bundle callback differs");
          }
          callbackEntered = true;
          const claim =
            opaqueCapability<FloodgateV7PortableCopyOwnerHeldRoleBundleClaim>();
          const claimObject = claim as object;
          activeState.activeHeldRoleBundleClaim = claimObject;
          callbackClaimState = {
            owner: activeOwner,
            bridge: activeBridge,
            underlyingClaim,
            consumed: false,
          };
          setWeakMapValue(
            registry.heldRoleBundleClaims,
            claimObject,
            callbackClaimState,
          );
          addWeakSetValue(registry.issuedHeldRoleBundleClaims, claimObject);
          try {
            return applyFunction(operationValue, undefined, [claim]);
          } finally {
            if (activeState.activeHeldRoleBundleClaim === claimObject) {
              activeState.activeHeldRoleBundleClaim = undefined;
            }
            deleteWeakMapValue(registry.heldRoleBundleClaims, claimObject);
            addWeakSetValue(registry.revokedHeldRoleBundleClaims, claimObject);
          }
        },
      );
      if (
        !callbackEntered ||
        callbackClaimState === undefined ||
        !callbackClaimState.consumed ||
        activeState.invalidated
      ) {
        throw new Error("owner held-role-bundle settlement differs");
      }
      activeState.inUse = false;
      return result;
    } catch {
      if (owner !== undefined && state !== undefined) {
        invalidate(owner, state);
      }
      throw new FloodgateV7PortableCopyOwnerError("borrow");
    }
  };

  const claimHeldRoleBundleSnapshot = (
    argumentCount: number,
    ownerValue: FloodgateV7PortableCopyOwner,
    bridgeValue: FloodgateV7PortableCopyOwnerBoundBridge,
    claimValue: FloodgateV7PortableCopyOwnerHeldRoleBundleClaim,
  ): FloodgateV7PortableCopyOwnerHeldRoleBundleSnapshot => {
    let owner: object | undefined;
    let state: OwnerState | undefined;
    try {
      if (argumentCount !== 3) throw new Error("argument count differs");
      owner = tokenObject(ownerValue);
      const bridge = tokenObject(bridgeValue);
      const claim = tokenObject(claimValue);
      if (owner === undefined || bridge === undefined || claim === undefined) {
        throw new Error("owner held-role-bundle claim token differs");
      }
      state = getWeakMapValue(registry.owners, owner);
      const claimState = getWeakMapValue(registry.heldRoleBundleClaims, claim);
      if (
        state === undefined ||
        state.phase !== "bound" ||
        state.invalidated ||
        state.bridge !== bridge ||
        getWeakMapValue(registry.bridges, bridge) !== owner ||
        !state.inUse ||
        state.activeHeldRoleBundleClaim !== claim ||
        claimState === undefined ||
        claimState.owner !== owner ||
        claimState.bridge !== bridge
      ) {
        throw new Error("owner held-role-bundle claim differs");
      }
      deleteWeakMapValue(registry.heldRoleBundleClaims, claim);
      state.activeHeldRoleBundleClaim = undefined;
      addWeakSetValue(registry.revokedHeldRoleBundleClaims, claim);
      const snapshot = underlying.claimHeldRoleBundleSnapshot(
        claimState.underlyingClaim,
      );
      claimState.consumed = true;
      return snapshot;
    } catch {
      if (owner !== undefined && state !== undefined) {
        invalidate(owner, state);
      }
      throw new FloodgateV7PortableCopyOwnerError("borrow");
    }
  };

  const revoke = (
    argumentCount: number,
    ownerValue: FloodgateV7PortableCopyOwner,
  ): void => {
    try {
      if (argumentCount !== 1) throw new Error("argument count differs");
      const owner = tokenObject(ownerValue);
      if (owner === undefined) throw new Error("owner token differs");
      if (weakSetContains(registry.revokedOwners, owner)) return;
      if (!weakSetContains(registry.issuedOwners, owner)) {
        throw new Error("owner provenance differs");
      }
      const state = getWeakMapValue(registry.owners, owner);
      if (state === undefined) {
        addWeakSetValue(registry.revokedOwners, owner);
        return;
      }
      const cleanupFailed = invalidate(owner, state);
      if (cleanupFailed) throw new Error("owner cleanup differs");
    } catch {
      throw new FloodgateV7PortableCopyOwnerError("revoke");
    }
  };

  return objectFreeze({
    preseal,
    bind,
    withRevalidation,
    withHeldRoleBundle,
    claimHeldRoleBundleSnapshot,
    revoke,
  });
}

const productionApi = createOwnerApi(
  createRegistry(),
  {
    preseal: presealFloodgateV7PortableCopySource,
    seal: sealFloodgateV7PortableCopySourceFilesystem,
    copy: copyFloodgateV7PortableSourceByValue,
    composite: sealFloodgateV7PortableCopyCompositeDestination,
    withRevalidation:
      withFloodgateV7PortableCopyCompositeDestinationRevalidation,
    withHeldRoleBundle:
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundle,
    claimHeldRoleBundleSnapshot:
      claimFloodgateV7PortableCopyHeldRoleBundleSnapshot,
    revoke: revokeFloodgateV7PortableCopyCompositeDestinationSeal,
  },
  false,
);

const testApi = createOwnerApi(
  createRegistry(),
  {
    preseal: presealFloodgateV7PortableCopySourceCoreForTests,
    seal: sealFloodgateV7PortableCopySourceFilesystemCoreForTests,
    copy: copyFloodgateV7PortableSourceByValueCoreForTests,
    composite: sealFloodgateV7PortableCopyCompositeDestinationCoreForTests,
    withRevalidation:
      withFloodgateV7PortableCopyCompositeDestinationRevalidationCoreForTests,
    withHeldRoleBundle:
      withFloodgateV7PortableCopyCompositeDestinationHeldRoleBundleCoreForTests,
    claimHeldRoleBundleSnapshot:
      claimFloodgateV7PortableCopyHeldRoleBundleSnapshotCoreForTests,
    revoke: revokeFloodgateV7PortableCopyCompositeDestinationSealCoreForTests,
  },
  true,
);

export async function presealFloodgateV7PortableCopyOwner(
  bindings: readonly FloodgateV7PortableCopyOwnerBinding[],
): Promise<Readonly<FloodgateV7PortableCopyOwnerPresealResult>> {
  return productionApi.preseal(arguments.length, bindings);
}

export async function bindFloodgateV7PortableCopyOwnerBridge(
  owner: FloodgateV7PortableCopyOwner,
  verificationPause: FloodgateV7PortableCopyOwnerVerificationPause,
  exactBindings: readonly FloodgateV7PortableCopyOwnerExactBinding[],
): Promise<FloodgateV7PortableCopyOwnerBoundBridge> {
  return productionApi.bind(
    arguments.length,
    owner,
    verificationPause,
    exactBindings,
  );
}

export async function withFloodgateV7PortableCopyOwnerRevalidation<Result>(
  owner: FloodgateV7PortableCopyOwner,
  bridge: FloodgateV7PortableCopyOwnerBoundBridge,
  operation: () => Result | Promise<Result>,
): Promise<Result> {
  return productionApi.withRevalidation(
    arguments.length,
    owner,
    bridge,
    operation,
  );
}

export function withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidation<
  Result,
>(
  owner: FloodgateV7PortableCopyOwner,
  bridge: FloodgateV7PortableCopyOwnerBoundBridge,
  operation: (
    claim: FloodgateV7PortableCopyOwnerHeldRoleBundleClaim,
  ) => Result | Promise<Result>,
): Promise<Result> {
  return productionApi.withHeldRoleBundle<Result>(
    arguments.length,
    owner,
    bridge,
    operation,
  );
}

export function claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshot(
  owner: FloodgateV7PortableCopyOwner,
  bridge: FloodgateV7PortableCopyOwnerBoundBridge,
  claim: FloodgateV7PortableCopyOwnerHeldRoleBundleClaim,
): FloodgateV7PortableCopyOwnerHeldRoleBundleSnapshot {
  return productionApi.claimHeldRoleBundleSnapshot(
    arguments.length,
    owner,
    bridge,
    claim,
  );
}

export function revokeFloodgateV7PortableCopyOwner(
  owner: FloodgateV7PortableCopyOwner,
): void {
  productionApi.revoke(arguments.length, owner);
}

export async function presealFloodgateV7PortableCopyOwnerCoreForTests(
  bindings: readonly FloodgateV7PortableCopyOwnerBindingForTests[],
): Promise<Readonly<FloodgateV7PortableCopyOwnerPresealResult>> {
  return testApi.preseal(arguments.length, bindings);
}

export async function bindFloodgateV7PortableCopyOwnerBridgeCoreForTests(
  owner: FloodgateV7PortableCopyOwner,
  verificationPause: FloodgateV7PortableCopyOwnerVerificationPause,
  exactBindings: readonly FloodgateV7PortableCopyOwnerExactBinding[],
): Promise<FloodgateV7PortableCopyOwnerBoundBridge> {
  return testApi.bind(
    arguments.length,
    owner,
    verificationPause,
    exactBindings,
  );
}

export async function withFloodgateV7PortableCopyOwnerRevalidationCoreForTests<
  Result,
>(
  owner: FloodgateV7PortableCopyOwner,
  bridge: FloodgateV7PortableCopyOwnerBoundBridge,
  operation: () => Result | Promise<Result>,
): Promise<Result> {
  return testApi.withRevalidation(arguments.length, owner, bridge, operation);
}

export function withFloodgateV7PortableCopyOwnerHeldRoleBundleRevalidationCoreForTests<
  Result,
>(
  owner: FloodgateV7PortableCopyOwner,
  bridge: FloodgateV7PortableCopyOwnerBoundBridge,
  operation: (
    claim: FloodgateV7PortableCopyOwnerHeldRoleBundleClaim,
  ) => Result | Promise<Result>,
): Promise<Result> {
  return testApi.withHeldRoleBundle<Result>(
    arguments.length,
    owner,
    bridge,
    operation,
  );
}

export function claimFloodgateV7PortableCopyOwnerHeldRoleBundleSnapshotCoreForTests(
  owner: FloodgateV7PortableCopyOwner,
  bridge: FloodgateV7PortableCopyOwnerBoundBridge,
  claim: FloodgateV7PortableCopyOwnerHeldRoleBundleClaim,
): FloodgateV7PortableCopyOwnerHeldRoleBundleSnapshot {
  return testApi.claimHeldRoleBundleSnapshot(
    arguments.length,
    owner,
    bridge,
    claim,
  );
}

export function revokeFloodgateV7PortableCopyOwnerCoreForTests(
  owner: FloodgateV7PortableCopyOwner,
): void {
  testApi.revoke(arguments.length, owner);
}
