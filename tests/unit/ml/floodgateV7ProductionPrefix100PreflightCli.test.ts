import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_PREFIX_100_PREFLIGHT_CLI_FAILURE_CONTRACT,
  FLOODGATE_V7_PREFIX_100_PREFLIGHT_CLI_SUCCESS_CONTRACT,
  writeFloodgateV7ProductionPrefix100PreflightOutputCoreForTests,
} from "../../../ml/inspect-floodgate-v7-production-prefix-100-preflight";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const ENTRY_PATH = path.join(
  REPOSITORY_ROOT,
  "ml/inspect-floodgate-v7-production-prefix-100-preflight.ts",
);
const PRIVATE_CANARY = "private-preflight-canary-must-not-be-public";

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
    | "typed"
    | "typed-readiness"
    | "typed-application-source"
    | "old-v2"
    | "throw"
    | "proxy"
    | "accessor"
    | "extra-string"
    | "extra-symbol"
    | "nonplain"
    | "load-must-not-happen",
  arguments_: readonly string[] = [],
  wrongRuntime = false,
): SpawnSyncReturns<string> {
  const launcher = String.raw`
const Module = require("node:module");
const originalLoad = Module._load;
const canary = ${JSON.stringify(PRIVATE_CANARY)};
const expectedEntrypoint = "ml/inspect-floodgate-v7-production-prefix-100-preflight.ts";
const verificationKeys = ${JSON.stringify([
    "common_os_lock_acquired_nonblocking",
    "common_os_lock_held_through_all_checks",
    "registry_anchor_held_descriptor_and_bytes_revalidated",
    "private_registry_claimed_and_fixed_configuration_validated",
    "application_source_binding_matched_to_exact_clean_tracked_application_closure",
    "verifier_source_artifact_closure_rechecked",
    "deployment_key_metadata_ready",
    "approved_enrollment_loaded_and_registry_binding_matched",
    "fresh_current_key_binding_validated",
    "registry_root_and_runs_parent_held_descriptors_revalidated",
    "runs_parent_current_euid_exact_0700_and_empty_twice",
    "stage_destination_authorization_lease_and_work_absent_twice",
    "outer_control_absent_or_exact_empty_twice",
    "filesystem_namespace_or_file_content_mutation_performed",
    "common_os_lock_released_before_receipt",
  ])};
const nonclaimKeys = ${JSON.stringify([
    "path_run_id_record_digest_key_instance_uid_or_inode_disclosed",
    "key_material_or_raw_error_disclosed",
    "registry_or_control_created_written_removed",
    "stage_checkpoint_or_authorization_lease_created_written_removed",
    "registry_or_approved_capability_returned",
    "application_source_revision_disclosed",
    "application_source_path_disclosed",
    "application_source_digest_disclosed",
    "ignored_untracked_dependency_bytes_verified",
    "same_uid_race_isolation",
    "atomic_source_snapshot",
    "reviewed_git_head_or_ci_status",
    "kill_reboot_drill_or_monitor_owner",
    "human_gate_approval",
    "gate_invoked",
    "checkpoint",
    "dataset_read",
    "teacher_label",
    "training",
    "weight",
    "live_evaluation_activation",
    "match",
    "playing_strength",
  ])};
Module._load = function(request, parent, isMain) {
  if (request.endsWith("floodgate-v7-production-application-source-provenance")) {
    return {
      assertFloodgateV7ProductionApplicationEntrypointContext: (entrypoint) => {
        if (entrypoint !== expectedEntrypoint) throw new Error(canary);
      },
    };
  }
  if (request.endsWith("floodgate-v7-production-prefix-100-preflight")) {
    if (${JSON.stringify(mode)} === "load-must-not-happen") throw new Error(canary);
    class PreflightError extends Error {
      constructor() {
        super("sanitized preflight failure");
        this.decision = "NO-GO";
        this.gate = "durable-prefix-100";
        this.phase = ${JSON.stringify(mode)} === "typed-readiness"
          ? "verifier-readiness"
          : ${JSON.stringify(mode)} === "typed-application-source"
            ? "application-source"
            : "outer-control";
        this.os_lock_acquired = true;
        this.os_lock_released = true;
        this.persistent_mutation_performed = false;
        this.gate_invoked = false;
        this.retry_disposition = "operator-reconciliation-required-no-gate";
      }
    }
    return {
      FloodgateV7ProductionPrefix100PreflightError: PreflightError,
      inspectFloodgateV7ProductionPrefix100Preflight: async () => {
        if (${JSON.stringify(mode)} === "typed" || ${JSON.stringify(mode)} === "typed-readiness" || ${JSON.stringify(mode)} === "typed-application-source") throw new PreflightError();
        if (${JSON.stringify(mode)} === "throw") throw new Error(canary);
        const receipt = {
          contract: "shogi-floodgate-v7-production-prefix-100-read-only-preflight-v3",
          status: "fresh-zero-work-application-source-bound-prefix-100-read-only-preconditions-observed",
          claim_boundary: "point-in-time-fixed-current-user-exact-clean-tracked-application-source-bound-read-only-observation-without-gate-authority-or-persistent-mutation-v3",
          execution_boundary: "production-fixed-current-euid-userinfo-home-application-source-bound-common-os-lock",
          gate: "durable-prefix-100",
          decision: {
            result: "GO",
            scope: "read-only-core-preconditions-only",
            gate_invocation_authorized: false,
          },
          outer_control: "absent-pristine",
          verification: Object.fromEntries(verificationKeys.map((key) => [key, key === "filesystem_namespace_or_file_content_mutation_performed" ? false : true])),
          nonclaims: Object.fromEntries(nonclaimKeys.map((key) => [key, false])),
        };
        if (${JSON.stringify(mode)} === "old-v2") {
          receipt.contract = "shogi-floodgate-v7-production-prefix-100-read-only-preflight-v2";
          receipt.status = "fresh-zero-work-prefix-100-read-only-preconditions-observed";
          receipt.claim_boundary = "point-in-time-fixed-current-user-read-only-observation-without-gate-authority-or-persistent-mutation-v2";
          receipt.execution_boundary = "production-fixed-current-euid-userinfo-home-common-os-lock";
        }
        if (${JSON.stringify(mode)} === "bad") receipt.decision.gate_invocation_authorized = true;
        if (${JSON.stringify(mode)} === "proxy") {
          return new Proxy(receipt, {
            get(target, key, receiver) {
              if (key === "then") return undefined;
              throw new Error(canary);
            },
            ownKeys() { throw new Error(canary); },
          });
        }
        if (${JSON.stringify(mode)} === "accessor") {
          Object.defineProperty(receipt, "status", {
            configurable: false,
            enumerable: true,
            get() { throw new Error(canary); },
          });
        }
        if (${JSON.stringify(mode)} === "extra-string") receipt[canary] = canary;
        if (${JSON.stringify(mode)} === "extra-symbol") receipt[Symbol(canary)] = canary;
        if (${JSON.stringify(mode)} === "nonplain") Object.setPrototypeOf(receipt, { private: canary });
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

describe("Floodgate v7 production prefix-100 preflight CLI", () => {
  it("is import-only inert and has no static implementation import", () => {
    const source = fs.readFileSync(ENTRY_PATH, "utf8");
    expect(source).not.toMatch(
      /^import .*floodgate-v7-production-prefix-100-preflight/mu,
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
    expect(JSON.parse(child.stderr)).toEqual({
      contract: FLOODGATE_V7_PREFIX_100_PREFLIGHT_CLI_FAILURE_CONTRACT,
      status: "fresh-prefix-100-preflight-did-not-issue-go",
      gate: "durable-prefix-100",
      decision: "NO-GO",
      phase: "capture",
      retry_disposition: "fix-environment-then-fresh-preflight",
      persistent_mutation_performed: false,
      gate_invoked: false,
      raw_failure_disclosed: false,
      private_values_disclosed: false,
      success_receipt_issued: false,
    });
  });

  it("rebuilds an exact read-only GO receipt without gate authority", () => {
    const child = runEntry("success");
    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    expect(child.stdout).not.toContain(PRIVATE_CANARY);
    const receipt = JSON.parse(child.stdout);
    expect(receipt).toMatchObject({
      contract: FLOODGATE_V7_PREFIX_100_PREFLIGHT_CLI_SUCCESS_CONTRACT,
      status:
        "fresh-zero-work-application-source-bound-prefix-100-read-only-preconditions-observed",
      gate: "durable-prefix-100",
      decision: {
        result: "GO",
        scope: "read-only-core-preconditions-only",
        gate_invocation_authorized: false,
      },
      outer_control: "absent-pristine",
      success_receipt_issued: true,
    });
    expect(
      receipt.verification
        .filesystem_namespace_or_file_content_mutation_performed,
    ).toBe(false);
    expect(new Set(Object.values(receipt.nonclaims))).toEqual(new Set([false]));
  });

  it("projects a typed NO-GO without private fields", () => {
    const child = runEntry("typed");
    expect(child.status).toBe(1);
    expect(child.stdout).toBe("");
    expect(child.stderr).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(child.stderr)).toMatchObject({
      contract: FLOODGATE_V7_PREFIX_100_PREFLIGHT_CLI_FAILURE_CONTRACT,
      decision: "NO-GO",
      phase: "outer-control",
      retry_disposition: "operator-reconciliation-required-no-gate",
      persistent_mutation_performed: false,
      gate_invoked: false,
      raw_failure_disclosed: false,
    });
  });

  it("projects verifier-readiness as a typed retryable NO-GO", () => {
    const child = runEntry("typed-readiness");
    expect(child.status).toBe(1);
    expect(child.stdout).toBe("");
    expect(child.stderr).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(child.stderr)).toMatchObject({
      contract: FLOODGATE_V7_PREFIX_100_PREFLIGHT_CLI_FAILURE_CONTRACT,
      decision: "NO-GO",
      phase: "verifier-readiness",
      persistent_mutation_performed: false,
      gate_invoked: false,
      raw_failure_disclosed: false,
    });
  });

  it("projects application-source as a typed retryable NO-GO", () => {
    const child = runEntry("typed-application-source");
    expect(child.status).toBe(1);
    expect(child.stdout).toBe("");
    expect(child.stderr).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(child.stderr)).toMatchObject({
      contract: FLOODGATE_V7_PREFIX_100_PREFLIGHT_CLI_FAILURE_CONTRACT,
      decision: "NO-GO",
      phase: "application-source",
      persistent_mutation_performed: false,
      gate_invoked: false,
      raw_failure_disclosed: false,
    });
  });

  it.each(["bad", "throw"] as const)(
    "sanitizes %s receipt or unknown failure",
    (mode) => {
      const child = runEntry(mode);
      expect(child.status).toBe(1);
      expect(child.stdout).toBe("");
      expect(child.stderr).not.toContain(PRIVATE_CANARY);
      expect(JSON.parse(child.stderr)).toMatchObject({
        contract: FLOODGATE_V7_PREFIX_100_PREFLIGHT_CLI_FAILURE_CONTRACT,
        decision: "NO-GO",
        persistent_mutation_performed: false,
        gate_invoked: false,
        success_receipt_issued: false,
      });
    },
  );

  it("rejects a historical v2 GO receipt at the v3 CLI boundary", () => {
    const child = runEntry("old-v2");
    expect(child.status).toBe(1);
    expect(child.stdout).toBe("");
    expect(JSON.parse(child.stderr)).toMatchObject({
      contract: FLOODGATE_V7_PREFIX_100_PREFLIGHT_CLI_FAILURE_CONTRACT,
      decision: "NO-GO",
      phase: "capture",
      success_receipt_issued: false,
    });
  });

  it.each([
    "proxy",
    "accessor",
    "extra-string",
    "extra-symbol",
    "nonplain",
  ] as const)(
    "rejects adversarial public receipt %s through one pathless failure boundary",
    (mode) => {
      const child = runEntry(mode);
      expect(child.status).toBe(1);
      expect(child.stdout).toBe("");
      expect(child.stderr).not.toContain(PRIVATE_CANARY);
      expect(child.stderr).not.toContain(REPOSITORY_ROOT);
      expect(child.stderr.trim().split("\n")).toHaveLength(1);
      expect(JSON.parse(child.stderr)).toEqual({
        contract: FLOODGATE_V7_PREFIX_100_PREFLIGHT_CLI_FAILURE_CONTRACT,
        status: "fresh-prefix-100-preflight-did-not-issue-go",
        gate: "durable-prefix-100",
        decision: "NO-GO",
        phase: "capture",
        retry_disposition: "fix-environment-then-fresh-preflight",
        persistent_mutation_performed: false,
        gate_invoked: false,
        raw_failure_disclosed: false,
        private_values_disclosed: false,
        success_receipt_issued: false,
      });
    },
  );

  it("settles a paired stream callback/error failure once", async () => {
    const stream = new FailingStream() as unknown as NodeJS.WriteStream;
    await expect(
      writeFloodgateV7ProductionPrefix100PreflightOutputCoreForTests(
        stream,
        "safe\n",
      ),
    ).rejects.toThrow(PRIVATE_CANARY);
    expect(stream.listenerCount("error")).toBe(0);
  });
});
