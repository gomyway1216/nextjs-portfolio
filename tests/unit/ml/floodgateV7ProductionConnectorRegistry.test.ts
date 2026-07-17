import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_LEGACY_CONTRACT,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_STATUS,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
  FloodgateV7ProductionConnectorRegistryError,
  claimFloodgateV7ProductionConnectorRegistry,
  claimFloodgateV7ProductionConnectorRegistryCoreForTests,
  loadFloodgateV7ProductionConnectorRegistry,
  loadFloodgateV7ProductionConnectorRegistryCoreForTests,
  readFloodgateV7ProductionConnectorRegistryV2ApplicationSourceBindingCore,
  serializeFloodgateV7ProductionConnectorRegistryForInstallationCore,
  type FloodgateV7ProductionConnectorRegistryCapability,
  type FloodgateV7ProductionConnectorRegistryInstallationInput,
} from "../../../ml/floodgate-v7-production-connector-registry";

const EUID = process.geteuid?.() ?? 501;
const RUN_ID = "12".repeat(32);
const APPROVED_RECORD_SHA256 = "34".repeat(32);
const KEY_INSTANCE_ID = "56".repeat(32);
const VERIFIER_REVISION = "78".repeat(20);
const APPLICATION_REVISION = "9a".repeat(20);
const APPLICATION_SOURCE_LAYOUT =
  "fixed-current-euid-userinfo-home-production-application-v1" as const;
const TEST_BOUNDARY =
  "test-only-injected-current-euid-home-production-connector-registry" as const;
const temporaryRoots: string[] = [];

interface Fixture {
  readonly home: string;
  readonly registryRoot: string;
  readonly runsPath: string;
  readonly recordPath: string;
  readonly input: FloodgateV7ProductionConnectorRegistryInstallationInput;
  readonly recordText: string;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { force: true, recursive: true })),
  );
});

function inputFor(
  home: string,
): FloodgateV7ProductionConnectorRegistryInstallationInput {
  const repositoryRoot = path.join(home, "repo");
  return {
    run_id: RUN_ID,
    approved_key_binding: {
      record_bytes: 4096,
      record_sha256: APPROVED_RECORD_SHA256,
      key_instance_id: KEY_INSTANCE_ID,
    },
    verifier_revision: VERIFIER_REVISION,
    application_source_binding: {
      layout: APPLICATION_SOURCE_LAYOUT,
      revision: APPLICATION_REVISION,
    },
    repository_root: repositoryRoot,
    raw_lock_root: path.join(home, "raw-lock"),
    role_lock_root: path.join(home, "role-lock"),
    role_bundle_root: path.join(home, "role-bundle"),
    legacy_protected_position_ids_path: path.join(
      repositoryRoot,
      "protected-position-ids.txt",
    ),
    engine_args: [],
  };
}

async function makeFixture(): Promise<Fixture> {
  const canonicalTemporaryDirectory = await fs.promises.realpath(os.tmpdir());
  const createdHome = await fs.promises.mkdtemp(
    path.join(canonicalTemporaryDirectory, "floodgate-v7-registry-"),
  );
  const home = await fs.promises.realpath(createdHome);
  temporaryRoots.push(home);
  await fs.promises.chmod(home, 0o700);

  let current = home;
  for (const component of FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS) {
    current = path.join(current, component);
    await fs.promises.mkdir(current, { mode: 0o700 });
    await fs.promises.chmod(current, 0o700);
  }
  const registryRoot = current;
  const runsPath = path.join(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
  );
  await fs.promises.mkdir(runsPath, { mode: 0o700 });
  await fs.promises.chmod(runsPath, 0o700);

  const input = inputFor(home);
  const recordText =
    serializeFloodgateV7ProductionConnectorRegistryForInstallationCore(
      input,
      EUID,
      TEST_BOUNDARY,
    );
  const recordPath = path.join(
    registryRoot,
    FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  );
  await fs.promises.writeFile(recordPath, recordText, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await fs.promises.chmod(recordPath, 0o600);
  return { home, input, recordPath, recordText, registryRoot, runsPath };
}

function testDependencies(
  fixture: Fixture,
  beforeFinalRevalidationForTests?: () => void | Promise<void>,
) {
  return {
    effectiveUserId: EUID,
    homeDirectory: fixture.home,
    ...(beforeFinalRevalidationForTests === undefined
      ? {}
      : { beforeFinalRevalidationForTests }),
  };
}

async function replaceRecord(fixture: Fixture, bytes: string | Buffer) {
  await fs.promises.writeFile(fixture.recordPath, bytes);
  await fs.promises.chmod(fixture.recordPath, 0o600);
}

function expectRegistryFailure(
  action: () => unknown,
  phase?: FloodgateV7ProductionConnectorRegistryError["phase"],
) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(FloodgateV7ProductionConnectorRegistryError);
    if (phase !== undefined) {
      expect((error as FloodgateV7ProductionConnectorRegistryError).phase).toBe(
        phase,
      );
    }
    return;
  }
  throw new Error("expected registry operation to fail");
}

describe("Floodgate v7 production connector registry", () => {
  it("serializes the exact ordered canonical one-line record", async () => {
    const fixture = await makeFixture();
    const parsed = JSON.parse(fixture.recordText) as Record<string, unknown>;

    expect(fixture.recordText.endsWith("\n")).toBe(true);
    expect(fixture.recordText.slice(0, -1)).toBe(JSON.stringify(parsed));
    expect(Object.keys(parsed)).toEqual([
      "contract",
      "status",
      "layout",
      "run_id",
      "approved_key_binding",
      "verifier_revision",
      "application_source_binding",
      "repository_root",
      "raw_lock_root",
      "role_lock_root",
      "role_bundle_root",
      "legacy_protected_position_ids_path",
      "engine_args",
    ]);
    expect(parsed.contract).toBe(
      FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_CONTRACT,
    );
    expect(parsed.status).toBe(
      FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_STATUS,
    );
    expect(parsed.application_source_binding).toEqual({
      layout: APPLICATION_SOURCE_LAYOUT,
      revision: APPLICATION_REVISION,
    });
  });

  it("strictly reads only the V2 application-source binding from canonical bytes", async () => {
    const fixture = await makeFixture();
    const binding =
      readFloodgateV7ProductionConnectorRegistryV2ApplicationSourceBindingCore(
        Buffer.from(fixture.recordText, "utf8"),
      );

    expect(binding).toEqual(fixture.input.application_source_binding);
    expect(Object.getPrototypeOf(binding)).toBeNull();
    expect(Object.isFrozen(binding)).toBe(true);
  });

  it("fully inspects canonical V1 bytes but never issues mutation authority", async () => {
    const fixture = await makeFixture();
    const parsed = JSON.parse(fixture.recordText) as Record<string, unknown>;
    const legacy = {
      contract: FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_LEGACY_CONTRACT,
      status: parsed.status,
      layout: parsed.layout,
      run_id: parsed.run_id,
      approved_key_binding: parsed.approved_key_binding,
      verifier_revision: parsed.verifier_revision,
      repository_root: parsed.repository_root,
      raw_lock_root: parsed.raw_lock_root,
      role_lock_root: parsed.role_lock_root,
      role_bundle_root: parsed.role_bundle_root,
      legacy_protected_position_ids_path:
        parsed.legacy_protected_position_ids_path,
      engine_args: parsed.engine_args,
    };
    const legacyText = `${JSON.stringify(legacy)}\n`;
    await replaceRecord(fixture, legacyText);

    expect(() =>
      readFloodgateV7ProductionConnectorRegistryV2ApplicationSourceBindingCore(
        Buffer.from(legacyText, "utf8"),
      ),
    ).toThrow(/legacy registry/u);
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(fixture),
      ),
    ).rejects.toMatchObject({
      phase: "record-validation",
      capability_issued: false,
    });
  });

  it("accepts validated null-prototype records from the in-process provisioner", async () => {
    const fixture = await makeFixture();
    const binding = Object.assign(
      Object.create(null) as Record<string, unknown>,
      fixture.input.approved_key_binding,
    );
    const provisionerInput = Object.assign(
      Object.create(null) as Record<string, unknown>,
      fixture.input,
      { approved_key_binding: binding },
    ) as unknown as FloodgateV7ProductionConnectorRegistryInstallationInput;

    expect(
      serializeFloodgateV7ProductionConnectorRegistryForInstallationCore(
        provisionerInput,
        EUID,
        TEST_BOUNDARY,
      ),
    ).toBe(fixture.recordText);
  });

  it("rejects operator objects before JSON serialization can invoke coercion hooks", async () => {
    const fixture = await makeFixture();
    let hooksCalled = 0;
    const coercingValue = {
      toJSON() {
        hooksCalled += 1;
        return RUN_ID;
      },
    };
    const malformedRunId = {
      ...fixture.input,
      run_id: coercingValue,
    } as unknown as FloodgateV7ProductionConnectorRegistryInstallationInput;
    expect(() =>
      serializeFloodgateV7ProductionConnectorRegistryForInstallationCore(
        malformedRunId,
        EUID,
        TEST_BOUNDARY,
      ),
    ).toThrow(/run_id/u);

    const engineArguments: string[] = [];
    Object.defineProperty(engineArguments, "toJSON", {
      configurable: true,
      enumerable: false,
      value() {
        hooksCalled += 1;
        return [];
      },
    });
    expect(() =>
      serializeFloodgateV7ProductionConnectorRegistryForInstallationCore(
        { ...fixture.input, engine_args: engineArguments },
        EUID,
        TEST_BOUNDARY,
      ),
    ).toThrow(/engine_args/u);

    const getterInput = { ...fixture.input } as Record<string, unknown>;
    Object.defineProperty(getterInput, "repository_root", {
      configurable: true,
      enumerable: true,
      get() {
        hooksCalled += 1;
        return fixture.input.repository_root;
      },
    });
    expect(() =>
      serializeFloodgateV7ProductionConnectorRegistryForInstallationCore(
        getterInput as unknown as FloodgateV7ProductionConnectorRegistryInstallationInput,
        EUID,
        TEST_BOUNDARY,
      ),
    ).toThrow(/data property/u);
    expect(hooksCalled).toBe(0);
  });

  it("loads held fixed paths and derives only the fixed execution options", async () => {
    const fixture = await makeFixture();
    const capability =
      await loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(fixture),
      );

    expect(Object.keys(capability)).toEqual([
      "contract",
      "status",
      "execution_boundary",
    ]);
    expect(capability).toEqual({
      contract:
        "shogi-floodgate-v7-production-connector-registry-capability-v1",
      status: "opaque-single-use-private-registry-not-claimed",
      execution_boundary: TEST_BOUNDARY,
    });
    expect(Object.isFrozen(capability)).toBe(true);

    const claim =
      claimFloodgateV7ProductionConnectorRegistryCoreForTests(capability);
    const assetRoot = path.join(
      fixture.home,
      "Library",
      "Application Support",
      "nextjs-portfolio",
      "shogi-production-teacher-assets-v1",
    );
    expect(Object.keys(claim)).toEqual([
      "runId",
      "approvedKeyBinding",
      "applicationSourceBinding",
      "stageAuthorization",
      "consumer",
    ]);
    expect(claim.runId).toBe(RUN_ID);
    expect(claim.approvedKeyBinding).toEqual({
      recordBytes: 4096,
      recordSha256: APPROVED_RECORD_SHA256,
      keyInstanceId: KEY_INSTANCE_ID,
    });
    expect(claim.applicationSourceBinding).toEqual({
      layout: APPLICATION_SOURCE_LAYOUT,
      revision: APPLICATION_REVISION,
    });
    expect(claim.stageAuthorization).toEqual({
      repositoryRoot: fixture.input.repository_root,
      rawLockRoot: fixture.input.raw_lock_root,
      roleLockRoot: fixture.input.role_lock_root,
      roleBundleRoot: fixture.input.role_bundle_root,
      legacyProtectedPositionIdsPath:
        fixture.input.legacy_protected_position_ids_path,
      publicationParent: fixture.runsPath,
      stageBasename: `floodgate-v7-${RUN_ID}-stage`,
      destinationBasename: `floodgate-v7-${RUN_ID}-final`,
      engineBin: path.join(assetRoot, "engine", "yaneuraou"),
      engineReceipt: path.join(assetRoot, "engine", "yaneuraou-receipt.json"),
      engineArgs: [],
      evalDir: path.join(assetRoot, "eval"),
    });
    expect(claim.consumer).toEqual({
      repositoryRoot: fixture.input.repository_root,
      verifierRevision: VERIFIER_REVISION,
      rawLockRoot: fixture.input.raw_lock_root,
      roleLockRoot: fixture.input.role_lock_root,
      legacyProtectedPositionIdsPath:
        fixture.input.legacy_protected_position_ids_path,
      outputRoot: fixture.input.role_bundle_root,
    });
    expect(Object.isFrozen(claim)).toBe(true);
    expect(Object.isFrozen(claim.approvedKeyBinding)).toBe(true);
    expect(Object.isFrozen(claim.applicationSourceBinding)).toBe(true);
    expect(Object.isFrozen(claim.stageAuthorization)).toBe(true);
    expect(Object.isFrozen(claim.stageAuthorization.engineArgs)).toBe(true);
    expect(Object.isFrozen(claim.consumer)).toBe(true);
  });

  it("requires the exact capability and keeps it live after clone, Proxy, and cross-registry rejection", async () => {
    const fixture = await makeFixture();
    const cloneCapability =
      await loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(fixture),
      );
    expectRegistryFailure(
      () =>
        claimFloodgateV7ProductionConnectorRegistryCoreForTests({
          ...cloneCapability,
        }),
      "claim",
    );
    expect(
      claimFloodgateV7ProductionConnectorRegistryCoreForTests(cloneCapability)
        .runId,
    ).toBe(RUN_ID);

    const proxyCapability =
      await loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(fixture),
      );
    expectRegistryFailure(
      () =>
        claimFloodgateV7ProductionConnectorRegistryCoreForTests(
          new Proxy(proxyCapability, {}),
        ),
      "claim",
    );
    expect(
      claimFloodgateV7ProductionConnectorRegistryCoreForTests(proxyCapability)
        .runId,
    ).toBe(RUN_ID);

    const crossBoundaryCapability =
      await loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(fixture),
      );
    expectRegistryFailure(
      () =>
        claimFloodgateV7ProductionConnectorRegistry(crossBoundaryCapability),
      "claim",
    );
    expect(
      claimFloodgateV7ProductionConnectorRegistryCoreForTests(
        crossBoundaryCapability,
      ).runId,
    ).toBe(RUN_ID);
  });

  it("rejects manual same-shape objects and double claims", async () => {
    const fixture = await makeFixture();
    const capability =
      await loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(fixture),
      );
    const manual = {
      contract:
        "shogi-floodgate-v7-production-connector-registry-capability-v1",
      status: "opaque-single-use-private-registry-not-claimed",
      execution_boundary: TEST_BOUNDARY,
    } as FloodgateV7ProductionConnectorRegistryCapability;
    expectRegistryFailure(
      () => claimFloodgateV7ProductionConnectorRegistryCoreForTests(manual),
      "claim",
    );

    claimFloodgateV7ProductionConnectorRegistryCoreForTests(capability);
    expectRegistryFailure(
      () => claimFloodgateV7ProductionConnectorRegistryCoreForTests(capability),
      "claim",
    );
  });

  it("rejects the real production home and a symlink alias before registry access", async () => {
    const userInfo = os.userInfo();
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: await fs.promises.realpath(userInfo.homedir),
      }),
    ).rejects.toMatchObject({ phase: "test-boundary" });

    const canonicalTemporaryDirectory = await fs.promises.realpath(os.tmpdir());
    const aliasParent = await fs.promises.mkdtemp(
      path.join(canonicalTemporaryDirectory, "floodgate-v7-home-alias-"),
    );
    temporaryRoots.push(aliasParent);
    const alias = path.join(aliasParent, "production-home");
    await fs.promises.symlink(
      await fs.promises.realpath(userInfo.homedir),
      alias,
    );
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: alias,
      }),
    ).rejects.toMatchObject({ phase: "test-boundary" });

    const productionHome = await fs.promises.realpath(userInfo.homedir);
    const productionDescendant = await fs.promises.realpath(process.cwd());
    expect(
      productionDescendant.startsWith(`${productionHome}${path.sep}`),
    ).toBe(true);
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: productionDescendant,
      }),
    ).rejects.toMatchObject({ phase: "test-boundary" });

    const danglingAlias = path.join(aliasParent, "dangling-home");
    await fs.promises.symlink(
      path.join(
        productionHome,
        `floodgate-v7-registry-missing-descendant-${process.pid}-${Date.now()}`,
      ),
      danglingAlias,
    );
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: danglingAlias,
      }),
    ).rejects.toMatchObject({ phase: "test-boundary" });
  });

  it("requires exact private directory, file mode, and link count", async () => {
    const directoryFixture = await makeFixture();
    await fs.promises.chmod(directoryFixture.runsPath, 0o755);
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(directoryFixture),
      ),
    ).rejects.toMatchObject({ phase: "namespace" });

    const modeFixture = await makeFixture();
    await fs.promises.chmod(modeFixture.recordPath, 0o644);
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(modeFixture),
      ),
    ).rejects.toMatchObject({ phase: "record-open" });

    const linkFixture = await makeFixture();
    await fs.promises.link(
      linkFixture.recordPath,
      path.join(linkFixture.registryRoot, "registry-hard-link.json"),
    );
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(linkFixture),
      ),
    ).rejects.toMatchObject({ phase: "record-open" });
  });

  it("rejects symlinked fixed directory and registry entries", async () => {
    const runsFixture = await makeFixture();
    const originalRuns = `${runsFixture.runsPath}.original`;
    await fs.promises.rename(runsFixture.runsPath, originalRuns);
    await fs.promises.symlink(originalRuns, runsFixture.runsPath);
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(runsFixture),
      ),
    ).rejects.toMatchObject({ phase: "namespace" });

    const recordFixture = await makeFixture();
    const originalRecord = `${recordFixture.recordPath}.original`;
    await fs.promises.rename(recordFixture.recordPath, originalRecord);
    await fs.promises.symlink(originalRecord, recordFixture.recordPath);
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(recordFixture),
      ),
    ).rejects.toMatchObject({ phase: "record-open" });
  });

  it("fails closed when the held registry identity is replaced before issuance", async () => {
    const fixture = await makeFixture();
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(fixture, async () => {
          await fs.promises.rename(
            fixture.recordPath,
            `${fixture.recordPath}.replaced`,
          );
          await fs.promises.writeFile(fixture.recordPath, fixture.recordText, {
            mode: 0o600,
          });
          await fs.promises.chmod(fixture.recordPath, 0o600);
        }),
      ),
    ).rejects.toMatchObject({ phase: "revalidation" });
  });

  it("fails closed when the held runs directory is replaced before issuance", async () => {
    const fixture = await makeFixture();
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(fixture, async () => {
          await fs.promises.rename(fixture.runsPath, `${fixture.runsPath}.old`);
          await fs.promises.mkdir(fixture.runsPath, { mode: 0o700 });
          await fs.promises.chmod(fixture.runsPath, 0o700);
        }),
      ),
    ).rejects.toMatchObject({ phase: "revalidation" });
  });

  it("preserves the original failure phase when descriptor cleanup also fails", async () => {
    const fixture = await makeFixture();
    let firstClose = true;
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests({
        ...testDependencies(fixture, () => {
          throw new Error("synthetic revalidation failure");
        }),
        closeFileForTests(descriptor) {
          fs.closeSync(descriptor);
          if (firstClose) {
            firstClose = false;
            throw new Error("synthetic cleanup failure");
          }
        },
      }),
    ).rejects.toMatchObject({ phase: "revalidation" });
  });

  it.each([
    ["missing terminal LF", (text: string) => text.slice(0, -1)],
    ["CRLF", (text: string) => `${text.slice(0, -1)}\r\n`],
    ["UTF-8 BOM", (text: string) => `\ufeff${text}`],
    ["second line", (text: string) => `${text}\n`],
    ["noncanonical whitespace", (text: string) => ` ${text}`],
  ])("rejects %s framing", async (_label, mutate) => {
    const fixture = await makeFixture();
    await replaceRecord(fixture, mutate(fixture.recordText));
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(fixture),
      ),
    ).rejects.toMatchObject({ phase: "record-validation" });
  });

  it("rejects reordered, extra, and invalid record data", async () => {
    const reorderedFixture = await makeFixture();
    const parsed = JSON.parse(reorderedFixture.recordText) as Record<
      string,
      unknown
    >;
    const reordered = {
      status: parsed.status,
      contract: parsed.contract,
      layout: parsed.layout,
      run_id: parsed.run_id,
      approved_key_binding: parsed.approved_key_binding,
      verifier_revision: parsed.verifier_revision,
      application_source_binding: parsed.application_source_binding,
      repository_root: parsed.repository_root,
      raw_lock_root: parsed.raw_lock_root,
      role_lock_root: parsed.role_lock_root,
      role_bundle_root: parsed.role_bundle_root,
      legacy_protected_position_ids_path:
        parsed.legacy_protected_position_ids_path,
      engine_args: parsed.engine_args,
    };
    await replaceRecord(reorderedFixture, `${JSON.stringify(reordered)}\n`);
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(reorderedFixture),
      ),
    ).rejects.toMatchObject({ phase: "record-validation" });

    const extraFixture = await makeFixture();
    const extra = { ...JSON.parse(extraFixture.recordText), extra: false };
    await replaceRecord(extraFixture, `${JSON.stringify(extra)}\n`);
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(extraFixture),
      ),
    ).rejects.toMatchObject({ phase: "record-validation" });

    const invalidFixture = await makeFixture();
    const invalid = JSON.parse(invalidFixture.recordText) as {
      run_id: string;
    };
    invalid.run_id = "AB".repeat(32);
    await replaceRecord(invalidFixture, `${JSON.stringify(invalid)}\n`);
    await expect(
      loadFloodgateV7ProductionConnectorRegistryCoreForTests(
        testDependencies(invalidFixture),
      ),
    ).rejects.toMatchObject({ phase: "record-validation" });
  });

  it("rejects noncanonical paths and unsafe or oversized engine arrays in the shared serializer", async () => {
    const fixture = await makeFixture();
    expect(() =>
      serializeFloodgateV7ProductionConnectorRegistryForInstallationCore(
        { ...fixture.input, repository_root: "relative/repo" },
        EUID,
        TEST_BOUNDARY,
      ),
    ).toThrow();
    expect(() =>
      serializeFloodgateV7ProductionConnectorRegistryForInstallationCore(
        { ...fixture.input, engine_args: ["unsafe value"] },
        EUID,
        TEST_BOUNDARY,
      ),
    ).toThrow();
    expect(() =>
      serializeFloodgateV7ProductionConnectorRegistryForInstallationCore(
        { ...fixture.input, engine_args: Array(65).fill("--option") },
        EUID,
        TEST_BOUNDARY,
      ),
    ).toThrow();
  });

  it("keeps production entry points zero-argument and test claims isolated", () => {
    expect(loadFloodgateV7ProductionConnectorRegistry.length).toBe(0);
    expect(loadFloodgateV7ProductionConnectorRegistryCoreForTests.length).toBe(
      1,
    );
    expect(claimFloodgateV7ProductionConnectorRegistry.length).toBe(1);
    expect(claimFloodgateV7ProductionConnectorRegistryCoreForTests.length).toBe(
      1,
    );
  });
});
