import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_PREFIX_100_KILL_DRILL_CLI_FAILURE_CONTRACT,
  FLOODGATE_V7_PREFIX_100_KILL_DRILL_CLI_SUCCESS_CONTRACT,
  writeFloodgateV7ProductionPrefix100KillDrillOutputCoreForTests,
} from "../../../ml/run-floodgate-v7-production-prefix-100-kill-drill";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const ENTRY_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/run-floodgate-v7-production-prefix-100-kill-drill.ts",
);
const PRIVATE_CANARY = "private-kill-canary-must-not-be-public";

function cleanChildEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.TSX_TSCONFIG_PATH;
  return environment;
}

function runEntry(
  mode:
    | "success"
    | "bad"
    | "throw"
    | "load-must-not-happen"
    | "array-index-accessor"
    | "array-extra-property"
    | "array-symbol-property"
    | "array-nonplain-prototype"
    | "array-hole",
  arguments_: readonly string[] = [],
  wrongRuntime = false,
): SpawnSyncReturns<string> {
  const launcher = String.raw`
const Module = require("node:module");
const originalLoad = Module._load;
const canary = ${JSON.stringify(PRIVATE_CANARY)};
const points = ["outer-active-durable", "stage-lease-durable", "checkpoint-first-byte-written"];
const signals = ["SIGTERM", "SIGKILL"];
Module._load = function(request, parent, isMain) {
  if (request.endsWith("floodgate-v7-production-prefix-100-kill-drill")) {
    if (${JSON.stringify(mode)} === "load-must-not-happen") throw new Error(canary);
    return {
      runFloodgateV7ProductionPrefix100DisposableKillDrill: async () => {
        if (${JSON.stringify(mode)} === "throw") throw new Error(canary);
        const receipt = {
          contract: "shogi-floodgate-v7-production-prefix-100-disposable-kill-drill-v1",
          status: "six-disposable-process-death-cases-preserved-fail-closed-evidence-without-production-gate-execution",
          execution_boundary: "fixed-current-euid-private-temporary-roots-test-only-seams-darwin-process-signals",
          cases: points.flatMap((point) => signals.map((signal) => ({
            point,
            signal,
            exit_signal: signal,
            lock_contended_before_death: true,
            lock_released_after_death: true,
            authenticated_outer_stale_blocked_all_gates: true,
            inner_lease_eexist_blocked: point !== "outer-active-durable",
            filesystem_snapshot_preserved: true,
          }))),
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
        };
        if (${JSON.stringify(mode)} === "array-index-accessor") {
          const firstCase = receipt.cases[0];
          Object.defineProperty(receipt.cases, "0", {
            configurable: true,
            enumerable: true,
            get() { return firstCase; },
          });
        }
        if (${JSON.stringify(mode)} === "array-extra-property") {
          Object.defineProperty(receipt.cases, "privateExtra", {
            configurable: true,
            enumerable: false,
            value: canary,
          });
        }
        if (${JSON.stringify(mode)} === "array-symbol-property") {
          receipt.cases[Symbol(canary)] = canary;
        }
        if (${JSON.stringify(mode)} === "array-nonplain-prototype") {
          Object.setPrototypeOf(receipt.cases, null);
        }
        if (${JSON.stringify(mode)} === "array-hole") {
          delete receipt.cases[0];
        }
        if (${JSON.stringify(mode)} === "bad") receipt.nonclaims.weight = true;
        return receipt;
      },
    };
  }
  return Reflect.apply(originalLoad, this, [request, parent, isMain]);
};
process.argv = [process.execPath, ${JSON.stringify(ENTRY_PATH)}, ...${JSON.stringify(arguments_)}];
if (${JSON.stringify(wrongRuntime)}) {
  Object.defineProperty(process, "version", { configurable: true, value: "v20.14.0" });
}
Module.runMain();
`;
  return spawnSync(process.execPath, ["-r", "tsx/cjs", "-e", launcher], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: cleanChildEnvironment(),
  });
}

class FailingStream extends EventEmitter {
  write(_value: string, callback: (error?: Error | null) => void): boolean {
    const error = new Error(PRIVATE_CANARY);
    callback(error);
    process.nextTick(() => this.emit("error", error));
    return false;
  }
}

describe("Floodgate v7 production prefix-100 kill-drill CLI", () => {
  it("is import-only inert and has no static implementation import", () => {
    const source = fs.readFileSync(ENTRY_PATH, "utf8");
    expect(source).not.toMatch(
      /^import .*floodgate-v7-production-prefix-100-kill-drill/mu,
    );
    const child = spawnSync(
      process.execPath,
      ["-r", "tsx/cjs", "-e", `require(${JSON.stringify(ENTRY_PATH)})`],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: cleanChildEnvironment(),
      },
    );
    expect(child.status).toBe(0);
    expect(child.stdout).toBe("");
    expect(child.stderr).toBe("");
  });

  it.each([
    { arguments_: ["unexpected"], wrongRuntime: false },
    { arguments_: [], wrongRuntime: true },
  ])("rejects before lazy loading for $arguments_ $wrongRuntime", (value) => {
    const child = runEntry(
      "load-must-not-happen",
      value.arguments_,
      value.wrongRuntime,
    );
    expect(child.status).toBe(1);
    expect(child.stdout).toBe("");
    expect(child.stderr).not.toContain(PRIVATE_CANARY);
    const failure = JSON.parse(child.stderr);
    expect(failure).toEqual({
      contract: FLOODGATE_V7_PREFIX_100_KILL_DRILL_CLI_FAILURE_CONTRACT,
      status: "disposable-kill-drill-did-not-issue-success",
      gate: "durable-prefix-100",
      production_gate_invoked: false,
      retry_performed: false,
      raw_failure_disclosed: false,
      private_values_disclosed: false,
      success_receipt_issued: false,
    });
  });

  it("rebuilds the exact six-case success receipt", () => {
    const child = runEntry("success");
    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    expect(child.stdout).not.toContain(PRIVATE_CANARY);
    const receipt = JSON.parse(child.stdout);
    expect(receipt.contract).toBe(
      FLOODGATE_V7_PREFIX_100_KILL_DRILL_CLI_SUCCESS_CONTRACT,
    );
    expect(receipt.status).toBe(
      "six-disposable-process-death-cases-preserved-fail-closed-evidence-without-production-gate-execution",
    );
    expect(receipt.cases).toHaveLength(6);
    expect(receipt.verification).toMatchObject({
      six_cases_passed: true,
      no_production_gate_invoked: true,
      no_delete_truncate_or_repair_before_evidence: true,
    });
    expect(Object.values(receipt.nonclaims)).toEqual(
      expect.arrayContaining([false]),
    );
    expect(new Set(Object.values(receipt.nonclaims))).toEqual(new Set([false]));
  });

  it.each(["bad", "throw"] as const)(
    "sanitizes %s implementation failure without retry",
    (mode) => {
      const child = runEntry(mode);
      expect(child.status).toBe(1);
      expect(child.stdout).toBe("");
      expect(child.stderr).not.toContain(PRIVATE_CANARY);
      expect(JSON.parse(child.stderr)).toMatchObject({
        contract: FLOODGATE_V7_PREFIX_100_KILL_DRILL_CLI_FAILURE_CONTRACT,
        production_gate_invoked: false,
        retry_performed: false,
        success_receipt_issued: false,
      });
    },
  );

  it.each([
    "array-index-accessor",
    "array-extra-property",
    "array-symbol-property",
    "array-nonplain-prototype",
    "array-hole",
  ] as const)("rejects adversarial cases array shape %s", (mode) => {
    const child = runEntry(mode);
    expect(child.status).toBe(1);
    expect(child.stdout).toBe("");
    expect(child.stderr).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(child.stderr)).toEqual({
      contract: FLOODGATE_V7_PREFIX_100_KILL_DRILL_CLI_FAILURE_CONTRACT,
      status: "disposable-kill-drill-did-not-issue-success",
      gate: "durable-prefix-100",
      production_gate_invoked: false,
      retry_performed: false,
      raw_failure_disclosed: false,
      private_values_disclosed: false,
      success_receipt_issued: false,
    });
  });

  it("settles a paired stream callback/error failure once", async () => {
    const stream = new FailingStream() as unknown as NodeJS.WriteStream;
    await expect(
      writeFloodgateV7ProductionPrefix100KillDrillOutputCoreForTests(
        stream,
        "safe\n",
      ),
    ).rejects.toThrow(PRIVATE_CANARY);
    expect(stream.listenerCount("error")).toBe(0);
  });
});
