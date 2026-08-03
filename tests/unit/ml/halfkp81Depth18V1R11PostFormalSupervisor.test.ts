import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildHalfkp81Depth18V1R11EnvironmentFaultIntentForTests,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_LEDGER_SCHEMA,
  HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_SCHEMA,
} from "../../../ml/halfkp81-depth18-teacher-runner";
import {
  createV1R11AuthorityDirectory,
  pinV1R11AuthorityDirectory,
  publishV1R11CreateOnlyBytes,
  v1r11CanonicalJson,
  v1r11CanonicalLine,
} from "../../../ml/halfkp81-depth18-v1r11-authority-io";
import { halfkp81V1R11FormalRunFingerprintV2 } from "../../../ml/halfkp81-depth18-v1r11-formal-run-intent";
import {
  produceHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests,
  type Halfkp81V1R11ProcessCleanupDependencies,
  type Halfkp81V1R11ProcessCleanupInput,
} from "../../../ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence";
import {
  runHalfkp81V1R11PostFormalSupervisorForTests,
  type Halfkp81V1R11PostFormalContext,
} from "../../../ml/run-halfkp81-depth18-v1r11-postformal-supervisor";

const roots: string[] = [];
const uid = process.geteuid?.() ?? 501;
const revision = "a".repeat(40);
const lstart = "Sun Aug  2 18:00:00 2026";

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function digest(raw: Uint8Array | string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function fakeCleanupDependencies(label: string) {
  const ps = [
    "/bin/ps",
    "-ww",
    "-axo",
    "pid=,ppid=,pgid=,lstart=,command=",
  ];
  const empty = Buffer.alloc(0);
  const queue = [
    { argv: ps, exitCode: 0, stdout: empty, stderr: empty },
    {
      argv: ["/bin/launchctl", "bootout", `gui/${uid}/${label}`],
      exitCode: 0,
      stdout: empty,
      stderr: empty,
    },
    { argv: ps, exitCode: 0, stdout: empty, stderr: empty },
    { argv: ps, exitCode: 0, stdout: empty, stderr: empty },
    { argv: ps, exitCode: 0, stdout: empty, stderr: empty },
    {
      argv: ["/bin/launchctl", "print", `gui/${uid}/${label}`],
      exitCode: 113,
      stdout: empty,
      stderr: Buffer.from(
        `Bad request.\nCould not find service "${label}" in domain for user gui: ${uid}\n`,
        "utf8",
      ),
    },
    { argv: ps, exitCode: 0, stdout: empty, stderr: empty },
    { argv: ps, exitCode: 0, stdout: empty, stderr: empty },
  ];
  let wall = Date.parse("2026-08-03T01:00:00.000Z");
  let mono = 1_000_000_000n;
  const dependencies: Halfkp81V1R11ProcessCleanupDependencies = {
    run(argv) {
      const next = queue.shift();
      if (next === undefined) throw new Error("unexpected cleanup command");
      expect(argv).toEqual(next.argv);
      wall += 5;
      mono += 5_000_000n;
      return {
        exitCode: next.exitCode,
        signal: null,
        stdout: next.stdout,
        stderr: next.stderr,
      };
    },
    nowMs: () => wall,
    monotonicNs: () => mono,
    wait: async (milliseconds) => {
      wall += milliseconds;
      mono += BigInt(milliseconds) * 1_000_000n;
    },
  };
  return { dependencies, assertDone: () => expect(queue).toHaveLength(0) };
}

async function fixture() {
  const root = await fs.promises.realpath(
    await fs.promises.mkdtemp(path.join(os.tmpdir(), "v1r11-postformal-")),
  );
  roots.push(root);
  await fs.promises.chmod(root, 0o700);
  const home = path.join(root, "home");
  const repositoryRoot = path.join(root, "repository");
  await fs.promises.mkdir(home, { mode: 0o700 });
  await fs.promises.mkdir(repositoryRoot, { mode: 0o700 });
  const formalPath = path.join(
    home,
    ".codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11",
  );
  await fs.promises.mkdir(path.dirname(formalPath), {
    recursive: true,
    mode: 0o700,
  });
  const formalDirectory = await createV1R11AuthorityDirectory(formalPath);
  const authorityPath = path.join(root, "authority");
  const authority = await createV1R11AuthorityDirectory(authorityPath);
  const teacherPlan = await publishV1R11CreateOnlyBytes(
    formalDirectory,
    path.join(formalPath, "teacher-plan.json"),
    Buffer.from('{"schema":"test-plan"}\n', "utf8"),
    "test-plan",
  );
  const launchAgentAuthority = await publishV1R11CreateOnlyBytes(
    authority,
    path.join(authorityPath, "launch.json"),
    Buffer.from('{"schema":"launch"}\n', "utf8"),
    "launch",
  );
  const preformalAuthority = await publishV1R11CreateOnlyBytes(
    authority,
    path.join(authorityPath, "preformal.json"),
    Buffer.from('{"schema":"preformal"}\n', "utf8"),
    "preformal",
  );
  const programArguments = [
    "/absolute/node",
    "runner.ts",
  ];
  const plist = Buffer.from(
    `<?xml version="1.0"?><plist><dict><key>ProgramArguments</key><array>${programArguments
      .map((value) => `<string>${value}</string>`)
      .join("")}</array></dict></plist>\n`,
    "utf8",
  );
  const plistSnapshot = await publishV1R11CreateOnlyBytes(
    authority,
    path.join(authorityPath, "launchagent.plist.snapshot"),
    plist,
    "application/x-apple-aspen-config-exact-bytes",
  );
  const label = "com.meetyudai.shogi.v1r11-postformal-test";
  const fixedRoles = {
    powerGuardian: {
      executable: "/absolute/node",
      argv: "/absolute/node guardian.ts",
    },
    stageBSupervisor: {
      executable: "/absolute/node",
      argv: "/absolute/node stage-b.ts",
    },
    yaneuraouEngine: {
      executable: "/absolute/yaneuraou",
      argv: "/absolute/yaneuraou",
    },
  } as const;
  const runnerIdentity = { pid: 700, pgid: 700, lstart } as const;
  const frozenIdentity = (name: string, schema: string, seed: string) => ({
    path: path.join(root, name),
    bytes: 1,
    sha256: seed.repeat(64),
    schema,
  });
  const formalRunIntent = Object.freeze({
    teacherPlan,
    selectionJsonl: Object.freeze({
      ...frozenIdentity(
        "selection.jsonl",
        "halfkp81-depth18-hard-parent-v2",
        "1",
      ),
      rows: 8_192,
    }),
    selectionManifest: frozenIdentity(
      "selection-manifest.json",
      "halfkp81-depth18-hard-parent-selection-manifest-v2",
      "2",
    ),
    sourceRevision: revision,
    engine: Object.freeze({
      binary: frozenIdentity(
        "yaneuraou",
        "application/x-mach-o-executable-exact-bytes",
        "3",
      ),
      evalFile: frozenIdentity(
        "nn.bin",
        "application/octet-stream-exact-bytes",
        "4",
      ),
      receipt: frozenIdentity("engine.json", "engine-receipt-v1", "5"),
    }),
    teacherContract: Object.freeze({ depth: 18 }),
    candidateContract: Object.freeze({ mode: "multipv12" }),
    plannedFinalDescriptor: plistSnapshot,
  });
  const runFingerprint = halfkp81V1R11FormalRunFingerprintV2(formalRunIntent);
  const context: Halfkp81V1R11PostFormalContext = {
    repositoryRoot,
    formalDirectory,
    teacherPlan,
    sourceRevision: revision,
    runFingerprint,
    formalRunIntent,
    launchAgentAuthority,
    preformalAuthority,
    launchagent: { label, plistSnapshot },
    runnerIdentity,
    fixedRoles,
  };
  const cleanupInput: Halfkp81V1R11ProcessCleanupInput = {
    scope: "post-formal-environment",
    teacherPlan,
    sourceRevision: revision,
    runFingerprint,
    launchagent: context.launchagent,
    runnerIdentity,
    runnerNullPhaseBeforeAnyAdmission: false,
    uid,
    homeDirectory: home,
    repositoryRoot,
    fixedRoles,
    producer: {
      source_revision: revision,
      entrypoint:
        "ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence.ts",
      dependency_closure: [
        {
          path: "ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence.ts",
          bytes: 1,
          sha256: "c".repeat(64),
        },
      ],
    },
  };
  const produceCleanup = async () => {
    const fake = fakeCleanupDependencies(label);
    const result =
      await produceHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
        cleanupInput,
        fake.dependencies,
      );
    fake.assertDone();
    return result;
  };
  return { context, formalDirectory, produceCleanup };
}

async function publishEnvironmentPowerChain(
  context: Readonly<Halfkp81V1R11PostFormalContext>,
) {
  const fault = {
    kind: "environment-continuity" as const,
    message: "power-source-not-AC-Power",
  };
  const intent = buildHalfkp81Depth18V1R11EnvironmentFaultIntentForTests({
    teacherPlan: context.teacherPlan,
    sourceRevision: revision,
    runFingerprint: context.runFingerprint,
    verifiedPreformalAuthority: context.preformalAuthority,
    launchAgentAuthority: context.launchAgentAuthority,
    fault,
  });
  const intentSha256 = digest(v1r11CanonicalJson(intent));
  const seal = (preimage: Record<string, unknown>) => ({
    ...preimage,
    entry_sha256: digest(
      `shogi-halfkp81-depth18-power-continuity-entry-v1r11\0${v1r11CanonicalJson(preimage)}`,
    ),
  });
  const admission = seal({
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_LEDGER_SCHEMA,
    status: "admission-pass",
    entry_kind: "admission",
    timestamp_utc: "2026-08-03T01:00:00.000Z",
    teacher_plan: context.teacherPlan,
    source_revision: revision,
    run_fingerprint: context.runFingerprint,
    launchagent_authority_evidence: context.launchAgentAuthority,
    preformal_authority_verified_receipt: context.preformalAuthority,
    observation: {},
    environment_fault: null,
    previous_entry_sha256: null,
  });
  const final = seal({
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_LEDGER_SCHEMA,
    status: "environment-fault",
    entry_kind: "environment-fault",
    timestamp_utc: "2026-08-03T01:00:30.000Z",
    teacher_plan: context.teacherPlan,
    source_revision: revision,
    run_fingerprint: context.runFingerprint,
    launchagent_authority_evidence: context.launchAgentAuthority,
    preformal_authority_verified_receipt: context.preformalAuthority,
    observation: {},
    environment_fault: { ...fault, intent_sha256: intentSha256 },
    previous_entry_sha256: admission.entry_sha256,
  });
  const ledgerRaw = Buffer.from(
    `${v1r11CanonicalJson(admission)}\n${v1r11CanonicalJson(final)}\n`,
    "utf8",
  );
  const ledger = await publishV1R11CreateOnlyBytes(
    context.formalDirectory,
    path.join(context.formalDirectory.path, "power-continuity.jsonl"),
    ledgerRaw,
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_LEDGER_SCHEMA,
  );
  const receipt = {
    schema: HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_SCHEMA,
    status: "environment-fault-closed",
    teacher_plan: context.teacherPlan,
    source_revision: revision,
    run_fingerprint: context.runFingerprint,
    power_ledger: ledger,
    admission_entry: admission,
    final_entry: final,
    launchagent_authority_evidence: context.launchAgentAuthority,
    preformal_authority_verified_receipt: context.preformalAuthority,
    pmset_start_anchor: {},
    pmset_end_anchor: {},
    environment_fault_preimage_sha256: intentSha256,
    producer: {},
  };
  await publishV1R11CreateOnlyBytes(
    context.formalDirectory,
    path.join(
      context.formalDirectory.path,
      "power-continuity-receipt.json",
    ),
    v1r11CanonicalLine(receipt),
    HALFKP81_DEPTH18_YANEURA_ONLY_V1R11_POWER_CONTINUITY_RECEIPT_SCHEMA,
  );
}

describe("HalfKP81 v1r11 post-formal outer supervisor", () => {
  it("independently rejects a mismatched or authority-extended run intent", async () => {
    const { context } = await fixture();
    await expect(
      runHalfkp81V1R11PostFormalSupervisorForTests(
        { ...context, runFingerprint: "f".repeat(64) },
        {} as never,
      ),
    ).rejects.toThrow(/context differs/u);
    await expect(
      runHalfkp81V1R11PostFormalSupervisorForTests(
        {
          ...context,
          formalRunIntent: {
            ...context.formalRunIntent,
            verifiedPreformalAuthority: { sha256: "e".repeat(64) },
          } as never,
        },
        {} as never,
      ),
    ).rejects.toThrow(/keys differ/u);
  });

  it("cleans a normal exit before invoking the artifact verifier", async () => {
    const value = await fixture();
    const verified = await publishV1R11CreateOnlyBytes(
      value.formalDirectory,
      path.join(value.formalDirectory.path, "verified.json"),
      Buffer.from('{"verified":true}\n', "utf8"),
      "verified",
    );
    const events: string[] = [];
    const result = await runHalfkp81V1R11PostFormalSupervisorForTests(
      value.context,
      {
        observeRunnerTerminal: async () => {
          events.push("runner-stopped");
          return {
            exitCode: 0,
            signal: null,
            runnerAndServiceObservedStopped: true,
          };
        },
        produceCleanup: async () => {
          events.push("cleanup");
          return value.produceCleanup();
        },
        verifySuccessArtifacts: async () => {
          events.push("artifact-verifier");
          return verified;
        },
        verifyEnvironmentArtifacts: async () => {
          throw new Error("unexpected environment verifier");
        },
        now: () => "2026-08-03T01:01:00.000Z",
      },
    );
    expect(result.status).toBe("success-cleaned-and-artifacts-verified");
    expect(events).toEqual(["runner-stopped", "cleanup", "artifact-verifier"]);
  });

  it("publishes an environment fault only after runner stop, cleanup and held-chain verification", async () => {
    const value = await fixture();
    await publishEnvironmentPowerChain(value.context);
    const events: string[] = [];
    const result = await runHalfkp81V1R11PostFormalSupervisorForTests(
      value.context,
      {
        observeRunnerTerminal: async () => {
          events.push("runner-stopped");
          return {
            exitCode: 1,
            signal: null,
            runnerAndServiceObservedStopped: true,
          };
        },
        produceCleanup: async () => {
          events.push("cleanup");
          return value.produceCleanup();
        },
        verifySuccessArtifacts: async () => {
          throw new Error("unexpected success verifier");
        },
        verifyEnvironmentArtifacts: async (terminalFault) => {
          events.push("environment-verifier");
          expect(fs.existsSync(terminalFault.path)).toBe(true);
          return { status: "verified" };
        },
        now: () => "2026-08-03T01:01:00.000Z",
      },
    );
    expect(result.status).toBe(
      "environment-fault-cleaned-and-verified-family-closed",
    );
    expect(events).toEqual([
      "runner-stopped",
      "cleanup",
      "environment-verifier",
    ]);
    const fault = JSON.parse(
      fs.readFileSync(
        path.join(
          value.formalDirectory.path,
          "teacher-terminal-fault.json",
        ),
        "utf8",
      ),
    );
    expect(fault.process_cleanup_evidence.path).toContain(
      "environment-process-cleanup-evidence.json",
    );
  });

  it("classifies a crash without a sealed environment row/receipt as technical unverified", async () => {
    const value = await fixture();
    const result = await runHalfkp81V1R11PostFormalSupervisorForTests(
      value.context,
      {
        observeRunnerTerminal: async () => ({
          exitCode: null,
          signal: "SIGKILL",
          runnerAndServiceObservedStopped: true,
        }),
        produceCleanup: value.produceCleanup,
        verifySuccessArtifacts: async () => {
          throw new Error("unexpected success verifier");
        },
        verifyEnvironmentArtifacts: async () => {
          throw new Error("crash must not claim environment authority");
        },
        now: () => "2026-08-03T01:01:00.000Z",
      },
    );
    expect(result.status).toBe("technical-unverified-stop-family-closed");
    expect(
      fs.existsSync(
        path.join(
          value.formalDirectory.path,
          "post-formal-technical-unverified-stop.json",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          value.formalDirectory.path,
          "teacher-terminal-fault.json",
        ),
      ),
    ).toBe(false);
  });
});
