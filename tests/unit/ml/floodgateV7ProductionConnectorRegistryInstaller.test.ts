import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  authorizeFloodgateV7ProductionApplicationExecutionCoreForTests,
  claimFloodgateV7ProductionApplicationExecutionCoreForTests,
} from "../../../ml/floodgate-v7-production-application-source-authorization";
import {
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
  claimFloodgateV7ProductionConnectorRegistryCoreForTests,
  loadFloodgateV7ProductionConnectorRegistryCoreForTests,
  serializeFloodgateV7ProductionConnectorRegistryForInstallationCore,
  type FloodgateV7ProductionConnectorRegistryInstallationInput,
} from "../../../ml/floodgate-v7-production-connector-registry";
import * as installer from "../../../ml/floodgate-v7-production-connector-registry-installer";

const EUID = process.geteuid?.() ?? 501;
const RUN_ID = "a1".repeat(32);
const RECORD_SHA256 = "b2".repeat(32);
const KEY_INSTANCE_ID = "c3".repeat(32);
const VERIFIER_REVISION = "d4".repeat(20);
const APPLICATION_REVISION = "e5".repeat(20);
const VALUE_CANARY = "registry-installer-secret-canary";
const PATH_CANARY = "registry-installer-path-canary";
const STAGING_BASENAME = ".registry.json.installing-v1";
const temporaryRoots: string[] = [];
const posixDescribe = describe.runIf(typeof process.geteuid === "function");

type InstallerDependencies = Parameters<
  typeof installer.installFloodgateV7ProductionConnectorRegistryCoreForTests
>[1];
type Failpoint = NonNullable<InstallerDependencies["failpointForTests"]>;
type FailpointPhase = Parameters<Failpoint>[0];

const FAILPOINTS = Object.freeze([
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

async function temporaryHome(): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), `${PATH_CANARY}-`),
  );
  const home = await fs.promises.realpath(created);
  temporaryRoots.push(home);
  await fs.promises.chmod(home, 0o700);
  return home;
}

function registryInput(
  home: string,
  overrides: Readonly<
    Partial<FloodgateV7ProductionConnectorRegistryInstallationInput>
  > = {},
): FloodgateV7ProductionConnectorRegistryInstallationInput {
  return {
    run_id: RUN_ID,
    approved_key_binding: {
      record_bytes: 4096,
      record_sha256: RECORD_SHA256,
      key_instance_id: KEY_INSTANCE_ID,
    },
    verifier_revision: VERIFIER_REVISION,
    application_source_binding: {
      layout:
        "fixed-current-euid-userinfo-home-production-application-v1" as const,
      revision: APPLICATION_REVISION,
    },
    repository_root: path.join(home, "repository"),
    raw_lock_root: path.join(home, "raw-lock"),
    role_lock_root: path.join(home, "role-lock"),
    role_bundle_root: path.join(home, "role-bundle"),
    legacy_protected_position_ids_path: path.join(
      home,
      "legacy-protected-position-ids.json",
    ),
    engine_args: ["--threads", "--hash", path.join(home, "engine-option")],
    ...overrides,
  };
}

function canonicalRegistry(
  value: FloodgateV7ProductionConnectorRegistryInstallationInput,
): string {
  return serializeFloodgateV7ProductionConnectorRegistryForInstallationCore(
    value,
    EUID,
    "test-only-injected-current-euid-home-production-connector-registry",
  );
}

function registryRoot(home: string): string {
  return path.join(
    home,
    ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS,
  );
}

function registryPath(home: string): string {
  return path.join(
    registryRoot(home),
    FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
  );
}

function stagingPath(home: string): string {
  return path.join(registryRoot(home), STAGING_BASENAME);
}

function runsPath(home: string): string {
  return path.join(
    registryRoot(home),
    FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
  );
}

function managedDirectory(home: string, index: number): string {
  return path.join(
    home,
    ...FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS.slice(
      0,
      index + 1,
    ),
  );
}

function dependencies(
  homeDirectory: string,
  overrides: Readonly<Record<string, unknown>> = {},
): InstallerDependencies {
  return {
    effectiveUserId: EUID,
    homeDirectory,
    ...overrides,
  } as InstallerDependencies;
}

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function write0600(
  filePath: string,
  value: string | Uint8Array,
): Promise<void> {
  await mkdir0700(path.dirname(filePath));
  await fs.promises.writeFile(filePath, value, { flag: "wx", mode: 0o600 });
  await fs.promises.chmod(filePath, 0o600);
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

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected registry installation to fail");
}

function captureSynchronousFailure(operation: () => void): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected registry installation to fail synchronously");
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
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

posixDescribe("Floodgate v7 production connector registry installer", () => {
  it("requires the fixed source entry and staged capability at the production export before input access or mutation", async () => {
    expect(installer.installFloodgateV7ProductionConnectorRegistry.length).toBe(
      2,
    );
    const home = await temporaryHome();
    const input = registryInput(home);
    const missingCapabilityFailure = await captureFailure(() =>
      Reflect.apply(
        installer.installFloodgateV7ProductionConnectorRegistry,
        undefined,
        [input],
      ),
    );
    expect(missingCapabilityFailure).toMatchObject({
      phase: "capture",
      durability: "no-installation-change-established",
      registry_may_have_been_created: false,
    });

    const forgedCapabilityFailure = await captureFailure(() =>
      installer.installFloodgateV7ProductionConnectorRegistry(
        input,
        Object.freeze({
          contract: "forged",
          status: "forged",
        }) as never,
      ),
    );
    expect(forgedCapabilityFailure).toMatchObject({
      phase: "production-identity",
      durability: "no-installation-change-established",
      registry_may_have_been_created: false,
    });
    expect(JSON.stringify(missingCapabilityFailure)).not.toContain(home);
    expect(JSON.stringify(forgedCapabilityFailure)).not.toContain(home);
    expect(JSON.stringify(forgedCapabilityFailure)).not.toContain(
      APPLICATION_REVISION,
    );
    expect(await entriesOrEmpty(home)).toEqual([]);

    const stagedCapability =
      await authorizeFloodgateV7ProductionApplicationExecutionCoreForTests(
        "production-registry-provision",
        async () => ({
          layout:
            "fixed-current-euid-userinfo-home-production-application-v1" as const,
          revision: APPLICATION_REVISION,
        }),
      );
    claimFloodgateV7ProductionApplicationExecutionCoreForTests(
      stagedCapability,
      "production-registry-provision",
      "provisioner",
    );
    expect(() =>
      installer.claimFloodgateV7ProductionConnectorRegistryInstallerApplicationExecutionCoreForTests(
        stagedCapability,
      ),
    ).not.toThrow();
    expect(
      captureSynchronousFailure(() =>
        installer.claimFloodgateV7ProductionConnectorRegistryInstallerApplicationExecutionCoreForTests(
          stagedCapability,
        ),
      ),
    ).toMatchObject({
      phase: "production-identity",
      registry_may_have_been_created: false,
    });
    expect(
      captureSynchronousFailure(() =>
        installer.claimFloodgateV7ProductionConnectorRegistryInstallerApplicationExecutionCoreForTests(
          Object.freeze({ contract: "forged", status: "forged" }) as never,
        ),
      ),
    ).toMatchObject({
      phase: "production-identity",
      registry_may_have_been_created: false,
    });
  });

  it("publishes exact canonical bytes with the fixed private layout and loader integration", async () => {
    const home = await temporaryHome();
    const input = registryInput(home);
    const expected = canonicalRegistry(input);

    const receipt =
      await installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
        input,
        dependencies(home),
      );

    for (
      let index = 0;
      index <
      FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS.length;
      index += 1
    ) {
      const stat = await fs.promises.lstat(managedDirectory(home, index), {
        bigint: true,
      });
      expect(stat.isDirectory()).toBe(true);
      expect(stat.uid).toBe(BigInt(EUID));
      expect(stat.mode & BigInt(0o7777)).toBe(BigInt(0o700));
    }
    const runsStat = await fs.promises.lstat(runsPath(home), { bigint: true });
    expect(runsStat.isDirectory()).toBe(true);
    expect(runsStat.uid).toBe(BigInt(EUID));
    expect(runsStat.mode & BigInt(0o7777)).toBe(BigInt(0o700));

    const finalStat = await fs.promises.lstat(registryPath(home), {
      bigint: true,
    });
    expect(finalStat.isFile()).toBe(true);
    expect(finalStat.uid).toBe(BigInt(EUID));
    expect(finalStat.mode & BigInt(0o7777)).toBe(BigInt(0o600));
    expect(finalStat.nlink).toBe(BigInt(1));
    expect(await fs.promises.readFile(registryPath(home), "utf8")).toBe(
      expected,
    );
    expect(await entriesOrEmpty(registryRoot(home))).toEqual(
      [
        FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
        FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
      ].sort(),
    );

    expect(receipt).toMatchObject({
      execution_boundary:
        "test-only-injected-current-euid-home-production-connector-registry-installation",
      registry: {
        managed_directory_mode: "0700",
        runs_directory_mode: "0700",
        registry_mode: "0600",
        registry_nlink: 1,
        durability: "registry-published-and-staging-removal-durable",
        held_descriptors_revalidated: true,
      },
      registry_binding: {
        registry_canonical_bytes_validated: true,
        approved_record_binding_captured: true,
        application_source_binding_captured: true,
        immutable_run_configuration_captured: true,
      },
      test_boundary: {
        production_home_origin: false,
        production_effective_uid_origin: false,
        failure_hooks_may_be_test_injected: true,
      },
    });
    expectDeepFrozenNullRecords(receipt);
    const serializedReceipt = JSON.stringify(receipt);
    for (const secret of [
      home,
      PATH_CANARY,
      RUN_ID,
      RECORD_SHA256,
      KEY_INSTANCE_ID,
      VERIFIER_REVISION,
      APPLICATION_REVISION,
      input.repository_root,
      input.engine_args[2],
    ]) {
      expect(serializedReceipt).not.toContain(secret);
    }

    const capability =
      await loadFloodgateV7ProductionConnectorRegistryCoreForTests({
        effectiveUserId: EUID,
        homeDirectory: home,
      });
    const claim =
      claimFloodgateV7ProductionConnectorRegistryCoreForTests(capability);
    expect(claim).toMatchObject({
      runId: RUN_ID,
      approvedKeyBinding: {
        recordBytes: 4096,
        recordSha256: RECORD_SHA256,
        keyInstanceId: KEY_INSTANCE_ID,
      },
      stageAuthorization: {
        publicationParent: runsPath(home),
        engineArgs: input.engine_args,
      },
      consumer: {
        repositoryRoot: input.repository_root,
        verifierRevision: VERIFIER_REVISION,
      },
    });
  });

  it("validates exact input before any namespace mutation", async () => {
    const home = await temporaryHome();
    let accessorCalls = 0;
    const accessorInput = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessorInput, "run_id", {
      enumerable: true,
      get() {
        accessorCalls += 1;
        return RUN_ID;
      },
    });
    Object.assign(accessorInput, {
      approved_key_binding: registryInput(home).approved_key_binding,
      verifier_revision: VERIFIER_REVISION,
      repository_root: path.join(home, "repository"),
      raw_lock_root: path.join(home, "raw-lock"),
      role_lock_root: path.join(home, "role-lock"),
      role_bundle_root: path.join(home, "role-bundle"),
      legacy_protected_position_ids_path: path.join(home, "legacy.json"),
      engine_args: [],
    });
    const invalidInputs = [
      { ...registryInput(home), run_id: RUN_ID.toUpperCase() },
      { ...registryInput(home), verifier_revision: "00".repeat(19) },
      { ...registryInput(home), repository_root: "relative" },
      { ...registryInput(home), engine_args: ["value with spaces"] },
      { ...registryInput(home), unknown: VALUE_CANARY },
      accessorInput,
    ];

    for (const invalid of invalidInputs) {
      const failure = await captureFailure(() =>
        installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
          invalid as unknown as FloodgateV7ProductionConnectorRegistryInstallationInput,
          dependencies(home),
        ),
      );
      expect(failure).toMatchObject({
        phase: "registry-validation",
        registry_may_have_been_created: false,
        durability: "no-installation-change-established",
        retry_disposition: "manual-reconciliation-required",
      });
      expect(String(failure)).not.toContain(VALUE_CANARY);
      expect(String(failure)).not.toContain(home);
      expect(await entriesOrEmpty(home)).toEqual([]);
    }
    expect(accessorCalls).toBe(0);
  });

  it("never overwrites, adopts, or treats an existing registry as success", async () => {
    const home = await temporaryHome();
    const first = registryInput(home);
    await installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
      first,
      dependencies(home),
    );
    const beforeBytes = await fs.promises.readFile(registryPath(home));
    const before = await fs.promises.lstat(registryPath(home), {
      bigint: true,
    });

    const failure = await captureFailure(() =>
      installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
        registryInput(home, { run_id: "e5".repeat(32) }),
        dependencies(home),
      ),
    );
    const after = await fs.promises.lstat(registryPath(home), { bigint: true });
    expect(after.dev).toBe(before.dev);
    expect(after.ino).toBe(before.ino);
    expect(await fs.promises.readFile(registryPath(home))).toEqual(beforeBytes);
    expect(failure).toMatchObject({
      registry_may_have_been_created: false,
      retry_disposition: "do-not-retry-existing-registry",
    });
    expect(String(failure)).not.toContain(home);
    expect(String(failure)).not.toContain(RUN_ID);
  });

  it("does not remove or adopt a preexisting or O_EXCL-racing staging name", async () => {
    for (const raced of [false, true]) {
      const home = await temporaryHome();
      const competitor = `${VALUE_CANARY}-${raced ? "race" : "stale"}\n`;
      if (!raced) await write0600(stagingPath(home), competitor);
      const failure = await captureFailure(() =>
        installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
          registryInput(home),
          dependencies(home, {
            failpointForTests: raced
              ? (phase: FailpointPhase) => {
                  if (phase === "after-parent-created") {
                    fs.writeFileSync(stagingPath(home), competitor, {
                      flag: "wx",
                      mode: 0o600,
                    });
                    fs.chmodSync(stagingPath(home), 0o600);
                  }
                }
              : undefined,
          }),
        ),
      );
      expect(failure).toMatchObject({
        registry_may_have_been_created: false,
        retry_disposition: "manual-reconciliation-required",
      });
      expect(await fs.promises.readFile(stagingPath(home), "utf8")).toBe(
        competitor,
      );
      expect(fs.existsSync(registryPath(home))).toBe(false);
      expect(String(failure)).not.toContain(competitor);
      expect(String(failure)).not.toContain(home);
    }
  });

  it("rejects unsafe home, managed-directory, runs, and symlink namespaces", async () => {
    const writableHome = await temporaryHome();
    await fs.promises.chmod(writableHome, 0o777);
    const writableFailure = await captureFailure(() =>
      installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
        registryInput(writableHome),
        dependencies(writableHome),
      ),
    );
    expect(writableFailure).toMatchObject({
      registry_may_have_been_created: false,
    });

    const wrongModeHome = await temporaryHome();
    await mkdir0700(registryRoot(wrongModeHome));
    await fs.promises.chmod(managedDirectory(wrongModeHome, 1), 0o755);
    const wrongModeFailure = await captureFailure(() =>
      installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
        registryInput(wrongModeHome),
        dependencies(wrongModeHome),
      ),
    );
    expect(wrongModeFailure).toMatchObject({
      registry_may_have_been_created: false,
    });

    const runsHome = await temporaryHome();
    await mkdir0700(runsPath(runsHome));
    await fs.promises.chmod(runsPath(runsHome), 0o755);
    const runsFailure = await captureFailure(() =>
      installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
        registryInput(runsHome),
        dependencies(runsHome),
      ),
    );
    expect(runsFailure).toMatchObject({
      registry_may_have_been_created: false,
    });

    const symlinkContainer = await temporaryHome();
    const target = path.join(symlinkContainer, "target");
    const linkedHome = path.join(symlinkContainer, "linked-home");
    await mkdir0700(target);
    await fs.promises.symlink(target, linkedHome);
    const symlinkFailure = await captureFailure(() =>
      installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
        registryInput(linkedHome),
        dependencies(linkedHome),
      ),
    );
    expect(symlinkFailure).toMatchObject({
      registry_may_have_been_created: false,
    });

    for (const failure of [
      writableFailure,
      wrongModeFailure,
      runsFailure,
      symlinkFailure,
    ]) {
      expect(String(failure)).not.toContain(PATH_CANARY);
      expect(String(failure)).not.toContain(VALUE_CANARY);
    }
    expect(await entriesOrEmpty(target)).toEqual([]);
  });

  it.each(FAILPOINTS)(
    "returns sanitized typed reconciliation metadata at failpoint %s",
    async (phase) => {
      const home = await temporaryHome();
      const rawCanary = `${VALUE_CANARY}-${phase}-${home}`;
      let observed: unknown;
      const failure = await captureFailure(() =>
        installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
          registryInput(home),
          dependencies(home, {
            failpointForTests: (event: FailpointPhase) => {
              if (event === phase) throw new Error(rawCanary);
            },
            observeFailureForTests: (value: unknown) => {
              observed = value;
            },
          }),
        ),
      );

      expect(String(observed)).toContain(rawCanary);
      expect(String(failure)).not.toContain(rawCanary);
      expect(String(failure)).not.toContain(home);
      expect(String(failure)).not.toContain(RUN_ID);
      expect(String(failure)).not.toContain(KEY_INSTANCE_ID);
      const created =
        FAILPOINTS.indexOf(phase) >= FAILPOINTS.indexOf("after-final-link");
      expect(failure).toMatchObject({
        registry_may_have_been_created: created,
        retry_disposition: created
          ? "manual-reconciliation-required"
          : "safe-to-retry-after-not-installed",
      });
      expect(fs.existsSync(registryPath(home))).toBe(created);
      expect(fs.existsSync(stagingPath(home))).toBe(false);
      if (created) {
        expect(await fs.promises.readFile(registryPath(home), "utf8")).toBe(
          canonicalRegistry(registryInput(home)),
        );
      }
    },
  );

  it("reports partial managed-prefix creation and permits a clean precommit retry", async () => {
    const home = await temporaryHome();
    let injected = 0;
    const failure = await captureFailure(() =>
      installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
        registryInput(home),
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
      durability: "managed-prefix-may-exist-registry-absent",
      registry_may_have_been_created: false,
      retry_disposition: "manual-reconciliation-required",
    });
    expect(await entriesOrEmpty(home)).toEqual([
      FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_ROOT_RELATIVE_COMPONENTS[0],
    ]);

    const retryHome = await temporaryHome();
    const retryFailure = await captureFailure(() =>
      installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
        registryInput(retryHome),
        dependencies(retryHome, {
          failpointForTests: (phase: FailpointPhase) => {
            if (phase === "after-write") throw new Error(VALUE_CANARY);
          },
        }),
      ),
    );
    expect(retryFailure).toMatchObject({
      registry_may_have_been_created: false,
      retry_disposition: "safe-to-retry-after-not-installed",
    });
    expect(fs.existsSync(stagingPath(retryHome))).toBe(false);
    await expect(
      installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
        registryInput(retryHome),
        dependencies(retryHome),
      ),
    ).resolves.toBeDefined();
  });

  it("never links or unlinks a staging-name replacement across commit phases", async () => {
    const beforeLinkHome = await temporaryHome();
    const beforeLinkCompetitor = `${VALUE_CANARY}-before-link\n`;
    const beforeLinkFailure = await captureFailure(() =>
      installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
        registryInput(beforeLinkHome),
        dependencies(beforeLinkHome, {
          failpointForTests: (phase: FailpointPhase) => {
            if (phase === "before-final-link") {
              fs.unlinkSync(stagingPath(beforeLinkHome));
              fs.writeFileSync(
                stagingPath(beforeLinkHome),
                beforeLinkCompetitor,
                { flag: "wx", mode: 0o600 },
              );
              fs.chmodSync(stagingPath(beforeLinkHome), 0o600);
            }
          },
        }),
      ),
    );
    expect(beforeLinkFailure).toMatchObject({
      registry_may_have_been_created: false,
      retry_disposition: "manual-reconciliation-required",
    });
    expect(
      await fs.promises.readFile(stagingPath(beforeLinkHome), "utf8"),
    ).toBe(beforeLinkCompetitor);
    expect(fs.existsSync(registryPath(beforeLinkHome))).toBe(false);

    const beforeUnlinkHome = await temporaryHome();
    const beforeUnlinkCompetitor = `${VALUE_CANARY}-before-unlink\n`;
    const beforeUnlinkFailure = await captureFailure(() =>
      installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
        registryInput(beforeUnlinkHome),
        dependencies(beforeUnlinkHome, {
          failpointForTests: (phase: FailpointPhase) => {
            if (phase === "after-final-directory-sync") {
              fs.unlinkSync(stagingPath(beforeUnlinkHome));
              fs.writeFileSync(
                stagingPath(beforeUnlinkHome),
                beforeUnlinkCompetitor,
                { flag: "wx", mode: 0o600 },
              );
              fs.chmodSync(stagingPath(beforeUnlinkHome), 0o600);
            }
          },
        }),
      ),
    );
    expect(beforeUnlinkFailure).toMatchObject({
      durability: "final-link-directory-synced",
      registry_may_have_been_created: true,
      retry_disposition: "manual-reconciliation-required",
    });
    expect(
      await fs.promises.readFile(stagingPath(beforeUnlinkHome), "utf8"),
    ).toBe(beforeUnlinkCompetitor);
    expect(
      await fs.promises.readFile(registryPath(beforeUnlinkHome), "utf8"),
    ).toBe(canonicalRegistry(registryInput(beforeUnlinkHome)));
  });

  it("preserves strong durability classification after post-revalidation close failure", async () => {
    const home = await temporaryHome();
    let closeCalls = 0;
    const failure = await captureFailure(() =>
      installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
        registryInput(home),
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
      durability: "registry-published-and-staging-removal-durable",
      registry_may_have_been_created: true,
      retry_disposition: "do-not-retry-existing-registry",
    });
    expect(String(failure)).not.toContain(home);
    expect(String(failure)).not.toContain(VALUE_CANARY);
    expect(await entriesOrEmpty(registryRoot(home))).toEqual(
      [
        FLOODGATE_V7_PRODUCTION_CONNECTOR_REGISTRY_FILENAME,
        FLOODGATE_V7_PRODUCTION_CONNECTOR_RUNS_BASENAME,
      ].sort(),
    );
  });

  it("rejects dependency proxies and a production-home test target without mutation", async () => {
    const home = await temporaryHome();
    let proxyCalls = 0;
    const proxy = new Proxy(dependencies(home), {
      ownKeys() {
        proxyCalls += 1;
        throw new Error(VALUE_CANARY);
      },
    });
    const proxyFailure = await captureFailure(() =>
      installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
        registryInput(home),
        proxy,
      ),
    );
    expect(proxyCalls).toBe(0);
    expect(proxyFailure).toMatchObject({
      phase: "capture",
      registry_may_have_been_created: false,
    });
    expect(await entriesOrEmpty(home)).toEqual([]);

    const productionHome = await fs.promises.realpath(os.homedir());
    const productionFailure = await captureFailure(() =>
      installer.installFloodgateV7ProductionConnectorRegistryCoreForTests(
        registryInput(productionHome),
        dependencies(productionHome),
      ),
    );
    expect(productionFailure).toMatchObject({
      phase: "production-identity",
      registry_may_have_been_created: false,
    });
    expect(String(productionFailure)).not.toContain(productionHome);
  });
});
