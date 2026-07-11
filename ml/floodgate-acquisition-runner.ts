/**
 * Leased, resumable acquisition orchestration for the preregistered
 * Floodgate 2026-Q1 raw lock.
 *
 * Network policy lives in floodgate-request-scheduler. Body interpretation
 * and complete offline referential-closure reproduction live in floodgate-source and
 * floodgate-raw-lock-verifier. This module fixes the ordering between them.
 */

import { execFile as execFileCallback } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import { hostname } from "node:os";
import * as path from "node:path";
import { promisify, types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_RAW_LOCK_MAXIMUM_PARALLEL_REQUESTS,
  FLOODGATE_RAW_LOCK_MINIMUM_REQUEST_START_INTERVAL_MS,
  FLOODGATE_RAW_LOCK_USER_AGENT,
  FLOODGATE_RAW_RECEIPT_SCHEMA,
  durableCreateNoClobber,
  floodgateRawFinalManifestPath,
  floodgateRawReceiptPath,
  floodgateRawUrlSha256,
  readExistingFloodgateRawReceiptIfPresent,
  serializeFloodgateRawLockManifest,
  serializeFloodgateRawReceipt,
  storeFloodgateRawObject,
  type FloodgateRawLockManifest,
  type FloodgateRawReceipt,
  type FloodgateRawReceiptKind,
  type VerifiedFloodgateRawReceipt,
} from "./floodgate-raw-lock";
import {
  FLOODGATE_MAXIMUM_INFLIGHT_REQUESTS,
  FLOODGATE_MINIMUM_REQUEST_START_INTERVAL_MS,
  FLOODGATE_REQUEST_USER_AGENT,
  createFloodgateRequestScheduler,
  type FloodgateFetchedResponse,
  type FloodgateRequest,
  type FloodgateRequestScheduler,
} from "./floodgate-request-scheduler";
import {
  FLOODGATE_ORIGIN,
  FLOODGATE_PERIOD_END_INVENTORY_URL,
  FLOODGATE_Q1_DAILY_LISTING_COUNT,
  FLOODGATE_Q1_LISTING_IDENTITY_MANIFEST_EXPECTED,
  assertPreregisteredFloodgateQ1ListingIdentityManifest,
  compareUtf8Bytes,
  parseFloodgateDailyArchiveEvidence,
  serializeFloodgateQ1ListingIdentityManifest,
} from "./floodgate-source";
import {
  reconstructFloodgateRawLockManifest,
  verifyExistingFloodgateRawLock,
  verifyFloodgateRawLockCandidate,
  type FloodgateRawOfflineVerificationReport,
} from "./floodgate-raw-lock-verifier";

const execFile = promisify(execFileCallback);

export const FLOODGATE_ACQUISITION_LEASE_SCHEMA =
  "shogi-floodgate-acquisition-lease-v1" as const;
export const FLOODGATE_ACQUISITION_AUDIT_SCHEMA =
  "shogi-floodgate-acquisition-audit-v1" as const;
export const FLOODGATE_ACQUISITION_BATCH_SIZE = 64 as const;
export const FLOODGATE_LISTING_IDENTITIES_PATH =
  "ml/protocols/floodgate-q1-2026-listing-identities.tsv" as const;

const REVISION_RE = /^[0-9a-f]{40}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const SHARD_RE = /^[0-9a-f]{2}$/;

const PHASE_REQUEST_KIND: Readonly<
  Record<FloodgateAcquisitionPhaseName, FloodgateRawReceiptKind>
> = Object.freeze({
  daily_listings: "daily_listing",
  daily_ratings: "daily_rating",
  period_inventory: "period_end_inventory",
  csa: "csa",
});

export interface FloodgateAcquisitionLeaseOwner {
  readonly schema: typeof FLOODGATE_ACQUISITION_LEASE_SCHEMA;
  readonly pid: number;
  readonly hostname: string;
  readonly run_token: string;
  readonly source_revision: string;
  readonly started_at: string;
}

export interface FloodgateAcquisitionLeaseStatus {
  readonly state: "absent" | "held" | "invalid";
  readonly lease_root: string;
  readonly owner?: Readonly<FloodgateAcquisitionLeaseOwner>;
  readonly error?: string;
}

export interface FloodgateAcquisitionLease {
  readonly lock_root: string;
  readonly lease_root: string;
  readonly audit_root: string;
  readonly owner: Readonly<FloodgateAcquisitionLeaseOwner>;
  release(): Promise<void>;
}

interface LeaseEnvironment {
  readonly pid: number;
  readonly hostname: string;
  readonly now: () => Date;
  readonly token: () => string;
}

interface FloodgateAcquisitionCleanupAudit {
  close(): Promise<void>;
}

interface FloodgateAcquisitionCleanupLease {
  release(): Promise<void>;
}

export interface NonProductionFloodgateLeaseEnvironmentForTests {
  readonly pid: number;
  readonly hostname: string;
  readonly now: () => Date;
  readonly token: () => string;
}

export interface NonProductionFloodgateAcquisitionCleanupForTests {
  readonly audit: FloodgateAcquisitionCleanupAudit | null;
  readonly lease: FloodgateAcquisitionCleanupLease;
  readonly primaryFailed: boolean;
  readonly primaryFailure?: unknown;
}

export type FloodgateAcquisitionPhaseName =
  "daily_listings" | "daily_ratings" | "period_inventory" | "csa";

export interface FloodgateAcquisitionPhase {
  readonly name: FloodgateAcquisitionPhaseName;
  readonly requests: readonly FloodgateRequest[];
}

export interface FloodgateListingBarrierResult {
  readonly phases: readonly FloodgateAcquisitionPhase[];
  readonly audit: Readonly<Record<string, string | number | boolean>>;
}

export interface FloodgateManifestCandidate {
  readonly manifest: Readonly<FloodgateRawLockManifest>;
  readonly verification: FloodgateRawOfflineVerificationReport;
}

export interface FloodgateAcquisitionCoreDependencies {
  assertRevision(stage: "start" | "prepublish"): Promise<void>;
  verifyExistingManifestIfPresent(): Promise<FloodgateRawOfflineVerificationReport | null>;
  readExistingReceipt(
    request: Readonly<FloodgateRequest>,
  ): Promise<VerifiedFloodgateRawReceipt | null>;
  createScheduler(): FloodgateRequestScheduler;
  persistFetched(response: Readonly<FloodgateFetchedResponse>): Promise<void>;
  deriveListingBarrier(): Promise<FloodgateListingBarrierResult>;
  buildAndVerifyManifest(): Promise<FloodgateManifestCandidate>;
  publishManifest(candidate: FloodgateManifestCandidate): Promise<void>;
  audit(record: FloodgateAcquisitionAuditRecord): Promise<void>;
}

export interface FloodgateAcquisitionAuditRecord {
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

export interface FloodgateAcquisitionRunResult {
  readonly status: "already_complete" | "published";
  readonly fetched: number;
  readonly reused: number;
  readonly verification: FloodgateRawOfflineVerificationReport;
}

export interface FloodgateQ1AcquisitionOptions {
  readonly repositoryRoot: string;
  readonly lockRoot: string;
  readonly pipelineRevision: string;
}

interface ListingIdentityRow {
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
}

function fail(message: string): never {
  throw new Error(`invalid Floodgate acquisition: ${message}`);
}

function strictPlainDataRecord(
  input: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    nodeUtilTypes.isProxy(input) ||
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Object.getOwnPropertySymbols(input).length !== 0
  ) {
    fail(`${label} must be a non-Proxy plain object without symbol keys`);
  }
  const names = Object.getOwnPropertyNames(input).sort(compareUtf8Bytes);
  const expected = [...expectedKeys].sort(compareUtf8Bytes);
  if (
    names.length !== expected.length ||
    names.some((name, index) => name !== expected[index])
  ) {
    fail(`${label} keys are not exact`);
  }
  const result: Record<string, unknown> = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(input, name);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail(`${label}.${name} must be an enumerable data property`);
    }
    result[name] = descriptor.value;
  }
  return Object.freeze(result);
}

function canonicalAbsolutePath(input: string, label: string): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.includes("\0") ||
    !path.isAbsolute(input) ||
    path.resolve(input) !== input ||
    path.parse(input).root === input
  ) {
    fail(`${label} must be a canonical non-root absolute path`);
  }
  return input;
}

function pathIsInsideOrEqual(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function validateProductionOptions(
  input: unknown,
): Readonly<FloodgateQ1AcquisitionOptions> {
  const value = strictPlainDataRecord(
    input,
    ["lockRoot", "pipelineRevision", "repositoryRoot"],
    "options",
  );
  return Object.freeze({
    repositoryRoot: canonicalAbsolutePath(
      value.repositoryRoot as string,
      "repository root",
    ),
    lockRoot: canonicalAbsolutePath(value.lockRoot as string, "lock root"),
    pipelineRevision: validateRevision(value.pipelineRevision as string),
  });
}

function validateRevision(input: string): string {
  if (typeof input !== "string" || !REVISION_RE.test(input)) {
    fail("source revision must be a lowercase 40-hex commit");
  }
  return input;
}

function validateToken(input: string): string {
  if (typeof input !== "string" || !TOKEN_RE.test(input)) {
    fail("lease token must be lowercase 64-hex");
  }
  return input;
}

function validateIsoInstant(input: string): string {
  const instant = typeof input === "string" ? new Date(input) : null;
  if (
    typeof input !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input) ||
    !instant ||
    !Number.isFinite(instant.getTime()) ||
    instant.toISOString() !== input
  ) {
    fail("lease start must be a canonical UTC ISO instant");
  }
  return input;
}

function validateOwner(
  input: unknown,
): Readonly<FloodgateAcquisitionLeaseOwner> {
  const value = strictPlainDataRecord(
    input,
    ["hostname", "pid", "run_token", "schema", "source_revision", "started_at"],
    "lease owner",
  );
  if (value.schema !== FLOODGATE_ACQUISITION_LEASE_SCHEMA) {
    fail("lease owner schema is unsupported");
  }
  if (!Number.isSafeInteger(value.pid) || (value.pid as number) <= 0) {
    fail("lease owner pid must be a positive safe integer");
  }
  if (
    typeof value.hostname !== "string" ||
    value.hostname.length === 0 ||
    value.hostname !== value.hostname.trim()
  ) {
    fail("lease owner hostname must be nonempty canonical text");
  }
  return Object.freeze({
    schema: FLOODGATE_ACQUISITION_LEASE_SCHEMA,
    pid: value.pid as number,
    hostname: value.hostname,
    run_token: validateToken(value.run_token as string),
    source_revision: validateRevision(value.source_revision as string),
    started_at: validateIsoInstant(value.started_at as string),
  });
}

function serializeOwner(owner: FloodgateAcquisitionLeaseOwner): string {
  return `${JSON.stringify(validateOwner(owner))}\n`;
}

async function lstatMaybe(filePath: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await fs.promises.open(directory, fs.constants.O_RDONLY);
  try {
    const stat = await handle.stat();
    if (!stat.isDirectory())
      fail(`sync target is not a directory: ${directory}`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function assertExistingDirectoryChainIsReal(
  directory: string,
  label: string,
): Promise<void> {
  if (
    typeof directory !== "string" ||
    !path.isAbsolute(directory) ||
    path.resolve(directory) !== directory
  ) {
    fail(`${label} must be a canonical absolute directory path`);
  }
  const root = path.parse(directory).root;
  const relative = path.relative(root, directory);
  const segments = relative === "" ? [] : relative.split(path.sep);
  let current = root;
  const paths = [root];
  for (const segment of segments) {
    current = path.join(current, segment);
    paths.push(current);
  }
  for (const candidate of paths) {
    const stat = await fs.promises.lstat(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail(`${label} contains a non-directory or symbolic-link component`);
    }
  }
}

async function readRegularFileNoFollow(filePath: string): Promise<Buffer> {
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number" || noFollow === 0) {
    fail("secure lease verification requires O_NOFOLLOW");
  }
  const handle = await fs.promises.open(
    filePath,
    fs.constants.O_RDONLY | noFollow,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) fail(`path is not a regular file: ${filePath}`);
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function readLeaseOwner(
  leaseRoot: string,
): Promise<Readonly<FloodgateAcquisitionLeaseOwner>> {
  const bytes = await readRegularFileNoFollow(
    path.join(leaseRoot, "owner.json"),
  );
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    return fail("lease owner is not canonical UTF-8 JSON");
  }
  const owner = validateOwner(decoded);
  if (!bytes.equals(Buffer.from(serializeOwner(owner), "utf8"))) {
    fail("lease owner is not canonical JSON/LF bytes");
  }
  return owner;
}

function leasePaths(lockRootInput: string): {
  lockRoot: string;
  leaseRoot: string;
  auditRoot: string;
} {
  const lockRoot = canonicalAbsolutePath(lockRootInput, "lock root");
  return {
    lockRoot,
    leaseRoot: `${lockRoot}.lease`,
    auditRoot: `${lockRoot}.audit`,
  };
}

async function acquireLease(
  lockRootInput: string,
  revisionInput: string,
  environment: LeaseEnvironment,
): Promise<FloodgateAcquisitionLease> {
  const { lockRoot, leaseRoot, auditRoot } = leasePaths(lockRootInput);
  const sourceRevision = validateRevision(revisionInput);
  const parent = path.dirname(leaseRoot);
  await assertExistingDirectoryChainIsReal(parent, "lease parent chain");
  const owner = validateOwner({
    schema: FLOODGATE_ACQUISITION_LEASE_SCHEMA,
    pid: environment.pid,
    hostname: environment.hostname,
    run_token: environment.token(),
    source_revision: sourceRevision,
    started_at: environment.now().toISOString(),
  });
  const ownerBytes = serializeOwner(owner);
  try {
    await fs.promises.mkdir(leaseRoot, { mode: 0o700 });
    await syncDirectory(parent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const status = await getFloodgateAcquisitionLeaseStatus(lockRoot);
      const detail = status.owner
        ? `pid=${status.owner.pid} host=${status.owner.hostname} started=${status.owner.started_at}`
        : (status.error ?? "owner unavailable");
      throw new Error(`Floodgate acquisition lease is already held: ${detail}`);
    }
    throw error;
  }
  const leaseStat = await fs.promises.lstat(leaseRoot);
  if (!leaseStat.isDirectory() || leaseStat.isSymbolicLink()) {
    fail("new lease path is not a real directory");
  }
  const ownerPath = path.join(leaseRoot, "owner.json");
  await durableCreateNoClobber(ownerPath, ownerBytes);
  const ownerStat = await fs.promises.lstat(ownerPath);
  if (!ownerStat.isFile() || ownerStat.isSymbolicLink()) {
    fail("new lease owner is not a real regular file");
  }

  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    const current = await fs.promises.lstat(leaseRoot);
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.dev !== leaseStat.dev ||
      current.ino !== leaseStat.ino
    ) {
      fail("lease directory identity changed before release");
    }
    const currentOwner = await readLeaseOwner(leaseRoot);
    const currentOwnerStat = await fs.promises.lstat(ownerPath);
    if (
      !currentOwnerStat.isFile() ||
      currentOwnerStat.isSymbolicLink() ||
      currentOwnerStat.dev !== ownerStat.dev ||
      currentOwnerStat.ino !== ownerStat.ino ||
      currentOwner.run_token !== owner.run_token ||
      currentOwner.source_revision !== owner.source_revision ||
      serializeOwner(currentOwner) !== ownerBytes
    ) {
      fail("lease owner identity changed before release");
    }
    await fs.promises.unlink(ownerPath);
    await syncDirectory(leaseRoot);
    await fs.promises.rmdir(leaseRoot);
    await syncDirectory(parent);
    released = true;
  };

  return Object.freeze({
    lock_root: lockRoot,
    lease_root: leaseRoot,
    audit_root: auditRoot,
    owner,
    release,
  });
}

export async function acquireFloodgateAcquisitionLease(
  lockRoot: string,
  sourceRevision: string,
): Promise<FloodgateAcquisitionLease> {
  return acquireLease(lockRoot, sourceRevision, {
    pid: process.pid,
    hostname: hostname(),
    now: () => new Date(),
    token: () => randomBytes(32).toString("hex"),
  });
}

export async function acquireNonProductionFloodgateLeaseForTests(
  lockRoot: string,
  sourceRevision: string,
  environment: NonProductionFloodgateLeaseEnvironmentForTests,
): Promise<FloodgateAcquisitionLease> {
  return acquireLease(lockRoot, sourceRevision, environment);
}

async function cleanupAcquisitionResources(
  audit: FloodgateAcquisitionCleanupAudit | null,
  lease: FloodgateAcquisitionCleanupLease,
  primaryFailed: boolean,
  primaryFailure: unknown,
): Promise<void> {
  const cleanupFailures: unknown[] = [];
  try {
    if (audit) await audit.close();
  } catch (cleanupError) {
    cleanupFailures.push(cleanupError);
  }
  try {
    await lease.release();
  } catch (cleanupError) {
    cleanupFailures.push(cleanupError);
  }
  if (cleanupFailures.length === 0) return;
  if (primaryFailed) {
    throw new AggregateError(
      [primaryFailure, ...cleanupFailures],
      "Floodgate acquisition and cleanup both failed",
      { cause: primaryFailure },
    );
  }
  if (cleanupFailures.length === 1) throw cleanupFailures[0];
  throw new AggregateError(
    cleanupFailures,
    "multiple Floodgate acquisition cleanup operations failed",
  );
}

/** Explicit small-fixture seam for cleanup-drain and error-precedence tests. */
export async function cleanupNonProductionFloodgateAcquisitionForTests(
  input: NonProductionFloodgateAcquisitionCleanupForTests,
): Promise<void> {
  return cleanupAcquisitionResources(
    input.audit,
    input.lease,
    input.primaryFailed,
    input.primaryFailure,
  );
}

export async function getFloodgateAcquisitionLeaseStatus(
  lockRootInput: string,
): Promise<Readonly<FloodgateAcquisitionLeaseStatus>> {
  const { leaseRoot } = leasePaths(lockRootInput);
  try {
    await assertExistingDirectoryChainIsReal(
      path.dirname(leaseRoot),
      "lease parent chain",
    );
  } catch (error) {
    return Object.freeze({
      state: "invalid",
      lease_root: leaseRoot,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const stat = await lstatMaybe(leaseRoot);
  if (!stat) return Object.freeze({ state: "absent", lease_root: leaseRoot });
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    return Object.freeze({
      state: "invalid",
      lease_root: leaseRoot,
      error: "lease path is not a real directory",
    });
  }
  try {
    const owner = await readLeaseOwner(leaseRoot);
    return Object.freeze({ state: "held", lease_root: leaseRoot, owner });
  } catch (error) {
    return Object.freeze({
      state: "invalid",
      lease_root: leaseRoot,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function ensureRealDirectory(
  directory: string,
  mode = 0o700,
): Promise<void> {
  try {
    await fs.promises.mkdir(directory, { mode });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const stat = await fs.promises.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail(`storage path is not a real directory: ${directory}`);
  }
}

async function initializeRawStorage(lockRootInput: string): Promise<string> {
  const lockRoot = canonicalAbsolutePath(lockRootInput, "lock root");
  const parent = path.dirname(lockRoot);
  await assertExistingDirectoryChainIsReal(parent, "storage parent chain");
  await ensureRealDirectory(lockRoot);
  await syncDirectory(parent);
  const objects = path.join(lockRoot, "objects");
  const objectSha = path.join(objects, "sha256");
  const receipts = path.join(lockRoot, "receipts");
  const receiptSha = path.join(receipts, "sha256");
  for (const directory of [objects, objectSha, receipts, receiptSha]) {
    await ensureRealDirectory(directory);
  }
  for (let value = 0; value < 256; value += 1) {
    const shard = value.toString(16).padStart(2, "0");
    if (!SHARD_RE.test(shard)) fail("internal shard name is invalid");
    // Keep directory creation sequential: if either side fails, no sibling
    // mkdir is allowed to outlive the lease-holding call stack.
    await ensureRealDirectory(path.join(objectSha, shard));
    await ensureRealDirectory(path.join(receiptSha, shard));
  }
  await syncDirectory(objectSha);
  await syncDirectory(receiptSha);
  await syncDirectory(objects);
  await syncDirectory(receipts);
  await syncDirectory(lockRoot);
  return lockRoot;
}

class FloodgateAuditWriter {
  readonly #handle: fs.promises.FileHandle;
  readonly #runToken: string;
  readonly #sourceRevision: string;
  #sequence = 0;

  private constructor(
    handle: fs.promises.FileHandle,
    runToken: string,
    sourceRevision: string,
  ) {
    this.#handle = handle;
    this.#runToken = runToken;
    this.#sourceRevision = sourceRevision;
  }

  static async open(
    lease: FloodgateAcquisitionLease,
  ): Promise<FloodgateAuditWriter> {
    await assertExistingDirectoryChainIsReal(
      path.dirname(lease.audit_root),
      "audit parent chain",
    );
    await ensureRealDirectory(lease.audit_root);
    await syncDirectory(path.dirname(lease.audit_root));
    const filePath = path.join(
      lease.audit_root,
      `${lease.owner.run_token}.jsonl`,
    );
    const handle = await fs.promises.open(
      filePath,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      0o600,
    );
    await syncDirectory(lease.audit_root);
    return new FloodgateAuditWriter(
      handle,
      lease.owner.run_token,
      lease.owner.source_revision,
    );
  }

  async append(record: FloodgateAcquisitionAuditRecord): Promise<void> {
    this.#sequence += 1;
    const line = `${JSON.stringify({
      schema: FLOODGATE_ACQUISITION_AUDIT_SCHEMA,
      run_token: this.#runToken,
      source_revision: this.#sourceRevision,
      sequence: this.#sequence,
      ...record,
    })}\n`;
    const bytes = Buffer.from(line, "utf8");
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesWritten } = await this.#handle.write(
        bytes,
        offset,
        bytes.byteLength - offset,
        null,
      );
      if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0) {
        fail("audit append made no forward progress");
      }
      offset += bytesWritten;
    }
    await this.#handle.datasync();
  }

  async close(): Promise<void> {
    await this.#handle.close();
  }
}

function validateRequest(
  request: FloodgateRequest,
): Readonly<FloodgateRequest> {
  const value = strictPlainDataRecord(request, ["kind", "url"], "request");
  if (
    !["daily_listing", "daily_rating", "period_end_inventory", "csa"].includes(
      value.kind as string,
    ) ||
    typeof value.url !== "string" ||
    !value.url.startsWith(`${FLOODGATE_ORIGIN}/`)
  ) {
    fail("acquisition request is malformed");
  }
  return Object.freeze({
    kind: value.kind as FloodgateRawReceiptKind,
    url: value.url,
  });
}

function canonicalizeRequests(
  input: readonly FloodgateRequest[],
): readonly Readonly<FloodgateRequest>[] {
  const requests = input.map(validateRequest);
  requests.sort((left, right) => compareUtf8Bytes(left.url, right.url));
  for (let index = 1; index < requests.length; index += 1) {
    if (requests[index - 1].url === requests[index].url) {
      fail(`acquisition requests repeat URL ${requests[index].url}`);
    }
  }
  return Object.freeze(requests);
}

function validatePhase(
  phase: FloodgateAcquisitionPhase,
  expectedName: FloodgateAcquisitionPhaseName,
): Readonly<FloodgateAcquisitionPhase> {
  if (phase.name !== expectedName || !Array.isArray(phase.requests)) {
    fail(`listing barrier must produce ${expectedName} in fixed order`);
  }
  const requests = canonicalizeRequests(phase.requests);
  const expectedKind = PHASE_REQUEST_KIND[expectedName];
  if (requests.some((request) => request.kind !== expectedKind)) {
    fail(`${expectedName} contains a request with the wrong kind`);
  }
  return Object.freeze({
    name: expectedName,
    requests: Object.freeze(requests),
  });
}

async function persistWithLimit(
  responses: readonly FloodgateFetchedResponse[],
  persist: (response: Readonly<FloodgateFetchedResponse>) => Promise<void>,
  limit = 4,
): Promise<void> {
  let next = 0;
  let stopped = false;
  let firstFailure: unknown;
  const workers = Array.from(
    { length: Math.min(limit, responses.length) },
    async () => {
      for (;;) {
        if (stopped) return;
        const index = next;
        next += 1;
        if (index >= responses.length) return;
        try {
          await persist(responses[index]);
        } catch (error) {
          if (!stopped) {
            stopped = true;
            firstFailure = error;
          }
          return;
        }
      }
    },
  );
  await Promise.all(workers);
  if (stopped) throw firstFailure;
}

async function drainConcurrentReads<T>(
  operations: readonly Promise<T>[],
): Promise<readonly T[]> {
  let failed = false;
  let firstFailure: unknown;
  const settled = await Promise.all(
    operations.map(async (operation) => {
      try {
        return { ok: true as const, value: await operation };
      } catch (error) {
        if (!failed) {
          failed = true;
          firstFailure = error;
        }
        return { ok: false as const };
      }
    }),
  );
  if (failed) throw firstFailure;
  return settled.map((result) => {
    if (!result.ok) return fail("concurrent read settlement was lost");
    return result.value;
  });
}

async function acquirePhase(
  phase: Readonly<FloodgateAcquisitionPhase>,
  dependencies: FloodgateAcquisitionCoreDependencies,
  scheduler: FloodgateRequestScheduler,
): Promise<{ fetched: number; reused: number }> {
  const missing: FloodgateRequest[] = [];
  let reused = 0;
  for (
    let offset = 0;
    offset < phase.requests.length;
    offset += FLOODGATE_ACQUISITION_BATCH_SIZE
  ) {
    const slice = phase.requests.slice(
      offset,
      offset + FLOODGATE_ACQUISITION_BATCH_SIZE,
    );
    const existing = await drainConcurrentReads(
      slice.map((request) => dependencies.readExistingReceipt(request)),
    );
    for (let index = 0; index < slice.length; index += 1) {
      if (existing[index]) reused += 1;
      else missing.push(slice[index]);
    }
  }

  let fetched = 0;
  for (
    let offset = 0;
    offset < missing.length;
    offset += FLOODGATE_ACQUISITION_BATCH_SIZE
  ) {
    const batch = missing.slice(
      offset,
      offset + FLOODGATE_ACQUISITION_BATCH_SIZE,
    );
    const responses = await scheduler.run(batch);
    if (
      responses.length !== batch.length ||
      responses.some(
        (response, index) =>
          response.kind !== batch[index].kind ||
          response.url !== batch[index].url,
      )
    ) {
      fail("scheduler response set does not exactly match its request batch");
    }
    await persistWithLimit(responses, dependencies.persistFetched);
    fetched += responses.length;
    await dependencies.audit({
      phase: phase.name,
      fetched: responses.length,
      reused: 0,
      status_200: responses.filter((response) => response.status === 200)
        .length,
      status_404: responses.filter((response) => response.status === 404)
        .length,
      response_bytes: responses.reduce(
        (total, response) => total + response.bytes.byteLength,
        0,
      ),
      first_url: responses[0]?.url ?? null,
      last_url: responses.at(-1)?.url ?? null,
    });
  }
  if (reused > 0 || missing.length === 0) {
    await dependencies.audit({
      phase: phase.name,
      fetched: 0,
      reused,
      status_200: 0,
      status_404: 0,
      response_bytes: 0,
      first_url: phase.requests[0]?.url ?? null,
      last_url: phase.requests.at(-1)?.url ?? null,
    });
  }
  return { fetched, reused };
}

async function runAcquisitionCore(
  listingRequestsInput: readonly FloodgateRequest[],
  dependencies: FloodgateAcquisitionCoreDependencies,
): Promise<Readonly<FloodgateAcquisitionRunResult>> {
  const listingRequests = canonicalizeRequests(listingRequestsInput);
  if (listingRequests.some((request) => request.kind !== "daily_listing")) {
    fail("initial acquisition phase only accepts daily listing requests");
  }
  await dependencies.assertRevision("start");
  const existing = await dependencies.verifyExistingManifestIfPresent();
  if (existing) {
    return Object.freeze({
      status: "already_complete",
      fetched: 0,
      reused: 0,
      verification: existing,
    });
  }

  const scheduler = dependencies.createScheduler();
  let fetched = 0;
  let reused = 0;
  const listing = await acquirePhase(
    { name: "daily_listings", requests: listingRequests },
    dependencies,
    scheduler,
  );
  fetched += listing.fetched;
  reused += listing.reused;

  const barrier = await dependencies.deriveListingBarrier();
  if (!Array.isArray(barrier.phases) || barrier.phases.length !== 3) {
    fail("listing barrier must return exactly three post-listing phases");
  }
  await dependencies.audit({
    phase: "listing_barrier",
    fetched: 0,
    reused: 0,
    status_200: 0,
    status_404: 0,
    response_bytes: 0,
    first_url: listingRequests[0]?.url ?? null,
    last_url: listingRequests.at(-1)?.url ?? null,
    detail: barrier.audit,
  });
  const postListing = [
    validatePhase(barrier.phases[0], "daily_ratings"),
    validatePhase(barrier.phases[1], "period_inventory"),
    validatePhase(barrier.phases[2], "csa"),
  ];
  for (const phase of postListing) {
    const result = await acquirePhase(phase, dependencies, scheduler);
    fetched += result.fetched;
    reused += result.reused;
  }

  const candidate = await dependencies.buildAndVerifyManifest();
  await dependencies.assertRevision("prepublish");
  await dependencies.publishManifest(candidate);
  await dependencies.audit({
    phase: "manifest_published",
    fetched: 0,
    reused: 0,
    status_200: 0,
    status_404: 0,
    response_bytes: 0,
    first_url: null,
    last_url: null,
  });
  return Object.freeze({
    status: "published",
    fetched,
    reused,
    verification: candidate.verification,
  });
}

/** Explicit small-fixture seam. It is not used by production acquisition. */
export async function runNonProductionFloodgateAcquisitionCoreForTests(
  listingRequests: readonly FloodgateRequest[],
  dependencies: FloodgateAcquisitionCoreDependencies,
): Promise<Readonly<FloodgateAcquisitionRunResult>> {
  return runAcquisitionCore(listingRequests, dependencies);
}

function parseListingIdentityFile(text: string): readonly ListingIdentityRow[] {
  if (!text.endsWith("\n") || text.endsWith("\n\n") || text.includes("\r")) {
    fail("listing identity file must use exact tab/LF framing");
  }
  const rows = text
    .slice(0, -1)
    .split("\n")
    .map((line) => {
      const fields = line.split("\t");
      if (fields.length !== 3)
        fail("listing identity row must have three fields");
      return {
        url: fields[0],
        bytes: Number(fields[1]),
        sha256: fields[2],
      };
    });
  const serialized = serializeFloodgateQ1ListingIdentityManifest(rows);
  if (serialized !== text) {
    fail("listing identity file is not the exact canonical TSV serialization");
  }
  assertPreregisteredFloodgateQ1ListingIdentityManifest(serialized);
  if (rows.length !== FLOODGATE_Q1_DAILY_LISTING_COUNT) {
    fail("listing identity file does not contain 90 rows");
  }
  return Object.freeze(rows);
}

async function assertGitRevision(
  repositoryRoot: string,
  expectedRevision: string,
  _stage: "start" | "prepublish",
): Promise<void> {
  const rootStat = await fs.promises.lstat(repositoryRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    fail("repository root must be a real directory");
  }
  await assertExistingDirectoryChainIsReal(
    repositoryRoot,
    "repository root chain",
  );
  const { stdout: topLevelOut } = await execFile(
    "git",
    ["--no-optional-locks", "rev-parse", "--show-toplevel"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (topLevelOut.trim() !== repositoryRoot) {
    fail("repository root must be the exact Git worktree root");
  }
  const { stdout: revisionOut } = await execFile(
    "git",
    ["--no-optional-locks", "rev-parse", "HEAD"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
  if (revisionOut.trim() !== expectedRevision) {
    fail("Git revision changed during acquisition");
  }
  const { stdout: statusOut } = await execFile(
    "git",
    ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=no"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (statusOut !== "")
    fail("tracked Git tree must be clean during acquisition");
}

async function persistResponse(
  lockRoot: string,
  response: Readonly<FloodgateFetchedResponse>,
): Promise<void> {
  const object = await storeFloodgateRawObject(lockRoot, response.bytes);
  const receipt: FloodgateRawReceipt = {
    schema: FLOODGATE_RAW_RECEIPT_SCHEMA,
    kind: response.kind as FloodgateRawReceiptKind,
    url: response.url,
    url_sha256: floodgateRawUrlSha256(response.url),
    request: {
      accept_encoding: "identity",
      redirect: "manual",
      user_agent: FLOODGATE_RAW_LOCK_USER_AGENT,
    },
    response: {
      url: response.url,
      status: response.status,
      content_encoding: response.contentEncoding,
      bytes: object.bytes,
      sha256: object.sha256,
    },
    object: object.object,
  };
  const relative = floodgateRawReceiptPath(response.url);
  await durableCreateNoClobber(
    path.join(lockRoot, ...relative.split("/")),
    serializeFloodgateRawReceipt(receipt),
  );
}

function ratingUrlForListing(listingUrl: string): string {
  const match = /\/2026\/(\d{2})\/(\d{2})\/$/.exec(listingUrl);
  if (!match) fail("listing URL cannot derive a daily rating URL");
  return `${FLOODGATE_ORIGIN}/shogi/x/rating/players-floodgate-2026${match[1]}${match[2]}.html`;
}

async function manifestExists(lockRoot: string): Promise<boolean> {
  const manifestPath = path.join(lockRoot, floodgateRawFinalManifestPath());
  const stat = await lstatMaybe(manifestPath);
  return stat !== null;
}

export async function runFloodgateQ1Acquisition(
  options: FloodgateQ1AcquisitionOptions,
): Promise<Readonly<FloodgateAcquisitionRunResult>> {
  if (
    FLOODGATE_RAW_LOCK_MAXIMUM_PARALLEL_REQUESTS !==
      FLOODGATE_MAXIMUM_INFLIGHT_REQUESTS ||
    FLOODGATE_RAW_LOCK_MINIMUM_REQUEST_START_INTERVAL_MS !==
      FLOODGATE_MINIMUM_REQUEST_START_INTERVAL_MS ||
    FLOODGATE_RAW_LOCK_USER_AGENT !== FLOODGATE_REQUEST_USER_AGENT
  ) {
    fail("raw lock and scheduler network policies disagree");
  }
  const validatedOptions = validateProductionOptions(options);
  const repositoryRoot = validatedOptions.repositoryRoot;
  const lockRoot = validatedOptions.lockRoot;
  const revision = validatedOptions.pipelineRevision;
  const storagePaths = Object.values(leasePaths(lockRoot));
  if (
    storagePaths.some(
      (storagePath) =>
        pathIsInsideOrEqual(repositoryRoot, storagePath) ||
        pathIsInsideOrEqual(storagePath, repositoryRoot),
    )
  ) {
    fail("lock, lease, and audit paths must be disjoint from the Git worktree");
  }
  await assertExistingDirectoryChainIsReal(
    path.dirname(lockRoot),
    "storage parent chain",
  );

  // This check precedes every write, including lease creation. A complete lock
  // is always reopened and verified offline without touching its audit tree.
  await assertGitRevision(repositoryRoot, revision, "start");
  if (await manifestExists(lockRoot)) {
    const verification = await verifyExistingFloodgateRawLock(lockRoot);
    return Object.freeze({
      status: "already_complete",
      fetched: 0,
      reused: 0,
      verification,
    });
  }

  const listingBytes = await readRegularFileNoFollow(
    path.join(repositoryRoot, FLOODGATE_LISTING_IDENTITIES_PATH),
  );
  let listingText: string;
  try {
    listingText = new TextDecoder("utf-8", { fatal: true }).decode(
      listingBytes,
    );
  } catch {
    return fail("listing identity file must be fatal-valid UTF-8");
  }
  const listingRows = parseListingIdentityFile(listingText);
  const listingRequests = listingRows.map((row) => ({
    kind: "daily_listing" as const,
    url: row.url,
  }));

  const lease = await acquireFloodgateAcquisitionLease(lockRoot, revision);
  let audit: FloodgateAuditWriter | null = null;
  let primaryFailed = false;
  let primaryFailure: unknown;
  try {
    // Close the narrow race between the read-only preflight and lease
    // acquisition. A legitimate writer cannot publish while this lease is held.
    await assertGitRevision(repositoryRoot, revision, "start");
    if (await manifestExists(lockRoot)) {
      const verification = await verifyExistingFloodgateRawLock(lockRoot);
      return Object.freeze({
        status: "already_complete",
        fetched: 0,
        reused: 0,
        verification,
      });
    }
    await initializeRawStorage(lockRoot);
    audit = await FloodgateAuditWriter.open(lease);
    let listingUrls: readonly string[] = listingRows.map((row) => row.url);
    let ratingUrls: readonly string[] = [];
    let csaUrls: readonly string[] = [];
    const dependencies: FloodgateAcquisitionCoreDependencies = {
      assertRevision: (stage) =>
        assertGitRevision(repositoryRoot, revision, stage),
      verifyExistingManifestIfPresent: async () => {
        if (await manifestExists(lockRoot)) {
          fail("manifest appeared while the exclusive lease was held");
        }
        return null;
      },
      readExistingReceipt: (request) =>
        readExistingFloodgateRawReceiptIfPresent(
          lockRoot,
          request.url,
          request.kind as FloodgateRawReceiptKind,
        ),
      createScheduler: () => createFloodgateRequestScheduler(),
      persistFetched: (response) => persistResponse(lockRoot, response),
      deriveListingBarrier: async () => {
        const rating: string[] = [];
        const csa: string[] = [];
        let listingBytes = 0;
        let allOfficial = 0;
        for (const row of listingRows) {
          const verified = await readExistingFloodgateRawReceiptIfPresent(
            lockRoot,
            row.url,
            "daily_listing",
          );
          if (!verified)
            fail(`listing receipt is missing after acquisition: ${row.url}`);
          if (
            verified.receipt.response.bytes !== row.bytes ||
            verified.receipt.response.sha256 !== row.sha256
          ) {
            fail(`listing receipt identity drifted: ${row.url}`);
          }
          const evidence = parseFloodgateDailyArchiveEvidence({
            listingUrl: row.url,
            listingBytes: verified.bytes,
          });
          listingBytes += evidence.listing.body.bytes;
          allOfficial += evidence.allOfficialCsaLocations.length;
          rating.push(ratingUrlForListing(row.url));
          for (const location of evidence.targetCsaLocations)
            csa.push(location.url);
        }
        csa.sort(compareUtf8Bytes);
        rating.sort(compareUtf8Bytes);
        if (
          listingBytes !== 10_098_337 ||
          allOfficial !== 36_419 ||
          csa.length !== 36_168
        ) {
          fail("listing barrier does not reproduce preregistered inventory");
        }
        listingUrls = Object.freeze([...listingUrls]);
        ratingUrls = Object.freeze([...rating]);
        csaUrls = Object.freeze([...csa]);
        return Object.freeze({
          phases: Object.freeze([
            Object.freeze({
              name: "daily_ratings" as const,
              requests: Object.freeze(
                rating.map((url) => ({ kind: "daily_rating" as const, url })),
              ),
            }),
            Object.freeze({
              name: "period_inventory" as const,
              requests: Object.freeze([
                {
                  kind: "period_end_inventory" as const,
                  url: FLOODGATE_PERIOD_END_INVENTORY_URL,
                },
              ]),
            }),
            Object.freeze({
              name: "csa" as const,
              requests: Object.freeze(
                csa.map((url) => ({ kind: "csa" as const, url })),
              ),
            }),
          ]),
          audit: Object.freeze({
            listing_responses: listingRows.length,
            listing_bytes: listingBytes,
            all_official_csa_urls: allOfficial,
            target_csa_urls: csa.length,
            listing_identity_bytes:
              FLOODGATE_Q1_LISTING_IDENTITY_MANIFEST_EXPECTED.bytes,
            listing_identity_sha256:
              FLOODGATE_Q1_LISTING_IDENTITY_MANIFEST_EXPECTED.sha256,
          }),
        });
      },
      buildAndVerifyManifest: async () => {
        const manifest = await reconstructFloodgateRawLockManifest(lockRoot, {
          source: { revision, tracked_tree_clean: true },
          listing_urls: listingUrls,
          daily_rating_urls: ratingUrls,
          csa_urls: csaUrls,
        });
        const verification = await verifyFloodgateRawLockCandidate(
          lockRoot,
          manifest,
        );
        return Object.freeze({ manifest, verification });
      },
      publishManifest: async (candidate) => {
        const serialized = serializeFloodgateRawLockManifest(
          candidate.manifest,
        );
        await durableCreateNoClobber(
          path.join(lockRoot, floodgateRawFinalManifestPath()),
          serialized,
        );
      },
      audit: (record) => audit!.append(record),
    };
    return await runAcquisitionCore(listingRequests, dependencies);
  } catch (error) {
    primaryFailed = true;
    primaryFailure = error;
    throw error;
  } finally {
    await cleanupAcquisitionResources(
      audit,
      lease,
      primaryFailed,
      primaryFailure,
    );
  }
}
