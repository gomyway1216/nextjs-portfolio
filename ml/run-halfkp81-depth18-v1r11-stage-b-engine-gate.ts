import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  parseV1R11CanonicalObject,
  readV1R11HeldFile,
  v1r11CanonicalLine,
  v1r11CanonicalJson,
  v1r11Sha256,
  type V1R11AuthorityFileIdentity,
} from "./halfkp81-depth18-v1r11-authority-io";
import {
  parseHalfkp81Depth18PmsetLogRowsForTests,
  startHalfkp81Depth18V1R11PowerContinuitySession,
  type Halfkp81Depth18TeacherFileIdentity,
} from "./halfkp81-depth18-teacher-runner";
import {
  observeHalfkp81V1R11ProcessRowsForTests,
  runHalfkp81V1R11FixedStageBEngineGate,
  type Halfkp81V1R11ProcessRow,
} from "./halfkp81-depth18-v1r11-stage-b-fixed-engine-boundary";
import {
  buildHalfkp81V1R11StageBOneShotPlist,
  parseHalfkp81V1R11StageBLaunchctlPrintForTests,
} from "./halfkp81-depth18-v1r11-stage-b-launchagent-supervisor";
import {
  HALFKP81_V1R11_REQUIRED_ASSERTIONS,
  parseHalfkp81V1R11StageCAssertionsForTests,
} from "./halfkp81-depth18-v1r11-stage-c-live-evidence";

const GATES = Object.freeze([
  "candidate-order-gate",
  "known10-probe",
  "pathological-fallback-probe",
  "mixed-load-gate",
  "formal-like-512",
] as const);
type Gate = (typeof GATES)[number];
const REVISION_RE = /^[0-9a-f]{40}$/u;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const STAGE_A_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-engine-gate-authority-verified-receipt-v1r11";
const FALSE_AUTHORITY = Object.freeze({
  may_execute_preformal_engine_gates: false,
  may_execute_formal_teacher: false,
  may_train: false,
  may_play_formal_games: false,
  may_write_live_weights: false,
});

interface FixedArguments {
  readonly gate: Gate;
  readonly sequence: number;
  readonly fingerprint: string;
  readonly epoch: string;
  readonly stageAPath: string;
}

function argument(argv: readonly string[], name: string): string {
  const index = argv.indexOf(name);
  const value = argv[index + 1];
  if (index < 0 || value === undefined || value.startsWith("--")) {
    throw new Error(`fixed Stage-B argument ${name} differs`);
  }
  return value;
}

function parseArguments(argv: readonly string[]): Readonly<FixedArguments> {
  const gate = argument(argv, "--gate") as Gate;
  const sequence = Number(argument(argv, "--sequence"));
  const fingerprint = argument(argv, "--stage-b-run-fingerprint");
  const epoch = argument(argv, "--stage-b-epoch-namespace");
  const stageAPath = argument(argv, "--stage-a-receipt");
  if (
    !GATES.includes(gate) ||
    !Number.isSafeInteger(sequence) ||
    sequence !== GATES.indexOf(gate) + 8 ||
    !SHA256_RE.test(fingerprint) ||
    !path.isAbsolute(epoch) ||
    path.normalize(epoch) !== epoch ||
    !epoch.endsWith(
      `${String(sequence).padStart(2, "0")}-${gate}.stage-b-epoch`,
    ) ||
    !path.isAbsolute(stageAPath) ||
    path.normalize(stageAPath) !== stageAPath ||
    path.basename(stageAPath) !==
      "preformal-engine-gate-authority-verified-receipt.json"
  ) {
    throw new Error("fixed Stage-B execution context differs");
  }
  return Object.freeze({ gate, sequence, fingerprint, epoch, stageAPath });
}

function privateJob(
  input: Readonly<FixedArguments>,
): Readonly<{
  label: string;
  directory: string;
  plistPath: string;
  stdoutPath: string;
  stderrPath: string;
}> {
  const authorityDirectory = path.dirname(input.stageAPath);
  if (
    input.epoch !==
    path.join(
      authorityDirectory,
      "preformal-gates",
      `${String(input.sequence).padStart(2, "0")}-${input.gate}.stage-b-epoch`,
    )
  ) {
    throw new Error("fixed Stage-B authority/epoch namespace differs");
  }
  const label = `com.meetyudai.shogi.v1r11-stage-b-${String(input.sequence).padStart(2, "0")}-${input.gate}-${input.fingerprint.slice(0, 12)}`;
  const directory = path.join(
    path.dirname(authorityDirectory),
    ".halfkp81-depth18-yaneura-only-v1r11-stage-b-private",
    `${String(input.sequence).padStart(2, "0")}-${input.gate}-${input.fingerprint}`,
  );
  return Object.freeze({
    label,
    directory,
    plistPath: path.join(directory, `${label}.plist`),
    stdoutPath: path.join(directory, `${label}.stdout`),
    stderrPath: path.join(directory, `${label}.stderr`),
  });
}

function exactFileIdentity(
  pathname: string,
  raw: Buffer,
  schema: string,
): Readonly<Halfkp81Depth18TeacherFileIdentity> &
  Readonly<{
    dev: number;
    ino: number;
    uid: number;
    mode: number;
    nlink: 1;
  }> {
  const metadata = fs.lstatSync(pathname);
  const euid = process.geteuid?.();
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.nlink !== 1 ||
    metadata.size !== raw.byteLength ||
    metadata.uid !== euid ||
    fs.realpathSync.native(pathname) !== pathname
  ) {
    throw new Error("fixed Stage-B held file identity differs");
  }
  return Object.freeze({
    path: pathname,
    bytes: raw.byteLength,
    sha256: v1r11Sha256(raw),
    schema,
    dev: metadata.dev,
    ino: metadata.ino,
    uid: metadata.uid,
    mode: metadata.mode & 0o7777,
    nlink: 1 as const,
  });
}

export function buildHalfkp81V1R11StageBChildLaunchEvidenceForTests(
  input: Readonly<{
    gate: Gate;
    sequence: number;
    fingerprint: string;
    epoch: string;
    stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
    label: string;
    uid: number;
    repositoryRoot: string;
    stdoutPath: string;
    stderrPath: string;
    runnerUtilityArgv: readonly string[];
    runner: Readonly<Halfkp81V1R11ProcessRow>;
    holder: Readonly<Halfkp81V1R11ProcessRow>;
    launchctlStdout: Buffer;
    launchctlStderr: Buffer;
    plistRaw: Buffer;
    plistSource: Readonly<Record<string, unknown>>;
    assertionsRaw: string;
  }>,
): Readonly<Record<string, unknown>> {
  const programArguments = Object.freeze([
    "/usr/bin/caffeinate",
    "-dimsu",
    ...input.runnerUtilityArgv,
  ]);
  const parsedLaunchctl =
    parseHalfkp81V1R11StageBLaunchctlPrintForTests(
      {
        status: 0,
        signal: null,
        stdout: input.launchctlStdout,
        stderr: input.launchctlStderr,
      },
      input.label,
      input.uid,
    );
  const expectedPlist = buildHalfkp81V1R11StageBOneShotPlist({
    label: input.label,
    workingDirectory: input.repositoryRoot,
    stdoutPath: input.stdoutPath,
    stderrPath: input.stderrPath,
    utilityArgv: input.runnerUtilityArgv,
  });
  if (
    parsedLaunchctl.state !== "running" ||
    parsedLaunchctl.pid !== input.runner.pid ||
    input.runner.pgid !== input.runner.pid ||
    input.runner.command !== input.runnerUtilityArgv.join(" ") ||
    input.holder.ppid !== input.runner.pid ||
    input.holder.pgid !== input.runner.pgid ||
    input.holder.command !==
      `/usr/bin/caffeinate -dimsu ${input.runner.command}` ||
    !input.plistRaw.equals(expectedPlist) ||
    v1r11CanonicalJson(
      parseHalfkp81V1R11StageCAssertionsForTests(
        input.assertionsRaw,
        input.holder.pid,
      ),
    ) !== v1r11CanonicalJson(HALFKP81_V1R11_REQUIRED_ASSERTIONS)
  ) {
    throw new Error("fixed Stage-B child LaunchAgent evidence differs");
  }
  return Object.freeze({
    schema: `shogi-halfkp81-depth18-yaneura-only-v1r11-${input.gate}-stage-b-launchagent-evidence-v1`,
    status:
      "preformal-engine-gate-live-LaunchAgent-semantics-verified-no-standalone-authority",
    gate: input.gate,
    stage_b_run_fingerprint: input.fingerprint,
    stage_b_epoch_namespace: input.epoch,
    stage_a_verified_receipt: input.stageAReceipt,
    label: input.label,
    uid: input.uid,
    xpc_service_name: input.label,
    runner_pid: input.runner.pid,
    working_directory: input.repositoryRoot,
    stdout_path: input.stdoutPath,
    stderr_path: input.stderrPath,
    program_arguments: programArguments,
    runner_utility_argv: input.runnerUtilityArgv,
    caffeinate_holder: Object.freeze({
      pid: input.holder.pid,
      parent_runner_pid: input.runner.pid,
      assertion_owner_pid: input.holder.pid,
      executable: "/usr/bin/caffeinate",
      argv: programArguments,
    }),
    required_assertions: HALFKP81_V1R11_REQUIRED_ASSERTIONS,
    launchctl_command: Object.freeze([
      "/bin/launchctl",
      "print",
      `gui/${input.uid}/${input.label}`,
    ]),
    launchctl_exit_code: 0,
    launchctl_stdout_base64: input.launchctlStdout.toString("base64"),
    launchctl_stderr_base64: input.launchctlStderr.toString("base64"),
    plist_source: input.plistSource,
    plist_snapshot_base64: input.plistRaw.toString("base64"),
    authority: FALSE_AUTHORITY,
  });
}

function publishPrivateCanonical(
  pathname: string,
  value: Readonly<Record<string, unknown>>,
  schema: string,
): Readonly<Halfkp81Depth18TeacherFileIdentity> {
  const raw = v1r11CanonicalLine(value);
  const handle = fs.openSync(
    pathname,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      (fs.constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    fs.writeFileSync(handle, raw);
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  const directory = fs.openSync(path.dirname(pathname), fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(directory);
  } finally {
    fs.closeSync(directory);
  }
  const identity = exactFileIdentity(pathname, raw, schema);
  return Object.freeze({
    path: identity.path,
    bytes: identity.bytes,
    sha256: identity.sha256,
    schema,
  });
}

async function captureLaunchEvidence(
  input: Readonly<FixedArguments>,
  stageAReceipt: Readonly<V1R11AuthorityFileIdentity>,
): Promise<
  Readonly<{
    evidence: Readonly<Record<string, unknown>>;
    identity: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  }>
> {
  const job = privateJob(input);
  const uid = process.geteuid?.();
  if (
    !Number.isSafeInteger(uid) ||
    Number(uid) < 1 ||
    process.env.XPC_SERVICE_NAME !== job.label
  ) {
    throw new Error("fixed Stage-B child XPC identity differs");
  }
  const utilityArgv = Object.freeze([
    process.execPath,
    ...process.execArgv,
    ...process.argv.slice(1),
  ]);
  const rows = observeHalfkp81V1R11ProcessRowsForTests();
  const runner = rows.find((row) => row.pid === process.pid);
  const holder = rows.find(
    (row) =>
      row.ppid === process.pid &&
      row.command ===
        `/usr/bin/caffeinate -dimsu ${utilityArgv.join(" ")}`,
  );
  if (runner === undefined || holder === undefined) {
    throw new Error("fixed Stage-B child process topology differs");
  }
  const launchctl = spawnSync(
    "/bin/launchctl",
    ["print", `gui/${String(uid)}/${job.label}`],
    { encoding: null, stdio: ["ignore", "pipe", "pipe"] },
  );
  if (
    launchctl.error !== undefined ||
    launchctl.status !== 0 ||
    launchctl.signal !== null ||
    !Buffer.isBuffer(launchctl.stdout) ||
    !Buffer.isBuffer(launchctl.stderr)
  ) {
    throw new Error("fixed Stage-B child launchctl capture differs");
  }
  const plistRaw = await readV1R11HeldFile(
    job.plistPath,
    "fixed Stage-B child plist",
  );
  const plistFullIdentity = exactFileIdentity(
    job.plistPath,
    plistRaw,
    "shogi-halfkp81-depth18-v1r11-stage-b-one-shot-plist-v1",
  );
  const { schema: _plistSchema, ...plistSource } = plistFullIdentity;
  void _plistSchema;
  const assertionsRaw = execFileSync(
    "/usr/bin/pmset",
    ["-g", "assertions"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const evidence = buildHalfkp81V1R11StageBChildLaunchEvidenceForTests({
    gate: input.gate,
    sequence: input.sequence,
    fingerprint: input.fingerprint,
    epoch: input.epoch,
    stageAReceipt,
    label: job.label,
    uid: Number(uid),
    repositoryRoot: fs.realpathSync.native(path.resolve(__dirname, "..")),
    stdoutPath: job.stdoutPath,
    stderrPath: job.stderrPath,
    runnerUtilityArgv: utilityArgv,
    runner,
    holder,
    launchctlStdout: launchctl.stdout,
    launchctlStderr: launchctl.stderr,
    plistRaw,
    plistSource,
    assertionsRaw,
  });
  const identity = publishPrivateCanonical(
    path.join(job.directory, "child-launchagent-evidence.json"),
    evidence,
    String(evidence.schema),
  );
  return Object.freeze({ evidence, identity });
}

export async function runHalfkp81V1R11FixedStageBChildCoreForTests(
  argv: readonly string[],
): Promise<Readonly<Record<string, unknown>>> {
  const input = parseArguments(argv);
  const stageARaw = await readV1R11HeldFile(
    input.stageAPath,
    "fixed Stage-B Stage-A receipt",
  );
  const stageA = parseV1R11CanonicalObject(
    stageARaw,
    "fixed Stage-B Stage-A receipt",
  );
  const teacherPlan = stageA.teacher_plan as Readonly<Halfkp81Depth18TeacherFileIdentity>;
  const sourceRevision = String(stageA.source_revision);
  if (
    stageA.schema !== STAGE_A_SCHEMA ||
    !REVISION_RE.test(sourceRevision) ||
    teacherPlan === null ||
    typeof teacherPlan !== "object" ||
    !SHA256_RE.test(String(teacherPlan.sha256))
  ) {
    throw new Error("fixed Stage-B Stage-A receipt semantics differ");
  }
  const stageAIdentity = Object.freeze({
    path: input.stageAPath,
    bytes: stageARaw.byteLength,
    sha256: v1r11Sha256(stageARaw),
    schema: STAGE_A_SCHEMA,
  });
  const launch = await captureLaunchEvidence(input, stageAIdentity);
  const job = privateJob(input);
  const powerDirectory = path.join(job.directory, "child-power");
  fs.mkdirSync(powerDirectory, { mode: 0o700 });
  const power = await startHalfkp81Depth18V1R11PowerContinuitySession({
    teacherPlan,
    sourceRevision,
    runFingerprint: input.fingerprint,
    launchAgentAuthority: launch.identity,
    inlineLaunchAgentEvidence: launch.evidence,
    preformalAuthority: stageAIdentity,
    ledgerPath: path.join(powerDirectory, "power-continuity.jsonl"),
    receiptPath: path.join(powerDirectory, "power-continuity-receipt.json"),
  });
  try {
    await power.assertHealthy(true);
    if (!Number.isSafeInteger(power.guardianPid) || Number(power.guardianPid) < 1) {
      throw new Error("fixed Stage-B power guardian PID differs");
    }
    const fixed = await runHalfkp81V1R11FixedStageBEngineGate(
      input.gate,
      teacherPlan,
      sourceRevision,
      Number(power.guardianPid),
      power,
      power.failure,
      input.gate === "formal-like-512"
        ? Object.freeze({
            outputDirectory: path.join(
              job.directory,
              "formal-like-512-artifacts",
            ),
            runFingerprint: input.fingerprint,
          })
        : undefined,
    );
    await power.assertHealthy(true);
    const sealedPower = await power.finalizeSuccess();
    await power.close();
    const ledgerRaw = await readV1R11HeldFile(
      sealedPower.ledger.path,
      "fixed Stage-B power ledger",
    );
    const powerEntries = Object.freeze(
      ledgerRaw
        .toString("utf8")
        .trimEnd()
        .split("\n")
        .map((line) => {
          const value = JSON.parse(line) as Readonly<Record<string, unknown>>;
          if (v1r11CanonicalJson(value) !== line) {
            throw new Error("fixed Stage-B power ledger is not canonical");
          }
          return Object.freeze(value);
        }),
    );
    const receiptRaw = await readV1R11HeldFile(
      sealedPower.receipt.path,
      "fixed Stage-B power receipt",
    );
    const powerReceipt = parseV1R11CanonicalObject(
      receiptRaw,
      "fixed Stage-B power receipt",
    );
    const pmsetRows = parseHalfkp81Depth18PmsetLogRowsForTests(
      execFileSync("/usr/bin/pmset", ["-g", "log"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    const pmsetRaw = Buffer.from(`${pmsetRows.join("\n")}\n`, "utf8");
    return Object.freeze({
      schema:
        "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-fixed-executor-result-v1",
      status: "completed-no-formal-authority",
      gate: input.gate,
      sequence: input.sequence,
      stage_b_run_fingerprint: input.fingerprint,
      stage_b_epoch_namespace: input.epoch,
      stage_a_verified_receipt: stageAIdentity,
      gate_result: fixed.gate_result,
      launchagent_evidence: launch.evidence,
      power_entries: powerEntries,
      pmset_interval: Object.freeze({
        start_anchor: powerReceipt.pmset_start_anchor,
        end_anchor: powerReceipt.pmset_end_anchor,
        raw_log_base64: pmsetRaw.toString("base64"),
        raw_log_bytes: pmsetRaw.byteLength,
        raw_log_sha256: v1r11Sha256(pmsetRaw),
      }),
      verifier: Object.freeze({
        schema:
          "shogi-halfkp81-depth18-v1r11-stage-b-child-power-capture-v1",
        status: "guardian-sealed-and-held-reread",
        guardian_pid: power.guardianPid,
        power_ledger: sealedPower.ledger,
        power_receipt: sealedPower.receipt,
        entries: powerEntries.length,
      }),
      process_cleanup: fixed.process_cleanup,
      os_reap_evidence: fixed.os_reap_evidence,
    });
  } catch (error) {
    await power.close().catch(() => undefined);
    throw error;
  }
}

async function main(): Promise<void> {
  const result = await runHalfkp81V1R11FixedStageBChildCoreForTests(
    process.argv.slice(2),
  );
  process.stdout.write(v1r11CanonicalLine(result));
}

if (require.main === module) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[v1r11-stage-b-fixed] STOP: ${message}\n`);
    process.exitCode = 1;
  });
}
