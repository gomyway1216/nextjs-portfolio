import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
  SiblingTeacherNodeCapRoutingError,
  SiblingTeacherRescoreResetTimeoutError,
  prepareSiblingParentLabel,
  rescorePreparedSiblingParent,
  type CompletedWorkEntry,
  type PreparedSiblingParentLabel,
} from "./generate-sibling-teacher";
import type { FloodgateTrainingParent } from "./floodgate-training-row-consumer";
import {
  authenticateHalfkp81Depth18TeacherPlan,
  type Halfkp81Depth18TeacherFileIdentity,
} from "./halfkp81-depth18-teacher-runner";
import {
  HALFKP81_V1R11_CANDIDATE_ORDER_PARENT_ID,
  HALFKP81_V1R11_PATHOLOGICAL_PARENT_ID,
  runHalfkp81V1R11CandidateOrderGateCore,
  runHalfkp81V1R11Known10ProbeCore,
  runHalfkp81V1R11MixedLoadGateCore,
  runHalfkp81V1R11PathologicalFallbackGateCore,
  type Halfkp81V1R11StageBEngineBoundary,
  type Halfkp81V1R11StageBEngineLane,
  type Halfkp81V1R11StageBParent,
  type Halfkp81V1R11StageBProposal,
  type Halfkp81V1R11StageBSearchIdentity,
  type Halfkp81V1R11MixedLoadProcessObservation,
} from "./halfkp81-depth18-v1r11-stage-b-engine-gate-core";
import { parseHalfkp81V1R11Depth18SearchIdentity } from "./halfkp81-depth18-v1r11-stage-b-search-identity";
import {
  UsiResetForParentTimeoutError,
  UsiTeacherEngine,
} from "./usi-engine";
import { buildHalfkp81V1R11ExactPowerGuardianCommand } from "./halfkp81-depth18-v1r11-stage-b-launchagent-supervisor";
import {
  HALFKP81_V1R11_FORMAL_LIKE_ROLE_COUNTS,
  produceHalfkp81Depth18V1R11FormalLike512Artifacts,
  sealHalfkp81V1R11FormalLikeTeacherEntry,
  type Halfkp81V1R11FormalLikeArtifactContext,
  type Halfkp81V1R11FormalLikeCompletedParent,
  type Halfkp81V1R11FormalLikeExecutionResult,
  type Halfkp81V1R11FormalLikeResetRecovery,
  type Halfkp81V1R11FormalLikeRole,
  type Halfkp81V1R11FormalLikeRoute,
} from "./halfkp81-depth18-v1r11-formal-like-512";

const REVISION_RE = /^[0-9a-f]{40}$/u;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const TEACHER_PLAN_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11";
const NORMAL_HASH_MIB = 512 as const;
const FALLBACK_HASH_MIB = 8192 as const;
const SEARCH_TIMEOUT_MS = 14_400_000 as const;
// The independent parent samples launchctl+ps once per second. Even a lane
// that intentionally performs no search (the pathological normal-lane
// control) must remain alive long enough for that parent to bind its PID,
// PGID and start token to the child's final reap evidence.
const MIN_EXTERNAL_OBSERVATION_LIFETIME_MS = 3_000 as const;
const V1R11_ENGINE_BINARY_SHA256 =
  "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1";

export interface Halfkp81V1R11ProcessRow {
  readonly pid: number;
  readonly ppid: number;
  readonly pgid: number;
  readonly start_token: string;
  readonly state: string;
  readonly command: string;
}

export interface Halfkp81V1R11FixedEngineCleanupEvidence {
  readonly process_cleanup: Readonly<{
    readonly scheduling_stopped: true;
    readonly engines_started: number;
    readonly engines_terminated: number;
    readonly engines_reaped: number;
    readonly remaining_engine_pids: readonly number[];
    readonly children_reaped: true;
    readonly next_job_started: false;
  }>;
  readonly os_reap_evidence: Readonly<{
    readonly observer_pid: number;
    readonly engine_pids: readonly number[];
    readonly engine_pgids: readonly number[];
    readonly engine_start_tokens: readonly string[];
    readonly direct_parent_matches: number;
    readonly dedicated_process_groups_verified: number;
    readonly kill_zero_esrch_after_close: number;
    readonly ps_rows_absent_after_close: number;
    readonly process_group_members_absent_after_close: number;
    readonly remaining_descendant_pids: readonly number[];
    readonly remaining_process_group_pids: readonly number[];
  }>;
}

export interface Halfkp81V1R11FixedEngineBoundary extends Halfkp81V1R11StageBEngineBoundary {
  runFormalLike512(
    context: Readonly<Halfkp81V1R11FormalLikeArtifactContext>,
  ): Promise<Readonly<Record<string, unknown>>>;
  finalizeAndVerifyNoChildren(): Readonly<Halfkp81V1R11FixedEngineCleanupEvidence>;
  abortAndVerifyNoChildren(): Promise<Readonly<Halfkp81V1R11FixedEngineCleanupEvidence>>;
}

export interface Halfkp81V1R11FixedStageBInputs {
  readonly boundary: Halfkp81V1R11FixedEngineBoundary;
  readonly parents: ReadonlyMap<string, Readonly<Halfkp81V1R11StageBParent>>;
  readonly formalLikeParents: readonly Readonly<FloodgateTrainingParent>[];
  readonly formalLikeRoles: ReadonlyMap<string, Halfkp81V1R11FormalLikeRole>;
}

export interface Halfkp81V1R11FixedEngineLifecycleObserver {
  engineStarted(observedAtMs: number): void;
  engineReaped(observedAtMs: number): void;
}

export interface Halfkp81V1R11FixedStageBEngineGateResult extends Halfkp81V1R11FixedEngineCleanupEvidence {
  readonly gate_result: Readonly<Record<string, unknown>>;
}

function sha256(raw: Uint8Array): string {
  return createHash("sha256").update(raw).digest("hex");
}

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
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("fixed Stage-B boundary value is not canonicalizable");
}

async function waitForMinimumExternalObservationLifetime(
  startedAtMs: number,
): Promise<void> {
  const remaining =
    startedAtMs + MIN_EXTERNAL_OBSERVATION_LIFETIME_MS - Date.now();
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

async function authenticateFixedAsset(
  expected: Readonly<Halfkp81Depth18TeacherFileIdentity>,
  label: string,
): Promise<Buffer> {
  if (
    !path.isAbsolute(expected.path) ||
    path.normalize(expected.path) !== expected.path ||
    !Number.isSafeInteger(expected.bytes) ||
    expected.bytes < 1 ||
    !SHA256_RE.test(expected.sha256)
  ) {
    throw new Error(`${label} identity differs`);
  }
  const handle = await fs.promises.open(
    expected.path,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = await handle.stat();
    const linked = await fs.promises.lstat(expected.path);
    const real = await fs.promises.realpath(expected.path);
    const euid = process.geteuid?.();
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      !Number.isSafeInteger(euid) ||
      before.uid !== euid ||
      linked.dev !== before.dev ||
      linked.ino !== before.ino ||
      real !== expected.path ||
      before.size !== expected.bytes
    ) {
      throw new Error(`${label} filesystem identity differs`);
    }
    const raw = Buffer.alloc(expected.bytes);
    let offset = 0;
    while (offset < raw.byteLength) {
      const chunk = await handle.read(
        raw,
        offset,
        raw.byteLength - offset,
        offset,
      );
      if (chunk.bytesRead < 1) throw new Error(`${label} ended early`);
      offset += chunk.bytesRead;
    }
    const eof = Buffer.alloc(1);
    if ((await handle.read(eof, 0, 1, offset)).bytesRead !== 0) {
      throw new Error(`${label} has trailing bytes`);
    }
    const after = await handle.stat();
    const linkedAfter = await fs.promises.lstat(expected.path);
    if (
      sha256(raw) !== expected.sha256 ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      linkedAfter.dev !== before.dev ||
      linkedAfter.ino !== before.ino ||
      linkedAfter.size !== before.size
    ) {
      throw new Error(`${label} content or stable identity differs`);
    }
    return raw;
  } finally {
    await handle.close();
  }
}

export async function publishHalfkp81V1R11PrivateSnapshotForTests(
  destination: string,
  raw: Buffer,
  mode: number,
  label: string,
): Promise<void> {
  const handle = await fs.promises.open(
    destination,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      (fs.constants.O_NOFOLLOW ?? 0),
    mode,
  );
  try {
    await handle.writeFile(raw);
    await handle.sync();
    const metadata = await handle.stat();
    if (
      !metadata.isFile() ||
      metadata.nlink !== 1 ||
      metadata.size !== raw.byteLength ||
      (metadata.mode & 0o7777) !== mode
    ) {
      throw new Error(`${label} private snapshot differs`);
    }
  } finally {
    await handle.close();
  }
}

const PS_OBSERVER_COMMAND =
  "/bin/ps -axo pid=,ppid=,pgid=,lstart=,state=,command=" as const;

function rawProcessRows(): readonly Readonly<Halfkp81V1R11ProcessRow>[] {
  const raw = execFileSync(
    "/bin/ps",
    ["-axo", "pid=,ppid=,pgid=,lstart=,state=,command="],
    { encoding: "utf8" },
  );
  return Object.freeze(
    raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const match = /^(\d+)\s+(\d+)\s+(\d+)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s+(.+)$/u.exec(
          line,
        );
        if (match === null) throw new Error("fixed Stage-B ps row differs");
        const row = Object.freeze({
          pid: Number(match[1]),
          ppid: Number(match[2]),
          pgid: Number(match[3]),
          start_token: match[4]!,
          state: match[5]!,
          command: match[6]!,
        });
        if (
          !Number.isSafeInteger(row.pid) ||
          row.pid < 1 ||
          !Number.isSafeInteger(row.ppid) ||
          row.ppid < 0 ||
          !Number.isSafeInteger(row.pgid) ||
          row.pgid < 1 ||
          row.start_token.length < 20 ||
          row.state.length < 1 ||
          row.command.length < 1
        ) {
          throw new Error("fixed Stage-B ps row semantics differ");
        }
        return row;
      }),
  );
}

export function filterHalfkp81V1R11PsObserverForTests(
  first: readonly Readonly<Halfkp81V1R11ProcessRow>[],
  second: readonly Readonly<Halfkp81V1R11ProcessRow>[],
  observerPid: number,
): readonly Readonly<Halfkp81V1R11ProcessRow>[] {
  const observerRows = (
    rows: readonly Readonly<Halfkp81V1R11ProcessRow>[],
  ) =>
    rows.filter(
      (row) =>
        row.ppid === observerPid && row.command === PS_OBSERVER_COMMAND,
    );
  const firstObservers = observerRows(first);
  const secondObservers = observerRows(second);
  if (
    firstObservers.length !== 1 ||
    secondObservers.length !== 1 ||
    firstObservers[0]!.pid === secondObservers[0]!.pid ||
    second.some((row) => row.pid === firstObservers[0]!.pid) ||
    first.some((row) => row.pid === secondObservers[0]!.pid)
  ) {
    throw new Error("fixed Stage-B ps observer authentication differs");
  }
  return Object.freeze(
    second.filter((row) => row.pid !== secondObservers[0]!.pid),
  );
}

function processRows(): readonly Readonly<Halfkp81V1R11ProcessRow>[] {
  return filterHalfkp81V1R11PsObserverForTests(
    rawProcessRows(),
    rawProcessRows(),
    process.pid,
  );
}

export function observeHalfkp81V1R11ProcessRowsForTests(): readonly Readonly<Halfkp81V1R11ProcessRow>[] {
  return processRows();
}

interface StageBJobIdentity {
  readonly runner: Readonly<Halfkp81V1R11ProcessRow>;
  readonly assertionHolder: Readonly<Halfkp81V1R11ProcessRow>;
  readonly powerGuardian?: Readonly<Halfkp81V1R11ProcessRow>;
}

export function validateHalfkp81V1R11FixedPowerGuardianRowForTests(
  powerGuardian: Readonly<Halfkp81V1R11ProcessRow>,
  context: Readonly<{
    runnerPid: number;
    runnerPgid: number;
    nodePath: string;
    repositoryRoot: string;
  }>,
): void {
  if (
    powerGuardian.ppid !== context.runnerPid ||
    powerGuardian.pgid !== context.runnerPgid ||
    powerGuardian.command !==
      buildHalfkp81V1R11ExactPowerGuardianCommand(
        context.nodePath,
        context.repositoryRoot,
      )
  ) {
    throw new Error("fixed Stage-B power guardian topology differs");
  }
}

function authenticateStageBJobIdentity(
  powerGuardianPid?: number,
): Readonly<StageBJobIdentity> {
  const rows = processRows();
  const runners = rows.filter((row) => row.pid === process.pid);
  if (
    runners.length !== 1 ||
    runners[0]!.pgid !== process.pid ||
    !/node(?:\s|$)/u.test(runners[0]!.command)
  ) {
    throw new Error("fixed Stage-B runner is not the dedicated job leader");
  }
  const runner = runners[0]!;
  const expectedHolderCommand = `/usr/bin/caffeinate -dimsu ${runner.command}`;
  const holders = rows.filter(
    (row) =>
      row.ppid === runner.pid &&
      row.pgid === runner.pgid &&
      row.command === expectedHolderCommand,
  );
  if (holders.length !== 1) {
    throw new Error("fixed Stage-B assertion-holder job topology differs");
  }
  const powerGuardian =
    powerGuardianPid === undefined
      ? undefined
      : rows.find((row) => row.pid === powerGuardianPid);
  if (powerGuardianPid !== undefined) {
    if (powerGuardian === undefined) {
      throw new Error("fixed Stage-B power guardian topology differs");
    }
    validateHalfkp81V1R11FixedPowerGuardianRowForTests(powerGuardian, {
      runnerPid: runner.pid,
      runnerPgid: runner.pgid,
      nodePath: process.execPath,
      repositoryRoot: fs.realpathSync.native(path.resolve(__dirname, "..")),
    });
  }
  return Object.freeze({
    runner,
    assertionHolder: holders[0]!,
    ...(powerGuardian === undefined ? {} : { powerGuardian }),
  });
}

function descendantRows(
  rows: readonly Readonly<Halfkp81V1R11ProcessRow>[],
  ancestorPid: number,
): readonly Readonly<Halfkp81V1R11ProcessRow>[] {
  const descendants: Halfkp81V1R11ProcessRow[] = [];
  const parents = new Set([ancestorPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (
        parents.has(row.ppid) &&
        !parents.has(row.pid) &&
        row.pid !== ancestorPid
      ) {
        parents.add(row.pid);
        descendants.push(row);
        changed = true;
      }
    }
  }
  return Object.freeze(descendants);
}

function assertProcessMissing(pid: number): void {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
    throw error;
  }
  throw new Error(`fixed Stage-B engine PID ${pid} remains live after close`);
}

function engineEnvironment(workerCwd: string): NodeJS.ProcessEnv {
  const realCwd = fs.realpathSync.native(workerCwd);
  return Object.fromEntries(
    Object.entries(SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT.variables).map(
      ([name, value]) => [
        name,
        value === "<private-worker-cwd>" ? realCwd : value,
      ],
    ),
  ) as NodeJS.ProcessEnv;
}

function proposalResult(
  result: Awaited<ReturnType<UsiTeacherEngine["search"]>>,
  requestedMultipv: number,
): Readonly<Halfkp81V1R11StageBProposal> {
  if (
    result.depth !== 16 ||
    result.lines.length !== requestedMultipv ||
    result.lines.some((line, index) => line.multipv !== index + 1)
  ) {
    throw new Error("fixed Stage-B depth16 proposal differs");
  }
  return Object.freeze({
    depth: 16 as const,
    moves: Object.freeze(result.lines.map((line) => line.move)),
    requested_multipv: requestedMultipv,
  });
}

function searchIdentity(
  result: Awaited<ReturnType<UsiTeacherEngine["search"]>>,
  move: string,
): Readonly<Halfkp81V1R11StageBSearchIdentity> {
  return parseHalfkp81V1R11Depth18SearchIdentity(result, move);
}

/**
 * Test-only typed seam through the exact production depth-18 result parser.
 * Keeping the real USI result type here prevents field-name drift from being
 * hidden behind an untyped boundary fixture.
 */
export function validateHalfkp81V1R11Depth18SearchIdentityForTests(
  result: Awaited<ReturnType<UsiTeacherEngine["search"]>>,
  move: string,
): Readonly<Halfkp81V1R11StageBSearchIdentity> {
  return searchIdentity(result, move);
}

interface ActiveMixedEngine {
  readonly slotId: string;
  readonly class: "normal" | "fallback";
  readonly hashMib: 512 | 8192;
  readonly engine: UsiTeacherEngine;
  readonly cwd: string;
  readonly processRow: Readonly<Halfkp81V1R11ProcessRow>;
  readonly snapshotEngineIdentity: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly snapshotEvalIdentity: Readonly<Halfkp81Depth18TeacherFileIdentity>;
}

export function buildHalfkp81V1R11MixedLoadObservationForTests(
  input: Readonly<{
    sequence: number;
    observedAtMs: number;
    runner: Readonly<Halfkp81V1R11ProcessRow>;
    records: readonly Readonly<
      Pick<ActiveMixedEngine, "slotId" | "class" | "hashMib" | "processRow">
    >[];
    liveRows: readonly Readonly<Halfkp81V1R11ProcessRow>[];
    engineBinarySha256: string;
  }>,
): Readonly<Halfkp81V1R11MixedLoadProcessObservation> {
  const expectedSlots = Object.freeze([
    "fallback-01",
    "fallback-02",
    ...Array.from(
      { length: 8 },
      (_, index) => `normal-${String(index + 1).padStart(2, "0")}`,
    ),
  ]);
  if (
    !Number.isSafeInteger(input.sequence) ||
    input.sequence < 1 ||
    !Number.isSafeInteger(input.observedAtMs) ||
    input.observedAtMs < 0 ||
    input.runner.pid !== input.runner.pgid ||
    input.records.length !== 10 ||
    input.liveRows.length !== 10 ||
    input.engineBinarySha256 !== V1R11_ENGINE_BINARY_SHA256 ||
    new Set(input.records.map((record) => record.slotId)).size !== 10 ||
    canonicalJson([...input.records.map((record) => record.slotId)].sort()) !==
      canonicalJson([...expectedSlots].sort())
  ) {
    throw new Error("fixed Stage-B mixed observation input differs");
  }
  const active = Object.freeze(
    [...input.records]
      .sort((left, right) =>
        Buffer.compare(
          Buffer.from(`${left.class}\0${left.slotId}`, "utf8"),
          Buffer.from(`${right.class}\0${right.slotId}`, "utf8"),
        ),
      )
      .map((record) => {
        const matches = input.liveRows.filter(
          (candidate) =>
            candidate.pid === record.processRow.pid &&
            candidate.start_token === record.processRow.start_token,
        );
        if (
          matches.length !== 1 ||
          matches[0]!.ppid !== input.runner.pid ||
          matches[0]!.pgid !== input.runner.pgid ||
          matches[0]!.command !== record.processRow.command ||
          (record.class === "normal"
            ? record.hashMib !== 512
            : record.class !== "fallback" || record.hashMib !== 8192)
        ) {
          throw new Error(
            `fixed Stage-B mixed slot ${record.slotId} observation differs`,
          );
        }
        const row = matches[0]!;
        return Object.freeze({
          slot_id: record.slotId,
          class: record.class,
          hash_mib: record.hashMib,
          pid: row.pid,
          ppid: row.ppid,
          pgid: row.pgid,
          start_token: row.start_token,
          state: row.state,
          command: row.command,
          engine_binary_sha256: input.engineBinarySha256,
        });
      }),
  );
  if (
    new Set(active.map((engine) => engine.pid)).size !== active.length ||
    new Set(active.map((engine) => engine.command)).size !== active.length
  ) {
    throw new Error("fixed Stage-B mixed observation PID/command set differs");
  }
  return Object.freeze({
    schema:
      "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-mixed-load-process-observation-v1",
    status: "authenticated-live-process-snapshot-no-formal-authority",
    observation_sequence: input.sequence,
    observed_at_utc: new Date(input.observedAtMs).toISOString(),
    runner_pid: input.runner.pid,
    runner_pgid: input.runner.pgid,
    runner_start_token: input.runner.start_token,
    active_engines: active,
    normal_active_recomputed: active.filter(
      (engine) => engine.class === "normal",
    ).length,
    fallback_active_recomputed: active.filter(
      (engine) => engine.class === "fallback",
    ).length,
  });
}

class FixedBoundary implements Halfkp81V1R11FixedEngineBoundary {
  private readonly engineBinary: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  private readonly evalFile: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  private readonly jobIdentity: Readonly<StageBJobIdentity>;
  private readonly lifecycleObserver:
    | Readonly<Halfkp81V1R11FixedEngineLifecycleObserver>
    | undefined;
  private readonly pids: number[] = [];
  private readonly pgids: number[] = [];
  private readonly startTokens: string[] = [];
  private readonly reaped = new Set<number>();
  private activeLane = false;
  private finalized = false;
  private activeEngine: UsiTeacherEngine | null = null;
  private activeCwd: string | null = null;
  private readonly activeMixed = new Map<string, Readonly<ActiveMixedEngine>>();
  private mixedObservationSequence = 0;
  private mixedLastObservedAt = -1;

  constructor(
    engineBinary: Readonly<Halfkp81Depth18TeacherFileIdentity>,
    evalFile: Readonly<Halfkp81Depth18TeacherFileIdentity>,
    jobIdentity: Readonly<StageBJobIdentity>,
    lifecycleObserver?: Readonly<Halfkp81V1R11FixedEngineLifecycleObserver>,
  ) {
    this.engineBinary = engineBinary;
    this.evalFile = evalFile;
    this.jobIdentity = jobIdentity;
    this.lifecycleObserver = lifecycleObserver;
  }

  private recordEngineStarted(
    processRow: Readonly<Halfkp81V1R11ProcessRow>,
  ): void {
    if (
      this.pids.includes(processRow.pid) ||
      this.reaped.has(processRow.pid)
    ) {
      throw new Error("fixed Stage-B engine start accounting differs");
    }
    this.pids.push(processRow.pid);
    this.pgids.push(processRow.pgid);
    this.startTokens.push(processRow.start_token);
    this.lifecycleObserver?.engineStarted(Date.now());
  }

  private recordEngineReaped(pid: number): void {
    if (!this.pids.includes(pid) || this.reaped.has(pid)) {
      throw new Error("fixed Stage-B engine reap accounting differs");
    }
    this.reaped.add(pid);
    this.lifecycleObserver?.engineReaped(Date.now());
  }

  private engineRows(
    rows: readonly Readonly<Halfkp81V1R11ProcessRow>[],
  ): readonly Readonly<Halfkp81V1R11ProcessRow>[] {
    const runner = rows.find((row) => row.pid === this.jobIdentity.runner.pid);
    const holder = rows.find(
      (row) => row.pid === this.jobIdentity.assertionHolder.pid,
    );
    const powerGuardian =
      this.jobIdentity.powerGuardian === undefined
        ? undefined
        : rows.find((row) => row.pid === this.jobIdentity.powerGuardian!.pid);
    if (
      runner?.start_token !== this.jobIdentity.runner.start_token ||
      runner.command !== this.jobIdentity.runner.command ||
      runner.pgid !== runner.pid ||
      holder?.start_token !== this.jobIdentity.assertionHolder.start_token ||
      holder.command !== this.jobIdentity.assertionHolder.command ||
      holder.ppid !== runner.pid ||
      holder.pgid !== runner.pgid ||
      (this.jobIdentity.powerGuardian !== undefined &&
        (powerGuardian?.start_token !==
          this.jobIdentity.powerGuardian.start_token ||
          powerGuardian.command !== this.jobIdentity.powerGuardian.command ||
          powerGuardian.ppid !== runner.pid ||
          powerGuardian.pgid !== runner.pgid))
    ) {
      throw new Error("fixed Stage-B job identity changed");
    }
    const descendants = descendantRows(rows, runner.pid);
    if (
      descendants.some(
        (row) =>
          row.ppid === holder.pid ||
          (row.pid !== holder.pid && row.pgid !== runner.pgid),
      )
    ) {
      throw new Error("fixed Stage-B job lineage differs");
    }
    return Object.freeze(
      descendants.filter(
        (row) =>
          row.pid !== holder.pid &&
          row.pid !== this.jobIdentity.powerGuardian?.pid,
      ),
    );
  }

  async openLane(hashMib: 512 | 8192): Promise<Halfkp81V1R11StageBEngineLane> {
    if (
      this.finalized ||
      this.activeLane ||
      (hashMib !== NORMAL_HASH_MIB && hashMib !== FALLBACK_HASH_MIB)
    ) {
      throw new Error("fixed Stage-B lane lifecycle differs");
    }
    if (this.engineRows(processRows()).length !== 0) {
      throw new Error("fixed Stage-B runner has an unexpected existing child");
    }
    const engineRaw = await authenticateFixedAsset(
      this.engineBinary,
      "Stage-B engine preflight",
    );
    const evalRaw = await authenticateFixedAsset(
      this.evalFile,
      "Stage-B eval preflight",
    );
    const createdCwd = await fs.promises.mkdtemp(
      path.join(fs.realpathSync.native(os.tmpdir()), "halfkp81-v1r11-stage-b-engine-"),
    );
    const cwd = fs.realpathSync.native(createdCwd);
    await fs.promises.chmod(cwd, 0o700);
    const snapshotEngine = path.join(cwd, "YaneuraOu-authenticated-snapshot");
    const snapshotEvalDirectory = path.join(cwd, "eval");
    const snapshotEval = path.join(snapshotEvalDirectory, "nn.bin");
    await fs.promises.mkdir(snapshotEvalDirectory, { mode: 0o700 });
    await publishHalfkp81V1R11PrivateSnapshotForTests(
      snapshotEngine,
      engineRaw,
      0o500,
      "Stage-B engine",
    );
    await publishHalfkp81V1R11PrivateSnapshotForTests(
      snapshotEval,
      evalRaw,
      0o400,
      "Stage-B eval",
    );
    const snapshotEngineIdentity = Object.freeze({
      path: snapshotEngine,
      bytes: engineRaw.byteLength,
      sha256: sha256(engineRaw),
      schema: this.engineBinary.schema,
    });
    const snapshotEvalIdentity = Object.freeze({
      path: snapshotEval,
      bytes: evalRaw.byteLength,
      sha256: sha256(evalRaw),
      schema: this.evalFile.schema,
    });
    let processRow: Readonly<Halfkp81V1R11ProcessRow> | undefined;
    let spawnedAtMs = -1;
    const engine = new UsiTeacherEngine({
      engineBin: snapshotEngine,
      evalDir: snapshotEvalDirectory,
      cwd,
      env: engineEnvironment(cwd),
      fvScale: 20,
      hashMb: hashMib,
      timeoutMs: SEARCH_TIMEOUT_MS,
      onSpawn: ({ pid }) => {
        const matches = this.engineRows(processRows()).filter(
          (row) => row.pid === pid,
        );
        if (
          matches.length !== 1 ||
          matches[0]!.ppid !== process.pid ||
          matches[0]!.command !== snapshotEngine ||
          matches[0]!.pgid !== this.jobIdentity.runner.pgid
        ) {
          throw new Error("fixed Stage-B spawned engine topology differs");
        }
        processRow = matches[0]!;
        this.recordEngineStarted(processRow);
        spawnedAtMs = Date.now();
      },
    });
    this.activeLane = true;
    this.activeEngine = engine;
    this.activeCwd = cwd;
    try {
      await engine.init();
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      await engine.quit().catch((cleanup) => cleanupErrors.push(cleanup));
      if (processRow !== undefined) {
        try {
          assertProcessMissing(processRow.pid);
          this.recordEngineReaped(processRow.pid);
        } catch (cleanup) {
          cleanupErrors.push(cleanup);
        }
      }
      try {
        if (this.engineRows(processRows()).length !== 0) {
          throw new Error("failed engine initialization left a child");
        }
      } catch (cleanup) {
        cleanupErrors.push(cleanup);
      }
      this.activeLane = false;
      this.activeEngine = null;
      this.activeCwd = null;
      await fs.promises
        .rm(cwd, { recursive: true, force: true })
        .catch((cleanup) => cleanupErrors.push(cleanup));
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          "fixed Stage-B initialization and cleanup both failed",
        );
      }
      throw error;
    }
    const children = this.engineRows(processRows());
    if (
      processRow === undefined ||
      children.length !== 1 ||
      children[0]!.pid !== processRow.pid ||
      children[0]!.start_token !== processRow.start_token
    ) {
      await engine.quit().catch(() => undefined);
      await fs.promises.rm(cwd, { recursive: true, force: true });
      throw new Error("fixed Stage-B engine child topology differs");
    }
    process.kill(processRow.pid, 0);
    let closed = false;
    return Object.freeze({
      hash_mib: hashMib,
      propose: async (parent) => {
        if (closed || !this.activeLane) {
          throw new Error("fixed Stage-B proposal lane is closed");
        }
        const multipv = Math.min(12, parent.legal_move_count);
        await engine.resetForParent();
        return proposalResult(
          await engine.search(parent.parent_sfen, multipv, { depth: 16 }),
          multipv,
        );
      },
      rescore: async (parent, move) => {
        if (closed || !this.activeLane) {
          throw new Error("fixed Stage-B rescore lane is closed");
        }
        await engine.resetForParent();
        return searchIdentity(
          await engine.search(parent.parent_sfen, 1, { depth: 18 }, [move]),
          move,
        );
      },
      close: async () => {
        if (closed || !this.activeLane) {
          throw new Error("fixed Stage-B lane close differs");
        }
        closed = true;
        try {
          if (spawnedAtMs < 0) {
            throw new Error("fixed Stage-B engine start clock differs");
          }
          await waitForMinimumExternalObservationLifetime(spawnedAtMs);
          await engine.quit();
          assertProcessMissing(processRow.pid);
          const after = processRows();
          if (after.some((row) => row.pid === processRow.pid)) {
            throw new Error("fixed Stage-B engine remains in ps after close");
          }
          if (this.engineRows(after).length !== 0) {
            throw new Error("fixed Stage-B runner retains a descendant");
          }
          this.recordEngineReaped(processRow.pid);
          await authenticateFixedAsset(
            this.engineBinary,
            "Stage-B engine postflight",
          );
          await authenticateFixedAsset(
            this.evalFile,
            "Stage-B eval postflight",
          );
          await authenticateFixedAsset(
            snapshotEngineIdentity,
            "Stage-B engine snapshot postflight",
          );
          await authenticateFixedAsset(
            snapshotEvalIdentity,
            "Stage-B eval snapshot postflight",
          );
        } finally {
          this.activeLane = false;
          this.activeEngine = null;
          this.activeCwd = null;
          await fs.promises.rm(cwd, { recursive: true, force: true });
        }
      },
    });
  }

  private assertExactActiveMixedRows(
    rows: readonly Readonly<Halfkp81V1R11ProcessRow>[],
    additional?: Readonly<Halfkp81V1R11ProcessRow>,
  ): void {
    const expected = [
      ...[...this.activeMixed.values()].map((record) => record.processRow),
      ...(additional === undefined ? [] : [additional]),
    ].sort((left, right) => left.pid - right.pid);
    const actual = [...this.engineRows(rows)].sort(
      (left, right) => left.pid - right.pid,
    );
    if (
      canonicalJson(
        actual.map((row) => ({
          pid: row.pid,
          ppid: row.ppid,
          pgid: row.pgid,
          start_token: row.start_token,
          command: row.command,
        })),
      ) !==
      canonicalJson(
        expected.map((row) => ({
          pid: row.pid,
          ppid: row.ppid,
          pgid: row.pgid,
          start_token: row.start_token,
          command: row.command,
        })),
      )
    ) {
      throw new Error("fixed Stage-B active mixed process set differs");
    }
  }

  private async openMixedEngine(
    slotId: string,
    class_: "normal" | "fallback",
    hashMib: 512 | 8192,
    engineRaw: Buffer,
    evalRaw: Buffer,
  ): Promise<void> {
    if (
      this.finalized ||
      this.activeLane ||
      this.activeMixed.has(slotId) ||
      (class_ === "normal" ? hashMib !== 512 : hashMib !== 8192)
    ) {
      throw new Error(`fixed Stage-B mixed slot ${slotId} lifecycle differs`);
    }
    const createdCwd = await fs.promises.mkdtemp(
      path.join(
        fs.realpathSync.native(os.tmpdir()),
        `halfkp81-v1r11-stage-b-${slotId}-`,
      ),
    );
    const cwd = fs.realpathSync.native(createdCwd);
    await fs.promises.chmod(cwd, 0o700);
    const snapshotEngine = path.join(cwd, "YaneuraOu-authenticated-snapshot");
    const snapshotEvalDirectory = path.join(cwd, "eval");
    const snapshotEval = path.join(snapshotEvalDirectory, "nn.bin");
    await fs.promises.mkdir(snapshotEvalDirectory, { mode: 0o700 });
    await publishHalfkp81V1R11PrivateSnapshotForTests(
      snapshotEngine,
      engineRaw,
      0o500,
      `Stage-B ${slotId} engine`,
    );
    await publishHalfkp81V1R11PrivateSnapshotForTests(
      snapshotEval,
      evalRaw,
      0o400,
      `Stage-B ${slotId} eval`,
    );
    const snapshotEngineIdentity = Object.freeze({
      path: snapshotEngine,
      bytes: engineRaw.byteLength,
      sha256: sha256(engineRaw),
      schema: this.engineBinary.schema,
    });
    const snapshotEvalIdentity = Object.freeze({
      path: snapshotEval,
      bytes: evalRaw.byteLength,
      sha256: sha256(evalRaw),
      schema: this.evalFile.schema,
    });
    let processRow: Readonly<Halfkp81V1R11ProcessRow> | undefined;
    const engine = new UsiTeacherEngine({
      engineBin: snapshotEngine,
      evalDir: snapshotEvalDirectory,
      cwd,
      env: engineEnvironment(cwd),
      fvScale: 20,
      hashMb: hashMib,
      timeoutMs: SEARCH_TIMEOUT_MS,
      onSpawn: ({ pid }) => {
        const matches = this.engineRows(processRows()).filter(
          (row) => row.pid === pid,
        );
        if (
          matches.length !== 1 ||
          matches[0]!.ppid !== process.pid ||
          matches[0]!.command !== snapshotEngine ||
          matches[0]!.pgid !== this.jobIdentity.runner.pgid ||
          this.pids.includes(pid)
        ) {
          throw new Error(`fixed Stage-B mixed slot ${slotId} spawn differs`);
        }
        processRow = matches[0]!;
        this.recordEngineStarted(processRow);
      },
    });
    try {
      await engine.init();
      if (processRow === undefined) {
        throw new Error(`fixed Stage-B mixed slot ${slotId} PID is missing`);
      }
      this.assertExactActiveMixedRows(processRows(), processRow);
      process.kill(processRow.pid, 0);
      this.activeMixed.set(
        slotId,
        Object.freeze({
          slotId,
          class: class_,
          hashMib,
          engine,
          cwd,
          processRow,
          snapshotEngineIdentity,
          snapshotEvalIdentity,
        }),
      );
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      await engine.quit().catch((cleanup) => cleanupErrors.push(cleanup));
      if (processRow !== undefined) {
        try {
          assertProcessMissing(processRow.pid);
          this.recordEngineReaped(processRow.pid);
        } catch (cleanup) {
          cleanupErrors.push(cleanup);
        }
      }
      await fs.promises
        .rm(cwd, { recursive: true, force: true })
        .catch((cleanup) => cleanupErrors.push(cleanup));
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          `fixed Stage-B mixed slot ${slotId} initialization cleanup failed`,
        );
      }
      throw error;
    }
  }

  private captureMixedObservation(): Readonly<Halfkp81V1R11MixedLoadProcessObservation> {
    const rows = processRows();
    this.assertExactActiveMixedRows(rows);
    if (this.activeMixed.size !== 10) {
      throw new Error("fixed Stage-B mixed live engine count differs");
    }
    const observedAt = Date.now();
    if (observedAt <= this.mixedLastObservedAt) {
      throw new Error("fixed Stage-B mixed observation clock did not advance");
    }
    this.mixedLastObservedAt = observedAt;
    this.mixedObservationSequence += 1;
    return buildHalfkp81V1R11MixedLoadObservationForTests({
      sequence: this.mixedObservationSequence,
      observedAtMs: observedAt,
      runner: this.jobIdentity.runner,
      records: [...this.activeMixed.values()],
      liveRows: this.engineRows(rows),
      engineBinarySha256: this.engineBinary.sha256,
    });
  }

  private async closeMixedEngine(slotId: string): Promise<void> {
    const record = this.activeMixed.get(slotId);
    if (record === undefined) {
      throw new Error(`fixed Stage-B mixed slot ${slotId} is not active`);
    }
    try {
      await record.engine.quit();
      assertProcessMissing(record.processRow.pid);
      this.recordEngineReaped(record.processRow.pid);
      this.activeMixed.delete(slotId);
      this.assertExactActiveMixedRows(processRows());
      await authenticateFixedAsset(
        this.engineBinary,
        `Stage-B ${slotId} engine postflight`,
      );
      await authenticateFixedAsset(
        this.evalFile,
        `Stage-B ${slotId} eval postflight`,
      );
      await authenticateFixedAsset(
        record.snapshotEngineIdentity,
        `Stage-B ${slotId} engine snapshot postflight`,
      );
      await authenticateFixedAsset(
        record.snapshotEvalIdentity,
        `Stage-B ${slotId} eval snapshot postflight`,
      );
    } finally {
      await fs.promises.rm(record.cwd, { recursive: true, force: true });
    }
  }

  async runAuthenticatedMixedLoadProbe(): Promise<
    readonly Readonly<Halfkp81V1R11MixedLoadProcessObservation>[]
  > {
    if (
      this.finalized ||
      this.activeLane ||
      this.activeMixed.size !== 0 ||
      this.engineRows(processRows()).length !== 0 ||
      this.engineBinary.sha256 !== V1R11_ENGINE_BINARY_SHA256
    ) {
      throw new Error("fixed Stage-B mixed-load admission differs");
    }
    const engineRaw = await authenticateFixedAsset(
      this.engineBinary,
      "Stage-B mixed engine preflight",
    );
    const evalRaw = await authenticateFixedAsset(
      this.evalFile,
      "Stage-B mixed eval preflight",
    );
    const slots = Object.freeze([
      ...Array.from({ length: 2 }, (_, index) =>
        Object.freeze({
          slotId: `fallback-${String(index + 1).padStart(2, "0")}`,
          class: "fallback" as const,
          hashMib: 8192 as const,
        }),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        Object.freeze({
          slotId: `normal-${String(index + 1).padStart(2, "0")}`,
          class: "normal" as const,
          hashMib: 512 as const,
        }),
      ),
    ]);
    for (const slot of slots) {
      await this.openMixedEngine(
        slot.slotId,
        slot.class,
        slot.hashMib,
        engineRaw,
        evalRaw,
      );
    }
    const first = this.captureMixedObservation();
    await waitForMinimumExternalObservationLifetime(
      Date.parse(first.observed_at_utc),
    );
    const second = this.captureMixedObservation();
    for (const slot of [...slots].reverse()) {
      await this.closeMixedEngine(slot.slotId);
    }
    return Object.freeze([first, second]);
  }

  async runFormalLike512(
    context: Readonly<Halfkp81V1R11FormalLikeArtifactContext>,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (
      this.finalized ||
      this.activeLane ||
      this.activeMixed.size !== 0 ||
      this.engineRows(processRows()).length !== 0 ||
      context.parents.length !== 512 ||
      this.engineBinary.sha256 !== V1R11_ENGINE_BINARY_SHA256
    ) {
      throw new Error("fixed formal-like-512 admission differs");
    }
    const engineRaw = await authenticateFixedAsset(
      this.engineBinary,
      "formal-like-512 engine preflight",
    );
    const evalRaw = await authenticateFixedAsset(
      this.evalFile,
      "formal-like-512 eval preflight",
    );
    const normalSlots = Object.freeze(
      Array.from(
        { length: 8 },
        (_, index) => `normal-${String(index + 1).padStart(2, "0")}`,
      ),
    );
    const fallbackSlots = Object.freeze(
      Array.from(
        { length: 2 },
        (_, index) => `fallback-${String(index + 1).padStart(2, "0")}`,
      ),
    );
    for (const slot of fallbackSlots) {
      await this.openMixedEngine(slot, "fallback", 8192, engineRaw, evalRaw);
    }
    for (const slot of normalSlots) {
      await this.openMixedEngine(slot, "normal", 512, engineRaw, evalRaw);
    }
    const first = this.captureMixedObservation();
    await waitForMinimumExternalObservationLifetime(
      Date.parse(first.observed_at_utc),
    );
    const second = this.captureMixedObservation();
    if (
      first.normal_active_recomputed !== 8 ||
      first.fallback_active_recomputed !== 2 ||
      second.normal_active_recomputed !== 8 ||
      second.fallback_active_recomputed !== 2
    ) {
      throw new Error("fixed formal-like-512 8+2 process evidence differs");
    }

    return produceHalfkp81Depth18V1R11FormalLike512Artifacts(
      context,
      async (): Promise<Readonly<Halfkp81V1R11FormalLikeExecutionResult>> => {
        const completed: Array<
          Readonly<Halfkp81V1R11FormalLikeCompletedParent> | undefined
        > = Array.from({ length: context.parents.length });
        const fallbackParentsByRole: Record<
          Halfkp81V1R11FormalLikeRole,
          number
        > = { fit: 0, tune: 0, sealed: 0 };
        const fallbackSearchesByRole: Record<
          Halfkp81V1R11FormalLikeRole,
          number
        > = { fit: 0, tune: 0, sealed: 0 };
        const freeFallbackSlots = [...fallbackSlots];
        const fallbackWaiters: Array<(slot: string) => void> = [];
        const acquireFallback = async (): Promise<string> => {
          const available = freeFallbackSlots.shift();
          if (available !== undefined) return available;
          return new Promise((resolve) => fallbackWaiters.push(resolve));
        };
        const releaseFallback = (slot: string): void => {
          const waiter = fallbackWaiters.shift();
          if (waiter === undefined) freeFallbackSlots.push(slot);
          else waiter(slot);
        };
        const currentEngine = (slot: string): UsiTeacherEngine => {
          const record = this.activeMixed.get(slot);
          if (record === undefined) {
            throw new Error(`formal-like-512 slot ${slot} is not active`);
          }
          return record.engine;
        };
        const reopen = async (
          slot: string,
          class_: "normal" | "fallback",
        ): Promise<void> => {
          await this.openMixedEngine(
            slot,
            class_,
            class_ === "normal" ? 512 : 8192,
            engineRaw,
            evalRaw,
          );
        };
        const capEvidence = (
          error: Readonly<SiblingTeacherNodeCapRoutingError>,
        ): Readonly<Record<string, unknown>> => {
          const cap = error.cap;
          if (cap.capWitnessDepth === null || cap.capWitnessNodes === null) {
            throw new Error("formal-like-512 cap witness is missing");
          }
          return Object.freeze({
            termination_reason: cap.terminationReason,
            requested_depth: cap.requestedDepth,
            node_cap: cap.nodeCap,
            minimum_completed_depth: cap.minimumCompletedDepth,
            deepest_complete_exact_depth: cap.deepestCompleteExactDepth,
            selected_snapshot_nodes: cap.selectedSnapshotNodes,
            maximum_observed_nodes: cap.maximumObservedNodes,
            maximum_observed_depth: cap.maximumObservedDepth,
            selected_snapshot_bound: cap.selectedSnapshotBound,
            discarded_at_or_above_node_cap_updates:
              cap.discardedAtOrAboveNodeCapUpdates,
            observed_lowerbound_updates: cap.observedLowerboundUpdates,
            observed_upperbound_updates: cap.observedUpperboundUpdates,
            cap_witness_depth: cap.capWitnessDepth,
            cap_witness_nodes: cap.capWitnessNodes,
            selected_precedes_witness: cap.selectedPrecedesWitness,
            completed_iteration_witness_depth:
              cap.completedIterationWitnessDepth,
          });
        };
        let nextParent = 0;
        const workers = normalSlots.map(async (normalSlot) => {
          while (true) {
            const parentIndex = nextParent;
            nextParent += 1;
            const parent = context.parents[parentIndex];
            if (parent === undefined) return;
            const role = context.roles.get(parent.parent_id);
            if (role === undefined) {
              throw new Error(`formal-like-512 parent ${parent.parent_id} role is missing`);
            }
            let normalRetries = 0 as 0 | 1;
            let fallbackRetries = 0 as 0 | 1;
            const events: Array<
              Readonly<{
                route: "normal" | "fallback";
                attempt: 1;
                error_name: "UsiResetForParentTimeoutError";
                phase: "reset-for-parent";
                timeout_ms: number;
              }>
            > = [];
            let prepared: Readonly<PreparedSiblingParentLabel> | undefined;
            let teacher: CompletedWorkEntry | undefined;
            let route: Readonly<Halfkp81V1R11FormalLikeRoute> | undefined;
            while (teacher === undefined) {
              try {
                const engine = currentEngine(normalSlot);
                prepared = await prepareSiblingParentLabel(
                  engine,
                  parent,
                  12,
                  { depth: 16 },
                );
                teacher = await rescorePreparedSiblingParent(
                  engine,
                  parent,
                  prepared,
                  {
                    depth: 18,
                    nodes: 2_000_000_000,
                    minimumCompletedDepth: 1,
                  },
                  "route-whole-parent",
                );
                route = Object.freeze({
                  mode: "normal-depth18" as const,
                  normal_hash_mib: 512 as const,
                  normal_limit: Object.freeze({
                    depth: 18 as const,
                    nodes: 2_000_000_000 as const,
                    minimum_completed_depth: 1 as const,
                  }),
                  fallback: null,
                });
              } catch (error) {
                if (error instanceof UsiResetForParentTimeoutError) {
                  if (normalRetries >= 1) throw error;
                  await this.closeMixedEngine(normalSlot);
                  await reopen(normalSlot, "normal");
                  normalRetries = 1;
                  events.push(
                    Object.freeze({
                      route: "normal" as const,
                      attempt: 1 as const,
                      error_name: "UsiResetForParentTimeoutError" as const,
                      phase: "reset-for-parent" as const,
                      timeout_ms: error.timeoutMs,
                    }),
                  );
                  prepared = undefined;
                  continue;
                }
                if (!(error instanceof SiblingTeacherNodeCapRoutingError)) {
                  throw error;
                }
                if (prepared === undefined) {
                  throw new Error("formal-like-512 cap route lacks prepared candidates");
                }
                fallbackParentsByRole[role] += 1;
                fallbackSearchesByRole[role] += prepared.candidateMoves.length;
                if (
                  fallbackParentsByRole.fit > 6 ||
                  fallbackParentsByRole.tune > 1 ||
                  fallbackParentsByRole.sealed > 1 ||
                  Object.values(fallbackParentsByRole).reduce(
                    (sum, count) => sum + count,
                    0,
                  ) > 8 ||
                  fallbackSearchesByRole.fit > 78 ||
                  fallbackSearchesByRole.tune > 13 ||
                  fallbackSearchesByRole.sealed > 13 ||
                  Object.values(fallbackSearchesByRole).reduce(
                    (sum, count) => sum + count,
                    0,
                  ) > 104
                ) {
                  throw new Error("formal-like-512 fallback budget exceeded");
                }
                await this.closeMixedEngine(normalSlot);
                const fallbackSlot = await acquireFallback();
                let discardedFallbackSearches = 0;
                let fallbackSlotReadyForNextParent = false;
                try {
                  while (true) {
                    try {
                      teacher = await rescorePreparedSiblingParent(
                        currentEngine(fallbackSlot),
                        parent,
                        prepared,
                        { depth: 18 },
                      );
                      await this.closeMixedEngine(fallbackSlot);
                      await reopen(fallbackSlot, "fallback");
                      fallbackSlotReadyForNextParent = true;
                      break;
                    } catch (fallbackError) {
                      if (
                        !(fallbackError instanceof UsiResetForParentTimeoutError) ||
                        fallbackRetries >= 1
                      ) {
                        throw fallbackError;
                      }
                      discardedFallbackSearches =
                        fallbackError instanceof SiblingTeacherRescoreResetTimeoutError
                          ? fallbackError.completedSearchesDiscarded
                          : 0;
                      fallbackSearchesByRole[role] +=
                        discardedFallbackSearches;
                      if (
                        fallbackSearchesByRole.fit > 78 ||
                        fallbackSearchesByRole.tune > 13 ||
                        fallbackSearchesByRole.sealed > 13 ||
                        Object.values(fallbackSearchesByRole).reduce(
                          (sum, count) => sum + count,
                          0,
                        ) > 104
                      ) {
                        throw new Error(
                          "formal-like-512 fallback retry search budget exceeded",
                        );
                      }
                      await this.closeMixedEngine(fallbackSlot);
                      await reopen(fallbackSlot, "fallback");
                      fallbackRetries = 1;
                      events.push(
                        Object.freeze({
                          route: "fallback" as const,
                          attempt: 1 as const,
                          error_name: "UsiResetForParentTimeoutError" as const,
                          phase: "reset-for-parent" as const,
                          timeout_ms: fallbackError.timeoutMs,
                        }),
                      );
                    }
                  }
                } finally {
                  if (fallbackSlotReadyForNextParent) {
                    releaseFallback(fallbackSlot);
                  }
                }
                await reopen(normalSlot, "normal");
                const searches =
                  prepared.candidateMoves.length + discardedFallbackSearches;
                route = Object.freeze({
                  mode: "hash8192-parent-fallback" as const,
                  normal_hash_mib: 512 as const,
                  normal_limit: Object.freeze({
                    depth: 18 as const,
                    nodes: 2_000_000_000 as const,
                    minimum_completed_depth: 1 as const,
                  }),
                  trigger: Object.freeze({
                    move: error.move,
                    candidate_index_zero_based: error.candidateIndex,
                    candidate_count: error.candidateCount,
                    completed_normal_rescores_discarded:
                      error.completedSearchesDiscarded,
                    cap: capEvidence(error),
                  }),
                  normal_engine_reaped_before_fallback: true as const,
                  fallback: Object.freeze({
                    hash_mib: 8192 as const,
                    depth: 18 as const,
                    timeout_ms: 14_400_000 as const,
                    semaphore_limit: 2 as const,
                    all_candidates_recomputed: true as const,
                    candidate_count: prepared.candidateMoves.length,
                    fallback_reset_retries_used: fallbackRetries,
                    discarded_completed_rescores_before_retry:
                      discardedFallbackSearches,
                    searches_executed: searches,
                    normal_rescore_rows_reused: 0 as const,
                    candidate_omissions: 0 as const,
                    engine_quit_before_semaphore_release: true as const,
                  }),
                });
              }
            }
            if (route === undefined) {
              throw new Error("formal-like-512 completed parent route is missing");
            }
            const recovery: Readonly<Halfkp81V1R11FormalLikeResetRecovery> =
              Object.freeze({
                policy: "recycle-engine-retry-parent-once" as const,
                normal_retries_used: normalRetries,
                fallback_retries_used: fallbackRetries,
                engine_recycles: (normalRetries + fallbackRetries) as 0 | 1 | 2,
                events: Object.freeze(events),
              });
            completed[parentIndex] = Object.freeze({
              parent_id: parent.parent_id,
              role,
              teacher_entry: sealHalfkp81V1R11FormalLikeTeacherEntry(
                teacher,
                context.runFingerprint,
              ),
              rescore_route: route,
              reset_timeout_recovery: recovery,
            });
          }
        });
        await Promise.all(workers);
        if (completed.some((entry) => entry === undefined)) {
          throw new Error("formal-like-512 completion set has a gap");
        }
        for (const slot of [...normalSlots].reverse()) {
          await this.closeMixedEngine(slot);
        }
        for (const slot of [...fallbackSlots].reverse()) {
          await this.closeMixedEngine(slot);
        }
        const fallbackParents = Object.values(fallbackParentsByRole).reduce(
          (sum, count) => sum + count,
          0,
        );
        const fallbackSearches = Object.values(fallbackSearchesByRole).reduce(
          (sum, count) => sum + count,
          0,
        );
        return Object.freeze({
          completed: Object.freeze(
            completed as readonly Readonly<Halfkp81V1R11FormalLikeCompletedParent>[],
          ),
          normal_engines: 8 as const,
          fallback_engines: 2 as const,
          maximum_normal_active: 8 as const,
          maximum_fallback_active: 2 as const,
          fallback_parents: fallbackParents,
          fallback_parents_by_role: Object.freeze(fallbackParentsByRole),
          fallback_searches: fallbackSearches,
          fallback_searches_by_role: Object.freeze(fallbackSearchesByRole),
          normal_partial_rows_published: 0 as const,
          capped_rows_published: 0 as const,
          technical_faults: 0 as const,
        });
      },
    );
  }

  private cleanupEvidence(): Readonly<Halfkp81V1R11FixedEngineCleanupEvidence> {
    const finalRows = processRows();
    const remaining = this.engineRows(finalRows).map(
      (row) => row.pid,
    );
    const remainingProcessGroupPids = finalRows
      .filter(
        (row) =>
          row.pgid === this.jobIdentity.runner.pgid &&
          row.pid !== this.jobIdentity.runner.pid &&
          row.pid !== this.jobIdentity.assertionHolder.pid &&
          row.pid !== this.jobIdentity.powerGuardian?.pid,
      )
      .map((row) => row.pid);
    for (const pid of this.pids) assertProcessMissing(pid);
    if (
      remaining.length !== 0 ||
      remainingProcessGroupPids.length !== 0 ||
      this.reaped.size !== this.pids.length ||
      new Set(this.pids).size !== this.pids.length ||
      this.pgids.some((pgid) => pgid !== this.jobIdentity.runner.pgid) ||
      this.startTokens.length !== this.pids.length
    ) {
      throw new Error("fixed Stage-B engine cleanup proof differs");
    }
    return Object.freeze({
      process_cleanup: Object.freeze({
        scheduling_stopped: true as const,
        engines_started: this.pids.length,
        engines_terminated: this.pids.length,
        engines_reaped: this.reaped.size,
        remaining_engine_pids: Object.freeze([]),
        children_reaped: true as const,
        next_job_started: false as const,
      }),
      os_reap_evidence: Object.freeze({
        observer_pid: process.pid,
        engine_pids: Object.freeze([...this.pids]),
        engine_pgids: Object.freeze([...this.pgids]),
        engine_start_tokens: Object.freeze([...this.startTokens]),
        direct_parent_matches: this.pids.length,
        dedicated_process_groups_verified: this.pids.length,
        kill_zero_esrch_after_close: this.pids.length,
        ps_rows_absent_after_close: this.pids.length,
        process_group_members_absent_after_close: this.pids.length,
        remaining_descendant_pids: Object.freeze(remaining),
        remaining_process_group_pids: Object.freeze(
          remainingProcessGroupPids,
        ),
      }),
    });
  }

  finalizeAndVerifyNoChildren(): Readonly<Halfkp81V1R11FixedEngineCleanupEvidence> {
    if (
      this.finalized ||
      this.activeLane ||
      this.activeMixed.size !== 0 ||
      this.pids.length < 1
    ) {
      throw new Error("fixed Stage-B cleanup finalization differs");
    }
    this.finalized = true;
    return this.cleanupEvidence();
  }

  async abortAndVerifyNoChildren(): Promise<
    Readonly<Halfkp81V1R11FixedEngineCleanupEvidence>
  > {
    if (this.finalized) {
      throw new Error("fixed Stage-B abort after finalization differs");
    }
    const errors: unknown[] = [];
    try {
      await this.activeEngine?.quit();
    } catch (error) {
      errors.push(error);
    }
    for (const record of this.activeMixed.values()) {
      try {
        await record.engine.quit();
      } catch (error) {
        errors.push(error);
      }
    }
    for (const [index, pid] of this.pids.entries()) {
      const startToken = this.startTokens[index]!;
      try {
        const live = processRows().find((row) => row.pid === pid);
        if (live !== undefined && live.start_token !== startToken) {
          throw new Error(
            `fixed Stage-B PID ${pid} start token changed before abort`,
          );
        }
        if (live !== undefined) process.kill(pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") errors.push(error);
      }
    }
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const rows = processRows();
      const live = this.engineRows(rows);
      if (live.length === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    for (const pid of this.pids) {
      try {
        assertProcessMissing(pid);
        if (!this.reaped.has(pid)) this.recordEngineReaped(pid);
      } catch (error) {
        errors.push(error);
      }
    }
    if (this.activeCwd !== null) {
      await fs.promises
        .rm(this.activeCwd, { recursive: true, force: true })
        .catch((error) => errors.push(error));
    }
    for (const record of this.activeMixed.values()) {
      await fs.promises
        .rm(record.cwd, { recursive: true, force: true })
        .catch((error) => errors.push(error));
    }
    this.activeMixed.clear();
    this.activeEngine = null;
    this.activeCwd = null;
    this.activeLane = false;
    this.finalized = true;
    let evidence: Readonly<Halfkp81V1R11FixedEngineCleanupEvidence> | null =
      null;
    try {
      evidence = this.cleanupEvidence();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length > 0 || evidence === null) {
      throw new AggregateError(
        errors,
        "fixed Stage-B abort cleanup could not prove zero children",
      );
    }
    return evidence;
  }
}

export async function createHalfkp81V1R11FixedStageBInputs(
  teacherPlan: Readonly<Halfkp81Depth18TeacherFileIdentity>,
  sourceRevision: string,
  powerGuardianPid?: number,
  lifecycleObserver?: Readonly<Halfkp81V1R11FixedEngineLifecycleObserver>,
): Promise<Readonly<Halfkp81V1R11FixedStageBInputs>> {
  if (
    teacherPlan.schema !== TEACHER_PLAN_SCHEMA ||
    !path.isAbsolute(teacherPlan.path) ||
    !Number.isSafeInteger(teacherPlan.bytes) ||
    teacherPlan.bytes < 1 ||
    !SHA256_RE.test(teacherPlan.sha256) ||
    !REVISION_RE.test(sourceRevision)
  ) {
    throw new Error("fixed Stage-B teacher context differs");
  }
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(
    teacherPlan.path,
  );
  if (
    authenticated.sourceRevision !== sourceRevision ||
    canonicalJson(authenticated.planIdentity) !== canonicalJson(teacherPlan) ||
    authenticated.planIdentity.schema !== TEACHER_PLAN_SCHEMA
  ) {
    throw new Error("fixed Stage-B authenticated teacher plan differs");
  }
  await authenticateFixedAsset(
    authenticated.engine.binary,
    "fixed Stage-B engine asset",
  );
  await authenticateFixedAsset(
    authenticated.engine.eval_file,
    "fixed Stage-B eval asset",
  );
  const selectionById = new Map(
    authenticated.selectionRows.map((row) => [row.position_id, row] as const),
  );
  const parents = new Map<string, Readonly<Halfkp81V1R11StageBParent>>();
  for (const parent of authenticated.parents) {
    const selection = selectionById.get(parent.position_id);
    if (
      selection === undefined ||
      selection.parent_id !== parent.parent_id ||
      selection.sfen !== parent.parent_sfen ||
      selection.recorded_move !== parent.played_move
    ) {
      throw new Error(
        `fixed Stage-B selected parent ${parent.parent_id} differs`,
      );
    }
    parents.set(
      parent.parent_id,
      Object.freeze({
        parent_id: parent.parent_id,
        parent_sfen: parent.parent_sfen,
        played_move: parent.played_move,
        legal_move_count: selection.legal_move_count,
      }),
    );
  }
  if (parents.size !== 8192) {
    throw new Error("fixed Stage-B selected parent count differs");
  }
  const remainingFormalLike = { ...HALFKP81_V1R11_FORMAL_LIKE_ROLE_COUNTS };
  const formalLikeParents = authenticated.parents.filter((parent) => {
    const role = authenticated.roles.get(parent.parent_id);
    if (role === undefined || remainingFormalLike[role] < 1) return false;
    remainingFormalLike[role] -= 1;
    return true;
  });
  if (
    formalLikeParents.length !== 512 ||
    Object.values(remainingFormalLike).some((remaining) => remaining !== 0)
  ) {
    throw new Error("fixed formal-like-512 selection differs");
  }
  const formalLikeRoles = new Map<string, Halfkp81V1R11FormalLikeRole>(
    formalLikeParents.map((parent) => {
      const role = authenticated.roles.get(parent.parent_id);
      if (role === undefined) {
        throw new Error(`fixed formal-like-512 role ${parent.parent_id} is missing`);
      }
      return [parent.parent_id, role] as const;
    }),
  );
  const jobIdentity = authenticateStageBJobIdentity(powerGuardianPid);
  return Object.freeze({
    boundary: new FixedBoundary(
      authenticated.engine.binary,
      authenticated.engine.eval_file,
      jobIdentity,
      lifecycleObserver,
    ),
    parents,
    formalLikeParents: Object.freeze(formalLikeParents),
    formalLikeRoles,
  });
}

/**
 * Non-injectable production bridge for the enrolled Stage-B gates. It does
 * not publish authority and does not collect power evidence; the fixed CLI
 * may place this result in its already-authenticated power envelope only
 * after every engine has been reaped.
 */
export async function runHalfkp81V1R11FixedStageBEngineGate(
  gate:
    | "candidate-order-gate"
    | "known10-probe"
    | "pathological-fallback-probe"
    | "mixed-load-gate"
    | "formal-like-512",
  teacherPlan: Readonly<Halfkp81Depth18TeacherFileIdentity>,
  sourceRevision: string,
  powerGuardianPid?: number,
  lifecycleObserver?: Readonly<Halfkp81V1R11FixedEngineLifecycleObserver>,
  abortSignal?: Promise<never>,
  formalLikeContext?: Readonly<
    Pick<Halfkp81V1R11FormalLikeArtifactContext, "outputDirectory" | "runFingerprint">
  >,
): Promise<Readonly<Halfkp81V1R11FixedStageBEngineGateResult>> {
  const inputs = await createHalfkp81V1R11FixedStageBInputs(
    teacherPlan,
    sourceRevision,
    powerGuardianPid,
    lifecycleObserver,
  );
  return runHalfkp81V1R11WithBoundaryCleanupForTests(
    inputs.boundary,
    async () =>
      gate === "candidate-order-gate"
        ? await (async () => {
            const parent = inputs.parents.get(
              HALFKP81_V1R11_CANDIDATE_ORDER_PARENT_ID,
            );
            if (parent === undefined) {
              throw new Error("fixed candidate-order parent is missing");
            }
            return runHalfkp81V1R11CandidateOrderGateCore(
              inputs.boundary,
              parent,
            );
          })()
        : gate === "known10-probe"
          ? await runHalfkp81V1R11Known10ProbeCore(
              inputs.boundary,
              inputs.parents,
            )
          : gate === "pathological-fallback-probe"
            ? await (async () => {
                const parent = inputs.parents.get(
                  HALFKP81_V1R11_PATHOLOGICAL_PARENT_ID,
                );
                if (parent === undefined) {
                  throw new Error("fixed pathological parent is missing");
                }
                return runHalfkp81V1R11PathologicalFallbackGateCore(
                  inputs.boundary,
                  parent,
                );
              })()
            : gate === "mixed-load-gate"
              ? await runHalfkp81V1R11MixedLoadGateCore(inputs.boundary)
              : await (async () => {
                  if (formalLikeContext === undefined) {
                    throw new Error("formal-like-512 artifact context is missing");
                  }
                  return inputs.boundary.runFormalLike512({
                    outputDirectory: formalLikeContext.outputDirectory,
                    teacherPlan,
                    sourceRevision,
                    runFingerprint: formalLikeContext.runFingerprint,
                    parents: inputs.formalLikeParents,
                    roles: inputs.formalLikeRoles,
                  });
                })(),
    abortSignal,
  );
}

export async function runHalfkp81V1R11WithBoundaryCleanupForTests(
  boundary: Readonly<Halfkp81V1R11FixedEngineBoundary>,
  operation: () => Promise<Readonly<Record<string, unknown>>>,
  abortSignal?: Promise<never>,
): Promise<Readonly<Halfkp81V1R11FixedStageBEngineGateResult>> {
  let gateResult: Readonly<Record<string, unknown>>;
  const operationPromise = operation();
  try {
    gateResult =
      abortSignal === undefined
        ? await operationPromise
        : await Promise.race([operationPromise, abortSignal]);
  } catch (primary) {
    try {
      await boundary.abortAndVerifyNoChildren();
    } catch (cleanup) {
      throw new AggregateError(
        [primary, cleanup],
        "fixed Stage-B gate and boundary cleanup both failed",
      );
    }
    // A power-continuity fault can win the race while the in-flight USI
    // search is unwinding after boundary abort. The core has no publication
    // side effect, but its eventual rejection still must be observed.
    void operationPromise.catch(() => undefined);
    throw primary;
  }
  const cleanup = boundary.finalizeAndVerifyNoChildren();
  return Object.freeze({ gate_result: gateResult, ...cleanup });
}
