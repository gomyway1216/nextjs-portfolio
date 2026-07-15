import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS,
  FloodgateV7ApprovedKeyCurrentBindingError,
  verifyFloodgateV7ApprovedKeyCurrentBinding,
  verifyFloodgateV7ApprovedKeyCurrentBindingCoreForTests,
  type FloodgateV7ApprovedKeyCurrentBindingDependenciesForTests,
} from "../../../ml/floodgate-v7-approved-key-current-binding";
import {
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY,
  type FloodgateV7ApprovedKeyEnrollmentRecord,
} from "../../../ml/floodgate-v7-approved-key-enrollment";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
  FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
} from "../../../ml/floodgate-v7-deployment-key-authority";
import {
  inspectFloodgateV7DeploymentKeyInstanceCoreForTests,
  type FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt,
  type FloodgateV7DeploymentKeyInstanceEnrollmentDependenciesForTests,
} from "../../../ml/floodgate-v7-deployment-key-instance-enrollment";

const SOURCE_PATH = path.resolve(
  process.cwd(),
  "ml/floodgate-v7-approved-key-current-binding.ts",
);
const CLI_PATH = path.resolve(
  process.cwd(),
  "ml/inspect-floodgate-v7-approved-key-current-binding.ts",
);
const APPROVAL_ID = "6a".repeat(32);
const KEY_BYTES = Buffer.from(
  Array.from(
    { length: FLOODGATE_V7_DEPLOYMENT_KEY_BYTES },
    (_value, index) => (index * 29 + 7) & 0xff,
  ),
);
const OTHER_KEY_BYTES = Buffer.from(
  Array.from(
    { length: FLOODGATE_V7_DEPLOYMENT_KEY_BYTES },
    (_value, index) => (index * 37 + 11) & 0xff,
  ),
);
const temporaryRoots: string[] = [];
const posixDescribe = describe.runIf(typeof process.geteuid === "function");

type TestCandidate = Readonly<
  FloodgateV7DeploymentKeyInstanceEnrollmentCandidateReceipt<"test-only-injected-current-euid-home-key-instance-inspection">
>;

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { force: true, recursive: true })),
  );
});

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("current-binding tests require a POSIX euid");
  }
  return process.geteuid();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function temporaryHome(): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-current-binding-"),
  );
  const home = await fs.promises.realpath(created);
  temporaryRoots.push(home);
  await fs.promises.chmod(home, 0o700);
  return home;
}

async function ensureManagedDirectories(
  home: string,
  components: readonly string[],
): Promise<string> {
  let current = home;
  for (const component of components) {
    current = path.join(current, component);
    await fs.promises.mkdir(current, { mode: 0o700, recursive: true });
    await fs.promises.chmod(current, 0o700);
  }
  return current;
}

function keyPath(home: string): string {
  return path.join(
    home,
    ...FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
    FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  );
}

async function writeKey(
  home: string,
  bytes: Uint8Array = KEY_BYTES,
): Promise<void> {
  const parent = await ensureManagedDirectories(
    home,
    FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
  );
  const target = path.join(parent, FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME);
  await fs.promises.writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  await fs.promises.chmod(target, 0o600);
}

function approvedRecord(
  candidate: TestCandidate,
): FloodgateV7ApprovedKeyEnrollmentRecord {
  const canonicalJson = `${JSON.stringify(candidate)}\n`;
  const deployment = candidate.key_deployment;
  return {
    contract: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS,
    claim_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY,
    approval: {
      method: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
      approval_id: APPROVAL_ID,
      approved_at_utc: "2026-07-15T20:00:00.000Z",
      candidate_receipt: {
        bytes: Buffer.byteLength(canonicalJson),
        sha256: sha256(canonicalJson),
        canonical_json: canonicalJson,
      },
    },
    key_deployment: {
      layout: deployment.layout,
      key_id: deployment.key_id,
      owner_uid: deployment.owner_uid,
      parent_identity: deployment.parent_identity,
      key_identity: deployment.key_identity,
      key_instance_id: deployment.key_instance_id,
      key_instance_algorithm: deployment.key_instance_algorithm,
    },
    nonclaims: {
      approval_signature_or_mac: false,
      checkpoint: false,
      dataset_read: false,
      gate_authorization: false,
      key_material: false,
      key_path: false,
      live_evaluation_activation: false,
      match: false,
      playing_strength: false,
      root_key_hash: false,
      run_authorization: false,
      runtime: false,
      teacher_label: false,
      training: false,
      weight: false,
    },
  };
}

async function writeApprovedRecord(
  home: string,
  candidate: TestCandidate,
): Promise<void> {
  const parent = await ensureManagedDirectories(
    home,
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS,
  );
  const target = path.join(
    parent,
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
  );
  await fs.promises.writeFile(
    target,
    `${JSON.stringify(approvedRecord(candidate))}\n`,
    { flag: "wx", mode: 0o600 },
  );
  await fs.promises.chmod(target, 0o600);
}

function inspectorDependencies(
  homeDirectory: string,
): FloodgateV7DeploymentKeyInstanceEnrollmentDependenciesForTests {
  return { effectiveUserId: effectiveUserId(), homeDirectory };
}

function bindingDependencies(
  homeDirectory: string,
  inspectCurrentKeyForTests?: FloodgateV7ApprovedKeyCurrentBindingDependenciesForTests["inspectCurrentKeyForTests"],
): FloodgateV7ApprovedKeyCurrentBindingDependenciesForTests {
  return inspectCurrentKeyForTests === undefined
    ? { effectiveUserId: effectiveUserId(), homeDirectory }
    : {
        effectiveUserId: effectiveUserId(),
        homeDirectory,
        inspectCurrentKeyForTests,
      };
}

async function boundHome(): Promise<
  Readonly<{ home: string; candidate: TestCandidate }>
> {
  const home = await temporaryHome();
  await writeKey(home);
  const candidate = await inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
    inspectorDependencies(home),
  );
  await writeApprovedRecord(home, candidate);
  return { home, candidate };
}

async function captureFailure(
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected current-binding verification to fail");
}

function expectDeepFrozenNullRecords(
  value: unknown,
  seen = new Set<object>(),
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  expect(Object.getPrototypeOf(value)).toBeNull();
  for (const child of Object.values(value)) {
    expectDeepFrozenNullRecords(child, seen);
  }
}

posixDescribe("Floodgate v7 approved key current binding", () => {
  it("returns only a frozen sanitized receipt after an exact fresh binding match", async () => {
    const { home, candidate } = await boundHome();
    let inspectorCalls = 0;
    const receipt =
      await verifyFloodgateV7ApprovedKeyCurrentBindingCoreForTests(
        bindingDependencies(home, async (dependencies) => {
          inspectorCalls += 1;
          expect(dependencies).toEqual(inspectorDependencies(home));
          return inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
            dependencies,
          );
        }),
      );

    expect(inspectorCalls).toBe(1);
    expect(receipt).toEqual({
      contract: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CONTRACT,
      status: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_STATUS,
      claim_boundary: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_CLAIM_BOUNDARY,
      execution_boundary:
        "test-only-injected-current-euid-home-approved-record-current-key-binding",
      algorithm: FLOODGATE_V7_APPROVED_KEY_CURRENT_BINDING_ALGORITHM,
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
    });
    expectDeepFrozenNullRecords(receipt);

    const publicJson = JSON.stringify(receipt);
    for (const sensitive of [
      home,
      APPROVAL_ID,
      candidate.key_deployment.key_instance_id,
      candidate.key_deployment.parent_identity.dev,
      candidate.key_deployment.parent_identity.ino,
      candidate.key_deployment.key_identity.dev,
      candidate.key_deployment.key_identity.ino,
    ]) {
      expect(publicJson).not.toContain(sensitive);
    }
    expect(publicJson).not.toMatch(
      /"(?:approval_id|canonical_json|key_instance_id|owner_uid|sha256|parent_dev|parent_ino|key_dev|key_ino|path)"/,
    );
  });

  it("fails closed when key bytes no longer match the approved instance", async () => {
    const { home } = await boundHome();
    await fs.promises.writeFile(keyPath(home), OTHER_KEY_BYTES);
    await fs.promises.chmod(keyPath(home), 0o600);

    await expect(
      verifyFloodgateV7ApprovedKeyCurrentBindingCoreForTests(
        bindingDependencies(home),
      ),
    ).rejects.toMatchObject({
      phase: "comparison",
      receipt_issued: false,
      authority_issued: false,
    });
  });

  it("fails closed when the named key identity changes even with the same bytes", async () => {
    const { home, candidate } = await boundHome();
    const replacement = `${keyPath(home)}.replacement`;
    await fs.promises.writeFile(replacement, KEY_BYTES, {
      flag: "wx",
      mode: 0o600,
    });
    await fs.promises.chmod(replacement, 0o600);
    await fs.promises.rename(replacement, keyPath(home));
    const replacementStat = await fs.promises.stat(keyPath(home));
    expect(String(replacementStat.dev)).toBe(
      candidate.key_deployment.key_identity.dev,
    );
    expect(String(replacementStat.ino)).not.toBe(
      candidate.key_deployment.key_identity.ino,
    );

    await expect(
      verifyFloodgateV7ApprovedKeyCurrentBindingCoreForTests(
        bindingDependencies(home),
      ),
    ).rejects.toMatchObject({ phase: "comparison" });
  });

  it("does not run the fresh inspector when approved-record loading fails", async () => {
    const home = await temporaryHome();
    await writeKey(home);
    let inspectorCalls = 0;

    await expect(
      verifyFloodgateV7ApprovedKeyCurrentBindingCoreForTests(
        bindingDependencies(home, async (dependencies) => {
          inspectorCalls += 1;
          return inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
            dependencies,
          );
        }),
      ),
    ).rejects.toMatchObject({ phase: "approved-record-load" });
    expect(inspectorCalls).toBe(0);
  });

  it("wraps inspector failures without returning the loaded capability or leaking details", async () => {
    const { home } = await boundHome();
    const failure = await captureFailure(() =>
      verifyFloodgateV7ApprovedKeyCurrentBindingCoreForTests(
        bindingDependencies(home, async () => {
          throw new Error(`sensitive ${home} ${APPROVAL_ID}`);
        }),
      ),
    );

    expect(failure).toBeInstanceOf(FloodgateV7ApprovedKeyCurrentBindingError);
    expect(failure).toMatchObject({
      phase: "current-key-inspection",
      receipt_issued: false,
      authority_issued: false,
    });
    expect(failure).not.toHaveProperty("cause");
    expect(failure).not.toHaveProperty("path");
    expect(Object.isFrozen(failure)).toBe(true);
    expect(String(failure)).not.toContain(home);
    expect((failure as Error).stack).not.toContain(process.cwd());
  });

  it("keeps production zero-argument and test injection one-argument only", async () => {
    expect(verifyFloodgateV7ApprovedKeyCurrentBinding).toHaveLength(0);
    expect(verifyFloodgateV7ApprovedKeyCurrentBindingCoreForTests).toHaveLength(
      1,
    );
    await expect(
      Reflect.apply(
        verifyFloodgateV7ApprovedKeyCurrentBindingCoreForTests,
        undefined,
        [],
      ),
    ).rejects.toMatchObject({ phase: "capture" });
    await expect(
      Reflect.apply(verifyFloodgateV7ApprovedKeyCurrentBinding, undefined, [
        bindingDependencies(await temporaryHome()),
      ]),
    ).rejects.toMatchObject({ phase: "capture" });
  });

  it("rejects accessors, proxies, unknown fields, and invalid inspector seams before use", async () => {
    const home = await temporaryHome();
    let traps = 0;
    const accessor = Object.create(Object.prototype, {
      effectiveUserId: {
        enumerable: true,
        get(): never {
          traps += 1;
          throw new Error("accessor must not run");
        },
      },
      homeDirectory: { enumerable: true, value: home },
    }) as FloodgateV7ApprovedKeyCurrentBindingDependenciesForTests;
    const proxy = new Proxy(bindingDependencies(home), {
      get(): never {
        traps += 1;
        throw new Error("proxy must not run");
      },
      ownKeys(): never {
        traps += 1;
        throw new Error("proxy must not run");
      },
    });
    for (const malformed of [
      accessor,
      proxy,
      { ...bindingDependencies(home), unexpected: true },
      { ...bindingDependencies(home), inspectCurrentKeyForTests: 1 },
    ]) {
      await expect(
        verifyFloodgateV7ApprovedKeyCurrentBindingCoreForTests(
          malformed as FloodgateV7ApprovedKeyCurrentBindingDependenciesForTests,
        ),
      ).rejects.toMatchObject({ phase: "capture" });
    }
    expect(traps).toBe(0);
  });
});

describe("Floodgate v7 approved key current binding source boundary", () => {
  it("is memory-only, import-safe, argumentless in production, and connector-free", async () => {
    const [source, cli] = await Promise.all([
      fs.promises.readFile(SOURCE_PATH, "utf8"),
      fs.promises.readFile(CLI_PATH, "utf8"),
    ]);

    expect(source).toContain("loadFloodgateV7ApprovedKeyEnrollment");
    expect(source).toContain("claimFloodgateV7ApprovedKeyEnrollment");
    expect(source).toContain("inspectFloodgateV7DeploymentKeyInstance");
    expect(source).not.toMatch(
      /fs\.promises\.(?:writeFile|appendFile|mkdir|chmod|link|unlink|rename)|\b(?:writeFile|appendFile|mkdir|chmod|link|unlink|rename)\(/,
    );
    expect(source).not.toMatch(/production-checkpoint-connector/);
    expect(source).not.toMatch(/node:(?:child_process|net|http|https)/);
    expect(cli).toContain("if (require.main === module)");
    expect(cli).toContain("process.argv.length !== 2");
    expect(cli).toContain("verifyFloodgateV7ApprovedKeyCurrentBinding()");
    expect(cli).not.toContain("console.log");
  });
});
