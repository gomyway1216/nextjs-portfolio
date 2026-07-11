/**
 * Strict production CLI for publishing or independently verifying the
 * label-free Floodgate role bundle.
 *
 *   node -r tsx/cjs ml/create-floodgate-role-bundle.ts publish \
 *     --raw-lock /canonical/absolute/completed-raw-lock \
 *     --role-lock /canonical/absolute/completed-role-lock \
 *     --output /canonical/absolute/fresh-role-bundle
 */

import { execFile as execFileCallback } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify, types as nodeUtilTypes } from "node:util";

import {
  createFloodgateRoleBundle,
  verifyExistingFloodgateRoleBundle,
  type CreateFloodgateRoleBundleOptions,
  type FloodgateRoleBundleManifest,
  type VerifiedFloodgateRoleBundle,
  type VerifyExistingFloodgateRoleBundleOptions,
} from "./floodgate-role-bundle";

const execFile = promisify(execFileCallback);

export const FLOODGATE_ROLE_BUNDLE_CLI_OUTPUT_SCHEMA =
  "shogi-floodgate-role-bundle-cli-output-v2" as const;
export const FLOODGATE_ROLE_BUNDLE_LEGACY_REPLAY_PATH =
  "ml/data/wcsc36/int16-aware-replay-excluded-position-ids.txt" as const;
export const FLOODGATE_ROLE_BUNDLE_PRODUCTION_GIT_PREFIX = Object.freeze([
  "--no-replace-objects",
  "--no-optional-locks",
] as const);

const REVISION_RE = /^[0-9a-f]{40}$/;

export type FloodgateRoleBundleCliMode = "publish" | "verify";

interface ParsedArguments {
  readonly mode: FloodgateRoleBundleCliMode;
  readonly rawLockRoot: string;
  readonly roleLockRoot: string;
  readonly outputRoot: string;
}

export interface FloodgateRoleBundleRepositoryContext {
  readonly repositoryRoot: string;
  readonly verifierRevision: string;
}

export type NonProductionFloodgateRoleBundleGitForTests = (
  cwd: string,
  arguments_: readonly string[],
) => Promise<string>;

export interface NonProductionFloodgateRoleBundleCliDependenciesForTests {
  readonly resolveRepositoryContext: () => Promise<FloodgateRoleBundleRepositoryContext>;
  readonly publishBundle: (
    options: CreateFloodgateRoleBundleOptions,
  ) => Promise<Readonly<FloodgateRoleBundleManifest>>;
  readonly verifyBundle: (
    options: VerifyExistingFloodgateRoleBundleOptions,
  ) => Promise<Readonly<VerifiedFloodgateRoleBundle>>;
  readonly writeStdout: (text: string) => void;
}

type CliDependencies = NonProductionFloodgateRoleBundleCliDependenciesForTests;

function fail(message: string): never {
  throw new Error(`invalid Floodgate role-bundle CLI: ${message}`);
}

function canonicalAbsolutePath(input: unknown, label: string): string {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input !== input.trim() ||
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
    nodeUtilTypes.isProxy(argv) ||
    !Array.isArray(argv) ||
    Object.getPrototypeOf(argv) !== Array.prototype ||
    Object.getOwnPropertySymbols(argv).length !== 0 ||
    argv.length !== 7 ||
    (argv[0] !== "publish" && argv[0] !== "verify") ||
    argv[1] !== "--raw-lock" ||
    argv[3] !== "--role-lock" ||
    argv[5] !== "--output"
  ) {
    fail(
      "usage: (publish|verify) --raw-lock /absolute/raw-lock --role-lock /absolute/role-lock --output /absolute/role-bundle",
    );
  }
  return Object.freeze({
    mode: argv[0],
    rawLockRoot: canonicalAbsolutePath(argv[2], "raw lock"),
    roleLockRoot: canonicalAbsolutePath(argv[4], "role lock"),
    outputRoot: canonicalAbsolutePath(argv[6], "output"),
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
  const stat = await lstatMaybe(directory);
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
    fail(`${label} must be a real existing directory`);
  }
  if ((await fs.promises.realpath(directory)) !== directory) {
    fail(`${label} must not traverse symbolic links`);
  }
  return directory;
}

async function assertRealCanonicalFile(
  fileInput: string,
  label: string,
): Promise<string> {
  const filePath = canonicalAbsolutePath(fileInput, label);
  const stat = await lstatMaybe(filePath);
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
    fail(`${label} must be a real existing regular file`);
  }
  if ((await fs.promises.realpath(filePath)) !== filePath) {
    fail(`${label} must not traverse symbolic links`);
  }
  return filePath;
}

async function validateRoots(
  arguments_: Readonly<ParsedArguments>,
  repositoryRoot: string,
): Promise<string> {
  await Promise.all([
    assertRealCanonicalDirectory(arguments_.rawLockRoot, "raw lock"),
    assertRealCanonicalDirectory(arguments_.roleLockRoot, "role lock"),
  ]);
  if (arguments_.mode === "publish") {
    await assertRealCanonicalDirectory(
      path.dirname(arguments_.outputRoot),
      "output parent",
    );
    if ((await lstatMaybe(arguments_.outputRoot)) !== null) {
      fail("publish output must not already exist");
    }
  } else {
    await assertRealCanonicalDirectory(arguments_.outputRoot, "verify output");
  }

  const roots = [
    repositoryRoot,
    arguments_.rawLockRoot,
    arguments_.roleLockRoot,
    arguments_.outputRoot,
  ];
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      assertDisjointTrees(
        roots[left],
        roots[right],
        `root pair ${left}/${right}`,
      );
    }
  }

  return assertRealCanonicalFile(
    path.join(repositoryRoot, FLOODGATE_ROLE_BUNDLE_LEGACY_REPLAY_PATH),
    "pinned legacy replay exclusion",
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
    [...FLOODGATE_ROLE_BUNDLE_PRODUCTION_GIT_PREFIX, ...arguments_],
    { cwd, encoding: "utf8" },
  );
  return stdout;
}

function cliErrorDiagnostic(error: unknown): unknown {
  return error instanceof Error ? (error.stack ?? error.message) : error;
}

/** Explicit non-production seam for the executable entry-point diagnostic. */
export function floodgateRoleBundleCliErrorDiagnosticForTests(
  error: unknown,
): unknown {
  return cliErrorDiagnostic(error);
}

async function resolveRepositoryContext(
  moduleDirectoryInput: string,
  git: NonProductionFloodgateRoleBundleGitForTests,
): Promise<Readonly<FloodgateRoleBundleRepositoryContext>> {
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
  const verifierRevision = parseGitLine(
    await git(repositoryRoot, ["rev-parse", "--verify", "HEAD^{commit}"]),
    "git HEAD discovery",
  );
  if (!REVISION_RE.test(verifierRevision)) {
    fail("git HEAD is not a full lowercase 40-hex commit");
  }
  return Object.freeze({ repositoryRoot, verifierRevision });
}

/** Explicit non-production seam for repository-discovery unit tests. */
export async function resolveNonProductionFloodgateRoleBundleRepositoryContextForTests(
  moduleDirectory: string,
  git: NonProductionFloodgateRoleBundleGitForTests,
): Promise<Readonly<FloodgateRoleBundleRepositoryContext>> {
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
  if (!REVISION_RE.test(context.verifierRevision)) {
    fail("verifier revision must be a full lowercase 40-hex commit");
  }
  const legacyProtectedPositionIdsPath = await validateRoots(
    arguments_,
    repositoryRoot,
  );
  const options = {
    repositoryRoot,
    verifierRevision: context.verifierRevision,
    rawLockRoot: arguments_.rawLockRoot,
    roleLockRoot: arguments_.roleLockRoot,
    legacyProtectedPositionIdsPath,
    outputRoot: arguments_.outputRoot,
  };

  let manifest: Readonly<FloodgateRoleBundleManifest>;
  let producerRevision: string;
  if (arguments_.mode === "publish") {
    manifest = await dependencies.publishBundle(options);
    producerRevision = manifest.pipeline.source_revision;
  } else {
    const verified = await dependencies.verifyBundle(options);
    manifest = verified.manifest;
    producerRevision = verified.producerRevision;
    if (verified.verifierRevision !== context.verifierRevision) {
      fail("bundle verifier metadata does not match the CLI revision");
    }
  }
  if (!REVISION_RE.test(producerRevision)) {
    fail("bundle producer revision must be a full lowercase 40-hex commit");
  }
  if (manifest.pipeline.source_revision !== producerRevision) {
    fail("bundle producer metadata does not match its manifest");
  }
  if (
    arguments_.mode === "publish" &&
    producerRevision !== context.verifierRevision
  ) {
    fail("new bundle producer revision must equal the CLI revision");
  }
  dependencies.writeStdout(
    `${JSON.stringify(
      {
        schema: FLOODGATE_ROLE_BUNDLE_CLI_OUTPUT_SCHEMA,
        mode: arguments_.mode,
        repository_root: repositoryRoot,
        producer_revision: producerRevision,
        verifier_revision: context.verifierRevision,
        raw_lock_root: arguments_.rawLockRoot,
        role_lock_root: arguments_.roleLockRoot,
        output_root: arguments_.outputRoot,
        manifest,
      },
      null,
      2,
    )}\n`,
  );
  return 0;
}

/** Explicit non-production seam for strict CLI dispatch unit tests. */
export async function runNonProductionFloodgateRoleBundleCliForTests(
  argv: readonly string[],
  dependencies: NonProductionFloodgateRoleBundleCliDependenciesForTests,
): Promise<0> {
  return executeCli(argv, dependencies);
}

const PRODUCTION_DEPENDENCIES: CliDependencies = Object.freeze({
  resolveRepositoryContext: () =>
    resolveRepositoryContext(__dirname, productionGit),
  publishBundle: createFloodgateRoleBundle,
  verifyBundle: verifyExistingFloodgateRoleBundle,
  writeStdout: (text: string) => process.stdout.write(text),
});

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<0> {
  return executeCli(argv, PRODUCTION_DEPENDENCIES);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(cliErrorDiagnostic(error));
    process.exitCode = 1;
  });
}
