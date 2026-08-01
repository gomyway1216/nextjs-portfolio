#!/usr/bin/env -S npx tsx

import {
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_DEFAULT_PLAN_PATH,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_PREREGISTRATION_IDENTITY,
  authenticateHalfkp81Depth18TeacherPlan,
} from "./halfkp81-depth18-teacher-runner";

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error(
      `this read-only v1r10 plan authenticator accepts no arguments and reads ${HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_DEFAULT_PLAN_PATH}`,
    );
  }
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_DEFAULT_PLAN_PATH,
  );
  if (
    authenticated.planIdentity.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R9 ||
    (authenticated.plan.preregistration as Record<string, unknown>)?.path !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_PREREGISTRATION_IDENTITY.path ||
    (authenticated.plan.preregistration as Record<string, unknown>)?.bytes !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_PREREGISTRATION_IDENTITY.bytes ||
    (authenticated.plan.preregistration as Record<string, unknown>)?.sha256 !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_PREREGISTRATION_IDENTITY.sha256 ||
    (authenticated.plan.preregistration as Record<string, unknown>)?.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R10_PREREGISTRATION_IDENTITY.schema
  ) {
    throw new Error("authenticated plan is not Yaneura-only v1r10");
  }
  process.stdout.write(
    `${JSON.stringify({
      status: "authenticated-read-only-no-teacher-execution",
      teacher_plan: authenticated.planIdentity,
      selection_jsonl: authenticated.selectionIdentity,
      selection_manifest: authenticated.selectionManifestIdentity,
      parents: authenticated.parents.length,
      stable_runtime_calls: 0,
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
    `[halfkp81-depth18-yaneura-only-v1r10-plan-authenticate] STOP: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
