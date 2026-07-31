#!/usr/bin/env npx tsx

import * as path from "node:path";

import { verifyAndPublishHalfkp81Depth18TeacherArtifacts } from "./halfkp81-depth18-teacher-artifact-validation";
import { HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_DEFAULT_DIRECTORY } from "./halfkp81-depth18-teacher-runner";

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error(
      "the formal Yaneura-only v1r4 artifact verifier accepts no arguments",
    );
  }
  const result = await verifyAndPublishHalfkp81Depth18TeacherArtifacts({
    artifactRoot: HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_DEFAULT_DIRECTORY,
    planPath: path.join(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R4_DEFAULT_DIRECTORY,
      "teacher-plan.json",
    ),
  });
  process.stdout.write(`${JSON.stringify(result.receipt)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[halfkp81-depth18-yaneura-only-v1r4-artifacts] STOP: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
