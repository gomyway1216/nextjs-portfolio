/** Reproducible summary of a completed Floodgate raw acquisition. */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import { FLOODGATE_ACQUISITION_AUDIT_SCHEMA } from "./floodgate-acquisition-runner";
import {
  readExistingFloodgateRawLockManifestFile,
  serializeFloodgateRawLockManifest,
  type FloodgateRawLockManifest,
} from "./floodgate-raw-lock";
import {
  FLOODGATE_RAW_OFFLINE_VERIFICATION_SCHEMA,
  verifyFloodgateRawLockCandidate,
  type FloodgateRawOfflineVerificationReport,
} from "./floodgate-raw-lock-verifier";
import {
  FLOODGATE_PERIOD_END_INVENTORY_URL,
  FLOODGATE_Q1_DAILY_LISTING_COUNT,
  FLOODGATE_Q1_LISTING_IDENTITY_MANIFEST_EXPECTED,
  parseFloodgateCsaUrl,
  parseFloodgateDailyListingUrl,
  parseFloodgateDailyRatingUrl,
  sha256Hex,
} from "./floodgate-source";
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
const AUDIT_PHASE_ORDER = new Map(
  [
    "daily_listings",
    "listing_barrier",
    "daily_ratings",
    "period_inventory",
    "csa",
    "manifest_published",
  ].map((phase, index) => [phase, index]),
);
const PINNED_AUDIT_READER_MAX_STDOUT_BYTES = 32 * 1024 * 1024;
const PINNED_AUDIT_READER_MAX_STDERR_BYTES = 64 * 1024;
const PINNED_AUDIT_READER_TIMEOUT_MS = 10_000;
const PINNED_AUDIT_READER = String.raw`import base64,json,os,stat,sys
ROOT_FD=3
MAX_FILES=4096
MAX_FILE_BYTES=8*1024*1024
MAX_TOTAL_BYTES=20*1024*1024
root=os.fstat(ROOT_FD)
if not stat.S_ISDIR(root.st_mode):
    raise RuntimeError("inherited audit descriptor is not a directory")
names=os.listdir(ROOT_FD)
if len(names)>MAX_FILES:
    raise RuntimeError("too many audit entries")
rows=[]
total=0
for name in sorted(names,key=lambda value:os.fsencode(value)):
    if not isinstance(name,str) or name in (".","..") or "/" in name:
        raise RuntimeError("invalid audit entry name")
    before_path=os.stat(name,dir_fd=ROOT_FD,follow_symlinks=False)
    if not stat.S_ISREG(before_path.st_mode):
        raise RuntimeError("audit entry path is not a regular file")
    flags=os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK
    if hasattr(os,"O_CLOEXEC"):
        flags|=os.O_CLOEXEC
    file_fd=os.open(name,flags,dir_fd=ROOT_FD)
    try:
        opened=os.fstat(file_fd)
        if not stat.S_ISREG(opened.st_mode):
            raise RuntimeError("audit entry is not a regular file")
        if (before_path.st_dev,before_path.st_ino)!=(opened.st_dev,opened.st_ino):
            raise RuntimeError("audit entry changed while opened")
        if opened.st_size<0 or opened.st_size>MAX_FILE_BYTES:
            raise RuntimeError("audit entry size is outside the fixed bound")
        chunks=[]
        size=0
        while True:
            chunk=os.read(file_fd,65536)
            if not chunk:
                break
            chunks.append(chunk)
            size+=len(chunk)
            if size>MAX_FILE_BYTES:
                raise RuntimeError("audit entry grew outside the fixed bound")
        data=b"".join(chunks)
        after=os.fstat(file_fd)
        after_path=os.stat(name,dir_fd=ROOT_FD,follow_symlinks=False)
    finally:
        os.close(file_fd)
    identity=(opened.st_dev,opened.st_ino,opened.st_size)
    if identity!=(after.st_dev,after.st_ino,after.st_size):
        raise RuntimeError("audit entry changed while read")
    if identity!=(after_path.st_dev,after_path.st_ino,after_path.st_size):
        raise RuntimeError("audit entry path changed while read")
    if len(data)!=opened.st_size:
        raise RuntimeError("audit entry byte count changed while read")
    total+=len(data)
    if total>MAX_TOTAL_BYTES:
        raise RuntimeError("audit set exceeds the fixed byte bound")
    rows.append([name,base64.b64encode(data).decode("ascii"),len(data)])
sys.stdout.write(json.dumps({"root":[str(root.st_dev),str(root.st_ino)],"files":rows},separators=(",",":"),ensure_ascii=True)+"\n")
`;

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

/** Raw audit identity. Parsing is limited to the durable newline prefix. */
export interface FloodgateAcquisitionAuditFileInput {
  readonly filename: string;
  readonly bytes: Uint8Array;
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
  readonly run_started_at: string | null;
  readonly last_recorded_at: string | null;
  readonly last_phase: string | null;
  readonly records: number;
  readonly fetched: number;
  readonly reused_observations: number;
  readonly status_200: number;
  readonly status_404: number;
  readonly response_bytes: number;
  readonly audit_bytes: number;
  readonly audit_sha256: string;
  readonly complete_jsonl_bytes: number;
  readonly trailing_partial_bytes: number;
}

export interface FloodgateAcquisitionResultReceipt {
  readonly schema: typeof FLOODGATE_ACQUISITION_RESULT_SCHEMA;
  readonly source_revision: string;
  readonly timing: {
    readonly started_at: string | null;
    readonly finished_at: string | null;
    readonly elapsed_ms: number | null;
    readonly attempts: number;
    readonly resume_count: number;
    readonly manifest_publish_audit_present: boolean;
    readonly start_observation_complete: boolean;
  };
  readonly audit: {
    readonly records: number;
    readonly fetched: number;
    readonly reused_observations: number;
    readonly status_200: number;
    readonly status_404: number;
    readonly response_bytes: number;
    readonly authoritative_receipt_delta: number;
    readonly gaps: {
      readonly empty_files: number;
      readonly trailing_partial_files: number;
      readonly trailing_partial_bytes: number;
      readonly files_without_source_revision: number;
    };
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

function validateAuditUrlForPhase(
  phase: string,
  url: string,
  label: string,
): void {
  try {
    let canonical: string;
    if (phase === "daily_listings" || phase === "listing_barrier") {
      canonical = parseFloodgateDailyListingUrl(url).url;
    } else if (phase === "daily_ratings") {
      canonical = parseFloodgateDailyRatingUrl(url).url;
    } else if (phase === "period_inventory") {
      canonical = FLOODGATE_PERIOD_END_INVENTORY_URL;
    } else if (phase === "csa") {
      canonical = parseFloodgateCsaUrl(url).url;
    } else return;
    if (canonical !== url) throw new Error();
  } catch {
    fail(`${label} is not canonical for phase ${phase}`);
  }
}

function validateListingBarrierDetail(
  input: Readonly<Record<string, string | number | boolean>>,
  label: string,
): void {
  const detail = exactRecord(
    input,
    [
      "all_official_csa_urls",
      "listing_bytes",
      "listing_identity_bytes",
      "listing_identity_sha256",
      "listing_responses",
      "target_csa_urls",
    ],
    label,
  );
  const expected: Readonly<Record<string, string | number>> = {
    listing_responses: FLOODGATE_Q1_DAILY_LISTING_COUNT,
    listing_bytes: 10_098_337,
    all_official_csa_urls: 36_419,
    target_csa_urls: 36_168,
    listing_identity_bytes:
      FLOODGATE_Q1_LISTING_IDENTITY_MANIFEST_EXPECTED.bytes,
    listing_identity_sha256:
      FLOODGATE_Q1_LISTING_IDENTITY_MANIFEST_EXPECTED.sha256,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (detail[key] !== value) fail(`${label}.${key} is not preregistered`);
  }
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
  if (hasDetail !== (parsed.phase === "listing_barrier")) {
    fail(`${label} detail presence does not match its phase`);
  }
  if (parsed.phase === "listing_barrier") {
    validateListingBarrierDetail(parsed.detail!, `${label}.detail`);
  }
  if (parsed.phase === "manifest_published") {
    if (parsed.first_url !== null || parsed.last_url !== null) {
      fail(`${label} manifest publication must not name URLs`);
    }
  } else {
    if (parsed.first_url === null || parsed.last_url === null) {
      fail(`${label} phase must name its first and last URL`);
    }
    validateAuditUrlForPhase(
      parsed.phase,
      parsed.first_url,
      `${label}.first_url`,
    );
    validateAuditUrlForPhase(
      parsed.phase,
      parsed.last_url,
      `${label}.last_url`,
    );
    if (compareBytewise(parsed.first_url, parsed.last_url) > 0) {
      fail(`${label} URL range is reversed`);
    }
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

function parseAuditFile(
  input: FloodgateAcquisitionAuditFileInput,
  expectedRevision: string,
  index: number,
): FloodgateAcquisitionAttemptSummary & {
  readonly publish_recorded_at: string | null;
  readonly source_revision_observed: boolean;
  readonly empty_file: boolean;
} {
  if (
    input === null ||
    typeof input !== "object" ||
    typeof input.filename !== "string" ||
    !(input.bytes instanceof Uint8Array)
  ) {
    fail(`audit[${index}] raw identity is malformed`);
  }
  const filenameMatch = AUDIT_FILE_RE.exec(input.filename);
  if (filenameMatch === null) {
    fail(`audit[${index}] filename is not a run-token JSONL name`);
  }
  const token = filenameMatch[1];
  const bytes = input.bytes;
  if (
    bytes.byteLength >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    fail(`audit[${index}] must not start with a UTF-8 BOM`);
  }
  let lastNewline = -1;
  for (let offset = bytes.byteLength - 1; offset >= 0; offset -= 1) {
    if (bytes[offset] === 0x0a) {
      lastNewline = offset;
      break;
    }
  }
  const completeBytes = lastNewline + 1;
  const trailingPartialBytes = bytes.byteLength - completeBytes;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes.subarray(0, completeBytes),
    );
  } catch {
    return fail(`audit[${index}] complete JSONL prefix is not UTF-8`);
  }
  if (text.includes("\r")) {
    fail(`audit[${index}] complete JSONL prefix contains CR bytes`);
  }
  const lines = text.length === 0 ? [] : text.slice(0, -1).split("\n");
  const records = lines.map((line, lineIndex) => {
    if (line.length === 0) {
      return fail(`audit[${index}][${lineIndex}] is an empty JSONL record`);
    }
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
  const startedAt = records[0]?.run_started_at ?? null;
  let previousPhase = -1;
  let previousRecordedAt = startedAt === null ? 0 : Date.parse(startedAt);
  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    const phaseOrder = AUDIT_PHASE_ORDER.get(record.phase);
    if (
      record.sequence !== recordIndex + 1 ||
      record.run_token !== token ||
      record.run_started_at !== startedAt ||
      record.source_revision !== expectedRevision ||
      Date.parse(record.recorded_at) < previousRecordedAt ||
      phaseOrder === undefined ||
      phaseOrder < previousPhase
    ) {
      fail(`audit[${index}] envelope continuity is invalid`);
    }
    if (record.fetched > 0 && record.reused > 0) {
      fail(`audit[${index}][${recordIndex}] mixes fetched and reused counts`);
    }
    if (
      (record.phase === "listing_barrier" ||
        record.phase === "manifest_published") &&
      (record.fetched !== 0 ||
        record.reused !== 0 ||
        record.status_200 !== 0 ||
        record.status_404 !== 0 ||
        record.response_bytes !== 0)
    ) {
      fail(`audit[${index}][${recordIndex}] barrier counters are not zero`);
    }
    previousPhase = phaseOrder;
    previousRecordedAt = Date.parse(record.recorded_at);
  }
  const publish = records.filter(
    (record) => record.phase === "manifest_published",
  );
  if (
    records.filter((record) => record.phase === "listing_barrier").length > 1
  ) {
    fail(`audit[${index}] repeats listing_barrier`);
  }
  if (publish.length > 1) fail(`audit[${index}] repeats manifest_published`);
  if (publish.length === 1 && publish[0] !== records.at(-1)) {
    fail(`audit[${index}] manifest_published must be its final record`);
  }
  const last = records.at(-1) ?? null;
  return Object.freeze({
    run_token: token,
    run_started_at: startedAt,
    last_recorded_at: last?.recorded_at ?? null,
    last_phase: last?.phase ?? null,
    records: records.length,
    fetched: sum(records, "fetched"),
    reused_observations: sum(records, "reused"),
    status_200: sum(records, "status_200"),
    status_404: sum(records, "status_404"),
    response_bytes: sum(records, "response_bytes"),
    audit_bytes: bytes.byteLength,
    audit_sha256: sha256Hex(bytes),
    complete_jsonl_bytes: completeBytes,
    trailing_partial_bytes: trailingPartialBytes,
    publish_recorded_at: publish[0]?.recorded_at ?? null,
    source_revision_observed: records.length > 0,
    empty_file: bytes.byteLength === 0,
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

function sumAttempts(
  attempts: readonly FloodgateAcquisitionAttemptSummary[],
  key:
    | "records"
    | "fetched"
    | "reused_observations"
    | "status_200"
    | "status_404"
    | "response_bytes",
): number {
  const total = attempts.reduce((value, attempt) => value + attempt[key], 0);
  if (!Number.isSafeInteger(total)) fail(`audit ${key} total is unsafe`);
  return total;
}

function buildSummary(
  facts: FloodgateAcquisitionAuthoritativeFacts,
  auditFiles: readonly FloodgateAcquisitionAuditFileInput[],
): FloodgateAcquisitionResultArtifact {
  if (!REVISION_RE.test(facts.source_revision))
    fail("source revision is invalid");
  if (auditFiles.length === 0) fail("at least one audit file is required");
  const attemptsWithMetadata = auditFiles.map((file, index) =>
    parseAuditFile(file, facts.source_revision, index),
  );
  attemptsWithMetadata.sort(
    (left, right) =>
      compareBytewise(left.run_started_at ?? "", right.run_started_at ?? "") ||
      compareBytewise(left.run_token, right.run_token),
  );
  const tokens = new Set(
    attemptsWithMetadata.map((attempt) => attempt.run_token),
  );
  if (tokens.size !== attemptsWithMetadata.length)
    fail("audit run tokens repeat");
  const publishes = attemptsWithMetadata.filter(
    (attempt) => attempt.publish_recorded_at !== null,
  );
  if (publishes.length > 1) fail("audit set repeats manifest publication");
  if (publishes.length === 1 && publishes[0] !== attemptsWithMetadata.at(-1)) {
    fail("manifest publication is not in the final audit attempt");
  }
  const knownStarts = attemptsWithMetadata
    .map((attempt) => attempt.run_started_at)
    .filter((value): value is string => value !== null);
  const startedAt = knownStarts[0] ?? null;
  const finishedAt = publishes[0]?.publish_recorded_at ?? null;
  if (
    finishedAt !== null &&
    startedAt !== null &&
    Date.parse(finishedAt) < Date.parse(startedAt)
  ) {
    fail("manifest publication predates acquisition start");
  }
  const startObservationComplete = attemptsWithMetadata.every(
    (attempt) => attempt.run_started_at !== null,
  );
  const emptyFiles = attemptsWithMetadata.filter(
    (attempt) => attempt.empty_file,
  ).length;
  const trailingPartialFiles = attemptsWithMetadata.filter(
    (attempt) => attempt.trailing_partial_bytes > 0,
  ).length;
  const trailingPartialBytes = attemptsWithMetadata.reduce(
    (value, attempt) => value + attempt.trailing_partial_bytes,
    0,
  );
  const filesWithoutSourceRevision = attemptsWithMetadata.filter(
    (attempt) => !attempt.source_revision_observed,
  ).length;
  const attempts = attemptsWithMetadata.map(
    ({
      publish_recorded_at: _publish,
      source_revision_observed: _sourceRevision,
      empty_file: _empty,
      ...attempt
    }) => attempt,
  );
  const auditRecords = sumAttempts(attempts, "records");
  const auditFetched = sumAttempts(attempts, "fetched");
  const auditReused = sumAttempts(attempts, "reused_observations");
  const auditStatus200 = sumAttempts(attempts, "status_200");
  const auditStatus404 = sumAttempts(attempts, "status_404");
  const auditResponseBytes = sumAttempts(attempts, "response_bytes");
  if (auditFetched > facts.receipts.total) {
    fail("audit fetched count exceeds authoritative receipts");
  }
  if (
    auditStatus200 > facts.status_200 ||
    auditStatus404 > facts.status_404 ||
    auditResponseBytes > facts.response_bytes
  ) {
    fail("audit observations exceed authoritative response accounting");
  }
  const authoritativeReceiptDelta = facts.receipts.total - auditFetched;
  if (
    authoritativeReceiptDelta === 0 &&
    (auditStatus200 !== facts.status_200 ||
      auditStatus404 !== facts.status_404 ||
      auditResponseBytes !== facts.response_bytes)
  ) {
    fail("complete audit observations disagree with authoritative responses");
  }
  const receipt: FloodgateAcquisitionResultReceipt = {
    schema: FLOODGATE_ACQUISITION_RESULT_SCHEMA,
    source_revision: facts.source_revision,
    timing: {
      started_at: startedAt,
      finished_at: finishedAt,
      elapsed_ms:
        finishedAt === null || startedAt === null || !startObservationComplete
          ? null
          : Date.parse(finishedAt) - Date.parse(startedAt),
      attempts: attempts.length,
      resume_count: attempts.length - 1,
      manifest_publish_audit_present: finishedAt !== null,
      start_observation_complete: startObservationComplete,
    },
    audit: {
      records: auditRecords,
      fetched: auditFetched,
      reused_observations: auditReused,
      status_200: auditStatus200,
      status_404: auditStatus404,
      response_bytes: auditResponseBytes,
      authoritative_receipt_delta: authoritativeReceiptDelta,
      gaps: {
        empty_files: emptyFiles,
        trailing_partial_files: trailingPartialFiles,
        trailing_partial_bytes: trailingPartialBytes,
        files_without_source_revision: filesWithoutSourceRevision,
      },
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

function sameFileIdentity(
  left: fs.BigIntStats,
  right: fs.BigIntStats,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function parsePinnedAuditReaderOutput(
  rawOutput: Uint8Array,
  heldRoot: fs.BigIntStats,
): readonly FloodgateAcquisitionAuditFileInput[] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      rawOutput,
    );
  } catch {
    return fail("descriptor-relative audit reader emitted invalid UTF-8");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    return fail("descriptor-relative audit reader emitted invalid JSON");
  }
  if (`${JSON.stringify(decoded)}\n` !== text) {
    fail("descriptor-relative audit reader output is not canonical JSON");
  }
  const record = exactRecord(decoded, ["files", "root"], "audit reader");
  if (
    !Array.isArray(record.root) ||
    record.root.length !== 2 ||
    record.root.some((value) => typeof value !== "string") ||
    record.root[0] !== String(heldRoot.dev) ||
    record.root[1] !== String(heldRoot.ino)
  ) {
    fail("descriptor-relative audit reader inherited the wrong directory");
  }
  if (!Array.isArray(record.files)) {
    fail("descriptor-relative audit reader file set is malformed");
  }
  const files = record.files.map((entry, index) => {
    if (
      !Array.isArray(entry) ||
      entry.length !== 3 ||
      typeof entry[0] !== "string" ||
      typeof entry[1] !== "string"
    ) {
      return fail(
        `descriptor-relative audit reader file[${index}] is malformed`,
      );
    }
    const size = nonnegativeInteger(
      entry[2],
      `audit reader file[${index}].size`,
    );
    const buffer = Buffer.from(entry[1], "base64");
    if (buffer.toString("base64") !== entry[1] || buffer.byteLength !== size) {
      fail(`descriptor-relative audit reader file[${index}] bytes are invalid`);
    }
    return {
      filename: entry[0],
      bytes: new Uint8Array(buffer),
    };
  });
  files.sort((left, right) => compareBytewise(left.filename, right.filename));
  return Object.freeze(files);
}

async function readPinnedAuditDirectory(
  rootHandle: fs.promises.FileHandle,
  heldRoot: fs.BigIntStats,
): Promise<readonly FloodgateAcquisitionAuditFileInput[]> {
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(
        "/usr/bin/python3",
        ["-I", "-S", "-c", PINNED_AUDIT_READER],
        {
          cwd: "/",
          env: { LC_ALL: "C", NODE_ENV: "production" },
          stdio: ["ignore", "pipe", "pipe", rootHandle.fd],
        },
      );
    } catch (error) {
      reject(error);
      return;
    }
    if (child.stdout === null || child.stderr === null) {
      child.kill("SIGKILL");
      reject(new Error("descriptor-relative audit reader pipes are missing"));
      return;
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let outputExceeded = false;
    let timedOut = false;
    let settled = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, PINNED_AUDIT_READER_TIMEOUT_MS);
    timeout.unref();
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > PINNED_AUDIT_READER_MAX_STDOUT_BYTES) {
        outputExceeded = true;
        child.kill("SIGKILL");
        return;
      }
      stdout.push(Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > PINNED_AUDIT_READER_MAX_STDERR_BYTES) {
        outputExceeded = true;
        child.kill("SIGKILL");
        return;
      }
      stderr.push(Buffer.from(chunk));
    });
    child.once("error", (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once(
      "close",
      (code: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          if (timedOut) {
            fail("descriptor-relative audit reader timed out");
          }
          if (outputExceeded) {
            fail("descriptor-relative audit reader exceeded its output bound");
          }
          if (code !== 0 || signal !== null) {
            const detail = Buffer.concat(stderr).toString("utf8").trim();
            fail(
              `descriptor-relative audit reader failed${
                detail.length === 0 ? "" : `: ${detail}`
              }`,
            );
          }
          resolve(
            parsePinnedAuditReaderOutput(
              Buffer.concat(stdout, stdoutBytes),
              heldRoot,
            ),
          );
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

async function assertAuditRootIdentity(
  auditRoot: string,
  held: fs.BigIntStats,
  stage: string,
): Promise<void> {
  let current: fs.BigIntStats;
  try {
    current = await fs.promises.lstat(auditRoot, { bigint: true });
  } catch {
    return fail(`audit root disappeared during ${stage}`);
  }
  if (
    !current.isDirectory() ||
    current.isSymbolicLink() ||
    !sameFileIdentity(current, held)
  ) {
    fail(`audit root identity changed during ${stage}`);
  }
}

async function readAuditFiles(
  lockRoot: string,
): Promise<readonly FloodgateAcquisitionAuditFileInput[]> {
  const auditRoot = `${lockRoot}.audit`;
  const pathStat = await fs.promises.lstat(auditRoot, { bigint: true });
  if (!pathStat.isDirectory() || pathStat.isSymbolicLink())
    fail("audit root is not real");
  if ((await fs.promises.realpath(auditRoot)) !== auditRoot) {
    fail("audit root traverses a symbolic link");
  }
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number" || noFollow === 0) {
    fail("secure audit reading requires O_NOFOLLOW support");
  }
  const rootHandle = await fs.promises.open(
    auditRoot,
    fs.constants.O_RDONLY | noFollow,
  );
  try {
    const heldRoot = await rootHandle.stat({ bigint: true });
    if (!heldRoot.isDirectory() || !sameFileIdentity(pathStat, heldRoot)) {
      fail("audit root changed while its directory handle was opened");
    }
    await assertAuditRootIdentity(auditRoot, heldRoot, "pre-snapshot");
    const files = await readPinnedAuditDirectory(rootHandle, heldRoot);
    await assertAuditRootIdentity(auditRoot, heldRoot, "post-snapshot");
    for (const file of files) {
      if (!AUDIT_FILE_RE.test(file.filename)) {
        fail(`unexpected audit entry ${file.filename}`);
      }
    }
    await assertAuditRootIdentity(auditRoot, heldRoot, "final check");
    if ((await fs.promises.realpath(auditRoot)) !== auditRoot) {
      fail("audit root path changed before the final check");
    }
    return Object.freeze(files);
  } finally {
    await rootHandle.close();
  }
}

async function assertAcquisitionLeaseAbsent(
  lockRoot: string,
  stage: string,
): Promise<void> {
  try {
    await fs.promises.lstat(`${lockRoot}.lease`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  fail(`acquisition lease is present during ${stage}`);
}

function auditSnapshotsEqual(
  left: readonly FloodgateAcquisitionAuditFileInput[],
  right: readonly FloodgateAcquisitionAuditFileInput[],
): boolean {
  if (left.length !== right.length) return false;
  for (let fileIndex = 0; fileIndex < left.length; fileIndex += 1) {
    const leftFile = left[fileIndex];
    const rightFile = right[fileIndex];
    if (
      leftFile.filename !== rightFile.filename ||
      leftFile.bytes.byteLength !== rightFile.bytes.byteLength
    ) {
      return false;
    }
    for (
      let byteIndex = 0;
      byteIndex < leftFile.bytes.byteLength;
      byteIndex += 1
    ) {
      if (leftFile.bytes[byteIndex] !== rightFile.bytes[byteIndex])
        return false;
    }
  }
  return true;
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
  await assertAcquisitionLeaseAbsent(lockRoot, "summary preflight");
  const manifest = await readExistingFloodgateRawLockManifestFile(lockRoot);
  const manifestIdentity = serializeFloodgateRawLockManifest(manifest);
  const auditFiles = await readAuditFiles(lockRoot);
  const verification = await verifyFloodgateRawLockCandidate(
    lockRoot,
    manifest,
  );
  await assertAcquisitionLeaseAbsent(lockRoot, "post-verification snapshot");
  const auditFilesAfterVerification = await readAuditFiles(lockRoot);
  if (!auditSnapshotsEqual(auditFiles, auditFilesAfterVerification)) {
    fail("audit identity changed while acquisition evidence was summarized");
  }
  const manifestAfterVerification =
    await readExistingFloodgateRawLockManifestFile(lockRoot);
  if (
    serializeFloodgateRawLockManifest(manifestAfterVerification) !==
    manifestIdentity
  ) {
    fail("manifest identity changed while acquisition evidence was summarized");
  }
  await assertAcquisitionLeaseAbsent(lockRoot, "summary final check");
  return buildSummary(factsFromProduction(manifest, verification), auditFiles);
}

/** Explicit small-fixture seam; it does not validate production manifest facts. */
export function summarizeFloodgateAcquisitionCoreForTests(
  facts: FloodgateAcquisitionAuthoritativeFacts,
  auditFiles: readonly FloodgateAcquisitionAuditFileInput[],
): FloodgateAcquisitionResultArtifact {
  return buildSummary(facts, auditFiles);
}

/** Test-only seam for the descriptor-relative production audit snapshotter. */
export async function readFloodgateAcquisitionAuditFilesCoreForTests(
  lockRoot: string,
): Promise<readonly FloodgateAcquisitionAuditFileInput[]> {
  return readAuditFiles(lockRoot);
}
