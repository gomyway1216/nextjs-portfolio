import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalHalfkp81Depth18Json,
  validateHalfkp81Depth18V1R11EnvironmentFaultArtifacts,
  type Halfkp81Depth18PrivateSnapshot,
} from "../../../ml/halfkp81-depth18-teacher-artifact-validation";
import { HALFKP81_V1R11_PREFORMAL_GATE_RECEIPT_SCHEMA } from "../../../ml/halfkp81-depth18-v1r11-preformal-authority";
import {
  verifyIndependentV1R11PowerFaultLedger,
  verifyIndependentV1R11PowerSuccessLedger,
  type IndependentV1R11PowerLedgerEntry,
} from "../../../ml/halfkp81-depth18-v1r11-independent-power-verifier";

import {
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_MAXIMUM_GAP_MS,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_AUTHORITY_DIRECTORY,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_FAULT_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA,
  Halfkp81Depth18EnvironmentContinuityError,
  assertHalfkp81Depth18V1R11SemanticPreformalAuthorityForTests,
  appendHalfkp81Depth18PowerContinuityObservationForTests,
  classifyHalfkp81Depth18PmsetEventLineForTests,
  closeHalfkp81Depth18GuardianChildForTests,
  halfkp81Depth18PowerContinuityFailureReasonForTests,
  parseHalfkp81Depth18CaffeinateAssertionsForTests,
  parseHalfkp81Depth18PmsetBatteryForTests,
  parseHalfkp81Depth18PmsetLogRowsForTests,
  runHalfkp81Depth18YaneuraOnlyTeacherV1R11,
  startHalfkp81Depth18PowerHeartbeatWatchdogForTests,
  validateHalfkp81Depth18PowerContinuityAdmissionForTests,
  validateHalfkp81Depth18V1R11LaunchdAuthorityForTests,
  validateHalfkp81Depth18V1R11PreformalAuthorityReceiptForTests,
  validateHalfkp81Depth18PowerGuardianMessageForTests,
  verifyHalfkp81Depth18PowerContinuityLedgerForTests,
  verifyHalfkp81Depth18PowerContinuityFaultLedgerForTests,
  type Halfkp81Depth18PowerContinuityObservation,
} from "../../../ml/halfkp81-depth18-teacher-runner";

function snapshot(
  filePath: string,
  value: unknown,
): Readonly<Halfkp81Depth18PrivateSnapshot> {
  const bytes = Buffer.from(`${canonicalHalfkp81Depth18Json(value)}\n`, "utf8");
  return Object.freeze({
    bytes: new Uint8Array(bytes),
    identity: Object.freeze({
      path: filePath,
      bytes: bytes.byteLength,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    }),
  });
}

function independentEntry(
  value: Readonly<Record<string, unknown>>,
): Readonly<IndependentV1R11PowerLedgerEntry> {
  const { entry_sha256: _discarded, ...preimage } = value;
  return Object.freeze({
    ...preimage,
    entry_sha256: crypto
      .createHash("sha256")
      .update(
        `shogi-halfkp81-depth18-power-continuity-entry-v1r11\0${canonicalHalfkp81Depth18Json(
          preimage,
        )}`,
      )
      .digest("hex"),
  }) as unknown as Readonly<IndependentV1R11PowerLedgerEntry>;
}

function observation(
  overrides: Partial<Halfkp81Depth18PowerContinuityObservation> = {},
): Readonly<Halfkp81Depth18PowerContinuityObservation> {
  const observedAtMs = overrides.observed_at_ms ?? 1_800_000_000_000;
  const anchor =
    overrides.pmset_anchor_raw_event_line ??
    "2027-01-15 00:00:00 -0800 Assertions start-anchor";
  const newLines = overrides.pmset_new_raw_event_lines ?? Object.freeze([]);
  const anchorDigest = crypto.createHash("sha256").update(anchor).digest("hex");
  const previousDigest = overrides.pmset_previous_raw_event_line_sha256 ?? null;
  const lastLine = newLines[newLines.length - 1];
  return Object.freeze({
    observed_at_ms: observedAtMs,
    timestamp_utc:
      overrides.timestamp_utc ?? new Date(observedAtMs).toISOString(),
    power_source: "AC Power",
    battery_percentage: 100,
    runner_pid: 410,
    guardian_pid: 411,
    caffeinate_assertion_holder_pid: 409,
    caffeinate_assertion_holder_parent_runner_pid: 410,
    caffeinate_executable: "/usr/bin/caffeinate",
    caffeinate_argv: Object.freeze([
      "/usr/bin/caffeinate",
      "-dimsu",
      "-w",
      "410",
    ]),
    runner_utility_argv: Object.freeze(["/usr/bin/node", "runner.js"]),
    assertion_owner_caffeinate_pid: 409,
    assertions: Object.freeze([
      "PreventSystemSleep",
      "PreventUserIdleSystemSleep",
      "PreventUserIdleDisplaySleep",
    ]),
    boot_session_identity: "boot-a",
    pmset_event_ordinal: 22 + newLines.length,
    pmset_previous_raw_event_line_sha256: previousDigest,
    pmset_last_raw_event_line_sha256:
      lastLine === undefined
        ? (previousDigest ?? anchorDigest)
        : crypto.createHash("sha256").update(lastLine).digest("hex"),
    pmset_anchor_raw_event_line: anchor,
    pmset_new_raw_event_lines: newLines,
    ...overrides,
  });
}

function independentSuccessFixture(): readonly Readonly<IndependentV1R11PowerLedgerEntry>[] {
  const admitted = appendHalfkp81Depth18PowerContinuityObservationForTests(
    undefined,
    observation(),
  );
  return appendHalfkp81Depth18PowerContinuityObservationForTests(
    admitted,
    observation({
      observed_at_ms: 1_800_000_030_000,
      pmset_previous_raw_event_line_sha256:
        admitted.previous.pmset_last_raw_event_line_sha256,
    }),
    {
      kind: "final",
      binding: {
        outcome: "success",
        teacher_plan_sha256: "a".repeat(64),
        launchagent_authority: {
          path: "/private/tmp/v1r11-authority/launchagent-authority-evidence.json",
          bytes: 512,
          sha256: "e".repeat(64),
        },
        preformal_authority: {
          path: "/private/tmp/v1r11-authority/preformal-authority-verified-receipt.json",
          bytes: 1_024,
          sha256: "f".repeat(64),
        },
        run_fingerprint: "b".repeat(64),
        runner_pid: 410,
        guardian_pid: 411,
        caffeinate_assertion_holder_pid: 409,
        engines_started: 8,
        engines_reaped: 8,
        first_engine_started_at_ms: 1_800_000_001_000,
        last_engine_reaped_at_ms: 1_800_000_029_000,
        all_yaneuraou_processes_reaped: true,
      },
    },
  ).entries;
}

function independentFaultFixture(): readonly Readonly<IndependentV1R11PowerLedgerEntry>[] {
  const admitted = appendHalfkp81Depth18PowerContinuityObservationForTests(
    undefined,
    observation(),
  );
  return appendHalfkp81Depth18PowerContinuityObservationForTests(
    admitted,
    observation({
      observed_at_ms: 1_800_000_030_000,
      power_source: "Battery Power",
      pmset_previous_raw_event_line_sha256:
        admitted.previous.pmset_last_raw_event_line_sha256,
    }),
    {
      kind: "terminal-fault",
      binding: {
        outcome: "environment-continuity-fault",
        teacher_plan_sha256: "a".repeat(64),
        launchagent_authority: {
          path: "/private/tmp/v1r11-authority/launchagent-authority-evidence.json",
          bytes: 512,
          sha256: "e".repeat(64),
        },
        preformal_authority: {
          path: "/private/tmp/v1r11-authority/preformal-authority-verified-receipt.json",
          bytes: 1_024,
          sha256: "f".repeat(64),
        },
        run_fingerprint: "b".repeat(64),
        runner_pid: 410,
        guardian_pid: 411,
        caffeinate_assertion_holder_pid: 409,
        engines_started: 0,
        engines_reaped: 0,
        first_engine_started_at_ms: null,
        last_engine_reaped_at_ms: null,
        all_yaneuraou_processes_reaped: true,
        terminal_fault_preimage_sha256: "c".repeat(64),
      },
    },
  ).entries;
}

function reasonFor(
  overrides: Partial<Halfkp81Depth18PowerContinuityObservation>,
): string | null {
  const start = observation();
  const currentOverrides = {
    observed_at_ms: start.observed_at_ms + 30_000,
    pmset_previous_raw_event_line_sha256:
      start.pmset_last_raw_event_line_sha256,
    ...overrides,
  };
  return halfkp81Depth18PowerContinuityFailureReasonForTests(
    start,
    start,
    observation(currentOverrides),
  );
}

describe("HalfKP81 v1r11 power continuity", () => {
  it("admits only the exact AC, battery and caffeinate ownership contract", () => {
    expect(() =>
      validateHalfkp81Depth18PowerContinuityAdmissionForTests(observation()),
    ).not.toThrow();

    for (const [overrides, reason] of [
      [{ power_source: "Battery Power" }, "power-source-not-AC-Power"],
      [{ battery_percentage: 79 }, "battery-below-80-percent"],
      [
        { caffeinate_assertion_holder_parent_runner_pid: 408 },
        "caffeinate-assertion-holder-parent-pid-not-exact-runner-pid",
      ],
      [
        { assertion_owner_caffeinate_pid: 999 },
        "assertion-owner-caffeinate-pid-mismatch",
      ],
      [
        { caffeinate_argv: ["/usr/bin/caffeinate", "-i", "/usr/bin/node"] },
        "caffeinate-executable-or-argv-mismatch",
      ],
      [
        { assertions: ["PreventSystemSleep"] },
        "required-caffeinate-assertion-missing",
      ],
      [
        { pmset_last_raw_event_line_sha256: "a".repeat(64) },
        "pmset-anchor-missing-truncated-reset-or-ambiguous",
      ],
    ] as const) {
      expect(() =>
        validateHalfkp81Depth18PowerContinuityAdmissionForTests(
          observation(overrides),
        ),
      ).toThrowError(
        expect.objectContaining<
          Partial<Halfkp81Depth18EnvironmentContinuityError>
        >({
          reason,
        }),
      );
    }
  });

  it("parses bounded pmset battery and exact assertion-owner fixtures", () => {
    expect(
      parseHalfkp81Depth18PmsetBatteryForTests(
        "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t97%; charging;",
      ),
    ).toEqual({ powerSource: "AC Power", batteryPercentage: 97 });
    expect(() =>
      parseHalfkp81Depth18PmsetBatteryForTests("Battery unavailable"),
    ).toThrow(/not parseable/u);

    const assertions = [
      " pid 409(caffeinate): [0x1] PreventSystemSleep named: 'caffeinate command-line tool'",
      " pid 999(caffeinate): [0x2] PreventUserIdleSystemSleep PreventUserIdleDisplaySleep",
      " pid 409(caffeinate): [0x3] PreventUserIdleSystemSleep PreventUserIdleDisplaySleep",
    ].join("\n");
    expect(
      parseHalfkp81Depth18CaffeinateAssertionsForTests(assertions, 409),
    ).toEqual([
      "PreventSystemSleep",
      "PreventUserIdleDisplaySleep",
      "PreventUserIdleSystemSleep",
    ]);
    expect(
      parseHalfkp81Depth18CaffeinateAssertionsForTests(assertions, 999),
    ).toEqual(["PreventUserIdleDisplaySleep", "PreventUserIdleSystemSleep"]);
  });

  it("filters the moving pmset assertion marker without hiding real events", () => {
    const anchor =
      "2027-01-15 00:00:00 -0800 Assertions          Kernel Idle sleep preventers: IODisplayWrangler";
    const synthetic =
      "2027-01-15 00:00:01 -0800 : Showing all currently held IOKit power assertions";
    const wake =
      "2027-01-15 00:00:02 -0800 Wake                \tWake from Normal Sleep";
    expect(
      parseHalfkp81Depth18PmsetLogRowsForTests(
        [anchor, synthetic, wake].join("\n"),
      ),
    ).toEqual([anchor, wake]);
  });

  it("keeps formal execution locked until every ordered preformal receipt is bound", () => {
    expect(() =>
      assertHalfkp81Depth18V1R11SemanticPreformalAuthorityForTests(),
    ).toThrow(/trusted semantic preformal authority is implemented/u);
    const names = [
      "ready-pr",
      "all-required-ci-success",
      "regular-merge",
      "clean-main-source-authentication",
      "preformal-authority-implementation-tests-pass",
      "artifact-verifier-implementation-tests-pass",
      "power-guardian-implementation-tests-pass",
      "candidate-order-gate",
      "known10-probe",
      "pathological-fallback-probe",
      "mixed-load-gate",
      "formal-like-512",
      "ac-power-start-admission-pass",
    ] as const;
    const teacherPlan = {
      path: "/private/tmp/v1r11/teacher-plan.json",
      bytes: 123,
      sha256: "a".repeat(64),
      schema: "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11",
    };
    const requiredOrder = [...names, "formal-teacher"];
    const gates = Object.fromEntries(
      names.map((name, index) => [
        name,
        {
          sequence: index + 1,
          status: "pass",
          evidence: {
            path: `/private/tmp/v1r11-preformal/${name}.json`,
            bytes: 100 + index,
            sha256: String(index).padStart(64, "0"),
            schema: HALFKP81_V1R11_PREFORMAL_GATE_RECEIPT_SCHEMA,
          },
        },
      ]),
    );
    const receipt = {
      schema:
        "shogi-halfkp81-depth18-yaneura-only-preformal-authority-receipt-v1r11",
      status: "all-required-preformal-gates-passed",
      teacher_plan: teacherPlan,
      source_revision: "b".repeat(40),
      required_order: requiredOrder,
      gates,
      authority: {
        may_execute_formal_teacher: true,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    };
    expect(
      validateHalfkp81Depth18V1R11PreformalAuthorityReceiptForTests(receipt, {
        teacherPlan,
        sourceRevision: "b".repeat(40),
        requiredOrder,
      }),
    ).toHaveLength(13);
    expect(() =>
      validateHalfkp81Depth18V1R11PreformalAuthorityReceiptForTests(
        {
          ...receipt,
          gates: {
            ...gates,
            "known10-probe": {
              ...gates["known10-probe"],
              status: "not-run",
            },
          },
        },
        {
          teacherPlan,
          sourceRevision: "b".repeat(40),
          requiredOrder,
        },
      ),
    ).toThrow(/known10-probe order\/status differs/u);
    expect(() =>
      validateHalfkp81Depth18V1R11PreformalAuthorityReceiptForTests(receipt, {
        teacherPlan,
        sourceRevision: "b".repeat(40),
        requiredOrder: requiredOrder.slice(4),
      }),
    ).toThrow(/required order differs/u);
  });

  it("fails the production wrapper at the hard lock before plan IO or authority writes", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "v1r11-hard-lock-test-"),
    );
    const missingPlan = path.join(root, "does-not-exist.json");
    const authorityBefore = await fs.promises
      .lstat(HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_AUTHORITY_DIRECTORY)
      .then((metadata) => ({
        exists: true,
        dev: metadata.dev,
        ino: metadata.ino,
        mtimeMs: metadata.mtimeMs,
      }))
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return { exists: false } as const;
      });
    try {
      await expect(
        runHalfkp81Depth18YaneuraOnlyTeacherV1R11(missingPlan),
      ).rejects.toThrow(/trusted semantic preformal authority is implemented/u);
      await expect(fs.promises.lstat(missingPlan)).rejects.toMatchObject({
        code: "ENOENT",
      });
      const authorityAfter = await fs.promises
        .lstat(HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_AUTHORITY_DIRECTORY)
        .then((metadata) => ({
          exists: true,
          dev: metadata.dev,
          ino: metadata.ino,
          mtimeMs: metadata.mtimeMs,
        }))
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
          return { exists: false } as const;
        });
      expect(authorityAfter).toEqual(authorityBefore);
      expect(await fs.promises.readdir(root)).toEqual([]);
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });

  it("binds formal authority to the exact running one-shot LaunchAgent job", () => {
    const sourceRevision = "b".repeat(40);
    const repositoryRoot = "/private/repository";
    const label =
      "com.meetyudai.shogi.halfkp81-depth18-yaneura-only-v1r11-minimal-r1-bbbbbbbb";
    const runnerUtilityArgv = [
      process.execPath,
      "-r",
      `${repositoryRoot}/node_modules/tsx/dist/cjs/index.cjs`,
      `${repositoryRoot}/ml/run-halfkp81-depth18-v1r11-formal-child.ts`,
    ];
    const privateRoot = "/private/v1r11-launch";
    const launchctl = [
      `gui/501/${label} = {`,
      "\tactive count = 1",
      `\tpath = ${privateRoot}/${label}.plist`,
      "\ttype = LaunchAgent",
      "\tstate = running",
      "",
      `\tprogram = ${process.execPath}`,
      "\targuments = {",
      ...runnerUtilityArgv.map((value) => `\t\t${value}`),
      "\t}",
      "",
      `\tworking directory = ${repositoryRoot}`,
      `\tstdout path = ${privateRoot}/${label}.stdout.log`,
      `\tstderr path = ${privateRoot}/${label}.stderr.log`,
      "\tpid = 410",
      "\tproperties = runatload | launch only once | inferred program",
      "}",
      "",
    ].join("\n");
    const context = {
      uid: 501,
      sourceRevision,
      xpcServiceName: label,
      runnerPid: 410,
      runnerUtilityArgv,
      repositoryRoot,
    };
    expect(
      validateHalfkp81Depth18V1R11LaunchdAuthorityForTests(launchctl, context),
    ).toMatchObject({
      label,
      pid: 410,
      programArguments: runnerUtilityArgv,
    });
    const productionPlist = `/Users/test/Library/LaunchAgents/${label}.plist`;
    const productionStdout =
      "/Users/test/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11/formal-launchagent.stdout.log";
    const productionStderr =
      "/Users/test/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11/formal-launchagent.stderr.log";
    const productionLayout = launchctl
      .replace(`${privateRoot}/${label}.plist`, productionPlist)
      .replace(`${privateRoot}/${label}.stdout.log`, productionStdout)
      .replace(`${privateRoot}/${label}.stderr.log`, productionStderr);
    expect(
      validateHalfkp81Depth18V1R11LaunchdAuthorityForTests(productionLayout, {
        ...context,
        expectedPlistPath: productionPlist,
        expectedStdoutPath: productionStdout,
        expectedStderrPath: productionStderr,
      }),
    ).toMatchObject({
      plistPath: productionPlist,
      stdoutPath: productionStdout,
      stderrPath: productionStderr,
    });
    expect(() =>
      validateHalfkp81Depth18V1R11LaunchdAuthorityForTests(launchctl, {
        ...context,
        xpcServiceName: `${label}-spoofed`,
      }),
    ).toThrow(/service name differs/u);
    expect(() =>
      validateHalfkp81Depth18V1R11LaunchdAuthorityForTests(
        launchctl.replace("\tpid = 410", "\tpid = 999"),
        context,
      ),
    ).toThrow(/program identity differs/u);
    expect(() =>
      validateHalfkp81Depth18V1R11LaunchdAuthorityForTests(
        launchctl.replace("\t-r", "\t--require"),
        context,
      ),
    ).toThrow(/program identity differs/u);
    expect(() =>
      validateHalfkp81Depth18V1R11LaunchdAuthorityForTests(
        launchctl.replace(`${label}.plist`, `${label}.launch-agent.plist`),
        context,
      ),
    ).toThrow(/private paths differ/u);
  });

  it("bounds guardian shutdown through disconnect, SIGTERM, and SIGKILL", async () => {
    const signals: NodeJS.Signals[] = [];
    let exitListener: (() => void) | undefined;
    const child = {
      exitCode: null,
      signalCode: null,
      connected: true,
      once(_event: "exit", listener: () => void) {
        exitListener = listener;
        return child;
      },
      disconnect() {
        child.connected = false;
      },
      kill(signal: NodeJS.Signals) {
        signals.push(signal);
        return true;
      },
    };
    const waits = [false, false, true];
    await closeHalfkp81Depth18GuardianChildForTests(
      child,
      async (_exited, timeoutMs) => {
        expect(timeoutMs).toBe(5_000);
        const result = waits.shift();
        if (result === undefined) throw new Error("unexpected close wait");
        if (result) exitListener?.();
        return result;
      },
    );
    expect(child.connected).toBe(false);
    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(waits).toEqual([]);
  });

  it.each(["Sleep", "DarkWake", "Wake", "Hibernate"] as const)(
    "fails closed on a %s event even while AC and assertions remain valid",
    (event) => {
      const message =
        event === "Hibernate"
          ? "Wake from Hibernate"
          : `${event} event message`;
      const line = `2027-01-15 00:00:30 -0800 ${
        event === "Hibernate" ? "Wake" : event
      }                \t${message}`;
      expect(reasonFor({ pmset_new_raw_event_lines: [line] })).toBe(
        `power-event-${event}`,
      );
    },
  );

  it("classifies a wake/gap before a search timeout can be published", () => {
    const start = observation();
    const afterWake = observation({
      observed_at_ms:
        start.observed_at_ms +
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_MAXIMUM_GAP_MS +
        1,
      pmset_new_raw_event_lines: [
        "2027-01-15 00:01:31 -0800 Wake                \twake event",
      ],
      pmset_previous_raw_event_line_sha256:
        start.pmset_last_raw_event_line_sha256,
    });
    expect(
      halfkp81Depth18PowerContinuityFailureReasonForTests(
        start,
        start,
        afterWake,
      ),
    ).toBe("heartbeat-gap-greater-than-90000ms");
  });

  it("does not mistake near-collision pmset columns or messages for events", () => {
    for (const line of [
      "2027-01-15 00:00:30 -0800 Wake Requests        request=SleepService",
      "2027-01-15 00:00:30 -0800 WakeTime             WakeTime: 0.136 sec",
      "2027-01-15 00:00:30 -0800 Kernel Client Acks   Delays to Sleep notifications",
      "2027-01-15 00:00:30 -0800 Assertions           message mentions Wake and DarkWake",
    ]) {
      expect(classifyHalfkp81Depth18PmsetEventLineForTests(line)).toBeNull();
    }
  });

  it("does not apply the admission-only battery threshold to later AC samples", () => {
    expect(reasonFor({ battery_percentage: 50 })).toBeNull();
  });

  it("fails closed on boot changes and a guardian heartbeat gap", () => {
    expect(reasonFor({ boot_session_identity: "boot-b" })).toBe(
      "boot-session-identity-change",
    );
    expect(
      reasonFor({
        observed_at_ms:
          1_800_000_000_000 +
          HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_MAXIMUM_GAP_MS +
          1,
      }),
    ).toBe("heartbeat-gap-greater-than-90000ms");
  });

  it("uses an independent fake-clock watchdog while a search is still blocked", () => {
    let now = 10_000;
    let callback: (() => void) | undefined;
    let cancelled = false;
    const failures: string[] = [];
    const watchdog = startHalfkp81Depth18PowerHeartbeatWatchdogForTests({
      now: () => now,
      schedule: (value, intervalMs) => {
        expect(intervalMs).toBe(30_000);
        callback = value;
        return 7;
      },
      cancel: (handle) => {
        expect(handle).toBe(7);
        cancelled = true;
      },
      fail: (reason) => failures.push(reason),
    });
    now += 89_000;
    callback?.();
    expect(failures).toEqual([]);
    watchdog.heartbeat();
    now += 90_001;
    callback?.();
    expect(failures).toEqual(["guardian-heartbeat-gap-greater-than-90000ms"]);
    callback?.();
    expect(failures).toHaveLength(1);
    watchdog.close();
    expect(cancelled).toBe(true);
  });

  it("rejects malformed guardian IPC instead of letting it refresh the watchdog", () => {
    const schema =
      HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_GUARDIAN_IPC_SCHEMA;
    expect(
      validateHalfkp81Depth18PowerGuardianMessageForTests({
        schema,
        type: "ready",
        observedAtMs: 100,
        guardianPid: 411,
        caffeinatePid: 409,
      }),
    ).toMatchObject({ type: "ready", guardianPid: 411 });
    expect(
      validateHalfkp81Depth18PowerGuardianMessageForTests({
        schema,
        type: "fatal",
        reason: "configuration missing before ready",
      }),
    ).toMatchObject({ type: "fatal" });
    expect(() =>
      validateHalfkp81Depth18PowerGuardianMessageForTests({
        type: "heartbeat",
        observedAtMs: 130,
      }),
    ).toThrow(/fields differ/u);
    expect(() =>
      validateHalfkp81Depth18PowerGuardianMessageForTests({
        schema,
        type: "heartbeat",
        observedAtMs: 130,
        ignored: true,
      }),
    ).toThrow(/fields differ/u);
    expect(() =>
      validateHalfkp81Depth18PowerGuardianMessageForTests({
        schema,
        type: "finalized",
        requestId: 2,
        ledger: { path: "relative", bytes: 1, sha256: "a".repeat(64) },
        receipt: {
          path: "/private/tmp/receipt.json",
          bytes: 1,
          sha256: "b".repeat(64),
        },
      }),
    ).toThrow(/ledger IPC identity differs/u);
  });

  it("builds and verifies a canonical hash-chained closed ledger", () => {
    const admitted = appendHalfkp81Depth18PowerContinuityObservationForTests(
      undefined,
      observation(),
    );
    const heartbeat = appendHalfkp81Depth18PowerContinuityObservationForTests(
      admitted,
      observation({
        observed_at_ms: 1_800_000_030_000,
        pmset_previous_raw_event_line_sha256:
          admitted.previous.pmset_last_raw_event_line_sha256,
      }),
    );
    const closed = appendHalfkp81Depth18PowerContinuityObservationForTests(
      heartbeat,
      observation({
        observed_at_ms: 1_800_000_060_000,
        pmset_previous_raw_event_line_sha256:
          heartbeat.previous.pmset_last_raw_event_line_sha256,
      }),
      {
        kind: "final",
        binding: {
          outcome: "success",
          teacher_plan_sha256: "a".repeat(64),
          launchagent_authority: {
            path: "/private/tmp/v1r11-authority/launchagent-authority-evidence.json",
            bytes: 512,
            sha256: "e".repeat(64),
          },
          preformal_authority: {
            path: "/private/tmp/v1r11-authority/preformal-authority-verified-receipt.json",
            bytes: 1_024,
            sha256: "f".repeat(64),
          },
          all_yaneuraou_processes_reaped: true,
          run_fingerprint: "b".repeat(64),
          runner_pid: 410,
          guardian_pid: 411,
          caffeinate_assertion_holder_pid: 409,
          engines_started: 8,
          engines_reaped: 8,
          first_engine_started_at_ms: 1_800_000_001_000,
          last_engine_reaped_at_ms: 1_800_000_059_000,
        },
      },
    );

    expect(
      verifyHalfkp81Depth18PowerContinuityLedgerForTests(closed.entries),
    ).toEqual({
      samples: 3,
      maximum_gap_ms: 30_000,
      final_entry_sha256: closed.entries[2]?.entry_sha256,
    });
    expect(
      verifyIndependentV1R11PowerSuccessLedger(closed.entries),
    ).toMatchObject({ samples: 3, maximum_gap_ms: 30_000 });
    const zeroEngineFinal = independentEntry({
      ...closed.entries[2]!,
      binding: {
        ...closed.entries[2]!.binding!,
        engines_started: 0,
        engines_reaped: 0,
      },
    });
    expect(() =>
      verifyIndependentV1R11PowerSuccessLedger([
        closed.entries[0]!,
        closed.entries[1]!,
        zeroEngineFinal,
      ]),
    ).toThrow(/binding differs/u);
  });

  it("rejects tampering, missing finalization and non-pass rows", () => {
    const admitted = appendHalfkp81Depth18PowerContinuityObservationForTests(
      undefined,
      observation(),
    );
    expect(() =>
      verifyHalfkp81Depth18PowerContinuityLedgerForTests(admitted.entries),
    ).toThrow(/lacks admission and final rows/u);

    const closed = appendHalfkp81Depth18PowerContinuityObservationForTests(
      admitted,
      observation({
        observed_at_ms: 1_800_000_030_000,
        pmset_previous_raw_event_line_sha256:
          admitted.previous.pmset_last_raw_event_line_sha256,
      }),
      {
        kind: "final",
        binding: {
          outcome: "success",
          teacher_plan_sha256: "a".repeat(64),
          launchagent_authority: {
            path: "/private/tmp/v1r11-authority/launchagent-authority-evidence.json",
            bytes: 512,
            sha256: "e".repeat(64),
          },
          preformal_authority: {
            path: "/private/tmp/v1r11-authority/preformal-authority-verified-receipt.json",
            bytes: 1_024,
            sha256: "f".repeat(64),
          },
          run_fingerprint: "b".repeat(64),
          runner_pid: 410,
          guardian_pid: 411,
          caffeinate_assertion_holder_pid: 409,
          engines_started: 8,
          engines_reaped: 8,
          first_engine_started_at_ms: 1_800_000_001_000,
          last_engine_reaped_at_ms: 1_800_000_029_000,
          all_yaneuraou_processes_reaped: true,
        },
      },
    );
    const tampered = [closed.entries[0]!, { ...closed.entries[1]!, gap_ms: 1 }];
    expect(() =>
      verifyHalfkp81Depth18PowerContinuityLedgerForTests(tampered),
    ).toThrow(/row 2 differs/u);
  });

  it("independently rejects every sealed success-ledger continuity mutation", () => {
    const fixture = independentSuccessFixture();
    const admission = fixture[0]!;
    const final = fixture[1]!;
    const resealFinal = (
      overrides: Readonly<Record<string, unknown>>,
    ): Readonly<IndependentV1R11PowerLedgerEntry> =>
      independentEntry({ ...final, ...overrides });
    const processDriftObservation = {
      ...final.observation,
      guardian_pid: final.observation.guardian_pid + 1,
    };
    const mutations = [
      {
        label: "first engine before admission",
        entries: [
          admission,
          resealFinal({
            binding: {
              ...final.binding!,
              first_engine_started_at_ms:
                admission.observation.observed_at_ms - 1,
            },
          }),
        ],
        error: /success coverage differs/u,
      },
      {
        label: "last engine after final sample",
        entries: [
          admission,
          resealFinal({
            binding: {
              ...final.binding!,
              last_engine_reaped_at_ms: final.observation.observed_at_ms + 1,
            },
          }),
        ],
        error: /success coverage differs/u,
      },
      {
        label: "pmset ordinal drift",
        entries: [
          admission,
          resealFinal({
            observation: {
              ...final.observation,
              pmset_event_ordinal: final.observation.pmset_event_ordinal + 1,
            },
          }),
        ],
        error: /row 2 differs/u,
      },
      {
        label: "runner process identity drift",
        entries: [
          admission,
          resealFinal({
            observation: processDriftObservation,
            binding: {
              ...final.binding!,
              guardian_pid: processDriftObservation.guardian_pid,
            },
          }),
        ],
        error: /row 2 differs/u,
      },
      {
        label: "malformed row shape",
        entries: [admission, resealFinal({ unexpected: true })],
        error: /keys differ/u,
      },
    ] as const;
    for (const mutation of mutations) {
      expect(
        () => verifyIndependentV1R11PowerSuccessLedger(mutation.entries),
        mutation.label,
      ).toThrow(mutation.error);
    }
    expect(() => verifyIndependentV1R11PowerSuccessLedger([])).toThrow(
      /endpoints differ/u,
    );
    expect(() => verifyIndependentV1R11PowerSuccessLedger([admission])).toThrow(
      /endpoints differ/u,
    );
  });

  it("seals and independently verifies an environment terminal-fault ledger", () => {
    const admitted = appendHalfkp81Depth18PowerContinuityObservationForTests(
      undefined,
      observation(),
    );
    const faulted = appendHalfkp81Depth18PowerContinuityObservationForTests(
      admitted,
      observation({
        observed_at_ms: 1_800_000_030_000,
        power_source: "Battery Power",
        pmset_previous_raw_event_line_sha256:
          admitted.previous.pmset_last_raw_event_line_sha256,
      }),
      {
        kind: "terminal-fault",
        binding: {
          outcome: "environment-continuity-fault",
          teacher_plan_sha256: "a".repeat(64),
          launchagent_authority: {
            path: "/private/tmp/v1r11-authority/launchagent-authority-evidence.json",
            bytes: 512,
            sha256: "e".repeat(64),
          },
          preformal_authority: {
            path: "/private/tmp/v1r11-authority/preformal-authority-verified-receipt.json",
            bytes: 1_024,
            sha256: "f".repeat(64),
          },
          run_fingerprint: "b".repeat(64),
          runner_pid: 410,
          guardian_pid: 411,
          caffeinate_assertion_holder_pid: 409,
          engines_started: 8,
          engines_reaped: 8,
          first_engine_started_at_ms: 1_800_000_001_000,
          last_engine_reaped_at_ms: 1_800_000_029_000,
          all_yaneuraou_processes_reaped: true,
          terminal_fault_preimage_sha256: "c".repeat(64),
        },
      },
    );
    expect(
      verifyHalfkp81Depth18PowerContinuityFaultLedgerForTests(faulted.entries),
    ).toEqual({
      samples: 2,
      fault_reason: "power-source-not-AC-Power",
      final_entry_sha256: faulted.entries[1]?.entry_sha256,
    });
    expect(
      verifyIndependentV1R11PowerFaultLedger(faulted.entries),
    ).toMatchObject({
      samples: 2,
      fault_reason: "power-source-not-AC-Power",
    });
    expect(() =>
      verifyHalfkp81Depth18PowerContinuityLedgerForTests(faulted.entries),
    ).toThrow(/row 2 differs/u);
    expect(() =>
      appendHalfkp81Depth18PowerContinuityObservationForTests(
        admitted,
        observation({
          observed_at_ms: 1_800_000_030_000,
          power_source: "Battery Power",
          pmset_previous_raw_event_line_sha256:
            admitted.previous.pmset_last_raw_event_line_sha256,
        }),
        {
          kind: "terminal-fault",
          binding: {
            ...(faulted.entries[1]!.binding as NonNullable<
              (typeof faulted.entries)[number]["binding"]
            >),
            last_engine_reaped_at_ms: 1_800_000_031_000,
          },
        },
      ),
    ).toThrow(/fault coverage differs/u);
  });

  it("independently accepts a sealed >90s heartbeat-gap terminal fault", () => {
    const admitted = appendHalfkp81Depth18PowerContinuityObservationForTests(
      undefined,
      observation(),
    );
    const terminalObservation = observation({
      observed_at_ms: 1_800_000_090_001,
      pmset_previous_raw_event_line_sha256:
        admitted.previous.pmset_last_raw_event_line_sha256,
    });
    const faulted = appendHalfkp81Depth18PowerContinuityObservationForTests(
      admitted,
      terminalObservation,
      {
        kind: "terminal-fault",
        binding: {
          outcome: "environment-continuity-fault",
          teacher_plan_sha256: "a".repeat(64),
          launchagent_authority: {
            path: "/private/tmp/v1r11-authority/launchagent-authority-evidence.json",
            bytes: 512,
            sha256: "e".repeat(64),
          },
          preformal_authority: {
            path: "/private/tmp/v1r11-authority/preformal-authority-verified-receipt.json",
            bytes: 1_024,
            sha256: "f".repeat(64),
          },
          run_fingerprint: "b".repeat(64),
          runner_pid: 410,
          guardian_pid: 411,
          caffeinate_assertion_holder_pid: 409,
          engines_started: 0,
          engines_reaped: 0,
          first_engine_started_at_ms: null,
          last_engine_reaped_at_ms: null,
          all_yaneuraou_processes_reaped: true,
          terminal_fault_preimage_sha256: "c".repeat(64),
        },
      },
    );
    expect(
      verifyIndependentV1R11PowerFaultLedger(faulted.entries),
    ).toMatchObject({
      samples: 2,
      fault_reason: "heartbeat-gap-greater-than-90000ms",
    });
  });

  it("independently rejects terminal-fault timestamp and classification mutations", () => {
    const fixture = independentFaultFixture();
    const admission = fixture[0]!;
    const terminal = fixture[1]!;
    const resealTerminal = (
      overrides: Readonly<Record<string, unknown>>,
    ): Readonly<IndependentV1R11PowerLedgerEntry> =>
      independentEntry({ ...terminal, ...overrides });
    const mutations = [
      {
        label: "zero engines with non-null timestamps",
        terminal: resealTerminal({
          binding: {
            ...terminal.binding!,
            first_engine_started_at_ms: admission.observation.observed_at_ms,
          },
        }),
        error: /binding differs/u,
      },
      {
        label: "started engines with null timestamps",
        terminal: resealTerminal({
          binding: {
            ...terminal.binding!,
            engines_started: 1,
            engines_reaped: 1,
          },
        }),
        error: /binding differs/u,
      },
      {
        label: "fault reaping after terminal sample",
        terminal: resealTerminal({
          binding: {
            ...terminal.binding!,
            engines_started: 1,
            engines_reaped: 1,
            first_engine_started_at_ms:
              admission.observation.observed_at_ms + 1,
            last_engine_reaped_at_ms: terminal.observation.observed_at_ms + 1,
          },
        }),
        error: /fault coverage differs/u,
      },
      {
        label: "wrong terminal classification",
        terminal: resealTerminal({
          fault_reason: "heartbeat-gap-greater-than-90000ms",
        }),
        error: /fault classification differs/u,
      },
    ] as const;
    for (const mutation of mutations) {
      expect(
        () =>
          verifyIndependentV1R11PowerFaultLedger([
            admission,
            mutation.terminal,
          ]),
        mutation.label,
      ).toThrow(mutation.error);
    }
  });

  it("rejects the provisional pre-frozen fault artifact contract", () => {
    const root = "/private/tmp/v1r11-fault-test";
    const outputs = {
      directory: root,
      plan_json: `${root}/teacher-plan.json`,
      fit_jsonl: `${root}/fit.jsonl`,
      tune_jsonl: `${root}/tune.jsonl`,
      sealed_jsonl: `${root}/sealed.jsonl`,
      work_jsonl: `${root}/teacher-work.jsonl`,
      milestone_100_json: `${root}/teacher-milestone-100.json`,
      milestone_500_json: `${root}/teacher-milestone-500.json`,
      terminal_fault_json: `${root}/teacher-terminal-fault.json`,
      receipt_json: `${root}/teacher-receipt.json`,
      verified_artifact_receipt_json: `${root}/teacher-verified.json`,
      power_continuity_jsonl: `${root}/power-continuity.jsonl`,
      power_continuity_receipt_json: `${root}/power-continuity-receipt.json`,
    };
    const planSchema =
      "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11";
    const authorityDirectory =
      "$HOME/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority";
    const authorityOutputNamespace = {
      initial_directory_collision_policy:
        "create-only-fail-if-authority-directory-already-exists",
      artifact_collision_policy: "create-only-fail-if-specific-target-exists",
      directory: authorityDirectory,
      directory_mode_octal: "0700",
      directory_dev_ino_owner_and_realpath_must_be_fixed_at_creation_and_revalidated_before_each_publish: true,
      gate_artifact_directory: `${authorityDirectory}/preformal-gates`,
      preformal_authority_ledger_jsonl: `${authorityDirectory}/preformal-authority-ledger.jsonl`,
      preformal_engine_gate_authority_verified_receipt_json: `${authorityDirectory}/preformal-engine-gate-authority-verified-receipt.json`,
      preformal_authority_receipt_json: `${authorityDirectory}/preformal-authority-receipt.json`,
      preformal_authority_verified_receipt_json: `${authorityDirectory}/preformal-authority-verified-receipt.json`,
      preformal_terminal_fault_json: `${authorityDirectory}/preformal-terminal-fault.json`,
      launchagent_launchctl_print_txt: `${authorityDirectory}/launchagent-launchctl-print.txt`,
      launchagent_launchctl_print_stderr_txt: `${authorityDirectory}/launchagent-launchctl-print.stderr.txt`,
      launchagent_plist_snapshot: `${authorityDirectory}/launchagent.plist.snapshot`,
      launchagent_authority_evidence_json: `${authorityDirectory}/launchagent-authority-evidence.json`,
    };
    const plan = snapshot(outputs.plan_json, {
      schema: planSchema,
      outputs,
      authority_output_namespace: authorityOutputNamespace,
    });
    const launchAgentAuthority = snapshot(
      `${process.env.HOME}/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority/launchagent-authority-evidence.json`,
      { schema: "launchagent-authority-fixture" },
    );
    const preformalAuthority = snapshot(
      `${process.env.HOME}/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority/preformal-authority-verified-receipt.json`,
      { schema: "preformal-authority-verified-fixture" },
    );
    const runFingerprint = "b".repeat(64);
    const message = "environment continuity failed: power-source-not-AC-Power";
    const preimage = {
      schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_FAULT_SCHEMA,
      status: "terminal-fault-family-stopped",
      teacher_plan: { ...plan.identity, schema: planSchema },
      run_fingerprint: runFingerprint,
      completed_parents: 4,
      technical_faults: 1,
      incomplete_parents: 8_188,
      message,
      authority: {
        may_resume_same_family: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    };
    const preimageDigest = crypto
      .createHash("sha256")
      .update(canonicalHalfkp81Depth18Json(preimage))
      .digest("hex");
    const admitted = appendHalfkp81Depth18PowerContinuityObservationForTests(
      undefined,
      observation(),
    );
    const faulted = appendHalfkp81Depth18PowerContinuityObservationForTests(
      admitted,
      observation({
        observed_at_ms: 1_800_000_030_000,
        power_source: "Battery Power",
        pmset_previous_raw_event_line_sha256:
          admitted.previous.pmset_last_raw_event_line_sha256,
      }),
      {
        kind: "terminal-fault",
        binding: {
          outcome: "environment-continuity-fault",
          teacher_plan_sha256: plan.identity.sha256,
          launchagent_authority: launchAgentAuthority.identity,
          preformal_authority: preformalAuthority.identity,
          run_fingerprint: runFingerprint,
          runner_pid: 410,
          guardian_pid: 411,
          caffeinate_assertion_holder_pid: 409,
          engines_started: 8,
          engines_reaped: 8,
          first_engine_started_at_ms: 1_800_000_001_000,
          last_engine_reaped_at_ms: 1_800_000_029_000,
          all_yaneuraou_processes_reaped: true,
          terminal_fault_preimage_sha256: preimageDigest,
        },
      },
    );
    const ledgerBytes = Buffer.from(
      `${faulted.entries.map(canonicalHalfkp81Depth18Json).join("\n")}\n`,
      "utf8",
    );
    const ledger: Readonly<Halfkp81Depth18PrivateSnapshot> = Object.freeze({
      bytes: new Uint8Array(ledgerBytes),
      identity: Object.freeze({
        path: outputs.power_continuity_jsonl,
        bytes: ledgerBytes.byteLength,
        sha256: crypto.createHash("sha256").update(ledgerBytes).digest("hex"),
      }),
    });
    const verification =
      verifyHalfkp81Depth18PowerContinuityFaultLedgerForTests(faulted.entries);
    const binding = faulted.entries[1]!.binding;
    const powerReceipt = snapshot(outputs.power_continuity_receipt_json, {
      schema:
        HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_SCHEMA,
      status: "environment-continuity-fault",
      teacher_plan: { ...plan.identity, schema: planSchema },
      run_fingerprint: runFingerprint,
      ledger: ledger.identity,
      verification,
      binding,
      authority: {
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    });
    const terminalFault = snapshot(outputs.terminal_fault_json, {
      ...preimage,
      power_continuity: {
        ledger: ledger.identity,
        receipt: powerReceipt.identity,
        launchagent_authority: launchAgentAuthority.identity,
        preformal_authority: preformalAuthority.identity,
      },
    });
    const request = {
      plan,
      ledger,
      receipt: powerReceipt,
      launchAgentAuthority,
      preformalAuthority,
      terminalFault,
      currentPmsetLogRows: [
        ...Array.from(
          { length: 21 },
          (_, index) =>
            `2027-01-14 23:59:${String(index).padStart(2, "0")} -0800 Assertions prior-${index}`,
        ),
        observation().pmset_anchor_raw_event_line,
      ],
    };
    expect(() =>
      validateHalfkp81Depth18V1R11EnvironmentFaultArtifacts(request),
    ).toThrow(/run identity contract fields are not exact/u);
    const mutated = snapshot(outputs.terminal_fault_json, {
      ...preimage,
      message: `${message} mutated`,
      power_continuity: {
        ledger: ledger.identity,
        receipt: powerReceipt.identity,
        launchagent_authority: launchAgentAuthority.identity,
        preformal_authority: preformalAuthority.identity,
      },
    });
    expect(() =>
      validateHalfkp81Depth18V1R11EnvironmentFaultArtifacts({
        ...request,
        terminalFault: mutated,
      }),
    ).toThrow(/run identity contract fields are not exact/u);
    const badAccounting = snapshot(outputs.terminal_fault_json, {
      ...preimage,
      completed_parents: 3,
      power_continuity: {
        ledger: ledger.identity,
        receipt: powerReceipt.identity,
        launchagent_authority: launchAgentAuthority.identity,
        preformal_authority: preformalAuthority.identity,
      },
    });
    expect(() =>
      validateHalfkp81Depth18V1R11EnvironmentFaultArtifacts({
        ...request,
        terminalFault: badAccounting,
      }),
    ).toThrow(/run identity contract fields are not exact/u);
  });
});
