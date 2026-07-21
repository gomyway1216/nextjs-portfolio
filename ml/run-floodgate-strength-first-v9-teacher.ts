/** Argumentless command entry for the local strength-first v9 teacher. */

import {
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_PUBLIC_RECEIPT_SCHEMA,
  runFloodgateStrengthFirstV9Teacher,
  type FloodgateStrengthFirstV9TeacherPublicReceipt,
} from "./floodgate-strength-first-v9-teacher-runner";

export interface FloodgateStrengthFirstV9TeacherCliDependencies {
  readonly run: () => Promise<
    Readonly<FloodgateStrengthFirstV9TeacherPublicReceipt>
  >;
  readonly writeStdout: (text: string) => void;
}

export async function runFloodgateStrengthFirstV9TeacherCliCore(
  arguments_: readonly string[],
  dependencies: FloodgateStrengthFirstV9TeacherCliDependencies,
): Promise<Readonly<FloodgateStrengthFirstV9TeacherPublicReceipt>> {
  if (arguments_.length !== 0) {
    throw new Error(
      "strength-first v9 teacher accepts no arguments or path overrides",
    );
  }
  const receipt = await dependencies.run();
  dependencies.writeStdout(
    `${JSON.stringify({
      schema: "shogi-floodgate-strength-first-v9-teacher-cli-output-v1",
      status: receipt.status,
      receipt_schema: FLOODGATE_STRENGTH_FIRST_V9_TEACHER_PUBLIC_RECEIPT_SCHEMA,
      idempotent_existing_result: receipt.idempotent_existing_result,
      result_path: receipt.result_path,
      result_file: receipt.result_file,
      runner_revision: receipt.result.runner.revision,
      completed_parents: receipt.result.completion.completed_parents,
      proposal_depth: receipt.result.teacher.runtime.proposal.depth,
      exact_rescore_depth:
        receipt.result.teacher.runtime.independent_rescore.depth,
      teacher_parallel_engines: receipt.result.teacher.runtime.parallel_engines,
      live_weight_changes: receipt.result.runner.live_weight_changes,
    })}\n`,
  );
  return receipt;
}

export function runFloodgateStrengthFirstV9TeacherCli(): Promise<
  Readonly<FloodgateStrengthFirstV9TeacherPublicReceipt>
> {
  return runFloodgateStrengthFirstV9TeacherCliCore(process.argv.slice(2), {
    run: runFloodgateStrengthFirstV9Teacher,
    writeStdout: (text) => process.stdout.write(text),
  });
}

if (require.main === module) {
  void runFloodgateStrengthFirstV9TeacherCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`strength-first v9 teacher failed: ${message}\n`);
    process.exitCode = 1;
  });
}
