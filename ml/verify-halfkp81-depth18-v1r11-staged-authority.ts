import { execFileSync, spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  assertV1R11AuthorityDirectory,
  assertV1R11CreateOnlyTargetAbsent,
  parseV1R11CanonicalObject,
  publishV1R11CreateOnlyCanonical,
  readV1R11HeldFile,
  readV1R11HeldIdentity,
  v1r11CanonicalJson,
  v1r11Sha256,
  type V1R11AuthorityDirectoryIdentity,
  type V1R11AuthorityFileIdentity,
} from "./halfkp81-depth18-v1r11-authority-io";
import {
  HALFKP81_V1R11_PROCESS_CLEANUP_EVIDENCE_SCHEMA,
} from "./halfkp81-depth18-v1r11-preformal-fault";
import {
  Halfkp81V1R11PreformalStageFailure,
  halfkp81V1R11ActiveLaunchBindingFromEvidenceForFailure,
} from "./halfkp81-depth18-v1r11-preformal-stage-failure";
import {
  resolveHalfkp81V1R11ScratchNamespaceCapabilityForTests,
  type Halfkp81V1R11ScratchNamespaceCapabilityForTests,
} from "./verify-halfkp81-depth18-v1r11-stage-a";

const GATES = Object.freeze([
  "ready-pr",
  "all-required-ci-success",
  "regular-merge",
  "clean-main-source-authentication",
  "preformal-authority-implementation-tests-pass",
  "artifact-verifier-implementation-tests-pass",
  "power-guardian-implementation-tests-pass",
  "candidate-order-gate",
  "known10-probe",
  "pathological-fallback-probe",
  "mixed-load-gate",
  "formal-like-512",
  "ac-power-start-admission-pass",
] as const);
const REQUIRED_ORDER = Object.freeze([...GATES, "formal-teacher"] as const);
type Gate = (typeof GATES)[number];

const AUTHORITY_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority";
const TEACHER_PLAN_PATH =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11/teacher-plan.json";
const TEACHER_PLAN_SCHEMA =
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11";
interface Halfkp81V1R11StagedAuthorityNamespace {
  readonly authorityDirectory: string;
  readonly teacherPlanPath: string;
}
const PRODUCTION_NAMESPACE: Readonly<Halfkp81V1R11StagedAuthorityNamespace> =
  Object.freeze({
    authorityDirectory: AUTHORITY_DIRECTORY,
    teacherPlanPath: TEACHER_PLAN_PATH,
  });
const LEDGER_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11";
const RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11";
const RAW_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-receipt-v1r11";
const VERIFIED_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-verified-receipt-v1r11";
const STAGE_A_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-engine-gate-authority-verified-receipt-v1r11";
const LAUNCH_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11";
const LEDGER_DOMAIN =
  "shogi-halfkp81-depth18-v1r11-preformal-authority-ledger-entry-v1\0";
const POWER_ENTRY_SCHEMA =
  "shogi-halfkp81-depth18-power-continuity-ledger-v1r11";
const POWER_ENTRY_DOMAIN =
  "shogi-halfkp81-depth18-power-continuity-entry-v1r11\0";
const KNOWN10_EXPECTED_CANONICAL_SHA256 =
  "6c133d62da1ca3010c5b0f505c3c0570b5347f96e73e4a3e2586bbe4b3c9d346";
const V1R11_ENGINE_BINARY_SHA256 =
  "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1";
const V1R11_FORMAL_ENGINE_PATH =
  "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1/bin/yaneuraou";
const V1R11_FINAL_LAUNCH_PS_COMMAND = Object.freeze([
  "/bin/ps",
  "-ww",
  "-axo",
  "pid=,ppid=,pgid=,lstart=,command=",
] as const);
const V1R11_FINAL_LAUNCH_PRODUCER_ENTRYPOINT =
  "ml/halfkp81-depth18-v1r11-stage-c-live-evidence.ts";
const PS_START_TOKEN_RE =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4}$/u;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const FORMAL_RUN_INTENT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-formal-run-intent-v2" as const;
const FORMAL_RUN_INTENT_DOMAIN =
  "shogi-halfkp81-depth18-yaneura-only-formal-run-intent-v2\0" as const;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
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
const REQUIRED_ASSERTIONS = Object.freeze([
  "PreventSystemSleep",
  "PreventUserIdleSystemSleep",
  "PreventUserIdleDisplaySleep",
] as const);

const FALSE_AUTHORITY = Object.freeze({
  may_execute_preformal_engine_gates: false,
  may_execute_formal_teacher: false,
  may_train: false,
  may_play_formal_games: false,
  may_write_live_weights: false,
});
const FORMAL_ONLY_AUTHORITY = Object.freeze({
  may_execute_formal_teacher: true,
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

const SOURCE_KINDS: Readonly<Record<Gate, readonly string[]>> = Object.freeze({
  "ready-pr": ["github-pr-rest-response"],
  "all-required-ci-success": [
    "github-check-rollup-and-branch-protection-response",
  ],
  "regular-merge": ["git-cat-file-commit-and-github-pr-response"],
  "clean-main-source-authentication": ["fixed-git-command-transcript-bundle"],
  "preformal-authority-implementation-tests-pass": [
    "fixed-vitest-transcript-bundle",
  ],
  "artifact-verifier-implementation-tests-pass": [
    "fixed-vitest-transcript-bundle",
  ],
  "power-guardian-implementation-tests-pass": [
    "fixed-vitest-transcript-bundle",
  ],
  "candidate-order-gate": [
    "candidate-order-receipt-and-transcript-bundle",
    "stage-b-power-ledger",
    "stage-b-power-receipt",
  ],
  "known10-probe": [
    "known10-probe-receipt-and-transcript-bundle",
    "stage-b-power-ledger",
    "stage-b-power-receipt",
  ],
  "pathological-fallback-probe": [
    "pathological-probe-receipt-and-transcript-bundle",
    "stage-b-power-ledger",
    "stage-b-power-receipt",
  ],
  "mixed-load-gate": [
    "mixed-load-receipt-and-transcript-bundle",
    "stage-b-power-ledger",
    "stage-b-power-receipt",
  ],
  "formal-like-512": [
    "formal-like-512-verified-receipt-and-transcript-bundle",
    "stage-b-power-ledger",
    "stage-b-power-receipt",
  ],
  "ac-power-start-admission-pass": [
    "formal-launchagent-power-admission-bundle",
  ],
});

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): Readonly<{ guardianPid: number; runnerPid: number }> {
  if (
    v1r11CanonicalJson(Object.keys(value).sort()) !==
    v1r11CanonicalJson([...keys].sort())
  ) {
    throw new Error(`${label} keys differ`);
  }
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

function identity(
  value: unknown,
  schema: string | undefined,
  label: string,
): Readonly<V1R11AuthorityFileIdentity> {
  const row = object(value, label);
  exactKeys(row, ["path", "bytes", "sha256", "schema"], label);
  if (
    typeof row.path !== "string" ||
    !path.isAbsolute(row.path) ||
    path.normalize(row.path) !== row.path ||
    !Number.isSafeInteger(row.bytes) ||
    Number(row.bytes) < 1 ||
    typeof row.sha256 !== "string" ||
    !SHA256_RE.test(row.sha256) ||
    typeof row.schema !== "string" ||
    row.schema.length < 1 ||
    (schema !== undefined && row.schema !== schema)
  ) {
    throw new Error(`${label} differs`);
  }
  return row as unknown as Readonly<V1R11AuthorityFileIdentity>;
}

export interface IndependentFormalRunIntentIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly schema: string;
  readonly rows?: number;
}

export interface IndependentFormalRunIntentInput {
  readonly teacherPlan: Readonly<IndependentFormalRunIntentIdentity>;
  readonly selectionJsonl: Readonly<IndependentFormalRunIntentIdentity>;
  readonly selectionManifest: Readonly<IndependentFormalRunIntentIdentity>;
  readonly sourceRevision: string;
  readonly engine: Readonly<{
    binary: Readonly<IndependentFormalRunIntentIdentity>;
    evalFile: Readonly<IndependentFormalRunIntentIdentity>;
    receipt: Readonly<IndependentFormalRunIntentIdentity>;
  }>;
  readonly teacherContract: Readonly<Record<string, unknown>>;
  readonly candidateContract: Readonly<Record<string, unknown>>;
  readonly plannedFinalDescriptor: Readonly<IndependentFormalRunIntentIdentity>;
}

function independentFormalIntentIdentity(
  value: unknown,
  label: string,
  schema?: string,
  rowsRequired = false,
): Readonly<IndependentFormalRunIntentIdentity> {
  const row = object(value, label);
  exactKeys(
    row,
    rowsRequired
      ? ["path", "bytes", "sha256", "schema", "rows"]
      : ["path", "bytes", "sha256", "schema"],
    label,
  );
  if (
    typeof row.path !== "string" ||
    !path.isAbsolute(row.path) ||
    path.normalize(row.path) !== row.path ||
    !Number.isSafeInteger(row.bytes) ||
    Number(row.bytes) < 1 ||
    typeof row.sha256 !== "string" ||
    !SHA256_RE.test(row.sha256) ||
    typeof row.schema !== "string" ||
    row.schema.length < 1 ||
    (schema !== undefined && row.schema !== schema) ||
    (rowsRequired &&
      (!Number.isSafeInteger(row.rows) || Number(row.rows) < 1))
  ) {
    throw new Error(`${label} differs`);
  }
  return Object.freeze({
    path: row.path,
    bytes: Number(row.bytes),
    sha256: row.sha256,
    schema: row.schema,
    ...(rowsRequired ? { rows: Number(row.rows) } : {}),
  });
}

function independentFormalIntentContract(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  const row = object(value, label);
  const forbidden = (candidate: unknown): boolean => {
    if (Array.isArray(candidate)) return candidate.some(forbidden);
    if (candidate !== null && typeof candidate === "object") {
      return Object.entries(candidate as Readonly<Record<string, unknown>>).some(
        ([key, child]) =>
          /(?:run_fingerprint|launchagent_authority|launch_agent_authority|launchagent_evidence|launch_agent_evidence|preformal_authority|formal_authority|raw_receipt|verified_receipt|teacher_receipt|artifact_receipt|authority_receipt|power_continuity|process_cleanup|terminal_fault)/u.test(
            key,
          ) || forbidden(child),
      );
    }
    return false;
  };
  if (Object.keys(row).length < 1 || forbidden(row)) {
    throw new Error(`${label} differs or contains a circular authority input`);
  }
  v1r11CanonicalJson(row);
  return Object.freeze({ ...row });
}

/** All-13 verifier implementation deliberately shares no producer semantics. */
function independentlyComputeFormalRunFingerprint(input: unknown): string {
  const root = object(input, "independent formal-run-intent-v2 input");
  exactKeys(
    root,
    [
      "teacherPlan",
      "selectionJsonl",
      "selectionManifest",
      "sourceRevision",
      "engine",
      "teacherContract",
      "candidateContract",
      "plannedFinalDescriptor",
    ],
    "independent formal-run-intent-v2 input",
  );
  const engine = object(root.engine, "independent formal engine");
  exactKeys(
    engine,
    ["binary", "evalFile", "receipt"],
    "independent formal engine",
  );
  if (typeof root.sourceRevision !== "string" || !REVISION_RE.test(root.sourceRevision)) {
    throw new Error("independent formal source revision differs");
  }
  const payload = Object.freeze({
    schema: FORMAL_RUN_INTENT_SCHEMA,
    teacher_plan: independentFormalIntentIdentity(
      root.teacherPlan,
      "independent formal teacher plan",
    ),
    selection_jsonl: independentFormalIntentIdentity(
      root.selectionJsonl,
      "independent formal selection JSONL",
      undefined,
      true,
    ),
    selection_manifest: independentFormalIntentIdentity(
      root.selectionManifest,
      "independent formal selection manifest",
    ),
    source_revision: root.sourceRevision,
    engine: Object.freeze({
      binary: independentFormalIntentIdentity(
        engine.binary,
        "independent formal engine binary",
        "application/x-mach-o-executable-exact-bytes",
      ),
      eval_file: independentFormalIntentIdentity(
        engine.evalFile,
        "independent formal eval file",
        "application/octet-stream-exact-bytes",
      ),
      receipt: independentFormalIntentIdentity(
        engine.receipt,
        "independent formal engine receipt",
      ),
    }),
    teacher: independentFormalIntentContract(
      root.teacherContract,
      "independent formal teacher contract",
    ),
    candidate_generation: independentFormalIntentContract(
      root.candidateContract,
      "independent formal candidate contract",
    ),
    planned_final_launchagent_descriptor: independentFormalIntentIdentity(
      root.plannedFinalDescriptor,
      "independent formal planned descriptor",
      "application/x-apple-aspen-config-exact-bytes",
    ),
  });
  return crypto
    .createHash("sha256")
    .update(`${FORMAL_RUN_INTENT_DOMAIN}${v1r11CanonicalJson(payload)}`)
    .digest("hex");
}

export function independentlyComputeHalfkp81V1R11StagedFormalRunFingerprintForTests(
  input: unknown,
): string {
  return independentlyComputeFormalRunFingerprint(input);
}

function iso(value: unknown, label: string): void {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} differs`);
  }
}

function implementationIdentity(
  repositoryRoot: string,
  sourceRevision: string,
  entrypoint: string,
  closure: readonly string[],
) {
  return Object.freeze({
    source_revision: sourceRevision,
    entrypoint,
    dependency_closure: Object.freeze(
      closure.map((relativePath) => {
        const working = fs.readFileSync(
          path.join(repositoryRoot, relativePath),
        );
        const tracked = execFileSync(
          "git",
          ["-C", repositoryRoot, "show", `${sourceRevision}:${relativePath}`],
          { encoding: null },
        );
        if (!working.equals(tracked)) {
          throw new Error(`${entrypoint} closure ${relativePath} differs`);
        }
        return Object.freeze({
          path: relativePath,
          bytes: working.byteLength,
          sha256: v1r11Sha256(working),
        });
      }),
    ),
  });
}

const INDEPENDENT_STATIC_IMPORT_RE =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^;]*?\s+from\s+)?["'](\.[^"']+)["']/gu;
const INDEPENDENT_CALL_IMPORT_RE =
  /\b(?:require|import)\s*\(\s*["'](\.[^"']+)["']\s*\)/gu;
const INDEPENDENT_RUNTIME_ENTRYPOINT_RE = /["'](ml\/[^"']+\.ts)["']/gu;

function independentUtf8Order(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function independentlyResolveRelativeProducerImport(
  repositoryRoot: string,
  importer: string,
  specifier: string,
): string {
  const unresolved = path.resolve(
    repositoryRoot,
    path.dirname(importer),
    specifier,
  );
  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    `${unresolved}.js`,
    `${unresolved}.json`,
    path.join(unresolved, "index.ts"),
    path.join(unresolved, "index.tsx"),
    path.join(unresolved, "index.js"),
  ];
  const resolved = candidates.find((candidate) => {
    try {
      return fs.lstatSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (resolved === undefined) {
    throw new Error(
      `independent all-13 producer closure cannot resolve ${specifier} from ${importer}`,
    );
  }
  const relative = path.relative(repositoryRoot, resolved).split(path.sep).join("/");
  if (
    relative.length < 1 ||
    relative.startsWith("../") ||
    path.isAbsolute(relative)
  ) {
    throw new Error("independent all-13 producer closure escaped repository");
  }
  return relative;
}

function independentlyDirectProducerImports(
  repositoryRoot: string,
  relativePath: string,
): readonly string[] {
  const raw = fs.readFileSync(path.join(repositoryRoot, relativePath));
  const source = raw.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(raw)) {
    throw new Error(`independent all-13 producer ${relativePath} is not UTF-8`);
  }
  const imports = new Set<string>();
  for (const expression of [
    INDEPENDENT_STATIC_IMPORT_RE,
    INDEPENDENT_CALL_IMPORT_RE,
  ]) {
    for (const match of source.matchAll(expression)) {
      imports.add(
        independentlyResolveRelativeProducerImport(
          repositoryRoot,
          relativePath,
          match[1]!,
        ),
      );
    }
  }
  for (const match of source.matchAll(INDEPENDENT_RUNTIME_ENTRYPOINT_RE)) {
    const runtimePath = match[1]!;
    if (!fs.lstatSync(path.join(repositoryRoot, runtimePath)).isFile()) {
      throw new Error(
        `independent all-13 runtime entrypoint ${runtimePath} is missing`,
      );
    }
    imports.add(runtimePath);
  }
  return Object.freeze([...imports].sort(independentUtf8Order));
}

export function buildHalfkp81V1R11IndependentRecursiveProducerIdentityForTests(
  repositoryRoot: string,
  sourceRevision: string,
  entrypoint: string,
  options: Readonly<{ requireTrackedRevision?: boolean }> = {},
) {
  if (
    !path.isAbsolute(repositoryRoot) ||
    path.normalize(repositoryRoot) !== repositoryRoot ||
    fs.realpathSync(repositoryRoot) !== repositoryRoot ||
    !REVISION_RE.test(sourceRevision) ||
    path.isAbsolute(entrypoint) ||
    path.posix.normalize(entrypoint) !== entrypoint ||
    entrypoint.startsWith("../") ||
    execFileSync("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim() !== sourceRevision
  ) {
    throw new Error("independent all-13 producer closure context differs");
  }
  const pending = [entrypoint];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const imported of independentlyDirectProducerImports(
      repositoryRoot,
      current,
    )) {
      if (!visited.has(imported)) pending.push(imported);
    }
  }
  const closure = Object.freeze([
    entrypoint,
    ...[...visited]
      .filter((relativePath) => relativePath !== entrypoint)
      .sort(independentUtf8Order),
  ]);
  if (options.requireTrackedRevision === false) {
    return Object.freeze({
      source_revision: sourceRevision,
      entrypoint,
      dependency_closure: Object.freeze(
        closure.map((relativePath) => {
          const raw = fs.readFileSync(path.join(repositoryRoot, relativePath));
          return Object.freeze({
            path: relativePath,
            bytes: raw.byteLength,
            sha256: v1r11Sha256(raw),
          });
        }),
      ),
    });
  }
  return implementationIdentity(
    repositoryRoot,
    sourceRevision,
    entrypoint,
    closure,
  );
}

function parseLedger(raw: Buffer) {
  if (raw.byteLength < 2 || raw.at(-1) !== 0x0a) {
    throw new Error("all-13 ledger terminal LF differs");
  }
  const lines = raw.toString("utf8").slice(0, -1).split("\n");
  if (lines.length !== GATES.length) {
    throw new Error("all-13 ledger row count differs");
  }
  return Object.freeze(
    lines.map((line, index) => {
      const value = object(JSON.parse(line), `ledger row ${index + 1}`);
      if (v1r11CanonicalJson(value) !== line) {
        throw new Error(`ledger row ${index + 1} is not canonical`);
      }
      return value;
    }),
  );
}

interface IndependentTranscriptRow {
  readonly argv: readonly string[];
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly completedAtUtc: string;
}

function stageATestFiles(gate: Gate): readonly string[] {
  if (gate === "preformal-authority-implementation-tests-pass") {
    return ["tests/unit/ml/halfkp81Depth18V1R11StagedAuthorityE2E.test.ts"];
  }
  if (gate === "artifact-verifier-implementation-tests-pass") {
    return ["tests/unit/ml/halfkp81Depth18TeacherArtifactValidation.test.ts"];
  }
  if (gate === "power-guardian-implementation-tests-pass") {
    return [
      "tests/unit/ml/halfkp81Depth18V1R11PowerContinuity.test.ts",
      "tests/unit/ml/halfkp81Depth18TeacherRunner.test.ts",
      "tests/unit/ml/halfkp81Depth18OneShotLaunchAgent.test.ts",
    ];
  }
  throw new Error(`${gate} is not a Stage A test gate`);
}

function githubApiCommand(endpoint: string): readonly string[] {
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

function decodeIndependentTranscript(
  raw: Buffer,
  label: string,
): readonly IndependentTranscriptRow[] {
  if (
    raw.byteLength < 2 ||
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
    throw new Error(`${label} transcript canonical form differs`);
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
      iso(row.started_at_utc, `${label} started_at_utc`);
      iso(row.completed_at_utc, `${label} completed_at_utc`);
      if (String(row.started_at_utc) > String(row.completed_at_utc)) {
        throw new Error(`${label} transcript time order differs`);
      }
      const stream = (name: "stdout" | "stderr") => {
        const encoded = row[`${name}_base64`];
        if (typeof encoded !== "string") {
          throw new Error(`${label} ${name} encoding differs`);
        }
        const bytes = Buffer.from(encoded, "base64");
        if (
          bytes.toString("base64") !== encoded ||
          row[`${name}_bytes`] !== bytes.byteLength ||
          row[`${name}_sha256`] !== v1r11Sha256(bytes)
        ) {
          throw new Error(`${label} ${name} identity differs`);
        }
        return bytes;
      };
      return Object.freeze({
        argv: Object.freeze([...(row.argv as readonly string[])]),
        stdout: stream("stdout"),
        stderr: stream("stderr"),
        completedAtUtc: String(row.completed_at_utc),
      });
    }),
  );
}

function jsonObject(raw: Buffer, label: string) {
  try {
    return object(JSON.parse(raw.toString("utf8")) as unknown, label);
  } catch (error) {
    if (error instanceof Error && error.message === `${label} differs`) {
      throw error;
    }
    throw new Error(`${label} is not JSON`);
  }
}

function exactCommand(
  row: IndependentTranscriptRow,
  expected: readonly string[],
  label: string,
): void {
  if (v1r11CanonicalJson(row.argv) !== v1r11CanonicalJson(expected)) {
    throw new Error(`${label} command differs`);
  }
}

function independentCollectorIdentity() {
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
  if (executable === undefined) {
    throw new Error("all-13 gh executable unavailable");
  }
  const realpath = fs.realpathSync(executable);
  const raw = fs.readFileSync(realpath);
  const metadata = fs.statSync(realpath);
  const version = execFileSync(realpath, ["--version"], { encoding: null });
  return Object.freeze({
    invoked_path: "gh",
    realpath,
    bytes: raw.byteLength,
    sha256: v1r11Sha256(raw),
    uid: metadata.uid,
    mode: `0${(metadata.mode & 0o777).toString(8).padStart(3, "0")}`,
    version_stdout_sha256: v1r11Sha256(version),
  });
}

function independentViewer(raw: Buffer) {
  const viewer = jsonObject(raw, "all-13 authenticated viewer");
  if (
    typeof viewer.login !== "string" ||
    !Number.isSafeInteger(viewer.id) ||
    typeof viewer.node_id !== "string"
  ) {
    throw new Error("all-13 authenticated viewer differs");
  }
  return Object.freeze({ login: viewer.login, database_id: viewer.id });
}

function independentPull(raw: Buffer, prNumber: number) {
  const pull = jsonObject(raw, "all-13 authenticated pull request");
  const head = object(pull.head, "all-13 pull request head");
  const base = object(pull.base, "all-13 pull request base");
  const headRepository = object(head.repo, "all-13 head repository");
  const baseRepository = object(base.repo, "all-13 base repository");
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
    headRepository.id !== REPOSITORY_IDENTITY.github_repository_database_id ||
    headRepository.node_id !== REPOSITORY_IDENTITY.github_repository_node_id ||
    headRepository.full_name !== REPOSITORY ||
    baseRepository.id !== REPOSITORY_IDENTITY.github_repository_database_id ||
    baseRepository.node_id !== REPOSITORY_IDENTITY.github_repository_node_id ||
    baseRepository.full_name !== REPOSITORY
  ) {
    throw new Error("all-13 authenticated pull request differs");
  }
  iso(pull.merged_at, "all-13 pull request merged_at");
  return Object.freeze({ pull, head, base });
}

function independentWorkflow(relativePath: string, raw: Buffer) {
  const lines = raw.toString("utf8").split("\n");
  if (lines.some((line) => /^\s*\t/u.test(line))) {
    throw new Error(`${relativePath} tab indentation differs`);
  }
  const names = lines
    .map((line) => /^name:\s*([^#]+?)\s*$/u.exec(line)?.[1])
    .filter((value): value is string => value !== undefined);
  const onIndex = lines.indexOf("on:");
  const jobsIndex = lines.indexOf("jobs:");
  const pullIndex = lines.indexOf("  pull_request:");
  const branchRow = lines
    .slice(pullIndex + 1, jobsIndex)
    .map((line) => /^    branches:\s*\[([^\]]+)\]\s*$/u.exec(line))
    .find((match) => match !== null);
  const branches =
    branchRow?.[1]?.split(",").map((value) => value.trim()) ?? [];
  if (
    names.length !== 1 ||
    onIndex < 0 ||
    pullIndex <= onIndex ||
    jobsIndex <= pullIndex ||
    v1r11CanonicalJson(branches) !== v1r11CanonicalJson(["main"])
  ) {
    throw new Error(`${relativePath} workflow trigger differs`);
  }
  const jobs = lines
    .map((line, index) => ({
      match: /^  ([A-Za-z0-9_-]+):\s*$/u.exec(line),
      index,
    }))
    .filter(
      (item): item is { match: RegExpExecArray; index: number } =>
        item.index > jobsIndex && item.match !== null,
    );
  if (jobs.length < 1) throw new Error(`${relativePath} jobs differ`);
  const expanded: string[] = [];
  const keys = new Set<string>();
  for (const [offset, job] of jobs.entries()) {
    const key = job.match[1]!;
    if (keys.has(key)) throw new Error(`${relativePath} duplicate job`);
    keys.add(key);
    const block = lines.slice(job.index + 1, jobs[offset + 1]?.index);
    const jobNames = block
      .map((line) => /^    name:\s*([^#]+?)\s*$/u.exec(line)?.[1])
      .filter((value): value is string => value !== undefined);
    const matrixIds = block
      .map((line) => /^          - id:\s*([A-Za-z0-9_-]+)\s*$/u.exec(line)?.[1])
      .filter((value): value is string => value !== undefined);
    if (jobNames.length !== 1 || new Set(matrixIds).size !== matrixIds.length) {
      throw new Error(`${relativePath} job expansion differs`);
    }
    const name = jobNames[0]!;
    if (name.includes("${{ matrix.id }}")) {
      if (matrixIds.length < 1 || /\$\{\{(?! matrix\.id \}\})/u.test(name)) {
        throw new Error(`${relativePath} matrix expression differs`);
      }
      expanded.push(
        ...matrixIds.map((id) => name.replaceAll("${{ matrix.id }}", id)),
      );
    } else {
      if (name.includes("${{") || matrixIds.length !== 0) {
        throw new Error(`${relativePath} dynamic job name differs`);
      }
      expanded.push(name);
    }
  }
  const expected = EXPECTED_CHECK_CONTEXTS.filter(
    (entry) => entry.workflow === names[0],
  )
    .map((entry) => entry.check_name)
    .sort((left, right) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right)),
    );
  const actual = [...expanded].sort((left, right) =>
    Buffer.compare(Buffer.from(left), Buffer.from(right)),
  );
  if (
    new Set(actual).size !== actual.length ||
    v1r11CanonicalJson(actual) !== v1r11CanonicalJson(expected)
  ) {
    throw new Error(`${relativePath} expanded check names differ`);
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
    parsed_workflow_name: names[0],
    parsed_pull_request_base_branches: Object.freeze(branches),
    expanded_check_names: Object.freeze(actual),
  });
}

function independentVitest(
  raw: Buffer,
  label: string,
  expectedFiles: readonly string[],
) {
  const report = jsonObject(raw, label);
  const count = (field: string): number => {
    const value = report[field];
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
      throw new Error(`${label} ${field} differs`);
    }
    return Number(value);
  };
  const totalSuites = count("numTotalTestSuites");
  const passedSuites = count("numPassedTestSuites");
  const failedSuites = count("numFailedTestSuites");
  const pendingSuites = count("numPendingTestSuites");
  const totalTests = count("numTotalTests");
  const passedTests = count("numPassedTests");
  const failedTests = count("numFailedTests");
  const pendingTests = count("numPendingTests");
  const todoTests = count("numTodoTests");
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
    report.testResults.length !== totalSuites ||
    totalSuites !== expectedFiles.length
  ) {
    throw new Error(`${label} aggregate differs`);
  }
  let assertions = 0;
  const reportedFiles: string[] = [];
  for (const suiteValue of report.testResults) {
    const suite = object(suiteValue, `${label} suite`);
    if (
      suite.status !== "passed" ||
      !Array.isArray(suite.assertionResults) ||
      suite.assertionResults.length < 1
    ) {
      throw new Error(`${label} suite differs`);
    }
    if (typeof suite.name !== "string") {
      throw new Error(`${label} suite path differs`);
    }
    const normalized = suite.name.replaceAll("\\", "/");
    const matching = expectedFiles.filter(
      (file) => normalized === file || normalized.endsWith(`/${file}`),
    );
    if (matching.length !== 1) {
      throw new Error(`${label} suite path differs`);
    }
    reportedFiles.push(matching[0]!);
    assertions += suite.assertionResults.length;
    if (
      suite.assertionResults.some(
        (assertion) =>
          object(assertion, `${label} assertion`).status !== "passed",
      )
    ) {
      throw new Error(`${label} assertion differs`);
    }
  }
  if (
    assertions !== totalTests ||
    passedTests !== totalTests ||
    new Set(reportedFiles).size !== expectedFiles.length
  ) {
    throw new Error(`${label} assertion count differs`);
  }
  return report;
}

function independentStageAPayload(
  gate: Gate,
  rows: readonly IndependentTranscriptRow[],
  previous: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
): Readonly<Record<string, unknown>> {
  const origin = ["git", "remote", "get-url", "origin"] as const;
  const viewerCommand = githubApiCommand("user");
  const assertOrigins = () => {
    for (const row of [rows[0], rows.at(-1)]) {
      if (
        row?.stdout.toString("utf8").trim() !==
        REPOSITORY_IDENTITY.canonical_origin_fetch_url
      ) {
        throw new Error(`${gate} origin differs`);
      }
    }
  };
  if (gate === "ready-pr") {
    if (rows.length !== 4) throw new Error(`${gate} command count differs`);
    exactCommand(rows[0]!, origin, gate);
    exactCommand(rows[1]!, viewerCommand, gate);
    const endpoint = rows[2]!.argv[5] ?? "";
    const match = /^repos\/gomyway1216\/nextjs-portfolio\/pulls\/(\d+)$/u.exec(
      endpoint,
    );
    if (match === null) throw new Error(`${gate} endpoint differs`);
    const prNumber = Number(match[1]);
    exactCommand(
      rows[2]!,
      githubApiCommand(`repos/${REPOSITORY}/pulls/${prNumber}`),
      gate,
    );
    exactCommand(rows[3]!, origin, gate);
    assertOrigins();
    const pull = independentPull(rows[2]!.stdout, prNumber);
    return Object.freeze({
      repository: REPOSITORY_IDENTITY,
      collector_executable_identity: independentCollectorIdentity(),
      authenticated_viewer: independentViewer(rows[1]!.stdout),
      pr_number: prNumber,
      pr_url: pull.pull.html_url,
      head_revision: pull.head.sha,
      base_revision: pull.base.sha,
      merge_revision: pull.pull.merge_commit_sha,
      base_branch: "main",
      is_draft: false,
      state: "MERGED",
      observed_at_utc: rows[3]!.completedAtUtc,
    });
  }
  if (gate === "all-required-ci-success") {
    if (rows.length !== 7) throw new Error(`${gate} command count differs`);
    const ready = previous.get("ready-pr");
    if (ready === undefined) throw new Error(`${gate} ready-pr missing`);
    const head = String(ready.head_revision);
    const commands = [
      origin,
      viewerCommand,
      githubApiCommand(
        `repos/${REPOSITORY}/commits/${head}/check-runs?per_page=100&filter=latest`,
      ),
      githubApiCommand(
        `repos/${REPOSITORY}/branches/main/protection/required_status_checks`,
      ),
      ["git", "show", `${head}:.github/workflows/ci.yml`],
      ["git", "show", `${head}:.github/workflows/security.yml`],
      origin,
    ];
    commands.forEach((command, index) =>
      exactCommand(rows[index]!, command, gate),
    );
    assertOrigins();
    const response = jsonObject(rows[2]!.stdout, `${gate} check runs`);
    const rawRuns = Array.isArray(response.check_runs)
      ? (response.check_runs as readonly Readonly<Record<string, unknown>>[])
      : [];
    if (response.total_count !== 15 || rawRuns.length !== 15) {
      throw new Error(`${gate} exact check-run set differs`);
    }
    const protection = jsonObject(rows[3]!.stdout, `${gate} protection`);
    const contexts = Array.isArray(protection.contexts)
      ? protection.contexts
      : [];
    const protectedChecks = Array.isArray(protection.checks)
      ? protection.checks
      : [];
    const expectedProtected = [
      { context: "Test and build", app_id: 15368 },
      { context: "npm audit", app_id: 15368 },
    ];
    if (
      protection.strict !== false ||
      protection.url !==
        `https://api.github.com/repos/${REPOSITORY}/branches/main/protection/required_status_checks` ||
      protection.contexts_url !==
        `https://api.github.com/repos/${REPOSITORY}/branches/main/protection/required_status_checks/contexts` ||
      v1r11CanonicalJson([...contexts].sort()) !==
        v1r11CanonicalJson(
          expectedProtected.map((row) => row.context).sort(),
        ) ||
      v1r11CanonicalJson(
        [...protectedChecks].sort((left, right) =>
          Buffer.compare(
            Buffer.from(
              String(object(left, `${gate} protected check`).context),
            ),
            Buffer.from(
              String(object(right, `${gate} protected check`).context),
            ),
          ),
        ),
      ) !== v1r11CanonicalJson(expectedProtected)
    ) {
      throw new Error(`${gate} branch protection differs`);
    }
    const manifests = Object.freeze([
      independentWorkflow(".github/workflows/ci.yml", rows[4]!.stdout),
      independentWorkflow(".github/workflows/security.yml", rows[5]!.stdout),
    ]);
    const requiredChecks = EXPECTED_CHECK_CONTEXTS.map((expected) => {
      const matches = rawRuns.filter((candidate) => {
        const app = object(candidate.app, `${gate} check app`);
        return (
          candidate.name === expected.check_name &&
          candidate.head_sha === head &&
          app.slug === expected.app_slug
        );
      });
      if (matches.length !== 1) {
        throw new Error(
          `${gate} check ${expected.check_name} uniqueness differs`,
        );
      }
      const run = matches[0]!;
      const app = object(run.app, `${gate} check app`);
      if (
        !Number.isSafeInteger(run.id) ||
        typeof run.node_id !== "string" ||
        typeof run.details_url !== "string" ||
        !Number.isSafeInteger(app.id) ||
        typeof run.external_id !== "string" ||
        typeof run.started_at !== "string" ||
        typeof run.completed_at !== "string"
      ) {
        throw new Error(`${gate} check ${expected.check_name} fields differ`);
      }
      iso(run.started_at, `${gate} check started_at`);
      iso(run.completed_at, `${gate} check completed_at`);
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
      collector_executable_identity: independentCollectorIdentity(),
      authenticated_viewer: independentViewer(rows[1]!.stdout),
      pr_number: ready.pr_number,
      head_revision: head,
      branch_protection_manifest: protection,
      workflow_manifests: manifests,
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
      observed_at_utc: rows[6]!.completedAtUtc,
    });
  }
  if (gate === "regular-merge") {
    if (rows.length !== 5) throw new Error(`${gate} command count differs`);
    const ready = previous.get("ready-pr");
    if (ready === undefined) throw new Error(`${gate} ready-pr missing`);
    const mergeRevision = String(ready.merge_revision);
    const prNumber = Number(ready.pr_number);
    const commands = [
      origin,
      viewerCommand,
      ["git", "cat-file", "-p", `${mergeRevision}^{commit}`],
      githubApiCommand(`repos/${REPOSITORY}/pulls/${prNumber}`),
      origin,
    ];
    commands.forEach((command, index) =>
      exactCommand(rows[index]!, command, gate),
    );
    assertOrigins();
    independentViewer(rows[1]!.stdout);
    const rawCommit = rows[2]!.stdout;
    const boundary = rawCommit.indexOf(Buffer.from("\n\n"));
    if (boundary < 0) throw new Error(`${gate} commit boundary differs`);
    const headers = rawCommit
      .subarray(0, boundary)
      .toString("utf8")
      .split("\n");
    const trees = headers.filter((line) => line.startsWith("tree "));
    const parents = headers.filter((line) => line.startsWith("parent "));
    const digest = crypto
      .createHash("sha1")
      .update(`commit ${rawCommit.byteLength}\0`)
      .update(rawCommit)
      .digest("hex");
    if (
      digest !== mergeRevision ||
      trees.length !== 1 ||
      headers[0] !== trees[0] ||
      parents.length !== 2 ||
      headers[1] !== parents[0] ||
      headers[2] !== parents[1]
    ) {
      throw new Error(`${gate} merge commit differs`);
    }
    const pull = independentPull(rows[3]!.stdout, prNumber);
    if (
      pull.pull.html_url !== ready.pr_url ||
      pull.pull.merge_commit_sha !== ready.merge_revision ||
      pull.head.sha !== ready.head_revision ||
      pull.base.sha !== ready.base_revision
    ) {
      throw new Error(`${gate} pull request binding differs`);
    }
    return Object.freeze({
      merge_revision: mergeRevision,
      parent_count: 2,
      first_parent_revision: parents[0]!.slice(7),
      second_parent_revision: parents[1]!.slice(7),
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
    if (rows.length !== commands.length) {
      throw new Error(`${gate} command count differs`);
    }
    commands.forEach((command, index) =>
      exactCommand(rows[index]!, command, gate),
    );
    return Object.freeze({
      branch: rows[0]!.stdout.toString("utf8").trim(),
      head_revision_before: rows[1]!.stdout.toString("utf8").trim(),
      main_revision: rows[2]!.stdout.toString("utf8").trim(),
      status_porcelain_bytes: rows[3]!.stdout.byteLength,
      status_porcelain_sha256: v1r11Sha256(rows[3]!.stdout),
      head_revision_after: rows[4]!.stdout.toString("utf8").trim(),
    });
  }
  const files = stageATestFiles(gate);
  const command = ["npx", "vitest", "run", ...files, "--reporter=json"];
  if (rows.length !== 1) throw new Error(`${gate} command count differs`);
  exactCommand(rows[0]!, command, gate);
  const report = independentVitest(
    rows[0]!.stdout,
    `${gate} Vitest report`,
    files,
  );
  return Object.freeze({
    command,
    test_files: files,
    tests_passed: report.numPassedTests,
    tests_failed: report.numFailedTests,
    exit_code: 0,
    stdout_sha256: v1r11Sha256(rows[0]!.stdout),
    stderr_sha256: v1r11Sha256(rows[0]!.stderr),
  });
}

function validateIndependentStageAPayload(
  gate: Gate,
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
      !safeInteger(payload.pr_number, 1) ||
      payload.pr_url !==
        `https://github.com/${REPOSITORY}/pull/${String(payload.pr_number)}` ||
      !REVISION_RE.test(String(payload.head_revision)) ||
      !REVISION_RE.test(String(payload.base_revision)) ||
      !REVISION_RE.test(String(payload.merge_revision)) ||
      payload.base_branch !== "main" ||
      payload.is_draft !== false ||
      payload.state !== "MERGED"
    ) {
      throw new Error(`${gate} accepted semantics differ`);
    }
    iso(payload.observed_at_utc, `${gate} observed_at_utc`);
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
      !safeInteger(payload.pr_number, 1) ||
      !REVISION_RE.test(String(payload.head_revision)) ||
      !Array.isArray(payload.required_checks) ||
      payload.required_checks.length !== EXPECTED_CHECK_CONTEXTS.length ||
      payload.required_check_count !== payload.required_checks.length ||
      payload.successful_check_count !== payload.required_checks.length ||
      payload.failed_check_count !== 0 ||
      payload.pending_check_count !== 0 ||
      payload.conclusion !== "success" ||
      !Array.isArray(payload.workflow_manifests) ||
      payload.workflow_manifests.length !== 2
    ) {
      throw new Error(`${gate} accepted semantics differ`);
    }
    const checks = payload.required_checks.map((value, index) => {
      const row = object(value, `${gate} required check ${index + 1}`);
      exactKeys(
        row,
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
        ],
        `${gate} required check ${index + 1}`,
      );
      if (
        row.head_revision !== payload.head_revision ||
        row.status !== "COMPLETED" ||
        row.conclusion !== "SUCCESS" ||
        !safeInteger(row.check_run_id, 1) ||
        !safeInteger(row.app_id, 1) ||
        typeof row.details_url !== "string" ||
        row.details_url.length < 1 ||
        typeof row.external_id !== "string"
      ) {
        throw new Error(`${gate} required check ${index + 1} differs`);
      }
      iso(row.started_at, `${gate} check started_at`);
      iso(row.completed_at, `${gate} check completed_at`);
      return row;
    });
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
        checks.length
    ) {
      throw new Error(`${gate} required check set differs`);
    }
    iso(payload.observed_at_utc, `${gate} observed_at_utc`);
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
      !REVISION_RE.test(String(payload.merge_revision)) ||
      !REVISION_RE.test(String(payload.first_parent_revision)) ||
      !REVISION_RE.test(String(payload.second_parent_revision)) ||
      payload.parent_count !== 2 ||
      payload.first_parent_revision !== payload.authenticated_base_revision ||
      payload.second_parent_revision !==
        payload.authenticated_pr_head_revision ||
      payload.strategy !== "merge-commit" ||
      payload.base_branch !== "main"
    ) {
      throw new Error(`${gate} accepted semantics differ`);
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
      !REVISION_RE.test(String(payload.head_revision_before)) ||
      payload.head_revision_before !== payload.main_revision ||
      payload.main_revision !== payload.head_revision_after ||
      payload.status_porcelain_bytes !== 0 ||
      payload.status_porcelain_sha256 !== v1r11Sha256("")
    ) {
      throw new Error(`${gate} accepted semantics differ`);
    }
    return;
  }
  const files = stageATestFiles(gate);
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
    v1r11CanonicalJson(payload.command) !==
      v1r11CanonicalJson([
        "npx",
        "vitest",
        "run",
        ...files,
        "--reporter=json",
      ]) ||
    v1r11CanonicalJson(payload.test_files) !== v1r11CanonicalJson(files) ||
    !safeInteger(payload.tests_passed, 1) ||
    payload.tests_failed !== 0 ||
    payload.exit_code !== 0 ||
    !SHA256_RE.test(String(payload.stdout_sha256)) ||
    !SHA256_RE.test(String(payload.stderr_sha256))
  ) {
    throw new Error(`${gate} accepted semantics differ`);
  }
}

export function verifyHalfkp81V1R11All13StageAPayloadForTests(
  gate: Gate,
  payload: Readonly<Record<string, unknown>>,
): void {
  validateIndependentStageAPayload(gate, payload);
}

function independentlyDecodeStageABundle(
  gate: Gate,
  value: unknown,
  previous: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
) {
  const content = object(value, `${gate} primary source content`);
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
    `${gate} primary source content`,
  );
  const decode = (name: "stdout" | "stderr") => {
    const encoded = content[`${name}_base64`];
    if (typeof encoded !== "string") {
      throw new Error(`${gate} ${name} encoding differs`);
    }
    const raw = Buffer.from(encoded, "base64");
    if (
      raw.toString("base64") !== encoded ||
      raw.byteLength !== content[`${name}_bytes`] ||
      v1r11Sha256(raw) !== content[`${name}_sha256`]
    ) {
      throw new Error(`${gate} ${name} binding differs`);
    }
    return raw;
  };
  const stdout = decode("stdout");
  const stderr = decode("stderr");
  if (content.exit_code !== 0) throw new Error(`${gate} exit code differs`);
  const rows = decodeIndependentTranscript(stdout, gate);
  const expectedRequest = gate.endsWith("tests-pass")
    ? rows[0]!.argv
    : rows.map((row) => row.argv);
  const expectedCollector = gate.endsWith("tests-pass")
    ? "fixed-vitest-transcript"
    : gate === "clean-main-source-authentication"
      ? "fixed-git-command-transcript"
      : gate === "regular-merge"
        ? "fixed-git-and-authenticated-github-api"
        : "authenticated-github-api";
  if (
    content.collector !== expectedCollector ||
    v1r11CanonicalJson(content.request_or_command) !==
      v1r11CanonicalJson(expectedRequest) ||
    !stderr.equals(Buffer.concat(rows.map((row) => row.stderr)))
  ) {
    throw new Error(`${gate} transcript bundle differs`);
  }
  const payload = independentStageAPayload(gate, rows, previous);
  validateIndependentStageAPayload(gate, payload);
  if (
    v1r11CanonicalJson(content.parsed_canonical_json) !==
    v1r11CanonicalJson(payload)
  ) {
    throw new Error(`${gate} parsed payload differs`);
  }
  return Object.freeze({ content, payload });
}

export function verifyHalfkp81V1R11All13StageABundleForTests(
  gate:
    | "preformal-authority-implementation-tests-pass"
    | "artifact-verifier-implementation-tests-pass"
    | "power-guardian-implementation-tests-pass",
  value: unknown,
) {
  return independentlyDecodeStageABundle(gate, value, new Map()).payload;
}

function safeInteger(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function independentlyVerifyPowerObservation(
  value: unknown,
  previous: Readonly<Record<string, unknown>> | null,
  first: Readonly<Record<string, unknown>>,
  launch: Readonly<Record<string, unknown>>,
  stageA: Readonly<V1R11AuthorityFileIdentity>,
  label: string,
): Readonly<Record<string, unknown>> {
  const observation = object(value, label);
  exactKeys(
    observation,
    [
      "observed_at_ms",
      "timestamp_utc",
      "power_source",
      "battery_percentage",
      "runner_pid",
      "guardian_pid",
      "caffeinate_assertion_holder_pid",
      "caffeinate_assertion_holder_parent_runner_pid",
      "caffeinate_executable",
      "caffeinate_argv",
      "runner_utility_argv",
      "launchagent_authority_evidence",
      "preformal_authority_verified_receipt",
      "assertion_owner_caffeinate_pid",
      "required_assertions",
      "boot_session_identity",
      "pmset_start_anchor",
      "pmset_current_cursor",
    ],
    label,
  );
  if (
    !safeInteger(observation.observed_at_ms, 0) ||
    observation.timestamp_utc !==
      new Date(Number(observation.observed_at_ms)).toISOString() ||
    observation.power_source !== "AC Power" ||
    !safeInteger(observation.battery_percentage, 80) ||
    Number(observation.battery_percentage) > 100 ||
    !safeInteger(observation.runner_pid, 1) ||
    !safeInteger(observation.guardian_pid, 1) ||
    !safeInteger(observation.caffeinate_assertion_holder_pid, 1) ||
    observation.caffeinate_assertion_holder_pid === observation.runner_pid ||
    observation.caffeinate_assertion_holder_parent_runner_pid !==
      observation.runner_pid ||
    observation.assertion_owner_caffeinate_pid !==
      observation.caffeinate_assertion_holder_pid ||
    observation.caffeinate_executable !== "/usr/bin/caffeinate" ||
    !Array.isArray(observation.runner_utility_argv) ||
    observation.runner_utility_argv.length < 1 ||
    observation.runner_utility_argv.some(
      (part) => typeof part !== "string" || part.length < 1,
    ) ||
    v1r11CanonicalJson(observation.caffeinate_argv) !==
      v1r11CanonicalJson([
        "/usr/bin/caffeinate",
        "-dimsu",
        ...observation.runner_utility_argv,
      ]) ||
    v1r11CanonicalJson(observation.required_assertions) !==
      v1r11CanonicalJson(REQUIRED_ASSERTIONS) ||
    typeof observation.boot_session_identity !== "string" ||
    observation.boot_session_identity.length < 1 ||
    v1r11CanonicalJson(observation.launchagent_authority_evidence) !==
      v1r11CanonicalJson(launch) ||
    v1r11CanonicalJson(observation.preformal_authority_verified_receipt) !==
      v1r11CanonicalJson(stageA) ||
    observation.runner_pid !== first.runner_pid ||
    observation.guardian_pid !== first.guardian_pid ||
    observation.caffeinate_assertion_holder_pid !==
      first.caffeinate_assertion_holder_pid ||
    observation.boot_session_identity !== first.boot_session_identity ||
    v1r11CanonicalJson(observation.pmset_start_anchor) !==
      v1r11CanonicalJson(first.pmset_start_anchor) ||
    (previous !== null &&
      (Number(observation.observed_at_ms) - Number(previous.observed_at_ms) <
        0 ||
        Number(observation.observed_at_ms) - Number(previous.observed_at_ms) >
          30_000))
  ) {
    throw new Error(`${label} semantics differ`);
  }
  return observation;
}

function independentlyVerifyStageBPower(
  gate: Gate,
  ledgerValue: unknown,
  receiptValue: unknown,
  context: Readonly<{
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    formalRunFingerprint: string;
    stageA: Readonly<V1R11AuthorityFileIdentity>;
    gateDirectory: string;
    sequence: number;
    source2: Readonly<V1R11AuthorityFileIdentity>;
    fingerprints: Set<string>;
  }>,
): void {
  const ledger = object(ledgerValue, `${gate} power ledger`);
  const receipt = object(receiptValue, `${gate} power receipt`);
  exactKeys(
    ledger,
    [
      "schema",
      "status",
      "gate",
      "stage_b_run_fingerprint",
      "stage_b_epoch_namespace",
      "stage_a_verified_receipt",
      "launchagent_evidence",
      "admission_entry",
      "samples",
      "final_entry",
      "previous_entry_hash_chain_verified",
    ],
    `${gate} power ledger`,
  );
  exactKeys(
    receipt,
    [
      "schema",
      "status",
      "gate",
      "stage_b_run_fingerprint",
      "stage_b_epoch_namespace",
      "stage_a_verified_receipt",
      "stage_b_power_ledger",
      "launchagent_evidence",
      "all_engines_reaped",
      "pmset_interval",
      "verifier",
      "authority",
    ],
    `${gate} power receipt`,
  );
  const fingerprint = String(ledger.stage_b_run_fingerprint);
  const epoch = path.join(
    context.gateDirectory,
    `${String(context.sequence).padStart(2, "0")}-${gate}.stage-b-epoch`,
  );
  const expectedFingerprint = v1r11Sha256(
    v1r11CanonicalJson({
      domain: "shogi-halfkp81-depth18-v1r11-stage-b-run-fingerprint-v1",
      gate,
      sequence: context.sequence,
      teacher_plan: context.teacherPlan,
      source_revision: context.sourceRevision,
      formal_run_fingerprint: context.formalRunFingerprint,
      stage_a_verified_receipt: context.stageA,
      stage_b_epoch_namespace: epoch,
      source_02_path: path.join(
        context.gateDirectory,
        `${String(context.sequence).padStart(2, "0")}-${gate}.source-02.bin`,
      ),
      source_03_path: path.join(
        context.gateDirectory,
        `${String(context.sequence).padStart(2, "0")}-${gate}.source-03.bin`,
      ),
    }),
  );
  const launch = object(
    ledger.launchagent_evidence,
    `${gate} Stage B LaunchAgent evidence`,
  );
  const expectedLedgerSchema =
    `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-primary-source-stage-b-power-ledger-v1`;
  const expectedReceiptSchema =
    `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-primary-source-stage-b-power-receipt-v1`;
  if (
    ledger.schema !== expectedLedgerSchema ||
    ledger.status !==
      "preformal-engine-gate-power-continuity-complete-no-formal-authority" ||
    ledger.gate !== gate ||
    fingerprint !== expectedFingerprint ||
    fingerprint === context.formalRunFingerprint ||
    context.fingerprints.has(fingerprint) ||
    ledger.stage_b_epoch_namespace !== epoch ||
    v1r11CanonicalJson(ledger.stage_a_verified_receipt) !==
      v1r11CanonicalJson(context.stageA) ||
    ledger.previous_entry_hash_chain_verified !== true ||
    receipt.schema !== expectedReceiptSchema ||
    receipt.status !==
      "preformal-engine-gate-power-continuity-independently-verified-no-formal-authority" ||
    receipt.gate !== gate ||
    receipt.stage_b_run_fingerprint !== fingerprint ||
    receipt.stage_b_epoch_namespace !== epoch ||
    v1r11CanonicalJson(receipt.stage_a_verified_receipt) !==
      v1r11CanonicalJson(context.stageA) ||
    v1r11CanonicalJson(receipt.stage_b_power_ledger) !==
      v1r11CanonicalJson(context.source2) ||
    v1r11CanonicalJson(receipt.launchagent_evidence) !==
      v1r11CanonicalJson(launch) ||
    receipt.all_engines_reaped !== true ||
    v1r11CanonicalJson(receipt.authority) !==
      v1r11CanonicalJson(FALSE_AUTHORITY)
  ) {
    throw new Error(`${gate} power envelope differs`);
  }
  const pmset = object(receipt.pmset_interval, `${gate} pmset interval`);
  exactKeys(
    pmset,
    [
      "start_anchor",
      "end_anchor",
      "raw_log_base64",
      "raw_log_bytes",
      "raw_log_sha256",
    ],
    `${gate} pmset interval`,
  );
  const pmsetRaw = Buffer.from(String(pmset.raw_log_base64), "base64");
  if (
    pmsetRaw.toString("base64") !== pmset.raw_log_base64 ||
    pmsetRaw.byteLength !== pmset.raw_log_bytes ||
    v1r11Sha256(pmsetRaw) !== pmset.raw_log_sha256 ||
    pmsetRaw.byteLength < 2 ||
    pmsetRaw.at(-1) !== 0x0a
  ) {
    throw new Error(`${gate} raw pmset transcript differs`);
  }
  const rawRows = pmsetRaw.toString("utf8").slice(0, -1).split("\n");
  const entries = [
    ledger.admission_entry,
    ...(Array.isArray(ledger.samples) ? ledger.samples : []),
    ledger.final_entry,
  ].map((entry, index) => object(entry, `${gate} power row ${index + 1}`));
  if (
    entries.length < 2 ||
    entries[0]?.entry_kind !== "admission" ||
    entries.at(-1)?.entry_kind !== "final"
  ) {
    throw new Error(`${gate} power endpoints differ`);
  }
  const firstObservation = object(
    entries[0]!.observation,
    `${gate} first power observation`,
  );
  let previousDigest: string | null = null;
  let previousObservation: Readonly<Record<string, unknown>> | null = null;
  for (const [index, entry] of entries.entries()) {
    exactKeys(
      entry,
      [
        "schema",
        "status",
        "entry_kind",
        "timestamp_utc",
        "teacher_plan",
        "source_revision",
        "run_fingerprint",
        "launchagent_authority_evidence",
        "preformal_authority_verified_receipt",
        "observation",
        "previous_entry_sha256",
        "entry_sha256",
      ],
      `${gate} power row ${index + 1}`,
    );
    const expectedKind =
      index === 0
        ? "admission"
        : index === entries.length - 1
          ? "final"
          : "sample";
    const { entry_sha256: digest, ...preimage } = entry;
    const observation = independentlyVerifyPowerObservation(
      entry.observation,
      previousObservation,
      firstObservation,
      launch,
      context.stageA,
      `${gate} power observation ${index + 1}`,
    );
    if (
      entry.schema !== POWER_ENTRY_SCHEMA ||
      entry.entry_kind !== expectedKind ||
      entry.status !== `${expectedKind}-pass` ||
      entry.timestamp_utc !== observation.timestamp_utc ||
      v1r11CanonicalJson(entry.teacher_plan) !==
        v1r11CanonicalJson(context.teacherPlan) ||
      entry.source_revision !== context.sourceRevision ||
      entry.run_fingerprint !== fingerprint ||
      v1r11CanonicalJson(entry.launchagent_authority_evidence) !==
        v1r11CanonicalJson(launch) ||
      v1r11CanonicalJson(entry.preformal_authority_verified_receipt) !==
        v1r11CanonicalJson(context.stageA) ||
      entry.previous_entry_sha256 !== previousDigest ||
      digest !==
        v1r11Sha256(`${POWER_ENTRY_DOMAIN}${v1r11CanonicalJson(preimage)}`)
    ) {
      throw new Error(`${gate} power row ${index + 1} differs`);
    }
    const anchor = object(
      observation.pmset_start_anchor,
      `${gate} start anchor ${index + 1}`,
    );
    const cursor = object(
      observation.pmset_current_cursor,
      `${gate} cursor ${index + 1}`,
    );
    const anchorFields = [
      "boot_session_identity",
      "timestamp_utc",
      "timezone_offset",
      "pmset_event_ordinal",
      "last_raw_event_line_sha256",
    ];
    exactKeys(anchor, anchorFields, `${gate} start anchor ${index + 1}`);
    exactKeys(cursor, anchorFields, `${gate} cursor ${index + 1}`);
    const anchorOrdinal = Number(anchor.pmset_event_ordinal);
    const cursorOrdinal = Number(cursor.pmset_event_ordinal);
    const previousOrdinal =
      previousObservation === null
        ? anchorOrdinal
        : Number(
            object(
              previousObservation.pmset_current_cursor,
              `${gate} previous cursor`,
            ).pmset_event_ordinal,
          );
    if (
      anchor.boot_session_identity !== observation.boot_session_identity ||
      cursor.boot_session_identity !== observation.boot_session_identity ||
      !ISO_UTC_RE.test(String(anchor.timestamp_utc)) ||
      !ISO_UTC_RE.test(String(cursor.timestamp_utc)) ||
      !/^[+-]\d{2}:\d{2}$/u.test(String(anchor.timezone_offset)) ||
      cursor.timezone_offset !== anchor.timezone_offset ||
      !safeInteger(anchorOrdinal, 1) ||
      !safeInteger(cursorOrdinal, anchorOrdinal) ||
      cursorOrdinal > rawRows.length ||
      anchor.last_raw_event_line_sha256 !==
        v1r11Sha256(rawRows[anchorOrdinal - 1] ?? "") ||
      cursor.last_raw_event_line_sha256 !==
        v1r11Sha256(rawRows[cursorOrdinal - 1] ?? "") ||
      rawRows
        .slice(previousOrdinal, cursorOrdinal)
        .some((line) =>
          /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}\s+(?:Sleep|DarkWake|Wake|Hibernate)\b/u.test(
            line,
          ),
        )
    ) {
      throw new Error(`${gate} pmset cursor ${index + 1} differs`);
    }
    previousDigest = String(digest);
    previousObservation = observation;
  }
  if (
    v1r11CanonicalJson(pmset.start_anchor) !==
      v1r11CanonicalJson(firstObservation.pmset_start_anchor) ||
    v1r11CanonicalJson(pmset.end_anchor) !==
      v1r11CanonicalJson(
        entries.at(-1)!.observation &&
          object(entries.at(-1)!.observation, `${gate} final observation`)
            .pmset_current_cursor,
      )
  ) {
    throw new Error(`${gate} pmset endpoints differ`);
  }
  const verifier = object(receipt.verifier, `${gate} power verifier result`);
  exactKeys(
    verifier,
    [
      "entries",
      "first_entry_sha256",
      "final_entry_sha256",
      "runner_pid",
      "guardian_pid",
    ],
    `${gate} power verifier result`,
  );
  if (
    verifier.entries !== entries.length ||
    verifier.first_entry_sha256 !== entries[0]!.entry_sha256 ||
    verifier.final_entry_sha256 !== entries.at(-1)!.entry_sha256 ||
    verifier.runner_pid !== firstObservation.runner_pid ||
    verifier.guardian_pid !== firstObservation.guardian_pid
  ) {
    throw new Error(`${gate} power verifier binding differs`);
  }
  context.fingerprints.add(fingerprint);
  return Object.freeze({
    guardianPid: Number(firstObservation.guardian_pid),
    runnerPid: Number(firstObservation.runner_pid),
  });
}

export function verifyHalfkp81V1R11All13StageBPowerForTests(
  gate:
    | "candidate-order-gate"
    | "known10-probe"
    | "pathological-fallback-probe"
    | "mixed-load-gate"
    | "formal-like-512",
  ledger: unknown,
  receipt: unknown,
  context: Readonly<{
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    formalRunFingerprint: string;
    stageA: Readonly<V1R11AuthorityFileIdentity>;
    gateDirectory: string;
    sequence: number;
    source2: Readonly<V1R11AuthorityFileIdentity>;
  }>,
): void {
  independentlyVerifyStageBPower(gate, ledger, receipt, {
    ...context,
    fingerprints: new Set(),
  });
}

function validateIndependentStageBPayload(
  gate: Gate,
  payload: Readonly<Record<string, unknown>>,
  rawGateResult: Readonly<Record<string, unknown>>,
  stageA: Readonly<V1R11AuthorityFileIdentity>,
  source2: Readonly<V1R11AuthorityFileIdentity>,
  source3: Readonly<V1R11AuthorityFileIdentity>,
): void {
  const commonKeys = [
    "stage_a_verified_receipt",
    "stage_b_power_ledger",
    "stage_b_power_receipt",
  ];
  const projected = { ...payload };
  delete projected.stage_a_verified_receipt;
  delete projected.stage_b_power_ledger;
  delete projected.stage_b_power_receipt;
  if (
    v1r11CanonicalJson(projected) !== v1r11CanonicalJson(rawGateResult) ||
    v1r11CanonicalJson(payload.stage_a_verified_receipt) !==
      v1r11CanonicalJson(stageA) ||
    v1r11CanonicalJson(payload.stage_b_power_ledger) !==
      v1r11CanonicalJson(source2) ||
    v1r11CanonicalJson(payload.stage_b_power_receipt) !==
      v1r11CanonicalJson(source3)
  ) {
    throw new Error(`${gate} raw result or authority binding differs`);
  }
  if (gate === "candidate-order-gate") {
    exactKeys(
      payload,
      [
        "parents",
        "candidate_set",
        "normal_candidate_order_digest",
        "fallback_candidate_order_digest",
        "publication_order_digest",
        "mismatches",
        "technical_faults",
        ...commonKeys,
      ],
      gate,
    );
    if (
      payload.parents !== 1 ||
      typeof payload.candidate_set !== "string" ||
      !/^sha256:[0-9a-f]{64}$/u.test(payload.candidate_set) ||
      !SHA256_RE.test(String(payload.normal_candidate_order_digest)) ||
      payload.normal_candidate_order_digest !==
        payload.fallback_candidate_order_digest ||
      payload.normal_candidate_order_digest !==
        payload.publication_order_digest ||
      payload.candidate_set !==
        `sha256:${String(payload.publication_order_digest)}` ||
      payload.mismatches !== 0 ||
      payload.technical_faults !== 0
    ) {
      throw new Error(`${gate} semantics differ`);
    }
    return;
  }
  if (gate === "known10-probe") {
    exactKeys(
      payload,
      [
        "parents",
        "moves",
        "fixed_expected_identities",
        "actual_exact_depth18_identities",
        "mismatches",
        "technical_faults",
        ...commonKeys,
      ],
      gate,
    );
    if (
      payload.parents !== 8 ||
      payload.moves !== 10 ||
      !Array.isArray(payload.fixed_expected_identities) ||
      payload.fixed_expected_identities.length !== 10 ||
      v1r11Sha256(
        v1r11CanonicalJson(payload.fixed_expected_identities),
      ) !== KNOWN10_EXPECTED_CANONICAL_SHA256 ||
      v1r11CanonicalJson(payload.fixed_expected_identities) !==
        v1r11CanonicalJson(payload.actual_exact_depth18_identities) ||
      payload.mismatches !== 0 ||
      payload.technical_faults !== 0
    ) {
      throw new Error(`${gate} semantics differ`);
    }
    return;
  }
  if (gate === "pathological-fallback-probe") {
    exactKeys(
      payload,
      [
        "parent_id",
        "normal_partial_rows_published",
        "capped_rows_published",
        "fallback_exact_depth18_identity",
        "fixed_hash8192_identity",
        "technical_faults",
        ...commonKeys,
      ],
      gate,
    );
    if (
      payload.parent_id !==
        "sha256:622377e74345bfcbe509b903ae89e37dfec48e493db0331780b5423382d926a1" ||
      payload.normal_partial_rows_published !== 0 ||
      payload.capped_rows_published !== 0 ||
      v1r11CanonicalJson(payload.fallback_exact_depth18_identity) !==
        v1r11CanonicalJson(payload.fixed_hash8192_identity) ||
      payload.technical_faults !== 0
    ) {
      throw new Error(`${gate} semantics differ`);
    }
    return;
  }
  if (gate === "mixed-load-gate") {
    exactKeys(
      payload,
      [
        "normal_engines",
        "normal_hash_mib_each",
        "fallback_engines",
        "fallback_hash_mib_each",
        "maximum_normal_active",
        "maximum_fallback_active",
        "process_observations",
        "technical_faults",
        ...commonKeys,
      ],
      gate,
    );
    if (
      payload.normal_engines !== 8 ||
      payload.normal_hash_mib_each !== 512 ||
      payload.fallback_engines !== 2 ||
      payload.fallback_hash_mib_each !== 8_192 ||
      !Array.isArray(payload.process_observations) ||
      payload.process_observations.length < 2 ||
      payload.technical_faults !== 0
    ) {
      throw new Error(`${gate} semantics differ`);
    }
    independentlyValidateMixedLoadObservations(
      payload.process_observations,
      Number(payload.maximum_normal_active),
      Number(payload.maximum_fallback_active),
    );
    return;
  }
  if (gate !== "formal-like-512") {
    throw new Error(`${gate} is not a Stage B gate`);
  }
  exactKeys(
    payload,
    [
      "parents",
      "completed_parents",
      "technical_faults",
      "teacher_contract_equal_formal",
      "power_semantics_equal_formal",
      "run_specific_identity_fields_excluded_from_equality",
      "artifact_verified_receipt",
      ...commonKeys,
    ],
    gate,
  );
  identity(
    payload.artifact_verified_receipt,
    undefined,
    `${gate} artifact receipt`,
  );
  if (
    payload.parents !== 512 ||
    payload.completed_parents !== 512 ||
    payload.technical_faults !== 0 ||
    payload.teacher_contract_equal_formal !== true ||
    payload.power_semantics_equal_formal !== true ||
    !Array.isArray(
      payload.run_specific_identity_fields_excluded_from_equality,
    ) ||
    payload.run_specific_identity_fields_excluded_from_equality.length < 1
  ) {
    throw new Error(`${gate} semantics differ`);
  }
}

function independentlyValidateMixedLoadObservations(
  values: readonly unknown[],
  claimedMaximumNormal: number,
  claimedMaximumFallback: number,
): readonly Readonly<{
  pid: number;
  ppid: number;
  pgid: number;
  start_token: string;
  command: string;
}>[] {
  const expectedSlots = Object.freeze([
    "fallback-01",
    "fallback-02",
    ...Array.from(
      { length: 8 },
      (_, index) => `normal-${String(index + 1).padStart(2, "0")}`,
    ),
  ]);
  const lifecycle = new Map<
    string,
    Readonly<{
      pid: number;
      ppid: number;
      pgid: number;
      start_token: string;
      command: string;
    }>
  >();
  const pidOwners = new Map<number, string>();
  let runnerIdentity: string | null = null;
  let previousObservedAt = -1;
  let maximumNormal = 0;
  let maximumFallback = 0;
  for (const [offset, value] of values.entries()) {
    const observation = object(
      value,
      `mixed-load process observation ${offset + 1}`,
    );
    exactKeys(
      observation,
      [
        "schema",
        "status",
        "observation_sequence",
        "observed_at_utc",
        "runner_pid",
        "runner_pgid",
        "runner_start_token",
        "active_engines",
        "normal_active_recomputed",
        "fallback_active_recomputed",
      ],
      `mixed-load process observation ${offset + 1}`,
    );
    iso(
      observation.observed_at_utc,
      `mixed-load process observation ${offset + 1} observed_at_utc`,
    );
    const observedAt = Date.parse(String(observation.observed_at_utc));
    const runnerPid = Number(observation.runner_pid);
    const runnerPgid = Number(observation.runner_pgid);
    const runnerStart = String(observation.runner_start_token);
    const active = observation.active_engines;
    if (
      observation.schema !==
        "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-mixed-load-process-observation-v1" ||
      observation.status !==
        "authenticated-live-process-snapshot-no-formal-authority" ||
      observation.observation_sequence !== offset + 1 ||
      observedAt <= previousObservedAt ||
      !safeInteger(runnerPid, 1) ||
      runnerPgid !== runnerPid ||
      !PS_START_TOKEN_RE.test(runnerStart) ||
      !Array.isArray(active) ||
      active.length < 1 ||
      active.length > 10
    ) {
      throw new Error(`mixed-load process observation ${offset + 1} differs`);
    }
    const currentRunnerIdentity = `${runnerPid}\0${runnerPgid}\0${runnerStart}`;
    if (
      runnerIdentity !== null &&
      runnerIdentity !== currentRunnerIdentity
    ) {
      throw new Error("mixed-load runner identity changed");
    }
    runnerIdentity = currentRunnerIdentity;
    const seenSlots = new Set<string>();
    const seenPids = new Set<number>();
    let normalActive = 0;
    let fallbackActive = 0;
    let previousSortKey: string | null = null;
    for (const [engineOffset, engineValue] of active.entries()) {
      const engine = object(
        engineValue,
        `mixed-load observation ${offset + 1} engine ${engineOffset + 1}`,
      );
      exactKeys(
        engine,
        [
          "slot_id",
          "class",
          "hash_mib",
          "pid",
          "ppid",
          "pgid",
          "start_token",
          "state",
          "command",
          "engine_binary_sha256",
        ],
        `mixed-load observation ${offset + 1} engine ${engineOffset + 1}`,
      );
      const class_ = String(engine.class);
      const expectedHash = class_ === "normal" ? 512 : 8_192;
      const expectedSlotPattern =
        class_ === "normal" ? /^normal-0[1-8]$/u : /^fallback-0[1-2]$/u;
      const slotId = String(engine.slot_id);
      const pid = Number(engine.pid);
      const command = String(engine.command);
      const sortKey = `${class_}\0${slotId}`;
      if (
        (class_ !== "normal" && class_ !== "fallback") ||
        !expectedSlotPattern.test(slotId) ||
        engine.hash_mib !== expectedHash ||
        !safeInteger(pid, 1) ||
        engine.ppid !== runnerPid ||
        engine.pgid !== runnerPgid ||
        !PS_START_TOKEN_RE.test(String(engine.start_token)) ||
        typeof engine.state !== "string" ||
        !/^[A-Ya-y][A-Za-z+<Nsn]*$/u.test(String(engine.state)) ||
        !path.isAbsolute(command) ||
        path.normalize(command) !== command ||
        path.basename(command) !== "YaneuraOu-authenticated-snapshot" ||
        engine.engine_binary_sha256 !== V1R11_ENGINE_BINARY_SHA256 ||
        seenSlots.has(slotId) ||
        seenPids.has(pid) ||
        (previousSortKey !== null &&
          Buffer.compare(
            Buffer.from(previousSortKey, "utf8"),
            Buffer.from(sortKey, "utf8"),
          ) >= 0)
      ) {
        throw new Error(
          `mixed-load observation ${offset + 1} engine ${engineOffset + 1} differs`,
        );
      }
      seenSlots.add(slotId);
      seenPids.add(pid);
      previousSortKey = sortKey;
      if (class_ === "normal") normalActive += 1;
      else fallbackActive += 1;
      const identity = Object.freeze({
        pid,
        ppid: runnerPid,
        pgid: runnerPgid,
        start_token: String(engine.start_token),
        command,
      });
      const prior = lifecycle.get(slotId);
      if (
        prior !== undefined &&
        v1r11CanonicalJson(prior) !== v1r11CanonicalJson(identity)
      ) {
        throw new Error(`mixed-load slot ${slotId} identity changed`);
      }
      const priorOwner = pidOwners.get(pid);
      if (priorOwner !== undefined && priorOwner !== slotId) {
        throw new Error(`mixed-load PID ${pid} was reused across slots`);
      }
      lifecycle.set(slotId, identity);
      pidOwners.set(pid, slotId);
    }
    if (
      observation.normal_active_recomputed !== normalActive ||
      observation.fallback_active_recomputed !== fallbackActive
    ) {
      throw new Error(
        `mixed-load observation ${offset + 1} active counts differ`,
      );
    }
    maximumNormal = Math.max(maximumNormal, normalActive);
    maximumFallback = Math.max(maximumFallback, fallbackActive);
    previousObservedAt = observedAt;
  }
  if (
    v1r11CanonicalJson([...lifecycle.keys()].sort()) !==
      v1r11CanonicalJson([...expectedSlots].sort()) ||
    maximumNormal !== 8 ||
    maximumFallback !== 2 ||
    claimedMaximumNormal !== maximumNormal ||
    claimedMaximumFallback !== maximumFallback
  ) {
    throw new Error("mixed-load observed lifecycle or maxima differ");
  }
  return Object.freeze(
    [...lifecycle.values()].sort((left, right) => left.pid - right.pid),
  );
}

interface All13StageBParentEnvelopeContext {
  readonly gate:
    | "candidate-order-gate"
    | "known10-probe"
    | "pathological-fallback-probe"
    | "mixed-load-gate"
    | "formal-like-512";
  readonly sequence: number;
  readonly fingerprint: string;
  readonly epochNamespace: string;
  readonly stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
  readonly repositoryRoot: string;
  readonly authorityDirectory: string;
  readonly nodePath: string;
}

function all13StageBJobContext(
  context: Readonly<All13StageBParentEnvelopeContext>,
) {
  const prefix = String(context.sequence).padStart(2, "0");
  const label = `com.meetyudai.shogi.v1r11-stage-b-${prefix}-${context.gate}-${context.fingerprint.slice(0, 12)}`;
  const directory = path.join(
    path.dirname(context.authorityDirectory),
    ".halfkp81-depth18-yaneura-only-v1r11-stage-b-private",
    `${prefix}-${context.gate}-${context.fingerprint}`,
  );
  const command = Object.freeze([
    context.nodePath,
    "-r",
    path.join(context.repositoryRoot, "node_modules/tsx/dist/cjs/index.cjs"),
    path.join(
      context.repositoryRoot,
      "ml/run-halfkp81-depth18-v1r11-stage-b-engine-gate.ts",
    ),
    "--gate",
    context.gate,
    "--sequence",
    String(context.sequence),
    "--stage-b-run-fingerprint",
    context.fingerprint,
    "--stage-b-epoch-namespace",
    context.epochNamespace,
    "--stage-a-receipt",
    context.stageAReceipt.path,
  ]);
  return Object.freeze({
    label,
    directory,
    workingDirectory: context.repositoryRoot,
    plistPath: path.join(directory, `${label}.plist`),
    stdoutPath: path.join(directory, `${label}.stdout`),
    stderrPath: path.join(directory, `${label}.stderr`),
    command,
    programArguments: Object.freeze([
      "/usr/bin/caffeinate",
      "-dimsu",
      ...command,
    ]),
  });
}

function all13StageBProcessRow(
  value: unknown,
  label: string,
): Readonly<{
  pid: number;
  ppid: number;
  pgid: number;
  start_token: string;
  state: string;
  command: string;
}> {
  const row = object(value, label);
  exactKeys(
    row,
    ["pid", "ppid", "pgid", "start_token", "state", "command"],
    label,
  );
  if (
    !safeInteger(row.pid, 1) ||
    !safeInteger(row.ppid, 0) ||
    !safeInteger(row.pgid, 1) ||
    !PS_START_TOKEN_RE.test(String(row.start_token)) ||
    typeof row.state !== "string" ||
    row.state.length < 1 ||
    typeof row.command !== "string" ||
    row.command.length < 1
  ) {
    throw new Error(`${label} differs`);
  }
  return Object.freeze({
    pid: Number(row.pid),
    ppid: Number(row.ppid),
    pgid: Number(row.pgid),
    start_token: String(row.start_token),
    state: String(row.state),
    command: String(row.command),
  });
}

function independentlyParseStageBPs(raw: Buffer, label: string) {
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw) || !text.endsWith("\n")) {
    throw new Error(`${label} raw UTF-8 differs`);
  }
  return Object.freeze(
    text
      .slice(0, -1)
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line, index) => {
        const match =
          /^\s*(\d+)\s+(\d+)\s+(\d+)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4})\s+(\S+)\s+(.+)$/u.exec(
            line,
          );
        if (match === null) {
          throw new Error(`${label} row ${index + 1} differs`);
        }
        return all13StageBProcessRow(
          {
            pid: Number(match[1]),
            ppid: Number(match[2]),
            pgid: Number(match[3]),
            start_token: match[4],
            state: match[5],
            command: match[6],
          },
          `${label} row ${index + 1}`,
        );
      }),
  );
}

function all13StageBRawIdentity(
  value: unknown,
  label: string,
  allowEmpty = false,
): Buffer {
  const identityValue = object(value, label);
  exactKeys(identityValue, ["bytes", "sha256", "base64"], label);
  const encoded = identityValue.base64;
  if (typeof encoded !== "string") throw new Error(`${label} differs`);
  const raw = Buffer.from(encoded, "base64");
  if (
    raw.toString("base64") !== encoded ||
    raw.byteLength !== identityValue.bytes ||
    v1r11Sha256(raw) !== identityValue.sha256 ||
    (!allowEmpty && raw.byteLength < 1)
  ) {
    throw new Error(`${label} differs`);
  }
  return raw;
}

function independentlyVerifyStageBRunningLaunchctl(
  raw: Buffer,
  stderr: Buffer,
  uid: number,
  label: string,
  runnerPid: number,
): void {
  const text = raw.toString("utf8");
  if (
    !Buffer.from(text, "utf8").equals(raw) ||
    stderr.byteLength !== 0 ||
    !text.startsWith(`gui/${String(uid)}/${label} = {\n`) ||
    !text.endsWith("}\n") ||
    [...text.matchAll(/^\ttype = LaunchAgent$/gmu)].length !== 1 ||
    [...text.matchAll(/^\tstate = running$/gmu)].length !== 1 ||
    [...text.matchAll(new RegExp(`^\\tpid = ${String(runnerPid)}$`, "gmu"))]
      .length !== 1 ||
    [...text.matchAll(/^\tpid = \d+$/gmu)].length !== 1 ||
    [...text.matchAll(/^\tlast exit code = /gmu)].length !== 0
  ) {
    throw new Error("all-13 Stage B running launchctl differs");
  }
}

function independentlyExpectedStageBPlist(
  job: ReturnType<typeof all13StageBJobContext>,
): Buffer {
  const xml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  const string = (value: string) => `    <string>${xml(value)}</string>`;
  return Buffer.from(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict>",
      "  <key>Label</key>",
      string(job.label),
      "  <key>ProgramArguments</key>",
      "  <array>",
      ...job.programArguments.map(string),
      "  </array>",
      "  <key>WorkingDirectory</key>",
      string(job.workingDirectory),
      "  <key>StandardOutPath</key>",
      string(job.stdoutPath),
      "  <key>StandardErrorPath</key>",
      string(job.stderrPath),
      "  <key>RunAtLoad</key>",
      "  <false/>",
      "  <key>KeepAlive</key>",
      "  <false/>",
      "  <key>LaunchOnlyOnce</key>",
      "  <true/>",
      "  <key>Umask</key>",
      "  <integer>63</integer>",
      "  <key>AbandonProcessGroup</key>",
      "  <false/>",
      "</dict>",
      "</plist>",
      "",
    ].join("\n"),
    "utf8",
  );
}

function independentlyExpectedStageBGuardianCommand(
  context: Readonly<All13StageBParentEnvelopeContext>,
): string {
  return [
    context.nodePath,
    "-r",
    path.join(context.repositoryRoot, "node_modules/tsx/dist/cjs/index.cjs"),
    path.join(
      context.repositoryRoot,
      "ml/halfkp81-depth18-power-continuity-guardian.ts",
    ),
  ].join(" ");
}

export function verifyHalfkp81V1R11All13StageBParentEnvelopeForTests(
  value: unknown,
  context: Readonly<All13StageBParentEnvelopeContext>,
): Readonly<{
  gateResult: Readonly<Record<string, unknown>>;
  launchAgentEvidence: Readonly<Record<string, unknown>>;
  observedAuxiliaryRows: readonly ReturnType<
    typeof all13StageBProcessRow
  >[];
  powerEntries: readonly unknown[];
  pmsetInterval: Readonly<Record<string, unknown>>;
  verifier: Readonly<Record<string, unknown>>;
  processCleanup: Readonly<Record<string, unknown>>;
  osReapEvidence: Readonly<Record<string, unknown>>;
}> {
  if (
    context.sequence < 8 ||
    context.sequence > 12 ||
    GATES[context.sequence - 1] !== context.gate ||
    !SHA256_RE.test(context.fingerprint) ||
    context.epochNamespace !==
      path.join(
        path.join(context.authorityDirectory, "preformal-gates"),
        `${String(context.sequence).padStart(2, "0")}-${context.gate}.stage-b-epoch`,
      ) ||
    !path.isAbsolute(context.repositoryRoot) ||
    path.normalize(context.repositoryRoot) !== context.repositoryRoot ||
    !path.isAbsolute(context.nodePath) ||
    path.normalize(context.nodePath) !== context.nodePath
  ) {
    throw new Error("all-13 Stage B parent context differs");
  }
  const job = all13StageBJobContext(context);
  const outer = object(value, `${context.gate} all-13 parent envelope`);
  exactKeys(
    outer,
    [
      "schema",
      "status",
      "runtime_stdout_base64",
      "runtime_stdout_bytes",
      "runtime_stdout_sha256",
      "runtime_stderr_base64",
      "runtime_stderr_bytes",
      "runtime_stderr_sha256",
      "parsed_inner_canonical_json",
      "parent_job_evidence",
    ],
    `${context.gate} all-13 parent envelope`,
  );
  const childStdout = Buffer.from(
    String(outer.runtime_stdout_base64),
    "base64",
  );
  const childStderr = Buffer.from(
    String(outer.runtime_stderr_base64),
    "base64",
  );
  const inner = object(
    outer.parsed_inner_canonical_json,
    `${context.gate} all-13 child result`,
  );
  if (
    outer.schema !==
      "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-parent-envelope-v1" ||
    outer.status !== "fixed-child-output-authenticated-after-job-reap" ||
    childStdout.toString("base64") !== outer.runtime_stdout_base64 ||
    childStdout.byteLength !== outer.runtime_stdout_bytes ||
    v1r11Sha256(childStdout) !== outer.runtime_stdout_sha256 ||
    !childStdout.equals(
      Buffer.from(`${v1r11CanonicalJson(inner)}\n`, "utf8"),
    ) ||
    childStderr.toString("base64") !== outer.runtime_stderr_base64 ||
    childStderr.byteLength !== 0 ||
    outer.runtime_stderr_bytes !== 0 ||
    v1r11Sha256(childStderr) !== outer.runtime_stderr_sha256
  ) {
    throw new Error(`${context.gate} all-13 child raw binding differs`);
  }

  const parent = object(
    outer.parent_job_evidence,
    `${context.gate} all-13 parent job evidence`,
  );
  exactKeys(
    parent,
    [
      "schema",
      "status",
      "label",
      "uid",
      "launchctl_domain",
      "plist_source",
      "stdout_path",
      "stderr_path",
      "program_arguments",
      "runner_pid",
      "runner_pgid",
      "runner_start_token",
      "assertion_holder_pid",
      "assertion_holder_start_token",
      "running_observations",
      "observed_engine_rows",
      "observed_auxiliary_rows",
      "runner_exit_code",
      "runner_exit_signal",
      "termination_actions",
      "final_ps_first",
      "final_ps_second",
      "remaining_process_group_pids",
      "remaining_descendant_pids",
    ],
    `${context.gate} all-13 parent job evidence`,
  );
  const uid = Number(parent.uid);
  const runnerPid = Number(parent.runner_pid);
  const holderPid = Number(parent.assertion_holder_pid);
  const plistSource = object(
    parent.plist_source,
    `${context.gate} all-13 parent plist source`,
  );
  exactKeys(
    plistSource,
    ["path", "bytes", "sha256", "dev", "ino", "uid", "mode", "nlink"],
    `${context.gate} all-13 parent plist source`,
  );
  if (
    parent.schema !==
      "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-parent-job-evidence-v1" ||
    parent.status !== "runner-exited-and-job-process-group-reaped" ||
    parent.label !== job.label ||
    !safeInteger(uid, 1) ||
    parent.launchctl_domain !== `gui/${uid}` ||
    parent.stdout_path !== job.stdoutPath ||
    parent.stderr_path !== job.stderrPath ||
    v1r11CanonicalJson(parent.program_arguments) !==
      v1r11CanonicalJson(job.programArguments) ||
    !safeInteger(runnerPid, 1) ||
    parent.runner_pgid !== runnerPid ||
    !PS_START_TOKEN_RE.test(String(parent.runner_start_token)) ||
    !safeInteger(holderPid, 1) ||
    holderPid === runnerPid ||
    !PS_START_TOKEN_RE.test(String(parent.assertion_holder_start_token)) ||
    parent.runner_exit_code !== 0 ||
    parent.runner_exit_signal !== null ||
    !Array.isArray(parent.remaining_process_group_pids) ||
    parent.remaining_process_group_pids.length !== 0 ||
    !Array.isArray(parent.remaining_descendant_pids) ||
    parent.remaining_descendant_pids.length !== 0 ||
    plistSource.path !== job.plistPath ||
    !safeInteger(plistSource.bytes, 1) ||
    !SHA256_RE.test(String(plistSource.sha256)) ||
    !safeInteger(plistSource.dev, 1) ||
    !safeInteger(plistSource.ino, 1) ||
    plistSource.uid !== uid ||
    plistSource.mode !== 0o600 ||
    plistSource.nlink !== 1
  ) {
    throw new Error(`${context.gate} all-13 parent semantics differ`);
  }
  if (!Array.isArray(parent.observed_engine_rows)) {
    throw new Error(`${context.gate} all-13 parent engine rows differ`);
  }
  const outerEngineRows = Object.freeze(
    parent.observed_engine_rows
      .map((row, index) =>
        all13StageBProcessRow(
          row,
          `${context.gate} all-13 parent engine ${index + 1}`,
        ),
      )
      .sort((left, right) => left.pid - right.pid),
  );
  if (
    outerEngineRows.length < 1 ||
    new Set(outerEngineRows.map((row) => row.pid)).size !==
      outerEngineRows.length ||
    outerEngineRows.some(
      (row) =>
        row.ppid !== runnerPid ||
        row.pgid !== runnerPid ||
        row.state.startsWith("Z") ||
        !path.isAbsolute(row.command) ||
        path.normalize(row.command) !== row.command ||
        path.basename(row.command) !== "YaneuraOu-authenticated-snapshot",
    )
  ) {
    throw new Error(`${context.gate} all-13 parent engine set differs`);
  }
  if (!Array.isArray(parent.observed_auxiliary_rows)) {
    throw new Error(`${context.gate} all-13 parent auxiliary rows differ`);
  }
  const outerAuxiliaryRows = Object.freeze(
    parent.observed_auxiliary_rows
      .map((row, index) =>
        all13StageBProcessRow(
          row,
          `${context.gate} all-13 parent auxiliary ${index + 1}`,
        ),
      )
      .sort((left, right) => left.pid - right.pid),
  );
  const expectedGuardianCommand =
    independentlyExpectedStageBGuardianCommand(context);
  if (
    outerAuxiliaryRows.length !== 1 ||
    new Set(outerAuxiliaryRows.map((row) => row.pid)).size !==
      outerAuxiliaryRows.length ||
    outerAuxiliaryRows.some(
      (row) =>
        row.ppid !== runnerPid ||
        row.pgid !== runnerPid ||
        row.state.startsWith("Z") ||
        row.command !== expectedGuardianCommand,
    )
  ) {
    throw new Error(`${context.gate} all-13 parent auxiliary set differs`);
  }
  if (
    !Array.isArray(parent.running_observations) ||
    parent.running_observations.length < 1
  ) {
    throw new Error(`${context.gate} all-13 running observations differ`);
  }
  const enginesFromRunning = new Map<
    number,
    ReturnType<typeof all13StageBProcessRow>
  >();
  const auxiliariesFromRunning = new Map<
    number,
    ReturnType<typeof all13StageBProcessRow>
  >();
  let previousObservedAt = -1;
  parent.running_observations.forEach((observationValue, offset) => {
    const observation = object(
      observationValue,
      `${context.gate} all-13 running observation ${offset + 1}`,
    );
    exactKeys(
      observation,
      [
        "observation_sequence",
        "observed_at_ms",
        "observed_at_utc",
        "launchctl_stdout",
        "launchctl_stderr",
        "ps_stdout",
        "runner",
        "assertion_holder",
        "observed_engine_rows",
        "observed_auxiliary_rows",
      ],
      `${context.gate} all-13 running observation ${offset + 1}`,
    );
    const observedAt = Number(observation.observed_at_ms);
    if (
      observation.observation_sequence !== offset + 1 ||
      !safeInteger(observedAt, 0) ||
      observedAt < previousObservedAt ||
      observation.observed_at_utc !== new Date(observedAt).toISOString()
    ) {
      throw new Error(`${context.gate} all-13 running order differs`);
    }
    previousObservedAt = observedAt;
    const rawLaunchctl = all13StageBRawIdentity(
      observation.launchctl_stdout,
      `${context.gate} all-13 running launchctl ${offset + 1}`,
    );
    const rawLaunchctlStderr = all13StageBRawIdentity(
      observation.launchctl_stderr,
      `${context.gate} all-13 running launchctl stderr ${offset + 1}`,
      true,
    );
    independentlyVerifyStageBRunningLaunchctl(
      rawLaunchctl,
      rawLaunchctlStderr,
      uid,
      job.label,
      runnerPid,
    );
    const rows = independentlyParseStageBPs(
      all13StageBRawIdentity(
        observation.ps_stdout,
        `${context.gate} all-13 running ps ${offset + 1}`,
      ),
      `${context.gate} all-13 running ps ${offset + 1}`,
    );
    const runner = all13StageBProcessRow(
      observation.runner,
      `${context.gate} all-13 running runner ${offset + 1}`,
    );
    const holder = all13StageBProcessRow(
      observation.assertion_holder,
      `${context.gate} all-13 running holder ${offset + 1}`,
    );
    if (!Array.isArray(observation.observed_engine_rows)) {
      throw new Error(`${context.gate} all-13 running engines differ`);
    }
    const engines = observation.observed_engine_rows.map((row, index) =>
      all13StageBProcessRow(
        row,
        `${context.gate} all-13 running engine ${offset + 1}.${index + 1}`,
      ),
    );
    if (
      !Array.isArray(observation.observed_auxiliary_rows) ||
      observation.observed_auxiliary_rows.length !== 1
    ) {
      throw new Error(`${context.gate} all-13 running auxiliaries differ`);
    }
    const auxiliaries = observation.observed_auxiliary_rows.map(
      (row, index) =>
        all13StageBProcessRow(
          row,
          `${context.gate} all-13 running auxiliary ${offset + 1}.${index + 1}`,
        ),
    );
    const rawRunner = rows.filter((row) => row.pid === runnerPid);
    const rawHolder = rows.filter((row) => row.pid === holderPid);
    if (
      rawRunner.length !== 1 ||
      rawHolder.length !== 1 ||
      v1r11CanonicalJson(rawRunner[0]) !== v1r11CanonicalJson(runner) ||
      v1r11CanonicalJson(rawHolder[0]) !== v1r11CanonicalJson(holder) ||
      runner.ppid < 1 ||
      runner.pgid !== runnerPid ||
      runner.start_token !== parent.runner_start_token ||
      runner.state.startsWith("Z") ||
      runner.command !== job.command.join(" ") ||
      holder.ppid !== runnerPid ||
      holder.pgid !== runnerPid ||
      holder.start_token !== parent.assertion_holder_start_token ||
      holder.state.startsWith("Z") ||
      holder.command !== job.programArguments.join(" ") ||
      engines.some(
        (engine) =>
          engine.ppid !== runnerPid ||
          engine.pgid !== runnerPid ||
          engine.state.startsWith("Z") ||
          !rows.some(
            (row) => v1r11CanonicalJson(row) === v1r11CanonicalJson(engine),
          ),
      ) ||
      auxiliaries.some(
        (auxiliary) =>
          auxiliary.ppid !== runnerPid ||
          auxiliary.pgid !== runnerPid ||
          auxiliary.state.startsWith("Z") ||
          auxiliary.command !== expectedGuardianCommand ||
          !rows.some(
            (row) =>
              v1r11CanonicalJson(row) === v1r11CanonicalJson(auxiliary),
          ),
      )
    ) {
      throw new Error(`${context.gate} all-13 running topology differs`);
    }
    for (const engine of engines) {
      const prior = enginesFromRunning.get(engine.pid);
      if (
        prior !== undefined &&
        v1r11CanonicalJson(prior) !== v1r11CanonicalJson(engine)
      ) {
        throw new Error(`${context.gate} all-13 running PID changed`);
      }
      enginesFromRunning.set(engine.pid, engine);
    }
    for (const auxiliary of auxiliaries) {
      const prior = auxiliariesFromRunning.get(auxiliary.pid);
      if (
        prior !== undefined &&
        v1r11CanonicalJson(prior) !== v1r11CanonicalJson(auxiliary)
      ) {
        throw new Error(`${context.gate} all-13 auxiliary PID changed`);
      }
      auxiliariesFromRunning.set(auxiliary.pid, auxiliary);
    }
  });
  if (
    v1r11CanonicalJson(
      [...enginesFromRunning.values()].sort((left, right) => left.pid - right.pid),
    ) !== v1r11CanonicalJson(outerEngineRows) ||
    v1r11CanonicalJson(
      [...auxiliariesFromRunning.values()].sort(
        (left, right) => left.pid - right.pid,
      ),
    ) !== v1r11CanonicalJson(outerAuxiliaryRows)
  ) {
    throw new Error(`${context.gate} all-13 running engine union differs`);
  }
  if (!Array.isArray(parent.termination_actions)) {
    throw new Error(`${context.gate} all-13 termination actions differ`);
  }
  parent.termination_actions.forEach((value_, index) => {
    const action = object(
      value_,
      `${context.gate} all-13 termination action ${index + 1}`,
    );
    if (index === 0) {
      exactKeys(
        action,
        ["action", "target", "exit_code"],
        `${context.gate} all-13 bootout`,
      );
      if (
        action.action !== "launchctl-bootout" ||
        action.target !== `gui/${uid}/${job.label}` ||
        action.exit_code !== 0
      ) {
        throw new Error(`${context.gate} all-13 bootout differs`);
      }
      return;
    }
    exactKeys(
      action,
      ["action", "pgid", "signal", "result"],
      `${context.gate} all-13 signal action`,
    );
    if (
      index > 2 ||
      action.action !== "signal-process-group" ||
      action.pgid !== runnerPid ||
      action.signal !== (index === 1 ? "SIGTERM" : "SIGKILL") ||
      !["sent", "esrch"].includes(String(action.result))
    ) {
      throw new Error(`${context.gate} all-13 signal action differs`);
    }
  });
  if (parent.termination_actions.length < 1) {
    throw new Error(`${context.gate} all-13 bootout is missing`);
  }
  for (const [index, rawValue] of [
    parent.final_ps_first,
    parent.final_ps_second,
  ].entries()) {
    const rows = independentlyParseStageBPs(
      all13StageBRawIdentity(
        rawValue,
        `${context.gate} all-13 final ps ${index + 1}`,
      ),
      `${context.gate} all-13 final ps ${index + 1}`,
    );
    if (
      rows.some(
        (row) =>
          row.pid === runnerPid ||
          row.pgid === runnerPid ||
          row.ppid === runnerPid ||
          outerEngineRows.some((engine) => engine.pid === row.pid) ||
          outerAuxiliaryRows.some((auxiliary) => auxiliary.pid === row.pid),
      )
    ) {
      throw new Error(`${context.gate} all-13 final ps retains job rows`);
    }
  }

  exactKeys(
    inner,
    [
      "schema",
      "status",
      "gate",
      "sequence",
      "stage_b_run_fingerprint",
      "stage_b_epoch_namespace",
      "stage_a_verified_receipt",
      "gate_result",
      "launchagent_evidence",
      "power_entries",
      "pmset_interval",
      "verifier",
      "process_cleanup",
      "os_reap_evidence",
    ],
    `${context.gate} all-13 child result`,
  );
  const cleanup = object(
    inner.process_cleanup,
    `${context.gate} all-13 child cleanup`,
  );
  exactKeys(
    cleanup,
    [
      "scheduling_stopped",
      "engines_started",
      "engines_terminated",
      "engines_reaped",
      "remaining_engine_pids",
      "children_reaped",
      "next_job_started",
    ],
    `${context.gate} all-13 child cleanup`,
  );
  const osReap = object(
    inner.os_reap_evidence,
    `${context.gate} all-13 OS reap`,
  );
  exactKeys(
    osReap,
    [
      "observer_pid",
      "engine_pids",
      "engine_pgids",
      "engine_start_tokens",
      "direct_parent_matches",
      "dedicated_process_groups_verified",
      "kill_zero_esrch_after_close",
      "ps_rows_absent_after_close",
      "process_group_members_absent_after_close",
      "remaining_descendant_pids",
      "remaining_process_group_pids",
    ],
    `${context.gate} all-13 OS reap`,
  );
  if (
    inner.schema !==
      "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-fixed-executor-result-v1" ||
    inner.status !== "completed-no-formal-authority" ||
    inner.gate !== context.gate ||
    inner.sequence !== context.sequence ||
    inner.stage_b_run_fingerprint !== context.fingerprint ||
    inner.stage_b_epoch_namespace !== context.epochNamespace ||
    v1r11CanonicalJson(inner.stage_a_verified_receipt) !==
      v1r11CanonicalJson(context.stageAReceipt) ||
    cleanup.scheduling_stopped !== true ||
    cleanup.engines_started !== outerEngineRows.length ||
    cleanup.engines_terminated !== outerEngineRows.length ||
    cleanup.engines_reaped !== outerEngineRows.length ||
    !Array.isArray(cleanup.remaining_engine_pids) ||
    cleanup.remaining_engine_pids.length !== 0 ||
    cleanup.children_reaped !== true ||
    cleanup.next_job_started !== false ||
    osReap.observer_pid !== runnerPid ||
    !Array.isArray(osReap.engine_pids) ||
    !Array.isArray(osReap.engine_pgids) ||
    !Array.isArray(osReap.engine_start_tokens) ||
    osReap.direct_parent_matches !== outerEngineRows.length ||
    osReap.dedicated_process_groups_verified !== outerEngineRows.length ||
    osReap.kill_zero_esrch_after_close !== outerEngineRows.length ||
    osReap.ps_rows_absent_after_close !== outerEngineRows.length ||
    osReap.process_group_members_absent_after_close !==
      outerEngineRows.length ||
    !Array.isArray(osReap.remaining_descendant_pids) ||
    osReap.remaining_descendant_pids.length !== 0 ||
    !Array.isArray(osReap.remaining_process_group_pids) ||
    osReap.remaining_process_group_pids.length !== 0
  ) {
    throw new Error(`${context.gate} all-13 child cleanup differs`);
  }
  const innerRows = (osReap.engine_pids as readonly unknown[])
    .map((pid, index) => ({
      pid,
      ppid: runnerPid,
      pgid: (osReap.engine_pgids as readonly unknown[])[index],
      start_token: (osReap.engine_start_tokens as readonly unknown[])[index],
    }))
    .sort((left, right) => Number(left.pid) - Number(right.pid));
  const outerRows = outerEngineRows.map((row) => ({
    pid: row.pid,
    ppid: row.ppid,
    pgid: row.pgid,
    start_token: row.start_token,
  }));
  if (
    innerRows.some(
      (row) =>
        !safeInteger(row.pid, 1) ||
        row.pgid !== runnerPid ||
        !PS_START_TOKEN_RE.test(String(row.start_token)),
    ) ||
    v1r11CanonicalJson(innerRows) !== v1r11CanonicalJson(outerRows)
  ) {
    throw new Error(`${context.gate} all-13 parent/child process set differs`);
  }

  const launch = object(
    inner.launchagent_evidence,
    `${context.gate} all-13 child LaunchAgent`,
  );
  exactKeys(
    launch,
    [
      "schema",
      "status",
      "gate",
      "stage_b_run_fingerprint",
      "stage_b_epoch_namespace",
      "stage_a_verified_receipt",
      "label",
      "uid",
      "xpc_service_name",
      "runner_pid",
      "working_directory",
      "stdout_path",
      "stderr_path",
      "program_arguments",
      "runner_utility_argv",
      "caffeinate_holder",
      "required_assertions",
      "launchctl_command",
      "launchctl_exit_code",
      "launchctl_stdout_base64",
      "launchctl_stderr_base64",
      "plist_source",
      "plist_snapshot_base64",
      "authority",
    ],
    `${context.gate} all-13 child LaunchAgent`,
  );
  const holder = object(
    launch.caffeinate_holder,
    `${context.gate} all-13 child holder`,
  );
  exactKeys(
    holder,
    ["pid", "parent_runner_pid", "assertion_owner_pid", "executable", "argv"],
    `${context.gate} all-13 child holder`,
  );
  const launchPlistSource = object(
    launch.plist_source,
    `${context.gate} all-13 child plist source`,
  );
  const launchctlRaw = Buffer.from(
    String(launch.launchctl_stdout_base64),
    "base64",
  );
  const launchctlStderr = Buffer.from(
    String(launch.launchctl_stderr_base64),
    "base64",
  );
  const plistRaw = Buffer.from(
    String(launch.plist_snapshot_base64),
    "base64",
  );
  if (
    launch.schema !==
      `shogi-halfkp81-depth18-yaneura-only-v1r11-${context.gate}-stage-b-launchagent-evidence-v1` ||
    launch.status !==
      "preformal-engine-gate-live-LaunchAgent-semantics-verified-no-standalone-authority" ||
    launch.gate !== context.gate ||
    launch.stage_b_run_fingerprint !== context.fingerprint ||
    launch.stage_b_epoch_namespace !== context.epochNamespace ||
    v1r11CanonicalJson(launch.stage_a_verified_receipt) !==
      v1r11CanonicalJson(context.stageAReceipt) ||
    launch.label !== job.label ||
    launch.uid !== uid ||
    launch.xpc_service_name !== job.label ||
    launch.runner_pid !== runnerPid ||
    launch.working_directory !== context.repositoryRoot ||
    launch.stdout_path !== job.stdoutPath ||
    launch.stderr_path !== job.stderrPath ||
    v1r11CanonicalJson(launch.program_arguments) !==
      v1r11CanonicalJson(job.programArguments) ||
    v1r11CanonicalJson(launch.runner_utility_argv) !==
      v1r11CanonicalJson(job.command) ||
    holder.pid !== holderPid ||
    holder.parent_runner_pid !== runnerPid ||
    holder.assertion_owner_pid !== holderPid ||
    holder.executable !== "/usr/bin/caffeinate" ||
    v1r11CanonicalJson(holder.argv) !==
      v1r11CanonicalJson(job.programArguments) ||
    v1r11CanonicalJson(launch.required_assertions) !==
      v1r11CanonicalJson(REQUIRED_ASSERTIONS) ||
    v1r11CanonicalJson(launch.launchctl_command) !==
      v1r11CanonicalJson([
        "/bin/launchctl",
        "print",
        `gui/${uid}/${job.label}`,
      ]) ||
    launch.launchctl_exit_code !== 0 ||
    launchctlRaw.byteLength < 1 ||
    launchctlRaw.toString("base64") !== launch.launchctl_stdout_base64 ||
    launchctlStderr.byteLength !== 0 ||
    launchctlStderr.toString("base64") !== launch.launchctl_stderr_base64 ||
    plistRaw.toString("base64") !== launch.plist_snapshot_base64 ||
    !plistRaw.equals(independentlyExpectedStageBPlist(job)) ||
    v1r11CanonicalJson(launchPlistSource) !==
      v1r11CanonicalJson(plistSource) ||
    v1r11CanonicalJson(launch.authority) !==
      v1r11CanonicalJson(FALSE_AUTHORITY)
  ) {
    throw new Error(`${context.gate} all-13 child LaunchAgent differs`);
  }
  const launchctlText = launchctlRaw.toString("utf8");
  const launchctlArgumentsStart = launchctlText.indexOf("\n\targuments = {\n");
  const launchctlArgumentsEnd = launchctlText.indexOf(
    "\n\t}\n",
    launchctlArgumentsStart + 1,
  );
  const launchctlArguments = launchctlText
    .slice(
      launchctlArgumentsStart + "\n\targuments = {\n".length,
      launchctlArgumentsEnd,
    )
    .split("\n")
    .map((line) => /^\t\t(.+)$/u.exec(line)?.[1] ?? "");
  if (
    !Buffer.from(launchctlText, "utf8").equals(launchctlRaw) ||
    !launchctlText.startsWith(`gui/${uid}/${job.label} = {\n`) ||
    launchctlArgumentsStart < 0 ||
    launchctlArgumentsEnd < 0 ||
    v1r11CanonicalJson(launchctlArguments) !==
      v1r11CanonicalJson(job.programArguments) ||
    independentlyLaunchctlValue(launchctlText, "path") !== job.plistPath ||
    independentlyLaunchctlValue(launchctlText, "type") !== "LaunchAgent" ||
    independentlyLaunchctlValue(launchctlText, "state") !== "running" ||
    independentlyLaunchctlValue(launchctlText, "program") !==
      "/usr/bin/caffeinate" ||
    independentlyLaunchctlValue(launchctlText, "working directory") !==
      context.repositoryRoot ||
    independentlyLaunchctlValue(launchctlText, "stdout path") !==
      job.stdoutPath ||
    independentlyLaunchctlValue(launchctlText, "stderr path") !==
      job.stderrPath ||
    independentlyLaunchctlValue(launchctlText, "pid") !== String(runnerPid) ||
    !independentlyLaunchctlValue(launchctlText, "properties")
      .split("|")
      .map((property) => property.trim())
      .includes("launch only once")
  ) {
    throw new Error(`${context.gate} all-13 launchctl differs`);
  }
  const gateResult = object(
    inner.gate_result,
    `${context.gate} all-13 gate result`,
  );
  if (context.gate === "mixed-load-gate") {
    if (!Array.isArray(gateResult.process_observations)) {
      throw new Error("mixed-load all-13 observations differ");
    }
    const mixedRows = independentlyValidateMixedLoadObservations(
      gateResult.process_observations,
      Number(gateResult.maximum_normal_active),
      Number(gateResult.maximum_fallback_active),
    );
    const projectedMixedRows = mixedRows.map((row) => ({
      pid: row.pid,
      ppid: row.ppid,
      pgid: row.pgid,
      start_token: row.start_token,
      command: row.command,
    }));
    const projectedOuterRows = outerEngineRows.map((row) => ({
      pid: row.pid,
      ppid: row.ppid,
      pgid: row.pgid,
      start_token: row.start_token,
      command: row.command,
    }));
    if (
      v1r11CanonicalJson(projectedMixedRows) !==
      v1r11CanonicalJson(projectedOuterRows)
    ) {
      throw new Error("mixed-load all-13 outer process set differs");
    }
  }
  if (!Array.isArray(inner.power_entries) || inner.power_entries.length < 2) {
    throw new Error(`${context.gate} all-13 power entries differ`);
  }
  return Object.freeze({
    gateResult,
    launchAgentEvidence: launch,
    observedAuxiliaryRows: outerAuxiliaryRows,
    powerEntries: inner.power_entries,
    pmsetInterval: object(
      inner.pmset_interval,
      `${context.gate} all-13 pmset interval`,
    ),
    verifier: object(inner.verifier, `${context.gate} all-13 verifier`),
    processCleanup: cleanup,
    osReapEvidence: osReap,
  });
}

export function verifyHalfkp81V1R11All13StageBPayloadForTests(
  gate:
    | "candidate-order-gate"
    | "known10-probe"
    | "pathological-fallback-probe"
    | "mixed-load-gate"
    | "formal-like-512",
  payload: Readonly<Record<string, unknown>>,
  rawGateResult: Readonly<Record<string, unknown>>,
  stageA: Readonly<V1R11AuthorityFileIdentity>,
  source2: Readonly<V1R11AuthorityFileIdentity>,
  source3: Readonly<V1R11AuthorityFileIdentity>,
): void {
  validateIndependentStageBPayload(
    gate,
    payload,
    rawGateResult,
    stageA,
    source2,
    source3,
  );
}

interface All13LaunchEvidenceContext {
  readonly repositoryRoot: string;
  readonly authorityDirectory: string;
  readonly homeDirectory: string;
  readonly expectedUid: number;
  readonly sourceRevision: string;
  readonly runFingerprint: string;
  readonly formalRunIntent?: Readonly<IndependentFormalRunIntentInput>;
  readonly teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
  readonly expectedNodePath: string;
}

interface All13ParsedLaunchEvidence {
  readonly value: Readonly<Record<string, unknown>>;
  readonly uid: number;
  readonly label: string;
  readonly runnerPid: number;
  readonly holderPid: number;
  readonly programArguments: readonly string[];
  readonly runnerUtilityArgv: readonly string[];
  readonly launchctlPrint: Readonly<V1R11AuthorityFileIdentity>;
  readonly launchctlStderr: Readonly<V1R11AuthorityFileIdentity>;
  readonly plistSnapshot: Readonly<V1R11AuthorityFileIdentity>;
  readonly plistSource: Readonly<Record<string, unknown>>;
  readonly psStdout: Readonly<V1R11AuthorityFileIdentity>;
  readonly psStderr: Readonly<V1R11AuthorityFileIdentity>;
  readonly runnerProcess: Readonly<Record<string, unknown>>;
  readonly assertionHolderProcess: Readonly<Record<string, unknown>>;
  readonly observedProcessGroupRows: readonly Readonly<Record<string, unknown>>[];
}

function all13LaunchProcessRow(
  value: unknown,
  role: "runner" | "assertion-holder",
  label: string,
): Readonly<Record<string, unknown>> {
  const row = object(value, label);
  exactKeys(
    row,
    ["pid", "ppid", "pgid", "lstart", "executable", "argv", "role"],
    label,
  );
  if (
    !safeInteger(row.pid, 1) ||
    !safeInteger(row.ppid, 0) ||
    !safeInteger(row.pgid, 1) ||
    typeof row.lstart !== "string" ||
    !PS_START_TOKEN_RE.test(row.lstart) ||
    typeof row.executable !== "string" ||
    row.executable.length < 1 ||
    typeof row.argv !== "string" ||
    row.argv.length < 1 ||
    row.role !== role
  ) {
    throw new Error(`${label} differs`);
  }
  return row;
}

function exactStringArray(value: unknown, label: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.some(
      (part) =>
        typeof part !== "string" ||
        part.length < 1 ||
        /[\u0000\r\n]/u.test(part),
    )
  ) {
    throw new Error(`${label} differs`);
  }
  return Object.freeze([...(value as readonly string[])]);
}

function exactLaunchArtifactIdentity(
  value: unknown,
  expectedPath: string,
  expectedSchema: string,
  minimumBytes: 0 | 1,
  label: string,
): Readonly<V1R11AuthorityFileIdentity> {
  const row = object(value, label);
  exactKeys(row, ["path", "bytes", "sha256", "schema"], label);
  if (
    row.path !== expectedPath ||
    !safeInteger(row.bytes, minimumBytes) ||
    !SHA256_RE.test(String(row.sha256)) ||
    row.schema !== expectedSchema
  ) {
    throw new Error(`${label} differs`);
  }
  return row as unknown as Readonly<V1R11AuthorityFileIdentity>;
}

function independentlyParseLaunchEvidence(
  value: unknown,
  context: Readonly<All13LaunchEvidenceContext>,
): Readonly<All13ParsedLaunchEvidence> {
  const independentlyComputedFingerprint =
    context.formalRunIntent === undefined
      ? context.runFingerprint
      : independentlyComputeFormalRunFingerprint(context.formalRunIntent);
  const evidence = object(value, "all-13 LaunchAgent evidence");
  exactKeys(
    evidence,
    [
      "schema",
      "status",
      "teacher_plan",
      "source_revision",
      "run_fingerprint",
      "observed_at_utc",
      "uid",
      "xpc_service_name",
      "label",
      "runner_pid",
      "working_directory",
      "stdout_path",
      "stderr_path",
      "program_arguments",
      "runner_utility_argv",
      "caffeinate_holder",
      "required_assertions",
      "launchctl_command",
      "launchctl_exit_code",
      "launchctl_print",
      "launchctl_stderr",
      "plist_source",
      "plist_snapshot",
      "ps_command",
      "ps_exit_code",
      "ps_stdout",
      "ps_stderr",
      "runner_process",
      "assertion_holder_process",
      "observed_process_group_rows",
      "observed_yaneuraou_engine_rows",
      "producer",
    ],
    "all-13 LaunchAgent evidence",
  );
  if (
    !path.isAbsolute(context.repositoryRoot) ||
    path.normalize(context.repositoryRoot) !== context.repositoryRoot ||
    !path.isAbsolute(context.authorityDirectory) ||
    path.normalize(context.authorityDirectory) !== context.authorityDirectory ||
    !path.isAbsolute(context.homeDirectory) ||
    path.normalize(context.homeDirectory) !== context.homeDirectory ||
    !path.isAbsolute(context.expectedNodePath) ||
    path.normalize(context.expectedNodePath) !== context.expectedNodePath ||
    !safeInteger(context.expectedUid, 1) ||
    !REVISION_RE.test(context.sourceRevision) ||
    !SHA256_RE.test(context.runFingerprint) ||
    independentlyComputedFingerprint !== context.runFingerprint
  ) {
    throw new Error("all-13 LaunchAgent context differs");
  }
  const label = `com.meetyudai.shogi.halfkp81-depth18-yaneura-only-v1r11-${context.sourceRevision.slice(0, 8)}`;
  const runnerPid = Number(evidence.runner_pid);
  const programArguments = exactStringArray(
    evidence.program_arguments,
    "all-13 LaunchAgent ProgramArguments",
  );
  const runnerUtilityArgv = exactStringArray(
    evidence.runner_utility_argv,
    "all-13 LaunchAgent runner argv",
  );
  const expectedRunner = Object.freeze([
    context.expectedNodePath,
    "-r",
    path.join(context.repositoryRoot, "node_modules/tsx/dist/cjs/index.cjs"),
    path.join(
      context.repositoryRoot,
      "ml/run-halfkp81-depth18-v1r11-formal-child.ts",
    ),
  ]);
  const expectedProgram = expectedRunner;
  const holder = object(
    evidence.caffeinate_holder,
    "all-13 LaunchAgent caffeinate holder",
  );
  exactKeys(
    holder,
    ["pid", "parent_runner_pid", "assertion_owner_pid", "executable", "argv"],
    "all-13 LaunchAgent caffeinate holder",
  );
  const holderPid = Number(holder.pid);
  const expectedHolder = Object.freeze([
    "/usr/bin/caffeinate",
    "-dimsu",
    "-w",
    String(runnerPid),
  ]);
  const runnerProcess = all13LaunchProcessRow(
    evidence.runner_process,
    "runner",
    "all-13 LaunchAgent runner process",
  );
  const assertionHolderProcess = all13LaunchProcessRow(
    evidence.assertion_holder_process,
    "assertion-holder",
    "all-13 LaunchAgent assertion-holder process",
  );
  if (
    evidence.schema !== LAUNCH_SCHEMA ||
    evidence.status !==
      "live-one-shot-LaunchAgent-semantics-verified-no-standalone-formal-authority" ||
    v1r11CanonicalJson(evidence.teacher_plan) !==
      v1r11CanonicalJson(context.teacherPlan) ||
    evidence.source_revision !== context.sourceRevision ||
    evidence.run_fingerprint !== context.runFingerprint ||
    !ISO_UTC_RE.test(String(evidence.observed_at_utc)) ||
    new Date(String(evidence.observed_at_utc)).toISOString() !==
      evidence.observed_at_utc ||
    evidence.uid !== context.expectedUid ||
    evidence.label !== label ||
    evidence.xpc_service_name !== label ||
    !safeInteger(runnerPid, 1) ||
    evidence.working_directory !== context.repositoryRoot ||
    typeof evidence.stdout_path !== "string" ||
    !path.isAbsolute(evidence.stdout_path) ||
    path.normalize(evidence.stdout_path) !== evidence.stdout_path ||
    typeof evidence.stderr_path !== "string" ||
    !path.isAbsolute(evidence.stderr_path) ||
    path.normalize(evidence.stderr_path) !== evidence.stderr_path ||
    evidence.stdout_path === evidence.stderr_path ||
    v1r11CanonicalJson(runnerUtilityArgv) !==
      v1r11CanonicalJson(expectedRunner) ||
    v1r11CanonicalJson(programArguments) !==
      v1r11CanonicalJson(expectedProgram) ||
    !safeInteger(holderPid, 1) ||
    holderPid === runnerPid ||
    holder.parent_runner_pid !== runnerPid ||
    holder.assertion_owner_pid !== holderPid ||
    holder.executable !== "/usr/bin/caffeinate" ||
    v1r11CanonicalJson(holder.argv) !== v1r11CanonicalJson(expectedHolder) ||
    v1r11CanonicalJson(evidence.required_assertions) !==
      v1r11CanonicalJson(REQUIRED_ASSERTIONS) ||
    v1r11CanonicalJson(evidence.launchctl_command) !==
      v1r11CanonicalJson([
        "/bin/launchctl",
        "print",
        `gui/${String(context.expectedUid)}/${label}`,
      ]) ||
    evidence.launchctl_exit_code !== 0 ||
    v1r11CanonicalJson(evidence.ps_command) !==
      v1r11CanonicalJson(V1R11_FINAL_LAUNCH_PS_COMMAND) ||
    evidence.ps_exit_code !== 0 ||
    runnerProcess.pid !== runnerPid ||
    runnerProcess.pgid !== runnerPid ||
    runnerProcess.executable !== context.expectedNodePath ||
    runnerProcess.argv !== runnerUtilityArgv.join(" ") ||
    assertionHolderProcess.pid !== holderPid ||
    assertionHolderProcess.ppid !== runnerPid ||
    assertionHolderProcess.pgid !== runnerPid ||
    assertionHolderProcess.executable !== "/usr/bin/caffeinate" ||
    assertionHolderProcess.argv !== expectedHolder.join(" ") ||
    !Array.isArray(evidence.observed_process_group_rows) ||
    v1r11CanonicalJson(evidence.observed_process_group_rows) !==
      v1r11CanonicalJson([runnerProcess, assertionHolderProcess]) ||
    !Array.isArray(evidence.observed_yaneuraou_engine_rows) ||
    evidence.observed_yaneuraou_engine_rows.length !== 0
  ) {
    throw new Error("all-13 LaunchAgent semantics differ");
  }
  const print = exactLaunchArtifactIdentity(
    evidence.launchctl_print,
    path.join(context.authorityDirectory, "launchagent-launchctl-print.txt"),
    "text/plain-utf8-exact-command-stdout",
    1,
    "all-13 launchctl stdout identity",
  );
  const stderr = exactLaunchArtifactIdentity(
    evidence.launchctl_stderr,
    path.join(
      context.authorityDirectory,
      "launchagent-launchctl-print.stderr.txt",
    ),
    "text/plain-utf8-exact-command-stderr",
    0,
    "all-13 launchctl stderr identity",
  );
  const plist = exactLaunchArtifactIdentity(
    evidence.plist_snapshot,
    path.join(context.authorityDirectory, "launchagent.plist.snapshot"),
    "application/x-apple-aspen-config-exact-bytes",
    1,
    "all-13 plist identity",
  );
  if (
    context.formalRunIntent !== undefined &&
    v1r11CanonicalJson(context.formalRunIntent.plannedFinalDescriptor) !==
      v1r11CanonicalJson(plist)
  ) {
    throw new Error("all-13 planned descriptor identity differs");
  }
  const psStdout = exactLaunchArtifactIdentity(
    evidence.ps_stdout,
    path.join(context.authorityDirectory, "launchagent-ps.stdout.txt"),
    "text/plain-exact-launchagent-ps-stdout",
    1,
    "all-13 ps stdout identity",
  );
  const psStderr = exactLaunchArtifactIdentity(
    evidence.ps_stderr,
    path.join(context.authorityDirectory, "launchagent-ps.stderr.txt"),
    "text/plain-exact-launchagent-ps-stderr",
    0,
    "all-13 ps stderr identity",
  );
  const plistSource = object(
    evidence.plist_source,
    "all-13 LaunchAgent plist source",
  );
  exactKeys(
    plistSource,
    [
      "plist_path",
      "realpath",
      "dev",
      "ino",
      "uid",
      "mode",
      "nlink",
      "bytes",
      "sha256",
    ],
    "all-13 LaunchAgent plist source",
  );
  const expectedPlistPath = path.join(
    context.homeDirectory,
    "Library/LaunchAgents",
    `${label}.plist`,
  );
  if (
    plistSource.plist_path !== expectedPlistPath ||
    plistSource.realpath !== expectedPlistPath ||
    !safeInteger(plistSource.dev, 1) ||
    !safeInteger(plistSource.ino, 1) ||
    plistSource.uid !== context.expectedUid ||
    plistSource.mode !== 0o600 ||
    plistSource.nlink !== 1 ||
    plistSource.bytes !== plist.bytes ||
    plistSource.sha256 !== plist.sha256
  ) {
    throw new Error("all-13 LaunchAgent plist source differs");
  }
  const producer = object(evidence.producer, "all-13 LaunchAgent producer");
  exactKeys(
    producer,
    ["source_revision", "entrypoint", "dependency_closure"],
    "all-13 LaunchAgent producer",
  );
  if (
    producer.source_revision !== context.sourceRevision ||
    producer.entrypoint !== V1R11_FINAL_LAUNCH_PRODUCER_ENTRYPOINT ||
    !Array.isArray(producer.dependency_closure) ||
    producer.dependency_closure.length < 1
  ) {
    throw new Error("all-13 LaunchAgent producer differs");
  }
  const closurePaths = producer.dependency_closure.map((value, index) => {
    const entry = object(value, `all-13 LaunchAgent closure ${index}`);
    exactKeys(
      entry,
      ["path", "bytes", "sha256"],
      `all-13 LaunchAgent closure ${index}`,
    );
    if (
      typeof entry.path !== "string" ||
      path.isAbsolute(entry.path) ||
      path.posix.normalize(entry.path) !== entry.path ||
      entry.path.startsWith("../") ||
      entry.path.includes("/../") ||
      !safeInteger(entry.bytes, 1) ||
      !SHA256_RE.test(String(entry.sha256))
    ) {
      throw new Error(`all-13 LaunchAgent closure ${index} differs`);
    }
    return entry.path;
  });
  if (
    closurePaths[0] !== V1R11_FINAL_LAUNCH_PRODUCER_ENTRYPOINT ||
    new Set(closurePaths).size !== closurePaths.length ||
    v1r11CanonicalJson(closurePaths.slice(1)) !==
      v1r11CanonicalJson([...closurePaths.slice(1)].sort())
  ) {
    throw new Error("all-13 LaunchAgent producer closure order differs");
  }
  return Object.freeze({
    value: evidence,
    uid: context.expectedUid,
    label,
    runnerPid,
    holderPid,
    programArguments,
    runnerUtilityArgv,
    launchctlPrint: print,
    launchctlStderr: stderr,
    plistSnapshot: plist,
    plistSource,
    psStdout,
    psStderr,
    runnerProcess,
    assertionHolderProcess,
    observedProcessGroupRows: Object.freeze([
      runnerProcess,
      assertionHolderProcess,
    ]),
  });
}

function independentlyParseFinalLaunchPs(
  raw: Buffer,
): readonly Readonly<Record<string, unknown>>[] {
  const text = raw.toString("utf8");
  if (
    !Buffer.from(text, "utf8").equals(raw) ||
    (text.length > 0 && !text.endsWith("\n"))
  ) {
    throw new Error("all-13 sealed ps is not exact UTF-8 LF text");
  }
  const rows: Readonly<Record<string, unknown>>[] = [];
  for (const [index, line] of text.split("\n").slice(0, -1).entries()) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4})\s+(.+)$/u.exec(
      line,
    );
    if (match === null) {
      throw new Error(`all-13 sealed ps row ${index + 1} is ambiguous`);
    }
    const row = Object.freeze({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      lstart: match[4]!,
      executable: /^(\S+)(?:\s|$)/u.exec(match[5]!)?.[1] ?? "",
      argv: match[5]!,
    });
    if (
      !safeInteger(row.pid, 1) ||
      !safeInteger(row.ppid, 0) ||
      !safeInteger(row.pgid, 1) ||
      !PS_START_TOKEN_RE.test(row.lstart) ||
      rows.some((prior) => prior.pid === row.pid)
    ) {
      throw new Error(`all-13 sealed ps row ${index + 1} differs`);
    }
    rows.push(row);
  }
  return Object.freeze(rows);
}

function independentlyVerifySealedLaunchPs(
  stdout: Buffer,
  stderr: Buffer,
  evidence: Readonly<All13ParsedLaunchEvidence>,
): void {
  if (
    stdout.byteLength !== evidence.psStdout.bytes ||
    v1r11Sha256(stdout) !== evidence.psStdout.sha256 ||
    stderr.byteLength !== evidence.psStderr.bytes ||
    v1r11Sha256(stderr) !== evidence.psStderr.sha256 ||
    stderr.byteLength !== 0
  ) {
    throw new Error("all-13 sealed ps raw identity differs");
  }
  const rows = independentlyParseFinalLaunchPs(stdout);
  const runnerRows = rows.filter((row) => row.pid === evidence.runnerPid);
  const holderRows = rows.filter((row) => row.pid === evidence.holderPid);
  const runner = { ...runnerRows[0], role: "runner" };
  const holder = { ...holderRows[0], role: "assertion-holder" };
  const group = rows
    .filter((row) => row.pgid === evidence.runnerPid)
    .map((row) =>
      row.pid === evidence.runnerPid
        ? { ...row, role: "runner" }
        : row.pid === evidence.holderPid
          ? { ...row, role: "assertion-holder" }
          : row,
    );
  if (
    runnerRows.length !== 1 ||
    holderRows.length !== 1 ||
    v1r11CanonicalJson(runner) !==
      v1r11CanonicalJson(evidence.runnerProcess) ||
    v1r11CanonicalJson(holder) !==
      v1r11CanonicalJson(evidence.assertionHolderProcess) ||
    v1r11CanonicalJson(group) !==
      v1r11CanonicalJson(evidence.observedProcessGroupRows) ||
    rows.some(
      (row) =>
        row.executable === V1R11_FORMAL_ENGINE_PATH ||
        row.argv === V1R11_FORMAL_ENGINE_PATH ||
        String(row.argv).startsWith(`${V1R11_FORMAL_ENGINE_PATH} `),
    )
  ) {
    throw new Error("all-13 sealed ps process topology differs");
  }
}

function independentlyLaunchctlValue(raw: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const matches = [
    ...raw.matchAll(new RegExp(`^\\t${escaped} = (.+)$`, "gmu")),
  ];
  if (matches.length !== 1 || matches[0]?.[1] === undefined) {
    throw new Error(`all-13 launchctl ${key} differs`);
  }
  return matches[0][1];
}

function independentlyVerifyLaunchctl(
  raw: Buffer,
  evidence: Readonly<All13ParsedLaunchEvidence>,
): void {
  const text = raw.toString("utf8");
  if (
    !Buffer.from(text, "utf8").equals(raw) ||
    !text.startsWith(`gui/${evidence.uid}/${evidence.label} = {\n`)
  ) {
    throw new Error("all-13 launchctl header differs");
  }
  const start = text.indexOf("\n\targuments = {\n");
  const end = text.indexOf("\n\t}\n", start + 1);
  if (
    start < 0 ||
    end < 0 ||
    text.indexOf("\n\targuments = {\n", start + 1) !== -1
  ) {
    throw new Error("all-13 launchctl arguments block differs");
  }
  const arguments_ = text
    .slice(start + "\n\targuments = {\n".length, end)
    .split("\n")
    .map((line) => /^\t\t(.+)$/u.exec(line)?.[1] ?? "");
  const properties = independentlyLaunchctlValue(text, "properties")
    .split("|")
    .map((value) => value.trim());
  if (
    v1r11CanonicalJson(arguments_) !==
      v1r11CanonicalJson(evidence.programArguments) ||
    independentlyLaunchctlValue(text, "state") !== "running" ||
    independentlyLaunchctlValue(text, "type") !== "LaunchAgent" ||
    independentlyLaunchctlValue(text, "program") !==
      evidence.runnerUtilityArgv[0] ||
    independentlyLaunchctlValue(text, "path") !==
      evidence.plistSource.plist_path ||
    independentlyLaunchctlValue(text, "working directory") !==
      evidence.value.working_directory ||
    independentlyLaunchctlValue(text, "stdout path") !==
      evidence.value.stdout_path ||
    independentlyLaunchctlValue(text, "stderr path") !==
      evidence.value.stderr_path ||
    independentlyLaunchctlValue(text, "pid") !== String(evidence.runnerPid) ||
    !properties.includes("runatload") ||
    !properties.includes("launch only once")
  ) {
    throw new Error("all-13 launchctl semantics differ");
  }
}

function independentlyXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function independentlyExpectedPlist(
  evidence: Readonly<All13ParsedLaunchEvidence>,
): Buffer {
  const string = (value: string) =>
    `    <string>${independentlyXml(value)}</string>`;
  return Buffer.from(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      "<dict>",
      "  <key>Label</key>",
      string(evidence.label),
      "  <key>ProgramArguments</key>",
      "  <array>",
      ...evidence.programArguments.map(string),
      "  </array>",
      "  <key>WorkingDirectory</key>",
      string(String(evidence.value.working_directory)),
      "  <key>StandardOutPath</key>",
      string(String(evidence.value.stdout_path)),
      "  <key>StandardErrorPath</key>",
      string(String(evidence.value.stderr_path)),
      "  <key>RunAtLoad</key>",
      "  <true/>",
      "  <key>KeepAlive</key>",
      "  <false/>",
      "  <key>LaunchOnlyOnce</key>",
      "  <true/>",
      "  <key>Umask</key>",
      "  <integer>63</integer>",
      "  <key>AbandonProcessGroup</key>",
      "  <false/>",
      "</dict>",
      "</plist>",
      "",
    ].join("\n"),
    "utf8",
  );
}

export function verifyHalfkp81V1R11All13LaunchEvidenceForTests(
  value: unknown,
  context: Readonly<All13LaunchEvidenceContext>,
  launchctlRaw: Buffer,
  launchctlStderrRaw: Buffer,
  plistRaw: Buffer,
  sealedPsStdout: Buffer,
  sealedPsStderr: Buffer,
  livePsRaw?: Buffer,
): void {
  if (/[0-9a-f]{64}/u.test(plistRaw.toString("utf8"))) {
    throw new Error("all-13 planned descriptor contains a fingerprint");
  }
  const parsed = independentlyParseLaunchEvidence(value, context);
  if (
    launchctlRaw.byteLength !== parsed.launchctlPrint.bytes ||
    v1r11Sha256(launchctlRaw) !== parsed.launchctlPrint.sha256 ||
    launchctlStderrRaw.byteLength !== parsed.launchctlStderr.bytes ||
    v1r11Sha256(launchctlStderrRaw) !== parsed.launchctlStderr.sha256 ||
    plistRaw.byteLength !== parsed.plistSnapshot.bytes ||
    v1r11Sha256(plistRaw) !== parsed.plistSnapshot.sha256
  ) {
    throw new Error("all-13 LaunchAgent raw identity differs");
  }
  independentlyVerifyLaunchctl(launchctlRaw, parsed);
  if (!plistRaw.equals(independentlyExpectedPlist(parsed))) {
    throw new Error("all-13 LaunchAgent plist policy differs");
  }
  independentlyVerifySealedLaunchPs(sealedPsStdout, sealedPsStderr, parsed);
  if (livePsRaw !== undefined) {
    independentlyVerifyLiveLaunchPs(livePsRaw, parsed);
  }
}

function independentlyVerifyLiveLaunchPs(
  raw: Buffer,
  evidence: Readonly<All13ParsedLaunchEvidence>,
): Readonly<{
  runner: ReturnType<typeof all13StageBProcessRow>;
  holder: ReturnType<typeof all13StageBProcessRow>;
  rows: ReturnType<typeof independentlyParseStageBPs>;
}> {
  const rows = independentlyParseStageBPs(raw, "all-13 live LaunchAgent ps");
  const runners = rows.filter((row) => row.pid === evidence.runnerPid);
  const holders = rows.filter((row) => row.pid === evidence.holderPid);
  const groupRows = rows.filter((row) => row.pgid === evidence.runnerPid);
  const descendants = all13CleanupDescendants(rows, evidence.runnerPid);
  const expectedRunnerCommand = evidence.runnerUtilityArgv.join(" ");
  const expectedHolderCommand = [
    "/usr/bin/caffeinate",
    "-dimsu",
    "-w",
    String(evidence.runnerPid),
  ].join(" ");
  if (
    runners.length !== 1 ||
    holders.length !== 1 ||
    runners[0]!.pgid !== evidence.runnerPid ||
    runners[0]!.state.startsWith("Z") ||
    runners[0]!.command !== expectedRunnerCommand ||
    holders[0]!.ppid !== evidence.runnerPid ||
    holders[0]!.pgid !== evidence.runnerPid ||
    holders[0]!.state.startsWith("Z") ||
    holders[0]!.command !== expectedHolderCommand ||
    groupRows.length !== 2 ||
    groupRows.some(
      (row) => row.pid !== evidence.runnerPid && row.pid !== evidence.holderPid,
    ) ||
    descendants.length !== 1 ||
    descendants[0]!.pid !== evidence.holderPid ||
    rows.some((row) =>
      /\/YaneuraOu-authenticated-snapshot(?:\s|$)/u.test(row.command) ||
      row.command === V1R11_FORMAL_ENGINE_PATH ||
      row.command.startsWith(`${V1R11_FORMAL_ENGINE_PATH} `),
    )
  ) {
    throw new Error("all-13 live LaunchAgent process topology differs");
  }
  return Object.freeze({
    runner: runners[0]!,
    holder: holders[0]!,
    rows,
  });
}

function independentlyParseBattery(raw: Buffer) {
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw)) {
    throw new Error("all-13 battery snapshot is not exact UTF-8");
  }
  const sources = [...text.matchAll(/^Now drawing from '([^'\r\n]+)'\s*$/gmu)];
  const percentages = [
    ...text.matchAll(/^\s*-[^\r\n]+\s+(\d{1,3})%;[^\r\n]*$/gmu),
  ];
  if (
    sources.length !== 1 ||
    percentages.length !== 1 ||
    sources[0]?.[1] === undefined ||
    percentages[0]?.[1] === undefined
  ) {
    throw new Error("all-13 battery snapshot is ambiguous");
  }
  const percentage = Number(percentages[0][1]);
  if (!safeInteger(percentage, 0) || percentage > 100) {
    throw new Error("all-13 battery percentage differs");
  }
  return Object.freeze({ source: sources[0][1], percentage });
}

function independentlyParseAssertions(raw: Buffer, ownerPid: number): void {
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw) || !safeInteger(ownerPid, 1)) {
    throw new Error("all-13 assertion snapshot differs");
  }
  const sections = text.split(/^Listed by owning process:\s*$/mu);
  if (sections.length !== 2) {
    throw new Error("all-13 assertion sections differ");
  }
  const system = new Map<string, number>();
  for (const line of sections[0]!.split(/\r?\n/u)) {
    const match = /^\s{3}([A-Za-z][A-Za-z0-9]+)\s+([01])\s*$/u.exec(line);
    if (match === null) continue;
    if (system.has(match[1]!)) {
      throw new Error("all-13 assertion system value is ambiguous");
    }
    system.set(match[1]!, Number(match[2]));
  }
  const owned = new Map<string, number>();
  for (const line of sections[1]!.split(/\r?\n/u)) {
    const match =
      /^\s*pid\s+(\d+)\(([^)]+)\):\s+\[0x[0-9a-fA-F]+\]\s+(?:\d+:\d{2}:\d{2}\s+)?([A-Za-z][A-Za-z0-9]+)\s+named:\s+(["'])(.*?)\4\s*$/u.exec(
        line,
      );
    if (match === null || Number(match[1]) !== ownerPid) continue;
    if (
      match[2] !== "caffeinate" ||
      match[5] !== "caffeinate command-line tool"
    ) {
      throw new Error("all-13 assertion owner differs");
    }
    owned.set(match[3]!, (owned.get(match[3]!) ?? 0) + 1);
  }
  for (const assertion of REQUIRED_ASSERTIONS) {
    if (system.get(assertion) !== 1 || owned.get(assertion) !== 1) {
      throw new Error(`all-13 assertion ${assertion} differs`);
    }
  }
}

function independentlyDecodeCommandContent(
  value: unknown,
  label: string,
): Readonly<{
  content: Readonly<Record<string, unknown>>;
  payload: Readonly<Record<string, unknown>>;
  stdout: Buffer;
  stderr: Buffer;
}> {
  const content = object(value, `${label} command bundle`);
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
    `${label} command bundle`,
  );
  const decode = (stream: "stdout" | "stderr") => {
    const encoded = content[`${stream}_base64`];
    if (typeof encoded !== "string") {
      throw new Error(`${label} ${stream} differs`);
    }
    const raw = Buffer.from(encoded, "base64");
    if (
      raw.toString("base64") !== encoded ||
      raw.byteLength !== content[`${stream}_bytes`] ||
      v1r11Sha256(raw) !== content[`${stream}_sha256`]
    ) {
      throw new Error(`${label} ${stream} identity differs`);
    }
    return raw;
  };
  const stdout = decode("stdout");
  const stderr = decode("stderr");
  if (content.exit_code !== 0) throw new Error(`${label} exit code differs`);
  const payload = parseV1R11CanonicalObject(stdout, `${label} stdout`);
  if (
    v1r11CanonicalJson(payload) !==
    v1r11CanonicalJson(content.parsed_canonical_json)
  ) {
    throw new Error(`${label} parsed payload differs`);
  }
  return Object.freeze({ content, payload, stdout, stderr });
}

function independentlyValidateGate13Payload(
  payload: Readonly<Record<string, unknown>>,
  content: Readonly<Record<string, unknown>>,
  launchIdentity: Readonly<V1R11AuthorityFileIdentity>,
  launchEvidence: Readonly<All13ParsedLaunchEvidence>,
  sealedLaunchctl: Buffer,
): void {
  exactKeys(
    payload,
    [
      "power_source",
      "battery_percentage",
      "required_assertions",
      "assertion_owner_matches_caffeinate_pid",
      "launchagent_authority",
      "power_admission_preimage",
      "observed_at_utc",
    ],
    "all-13 gate13 payload",
  );
  const preimage = object(
    payload.power_admission_preimage,
    "all-13 gate13 preimage",
  );
  exactKeys(
    preimage,
    [
      "schema",
      "status",
      "commands",
      "battery_stdout_base64",
      "battery_stdout_bytes",
      "battery_stdout_sha256",
      "assertions_stdout_base64",
      "assertions_stdout_bytes",
      "assertions_stdout_sha256",
      "launchctl_stdout_base64",
      "launchctl_stdout_bytes",
      "launchctl_stdout_sha256",
      "runner_pid",
      "caffeinate_assertion_holder_pid",
      "assertion_owner_caffeinate_pid",
      "observed_at_utc",
    ],
    "all-13 gate13 preimage",
  );
  const commands = Object.freeze([
    Object.freeze(["/usr/bin/pmset", "-g", "batt"]),
    Object.freeze(["/usr/bin/pmset", "-g", "assertions"]),
    Object.freeze([
      "/bin/launchctl",
      "print",
      `gui/${String(launchEvidence.uid)}/${launchEvidence.label}`,
    ]),
  ]);
  const raw = (name: "battery" | "assertions" | "launchctl") => {
    const encoded = preimage[`${name}_stdout_base64`];
    if (typeof encoded !== "string") {
      throw new Error(`all-13 gate13 ${name} encoding differs`);
    }
    const bytes = Buffer.from(encoded, "base64");
    if (
      bytes.toString("base64") !== encoded ||
      bytes.byteLength !== preimage[`${name}_stdout_bytes`] ||
      v1r11Sha256(bytes) !== preimage[`${name}_stdout_sha256`]
    ) {
      throw new Error(`all-13 gate13 ${name} identity differs`);
    }
    return bytes;
  };
  const batteryRaw = raw("battery");
  const assertionsRaw = raw("assertions");
  const launchctlRaw = raw("launchctl");
  const battery = independentlyParseBattery(batteryRaw);
  independentlyParseAssertions(assertionsRaw, launchEvidence.holderPid);
  if (
    preimage.schema !==
      "shogi-halfkp81-depth18-yaneura-only-v1r11-formal-power-admission-preimage-v1" ||
    preimage.status !== "fresh-fixed-raw-capture-no-formal-authority" ||
    v1r11CanonicalJson(preimage.commands) !== v1r11CanonicalJson(commands) ||
    v1r11CanonicalJson(content.request_or_command) !==
      v1r11CanonicalJson(commands.flat()) ||
    preimage.runner_pid !== launchEvidence.runnerPid ||
    preimage.caffeinate_assertion_holder_pid !== launchEvidence.holderPid ||
    preimage.assertion_owner_caffeinate_pid !== launchEvidence.holderPid ||
    preimage.observed_at_utc !== payload.observed_at_utc ||
    payload.power_source !== "AC Power" ||
    battery.source !== payload.power_source ||
    !safeInteger(payload.battery_percentage, 80) ||
    Number(payload.battery_percentage) > 100 ||
    battery.percentage !== payload.battery_percentage ||
    v1r11CanonicalJson(payload.required_assertions) !==
      v1r11CanonicalJson(REQUIRED_ASSERTIONS) ||
    payload.assertion_owner_matches_caffeinate_pid !== true ||
    v1r11CanonicalJson(payload.launchagent_authority) !==
      v1r11CanonicalJson(launchIdentity) ||
    !launchctlRaw.equals(sealedLaunchctl)
  ) {
    throw new Error("all-13 gate13 semantics differ");
  }
  iso(payload.observed_at_utc, "all-13 gate13 observed_at_utc");
}

function independentlyValidateGate13Collector(
  decoded: ReturnType<typeof independentlyDecodeCommandContent>,
): void {
  const collector = object(
    decoded.content.collector,
    "all-13 gate13 collector",
  );
  exactKeys(
    collector,
    ["schema", "status", "entrypoint"],
    "all-13 gate13 collector",
  );
  if (
    collector.schema !==
      "shogi-halfkp81-depth18-yaneura-only-v1r11-fixed-stage-c-live-collector-v1" ||
    collector.status !== "fixed-production-collector" ||
    collector.entrypoint !==
      "ml/produce-halfkp81-depth18-v1r11-stage-bc.ts" ||
    decoded.stderr.byteLength !== 0
  ) {
    throw new Error("all-13 gate13 collector differs");
  }
}

export function verifyHalfkp81V1R11All13Gate13ForTests(
  commandContent: unknown,
  launchIdentity: Readonly<V1R11AuthorityFileIdentity>,
  launchEvidenceValue: unknown,
  launchContext: Readonly<All13LaunchEvidenceContext>,
  sealedLaunchctl: Buffer,
): Readonly<Record<string, unknown>> {
  const decoded = independentlyDecodeCommandContent(
    commandContent,
    "all-13 gate13",
  );
  const launchEvidence = independentlyParseLaunchEvidence(
    launchEvidenceValue,
    launchContext,
  );
  independentlyValidateGate13Collector(decoded);
  independentlyValidateGate13Payload(
    decoded.payload,
    decoded.content,
    launchIdentity,
    launchEvidence,
    sealedLaunchctl,
  );
  return decoded.payload;
}

async function independentlyVerifyStageAPrefixInAll13(
  request: Readonly<{
    repositoryRoot: string;
    authorityDirectory: string;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    gateDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
    fullLedgerRaw: Buffer;
    rows: readonly Readonly<Record<string, unknown>>[];
  }>,
): Promise<
  Readonly<{
    payloads: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
    gateSummaries: Readonly<Record<string, unknown>>;
    stageA: Readonly<Record<string, unknown>>;
    previousEntrySha256: string;
    previousReceiptSha256: string;
  }>
> {
  if (
    request.stageAReceipt.path !==
      path.join(
        request.authorityDirectory,
        "preformal-engine-gate-authority-verified-receipt.json",
      ) ||
    request.stageAReceipt.schema !== STAGE_A_SCHEMA
  ) {
    throw new Error("all-13 Stage A receipt identity differs");
  }
  const raw = await readV1R11HeldIdentity(
    request.stageAReceipt,
    STAGE_A_SCHEMA,
    "all-13 Stage A receipt",
  );
  const stageA = parseV1R11CanonicalObject(raw, "all-13 Stage A receipt");
  exactKeys(
    stageA,
    [
      "schema",
      "status",
      "teacher_plan",
      "source_revision",
      "run_fingerprint",
      "ledger_prefix",
      "verified_gates",
      "verifier",
      "authority",
    ],
    "all-13 Stage A receipt",
  );
  const ledgerPrefix = identity(
    stageA.ledger_prefix,
    LEDGER_SCHEMA,
    "all-13 Stage A ledger prefix",
  );
  const expectedPrefixPath = path.join(
    request.authorityDirectory,
    "preformal-authority-ledger.jsonl",
  );
  const expectedPrefixRaw = Buffer.from(
    `${request.rows.slice(0, 7).map((row) => v1r11CanonicalJson(row)).join("\n")}\n`,
    "utf8",
  );
  if (
    stageA.schema !== STAGE_A_SCHEMA ||
    stageA.status !==
      "control-plane-gates-independently-verified-preformal-engine-only-authority" ||
    v1r11CanonicalJson(stageA.teacher_plan) !==
      v1r11CanonicalJson(request.teacherPlan) ||
    stageA.source_revision !== request.sourceRevision ||
    stageA.run_fingerprint !== request.runFingerprint ||
    ledgerPrefix.path !== expectedPrefixPath ||
    ledgerPrefix.bytes !== expectedPrefixRaw.byteLength ||
    ledgerPrefix.sha256 !== v1r11Sha256(expectedPrefixRaw) ||
    ledgerPrefix.bytes >= request.fullLedgerRaw.byteLength ||
    request.fullLedgerRaw[ledgerPrefix.bytes - 1] !== 0x0a ||
    v1r11Sha256(request.fullLedgerRaw.subarray(0, ledgerPrefix.bytes)) !==
      ledgerPrefix.sha256 ||
    v1r11CanonicalJson(stageA.authority) !==
      v1r11CanonicalJson(STAGE_A_AUTHORITY)
  ) {
    throw new Error("all-13 Stage A prefix binding differs");
  }
  const expectedStageAVerifier = implementationIdentity(
    request.repositoryRoot,
    request.sourceRevision,
    "ml/verify-halfkp81-depth18-v1r11-stage-a.ts",
    [
      "ml/verify-halfkp81-depth18-v1r11-stage-a.ts",
      "ml/halfkp81-depth18-v1r11-authority-io.ts",
    ],
  );
  if (
    v1r11CanonicalJson(stageA.verifier) !==
    v1r11CanonicalJson(expectedStageAVerifier)
  ) {
    throw new Error("all-13 Stage A verifier closure differs");
  }
  const expectedProducer = implementationIdentity(
    request.repositoryRoot,
    request.sourceRevision,
    "ml/produce-halfkp81-depth18-v1r11-preformal-gates.ts",
    [
      "ml/produce-halfkp81-depth18-v1r11-preformal-gates.ts",
      "ml/halfkp81-depth18-v1r11-authority-io.ts",
      "ml/halfkp81-depth18-v1r11-preformal-fault.ts",
    ],
  );
  const summaries = object(stageA.verified_gates, "all-13 Stage A summaries");
  exactKeys(summaries, GATES.slice(0, 7), "all-13 Stage A summaries");
  const payloads = new Map<string, Readonly<Record<string, unknown>>>();
  const gateSummaries: Record<string, unknown> = {};
  let previousEntry: string | null = null;
  let previousReceipt: string | null = null;
  for (let offset = 0; offset < 7; offset += 1) {
    const gate = GATES[offset]!;
    const sequence = offset + 1;
    const prefix = String(sequence).padStart(2, "0");
    const row = request.rows[offset]!;
    exactKeys(
      row,
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
      `${gate} all-13 ledger row`,
    );
    const { entry_sha256: entryDigest, ...entryPreimage } = row;
    if (
      row.schema !== LEDGER_SCHEMA ||
      row.sequence !== sequence ||
      row.gate !== gate ||
      row.previous_entry_sha256 !== previousEntry ||
      v1r11CanonicalJson(row.teacher_plan) !==
        v1r11CanonicalJson(request.teacherPlan) ||
      row.source_revision !== request.sourceRevision ||
      row.run_fingerprint !== request.runFingerprint ||
      row.status !== "pass-no-formal-authority" ||
      v1r11CanonicalJson(row.producer) !==
        v1r11CanonicalJson(expectedProducer) ||
      entryDigest !==
        v1r11Sha256(`${LEDGER_DOMAIN}${v1r11CanonicalJson(entryPreimage)}`)
    ) {
      throw new Error(`${gate} all-13 ledger binding differs`);
    }
    const receiptIdentity = identity(
      row.gate_receipt,
      RECEIPT_SCHEMA,
      `${gate} all-13 receipt identity`,
    );
    if (
      receiptIdentity.path !==
      path.join(request.gateDirectory.path, `${prefix}-${gate}.receipt.json`)
    ) {
      throw new Error(`${gate} all-13 receipt path differs`);
    }
    const receiptRaw = await readV1R11HeldIdentity(
      receiptIdentity,
      RECEIPT_SCHEMA,
      `${gate} all-13 receipt`,
    );
    const receipt = parseV1R11CanonicalObject(
      receiptRaw,
      `${gate} all-13 receipt`,
    );
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
      `${gate} all-13 receipt`,
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
      receipt.previous_gate_receipt_sha256 !== previousReceipt ||
      v1r11CanonicalJson(receipt.producer) !==
        v1r11CanonicalJson(expectedProducer) ||
      v1r11CanonicalJson(receipt.authority) !==
        v1r11CanonicalJson(FALSE_AUTHORITY)
    ) {
      throw new Error(`${gate} all-13 receipt binding differs`);
    }
    const evidenceSchema = `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-evidence-v1`;
    const evidenceIdentity = identity(
      receipt.evidence,
      evidenceSchema,
      `${gate} all-13 evidence identity`,
    );
    if (
      evidenceIdentity.path !==
        path.join(
          request.gateDirectory.path,
          `${prefix}-${gate}.evidence.json`,
        ) ||
      v1r11CanonicalJson(row.gate_evidence) !==
        v1r11CanonicalJson(evidenceIdentity)
    ) {
      throw new Error(`${gate} all-13 evidence path differs`);
    }
    const evidenceRaw = await readV1R11HeldIdentity(
      evidenceIdentity,
      evidenceSchema,
      `${gate} all-13 evidence`,
    );
    const evidence = parseV1R11CanonicalObject(
      evidenceRaw,
      `${gate} all-13 evidence`,
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
      `${gate} all-13 evidence`,
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
        v1r11CanonicalJson(expectedProducer) ||
      !Array.isArray(evidence.primary_sources) ||
      evidence.primary_sources.length !== 1
    ) {
      throw new Error(`${gate} all-13 evidence binding differs`);
    }
    iso(evidence.produced_at_utc, `${gate} all-13 produced_at_utc`);
    const sourceKind = SOURCE_KINDS[gate][0]!;
    const sourceSchema = `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-primary-source-${sourceKind}-v1`;
    const sourceIdentity = identity(
      evidence.primary_sources[0],
      sourceSchema,
      `${gate} all-13 source identity`,
    );
    if (
      sourceIdentity.path !==
      path.join(request.gateDirectory.path, `${prefix}-${gate}.source-01.bin`)
    ) {
      throw new Error(`${gate} all-13 source path differs`);
    }
    const sourceRaw = await readV1R11HeldIdentity(
      sourceIdentity,
      sourceSchema,
      `${gate} all-13 source`,
    );
    const source = parseV1R11CanonicalObject(
      sourceRaw,
      `${gate} all-13 source`,
    );
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
      `${gate} all-13 source`,
    );
    const decoded = independentlyDecodeStageABundle(
      gate,
      source.content,
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
        v1r11CanonicalJson(expectedProducer) ||
      v1r11CanonicalJson(evidence.payload) !==
        v1r11CanonicalJson(decoded.payload)
    ) {
      throw new Error(`${gate} all-13 source binding differs`);
    }
    iso(source.captured_at_utc, `${gate} all-13 captured_at_utc`);
    const summary = object(summaries[gate], `${gate} Stage A summary`);
    exactKeys(
      summary,
      [
        "sequence",
        "status",
        "primary_sources",
        "evidence",
        "receipt",
        "ledger_entry_sha256",
      ],
      `${gate} Stage A summary`,
    );
    if (
      summary.sequence !== sequence ||
      summary.status !== "independently-verified" ||
      v1r11CanonicalJson(summary.primary_sources) !==
        v1r11CanonicalJson(evidence.primary_sources) ||
      v1r11CanonicalJson(summary.evidence) !==
        v1r11CanonicalJson(evidenceIdentity) ||
      v1r11CanonicalJson(summary.receipt) !==
        v1r11CanonicalJson(receiptIdentity) ||
      summary.ledger_entry_sha256 !== entryDigest
    ) {
      throw new Error(`${gate} Stage A summary binding differs`);
    }
    payloads.set(gate, decoded.payload);
    gateSummaries[gate] = Object.freeze({
      sequence,
      status: "semantically-finalized",
      primary_sources: evidence.primary_sources,
      evidence: evidenceIdentity,
      receipt: receiptIdentity,
      ledger_entry_sha256: entryDigest,
    });
    previousEntry = String(entryDigest);
    previousReceipt = receiptIdentity.sha256;
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
    clean.head_revision_after !== request.sourceRevision ||
    previousEntry === null ||
    previousReceipt === null
  ) {
    throw new Error("all-13 Stage A cross-gate equations differ");
  }
  return Object.freeze({
    payloads,
    gateSummaries: Object.freeze(gateSummaries),
    stageA,
    previousEntrySha256: previousEntry,
    previousReceiptSha256: previousReceipt,
  });
}

function all13StageBCProducerIdentity(
  repositoryRoot: string,
  sourceRevision: string,
) {
  return implementationIdentity(
    repositoryRoot,
    sourceRevision,
    "ml/produce-halfkp81-depth18-v1r11-stage-bc.ts",
    [
      "ml/produce-halfkp81-depth18-v1r11-stage-bc.ts",
      "ml/floodgate-bounded-stable-wasm-runtime-v3.ts",
      "ml/floodgate-git.ts",
      "ml/floodgate-production-stable-wasm-runtime.ts",
      "ml/floodgate-production-teacher-asset-authority.ts",
      "ml/floodgate-raw-lock-verifier.ts",
      "ml/floodgate-raw-lock.ts",
      "ml/floodgate-raw-verification-worker-pool.ts",
      "ml/floodgate-raw-verification-worker-protocol.ts",
      "ml/floodgate-raw-verification-worker-source.ts",
      "ml/floodgate-replay-exclusion.ts",
      "ml/floodgate-role-bundle-result.ts",
      "ml/floodgate-role-bundle.ts",
      "ml/floodgate-role-lock.ts",
      "ml/floodgate-roles.ts",
      "ml/floodgate-source.ts",
      "ml/floodgate-stable-wasm-proposer.ts",
      "ml/floodgate-training-row-consumer.ts",
      "ml/floodgate-training-row-validation.ts",
      "ml/generate-sibling-teacher.ts",
      "ml/generate-teacher.ts",
      "ml/halfkp81-depth18-one-shot-launch-agent.ts",
      "ml/halfkp81-depth18-teacher-runner.ts",
      "ml/halfkp81-depth18-v1r11-authority-io.ts",
      "ml/halfkp81-depth18-v1r11-preformal-fault.ts",
      "ml/halfkp81-depth18-v1r11-stage-b-engine-gate-core.ts",
      "ml/halfkp81-depth18-v1r11-stage-b-fixed-engine-boundary.ts",
      "ml/halfkp81-depth18-v1r11-stage-b-launchagent-supervisor.ts",
      "ml/halfkp81-depth18-v1r11-stage-b-power-verifier.ts",
      "ml/halfkp81-depth18-v1r11-stage-c-live-evidence.ts",
      "ml/import-csa-games.ts",
      "ml/pipeline-revision.ts",
      "ml/run-halfkp81-depth18-v1r11-stage-b-engine-gate.ts",
      "ml/shogi-sfen-codec.ts",
      "ml/shogi-sfen.ts",
      "ml/sibling-data.ts",
      "ml/usi-engine.ts",
      "ml/usi-multipv.ts",
    ],
  );
}

async function independentlyReadStageBCSource(
  identityValue: unknown,
  context: Readonly<{
    gate: Gate;
    sequence: number;
    sourceSequence: number;
    sourceKind: string;
    gateDirectory: string;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    producer: Readonly<Record<string, unknown>>;
  }>,
): Promise<
  Readonly<{
    identity: Readonly<V1R11AuthorityFileIdentity>;
    value: Readonly<Record<string, unknown>>;
  }>
> {
  const prefix = String(context.sequence).padStart(2, "0");
  const schema = `shogi-halfkp81-depth18-yaneura-only-v1r11-${context.gate}-primary-source-${context.sourceKind}-v1`;
  const sourceIdentity = identity(
    identityValue,
    schema,
    `${context.gate} all-13 source ${context.sourceSequence} identity`,
  );
  if (
    sourceIdentity.path !==
    path.join(
      context.gateDirectory,
      `${prefix}-${context.gate}.source-${String(context.sourceSequence).padStart(2, "0")}.bin`,
    )
  ) {
    throw new Error(`${context.gate} all-13 source path differs`);
  }
  const raw = await readV1R11HeldIdentity(
    sourceIdentity,
    schema,
    `${context.gate} all-13 source ${context.sourceSequence}`,
  );
  const source = parseV1R11CanonicalObject(
    raw,
    `${context.gate} all-13 source ${context.sourceSequence}`,
  );
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
    `${context.gate} all-13 source ${context.sourceSequence}`,
  );
  if (
    source.schema !== schema ||
    source.status !== "captured-primary-source-no-authority" ||
    source.gate !== context.gate ||
    source.sequence !== context.sequence ||
    source.source_sequence !== context.sourceSequence ||
    source.source_kind !== context.sourceKind ||
    v1r11CanonicalJson(source.teacher_plan) !==
      v1r11CanonicalJson(context.teacherPlan) ||
    source.source_revision !== context.sourceRevision ||
    source.run_fingerprint !== context.runFingerprint ||
    v1r11CanonicalJson(source.producer) !==
      v1r11CanonicalJson(context.producer)
  ) {
    throw new Error(`${context.gate} all-13 source envelope differs`);
  }
  iso(
    source.captured_at_utc,
    `${context.gate} all-13 source ${context.sourceSequence} captured_at_utc`,
  );
  return Object.freeze({ identity: sourceIdentity, value: source });
}

async function independentlyVerifyStageBCChainInAll13(
  request: Readonly<{
    repositoryRoot: string;
    authorityDirectory: string;
    nodePath: string;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    gateDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    ledger: Readonly<V1R11AuthorityFileIdentity>;
    rows: readonly Readonly<Record<string, unknown>>[];
    stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
    stageA: Awaited<ReturnType<typeof independentlyVerifyStageAPrefixInAll13>>;
    launchIdentity: Readonly<V1R11AuthorityFileIdentity>;
    launchEvidence: Readonly<All13ParsedLaunchEvidence>;
    sealedLaunchctl: Buffer;
  }>,
): Promise<
  Readonly<{
    gates: Readonly<Record<string, unknown>>;
    payloads: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
    previousEntrySha256: string;
    previousReceiptSha256: string;
  }>
> {
  const producer = all13StageBCProducerIdentity(
    request.repositoryRoot,
    request.sourceRevision,
  );
  const gates: Record<string, unknown> = {
    ...request.stageA.gateSummaries,
  };
  const payloads = new Map(request.stageA.payloads);
  const fingerprints = new Set<string>();
  let previousEntry = request.stageA.previousEntrySha256;
  let previousReceipt = request.stageA.previousReceiptSha256;
  for (let offset = 7; offset < 13; offset += 1) {
    const gate = GATES[offset]!;
    const sequence = offset + 1;
    const prefix = String(sequence).padStart(2, "0");
    const row = request.rows[offset]!;
    exactKeys(
      row,
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
      `${gate} all-13 ledger row`,
    );
    const { entry_sha256: entryDigest, ...preimage } = row;
    if (
      row.schema !== LEDGER_SCHEMA ||
      row.sequence !== sequence ||
      row.gate !== gate ||
      row.previous_entry_sha256 !== previousEntry ||
      v1r11CanonicalJson(row.teacher_plan) !==
        v1r11CanonicalJson(request.teacherPlan) ||
      row.source_revision !== request.sourceRevision ||
      row.run_fingerprint !== request.runFingerprint ||
      row.status !== "pass-no-formal-authority" ||
      v1r11CanonicalJson(row.producer) !== v1r11CanonicalJson(producer) ||
      entryDigest !==
        v1r11Sha256(`${LEDGER_DOMAIN}${v1r11CanonicalJson(preimage)}`)
    ) {
      throw new Error(`${gate} all-13 ledger row differs`);
    }
    const receiptIdentity = identity(
      row.gate_receipt,
      RECEIPT_SCHEMA,
      `${gate} all-13 receipt identity`,
    );
    if (
      receiptIdentity.path !==
      path.join(request.gateDirectory.path, `${prefix}-${gate}.receipt.json`)
    ) {
      throw new Error(`${gate} all-13 receipt path differs`);
    }
    const receipt = parseV1R11CanonicalObject(
      await readV1R11HeldIdentity(
        receiptIdentity,
        RECEIPT_SCHEMA,
        `${gate} all-13 receipt`,
      ),
      `${gate} all-13 receipt`,
    );
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
      `${gate} all-13 receipt`,
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
      receipt.previous_gate_receipt_sha256 !== previousReceipt ||
      v1r11CanonicalJson(receipt.producer) !==
        v1r11CanonicalJson(producer) ||
      v1r11CanonicalJson(receipt.authority) !==
        v1r11CanonicalJson(FALSE_AUTHORITY)
    ) {
      throw new Error(`${gate} all-13 receipt differs`);
    }
    const evidenceSchema = `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-evidence-v1`;
    const evidenceIdentity = identity(
      receipt.evidence,
      evidenceSchema,
      `${gate} all-13 evidence identity`,
    );
    if (
      evidenceIdentity.path !==
        path.join(
          request.gateDirectory.path,
          `${prefix}-${gate}.evidence.json`,
        ) ||
      v1r11CanonicalJson(row.gate_evidence) !==
        v1r11CanonicalJson(evidenceIdentity)
    ) {
      throw new Error(`${gate} all-13 evidence identity differs`);
    }
    const evidence = parseV1R11CanonicalObject(
      await readV1R11HeldIdentity(
        evidenceIdentity,
        evidenceSchema,
        `${gate} all-13 evidence`,
      ),
      `${gate} all-13 evidence`,
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
      `${gate} all-13 evidence`,
    );
    const sourceKinds = SOURCE_KINDS[gate];
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
        v1r11CanonicalJson(producer) ||
      !Array.isArray(evidence.primary_sources) ||
      evidence.primary_sources.length !== sourceKinds.length
    ) {
      throw new Error(`${gate} all-13 evidence differs`);
    }
    iso(evidence.produced_at_utc, `${gate} all-13 produced_at_utc`);
    const sources = [];
    for (const [sourceOffset, sourceKind] of sourceKinds.entries()) {
      sources.push(
        await independentlyReadStageBCSource(
          evidence.primary_sources[sourceOffset],
          {
            gate,
            sequence,
            sourceSequence: sourceOffset + 1,
            sourceKind,
            gateDirectory: request.gateDirectory.path,
            teacherPlan: request.teacherPlan,
            sourceRevision: request.sourceRevision,
            runFingerprint: request.runFingerprint,
            producer,
          },
        ),
      );
    }
    let payload: Readonly<Record<string, unknown>>;
    if (sequence <= 12) {
      const decoded = independentlyDecodeCommandContent(
        sources[0]!.value.content,
        `${gate} all-13 parent collector`,
      );
      const collector = object(
        decoded.content.collector,
        `${gate} all-13 parent collector identity`,
      );
      exactKeys(
        collector,
        ["schema", "status", "entrypoint"],
        `${gate} all-13 parent collector identity`,
      );
      const stageFingerprint = v1r11Sha256(
        v1r11CanonicalJson({
          domain: "shogi-halfkp81-depth18-v1r11-stage-b-run-fingerprint-v1",
          gate,
          sequence,
          teacher_plan: request.teacherPlan,
          source_revision: request.sourceRevision,
          formal_run_fingerprint: request.runFingerprint,
          stage_a_verified_receipt: request.stageAReceipt,
          stage_b_epoch_namespace: path.join(
            request.gateDirectory.path,
            `${prefix}-${gate}.stage-b-epoch`,
          ),
          source_02_path: path.join(
            request.gateDirectory.path,
            `${prefix}-${gate}.source-02.bin`,
          ),
          source_03_path: path.join(
            request.gateDirectory.path,
            `${prefix}-${gate}.source-03.bin`,
          ),
        }),
      );
      const parentContext = Object.freeze({
        gate: gate as All13StageBParentEnvelopeContext["gate"],
        sequence,
        fingerprint: stageFingerprint,
        epochNamespace: path.join(
          request.gateDirectory.path,
          `${prefix}-${gate}.stage-b-epoch`,
        ),
        stageAReceipt: request.stageAReceipt,
        repositoryRoot: request.repositoryRoot,
        authorityDirectory: request.authorityDirectory,
        nodePath: request.nodePath,
      });
      const expectedJob = all13StageBJobContext(parentContext);
      if (
        collector.schema !==
          "shogi-halfkp81-depth18-v1r11-fixed-stage-b-launchagent-parent-collector-v1" ||
        collector.status !== "fixed-production-launchagent-parent-collector" ||
        collector.entrypoint !==
          "ml/run-halfkp81-depth18-v1r11-stage-b-engine-gate.ts" ||
        decoded.stderr.byteLength !== 0 ||
        v1r11CanonicalJson(decoded.content.request_or_command) !==
          v1r11CanonicalJson(expectedJob.command)
      ) {
        throw new Error(`${gate} all-13 parent collector differs`);
      }
      const execution =
        verifyHalfkp81V1R11All13StageBParentEnvelopeForTests(
          decoded.payload,
          parentContext,
        );
      const powerLedger = object(
        sources[1]!.value.content,
        `${gate} all-13 power ledger`,
      );
      const powerReceipt = object(
        sources[2]!.value.content,
        `${gate} all-13 power receipt`,
      );
      const verifiedPower = independentlyVerifyStageBPower(
        gate,
        powerLedger,
        powerReceipt,
        {
        teacherPlan: request.teacherPlan,
        sourceRevision: request.sourceRevision,
        formalRunFingerprint: request.runFingerprint,
        stageA: request.stageAReceipt,
        gateDirectory: request.gateDirectory.path,
        sequence,
        source2: sources[1]!.identity,
        fingerprints,
        },
      );
      const guardian = execution.observedAuxiliaryRows[0];
      if (
        guardian === undefined ||
        guardian.pid !== verifiedPower.guardianPid ||
        verifiedPower.runnerPid !==
          Number(execution.launchAgentEvidence.runner_pid) ||
        v1r11CanonicalJson(execution.verifier) !==
          v1r11CanonicalJson(powerReceipt.verifier) ||
        v1r11CanonicalJson(powerLedger.launchagent_evidence) !==
          v1r11CanonicalJson(execution.launchAgentEvidence) ||
        v1r11CanonicalJson([
          powerLedger.admission_entry,
          ...(Array.isArray(powerLedger.samples) ? powerLedger.samples : []),
          powerLedger.final_entry,
        ]) !== v1r11CanonicalJson(execution.powerEntries) ||
        v1r11CanonicalJson(powerReceipt.pmset_interval) !==
          v1r11CanonicalJson(execution.pmsetInterval)
      ) {
        throw new Error(`${gate} all-13 inner/power source binding differs`);
      }
      payload = object(evidence.payload, `${gate} all-13 payload`);
      validateIndependentStageBPayload(
        gate,
        payload,
        execution.gateResult,
        request.stageAReceipt,
        sources[1]!.identity,
        sources[2]!.identity,
      );
    } else {
      const decoded = independentlyDecodeCommandContent(
        sources[0]!.value.content,
        "all-13 gate13",
      );
      independentlyValidateGate13Collector(decoded);
      independentlyValidateGate13Payload(
        decoded.payload,
        decoded.content,
        request.launchIdentity,
        request.launchEvidence,
        request.sealedLaunchctl,
      );
      payload = object(evidence.payload, "all-13 gate13 evidence payload");
      if (
        v1r11CanonicalJson(payload) !==
        v1r11CanonicalJson(decoded.payload)
      ) {
        throw new Error("all-13 gate13 evidence payload differs");
      }
    }
    payloads.set(gate, payload);
    gates[gate] = Object.freeze({
      sequence,
      status: "semantically-finalized",
      primary_sources: evidence.primary_sources,
      evidence: evidenceIdentity,
      receipt: receiptIdentity,
      ledger_entry_sha256: entryDigest,
    });
    previousEntry = String(entryDigest);
    previousReceipt = receiptIdentity.sha256;
  }
  if (
    v1r11CanonicalJson(
      payloads.get("ac-power-start-admission-pass")!.launchagent_authority,
    ) !== v1r11CanonicalJson(request.launchIdentity)
  ) {
    throw new Error("all-13 final launch authority binding differs");
  }
  return Object.freeze({
    gates: Object.freeze(gates),
    payloads,
    previousEntrySha256: previousEntry,
    previousReceiptSha256: previousReceipt,
  });
}

async function independentlyValidateRawAuthorityReceipt(
  request: Readonly<{
    repositoryRoot: string;
    authorityDirectory: string;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    ledger: Readonly<V1R11AuthorityFileIdentity>;
    rawReceipt: Readonly<V1R11AuthorityFileIdentity>;
    launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity>;
    gates: Readonly<Record<string, unknown>>;
  }>,
): Promise<Readonly<Record<string, unknown>>> {
  if (
    request.rawReceipt.path !==
      path.join(
        request.authorityDirectory,
        "preformal-authority-receipt.json",
      ) ||
    request.rawReceipt.schema !== RAW_RECEIPT_SCHEMA
  ) {
    throw new Error("all-13 raw receipt identity differs");
  }
  const raw = await readV1R11HeldIdentity(
    request.rawReceipt,
    RAW_RECEIPT_SCHEMA,
    "all-13 raw authority receipt",
  );
  const receipt = parseV1R11CanonicalObject(
    raw,
    "all-13 raw authority receipt",
  );
  exactKeys(
    receipt,
    [
      "schema",
      "status",
      "teacher_plan",
      "source_revision",
      "run_fingerprint",
      "required_order",
      "ledger",
      "gates",
      "launchagent_authority",
      "finalizer",
      "authority",
    ],
    "all-13 raw authority receipt",
  );
  const expectedFinalizer = implementationIdentity(
    request.repositoryRoot,
    request.sourceRevision,
    "ml/finalize-halfkp81-depth18-v1r11-staged-authority.ts",
    [
      "ml/finalize-halfkp81-depth18-v1r11-staged-authority.ts",
      "ml/halfkp81-depth18-v1r11-authority-io.ts",
      "ml/halfkp81-depth18-v1r11-preformal-fault.ts",
    ],
  );
  if (
    receipt.schema !== RAW_RECEIPT_SCHEMA ||
    receipt.status !==
      "all-required-preformal-gates-semantically-finalized-no-formal-authority" ||
    v1r11CanonicalJson(receipt.teacher_plan) !==
      v1r11CanonicalJson(request.teacherPlan) ||
    receipt.source_revision !== request.sourceRevision ||
    receipt.run_fingerprint !== request.runFingerprint ||
    v1r11CanonicalJson(receipt.required_order) !==
      v1r11CanonicalJson(REQUIRED_ORDER) ||
    v1r11CanonicalJson(receipt.ledger) !== v1r11CanonicalJson(request.ledger) ||
    v1r11CanonicalJson(receipt.gates) !== v1r11CanonicalJson(request.gates) ||
    v1r11CanonicalJson(receipt.launchagent_authority) !==
      v1r11CanonicalJson(request.launchAgentAuthority) ||
    v1r11CanonicalJson(receipt.finalizer) !==
      v1r11CanonicalJson(expectedFinalizer) ||
    v1r11CanonicalJson(receipt.authority) !==
      v1r11CanonicalJson(FALSE_AUTHORITY)
  ) {
    throw new Error("all-13 raw receipt binding differs");
  }
  return receipt;
}

export interface Halfkp81V1R11All13LiveLaunchObserver {
  observe(request: Readonly<{ uid: number; label: string }>): Promise<
    Readonly<{
      launchctlStdout: Buffer;
      launchctlStderr: Buffer;
      psStdout: Buffer;
    }>
  >;
}

interface All13VerifiedLiveLaunchAgent {
  readonly evidence: Readonly<All13ParsedLaunchEvidence>;
  readonly runner: ReturnType<typeof all13StageBProcessRow>;
  readonly holder: ReturnType<typeof all13StageBProcessRow>;
  readonly liveLaunchctlStdout: Buffer;
  readonly liveLaunchctlStderr: Buffer;
  readonly livePsStdout: Buffer;
  readonly livePsRows: ReturnType<typeof independentlyParseStageBPs>;
}

async function independentlyVerifyLiveLaunchAgentInAll13(
  launchIdentity: Readonly<V1R11AuthorityFileIdentity>,
  context: Readonly<All13LaunchEvidenceContext>,
  observer: Readonly<Halfkp81V1R11All13LiveLaunchObserver>,
): Promise<Readonly<All13VerifiedLiveLaunchAgent>> {
  if (
    launchIdentity.path !==
      path.join(
        context.authorityDirectory,
        "launchagent-authority-evidence.json",
      ) ||
    launchIdentity.schema !== LAUNCH_SCHEMA
  ) {
    throw new Error("all-13 live LaunchAgent authority identity differs");
  }
  const evidenceRaw = await readV1R11HeldIdentity(
    launchIdentity,
    LAUNCH_SCHEMA,
    "all-13 live LaunchAgent evidence",
  );
  const evidenceValue = parseV1R11CanonicalObject(
    evidenceRaw,
    "all-13 live LaunchAgent evidence",
  );
  const parsed = independentlyParseLaunchEvidence(evidenceValue, context);
  const [
    sealedStdout,
    sealedStderr,
    sealedPlist,
    sealedPsStdout,
    sealedPsStderr,
    live,
    livePlist,
  ] =
    await Promise.all([
      readV1R11HeldIdentity(
        parsed.launchctlPrint,
        parsed.launchctlPrint.schema,
        "all-13 sealed launchctl stdout",
      ),
      readV1R11HeldFile(
        parsed.launchctlStderr.path,
        "all-13 sealed launchctl stderr",
      ),
      readV1R11HeldIdentity(
        parsed.plistSnapshot,
        parsed.plistSnapshot.schema,
        "all-13 sealed LaunchAgent plist",
      ),
      readV1R11HeldIdentity(
        parsed.psStdout,
        parsed.psStdout.schema,
        "all-13 sealed LaunchAgent ps stdout",
      ),
      readV1R11HeldIdentity(
        parsed.psStderr,
        parsed.psStderr.schema,
        "all-13 sealed LaunchAgent ps stderr",
      ),
      observer.observe({ uid: parsed.uid, label: parsed.label }),
      readV1R11HeldFile(
        String(parsed.plistSource.plist_path),
        "all-13 live LaunchAgent plist",
      ),
    ]);
  const plistMetadata = await fs.promises.lstat(
    String(parsed.plistSource.plist_path),
  );
  if (
    sealedStderr.byteLength !== parsed.launchctlStderr.bytes ||
    v1r11Sha256(sealedStderr) !== parsed.launchctlStderr.sha256 ||
    !sealedStdout.equals(live.launchctlStdout) ||
    !sealedStderr.equals(live.launchctlStderr) ||
    !sealedPlist.equals(livePlist) ||
    !sealedPlist.equals(independentlyExpectedPlist(parsed)) ||
    plistMetadata.dev !== parsed.plistSource.dev ||
    plistMetadata.ino !== parsed.plistSource.ino ||
    plistMetadata.uid !== parsed.plistSource.uid ||
    (plistMetadata.mode & 0o7777) !== parsed.plistSource.mode ||
    plistMetadata.nlink !== parsed.plistSource.nlink ||
    plistMetadata.size !== parsed.plistSource.bytes ||
    (await fs.promises.realpath(String(parsed.plistSource.plist_path))) !==
      parsed.plistSource.realpath ||
    v1r11CanonicalJson(parsed.value.producer) !==
      v1r11CanonicalJson(
        buildHalfkp81V1R11IndependentRecursiveProducerIdentityForTests(
          context.repositoryRoot,
          context.sourceRevision,
          V1R11_FINAL_LAUNCH_PRODUCER_ENTRYPOINT,
        ),
      )
  ) {
    throw new Error("all-13 live LaunchAgent raw binding differs");
  }
  independentlyVerifySealedLaunchPs(
    sealedPsStdout,
    sealedPsStderr,
    parsed,
  );
  independentlyVerifyLaunchctl(sealedStdout, parsed);
  const topology = independentlyVerifyLiveLaunchPs(live.psStdout, parsed);
  return Object.freeze({
    evidence: parsed,
    runner: topology.runner,
    holder: topology.holder,
    liveLaunchctlStdout: live.launchctlStdout,
    liveLaunchctlStderr: live.launchctlStderr,
    livePsStdout: live.psStdout,
    livePsRows: topology.rows,
  });
}

function fixedAll13LaunchObserver(): Readonly<Halfkp81V1R11All13LiveLaunchObserver> {
  return Object.freeze({
    async observe(request) {
      const command = ["print", `gui/${String(request.uid)}/${request.label}`];
      const result = spawnSync("/bin/launchctl", command, {
        encoding: null,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (
        result.error !== undefined ||
        result.status !== 0 ||
        result.signal !== null ||
        !Buffer.isBuffer(result.stdout) ||
        !Buffer.isBuffer(result.stderr)
      ) {
        throw new Error("all-13 live launchctl command differs");
      }
      const ps = spawnSync(
        "/bin/ps",
        ["-axo", "pid=,ppid=,pgid=,lstart=,state=,command="],
        {
          encoding: null,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      if (
        ps.error !== undefined ||
        ps.status !== 0 ||
        ps.signal !== null ||
        !Buffer.isBuffer(ps.stdout) ||
        !Buffer.isBuffer(ps.stderr) ||
        ps.stderr.byteLength !== 0
      ) {
        throw new Error("all-13 live ps command differs");
      }
      return Object.freeze({
        launchctlStdout: result.stdout,
        launchctlStderr: result.stderr,
        psStdout: ps.stdout,
      });
    },
  });
}

interface All13CleanupCommandResult {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly error?: Error;
}

export interface Halfkp81V1R11All13FailureCleanupDependencies {
  readonly launchctl: (
    arguments_: readonly string[],
  ) => Readonly<All13CleanupCommandResult>;
  readonly ps: () => Buffer;
  readonly signalProcessGroup: (
    pgid: number,
    signal: "SIGTERM" | "SIGKILL",
  ) => "sent" | "esrch";
  readonly wait: (milliseconds: number) => Promise<void>;
}

export interface Halfkp81V1R11All13FailureCleanupEnvelope {
  readonly schema: typeof HALFKP81_V1R11_PROCESS_CLEANUP_EVIDENCE_SCHEMA;
  readonly status: "launchagent-booted-out-and-process-group-dual-ps-reaped";
  readonly phase: "independent-verifier";
  readonly label: string;
  readonly uid: number;
  readonly service: string;
  readonly authenticated_running_launchctl: Readonly<{
    bytes: number;
    sha256: string;
    base64: string;
  }>;
  readonly authenticated_running_ps: Readonly<{
    bytes: number;
    sha256: string;
    base64: string;
  }>;
  readonly runner: ReturnType<typeof all13StageBProcessRow>;
  readonly holder: ReturnType<typeof all13StageBProcessRow>;
  readonly observed_job_rows: readonly ReturnType<
    typeof all13StageBProcessRow
  >[];
  readonly bootout: Readonly<Record<string, unknown>>;
  readonly absent_launchctl: Readonly<Record<string, unknown>>;
  readonly termination_actions: readonly Readonly<
    Record<string, unknown>
  >[];
  readonly final_ps_first: Readonly<{
    bytes: number;
    sha256: string;
    base64: string;
  }>;
  readonly final_ps_second: Readonly<{
    bytes: number;
    sha256: string;
    base64: string;
  }>;
  readonly process_cleanup: Readonly<{
    scheduling_stopped: true;
    engines_terminated: number;
    engines_reaped: number;
    remaining_engine_pids: readonly number[];
  }>;
}

function all13CleanupRawIdentity(raw: Buffer) {
  return Object.freeze({
    bytes: raw.byteLength,
    sha256: v1r11Sha256(raw),
    base64: raw.toString("base64"),
  });
}

function all13CleanupCommandIdentity(
  argv: readonly string[],
  result: Readonly<All13CleanupCommandResult>,
) {
  return Object.freeze({
    argv: Object.freeze([...argv]),
    exit_code: result.status,
    signal: result.signal,
    stdout: all13CleanupRawIdentity(result.stdout),
    stderr: all13CleanupRawIdentity(result.stderr),
  });
}

function all13CleanupDescendants(
  rows: readonly ReturnType<typeof all13StageBProcessRow>[],
  rootPid: number,
): readonly ReturnType<typeof all13StageBProcessRow>[] {
  const found = new Set<number>([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (found.has(row.ppid) && !found.has(row.pid)) {
        found.add(row.pid);
        changed = true;
      }
    }
  }
  return Object.freeze(rows.filter((row) => row.pid !== rootPid && found.has(row.pid)));
}

function all13CleanupExactPreviouslyObserved(
  current: readonly ReturnType<typeof all13StageBProcessRow>[],
  previous: readonly ReturnType<typeof all13StageBProcessRow>[],
): void {
  const byPid = new Map(previous.map((row) => [row.pid, row] as const));
  for (const row of current) {
    const prior = byPid.get(row.pid);
    if (
      prior === undefined ||
      prior.ppid !== row.ppid ||
      prior.pgid !== row.pgid ||
      prior.start_token !== row.start_token ||
      prior.command !== row.command
    ) {
      throw new Error("all-13 cleanup refused an unobserved or reused process");
    }
  }
}

async function cleanupVerifiedAll13LaunchAgent(
  live: Readonly<All13VerifiedLiveLaunchAgent>,
  dependencies: Readonly<Halfkp81V1R11All13FailureCleanupDependencies>,
): Promise<Readonly<Halfkp81V1R11All13FailureCleanupEnvelope>> {
  const service = `gui/${String(live.evidence.uid)}/${live.evidence.label}`;
  const initialGroup = Object.freeze(
    live.livePsRows.filter((row) => row.pgid === live.runner.pgid),
  );
  if (
    initialGroup.filter((row) => row.pid === live.runner.pid).length !== 1 ||
    initialGroup.filter((row) => row.pid === live.holder.pid).length !== 1
  ) {
    throw new Error("all-13 cleanup initial process group differs");
  }
  const bootoutArgv = Object.freeze(["bootout", service]);
  const bootout = dependencies.launchctl(bootoutArgv);
  if (
    bootout.error !== undefined ||
    bootout.status !== 0 ||
    bootout.signal !== null ||
    bootout.stderr.byteLength !== 0
  ) {
    throw new Error("all-13 cleanup launchctl bootout failed");
  }
  const absentArgv = Object.freeze(["print", service]);
  const absent = dependencies.launchctl(absentArgv);
  const absentText = Buffer.concat([absent.stdout, absent.stderr]).toString(
    "utf8",
  );
  if (
    absent.error !== undefined ||
    absent.status !== 113 ||
    absent.signal !== null ||
    !/Could not find service/u.test(absentText)
  ) {
    throw new Error("all-13 cleanup service absence was not proven");
  }
  const actions: Readonly<Record<string, unknown>>[] = [];
  let workingRaw = dependencies.ps();
  let workingRows = independentlyParseStageBPs(
    workingRaw,
    "all-13 cleanup post-bootout ps",
  );
  let liveGroup = workingRows.filter((row) => row.pgid === live.runner.pgid);
  if (liveGroup.length > 0) {
    all13CleanupExactPreviouslyObserved(liveGroup, initialGroup);
    const term = dependencies.signalProcessGroup(live.runner.pgid, "SIGTERM");
    actions.push(
      Object.freeze({
        action: "signal-process-group",
        pgid: live.runner.pgid,
        signal: "SIGTERM",
        result: term,
      }),
    );
    await dependencies.wait(250);
    workingRaw = dependencies.ps();
    workingRows = independentlyParseStageBPs(
      workingRaw,
      "all-13 cleanup post-TERM ps",
    );
    liveGroup = workingRows.filter((row) => row.pgid === live.runner.pgid);
    if (liveGroup.length > 0) {
      all13CleanupExactPreviouslyObserved(liveGroup, initialGroup);
      const kill = dependencies.signalProcessGroup(
        live.runner.pgid,
        "SIGKILL",
      );
      actions.push(
        Object.freeze({
          action: "signal-process-group",
          pgid: live.runner.pgid,
          signal: "SIGKILL",
          result: kill,
        }),
      );
      await dependencies.wait(250);
    }
  }
  const finalFirstRaw = dependencies.ps();
  const finalFirst = independentlyParseStageBPs(
    finalFirstRaw,
    "all-13 cleanup final ps first",
  );
  const finalSecondRaw = dependencies.ps();
  const finalSecond = independentlyParseStageBPs(
    finalSecondRaw,
    "all-13 cleanup final ps second",
  );
  const remaining = (rows: typeof finalFirst) =>
    rows.filter(
      (row) =>
        row.pgid === live.runner.pgid ||
        row.pid === live.runner.pid ||
        row.pid === live.holder.pid ||
        all13CleanupDescendants(rows, live.runner.pid).some(
          (descendant) => descendant.pid === row.pid,
        ),
    );
  if (remaining(finalFirst).length > 0 || remaining(finalSecond).length > 0) {
    throw new Error("all-13 cleanup dual ps retained job processes");
  }
  const engines = initialGroup.filter(
    (row) => row.pid !== live.runner.pid && row.pid !== live.holder.pid,
  );
  return Object.freeze({
    schema:
      HALFKP81_V1R11_PROCESS_CLEANUP_EVIDENCE_SCHEMA,
    status: "launchagent-booted-out-and-process-group-dual-ps-reaped",
    phase: "independent-verifier",
    label: live.evidence.label,
    uid: live.evidence.uid,
    service,
    authenticated_running_launchctl: all13CleanupRawIdentity(
      live.liveLaunchctlStdout,
    ),
    authenticated_running_ps: all13CleanupRawIdentity(live.livePsStdout),
    runner: live.runner,
    holder: live.holder,
    observed_job_rows: initialGroup,
    bootout: all13CleanupCommandIdentity(bootoutArgv, bootout),
    absent_launchctl: all13CleanupCommandIdentity(absentArgv, absent),
    termination_actions: Object.freeze(actions),
    final_ps_first: all13CleanupRawIdentity(finalFirstRaw),
    final_ps_second: all13CleanupRawIdentity(finalSecondRaw),
    process_cleanup: Object.freeze({
      scheduling_stopped: true as const,
      engines_terminated: engines.length,
      engines_reaped: engines.length,
      remaining_engine_pids: Object.freeze([]),
    }),
  });
}

export async function cleanupHalfkp81V1R11All13LaunchAgentForTests(
  value: unknown,
  context: Readonly<All13LaunchEvidenceContext>,
  running: Readonly<{
    launchctlStdout: Buffer;
    launchctlStderr: Buffer;
    psStdout: Buffer;
  }>,
  dependencies: Readonly<Halfkp81V1R11All13FailureCleanupDependencies>,
): Promise<Readonly<Halfkp81V1R11All13FailureCleanupEnvelope>> {
  const evidence = independentlyParseLaunchEvidence(value, context);
  if (
    running.launchctlStdout.byteLength !== evidence.launchctlPrint.bytes ||
    v1r11Sha256(running.launchctlStdout) !== evidence.launchctlPrint.sha256 ||
    running.launchctlStderr.byteLength !== evidence.launchctlStderr.bytes ||
    v1r11Sha256(running.launchctlStderr) !== evidence.launchctlStderr.sha256
  ) {
    throw new Error("all-13 cleanup running launchctl identity differs");
  }
  independentlyVerifyLaunchctl(running.launchctlStdout, evidence);
  const topology = independentlyVerifyLiveLaunchPs(running.psStdout, evidence);
  return cleanupVerifiedAll13LaunchAgent(
    Object.freeze({
      evidence,
      runner: topology.runner,
      holder: topology.holder,
      liveLaunchctlStdout: running.launchctlStdout,
      liveLaunchctlStderr: running.launchctlStderr,
      livePsStdout: running.psStdout,
      livePsRows: topology.rows,
    }),
    dependencies,
  );
}

function fixedAll13FailureCleanupDependencies(): Readonly<Halfkp81V1R11All13FailureCleanupDependencies> {
  const runLaunchctl = (arguments_: readonly string[]) => {
    const result = spawnSync("/bin/launchctl", [...arguments_], {
      encoding: null,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return Object.freeze({
      status: result.status,
      signal: result.signal,
      stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0),
      stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0),
      ...(result.error === undefined ? {} : { error: result.error }),
    });
  };
  return Object.freeze({
    launchctl: runLaunchctl,
    ps() {
      const result = spawnSync(
        "/bin/ps",
        ["-axo", "pid=,ppid=,pgid=,lstart=,state=,command="],
        { encoding: null, stdio: ["ignore", "pipe", "pipe"] },
      );
      if (
        result.error !== undefined ||
        result.status !== 0 ||
        result.signal !== null ||
        !Buffer.isBuffer(result.stdout) ||
        !Buffer.isBuffer(result.stderr) ||
        result.stderr.byteLength !== 0
      ) {
        throw new Error("all-13 cleanup ps command differs");
      }
      return result.stdout;
    },
    signalProcessGroup(pgid, signal) {
      try {
        process.kill(-pgid, signal);
        return "sent" as const;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") {
          return "esrch" as const;
        }
        throw error;
      }
    },
    wait: (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  });
}

export function resolveHalfkp81V1R11PasswdHomeForTests(uid: number): string {
  const raw = execFileSync("/usr/bin/id", ["-P", String(uid)], {
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const text = raw.toString("utf8");
  const fields = text.endsWith("\n")
    ? text.slice(0, -1).split(":")
    : [];
  const home = fields[8];
  if (
    !Buffer.from(text, "utf8").equals(raw) ||
    text.indexOf("\n") !== text.length - 1 ||
    fields.length !== 10 ||
    Number(fields[2]) !== uid ||
    typeof home !== "string" ||
    !path.isAbsolute(home) ||
    path.normalize(home) !== home ||
    fs.realpathSync(home) !== home
  ) {
    throw new Error("all-13 passwd home identity differs");
  }
  const metadata = fs.lstatSync(home);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== uid ||
    process.env.HOME !== home
  ) {
    throw new Error("all-13 environment HOME differs from passwd home");
  }
  return home;
}

function all13VerifierIdentity(repositoryRoot: string, sourceRevision: string) {
  return implementationIdentity(
    repositoryRoot,
    sourceRevision,
    "ml/verify-halfkp81-depth18-v1r11-staged-authority.ts",
    [
      "ml/verify-halfkp81-depth18-v1r11-staged-authority.ts",
      "ml/halfkp81-depth18-v1r11-authority-io.ts",
      "ml/halfkp81-depth18-v1r11-preformal-fault.ts",
    ],
  );
}

function independentlyParseAll13Ledger(raw: Buffer) {
  const text = raw.toString("utf8");
  if (
    !Buffer.from(text, "utf8").equals(raw) ||
    !text.endsWith("\n")
  ) {
    throw new Error("all-13 ledger raw bytes differ");
  }
  const lines = text.slice(0, -1).split("\n");
  if (lines.length !== 13 || lines.some((line) => line.length < 1)) {
    throw new Error("all-13 ledger row count differs");
  }
  return Object.freeze(
    lines.map((line, index) => {
      const row = parseV1R11CanonicalObject(
        Buffer.from(`${line}\n`, "utf8"),
        `all-13 ledger row ${index + 1}`,
      );
      if (v1r11CanonicalJson(row) !== line) {
        throw new Error(`all-13 ledger row ${index + 1} is not canonical`);
      }
      return row;
    }),
  );
}

async function verifyAndPublishHalfkp81V1R11StagedAuthorityInternal(
  request: Readonly<{
    repositoryRoot: string;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    gateDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
    ledger: Readonly<V1R11AuthorityFileIdentity>;
    rawReceipt: Readonly<V1R11AuthorityFileIdentity>;
    launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity>;
    formalRunIntent?: Readonly<IndependentFormalRunIntentInput>;
  }>,
  liveLaunchObserver: Readonly<Halfkp81V1R11All13LiveLaunchObserver>,
  namespace: Readonly<Halfkp81V1R11StagedAuthorityNamespace>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  const faultPath = path.join(
    request.authorityDirectory.path,
    "preformal-terminal-fault.json",
  );
  const outputPath = path.join(
    request.authorityDirectory.path,
    "preformal-authority-verified-receipt.json",
  );
  let ledgerPrefix: Readonly<V1R11AuthorityFileIdentity> | null = null;
  let lastGateReceipt: Readonly<V1R11AuthorityFileIdentity> | null = null;
  let verifiedReceipt: Readonly<V1R11AuthorityFileIdentity> | null = null;
  let activeBinding: ReturnType<
    typeof halfkp81V1R11ActiveLaunchBindingFromEvidenceForFailure
  > | null = null;
  try {
    const independentlyComputedFingerprint =
      request.formalRunIntent === undefined
        ? null
        : independentlyComputeFormalRunFingerprint(request.formalRunIntent);
    if (
      request.authorityDirectory.path !== namespace.authorityDirectory ||
      request.gateDirectory.path !==
        path.join(namespace.authorityDirectory, "preformal-gates") ||
      request.teacherPlan.path !== namespace.teacherPlanPath ||
      request.teacherPlan.schema !== TEACHER_PLAN_SCHEMA ||
      request.ledger.path !==
        path.join(
          namespace.authorityDirectory,
          "preformal-authority-ledger.jsonl",
        ) ||
      request.ledger.schema !== LEDGER_SCHEMA ||
      request.rawReceipt.path !==
        path.join(
          namespace.authorityDirectory,
          "preformal-authority-receipt.json",
        ) ||
      request.rawReceipt.schema !== RAW_RECEIPT_SCHEMA ||
      request.launchAgentAuthority.path !==
        path.join(
          namespace.authorityDirectory,
          "launchagent-authority-evidence.json",
        ) ||
      request.launchAgentAuthority.schema !== LAUNCH_SCHEMA ||
      !REVISION_RE.test(request.sourceRevision) ||
      !SHA256_RE.test(request.runFingerprint) ||
      independentlyComputedFingerprint !== request.runFingerprint ||
      !path.isAbsolute(request.repositoryRoot) ||
      path.normalize(request.repositoryRoot) !== request.repositoryRoot ||
      fs.realpathSync(request.repositoryRoot) !== request.repositoryRoot ||
      execFileSync(
        "git",
        ["-C", request.repositoryRoot, "rev-parse", "HEAD"],
        { encoding: "utf8" },
      ).trim() !== request.sourceRevision
    ) {
      throw new Error("all-13 production context differs");
    }
    await assertV1R11AuthorityDirectory(request.authorityDirectory);
    await assertV1R11AuthorityDirectory(request.gateDirectory);
    await assertV1R11CreateOnlyTargetAbsent(
      request.authorityDirectory,
      faultPath,
      "all-13 terminal-fault collision",
    );
    await assertV1R11CreateOnlyTargetAbsent(
      request.authorityDirectory,
      outputPath,
      "all-13 verified receipt collision",
    );
    await readV1R11HeldIdentity(
      request.teacherPlan,
      TEACHER_PLAN_SCHEMA,
      "all-13 teacher plan",
    );
    const launchAuthorityRaw = await readV1R11HeldIdentity(
      request.launchAgentAuthority,
      request.launchAgentAuthority.schema,
      "all-13 active LaunchAgent authority for failure binding",
    );
    activeBinding = halfkp81V1R11ActiveLaunchBindingFromEvidenceForFailure(
      parseV1R11CanonicalObject(
        launchAuthorityRaw,
        "all-13 active LaunchAgent authority for failure binding",
      ),
    );
    all13VerifierIdentity(request.repositoryRoot, request.sourceRevision);
    const ledgerRaw = await readV1R11HeldIdentity(
      request.ledger,
      LEDGER_SCHEMA,
      "all-13 closed ledger",
    );
    ledgerPrefix = request.ledger;
    const rows = independentlyParseAll13Ledger(ledgerRaw);
    lastGateReceipt = identity(
      rows.at(-1)!.gate_receipt,
      RECEIPT_SCHEMA,
      "all-13 final gate receipt identity",
    );
    const stageA = await independentlyVerifyStageAPrefixInAll13({
      repositoryRoot: request.repositoryRoot,
      authorityDirectory: request.authorityDirectory.path,
      teacherPlan: request.teacherPlan,
      sourceRevision: request.sourceRevision,
      runFingerprint: request.runFingerprint,
      formalRunIntent: request.formalRunIntent,
      gateDirectory: request.gateDirectory,
      stageAReceipt: request.stageAReceipt,
      fullLedgerRaw: ledgerRaw,
      rows,
    });
    const uid = process.geteuid?.();
    if (!safeInteger(uid, 1)) {
      throw new Error("all-13 user environment differs");
    }
    const home = resolveHalfkp81V1R11PasswdHomeForTests(Number(uid));
    const nodePath = fs.realpathSync(process.execPath);
    const launchContext = Object.freeze({
      repositoryRoot: request.repositoryRoot,
      authorityDirectory: request.authorityDirectory.path,
      homeDirectory: home,
      expectedUid: Number(uid),
      sourceRevision: request.sourceRevision,
      runFingerprint: request.runFingerprint,
      formalRunIntent: request.formalRunIntent,
      teacherPlan: request.teacherPlan,
      expectedNodePath: nodePath,
    });
    const verifiedLiveLaunch = await independentlyVerifyLiveLaunchAgentInAll13(
      request.launchAgentAuthority,
      launchContext,
      liveLaunchObserver,
    );
    const launchEvidence = verifiedLiveLaunch.evidence;
    const sealedLaunchctl = await readV1R11HeldIdentity(
      launchEvidence.launchctlPrint,
      launchEvidence.launchctlPrint.schema,
      "all-13 sealed launchctl for gate13",
    );
    const stageBC = await independentlyVerifyStageBCChainInAll13({
      repositoryRoot: request.repositoryRoot,
      authorityDirectory: request.authorityDirectory.path,
      nodePath,
      teacherPlan: request.teacherPlan,
      sourceRevision: request.sourceRevision,
      runFingerprint: request.runFingerprint,
      gateDirectory: request.gateDirectory,
      ledger: request.ledger,
      rows,
      stageAReceipt: request.stageAReceipt,
      stageA,
      launchIdentity: request.launchAgentAuthority,
      launchEvidence,
      sealedLaunchctl,
    });
    await independentlyValidateRawAuthorityReceipt({
      repositoryRoot: request.repositoryRoot,
      authorityDirectory: request.authorityDirectory.path,
      teacherPlan: request.teacherPlan,
      sourceRevision: request.sourceRevision,
      runFingerprint: request.runFingerprint,
      ledger: request.ledger,
      rawReceipt: request.rawReceipt,
      launchAgentAuthority: request.launchAgentAuthority,
      gates: stageBC.gates,
    });
    await assertV1R11CreateOnlyTargetAbsent(
      request.authorityDirectory,
      faultPath,
      "all-13 pre-publication terminal-fault collision",
    );
    verifiedReceipt = await publishV1R11CreateOnlyCanonical(
      request.authorityDirectory,
      outputPath,
      Object.freeze({
        schema: VERIFIED_RECEIPT_SCHEMA,
        status:
          "all-required-preformal-gates-independently-verified-formal-only-authority",
        teacher_plan: request.teacherPlan,
        source_revision: request.sourceRevision,
        run_fingerprint: request.runFingerprint,
        required_order: REQUIRED_ORDER,
        ledger: request.ledger,
        raw_receipt: request.rawReceipt,
        gates: stageBC.gates,
        launchagent_authority: request.launchAgentAuthority,
        verifier: all13VerifierIdentity(
          request.repositoryRoot,
          request.sourceRevision,
        ),
        authority: FORMAL_ONLY_AUTHORITY,
      }),
      VERIFIED_RECEIPT_SCHEMA,
    );
    await assertV1R11CreateOnlyTargetAbsent(
      request.authorityDirectory,
      faultPath,
      "all-13 post-publication terminal-fault collision",
    );
    return verifiedReceipt;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    throw new Halfkp81V1R11PreformalStageFailure({
      phase: "independent-verifier",
      gate: "ac-power-start-admission-pass",
      sequence: 13,
      runnerState: "active",
      failure,
      artifacts: Object.freeze({
        ledgerPrefix,
        lastGateReceipt,
        engineGateVerifiedReceipt: request.stageAReceipt,
        launchAgentAuthority: request.launchAgentAuthority,
        activeLaunchAgent: activeBinding?.activeLaunchAgent ?? null,
        runnerIdentity: activeBinding?.runnerIdentity ?? null,
        partialArtifacts: Object.freeze(
          verifiedReceipt === null ? [] : [verifiedReceipt],
        ),
      }),
    });
  }
}

/** Production all-13 publisher retains its fixed live OS observer. */
export async function verifyAndPublishHalfkp81V1R11ProductionStagedAuthority(
  request: Parameters<
    typeof verifyAndPublishHalfkp81V1R11StagedAuthorityInternal
  >[0],
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  return verifyAndPublishHalfkp81V1R11StagedAuthorityInternal(
    request,
    fixedAll13LaunchObserver(),
    PRODUCTION_NAMESPACE,
  );
}

/**
 * Test-only live-observation seam for the actual independent all-13 verifier.
 * It changes only launchctl/ps capture and cannot inject a verified receipt.
 */
export async function verifyAndPublishHalfkp81V1R11StagedAuthorityWithOsBoundaryForTests(
  request: Parameters<
    typeof verifyAndPublishHalfkp81V1R11StagedAuthorityInternal
  >[0],
  observer: Readonly<Halfkp81V1R11All13LiveLaunchObserver>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  return verifyAndPublishHalfkp81V1R11StagedAuthorityInternal(
    request,
    observer,
    PRODUCTION_NAMESPACE,
  );
}

/** Scratch all-13 wrapper keeps the verifier core and injects only live OS bytes. */
export async function verifyAndPublishHalfkp81V1R11StagedAuthorityInScratchForTests(
  capability: Readonly<Halfkp81V1R11ScratchNamespaceCapabilityForTests>,
  request: Parameters<
    typeof verifyAndPublishHalfkp81V1R11StagedAuthorityInternal
  >[0],
  observer: Readonly<Halfkp81V1R11All13LiveLaunchObserver>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  const namespace = resolveHalfkp81V1R11ScratchNamespaceCapabilityForTests(
    capability,
  );
  return verifyAndPublishHalfkp81V1R11StagedAuthorityInternal(
    request,
    observer,
    namespace,
  );
}

export interface Halfkp81V1R11ExistingStagedAuthorityRequest {
  readonly repositoryRoot: string;
  readonly teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
  readonly sourceRevision: string;
  readonly runFingerprint: string;
  readonly authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
  readonly gateDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
  readonly stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
  readonly ledger: Readonly<V1R11AuthorityFileIdentity>;
  readonly rawReceipt: Readonly<V1R11AuthorityFileIdentity>;
  readonly launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity>;
  readonly verifiedReceipt: Readonly<V1R11AuthorityFileIdentity>;
  readonly formalRunIntent: Readonly<IndependentFormalRunIntentInput>;
}

export interface Halfkp81V1R11ExistingStagedAuthorityResult {
  readonly status: "existing-all13-authority-independently-reauthenticated";
  readonly teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
  readonly sourceRevision: string;
  readonly runFingerprint: string;
  readonly launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity>;
  readonly verifiedReceipt: Readonly<V1R11AuthorityFileIdentity>;
}

/**
 * Formal-child barrier. It publishes nothing: all thirteen rows, primary
 * evidence, the raw receipt, the live one-shot LaunchAgent and the already
 * published verified receipt are independently re-read and recomputed.
 */
async function reauthenticateHalfkp81V1R11ExistingStagedAuthorityInternal(
  request: Readonly<Halfkp81V1R11ExistingStagedAuthorityRequest>,
  liveLaunchObserver: Readonly<Halfkp81V1R11All13LiveLaunchObserver>,
  namespace: Readonly<Halfkp81V1R11StagedAuthorityNamespace>,
): Promise<Readonly<Halfkp81V1R11ExistingStagedAuthorityResult>> {
  const independentlyComputedFingerprint =
    independentlyComputeFormalRunFingerprint(request.formalRunIntent);
  const terminalFaultPath = path.join(
    request.authorityDirectory.path,
    "preformal-terminal-fault.json",
  );
  if (
    request.authorityDirectory.path !== namespace.authorityDirectory ||
    request.gateDirectory.path !==
      path.join(namespace.authorityDirectory, "preformal-gates") ||
    request.teacherPlan.path !== namespace.teacherPlanPath ||
    request.teacherPlan.schema !== TEACHER_PLAN_SCHEMA ||
    request.ledger.path !==
      path.join(
        namespace.authorityDirectory,
        "preformal-authority-ledger.jsonl",
      ) ||
    request.ledger.schema !== LEDGER_SCHEMA ||
    request.rawReceipt.path !==
      path.join(
        namespace.authorityDirectory,
        "preformal-authority-receipt.json",
      ) ||
    request.rawReceipt.schema !== RAW_RECEIPT_SCHEMA ||
    request.launchAgentAuthority.path !==
      path.join(
        namespace.authorityDirectory,
        "launchagent-authority-evidence.json",
      ) ||
    request.launchAgentAuthority.schema !== LAUNCH_SCHEMA ||
    request.verifiedReceipt.path !==
      path.join(
        namespace.authorityDirectory,
        "preformal-authority-verified-receipt.json",
      ) ||
    request.verifiedReceipt.schema !== VERIFIED_RECEIPT_SCHEMA ||
    !REVISION_RE.test(request.sourceRevision) ||
    !SHA256_RE.test(request.runFingerprint) ||
    independentlyComputedFingerprint !== request.runFingerprint ||
    request.formalRunIntent.sourceRevision !== request.sourceRevision ||
    v1r11CanonicalJson(request.formalRunIntent.teacherPlan) !==
      v1r11CanonicalJson(request.teacherPlan) ||
    !path.isAbsolute(request.repositoryRoot) ||
    path.normalize(request.repositoryRoot) !== request.repositoryRoot ||
    fs.realpathSync(request.repositoryRoot) !== request.repositoryRoot ||
    execFileSync(
      "git",
      ["-C", request.repositoryRoot, "rev-parse", "HEAD"],
      { encoding: "utf8" },
    ).trim() !== request.sourceRevision
  ) {
    throw new Error("formal-child existing all-13 context differs");
  }
  await assertV1R11AuthorityDirectory(request.authorityDirectory);
  await assertV1R11AuthorityDirectory(request.gateDirectory);
  try {
    await fs.promises.lstat(terminalFaultPath);
    throw new Error("formal-child rejects a closed preformal family");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await readV1R11HeldIdentity(
    request.teacherPlan,
    TEACHER_PLAN_SCHEMA,
    "formal-child all-13 teacher plan",
  );
  const ledgerRaw = await readV1R11HeldIdentity(
    request.ledger,
    LEDGER_SCHEMA,
    "formal-child all-13 ledger",
  );
  const rows = independentlyParseAll13Ledger(ledgerRaw);
  const verifier = all13VerifierIdentity(
    request.repositoryRoot,
    request.sourceRevision,
  );
  const stageA = await independentlyVerifyStageAPrefixInAll13({
    repositoryRoot: request.repositoryRoot,
    authorityDirectory: request.authorityDirectory.path,
    teacherPlan: request.teacherPlan,
    sourceRevision: request.sourceRevision,
    runFingerprint: request.runFingerprint,
    formalRunIntent: request.formalRunIntent,
    gateDirectory: request.gateDirectory,
    stageAReceipt: request.stageAReceipt,
    fullLedgerRaw: ledgerRaw,
    rows,
  });
  const uid = process.geteuid?.();
  if (!safeInteger(uid, 1)) {
    throw new Error("formal-child all-13 user environment differs");
  }
  const home = resolveHalfkp81V1R11PasswdHomeForTests(Number(uid));
  const nodePath = fs.realpathSync(process.execPath);
  const launchContext = Object.freeze({
    repositoryRoot: request.repositoryRoot,
    authorityDirectory: request.authorityDirectory.path,
    homeDirectory: home,
    expectedUid: Number(uid),
    sourceRevision: request.sourceRevision,
    runFingerprint: request.runFingerprint,
    formalRunIntent: request.formalRunIntent,
    teacherPlan: request.teacherPlan,
    expectedNodePath: nodePath,
  });
  const verifiedLiveLaunch = await independentlyVerifyLiveLaunchAgentInAll13(
    request.launchAgentAuthority,
    launchContext,
    liveLaunchObserver,
  );
  const sealedLaunchctl = await readV1R11HeldIdentity(
    verifiedLiveLaunch.evidence.launchctlPrint,
    verifiedLiveLaunch.evidence.launchctlPrint.schema,
    "formal-child sealed launchctl",
  );
  const stageBC = await independentlyVerifyStageBCChainInAll13({
    repositoryRoot: request.repositoryRoot,
    authorityDirectory: request.authorityDirectory.path,
    nodePath,
    teacherPlan: request.teacherPlan,
    sourceRevision: request.sourceRevision,
    runFingerprint: request.runFingerprint,
    gateDirectory: request.gateDirectory,
    ledger: request.ledger,
    rows,
    stageAReceipt: request.stageAReceipt,
    stageA,
    launchIdentity: request.launchAgentAuthority,
    launchEvidence: verifiedLiveLaunch.evidence,
    sealedLaunchctl,
  });
  await independentlyValidateRawAuthorityReceipt({
    repositoryRoot: request.repositoryRoot,
    authorityDirectory: request.authorityDirectory.path,
    teacherPlan: request.teacherPlan,
    sourceRevision: request.sourceRevision,
    runFingerprint: request.runFingerprint,
    ledger: request.ledger,
    rawReceipt: request.rawReceipt,
    launchAgentAuthority: request.launchAgentAuthority,
    gates: stageBC.gates,
  });
  const verifiedRaw = await readV1R11HeldIdentity(
    request.verifiedReceipt,
    VERIFIED_RECEIPT_SCHEMA,
    "formal-child existing verified receipt",
  );
  const verified = parseV1R11CanonicalObject(
    verifiedRaw,
    "formal-child existing verified receipt",
  );
  exactKeys(
    verified,
    [
      "schema",
      "status",
      "teacher_plan",
      "source_revision",
      "run_fingerprint",
      "required_order",
      "ledger",
      "raw_receipt",
      "gates",
      "launchagent_authority",
      "verifier",
      "authority",
    ],
    "formal-child existing verified receipt",
  );
  if (
    verified.schema !== VERIFIED_RECEIPT_SCHEMA ||
    verified.status !==
      "all-required-preformal-gates-independently-verified-formal-only-authority" ||
    verified.source_revision !== request.sourceRevision ||
    verified.run_fingerprint !== request.runFingerprint ||
    v1r11CanonicalJson(verified.teacher_plan) !==
      v1r11CanonicalJson(request.teacherPlan) ||
    v1r11CanonicalJson(verified.required_order) !==
      v1r11CanonicalJson(REQUIRED_ORDER) ||
    v1r11CanonicalJson(verified.ledger) !==
      v1r11CanonicalJson(request.ledger) ||
    v1r11CanonicalJson(verified.raw_receipt) !==
      v1r11CanonicalJson(request.rawReceipt) ||
    v1r11CanonicalJson(verified.gates) !==
      v1r11CanonicalJson(stageBC.gates) ||
    v1r11CanonicalJson(verified.launchagent_authority) !==
      v1r11CanonicalJson(request.launchAgentAuthority) ||
    v1r11CanonicalJson(verified.verifier) !== v1r11CanonicalJson(verifier) ||
    v1r11CanonicalJson(verified.authority) !==
      v1r11CanonicalJson(FORMAL_ONLY_AUTHORITY)
  ) {
    throw new Error("formal-child existing verified receipt differs");
  }
  return Object.freeze({
    status: "existing-all13-authority-independently-reauthenticated" as const,
    teacherPlan: request.teacherPlan,
    sourceRevision: request.sourceRevision,
    runFingerprint: request.runFingerprint,
    launchAgentAuthority: request.launchAgentAuthority,
    verifiedReceipt: request.verifiedReceipt,
  });
}

export async function reauthenticateHalfkp81V1R11ExistingStagedAuthorityForFormalChild(
  request: Readonly<Halfkp81V1R11ExistingStagedAuthorityRequest>,
): Promise<Readonly<Halfkp81V1R11ExistingStagedAuthorityResult>> {
  return reauthenticateHalfkp81V1R11ExistingStagedAuthorityInternal(
    request,
    fixedAll13LaunchObserver(),
    PRODUCTION_NAMESPACE,
  );
}

/** Test-only OS observation seam for the actual formal-child all-13 barrier. */
export async function reauthenticateHalfkp81V1R11ExistingStagedAuthorityWithOsBoundaryForTests(
  request: Readonly<Halfkp81V1R11ExistingStagedAuthorityRequest>,
  observer: Readonly<Halfkp81V1R11All13LiveLaunchObserver>,
): Promise<Readonly<Halfkp81V1R11ExistingStagedAuthorityResult>> {
  return reauthenticateHalfkp81V1R11ExistingStagedAuthorityInternal(
    request,
    observer,
    PRODUCTION_NAMESPACE,
  );
}

/** Scratch formal-child barrier reauthenticates every artifact with real logic. */
export async function reauthenticateHalfkp81V1R11ExistingStagedAuthorityInScratchForTests(
  capability: Readonly<Halfkp81V1R11ScratchNamespaceCapabilityForTests>,
  request: Readonly<Halfkp81V1R11ExistingStagedAuthorityRequest>,
  observer: Readonly<Halfkp81V1R11All13LiveLaunchObserver>,
): Promise<Readonly<Halfkp81V1R11ExistingStagedAuthorityResult>> {
  const namespace = resolveHalfkp81V1R11ScratchNamespaceCapabilityForTests(
    capability,
  );
  return reauthenticateHalfkp81V1R11ExistingStagedAuthorityInternal(
    request,
    observer,
    namespace,
  );
}
