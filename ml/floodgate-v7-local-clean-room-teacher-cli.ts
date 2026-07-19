/**
 * Sanitized CLI adapter for the explicit local clean-room teacher command.
 * Extra arguments fail before the runner is invoked.
 */

import { types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
  FloodgateV7LocalCleanRoomTeacherRunnerError,
  runFloodgateV7LocalCleanRoomTeacher,
  type FloodgateV7LocalCleanRoomTeacherRunnerReceipt,
} from "./floodgate-v7-local-clean-room-teacher-runner";

export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_CLI_SUCCESS_CONTRACT =
  "shogi-floodgate-v7-local-clean-room-teacher-cli-success-v1" as const;
export const FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_CLI_FAILURE_CONTRACT =
  "shogi-floodgate-v7-local-clean-room-teacher-cli-failure-v1" as const;

export interface FloodgateV7LocalCleanRoomTeacherCliIoForTests {
  readonly writeStdout: (value: string) => void;
  readonly writeStderr: (value: string) => void;
  readonly setExitCode: (value: number) => void;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
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
        descriptors[key].value.length !== expected[key as keyof typeof expected],
    )
  ) {
    throw new Error("local clean-room CLI I/O fields differ");
  }
  return value;
}

function failureRecord(error: unknown): Readonly<Record<string, unknown>> {
  const typed =
    error instanceof FloodgateV7LocalCleanRoomTeacherRunnerError
      ? error
      : undefined;
  return Object.freeze({
    contract: FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_CLI_FAILURE_CONTRACT,
    status: "STOP",
    runner_contract:
      FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_RUNNER_CONTRACT,
    phase: typed?.phase ?? "capture",
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
    Readonly<FloodgateV7LocalCleanRoomTeacherRunnerReceipt>
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
    const receipt = await runnerValue();
    io.writeStdout(
      `${canonicalJson(
        Object.freeze({
          contract:
            FLOODGATE_V7_LOCAL_CLEAN_ROOM_TEACHER_CLI_SUCCESS_CONTRACT,
          status: "complete",
          receipt,
        }),
      )}\n`,
    );
    io.setExitCode(0);
  } catch (error) {
    const destination = io ?? (() => {
      try {
        return captureIo(ioValue);
      } catch {
        return undefined;
      }
    })();
    destination?.writeStderr(`${canonicalJson(failureRecord(error))}\n`);
    destination?.setExitCode(1);
  }
}

/** Argumentless process adapter used only by the dedicated package command. */
export function runFloodgateV7LocalCleanRoomTeacherCli(): Promise<void> {
  if (arguments.length !== 0) {
    return Promise.reject(
      new FloodgateV7LocalCleanRoomTeacherRunnerError(
        "capture",
        false,
        false,
      ),
    );
  }
  return runFloodgateV7LocalCleanRoomTeacherCliCoreForTests(
    process.argv.slice(2),
    runFloodgateV7LocalCleanRoomTeacher,
    Object.freeze({
      writeStdout: (value: string): void => {
        process.stdout.write(value);
      },
      writeStderr: (value: string): void => {
        process.stderr.write(value);
      },
      setExitCode: (value: number): void => {
        process.exitCode = value;
      },
    }),
  );
}
