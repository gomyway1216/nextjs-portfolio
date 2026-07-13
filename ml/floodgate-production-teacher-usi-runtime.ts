/**
 * Hardened, fixed production USI process pool for Floodgate teacher searches.
 *
 * This boundary executes a pinned engine against pinned evaluation data. It
 * does not read a dataset, publish a label, train a model, or establish playing
 * strength.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { TextDecoder } from "node:util";

import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS,
  FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
  verifyPinnedFloodgateProductionTeacherAssets,
  type FloodgateProductionTeacherAssetAuthorityReceipt,
} from "./floodgate-production-teacher-asset-authority";
import { UsiMultiPvAccumulator, type UsiMultiPvResult } from "./usi-multipv";
import { positionFromSfen } from "./shogi-sfen";

export const FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT =
  "shogi-floodgate-production-teacher-usi-runtime-v2" as const;
export const FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS =
  "initialized-hardened-pinned-usi-process-pool" as const;
export const FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY =
  "engine-runtime-search-protocol-and-owner-abort-fulfilled-after-process-group-reap-and-private-snapshot-cleanup-not-production-coordinator-wiring-teacher-label-training-holdout-or-playing-strength-evidence" as const;

export type FloodgateProductionTeacherUsiRuntimeExecutionBoundary =
  | "production-fixed-assets-and-runtime-dependencies"
  | "test-only-injected-asset-root-and-runtime-dependencies";

export type FloodgateProductionTeacherUsiRuntimePhase =
  | "abort"
  | "capture"
  | "asset-verification"
  | "snapshot"
  | "spawn"
  | "initialization"
  | "lease"
  | "reset"
  | "search"
  | "cleanup";

export class FloodgateProductionTeacherUsiRuntimeError extends Error {
  readonly phase: FloodgateProductionTeacherUsiRuntimePhase;
  readonly primary: unknown;

  constructor(
    phase: FloodgateProductionTeacherUsiRuntimePhase,
    message: string,
    primary: unknown,
  ) {
    super(`Floodgate production teacher USI runtime failed: ${message}`, {
      cause: primary,
    });
    this.name = "FloodgateProductionTeacherUsiRuntimeError";
    this.phase = phase;
    this.primary = primary;
  }
}

export interface FloodgateProductionTeacherUsiTimeouts {
  readonly usiMs: number;
  readonly readyMs: number;
  readonly searchMs: number;
  readonly termGraceMs: number;
  readonly killGraceMs: number;
}

export interface FloodgateProductionTeacherUsiLimits {
  readonly lineBytes: number;
  readonly stdoutBytesPerPhase: number;
  readonly stdoutLinesPerPhase?: number;
  readonly stderrBytesTotal: number;
}

export interface FloodgateProductionTeacherSpawnOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly stdio: ["pipe", "pipe", "pipe"];
  readonly shell: false;
  readonly windowsHide: true;
  readonly detached: true;
}

export type FloodgateProductionTeacherSpawnEngine = (
  file: string,
  args: readonly string[],
  options: FloodgateProductionTeacherSpawnOptions,
) => ChildProcessWithoutNullStreams;

export interface FloodgateProductionTeacherUsiRuntimeCoreDependencies {
  readonly assetRoot: string;
  readonly snapshotParent: string;
  readonly effectiveUserId: number;
  readonly verifyAssets: () => Promise<
    Readonly<
      FloodgateProductionTeacherAssetAuthorityReceipt<"test-only-injected-expected-registry-and-root">
    >
  >;
  readonly spawnEngine: FloodgateProductionTeacherSpawnEngine;
  readonly engineCount?: number;
  readonly depth?: number;
  readonly timeouts?: Readonly<FloodgateProductionTeacherUsiTimeouts>;
  readonly limits?: Readonly<FloodgateProductionTeacherUsiLimits>;
  readonly afterSourceCopyForTests?: () => void | Promise<void>;
  readonly beforeSnapshotRevalidationForTests?: () => void | Promise<void>;
  readonly afterOperationBeforeReturnForTests?: () => void | Promise<void>;
}

export type FloodgateProductionTeacherProposalResult = Omit<
  UsiMultiPvResult,
  "lines"
> & {
  readonly lines: readonly Readonly<
    Omit<UsiMultiPvResult["lines"][number], "pv"> & {
      readonly pv: readonly string[];
    }
  >[];
  readonly requested_multipv: number;
  readonly legal_move_count_evidence: Readonly<{
    readonly source: "caller-supplied-until-authenticated-by-v7-coordinator";
    readonly count: number;
  }>;
  readonly reset_before_search: true;
};

export type FloodgateProductionTeacherRescoreResult = Omit<
  UsiMultiPvResult,
  "lines"
> & {
  readonly lines: readonly Readonly<
    Omit<UsiMultiPvResult["lines"][number], "pv"> & {
      readonly pv: readonly string[];
    }
  >[];
  readonly requested_multipv: 1;
  readonly searchmoves: readonly [string];
  readonly reset_before_search: true;
};

export interface FloodgateProductionTeacherUsiRuntimeReceipt<
  TBoundary extends FloodgateProductionTeacherUsiRuntimeExecutionBoundary =
    FloodgateProductionTeacherUsiRuntimeExecutionBoundary,
> {
  readonly contract: typeof FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT;
  readonly status: typeof FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS;
  readonly claim_boundary: typeof FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY;
  readonly execution_boundary: TBoundary;
  readonly asset_authority_execution_boundary:
    | "production-fixed-registry-and-deployment-root"
    | "test-only-injected-expected-registry-and-root";
  readonly engine_id: string;
  readonly runtime: Readonly<{
    readonly engine_count: number;
    readonly threads_per_engine: 1;
    readonly hash_mb_per_engine: 64;
    readonly fv_scale: 20;
    readonly depth: number;
    readonly proposal_multipv_max: 12;
    readonly independent_rescore_multipv: 1;
    readonly no_process_arguments: true;
    readonly shell: false;
    readonly minimal_environment: true;
    readonly per_worker_private_directories: true;
    readonly queue_bound: number;
  }>;
  readonly fixed_options: readonly string[];
  readonly timeouts: Readonly<FloodgateProductionTeacherUsiTimeouts>;
  readonly limits: Readonly<Required<FloodgateProductionTeacherUsiLimits>>;
  readonly snapshot: Readonly<{
    readonly one_shared_private_snapshot: true;
    readonly source_authority_revalidated: true;
    readonly destination_revalidated: true;
    readonly engine: Readonly<{ bytes: number; sha256: string; mode: "0500" }>;
    readonly eval: Readonly<{ bytes: number; sha256: string; mode: "0400" }>;
  }>;
}

/** Public capability surface. The concrete constructor stays module-private. */
export interface FloodgateProductionTeacherUsiPool<
  TBoundary extends FloodgateProductionTeacherUsiRuntimeExecutionBoundary =
    FloodgateProductionTeacherUsiRuntimeExecutionBoundary,
> {
  readonly receipt: Readonly<
    FloodgateProductionTeacherUsiRuntimeReceipt<TBoundary>
  >;
  readonly poisoned: boolean;
  /**
   * Lifecycle state is checked before either entrypoint validates caller
   * input. Once poisoned, even invalid later calls share the pool's terminal
   * error; once an orderly close starts, even invalid later calls share the
   * pool's stable close error. Input validation applies only while the pool is
   * open.
   */
  propose(
    sfenInput: string,
    legalMoveCountInput: number,
  ): Promise<Readonly<FloodgateProductionTeacherProposalResult>>;
  rescore(
    sfenInput: string,
    moveInput: string,
  ): Promise<Readonly<FloodgateProductionTeacherRescoreResult>>;
  /**
   * Force-abort and reap when this call wins the lifecycle transition.
   * If close() already started, the first transition wins: this joins that
   * same bounded orderly cleanup without changing its error classification or
   * upgrading the pool to poisoned.
   * If forced cleanup fails, lifecycle callers share the raw cleanup Promise
   * and error while active, queued, and future operations share a distinct
   * terminal cleanup error aggregating the abort and raw cleanup failures.
   */
  abortAndReap(): Promise<void>;
  close(): Promise<void>;
}

const PRODUCTION_TIMEOUTS = Object.freeze({
  usiMs: 15_000,
  readyMs: 120_000,
  searchMs: 600_000,
  termGraceMs: 500,
  killGraceMs: 1_000,
});
const PRODUCTION_LIMITS = Object.freeze({
  lineBytes: 64 * 1024,
  stdoutBytesPerPhase: 16 * 1024 * 1024,
  stdoutLinesPerPhase: 65_536,
  stderrBytesTotal: 8 * 1024 * 1024,
});
const REQUIRED_OPTIONS = Object.freeze([
  "USI_Hash",
  "Threads",
  "EvalDir",
  "FV_SCALE",
  "USI_OwnBook",
  "BookFile",
  "NetworkDelay",
  "NetworkDelay2",
  "MultiPV",
] as const);
const MAX_LEGAL_MOVES = 593;
const MODE_MASK = BigInt(0o7777);
const FILE_TYPE_MASK = BigInt(0o170000);
const FILE_TYPE_REGULAR = BigInt(0o100000);

interface RuntimeConfiguration {
  readonly engineCount: number;
  readonly depth: number;
  readonly timeouts: Readonly<FloodgateProductionTeacherUsiTimeouts>;
  readonly limits: Readonly<Required<FloodgateProductionTeacherUsiLimits>>;
}

interface SnapshotIdentity {
  readonly bytes: number;
  readonly sha256: string;
  readonly mode: 0o400 | 0o500 | 0o600 | 0o700;
}

interface PrivateSnapshot {
  readonly root: string;
  readonly enginePath: string;
  readonly evalDir: string;
  readonly workers: readonly Readonly<{
    readonly root: string;
    readonly cwd: string;
    readonly home: string;
    readonly temp: string;
  }>[];
  readonly engine: Readonly<SnapshotIdentity>;
  readonly evaluation: Readonly<SnapshotIdentity>;
}

function runtimeFailure(
  phase: FloodgateProductionTeacherUsiRuntimePhase,
  primary: unknown,
): FloodgateProductionTeacherUsiRuntimeError {
  if (primary instanceof FloodgateProductionTeacherUsiRuntimeError)
    return primary;
  const message =
    primary instanceof Error && primary.message.length > 0
      ? primary.message
      : "fail-closed runtime error";
  return new FloodgateProductionTeacherUsiRuntimeError(
    phase,
    message.slice(0, 512),
    primary,
  );
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new Error(
      `${label} must be a safe integer in [${minimum}, ${maximum}]`,
    );
  }
  return value as number;
}

function canonicalAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value) ||
    path.resolve(value) !== value ||
    path.parse(value).root === value
  ) {
    throw new Error(`${label} must be a canonical non-root absolute path`);
  }
  return value;
}

function captureConfiguration(
  engineCount: number,
  depth: number,
  timeouts: Readonly<FloodgateProductionTeacherUsiTimeouts>,
  limits: Readonly<FloodgateProductionTeacherUsiLimits>,
): Readonly<RuntimeConfiguration> {
  return Object.freeze({
    engineCount: boundedInteger(engineCount, 1, 12, "engineCount"),
    depth: boundedInteger(depth, 1, 64, "depth"),
    timeouts: Object.freeze({
      usiMs: boundedInteger(timeouts.usiMs, 1, 600_000, "timeouts.usiMs"),
      readyMs: boundedInteger(timeouts.readyMs, 1, 600_000, "timeouts.readyMs"),
      searchMs: boundedInteger(
        timeouts.searchMs,
        1,
        3_600_000,
        "timeouts.searchMs",
      ),
      termGraceMs: boundedInteger(
        timeouts.termGraceMs,
        1,
        60_000,
        "timeouts.termGraceMs",
      ),
      killGraceMs: boundedInteger(
        timeouts.killGraceMs,
        1,
        60_000,
        "timeouts.killGraceMs",
      ),
    }),
    limits: Object.freeze({
      lineBytes: boundedInteger(
        limits.lineBytes,
        128,
        1024 * 1024,
        "limits.lineBytes",
      ),
      stdoutBytesPerPhase: boundedInteger(
        limits.stdoutBytesPerPhase,
        1024,
        256 * 1024 * 1024,
        "limits.stdoutBytesPerPhase",
      ),
      stdoutLinesPerPhase: boundedInteger(
        limits.stdoutLinesPerPhase ?? PRODUCTION_LIMITS.stdoutLinesPerPhase,
        1,
        10_000_000,
        "limits.stdoutLinesPerPhase",
      ),
      stderrBytesTotal: boundedInteger(
        limits.stderrBytesTotal,
        128,
        16 * 1024 * 1024,
        "limits.stderrBytesTotal",
      ),
    }),
  });
}

function fixedOptionCommands(evalDir: string): readonly string[] {
  return Object.freeze([
    `setoption name EvalDir value ${evalDir}`,
    "setoption name FV_SCALE value 20",
    "setoption name USI_Hash value 64",
    "setoption name Threads value 1",
    "setoption name USI_OwnBook value false",
    "setoption name BookFile value no_book",
    "setoption name NetworkDelay value 0",
    "setoption name NetworkDelay2 value 0",
  ]);
}

function validateSfen(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    !/^[!-~]+ [bw] [!-~]+ [1-9][0-9]*$/.test(value)
  ) {
    throw new Error("sfen must be one bounded canonical ASCII four-field SFEN");
  }
  const [board] = value.split(" ");
  if (
    !/^(?:[1-9PLNSGBRKplnsgbrk+]+\/){8}[1-9PLNSGBRKplnsgbrk+]+$/.test(board)
  ) {
    throw new Error("sfen board is malformed");
  }
  for (const rank of board.split("/")) {
    let squares = 0;
    for (let index = 0; index < rank.length; index += 1) {
      const token = rank[index];
      if (/[1-9]/.test(token)) squares += Number.parseInt(token, 10);
      else if (token === "+") {
        if (!/[PLNSBRplnsbr]/.test(rank[index + 1] ?? ""))
          throw new Error("sfen promotion marker is malformed");
      } else squares += 1;
    }
    if (squares !== 9)
      throw new Error("each sfen rank must contain nine squares");
  }
  positionFromSfen(value);
  return value;
}

function validateMove(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/.test(value)
  ) {
    throw new Error("move must be one canonical USI move");
  }
  return value;
}

interface FileStat {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly nlink: bigint;
  readonly uid: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}

function snapshotStat(value: fs.BigIntStats): Readonly<FileStat> {
  return Object.freeze({
    dev: value.dev,
    ino: value.ino,
    mode: value.mode,
    nlink: value.nlink,
    uid: value.uid,
    size: value.size,
    mtimeNs: value.mtimeNs,
    ctimeNs: value.ctimeNs,
  });
}

function sameStat(
  left: Readonly<FileStat>,
  right: Readonly<FileStat>,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function assertPrivateFile(
  stat: Readonly<FileStat>,
  identity: Readonly<SnapshotIdentity>,
  effectiveUserId: number,
  label: string,
): void {
  if (
    (stat.mode & FILE_TYPE_MASK) !== FILE_TYPE_REGULAR ||
    (stat.mode & MODE_MASK) !== BigInt(identity.mode) ||
    stat.uid !== BigInt(effectiveUserId) ||
    stat.nlink !== BigInt(1) ||
    stat.size !== BigInt(identity.bytes)
  ) {
    throw new Error(
      `${label} has an unsafe type, owner, mode, link count, or size`,
    );
  }
}

async function heldHash(
  file: string,
  identity: Readonly<SnapshotIdentity>,
  effectiveUserId: number,
  label: string,
): Promise<Readonly<FileStat>> {
  const pathBefore = snapshotStat(
    await fs.promises.lstat(file, { bigint: true }),
  );
  assertPrivateFile(pathBefore, identity, effectiveUserId, label);
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number") throw new Error("O_NOFOLLOW is required");
  const chunk = Buffer.alloc(Math.min(identity.bytes, 1024 * 1024));
  const hash = createHash("sha256");
  const handle = await fs.promises.open(file, fs.constants.O_RDONLY | noFollow);
  let closed = false;
  try {
    const heldBefore = snapshotStat(await handle.stat({ bigint: true }));
    if (!sameStat(pathBefore, heldBefore))
      throw new Error(`${label} changed before held hash`);
    let offset = 0;
    while (offset < identity.bytes) {
      const wanted = Math.min(chunk.byteLength, identity.bytes - offset);
      const { bytesRead } = await handle.read(chunk, 0, wanted, offset);
      if (bytesRead !== wanted)
        throw new Error(`${label} produced a short read`);
      hash.update(chunk.subarray(0, bytesRead));
      offset += bytesRead;
    }
    const extra = Buffer.alloc(1);
    try {
      if ((await handle.read(extra, 0, 1, identity.bytes)).bytesRead !== 0)
        throw new Error(`${label} exceeded its bound size`);
    } finally {
      extra.fill(0);
    }
    const heldAfter = snapshotStat(await handle.stat({ bigint: true }));
    if (!sameStat(heldBefore, heldAfter))
      throw new Error(`${label} changed during held hash`);
    await handle.close();
    closed = true;
    const pathAfter = snapshotStat(
      await fs.promises.lstat(file, { bigint: true }),
    );
    if (!sameStat(pathBefore, pathAfter))
      throw new Error(`${label} pathname changed during hash`);
    if (hash.digest("hex") !== identity.sha256)
      throw new Error(`${label} differs from its authority SHA-256`);
    return pathAfter;
  } finally {
    chunk.fill(0);
    if (!closed) await handle.close().catch(() => undefined);
  }
}

async function copyPinnedFile(
  source: string,
  destination: string,
  sourceIdentity: Readonly<SnapshotIdentity>,
  destinationMode: 0o400 | 0o500,
  effectiveUserId: number,
  label: string,
): Promise<void> {
  const destinationIdentity = Object.freeze({
    ...sourceIdentity,
    mode: destinationMode,
  });
  const sourceBefore = await heldHash(
    source,
    sourceIdentity,
    effectiveUserId,
    `${label} source`,
  );
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== "number") throw new Error("O_NOFOLLOW is required");
  const chunk = Buffer.alloc(Math.min(sourceIdentity.bytes, 1024 * 1024));
  const sourceHandle = await fs.promises.open(
    source,
    fs.constants.O_RDONLY | noFollow,
  );
  let destinationHandle: fs.promises.FileHandle;
  try {
    destinationHandle = await fs.promises.open(
      destination,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        noFollow,
      sourceIdentity.mode,
    );
  } catch (primary) {
    chunk.fill(0);
    await sourceHandle.close().catch(() => undefined);
    throw primary;
  }
  let sourceClosed = false;
  let destinationClosed = false;
  try {
    const sourceHeldBefore = snapshotStat(
      await sourceHandle.stat({ bigint: true }),
    );
    if (!sameStat(sourceBefore, sourceHeldBefore))
      throw new Error(`${label} source changed before copy`);
    await destinationHandle.chmod(sourceIdentity.mode);
    let offset = 0;
    while (offset < sourceIdentity.bytes) {
      const wanted = Math.min(chunk.byteLength, sourceIdentity.bytes - offset);
      const { bytesRead } = await sourceHandle.read(chunk, 0, wanted, offset);
      if (bytesRead !== wanted)
        throw new Error(`${label} source produced a short copy read`);
      let written = 0;
      while (written < bytesRead) {
        const result = await destinationHandle.write(
          chunk,
          written,
          bytesRead - written,
          offset + written,
        );
        if (result.bytesWritten <= 0)
          throw new Error(`${label} destination produced a short write`);
        written += result.bytesWritten;
      }
      offset += bytesRead;
    }
    await destinationHandle.sync();
    const sourceHeldAfter = snapshotStat(
      await sourceHandle.stat({ bigint: true }),
    );
    if (!sameStat(sourceHeldBefore, sourceHeldAfter))
      throw new Error(`${label} source changed during copy`);
    await sourceHandle.close();
    sourceClosed = true;
    await destinationHandle.chmod(destinationMode);
    await destinationHandle.close();
    destinationClosed = true;
    const sourceAfter = snapshotStat(
      await fs.promises.lstat(source, { bigint: true }),
    );
    if (!sameStat(sourceBefore, sourceAfter))
      throw new Error(`${label} source pathname changed during copy`);
    await heldHash(
      destination,
      destinationIdentity,
      effectiveUserId,
      `${label} destination`,
    );
  } finally {
    chunk.fill(0);
    if (!sourceClosed) await sourceHandle.close().catch(() => undefined);
    if (!destinationClosed)
      await destinationHandle.close().catch(() => undefined);
  }
}

async function assertPrivateDirectory(
  directory: string,
  effectiveUserId: number,
  label: string,
  mode: 0o500 | 0o700 = 0o700,
): Promise<void> {
  const real = await fs.promises.realpath(directory);
  const stat = await fs.promises.lstat(directory, { bigint: true });
  if (
    real !== directory ||
    !stat.isDirectory() ||
    stat.uid !== BigInt(effectiveUserId) ||
    (stat.mode & MODE_MASK) !== BigInt(mode)
  ) {
    throw new Error(
      `${label} must be a current-euid-owned exact ${mode.toString(8)} real directory`,
    );
  }
}

async function ensurePrivateDirectory(
  directory: string,
  effectiveUserId: number,
  label: string,
): Promise<void> {
  try {
    await fs.promises.mkdir(directory, { mode: 0o700 });
  } catch (primary) {
    if (
      primary === null ||
      typeof primary !== "object" ||
      !("code" in primary) ||
      Reflect.get(primary, "code") !== "EEXIST"
    ) {
      throw primary;
    }
  }
  await assertPrivateDirectory(directory, effectiveUserId, label);
}

async function createPrivateSnapshot(
  assetRoot: string,
  snapshotParent: string,
  effectiveUserId: number,
  authority: Readonly<FloodgateProductionTeacherAssetAuthorityReceipt>,
  engineCount: number,
): Promise<Readonly<PrivateSnapshot>> {
  await assertPrivateDirectory(
    snapshotParent,
    effectiveUserId,
    "snapshot parent",
  );
  const root = await fs.promises.mkdtemp(
    path.join(snapshotParent, "shogi-teacher-runtime-"),
  );
  await fs.promises.chmod(root, 0o700);
  const engineDir = path.join(root, "engine");
  const evalDir = path.join(root, "eval");
  const workersDir = path.join(root, "workers");
  try {
    for (const directory of [engineDir, evalDir, workersDir]) {
      await fs.promises.mkdir(directory, { mode: 0o700 });
      await fs.promises.chmod(directory, 0o700);
    }
    const workers: Array<
      Readonly<{
        root: string;
        cwd: string;
        home: string;
        temp: string;
      }>
    > = [];
    for (let index = 0; index < engineCount; index += 1) {
      const workerRoot = path.join(
        workersDir,
        `worker-${index.toString(10).padStart(2, "0")}`,
      );
      const cwd = path.join(workerRoot, "cwd");
      const home = path.join(workerRoot, "home");
      const temp = path.join(workerRoot, "tmp");
      await fs.promises.mkdir(workerRoot, { mode: 0o700 });
      await fs.promises.chmod(workerRoot, 0o700);
      for (const directory of [cwd, home, temp]) {
        await fs.promises.mkdir(directory, { mode: 0o700 });
        await fs.promises.chmod(directory, 0o700);
      }
      workers.push(Object.freeze({ root: workerRoot, cwd, home, temp }));
    }
    const engineSource = Object.freeze({
      bytes: authority.assets.engine.yaneuraou.bytes,
      sha256: authority.assets.engine.yaneuraou.sha256,
      mode: 0o700 as const,
    });
    const evaluationSource = Object.freeze({
      bytes: authority.assets.eval.nn.bytes,
      sha256: authority.assets.eval.nn.sha256,
      mode: 0o600 as const,
    });
    const engine = Object.freeze({ ...engineSource, mode: 0o500 as const });
    const evaluation = Object.freeze({
      ...evaluationSource,
      mode: 0o400 as const,
    });
    const enginePath = path.join(engineDir, "yaneuraou");
    await copyPinnedFile(
      path.join(assetRoot, "engine", "yaneuraou"),
      enginePath,
      engineSource,
      0o500,
      effectiveUserId,
      "engine",
    );
    await copyPinnedFile(
      path.join(assetRoot, "eval", "nn.bin"),
      path.join(evalDir, "nn.bin"),
      evaluationSource,
      0o400,
      effectiveUserId,
      "evaluation",
    );
    for (const directory of [engineDir, evalDir, workersDir, root])
      await fs.promises.chmod(directory, 0o500);
    return Object.freeze({
      root,
      enginePath,
      evalDir,
      workers: Object.freeze(workers),
      engine,
      evaluation,
    });
  } catch (primary) {
    try {
      await fs.promises.rm(root, { recursive: true, force: true });
    } catch (cleanupFailure) {
      throw new AggregateError(
        [primary, cleanupFailure],
        "private snapshot creation and cleanup failed",
      );
    }
    throw primary;
  }
}

async function revalidateSnapshot(
  snapshot: Readonly<PrivateSnapshot>,
  effectiveUserId: number,
  requireEmptyWorkers: boolean,
): Promise<void> {
  await assertPrivateDirectory(
    snapshot.root,
    effectiveUserId,
    "snapshot root",
    0o500,
  );
  await assertPrivateDirectory(
    path.join(snapshot.root, "engine"),
    effectiveUserId,
    "snapshot engine directory",
    0o500,
  );
  await assertPrivateDirectory(
    snapshot.evalDir,
    effectiveUserId,
    "snapshot eval",
    0o500,
  );
  await assertPrivateDirectory(
    path.join(snapshot.root, "workers"),
    effectiveUserId,
    "snapshot workers",
    0o500,
  );
  for (const worker of snapshot.workers) {
    await assertPrivateDirectory(worker.root, effectiveUserId, "worker root");
    await assertPrivateDirectory(worker.cwd, effectiveUserId, "worker cwd");
    await assertPrivateDirectory(worker.home, effectiveUserId, "worker home");
    await assertPrivateDirectory(worker.temp, effectiveUserId, "worker tmp");
    if (
      (await fs.promises.readdir(worker.root)).sort().join("\0") !==
      ["cwd", "home", "tmp"].join("\0")
    )
      throw new Error("worker root entries are not exact");
    if (requireEmptyWorkers) {
      for (const directory of [worker.cwd, worker.home, worker.temp]) {
        if ((await fs.promises.readdir(directory)).length !== 0)
          throw new Error(
            "worker process directory was not empty before spawn",
          );
      }
    }
  }
  const workerEntries = await fs.promises.readdir(
    path.join(snapshot.root, "workers"),
  );
  if (
    workerEntries.sort().join("\0") !==
    snapshot.workers
      .map((worker) => path.basename(worker.root))
      .sort()
      .join("\0")
  )
    throw new Error("snapshot worker entries are not exact");
  const entries = (await fs.promises.readdir(snapshot.root)).sort();
  if (entries.join("\0") !== ["engine", "eval", "workers"].sort().join("\0"))
    throw new Error("snapshot root entries are not exact");
  if (
    (await fs.promises.readdir(path.join(snapshot.root, "engine"))).join(
      "\0",
    ) !== "yaneuraou"
  )
    throw new Error("snapshot engine entries are not exact");
  if ((await fs.promises.readdir(snapshot.evalDir)).join("\0") !== "nn.bin")
    throw new Error("snapshot eval entries are not exact");
  await heldHash(
    snapshot.enginePath,
    snapshot.engine,
    effectiveUserId,
    "snapshot engine",
  );
  await heldHash(
    path.join(snapshot.evalDir, "nn.bin"),
    snapshot.evaluation,
    effectiveUserId,
    "snapshot evaluation",
  );
}

async function removePrivateSnapshot(
  root: string,
  effectiveUserId: number,
): Promise<void> {
  const rootReal = await fs.promises.realpath(root);
  const rootStat = await fs.promises.lstat(root, { bigint: true });
  if (
    rootReal !== root ||
    !rootStat.isDirectory() ||
    rootStat.uid !== BigInt(effectiveUserId)
  )
    throw new Error("refusing to remove an unowned or aliased snapshot root");
  const makeWritable = async (directory: string): Promise<void> => {
    await fs.promises.chmod(directory, 0o700);
    for (const entry of await fs.promises.readdir(directory, {
      withFileTypes: true,
    })) {
      if (entry.isDirectory())
        await makeWritable(path.join(directory, entry.name));
    }
  };
  await makeWritable(root);
  await fs.promises.rm(root, { recursive: true, force: false });
}

function sameAuthorityBinding(
  left: Readonly<FloodgateProductionTeacherAssetAuthorityReceipt>,
  right: Readonly<FloodgateProductionTeacherAssetAuthorityReceipt>,
): boolean {
  const evidence = (
    receipt: Readonly<FloodgateProductionTeacherAssetAuthorityReceipt>,
  ) =>
    JSON.stringify({
      boundary: receipt.execution_boundary,
      engine: receipt.assets.engine.yaneuraou,
      evaluation: receipt.assets.eval.nn,
      engineId: receipt.engine.engine_id,
    });
  return evidence(left) === evidence(right);
}

type PhaseLineResult<T> =
  | Readonly<{ readonly done: false }>
  | Readonly<{ readonly done: true; readonly value: T }>;

interface ActivePhase<T = unknown> {
  readonly name: string;
  readonly onLine: (line: string) => PhaseLineResult<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  stdoutBytes: number;
  stdoutLines: number;
}

class HardenedUsiProcess {
  private child: ChildProcessWithoutNullStreams | null = null;
  private phase: ActivePhase | null = null;
  private stdoutBuffer = Buffer.alloc(0);
  private stderrBytes = 0;
  private closed = false;
  private terminating = false;
  private fatalError: Error | null = null;
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private fatalHandler: ((error: Error) => void) | null = null;

  constructor(
    private readonly enginePath: string,
    private readonly snapshot: Readonly<PrivateSnapshot>,
    private readonly worker: Readonly<PrivateSnapshot["workers"][number]>,
    private readonly engineId: string,
    private readonly spawnEngine: FloodgateProductionTeacherSpawnEngine,
    private readonly configuration: Readonly<RuntimeConfiguration>,
  ) {}

  setFatalHandler(handler: (error: Error) => void): void {
    this.fatalHandler = handler;
    if (this.fatalError !== null)
      queueMicrotask(() => handler(this.fatalError!));
  }

  private fatal(primary: unknown): void {
    if (this.terminating) return;
    const error =
      primary instanceof Error
        ? primary
        : new Error("USI process failed closed");
    if (this.fatalError !== null) return;
    this.fatalError = error;
    const active = this.phase;
    this.phase = null;
    if (active !== null) {
      clearTimeout(active.timer);
      active.reject(error);
    }
    this.fatalHandler?.(error);
  }

  private consumeStdout(chunk: Buffer): void {
    const active = this.phase;
    if (active === null) {
      this.fatal(new Error("USI process emitted unsolicited stdout"));
      return;
    }
    active.stdoutBytes += chunk.byteLength;
    if (active.stdoutBytes > this.configuration.limits.stdoutBytesPerPhase) {
      this.fatal(
        new Error(`USI ${active.name} stdout exceeded its byte bound`),
      );
      return;
    }
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
    if (this.stdoutBuffer.byteLength > this.configuration.limits.lineBytes) {
      const newline = this.stdoutBuffer.indexOf(0x0a);
      if (newline < 0 || newline > this.configuration.limits.lineBytes) {
        this.fatal(
          new Error(`USI ${active.name} line exceeded its byte bound`),
        );
        return;
      }
    }
    let newline: number;
    while ((newline = this.stdoutBuffer.indexOf(0x0a)) >= 0) {
      if (newline > this.configuration.limits.lineBytes) {
        this.fatal(
          new Error(`USI ${active.name} line exceeded its byte bound`),
        );
        return;
      }
      let lineBytes = this.stdoutBuffer.subarray(0, newline);
      this.stdoutBuffer = this.stdoutBuffer.subarray(newline + 1);
      active.stdoutLines += 1;
      if (active.stdoutLines > this.configuration.limits.stdoutLinesPerPhase) {
        this.fatal(
          new Error(`USI ${active.name} line count exceeded its bound`),
        );
        return;
      }
      if (lineBytes.at(-1) === 0x0d) lineBytes = lineBytes.subarray(0, -1);
      let line: string;
      try {
        line = this.decoder.decode(lineBytes);
      } catch {
        this.fatal(new Error(`USI ${active.name} emitted invalid UTF-8`));
        return;
      }
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(line)) {
        this.fatal(new Error(`USI ${active.name} emitted a control character`));
        return;
      }
      const current = this.phase;
      if (current === null || current !== active) {
        this.fatal(
          new Error("USI process emitted stdout after phase completion"),
        );
        return;
      }
      try {
        const result = active.onLine(line);
        if (!result.done) continue;
        if (this.stdoutBuffer.byteLength !== 0) {
          this.fatal(
            new Error(
              `USI ${active.name} completed with trailing stdout bytes`,
            ),
          );
          return;
        }
        clearTimeout(active.timer);
        this.phase = null;
        active.resolve(result.value);
      } catch (primary) {
        this.fatal(primary);
        return;
      }
    }
  }

  private write(command: string): void {
    if (
      command.length === 0 ||
      Buffer.byteLength(command, "utf8") > 1024 ||
      /[\r\n\u0000]/.test(command)
    ) {
      throw new Error("USI command is unsafe or exceeds its byte bound");
    }
    if (this.fatalError !== null) throw this.fatalError;
    const child = this.child;
    if (child === null || child.stdin.destroyed || !child.stdin.writable) {
      throw new Error("USI stdin is not writable");
    }
    child.stdin.write(`${command}\n`, (error) => {
      if (error !== null && error !== undefined) this.fatal(error);
    });
  }

  private runPhase<T>(
    name: string,
    timeoutMs: number,
    onLine: (line: string) => PhaseLineResult<T>,
    writeCommands: () => void,
  ): Promise<T> {
    if (this.terminating || this.closed)
      return Promise.reject(new Error("USI process is terminating or closed"));
    if (this.phase !== null)
      return Promise.reject(new Error("USI phase overlap"));
    if (this.fatalError !== null) return Promise.reject(this.fatalError);
    if (this.child === null)
      return Promise.reject(new Error("USI process is absent"));
    if (this.stdoutBuffer.byteLength !== 0)
      return Promise.reject(
        new Error("USI phase began with unterminated stdout"),
      );
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.phase !== active) return;
        const error = new Error(`USI ${name} timeout after ${timeoutMs}ms`);
        this.fatal(error);
      }, timeoutMs);
      const active: ActivePhase<T> = {
        name,
        onLine,
        resolve,
        reject,
        timer,
        stdoutBytes: 0,
        stdoutLines: 0,
      };
      // Install the waiter before any command that can synchronously provoke a
      // response from a synthetic or unusually fast native peer.
      this.phase = active as ActivePhase;
      try {
        writeCommands();
      } catch (primary) {
        const error =
          primary instanceof Error ? primary : new Error("USI write failed");
        this.fatal(error);
      }
    });
  }

  async initialize(): Promise<void> {
    if (this.child !== null)
      throw new Error("USI process is already initialized");
    const env = Object.freeze({
      HOME: this.worker.home,
      TMPDIR: this.worker.temp,
      LANG: "C",
      LC_ALL: "C",
      PATH: "/usr/bin:/bin",
      TZ: "UTC",
    });
    const child = this.spawnEngine(this.enginePath, Object.freeze([]), {
      cwd: this.worker.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      detached: true,
    });
    this.child = child;
    child.stdout.on("data", (chunk: Buffer | string) => {
      this.consumeStdout(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      this.stderrBytes += Buffer.byteLength(chunk);
      if (this.stderrBytes > this.configuration.limits.stderrBytesTotal)
        this.fatal(new Error("USI stderr exceeded its total byte bound"));
    });
    child.stdin.on("error", (error) => this.fatal(error));
    child.on("error", (error) => this.fatal(error));
    child.on("close", (code, signal) => {
      this.closed = true;
      if (!this.terminating)
        this.fatal(
          new Error(
            `USI process closed unexpectedly (code=${code}, signal=${signal})`,
          ),
        );
    });

    const ids: string[] = [];
    const options = new Map<string, number>();
    await this.runPhase(
      "usi",
      this.configuration.timeouts.usiMs,
      (line) => {
        if (line.startsWith("id name ")) {
          ids.push(line.slice("id name ".length));
          return { done: false } as const;
        }
        if (line.startsWith("id author ")) return { done: false } as const;
        if (line.startsWith("option name ")) {
          const match =
            /^option name (.+?) type (?:check|spin|string|button|combo)(?: |$)/.exec(
              line,
            );
          if (match === null)
            throw new Error("USI advertised a malformed option");
          options.set(match[1], (options.get(match[1]) ?? 0) + 1);
          return { done: false } as const;
        }
        if (line !== "usiok")
          throw new Error("USI handshake emitted an unexpected line");
        if (ids.length !== 1 || ids[0] !== this.engineId)
          throw new Error(
            "USI id name does not exactly match the pinned receipt",
          );
        for (const required of REQUIRED_OPTIONS) {
          if (options.get(required) !== 1)
            throw new Error(
              `USI required option ${required} is missing or duplicated`,
            );
        }
        return { done: true, value: undefined } as const;
      },
      () => this.write("usi"),
    );
    const optionsTranscript = fixedOptionCommands(this.snapshot.evalDir);
    await this.runPhase(
      "initial-ready",
      this.configuration.timeouts.readyMs,
      (line) => {
        if (line === "readyok")
          return { done: true, value: undefined } as const;
        if (line.startsWith("info string ")) return { done: false } as const;
        throw new Error("USI initial-ready emitted an unexpected line");
      },
      () => {
        for (const command of optionsTranscript) this.write(command);
        this.write("isready");
      },
    );
    this.write("usinewgame");
  }

  async reset(): Promise<void> {
    await this.runPhase(
      "reset-ready",
      this.configuration.timeouts.readyMs,
      (line) => {
        if (line === "readyok")
          return { done: true, value: undefined } as const;
        if (line.startsWith("info string ")) return { done: false } as const;
        throw new Error(
          `USI reset-ready emitted an unexpected line: ${JSON.stringify(line.slice(0, 200))}`,
        );
      },
      () => this.write("isready"),
    );
    this.write("usinewgame");
  }

  search(
    sfen: string,
    multipv: number,
    searchmoves: readonly string[],
  ): Promise<UsiMultiPvResult> {
    const accumulator = new UsiMultiPvAccumulator({
      multipv,
      requiredDepth: this.configuration.depth,
      allowTerminalMateBeforeRequiredDepth:
        multipv === 1 && searchmoves.length === 1,
    });
    return this.runSearchWithCompletionBarrier(
      accumulator,
      sfen,
      multipv,
      searchmoves,
    );
  }

  private async runSearchWithCompletionBarrier(
    accumulator: UsiMultiPvAccumulator,
    sfen: string,
    multipv: number,
    searchmoves: readonly string[],
  ): Promise<UsiMultiPvResult> {
    const result = await this.runPhase<UsiMultiPvResult>(
      "search",
      this.configuration.timeouts.searchMs,
      (line) => {
        if (!line.startsWith("info ") && !/^bestmove(?: |$)/.test(line))
          throw new Error("USI search emitted an unexpected line");
        accumulator.push(`${line}\n`);
        if (!/^bestmove(?: |$)/.test(line)) return { done: false } as const;
        return { done: true, value: accumulator.finish() } as const;
      },
      () => {
        this.write(`setoption name MultiPV value ${multipv}`);
        this.write(`position sfen ${sfen}`);
        this.write(
          `go depth ${this.configuration.depth}${
            searchmoves.length === 0
              ? ""
              : ` searchmoves ${searchmoves.join(" ")}`
          }`,
        );
      },
    );
    // After bestmove, confirm readyok quiescence from the compliant pinned
    // engine and reject structured output. Bounded info-string diagnostics
    // and the compromised-engine temporal boundary are documented nonclaims.
    await this.reset();
    return result;
  }

  async terminate(poisoned: boolean): Promise<void> {
    if (this.terminating) return;
    this.terminating = true;
    const active = this.phase;
    this.phase = null;
    if (active !== null) {
      clearTimeout(active.timer);
      active.reject(new Error("USI process is terminating"));
    }
    const child = this.child;
    if (child === null) return;
    const signalGroup = (signal: NodeJS.Signals): boolean => {
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, signal);
          return true;
        } catch {
          // A test double or already-exited group may require the child handle.
        }
      }
      try {
        return child.kill(signal);
      } catch {
        return false;
      }
    };
    const groupAlive = (): boolean => {
      if (child.pid === undefined) return !this.closed;
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let leaderClosed = child.exitCode !== null || child.signalCode !== null;
      const finish = (failure?: Error) => {
        if (settled) return;
        settled = true;
        child.off("close", closed);
        clearTimeout(termTimer);
        clearTimeout(killTimer);
        clearTimeout(boundTimer);
        this.child = null;
        if (failure === undefined) resolve();
        else reject(failure);
      };
      const closed = () => {
        if (settled) return;
        leaderClosed = true;
        // Even after the leader closes, terminate any descendant that retained
        // the detached process group.
        signalGroup("SIGTERM");
        if (!groupAlive()) finish();
      };
      child.once("close", closed);
      const termTimer = setTimeout(
        () => signalGroup("SIGTERM"),
        poisoned ? 0 : this.configuration.timeouts.termGraceMs,
      );
      const killTimer = setTimeout(() => {
        signalGroup("SIGKILL");
        if (leaderClosed && !groupAlive()) finish();
      }, this.configuration.timeouts.termGraceMs + this.configuration.timeouts.killGraceMs);
      const boundTimer = setTimeout(
        () => {
          if (leaderClosed && !groupAlive()) finish();
          else
            finish(
              new Error(
                "USI process group was not reaped within cleanup bound",
              ),
            );
        },
        this.configuration.timeouts.termGraceMs +
          2 * this.configuration.timeouts.killGraceMs,
      );
      if (!poisoned) {
        try {
          child.stdin.write("quit\n");
          child.stdin.end();
        } catch {
          signalGroup("SIGTERM");
        }
      } else signalGroup("SIGTERM");
      if (leaderClosed) closed();
    });
  }
}

interface LeaseWaiter {
  readonly resolve: (engine: HardenedUsiProcess) => void;
  readonly reject: (error: Error) => void;
}

class HardenedFloodgateProductionTeacherUsiPool<
  TBoundary extends FloodgateProductionTeacherUsiRuntimeExecutionBoundary =
    FloodgateProductionTeacherUsiRuntimeExecutionBoundary,
> implements FloodgateProductionTeacherUsiPool<TBoundary> {
  readonly receipt: Readonly<
    FloodgateProductionTeacherUsiRuntimeReceipt<TBoundary>
  >;
  private readonly available: HardenedUsiProcess[];
  private readonly waiters: LeaseWaiter[] = [];
  private readonly queueBound: number;
  private readonly closeError = new Error("USI pool closed");
  private poisonError: Error | null = null;
  private closing = false;
  private cleanupPromise: Promise<void> | null = null;
  private terminalErrorPromise: Promise<Error> | null = null;

  constructor(
    receipt: Readonly<FloodgateProductionTeacherUsiRuntimeReceipt<TBoundary>>,
    private readonly engines: readonly HardenedUsiProcess[],
    private readonly snapshot: Readonly<PrivateSnapshot>,
    private readonly effectiveUserId: number,
    private readonly afterOperationBeforeReturn?: () => void | Promise<void>,
  ) {
    this.receipt = receipt;
    this.available = [...engines];
    this.queueBound = receipt.runtime.queue_bound;
    for (const engine of engines)
      engine.setFatalHandler((error) => this.poison(error));
  }

  get poisoned(): boolean {
    return this.poisonError !== null;
  }

  private acquire(): Promise<HardenedUsiProcess> {
    if (this.poisonError !== null) return this.rejectWithTerminalError();
    if (this.closing) return Promise.reject(this.closeError);
    const engine = this.available.pop();
    if (engine !== undefined) return Promise.resolve(engine);
    if (this.waiters.length >= this.queueBound)
      return Promise.reject(new Error("USI pool lease queue is full"));
    return new Promise<HardenedUsiProcess>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  private release(engine: HardenedUsiProcess): void {
    if (this.poisonError !== null || this.closing) return;
    const waiter = this.waiters.shift();
    if (waiter === undefined) this.available.push(engine);
    else waiter.resolve(engine);
  }

  private poison(primary: unknown, phase: "abort" | "search" = "search"): void {
    if (this.poisonError !== null || this.closing) return;
    const poisonError = runtimeFailure(phase, primary);
    this.poisonError = poisonError;
    this.cleanupPromise = this.cleanup(true);
    this.terminalErrorPromise = this.cleanupPromise.then(
      () => poisonError,
      (cleanupFailure) =>
        runtimeFailure(
          "cleanup",
          new AggregateError(
            [poisonError, cleanupFailure],
            "USI pool poison and cleanup both failed",
          ),
        ),
    );
    for (const waiter of this.waiters.splice(0)) {
      void this.terminalErrorPromise.then((terminalError) =>
        waiter.reject(terminalError),
      );
    }
  }

  private rejectWithTerminalError<T>(): Promise<T> {
    const terminalErrorPromise = this.terminalErrorPromise;
    if (terminalErrorPromise === null)
      return Promise.reject(
        this.poisonError ?? new Error("USI pool has no terminal error"),
      );
    return terminalErrorPromise.then((terminalError) => {
      throw terminalError;
    });
  }

  private lifecyclePreflight<T>(): Promise<T> | null {
    if (this.poisonError !== null) return this.rejectWithTerminalError<T>();
    if (this.closing) return Promise.reject(this.closeError);
    return null;
  }

  private async withEngine<T>(
    operation: (engine: HardenedUsiProcess) => Promise<T>,
  ): Promise<T> {
    const engine = await this.acquire();
    try {
      if (this.poisonError !== null) throw this.poisonError;
      if (this.closing) throw new Error("USI pool is closing");
      const result = await operation(engine);
      if (this.afterOperationBeforeReturn !== undefined)
        await this.afterOperationBeforeReturn();
      // Another worker may have poisoned the shared pool while this operation
      // was still in flight. Never let a locally successful result escape a
      // globally failed execution boundary.
      if (this.poisonError !== null) throw this.poisonError;
      this.release(engine);
      return result;
    } catch (primary) {
      if (!this.closing) this.poison(primary);
      if (this.poisonError !== null) return this.rejectWithTerminalError<T>();
      try {
        await this.cleanupPromise;
      } catch (cleanupFailure) {
        throw runtimeFailure(
          "cleanup",
          new AggregateError(
            [primary, cleanupFailure],
            "USI operation and cleanup both failed",
          ),
        );
      }
      throw this.poisonError ?? runtimeFailure("search", primary);
    }
  }

  async propose(
    sfenInput: string,
    legalMoveCountInput: number,
  ): Promise<Readonly<FloodgateProductionTeacherProposalResult>> {
    const lifecycleFailure =
      this.lifecyclePreflight<
        Readonly<FloodgateProductionTeacherProposalResult>
      >();
    if (lifecycleFailure !== null) return lifecycleFailure;
    const sfen = validateSfen(sfenInput);
    const legalMoveCount = boundedInteger(
      legalMoveCountInput,
      2,
      MAX_LEGAL_MOVES,
      "legalMoveCount",
    );
    const multipv = Math.min(12, legalMoveCount);
    return this.withEngine(async (engine) => {
      await engine.reset();
      const result = await engine.search(sfen, multipv, []);
      return Object.freeze({
        ...result,
        lines: Object.freeze(
          result.lines.map((line) =>
            Object.freeze({
              ...line,
              pv: Object.freeze([...line.pv]),
            }),
          ),
        ),
        requested_multipv: multipv,
        legal_move_count_evidence: Object.freeze({
          source:
            "caller-supplied-until-authenticated-by-v7-coordinator" as const,
          count: legalMoveCount,
        }),
        reset_before_search: true as const,
      });
    });
  }

  async rescore(
    sfenInput: string,
    moveInput: string,
  ): Promise<Readonly<FloodgateProductionTeacherRescoreResult>> {
    const lifecycleFailure =
      this.lifecyclePreflight<
        Readonly<FloodgateProductionTeacherRescoreResult>
      >();
    if (lifecycleFailure !== null) return lifecycleFailure;
    const sfen = validateSfen(sfenInput);
    const move = validateMove(moveInput);
    return this.withEngine(async (engine) => {
      await engine.reset();
      const result = await engine.search(sfen, 1, [move]);
      if (
        result.bestmove !== move ||
        result.lines.length !== 1 ||
        result.lines[0].multipv !== 1 ||
        result.lines[0].move !== move
      ) {
        throw new Error(
          "independent rescore did not return exactly its forced move",
        );
      }
      return Object.freeze({
        ...result,
        lines: Object.freeze(
          result.lines.map((line) =>
            Object.freeze({
              ...line,
              pv: Object.freeze([...line.pv]),
            }),
          ),
        ),
        requested_multipv: 1 as const,
        searchmoves: Object.freeze([move]) as readonly [string],
        reset_before_search: true as const,
      });
    });
  }

  private async cleanup(poisoned: boolean): Promise<void> {
    const failures: unknown[] = [];
    const terminations = await Promise.allSettled(
      this.engines.map((engine) => engine.terminate(poisoned)),
    );
    for (const result of terminations)
      if (result.status === "rejected") failures.push(result.reason);
    try {
      await revalidateSnapshot(this.snapshot, this.effectiveUserId, false);
    } catch (primary) {
      failures.push(primary);
    }
    try {
      await removePrivateSnapshot(this.snapshot.root, this.effectiveUserId);
    } catch (primary) {
      failures.push(primary);
    }
    if (failures.length > 0)
      throw runtimeFailure(
        "cleanup",
        new AggregateError(failures, "one or more USI cleanup steps failed"),
      );
  }

  abortAndReap(): Promise<void> {
    // The first lifecycle transition owns cleanup. A close-first call already
    // has bounded process-group reaping and snapshot removal in progress, so a
    // later abort joins that exact Promise without reclassification or poison.
    if (this.cleanupPromise !== null) return this.cleanupPromise;
    this.poison(new Error("USI pool aborted by its lifecycle owner"), "abort");
    if (this.cleanupPromise === null) {
      return Promise.reject(
        new Error("USI pool abort did not establish cleanup"),
      );
    }
    return this.cleanupPromise;
  }

  close(): Promise<void> {
    if (this.cleanupPromise !== null) return this.cleanupPromise;
    this.closing = true;
    for (const waiter of this.waiters.splice(0)) waiter.reject(this.closeError);
    this.cleanupPromise = this.cleanup(false);
    return this.cleanupPromise;
  }
}

function createPublicPoolFacade<
  TBoundary extends FloodgateProductionTeacherUsiRuntimeExecutionBoundary,
>(
  implementation: HardenedFloodgateProductionTeacherUsiPool<TBoundary>,
): FloodgateProductionTeacherUsiPool<TBoundary> {
  const facade = Object.create(
    null,
  ) as FloodgateProductionTeacherUsiPool<TBoundary>;
  const poisoned = Object.freeze(() => implementation.poisoned);
  const propose = Object.freeze(
    (sfenInput: string, legalMoveCountInput: number) =>
      implementation.propose(sfenInput, legalMoveCountInput),
  );
  const rescore = Object.freeze((sfenInput: string, moveInput: string) =>
    implementation.rescore(sfenInput, moveInput),
  );
  const abortAndReap = Object.freeze(() => implementation.abortAndReap());
  const close = Object.freeze(() => implementation.close());
  Object.defineProperties(facade, {
    receipt: {
      value: implementation.receipt,
      enumerable: true,
      writable: false,
      configurable: false,
    },
    poisoned: {
      get: poisoned,
      enumerable: true,
      configurable: false,
    },
    propose: {
      value: propose,
      enumerable: true,
      writable: false,
      configurable: false,
    },
    rescore: {
      value: rescore,
      enumerable: true,
      writable: false,
      configurable: false,
    },
    abortAndReap: {
      value: abortAndReap,
      enumerable: true,
      writable: false,
      configurable: false,
    },
    close: {
      value: close,
      enumerable: true,
      writable: false,
      configurable: false,
    },
  });
  return Object.freeze(facade);
}

interface InternalDependencies<
  TAssetBoundary extends
    | "production-fixed-registry-and-deployment-root"
    | "test-only-injected-expected-registry-and-root",
> {
  readonly executionBoundary: FloodgateProductionTeacherUsiRuntimeExecutionBoundary;
  readonly expectedAssetBoundary: TAssetBoundary;
  readonly assetRoot: string;
  readonly snapshotParent: string;
  readonly effectiveUserId: number;
  readonly verifyAssets: () => Promise<
    Readonly<FloodgateProductionTeacherAssetAuthorityReceipt<TAssetBoundary>>
  >;
  readonly spawnEngine: FloodgateProductionTeacherSpawnEngine;
  readonly configuration: Readonly<RuntimeConfiguration>;
  readonly afterSourceCopy?: () => void | Promise<void>;
  readonly beforeSnapshotRevalidation?: () => void | Promise<void>;
  readonly afterOperationBeforeReturnForTests?: () => void | Promise<void>;
}

async function createRuntimeInternal<
  TBoundary extends FloodgateProductionTeacherUsiRuntimeExecutionBoundary,
  TAssetBoundary extends
    | "production-fixed-registry-and-deployment-root"
    | "test-only-injected-expected-registry-and-root",
>(
  dependencies: Readonly<InternalDependencies<TAssetBoundary>> & {
    readonly executionBoundary: TBoundary;
  },
): Promise<FloodgateProductionTeacherUsiPool<TBoundary>> {
  let snapshot: Readonly<PrivateSnapshot> | null = null;
  const engines: HardenedUsiProcess[] = [];
  const initializationState: { fatal: Error | null } = { fatal: null };
  let phase: FloodgateProductionTeacherUsiRuntimePhase = "asset-verification";
  try {
    const authorityBefore = await dependencies.verifyAssets();
    if (
      authorityBefore.execution_boundary !== dependencies.expectedAssetBoundary
    )
      throw new Error(
        "asset authority execution boundary is not the expected boundary",
      );
    phase = "snapshot";
    snapshot = await createPrivateSnapshot(
      dependencies.assetRoot,
      dependencies.snapshotParent,
      dependencies.effectiveUserId,
      authorityBefore,
      dependencies.configuration.engineCount,
    );
    await dependencies.afterSourceCopy?.();
    phase = "asset-verification";
    const authorityAfter = await dependencies.verifyAssets();
    if (!sameAuthorityBinding(authorityBefore, authorityAfter))
      throw new Error("fixed deployment changed across snapshot capture");
    phase = "snapshot";
    await dependencies.beforeSnapshotRevalidation?.();
    await revalidateSnapshot(snapshot, dependencies.effectiveUserId, true);

    phase = "spawn";
    for (
      let index = 0;
      index < dependencies.configuration.engineCount;
      index += 1
    ) {
      engines.push(
        new HardenedUsiProcess(
          snapshot.enginePath,
          snapshot,
          snapshot.workers[index],
          authorityBefore.engine.engine_id,
          dependencies.spawnEngine,
          dependencies.configuration,
        ),
      );
    }
    for (const engine of engines) {
      engine.setFatalHandler((error) => {
        initializationState.fatal ??= error;
      });
    }
    phase = "initialization";
    await Promise.all(engines.map((engine) => engine.initialize()));
    if (initializationState.fatal !== null) throw initializationState.fatal;
    await revalidateSnapshot(snapshot, dependencies.effectiveUserId, false);
    if (initializationState.fatal !== null) throw initializationState.fatal;

    const receipt = Object.freeze({
      contract: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
      status: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
      claim_boundary: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
      execution_boundary: dependencies.executionBoundary,
      asset_authority_execution_boundary: authorityBefore.execution_boundary,
      engine_id: authorityBefore.engine.engine_id,
      runtime: Object.freeze({
        engine_count: dependencies.configuration.engineCount,
        threads_per_engine: 1 as const,
        hash_mb_per_engine: 64 as const,
        fv_scale: 20 as const,
        depth: dependencies.configuration.depth,
        proposal_multipv_max: 12 as const,
        independent_rescore_multipv: 1 as const,
        no_process_arguments: true as const,
        shell: false as const,
        minimal_environment: true as const,
        per_worker_private_directories: true as const,
        queue_bound: dependencies.configuration.engineCount * 4,
      }),
      fixed_options: Object.freeze([
        "EvalDir=<private-shared-snapshot>/eval",
        "FV_SCALE=20",
        "USI_Hash=64",
        "Threads=1",
        "USI_OwnBook=false",
        "BookFile=no_book",
        "NetworkDelay=0",
        "NetworkDelay2=0",
      ]),
      timeouts: dependencies.configuration.timeouts,
      limits: dependencies.configuration.limits,
      snapshot: Object.freeze({
        one_shared_private_snapshot: true as const,
        source_authority_revalidated: true as const,
        destination_revalidated: true as const,
        engine: Object.freeze({
          bytes: snapshot.engine.bytes,
          sha256: snapshot.engine.sha256,
          mode: "0500" as const,
        }),
        eval: Object.freeze({
          bytes: snapshot.evaluation.bytes,
          sha256: snapshot.evaluation.sha256,
          mode: "0400" as const,
        }),
      }),
    });
    return createPublicPoolFacade(
      new HardenedFloodgateProductionTeacherUsiPool(
        receipt,
        engines,
        snapshot,
        dependencies.effectiveUserId,
        dependencies.afterOperationBeforeReturnForTests,
      ),
    );
  } catch (primary) {
    const failures: unknown[] = [primary];
    const terminated = await Promise.allSettled(
      engines.map((engine) => engine.terminate(true)),
    );
    for (const result of terminated)
      if (result.status === "rejected") failures.push(result.reason);
    if (snapshot !== null) {
      try {
        await removePrivateSnapshot(
          snapshot.root,
          dependencies.effectiveUserId,
        );
      } catch (cleanupFailure) {
        failures.push(cleanupFailure);
      }
    }
    throw runtimeFailure(
      phase,
      failures.length === 1
        ? primary
        : new AggregateError(failures, "runtime creation and cleanup failed"),
    );
  }
}

/** Dependency-injected test-only factory. Its receipt cannot masquerade as production. */
export async function createFloodgateProductionTeacherUsiRuntimeCoreForTests(
  dependencies: FloodgateProductionTeacherUsiRuntimeCoreDependencies,
): Promise<
  FloodgateProductionTeacherUsiPool<"test-only-injected-asset-root-and-runtime-dependencies">
> {
  const captured = (() => {
    try {
      const assetRoot = canonicalAbsolutePath(
        dependencies.assetRoot,
        "assetRoot",
      );
      const snapshotParent = canonicalAbsolutePath(
        dependencies.snapshotParent,
        "snapshotParent",
      );
      const effectiveUserId = boundedInteger(
        dependencies.effectiveUserId,
        0,
        Number.MAX_SAFE_INTEGER,
        "effectiveUserId",
      );
      if (typeof dependencies.verifyAssets !== "function")
        throw new Error("verifyAssets must be a function");
      if (typeof dependencies.spawnEngine !== "function")
        throw new Error("spawnEngine must be a function");
      if (
        dependencies.afterOperationBeforeReturnForTests !== undefined &&
        typeof dependencies.afterOperationBeforeReturnForTests !== "function"
      ) {
        throw new Error(
          "afterOperationBeforeReturnForTests must be a function",
        );
      }
      return {
        assetRoot,
        snapshotParent,
        effectiveUserId,
        verifyAssets: dependencies.verifyAssets,
        spawnEngine: dependencies.spawnEngine,
        configuration: captureConfiguration(
          dependencies.engineCount ?? 1,
          dependencies.depth ?? 2,
          dependencies.timeouts ?? PRODUCTION_TIMEOUTS,
          dependencies.limits ?? PRODUCTION_LIMITS,
        ),
        afterSourceCopy: dependencies.afterSourceCopyForTests,
        beforeSnapshotRevalidation:
          dependencies.beforeSnapshotRevalidationForTests,
        afterOperationBeforeReturn:
          dependencies.afterOperationBeforeReturnForTests,
      };
    } catch (primary) {
      throw runtimeFailure("capture", primary);
    }
  })();
  return createRuntimeInternal({
    executionBoundary:
      "test-only-injected-asset-root-and-runtime-dependencies" as const,
    expectedAssetBoundary:
      "test-only-injected-expected-registry-and-root" as const,
    assetRoot: captured.assetRoot,
    snapshotParent: captured.snapshotParent,
    effectiveUserId: captured.effectiveUserId,
    verifyAssets: captured.verifyAssets,
    spawnEngine: captured.spawnEngine,
    configuration: captured.configuration,
    ...(captured.afterSourceCopy === undefined
      ? {}
      : { afterSourceCopy: captured.afterSourceCopy }),
    ...(captured.beforeSnapshotRevalidation === undefined
      ? {}
      : {
          beforeSnapshotRevalidation: captured.beforeSnapshotRevalidation,
        }),
    ...(captured.afterOperationBeforeReturn === undefined
      ? {}
      : {
          afterOperationBeforeReturnForTests:
            captured.afterOperationBeforeReturn,
        }),
  });
}

/** Create the fixed 12-process APPLEM1 production teacher pool. */
export async function createFloodgateProductionTeacherUsiRuntime(): Promise<
  FloodgateProductionTeacherUsiPool<"production-fixed-assets-and-runtime-dependencies">
> {
  const captured = await (async () => {
    try {
      if (process.platform !== "darwin" || process.arch !== "arm64")
        throw new Error("production USI runtime requires darwin arm64 APPLEM1");
      if (typeof process.geteuid !== "function")
        throw new Error("POSIX effective UID is required");
      const effectiveUserId = process.geteuid();
      const user = os.userInfo();
      if (user.uid !== effectiveUserId)
        throw new Error("account UID differs from EUID");
      const rootComponents =
        FLOODGATE_PRODUCTION_TEACHER_ASSET_ROOT_RELATIVE_COMPONENTS;
      const assetRoot = path.join(
        user.homedir,
        rootComponents[0],
        rootComponents[1],
        rootComponents[2],
        rootComponents[3],
      );
      const assetParent = path.dirname(assetRoot);
      const canonicalAssetParent = await fs.promises.realpath(assetParent);
      if (canonicalAssetParent !== assetParent)
        throw new Error(
          "production asset parent must be its canonical real path",
        );
      const snapshotParent = path.join(
        assetParent,
        "shogi-production-teacher-runtime-v1",
      );
      await ensurePrivateDirectory(
        snapshotParent,
        effectiveUserId,
        "production snapshot parent",
      );
      return {
        assetRoot,
        snapshotParent,
        effectiveUserId,
        configuration: captureConfiguration(
          FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines,
          FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
          PRODUCTION_TIMEOUTS,
          PRODUCTION_LIMITS,
        ),
      };
    } catch (primary) {
      throw runtimeFailure("capture", primary);
    }
  })();
  return createRuntimeInternal({
    executionBoundary:
      "production-fixed-assets-and-runtime-dependencies" as const,
    expectedAssetBoundary:
      "production-fixed-registry-and-deployment-root" as const,
    assetRoot: captured.assetRoot,
    snapshotParent: captured.snapshotParent,
    effectiveUserId: captured.effectiveUserId,
    verifyAssets: verifyPinnedFloodgateProductionTeacherAssets,
    spawnEngine: (file, args, options) => {
      if (args.length !== 0)
        throw new Error("production USI process arguments must be empty");
      return spawn(file, {
        cwd: options.cwd,
        // Node's ProcessEnv type is augmented by the web app with a required
        // NODE_ENV key. Native spawn accepts an exact string dictionary; the
        // runtime intentionally supplies only the six audited keys above.
        env: { ...options.env } as unknown as NodeJS.ProcessEnv,
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
        detached: true,
      });
    },
    configuration: captured.configuration,
  });
}
