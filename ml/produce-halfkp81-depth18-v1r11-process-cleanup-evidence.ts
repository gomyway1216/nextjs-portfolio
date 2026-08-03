import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { buildHalfkp81V1R11RecursiveProducerIdentity } from "./halfkp81-depth18-v1r11-producer-closure";

const SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-process-cleanup-evidence-v1r11" as const;
const STATUS = "cleanup-independently-recomputable-no-authority" as const;
const PS_COMMAND = Object.freeze([
  "/bin/ps",
  "-ww",
  "-axo",
  "pid=,ppid=,pgid=,lstart=,command=",
]);
const ENTRYPOINT =
  "ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence.ts" as const;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const MONOTONIC_RE = /^(?:0|[1-9][0-9]*)$/u;
const LSTART_RE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4}$/u;
const FALSE_AUTHORITY = Object.freeze({
  may_execute_preformal_engine_gates: false,
  may_execute_formal_teacher: false,
  may_train: false,
  may_play_formal_games: false,
  may_write_live_weights: false,
});

export type Halfkp81V1R11CleanupScope =
  | "preformal"
  | "post-formal-environment";

export interface Halfkp81V1R11CleanupFileIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly schema: string;
}

export interface Halfkp81V1R11CleanupRunnerIdentity {
  readonly pid: number;
  readonly pgid: number;
  readonly lstart: string;
}

export interface Halfkp81V1R11CleanupFixedRoleCommand {
  readonly executable: string;
  readonly argv: string;
}

export interface Halfkp81V1R11CleanupProducer {
  readonly source_revision: string;
  readonly entrypoint: typeof ENTRYPOINT;
  readonly dependency_closure: readonly Readonly<{
    path: string;
    bytes: number;
    sha256: string;
  }>[];
}

export interface Halfkp81V1R11ProcessCleanupInput {
  readonly scope: Halfkp81V1R11CleanupScope;
  readonly teacherPlan: Readonly<Halfkp81V1R11CleanupFileIdentity>;
  readonly sourceRevision: string;
  readonly runFingerprint: string;
  readonly launchagent: Readonly<{
    label: string;
    plistSnapshot: Readonly<Halfkp81V1R11CleanupFileIdentity>;
  }>;
  readonly runnerIdentity: Readonly<Halfkp81V1R11CleanupRunnerIdentity> | null;
  readonly runnerNullPhaseBeforeAnyAdmission: boolean;
  readonly uid: number;
  readonly homeDirectory: string;
  readonly repositoryRoot: string;
  readonly fixedRoles: Readonly<{
    powerGuardian: Readonly<Halfkp81V1R11CleanupFixedRoleCommand>;
    stageBSupervisor: Readonly<Halfkp81V1R11CleanupFixedRoleCommand>;
    yaneuraouEngine: Readonly<Halfkp81V1R11CleanupFixedRoleCommand>;
  }>;
  readonly producer: Readonly<Halfkp81V1R11CleanupProducer>;
}

interface CommandResult {
  readonly exitCode: number;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

export interface Halfkp81V1R11ProcessCleanupDependencies {
  readonly run: (argv: readonly string[]) => Readonly<CommandResult>;
  readonly nowMs: () => number;
  readonly monotonicNs: () => bigint;
  readonly wait: (milliseconds: number) => Promise<void>;
}

export interface Halfkp81V1R11ProcessCleanupValidationContext
  extends Halfkp81V1R11ProcessCleanupInput {
  readonly expectedOutputPath: string;
  readonly plistProgramArguments: readonly string[];
}

interface RawTranscript {
  readonly schema: string;
  readonly encoding: "base64";
  readonly base64: string;
  readonly decoded_bytes: number;
  readonly sha256: string;
}

type ProcessRole =
  | "runner"
  | "assertion-holder"
  | "power-guardian"
  | "stage-b-supervisor"
  | "yaneuraou-engine"
  | "other-target-descendant"
  | "target-process-group-member"
  | "pid-reuse-nontarget";

interface RawProcessRow {
  readonly pid: number;
  readonly ppid: number;
  readonly pgid: number;
  readonly lstart: string;
  readonly executable: string;
  readonly argv: string;
}

interface ProcessRow extends RawProcessRow {
  readonly role: ProcessRole;
}

interface PsCapture {
  readonly command: readonly string[];
  readonly started_at_utc: string;
  readonly finished_at_utc: string;
  readonly started_monotonic_ns: string;
  readonly finished_monotonic_ns: string;
  readonly exit_code: number;
  readonly signal: null;
  readonly stdout: Readonly<RawTranscript>;
  readonly stderr: Readonly<RawTranscript>;
  readonly parsed_process_rows: readonly Readonly<ProcessRow>[];
}

interface CleanupCommand {
  readonly sequence: number;
  readonly phase: "bootout" | "TERM" | "KILL";
  readonly argv: readonly string[];
  readonly target_pid: number | null;
  readonly target_pgid: number | null;
  readonly target_lstart: string | null;
  readonly started_at_utc: string;
  readonly finished_at_utc: string;
  readonly started_monotonic_ns: string;
  readonly finished_monotonic_ns: string;
  readonly exit_code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly disposition:
    | "executed"
    | "not-required-after-held-post-bootout-absence-probe"
    | "not-required-after-held-absence-probe";
  readonly stdout: Readonly<RawTranscript> | null;
  readonly stderr: Readonly<RawTranscript> | null;
  readonly absence_probe: Readonly<PsCapture>;
}

interface ServiceAbsence {
  readonly command: readonly string[];
  readonly started_at_utc: string;
  readonly finished_at_utc: string;
  readonly started_monotonic_ns: string;
  readonly finished_monotonic_ns: string;
  readonly exit_code: 113;
  readonly signal: null;
  readonly stdout: Readonly<RawTranscript>;
  readonly stderr: Readonly<RawTranscript>;
  readonly parsed_service_absent: true;
}

export interface Halfkp81V1R11ProcessCleanupEvidence {
  readonly schema: typeof SCHEMA;
  readonly status: typeof STATUS;
  readonly scope: Halfkp81V1R11CleanupScope;
  readonly teacher_plan: Readonly<Halfkp81V1R11CleanupFileIdentity>;
  readonly source_revision: string;
  readonly run_fingerprint: string;
  readonly launchagent: Readonly<{
    label: string;
    plist_snapshot: Readonly<Halfkp81V1R11CleanupFileIdentity>;
  }>;
  readonly runner_identity: Readonly<Halfkp81V1R11CleanupRunnerIdentity> | null;
  readonly pre_cleanup_ps: Readonly<PsCapture>;
  readonly pre_cleanup_process_rows: readonly Readonly<ProcessRow>[];
  readonly ordered_cleanup_commands: readonly Readonly<CleanupCommand>[];
  readonly service_absence: Readonly<ServiceAbsence>;
  readonly pid_reuse_rejection: Readonly<{
    identity_tuple_fields: readonly ["pid", "pgid", "lstart", "executable"];
    checked_pids: readonly number[];
    rejected_reuse_rows: readonly Readonly<ProcessRow>[];
    all_reuse_rejected: true;
  }>;
  readonly final_ps_first: Readonly<PsCapture>;
  readonly final_ps_second: Readonly<PsCapture>;
  readonly remaining_process_rows: readonly Readonly<ProcessRow>[];
  readonly remaining_process_group_rows: readonly Readonly<{
    pgid: number;
    member_identities: readonly Readonly<ProcessRow>[];
  }>[];
  readonly process_cleanup: Readonly<{
    scheduling_stopped: true;
    engines_terminated: number;
    engines_reaped: number;
    remaining_engine_pids: readonly number[];
  }>;
  readonly producer: Readonly<Halfkp81V1R11CleanupProducer>;
  readonly captured_at_utc: string;
  readonly authority: typeof FALSE_AUTHORITY;
}

function sha256(raw: Uint8Array | string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("cleanup evidence contains a non-canonical value");
}

function exactKeys(value: unknown, keys: readonly string[], label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  if (
    canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) {
    throw new Error(`${label} keys differ`);
  }
}

function rawTranscript(schema: string, raw: Buffer): Readonly<RawTranscript> {
  return Object.freeze({
    schema,
    encoding: "base64" as const,
    base64: raw.toString("base64"),
    decoded_bytes: raw.byteLength,
    sha256: sha256(raw),
  });
}

function validateRawTranscript(
  value: unknown,
  schema: string,
  label: string,
): Buffer {
  exactKeys(
    value,
    ["schema", "encoding", "base64", "decoded_bytes", "sha256"],
    label,
  );
  const transcript = value as RawTranscript;
  const raw = Buffer.from(transcript.base64, "base64");
  if (
    transcript.schema !== schema ||
    transcript.encoding !== "base64" ||
    raw.toString("base64") !== transcript.base64 ||
    transcript.decoded_bytes !== raw.byteLength ||
    transcript.sha256 !== sha256(raw)
  ) {
    throw new Error(`${label} raw identity differs`);
  }
  return raw;
}

function parsePs(raw: Buffer): readonly Readonly<RawProcessRow>[] {
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw) || (text.length > 0 && !text.endsWith("\n"))) {
    throw new Error("cleanup ps stdout is not exact UTF-8 LF text");
  }
  const rows: RawProcessRow[] = [];
  for (const [offset, line] of text.split("\n").slice(0, -1).entries()) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4})\s+(.+)$/u.exec(line);
    if (match === null) throw new Error(`cleanup ps row ${offset + 1} is ambiguous`);
    const row = Object.freeze({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      lstart: match[4]!,
      executable: /^(\S+)(?:\s|$)/u.exec(match[5]!)?.[1] ?? "",
      argv: match[5]!,
    });
    if (
      !Number.isSafeInteger(row.pid) || row.pid < 1 ||
      !Number.isSafeInteger(row.ppid) || row.ppid < 0 ||
      !Number.isSafeInteger(row.pgid) || row.pgid < 1 ||
      !LSTART_RE.test(row.lstart) || row.executable.length < 1 || row.argv.length < 1 ||
      rows.some((prior) => prior.pid === row.pid)
    ) {
      throw new Error(`cleanup ps row ${offset + 1} semantics differ`);
    }
    rows.push(row);
  }
  return Object.freeze(rows.sort((left, right) => left.pid - right.pid));
}

function descendants(
  rows: readonly Readonly<RawProcessRow>[],
  runnerPid: number,
): ReadonlySet<number> {
  const found = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (
        row.pid !== runnerPid &&
        (row.ppid === runnerPid || found.has(row.ppid)) &&
        !found.has(row.pid)
      ) {
        found.add(row.pid);
        changed = true;
      }
    }
  }
  return found;
}

function identityEqual(
  left: Readonly<RawProcessRow>,
  right: Readonly<RawProcessRow>,
): boolean {
  return left.pid === right.pid && left.pgid === right.pgid &&
    left.lstart === right.lstart && left.executable === right.executable;
}

function processRowOrder(rows: readonly Readonly<ProcessRow>[]): readonly Readonly<ProcessRow>[] {
  return Object.freeze([...rows].sort((left, right) =>
    left.pid - right.pid || Buffer.compare(Buffer.from(left.role), Buffer.from(right.role)),
  ));
}

function classifyPreRows(
  rows: readonly Readonly<RawProcessRow>[],
  context: Readonly<{
    runner: Readonly<Halfkp81V1R11CleanupRunnerIdentity> | null;
    plistProgramArguments: readonly string[];
    fixedRoles: Halfkp81V1R11ProcessCleanupInput["fixedRoles"];
    allowAbsentRunner: boolean;
    allowStageBWrapper: boolean;
  }>,
): readonly Readonly<ProcessRow>[] {
  if (context.runner === null) return Object.freeze([]);
  const runnerRows = rows.filter((row) =>
    row.pid === context.runner!.pid && row.pgid === context.runner!.pgid &&
    row.lstart === context.runner!.lstart,
  );
  if (runnerRows.length === 0 && context.allowAbsentRunner) {
    return processRowOrder(
      rows
        .filter(
          (row) =>
            row.pid === context.runner!.pid || row.pgid === context.runner!.pgid,
        )
        .map((row) =>
          Object.freeze({
            ...row,
            role:
              row.pid === context.runner!.pid
                ? ("pid-reuse-nontarget" as const)
                : ("target-process-group-member" as const),
          }),
        ),
    );
  }
  if (runnerRows.length !== 1) {
    throw new Error("cleanup runner identity is absent or ambiguous");
  }
  const runner = runnerRows[0]!;
  const utilityArguments = context.plistProgramArguments.slice(2);
  const nodeDirect =
    context.plistProgramArguments.length >= 1 &&
    context.plistProgramArguments[0] !== "/usr/bin/caffeinate" &&
    runner.executable === context.plistProgramArguments[0] &&
    runner.argv === context.plistProgramArguments.join(" ");
  const stageBWrapper =
    context.allowStageBWrapper &&
    context.plistProgramArguments[0] === "/usr/bin/caffeinate" &&
    context.plistProgramArguments[1] === "-dimsu" &&
    utilityArguments.length >= 1 &&
    runner.executable === utilityArguments[0] &&
    runner.argv === utilityArguments.join(" ");
  if (!nodeDirect && !stageBWrapper) {
    throw new Error("cleanup runner/plist identity differs");
  }
  const expectedHolderArgv = nodeDirect
    ? ["/usr/bin/caffeinate", "-dimsu", "-w", String(runner.pid)].join(" ")
    : context.plistProgramArguments.join(" ");
  const descendantPids = descendants(rows, runner.pid);
  const targets = rows.filter((row) =>
    row.pid === runner.pid || descendantPids.has(row.pid) || row.pgid === runner.pgid,
  );
  return processRowOrder(targets.map((row) => {
    let role: ProcessRole;
    if (row.pid === runner.pid) role = "runner";
    else if (
      row.ppid === runner.pid && row.executable === "/usr/bin/caffeinate" &&
      row.argv === expectedHolderArgv
    ) role = "assertion-holder";
    else if (
      row.executable === context.fixedRoles.powerGuardian.executable &&
      row.argv === context.fixedRoles.powerGuardian.argv
    ) role = "power-guardian";
    else if (
      row.executable === context.fixedRoles.stageBSupervisor.executable &&
      row.argv === context.fixedRoles.stageBSupervisor.argv
    ) role = "stage-b-supervisor";
    else if (
      row.executable === context.fixedRoles.yaneuraouEngine.executable &&
      row.argv === context.fixedRoles.yaneuraouEngine.argv
    ) role = "yaneuraou-engine";
    else if (descendantPids.has(row.pid)) role = "other-target-descendant";
    else role = "target-process-group-member";
    return Object.freeze({ ...row, role });
  }));
}

function filterCaptureRows(
  all: readonly Readonly<RawProcessRow>[],
  pre: readonly Readonly<ProcessRow>[],
  runner: Readonly<Halfkp81V1R11CleanupRunnerIdentity> | null,
): readonly Readonly<ProcessRow>[] {
  if (runner === null) return Object.freeze([]);
  const preByPid = new Map(pre.map((row) => [row.pid, row] as const));
  const descendantPids = descendants(all, runner.pid);
  const result: ProcessRow[] = [];
  for (const row of all) {
    const held = preByPid.get(row.pid);
    if (held !== undefined && !identityEqual(row, held)) {
      result.push(Object.freeze({ ...row, role: "pid-reuse-nontarget" as const }));
    } else if (held !== undefined) {
      result.push(Object.freeze({ ...row, role: held.role }));
    } else if (descendantPids.has(row.pid)) {
      result.push(Object.freeze({ ...row, role: "other-target-descendant" as const }));
    } else if (row.pgid === runner.pgid) {
      result.push(Object.freeze({ ...row, role: "target-process-group-member" as const }));
    }
  }
  return processRowOrder(result);
}

function parsePlistProgramArguments(raw: Buffer): readonly string[] {
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw)) throw new Error("cleanup plist is not UTF-8");
  const key = "<key>ProgramArguments</key>";
  const keyAt = text.indexOf(key);
  const arrayStart = text.indexOf("<array>", keyAt + key.length);
  const arrayEnd = text.indexOf("</array>", arrayStart + 7);
  if (keyAt < 0 || arrayStart < 0 || arrayEnd < 0 || text.indexOf(key, keyAt + 1) >= 0) {
    throw new Error("cleanup plist ProgramArguments differ");
  }
  const strings = [...text.slice(arrayStart + 7, arrayEnd).matchAll(/<string>([^<]*)<\/string>/gu)]
    .map((match) => match[1]!
      .replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"').replaceAll("&apos;", "'"));
  if (strings.length < 1 || strings.some((entry) => entry.length < 1)) {
    throw new Error("cleanup plist ProgramArguments are missing");
  }
  return Object.freeze(strings);
}

function validateFileIdentity(value: unknown, expected: Halfkp81V1R11CleanupFileIdentity, label: string): void {
  exactKeys(value, ["path", "bytes", "sha256", "schema"], label);
  if (canonicalJson(value) !== canonicalJson(expected) || !path.isAbsolute(expected.path) ||
      !Number.isSafeInteger(expected.bytes) || expected.bytes < 1 || !SHA256_RE.test(expected.sha256) ||
      typeof expected.schema !== "string" || expected.schema.length < 1) {
    throw new Error(`${label} differs`);
  }
}

function readHeldIdentity(identity: Halfkp81V1R11CleanupFileIdentity, label: string): Buffer {
  const handle = fs.openSync(identity.path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const before = fs.fstatSync(handle);
    const linked = fs.lstatSync(identity.path);
    if (!Number.isSafeInteger(before.size) || before.size < 0) {
      throw new Error(`${label} held size differs`);
    }
    const readHeld = (): Buffer => {
      const raw = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < raw.byteLength) {
        const count = fs.readSync(handle, raw, offset, raw.byteLength - offset, offset);
        if (count < 1) throw new Error(`${label} held descriptor read is short`);
        offset += count;
      }
      return raw;
    };
    const first = readHeld();
    const second = readHeld();
    const linkedRead = fs.readFileSync(identity.path);
    const after = fs.fstatSync(handle);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
        linked.dev !== before.dev || linked.ino !== before.ino ||
        before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
        !first.equals(second) || !first.equals(linkedRead) ||
        first.byteLength !== identity.bytes || sha256(first) !== identity.sha256 ||
        fs.realpathSync.native(identity.path) !== identity.path) {
      throw new Error(`${label} held identity differs`);
    }
    return first;
  } finally {
    fs.closeSync(handle);
  }
}

function tick(dependencies: Halfkp81V1R11ProcessCleanupDependencies): Readonly<{utc: string; mono: string}> {
  const ms = dependencies.nowMs();
  const mono = dependencies.monotonicNs();
  if (!Number.isSafeInteger(ms) || ms < 0 || mono < 0n) throw new Error("cleanup clock differs");
  return Object.freeze({ utc: new Date(ms).toISOString(), mono: mono.toString() });
}

function capturePs(
  dependencies: Halfkp81V1R11ProcessCleanupDependencies,
  stdoutSchema: string,
  stderrSchema: string,
  preRows: readonly Readonly<ProcessRow>[] | null,
  context: Readonly<{
    runner: Halfkp81V1R11CleanupRunnerIdentity | null;
    plistProgramArguments: readonly string[];
    fixedRoles: Halfkp81V1R11ProcessCleanupInput["fixedRoles"];
    allowAbsentRunner: boolean;
    allowStageBWrapper: boolean;
  }>,
): Readonly<PsCapture> {
  const start = tick(dependencies);
  const result = dependencies.run(PS_COMMAND);
  const finish = tick(dependencies);
  if (result.exitCode !== 0 || result.signal !== null || result.stderr.byteLength !== 0) {
    throw new Error("cleanup ps command failed");
  }
  const all = parsePs(result.stdout);
  const parsed = preRows === null
    ? classifyPreRows(all, context)
    : filterCaptureRows(all, preRows, context.runner);
  return Object.freeze({
    command: PS_COMMAND,
    started_at_utc: start.utc,
    finished_at_utc: finish.utc,
    started_monotonic_ns: start.mono,
    finished_monotonic_ns: finish.mono,
    exit_code: 0,
    signal: null,
    stdout: rawTranscript(stdoutSchema, result.stdout),
    stderr: rawTranscript(stderrSchema, result.stderr),
    parsed_process_rows: parsed,
  });
}

function captureExecuted(
  dependencies: Halfkp81V1R11ProcessCleanupDependencies,
  sequence: number,
  phase: CleanupCommand["phase"],
  argv: readonly string[],
  target: Halfkp81V1R11CleanupRunnerIdentity | null,
): Omit<CleanupCommand, "absence_probe"> {
  const start = tick(dependencies);
  const result = dependencies.run(argv);
  const finish = tick(dependencies);
  if (result.exitCode !== 0 || result.signal !== null) throw new Error(`cleanup ${phase} command failed`);
  return Object.freeze({
    sequence, phase, argv: Object.freeze([...argv]),
    target_pid: target?.pid ?? null, target_pgid: target?.pgid ?? null,
    target_lstart: target?.lstart ?? null,
    started_at_utc: start.utc, finished_at_utc: finish.utc,
    started_monotonic_ns: start.mono, finished_monotonic_ns: finish.mono,
    exit_code: 0, signal: null, disposition: "executed" as const,
    stdout: rawTranscript("text/plain-exact-command-stdout", result.stdout),
    stderr: rawTranscript("text/plain-exact-command-stderr", result.stderr),
  });
}

function captureNotRequired(
  dependencies: Halfkp81V1R11ProcessCleanupDependencies,
  sequence: number,
  phase: "TERM" | "KILL",
  argv: readonly string[],
  target: Halfkp81V1R11CleanupRunnerIdentity | null,
  disposition: CleanupCommand["disposition"],
): Omit<CleanupCommand, "absence_probe"> {
  const start = tick(dependencies);
  const finish = tick(dependencies);
  return Object.freeze({
    sequence, phase, argv: Object.freeze([...argv]),
    target_pid: target?.pid ?? null, target_pgid: target?.pgid ?? null,
    target_lstart: target?.lstart ?? null,
    started_at_utc: start.utc, finished_at_utc: finish.utc,
    started_monotonic_ns: start.mono, finished_monotonic_ns: finish.mono,
    exit_code: null, signal: null, disposition,
    stdout: null, stderr: null,
  });
}

function exactSurvivors(rows: readonly Readonly<ProcessRow>[]): readonly Readonly<ProcessRow>[] {
  return rows.filter((row) => row.role !== "pid-reuse-nontarget");
}

function signalGroupSurvivors(
  rows: readonly Readonly<ProcessRow>[],
  runner: Readonly<Halfkp81V1R11CleanupRunnerIdentity> | null,
): readonly Readonly<ProcessRow>[] {
  return runner === null
    ? Object.freeze([])
    : rows.filter((row) =>
        row.role !== "pid-reuse-nontarget" && row.pgid === runner.pgid,
      );
}

function unsafeSameGroupReuse(
  rows: readonly Readonly<ProcessRow>[],
  runner: Readonly<Halfkp81V1R11CleanupRunnerIdentity> | null,
): boolean {
  return runner !== null && rows.some((row) =>
    row.role === "pid-reuse-nontarget" && row.pgid === runner.pgid,
  );
}

function serviceAbsence(
  dependencies: Halfkp81V1R11ProcessCleanupDependencies,
  uid: number,
  label: string,
): Readonly<ServiceAbsence> {
  const command = Object.freeze(["/bin/launchctl", "print", `gui/${uid}/${label}`]);
  const start = tick(dependencies);
  const result = dependencies.run(command);
  const finish = tick(dependencies);
  const expectedStderr = Buffer.from(
    `Bad request.\nCould not find service "${label}" in domain for user gui: ${uid}\n`,
    "utf8",
  );
  if (result.exitCode !== 113 || result.signal !== null || result.stdout.byteLength !== 0 ||
      !result.stderr.equals(expectedStderr)) {
    throw new Error("cleanup LaunchAgent service absence differs");
  }
  return Object.freeze({
    command, started_at_utc: start.utc, finished_at_utc: finish.utc,
    started_monotonic_ns: start.mono, finished_monotonic_ns: finish.mono,
    exit_code: 113, signal: null,
    stdout: rawTranscript("text/plain-exact-command-stdout", result.stdout),
    stderr: rawTranscript("text/plain-exact-command-stderr", result.stderr),
    parsed_service_absent: true,
  });
}

function outputPath(scope: Halfkp81V1R11CleanupScope, home: string): string {
  const root = path.join(home, ".codex/shogi-runs");
  return scope === "preformal"
    ? path.join(root, "halfkp81-hard-depth18-yaneura-only-v1r11-authority/preformal-process-cleanup-evidence.json")
    : path.join(root, "halfkp81-hard-depth18-yaneura-only-v1r11/environment-process-cleanup-evidence.json");
}

function canonicalLine(value: unknown): Buffer {
  return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
}

function publishCreateOnly(destination: string, evidence: Halfkp81V1R11ProcessCleanupEvidence): Halfkp81V1R11CleanupFileIdentity {
  const directory = path.dirname(destination);
  const metadata = fs.lstatSync(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== process.geteuid?.() ||
      (metadata.mode & 0o7777) !== 0o700 || fs.realpathSync.native(directory) !== directory) {
    throw new Error("cleanup evidence parent directory is not private owned real directory");
  }
  const raw = canonicalLine(evidence);
  const handle = fs.openSync(destination,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
  try { fs.writeFileSync(handle, raw); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
  const directoryHandle = fs.openSync(directory, fs.constants.O_RDONLY);
  try { fs.fsyncSync(directoryHandle); } finally { fs.closeSync(directoryHandle); }
  const identity = Object.freeze({ path: destination, bytes: raw.byteLength, sha256: sha256(raw), schema: SCHEMA });
  const reread = readHeldIdentity(identity, "published cleanup evidence");
  const published = fs.lstatSync(destination);
  if (!reread.equals(raw) || !published.isFile() || published.isSymbolicLink() ||
      published.nlink !== 1 || published.uid !== process.geteuid?.() ||
      (published.mode & 0o7777) !== 0o600) {
    throw new Error("published cleanup evidence stable private identity differs");
  }
  return identity;
}

function validateProducer(
  value: unknown,
  expected: Halfkp81V1R11CleanupProducer,
  sourceRevision: string,
): void {
  exactKeys(value, ["source_revision", "entrypoint", "dependency_closure"], "cleanup producer");
  const producer = value as Halfkp81V1R11CleanupProducer;
  if (canonicalJson(producer) !== canonicalJson(expected) || producer.entrypoint !== ENTRYPOINT ||
      producer.source_revision !== sourceRevision || producer.dependency_closure.length < 1 ||
      producer.dependency_closure[0]?.path !== ENTRYPOINT) throw new Error("cleanup producer differs");
  const rest = producer.dependency_closure.slice(1).map((row) => row.path);
  const sorted = [...rest].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  if (canonicalJson(rest) !== canonicalJson(sorted) || new Set(producer.dependency_closure.map((row) => row.path)).size !== producer.dependency_closure.length) {
    throw new Error("cleanup producer closure order differs");
  }
  producer.dependency_closure.forEach((row, index) => {
    exactKeys(row, ["path", "bytes", "sha256"], `cleanup producer closure ${index + 1}`);
    if (!Number.isSafeInteger(row.bytes) || row.bytes < 1 || !SHA256_RE.test(row.sha256) ||
        path.isAbsolute(row.path) || path.normalize(row.path) !== row.path ||
        row.path.startsWith("../") || row.path.length < 1) {
      throw new Error("cleanup producer closure identity differs");
    }
  });
}

interface ValidatedPs {
  readonly value: Readonly<PsCapture>;
  readonly rows: readonly Readonly<ProcessRow>[];
  readonly startedMono: bigint;
  readonly finishedMono: bigint;
  readonly startedUtc: number;
  readonly finishedUtc: number;
}

function parseUtc(value: unknown, label: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    throw new Error(`${label} UTC timestamp differs`);
  }
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${label} UTC timestamp differs`);
  }
  return parsed;
}

function parseMonotonic(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !MONOTONIC_RE.test(value)) {
    throw new Error(`${label} monotonic timestamp differs`);
  }
  return BigInt(value);
}

function validatePsCapture(
  value: unknown,
  stdoutSchema: string,
  stderrSchema: string,
  preRows: readonly Readonly<ProcessRow>[] | null,
  context: Halfkp81V1R11ProcessCleanupValidationContext,
  label: string,
): Readonly<ValidatedPs> {
  exactKeys(value, [
    "command", "started_at_utc", "finished_at_utc", "started_monotonic_ns",
    "finished_monotonic_ns", "exit_code", "signal", "stdout", "stderr",
    "parsed_process_rows",
  ], label);
  const capture = value as PsCapture;
  const startedUtc = parseUtc(capture.started_at_utc, `${label} start`);
  const finishedUtc = parseUtc(capture.finished_at_utc, `${label} finish`);
  const startedMono = parseMonotonic(capture.started_monotonic_ns, `${label} start`);
  const finishedMono = parseMonotonic(capture.finished_monotonic_ns, `${label} finish`);
  const stdout = validateRawTranscript(capture.stdout, stdoutSchema, `${label} stdout`);
  const stderr = validateRawTranscript(capture.stderr, stderrSchema, `${label} stderr`);
  const all = parsePs(stdout);
  const recomputed = preRows === null
      ? classifyPreRows(all, {
        runner: context.runnerIdentity,
        plistProgramArguments: context.plistProgramArguments,
        fixedRoles: context.fixedRoles,
        allowAbsentRunner: context.scope === "post-formal-environment",
        allowStageBWrapper: context.scope === "preformal",
      })
    : filterCaptureRows(all, preRows, context.runnerIdentity);
  if (
    canonicalJson(capture.command) !== canonicalJson(PS_COMMAND) ||
    capture.exit_code !== 0 || capture.signal !== null || stderr.byteLength !== 0 ||
    finishedUtc < startedUtc || finishedMono < startedMono ||
    canonicalJson(capture.parsed_process_rows) !== canonicalJson(recomputed)
  ) {
    throw new Error(`${label} semantics differ`);
  }
  for (const [index, row] of recomputed.entries()) {
    exactKeys(row, ["pid", "ppid", "pgid", "lstart", "executable", "argv", "role"], `${label} row ${index + 1}`);
  }
  return Object.freeze({ value: capture, rows: recomputed, startedMono, finishedMono, startedUtc, finishedUtc });
}

function validateServiceAbsence(
  value: unknown,
  context: Halfkp81V1R11ProcessCleanupValidationContext,
): Readonly<{value: ServiceAbsence; startedMono: bigint; finishedMono: bigint; startedUtc: number; finishedUtc: number}> {
  exactKeys(value, [
    "command", "started_at_utc", "finished_at_utc", "started_monotonic_ns",
    "finished_monotonic_ns", "exit_code", "signal", "stdout", "stderr",
    "parsed_service_absent",
  ], "cleanup service absence");
  const capture = value as ServiceAbsence;
  const expectedCommand = ["/bin/launchctl", "print", `gui/${context.uid}/${context.launchagent.label}`];
  const startedUtc = parseUtc(capture.started_at_utc, "cleanup service absence start");
  const finishedUtc = parseUtc(capture.finished_at_utc, "cleanup service absence finish");
  const startedMono = parseMonotonic(capture.started_monotonic_ns, "cleanup service absence start");
  const finishedMono = parseMonotonic(capture.finished_monotonic_ns, "cleanup service absence finish");
  const stdout = validateRawTranscript(capture.stdout, "text/plain-exact-command-stdout", "cleanup service absence stdout");
  const stderr = validateRawTranscript(capture.stderr, "text/plain-exact-command-stderr", "cleanup service absence stderr");
  const expectedStderr = Buffer.from(
    `Bad request.\nCould not find service "${context.launchagent.label}" in domain for user gui: ${context.uid}\n`, "utf8",
  );
  if (canonicalJson(capture.command) !== canonicalJson(expectedCommand) || capture.exit_code !== 113 ||
      capture.signal !== null || stdout.byteLength !== 0 || !stderr.equals(expectedStderr) ||
      capture.parsed_service_absent !== true || finishedUtc < startedUtc || finishedMono < startedMono) {
    throw new Error("cleanup service absence semantics differ");
  }
  return Object.freeze({ value: capture, startedMono, finishedMono, startedUtc, finishedUtc });
}

function validateCleanupCommandBase(
  value: unknown,
  sequence: number,
  phase: CleanupCommand["phase"],
  expectedArgv: readonly string[],
  context: Halfkp81V1R11ProcessCleanupValidationContext,
): Readonly<{
  value: CleanupCommand;
  startedMono: bigint;
  finishedMono: bigint;
  startedUtc: number;
  finishedUtc: number;
}> {
  exactKeys(value, [
    "sequence", "phase", "argv", "target_pid", "target_pgid", "target_lstart",
    "started_at_utc", "finished_at_utc", "started_monotonic_ns", "finished_monotonic_ns",
    "exit_code", "signal", "disposition", "stdout", "stderr", "absence_probe",
  ], `cleanup ${phase} row`);
  const row = value as CleanupCommand;
  const startedUtc = parseUtc(row.started_at_utc, `cleanup ${phase} start`);
  const finishedUtc = parseUtc(row.finished_at_utc, `cleanup ${phase} finish`);
  const startedMono = parseMonotonic(row.started_monotonic_ns, `cleanup ${phase} start`);
  const finishedMono = parseMonotonic(row.finished_monotonic_ns, `cleanup ${phase} finish`);
  const target = context.runnerIdentity;
  if (row.sequence !== sequence || row.phase !== phase || canonicalJson(row.argv) !== canonicalJson(expectedArgv) ||
      row.target_pid !== (target?.pid ?? null) || row.target_pgid !== (target?.pgid ?? null) ||
      row.target_lstart !== (target?.lstart ?? null) || finishedUtc < startedUtc || finishedMono < startedMono) {
    throw new Error(`cleanup ${phase} row binding differs`);
  }
  if (row.disposition === "executed") {
    if (row.exit_code !== 0 || row.signal !== null || row.stdout === null || row.stderr === null) {
      throw new Error(`cleanup ${phase} executed transcript differs`);
    }
    validateRawTranscript(row.stdout, "text/plain-exact-command-stdout", `cleanup ${phase} stdout`);
    validateRawTranscript(row.stderr, "text/plain-exact-command-stderr", `cleanup ${phase} stderr`);
  } else if (
    row.exit_code !== null || row.signal !== null || row.stdout !== null || row.stderr !== null ||
    (phase === "TERM"
      ? row.disposition !== "not-required-after-held-post-bootout-absence-probe"
      : row.disposition !== "not-required-after-held-absence-probe")
  ) {
    throw new Error(`cleanup ${phase} not-required transcript differs`);
  }
  return Object.freeze({ value: row, startedMono, finishedMono, startedUtc, finishedUtc });
}

function assertOrdered(
  previous: Readonly<{finishedMono: bigint; finishedUtc: number}>,
  next: Readonly<{startedMono: bigint; startedUtc: number}>,
  label: string,
  strict = false,
): void {
  if ((strict ? next.startedMono <= previous.finishedMono : next.startedMono < previous.finishedMono) ||
      (strict ? next.startedUtc <= previous.finishedUtc : next.startedUtc < previous.finishedUtc)) {
    throw new Error(`${label} timeline differs`);
  }
}

function rowsUnion(
  left: readonly Readonly<ProcessRow>[],
  right: readonly Readonly<ProcessRow>[],
  includeReuse: boolean,
): readonly Readonly<ProcessRow>[] {
  const byIdentity = new Map<string, Readonly<ProcessRow>>();
  for (const row of [...left, ...right]) {
    if (!includeReuse && row.role === "pid-reuse-nontarget") continue;
    const key = `${row.pid}\0${row.pgid}\0${row.lstart}\0${row.executable}\0${row.role}`;
    byIdentity.set(key, row);
  }
  return processRowOrder([...byIdentity.values()]);
}

export function validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
  evidenceValue: unknown,
  context: Readonly<Halfkp81V1R11ProcessCleanupValidationContext>,
): Readonly<Halfkp81V1R11ProcessCleanupEvidence["process_cleanup"]> {
  exactKeys(evidenceValue, [
    "schema", "status", "scope", "teacher_plan", "source_revision", "run_fingerprint",
    "launchagent", "runner_identity", "pre_cleanup_ps", "pre_cleanup_process_rows",
    "ordered_cleanup_commands", "service_absence", "pid_reuse_rejection", "final_ps_first",
    "final_ps_second", "remaining_process_rows", "remaining_process_group_rows", "process_cleanup",
    "producer", "captured_at_utc", "authority",
  ], "cleanup evidence");
  const evidence = evidenceValue as Halfkp81V1R11ProcessCleanupEvidence;
  if (evidence.schema !== SCHEMA || evidence.status !== STATUS || evidence.scope !== context.scope ||
      evidence.source_revision !== context.sourceRevision || !REVISION_RE.test(evidence.source_revision) ||
      evidence.run_fingerprint !== context.runFingerprint || !SHA256_RE.test(evidence.run_fingerprint) ||
      canonicalJson(evidence.runner_identity) !== canonicalJson(context.runnerIdentity) ||
      canonicalJson(evidence.authority) !== canonicalJson(FALSE_AUTHORITY) ||
      (context.runnerIdentity === null && !context.runnerNullPhaseBeforeAnyAdmission) ||
      outputPath(context.scope, context.homeDirectory) !== context.expectedOutputPath) {
    throw new Error("cleanup evidence root binding differs");
  }
  validateFileIdentity(evidence.teacher_plan, context.teacherPlan, "cleanup teacher plan");
  exactKeys(evidence.launchagent, ["label", "plist_snapshot"], "cleanup launchagent");
  if (evidence.launchagent.label !== context.launchagent.label) throw new Error("cleanup launchagent label differs");
  validateFileIdentity(evidence.launchagent.plist_snapshot, context.launchagent.plistSnapshot, "cleanup plist snapshot");
  if (evidence.runner_identity !== null) {
    exactKeys(evidence.runner_identity, ["pid", "pgid", "lstart"], "cleanup runner identity");
    if (!Number.isSafeInteger(evidence.runner_identity.pid) || evidence.runner_identity.pid < 1 ||
        !Number.isSafeInteger(evidence.runner_identity.pgid) || evidence.runner_identity.pgid < 1 ||
        !LSTART_RE.test(evidence.runner_identity.lstart)) throw new Error("cleanup runner identity semantics differ");
  }
  const pre = validatePsCapture(
    evidence.pre_cleanup_ps, "text/plain-exact-pre-cleanup-ps-stdout",
    "text/plain-exact-pre-cleanup-ps-stderr", null, context, "cleanup pre ps",
  );
  if (canonicalJson(evidence.pre_cleanup_process_rows) !== canonicalJson(pre.rows)) {
    throw new Error("cleanup pre process rows differ");
  }
  if (context.runnerIdentity === null && pre.rows.length !== 0) {
    throw new Error("cleanup null runner has target rows");
  }
  if (!Array.isArray(evidence.ordered_cleanup_commands) || evidence.ordered_cleanup_commands.length !== 3) {
    throw new Error("cleanup command count differs");
  }
  const target = context.runnerIdentity;
  const bootoutArgv = ["/bin/launchctl", "bootout", `gui/${context.uid}/${context.launchagent.label}`];
  const termArgv = target === null
    ? ["/bin/kill", "-TERM", "--"]
    : ["/bin/kill", "-TERM", "--", `-${target.pgid}`];
  const killArgv = target === null
    ? ["/bin/kill", "-KILL", "--"]
    : ["/bin/kill", "-KILL", "--", `-${target.pgid}`];
  const bootout = validateCleanupCommandBase(evidence.ordered_cleanup_commands[0], 1, "bootout", bootoutArgv, context);
  if (bootout.value.disposition !== "executed") throw new Error("cleanup bootout disposition differs");
  const bootProbe = validatePsCapture(
    bootout.value.absence_probe, "text/plain-exact-final-ps-stdout", "text/plain-exact-final-ps-stderr",
    pre.rows, context, "cleanup bootout absence probe",
  );
  const term = validateCleanupCommandBase(evidence.ordered_cleanup_commands[1], 2, "TERM", termArgv, context);
  const termProbe = validatePsCapture(
    term.value.absence_probe, "text/plain-exact-final-ps-stdout", "text/plain-exact-final-ps-stderr",
    pre.rows, context, "cleanup TERM absence probe",
  );
  const kill = validateCleanupCommandBase(evidence.ordered_cleanup_commands[2], 3, "KILL", killArgv, context);
  const killProbe = validatePsCapture(
    kill.value.absence_probe, "text/plain-exact-final-ps-stdout", "text/plain-exact-final-ps-stderr",
    pre.rows, context, "cleanup KILL absence probe",
  );
  const termRequired = signalGroupSurvivors(bootProbe.rows, target).length > 0;
  const killRequired = signalGroupSurvivors(termProbe.rows, target).length > 0;
  if ((term.value.disposition === "executed") !== termRequired ||
      (kill.value.disposition === "executed") !== killRequired ||
      (termRequired && unsafeSameGroupReuse(bootProbe.rows, target)) ||
      (killRequired && unsafeSameGroupReuse(termProbe.rows, target)) ||
      exactSurvivors(killProbe.rows).length !== 0) {
    throw new Error("cleanup command branch decision differs");
  }
  const service = validateServiceAbsence(evidence.service_absence, context);
  const finalFirst = validatePsCapture(
    evidence.final_ps_first, "text/plain-exact-final-ps-stdout", "text/plain-exact-final-ps-stderr",
    pre.rows, context, "cleanup final ps first",
  );
  const finalSecond = validatePsCapture(
    evidence.final_ps_second, "text/plain-exact-final-ps-stdout", "text/plain-exact-final-ps-stderr",
    pre.rows, context, "cleanup final ps second",
  );
  assertOrdered(pre, bootout, "cleanup pre/bootout");
  assertOrdered(bootout, bootProbe, "cleanup bootout/probe");
  assertOrdered(bootProbe, term, "cleanup probe/TERM");
  assertOrdered(term, termProbe, "cleanup TERM/probe");
  assertOrdered(termProbe, kill, "cleanup probe/KILL");
  assertOrdered(kill, killProbe, "cleanup KILL/probe");
  assertOrdered(killProbe, service, "cleanup probe/service");
  assertOrdered(service, finalFirst, "cleanup service/final one");
  assertOrdered(finalFirst, finalSecond, "cleanup dual final ps", true);
  const gapNs = finalSecond.startedMono - finalFirst.finishedMono;
  if (gapNs < 1_000_000_000n || gapNs > 10_000_000_000n) throw new Error("cleanup dual final ps separation differs");
  const remaining = rowsUnion(finalFirst.rows, finalSecond.rows, false);
  if (canonicalJson(evidence.remaining_process_rows) !== canonicalJson(remaining)) {
    throw new Error("cleanup remaining process rows differ");
  }
  const groupMap = new Map<number, ProcessRow[]>();
  for (const row of remaining) {
    const rows = groupMap.get(row.pgid) ?? [];
    rows.push(row);
    groupMap.set(row.pgid, rows);
  }
  const groups = Object.freeze([...groupMap.entries()].sort(([a], [b]) => a - b).map(([pgid, rows]) =>
    Object.freeze({ pgid, member_identities: processRowOrder(rows) })));
  if (canonicalJson(evidence.remaining_process_group_rows) !== canonicalJson(groups)) {
    throw new Error("cleanup remaining process groups differ");
  }
  const allCaptures = [bootProbe, termProbe, killProbe, finalFirst, finalSecond];
  const reuseRows = rowsUnion(
    allCaptures.flatMap((capture) => capture.rows.filter((row) => row.role === "pid-reuse-nontarget")), [], true,
  );
  const checkedPids = Object.freeze([...new Set([
    ...pre.rows.map((row) => row.pid), ...(target === null ? [] : [target.pid]),
  ])].sort((a, b) => a - b));
  exactKeys(evidence.pid_reuse_rejection,
    ["identity_tuple_fields", "checked_pids", "rejected_reuse_rows", "all_reuse_rejected"],
    "cleanup PID reuse rejection");
  if (canonicalJson(evidence.pid_reuse_rejection.identity_tuple_fields) !== canonicalJson(["pid", "pgid", "lstart", "executable"]) ||
      canonicalJson(evidence.pid_reuse_rejection.checked_pids) !== canonicalJson(checkedPids) ||
      canonicalJson(evidence.pid_reuse_rejection.rejected_reuse_rows) !== canonicalJson(reuseRows) ||
      evidence.pid_reuse_rejection.all_reuse_rejected !== true) {
    throw new Error("cleanup PID reuse rejection differs");
  }
  const engines = pre.rows.filter((row) => row.role === "yaneuraou-engine");
  const remainingEnginePids = Object.freeze(remaining.filter((row) => row.role === "yaneuraou-engine").map((row) => row.pid).sort((a, b) => a - b));
  const summary = Object.freeze({
    scheduling_stopped: true as const,
    engines_terminated: engines.length,
    engines_reaped: engines.length,
    remaining_engine_pids: remainingEnginePids,
  });
  exactKeys(evidence.process_cleanup,
    ["scheduling_stopped", "engines_terminated", "engines_reaped", "remaining_engine_pids"],
    "cleanup summary");
  if (remaining.length !== 0 || groups.length !== 0 || remainingEnginePids.length !== 0 ||
      canonicalJson(evidence.process_cleanup) !== canonicalJson(summary)) {
    throw new Error("cleanup summary differs");
  }
  validateProducer(evidence.producer, context.producer, evidence.source_revision);
  const capturedAt = parseUtc(evidence.captured_at_utc, "cleanup captured at");
  if (capturedAt < finalSecond.finishedUtc) throw new Error("cleanup capture timestamp precedes final ps");
  return summary;
}

function validateInput(input: Halfkp81V1R11ProcessCleanupInput): Readonly<{
  output: string;
  plistProgramArguments: readonly string[];
}> {
  if ((input.scope !== "preformal" && input.scope !== "post-formal-environment") ||
      !REVISION_RE.test(input.sourceRevision) || !SHA256_RE.test(input.runFingerprint) ||
      !Number.isSafeInteger(input.uid) || input.uid < 1 || !path.isAbsolute(input.homeDirectory) ||
      path.normalize(input.homeDirectory) !== input.homeDirectory || !path.isAbsolute(input.repositoryRoot) ||
      path.normalize(input.repositoryRoot) !== input.repositoryRoot || input.launchagent.label.length < 1 ||
      (input.runnerIdentity === null && !input.runnerNullPhaseBeforeAnyAdmission) ||
      (input.runnerIdentity !== null && input.runnerNullPhaseBeforeAnyAdmission)) {
    throw new Error("cleanup producer input differs");
  }
  validateFileIdentity(input.teacherPlan, input.teacherPlan, "cleanup input teacher plan");
  validateFileIdentity(input.launchagent.plistSnapshot, input.launchagent.plistSnapshot, "cleanup input plist");
  readHeldIdentity(input.teacherPlan, "cleanup teacher plan");
  const plistRaw = readHeldIdentity(input.launchagent.plistSnapshot, "cleanup LaunchAgent plist");
  const plistProgramArguments = parsePlistProgramArguments(plistRaw);
  return Object.freeze({ output: outputPath(input.scope, input.homeDirectory), plistProgramArguments });
}

function defaultDependencies(): Readonly<Halfkp81V1R11ProcessCleanupDependencies> {
  return Object.freeze({
    run(argv: readonly string[]) {
      const result = spawnSync(argv[0]!, argv.slice(1), {
        encoding: null,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, LC_ALL: "C", LANG: "C" },
        maxBuffer: 64 * 1024 * 1024,
      });
      if (result.error !== undefined || result.status === null ||
          !Buffer.isBuffer(result.stdout) || !Buffer.isBuffer(result.stderr)) {
        throw result.error ?? new Error(`cleanup command ${argv[0]} did not exit normally`);
      }
      return Object.freeze({
        exitCode: result.status,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    },
    nowMs: Date.now,
    monotonicNs: process.hrtime.bigint,
    wait: (milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  });
}

function appendCommandProbe(
  base: Omit<CleanupCommand, "absence_probe">,
  absenceProbe: Readonly<PsCapture>,
): Readonly<CleanupCommand> {
  return Object.freeze({ ...base, absence_probe: absenceProbe });
}

function allReuseRows(captures: readonly Readonly<PsCapture>[]): readonly Readonly<ProcessRow>[] {
  return rowsUnion(
    captures.flatMap((capture) => capture.parsed_process_rows.filter((row) => row.role === "pid-reuse-nontarget")),
    [], true,
  );
}

async function produceCore(
  input: Readonly<Halfkp81V1R11ProcessCleanupInput>,
  dependencies: Readonly<Halfkp81V1R11ProcessCleanupDependencies>,
): Promise<Readonly<{
  identity: Readonly<Halfkp81V1R11CleanupFileIdentity>;
  evidence: Readonly<Halfkp81V1R11ProcessCleanupEvidence>;
  recomputedProcessCleanup: Readonly<Halfkp81V1R11ProcessCleanupEvidence["process_cleanup"]>;
  validationContext: Readonly<Halfkp81V1R11ProcessCleanupValidationContext>;
}>> {
  const validated = validateInput(input);
  try {
    fs.lstatSync(validated.output);
    throw new Error("cleanup evidence create-only target already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const captureContext = Object.freeze({
    runner: input.runnerIdentity,
    plistProgramArguments: validated.plistProgramArguments,
    fixedRoles: input.fixedRoles,
    allowAbsentRunner: input.scope === "post-formal-environment",
    allowStageBWrapper: input.scope === "preformal",
  });
  const pre = capturePs(
    dependencies, "text/plain-exact-pre-cleanup-ps-stdout",
    "text/plain-exact-pre-cleanup-ps-stderr", null, captureContext,
  );
  const target = input.runnerIdentity;
  const bootoutArgv = Object.freeze(["/bin/launchctl", "bootout", `gui/${input.uid}/${input.launchagent.label}`]);
  const bootoutBase = captureExecuted(dependencies, 1, "bootout", bootoutArgv, target);
  const bootProbe = capturePs(
    dependencies, "text/plain-exact-final-ps-stdout", "text/plain-exact-final-ps-stderr",
    pre.parsed_process_rows, captureContext,
  );
  const bootout = appendCommandProbe(bootoutBase, bootProbe);
  const termArgv = Object.freeze(target === null
    ? ["/bin/kill", "-TERM", "--"]
    : ["/bin/kill", "-TERM", "--", `-${target.pgid}`]);
  const termRequired = signalGroupSurvivors(bootProbe.parsed_process_rows, target).length > 0;
  if (termRequired && unsafeSameGroupReuse(bootProbe.parsed_process_rows, target)) {
    throw new Error("cleanup TERM would signal a PID-reuse non-target");
  }
  const termBase = termRequired
    ? captureExecuted(dependencies, 2, "TERM", termArgv, target)
    : captureNotRequired(
        dependencies, 2, "TERM", termArgv, target,
        "not-required-after-held-post-bootout-absence-probe",
      );
  if (termRequired) await dependencies.wait(1_000);
  const termProbe = capturePs(
    dependencies, "text/plain-exact-final-ps-stdout", "text/plain-exact-final-ps-stderr",
    pre.parsed_process_rows, captureContext,
  );
  const term = appendCommandProbe(termBase, termProbe);
  const killArgv = Object.freeze(target === null
    ? ["/bin/kill", "-KILL", "--"]
    : ["/bin/kill", "-KILL", "--", `-${target.pgid}`]);
  const killRequired = signalGroupSurvivors(termProbe.parsed_process_rows, target).length > 0;
  if (killRequired && unsafeSameGroupReuse(termProbe.parsed_process_rows, target)) {
    throw new Error("cleanup KILL would signal a PID-reuse non-target");
  }
  const killBase = killRequired
    ? captureExecuted(dependencies, 3, "KILL", killArgv, target)
    : captureNotRequired(
        dependencies, 3, "KILL", killArgv, target,
        "not-required-after-held-absence-probe",
      );
  const killProbe = capturePs(
    dependencies, "text/plain-exact-final-ps-stdout", "text/plain-exact-final-ps-stderr",
    pre.parsed_process_rows, captureContext,
  );
  const kill = appendCommandProbe(killBase, killProbe);
  if (exactSurvivors(killProbe.parsed_process_rows).length !== 0) {
    throw new Error("cleanup KILL probe retains a target");
  }
  const service = serviceAbsence(dependencies, input.uid, input.launchagent.label);
  const finalFirst = capturePs(
    dependencies, "text/plain-exact-final-ps-stdout", "text/plain-exact-final-ps-stderr",
    pre.parsed_process_rows, captureContext,
  );
  await dependencies.wait(1_000);
  const finalSecond = capturePs(
    dependencies, "text/plain-exact-final-ps-stdout", "text/plain-exact-final-ps-stderr",
    pre.parsed_process_rows, captureContext,
  );
  const remaining = rowsUnion(finalFirst.parsed_process_rows, finalSecond.parsed_process_rows, false);
  const groups = Object.freeze([]) as readonly Readonly<{pgid: number; member_identities: readonly Readonly<ProcessRow>[]}>[];
  const engines = pre.parsed_process_rows.filter((row) => row.role === "yaneuraou-engine");
  const processCleanup = Object.freeze({
    scheduling_stopped: true as const,
    engines_terminated: engines.length,
    engines_reaped: engines.length,
    remaining_engine_pids: Object.freeze(
      remaining.filter((row) => row.role === "yaneuraou-engine").map((row) => row.pid).sort((a, b) => a - b),
    ),
  });
  if (remaining.length !== 0 || processCleanup.remaining_engine_pids.length !== 0) {
    throw new Error("cleanup dual final ps retains a target");
  }
  const captured = tick(dependencies);
  const checkedPids = Object.freeze([...new Set([
    ...pre.parsed_process_rows.map((row) => row.pid), ...(target === null ? [] : [target.pid]),
  ])].sort((a, b) => a - b));
  const evidence = Object.freeze({
    schema: SCHEMA, status: STATUS, scope: input.scope,
    teacher_plan: input.teacherPlan, source_revision: input.sourceRevision,
    run_fingerprint: input.runFingerprint,
    launchagent: Object.freeze({ label: input.launchagent.label, plist_snapshot: input.launchagent.plistSnapshot }),
    runner_identity: input.runnerIdentity,
    pre_cleanup_ps: pre, pre_cleanup_process_rows: pre.parsed_process_rows,
    ordered_cleanup_commands: Object.freeze([bootout, term, kill]),
    service_absence: service,
    pid_reuse_rejection: Object.freeze({
      identity_tuple_fields: Object.freeze(["pid", "pgid", "lstart", "executable"] as const),
      checked_pids: checkedPids,
      rejected_reuse_rows: allReuseRows([bootProbe, termProbe, killProbe, finalFirst, finalSecond]),
      all_reuse_rejected: true as const,
    }),
    final_ps_first: finalFirst, final_ps_second: finalSecond,
    remaining_process_rows: remaining, remaining_process_group_rows: groups,
    process_cleanup: processCleanup, producer: input.producer,
    captured_at_utc: captured.utc, authority: FALSE_AUTHORITY,
  }) satisfies Halfkp81V1R11ProcessCleanupEvidence;
  const validationContext = Object.freeze({
    ...input,
    expectedOutputPath: validated.output,
    plistProgramArguments: validated.plistProgramArguments,
  });
  const recomputed = validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(evidence, validationContext);
  const identity = publishCreateOnly(validated.output, evidence);
  return Object.freeze({
    identity,
    evidence,
    recomputedProcessCleanup: recomputed,
    validationContext,
  });
}

/** Test-only OS seam. Production callers cannot inject command results or clocks. */
export async function produceHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
  input: Readonly<Halfkp81V1R11ProcessCleanupInput>,
  dependencies: Readonly<Halfkp81V1R11ProcessCleanupDependencies>,
) {
  return produceCore(input, dependencies);
}

function productionProducer(repositoryRoot: string, sourceRevision: string): Readonly<Halfkp81V1R11CleanupProducer> {
  const git = (args: readonly string[]) => execFileSync("/usr/bin/git", args, {
    cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
  if (git(["branch", "--show-current"]) !== "main" || git(["rev-parse", "HEAD"]) !== sourceRevision ||
      git(["rev-parse", "main"]) !== sourceRevision || git(["status", "--porcelain"]) !== "") {
    throw new Error("cleanup production requires clean merged main source");
  }
  return buildHalfkp81V1R11RecursiveProducerIdentity(
    repositoryRoot,
    sourceRevision,
    ENTRYPOINT,
  ) as Readonly<Halfkp81V1R11CleanupProducer>;
}

export async function produceHalfkp81Depth18V1R11ProcessCleanupEvidence(
  input: Readonly<Omit<Halfkp81V1R11ProcessCleanupInput,
    "homeDirectory" | "repositoryRoot" | "uid" | "producer">>,
) {
  const repositoryRoot = fs.realpathSync.native(path.resolve(__dirname, ".."));
  const homeDirectory = fs.realpathSync.native(os.homedir());
  const uid = process.geteuid?.();
  if (!Number.isSafeInteger(uid) || Number(uid) < 1) throw new Error("cleanup production euid differs");
  return produceCore(Object.freeze({
    ...input,
    homeDirectory, repositoryRoot, uid: Number(uid),
    producer: productionProducer(repositoryRoot, input.sourceRevision),
  }), defaultDependencies());
}
