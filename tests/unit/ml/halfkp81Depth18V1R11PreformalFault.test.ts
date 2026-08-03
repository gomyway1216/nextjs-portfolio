import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createV1R11AuthorityDirectory,
  publishV1R11CreateOnlyBytes,
  v1r11CanonicalLine,
  v1r11Sha256,
  type V1R11AuthorityFileIdentity,
} from "../../../ml/halfkp81-depth18-v1r11-authority-io";
import {
  HALFKP81_V1R11_PREFORMAL_TERMINAL_FAULT_SCHEMA,
  publishHalfkp81V1R11PreformalTerminalFaultForTests,
} from "../../../ml/halfkp81-depth18-v1r11-preformal-fault";
import { buildHalfkp81V1R11RecursiveProducerIdentity } from "../../../ml/halfkp81-depth18-v1r11-producer-closure";
import {
  produceHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests,
  type Halfkp81V1R11ProcessCleanupDependencies,
  type Halfkp81V1R11ProcessCleanupInput,
} from "../../../ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence";
import { verifyHalfkp81V1R11PreformalTerminalFaultForTests } from "../../../ml/verify-halfkp81-depth18-v1r11-preformal-fault";

const roots: string[] = [];
const CLEANUP_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-process-cleanup-evidence-v1r11";

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.promises.rm(root, { recursive: true, force: true }),
    ),
  );
});

function identity(filePath: string, raw: Buffer, schema: string) {
  return Object.freeze({
    path: filePath,
    bytes: raw.byteLength,
    sha256: v1r11Sha256(raw),
    schema,
  });
}

function emptyCleanupDependencies(
  uid: number,
  label: string,
): Readonly<Halfkp81V1R11ProcessCleanupDependencies> {
  let wall = Date.parse("2027-01-15T08:00:00.000Z");
  let monotonic = 1_000_000_000n;
  return Object.freeze({
    run(argv: readonly string[]) {
      wall += 10;
      monotonic += 10_000_000n;
      if (argv[0] === "/bin/ps") {
        return Object.freeze({
          exitCode: 0,
          signal: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
        });
      }
      if (
        argv[0] === "/bin/launchctl" &&
        argv[1] === "bootout" &&
        argv[2] === `gui/${uid}/${label}`
      ) {
        return Object.freeze({
          exitCode: 0,
          signal: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
        });
      }
      if (
        argv[0] === "/bin/launchctl" &&
        argv[1] === "print" &&
        argv[2] === `gui/${uid}/${label}`
      ) {
        return Object.freeze({
          exitCode: 113,
          signal: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.from(
            `Bad request.\nCould not find service "${label}" in domain for user gui: ${uid}\n`,
            "utf8",
          ),
        });
      }
      throw new Error(`unexpected cleanup command: ${argv.join(" ")}`);
    },
    nowMs: () => wall,
    monotonicNs: () => monotonic,
    wait: async (milliseconds: number) => {
      wall += milliseconds;
      monotonic += BigInt(milliseconds) * 1_000_000n;
    },
  });
}

async function fixture() {
  const temporary = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "v1r11-preformal-fault-test-"),
  );
  const root = await fs.promises.realpath(temporary);
  roots.push(root);
  await fs.promises.chmod(root, 0o700);
  const homeDirectory = path.join(root, "home");
  await fs.promises.mkdir(homeDirectory, { mode: 0o700 });
  const authorityPath = path.join(
    homeDirectory,
    ".codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority",
  );
  await fs.promises.mkdir(path.dirname(authorityPath), {
    recursive: true,
    mode: 0o700,
  });
  await fs.promises.chmod(path.dirname(authorityPath), 0o700);
  const authorityDirectory = await createV1R11AuthorityDirectory(authorityPath);
  const repositoryRoot = await fs.promises.realpath(
    path.resolve(__dirname, "../../.."),
  );
  const sourceRevision = execFileSync(
    "git",
    ["-C", repositoryRoot, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  const runFingerprint = "b".repeat(64);
  const teacherPlanPath = path.join(root, "teacher-plan.json");
  const teacherPlanRaw = Buffer.from('{"schema":"test-v1r11-plan"}\n', "utf8");
  await fs.promises.writeFile(teacherPlanPath, teacherPlanRaw, {
    flag: "wx",
    mode: 0o600,
  });
  const teacherPlan = identity(
    teacherPlanPath,
    teacherPlanRaw,
    "test-v1r11-plan",
  ) as Readonly<V1R11AuthorityFileIdentity>;
  const label = "com.meetyudai.shogi.v1r11-planned-test";
  const runnerUtilityArgv = Object.freeze([
    "/absolute/node",
    "/repository/ml/run-halfkp81-depth18-v1r11-formal-child.ts",
  ]);
  const programArguments = Object.freeze([
    "/usr/bin/caffeinate",
    "-dimsu",
    ...runnerUtilityArgv,
  ]);
  const plistRaw = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist><dict><key>ProgramArguments</key><array>${programArguments
      .map((argument) => `<string>${argument}</string>`)
      .join("")}</array></dict></plist>\n`,
    "utf8",
  );
  const plistPath = path.join(root, "planned.plist.snapshot");
  await fs.promises.writeFile(plistPath, plistRaw, { flag: "wx", mode: 0o600 });
  const plistSnapshot = identity(
    plistPath,
    plistRaw,
    "application/x-apple-aspen-config-exact-bytes",
  );
  const producer = Object.freeze({
    source_revision: sourceRevision,
    entrypoint:
      "ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence.ts" as const,
    dependency_closure: Object.freeze([
      Object.freeze({
        path: "ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence.ts",
        bytes: 1,
        sha256: "c".repeat(64),
      }),
    ]),
  });
  const cleanupInput: Halfkp81V1R11ProcessCleanupInput = Object.freeze({
    scope: "preformal",
    teacherPlan,
    sourceRevision,
    runFingerprint,
    launchagent: Object.freeze({ label, plistSnapshot }),
    runnerIdentity: null,
    runnerNullPhaseBeforeAnyAdmission: true,
    uid: process.geteuid?.() ?? 501,
    homeDirectory,
    repositoryRoot,
    fixedRoles: Object.freeze({
      powerGuardian: Object.freeze({
        executable: "/absolute/node",
        argv: "/absolute/node /repository/ml/halfkp81-depth18-power-continuity-guardian.ts",
      }),
      stageBSupervisor: Object.freeze({
        executable: "/absolute/node",
        argv: "/absolute/node /repository/ml/halfkp81-depth18-v1r11-stage-b-launchagent-supervisor.ts",
      }),
      yaneuraouEngine: Object.freeze({
        executable: "/absolute/yaneuraou",
        argv: "/absolute/yaneuraou --usi",
      }),
    }),
    producer,
  });
  const cleanup =
    await produceHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
      cleanupInput,
      emptyCleanupDependencies(cleanupInput.uid, label),
    );
  expect(cleanup.identity.schema).toBe(CLEANUP_SCHEMA);
  return {
    root,
    authorityDirectory,
    repositoryRoot,
    sourceRevision,
    runFingerprint,
    teacherPlan,
    cleanup,
  };
}

function request(value: Awaited<ReturnType<typeof fixture>>) {
  return {
    phase: "stage-a-producer" as const,
    gate: null,
    sequence: null,
    teacherPlan: value.teacherPlan,
    sourceRevision: value.sourceRevision,
    runFingerprint: value.runFingerprint,
    authorityDirectory: value.authorityDirectory,
    ledgerPrefix: null,
    lastGateReceipt: null,
    engineGateVerifiedReceipt: null,
    launchAgentAuthority: null,
    processCleanupEvidence: value.cleanup.identity,
    processCleanupValidationContext: value.cleanup.validationContext,
    error: Object.freeze({
      kind: "test-stage-a-failure",
      message: "Stage A stopped before runner admission",
      exit_code: null,
      signal: null,
    }),
    processCleanup: value.cleanup.recomputedProcessCleanup,
    faultedAtUtc: "2027-01-15T08:00:20.000Z",
    repositoryRoot: value.repositoryRoot,
  };
}

describe("HalfKP81 v1r11 preformal terminal fault", () => {
  it("enrolls the complete multiline recursive outer dependency closure", async () => {
    const value = await fixture();
    const producer = buildHalfkp81V1R11RecursiveProducerIdentity(
      value.repositoryRoot,
      value.sourceRevision,
      "ml/run-halfkp81-depth18-v1r11-preformal-orchestrator.ts",
      { requireTrackedRevision: false },
    );
    const paths = producer.dependency_closure.map((entry) => entry.path);
    expect(paths[0]).toBe(
      "ml/run-halfkp81-depth18-v1r11-preformal-orchestrator.ts",
    );
    expect(paths).toEqual(
      expect.arrayContaining([
        "ml/finalize-halfkp81-depth18-v1r11-staged-authority.ts",
        "ml/halfkp81-depth18-v1r11-formal-like-512.ts",
        "ml/prepare-halfkp81-depth18-v1r11-planned-launchagent.ts",
        "ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence.ts",
        "ml/produce-halfkp81-depth18-v1r11-stage-bc.ts",
        "ml/verify-halfkp81-depth18-v1r11-staged-authority.ts",
      ]),
    );
    const tail = paths.slice(1);
    expect(tail).toEqual(
      [...tail].sort((left, right) =>
        Buffer.compare(Buffer.from(left), Buffer.from(right)),
      ),
    );
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("publishes only after required rich runner-null cleanup and independently verifies it", async () => {
    const value = await fixture();
    const fault = await publishHalfkp81V1R11PreformalTerminalFaultForTests(
      request(value),
    );
    expect(fault.schema).toBe(HALFKP81_V1R11_PREFORMAL_TERMINAL_FAULT_SCHEMA);
    await expect(
      verifyHalfkp81V1R11PreformalTerminalFaultForTests(fault, {
        teacherPlan: value.teacherPlan,
        sourceRevision: value.sourceRevision,
        runFingerprint: value.runFingerprint,
        authorityDirectory: value.authorityDirectory,
        repositoryRoot: value.repositoryRoot,
        processCleanupValidationContext: value.cleanup.validationContext,
      }),
    ).resolves.toMatchObject({
      phase: "stage-a-producer",
      process_cleanup_evidence: value.cleanup.identity,
      process_cleanup: value.cleanup.recomputedProcessCleanup,
      authority: {
        may_execute_preformal_engine_gates: false,
        may_execute_formal_teacher: false,
      },
    });
  });

  it("rejects caller-authored cleanup summary before fault publication", async () => {
    const value = await fixture();
    await expect(
      publishHalfkp81V1R11PreformalTerminalFaultForTests({
        ...request(value),
        processCleanup: {
          scheduling_stopped: true,
          engines_terminated: 1,
          engines_reaped: 1,
          remaining_engine_pids: [],
        },
      }),
    ).rejects.toThrow(/cleanup summary differs/u);
    await expect(
      fs.promises.lstat(
        path.join(value.authorityDirectory.path, "preformal-terminal-fault.json"),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an outer-orchestrator producer closure mismatch", async () => {
    const value = await fixture();
    const forged = Object.freeze({
      schema: HALFKP81_V1R11_PREFORMAL_TERMINAL_FAULT_SCHEMA,
      status: "preformal-terminal-fault-family-closed-no-authority",
      phase: "stage-a-producer",
      gate: null,
      sequence: null,
      teacher_plan: value.teacherPlan,
      source_revision: value.sourceRevision,
      run_fingerprint: value.runFingerprint,
      authority_directory: value.authorityDirectory,
      ledger_prefix: null,
      last_gate_receipt: null,
      engine_gate_verified_receipt: null,
      launchagent_authority: null,
      process_cleanup_evidence: value.cleanup.identity,
      error: request(value).error,
      process_cleanup: value.cleanup.recomputedProcessCleanup,
      faulted_at_utc: "2027-01-15T08:00:20.000Z",
      producer: {
        source_revision: value.sourceRevision,
        entrypoint: "ml/not-the-outer.ts",
        dependency_closure: [
          { path: "ml/not-the-outer.ts", bytes: 1, sha256: "d".repeat(64) },
        ],
      },
      authority: {
        may_execute_preformal_engine_gates: false,
        may_execute_formal_teacher: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    });
    const fault = await publishV1R11CreateOnlyBytes(
      value.authorityDirectory,
      path.join(value.authorityDirectory.path, "preformal-terminal-fault.json"),
      v1r11CanonicalLine(forged),
      HALFKP81_V1R11_PREFORMAL_TERMINAL_FAULT_SCHEMA,
    );
    await expect(
      verifyHalfkp81V1R11PreformalTerminalFaultForTests(fault, {
        teacherPlan: value.teacherPlan,
        sourceRevision: value.sourceRevision,
        runFingerprint: value.runFingerprint,
        authorityDirectory: value.authorityDirectory,
        repositoryRoot: value.repositoryRoot,
        processCleanupValidationContext: value.cleanup.validationContext,
      }),
    ).rejects.toThrow(/outer orchestrator producer closure differs/u);
  });
});
