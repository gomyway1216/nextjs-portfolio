/** Reproducible summary of a completed Floodgate raw acquisition. */

import * as fs from "node:fs";
import * as path from "node:path";

import { FLOODGATE_ACQUISITION_AUDIT_SCHEMA } from "./floodgate-acquisition-runner";
import {
  readExistingFloodgateRawLockManifestFile,
  serializeFloodgateRawLockManifest,
  type FloodgateRawLockManifest,
} from "./floodgate-raw-lock";
import {
  FLOODGATE_RAW_OFFLINE_VERIFICATION_SCHEMA,
  verifyExistingFloodgateRawLock,
  type FloodgateRawOfflineVerificationReport,
} from "./floodgate-raw-lock-verifier";
import { sha256Hex } from "./floodgate-source";
import { compareBytewise } from "./sibling-data";

export const FLOODGATE_ACQUISITION_RESULT_SCHEMA =
  "shogi-floodgate-acquisition-result-v1" as const;

const TOKEN_RE = /^[0-9a-f]{64}$/;
const REVISION_RE = /^[0-9a-f]{40}$/;
const AUDIT_FILE_RE = /^([0-9a-f]{64})\.jsonl$/;
const AUDIT_PHASES = new Set([
  "daily_listings",
  "listing_barrier",
  "daily_ratings",
  "period_inventory",
  "csa",
  "manifest_published",
]);

export interface FloodgateAcquisitionAuthoritativeFacts {
  readonly source_revision: string;
  readonly receipts: {
    readonly total: number;
    readonly listings: number;
    readonly daily_ratings: number;
    readonly period_inventory: number;
    readonly csa: number;
  };
  readonly status_200: number;
  readonly status_404: number;
  readonly response_bytes: number;
  readonly unique_objects: number;
  readonly canonical_games: number;
  readonly duplicate_groups: number;
  readonly duplicate_aliases: number;
  readonly manifest_bytes: number;
  readonly manifest_sha256: string;
  readonly offline_verification_schema: typeof FLOODGATE_RAW_OFFLINE_VERIFICATION_SCHEMA;
}

interface ParsedAuditRecord {
  readonly schema: typeof FLOODGATE_ACQUISITION_AUDIT_SCHEMA;
  readonly run_token: string;
  readonly source_revision: string;
  readonly run_started_at: string;
  readonly recorded_at: string;
  readonly sequence: number;
  readonly phase: string;
  readonly fetched: number;
  readonly reused: number;
  readonly status_200: number;
  readonly status_404: number;
  readonly response_bytes: number;
  readonly first_url: string | null;
  readonly last_url: string | null;
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
}

export interface FloodgateAcquisitionAttemptSummary {
  readonly run_token: string;
  readonly run_started_at: string;
  readonly last_recorded_at: string;
  readonly last_phase: string;
  readonly records: number;
  readonly fetched: number;
  readonly reused_observations: number;
  readonly status_200: number;
  readonly status_404: number;
  readonly response_bytes: number;
  readonly audit_bytes: number;
  readonly audit_sha256: string;
}

export interface FloodgateAcquisitionResultReceipt {
  readonly schema: typeof FLOODGATE_ACQUISITION_RESULT_SCHEMA;
  readonly source_revision: string;
  readonly timing: {
    readonly started_at: string;
    readonly finished_at: string | null;
    readonly elapsed_ms: number | null;
    readonly attempts: number;
    readonly resume_count: number;
    readonly manifest_publish_audit_present: boolean;
  };
  readonly audit: {
    readonly records: number;
    readonly fetched: number;
    readonly reused_observations: number;
    readonly status_200: number;
    readonly status_404: number;
    readonly response_bytes: number;
    readonly authoritative_receipt_delta: number;
    readonly attempts: readonly FloodgateAcquisitionAttemptSummary[];
  };
  readonly authoritative: Omit<
    FloodgateAcquisitionAuthoritativeFacts,
    "source_revision" | "manifest_bytes" | "manifest_sha256"
  >;
  readonly manifest: {
    readonly bytes: number;
    readonly sha256: string;
  };
}

export interface FloodgateAcquisitionResultArtifact {
  readonly receipt: FloodgateAcquisitionResultReceipt;
  readonly canonical_json: string;
  readonly canonical_json_bytes: number;
  readonly canonical_json_sha256: string;
}

function fail(message: string): never {
  throw new Error(`invalid Floodgate acquisition summary: ${message}`);
}

function canonicalInstant(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    fail(`${label} must be a canonical UTC millisecond instant`);
  }
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value) {
    fail(`${label} must be a real canonical UTC instant`);
  }
  return value;
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail(`${label} must be a nonnegative safe integer`);
  }
  return value as number;
}

function exactRecord(
  input: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    fail(`${label} must be a plain object`);
  }
  const record = input as Record<string, unknown>;
  const names = Object.getOwnPropertyNames(record).sort(compareBytewise);
  const expected = [...expectedKeys].sort(compareBytewise);
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    fail(`${label} keys are not exact`);
  }
  return record;
}

function parseDetail(
  input: unknown,
): Readonly<Record<string, string | number | boolean>> {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) {
    fail("audit detail must be a plain object");
  }
  const result: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(input).sort(compareBytewise)) {
    const value = (input as Record<string, unknown>)[key];
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      fail(`audit detail.${key} must be a primitive scalar`);
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      fail(`audit detail.${key} must be finite`);
    }
    result[key] = value;
  }
  return Object.freeze(result);
}

function parseAuditRecord(input: unknown, label: string): ParsedAuditRecord {
  const raw = input as Record<string, unknown>;
  const hasDetail =
    input !== null &&
    typeof input === "object" &&
    Object.prototype.hasOwnProperty.call(input, "detail");
  const keys = [
    "fetched",
    "first_url",
    "last_url",
    "phase",
    "recorded_at",
    "response_bytes",
    "reused",
    "run_started_at",
    "run_token",
    "schema",
    "sequence",
    "source_revision",
    "status_200",
    "status_404",
    ...(hasDetail ? ["detail"] : []),
  ];
  exactRecord(input, keys, label);
  if (raw.schema !== FLOODGATE_ACQUISITION_AUDIT_SCHEMA) {
    fail(`${label}.schema is unsupported`);
  }
  if (typeof raw.run_token !== "string" || !TOKEN_RE.test(raw.run_token)) {
    fail(`${label}.run_token is not lowercase 64-hex`);
  }
  if (
    typeof raw.source_revision !== "string" ||
    !REVISION_RE.test(raw.source_revision)
  ) {
    fail(`${label}.source_revision is not lowercase 40-hex`);
  }
  if (typeof raw.phase !== "string" || !AUDIT_PHASES.has(raw.phase)) {
    fail(`${label}.phase is unsupported`);
  }
  for (const key of ["first_url", "last_url"] as const) {
    if (raw[key] !== null && typeof raw[key] !== "string") {
      fail(`${label}.${key} must be a string or null`);
    }
  }
  const parsed = Object.freeze({
    schema: FLOODGATE_ACQUISITION_AUDIT_SCHEMA,
    run_token: raw.run_token,
    source_revision: raw.source_revision,
    run_started_at: canonicalInstant(
      raw.run_started_at,
      `${label}.run_started_at`,
    ),
    recorded_at: canonicalInstant(raw.recorded_at, `${label}.recorded_at`),
    sequence: nonnegativeInteger(raw.sequence, `${label}.sequence`),
    phase: raw.phase,
    fetched: nonnegativeInteger(raw.fetched, `${label}.fetched`),
    reused: nonnegativeInteger(raw.reused, `${label}.reused`),
    status_200: nonnegativeInteger(raw.status_200, `${label}.status_200`),
    status_404: nonnegativeInteger(raw.status_404, `${label}.status_404`),
    response_bytes: nonnegativeInteger(
      raw.response_bytes,
      `${label}.response_bytes`,
    ),
    first_url: raw.first_url as string | null,
    last_url: raw.last_url as string | null,
    ...(hasDetail ? { detail: parseDetail(raw.detail) } : {}),
  });
  if (parsed.status_200 + parsed.status_404 !== parsed.fetched) {
    fail(`${label} status accounting does not equal fetched`);
  }
  if (parsed.status_404 > 0 && parsed.phase !== "daily_ratings") {
    fail(`${label} records HTTP 404 outside daily_ratings`);
  }
  if (parsed.fetched === 0 && parsed.response_bytes !== 0) {
    fail(`${label} records bytes without fetched responses`);
  }
  return parsed;
}

function sum(
  records: readonly ParsedAuditRecord[],
  key: "fetched" | "reused" | "status_200" | "status_404" | "response_bytes",
): number {
  const total = records.reduce((value, record) => value + record[key], 0);
  if (!Number.isSafeInteger(total)) fail(`audit ${key} total is unsafe`);
  return total;
}

function parseAuditText(
  text: string,
  expectedRevision: string,
  index: number,
): FloodgateAcquisitionAttemptSummary & {
  readonly publish_recorded_at: string | null;
} {
  if (
    typeof text !== "string" ||
    text.length === 0 ||
    !text.endsWith("\n") ||
    text.endsWith("\n\n") ||
    text.includes("\r")
  ) {
    fail(`audit[${index}] must use exact nonempty JSONL framing`);
  }
  const lines = text.slice(0, -1).split("\n");
  const records = lines.map((line, lineIndex) => {
    let decoded: unknown;
    try {
      decoded = JSON.parse(line);
    } catch {
      return fail(`audit[${index}][${lineIndex}] is not JSON`);
    }
    if (JSON.stringify(decoded) !== line) {
      fail(`audit[${index}][${lineIndex}] is not canonical compact JSON`);
    }
    return parseAuditRecord(decoded, `audit[${index}][${lineIndex}]`);
  });
  const token = records[0].run_token;
  const startedAt = records[0].run_started_at;
  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    if (
      record.sequence !== recordIndex + 1 ||
      record.run_token !== token ||
      record.run_started_at !== startedAt ||
      record.source_revision !== expectedRevision ||
      Date.parse(record.recorded_at) < Date.parse(startedAt)
    ) {
      fail(`audit[${index}] envelope continuity is invalid`);
    }
  }
  const publish = records.filter(
    (record) => record.phase === "manifest_published",
  );
  if (publish.length > 1) fail(`audit[${index}] repeats manifest_published`);
  if (publish.length === 1 && publish[0] !== records.at(-1)) {
    fail(`audit[${index}] manifest_published must be its final record`);
  }
  const last = records.at(-1)!;
  return Object.freeze({
    run_token: token,
    run_started_at: startedAt,
    last_recorded_at: last.recorded_at,
    last_phase: last.phase,
    records: records.length,
    fetched: sum(records, "fetched"),
    reused_observations: sum(records, "reused"),
    status_200: sum(records, "status_200"),
    status_404: sum(records, "status_404"),
    response_bytes: sum(records, "response_bytes"),
    audit_bytes: Buffer.byteLength(text, "utf8"),
    audit_sha256: sha256Hex(text),
    publish_recorded_at: publish[0]?.recorded_at ?? null,
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function buildSummary(
  facts: FloodgateAcquisitionAuthoritativeFacts,
  auditTexts: readonly string[],
): FloodgateAcquisitionResultArtifact {
  if (!REVISION_RE.test(facts.source_revision))
    fail("source revision is invalid");
  if (auditTexts.length === 0) fail("at least one audit file is required");
  const attemptsWithPublish = auditTexts.map((text, index) =>
    parseAuditText(text, facts.source_revision, index),
  );
  attemptsWithPublish.sort(
    (left, right) =>
      compareBytewise(left.run_started_at, right.run_started_at) ||
      compareBytewise(left.run_token, right.run_token),
  );
  const tokens = new Set(
    attemptsWithPublish.map((attempt) => attempt.run_token),
  );
  if (tokens.size !== attemptsWithPublish.length)
    fail("audit run tokens repeat");
  const publishes = attemptsWithPublish.filter(
    (attempt) => attempt.publish_recorded_at !== null,
  );
  if (publishes.length > 1) fail("audit set repeats manifest publication");
  if (publishes.length === 1 && publishes[0] !== attemptsWithPublish.at(-1)) {
    fail("manifest publication is not in the final audit attempt");
  }
  const startedAt = attemptsWithPublish[0].run_started_at;
  const finishedAt = publishes[0]?.publish_recorded_at ?? null;
  if (finishedAt !== null && Date.parse(finishedAt) < Date.parse(startedAt)) {
    fail("manifest publication predates acquisition start");
  }
  const attempts = attemptsWithPublish.map(
    ({ publish_recorded_at: _publish, ...attempt }) => attempt,
  );
  const auditFetched = attempts.reduce(
    (value, attempt) => value + attempt.fetched,
    0,
  );
  if (auditFetched > facts.receipts.total) {
    fail("audit fetched count exceeds authoritative receipts");
  }
  const receipt: FloodgateAcquisitionResultReceipt = {
    schema: FLOODGATE_ACQUISITION_RESULT_SCHEMA,
    source_revision: facts.source_revision,
    timing: {
      started_at: startedAt,
      finished_at: finishedAt,
      elapsed_ms:
        finishedAt === null
          ? null
          : Date.parse(finishedAt) - Date.parse(startedAt),
      attempts: attempts.length,
      resume_count: attempts.length - 1,
      manifest_publish_audit_present: finishedAt !== null,
    },
    audit: {
      records: attempts.reduce((value, attempt) => value + attempt.records, 0),
      fetched: auditFetched,
      reused_observations: attempts.reduce(
        (value, attempt) => value + attempt.reused_observations,
        0,
      ),
      status_200: attempts.reduce(
        (value, attempt) => value + attempt.status_200,
        0,
      ),
      status_404: attempts.reduce(
        (value, attempt) => value + attempt.status_404,
        0,
      ),
      response_bytes: attempts.reduce(
        (value, attempt) => value + attempt.response_bytes,
        0,
      ),
      authoritative_receipt_delta: facts.receipts.total - auditFetched,
      attempts,
    },
    authoritative: {
      receipts: facts.receipts,
      status_200: facts.status_200,
      status_404: facts.status_404,
      response_bytes: facts.response_bytes,
      unique_objects: facts.unique_objects,
      canonical_games: facts.canonical_games,
      duplicate_groups: facts.duplicate_groups,
      duplicate_aliases: facts.duplicate_aliases,
      offline_verification_schema: facts.offline_verification_schema,
    },
    manifest: {
      bytes: facts.manifest_bytes,
      sha256: facts.manifest_sha256,
    },
  };
  const frozen = deepFreeze(receipt);
  const canonicalJson = `${JSON.stringify(frozen)}\n`;
  return deepFreeze({
    receipt: frozen,
    canonical_json: canonicalJson,
    canonical_json_bytes: Buffer.byteLength(canonicalJson, "utf8"),
    canonical_json_sha256: sha256Hex(canonicalJson),
  });
}

function factsFromProduction(
  manifest: Readonly<FloodgateRawLockManifest>,
  verification: Readonly<FloodgateRawOfflineVerificationReport>,
): FloodgateAcquisitionAuthoritativeFacts {
  if (
    verification.schema !== FLOODGATE_RAW_OFFLINE_VERIFICATION_SCHEMA ||
    verification.source_revision !== manifest.source.revision ||
    verification.receipts.listings !== manifest.summary.listing_responses ||
    verification.receipts.daily_ratings !==
      manifest.summary.daily_rating_responses ||
    verification.receipts.period_inventory !==
      manifest.summary.period_inventory_responses ||
    verification.receipts.csa !== manifest.summary.csa_responses ||
    verification.receipts.total !==
      manifest.summary.listing_responses +
        manifest.summary.daily_rating_responses +
        manifest.summary.period_inventory_responses +
        manifest.summary.csa_responses
  ) {
    fail("offline verification does not match the manifest summary");
  }
  const manifestText = serializeFloodgateRawLockManifest(manifest);
  const responseBytes = [
    ...manifest.listings,
    ...manifest.daily_ratings,
    manifest.period_inventory,
    ...manifest.csa_index,
  ].reduce((value, entry) => value + entry.bytes, 0);
  const status200 =
    manifest.summary.listing_responses +
    manifest.summary.daily_rating_http_200 +
    manifest.summary.period_inventory_responses +
    manifest.summary.csa_responses;
  if (
    !Number.isSafeInteger(responseBytes) ||
    status200 + manifest.summary.daily_rating_http_404 !==
      verification.receipts.total
  ) {
    fail("authoritative response accounting is inconsistent");
  }
  return Object.freeze({
    source_revision: manifest.source.revision,
    receipts: Object.freeze({
      total: verification.receipts.total,
      listings: verification.receipts.listings,
      daily_ratings: verification.receipts.daily_ratings,
      period_inventory: verification.receipts.period_inventory,
      csa: verification.receipts.csa,
    }),
    status_200: status200,
    status_404: manifest.summary.daily_rating_http_404,
    response_bytes: responseBytes,
    unique_objects: manifest.object_counts.unique_total,
    canonical_games: manifest.summary.canonical_games,
    duplicate_groups: manifest.summary.duplicate_csa_groups,
    duplicate_aliases: manifest.summary.duplicate_csa_urls,
    manifest_bytes: Buffer.byteLength(manifestText, "utf8"),
    manifest_sha256: sha256Hex(manifestText),
    offline_verification_schema: FLOODGATE_RAW_OFFLINE_VERIFICATION_SCHEMA,
  });
}

async function readAuditFiles(lockRoot: string): Promise<readonly string[]> {
  const auditRoot = `${lockRoot}.audit`;
  const stat = await fs.promises.lstat(auditRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    fail("audit root is not real");
  if ((await fs.promises.realpath(auditRoot)) !== auditRoot) {
    fail("audit root traverses a symbolic link");
  }
  const entries = await fs.promises.readdir(auditRoot, { withFileTypes: true });
  entries.sort((left, right) => compareBytewise(left.name, right.name));
  const texts: string[] = [];
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number" || noFollow === 0) {
    fail("secure audit reading requires O_NOFOLLOW support");
  }
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      !AUDIT_FILE_RE.test(entry.name)
    ) {
      fail(`unexpected audit entry ${entry.name}`);
    }
    const filePath = path.join(auditRoot, entry.name);
    const handle = await fs.promises.open(
      filePath,
      fs.constants.O_RDONLY | noFollow,
    );
    try {
      const before = await handle.stat();
      const bytes = await handle.readFile();
      const after = await handle.stat();
      if (
        !before.isFile() ||
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        bytes.byteLength !== after.size
      ) {
        fail(`audit file changed while read: ${entry.name}`);
      }
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const token = AUDIT_FILE_RE.exec(entry.name)![1];
      const firstLine = text.split("\n", 1)[0];
      let first: unknown;
      try {
        first = JSON.parse(firstLine);
      } catch {
        return fail(`audit file ${entry.name} does not start with JSON`);
      }
      if (
        first === null ||
        typeof first !== "object" ||
        (first as Record<string, unknown>).run_token !== token
      ) {
        fail(`audit filename token does not match ${entry.name}`);
      }
      texts.push(text);
    } finally {
      await handle.close();
    }
  }
  return Object.freeze(texts);
}

/** Verify the completed lock again, then summarize its immutable evidence. */
export async function summarizeExistingFloodgateAcquisition(
  lockRoot: string,
): Promise<FloodgateAcquisitionResultArtifact> {
  if (
    typeof lockRoot !== "string" ||
    !path.isAbsolute(lockRoot) ||
    path.resolve(lockRoot) !== lockRoot
  ) {
    fail("lock root must be a canonical absolute path");
  }
  const manifest = await readExistingFloodgateRawLockManifestFile(lockRoot);
  const verification = await verifyExistingFloodgateRawLock(lockRoot);
  const auditTexts = await readAuditFiles(lockRoot);
  return buildSummary(factsFromProduction(manifest, verification), auditTexts);
}

/** Explicit small-fixture seam; it does not validate production manifest facts. */
export function summarizeFloodgateAcquisitionCoreForTests(
  facts: FloodgateAcquisitionAuthoritativeFacts,
  auditTexts: readonly string[],
): FloodgateAcquisitionResultArtifact {
  return buildSummary(facts, auditTexts);
}
