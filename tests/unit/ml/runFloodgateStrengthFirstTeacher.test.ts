import { describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_STRENGTH_FIRST_TEACHER_PUBLIC_RECEIPT_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_TEACHER_RESULT_SCHEMA,
  type FloodgateStrengthFirstTeacherPublicReceipt,
} from "../../../ml/floodgate-strength-first-teacher-runner";
import { runFloodgateStrengthFirstTeacherCliCore } from "../../../ml/run-floodgate-strength-first-teacher";

function receipt(): Readonly<FloodgateStrengthFirstTeacherPublicReceipt> {
  return {
    schema: FLOODGATE_STRENGTH_FIRST_TEACHER_PUBLIC_RECEIPT_SCHEMA,
    status: "complete-training-only-postflight-bound",
    idempotent_existing_result: false,
    result_path: "/fixed/result.json",
    result_file: {
      path: "result.json",
      bytes: 100,
      sha256: "1".repeat(64),
    },
    result: {
      schema: FLOODGATE_STRENGTH_FIRST_TEACHER_RESULT_SCHEMA,
      runner: {
        revision: "2".repeat(40),
        live_weight_changes: 0,
      },
      completion: { completed_parents: 24_000 },
      teacher: {
        parallel_engines: 12,
        stable_engine_or_policy_executions: 0,
      },
    },
  } as Readonly<FloodgateStrengthFirstTeacherPublicReceipt>;
}

describe("Floodgate strength-first teacher CLI", () => {
  it("rejects every extra argument before invoking the runner", async () => {
    const run = vi.fn(async () => receipt());
    await expect(
      runFloodgateStrengthFirstTeacherCliCore(["--output", "/tmp/other"], {
        run,
        writeStdout: vi.fn(),
      }),
    ).rejects.toThrow(/no arguments or path overrides/i);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs once without arguments and emits a compact non-strength claim", async () => {
    const run = vi.fn(async () => receipt());
    const writeStdout = vi.fn();
    const result = await runFloodgateStrengthFirstTeacherCliCore([], {
      run,
      writeStdout,
    });
    expect(result).toBe(await run.mock.results[0].value);
    expect(run).toHaveBeenCalledTimes(1);
    expect(writeStdout).toHaveBeenCalledTimes(1);
    const output = JSON.parse(writeStdout.mock.calls[0][0]) as Record<
      string,
      unknown
    >;
    expect(output).toMatchObject({
      schema: "shogi-floodgate-strength-first-teacher-cli-output-v1",
      status: "complete-training-only-postflight-bound",
      result_path: "/fixed/result.json",
      completed_parents: 24_000,
      teacher_parallel_engines: 12,
      stable_engine_or_policy_executions: 0,
      live_weight_changes: 0,
    });
  });
});
