/**
 * Argumentless, local-only production entry point for the v9 teacher-to-plan
 * provenance bridge. Successful stdout is one privacy-safe JSON line.
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  verifyFloodgateStrengthFirstV9DownstreamProvenance,
} from "./floodgate-strength-first-v8-downstream-provenance";
import {
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_BUNDLE_DIRECTORY,
} from "./floodgate-strength-first-fast-training-input";
import {
  captureFloodgateStrengthFirstV8TeacherAuthorityReceipt,
} from "./floodgate-strength-first-v8-teacher-authority";
import {
  captureFloodgateStrengthFirstV9TeacherAuthorityReceipt,
} from "./floodgate-strength-first-v9-teacher-authority";
import {
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_NODE_VERSION,
  floodgateStrengthFirstV9TeacherPaths,
} from "./floodgate-strength-first-v9-teacher-runner";

function productionEffectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("unsupported-runtime");
  }
  return process.geteuid();
}

function parseResultForAuthority(bytes: Uint8Array): Record<string, unknown> {
  const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid-result");
  }
  return parsed as Record<string, unknown>;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label);
  }
  return value as Record<string, unknown>;
}

function captureSerializedAuthority(
  result: Record<string, unknown>,
  effectiveUserId: number,
): unknown {
  const serializedV9 = record(
    result.production_asset_preflight,
    "invalid-v9-authority",
  );
  const serializedV8 = record(
    serializedV9.asset_authority,
    "invalid-v8-authority",
  );
  const legacy = record(
    serializedV8.asset_authority,
    "invalid-legacy-authority",
  );
  const capturedV8 = captureFloodgateStrengthFirstV8TeacherAuthorityReceipt(
    {
      ...serializedV8,
      asset_authority: legacy,
      assets: legacy.assets,
      engine: legacy.engine,
      postverification: legacy.postverification,
    },
    "production-fixed-registry-and-deployment-root",
    effectiveUserId,
  );
  return captureFloodgateStrengthFirstV9TeacherAuthorityReceipt(
    {
      ...serializedV9,
      asset_authority: capturedV8,
      assets: capturedV8.assets,
      engine: capturedV8.engine,
      postverification: capturedV8.postverification,
    },
    "production-fixed-registry-and-deployment-root",
    effectiveUserId,
  );
}

function revisionDescendsFrom(
  repositoryRoot: string,
  home: string,
  revision: string,
  minimumRevision: string,
): boolean {
  const result = spawnSync(
    "/usr/bin/git",
    [
      "-c",
      "core.hooksPath=/dev/null",
      "merge-base",
      "--is-ancestor",
      minimumRevision,
      revision,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_NO_REPLACE_OBJECTS: "1",
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
        HOME: home,
        LC_ALL: "C",
        PATH: "/usr/bin:/bin",
      },
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 30_000,
    },
  );
  return result.status === 0 && result.error === undefined;
}

export async function runFloodgateStrengthFirstV9DownstreamProvenanceCli(
  arguments_: readonly string[] = process.argv.slice(2),
): Promise<void> {
  if (
    arguments_.length !== 0 ||
    process.version !== FLOODGATE_STRENGTH_FIRST_V9_TEACHER_NODE_VERSION ||
    process.platform !== "darwin" ||
    process.arch !== "arm64"
  ) {
    throw new Error("unsupported-invocation");
  }
  const effectiveUserId = productionEffectiveUserId();
  const home = os.userInfo().homedir;
  const repositoryRoot = path.resolve(__dirname, "..");
  const paths = floodgateStrengthFirstV9TeacherPaths(home, repositoryRoot);
  const manifestPath = path.join(paths.stageRoot, "manifest.json");
  const stagedResultPath = path.join(paths.stageRoot, "staged-result.json");
  const workPath = path.join(paths.stageRoot, "work.jsonl");
  const completionPath = path.join(
    paths.stageRoot,
    "parent-completion.jsonl",
  );
  const trainPath = path.join(paths.stageRoot, "train.jsonl");
  const authenticatedInputRawPath = path.join(
    home,
    ".codex",
    "shogi-bundles",
    FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_BUNDLE_DIRECTORY,
    "training.raw.jsonl",
  );
  const [
    result,
    manifest,
    stagedResult,
    milestone100,
    milestone500,
    parentCompletion,
    train,
    authenticatedInputRaw,
  ] = await Promise.all([
    fs.promises.readFile(paths.result),
    fs.promises.readFile(manifestPath),
    fs.promises.readFile(stagedResultPath),
    fs.promises.readFile(paths.milestone100),
    fs.promises.readFile(paths.milestone500),
    fs.promises.readFile(completionPath),
    fs.promises.readFile(trainPath),
    fs.promises.readFile(authenticatedInputRawPath),
  ]);
  const resultValue = parseResultForAuthority(result);
  const expectedAssetAuthority = captureSerializedAuthority(
    resultValue,
    effectiveUserId,
  );
  const summary =
    await verifyFloodgateStrengthFirstV9DownstreamProvenance({
      result,
      manifest,
      stagedResult,
      milestone100,
      milestone500,
      work: fs.createReadStream(workPath),
      parentCompletion,
      train,
      authenticatedInputRaw,
      expectedAssetAuthority,
      verifyRevisionDescendant: (revision, minimumRevision) =>
        revisionDescendsFrom(
          repositoryRoot,
          home,
          revision,
          minimumRevision,
        ),
    });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

if (require.main === module) {
  void runFloodgateStrengthFirstV9DownstreamProvenanceCli().catch(() => {
    process.stderr.write("v9 downstream provenance verification failed\n");
    process.exitCode = 1;
  });
}
