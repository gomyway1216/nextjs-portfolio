import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_FAILURE_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_FAILURE_STATUS,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_SUCCESS_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_SUCCESS_STATUS,
  writeFloodgateV7ProductionConnectorOutputCoreForTests,
} from "../../../ml/floodgate-v7-production-connector-cli";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const CLI_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-v7-production-connector-cli.ts",
);
const ENTRY_CASES = [
  {
    path: path.join(
      REPOSITORY_ROOT,
      "ml/run-floodgate-v7-production-connector-prefix-100.ts",
    ),
    gate: "durable-prefix-100",
    target: 100,
    sealed: false,
  },
  {
    path: path.join(
      REPOSITORY_ROOT,
      "ml/run-floodgate-v7-production-connector-prefix-500.ts",
    ),
    gate: "durable-prefix-500",
    target: 500,
    sealed: false,
  },
  {
    path: path.join(
      REPOSITORY_ROOT,
      "ml/run-floodgate-v7-production-connector-final-24000.ts",
    ),
    gate: "sealed-final-24000",
    target: 24_000,
    sealed: true,
  },
] as const;
const PRIVATE_CANARY = "private-raw-connector-canary-must-not-be-public";

type OutputMode = "callback-and-paired-error" | "synchronous-throw" | "success";

class TestOutputStream extends EventEmitter {
  readonly mode: OutputMode;
  writes = 0;

  constructor(mode: OutputMode) {
    super();
    this.mode = mode;
  }

  write(_value: string, callback: (error?: Error | null) => void): boolean {
    this.writes += 1;
    if (this.mode === "success") {
      callback(null);
      return true;
    }
    const failure = new Error(`synthetic-output-${this.mode}`);
    if (this.mode === "synchronous-throw") throw failure;
    callback(failure);
    process.nextTick(() => this.emit("error", failure));
    return false;
  }
}

function asWriteStream(stream: TestOutputStream): NodeJS.WriteStream {
  return stream as unknown as NodeJS.WriteStream;
}

function cleanChildEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.TSX_TSCONFIG_PATH;
  return environment;
}

function runEntry(
  entryPath: string,
  mode:
    | "load-must-not-happen"
    | "success"
    | "bad-success"
    | "typed-failure"
    | "inconsistent-typed"
    | "proxy-typed"
    | "accessor-typed"
    | "unknown",
  arguments_: readonly string[] = [],
  wrongRuntime = false,
): SpawnSyncReturns<string> {
  const launcher = String.raw`
const Module = require("node:module");
const originalLoad = Module._load;
const privateCanary = ${JSON.stringify(PRIVATE_CANARY)};
Module._load = function (request, parent, isMain) {
  if (request.endsWith("floodgate-v7-production-connector-runner")) {
    if (${JSON.stringify(mode)} === "load-must-not-happen") throw new Error(privateCanary);
    class RunnerError extends Error {
      constructor(gate) {
        super("sanitized runner failure");
        this.phase = "connector";
        this.gate = gate;
        this.connector_invoked = true;
        this.checkpoint_may_have_persisted = false;
        this.retry_disposition = "operator-reconciliation-required";
        this.connector_phase = "readiness";
        this.connector_retry_disposition = "provision-required";
        this.raw_connector_receipt_disclosed = false;
      }
    }
    const gateReceipt = (gate, target, sealed) => ({
      contract: "shogi-floodgate-v7-production-connector-runner-v1",
      status: "registry-approved-current-bound-production-connector-gate-complete",
      claim_boundary: "one-fixed-production-gate-after-private-registry-approved-record-and-current-key-binding-without-public-run-binding-options-or-raw-connector-receipt-v1",
      execution_boundary: "production-fixed-gate-private-registry-and-capability-owners",
      gate,
      checkpoint: {
        target_parents: target,
        sealed,
        checkpoint_may_have_persisted: true,
      },
      verification: {
        private_registry_claimed: true,
        approved_record_binding_matched: true,
        fresh_current_key_binding_validated: true,
        connector_completed: true,
      },
      nonclaims: {
        run_id_disclosed: false,
        approved_key_binding_disclosed: false,
        connector_options_disclosed: false,
        raw_connector_receipt_disclosed: false,
        key_material_disclosed: false,
        row_or_position_content_disclosed: false,
        teacher_label: false,
        optimizer_training: false,
        weight: false,
        live_evaluation_activation: false,
        match: false,
        playing_strength: false,
      },
    });
    const operation = (gate, target, sealed) => async () => {
      if (${JSON.stringify(mode)} === "unknown") throw new Error(privateCanary);
      if (${JSON.stringify(mode)} === "typed-failure") throw new RunnerError(gate);
      if (${JSON.stringify(mode)} === "inconsistent-typed") {
        const error = new RunnerError(gate);
        error.retry_disposition = "fresh-invocation-required";
        throw error;
      }
      if (${JSON.stringify(mode)} === "proxy-typed") {
        throw new Proxy(new RunnerError(gate), {});
      }
      if (${JSON.stringify(mode)} === "accessor-typed") {
        const error = new RunnerError(gate);
        Object.defineProperty(error, "retry_disposition", {
          enumerable: true,
          get() { throw new Error(privateCanary); },
        });
        throw error;
      }
      const receipt = gateReceipt(gate, target, sealed);
      if (${JSON.stringify(mode)} === "bad-success") {
        receipt.nonclaims.teacher_label = true;
      }
      return receipt;
    };
    return {
      FloodgateV7ProductionConnectorRunnerError: RunnerError,
      runFloodgateV7ProductionConnectorPrefix100: operation("durable-prefix-100", 100, false),
      runFloodgateV7ProductionConnectorPrefix500: operation("durable-prefix-500", 500, false),
      runFloodgateV7ProductionConnectorFinal24000: operation("sealed-final-24000", 24000, true),
    };
  }
  return Reflect.apply(originalLoad, this, [request, parent, isMain]);
};
process.argv = [process.execPath, ${JSON.stringify(entryPath)}, ...${JSON.stringify(arguments_)}];
if (${JSON.stringify(wrongRuntime)}) {
  Object.defineProperty(process, "version", { configurable: true, value: "v20.14.0" });
}
Module.runMain();
`;
  return spawnSync(process.execPath, ["-r", "tsx/cjs", "-e", launcher], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: cleanChildEnvironment(),
    timeout: 30_000,
  });
}

describe("Floodgate v7 production connector CLI", () => {
  it.each(["callback-and-paired-error", "synchronous-throw"] as const)(
    "removes temporary output listeners after %s",
    async (mode) => {
      const stream = new TestOutputStream(mode);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await expect(
          writeFloodgateV7ProductionConnectorOutputCoreForTests(
            asWriteStream(stream),
            "sanitized\n",
          ),
        ).rejects.toThrow(`synthetic-output-${mode}`);
        expect(stream.listenerCount("error")).toBe(0);
      }
      expect(stream.writes).toBe(10);
    },
  );

  it("removes the temporary output listener after success", async () => {
    const stream = new TestOutputStream("success");
    await expect(
      writeFloodgateV7ProductionConnectorOutputCoreForTests(
        asWriteStream(stream),
        "sanitized\n",
      ),
    ).resolves.toBeUndefined();
    expect(stream.listenerCount("error")).toBe(0);
    expect(stream.writes).toBe(1);
  });

  it.each(ENTRY_CASES)(
    "rejects argv before lazy-loading the runner for $gate",
    ({ path: entryPath, gate }) => {
      const result = runEntry(entryPath, "load-must-not-happen", [
        PRIVATE_CANARY,
      ]);
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).not.toContain(PRIVATE_CANARY);
      expect(JSON.parse(result.stderr)).toMatchObject({
        contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_FAILURE_CONTRACT,
        status: FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_FAILURE_STATUS,
        gate,
        phase: "capture",
        connector_invoked: false,
        checkpoint_may_have_persisted: false,
        raw_connector_receipt_disclosed: false,
        success_receipt_issued: false,
      });
    },
  );

  it.each(ENTRY_CASES)(
    "rejects the wrong Node runtime before lazy-loading the runner for $gate",
    ({ path: entryPath, gate }) => {
      const result = runEntry(entryPath, "load-must-not-happen", [], true);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).not.toContain(PRIVATE_CANARY);
      expect(JSON.parse(result.stderr)).toMatchObject({
        gate,
        phase: "capture",
        connector_invoked: false,
        checkpoint_may_have_persisted: false,
      });
    },
  );

  it.each(ENTRY_CASES)(
    "publishes only the allowlisted $gate success projection",
    ({ path: entryPath, gate, target, sealed }) => {
      const result = runEntry(entryPath, "success");
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).not.toContain(PRIVATE_CANARY);
      expect(JSON.parse(result.stdout)).toEqual({
        contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_SUCCESS_CONTRACT,
        status: FLOODGATE_V7_PRODUCTION_CONNECTOR_CLI_SUCCESS_STATUS,
        gate,
        target_parents: target,
        sealed,
        checkpoint_may_have_persisted: true,
        fresh_current_key_binding_validated: true,
        raw_connector_receipt_disclosed: false,
        private_registry_values_disclosed: false,
        connector_options_disclosed: false,
        success_receipt_issued: true,
      });
    },
  );

  it("allowlists typed failure fields without exposing the original error", () => {
    const result = runEntry(ENTRY_CASES[0].path, "typed-failure");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(result.stderr)).toMatchObject({
      phase: "connector",
      connector_invoked: true,
      checkpoint_may_have_persisted: false,
      retry_disposition: "operator-reconciliation-required",
      connector_phase: "readiness",
      connector_retry_disposition: "provision-required",
      raw_connector_receipt_disclosed: false,
      success_receipt_issued: false,
    });
  });

  it("marks every unknown post-invocation failure as potentially persistent", () => {
    const result = runEntry(ENTRY_CASES[2].path, "unknown");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(result.stderr)).toMatchObject({
      gate: "sealed-final-24000",
      phase: "runner",
      connector_invoked: true,
      checkpoint_may_have_persisted: true,
      retry_disposition: "checkpoint-reconciliation-required",
      raw_connector_receipt_disclosed: false,
      success_receipt_issued: false,
    });
  });

  it.each(["inconsistent-typed", "proxy-typed", "accessor-typed"] as const)(
    "maps %s runner metadata to the conservative post-invocation failure",
    (mode) => {
      const result = runEntry(ENTRY_CASES[0].path, mode);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).not.toContain(PRIVATE_CANARY);
      expect(JSON.parse(result.stderr)).toMatchObject({
        gate: "durable-prefix-100",
        phase: "runner",
        connector_invoked: true,
        checkpoint_may_have_persisted: true,
        retry_disposition: "checkpoint-reconciliation-required",
        connector_phase: null,
        connector_retry_disposition: null,
      });
    },
  );

  it("rejects a runner success receipt whose nonclaims are inconsistent", () => {
    const result = runEntry(ENTRY_CASES[0].path, "bad-success");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(result.stderr)).toMatchObject({
      phase: "runner",
      connector_invoked: true,
      checkpoint_may_have_persisted: true,
      retry_disposition: "checkpoint-reconciliation-required",
    });
  });

  it("keeps the argv check before the lazy runner require and contains no raw receipt projection", async () => {
    const source = await fs.promises.readFile(CLI_SOURCE_PATH, "utf8");
    const executeStart = source.indexOf("async function executeCli");
    const executeSource = source.slice(executeStart);
    const argumentCheck = executeSource.indexOf("process.argv.length !== 2");
    const runtimeCheck = executeSource.indexOf(
      "process.version !== REQUIRED_NODE_VERSION",
    );
    const lazyRequire = executeSource.indexOf(
      'require("./floodgate-v7-production-connector-runner")',
    );
    expect(executeStart).toBeGreaterThan(-1);
    expect(argumentCheck).toBeGreaterThan(-1);
    expect(runtimeCheck).toBeGreaterThan(argumentCheck);
    expect(runtimeCheck).toBeLessThan(lazyRequire);
    expect(source).not.toMatch(/process\.(?:stdin|env)\b/u);
    expect(source).not.toContain("stringify(rawRunnerReceipt)");
    expect(source).toContain("sanitizedSuccess(rawRunnerReceipt, gate)");
    expect(source).toContain("raw_connector_receipt_disclosed: false");
  });

  it("publishes one provision command and caffeinated fixed gate commands", async () => {
    const packageJson = JSON.parse(
      await fs.promises.readFile(
        path.join(REPOSITORY_ROOT, "package.json"),
        "utf8",
      ),
    ) as { scripts: Record<string, string> };
    expect(
      packageJson.scripts[
        "shogi:floodgate-v7-production-connector-registry-provision"
      ],
    ).toBe(
      "node -r tsx/cjs ml/provision-floodgate-v7-production-connector-registry.ts",
    );
    for (const [script, entry] of [
      [
        "shogi:floodgate-v7-production-connector-prefix-100",
        "ml/run-floodgate-v7-production-connector-prefix-100.ts",
      ],
      [
        "shogi:floodgate-v7-production-connector-prefix-500",
        "ml/run-floodgate-v7-production-connector-prefix-500.ts",
      ],
      [
        "shogi:floodgate-v7-production-connector-final-24000",
        "ml/run-floodgate-v7-production-connector-final-24000.ts",
      ],
    ] as const) {
      expect(packageJson.scripts[script]).toBe(
        `/usr/bin/caffeinate -dimsu node -r tsx/cjs ${entry}`,
      );
    }
  });
});
