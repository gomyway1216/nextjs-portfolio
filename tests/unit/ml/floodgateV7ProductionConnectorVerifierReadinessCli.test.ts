import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLI_FAILURE_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLI_SUCCESS_CONTRACT,
  writeFloodgateV7ProductionConnectorVerifierReadinessOutputCoreForTests,
} from "../../../ml/inspect-floodgate-v7-production-connector-verifier-readiness";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const ENTRYPOINT_RELATIVE =
  "ml/inspect-floodgate-v7-production-connector-verifier-readiness.ts";
const ENTRYPOINT = path.join(REPOSITORY_ROOT, ENTRYPOINT_RELATIVE);
const PRIVATE_CANARY =
  "private-verifier-path-revision-digest-euid-home-canary-must-not-be-public";
const CORE_CONTRACT =
  "shogi-floodgate-v7-production-connector-verifier-readiness-v1";
const CORE_STATUS = "pinned-role-bundle-receipt-git-closure-checked";
const CORE_CLAIM_BOUNDARY =
  "git-clean-nonignored-worktree-exact-revision-tracked-source-tree-and-pinned-receipt-evidence-non-authorizing-readiness-no-external-role-bundle-files-read-full-verifier-gate-registry-authority-label-training-strength-or-sensitive-identity";
const CORE_EXECUTION_BOUNDARY =
  "production-fixed-current-euid-userinfo-home-role-bundle-receipt-git-closure";
const CORE_NONCLAIMS = [
  "external_role_bundle_files_read",
  "full_role_bundle_verifier_run",
  "gate_authority",
  "registry_authority",
  "connector_authority",
  "teacher_label",
  "training",
  "weight",
  "live_evaluation_activation",
  "playing_strength",
  "path_disclosed",
  "revision_disclosed",
  "digest_disclosed",
  "private_identity_disclosed",
] as const;
const PUBLIC_NONCLAIMS = [
  "external_role_bundle_files_read",
  "full_role_bundle_verifier_run",
  "gate_authority",
  "registry_authority",
  "connector_authority",
  "reconciliation_performed",
  "reconciliation_authority",
  "teacher_label",
  "training",
  "weight",
  "live_evaluation_activation",
  "playing_strength",
  "path_disclosed",
  "revision_disclosed",
  "digest_disclosed",
  "effective_user_id_disclosed",
  "home_directory_disclosed",
  "private_identity_disclosed",
  "ignored_untracked_dependency_bytes_verified",
  "same_uid_race_isolation",
  "atomic_source_snapshot",
  "tool_byte_closure_verified",
  "atomic_process_lineage_snapshot",
  "same_uid_or_ancestor_hostile_process_isolation",
  "production_managed_namespace_or_file_content_mutation_performed",
  "atime_invariance",
] as const;

type EntryMode =
  | "success"
  | "reordered"
  | "known-failure"
  | "unknown-failure"
  | "bad-value"
  | "proxy"
  | "accessor"
  | "extra-string"
  | "extra-symbol"
  | "nonplain"
  | "nested-proxy"
  | "load-must-not-happen";

function cleanEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.TSX_TSCONFIG_PATH;
  return environment;
}

function runEntry(
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
const expectedEntrypoint = ${JSON.stringify(ENTRYPOINT_RELATIVE)};
const coreNonclaims = ${JSON.stringify(CORE_NONCLAIMS)};
function exactEvents(expected) {
  if (JSON.stringify(events) !== JSON.stringify(expected)) throw new Error(canary);
}
function validReceipt() {
  return {
    contract: ${JSON.stringify(CORE_CONTRACT)},
    status: ${JSON.stringify(CORE_STATUS)},
    claim_boundary: ${JSON.stringify(CORE_CLAIM_BOUNDARY)},
    execution_boundary: ${JSON.stringify(CORE_EXECUTION_BOUNDARY)},
    verification: {
      fixed_current_euid_home_repository_root: true,
      fixed_verifier_revision: true,
      pinned_receipt_git_closure_checked: true,
      closure_receipt_validated: true,
      sensitive_values_exported: false,
    },
    nonclaims: Object.fromEntries(coreNonclaims.map((key) => [key, false])),
  };
}
Module._load = function(request, parent, isMain) {
  if (request.endsWith("floodgate-v7-production-native-launcher-attestation")) {
    return {
      claimFloodgateV7ProductionNativeLauncherAttestation(entrypoint) {
        exactEvents([]);
        if (entrypoint !== expectedEntrypoint) throw new Error(canary);
        events.push("claim");
      },
    };
  }
  if (request.endsWith("floodgate-v7-production-application-source-provenance")) {
    return {
      assertFloodgateV7ProductionApplicationEntrypointContext(entrypoint) {
        exactEvents(["claim"]);
        if (entrypoint !== expectedEntrypoint) throw new Error(canary);
        events.push("context");
      },
    };
  }
  if (request.endsWith("floodgate-v7-production-connector-verifier-readiness")) {
    if (mode === "load-must-not-happen") throw new Error(canary);
    exactEvents(["claim", "context"]);
    events.push("load");
    class KnownReadinessError extends Error {
      constructor() {
        super(canary);
        this.path = canary;
        this.revision = canary;
        this.digest = canary;
        this.effectiveUserId = 501;
        this.homeDirectory = canary;
      }
    }
    return {
      FloodgateV7ProductionConnectorVerifierReadinessError: KnownReadinessError,
      verifyFloodgateV7ProductionConnectorVerifierReadiness: async () => {
        exactEvents(["claim", "context", "load"]);
        events.push("call");
        if (mode === "known-failure") throw new KnownReadinessError();
        if (mode === "unknown-failure") throw new Error(canary);
        const receipt = validReceipt();
        if (mode === "bad-value") receipt.verification.closure_receipt_validated = false;
        if (mode === "proxy") {
          return new Proxy(receipt, {
            get(target, key, receiver) {
              if (key === "then") return undefined;
              throw new Error(canary);
            },
            ownKeys() { throw new Error(canary); },
          });
        }
        if (mode === "accessor") {
          Object.defineProperty(receipt, "status", {
            configurable: false,
            enumerable: true,
            get() { throw new Error(canary); },
          });
        }
        if (mode === "extra-string") receipt[canary] = canary;
        if (mode === "extra-symbol") receipt[Symbol(canary)] = canary;
        if (mode === "nonplain") Object.setPrototypeOf(receipt, { private: canary });
        if (mode === "nested-proxy") {
          receipt.nonclaims = new Proxy(receipt.nonclaims, {
            ownKeys() { throw new Error(canary); },
          });
        }
        if (mode === "reordered") {
          return {
            nonclaims: receipt.nonclaims,
            verification: receipt.verification,
            execution_boundary: receipt.execution_boundary,
            claim_boundary: receipt.claim_boundary,
            status: receipt.status,
            contract: receipt.contract,
          };
        }
        return receipt;
      },
    };
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
    env: cleanEnvironment(),
    timeout: 30_000,
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

function expectedFailure(): object {
  return {
    contract:
      FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLI_FAILURE_CONTRACT,
    status: "production-connector-verifier-readiness-did-not-issue-success",
    readiness_result: "NOT-READY",
    nonclaims: Object.fromEntries(PUBLIC_NONCLAIMS.map((key) => [key, false])),
    raw_failure_disclosed: false,
    private_values_disclosed: false,
    success_receipt_issued: false,
  };
}

describe("Floodgate v7 production connector verifier readiness CLI", () => {
  it("is import-only inert and has no static readiness-core import", () => {
    const source = fs.readFileSync(ENTRYPOINT, "utf8");
    expect(source).not.toMatch(
      /^import .*floodgate-v7-production-connector-verifier-readiness/mu,
    );
    const child = spawnSync(
      process.execPath,
      ["-r", "tsx/cjs", "-e", `require(${JSON.stringify(ENTRYPOINT)})`],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: cleanEnvironment(),
        timeout: 30_000,
      },
    );
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout).toBe("");
    expect(child.stderr).toBe("");
  });

  it.each([
    { arguments_: ["unexpected"], wrongRuntime: false },
    { arguments_: [], wrongRuntime: true },
  ])(
    "rejects argv/runtime before launcher claim or lazy core loading",
    (value) => {
      const child = runEntry(
        "load-must-not-happen",
        value.arguments_,
        value.wrongRuntime,
      );
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(1);
      expect(child.stdout).toBe("");
      expect(child.stderr).not.toContain(PRIVATE_CANARY);
      expect(JSON.parse(child.stderr)).toEqual(expectedFailure());
    },
  );

  it("claims the exact native purpose, asserts source context, then lazily loads and calls once", () => {
    const child = runEntry("success");
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    expect(child.stdout.trim().split("\n")).toHaveLength(1);
    expect(child.stdout).not.toContain(PRIVATE_CANARY);
  });

  it.each(["success", "reordered"] as const)(
    "rebuilds a canonical pathless readiness receipt from %s core fields",
    (mode) => {
      const child = runEntry(mode);
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(0);
      expect(child.stderr).toBe("");
      expect(child.stdout).not.toContain(PRIVATE_CANARY);
      expect(child.stdout).not.toContain(REPOSITORY_ROOT);
      const receipt = JSON.parse(child.stdout) as Record<string, unknown>;
      expect(Object.keys(receipt)).toEqual([
        "contract",
        "status",
        "claim_boundary",
        "execution_boundary",
        "verification",
        "nonclaims",
        "success_receipt_issued",
      ]);
      expect(receipt).toEqual({
        contract:
          FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLI_SUCCESS_CONTRACT,
        status: CORE_STATUS,
        claim_boundary: CORE_CLAIM_BOUNDARY,
        execution_boundary: CORE_EXECUTION_BOUNDARY,
        verification: {
          fixed_current_euid_home_repository_root: true,
          fixed_verifier_revision: true,
          pinned_receipt_git_closure_checked: true,
          closure_receipt_validated: true,
          sensitive_values_exported: false,
        },
        nonclaims: Object.fromEntries(
          PUBLIC_NONCLAIMS.map((key) => [key, false]),
        ),
        success_receipt_issued: true,
      });
    },
  );

  it.each(["known-failure", "unknown-failure"] as const)(
    "maps %s through the same non-disclosing failure contract",
    (mode) => {
      const child = runEntry(mode);
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(1);
      expect(child.stdout).toBe("");
      expect(child.stderr.trim().split("\n")).toHaveLength(1);
      expect(child.stderr).not.toContain(PRIVATE_CANARY);
      expect(child.stderr).not.toContain(REPOSITORY_ROOT);
      expect(JSON.parse(child.stderr)).toEqual(expectedFailure());
    },
  );

  it.each([
    "bad-value",
    "proxy",
    "accessor",
    "extra-string",
    "extra-symbol",
    "nonplain",
    "nested-proxy",
  ] as const)(
    "rejects adversarial receipt %s through one exact failure allowlist",
    (mode) => {
      const child = runEntry(mode);
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(1);
      expect(child.stdout).toBe("");
      expect(child.stderr).not.toContain(PRIVATE_CANARY);
      expect(child.stderr).not.toContain(REPOSITORY_ROOT);
      expect(JSON.parse(child.stderr)).toEqual(expectedFailure());
    },
  );

  it("settles a paired stream callback/error failure once", async () => {
    const stream = new FailingStream() as unknown as NodeJS.WriteStream;
    await expect(
      writeFloodgateV7ProductionConnectorVerifierReadinessOutputCoreForTests(
        stream,
        "safe\n",
      ),
    ).rejects.toThrow(PRIVATE_CANARY);
    expect(stream.listenerCount("error")).toBe(0);
  });
});
