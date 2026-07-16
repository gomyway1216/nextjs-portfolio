/**
 * Non-authorizing readiness leaf for the fixed production role-bundle
 * verifier checkout.
 *
 * The production entry point accepts no configuration. It derives the one
 * permitted repository root from the current EUID's user-info home and asks
 * the pinned Git-closure assertion to validate the exact clean source tree and
 * pinned receipt evidence. It does not open external role-bundle outputs or
 * confer authority to provision or run anything.
 */

import * as os from "node:os";
import * as path from "node:path";
import { types as nodeUtilTypes } from "node:util";

import { assertPinnedFloodgateRoleBundleReceiptGitClosure } from "./floodgate-role-bundle-result";

export const FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION =
  "e8a9197608cb48b1160b6707d97b0c4f78f90a1d" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CONTRACT =
  "shogi-floodgate-v7-production-connector-verifier-readiness-v1" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_STATUS =
  "pinned-role-bundle-receipt-git-closure-checked" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLAIM_BOUNDARY =
  "git-clean-nonignored-worktree-exact-revision-tracked-source-tree-and-pinned-receipt-evidence-non-authorizing-readiness-no-external-role-bundle-files-read-full-verifier-gate-registry-authority-label-training-strength-or-sensitive-identity" as const;

export type FloodgateV7ProductionConnectorVerifierReadinessExecutionBoundary =
  | "production-fixed-current-euid-userinfo-home-role-bundle-receipt-git-closure"
  | "test-only-injected-current-euid-home-role-bundle-receipt-git-closure";

export interface FloodgateV7ProductionConnectorVerifierReadinessReceipt<
  TBoundary extends
    FloodgateV7ProductionConnectorVerifierReadinessExecutionBoundary =
    FloodgateV7ProductionConnectorVerifierReadinessExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CONTRACT;
  readonly status: typeof FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLAIM_BOUNDARY;
  readonly execution_boundary: TBoundary;
  readonly verification: Readonly<{
    readonly fixed_current_euid_home_repository_root: true;
    readonly fixed_verifier_revision: true;
    readonly pinned_receipt_git_closure_checked: true;
    readonly closure_receipt_validated: true;
    readonly sensitive_values_exported: false;
  }>;
  readonly nonclaims: Readonly<{
    readonly external_role_bundle_files_read: false;
    readonly full_role_bundle_verifier_run: false;
    readonly gate_authority: false;
    readonly registry_authority: false;
    readonly connector_authority: false;
    readonly teacher_label: false;
    readonly training: false;
    readonly weight: false;
    readonly live_evaluation_activation: false;
    readonly playing_strength: false;
    readonly path_disclosed: false;
    readonly revision_disclosed: false;
    readonly digest_disclosed: false;
    readonly private_identity_disclosed: false;
  }>;
}

type AssertPinnedReceiptGitClosureForTests = (
  options: Readonly<{
    readonly repositoryRoot: string;
    readonly verifierRevision: string;
  }>,
) => Promise<unknown>;

export interface FloodgateV7ProductionConnectorVerifierReadinessDependenciesForTests {
  readonly effectiveUserId: number;
  readonly homeDirectory: string;
  readonly assertPinnedReceiptGitClosure: AssertPinnedReceiptGitClosureForTests;
}

export class FloodgateV7ProductionConnectorVerifierReadinessError extends Error {
  constructor() {
    super("Floodgate v7 production connector verifier readiness failed");
    this.name = "FloodgateV7ProductionConnectorVerifierReadinessError";
    objectDefineProperty(this, "stack", {
      configurable: false,
      enumerable: false,
      writable: false,
      value:
        "FloodgateV7ProductionConnectorVerifierReadinessError: readiness verification failed",
    });
    objectFreeze(this);
  }
}

const NativePromise = Promise;
const getEffectiveUserId =
  typeof process.geteuid === "function" ? process.geteuid.bind(process) : null;
const getUserInfo = os.userInfo.bind(os);
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectPrototype = Object.prototype;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const numberIsSafeInteger = Number.isSafeInteger;
const pathIsAbsolute = path.isAbsolute.bind(path);
const pathJoin = path.join.bind(path);
const pathResolve = path.resolve.bind(path);
const identityBindings = new WeakMap<
  object,
  Readonly<{ effectiveUserId: number; homeDirectory: string }>
>();
const weakMapDelete = WeakMap.prototype.delete;
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;

const DEPENDENCY_KEYS = objectFreeze([
  "effectiveUserId",
  "homeDirectory",
  "assertPinnedReceiptGitClosure",
] as const);
const ROLE_BUNDLE_REPOSITORY_SUFFIX = objectFreeze([
  ".codex",
  "worktrees",
  "shogi-floodgate-role-bundle",
] as const);

function rejected(error: unknown): Promise<never> {
  return new NativePromise((_resolve, reject) => reject(error));
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = objectCreate(null) as T;
  const descriptors = objectGetOwnPropertyDescriptors(value);
  for (const key of objectKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new FloodgateV7ProductionConnectorVerifierReadinessError();
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

function readinessReceipt<
  TBoundary extends
    FloodgateV7ProductionConnectorVerifierReadinessExecutionBoundary,
>(
  boundary: TBoundary,
  effectiveUserId: number,
  homeDirectory: string,
): Readonly<FloodgateV7ProductionConnectorVerifierReadinessReceipt<TBoundary>> {
  const receipt = frozenRecord({
    contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CONTRACT,
    status: FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_STATUS,
    claim_boundary:
      FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLAIM_BOUNDARY,
    execution_boundary: boundary,
    verification: frozenRecord({
      fixed_current_euid_home_repository_root: true as const,
      fixed_verifier_revision: true as const,
      pinned_receipt_git_closure_checked: true as const,
      closure_receipt_validated: true as const,
      sensitive_values_exported: false as const,
    }),
    nonclaims: frozenRecord({
      external_role_bundle_files_read: false as const,
      full_role_bundle_verifier_run: false as const,
      gate_authority: false as const,
      registry_authority: false as const,
      connector_authority: false as const,
      teacher_label: false as const,
      training: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      playing_strength: false as const,
      path_disclosed: false as const,
      revision_disclosed: false as const,
      digest_disclosed: false as const,
      private_identity_disclosed: false as const,
    }),
  });
  reflectApply(weakMapSet, identityBindings, [
    receipt,
    frozenRecord({ effectiveUserId, homeDirectory }),
  ]);
  return receipt;
}

function sameExactKeys(
  descriptors: PropertyDescriptorMap,
  expected: readonly string[],
): boolean {
  const keys = reflectOwnKeys(descriptors);
  if (keys.length !== expected.length) return false;
  for (const key of keys) {
    if (typeof key !== "string" || !expected.includes(key)) return false;
  }
  return true;
}

function enumerableDataValue(
  descriptors: PropertyDescriptorMap,
  key: string,
): unknown {
  const descriptor = descriptors[key];
  if (
    descriptor === undefined ||
    !("value" in descriptor) ||
    descriptor.enumerable !== true
  ) {
    throw new FloodgateV7ProductionConnectorVerifierReadinessError();
  }
  return descriptor.value;
}

function canonicalHomeDirectory(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\0") &&
    pathIsAbsolute(value) &&
    pathResolve(value) === value
  );
}

function captureDependencies(
  value: FloodgateV7ProductionConnectorVerifierReadinessDependenciesForTests,
): Readonly<FloodgateV7ProductionConnectorVerifierReadinessDependenciesForTests> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== objectPrototype
  ) {
    throw new FloodgateV7ProductionConnectorVerifierReadinessError();
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  if (!sameExactKeys(descriptors, DEPENDENCY_KEYS)) {
    throw new FloodgateV7ProductionConnectorVerifierReadinessError();
  }
  const effectiveUserId = enumerableDataValue(descriptors, "effectiveUserId");
  const homeDirectory = enumerableDataValue(descriptors, "homeDirectory");
  const assertPinnedReceiptGitClosure = enumerableDataValue(
    descriptors,
    "assertPinnedReceiptGitClosure",
  );
  if (
    typeof effectiveUserId !== "number" ||
    !numberIsSafeInteger(effectiveUserId) ||
    effectiveUserId < 0 ||
    !canonicalHomeDirectory(homeDirectory) ||
    typeof assertPinnedReceiptGitClosure !== "function" ||
    nodeIsProxy(assertPinnedReceiptGitClosure)
  ) {
    throw new FloodgateV7ProductionConnectorVerifierReadinessError();
  }
  return frozenRecord({
    effectiveUserId,
    homeDirectory,
    assertPinnedReceiptGitClosure:
      assertPinnedReceiptGitClosure as AssertPinnedReceiptGitClosureForTests,
  });
}

function pinnedClosureOptions(homeDirectory: string): Readonly<{
  readonly repositoryRoot: string;
  readonly verifierRevision: string;
}> {
  const repositoryRoot = pathJoin(
    homeDirectory,
    ...ROLE_BUNDLE_REPOSITORY_SUFFIX,
  );
  if (
    !pathIsAbsolute(repositoryRoot) ||
    pathResolve(repositoryRoot) !== repositoryRoot
  ) {
    throw new FloodgateV7ProductionConnectorVerifierReadinessError();
  }
  return objectFreeze({
    repositoryRoot,
    verifierRevision: FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION,
  });
}

async function verifyReadiness<
  TBoundary extends
    FloodgateV7ProductionConnectorVerifierReadinessExecutionBoundary,
>(
  dependencies: Readonly<FloodgateV7ProductionConnectorVerifierReadinessDependenciesForTests>,
  boundary: TBoundary,
): Promise<
  Readonly<FloodgateV7ProductionConnectorVerifierReadinessReceipt<TBoundary>>
> {
  try {
    const closureResult: unknown = await reflectApply(
      dependencies.assertPinnedReceiptGitClosure,
      undefined,
      [pinnedClosureOptions(dependencies.homeDirectory)],
    );
    if (closureResult !== undefined) {
      throw new FloodgateV7ProductionConnectorVerifierReadinessError();
    }
    return readinessReceipt(
      boundary,
      dependencies.effectiveUserId,
      dependencies.homeDirectory,
    );
  } catch {
    throw new FloodgateV7ProductionConnectorVerifierReadinessError();
  }
}

/**
 * Consume the private identity binding of one readiness receipt without
 * returning the EUID or home path. A receipt cannot be replayed after a claim.
 */
export function assertFloodgateV7ProductionConnectorVerifierReadinessIdentityBinding(
  receipt: unknown,
  expectedEffectiveUserId: number,
  expectedHomeDirectory: string,
): void {
  if (
    arguments.length !== 3 ||
    receipt === null ||
    typeof receipt !== "object" ||
    nodeIsProxy(receipt) ||
    !numberIsSafeInteger(expectedEffectiveUserId) ||
    expectedEffectiveUserId < 0 ||
    !canonicalHomeDirectory(expectedHomeDirectory)
  ) {
    throw new FloodgateV7ProductionConnectorVerifierReadinessError();
  }
  const binding = reflectApply(weakMapGet, identityBindings, [receipt]) as
    Readonly<{ effectiveUserId: number; homeDirectory: string }> | undefined;
  reflectApply(weakMapDelete, identityBindings, [receipt]);
  if (
    binding === undefined ||
    binding.effectiveUserId !== expectedEffectiveUserId ||
    binding.homeDirectory !== expectedHomeDirectory
  ) {
    throw new FloodgateV7ProductionConnectorVerifierReadinessError();
  }
}

/** Test-only boundary with injected current-user identity and closure assertion. */
export function verifyFloodgateV7ProductionConnectorVerifierReadinessCoreForTests(
  dependenciesValue: FloodgateV7ProductionConnectorVerifierReadinessDependenciesForTests,
): Promise<
  Readonly<
    FloodgateV7ProductionConnectorVerifierReadinessReceipt<"test-only-injected-current-euid-home-role-bundle-receipt-git-closure">
  >
> {
  if (arguments.length !== 1) {
    return rejected(new FloodgateV7ProductionConnectorVerifierReadinessError());
  }
  let dependencies: Readonly<FloodgateV7ProductionConnectorVerifierReadinessDependenciesForTests>;
  try {
    dependencies = captureDependencies(dependenciesValue);
  } catch {
    return rejected(new FloodgateV7ProductionConnectorVerifierReadinessError());
  }
  return verifyReadiness(
    dependencies,
    "test-only-injected-current-euid-home-role-bundle-receipt-git-closure",
  );
}

/** Fixed, zero-argument production receipt-Git-closure readiness check. */
export function verifyFloodgateV7ProductionConnectorVerifierReadiness(): Promise<
  Readonly<
    FloodgateV7ProductionConnectorVerifierReadinessReceipt<"production-fixed-current-euid-userinfo-home-role-bundle-receipt-git-closure">
  >
> {
  if (arguments.length !== 0 || getEffectiveUserId === null) {
    return rejected(new FloodgateV7ProductionConnectorVerifierReadinessError());
  }
  try {
    const effectiveUserId = getEffectiveUserId();
    const userInfo = getUserInfo();
    if (userInfo.uid !== effectiveUserId) {
      throw new FloodgateV7ProductionConnectorVerifierReadinessError();
    }
    const dependencies = captureDependencies({
      effectiveUserId,
      homeDirectory: userInfo.homedir,
      assertPinnedReceiptGitClosure:
        assertPinnedFloodgateRoleBundleReceiptGitClosure,
    });
    return verifyReadiness(
      dependencies,
      "production-fixed-current-euid-userinfo-home-role-bundle-receipt-git-closure",
    );
  } catch {
    return rejected(new FloodgateV7ProductionConnectorVerifierReadinessError());
  }
}
