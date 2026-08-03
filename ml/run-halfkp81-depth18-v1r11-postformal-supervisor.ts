import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  assertV1R11AuthorityDirectory,
  publishV1R11CreateOnlyBytes,
  readV1R11HeldIdentity,
  v1r11CanonicalJson,
  v1r11CanonicalLine,
  type V1R11AuthorityDirectoryIdentity,
  type V1R11AuthorityFileIdentity,
} from "./halfkp81-depth18-v1r11-authority-io";
import {
  buildHalfkp81Depth18V1R11EnvironmentFaultIntentForTests,
  buildHalfkp81Depth18V1R11FrozenEnvironmentFaultForTests,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_ENVIRONMENT_FAULT_INTENT_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_FAULT_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_LEDGER_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_SCHEMA,
} from "./halfkp81-depth18-teacher-runner";
import {
  produceHalfkp81Depth18V1R11ProcessCleanupEvidence,
  validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests,
  type Halfkp81V1R11CleanupFixedRoleCommand,
  type Halfkp81V1R11CleanupRunnerIdentity,
  type Halfkp81V1R11ProcessCleanupEvidence,
  type Halfkp81V1R11ProcessCleanupValidationContext,
} from "./produce-halfkp81-depth18-v1r11-process-cleanup-evidence";
import {
  verifyAndPublishHalfkp81Depth18TeacherArtifacts,
  verifyHalfkp81Depth18V1R11EnvironmentFaultArtifacts,
} from "./halfkp81-depth18-teacher-artifact-validation";

const POWER_ENTRY_DOMAIN =
  "shogi-halfkp81-depth18-power-continuity-entry-v1r11\0";
const CLEANUP_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-process-cleanup-evidence-v1r11";
const TECHNICAL_STOP_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-post-formal-technical-unverified-stop-v1r11";
const POWER_ENTRY_FIELDS = Object.freeze([
  "schema",
  "status",
  "entry_kind",
  "timestamp_utc",
  "teacher_plan",
  "source_revision",
  "run_fingerprint",
  "launchagent_authority_evidence",
  "preformal_authority_verified_receipt",
  "observation",
  "environment_fault",
  "previous_entry_sha256",
  "entry_sha256",
] as const);
const POWER_RECEIPT_FIELDS = Object.freeze([
  "schema",
  "status",
  "teacher_plan",
  "source_revision",
  "run_fingerprint",
  "power_ledger",
  "admission_entry",
  "final_entry",
  "launchagent_authority_evidence",
  "preformal_authority_verified_receipt",
  "pmset_start_anchor",
  "pmset_end_anchor",
  "environment_fault_preimage_sha256",
  "producer",
] as const);
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const FORMAL_RUN_INTENT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-formal-run-intent-v2" as const;
const FORMAL_RUN_INTENT_DOMAIN =
  "shogi-halfkp81-depth18-yaneura-only-formal-run-intent-v2\0" as const;

type JsonObject = Readonly<Record<string, unknown>>;

interface PostFormalIntentIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly schema: string;
  readonly rows?: number;
}

export interface Halfkp81V1R11PostFormalRunIntent {
  readonly teacherPlan: Readonly<PostFormalIntentIdentity>;
  readonly selectionJsonl: Readonly<PostFormalIntentIdentity>;
  readonly selectionManifest: Readonly<PostFormalIntentIdentity>;
  readonly sourceRevision: string;
  readonly engine: Readonly<{
    binary: Readonly<PostFormalIntentIdentity>;
    evalFile: Readonly<PostFormalIntentIdentity>;
    receipt: Readonly<PostFormalIntentIdentity>;
  }>;
  readonly teacherContract: Readonly<Record<string, unknown>>;
  readonly candidateContract: Readonly<Record<string, unknown>>;
  readonly plannedFinalDescriptor: Readonly<PostFormalIntentIdentity>;
}

export interface Halfkp81V1R11PostFormalContext {
  readonly repositoryRoot: string;
  readonly formalDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
  readonly teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
  readonly sourceRevision: string;
  readonly runFingerprint: string;
  readonly formalRunIntent: Readonly<Halfkp81V1R11PostFormalRunIntent>;
  readonly launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity>;
  readonly preformalAuthority: Readonly<V1R11AuthorityFileIdentity>;
  readonly launchagent: Readonly<{
    label: string;
    plistSnapshot: Readonly<V1R11AuthorityFileIdentity>;
  }>;
  readonly runnerIdentity: Readonly<Halfkp81V1R11CleanupRunnerIdentity>;
  readonly fixedRoles: Readonly<{
    powerGuardian: Readonly<Halfkp81V1R11CleanupFixedRoleCommand>;
    stageBSupervisor: Readonly<Halfkp81V1R11CleanupFixedRoleCommand>;
    yaneuraouEngine: Readonly<Halfkp81V1R11CleanupFixedRoleCommand>;
  }>;
}

export interface Halfkp81V1R11ObservedRunnerTerminal {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly runnerAndServiceObservedStopped: true;
}

interface CleanupResult {
  readonly identity: Readonly<V1R11AuthorityFileIdentity>;
  readonly evidence: Readonly<Halfkp81V1R11ProcessCleanupEvidence>;
  readonly recomputedProcessCleanup: Readonly<
    Halfkp81V1R11ProcessCleanupEvidence["process_cleanup"]
  >;
  readonly validationContext: Readonly<Halfkp81V1R11ProcessCleanupValidationContext>;
}

export interface Halfkp81V1R11PostFormalDependencies {
  readonly observeRunnerTerminal: () => Promise<
    Readonly<Halfkp81V1R11ObservedRunnerTerminal>
  >;
  readonly produceCleanup: () => Promise<Readonly<CleanupResult>>;
  readonly verifySuccessArtifacts: () => Promise<
    Readonly<V1R11AuthorityFileIdentity>
  >;
  readonly verifyEnvironmentArtifacts: (
    terminalFault: Readonly<V1R11AuthorityFileIdentity>,
  ) => Promise<Readonly<Record<string, unknown>>>;
  readonly now: () => string;
}

export type Halfkp81V1R11PostFormalResult =
  | Readonly<{
      status: "success-cleaned-and-artifacts-verified";
      cleanup: Readonly<V1R11AuthorityFileIdentity>;
      verifiedArtifacts: Readonly<V1R11AuthorityFileIdentity>;
    }>
  | Readonly<{
      status: "environment-fault-cleaned-and-verified-family-closed";
      cleanup: Readonly<V1R11AuthorityFileIdentity>;
      terminalFault: Readonly<V1R11AuthorityFileIdentity>;
    }>
  | Readonly<{
      status: "technical-unverified-stop-family-closed";
      cleanup: Readonly<V1R11AuthorityFileIdentity>;
      technicalStop: Readonly<V1R11AuthorityFileIdentity>;
    }>;

function sha256(raw: Uint8Array | string): string {
  return createHash("sha256").update(raw).digest("hex");
}

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

function same(left: unknown, right: unknown): boolean {
  return v1r11CanonicalJson(left) === v1r11CanonicalJson(right);
}

function postFormalIntentIdentity(
  value: unknown,
  label: string,
  schema?: string,
  rowsRequired = false,
): Readonly<PostFormalIntentIdentity> {
  const row = object(value, label);
  exactKeys(
    row,
    rowsRequired
      ? ["path", "bytes", "sha256", "schema", "rows"]
      : ["path", "bytes", "sha256", "schema"],
    label,
  );
  if (
    typeof row.path !== "string" ||
    !path.isAbsolute(row.path) ||
    path.normalize(row.path) !== row.path ||
    !Number.isSafeInteger(row.bytes) ||
    Number(row.bytes) < 1 ||
    typeof row.sha256 !== "string" ||
    !SHA256_RE.test(row.sha256) ||
    typeof row.schema !== "string" ||
    row.schema.length < 1 ||
    (schema !== undefined && row.schema !== schema) ||
    (rowsRequired &&
      (!Number.isSafeInteger(row.rows) || Number(row.rows) < 1))
  ) {
    throw new Error(`${label} differs`);
  }
  return Object.freeze({
    path: row.path,
    bytes: Number(row.bytes),
    sha256: row.sha256,
    schema: row.schema,
    ...(rowsRequired ? { rows: Number(row.rows) } : {}),
  });
}

function postFormalIntentContract(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  const row = object(value, label);
  const forbidden = (candidate: unknown): boolean => {
    if (Array.isArray(candidate)) return candidate.some(forbidden);
    if (candidate !== null && typeof candidate === "object") {
      return Object.entries(candidate as Readonly<Record<string, unknown>>).some(
        ([key, child]) =>
          /(?:run_fingerprint|launchagent_authority|launch_agent_authority|launchagent_evidence|launch_agent_evidence|preformal_authority|formal_authority|raw_receipt|verified_receipt|teacher_receipt|artifact_receipt|authority_receipt|power_continuity|process_cleanup|terminal_fault)/u.test(
            key,
          ) || forbidden(child),
      );
    }
    return false;
  };
  if (Object.keys(row).length < 1 || forbidden(row)) {
    throw new Error(`${label} differs or contains a circular authority input`);
  }
  v1r11CanonicalJson(row);
  return Object.freeze({ ...row });
}

/** Post-formal verifier recomputes v2 without producer semantic helpers. */
function independentlyComputePostFormalFingerprint(input: unknown): string {
  const root = object(input, "post-formal formal-run-intent-v2 input");
  exactKeys(
    root,
    [
      "teacherPlan",
      "selectionJsonl",
      "selectionManifest",
      "sourceRevision",
      "engine",
      "teacherContract",
      "candidateContract",
      "plannedFinalDescriptor",
    ],
    "post-formal formal-run-intent-v2 input",
  );
  const engine = object(root.engine, "post-formal formal engine");
  exactKeys(
    engine,
    ["binary", "evalFile", "receipt"],
    "post-formal formal engine",
  );
  if (typeof root.sourceRevision !== "string" || !REVISION_RE.test(root.sourceRevision)) {
    throw new Error("post-formal formal source revision differs");
  }
  const payload = Object.freeze({
    schema: FORMAL_RUN_INTENT_SCHEMA,
    teacher_plan: postFormalIntentIdentity(
      root.teacherPlan,
      "post-formal teacher plan",
    ),
    selection_jsonl: postFormalIntentIdentity(
      root.selectionJsonl,
      "post-formal selection JSONL",
      undefined,
      true,
    ),
    selection_manifest: postFormalIntentIdentity(
      root.selectionManifest,
      "post-formal selection manifest",
    ),
    source_revision: root.sourceRevision,
    engine: Object.freeze({
      binary: postFormalIntentIdentity(
        engine.binary,
        "post-formal engine binary",
        "application/x-mach-o-executable-exact-bytes",
      ),
      eval_file: postFormalIntentIdentity(
        engine.evalFile,
        "post-formal eval file",
        "application/octet-stream-exact-bytes",
      ),
      receipt: postFormalIntentIdentity(
        engine.receipt,
        "post-formal engine receipt",
      ),
    }),
    teacher: postFormalIntentContract(
      root.teacherContract,
      "post-formal teacher contract",
    ),
    candidate_generation: postFormalIntentContract(
      root.candidateContract,
      "post-formal candidate contract",
    ),
    planned_final_launchagent_descriptor: postFormalIntentIdentity(
      root.plannedFinalDescriptor,
      "post-formal planned descriptor",
      "application/x-apple-aspen-config-exact-bytes",
    ),
  });
  return sha256(
    `${FORMAL_RUN_INTENT_DOMAIN}${v1r11CanonicalJson(payload)}`,
  );
}

export function independentlyComputeHalfkp81V1R11PostFormalFingerprintForTests(
  input: unknown,
): string {
  return independentlyComputePostFormalFingerprint(input);
}

function canonicalUtc(value: string, label: string): void {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} differs`);
  }
}

async function heldPrivateFile(
  filePath: string,
  schema: string,
  label: string,
): Promise<Readonly<{ identity: V1R11AuthorityFileIdentity; raw: Buffer }>> {
  const before = await fs.promises.lstat(filePath);
  const euid = process.geteuid?.();
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.uid !== euid ||
    (before.mode & 0o7777) !== 0o600 ||
    (await fs.promises.realpath(filePath)) !== filePath
  ) {
    throw new Error(`${label} is not a held private file`);
  }
  const handle = await fs.promises.open(
    filePath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = await handle.stat();
    const raw = await handle.readFile();
    const after = await handle.stat();
    const linked = await fs.promises.lstat(filePath);
    if (
      opened.dev !== before.dev ||
      opened.ino !== before.ino ||
      after.dev !== opened.dev ||
      after.ino !== opened.ino ||
      after.size !== raw.byteLength ||
      linked.dev !== opened.dev ||
      linked.ino !== opened.ino
    ) {
      throw new Error(`${label} changed during held read`);
    }
    return Object.freeze({
      identity: Object.freeze({
        path: filePath,
        bytes: raw.byteLength,
        sha256: sha256(raw),
        schema,
      }),
      raw,
    });
  } finally {
    await handle.close();
  }
}

function parseCanonicalDocument(raw: Buffer, label: string): JsonObject {
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw) || !text.endsWith("\n")) {
    throw new Error(`${label} encoding differs`);
  }
  const parsed = object(JSON.parse(text), label);
  if (!v1r11CanonicalLine(parsed).equals(raw)) {
    throw new Error(`${label} is not canonical`);
  }
  return parsed;
}

function parseCanonicalJsonl(raw: Buffer, label: string): readonly JsonObject[] {
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw) || !text.endsWith("\n")) {
    throw new Error(`${label} encoding differs`);
  }
  return Object.freeze(
    text
      .slice(0, -1)
      .split("\n")
      .map((line, index) => {
        const parsed = object(JSON.parse(line), `${label} row ${index + 1}`);
        if (`${v1r11CanonicalJson(parsed)}\n` !== `${line}\n`) {
          throw new Error(`${label} row ${index + 1} is not canonical`);
        }
        return parsed;
      }),
  );
}

export async function verifyHalfkp81V1R11PostFormalEnvironmentClosureForTests(
  context: Readonly<Halfkp81V1R11PostFormalContext>,
): Promise<
  Readonly<{
    ledger: Readonly<V1R11AuthorityFileIdentity>;
    receipt: Readonly<V1R11AuthorityFileIdentity>;
    fault: Readonly<{ kind: "environment-continuity"; message: string }>;
    intentSha256: string;
  }>
> {
  const ledgerHeld = await heldPrivateFile(
    path.join(context.formalDirectory.path, "power-continuity.jsonl"),
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_LEDGER_SCHEMA,
    "post-formal power ledger",
  );
  const rows = parseCanonicalJsonl(ledgerHeld.raw, "post-formal power ledger");
  if (rows.length < 2) throw new Error("post-formal power ledger is incomplete");
  let previous: string | null = null;
  for (const [index, row] of rows.entries()) {
    exactKeys(row, POWER_ENTRY_FIELDS, `post-formal power row ${index + 1}`);
    const { entry_sha256: claimed, ...preimage } = row;
    const digest = sha256(`${POWER_ENTRY_DOMAIN}${v1r11CanonicalJson(preimage)}`);
    const last = index === rows.length - 1;
    if (
      row.schema !==
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_LEDGER_SCHEMA ||
      row.source_revision !== context.sourceRevision ||
      row.run_fingerprint !== context.runFingerprint ||
      row.previous_entry_sha256 !== previous ||
      claimed !== digest ||
      !same(row.teacher_plan, context.teacherPlan) ||
      !same(row.launchagent_authority_evidence, context.launchAgentAuthority) ||
      !same(row.preformal_authority_verified_receipt, context.preformalAuthority) ||
      (index === 0 &&
        (row.status !== "admission-pass" || row.entry_kind !== "admission")) ||
      (!last &&
        index > 0 &&
        (row.status !== "sample-pass" || row.entry_kind !== "sample")) ||
      (last &&
        (row.status !== "environment-fault" ||
          row.entry_kind !== "environment-fault")) ||
      (last ? row.environment_fault === null : row.environment_fault !== null)
    ) {
      throw new Error(`post-formal power row ${index + 1} differs`);
    }
    previous = digest;
  }
  const finalRow = rows.at(-1)!;
  const closure = object(finalRow.environment_fault, "post-formal fault closure");
  exactKeys(
    closure,
    ["kind", "message", "intent_sha256"],
    "post-formal fault closure",
  );
  if (
    closure.kind !== "environment-continuity" ||
    typeof closure.message !== "string" ||
    closure.message.length < 1 ||
    typeof closure.intent_sha256 !== "string" ||
    !SHA256_RE.test(closure.intent_sha256)
  ) {
    throw new Error("post-formal fault closure differs");
  }
  const fault = Object.freeze({
    kind: "environment-continuity" as const,
    message: closure.message,
  });
  const intent = buildHalfkp81Depth18V1R11EnvironmentFaultIntentForTests({
    teacherPlan: context.teacherPlan,
    sourceRevision: context.sourceRevision,
    runFingerprint: context.runFingerprint,
    verifiedPreformalAuthority: context.preformalAuthority,
    launchAgentAuthority: context.launchAgentAuthority,
    fault,
  });
  if (
    intent.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_ENVIRONMENT_FAULT_INTENT_SCHEMA ||
    sha256(v1r11CanonicalJson(intent)) !== closure.intent_sha256
  ) {
    throw new Error("post-formal environment intent digest differs");
  }
  const receiptHeld = await heldPrivateFile(
    path.join(context.formalDirectory.path, "power-continuity-receipt.json"),
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_SCHEMA,
    "post-formal power receipt",
  );
  const receipt = parseCanonicalDocument(
    receiptHeld.raw,
    "post-formal power receipt",
  );
  exactKeys(receipt, POWER_RECEIPT_FIELDS, "post-formal power receipt");
  if (
    receipt.schema !==
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_SCHEMA ||
    receipt.status !== "environment-fault-closed" ||
    receipt.source_revision !== context.sourceRevision ||
    receipt.run_fingerprint !== context.runFingerprint ||
    !same(receipt.teacher_plan, context.teacherPlan) ||
    !same(receipt.power_ledger, ledgerHeld.identity) ||
    !same(receipt.admission_entry, rows[0]) ||
    !same(receipt.final_entry, finalRow) ||
    !same(receipt.launchagent_authority_evidence, context.launchAgentAuthority) ||
    !same(receipt.preformal_authority_verified_receipt, context.preformalAuthority) ||
    receipt.environment_fault_preimage_sha256 !== closure.intent_sha256
  ) {
    throw new Error("post-formal power receipt cross-binding differs");
  }
  return Object.freeze({
    ledger: ledgerHeld.identity,
    receipt: receiptHeld.identity,
    fault,
    intentSha256: closure.intent_sha256,
  });
}

async function optionalIdentity(
  filePath: string,
  schema: string,
): Promise<Readonly<V1R11AuthorityFileIdentity> | null> {
  try {
    return (await heldPrivateFile(filePath, schema, "partial post-formal artifact"))
      .identity;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function runCore(
  context: Readonly<Halfkp81V1R11PostFormalContext>,
  dependencies: Readonly<Halfkp81V1R11PostFormalDependencies>,
): Promise<Readonly<Halfkp81V1R11PostFormalResult>> {
  await assertV1R11AuthorityDirectory(context.formalDirectory);
  if (
    !REVISION_RE.test(context.sourceRevision) ||
    !SHA256_RE.test(context.runFingerprint) ||
    path.dirname(context.teacherPlan.path) !== context.formalDirectory.path ||
    independentlyComputePostFormalFingerprint(context.formalRunIntent) !==
      context.runFingerprint ||
    context.formalRunIntent.sourceRevision !== context.sourceRevision ||
    !same(context.formalRunIntent.teacherPlan, context.teacherPlan) ||
    !same(
      context.formalRunIntent.plannedFinalDescriptor,
      context.launchagent.plistSnapshot,
    )
  ) {
    throw new Error("post-formal supervisor context differs");
  }
  await readV1R11HeldIdentity(
    context.teacherPlan,
    context.teacherPlan.schema,
    "post-formal teacher plan",
  );
  await readV1R11HeldIdentity(
    context.launchAgentAuthority,
    context.launchAgentAuthority.schema,
    "post-formal LaunchAgent authority",
  );
  await readV1R11HeldIdentity(
    context.preformalAuthority,
    context.preformalAuthority.schema,
    "post-formal preformal authority",
  );
  const plannedDescriptorRaw = await readV1R11HeldIdentity(
    context.launchagent.plistSnapshot,
    context.launchagent.plistSnapshot.schema,
    "post-formal plist snapshot",
  );
  if (/[0-9a-f]{64}/u.test(plannedDescriptorRaw.toString("utf8"))) {
    throw new Error("post-formal planned descriptor contains a fingerprint");
  }
  const outcome = await dependencies.observeRunnerTerminal();
  if (outcome.runnerAndServiceObservedStopped !== true) {
    throw new Error("post-formal runner/service stop was not observed");
  }
  const cleanup = await dependencies.produceCleanup();
  const heldCleanup = await readV1R11HeldIdentity(
    cleanup.identity,
    CLEANUP_SCHEMA,
    "post-formal cleanup evidence",
  );
  const recomputed =
    validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
      JSON.parse(heldCleanup.toString("utf8")),
      cleanup.validationContext,
    );
  if (
    cleanup.validationContext.scope !== "post-formal-environment" ||
    !same(recomputed, cleanup.recomputedProcessCleanup) ||
    !same(recomputed, cleanup.evidence.process_cleanup)
  ) {
    throw new Error("post-formal cleanup independent recomputation differs");
  }
  const terminalFaultPath = path.join(
    context.formalDirectory.path,
    "teacher-terminal-fault.json",
  );
  const technicalStopPath = path.join(
    context.formalDirectory.path,
    "post-formal-technical-unverified-stop.json",
  );
  if (outcome.exitCode === 0 && outcome.signal === null) {
    for (const forbidden of [terminalFaultPath, technicalStopPath]) {
      if (fs.existsSync(forbidden)) {
        throw new Error("successful post-formal runner published a stop artifact");
      }
    }
    const verifiedArtifacts = await dependencies.verifySuccessArtifacts();
    await readV1R11HeldIdentity(
      verifiedArtifacts,
      verifiedArtifacts.schema,
      "post-formal verified artifacts",
    );
    return Object.freeze({
      status: "success-cleaned-and-artifacts-verified" as const,
      cleanup: cleanup.identity,
      verifiedArtifacts,
    });
  }
  let closure:
    | Awaited<ReturnType<typeof verifyHalfkp81V1R11PostFormalEnvironmentClosureForTests>>
    | null = null;
  try {
    closure =
      await verifyHalfkp81V1R11PostFormalEnvironmentClosureForTests(context);
  } catch {
    closure = null;
  }
  if (closure === null) {
    if (fs.existsSync(technicalStopPath)) {
      throw new Error("post-formal technical stop target already exists");
    }
    const observedAtUtc = dependencies.now();
    canonicalUtc(observedAtUtc, "post-formal technical stop time");
    const technical = Object.freeze({
      schema: TECHNICAL_STOP_SCHEMA,
      status: "technical-unverified-stop-family-closed",
      teacher_plan: context.teacherPlan,
      source_revision: context.sourceRevision,
      run_fingerprint: context.runFingerprint,
      preformal_authority_verified_receipt: context.preformalAuthority,
      launchagent_authority_evidence: context.launchAgentAuthority,
      runner_outcome: outcome,
      process_cleanup_evidence: cleanup.identity,
      process_cleanup: recomputed,
      partial_power_artifacts: Object.freeze({
        ledger: await optionalIdentity(
          path.join(context.formalDirectory.path, "power-continuity.jsonl"),
          HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_LEDGER_SCHEMA,
        ),
        receipt: await optionalIdentity(
          path.join(
            context.formalDirectory.path,
            "power-continuity-receipt.json",
          ),
          HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_SCHEMA,
        ),
      }),
      reason:
        "runner-exited-without-independently-verifiable-environment-fault-row-and-receipt",
      observed_at_utc: observedAtUtc,
      authority: Object.freeze({
        may_claim_environment_continuity_fault: false,
        may_resume_same_family: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      }),
    });
    const technicalStop = await publishV1R11CreateOnlyBytes(
      context.formalDirectory,
      technicalStopPath,
      v1r11CanonicalLine(technical),
      TECHNICAL_STOP_SCHEMA,
    );
    return Object.freeze({
      status: "technical-unverified-stop-family-closed" as const,
      cleanup: cleanup.identity,
      technicalStop,
    });
  }
  if (fs.existsSync(terminalFaultPath)) {
    throw new Error("runner attempted outer-owned environment fault publication");
  }
  const faultedAtUtc = dependencies.now();
  canonicalUtc(faultedAtUtc, "post-formal environment fault time");
  const terminal = buildHalfkp81Depth18V1R11FrozenEnvironmentFaultForTests({
    teacherPlan: context.teacherPlan,
    sourceRevision: context.sourceRevision,
    runFingerprint: context.runFingerprint,
    verifiedPreformalAuthority: context.preformalAuthority,
    launchAgentAuthority: context.launchAgentAuthority,
    powerLedger: closure.ledger,
    powerReceipt: closure.receipt,
    faultPreimageSha256: closure.intentSha256,
    fault: closure.fault,
    processCleanupEvidence: cleanup.identity,
    processCleanup: recomputed,
    faultedAtUtc,
  });
  const terminalFault = await publishV1R11CreateOnlyBytes(
    context.formalDirectory,
    terminalFaultPath,
    v1r11CanonicalLine(terminal),
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_FAULT_SCHEMA,
  );
  await dependencies.verifyEnvironmentArtifacts(terminalFault);
  return Object.freeze({
    status: "environment-fault-cleaned-and-verified-family-closed" as const,
    cleanup: cleanup.identity,
    terminalFault,
  });
}

/** No OS launch is performed by this seam. It exercises the exact outer owner. */
export async function runHalfkp81V1R11PostFormalSupervisorForTests(
  context: Readonly<Halfkp81V1R11PostFormalContext>,
  dependencies: Readonly<Halfkp81V1R11PostFormalDependencies>,
): Promise<Readonly<Halfkp81V1R11PostFormalResult>> {
  return runCore(context, dependencies);
}

function productionCommand(argv: readonly string[]): Readonly<{
  exitCode: number;
  stdout: Buffer;
  stderr: Buffer;
}> {
  const result = spawnSync(argv[0]!, argv.slice(1), {
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (
    result.error !== undefined ||
    result.status === null ||
    !Buffer.isBuffer(result.stdout) ||
    !Buffer.isBuffer(result.stderr)
  ) {
    throw result.error ?? new Error("post-formal monitor command did not exit");
  }
  return Object.freeze({
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}

function exactRunnerStillPresent(
  raw: Buffer,
  expected: Readonly<Halfkp81V1R11CleanupRunnerIdentity>,
): boolean {
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw)) {
    throw new Error("post-formal monitor ps encoding differs");
  }
  return text.split("\n").some((line) => {
    const match =
      /^\s*(\d+)\s+(\d+)\s+(\d+)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4})\s+.+$/u.exec(
        line,
      );
    return (
      match !== null &&
      Number(match[1]) === expected.pid &&
      Number(match[3]) === expected.pgid &&
      match[4] === expected.lstart
    );
  });
}

/**
 * Production observation only; it never launches or signals a process. The
 * fixed outer owner calls this after releasing the already authenticated final
 * runner. A stopped-but-loaded LaunchAgent is left intact for the rich cleanup
 * producer to boot out and prove absent.
 */
export async function observeHalfkp81V1R11ProductionRunnerTerminal(
  context: Readonly<Halfkp81V1R11PostFormalContext>,
): Promise<Readonly<Halfkp81V1R11ObservedRunnerTerminal>> {
  const uid = process.geteuid?.();
  if (!Number.isSafeInteger(uid) || Number(uid) < 1) {
    throw new Error("post-formal monitor euid differs");
  }
  const psCommand = [
    "/bin/ps",
    "-ww",
    "-axo",
    "pid=,ppid=,pgid=,lstart=,command=",
  ];
  const service = `gui/${String(uid)}/${context.launchagent.label}`;
  for (;;) {
    const ps = productionCommand(psCommand);
    if (ps.exitCode !== 0 || ps.stderr.byteLength !== 0) {
      throw new Error("post-formal monitor ps failed");
    }
    const launchctl = productionCommand([
      "/bin/launchctl",
      "print",
      service,
    ]);
    const runnerPresent = exactRunnerStillPresent(ps.stdout, context.runnerIdentity);
    if (runnerPresent) {
      if (
        launchctl.exitCode !== 0 ||
        !launchctl.stdout
          .toString("utf8")
          .includes(`\n\tpid = ${String(context.runnerIdentity.pid)}\n`) ||
        !launchctl.stdout.toString("utf8").includes("\n\tstate = running\n")
      ) {
        throw new Error("post-formal live runner/service binding changed");
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 5_000));
      continue;
    }
    if (launchctl.exitCode === 113) {
      return Object.freeze({
        exitCode: null,
        signal: null,
        runnerAndServiceObservedStopped: true as const,
      });
    }
    if (launchctl.exitCode !== 0) {
      throw new Error("post-formal stopped service state is ambiguous");
    }
    const output = launchctl.stdout.toString("utf8");
    if (output.includes("\n\tstate = running\n")) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
      continue;
    }
    const exits = [...output.matchAll(/^\tlast exit code = (\d+)$/gmu)];
    return Object.freeze({
      exitCode:
        exits.length === 1 && exits[0]?.[1] !== undefined
          ? Number(exits[0][1])
          : null,
      signal: null,
      runnerAndServiceObservedStopped: true as const,
    });
  }
}

/**
 * Fixed production post-formal owner. This function assumes the same outer
 * orchestrator retained the context from Stage C; it does not bootstrap a new
 * job and therefore cannot switch runner identity after admission.
 */
export async function runHalfkp81V1R11ProductionPostFormalSupervisor(
  context: Readonly<Halfkp81V1R11PostFormalContext>,
): Promise<Readonly<Halfkp81V1R11PostFormalResult>> {
  const artifactRoot = context.formalDirectory.path;
  const home = fs.realpathSync.native(os.homedir());
  if (
    artifactRoot !==
      path.join(
        home,
        ".codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11",
      )
  ) {
    throw new Error("post-formal production artifact root differs");
  }
  return runCore(context, {
    observeRunnerTerminal: () =>
      observeHalfkp81V1R11ProductionRunnerTerminal(context),
    produceCleanup: () =>
      produceHalfkp81Depth18V1R11ProcessCleanupEvidence({
        scope: "post-formal-environment",
        teacherPlan: context.teacherPlan,
        sourceRevision: context.sourceRevision,
        runFingerprint: context.runFingerprint,
        launchagent: context.launchagent,
        runnerIdentity: context.runnerIdentity,
        runnerNullPhaseBeforeAnyAdmission: false,
        fixedRoles: context.fixedRoles,
      }) as Promise<Readonly<CleanupResult>>,
    verifySuccessArtifacts: async () => {
      await verifyAndPublishHalfkp81Depth18TeacherArtifacts({
        artifactRoot,
        planPath: context.teacherPlan.path,
      });
      return (
        await heldPrivateFile(
          path.join(artifactRoot, "teacher-verified-artifact-receipt.json"),
          "shogi-halfkp81-hard-depth18-teacher-verified-artifact-receipt-v1r11",
          "post-formal verified artifact receipt",
        )
      ).identity;
    },
    verifyEnvironmentArtifacts: () =>
      verifyHalfkp81Depth18V1R11EnvironmentFaultArtifacts({
        artifactRoot,
        planPath: context.teacherPlan.path,
      }),
    now: () => new Date().toISOString(),
  });
}
