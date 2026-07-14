/**
 * Argumentless operator entry point for the read-only Floodgate v7 deployment
 * key-instance candidate inspector. It writes one pathless JSON receipt to
 * stdout and never persists or approves a control-plane record.
 */

import { inspectFloodgateV7DeploymentKeyInstance } from "./floodgate-v7-deployment-key-instance-enrollment";

const FIXED_FAILURE_MESSAGE =
  "Floodgate v7 deployment-key instance inspection failed without a candidate receipt\n";

function writeOutput(stream: NodeJS.WriteStream, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(value, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error("deployment-key instance inspector accepts no arguments");
  }
  const receipt = await inspectFloodgateV7DeploymentKeyInstance();
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
