import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createV1R11AuthorityDirectory,
  publishV1R11CreateOnlyBytes,
  v1r11CanonicalLine,
  v1r11Sha256,
  type V1R11AuthorityFileIdentity,
} from "../../../ml/halfkp81-depth18-v1r11-authority-io";
import { publishHalfkp81V1R11PreformalTerminalFaultForTests } from "../../../ml/halfkp81-depth18-v1r11-preformal-fault";
import { Halfkp81V1R11PreformalStageFailure } from "../../../ml/halfkp81-depth18-v1r11-preformal-stage-failure";
import {
  produceHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests,
  type Halfkp81V1R11ProcessCleanupDependencies,
  type Halfkp81V1R11ProcessCleanupInput,
} from "../../../ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence";
import { prepareHalfkp81V1R11PlannedLaunchAgentForTests } from "../../../ml/prepare-halfkp81-depth18-v1r11-planned-launchagent";
import {
  executeHalfkp81V1R11FixedStageSequenceForTests,
  runHalfkp81V1R11PreformalOrchestratorForTests,
  type Halfkp81V1R11FixedStageSequenceDependencies,
} from "../../../ml/run-halfkp81-depth18-v1r11-preformal-orchestrator";
import { verifyHalfkp81V1R11PreformalTerminalFaultForTests } from "../../../ml/verify-halfkp81-depth18-v1r11-preformal-fault";

const roots: string[] = [];
const uid = process.geteuid?.() ?? 501;
const runnerLstart = "Sun Aug  2 11:00:00 2026";

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) =>
      fs.promises.rm(root, { recursive: true, force: true }),
    ),
  );
});

function fileIdentity(filePath: string, raw: Buffer, schema: string) {
  return Object.freeze({
    path: filePath,
    bytes: raw.byteLength,
    sha256: v1r11Sha256(raw),
    schema,
  });
}

async function fixture(active: boolean) {
  const temporary = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "v1r11-staged-authority-e2e-"),
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
  const repositoryRoot = await fs.promises.realpath(path.resolve(__dirname, "../../.."));
  const sourceRevision = execFileSync(
    "git",
    ["-C", repositoryRoot, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();
  const runFingerprint = "a".repeat(64);
  const teacherPlanRaw = Buffer.from('{"schema":"e2e-plan"}\n', "utf8");
  const teacherPlanPath = path.join(root, "teacher-plan.json");
  await fs.promises.writeFile(teacherPlanPath, teacherPlanRaw, {
    flag: "wx",
    mode: 0o600,
  });
  const teacherPlan = fileIdentity(
    teacherPlanPath,
    teacherPlanRaw,
    "e2e-plan",
  ) as Readonly<V1R11AuthorityFileIdentity>;
  const planned = await prepareHalfkp81V1R11PlannedLaunchAgentForTests({
    authorityDirectory,
    repositoryRoot,
    homeDirectory,
    nodePath: "/absolute/node",
    sourceRevision,
  });
  const { label, plistSnapshot, programArguments } = planned;
  const runnerUtilityArgv = Object.freeze([...programArguments]);
  let launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity> | null = null;
  if (active) {
    launchAgentAuthority = await publishV1R11CreateOnlyBytes(
      authorityDirectory,
      path.join(authorityPath, "launchagent-authority-evidence.json"),
      v1r11CanonicalLine({
        schema: "test-live-launchagent",
        label,
        plist_snapshot: plistSnapshot,
      }),
      "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11",
    );
  }
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
      executable: "/absolute/yaneuraou",
      argv: "/absolute/yaneuraou --usi",
    }),
  });
  const runnerIdentity = active
    ? Object.freeze({ pid: 700, pgid: 700, lstart: runnerLstart })
    : null;
  const cleanupInput: Halfkp81V1R11ProcessCleanupInput = Object.freeze({
    scope: "preformal",
    teacherPlan,
    sourceRevision,
    runFingerprint,
    launchagent: Object.freeze({ label, plistSnapshot }),
    runnerIdentity,
    runnerNullPhaseBeforeAnyAdmission: !active,
    uid,
    homeDirectory,
    repositoryRoot,
    fixedRoles,
    producer: Object.freeze({
      source_revision: sourceRevision,
      entrypoint:
        "ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence.ts" as const,
      dependency_closure: Object.freeze([
        Object.freeze({
          path: "ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence.ts",
          bytes: 1,
          sha256: "b".repeat(64),
        }),
      ]),
    }),
  });
  const context = Object.freeze({
    repositoryRoot,
    teacherPlan,
    sourceRevision,
    runFingerprint,
    authorityDirectory,
    plannedLaunchAgent: Object.freeze({ label, plistSnapshot }),
  });
  return {
    root,
    context,
    cleanupInput,
    launchAgentAuthority,
    runnerIdentity,
    runnerUtilityArgv,
    programArguments,
    fixedRoles,
    label,
  };
}

function cleanupDependencies(
  active: boolean,
  launchAgentLabel: string,
  utilityArgv: readonly string[],
  programArguments: readonly string[],
  fixedRoles: Awaited<ReturnType<typeof fixture>>["fixedRoles"],
): Readonly<Halfkp81V1R11ProcessCleanupDependencies> {
  let wall = Date.parse("2027-01-15T08:00:00.000Z");
  let mono = 1_000_000_000n;
  let psCalls = 0;
  const prePs = Buffer.from(
    [
      `700 1 700 ${runnerLstart} ${utilityArgv.join(" ")}`,
      "701 700 700 Sun Aug  2 11:00:01 2026 /usr/bin/caffeinate -dimsu -w 700",
      `702 700 700 Sun Aug  2 11:00:02 2026 ${fixedRoles.yaneuraouEngine.argv}`,
      "",
    ].join("\n"),
    "utf8",
  );
  return Object.freeze({
    run(argv) {
      wall += 10;
      mono += 10_000_000n;
      if (argv[0] === "/bin/ps") {
        psCalls += 1;
        return {
          exitCode: 0,
          signal: null,
          stdout: active && psCalls <= 2 ? prePs : Buffer.alloc(0),
          stderr: Buffer.alloc(0),
        };
      }
      if (argv[0] === "/bin/launchctl" && argv[1] === "bootout") {
        return { exitCode: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
      }
      if (argv[0] === "/bin/kill" && argv[1] === "-TERM") {
        return { exitCode: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
      }
      if (argv[0] === "/bin/launchctl" && argv[1] === "print") {
        return {
          exitCode: 113,
          signal: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.from(
            `Bad request.\nCould not find service "${launchAgentLabel}" in domain for user gui: ${uid}\n`,
            "utf8",
          ),
        };
      }
      throw new Error(`unexpected cleanup command ${argv.join(" ")}`);
    },
    nowMs: () => wall,
    monotonicNs: () => mono,
    wait: async (milliseconds) => {
      wall += milliseconds;
      mono += BigInt(milliseconds) * 1_000_000n;
    },
  });
}

function typedFailure(
  value: Awaited<ReturnType<typeof fixture>>,
  active: boolean,
) {
  return new Halfkp81V1R11PreformalStageFailure({
    phase: active ? "final-ac-gate" : "stage-a-producer",
    gate: active ? "ac-power-start-admission-pass" : null,
    sequence: active ? 13 : null,
    runnerState: active ? "active" : "not-created",
    failure: new Error(active ? "active runner failed" : "Stage A failed"),
    artifacts: Object.freeze({
      ledgerPrefix: null,
      lastGateReceipt: null,
      engineGateVerifiedReceipt: null,
      launchAgentAuthority: value.launchAgentAuthority,
      activeLaunchAgent: active
        ? value.context.plannedLaunchAgent
        : null,
      runnerIdentity: value.runnerIdentity,
      partialArtifacts: Object.freeze([]),
    }),
  });
}

function dependencies(
  value: Awaited<ReturnType<typeof fixture>>,
  active: boolean,
) {
  const publishFault = vi.fn(publishHalfkp81V1R11PreformalTerminalFaultForTests);
  const produceCleanup = vi.fn(async () =>
    produceHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
      value.cleanupInput,
      cleanupDependencies(
        active,
        value.label,
        value.runnerUtilityArgv,
        value.programArguments,
        value.fixedRoles,
      ),
    ),
  );
  return {
    publishFault,
    produceCleanup,
    value: Object.freeze({
      executeStages: async () => {
        throw typedFailure(value, active);
      },
      cleanupInput: () => value.cleanupInput,
      produceCleanup,
      publishFault,
      verifyFault: verifyHalfkp81V1R11PreformalTerminalFaultForTests,
      now: () => "2027-01-15T08:00:20.000Z",
    }),
  };
}

describe("HalfKP81 v1r11 mandatory staged-authority E2E", () => {
  it.each([false, true])(
    "publishes rich cleanup before exactly one terminal fault (active=%s)",
    async (active) => {
      const value = await fixture(active);
      const injected = dependencies(value, active);
      await expect(
        runHalfkp81V1R11PreformalOrchestratorForTests(
          value.context,
          injected.value,
        ),
      ).resolves.toMatchObject({
        status: "preformal-terminal-fault-family-closed",
      });
      expect(injected.produceCleanup).toHaveBeenCalledTimes(1);
      expect(injected.publishFault).toHaveBeenCalledTimes(1);
      const cleanupStat = await fs.promises.lstat(
        path.join(value.context.authorityDirectory.path, "preformal-process-cleanup-evidence.json"),
      );
      const faultStat = await fs.promises.lstat(
        path.join(value.context.authorityDirectory.path, "preformal-terminal-fault.json"),
      );
      expect(cleanupStat.birthtimeMs).toBeLessThanOrEqual(faultStat.birthtimeMs);
    },
  );

  it("rejects an untyped inner failure without publishing cleanup or fault", async () => {
    const value = await fixture(false);
    const publishFault = vi.fn();
    await expect(
      runHalfkp81V1R11PreformalOrchestratorForTests(value.context, {
        executeStages: async () => {
          throw new Error("caller-authored untyped failure");
        },
        cleanupInput: () => value.cleanupInput,
        produceCleanup: vi.fn(),
        publishFault,
        verifyFault: vi.fn(),
        now: () => "2027-01-15T08:00:20.000Z",
      }),
    ).rejects.toThrow(/rejected untyped inner failure/u);
    expect(publishFault).not.toHaveBeenCalled();
  });

  it("rejects direct inner cleanup publication", async () => {
    const value = await fixture(false);
    const publishFault = vi.fn();
    await expect(
      runHalfkp81V1R11PreformalOrchestratorForTests(value.context, {
        executeStages: async () => {
          await fs.promises.writeFile(
            path.join(value.context.authorityDirectory.path, "preformal-process-cleanup-evidence.json"),
            "inner\n",
            { flag: "wx", mode: 0o600 },
          );
          throw typedFailure(value, false);
        },
        cleanupInput: () => value.cleanupInput,
        produceCleanup: vi.fn(),
        publishFault,
        verifyFault: vi.fn(),
        now: () => "2027-01-15T08:00:20.000Z",
      }),
    ).rejects.toThrow(/published by an inner component/u);
    expect(publishFault).not.toHaveBeenCalled();
  });

  it("does not publish a fault when cleanup production fails", async () => {
    const value = await fixture(false);
    const publishFault = vi.fn();
    await expect(
      runHalfkp81V1R11PreformalOrchestratorForTests(value.context, {
        executeStages: async () => {
          throw typedFailure(value, false);
        },
        cleanupInput: () => value.cleanupInput,
        produceCleanup: async () => {
          throw new Error("cleanup proof unavailable");
        },
        publishFault,
        verifyFault: vi.fn(),
        now: () => "2027-01-15T08:00:20.000Z",
      }),
    ).rejects.toThrow(/cleanup proof unavailable/u);
    expect(publishFault).not.toHaveBeenCalled();
  });

  it("routes the actual fixed A→five-B→C→finalizer→independent sequence", async () => {
    const value = await fixture(false);
    const calls: string[] = [];
    let nextArtifact = 0;
    const artifact = async (schema: string) => {
      nextArtifact += 1;
      return publishV1R11CreateOnlyBytes(
        value.context.authorityDirectory,
        path.join(
          value.context.authorityDirectory.path,
          `sequence-artifact-${String(nextArtifact).padStart(2, "0")}.json`,
        ),
        Buffer.from(`{"artifact":${nextArtifact}}\n`, "utf8"),
        schema,
      );
    };
    const stageALedger = await artifact("ledger");
    const stageAReceipt = await artifact("stage-a-receipt");
    const previous = await artifact("gate-receipt");
    const dependencies = Object.freeze({
      produceStageA: async () => {
        calls.push("A-produce");
        return {
          authorityDirectory: value.context.authorityDirectory,
          gateDirectory: value.context.authorityDirectory,
          ledgerPrefix: stageALedger,
        };
      },
      verifyStageA: async () => {
        calls.push("A-verify");
        return stageAReceipt;
      },
      previousReceipt: async () => previous,
      executeStageB: async (_context: unknown, gate: string) => {
        calls.push(`B:${gate}`);
        return {
          stageBRunFingerprint: "f".repeat(64),
          stageBEpochNamespace: `test-${gate}`,
          evidence: await artifact(`evidence-${gate}`),
          receipt: await artifact("gate-receipt"),
          ledger: await artifact("ledger"),
        };
      },
      executeStageC: async () => {
        calls.push("C");
        return {
          evidence: await artifact("stage-c-evidence"),
          receipt: await artifact("gate-receipt"),
          ledger: await artifact("ledger"),
          launchAgentAuthority: await artifact("launch-authority"),
        };
      },
      finalize: async () => {
        calls.push("finalizer");
        return artifact("raw-receipt");
      },
      independentlyVerify: async () => {
        calls.push("independent");
        return artifact("verified-receipt");
      },
    }) as unknown as Readonly<Halfkp81V1R11FixedStageSequenceDependencies>;
    const verified = await executeHalfkp81V1R11FixedStageSequenceForTests(
      {
        repositoryRoot: value.context.repositoryRoot,
        teacherPlan: value.context.teacherPlan,
        sourceRevision: value.context.sourceRevision,
        runFingerprint: value.context.runFingerprint,
        prNumber: 1,
        authorityDirectory: value.context.authorityDirectory,
      },
      dependencies,
    );
    expect(verified.schema).toBe("verified-receipt");
    expect(calls).toEqual([
      "A-produce",
      "A-verify",
      "B:candidate-order-gate",
      "B:known10-probe",
      "B:pathological-fallback-probe",
      "B:mixed-load-gate",
      "B:formal-like-512",
      "C",
      "finalizer",
      "independent",
    ]);
  });
});
