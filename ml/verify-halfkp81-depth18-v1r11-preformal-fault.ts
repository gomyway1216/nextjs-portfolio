import * as fs from "node:fs";
import * as path from "node:path";

import {
  assertV1R11AuthorityDirectory,
  parseV1R11CanonicalObject,
  readV1R11HeldIdentity,
  v1r11CanonicalJson,
  type V1R11AuthorityDirectoryIdentity,
  type V1R11AuthorityFileIdentity,
} from "./halfkp81-depth18-v1r11-authority-io";
import { buildHalfkp81V1R11RecursiveProducerIdentity } from "./halfkp81-depth18-v1r11-producer-closure";
import {
  validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests,
  type Halfkp81V1R11ProcessCleanupValidationContext,
} from "./produce-halfkp81-depth18-v1r11-process-cleanup-evidence";

const SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-terminal-fault-v1r11";
const CLEANUP_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-process-cleanup-evidence-v1r11";
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const GATES = Object.freeze([
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
const PHASES = Object.freeze([
  "stage-a-producer",
  "stage-a-verifier",
  "planned-handoff",
  "stage-b-power",
  "final-ac-gate",
  "finalizer",
  "independent-verifier",
] as const);
const EXACT_KEYS = Object.freeze([
  "schema",
  "status",
  "phase",
  "gate",
  "sequence",
  "teacher_plan",
  "source_revision",
  "run_fingerprint",
  "authority_directory",
  "ledger_prefix",
  "last_gate_receipt",
  "engine_gate_verified_receipt",
  "launchagent_authority",
  "process_cleanup_evidence",
  "error",
  "process_cleanup",
  "faulted_at_utc",
  "producer",
  "authority",
] as const);

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  if (
    v1r11CanonicalJson(Object.keys(value).sort()) !==
    v1r11CanonicalJson([...keys].sort())
  ) {
    throw new Error(`${label} keys differ`);
  }
}

function object(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} differs`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function validateIdentity(
  value: unknown,
  expectedPath: string | RegExp,
  expectedSchema: string,
  label: string,
): Readonly<V1R11AuthorityFileIdentity> {
  const identity = object(value, label);
  exactKeys(identity, ["path", "bytes", "sha256", "schema"], label);
  if (
    typeof identity.path !== "string" ||
    !path.isAbsolute(identity.path) ||
    path.normalize(identity.path) !== identity.path ||
    !Number.isSafeInteger(identity.bytes) ||
    Number(identity.bytes) < 1 ||
    typeof identity.sha256 !== "string" ||
    !SHA256_RE.test(identity.sha256) ||
    identity.schema !== expectedSchema ||
    (typeof expectedPath === "string"
      ? identity.path !== expectedPath
      : !expectedPath.test(identity.path))
  ) {
    throw new Error(`${label} differs`);
  }
  return identity as unknown as Readonly<V1R11AuthorityFileIdentity>;
}

function validateNullableIdentity(
  value: unknown,
  expectedPath: string | RegExp,
  expectedSchema: string,
  label: string,
): Readonly<V1R11AuthorityFileIdentity> | null {
  return value === null
    ? null
    : validateIdentity(value, expectedPath, expectedSchema, label);
}

function validateSummary(value: unknown) {
  const summary = object(value, "fault process cleanup");
  exactKeys(
    summary,
    [
      "scheduling_stopped",
      "engines_terminated",
      "engines_reaped",
      "remaining_engine_pids",
    ],
    "fault process cleanup",
  );
  if (
    summary.scheduling_stopped !== true ||
    !Number.isSafeInteger(summary.engines_terminated) ||
    Number(summary.engines_terminated) < 0 ||
    !Number.isSafeInteger(summary.engines_reaped) ||
    Number(summary.engines_reaped) < 0 ||
    summary.engines_terminated !== summary.engines_reaped ||
    !Array.isArray(summary.remaining_engine_pids) ||
    summary.remaining_engine_pids.length !== 0
  ) {
    throw new Error("fault process cleanup differs");
  }
  return summary;
}

export interface Halfkp81V1R11PreformalFaultVerificationContext {
  readonly teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
  readonly sourceRevision: string;
  readonly runFingerprint: string;
  readonly authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
  readonly repositoryRoot: string;
  readonly processCleanupValidationContext: Readonly<Halfkp81V1R11ProcessCleanupValidationContext>;
}

async function verifyHalfkp81V1R11PreformalTerminalFaultCore(
  identity: Readonly<V1R11AuthorityFileIdentity>,
  context: Readonly<Halfkp81V1R11PreformalFaultVerificationContext>,
  requireTrackedRevision: boolean,
): Promise<Readonly<Record<string, unknown>>> {
  await assertV1R11AuthorityDirectory(context.authorityDirectory);
  if (
    identity.path !==
      path.join(context.authorityDirectory.path, "preformal-terminal-fault.json") ||
    !REVISION_RE.test(context.sourceRevision) ||
    !SHA256_RE.test(context.runFingerprint) ||
    !path.isAbsolute(context.repositoryRoot) ||
    path.normalize(context.repositoryRoot) !== context.repositoryRoot ||
    fs.realpathSync(context.repositoryRoot) !== context.repositoryRoot
  ) {
    throw new Error("preformal fault verification context differs");
  }
  const raw = await readV1R11HeldIdentity(identity, SCHEMA, "preformal fault");
  const value = parseV1R11CanonicalObject(raw, "preformal fault");
  exactKeys(value, EXACT_KEYS, "preformal fault");
  if (
    value.schema !== SCHEMA ||
    value.status !== "preformal-terminal-fault-family-closed-no-authority" ||
    value.source_revision !== context.sourceRevision ||
    value.run_fingerprint !== context.runFingerprint ||
    v1r11CanonicalJson(value.authority_directory) !==
      v1r11CanonicalJson(context.authorityDirectory) ||
    v1r11CanonicalJson(value.authority) !==
      v1r11CanonicalJson({
        may_execute_preformal_engine_gates: false,
        may_execute_formal_teacher: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      })
  ) {
    throw new Error("preformal fault binding or authority differs");
  }
  const expectedGate =
    value.sequence === null || !Number.isSafeInteger(value.sequence)
      ? null
      : (GATES[Number(value.sequence) - 1] ?? null);
  if (
    !PHASES.includes(String(value.phase) as (typeof PHASES)[number]) ||
    (value.gate !== null && typeof value.gate !== "string") ||
    (value.sequence !== null &&
      (!Number.isSafeInteger(value.sequence) ||
        Number(value.sequence) < 1 ||
        Number(value.sequence) > 13)) ||
    (value.sequence === null) !== (value.gate === null) ||
    (value.gate !== null && value.gate !== expectedGate)
  ) {
    throw new Error("preformal fault phase differs");
  }

  const teacherPlan = validateIdentity(
    value.teacher_plan,
    context.teacherPlan.path,
    context.teacherPlan.schema,
    "preformal fault teacher plan",
  );
  if (v1r11CanonicalJson(teacherPlan) !== v1r11CanonicalJson(context.teacherPlan)) {
    throw new Error("preformal fault teacher plan binding differs");
  }
  const receiptPattern = new RegExp(
    `^${path
      .join(context.authorityDirectory.path, "preformal-gates")
      .replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}/(?:0[1-9]|1[0-3])-[a-z0-9-]+\\.receipt\\.json$`,
    "u",
  );
  const available = Object.freeze([
    validateNullableIdentity(
      value.ledger_prefix,
      path.join(context.authorityDirectory.path, "preformal-authority-ledger.jsonl"),
      "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11",
      "preformal fault ledger prefix",
    ),
    validateNullableIdentity(
      value.last_gate_receipt,
      receiptPattern,
      "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11",
      "preformal fault last gate receipt",
    ),
    validateNullableIdentity(
      value.engine_gate_verified_receipt,
      path.join(
        context.authorityDirectory.path,
        "preformal-engine-gate-authority-verified-receipt.json",
      ),
      "shogi-halfkp81-depth18-yaneura-only-preformal-engine-gate-authority-verified-receipt-v1r11",
      "preformal fault engine gate receipt",
    ),
    validateNullableIdentity(
      value.launchagent_authority,
      path.join(context.authorityDirectory.path, "launchagent-authority-evidence.json"),
      "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11",
      "preformal fault LaunchAgent authority",
    ),
  ]);
  for (const [index, availableIdentity] of available.entries()) {
    if (availableIdentity !== null) {
      await readV1R11HeldIdentity(
        availableIdentity,
        availableIdentity.schema,
        `preformal fault available prefix ${index + 1}`,
      );
    }
  }

  const cleanupIdentity = validateIdentity(
    value.process_cleanup_evidence,
    path.join(
      context.authorityDirectory.path,
      "preformal-process-cleanup-evidence.json",
    ),
    CLEANUP_SCHEMA,
    "preformal fault process cleanup evidence",
  );
  const cleanupRaw = await readV1R11HeldIdentity(
    cleanupIdentity,
    CLEANUP_SCHEMA,
    "preformal fault process cleanup evidence",
  );
  const cleanupValue = parseV1R11CanonicalObject(
    cleanupRaw,
    "preformal fault process cleanup evidence",
  );
  const recomputed =
    validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
      cleanupValue,
      context.processCleanupValidationContext,
    );
  const summary = validateSummary(value.process_cleanup);
  if (v1r11CanonicalJson(recomputed) !== v1r11CanonicalJson(summary)) {
    throw new Error("preformal fault process cleanup summary binding differs");
  }

  const error = object(value.error, "fault error");
  exactKeys(error, ["kind", "message", "exit_code", "signal"], "fault error");
  if (
    typeof error.kind !== "string" ||
    error.kind.length < 1 ||
    typeof error.message !== "string" ||
    error.message.length < 1 ||
    (error.exit_code !== null && !Number.isSafeInteger(error.exit_code)) ||
    (error.signal !== null && typeof error.signal !== "string") ||
    typeof value.faulted_at_utc !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
      value.faulted_at_utc,
    ) ||
    new Date(value.faulted_at_utc).toISOString() !== value.faulted_at_utc
  ) {
    throw new Error("preformal fault details differ");
  }

  const expectedProducer = buildHalfkp81V1R11RecursiveProducerIdentity(
    context.repositoryRoot,
    context.sourceRevision,
    "ml/run-halfkp81-depth18-v1r11-preformal-orchestrator.ts",
    { requireTrackedRevision },
  );
  if (v1r11CanonicalJson(value.producer) !== v1r11CanonicalJson(expectedProducer)) {
    throw new Error("preformal fault outer orchestrator producer closure differs");
  }
  return Object.freeze(value);
}

export async function verifyHalfkp81V1R11PreformalTerminalFault(
  identity: Readonly<V1R11AuthorityFileIdentity>,
  context: Readonly<Halfkp81V1R11PreformalFaultVerificationContext>,
): Promise<Readonly<Record<string, unknown>>> {
  return verifyHalfkp81V1R11PreformalTerminalFaultCore(identity, context, true);
}

/** Test-only source seam. Production requires a clean tracked recursive closure. */
export async function verifyHalfkp81V1R11PreformalTerminalFaultForTests(
  identity: Readonly<V1R11AuthorityFileIdentity>,
  context: Readonly<Halfkp81V1R11PreformalFaultVerificationContext>,
): Promise<Readonly<Record<string, unknown>>> {
  return verifyHalfkp81V1R11PreformalTerminalFaultCore(identity, context, false);
}
