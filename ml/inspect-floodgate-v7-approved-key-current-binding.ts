/**
 * Argumentless operator entry point for the read-only approved/current-key
 * binding diagnostic. Its success receipt contains no sensitive identities.
 */

import { verifyFloodgateV7ApprovedKeyCurrentBinding } from "./floodgate-v7-approved-key-current-binding";

const FIXED_FAILURE_MESSAGE =
  "Floodgate v7 approved key current-binding preflight failed without a receipt\n";
const scheduleImmediate = setImmediate;

function writeOutput(stream: NodeJS.WriteStream, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
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
          : new Error("approved key current-binding output failed"),
      );
    }
  });
}

/** Test-only output boundary; it never runs the production verifier. */
export function writeFloodgateV7ApprovedKeyCurrentBindingOutputCoreForTests(
  stream: NodeJS.WriteStream,
  value: string,
): Promise<void> {
  if (arguments.length !== 2) {
    return Promise.reject(
      new TypeError(
        "test current-binding output accepts exactly two arguments",
      ),
    );
  }
  return writeOutput(stream, value);
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error(
      "approved key current-binding preflight accepts no arguments",
    );
  }
  const receipt = await verifyFloodgateV7ApprovedKeyCurrentBinding();
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
