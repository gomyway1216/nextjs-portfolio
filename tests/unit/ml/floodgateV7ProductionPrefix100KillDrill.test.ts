import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS } from "../../../ml/floodgate-v7-production-connector-registry";
import {
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
  FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
} from "../../../ml/floodgate-v7-production-outer-gate-lease";

import {
  FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_CHILD_PROTOCOL,
  FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_CONTRACT,
  FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_EXECUTION_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_POINTS,
  FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_SIGNALS,
  FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_STATUS,
  FloodgateV7ProductionPrefix100KillDrillManualReconciliationError,
  type FloodgateV7ProductionPrefix100KillDrillDependenciesForTests,
  runFloodgateV7ProductionPrefix100DisposableKillDrill,
  runFloodgateV7ProductionPrefix100FixedAnchorSetupCoreForTests,
  runFloodgateV7ProductionPrefix100KillDrillCoreForTests,
} from "../../../ml/floodgate-v7-production-prefix-100-kill-drill";

const CHILD_PATH = path.resolve(
  "ml/helpers/floodgate-v7-production-prefix-100-kill-drill-child.ts",
);
const darwinDescribe = describe.runIf(process.platform === "darwin");
const temporaryParents: string[] = [];

async function privateTemporaryParent(): Promise<string> {
  const root = await fs.promises.realpath(
    await fs.promises.mkdtemp(
      path.join("/private/tmp", "floodgate-v7-kill-drill-test-parent-"),
    ),
  );
  await fs.promises.chmod(root, 0o700);
  temporaryParents.push(root);
  return root;
}

function testDependencies(
  temporaryParent: string,
  overrides: Partial<FloodgateV7ProductionPrefix100KillDrillDependenciesForTests> = {},
): FloodgateV7ProductionPrefix100KillDrillDependenciesForTests {
  if (typeof process.geteuid !== "function") {
    throw new Error("kill drill tests require POSIX effective uid");
  }
  return {
    effectiveUserId: process.geteuid(),
    temporaryParent,
    nodeExecutable: process.execPath,
    childModulePath: CHILD_PATH,
    lockfPath: "/usr/bin/lockf",
    ...overrides,
  };
}

function onePreservedFixture(temporaryParent: string): string {
  const entries = fs
    .readdirSync(temporaryParent)
    .filter((entry) => entry.startsWith("floodgate-v7-prefix100-kill-drill-"));
  expect(entries).toHaveLength(1);
  return path.join(temporaryParent, entries[0]);
}

afterEach(async () => {
  await Promise.all(
    temporaryParents
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

function assertFrozenGraph(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) assertFrozenGraph(child);
}

describe("Floodgate v7 disposable prefix-100 kill drill contract", () => {
  it("publishes fixed points, signals, protocol, arities, and no production-owner child calls", async () => {
    expect(FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_POINTS).toEqual([
      "outer-active-durable",
      "stage-lease-durable",
      "checkpoint-first-byte-written",
    ]);
    expect(FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_SIGNALS).toEqual([
      "SIGTERM",
      "SIGKILL",
    ]);
    expect(FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_CHILD_PROTOCOL).toBe(
      "shogi-floodgate-v7-prefix100-kill-drill-child-v1",
    );
    expect(runFloodgateV7ProductionPrefix100DisposableKillDrill).toHaveLength(
      0,
    );
    expect(runFloodgateV7ProductionPrefix100KillDrillCoreForTests).toHaveLength(
      1,
    );

    const childSource = await fs.promises.readFile(CHILD_PATH, "utf8");
    expect(childSource).not.toMatch(
      /runFloodgateV7ProductionOuterGatePrefix100\s*\(/,
    );
    expect(childSource).not.toMatch(/authorizeFloodgateTeacherStage\s*\(/);
    expect(childSource).not.toMatch(
      /checkpointFloodgateV7TeacherParentsV3\s*\(/,
    );
    expect(childSource).not.toMatch(
      /runFloodgateV7ProductionCheckpointConnector\s*\(/,
    );
    expect(childSource).toContain(
      "runWithFloodgateV7ProductionOuterGateLeaseCoreForTests",
    );
    expect(childSource).toContain("authorizeFloodgateTeacherStageCoreForTests");
    expect(childSource).toContain(
      "checkpointFloodgateV7TeacherParentsV3CoreForTests",
    );
    const parentSource = await fs.promises.readFile(
      path.resolve("ml/floodgate-v7-production-prefix-100-kill-drill.ts"),
      "utf8",
    );
    expect(parentSource).not.toMatch(/os\.tmpdir|process\.env\.TMPDIR/);
  });

  it("fails dependency capture without disclosing injected values", async () => {
    const privateCanary = "/private/kill-drill-dependency-canary";
    const failure =
      await runFloodgateV7ProductionPrefix100KillDrillCoreForTests({
        effectiveUserId: -1,
        temporaryParent: privateCanary,
        nodeExecutable: privateCanary,
        childModulePath: privateCanary,
        lockfPath: privateCanary,
      }).catch((error: unknown) => error);
    const projection = [
      String(failure),
      failure instanceof Error ? failure.stack : "",
      JSON.stringify(failure),
    ].join("\n");
    expect(projection).not.toContain(privateCanary);
    expect(failure).toBeInstanceOf(
      FloodgateV7ProductionPrefix100KillDrillManualReconciliationError,
    );
    expect(projection).toContain("requires manual reconciliation");
  });
});

darwinDescribe(
  "Floodgate v7 disposable prefix-100 process-death matrix",
  () => {
    it("creates and exactly removes a fixed private anchor", async () => {
      if (typeof process.geteuid !== "function") {
        throw new Error("kill drill tests require POSIX effective uid");
      }
      const fixedParent = await privateTemporaryParent();
      const receipt =
        runFloodgateV7ProductionPrefix100FixedAnchorSetupCoreForTests({
          effectiveUserId: process.geteuid(),
          fixedParent,
        });
      expect(receipt).toEqual({
        contract:
          "shogi-floodgate-v7-production-prefix-100-fixed-anchor-setup-test-v1",
        status: "private-anchor-created-and-exactly-removed",
        verification: {
          fixed_parent_canonical_private_current_euid: true,
          anchor_initial_identity_captured_before_later_setup: true,
          exact_anchor_removed: true,
        },
        nonclaims: {
          production_gate: false,
          private_path_disclosed: false,
        },
      });
      assertFrozenGraph(receipt);
      expect(await fs.promises.readdir(fixedParent)).toEqual([]);
    });

    it("sanitizes a nonexistent fixed-parent capture failure", async () => {
      if (typeof process.geteuid !== "function") {
        throw new Error("kill drill tests require POSIX effective uid");
      }
      const owner = await privateTemporaryParent();
      const privateCanary = path.join(
        owner,
        "nonexistent-private-fixed-parent-canary",
      );
      const failure = (() => {
        try {
          runFloodgateV7ProductionPrefix100FixedAnchorSetupCoreForTests({
            effectiveUserId: process.geteuid(),
            fixedParent: privateCanary,
          });
          throw new Error("expected fixed-parent capture failure");
        } catch (error) {
          return error;
        }
      })();
      expect(failure).toMatchObject({
        phase: "capture",
        fixture_preserved: false,
        private_path_disclosed: false,
        raw_failure_disclosed: false,
      });
      const projection = [
        String(failure),
        failure instanceof Error ? failure.stack : "",
        JSON.stringify(failure),
      ].join("\n");
      expect(projection).not.toContain(privateCanary);
      expect(projection).not.toContain(
        "nonexistent-private-fixed-parent-canary",
      );
      expect(await fs.promises.readdir(owner)).toEqual([]);
    });

    it("reports no preserved fixture when fixed-anchor setup fails before creation", async () => {
      if (typeof process.geteuid !== "function") {
        throw new Error("kill drill tests require POSIX effective uid");
      }
      const fixedParent = await privateTemporaryParent();
      const failure = (() => {
        try {
          runFloodgateV7ProductionPrefix100FixedAnchorSetupCoreForTests({
            effectiveUserId: process.geteuid(),
            fixedParent,
            parentRealpathForTests: () => {
              throw new Error("private fixed-parent realpath canary");
            },
          });
          throw new Error("expected fixed-anchor setup failure");
        } catch (error) {
          return error;
        }
      })();
      expect(failure).toMatchObject({
        phase: "fixture",
        fixture_preserved: false,
        private_path_disclosed: false,
        raw_failure_disclosed: false,
      });
      expect(await fs.promises.readdir(fixedParent)).toEqual([]);
      expect(
        [String(failure), JSON.stringify(failure)].join("\n"),
      ).not.toContain("private fixed-parent realpath canary");
    });

    it("exactly rolls back a fixed anchor after its initial identity is captured", async () => {
      if (typeof process.geteuid !== "function") {
        throw new Error("kill drill tests require POSIX effective uid");
      }
      const fixedParent = await privateTemporaryParent();
      const failure = (() => {
        try {
          runFloodgateV7ProductionPrefix100FixedAnchorSetupCoreForTests({
            effectiveUserId: process.geteuid(),
            fixedParent,
            afterInitialIdentityForTests: () => {
              throw new Error("private fixed-anchor post-identity canary");
            },
          });
          throw new Error("expected fixed-anchor setup failure");
        } catch (error) {
          return error;
        }
      })();
      expect(failure).toMatchObject({
        phase: "fixture",
        fixture_preserved: false,
        private_path_disclosed: false,
        raw_failure_disclosed: false,
      });
      expect(await fs.promises.readdir(fixedParent)).toEqual([]);
      expect(
        [String(failure), JSON.stringify(failure)].join("\n"),
      ).not.toContain("private fixed-anchor post-identity canary");
    });

    it("truthfully reports preservation when fixed-anchor identity capture fails", async () => {
      if (typeof process.geteuid !== "function") {
        throw new Error("kill drill tests require POSIX effective uid");
      }
      const fixedParent = await privateTemporaryParent();
      const failure = (() => {
        try {
          runFloodgateV7ProductionPrefix100FixedAnchorSetupCoreForTests({
            effectiveUserId: process.geteuid(),
            fixedParent,
            initialLstatForTests: () => {
              throw new Error("private fixed-anchor identity canary");
            },
          });
          throw new Error("expected fixed-anchor identity failure");
        } catch (error) {
          return error;
        }
      })();
      expect(failure).toMatchObject({
        phase: "fixture",
        fixture_preserved: true,
        private_path_disclosed: false,
        raw_failure_disclosed: false,
      });
      expect(await fs.promises.readdir(fixedParent)).toHaveLength(1);
      expect(
        [String(failure), JSON.stringify(failure)].join("\n"),
      ).not.toContain("private fixed-anchor identity canary");
    });

    it("rejects production-home overlap, noncanonical aliases, wrong owner, and non-private parents", async () => {
      if (typeof process.geteuid !== "function") {
        throw new Error("kill drill tests require POSIX effective uid");
      }
      const productionHome = fs.realpathSync(os.userInfo().homedir);
      const candidates = [
        productionHome,
        fs.realpathSync(path.dirname(productionHome)),
        fs.realpathSync(process.cwd()),
      ];
      for (const temporaryParent of candidates) {
        const failure =
          await runFloodgateV7ProductionPrefix100KillDrillCoreForTests(
            testDependencies(temporaryParent),
          ).catch((error: unknown) => error);
        expect(failure).toMatchObject({
          phase: "capture",
          fixture_preserved: false,
          private_path_disclosed: false,
        });
      }

      const privateParent = await privateTemporaryParent();
      const target = path.join(privateParent, "target");
      const alias = path.join(privateParent, "alias");
      await fs.promises.mkdir(target, { mode: 0o700 });
      await fs.promises.chmod(target, 0o700);
      await fs.promises.symlink(target, alias);
      const aliasFailure =
        await runFloodgateV7ProductionPrefix100KillDrillCoreForTests(
          testDependencies(alias),
        ).catch((error: unknown) => error);
      expect(aliasFailure).toMatchObject({
        phase: "capture",
        fixture_preserved: false,
      });

      const wrongMode = await privateTemporaryParent();
      await fs.promises.chmod(wrongMode, 0o755);
      const modeFailure =
        await runFloodgateV7ProductionPrefix100KillDrillCoreForTests(
          testDependencies(wrongMode),
        ).catch((error: unknown) => error);
      expect(modeFailure).toMatchObject({
        phase: "capture",
        fixture_preserved: false,
      });
      await fs.promises.chmod(wrongMode, 0o700);

      const wrongOwner = await privateTemporaryParent();
      const ownerFailure =
        await runFloodgateV7ProductionPrefix100KillDrillCoreForTests({
          ...testDependencies(wrongOwner),
          effectiveUserId: process.geteuid() + 1,
        }).catch((error: unknown) => error);
      expect(ownerFailure).toMatchObject({
        phase: "capture",
        fixture_preserved: false,
      });
    });

    it("rolls back an identity-held partial fixture without publishing a path", async () => {
      const temporaryParent = await privateTemporaryParent();
      const failure =
        await runFloodgateV7ProductionPrefix100KillDrillCoreForTests(
          testDependencies(temporaryParent, {
            fixtureFailpointForTests: () => {
              throw new Error("private fixture failpoint canary");
            },
          }),
        ).catch((error: unknown) => error);
      expect(failure).toMatchObject({
        phase: "fixture",
        fixture_preserved: false,
        manual_reconciliation_required: true,
        private_path_disclosed: false,
        raw_failure_disclosed: false,
      });
      expect(await fs.promises.readdir(temporaryParent)).toEqual([]);
      expect(JSON.stringify(failure)).not.toContain(temporaryParent);
      expect(String(failure)).not.toContain("private fixture failpoint canary");
    });

    it("captures the mkdtemp pathname before realpath failure and leaves no orphan", async () => {
      const temporaryParent = await privateTemporaryParent();
      const failure =
        await runFloodgateV7ProductionPrefix100KillDrillCoreForTests(
          testDependencies(temporaryParent, {
            fixtureRootRealpathForTests: async () => {
              throw new Error("private realpath failure canary");
            },
          }),
        ).catch((error: unknown) => error);
      expect(failure).toMatchObject({
        phase: "fixture",
        fixture_preserved: false,
        manual_reconciliation_required: true,
        private_path_disclosed: false,
        raw_failure_disclosed: false,
      });
      expect(await fs.promises.readdir(temporaryParent)).toEqual([]);
      const projection = [String(failure), JSON.stringify(failure)].join("\n");
      expect(projection).not.toContain(temporaryParent);
      expect(projection).not.toContain("private realpath failure canary");
    });

    it("truthfully preserves an orphan classification when pre-realpath identity authority is lost", async () => {
      const temporaryParent = await privateTemporaryParent();
      const failure =
        await runFloodgateV7ProductionPrefix100KillDrillCoreForTests(
          testDependencies(temporaryParent, {
            fixtureRootRealpathForTests: async (createdPath) => {
              await fs.promises.rename(createdPath, `${createdPath}-displaced`);
              await fs.promises.mkdir(createdPath, { mode: 0o700 });
              await fs.promises.chmod(createdPath, 0o700);
              throw new Error("private realpath replacement canary");
            },
          }),
        ).catch((error: unknown) => error);
      expect(failure).toMatchObject({
        phase: "fixture",
        fixture_preserved: true,
        manual_reconciliation_required: true,
        private_path_disclosed: false,
        raw_failure_disclosed: false,
      });
      expect((await fs.promises.readdir(temporaryParent)).length).toBe(2);
      const projection = [String(failure), JSON.stringify(failure)].join("\n");
      expect(projection).not.toContain(temporaryParent);
      expect(projection).not.toContain("private realpath replacement canary");
    });

    it("rejects an IPC stage-path escape before acquiring the outer lock and preserves the disposable fixture", async () => {
      const temporaryParent = await privateTemporaryParent();
      const failure =
        await runFloodgateV7ProductionPrefix100KillDrillCoreForTests(
          testDependencies(temporaryParent, {
            mutateChildConfigForTests: (config, event) => {
              if (event.mode !== "arm") return config;
              return {
                ...config,
                stage: {
                  ...(config.stage as Record<string, unknown>),
                  publicationParent: fs.realpathSync(os.userInfo().homedir),
                },
              };
            },
          }),
        ).catch((error: unknown) => error);
      expect(failure).toMatchObject({
        phase: "arm",
        fixture_preserved: true,
        manual_reconciliation_required: true,
        production_gate_invoked: false,
        private_path_disclosed: false,
        raw_failure_disclosed: false,
      });
      const fixture = onePreservedFixture(temporaryParent);
      const registryRoot = path.join(
        fixture,
        "home",
        ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
      );
      expect(
        fs.existsSync(
          path.join(
            registryRoot,
            FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
            FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
          ),
        ),
      ).toBe(false);
      expect(JSON.stringify(failure)).not.toContain(temporaryParent);
    });

    it.each(
      FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_POINTS.map((point) => ({
        point,
      })),
    )(
      "preserves $point evidence on parent-side failure and never auto-cleans it on a later run",
      async ({ point }) => {
        const temporaryParent = await privateTemporaryParent();
        const failure =
          await runFloodgateV7ProductionPrefix100KillDrillCoreForTests(
            testDependencies(temporaryParent, {
              afterEvidenceArmedForTests: (event) => {
                if (event.point === point && event.signal === "SIGTERM") {
                  throw new Error("private armed failpoint canary");
                }
              },
            }),
          ).catch((error: unknown) => error);
        expect(failure).toMatchObject({
          phase: "armed-evidence",
          point,
          signal: "SIGTERM",
          fixture_preserved: true,
          manual_reconciliation_required: true,
          production_gate_invoked: false,
          private_path_disclosed: false,
          raw_failure_disclosed: false,
        });
        const fixture = onePreservedFixture(temporaryParent);
        const active = path.join(
          fixture,
          "home",
          ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
          FLOODGATE_V7_PRODUCTION_OUTER_GATE_CONTROL_BASENAME,
          FLOODGATE_V7_PRODUCTION_OUTER_GATE_ACTIVE_BASENAME,
        );
        const activeBefore = await fs.promises.lstat(active, { bigint: true });
        expect(activeBefore.size).toBeGreaterThan(BigInt(0));
        const stage = path.join(fixture, "publication", "teacher-stage");
        const lease = path.join(
          fixture,
          "publication",
          ".teacher-stage.authorization-lease",
        );
        const work = path.join(stage, "work.jsonl");
        if (point === "outer-active-durable") {
          expect(fs.existsSync(stage)).toBe(false);
          expect(fs.existsSync(lease)).toBe(false);
          expect(fs.existsSync(work)).toBe(false);
        } else {
          expect((await fs.promises.lstat(stage)).isDirectory()).toBe(true);
          expect((await fs.promises.lstat(lease)).isDirectory()).toBe(true);
          if (point === "checkpoint-first-byte-written") {
            expect((await fs.promises.lstat(work)).size).toBe(1);
          } else {
            expect(fs.existsSync(work)).toBe(false);
          }
        }
        const projection = [
          String(failure),
          failure instanceof Error ? failure.stack : "",
          JSON.stringify(failure),
        ].join("\n");
        expect(projection).not.toContain(temporaryParent);
        expect(projection).not.toContain("private armed failpoint canary");

        if (point === "outer-active-durable") {
          await runFloodgateV7ProductionPrefix100KillDrillCoreForTests(
            testDependencies(temporaryParent),
          );
          const activeAfter = await fs.promises.lstat(active, { bigint: true });
          expect({
            dev: activeAfter.dev,
            ino: activeAfter.ino,
            size: activeAfter.size,
          }).toEqual({
            dev: activeBefore.dev,
            ino: activeBefore.ino,
            size: activeBefore.size,
          });
          expect(onePreservedFixture(temporaryParent)).toBe(fixture);
        }
      },
      600_000,
    );

    it("preserves fail-closed evidence for three points under SIGTERM and SIGKILL", async () => {
      expect(process.version).toBe("v22.13.0");
      expect(fs.existsSync("/usr/bin/lockf")).toBe(true);

      const concurrentDecoy = await fs.promises.realpath(
        await fs.promises.mkdtemp(
          path.join(
            "/private/tmp",
            "floodgate-v7-prefix100-fixed-concurrent-decoy-",
          ),
        ),
      );
      await fs.promises.chmod(concurrentDecoy, 0o700);
      temporaryParents.push(concurrentDecoy);
      const decoyMarker = path.join(concurrentDecoy, "owned-decoy-marker");
      await fs.promises.writeFile(decoyMarker, "owned-decoy\n", {
        flag: "wx",
        mode: 0o600,
      });
      const decoyBefore = await fs.promises.lstat(concurrentDecoy, {
        bigint: true,
      });
      const originalTmpdir = process.env.TMPDIR;
      process.env.TMPDIR = fs.realpathSync(os.userInfo().homedir);
      let receipt: Awaited<
        ReturnType<typeof runFloodgateV7ProductionPrefix100DisposableKillDrill>
      >;
      let concurrentReceipt: Awaited<
        ReturnType<typeof runFloodgateV7ProductionPrefix100DisposableKillDrill>
      >;
      try {
        [receipt, concurrentReceipt] = await Promise.all([
          runFloodgateV7ProductionPrefix100DisposableKillDrill(),
          runFloodgateV7ProductionPrefix100DisposableKillDrill(),
        ]);
      } finally {
        if (originalTmpdir === undefined) delete process.env.TMPDIR;
        else process.env.TMPDIR = originalTmpdir;
      }
      const decoyAfter = await fs.promises.lstat(concurrentDecoy, {
        bigint: true,
      });
      expect({ dev: decoyAfter.dev, ino: decoyAfter.ino }).toEqual({
        dev: decoyBefore.dev,
        ino: decoyBefore.ino,
      });
      expect(await fs.promises.readFile(decoyMarker, "utf8")).toBe(
        "owned-decoy\n",
      );
      expect(concurrentReceipt.status).toBe(
        FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_STATUS,
      );
      expect(receipt).toMatchObject({
        contract: FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_CONTRACT,
        status: FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_STATUS,
        execution_boundary:
          FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_EXECUTION_BOUNDARY,
        verification: {
          six_cases_passed: true,
          disposable_fixture_confined: true,
          test_only_seams: true,
          no_production_gate_invoked: true,
          no_delete_truncate_or_repair_before_evidence: true,
          parent_fixture_key_buffer_zeroized_after_use: true,
        },
        nonclaims: {
          production_prefix_100: false,
          production_recovery: false,
          power_loss_or_reboot: false,
          teacher_label: false,
          training: false,
          weight: false,
          live_evaluation_activation: false,
          match: false,
          playing_strength: false,
        },
      });
      expect(receipt.cases).toHaveLength(6);
      expect(
        receipt.cases.map(({ point, signal }) => `${point}:${signal}`),
      ).toEqual(
        FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_POINTS.flatMap((point) =>
          FLOODGATE_V7_PRODUCTION_PREFIX_100_KILL_DRILL_SIGNALS.map(
            (signal) => `${point}:${signal}`,
          ),
        ),
      );
      for (const value of receipt.cases) {
        expect(value).toMatchObject({
          exit_signal: value.signal,
          lock_contended_before_death: true,
          lock_released_after_death: true,
          authenticated_outer_stale_blocked_all_gates: true,
          inner_lease_eexist_blocked: value.point !== "outer-active-durable",
          filesystem_snapshot_preserved: true,
        });
      }
      assertFrozenGraph(receipt);
      const projection = JSON.stringify(receipt);
      expect(projection).not.toMatch(/\/Users\/|\/home\/|root-key\.bin/);
      expect(projection).not.toMatch(
        /run_id|hostname|nonce|\bmac\b|\bpid\b|\buid\b|\bdev\b|\bino\b|sha256/,
      );
    }, 600_000);
  },
);
