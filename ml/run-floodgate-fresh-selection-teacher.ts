/** Argumentless CLI for the fixed local fresh-selection teacher run. */

import {
  FRESH_SELECTION_TEACHER_RUNNER_SCHEMA,
  runFreshSelectionTeacher,
  type FreshSelectionTeacherRunReceipt,
} from "./floodgate-fresh-selection-teacher-runner";

export interface FreshSelectionTeacherCliDependencies {
  readonly run: () => Promise<Readonly<FreshSelectionTeacherRunReceipt>>;
  readonly writeStdout: (text: string) => void;
}

export async function runFreshSelectionTeacherCliCore(
  arguments_: readonly string[],
  dependencies: Readonly<FreshSelectionTeacherCliDependencies>,
): Promise<Readonly<FreshSelectionTeacherRunReceipt>> {
  if (arguments_.length !== 0) {
    throw new Error(
      "fresh-selection teacher accepts no arguments or path overrides",
    );
  }
  const receipt = await dependencies.run();
  dependencies.writeStdout(
    `${JSON.stringify({
      schema: "shogi-floodgate-strength-first-selection-teacher-cli-output-v1",
      status: receipt.status,
      receipt_schema: FRESH_SELECTION_TEACHER_RUNNER_SCHEMA,
      idempotent_existing_result: receipt.idempotent_existing_result,
      completed_parents: receipt.completed_parents,
      emitted_parent_groups: receipt.emitted_parent_groups,
      dataset_records: receipt.dataset_records,
      parallel_engines: receipt.parallel_engines,
      live_weight_changes: receipt.live_weight_changes,
      private_paths_emitted: false,
      labels_emitted: false,
    })}\n`,
  );
  return receipt;
}

export function runFreshSelectionTeacherCli(): Promise<
  Readonly<FreshSelectionTeacherRunReceipt>
> {
  return runFreshSelectionTeacherCliCore(process.argv.slice(2), {
    run: runFreshSelectionTeacher,
    writeStdout: (text) => process.stdout.write(text),
  });
}

if (require.main === module) {
  void runFreshSelectionTeacherCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`fresh-selection teacher failed: ${message}\n`);
    process.exitCode = 1;
  });
}
