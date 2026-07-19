/**
 * Argumentless package-command entry point for the local strength-first run.
 * Importing this module has no execution side effect.
 */

import {
  FLOODGATE_STRENGTH_FIRST_TEACHER_PUBLIC_RECEIPT_SCHEMA,
  runFloodgateStrengthFirstTeacher,
  type FloodgateStrengthFirstTeacherPublicReceipt,
} from "./floodgate-strength-first-teacher-runner";

export interface FloodgateStrengthFirstTeacherCliDependencies {
  readonly run: () => Promise<
    Readonly<FloodgateStrengthFirstTeacherPublicReceipt>
  >;
  readonly writeStdout: (text: string) => void;
}

export async function runFloodgateStrengthFirstTeacherCliCore(
  arguments_: readonly string[],
  dependencies: FloodgateStrengthFirstTeacherCliDependencies,
): Promise<Readonly<FloodgateStrengthFirstTeacherPublicReceipt>> {
  if (arguments_.length !== 0) {
    throw new Error(
      "strength-first teacher accepts no arguments or path overrides",
    );
  }
  const receipt = await dependencies.run();
  dependencies.writeStdout(
    `${JSON.stringify({
      schema: "shogi-floodgate-strength-first-teacher-cli-output-v1",
      status: receipt.status,
      receipt_schema: FLOODGATE_STRENGTH_FIRST_TEACHER_PUBLIC_RECEIPT_SCHEMA,
      idempotent_existing_result: receipt.idempotent_existing_result,
      result_path: receipt.result_path,
      result_file: receipt.result_file,
      runner_revision: receipt.result.runner.revision,
      completed_parents: receipt.result.completion.completed_parents,
      teacher_parallel_engines: receipt.result.teacher.parallel_engines,
      stable_engine_or_policy_executions:
        receipt.result.teacher.stable_engine_or_policy_executions,
      live_weight_changes: receipt.result.runner.live_weight_changes,
    })}\n`,
  );
  return receipt;
}

export function runFloodgateStrengthFirstTeacherCli(): Promise<
  Readonly<FloodgateStrengthFirstTeacherPublicReceipt>
> {
  return runFloodgateStrengthFirstTeacherCliCore(process.argv.slice(2), {
    run: runFloodgateStrengthFirstTeacher,
    writeStdout: (text) => process.stdout.write(text),
  });
}

if (require.main === module) {
  void runFloodgateStrengthFirstTeacherCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`strength-first teacher failed: ${message}\n`);
    process.exitCode = 1;
  });
}
