import { execFileSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  assertV1R11AuthorityDirectory,
  openV1R11HeldIdentityGuard,
  parseV1R11CanonicalObject,
  publishV1R11CreateOnlyCanonical,
  readV1R11HeldFile,
  readV1R11HeldIdentity,
  resolveHalfkp81V1R11ScratchNamespaceCapabilityForTests,
  v1r11CanonicalJson,
  v1r11Sha256,
  type V1R11AuthorityDirectoryIdentity,
  type V1R11AuthorityFileIdentity,
  type V1R11HeldIdentityGuard,
  type Halfkp81V1R11ScratchNamespaceCapabilityForTests,
} from "./halfkp81-depth18-v1r11-authority-io";
export {
  createHalfkp81V1R11ScratchNamespaceCapabilityForTests,
  resolveHalfkp81V1R11ScratchNamespaceCapabilityForTests,
  type Halfkp81V1R11ScratchNamespaceCapabilityForTests,
  type Halfkp81V1R11ScratchNamespaceForTests,
} from "./halfkp81-depth18-v1r11-authority-io";
import { Halfkp81V1R11PreformalStageFailure } from "./halfkp81-depth18-v1r11-preformal-stage-failure";

const GATES = Object.freeze([
  "ready-pr",
  "all-required-ci-success",
  "regular-merge",
  "clean-main-source-authentication",
  "preformal-authority-implementation-tests-pass",
  "artifact-verifier-implementation-tests-pass",
  "power-guardian-implementation-tests-pass",
] as const);
const RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11";
const LEDGER_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11";
const STAGE_A_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-engine-gate-authority-verified-receipt-v1r11";
const LEDGER_DOMAIN =
  "shogi-halfkp81-depth18-v1r11-preformal-authority-ledger-entry-v1\0";
const FALSE_AUTHORITY = Object.freeze({
  may_execute_preformal_engine_gates: false,
  may_execute_formal_teacher: false,
  may_train: false,
  may_play_formal_games: false,
  may_write_live_weights: false,
});
const STAGE_A_AUTHORITY = Object.freeze({
  may_execute_preformal_engine_gates: true,
  may_execute_formal_teacher: false,
  may_train: false,
  may_play_formal_games: false,
  may_write_live_weights: false,
});
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const PRODUCER_ENTRYPOINT =
  "ml/produce-halfkp81-depth18-v1r11-preformal-gates.ts";
const PRODUCER_CLOSURE = Object.freeze([
  PRODUCER_ENTRYPOINT,
  "ml/halfkp81-depth18-v1r11-authority-io.ts",
  "ml/halfkp81-depth18-v1r11-preformal-fault.ts",
] as const);
const REPOSITORY = "gomyway1216/nextjs-portfolio";
const AUTHORITY_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority";
const TEACHER_PLAN_PATH =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11/teacher-plan.json";
const TEACHER_PLAN_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11";

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
const API_HEADERS = Object.freeze([
  "-H",
  "Accept: application/vnd.github+json",
  "-H",
  "X-GitHub-Api-Version: 2022-11-28",
] as const);
const EXPECTED_CHECK_CONTEXTS = Object.freeze([
  { workflow: "", check_name: "Vercel", app_slug: "vercel" },
  { workflow: "", check_name: "Vercel Preview Comments", app_slug: "vercel" },
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

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  if (
    v1r11CanonicalJson(Object.keys(value).sort()) !==
    v1r11CanonicalJson([...keys].sort())
  ) {
    throw new Error(`${label} keys differ`);
  }
}

function identity(value: unknown, schema: string, label: string) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} identity differs`);
  }
  const row = value as Readonly<Record<string, unknown>>;
  exactKeys(row, ["path", "bytes", "sha256", "schema"], label);
  if (
    typeof row.path !== "string" ||
    !path.isAbsolute(row.path) ||
    !Number.isSafeInteger(row.bytes) ||
    Number(row.bytes) < 1 ||
    typeof row.sha256 !== "string" ||
    !SHA256_RE.test(row.sha256) ||
    row.schema !== schema
  ) {
    throw new Error(`${label} identity differs`);
  }
  return row as unknown as Readonly<V1R11AuthorityFileIdentity>;
}

function implementationIdentity(value: unknown, sourceRevision: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("implementation identity differs");
  }
  const row = value as Readonly<Record<string, unknown>>;
  exactKeys(
    row,
    ["source_revision", "entrypoint", "dependency_closure"],
    "implementation identity",
  );
  if (
    row.source_revision !== sourceRevision ||
    typeof row.entrypoint !== "string" ||
    row.entrypoint.startsWith("/") ||
    row.entrypoint.split("/").includes("..") ||
    !Array.isArray(row.dependency_closure) ||
    row.dependency_closure.length < 1
  ) {
    throw new Error("implementation identity differs");
  }
  const paths: string[] = [];
  row.dependency_closure.forEach((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("implementation dependency closure differs");
    }
    const item = entry as Readonly<Record<string, unknown>>;
    exactKeys(item, ["path", "bytes", "sha256"], "dependency closure row");
    if (
      typeof item.path !== "string" ||
      item.path.startsWith("/") ||
      item.path.split("/").includes("..") ||
      !Number.isSafeInteger(item.bytes) ||
      Number(item.bytes) < 1 ||
      typeof item.sha256 !== "string" ||
      !SHA256_RE.test(item.sha256) ||
      (index === 0 && item.path !== row.entrypoint)
    ) {
      throw new Error("implementation dependency closure differs");
    }
    paths.push(item.path);
  });
  const tail = paths.slice(1);
  const sorted = [...tail].sort((left, right) =>
    Buffer.compare(Buffer.from(left), Buffer.from(right)),
  );
  if (
    new Set(paths).size !== paths.length ||
    v1r11CanonicalJson(tail) !== v1r11CanonicalJson(sorted)
  ) {
    throw new Error("implementation dependency closure order differs");
  }
}

function isoUtc(value: unknown, label: string): void {
  if (
    typeof value !== "string" ||
    !ISO_UTC_RE.test(value) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} differs`);
  }
}

function expectedSourceKind(gate: (typeof GATES)[number]): string {
  if (gate === "ready-pr") return "github-pr-rest-response";
  if (gate === "all-required-ci-success") {
    return "github-check-rollup-and-branch-protection-response";
  }
  if (gate === "regular-merge") {
    return "git-cat-file-commit-and-github-pr-response";
  }
  if (gate === "clean-main-source-authentication") {
    return "fixed-git-command-transcript-bundle";
  }
  return "fixed-vitest-transcript-bundle";
}

function expectedTestFiles(gate: (typeof GATES)[number]): readonly string[] {
  if (gate === "preformal-authority-implementation-tests-pass") {
    return ["tests/unit/ml/halfkp81Depth18V1R11StagedAuthorityE2E.test.ts"];
  }
  if (gate === "artifact-verifier-implementation-tests-pass") {
    return ["tests/unit/ml/halfkp81Depth18TeacherArtifactValidation.test.ts"];
  }
  return [
    "tests/unit/ml/halfkp81Depth18V1R11PowerContinuity.test.ts",
    "tests/unit/ml/halfkp81Depth18TeacherRunner.test.ts",
    "tests/unit/ml/halfkp81Depth18OneShotLaunchAgent.test.ts",
  ];
}

interface TranscriptEntry {
  readonly argv: readonly string[];
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly completedAtUtc: string;
}

function object(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} differs`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function apiCommand(endpoint: string): readonly string[] {
  return [
    "/usr/bin/env",
    "gh",
    "api",
    "--method",
    "GET",
    endpoint,
    ...API_HEADERS,
  ];
}

function decodeTranscript(
  raw: Buffer,
  label: string,
): readonly TranscriptEntry[] {
  if (
    raw.at(-1) !== 0x0a ||
    raw.subarray(0, raw.byteLength - 1).includes(0x0a)
  ) {
    throw new Error(`${label} transcript encoding differs`);
  }
  const parsed = JSON.parse(raw.toString("utf8")) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.length < 1 ||
    `${v1r11CanonicalJson(parsed)}\n` !== raw.toString("utf8")
  ) {
    throw new Error(`${label} transcript is not canonical`);
  }
  return Object.freeze(
    parsed.map((value, index) => {
      const row = object(value, `${label} transcript row ${index + 1}`);
      exactKeys(
        row,
        [
          "sequence",
          "argv",
          "stdin_base64",
          "stdin_bytes",
          "stdin_sha256",
          "stdout_base64",
          "stdout_bytes",
          "stdout_sha256",
          "stderr_base64",
          "stderr_bytes",
          "stderr_sha256",
          "exit_code",
          "started_at_utc",
          "completed_at_utc",
        ],
        `${label} transcript row ${index + 1}`,
      );
      if (
        row.sequence !== index + 1 ||
        !Array.isArray(row.argv) ||
        row.argv.length < 1 ||
        row.argv.some((part) => typeof part !== "string" || part.length < 1) ||
        row.stdin_base64 !== "" ||
        row.stdin_bytes !== 0 ||
        row.stdin_sha256 !== v1r11Sha256("") ||
        row.exit_code !== 0
      ) {
        throw new Error(`${label} transcript row ${index + 1} differs`);
      }
      isoUtc(row.started_at_utc, `${label} transcript started_at_utc`);
      isoUtc(row.completed_at_utc, `${label} transcript completed_at_utc`);
      if (String(row.started_at_utc) > String(row.completed_at_utc)) {
        throw new Error(`${label} transcript time order differs`);
      }
      const decoded = (stream: "stdout" | "stderr") => {
        const encoded = row[`${stream}_base64`];
        if (typeof encoded !== "string")
          throw new Error(`${label} ${stream} differs`);
        const bytes = Buffer.from(encoded, "base64");
        if (
          bytes.toString("base64") !== encoded ||
          row[`${stream}_bytes`] !== bytes.byteLength ||
          row[`${stream}_sha256`] !== v1r11Sha256(bytes)
        ) {
          throw new Error(`${label} ${stream} bytes differ`);
        }
        return bytes;
      };
      return Object.freeze({
        argv: Object.freeze([...(row.argv as readonly string[])]),
        stdout: decoded("stdout"),
        stderr: decoded("stderr"),
        completedAtUtc: String(row.completed_at_utc),
      });
    }),
  );
}

function parsedJson(
  raw: Buffer,
  label: string,
): Readonly<Record<string, unknown>> {
  try {
    return object(JSON.parse(raw.toString("utf8")) as unknown, label);
  } catch (error) {
    if (error instanceof Error && error.message === `${label} differs`)
      throw error;
    throw new Error(`${label} is not JSON`);
  }
}

function validatedVitestReport(raw: Buffer, label: string) {
  const report = parsedJson(raw, label);
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
  let assertionCount = 0;
  for (const result of report.testResults) {
    const suite = object(result, `${label} suite`);
    if (
      suite.status !== "passed" ||
      !Array.isArray(suite.assertionResults) ||
      suite.assertionResults.length < 1
    ) {
      throw new Error(`${label} suite result differs`);
    }
    assertionCount += suite.assertionResults.length;
    for (const assertion of suite.assertionResults) {
      if (object(assertion, `${label} assertion`).status !== "passed") {
        throw new Error(`${label} assertion result differs`);
      }
    }
  }
  if (assertionCount !== totalTests || passedTests !== totalTests) {
    throw new Error(`${label} assertion count differs`);
  }
  return report;
}

function collectorIdentity() {
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
  if (executable === undefined)
    throw new Error("Stage A gh executable unavailable");
  const realpath = fs.realpathSync(executable);
  const bytes = fs.readFileSync(realpath);
  const metadata = fs.statSync(realpath);
  const version = execFileSync(realpath, ["--version"], { encoding: null });
  return Object.freeze({
    invoked_path: "gh",
    realpath,
    bytes: bytes.byteLength,
    sha256: v1r11Sha256(bytes),
    uid: metadata.uid,
    mode: `0${(metadata.mode & 0o777).toString(8).padStart(3, "0")}`,
    version_stdout_sha256: v1r11Sha256(version),
  });
}

function parseViewer(raw: Buffer) {
  const viewer = parsedJson(raw, "authenticated GitHub viewer");
  if (
    typeof viewer.login !== "string" ||
    !Number.isSafeInteger(viewer.id) ||
    typeof viewer.node_id !== "string"
  ) {
    throw new Error("authenticated GitHub viewer differs");
  }
  return Object.freeze({ login: viewer.login, database_id: viewer.id });
}

function parsePull(raw: Buffer, prNumber: number) {
  const pull = parsedJson(raw, "authenticated GitHub PR");
  const head = object(pull.head, "authenticated GitHub PR head");
  const base = object(pull.base, "authenticated GitHub PR base");
  const headRepo = object(head.repo, "authenticated GitHub PR head repo");
  const baseRepo = object(base.repo, "authenticated GitHub PR base repo");
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
    !REVISION_RE.test(String(pull.merge_commit_sha)) ||
    pull.html_url !== `https://github.com/${REPOSITORY}/pull/${prNumber}` ||
    !REVISION_RE.test(String(head.sha)) ||
    !REVISION_RE.test(String(base.sha)) ||
    base.ref !== "main" ||
    headRepo.id !== REPOSITORY_IDENTITY.github_repository_database_id ||
    headRepo.node_id !== REPOSITORY_IDENTITY.github_repository_node_id ||
    headRepo.full_name !== REPOSITORY ||
    baseRepo.id !== REPOSITORY_IDENTITY.github_repository_database_id ||
    baseRepo.node_id !== REPOSITORY_IDENTITY.github_repository_node_id ||
    baseRepo.full_name !== REPOSITORY
  ) {
    throw new Error("authenticated GitHub PR differs");
  }
  isoUtc(pull.merged_at, "authenticated GitHub PR merged_at");
  return { pull, head, base };
}

function assertCommand(
  entry: TranscriptEntry,
  expected: readonly string[],
  label: string,
): void {
  if (v1r11CanonicalJson(entry.argv) !== v1r11CanonicalJson(expected)) {
    throw new Error(`${label} command differs`);
  }
}

function assertCanonicalOrigins(
  entries: readonly TranscriptEntry[],
  label: string,
): void {
  for (const entry of [entries[0], entries.at(-1)]) {
    if (
      entry?.stdout.toString("utf8").trim() !==
      REPOSITORY_IDENTITY.canonical_origin_fetch_url
    ) {
      throw new Error(`${label} origin differs`);
    }
  }
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
    throw new Error(`${relativePath} workflow differs`);
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
  const expanded = EXPECTED_CHECK_CONTEXTS.filter(
    (entry) => entry.workflow === workflowName,
  )
    .map((entry) => entry.check_name)
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right)),
    );
  const actual = [...expandedNames].sort((left, right) =>
    Buffer.compare(Buffer.from(left), Buffer.from(right)),
  );
  if (
    new Set(actual).size !== actual.length ||
    v1r11CanonicalJson(actual) !== v1r11CanonicalJson(expanded)
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
    expanded_check_names: Object.freeze(actual),
  });
}

function exactRawCheckRuns(
  response: Readonly<Record<string, unknown>>,
): readonly Readonly<Record<string, unknown>>[] {
  const runs = Array.isArray(response.check_runs)
    ? (response.check_runs as readonly Readonly<Record<string, unknown>>[])
    : [];
  if (response.total_count !== 15 || runs.length !== 15) {
    throw new Error("authenticated check-run set is not exactly fifteen");
  }
  return runs;
}

function validateBranchProtection(
  branch: Readonly<Record<string, unknown>>,
): void {
  const contexts = Array.isArray(branch.contexts) ? branch.contexts : [];
  const checks = Array.isArray(branch.checks) ? branch.checks : [];
  const expectedProtected = [
    { context: "Test and build", app_id: 15368 },
    { context: "npm audit", app_id: 15368 },
  ];
  if (
    branch.strict !== false ||
    branch.url !==
      `https://api.github.com/repos/${REPOSITORY}/branches/main/protection/required_status_checks` ||
    branch.contexts_url !==
      `https://api.github.com/repos/${REPOSITORY}/branches/main/protection/required_status_checks/contexts` ||
    v1r11CanonicalJson([...contexts].sort()) !==
      v1r11CanonicalJson(
        expectedProtected.map((entry) => entry.context).sort(),
      ) ||
    v1r11CanonicalJson(
      [...checks].sort((left, right) =>
        Buffer.compare(
          Buffer.from(String(object(left, "branch check").context)),
          Buffer.from(String(object(right, "branch check").context)),
        ),
      ),
    ) !== v1r11CanonicalJson(expectedProtected)
  ) {
    throw new Error("branch protection semantics differ");
  }
}

export function verifyHalfkp81V1R11WorkflowManifestForTests(
  relativePath: ".github/workflows/ci.yml" | ".github/workflows/security.yml",
  raw: Buffer,
) {
  return workflowManifest(relativePath, raw);
}

export function verifyHalfkp81V1R11GitHubPrForTests(
  raw: Buffer,
  prNumber: number,
) {
  return parsePull(raw, prNumber);
}

export function verifyHalfkp81V1R11CheckAndProtectionShapeForTests(
  checkRunsResponse: Readonly<Record<string, unknown>>,
  branchProtection: Readonly<Record<string, unknown>>,
): void {
  exactRawCheckRuns(checkRunsResponse);
  validateBranchProtection(branchProtection);
}

function payloadFromTranscript(
  gate: (typeof GATES)[number],
  entries: readonly TranscriptEntry[],
  priorPayloads: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
): Readonly<Record<string, unknown>> {
  const origin = ["git", "remote", "get-url", "origin"] as const;
  const viewerCommand = apiCommand("user");
  if (gate === "ready-pr") {
    if (entries.length !== 4) throw new Error("ready-pr command count differs");
    assertCommand(entries[0]!, origin, gate);
    assertCommand(entries[1]!, viewerCommand, gate);
    const match = /^repos\/gomyway1216\/nextjs-portfolio\/pulls\/(\d+)$/u.exec(
      entries[2]!.argv[5] ?? "",
    );
    if (match === null) throw new Error("ready-pr endpoint differs");
    const prNumber = Number(match[1]);
    assertCommand(
      entries[2]!,
      apiCommand(`repos/${REPOSITORY}/pulls/${prNumber}`),
      gate,
    );
    assertCommand(entries[3]!, origin, gate);
    assertCanonicalOrigins(entries, gate);
    const pull = parsePull(entries[2]!.stdout, prNumber);
    return Object.freeze({
      repository: REPOSITORY_IDENTITY,
      collector_executable_identity: collectorIdentity(),
      authenticated_viewer: parseViewer(entries[1]!.stdout),
      pr_number: prNumber,
      pr_url: pull.pull.html_url,
      head_revision: pull.head.sha,
      base_revision: pull.base.sha,
      merge_revision: pull.pull.merge_commit_sha,
      base_branch: "main",
      is_draft: false,
      state: "MERGED",
      observed_at_utc: entries[3]!.completedAtUtc,
    });
  }
  if (gate === "all-required-ci-success") {
    if (entries.length !== 7) throw new Error("CI command count differs");
    const ready = priorPayloads.get("ready-pr");
    if (ready === undefined)
      throw new Error("CI lacks recomputed ready-pr context");
    const head = String(ready.head_revision);
    const commands = [
      origin,
      viewerCommand,
      apiCommand(
        `repos/${REPOSITORY}/commits/${head}/check-runs?per_page=100&filter=latest`,
      ),
      apiCommand(
        `repos/${REPOSITORY}/branches/main/protection/required_status_checks`,
      ),
      ["git", "show", `${head}:.github/workflows/ci.yml`],
      ["git", "show", `${head}:.github/workflows/security.yml`],
      origin,
    ];
    commands.forEach((expected, index) =>
      assertCommand(entries[index]!, expected, gate),
    );
    assertCanonicalOrigins(entries, gate);
    const checksResponse = parsedJson(entries[2]!.stdout, "GitHub check runs");
    const rawRuns = exactRawCheckRuns(checksResponse);
    const branch = parsedJson(entries[3]!.stdout, "branch protection");
    validateBranchProtection(branch);
    const manifests = [
      workflowManifest(".github/workflows/ci.yml", entries[4]!.stdout),
      workflowManifest(".github/workflows/security.yml", entries[5]!.stdout),
    ];
    const requiredChecks = EXPECTED_CHECK_CONTEXTS.map((expected) => {
      const matching = rawRuns.filter((candidate) => {
        const app = object(candidate.app, "check run app");
        return (
          candidate.name === expected.check_name &&
          candidate.head_sha === head &&
          app.slug === expected.app_slug
        );
      });
      if (matching.length !== 1)
        throw new Error(`check ${expected.check_name} is not unique`);
      const run = matching[0]!;
      const app = object(run.app, "check run app");
      if (
        !Number.isSafeInteger(run.id) ||
        typeof run.node_id !== "string" ||
        typeof run.details_url !== "string" ||
        !Number.isSafeInteger(app.id) ||
        typeof run.external_id !== "string" ||
        typeof run.started_at !== "string" ||
        typeof run.completed_at !== "string"
      ) {
        throw new Error(`check ${expected.check_name} raw fields differ`);
      }
      isoUtc(run.started_at, `${expected.check_name} started_at`);
      isoUtc(run.completed_at, `${expected.check_name} completed_at`);
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
    const successful = requiredChecks.filter(
      (check) => check.status === "COMPLETED" && check.conclusion === "SUCCESS",
    ).length;
    return Object.freeze({
      repository: REPOSITORY_IDENTITY,
      collector_executable_identity: collectorIdentity(),
      authenticated_viewer: parseViewer(entries[1]!.stdout),
      pr_number: ready.pr_number,
      head_revision: head,
      branch_protection_manifest: branch,
      workflow_manifests: Object.freeze(manifests),
      required_check_manifest: Object.freeze({
        schema:
          "shogi-halfkp81-depth18-yaneura-only-v1r11-required-check-manifest-v1",
        status: "exact-fifteen-head-checks-required",
        contexts: EXPECTED_CHECK_CONTEXTS,
      }),
      required_checks: Object.freeze(requiredChecks),
      required_check_count: requiredChecks.length,
      successful_check_count: successful,
      failed_check_count: requiredChecks.filter(
        (check) =>
          check.status === "COMPLETED" && check.conclusion !== "SUCCESS",
      ).length,
      pending_check_count: requiredChecks.filter(
        (check) => check.status !== "COMPLETED",
      ).length,
      conclusion: successful === requiredChecks.length ? "success" : "failure",
      observed_at_utc: entries[6]!.completedAtUtc,
    });
  }
  if (gate === "regular-merge") {
    if (entries.length !== 5)
      throw new Error("regular-merge command count differs");
    const ready = priorPayloads.get("ready-pr");
    if (ready === undefined)
      throw new Error("regular-merge lacks ready-pr context");
    const mergeRevision = String(ready.merge_revision);
    const prNumber = Number(ready.pr_number);
    const commands = [
      origin,
      viewerCommand,
      ["git", "cat-file", "-p", `${mergeRevision}^{commit}`],
      apiCommand(`repos/${REPOSITORY}/pulls/${prNumber}`),
      origin,
    ];
    commands.forEach((expected, index) =>
      assertCommand(entries[index]!, expected, gate),
    );
    assertCanonicalOrigins(entries, gate);
    parseViewer(entries[1]!.stdout);
    const rawCommit = entries[2]!.stdout;
    const boundary = rawCommit.indexOf(Buffer.from("\n\n"));
    if (boundary < 0) throw new Error("regular-merge commit boundary differs");
    const headers = rawCommit
      .subarray(0, boundary)
      .toString("utf8")
      .split("\n");
    const treeRows = headers.filter((line) => line.startsWith("tree "));
    const parentRows = headers.filter((line) => line.startsWith("parent "));
    const digest = crypto
      .createHash("sha1")
      .update(`commit ${rawCommit.byteLength}\0`)
      .update(rawCommit)
      .digest("hex");
    if (
      digest !== mergeRevision ||
      treeRows.length !== 1 ||
      headers[0] !== treeRows[0] ||
      parentRows.length !== 2 ||
      headers[1] !== parentRows[0] ||
      headers[2] !== parentRows[1]
    ) {
      throw new Error("regular-merge raw commit differs");
    }
    const pull = parsePull(entries[3]!.stdout, prNumber);
    if (
      pull.pull.html_url !== ready.pr_url ||
      pull.pull.merge_commit_sha !== ready.merge_revision ||
      pull.head.sha !== ready.head_revision ||
      pull.base.sha !== ready.base_revision
    ) {
      throw new Error("regular-merge PR identity differs from ready-pr");
    }
    return Object.freeze({
      merge_revision: mergeRevision,
      parent_count: 2,
      first_parent_revision: parentRows[0]!.slice(7),
      second_parent_revision: parentRows[1]!.slice(7),
      authenticated_base_revision: pull.base.sha,
      authenticated_pr_head_revision: pull.head.sha,
      strategy: "merge-commit",
      base_branch: "main",
    });
  }
  if (gate === "clean-main-source-authentication") {
    const commands = [
      ["git", "symbolic-ref", "--quiet", "--short", "HEAD"],
      ["git", "rev-parse", "HEAD"],
      ["git", "rev-parse", "main"],
      ["git", "status", "--porcelain=v1", "-z"],
      ["git", "rev-parse", "HEAD"],
    ];
    if (entries.length !== commands.length)
      throw new Error(`${gate} command count differs`);
    commands.forEach((expected, index) =>
      assertCommand(entries[index]!, expected, gate),
    );
    return Object.freeze({
      branch: entries[0]!.stdout.toString("utf8").trim(),
      head_revision_before: entries[1]!.stdout.toString("utf8").trim(),
      main_revision: entries[2]!.stdout.toString("utf8").trim(),
      status_porcelain_bytes: entries[3]!.stdout.byteLength,
      status_porcelain_sha256: v1r11Sha256(entries[3]!.stdout),
      head_revision_after: entries[4]!.stdout.toString("utf8").trim(),
    });
  }
  const files = expectedTestFiles(gate);
  const command = ["npx", "vitest", "run", ...files, "--reporter=json"];
  if (entries.length !== 1) throw new Error(`${gate} command count differs`);
  assertCommand(entries[0]!, command, gate);
  const report = validatedVitestReport(
    entries[0]!.stdout,
    `${gate} Vitest report`,
  );
  return Object.freeze({
    command,
    test_files: files,
    tests_passed: report.numPassedTests,
    tests_failed: report.numFailedTests,
    exit_code: 0,
    stdout_sha256: v1r11Sha256(entries[0]!.stdout),
    stderr_sha256: v1r11Sha256(entries[0]!.stderr),
  });
}

function decodedBundleContent(
  value: unknown,
  gate: (typeof GATES)[number],
  priorPayloads: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
): Readonly<{
  content: Readonly<Record<string, unknown>>;
  payload: Readonly<Record<string, unknown>>;
}> {
  const content = object(value, `${gate} content`);
  exactKeys(
    content,
    [
      "collector",
      "request_or_command",
      "exit_code",
      "stdout_base64",
      "stdout_bytes",
      "stdout_sha256",
      "stderr_base64",
      "stderr_bytes",
      "stderr_sha256",
      "parsed_canonical_json",
    ],
    `${gate} content`,
  );
  const decoded = (stream: "stdout" | "stderr") => {
    const encoded = content[`${stream}_base64`];
    if (typeof encoded !== "string")
      throw new Error(`${gate} ${stream} differs`);
    const raw = Buffer.from(encoded, "base64");
    if (
      raw.toString("base64") !== encoded ||
      raw.byteLength !== content[`${stream}_bytes`] ||
      v1r11Sha256(raw) !== content[`${stream}_sha256`]
    ) {
      throw new Error(`${gate} ${stream} bytes differ`);
    }
    return raw;
  };
  const stdout = decoded("stdout");
  const stderr = decoded("stderr");
  if (content.exit_code !== 0) throw new Error(`${gate} command failed`);
  const entries = decodeTranscript(stdout, gate);
  if (
    v1r11CanonicalJson(content.request_or_command) !==
      v1r11CanonicalJson(
        gate.endsWith("tests-pass")
          ? entries[0]!.argv
          : entries.map((entry) => entry.argv),
      ) ||
    !stderr.equals(Buffer.concat(entries.map((entry) => entry.stderr)))
  ) {
    throw new Error(`${gate} transcript bundle binding differs`);
  }
  const expectedCollector = gate.endsWith("tests-pass")
    ? "fixed-vitest-transcript"
    : gate === "clean-main-source-authentication"
      ? "fixed-git-command-transcript"
      : gate === "regular-merge"
        ? "fixed-git-and-authenticated-github-api"
        : "authenticated-github-api";
  if (content.collector !== expectedCollector) {
    throw new Error(`${gate} collector differs`);
  }
  const payload = payloadFromTranscript(gate, entries, priorPayloads);
  if (
    v1r11CanonicalJson(content.parsed_canonical_json) !==
    v1r11CanonicalJson(payload)
  ) {
    throw new Error(`${gate} parsed_canonical_json was not recomputed`);
  }
  return Object.freeze({ content, payload });
}

export function verifyHalfkp81V1R11StageATestTranscriptForTests(
  value: unknown,
  gate:
    | "preformal-authority-implementation-tests-pass"
    | "artifact-verifier-implementation-tests-pass"
    | "power-guardian-implementation-tests-pass",
): Readonly<Record<string, unknown>> {
  return decodedBundleContent(value, gate, new Map()).payload;
}

function validatePayload(
  gate: (typeof GATES)[number],
  payload: Readonly<Record<string, unknown>>,
): void {
  if (gate === "ready-pr") {
    exactKeys(
      payload,
      [
        "repository",
        "collector_executable_identity",
        "authenticated_viewer",
        "pr_number",
        "pr_url",
        "head_revision",
        "base_revision",
        "merge_revision",
        "base_branch",
        "is_draft",
        "state",
        "observed_at_utc",
      ],
      gate,
    );
    if (
      !Number.isSafeInteger(payload.pr_number) ||
      Number(payload.pr_number) < 1 ||
      typeof payload.pr_url !== "string" ||
      !/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/u.test(
        payload.pr_url,
      ) ||
      !REVISION_RE.test(String(payload.head_revision)) ||
      !REVISION_RE.test(String(payload.base_revision)) ||
      !REVISION_RE.test(String(payload.merge_revision)) ||
      payload.base_branch !== "main" ||
      payload.is_draft !== false ||
      payload.state !== "MERGED"
    ) {
      throw new Error(`${gate} semantics differ`);
    }
    isoUtc(payload.observed_at_utc, `${gate} observed_at_utc`);
    return;
  }
  if (gate === "all-required-ci-success") {
    exactKeys(
      payload,
      [
        "repository",
        "collector_executable_identity",
        "authenticated_viewer",
        "pr_number",
        "head_revision",
        "branch_protection_manifest",
        "workflow_manifests",
        "required_check_manifest",
        "required_checks",
        "required_check_count",
        "successful_check_count",
        "failed_check_count",
        "pending_check_count",
        "conclusion",
        "observed_at_utc",
      ],
      gate,
    );
    if (
      !Array.isArray(payload.required_checks) ||
      payload.required_checks.length !== 15 ||
      payload.required_check_count !== payload.required_checks.length ||
      payload.successful_check_count !== payload.required_checks.length ||
      payload.failed_check_count !== 0 ||
      payload.pending_check_count !== 0 ||
      payload.conclusion !== "success" ||
      payload.required_checks.some((check) => {
        if (check === null || typeof check !== "object" || Array.isArray(check))
          return true;
        const item = check as Readonly<Record<string, unknown>>;
        return (
          v1r11CanonicalJson(Object.keys(item).sort()) !==
            v1r11CanonicalJson(
              [
                "workflow_name",
                "job_name",
                "check_name",
                "check_run_id",
                "details_url",
                "head_revision",
                "app_id",
                "app_slug",
                "external_id",
                "started_at",
                "completed_at",
                "status",
                "conclusion",
              ].sort(),
            ) ||
          item.head_revision !== payload.head_revision ||
          item.status !== "COMPLETED" ||
          item.conclusion !== "SUCCESS"
        );
      })
    ) {
      throw new Error(`${gate} semantics differ`);
    }
    const checks = payload.required_checks as readonly Readonly<
      Record<string, unknown>
    >[];
    const tuples = checks.map((check) =>
      [
        check.workflow_name,
        check.job_name,
        check.check_name,
        check.check_run_id,
      ].map(String),
    );
    const sorted = [...tuples].sort((left, right) =>
      Buffer.compare(
        Buffer.from(left.join("\0")),
        Buffer.from(right.join("\0")),
      ),
    );
    if (
      v1r11CanonicalJson(tuples) !== v1r11CanonicalJson(sorted) ||
      new Set(checks.map((check) => String(check.check_name))).size !==
        checks.length ||
      payload.branch_protection_manifest === null ||
      typeof payload.branch_protection_manifest !== "object" ||
      Array.isArray(payload.branch_protection_manifest)
    ) {
      throw new Error(`${gate} required check set differs`);
    }
    const manifest = payload.branch_protection_manifest as Readonly<
      Record<string, unknown>
    >;
    const contexts = manifest.contexts;
    const protectedChecks = manifest.checks;
    if (
      !Array.isArray(contexts) ||
      !Array.isArray(protectedChecks) ||
      contexts.length !== 2 ||
      contexts.some((context) => typeof context !== "string") ||
      v1r11CanonicalJson([...contexts].sort()) !==
        v1r11CanonicalJson(["Test and build", "npm audit"]) ||
      v1r11CanonicalJson(protectedChecks) !==
        v1r11CanonicalJson([
          { context: "Test and build", app_id: 15368 },
          { context: "npm audit", app_id: 15368 },
        ]) ||
      !Array.isArray(payload.workflow_manifests) ||
      payload.workflow_manifests.length !== 2
    ) {
      throw new Error(`${gate} branch protection contexts differ`);
    }
    isoUtc(payload.observed_at_utc, `${gate} observed_at_utc`);
    return;
  }
  if (gate === "regular-merge") {
    exactKeys(
      payload,
      [
        "merge_revision",
        "parent_count",
        "first_parent_revision",
        "second_parent_revision",
        "authenticated_base_revision",
        "authenticated_pr_head_revision",
        "strategy",
        "base_branch",
      ],
      gate,
    );
    if (
      payload.parent_count !== 2 ||
      payload.first_parent_revision !== payload.authenticated_base_revision ||
      payload.second_parent_revision !==
        payload.authenticated_pr_head_revision ||
      payload.strategy !== "merge-commit" ||
      payload.base_branch !== "main"
    ) {
      throw new Error(`${gate} semantics differ`);
    }
    return;
  }
  if (gate === "clean-main-source-authentication") {
    exactKeys(
      payload,
      [
        "branch",
        "head_revision_before",
        "main_revision",
        "status_porcelain_bytes",
        "status_porcelain_sha256",
        "head_revision_after",
      ],
      gate,
    );
    if (
      payload.branch !== "main" ||
      payload.head_revision_before !== payload.main_revision ||
      payload.main_revision !== payload.head_revision_after ||
      payload.status_porcelain_bytes !== 0 ||
      payload.status_porcelain_sha256 !== v1r11Sha256("")
    ) {
      throw new Error(`${gate} semantics differ`);
    }
    return;
  }
  exactKeys(
    payload,
    [
      "command",
      "test_files",
      "tests_passed",
      "tests_failed",
      "exit_code",
      "stdout_sha256",
      "stderr_sha256",
    ],
    gate,
  );
  if (
    !Array.isArray(payload.command) ||
    !Array.isArray(payload.test_files) ||
    Number(payload.tests_passed) < 1 ||
    payload.tests_failed !== 0 ||
    payload.exit_code !== 0
  ) {
    throw new Error(`${gate} semantics differ`);
  }
  const files = expectedTestFiles(gate);
  if (
    v1r11CanonicalJson(payload.test_files) !== v1r11CanonicalJson(files) ||
    v1r11CanonicalJson(payload.command) !==
      v1r11CanonicalJson([
        "npx",
        "vitest",
        "run",
        ...files,
        "--reporter=json",
      ]) ||
    !SHA256_RE.test(String(payload.stdout_sha256)) ||
    !SHA256_RE.test(String(payload.stderr_sha256))
  ) {
    throw new Error(`${gate} fixed test transcript differs`);
  }
}

function implementationForThisVerifier(
  repositoryRoot: string,
  sourceRevision: string,
) {
  const entrypoint = "ml/verify-halfkp81-depth18-v1r11-stage-a.ts";
  const closure = [
    entrypoint,
    "ml/halfkp81-depth18-v1r11-authority-io.ts",
  ];
  return Object.freeze({
    source_revision: sourceRevision,
    entrypoint,
    dependency_closure: Object.freeze(
      closure.map((relativePath) => {
        const raw = fs.readFileSync(path.join(repositoryRoot, relativePath));
        const tracked = execFileSync(
          "git",
          ["-C", repositoryRoot, "show", `${sourceRevision}:${relativePath}`],
          { encoding: null },
        );
        if (!raw.equals(tracked)) {
          throw new Error(
            `Stage A verifier closure ${relativePath} is not tracked source`,
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

function expectedProducerIdentity(
  repositoryRoot: string,
  sourceRevision: string,
) {
  return Object.freeze({
    source_revision: sourceRevision,
    entrypoint: PRODUCER_ENTRYPOINT,
    dependency_closure: Object.freeze(
      PRODUCER_CLOSURE.map((relativePath) => {
        const raw = fs.readFileSync(path.join(repositoryRoot, relativePath));
        const tracked = execFileSync(
          "git",
          ["-C", repositoryRoot, "show", `${sourceRevision}:${relativePath}`],
          { encoding: null },
        );
        if (!raw.equals(tracked)) {
          throw new Error(
            `Stage A producer closure ${relativePath} is not tracked source`,
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

export interface Halfkp81V1R11StageAVerificationRequest {
  readonly repositoryRoot: string;
  readonly teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
  readonly sourceRevision: string;
  readonly runFingerprint: string;
  readonly authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
  readonly gateDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
  readonly ledgerPrefix: Readonly<V1R11AuthorityFileIdentity>;
}

async function verifyAndPublishHalfkp81V1R11StageAAuthorityInternal(
  request: Readonly<{
    repositoryRoot: string;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    gateDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    ledgerPrefix: Readonly<V1R11AuthorityFileIdentity>;
  }>,
  namespace: Readonly<{
    authorityDirectory: string;
    teacherPlanPath: string;
  }>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  let currentGate: (typeof GATES)[number] | null = null;
  let currentSequence: number | null = null;
  let verifiedLedgerPrefix: Readonly<V1R11AuthorityFileIdentity> | null = null;
  let lastGateReceipt: Readonly<V1R11AuthorityFileIdentity> | null = null;
  let ledgerRaw: Buffer | null = null;
  let teacherPlanGuard: Readonly<V1R11HeldIdentityGuard> | null = null;
  let stageAReceipt: Readonly<V1R11AuthorityFileIdentity> | null = null;
  try {
    if (
      !REVISION_RE.test(request.sourceRevision) ||
      !SHA256_RE.test(request.runFingerprint) ||
      request.authorityDirectory.path !== namespace.authorityDirectory ||
      request.teacherPlan.path !== namespace.teacherPlanPath ||
      request.teacherPlan.schema !== TEACHER_PLAN_SCHEMA ||
      !path.isAbsolute(request.repositoryRoot) ||
      path.normalize(request.repositoryRoot) !== request.repositoryRoot ||
      fs.realpathSync(request.repositoryRoot) !== request.repositoryRoot
    ) {
      throw new Error("Stage A verification context differs");
    }
    if (
      request.gateDirectory.path !==
        path.join(namespace.authorityDirectory, "preformal-gates") ||
      request.ledgerPrefix.path !==
        path.join(
          namespace.authorityDirectory,
          "preformal-authority-ledger.jsonl",
        )
    ) {
      throw new Error("Stage A authority artifact context differs");
    }
    await assertV1R11AuthorityDirectory(request.authorityDirectory);
    await assertV1R11AuthorityDirectory(request.gateDirectory);
    teacherPlanGuard = await openV1R11HeldIdentityGuard(
      request.teacherPlan.path,
      request.teacherPlan.schema,
      "Stage A teacher plan",
    );
    if (
      v1r11CanonicalJson(teacherPlanGuard.identity) !==
      v1r11CanonicalJson(request.teacherPlan)
    ) {
      throw new Error("Stage A teacher plan identity differs");
    }
    ledgerRaw = await readV1R11HeldFile(
      request.ledgerPrefix.path,
      "Stage A existing ledger prefix",
    );
    verifiedLedgerPrefix = Object.freeze({
      path: request.ledgerPrefix.path,
      bytes: ledgerRaw.byteLength,
      sha256: v1r11Sha256(ledgerRaw),
      schema: LEDGER_SCHEMA,
    });
    const terminalReceiptPath = path.join(
      request.gateDirectory.path,
      "07-power-guardian-implementation-tests-pass.receipt.json",
    );
    const terminalReceiptRaw = await readV1R11HeldFile(
      terminalReceiptPath,
      "Stage A existing terminal gate receipt",
    );
    lastGateReceipt = Object.freeze({
      path: terminalReceiptPath,
      bytes: terminalReceiptRaw.byteLength,
      sha256: v1r11Sha256(terminalReceiptRaw),
      schema: RECEIPT_SCHEMA,
    });
    if (
      v1r11CanonicalJson(verifiedLedgerPrefix) !==
      v1r11CanonicalJson(request.ledgerPrefix)
    ) {
      throw new Error("Stage A requested ledger prefix identity differs");
    }
    if (
      execFileSync("git", ["-C", request.repositoryRoot, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim() !== request.sourceRevision
    ) {
      throw new Error("Stage A repository revision differs");
    }
    const expectedGateFiles = GATES.flatMap((gate, offset) => {
      const prefix = String(offset + 1).padStart(2, "0");
      return [
        `${prefix}-${gate}.source-01.bin`,
        `${prefix}-${gate}.evidence.json`,
        `${prefix}-${gate}.receipt.json`,
      ];
    }).sort();
    const actualGateFiles = (
      await fs.promises.readdir(request.gateDirectory.path)
    ).sort();
    if (
      v1r11CanonicalJson(actualGateFiles) !==
      v1r11CanonicalJson(expectedGateFiles)
    ) {
      throw new Error("Stage A gate directory contains unexpected artifacts");
    }
    const expectedProducer = expectedProducerIdentity(
      request.repositoryRoot,
      request.sourceRevision,
    );
    if (ledgerRaw === null) throw new Error("Stage A ledger prefix is missing");
    const ledgerLines = ledgerRaw.toString("utf8").split("\n");
    if (ledgerLines.at(-1) !== "")
      throw new Error("Stage A ledger lacks final LF");
    ledgerLines.pop();
    if (ledgerLines.length !== GATES.length) {
      throw new Error("Stage A ledger prefix row count differs");
    }
    let previousReceiptSha: string | null = null;
    let previousEntrySha: string | null = null;
    const verifiedGates: Record<string, unknown> = {};
    const payloads = new Map<string, Readonly<Record<string, unknown>>>();
    for (const [offset, gate] of GATES.entries()) {
      const sequence = offset + 1;
      currentGate = gate;
      currentSequence = sequence;
      const prefix = String(sequence).padStart(2, "0");
      const receiptPath = path.join(
        request.gateDirectory.path,
        `${prefix}-${gate}.receipt.json`,
      );
      const receiptRaw = await readV1R11HeldFile(
        receiptPath,
        `${gate} receipt`,
      );
      const receiptIdentity = Object.freeze({
        path: receiptPath,
        bytes: receiptRaw.byteLength,
        sha256: v1r11Sha256(receiptRaw),
        schema: RECEIPT_SCHEMA,
      });
      const receipt = parseV1R11CanonicalObject(receiptRaw, `${gate} receipt`);
      exactKeys(
        receipt,
        [
          "schema",
          "status",
          "gate",
          "sequence",
          "teacher_plan",
          "source_revision",
          "run_fingerprint",
          "previous_gate_receipt_sha256",
          "evidence",
          "producer",
          "authority",
        ],
        `${gate} receipt`,
      );
      if (
        receipt.schema !== RECEIPT_SCHEMA ||
        receipt.status !== "pass-no-formal-authority" ||
        receipt.gate !== gate ||
        receipt.sequence !== sequence ||
        v1r11CanonicalJson(receipt.teacher_plan) !==
          v1r11CanonicalJson(request.teacherPlan) ||
        receipt.source_revision !== request.sourceRevision ||
        receipt.run_fingerprint !== request.runFingerprint ||
        receipt.previous_gate_receipt_sha256 !== previousReceiptSha ||
        v1r11CanonicalJson(receipt.authority) !==
          v1r11CanonicalJson(FALSE_AUTHORITY)
      ) {
        throw new Error(`${gate} receipt binding differs`);
      }
      implementationIdentity(receipt.producer, request.sourceRevision);
      if (
        v1r11CanonicalJson(receipt.producer) !==
        v1r11CanonicalJson(expectedProducer)
      ) {
        throw new Error(`${gate} producer closure differs`);
      }
      const evidenceSchema = `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-evidence-v1`;
      const evidenceIdentity = identity(
        receipt.evidence,
        evidenceSchema,
        `${gate} evidence`,
      );
      if (
        evidenceIdentity.path !==
        path.join(request.gateDirectory.path, `${prefix}-${gate}.evidence.json`)
      ) {
        throw new Error(`${gate} evidence path differs`);
      }
      const evidenceRaw = await readV1R11HeldIdentity(
        evidenceIdentity,
        evidenceSchema,
        `${gate} evidence`,
      );
      const evidence = parseV1R11CanonicalObject(
        evidenceRaw,
        `${gate} evidence`,
      );
      exactKeys(
        evidence,
        [
          "schema",
          "status",
          "gate",
          "sequence",
          "teacher_plan",
          "source_revision",
          "run_fingerprint",
          "producer",
          "primary_sources",
          "payload",
          "produced_at_utc",
        ],
        `${gate} evidence`,
      );
      if (
        evidence.schema !== evidenceSchema ||
        evidence.status !== "pass" ||
        evidence.gate !== gate ||
        evidence.sequence !== sequence ||
        v1r11CanonicalJson(evidence.teacher_plan) !==
          v1r11CanonicalJson(request.teacherPlan) ||
        evidence.source_revision !== request.sourceRevision ||
        evidence.run_fingerprint !== request.runFingerprint ||
        v1r11CanonicalJson(evidence.producer) !==
          v1r11CanonicalJson(receipt.producer) ||
        !Array.isArray(evidence.primary_sources) ||
        evidence.primary_sources.length !== 1 ||
        evidence.payload === null ||
        typeof evidence.payload !== "object" ||
        Array.isArray(evidence.payload)
      ) {
        throw new Error(`${gate} evidence binding differs`);
      }
      isoUtc(evidence.produced_at_utc, `${gate} produced_at_utc`);
      const sourceKind = expectedSourceKind(gate);
      const sourceSchema = `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-primary-source-${sourceKind}-v1`;
      const sourceIdentity = identity(
        evidence.primary_sources[0],
        sourceSchema,
        `${gate} source 1`,
      );
      const expectedSourcePath = path.join(
        request.gateDirectory.path,
        `${prefix}-${gate}.source-01.bin`,
      );
      if (sourceIdentity.path !== expectedSourcePath) {
        throw new Error(`${gate} source path differs`);
      }
      const sourceRaw = await readV1R11HeldIdentity(
        sourceIdentity,
        sourceSchema,
        `${gate} source 1`,
      );
      const source = parseV1R11CanonicalObject(sourceRaw, `${gate} source 1`);
      exactKeys(
        source,
        [
          "schema",
          "status",
          "gate",
          "sequence",
          "source_sequence",
          "source_kind",
          "teacher_plan",
          "source_revision",
          "run_fingerprint",
          "producer",
          "content",
          "captured_at_utc",
        ],
        `${gate} source envelope`,
      );
      const decodedContent = decodedBundleContent(
        source.content,
        gate,
        payloads,
      );
      if (
        source.schema !== sourceSchema ||
        source.status !== "captured-primary-source-no-authority" ||
        source.gate !== gate ||
        source.sequence !== sequence ||
        source.source_sequence !== 1 ||
        source.source_kind !== sourceKind ||
        v1r11CanonicalJson(source.teacher_plan) !==
          v1r11CanonicalJson(request.teacherPlan) ||
        source.source_revision !== request.sourceRevision ||
        source.run_fingerprint !== request.runFingerprint ||
        v1r11CanonicalJson(source.producer) !==
          v1r11CanonicalJson(receipt.producer) ||
        v1r11CanonicalJson(decodedContent.payload) !==
          v1r11CanonicalJson(evidence.payload)
      ) {
        throw new Error(`${gate} source envelope differs`);
      }
      isoUtc(source.captured_at_utc, `${gate} captured_at_utc`);
      const payload = evidence.payload as Readonly<Record<string, unknown>>;
      validatePayload(gate, payload);
      payloads.set(gate, payload);

      const ledger = JSON.parse(ledgerLines[offset]!) as Readonly<
        Record<string, unknown>
      >;
      if (v1r11CanonicalJson(ledger) !== ledgerLines[offset]) {
        throw new Error(`${gate} ledger row is not canonical`);
      }
      exactKeys(
        ledger,
        [
          "schema",
          "sequence",
          "gate",
          "previous_entry_sha256",
          "teacher_plan",
          "source_revision",
          "run_fingerprint",
          "gate_evidence",
          "gate_receipt",
          "status",
          "producer",
          "entry_sha256",
        ],
        `${gate} ledger row`,
      );
      const { entry_sha256: entrySha, ...preimage } = ledger;
      if (
        ledger.schema !== LEDGER_SCHEMA ||
        ledger.sequence !== sequence ||
        ledger.gate !== gate ||
        ledger.previous_entry_sha256 !== previousEntrySha ||
        ledger.status !== "pass-no-formal-authority" ||
        v1r11CanonicalJson(ledger.teacher_plan) !==
          v1r11CanonicalJson(request.teacherPlan) ||
        ledger.source_revision !== request.sourceRevision ||
        ledger.run_fingerprint !== request.runFingerprint ||
        v1r11CanonicalJson(ledger.gate_evidence) !==
          v1r11CanonicalJson(evidenceIdentity) ||
        v1r11CanonicalJson(ledger.gate_receipt) !==
          v1r11CanonicalJson(receiptIdentity) ||
        v1r11CanonicalJson(ledger.producer) !==
          v1r11CanonicalJson(receipt.producer) ||
        entrySha !==
          v1r11Sha256(`${LEDGER_DOMAIN}${v1r11CanonicalJson(preimage)}`)
      ) {
        throw new Error(`${gate} ledger binding differs`);
      }
      previousReceiptSha = receiptIdentity.sha256;
      previousEntrySha = String(entrySha);
      verifiedGates[gate] = Object.freeze({
        sequence,
        status: "independently-verified",
        primary_sources: evidence.primary_sources,
        evidence: evidenceIdentity,
        receipt: receiptIdentity,
        ledger_entry_sha256: entrySha,
      });
    }

    const ready = payloads.get("ready-pr")!;
    const ci = payloads.get("all-required-ci-success")!;
    const merge = payloads.get("regular-merge")!;
    const clean = payloads.get("clean-main-source-authentication")!;
    if (
      ready.head_revision !== ci.head_revision ||
      ready.head_revision !== merge.authenticated_pr_head_revision ||
      ready.head_revision !== merge.second_parent_revision ||
      ready.base_revision !== merge.authenticated_base_revision ||
      ready.base_revision !== merge.first_parent_revision ||
      ready.merge_revision !== merge.merge_revision ||
      ready.merge_revision !== request.sourceRevision ||
      ready.pr_number !== ci.pr_number ||
      ready.base_branch !== merge.base_branch ||
      ready.base_branch !== clean.branch ||
      clean.head_revision_before !== request.sourceRevision ||
      clean.main_revision !== request.sourceRevision ||
      clean.head_revision_after !== request.sourceRevision
    ) {
      throw new Error("Stage A cross-gate revision equations differ");
    }
    const verifier = implementationForThisVerifier(
      request.repositoryRoot,
      request.sourceRevision,
    );
    const receipt = Object.freeze({
      schema: STAGE_A_SCHEMA,
      status:
        "control-plane-gates-independently-verified-preformal-engine-only-authority",
      teacher_plan: request.teacherPlan,
      source_revision: request.sourceRevision,
      run_fingerprint: request.runFingerprint,
      ledger_prefix: request.ledgerPrefix,
      verified_gates: Object.freeze(verifiedGates),
      verifier,
      authority: STAGE_A_AUTHORITY,
    });
    await teacherPlanGuard.validate();
    stageAReceipt = await publishV1R11CreateOnlyCanonical(
      request.authorityDirectory,
      path.join(
        request.authorityDirectory.path,
        "preformal-engine-gate-authority-verified-receipt.json",
      ),
      receipt,
      STAGE_A_SCHEMA,
    );
    await teacherPlanGuard.validate();
    return stageAReceipt;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    throw new Halfkp81V1R11PreformalStageFailure({
      phase: "stage-a-verifier",
      gate: currentGate,
      sequence: currentSequence,
      runnerState: "not-created",
      failure,
      artifacts: Object.freeze({
        ledgerPrefix: verifiedLedgerPrefix,
        lastGateReceipt,
        engineGateVerifiedReceipt: stageAReceipt,
        launchAgentAuthority: null,
        runnerIdentity: null,
        partialArtifacts: Object.freeze(
          stageAReceipt === null ? [] : [stageAReceipt],
        ),
      }),
    });
  } finally {
    await teacherPlanGuard?.close();
  }
}

/** Production entrypoint remains bound to the fixed preregistered namespace. */
export async function verifyAndPublishHalfkp81V1R11StageAAuthority(
  request: Readonly<Halfkp81V1R11StageAVerificationRequest>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  return verifyAndPublishHalfkp81V1R11StageAAuthorityInternal(request, {
    authorityDirectory: AUTHORITY_DIRECTORY,
    teacherPlanPath: TEACHER_PLAN_PATH,
  });
}

/** Scratch wrapper exposes the actual verifier core, never a stage outcome. */
export async function verifyAndPublishHalfkp81V1R11StageAAuthorityInScratchForTests(
  capability: Readonly<Halfkp81V1R11ScratchNamespaceCapabilityForTests>,
  request: Readonly<Halfkp81V1R11StageAVerificationRequest>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  const namespace = resolveHalfkp81V1R11ScratchNamespaceCapabilityForTests(
    capability,
  );
  return verifyAndPublishHalfkp81V1R11StageAAuthorityInternal(
    request,
    namespace,
  );
}
