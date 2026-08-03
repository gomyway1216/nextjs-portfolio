import { spawnSync } from "node:child_process";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { buildHalfkp81V1R11PlannedLaunchAgentPlistForTests } from "../../../ml/prepare-halfkp81-depth18-v1r11-planned-launchagent";
import { halfkp81V1R11FormalRunFingerprintV2 } from "../../../ml/halfkp81-depth18-v1r11-formal-run-intent";
import {
  v1r11CanonicalLine,
  v1r11Sha256,
} from "../../../ml/halfkp81-depth18-v1r11-authority-io";
import {
  cleanupHalfkp81V1R11All13LaunchAgentForTests,
  verifyAndPublishHalfkp81V1R11StagedAuthorityInScratchForTests,
  verifyAndPublishHalfkp81V1R11StagedAuthorityWithOsBoundaryForTests,
  resolveHalfkp81V1R11PasswdHomeForTests,
  verifyHalfkp81V1R11All13Gate13ForTests,
  verifyHalfkp81V1R11All13LaunchEvidenceForTests,
} from "../../../ml/verify-halfkp81-depth18-v1r11-staged-authority";
import type { Halfkp81V1R11ScratchNamespaceCapabilityForTests } from "../../../ml/verify-halfkp81-depth18-v1r11-stage-a";

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
      evalFile: identity("nn.bin", "application/octet-stream-exact-bytes", "4"),
      receipt: identity("receipt.json", "engine-receipt-v1", "5"),
    },
    teacherContract: { depth: 18 },
    candidateContract: { mode: "multipv12" },
    plannedFinalDescriptor,
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
  const holderArguments = ["/usr/bin/caffeinate", "-dimsu", "-w", "700"];
  const plist = buildHalfkp81V1R11PlannedLaunchAgentPlistForTests({
    label,
    repositoryRoot,
    nodePath: expectedNodePath,
    stdoutPath,
    stderrPath,
  }).bytes;
  const launchctl = Buffer.from(
    [
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
    ].join("\n"),
    "utf8",
  );
  const ps = Buffer.from(
    [
      `  700     1   700 Sun Aug  2 12:00:00 2026 S ${runnerUtilityArgv.join(" ")}`,
      `  701   700   700 Sun Aug  2 12:00:01 2026 S ${holderArguments.join(" ")}`,
      "",
    ].join("\n"),
    "utf8",
  );
  const runnerProcess = Object.freeze({
    pid: 700,
    ppid: 1,
    pgid: 700,
    lstart: "Sun Aug  2 12:00:00 2026",
    executable: expectedNodePath,
    argv: runnerUtilityArgv.join(" "),
    role: "runner",
  });
  const assertionHolderProcess = Object.freeze({
    pid: 701,
    ppid: 700,
    pgid: 700,
    lstart: "Sun Aug  2 12:00:01 2026",
    executable: "/usr/bin/caffeinate",
    argv: holderArguments.join(" "),
    role: "assertion-holder",
  });
  const sealedPs = Buffer.from(
    [
      `  700     1   700 ${runnerProcess.lstart} ${runnerProcess.argv}`,
      `  701   700   700 ${assertionHolderProcess.lstart} ${assertionHolderProcess.argv}`,
      "",
    ].join("\n"),
    "utf8",
  );
  const teacherPlan = Object.freeze({
    path: `${authorityDirectory}/teacher-plan.json`,
    bytes: 10,
    sha256: "a".repeat(64),
    schema: "teacher-plan",
  });
  const identity = (pathname: string, raw: Buffer, schema: string) =>
    Object.freeze({
      path: pathname,
      bytes: raw.byteLength,
      sha256: v1r11Sha256(raw),
      schema,
    });
  const evidence = Object.freeze({
    schema:
      "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11",
    status:
      "live-one-shot-LaunchAgent-semantics-verified-no-standalone-formal-authority",
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
    caffeinate_holder: Object.freeze({
      pid: 701,
      parent_runner_pid: 700,
      assertion_owner_pid: 701,
      executable: "/usr/bin/caffeinate",
      argv: holderArguments,
    }),
    required_assertions: Object.freeze([
      "PreventSystemSleep",
      "PreventUserIdleSystemSleep",
      "PreventUserIdleDisplaySleep",
    ]),
    launchctl_command: Object.freeze([
      "/bin/launchctl",
      "print",
      `gui/${uid}/${label}`,
    ]),
    launchctl_exit_code: 0,
    launchctl_print: identity(
      `${authorityDirectory}/launchagent-launchctl-print.txt`,
      launchctl,
      "text/plain-utf8-exact-command-stdout",
    ),
    launchctl_stderr: identity(
      `${authorityDirectory}/launchagent-launchctl-print.stderr.txt`,
      Buffer.alloc(0),
      "text/plain-utf8-exact-command-stderr",
    ),
    plist_source: Object.freeze({
      plist_path: plistPath,
      realpath: plistPath,
      dev: 1,
      ino: 2,
      uid,
      mode: 0o600,
      nlink: 1,
      bytes: plist.byteLength,
      sha256: v1r11Sha256(plist),
    }),
    plist_snapshot: identity(
      `${authorityDirectory}/launchagent.plist.snapshot`,
      plist,
      "application/x-apple-aspen-config-exact-bytes",
    ),
    ps_command: Object.freeze([
      "/bin/ps",
      "-ww",
      "-axo",
      "pid=,ppid=,pgid=,lstart=,command=",
    ]),
    ps_exit_code: 0,
    ps_stdout: identity(
      `${authorityDirectory}/launchagent-ps.stdout.txt`,
      sealedPs,
      "text/plain-exact-launchagent-ps-stdout",
    ),
    ps_stderr: identity(
      `${authorityDirectory}/launchagent-ps.stderr.txt`,
      Buffer.alloc(0),
      "text/plain-exact-launchagent-ps-stderr",
    ),
    runner_process: runnerProcess,
    assertion_holder_process: assertionHolderProcess,
    observed_process_group_rows: Object.freeze([
      runnerProcess,
      assertionHolderProcess,
    ]),
    observed_yaneuraou_engine_rows: Object.freeze([]),
    producer: Object.freeze({
      source_revision: sourceRevision,
      entrypoint: "ml/halfkp81-depth18-v1r11-stage-c-live-evidence.ts",
      dependency_closure: Object.freeze([
        Object.freeze({
          path: "ml/halfkp81-depth18-v1r11-stage-c-live-evidence.ts",
          bytes: 1,
          sha256: "d".repeat(64),
        }),
      ]),
    }),
  });
  return {
    context: Object.freeze({
      repositoryRoot,
      authorityDirectory,
      homeDirectory,
      expectedUid: uid,
      sourceRevision,
      runFingerprint,
      teacherPlan,
      expectedNodePath,
    }),
    evidence,
    launchctl,
    plist,
    ps,
    sealedPs,
  };
}

describe("HalfKP81 v1r11 all-13 independent LaunchAgent verifier", () => {
  it("rejects ignored, circular, and post-fingerprint authority inputs", () => {
    const { context, evidence, launchctl, plist, ps, sealedPs } = fixture();
    const intent = mismatchedFormalRunIntent(
      context.teacherPlan,
      evidence.plist_snapshot,
    );
    const runFingerprint = halfkp81V1R11FormalRunFingerprintV2(intent);
    const exactContext = {
      ...context,
      runFingerprint,
      formalRunIntent: intent,
    };
    const exactEvidence = { ...evidence, run_fingerprint: runFingerprint };
    expect(() =>
      verifyHalfkp81V1R11All13LaunchEvidenceForTests(
        exactEvidence,
        exactContext,
        launchctl,
        Buffer.alloc(0),
        plist,
        sealedPs,
        Buffer.alloc(0),
        ps,
      ),
    ).not.toThrow();
    for (const extra of [
      { launchagent_authority: evidence.plist_snapshot },
      { preformal_authority_raw_receipt: evidence.plist_snapshot },
      { preformal_authority_verified_receipt: evidence.plist_snapshot },
    ]) {
      expect(() =>
        verifyHalfkp81V1R11All13LaunchEvidenceForTests(
          exactEvidence,
          {
            ...exactContext,
            formalRunIntent: { ...intent, ...extra } as never,
          },
          launchctl,
          Buffer.alloc(0),
          plist,
          sealedPs,
          Buffer.alloc(0),
          ps,
        ),
      ).toThrow(/keys differ/u);
    }
    expect(() =>
      verifyHalfkp81V1R11All13LaunchEvidenceForTests(
        exactEvidence,
        {
          ...exactContext,
          formalRunIntent: {
            ...intent,
            teacherContract: {
              ...intent.teacherContract,
              nested: { run_fingerprint: runFingerprint },
            },
          },
        },
        launchctl,
        Buffer.alloc(0),
        plist,
        sealedPs,
        Buffer.alloc(0),
        ps,
      ),
    ).toThrow(/circular authority input/u);
  });

  it.runIf(process.platform === "darwin")(
    "derives HOME from the effective-uid passwd record and rejects env drift",
    () => {
      const uid = process.geteuid?.();
      expect(Number.isSafeInteger(uid)).toBe(true);
      const original = process.env.HOME;
      try {
        const canonical = resolveHalfkp81V1R11PasswdHomeForTests(Number(uid));
        expect(canonical).toBe(original);
        process.env.HOME = "/tmp";
        expect(() =>
          resolveHalfkp81V1R11PasswdHomeForTests(Number(uid)),
        ).toThrow(/HOME differs/u);
      } finally {
        if (original === undefined) delete process.env.HOME;
        else process.env.HOME = original;
      }
    },
  );

  it("accepts only the exact running one-shot service and plist policy", () => {
    const { context, evidence, launchctl, plist, ps, sealedPs } = fixture();
    expect(() =>
      verifyHalfkp81V1R11All13LaunchEvidenceForTests(
        evidence,
        context,
        launchctl,
        Buffer.alloc(0),
        plist,
        sealedPs,
        Buffer.alloc(0),
        ps,
      ),
    ).not.toThrow();
    expect(() =>
      verifyHalfkp81V1R11All13LaunchEvidenceForTests(
        evidence,
        {
          ...context,
          formalRunIntent: mismatchedFormalRunIntent(
            context.teacherPlan,
            evidence.plist_snapshot,
          ),
        },
        launchctl,
        Buffer.alloc(0),
        plist,
        sealedPs,
        Buffer.alloc(0),
        ps,
      ),
    ).toThrow(/context differs/u);
    const exited = Buffer.from(
      launchctl
        .toString("utf8")
        .replace("\tstate = running", "\tstate = exited"),
      "utf8",
    );
    expect(() =>
      verifyHalfkp81V1R11All13LaunchEvidenceForTests(
        {
          ...evidence,
          launchctl_print: {
            ...evidence.launchctl_print,
            bytes: exited.byteLength,
            sha256: v1r11Sha256(exited),
          },
        },
        context,
        exited,
        Buffer.alloc(0),
        plist,
        sealedPs,
        Buffer.alloc(0),
      ),
    ).toThrow(/launchctl semantics differ/u);
    const alteredPlist = Buffer.from(
      plist.toString("utf8").replace("<false/>", "<true/>"),
    );
    expect(() =>
      verifyHalfkp81V1R11All13LaunchEvidenceForTests(
        {
          ...evidence,
          plist_snapshot: {
            ...evidence.plist_snapshot,
            bytes: alteredPlist.byteLength,
            sha256: v1r11Sha256(alteredPlist),
          },
          plist_source: {
            ...evidence.plist_source,
            bytes: alteredPlist.byteLength,
            sha256: v1r11Sha256(alteredPlist),
          },
        },
        context,
        launchctl,
        Buffer.alloc(0),
        alteredPlist,
        sealedPs,
        Buffer.alloc(0),
      ),
    ).toThrow(/plist policy differs/u);
  });

  it("requires the live runner and direct-child caffeinate topology", () => {
    const { context, evidence, launchctl, plist, ps, sealedPs } = fixture();
    const wrongParent = Buffer.from(
      ps.toString("utf8").replace("  701   700", "  701   999"),
      "utf8",
    );
    expect(() =>
      verifyHalfkp81V1R11All13LaunchEvidenceForTests(
        evidence,
        context,
        launchctl,
        Buffer.alloc(0),
        plist,
        sealedPs,
        Buffer.alloc(0),
        wrongParent,
      ),
    ).toThrow(/process topology differs/u);
    const engineStarted = Buffer.concat([
      ps,
      Buffer.from(
        "  702   700   700 Sun Aug  2 12:00:02 2026 S /private/YaneuraOu-authenticated-snapshot\n",
        "utf8",
      ),
    ]);
    expect(() =>
      verifyHalfkp81V1R11All13LaunchEvidenceForTests(
        evidence,
        context,
        launchctl,
        Buffer.alloc(0),
        plist,
        sealedPs,
        Buffer.alloc(0),
        engineStarted,
      ),
    ).toThrow(/process topology differs/u);
    const detachedFormalEngine = Buffer.concat([
      ps,
      Buffer.from(
        "  703     1   703 Sun Aug  2 12:00:03 2026 S /Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1/bin/yaneuraou\n",
        "utf8",
      ),
    ]);
    expect(() =>
      verifyHalfkp81V1R11All13LaunchEvidenceForTests(
        evidence,
        context,
        launchctl,
        Buffer.alloc(0),
        plist,
        sealedPs,
        Buffer.alloc(0),
        detachedFormalEngine,
      ),
    ).toThrow(/process topology differs/u);
  });

  it("boots out, rejects PID reuse, and requires two empty final ps captures before cleanup authority", async () => {
    const { context, evidence, launchctl, ps } = fixture();
    const emptyPs = Buffer.from("\n", "utf8");
    const psQueue = [ps, emptyPs, emptyPs, emptyPs];
    const signals: string[] = [];
    const cleanup = await cleanupHalfkp81V1R11All13LaunchAgentForTests(
      evidence,
      context,
      {
        launchctlStdout: launchctl,
        launchctlStderr: Buffer.alloc(0),
        psStdout: ps,
      },
      {
        launchctl(arguments_) {
          if (arguments_[0] === "bootout") {
            return {
              status: 0,
              signal: null,
              stdout: Buffer.alloc(0),
              stderr: Buffer.alloc(0),
            };
          }
          return {
            status: 113,
            signal: null,
            stdout: Buffer.alloc(0),
            stderr: Buffer.from("Could not find service\n", "utf8"),
          };
        },
        ps: () => psQueue.shift()!,
        signalProcessGroup(pgid, signal) {
          signals.push(`${String(pgid)}:${signal}`);
          return "sent";
        },
        wait: async () => undefined,
      },
    );
    expect(cleanup).toMatchObject({
      status: "launchagent-booted-out-and-process-group-dual-ps-reaped",
      process_cleanup: {
        scheduling_stopped: true,
        engines_terminated: 0,
        engines_reaped: 0,
        remaining_engine_pids: [],
      },
    });
    expect(signals).toEqual(["700:SIGTERM"]);

    const reused = Buffer.from(
      ps
        .toString("utf8")
        .replace("Sun Aug  2 12:00:00 2026", "Sun Aug  2 12:00:02 2026"),
      "utf8",
    );
    const reuseSignals: string[] = [];
    await expect(
      cleanupHalfkp81V1R11All13LaunchAgentForTests(
        evidence,
        context,
        {
          launchctlStdout: launchctl,
          launchctlStderr: Buffer.alloc(0),
          psStdout: ps,
        },
        {
          launchctl(arguments_) {
            return arguments_[0] === "bootout"
              ? {
                  status: 0,
                  signal: null,
                  stdout: Buffer.alloc(0),
                  stderr: Buffer.alloc(0),
                }
              : {
                  status: 113,
                  signal: null,
                  stdout: Buffer.alloc(0),
                  stderr: Buffer.from("Could not find service\n", "utf8"),
                };
          },
          ps: () => reused,
          signalProcessGroup(_pgid, signal) {
            reuseSignals.push(signal);
            return "sent";
          },
          wait: async () => undefined,
        },
      ),
    ).rejects.toThrow(/reused process/u);
    expect(reuseSignals).toEqual([]);
  });

  it("binds the exact zero-byte launchctl stderr identity", () => {
    const { context, evidence, launchctl, plist, sealedPs } = fixture();
    expect(() =>
      verifyHalfkp81V1R11All13LaunchEvidenceForTests(
        {
          ...evidence,
          launchctl_stderr: {
            ...evidence.launchctl_stderr,
            sha256: "0".repeat(64),
          },
        },
        context,
        launchctl,
        Buffer.alloc(0),
        plist,
        sealedPs,
        Buffer.alloc(0),
      ),
    ).toThrow(/raw identity differs/u);
  });

  it("recomputes gate13 from fixed battery, assertion and launchctl bytes", () => {
    const { context, evidence, launchctl } = fixture();
    const launchIdentity = Object.freeze({
      path: `${context.authorityDirectory}/launchagent-authority-evidence.json`,
      bytes: 100,
      sha256: "f".repeat(64),
      schema:
        "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11",
    });
    const battery = Buffer.from(
      "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t97%; charging;",
      "utf8",
    );
    const assertions = Buffer.from(
      [
        "Assertion status system-wide:",
        "   PreventUserIdleDisplaySleep    1",
        "   PreventSystemSleep             1",
        "   PreventUserIdleSystemSleep     1",
        "Listed by owning process:",
        "   pid 701(caffeinate): [0x00000001] 00:00:01 PreventSystemSleep named: 'caffeinate command-line tool'",
        "   pid 701(caffeinate): [0x00000002] 00:00:01 PreventUserIdleSystemSleep named: 'caffeinate command-line tool'",
        "   pid 701(caffeinate): [0x00000003] 00:00:01 PreventUserIdleDisplaySleep named: 'caffeinate command-line tool'",
      ].join("\n"),
      "utf8",
    );
    const commands = Object.freeze([
      Object.freeze(["/usr/bin/pmset", "-g", "batt"]),
      Object.freeze(["/usr/bin/pmset", "-g", "assertions"]),
      Object.freeze([
        "/bin/launchctl",
        "print",
        `gui/${String(context.expectedUid)}/${String(evidence.label)}`,
      ]),
    ]);
    const observedAtUtc = "2026-08-02T12:00:01.000Z";
    const preimage = Object.freeze({
      schema:
        "shogi-halfkp81-depth18-yaneura-only-v1r11-formal-power-admission-preimage-v1",
      status: "fresh-fixed-raw-capture-no-formal-authority",
      commands,
      battery_stdout_base64: battery.toString("base64"),
      battery_stdout_bytes: battery.byteLength,
      battery_stdout_sha256: v1r11Sha256(battery),
      assertions_stdout_base64: assertions.toString("base64"),
      assertions_stdout_bytes: assertions.byteLength,
      assertions_stdout_sha256: v1r11Sha256(assertions),
      launchctl_stdout_base64: launchctl.toString("base64"),
      launchctl_stdout_bytes: launchctl.byteLength,
      launchctl_stdout_sha256: v1r11Sha256(launchctl),
      runner_pid: 700,
      caffeinate_assertion_holder_pid: 701,
      assertion_owner_caffeinate_pid: 701,
      observed_at_utc: observedAtUtc,
    });
    const payload = Object.freeze({
      power_source: "AC Power",
      battery_percentage: 97,
      required_assertions: evidence.required_assertions,
      assertion_owner_matches_caffeinate_pid: true,
      launchagent_authority: launchIdentity,
      power_admission_preimage: preimage,
      observed_at_utc: observedAtUtc,
    });
    const stdout = v1r11CanonicalLine(payload);
    const content = Object.freeze({
      collector: Object.freeze({
        schema:
          "shogi-halfkp81-depth18-yaneura-only-v1r11-fixed-stage-c-live-collector-v1",
        status: "fixed-production-collector",
        entrypoint: "ml/produce-halfkp81-depth18-v1r11-stage-bc.ts",
      }),
      request_or_command: commands.flat(),
      exit_code: 0,
      stdout_base64: stdout.toString("base64"),
      stdout_bytes: stdout.byteLength,
      stdout_sha256: v1r11Sha256(stdout),
      stderr_base64: "",
      stderr_bytes: 0,
      stderr_sha256: v1r11Sha256(""),
      parsed_canonical_json: payload,
    });
    expect(
      verifyHalfkp81V1R11All13Gate13ForTests(
        content,
        launchIdentity,
        evidence,
        context,
        launchctl,
      ),
    ).toEqual(payload);
    expect(() =>
      verifyHalfkp81V1R11All13Gate13ForTests(
        {
          ...content,
          parsed_canonical_json: { ...payload, battery_percentage: 99 },
        },
        launchIdentity,
        evidence,
        context,
        launchctl,
      ),
    ).toThrow(/parsed payload differs/u);
    expect(() =>
      verifyHalfkp81V1R11All13Gate13ForTests(
        {
          ...content,
          collector: { ...content.collector, status: "forged" },
        },
        launchIdentity,
        evidence,
        context,
        launchctl,
      ),
    ).toThrow(/collector differs/u);
  });
});

describe("HalfKP81 v1r11 all-13 scratch boundary", () => {
  const observer = Object.freeze({
    observe: async () => {
      throw new Error("observer must remain unreachable");
    },
  });
  const scratchRequest = Object.freeze({
    authorityDirectory: { path: "/private/tmp/v1r11-scratch/authority" },
    gateDirectory: {
      path: "/private/tmp/v1r11-scratch/authority/preformal-gates",
    },
    teacherPlan: {
      path: "/private/tmp/v1r11-scratch/teacher-plan.json",
      schema: "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11",
    },
  }) as never;

  it("keeps the OS-only production seam fixed and rejects forged scratch capability", async () => {
    await expect(
      verifyAndPublishHalfkp81V1R11StagedAuthorityWithOsBoundaryForTests(
        scratchRequest,
        observer,
      ),
    ).rejects.toThrow(/all-13 production context differs/u);
    await expect(
      verifyAndPublishHalfkp81V1R11StagedAuthorityInScratchForTests(
        Object.freeze({}) as Halfkp81V1R11ScratchNamespaceCapabilityForTests,
        scratchRequest,
        observer,
      ),
    ).rejects.toThrow(/capability is forged/u);
  });

  it("has no all-13 import-time process side effect", () => {
    const repositoryRoot = path.resolve(__dirname, "../../..");
    const result = spawnSync(
      process.execPath,
      [
        "-r",
        path.join(repositoryRoot, "node_modules/tsx/dist/cjs/index.cjs"),
        "-e",
        `require(${JSON.stringify(path.join(repositoryRoot, "ml/verify-halfkp81-depth18-v1r11-staged-authority.ts"))});process.stdout.write("import-ok\\n")`,
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("import-ok\n");
  });
});
