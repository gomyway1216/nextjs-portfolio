/** Strict stdout-only CLI for a completed Floodgate acquisition summary. */

import * as path from "node:path";

import {
  summarizeExistingFloodgateAcquisition,
  type FloodgateAcquisitionResultArtifact,
} from "./floodgate-acquisition-summary";

export interface NonProductionFloodgateSummaryCliDependenciesForTests {
  readonly summarize: (
    lockRoot: string,
  ) => Promise<FloodgateAcquisitionResultArtifact>;
  readonly writeStdout: (text: string) => void;
}

function fail(message: string): never {
  throw new Error(`invalid Floodgate summary CLI: ${message}`);
}

function parseArguments(argv: readonly string[]): string {
  if (
    !Array.isArray(argv) ||
    argv.length !== 2 ||
    argv[0] !== "--input" ||
    typeof argv[1] !== "string"
  ) {
    fail("usage: --input /canonical/absolute/raw-lock");
  }
  const lockRoot = argv[1];
  if (
    lockRoot.length === 0 ||
    lockRoot.includes("\0") ||
    !path.isAbsolute(lockRoot) ||
    path.resolve(lockRoot) !== lockRoot ||
    path.parse(lockRoot).root === lockRoot
  ) {
    fail("input must be a canonical non-root absolute path");
  }
  return lockRoot;
}

async function execute(
  argv: readonly string[],
  dependencies: NonProductionFloodgateSummaryCliDependenciesForTests,
): Promise<0> {
  const lockRoot = parseArguments(argv);
  const artifact = await dependencies.summarize(lockRoot);
  dependencies.writeStdout(artifact.canonical_json);
  return 0;
}

export async function runNonProductionFloodgateSummaryCliForTests(
  argv: readonly string[],
  dependencies: NonProductionFloodgateSummaryCliDependenciesForTests,
): Promise<0> {
  return execute(argv, dependencies);
}

const PRODUCTION_DEPENDENCIES = Object.freeze({
  summarize: summarizeExistingFloodgateAcquisition,
  writeStdout: (text: string) => process.stdout.write(text),
});

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<0> {
  return execute(argv, PRODUCTION_DEPENDENCIES);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
