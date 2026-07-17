import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { describe, expect, it } from "vitest";

import {
  FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_ATTESTATION_CONTRACT,
  FloodgateStableWasmDeadlineDiagnosticLauncherAttestationError,
  claimFloodgateStableWasmDeadlineDiagnosticLauncherAttestation,
} from "../../../ml/floodgate-stable-wasm-deadline-diagnostic-launcher-attestation";

const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const HELPER_RELATIVE =
  "ml/helpers/floodgate-stable-wasm-deadline-diagnostic-launcher.jxa";
const ATTESTATION_RELATIVE =
  "ml/floodgate-stable-wasm-deadline-diagnostic-launcher-attestation.ts";
const ENTRY_RELATIVE = "ml/run-floodgate-stable-wasm-deadline-diagnostic.ts";
const BUNDLE_RELATIVE = "ml/run-floodgate-stable-wasm-deadline-diagnostic.cjs";
const BUILDER_RELATIVE =
  "ml/build-floodgate-stable-wasm-deadline-diagnostic-bundle.mjs";
const helperPath = path.join(REPOSITORY_ROOT, HELPER_RELATIVE);
const darwinIt = process.platform === "darwin" ? it : it.skip;

function read(relative: string): string {
  return fs.readFileSync(path.join(REPOSITORY_ROOT, relative), "utf8");
}

describe("stable-WASM deadline diagnostic native launcher", () => {
  it("keeps one fixed argumentless preload-free JXA launch tuple", () => {
    const source = read(HELPER_RELATIVE);
    expect(source).toContain('ObjC.import("Foundation")');
    expect(source).toContain('ObjC.import("Security")');
    expect(source).toContain('ObjC.bindFunction("exit"');
    expect(source).toContain("$.SecRandomCopyBytes($.kSecRandomDefault, 32");
    expect(source).toContain(
      'const ROOT_SUFFIX =\n  ".codex/worktrees/shogi-floodgate-stable-deadline-diagnostic-application";',
    );
    expect(source).toContain(
      'const NODE_SUFFIX = ".nvm/versions/node/v22.13.0/bin/node";',
    );
    expect(source).toContain(
      'const ENTRY_SUFFIX = "ml/run-floodgate-stable-wasm-deadline-diagnostic.cjs";',
    );
    expect(source).toContain("if (arguments_.length !== 0) fail();");
    expect(source).toContain("processArguments.length !== 4");
    expect(source).toContain(
      'task.executableURL = $.NSURL.fileURLWithPath("/usr/bin/caffeinate")',
    );
    expect(source).toMatch(
      /task\.arguments = \$\(\[\s*"-dimsu",\s*configuration\.nodePath,\s*configuration\.entryPath,\s*\]\);/u,
    );
    expect(source).toContain("task.standardInput = pipe;");
    expect(source).toContain("pipe.fileHandleForWriting.closeFile;");
    expect(source).toContain("attributes.objectForKey($.NSFileReferenceCount)");
    expect(source).toContain("requireSingleLink && linkCount !== 1");
    expect(source).toContain("function fail() {\n  $.exit(70);\n}");
    for (const forbidden of [
      "tsx/cjs",
      "node_modules",
      "NODE_OPTIONS",
      "DIAGNOSTIC_PURPOSE",
      "PURPOSE_ENTRIES",
      "/Users/",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("attests only the fixed CJS child with an empty execArgv", () => {
    const source = read(ATTESTATION_RELATIVE);
    expect(
      FLOODGATE_STABLE_WASM_DEADLINE_DIAGNOSTIC_LAUNCHER_ATTESTATION_CONTRACT,
    ).toBe(
      "shogi-floodgate-stable-wasm-deadline-diagnostic-launcher-attestation-v1",
    );
    expect(source).toContain(
      "export function claimFloodgateStableWasmDeadlineDiagnosticLauncherAttestation(): void",
    );
    expect(source).toContain(
      "assertExactStringArray(process.argv, [nodePath, entrypoint]);",
    );
    expect(source).toContain("assertExactStringArray(process.execArgv, []);");
    expect(source).toContain("process.version !== REQUIRED_NODE_VERSION");
    expect(source).toContain("capturedCwd() !== repositoryRoot");
    expect(source).toContain("(require.main?.filename ?? null) !== entrypoint");
    expect(source).toContain('(expected === "file" && metadata.nlink !== 1)');
    expect(source).toContain("nodeMetadata.nlink !== 1");
    expect(source).toContain(
      'const PRELOAD_ENVIRONMENT_KEY = ["NODE", "OPTIONS"].join("_");',
    );
    expect(source).toContain(
      "if (process.env[PRELOAD_ENVIRONMENT_KEY] !== undefined) fail();",
    );
    expect(source).not.toContain("NODE_OPTIONS");
    expect(source).toContain("`${OSASCRIPT} -l JavaScript ${helperPath}`");
    expect(source).toContain("delete process.env[key]");
    expect(source).not.toContain(
      "floodgate-v7-production-native-launcher-attestation",
    );
    for (const forbidden of ["tsx/cjs", "node_modules", "/Users/"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("fails direct invocation with one fixed non-disclosing error", () => {
    let captured: unknown;
    try {
      claimFloodgateStableWasmDeadlineDiagnosticLauncherAttestation();
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(
      FloodgateStableWasmDeadlineDiagnosticLauncherAttestationError,
    );
    expect(captured).toMatchObject({
      attested: false,
      live_mutation_performed: false,
      sensitive_values_disclosed: false,
      message:
        "Floodgate stable-WASM deadline diagnostic launcher attestation failed",
      name: "FloodgateStableWasmDeadlineDiagnosticLauncherAttestationError",
    });
    expect((captured as Error).stack).toBe(
      "FloodgateStableWasmDeadlineDiagnosticLauncherAttestationError: attestation failed",
    );
    expect(JSON.stringify(captured)).not.toMatch(
      /(?:\/Users\/|nonce|helper|entrypoint|repository)/iu,
    );
  });

  it("claims before entrypoint context, source capture, or lazy binding load", () => {
    const source = read(ENTRY_RELATIVE);
    const claim = source.indexOf(
      "claimFloodgateStableWasmDeadlineDiagnosticLauncherAttestation()",
    );
    const context = source.indexOf(
      "assertFloodgateStableWasmDeadlineDiagnosticEntrypointContext(ENTRYPOINT)",
      claim,
    );
    const sourceCapture = source.indexOf(
      "captureFloodgateStableWasmDeadlineDiagnosticSourceProvenance()",
      context,
    );
    const lazyLoad = source.indexOf("lazyBindingModule()", sourceCapture);
    expect(claim).toBeGreaterThan(0);
    expect(context).toBeGreaterThan(claim);
    expect(sourceCapture).toBeGreaterThan(context);
    expect(lazyLoad).toBeGreaterThan(sourceCapture);
  });

  it("routes only the diagnostic package command through the dedicated helper", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(
      packageJson.scripts["shogi:floodgate-stable-wasm-deadline-diagnostic"],
    ).toBe(
      '/usr/bin/osascript -l JavaScript "$(/bin/pwd -P)/ml/helpers/floodgate-stable-wasm-deadline-diagnostic-launcher.jxa"',
    );
    expect(
      Object.entries(packageJson.scripts).filter(([, command]) =>
        command.includes(
          "floodgate-stable-wasm-deadline-diagnostic-launcher.jxa",
        ),
      ),
    ).toHaveLength(1);
  });

  it("keeps the tracked bundle free of preload and local-path strings once present", () => {
    const bundlePath = path.join(REPOSITORY_ROOT, BUNDLE_RELATIVE);
    if (!fs.existsSync(bundlePath)) return;
    const bundle = fs.readFileSync(bundlePath, "utf8");
    for (const forbidden of [
      "tsx/cjs",
      "node_modules",
      "NODE_OPTIONS",
      "/Users/",
      "PRIVATE_",
    ]) {
      expect(bundle).not.toContain(forbidden);
    }
  });

  it("rebuilds byte-identically under the exact source-closure and privacy hard gates", () => {
    const child = spawnSync(process.execPath, [BUILDER_RELATIVE], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "test" },
      timeout: 30_000,
    });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout).toBe("");
    expect(child.stderr).toBe("");
    const builder = read(BUILDER_RELATIVE);
    expect(builder).toContain("const exactInputAllowlist = Object.freeze([");
    expect(builder).toContain(
      "inputPaths.length !== exactInputAllowlist.length",
    );
    expect(builder).toContain("inputPath !== exactInputAllowlist[index]");
    expect(builder).toContain("/NODE_OPTIONS/u");
  });

  it("does not initialize the run-binding graph before native attestation passes", async () => {
    const temporary = await fs.promises.realpath(
      await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "deadline-pre-gate-canary-"),
      ),
    );
    try {
      const result = await build({
        absWorkingDir: REPOSITORY_ROOT,
        bundle: true,
        entryPoints: [ENTRY_RELATIVE],
        format: "cjs",
        legalComments: "none",
        logLevel: "silent",
        packages: "bundle",
        platform: "node",
        plugins: [
          {
            name: "deadline-run-binding-pre-gate-canary",
            setup(buildContext) {
              buildContext.onLoad(
                {
                  filter: /floodgate-stable-wasm-deadline-run-binding\.ts$/,
                },
                async (parameters) => ({
                  contents: `throw new Error("BINDING_PRE_GATE_CANARY");\n${await fs.promises.readFile(
                    parameters.path,
                    "utf8",
                  )}`,
                  loader: "ts",
                }),
              );
            },
          },
        ],
        sourcemap: false,
        target: "node22",
        treeShaking: true,
        write: false,
      });
      expect(result.outputFiles).toHaveLength(1);
      const canaryBundle = path.join(temporary, "canary.cjs");
      await fs.promises.writeFile(
        canaryBundle,
        result.outputFiles?.[0].contents ?? new Uint8Array(),
        { mode: 0o600 },
      );
      const child = spawnSync(process.execPath, [canaryBundle], {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "test" },
        timeout: 30_000,
      });
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(1);
      expect(child.stderr).toBe("");
      expect(child.stdout).toBe(
        `${JSON.stringify({
          phase: "launcher-attestation",
          schema: "shogi-floodgate-stable-wasm-deadline-run-binding-failure-v1",
          status: "STOP-fixed-phase-no-private-detail",
        })}\n`,
      );
      expect(`${child.stdout}${child.stderr}`).not.toContain(
        "BINDING_PRE_GATE_CANARY",
      );
    } finally {
      await fs.promises.rm(temporary, { recursive: true, force: true });
    }
  });

  darwinIt("silently rejects any caller-supplied helper argument", () => {
    const child = spawnSync(
      "/usr/bin/osascript",
      ["-l", "JavaScript", helperPath, "unexpected"],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
        env: {
          HOME: process.env.HOME,
          LANG: "C",
          LC_ALL: "C",
          NODE_ENV: "test",
          PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
        },
        timeout: 30_000,
      },
    );
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(70);
    expect(child.stdout).toBe("");
    expect(child.stderr).toBe("");
  });
});
