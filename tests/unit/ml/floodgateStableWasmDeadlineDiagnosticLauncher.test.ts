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
const FAILURE_LINE = `${JSON.stringify({
  phase: "binding-load",
  schema: "shogi-floodgate-stable-wasm-deadline-run-binding-failure-v1",
  status: "STOP-fixed-phase-no-private-detail",
})}\n`;
const COUNTER_BUCKETS = [
  "0",
  "1-1023",
  "1024-32767",
  "32768-1048575",
  "1048576-33554431",
  "33554432-2147483647",
] as const;
const DIAGNOSTIC_PHASES = [
  "requested-depth-complete",
  "winning-mate-early",
  "cooperative-deadline-after-completed-depth-0",
  "cooperative-deadline-after-completed-depth-1",
  "cooperative-deadline-after-completed-depth-2",
  "cooperative-deadline-after-completed-depth-3",
  "cooperative-deadline-after-completed-depth-4",
  "cooperative-deadline-after-completed-depth-5",
  "cooperative-deadline-after-completed-depth-6",
  "cooperative-deadline-after-completed-depth-7",
  "cooperative-deadline-after-completed-depth-8",
  "cooperative-deadline-after-completed-depth-9",
  "cooperative-deadline-after-completed-depth-10",
  "outer-watchdog",
  "failure",
] as const;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function successFixture(): Record<string, unknown> {
  return {
    calibration: {
      callback_overhead_ratio_ppm: 1_000,
      exact_parity_count: 5,
    },
    claim_boundary:
      "read-only-public-calibration-and-private-aggregate-deadline-observation-only-no-teacher-label-training-playing-strength-live-weight-or-production-gate-authority",
    diagnostic: {
      all_children_reaped: true,
      completed_depth_histogram: Array.from({ length: 12 }, (_, depth) => ({
        count: depth === 6 ? 12 : 0,
        depth,
      })),
      configured_maximum_parallel_children: 6,
      cooperative_deadline_ms: 600_000,
      individual_lane_records_returned: 0,
      leaves_bucket_histogram: COUNTER_BUCKETS.map((bucket, index) => ({
        bucket,
        count: index === 0 ? 12 : 0,
      })),
      nodes_bucket_histogram: COUNTER_BUCKETS.map((bucket, index) => ({
        bucket,
        count: index === 0 ? 12 : 0,
      })),
      observed_peak_parallel_children: 6,
      outcome_counts: {
        complete: 12,
        deadline: 0,
        failure: 0,
        watchdog: 0,
      },
      outer_watchdog_ms: 615_000,
      partial_iteration_results_adopted: 0,
      phase_histogram: DIAGNOSTIC_PHASES.map((phase, index) => ({
        count: index === 0 ? 12 : 0,
        phase,
      })),
      requests: 12,
    },
    lifecycle: {
      all_spawned_children_reaped: true,
      authenticated_callbacks: 1,
      calibration_child_reaped: 1,
      diagnostic_lanes_settled: 12,
      exact_input_claims: 1,
      postflight_claims: 1,
      registry_claims: 1,
    },
    nonclaims: {
      live_mutation: false,
      playing_strength: false,
      teacher_generation: false,
      training: false,
      tt_retry_or_resume: false,
    },
    persistent_state: {
      all_unchanged: true,
      scope_count: 13,
      unchanged_count: 13,
    },
    schema: "shogi-floodgate-stable-wasm-deadline-run-binding-v1",
    source_closure: {
      diagnostic_before_after_exact_clean: true,
      registry_application_binding_before_after_exact: true,
    },
    status: "aggregate-only-read-only-diagnostic-complete",
  };
}

const SUCCESS_LINE = `${canonicalJson(successFixture())}\n`;

function read(relative: string): string {
  return fs.readFileSync(path.join(REPOSITORY_ROOT, relative), "utf8");
}

async function runCapturedLauncherFixture(
  entrySource: string,
  options: Readonly<{
    readonly failIfSigkillAttempted?: boolean;
    readonly overallWatchdogSeconds?: number;
  }> = {},
): Promise<ReturnType<typeof spawnSync>> {
  const home = await fs.promises.realpath(os.homedir());
  const root = await fs.promises.realpath(
    await fs.promises.mkdtemp(
      path.join(home, ".deadline-launcher-capture-test-"),
    ),
  );
  try {
    await fs.promises.chmod(root, 0o700);
    const fixtureHelper = path.join(root, HELPER_RELATIVE);
    const fixtureEntry = path.join(root, BUNDLE_RELATIVE);
    await fs.promises.mkdir(path.dirname(fixtureHelper), {
      mode: 0o700,
      recursive: true,
    });
    await fs.promises.mkdir(path.dirname(fixtureEntry), {
      mode: 0o700,
      recursive: true,
    });
    const rootSuffix = path.relative(home, root);
    const nodeSuffix = path.relative(home, process.execPath);
    let helper = read(HELPER_RELATIVE)
      .replace(
        'const ROOT_SUFFIX =\n  ".codex/worktrees/shogi-floodgate-stable-deadline-diagnostic-application";',
        `const ROOT_SUFFIX = ${JSON.stringify(rootSuffix)};`,
      )
      .replace(
        'const NODE_SUFFIX = ".nvm/versions/node/v22.13.0/bin/node";',
        `const NODE_SUFFIX = ${JSON.stringify(nodeSuffix)};`,
      );
    if (options.overallWatchdogSeconds !== undefined) {
      helper = helper.replace(
        "const OVERALL_WATCHDOG_SECONDS = 180 + 2 * 615 + 30;",
        `const OVERALL_WATCHDOG_SECONDS = ${options.overallWatchdogSeconds};`,
      );
    }
    if (options.failIfSigkillAttempted) {
      const killStatement = "if ($.kill(childPid, SIGKILL) !== 0) fail();";
      const instrumented = helper.replace(killStatement, "$.exit(71);");
      if (instrumented === helper) {
        throw new Error("SIGKILL attempt test seam was not installed");
      }
      helper = instrumented;
    }
    await fs.promises.writeFile(fixtureHelper, helper, { mode: 0o600 });
    await fs.promises.writeFile(fixtureEntry, entrySource, { mode: 0o600 });
    return spawnSync(
      "/usr/bin/osascript",
      ["-l", "JavaScript", fixtureHelper],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          HOME: home,
          LANG: "C",
          LC_ALL: "C",
          NODE_ENV: "production",
          PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
        },
        timeout: 30_000,
      },
    );
  } finally {
    await fs.promises.rm(root, { force: true, recursive: true });
  }
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
      "task.executableURL = $.NSURL.fileURLWithPath(configuration.nodePath);",
    );
    expect(source).toContain("task.arguments = $([configuration.entryPath]);");
    expect(source).toContain("$.NSActivityIdleSystemSleepDisabled");
    expect(source).toContain("$.NSActivityUserInitiated");
    expect(source).toContain(
      "$.NSProcessInfo.processInfo.endActivity(activity);",
    );
    expect(source).toContain("task.standardInput = inputPipe;");
    expect(source).toContain("task.standardOutput = stdoutPipe;");
    expect(source).toContain("task.standardError = stderrPipe;");
    expect(source).toContain("inputPipe.fileHandleForWriting.closeFile;");
    expect(source).toContain("validateCapturedOutput(");
    expect(source).toContain("stderrBytes !== 0");
    expect(source).toContain(
      "const OVERALL_WATCHDOG_SECONDS = 180 + 2 * 615 + 30;",
    );
    expect(source).toContain("function terminateKillAndReap(");
    const taskTimeout = source.indexOf(
      'if (terminationResult === "task-timeout")',
    );
    const runningRecheck = source.indexOf(
      "if (!taskIsRunning(task)) fail();",
      taskTimeout,
    );
    const processIdentifier = source.indexOf(
      "task.processIdentifier",
      runningRecheck,
    );
    const secondRunningRecheck = source.indexOf(
      "if (!taskIsRunning(task)) fail();",
      processIdentifier,
    );
    const sigkill = source.indexOf(
      "if ($.kill(childPid, SIGKILL) !== 0) fail();",
      secondRunningRecheck,
    );
    expect(taskTimeout).toBeGreaterThan(0);
    expect(runningRecheck).toBeGreaterThan(taskTimeout);
    expect(processIdentifier).toBeGreaterThan(runningRecheck);
    expect(secondRunningRecheck).toBeGreaterThan(processIdentifier);
    expect(sigkill).toBeGreaterThan(secondRunningRecheck);
    expect(source).toContain('return "task-timeout";');
    expect(source).toContain('return "pipe-timeout";');
    expect(source).toContain(
      "return `${canonicalJson(sanitizeSuccess(parsed))}\\n`;",
    );
    expect(source).toContain("persistentState.scope_count !== 13");
    expect(source).not.toContain("reviewed_release_authority");
    expect(source).not.toContain("scope_count !== 14");
    expect(source).not.toContain(
      "task.standardOutput = $.NSFileHandle.fileHandleWithStandardOutput",
    );
    expect(source).not.toContain(
      "task.standardError = $.NSFileHandle.fileHandleWithStandardError",
    );
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

  it("claims and captures non-authorizing provenance before its fixed STOP", () => {
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
    const fixedStop = source.indexOf(
      'phase = "external-supervisor-unavailable"',
      sourceCapture,
    );
    expect(claim).toBeGreaterThan(0);
    expect(context).toBeGreaterThan(claim);
    expect(sourceCapture).toBeGreaterThan(context);
    expect(fixedStop).toBeGreaterThan(sourceCapture);
    expect(
      source.indexOf("binding = await lazyBindingModule()", sourceCapture),
    ).toBe(-1);
  });

  it("exposes no operational package command for the dormant helper", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(
      packageJson.scripts["shogi:floodgate-stable-wasm-deadline-diagnostic"],
    ).toBeUndefined();
    expect(
      Object.entries(packageJson.scripts).filter(([, command]) =>
        command.includes(
          "floodgate-stable-wasm-deadline-diagnostic-launcher.jxa",
        ),
      ),
    ).toHaveLength(0);
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

  darwinIt(
    "captures and forwards only one exact canonical fixed failure line",
    async () => {
      const child = await runCapturedLauncherFixture(
        `process.stdin.resume();process.stdin.on("end",()=>{process.exitCode=1;process.stdout.write(${JSON.stringify(
          FAILURE_LINE,
        )});});`,
      );
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(1);
      expect(child.stdout).toBe(FAILURE_LINE);
      expect(child.stderr).toBe("");
    },
  );

  darwinIt(
    "deep-validates and reconstructs one exact dormant success line",
    async () => {
      const child = await runCapturedLauncherFixture(
        `process.stdin.resume();process.stdin.on("end",()=>process.stdout.write(${JSON.stringify(
          SUCCESS_LINE,
        )}));`,
      );
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(0);
      expect(child.stdout).toBe(SUCCESS_LINE);
      expect(child.stderr).toBe("");
    },
  );

  darwinIt(
    "rejects a canonical success object with a nested path-bearing field",
    async () => {
      const forged = successFixture();
      const diagnostic = forged.diagnostic as Record<string, unknown>;
      diagnostic.private_path = "/Users/PRIVATE_NESTED_SUCCESS_CANARY";
      const child = await runCapturedLauncherFixture(
        `process.stdin.resume();process.stdin.on("end",()=>process.stdout.write(${JSON.stringify(
          `${canonicalJson(forged)}\n`,
        )}));`,
      );
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(70);
      expect(child.stdout).toBe("");
      expect(child.stderr).toBe("");
      expect(`${child.stdout}${child.stderr}`).not.toContain("/Users/");
      expect(`${child.stdout}${child.stderr}`).not.toContain("PRIVATE_");
    },
  );

  darwinIt.each([
    {
      label: "early top-level path-bearing throw",
      source: 'throw new Error("/Users/PRIVATE_EARLY_LOAD_CANARY");\n',
    },
    {
      label: "syntax error with path-bearing source",
      source:
        'const PRIVATE_PATH_CANARY = "/Users/PRIVATE_SYNTAX_CANARY";\nif (\n',
    },
    {
      label: "path-bearing noncanonical stdout",
      source:
        'process.stdin.resume();process.stdin.on("end",()=>process.stdout.write("/Users/PRIVATE_STDOUT_CANARY\\n"));\n',
    },
    {
      label: "canonical stdout plus path-bearing stderr",
      source: `process.stdin.resume();process.stdin.on("end",()=>{process.exitCode=1;process.stdout.write(${JSON.stringify(
        FAILURE_LINE,
      )});process.stderr.write("/Users/PRIVATE_STDERR_CANARY\\n");});`,
    },
    {
      label: "oversized stdout",
      source:
        'process.stdin.resume();process.stdin.on("end",()=>process.stdout.write("x".repeat(70000)));\n',
    },
    {
      label: "oversized stderr",
      source:
        'process.stdin.resume();process.stdin.on("end",()=>process.stderr.write("x".repeat(70000)));\n',
    },
    {
      label: "oversized output from a SIGTERM-ignoring child",
      source:
        'process.on("SIGTERM",()=>{});process.stdin.resume();process.stdin.on("end",()=>{process.stdout.write("x".repeat(70000));setInterval(()=>{},1000);});\n',
    },
    {
      label: "one stderr byte from a SIGTERM-ignoring child",
      source:
        'process.on("SIGTERM",()=>{});process.stdin.resume();process.stdin.on("end",()=>{process.stderr.write("x");setInterval(()=>{},1000);});\n',
    },
  ])(
    "silently discards $label",
    async ({ source }) => {
      const started = Date.now();
      const child = await runCapturedLauncherFixture(source);
      expect(Date.now() - started).toBeLessThan(15_000);
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(70);
      expect(child.stdout).toBe("");
      expect(child.stderr).toBe("");
      expect(`${child.stdout}${child.stderr}`).not.toContain("/Users/");
      expect(`${child.stdout}${child.stderr}`).not.toContain("PRIVATE_");
    },
    15_000,
  );

  darwinIt(
    "bounds, kills, and reaps its direct startup child",
    async () => {
      const started = Date.now();
      const child = await runCapturedLauncherFixture(
        'process.on("SIGTERM",()=>{});setInterval(()=>{},1000);\n',
        { overallWatchdogSeconds: 0.25 },
      );
      expect(Date.now() - started).toBeLessThan(15_000);
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(70);
      expect(child.stdout).toBe("");
      expect(child.stderr).toBe("");
    },
    15_000,
  );

  darwinIt(
    "fails closed without signaling a stale PID when a finite descendant holds the pipes",
    async () => {
      const started = Date.now();
      const child = await runCapturedLauncherFixture(
        [
          'const { spawn } = require("node:child_process");',
          'spawn(process.execPath,["-e","setTimeout(()=>{},6500)"],{stdio:["ignore","inherit","inherit"]});',
          'process.on("SIGTERM",()=>process.exit(0));',
          "process.stdin.resume();",
          'process.stdin.on("end",()=>{process.stderr.write("x");setInterval(()=>{},1000);});',
        ].join(""),
        { failIfSigkillAttempted: true },
      );
      expect(Date.now() - started).toBeLessThan(15_000);
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(70);
      expect(child.stdout).toBe("");
      expect(child.stderr).toBe("");
    },
    15_000,
  );
});
