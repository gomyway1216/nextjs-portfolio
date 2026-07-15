import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS,
  FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY,
  claimFloodgateV7ApprovedKeyEnrollmentCoreForTests,
  loadFloodgateV7ApprovedKeyEnrollmentCoreForTests,
  serializeFloodgateV7ApprovedKeyEnrollmentRecordForInstallationCore,
  type FloodgateV7ApprovedKeyEnrollmentRecord,
} from "../../../ml/floodgate-v7-approved-key-enrollment";
import * as installer from "../../../ml/floodgate-v7-approved-key-enrollment-installer";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
  FLOODGATE_V7_DEPLOYMENT_KEY_ID,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
} from "../../../ml/floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
  FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
} from "../../../ml/floodgate-v7-deployment-key-instance-enrollment";

const EUID = process.geteuid?.() ?? 501;
const APPROVAL_ID = "a1".repeat(32);
const INSTANCE_ID = "b2".repeat(32);
const OTHER_INSTANCE_ID = "c3".repeat(32);
const APPROVED_AT_UTC = "2026-07-15T18:00:00.000Z";
const PATH_CANARY = "approved-installer-path-canary";
const VALUE_CANARY = "approved-installer-value-canary";
const PARENT_IDENTITY = { dev: "101", ino: "202" } as const;
const KEY_IDENTITY = { dev: "101", ino: "203" } as const;
const STAGING_BASENAME = ".approved-key-instance.json.installing-v1";
const temporaryRoots: string[] = [];
const posixDescribe = describe.runIf(typeof process.geteuid === "function");

type InstallerInput = Parameters<
  typeof installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests
>[0];
type InstallerDependencies = Parameters<
  typeof installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests
>[1];
type FailpointHook = NonNullable<InstallerDependencies["failpointForTests"]>;
type FailpointPhase = Parameters<FailpointHook>[0];

const FAILPOINT_PHASES = Object.freeze([
  "after-parent-created",
  "after-staging-create",
  "after-write",
  "after-file-sync",
  "before-final-link",
  "after-final-link",
  "after-final-directory-sync",
  "after-staging-unlink",
  "after-cleanup-directory-sync",
  "before-final-revalidation",
  "after-descriptor-close",
] as const satisfies readonly FailpointPhase[]);

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function candidate(
  overrides: Readonly<{
    executionBoundary?:
      | "production-fixed-current-euid-userinfo-home-key-instance-inspection"
      | "test-only-injected-current-euid-home-key-instance-inspection";
    instanceId?: string;
    ownerUid?: number;
  }> = {},
): Record<string, unknown> {
  const executionBoundary =
    overrides.executionBoundary ??
    "test-only-injected-current-euid-home-key-instance-inspection";
  const testBoundary = executionBoundary.startsWith("test-only-")
    ? {
        production_home_origin: false,
        production_home_alias_rejected: true,
        current_effective_uid_required: true,
        test_hook_may_observe_key_copy: true,
      }
    : null;
  return {
    contract: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
    status: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
    claim_boundary:
      FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CLAIM_BOUNDARY,
    trust_boundary:
      FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_TRUST_BOUNDARY,
    execution_boundary: executionBoundary,
    algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_ALGORITHM,
    key_deployment: {
      layout: "fixed-current-euid-userinfo-home-v1",
      key_id: FLOODGATE_V7_DEPLOYMENT_KEY_ID,
      owner_uid: overrides.ownerUid ?? EUID,
      parent_mode: "0700",
      key_mode: "0600",
      key_bytes: FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
      key_nlink: 1,
      parent_identity: PARENT_IDENTITY,
      key_identity: KEY_IDENTITY,
      key_instance_id: overrides.instanceId ?? INSTANCE_ID,
      key_instance_algorithm: FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
      held_descriptors_revalidated: true,
    },
    test_boundary: testBoundary,
    nonclaims: {
      key_created_or_written: false,
      key_material_disclosed: false,
      root_key_hash_disclosed: false,
      key_path_disclosed: false,
      authorization_mac: false,
      run_authorization: false,
      stage_authorization: false,
      checkpoint_key_capability: false,
      control_plane_approval: false,
      record_persisted: false,
      connector_execution: false,
      checkpoint: false,
      runtime: false,
      dataset_read: false,
      teacher_label: false,
      training: false,
      weight: false,
      live_evaluation_activation: false,
      playing_strength: false,
    },
  };
}

function canonicalCandidate(
  overrides: Parameters<typeof candidate>[0] = {},
): string {
  return `${JSON.stringify(candidate(overrides))}\n`;
}

function input(
  candidateCanonicalJson = canonicalCandidate(),
  overrides: Readonly<Partial<InstallerInput>> = {},
): InstallerInput {
  return {
    approval_id: APPROVAL_ID,
    approved_at_utc: APPROVED_AT_UTC,
    approved_candidate_sha256: sha256(candidateCanonicalJson),
    candidate_canonical_json: candidateCanonicalJson,
    ...overrides,
  } as InstallerInput;
}

function expectedRecord(
  installerInput: InstallerInput,
): FloodgateV7ApprovedKeyEnrollmentRecord {
  const parsedCandidate = JSON.parse(
    installerInput.candidate_canonical_json,
  ) as {
    key_deployment: {
      key_id: typeof FLOODGATE_V7_DEPLOYMENT_KEY_ID;
      owner_uid: number;
      parent_identity: typeof PARENT_IDENTITY;
      key_identity: typeof KEY_IDENTITY;
      key_instance_id: string;
      key_instance_algorithm: typeof FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM;
    };
  };
  return {
    contract: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CONTRACT,
    status: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_STATUS,
    claim_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_CLAIM_BOUNDARY,
    trust_boundary: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_TRUST_BOUNDARY,
    approval: {
      method: FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_APPROVAL_METHOD,
      approval_id: installerInput.approval_id,
      approved_at_utc: installerInput.approved_at_utc,
      candidate_receipt: {
        bytes: Buffer.byteLength(installerInput.candidate_canonical_json),
        sha256: installerInput.approved_candidate_sha256,
        canonical_json: installerInput.candidate_canonical_json,
      },
    },
    key_deployment: {
      layout: "fixed-current-euid-userinfo-home-v1",
      key_id: parsedCandidate.key_deployment.key_id,
      owner_uid: parsedCandidate.key_deployment.owner_uid,
      parent_identity: parsedCandidate.key_deployment.parent_identity,
      key_identity: parsedCandidate.key_deployment.key_identity,
      key_instance_id: parsedCandidate.key_deployment.key_instance_id,
      key_instance_algorithm:
        parsedCandidate.key_deployment.key_instance_algorithm,
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

function canonicalRecord(installerInput: InstallerInput): string {
  return `${JSON.stringify(expectedRecord(installerInput))}\n`;
}

async function temporaryHome(): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), `${PATH_CANARY}-`),
  );
  const home = await fs.promises.realpath(created);
  temporaryRoots.push(home);
  await fs.promises.chmod(home, 0o700);
  return home;
}

function enrollmentParent(home: string): string {
  return path.join(
    home,
    ...FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS,
  );
}

function enrollmentRecord(home: string): string {
  return path.join(
    enrollmentParent(home),
    FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
  );
}

function enrollmentStaging(home: string): string {
  return path.join(enrollmentParent(home), STAGING_BASENAME);
}

function managedDirectory(home: string, index: number): string {
  return path.join(
    home,
    ...FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS.slice(
      0,
      index + 1,
    ),
  );
}

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function write0600(
  filePath: string,
  bytes: string | Uint8Array,
): Promise<void> {
  await mkdir0700(path.dirname(filePath));
  await fs.promises.writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
  await fs.promises.chmod(filePath, 0o600);
}

function dependencies(
  homeDirectory: string,
  overrides: Readonly<Record<string, unknown>> = {},
): InstallerDependencies {
  return {
    effectiveUserId: EUID,
    homeDirectory,
    failpointForTests: undefined,
    observeFailureForTests: undefined,
    ...overrides,
  } as InstallerDependencies;
}

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected approved enrollment installer to fail");
}

async function entriesOrEmpty(directory: string): Promise<string[]> {
  try {
    return (await fs.promises.readdir(directory)).sort();
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }
}

function expectDeepFrozenNullRecords(
  value: unknown,
  seen = new Set<object>(),
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  if (!Array.isArray(value)) expect(Object.getPrototypeOf(value)).toBeNull();
  for (const child of Object.values(value)) {
    expectDeepFrozenNullRecords(child, seen);
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { force: true, recursive: true })),
  );
});

posixDescribe("Floodgate v7 approved-key enrollment installer", () => {
  it("writes one exact canonical 0600 record durably, revalidates it, and integrates with the loader", async () => {
    const home = await temporaryHome();
    const installerInput = input();

    const receipt =
      await installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        installerInput,
        dependencies(home),
      );

    for (
      let index = 0;
      index <
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS.length;
      index += 1
    ) {
      const stat = await fs.promises.lstat(managedDirectory(home, index), {
        bigint: true,
      });
      expect(stat.isDirectory()).toBe(true);
      expect(stat.uid).toBe(BigInt(EUID));
      expect(stat.mode & BigInt(0o7777)).toBe(BigInt(0o700));
    }
    const recordStat = await fs.promises.lstat(enrollmentRecord(home), {
      bigint: true,
    });
    expect(recordStat.isFile()).toBe(true);
    expect(recordStat.uid).toBe(BigInt(EUID));
    expect(recordStat.mode & BigInt(0o7777)).toBe(BigInt(0o600));
    expect(recordStat.nlink).toBe(BigInt(1));
    expect(await fs.promises.readFile(enrollmentRecord(home), "utf8")).toBe(
      canonicalRecord(installerInput),
    );
    expect(await entriesOrEmpty(enrollmentParent(home))).toEqual([
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
    ]);
    expect(receipt).toMatchObject({
      record: {
        record_mode: "0600",
        record_nlink: 1,
        publication:
          "staged-record-fsynced-hard-link-no-clobber-final-directory-fsynced-staging-unlinked-directory-fsynced-v1",
        durability: "record-published-and-staging-removal-durable",
        held_descriptors_revalidated: true,
      },
      approval_binding: {
        candidate_canonical_json_validated: true,
        candidate_sha256_exactly_matched: true,
        candidate_bytes_recomputed: true,
      },
    });
    expect(Reflect.ownKeys(receipt).sort()).toEqual(
      [
        "algorithm",
        "approval_binding",
        "claim_boundary",
        "contract",
        "execution_boundary",
        "nonclaims",
        "record",
        "status",
        "test_boundary",
        "trust_boundary",
      ].sort(),
    );
    expect(Reflect.ownKeys(receipt.record).sort()).toEqual(
      [
        "durability",
        "held_descriptors_revalidated",
        "publication",
        "record_mode",
        "record_nlink",
      ].sort(),
    );
    expect(Reflect.ownKeys(receipt.approval_binding).sort()).toEqual(
      [
        "candidate_bytes_recomputed",
        "candidate_canonical_json_validated",
        "candidate_sha256_exactly_matched",
      ].sort(),
    );

    const capability = await loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({
      effectiveUserId: EUID,
      homeDirectory: home,
    });
    const claim = claimFloodgateV7ApprovedKeyEnrollmentCoreForTests(capability);
    expect(claim).toMatchObject({
      approval: {
        approval_id: APPROVAL_ID,
        approved_at_utc: APPROVED_AT_UTC,
      },
      key_instance_id: INSTANCE_ID,
    });

    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain(home);
    expect(serialized).not.toContain(PATH_CANARY);
    expect(serialized).not.toContain(APPROVAL_ID);
    expect(serialized).not.toContain(INSTANCE_ID);
    expect(serialized).not.toContain(installerInput.approved_candidate_sha256);
    expect(serialized).not.toContain(installerInput.candidate_canonical_json);
    expect(serialized).not.toMatch(/(?:absolute|relative)_?path/i);
    expectDeepFrozenNullRecords(receipt);
  });

  it("requires an explicit lowercase digest-bound approval and exact approval metadata before namespace mutation", async () => {
    const invalidInputs: InstallerInput[] = [
      input(undefined, { approved_candidate_sha256: "00".repeat(32) }),
      input(undefined, {
        approved_candidate_sha256: sha256(canonicalCandidate()).toUpperCase(),
      }),
      input(undefined, { approval_id: "12".repeat(31) }),
      input(undefined, { approval_id: APPROVAL_ID.toUpperCase() }),
      input(undefined, { approved_at_utc: "2026-07-15T18:00:00Z" }),
      input(undefined, { approved_at_utc: "2026-07-15T18:00:00.000+00:00" }),
    ];

    for (const invalidInput of invalidInputs) {
      const home = await temporaryHome();
      const failure = await captureFailure(() =>
        installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
          invalidInput,
          dependencies(home),
        ),
      );
      expect(String(failure)).not.toContain(home);
      expect(String(failure)).not.toContain(INSTANCE_ID);
      expect(await entriesOrEmpty(home)).toEqual([]);
    }
  });

  it("rejects malformed, reordered, CRLF, unknown-field, duplicate-key, and boundary-mismatched candidates", async () => {
    const canonical = canonicalCandidate();
    const parsed = JSON.parse(canonical) as Record<string, unknown>;
    const { contract, ...withoutFirst } = parsed;
    const reordered = `${JSON.stringify({ ...withoutFirst, contract })}\n`;
    const unknown = `${JSON.stringify({ ...parsed, [VALUE_CANARY]: false })}\n`;
    const duplicate = canonical.replace(
      `{"contract":"${FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT}",`,
      `{"contract":"${FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT}","contract":"${FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT}",`,
    );
    const invalidCandidates = [
      "{not-json}\n",
      canonical.slice(0, -1),
      canonical.replace(/\n$/, "\r\n"),
      reordered,
      unknown,
      duplicate,
      canonicalCandidate({
        executionBoundary:
          "production-fixed-current-euid-userinfo-home-key-instance-inspection",
      }),
      canonicalCandidate({ ownerUid: EUID + 1 }),
    ];

    for (const invalidCandidate of invalidCandidates) {
      const home = await temporaryHome();
      const failure = await captureFailure(() =>
        installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
          input(invalidCandidate),
          dependencies(home),
        ),
      );
      expect(String(failure)).not.toContain(home);
      expect(String(failure)).not.toContain(VALUE_CANARY);
      expect(await entriesOrEmpty(home)).toEqual([]);
    }
  });

  it("rejects a nonproduction candidate at the pure production serialization boundary", () => {
    const productionCandidate = canonicalCandidate({
      executionBoundary:
        "production-fixed-current-euid-userinfo-home-key-instance-inspection",
    });
    const productionInput = input(productionCandidate);

    expect(
      serializeFloodgateV7ApprovedKeyEnrollmentRecordForInstallationCore(
        productionInput,
        EUID,
        "production-fixed-current-euid-userinfo-home-control-plane-record",
      ),
    ).toBe(canonicalRecord(productionInput));
    expect(() =>
      serializeFloodgateV7ApprovedKeyEnrollmentRecordForInstallationCore(
        input(canonicalCandidate()),
        EUID,
        "production-fixed-current-euid-userinfo-home-control-plane-record",
      ),
    ).toThrow();
  });

  it("never overwrites, adopts, rotates, or treats an existing final record as success", async () => {
    const home = await temporaryHome();
    const firstInput = input();
    await installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
      firstInput,
      dependencies(home),
    );
    const beforeBytes = await fs.promises.readFile(enrollmentRecord(home));
    const beforeStat = await fs.promises.lstat(enrollmentRecord(home), {
      bigint: true,
    });
    const replacementCandidate = canonicalCandidate({
      instanceId: OTHER_INSTANCE_ID,
    });

    const failure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(replacementCandidate, { approval_id: "d4".repeat(32) }),
        dependencies(home),
      ),
    );
    const repeatedFailure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        firstInput,
        dependencies(home),
      ),
    );

    expect(await fs.promises.readFile(enrollmentRecord(home))).toEqual(
      beforeBytes,
    );
    const afterStat = await fs.promises.lstat(enrollmentRecord(home), {
      bigint: true,
    });
    expect(afterStat.dev).toBe(beforeStat.dev);
    expect(afterStat.ino).toBe(beforeStat.ino);
    expect(failure).toMatchObject({
      may_have_committed: false,
      retry_disposition: "do-not-retry-existing-record",
    });
    expect(repeatedFailure).toMatchObject({
      may_have_committed: false,
      retry_disposition: "do-not-retry-existing-record",
    });
    expect(String(failure)).not.toContain(OTHER_INSTANCE_ID);
    expect(String(repeatedFailure)).not.toContain(APPROVAL_ID);
    expect(await entriesOrEmpty(enrollmentParent(home))).toEqual([
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
    ]);
  });

  it("rejects unsafe and aliased home anchors without touching their targets", async () => {
    const writableHome = await temporaryHome();
    await fs.promises.chmod(writableHome, 0o777);
    const linkedContainer = await temporaryHome();
    const target = path.join(linkedContainer, "target-home");
    const linkedHome = path.join(linkedContainer, "linked-home");
    await mkdir0700(target);
    await fs.promises.symlink(target, linkedHome);

    for (const home of [writableHome, linkedHome]) {
      const failure = await captureFailure(() =>
        installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
          input(),
          dependencies(home),
        ),
      );
      expect(String(failure)).not.toContain(home);
    }

    expect(await entriesOrEmpty(writableHome)).toEqual([]);
    expect(await entriesOrEmpty(target)).toEqual([]);
    expect((await fs.promises.lstat(linkedHome)).isSymbolicLink()).toBe(true);
  });

  it("rejects UID mismatch and unsafe managed-directory namespaces without publication", async () => {
    const uidHome = await temporaryHome();
    const uidFailure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(),
        dependencies(uidHome, { effectiveUserId: EUID + 1 }),
      ),
    );
    expect(String(uidFailure)).not.toContain(uidHome);
    expect(await entriesOrEmpty(uidHome)).toEqual([]);

    const wrongModeHome = await temporaryHome();
    await mkdir0700(enrollmentParent(wrongModeHome));
    await fs.promises.chmod(managedDirectory(wrongModeHome, 1), 0o755);
    const beforeEntries = await entriesOrEmpty(enrollmentParent(wrongModeHome));
    const wrongModeFailure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(),
        dependencies(wrongModeHome),
      ),
    );
    expect(String(wrongModeFailure)).not.toContain(wrongModeHome);
    expect(await entriesOrEmpty(enrollmentParent(wrongModeHome))).toEqual(
      beforeEntries,
    );

    const symlinkHome = await temporaryHome();
    const external = path.join(symlinkHome, "external-parent");
    await mkdir0700(external);
    await mkdir0700(managedDirectory(symlinkHome, 1));
    await fs.promises.symlink(external, managedDirectory(symlinkHome, 2));
    const symlinkFailure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(),
        dependencies(symlinkHome),
      ),
    );
    expect(String(symlinkFailure)).not.toContain(symlinkHome);
    expect(await entriesOrEmpty(external)).toEqual([]);
    expect(
      (
        await fs.promises.lstat(managedDirectory(symlinkHome, 2))
      ).isSymbolicLink(),
    ).toBe(true);
  });

  it("rejects preexisting final symlink, hardlink, wrong mode, and directory entries without changing them", async () => {
    const cases = [
      {
        name: "symlink",
        arrange: async (home: string) => {
          const external = path.join(home, "external-symlink-record");
          await write0600(external, VALUE_CANARY);
          await mkdir0700(enrollmentParent(home));
          await fs.promises.symlink(external, enrollmentRecord(home));
        },
      },
      {
        name: "hardlink",
        arrange: async (home: string) => {
          const external = path.join(home, "external-hardlink-record");
          await write0600(external, VALUE_CANARY);
          await mkdir0700(enrollmentParent(home));
          await fs.promises.link(external, enrollmentRecord(home));
        },
      },
      {
        name: "wrong-mode",
        arrange: async (home: string) => {
          await write0600(enrollmentRecord(home), VALUE_CANARY);
          await fs.promises.chmod(enrollmentRecord(home), 0o644);
        },
      },
      {
        name: "directory",
        arrange: async (home: string) => {
          await mkdir0700(enrollmentRecord(home));
        },
      },
    ];

    for (const testCase of cases) {
      const home = await temporaryHome();
      await testCase.arrange(home);
      const before = await fs.promises.lstat(enrollmentRecord(home), {
        bigint: true,
      });
      const failure = await captureFailure(() =>
        installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
          input(),
          dependencies(home),
        ),
      );
      const after = await fs.promises.lstat(enrollmentRecord(home), {
        bigint: true,
      });
      expect(after.dev, testCase.name).toBe(before.dev);
      expect(after.ino, testCase.name).toBe(before.ino);
      expect(after.mode, testCase.name).toBe(before.mode);
      expect(String(failure), testCase.name).not.toContain(home);
    }
  });

  it("never removes or adopts a preexisting or O_EXCL-racing staging entry", async () => {
    for (const raced of [false, true]) {
      const home = await temporaryHome();
      const competitor = `${VALUE_CANARY}-${raced ? "race" : "stale"}\n`;
      if (!raced) {
        await write0600(enrollmentStaging(home), competitor);
      }
      const failure = await captureFailure(() =>
        installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
          input(),
          dependencies(home, {
            failpointForTests: raced
              ? (phase: FailpointPhase) => {
                  if (phase === "after-parent-created") {
                    fs.writeFileSync(enrollmentStaging(home), competitor, {
                      flag: "wx",
                      mode: 0o600,
                    });
                    fs.chmodSync(enrollmentStaging(home), 0o600);
                  }
                }
              : undefined,
          }),
        ),
      );

      expect(failure).toMatchObject({
        may_have_committed: false,
        retry_disposition: "manual-reconciliation-required",
      });
      expect(await fs.promises.readFile(enrollmentStaging(home), "utf8")).toBe(
        competitor,
      );
      expect(fs.existsSync(enrollmentRecord(home))).toBe(false);
      expect(String(failure)).not.toContain(competitor);
      expect(String(failure)).not.toContain(home);
    }
  });

  it("does not link or unlink a staging-name replacement across commit failpoints", async () => {
    const beforeLinkHome = await temporaryHome();
    const beforeLinkCompetitor = `${VALUE_CANARY}-before-link\n`;
    const beforeLinkFailure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(),
        dependencies(beforeLinkHome, {
          failpointForTests: (phase: FailpointPhase) => {
            if (phase === "before-final-link") {
              fs.unlinkSync(enrollmentStaging(beforeLinkHome));
              fs.writeFileSync(
                enrollmentStaging(beforeLinkHome),
                beforeLinkCompetitor,
                { flag: "wx", mode: 0o600 },
              );
              fs.chmodSync(enrollmentStaging(beforeLinkHome), 0o600);
            }
          },
        }),
      ),
    );
    expect(beforeLinkFailure).toMatchObject({
      may_have_committed: false,
      retry_disposition: "manual-reconciliation-required",
    });
    expect(
      await fs.promises.readFile(enrollmentStaging(beforeLinkHome), "utf8"),
    ).toBe(beforeLinkCompetitor);
    expect(fs.existsSync(enrollmentRecord(beforeLinkHome))).toBe(false);

    const beforeUnlinkHome = await temporaryHome();
    const beforeUnlinkCompetitor = `${VALUE_CANARY}-before-unlink\n`;
    const beforeUnlinkFailure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(),
        dependencies(beforeUnlinkHome, {
          failpointForTests: (phase: FailpointPhase) => {
            if (phase === "after-final-directory-sync") {
              fs.unlinkSync(enrollmentStaging(beforeUnlinkHome));
              fs.writeFileSync(
                enrollmentStaging(beforeUnlinkHome),
                beforeUnlinkCompetitor,
                { flag: "wx", mode: 0o600 },
              );
              fs.chmodSync(enrollmentStaging(beforeUnlinkHome), 0o600);
            }
          },
        }),
      ),
    );
    expect(beforeUnlinkFailure).toMatchObject({
      durability: "final-link-directory-synced",
      may_have_committed: true,
      retry_disposition: "manual-reconciliation-required",
    });
    expect(
      await fs.promises.readFile(enrollmentStaging(beforeUnlinkHome), "utf8"),
    ).toBe(beforeUnlinkCompetitor);
    expect(
      await fs.promises.readFile(enrollmentRecord(beforeUnlinkHome), "utf8"),
    ).toBe(canonicalRecord(input()));
  });

  it.each(["mode", "size", "nlink"] as const)(
    "never upgrades postcommit %s tampering to strong durable reconciliation",
    async (tamper) => {
      const home = await temporaryHome();
      const externalLink = path.join(home, `external-${tamper}-link`);
      const failure = await captureFailure(() =>
        installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
          input(),
          dependencies(home, {
            failpointForTests: (phase: FailpointPhase) => {
              if (phase !== "after-final-directory-sync") return;
              if (tamper === "mode") {
                fs.chmodSync(enrollmentRecord(home), 0o644);
              } else if (tamper === "size") {
                fs.truncateSync(enrollmentRecord(home), 1);
              } else {
                fs.linkSync(enrollmentRecord(home), externalLink);
              }
            },
          }),
        ),
      );

      expect(failure).toMatchObject({
        durability: "final-link-directory-synced",
        may_have_committed: true,
        retry_disposition: "manual-reconciliation-required",
      });
      expect(failure).not.toMatchObject({
        durability: "record-published-and-staging-removal-durable",
      });
      expect(String(failure)).not.toContain(home);
      expect(String(failure)).not.toContain(INSTANCE_ID);
    },
  );

  it("loses a before-publish race without replacing or adopting the competitor", async () => {
    const home = await temporaryHome();
    const competitor = `${VALUE_CANARY}\n`;
    const failure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(),
        dependencies(home, {
          failpointForTests: (phase: FailpointPhase) => {
            if (phase === "before-final-link") {
              fs.writeFileSync(enrollmentRecord(home), competitor, {
                flag: "wx",
                mode: 0o600,
              });
              fs.chmodSync(enrollmentRecord(home), 0o600);
            }
          },
        }),
      ),
    );

    expect(await fs.promises.readFile(enrollmentRecord(home), "utf8")).toBe(
      competitor,
    );
    expect(await entriesOrEmpty(enrollmentParent(home))).toEqual([
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
    ]);
    expect(failure).toMatchObject({
      durability: "managed-prefix-may-exist-existing-record-not-adopted",
      may_have_committed: false,
      retry_disposition: "do-not-retry-existing-record",
    });
    expect(String(failure)).not.toContain(VALUE_CANARY);
    expect(String(failure)).not.toContain(home);
  });

  it.each(FAILPOINT_PHASES)(
    "fails closed with sanitized reconciliation metadata when %s is injected",
    async (phase) => {
      const home = await temporaryHome();
      const failureCanary = `${VALUE_CANARY}-${phase}`;
      let injected = 0;
      let rawFailure: unknown;
      const failure = await captureFailure(() =>
        installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
          input(),
          dependencies(home, {
            failpointForTests: (event: FailpointPhase) => {
              if (event === phase) {
                injected += 1;
                throw new Error(`${failureCanary}-${home}`);
              }
            },
            observeFailureForTests: (observed: unknown) => {
              rawFailure = observed;
            },
          }),
        ),
      );

      expect(injected).toBe(1);
      expect(String(rawFailure)).toContain(failureCanary);
      expect(String(failure)).not.toContain(failureCanary);
      expect(String(failure)).not.toContain(home);
      expect(String(failure)).not.toContain(APPROVAL_ID);
      expect(String(failure)).not.toContain(INSTANCE_ID);
      const committed =
        FAILPOINT_PHASES.indexOf(phase) >=
        FAILPOINT_PHASES.indexOf("after-final-link");
      expect(failure).toMatchObject({
        may_have_committed: committed,
        retry_disposition: committed
          ? "manual-reconciliation-required"
          : "safe-to-retry-after-not-installed",
      });
      expect(fs.existsSync(enrollmentRecord(home))).toBe(committed);
      if (committed) {
        expect(await fs.promises.readFile(enrollmentRecord(home), "utf8")).toBe(
          canonicalRecord(input()),
        );
      }
      const entries = await entriesOrEmpty(enrollmentParent(home));
      expect(
        entries.every(
          (entry) => entry === FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
        ),
      ).toBe(true);
    },
  );

  it("reports a partially created managed prefix instead of claiming no installation change", async () => {
    const home = await temporaryHome();
    let injected = 0;
    const failure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(),
        dependencies(home, {
          failpointForTests: (phase: FailpointPhase) => {
            if (phase === "after-managed-directory-created") {
              injected += 1;
              throw new Error(VALUE_CANARY);
            }
          },
        }),
      ),
    );

    expect(injected).toBe(1);
    expect(failure).toMatchObject({
      durability: "managed-prefix-may-exist-record-absent",
      may_have_committed: false,
      retry_disposition: "manual-reconciliation-required",
    });
    expect(await entriesOrEmpty(home)).toEqual([
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_ROOT_RELATIVE_COMPONENTS[0],
    ]);
    expect(fs.existsSync(enrollmentRecord(home))).toBe(false);
    expect(String(failure)).not.toContain(home);
    expect(String(failure)).not.toContain(VALUE_CANARY);
  });

  it("allows a clean retry before publication but never retries through a published record", async () => {
    const prepublishHome = await temporaryHome();
    const prepublishFailure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(),
        dependencies(prepublishHome, {
          failpointForTests: (phase: FailpointPhase) => {
            if (phase === "after-write") throw new Error(VALUE_CANARY);
          },
        }),
      ),
    );
    expect(prepublishFailure).toMatchObject({
      may_have_committed: false,
      retry_disposition: "safe-to-retry-after-not-installed",
    });
    expect(fs.existsSync(enrollmentRecord(prepublishHome))).toBe(false);
    await expect(
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(),
        dependencies(prepublishHome),
      ),
    ).resolves.toBeDefined();

    const postpublishHome = await temporaryHome();
    const postpublishFailure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(),
        dependencies(postpublishHome, {
          failpointForTests: (phase: FailpointPhase) => {
            if (phase === "after-final-directory-sync") {
              throw new Error(VALUE_CANARY);
            }
          },
        }),
      ),
    );
    expect(postpublishFailure).toMatchObject({
      may_have_committed: true,
      retry_disposition: "manual-reconciliation-required",
    });
    const publishedBytes = await fs.promises.readFile(
      enrollmentRecord(postpublishHome),
    );
    const retryFailure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(),
        dependencies(postpublishHome),
      ),
    );
    expect(retryFailure).toMatchObject({
      may_have_committed: false,
      retry_disposition: "do-not-retry-existing-record",
    });
    expect(
      await fs.promises.readFile(enrollmentRecord(postpublishHome)),
    ).toEqual(publishedBytes);
  });

  it("detects held-descriptor mode races during final revalidation after durable publication", async () => {
    const home = await temporaryHome();
    let raced = 0;
    const failure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(),
        dependencies(home, {
          failpointForTests: (phase: FailpointPhase) => {
            if (phase === "before-final-revalidation") {
              raced += 1;
              fs.chmodSync(enrollmentParent(home), 0o755);
            }
          },
        }),
      ),
    );

    expect(raced).toBe(1);
    expect(failure).toMatchObject({
      may_have_committed: true,
      retry_disposition: "manual-reconciliation-required",
    });
    expect(String(failure)).not.toContain(home);
    expect(await fs.promises.readFile(enrollmentRecord(home), "utf8")).toBe(
      canonicalRecord(input()),
    );
  });

  it("preserves strong durability after a post-revalidation descriptor close failure", async () => {
    const home = await temporaryHome();
    let closeCalls = 0;
    const failure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(),
        dependencies(home, {
          closeFileHandleForTests: async (handle: fs.promises.FileHandle) => {
            closeCalls += 1;
            await handle.close();
            if (closeCalls === 2) throw new Error(VALUE_CANARY);
          },
        }),
      ),
    );

    expect(closeCalls).toBeGreaterThanOrEqual(2);
    expect(failure).toMatchObject({
      phase: "cleanup",
      durability: "record-published-and-staging-removal-durable",
      may_have_committed: true,
      retry_disposition: "do-not-retry-existing-record",
    });
    expect(String(failure)).not.toContain(home);
    expect(String(failure)).not.toContain(VALUE_CANARY);
    expect(await fs.promises.readFile(enrollmentRecord(home), "utf8")).toBe(
      canonicalRecord(input()),
    );
    expect(await entriesOrEmpty(enrollmentParent(home))).toEqual([
      FLOODGATE_V7_APPROVED_KEY_ENROLLMENT_FILENAME,
    ]);
  });

  it("requires exact plain input and dependency records without invoking accessors or proxies", async () => {
    const home = await temporaryHome();
    let accessorCalls = 0;
    const accessorInput = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessorInput, "approval_id", {
      enumerable: true,
      get() {
        accessorCalls += 1;
        return APPROVAL_ID;
      },
    });
    Object.assign(accessorInput, {
      approved_at_utc: APPROVED_AT_UTC,
      approved_candidate_sha256: sha256(canonicalCandidate()),
      candidate_canonical_json: canonicalCandidate(),
    });
    let proxyCalls = 0;
    const proxyDependencies = new Proxy(dependencies(home), {
      ownKeys() {
        proxyCalls += 1;
        throw new Error(VALUE_CANARY);
      },
    });

    const accessorFailure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        accessorInput as unknown as InstallerInput,
        dependencies(home),
      ),
    );
    const proxyFailure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        input(),
        proxyDependencies,
      ),
    );
    const unknownFailure = await captureFailure(() =>
      installer.installFloodgateV7ApprovedKeyEnrollmentCoreForTests(
        { ...input(), unknown: false } as InstallerInput,
        dependencies(home),
      ),
    );

    expect(accessorCalls).toBe(0);
    expect(proxyCalls).toBe(0);
    expect(String(accessorFailure)).not.toContain(VALUE_CANARY);
    expect(String(proxyFailure)).not.toContain(VALUE_CANARY);
    expect(String(unknownFailure)).not.toContain(VALUE_CANARY);
    expect(await entriesOrEmpty(home)).toEqual([]);
  });
});
