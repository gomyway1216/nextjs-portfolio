import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  appendV1R11CanonicalLedgerRow,
  assertV1R11CreateOnlyTargetAbsent,
  openV1R11HeldIdentityGuard,
  pinV1R11AuthorityDirectory,
  v1r11CanonicalLine,
  v1r11Sha256,
} from "../../../ml/halfkp81-depth18-v1r11-authority-io";
import {
  produceHalfkp81V1R11StageAControlPlaneInScratchWithOsBoundaryForTests,
  type Halfkp81V1R11StageAControlPlaneCapture,
} from "../../../ml/produce-halfkp81-depth18-v1r11-preformal-gates";
import {
  createHalfkp81V1R11ScratchNamespaceCapabilityForTests,
  resolveHalfkp81V1R11ScratchNamespaceCapabilityForTests,
  verifyAndPublishHalfkp81V1R11StageAAuthority,
  verifyAndPublishHalfkp81V1R11StageAAuthorityInScratchForTests,
  verifyHalfkp81V1R11CheckAndProtectionShapeForTests,
  verifyHalfkp81V1R11GitHubPrForTests,
  verifyHalfkp81V1R11StageATestTranscriptForTests,
  verifyHalfkp81V1R11WorkflowManifestForTests,
} from "../../../ml/verify-halfkp81-depth18-v1r11-stage-a";
import {
  verifyHalfkp81V1R11All13StageABundleForTests,
  verifyHalfkp81V1R11All13StageAPayloadForTests,
} from "../../../ml/verify-halfkp81-depth18-v1r11-staged-authority";

const GATE = "artifact-verifier-implementation-tests-pass" as const;
const TEST_FILE =
  "tests/unit/ml/halfkp81Depth18TeacherArtifactValidation.test.ts";
const COMMAND = Object.freeze([
  "npx",
  "vitest",
  "run",
  TEST_FILE,
  "--reporter=json",
]);

function transcriptEntry(overrides: Readonly<Record<string, unknown>> = {}) {
  const stdout = Buffer.from(
    JSON.stringify({
      numTotalTestSuites: 1,
      numPassedTestSuites: 1,
      numFailedTestSuites: 0,
      numPendingTestSuites: 0,
      numTotalTests: 17,
      numPassedTests: 17,
      numFailedTests: 0,
      numPendingTests: 0,
      numTodoTests: 0,
      snapshot: {},
      startTime: 1_800_000_000_000,
      success: true,
      testResults: [
        {
          assertionResults: Array.from({ length: 17 }, (_, index) => ({
            title: `assertion ${index + 1}`,
            status: "passed",
          })),
          startTime: 1_800_000_000_000,
          endTime: 1_800_000_001_000,
          status: "passed",
          message: "",
          name: TEST_FILE,
        },
      ],
    }),
    "utf8",
  );
  const stderr = Buffer.alloc(0);
  return Object.freeze({
    sequence: 1,
    argv: COMMAND,
    stdin_base64: "",
    stdin_bytes: 0,
    stdin_sha256: v1r11Sha256(""),
    stdout_base64: stdout.toString("base64"),
    stdout_bytes: stdout.byteLength,
    stdout_sha256: v1r11Sha256(stdout),
    stderr_base64: "",
    stderr_bytes: 0,
    stderr_sha256: v1r11Sha256(stderr),
    exit_code: 0,
    started_at_utc: "2027-01-15T08:00:00.000Z",
    completed_at_utc: "2027-01-15T08:00:01.000Z",
    ...overrides,
  });
}

function content(
  entry: Readonly<Record<string, unknown>> = transcriptEntry(),
  overrides: Readonly<Record<string, unknown>> = {},
) {
  const stdout = v1r11CanonicalLine([entry]);
  const stderr = Buffer.alloc(0);
  return Object.freeze({
    collector: "fixed-vitest-transcript",
    request_or_command: COMMAND,
    exit_code: 0,
    stdout_base64: stdout.toString("base64"),
    stdout_bytes: stdout.byteLength,
    stdout_sha256: v1r11Sha256(stdout),
    stderr_base64: "",
    stderr_bytes: 0,
    stderr_sha256: v1r11Sha256(stderr),
    parsed_canonical_json: {
      command: COMMAND,
      test_files: [TEST_FILE],
      tests_passed: 17,
      tests_failed: 0,
      exit_code: 0,
      stdout_sha256: entry.stdout_sha256,
      stderr_sha256: entry.stderr_sha256,
    },
    ...overrides,
  });
}

function entryWithReport(report: unknown) {
  const stdout = Buffer.from(JSON.stringify(report), "utf8");
  return transcriptEntry({
    stdout_base64: stdout.toString("base64"),
    stdout_bytes: stdout.byteLength,
    stdout_sha256: v1r11Sha256(stdout),
  });
}

describe("HalfKP81 v1r11 Stage A raw transcript", () => {
  it("recomputes the fixed Vitest payload from the sealed command bytes", () => {
    expect(
      verifyHalfkp81V1R11StageATestTranscriptForTests(content(), GATE),
    ).toEqual({
      command: COMMAND,
      test_files: [TEST_FILE],
      tests_passed: 17,
      tests_failed: 0,
      exit_code: 0,
      stdout_sha256: transcriptEntry().stdout_sha256,
      stderr_sha256: transcriptEntry().stderr_sha256,
    });
  });

  it("recomputes the same raw Vitest bytes in the distinct all-13 verifier", () => {
    expect(
      verifyHalfkp81V1R11All13StageABundleForTests(GATE, content()),
    ).toEqual({
      command: COMMAND,
      test_files: [TEST_FILE],
      tests_passed: 17,
      tests_failed: 0,
      exit_code: 0,
      stdout_sha256: transcriptEntry().stdout_sha256,
      stderr_sha256: transcriptEntry().stderr_sha256,
    });
  });

  it("fails closed when the all-13 verifier sees forged Stage A semantics", () => {
    expect(() =>
      verifyHalfkp81V1R11All13StageABundleForTests(
        GATE,
        content(transcriptEntry(), {
          parsed_canonical_json: {
            ...(content().parsed_canonical_json as Readonly<
              Record<string, unknown>
            >),
            tests_passed: 999,
          },
        }),
      ),
    ).toThrow(/parsed payload differs/u);
  });

  it("rejects recomputed but non-passing clean-main and merge payloads", () => {
    expect(() =>
      verifyHalfkp81V1R11All13StageAPayloadForTests(
        "clean-main-source-authentication",
        {
          branch: "main",
          head_revision_before: "a".repeat(40),
          main_revision: "a".repeat(40),
          status_porcelain_bytes: 1,
          status_porcelain_sha256: v1r11Sha256("x"),
          head_revision_after: "a".repeat(40),
        },
      ),
    ).toThrow(/accepted semantics differ/u);
    expect(() =>
      verifyHalfkp81V1R11All13StageAPayloadForTests("regular-merge", {
        merge_revision: "a".repeat(40),
        parent_count: 2,
        first_parent_revision: "b".repeat(40),
        second_parent_revision: "c".repeat(40),
        authenticated_base_revision: "d".repeat(40),
        authenticated_pr_head_revision: "c".repeat(40),
        strategy: "merge-commit",
        base_branch: "main",
      }),
    ).toThrow(/accepted semantics differ/u);
  });

  it("rejects caller-authored parsed results and fixed-command drift", () => {
    expect(() =>
      verifyHalfkp81V1R11StageATestTranscriptForTests(
        content(transcriptEntry(), {
          parsed_canonical_json: {
            ...(content().parsed_canonical_json as Readonly<
              Record<string, unknown>
            >),
            tests_passed: 999,
          },
        }),
        GATE,
      ),
    ).toThrow(/not recomputed/u);
    expect(() =>
      verifyHalfkp81V1R11StageATestTranscriptForTests(
        content(transcriptEntry({ argv: [...COMMAND, "--changed"] })),
        GATE,
      ),
    ).toThrow(/transcript bundle binding differs|command differs/u);
  });

  it("rejects inner-stream hash tampering and noncanonical transcript bytes", () => {
    expect(() =>
      verifyHalfkp81V1R11StageATestTranscriptForTests(
        content(transcriptEntry({ stdout_sha256: "0".repeat(64) })),
        GATE,
      ),
    ).toThrow(/stdout bytes differ/u);

    const entry = transcriptEntry();
    const noncanonical = Buffer.from(`${JSON.stringify([entry])}\n`, "utf8");
    expect(() =>
      verifyHalfkp81V1R11StageATestTranscriptForTests(
        content(entry, {
          stdout_base64: noncanonical.toString("base64"),
          stdout_bytes: noncanonical.byteLength,
          stdout_sha256: v1r11Sha256(noncanonical),
        }),
        GATE,
      ),
    ).toThrow(/not canonical/u);

    expect(() =>
      verifyHalfkp81V1R11StageATestTranscriptForTests(
        content(
          entryWithReport({
            numPassedTests: 17,
            numFailedTests: 0,
            success: true,
          }),
        ),
        GATE,
      ),
    ).toThrow(/numTotalTestSuites differs/u);
  });

  it("structurally expands authenticated workflow jobs and matrix ids", () => {
    const ci = fs.readFileSync(".github/workflows/ci.yml");
    const security = fs.readFileSync(".github/workflows/security.yml");
    expect(
      verifyHalfkp81V1R11WorkflowManifestForTests(
        ".github/workflows/ci.yml",
        ci,
      ).expanded_check_names,
    ).toHaveLength(12);
    expect(
      verifyHalfkp81V1R11WorkflowManifestForTests(
        ".github/workflows/security.yml",
        security,
      ).expanded_check_names,
    ).toEqual(["npm audit"]);

    const misleadingComment = Buffer.from(
      ci
        .toString("utf8")
        .replace("name: Core quality and build", "name: Weaker core check")
        .replace("jobs:", "jobs:\n  # name: Core quality and build"),
      "utf8",
    );
    expect(() =>
      verifyHalfkp81V1R11WorkflowManifestForTests(
        ".github/workflows/ci.yml",
        misleadingComment,
      ),
    ).toThrow(/expanded job names differ/u);

    const missingMatrixMember = Buffer.from(
      ci
        .toString("utf8")
        .replace(
          "          - id: authority\n            file: tests/unit/ml/floodgateV7TrainingLabelSealedScannerAuthority.test.ts\n",
          "          # Exact-24k scanner (authority)\n",
        ),
      "utf8",
    );
    expect(() =>
      verifyHalfkp81V1R11WorkflowManifestForTests(
        ".github/workflows/ci.yml",
        missingMatrixMember,
      ),
    ).toThrow(/expanded job names differ/u);
  });

  it("rejects incomplete GitHub PR, extra checks and nonexact protection URLs", () => {
    const repository = {
      id: 1_102_298_330,
      node_id: "R_kgDOQbO82g",
      full_name: "gomyway1216/nextjs-portfolio",
    };
    const pr = {
      id: 123,
      node_id: "PR_node",
      number: 777,
      html_url: "https://github.com/gomyway1216/nextjs-portfolio/pull/777",
      state: "closed",
      draft: false,
      merged: true,
      merged_at: "2027-01-15T08:00:00.000Z",
      merge_commit_sha: "a".repeat(40),
      head: { sha: "b".repeat(40), repo: repository },
      base: { sha: "c".repeat(40), ref: "main", repo: repository },
    };
    expect(() =>
      verifyHalfkp81V1R11GitHubPrForTests(
        Buffer.from(JSON.stringify(pr), "utf8"),
        777,
      ),
    ).not.toThrow();
    const { id: _discarded, ...withoutId } = pr;
    expect(() =>
      verifyHalfkp81V1R11GitHubPrForTests(
        Buffer.from(JSON.stringify(withoutId), "utf8"),
        777,
      ),
    ).toThrow(/GitHub PR differs/u);

    const protection = {
      url: "https://api.github.com/repos/gomyway1216/nextjs-portfolio/branches/main/protection/required_status_checks",
      strict: false,
      contexts: ["Test and build", "npm audit"],
      contexts_url:
        "https://api.github.com/repos/gomyway1216/nextjs-portfolio/branches/main/protection/required_status_checks/contexts",
      checks: [
        { context: "Test and build", app_id: 15368 },
        { context: "npm audit", app_id: 15368 },
      ],
    };
    const checkRuns = {
      total_count: 15,
      check_runs: Array.from({ length: 15 }, (_, id) => ({ id })),
    };
    expect(() =>
      verifyHalfkp81V1R11CheckAndProtectionShapeForTests(checkRuns, protection),
    ).not.toThrow();
    expect(() =>
      verifyHalfkp81V1R11CheckAndProtectionShapeForTests(
        { total_count: 16, check_runs: [...checkRuns.check_runs, { id: 16 }] },
        protection,
      ),
    ).toThrow(/exactly fifteen/u);
    expect(() =>
      verifyHalfkp81V1R11CheckAndProtectionShapeForTests(checkRuns, {
        ...protection,
        contexts_url: `${protection.contexts_url}/wrong`,
      }),
    ).toThrow(/protection semantics differ/u);
  });

  it("seals append identities and rejects path swaps, extra links, and mode tampering", async () => {
    const temporaryRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-v1r11-ledger-"),
    );
    const root = await fs.promises.realpath(temporaryRoot);
    try {
      await fs.promises.chmod(root, 0o700);
      const authority = await pinV1R11AuthorityDirectory(root);
      const ledger = path.join(root, "ledger.jsonl");
      const schema = "test-v1r11-ledger";
      await expect(
        assertV1R11CreateOnlyTargetAbsent(authority, ledger, "test ledger"),
      ).resolves.toBeUndefined();
      const first = await appendV1R11CanonicalLedgerRow(
        authority,
        ledger,
        { sequence: 1, status: "pass" },
        null,
        schema,
        "test ledger",
      );
      const second = await appendV1R11CanonicalLedgerRow(
        authority,
        ledger,
        { sequence: 2, status: "pass" },
        first,
        schema,
        "test ledger",
      );
      expect(await fs.promises.readFile(ledger)).toEqual(
        Buffer.concat([
          v1r11CanonicalLine({ sequence: 1, status: "pass" }),
          v1r11CanonicalLine({ sequence: 2, status: "pass" }),
        ]),
      );
      expect(second.bytes).toBe((await fs.promises.stat(ledger)).size);
      await expect(
        assertV1R11CreateOnlyTargetAbsent(authority, ledger, "test ledger"),
      ).rejects.toThrow(/namespace is closed/u);

      const original = path.join(root, "ledger.original");
      await fs.promises.rename(ledger, original);
      await fs.promises.symlink(original, ledger);
      await expect(
        appendV1R11CanonicalLedgerRow(
          authority,
          ledger,
          { sequence: 3 },
          second,
          schema,
          "test ledger",
        ),
      ).rejects.toThrow(/owned private real single-link file/u);

      await fs.promises.unlink(ledger);
      await fs.promises.rename(original, ledger);
      const extraLink = path.join(root, "ledger.extra-link");
      await fs.promises.link(ledger, extraLink);
      await expect(
        appendV1R11CanonicalLedgerRow(
          authority,
          ledger,
          { sequence: 3 },
          second,
          schema,
          "test ledger",
        ),
      ).rejects.toThrow(/owned private real single-link file/u);
      await fs.promises.unlink(extraLink);

      await fs.promises.chmod(ledger, 0o644);
      await expect(
        appendV1R11CanonicalLedgerRow(
          authority,
          ledger,
          { sequence: 3 },
          second,
          schema,
          "test ledger",
        ),
      ).rejects.toThrow(/owned private real single-link file/u);

      await fs.promises.chmod(ledger, 0o600);
      const guard = await openV1R11HeldIdentityGuard(
        ledger,
        schema,
        "test held guard",
      );
      const swapped = path.join(root, "ledger.swapped");
      await fs.promises.rename(ledger, swapped);
      await fs.promises.writeFile(ledger, await fs.promises.readFile(swapped), {
        mode: 0o600,
        flag: "wx",
      });
      await expect(guard.validate()).rejects.toThrow(
        /changed while held guard was active/u,
      );
      await guard.close();
    } finally {
      await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

describe("HalfKP81 v1r11 scratch namespace capability", () => {
  it("brands a temp namespace, rejects a forged shape, and leaves production fixed", async () => {
    const temporary = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "v1r11-scratch-capability-"),
    );
    const root = await fs.promises.realpath(temporary);
    const authorityPath = path.join(root, "authority");
    await fs.promises.mkdir(authorityPath, { mode: 0o700 });
    const authority = await fs.promises.realpath(authorityPath);
    const teacherPlanPath = path.join(root, "teacher-plan.json");
    const capability =
      createHalfkp81V1R11ScratchNamespaceCapabilityForTests({
        scratchRoot: root,
        authorityDirectory: authority,
        teacherPlanPath,
      });
    expect(
      resolveHalfkp81V1R11ScratchNamespaceCapabilityForTests(capability),
    ).toEqual({
      scratchRoot: root,
      authorityDirectory: authority,
      teacherPlanPath,
    });
    const forged = Object.freeze({}) as typeof capability;
    expect(() =>
      resolveHalfkp81V1R11ScratchNamespaceCapabilityForTests(forged),
    ).toThrow(/capability is forged/u);

    const request = {
      repositoryRoot: path.resolve(__dirname, "../../.."),
      teacherPlan: {
        path: teacherPlanPath,
        bytes: 1,
        sha256: "a".repeat(64),
        schema:
          "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11",
      },
      sourceRevision: "b".repeat(40),
      runFingerprint: "c".repeat(64),
      authorityDirectory: { path: authority, dev: 1, ino: 1 },
      gateDirectory: {
        path: path.join(authority, "preformal-gates"),
        dev: 1,
        ino: 2,
      },
      ledgerPrefix: {
        path: path.join(authority, "preformal-authority-ledger.jsonl"),
        bytes: 1,
        sha256: "d".repeat(64),
        schema:
          "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11",
      },
    } as const;
    await expect(
      verifyAndPublishHalfkp81V1R11StageAAuthority(request),
    ).rejects.toThrow(/verification context differs/u);
    await expect(
      verifyAndPublishHalfkp81V1R11StageAAuthorityInScratchForTests(
        forged,
        request,
      ),
    ).rejects.toThrow(/capability is forged/u);
    await fs.promises.rm(root, { recursive: true, force: true });
  });

  it("runs the actual Stage-A producer in scratch and publishes all seven chained gates", async () => {
    const temporary = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "v1r11-stage-a-producer-"),
    );
    const root = await fs.promises.realpath(temporary);
    try {
      const repositoryRoot = path.resolve(__dirname, "../../..");
      const closure = [
        "ml/produce-halfkp81-depth18-v1r11-preformal-gates.ts",
        "ml/halfkp81-depth18-v1r11-authority-io.ts",
        "ml/halfkp81-depth18-v1r11-preformal-fault.ts",
      ] as const;
      await fs.promises.mkdir(path.join(root, "ml"), { mode: 0o700 });
      for (const relativePath of closure) {
        await fs.promises.copyFile(
          path.join(repositoryRoot, relativePath),
          path.join(root, relativePath),
        );
      }
      const git = (args: readonly string[]) => {
        const result = spawnSync("git", args, {
          cwd: root,
          encoding: "utf8",
        });
        expect(result.status, result.stderr).toBe(0);
      };
      git(["init", "-q"]);
      git(["add", ...closure]);
      git([
        "-c",
        "user.name=V1R11 Test",
        "-c",
        "user.email=v1r11@example.invalid",
        "commit",
        "-q",
        "-m",
        "fixture",
      ]);

      const authorityPath = path.join(root, "authority");
      await fs.promises.mkdir(authorityPath, { mode: 0o700 });
      const authorityDirectory = await pinV1R11AuthorityDirectory(
        authorityPath,
      );
      const teacherPlanPath = path.join(root, "teacher-plan.json");
      const teacherPlanSchema =
        "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11";
      const teacherPlanRaw = v1r11CanonicalLine({
        schema: teacherPlanSchema,
      });
      await fs.promises.writeFile(teacherPlanPath, teacherPlanRaw, {
        flag: "wx",
        mode: 0o600,
      });
      const capability =
        createHalfkp81V1R11ScratchNamespaceCapabilityForTests({
          scratchRoot: root,
          authorityDirectory: authorityDirectory.path,
          teacherPlanPath,
        });
      const captures = Array.from({ length: 7 }, (_, index) =>
        Object.freeze({
          collector: `stage-a-fixture-${index + 1}`,
          request: Object.freeze(["fixture", String(index + 1)]),
          rawTranscript: Buffer.from(`capture-${index + 1}\n`, "utf8"),
          payload: Object.freeze({ sequence: index + 1, pass: true }),
          stderr: Buffer.alloc(0),
        }),
      ) satisfies readonly Readonly<Halfkp81V1R11StageAControlPlaneCapture>[];

      const produced =
        await produceHalfkp81V1R11StageAControlPlaneInScratchWithOsBoundaryForTests(
          capability,
          {
            repositoryRoot: root,
            teacherPlan: Object.freeze({
              path: teacherPlanPath,
              bytes: teacherPlanRaw.byteLength,
              sha256: v1r11Sha256(teacherPlanRaw),
              schema: teacherPlanSchema,
            }),
            runFingerprint: "c".repeat(64),
            prNumber: 1,
            authorityDirectory,
          },
          captures,
        );

      expect(produced.authorityDirectory).toEqual(authorityDirectory);
      expect(produced.ledgerPrefix.path).toBe(
        path.join(authorityPath, "preformal-authority-ledger.jsonl"),
      );
      expect(
        (await fs.promises.readFile(produced.ledgerPrefix.path, "utf8"))
          .trim()
          .split("\n"),
      ).toHaveLength(7);
      expect(await fs.promises.readdir(produced.gateDirectory.path)).toHaveLength(
        21,
      );
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });

  it("has no import-time filesystem or process side effect", () => {
    const repositoryRoot = path.resolve(__dirname, "../../..");
    const preload = path.join(
      repositoryRoot,
      "node_modules/tsx/dist/cjs/index.cjs",
    );
    const entrypoint = path.join(
      repositoryRoot,
      "ml/verify-halfkp81-depth18-v1r11-stage-a.ts",
    );
    const result = spawnSync(
      process.execPath,
      [
        "-r",
        preload,
        "-e",
        `require(${JSON.stringify(entrypoint)});process.stdout.write("import-ok\\n")`,
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("import-ok\n");
  });
});
