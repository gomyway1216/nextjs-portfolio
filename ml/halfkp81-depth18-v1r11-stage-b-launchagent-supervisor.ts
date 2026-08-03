import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { v1r11CanonicalJson } from "./halfkp81-depth18-v1r11-authority-io";

const LAUNCHCTL = "/bin/launchctl" as const;
const CAFFEINATE = "/usr/bin/caffeinate" as const;
const ABSENT_SERVICE_STATUS = 113 as const;
const PRIVATE_FILE_MODE = 0o600 as const;
const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9.-]{2,127}$/u;
const START_TOKEN_RE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4}$/u;

export interface Halfkp81V1R11StageBProcessRow {
  readonly pid: number;
  readonly ppid: number;
  readonly pgid: number;
  readonly start_token: string;
  readonly state: string;
  readonly command: string;
}

export interface Halfkp81V1R11StageBLaunchctlResult {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly error?: Error;
}

export interface Halfkp81V1R11StageBLaunchctlSnapshot {
  readonly loaded: boolean;
  readonly state: "absent" | "running" | "exited";
  readonly pid: number | null;
  readonly last_exit_code: number | null;
  readonly raw_stdout: Buffer;
  readonly raw_stderr: Buffer;
}

export interface Halfkp81V1R11StageBLaunchAgentSupervisorDependencies {
  readonly launchctl: (
    arguments_: readonly string[],
  ) => Halfkp81V1R11StageBLaunchctlResult;
  readonly ps: () => Buffer;
  readonly signalProcessGroup: (
    pgid: number,
    signal: "SIGTERM" | "SIGKILL",
  ) => "sent" | "esrch";
  readonly wait: (milliseconds: number) => Promise<void>;
  readonly now: () => number;
}

export interface Halfkp81V1R11StageBLaunchAgentSupervisorSpec {
  readonly label: string;
  readonly uid: number;
  readonly workingDirectory: string;
  readonly plistPath: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly utilityArgv: readonly string[];
  readonly pollIntervalMs: number;
  readonly timeoutMs: number;
  readonly abortIfPathExists?: string;
}

export interface Halfkp81V1R11StageBParentJobEvidence {
  readonly schema: "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-parent-job-evidence-v1";
  readonly status:
    | "runner-exited-and-job-process-group-reaped"
    | "runner-faulted-and-job-process-group-reaped";
  readonly label: string;
  readonly uid: number;
  readonly launchctl_domain: string;
  readonly plist_source: Readonly<Halfkp81V1R11StageBFileIdentity>;
  readonly stdout_path: string;
  readonly stderr_path: string;
  readonly program_arguments: readonly string[];
  readonly runner_pid: number;
  readonly runner_pgid: number;
  readonly runner_start_token: string;
  readonly assertion_holder_pid: number;
  readonly assertion_holder_start_token: string;
  readonly running_observations: readonly Readonly<{
    readonly observation_sequence: number;
    readonly observed_at_ms: number;
    readonly observed_at_utc: string;
    readonly launchctl_stdout: Readonly<Halfkp81V1R11StageBRawIdentity>;
    readonly launchctl_stderr: Readonly<Halfkp81V1R11StageBRawIdentity>;
    readonly ps_stdout: Readonly<Halfkp81V1R11StageBRawIdentity>;
    readonly runner: Readonly<Halfkp81V1R11StageBProcessRow>;
    readonly assertion_holder: Readonly<Halfkp81V1R11StageBProcessRow>;
    readonly observed_engine_rows: readonly Readonly<Halfkp81V1R11StageBProcessRow>[];
    readonly observed_auxiliary_rows: readonly Readonly<Halfkp81V1R11StageBProcessRow>[];
  }>[];
  readonly observed_engine_rows: readonly Readonly<Halfkp81V1R11StageBProcessRow>[];
  readonly observed_auxiliary_rows: readonly Readonly<Halfkp81V1R11StageBProcessRow>[];
  readonly runner_exit_code: number | null;
  readonly runner_exit_signal: NodeJS.Signals | null;
  readonly termination_actions: readonly Readonly<Record<string, unknown>>[];
  readonly final_ps_first: Readonly<Halfkp81V1R11StageBRawIdentity>;
  readonly final_ps_second: Readonly<Halfkp81V1R11StageBRawIdentity>;
  readonly remaining_process_group_pids: readonly number[];
  readonly remaining_descendant_pids: readonly number[];
}

export interface Halfkp81V1R11StageBFileIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly dev: number;
  readonly ino: number;
  readonly uid: number;
  readonly mode: number;
  readonly nlink: 1;
}

export interface Halfkp81V1R11StageBRawIdentity {
  readonly bytes: number;
  readonly sha256: string;
  readonly base64: string;
}

export function buildHalfkp81V1R11ExactPowerGuardianCommand(
  nodePath: string,
  repositoryRoot: string,
): string {
  exactAbsolute(nodePath, "Stage B guardian node path");
  exactAbsolute(repositoryRoot, "Stage B guardian repository root");
  return [
    nodePath,
    "-r",
    path.join(repositoryRoot, "node_modules/tsx/dist/cjs/index.cjs"),
    path.join(
      repositoryRoot,
      "ml/halfkp81-depth18-power-continuity-guardian.ts",
    ),
  ].join(" ");
}

export interface Halfkp81V1R11StageBParentEnvelope {
  readonly schema: "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-parent-envelope-v1";
  readonly status: "fixed-child-output-authenticated-after-job-reap";
  readonly runtime_stdout_base64: string;
  readonly runtime_stdout_bytes: number;
  readonly runtime_stdout_sha256: string;
  readonly runtime_stderr_base64: string;
  readonly runtime_stderr_bytes: number;
  readonly runtime_stderr_sha256: string;
  readonly parsed_inner_canonical_json: Readonly<Record<string, unknown>>;
  readonly parent_job_evidence: Readonly<Halfkp81V1R11StageBParentJobEvidence>;
}

export class Halfkp81V1R11StageBLaunchAgentSupervisorError extends Error {
  readonly cleanupEvidence: Readonly<Halfkp81V1R11StageBParentJobEvidence> | null;
  readonly activeBinding: Readonly<{
    label: string;
    plistSource: Readonly<Halfkp81V1R11StageBFileIdentity>;
    runnerIdentity: Readonly<{ pid: number; pgid: number; lstart: string }>;
  }> | null;

  constructor(
    message: string,
    cleanupEvidence: Readonly<Halfkp81V1R11StageBParentJobEvidence> | null = null,
    activeBinding: Halfkp81V1R11StageBLaunchAgentSupervisorError["activeBinding"] = null,
  ) {
    super(message);
    this.name = "Halfkp81V1R11StageBLaunchAgentSupervisorError";
    this.cleanupEvidence = cleanupEvidence;
    this.activeBinding = activeBinding;
  }
}

function sha256(raw: Uint8Array): string {
  return createHash("sha256").update(raw).digest("hex");
}

function fail(message: string): never {
  throw new Halfkp81V1R11StageBLaunchAgentSupervisorError(message);
}

function exactAbsolute(value: string, label: string): string {
  if (
    !path.isAbsolute(value) ||
    path.normalize(value) !== value ||
    value.includes("\0") ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    fail(`${label} must be a normalized absolute path`);
  }
  return value;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function plistString(value: string): string {
  return `    <string>${xmlEscape(value)}</string>`;
}

export function buildHalfkp81V1R11StageBOneShotPlist(
  spec: Readonly<{
    label: string;
    workingDirectory: string;
    stdoutPath: string;
    stderrPath: string;
    utilityArgv: readonly string[];
  }>,
): Buffer {
  if (
    !LABEL_RE.test(spec.label) ||
    spec.utilityArgv.length < 1 ||
    spec.utilityArgv.some(
      (entry) =>
        typeof entry !== "string" ||
        entry.length < 1 ||
        entry.includes("\0") ||
        entry.includes("\n") ||
        entry.includes("\r"),
    )
  ) {
    fail("Stage B one-shot plist inputs differ");
  }
  const arguments_ = [CAFFEINATE, "-dimsu", ...spec.utilityArgv];
  return Buffer.from(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict>",
      "  <key>Label</key>",
      plistString(spec.label),
      "  <key>ProgramArguments</key>",
      "  <array>",
      ...arguments_.map(plistString),
      "  </array>",
      "  <key>WorkingDirectory</key>",
      plistString(spec.workingDirectory),
      "  <key>StandardOutPath</key>",
      plistString(spec.stdoutPath),
      "  <key>StandardErrorPath</key>",
      plistString(spec.stderrPath),
      "  <key>RunAtLoad</key>",
      "  <false/>",
      "  <key>KeepAlive</key>",
      "  <false/>",
      "  <key>LaunchOnlyOnce</key>",
      "  <true/>",
      "  <key>Umask</key>",
      "  <integer>63</integer>",
      "  <key>AbandonProcessGroup</key>",
      "  <false/>",
      "</dict>",
      "</plist>",
      "",
    ].join("\n"),
    "utf8",
  );
}

function launchctlResult(
  dependencies: Readonly<Halfkp81V1R11StageBLaunchAgentSupervisorDependencies>,
  arguments_: readonly string[],
): Readonly<Halfkp81V1R11StageBLaunchctlResult> {
  const result = dependencies.launchctl(Object.freeze([...arguments_]));
  if (
    result.error !== undefined ||
    result.status === null ||
    result.signal !== null ||
    !Buffer.isBuffer(result.stdout) ||
    !Buffer.isBuffer(result.stderr)
  ) {
    fail(`launchctl ${arguments_[0] ?? "command"} did not exit normally`);
  }
  return result;
}

function absent(result: Readonly<Halfkp81V1R11StageBLaunchctlResult>): boolean {
  return (
    result.status === ABSENT_SERVICE_STATUS &&
    /Could not find service/u.test(
      `${result.stdout.toString("utf8")}\n${result.stderr.toString("utf8")}`,
    )
  );
}

export function parseHalfkp81V1R11StageBLaunchctlPrintForTests(
  result: Readonly<Halfkp81V1R11StageBLaunchctlResult>,
  label: string,
  uid: number,
): Readonly<Halfkp81V1R11StageBLaunchctlSnapshot> {
  if (absent(result)) {
    return Object.freeze({
      loaded: false,
      state: "absent" as const,
      pid: null,
      last_exit_code: null,
      raw_stdout: result.stdout,
      raw_stderr: result.stderr,
    });
  }
  if (result.status !== 0 || result.stderr.byteLength !== 0) {
    fail("Stage B launchctl print result differs");
  }
  const text = result.stdout.toString("utf8");
  if (
    !Buffer.from(text, "utf8").equals(result.stdout) ||
    !text.startsWith(`gui/${uid}/${label} = {\n`) ||
    !text.endsWith("}\n") ||
    !text.includes("\ttype = LaunchAgent\n")
  ) {
    fail("Stage B launchctl print syntax differs");
  }
  const stateMatches = [...text.matchAll(/^\tstate = (running|exited)$/gmu)];
  const pidMatches = [...text.matchAll(/^\tpid = (\d+)$/gmu)];
  const exitMatches = [...text.matchAll(/^\tlast exit code = (-?\d+)$/gmu)];
  if (
    stateMatches.length !== 1 ||
    pidMatches.length > 1 ||
    exitMatches.length > 1
  ) {
    fail("Stage B launchctl process fields differ");
  }
  const state = stateMatches[0]![1] as "running" | "exited";
  const pid = pidMatches.length === 0 ? null : Number(pidMatches[0]![1]);
  const exitCode =
    exitMatches.length === 0 ? null : Number(exitMatches[0]![1]);
  if (
    (state === "running" &&
      (!Number.isSafeInteger(pid) || Number(pid) < 1 || exitCode !== null)) ||
    (state === "exited" &&
      (pid !== null || !Number.isSafeInteger(exitCode) || exitCode === null))
  ) {
    fail("Stage B launchctl state semantics differ");
  }
  return Object.freeze({
    loaded: true,
    state,
    pid,
    last_exit_code: exitCode,
    raw_stdout: result.stdout,
    raw_stderr: result.stderr,
  });
}

function printService(
  spec: Readonly<Halfkp81V1R11StageBLaunchAgentSupervisorSpec>,
  dependencies: Readonly<Halfkp81V1R11StageBLaunchAgentSupervisorDependencies>,
): Readonly<Halfkp81V1R11StageBLaunchctlSnapshot> {
  return parseHalfkp81V1R11StageBLaunchctlPrintForTests(
    launchctlResult(dependencies, [
      "print",
      `gui/${spec.uid}/${spec.label}`,
    ]),
    spec.label,
    spec.uid,
  );
}

export function parseHalfkp81V1R11StageBPsForTests(
  raw: Buffer,
): readonly Readonly<Halfkp81V1R11StageBProcessRow>[] {
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw)) {
    fail("Stage B ps snapshot is not exact UTF-8");
  }
  return Object.freeze(
    text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+[ \d]\d\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s+(.+)$/u.exec(
          line,
        );
        if (match === null) fail("Stage B ps row differs");
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
          !START_TOKEN_RE.test(row.start_token) ||
          row.state.length < 1 ||
          row.command.length < 1
        ) {
          fail("Stage B ps row semantics differ");
        }
        return row;
      }),
  );
}

function descendants(
  rows: readonly Readonly<Halfkp81V1R11StageBProcessRow>[],
  runnerPid: number,
): readonly Readonly<Halfkp81V1R11StageBProcessRow>[] {
  const pids = new Set([runnerPid]);
  const result: Halfkp81V1R11StageBProcessRow[] = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (const row of rows) {
      if (pids.has(row.ppid) && !pids.has(row.pid)) {
        pids.add(row.pid);
        result.push(row);
        progress = true;
      }
    }
  }
  return Object.freeze(result);
}

function rawIdentity(raw: Buffer): Readonly<Halfkp81V1R11StageBRawIdentity> {
  return Object.freeze({
    bytes: raw.byteLength,
    sha256: sha256(raw),
    base64: raw.toString("base64"),
  });
}

function writeExclusive(pathname: string, raw: Buffer): void {
  const descriptor = fs.openSync(
    pathname,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      (fs.constants.O_NOFOLLOW ?? 0),
    PRIVATE_FILE_MODE,
  );
  try {
    fs.writeFileSync(descriptor, raw);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function heldRead(pathname: string, maximumBytes: number): Buffer {
  const linkedBefore = fs.lstatSync(pathname);
  const descriptor = fs.openSync(
    pathname,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = fs.fstatSync(descriptor);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.dev !== linkedBefore.dev ||
      before.ino !== linkedBefore.ino ||
      before.size > maximumBytes
    ) {
      fail("Stage B private transcript filesystem identity differs");
    }
    const read = (): Buffer => {
      const raw = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < raw.byteLength) {
        const size = fs.readSync(
          descriptor,
          raw,
          offset,
          raw.byteLength - offset,
          offset,
        );
        if (size < 1) fail("Stage B private transcript read stalled");
        offset += size;
      }
      return raw;
    };
    const first = read();
    const middle = fs.fstatSync(descriptor);
    const second = read();
    const after = fs.fstatSync(descriptor);
    const linkedAfter = fs.lstatSync(pathname);
    if (
      before.dev !== middle.dev ||
      before.ino !== middle.ino ||
      before.size !== middle.size ||
      before.mtimeMs !== middle.mtimeMs ||
      before.ctimeMs !== middle.ctimeMs ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      linkedAfter.dev !== before.dev ||
      linkedAfter.ino !== before.ino ||
      !first.equals(second)
    ) {
      fail("Stage B private transcript changed during held read");
    }
    return first;
  } finally {
    fs.closeSync(descriptor);
  }
}

function fileIdentity(pathname: string, raw: Buffer): Readonly<Halfkp81V1R11StageBFileIdentity> {
  const metadata = fs.lstatSync(pathname);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    metadata.size !== raw.byteLength ||
    (metadata.mode & 0o7777) !== PRIVATE_FILE_MODE
  ) {
    fail("Stage B private plist identity differs");
  }
  return Object.freeze({
    path: pathname,
    bytes: raw.byteLength,
    sha256: sha256(raw),
    dev: metadata.dev,
    ino: metadata.ino,
    uid: metadata.uid,
    mode: metadata.mode & 0o7777,
    nlink: 1 as const,
  });
}

function defaultDependencies(): Readonly<Halfkp81V1R11StageBLaunchAgentSupervisorDependencies> {
  return Object.freeze({
    launchctl(arguments_) {
      const result = spawnSync(LAUNCHCTL, [...arguments_], {
        encoding: null,
        shell: false,
      });
      return Object.freeze({
        status: result.status,
        signal: result.signal,
        stdout: result.stdout ?? Buffer.alloc(0),
        stderr: result.stderr ?? Buffer.alloc(0),
        error: result.error,
      });
    },
    ps() {
      const result = spawnSync(
        "/bin/ps",
        ["-axo", "pid=,ppid=,pgid=,lstart=,state=,command="],
        { encoding: null, shell: false },
      );
      if (
        result.error !== undefined ||
        result.status !== 0 ||
        result.signal !== null ||
        !Buffer.isBuffer(result.stdout) ||
        !Buffer.isBuffer(result.stderr) ||
        result.stderr.byteLength !== 0
      ) {
        fail("Stage B ps command differs");
      }
      return result.stdout;
    },
    signalProcessGroup(pgid, signal) {
      try {
        process.kill(-pgid, signal);
        return "sent" as const;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") {
          return "esrch" as const;
        }
        throw error;
      }
    },
    wait(milliseconds) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    },
    now: () => Date.now(),
  });
}

function validatedSpec(
  spec: Readonly<Halfkp81V1R11StageBLaunchAgentSupervisorSpec>,
): Readonly<Halfkp81V1R11StageBLaunchAgentSupervisorSpec> {
  if (
    !LABEL_RE.test(spec.label) ||
    !Number.isSafeInteger(spec.uid) ||
    spec.uid < 1 ||
    !Number.isSafeInteger(spec.pollIntervalMs) ||
    spec.pollIntervalMs < 10 ||
    spec.pollIntervalMs > 30_000 ||
    !Number.isSafeInteger(spec.timeoutMs) ||
    spec.timeoutMs <= spec.pollIntervalMs ||
    spec.utilityArgv.length < 1
  ) {
    fail("Stage B parent supervisor spec differs");
  }
  for (const [label, value] of Object.entries({
    workingDirectory: spec.workingDirectory,
    plistPath: spec.plistPath,
    stdoutPath: spec.stdoutPath,
    stderrPath: spec.stderrPath,
    ...(spec.abortIfPathExists === undefined
      ? {}
      : { abortIfPathExists: spec.abortIfPathExists }),
  })) {
    exactAbsolute(value, label);
  }
  const paths = [spec.plistPath, spec.stdoutPath, spec.stderrPath];
  if (new Set(paths).size !== paths.length) {
    fail("Stage B parent supervisor output paths collide");
  }
  const working = fs.lstatSync(spec.workingDirectory);
  if (
    !working.isDirectory() ||
    working.isSymbolicLink() ||
    fs.realpathSync.native(spec.workingDirectory) !== spec.workingDirectory
  ) {
    fail("Stage B parent supervisor working directory differs");
  }
  for (const pathname of paths) {
    try {
      fs.lstatSync(pathname);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    fail("Stage B parent supervisor target must be absent");
  }
  return spec;
}

function exactRunnerTopology(
  rows: readonly Readonly<Halfkp81V1R11StageBProcessRow>[],
  runnerPid: number,
  programArguments: readonly string[],
  expectedGuardianCommand: string,
): Readonly<{
  runner: Readonly<Halfkp81V1R11StageBProcessRow>;
  holder: Readonly<Halfkp81V1R11StageBProcessRow>;
  engines: readonly Readonly<Halfkp81V1R11StageBProcessRow>[];
  auxiliaries: readonly Readonly<Halfkp81V1R11StageBProcessRow>[];
}> {
  const matches = rows.filter((row) => row.pid === runnerPid);
  if (matches.length !== 1 || matches[0]!.pgid !== runnerPid) {
    fail("Stage B runner is not the authenticated process-group leader");
  }
  const runner = matches[0]!;
  const expectedHolderCommand = `${CAFFEINATE} -dimsu ${runner.command}`;
  const childRows = descendants(rows, runner.pid);
  const holders = childRows.filter(
    (row) =>
      row.ppid === runner.pid &&
      row.pgid === runner.pgid &&
      row.command === expectedHolderCommand,
  );
  if (holders.length !== 1) {
    fail("Stage B direct-child caffeinate holder differs");
  }
  const holder = holders[0]!;
  const descendantsWithoutHolder = childRows.filter(
    (row) => row.pid !== holder.pid,
  );
  const engines = descendantsWithoutHolder.filter((row) =>
    /\/YaneuraOu-authenticated-snapshot(?:\s|$)/u.test(row.command),
  );
  const auxiliaries = descendantsWithoutHolder.filter(
    (row) => !engines.includes(row),
  );
  if (
    engines.some(
      (row) => row.pgid !== runner.pgid || row.ppid === holder.pid,
    ) ||
    auxiliaries.length > 1 ||
    auxiliaries.some(
      (row) =>
        row.pgid !== runner.pgid ||
        row.ppid !== runner.pid ||
        row.command !== expectedGuardianCommand,
    ) ||
    programArguments[0] !== CAFFEINATE ||
    programArguments[1] !== "-dimsu"
  ) {
    fail("Stage B job process-group lineage differs");
  }
  return Object.freeze({
    runner,
    holder,
    engines: Object.freeze(engines),
    auxiliaries: Object.freeze(auxiliaries),
  });
}

function mergeObservedRows(
  target: Map<number, Readonly<Halfkp81V1R11StageBProcessRow>>,
  rows: readonly Readonly<Halfkp81V1R11StageBProcessRow>[],
): void {
  for (const row of rows) {
    const previous = target.get(row.pid);
    if (
      previous !== undefined &&
      (previous.start_token !== row.start_token ||
        previous.ppid !== row.ppid ||
        previous.pgid !== row.pgid ||
        previous.command !== row.command)
    ) {
      fail(`Stage B observed PID ${row.pid} identity changed`);
    }
    target.set(row.pid, row);
  }
}

/**
 * The only production seam is OS observation. Tests inject launchctl/ps/signal
 * transcripts; production uses the fixed absolute commands above. No engine is
 * started by importing this module.
 */
export async function superviseHalfkp81V1R11StageBLaunchAgent(
  input: Readonly<Halfkp81V1R11StageBLaunchAgentSupervisorSpec>,
  injected?: Readonly<Halfkp81V1R11StageBLaunchAgentSupervisorDependencies>,
): Promise<Readonly<Halfkp81V1R11StageBParentEnvelope>> {
  const spec = validatedSpec(input);
  const dependencies = injected ?? defaultDependencies();
  const domain = `gui/${spec.uid}`;
  const service = `${domain}/${spec.label}`;
  const programArguments = Object.freeze([
    CAFFEINATE,
    "-dimsu",
    ...spec.utilityArgv,
  ]);
  const expectedGuardianCommand =
    buildHalfkp81V1R11ExactPowerGuardianCommand(
      spec.utilityArgv[0]!,
      spec.workingDirectory,
    );
  const plist = buildHalfkp81V1R11StageBOneShotPlist(spec);
  writeExclusive(spec.plistPath, plist);
  writeExclusive(spec.stdoutPath, Buffer.alloc(0));
  writeExclusive(spec.stderrPath, Buffer.alloc(0));
  const plistSource = fileIdentity(spec.plistPath, plist);

  if (printService(spec, dependencies).loaded) {
    fail("Stage B one-shot label was already loaded");
  }
  const bootstrap = launchctlResult(dependencies, [
    "bootstrap",
    domain,
    spec.plistPath,
  ]);
  if (bootstrap.status !== 0 || bootstrap.stderr.byteLength !== 0) {
    fail("Stage B launchctl bootstrap failed");
  }
  const kickstart = launchctlResult(dependencies, ["kickstart", service]);
  if (kickstart.status !== 0 || kickstart.stderr.byteLength !== 0) {
    fail("Stage B launchctl kickstart failed");
  }

  const startedAt = dependencies.now();
  let runner: Readonly<Halfkp81V1R11StageBProcessRow> | null = null;
  let holder: Readonly<Halfkp81V1R11StageBProcessRow> | null = null;
  let exitCode: number | null = null;
  const observedEngines = new Map<
    number,
    Readonly<Halfkp81V1R11StageBProcessRow>
  >();
  const observedAuxiliaries = new Map<
    number,
    Readonly<Halfkp81V1R11StageBProcessRow>
  >();
  const runningObservations: Array<
    Halfkp81V1R11StageBParentJobEvidence["running_observations"][number]
  > = [];
  let monitorFailure: Error | null = null;
  const activeBinding = () =>
    runner === null
      ? null
      : Object.freeze({
          label: spec.label,
          plistSource,
          runnerIdentity: Object.freeze({
            pid: runner.pid,
            pgid: runner.pgid,
            lstart: runner.start_token,
          }),
        });
  try {
    while (dependencies.now() - startedAt <= spec.timeoutMs) {
      if (spec.abortIfPathExists !== undefined) {
        try {
          fs.lstatSync(spec.abortIfPathExists);
          throw new Error("Stage B terminal-fault collision appeared");
        } catch (error) {
          if (
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          ) {
            // The create-only fault target is still absent.
          } else {
            throw error;
          }
        }
      }
      const status = printService(spec, dependencies);
      if (!status.loaded) {
        throw new Error(
          "Stage B one-shot service disappeared before terminal status",
        );
      }
      if (status.state === "running") {
        const psRaw = dependencies.ps();
        const topology = exactRunnerTopology(
          parseHalfkp81V1R11StageBPsForTests(psRaw),
          status.pid!,
          programArguments,
          expectedGuardianCommand,
        );
        if (
          runner !== null &&
          (runner.pid !== topology.runner.pid ||
            runner.start_token !== topology.runner.start_token)
        ) {
          throw new Error("Stage B launchd runner identity changed");
        }
        if (
          holder !== null &&
          (holder.pid !== topology.holder.pid ||
            holder.start_token !== topology.holder.start_token)
        ) {
          throw new Error("Stage B caffeinate holder identity changed");
        }
        runner = topology.runner;
        holder = topology.holder;
        if (
          (topology.engines.length > 0 && topology.auxiliaries.length !== 1) ||
          (observedAuxiliaries.size === 1 && topology.auxiliaries.length !== 1)
        ) {
          throw new Error(
            "Stage B authenticated power guardian disappeared or started after an engine",
          );
        }
        const retainsNewProcessIdentity =
          topology.auxiliaries.length === 1 &&
          (runningObservations.length === 0 ||
            topology.engines.some(
              (engine) => !observedEngines.has(engine.pid),
            ) ||
            topology.auxiliaries.some(
              (auxiliary) => !observedAuxiliaries.has(auxiliary.pid),
            ));
        mergeObservedRows(observedEngines, topology.engines);
        mergeObservedRows(observedAuxiliaries, topology.auxiliaries);
        if (retainsNewProcessIdentity) {
          const observedAtMs = dependencies.now();
          runningObservations.push(
            Object.freeze({
              observation_sequence: runningObservations.length + 1,
              observed_at_ms: observedAtMs,
              observed_at_utc: new Date(observedAtMs).toISOString(),
              launchctl_stdout: rawIdentity(status.raw_stdout),
              launchctl_stderr: rawIdentity(status.raw_stderr),
              ps_stdout: rawIdentity(psRaw),
              runner: topology.runner,
              assertion_holder: topology.holder,
              observed_engine_rows: topology.engines,
              observed_auxiliary_rows: topology.auxiliaries,
            }),
          );
        }
      } else if (status.state === "exited") {
        if (runner === null || holder === null) {
          throw new Error(
            "Stage B one-shot exited before parent observed its identity",
          );
        }
        exitCode = status.last_exit_code;
        break;
      }
      await dependencies.wait(spec.pollIntervalMs);
    }
    if (runner === null || holder === null || exitCode === null) {
      throw new Error("Stage B one-shot exceeded its parent deadline");
    }
    if (
      observedAuxiliaries.size !== 1 ||
      runningObservations.length < 1
    ) {
      throw new Error("Stage B authenticated power guardian was not observed");
    }
  } catch (error) {
    monitorFailure = error instanceof Error ? error : new Error(String(error));
  }

  const reapAndBuildEvidence = async (): Promise<
    Readonly<Halfkp81V1R11StageBParentJobEvidence> | null
  > => {
    const actions: Readonly<Record<string, unknown>>[] = [];
    let bootoutVerified = false;
    try {
      const bootout = launchctlResult(dependencies, ["bootout", service]);
      actions.push(
        Object.freeze({
          action: "launchctl-bootout",
          target: service,
          exit_code: bootout.status,
        }),
      );
      if (bootout.status === 0 && bootout.stderr.byteLength === 0) {
        bootoutVerified = !printService(spec, dependencies).loaded;
      }
    } catch (error) {
      actions.push(
        Object.freeze({
          action: "launchctl-bootout",
          target: service,
          exit_code: null,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    if (runner === null || holder === null) {
      return null;
    }
    let firstFinalRaw = dependencies.ps();
    let firstFinalRows = parseHalfkp81V1R11StageBPsForTests(firstFinalRaw);
    let liveGroup = firstFinalRows.filter((row) => row.pgid === runner!.pgid);
    if (liveGroup.length > 0) {
      const leader = liveGroup.find((row) => row.pid === runner!.pid);
      if (leader !== undefined && leader.start_token !== runner.start_token) {
        throw new Error("Stage B runner PID was reused before group cleanup");
      }
      const term = dependencies.signalProcessGroup(runner.pgid, "SIGTERM");
      actions.push(
        Object.freeze({
          action: "signal-process-group",
          pgid: runner.pgid,
          signal: "SIGTERM",
          result: term,
        }),
      );
      await dependencies.wait(Math.min(2_000, spec.pollIntervalMs * 2));
      firstFinalRaw = dependencies.ps();
      firstFinalRows = parseHalfkp81V1R11StageBPsForTests(firstFinalRaw);
      liveGroup = firstFinalRows.filter((row) => row.pgid === runner!.pgid);
      if (liveGroup.length > 0) {
        const kill = dependencies.signalProcessGroup(runner.pgid, "SIGKILL");
        actions.push(
          Object.freeze({
            action: "signal-process-group",
            pgid: runner.pgid,
            signal: "SIGKILL",
            result: kill,
          }),
        );
        await dependencies.wait(Math.min(2_000, spec.pollIntervalMs * 2));
        firstFinalRaw = dependencies.ps();
        firstFinalRows = parseHalfkp81V1R11StageBPsForTests(firstFinalRaw);
      }
    }
    const secondFinalRaw = dependencies.ps();
    const secondFinalRows = parseHalfkp81V1R11StageBPsForTests(secondFinalRaw);
    const remainingGroup = secondFinalRows
      .filter((row) => row.pgid === runner!.pgid)
      .map((row) => row.pid);
    const remainingDescendants = descendants(secondFinalRows, runner.pid).map(
      (row) => row.pid,
    );
    if (
      !bootoutVerified ||
      firstFinalRows.some((row) => row.pgid === runner!.pgid) ||
      remainingGroup.length !== 0 ||
      remainingDescendants.length !== 0
    ) {
      return null;
    }
    return Object.freeze({
      schema:
        "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-parent-job-evidence-v1",
      status:
        monitorFailure === null && exitCode === 0
          ? "runner-exited-and-job-process-group-reaped"
          : "runner-faulted-and-job-process-group-reaped",
      label: spec.label,
      uid: spec.uid,
      launchctl_domain: domain,
      plist_source: plistSource,
      stdout_path: spec.stdoutPath,
      stderr_path: spec.stderrPath,
      program_arguments: programArguments,
      runner_pid: runner.pid,
      runner_pgid: runner.pgid,
      runner_start_token: runner.start_token,
      assertion_holder_pid: holder.pid,
      assertion_holder_start_token: holder.start_token,
      running_observations: Object.freeze([...runningObservations]),
      observed_engine_rows: Object.freeze(
        [...observedEngines.values()].sort((left, right) => left.pid - right.pid),
      ),
      observed_auxiliary_rows: Object.freeze(
        [...observedAuxiliaries.values()].sort(
          (left, right) => left.pid - right.pid,
        ),
      ),
      runner_exit_code: exitCode,
      runner_exit_signal: null,
      termination_actions: Object.freeze(actions),
      final_ps_first: rawIdentity(firstFinalRaw),
      final_ps_second: rawIdentity(secondFinalRaw),
      remaining_process_group_pids: Object.freeze(remainingGroup),
      remaining_descendant_pids: Object.freeze(remainingDescendants),
    });
  };

  let evidence: Readonly<Halfkp81V1R11StageBParentJobEvidence> | null;
  try {
    evidence = await reapAndBuildEvidence();
  } catch (cleanupError) {
    throw new Halfkp81V1R11StageBLaunchAgentSupervisorError(
      `${monitorFailure?.message ?? "Stage B child terminal state"}; cleanup proof failed: ${
        cleanupError instanceof Error
          ? cleanupError.message
          : String(cleanupError)
      }`,
      null,
      activeBinding(),
    );
  }
  if (monitorFailure !== null) {
    throw new Halfkp81V1R11StageBLaunchAgentSupervisorError(
      monitorFailure.message,
      evidence,
      activeBinding(),
    );
  }
  if (evidence === null) {
    throw new Halfkp81V1R11StageBLaunchAgentSupervisorError(
      "Stage B parent could not verify complete job cleanup",
      null,
      activeBinding(),
    );
  }

  const stdout = heldRead(spec.stdoutPath, MAX_TRANSCRIPT_BYTES);
  const stderr = heldRead(spec.stderrPath, MAX_TRANSCRIPT_BYTES);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.toString("utf8"));
  } catch {
    throw new Halfkp81V1R11StageBLaunchAgentSupervisorError(
      "Stage B child stdout is not JSON",
      evidence,
      activeBinding(),
    );
  }
  if (
    exitCode !== 0 ||
    stderr.byteLength !== 0 ||
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !stdout.equals(Buffer.from(`${v1r11CanonicalJson(parsed)}\n`, "utf8"))
  ) {
    throw new Halfkp81V1R11StageBLaunchAgentSupervisorError(
      "Stage B child output or exit status differs",
      evidence,
      activeBinding(),
    );
  }
  return Object.freeze({
    schema:
      "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-parent-envelope-v1",
    status: "fixed-child-output-authenticated-after-job-reap",
    runtime_stdout_base64: stdout.toString("base64"),
    runtime_stdout_bytes: stdout.byteLength,
    runtime_stdout_sha256: sha256(stdout),
    runtime_stderr_base64: stderr.toString("base64"),
    runtime_stderr_bytes: stderr.byteLength,
    runtime_stderr_sha256: sha256(stderr),
    parsed_inner_canonical_json: parsed as Readonly<Record<string, unknown>>,
    parent_job_evidence: evidence,
  });
}
