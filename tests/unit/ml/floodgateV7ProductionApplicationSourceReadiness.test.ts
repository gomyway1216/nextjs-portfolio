import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CLAIM_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CLI_FAILURE_CONTRACT,
  FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CLI_SUCCESS_CONTRACT,
  FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CONTRACT,
  FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_EXECUTION_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_STATUS,
  inspectFloodgateV7ProductionApplicationSourceReadinessCoreForTests,
} from "../../../ml/inspect-floodgate-v7-production-application-source";

const SOURCE_LAYOUT =
  "fixed-current-euid-userinfo-home-production-application-v1" as const;
const REVISION = "d".repeat(40);
const PRIVATE_CANARY = "private-source-revision-path-digest-canary";
const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const ENTRYPOINT = path.join(
  REPOSITORY_ROOT,
  "ml/inspect-floodgate-v7-production-application-source.ts",
);

function cleanEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.TSX_TSCONFIG_PATH;
  return environment;
}

function runMockedEntry(mode: "success" | "source-failure") {
  const launcher = String.raw`
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request.endsWith("floodgate-v7-production-application-source-provenance")) {
    return {
      FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_LAYOUT: ${JSON.stringify(SOURCE_LAYOUT)},
      assertFloodgateV7ProductionApplicationEntrypointContext(expected) {
        if (expected !== "ml/inspect-floodgate-v7-production-application-source.ts") {
          throw new Error(${JSON.stringify(PRIVATE_CANARY)});
        }
      },
      async captureFloodgateV7ProductionApplicationSourceProvenance() {
        if (${JSON.stringify(mode)} === "source-failure") {
          throw new Error(${JSON.stringify(PRIVATE_CANARY)});
        }
        return Object.freeze(Object.assign(Object.create(null), {
          layout: ${JSON.stringify(SOURCE_LAYOUT)},
          revision: "d".repeat(40),
        }));
      },
    };
  }
  return Reflect.apply(originalLoad, this, [request, parent, isMain]);
};
process.argv = [process.execPath, ${JSON.stringify(ENTRYPOINT)}];
Module.runMain();
`;
  return spawnSync(process.execPath, ["-r", "tsx/cjs", "-e", launcher], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
    env: cleanEnvironment(),
    timeout: 30_000,
  });
}

describe("Floodgate v7 production application source readiness", () => {
  it("returns only a sanitized read-only readiness receipt", async () => {
    let captures = 0;
    const receipt =
      await inspectFloodgateV7ProductionApplicationSourceReadinessCoreForTests(
        async () => {
          captures += 1;
          return { layout: SOURCE_LAYOUT, revision: REVISION };
        },
      );

    expect(captures).toBe(1);
    expect(receipt).toEqual({
      contract: FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CONTRACT,
      status: FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_STATUS,
      claim_boundary:
        FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CLAIM_BOUNDARY,
      execution_boundary:
        FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_EXECUTION_BOUNDARY,
      verification: {
        fixed_current_euid_userinfo_home_repository_root: true,
        exact_clean_tracked_source_closure_rechecked: true,
        source_binding_captured_in_memory: true,
        filesystem_namespace_or_file_content_mutation_performed: false,
        sensitive_values_exported: false,
      },
      nonclaims: {
        application_source_revision_disclosed: false,
        application_source_path_disclosed: false,
        application_source_digest_disclosed: false,
        registry_created_loaded_or_modified: false,
        gate_or_deployment_authority: false,
        checkpoint: false,
        teacher_label: false,
        training: false,
        weight: false,
        live_evaluation_activation: false,
        match: false,
        playing_strength: false,
      },
    });
    expect(JSON.stringify(receipt)).not.toContain(REVISION);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.getPrototypeOf(receipt)).toBeNull();
  });

  it.each([
    null,
    { layout: SOURCE_LAYOUT, revision: "D".repeat(40) },
    { layout: "caller-selected", revision: REVISION },
    { layout: SOURCE_LAYOUT, revision: REVISION, path: PRIVATE_CANARY },
    new Proxy({ layout: SOURCE_LAYOUT, revision: REVISION }, {}),
  ])("fails closed for a malformed source binding", async (binding) => {
    await expect(
      inspectFloodgateV7ProductionApplicationSourceReadinessCoreForTests(
        async () => binding,
      ),
    ).rejects.toMatchObject({
      phase: "source-verification",
      source_ready: false,
      persistent_mutation_performed: false,
      sensitive_values_disclosed: false,
    });
  });

  it("rejects a proxied capture callback before invoking it", async () => {
    let called = false;
    const callback = new Proxy(async () => {
      called = true;
      return { layout: SOURCE_LAYOUT, revision: REVISION };
    }, {});
    await expect(
      inspectFloodgateV7ProductionApplicationSourceReadinessCoreForTests(
        callback,
      ),
    ).rejects.toMatchObject({ phase: "capture", source_ready: false });
    expect(called).toBe(false);
  });

  it("emits a sanitized CLI success without source identity", () => {
    const result = runMockedEntry("success");
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain(REVISION);
    expect(JSON.parse(result.stdout)).toMatchObject({
      contract:
        FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CLI_SUCCESS_CONTRACT,
      status: "fixed-application-source-readiness-observed",
      receipt: {
        verification: {
          exact_clean_tracked_source_closure_rechecked: true,
          sensitive_values_exported: false,
        },
      },
    });
  });

  it("emits a sanitized CLI failure without the raw source error", () => {
    const result = runMockedEntry("source-failure");
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(PRIVATE_CANARY);
    expect(JSON.parse(result.stderr)).toEqual({
      contract:
        FLOODGATE_V7_PRODUCTION_APPLICATION_SOURCE_READINESS_CLI_FAILURE_CONTRACT,
      status: "fixed-application-source-readiness-did-not-issue-success",
      phase: "source-verification",
      source_ready: false,
      persistent_mutation_performed: false,
      sensitive_values_disclosed: false,
    });
  });
});
