#!/usr/bin/env -S npx tsx

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  parseV1R11CanonicalObject,
  pinV1R11AuthorityDirectory,
  readV1R11HeldFile,
  readV1R11HeldIdentity,
  v1r11CanonicalJson,
  v1r11Sha256,
  type V1R11AuthorityFileIdentity,
} from "./halfkp81-depth18-v1r11-authority-io";
import {
  HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_DEFAULT_PLAN_PATH,
  authenticateHalfkp81Depth18TeacherPlan,
  runHalfkp81Depth18V1R11FromModernVerifiedAuthority,
} from "./halfkp81-depth18-teacher-runner";
import {
  parseHalfkp81V1R11StageCAssertionsForTests,
  publishHalfkp81V1R11ModernLaunchEvidence,
} from "./halfkp81-depth18-v1r11-stage-c-live-evidence";
import { recomputeHalfkp81V1R11FormalRunForRuntimePlan } from "./run-halfkp81-depth18-v1r11-preformal-orchestrator";
import {
  reauthenticateHalfkp81V1R11ExistingStagedAuthorityForFormalChild,
  reauthenticateHalfkp81V1R11ExistingStagedAuthorityInScratchForTests,
  type Halfkp81V1R11All13LiveLaunchObserver,
} from "./verify-halfkp81-depth18-v1r11-staged-authority";
import {
  resolveHalfkp81V1R11ScratchNamespaceCapabilityForTests,
  type Halfkp81V1R11ScratchNamespaceCapabilityForTests,
} from "./verify-halfkp81-depth18-v1r11-stage-a";

const AUTHORITY_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority";
const PLIST_SCHEMA = "application/x-apple-aspen-config-exact-bytes";
const VERIFIED_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-verified-receipt-v1r11";
const LEDGER_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11";
const RAW_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-receipt-v1r11";
const GATE_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11";
const STAGE_A_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-engine-gate-authority-verified-receipt-v1r11";
const ENGINE_PATH =
  "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1/bin/yaneuraou";
const REQUIRED_GATES = Object.freeze([
  "ready-pr",
  "all-required-ci-success",
  "regular-merge",
  "clean-main-source-authentication",
  "preformal-authority-implementation-tests-pass",
  "artifact-verifier-implementation-tests-pass",
  "power-guardian-implementation-tests-pass",
  "candidate-order-gate",
  "known10-probe",
  "pathological-fallback-probe",
  "mixed-load-gate",
  "formal-like-512",
  "ac-power-start-admission-pass",
] as const);
const REQUIRED_ORDER = Object.freeze([...REQUIRED_GATES, "formal-teacher"]);

type JsonObject = Readonly<Record<string, unknown>>;

function object(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} differs`);
  }
  return value as JsonObject;
}

function exactKeys(value: JsonObject, expected: readonly string[], label: string) {
  if (
    v1r11CanonicalJson(Object.keys(value).sort()) !==
    v1r11CanonicalJson([...expected].sort())
  ) {
    throw new Error(`${label} keys differ`);
  }
}

function identity(
  value: unknown,
  expectedSchema: string,
  label: string,
): Readonly<V1R11AuthorityFileIdentity> {
  const row = object(value, label);
  exactKeys(row, ["path", "bytes", "sha256", "schema"], label);
  if (
    typeof row.path !== "string" ||
    !path.isAbsolute(row.path) ||
    path.normalize(row.path) !== row.path ||
    !Number.isSafeInteger(row.bytes) ||
    Number(row.bytes) < 1 ||
    typeof row.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(row.sha256) ||
    row.schema !== expectedSchema
  ) {
    throw new Error(`${label} differs`);
  }
  return row as unknown as Readonly<V1R11AuthorityFileIdentity>;
}

export interface Halfkp81V1R11ModernFormalAuthority {
  readonly verifiedReceipt: Readonly<V1R11AuthorityFileIdentity>;
  readonly ledger: Readonly<V1R11AuthorityFileIdentity>;
  readonly rawReceipt: Readonly<V1R11AuthorityFileIdentity>;
  readonly launchAgentEvidence: Readonly<V1R11AuthorityFileIdentity>;
  readonly plannedFinalDescriptor: Readonly<V1R11AuthorityFileIdentity>;
}

export async function validateHalfkp81V1R11ModernVerifiedReceiptForTests(
  request: Readonly<{
    receiptIdentity: Readonly<V1R11AuthorityFileIdentity>;
    receipt: JsonObject;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    launchAgentEvidence: Readonly<V1R11AuthorityFileIdentity>;
    plannedFinalDescriptor: Readonly<V1R11AuthorityFileIdentity>;
    holdIdentity: (
      identity: Readonly<V1R11AuthorityFileIdentity>,
    ) => Promise<void>;
  }>,
): Promise<Readonly<Halfkp81V1R11ModernFormalAuthority>> {
  exactKeys(
    request.receipt,
    [
      "schema",
      "status",
      "teacher_plan",
      "source_revision",
      "run_fingerprint",
      "required_order",
      "ledger",
      "raw_receipt",
      "gates",
      "launchagent_authority",
      "verifier",
      "authority",
    ],
    "modern all-13 verified receipt",
  );
  const ledger = identity(
    request.receipt.ledger,
    LEDGER_SCHEMA,
    "modern all-13 ledger",
  );
  const rawReceipt = identity(
    request.receipt.raw_receipt,
    RAW_RECEIPT_SCHEMA,
    "modern all-13 raw receipt",
  );
  const gates = object(request.receipt.gates, "modern all-13 gates");
  exactKeys(gates, REQUIRED_GATES, "modern all-13 gates");
  const gateIdentities = REQUIRED_GATES.map((gate) =>
    identity(gates[gate], GATE_RECEIPT_SCHEMA, `modern all-13 ${gate}`),
  );
  if (
    request.receipt.schema !== VERIFIED_SCHEMA ||
    request.receipt.status !==
      "all-required-preformal-gates-independently-verified-formal-only-authority" ||
    v1r11CanonicalJson(request.receipt.teacher_plan) !==
      v1r11CanonicalJson(request.teacherPlan) ||
    request.receipt.source_revision !== request.sourceRevision ||
    request.receipt.run_fingerprint !== request.runFingerprint ||
    v1r11CanonicalJson(request.receipt.required_order) !==
      v1r11CanonicalJson(REQUIRED_ORDER) ||
    v1r11CanonicalJson(request.receipt.launchagent_authority) !==
      v1r11CanonicalJson(request.launchAgentEvidence) ||
    v1r11CanonicalJson(request.receipt.authority) !==
      v1r11CanonicalJson({
        may_execute_formal_teacher: true,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      })
  ) {
    throw new Error("modern all-13 verified receipt binding differs");
  }
  await Promise.all([
    request.holdIdentity(request.receiptIdentity),
    request.holdIdentity(ledger),
    request.holdIdentity(rawReceipt),
    request.holdIdentity(request.launchAgentEvidence),
    request.holdIdentity(request.plannedFinalDescriptor),
    ...gateIdentities.map(request.holdIdentity),
  ]);
  return Object.freeze({
    verifiedReceipt: request.receiptIdentity,
    ledger,
    rawReceipt,
    launchAgentEvidence: request.launchAgentEvidence,
    plannedFinalDescriptor: request.plannedFinalDescriptor,
  });
}

export interface Halfkp81V1R11FormalChildWaitBoundary {
  readonly readVerifiedReceipt: () => Promise<
    | Readonly<{
        identity: Readonly<V1R11AuthorityFileIdentity>;
        value: JsonObject;
      }>
    | null
  >;
  readonly terminalFaultExists: () => Promise<boolean>;
  readonly assertEngineZero: () => Promise<void>;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly now: () => number;
}

export interface Halfkp81V1R11FormalChildBarrierDependenciesForTests {
  readonly waitBoundary: Readonly<Halfkp81V1R11FormalChildWaitBoundary>;
  readonly assertEngineZero: () => Promise<void>;
  readonly recomputeFormalRun: typeof recomputeHalfkp81V1R11FormalRunForRuntimePlan;
  readonly reauthenticateExistingAuthority: typeof reauthenticateHalfkp81V1R11ExistingStagedAuthorityForFormalChild;
  readonly consumeFormalCapability: typeof runHalfkp81Depth18V1R11FromModernVerifiedAuthority;
}

export interface Halfkp81V1R11FormalChildBarrierRequestForTests {
  readonly repositoryRoot: string;
  readonly teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
  readonly sourceRevision: string;
  readonly authorityDirectory: Awaited<
    ReturnType<typeof pinV1R11AuthorityDirectory>
  >;
  readonly gateDirectory: Awaited<
    ReturnType<typeof pinV1R11AuthorityDirectory>
  >;
  readonly stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
  readonly launchAgentEvidence: Readonly<V1R11AuthorityFileIdentity>;
  readonly plannedFinalDescriptor: Readonly<V1R11AuthorityFileIdentity>;
  readonly initialFormalRun: Awaited<
    ReturnType<typeof recomputeHalfkp81V1R11FormalRunForRuntimePlan>
  >;
  readonly timeoutMs: number;
  readonly holdIdentity: (
    identity: Readonly<V1R11AuthorityFileIdentity>,
  ) => Promise<void>;
}

export async function waitHalfkp81V1R11ModernVerifiedReceiptForTests(
  request: Readonly<{
    timeoutMs: number;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    launchAgentEvidence: Readonly<V1R11AuthorityFileIdentity>;
    plannedFinalDescriptor: Readonly<V1R11AuthorityFileIdentity>;
    holdIdentity: (
      identity: Readonly<V1R11AuthorityFileIdentity>,
    ) => Promise<void>;
  }>,
  boundary: Readonly<Halfkp81V1R11FormalChildWaitBoundary>,
): Promise<Readonly<Halfkp81V1R11ModernFormalAuthority>> {
  if (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs < 1) {
    throw new Error("modern formal child timeout differs");
  }
  const deadline = boundary.now() + request.timeoutMs;
  for (;;) {
    await boundary.assertEngineZero();
    if (await boundary.terminalFaultExists()) {
      throw new Error("preformal terminal fault closed the family before admission");
    }
    const candidate = await boundary.readVerifiedReceipt();
    if (candidate !== null) {
      return validateHalfkp81V1R11ModernVerifiedReceiptForTests({
        ...request,
        receiptIdentity: candidate.identity,
        receipt: candidate.value,
      });
    }
    if (boundary.now() >= deadline) {
      throw new Error("bounded all-13 verified receipt wait timed out at engine zero");
    }
    await boundary.sleep(250);
  }
}

/**
 * Exact post-publication formal-child barrier used by the public child.
 * Tests may replace only observation/authentication and the terminal formal
 * capability consumer. The receipt validator, fresh-intent equality check,
 * engine-zero ordering and capability handoff remain this production logic.
 */
export async function runHalfkp81V1R11FormalChildBarrierForTests(
  request: Readonly<Halfkp81V1R11FormalChildBarrierRequestForTests>,
  dependencies: Readonly<Halfkp81V1R11FormalChildBarrierDependenciesForTests>,
): Promise<void> {
  const modernAuthority =
    await waitHalfkp81V1R11ModernVerifiedReceiptForTests(
      {
        timeoutMs: request.timeoutMs,
        teacherPlan: request.teacherPlan,
        sourceRevision: request.sourceRevision,
        runFingerprint: request.initialFormalRun.fingerprint,
        launchAgentEvidence: request.launchAgentEvidence,
        plannedFinalDescriptor: request.plannedFinalDescriptor,
        holdIdentity: request.holdIdentity,
      },
      dependencies.waitBoundary,
    );
  await dependencies.assertEngineZero();
  const freshFormalRun = await dependencies.recomputeFormalRun(
    request.repositoryRoot,
    request.teacherPlan,
    request.sourceRevision,
    request.plannedFinalDescriptor,
  );
  if (
    freshFormalRun.fingerprint !== request.initialFormalRun.fingerprint ||
    v1r11CanonicalJson(freshFormalRun.input) !==
      v1r11CanonicalJson(request.initialFormalRun.input)
  ) {
    throw new Error("formal child fresh formal intent differs before capability");
  }
  await dependencies.reauthenticateExistingAuthority({
    repositoryRoot: request.repositoryRoot,
    teacherPlan: request.teacherPlan,
    sourceRevision: request.sourceRevision,
    runFingerprint: freshFormalRun.fingerprint,
    authorityDirectory: request.authorityDirectory,
    gateDirectory: request.gateDirectory,
    stageAReceipt: request.stageAReceipt,
    ledger: modernAuthority.ledger,
    rawReceipt: modernAuthority.rawReceipt,
    launchAgentAuthority: request.launchAgentEvidence,
    verifiedReceipt: modernAuthority.verifiedReceipt,
    formalRunIntent: freshFormalRun.input,
  });
  await dependencies.assertEngineZero();
  await dependencies.consumeFormalCapability({
    repositoryRoot: request.repositoryRoot,
    teacherPlan: request.teacherPlan,
    sourceRevision: request.sourceRevision,
    runFingerprint: freshFormalRun.fingerprint,
    authorityDirectory: request.authorityDirectory,
    gateDirectory: request.gateDirectory,
    stageAReceipt: request.stageAReceipt,
    preformalLedger: modernAuthority.ledger,
    preformalRawReceipt: modernAuthority.rawReceipt,
    launchAgentEvidence: request.launchAgentEvidence,
    verifiedPreformalAuthority: modernAuthority.verifiedReceipt,
    plannedFinalDescriptor: request.plannedFinalDescriptor,
    formalRunIntent: freshFormalRun.input,
  });
}

export interface Halfkp81V1R11ScratchFormalChildBarrierDependenciesForTests
  extends Omit<
    Halfkp81V1R11FormalChildBarrierDependenciesForTests,
    "reauthenticateExistingAuthority"
  > {
  readonly liveLaunchObserver: Readonly<Halfkp81V1R11All13LiveLaunchObserver>;
}

/**
 * Scratch public-child seam. Receipt waiting, fresh intent and the complete
 * all-13 reauthentication are real; only OS observation and the terminal
 * formal capability edge remain injectable so tests cannot launch an engine.
 */
export async function runHalfkp81V1R11FormalChildBarrierInScratchForTests(
  capability: Readonly<Halfkp81V1R11ScratchNamespaceCapabilityForTests>,
  request: Readonly<Halfkp81V1R11FormalChildBarrierRequestForTests>,
  dependencies: Readonly<
    Halfkp81V1R11ScratchFormalChildBarrierDependenciesForTests
  >,
): Promise<void> {
  resolveHalfkp81V1R11ScratchNamespaceCapabilityForTests(capability);
  return runHalfkp81V1R11FormalChildBarrierForTests(request, {
    waitBoundary: dependencies.waitBoundary,
    assertEngineZero: dependencies.assertEngineZero,
    recomputeFormalRun: dependencies.recomputeFormalRun,
    consumeFormalCapability: dependencies.consumeFormalCapability,
    reauthenticateExistingAuthority: (authorityRequest) =>
      reauthenticateHalfkp81V1R11ExistingStagedAuthorityInScratchForTests(
        capability,
        authorityRequest,
        dependencies.liveLaunchObserver,
      ),
  });
}

async function productionEngineZero(): Promise<void> {
  const result = spawnSync(
    "/bin/ps",
    ["-ww", "-axo", "pid=,ppid=,pgid=,lstart=,command="],
    { encoding: null, stdio: ["ignore", "pipe", "pipe"] },
  );
  if (
    result.error !== undefined ||
    result.signal !== null ||
    result.status !== 0 ||
    !Buffer.isBuffer(result.stdout) ||
    !Buffer.isBuffer(result.stderr) ||
    result.stderr.byteLength !== 0 ||
    result.stdout
      .toString("utf8")
      .split("\n")
      .some((line) => line.includes(ENGINE_PATH))
  ) {
    throw new Error("modern formal child engine-zero barrier differs");
  }
}

export function validateHalfkp81V1R11FormalChildAssertionHolderReadyForTests(
  psRaw: Buffer,
  pmsetRaw: Buffer,
  context: Readonly<{
    runnerPid: number;
    holderPid: number;
    nodePath: string;
    expectedRunnerArgvForTests?: string;
  }>,
): void {
  if (
    !Number.isSafeInteger(context.runnerPid) ||
    context.runnerPid < 1 ||
    !Number.isSafeInteger(context.holderPid) ||
    context.holderPid < 1 ||
    context.holderPid === context.runnerPid ||
    !path.isAbsolute(context.nodePath) ||
    (context.expectedRunnerArgvForTests !== undefined &&
      context.expectedRunnerArgvForTests.length < 1)
  ) {
    throw new Error("formal child assertion holder context differs");
  }
  const text = psRaw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(psRaw)) {
    throw new Error("formal child assertion holder ps encoding differs");
  }
  const rows = text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const match =
        /^\s*(\d+)\s+(\d+)\s+(\d+)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4})\s+(.+)$/u.exec(
          line,
        );
      if (match === null) {
        throw new Error("formal child assertion holder ps row differs");
      }
      return Object.freeze({
        pid: Number(match[1]),
        ppid: Number(match[2]),
        pgid: Number(match[3]),
        executable: /^(\S+)(?:\s|$)/u.exec(match[5]!)?.[1] ?? "",
        argv: match[5]!,
      });
    });
  const runners = rows.filter((row) => row.pid === context.runnerPid);
  const holders = rows.filter((row) => row.pid === context.holderPid);
  const group = rows.filter((row) => row.pgid === context.runnerPid);
  const runnerArgv =
    context.expectedRunnerArgvForTests ??
    [
      context.nodePath,
      "-r",
      path.join(path.resolve(__dirname, ".."), "node_modules/tsx/dist/cjs/index.cjs"),
      path.join(
        path.resolve(__dirname, ".."),
        "ml/run-halfkp81-depth18-v1r11-formal-child.ts",
      ),
    ].join(" ");
  const holderArgv = [
    "/usr/bin/caffeinate",
    "-dimsu",
    "-w",
    String(context.runnerPid),
  ].join(" ");
  if (
    runners.length !== 1 ||
    holders.length !== 1 ||
    runners[0]!.pgid !== context.runnerPid ||
    runners[0]!.executable !== context.nodePath ||
    runners[0]!.argv !== runnerArgv ||
    holders[0]!.ppid !== context.runnerPid ||
    holders[0]!.pgid !== context.runnerPid ||
    holders[0]!.executable !== "/usr/bin/caffeinate" ||
    holders[0]!.argv !== holderArgv ||
    group.length !== 2 ||
    rows.some((row) =>
      row.executable === ENGINE_PATH ||
      row.argv === ENGINE_PATH ||
      row.argv.startsWith(`${ENGINE_PATH} `),
    )
  ) {
    throw new Error("formal child assertion holder topology differs");
  }
  parseHalfkp81V1R11StageCAssertionsForTests(
    pmsetRaw.toString("utf8"),
    context.holderPid,
  );
}

async function stopFailedAssertionHolder(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  await Promise.race([
    exited,
    new Promise<never>((_resolve, reject) =>
      setTimeout(
        () => reject(new Error("formal child assertion holder did not reap")),
        5_000,
      ),
    ),
  ]);
}

async function waitForProductionAssertionHolderReady(
  child: ChildProcess,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  let last: unknown = new Error("formal child assertion holder was not observed");
  for (;;) {
    try {
      const ps = spawnSync(
        "/bin/ps",
        ["-ww", "-axo", "pid=,ppid=,pgid=,lstart=,command="],
        { encoding: null, stdio: ["ignore", "pipe", "pipe"] },
      );
      const pmset = spawnSync("/usr/bin/pmset", ["-g", "assertions"], {
        encoding: null,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (
        ps.status !== 0 ||
        ps.signal !== null ||
        ps.error !== undefined ||
        pmset.status !== 0 ||
        pmset.signal !== null ||
        pmset.error !== undefined ||
        !Buffer.isBuffer(ps.stdout) ||
        !Buffer.isBuffer(ps.stderr) ||
        ps.stderr.byteLength !== 0 ||
        !Buffer.isBuffer(pmset.stdout) ||
        !Buffer.isBuffer(pmset.stderr) ||
        pmset.stderr.byteLength !== 0
      ) {
        throw new Error("formal child assertion holder readiness command differs");
      }
      validateHalfkp81V1R11FormalChildAssertionHolderReadyForTests(
        ps.stdout,
        pmset.stdout,
        {
          runnerPid: process.pid,
          holderPid: Number(child.pid),
          nodePath: fs.realpathSync.native(process.execPath),
        },
      );
      child.unref();
      return;
    } catch (error) {
      last = error;
    }
    if (
      child.exitCode !== null ||
      child.signalCode !== null ||
      Date.now() >= deadline
    ) {
      await stopFailedAssertionHolder(child);
      throw new Error(
        `formal child assertion holder readiness failed: ${
          last instanceof Error ? last.message : String(last)
        }`,
      );
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
}

async function startProductionAssertionHolder(): Promise<ChildProcess> {
  const child = spawn(
    "/usr/bin/caffeinate",
    ["-dimsu", "-w", String(process.pid)],
    { stdio: "ignore" },
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("formal child assertion holder spawn timed out"));
    }, 5_000);
    const cleanup = () => {
      clearTimeout(timer);
      child.off("spawn", onSpawn);
      child.off("error", onError);
    };
    const onSpawn = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
  });
  if (!Number.isSafeInteger(child.pid) || Number(child.pid) < 1) {
    throw new Error("formal child assertion holder PID differs");
  }
  await waitForProductionAssertionHolderReady(child);
  return child;
}

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    throw new Error("formal child accepts no caller-authored arguments");
  }
  const repositoryRoot = path.resolve(__dirname, "..");
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_DEFAULT_PLAN_PATH,
  );
  if (
    authenticated.planIdentity.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_TEACHER_PLAN_SCHEMA_V1R11
  ) {
    throw new Error("formal child runtime plan differs");
  }
  const authorityDirectory = await pinV1R11AuthorityDirectory(
    AUTHORITY_DIRECTORY,
  );
  const plannedPath = path.join(AUTHORITY_DIRECTORY, "launchagent.plist.snapshot");
  const plannedRaw = await readV1R11HeldFile(
    plannedPath,
    "formal child planned plist",
  );
  const plannedFinalDescriptor = Object.freeze({
    path: plannedPath,
    bytes: plannedRaw.byteLength,
    sha256: v1r11Sha256(plannedRaw),
    schema: PLIST_SCHEMA,
  });
  const formalRun = await recomputeHalfkp81V1R11FormalRunForRuntimePlan(
    repositoryRoot,
    authenticated.planIdentity,
    authenticated.sourceRevision,
    plannedFinalDescriptor,
  );
  const assertionHolder = await startProductionAssertionHolder();
  void assertionHolder;
  const launchAgentEvidence =
    await publishHalfkp81V1R11ModernLaunchEvidence({
      repositoryRoot,
      authorityDirectory,
      teacherPlan: authenticated.planIdentity,
      sourceRevision: authenticated.sourceRevision,
      runFingerprint: formalRun.fingerprint,
      formalRunIntent: formalRun.input,
      plannedPlist: plannedFinalDescriptor,
    });
  const verifiedPath = path.join(
    AUTHORITY_DIRECTORY,
    "preformal-authority-verified-receipt.json",
  );
  const terminalFaultPath = path.join(
    AUTHORITY_DIRECTORY,
    "preformal-terminal-fault.json",
  );
  const waitBoundary = Object.freeze({
      readVerifiedReceipt: async () => {
        try {
          const raw = await readV1R11HeldFile(
            verifiedPath,
            "formal child verified receipt",
          );
          return Object.freeze({
            identity: Object.freeze({
              path: verifiedPath,
              bytes: raw.byteLength,
              sha256: v1r11Sha256(raw),
              schema: VERIFIED_SCHEMA,
            }),
            value: parseV1R11CanonicalObject(
              raw,
              "formal child verified receipt",
            ),
          });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        }
      },
      terminalFaultExists: async () => {
        try {
          await fs.promises.lstat(terminalFaultPath);
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
          throw error;
        }
      },
      assertEngineZero: productionEngineZero,
      sleep: (milliseconds) =>
        new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
      now: Date.now,
  });
  const gateDirectory = await pinV1R11AuthorityDirectory(
    path.join(AUTHORITY_DIRECTORY, "preformal-gates"),
  );
  const stageAPath = path.join(
    AUTHORITY_DIRECTORY,
    "preformal-engine-gate-authority-verified-receipt.json",
  );
  const stageARaw = await readV1R11HeldFile(
    stageAPath,
    "formal child Stage A receipt",
  );
  const stageAReceipt = Object.freeze({
    path: stageAPath,
    bytes: stageARaw.byteLength,
    sha256: v1r11Sha256(stageARaw),
    schema: STAGE_A_RECEIPT_SCHEMA,
  });
  await runHalfkp81V1R11FormalChildBarrierForTests({
    repositoryRoot,
    teacherPlan: authenticated.planIdentity,
    sourceRevision: authenticated.sourceRevision,
    authorityDirectory,
    gateDirectory,
    stageAReceipt,
    launchAgentEvidence,
    plannedFinalDescriptor,
    initialFormalRun: formalRun,
    timeoutMs: 12 * 60 * 60 * 1_000,
    holdIdentity: async (entry) => {
      await readV1R11HeldIdentity(
        entry,
        entry.schema,
        "formal child authority chain",
      );
    },
  }, {
    waitBoundary,
    assertEngineZero: productionEngineZero,
    recomputeFormalRun: recomputeHalfkp81V1R11FormalRunForRuntimePlan,
    reauthenticateExistingAuthority:
      reauthenticateHalfkp81V1R11ExistingStagedAuthorityForFormalChild,
    consumeFormalCapability:
      runHalfkp81Depth18V1R11FromModernVerifiedAuthority,
  });
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `[halfkp81-v1r11-formal-child] STOP: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  });
}
