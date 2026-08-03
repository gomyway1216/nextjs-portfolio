import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildHalfkp81V1R11StageBOneShotPlist,
  Halfkp81V1R11StageBLaunchAgentSupervisorError,
  type Halfkp81V1R11StageBLaunchAgentSupervisorDependencies,
  type Halfkp81V1R11StageBLaunchAgentSupervisorSpec,
  type Halfkp81V1R11StageBLaunchctlResult,
  superviseHalfkp81V1R11StageBLaunchAgent,
} from "../../../ml/halfkp81-depth18-v1r11-stage-b-launchagent-supervisor";

const roots: string[] = [];
const RUNNER_START = "Sun Aug  2 11:00:00 2026";
const HOLDER_START = "Sun Aug  2 11:00:01 2026";
const ENGINE_START = "Sun Aug  2 11:00:02 2026";

function result(
  status: number,
  stdout = "",
  stderr = "",
): Halfkp81V1R11StageBLaunchctlResult {
  return Object.freeze({
    status,
    signal: null,
    stdout: Buffer.from(stdout, "utf8"),
    stderr: Buffer.from(stderr, "utf8"),
  });
}

function absent(uid: number): Halfkp81V1R11StageBLaunchctlResult {
  return result(
    113,
    "",
    `Bad request.\nCould not find service \"fixture\" in domain for user gui/${uid}\n`,
  );
}

function running(
  label: string,
  pid: number,
  uid = process.getuid?.() ?? 501,
): Halfkp81V1R11StageBLaunchctlResult {
  return result(
    0,
    [
      `gui/${uid}/${label} = {`,
      "\ttype = LaunchAgent",
      "\tstate = running",
      `\tpid = ${pid}`,
      "}",
      "",
    ].join("\n"),
  );
}

function exited(
  label: string,
  exitCode: number,
  uid = process.getuid?.() ?? 501,
): Halfkp81V1R11StageBLaunchctlResult {
  return result(
    0,
    [
      `gui/${uid}/${label} = {`,
      "\ttype = LaunchAgent",
      "\tstate = exited",
      `\tlast exit code = ${exitCode}`,
      "}",
      "",
    ].join("\n"),
  );
}

function fixture(): Readonly<{
  root: string;
  spec: Halfkp81V1R11StageBLaunchAgentSupervisorSpec;
}> {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "v1r11-stage-b-supervisor-")),
  );
  roots.push(root);
  fs.chmodSync(root, 0o700);
  const uid = process.getuid?.() ?? 501;
  return Object.freeze({
    root,
    spec: Object.freeze({
      label: "com.meetyudai.shogi.v1r11-stage-b-fixture",
      uid,
      workingDirectory: root,
      plistPath: path.join(root, "stage-b.plist"),
      stdoutPath: path.join(root, "stage-b.stdout"),
      stderrPath: path.join(root, "stage-b.stderr"),
      utilityArgv: Object.freeze([
        "/absolute/node",
        "-r",
        path.join(root, "node_modules/tsx/dist/cjs/index.cjs"),
        path.join(
          root,
          "ml/run-halfkp81-depth18-v1r11-stage-b-engine-gate.ts",
        ),
        "--gate",
        "candidate-order-gate",
      ]),
      pollIntervalMs: 20,
      timeoutMs: 1_000,
    }),
  });
}

function runningPs(
  utilityArgv: readonly string[],
  runnerStart = RUNNER_START,
): Buffer {
  const runnerCommand = utilityArgv.join(" ");
  const repositoryRoot = path.resolve(path.dirname(utilityArgv[3]!), "..");
  const guardianCommand = [
    utilityArgv[0],
    "-r",
    path.join(repositoryRoot, "node_modules/tsx/dist/cjs/index.cjs"),
    path.join(
      repositoryRoot,
      "ml/halfkp81-depth18-power-continuity-guardian.ts",
    ),
  ].join(" ");
  return Buffer.from(
    [
      `410 1 410 ${runnerStart} S ${runnerCommand}`,
      `411 410 410 ${HOLDER_START} S /usr/bin/caffeinate -dimsu ${runnerCommand}`,
      `412 410 410 ${ENGINE_START} S /private/YaneuraOu-authenticated-snapshot`,
      `413 410 410 Sun Aug  2 11:00:03 2026 S ${guardianCommand}`,
      "1 0 1 Sun Aug  2 10:00:00 2026 S /sbin/launchd",
      "",
    ].join("\n"),
    "utf8",
  );
}

const EMPTY_JOB_PS = Buffer.from(
  "1 0 1 Sun Aug  2 10:00:00 2026 S /sbin/launchd\n",
  "utf8",
);

function fakeDependencies(input: Readonly<{
  spec: Halfkp81V1R11StageBLaunchAgentSupervisorSpec;
  launchctl: readonly Halfkp81V1R11StageBLaunchctlResult[];
  ps: readonly Buffer[];
  childStdout?: string;
}>): Readonly<{
  dependencies: Halfkp81V1R11StageBLaunchAgentSupervisorDependencies;
  launchctlCalls: string[][];
  signals: Array<Readonly<{ pgid: number; signal: string }>>;
}> {
  let launchctlIndex = 0;
  let psIndex = 0;
  let now = 0;
  const launchctlCalls: string[][] = [];
  const signals: Array<Readonly<{ pgid: number; signal: string }>> = [];
  return Object.freeze({
    launchctlCalls,
    signals,
    dependencies: Object.freeze({
      launchctl(arguments_) {
        launchctlCalls.push([...arguments_]);
        if (arguments_[0] === "kickstart") {
          fs.appendFileSync(
            input.spec.stdoutPath,
            input.childStdout ??
              '{"gate":"candidate-order-gate","schema":"inner-v1"}\n',
          );
        }
        const response = input.launchctl[launchctlIndex++];
        if (response === undefined) {
          throw new Error("unexpected fake launchctl call");
        }
        return response;
      },
      ps() {
        const response = input.ps[psIndex++];
        if (response === undefined) throw new Error("unexpected fake ps call");
        return response;
      },
      signalProcessGroup(pgid, signal) {
        signals.push(Object.freeze({ pgid, signal }));
        return "sent" as const;
      },
      async wait(milliseconds) {
        now += milliseconds;
      },
      now: () => now,
    }),
  });
}

afterEach(() => {
  while (roots.length > 0) {
    fs.rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe("HalfKP81 v1r11 Stage-B parent LaunchAgent supervisor", () => {
  it("builds a shell-free kickstarted one-shot plist with the complete child argv", () => {
    const { spec } = fixture();
    const plist = buildHalfkp81V1R11StageBOneShotPlist(spec).toString("utf8");
    expect(plist).toContain("<key>RunAtLoad</key>\n  <false/>");
    expect(plist).toContain("<key>KeepAlive</key>\n  <false/>");
    expect(plist).toContain("<key>LaunchOnlyOnce</key>\n  <true/>");
    expect(plist).toContain("<key>AbandonProcessGroup</key>\n  <false/>");
    expect(plist).toContain(
      ["/usr/bin/caffeinate", "-dimsu", ...spec.utilityArgv]
        .map((value) => `    <string>${value}</string>`)
        .join("\n"),
    );
    expect(plist).not.toMatch(/<(?:key|string)>\/(?:bin\/)?(?:sh|zsh|bash)</u);
  });

  it("binds bootstrap/kickstart, private raw output and dual-ps group-zero proof", async () => {
    const { spec } = fixture();
    const fake = fakeDependencies({
      spec,
      launchctl: [
        absent(spec.uid),
        result(0),
        result(0),
        running(spec.label, 410),
        exited(spec.label, 0),
        result(0),
        absent(spec.uid),
      ],
      ps: [runningPs(spec.utilityArgv), EMPTY_JOB_PS, EMPTY_JOB_PS],
    });

    const envelope = await superviseHalfkp81V1R11StageBLaunchAgent(
      spec,
      fake.dependencies,
    );

    expect(fake.launchctlCalls).toEqual([
      ["print", `gui/${spec.uid}/${spec.label}`],
      ["bootstrap", `gui/${spec.uid}`, spec.plistPath],
      ["kickstart", `gui/${spec.uid}/${spec.label}`],
      ["print", `gui/${spec.uid}/${spec.label}`],
      ["print", `gui/${spec.uid}/${spec.label}`],
      ["bootout", `gui/${spec.uid}/${spec.label}`],
      ["print", `gui/${spec.uid}/${spec.label}`],
    ]);
    expect(fake.signals).toEqual([]);
    expect(envelope.parsed_inner_canonical_json).toEqual({
      gate: "candidate-order-gate",
      schema: "inner-v1",
    });
    expect(envelope.runtime_stderr_bytes).toBe(0);
    expect(envelope.parent_job_evidence).toMatchObject({
      status: "runner-exited-and-job-process-group-reaped",
      runner_pid: 410,
      runner_pgid: 410,
      assertion_holder_pid: 411,
      runner_exit_code: 0,
      runner_exit_signal: null,
      remaining_process_group_pids: [],
      remaining_descendant_pids: [],
    });
    expect(envelope.parent_job_evidence.observed_engine_rows).toHaveLength(1);
    expect(envelope.parent_job_evidence.observed_engine_rows[0]?.pid).toBe(412);
    expect(fs.statSync(spec.plistPath).mode & 0o7777).toBe(0o600);
    expect(fs.statSync(spec.stdoutPath).mode & 0o7777).toBe(0o600);
    expect(fs.statSync(spec.stderrPath).mode & 0o7777).toBe(0o600);
  });

  it("returns authenticated cleanup evidence for a nonzero child without accepting its output", async () => {
    const { spec } = fixture();
    const fake = fakeDependencies({
      spec,
      launchctl: [
        absent(spec.uid),
        result(0),
        result(0),
        running(spec.label, 410),
        exited(spec.label, 7),
        result(0),
        absent(spec.uid),
      ],
      ps: [runningPs(spec.utilityArgv), EMPTY_JOB_PS, EMPTY_JOB_PS],
    });

    let failure: unknown;
    try {
      await superviseHalfkp81V1R11StageBLaunchAgent(spec, fake.dependencies);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(
      Halfkp81V1R11StageBLaunchAgentSupervisorError,
    );
    const typed = failure as Halfkp81V1R11StageBLaunchAgentSupervisorError;
    expect(typed.cleanupEvidence).toMatchObject({
      status: "runner-faulted-and-job-process-group-reaped",
      runner_exit_code: 7,
      runner_exit_signal: null,
      remaining_process_group_pids: [],
    });
  });

  it("retains one authenticated power guardian as an auxiliary, never an engine", async () => {
    const { spec } = fixture();
    const withGuardian = runningPs(spec.utilityArgv);
    const fake = fakeDependencies({
      spec,
      launchctl: [
        absent(spec.uid),
        result(0),
        result(0),
        running(spec.label, 410),
        exited(spec.label, 0),
        result(0),
        absent(spec.uid),
      ],
      ps: [withGuardian, EMPTY_JOB_PS, EMPTY_JOB_PS],
    });

    const envelope = await superviseHalfkp81V1R11StageBLaunchAgent(
      spec,
      fake.dependencies,
    );
    expect(envelope.parent_job_evidence.observed_engine_rows).toHaveLength(1);
    expect(envelope.parent_job_evidence.observed_auxiliary_rows).toEqual([
      expect.objectContaining({ pid: 413, ppid: 410, pgid: 410 }),
    ]);
    expect(
      envelope.parent_job_evidence.running_observations[0]
        ?.observed_auxiliary_rows,
    ).toHaveLength(1);
  });

  it("fails closed and reaps when an engine appears without the power guardian", async () => {
    const { spec } = fixture();
    const withoutGuardian = Buffer.from(
      runningPs(spec.utilityArgv)
        .toString("utf8")
        .split("\n")
        .filter((line) => !line.startsWith("413 "))
        .join("\n"),
      "utf8",
    );
    const fake = fakeDependencies({
      spec,
      launchctl: [
        absent(spec.uid),
        result(0),
        result(0),
        running(spec.label, 410),
        result(0),
        absent(spec.uid),
      ],
      ps: [withoutGuardian, EMPTY_JOB_PS, EMPTY_JOB_PS],
    });

    let failure: unknown;
    try {
      await superviseHalfkp81V1R11StageBLaunchAgent(spec, fake.dependencies);
    } catch (error) {
      failure = error;
    }
    const typed = failure as Halfkp81V1R11StageBLaunchAgentSupervisorError;
    expect(typed).toBeInstanceOf(
      Halfkp81V1R11StageBLaunchAgentSupervisorError,
    );
    expect(typed.message).toMatch(/guardian disappeared or started after/u);
    expect(typed.cleanupEvidence).toMatchObject({
      status: "runner-faulted-and-job-process-group-reaped",
      observed_auxiliary_rows: [],
      runner_exit_code: null,
    });
  });

  it("rejects a guardian-path substring and an exact command with extra arguments", async () => {
    for (const forge of [
      (valid: string) =>
        `/tmp/fake ${valid.slice(valid.indexOf("/ml/"))}`,
      (valid: string) => `${valid} --extra-argument`,
    ]) {
      const { spec } = fixture();
      const forgedPs = Buffer.from(
        runningPs(spec.utilityArgv)
          .toString("utf8")
          .split("\n")
          .map((line) => {
            if (!line.startsWith("413 ")) return line;
            const marker = " S ";
            const markerAt = line.indexOf(marker);
            return `${line.slice(0, markerAt + marker.length)}${forge(
              line.slice(markerAt + marker.length),
            )}`;
          })
          .join("\n"),
        "utf8",
      );
      const fake = fakeDependencies({
        spec,
        launchctl: [
          absent(spec.uid),
          result(0),
          result(0),
          running(spec.label, 410),
          result(0),
          absent(spec.uid),
        ],
        ps: [forgedPs],
      });
      await expect(
        superviseHalfkp81V1R11StageBLaunchAgent(spec, fake.dependencies),
      ).rejects.toThrow(/process-group lineage differs/u);
    }
  });

  it("retains bounded raw observations across unchanged long-running polls", async () => {
    const { spec } = fixture();
    const live = runningPs(spec.utilityArgv);
    const fake = fakeDependencies({
      spec,
      launchctl: [
        absent(spec.uid),
        result(0),
        result(0),
        running(spec.label, 410),
        running(spec.label, 410),
        exited(spec.label, 0),
        result(0),
        absent(spec.uid),
      ],
      ps: [live, live, EMPTY_JOB_PS, EMPTY_JOB_PS],
    });

    const envelope = await superviseHalfkp81V1R11StageBLaunchAgent(
      spec,
      fake.dependencies,
    );
    expect(envelope.parent_job_evidence.running_observations).toHaveLength(1);
    expect(envelope.parent_job_evidence.observed_engine_rows).toHaveLength(1);
  });

  it("bootouts before authenticated PGID TERM/KILL and then requires two empty ps snapshots", async () => {
    const { spec } = fixture();
    const live = runningPs(spec.utilityArgv);
    const fake = fakeDependencies({
      spec,
      launchctl: [
        absent(spec.uid),
        result(0),
        result(0),
        running(spec.label, 410),
        exited(spec.label, 9),
        result(0),
        absent(spec.uid),
      ],
      ps: [live, live, live, EMPTY_JOB_PS, EMPTY_JOB_PS],
    });

    let failure: unknown;
    try {
      await superviseHalfkp81V1R11StageBLaunchAgent(spec, fake.dependencies);
    } catch (error) {
      failure = error;
    }
    const typed = failure as Halfkp81V1R11StageBLaunchAgentSupervisorError;
    expect(typed.cleanupEvidence).not.toBeNull();
    expect(fake.launchctlCalls.at(-2)).toEqual([
      "bootout",
      `gui/${spec.uid}/${spec.label}`,
    ]);
    expect(fake.signals).toEqual([
      { pgid: 410, signal: "SIGTERM" },
      { pgid: 410, signal: "SIGKILL" },
    ]);
    expect(typed.cleanupEvidence?.termination_actions.map((entry) => entry.action)).toEqual([
      "launchctl-bootout",
      "signal-process-group",
      "signal-process-group",
    ]);
  });

  it("times out fail-closed, bootouts, reaps the authenticated group and never accepts child output", async () => {
    const { spec: original } = fixture();
    const spec = Object.freeze({ ...original, timeoutMs: 30 });
    const live = runningPs(spec.utilityArgv);
    const fake = fakeDependencies({
      spec,
      launchctl: [
        absent(spec.uid),
        result(0),
        result(0),
        running(spec.label, 410),
        running(spec.label, 410),
        result(0),
        absent(spec.uid),
      ],
      ps: [live, live, live, EMPTY_JOB_PS, EMPTY_JOB_PS],
    });

    let failure: unknown;
    try {
      await superviseHalfkp81V1R11StageBLaunchAgent(spec, fake.dependencies);
    } catch (error) {
      failure = error;
    }
    const typed = failure as Halfkp81V1R11StageBLaunchAgentSupervisorError;
    expect(typed.message).toMatch(/parent deadline/u);
    expect(typed.cleanupEvidence).toMatchObject({
      status: "runner-faulted-and-job-process-group-reaped",
      runner_exit_code: null,
      runner_exit_signal: null,
      remaining_process_group_pids: [],
    });
    expect(fake.signals).toEqual([{ pgid: 410, signal: "SIGTERM" }]);
  });

  it("refuses to signal a reused runner PID and exposes no fake cleanup evidence", async () => {
    const { spec } = fixture();
    const reused = runningPs(
      spec.utilityArgv,
      "Sun Aug  2 11:30:00 2026",
    );
    const fake = fakeDependencies({
      spec,
      launchctl: [
        absent(spec.uid),
        result(0),
        result(0),
        running(spec.label, 410),
        exited(spec.label, 8),
        result(0),
        absent(spec.uid),
      ],
      ps: [runningPs(spec.utilityArgv), reused],
    });

    let failure: unknown;
    try {
      await superviseHalfkp81V1R11StageBLaunchAgent(spec, fake.dependencies);
    } catch (error) {
      failure = error;
    }
    const typed = failure as Halfkp81V1R11StageBLaunchAgentSupervisorError;
    expect(typed).toBeInstanceOf(
      Halfkp81V1R11StageBLaunchAgentSupervisorError,
    );
    expect(typed.cleanupEvidence).toBeNull();
    expect(typed.message).toMatch(/PID was reused/u);
    expect(fake.signals).toEqual([]);
  });

  it("does not publish cleanup evidence when only one final ps snapshot is empty", async () => {
    const { spec } = fixture();
    const fake = fakeDependencies({
      spec,
      launchctl: [
        absent(spec.uid),
        result(0),
        result(0),
        running(spec.label, 410),
        exited(spec.label, 6),
        result(0),
        absent(spec.uid),
      ],
      ps: [runningPs(spec.utilityArgv), EMPTY_JOB_PS, runningPs(spec.utilityArgv)],
    });

    let failure: unknown;
    try {
      await superviseHalfkp81V1R11StageBLaunchAgent(spec, fake.dependencies);
    } catch (error) {
      failure = error;
    }
    const typed = failure as Halfkp81V1R11StageBLaunchAgentSupervisorError;
    expect(typed.cleanupEvidence).toBeNull();
    expect(typed.message).toMatch(/could not verify complete job cleanup/u);
  });
});
