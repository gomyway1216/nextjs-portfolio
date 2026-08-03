import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  assertV1R11AuthorityDirectory,
  createV1R11AuthorityDirectory,
  parseV1R11CanonicalObject,
  readV1R11HeldFile,
  readV1R11HeldIdentity,
  v1r11CanonicalJson,
  v1r11Sha256,
  type V1R11AuthorityDirectoryIdentity,
  type V1R11AuthorityFileIdentity,
} from "./halfkp81-depth18-v1r11-authority-io";
import {
  HALFKP81_V1R11_ENGINE_BINARY_IDENTITY_SCHEMA,
  HALFKP81_V1R11_ENGINE_EVAL_IDENTITY_SCHEMA,
  halfkp81V1R11FormalRunFingerprintV2,
  type Halfkp81V1R11FormalRunIntentIdentity,
  type Halfkp81V1R11FormalRunIntentInput,
} from "./halfkp81-depth18-v1r11-formal-run-intent";
import {
  HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA,
  HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
  HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_BYTES,
  HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_RELATIVE_PATH,
  HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_SHA256,
  HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1R9,
} from "./halfkp81-depth18-teacher-runner";
import { finalizeHalfkp81V1R11ProductionStagedAuthority } from "./finalize-halfkp81-depth18-v1r11-staged-authority";
import {
  publishHalfkp81V1R11PreformalTerminalFault,
  type V1R11PreformalFaultRequest,
} from "./halfkp81-depth18-v1r11-preformal-fault";
import { Halfkp81V1R11PreformalStageFailure } from "./halfkp81-depth18-v1r11-preformal-stage-failure";
import { buildHalfkp81V1R11ExactPowerGuardianCommand } from "./halfkp81-depth18-v1r11-stage-b-launchagent-supervisor";
import {
  bootstrapHalfkp81V1R11PlannedLaunchAgent,
  prepareHalfkp81V1R11PlannedLaunchAgentForTests,
} from "./prepare-halfkp81-depth18-v1r11-planned-launchagent";
import { produceHalfkp81V1R11StageAControlPlane } from "./produce-halfkp81-depth18-v1r11-preformal-gates";
import {
  executeHalfkp81V1R11ProductionStageBEpoch,
  executeHalfkp81V1R11ProductionStageCAdmission,
  type Halfkp81V1R11StageBContext,
  type Halfkp81V1R11StageBGate,
} from "./produce-halfkp81-depth18-v1r11-stage-bc";
import {
  produceHalfkp81Depth18V1R11ProcessCleanupEvidence,
  validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests,
  type Halfkp81V1R11ProcessCleanupEvidence,
  type Halfkp81V1R11ProcessCleanupInput,
  type Halfkp81V1R11ProcessCleanupValidationContext,
} from "./produce-halfkp81-depth18-v1r11-process-cleanup-evidence";
import {
  verifyHalfkp81V1R11PreformalTerminalFault,
  type Halfkp81V1R11PreformalFaultVerificationContext,
} from "./verify-halfkp81-depth18-v1r11-preformal-fault";
import { verifyAndPublishHalfkp81V1R11StageAAuthority } from "./verify-halfkp81-depth18-v1r11-stage-a";
import { verifyAndPublishHalfkp81V1R11ProductionStagedAuthority } from "./verify-halfkp81-depth18-v1r11-staged-authority";

const AUTHORITY_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority";
const STAGE_B_GATES = Object.freeze([
  "candidate-order-gate",
  "known10-probe",
  "pathological-fallback-probe",
  "mixed-load-gate",
  "formal-like-512",
] as const satisfies readonly Halfkp81V1R11StageBGate[]);
const V1R11_OUTER_PRODUCTION_READY = false as const;

function isHalfkp81V1R11EvidencePublicationInProgress(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT" || code === "EINPROGRESS") return true;
  if (!(error instanceof Error)) return false;
  return (
    error.message.endsWith(" changed during held-descriptor read") ||
    error.message.endsWith(" path identity changed during held read")
  );
}

export function assertHalfkp81V1R11OuterProductionReadyForTests(): void {
  if (!V1R11_OUTER_PRODUCTION_READY) {
    throw new Error(
      "v1r11 outer production remains locked until public-path E2E and independent audit pass",
    );
  }
}

export function assertHalfkp81V1R11NoCallerFingerprintForTests(
  request: Readonly<Record<string, unknown>>,
): void {
  if (Object.prototype.hasOwnProperty.call(request, "runFingerprint")) {
    throw new Error("caller-authored formal run fingerprint is forbidden");
  }
}
const ENGINE_RECEIPT_SCHEMA = "shogi-teacher-engine-receipt-v1" as const;

function requiredObject(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} differs`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function formalIdentity(
  value: unknown,
  label: string,
  expectedSchema: string,
  rows?: number,
): Readonly<Halfkp81V1R11FormalRunIntentIdentity> {
  const object = requiredObject(value, label);
  const expectedKeys =
    rows === undefined
      ? ["path", "bytes", "sha256", "schema"]
      : [
          "path",
          "bytes",
          "sha256",
          "schema",
          "rows",
          "held_read_only_descriptor",
          "stable_double_read",
        ];
  if (
    v1r11CanonicalJson(Object.keys(object).sort()) !==
      v1r11CanonicalJson(expectedKeys.sort()) ||
    !path.isAbsolute(String(object.path)) ||
    path.normalize(String(object.path)) !== object.path ||
    !Number.isSafeInteger(object.bytes) ||
    Number(object.bytes) < 1 ||
    !/^[0-9a-f]{64}$/u.test(String(object.sha256)) ||
    object.schema !== expectedSchema ||
    (rows !== undefined &&
      (object.rows !== rows ||
        object.held_read_only_descriptor !== true ||
        object.stable_double_read !== true))
  ) {
    throw new Error(`${label} differs`);
  }
  return Object.freeze({
    path: String(object.path),
    bytes: Number(object.bytes),
    sha256: String(object.sha256),
    schema: expectedSchema,
    ...(rows === undefined ? {} : { rows }),
  });
}

function fixedAssetFormalIdentity(
  value: unknown,
  label: string,
  protocolSchema: string,
): Readonly<Halfkp81V1R11FormalRunIntentIdentity> {
  const object = requiredObject(value, label);
  if (
    v1r11CanonicalJson(Object.keys(object).sort()) !==
      v1r11CanonicalJson(["path", "bytes", "sha256"].sort()) ||
    !path.isAbsolute(String(object.path)) ||
    path.normalize(String(object.path)) !== object.path ||
    !Number.isSafeInteger(object.bytes) ||
    Number(object.bytes) < 1 ||
    !/^[0-9a-f]{64}$/u.test(String(object.sha256))
  ) {
    throw new Error(`${label} differs`);
  }
  return Object.freeze({
    path: String(object.path),
    bytes: Number(object.bytes),
    sha256: String(object.sha256),
    schema: protocolSchema,
  });
}

async function readStableExternalIdentity(
  identity: Readonly<Halfkp81V1R11FormalRunIntentIdentity>,
  label: string,
): Promise<void> {
  const beforePath = await fs.promises.lstat(identity.path, { bigint: true });
  if (!beforePath.isFile() || beforePath.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  const handle = await fs.promises.open(
    identity.path,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.dev !== beforePath.dev ||
      before.ino !== beforePath.ino ||
      before.size !== beforePath.size ||
      before.size > BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      throw new Error(`${label} changed during safe open`);
    }
    const size = Number(before.size);
    const first = Buffer.allocUnsafe(size);
    const second = Buffer.allocUnsafe(size);
    const firstRead = await handle.read(first, 0, size, 0);
    const middle = await handle.stat({ bigint: true });
    const secondRead = await handle.read(second, 0, size, 0);
    const after = await handle.stat({ bigint: true });
    const afterPath = await fs.promises.lstat(identity.path, { bigint: true });
    const signature = (entry: fs.BigIntStats): string =>
      [entry.dev, entry.ino, entry.size, entry.mtimeNs, entry.ctimeNs].join(":");
    if (
      firstRead.bytesRead !== size ||
      secondRead.bytesRead !== size ||
      !first.equals(second) ||
      new Set([before, middle, after, afterPath].map(signature)).size !== 1 ||
      size !== identity.bytes ||
      v1r11Sha256(first) !== identity.sha256 ||
      (await fs.promises.realpath(identity.path)) !== identity.path
    ) {
      throw new Error(`${label} differs during held double read`);
    }
  } finally {
    await handle.close();
  }
}

export async function recomputeHalfkp81V1R11FormalRunForRuntimePlan(
  repositoryRoot: string,
  teacherPlan: Readonly<V1R11AuthorityFileIdentity>,
  sourceRevision: string,
  plannedFinalDescriptor: Readonly<V1R11AuthorityFileIdentity>,
): Promise<
  Readonly<{
    input: Readonly<Halfkp81V1R11FormalRunIntentInput>;
    fingerprint: string;
  }>
> {
  const rawPlan = await readV1R11HeldIdentity(
    teacherPlan,
    teacherPlan.schema,
    "outer formal-run-intent teacher plan",
  );
  const plan = parseV1R11CanonicalObject(rawPlan, "outer formal-run-intent teacher plan");
  if (plan.source_revision !== sourceRevision) {
    throw new Error("outer formal-run-intent source revision differs");
  }
  const selectionEvidence = requiredObject(
    plan.selection_evidence,
    "outer formal-run-intent selection evidence",
  );
  const selection = formalIdentity(
    selectionEvidence.selection_jsonl,
    "outer formal-run-intent selection JSONL",
    HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
    8_192,
  );
  const manifest = formalIdentity(
    plan.selection_manifest,
    "outer formal-run-intent selection manifest",
    HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA,
  );
  const engine = requiredObject(plan.engine, "outer formal-run-intent engine");
  const binary = fixedAssetFormalIdentity(
    engine.binary,
    "outer formal-run-intent engine binary",
    HALFKP81_V1R11_ENGINE_BINARY_IDENTITY_SCHEMA,
  );
  const evalFile = fixedAssetFormalIdentity(
    engine.eval_file,
    "outer formal-run-intent eval file",
    HALFKP81_V1R11_ENGINE_EVAL_IDENTITY_SCHEMA,
  );
  const receipt = Object.freeze({
    path: path.join(
      repositoryRoot,
      HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_RELATIVE_PATH,
    ),
    bytes: HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_BYTES,
    sha256: HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_SHA256,
    schema: ENGINE_RECEIPT_SCHEMA,
  });
  await Promise.all([
    readStableExternalIdentity(selection, "outer selection JSONL"),
    readStableExternalIdentity(manifest, "outer selection manifest"),
    readStableExternalIdentity(binary, "outer engine binary"),
    readStableExternalIdentity(evalFile, "outer eval file"),
    readStableExternalIdentity(receipt, "outer engine receipt"),
  ]);
  const input = Object.freeze({
    teacherPlan,
    selectionJsonl: selection,
    selectionManifest: manifest,
    sourceRevision,
    engine: { binary, evalFile, receipt },
    teacherContract: requiredObject(
      plan.teacher,
      "outer formal-run-intent teacher contract",
    ),
    candidateContract:
      HALFKP81_DEPTH18_YANEURA_ONLY_CANDIDATE_GENERATION_V1R9,
    plannedFinalDescriptor,
  });
  return Object.freeze({
    input,
    fingerprint: halfkp81V1R11FormalRunFingerprintV2(input),
  });
}

export interface Halfkp81V1R11PreformalOrchestratorContext {
  readonly repositoryRoot: string;
  readonly teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
  readonly sourceRevision: string;
  readonly runFingerprint: string;
  readonly authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
  readonly plannedLaunchAgent: Readonly<{
    label: string;
    plistSnapshot: Readonly<V1R11AuthorityFileIdentity>;
  }>;
}

interface CleanupResult {
  readonly identity: Readonly<V1R11AuthorityFileIdentity>;
  readonly evidence: Readonly<Halfkp81V1R11ProcessCleanupEvidence>;
  readonly recomputedProcessCleanup: Readonly<
    Halfkp81V1R11ProcessCleanupEvidence["process_cleanup"]
  >;
  readonly validationContext: Readonly<Halfkp81V1R11ProcessCleanupValidationContext>;
}

export interface Halfkp81V1R11PreformalOrchestratorDependencies {
  readonly executeStages: () => Promise<Readonly<V1R11AuthorityFileIdentity>>;
  readonly cleanupInput: (
    failure: Readonly<Halfkp81V1R11PreformalStageFailure>,
  ) => Readonly<
    Omit<
      Halfkp81V1R11ProcessCleanupInput,
      "homeDirectory" | "repositoryRoot" | "uid" | "producer"
    >
  >;
  readonly produceCleanup: (
    input: Readonly<
      Omit<
        Halfkp81V1R11ProcessCleanupInput,
        "homeDirectory" | "repositoryRoot" | "uid" | "producer"
      >
    >,
  ) => Promise<Readonly<CleanupResult>>;
  readonly publishFault: (
    request: Readonly<V1R11PreformalFaultRequest>,
  ) => Promise<Readonly<V1R11AuthorityFileIdentity>>;
  readonly verifyFault: (
    identity: Readonly<V1R11AuthorityFileIdentity>,
    context: Readonly<Halfkp81V1R11PreformalFaultVerificationContext>,
  ) => Promise<Readonly<Record<string, unknown>>>;
  readonly now: () => string;
}

export type Halfkp81V1R11PreformalOrchestratorResult =
  | Readonly<{
      status: "verified-formal-admission-handoff";
      verifiedReceipt: Readonly<V1R11AuthorityFileIdentity>;
    }>
  | Readonly<{
      status: "preformal-terminal-fault-family-closed";
      fault: Readonly<V1R11AuthorityFileIdentity>;
      cleanup: Readonly<V1R11AuthorityFileIdentity>;
    }>;

function exactCanonicalUtc(value: string): void {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error("outer orchestrator clock differs");
  }
}

async function assertAbsent(filePath: string, label: string): Promise<void> {
  try {
    await fs.promises.lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${label} was published by an inner component`);
}

function validateTypedFailure(
  failure: Readonly<Halfkp81V1R11PreformalStageFailure>,
): void {
  if (
    (failure.runner_state === "not-created") !==
      (failure.artifacts.runnerIdentity === null) ||
    (failure.runner_state === "not-created" &&
      failure.artifacts.activeLaunchAgent !== null) ||
    (failure.runner_state === "active" &&
      (failure.artifacts.runnerIdentity === null ||
        failure.artifacts.activeLaunchAgent === null)) ||
    (failure.sequence === null) !== (failure.gate === null)
  ) {
    throw new Error("outer orchestrator typed failure state differs");
  }
}

async function holdFailureArtifacts(
  failure: Readonly<Halfkp81V1R11PreformalStageFailure>,
): Promise<void> {
  const identities = [
    failure.artifacts.ledgerPrefix,
    failure.artifacts.lastGateReceipt,
    failure.artifacts.engineGateVerifiedReceipt,
    failure.artifacts.launchAgentAuthority,
    ...failure.artifacts.partialArtifacts,
  ].filter(
    (identity): identity is Readonly<V1R11AuthorityFileIdentity> =>
      identity !== null,
  );
  for (const [index, identity] of identities.entries()) {
    await readV1R11HeldIdentity(
      identity,
      identity.schema,
      `outer orchestrator failure artifact ${index + 1}`,
    );
  }
  if (failure.artifacts.activeLaunchAgent !== null) {
    await readV1R11HeldIdentity(
      failure.artifacts.activeLaunchAgent.plistSnapshot,
      failure.artifacts.activeLaunchAgent.plistSnapshot.schema,
      "outer orchestrator active LaunchAgent plist snapshot",
    );
    if (failure.artifacts.launchAgentAuthority !== null) {
      const raw = await readV1R11HeldIdentity(
        failure.artifacts.launchAgentAuthority,
        failure.artifacts.launchAgentAuthority.schema,
        "outer orchestrator active LaunchAgent authority",
      );
      const authority = parseV1R11CanonicalObject(
        raw,
        "outer orchestrator active LaunchAgent authority",
      );
      if (
        authority.label !== failure.artifacts.activeLaunchAgent.label ||
        v1r11CanonicalJson(authority.plist_snapshot) !==
          v1r11CanonicalJson(
            failure.artifacts.activeLaunchAgent.plistSnapshot,
          )
      ) {
        throw new Error(
          "outer orchestrator active LaunchAgent authority cross-binding differs",
        );
      }
    }
  }
}

async function runCore(
  context: Readonly<Halfkp81V1R11PreformalOrchestratorContext>,
  dependencies: Readonly<Halfkp81V1R11PreformalOrchestratorDependencies>,
): Promise<Readonly<Halfkp81V1R11PreformalOrchestratorResult>> {
  await assertV1R11AuthorityDirectory(context.authorityDirectory);
  if (
    !path.isAbsolute(context.repositoryRoot) ||
    path.normalize(context.repositoryRoot) !== context.repositoryRoot ||
    fs.realpathSync(context.repositoryRoot) !== context.repositoryRoot ||
    !/^[0-9a-f]{40}$/u.test(context.sourceRevision) ||
    !/^[0-9a-f]{64}$/u.test(context.runFingerprint)
  ) {
    throw new Error("outer orchestrator context differs");
  }
  await readV1R11HeldIdentity(
    context.teacherPlan,
    context.teacherPlan.schema,
    "outer orchestrator teacher plan",
  );
  const expectedPlannedLabel =
    `com.meetyudai.shogi.halfkp81-depth18-yaneura-only-v1r11-${context.sourceRevision.slice(0, 8)}`;
  if (
    context.plannedLaunchAgent.label !== expectedPlannedLabel ||
    context.plannedLaunchAgent.plistSnapshot.path !==
      path.join(context.authorityDirectory.path, "launchagent.plist.snapshot") ||
    context.plannedLaunchAgent.plistSnapshot.schema !==
      "application/x-apple-aspen-config-exact-bytes"
  ) {
    throw new Error("outer orchestrator planned LaunchAgent descriptor differs");
  }
  await readV1R11HeldIdentity(
    context.plannedLaunchAgent.plistSnapshot,
    context.plannedLaunchAgent.plistSnapshot.schema,
    "outer orchestrator planned LaunchAgent snapshot",
  );
  const faultPath = path.join(
    context.authorityDirectory.path,
    "preformal-terminal-fault.json",
  );
  const cleanupPath = path.join(
    context.authorityDirectory.path,
    "preformal-process-cleanup-evidence.json",
  );
  await assertAbsent(faultPath, "outer orchestrator terminal fault");
  await assertAbsent(cleanupPath, "outer orchestrator cleanup evidence");
  try {
    const verifiedReceipt = await dependencies.executeStages();
    await readV1R11HeldIdentity(
      verifiedReceipt,
      verifiedReceipt.schema,
      "outer orchestrator verified receipt",
    );
    await assertAbsent(faultPath, "outer orchestrator terminal fault");
    await assertAbsent(cleanupPath, "outer orchestrator cleanup evidence");
    return Object.freeze({
      status: "verified-formal-admission-handoff" as const,
      verifiedReceipt,
    });
  } catch (error) {
    if (!(error instanceof Halfkp81V1R11PreformalStageFailure)) {
      throw new Error("outer orchestrator rejected untyped inner failure", {
        cause: error,
      });
    }
    validateTypedFailure(error);
    await holdFailureArtifacts(error);
    // Any direct inner publication violates sole ownership; never overwrite or
    // reinterpret it as an outer-owned fault.
    await assertAbsent(faultPath, "outer orchestrator terminal fault");
    await assertAbsent(cleanupPath, "outer orchestrator cleanup evidence");

    const cleanupInput = dependencies.cleanupInput(error);
    const expectedCleanupLaunchAgent =
      error.runner_state === "active"
        ? error.artifacts.activeLaunchAgent!
        : context.plannedLaunchAgent;
    if (
      cleanupInput.scope !== "preformal" ||
      cleanupInput.launchagent.label !== expectedCleanupLaunchAgent.label ||
      v1r11CanonicalJson(cleanupInput.launchagent.plistSnapshot) !==
        v1r11CanonicalJson(expectedCleanupLaunchAgent.plistSnapshot) ||
      v1r11CanonicalJson(cleanupInput.runnerIdentity) !==
        v1r11CanonicalJson(error.artifacts.runnerIdentity) ||
      cleanupInput.runnerNullPhaseBeforeAnyAdmission !==
        (error.runner_state === "not-created")
    ) {
      throw new Error("outer orchestrator cleanup binding differs");
    }
    const cleanup = await dependencies.produceCleanup(cleanupInput);
    if (cleanup.identity.path !== cleanupPath) {
      throw new Error("outer orchestrator cleanup namespace differs");
    }
    const heldCleanup = await readV1R11HeldIdentity(
      cleanup.identity,
      cleanup.identity.schema,
      "outer orchestrator cleanup evidence",
    );
    const parsedCleanup = JSON.parse(heldCleanup.toString("utf8")) as unknown;
    const independentlyRecomputed =
      validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
        parsedCleanup,
        cleanup.validationContext,
      );
    if (
      v1r11CanonicalJson(independentlyRecomputed) !==
        v1r11CanonicalJson(cleanup.recomputedProcessCleanup)
    ) {
      throw new Error("outer orchestrator cleanup recomputation differs");
    }
    await assertAbsent(faultPath, "outer orchestrator terminal fault");
    const faultedAtUtc = dependencies.now();
    exactCanonicalUtc(faultedAtUtc);
    const fault = await dependencies.publishFault({
      phase: error.phase,
      gate: error.gate,
      sequence: error.sequence,
      teacherPlan: context.teacherPlan,
      sourceRevision: context.sourceRevision,
      runFingerprint: context.runFingerprint,
      authorityDirectory: context.authorityDirectory,
      ledgerPrefix: error.artifacts.ledgerPrefix,
      lastGateReceipt: error.artifacts.lastGateReceipt,
      engineGateVerifiedReceipt: error.artifacts.engineGateVerifiedReceipt,
      launchAgentAuthority: error.artifacts.launchAgentAuthority,
      processCleanupEvidence: cleanup.identity,
      processCleanupValidationContext: cleanup.validationContext,
      error: error.error,
      processCleanup: independentlyRecomputed,
      faultedAtUtc,
      repositoryRoot: context.repositoryRoot,
    });
    await dependencies.verifyFault(fault, {
      teacherPlan: context.teacherPlan,
      sourceRevision: context.sourceRevision,
      runFingerprint: context.runFingerprint,
      authorityDirectory: context.authorityDirectory,
      repositoryRoot: context.repositoryRoot,
      processCleanupValidationContext: cleanup.validationContext,
    });
    return Object.freeze({
      status: "preformal-terminal-fault-family-closed" as const,
      fault,
      cleanup: cleanup.identity,
    });
  }
}

/** Mandatory E2E seam. Only complete stage functions may be injected. */
export async function runHalfkp81V1R11PreformalOrchestratorForTests(
  context: Readonly<Halfkp81V1R11PreformalOrchestratorContext>,
  dependencies: Readonly<Halfkp81V1R11PreformalOrchestratorDependencies>,
): Promise<Readonly<Halfkp81V1R11PreformalOrchestratorResult>> {
  return runCore(context, dependencies);
}

/**
 * Production fault finalization uses only the fixed rich cleanup producer and
 * fixed publisher/verifier. The stage sequence supplies the deterministic
 * planned descriptor before it enters this function.
 */
export async function finalizeHalfkp81V1R11PreformalFailure(
  context: Readonly<Halfkp81V1R11PreformalOrchestratorContext>,
  executeStages: () => Promise<Readonly<V1R11AuthorityFileIdentity>>,
  cleanupInput: Halfkp81V1R11PreformalOrchestratorDependencies["cleanupInput"],
): Promise<Readonly<Halfkp81V1R11PreformalOrchestratorResult>> {
  return runCore(
    context,
    Object.freeze({
      executeStages,
      cleanupInput,
      produceCleanup:
        produceHalfkp81Depth18V1R11ProcessCleanupEvidence as Halfkp81V1R11PreformalOrchestratorDependencies["produceCleanup"],
      publishFault: publishHalfkp81V1R11PreformalTerminalFault,
      verifyFault: verifyHalfkp81V1R11PreformalTerminalFault,
      now: () => new Date().toISOString(),
    }),
  );
}

async function lastReceiptFromLedger(
  ledger: Readonly<V1R11AuthorityFileIdentity>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  const raw = await readV1R11HeldIdentity(
    ledger,
    ledger.schema,
    "outer orchestrator current ledger",
  );
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw) || !text.endsWith("\n")) {
    throw new Error("outer orchestrator ledger encoding differs");
  }
  const last = text.slice(0, -1).split("\n").at(-1);
  if (last === undefined || last.length < 1) {
    throw new Error("outer orchestrator ledger is empty");
  }
  const row = parseV1R11CanonicalObject(
    Buffer.from(`${last}\n`, "utf8"),
    "outer orchestrator final ledger row",
  );
  const receipt = row.gate_receipt as Readonly<V1R11AuthorityFileIdentity>;
  await readV1R11HeldIdentity(
    receipt,
    "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11",
    "outer orchestrator previous gate receipt",
  );
  return Object.freeze(receipt);
}

export interface Halfkp81V1R11FixedStageSequenceDependencies {
  readonly produceStageA: typeof produceHalfkp81V1R11StageAControlPlane;
  readonly verifyStageA: typeof verifyAndPublishHalfkp81V1R11StageAAuthority;
  readonly previousReceipt: typeof lastReceiptFromLedger;
  readonly executeStageB: typeof executeHalfkp81V1R11ProductionStageBEpoch;
  readonly executeStageC: typeof executeHalfkp81V1R11ProductionStageCAdmission;
  readonly finalize: typeof finalizeHalfkp81V1R11ProductionStagedAuthority;
  readonly independentlyVerify: typeof verifyAndPublishHalfkp81V1R11ProductionStagedAuthority;
}

const FIXED_STAGE_SEQUENCE_DEPENDENCIES = Object.freeze({
  produceStageA: produceHalfkp81V1R11StageAControlPlane,
  verifyStageA: verifyAndPublishHalfkp81V1R11StageAAuthority,
  previousReceipt: lastReceiptFromLedger,
  executeStageB: executeHalfkp81V1R11ProductionStageBEpoch,
  executeStageC: executeHalfkp81V1R11ProductionStageCAdmission,
  finalize: finalizeHalfkp81V1R11ProductionStagedAuthority,
  independentlyVerify:
    verifyAndPublishHalfkp81V1R11ProductionStagedAuthority,
} satisfies Halfkp81V1R11FixedStageSequenceDependencies);

async function executeFixedProductionStages(
  input: Readonly<{
    repositoryRoot: string;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    formalRunIntent?: Readonly<Halfkp81V1R11FormalRunIntentInput>;
    launchFinalRunner?: () => Promise<void>;
    prNumber: number;
    authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
  }>,
  dependencies: Readonly<Halfkp81V1R11FixedStageSequenceDependencies> =
    FIXED_STAGE_SEQUENCE_DEPENDENCIES,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  const stageA = await dependencies.produceStageA({
    repositoryRoot: input.repositoryRoot,
    teacherPlan: input.teacherPlan,
    runFingerprint: input.runFingerprint,
    prNumber: input.prNumber,
    authorityDirectory: input.authorityDirectory,
  });
  const stageAReceipt = await dependencies.verifyStageA({
    repositoryRoot: input.repositoryRoot,
    teacherPlan: input.teacherPlan,
    sourceRevision: input.sourceRevision,
    runFingerprint: input.runFingerprint,
    authorityDirectory: stageA.authorityDirectory,
    gateDirectory: stageA.gateDirectory,
    ledgerPrefix: stageA.ledgerPrefix,
  });
  let currentLedger = stageA.ledgerPrefix;
  let previousGateReceipt = await dependencies.previousReceipt(currentLedger);
  for (const gate of STAGE_B_GATES) {
    const context: Halfkp81V1R11StageBContext = Object.freeze({
      repositoryRoot: input.repositoryRoot,
      teacherPlan: input.teacherPlan,
      sourceRevision: input.sourceRevision,
      formalRunFingerprint: input.runFingerprint,
      authorityDirectory: stageA.authorityDirectory,
      gateDirectory: stageA.gateDirectory,
      stageAReceipt,
      currentLedger,
      previousGateReceipt,
    });
    const result = await dependencies.executeStageB(
      context,
      gate,
    );
    currentLedger = result.ledger;
    previousGateReceipt = result.receipt;
  }
  if (input.launchFinalRunner === undefined) {
    if (dependencies === FIXED_STAGE_SEQUENCE_DEPENDENCIES) {
      throw new Error("production final LaunchAgent launcher is missing");
    }
  } else {
    await input.launchFinalRunner();
  }
  const stageC = await dependencies.executeStageC({
    repositoryRoot: input.repositoryRoot,
    teacherPlan: input.teacherPlan,
    sourceRevision: input.sourceRevision,
    formalRunFingerprint: input.runFingerprint,
    authorityDirectory: stageA.authorityDirectory,
    gateDirectory: stageA.gateDirectory,
    stageAReceipt,
    currentLedger,
    previousGateReceipt,
    formalRunIntent: input.formalRunIntent,
  });
  const rawReceipt = await dependencies.finalize({
    repositoryRoot: input.repositoryRoot,
    teacherPlan: input.teacherPlan,
    sourceRevision: input.sourceRevision,
    runFingerprint: input.runFingerprint,
    authorityDirectory: stageA.authorityDirectory,
    gateDirectory: stageA.gateDirectory,
    stageAReceipt,
    ledger: stageC.ledger,
    launchAgentAuthority: stageC.launchAgentAuthority,
    formalRunIntent: input.formalRunIntent,
  });
  return dependencies.independentlyVerify({
    repositoryRoot: input.repositoryRoot,
    teacherPlan: input.teacherPlan,
    sourceRevision: input.sourceRevision,
    runFingerprint: input.runFingerprint,
    authorityDirectory: stageA.authorityDirectory,
    gateDirectory: stageA.gateDirectory,
    stageAReceipt,
    ledger: stageC.ledger,
    rawReceipt,
    launchAgentAuthority: stageC.launchAgentAuthority,
    formalRunIntent: input.formalRunIntent as never,
  });
}

/** Test-only seam for the exact A→five-B→C→finalizer→independent order. */
export async function executeHalfkp81V1R11FixedStageSequenceForTests(
  input: Parameters<typeof executeFixedProductionStages>[0],
  dependencies: Readonly<Halfkp81V1R11FixedStageSequenceDependencies>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  return executeFixedProductionStages(input, dependencies);
}

/** Fixed production owner from planned descriptor through verified handoff. */
export async function runHalfkp81V1R11ProductionPreformalOrchestrator(
  request: Readonly<{
    repositoryRoot: string;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    prNumber: number;
  }>,
): Promise<Readonly<Halfkp81V1R11PreformalOrchestratorResult>> {
  assertHalfkp81V1R11OuterProductionReadyForTests();
  assertHalfkp81V1R11NoCallerFingerprintForTests(
    request as unknown as Readonly<Record<string, unknown>>,
  );
  const repositoryRoot = fs.realpathSync.native(request.repositoryRoot);
  const sourceRevision = execFileSync(
    "/usr/bin/git",
    ["-C", repositoryRoot, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  const authorityDirectory = await createV1R11AuthorityDirectory(
    AUTHORITY_DIRECTORY,
  );
  const homeDirectory = fs.realpathSync.native(os.homedir());
  const planned = await prepareHalfkp81V1R11PlannedLaunchAgentForTests({
    authorityDirectory,
    repositoryRoot,
    homeDirectory,
    nodePath: fs.realpathSync.native(process.execPath),
    sourceRevision,
  });
  const formalRun = await recomputeHalfkp81V1R11FormalRunForRuntimePlan(
    repositoryRoot,
    request.teacherPlan,
    sourceRevision,
    planned.plistSnapshot,
  );
  const runFingerprint = formalRun.fingerprint;
  const context: Halfkp81V1R11PreformalOrchestratorContext = Object.freeze({
    repositoryRoot,
    teacherPlan: request.teacherPlan,
    sourceRevision,
    runFingerprint,
    authorityDirectory,
    plannedLaunchAgent: Object.freeze({
      label: planned.label,
      plistSnapshot: planned.plistSnapshot,
    }),
  });
  const nodePath = fs.realpathSync.native(process.execPath);
  return finalizeHalfkp81V1R11PreformalFailure(
    context,
    () =>
      executeFixedProductionStages({
        ...request,
        repositoryRoot,
        sourceRevision,
        runFingerprint,
        formalRunIntent: formalRun.input,
        launchFinalRunner: async () => {
          await bootstrapHalfkp81V1R11PlannedLaunchAgent(planned);
          const evidencePath = path.join(
            authorityDirectory.path,
            "launchagent-authority-evidence.json",
          );
          const deadline = Date.now() + 120_000;
          for (;;) {
            try {
              const evidenceRaw = await readV1R11HeldFile(
                evidencePath,
                "modern Stage C evidence publication",
              );
              if (evidenceRaw.at(-1) !== 0x0a) {
                throw Object.assign(
                  new Error("modern Stage C evidence publication is incomplete"),
                  { code: "EINPROGRESS" },
                );
              }
              const evidenceValue = parseV1R11CanonicalObject(
                evidenceRaw,
                "modern Stage C evidence publication",
              );
              const evidence = Object.freeze({
                path: evidencePath,
                bytes: evidenceRaw.byteLength,
                sha256: v1r11Sha256(evidenceRaw),
                schema:
                  "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11",
              });
              if (
                evidenceValue.schema !== evidence.schema ||
                evidenceValue.status !==
                  "live-one-shot-LaunchAgent-semantics-verified-no-standalone-formal-authority" ||
                v1r11CanonicalJson(evidenceValue.teacher_plan) !==
                  v1r11CanonicalJson(request.teacherPlan) ||
                evidenceValue.source_revision !== sourceRevision ||
                evidenceValue.run_fingerprint !== runFingerprint ||
                v1r11CanonicalJson(evidenceValue.plist_snapshot) !==
                  v1r11CanonicalJson(planned.plistSnapshot)
              ) {
                throw new Error("modern Stage C evidence publication differs");
              }
              await readV1R11HeldIdentity(
                evidence,
                evidence.schema,
                "modern Stage C completed evidence",
              );
              await new Promise<void>((resolve) => setTimeout(resolve, 50));
              const confirmed = await readV1R11HeldFile(
                evidencePath,
                "modern Stage C evidence publication confirmation",
              );
              if (!confirmed.equals(evidenceRaw)) {
                throw Object.assign(
                  new Error("modern Stage C evidence publication changed"),
                  { code: "EINPROGRESS" },
                );
              }
              break;
            } catch (error) {
              if (!isHalfkp81V1R11EvidencePublicationInProgress(error)) {
                throw error;
              }
            }
            if (Date.now() >= deadline) {
              throw new Error("modern Stage C evidence publication timed out");
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 250));
          }
        },
        authorityDirectory,
      }),
    (failure) => {
      const launchagent =
        failure.runner_state === "active"
          ? failure.artifacts.activeLaunchAgent!
          : context.plannedLaunchAgent;
      return Object.freeze({
        scope: "preformal" as const,
        teacherPlan: request.teacherPlan,
        sourceRevision,
        runFingerprint,
        launchagent,
        runnerIdentity: failure.artifacts.runnerIdentity,
        runnerNullPhaseBeforeAnyAdmission:
          failure.runner_state === "not-created",
        fixedRoles: Object.freeze({
          powerGuardian: Object.freeze({
            executable: nodePath,
            argv: buildHalfkp81V1R11ExactPowerGuardianCommand(
              nodePath,
              repositoryRoot,
            ),
          }),
          stageBSupervisor: Object.freeze({
            executable: nodePath,
            argv: [
              nodePath,
              "-r",
              path.join(repositoryRoot, "node_modules/tsx/dist/cjs/index.cjs"),
              path.join(
                repositoryRoot,
                "ml/halfkp81-depth18-v1r11-stage-b-launchagent-supervisor.ts",
              ),
            ].join(" "),
          }),
          yaneuraouEngine: Object.freeze({
            executable:
              "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1/bin/yaneuraou",
            argv:
              "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1/bin/yaneuraou",
          }),
        }),
      });
    },
  );
}
