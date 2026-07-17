/**
 * Argumentless public boundary for the disposable prefix-100 process-death
 * drill. Runtime and argv are checked before the implementation is loaded;
 * output is rebuilt from a fixed allowlist rather than forwarding a receipt.
 */

import { types as nodeUtilTypes } from "node:util";

import {
  assertFloodgateV7ProductionApplicationEntrypointContext,
  captureFloodgateV7ProductionApplicationSourceProvenance,
} from "./floodgate-v7-production-application-source-provenance";
import { claimFloodgateV7ProductionNativeLauncherAttestation } from "./floodgate-v7-production-native-launcher-attestation";

export const FLOODGATE_V7_PREFIX_100_KILL_DRILL_CLI_SUCCESS_CONTRACT =
  "shogi-floodgate-v7-production-prefix-100-kill-drill-cli-success-v1" as const;
export const FLOODGATE_V7_PREFIX_100_KILL_DRILL_CLI_FAILURE_CONTRACT =
  "shogi-floodgate-v7-production-prefix-100-kill-drill-cli-failure-v1" as const;

interface KillDrillModule {
  readonly runFloodgateV7ProductionPrefix100DisposableKillDrill: () => Promise<unknown>;
}

const NativeError = Error;
const NativePromise = Promise;
const scheduleImmediate = setImmediate;
const stringify = JSON.stringify.bind(JSON);
const arrayIsArray = Array.isArray;
const arrayPrototype = Array.prototype;
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
  "shogi-floodgate-v7-production-prefix-100-disposable-kill-drill-v1" as const;
const CORE_STATUS =
  "six-disposable-process-death-cases-preserved-fail-closed-evidence-without-production-gate-execution" as const;
const CORE_EXECUTION_BOUNDARY =
  "fixed-current-euid-private-temporary-roots-test-only-seams-darwin-process-signals" as const;
const POINTS = objectFreeze([
  "outer-active-durable",
  "stage-lease-durable",
  "checkpoint-first-byte-written",
] as const);
const SIGNALS = objectFreeze(["SIGTERM", "SIGKILL"] as const);
const TOP_KEYS = objectFreeze([
  "contract",
  "status",
  "execution_boundary",
  "cases",
  "verification",
  "nonclaims",
] as const);
const CASE_KEYS = objectFreeze([
  "point",
  "signal",
  "exit_signal",
  "lock_contended_before_death",
  "lock_released_after_death",
  "authenticated_outer_stale_blocked_all_gates",
  "inner_lease_eexist_blocked",
  "filesystem_snapshot_preserved",
] as const);
const VERIFICATION_KEYS = objectFreeze([
  "six_cases_passed",
  "disposable_fixture_confined",
  "test_only_seams",
  "no_production_gate_invoked",
  "no_delete_truncate_or_repair_before_evidence",
  "parent_fixture_key_buffer_zeroized_after_use",
] as const);
const NONCLAIM_KEYS = objectFreeze([
  "production_prefix_100",
  "production_recovery",
  "power_loss_or_reboot",
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
      throw new NativeError("kill drill CLI record differs");
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
    throw new NativeError("kill drill CLI value is not a record");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value);
  const ownKeys = reflectOwnKeys(value);
  if (ownKeys.length !== keys.length) {
    throw new NativeError("kill drill CLI record key count differs");
  }
  for (const key of ownKeys) {
    if (typeof key !== "string" || !keys.includes(key)) {
      throw new NativeError("kill drill CLI record key differs");
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("kill drill CLI record is not plain data");
    }
  }
  return value as Record<string, unknown>;
}

function denseDataArray(value: unknown, length: number): readonly unknown[] {
  if (
    !arrayIsArray(value) ||
    nodeIsProxy(value) ||
    objectGetPrototypeOf(value) !== arrayPrototype
  ) {
    throw new NativeError("kill drill CLI cases are not a plain array");
  }
  const descriptors = objectGetOwnPropertyDescriptors(value) as Record<
    string,
    PropertyDescriptor
  >;
  const ownKeys = reflectOwnKeys(value);
  const lengthDescriptor = descriptors["length"];
  if (
    ownKeys.length !== length + 1 ||
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    lengthDescriptor.value !== length ||
    lengthDescriptor.enumerable !== false ||
    lengthDescriptor.configurable !== false
  ) {
    throw new NativeError("kill drill CLI cases array shape differs");
  }
  const output: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      throw new NativeError("kill drill CLI cases are not dense data");
    }
    output.push(descriptor.value);
  }
  if (
    ownKeys.some(
      (key) =>
        typeof key !== "string" ||
        (key !== "length" &&
          (!/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= length)),
    )
  ) {
    throw new NativeError("kill drill CLI cases array key differs");
  }
  return objectFreeze(output);
}

function sanitizedSuccess(value: unknown): Readonly<object> {
  const receipt = dataRecord(value, TOP_KEYS);
  const cases = denseDataArray(receipt.cases, 6);
  const publicCases: Readonly<object>[] = [];
  let index = 0;
  for (const point of POINTS) {
    for (const signal of SIGNALS) {
      const observed = dataRecord(cases[index], CASE_KEYS);
      if (
        observed.point !== point ||
        observed.signal !== signal ||
        observed.exit_signal !== signal ||
        observed.lock_contended_before_death !== true ||
        observed.lock_released_after_death !== true ||
        observed.authenticated_outer_stale_blocked_all_gates !== true ||
        observed.inner_lease_eexist_blocked !==
          (point !== "outer-active-durable") ||
        observed.filesystem_snapshot_preserved !== true
      ) {
        throw new NativeError("kill drill CLI case differs");
      }
      publicCases.push(
        frozenRecord({
          point,
          signal,
          exit_signal: signal,
          lock_contended_before_death: true as const,
          lock_released_after_death: true as const,
          authenticated_outer_stale_blocked_all_gates: true as const,
          inner_lease_eexist_blocked: point !== "outer-active-durable",
          filesystem_snapshot_preserved: true as const,
        }),
      );
      index += 1;
    }
  }
  const verification = dataRecord(receipt.verification, VERIFICATION_KEYS);
  if (VERIFICATION_KEYS.some((key) => verification[key] !== true)) {
    throw new NativeError("kill drill CLI verification differs");
  }
  const nonclaims = dataRecord(receipt.nonclaims, NONCLAIM_KEYS);
  if (NONCLAIM_KEYS.some((key) => nonclaims[key] !== false)) {
    throw new NativeError("kill drill CLI nonclaim differs");
  }
  if (
    receipt.contract !== CORE_CONTRACT ||
    receipt.status !== CORE_STATUS ||
    receipt.execution_boundary !== CORE_EXECUTION_BOUNDARY
  ) {
    throw new NativeError("kill drill CLI receipt differs");
  }
  return frozenRecord({
    contract: FLOODGATE_V7_PREFIX_100_KILL_DRILL_CLI_SUCCESS_CONTRACT,
    status: CORE_STATUS,
    gate: "durable-prefix-100" as const,
    execution_boundary: CORE_EXECUTION_BOUNDARY,
    cases: objectFreeze(publicCases),
    verification: frozenRecord({
      six_cases_passed: true as const,
      disposable_fixture_confined: true as const,
      test_only_seams: true as const,
      no_production_gate_invoked: true as const,
      no_delete_truncate_or_repair_before_evidence: true as const,
      parent_fixture_key_buffer_zeroized_after_use: true as const,
    }),
    nonclaims: frozenRecord(
      Object.fromEntries(NONCLAIM_KEYS.map((key) => [key, false])),
    ),
    success_receipt_issued: true as const,
  });
}

function sanitizedFailure(): Readonly<object> {
  return frozenRecord({
    contract: FLOODGATE_V7_PREFIX_100_KILL_DRILL_CLI_FAILURE_CONTRACT,
    status: "disposable-kill-drill-did-not-issue-success" as const,
    gate: "durable-prefix-100" as const,
    production_gate_invoked: false as const,
    retry_performed: false as const,
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
          : new NativeError("kill drill CLI output failed"),
      );
    }
  });
}

/** Test-only output seam; it never loads or invokes the drill. */
export function writeFloodgateV7ProductionPrefix100KillDrillOutputCoreForTests(
  stream: NodeJS.WriteStream,
  value: string,
): Promise<void> {
  if (arguments.length !== 2) {
    return NativePromise.reject(
      new TypeError("kill drill output test seam accepts two arguments"),
    );
  }
  return writeOutput(stream, value);
}

export async function runFloodgateV7ProductionPrefix100KillDrillCli(): Promise<void> {
  let loaded = false;
  try {
    if (
      arguments.length !== 0 ||
      process.argv.length !== 2 ||
      process.version !== REQUIRED_NODE_VERSION
    ) {
      throw new NativeError("kill drill CLI invocation differs");
    }
    claimFloodgateV7ProductionNativeLauncherAttestation(
      "ml/run-floodgate-v7-production-prefix-100-kill-drill.ts",
    );
    assertFloodgateV7ProductionApplicationEntrypointContext(
      "ml/run-floodgate-v7-production-prefix-100-kill-drill.ts",
    );
    await captureFloodgateV7ProductionApplicationSourceProvenance();
    /* eslint-disable @typescript-eslint/no-require-imports -- Deliberately lazy after argv and runtime guards. */
    const drill =
      require("./floodgate-v7-production-prefix-100-kill-drill") as KillDrillModule;
    /* eslint-enable @typescript-eslint/no-require-imports */
    loaded = true;
    const operation =
      drill.runFloodgateV7ProductionPrefix100DisposableKillDrill;
    if (typeof operation !== "function") {
      throw new NativeError("kill drill export differs");
    }
    const receipt = await Reflect.apply(operation, undefined, []);
    await writeOutput(
      process.stdout,
      `${stringify(sanitizedSuccess(receipt))}\n`,
    );
  } catch {
    process.exitCode = 1;
    try {
      await writeOutput(process.stderr, `${stringify(sanitizedFailure())}\n`);
    } catch {
      // The nonzero exit remains authoritative if stderr is unavailable.
    }
    void loaded;
  }
}

if (require.main === module) {
  void runFloodgateV7ProductionPrefix100KillDrillCli();
}
