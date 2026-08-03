import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  assertV1R11AuthorityDirectory,
  publishV1R11CreateOnlyBytes,
  publishV1R11CreateOnlyCanonical,
  v1r11CanonicalJson,
  v1r11Sha256,
  type V1R11AuthorityDirectoryIdentity,
  type V1R11AuthorityFileIdentity,
} from "./halfkp81-depth18-v1r11-authority-io";
import {
  halfkp81V1R11FormalRunFingerprintV2,
  type Halfkp81V1R11FormalRunIntentInput,
} from "./halfkp81-depth18-v1r11-formal-run-intent";
import { HALFKP81_V1R11_FORMAL_CHILD_ENTRYPOINT } from "./prepare-halfkp81-depth18-v1r11-planned-launchagent";
import { buildHalfkp81V1R11RecursiveProducerIdentity } from "./halfkp81-depth18-v1r11-producer-closure";

export const HALFKP81_V1R11_FINAL_LAUNCHAGENT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11" as const;
export const HALFKP81_V1R11_FINAL_LAUNCHAGENT_STATUS =
  "live-one-shot-LaunchAgent-semantics-verified-no-standalone-formal-authority" as const;
export const HALFKP81_V1R11_REQUIRED_ASSERTIONS = Object.freeze([
  "PreventSystemSleep",
  "PreventUserIdleSystemSleep",
  "PreventUserIdleDisplaySleep",
] as const);

const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const LABEL_PREFIX =
  "com.meetyudai.shogi.halfkp81-depth18-yaneura-only-v1r11-";
const PRINT_SCHEMA = "text/plain-utf8-exact-command-stdout";
const STDERR_SCHEMA = "text/plain-utf8-exact-command-stderr";
const PLIST_SCHEMA = "application/x-apple-aspen-config-exact-bytes";
const PS_STDOUT_SCHEMA = "text/plain-exact-launchagent-ps-stdout";
const PS_STDERR_SCHEMA = "text/plain-exact-launchagent-ps-stderr";
const PS_COMMAND = Object.freeze([
  "/bin/ps",
  "-ww",
  "-axo",
  "pid=,ppid=,pgid=,lstart=,command=",
] as const);
const LSTART_RE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4}$/u;
const FORMAL_ENGINE_PATH =
  "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1/bin/yaneuraou";
const PRODUCER_ENTRYPOINT =
  "ml/halfkp81-depth18-v1r11-stage-c-live-evidence.ts";

type JsonObject = Readonly<Record<string, unknown>>;

export interface Halfkp81V1R11StageCProcessRow {
  readonly pid: number;
  readonly ppid: number;
  readonly pgid: number;
  readonly lstart: string;
  readonly executable: string;
  readonly argv: string;
  readonly role: "runner" | "assertion-holder";
}

export interface Halfkp81V1R11StageCLiveEvidenceContext {
  readonly repositoryRoot: string;
  readonly authorityDirectory: string;
  readonly homeDirectory: string;
  readonly expectedUid: number;
  readonly sourceRevision: string;
  readonly runFingerprint: string;
  readonly formalRunIntent?: Readonly<Halfkp81V1R11FormalRunIntentInput>;
  readonly teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
  readonly expectedNodePath: string;
}

export interface Halfkp81V1R11StageCParsedLaunchEvidence {
  readonly value: JsonObject;
  readonly uid: number;
  readonly label: string;
  readonly runnerPid: number;
  readonly programArguments: readonly string[];
  readonly runnerUtilityArgv: readonly string[];
  readonly holderPid: number;
  readonly launchctlPrint: Readonly<V1R11AuthorityFileIdentity>;
  readonly launchctlStderr: Readonly<V1R11AuthorityFileIdentity>;
  readonly plistSnapshot: Readonly<V1R11AuthorityFileIdentity>;
  readonly psCommand: readonly string[];
  readonly psStdout: Readonly<V1R11AuthorityFileIdentity>;
  readonly psStderr: Readonly<V1R11AuthorityFileIdentity>;
  readonly runnerProcess: Readonly<Halfkp81V1R11StageCProcessRow>;
  readonly assertionHolderProcess: Readonly<Halfkp81V1R11StageCProcessRow>;
  readonly observedProcessGroupRows: readonly Readonly<Halfkp81V1R11StageCProcessRow>[];
  readonly observedYaneuraouEngineRows: readonly never[];
  readonly plistSource: Readonly<{
    plist_path: string;
    realpath: string;
    dev: number;
    ino: number;
    uid: number;
    mode: number;
    nlink: number;
    bytes: number;
    sha256: string;
  }>;
}

export interface Halfkp81V1R11ModernEvidenceCapture {
  readonly launchctlStdout: Buffer;
  readonly launchctlStderr: Buffer;
  readonly psStdout: Buffer;
  readonly psStderr: Buffer;
  readonly pmsetAssertions: string;
  readonly observedAtUtc: string;
}

async function publishStageCRaw(
  authority: Readonly<V1R11AuthorityDirectoryIdentity>,
  filePath: string,
  raw: Buffer,
  schema: string,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  if (raw.byteLength > 0) {
    return publishV1R11CreateOnlyBytes(authority, filePath, raw, schema);
  }
  await assertV1R11AuthorityDirectory(authority);
  const handle = await fs.promises.open(
    filePath,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      (fs.constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  const directory = await fs.promises.open(
    authority.path,
    fs.constants.O_RDONLY,
  );
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  return Object.freeze({
    path: filePath,
    bytes: 0,
    sha256: v1r11Sha256(raw),
    schema,
  });
}

export async function publishHalfkp81V1R11ModernLaunchEvidenceForTests(
  request: Readonly<{
    repositoryRoot: string;
    authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    homeDirectory: string;
    uid: number;
    nodePath: string;
    runnerPid: number;
    xpcServiceName: string;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    formalRunIntent: Readonly<Halfkp81V1R11FormalRunIntentInput>;
    plannedPlist: Readonly<V1R11AuthorityFileIdentity>;
    producer: Readonly<Record<string, unknown>>;
    capture: Readonly<Halfkp81V1R11ModernEvidenceCapture>;
  }>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  await assertV1R11AuthorityDirectory(request.authorityDirectory);
  const label = `${LABEL_PREFIX}${request.sourceRevision.slice(0, 8)}`;
  if (
    request.xpcServiceName !== label ||
    v1r11CanonicalJson(request.formalRunIntent.plannedFinalDescriptor) !==
      v1r11CanonicalJson(request.plannedPlist) ||
    halfkp81V1R11FormalRunFingerprintV2(request.formalRunIntent) !==
      request.runFingerprint ||
    !ISO_UTC_RE.test(request.capture.observedAtUtc) ||
    new Date(request.capture.observedAtUtc).toISOString() !==
      request.capture.observedAtUtc ||
    request.capture.launchctlStderr.byteLength !== 0 ||
    request.capture.psStderr.byteLength !== 0
  ) {
    throw new Error("modern Stage C evidence context differs");
  }
  const plistPath = path.join(
    request.homeDirectory,
    "Library/LaunchAgents",
    `${label}.plist`,
  );
  const plistMetadata = await fs.promises.lstat(plistPath);
  const plistRaw = await fs.promises.readFile(plistPath);
  const plannedRaw = await fs.promises.readFile(request.plannedPlist.path);
  if (
    !plistMetadata.isFile() ||
    plistMetadata.isSymbolicLink() ||
    plistMetadata.nlink !== 1 ||
    plistMetadata.uid !== request.uid ||
    (plistMetadata.mode & 0o7777) !== 0o600 ||
    (await fs.promises.realpath(plistPath)) !== plistPath ||
    !plistRaw.equals(plannedRaw) ||
    plistRaw.byteLength !== request.plannedPlist.bytes ||
    v1r11Sha256(plistRaw) !== request.plannedPlist.sha256
  ) {
    throw new Error("modern Stage C plist identity differs");
  }
  const rows = parseStageCPs(request.capture.psStdout);
  const runnerRows = rows.filter((row) => row.pid === request.runnerPid);
  const holderRows = rows.filter(
    (row) =>
      row.ppid === request.runnerPid &&
      row.pgid === request.runnerPid &&
      row.executable === "/usr/bin/caffeinate",
  );
  const runner = runnerRows[0];
  const holder = holderRows[0];
  const groupRows = rows.filter((row) => row.pgid === request.runnerPid);
  if (
    runnerRows.length !== 1 ||
    holderRows.length !== 1 ||
    runner === undefined ||
    holder === undefined ||
    runner.pgid !== request.runnerPid ||
    runner.executable !== request.nodePath ||
    groupRows.length !== 2 ||
    rows.some(
      (row) =>
        row.executable === FORMAL_ENGINE_PATH ||
        row.argv === FORMAL_ENGINE_PATH ||
        row.argv.startsWith(`${FORMAL_ENGINE_PATH} `),
    )
  ) {
    throw new Error("modern Stage C engine-zero process barrier differs");
  }
  parseHalfkp81V1R11StageCAssertionsForTests(
    request.capture.pmsetAssertions,
    holder.pid,
  );
  const launchctlPrint = await publishStageCRaw(
    request.authorityDirectory,
    path.join(request.authorityDirectory.path, "launchagent-launchctl-print.txt"),
    request.capture.launchctlStdout,
    PRINT_SCHEMA,
  );
  const launchctlStderr = await publishStageCRaw(
    request.authorityDirectory,
    path.join(
      request.authorityDirectory.path,
      "launchagent-launchctl-print.stderr.txt",
    ),
    request.capture.launchctlStderr,
    STDERR_SCHEMA,
  );
  const psStdout = await publishStageCRaw(
    request.authorityDirectory,
    path.join(request.authorityDirectory.path, "launchagent-ps.stdout.txt"),
    request.capture.psStdout,
    PS_STDOUT_SCHEMA,
  );
  const psStderr = await publishStageCRaw(
    request.authorityDirectory,
    path.join(request.authorityDirectory.path, "launchagent-ps.stderr.txt"),
    request.capture.psStderr,
    PS_STDERR_SCHEMA,
  );
  const runnerUtilityArgv = Object.freeze([
    request.nodePath,
    "-r",
    path.join(request.repositoryRoot, "node_modules/tsx/dist/cjs/index.cjs"),
    path.join(request.repositoryRoot, HALFKP81_V1R11_FORMAL_CHILD_ENTRYPOINT),
  ]);
  const programArguments = runnerUtilityArgv;
  const holderArguments = Object.freeze([
    "/usr/bin/caffeinate",
    "-dimsu",
    "-w",
    String(request.runnerPid),
  ]);
  const runnerProcess = Object.freeze({ ...runner, role: "runner" as const });
  const holderProcess = Object.freeze({
    ...holder,
    role: "assertion-holder" as const,
  });
  const evidence = Object.freeze({
    schema: HALFKP81_V1R11_FINAL_LAUNCHAGENT_SCHEMA,
    status: HALFKP81_V1R11_FINAL_LAUNCHAGENT_STATUS,
    teacher_plan: request.teacherPlan,
    source_revision: request.sourceRevision,
    run_fingerprint: request.runFingerprint,
    observed_at_utc: request.capture.observedAtUtc,
    uid: request.uid,
    xpc_service_name: label,
    label,
    runner_pid: request.runnerPid,
    working_directory: request.repositoryRoot,
    stdout_path: path.join(
      request.homeDirectory,
      ".codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11/formal-launchagent.stdout.log",
    ),
    stderr_path: path.join(
      request.homeDirectory,
      ".codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11/formal-launchagent.stderr.log",
    ),
    program_arguments: programArguments,
    runner_utility_argv: runnerUtilityArgv,
    caffeinate_holder: Object.freeze({
      pid: holder.pid,
      parent_runner_pid: request.runnerPid,
      assertion_owner_pid: holder.pid,
      executable: "/usr/bin/caffeinate",
      argv: holderArguments,
    }),
    required_assertions: HALFKP81_V1R11_REQUIRED_ASSERTIONS,
    launchctl_command: Object.freeze([
      "/bin/launchctl",
      "print",
      `gui/${String(request.uid)}/${label}`,
    ]),
    launchctl_exit_code: 0,
    launchctl_print: launchctlPrint,
    launchctl_stderr: launchctlStderr,
    plist_source: Object.freeze({
      plist_path: plistPath,
      realpath: plistPath,
      dev: plistMetadata.dev,
      ino: plistMetadata.ino,
      uid: plistMetadata.uid,
      mode: 0o600,
      nlink: 1,
      bytes: plistRaw.byteLength,
      sha256: v1r11Sha256(plistRaw),
    }),
    plist_snapshot: request.plannedPlist,
    ps_command: PS_COMMAND,
    ps_exit_code: 0,
    ps_stdout: psStdout,
    ps_stderr: psStderr,
    runner_process: runnerProcess,
    assertion_holder_process: holderProcess,
    observed_process_group_rows: Object.freeze([runnerProcess, holderProcess]),
    observed_yaneuraou_engine_rows: Object.freeze([]),
    producer: request.producer,
  });
  const parsed = validateHalfkp81V1R11StageCLaunchEvidenceForTests(evidence, {
    repositoryRoot: request.repositoryRoot,
    authorityDirectory: request.authorityDirectory.path,
    homeDirectory: request.homeDirectory,
    expectedUid: request.uid,
    sourceRevision: request.sourceRevision,
    runFingerprint: request.runFingerprint,
    formalRunIntent: request.formalRunIntent,
    teacherPlan: request.teacherPlan,
    expectedNodePath: request.nodePath,
  });
  validateHalfkp81V1R11StageCLaunchctlForTests(
    request.capture.launchctlStdout.toString("utf8"),
    parsed,
  );
  validateHalfkp81V1R11StageCRawCapturesForTests(parsed, {
    sealedLaunchctl: request.capture.launchctlStdout,
    liveLaunchctl: request.capture.launchctlStdout,
    sealedLaunchctlStderr: request.capture.launchctlStderr,
    liveLaunchctlStderr: request.capture.launchctlStderr,
    sealedPlist: plannedRaw,
    livePlist: plistRaw,
    sealedPsStdout: request.capture.psStdout,
    sealedPsStderr: request.capture.psStderr,
  });
  return publishV1R11CreateOnlyCanonical(
    request.authorityDirectory,
    path.join(request.authorityDirectory.path, "launchagent-authority-evidence.json"),
    evidence,
    HALFKP81_V1R11_FINAL_LAUNCHAGENT_SCHEMA,
  );
}

function captureProductionCommand(
  executable: string,
  arguments_: readonly string[],
): Readonly<{ exitCode: number; stdout: Buffer; stderr: Buffer }> {
  const result = spawnSync(executable, [...arguments_], {
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (
    result.error !== undefined ||
    result.signal !== null ||
    result.status === null ||
    !Buffer.isBuffer(result.stdout) ||
    !Buffer.isBuffer(result.stderr)
  ) {
    throw new Error(`modern Stage C command transport failed: ${executable}`);
  }
  return Object.freeze({
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  });
}

export async function publishHalfkp81V1R11ModernLaunchEvidence(
  request: Readonly<{
    repositoryRoot: string;
    authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    formalRunIntent: Readonly<Halfkp81V1R11FormalRunIntentInput>;
    plannedPlist: Readonly<V1R11AuthorityFileIdentity>;
  }>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  const uid = process.geteuid?.();
  const xpcServiceName = process.env.XPC_SERVICE_NAME;
  if (
    !Number.isSafeInteger(uid) ||
    Number(uid) < 1 ||
    typeof xpcServiceName !== "string"
  ) {
    throw new Error("modern Stage C LaunchAgent process authority differs");
  }
  const homeDirectory = fs.realpathSync.native(process.env.HOME ?? "");
  const nodePath = fs.realpathSync.native(process.execPath);
  const service = `gui/${String(uid)}/${xpcServiceName}`;
  const launchctl = captureProductionCommand("/bin/launchctl", [
    "print",
    service,
  ]);
  const ps = captureProductionCommand(PS_COMMAND[0]!, PS_COMMAND.slice(1));
  const assertions = captureProductionCommand("/usr/bin/pmset", [
    "-g",
    "assertions",
  ]);
  if (
    launchctl.exitCode !== 0 ||
    ps.exitCode !== 0 ||
    assertions.exitCode !== 0 ||
    assertions.stderr.byteLength !== 0
  ) {
    throw new Error("modern Stage C OS evidence command failed");
  }
  const producer = buildHalfkp81V1R11RecursiveProducerIdentity(
    request.repositoryRoot,
    request.sourceRevision,
    PRODUCER_ENTRYPOINT,
  );
  return publishHalfkp81V1R11ModernLaunchEvidenceForTests({
    ...request,
    homeDirectory,
    uid: Number(uid),
    nodePath,
    runnerPid: process.pid,
    xpcServiceName,
    producer,
    capture: Object.freeze({
      launchctlStdout: launchctl.stdout,
      launchctlStderr: launchctl.stderr,
      psStdout: ps.stdout,
      psStderr: ps.stderr,
      pmsetAssertions: assertions.stdout.toString("utf8"),
      observedAtUtc: new Date().toISOString(),
    }),
  });
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

function integer(value: unknown, minimum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new Error(`${label} differs`);
  }
  return Number(value);
}

function absolute(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !path.isAbsolute(value) ||
    path.normalize(value) !== value
  ) {
    throw new Error(`${label} differs`);
  }
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.some(
      (entry) =>
        typeof entry !== "string" || entry.length < 1 || /[\u0000\r\n]/u.test(entry),
    )
  ) {
    throw new Error(`${label} differs`);
  }
  return Object.freeze([...value]) as readonly string[];
}

function identity(
  value: unknown,
  expectedPath: string,
  expectedSchema: string,
  label: string,
  allowEmpty = false,
): Readonly<V1R11AuthorityFileIdentity> {
  const row = object(value, label);
  exactKeys(row, ["path", "bytes", "sha256", "schema"], label);
  if (
    row.path !== expectedPath ||
    !Number.isSafeInteger(row.bytes) ||
    Number(row.bytes) < (allowEmpty ? 0 : 1) ||
    typeof row.sha256 !== "string" ||
    !SHA256_RE.test(row.sha256) ||
    row.schema !== expectedSchema
  ) {
    throw new Error(`${label} differs`);
  }
  return row as unknown as Readonly<V1R11AuthorityFileIdentity>;
}

function validateProducer(value: unknown, sourceRevision: string): void {
  const producer = object(value, "Stage C LaunchAgent producer");
  exactKeys(
    producer,
    ["source_revision", "entrypoint", "dependency_closure"],
    "Stage C LaunchAgent producer",
  );
  if (
    producer.source_revision !== sourceRevision ||
    producer.entrypoint !== PRODUCER_ENTRYPOINT ||
    typeof producer.entrypoint !== "string" ||
    path.isAbsolute(producer.entrypoint) ||
    path.posix.normalize(producer.entrypoint) !== producer.entrypoint ||
    producer.entrypoint.startsWith("../") ||
    producer.entrypoint.includes("/../") ||
    !Array.isArray(producer.dependency_closure) ||
    producer.dependency_closure.length < 1
  ) {
    throw new Error("Stage C LaunchAgent producer differs");
  }
  const paths: string[] = [];
  for (const [index, raw] of producer.dependency_closure.entries()) {
    const entry = object(raw, `Stage C LaunchAgent producer closure ${index}`);
    exactKeys(
      entry,
      ["path", "bytes", "sha256"],
      `Stage C LaunchAgent producer closure ${index}`,
    );
    if (
      typeof entry.path !== "string" ||
      path.isAbsolute(entry.path) ||
      path.posix.normalize(entry.path) !== entry.path ||
      entry.path.startsWith("../") ||
      entry.path.includes("/../") ||
      !Number.isSafeInteger(entry.bytes) ||
      Number(entry.bytes) < 1 ||
      typeof entry.sha256 !== "string" ||
      !SHA256_RE.test(entry.sha256)
    ) {
      throw new Error(`Stage C LaunchAgent producer closure ${index} differs`);
    }
    paths.push(entry.path);
  }
  if (
    paths[0] !== producer.entrypoint ||
    new Set(paths).size !== paths.length ||
    v1r11CanonicalJson(paths.slice(1)) !==
      v1r11CanonicalJson([...paths.slice(1)].sort())
  ) {
    throw new Error("Stage C LaunchAgent producer closure order differs");
  }
}

interface RawPsRow {
  readonly pid: number;
  readonly ppid: number;
  readonly pgid: number;
  readonly lstart: string;
  readonly executable: string;
  readonly argv: string;
}

function parseStageCPs(raw: Buffer): readonly Readonly<RawPsRow>[] {
  const text = raw.toString("utf8");
  if (
    !Buffer.from(text, "utf8").equals(raw) ||
    (text.length > 0 && !text.endsWith("\n"))
  ) {
    throw new Error("Stage C ps stdout is not exact UTF-8 LF text");
  }
  const rows: RawPsRow[] = [];
  for (const [index, line] of text.split("\n").slice(0, -1).entries()) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4})\s+(.+)$/u.exec(
      line,
    );
    if (match === null) {
      throw new Error(`Stage C ps row ${index + 1} is ambiguous`);
    }
    const row = Object.freeze({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      lstart: match[4]!,
      executable: /^(\S+)(?:\s|$)/u.exec(match[5]!)?.[1] ?? "",
      argv: match[5]!,
    });
    if (
      !Number.isSafeInteger(row.pid) ||
      row.pid < 1 ||
      !Number.isSafeInteger(row.ppid) ||
      row.ppid < 0 ||
      !Number.isSafeInteger(row.pgid) ||
      row.pgid < 1 ||
      !LSTART_RE.test(row.lstart) ||
      row.executable.length < 1 ||
      row.argv.length < 1 ||
      rows.some((prior) => prior.pid === row.pid)
    ) {
      throw new Error(`Stage C ps row ${index + 1} semantics differ`);
    }
    rows.push(row);
  }
  return Object.freeze(rows);
}

function stageCProcessRow(
  value: unknown,
  role: Halfkp81V1R11StageCProcessRow["role"],
  label: string,
): Readonly<Halfkp81V1R11StageCProcessRow> {
  const row = object(value, label);
  exactKeys(
    row,
    ["pid", "ppid", "pgid", "lstart", "executable", "argv", "role"],
    label,
  );
  if (
    integer(row.pid, 1, `${label} pid`) < 1 ||
    integer(row.ppid, 0, `${label} ppid`) < 0 ||
    integer(row.pgid, 1, `${label} pgid`) < 1 ||
    typeof row.lstart !== "string" ||
    !LSTART_RE.test(row.lstart) ||
    typeof row.executable !== "string" ||
    row.executable.length < 1 ||
    typeof row.argv !== "string" ||
    row.argv.length < 1 ||
    row.role !== role
  ) {
    throw new Error(`${label} differs`);
  }
  return row as unknown as Readonly<Halfkp81V1R11StageCProcessRow>;
}

/** Strictly parses one bounded `pmset -g batt` snapshot. */
export function parseHalfkp81V1R11StageCBatteryForTests(raw: string): Readonly<{
  powerSource: string;
  batteryPercentage: number;
}> {
  const sourceMatches = [...raw.matchAll(/^Now drawing from '([^'\r\n]+)'\s*$/gmu)];
  const percentageMatches = [...raw.matchAll(/^\s*-[^\r\n]+\s+(\d{1,3})%;[^\r\n]*$/gmu)];
  if (
    sourceMatches.length !== 1 ||
    percentageMatches.length !== 1 ||
    sourceMatches[0]?.[1] === undefined ||
    percentageMatches[0]?.[1] === undefined
  ) {
    throw new Error("Stage C pmset battery output is not uniquely parseable");
  }
  const batteryPercentage = Number(percentageMatches[0][1]);
  if (!Number.isSafeInteger(batteryPercentage) || batteryPercentage > 100) {
    throw new Error("Stage C pmset battery percentage differs");
  }
  return Object.freeze({
    powerSource: sourceMatches[0][1],
    batteryPercentage,
  });
}

/**
 * Requires both the system-wide value and the exact owning caffeinate row for
 * every preregistered assertion. Similar text owned by another PID is ignored.
 */
export function parseHalfkp81V1R11StageCAssertionsForTests(
  raw: string,
  ownerPid: number,
): readonly string[] {
  integer(ownerPid, 1, "Stage C assertion owner PID");
  const section = raw.split(/^Listed by owning process:\s*$/mu);
  if (section.length !== 2) {
    throw new Error("Stage C pmset assertion sections differ");
  }
  const status = new Map<string, number>();
  for (const line of section[0]!.split(/\r?\n/u)) {
    const match = /^\s{3}([A-Za-z][A-Za-z0-9]+)\s+([01])\s*$/u.exec(line);
    if (match === null) continue;
    if (status.has(match[1]!)) {
      throw new Error("Stage C pmset assertion status is ambiguous");
    }
    status.set(match[1]!, Number(match[2]));
  }
  const owned = new Map<string, number>();
  for (const line of section[1]!.split(/\r?\n/u)) {
    const match = /^\s*pid\s+(\d+)\(([^)]+)\):\s+\[0x[0-9a-fA-F]+\]\s+(?:\d+:\d{2}:\d{2}\s+)?([A-Za-z][A-Za-z0-9]+)\s+named:\s+(["'])(.*?)\4\s*$/u.exec(
      line,
    );
    if (match === null || Number(match[1]) !== ownerPid) continue;
    if (
      match[2] !== "caffeinate" ||
      match[5] !== "caffeinate command-line tool"
    ) {
      throw new Error("Stage C assertion owner identity differs");
    }
    owned.set(match[3]!, (owned.get(match[3]!) ?? 0) + 1);
  }
  for (const assertion of HALFKP81_V1R11_REQUIRED_ASSERTIONS) {
    if (status.get(assertion) !== 1 || owned.get(assertion) !== 1) {
      throw new Error(`Stage C required assertion ${assertion} differs`);
    }
  }
  return HALFKP81_V1R11_REQUIRED_ASSERTIONS;
}

export function validateHalfkp81V1R11StageCLaunchEvidenceForTests(
  value: unknown,
  context: Readonly<Halfkp81V1R11StageCLiveEvidenceContext>,
): Readonly<Halfkp81V1R11StageCParsedLaunchEvidence> {
  const independentlyComputedFingerprint =
    context.formalRunIntent === undefined
      ? context.runFingerprint
      : halfkp81V1R11FormalRunFingerprintV2(context.formalRunIntent);
  const evidence = object(value, "Stage C final LaunchAgent evidence");
  exactKeys(
    evidence,
    [
      "schema",
      "status",
      "teacher_plan",
      "source_revision",
      "run_fingerprint",
      "observed_at_utc",
      "uid",
      "xpc_service_name",
      "label",
      "runner_pid",
      "working_directory",
      "stdout_path",
      "stderr_path",
      "program_arguments",
      "runner_utility_argv",
      "caffeinate_holder",
      "required_assertions",
      "launchctl_command",
      "launchctl_exit_code",
      "launchctl_print",
      "launchctl_stderr",
      "plist_source",
      "plist_snapshot",
      "ps_command",
      "ps_exit_code",
      "ps_stdout",
      "ps_stderr",
      "runner_process",
      "assertion_holder_process",
      "observed_process_group_rows",
      "observed_yaneuraou_engine_rows",
      "producer",
    ],
    "Stage C final LaunchAgent evidence",
  );
  if (
    !path.isAbsolute(context.repositoryRoot) ||
    path.normalize(context.repositoryRoot) !== context.repositoryRoot ||
    !path.isAbsolute(context.authorityDirectory) ||
    path.normalize(context.authorityDirectory) !== context.authorityDirectory ||
    !path.isAbsolute(context.homeDirectory) ||
    path.normalize(context.homeDirectory) !== context.homeDirectory ||
    !path.isAbsolute(context.expectedNodePath) ||
    path.normalize(context.expectedNodePath) !== context.expectedNodePath ||
    !REVISION_RE.test(context.sourceRevision) ||
    !SHA256_RE.test(context.runFingerprint) ||
    independentlyComputedFingerprint !== context.runFingerprint ||
    !Number.isSafeInteger(context.expectedUid) ||
    context.expectedUid < 1
  ) {
    throw new Error("Stage C LaunchAgent validation context differs");
  }
  const label = `${LABEL_PREFIX}${context.sourceRevision.slice(0, 8)}`;
  const runnerPid = integer(evidence.runner_pid, 1, "Stage C runner PID");
  const programArguments = stringArray(
    evidence.program_arguments,
    "Stage C ProgramArguments",
  );
  const runnerUtilityArgv = stringArray(
    evidence.runner_utility_argv,
    "Stage C runner utility argv",
  );
  const expectedRunnerUtilityArgv = Object.freeze([
    context.expectedNodePath,
    "-r",
    path.join(context.repositoryRoot, "node_modules/tsx/dist/cjs/index.cjs"),
    path.join(
      context.repositoryRoot,
      HALFKP81_V1R11_FORMAL_CHILD_ENTRYPOINT,
    ),
  ]);
  const expectedProgramArguments = expectedRunnerUtilityArgv;
  const expectedHolderArguments = Object.freeze([
    "/usr/bin/caffeinate",
    "-dimsu",
    "-w",
    String(runnerPid),
  ]);
  const holder = object(evidence.caffeinate_holder, "Stage C caffeinate holder");
  exactKeys(
    holder,
    ["pid", "parent_runner_pid", "assertion_owner_pid", "executable", "argv"],
    "Stage C caffeinate holder",
  );
  const holderPid = integer(holder.pid, 1, "Stage C caffeinate holder PID");
  const runnerProcess = stageCProcessRow(
    evidence.runner_process,
    "runner",
    "Stage C runner process",
  );
  const assertionHolderProcess = stageCProcessRow(
    evidence.assertion_holder_process,
    "assertion-holder",
    "Stage C assertion-holder process",
  );
  absolute(evidence.stdout_path, "Stage C stdout path");
  absolute(evidence.stderr_path, "Stage C stderr path");
  if (
    evidence.schema !== HALFKP81_V1R11_FINAL_LAUNCHAGENT_SCHEMA ||
    evidence.status !== HALFKP81_V1R11_FINAL_LAUNCHAGENT_STATUS ||
    v1r11CanonicalJson(evidence.teacher_plan) !==
      v1r11CanonicalJson(context.teacherPlan) ||
    evidence.source_revision !== context.sourceRevision ||
    evidence.run_fingerprint !== context.runFingerprint ||
    typeof evidence.observed_at_utc !== "string" ||
    !ISO_UTC_RE.test(evidence.observed_at_utc) ||
    new Date(evidence.observed_at_utc).toISOString() !== evidence.observed_at_utc ||
    evidence.uid !== context.expectedUid ||
    evidence.label !== label ||
    evidence.xpc_service_name !== label ||
    evidence.working_directory !== context.repositoryRoot ||
    evidence.stdout_path === evidence.stderr_path ||
    v1r11CanonicalJson(runnerUtilityArgv) !==
      v1r11CanonicalJson(expectedRunnerUtilityArgv) ||
    v1r11CanonicalJson(programArguments) !==
      v1r11CanonicalJson(expectedProgramArguments) ||
    holderPid === runnerPid ||
    holder.parent_runner_pid !== runnerPid ||
    holder.assertion_owner_pid !== holderPid ||
    holder.executable !== "/usr/bin/caffeinate" ||
    v1r11CanonicalJson(holder.argv) !==
      v1r11CanonicalJson(expectedHolderArguments) ||
    v1r11CanonicalJson(evidence.required_assertions) !==
      v1r11CanonicalJson(HALFKP81_V1R11_REQUIRED_ASSERTIONS) ||
    v1r11CanonicalJson(evidence.launchctl_command) !==
      v1r11CanonicalJson([
        "/bin/launchctl",
        "print",
        `gui/${String(context.expectedUid)}/${label}`,
      ]) ||
    evidence.launchctl_exit_code !== 0 ||
    v1r11CanonicalJson(evidence.ps_command) !==
      v1r11CanonicalJson(PS_COMMAND) ||
    evidence.ps_exit_code !== 0 ||
    runnerProcess.pid !== runnerPid ||
    runnerProcess.pgid !== runnerPid ||
    runnerProcess.executable !== context.expectedNodePath ||
    runnerProcess.argv !== runnerUtilityArgv.join(" ") ||
    assertionHolderProcess.pid !== holderPid ||
    assertionHolderProcess.ppid !== runnerPid ||
    assertionHolderProcess.pgid !== runnerProcess.pgid ||
    assertionHolderProcess.executable !== "/usr/bin/caffeinate" ||
    assertionHolderProcess.argv !== expectedHolderArguments.join(" ") ||
    !Array.isArray(evidence.observed_process_group_rows) ||
    v1r11CanonicalJson(evidence.observed_process_group_rows) !==
      v1r11CanonicalJson([runnerProcess, assertionHolderProcess]) ||
    !Array.isArray(evidence.observed_yaneuraou_engine_rows) ||
    evidence.observed_yaneuraou_engine_rows.length !== 0
  ) {
    throw new Error("Stage C final LaunchAgent semantic binding differs");
  }
  const launchctlPrint = identity(
    evidence.launchctl_print,
    path.join(context.authorityDirectory, "launchagent-launchctl-print.txt"),
    PRINT_SCHEMA,
    "Stage C launchctl print identity",
  );
  const launchctlStderr = identity(
    evidence.launchctl_stderr,
    path.join(
      context.authorityDirectory,
      "launchagent-launchctl-print.stderr.txt",
    ),
    STDERR_SCHEMA,
    "Stage C launchctl stderr identity",
    true,
  );
  const plistSnapshot = identity(
    evidence.plist_snapshot,
    path.join(context.authorityDirectory, "launchagent.plist.snapshot"),
    PLIST_SCHEMA,
    "Stage C plist snapshot identity",
  );
  const psStdout = identity(
    evidence.ps_stdout,
    path.join(context.authorityDirectory, "launchagent-ps.stdout.txt"),
    PS_STDOUT_SCHEMA,
    "Stage C ps stdout identity",
  );
  const psStderr = identity(
    evidence.ps_stderr,
    path.join(context.authorityDirectory, "launchagent-ps.stderr.txt"),
    PS_STDERR_SCHEMA,
    "Stage C ps stderr identity",
    true,
  );
  const plistSourceValue = object(evidence.plist_source, "Stage C plist source");
  exactKeys(
    plistSourceValue,
    [
      "plist_path",
      "realpath",
      "dev",
      "ino",
      "uid",
      "mode",
      "nlink",
      "bytes",
      "sha256",
    ],
    "Stage C plist source",
  );
  const expectedPlistPath = path.join(
    context.homeDirectory,
    "Library/LaunchAgents",
    `${label}.plist`,
  );
  if (
    plistSourceValue.plist_path !== expectedPlistPath ||
    plistSourceValue.realpath !== expectedPlistPath ||
    integer(plistSourceValue.dev, 1, "Stage C plist dev") < 1 ||
    integer(plistSourceValue.ino, 1, "Stage C plist ino") < 1 ||
    plistSourceValue.uid !== context.expectedUid ||
    plistSourceValue.mode !== 0o600 ||
    plistSourceValue.nlink !== 1 ||
    plistSourceValue.bytes !== plistSnapshot.bytes ||
    plistSourceValue.sha256 !== plistSnapshot.sha256
  ) {
    throw new Error("Stage C plist source binding differs");
  }
  validateProducer(evidence.producer, context.sourceRevision);
  return Object.freeze({
    value: evidence,
    uid: context.expectedUid,
    label,
    runnerPid,
    programArguments,
    runnerUtilityArgv,
    holderPid,
    launchctlPrint,
    launchctlStderr,
    plistSnapshot,
    psCommand: PS_COMMAND,
    psStdout,
    psStderr,
    runnerProcess,
    assertionHolderProcess,
    observedProcessGroupRows: Object.freeze([
      runnerProcess,
      assertionHolderProcess,
    ]),
    observedYaneuraouEngineRows: Object.freeze([]),
    plistSource:
      plistSourceValue as unknown as Halfkp81V1R11StageCParsedLaunchEvidence["plistSource"],
  });
}

function uniqueLaunchctlValue(raw: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const matches = [...raw.matchAll(new RegExp(`^\\t${escaped} = (.+)$`, "gmu"))];
  if (matches.length !== 1 || matches[0]?.[1] === undefined) {
    throw new Error(`Stage C launchctl ${key} differs`);
  }
  return matches[0][1];
}

/** Parses the sealed/live launchctl bytes as semantics, not only as an opaque hash. */
export function validateHalfkp81V1R11StageCLaunchctlForTests(
  raw: string,
  evidence: Readonly<Halfkp81V1R11StageCParsedLaunchEvidence>,
): void {
  if (!raw.startsWith(`gui/${evidence.uid}/${evidence.label} = {\n`)) {
    throw new Error("Stage C launchctl service header differs");
  }
  const argumentsStart = raw.indexOf("\n\targuments = {\n");
  const argumentsEnd = raw.indexOf("\n\t}\n", argumentsStart + 1);
  if (
    argumentsStart < 0 ||
    argumentsEnd < 0 ||
    raw.indexOf("\n\targuments = {\n", argumentsStart + 1) !== -1
  ) {
    throw new Error("Stage C launchctl arguments block differs");
  }
  const arguments_ = raw
    .slice(argumentsStart + "\n\targuments = {\n".length, argumentsEnd)
    .split("\n")
    .map((line) => /^\t\t(.+)$/u.exec(line)?.[1] ?? "");
  const properties = uniqueLaunchctlValue(raw, "properties")
    .split("|")
    .map((value) => value.trim());
  if (
    v1r11CanonicalJson(arguments_) !==
      v1r11CanonicalJson(evidence.programArguments) ||
    uniqueLaunchctlValue(raw, "state") !== "running" ||
    uniqueLaunchctlValue(raw, "type") !== "LaunchAgent" ||
    uniqueLaunchctlValue(raw, "program") !==
      evidence.runnerUtilityArgv[0] ||
    uniqueLaunchctlValue(raw, "path") !== evidence.plistSource.plist_path ||
    uniqueLaunchctlValue(raw, "working directory") !==
      evidence.value.working_directory ||
    uniqueLaunchctlValue(raw, "stdout path") !== evidence.value.stdout_path ||
    uniqueLaunchctlValue(raw, "stderr path") !== evidence.value.stderr_path ||
    uniqueLaunchctlValue(raw, "pid") !== String(evidence.runnerPid) ||
    !properties.includes("runatload") ||
    !properties.includes("launch only once")
  ) {
    throw new Error("Stage C launchctl semantic identity differs");
  }
}

function sha256(raw: Uint8Array): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function validateHalfkp81V1R11StageCRawCapturesForTests(
  evidence: Readonly<Halfkp81V1R11StageCParsedLaunchEvidence>,
  captures: Readonly<{
    sealedLaunchctl: Buffer;
    liveLaunchctl: Buffer;
    sealedLaunchctlStderr: Buffer;
    liveLaunchctlStderr: Buffer;
    sealedPlist: Buffer;
    livePlist: Buffer;
    sealedPsStdout: Buffer;
    sealedPsStderr: Buffer;
  }>,
): void {
  const exactIdentity = (
    raw: Buffer,
    identity: Readonly<V1R11AuthorityFileIdentity>,
  ) =>
    raw.byteLength === identity.bytes && sha256(raw) === identity.sha256;
  if (
    !exactIdentity(captures.sealedLaunchctl, evidence.launchctlPrint) ||
    !exactIdentity(
      captures.sealedLaunchctlStderr,
      evidence.launchctlStderr,
    ) ||
    !exactIdentity(captures.sealedPlist, evidence.plistSnapshot) ||
    !exactIdentity(captures.sealedPsStdout, evidence.psStdout) ||
    !exactIdentity(captures.sealedPsStderr, evidence.psStderr) ||
    captures.sealedPsStderr.byteLength !== 0 ||
    !captures.sealedLaunchctl.equals(captures.liveLaunchctl) ||
    !captures.sealedLaunchctlStderr.equals(captures.liveLaunchctlStderr) ||
    !captures.sealedPlist.equals(captures.livePlist)
  ) {
    throw new Error("Stage C sealed/live raw captures differ");
  }
  const psRows = parseStageCPs(captures.sealedPsStdout);
  const runnerRows = psRows.filter((row) => row.pid === evidence.runnerPid);
  const holderRows = psRows.filter((row) => row.pid === evidence.holderPid);
  const expectedRunner = {
    ...runnerRows[0],
    role: "runner" as const,
  };
  const expectedHolder = {
    ...holderRows[0],
    role: "assertion-holder" as const,
  };
  if (
    runnerRows.length !== 1 ||
    holderRows.length !== 1 ||
    v1r11CanonicalJson(expectedRunner) !==
      v1r11CanonicalJson(evidence.runnerProcess) ||
    v1r11CanonicalJson(expectedHolder) !==
      v1r11CanonicalJson(evidence.assertionHolderProcess) ||
    v1r11CanonicalJson(
      psRows
        .filter((row) => row.pgid === evidence.runnerProcess.pgid)
        .map((row) =>
          row.pid === evidence.runnerPid
            ? { ...row, role: "runner" as const }
            : row.pid === evidence.holderPid
              ? { ...row, role: "assertion-holder" as const }
              : row,
        ),
    ) !== v1r11CanonicalJson(evidence.observedProcessGroupRows) ||
    psRows.some(
      (row) =>
        row.executable === FORMAL_ENGINE_PATH ||
        row.argv === FORMAL_ENGINE_PATH ||
        row.argv.startsWith(`${FORMAL_ENGINE_PATH} `),
    )
  ) {
    throw new Error("Stage C held ps process topology differs");
  }
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

/** Reconstructs the one and only preregistered plist byte policy. */
export function buildHalfkp81V1R11StageCExpectedPlistForTests(
  evidence: Readonly<Halfkp81V1R11StageCParsedLaunchEvidence>,
): Buffer {
  return Buffer.from(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict>",
      "  <key>Label</key>",
      plistString(evidence.label),
      "  <key>ProgramArguments</key>",
      "  <array>",
      ...evidence.programArguments.map(plistString),
      "  </array>",
      "  <key>WorkingDirectory</key>",
      plistString(String(evidence.value.working_directory)),
      "  <key>StandardOutPath</key>",
      plistString(String(evidence.value.stdout_path)),
      "  <key>StandardErrorPath</key>",
      plistString(String(evidence.value.stderr_path)),
      "  <key>RunAtLoad</key>",
      "  <true/>",
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
