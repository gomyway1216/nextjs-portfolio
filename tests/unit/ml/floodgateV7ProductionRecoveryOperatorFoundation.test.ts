import { execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import * as ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import { captureFloodgateGitExactCleanRevision } from "../../../ml/floodgate-git";
import {
  claimFloodgateV7ProductionApplicationExecutionCoreForTests,
  authorizeFloodgateV7ProductionApplicationExecutionCoreForTests,
} from "../../../ml/floodgate-v7-production-application-source-authorization";
import {
  FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_NATIVE_LAUNCHER_ATTESTATION_CONTRACT,
  FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationError,
  claimFloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationCoreForTests,
  type FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationContextForTests,
} from "../../../ml/floodgate-v7-production-recovery-operator-native-launcher-attestation";
import {
  FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_EXECUTION_CAPABILITY_CONTRACT,
  FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_EXECUTION_CAPABILITY_STATUS,
  FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError,
  authorizeFloodgateV7ProductionRecoveryOperatorExecutionCoreForTests,
  claimFloodgateV7ProductionRecoveryOperatorExecutionCoreForTests,
} from "../../../ml/floodgate-v7-production-recovery-operator-source-authorization";
import {
  FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_REQUIRED_TRACKED_PATHS,
  FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_SOURCE_LAYOUT,
  FloodgateV7ProductionRecoveryOperatorSourceProvenanceError,
  assertFloodgateV7ProductionRecoveryOperatorEntrypointContextCoreForTests,
  assertFloodgateV7ProductionRecoveryOperatorRequiredTrackedClosureCoreForTests,
  captureFloodgateV7ProductionRecoveryOperatorSourceProvenanceCoreForTests,
  resolveFloodgateV7ProductionRecoveryOperatorSourceRootCoreForTests,
  type FloodgateV7ProductionRecoveryOperatorEntrypointContextForTests,
} from "../../../ml/floodgate-v7-production-recovery-operator-source-provenance";
import {
  FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_STOP_CONTRACT,
  buildFloodgateV7ProductionRecoveryOperatorStopCoreForTests,
} from "../../../ml/inspect-floodgate-v7-production-stale-prefix-100-recovery";

const execFile = promisify(execFileCallback);
const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const ROOT_SUFFIX = path.join(
  ".codex",
  "worktrees",
  "shogi-floodgate-v7-production-recovery-operator",
);
const ENTRYPOINT_RELATIVE = path.join(
  "ml",
  "inspect-floodgate-v7-production-stale-prefix-100-recovery.ts",
);
const HELPER_RELATIVE = path.join(
  "ml",
  "helpers",
  "floodgate-v7-production-recovery-operator-native-launcher.jxa",
);
const NODE_RELATIVE = path.join(
  ".nvm",
  "versions",
  "node",
  "v22.13.0",
  "bin",
  "node",
);
const PURPOSE = "inspect-stale-prefix-100" as const;
const REVISION = "d".repeat(40);
const temporaryHomes: string[] = [];
const RECOVERY_REACHABLE_IMPORTS = Object.freeze({
  "ml/inspect-floodgate-v7-production-stale-prefix-100-recovery.ts": [
    "./floodgate-v7-production-recovery-operator-source-authorization",
  ],
  "ml/floodgate-v7-production-recovery-operator-source-authorization.ts": [
    "node:util",
    "./floodgate-v7-production-recovery-operator-source-provenance",
    "./floodgate-v7-production-recovery-operator-native-launcher-attestation",
  ],
  "ml/floodgate-v7-production-recovery-operator-source-provenance.ts": [
    "node:child_process",
    "node:fs",
    "node:os",
    "node:path",
    "node:util",
    "./floodgate-git",
  ],
  "ml/floodgate-v7-production-recovery-operator-native-launcher-attestation.ts":
    [
      "node:buffer",
      "node:child_process",
      "node:fs",
      "node:os",
      "node:path",
      "node:util",
    ],
  "ml/floodgate-git.ts": [
    "node:child_process",
    "node:crypto",
    "node:fs",
    "node:path",
    "node:util",
  ],
} as const);
const FORBIDDEN_RECOVERY_REACHABILITY = [
  "registry",
  "outer-gate-lease",
  "stage",
  "checkpoint",
  "work",
  "deployment-key",
] as const;
const FORBIDDEN_RUNTIME_LOADER_IDENTIFIERS = new Set([
  "eval",
  "Function",
  "global",
  "globalThis",
]);
const FORBIDDEN_RUNTIME_LOADER_PROPERTIES = new Set([
  "_compile",
  "_load",
  "constructor",
  "createRequire",
  "getBuiltinModule",
  "require",
]);

interface Fixture {
  readonly home: string;
  readonly root: string;
  readonly entrypoint: string;
  readonly helper: string;
  readonly tracked: string;
  readonly revision: string;
}

async function git(
  root: string,
  arguments_: readonly string[],
): Promise<string> {
  const { stdout } = await execFile("git", [...arguments_], {
    cwd: root,
    encoding: "utf8",
  });
  return stdout;
}

async function createFixture(): Promise<Fixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-v7-recovery-source-"),
  );
  const home = await fs.promises.realpath(created);
  temporaryHomes.push(home);
  const root = path.join(home, ROOT_SUFFIX);
  const entrypoint = path.join(root, ENTRYPOINT_RELATIVE);
  const helper = path.join(root, HELPER_RELATIVE);
  const tracked = path.join(root, "tracked.txt");
  for (const requiredPath of FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_REQUIRED_TRACKED_PATHS) {
    const absolutePath = path.join(root, requiredPath);
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    const contents =
      requiredPath === "package.json" ||
      requiredPath === "package-lock.json" ||
      requiredPath === "tsconfig.json"
        ? "{}\n"
        : requiredPath.endsWith(".jxa")
          ? '"use strict";\n'
          : "export {};\n";
    await fs.promises.writeFile(absolutePath, contents);
  }
  await fs.promises.writeFile(tracked, "known recovery source\n");
  await git(root, ["init", "-q"]);
  await git(root, ["config", "user.name", "Floodgate Recovery Test"]);
  await git(root, [
    "config",
    "user.email",
    "floodgate-recovery@example.invalid",
  ]);
  await git(root, ["add", "."]);
  await git(root, ["commit", "-q", "-m", "recovery source fixture"]);
  const revision = (await git(root, ["rev-parse", "HEAD"])).trim();
  return Object.freeze({
    home,
    root,
    entrypoint,
    helper,
    tracked,
    revision,
  });
}

function isRequireMainAccess(
  node: ts.Node,
): node is ts.PropertyAccessExpression {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "require" &&
    node.name.text === "main"
  );
}

function isStrictEquality(node: ts.BinaryExpression): boolean {
  return (
    node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
  );
}

function isExactCliMainComparison(node: ts.Node): boolean {
  if (!ts.isBinaryExpression(node) || !isStrictEquality(node)) return false;
  return (
    (isRequireMainAccess(node.left) &&
      ts.isIdentifier(node.right) &&
      node.right.text === "module") ||
    (isRequireMainAccess(node.right) &&
      ts.isIdentifier(node.left) &&
      node.left.text === "module")
  );
}

function isAllowedRequireIdentifier(node: ts.Identifier): boolean {
  const main = node.parent;
  if (
    !ts.isPropertyAccessExpression(main) ||
    main.expression !== node ||
    main.name.text !== "main"
  ) {
    return false;
  }
  const usage = main.parent;
  return (
    isExactCliMainComparison(usage) ||
    (ts.isPropertyAccessExpression(usage) &&
      usage.expression === main &&
      usage.name.text === "filename")
  );
}

function isAllowedModuleIdentifier(node: ts.Identifier): boolean {
  return isExactCliMainComparison(node.parent);
}

function staticImports(source: string, filename: string): readonly string[] {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TS,
  );
  const imports: string[] = [];
  function captureModuleSpecifier(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      imports.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      throw new Error(`dynamic import is forbidden in ${filename}`);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require"
    ) {
      throw new Error(`runtime require is forbidden in ${filename}`);
    } else if (
      ts.isPropertyAccessExpression(node) &&
      FORBIDDEN_RUNTIME_LOADER_PROPERTIES.has(node.name.text)
    ) {
      throw new Error(`runtime loader property is forbidden in ${filename}`);
    } else if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteral(node.argumentExpression) &&
      FORBIDDEN_RUNTIME_LOADER_PROPERTIES.has(node.argumentExpression.text)
    ) {
      throw new Error(`runtime loader element is forbidden in ${filename}`);
    } else if (ts.isIdentifier(node)) {
      if (
        FORBIDDEN_RUNTIME_LOADER_IDENTIFIERS.has(node.text) ||
        (node.text === "require" && !isAllowedRequireIdentifier(node)) ||
        (node.text === "module" && !isAllowedModuleIdentifier(node))
      ) {
        throw new Error(
          `runtime loader identifier is forbidden in ${filename}`,
        );
      }
    }
    ts.forEachChild(node, captureModuleSpecifier);
  }
  captureModuleSpecifier(sourceFile);
  return imports;
}

function resolveLocalImport(from: string, specifier: string): string {
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(from), specifier),
  );
  if (
    resolved.startsWith("../") ||
    path.posix.isAbsolute(resolved) ||
    !resolved.startsWith("ml/")
  ) {
    throw new Error(`recovery import escaped closure: ${specifier}`);
  }
  return resolved.endsWith(".ts") ? resolved : `${resolved}.ts`;
}

async function assertExactReachableImportClosure(
  overrides: Readonly<Record<string, string>> = {},
): Promise<void> {
  const expectedFiles = Object.keys(RECOVERY_REACHABLE_IMPORTS);
  const sources = new Map<string, string>();
  for (const relative of expectedFiles) {
    sources.set(
      relative,
      overrides[relative] ??
        (await fs.promises.readFile(
          path.join(REPOSITORY_ROOT, relative),
          "utf8",
        )),
    );
  }
  const reachable = new Set<string>();
  const pending = [ENTRYPOINT_RELATIVE];
  while (pending.length > 0) {
    const relative = pending.pop();
    if (relative === undefined || reachable.has(relative)) continue;
    const source = sources.get(relative);
    const expected =
      RECOVERY_REACHABLE_IMPORTS[
        relative as keyof typeof RECOVERY_REACHABLE_IMPORTS
      ];
    if (source === undefined || expected === undefined) {
      throw new Error(
        `recovery import is outside exact allowlist: ${relative}`,
      );
    }
    reachable.add(relative);
    const actualImports = staticImports(source, relative);
    expect([...actualImports].sort()).toEqual([...expected].sort());
    for (const specifier of actualImports) {
      if (specifier.startsWith("node:")) continue;
      if (!specifier.startsWith(".")) {
        throw new Error(`recovery package import is not allowed: ${specifier}`);
      }
      pending.push(resolveLocalImport(relative, specifier));
    }
  }
  expect([...reachable].sort()).toEqual([...expectedFiles].sort());
  for (const relative of reachable) {
    for (const forbidden of FORBIDDEN_RECOVERY_REACHABILITY) {
      if (relative.includes(forbidden)) {
        throw new Error(`forbidden recovery reachability: ${relative}`);
      }
    }
  }
}

function entrypointContext(
  fixture: Fixture,
  override: Partial<FloodgateV7ProductionRecoveryOperatorEntrypointContextForTests> = {},
): FloodgateV7ProductionRecoveryOperatorEntrypointContextForTests {
  return {
    homeDirectory: fixture.home,
    cwd: fixture.root,
    argv: [path.join(fixture.home, NODE_RELATIVE), fixture.entrypoint],
    mainFilename: fixture.entrypoint,
    execArgv: ["-r", "tsx/cjs"],
    ...override,
  };
}

function nativeContext(
  homeDirectory: string,
  override: Partial<FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationContextForTests> = {},
): FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationContextForTests {
  const repositoryRoot = path.join(homeDirectory, ROOT_SUFFIX);
  const execPath = path.join(homeDirectory, NODE_RELATIVE);
  const entrypointPath = path.join(repositoryRoot, ENTRYPOINT_RELATIVE);
  const helperPath = path.join(repositoryRoot, HELPER_RELATIVE);
  const processParentPid = 12345;
  const nonce = "A".repeat(43) + "=";
  const environment = {
    HOME: homeDirectory,
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: "production",
    PATH: `${path.dirname(execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_CONTRACT:
      FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_NATIVE_LAUNCHER_ATTESTATION_CONTRACT,
    FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_PURPOSE: PURPOSE,
    FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_PARENT_PID:
      String(processParentPid),
    FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_NONCE: nonce,
    FLOODGATE_V7_RECOVERY_OPERATOR_NATIVE_LAUNCHER_HELPER: helperPath,
  };
  return {
    platform: "darwin",
    version: "v22.13.0",
    homeDirectory,
    repositoryRoot,
    cwd: repositoryRoot,
    execPath,
    argv: [execPath, entrypointPath],
    execArgv: ["-r", "tsx/cjs"],
    mainFilename: entrypointPath,
    purpose: PURPOSE,
    entrypoint: ENTRYPOINT_RELATIVE,
    helperPath,
    environment,
    frame: `${FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_NATIVE_LAUNCHER_ATTESTATION_CONTRACT}\n${PURPOSE}\n${processParentPid}\n${nonce}\n${helperPath}\n`,
    processParentPid,
    frameParentPid: processParentPid,
    parentCommand: `/usr/bin/osascript -l JavaScript ${helperPath} ${PURPOSE}`,
    ...override,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryHomes
      .splice(0)
      .map((home) => fs.promises.rm(home, { recursive: true, force: true })),
  );
});

describe("Floodgate v7 production recovery operator foundation", () => {
  it("keeps an exact one-purpose bijection across package, helper, attestation, and authorization", async () => {
    const [packageSource, helper, attestation, authorization, entrypoint] =
      await Promise.all([
        fs.promises.readFile(
          path.join(REPOSITORY_ROOT, "package.json"),
          "utf8",
        ),
        fs.promises.readFile(
          path.join(REPOSITORY_ROOT, HELPER_RELATIVE),
          "utf8",
        ),
        fs.promises.readFile(
          path.join(
            REPOSITORY_ROOT,
            "ml/floodgate-v7-production-recovery-operator-native-launcher-attestation.ts",
          ),
          "utf8",
        ),
        fs.promises.readFile(
          path.join(
            REPOSITORY_ROOT,
            "ml/floodgate-v7-production-recovery-operator-source-authorization.ts",
          ),
          "utf8",
        ),
        fs.promises.readFile(
          path.join(REPOSITORY_ROOT, ENTRYPOINT_RELATIVE),
          "utf8",
        ),
      ]);

    const packageJson = JSON.parse(packageSource) as {
      scripts: Record<string, string>;
    };
    expect(
      packageJson.scripts[
        "shogi:floodgate-v7-production-recovery-inspect-stale-prefix-100"
      ],
    ).toBe(
      '/usr/bin/osascript -l JavaScript "$(/bin/pwd -P)/ml/helpers/floodgate-v7-production-recovery-operator-native-launcher.jxa" inspect-stale-prefix-100',
    );
    const helperPairs = [...helper.matchAll(/"([^"]+)":\s*"([^"]+)",/gu)].map(
      (match) => [match[1], match[2]],
    );
    expect(helperPairs).toEqual([[PURPOSE, ENTRYPOINT_RELATIVE]]);
    expect(attestation).toContain(
      'export type FloodgateV7ProductionRecoveryOperatorNativeLauncherPurpose =\n  "inspect-stale-prefix-100";',
    );
    expect(attestation).toContain(
      `)]: "inspect-stale-prefix-100",\n} as const);`,
    );
    expect(authorization).toContain(
      `const ENTRYPOINT =\n  "${ENTRYPOINT_RELATIVE}" as const;`,
    );
    expect(entrypoint).toContain(`const PURPOSE = "${PURPOSE}" as const;`);
    expect(helper).toContain(
      ".codex/worktrees/shogi-floodgate-v7-production-recovery-operator",
    );
    expect(helper).not.toContain(
      ".codex/worktrees/shogi-floodgate-v7-production-application",
    );
  });

  it("keeps recovery frozen records on explicit own-key descriptor copying", async () => {
    const sources = await Promise.all(
      [
        "ml/floodgate-v7-production-recovery-operator-source-provenance.ts",
        "ml/floodgate-v7-production-recovery-operator-source-authorization.ts",
      ].map((relative) =>
        fs.promises.readFile(path.join(REPOSITORY_ROOT, relative), "utf8"),
      ),
    );

    for (const source of sources) {
      expect(source).toContain(
        "for (const key of reflectOwnKeys(descriptors))",
      );
      expect(source).toContain('if (typeof key !== "string") continue;');
      expect(source).toContain("descriptor.enumerable ?? false");
      expect(source).not.toContain(
        "for (const key of objectKeys(descriptors))",
      );
    }
  });

  it("captures only the dedicated fixed root and exact clean tracked revision", async () => {
    const fixture = await createFixture();

    const binding =
      await captureFloodgateV7ProductionRecoveryOperatorSourceProvenanceCoreForTests(
        {
          homeDirectory: fixture.home,
          captureExactCleanRevision: captureFloodgateGitExactCleanRevision,
        },
      );

    expect(binding).toEqual({
      layout: FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_SOURCE_LAYOUT,
      revision: fixture.revision,
    });
    expect(Object.getPrototypeOf(binding)).toBeNull();
    expect(Object.isFrozen(binding)).toBe(true);
    expect(
      resolveFloodgateV7ProductionRecoveryOperatorSourceRootCoreForTests(
        fixture.home,
      ),
    ).toBe(fixture.root);
    expect(JSON.stringify(binding)).not.toContain(fixture.root);
    await expect(
      assertFloodgateV7ProductionRecoveryOperatorRequiredTrackedClosureCoreForTests(
        fixture.root,
      ),
    ).resolves.toBeUndefined();
  });

  it.each([ENTRYPOINT_RELATIVE, HELPER_RELATIVE, "ml/floodgate-git.ts"])(
    "rejects an ignored worktree-only required closure entry: %s",
    async (requiredPath) => {
      const fixture = await createFixture();
      await git(fixture.root, ["rm", "--cached", "--", requiredPath]);
      await fs.promises.writeFile(
        path.join(fixture.root, ".gitignore"),
        `${requiredPath}\n`,
      );
      await git(fixture.root, ["add", ".gitignore"]);
      await git(fixture.root, [
        "commit",
        "-q",
        "-m",
        "hide required recovery entry",
      ]);
      expect(fs.existsSync(path.join(fixture.root, requiredPath))).toBe(true);
      expect(
        await git(fixture.root, [
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
        ]),
      ).toBe("");

      await expect(
        captureFloodgateV7ProductionRecoveryOperatorSourceProvenanceCoreForTests(
          {
            homeDirectory: fixture.home,
            captureExactCleanRevision: captureFloodgateGitExactCleanRevision,
          },
        ),
      ).rejects.toBeInstanceOf(
        FloodgateV7ProductionRecoveryOperatorSourceProvenanceError,
      );
    },
  );

  it("rejects a required closure entry with a special index flag", async () => {
    const fixture = await createFixture();
    await git(fixture.root, [
      "update-index",
      "--assume-unchanged",
      ENTRYPOINT_RELATIVE,
    ]);

    await expect(
      assertFloodgateV7ProductionRecoveryOperatorRequiredTrackedClosureCoreForTests(
        fixture.root,
      ),
    ).rejects.toBeInstanceOf(
      FloodgateV7ProductionRecoveryOperatorSourceProvenanceError,
    );
  });

  it.each([ENTRYPOINT_RELATIVE, HELPER_RELATIVE, "ml/floodgate-git.ts"])(
    "rejects a clean required source with an ignored hardlink alias: %s",
    async (requiredPath) => {
      const fixture = await createFixture();
      const aliasName = `hardlink-${path.basename(requiredPath)}`;
      await fs.promises.writeFile(
        path.join(fixture.root, ".gitignore"),
        `${aliasName}\n`,
      );
      await git(fixture.root, ["add", ".gitignore"]);
      await git(fixture.root, ["commit", "-q", "-m", "ignore hardlink probe"]);
      await fs.promises.link(
        path.join(fixture.root, requiredPath),
        path.join(fixture.root, aliasName),
      );
      expect(
        (await fs.promises.stat(path.join(fixture.root, requiredPath))).nlink,
      ).toBe(2);
      expect(
        await git(fixture.root, [
          "status",
          "--porcelain=v1",
          "--untracked-files=all",
        ]),
      ).toBe("");

      await expect(
        captureFloodgateV7ProductionRecoveryOperatorSourceProvenanceCoreForTests(
          {
            homeDirectory: fixture.home,
            captureExactCleanRevision: captureFloodgateGitExactCleanRevision,
          },
        ),
      ).rejects.toBeInstanceOf(
        FloodgateV7ProductionRecoveryOperatorSourceProvenanceError,
      );
    },
  );

  it("rejects an on-disk Git object alternate outside the fixed recovery root", async () => {
    const fixture = await createFixture();
    const localObjects = path.join(fixture.root, ".git", "objects");
    const externalObjects = path.join(fixture.home, "external-git-objects");
    await fs.promises.rename(localObjects, externalObjects);
    await fs.promises.mkdir(path.join(localObjects, "info"), {
      recursive: true,
    });
    await fs.promises.mkdir(path.join(localObjects, "pack"), {
      recursive: true,
    });
    await fs.promises.writeFile(
      path.join(localObjects, "info", "alternates"),
      `${externalObjects}\n`,
    );

    await expect(
      captureFloodgateV7ProductionRecoveryOperatorSourceProvenanceCoreForTests({
        homeDirectory: fixture.home,
        captureExactCleanRevision: captureFloodgateGitExactCleanRevision,
      }),
    ).rejects.toBeInstanceOf(
      FloodgateV7ProductionRecoveryOperatorSourceProvenanceError,
    );
  });

  it("binds the exact reachable import graph and rejects a transitive production-state edge", async () => {
    expect(
      [
        ...FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_REQUIRED_TRACKED_PATHS,
      ].sort(),
    ).toEqual(
      [
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        HELPER_RELATIVE,
        ...Object.keys(RECOVERY_REACHABLE_IMPORTS),
      ].sort(),
    );
    await expect(assertExactReachableImportClosure()).resolves.toBeUndefined();
    const authorizationPath =
      "ml/floodgate-v7-production-recovery-operator-source-authorization.ts";
    const authorizationSource = await fs.promises.readFile(
      path.join(REPOSITORY_ROOT, authorizationPath),
      "utf8",
    );
    await expect(
      assertExactReachableImportClosure({
        [authorizationPath]: `${authorizationSource}\nimport "./floodgate-v7-production-outer-gate-lease";\n`,
      }),
    ).rejects.toThrow();
  });

  it.each([
    'module.require("./floodgate-v7-production-outer-gate-lease");',
    'const load = require; load("./floodgate-v7-production-outer-gate-lease");',
    'void import("./floodgate-v7-production-outer-gate-lease");',
    'eval("require(\\"./floodgate-v7-production-outer-gate-lease\\")");',
    'Function("return require")()("./floodgate-v7-production-outer-gate-lease");',
    'globalThis["eval"]("require(\\"./floodgate-v7-production-outer-gate-lease\\")");',
    'process.getBuiltinModule("module").createRequire(__filename)("./floodgate-v7-production-outer-gate-lease");',
  ])("rejects a runtime-loader bypass: %s", async (statement) => {
    const authorizationPath =
      "ml/floodgate-v7-production-recovery-operator-source-authorization.ts";
    const authorizationSource = await fs.promises.readFile(
      path.join(REPOSITORY_ROOT, authorizationPath),
      "utf8",
    );
    await expect(
      assertExactReachableImportClosure({
        [authorizationPath]: `${authorizationSource}\n${statement}\n`,
      }),
    ).rejects.toThrow();
  });

  it("rejects a dirty recovery source and does not reuse the production application root", async () => {
    const fixture = await createFixture();
    await fs.promises.writeFile(
      path.join(fixture.root, "untracked.txt"),
      "dirty\n",
    );

    await expect(
      captureFloodgateV7ProductionRecoveryOperatorSourceProvenanceCoreForTests({
        homeDirectory: fixture.home,
        captureExactCleanRevision: captureFloodgateGitExactCleanRevision,
      }),
    ).rejects.toBeInstanceOf(
      FloodgateV7ProductionRecoveryOperatorSourceProvenanceError,
    );
    expect(fixture.root).toContain(
      "shogi-floodgate-v7-production-recovery-operator",
    );
    expect(fixture.root).not.toContain(
      "shogi-floodgate-v7-production-application/",
    );
  });

  it("requires the dedicated root, exact argv/main tuple, and exact runtime loader", async () => {
    const fixture = await createFixture();
    expect(() =>
      assertFloodgateV7ProductionRecoveryOperatorEntrypointContextCoreForTests(
        ENTRYPOINT_RELATIVE,
        entrypointContext(fixture),
      ),
    ).not.toThrow();

    for (const override of [
      { cwd: fixture.home },
      { argv: [process.execPath, fixture.tracked] },
      { argv: [process.execPath, fixture.entrypoint, "extra"] },
      { mainFilename: fixture.tracked },
      { mainFilename: null },
      { execArgv: ["--require", "tsx/cjs"] },
    ]) {
      expect(() =>
        assertFloodgateV7ProductionRecoveryOperatorEntrypointContextCoreForTests(
          ENTRYPOINT_RELATIVE,
          entrypointContext(fixture, override),
        ),
      ).toThrow(FloodgateV7ProductionRecoveryOperatorSourceProvenanceError);
    }
  });

  it("accepts one exact native proof and rejects replay", () => {
    const context = nativeContext("/Users/recovery-test");
    expect(() =>
      claimFloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationCoreForTests(
        context,
      ),
    ).not.toThrow();
    expect(() =>
      claimFloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationCoreForTests(
        context,
      ),
    ).toThrow(
      FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationError,
    );
  });

  it.each([
    [
      "root",
      (base: ReturnType<typeof nativeContext>) => ({
        repositoryRoot: `${base.repositoryRoot}-other`,
      }),
    ],
    [
      "argv",
      (base: ReturnType<typeof nativeContext>) => ({
        argv: [base.execPath, path.join(base.repositoryRoot, "wrong.ts")],
      }),
    ],
    ["runtime", () => ({ version: "v22.13.1" })],
    [
      "environment",
      (base: ReturnType<typeof nativeContext>) => ({
        environment: { ...base.environment, NODE_OPTIONS: "--inspect" },
      }),
    ],
    [
      "production environment namespace",
      (base: ReturnType<typeof nativeContext>) => ({
        environment: {
          ...base.environment,
          FLOODGATE_V7_NATIVE_LAUNCHER_PURPOSE: PURPOSE,
        },
      }),
    ],
    ["purpose", () => ({ purpose: "durable-prefix-100" })],
  ] as const)("rejects wrong native %s", (_label, override) => {
    const base = nativeContext("/Users/recovery-test");
    expect(() =>
      claimFloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationCoreForTests(
        nativeContext("/Users/recovery-test", override(base)),
      ),
    ).toThrow(
      FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationError,
    );
  });

  it.each(["argv", "execArgv"] as const)(
    "rejects a Proxy-backed native %s array without consulting traps",
    (key) => {
      const base = nativeContext("/Users/recovery-test");
      const proxy = new Proxy([...base[key]], {
        getOwnPropertyDescriptor() {
          throw new Error("SENSITIVE_NATIVE_ARRAY_PROXY_CANARY");
        },
      });
      expect(() =>
        claimFloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationCoreForTests(
          nativeContext("/Users/recovery-test", { [key]: proxy }),
        ),
      ).toThrow(
        FloodgateV7ProductionRecoveryOperatorNativeLauncherAttestationError,
      );
    },
  );

  it("mints a one-shot STOP-only capability after exact recovery source evidence", async () => {
    const capability =
      await authorizeFloodgateV7ProductionRecoveryOperatorExecutionCoreForTests(
        PURPOSE,
        async () => ({
          layout: FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_SOURCE_LAYOUT,
          revision: REVISION,
        }),
      );

    expect(capability).toEqual({
      contract:
        FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_EXECUTION_CAPABILITY_CONTRACT,
      status:
        FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_EXECUTION_CAPABILITY_STATUS,
    });
    expect(Object.getPrototypeOf(capability)).toBeNull();
    expect(Object.isFrozen(capability)).toBe(true);
    claimFloodgateV7ProductionRecoveryOperatorExecutionCoreForTests(
      capability,
      PURPOSE,
      "stop-entry",
    );
    expect(() =>
      claimFloodgateV7ProductionRecoveryOperatorExecutionCoreForTests(
        capability,
        PURPOSE,
        "stop-entry",
      ),
    ).toThrow(FloodgateV7ProductionRecoveryOperatorSourceAuthorizationError);
  });

  it("makes recovery and production application capabilities mutually unclaimable", async () => {
    const recovery =
      await authorizeFloodgateV7ProductionRecoveryOperatorExecutionCoreForTests(
        PURPOSE,
        async () => ({
          layout: FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_SOURCE_LAYOUT,
          revision: REVISION,
        }),
      );
    const production =
      await authorizeFloodgateV7ProductionApplicationExecutionCoreForTests(
        "durable-prefix-100",
        async () => ({
          layout: "fixed-current-euid-userinfo-home-production-application-v1",
          revision: REVISION,
        }),
      );

    expect(() =>
      claimFloodgateV7ProductionApplicationExecutionCoreForTests(
        recovery as never,
        "durable-prefix-100",
        "runner-entry",
      ),
    ).toThrow("authorization failed");
    expect(() =>
      claimFloodgateV7ProductionRecoveryOperatorExecutionCoreForTests(
        production as never,
        PURPOSE,
        "stop-entry",
      ),
    ).toThrow("authorization failed");
    claimFloodgateV7ProductionRecoveryOperatorExecutionCoreForTests(
      recovery,
      PURPOSE,
      "stop-entry",
    );
    claimFloodgateV7ProductionApplicationExecutionCoreForTests(
      production,
      "durable-prefix-100",
      "runner-entry",
    );
  });

  it("rejects production-layout or malformed source evidence", async () => {
    for (const value of [
      {
        layout: "fixed-current-euid-userinfo-home-production-application-v1",
        revision: REVISION,
      },
      {
        layout: FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_SOURCE_LAYOUT,
        revision: REVISION,
        path: "/private/recovery",
      },
      {
        layout: FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_SOURCE_LAYOUT,
        revision: "D".repeat(40),
      },
    ]) {
      await expect(
        authorizeFloodgateV7ProductionRecoveryOperatorExecutionCoreForTests(
          PURPOSE,
          async () => value,
        ),
      ).rejects.toMatchObject({
        phase: "source-verification",
        capability_issued: false,
        persistent_mutation_performed: false,
        sensitive_values_disclosed: false,
      });
    }
  });

  it("returns only a sanitized NOT-YET-IMPLEMENTED/STOP receipt with all state access false", async () => {
    const [authorized, unauthorized, source] = await Promise.all([
      Promise.resolve(
        buildFloodgateV7ProductionRecoveryOperatorStopCoreForTests(true),
      ),
      Promise.resolve(
        buildFloodgateV7ProductionRecoveryOperatorStopCoreForTests(false),
      ),
      fs.promises.readFile(
        path.join(REPOSITORY_ROOT, ENTRYPOINT_RELATIVE),
        "utf8",
      ),
    ]);

    for (const receipt of [authorized, unauthorized]) {
      expect(receipt).toMatchObject({
        contract: FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_STOP_CONTRACT,
        status: "NOT-YET-IMPLEMENTED",
        decision: "STOP",
        purpose: PURPOSE,
        production_state_inspected: false,
        registry_accessed: false,
        lease_accessed: false,
        stage_accessed: false,
        work_accessed: false,
        deployment_key_accessed: false,
        persistent_mutation_performed: false,
        live_weight_changed: false,
        sensitive_values_disclosed: false,
      });
      expect(Object.isFrozen(receipt)).toBe(true);
    }
    expect(authorized.source_authorized).toBe(true);
    expect(unauthorized.source_authorized).toBe(false);
    await expect(assertExactReachableImportClosure()).resolves.toBeUndefined();
    expect(source).not.toContain("production-connector-registry");
  });
});
