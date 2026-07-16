import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_FAILURE_CONTRACT,
  FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_FAILURE_STATUS,
  FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_SUCCESS_CONTRACT,
  FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_SUCCESS_STATUS,
  writeFloodgateV7TrainingLabelProductionOutputCoreForTests,
} from "../../../ml/floodgate-v7-training-label-production-cli";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const CLI_SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/floodgate-v7-training-label-production-cli.ts",
);
const ENTRY_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/run-floodgate-v7-training-label-production.ts",
);
const PRIVATE_CANARY = "private-owner-finalizer-receipt-must-not-be-public";
const HASHES = {
  work: "11".repeat(32),
  train: "22".repeat(32),
  result: "33".repeat(32),
  manifest: "44".repeat(32),
} as const;

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
  sourceGuard: Readonly<{
    expectedPurposeEntrypoint?: string;
    throws?: boolean;
  }> = {},
): SpawnSyncReturns<string> {
  const expectedPurposeEntrypoint =
    sourceGuard.expectedPurposeEntrypoint ??
    "ml/run-floodgate-v7-training-label-production.ts";
  const launcher = String.raw`
const Module = require("node:module");
const originalLoad = Module._load;
const privateCanary = ${JSON.stringify(PRIVATE_CANARY)};
let sourceGuardCalls = 0;
Module._load = function (request, parent, isMain) {
  if (request.endsWith("floodgate-v7-production-application-source-provenance")) {
    return {
      assertFloodgateV7ProductionApplicationEntrypointContext(expectedPurposeEntrypoint) {
        sourceGuardCalls += 1;
        if (
          sourceGuardCalls !== 1 ||
          expectedPurposeEntrypoint !== ${JSON.stringify(expectedPurposeEntrypoint)} ||
          ${JSON.stringify(sourceGuard.throws === true)}
        ) {
          throw new Error(privateCanary);
        }
      },
    };
  }
  if (request.endsWith("floodgate-v7-training-label-production-runner")) {
    if (${JSON.stringify(mode)} === "load-must-not-happen" || sourceGuardCalls !== 1) {
      process.stdout.write(privateCanary);
      throw new Error(privateCanary);
    }
    class RunnerError extends Error {
      constructor() {
        super("sanitized runner failure");
        this.phase = "outer-gate";
        this.publication_may_have_occurred = true;
        this.lease_may_remain = true;
        this.cleanup_failure_count = null;
        this.retry_disposition = "manual-publication-and-lease-reconciliation-required";
        this.raw_outer_receipt_disclosed = false;
        this.raw_owner_receipt_disclosed = false;
        this.raw_finalizer_receipt_disclosed = false;
      }
    }
    const receipt = () => ({
      contract: "shogi-floodgate-v7-training-label-production-runner-v2",
      status: "application-source-bound-authenticated-training-label-artifacts-finalized-published-and-reverified-under-common-production-outer-gate",
      claim_boundary: "one-fixed-purpose-and-application-source-bound-production-training-label-finalization-without-path-run-key-identity-row-or-raw-receipt-disclosure-v2",
      execution_boundary: "production-fixed-purpose-and-application-source-bound-outer-gate-owner-and-sanitized-artifact-evidence",
      mutation_purpose: "training-label-finalization-24000",
      output: {
        parents: 24000,
        training_records: 23001,
        work: { bytes: 400000000, sha256: ${JSON.stringify(HASHES.work)} },
        train: { bytes: 200000000, sha256: ${JSON.stringify(HASHES.train)} },
        result: { bytes: 1024, sha256: ${JSON.stringify(HASHES.result)} },
        manifest: { bytes: 2048, sha256: ${JSON.stringify(HASHES.manifest)} },
      },
      verification: {
        owner_completed: true,
        destination_content_reverified: true,
        purpose_bound_outer_lease_removed_durably: true,
        common_os_lock_released: true,
        application_source_exact_clean_closure_validated_under_outer_gate: true,
      },
      nonclaims: {
        path_disclosed: false,
        run_id_disclosed: false,
        key_id_disclosed: false,
        identity_disclosed: false,
        mac_disclosed: false,
        consumer_postflight_digest_disclosed: false,
        raw_outer_receipt_disclosed: false,
        raw_owner_receipt_disclosed: false,
        raw_finalizer_receipt_disclosed: false,
        row_or_position_content_disclosed: false,
        application_source_revision_disclosed: false,
        application_source_path_disclosed: false,
        application_source_digest_disclosed: false,
        teacher_truth: false,
        optimizer_training: false,
        weight: false,
        live_evaluation_activation: false,
        match: false,
        playing_strength: false,
      },
    });
    return {
      FloodgateV7TrainingLabelProductionRunnerError: RunnerError,
      runFloodgateV7TrainingLabelProduction: async () => {
        if (${JSON.stringify(mode)} === "unknown") throw new Error(privateCanary);
        if (${JSON.stringify(mode)} === "typed-failure") throw new RunnerError();
        if (${JSON.stringify(mode)} === "inconsistent-typed") {
          const error = new RunnerError();
          error.lease_may_remain = false;
          throw error;
        }
        if (${JSON.stringify(mode)} === "proxy-typed") {
          throw new Proxy(new RunnerError(), {});
        }
        if (${JSON.stringify(mode)} === "accessor-typed") {
          const error = new RunnerError();
          Object.defineProperty(error, "retry_disposition", {
            enumerable: true,
            get() { throw new Error(privateCanary); },
          });
          throw error;
        }
        const value = receipt();
        if (${JSON.stringify(mode)} === "bad-success") {
          value.nonclaims.raw_owner_receipt_disclosed = true;
        }
        return value;
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
    timeout: 30_000,
  });
}

describe("Floodgate v7 training-label production CLI", () => {
  it.each(["callback-and-paired-error", "synchronous-throw"] as const)(
    "settles once and removes its output listener after %s",
    async (mode) => {
      const stream = new TestOutputStream(mode);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await expect(
          writeFloodgateV7TrainingLabelProductionOutputCoreForTests(
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
      writeFloodgateV7TrainingLabelProductionOutputCoreForTests(
        asWriteStream(stream),
        "sanitized\n",
      ),
    ).resolves.toBeUndefined();
    expect(stream.listenerCount("error")).toBe(0);
    expect(stream.writes).toBe(1);
  });

  it("rejects argv before lazy-loading the runner", () => {
    const result = runEntry("load-must-not-happen", [PRIVATE_CANARY]);
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(result.stderr)).toMatchObject({
      contract: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_FAILURE_CONTRACT,
      status: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_FAILURE_STATUS,
      phase: "capture",
      publication_may_have_occurred: false,
      lease_may_remain: false,
      cleanup_failure_count: 0,
      retry_disposition: "fresh-invocation-required",
      success_receipt_issued: false,
    });
  });

  it("rejects the wrong Node runtime before lazy-loading the runner", () => {
    const result = runEntry("load-must-not-happen", [], true);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(result.stderr)).toMatchObject({
      phase: "capture",
      publication_may_have_occurred: false,
      lease_may_remain: false,
    });
  });

  it("rejects a mismatched purpose entry before lazy-loading the runner", () => {
    const result = runEntry("load-must-not-happen", [], false, {
      expectedPurposeEntrypoint:
        "ml/run-floodgate-v7-production-connector-prefix-100.ts",
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(result.stderr)).toMatchObject({
      phase: "capture",
      publication_may_have_occurred: false,
      lease_may_remain: false,
      cleanup_failure_count: 0,
      success_receipt_issued: false,
    });
  });

  it("sanitizes a source guard failure before lazy-loading the runner", () => {
    const result = runEntry("load-must-not-happen", [], false, {
      throws: true,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(result.stderr)).toMatchObject({
      phase: "capture",
      publication_may_have_occurred: false,
      lease_may_remain: false,
      cleanup_failure_count: 0,
      success_receipt_issued: false,
    });
  });

  it("publishes one allowlisted success line", () => {
    const result = runEntry("success");
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.endsWith("\n")).toBe(true);
    expect(result.stdout.trimEnd()).not.toContain("\n");
    expect(result.stdout).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(result.stdout)).toEqual({
      contract: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_SUCCESS_CONTRACT,
      status: FLOODGATE_V7_TRAINING_LABEL_PRODUCTION_CLI_SUCCESS_STATUS,
      mutation_purpose: "training-label-finalization-24000",
      parents: 24_000,
      training_records: 23_001,
      work_bytes: 400_000_000,
      work_sha256: HASHES.work,
      train_bytes: 200_000_000,
      train_sha256: HASHES.train,
      result_bytes: 1_024,
      result_sha256: HASHES.result,
      manifest_bytes: 2_048,
      manifest_sha256: HASHES.manifest,
      destination_content_reverified: true,
      purpose_bound_outer_lease_removed_durably: true,
      common_os_lock_released: true,
      application_source_exact_clean_closure_validated_under_outer_gate: true,
      application_source_revision_disclosed: false,
      application_source_path_disclosed: false,
      application_source_digest_disclosed: false,
      raw_outer_receipt_disclosed: false,
      raw_owner_receipt_disclosed: false,
      raw_finalizer_receipt_disclosed: false,
      path_or_identity_disclosed: false,
      success_receipt_issued: true,
    });
  });

  it("allowlists typed failure fields without exposing the original error", () => {
    const result = runEntry("typed-failure");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(result.stderr)).toMatchObject({
      phase: "outer-gate",
      publication_may_have_occurred: true,
      lease_may_remain: true,
      cleanup_failure_count: null,
      retry_disposition: "manual-publication-and-lease-reconciliation-required",
      raw_owner_receipt_disclosed: false,
      raw_finalizer_receipt_disclosed: false,
      success_receipt_issued: false,
    });
  });

  it.each([
    "unknown",
    "inconsistent-typed",
    "proxy-typed",
    "accessor-typed",
  ] as const)(
    "maps %s post-invocation failure to conservative reconciliation",
    (mode) => {
      const result = runEntry(mode);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).not.toContain(PRIVATE_CANARY);
      expect(JSON.parse(result.stderr)).toMatchObject({
        phase: "runner",
        publication_may_have_occurred: true,
        lease_may_remain: true,
        cleanup_failure_count: null,
        retry_disposition:
          "manual-publication-and-lease-reconciliation-required",
      });
    },
  );

  it("rejects a success receipt with inconsistent nonclaims", () => {
    const result = runEntry("bad-success");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(result.stderr)).toMatchObject({
      phase: "runner",
      publication_may_have_occurred: true,
      lease_may_remain: true,
    });
  });

  it("keeps import-only entry loading inert", () => {
    const script = `require(${JSON.stringify(ENTRY_PATH)});`;
    const result = spawnSync(
      process.execPath,
      ["-r", "tsx/cjs", "-e", script],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: cleanChildEnvironment(),
        timeout: 30_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  it("checks argv, runtime, and source before require and has no ambient input or raw projection", async () => {
    const source = await fs.promises.readFile(CLI_SOURCE_PATH, "utf8");
    const executeStart = source.indexOf("async function executeCli");
    const executeSource = source.slice(executeStart);
    const argumentCheck = executeSource.indexOf("process.argv.length !== 2");
    const runtimeCheck = executeSource.indexOf(
      "process.version !== REQUIRED_NODE_VERSION",
    );
    const sourceGuard = executeSource.indexOf(
      "assertFloodgateV7ProductionApplicationEntrypointContext(",
    );
    const lazyRequire = executeSource.indexOf(
      'require("./floodgate-v7-training-label-production-runner")',
    );
    expect(executeStart).toBeGreaterThan(-1);
    expect(argumentCheck).toBeGreaterThan(-1);
    expect(runtimeCheck).toBeGreaterThan(argumentCheck);
    expect(sourceGuard).toBeGreaterThan(runtimeCheck);
    expect(sourceGuard).toBeLessThan(lazyRequire);
    expect(source).not.toMatch(/process\.(?:stdin|env|cwd)\b/u);
    expect(source).not.toMatch(/process\.exit\s*\(/u);
    expect(source).not.toContain("stringify(rawRunnerReceipt)");
    expect(source).toContain("sanitizedSuccess(rawRunnerReceipt)");
    expect(source).toContain("raw_owner_receipt_disclosed: false");
    expect(source).toContain("raw_finalizer_receipt_disclosed: false");
  });

  it("publishes the caffeinated fixed production command", async () => {
    const packageJson = JSON.parse(
      await fs.promises.readFile(
        path.join(REPOSITORY_ROOT, "package.json"),
        "utf8",
      ),
    ) as { scripts: Record<string, string> };
    expect(
      packageJson.scripts["shogi:floodgate-v7-training-label-production"],
    ).toBe(
      "/usr/bin/caffeinate -dimsu node -r tsx/cjs ml/run-floodgate-v7-training-label-production.ts",
    );
  });
});
