import { describe, expect, it } from "vitest";

import {
  v1r11CanonicalLine,
  v1r11Sha256,
  type V1R11AuthorityFileIdentity,
} from "../../../ml/halfkp81-depth18-v1r11-authority-io";
import { buildHalfkp81V1R11StageBOneShotPlist } from "../../../ml/halfkp81-depth18-v1r11-stage-b-launchagent-supervisor";
import { validateHalfkp81V1R11StageBExecutionEnvelopeForTests } from "../../../ml/produce-halfkp81-depth18-v1r11-stage-bc";
import { verifyHalfkp81V1R11All13StageBParentEnvelopeForTests } from "../../../ml/verify-halfkp81-depth18-v1r11-staged-authority";

const GATE = "candidate-order-gate" as const;
const RUNNER = 410;
const HOLDER = 411;
const ENGINE = 412;
const GUARDIAN = 413;
const RUNNER_START = "Sun Aug  2 11:00:00 2026";
const HOLDER_START = "Sun Aug  2 11:00:01 2026";
const ENGINE_START = "Sun Aug  2 11:00:02 2026";
const GUARDIAN_START = "Sun Aug  2 11:00:03 2026";
const UID = 501;
const FINGERPRINT = "b".repeat(64);
const LABEL = `com.meetyudai.shogi.v1r11-stage-b-08-candidate-order-gate-${FINGERPRINT.slice(0, 12)}`;
const WORKING = "/tmp/v1r11-repository";
const AUTHORITY = "/tmp/v1r11-authority";
const PRIVATE = `/tmp/.halfkp81-depth18-yaneura-only-v1r11-stage-b-private/08-${GATE}-${FINGERPRINT}`;
const PLIST = `${PRIVATE}/${LABEL}.plist`;
const STDOUT = `${PRIVATE}/${LABEL}.stdout`;
const STDERR = `${PRIVATE}/${LABEL}.stderr`;
const COMMAND = Object.freeze([
  "/absolute/node",
  "-r",
  `${WORKING}/node_modules/tsx/dist/cjs/index.cjs`,
  `${WORKING}/ml/run-halfkp81-depth18-v1r11-stage-b-engine-gate.ts`,
  "--gate",
  GATE,
  "--sequence",
  "8",
  "--stage-b-run-fingerprint",
  FINGERPRINT,
  "--stage-b-epoch-namespace",
  `${AUTHORITY}/preformal-gates/08-${GATE}.stage-b-epoch`,
  "--stage-a-receipt",
  "/tmp/v1r11/stage-a.json",
]);
const PROGRAM = Object.freeze(["/usr/bin/caffeinate", "-dimsu", ...COMMAND]);
const STAGE_A: V1R11AuthorityFileIdentity = Object.freeze({
  path: "/tmp/v1r11/stage-a.json",
  bytes: 123,
  sha256: "a".repeat(64),
  schema:
    "shogi-halfkp81-depth18-yaneura-only-preformal-engine-gate-authority-verified-receipt-v1r11",
});
const EPOCH = `${AUTHORITY}/preformal-gates/08-candidate-order-gate.stage-b-epoch`;

const CONTEXT = Object.freeze({
  gate: GATE,
  sequence: 8,
  fingerprint: FINGERPRINT,
  epochNamespace: EPOCH,
  stageAReceipt: STAGE_A,
  expectedLabel: LABEL,
  expectedCommand: COMMAND,
  expectedWorkingDirectory: WORKING,
  expectedPlistPath: PLIST,
  expectedStdoutPath: STDOUT,
  expectedStderrPath: STDERR,
});
const ALL13_CONTEXT = Object.freeze({
  gate: GATE,
  sequence: 8,
  fingerprint: FINGERPRINT,
  epochNamespace: EPOCH,
  stageAReceipt: STAGE_A,
  repositoryRoot: WORKING,
  authorityDirectory: AUTHORITY,
  nodePath: "/absolute/node",
});

function rawIdentity(raw: Buffer) {
  return Object.freeze({
    bytes: raw.byteLength,
    sha256: v1r11Sha256(raw),
    base64: raw.toString("base64"),
  });
}

function fixture() {
  const plistRaw = buildHalfkp81V1R11StageBOneShotPlist({
    label: LABEL,
    workingDirectory: WORKING,
    stdoutPath: STDOUT,
    stderrPath: STDERR,
    utilityArgv: COMMAND,
  });
  const plistSource = Object.freeze({
    path: PLIST,
    bytes: plistRaw.byteLength,
    sha256: v1r11Sha256(plistRaw),
    dev: 10,
    ino: 20,
    uid: UID,
    mode: 0o600,
    nlink: 1,
  });
  const launchctl = Buffer.from(
    [
      `gui/${UID}/${LABEL} = {`,
      `\tpath = ${PLIST}`,
      "\ttype = LaunchAgent",
      "\tstate = running",
      "\tprogram = /usr/bin/caffeinate",
      "\targuments = {",
      ...PROGRAM.map((entry) => `\t\t${entry}`),
      "\t}",
      `\tworking directory = ${WORKING}`,
      `\tstdout path = ${STDOUT}`,
      `\tstderr path = ${STDERR}`,
      `\tpid = ${RUNNER}`,
      "\tproperties = launch only once",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  const launch = Object.freeze({
    schema: `shogi-halfkp81-depth18-yaneura-only-v1r11-${GATE}-stage-b-launchagent-evidence-v1`,
    status:
      "preformal-engine-gate-live-LaunchAgent-semantics-verified-no-standalone-authority",
    gate: GATE,
    stage_b_run_fingerprint: FINGERPRINT,
    stage_b_epoch_namespace: EPOCH,
    stage_a_verified_receipt: STAGE_A,
    label: LABEL,
    uid: UID,
    xpc_service_name: LABEL,
    runner_pid: RUNNER,
    working_directory: WORKING,
    stdout_path: STDOUT,
    stderr_path: STDERR,
    program_arguments: PROGRAM,
    runner_utility_argv: COMMAND,
    caffeinate_holder: Object.freeze({
      pid: HOLDER,
      parent_runner_pid: RUNNER,
      assertion_owner_pid: HOLDER,
      executable: "/usr/bin/caffeinate",
      argv: PROGRAM,
    }),
    required_assertions: Object.freeze([
      "PreventSystemSleep",
      "PreventUserIdleSystemSleep",
      "PreventUserIdleDisplaySleep",
    ]),
    launchctl_command: Object.freeze([
      "/bin/launchctl",
      "print",
      `gui/${UID}/${LABEL}`,
    ]),
    launchctl_exit_code: 0,
    launchctl_stdout_base64: launchctl.toString("base64"),
    launchctl_stderr_base64: "",
    plist_source: plistSource,
    plist_snapshot_base64: plistRaw.toString("base64"),
    authority: Object.freeze({
      may_execute_preformal_engine_gates: false,
      may_execute_formal_teacher: false,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    }),
  });
  const cleanup = Object.freeze({
    scheduling_stopped: true,
    engines_started: 1,
    engines_terminated: 1,
    engines_reaped: 1,
    remaining_engine_pids: Object.freeze([]),
    children_reaped: true,
    next_job_started: false,
  });
  const osReap = Object.freeze({
    observer_pid: RUNNER,
    engine_pids: Object.freeze([ENGINE]),
    engine_pgids: Object.freeze([RUNNER]),
    engine_start_tokens: Object.freeze([ENGINE_START]),
    direct_parent_matches: 1,
    dedicated_process_groups_verified: 1,
    kill_zero_esrch_after_close: 1,
    ps_rows_absent_after_close: 1,
    process_group_members_absent_after_close: 1,
    remaining_descendant_pids: Object.freeze([]),
    remaining_process_group_pids: Object.freeze([]),
  });
  const inner = Object.freeze({
    schema:
      "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-fixed-executor-result-v1",
    status: "completed-no-formal-authority",
    gate: GATE,
    sequence: 8,
    stage_b_run_fingerprint: FINGERPRINT,
    stage_b_epoch_namespace: EPOCH,
    stage_a_verified_receipt: STAGE_A,
    gate_result: Object.freeze({ fixture: true }),
    launchagent_evidence: launch,
    power_entries: Object.freeze([Object.freeze({ row: 1 }), Object.freeze({ row: 2 })]),
    pmset_interval: Object.freeze({ fixture: true }),
    verifier: Object.freeze({ fixture: true }),
    process_cleanup: cleanup,
    os_reap_evidence: osReap,
  });
  const finalPs = Buffer.from(
    "1 0 1 Sun Aug  2 10:00:00 2026 S /sbin/launchd\n",
    "utf8",
  );
  const runnerRow = Object.freeze({
    pid: RUNNER,
    ppid: 1,
    pgid: RUNNER,
    start_token: RUNNER_START,
    state: "S",
    command: COMMAND.join(" "),
  });
  const holderRow = Object.freeze({
    pid: HOLDER,
    ppid: RUNNER,
    pgid: RUNNER,
    start_token: HOLDER_START,
    state: "S",
    command: `/usr/bin/caffeinate -dimsu ${COMMAND.join(" ")}`,
  });
  const engineRow = Object.freeze({
    pid: ENGINE,
    ppid: RUNNER,
    pgid: RUNNER,
    start_token: ENGINE_START,
    state: "S",
    command: "/private/YaneuraOu-authenticated-snapshot",
  });
  const guardianRow = Object.freeze({
    pid: GUARDIAN,
    ppid: RUNNER,
    pgid: RUNNER,
    start_token: GUARDIAN_START,
    state: "S",
    command: `${COMMAND[0]} -r ${COMMAND[2]} ${WORKING}/ml/halfkp81-depth18-power-continuity-guardian.ts`,
  });
  const runningPs = Buffer.from(
    [
      `${RUNNER} 1 ${RUNNER} ${RUNNER_START} S ${COMMAND.join(" ")}`,
      `${HOLDER} ${RUNNER} ${RUNNER} ${HOLDER_START} S /usr/bin/caffeinate -dimsu ${COMMAND.join(" ")}`,
      `${ENGINE} ${RUNNER} ${RUNNER} ${ENGINE_START} S /private/YaneuraOu-authenticated-snapshot`,
      `${GUARDIAN} ${RUNNER} ${RUNNER} ${GUARDIAN_START} S ${guardianRow.command}`,
      "",
    ].join("\n"),
    "utf8",
  );
  const parentEvidence = Object.freeze({
    schema:
      "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-parent-job-evidence-v1",
    status: "runner-exited-and-job-process-group-reaped",
    label: LABEL,
    uid: UID,
    launchctl_domain: `gui/${UID}`,
    plist_source: plistSource,
    stdout_path: STDOUT,
    stderr_path: STDERR,
    program_arguments: PROGRAM,
    runner_pid: RUNNER,
    runner_pgid: RUNNER,
    runner_start_token: RUNNER_START,
    assertion_holder_pid: HOLDER,
    assertion_holder_start_token: HOLDER_START,
    running_observations: Object.freeze([
      Object.freeze({
        observation_sequence: 1,
        observed_at_ms: Date.parse("2026-08-02T18:00:03.000Z"),
        observed_at_utc: "2026-08-02T18:00:03.000Z",
        launchctl_stdout: rawIdentity(launchctl),
        launchctl_stderr: rawIdentity(Buffer.alloc(0)),
        ps_stdout: rawIdentity(runningPs),
        runner: runnerRow,
        assertion_holder: holderRow,
        observed_engine_rows: Object.freeze([engineRow]),
        observed_auxiliary_rows: Object.freeze([guardianRow]),
      }),
    ]),
    observed_engine_rows: Object.freeze([
      engineRow,
    ]),
    observed_auxiliary_rows: Object.freeze([guardianRow]),
    runner_exit_code: 0,
    runner_exit_signal: null,
    termination_actions: Object.freeze([
      Object.freeze({
        action: "launchctl-bootout",
        target: `gui/${UID}/${LABEL}`,
        exit_code: 0,
      }),
    ]),
    final_ps_first: rawIdentity(finalPs),
    final_ps_second: rawIdentity(finalPs),
    remaining_process_group_pids: Object.freeze([]),
    remaining_descendant_pids: Object.freeze([]),
  });
  return { inner, parentEvidence };
}

function envelope(
  inner: Readonly<Record<string, unknown>>,
  parentEvidence = fixture().parentEvidence,
) {
  const stdout = v1r11CanonicalLine(inner);
  return Object.freeze({
    schema:
      "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-parent-envelope-v1",
    status: "fixed-child-output-authenticated-after-job-reap",
    runtime_stdout_base64: stdout.toString("base64"),
    runtime_stdout_bytes: stdout.byteLength,
    runtime_stdout_sha256: v1r11Sha256(stdout),
    runtime_stderr_base64: "",
    runtime_stderr_bytes: 0,
    runtime_stderr_sha256: v1r11Sha256(Buffer.alloc(0)),
    parsed_inner_canonical_json: inner,
    parent_job_evidence: parentEvidence,
  });
}

describe("HalfKP81 v1r11 Stage-B parent/child source envelope", () => {
  it("accepts only the exact child raw bytes and matching parent OS process set", () => {
    const value = fixture();
    expect(() =>
      validateHalfkp81V1R11StageBExecutionEnvelopeForTests(
        envelope(value.inner, value.parentEvidence),
        CONTEXT,
      ),
    ).not.toThrow();
    expect(
      verifyHalfkp81V1R11All13StageBParentEnvelopeForTests(
        envelope(value.inner, value.parentEvidence),
        ALL13_CONTEXT,
      ).observedAuxiliaryRows,
    ).toHaveLength(1);
  });

  it("rejects a decoded child stdout drift even when parsed_inner remains unchanged", () => {
    const value = fixture();
    const valid = envelope(value.inner, value.parentEvidence);
    const drift = Buffer.from(`${valid.runtime_stdout_base64}drift`, "utf8");
    expect(() =>
      validateHalfkp81V1R11StageBExecutionEnvelopeForTests(
        { ...valid, runtime_stdout_base64: drift.toString("base64") },
        CONTEXT,
      ),
    ).toThrow(/parent envelope differs/u);
  });

  it("rejects a child OS-reap PID set that differs from the parent's ps observations", () => {
    const value = fixture();
    const forgedInner = Object.freeze({
      ...value.inner,
      os_reap_evidence: Object.freeze({
        ...(value.inner.os_reap_evidence as Readonly<Record<string, unknown>>),
        engine_pids: Object.freeze([999]),
      }),
    });
    expect(() =>
      validateHalfkp81V1R11StageBExecutionEnvelopeForTests(
        envelope(forgedInner, value.parentEvidence),
        CONTEXT,
      ),
    ).toThrow(/parent\/child job evidence differs/u);
    expect(() =>
      verifyHalfkp81V1R11All13StageBParentEnvelopeForTests(
        envelope(forgedInner, value.parentEvidence),
        ALL13_CONTEXT,
      ),
    ).toThrow(/parent\/child process set differs/u);
  });

  it("rejects a forged final ps snapshot that still contains the runner group", () => {
    const value = fixture();
    const live = Buffer.from(
      `410 1 410 ${RUNNER_START} S ${COMMAND.join(" ")}\n`,
      "utf8",
    );
    const forgedParent = Object.freeze({
      ...value.parentEvidence,
      final_ps_second: rawIdentity(live),
    });
    expect(() =>
      validateHalfkp81V1R11StageBExecutionEnvelopeForTests(
        envelope(value.inner, forgedParent),
        CONTEXT,
      ),
    ).toThrow(/final ps 2 retains job rows/u);
  });

  it("rejects auxiliary guardian PID reuse in either final ps snapshot", () => {
    const value = fixture();
    const reused = Buffer.from(
      `${GUARDIAN} 1 ${GUARDIAN} Sun Aug  2 11:30:00 2026 S /usr/bin/unrelated\n`,
      "utf8",
    );
    for (const key of ["final_ps_first", "final_ps_second"] as const) {
      const forgedParent = Object.freeze({
        ...value.parentEvidence,
        [key]: rawIdentity(reused),
      });
      expect(() =>
        validateHalfkp81V1R11StageBExecutionEnvelopeForTests(
          envelope(value.inner, forgedParent),
          CONTEXT,
        ),
      ).toThrow(/retains job rows/u);
      expect(() =>
        verifyHalfkp81V1R11All13StageBParentEnvelopeForTests(
          envelope(value.inner, forgedParent),
          ALL13_CONTEXT,
        ),
      ).toThrow(/retains job rows/u);
    }
  });

  it("rejects a missing guardian even when every engine row remains valid", () => {
    const value = fixture();
    const forgedParent = Object.freeze({
      ...value.parentEvidence,
      observed_auxiliary_rows: Object.freeze([]),
      running_observations: Object.freeze(
        (
          value.parentEvidence.running_observations as readonly Readonly<
            Record<string, unknown>
          >[]
        ).map((row) => ({ ...row, observed_auxiliary_rows: Object.freeze([]) })),
      ),
    });
    expect(() =>
      verifyHalfkp81V1R11All13StageBParentEnvelopeForTests(
        envelope(value.inner, forgedParent),
        ALL13_CONTEXT,
      ),
    ).toThrow(/auxiliary set differs/u);
  });

  it("requires one guardian with stable PID, start token and command in every running observation", () => {
    const value = fixture();
    const first = value.parentEvidence.running_observations[0]!;
    const guardian = value.parentEvidence.observed_auxiliary_rows[0]!;

    for (const observedAuxiliaryRows of [
      Object.freeze([]),
      Object.freeze([guardian, Object.freeze({ ...guardian, pid: 999 })]),
    ]) {
      const forgedParent = Object.freeze({
        ...value.parentEvidence,
        observed_auxiliary_rows: observedAuxiliaryRows,
      });
      expect(() =>
        validateHalfkp81V1R11StageBExecutionEnvelopeForTests(
          envelope(value.inner, forgedParent),
          CONTEXT,
        ),
      ).toThrow(/parent job semantics differ/u);
    }

    const missingFromObservation = Object.freeze({
      ...value.parentEvidence,
      running_observations: Object.freeze([
        Object.freeze({ ...first, observed_auxiliary_rows: Object.freeze([]) }),
      ]),
    });
    expect(() =>
      validateHalfkp81V1R11StageBExecutionEnvelopeForTests(
        envelope(value.inner, missingFromObservation),
        CONTEXT,
      ),
    ).toThrow(/running engines differ/u);

    for (const drift of [
      Object.freeze({ ...guardian, pid: 999 }),
      Object.freeze({
        ...guardian,
        start_token: "Sun Aug  2 11:30:03 2026",
      }),
      Object.freeze({ ...guardian, command: `${guardian.command} --drift` }),
    ]) {
      const secondPs = Buffer.from(first.ps_stdout.base64, "base64")
        .toString("utf8")
        .split("\n")
        .map((line) =>
          line.startsWith(`${GUARDIAN} `)
            ? `${drift.pid} ${drift.ppid} ${drift.pgid} ${drift.start_token} ${drift.state} ${drift.command}`
            : line,
        )
        .join("\n");
      const observedAt = first.observed_at_ms + 1_000;
      const forgedParent = Object.freeze({
        ...value.parentEvidence,
        running_observations: Object.freeze([
          first,
          Object.freeze({
            ...first,
            observation_sequence: 2,
            observed_at_ms: observedAt,
            observed_at_utc: new Date(observedAt).toISOString(),
            ps_stdout: rawIdentity(Buffer.from(secondPs, "utf8")),
            observed_auxiliary_rows: Object.freeze([drift]),
          }),
        ]),
      });
      expect(() =>
        validateHalfkp81V1R11StageBExecutionEnvelopeForTests(
          envelope(value.inner, forgedParent),
          CONTEXT,
        ),
      ).toThrow(/parent running raw observation differs/u);
      expect(() =>
        verifyHalfkp81V1R11All13StageBParentEnvelopeForTests(
          envelope(value.inner, forgedParent),
          ALL13_CONTEXT,
        ),
      ).toThrow(
        /(?:running topology differs|auxiliary PID changed|running engine union differs)/u,
      );
    }
  });

  it("rejects a guardian-path substring carried by a different executable or extra args", () => {
    const value = fixture();
    const first = value.parentEvidence.running_observations[0]!;
    const guardian = value.parentEvidence.observed_auxiliary_rows[0]!;
    const fakeCommand = `/tmp/fake ${WORKING}/ml/halfkp81-depth18-power-continuity-guardian.ts --extra`;
    const forgedGuardian = Object.freeze({
      ...guardian,
      command: fakeCommand,
    });
    const forgedPs = Buffer.from(first.ps_stdout.base64, "base64")
      .toString("utf8")
      .split("\n")
      .map((line) =>
        line.startsWith(`${GUARDIAN} `)
          ? `${guardian.pid} ${guardian.ppid} ${guardian.pgid} ${guardian.start_token} ${guardian.state} ${fakeCommand}`
          : line,
      )
      .join("\n");
    const forgedParent = Object.freeze({
      ...value.parentEvidence,
      observed_auxiliary_rows: Object.freeze([forgedGuardian]),
      running_observations: Object.freeze([
        Object.freeze({
          ...first,
          ps_stdout: rawIdentity(Buffer.from(forgedPs, "utf8")),
          observed_auxiliary_rows: Object.freeze([forgedGuardian]),
        }),
      ]),
    });
    expect(() =>
      verifyHalfkp81V1R11All13StageBParentEnvelopeForTests(
        envelope(value.inner, forgedParent),
        ALL13_CONTEXT,
      ),
    ).toThrow(/auxiliary set differs/u);
  });
});
