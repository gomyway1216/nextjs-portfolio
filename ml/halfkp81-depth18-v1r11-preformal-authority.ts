import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export const HALFKP81_V1R11_PREFORMAL_GATE_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11" as const;
export const HALFKP81_V1R11_PREFORMAL_AUTHORITY_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-receipt-v1r11" as const;
export const HALFKP81_V1R11_PREFORMAL_AUTHORITY_LEDGER_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11" as const;
export const HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-verified-receipt-v1r11" as const;
export const HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11" as const;

export const HALFKP81_V1R11_PREFORMAL_GATES = Object.freeze([
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

export type Halfkp81V1R11PreformalGate =
  (typeof HALFKP81_V1R11_PREFORMAL_GATES)[number];

export interface Halfkp81V1R11FileIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly schema: string;
}

export interface Halfkp81V1R11GateEvidence {
  readonly schema: string;
  readonly status: "pass";
  readonly gate: Halfkp81V1R11PreformalGate;
  readonly teacher_plan: Readonly<Halfkp81V1R11FileIdentity>;
  readonly source_revision: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface Halfkp81V1R11GateReceipt {
  readonly schema: typeof HALFKP81_V1R11_PREFORMAL_GATE_RECEIPT_SCHEMA;
  readonly status: "pass";
  readonly gate: Halfkp81V1R11PreformalGate;
  readonly sequence: number;
  readonly teacher_plan: Readonly<Halfkp81V1R11FileIdentity>;
  readonly source_revision: string;
  readonly previous_gate_receipt_sha256: string | null;
  readonly evidence: Readonly<Halfkp81V1R11FileIdentity>;
  readonly authority: Readonly<{
    may_execute_formal_teacher: false;
    may_train: false;
    may_play_formal_games: false;
    may_write_live_weights: false;
  }>;
}

const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const PRIVATE_FILE_MODE = 0o600;
const AUTHORITY_LEDGER_DIGEST_DOMAIN =
  "shogi-halfkp81-depth18-v1r11-preformal-authority-ledger-entry-v1\0";

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
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("v1r11 preformal value is not canonicalizable");
}

function canonicalLine(value: unknown): Buffer {
  return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
}

function sha256(value: Uint8Array | string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) {
    throw new Error(`${label} keys differ`);
  }
}

function assertInteger(value: unknown, minimum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new Error(`${label} differs`);
  }
  return Number(value);
}

function assertBoolean(value: unknown, expected: boolean, label: string): void {
  if (value !== expected) throw new Error(`${label} differs`);
}

function assertString(value: unknown, expected: string, label: string): void {
  if (value !== expected) throw new Error(`${label} differs`);
}

function assertIsoUtc(value: unknown, label: string): void {
  if (
    typeof value !== "string" ||
    !ISO_UTC_RE.test(value) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} differs`);
  }
}

function expectedEvidenceSchema(gate: Halfkp81V1R11PreformalGate): string {
  return `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-evidence-v1`;
}

function validateIdentity(
  identity: Readonly<Halfkp81V1R11FileIdentity>,
  expectedSchema: string | undefined,
  label: string,
): void {
  exactKeys(
    identity as unknown as Readonly<Record<string, unknown>>,
    ["path", "bytes", "sha256", "schema"],
    label,
  );
  if (
    !path.isAbsolute(identity.path) ||
    path.normalize(identity.path) !== identity.path ||
    !Number.isSafeInteger(identity.bytes) ||
    identity.bytes < 1 ||
    !SHA256_RE.test(identity.sha256) ||
    typeof identity.schema !== "string" ||
    identity.schema.length === 0 ||
    (expectedSchema !== undefined && identity.schema !== expectedSchema)
  ) {
    throw new Error(`${label} differs`);
  }
}

function validateCommonPayload(
  payload: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  gate: Halfkp81V1R11PreformalGate,
): void {
  exactKeys(payload, keys, `${gate} payload`);
}

export function validateHalfkp81V1R11GatePayload(
  gate: Halfkp81V1R11PreformalGate,
  payload: Readonly<Record<string, unknown>>,
): void {
  switch (gate) {
    case "ready-pr": {
      validateCommonPayload(
        payload,
        [
          "pr_number",
          "pr_url",
          "head_revision",
          "merge_revision",
          "base_branch",
          "is_draft",
          "state",
          "observed_at_utc",
        ],
        gate,
      );
      assertInteger(payload.pr_number, 1, `${gate} pr_number`);
      if (
        typeof payload.pr_url !== "string" ||
        !/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/u.test(
          payload.pr_url,
        ) ||
        !REVISION_RE.test(String(payload.head_revision)) ||
        !REVISION_RE.test(String(payload.merge_revision))
      ) {
        throw new Error(`${gate} GitHub identity differs`);
      }
      assertString(payload.base_branch, "main", `${gate} base_branch`);
      assertBoolean(payload.is_draft, false, `${gate} is_draft`);
      assertString(payload.state, "MERGED", `${gate} state`);
      assertIsoUtc(payload.observed_at_utc, `${gate} observed_at_utc`);
      return;
    }
    case "all-required-ci-success": {
      validateCommonPayload(
        payload,
        [
          "pr_number",
          "head_revision",
          "required_checks",
          "successful_checks",
          "failed_checks",
          "pending_checks",
          "conclusion",
          "observed_at_utc",
        ],
        gate,
      );
      assertInteger(payload.pr_number, 1, `${gate} pr_number`);
      if (!REVISION_RE.test(String(payload.head_revision))) {
        throw new Error(`${gate} head_revision differs`);
      }
      const required = assertInteger(
        payload.required_checks,
        1,
        `${gate} required_checks`,
      );
      const successful = assertInteger(
        payload.successful_checks,
        1,
        `${gate} successful_checks`,
      );
      if (required !== successful) throw new Error(`${gate} checks differ`);
      assertInteger(payload.failed_checks, 0, `${gate} failed_checks`);
      assertInteger(payload.pending_checks, 0, `${gate} pending_checks`);
      if (payload.failed_checks !== 0 || payload.pending_checks !== 0) {
        throw new Error(`${gate} checks differ`);
      }
      assertString(payload.conclusion, "success", `${gate} conclusion`);
      assertIsoUtc(payload.observed_at_utc, `${gate} observed_at_utc`);
      return;
    }
    case "regular-merge": {
      validateCommonPayload(
        payload,
        [
          "merge_revision",
          "parent_count",
          "first_parent_revision",
          "second_parent_revision",
          "strategy",
          "base_branch",
        ],
        gate,
      );
      for (const key of [
        "merge_revision",
        "first_parent_revision",
        "second_parent_revision",
      ]) {
        if (!REVISION_RE.test(String(payload[key]))) {
          throw new Error(`${gate} ${key} differs`);
        }
      }
      if (payload.parent_count !== 2)
        throw new Error(`${gate} parent_count differs`);
      assertString(payload.strategy, "merge-commit", `${gate} strategy`);
      assertString(payload.base_branch, "main", `${gate} base_branch`);
      return;
    }
    case "clean-main-source-authentication": {
      validateCommonPayload(
        payload,
        [
          "branch",
          "head_revision",
          "main_revision",
          "captured_revision",
          "status_porcelain_bytes",
          "status_porcelain_sha256",
        ],
        gate,
      );
      assertString(payload.branch, "main", `${gate} branch`);
      for (const key of [
        "head_revision",
        "main_revision",
        "captured_revision",
      ]) {
        if (!REVISION_RE.test(String(payload[key]))) {
          throw new Error(`${gate} ${key} differs`);
        }
      }
      if (
        payload.head_revision !== payload.main_revision ||
        payload.head_revision !== payload.captured_revision ||
        payload.status_porcelain_bytes !== 0 ||
        payload.status_porcelain_sha256 !== sha256("")
      ) {
        throw new Error(`${gate} clean source differs`);
      }
      return;
    }
    case "preformal-authority-implementation-tests-pass":
    case "artifact-verifier-implementation-tests-pass":
    case "power-guardian-implementation-tests-pass": {
      validateCommonPayload(
        payload,
        [
          "command",
          "test_files",
          "tests_passed",
          "tests_failed",
          "exit_code",
          "stdout_sha256",
          "stderr_sha256",
        ],
        gate,
      );
      if (
        !Array.isArray(payload.command) ||
        payload.command.length < 3 ||
        payload.command.some((value) => typeof value !== "string") ||
        !Array.isArray(payload.test_files) ||
        payload.test_files.length < 1 ||
        payload.test_files.some((value) => typeof value !== "string") ||
        !SHA256_RE.test(String(payload.stdout_sha256)) ||
        !SHA256_RE.test(String(payload.stderr_sha256))
      ) {
        throw new Error(`${gate} test evidence differs`);
      }
      const expectedFiles =
        gate === "preformal-authority-implementation-tests-pass"
          ? ["tests/unit/ml/halfkp81Depth18V1R11PreformalAuthority.test.ts"]
          : gate === "artifact-verifier-implementation-tests-pass"
            ? ["tests/unit/ml/halfkp81Depth18TeacherArtifactValidation.test.ts"]
            : [
                "tests/unit/ml/halfkp81Depth18V1R11PowerContinuity.test.ts",
                "tests/unit/ml/halfkp81Depth18TeacherRunner.test.ts",
                "tests/unit/ml/halfkp81Depth18OneShotLaunchAgent.test.ts",
              ];
      if (
        canonicalJson(payload.test_files) !== canonicalJson(expectedFiles) ||
        canonicalJson(payload.command) !==
          canonicalJson([
            "npx",
            "vitest",
            "run",
            ...expectedFiles,
            "--reporter=json",
          ])
      ) {
        throw new Error(`${gate} fixed test command differs`);
      }
      assertInteger(payload.tests_passed, 1, `${gate} tests_passed`);
      if (payload.tests_failed !== 0 || payload.exit_code !== 0) {
        throw new Error(`${gate} test result differs`);
      }
      return;
    }
    case "candidate-order-gate": {
      validateCommonPayload(
        payload,
        [
          "parents",
          "normal_fallback_candidate_digest_matches",
          "canonical_publication_order_matches",
          "mismatches",
          "technical_faults",
        ],
        gate,
      );
      assertInteger(payload.parents, 1, `${gate} parents`);
      assertBoolean(
        payload.normal_fallback_candidate_digest_matches,
        true,
        `${gate} digest match`,
      );
      assertBoolean(
        payload.canonical_publication_order_matches,
        true,
        `${gate} order match`,
      );
      if (payload.mismatches !== 0 || payload.technical_faults !== 0) {
        throw new Error(`${gate} result differs`);
      }
      return;
    }
    case "known10-probe": {
      validateCommonPayload(
        payload,
        [
          "parents",
          "moves",
          "exact_depth18_identity_matches",
          "mismatches",
          "technical_faults",
        ],
        gate,
      );
      if (
        payload.parents !== 8 ||
        payload.moves !== 10 ||
        payload.exact_depth18_identity_matches !== 10 ||
        payload.mismatches !== 0 ||
        payload.technical_faults !== 0
      ) {
        throw new Error(`${gate} result differs`);
      }
      return;
    }
    case "pathological-fallback-probe": {
      validateCommonPayload(
        payload,
        [
          "parent_id",
          "normal_partial_rows_published",
          "capped_rows_published",
          "fallback_exact_depth18_matches_hash8192",
          "technical_faults",
        ],
        gate,
      );
      assertString(
        payload.parent_id,
        "sha256:622377e74345bfcbe509b903ae89e37dfec48e493db0331780b5423382d926a1",
        `${gate} parent_id`,
      );
      if (
        payload.normal_partial_rows_published !== 0 ||
        payload.capped_rows_published !== 0 ||
        payload.fallback_exact_depth18_matches_hash8192 !== true ||
        payload.technical_faults !== 0
      ) {
        throw new Error(`${gate} result differs`);
      }
      return;
    }
    case "mixed-load-gate": {
      validateCommonPayload(
        payload,
        [
          "normal_engines",
          "normal_hash_mib_each",
          "fallback_engines",
          "fallback_hash_mib_each",
          "maximum_normal_active",
          "maximum_fallback_active",
          "technical_faults",
        ],
        gate,
      );
      if (
        payload.normal_engines !== 8 ||
        payload.normal_hash_mib_each !== 512 ||
        payload.fallback_engines !== 2 ||
        payload.fallback_hash_mib_each !== 8_192 ||
        assertInteger(
          payload.maximum_normal_active,
          1,
          `${gate} normal active`,
        ) > 8 ||
        assertInteger(
          payload.maximum_fallback_active,
          1,
          `${gate} fallback active`,
        ) > 2 ||
        payload.technical_faults !== 0
      ) {
        throw new Error(`${gate} result differs`);
      }
      return;
    }
    case "formal-like-512": {
      validateCommonPayload(
        payload,
        [
          "parents",
          "completed_parents",
          "technical_faults",
          "teacher_contract_equal_formal",
          "power_contract_equal_formal",
          "artifact_verifier_status",
        ],
        gate,
      );
      if (
        payload.parents !== 512 ||
        payload.completed_parents !== 512 ||
        payload.technical_faults !== 0 ||
        payload.teacher_contract_equal_formal !== true ||
        payload.power_contract_equal_formal !== true ||
        payload.artifact_verifier_status !== "pass"
      ) {
        throw new Error(`${gate} result differs`);
      }
      return;
    }
    case "ac-power-start-admission-pass": {
      validateCommonPayload(
        payload,
        [
          "power_source",
          "battery_percentage",
          "required_assertions",
          "assertion_owner_matches_caffeinate_pid",
          "launchd_authority_status",
          "launchagent_authority",
          "observed_at_utc",
        ],
        gate,
      );
      if (
        payload.power_source !== "AC Power" ||
        assertInteger(payload.battery_percentage, 80, `${gate} battery`) >
          100 ||
        canonicalJson(payload.required_assertions) !==
          canonicalJson([
            "PreventSystemSleep",
            "PreventUserIdleSystemSleep",
            "PreventUserIdleDisplaySleep",
          ]) ||
        payload.assertion_owner_matches_caffeinate_pid !== true ||
        payload.launchd_authority_status !== "pass"
      ) {
        throw new Error(`${gate} result differs`);
      }
      validateIdentity(
        payload.launchagent_authority as Readonly<Halfkp81V1R11FileIdentity>,
        HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
        `${gate} LaunchAgent authority identity`,
      );
      assertIsoUtc(payload.observed_at_utc, `${gate} observed_at_utc`);
    }
  }
}

export function validateHalfkp81V1R11GateEvidence(
  evidence: Readonly<Halfkp81V1R11GateEvidence>,
  context: Readonly<{
    gate: Halfkp81V1R11PreformalGate;
    teacherPlan: Readonly<Halfkp81V1R11FileIdentity>;
    sourceRevision: string;
  }>,
): void {
  exactKeys(
    evidence as unknown as Readonly<Record<string, unknown>>,
    ["schema", "status", "gate", "teacher_plan", "source_revision", "payload"],
    `${context.gate} evidence`,
  );
  if (
    evidence.schema !== expectedEvidenceSchema(context.gate) ||
    evidence.status !== "pass" ||
    evidence.gate !== context.gate ||
    canonicalJson(evidence.teacher_plan) !==
      canonicalJson(context.teacherPlan) ||
    evidence.source_revision !== context.sourceRevision
  ) {
    throw new Error(`${context.gate} evidence binding differs`);
  }
  validateHalfkp81V1R11GatePayload(context.gate, evidence.payload);
}

export function validateHalfkp81V1R11GateReceipt(
  receipt: Readonly<Halfkp81V1R11GateReceipt>,
  context: Readonly<{
    gate: Halfkp81V1R11PreformalGate;
    sequence: number;
    teacherPlan: Readonly<Halfkp81V1R11FileIdentity>;
    sourceRevision: string;
    previousReceiptSha256: string | null;
  }>,
): void {
  exactKeys(
    receipt as unknown as Readonly<Record<string, unknown>>,
    [
      "schema",
      "status",
      "gate",
      "sequence",
      "teacher_plan",
      "source_revision",
      "previous_gate_receipt_sha256",
      "evidence",
      "authority",
    ],
    `${context.gate} receipt`,
  );
  if (
    receipt.schema !== HALFKP81_V1R11_PREFORMAL_GATE_RECEIPT_SCHEMA ||
    receipt.status !== "pass" ||
    receipt.gate !== context.gate ||
    receipt.sequence !== context.sequence ||
    canonicalJson(receipt.teacher_plan) !==
      canonicalJson(context.teacherPlan) ||
    receipt.source_revision !== context.sourceRevision ||
    receipt.previous_gate_receipt_sha256 !== context.previousReceiptSha256 ||
    canonicalJson(receipt.authority) !==
      canonicalJson({
        may_execute_formal_teacher: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      })
  ) {
    throw new Error(`${context.gate} receipt binding differs`);
  }
  validateIdentity(
    receipt.evidence,
    expectedEvidenceSchema(context.gate),
    `${context.gate} evidence identity`,
  );
}

async function readStable(filePath: string, label: string): Promise<Buffer> {
  const beforePath = await fs.promises.lstat(filePath);
  const euid = process.geteuid?.();
  if (
    !beforePath.isFile() ||
    beforePath.isSymbolicLink() ||
    beforePath.nlink !== 1 ||
    !Number.isSafeInteger(euid) ||
    beforePath.uid !== euid ||
    (beforePath.mode & 0o7777) !== PRIVATE_FILE_MODE ||
    (await fs.promises.realpath(filePath)) !== filePath
  ) {
    throw new Error(`${label} is not an owned private real single-link file`);
  }
  const handle = await fs.promises.open(
    filePath,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = await handle.stat();
    const first = Buffer.alloc(before.size);
    const second = Buffer.alloc(before.size);
    const firstRead = await handle.read(first, 0, first.length, 0);
    const middle = await handle.stat();
    const secondRead = await handle.read(second, 0, second.length, 0);
    const after = await handle.stat();
    if (
      firstRead.bytesRead !== first.length ||
      secondRead.bytesRead !== second.length ||
      !first.equals(second) ||
      [before, middle, after].some(
        (value) =>
          value.dev !== before.dev ||
          value.ino !== before.ino ||
          value.size !== before.size ||
          value.mtimeMs !== before.mtimeMs ||
          value.ctimeMs !== before.ctimeMs,
      )
    ) {
      throw new Error(`${label} changed during held read`);
    }
    return first;
  } finally {
    await handle.close();
  }
}

async function validatePrivateNamespace(
  directory: string,
  label: string,
): Promise<void> {
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory) {
    throw new Error(`${label} path differs`);
  }
  const metadata = await fs.promises.lstat(directory);
  const euid = process.geteuid?.();
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    !Number.isSafeInteger(euid) ||
    metadata.uid !== euid ||
    (metadata.mode & 0o7777) !== 0o700 ||
    (await fs.promises.realpath(directory)) !== directory
  ) {
    throw new Error(`${label} is not an owned private real directory`);
  }
}

async function authenticateIdentity(
  identity: Readonly<Halfkp81V1R11FileIdentity>,
  expectedSchema: string | undefined,
  label: string,
): Promise<Buffer> {
  validateIdentity(identity, expectedSchema, label);
  const raw = await readStable(identity.path, label);
  if (raw.byteLength !== identity.bytes || sha256(raw) !== identity.sha256) {
    throw new Error(`${label} identity differs`);
  }
  return raw;
}

function parseCanonical(
  raw: Buffer,
  label: string,
): Readonly<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error(`${label} is not JSON`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} is not one object`);
  }
  if (!canonicalLine(parsed).equals(raw)) {
    throw new Error(`${label} is not canonical JSON with one LF`);
  }
  return parsed as Readonly<Record<string, unknown>>;
}

async function publishCreateOnly(
  filePath: string,
  value: unknown,
  schema: string,
): Promise<Readonly<Halfkp81V1R11FileIdentity>> {
  return publishCreateOnlyBytes(filePath, canonicalLine(value), schema);
}

async function publishCreateOnlyBytes(
  filePath: string,
  bytes: Buffer,
  schema: string,
): Promise<Readonly<Halfkp81V1R11FileIdentity>> {
  if (!path.isAbsolute(filePath) || path.normalize(filePath) !== filePath) {
    throw new Error("v1r11 preformal output path differs");
  }
  const handle = await fs.promises.open(
    filePath,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
    PRIVATE_FILE_MODE,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const metadata = await fs.promises.lstat(filePath);
  if ((metadata.mode & 0o7777) !== PRIVATE_FILE_MODE || metadata.nlink !== 1) {
    throw new Error("v1r11 preformal create-only output mode differs");
  }
  return Object.freeze({
    path: filePath,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    schema,
  });
}

export async function publishHalfkp81V1R11GateEvidenceAndReceipt(
  request: Readonly<{
    gate: Halfkp81V1R11PreformalGate;
    sequence: number;
    teacherPlan: Readonly<Halfkp81V1R11FileIdentity>;
    sourceRevision: string;
    previousReceiptSha256: string | null;
    payload: Readonly<Record<string, unknown>>;
    evidencePath: string;
    receiptPath: string;
  }>,
): Promise<
  Readonly<{
    evidence: Readonly<Halfkp81V1R11FileIdentity>;
    receipt: Readonly<Halfkp81V1R11FileIdentity>;
  }>
> {
  const expectedGate = HALFKP81_V1R11_PREFORMAL_GATES[request.sequence - 1];
  if (
    request.gate !== expectedGate ||
    !REVISION_RE.test(request.sourceRevision) ||
    (request.sequence === 1) !== (request.previousReceiptSha256 === null) ||
    (request.previousReceiptSha256 !== null &&
      !SHA256_RE.test(request.previousReceiptSha256))
  ) {
    throw new Error("v1r11 preformal gate publication order differs");
  }
  const namespace = path.dirname(request.evidencePath);
  const prefix = String(request.sequence).padStart(2, "0");
  if (
    path.dirname(request.receiptPath) !== namespace ||
    path.basename(request.evidencePath) !==
      `${prefix}-${request.gate}.evidence.json` ||
    path.basename(request.receiptPath) !==
      `${prefix}-${request.gate}.receipt.json`
  ) {
    throw new Error("v1r11 preformal gate output namespace differs");
  }
  await validatePrivateNamespace(namespace, "v1r11 preformal namespace");
  await authenticateIdentity(
    request.teacherPlan,
    undefined,
    "v1r11 teacher plan identity",
  );
  validateHalfkp81V1R11GatePayload(request.gate, request.payload);
  const evidenceValue: Halfkp81V1R11GateEvidence = Object.freeze({
    schema: expectedEvidenceSchema(request.gate),
    status: "pass",
    gate: request.gate,
    teacher_plan: request.teacherPlan,
    source_revision: request.sourceRevision,
    payload: request.payload,
  });
  const evidence = await publishCreateOnly(
    request.evidencePath,
    evidenceValue,
    evidenceValue.schema,
  );
  const receiptValue: Halfkp81V1R11GateReceipt = Object.freeze({
    schema: HALFKP81_V1R11_PREFORMAL_GATE_RECEIPT_SCHEMA,
    status: "pass",
    gate: request.gate,
    sequence: request.sequence,
    teacher_plan: request.teacherPlan,
    source_revision: request.sourceRevision,
    previous_gate_receipt_sha256: request.previousReceiptSha256,
    evidence,
    authority: Object.freeze({
      may_execute_formal_teacher: false,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    }),
  });
  const receipt = await publishCreateOnly(
    request.receiptPath,
    receiptValue,
    HALFKP81_V1R11_PREFORMAL_GATE_RECEIPT_SCHEMA,
  );
  return Object.freeze({ evidence, receipt });
}

export async function verifyHalfkp81V1R11GateReceiptFiles(
  identity: Readonly<Halfkp81V1R11FileIdentity>,
  context: Readonly<{
    gate: Halfkp81V1R11PreformalGate;
    sequence: number;
    teacherPlan: Readonly<Halfkp81V1R11FileIdentity>;
    sourceRevision: string;
    previousReceiptSha256: string | null;
  }>,
): Promise<
  Readonly<{
    receipt: Readonly<Halfkp81V1R11GateReceipt>;
    evidence: Readonly<Halfkp81V1R11GateEvidence>;
  }>
> {
  validateIdentity(
    identity,
    HALFKP81_V1R11_PREFORMAL_GATE_RECEIPT_SCHEMA,
    `${context.gate} receipt identity`,
  );
  const receiptRaw = await readStable(identity.path, `${context.gate} receipt`);
  if (
    receiptRaw.byteLength !== identity.bytes ||
    sha256(receiptRaw) !== identity.sha256
  ) {
    throw new Error(`${context.gate} receipt identity differs`);
  }
  const receipt = parseCanonical(
    receiptRaw,
    `${context.gate} receipt`,
  ) as unknown as Readonly<Halfkp81V1R11GateReceipt>;
  validateHalfkp81V1R11GateReceipt(receipt, context);
  const evidenceRaw = await readStable(
    receipt.evidence.path,
    `${context.gate} evidence`,
  );
  if (
    evidenceRaw.byteLength !== receipt.evidence.bytes ||
    sha256(evidenceRaw) !== receipt.evidence.sha256
  ) {
    throw new Error(`${context.gate} evidence identity differs`);
  }
  const evidence = parseCanonical(
    evidenceRaw,
    `${context.gate} evidence`,
  ) as unknown as Readonly<Halfkp81V1R11GateEvidence>;
  validateHalfkp81V1R11GateEvidence(evidence, context);
  return Object.freeze({ receipt, evidence });
}

async function verifyLaunchAgentAuthorityEvidence(
  identity: Readonly<Halfkp81V1R11FileIdentity>,
  context: Readonly<{
    teacherPlan: Readonly<Halfkp81V1R11FileIdentity>;
    sourceRevision: string;
  }>,
): Promise<void> {
  const raw = await authenticateIdentity(
    identity,
    HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA,
    "v1r11 LaunchAgent authority evidence",
  );
  const evidence = parseCanonical(raw, "v1r11 LaunchAgent authority evidence");
  exactKeys(
    evidence,
    [
      "schema",
      "status",
      "teacher_plan",
      "source_revision",
      "label",
      "runner_pid",
      "program_arguments",
      "working_directory",
      "stdout_path",
      "stderr_path",
      "launchctl_snapshot",
      "plist_snapshot",
      "live_plist_path",
      "authority",
    ],
    "v1r11 LaunchAgent authority evidence",
  );
  if (
    evidence.schema !== HALFKP81_V1R11_LAUNCHAGENT_AUTHORITY_EVIDENCE_SCHEMA ||
    evidence.status !== "pass" ||
    canonicalJson(evidence.teacher_plan) !==
      canonicalJson(context.teacherPlan) ||
    evidence.source_revision !== context.sourceRevision ||
    typeof evidence.label !== "string" ||
    !/^com\.meetyudai\.shogi\.halfkp81-depth18-yaneura-only-v1r11-[0-9a-f]{8}$/u.test(
      evidence.label,
    ) ||
    !Number.isSafeInteger(evidence.runner_pid) ||
    Number(evidence.runner_pid) < 1 ||
    !Array.isArray(evidence.program_arguments) ||
    evidence.program_arguments.length !== 6 ||
    evidence.program_arguments[0] !== "/usr/bin/caffeinate" ||
    evidence.program_arguments[1] !== "-dimsu" ||
    typeof evidence.working_directory !== "string" ||
    !path.isAbsolute(evidence.working_directory) ||
    typeof evidence.stdout_path !== "string" ||
    !path.isAbsolute(evidence.stdout_path) ||
    typeof evidence.stderr_path !== "string" ||
    !path.isAbsolute(evidence.stderr_path) ||
    typeof evidence.live_plist_path !== "string" ||
    !path.isAbsolute(evidence.live_plist_path) ||
    canonicalJson(evidence.authority) !==
      canonicalJson({
        may_execute_formal_teacher: true,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      })
  ) {
    throw new Error("v1r11 LaunchAgent authority evidence semantics differ");
  }
  for (const [field, label] of [
    ["launchctl_snapshot", "v1r11 launchctl snapshot"],
    ["plist_snapshot", "v1r11 plist snapshot"],
  ] as const) {
    const snapshot = evidence[field] as Readonly<Halfkp81V1R11FileIdentity>;
    await authenticateIdentity(snapshot, undefined, label);
  }
}

function authorityLedgerEntry(
  gate: Halfkp81V1R11PreformalGate,
  sequence: number,
  receipt: Readonly<Halfkp81V1R11FileIdentity>,
  previousEntrySha256: string | null,
): Readonly<Record<string, unknown>> {
  const preimage = Object.freeze({
    schema: HALFKP81_V1R11_PREFORMAL_AUTHORITY_LEDGER_SCHEMA,
    status: "pass",
    gate,
    sequence,
    gate_receipt: receipt,
    previous_entry_sha256: previousEntrySha256,
  });
  return Object.freeze({
    ...preimage,
    entry_sha256: sha256(
      `${AUTHORITY_LEDGER_DIGEST_DOMAIN}${canonicalJson(preimage)}`,
    ),
  });
}

/** @deprecated Test-only legacy single-stage contract; never production authority. */
export async function finalizeHalfkp81V1R11LegacyPreformalAuthorityForTests(
  request: Readonly<{
    teacherPlan: Readonly<Halfkp81V1R11FileIdentity>;
    sourceRevision: string;
    requiredOrder: readonly string[];
    gateReceipts: readonly Readonly<Halfkp81V1R11FileIdentity>[];
    launchAgentAuthority: Readonly<Halfkp81V1R11FileIdentity>;
    ledgerPath: string;
    outputPath: string;
  }>,
): Promise<Readonly<Halfkp81V1R11FileIdentity>> {
  if (
    !REVISION_RE.test(request.sourceRevision) ||
    canonicalJson(request.requiredOrder) !==
      canonicalJson([...HALFKP81_V1R11_PREFORMAL_GATES, "formal-teacher"]) ||
    request.gateReceipts.length !== HALFKP81_V1R11_PREFORMAL_GATES.length
  ) {
    throw new Error("v1r11 aggregate preformal order differs");
  }
  const namespace = path.dirname(request.outputPath);
  const gateNamespace = path.join(namespace, "preformal-gates");
  if (
    path.basename(request.outputPath) !== "preformal-authority-receipt.json" ||
    path.dirname(request.ledgerPath) !== namespace ||
    path.basename(request.ledgerPath) !== "preformal-authority-ledger.jsonl" ||
    path.dirname(request.launchAgentAuthority.path) !== namespace ||
    request.gateReceipts.some(
      (identity) => path.dirname(identity.path) !== gateNamespace,
    )
  ) {
    throw new Error("v1r11 aggregate preformal namespace differs");
  }
  await validatePrivateNamespace(namespace, "v1r11 preformal namespace");
  await authenticateIdentity(
    request.teacherPlan,
    undefined,
    "v1r11 teacher plan identity",
  );
  await verifyLaunchAgentAuthorityEvidence(request.launchAgentAuthority, {
    teacherPlan: request.teacherPlan,
    sourceRevision: request.sourceRevision,
  });
  let previous: string | null = null;
  let previousLedgerEntry: string | null = null;
  const gates: Record<string, unknown> = {};
  const ledgerEntries: Readonly<Record<string, unknown>>[] = [];
  const payloads = new Map<
    Halfkp81V1R11PreformalGate,
    Readonly<Record<string, unknown>>
  >();
  for (const [index, gate] of HALFKP81_V1R11_PREFORMAL_GATES.entries()) {
    const identity = request.gateReceipts[index]!;
    const verified = await verifyHalfkp81V1R11GateReceiptFiles(identity, {
      gate,
      sequence: index + 1,
      teacherPlan: request.teacherPlan,
      sourceRevision: request.sourceRevision,
      previousReceiptSha256: previous,
    });
    payloads.set(gate, verified.evidence.payload);
    gates[gate] = Object.freeze({
      sequence: index + 1,
      status: "pass",
      evidence: identity,
    });
    const ledgerEntry = authorityLedgerEntry(
      gate,
      index + 1,
      identity,
      previousLedgerEntry,
    );
    ledgerEntries.push(ledgerEntry);
    previousLedgerEntry = String(ledgerEntry.entry_sha256);
    previous = identity.sha256;
  }
  const ready = payloads.get("ready-pr")!;
  const ci = payloads.get("all-required-ci-success")!;
  const merge = payloads.get("regular-merge")!;
  const clean = payloads.get("clean-main-source-authentication")!;
  if (
    ready.merge_revision !== request.sourceRevision ||
    ci.head_revision !== ready.head_revision ||
    ci.pr_number !== ready.pr_number ||
    merge.merge_revision !== request.sourceRevision ||
    merge.second_parent_revision !== ready.head_revision ||
    clean.head_revision !== request.sourceRevision ||
    clean.main_revision !== request.sourceRevision ||
    clean.captured_revision !== request.sourceRevision
  ) {
    throw new Error("v1r11 preformal cross-gate source binding differs");
  }
  if (
    canonicalJson(
      payloads.get("ac-power-start-admission-pass")!.launchagent_authority,
    ) !== canonicalJson(request.launchAgentAuthority)
  ) {
    throw new Error("v1r11 preformal LaunchAgent gate binding differs");
  }
  const ledgerBytes = Buffer.from(
    ledgerEntries.map((entry) => canonicalJson(entry)).join("\n") + "\n",
    "utf8",
  );
  const ledger = await publishCreateOnlyBytes(
    request.ledgerPath,
    ledgerBytes,
    HALFKP81_V1R11_PREFORMAL_AUTHORITY_LEDGER_SCHEMA,
  );
  return publishCreateOnly(
    request.outputPath,
    Object.freeze({
      schema: HALFKP81_V1R11_PREFORMAL_AUTHORITY_SCHEMA,
      status: "all-required-preformal-gates-passed",
      teacher_plan: request.teacherPlan,
      source_revision: request.sourceRevision,
      required_order: request.requiredOrder,
      launchagent_authority: request.launchAgentAuthority,
      ledger,
      gates,
      authority: Object.freeze({
        may_execute_formal_teacher: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      }),
    }),
    HALFKP81_V1R11_PREFORMAL_AUTHORITY_SCHEMA,
  );
}

/** @deprecated Test-only legacy single-stage contract; never production authority. */
export async function verifyAndPublishHalfkp81V1R11LegacyPreformalAuthorityForTests(
  request: Readonly<{
    rawReceipt: Readonly<Halfkp81V1R11FileIdentity>;
    outputPath: string;
  }>,
): Promise<Readonly<Halfkp81V1R11FileIdentity>> {
  if (
    path.basename(request.outputPath) !==
      "preformal-authority-verified-receipt.json" ||
    path.dirname(request.outputPath) !== path.dirname(request.rawReceipt.path)
  ) {
    throw new Error("v1r11 verified authority namespace differs");
  }
  await validatePrivateNamespace(
    path.dirname(request.outputPath),
    "v1r11 authority namespace",
  );
  const raw = await authenticateIdentity(
    request.rawReceipt,
    HALFKP81_V1R11_PREFORMAL_AUTHORITY_SCHEMA,
    "v1r11 raw preformal authority",
  );
  const value = parseCanonical(raw, "v1r11 raw preformal authority");
  exactKeys(
    value,
    [
      "schema",
      "status",
      "teacher_plan",
      "source_revision",
      "required_order",
      "launchagent_authority",
      "ledger",
      "gates",
      "authority",
    ],
    "v1r11 raw preformal authority",
  );
  const teacherPlan = value.teacher_plan as Readonly<Halfkp81V1R11FileIdentity>;
  const sourceRevision = String(value.source_revision);
  const requiredOrder = value.required_order;
  if (
    value.schema !== HALFKP81_V1R11_PREFORMAL_AUTHORITY_SCHEMA ||
    value.status !== "all-required-preformal-gates-passed" ||
    !REVISION_RE.test(sourceRevision) ||
    canonicalJson(requiredOrder) !==
      canonicalJson([...HALFKP81_V1R11_PREFORMAL_GATES, "formal-teacher"]) ||
    canonicalJson(value.authority) !==
      canonicalJson({
        may_execute_formal_teacher: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      })
  ) {
    throw new Error("v1r11 raw preformal authority semantics differ");
  }
  await authenticateIdentity(teacherPlan, undefined, "v1r11 teacher plan");
  const launchAgentAuthority =
    value.launchagent_authority as Readonly<Halfkp81V1R11FileIdentity>;
  await verifyLaunchAgentAuthorityEvidence(launchAgentAuthority, {
    teacherPlan,
    sourceRevision,
  });
  const ledgerIdentity = value.ledger as Readonly<Halfkp81V1R11FileIdentity>;
  const ledgerRaw = await authenticateIdentity(
    ledgerIdentity,
    HALFKP81_V1R11_PREFORMAL_AUTHORITY_LEDGER_SCHEMA,
    "v1r11 preformal authority ledger",
  );
  const ledgerLines = ledgerRaw
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .map((line, index) => {
      const parsed = parseCanonical(
        Buffer.from(`${line}\n`, "utf8"),
        `v1r11 authority ledger line ${index + 1}`,
      );
      return parsed;
    });
  if (ledgerLines.length !== HALFKP81_V1R11_PREFORMAL_GATES.length) {
    throw new Error("v1r11 preformal authority ledger length differs");
  }
  const gates = value.gates as Readonly<Record<string, unknown>>;
  exactKeys(gates, HALFKP81_V1R11_PREFORMAL_GATES, "v1r11 raw gate map");
  let previousReceipt: string | null = null;
  let previousLedger: string | null = null;
  const payloads = new Map<
    Halfkp81V1R11PreformalGate,
    Readonly<Record<string, unknown>>
  >();
  for (const [index, gate] of HALFKP81_V1R11_PREFORMAL_GATES.entries()) {
    const summary = gates[gate] as Readonly<Record<string, unknown>>;
    exactKeys(summary, ["sequence", "status", "evidence"], `${gate} summary`);
    const identity = summary.evidence as Readonly<Halfkp81V1R11FileIdentity>;
    if (summary.sequence !== index + 1 || summary.status !== "pass") {
      throw new Error(`${gate} aggregate summary differs`);
    }
    const verified = await verifyHalfkp81V1R11GateReceiptFiles(identity, {
      gate,
      sequence: index + 1,
      teacherPlan,
      sourceRevision,
      previousReceiptSha256: previousReceipt,
    });
    payloads.set(gate, verified.evidence.payload);
    const expectedLedger = authorityLedgerEntry(
      gate,
      index + 1,
      identity,
      previousLedger,
    );
    if (canonicalJson(ledgerLines[index]) !== canonicalJson(expectedLedger)) {
      throw new Error(`v1r11 authority ledger line ${index + 1} differs`);
    }
    previousReceipt = identity.sha256;
    previousLedger = String(expectedLedger.entry_sha256);
  }
  const ready = payloads.get("ready-pr")!;
  const ci = payloads.get("all-required-ci-success")!;
  const merge = payloads.get("regular-merge")!;
  const clean = payloads.get("clean-main-source-authentication")!;
  if (
    ready.merge_revision !== sourceRevision ||
    ci.head_revision !== ready.head_revision ||
    ci.pr_number !== ready.pr_number ||
    merge.merge_revision !== sourceRevision ||
    merge.second_parent_revision !== ready.head_revision ||
    clean.head_revision !== sourceRevision ||
    clean.main_revision !== sourceRevision ||
    clean.captured_revision !== sourceRevision
  ) {
    throw new Error("v1r11 independently verified cross-gate binding differs");
  }
  if (
    canonicalJson(
      payloads.get("ac-power-start-admission-pass")!.launchagent_authority,
    ) !== canonicalJson(launchAgentAuthority)
  ) {
    throw new Error(
      "v1r11 independently verified LaunchAgent gate binding differs",
    );
  }
  return publishCreateOnly(
    request.outputPath,
    Object.freeze({
      schema: HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
      status: "independently-verified-all-required-preformal-gates-passed",
      teacher_plan: teacherPlan,
      source_revision: sourceRevision,
      required_order: requiredOrder,
      raw_receipt: request.rawReceipt,
      ledger: ledgerIdentity,
      launchagent_authority: launchAgentAuthority,
      gates,
      verification: Object.freeze({
        held_descriptor_rereads: true,
        exact_gate_semantics_recomputed: true,
        gate_receipt_chain_recomputed: true,
        authority_ledger_chain_recomputed: true,
        launchagent_evidence_recomputed: true,
      }),
      authority: Object.freeze({
        may_execute_formal_teacher: true,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      }),
    }),
    HALFKP81_V1R11_PREFORMAL_VERIFIED_AUTHORITY_SCHEMA,
  );
}
