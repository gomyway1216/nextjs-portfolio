#!/usr/bin/env npx tsx

import {
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R3_PREFLIGHT_DIRECTORY,
  runHalfkp81Depth18YaneuraOnlyPreflightV1R3,
} from "./halfkp81-depth18-teacher-runner";

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error(
      `this fixed 512-parent v1r3 scratch preflight accepts no arguments and creates ${HALFKP81_DEPTH18_YANEURA_ONLY_V1R3_PREFLIGHT_DIRECTORY}`,
    );
  }
  const result = await runHalfkp81Depth18YaneuraOnlyPreflightV1R3();
  process.stdout.write(`${JSON.stringify(result.receipt)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[halfkp81-depth18-yaneura-only-v1r3-preflight] STOP: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
