import { createHmac, hkdfSync } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import * as authority from "../../../ml/floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
  FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
} from "../../../ml/floodgate-teacher-stage-authorization";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_HKDF_INFO,
} from "../../../ml/floodgate-v7-checkpoint-key-contract";

const REPOSITORY_ROOT = process.cwd();
const SOURCE_PATH = path.join(
  REPOSITORY_ROOT,
  "ml",
  "floodgate-v7-deployment-key-authority.ts",
);
const RUN_ID = "42".repeat(32);
const KEY_BYTES = Buffer.from(
  Array.from({ length: 32 }, (_, index) => (index * 17 + 3) & 0xff),
);
const temporaryRoots: string[] = [];
const posixDescribe = describe.runIf(typeof process.geteuid === "function");

type AuthorizationRequest = Parameters<
  typeof authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests
>[0];
type AuthorityDependencies = Parameters<
  typeof authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests
>[1];
type V3KeyRequest = Parameters<
  typeof authority.prepareFloodgateV7DeploymentTeacherCheckpointV3KeyCoreForTests
>[0];
type V3KeyAuthorization = Awaited<
  ReturnType<
    typeof authority.prepareFloodgateV7DeploymentTeacherCheckpointV3KeyCoreForTests
  >
>;

interface Fixture {
  readonly home: string;
  readonly keyPath: string;
  readonly request: AuthorizationRequest;
  readonly dependencies: AuthorityDependencies;
}

function nullRecord<T extends Record<string, unknown>>(value: T): Readonly<T> {
  const result = Object.create(null) as T;
  for (const [key, child] of Object.entries(value)) {
    Object.defineProperty(result, key, {
      configurable: false,
      enumerable: true,
      writable: false,
      value: child,
    });
  }
  return Object.freeze(result);
}

function withExtraOwnDataKey<T extends object>(value: T): T {
  const result = Object.create(Object.getPrototypeOf(value)) as T;
  Object.defineProperties(result, Object.getOwnPropertyDescriptors(value));
  Object.defineProperty(result, "unexpected", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: true,
  });
  return result;
}

function withAccessor<T extends object>(
  value: T,
  key: PropertyKey,
  onAccess: () => void,
): T {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  Object.defineProperty(descriptors, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: {
      configurable: true,
      enumerable: true,
      get(): never {
        onAccess();
        throw new Error("accessor trap must not run");
      },
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

function expectAllZero(value: Uint8Array): void {
  expect([...value]).toEqual(Array.from({ length: value.byteLength }, () => 0));
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

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("deployment key authority tests require a POSIX euid");
  }
  return process.geteuid();
}

function runBinding(
  overrides: Readonly<Record<string, unknown>> = {},
  planOverrides: Readonly<Record<string, unknown>> = {},
  controlOverrides: Readonly<Record<string, unknown>> = {},
): AuthorizationRequest["runBinding"] {
  return nullRecord({
    schema: "shogi-floodgate-v7-teacher-run-binding-v2" as const,
    plan: nullRecord({
      bytes: 10_890 as const,
      sha256:
        "ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af" as const,
      ...planOverrides,
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
      ...controlOverrides,
    }),
    stable_runtime_receipt_sha256: "11".repeat(32),
    teacher_usi_runtime_receipt_sha256: "22".repeat(32),
    ...overrides,
  }) as AuthorizationRequest["runBinding"];
}

function stageAuthorizationReceipt(
  overrides: Readonly<Record<string, unknown>> = {},
): AuthorizationRequest["stageAuthorizationReceipt"] {
  return nullRecord({
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
    ...overrides,
  }) as AuthorizationRequest["stageAuthorizationReceipt"];
}

function requestFixture(
  overrides: Readonly<Record<string, unknown>> = {},
): AuthorizationRequest {
  return nullRecord({
    runId: RUN_ID,
    keyId: authority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    runBinding: runBinding(),
    stageAuthorizationReceipt: stageAuthorizationReceipt(),
    ...overrides,
  }) as AuthorizationRequest;
}

function v3KeyRequestFixture(
  overrides: Readonly<Record<string, unknown>> = {},
): V3KeyRequest {
  const base = requestFixture();
  return nullRecord({
    runId: base.runId,
    keyId: base.keyId,
    runBinding: base.runBinding,
    stageAuthorizationReceipt: base.stageAuthorizationReceipt,
    gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
    ...overrides,
  }) as V3KeyRequest;
}

function dependencyFixture(
  homeDirectory: string,
  overrides: Readonly<Record<string, unknown>> = {},
): AuthorityDependencies {
  return nullRecord({
    effectiveUserId: effectiveUserId(),
    homeDirectory,
    observeInternalKeyForTests: undefined,
    beforeFinalRevalidationForTests: undefined,
    ...overrides,
  }) as AuthorityDependencies;
}

function deploymentKeyPath(home: string): string {
  return path.join(
    home,
    ...authority.FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
    authority.FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  );
}

async function fixture(
  keyBytes: Uint8Array = KEY_BYTES,
  dependencyOverrides: Readonly<Record<string, unknown>> = {},
): Promise<Fixture> {
  const home = await temporaryHome();
  const keyPath = deploymentKeyPath(home);
  await write0600(keyPath, keyBytes);
  return {
    home,
    keyPath,
    request: requestFixture(),
    dependencies: dependencyFixture(home, dependencyOverrides),
  };
}

async function temporaryHome(): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-v7-deployment-key-authority-"),
  );
  const home = await fs.promises.realpath(created);
  temporaryRoots.push(home);
  await fs.promises.chmod(home, 0o700);
  return home;
}

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function write0600(
  filePath: string,
  contents: Uint8Array,
): Promise<void> {
  await mkdir0700(path.dirname(filePath));
  await fs.promises.writeFile(filePath, contents, { flag: "wx", mode: 0o600 });
  await fs.promises.chmod(filePath, 0o600);
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((child) => canonicalJson(child)).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort((left, right) =>
        Buffer.compare(Buffer.from(left), Buffer.from(right)),
      )
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(
            (value as Readonly<Record<string, unknown>>)[key],
          )}`,
      )
      .join(",")}}`;
  }
  throw new Error(`unsupported golden canonical value: ${typeof value}`);
}

function collectRecordKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const child of value) collectRecordKeys(child, keys);
    return keys;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectRecordKeys(child, keys);
    }
  }
  return keys;
}

function expectedUnsignedReceipt(
  request: AuthorizationRequest,
  ownerUid: number,
  keyBytes: Uint8Array,
  identities: Readonly<{
    readonly parentDev: string;
    readonly parentIno: string;
    readonly keyDev: string;
    readonly keyIno: string;
  }>,
): Readonly<Record<string, unknown>> {
  const stage = request.stageAuthorizationReceipt;
  return nullRecord({
    contract: authority.FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_CONTRACT,
    status: authority.FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_STATUS,
    claim_boundary:
      authority.FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_CLAIM_BOUNDARY,
    trust_boundary:
      authority.FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_TRUST_BOUNDARY,
    execution_boundary:
      "test-only-injected-current-euid-home-key-deployment" as const,
    algorithm: authority.FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_ALGORITHM,
    run_id: request.runId,
    key_id: authority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
    run_binding: request.runBinding,
    stage_binding: nullRecord({
      authorization_contract: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_CONTRACT,
      authorization_trust_boundary:
        FLOODGATE_TEACHER_STAGE_AUTHORIZATION_TRUST_BOUNDARY,
      authorization_status: FLOODGATE_TEACHER_STAGE_AUTHORIZATION_STATUS,
      allowed_entries: Object.freeze([
        ...FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
      ]),
      parent_dev: stage.parent_identity.dev.toString(10),
      parent_ino: stage.parent_identity.ino.toString(10),
      stage_dev: stage.stage_identity.dev.toString(10),
      stage_ino: stage.stage_identity.ino.toString(10),
      stage_basename: stage.stage_basename,
      destination_basename: stage.destination_basename,
      lease_inode_included: false as const,
    }),
    key_deployment: nullRecord({
      layout: "fixed-current-euid-userinfo-home-v1" as const,
      relative_path:
        "Library/Application Support/nextjs-portfolio/shogi-floodgate-v7-deployment-key-v1/root-key.bin" as const,
      owner_uid: ownerUid,
      parent_mode: "0700" as const,
      key_mode: "0600" as const,
      key_bytes: 32 as const,
      key_nlink: 1 as const,
      parent_identity: nullRecord({
        dev: identities.parentDev,
        ino: identities.parentIno,
      }),
      key_identity: nullRecord({
        dev: identities.keyDev,
        ino: identities.keyIno,
      }),
      key_instance_id: expectedKeyInstanceId(keyBytes),
      key_instance_algorithm:
        "hkdf-sha256-domain-separated-hmac-sha256-v1" as const,
      held_descriptors_revalidated: true as const,
    }),
    test_boundary: nullRecord({
      production_home_origin: false as const,
      production_effective_uid_origin: false as const,
      test_hook_may_observe_key_copy: true as const,
    }),
    nonclaims: nullRecord({
      key_export: false as const,
      key_hash_disclosure: false as const,
      generic_signing: false as const,
      coordinator_origin: false as const,
      runtime_origin: false as const,
      active_stage_lease: false as const,
      stage_lease_origin: false as const,
      stage_receipt_origin: false as const,
      input_authentication: false as const,
      cross_invocation_key_rotation_detection: false as const,
      checkpoint_connector: false as const,
      dataset_read: false as const,
      checkpoint: false as const,
      runtime: false as const,
      teacher_label: false as const,
      training: false as const,
      selection_or_holdout_access: false as const,
      weight: false as const,
      live_evaluation_activation: false as const,
      match: false as const,
      playing_strength: false as const,
    }),
  });
}

function expectedKeyInstanceId(keyBytes: Uint8Array): string {
  const instanceKey = Buffer.from(
    hkdfSync(
      "sha256",
      keyBytes,
      Buffer.from(authority.FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_SALT),
      Buffer.from(authority.FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HKDF_INFO),
      32,
    ),
  );
  try {
    return createHmac("sha256", instanceKey)
      .update(authority.FLOODGATE_V7_DEPLOYMENT_KEY_INSTANCE_HMAC_DOMAIN)
      .digest("hex");
  } finally {
    instanceKey.fill(0);
  }
}

async function deploymentIdentities(keyPath: string): Promise<
  Readonly<{
    readonly parentDev: string;
    readonly parentIno: string;
    readonly keyDev: string;
    readonly keyIno: string;
  }>
> {
  const [parent, key] = await Promise.all([
    fs.promises.lstat(path.dirname(keyPath), { bigint: true }),
    fs.promises.lstat(keyPath, { bigint: true }),
  ]);
  return {
    parentDev: parent.dev.toString(10),
    parentIno: parent.ino.toString(10),
    keyDev: key.dev.toString(10),
    keyIno: key.ino.toString(10),
  };
}

function expectedAuthorizationMac(
  unsigned: Readonly<Record<string, unknown>>,
  runId: string,
  keyBytes: Uint8Array,
): string {
  const derived = Buffer.from(
    hkdfSync(
      "sha256",
      keyBytes,
      Buffer.from(runId, "hex"),
      Buffer.from(authority.FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_HKDF_INFO),
      32,
    ),
  );
  try {
    return createHmac("sha256", derived)
      .update(authority.FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_HMAC_DOMAIN)
      .update(canonicalJson(unsigned))
      .digest("hex");
  } finally {
    derived.fill(0);
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(async (root) => {
      await fs.promises.rm(root, { force: true, recursive: true });
    }),
  );
});

posixDescribe("Floodgate v7 deployment key authority", () => {
  it("returns the exact frozen test-boundary receipt and golden authorization MAC without leaking the key", async () => {
    let observedInternalKey: Uint8Array | undefined;
    const value = await fixture(KEY_BYTES, {
      observeInternalKeyForTests(key: Uint8Array): void {
        observedInternalKey = key;
        expect(Buffer.from(key)).toEqual(KEY_BYTES);
      },
    });
    const callerKeySnapshot = Buffer.from(KEY_BYTES);
    const identities = await deploymentIdentities(value.keyPath);
    const receipt =
      await authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        value.request,
        value.dependencies,
      );
    const unsigned = expectedUnsignedReceipt(
      value.request,
      effectiveUserId(),
      KEY_BYTES,
      identities,
    );
    expect(
      collectRecordKeys(unsigned).every((key) => /^[\x00-\x7f]+$/.test(key)),
    ).toBe(true);
    const goldenMac = expectedAuthorizationMac(unsigned, RUN_ID, KEY_BYTES);

    expect(receipt).toEqual({ ...unsigned, authorization_mac: goldenMac });
    expect(Object.keys(receipt)).toEqual([
      "contract",
      "status",
      "claim_boundary",
      "trust_boundary",
      "execution_boundary",
      "algorithm",
      "run_id",
      "key_id",
      "run_binding",
      "stage_binding",
      "key_deployment",
      "test_boundary",
      "nonclaims",
      "authorization_mac",
    ]);
    expect(Object.keys(receipt.stage_binding)).toEqual([
      "authorization_contract",
      "authorization_trust_boundary",
      "authorization_status",
      "allowed_entries",
      "parent_dev",
      "parent_ino",
      "stage_dev",
      "stage_ino",
      "stage_basename",
      "destination_basename",
      "lease_inode_included",
    ]);
    expect(receipt.authorization_mac).toMatch(/^[0-9a-f]{64}$/);
    expectDeepFrozenNullRecords(receipt);
    expect(observedInternalKey).toBeDefined();
    expectAllZero(observedInternalKey as Uint8Array);
    expect(KEY_BYTES).toEqual(callerKeySnapshot);
    expect(await fs.promises.readFile(value.keyPath)).toEqual(
      callerKeySnapshot,
    );

    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain(KEY_BYTES.toString("hex"));
    expect(serialized).not.toContain(KEY_BYTES.toString("base64"));
    expect(serialized).not.toContain(value.home);
    expect(serialized).not.toContain(value.keyPath);
    expect("lease_ino" in receipt.stage_binding).toBe(false);
  });

  it("keeps production dependency injection closed and labels test-only origin/nonclaims exactly", async () => {
    const value = await fixture();
    const receipt =
      await authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        value.request,
        value.dependencies,
      );

    expect(authority.authorizeFloodgateV7DeploymentTeacherRun.length).toBe(1);
    expect(
      authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests.length,
    ).toBe(2);
    expect(receipt.execution_boundary).toBe(
      "test-only-injected-current-euid-home-key-deployment",
    );
    expect(receipt.test_boundary).toEqual({
      production_home_origin: false,
      production_effective_uid_origin: false,
      test_hook_may_observe_key_copy: true,
    });
    expect(
      Object.values(receipt.nonclaims).every((claim) => claim === false),
    ).toBe(true);

    const productionFailure = await captureFailure(() =>
      authority.authorizeFloodgateV7DeploymentTeacherRun(
        requestFixture({ keyId: "caller-selected-key" }),
      ),
    );
    expect(productionFailure).toBeInstanceOf(
      authority.FloodgateV7DeploymentKeyAuthorityError,
    );
    expect(productionFailure).toMatchObject({ phase: "capture" });
  });

  it("requires exact request, run, stage, identity, array, and dependency records", async () => {
    const value = await fixture();
    const basePlan = value.request.runBinding.plan;
    const baseControl = value.request.runBinding.producer_control;
    const baseStage = value.request.stageAuthorizationReceipt;
    const invalidRequests: readonly AuthorizationRequest[] = [
      withExtraOwnDataKey(value.request),
      requestFixture({
        runBinding: withExtraOwnDataKey(value.request.runBinding),
      }),
      requestFixture({
        runBinding: runBinding({ plan: withExtraOwnDataKey(basePlan) }),
      }),
      requestFixture({
        runBinding: runBinding({
          producer_control: withExtraOwnDataKey(baseControl),
        }),
      }),
      requestFixture({
        stageAuthorizationReceipt: withExtraOwnDataKey(baseStage),
      }),
      requestFixture({
        stageAuthorizationReceipt: stageAuthorizationReceipt({
          stage_identity: withExtraOwnDataKey(baseStage.stage_identity),
        }),
      }),
      requestFixture({
        stageAuthorizationReceipt: stageAuthorizationReceipt({
          allowed_entries: Object.freeze([
            ...FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES,
            "unexpected.json",
          ]),
        }),
      }),
    ];
    for (const invalid of invalidRequests) {
      const failure = await captureFailure(() =>
        authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
          invalid,
          value.dependencies,
        ),
      );
      expect(failure).toBeInstanceOf(
        authority.FloodgateV7DeploymentKeyAuthorityError,
      );
      expect(failure).toMatchObject({ phase: "capture" });
    }

    const extraDependencyFailure = await captureFailure(() =>
      authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        value.request,
        withExtraOwnDataKey(value.dependencies),
      ),
    );
    expect(extraDependencyFailure).toMatchObject({ phase: "capture" });

    const missingOptionalKey = nullRecord({
      effectiveUserId: effectiveUserId(),
      homeDirectory: value.home,
      observeInternalKeyForTests: undefined,
    }) as unknown as AuthorityDependencies;
    const optionalDependencyReceipt =
      await authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        value.request,
        missingOptionalKey,
      );
    expect(optionalDependencyReceipt.status).toBe(
      authority.FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_STATUS,
    );
  });

  it("rejects request/dependency/nested Proxies without invoking any trap", async () => {
    const value = await fixture();
    const proxyValues: Array<
      readonly [AuthorizationRequest, AuthorityDependencies, () => number]
    > = [];
    const add = (
      build: (
        onTrap: () => void,
      ) => readonly [AuthorizationRequest, AuthorityDependencies],
    ): void => {
      let calls = 0;
      const pair = build(() => {
        calls += 1;
      });
      proxyValues.push([pair[0], pair[1], () => calls]);
    };
    add((onTrap) => [trapProxy(value.request, onTrap), value.dependencies]);
    add((onTrap) => [value.request, trapProxy(value.dependencies, onTrap)]);
    add((onTrap) => [
      requestFixture({ runBinding: trapProxy(runBinding(), onTrap) }),
      value.dependencies,
    ]);
    add((onTrap) => [
      requestFixture({
        runBinding: runBinding({
          plan: trapProxy(value.request.runBinding.plan, onTrap),
        }),
      }),
      value.dependencies,
    ]);
    add((onTrap) => [
      requestFixture({
        runBinding: runBinding({
          producer_control: trapProxy(
            value.request.runBinding.producer_control,
            onTrap,
          ),
        }),
      }),
      value.dependencies,
    ]);
    add((onTrap) => [
      requestFixture({
        stageAuthorizationReceipt: trapProxy(
          stageAuthorizationReceipt(),
          onTrap,
        ),
      }),
      value.dependencies,
    ]);
    add((onTrap) => [
      requestFixture({
        stageAuthorizationReceipt: stageAuthorizationReceipt({
          stage_identity: trapProxy(
            stageAuthorizationReceipt().stage_identity,
            onTrap,
          ),
        }),
      }),
      value.dependencies,
    ]);
    add((onTrap) => [
      requestFixture({
        stageAuthorizationReceipt: stageAuthorizationReceipt({
          allowed_entries: trapProxy(
            Object.freeze([...FLOODGATE_TEACHER_STAGE_ALLOWED_ENTRIES]),
            onTrap,
          ),
        }),
      }),
      value.dependencies,
    ]);
    add((onTrap) => [
      value.request,
      dependencyFixture(value.home, {
        observeInternalKeyForTests: trapProxy(
          (() => undefined) as () => void,
          onTrap,
        ),
      }),
    ]);

    for (const [request, dependencies, trapCalls] of proxyValues) {
      const failure = await captureFailure(() =>
        authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
          request,
          dependencies,
        ),
      );
      expect(failure).toMatchObject({ phase: "capture" });
      expect(trapCalls()).toBe(0);
    }
  });

  it("rejects top-level and nested accessors without evaluating a getter", async () => {
    const value = await fixture();
    let getterCalls = 0;
    const onAccess = (): void => {
      getterCalls += 1;
    };
    const cases: Array<readonly [AuthorizationRequest, AuthorityDependencies]> =
      [
        [withAccessor(value.request, "runId", onAccess), value.dependencies],
        [
          requestFixture({
            runBinding: withAccessor(runBinding(), "schema", onAccess),
          }),
          value.dependencies,
        ],
        [
          requestFixture({
            runBinding: runBinding({
              plan: withAccessor(
                value.request.runBinding.plan,
                "bytes",
                onAccess,
              ),
            }),
          }),
          value.dependencies,
        ],
        [
          requestFixture({
            stageAuthorizationReceipt: withAccessor(
              stageAuthorizationReceipt(),
              "status",
              onAccess,
            ),
          }),
          value.dependencies,
        ],
        [
          value.request,
          withAccessor(value.dependencies, "homeDirectory", onAccess),
        ],
      ];
    for (const [request, dependencies] of cases) {
      const failure = await captureFailure(() =>
        authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
          request,
          dependencies,
        ),
      );
      expect(failure).toMatchObject({ phase: "capture" });
      expect(getterCalls).toBe(0);
    }
  });

  it("fails closed on v1, plan, policy, digest, key ID, run ID, and stage-boundary mutations before key I/O", async () => {
    const value = await fixture();
    let observed = 0;
    const dependencies = dependencyFixture(value.home, {
      observeInternalKeyForTests(): void {
        observed += 1;
      },
    });
    const invalidRequests: readonly AuthorizationRequest[] = [
      requestFixture({ runBinding: runBinding({ schema: "v1" }) }),
      requestFixture({ runBinding: runBinding({}, { bytes: 10_889 }) }),
      requestFixture({
        runBinding: runBinding({}, { sha256: "00".repeat(32) }),
      }),
      requestFixture({
        runBinding: runBinding({}, {}, { schema: "v1" }),
      }),
      requestFixture({
        runBinding: runBinding({}, {}, { parent_deadline_ms: 1_799_999 }),
      }),
      requestFixture({
        runBinding: runBinding({}, {}, { abort_drain_ms: 29_999 }),
      }),
      requestFixture({
        runBinding: runBinding({}, {}, { max_in_flight: 11 }),
      }),
      requestFixture({
        runBinding: runBinding({}, {}, { cancel_policy: "v1" }),
      }),
      requestFixture({
        runBinding: runBinding({}, {}, { late_settlement_policy: "v1" }),
      }),
      requestFixture({
        runBinding: runBinding({
          stable_runtime_receipt_sha256: "AA".repeat(32),
        }),
      }),
      requestFixture({
        runBinding: runBinding({
          teacher_usi_runtime_receipt_sha256: "2".repeat(63),
        }),
      }),
      requestFixture({ keyId: "wrong-key-id" }),
      requestFixture({ runId: "AB".repeat(32) }),
      requestFixture({
        stageAuthorizationReceipt: stageAuthorizationReceipt({
          contract: "v1",
        }),
      }),
      requestFixture({
        stageAuthorizationReceipt: stageAuthorizationReceipt({
          stage_identity: nullRecord({ dev: BigInt(201), ino: BigInt(0) }),
        }),
      }),
    ];
    for (const invalid of invalidRequests) {
      const failure = await captureFailure(() =>
        authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
          invalid,
          dependencies,
        ),
      );
      expect(failure).toMatchObject({ phase: "capture" });
      expect(String(failure)).not.toContain(KEY_BYTES.toString("hex"));
    }
    expect(observed).toBe(0);
  });

  it("MAC-binds the exact root key, run, valid runtime digests, and stage identity", async () => {
    const first = await fixture();
    const secondKey = Buffer.from(KEY_BYTES.map((byte) => byte ^ 0xff));
    const second = await fixture(secondKey);
    const changedRun = requestFixture({ runId: "43".repeat(32) });
    const changedRuntime = requestFixture({
      runBinding: runBinding({
        stable_runtime_receipt_sha256: "33".repeat(32),
      }),
    });
    const changedStage = requestFixture({
      stageAuthorizationReceipt: stageAuthorizationReceipt({
        stage_identity: nullRecord({ dev: BigInt(201), ino: BigInt(999) }),
      }),
    });
    const changedLeaseOnly = requestFixture({
      stageAuthorizationReceipt: stageAuthorizationReceipt({
        lease_identity: nullRecord({ dev: BigInt(777), ino: BigInt(888) }),
      }),
    });
    const receipts = await Promise.all([
      authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        first.request,
        first.dependencies,
      ),
      authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        first.request,
        second.dependencies,
      ),
      authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        changedRun,
        first.dependencies,
      ),
      authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        changedRuntime,
        first.dependencies,
      ),
      authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        changedStage,
        first.dependencies,
      ),
    ]);
    expect(
      new Set(receipts.map((receipt) => receipt.authorization_mac)).size,
    ).toBe(receipts.length);
    const unsigned = expectedUnsignedReceipt(
      first.request,
      effectiveUserId(),
      KEY_BYTES,
      await deploymentIdentities(first.keyPath),
    );
    expect(expectedAuthorizationMac(unsigned, RUN_ID, secondKey)).not.toBe(
      receipts[0].authorization_mac,
    );
    expect(receipts[4].stage_binding.stage_ino).toBe("999");
    expect(receipts[4].stage_binding).not.toHaveProperty("lease_ino");
    expect(receipts[0].key_deployment.key_instance_id).not.toBe(
      receipts[1].key_deployment.key_instance_id,
    );
    for (const sameKeyReceipt of receipts.slice(2)) {
      expect(sameKeyReceipt.key_deployment.key_instance_id).toBe(
        receipts[0].key_deployment.key_instance_id,
      );
    }
    const leaseOnlyReceipt =
      await authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        changedLeaseOnly,
        first.dependencies,
      );
    expect(leaseOnlyReceipt.authorization_mac).toBe(
      receipts[0].authorization_mac,
    );
  });

  it("uses only the injected temporary deployment and rejects unsafe key files, directories, ownership, and paths", async () => {
    const cases: Array<
      readonly [
        string,
        () => Promise<
          readonly [AuthorizationRequest, AuthorityDependencies, string]
        >,
      ]
    > = [
      [
        "wrong key mode",
        async () => {
          const value = await fixture();
          await fs.promises.chmod(value.keyPath, 0o644);
          return [value.request, value.dependencies, value.home] as const;
        },
      ],
      [
        "wrong parent mode",
        async () => {
          const value = await fixture();
          await fs.promises.chmod(path.dirname(value.keyPath), 0o755);
          return [value.request, value.dependencies, value.home] as const;
        },
      ],
      [
        "short key",
        async () => {
          const value = await fixture(KEY_BYTES.subarray(0, 31));
          return [value.request, value.dependencies, value.home] as const;
        },
      ],
      [
        "oversized key",
        async () => {
          const value = await fixture(Buffer.concat([KEY_BYTES, Buffer.of(0)]));
          return [value.request, value.dependencies, value.home] as const;
        },
      ],
      [
        "hard-linked key",
        async () => {
          const value = await fixture();
          await fs.promises.link(value.keyPath, `${value.keyPath}.alias`);
          return [value.request, value.dependencies, value.home] as const;
        },
      ],
      [
        "symlinked key",
        async () => {
          const value = await fixture();
          const target = `${value.keyPath}.target`;
          await fs.promises.rename(value.keyPath, target);
          await fs.promises.symlink(target, value.keyPath);
          return [value.request, value.dependencies, value.home] as const;
        },
      ],
      [
        "wrong claimed uid",
        async () => {
          const value = await fixture();
          return [
            value.request,
            dependencyFixture(value.home, {
              effectiveUserId: effectiveUserId() + 1,
            }),
            value.home,
          ] as const;
        },
      ],
    ];
    for (const [label, build] of cases) {
      const [request, dependencies, home] = await build();
      const failure = await captureFailure(() =>
        authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
          request,
          dependencies,
        ),
      );
      expect(failure, label).toBeInstanceOf(
        authority.FloodgateV7DeploymentKeyAuthorityError,
      );
      expect(failure, label).toMatchObject({ phase: "namespace" });
      expect(String(failure), label).not.toContain(KEY_BYTES.toString("hex"));
      expect(String(failure), label).not.toContain(home);
    }

    const home = await temporaryHome();
    const relativeHomeFailure = await captureFailure(() =>
      authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        requestFixture(),
        dependencyFixture(home, { homeDirectory: "relative/home" }),
      ),
    );
    expect(relativeHomeFailure).toMatchObject({ phase: "capture" });
    const nonNormalizedFailure = await captureFailure(() =>
      authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        requestFixture(),
        dependencyFixture(home, {
          homeDirectory: `${home}${path.sep}missing${path.sep}..`,
        }),
      ),
    );
    expect(nonNormalizedFailure).toMatchObject({ phase: "capture" });

    const missingHome = await temporaryHome();
    const missingFailure = await captureFailure(() =>
      authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        requestFixture(),
        dependencyFixture(missingHome),
      ),
    );
    expect(missingFailure).toBeInstanceOf(
      authority.FloodgateV7DeploymentKeyAuthorityError,
    );
    expect(missingFailure).toMatchObject({
      phase: "namespace",
      primary: undefined,
    });
    expect(String(missingFailure)).not.toContain(missingHome);
    expect((missingFailure as Error).cause).toBeUndefined();
  });

  it("zero-fills the retained internal key on post-read failure and rejects a revalidation swap", async () => {
    let retained: Uint8Array | undefined;
    const value = await fixture(KEY_BYTES, {
      observeInternalKeyForTests(key: Uint8Array): void {
        retained = key;
        expect(Buffer.from(key)).toEqual(KEY_BYTES);
      },
      async beforeFinalRevalidationForTests(): Promise<void> {
        expect(retained).toBeDefined();
        expectAllZero(retained as Uint8Array);
        const replacement = `${deploymentKeyPath(value.home)}.replacement`;
        await fs.promises.writeFile(replacement, Buffer.alloc(32, 0x55), {
          flag: "wx",
          mode: 0o600,
        });
        await fs.promises.chmod(replacement, 0o600);
        await fs.promises.rename(replacement, deploymentKeyPath(value.home));
      },
    });
    const failure = await captureFailure(() =>
      authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        value.request,
        value.dependencies,
      ),
    );
    expect(failure).toBeInstanceOf(
      authority.FloodgateV7DeploymentKeyAuthorityError,
    );
    expect(["namespace", "revalidation"]).toContain(
      (failure as authority.FloodgateV7DeploymentKeyAuthorityError).phase,
    );
    expect(retained).toBeDefined();
    expectAllZero(retained as Uint8Array);
    expect(String(failure)).not.toContain(KEY_BYTES.toString("hex"));
    expect(String(failure)).not.toContain(KEY_BYTES.toString("base64"));
  });

  it("zero-fills the internal key even when the test-only observer throws", async () => {
    let retained: Uint8Array | undefined;
    const marker = new Error("observer failure without key material");
    const value = await fixture(KEY_BYTES, {
      observeInternalKeyForTests(key: Uint8Array): never {
        retained = key;
        throw marker;
      },
    });
    const failure = await captureFailure(() =>
      authority.authorizeFloodgateV7DeploymentTeacherRunCoreForTests(
        value.request,
        value.dependencies,
      ),
    );
    expect(failure).not.toBe(marker);
    expect(failure).toBeInstanceOf(
      authority.FloodgateV7DeploymentKeyAuthorityError,
    );
    expect(failure).toMatchObject({
      phase: "authorization",
      primary: undefined,
    });
    expect(retained).toBeDefined();
    expectAllZero(retained as Uint8Array);
  });

  it("prepares an exact opaque V3 facade while preserving the existing receipt boundary", async () => {
    let observedInternalKey: Uint8Array | undefined;
    const value = await fixture(KEY_BYTES, {
      observeInternalKeyForTests(key: Uint8Array): void {
        observedInternalKey = key;
        expect(Buffer.from(key)).toEqual(KEY_BYTES);
      },
    });
    const request = v3KeyRequestFixture();
    const prepared =
      await authority.prepareFloodgateV7DeploymentTeacherCheckpointV3KeyCoreForTests(
        request,
        value.dependencies,
      );

    expect(Object.keys(prepared)).toEqual([
      "contract",
      "status",
      "claim_boundary",
      "gate",
      "authorization",
    ]);
    expect(prepared).toMatchObject({
      contract:
        authority.FLOODGATE_V7_DEPLOYMENT_TEACHER_CHECKPOINT_V3_KEY_CONTRACT,
      status:
        authority.FLOODGATE_V7_DEPLOYMENT_TEACHER_CHECKPOINT_V3_KEY_STATUS,
      claim_boundary:
        authority.FLOODGATE_V7_DEPLOYMENT_TEACHER_CHECKPOINT_V3_KEY_CLAIM_BOUNDARY,
      gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
      authorization: {
        contract: authority.FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_CONTRACT,
        status: authority.FLOODGATE_V7_DEPLOYMENT_KEY_AUTHORITY_STATUS,
        run_id: RUN_ID,
        key_id: authority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
        execution_boundary:
          "test-only-injected-current-euid-home-key-deployment",
      },
    });
    expectDeepFrozenNullRecords(prepared);
    expectNoByteViewsOrFunctions(prepared);
    expect(observedInternalKey).toBeDefined();
    expectAllZero(observedInternalKey as Uint8Array);

    const serialized = JSON.stringify(prepared);
    expect(serialized).not.toContain(KEY_BYTES.toString("hex"));
    expect(serialized).not.toContain(KEY_BYTES.toString("base64"));
    expect(serialized).not.toContain(value.home);
    expect(serialized).not.toContain(value.keyPath);
    authority.discardFloodgateV7DeploymentTeacherCheckpointV3Key(prepared);
    authority.discardFloodgateV7DeploymentTeacherCheckpointV3Key(prepared);
  });

  it("claims one standalone deterministic V3 derived key and preserves the exact token across pre-claim rejection", async () => {
    const value = await fixture();
    const request = v3KeyRequestFixture();
    const prepared =
      await authority.prepareFloodgateV7DeploymentTeacherCheckpointV3KeyCoreForTests(
        request,
        value.dependencies,
      );
    const clone = nullRecord({
      ...prepared,
    }) as V3KeyAuthorization;
    let proxyTraps = 0;
    const proxy = trapProxy(prepared, () => {
      proxyTraps += 1;
    });

    expect(() =>
      authority.claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKeyCoreForTests(
        clone,
        request,
      ),
    ).toThrow(/exact prepared authorization facade/);
    expect(() =>
      authority.claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKeyCoreForTests(
        proxy,
        request,
      ),
    ).toThrow(/exact non-Proxy facade/);
    expect(proxyTraps).toBe(0);
    expect(() =>
      authority.claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKey(
        prepared as never,
        request,
      ),
    ).toThrow(/test-only boundary/);
    expect(() =>
      Reflect.apply(
        authority.claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKeyCoreForTests,
        undefined,
        [prepared],
      ),
    ).toThrow(/exactly two arguments/);

    const derived =
      authority.claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKeyCoreForTests(
        prepared,
        request,
      );
    const expected = Buffer.from(
      hkdfSync(
        "sha256",
        KEY_BYTES,
        Buffer.from(RUN_ID, "hex"),
        Buffer.from(FLOODGATE_V7_TEACHER_CHECKPOINT_V3_HKDF_INFO),
        32,
      ),
    );
    expect(Object.getPrototypeOf(derived)).toBe(Uint8Array.prototype);
    expect(derived).not.toBeInstanceOf(Buffer);
    expect(derived.byteOffset).toBe(0);
    expect(derived.byteLength).toBe(32);
    expect(derived.buffer.byteLength).toBe(32);
    expect(derived.buffer).toBeInstanceOf(ArrayBuffer);
    expect(Buffer.from(derived)).toEqual(expected);
    expect(() =>
      authority.claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKeyCoreForTests(
        prepared,
        request,
      ),
    ).toThrow(/already consumed/);
    authority.discardFloodgateV7DeploymentTeacherCheckpointV3Key(prepared);
    derived.fill(0);
    expected.fill(0);
  });

  it("consumes and zeroizes a prepared V3 key on every exact-binding mismatch", async () => {
    const value = await fixture();
    const request = v3KeyRequestFixture();
    const mismatches: readonly V3KeyRequest[] = [
      v3KeyRequestFixture({
        gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
      }),
      v3KeyRequestFixture({ runId: "43".repeat(32) }),
      v3KeyRequestFixture({
        runBinding: runBinding({
          stable_runtime_receipt_sha256: "33".repeat(32),
        }),
      }),
      v3KeyRequestFixture({
        stageAuthorizationReceipt: stageAuthorizationReceipt({
          stage_identity: nullRecord({ dev: BigInt(201), ino: BigInt(999) }),
        }),
      }),
      v3KeyRequestFixture({
        stageAuthorizationReceipt: stageAuthorizationReceipt({
          lease_identity: nullRecord({ dev: BigInt(201), ino: BigInt(999) }),
        }),
      }),
      v3KeyRequestFixture({
        gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
      }),
    ];

    for (const mismatch of mismatches) {
      const prepared =
        await authority.prepareFloodgateV7DeploymentTeacherCheckpointV3KeyCoreForTests(
          request,
          value.dependencies,
        );
      expect(() =>
        authority.claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKeyCoreForTests(
          prepared,
          mismatch,
        ),
      ).toThrow(/differs from the prepared binding/);
      expect(() =>
        authority.claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKeyCoreForTests(
          prepared,
          request,
        ),
      ).toThrow(/already consumed/);
    }
  });

  it("discards either registry idempotently and rejects fake or Proxy facades without traps", async () => {
    const value = await fixture();
    const request = v3KeyRequestFixture();
    const prepared =
      await authority.prepareFloodgateV7DeploymentTeacherCheckpointV3KeyCoreForTests(
        request,
        value.dependencies,
      );
    const fake = nullRecord({ ...prepared }) as V3KeyAuthorization;
    let proxyTraps = 0;
    const proxy = trapProxy(prepared, () => {
      proxyTraps += 1;
    });

    expect(() =>
      authority.discardFloodgateV7DeploymentTeacherCheckpointV3Key(fake),
    ).toThrow(/exact prepared authorization facade/);
    expect(() =>
      authority.discardFloodgateV7DeploymentTeacherCheckpointV3Key(proxy),
    ).toThrow(/exact non-Proxy facade/);
    expect(proxyTraps).toBe(0);
    authority.discardFloodgateV7DeploymentTeacherCheckpointV3Key(prepared);
    authority.discardFloodgateV7DeploymentTeacherCheckpointV3Key(prepared);
    expect(() =>
      authority.claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKeyCoreForTests(
        prepared,
        request,
      ),
    ).toThrow(/already consumed or discarded/);
  });

  it("keeps V3 preparation arity and failure cleanup fail closed without exposing the derived key", async () => {
    const value = await fixture();
    const request = v3KeyRequestFixture();
    expect(
      authority.prepareFloodgateV7DeploymentTeacherCheckpointV3Key.length,
    ).toBe(1);
    expect(
      authority.prepareFloodgateV7DeploymentTeacherCheckpointV3KeyCoreForTests
        .length,
    ).toBe(2);
    expect(
      authority.claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKey.length,
    ).toBe(2);
    expect(
      authority
        .claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKeyCoreForTests
        .length,
    ).toBe(2);
    expect(
      authority.discardFloodgateV7DeploymentTeacherCheckpointV3Key.length,
    ).toBe(1);

    let retained: Uint8Array | undefined;
    const failing = await fixture(KEY_BYTES, {
      observeInternalKeyForTests(key: Uint8Array): void {
        retained = key;
      },
      async beforeFinalRevalidationForTests(): Promise<void> {
        expect(retained).toBeDefined();
        expectAllZero(retained as Uint8Array);
        throw new Error("synthetic revalidation failure");
      },
    });
    const failure = await captureFailure(() =>
      authority.prepareFloodgateV7DeploymentTeacherCheckpointV3KeyCoreForTests(
        request,
        failing.dependencies,
      ),
    );
    expect(failure).toBeInstanceOf(
      authority.FloodgateV7DeploymentKeyAuthorityError,
    );
    expect(failure).toMatchObject({ phase: "revalidation" });
    expect(retained).toBeDefined();
    expectAllZero(retained as Uint8Array);

    expect(() =>
      Reflect.apply(
        authority.prepareFloodgateV7DeploymentTeacherCheckpointV3KeyCoreForTests,
        undefined,
        [request],
      ),
    ).toThrow(/exactly two arguments/);
    await expect(
      authority.prepareFloodgateV7DeploymentTeacherCheckpointV3Key(
        v3KeyRequestFixture({ keyId: "caller-selected-key" }),
      ),
    ).rejects.toMatchObject({ phase: "capture" });
    expect(value.request.keyId).toBe(authority.FLOODGATE_V7_DEPLOYMENT_KEY_ID);
  });
});

describe("Floodgate v7 deployment key authority source boundary", () => {
  it("has no dataset, checkpoint implementation, engine runtime, key material, or generic signer surface", async () => {
    const source = await fs.promises.readFile(SOURCE_PATH, "utf8");

    for (const forbiddenModule of [
      "floodgate-training-row-consumer",
      "floodgate-v7-teacher-checkpoint",
      "floodgate-v7-production-parent-coordinator",
      "floodgate-v7-production-runtime-owner",
      "floodgate-production-stable-wasm-runtime",
      "floodgate-production-teacher-usi-runtime",
      "verify-existing-floodgate-role-bundle",
    ]) {
      expect(source).not.toContain(`from "./${forbiddenModule}"`);
      expect(source).not.toContain(`from './${forbiddenModule}'`);
    }
    expect(source).not.toMatch(
      /["'`][^"'`\n]*(?:train\.jsonl|work\.jsonl|shogi-nnue-weights\.bin|floodgate-q1-2026-label-free-role-bundle)[^"'`\n]*["'`]/i,
    );
    expect(source).not.toMatch(
      /export\s+(?:async\s+)?function\s+.*(?:sign|hmac|hash|root_?key)/i,
    );
    expect(
      [
        ...source.matchAll(
          /export function ([A-Za-z0-9_]*Key[A-Za-z0-9_]*)\s*\(/g,
        ),
      ].map((match) => match[1]),
    ).toEqual([
      "prepareFloodgateV7DeploymentTeacherCheckpointV3KeyCoreForTests",
      "prepareFloodgateV7DeploymentTeacherCheckpointV3Key",
      "claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKey",
      "claimFloodgateV7DeploymentTeacherCheckpointV3DerivedKeyCoreForTests",
      "discardFloodgateV7DeploymentTeacherCheckpointV3Key",
    ]);
    expect(source).not.toMatch(/readonly\s+(?:root_?key|key_?material)\s*:/i);
    expect(source).not.toMatch(/\bconsole\.(?:log|info|warn|error)\b/);
    expect(source).toContain("observeInternalKeyForTests: undefined");
    expect(
      authority.FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
    ).toEqual([
      "Library",
      "Application Support",
      "nextjs-portfolio",
      "shogi-floodgate-v7-deployment-key-v1",
    ]);
    expect(authority.FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME).toBe("root-key.bin");
  });
});
