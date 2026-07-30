#!/usr/bin/env npx tsx

import {
  HALFKP81_DEPTH18_TEACHER_DEFAULT_PLAN_PATH,
  runHalfkp81Depth18Teacher,
} from "./halfkp81-depth18-teacher-runner";

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error(
      `this formal runner accepts no arguments and reads ${HALFKP81_DEPTH18_TEACHER_DEFAULT_PLAN_PATH}`,
    );
  }
  const result = await runHalfkp81Depth18Teacher();
  process.stdout.write(`${JSON.stringify(result.receipt)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[halfkp81-depth18-teacher] STOP: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
