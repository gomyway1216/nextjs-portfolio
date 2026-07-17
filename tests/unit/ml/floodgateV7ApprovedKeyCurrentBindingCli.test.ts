import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLI_FAILURE_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLI_SUCCESS_CONTRACT,
  writeFloodgateV7ApprovedKeyCurrentBindingOutputCoreForTests,
} from "../../../ml/inspect-floodgate-v7-approved-key-current-binding";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const ENTRYPOINT = path.join(
  REPOSITORY_ROOT,
  "ml/inspect-floodgate-v7-approved-key-current-binding.ts",
);
const RELATIVE_ENTRYPOINT =
  "ml/inspect-floodgate-v7-approved-key-current-binding.ts";
const PRIVATE_CANARY =
  "private-revision-path-digest-key-uid-home-reconciliation-canary";
const CORE_CONTRACT =
  "shogi-floodgate-v7-approved-key-current-binding-preflight-v1";
const CORE_STATUS = "approved-record-exactly-matches-fresh-current-key";
const CORE_CLAIM_BOUNDARY =
  "read-only-memory-only-approved-record-to-fresh-current-key-binding-diagnostic-without-exported-sensitive-values-or-authority-v1";
const CORE_EXECUTION_BOUNDARY =
  "production-fixed-current-euid-userinfo-home-approved-record-current-key-binding";
const CORE_ALGORITHM =
  "approved-record-to-fresh-current-key-eight-field-strict-equality-v1";
const FAILURE_RECEIPT = {
  contract: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLI_FAILURE_CONTRACT,
  status: "approved-current-binding-readiness-did-not-issue-success",
  phase: "capture",
  approved_current_binding_ready: false,
  receipt_issued: false,
  nonclaims: {
    sensitive_identity_values_disclosed: false,
    application_revision_path_or_digest_disclosed: false,
    key_identity_material_or_path_disclosed: false,
    uid_or_home_disclosed: false,
    approval_record_or_key_content_or_namespace_mutation_performed: false,
    reconciliation_performed: false,
    reconciliation_authority: false,
    run_stage_connector_or_checkpoint_authority: false,
    dataset_teacher_training_weight_live_match_or_strength_evidence: false,
    ignored_untracked_dependency_bytes_verified: false,
    same_uid_race_isolation: false,
    atomic_source_snapshot: false,
    tool_byte_closure_verified: false,
    atomic_process_lineage_snapshot: false,
    same_uid_or_ancestor_hostile_process_isolation: false,
    production_managed_namespace_or_file_content_mutation_performed: false,
    atime_invariance: false,
  },
  raw_failure_disclosed: false,
  private_values_disclosed: false,
  success_receipt_issued: false,
} as const;

type EntryMode =
  | "success"
  | "typed-failure"
  | "throw"
  | "proxy"
  | "accessor"
  | "extra-string"
  | "extra-symbol"
  | "nonplain"
  | "bad-verification"
  | "claim-failure"
  | "context-failure"
  | "load-must-not-happen";

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

function runMockedEntry(
  mode: EntryMode,
  arguments_: readonly string[] = [],
  wrongRuntime = false,
): SpawnSyncReturns<string> {
  const launcher = String.raw`
const Module = require("node:module");
const originalLoad = Module._load;
const events = [];
const mode = ${JSON.stringify(mode)};
const canary = ${JSON.stringify(PRIVATE_CANARY)};
const expectedEntrypoint = ${JSON.stringify(RELATIVE_ENTRYPOINT)};
const expectedEvents =
  mode === "claim-failure"
    ? ["claim"]
    : mode === "context-failure"
      ? ["claim", "context"]
      : mode === "load-must-not-happen"
        ? []
        : ["claim", "context", "load", "verify"];
process.on("exit", () => {
  if (events.join(",") !== expectedEvents.join(",")) process.exitCode = 91;
});
function receipt() {
  return {
    contract: ${JSON.stringify(CORE_CONTRACT)},
    status: ${JSON.stringify(CORE_STATUS)},
    claim_boundary: ${JSON.stringify(CORE_CLAIM_BOUNDARY)},
    execution_boundary: ${JSON.stringify(CORE_EXECUTION_BOUNDARY)},
    algorithm: ${JSON.stringify(CORE_ALGORITHM)},
    verification: {
      approved_record_validated: true,
      current_key_freshly_inspected: true,
      exact_binding_match: true,
      held_descriptors_revalidated: true,
      memory_only: true,
      sensitive_values_exported: false,
    },
    nonclaims: {
      single_use_capability_returned: false,
      approved_claim_returned: false,
      approval_created: false,
      record_created_or_written: false,
      key_created_or_written: false,
      run_authority: false,
      stage_authority: false,
      connector_authority: false,
      checkpoint_key_capability: false,
      checkpoint: false,
      runtime: false,
      dataset_read: false,
      teacher_label: false,
      training: false,
      weight: false,
      live_evaluation_activation: false,
      match: false,
      playing_strength: false,
    },
  };
}
Module._load = function(request, parent, isMain) {
  if (request.endsWith("floodgate-v7-production-native-launcher-attestation")) {
    return {
      claimFloodgateV7ProductionNativeLauncherAttestation(entrypoint) {
        events.push("claim");
        if (entrypoint !== expectedEntrypoint || mode === "claim-failure") {
          throw new Error(canary);
        }
      },
    };
  }
  if (request.endsWith("floodgate-v7-production-application-source-provenance")) {
    return {
      assertFloodgateV7ProductionApplicationEntrypointContext(entrypoint) {
        events.push("context");
        if (entrypoint !== expectedEntrypoint || mode === "context-failure") {
          throw new Error(canary);
        }
      },
    };
  }
  if (request.endsWith("floodgate-v7-approved-key-current-binding")) {
    events.push("load");
    if (mode === "load-must-not-happen") {
      throw new Error(canary);
    }
    class CurrentBindingError extends Error {
      constructor() {
        super(canary);
        this.phase = "comparison";
        this.receipt_issued = false;
        this.authority_issued = false;
        this.revision = "a".repeat(40);
        this.path = "/private/operator/home";
        this.digest = "b".repeat(64);
        this.key = canary;
        this.uid = 501;
        this.home = "/private/operator";
        this.reconciliation = canary;
      }
    }
    async function verifyFloodgateV7ApprovedKeyCurrentBinding() {
      events.push("verify");
      if (events.join(",") !== "claim,context,load,verify") {
        throw new Error(canary);
      }
      if (mode === "typed-failure") throw new CurrentBindingError();
      if (mode === "throw") throw new Error(canary);
      const value = receipt();
      if (mode === "bad-verification") {
        value.verification.exact_binding_match = false;
      }
      if (mode === "proxy") {
        return new Proxy(value, {
          get(target, key, receiver) {
            if (key === "then") return undefined;
            throw new Error(canary);
          },
          ownKeys() { throw new Error(canary); },
        });
      }
      if (mode === "accessor") {
        Object.defineProperty(value, "status", {
          configurable: false,
          enumerable: true,
          get() { throw new Error(canary); },
        });
      }
      if (mode === "extra-string") value[canary] = canary;
      if (mode === "extra-symbol") value[Symbol(canary)] = canary;
      if (mode === "nonplain") {
        Object.setPrototypeOf(value, { privateHome: canary });
      }
      return value;
    }
    return Object.defineProperties({}, {
      FloodgateV7ApprovedKeyCurrentBindingError: {
        configurable: false,
        enumerable: true,
        get() { return CurrentBindingError; },
      },
      verifyFloodgateV7ApprovedKeyCurrentBinding: {
        configurable: false,
        enumerable: true,
        get() { return verifyFloodgateV7ApprovedKeyCurrentBinding; },
      },
    });
  }
  return Reflect.apply(originalLoad, this, [request, parent, isMain]);
};
process.argv = [process.execPath, ${JSON.stringify(ENTRYPOINT)}, ...${JSON.stringify(arguments_)}];
if (${JSON.stringify(wrongRuntime)}) {
  Object.defineProperty(process, "version", {
    configurable: true,
    value: "v20.14.0",
  });
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

function expectSanitizedFailure(
  result: SpawnSyncReturns<string>,
  phase: "capture" | "comparison" = "capture",
): void {
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).not.toContain(PRIVATE_CANARY);
  expect(result.stderr).not.toContain(REPOSITORY_ROOT);
  expect(result.stderr.trim().split("\n")).toHaveLength(1);
  expect(JSON.parse(result.stderr)).toEqual({ ...FAILURE_RECEIPT, phase });
}

describe("Floodgate v7 approved key current binding CLI", () => {
  it("is import-only inert and has no static verifier import", () => {
    const source = fs.readFileSync(ENTRYPOINT, "utf8");
    expect(source).not.toMatch(
      /^import (?!type).*floodgate-v7-approved-key-current-binding/mu,
    );
    const child = spawnSync(
      process.execPath,
      ["-r", "tsx/cjs", "-e", `require(${JSON.stringify(ENTRYPOINT)})`],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: cleanChildEnvironment(),
        timeout: 30_000,
      },
    );
    expect(child.status).toBe(0);
    expect(child.stdout).toBe("");
    expect(child.stderr).toBe("");
  });

  it.each([
    { arguments_: ["unexpected"], wrongRuntime: false },
    { arguments_: [], wrongRuntime: true },
  ])(
    "rejects wrong invocation before claim, context, or lazy verifier load",
    ({ arguments_, wrongRuntime }) => {
      expectSanitizedFailure(
        runMockedEntry("load-must-not-happen", arguments_, wrongRuntime),
      );
    },
  );

  it("claims the one-shot launcher before context and lazy verification", () => {
    const result = runMockedEntry("success");
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(result.stdout)).toEqual({
      contract: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLI_SUCCESS_CONTRACT,
      status: CORE_STATUS,
      claim_boundary: CORE_CLAIM_BOUNDARY,
      verification: {
        approved_record_validated: true,
        current_key_freshly_inspected: true,
        exact_binding_match: true,
        held_descriptors_revalidated: true,
        memory_only: true,
        sensitive_values_exported: false,
      },
      nonclaims: {
        sensitive_identity_values_disclosed: false,
        application_revision_path_or_digest_disclosed: false,
        key_identity_material_or_path_disclosed: false,
        uid_or_home_disclosed: false,
        approval_record_or_key_content_or_namespace_mutation_performed: false,
        reconciliation_performed: false,
        reconciliation_authority: false,
        run_stage_connector_or_checkpoint_authority: false,
        dataset_teacher_training_weight_live_match_or_strength_evidence: false,
        ignored_untracked_dependency_bytes_verified: false,
        same_uid_race_isolation: false,
        atomic_source_snapshot: false,
        tool_byte_closure_verified: false,
        atomic_process_lineage_snapshot: false,
        same_uid_or_ancestor_hostile_process_isolation: false,
        production_managed_namespace_or_file_content_mutation_performed: false,
        atime_invariance: false,
      },
      success_receipt_issued: true,
    });
  });

  it.each(["claim-failure", "context-failure"] as const)(
    "stops in exact order on %s without loading the verifier",
    (mode) => {
      expectSanitizedFailure(runMockedEntry(mode));
    },
  );

  it("projects only an allowlisted phase from a typed verifier failure", () => {
    expectSanitizedFailure(runMockedEntry("typed-failure"), "comparison");
  });

  it.each([
    "throw",
    "proxy",
    "accessor",
    "extra-string",
    "extra-symbol",
    "nonplain",
    "bad-verification",
  ] as const)(
    "rejects %s through one sanitized JSON failure boundary",
    (mode) => {
      expectSanitizedFailure(runMockedEntry(mode));
    },
  );

  it("fails a direct un-attested invocation before lazy verifier loading", () => {
    const launcher = String.raw`
const Module = require("node:module");
const originalLoad = Module._load;
let loaded = false;
Module._load = function(request, parent, isMain) {
  if (request.endsWith("floodgate-v7-approved-key-current-binding")) {
    loaded = true;
    process.exitCode = 93;
    throw new Error(${JSON.stringify(PRIVATE_CANARY)});
  }
  return Reflect.apply(originalLoad, this, [request, parent, isMain]);
};
process.on("exit", () => {
  if (loaded) process.exitCode = 93;
});
process.argv = [process.execPath, ${JSON.stringify(ENTRYPOINT)}];
Module.runMain();
`;
    const result = spawnSync(
      process.execPath,
      ["-r", "tsx/cjs", "-e", launcher],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: cleanChildEnvironment(),
        timeout: 30_000,
      },
    );
    expectSanitizedFailure(result);
  });

  it("keeps a paired-error listener through the event turn and detaches it", async () => {
    const stream = new TestOutputStream("callback-and-paired-error");

    await expect(
      writeFloodgateV7ApprovedKeyCurrentBindingOutputCoreForTests(
        asWriteStream(stream),
        "receipt\n",
      ),
    ).rejects.toThrow("synthetic-output-callback-and-paired-error");

    expect(stream.writes).toBe(1);
    expect(stream.listenerCount("error")).toBe(0);
  });

  it.each(["callback-and-paired-error", "synchronous-throw"] as const)(
    "does not accumulate temporary listeners across repeated %s failures",
    async (mode) => {
      const stream = new TestOutputStream(mode);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await expect(
          writeFloodgateV7ApprovedKeyCurrentBindingOutputCoreForTests(
            asWriteStream(stream),
            "fixed-failure\n",
          ),
        ).rejects.toThrow(`synthetic-output-${mode}`);
        expect(stream.listenerCount("error")).toBe(0);
      }
      expect(stream.writes).toBe(20);
    },
  );

  it("detaches the temporary listener after a successful write", async () => {
    const stream = new TestOutputStream("success");

    await expect(
      writeFloodgateV7ApprovedKeyCurrentBindingOutputCoreForTests(
        asWriteStream(stream),
        "receipt\n",
      ),
    ).resolves.toBeUndefined();

    expect(stream.writes).toBe(1);
    expect(stream.listenerCount("error")).toBe(0);
  });
});
