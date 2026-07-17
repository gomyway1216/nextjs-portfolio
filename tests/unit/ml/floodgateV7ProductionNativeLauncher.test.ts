import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const PRODUCTION_HELPER = path.join(
  REPOSITORY_ROOT,
  "ml/helpers/floodgate-v7-production-native-launcher.jxa",
);
const TEST_HELPER = path.join(
  REPOSITORY_ROOT,
  "tests/fixtures/ml/floodgate-v7-production-native-launcher-test.jxa",
);
const TEST_CHILD = path.join(
  REPOSITORY_ROOT,
  "tests/fixtures/ml/floodgate-v7-production-native-launcher-child.ts",
);
const temporaryRoots: string[] = [];
const darwinIt = process.platform === "darwin" ? it : it.skip;
const PRODUCTION_PURPOSE_ENTRIES = Object.freeze({
  "application-source-readiness":
    "ml/inspect-floodgate-v7-production-application-source.ts",
  "approved-current-binding-readiness":
    "ml/inspect-floodgate-v7-approved-key-current-binding.ts",
  "connector-verifier-readiness":
    "ml/inspect-floodgate-v7-production-connector-verifier-readiness.ts",
  "prefix-100-read-only-preflight":
    "ml/inspect-floodgate-v7-production-prefix-100-preflight.ts",
  "prefix-100-disposable-kill-drill":
    "ml/run-floodgate-v7-production-prefix-100-kill-drill.ts",
  "durable-prefix-100":
    "ml/run-floodgate-v7-production-connector-prefix-100.ts",
  "durable-prefix-500":
    "ml/run-floodgate-v7-production-connector-prefix-500.ts",
  "sealed-final-24000":
    "ml/run-floodgate-v7-production-connector-final-24000.ts",
  "training-label-finalization-24000":
    "ml/run-floodgate-v7-training-label-production.ts",
  "production-registry-provision":
    "ml/provision-floodgate-v7-production-connector-registry.ts",
} as const);
const NATIVE_PRODUCTION_SCRIPT_PURPOSES = Object.freeze({
  "shogi:floodgate-v7-key-enrollment-binding-preflight":
    "approved-current-binding-readiness",
  "shogi:floodgate-v7-production-connector-registry-provision":
    "production-registry-provision",
  "shogi:floodgate-v7-production-application-source-readiness":
    "application-source-readiness",
  "shogi:floodgate-v7-production-connector-verifier-readiness":
    "connector-verifier-readiness",
  "shogi:floodgate-v7-production-prefix-100-preflight":
    "prefix-100-read-only-preflight",
  "shogi:floodgate-v7-production-prefix-100-kill-drill":
    "prefix-100-disposable-kill-drill",
  "shogi:floodgate-v7-production-connector-prefix-100": "durable-prefix-100",
  "shogi:floodgate-v7-production-connector-prefix-500": "durable-prefix-500",
  "shogi:floodgate-v7-production-connector-final-24000": "sealed-final-24000",
  "shogi:floodgate-v7-training-label-production":
    "training-label-finalization-24000",
} as const);

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function objectFreezeBody(source: string, name: string): string {
  const match = new RegExp(
    `const ${name} = Object\\.freeze\\(\\{([\\s\\S]*?)\\n\\} as const\\);`,
    "u",
  ).exec(source);
  if (match?.[1] === undefined) {
    throw new Error(`missing ${name} frozen object`);
  }
  return match[1];
}

function assertNativeClaimOrdering(source: string, lazyModule: string): void {
  const argvGuard = source.indexOf("process.argv.length");
  const claim = source.indexOf(
    "claimFloodgateV7ProductionNativeLauncherAttestation(ENTRYPOINT)",
  );
  const entrypointContext = source.indexOf(
    "assertFloodgateV7ProductionApplicationEntrypointContext(ENTRYPOINT)",
    claim,
  );
  const lazyLoad = source.indexOf(
    `require("${lazyModule}")`,
    entrypointContext,
  );
  expect(argvGuard).toBeGreaterThan(0);
  expect(claim).toBeGreaterThan(argvGuard);
  expect(entrypointContext).toBeGreaterThan(claim);
  expect(lazyLoad).toBeGreaterThan(entrypointContext);
}

function launcherEnvironment(
  overrides: Partial<NodeJS.ProcessEnv> = {},
): NodeJS.ProcessEnv {
  return {
    HOME: "/pre-launch-untrusted-home",
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: "production",
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    ...overrides,
  };
}

function runTestLauncher(
  environment: Partial<NodeJS.ProcessEnv> = {},
  arguments_: readonly string[] = ["launcher-self-test", process.execPath],
) {
  return spawnSync(
    "/usr/bin/osascript",
    ["-l", "JavaScript", TEST_HELPER, ...arguments_],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: launcherEnvironment(environment),
      timeout: 30_000,
    },
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("Floodgate v7 production native launcher", () => {
  it("keeps an exact ten-purpose bijection across the production parent and child", async () => {
    const [source, attestation] = await Promise.all([
      fs.promises.readFile(PRODUCTION_HELPER, "utf8"),
      fs.promises.readFile(
        path.join(
          REPOSITORY_ROOT,
          "ml/floodgate-v7-production-native-launcher-attestation.ts",
        ),
        "utf8",
      ),
    ]);
    expect(source).toContain('ObjC.import("Foundation")');
    expect(source).toContain('ObjC.import("Security")');
    expect(source).toContain('ObjC.bindFunction("exit"');
    expect(source).toContain("$.SecRandomCopyBytes($.kSecRandomDefault, 32");
    expect(source).toContain(
      'task.executableURL = $.NSURL.fileURLWithPath("/usr/bin/caffeinate")',
    );
    expect(source).toMatch(
      /task\.arguments = \$\(\[\s*"-dimsu",\s*configuration\.nodePath,\s*"-r",\s*"tsx\/cjs",\s*configuration\.entryPath,\s*\]\);/u,
    );
    expect(source).toContain(
      'const PRODUCTION_ROOT_SUFFIX =\n  ".codex/worktrees/shogi-floodgate-v7-production-application";',
    );
    expect(source).toContain(
      'const NODE_SUFFIX = ".nvm/versions/node/v22.13.0/bin/node";',
    );
    expect(source).toContain(
      "Darwin-native launch boundary for the ten current Floodgate v7 production",
    );
    expect(source).toContain("function integerValue(value)");
    expect(source).toContain("const unwrapped = ObjC.unwrap(value);");
    expect(source).toContain('typeof unwrapped !== "number"');
    expect(source).not.toContain("Number(ObjC.unwrap(value))");
    expect(source).toContain(
      "attributes.objectForKey($.NSFilePosixPermissions)",
    );
    expect(source).not.toContain(
      "Number(attributes.objectForKey($.NSFilePosixPermissions))",
    );
    expect(source).not.toContain("launcher-self-test");
    expect(source).not.toContain("FLOODGATE_V7_LAUNCHER_SELF_TEST_NODE");
    expect(source).not.toContain("CoreForTests");

    const helperBodyMatch =
      /const PURPOSE_ENTRIES = Object\.freeze\(\{([\s\S]*?)\n\}\);/u.exec(
        source,
      );
    if (helperBodyMatch?.[1] === undefined) {
      throw new Error("missing production helper purpose map");
    }
    const helperEntryPairs = [
      ...helperBodyMatch[1].matchAll(/"([^"]+)":\s*"([^"]+)",/gu),
    ].map((match) => [match[1], match[2]] as const);
    expect(helperEntryPairs).toHaveLength(10);
    expect(new Set(helperEntryPairs.map(([purpose]) => purpose)).size).toBe(10);
    expect(helperBodyMatch[1].replace(/\s+/gu, "")).toBe(
      Object.entries(PRODUCTION_PURPOSE_ENTRIES)
        .map(
          ([purpose, entrypoint]) =>
            `${JSON.stringify(purpose)}:${JSON.stringify(entrypoint)},`,
        )
        .join(""),
    );
    const helperEntries = Object.fromEntries(helperEntryPairs);
    expect(helperEntries).toEqual(PRODUCTION_PURPOSE_ENTRIES);
    expect(Object.keys(helperEntries)).toHaveLength(10);
    expect(new Set(Object.values(helperEntries)).size).toBe(10);

    const purposeTypeMatch =
      /export type FloodgateV7ProductionNativeLauncherPurpose =([\s\S]*?);/u.exec(
        attestation,
      );
    if (purposeTypeMatch?.[1] === undefined) {
      throw new Error("missing production launcher purpose type");
    }
    const purposeTypeValues = [
      ...purposeTypeMatch[1].matchAll(/"([^"]+)"/gu),
    ].map((match) => match[1]);
    expect(sorted(purposeTypeValues)).toEqual(
      sorted(Object.keys(PRODUCTION_PURPOSE_ENTRIES)),
    );

    const attestationMap = objectFreezeBody(
      attestation,
      "PURPOSE_BY_ENTRYPOINT",
    );
    const compactAttestationMap = attestationMap
      .replace(/\s+/gu, "")
      .replace(/,\)\]/gu, ")]");
    const mappedPurposes = [...attestationMap.matchAll(/:\s*"([^"]+)",/gu)].map(
      (match) => match[1],
    );
    expect(sorted(mappedPurposes)).toEqual(
      sorted(Object.keys(PRODUCTION_PURPOSE_ENTRIES)),
    );
    expect(compactAttestationMap).toBe(
      Object.entries(PRODUCTION_PURPOSE_ENTRIES)
        .map(([purpose, entrypoint]) => {
          const joinedEntrypoint = entrypoint
            .split("/")
            .map((component) => JSON.stringify(component))
            .join(",");
          return `[path.join(${joinedEntrypoint})]:${JSON.stringify(purpose)},`;
        })
        .join(""),
    );
    expect(attestation).toContain(
      "assertExactStringArray(process.argv, [expectedNodePath, entrypoint]);",
    );
    expect(attestation).toContain(
      'assertExactStringArray(process.execArgv, ["-r", "tsx/cjs"]);',
    );
  });

  darwinIt(
    "unwraps Foundation numeric values before checking them",
    async () => {
      const source = String.raw`
ObjC.import("Foundation");
const fileManager = $.NSFileManager.defaultManager;
const target = ${JSON.stringify(PRODUCTION_HELPER)};
const error = Ref();
const attributes = fileManager.attributesOfItemAtPathError($(target), error);
if (!attributes) throw new Error("missing attributes");
function checkedInteger(value) {
  const unwrapped = ObjC.unwrap(value);
  return typeof unwrapped === "number" && Number.isSafeInteger(unwrapped)
    ? unwrapped
    : "rejected";
}
const raw = attributes.objectForKey($.NSFilePosixPermissions);
const permissions = checkedInteger(raw);
const processIdentifier = checkedInteger(
  $.NSProcessInfo.processInfo.processIdentifier,
);
const task = $.NSTask.alloc.init;
task.executableURL = $.NSURL.fileURLWithPath("/usr/bin/true");
const launchError = Ref();
if (!task.launchAndReturnError(launchError)) throw new Error("launch failed");
task.waitUntilExit;
const terminationStatus = checkedInteger(task.terminationStatus);
JSON.stringify({
  permissions,
  processIdentifierValid:
    typeof processIdentifier === "number" && processIdentifier > 1,
  terminationStatus,
  numericString: checkedInteger($("0")),
  booleanValue: checkedInteger($(false)),
  nullValue: checkedInteger($.NSNull.null),
});
`;
      const child = spawnSync(
        "/usr/bin/osascript",
        ["-l", "JavaScript", "-e", source],
        {
          cwd: REPOSITORY_ROOT,
          encoding: "utf8",
          env: launcherEnvironment(),
          timeout: 30_000,
        },
      );
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(0);
      expect(child.stderr).toBe("");
      expect(JSON.parse(child.stdout)).toEqual({
        permissions: (await fs.promises.stat(PRODUCTION_HELPER)).mode & 0o7777,
        processIdentifierValid: true,
        terminationStatus: 0,
        numericString: "rejected",
        booleanValue: "rejected",
        nullValue: "rejected",
      });
    },
  );

  it("routes every current production evidence command through the fixed helper", async () => {
    const packageJson = JSON.parse(
      await fs.promises.readFile(
        path.join(REPOSITORY_ROOT, "package.json"),
        "utf8",
      ),
    ) as { scripts: Record<string, string> };
    const base =
      '/usr/bin/osascript -l JavaScript "$(/bin/pwd -P)/ml/helpers/floodgate-v7-production-native-launcher.jxa"';
    const nativeScripts = Object.fromEntries(
      Object.entries(packageJson.scripts).filter(([, command]) =>
        command.startsWith(`${base} `),
      ),
    );
    expect(nativeScripts).toEqual(
      Object.fromEntries(
        Object.entries(NATIVE_PRODUCTION_SCRIPT_PURPOSES).map(
          ([script, purpose]) => [script, `${base} ${purpose}`],
        ),
      ),
    );
    expect(Object.keys(nativeScripts)).toHaveLength(10);
    expect(
      sorted(
        Object.values(nativeScripts).map((command) =>
          command.slice(base.length + 1),
        ),
      ),
    ).toEqual(sorted(Object.keys(PRODUCTION_PURPOSE_ENTRIES)));
  });

  it("claims the native parent before source capture or lazy production loading", async () => {
    const [
      authorization,
      readiness,
      currentBinding,
      verifierReadiness,
      preflight,
      killDrill,
    ] = await Promise.all(
      [
        "ml/floodgate-v7-production-application-source-authorization.ts",
        "ml/inspect-floodgate-v7-production-application-source.ts",
        "ml/inspect-floodgate-v7-approved-key-current-binding.ts",
        "ml/inspect-floodgate-v7-production-connector-verifier-readiness.ts",
        "ml/inspect-floodgate-v7-production-prefix-100-preflight.ts",
        "ml/run-floodgate-v7-production-prefix-100-kill-drill.ts",
      ].map((relative) =>
        fs.promises.readFile(path.join(REPOSITORY_ROOT, relative), "utf8"),
      ),
    );
    const authorizationClaim = authorization.indexOf(
      "claimFloodgateV7ProductionNativeLauncherAttestation(\n      expectedEntrypoint(purpose)",
    );
    expect(authorizationClaim).toBeGreaterThan(0);
    expect(
      authorization.indexOf(
        "assertFloodgateV7ProductionApplicationEntrypointContext(\n      expectedEntrypoint(purpose)",
      ),
    ).toBeGreaterThan(authorizationClaim);

    const readinessClaim = readiness.indexOf(
      "claimFloodgateV7ProductionNativeLauncherAttestation(ENTRYPOINT)",
    );
    expect(readinessClaim).toBeGreaterThan(0);
    expect(
      readiness.indexOf(
        "assertFloodgateV7ProductionApplicationEntrypointContext(ENTRYPOINT)",
        readinessClaim,
      ),
    ).toBeGreaterThan(readinessClaim);

    assertNativeClaimOrdering(
      currentBinding,
      "./floodgate-v7-approved-key-current-binding",
    );
    assertNativeClaimOrdering(
      verifierReadiness,
      "./floodgate-v7-production-connector-verifier-readiness",
    );

    const preflightClaim = preflight.indexOf(
      'claimFloodgateV7ProductionNativeLauncherAttestation(\n      "ml/inspect-floodgate-v7-production-prefix-100-preflight.ts"',
    );
    expect(preflightClaim).toBeGreaterThan(0);
    expect(
      preflight.indexOf(
        "assertFloodgateV7ProductionApplicationEntrypointContext(",
        preflightClaim,
      ),
    ).toBeGreaterThan(preflightClaim);

    const killClaim = killDrill.indexOf(
      'claimFloodgateV7ProductionNativeLauncherAttestation(\n      "ml/run-floodgate-v7-production-prefix-100-kill-drill.ts"',
    );
    expect(killClaim).toBeGreaterThan(0);
    const killEntrypointContext = killDrill.indexOf(
      "assertFloodgateV7ProductionApplicationEntrypointContext(",
      killClaim,
    );
    expect(killEntrypointContext).toBeGreaterThan(killClaim);
    const killSourceCapture = killDrill.indexOf(
      "await captureFloodgateV7ProductionApplicationSourceProvenance()",
      killEntrypointContext,
    );
    expect(killSourceCapture).toBeGreaterThan(killEntrypointContext);
    expect(
      killDrill.indexOf(
        'require("./floodgate-v7-production-prefix-100-kill-drill")',
        killSourceCapture,
      ),
    ).toBeGreaterThan(killSourceCapture);
  });

  darwinIt(
    "cleans NODE_OPTIONS before the production child starts even when its preload self-hides and poisons intrinsics",
    async () => {
      const root = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "floodgate-native-launcher-"),
      );
      temporaryRoots.push(root);
      const marker = path.join(root, "preload-executed");
      const preload = path.join(root, "hostile-preload.cjs");
      await fs.promises.writeFile(
        preload,
        [
          'const fs = require("node:fs");',
          'const Module = require("node:module");',
          `fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ node_options_present: process.env.NODE_OPTIONS !== undefined, exec_argv: process.execArgv }));`,
          "delete process.env.NODE_OPTIONS;",
          "process.execArgv.length = 0;",
          "const originalLoad = Module._load;",
          "Module._load = function(request, parent, isMain) {",
          '  if (request.includes("source-authorization")) return Object.freeze({});',
          "  return Reflect.apply(originalLoad, this, [request, parent, isMain]);",
          "};",
          "Array.prototype.includes = () => true;",
          "Object.getOwnPropertyDescriptors = () => Object.create(null);",
          "Reflect.apply = () => undefined;",
          "",
        ].join("\n"),
        { mode: 0o600 },
      );

      const legacy = spawnSync(process.execPath, ["-e", "process.exit(0)"], {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: launcherEnvironment({ NODE_OPTIONS: `--require=${preload}` }),
        timeout: 30_000,
      });
      expect(legacy.error).toBeUndefined();
      expect(fs.existsSync(marker)).toBe(true);
      const legacyObservation = JSON.parse(
        await fs.promises.readFile(marker, "utf8"),
      ) as { node_options_present: boolean; exec_argv: string[] };
      expect(legacyObservation.node_options_present).toBe(true);
      expect(legacyObservation.exec_argv.join(" ")).not.toContain(preload);
      await fs.promises.rm(marker);

      const result = runTestLauncher({
        NODE_OPTIONS: `--require=${preload}`,
        FLOODGATE_V7_UNTRUSTED_SENTINEL: "must-not-reach-node",
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.signal).toBeNull();
      expect(result.stderr).toBe("");
      expect(fs.existsSync(marker)).toBe(false);
      expect(JSON.parse(result.stdout)).toEqual({
        attested: true,
        node_options_present: false,
        untrusted_sentinel_present: false,
        exec_argv: ["-r", "tsx/cjs"],
      });
    },
    40_000,
  );

  darwinIt("rejects an ordinary direct Node parent and missing frame", () => {
    const result = spawnSync(process.execPath, ["-r", "tsx/cjs", TEST_CHILD], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: launcherEnvironment(),
      input: "not-an-attestation-frame\n",
      timeout: 30_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  darwinIt(
    "rejects a structurally valid frame from a non-osascript parent",
    () => {
      const nonce = `${"A".repeat(43)}=`;
      const parentPid = String(process.pid);
      const contract =
        "shogi-floodgate-v7-production-native-launcher-attestation-v1";
      const result = spawnSync(
        process.execPath,
        ["-r", "tsx/cjs", TEST_CHILD],
        {
          cwd: REPOSITORY_ROOT,
          encoding: "utf8",
          env: launcherEnvironment({
            FLOODGATE_V7_NATIVE_LAUNCHER_CONTRACT: contract,
            FLOODGATE_V7_NATIVE_LAUNCHER_PURPOSE: "launcher-self-test",
            FLOODGATE_V7_NATIVE_LAUNCHER_PARENT_PID: parentPid,
            FLOODGATE_V7_NATIVE_LAUNCHER_NONCE: nonce,
            FLOODGATE_V7_NATIVE_LAUNCHER_HELPER: TEST_HELPER,
            FLOODGATE_V7_LAUNCHER_TEST_CHILD_MODE: "success",
          }),
          input: `${contract}\nlauncher-self-test\n${parentPid}\n${nonce}\n${TEST_HELPER}\n`,
          timeout: 30_000,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
    },
  );

  darwinIt.each([
    ["wrong purpose", ["durable-prefix-100", process.execPath]],
    ["extra argument", ["launcher-self-test", process.execPath, "unexpected"]],
  ])("rejects %s before starting Node", (_name, arguments_) => {
    const result = runTestLauncher({}, arguments_);
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  darwinIt("rejects a helper pathname alias before starting Node", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-native-launcher-alias-"),
    );
    temporaryRoots.push(root);
    const alias = path.join(root, "launcher.jxa");
    await fs.promises.symlink(TEST_HELPER, alias);
    const result = spawnSync(
      "/usr/bin/osascript",
      ["-l", "JavaScript", alias, "launcher-self-test", process.execPath],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: launcherEnvironment(),
        timeout: 30_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  darwinIt.each([
    "no-frame",
    "malformed-frame",
    "wrong-purpose",
    "wrong-environment",
    "wrong-helper",
    "wrong-base-environment",
    "extra-node-path",
    "extra-tsx",
    "extra-ld",
    "wrong-exec-argv",
    "extra-child-argument",
  ])("rejects the %s attestation case", (mode) => {
    const result = runTestLauncher({
      FLOODGATE_V7_LAUNCHER_TEST_MODE: mode,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  darwinIt("strips or rejects DYLD injection before the attested child", () => {
    const result = runTestLauncher({
      FLOODGATE_V7_LAUNCHER_TEST_MODE: "extra-dyld",
    });
    expect(result.error).toBeUndefined();
    expect([0, 6]).toContain(result.status);
    if (result.status === 0) {
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({ attested: true });
    } else {
      expect(result.stdout).toBe("");
    }
  });

  darwinIt("consumes the attestation exactly once", () => {
    const result = runTestLauncher({
      FLOODGATE_V7_LAUNCHER_TEST_MODE: "reuse",
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      attested: true,
      reuse_rejected: true,
    });
  });
});
