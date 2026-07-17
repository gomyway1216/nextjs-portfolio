import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as foundation from "../../../ml/floodgate-v7-production-recovery-operator-foundation";

const repositoryRoot = path.resolve(__dirname, "../../..");
const foundationRelative =
  "ml/floodgate-v7-production-recovery-operator-foundation.ts";
const removedOperationalPaths = [
  "ml/helpers/floodgate-v7-production-recovery-operator-native-launcher.jxa",
  "ml/inspect-floodgate-v7-production-stale-prefix-100-recovery.ts",
  "ml/floodgate-v7-production-recovery-operator-native-launcher-attestation.ts",
  "ml/floodgate-v7-production-recovery-operator-source-authorization.ts",
  "ml/floodgate-v7-production-recovery-operator-source-provenance.ts",
  "tests/fixtures/ml/floodgate-v7-production-recovery-operator-native-launcher-child.ts",
  "tests/fixtures/ml/floodgate-v7-production-recovery-operator-native-launcher-test.jxa",
] as const;

describe("Floodgate v7 non-operational recovery foundation", () => {
  it("has no package-script or repository launcher path", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const scripts = Object.entries(packageJson.scripts ?? {});

    expect(
      scripts.filter(
        ([name, command]) =>
          name.includes("production-recovery") ||
          command.includes("production-recovery"),
      ),
    ).toEqual([]);
    for (const relativePath of removedOperationalPaths) {
      expect(fs.existsSync(path.join(repositoryRoot, relativePath))).toBe(false);
    }
  });

  it("exports only a pure contract, external requirement, and STOP reader", () => {
    expect(Object.keys(foundation).sort()).toEqual([
      "FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_FOUNDATION_CONTRACT",
      "FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_REQUIRED_EXTERNAL_ATTESTATION_CONTRACT",
      "readFloodgateV7ProductionRecoveryOperatorUnavailableStop",
    ]);

    const source = fs.readFileSync(
      path.join(repositoryRoot, foundationRelative),
      "utf8",
    );
    expect(source).not.toMatch(/^import\s/imu);
    expect(source).not.toContain("require(");
    expect(source).not.toContain("process.");
    expect(source).not.toContain("node:");
    expect(source).not.toContain("tsx/cjs");
    expect(source).not.toContain("osascript");
    expect(source).not.toContain("WeakMap");
    expect(source).not.toContain("authorizeFloodgate");
    expect(source).not.toContain("claimFloodgate");
  });

  it("returns one immutable unavailable STOP marker with zero authority", () => {
    const stop =
      foundation.readFloodgateV7ProductionRecoveryOperatorUnavailableStop();

    expect(Object.isFrozen(stop)).toBe(true);
    expect(
      foundation.readFloodgateV7ProductionRecoveryOperatorUnavailableStop(),
    ).toBe(stop);
    expect(stop).toEqual({
      contract:
        "shogi-floodgate-v7-production-recovery-operator-non-operational-foundation-v1",
      status: "UNAVAILABLE",
      decision: "STOP",
      future_purpose: "inspect-stale-prefix-100",
      required_external_attestation_contract:
        "shogi-floodgate-v7-production-recovery-operator-external-approved-commit-tree-attestation-v1",
      operational_entrypoint_available: false,
      production_issuer_available: false,
      repository_self_authorization_available: false,
      external_trust_root_installed: false,
      approved_revision_enrolled: false,
      approved_tree_enrolled: false,
      source_authorized: false,
      production_state_inspected: false,
      registry_accessed: false,
      lease_accessed: false,
      stage_accessed: false,
      work_accessed: false,
      deployment_key_accessed: false,
      persistent_mutation_performed: false,
      live_weight_changed: false,
      sensitive_values_disclosed: false,
    });
  });
});
