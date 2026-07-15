/**
 * Argumentless CLI for the deterministic, test-only Floodgate v7 connector
 * gate composition. It has no production authority and writes no artifact.
 */

const NativePromise = Promise;
const stringify = JSON.stringify;
const FIXED_FAILURE_MESSAGE =
  "Floodgate v7 offline connector gate contract composition failed without evidence\n";

function writeOutput(stream: NodeJS.WriteStream, value: string): Promise<void> {
  return new NativePromise((resolve, reject) => {
    let settled = false;
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      stream.off("error", onError);
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
          : new Error("offline connector gate output failed"),
      );
    }
  });
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error("offline connector gate runner accepts no arguments");
  }
  const runner = module.require(
    "./floodgate-v7-offline-connector-gate-runner",
  ) as typeof import("./floodgate-v7-offline-connector-gate-runner");
  const receipt =
    await runner.runFloodgateV7OfflineConnectorGateContractComposition();
  await writeOutput(process.stdout, `${stringify(receipt, null, 2)}\n`);
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
