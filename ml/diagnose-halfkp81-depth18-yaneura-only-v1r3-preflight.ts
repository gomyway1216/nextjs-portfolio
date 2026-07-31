#!/usr/bin/env npx tsx

import * as fs from "node:fs";

import { diagnoseHalfkp81Depth18YaneuraOnlyV1R3PreflightCoreForTests } from "./halfkp81-depth18-teacher-runner";

const WORK =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-depth18-yaneura-only-v1r3-preflight/teacher-work.jsonl";
const SELECTION =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-strength-v1/hard-parents.jsonl";

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error("the read-only v1r3 diagnostic accepts no arguments");
  }
  const [workRaw, selectionRaw] = await Promise.all([
    fs.promises.readFile(WORK),
    fs.promises.readFile(SELECTION),
  ]);
  const result = diagnoseHalfkp81Depth18YaneuraOnlyV1R3PreflightCoreForTests(
    workRaw,
    selectionRaw,
  );
  process.stdout.write(
    `${JSON.stringify({
      schema:
        "shogi-halfkp81-hard-depth18-yaneura-only-v1r3-read-only-diagnostic-v1",
      status: "diagnostic-only-no-receipt-no-authority",
      ...result,
      authority: {
        may_reuse_rows: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[halfkp81-depth18-yaneura-only-v1r3-diagnostic] STOP: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
