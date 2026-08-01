#!/usr/bin/env -S npx tsx

import { publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R10 } from "./halfkp81-depth18-teacher-runner";

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error(
      "the sealed v1r10 runtime-plan publisher accepts no arguments",
    );
  }
  const identity = await publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R10();
  process.stdout.write(`${JSON.stringify(identity)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[halfkp81-depth18-yaneura-only-v1r10-plan] STOP: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
