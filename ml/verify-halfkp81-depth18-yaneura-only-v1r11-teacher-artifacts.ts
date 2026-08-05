#!/usr/bin/env npx tsx

import * as fs from "node:fs";
import * as path from "node:path";

import {
  verifyAndPublishHalfkp81Depth18TeacherArtifacts,
  verifyHalfkp81Depth18V1R11EnvironmentFaultArtifacts,
} from "./halfkp81-depth18-teacher-artifact-validation";
import { HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_MINIMAL_R13_DEFAULT_DIRECTORY } from "./halfkp81-depth18-teacher-runner";

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error(
      "the formal Yaneura-only v1r11 artifact verifier accepts no arguments",
    );
  }
  const root =
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_MINIMAL_R13_DEFAULT_DIRECTORY;
  const options = {
    artifactRoot: root,
    planPath: path.join(root, "teacher-plan.json"),
  };
  const terminalFaultPath = path.join(root, "teacher-terminal-fault.json");
  const rawReceiptPath = path.join(root, "teacher-receipt.json");
  const faultExists = fs.existsSync(terminalFaultPath);
  const successExists = fs.existsSync(rawReceiptPath);
  if (faultExists === successExists) {
    throw new Error(
      "v1r11 requires exactly one of terminal-fault or success receipt closure",
    );
  }
  const receipt = faultExists
    ? await verifyHalfkp81Depth18V1R11EnvironmentFaultArtifacts(options)
    : (await verifyAndPublishHalfkp81Depth18TeacherArtifacts(options)).receipt;
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[halfkp81-depth18-yaneura-only-v1r11-artifacts] STOP: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
