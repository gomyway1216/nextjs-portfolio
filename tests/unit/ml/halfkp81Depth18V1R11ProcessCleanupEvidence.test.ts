import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  produceHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests,
  validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests,
  type Halfkp81V1R11CleanupScope,
  type Halfkp81V1R11ProcessCleanupDependencies,
  type Halfkp81V1R11ProcessCleanupEvidence,
  type Halfkp81V1R11ProcessCleanupInput,
  type Halfkp81V1R11ProcessCleanupValidationContext,
} from "../../../ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence";

const roots: string[] = [];
const uid = process.geteuid?.() ?? 501;
const label = "com.meetyudai.shogi.halfkp81-depth18-v1r11-test";
const runnerLstart = "Sun Aug  2 11:00:00 2026";
const reusedLstart = "Sun Aug  2 11:30:00 2026";
const empty = Buffer.alloc(0);

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.promises.rm(root, { recursive: true, force: true }),
    ),
  );
});

function sha256(raw: Uint8Array | string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function replaceRaw(transcript: Record<string, unknown>, raw: Buffer): void {
  transcript.base64 = raw.toString("base64");
  transcript.decoded_bytes = raw.byteLength;
  transcript.sha256 = sha256(raw);
}

interface QueuedCommand {
  readonly argv: readonly string[];
  readonly exitCode: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}

function fakeDependencies(queue: readonly QueuedCommand[]) {
  const pending = [...queue];
  const seen: string[][] = [];
  let wall = Date.parse("2026-08-02T18:00:00.000Z");
  let monotonic = 1_000_000_000n;
  const dependencies: Halfkp81V1R11ProcessCleanupDependencies = {
    run(argv) {
      const next = pending.shift();
      if (next === undefined) throw new Error(`unexpected command: ${argv.join(" ")}`);
      expect(argv).toEqual(next.argv);
      seen.push([...argv]);
      wall += 10;
      monotonic += 10_000_000n;
      return {
        exitCode: next.exitCode,
        signal: null,
        stdout: next.stdout,
        stderr: next.stderr,
      };
    },
    nowMs: () => wall,
    monotonicNs: () => monotonic,
    wait: async (milliseconds) => {
      wall += milliseconds;
      monotonic += BigInt(milliseconds) * 1_000_000n;
    },
  };
  return {
    dependencies,
    seen,
    assertExhausted: () => expect(pending).toHaveLength(0),
  };
}

interface FixtureOptions {
  readonly scope?: Halfkp81V1R11CleanupScope;
  readonly runner?: boolean;
  readonly reuseAfterKill?: boolean;
  readonly serviceExitCode?: number;
  readonly serviceStderr?: Buffer;
}

async function fixture(options: FixtureOptions = {}) {
  const scope = options.scope ?? "preformal";
  const hasRunner = options.runner ?? true;
  const temporary = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "v1r11-cleanup-evidence-test-"),
  );
  const root = await fs.promises.realpath(temporary);
  roots.push(root);
  await fs.promises.chmod(root, 0o700);
  const homeDirectory = path.join(root, "home");
  const repositoryRoot = path.join(root, "repository");
  await fs.promises.mkdir(homeDirectory, { mode: 0o700 });
  await fs.promises.mkdir(repositoryRoot, { mode: 0o700 });
  const outputDirectory = scope === "preformal"
    ? path.join(homeDirectory, ".codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority")
    : path.join(homeDirectory, ".codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11");
  await fs.promises.mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(outputDirectory, 0o700);

  const teacherPlanPath = path.join(root, "teacher-plan.json");
  const teacherPlanRaw = Buffer.from('{"schema":"test-teacher-plan"}\n', "utf8");
  await fs.promises.writeFile(teacherPlanPath, teacherPlanRaw, { flag: "wx", mode: 0o600 });
  const teacherPlan = Object.freeze({
    path: teacherPlanPath,
    bytes: teacherPlanRaw.byteLength,
    sha256: sha256(teacherPlanRaw),
    schema: "test-teacher-plan",
  });

  const runnerCommand = Object.freeze([
    "/absolute/node",
    "-r",
    `${repositoryRoot}/node_modules/tsx/dist/cjs/index.cjs`,
    `${repositoryRoot}/ml/${scope === "preformal" ? "run-halfkp81-depth18-v1r11-stage-b-engine-gate.ts" : "run-halfkp81-depth18-v1r11-formal-child.ts"}`,
  ]);
  const plistProgramArguments = Object.freeze(
    scope === "preformal"
      ? ["/usr/bin/caffeinate", "-dimsu", ...runnerCommand]
      : [...runnerCommand],
  );
  const plistRaw = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist><dict><key>ProgramArguments</key><array>${plistProgramArguments.map((argument) => `<string>${argument}</string>`).join("")}</array></dict></plist>\n`,
    "utf8",
  );
  const plistPath = path.join(root, "launchagent.plist");
  await fs.promises.writeFile(plistPath, plistRaw, { flag: "wx", mode: 0o600 });
  const plistSnapshot = Object.freeze({
    path: plistPath,
    bytes: plistRaw.byteLength,
    sha256: sha256(plistRaw),
    schema: "application/x-apple-plist+xml",
  });
  const fixedRoles = Object.freeze({
    powerGuardian: Object.freeze({
      executable: "/absolute/node",
      argv: "/absolute/node /repository/ml/halfkp81-depth18-power-continuity-guardian.ts",
    }),
    stageBSupervisor: Object.freeze({
      executable: "/absolute/node",
      argv: "/absolute/node /repository/ml/halfkp81-depth18-v1r11-stage-b-launchagent-supervisor.ts",
    }),
    yaneuraouEngine: Object.freeze({
      executable: "/absolute/YaneuraOu",
      argv: "/absolute/YaneuraOu --usi",
    }),
  });
  const runnerIdentity = hasRunner
    ? Object.freeze({ pid: 700, pgid: 700, lstart: runnerLstart })
    : null;
  const producer = Object.freeze({
    source_revision: "a".repeat(40),
    entrypoint: "ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence.ts" as const,
    dependency_closure: Object.freeze([
      Object.freeze({
        path: "ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence.ts",
        bytes: 1,
        sha256: "c".repeat(64),
      }),
    ]),
  });
  const input: Halfkp81V1R11ProcessCleanupInput = Object.freeze({
    scope,
    teacherPlan,
    sourceRevision: "a".repeat(40),
    runFingerprint: "b".repeat(64),
    launchagent: Object.freeze({ label, plistSnapshot }),
    runnerIdentity,
    runnerNullPhaseBeforeAnyAdmission: !hasRunner,
    uid,
    homeDirectory,
    repositoryRoot,
    fixedRoles,
    producer,
  });
  const expectedOutputPath = path.join(
    outputDirectory,
    scope === "preformal"
      ? "preformal-process-cleanup-evidence.json"
      : "environment-process-cleanup-evidence.json",
  );
  const context: Halfkp81V1R11ProcessCleanupValidationContext = Object.freeze({
    ...input,
    expectedOutputPath,
    plistProgramArguments,
  });

  const prePs = hasRunner
    ? Buffer.from([
        `700 1 700 ${runnerLstart} ${runnerCommand.join(" ")}`,
        `701 700 700 Sun Aug  2 11:00:01 2026 ${scope === "preformal" ? plistProgramArguments.join(" ") : "/usr/bin/caffeinate -dimsu -w 700"}`,
        `702 700 700 Sun Aug  2 11:00:02 2026 ${fixedRoles.powerGuardian.argv}`,
        `703 700 700 Sun Aug  2 11:00:03 2026 ${fixedRoles.stageBSupervisor.argv}`,
        `704 703 700 Sun Aug  2 11:00:04 2026 ${fixedRoles.yaneuraouEngine.argv}`,
        "",
      ].join("\n"), "utf8")
    : empty;
  const reusePs = options.reuseAfterKill
    ? Buffer.from(
        `704 1 999 ${reusedLstart} ${fixedRoles.yaneuraouEngine.executable} /unrelated/new-process\n`,
        "utf8",
      )
    : empty;
  const serviceStderr = options.serviceStderr ?? Buffer.from(
    `Bad request.\nCould not find service "${label}" in domain for user gui: ${uid}\n`,
    "utf8",
  );
  const ps = ["/bin/ps", "-ww", "-axo", "pid=,ppid=,pgid=,lstart=,command="];
  const command = (
    argv: readonly string[],
    exitCode: number,
    stdout = empty,
    stderr = empty,
  ): QueuedCommand => ({ argv, exitCode, stdout, stderr });
  const queue: QueuedCommand[] = [
    command(ps, 0, prePs),
    command(["/bin/launchctl", "bootout", `gui/${uid}/${label}`], 0),
    command(ps, 0, prePs),
  ];
  if (hasRunner) queue.push(command(["/bin/kill", "-TERM", "--", "-700"], 0));
  queue.push(command(ps, 0, prePs));
  if (hasRunner) queue.push(command(["/bin/kill", "-KILL", "--", "-700"], 0));
  queue.push(
    command(ps, 0, reusePs),
    command(["/bin/launchctl", "print", `gui/${uid}/${label}`], options.serviceExitCode ?? 113, empty, serviceStderr),
    command(ps, 0, reusePs),
    command(ps, 0, reusePs),
  );
  const fake = fakeDependencies(queue);
  return { root, input, context, expectedOutputPath, fake, prePs };
}

async function produce(options: FixtureOptions = {}) {
  const value = await fixture(options);
  const result = await produceHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
    value.input,
    value.fake.dependencies,
  );
  value.fake.assertExhausted();
  return { ...value, result };
}

describe("HalfKP81 depth18 v1r11 process cleanup evidence", () => {
  it.each(["preformal", "post-formal-environment"] as const)(
    "publishes durable private create-only %s evidence and independently validates it",
    async (scope) => {
      const { result, expectedOutputPath, input, fake } = await produce({ scope });
      expect(result.identity.path).toBe(expectedOutputPath);
      expect(result.identity.schema).toBe(
        "shogi-halfkp81-depth18-yaneura-only-process-cleanup-evidence-v1r11",
      );
      expect(fs.statSync(expectedOutputPath).mode & 0o777).toBe(0o600);
      expect(result.recomputedProcessCleanup).toEqual({
        scheduling_stopped: true,
        engines_terminated: 1,
        engines_reaped: 1,
        remaining_engine_pids: [],
      });
      const durable = fs.readFileSync(expectedOutputPath);
      expect(durable.byteLength).toBe(result.identity.bytes);
      expect(sha256(durable)).toBe(result.identity.sha256);
      expect(JSON.parse(durable.toString("utf8"))).toEqual(result.evidence);
      expect(fake.seen).toHaveLength(10);
      await expect(
        produceHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
          input,
          fake.dependencies,
        ),
      ).rejects.toThrow(/create-only/u);
    },
  );

  it("rejects old schemas, wrong scope paths, and independently supplied identity mismatches", async () => {
    const { result, context } = await produce();
    const oldSchema = clone(result.evidence) as unknown as Record<string, unknown>;
    oldSchema.schema = "shogi-halfkp81-depth18-yaneura-only-process-cleanup-evidence-v1r10";
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(oldSchema, context)).toThrow();
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
      result.evidence,
      { ...context, expectedOutputPath: `${context.expectedOutputPath}.old` },
    )).toThrow(/root binding/u);
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
      result.evidence,
      { ...context, teacherPlan: { ...context.teacherPlan, sha256: "d".repeat(64) } },
    )).toThrow(/teacher plan/u);
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
      result.evidence,
      { ...context, launchagent: { ...context.launchagent, label: `${label}.wrong` } },
    )).toThrow();
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
      result.evidence,
      { ...context, sourceRevision: "e".repeat(40) },
    )).toThrow(/root binding/u);
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
      result.evidence,
      {
        ...context,
        runnerIdentity: { ...context.runnerIdentity!, pgid: context.runnerIdentity!.pgid + 1 },
      },
    )).toThrow(/root binding/u);
  });

  it("refuses publication into a non-private evidence directory", async () => {
    const value = await fixture();
    await fs.promises.chmod(path.dirname(value.expectedOutputPath), 0o755);
    await expect(produceHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
      value.input,
      value.fake.dependencies,
    )).rejects.toThrow(/parent directory/u);
  });

  it("binds exact cleanup command order, argv, raw transcripts, and arbitrary service errors", async () => {
    const { result, context } = await produce();
    const wrongOrder = clone(result.evidence) as unknown as {ordered_cleanup_commands: Array<Record<string, unknown>>};
    [wrongOrder.ordered_cleanup_commands[1], wrongOrder.ordered_cleanup_commands[2]] =
      [wrongOrder.ordered_cleanup_commands[2]!, wrongOrder.ordered_cleanup_commands[1]!];
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(wrongOrder, context)).toThrow();
    const wrongArgv = clone(result.evidence) as unknown as {ordered_cleanup_commands: Array<{argv: string[]}>};
    wrongArgv.ordered_cleanup_commands[1]!.argv = ["/bin/kill", "-TERM", "--", "700"];
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(wrongArgv, context)).toThrow(/binding/u);
    const rawTamper = clone(result.evidence) as unknown as {ordered_cleanup_commands: Array<{stdout: Record<string, unknown>}>};
    rawTamper.ordered_cleanup_commands[0]!.stdout.base64 = "eA==";
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(rawTamper, context)).toThrow(/raw identity/u);

    const arbitrary = await fixture({
      serviceExitCode: 1,
      serviceStderr: Buffer.from("permission denied\n", "utf8"),
    });
    await expect(produceHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
      arbitrary.input,
      arbitrary.fake.dependencies,
    )).rejects.toThrow(/service absence/u);
  });

  it("records PID reuse as non-target and rejects forged reuse accounting", async () => {
    const { result, context } = await produce({ reuseAfterKill: true });
    expect(result.evidence.pid_reuse_rejection.rejected_reuse_rows).toHaveLength(1);
    expect(result.evidence.pid_reuse_rejection.rejected_reuse_rows[0]).toMatchObject({
      pid: 704,
      pgid: 999,
      lstart: reusedLstart,
      role: "pid-reuse-nontarget",
    });
    expect(result.evidence.remaining_process_rows).toEqual([]);
    const forged = clone(result.evidence) as unknown as {
      pid_reuse_rejection: {rejected_reuse_rows: Array<{role: string}>};
    };
    forged.pid_reuse_rejection.rejected_reuse_rows[0] = {
      ...forged.pid_reuse_rejection.rejected_reuse_rows[0]!,
      role: "yaneuraou-engine",
    };
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(forged, context)).toThrow(/PID reuse/u);
  });

  it("rejects dual-final transcript tampering and gaps outside the frozen interval", async () => {
    const { result, context } = await produce();
    const transcript = clone(result.evidence) as unknown as {final_ps_second: {stdout: Record<string, unknown>}};
    replaceRaw(transcript.final_ps_second.stdout, Buffer.from("ambiguous row\n", "utf8"));
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(transcript, context)).toThrow(/ambiguous/u);
    const shortGap = clone(result.evidence) as unknown as {
      final_ps_first: {finished_monotonic_ns: string};
      final_ps_second: {started_monotonic_ns: string};
    };
    shortGap.final_ps_second.started_monotonic_ns =
      (BigInt(shortGap.final_ps_first.finished_monotonic_ns) + 999_999_999n).toString();
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(shortGap, context)).toThrow(/separation/u);
  });

  it("rejects remaining-row, process-group, and cleanup-summary claims not recomputed from final captures", async () => {
    const { result, context } = await produce();
    const remaining = clone(result.evidence) as unknown as {remaining_process_rows: unknown[]};
    remaining.remaining_process_rows.push({ forged: true });
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(remaining, context)).toThrow(/remaining process rows/u);
    const groups = clone(result.evidence) as unknown as {remaining_process_group_rows: unknown[]};
    groups.remaining_process_group_rows.push({ pgid: 700, member_identities: [] });
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(groups, context)).toThrow(/process groups/u);
    const summary = clone(result.evidence) as unknown as {process_cleanup: {engines_reaped: number}};
    summary.process_cleanup.engines_reaped = 0;
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(summary, context)).toThrow(/summary/u);
  });

  it("supports only the explicit before-admission null-runner branch", async () => {
    const { result, context, fake } = await produce({ runner: false });
    expect(fake.seen).toHaveLength(8);
    expect(result.evidence.pre_cleanup_process_rows).toEqual([]);
    expect(result.evidence.ordered_cleanup_commands.map((row) => row.disposition)).toEqual([
      "executed",
      "not-required-after-held-post-bootout-absence-probe",
      "not-required-after-held-absence-probe",
    ]);
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
      result.evidence,
      { ...context, runnerNullPhaseBeforeAnyAdmission: false },
    )).toThrow(/root binding/u);
    const forged = clone(result.evidence) as unknown as {ordered_cleanup_commands: Array<{disposition: string}>};
    forged.ordered_cleanup_commands[1]!.disposition = "executed";
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(forged, context)).toThrow();
  });

  it("rejects extra keys, role/probe replay tampering, and timeline reversal", async () => {
    const { result, context } = await produce();
    const top = clone(result.evidence) as unknown as Record<string, unknown>;
    top.legacy_cleanup = true;
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(top, context)).toThrow(/keys/u);
    const nested = clone(result.evidence) as unknown as {service_absence: Record<string, unknown>};
    nested.service_absence.caller_service_absent = true;
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(nested, context)).toThrow(/keys/u);
    const role = clone(result.evidence) as unknown as {pre_cleanup_process_rows: Array<{role: string}>};
    role.pre_cleanup_process_rows = role.pre_cleanup_process_rows.map((row, index) =>
      index === 4 ? { ...row, role: "other-target-descendant" } : row,
    );
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(role, context)).toThrow(/pre process rows/u);
    const probe = clone(result.evidence) as unknown as {
      ordered_cleanup_commands: Array<{absence_probe: {parsed_process_rows: unknown[]}}>;
    };
    probe.ordered_cleanup_commands[0]!.absence_probe.parsed_process_rows = [];
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(probe, context)).toThrow(/semantics/u);
    const timeline = clone(result.evidence) as unknown as {
      service_absence: {finished_monotonic_ns: string};
      final_ps_first: {started_monotonic_ns: string};
    };
    timeline.final_ps_first.started_monotonic_ns =
      (BigInt(timeline.service_absence.finished_monotonic_ns) - 1n).toString();
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(timeline, context)).toThrow(/timeline/u);
  });

  it("rejects runner/plist derivation changes and ambiguous ps text", async () => {
    const { result, context } = await produce();
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
      result.evidence,
      { ...context, plistProgramArguments: [...context.plistProgramArguments, "--changed"] },
    )).toThrow(/runner\/plist/u);
    const ambiguous = clone(result.evidence) as unknown as {pre_cleanup_ps: {stdout: Record<string, unknown>}};
    replaceRaw(ambiguous.pre_cleanup_ps.stdout, Buffer.from("700 broken\n", "utf8"));
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(ambiguous, context)).toThrow(/ambiguous/u);
  });

  it("binds the producer closure entrypoint, order, identities, and revision", async () => {
    const { result, context } = await produce();
    const badIdentity = clone(result.evidence) as unknown as {
      producer: {dependency_closure: Array<{sha256: string}>};
    };
    badIdentity.producer.dependency_closure[0]!.sha256 = "f".repeat(64);
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(badIdentity, context)).toThrow(/producer/u);
    const badOrder = clone(result.evidence) as unknown as {
      producer: {dependency_closure: Array<{path: string; bytes: number; sha256: string}>};
    };
    badOrder.producer.dependency_closure.push(
      { path: "z.ts", bytes: 1, sha256: "1".repeat(64) },
      { path: "a.ts", bytes: 1, sha256: "2".repeat(64) },
    );
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(badOrder, {
      ...context,
      producer: badOrder.producer as Halfkp81V1R11ProcessCleanupValidationContext["producer"],
    })).toThrow(/closure order/u);
    const badRevision = clone(result.evidence) as unknown as {
      producer: Halfkp81V1R11ProcessCleanupValidationContext["producer"];
    };
    badRevision.producer = {
      ...badRevision.producer,
      source_revision: "d".repeat(40),
    };
    expect(() => validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(badRevision, {
      ...context,
      producer: badRevision.producer,
    })).toThrow(/producer/u);
  });
});
