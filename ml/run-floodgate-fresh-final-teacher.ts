/** Argumentless CLI for the receipt-gated local fresh-final teacher run. */

import {
  FRESH_FINAL_TEACHER_PREFLIGHT_CLI_SCHEMA,
  FRESH_FINAL_TEACHER_RUNNER_SCHEMA,
  FreshFinalTeacherBlocked,
  runFreshFinalTeacher,
  type FreshFinalTeacherBlockedReceipt,
  type FreshFinalTeacherRunReceipt,
} from "./floodgate-fresh-final-teacher-runner";

export interface FreshFinalTeacherCliDependencies {
  readonly run: () => Promise<Readonly<FreshFinalTeacherRunReceipt>>;
  readonly writeStdout: (text: string) => void;
}

export type FreshFinalTeacherCliOutcome =
  | Readonly<FreshFinalTeacherRunReceipt>
  | Readonly<FreshFinalTeacherBlockedReceipt>;

function argumentStop(): Readonly<FreshFinalTeacherBlockedReceipt> {
  return Object.freeze({
    schema: FRESH_FINAL_TEACHER_PREFLIGHT_CLI_SCHEMA,
    status: "STOP",
    reason: "arguments-forbidden",
    selection_evaluator_registry_reads: 0,
    selection_receipt_reads: 0,
    selection_dataset_reads: 0,
    fresh_final_source_reads: 0,
    fresh_final_label_reads: 0,
    teacher_engines_started: 0,
    network_requests: 0,
    cloud_requests: 0,
    live_weight_writes: 0,
  });
}

export async function runFreshFinalTeacherCliCore(
  arguments_: readonly string[],
  dependencies: Readonly<FreshFinalTeacherCliDependencies>,
): Promise<Readonly<FreshFinalTeacherCliOutcome>> {
  if (arguments_.length !== 0) {
    const stopped = argumentStop();
    dependencies.writeStdout(`${JSON.stringify(stopped)}\n`);
    return stopped;
  }
  try {
    const receipt = await dependencies.run();
    dependencies.writeStdout(
      `${JSON.stringify({
        schema:
          "shogi-floodgate-strength-first-fresh-final-teacher-cli-output-v1",
        status: receipt.status,
        receipt_schema: FRESH_FINAL_TEACHER_RUNNER_SCHEMA,
        idempotent_existing_result: receipt.idempotent_existing_result,
        selected_seed: receipt.selected_seed,
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
  } catch (error) {
    if (!(error instanceof FreshFinalTeacherBlocked)) throw error;
    dependencies.writeStdout(`${JSON.stringify(error.receipt)}\n`);
    return error.receipt;
  }
}

export function runFreshFinalTeacherCli(): Promise<
  Readonly<FreshFinalTeacherCliOutcome>
> {
  return runFreshFinalTeacherCliCore(process.argv.slice(2), {
    run: runFreshFinalTeacher,
    writeStdout: (text) => process.stdout.write(text),
  });
}

if (require.main === module) {
  void runFreshFinalTeacherCli()
    .then((outcome) => {
      if (outcome.status === "STOP") process.exitCode = 2;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`fresh-final teacher failed: ${message}\n`);
      process.exitCode = 1;
    });
}
