#!/usr/bin/env -S npx tsx

import * as path from "node:path";

import {
  readHalfkp81Depth18PrivateArtifact,
  validateHalfkp81Depth18V1R10ImportableSet,
} from "./halfkp81-depth18-teacher-artifact-validation";

const RUN_ROOT =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r10";
const SELECTION_ROOT =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-strength-v1";
const ASSET_ROOT =
  "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1";
const REPOSITORY_ROOT = path.resolve(__dirname, "..");

async function read(
  file: string,
  root: string,
  label: string,
  maximumBytes: number,
  requirePrivateMode = true,
) {
  return readHalfkp81Depth18PrivateArtifact(
    file,
    root,
    process.getuid?.() ?? -1,
    label,
    maximumBytes,
    requirePrivateMode,
  );
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error("the fixed v1r10 import-set verifier accepts no arguments");
  }
  const plan = await read(
    path.join(RUN_ROOT, "teacher-plan.json"),
    RUN_ROOT,
    "v1r10 source plan",
    16_859,
  );
  const work = await read(
    path.join(RUN_ROOT, "teacher-work.jsonl"),
    RUN_ROOT,
    "v1r10 source work",
    91_081_134,
  );
  const header = JSON.parse(
    Buffer.from(work.bytes).subarray(0, Buffer.from(work.bytes).indexOf(0x0a)).toString("utf8"),
  ) as Readonly<{
    engine: Readonly<{
      binary: Readonly<{ path: string }>;
      eval_file: Readonly<{ path: string }>;
      receipt: Readonly<{ path: string }>;
    }>;
  }>;
  const [selection, selectionManifest, terminalFault, engineBinary, engineEval, engineReceipt] =
    await Promise.all([
      read(
        path.join(SELECTION_ROOT, "hard-parents.jsonl"),
        SELECTION_ROOT,
        "v1r10 selection",
        7_268_777,
      ),
      read(
        path.join(SELECTION_ROOT, "hard-parents.manifest.json"),
        SELECTION_ROOT,
        "v1r10 selection manifest",
        3_234,
      ),
      read(
        path.join(RUN_ROOT, "teacher-terminal-fault.json"),
        RUN_ROOT,
        "v1r10 terminal fault",
        1_084,
      ),
      read(
        header.engine.binary.path,
        ASSET_ROOT,
        "v1r10 engine binary",
        700_048,
        false,
      ),
      read(
        header.engine.eval_file.path,
        ASSET_ROOT,
        "v1r10 engine eval",
        64_217_066,
        false,
      ),
      read(
        header.engine.receipt.path,
        REPOSITORY_ROOT,
        "v1r10 engine receipt",
        654,
        false,
      ),
    ]);
  const receipt = validateHalfkp81Depth18V1R10ImportableSet({
    plan,
    selection,
    selectionManifest,
    work,
    terminalFault,
    engineBinary,
    engineEval,
    engineReceipt,
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[halfkp81-depth18-v1r10-import-set] STOP: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
