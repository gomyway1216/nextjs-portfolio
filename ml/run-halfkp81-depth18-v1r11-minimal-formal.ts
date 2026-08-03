#!/usr/bin/env -S node -r tsx/cjs

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  readHalfkp81Depth18PrivateArtifact,
  validateHalfkp81Depth18V1R10PrefixOneTeacherSmoke,
} from "./halfkp81-depth18-teacher-artifact-validation";
import {
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_AUTHORITY_DIRECTORY,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_DEFAULT_PLAN_PATH,
  publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R11,
  runHalfkp81Depth18V1R11MinimalFormalFromFixedGate,
  verifyHalfkp81Depth18PowerContinuityLedgerForTests,
  type Halfkp81Depth18PowerContinuityLedgerEntry,
} from "./halfkp81-depth18-teacher-runner";
import { createV1R11AuthorityDirectory } from "./halfkp81-depth18-v1r11-authority-io";
import {
  bootstrapHalfkp81V1R11PlannedLaunchAgent,
  prepareHalfkp81V1R11PlannedLaunchAgentForTests,
} from "./prepare-halfkp81-depth18-v1r11-planned-launchagent";

type FixedEvidenceName =
  | "import-receipt"
  | "source-verifier-receipt"
  | "smoke-receipt"
  | "power-ledger"
  | "power-receipt"
  | "power-result";

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const SOURCE_ROOT =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r10";
const SELECTION_ROOT =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-strength-v1";
const ASSET_ROOT =
  "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1";
const IMPORT_ROOT = "/private/tmp/v1r11-import-scratch.2bRuAT";
const SMOKE_ROOT = "/private/tmp/v1r11-prefix1-v1r9-smoke.xOenkB";
const POWER_ROOT = "/private/tmp/v1r11-power-smoke-final4-05b81a1e";

const FIXED = Object.freeze({
  "import-receipt": Object.freeze({
    path: path.join(IMPORT_ROOT, "authority/v1r10-import-receipt.json"),
    bytes: 3_532,
    sha256: "575edc92fd7438c8f26a2ed3270d79dd28ca2076304184463eb308d52bed7a98",
  }),
  "source-verifier-receipt": Object.freeze({
    path: path.join(
      IMPORT_ROOT,
      "authority/v1r10-import-source-verification-receipt.json",
    ),
    bytes: 2_497,
    sha256: "094067c4586920782065ef62e981b7bd128a4691f0389c64d20ede8e21450939",
  }),
  "smoke-receipt": Object.freeze({
    path: path.join(SMOKE_ROOT, "teacher-receipt.json"),
    bytes: 1_831,
    sha256: "c4090f40cf611dffa438ba560c7b70fa0cea16e530280a15677648797eda5883",
  }),
  "power-ledger": Object.freeze({
    path: path.join(POWER_ROOT, "power-continuity.jsonl"),
    bytes: 6_838,
    sha256: "6080244f2920c59d3de6ceab483249593a00f1bb9ee6ca71728b1e46cb081fd0",
  }),
  "power-receipt": Object.freeze({
    path: path.join(POWER_ROOT, "power-continuity-receipt.json"),
    bytes: 1_868,
    sha256: "3564c9041c1021b33b0a16aed69428ba358c6b7d2e844b631d2ac649aa6ca102",
  }),
  "power-result": Object.freeze({
    path: path.join(POWER_ROOT, "smoke-result.json"),
    bytes: 630,
    sha256: "4ec8befceb9224ea1904188e1dad4623b4487dfb1726f38afbed28de6d6aad65",
  }),
});

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("minimal formal evidence is not canonicalizable");
}

function readExact(file: string): Buffer {
  const before = fs.lstatSync(file);
  const descriptor = fs.openSync(
    file,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  const held = fs.fstatSync(descriptor);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    fs.realpathSync.native(file) !== file ||
    before.dev !== held.dev ||
    before.ino !== held.ino
  ) {
    fs.closeSync(descriptor);
    throw new Error(
      `minimal formal evidence is not one held real file: ${file}`,
    );
  }
  const readHeld = (): Buffer => {
    const raw = Buffer.alloc(held.size);
    let offset = 0;
    while (offset < raw.length) {
      const count = fs.readSync(
        descriptor,
        raw,
        offset,
        raw.length - offset,
        offset,
      );
      if (count < 1)
        throw new Error(`minimal formal evidence read stalled: ${file}`);
      offset += count;
    }
    return raw;
  };
  try {
    const first = readHeld();
    const second = readHeld();
    const after = fs.lstatSync(file);
    const finalHeld = fs.fstatSync(descriptor);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      held.size !== finalHeld.size ||
      held.mtimeMs !== finalHeld.mtimeMs ||
      !first.equals(second)
    ) {
      throw new Error(`minimal formal evidence changed while held: ${file}`);
    }
    return first;
  } finally {
    fs.closeSync(descriptor);
  }
}

export function verifyHalfkp81Depth18V1R11FixedEvidenceBytesForTests(
  name: FixedEvidenceName,
  raw: Uint8Array,
): Readonly<Record<string, unknown>> {
  const expected = FIXED[name];
  const bytes = Buffer.from(raw);
  if (!verifyHalfkp81Depth18V1R11ReceiptIdentityForTests(bytes, expected)) {
    throw new Error(`fixed ${name} receipt identity differs`);
  }
  if (name === "power-ledger")
    return Object.freeze({ status: "identity-pass" });
  const value = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
  const semanticPass =
    (name === "import-receipt" &&
      value.schema === "shogi-halfkp81-depth18-v1r11-v1r10-import-receipt-v1" &&
      value.status === "new-family-create-only-exact-set-imported") ||
    (name === "source-verifier-receipt" &&
      value.schema ===
        "shogi-halfkp81-depth18-v1r10-importable-set-verification-v1" &&
      value.status ===
        "source-set-independently-verified-import-eligible-new-family-only") ||
    (name === "smoke-receipt" &&
      value.schema === "shogi-halfkp81-hard-depth18-teacher-receipt-v1" &&
      value.completed_parents === 1 &&
      value.completed_rows === 12 &&
      value.technical_faults === 0) ||
    (name === "power-receipt" &&
      value.schema ===
        "shogi-halfkp81-depth18-power-continuity-receipt-v1r11" &&
      value.status === "power-continuity-pass") ||
    (name === "power-result" &&
      value.status === "real-mac-v1r11-power-smoke-pass");
  if (!semanticPass) throw new Error(`fixed ${name} receipt semantics differ`);
  return Object.freeze(value);
}

export function verifyHalfkp81Depth18V1R11ReceiptIdentityForTests(
  raw: Uint8Array,
  expected: Readonly<{ bytes: number; sha256: string }>,
): boolean {
  const bytes = Buffer.from(raw);
  return (
    bytes.byteLength === expected.bytes && sha256(bytes) === expected.sha256
  );
}

async function privateSnapshot(
  file: string,
  root: string,
  label: string,
  maximumBytes: number,
  privateMode = true,
) {
  return readHalfkp81Depth18PrivateArtifact(
    file,
    root,
    process.getuid?.() ?? -1,
    label,
    maximumBytes,
    privateMode,
  );
}

async function verifySmokeArtifact(): Promise<
  Readonly<Record<string, unknown>>
> {
  const work = readExact(path.join(SMOKE_ROOT, "teacher-work.jsonl"));
  if (
    work.byteLength !== 27_519 ||
    sha256(work) !==
      "e791c839b1139bcd9769a05403878621bc98321c738c330a4c1d366cf4b94e85"
  ) {
    throw new Error("fixed index-zero smoke work identity differs");
  }
  const sourceWork = readExact(path.join(SOURCE_ROOT, "teacher-work.jsonl"));
  const header = JSON.parse(
    sourceWork.subarray(0, sourceWork.indexOf(0x0a)).toString("utf8"),
  ) as {
    engine: {
      binary: { path: string };
      eval_file: { path: string };
      receipt: { path: string };
    };
  };
  const [
    plan,
    selection,
    selectionManifest,
    engineBinary,
    engineEval,
    engineReceipt,
    smokeWork,
  ] = await Promise.all([
    privateSnapshot(
      path.join(SOURCE_ROOT, "teacher-plan.json"),
      SOURCE_ROOT,
      "minimal smoke plan",
      16_859,
    ),
    privateSnapshot(
      path.join(SELECTION_ROOT, "hard-parents.jsonl"),
      SELECTION_ROOT,
      "minimal smoke selection",
      7_268_777,
    ),
    privateSnapshot(
      path.join(SELECTION_ROOT, "hard-parents.manifest.json"),
      SELECTION_ROOT,
      "minimal smoke manifest",
      3_234,
    ),
    privateSnapshot(
      header.engine.binary.path,
      ASSET_ROOT,
      "minimal smoke engine",
      700_048,
      false,
    ),
    privateSnapshot(
      header.engine.eval_file.path,
      ASSET_ROOT,
      "minimal smoke eval",
      64_217_066,
      false,
    ),
    privateSnapshot(
      header.engine.receipt.path,
      REPOSITORY_ROOT,
      "minimal smoke engine receipt",
      654,
      false,
    ),
    privateSnapshot(
      path.join(SMOKE_ROOT, "teacher-work.jsonl"),
      SMOKE_ROOT,
      "minimal smoke work",
      27_519,
    ),
  ]);
  return validateHalfkp81Depth18V1R10PrefixOneTeacherSmoke({
    plan,
    selection,
    selectionManifest,
    engineBinary,
    engineEval,
    engineReceipt,
    smokeWork,
  });
}

export async function verifyHalfkp81Depth18V1R11MinimalFormalFixedGate(): Promise<
  Readonly<Record<string, unknown>>
> {
  const evidence = Object.fromEntries(
    (Object.keys(FIXED) as FixedEvidenceName[]).map((name) => [
      name,
      verifyHalfkp81Depth18V1R11FixedEvidenceBytesForTests(
        name,
        readExact(FIXED[name].path),
      ),
    ]),
  );
  const smoke = await verifySmokeArtifact();
  if (smoke.status !== "actual-production-teacher-core-scratch-smoke-verified")
    throw new Error("independent index-zero artifact verifier did not pass");
  const ledgerEntries = readExact(FIXED["power-ledger"].path)
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .map(
      (line) => JSON.parse(line) as Halfkp81Depth18PowerContinuityLedgerEntry,
    );
  const powerVerification =
    verifyHalfkp81Depth18PowerContinuityLedgerForTests(ledgerEntries);
  const powerReceipt = evidence["power-receipt"] as Record<string, unknown>;
  const powerResult = evidence["power-result"] as Record<string, unknown>;
  if (
    canonical(powerReceipt.ledger) !==
      canonical({ ...FIXED["power-ledger"] }) ||
    canonical(powerReceipt.verification) !== canonical(powerVerification) ||
    canonical(powerResult.verification) !== canonical(powerVerification)
  ) {
    throw new Error(
      "fixed power receipt/result does not bind the independently verified ledger",
    );
  }
  const processes = execFileSync("/bin/ps", ["-ww", "-axo", "command="], {
    encoding: "utf8",
  });
  if (
    /\/shogi-data\/floodgate-teacher-assets-v1\/bin\/yaneuraou(?:\s|$)|halfkp81-depth18-(?:teacher-runtime|power-continuity-guardian)/u.test(
      processes,
    )
  )
    throw new Error(
      "minimal formal requires engine/process zero before launch",
    );
  const battery = execFileSync("/usr/bin/pmset", ["-g", "batt"], {
    encoding: "utf8",
  });
  const percentage = Number(/\b(\d{1,3})%;/u.exec(battery)?.[1]);
  if (
    !battery.includes("Now drawing from 'AC Power'") ||
    !Number.isFinite(percentage) ||
    percentage < 80
  ) {
    throw new Error(
      "minimal formal requires current AC power and battery at least 80 percent",
    );
  }
  return Object.freeze({
    status: "minimal-formal-fixed-gate-pass",
    smoke,
    power_verification: powerVerification,
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  child.kill("SIGTERM");
  await Promise.race([
    exited,
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null)
    child.kill("SIGKILL");
}

async function main(): Promise<void> {
  if (process.argv.length !== 2)
    throw new Error("the minimal formal entrypoint accepts no arguments");
  const launched =
    /^com\.meetyudai\.shogi\.halfkp81-depth18-yaneura-only-v1r11-[0-9a-f]{8}$/u.test(
      process.env.XPC_SERVICE_NAME ?? "",
    );
  if (!launched) {
    if (!fs.existsSync(HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_DEFAULT_PLAN_PATH)) {
      await publishHalfkp81Depth18YaneuraOnlyTeacherPlanV1R11();
    }
    const sourceRevision = execFileSync(
      "/usr/bin/git",
      ["-C", REPOSITORY_ROOT, "rev-parse", "HEAD"],
      { encoding: "utf8" },
    ).trim();
    const authorityDirectory = await createV1R11AuthorityDirectory(
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_AUTHORITY_DIRECTORY,
    );
    const descriptor = await prepareHalfkp81V1R11PlannedLaunchAgentForTests({
      authorityDirectory,
      repositoryRoot: REPOSITORY_ROOT,
      homeDirectory: process.env.HOME ?? "/Users/yudaiyaguchi",
      nodePath: process.execPath,
      sourceRevision,
      entrypointPath: path.join(
        REPOSITORY_ROOT,
        "ml/run-halfkp81-depth18-v1r11-minimal-formal.ts",
      ),
    });
    await bootstrapHalfkp81V1R11PlannedLaunchAgent(descriptor);
    process.stdout.write(
      `${JSON.stringify({ status: "minimal-formal-one-shot-launchagent-bootstrapped", label: descriptor.label, stdout: descriptor.stdoutPath, stderr: descriptor.stderrPath })}\n`,
    );
    return;
  }
  const holder = spawn(
    "/usr/bin/caffeinate",
    ["-dimsu", "-w", String(process.pid)],
    { stdio: "ignore" },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      holder.once("spawn", resolve);
      holder.once("error", reject);
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    const result = await runHalfkp81Depth18V1R11MinimalFormalFromFixedGate();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await stopChild(holder);
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `[halfkp81-depth18-v1r11-minimal-formal] STOP: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
