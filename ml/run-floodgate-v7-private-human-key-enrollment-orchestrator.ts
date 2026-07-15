/**
 * Argumentless operator entry point for the private native human-review,
 * create-only enrollment, and postflight workflow. It accepts no candidate,
 * digest, approval metadata, path, or identity through argv, env, or stdin.
 */

import {
  FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError,
  runFloodgateV7PrivateHumanKeyEnrollmentOrchestrator,
} from "./floodgate-v7-private-human-key-enrollment-orchestrator";

export const FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_FAILURE_CONTRACT =
  "shogi-floodgate-v7-private-human-key-enrollment-failure-v1" as const;
export const FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_FAILURE_STATUS =
  "private-human-key-enrollment-did-not-issue-a-success-receipt" as const;

const POSSIBLY_COMMITTED_OUTPUT_FAILURE =
  "Floodgate v7 private human enrollment may have committed; do not retry before the sanitized binding preflight\n";
const scheduleImmediate = setImmediate;
const stringify = JSON.stringify.bind(JSON);

function writeOutput(stream: NodeJS.WriteStream, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      // A failed callback can be followed by a paired error event. Keep the
      // listener through this event-loop turn, then detach before rejecting.
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
        error instanceof Error
          ? error
          : new Error("private human enrollment output failed"),
      );
    }
  });
}

/** Test-only output boundary; it never invokes the production orchestrator. */
export function writeFloodgateV7PrivateHumanKeyEnrollmentOutputCoreForTests(
  stream: NodeJS.WriteStream,
  value: string,
): Promise<void> {
  if (arguments.length !== 2) {
    return Promise.reject(
      new TypeError("test private enrollment output accepts two arguments"),
    );
  }
  return writeOutput(stream, value);
}

function sanitizedFailure(
  failure: FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    contract: FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_FAILURE_CONTRACT,
    status: FLOODGATE_V7_PRIVATE_HUMAN_KEY_ENROLLMENT_FAILURE_STATUS,
    phase: failure.phase,
    durability: failure.durability,
    approved_record_may_have_been_created:
      failure.approved_record_may_have_been_created,
    retry_disposition: failure.retry_disposition,
    installer_phase: failure.installer_phase,
    installer_retry_disposition: failure.installer_retry_disposition,
    sensitive_values_disclosed: false,
    success_receipt_issued: false,
  });
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error("private human enrollment accepts no arguments");
  }

  let receipt: Awaited<
    ReturnType<typeof runFloodgateV7PrivateHumanKeyEnrollmentOrchestrator>
  >;
  try {
    receipt = await runFloodgateV7PrivateHumanKeyEnrollmentOrchestrator();
  } catch (failure) {
    if (
      failure instanceof FloodgateV7PrivateHumanKeyEnrollmentOrchestratorError
    ) {
      await writeOutput(
        process.stderr,
        `${stringify(sanitizedFailure(failure))}\n`,
      );
      process.exitCode = 1;
      return;
    }
    throw failure;
  }

  // From this point the record is known to have been installed. Any
  // serialization/output failure must use the conservative reconciliation
  // message and must never encourage a retry.
  await writeOutput(process.stdout, `${stringify(receipt)}\n`);
}

if (require.main === module) {
  const suppressPublicStreamFailure = (): void => {
    process.exitCode = 1;
  };
  process.stdout.on("error", suppressPublicStreamFailure);
  process.stderr.on("error", suppressPublicStreamFailure);
  void main().catch(async () => {
    process.exitCode = 1;
    try {
      await writeOutput(process.stderr, POSSIBLY_COMMITTED_OUTPUT_FAILURE);
    } catch {
      // The fixed exit status remains authoritative if stderr is also closed.
    }
  });
}
