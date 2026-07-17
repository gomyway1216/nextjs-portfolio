/**
 * Argumentless public CLI for the fixed production connector-verifier
 * readiness observation. Runtime and argv are checked before the readiness
 * implementation is loaded, and every public field is rebuilt from fixed
 * allowlists without exposing repository or current-user identity.
 */

import { types as nodeUtilTypes } from "node:util";

import { assertFloodgateV7ProductionApplicationEntrypointContext } from "./floodgate-v7-production-application-source-provenance";
import { claimFloodgateV7ProductionNativeLauncherAttestation } from "./floodgate-v7-production-native-launcher-attestation";

export const FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLI_SUCCESS_CONTRACT =
  "shogi-floodgate-v7-production-connector-verifier-readiness-cli-success-v1" as const;
export const FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLI_FAILURE_CONTRACT =
  "shogi-floodgate-v7-production-connector-verifier-readiness-cli-failure-v1" as const;

interface VerifierReadinessModule {
  readonly verifyFloodgateV7ProductionConnectorVerifierReadiness: () => Promise<unknown>;
}

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
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const nodeIsProxy = nodeUtilTypes.isProxy;
const ENTRYPOINT =
  "ml/inspect-floodgate-v7-production-connector-verifier-readiness.ts" as const;
const REQUIRED_NODE_VERSION = "v22.13.0" as const;
const CORE_CONTRACT =
  "shogi-floodgate-v7-production-connector-verifier-readiness-v1" as const;
const CORE_STATUS = "pinned-role-bundle-receipt-git-closure-checked" as const;
const CORE_CLAIM_BOUNDARY =
  "git-clean-nonignored-worktree-exact-revision-tracked-source-tree-and-pinned-receipt-evidence-non-authorizing-readiness-no-external-role-bundle-files-read-full-verifier-gate-registry-authority-label-training-strength-or-sensitive-identity" as const;
const CORE_EXECUTION_BOUNDARY =
  "production-fixed-current-euid-userinfo-home-role-bundle-receipt-git-closure" as const;
const TOP_KEYS = objectFreeze([
  "contract",
  "status",
  "claim_boundary",
  "execution_boundary",
  "verification",
  "nonclaims",
] as const);
const VERIFICATION_KEYS = objectFreeze([
  "fixed_current_euid_home_repository_root",
  "fixed_verifier_revision",
  "pinned_receipt_git_closure_checked",
  "closure_receipt_validated",
  "sensitive_values_exported",
] as const);
const CORE_NONCLAIM_KEYS = objectFreeze([
  "external_role_bundle_files_read",
  "full_role_bundle_verifier_run",
  "gate_authority",
  "registry_authority",
  "connector_authority",
  "teacher_label",
  "training",
  "weight",
  "live_evaluation_activation",
  "playing_strength",
  "path_disclosed",
  "revision_disclosed",
  "digest_disclosed",
  "private_identity_disclosed",
] as const);
const PUBLIC_NONCLAIM_KEYS = objectFreeze([
  "external_role_bundle_files_read",
  "full_role_bundle_verifier_run",
  "gate_authority",
  "registry_authority",
  "connector_authority",
  "reconciliation_performed",
  "reconciliation_authority",
  "teacher_label",
  "training",
  "weight",
  "live_evaluation_activation",
  "playing_strength",
  "path_disclosed",
  "revision_disclosed",
  "digest_disclosed",
  "effective_user_id_disclosed",
  "home_directory_disclosed",
  "private_identity_disclosed",
  "ignored_untracked_dependency_bytes_verified",
  "same_uid_race_isolation",
  "atomic_source_snapshot",
  "tool_byte_closure_verified",
  "atomic_process_lineage_snapshot",
  "same_uid_or_ancestor_hostile_process_isolation",
  "production_managed_namespace_or_file_content_mutation_performed",
  "atime_invariance",
] as const);

function defineData(
  target: object,
  key: PropertyKey,
  value: unknown,
  enumerable = true,
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
    if (typeof key !== "string") {
      throw new NativeError("verifier readiness CLI record differs");
    }
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new NativeError("verifier readiness CLI record differs");
    }
    defineData(output, key, descriptor.value, descriptor.enumerable ?? false);
  }
  return objectFreeze(output);
}

function hasExpectedKey(
  keys: readonly string[],
  candidate: PropertyKey,
): candidate is string {
  if (typeof candidate !== "string") return false;
  for (const key of keys) {
    if (key === candidate) return true;
  }
  return false;
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
    throw new NativeError("verifier readiness CLI value is not a record");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(descriptors);
  if (ownKeys.length !== keys.length) {
    throw new NativeError("verifier readiness CLI record key count differs");
  }
  for (const key of ownKeys) {
    if (!hasExpectedKey(keys, key)) {
      throw new NativeError("verifier readiness CLI record key differs");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("verifier readiness CLI record is not plain data");
    }
  }
  return value as Record<string, unknown>;
}

function allExactBooleans(
  record: Record<string, unknown>,
  keys: readonly string[],
  expected: boolean,
): boolean {
  for (const key of keys) {
    if (record[key] !== expected) return false;
  }
  return true;
}

function publicNonclaims(): Readonly<Record<string, false>> {
  const values = objectCreate(null) as Record<string, false>;
  for (const key of PUBLIC_NONCLAIM_KEYS) {
    defineData(values, key, false);
  }
  return objectFreeze(values);
}

function sanitizedSuccess(value: unknown): Readonly<object> {
  const receipt = dataRecord(value, TOP_KEYS);
  const verification = dataRecord(receipt.verification, VERIFICATION_KEYS);
  const nonclaims = dataRecord(receipt.nonclaims, CORE_NONCLAIM_KEYS);
  if (
    receipt.contract !== CORE_CONTRACT ||
    receipt.status !== CORE_STATUS ||
    receipt.claim_boundary !== CORE_CLAIM_BOUNDARY ||
    receipt.execution_boundary !== CORE_EXECUTION_BOUNDARY ||
    verification.fixed_current_euid_home_repository_root !== true ||
    verification.fixed_verifier_revision !== true ||
    verification.pinned_receipt_git_closure_checked !== true ||
    verification.closure_receipt_validated !== true ||
    verification.sensitive_values_exported !== false ||
    !allExactBooleans(nonclaims, CORE_NONCLAIM_KEYS, false)
  ) {
    throw new NativeError("verifier readiness CLI receipt differs");
  }
  return frozenRecord({
    contract:
      FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLI_SUCCESS_CONTRACT,
    status: CORE_STATUS,
    claim_boundary: CORE_CLAIM_BOUNDARY,
    execution_boundary: CORE_EXECUTION_BOUNDARY,
    verification: frozenRecord({
      fixed_current_euid_home_repository_root: true as const,
      fixed_verifier_revision: true as const,
      pinned_receipt_git_closure_checked: true as const,
      closure_receipt_validated: true as const,
      sensitive_values_exported: false as const,
    }),
    nonclaims: publicNonclaims(),
    success_receipt_issued: true as const,
  });
}

function sanitizedFailure(): Readonly<object> {
  return frozenRecord({
    contract:
      FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLI_FAILURE_CONTRACT,
    status:
      "production-connector-verifier-readiness-did-not-issue-success" as const,
    readiness_result: "NOT-READY" as const,
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
          : new NativeError("verifier readiness CLI output failed"),
      );
    }
  });
}

/** Test-only output seam; it never loads or invokes production readiness. */
export function writeFloodgateV7ProductionConnectorVerifierReadinessOutputCoreForTests(
  stream: NodeJS.WriteStream,
  value: string,
): Promise<void> {
  if (arguments.length !== 2) {
    return NativePromise.reject(
      new NativeTypeError(
        "verifier readiness output test seam accepts two arguments",
      ),
    );
  }
  return writeOutput(stream, value);
}

export async function runFloodgateV7ProductionConnectorVerifierReadinessCli(): Promise<void> {
  try {
    if (
      arguments.length !== 0 ||
      process.argv.length !== 2 ||
      process.version !== REQUIRED_NODE_VERSION
    ) {
      throw new NativeError("verifier readiness CLI invocation differs");
    }
    claimFloodgateV7ProductionNativeLauncherAttestation(ENTRYPOINT);
    assertFloodgateV7ProductionApplicationEntrypointContext(ENTRYPOINT);
    /* eslint-disable @typescript-eslint/no-require-imports -- Deliberately lazy after runtime, launcher, and source guards. */
    const readiness =
      require("./floodgate-v7-production-connector-verifier-readiness") as VerifierReadinessModule;
    /* eslint-enable @typescript-eslint/no-require-imports */
    const operation =
      readiness.verifyFloodgateV7ProductionConnectorVerifierReadiness;
    if (typeof operation !== "function" || nodeIsProxy(operation)) {
      throw new NativeError("verifier readiness export differs");
    }
    const receipt = await reflectApply(operation, undefined, []);
    await writeOutput(
      process.stdout,
      `${jsonStringify(sanitizedSuccess(receipt))}\n`,
    );
  } catch {
    process.exitCode = 1;
    try {
      await writeOutput(
        process.stderr,
        `${jsonStringify(sanitizedFailure())}\n`,
      );
    } catch {
      // The nonzero exit remains authoritative if stderr is unavailable.
    }
  }
}

if (require.main === module) {
  void runFloodgateV7ProductionConnectorVerifierReadinessCli();
}
