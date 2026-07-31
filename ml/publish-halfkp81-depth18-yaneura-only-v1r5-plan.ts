#!/usr/bin/env npx tsx

import { publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R5 } from "./halfkp81-depth18-teacher-runner";

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error(
      "this create-only v1r5 runtime-plan publisher accepts no arguments",
    );
  }
  const identity = await publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R5();
  process.stdout.write(
    `${JSON.stringify({
      status: "sealed-v1r5-runtime-plan-published-no-teacher-execution",
      teacher_plan: identity,
      authority: {
        may_execute_teacher: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[halfkp81-depth18-yaneura-only-v1r5-plan-publish] STOP: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
