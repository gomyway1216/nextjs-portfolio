import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_NATIVE_LAUNCHER_ATTESTATION_CONTRACT } from "../../../ml/floodgate-v7-production-recovery-operator-native-launcher-attestation";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const TEST_HELPER = path.join(
  REPOSITORY_ROOT,
  "tests/fixtures/ml/floodgate-v7-production-recovery-operator-native-launcher-test.jxa",
);
const TEST_CHILD = path.join(
  REPOSITORY_ROOT,
  "tests/fixtures/ml/floodgate-v7-production-recovery-operator-native-launcher-child.ts",
);
const PRODUCTION_HELPER = path.join(
  REPOSITORY_ROOT,
  "ml/helpers/floodgate-v7-production-recovery-operator-native-launcher.jxa",
);
const PURPOSE = "recovery-launcher-self-test" as const;
const temporaryRoots: string[] = [];
const darwinIt = process.platform === "darwin" ? it : it.skip;

function launcherEnvironment(
  overrides: Partial<NodeJS.ProcessEnv> = {},
): NodeJS.ProcessEnv {
  return {
    HOME: "/untrusted-parent-home",
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: "production",
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    ...overrides,
  };
}

function runLauncher(
  mode = "success",
  helper = TEST_HELPER,
  arguments_: readonly string[] = [PURPOSE, process.execPath],
) {
  return spawnSync(
    "/usr/bin/osascript",
    ["-l", "JavaScript", helper, ...arguments_],
    {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: launcherEnvironment({
        FLOODGATE_V7_RECOVERY_LAUNCHER_TEST_MODE: mode,
        NODE_OPTIONS: "--no-warnings",
        FLOODGATE_V7_NATIVE_LAUNCHER_PURPOSE: "must-not-reach-child",
      }),
      timeout: 30_000,
    },
  );
}

function exactNamedJxaFunction(source: string, name: string): string {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0 || source.indexOf(marker, start + marker.length) >= 0) {
    throw new Error(`expected one ${name} function`);
  }
  const opening = source.indexOf("{", start + marker.length);
  if (opening < 0) throw new Error(`missing ${name} function body`);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated ${name} function body`);
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("Floodgate v7 production recovery operator Darwin launcher", () => {
  darwinIt(
    "runs the harmless JXA to NSTask/caffeinate/private-pipe child path",
    () => {
      const result = runLauncher();
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.signal).toBeNull();
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        attested: true,
        node_options_present: false,
        production_launcher_environment_present: false,
        exec_argv: ["-r", "tsx/cjs"],
      });
    },
  );

  darwinIt("consumes the real pipe attestation exactly once", () => {
    const result = runLauncher("reuse");
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      attested: true,
      replay_rejected: true,
    });
  });

  darwinIt.each([
    "no-frame",
    "wrong-nonce-frame",
    "wrong-nonce-environment",
    "wrong-parent-frame",
    "wrong-parent-environment",
    "wrong-helper",
    "wrong-base-environment",
    "extra-environment",
    "wrong-exec-argv",
    "extra-child-argument",
  ])("rejects real %s evidence", (mode) => {
    const result = runLauncher(mode);
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  darwinIt("rejects a helper pathname alias before starting Node", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "floodgate-recovery-launcher-alias-"),
    );
    temporaryRoots.push(root);
    const alias = path.join(root, "recovery-launcher.jxa");
    await fs.promises.symlink(TEST_HELPER, alias);

    const result = runLauncher("success", alias);

    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });

  darwinIt(
    "rejects the canonical helper itself while it has a hardlink alias",
    async () => {
      const root = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "floodgate-recovery-launcher-hardlink-"),
      );
      temporaryRoots.push(root);
      await fs.promises.link(
        TEST_HELPER,
        path.join(root, "helper-hardlink.jxa"),
      );
      expect((await fs.promises.stat(TEST_HELPER)).nlink).toBe(2);

      const result = runLauncher();

      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
    },
  );

  darwinIt(
    "rejects a structurally valid recovery frame from a non-osascript parent",
    () => {
      const parentPid = String(process.pid);
      const nonce = `${"A".repeat(43)}=`;
      const home = os.homedir();
      const result = spawnSync(
        process.execPath,
        ["-r", "tsx/cjs", TEST_CHILD],
        {
          cwd: REPOSITORY_ROOT,
          encoding: "utf8",
          env: {
            HOME: home,
            LANG: "C",
            LC_ALL: "C",
            NODE_ENV: "production",
            PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
            FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_CONTRACT:
              FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_NATIVE_LAUNCHER_ATTESTATION_CONTRACT,
            FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_PURPOSE: PURPOSE,
            FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_PARENT_PID:
              parentPid,
            FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_NONCE: nonce,
            FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_HELPER: TEST_HELPER,
            FLOODGATE_V7_RECOVERY_LAUNCHER_TEST_CHILD_MODE: "success",
          },
          input: `${FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_NATIVE_LAUNCHER_ATTESTATION_CONTRACT}\n${PURPOSE}\n${parentPid}\n${nonce}\n${TEST_HELPER}\n`,
          timeout: 30_000,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
    },
  );

  darwinIt(
    "executes the production integerValue body against real Foundation values",
    async () => {
      const productionHelperSource = await fs.promises.readFile(
        PRODUCTION_HELPER,
        "utf8",
      );
      const integerValueSource = exactNamedJxaFunction(
        productionHelperSource,
        "integerValue",
      );
      expect(integerValueSource).toContain("ObjC.unwrap(value)");
      const source = String.raw`
ObjC.import("Foundation");
const fileManager = $.NSFileManager.defaultManager;
const target = ${JSON.stringify(PRODUCTION_HELPER)};
const error = Ref();
const attributes = fileManager.attributesOfItemAtPathError($(target), error);
if (!attributes) throw new Error("missing attributes");
function fail() {
  throw new Error("rejected");
}
${integerValueSource}
function checkedInteger(value) {
  try {
    return integerValue(value);
  } catch (_error) {
    return "rejected";
  }
}
const permissions = checkedInteger(
  attributes.objectForKey($.NSFilePosixPermissions),
);
const processIdentifier = checkedInteger(
  $.NSProcessInfo.processInfo.processIdentifier,
);
const task = $.NSTask.alloc.init;
task.executableURL = $.NSURL.fileURLWithPath("/usr/bin/true");
const launchError = Ref();
if (!task.launchAndReturnError(launchError)) throw new Error("launch failed");
task.waitUntilExit;
JSON.stringify({
  permissions,
  processIdentifierValid:
    typeof processIdentifier === "number" && processIdentifier > 1,
  terminationStatus: checkedInteger(task.terminationStatus),
  numericString: checkedInteger($("0")),
  booleanValue: checkedInteger($(false)),
  nullValue: checkedInteger($.NSNull.null),
});
`;
      const result = spawnSync(
        "/usr/bin/osascript",
        ["-l", "JavaScript", "-e", source],
        {
          cwd: REPOSITORY_ROOT,
          encoding: "utf8",
          env: launcherEnvironment(),
          timeout: 30_000,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        permissions: (await fs.promises.stat(PRODUCTION_HELPER)).mode & 0o7777,
        processIdentifierValid: true,
        terminationStatus: 0,
        numericString: "rejected",
        booleanValue: "rejected",
        nullValue: "rejected",
      });
    },
  );
});
