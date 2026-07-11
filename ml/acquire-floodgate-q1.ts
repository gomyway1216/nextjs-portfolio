/**
 * Strict command-line entry point for the preregistered Floodgate 2026-Q1
 * acquisition. The output lock must live outside this Git worktree.
 *
 *   node -r tsx/cjs ml/acquire-floodgate-q1.ts status --output /absolute/lock
 *   node -r tsx/cjs ml/acquire-floodgate-q1.ts run --output /absolute/lock
 */

import { execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

import {
  getFloodgateAcquisitionLeaseStatus,
  runFloodgateQ1Acquisition,
  type FloodgateAcquisitionLeaseStatus,
  type FloodgateAcquisitionRunResult,
  type FloodgateQ1AcquisitionOptions,
} from "./floodgate-acquisition-runner";
import { floodgateRawFinalManifestPath } from "./floodgate-raw-lock";
import {
  verifyExistingFloodgateRawLock,
  type FloodgateRawOfflineVerificationReport,
} from "./floodgate-raw-lock-verifier";

const execFile = promisify(execFileCallback);

export const FLOODGATE_ACQUISITION_STATUS_SCHEMA =
  "shogi-floodgate-acquisition-status-v1" as const;
export const FLOODGATE_ACQUISITION_RUN_OUTPUT_SCHEMA =
  "shogi-floodgate-acquisition-run-output-v1" as const;

const REVISION_RE = /^[0-9a-f]{40}$/;

type FloodgateAcquisitionCommand = "run" | "status";

interface ParsedArguments {
  readonly command: FloodgateAcquisitionCommand;
  readonly output: string;
}

export interface FloodgateAcquisitionRepositoryContext {
  readonly repositoryRoot: string;
  readonly pipelineRevision: string;
}

export type NonProductionFloodgateAcquisitionGitForTests = (
  cwd: string,
  arguments_: readonly string[],
) => Promise<string>;

export interface NonProductionFloodgateAcquisitionCliDependenciesForTests {
  readonly resolveRepositoryContext: () => Promise<FloodgateAcquisitionRepositoryContext>;
  readonly runAcquisition: (
    options: FloodgateQ1AcquisitionOptions,
  ) => Promise<Readonly<FloodgateAcquisitionRunResult>>;
  readonly getLeaseStatus: (
    lockRoot: string,
  ) => Promise<Readonly<FloodgateAcquisitionLeaseStatus>>;
  readonly verifyExistingLock: (
    lockRoot: string,
  ) => Promise<Readonly<FloodgateRawOfflineVerificationReport>>;
  readonly writeStdout: (text: string) => void;
}

type CliDependencies = NonProductionFloodgateAcquisitionCliDependenciesForTests;

interface FloodgateAcquisitionManifestStatusAbsent {
  readonly state: "absent";
  readonly path: string;
}

interface FloodgateAcquisitionManifestStatusInvalid {
  readonly state: "invalid";
  readonly path: string;
  readonly error: string;
}

interface FloodgateAcquisitionManifestStatusVerified {
  readonly state: "verified";
  readonly path: string;
  readonly verification: Readonly<FloodgateRawOfflineVerificationReport>;
}

type FloodgateAcquisitionManifestStatus =
  | FloodgateAcquisitionManifestStatusAbsent
  | FloodgateAcquisitionManifestStatusInvalid
  | FloodgateAcquisitionManifestStatusVerified;

function fail(message: string): never {
  throw new Error(`invalid Floodgate acquisition CLI: ${message}`);
}

function parseArguments(argv: readonly string[]): Readonly<ParsedArguments> {
  if (
    !Array.isArray(argv) ||
    argv.some((argument) => typeof argument !== "string")
  ) {
    fail("arguments must be an array of strings");
  }
  const command = argv[0];
  if (command !== "run" && command !== "status") {
    fail(
      command === undefined
        ? "command is required"
        : `unknown command: ${command}`,
    );
  }

  let output: string | undefined;
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    if (option !== "--output") {
      fail(`unknown option or argument: ${option}`);
    }
    if (output !== undefined) {
      fail("duplicate option: --output");
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail("--output requires a value");
    }
    output = value;
    index += 1;
  }
  if (output === undefined) fail("--output is required");
  return Object.freeze({ command, output });
}

function canonicalAbsolutePath(input: string, label: string): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.includes("\0") ||
    !path.isAbsolute(input) ||
    path.resolve(input) !== input ||
    path.parse(input).root === input
  ) {
    fail(`${label} must be a canonical non-root absolute path`);
  }
  return input;
}

function pathIsInsideOrEqual(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

async function lstatMaybe(filePath: string): Promise<fs.Stats | null> {
  try {
    return await fs.promises.lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function assertRealCanonicalDirectory(
  directoryInput: string,
  label: string,
): Promise<string> {
  const directory = canonicalAbsolutePath(directoryInput, label);
  const stat = await fs.promises.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail(`${label} must be a real directory`);
  }
  if ((await fs.promises.realpath(directory)) !== directory) {
    fail(`${label} must not traverse symbolic links`);
  }
  return directory;
}

async function validateLockRoot(
  outputInput: string,
  repositoryRoot: string,
): Promise<string> {
  const output = canonicalAbsolutePath(outputInput, "output");
  const parent = await assertRealCanonicalDirectory(
    path.dirname(output),
    "output parent",
  );
  const existing = await lstatMaybe(output);
  if (existing !== null) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) {
      fail("existing output must be a real directory");
    }
    if ((await fs.promises.realpath(output)) !== output) {
      fail("output must not traverse symbolic links");
    }
  } else if (path.dirname(output) !== parent) {
    fail("output parent identity changed during validation");
  }
  if (
    pathIsInsideOrEqual(repositoryRoot, output) ||
    pathIsInsideOrEqual(output, repositoryRoot)
  ) {
    fail("output and the Git worktree must not contain one another");
  }
  return output;
}

function parseGitLine(output: string, label: string): string {
  if (
    typeof output !== "string" ||
    !output.endsWith("\n") ||
    output.includes("\r")
  ) {
    fail(`${label} did not return one LF-terminated line`);
  }
  const value = output.slice(0, -1);
  if (value.length === 0 || value.includes("\n")) {
    fail(`${label} did not return exactly one line`);
  }
  return value;
}

async function productionGit(
  cwd: string,
  arguments_: readonly string[],
): Promise<string> {
  const { stdout } = await execFile(
    "git",
    ["--no-optional-locks", ...arguments_],
    {
      cwd,
      encoding: "utf8",
    },
  );
  return stdout;
}

async function resolveRepositoryContext(
  moduleDirectoryInput: string,
  git: NonProductionFloodgateAcquisitionGitForTests,
): Promise<Readonly<FloodgateAcquisitionRepositoryContext>> {
  const moduleDirectory = await assertRealCanonicalDirectory(
    moduleDirectoryInput,
    "CLI module directory",
  );
  const topLevel = canonicalAbsolutePath(
    parseGitLine(
      await git(moduleDirectory, ["rev-parse", "--show-toplevel"]),
      "git top-level discovery",
    ),
    "Git top-level",
  );
  const repositoryRoot = await assertRealCanonicalDirectory(
    topLevel,
    "Git top-level",
  );
  if (!pathIsInsideOrEqual(repositoryRoot, moduleDirectory)) {
    fail("CLI module is not inside the reported Git worktree");
  }
  const pipelineRevision = parseGitLine(
    await git(repositoryRoot, ["rev-parse", "--verify", "HEAD^{commit}"]),
    "git HEAD discovery",
  );
  if (!REVISION_RE.test(pipelineRevision)) {
    fail("git HEAD is not a full lowercase 40-hex commit");
  }
  return Object.freeze({ repositoryRoot, pipelineRevision });
}

/** Explicit non-production seam for repository-discovery unit tests. */
export async function resolveNonProductionFloodgateRepositoryContextForTests(
  moduleDirectory: string,
  git: NonProductionFloodgateAcquisitionGitForTests,
): Promise<Readonly<FloodgateAcquisitionRepositoryContext>> {
  return resolveRepositoryContext(moduleDirectory, git);
}

function normalizedError(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return String(error);
  } catch {
    return "unknown non-Error failure";
  }
}

async function readManifestStatus(
  lockRoot: string,
  verifyExistingLock: CliDependencies["verifyExistingLock"],
): Promise<Readonly<FloodgateAcquisitionManifestStatus>> {
  const manifestPath = path.join(lockRoot, floodgateRawFinalManifestPath());
  let stat: fs.Stats | null;
  try {
    stat = await lstatMaybe(manifestPath);
  } catch (error) {
    return Object.freeze({
      state: "invalid",
      path: manifestPath,
      error: normalizedError(error),
    });
  }
  if (stat === null) {
    return Object.freeze({ state: "absent", path: manifestPath });
  }
  try {
    const verification = await verifyExistingLock(lockRoot);
    return Object.freeze({
      state: "verified",
      path: manifestPath,
      verification,
    });
  } catch (error) {
    return Object.freeze({
      state: "invalid",
      path: manifestPath,
      error: normalizedError(error),
    });
  }
}

async function readLeaseStatus(
  lockRoot: string,
  getLeaseStatus: CliDependencies["getLeaseStatus"],
): Promise<Readonly<FloodgateAcquisitionLeaseStatus>> {
  try {
    return await getLeaseStatus(lockRoot);
  } catch (error) {
    return Object.freeze({
      state: "invalid",
      lease_root: `${lockRoot}.lease`,
      error: normalizedError(error),
    });
  }
}

async function executeCli(
  argv: readonly string[],
  dependencies: CliDependencies,
): Promise<0 | 1> {
  const arguments_ = parseArguments(argv);
  const context = await dependencies.resolveRepositoryContext();
  const repositoryRoot = await assertRealCanonicalDirectory(
    context.repositoryRoot,
    "repository root",
  );
  if (!REVISION_RE.test(context.pipelineRevision)) {
    fail("pipeline revision must be a full lowercase 40-hex commit");
  }
  const lockRoot = await validateLockRoot(arguments_.output, repositoryRoot);

  if (arguments_.command === "run") {
    const result = await dependencies.runAcquisition({
      repositoryRoot,
      lockRoot,
      pipelineRevision: context.pipelineRevision,
    });
    dependencies.writeStdout(
      `${JSON.stringify(
        {
          schema: FLOODGATE_ACQUISITION_RUN_OUTPUT_SCHEMA,
          repository_root: repositoryRoot,
          pipeline_revision: context.pipelineRevision,
          lock_root: lockRoot,
          result,
        },
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  const [lease, manifest] = await Promise.all([
    readLeaseStatus(lockRoot, dependencies.getLeaseStatus),
    readManifestStatus(lockRoot, dependencies.verifyExistingLock),
  ]);
  dependencies.writeStdout(
    `${JSON.stringify(
      {
        schema: FLOODGATE_ACQUISITION_STATUS_SCHEMA,
        repository_root: repositoryRoot,
        pipeline_revision: context.pipelineRevision,
        lock_root: lockRoot,
        lease,
        manifest,
      },
      null,
      2,
    )}\n`,
  );
  return lease.state === "invalid" || manifest.state === "invalid" ? 1 : 0;
}

/** Explicit non-production seam for strict dispatch and status unit tests. */
export async function runNonProductionFloodgateAcquisitionCliForTests(
  argv: readonly string[],
  dependencies: NonProductionFloodgateAcquisitionCliDependenciesForTests,
): Promise<0 | 1> {
  return executeCli(argv, dependencies);
}

const PRODUCTION_DEPENDENCIES: CliDependencies = Object.freeze({
  resolveRepositoryContext: () =>
    resolveRepositoryContext(__dirname, productionGit),
  runAcquisition: runFloodgateQ1Acquisition,
  getLeaseStatus: getFloodgateAcquisitionLeaseStatus,
  verifyExistingLock: verifyExistingFloodgateRawLock,
  writeStdout: (text: string) => process.stdout.write(text),
});

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<0 | 1> {
  const exitCode = await executeCli(argv, PRODUCTION_DEPENDENCIES);
  if (exitCode !== 0) process.exitCode = exitCode;
  return exitCode;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
