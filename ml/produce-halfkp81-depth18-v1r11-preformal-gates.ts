import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  appendV1R11CanonicalLedgerRow,
  assertV1R11AuthorityDirectory,
  createV1R11AuthorityDirectory,
  createV1R11GateDirectory,
  publishV1R11CreateOnlyCanonical,
  readV1R11HeldIdentity,
  resolveHalfkp81V1R11ScratchNamespaceCapabilityForTests,
  v1r11CanonicalJson,
  v1r11CanonicalLine,
  v1r11Sha256,
  type V1R11AuthorityDirectoryIdentity,
  type V1R11AuthorityFileIdentity,
  type Halfkp81V1R11ScratchNamespaceCapabilityForTests,
  type Halfkp81V1R11ScratchNamespaceForTests,
} from "./halfkp81-depth18-v1r11-authority-io";
import { Halfkp81V1R11PreformalStageFailure } from "./halfkp81-depth18-v1r11-preformal-stage-failure";

const AUTHORITY_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority";
const TEACHER_PLAN_PATH =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11/teacher-plan.json";
const TEACHER_PLAN_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11";
const RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11";
const LEDGER_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11";
const LEDGER_DOMAIN =
  "shogi-halfkp81-depth18-v1r11-preformal-authority-ledger-entry-v1\0";
const REPOSITORY = "gomyway1216/nextjs-portfolio";
const REPOSITORY_IDENTITY = Object.freeze({
  host: "github.com",
  owner: "gomyway1216",
  name: "nextjs-portfolio",
  name_with_owner: REPOSITORY,
  github_repository_database_id: 1_102_298_330,
  github_repository_node_id: "R_kgDOQbO82g",
  canonical_url: `https://github.com/${REPOSITORY}`,
  canonical_origin_fetch_url: `https://github.com/${REPOSITORY}.git`,
  default_branch: "main",
});
const GITHUB_API_HEADERS = Object.freeze([
  "-H",
  "Accept: application/vnd.github+json",
  "-H",
  "X-GitHub-Api-Version: 2022-11-28",
] as const);
const EXPECTED_CHECK_CONTEXTS = Object.freeze([
  { workflow: "", check_name: "Vercel", app_slug: "vercel" },
  {
    workflow: "",
    check_name: "Vercel Preview Comments",
    app_slug: "vercel",
  },
  ...[
    "AWS witness adapter contract (source only)",
    "Core quality and build",
    "Darwin exclusive directory rename",
    "E2E smoke tests",
    "Exact-24k Teacher checkpoint",
    "Exact-24k scanner (authority)",
    "Exact-24k scanner (cleanup)",
    "Exact-24k scanner (mutation)",
    "Exact-24k scanner (production)",
    "Exact-24k scanner (replay)",
    "External trust-root protocol (source only)",
    "Test and build",
  ].map((check_name) => ({
    workflow: "CI",
    check_name,
    app_slug: "github-actions",
  })),
  {
    workflow: "Security Audit",
    check_name: "npm audit",
    app_slug: "github-actions",
  },
] as const);
const GATES = Object.freeze([
  "ready-pr",
  "all-required-ci-success",
  "regular-merge",
  "clean-main-source-authentication",
  "preformal-authority-implementation-tests-pass",
  "artifact-verifier-implementation-tests-pass",
  "power-guardian-implementation-tests-pass",
] as const);
const FALSE_AUTHORITY = Object.freeze({
  may_execute_preformal_engine_gates: false,
  may_execute_formal_teacher: false,
  may_train: false,
  may_play_formal_games: false,
  may_write_live_weights: false,
});

interface CommandResult {
  readonly command: readonly string[];
  readonly exitCode: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly startedAtUtc: string;
  readonly completedAtUtc: string;
}

export interface Halfkp81V1R11StageAControlPlaneCapture {
  readonly collector: string;
  readonly request: unknown;
  readonly rawTranscript: Buffer;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly stderr: Buffer;
}

type Capture = Halfkp81V1R11StageAControlPlaneCapture;

function command(
  cwd: string,
  executable: string,
  args: readonly string[],
): Readonly<CommandResult> {
  const startedAtUtc = new Date().toISOString();
  const result = spawnSync(executable, [...args], {
    cwd,
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
  });
  const completedAtUtc = new Date().toISOString();
  if (result.error !== undefined) throw result.error;
  return Object.freeze({
    command: Object.freeze([executable, ...args]),
    exitCode: result.status ?? -1,
    stdout: Buffer.from(result.stdout ?? Buffer.alloc(0)),
    stderr: Buffer.from(result.stderr ?? Buffer.alloc(0)),
    startedAtUtc,
    completedAtUtc,
  });
}

function successful(result: Readonly<CommandResult>, label: string): Buffer {
  if (result.exitCode !== 0) {
    throw new Error(
      `${label} failed (${result.exitCode}): ${result.stderr.toString("utf8")}`,
    );
  }
  return result.stdout;
}

function parsedObject(
  raw: Buffer,
  label: string,
): Readonly<Record<string, unknown>> {
  const value = JSON.parse(raw.toString("utf8")) as unknown;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} did not return one JSON object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function validatedVitestReport(
  raw: Buffer,
  label: string,
): Readonly<Record<string, unknown>> {
  const report = parsedObject(raw, label);
  const integer = (field: string): number => {
    const value = report[field];
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
      throw new Error(`${label} ${field} differs`);
    }
    return Number(value);
  };
  const totalSuites = integer("numTotalTestSuites");
  const passedSuites = integer("numPassedTestSuites");
  const failedSuites = integer("numFailedTestSuites");
  const pendingSuites = integer("numPendingTestSuites");
  const totalTests = integer("numTotalTests");
  const passedTests = integer("numPassedTests");
  const failedTests = integer("numFailedTests");
  const pendingTests = integer("numPendingTests");
  const todoTests = integer("numTodoTests");
  if (
    report.success !== true ||
    totalSuites < 1 ||
    totalSuites !== passedSuites + failedSuites + pendingSuites ||
    failedSuites !== 0 ||
    pendingSuites !== 0 ||
    totalTests < 1 ||
    totalTests !== passedTests + failedTests + pendingTests + todoTests ||
    failedTests !== 0 ||
    pendingTests !== 0 ||
    todoTests !== 0 ||
    !Array.isArray(report.testResults) ||
    report.testResults.length !== totalSuites
  ) {
    throw new Error(`${label} aggregate result differs`);
  }
  let assertions = 0;
  for (const result of report.testResults) {
    const suite = nestedObject(result, `${label} suite`);
    if (
      suite.status !== "passed" ||
      !Array.isArray(suite.assertionResults) ||
      suite.assertionResults.length < 1
    ) {
      throw new Error(`${label} suite result differs`);
    }
    assertions += suite.assertionResults.length;
    for (const assertion of suite.assertionResults) {
      if (nestedObject(assertion, `${label} assertion`).status !== "passed") {
        throw new Error(`${label} assertion result differs`);
      }
    }
  }
  if (assertions !== totalTests || passedTests !== totalTests) {
    throw new Error(`${label} assertion count differs`);
  }
  return report;
}

function producerIdentity(repositoryRoot: string, sourceRevision: string) {
  const entrypoint = "ml/produce-halfkp81-depth18-v1r11-preformal-gates.ts";
  const closure = [
    entrypoint,
    "ml/halfkp81-depth18-v1r11-authority-io.ts",
    "ml/halfkp81-depth18-v1r11-preformal-fault.ts",
  ];
  return Object.freeze({
    source_revision: sourceRevision,
    entrypoint,
    dependency_closure: Object.freeze(
      closure.map((relativePath) => {
        const raw = fs.readFileSync(path.join(repositoryRoot, relativePath));
        const tracked = successful(
          command(repositoryRoot, "git", [
            "show",
            `${sourceRevision}:${relativePath}`,
          ]),
          `tracked producer closure ${relativePath}`,
        );
        if (!raw.equals(tracked)) {
          throw new Error(
            `producer closure ${relativePath} differs from tracked source`,
          );
        }
        return Object.freeze({
          path: relativePath,
          bytes: raw.byteLength,
          sha256: v1r11Sha256(raw),
        });
      }),
    ),
  });
}

function gitText(repositoryRoot: string, args: readonly string[]): string {
  const result = command(repositoryRoot, "git", args);
  return successful(result, `git ${args.join(" ")}`)
    .toString("utf8")
    .trim();
}

function ghCommand(endpoint: string): readonly string[] {
  return Object.freeze([
    "/usr/bin/env",
    "gh",
    "api",
    "--method",
    "GET",
    endpoint,
    ...GITHUB_API_HEADERS,
  ]);
}

function runArgv(
  repositoryRoot: string,
  argv: readonly string[],
): Readonly<CommandResult> {
  const [executable, ...args] = argv;
  if (executable === undefined) throw new Error("empty Stage A command");
  return command(repositoryRoot, executable, args);
}

function transcriptEntry(result: Readonly<CommandResult>, sequence: number) {
  const stdin = Buffer.alloc(0);
  return Object.freeze({
    sequence,
    argv: result.command,
    stdin_base64: "",
    stdin_bytes: 0,
    stdin_sha256: v1r11Sha256(stdin),
    stdout_base64: result.stdout.toString("base64"),
    stdout_bytes: result.stdout.byteLength,
    stdout_sha256: v1r11Sha256(result.stdout),
    stderr_base64: result.stderr.toString("base64"),
    stderr_bytes: result.stderr.byteLength,
    stderr_sha256: v1r11Sha256(result.stderr),
    exit_code: result.exitCode,
    started_at_utc: result.startedAtUtc,
    completed_at_utc: result.completedAtUtc,
  });
}

function transcript(results: readonly Readonly<CommandResult>[]): Buffer {
  results.forEach((result, index) =>
    successful(result, `Stage A command ${index + 1}`),
  );
  return v1r11CanonicalLine(
    results.map((result, index) => transcriptEntry(result, index + 1)),
  );
}

function resolveGhIdentity(repositoryRoot: string) {
  const executable = (process.env.PATH ?? "")
    .split(path.delimiter)
    .map((directory) => path.join(directory, "gh"))
    .find((candidate) => {
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
  if (executable === undefined) throw new Error("gh executable is unavailable");
  const realpath = fs.realpathSync(executable);
  const raw = fs.readFileSync(realpath);
  const metadata = fs.statSync(realpath);
  const version = command(repositoryRoot, realpath, ["--version"]);
  successful(version, "gh --version");
  return Object.freeze({
    invoked_path: "gh",
    realpath,
    bytes: raw.byteLength,
    sha256: v1r11Sha256(raw),
    uid: metadata.uid,
    mode: `0${(metadata.mode & 0o777).toString(8).padStart(3, "0")}`,
    version_stdout_sha256: v1r11Sha256(version.stdout),
  });
}

function nestedObject(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} differs`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function githubViewer(raw: Buffer) {
  const parsed = parsedObject(raw, "GitHub viewer");
  if (
    typeof parsed.login !== "string" ||
    !Number.isSafeInteger(parsed.id) ||
    typeof parsed.node_id !== "string"
  ) {
    throw new Error("GitHub viewer identity differs");
  }
  return Object.freeze({ login: parsed.login, database_id: parsed.id });
}

function githubPull(raw: Buffer, prNumber: number) {
  const pull = parsedObject(raw, "GitHub PR");
  const head = nestedObject(pull.head, "GitHub PR head");
  const base = nestedObject(pull.base, "GitHub PR base");
  const headRepo = nestedObject(head.repo, "GitHub PR head repository");
  const baseRepo = nestedObject(base.repo, "GitHub PR base repository");
  if (
    !Number.isSafeInteger(pull.id) ||
    Number(pull.id) < 1 ||
    typeof pull.node_id !== "string" ||
    pull.node_id.length < 1 ||
    pull.number !== prNumber ||
    pull.state !== "closed" ||
    pull.draft !== false ||
    pull.merged !== true ||
    typeof pull.merged_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(pull.merged_at) ||
    new Date(pull.merged_at).toISOString() !== pull.merged_at ||
    !/^[0-9a-f]{40}$/u.test(String(pull.merge_commit_sha)) ||
    pull.html_url !== `https://github.com/${REPOSITORY}/pull/${prNumber}` ||
    !/^[0-9a-f]{40}$/u.test(String(head.sha)) ||
    !/^[0-9a-f]{40}$/u.test(String(base.sha)) ||
    base.ref !== "main" ||
    headRepo.id !== REPOSITORY_IDENTITY.github_repository_database_id ||
    headRepo.node_id !== REPOSITORY_IDENTITY.github_repository_node_id ||
    headRepo.full_name !== REPOSITORY ||
    baseRepo.id !== REPOSITORY_IDENTITY.github_repository_database_id ||
    baseRepo.node_id !== REPOSITORY_IDENTITY.github_repository_node_id ||
    baseRepo.full_name !== REPOSITORY
  ) {
    throw new Error("GitHub merged PR identity differs");
  }
  return { pull, head, base };
}

function workflowManifest(relativePath: string, raw: Buffer) {
  const text = raw.toString("utf8");
  const lines = text.split("\n");
  if (lines.some((line) => /^\s*\t/u.test(line))) {
    throw new Error(`${relativePath} uses unsupported tab indentation`);
  }
  const workflowNames = lines
    .map((line) => /^name:\s*([^#]+?)\s*$/u.exec(line)?.[1])
    .filter((value): value is string => value !== undefined);
  const onIndex = lines.indexOf("on:");
  const jobsIndex = lines.indexOf("jobs:");
  const pullRequestIndex = lines.indexOf("  pull_request:");
  const branchMatch = lines
    .slice(pullRequestIndex + 1, jobsIndex)
    .map((line) => /^    branches:\s*\[([^\]]+)\]\s*$/u.exec(line))
    .find((match) => match !== null);
  const branches =
    branchMatch?.[1]?.split(",").map((value) => value.trim()) ?? [];
  if (
    workflowNames.length !== 1 ||
    onIndex < 0 ||
    pullRequestIndex <= onIndex ||
    jobsIndex <= pullRequestIndex ||
    v1r11CanonicalJson(branches) !== v1r11CanonicalJson(["main"])
  ) {
    throw new Error(`${relativePath} workflow manifest differs`);
  }
  const workflowName = workflowNames[0]!;
  const jobStarts = lines
    .map((line, index) => ({
      match: /^  ([A-Za-z0-9_-]+):\s*$/u.exec(line),
      index,
    }))
    .filter(
      (item): item is { match: RegExpExecArray; index: number } =>
        item.index > jobsIndex && item.match !== null,
    );
  if (jobStarts.length < 1) throw new Error(`${relativePath} has no jobs`);
  const expandedNames: string[] = [];
  const jobKeys = new Set<string>();
  for (const [offset, job] of jobStarts.entries()) {
    const jobKey = job.match[1]!;
    if (jobKeys.has(jobKey))
      throw new Error(`${relativePath} duplicate job ${jobKey}`);
    jobKeys.add(jobKey);
    const end = jobStarts[offset + 1]?.index ?? lines.length;
    const block = lines.slice(job.index + 1, end);
    const names = block
      .map((line) => /^    name:\s*([^#]+?)\s*$/u.exec(line)?.[1])
      .filter((value): value is string => value !== undefined);
    if (names.length !== 1)
      throw new Error(`${relativePath} job ${jobKey} name differs`);
    const matrixIds = block
      .map((line) => /^          - id:\s*([A-Za-z0-9_-]+)\s*$/u.exec(line)?.[1])
      .filter((value): value is string => value !== undefined);
    if (new Set(matrixIds).size !== matrixIds.length) {
      throw new Error(`${relativePath} job ${jobKey} matrix ids differ`);
    }
    const name = names[0]!;
    if (name.includes("${{ matrix.id }}")) {
      if (matrixIds.length < 1 || /\$\{\{(?! matrix\.id \}\})/u.test(name)) {
        throw new Error(
          `${relativePath} job ${jobKey} matrix expression differs`,
        );
      }
      expandedNames.push(
        ...matrixIds.map((id) => name.replaceAll("${{ matrix.id }}", id)),
      );
    } else {
      if (name.includes("${{") || matrixIds.length !== 0) {
        throw new Error(`${relativePath} job ${jobKey} dynamic name differs`);
      }
      expandedNames.push(name);
    }
  }
  const expectedNames = EXPECTED_CHECK_CONTEXTS.filter(
    (entry) => entry.workflow === workflowName,
  )
    .map((entry) => entry.check_name)
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right)),
    );
  const actualNames = [...expandedNames].sort((left, right) =>
    Buffer.compare(Buffer.from(left), Buffer.from(right)),
  );
  if (
    new Set(actualNames).size !== actualNames.length ||
    v1r11CanonicalJson(actualNames) !== v1r11CanonicalJson(expectedNames)
  ) {
    throw new Error(`${relativePath} expanded job names differ`);
  }
  return Object.freeze({
    repository_relative_path: relativePath,
    git_blob_oid: crypto
      .createHash("sha1")
      .update(`blob ${raw.byteLength}\0`)
      .update(raw)
      .digest("hex"),
    bytes: raw.byteLength,
    sha256: v1r11Sha256(raw),
    parsed_workflow_name: workflowName,
    parsed_pull_request_base_branches: Object.freeze(branches),
    expanded_check_names: Object.freeze(actualNames),
  });
}

function validateBranchProtection(
  branch: Readonly<Record<string, unknown>>,
): void {
  const expected = [
    { context: "Test and build", app_id: 15368 },
    { context: "npm audit", app_id: 15368 },
  ];
  const contexts = Array.isArray(branch.contexts) ? branch.contexts : [];
  const checks = Array.isArray(branch.checks) ? branch.checks : [];
  if (
    branch.url !==
      `https://api.github.com/repos/${REPOSITORY}/branches/main/protection/required_status_checks` ||
    branch.contexts_url !==
      `https://api.github.com/repos/${REPOSITORY}/branches/main/protection/required_status_checks/contexts` ||
    branch.strict !== false ||
    v1r11CanonicalJson([...contexts].sort()) !==
      v1r11CanonicalJson(expected.map((entry) => entry.context).sort()) ||
    v1r11CanonicalJson(
      [...checks].sort((left, right) =>
        Buffer.compare(
          Buffer.from(String(nestedObject(left, "branch check").context)),
          Buffer.from(String(nestedObject(right, "branch check").context)),
        ),
      ),
    ) !== v1r11CanonicalJson(expected)
  ) {
    throw new Error("branch protection semantics differ");
  }
}

function parseMergeCommit(raw: Buffer, mergeRevision: string) {
  const split = raw.indexOf(Buffer.from("\n\n"));
  if (split < 0) throw new Error("merge commit lacks exact header terminator");
  const headers = raw.subarray(0, split).toString("utf8").split("\n");
  const trees = headers.filter((line) => line.startsWith("tree "));
  const parents = headers.filter((line) => line.startsWith("parent "));
  const recomputed = crypto
    .createHash("sha1")
    .update(`commit ${raw.byteLength}\0`)
    .update(raw)
    .digest("hex");
  if (
    recomputed !== mergeRevision ||
    trees.length !== 1 ||
    headers[0] !== trees[0] ||
    parents.length !== 2 ||
    headers[1] !== parents[0] ||
    headers[2] !== parents[1]
  ) {
    throw new Error("merge commit raw identity differs");
  }
  return Object.freeze({
    firstParent: parents[0]!.slice("parent ".length),
    secondParent: parents[1]!.slice("parent ".length),
  });
}

function controlPlaneCaptures(
  repositoryRoot: string,
  prNumber: number,
): readonly Readonly<Capture>[] {
  const mergeRevision = gitText(repositoryRoot, ["rev-parse", "HEAD"]);
  const collectorIdentity = resolveGhIdentity(repositoryRoot);
  const originCommand = ["git", "remote", "get-url", "origin"] as const;
  const viewerCommand = ghCommand("user");
  const pullCommand = ghCommand(`repos/${REPOSITORY}/pulls/${prNumber}`);

  const readyResults = [
    runArgv(repositoryRoot, originCommand),
    runArgv(repositoryRoot, viewerCommand),
    runArgv(repositoryRoot, pullCommand),
    runArgv(repositoryRoot, originCommand),
  ];
  const readyPull = githubPull(readyResults[2]!.stdout, prNumber);
  const pullHead = String(readyPull.head.sha);
  const pullBase = String(readyPull.base.sha);
  const viewer = githubViewer(readyResults[1]!.stdout);
  const readyPayload = Object.freeze({
    repository: REPOSITORY_IDENTITY,
    collector_executable_identity: collectorIdentity,
    authenticated_viewer: viewer,
    pr_number: prNumber,
    pr_url: readyPull.pull.html_url,
    head_revision: pullHead,
    base_revision: pullBase,
    merge_revision: readyPull.pull.merge_commit_sha,
    base_branch: "main",
    is_draft: readyPull.pull.draft,
    state: "MERGED",
    observed_at_utc: readyResults.at(-1)!.completedAtUtc,
  });

  const checksCommand = ghCommand(
    `repos/${REPOSITORY}/commits/${pullHead}/check-runs?per_page=100&filter=latest`,
  );
  const branchCommand = ghCommand(
    `repos/${REPOSITORY}/branches/main/protection/required_status_checks`,
  );
  const workflowPaths = [
    ".github/workflows/ci.yml",
    ".github/workflows/security.yml",
  ] as const;
  const ciResults = [
    runArgv(repositoryRoot, originCommand),
    runArgv(repositoryRoot, viewerCommand),
    runArgv(repositoryRoot, checksCommand),
    runArgv(repositoryRoot, branchCommand),
    ...workflowPaths.map((relativePath) =>
      runArgv(repositoryRoot, ["git", "show", `${pullHead}:${relativePath}`]),
    ),
    runArgv(repositoryRoot, originCommand),
  ];
  ciResults.forEach((result, index) =>
    successful(result, `CI source command ${index + 1}`),
  );
  const checksResponse = parsedObject(
    ciResults[2]!.stdout,
    "GitHub check runs",
  );
  const rawRuns = Array.isArray(checksResponse.check_runs)
    ? (checksResponse.check_runs as readonly Readonly<
        Record<string, unknown>
      >[])
    : [];
  if (checksResponse.total_count !== 15 || rawRuns.length !== 15) {
    throw new Error("authenticated check-run set is not exactly fifteen");
  }
  const branch = parsedObject(ciResults[3]!.stdout, "branch protection");
  validateBranchProtection(branch);
  const workflowManifests = workflowPaths.map((relativePath, index) =>
    workflowManifest(relativePath, ciResults[index + 4]!.stdout),
  );
  const requiredCheckManifest = Object.freeze({
    schema:
      "shogi-halfkp81-depth18-yaneura-only-v1r11-required-check-manifest-v1",
    status: "exact-fifteen-head-checks-required",
    contexts: EXPECTED_CHECK_CONTEXTS,
  });
  const requiredChecks = EXPECTED_CHECK_CONTEXTS.map((expected) => {
    const matching = rawRuns.filter((candidate) => {
      const app = nestedObject(candidate.app, "check run app");
      return (
        candidate.name === expected.check_name &&
        candidate.head_sha === pullHead &&
        app.slug === expected.app_slug
      );
    });
    if (matching.length !== 1) {
      throw new Error(`required check ${expected.check_name} is not unique`);
    }
    const run = matching[0]!;
    const app = nestedObject(run.app, "check run app");
    return Object.freeze({
      workflow_name: expected.workflow,
      job_name: expected.check_name,
      check_name: expected.check_name,
      check_run_id: run.id,
      details_url: run.details_url,
      head_revision: run.head_sha,
      app_id: app.id,
      app_slug: app.slug,
      external_id: run.external_id,
      started_at: run.started_at,
      completed_at: run.completed_at,
      status: String(run.status).toUpperCase(),
      conclusion: String(run.conclusion).toUpperCase(),
    });
  }).sort((left, right) =>
    Buffer.compare(
      Buffer.from(
        `${left.workflow_name}\0${left.job_name}\0${left.check_name}\0${left.check_run_id}`,
      ),
      Buffer.from(
        `${right.workflow_name}\0${right.job_name}\0${right.check_name}\0${right.check_run_id}`,
      ),
    ),
  );
  const successfulChecks = requiredChecks.filter(
    (check) => check.status === "COMPLETED" && check.conclusion === "SUCCESS",
  ).length;
  const ciPayload = Object.freeze({
    repository: REPOSITORY_IDENTITY,
    collector_executable_identity: collectorIdentity,
    authenticated_viewer: githubViewer(ciResults[1]!.stdout),
    pr_number: prNumber,
    head_revision: pullHead,
    branch_protection_manifest: branch,
    workflow_manifests: Object.freeze(workflowManifests),
    required_check_manifest: requiredCheckManifest,
    required_checks: Object.freeze(requiredChecks),
    required_check_count: requiredChecks.length,
    successful_check_count: successfulChecks,
    failed_check_count: requiredChecks.filter(
      (check) => check.status === "COMPLETED" && check.conclusion !== "SUCCESS",
    ).length,
    pending_check_count: requiredChecks.filter(
      (check) => check.status !== "COMPLETED",
    ).length,
    conclusion:
      successfulChecks === requiredChecks.length ? "success" : "failure",
    observed_at_utc: ciResults.at(-1)!.completedAtUtc,
  });

  const mergeResults = [
    runArgv(repositoryRoot, originCommand),
    runArgv(repositoryRoot, viewerCommand),
    runArgv(repositoryRoot, [
      "git",
      "cat-file",
      "-p",
      `${mergeRevision}^{commit}`,
    ]),
    runArgv(repositoryRoot, pullCommand),
    runArgv(repositoryRoot, originCommand),
  ];
  mergeResults.forEach((result, index) =>
    successful(result, `merge source command ${index + 1}`),
  );
  const mergeParents = parseMergeCommit(mergeResults[2]!.stdout, mergeRevision);
  const mergePull = githubPull(mergeResults[3]!.stdout, prNumber);
  const mergePayload = Object.freeze({
    merge_revision: mergeRevision,
    parent_count: 2,
    first_parent_revision: mergeParents.firstParent,
    second_parent_revision: mergeParents.secondParent,
    authenticated_base_revision: mergePull.base.sha,
    authenticated_pr_head_revision: mergePull.head.sha,
    strategy: "merge-commit",
    base_branch: "main",
  });
  const cleanCommands = [
    ["git", "symbolic-ref", "--quiet", "--short", "HEAD"],
    ["git", "rev-parse", "HEAD"],
    ["git", "rev-parse", "main"],
    ["git", "status", "--porcelain=v1", "-z"],
    ["git", "rev-parse", "HEAD"],
  ] as const;
  const cleanResults = cleanCommands.map((argv) =>
    runArgv(repositoryRoot, argv),
  );
  cleanResults.forEach((result, index) =>
    successful(result, `clean source command ${index + 1}`),
  );
  const cleanPayload = Object.freeze({
    branch: cleanResults[0]!.stdout.toString("utf8").trim(),
    head_revision_before: cleanResults[1]!.stdout.toString("utf8").trim(),
    main_revision: cleanResults[2]!.stdout.toString("utf8").trim(),
    status_porcelain_bytes: cleanResults[3]!.stdout.byteLength,
    status_porcelain_sha256: v1r11Sha256(cleanResults[3]!.stdout),
    head_revision_after: cleanResults[4]!.stdout.toString("utf8").trim(),
  });
  const captures: Capture[] = [
    {
      collector: "authenticated-github-api",
      request: readyResults.map((result) => result.command),
      rawTranscript: transcript(readyResults),
      payload: readyPayload,
      stderr: Buffer.concat(readyResults.map((result) => result.stderr)),
    },
    {
      collector: "authenticated-github-api",
      request: ciResults.map((result) => result.command),
      rawTranscript: transcript(ciResults),
      payload: ciPayload,
      stderr: Buffer.concat(ciResults.map((result) => result.stderr)),
    },
    {
      collector: "fixed-git-and-authenticated-github-api",
      request: mergeResults.map((result) => result.command),
      rawTranscript: transcript(mergeResults),
      payload: mergePayload,
      stderr: Buffer.concat(mergeResults.map((result) => result.stderr)),
    },
    {
      collector: "fixed-git-command-transcript",
      request: cleanResults.map((result) => result.command),
      rawTranscript: transcript(cleanResults),
      payload: cleanPayload,
      stderr: Buffer.concat(cleanResults.map((result) => result.stderr)),
    },
  ];
  const tests = [
    ["tests/unit/ml/halfkp81Depth18V1R11StagedAuthorityE2E.test.ts"],
    ["tests/unit/ml/halfkp81Depth18TeacherArtifactValidation.test.ts"],
    [
      "tests/unit/ml/halfkp81Depth18V1R11PowerContinuity.test.ts",
      "tests/unit/ml/halfkp81Depth18TeacherRunner.test.ts",
      "tests/unit/ml/halfkp81Depth18OneShotLaunchAgent.test.ts",
    ],
  ];
  tests.forEach((files) => {
    const argv = ["vitest", "run", ...files, "--reporter=json"];
    const result = command(repositoryRoot, "npx", argv);
    const reportRaw = successful(result, `vitest ${files.join(" ")}`);
    const report = validatedVitestReport(reportRaw, "vitest report");
    captures.push({
      collector: "fixed-vitest-transcript",
      request: ["npx", ...argv],
      rawTranscript: transcript([result]),
      payload: Object.freeze({
        command: ["npx", ...argv],
        test_files: files,
        tests_passed: report.numPassedTests,
        tests_failed: report.numFailedTests,
        exit_code: result.exitCode,
        stdout_sha256: v1r11Sha256(reportRaw),
        stderr_sha256: v1r11Sha256(result.stderr),
      }),
      stderr: result.stderr,
    });
  });
  return Object.freeze(captures);
}

async function produceHalfkp81V1R11StageAControlPlaneInternal(
  request: Readonly<{
    repositoryRoot: string;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    runFingerprint: string;
    prNumber: number;
    authorityDirectory?: Readonly<V1R11AuthorityDirectoryIdentity>;
  }>,
  captureBoundary:
    | readonly Readonly<Capture>[]
    | (() => readonly Readonly<Capture>[]),
  scratchNamespace?: Readonly<Halfkp81V1R11ScratchNamespaceForTests>,
): Promise<
  Readonly<{
    authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    gateDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    ledgerPrefix: Readonly<V1R11AuthorityFileIdentity>;
  }>
> {
  const expectedTeacherPlanPath =
    scratchNamespace?.teacherPlanPath ?? TEACHER_PLAN_PATH;
  const expectedAuthorityDirectory =
    scratchNamespace?.authorityDirectory ?? AUTHORITY_DIRECTORY;
  const repositoryRoot = fs.realpathSync(request.repositoryRoot);
  if (
    repositoryRoot !== request.repositoryRoot ||
    !/^[0-9a-f]{64}$/u.test(request.runFingerprint) ||
    !Number.isSafeInteger(request.prNumber) ||
    request.prNumber < 1 ||
    request.teacherPlan.path !== expectedTeacherPlanPath ||
    request.teacherPlan.schema !== TEACHER_PLAN_SCHEMA
  ) {
    throw new Error("v1r11 Stage A producer context differs");
  }
  const sourceRevision = gitText(repositoryRoot, ["rev-parse", "HEAD"]);
  await readV1R11HeldIdentity(
    request.teacherPlan,
    request.teacherPlan.schema,
    "v1r11 Stage A teacher plan",
  );
  const authorityDirectory = request.authorityDirectory ??
    await createV1R11AuthorityDirectory(expectedAuthorityDirectory);
  if (authorityDirectory.path !== expectedAuthorityDirectory) {
    throw new Error("v1r11 Stage A precreated authority namespace differs");
  }
  await assertV1R11AuthorityDirectory(authorityDirectory);
  let gateDirectory: Readonly<V1R11AuthorityDirectoryIdentity> | null = null;
  let previousReceiptSha256: string | null = null;
  let previousEntrySha256: string | null = null;
  let ledgerIdentity: Readonly<V1R11AuthorityFileIdentity> | null = null;
  let lastGateReceipt: Readonly<V1R11AuthorityFileIdentity> | null = null;
  let currentGate: (typeof GATES)[number] | null = null;
  let currentSequence: number | null = null;
  const partialArtifacts: V1R11AuthorityFileIdentity[] = [];
  const ledgerPath = path.join(
    authorityDirectory.path,
    "preformal-authority-ledger.jsonl",
  );
  try {
    gateDirectory = await createV1R11GateDirectory(
      authorityDirectory,
      path.join(expectedAuthorityDirectory, "preformal-gates"),
    );
    const producer = producerIdentity(repositoryRoot, sourceRevision);
    const captures = typeof captureBoundary === "function"
      ? captureBoundary()
      : captureBoundary;
    if (captures.length !== GATES.length) {
      throw new Error("v1r11 Stage A capture count differs");
    }
    for (const [offset, gate] of GATES.entries()) {
      const capture = captures[offset]!;
      const sequence = offset + 1;
      currentGate = gate;
      currentSequence = sequence;
      const prefix = String(sequence).padStart(2, "0");
      const sourceKind =
        gate === "ready-pr"
          ? "github-pr-rest-response"
          : gate === "all-required-ci-success"
            ? "github-check-rollup-and-branch-protection-response"
            : gate === "regular-merge"
              ? "git-cat-file-commit-and-github-pr-response"
              : gate === "clean-main-source-authentication"
                ? "fixed-git-command-transcript-bundle"
                : "fixed-vitest-transcript-bundle";
      const sourceSchema = `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-primary-source-${sourceKind}-v1`;
      const rawTranscript = capture.rawTranscript;
      const sourceValue = Object.freeze({
        schema: sourceSchema,
        status: "captured-primary-source-no-authority",
        gate,
        sequence,
        source_sequence: 1,
        source_kind: sourceKind,
        teacher_plan: request.teacherPlan,
        source_revision: sourceRevision,
        run_fingerprint: request.runFingerprint,
        producer,
        content: Object.freeze({
          collector: capture.collector,
          request_or_command: capture.request,
          exit_code: 0,
          stdout_base64: rawTranscript.toString("base64"),
          stdout_bytes: rawTranscript.byteLength,
          stdout_sha256: v1r11Sha256(rawTranscript),
          stderr_base64: capture.stderr.toString("base64"),
          stderr_bytes: capture.stderr.byteLength,
          stderr_sha256: v1r11Sha256(capture.stderr),
          parsed_canonical_json: capture.payload,
        }),
        captured_at_utc: new Date().toISOString(),
      });
      const source = await publishV1R11CreateOnlyCanonical(
        gateDirectory,
        path.join(gateDirectory.path, `${prefix}-${gate}.source-01.bin`),
        sourceValue,
        sourceSchema,
      );
      partialArtifacts.push(source);
      const evidenceSchema = `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-evidence-v1`;
      const evidenceValue = Object.freeze({
        schema: evidenceSchema,
        status: "pass",
        gate,
        sequence,
        teacher_plan: request.teacherPlan,
        source_revision: sourceRevision,
        run_fingerprint: request.runFingerprint,
        producer,
        primary_sources: Object.freeze([source]),
        payload: capture.payload,
        produced_at_utc: new Date().toISOString(),
      });
      const evidence = await publishV1R11CreateOnlyCanonical(
        gateDirectory,
        path.join(gateDirectory.path, `${prefix}-${gate}.evidence.json`),
        evidenceValue,
        evidenceSchema,
      );
      partialArtifacts.push(evidence);
      const receiptValue = Object.freeze({
        schema: RECEIPT_SCHEMA,
        status: "pass-no-formal-authority",
        gate,
        sequence,
        teacher_plan: request.teacherPlan,
        source_revision: sourceRevision,
        run_fingerprint: request.runFingerprint,
        previous_gate_receipt_sha256: previousReceiptSha256,
        evidence,
        producer,
        authority: FALSE_AUTHORITY,
      });
      const receipt = await publishV1R11CreateOnlyCanonical(
        gateDirectory,
        path.join(gateDirectory.path, `${prefix}-${gate}.receipt.json`),
        receiptValue,
        RECEIPT_SCHEMA,
      );
      partialArtifacts.push(receipt);
      lastGateReceipt = receipt;
      const ledgerPreimage: Readonly<Record<string, unknown>> = Object.freeze({
        schema: LEDGER_SCHEMA,
        sequence,
        gate,
        previous_entry_sha256: previousEntrySha256,
        teacher_plan: request.teacherPlan,
        source_revision: sourceRevision,
        run_fingerprint: request.runFingerprint,
        gate_evidence: evidence,
        gate_receipt: receipt,
        status: "pass-no-formal-authority",
        producer,
      });
      const entrySha256 = v1r11Sha256(
        `${LEDGER_DOMAIN}${v1r11CanonicalJson(ledgerPreimage)}`,
      );
      const ledgerRow: Readonly<Record<string, unknown>> = Object.freeze({
        ...ledgerPreimage,
        entry_sha256: entrySha256,
      });
      ledgerIdentity = await appendV1R11CanonicalLedgerRow(
        authorityDirectory,
        ledgerPath,
        ledgerRow,
        ledgerIdentity,
        LEDGER_SCHEMA,
        "Stage A ledger",
      );
      previousReceiptSha256 = receipt.sha256;
      previousEntrySha256 = entrySha256;
    }
    if (ledgerIdentity === null) throw new Error("Stage A ledger is empty");
    const ledgerPrefix = ledgerIdentity;
    await readV1R11HeldIdentity(
      ledgerPrefix,
      LEDGER_SCHEMA,
      "Stage A ledger prefix",
    );
    return Object.freeze({ authorityDirectory, gateDirectory, ledgerPrefix });
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    throw new Halfkp81V1R11PreformalStageFailure({
      phase: "stage-a-producer",
      gate: currentGate,
      sequence: currentSequence,
      runnerState: "not-created",
      failure,
      artifacts: Object.freeze({
        ledgerPrefix: ledgerIdentity,
        lastGateReceipt,
        engineGateVerifiedReceipt: null,
        launchAgentAuthority: null,
        runnerIdentity: null,
        partialArtifacts: Object.freeze([...partialArtifacts]),
      }),
    });
  }
}

export async function produceHalfkp81V1R11StageAControlPlane(
  request: Parameters<typeof produceHalfkp81V1R11StageAControlPlaneInternal>[0],
) {
  const repositoryRoot = fs.realpathSync(request.repositoryRoot);
  return produceHalfkp81V1R11StageAControlPlaneInternal(
    request,
    () => controlPlaneCaptures(repositoryRoot, request.prNumber),
  );
}

/**
 * Test-only command-capture seam. Stage-A validation, create-only publication
 * and the seven-row hash chain are still produced by the production core.
 */
export async function produceHalfkp81V1R11StageAControlPlaneWithOsBoundaryForTests(
  request: Parameters<typeof produceHalfkp81V1R11StageAControlPlaneInternal>[0],
  captures: readonly Readonly<Halfkp81V1R11StageAControlPlaneCapture>[],
) {
  return produceHalfkp81V1R11StageAControlPlaneInternal(request, captures);
}

/**
 * Test-only scratch namespace seam. The opaque capability is resolved before
 * the producer performs any filesystem or process operation; the production
 * entrypoint remains pinned to the fixed formal paths.
 */
export async function produceHalfkp81V1R11StageAControlPlaneInScratchWithOsBoundaryForTests(
  capability: Readonly<Halfkp81V1R11ScratchNamespaceCapabilityForTests>,
  request: Parameters<typeof produceHalfkp81V1R11StageAControlPlaneInternal>[0],
  captures: readonly Readonly<Halfkp81V1R11StageAControlPlaneCapture>[],
) {
  const namespace = resolveHalfkp81V1R11ScratchNamespaceCapabilityForTests(
    capability,
  );
  return produceHalfkp81V1R11StageAControlPlaneInternal(
    request,
    captures,
    namespace,
  );
}
