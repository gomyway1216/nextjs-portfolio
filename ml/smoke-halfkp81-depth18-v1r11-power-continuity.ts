#!/usr/bin/env -S node -r tsx/cjs

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  startHalfkp81Depth18V1R11PowerContinuitySession,
  verifyHalfkp81Depth18PowerContinuityLedgerForTests,
  type Halfkp81Depth18PowerContinuityLedgerEntry,
} from "./halfkp81-depth18-teacher-runner";

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("power smoke cannot canonicalize this value");
}

async function main(): Promise<void> {
  const launchdSmoke =
    process.argv.length === 2 &&
    /^com\.meetyudai\.shogi\.v1r11-power-smoke-/u.test(
      process.env.XPC_SERVICE_NAME ?? "",
    );
  if (process.argv.length !== 3 && !launchdSmoke) {
    throw new Error("v1r11 power smoke requires one absent scratch directory");
  }
  const root = path.resolve(launchdSmoke ? process.cwd() : process.argv[2]!);
  const planBytes = Buffer.from("v1r11-power-smoke-plan\n", "utf8");
  try {
    await fs.promises.mkdir(root, { recursive: false, mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const entries = await fs.promises.readdir(root);
    if (
      entries.length !== 1 ||
      entries[0] !== "teacher-plan.json" ||
      !(await fs.promises.readFile(path.join(root, entries[0]))).equals(
        planBytes,
      )
    ) {
      throw new Error(
        "existing smoke namespace is not its sealed plan-only state",
      );
    }
  }
  const session = await startHalfkp81Depth18V1R11PowerContinuitySession({
    teacherPlan: Object.freeze({
      path: path.join(root, "teacher-plan.json"),
      bytes: planBytes.byteLength,
      sha256: crypto.createHash("sha256").update(planBytes).digest("hex"),
      schema: "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11",
    }),
    runFingerprint: "5".repeat(64),
    ledgerPath: path.join(root, "power-continuity.jsonl"),
    receiptPath: path.join(root, "power-continuity-receipt.json"),
  });
  const started = Date.now();
  session.engineStarted(started);
  session.engineReaped(Date.now());
  await session.assertHealthy(true);
  const identities = await session.finalizeSuccess();
  await session.close();
  const ledgerText = await fs.promises.readFile(identities.ledger.path, "utf8");
  const entries = ledgerText
    .trimEnd()
    .split("\n")
    .map(
      (line) =>
        JSON.parse(line) as Readonly<Halfkp81Depth18PowerContinuityLedgerEntry>,
    );
  const verification =
    verifyHalfkp81Depth18PowerContinuityLedgerForTests(entries);
  const receipt = JSON.parse(
    await fs.promises.readFile(identities.receipt.path, "utf8"),
  ) as Record<string, unknown>;
  if (canonicalJson(receipt.verification) !== canonicalJson(verification)) {
    throw new Error("real Mac smoke receipt verification differs");
  }
  const binding = receipt.binding as Record<string, unknown>;
  const result = {
    status: "real-mac-v1r11-power-smoke-pass",
    runner_pid: process.pid,
    guardian_pid: binding.guardian_pid,
    caffeinate_assertion_holder_pid: binding.caffeinate_assertion_holder_pid,
    ledger: identities.ledger,
    receipt: identities.receipt,
    verification,
  };
  await fs.promises.writeFile(
    path.join(root, "smoke-result.json"),
    `${canonicalJson(result)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[halfkp81-depth18-v1r11-power-smoke] STOP: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
