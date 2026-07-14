/**
 * Argumentless, read-only operator preflight for the fixed approved enrollment
 * record. It never reads deployment-key bytes or invokes a connector gate.
 */

import {
  claimFloodgateV7ApprovedKeyEnrollment,
  loadFloodgateV7ApprovedKeyEnrollment,
} from "./floodgate-v7-approved-key-enrollment";

const FIXED_FAILURE_MESSAGE =
  "Floodgate v7 approved key enrollment preflight failed without a receipt\n";

function writeOutput(stream: NodeJS.WriteStream, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
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
          : new Error("approved enrollment preflight output failed"),
      );
    }
  });
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error("approved enrollment preflight accepts no arguments");
  }
  const capability = await loadFloodgateV7ApprovedKeyEnrollment();
  const receipt = claimFloodgateV7ApprovedKeyEnrollment(capability);
  await writeOutput(process.stdout, `${JSON.stringify(receipt)}\n`);
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
      await writeOutput(process.stderr, FIXED_FAILURE_MESSAGE);
    } catch {
      // The fixed exit status remains authoritative if stderr is also closed.
    }
  });
}
