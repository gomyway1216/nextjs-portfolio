import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildHalfkp81V1R11PlannedLaunchAgentPlistForTests } from "../../../ml/prepare-halfkp81-depth18-v1r11-planned-launchagent";
import {
  buildHalfkp81V1R11StageCExpectedPlistForTests,
  HALFKP81_V1R11_FINAL_LAUNCHAGENT_SCHEMA,
  HALFKP81_V1R11_FINAL_LAUNCHAGENT_STATUS,
  HALFKP81_V1R11_REQUIRED_ASSERTIONS,
  parseHalfkp81V1R11StageCAssertionsForTests,
  parseHalfkp81V1R11StageCBatteryForTests,
  publishHalfkp81V1R11ModernLaunchEvidenceForTests,
  validateHalfkp81V1R11StageCLaunchctlForTests,
  validateHalfkp81V1R11StageCLaunchEvidenceForTests,
  validateHalfkp81V1R11StageCRawCapturesForTests,
} from "../../../ml/halfkp81-depth18-v1r11-stage-c-live-evidence";
import {
  authenticateHalfkp81V1R11StageCHandoffBeforeAppendForTests,
  halfkp81V1R11StageCTerminalFaultMessageForTests,
  halfkp81V1R11StageCLatestReceiptForTests,
  recoverHalfkp81V1R11StageCArtifactProgressForTests,
  resolveHalfkp81V1R11StageCHomeDirectoryForTests,
} from "../../../ml/produce-halfkp81-depth18-v1r11-stage-bc";
import {
  createV1R11AuthorityDirectory,
  publishV1R11CreateOnlyBytes,
  v1r11CanonicalLine,
  v1r11CanonicalJson,
  v1r11Sha256,
} from "../../../ml/halfkp81-depth18-v1r11-authority-io";
import { halfkp81V1R11FormalRunFingerprintV2 } from "../../../ml/halfkp81-depth18-v1r11-formal-run-intent";

const roots: string[] = [];

function mismatchedFormalRunIntent(
  teacherPlan: Readonly<Record<string, unknown>>,
  plannedFinalDescriptor: Readonly<Record<string, unknown>>,
) {
  const identity = (name: string, schema: string, seed: string) => ({
    path: `/private/formal-intent/${name}`,
    bytes: 10,
    sha256: seed.repeat(64),
    schema,
  });
  return {
    teacherPlan,
    selectionJsonl: {
      ...identity("selection.jsonl", "halfkp81-depth18-hard-parent-v2", "1"),
      rows: 8_192,
    },
    selectionManifest: identity(
      "selection-manifest.json",
      "halfkp81-depth18-hard-parent-selection-manifest-v2",
      "2",
    ),
    sourceRevision: "b".repeat(40),
    engine: {
      binary: identity(
        "yaneuraou",
        "application/x-mach-o-executable-exact-bytes",
        "3",
      ),
      evalFile: identity(
        "nn.bin",
        "application/octet-stream-exact-bytes",
        "4",
      ),
      receipt: identity("receipt.json", "engine-receipt-v1", "5"),
    },
    teacherContract: { depth: 18 },
    candidateContract: { mode: "multipv12" },
    plannedFinalDescriptor,
  };
}

afterEach(() => {
  while (roots.length > 0) {
    fs.rmSync(roots.pop()!, { force: true, recursive: true });
  }
});

function identity(pathname: string, raw: Buffer, schema: string) {
  return {
    path: pathname,
    bytes: raw.byteLength,
    sha256: createHash("sha256").update(raw).digest("hex"),
    schema,
  };
}

function fixture() {
  const repositoryRoot = "/private/repository";
  const authorityDirectory = "/private/authority";
  const homeDirectory = "/Users/stage-c";
  const expectedNodePath = "/private/node";
  const sourceRevision = "b".repeat(40);
  const runFingerprint = "c".repeat(64);
  const uid = 501;
  const label =
    "com.meetyudai.shogi.halfkp81-depth18-yaneura-only-v1r11-bbbbbbbb";
  const stdoutPath = `${authorityDirectory}/formal.stdout.log`;
  const stderrPath = `${authorityDirectory}/formal.stderr.log`;
  const plistPath = `${homeDirectory}/Library/LaunchAgents/${label}.plist`;
  const runnerUtilityArgv = [
    expectedNodePath,
    "-r",
    `${repositoryRoot}/node_modules/tsx/dist/cjs/index.cjs`,
    `${repositoryRoot}/ml/run-halfkp81-depth18-v1r11-formal-child.ts`,
  ];
  const programArguments = runnerUtilityArgv;
  const holderArguments = [
    "/usr/bin/caffeinate",
    "-dimsu",
    "-w",
    "700",
  ];
  const plist = buildHalfkp81V1R11PlannedLaunchAgentPlistForTests({
      label,
      repositoryRoot,
      nodePath: expectedNodePath,
      stdoutPath,
      stderrPath,
    }).bytes;
  const launchctl = [
    `gui/${uid}/${label} = {`,
    "\tactive count = 1",
    `\tpath = ${plistPath}`,
    "\ttype = LaunchAgent",
    "\tstate = running",
    "",
    `\tprogram = ${expectedNodePath}`,
    "\targuments = {",
    ...programArguments.map((value) => `\t\t${value}`),
    "\t}",
    "",
    `\tworking directory = ${repositoryRoot}`,
    `\tstdout path = ${stdoutPath}`,
    `\tstderr path = ${stderrPath}`,
    "\tpid = 700",
    "\tproperties = runatload | launch only once | inferred program",
    "}",
    "",
  ].join("\n");
  const teacherPlan = {
    path: `${authorityDirectory}/teacher-plan.json`,
    bytes: 10,
    sha256: "a".repeat(64),
    schema: "teacher-plan",
  };
  const runnerProcess = {
    pid: 700,
    ppid: 1,
    pgid: 700,
    lstart: "Sun Aug  2 12:00:00 2026",
    executable: expectedNodePath,
    argv: runnerUtilityArgv.join(" "),
    role: "runner",
  } as const;
  const assertionHolderProcess = {
    pid: 701,
    ppid: 700,
    pgid: 700,
    lstart: "Sun Aug  2 12:00:01 2026",
    executable: "/usr/bin/caffeinate",
    argv: holderArguments.join(" "),
    role: "assertion-holder",
  } as const;
  const ps = Buffer.from(
    [
      `  700     1   700 ${runnerProcess.lstart} ${runnerProcess.argv}`,
      `  701   700   700 ${assertionHolderProcess.lstart} ${assertionHolderProcess.argv}`,
      "",
    ].join("\n"),
    "utf8",
  );
  const evidence = {
    schema: HALFKP81_V1R11_FINAL_LAUNCHAGENT_SCHEMA,
    status: HALFKP81_V1R11_FINAL_LAUNCHAGENT_STATUS,
    teacher_plan: teacherPlan,
    source_revision: sourceRevision,
    run_fingerprint: runFingerprint,
    observed_at_utc: "2026-08-02T12:00:00.000Z",
    uid,
    xpc_service_name: label,
    label,
    runner_pid: 700,
    working_directory: repositoryRoot,
    stdout_path: stdoutPath,
    stderr_path: stderrPath,
    program_arguments: programArguments,
    runner_utility_argv: runnerUtilityArgv,
    caffeinate_holder: {
      pid: 701,
      parent_runner_pid: 700,
      assertion_owner_pid: 701,
      executable: "/usr/bin/caffeinate",
      argv: holderArguments,
    },
    required_assertions: HALFKP81_V1R11_REQUIRED_ASSERTIONS,
    launchctl_command: [
      "/bin/launchctl",
      "print",
      `gui/${uid}/${label}`,
    ],
    launchctl_exit_code: 0,
    launchctl_print: identity(
      `${authorityDirectory}/launchagent-launchctl-print.txt`,
      Buffer.from(launchctl, "utf8"),
      "text/plain-utf8-exact-command-stdout",
    ),
    launchctl_stderr: identity(
      `${authorityDirectory}/launchagent-launchctl-print.stderr.txt`,
      Buffer.alloc(0),
      "text/plain-utf8-exact-command-stderr",
    ),
    plist_source: {
      plist_path: plistPath,
      realpath: plistPath,
      dev: 1,
      ino: 2,
      uid,
      mode: 0o600,
      nlink: 1,
      bytes: plist.byteLength,
      sha256: v1r11Sha256(plist),
    },
    plist_snapshot: identity(
      `${authorityDirectory}/launchagent.plist.snapshot`,
      plist,
      "application/x-apple-aspen-config-exact-bytes",
    ),
    ps_command: [
      "/bin/ps",
      "-ww",
      "-axo",
      "pid=,ppid=,pgid=,lstart=,command=",
    ],
    ps_exit_code: 0,
    ps_stdout: identity(
      `${authorityDirectory}/launchagent-ps.stdout.txt`,
      ps,
      "text/plain-exact-launchagent-ps-stdout",
    ),
    ps_stderr: identity(
      `${authorityDirectory}/launchagent-ps.stderr.txt`,
      Buffer.alloc(0),
      "text/plain-exact-launchagent-ps-stderr",
    ),
    runner_process: runnerProcess,
    assertion_holder_process: assertionHolderProcess,
    observed_process_group_rows: [runnerProcess, assertionHolderProcess],
    observed_yaneuraou_engine_rows: [],
    producer: {
      source_revision: sourceRevision,
      entrypoint: "ml/halfkp81-depth18-v1r11-stage-c-live-evidence.ts",
      dependency_closure: [
        {
          path: "ml/halfkp81-depth18-v1r11-stage-c-live-evidence.ts",
          bytes: 1,
          sha256: "d".repeat(64),
        },
        { path: "ml/z.ts", bytes: 1, sha256: "e".repeat(64) },
      ],
    },
  };
  const context = {
    repositoryRoot,
    authorityDirectory,
    homeDirectory,
    expectedUid: uid,
    sourceRevision,
    runFingerprint,
    teacherPlan,
    expectedNodePath,
  };
  return { context, evidence, launchctl, plist, ps };
}

describe("HalfKP81 v1r11 Stage C live evidence", () => {
  it("self-publishes modern engine-zero evidence without republishing the planned plist", async () => {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "v1r11-modern-evidence-")),
    );
    roots.push(root);
    const homeDirectory = path.join(root, "home");
    const repositoryRoot = path.join(root, "repository");
    const authorityPath = path.join(root, "authority");
    fs.mkdirSync(path.join(homeDirectory, "Library/LaunchAgents"), {
      recursive: true,
      mode: 0o700,
    });
    fs.mkdirSync(repositoryRoot, { mode: 0o700 });
    const authorityDirectory = await createV1R11AuthorityDirectory(authorityPath);
    const sourceRevision = "b".repeat(40);
    const label =
      "com.meetyudai.shogi.halfkp81-depth18-yaneura-only-v1r11-bbbbbbbb";
    const nodePath = "/private/node";
    const stdoutPath = path.join(
      homeDirectory,
      ".codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11/formal-launchagent.stdout.log",
    );
    const stderrPath = path.join(
      homeDirectory,
      ".codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11/formal-launchagent.stderr.log",
    );
    const planned = buildHalfkp81V1R11PlannedLaunchAgentPlistForTests({
      label,
      repositoryRoot,
      nodePath,
      stdoutPath,
      stderrPath,
    });
    const plistPath = path.join(
      homeDirectory,
      "Library/LaunchAgents",
      `${label}.plist`,
    );
    fs.writeFileSync(plistPath, planned.bytes, { mode: 0o600 });
    const plannedPlist = await publishV1R11CreateOnlyBytes(
      authorityDirectory,
      path.join(authorityPath, "launchagent.plist.snapshot"),
      planned.bytes,
      "application/x-apple-aspen-config-exact-bytes",
    );
    const teacherPlan = Object.freeze({
      path: path.join(root, "teacher-plan.json"),
      bytes: 10,
      sha256: "a".repeat(64),
      schema: "teacher-plan-v1r11",
    });
    const formalRunIntent = mismatchedFormalRunIntent(
      teacherPlan,
      plannedPlist,
    );
    const runFingerprint = halfkp81V1R11FormalRunFingerprintV2(
      formalRunIntent,
    );
    const runnerArgv = [
      nodePath,
      "-r",
      `${repositoryRoot}/node_modules/tsx/dist/cjs/index.cjs`,
      `${repositoryRoot}/ml/run-halfkp81-depth18-v1r11-formal-child.ts`,
    ];
    const programArguments = runnerArgv;
    const holderArguments = ["/usr/bin/caffeinate", "-dimsu", "-w", "700"];
    const launchctlStdout = Buffer.from(
      [
        `gui/501/${label} = {`,
        "\tactive count = 1",
        `\tpath = ${plistPath}`,
        "\ttype = LaunchAgent",
        "\tstate = running",
        "",
        `\tprogram = ${nodePath}`,
        "\targuments = {",
        ...programArguments.map((value) => `\t\t${value}`),
        "\t}",
        "",
        `\tworking directory = ${repositoryRoot}`,
        `\tstdout path = ${stdoutPath}`,
        `\tstderr path = ${stderrPath}`,
        "\tpid = 700",
        "\tproperties = runatload | launch only once | inferred program",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    const psStdout = Buffer.from(
      [
        `  700     1   700 Sun Aug  2 12:00:00 2026 ${runnerArgv.join(" ")}`,
        `  701   700   700 Sun Aug  2 12:00:01 2026 ${holderArguments.join(" ")}`,
        "",
      ].join("\n"),
      "utf8",
    );
    const pmsetAssertions = [
      "Assertion status system-wide:",
      "   PreventUserIdleDisplaySleep    1",
      "   PreventSystemSleep             1",
      "   PreventUserIdleSystemSleep     1",
      "Listed by owning process:",
      "   pid 701(caffeinate): [0x00000001] 00:00:01 PreventSystemSleep named: 'caffeinate command-line tool'",
      "   pid 701(caffeinate): [0x00000003] 00:00:01 PreventUserIdleSystemSleep named: 'caffeinate command-line tool'",
      "   pid 701(caffeinate): [0x00000004] 00:00:01 PreventUserIdleDisplaySleep named: 'caffeinate command-line tool'",
    ].join("\n");
    const published = await publishHalfkp81V1R11ModernLaunchEvidenceForTests({
      repositoryRoot,
      authorityDirectory,
      homeDirectory,
      uid: 501,
      nodePath,
      runnerPid: 700,
      xpcServiceName: label,
      teacherPlan,
      sourceRevision,
      runFingerprint,
      formalRunIntent,
      plannedPlist,
      producer: {
        source_revision: sourceRevision,
        entrypoint: "ml/halfkp81-depth18-v1r11-stage-c-live-evidence.ts",
        dependency_closure: [
          {
            path: "ml/halfkp81-depth18-v1r11-stage-c-live-evidence.ts",
            bytes: 1,
            sha256: "d".repeat(64),
          },
        ],
      },
      capture: {
        launchctlStdout,
        launchctlStderr: Buffer.alloc(0),
        psStdout,
        psStderr: Buffer.alloc(0),
        pmsetAssertions,
        observedAtUtc: "2026-08-02T12:00:00.000Z",
      },
    });
    expect(published.path).toBe(
      path.join(authorityPath, "launchagent-authority-evidence.json"),
    );
    expect(fs.readFileSync(plannedPlist.path)).toEqual(planned.bytes);
  });
  it("derives the LaunchAgent home from Darwin passwd and rejects forged HOME", () => {
    const home = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "v1r11-stage-c-home-")),
    );
    roots.push(home);
    const uid = process.geteuid?.();
    expect(Number.isSafeInteger(uid)).toBe(true);
    const passwd = Buffer.from(
      `stage-c:********:${String(uid)}:20::0:0:Stage C:${home}:/bin/zsh\n`,
      "utf8",
    );
    expect(
      resolveHalfkp81V1R11StageCHomeDirectoryForTests(
        passwd,
        home,
        Number(uid),
      ),
    ).toBe(home);
    expect(() =>
      resolveHalfkp81V1R11StageCHomeDirectoryForTests(
        passwd,
        `${home}-forged`,
        Number(uid),
      ),
    ).toThrow(/passwd semantics or HOME differs/u);
  });

  it("reauthenticates gate 12 receipt semantics and ledger suffix immediately before append", async () => {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "v1r11-stage-c-handoff-")),
    );
    roots.push(root);
    const teacherPlan = Object.freeze({
      path: path.join(root, "plan.json"),
      bytes: 1,
      sha256: "1".repeat(64),
      schema:
        "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11",
    });
    const stageA = Object.freeze({
      path: path.join(root, "stage-a.json"),
      bytes: 1,
      sha256: "2".repeat(64),
      schema:
        "shogi-halfkp81-depth18-yaneura-only-preformal-engine-gate-authority-verified-receipt-v1r11",
    });
    const producer = Object.freeze({ fixed: "producer" });
    const fileIdentity = (pathname: string, raw: Buffer, schema: string) => {
      fs.writeFileSync(pathname, raw, { mode: 0o600, flag: "wx" });
      return Object.freeze({
        path: pathname,
        bytes: raw.byteLength,
        sha256: v1r11Sha256(raw),
        schema,
      });
    };
    const priorReceipt = Object.freeze({
      path: path.join(root, "11.receipt.json"),
      bytes: 1,
      sha256: "3".repeat(64),
      schema:
        "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11",
    });
    const artifactReceipt = Object.freeze({
      path: path.join(root, "artifact.json"),
      bytes: 1,
      sha256: "4".repeat(64),
      schema: "artifact-verified-v1",
    });
    const powerLedger = Object.freeze({
      path: path.join(root, "power.jsonl"),
      bytes: 1,
      sha256: "5".repeat(64),
      schema: "power-ledger-v1",
    });
    const powerReceipt = Object.freeze({
      path: path.join(root, "power-receipt.json"),
      bytes: 1,
      sha256: "6".repeat(64),
      schema: "power-receipt-v1",
    });
    const evidenceSchema =
      "shogi-halfkp81-depth18-yaneura-only-v1r11-formal-like-512-evidence-v1";
    const evidenceValue = Object.freeze({
      schema: evidenceSchema,
      status: "pass",
      gate: "formal-like-512",
      sequence: 12,
      teacher_plan: teacherPlan,
      source_revision: "a".repeat(40),
      run_fingerprint: "b".repeat(64),
      producer,
      primary_sources: Object.freeze([artifactReceipt, powerLedger, powerReceipt]),
      payload: Object.freeze({
        parents: 512,
        completed_parents: 512,
        technical_faults: 0,
        teacher_contract_equal_formal: true,
        power_semantics_equal_formal: true,
        run_specific_identity_fields_excluded_from_equality: Object.freeze([
          "pid",
        ]),
        artifact_verified_receipt: artifactReceipt,
        stage_a_verified_receipt: stageA,
        stage_b_power_ledger: powerLedger,
        stage_b_power_receipt: powerReceipt,
      }),
      produced_at_utc: "2026-08-02T00:00:00.000Z",
    });
    const evidence = fileIdentity(
      path.join(root, "12.evidence.json"),
      v1r11CanonicalLine(evidenceValue),
      evidenceSchema,
    );
    const receiptSchema =
      "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11";
    const receiptValue = Object.freeze({
      schema: receiptSchema,
      status: "pass-no-formal-authority",
      gate: "formal-like-512",
      sequence: 12,
      teacher_plan: teacherPlan,
      source_revision: "a".repeat(40),
      run_fingerprint: "b".repeat(64),
      previous_gate_receipt_sha256: priorReceipt.sha256,
      evidence,
      producer,
      authority: Object.freeze({
        may_execute_preformal_engine_gates: false,
        may_execute_formal_teacher: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      }),
    });
    const receipt = fileIdentity(
      path.join(root, "12.receipt.json"),
      v1r11CanonicalLine(receiptValue),
      receiptSchema,
    );
    const row = (
      sequence: number,
      gate: string,
      previous: string | null,
      gateReceipt: typeof receipt,
    ) => {
      const preimage = Object.freeze({
        schema:
          "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11",
        sequence,
        gate,
        previous_entry_sha256: previous,
        teacher_plan: teacherPlan,
        source_revision: "a".repeat(40),
        run_fingerprint: "b".repeat(64),
        gate_evidence: evidence,
        gate_receipt: gateReceipt,
        status: "pass-no-formal-authority",
        producer,
      });
      return Object.freeze({
        ...preimage,
        entry_sha256: v1r11Sha256(
          `shogi-halfkp81-depth18-v1r11-preformal-authority-ledger-entry-v1\0${v1r11CanonicalJson(preimage)}`,
        ),
      });
    };
    // Build a canonical 12-row chain; only rows 11/12 carry Stage-C handoff
    // semantics, while earlier rows preserve the cryptographic predecessor.
    const rows: Readonly<Record<string, unknown>>[] = [];
    let previous: string | null = null;
    for (let sequence = 1; sequence <= 10; sequence += 1) {
      const preimage = Object.freeze({
        schema:
          "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11",
        sequence,
        gate: `gate-${sequence}`,
        previous_entry_sha256: previous,
        gate_receipt: priorReceipt,
      });
      const value = Object.freeze({
        ...preimage,
        entry_sha256: v1r11Sha256(
          `shogi-halfkp81-depth18-v1r11-preformal-authority-ledger-entry-v1\0${v1r11CanonicalJson(preimage)}`,
        ),
      });
      rows.push(value);
      previous = value.entry_sha256;
    }
    const row11 = row(11, "mixed-load-gate", previous, priorReceipt);
    const row12 = row(12, "formal-like-512", row11.entry_sha256, receipt);
    rows.push(row11, row12);
    const ledgerRaw = Buffer.concat(rows.map((value) => v1r11CanonicalLine(value)));
    const ledger = fileIdentity(
      path.join(root, "ledger.jsonl"),
      ledgerRaw,
      "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11",
    );
    const context = {
      repositoryRoot: root,
      teacherPlan,
      sourceRevision: "a".repeat(40),
      formalRunFingerprint: "b".repeat(64),
      currentLedger: ledger,
      previousGateReceipt: receipt,
    } as never;
    await expect(
      authenticateHalfkp81V1R11StageCHandoffBeforeAppendForTests(
        context,
        producer,
      ),
    ).resolves.toBe(row12.entry_sha256);

    const forgedReceiptRaw = v1r11CanonicalLine({
      ...receiptValue,
      previous_gate_receipt_sha256: "f".repeat(64),
    });
    fs.writeFileSync(receipt.path, forgedReceiptRaw, { mode: 0o600 });
    const forgedReceipt = Object.freeze({
      ...receipt,
      bytes: forgedReceiptRaw.byteLength,
      sha256: v1r11Sha256(forgedReceiptRaw),
    });
    const forgedRow12 = row(
      12,
      "formal-like-512",
      row11.entry_sha256,
      forgedReceipt,
    );
    const forgedLedgerRaw = Buffer.concat([
      ...rows.slice(0, -1).map((value) => v1r11CanonicalLine(value)),
      v1r11CanonicalLine(forgedRow12),
    ]);
    fs.writeFileSync(ledger.path, forgedLedgerRaw, { mode: 0o600 });
    const forgedLedger = Object.freeze({
      ...ledger,
      bytes: forgedLedgerRaw.byteLength,
      sha256: v1r11Sha256(forgedLedgerRaw),
    });
    await expect(
      authenticateHalfkp81V1R11StageCHandoffBeforeAppendForTests(
        {
          ...context,
          currentLedger: forgedLedger,
          previousGateReceipt: forgedReceipt,
        },
        producer,
      ),
    ).rejects.toThrow(/receipt chain or semantics differ/u);
  });

  it("parses one exact battery source and percentage", () => {
    expect(
      parseHalfkp81V1R11StageCBatteryForTests(
        "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t97%; charging;",
      ),
    ).toEqual({ powerSource: "AC Power", batteryPercentage: 97 });
    expect(() =>
      parseHalfkp81V1R11StageCBatteryForTests(
        "Now drawing from 'AC Power'\nNow drawing from 'Battery Power'\n -Battery-0 97%;",
      ),
    ).toThrow(/uniquely parseable/u);
  });

  it("requires system-wide value=1 and one exact assertion row owned by the holder", () => {
    const assertions = [
      "Assertion status system-wide:",
      "   PreventUserIdleDisplaySleep    1",
      "   PreventSystemSleep             1",
      "   PreventUserIdleSystemSleep     1",
      "Listed by owning process:",
      "   pid 701(caffeinate): [0x00000001] 00:00:01 PreventSystemSleep named: 'caffeinate command-line tool'",
      "   pid 999(caffeinate): [0x00000002] 00:00:01 PreventUserIdleSystemSleep named: 'caffeinate command-line tool'",
      "   pid 701(caffeinate): [0x00000003] 00:00:01 PreventUserIdleSystemSleep named: 'caffeinate command-line tool'",
      "   pid 701(caffeinate): [0x00000004] 00:00:01 PreventUserIdleDisplaySleep named: 'caffeinate command-line tool'",
    ].join("\n");
    expect(
      parseHalfkp81V1R11StageCAssertionsForTests(assertions, 701),
    ).toEqual(HALFKP81_V1R11_REQUIRED_ASSERTIONS);
    expect(() =>
      parseHalfkp81V1R11StageCAssertionsForTests(
        assertions.replace("PreventSystemSleep             1", "PreventSystemSleep             0"),
        701,
      ),
    ).toThrow(/PreventSystemSleep differs/u);
    expect(() =>
      parseHalfkp81V1R11StageCAssertionsForTests(
        assertions.replace("pid 701(caffeinate): [0x00000004]", "pid 999(caffeinate): [0x00000004]"),
        701,
      ),
    ).toThrow(/PreventUserIdleDisplaySleep differs/u);
  });

  it("binds exact evidence keys, XPC/argv/topology, launchctl meaning, and plist bytes", () => {
    const { context, evidence, launchctl, plist, ps } = fixture();
    const parsed = validateHalfkp81V1R11StageCLaunchEvidenceForTests(
      evidence,
      context,
    );
    expect(() =>
      validateHalfkp81V1R11StageCLaunchctlForTests(launchctl, parsed),
    ).not.toThrow();
    expect(buildHalfkp81V1R11StageCExpectedPlistForTests(parsed)).toEqual(
      plist,
    );
    const launchctlRaw = Buffer.from(launchctl, "utf8");
    expect(() =>
      validateHalfkp81V1R11StageCRawCapturesForTests(parsed, {
        sealedLaunchctl: launchctlRaw,
        liveLaunchctl: launchctlRaw,
        sealedLaunchctlStderr: Buffer.alloc(0),
        liveLaunchctlStderr: Buffer.alloc(0),
        sealedPlist: plist,
        livePlist: plist,
        sealedPsStdout: ps,
        sealedPsStderr: Buffer.alloc(0),
      }),
    ).not.toThrow();

    expect(() =>
      validateHalfkp81V1R11StageCLaunchEvidenceForTests(
        { ...evidence, authority: {} },
        context,
      ),
    ).toThrow(/keys differ/u);
    expect(() =>
      validateHalfkp81V1R11StageCLaunchEvidenceForTests(
        { ...evidence, xpc_service_name: "wrong" },
        context,
      ),
    ).toThrow(/semantic binding differs/u);
    expect(() =>
      validateHalfkp81V1R11StageCLaunchEvidenceForTests(evidence, {
        ...context,
        formalRunIntent: mismatchedFormalRunIntent(
          context.teacherPlan,
          evidence.plist_snapshot,
        ),
      }),
    ).toThrow(/context differs/u);
    expect(() =>
      validateHalfkp81V1R11StageCLaunchctlForTests(
        launchctl.replace("\tstate = running", "\tstate = exited"),
        parsed,
      ),
    ).toThrow(/semantic identity differs/u);
  });

  it("compares nonempty launchctl stderr by exact sealed/live bytes", () => {
    const { context, evidence, launchctl, plist, ps } = fixture();
    const stderr = Buffer.from("warning\n", "utf8");
    const withStderr = {
      ...evidence,
      launchctl_stderr: identity(
        `${context.authorityDirectory}/launchagent-launchctl-print.stderr.txt`,
        stderr,
        "text/plain-utf8-exact-command-stderr",
      ),
    };
    const parsed = validateHalfkp81V1R11StageCLaunchEvidenceForTests(
      withStderr,
      context,
    );
    const launchctlRaw = Buffer.from(launchctl, "utf8");
    expect(() =>
      validateHalfkp81V1R11StageCRawCapturesForTests(parsed, {
        sealedLaunchctl: launchctlRaw,
        liveLaunchctl: launchctlRaw,
        sealedLaunchctlStderr: stderr,
        liveLaunchctlStderr: Buffer.from("different\n", "utf8"),
        sealedPlist: plist,
        livePlist: plist,
        sealedPsStdout: ps,
        sealedPsStderr: Buffer.alloc(0),
      }),
    ).toThrow(/sealed\/live raw captures differ/u);
  });

  it("held-recovers partial gate-13 identities and binds them into the fault message", async () => {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "v1r11-stage-c-")),
    );
    roots.push(root);
    fs.chmodSync(root, 0o700);
    const sourceSchema =
      "shogi-halfkp81-depth18-yaneura-only-v1r11-ac-power-start-admission-pass-primary-source-formal-launchagent-power-admission-bundle-v1";
    const evidenceSchema =
      "shogi-halfkp81-depth18-yaneura-only-v1r11-ac-power-start-admission-pass-evidence-v1";
    const source = v1r11CanonicalLine({ schema: sourceSchema, value: 1 });
    const evidence = v1r11CanonicalLine({ schema: evidenceSchema, value: 2 });
    fs.writeFileSync(
      path.join(root, "13-ac-power-start-admission-pass.source-01.bin"),
      source,
      { mode: 0o600 },
    );
    fs.writeFileSync(
      path.join(root, "13-ac-power-start-admission-pass.evidence.json"),
      evidence,
      { mode: 0o600 },
    );
    const recovered =
      await recoverHalfkp81V1R11StageCArtifactProgressForTests(root, {
        source: null,
        evidence: null,
        receipt: null,
      });
    expect(recovered.source).toMatchObject({
      bytes: source.byteLength,
      sha256: v1r11Sha256(source),
      schema: sourceSchema,
    });
    expect(recovered.evidence).toMatchObject({
      bytes: evidence.byteLength,
      sha256: v1r11Sha256(evidence),
      schema: evidenceSchema,
    });
    expect(recovered.receipt).toBeNull();
    const message = halfkp81V1R11StageCTerminalFaultMessageForTests(
      new Error("publish stopped"),
      recovered,
    );
    expect(message).toContain(recovered.source!.sha256);
    expect(message).toContain(recovered.evidence!.sha256);
    expect(message).toContain('"receipt":null');

    const receiptSchema =
      "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11";
    const receipt = v1r11CanonicalLine({ schema: receiptSchema, value: 3 });
    fs.writeFileSync(
      path.join(root, "13-ac-power-start-admission-pass.receipt.json"),
      receipt,
      { mode: 0o600 },
    );
    const complete =
      await recoverHalfkp81V1R11StageCArtifactProgressForTests(
        root,
        recovered,
      );
    const previous = {
      path: `${root}/12-formal-like-512.receipt.json`,
      bytes: 1,
      sha256: "f".repeat(64),
      schema: receiptSchema,
    };
    expect(halfkp81V1R11StageCLatestReceiptForTests(previous, complete)).toBe(
      complete.receipt,
    );
    expect(
      halfkp81V1R11StageCTerminalFaultMessageForTests(
        new Error("ledger append stopped"),
        complete,
      ),
    ).toContain(complete.receipt!.sha256);
  });
});
