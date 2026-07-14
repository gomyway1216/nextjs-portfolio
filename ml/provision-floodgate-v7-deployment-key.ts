/**
 * Argumentless operator entry point for one fixed Floodgate v7 deployment-key
 * provision attempt. Importing this file is not part of any test, build, or
 * deploy hook; an operator must invoke the dedicated package command.
 */

import { provisionFloodgateV7DeploymentKey } from "./floodgate-v7-deployment-key-provisioner";

const FIXED_FAILURE_MESSAGE =
  "Floodgate v7 deployment-key provisioning failed without a success receipt\n";

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
          // Keep the listener installed for the paired error event that Node
          // may emit after invoking the callback with the same failure.
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
          : new Error("deployment-key provisioner output failed"),
      );
    }
  });
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error("deployment-key provisioner accepts no arguments");
  }
  const receipt = await provisionFloodgateV7DeploymentKey();
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
