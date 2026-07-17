import { describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_PRODUCTION_APPLICATION_EXECUTION_CAPABILITY_CONTRACT,
  FLOODGATE_V7_PRODUCTION_APPLICATION_EXECUTION_CAPABILITY_STATUS,
  FLOODGATE_V7_PRODUCTION_REGISTRY_PROVISIONER_CONTINUATION_CONTRACT,
  FLOODGATE_V7_PRODUCTION_REGISTRY_PROVISIONER_CONTINUATION_STATUS,
  armFloodgateV7ProductionRegistryInstallerApplicationExecution,
  armFloodgateV7ProductionRegistryInstallerApplicationExecutionCoreForTests,
  authorizeFloodgateV7ProductionApplicationExecutionCoreForTests,
  claimFloodgateV7ProductionApplicationExecution,
  claimFloodgateV7ProductionApplicationExecutionCoreForTests,
  claimFloodgateV7ProductionRegistryProvisionerApplicationExecutionCoreForTests,
  revokeFloodgateV7ProductionApplicationExecutionCoreForTests,
  revokeFloodgateV7ProductionRegistryProvisionerContinuationCoreForTests,
} from "../../../ml/floodgate-v7-production-application-source-authorization";

const LAYOUT =
  "fixed-current-euid-userinfo-home-production-application-v1" as const;
const REVISION = "d".repeat(40);
const PURPOSES = [
  "durable-prefix-100",
  "durable-prefix-500",
  "sealed-final-24000",
  "training-label-finalization-24000",
  "production-registry-provision",
] as const;

describe("Floodgate v7 production application source authorization", () => {
  it.each(PURPOSES)(
    "mints one opaque %s capability only after a fresh source capture",
    async (purpose) => {
      let captures = 0;
      const capability =
        await authorizeFloodgateV7ProductionApplicationExecutionCoreForTests(
          purpose,
          async () => {
            captures += 1;
            return { layout: LAYOUT, revision: REVISION };
          },
        );

      expect(captures).toBe(1);
      expect(capability).toEqual({
        contract:
          FLOODGATE_V7_PRODUCTION_APPLICATION_EXECUTION_CAPABILITY_CONTRACT,
        status: FLOODGATE_V7_PRODUCTION_APPLICATION_EXECUTION_CAPABILITY_STATUS,
      });
      expect(Object.getPrototypeOf(capability)).toBeNull();
      expect(Object.isFrozen(capability)).toBe(true);
      expect(JSON.stringify(capability)).not.toContain(REVISION);

      if (purpose === "production-registry-provision") {
        const continuation =
          claimFloodgateV7ProductionRegistryProvisionerApplicationExecutionCoreForTests(
            capability,
          );
        const installerCapability =
          armFloodgateV7ProductionRegistryInstallerApplicationExecutionCoreForTests(
            continuation,
          );
        expect(installerCapability).not.toBe(capability);
        claimFloodgateV7ProductionApplicationExecutionCoreForTests(
          installerCapability,
          purpose,
          "installer",
        );
        expect(() =>
          claimFloodgateV7ProductionApplicationExecutionCoreForTests(
            installerCapability,
            purpose,
            "installer",
          ),
        ).toThrow("authorization failed");
      } else {
        claimFloodgateV7ProductionApplicationExecutionCoreForTests(
          capability,
          purpose,
          "runner-entry",
        );
        claimFloodgateV7ProductionApplicationExecutionCoreForTests(
          capability,
          purpose,
          "outer-owner",
        );
        expect(() =>
          claimFloodgateV7ProductionApplicationExecutionCoreForTests(
            capability,
            purpose,
            "outer-owner",
          ),
        ).toThrow("authorization failed");
      }
    },
  );

  it("consumes the registry bootstrap synchronously and late-arms one distinct isolated installer capability", async () => {
    const bootstrap =
      await authorizeFloodgateV7ProductionApplicationExecutionCoreForTests(
        "production-registry-provision",
        async () => ({ layout: LAYOUT, revision: REVISION }),
      );
    const continuation =
      claimFloodgateV7ProductionRegistryProvisionerApplicationExecutionCoreForTests(
        bootstrap,
      );

    expect(continuation).toEqual({
      contract:
        FLOODGATE_V7_PRODUCTION_REGISTRY_PROVISIONER_CONTINUATION_CONTRACT,
      status: FLOODGATE_V7_PRODUCTION_REGISTRY_PROVISIONER_CONTINUATION_STATUS,
    });
    expect(Object.getPrototypeOf(continuation)).toBeNull();
    expect(Object.isFrozen(continuation)).toBe(true);
    expect(() =>
      claimFloodgateV7ProductionApplicationExecutionCoreForTests(
        bootstrap,
        "production-registry-provision",
        "installer",
      ),
    ).toThrow("authorization failed");
    expect(() =>
      armFloodgateV7ProductionRegistryInstallerApplicationExecution(
        continuation,
      ),
    ).toThrow("authorization failed");
    for (const transformed of [
      { ...continuation },
      new Proxy(continuation, {}),
    ]) {
      expect(() =>
        armFloodgateV7ProductionRegistryInstallerApplicationExecutionCoreForTests(
          transformed,
        ),
      ).toThrow("authorization failed");
    }

    const installerCapability =
      armFloodgateV7ProductionRegistryInstallerApplicationExecutionCoreForTests(
        continuation,
      );
    expect(installerCapability).not.toBe(bootstrap);
    expect(() =>
      armFloodgateV7ProductionRegistryInstallerApplicationExecutionCoreForTests(
        continuation,
      ),
    ).toThrow("authorization failed");
    claimFloodgateV7ProductionApplicationExecutionCoreForTests(
      installerCapability,
      "production-registry-provision",
      "installer",
    );
  });

  it("idempotently revokes both an unarmed continuation and an unclaimed installer capability", async () => {
    const firstBootstrap =
      await authorizeFloodgateV7ProductionApplicationExecutionCoreForTests(
        "production-registry-provision",
        async () => ({ layout: LAYOUT, revision: REVISION }),
      );
    const revokedContinuation =
      claimFloodgateV7ProductionRegistryProvisionerApplicationExecutionCoreForTests(
        firstBootstrap,
      );
    revokeFloodgateV7ProductionRegistryProvisionerContinuationCoreForTests(
      revokedContinuation,
    );
    revokeFloodgateV7ProductionRegistryProvisionerContinuationCoreForTests(
      revokedContinuation,
    );
    expect(() =>
      armFloodgateV7ProductionRegistryInstallerApplicationExecutionCoreForTests(
        revokedContinuation,
      ),
    ).toThrow("authorization failed");

    const secondBootstrap =
      await authorizeFloodgateV7ProductionApplicationExecutionCoreForTests(
        "production-registry-provision",
        async () => ({ layout: LAYOUT, revision: REVISION }),
      );
    const continuation =
      claimFloodgateV7ProductionRegistryProvisionerApplicationExecutionCoreForTests(
        secondBootstrap,
      );
    const revokedInstaller =
      armFloodgateV7ProductionRegistryInstallerApplicationExecutionCoreForTests(
        continuation,
      );
    revokeFloodgateV7ProductionApplicationExecutionCoreForTests(
      revokedInstaller,
    );
    revokeFloodgateV7ProductionApplicationExecutionCoreForTests(
      revokedInstaller,
    );
    expect(() =>
      claimFloodgateV7ProductionApplicationExecutionCoreForTests(
        revokedInstaller,
        "production-registry-provision",
        "installer",
      ),
    ).toThrow("authorization failed");
  });

  it("rejects wrong order and permanently consumes the failed capability", async () => {
    const capability =
      await authorizeFloodgateV7ProductionApplicationExecutionCoreForTests(
        "durable-prefix-100",
        async () => ({ layout: LAYOUT, revision: REVISION }),
      );
    expect(() =>
      claimFloodgateV7ProductionApplicationExecutionCoreForTests(
        capability,
        "durable-prefix-100",
        "outer-owner",
      ),
    ).toThrow("authorization failed");
    expect(() =>
      claimFloodgateV7ProductionApplicationExecutionCoreForTests(
        capability,
        "durable-prefix-100",
        "runner-entry",
      ),
    ).toThrow("authorization failed");
  });

  it.each([
    ["clone", (value: object) => ({ ...value })],
    ["proxy", (value: object) => new Proxy(value, {})],
  ] as const)("rejects a capability %s", async (_label, transform) => {
    const capability =
      await authorizeFloodgateV7ProductionApplicationExecutionCoreForTests(
        "production-registry-provision",
        async () => ({ layout: LAYOUT, revision: REVISION }),
      );
    expect(() =>
      claimFloodgateV7ProductionApplicationExecutionCoreForTests(
        transform(capability) as typeof capability,
        "production-registry-provision",
        "provisioner",
      ),
    ).toThrow("authorization failed");
  });

  it("keeps production and test capability registries separate", async () => {
    const capability =
      await authorizeFloodgateV7ProductionApplicationExecutionCoreForTests(
        "durable-prefix-500",
        async () => ({ layout: LAYOUT, revision: REVISION }),
      );
    expect(() =>
      claimFloodgateV7ProductionApplicationExecution(
        capability,
        "durable-prefix-500",
        "runner-entry",
      ),
    ).toThrow("authorization failed");
    claimFloodgateV7ProductionApplicationExecutionCoreForTests(
      capability,
      "durable-prefix-500",
      "runner-entry",
    );
  });

  it.each([
    null,
    { layout: LAYOUT, revision: "D".repeat(40) },
    { layout: "caller-selected", revision: REVISION },
    { layout: LAYOUT, revision: REVISION, path: "/private/canary" },
    new Proxy({ layout: LAYOUT, revision: REVISION }, {}),
  ])(
    "does not issue a capability for malformed source evidence",
    async (value) => {
      await expect(
        authorizeFloodgateV7ProductionApplicationExecutionCoreForTests(
          "sealed-final-24000",
          async () => value,
        ),
      ).rejects.toMatchObject({
        phase: "source-verification",
        capability_issued: false,
        persistent_mutation_performed: false,
        sensitive_values_disclosed: false,
      });
    },
  );

  it("rejects a proxied capture callback without invoking it", async () => {
    let invoked = false;
    const callback = new Proxy(async () => {
      invoked = true;
      return { layout: LAYOUT, revision: REVISION };
    }, {});
    await expect(
      authorizeFloodgateV7ProductionApplicationExecutionCoreForTests(
        "training-label-finalization-24000",
        callback,
      ),
    ).rejects.toMatchObject({ phase: "capture", capability_issued: false });
    expect(invoked).toBe(false);
  });
});
