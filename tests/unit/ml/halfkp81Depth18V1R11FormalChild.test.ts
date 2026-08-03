import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import {
  runHalfkp81V1R11FormalChildBarrierInScratchForTests,
  runHalfkp81V1R11FormalChildBarrierForTests,
  validateHalfkp81V1R11ModernVerifiedReceiptForTests,
  validateHalfkp81V1R11FormalChildAssertionHolderReadyForTests,
  waitHalfkp81V1R11ModernVerifiedReceiptForTests,
} from "../../../ml/run-halfkp81-depth18-v1r11-formal-child";
import { runHalfkp81Depth18V1R11FromModernVerifiedAuthority } from "../../../ml/halfkp81-depth18-teacher-runner";
import type { Halfkp81V1R11ScratchNamespaceCapabilityForTests } from "../../../ml/verify-halfkp81-depth18-v1r11-stage-a";

const VERIFIED_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-verified-receipt-v1r11";
const LEDGER_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11";
const RAW_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-receipt-v1r11";
const GATE_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11";
const LAUNCH_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11";
const PLIST_SCHEMA = "application/x-apple-aspen-config-exact-bytes";
const GATES = [
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

function id(name: string, schema: string) {
  return Object.freeze({
    path: `/private/tmp/v1r11-formal-child/${name}`,
    bytes: 100 + name.length,
    sha256: name.charCodeAt(0).toString(16).padStart(2, "0").repeat(32),
    schema,
  });
}

function fixture() {
  const teacherPlan = id("teacher-plan.json", "teacher-plan-v1r11");
  const sourceRevision = "1".repeat(40);
  const runFingerprint = "2".repeat(64);
  const launchAgentEvidence = id("launch.json", LAUNCH_SCHEMA);
  const plannedFinalDescriptor = id("launch.plist", PLIST_SCHEMA);
  const ledger = id("ledger.jsonl", LEDGER_SCHEMA);
  const rawReceipt = id("raw.json", RAW_SCHEMA);
  const verifiedReceipt = id("verified.json", VERIFIED_SCHEMA);
  const gateIdentities = Object.fromEntries(
    GATES.map((gate, index) => [
      gate,
      id(`gate-${String(index + 1)}.json`, GATE_SCHEMA),
    ]),
  );
  const receipt = Object.freeze({
    schema: VERIFIED_SCHEMA,
    status:
      "all-required-preformal-gates-independently-verified-formal-only-authority",
    teacher_plan: teacherPlan,
    source_revision: sourceRevision,
    run_fingerprint: runFingerprint,
    required_order: [...GATES, "formal-teacher"],
    ledger,
    raw_receipt: rawReceipt,
    gates: gateIdentities,
    launchagent_authority: launchAgentEvidence,
    verifier: id("verifier.ts", "tracked-source-revision-file-v1"),
    authority: {
      may_execute_formal_teacher: true,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
  });
  return {
    teacherPlan,
    sourceRevision,
    runFingerprint,
    launchAgentEvidence,
    plannedFinalDescriptor,
    ledger,
    rawReceipt,
    verifiedReceipt,
    receipt,
  };
}

describe("HalfKP81 v1r11 modern formal child", () => {
  it("requires exact node-parent/caffeinate-child topology and pmset ownership", () => {
    const repositoryRoot = fs.realpathSync.native(path.resolve(__dirname, "../../.."));
    const nodePath = fs.realpathSync.native(process.execPath);
    const runnerArgv = [
      nodePath,
      "-r",
      path.join(repositoryRoot, "node_modules/tsx/dist/cjs/index.cjs"),
      path.join(repositoryRoot, "ml/run-halfkp81-depth18-v1r11-formal-child.ts"),
    ].join(" ");
    const holderArgv = "/usr/bin/caffeinate -dimsu -w 700";
    const ps = Buffer.from(
      [
        `700 1 700 Sun Aug  2 12:00:00 2026 ${runnerArgv}`,
        `701 700 700 Sun Aug  2 12:00:01 2026 ${holderArgv}`,
        "",
      ].join("\n"),
      "utf8",
    );
    const pmset = Buffer.from(
      [
        "System-wide power settings:",
        "Currently in use:",
        "   PreventSystemSleep             1",
        "   PreventUserIdleSystemSleep     1",
        "   PreventUserIdleDisplaySleep    1",
        "Listed by owning process:",
        "   pid 701(caffeinate): [0x1] 00:00:01 PreventSystemSleep named: 'caffeinate command-line tool'",
        "   pid 701(caffeinate): [0x2] 00:00:01 PreventUserIdleSystemSleep named: 'caffeinate command-line tool'",
        "   pid 701(caffeinate): [0x3] 00:00:01 PreventUserIdleDisplaySleep named: 'caffeinate command-line tool'",
      ].join("\n"),
      "utf8",
    );
    const context = { runnerPid: 700, holderPid: 701, nodePath };
    expect(() =>
      validateHalfkp81V1R11FormalChildAssertionHolderReadyForTests(
        ps,
        pmset,
        context,
      ),
    ).not.toThrow();
    expect(() =>
      validateHalfkp81V1R11FormalChildAssertionHolderReadyForTests(
        Buffer.from(ps.toString("utf8").replace("701 700 700", "701 699 700")),
        pmset,
        context,
      ),
    ).toThrow(/topology differs/u);
    expect(() =>
      validateHalfkp81V1R11FormalChildAssertionHolderReadyForTests(
        ps,
        Buffer.from(pmset.toString("utf8").replaceAll("pid 701", "pid 702")),
        context,
      ),
    ).toThrow(/PreventSystemSleep differs/u);
  });

  it.runIf(process.platform === "darwin")(
    "matches real macOS command-only ps and the node-parent/caffeinate-child process group",
    async () => {
      const nodePath = fs.realpathSync.native(process.execPath);
      const source =
        "const{spawn}=require('node:child_process');const c=spawn('/usr/bin/caffeinate',['-dimsu','-w',String(process.pid)],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)";
      const runner = spawn(nodePath, ["-e", source], {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const runnerPid = Number(runner.pid);
      try {
        const holderPid = await new Promise<number>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("scratch assertion holder PID timed out")),
            5_000,
          );
          runner.once("error", reject);
          runner.stdout!.once("data", (chunk: Buffer) => {
            clearTimeout(timer);
            resolve(Number(chunk.toString("utf8").trim()));
          });
        });
        const expectedRunnerArgvForTests = [nodePath, "-e", source].join(" ");
        const deadline = Date.now() + 5_000;
        let last: unknown = new Error("scratch assertion evidence unavailable");
        for (;;) {
          const ps = spawnSync(
            "/bin/ps",
            ["-ww", "-axo", "pid=,ppid=,pgid=,lstart=,command="],
            { encoding: null },
          );
          const pmset = spawnSync("/usr/bin/pmset", ["-g", "assertions"], {
            encoding: null,
          });
          try {
            expect(ps.status).toBe(0);
            expect(pmset.status).toBe(0);
            validateHalfkp81V1R11FormalChildAssertionHolderReadyForTests(
              ps.stdout as Buffer,
              pmset.stdout as Buffer,
              {
                runnerPid,
                holderPid,
                nodePath,
                expectedRunnerArgvForTests,
              },
            );
            break;
          } catch (error) {
            last = error;
            if (Date.now() >= deadline) throw last;
            await new Promise<void>((resolve) => setTimeout(resolve, 100));
          }
        }
      } finally {
        try {
          process.kill(-runnerPid, "SIGTERM");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
        await new Promise<void>((resolve) => {
          if (runner.exitCode !== null || runner.signalCode !== null) resolve();
          else runner.once("exit", () => resolve());
        });
      }
    },
    15_000,
  );

  it("has zero import-time production side effects", () => {
    const repositoryRoot = path.resolve(__dirname, "../../..");
    const preload = path.join(
      repositoryRoot,
      "node_modules/tsx/dist/cjs/index.cjs",
    );
    const entrypoint = path.join(
      repositoryRoot,
      "ml/run-halfkp81-depth18-v1r11-formal-child.ts",
    );
    const result = spawnSync(
      process.execPath,
      ["-r", preload, "-e", `require(${JSON.stringify(entrypoint)});process.stdout.write("import-ok\\n")`],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("import-ok\n");
  });

  it("keeps every receipt poll behind engine-zero and returns held authority", async () => {
    const value = fixture();
    let polls = 0;
    let engineZeroChecks = 0;
    const held: string[] = [];
    const result = await waitHalfkp81V1R11ModernVerifiedReceiptForTests(
      {
        timeoutMs: 1_000,
        teacherPlan: value.teacherPlan,
        sourceRevision: value.sourceRevision,
        runFingerprint: value.runFingerprint,
        launchAgentEvidence: value.launchAgentEvidence,
        plannedFinalDescriptor: value.plannedFinalDescriptor,
        holdIdentity: async (entry) => {
          held.push(entry.path);
        },
      },
      {
        readVerifiedReceipt: async () => {
          polls += 1;
          return polls === 1
            ? null
            : { identity: value.verifiedReceipt, value: value.receipt };
        },
        terminalFaultExists: async () => false,
        assertEngineZero: async () => {
          engineZeroChecks += 1;
        },
        sleep: async () => undefined,
        now: () => (polls === 0 ? 0 : polls * 100),
      },
    );
    expect(engineZeroChecks).toBe(2);
    expect(result.verifiedReceipt).toEqual(value.verifiedReceipt);
    expect(held).toContain(value.plannedFinalDescriptor.path);
    expect(held).toContain(value.launchAgentEvidence.path);
  });

  it("times out and rejects terminal faults without starting an engine", async () => {
    const value = fixture();
    let now = 0;
    let engineZeroChecks = 0;
    await expect(
      waitHalfkp81V1R11ModernVerifiedReceiptForTests(
        {
          timeoutMs: 1,
          teacherPlan: value.teacherPlan,
          sourceRevision: value.sourceRevision,
          runFingerprint: value.runFingerprint,
          launchAgentEvidence: value.launchAgentEvidence,
          plannedFinalDescriptor: value.plannedFinalDescriptor,
          holdIdentity: async () => undefined,
        },
        {
          readVerifiedReceipt: async () => null,
          terminalFaultExists: async () => false,
          assertEngineZero: async () => {
            engineZeroChecks += 1;
          },
          sleep: async () => {
            now = 1;
          },
          now: () => now,
        },
      ),
    ).rejects.toThrow(/timed out at engine zero/u);
    expect(engineZeroChecks).toBe(2);
    await expect(
      waitHalfkp81V1R11ModernVerifiedReceiptForTests(
        {
          timeoutMs: 1_000,
          teacherPlan: value.teacherPlan,
          sourceRevision: value.sourceRevision,
          runFingerprint: value.runFingerprint,
          launchAgentEvidence: value.launchAgentEvidence,
          plannedFinalDescriptor: value.plannedFinalDescriptor,
          holdIdentity: async () => undefined,
        },
        {
          readVerifiedReceipt: async () => null,
          terminalFaultExists: async () => true,
          assertEngineZero: async () => undefined,
          sleep: async () => undefined,
          now: () => 0,
        },
      ),
    ).rejects.toThrow(/closed the family/u);
  });

  it("runs the public formal-child barrier before the sole formal capability edge", async () => {
    const value = fixture();
    const events: string[] = [];
    const formalRun = Object.freeze({
      fingerprint: value.runFingerprint,
      input: Object.freeze({ marker: "same-fixed-intent" }),
    });
    await runHalfkp81V1R11FormalChildBarrierForTests(
      {
        repositoryRoot: "/private/tmp/repository",
        teacherPlan: value.teacherPlan,
        sourceRevision: value.sourceRevision,
        authorityDirectory: { path: "/private/tmp/authority" } as never,
        gateDirectory: { path: "/private/tmp/authority/preformal-gates" } as never,
        stageAReceipt: id("stage-a.json", "stage-a-v1r11"),
        launchAgentEvidence: value.launchAgentEvidence,
        plannedFinalDescriptor: value.plannedFinalDescriptor,
        initialFormalRun: formalRun as never,
        timeoutMs: 1_000,
        holdIdentity: async () => undefined,
      },
      {
        waitBoundary: {
          readVerifiedReceipt: async () => ({
            identity: value.verifiedReceipt,
            value: value.receipt,
          }),
          terminalFaultExists: async () => false,
          assertEngineZero: async () => {
            events.push("wait-engine-zero");
          },
          sleep: async () => undefined,
          now: () => 0,
        },
        assertEngineZero: async () => {
          events.push("barrier-engine-zero");
        },
        recomputeFormalRun: (async () => {
          events.push("fresh-intent");
          return formalRun;
        }) as never,
        reauthenticateExistingAuthority: (async (request: {
          verifiedReceipt: unknown;
        }) => {
          events.push("all13-reauth");
          expect(request.verifiedReceipt).toEqual(value.verifiedReceipt);
          return { status: "existing-all13-authority-independently-reauthenticated" };
        }) as never,
        consumeFormalCapability: (async (request: {
          verifiedPreformalAuthority: unknown;
        }) => {
          events.push("formal-capability-edge");
          expect(request.verifiedPreformalAuthority).toEqual(value.verifiedReceipt);
        }) as never,
      },
    );
    expect(events).toEqual([
      "wait-engine-zero",
      "barrier-engine-zero",
      "fresh-intent",
      "all13-reauth",
      "barrier-engine-zero",
      "formal-capability-edge",
    ]);
  });

  it("rejects a forged scratch namespace before polling or capability use", async () => {
    let touched = false;
    await expect(
      runHalfkp81V1R11FormalChildBarrierInScratchForTests(
        Object.freeze({}) as Halfkp81V1R11ScratchNamespaceCapabilityForTests,
        {} as never,
        {
          waitBoundary: {
            readVerifiedReceipt: async () => {
              touched = true;
              return null;
            },
            terminalFaultExists: async () => false,
            assertEngineZero: async () => undefined,
            sleep: async () => undefined,
            now: () => 0,
          },
          assertEngineZero: async () => undefined,
          recomputeFormalRun: (async () => {
            touched = true;
            throw new Error("unreachable");
          }) as never,
          consumeFormalCapability: (async () => {
            touched = true;
          }) as never,
          liveLaunchObserver: {
            observe: async () => {
              touched = true;
              throw new Error("unreachable");
            },
          },
        },
      ),
    ).rejects.toThrow(/capability is forged/u);
    expect(touched).toBe(false);
  });

  it("rejects receipt binding tamper and keeps the modern core lock first", async () => {
    const value = fixture();
    await expect(
      validateHalfkp81V1R11ModernVerifiedReceiptForTests({
        receiptIdentity: value.verifiedReceipt,
        receipt: { ...value.receipt, run_fingerprint: "f".repeat(64) },
        teacherPlan: value.teacherPlan,
        sourceRevision: value.sourceRevision,
        runFingerprint: value.runFingerprint,
        launchAgentEvidence: value.launchAgentEvidence,
        plannedFinalDescriptor: value.plannedFinalDescriptor,
        holdIdentity: async () => undefined,
      }),
    ).rejects.toThrow(/binding differs/u);
    await expect(
      runHalfkp81Depth18V1R11FromModernVerifiedAuthority({} as never),
    ).rejects.toThrow(/formal remains locked/u);
  });
});
