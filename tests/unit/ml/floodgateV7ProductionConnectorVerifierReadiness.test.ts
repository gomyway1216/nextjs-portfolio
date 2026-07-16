import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLAIM_BOUNDARY,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_STATUS,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION,
  FloodgateV7ProductionConnectorVerifierReadinessError,
  assertFloodgateV7ProductionConnectorVerifierReadinessIdentityBinding,
  verifyFloodgateV7ProductionConnectorVerifierReadiness,
  verifyFloodgateV7ProductionConnectorVerifierReadinessCoreForTests,
  type FloodgateV7ProductionConnectorVerifierReadinessDependenciesForTests,
} from "../../../ml/floodgate-v7-production-connector-verifier-readiness";

const TEST_HOME = path.resolve(
  path.join(os.tmpdir(), "floodgate-v7-verifier-readiness-private-home"),
);
const EXPECTED_REPOSITORY_ROOT = path.join(
  TEST_HOME,
  ".codex",
  "worktrees",
  "shogi-floodgate-role-bundle",
);
const TEST_EFFECTIVE_USER_ID = 73_501;
const PRIVATE_DIGEST = "ab".repeat(32);
type ClosureOptions = Parameters<
  FloodgateV7ProductionConnectorVerifierReadinessDependenciesForTests["assertPinnedReceiptGitClosure"]
>[0];

function dependencies(
  assertPinnedReceiptGitClosure: FloodgateV7ProductionConnectorVerifierReadinessDependenciesForTests["assertPinnedReceiptGitClosure"] = async () =>
    undefined,
): FloodgateV7ProductionConnectorVerifierReadinessDependenciesForTests {
  return {
    effectiveUserId: TEST_EFFECTIVE_USER_ID,
    homeDirectory: TEST_HOME,
    assertPinnedReceiptGitClosure,
  };
}

function assertDeepFrozenNullPrototype(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.getPrototypeOf(value)).toBeNull();
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) {
    assertDeepFrozenNullPrototype(child);
  }
}

async function capturedError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(
      FloodgateV7ProductionConnectorVerifierReadinessError,
    );
    return error as Error;
  }
  throw new Error("expected verifier readiness to reject");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("node:os");
  vi.doUnmock("../../../ml/floodgate-role-bundle-result");
  vi.resetModules();
});

describe("Floodgate v7 production connector verifier readiness", () => {
  it("checks the one fixed home-relative repository and pinned revision exactly once", async () => {
    const closure = vi.fn(async (_options: ClosureOptions) => undefined);

    const receipt =
      await verifyFloodgateV7ProductionConnectorVerifierReadinessCoreForTests(
        dependencies(closure),
      );

    expect(closure).toHaveBeenCalledTimes(1);
    const options = closure.mock.calls[0]?.[0];
    expect(options).toEqual({
      repositoryRoot: EXPECTED_REPOSITORY_ROOT,
      verifierRevision: FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION,
    });
    expect(Reflect.ownKeys(options ?? {})).toEqual([
      "repositoryRoot",
      "verifierRevision",
    ]);
    expect(Object.getPrototypeOf(options)).toBe(Object.prototype);
    expect(Object.isFrozen(options)).toBe(true);
    expect(receipt).toEqual({
      contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CONTRACT,
      status: FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_STATUS,
      claim_boundary:
        FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_READINESS_CLAIM_BOUNDARY,
      execution_boundary:
        "test-only-injected-current-euid-home-role-bundle-receipt-git-closure",
      verification: {
        fixed_current_euid_home_repository_root: true,
        fixed_verifier_revision: true,
        pinned_receipt_git_closure_checked: true,
        closure_receipt_validated: true,
        sensitive_values_exported: false,
      },
      nonclaims: {
        external_role_bundle_files_read: false,
        full_role_bundle_verifier_run: false,
        gate_authority: false,
        registry_authority: false,
        connector_authority: false,
        teacher_label: false,
        training: false,
        weight: false,
        live_evaluation_activation: false,
        playing_strength: false,
        path_disclosed: false,
        revision_disclosed: false,
        digest_disclosed: false,
        private_identity_disclosed: false,
      },
    });
    assertDeepFrozenNullPrototype(receipt);
    expect(() =>
      assertFloodgateV7ProductionConnectorVerifierReadinessIdentityBinding(
        receipt,
        TEST_EFFECTIVE_USER_ID,
        TEST_HOME,
      ),
    ).not.toThrow();
    expect(() =>
      assertFloodgateV7ProductionConnectorVerifierReadinessIdentityBinding(
        receipt,
        TEST_EFFECTIVE_USER_ID,
        TEST_HOME,
      ),
    ).toThrow(FloodgateV7ProductionConnectorVerifierReadinessError);
  });

  it("fails closed and consumes the private binding when the caller identity differs", async () => {
    const receipt =
      await verifyFloodgateV7ProductionConnectorVerifierReadinessCoreForTests(
        dependencies(),
      );
    expect(() =>
      assertFloodgateV7ProductionConnectorVerifierReadinessIdentityBinding(
        receipt,
        TEST_EFFECTIVE_USER_ID,
        `${TEST_HOME}-different`,
      ),
    ).toThrow(FloodgateV7ProductionConnectorVerifierReadinessError);
    expect(() =>
      assertFloodgateV7ProductionConnectorVerifierReadinessIdentityBinding(
        receipt,
        TEST_EFFECTIVE_USER_ID,
        TEST_HOME,
      ),
    ).toThrow(FloodgateV7ProductionConnectorVerifierReadinessError);
    expect(() =>
      assertFloodgateV7ProductionConnectorVerifierReadinessIdentityBinding(
        { ...receipt },
        TEST_EFFECTIVE_USER_ID,
        TEST_HOME,
      ),
    ).toThrow(FloodgateV7ProductionConnectorVerifierReadinessError);
  });

  it("returns only an exact sanitized non-authorizing receipt", async () => {
    const receipt =
      await verifyFloodgateV7ProductionConnectorVerifierReadinessCoreForTests(
        dependencies(),
      );
    const serialized = JSON.stringify(receipt);

    expect(Reflect.ownKeys(receipt)).toEqual([
      "contract",
      "status",
      "claim_boundary",
      "execution_boundary",
      "verification",
      "nonclaims",
    ]);
    expect(Reflect.ownKeys(receipt.verification)).toEqual([
      "fixed_current_euid_home_repository_root",
      "fixed_verifier_revision",
      "pinned_receipt_git_closure_checked",
      "closure_receipt_validated",
      "sensitive_values_exported",
    ]);
    expect(Reflect.ownKeys(receipt.nonclaims)).toEqual([
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
    ]);
    expect(serialized).not.toContain(TEST_HOME);
    expect(serialized).not.toContain(EXPECTED_REPOSITORY_ROOT);
    expect(serialized).not.toContain(
      FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION,
    );
    expect(serialized).not.toContain(PRIVATE_DIGEST);
    expect(serialized).not.toContain(String(TEST_EFFECTIVE_USER_ID));
  });

  it.each([
    null,
    false,
    0,
    "",
    {},
    Object.freeze({ status: "checked" }),
    new Proxy({ status: "checked" }, {}),
  ])("rejects a malformed non-void closure fulfillment %#", async (value) => {
    const closure = vi.fn(async (): Promise<unknown> => value);

    await expect(
      verifyFloodgateV7ProductionConnectorVerifierReadinessCoreForTests(
        dependencies(closure),
      ),
    ).rejects.toBeInstanceOf(
      FloodgateV7ProductionConnectorVerifierReadinessError,
    );
    expect(closure).toHaveBeenCalledTimes(1);
  });

  it("sanitizes closure rejection details and does not retry", async () => {
    const privateMessage = `${EXPECTED_REPOSITORY_ROOT}:${FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION}:${PRIVATE_DIGEST}`;
    const closure = vi.fn(async () => {
      throw new Error(privateMessage);
    });

    const error = await capturedError(
      verifyFloodgateV7ProductionConnectorVerifierReadinessCoreForTests(
        dependencies(closure),
      ),
    );

    expect(closure).toHaveBeenCalledTimes(1);
    expect(String(error)).not.toContain(privateMessage);
    expect(error.message).not.toContain(EXPECTED_REPOSITORY_ROOT);
    expect(error.stack).not.toContain(
      FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION,
    );
    expect(error.stack).not.toContain(PRIVATE_DIGEST);
    expect(Object.prototype.hasOwnProperty.call(error, "cause")).toBe(false);
    expect(Object.isFrozen(error)).toBe(true);
  });

  it("rejects dependency and callback Proxies before invoking the closure", async () => {
    const closure = vi.fn(async () => undefined);
    const proxiedDependencies = new Proxy(dependencies(closure), {});

    await expect(
      verifyFloodgateV7ProductionConnectorVerifierReadinessCoreForTests(
        proxiedDependencies,
      ),
    ).rejects.toBeInstanceOf(
      FloodgateV7ProductionConnectorVerifierReadinessError,
    );
    expect(closure).not.toHaveBeenCalled();

    const proxiedClosure = new Proxy(closure, {});
    await expect(
      verifyFloodgateV7ProductionConnectorVerifierReadinessCoreForTests(
        dependencies(proxiedClosure),
      ),
    ).rejects.toBeInstanceOf(
      FloodgateV7ProductionConnectorVerifierReadinessError,
    );
    expect(closure).not.toHaveBeenCalled();
  });

  it("rejects accessors without evaluating them", async () => {
    const closure = vi.fn(async () => undefined);
    let accessorCalls = 0;
    const value = Object.defineProperties(
      {},
      {
        effectiveUserId: {
          enumerable: true,
          get: () => {
            accessorCalls += 1;
            return TEST_EFFECTIVE_USER_ID;
          },
        },
        homeDirectory: {
          enumerable: true,
          value: TEST_HOME,
        },
        assertPinnedReceiptGitClosure: {
          enumerable: true,
          value: closure,
        },
      },
    ) as FloodgateV7ProductionConnectorVerifierReadinessDependenciesForTests;

    await expect(
      verifyFloodgateV7ProductionConnectorVerifierReadinessCoreForTests(value),
    ).rejects.toBeInstanceOf(
      FloodgateV7ProductionConnectorVerifierReadinessError,
    );
    expect(accessorCalls).toBe(0);
    expect(closure).not.toHaveBeenCalled();
  });

  it("rejects extra string or symbol dependency keys", async () => {
    const closure = vi.fn(async () => undefined);
    const withExtra = {
      ...dependencies(closure),
      repositoryRoot: "/caller/override",
    };
    const withSymbol = dependencies(closure) as unknown as Record<
      PropertyKey,
      unknown
    >;
    withSymbol[Symbol("override")] = "/caller/override";

    for (const value of [withExtra, withSymbol]) {
      await expect(
        verifyFloodgateV7ProductionConnectorVerifierReadinessCoreForTests(
          value as unknown as FloodgateV7ProductionConnectorVerifierReadinessDependenciesForTests,
        ),
      ).rejects.toBeInstanceOf(
        FloodgateV7ProductionConnectorVerifierReadinessError,
      );
    }
    expect(closure).not.toHaveBeenCalled();
  });

  it.each([
    ["negative EUID", { effectiveUserId: -1 }],
    ["fractional EUID", { effectiveUserId: 1.5 }],
    ["unsafe EUID", { effectiveUserId: Number.MAX_SAFE_INTEGER + 1 }],
    ["empty home", { homeDirectory: "" }],
    ["relative home", { homeDirectory: "relative/home" }],
    ["noncanonical home", { homeDirectory: `${TEST_HOME}${path.sep}` }],
    ["NUL home", { homeDirectory: `${TEST_HOME}\0private` }],
    ["non-function assertion", { assertPinnedReceiptGitClosure: null }],
  ])("rejects malformed dependency values: %s", async (_label, override) => {
    const closure = vi.fn(async () => undefined);
    const value = {
      ...dependencies(closure),
      ...override,
    } as unknown as FloodgateV7ProductionConnectorVerifierReadinessDependenciesForTests;

    await expect(
      verifyFloodgateV7ProductionConnectorVerifierReadinessCoreForTests(value),
    ).rejects.toBeInstanceOf(
      FloodgateV7ProductionConnectorVerifierReadinessError,
    );
    expect(closure).not.toHaveBeenCalled();
  });

  it("enforces exact argument counts at the production and test boundaries", async () => {
    const closure = vi.fn(async () => undefined);
    const testBoundary =
      verifyFloodgateV7ProductionConnectorVerifierReadinessCoreForTests as unknown as (
        ...values: unknown[]
      ) => Promise<unknown>;
    const productionBoundary =
      verifyFloodgateV7ProductionConnectorVerifierReadiness as unknown as (
        ...values: unknown[]
      ) => Promise<unknown>;

    expect(verifyFloodgateV7ProductionConnectorVerifierReadiness.length).toBe(
      0,
    );
    expect(
      verifyFloodgateV7ProductionConnectorVerifierReadinessCoreForTests.length,
    ).toBe(1);
    expect(
      assertFloodgateV7ProductionConnectorVerifierReadinessIdentityBinding.length,
    ).toBe(3);
    await expect(testBoundary()).rejects.toBeInstanceOf(
      FloodgateV7ProductionConnectorVerifierReadinessError,
    );
    await expect(
      testBoundary(dependencies(closure), "caller-path-or-revision-override"),
    ).rejects.toBeInstanceOf(
      FloodgateV7ProductionConnectorVerifierReadinessError,
    );
    await expect(productionBoundary("caller-override")).rejects.toBeInstanceOf(
      FloodgateV7ProductionConnectorVerifierReadinessError,
    );
    expect(closure).not.toHaveBeenCalled();
  });

  it.runIf(typeof process.geteuid === "function")(
    "binds production to current-EUID user-info home and the imported assertion",
    async () => {
      const closure = vi.fn(async () => undefined);
      const effectiveUserId = process.geteuid!();
      vi.resetModules();
      vi.doMock("node:os", async (importOriginal) => {
        const actual = await importOriginal<typeof import("node:os")>();
        return {
          ...actual,
          userInfo: () => ({
            username: "private-user",
            uid: effectiveUserId,
            gid: effectiveUserId,
            shell: "/private/shell",
            homedir: TEST_HOME,
          }),
        };
      });
      vi.doMock("../../../ml/floodgate-role-bundle-result", () => ({
        assertPinnedFloodgateRoleBundleReceiptGitClosure: closure,
      }));

      const isolated =
        await import("../../../ml/floodgate-v7-production-connector-verifier-readiness");
      const receipt =
        await isolated.verifyFloodgateV7ProductionConnectorVerifierReadiness();

      expect(closure).toHaveBeenCalledTimes(1);
      expect(closure).toHaveBeenCalledWith({
        repositoryRoot: EXPECTED_REPOSITORY_ROOT,
        verifierRevision: FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION,
      });
      expect(receipt.execution_boundary).toBe(
        "production-fixed-current-euid-userinfo-home-role-bundle-receipt-git-closure",
      );
      expect(() =>
        isolated.assertFloodgateV7ProductionConnectorVerifierReadinessIdentityBinding(
          receipt,
          effectiveUserId,
          TEST_HOME,
        ),
      ).not.toThrow();
      expect(JSON.stringify(receipt)).not.toContain("private-user");
      expect(JSON.stringify(receipt)).not.toContain(TEST_HOME);
    },
  );
});
