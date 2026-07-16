import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_STATUS,
  writeFloodgateV7ProductionConnectorRegistryProvisionOutputCoreForTests,
} from "../../../ml/provision-floodgate-v7-production-connector-registry";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const CLI_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/provision-floodgate-v7-production-connector-registry.ts",
);
const VALUE_CANARY = "registry-cli-private-canary-must-not-leak";
const NO_CHANGE_FAILURE_MESSAGE = `${JSON.stringify({
  contract:
    FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_CONTRACT,
  status: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_STATUS,
  phase: "capture",
  durability: "no-registry-change-established",
  registry_may_have_been_created: false,
  retry_disposition: "fresh-invocation-required",
  sensitive_values_disclosed: false,
  success_receipt_issued: false,
})}\n`;
const CONSERVATIVE_FAILURE_MESSAGE = `${JSON.stringify({
  contract:
    FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_CONTRACT,
  status: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_STATUS,
  phase: "unknown",
  durability: "registry-may-have-been-created",
  registry_may_have_been_created: true,
  retry_disposition: "registry-reconciliation-required",
  sensitive_values_disclosed: false,
  success_receipt_issued: false,
})}\n`;

type OutputMode = "callback-and-paired-error" | "synchronous-throw" | "success";

class TestOutputStream extends EventEmitter {
  writes = 0;

  constructor(readonly mode: OutputMode) {
    super();
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

function runCli(
  arguments_: readonly string[],
  mode:
    | "success"
    | "source-context-failure"
    | "typed-failure"
    | "readiness-failure"
    | "forged-typed-failure"
    | "inconsistent-nochange-failure"
    | "unknown-failure"
    | "old-v1-receipt"
    | "bad-receipt",
  failStdout = false,
  wrongRuntime = false,
): SpawnSyncReturns<string> {
  const launcher = String.raw`
const Module = require("node:module");
const originalLoad = Module._load;
let provisionerLoads = 0;
let sourceContextChecks = 0;
class ProvisionerError extends Error {
  constructor() {
    super(${JSON.stringify(VALUE_CANARY)});
    this.phase = "installation";
    this.durability = "registry-may-have-been-created";
    this.registry_may_have_been_created = true;
    this.retry_disposition = "registry-reconciliation-required";
    this.private_path = ${JSON.stringify(VALUE_CANARY)};
    this.stack = ${JSON.stringify(VALUE_CANARY)};
  }
}
const successReceipt = () => ({
  contract: "shogi-floodgate-v7-production-connector-registry-provisioner-v3",
  status: "immutable-private-run-registry-created-bound-and-postflight-validated",
  execution_boundary: "production-fixed-current-euid-private-registry-provisioning",
  verification: {
    verifier_source_artifact_closure_checked_before_install: true,
    production_application_source_closure_checked_before_current_key_and_install: true,
    approved_record_current_key_binding_checked: true,
    approved_record_bound_into_registry: true,
    application_source_binding_bound_and_postflight_checked: true,
    run_id_generated_from_32_byte_csprng: true,
    fixed_configuration_only: true,
    create_only_install_succeeded: true,
    registry_loader_postflight_succeeded: true,
    exact_private_claim_postflight_succeeded: true,
    sensitive_values_exported: false,
  },
  nonclaims: {
    run_id_disclosed: false,
    approved_record_digest_disclosed: false,
    application_source_revision_disclosed: false,
    application_source_path_disclosed: false,
    application_source_digest_disclosed: false,
    key_instance_id_disclosed: false,
    owner_uid_disclosed: false,
    path_disclosed: false,
    filesystem_identity_disclosed: false,
    key_material_disclosed: false,
    gate_executed: false,
    checkpoint: false,
    dataset_read: false,
    teacher_label: false,
    training: false,
    weight: false,
    live_evaluation_activation: false,
    match: false,
    playing_strength: false,
  },
});
Module._load = function (request, parent, isMain) {
  if (request.endsWith("floodgate-v7-production-application-source-provenance")) {
    return {
      assertFloodgateV7ProductionApplicationEntrypointContext: (entrypoint) => {
        sourceContextChecks += 1;
        if (entrypoint !== "ml/provision-floodgate-v7-production-connector-registry.ts") throw new Error("ENTRYPOINT_DIFFERS");
        if (${JSON.stringify(mode)} === "source-context-failure") throw new Error(${JSON.stringify(VALUE_CANARY)});
      },
    };
  }
  if (request.endsWith("floodgate-v7-production-connector-registry-provisioner")) {
    if (sourceContextChecks !== 1) throw new Error("SOURCE_CONTEXT_NOT_CHECKED");
    provisionerLoads += 1;
    return {
      FloodgateV7ProductionConnectorRegistryProvisionerError: ProvisionerError,
      provisionFloodgateV7ProductionConnectorRegistry: async () => {
        if (${JSON.stringify(mode)} === "typed-failure") throw new ProvisionerError();
        if (${JSON.stringify(mode)} === "readiness-failure") {
          const failure = new ProvisionerError();
          failure.phase = "verifier-readiness";
          failure.durability = "no-registry-change-established";
          failure.registry_may_have_been_created = false;
          failure.retry_disposition = "fresh-invocation-required";
          throw failure;
        }
        if (${JSON.stringify(mode)} === "forged-typed-failure") {
          const forged = new ProvisionerError();
          forged.phase = ${JSON.stringify(VALUE_CANARY)};
          forged.retry_disposition = ${JSON.stringify(VALUE_CANARY)};
          throw forged;
        }
        if (${JSON.stringify(mode)} === "inconsistent-nochange-failure") {
          const forged = new ProvisionerError();
          forged.durability = "no-registry-change-established";
          forged.registry_may_have_been_created = false;
          forged.retry_disposition = "fresh-invocation-required";
          throw forged;
        }
        if (${JSON.stringify(mode)} === "unknown-failure") throw new Error(${JSON.stringify(VALUE_CANARY)});
        if (${JSON.stringify(mode)} === "old-v1-receipt") return { ...successReceipt(), contract: "shogi-floodgate-v7-production-connector-registry-provisioner-v2" };
        if (${JSON.stringify(mode)} === "bad-receipt") return { ...successReceipt(), private_value: ${JSON.stringify(VALUE_CANARY)} };
        return successReceipt();
      },
    };
  }
  return Reflect.apply(originalLoad, this, [request, parent, isMain]);
};
process.argv = [process.execPath, ${JSON.stringify(CLI_SOURCE_PATH)}, ...${JSON.stringify(arguments_)}];
if (${JSON.stringify(wrongRuntime)}) {
  Object.defineProperty(process, "version", { configurable: true, value: "v20.14.0" });
}
if (${JSON.stringify(failStdout)}) {
  process.stdout.write = function (_value, callback) {
    const failure = new Error(${JSON.stringify(VALUE_CANARY)});
    if (typeof callback === "function") callback(failure);
    process.nextTick(() => process.stdout.emit("error", failure));
    return false;
  };
}
process.on("exit", () => {
  if (${JSON.stringify(arguments_.length > 0 || wrongRuntime)} && provisionerLoads !== 0) {
    require("node:fs").writeSync(2, "PROVISIONER_WAS_LOADED\n");
  }
});
Module.runMain();
`;
  return spawnSync(process.execPath, ["-r", "tsx/cjs", "-e", launcher], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: cleanChildEnvironment(),
    timeout: 30_000,
  });
}

describe("Floodgate v7 production connector registry provisioner CLI", () => {
  it("removes temporary listeners after success and paired or synchronous failures", async () => {
    for (const mode of [
      "success",
      "callback-and-paired-error",
      "synchronous-throw",
    ] as const) {
      const stream = new TestOutputStream(mode);
      const operation =
        writeFloodgateV7ProductionConnectorRegistryProvisionOutputCoreForTests(
          asWriteStream(stream),
          "receipt\n",
        );
      if (mode === "success") {
        await expect(operation).resolves.toBeUndefined();
      } else {
        await expect(operation).rejects.toThrow(`synthetic-output-${mode}`);
      }
      expect(stream.writes).toBe(1);
      expect(stream.listenerCount("error")).toBe(0);
    }
  });

  it("does not accumulate output listeners across repeated failures", async () => {
    const stream = new TestOutputStream("callback-and-paired-error");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await expect(
        writeFloodgateV7ProductionConnectorRegistryProvisionOutputCoreForTests(
          asWriteStream(stream),
          "fixed\n",
        ),
      ).rejects.toThrow("synthetic-output-callback-and-paired-error");
      expect(stream.listenerCount("error")).toBe(0);
    }
    expect(stream.writes).toBe(20);
  });

  it("rejects argv before lazily loading the production provisioner", () => {
    const result = runCli([VALUE_CANARY], "success");

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(NO_CHANGE_FAILURE_MESSAGE);
    expect(result.stderr).not.toContain("PROVISIONER_WAS_LOADED");
    expect(result.stderr).not.toContain(VALUE_CANARY);
  });

  it("rejects a mismatched application entrypoint before loading mutation-capable code", () => {
    const result = runCli([], "source-context-failure");

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(NO_CHANGE_FAILURE_MESSAGE);
    expect(result.stderr).not.toContain("PROVISIONER_WAS_LOADED");
    expect(result.stderr).not.toContain(VALUE_CANARY);
  });

  it("prints one sanitized success receipt", () => {
    const result = runCli([], "success");

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const receipt = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(receipt).toMatchObject({
      contract:
        "shogi-floodgate-v7-production-connector-registry-provisioner-v3",
      status:
        "immutable-private-run-registry-created-bound-and-postflight-validated",
      execution_boundary:
        "production-fixed-current-euid-private-registry-provisioning",
      verification: {
        verifier_source_artifact_closure_checked_before_install: true,
        production_application_source_closure_checked_before_current_key_and_install: true,
        application_source_binding_bound_and_postflight_checked: true,
        sensitive_values_exported: false,
      },
      nonclaims: {
        run_id_disclosed: false,
        application_source_revision_disclosed: false,
        path_disclosed: false,
        playing_strength: false,
      },
    });
    expect(result.stdout).not.toContain(VALUE_CANARY);
  });

  it("projects typed failures through a fixed allowlist without canaries", () => {
    const result = runCli([], "typed-failure");

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(VALUE_CANARY);
    expect(JSON.parse(result.stderr)).toEqual({
      contract:
        FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_CONTRACT,
      status:
        FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_STATUS,
      phase: "installation",
      durability: "registry-may-have-been-created",
      registry_may_have_been_created: true,
      retry_disposition: "registry-reconciliation-required",
      sensitive_values_disclosed: false,
      success_receipt_issued: false,
    });
  });

  it("projects verifier-readiness as a typed no-change failure", () => {
    const result = runCli([], "readiness-failure");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(VALUE_CANARY);
    expect(JSON.parse(result.stderr)).toMatchObject({
      contract:
        FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_PROVISION_FAILURE_CONTRACT,
      phase: "verifier-readiness",
      durability: "no-registry-change-established",
      registry_may_have_been_created: false,
      retry_disposition: "fresh-invocation-required",
      sensitive_values_disclosed: false,
      success_receipt_issued: false,
    });
  });

  it.each(["unknown-failure", "bad-receipt"] as const)(
    "uses the conservative may-have-created message after %s",
    (mode) => {
      const result = runCli([], mode);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(CONSERVATIVE_FAILURE_MESSAGE);
      expect(result.stderr).not.toContain(VALUE_CANARY);
    },
  );

  it("rejects a historical v2 success receipt at the v3 CLI boundary", () => {
    const result = runCli([], "old-v1-receipt");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(CONSERVATIVE_FAILURE_MESSAGE);
  });

  it("rejects forged typed metadata without copying its canary", () => {
    const result = runCli([], "forged-typed-failure");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(CONSERVATIVE_FAILURE_MESSAGE);
    expect(result.stderr).not.toContain(VALUE_CANARY);
  });

  it("rejects a forged installation no-change failure with a fresh retry disposition", () => {
    const result = runCli([], "inconsistent-nochange-failure");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(CONSERVATIVE_FAILURE_MESSAGE);
    expect(result.stderr).not.toContain(VALUE_CANARY);
  });

  it("rejects the wrong Node runtime before loading the provisioner", () => {
    const result = runCli([], "success", false, true);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(NO_CHANGE_FAILURE_MESSAGE);
    expect(result.stderr).not.toContain("PROVISIONER_WAS_LOADED");
  });

  it("treats stdout failure after success as registry-may-have-been-created", () => {
    const result = runCli([], "success", true);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(CONSERVATIVE_FAILURE_MESSAGE);
    expect(result.stderr).not.toContain(VALUE_CANARY);
  });

  it("is argumentless, stdin/env-free, and requires the provisioner only after argv rejection", async () => {
    const source = await fs.promises.readFile(CLI_SOURCE_PATH, "utf8");
    const mainStart = source.indexOf("async function main");
    const entryStart = source.indexOf("if (require.main === module)");
    const mainSource = source.slice(mainStart, entryStart);
    const argumentCheck = mainSource.indexOf("process.argv.length !== 2");
    const runtimeCheck = mainSource.indexOf(
      "process.version !== REQUIRED_NODE_VERSION",
    );
    const lazyRequire = mainSource.indexOf(
      'require("./floodgate-v7-production-connector-registry-provisioner")',
    );
    const sourceRequire = mainSource.indexOf(
      'require("./floodgate-v7-production-application-source-provenance")',
    );
    const sourceAssertion = mainSource.indexOf(
      "assertFloodgateV7ProductionApplicationEntrypointContext",
    );
    const projectionStart = source.indexOf("function sanitizedFailure");
    const projection = source.slice(projectionStart, mainStart);

    expect(mainStart).toBeGreaterThan(-1);
    expect(entryStart).toBeGreaterThan(mainStart);
    expect(argumentCheck).toBeGreaterThan(-1);
    expect(runtimeCheck).toBeGreaterThan(argumentCheck);
    expect(sourceRequire).toBeGreaterThan(runtimeCheck);
    expect(sourceAssertion).toBeGreaterThan(sourceRequire);
    expect(lazyRequire).toBeGreaterThan(sourceAssertion);
    expect(source).not.toMatch(/process\.(?:stdin|env)\b/);
    expect(source).not.toMatch(/\bJSON\.parse\b|\breadline\b|\bargv\s*\[/);
    expect(source).not.toMatch(
      /node:(?:fs|readline|child_process|net|http|https)/,
    );
    for (const field of [
      "contract",
      "status",
      "phase",
      "durability",
      "registry_may_have_been_created",
      "retry_disposition",
      "sensitive_values_disclosed",
      "success_receipt_issued",
    ]) {
      expect(projection).toContain(`${field}:`);
    }
    expect(projection).not.toMatch(
      /\b(?:cause|stack|message|run_id|digest|path|owner_uid|dev|ino|key_instance_id)\s*:/,
    );
    expect(source).toContain("fixedFailureProjection(false)");
    expect(source).toContain("fixedFailureProjection(true)");
    expect(source).toContain("POSSIBLY_CREATED_OUTPUT_FAILURE");
    expect(source).toContain("NO_CHANGE_OUTPUT_FAILURE");
  });
});
