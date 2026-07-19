/**
 * Sanitized CLI adapter for the explicit local clean-room teacher command.
 * Extra arguments fail before the runner is invoked.
 */

import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CLAIM_BOUNDARY,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CONTRACT,
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_STATUS,
  FloodgateV7LocalCleanRoomTeacherRunnerError,
  claimFloodgateV7LocalCleanRoomTeacherOperationalCompletion,
  runFloodgateV7LocalCleanRoomTeacher,
  type FloodgateV7LocalCleanRoomTeacherTestRunnerReceipt,
} from "./floodgate-v7-local-clean-room-teacher-runner";

export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_CLI_SUCCESS_CONTRACT =
  "shogi-floodgate-v7-local-clean-room-teacher-cli-success-v1" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_CLI_FAILURE_CONTRACT =
  "shogi-floodgate-v7-local-clean-room-teacher-cli-failure-v1" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_CLI_STATUS =
  "real-local-run-completion-claimed-once" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_CLI_CLAIM_BOUNDARY =
  "fixed-real-runner-one-shot-internal-completion-brand-not-injected-receipt" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_SUCCESS_CONTRACT =
  "shogi-floodgate-v7-local-clean-room-teacher-test-cli-success-v1" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_FAILURE_CONTRACT =
  "shogi-floodgate-v7-local-clean-room-teacher-test-cli-failure-v1" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_STATUS =
  "test-only-injected-runner-result-not-operational-evidence" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_CLAIM_BOUNDARY =
  "test-only-injected-runner-and-io-no-operational-completion-brand" as const;

export interface FloodgateV7LocalCleanRoomTeacherCliIoForTests {
  readonly writeStdout: (value: string) => void;
  readonly writeStderr: (value: string) => void;
  readonly setExitCode: (value: number) => void;
}

function canonicalJson(value: unknown): string {
  const active = new WeakSet<object>();
  const encode = (candidate: unknown): string => {
    if (candidate === null) return "null";
    if (typeof candidate === "string" || typeof candidate === "boolean") {
      return JSON.stringify(candidate);
    }
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) {
        throw new Error("canonical JSON number differs");
      }
      return JSON.stringify(candidate);
    }
    if (typeof candidate !== "object" || nodeUtilTypes.isProxy(candidate)) {
      throw new Error("canonical JSON value differs");
    }
    if (active.has(candidate)) {
      throw new Error("canonical JSON cycle differs");
    }
    active.add(candidate);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      if (Array.isArray(candidate)) {
        if (
          Object.getPrototypeOf(candidate) !== Array.prototype ||
          Reflect.ownKeys(descriptors).length !== candidate.length + 1 ||
          !Object.hasOwn(descriptors, "length")
        ) {
          throw new Error("canonical JSON array differs");
        }
        const encoded: string[] = [];
        for (let index = 0; index < candidate.length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (
            descriptor === undefined ||
            !("value" in descriptor) ||
            !descriptor.enumerable
          ) {
            throw new Error("canonical JSON array entry differs");
          }
          encoded.push(encode(descriptor.value));
        }
        return `[${encoded.join(",")}]`;
      }
      const prototype = Object.getPrototypeOf(candidate);
      const keys = Reflect.ownKeys(descriptors);
      if (
        (prototype !== Object.prototype && prototype !== null) ||
        keys.some((key) => typeof key !== "string")
      ) {
        throw new Error("canonical JSON object differs");
      }
      return `{${(keys as string[])
        .sort()
        .map((key) => {
          const descriptor = descriptors[key];
          if (
            descriptor === undefined ||
            !("value" in descriptor) ||
            !descriptor.enumerable
          ) {
            throw new Error("canonical JSON object field differs");
          }
          return `${JSON.stringify(key)}:${encode(descriptor.value)}`;
        })
        .join(",")}}`;
    } finally {
      active.delete(candidate);
    }
  };
  return encode(value);
}

function exactArguments(value: readonly string[]): readonly string[] {
  if (
    !Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length !== 0 ||
    Reflect.ownKeys(value).length !== 1
  ) {
    throw new Error("local clean-room CLI accepts no arguments");
  }
  return value;
}

function captureIo(
  value: FloodgateV7LocalCleanRoomTeacherCliIoForTests,
): Readonly<FloodgateV7LocalCleanRoomTeacherCliIoForTests> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    !Object.isFrozen(value)
  ) {
    throw new Error("local clean-room CLI I/O differs");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expected = Object.freeze({
    writeStdout: 1,
    writeStderr: 1,
    setExitCode: 1,
  } as const);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== 3 ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !(key in expected) ||
        descriptors[key] === undefined ||
        !("value" in descriptors[key]) ||
        typeof descriptors[key].value !== "function" ||
        nodeUtilTypes.isProxy(descriptors[key].value) ||
        descriptors[key].value.length !==
          expected[key as keyof typeof expected],
    )
  ) {
    throw new Error("local clean-room CLI I/O fields differ");
  }
  return value;
}

function captureTestRunnerReceipt(
  value: Readonly<FloodgateV7LocalCleanRoomTeacherTestRunnerReceipt>,
): Readonly<FloodgateV7LocalCleanRoomTeacherTestRunnerReceipt> {
  if (
    value === null ||
    typeof value !== "object" ||
    nodeUtilTypes.isProxy(value) ||
    !Object.isFrozen(value) ||
    value.contract !==
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CONTRACT ||
    value.status !== FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_STATUS ||
    value.claim_boundary !==
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CLAIM_BOUNDARY ||
    value.execution_boundary !== "test-only-injected-opaque-operations" ||
    value.operational_evidence !== false
  ) {
    throw new Error("test-only local runner receipt differs");
  }
  return value;
}

function failureRecord(
  error: unknown,
  testOnly: boolean,
): Readonly<Record<string, unknown>> {
  const typed =
    error instanceof FloodgateV7LocalCleanRoomTeacherRunnerError
      ? error
      : undefined;
  return Object.freeze({
    contract: testOnly
      ? FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_FAILURE_CONTRACT
      : FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_CLI_FAILURE_CONTRACT,
    status: "STOP",
    claim_boundary: testOnly
      ? FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_CLAIM_BOUNDARY
      : FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_CLI_CLAIM_BOUNDARY,
    execution_boundary: testOnly
      ? "test-only-injected-cli-seam"
      : "fixed-operational-cli-one-shot-brand-claim",
    runner_contract: testOnly
      ? FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_RUNNER_CONTRACT
      : FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
    phase: typed?.phase ?? "capture",
    failure_kind: typed?.failure_kind ?? "phase-level",
    clean_room_may_exist: typed?.clean_room_may_exist ?? false,
    checkpoint_may_exist: typed?.checkpoint_may_exist ?? false,
    retry_disposition:
      typed?.retry_disposition ?? "fresh-absent-clean-room-required",
    sensitive_values_disclosed: false,
    aws_used: false,
    network_used: false,
    live_weight_touched: false,
  });
}

/**
 * Test seam. The runner callback is captured only after the zero-argument
 * contract and sanitized I/O boundary pass.
 */
export async function runFloodgateV7LocalCleanRoomTeacherCliCoreForTests(
  argumentsValue: readonly string[],
  runnerValue: () => Promise<
    Readonly<FloodgateV7LocalCleanRoomTeacherTestRunnerReceipt>
  >,
  ioValue: FloodgateV7LocalCleanRoomTeacherCliIoForTests,
): Promise<void> {
  let io: Readonly<FloodgateV7LocalCleanRoomTeacherCliIoForTests> | undefined;
  try {
    if (arguments.length !== 3) {
      throw new Error("local clean-room CLI adapter arity differs");
    }
    exactArguments(argumentsValue);
    io = captureIo(ioValue);
    if (
      typeof runnerValue !== "function" ||
      nodeUtilTypes.isProxy(runnerValue) ||
      runnerValue.length !== 0
    ) {
      throw new Error("local clean-room CLI runner differs");
    }
    const receipt = captureTestRunnerReceipt(await runnerValue());
    io.writeStdout(
      `${canonicalJson(
        Object.freeze({
          contract:
            FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_SUCCESS_CONTRACT,
          status: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_STATUS,
          claim_boundary:
            FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_TEST_CLI_CLAIM_BOUNDARY,
          execution_boundary: "test-only-injected-cli-seam",
          operational_evidence: false,
          receipt,
        }),
      )}\n`,
    );
    io.setExitCode(0);
  } catch (error) {
    const destination =
      io ??
      (() => {
        try {
          return captureIo(ioValue);
        } catch {
          return undefined;
        }
      })();
    destination?.writeStderr(`${canonicalJson(failureRecord(error, true))}\n`);
    destination?.setExitCode(1);
  }
}

/** Argumentless process adapter used only by the dedicated package command. */
export function runFloodgateV7LocalCleanRoomTeacherCli(): Promise<void> {
  if (arguments.length !== 0) {
    return Promise.reject(
      new FloodgateV7LocalCleanRoomTeacherRunnerError("capture", false, false),
    );
  }
  const io = Object.freeze({
    writeStdout: (value: string): void => {
      process.stdout.write(value);
    },
    writeStderr: (value: string): void => {
      process.stderr.write(value);
    },
    setExitCode: (value: number): void => {
      process.exitCode = value;
    },
  });
  return (async (): Promise<void> => {
    try {
      exactArguments(process.argv.slice(2));
      const completion = await runFloodgateV7LocalCleanRoomTeacher();
      const receipt =
        claimFloodgateV7LocalCleanRoomTeacherOperationalCompletion(completion);
      io.writeStdout(
        `${canonicalJson(
          Object.freeze({
            contract:
              FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_CLI_SUCCESS_CONTRACT,
            status: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_CLI_STATUS,
            claim_boundary:
              FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_CLI_CLAIM_BOUNDARY,
            execution_boundary: "fixed-operational-cli-one-shot-brand-claim",
            receipt,
          }),
        )}\n`,
      );
      io.setExitCode(0);
    } catch (error) {
      io.writeStderr(`${canonicalJson(failureRecord(error, false))}\n`);
      io.setExitCode(1);
    }
  })();
}
