import { createHash, createHmac, hkdfSync } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import * as authority from "../../../ml/floodgate-v7-deployment-key-authority";
import * as enrollment from "../../../ml/floodgate-v7-deployment-key-instance-enrollment";
import {
  FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
} from "../../../ml/floodgate-teacher-stage-authorization";

const REPOSITORY_ROOT = process.cwd();
const SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml",
  "floodgate-v7-deployment-key-instance-enrollment.ts",
);
const INSPECT_CLI_PATH = path.join(
  REPOSITORY_ROOT,
  "ml",
  "inspect-floodgate-v7-deployment-key-instance.ts",
);
const PROVISION_CLI_PATH = path.join(
  REPOSITORY_ROOT,
  "ml",
  "provision-floodgate-v7-deployment-key.ts",
);
const KEY_BYTES = Buffer.from(
  Array.from(
    { length: authority.FLOODGATE_V7_DEPLOYMENT_KEY_BYTES },
    (_value, index) => (index * 23 + 9) & 0xff,
  ),
);
const OTHER_KEY_BYTES = Buffer.from(
  Array.from(
    { length: authority.FLOODGATE_V7_DEPLOYMENT_KEY_BYTES },
    (_value, index) => (index * 31 + 5) & 0xff,
  ),
);
const PATH_CANARY = "floodgate-v7-enrollment-path-canary";
const temporaryRoots: string[] = [];
const posixDescribe = describe.runIf(typeof process.geteuid === "function");

type EnrollmentDependencies = Parameters<
  typeof enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests
>[0];
type AuthorityRequest = Parameters<
  typeof authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests
>[0];

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("deployment-key enrollment tests require a POSIX euid");
  }
  return process.geteuid();
}

function nullRecord<T extends Record<string, unknown>>(value: T): Readonly<T> {
  const output = Object.create(null) as T;
  for (const [key, child] of Object.entries(value)) {
    Object.defineProperty(output, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: child,
    });
  }
  return Object.freeze(output);
}

function dependencyFixture(
  homeDirectory: string,
  overrides: Readonly<Record<string, unknown>> = {},
): EnrollmentDependencies {
  return {
    effectiveUserId: effectiveUserId(),
    homeDirectory,
    observeInternalKeyForTests: undefined,
    beforeFinalRevalidationForTests: undefined,
    ...overrides,
  } as EnrollmentDependencies;
}

function authorityDependencies(
  homeDirectory: string,
): authority.FloodgateV7DeploymentKeyAuthorityDependencies {
  return nullRecord({
    effectiveUserId: effectiveUserId(),
    homeDirectory,
    observeInternalKeyForTests: undefined,
    beforeFinalRevalidationForTests: undefined,
  });
}

function authorityRequest(): AuthorityRequest {
  return nullRecord({
    runId: "42".repeat(32),
    keyId: authority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    runBinding: nullRecord({
      schema: "shogi-floodgate-v7-teacher-run-binding-v2" as const,
      plan: nullRecord({
        bytes: 10_890 as const,
        sha256:
          "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af" as const,
      }),
      producer_control: nullRecord({
        schema: "shogi-floodgate-v7-teacher-producer-control-v2" as const,
        parent_deadline_ms: 1_800_000 as const,
        abort_drain_ms: 30_000 as const,
        max_in_flight: 12 as const,
        cancel_policy:
          "first-terminal-stop-scheduling-abort-each-running-signal-once-and-call-controller-drain-once-v2" as const,
        late_settlement_policy:
          "observe-from-start-consume-after-terminal-without-validation-or-append-v2" as const,
      }),
      stable_runtime_receipt_sha256: "11".repeat(32),
      teacher_usi_runtime_receipt_sha256: "22".repeat(32),
    }),
    stageAuthorizationReceipt: nullRecord({
      contract: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
      trust_boundary: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
      status: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
      parent_identity: nullRecord({ dev: BigInt(101), ino: BigInt(102) }),
      stage_identity: nullRecord({ dev: BigInt(201), ino: BigInt(202) }),
      lease_identity: nullRecord({ dev: BigInt(301), ino: BigInt(302) }),
      stage_basename: "teacher-stage-v7",
      destination_basename: "teacher-output-v7",
      allowed_entries: Object.freeze([
        ...FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
      ]),
    }),
  }) as AuthorityRequest;
}

function deploymentParent(home: string): string {
  return path.join(
    home,
    ...authority.FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
  );
}

function managedDeploymentDirectory(home: string, index: number): string {
  return path.join(
    home,
    ...authority.FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.slice(
      0,
      index + 1,
    ),
  );
}

function deploymentKey(home: string): string {
  return path.join(
    deploymentParent(home),
    authority.FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  );
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

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  for (
    let current = directory;
    current !== path.dirname(current) && current !== path.parse(current).root;
    current = path.dirname(current)
  ) {
    if (current.includes(PATH_CANARY)) await fs.promises.chmod(current, 0o700);
  }
}

async function writeKey(
  home: string,
  bytes: Uint8Array = KEY_BYTES,
): Promise<string> {
  const keyPath = deploymentKey(home);
  await mkdir0700(path.dirname(keyPath));
  await fs.promises.writeFile(keyPath, bytes, { flag: "wx", mode: 0o600 });
  await fs.promises.chmod(keyPath, 0o600);
  return keyPath;
}

function expectedInstanceId(
  bytes: Uint8Array,
  domain: string = authority.FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HMAC_DOMAIN,
): string {
  const instanceKey = Buffer.from(
    hkdfSync(
      "sha256",
      bytes,
      Buffer.from(authority.FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_SALT),
      Buffer.from(authority.FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_INFO),
      authority.FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
    ),
  );
  try {
    return createHmac("sha256", instanceKey).update(domain).digest("hex");
  } finally {
    instanceKey.fill(0);
  }
}

function expectAllZero(value: Uint8Array): void {
  expect([...value]).toEqual(Array.from({ length: value.byteLength }, () => 0));
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

function expectNoByteViewsOrFunctions(
  value: unknown,
  seen = new Set<object>(),
): void {
  expect(typeof value).not.toBe("function");
  expect(ArrayBuffer.isView(value)).toBe(false);
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) {
    expectNoByteViewsOrFunctions(child, seen);
  }
}

async function captureFailure(
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected operation to fail");
}

async function metadataOnlySnapshot(filePath: string): Promise<unknown> {
  try {
    const stat = await fs.promises.lstat(filePath, { bigint: true });
    return {
      present: true,
      dev: stat.dev.toString(10),
      ino: stat.ino.toString(10),
      mode: stat.mode.toString(8),
      uid: stat.uid.toString(10),
      size: stat.size.toString(10),
      nlink: stat.nlink.toString(10),
      entries: stat.isDirectory()
        ? (await fs.promises.readdir(filePath)).sort()
        : null,
    };
  } catch (error) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { present: false };
    }
    throw error;
  }
}

function withAccessor<T extends object>(
  value: T,
  key: PropertyKey,
  onAccess: () => void,
): T {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  Reflect.set(descriptors, key, {
    configurable: true,
    enumerable: true,
    get(): never {
      onAccess();
      throw new Error("accessor trap must not run");
    },
  });
  return Object.create(Object.getPrototypeOf(value), descriptors) as T;
}

function trapProxy<T extends object>(value: T, onTrap: () => void): T {
  return new Proxy(value, {
    get(): never {
      onTrap();
      throw new Error("Proxy get trap must not run");
    },
    getOwnPropertyDescriptor(): never {
      onTrap();
      throw new Error("Proxy descriptor trap must not run");
    },
    getPrototypeOf(): never {
      onTrap();
      throw new Error("Proxy prototype trap must not run");
    },
    ownKeys(): never {
      onTrap();
      throw new Error("Proxy ownKeys trap must not run");
    },
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

posixDescribe(
  "Floodgate v7 deployment-key instance enrollment candidate",
  () => {
    it("returns the authority-identical pseudonymous instance ID in a pathless candidate-only receipt", async () => {
      const home = await temporaryHome();
      const keyPath = await writeKey(home);
      const before = await fs.promises.readFile(keyPath);
      let retained: Uint8Array | undefined;
      let revalidationHookCalls = 0;
      const receipt =
        await enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
          dependencyFixture(home, {
            observeInternalKeyForTests(key: Uint8Array): void {
              retained = key;
              expect(Buffer.from(key)).toEqual(KEY_BYTES);
            },
            beforeFinalRevalidationForTests(): void {
              revalidationHookCalls += 1;
              expect(retained).toBeDefined();
              expectAllZero(retained as Uint8Array);
            },
          }),
        );
      const authorityReceipt =
        await authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
          authorityRequest(),
          authorityDependencies(home),
        );
      const parentStat = await fs.promises.lstat(deploymentParent(home), {
        bigint: true,
      });
      const keyStat = await fs.promises.lstat(keyPath, { bigint: true });
      const expected = expectedInstanceId(KEY_BYTES);

      expect(revalidationHookCalls).toBe(1);
      expect(retained).toBeDefined();
      expectAllZero(retained as Uint8Array);
      expect(receipt).toMatchObject({
        contract:
          enrollment.FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_CONTRACT,
        status:
          enrollment.FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
        execution_boundary:
          "test-only-injected-current-euid-home-key-instance-inspection",
        algorithm: authority.FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
        key_deployment: {
          layout: "fixed-current-euid-userinfo-home-v1",
          key_id: authority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
          owner_uid: effectiveUserId(),
          parent_mode: "0700",
          key_mode: "0600",
          key_bytes: authority.FLOODGATE_V7_DEPLOYMENT_KEY_BYTES,
          key_nlink: 1,
          parent_identity: {
            dev: parentStat.dev.toString(10),
            ino: parentStat.ino.toString(10),
          },
          key_identity: {
            dev: keyStat.dev.toString(10),
            ino: keyStat.ino.toString(10),
          },
          key_instance_id: expected,
          key_instance_algorithm:
            authority.FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ALGORITHM,
          held_descriptors_revalidated: true,
        },
        test_boundary: {
          production_home_origin: false,
          production_home_alias_rejected: true,
          current_effective_uid_required: true,
          test_hook_may_observe_key_copy: true,
        },
        nonclaims: {
          control_plane_approval: false,
          record_persisted: false,
          authorization_mac: false,
          connector_execution: false,
          training: false,
          weight: false,
          live_evaluation_activation: false,
          playing_strength: false,
        },
      });
      expect(receipt.key_deployment.key_instance_id).toBe(
        authorityReceipt.key_deployment.key_instance_id,
      );
      expect(receipt.key_deployment.key_instance_id).not.toBe(
        createHash("sha256").update(KEY_BYTES).digest("hex"),
      );
      expect(receipt.key_deployment.key_instance_id).not.toBe(
        authorityReceipt.authorization_mac,
      );
      expect(receipt.key_deployment.key_instance_id).not.toBe(
        expectedInstanceId(KEY_BYTES, "wrong-enrollment-domain\0"),
      );
      expect(await fs.promises.readFile(keyPath)).toEqual(before);
      expect(Object.keys(receipt)).toEqual([
        "contract",
        "status",
        "claim_boundary",
        "trust_boundary",
        "execution_boundary",
        "algorithm",
        "key_deployment",
        "test_boundary",
        "nonclaims",
      ]);
      expect(Object.keys(receipt.key_deployment)).toEqual([
        "layout",
        "key_id",
        "owner_uid",
        "parent_mode",
        "key_mode",
        "key_bytes",
        "key_nlink",
        "parent_identity",
        "key_identity",
        "key_instance_id",
        "key_instance_algorithm",
        "held_descriptors_revalidated",
      ]);
      expect(Object.keys(receipt.test_boundary ?? {})).toEqual([
        "production_home_origin",
        "production_home_alias_rejected",
        "current_effective_uid_required",
        "test_hook_may_observe_key_copy",
      ]);
      expect(Object.keys(receipt.nonclaims)).toEqual([
        "key_created_or_written",
        "key_material_disclosed",
        "root_key_hash_disclosed",
        "key_path_disclosed",
        "authorization_mac",
        "run_authorization",
        "stage_authorization",
        "checkpoint_key_capability",
        "control_plane_approval",
        "record_persisted",
        "connector_execution",
        "checkpoint",
        "runtime",
        "dataset_read",
        "teacher_label",
        "training",
        "weight",
        "live_evaluation_activation",
        "playing_strength",
      ]);
      expect(Object.values(receipt.nonclaims)).toEqual(
        Array.from({ length: 19 }, () => false),
      );
      expectDeepFrozenNullRecords(receipt);
      expectNoByteViewsOrFunctions(receipt);
      const serialized = JSON.stringify(receipt);
      expect(serialized).not.toContain(home);
      expect(serialized).not.toContain(keyPath);
      expect(serialized).not.toContain(KEY_BYTES.toString("hex"));
      expect(serialized).not.toContain(authorityReceipt.authorization_mac);
      expect(serialized).not.toMatch(/(?:absolute|relative)_?path/i);
      expect(serialized).not.toContain("run_id");
      expect(serialized).not.toContain("stage_binding");
    });

    it("inspects a canonical current-EUID 0755 home while every managed parent remains 0700", async () => {
      const home = await temporaryHome();
      await writeKey(home);
      await fs.promises.chmod(home, 0o755);

      expect((await fs.promises.lstat(home)).mode & 0o777).toBe(0o755);
      for (
        let depth = 1;
        depth <=
        authority.FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.length;
        depth += 1
      ) {
        const managedParent = path.join(
          home,
          ...authority.FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.slice(
            0,
            depth,
          ),
        );
        expect((await fs.promises.lstat(managedParent)).mode & 0o777).toBe(
          0o700,
        );
      }

      await expect(
        enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
          dependencyFixture(home),
        ),
      ).resolves.toMatchObject({
        status:
          enrollment.FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
        key_deployment: {
          parent_mode: "0700",
          key_mode: "0600",
          key_instance_id: expectedInstanceId(KEY_BYTES),
        },
      });
    });

    it("inspects a canonical current-EUID 0750 home", async () => {
      const home = await temporaryHome();
      await writeKey(home);
      await fs.promises.chmod(home, 0o750);

      await expect(
        enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
          dependencyFixture(home),
        ),
      ).resolves.toMatchObject({
        key_deployment: {
          parent_mode: "0700",
          key_instance_id: expectedInstanceId(KEY_BYTES),
        },
      });
    });

    it("fails with a sanitized namespace error for unsafe home-anchor modes", async () => {
      for (const [label, mode] of [
        ["group writable", 0o775],
        ["world writable", 0o777],
        ["owner lacks execute", 0o600],
        ["special bit", 0o1700],
      ] as const) {
        const home = await temporaryHome();
        await writeKey(home);
        await fs.promises.chmod(home, mode);
        let observerCalls = 0;
        try {
          expect((await fs.promises.lstat(home)).mode & 0o7777, label).toBe(
            mode,
          );
          const failure = await captureFailure(() =>
            enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
              dependencyFixture(home, {
                observeInternalKeyForTests(): void {
                  observerCalls += 1;
                },
              }),
            ),
          );
          expect(failure, label).toMatchObject({
            phase: "namespace",
            candidate_receipt_issued: false,
          });
          expect(String(failure), label).not.toContain(home);
          expect(observerCalls, label).toBe(0);
        } finally {
          await fs.promises.chmod(home, 0o700);
        }
      }
    });

    it("rejects a non-production symlink alias as the injected home anchor", async () => {
      const target = await temporaryHome();
      await writeKey(target);
      const aliasRoot = await temporaryHome();
      const alias = path.join(aliasRoot, "injected-home-alias");
      await fs.promises.symlink(target, alias);
      let observerCalls = 0;

      const failure = await captureFailure(() =>
        enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
          dependencyFixture(alias, {
            observeInternalKeyForTests(): void {
              observerCalls += 1;
            },
          }),
        ),
      );

      expect(failure).toMatchObject({
        phase: "namespace",
        candidate_receipt_issued: false,
      });
      expect(String(failure)).not.toContain(alias);
      expect(observerCalls).toBe(0);
    });

    it("rejects a safe-to-safe home mode race during final held-descriptor revalidation", async () => {
      const home = await temporaryHome();
      await writeKey(home);

      const failure = await captureFailure(() =>
        enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
          dependencyFixture(home, {
            async beforeFinalRevalidationForTests(): Promise<void> {
              await fs.promises.chmod(home, 0o755);
            },
          }),
        ),
      );

      expect(failure).toMatchObject({
        phase: "revalidation",
        candidate_receipt_issued: false,
        retry_disposition: "operator-reconciliation-required",
      });
      expect(String(failure)).not.toContain(home);
    });

    it("rejects 0755 and 0777 metadata on every managed directory", async () => {
      for (
        let index = 0;
        index <
        authority.FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.length;
        index += 1
      ) {
        for (const mode of [0o755, 0o777]) {
          const home = await temporaryHome();
          await writeKey(home);
          const managedDirectory = managedDeploymentDirectory(home, index);
          await fs.promises.chmod(managedDirectory, mode);

          const failure = await captureFailure(() =>
            enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
              dependencyFixture(home),
            ),
          );

          expect(failure).toMatchObject({
            phase: "namespace",
            candidate_receipt_issued: false,
          });
          expect(String(failure)).not.toContain(home);
          expect(String(failure)).not.toContain(KEY_BYTES.toString("hex"));
        }
      }
    });

    it("rejects a symlink at every managed directory boundary", async () => {
      for (
        let index = 0;
        index <
        authority.FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.length;
        index += 1
      ) {
        const home = await temporaryHome();
        await writeKey(home);
        const managedDirectory = managedDeploymentDirectory(home, index);
        const movedDirectory = `${managedDirectory}.moved`;
        await fs.promises.rename(managedDirectory, movedDirectory);
        await fs.promises.symlink(movedDirectory, managedDirectory, "dir");

        const failure = await captureFailure(() =>
          enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
            dependencyFixture(home),
          ),
        );

        expect(failure).toMatchObject({
          phase: "namespace",
          candidate_receipt_issued: false,
        });
        expect(String(failure)).not.toContain(home);
      }
    });

    it("rejects mode and symlink races on every held managed directory", async () => {
      for (
        let index = 0;
        index <
        authority.FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.length;
        index += 1
      ) {
        for (const mutation of ["mode", "symlink"] as const) {
          const home = await temporaryHome();
          await writeKey(home);
          const managedDirectory = managedDeploymentDirectory(home, index);
          const failure = await captureFailure(() =>
            enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
              dependencyFixture(home, {
                async beforeFinalRevalidationForTests(): Promise<void> {
                  if (mutation === "mode") {
                    await fs.promises.chmod(managedDirectory, 0o755);
                    return;
                  }
                  const movedDirectory = `${managedDirectory}.moved`;
                  await fs.promises.rename(managedDirectory, movedDirectory);
                  await fs.promises.symlink(
                    movedDirectory,
                    managedDirectory,
                    "dir",
                  );
                },
              }),
            ),
          );

          expect(failure).toMatchObject({
            phase: "revalidation",
            candidate_receipt_issued: false,
            retry_disposition: "operator-reconciliation-required",
          });
          expect(String(failure)).not.toContain(home);
          expect(String(failure)).not.toContain(KEY_BYTES.toString("hex"));
        }
      }
    });

    it("does not consult an inherited numeric Array setter for managed paths, handles, or snapshots", async () => {
      const home = await temporaryHome();
      await writeKey(home);
      const managedPaths =
        authority.FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS.map(
          (_component, index) => managedDeploymentDirectory(home, index),
        );
      const numericIndex = managedPaths.length - 1;
      const numericKey = String(numericIndex);
      const originalDescriptor = Object.getOwnPropertyDescriptor(
        Array.prototype,
        numericKey,
      );
      let targetSetterCalls = 0;
      let unrelatedSetterCalls = 0;
      let receipt:
        | Awaited<
            ReturnType<
              typeof enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests
            >
          >
        | undefined;

      const ownDataValue = (target: unknown[], index: number): unknown => {
        const descriptor = Object.getOwnPropertyDescriptor(
          target,
          String(index),
        );
        return descriptor !== undefined && "value" in descriptor
          ? descriptor.value
          : undefined;
      };
      const hasTargetPrefix = (
        target: unknown[],
        predicate: (value: unknown, index: number) => boolean,
      ): boolean => {
        for (let index = 0; index < numericIndex; index += 1) {
          if (!predicate(ownDataValue(target, index), index)) return false;
        }
        return true;
      };
      const isHandleLike = (value: unknown): boolean => {
        if (value === null || typeof value !== "object") return false;
        const close = Object.getOwnPropertyDescriptor(value, "close");
        return (
          close !== undefined &&
          "value" in close &&
          typeof close.value === "function"
        );
      };
      const isSnapshotLike = (value: unknown): boolean => {
        if (value === null || typeof value !== "object") return false;
        const descriptors = Object.getOwnPropertyDescriptors(value);
        for (const key of ["dev", "ino", "mode"] as const) {
          const descriptor = descriptors[key];
          if (
            descriptor === undefined ||
            !("value" in descriptor) ||
            typeof descriptor.value !== "bigint"
          ) {
            return false;
          }
        }
        return true;
      };
      const isManagedTarget = (target: unknown[], value: unknown): boolean =>
        (hasTargetPrefix(
          target,
          (child, index) => child === managedPaths[index],
        ) &&
          value === managedPaths[numericIndex]) ||
        (hasTargetPrefix(target, isHandleLike) && isHandleLike(value)) ||
        (hasTargetPrefix(target, isSnapshotLike) && isSnapshotLike(value));

      try {
        Object.defineProperty(Array.prototype, numericKey, {
          configurable: true,
          set(this: unknown[], value: unknown): void {
            if (isManagedTarget(this, value)) targetSetterCalls += 1;
            else unrelatedSetterCalls += 1;
            Object.defineProperty(this, numericKey, {
              configurable: true,
              enumerable: true,
              writable: true,
              value,
            });
          },
        });
        const unrelatedProbe: unknown[] = [];
        unrelatedProbe[numericIndex] = "unrelated-array-assignment";

        receipt =
          await enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
            dependencyFixture(home),
          );
      } finally {
        if (originalDescriptor === undefined) {
          Reflect.deleteProperty(Array.prototype, numericKey);
        } else {
          Object.defineProperty(
            Array.prototype,
            numericKey,
            originalDescriptor,
          );
        }
      }

      expect(
        Object.getOwnPropertyDescriptor(Array.prototype, numericKey),
      ).toEqual(originalDescriptor);
      expect(unrelatedSetterCalls).toBeGreaterThan(0);
      expect(targetSetterCalls).toBe(0);
      expect(receipt).toMatchObject({
        status:
          enrollment.FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_ENROLLMENT_STATUS,
        key_deployment: { key_instance_id: expectedInstanceId(KEY_BYTES) },
      });
    });

    it("is deterministic for one key and separates different deployment keys", async () => {
      const firstHome = await temporaryHome();
      await writeKey(firstHome, KEY_BYTES);
      const first =
        await enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
          dependencyFixture(firstHome),
        );
      const repeated =
        await enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
          dependencyFixture(firstHome),
        );

      const secondHome = await temporaryHome();
      await writeKey(secondHome, OTHER_KEY_BYTES);
      const second =
        await enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
          dependencyFixture(secondHome),
        );

      expect(repeated.key_deployment.key_instance_id).toBe(
        first.key_deployment.key_instance_id,
      );
      expect(second.key_deployment.key_instance_id).not.toBe(
        first.key_deployment.key_instance_id,
      );
    });

    it("fails closed for unsafe parent and key metadata without changing bytes", async () => {
      const cases: Array<
        readonly [string, (home: string, keyPath: string) => Promise<void>]
      > = [
        [
          "wrong key mode",
          async (_home, keyPath) => fs.promises.chmod(keyPath, 0o644),
        ],
        [
          "wrong parent mode",
          async (home) => fs.promises.chmod(deploymentParent(home), 0o755),
        ],
        [
          "short key",
          async (_home, keyPath) => {
            await fs.promises.truncate(keyPath, 31);
          },
        ],
        [
          "oversized key",
          async (_home, keyPath) => {
            await fs.promises.appendFile(keyPath, Buffer.of(0));
          },
        ],
        [
          "hard-linked key",
          async (_home, keyPath) =>
            fs.promises.link(keyPath, `${keyPath}.alias`),
        ],
        [
          "symlinked key",
          async (_home, keyPath) => {
            const target = `${keyPath}.target`;
            await fs.promises.rename(keyPath, target);
            await fs.promises.symlink(target, keyPath);
          },
        ],
      ];

      for (const [label, mutate] of cases) {
        const home = await temporaryHome();
        const keyPath = await writeKey(home);
        await mutate(home, keyPath);
        const before = await metadataOnlySnapshot(keyPath);
        const failure = await captureFailure(() =>
          enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
            dependencyFixture(home),
          ),
        );
        expect(failure, label).toBeInstanceOf(
          enrollment.FloodgateV7DeploymentKeyInstanceEnrollmentError,
        );
        expect(String(failure), label).not.toContain(home);
        expect(String(failure), label).not.toContain(KEY_BYTES.toString("hex"));
        expect(await metadataOnlySnapshot(keyPath), label).toEqual(before);
      }
    });

    it("zeroizes before the final hook and rejects a final pathname replacement", async () => {
      const home = await temporaryHome();
      const keyPath = await writeKey(home);
      let retained: Uint8Array | undefined;
      const failure = await captureFailure(() =>
        enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
          dependencyFixture(home, {
            observeInternalKeyForTests(key: Uint8Array): void {
              retained = key;
            },
            async beforeFinalRevalidationForTests(): Promise<void> {
              expect(retained).toBeDefined();
              expectAllZero(retained as Uint8Array);
              const replacement = `${keyPath}.replacement`;
              await fs.promises.writeFile(replacement, OTHER_KEY_BYTES, {
                flag: "wx",
                mode: 0o600,
              });
              await fs.promises.chmod(replacement, 0o600);
              await fs.promises.rename(replacement, keyPath);
            },
          }),
        ),
      );

      expect(failure).toMatchObject({
        phase: "revalidation",
        candidate_receipt_issued: false,
        retry_disposition: "operator-reconciliation-required",
      });
      expect(retained).toBeDefined();
      expectAllZero(retained as Uint8Array);
      expect(await fs.promises.readFile(keyPath)).toEqual(OTHER_KEY_BYTES);
    });

    it("zeroizes a retained key copy when the test observer throws or returns asynchronously", async () => {
      for (const returnPromise of [false, true]) {
        const home = await temporaryHome();
        await writeKey(home);
        let retained: Uint8Array | undefined;
        const failure = await captureFailure(() =>
          enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
            dependencyFixture(home, {
              observeInternalKeyForTests: ((key: Uint8Array) => {
                retained = key;
                if (returnPromise) return Promise.resolve();
                throw new Error("synthetic observer failure");
              }) as never,
            }),
          ),
        );

        expect(failure).toMatchObject({ phase: "derivation" });
        expect(retained).toBeDefined();
        expectAllZero(retained as Uint8Array);
      }
    });

    it("rejects the actual production home and wrong EUID before key observation", async () => {
      const productionHome = await fs.promises.realpath(os.userInfo().homedir);
      const parentBefore = await metadataOnlySnapshot(
        deploymentParent(productionHome),
      );
      const keyBefore = await metadataOnlySnapshot(
        deploymentKey(productionHome),
      );
      let observerCalls = 0;
      const failure = await captureFailure(() =>
        enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
          dependencyFixture(productionHome, {
            observeInternalKeyForTests(): void {
              observerCalls += 1;
            },
          }),
        ),
      );
      expect(failure).toMatchObject({ phase: "test-boundary" });
      expect(observerCalls).toBe(0);
      expect(
        await metadataOnlySnapshot(deploymentParent(productionHome)),
      ).toEqual(parentBefore);
      expect(await metadataOnlySnapshot(deploymentKey(productionHome))).toEqual(
        keyBefore,
      );

      const aliasRoot = await temporaryHome();
      const productionAlias = path.join(aliasRoot, "production-home-alias");
      await fs.promises.symlink(productionHome, productionAlias);
      await expect(
        enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
          dependencyFixture(productionAlias, {
            observeInternalKeyForTests(): void {
              observerCalls += 1;
            },
          }),
        ),
      ).rejects.toMatchObject({ phase: "test-boundary" });
      expect(observerCalls).toBe(0);

      const home = await temporaryHome();
      await writeKey(home);
      await expect(
        enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
          dependencyFixture(home, {
            effectiveUserId: effectiveUserId() + 1,
          }),
        ),
      ).rejects.toMatchObject({ phase: "test-boundary" });
    });

    it("accepts an exact null-prototype dependency and rejects structural traps without invoking them", async () => {
      const acceptedHome = await temporaryHome();
      await writeKey(acceptedHome);
      const accepted = Object.assign(
        Object.create(null),
        dependencyFixture(acceptedHome),
      ) as EnrollmentDependencies;
      await expect(
        enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
          accepted,
        ),
      ).resolves.toBeDefined();

      const rejectedHome = await temporaryHome();
      await writeKey(rejectedHome);
      let traps = 0;
      const base = dependencyFixture(rejectedHome);
      const accessor = withAccessor(base, "homeDirectory", () => {
        traps += 1;
      });
      expect(
        Object.getOwnPropertyDescriptor(accessor, "homeDirectory")?.get,
      ).toBeTypeOf("function");
      for (const malformed of [
        { ...base, extra: true } as never,
        Object.assign({ ...base }, { [Symbol("extra")]: true }) as never,
        dependencyFixture(rejectedHome, {
          homeDirectory: path.parse(rejectedHome).root,
        }),
        accessor,
        trapProxy(base, () => {
          traps += 1;
        }),
      ]) {
        await expect(
          enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
            malformed,
          ),
        ).rejects.toMatchObject({ phase: "capture" });
      }
      expect(traps).toBe(0);
    });

    it("keeps production injection closed, arities exact, and public errors pathless", async () => {
      expect(enrollment.inspectFloodgateV7DeploymentKeyInstance).toHaveLength(
        0,
      );
      expect(
        enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests,
      ).toHaveLength(1);
      await expect(
        Reflect.apply(
          enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests,
          undefined,
          [],
        ),
      ).rejects.toMatchObject({ phase: "capture" });
      await expect(
        Reflect.apply(
          enrollment.inspectFloodgateV7DeploymentKeyInstance,
          undefined,
          [dependencyFixture(await temporaryHome())],
        ),
      ).rejects.toMatchObject({ phase: "production-identity" });

      const home = await temporaryHome();
      const failure = await captureFailure(() =>
        enrollment.inspectFloodgateV7DeploymentKeyInstanceCoreForTests(
          dependencyFixture(home),
        ),
      );
      expect(Reflect.ownKeys(failure as object).sort()).toEqual(
        [
          "candidate_receipt_issued",
          "message",
          "name",
          "phase",
          "retry_disposition",
          "stack",
        ].sort(),
      );
      expect(failure).not.toHaveProperty("cause");
      expect(failure).not.toHaveProperty("path");
      expect(Object.isFrozen(failure)).toBe(true);
      expect(String(failure)).not.toContain(home);
      expect((failure as Error).stack).not.toContain(REPOSITORY_ROOT);
    });
  },
);

describe("Floodgate v7 deployment-key instance enrollment source boundary", () => {
  it("keeps enrollment read-only and operator CLIs explicit and import-safe", async () => {
    const [source, inspectCli, provisionCli, packageJson] = await Promise.all([
      fs.promises.readFile(SOURCE_PATH, "utf8"),
      fs.promises.readFile(INSPECT_CLI_PATH, "utf8"),
      fs.promises.readFile(PROVISION_CLI_PATH, "utf8"),
      fs.promises.readFile(path.join(REPOSITORY_ROOT, "package.json"), "utf8"),
    ]);

    expect(source).toContain("O_NOFOLLOW");
    expect(source).toContain("O_RDONLY");
    expect(source).not.toMatch(
      /fs\.promises\.(?:writeFile|appendFile|mkdir|chmod|link|unlink|rename)|\b(?:writeFile|appendFile|mkdir|chmod|link|unlink|rename)\(/,
    );
    expect(source).not.toMatch(
      /from\s+["']\.\/floodgate-v7-production-checkpoint-connector["']/,
    );
    expect(source).not.toMatch(/\bconsole\.(?:log|info|warn|error)\b/);
    expect(source).not.toMatch(
      /readonly\s+(?:absolute_?path|relative_?path|root_?key|key_?hash|authorization_?mac)\s*:\s*(?:string|Uint8Array|Buffer)/i,
    );

    for (const cli of [inspectCli, provisionCli]) {
      expect(cli).toContain("require.main === module");
      expect(cli).toContain("process.argv.length !== 2");
      expect(cli).toContain("JSON.stringify(receipt)");
      expect(cli).toContain("await writeOutput(process.stdout");
      expect(cli).toContain('stream.on("error", onError)');
      expect(cli).toContain('stream.off("error", onError)');
      expect(cli).toContain('process.stdout.on("error"');
      expect(cli).toContain('process.stderr.on("error"');
      expect(cli).not.toContain("console.log");
    }
    expect(packageJson).toContain(
      '"shogi:floodgate-v7-key-provision": "node -r tsx/cjs ml/provision-floodgate-v7-deployment-key.ts"',
    );
    expect(packageJson).toContain(
      '"shogi:floodgate-v7-key-instance-inspect": "node -r tsx/cjs ml/inspect-floodgate-v7-deployment-key-instance.ts"',
    );
  });
});
