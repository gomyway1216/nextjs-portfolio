/**
 * Strict production CLI for publishing the preregistered Floodgate role lock.
 *
 *   node -r tsx/cjs ml/create-floodgate-role-lock.ts \
 *     --input /canonical/absolute/completed-raw-lock \
 *     --output /canonical/absolute/fresh-role-lock
 */

import { execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

import {
  createFloodgateRoleLock,
  type CreateFloodgateRoleLockOptions,
  type FloodgateRoleLockManifest,
} from "./floodgate-role-lock";

const execFile = promisify(execFileCallback);

export const FLOODGATE_ROLE_LOCK_CLI_OUTPUT_SCHEMA =
  "shogi-floodgate-role-lock-cli-output-v1" as const;

const REVISION_RE = /^[0-9a-f]{40}$/;

interface ParsedArguments {
  readonly rawLockRoot: string;
  readonly roleLockRoot: string;
}

export interface FloodgateRoleLockRepositoryContext {
  readonly repositoryRoot: string;
  readonly pipelineRevision: string;
}

export type NonProductionFloodgateRoleLockGitForTests = (
  cwd: string,
  arguments_: readonly string[],
) => Promise<string>;

export interface NonProductionFloodgateRoleLockCliDependenciesForTests {
  readonly resolveRepositoryContext: () => Promise<FloodgateRoleLockRepositoryContext>;
  readonly createRoleLock: (
    options: CreateFloodgateRoleLockOptions,
  ) => Promise<Readonly<FloodgateRoleLockManifest>>;
  readonly writeStdout: (text: string) => void;
}

type CliDependencies = NonProductionFloodgateRoleLockCliDependenciesForTests;

function fail(message: string): never {
  throw new Error(`invalid Floodgate role-lock CLI: ${message}`);
}

function canonicalAbsolutePath(input: unknown, label: string): string {
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

function parseArguments(argv: readonly string[]): Readonly<ParsedArguments> {
  if (
    !Array.isArray(argv) ||
    argv.length !== 4 ||
    argv[0] !== "--input" ||
    argv[2] !== "--output"
  ) {
    fail(
      "usage: --input /canonical/absolute/completed-raw-lock --output /canonical/absolute/fresh-role-lock",
    );
  }
  return Object.freeze({
    rawLockRoot: canonicalAbsolutePath(argv[1], "input"),
    roleLockRoot: canonicalAbsolutePath(argv[3], "output"),
  });
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

function assertDisjointTrees(left: string, right: string, label: string): void {
  if (pathIsInsideOrEqual(left, right) || pathIsInsideOrEqual(right, left)) {
    fail(`${label} must be disjoint directory trees`);
  }
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
  let stat: fs.Stats;
  try {
    stat = await fs.promises.lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fail(`${label} must exist`);
    }
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail(`${label} must be a real directory`);
  }
  if ((await fs.promises.realpath(directory)) !== directory) {
    fail(`${label} must not traverse symbolic links`);
  }
  return directory;
}

async function validateRoleLockRoots(
  arguments_: Readonly<ParsedArguments>,
  repositoryRoot: string,
): Promise<void> {
  await assertRealCanonicalDirectory(arguments_.rawLockRoot, "input");
  await assertRealCanonicalDirectory(
    path.dirname(arguments_.roleLockRoot),
    "output parent",
  );
  if ((await lstatMaybe(arguments_.roleLockRoot)) !== null) {
    fail("output must not already exist");
  }
  assertDisjointTrees(
    arguments_.rawLockRoot,
    arguments_.roleLockRoot,
    "input and output",
  );
  assertDisjointTrees(
    repositoryRoot,
    arguments_.rawLockRoot,
    "Git worktree and input",
  );
  assertDisjointTrees(
    repositoryRoot,
    arguments_.roleLockRoot,
    "Git worktree and output",
  );
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
    { cwd, encoding: "utf8" },
  );
  return stdout;
}

async function resolveRepositoryContext(
  moduleDirectoryInput: string,
  git: NonProductionFloodgateRoleLockGitForTests,
): Promise<Readonly<FloodgateRoleLockRepositoryContext>> {
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
export async function resolveNonProductionFloodgateRoleLockRepositoryContextForTests(
  moduleDirectory: string,
  git: NonProductionFloodgateRoleLockGitForTests,
): Promise<Readonly<FloodgateRoleLockRepositoryContext>> {
  return resolveRepositoryContext(moduleDirectory, git);
}

async function executeCli(
  argv: readonly string[],
  dependencies: CliDependencies,
): Promise<0> {
  const arguments_ = parseArguments(argv);
  const context = await dependencies.resolveRepositoryContext();
  const repositoryRoot = await assertRealCanonicalDirectory(
    context.repositoryRoot,
    "repository root",
  );
  if (!REVISION_RE.test(context.pipelineRevision)) {
    fail("pipeline revision must be a full lowercase 40-hex commit");
  }
  await validateRoleLockRoots(arguments_, repositoryRoot);

  const manifest = await dependencies.createRoleLock({
    repositoryRoot,
    pipelineRevision: context.pipelineRevision,
    rawLockRoot: arguments_.rawLockRoot,
    roleLockRoot: arguments_.roleLockRoot,
    legacyProtectedPositionIdsPath: path.join(
      repositoryRoot,
      "ml/data/wcsc36/int16-aware-replay-excluded-position-ids.txt",
    ),
  });
  dependencies.writeStdout(
    `${JSON.stringify(
      {
        schema: FLOODGATE_ROLE_LOCK_CLI_OUTPUT_SCHEMA,
        repository_root: repositoryRoot,
        pipeline_revision: context.pipelineRevision,
        raw_lock_root: arguments_.rawLockRoot,
        role_lock_root: arguments_.roleLockRoot,
        manifest,
      },
      null,
      2,
    )}\n`,
  );
  return 0;
}

/** Explicit non-production seam for strict CLI dispatch unit tests. */
export async function runNonProductionFloodgateRoleLockCliForTests(
  argv: readonly string[],
  dependencies: NonProductionFloodgateRoleLockCliDependenciesForTests,
): Promise<0> {
  return executeCli(argv, dependencies);
}

const PRODUCTION_DEPENDENCIES: CliDependencies = Object.freeze({
  resolveRepositoryContext: () =>
    resolveRepositoryContext(__dirname, productionGit),
  createRoleLock: createFloodgateRoleLock,
  writeStdout: (text: string) => process.stdout.write(text),
});

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<0> {
  return executeCli(argv, PRODUCTION_DEPENDENCIES);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
