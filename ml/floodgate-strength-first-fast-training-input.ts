/**
 * Fast, read-only input boundary for the local strength-first teacher.
 *
 * The historical role-bundle verifier rebuilds the complete allocation from
 * source CSA files. That remains useful as an offline reproduction audit, but
 * it is unnecessary before every teacher run. This boundary instead pins the
 * already-published bundle manifest and training-role bytes, holds both files
 * open while reading them, and runs the existing row/SFEN/legal-move validator.
 * No holdout or selection pathname is constructed or opened.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION,
  FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
  FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
} from "./floodgate-role-bundle-result";
import {
  FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
  type FloodgateRoleBundleRawIdentity,
} from "./floodgate-role-bundle";
import {
  parseAuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingParent,
} from "./floodgate-training-row-validation";
import {
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingInputBinding,
} from "./floodgate-training-row-consumer";

export const FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA =
  "shogi-floodgate-strength-first-fast-training-input-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY =
  "pinned-manifest-and-held-training-fd-semantic-validation-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_BUNDLE_DIRECTORY =
  "floodgate-q1-2026-label-free-role-bundle-v2" as const;
export const FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY =
  Object.freeze({
    path: "training.raw.jsonl",
    format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
    bytes: 15_369_952,
    sha256: "c9ee90da69135ead5dbb60cbab6eaa82ad018db791132dd4ec122d6088c37b62",
    records: 24_000,
    games: 1_000,
    game_ids_sha256:
      "97609ce53a9dee1fffd8faadcf408d79bc3e0724c17d52d8a2ac095bc607e3d7",
    parent_ids_sha256:
      "6681bd08bb282be04f47bf3157ea07fbbe2bc6a6864a100ce65902dc9cc3f08f",
    position_ids_count: 24_000,
    position_ids_sha256:
      "a97788b608a6687c078b7fbe2172a5c4068c57a42ed322c3997692f697e73b5c",
  } as const satisfies FloodgateRoleBundleRawIdentity);

const FILE_MODE = 0o600;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;

export interface FloodgateStrengthFirstFastFileIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface FloodgateStrengthFirstFastTrainingInput {
  readonly schema: typeof FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA;
  readonly role: "training";
  readonly policy: typeof FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY;
  readonly manifest: Readonly<FloodgateStrengthFirstFastFileIdentity>;
  readonly source: Readonly<FloodgateRoleBundleRawIdentity>;
  readonly rows: readonly Readonly<FloodgateTrainingParent>[];
}

export interface FloodgateStrengthFirstFastTrainingInputContractForTests {
  readonly bundleRelativeComponents: readonly string[];
  readonly manifest: Readonly<FloodgateStrengthFirstFastFileIdentity>;
  readonly training: Readonly<FloodgateRoleBundleRawIdentity>;
}

export interface FloodgateStrengthFirstFastTrainingInputDependenciesForTests {
  readonly open: (
    filePath: string,
    flags: number,
  ) => Promise<fs.promises.FileHandle>;
  readonly effectiveUserId: number;
  readonly afterReadBeforePostflight?: () => Promise<void>;
}

interface HeldSnapshot {
  readonly handle: fs.promises.FileHandle;
  readonly before: fs.BigIntStats;
  readonly bytes: Buffer;
}

const PRODUCTION_CONTRACT: Readonly<FloodgateStrengthFirstFastTrainingInputContractForTests> =
  Object.freeze({
    bundleRelativeComponents: Object.freeze([
      ".codex",
      "shogi-bundles",
      FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_BUNDLE_DIRECTORY,
    ]),
    manifest: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY,
    training: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY,
  });

function fail(message: string): never {
  throw new Error(`fast strength-first training input: ${message}`);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalHome(value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    !path.isAbsolute(value) ||
    path.resolve(value) !== value
  ) {
    fail("home must be a canonical absolute path");
  }
  return value;
}

function canonicalRelativeFilename(value: string, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    path.basename(value) !== value ||
    value === "." ||
    value === ".."
  ) {
    fail(`${label} path is not one fixed filename`);
  }
  return value;
}

function fileIdentity(
  value: Readonly<FloodgateStrengthFirstFastFileIdentity>,
  label: string,
): Readonly<FloodgateStrengthFirstFastFileIdentity> {
  const keys = Object.keys(value).sort();
  if (
    keys.join("\0") !== ["bytes", "path", "sha256"].sort().join("\0") ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes <= 0 ||
    typeof value.sha256 !== "string" ||
    !SHA256_RE.test(value.sha256)
  ) {
    fail(`${label} identity is invalid`);
  }
  return Object.freeze({
    path: canonicalRelativeFilename(value.path, label),
    bytes: value.bytes,
    sha256: value.sha256,
  });
}

function sameRawIdentity(
  actual: unknown,
  expected: Readonly<FloodgateRoleBundleRawIdentity>,
): boolean {
  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
    return false;
  }
  const candidate = actual as Record<string, unknown>;
  const expectedRecord = expected as unknown as Record<string, unknown>;
  const expectedKeys = Object.keys(expectedRecord).sort();
  const actualKeys = Object.keys(candidate).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index]) &&
    expectedKeys.every((key) => candidate[key] === expectedRecord[key])
  );
}

function validateHeldStat(
  stat: fs.BigIntStats,
  expectedBytes: number,
  effectiveUserId: number,
  label: string,
): void {
  if (
    !stat.isFile() ||
    stat.nlink !== 1n ||
    stat.size !== BigInt(expectedBytes) ||
    Number(stat.mode & 0o777n) !== FILE_MODE ||
    stat.uid !== BigInt(effectiveUserId)
  ) {
    fail(`${label} is not the expected private regular file`);
  }
}

function sameHeldFile(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.mode === right.mode &&
    left.nlink === right.nlink &&
    left.uid === right.uid &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

async function openHeldSnapshot(
  filePath: string,
  expected: Readonly<FloodgateStrengthFirstFastFileIdentity>,
  dependencies: Readonly<FloodgateStrengthFirstFastTrainingInputDependenciesForTests>,
  label: string,
): Promise<HeldSnapshot> {
  const handle = await dependencies.open(
    filePath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const before = await handle.stat({ bigint: true });
    validateHeldStat(
      before,
      expected.bytes,
      dependencies.effectiveUserId,
      label,
    );
    const bytes = await handle.readFile();
    if (
      bytes.byteLength !== expected.bytes ||
      sha256(bytes) !== expected.sha256
    ) {
      fail(`${label} bytes differ from the pinned identity`);
    }
    return Object.freeze({ handle, before, bytes });
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

async function closeSnapshots(
  snapshots: readonly HeldSnapshot[],
): Promise<void> {
  const failures: unknown[] = [];
  for (const snapshot of snapshots) {
    try {
      await snapshot.handle.close();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "failed to close fast training snapshots",
    );
  }
}

function parsePinnedManifest(
  bytes: Uint8Array,
  expectedTraining: Readonly<FloodgateRoleBundleRawIdentity>,
): void {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    fail("pinned bundle manifest is not JSON");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("pinned bundle manifest is not an object");
  }
  const roles = (value as Record<string, unknown>).roles;
  if (roles === null || typeof roles !== "object" || Array.isArray(roles)) {
    fail("pinned bundle manifest has no role map");
  }
  const training = (roles as Record<string, unknown>).training;
  if (
    training === null ||
    typeof training !== "object" ||
    Array.isArray(training) ||
    !sameRawIdentity(
      (training as Record<string, unknown>).raw_parents,
      expectedTraining,
    )
  ) {
    fail("pinned bundle manifest training role differs");
  }
}

async function loadWithContract(
  homeInput: string,
  contract: Readonly<FloodgateStrengthFirstFastTrainingInputContractForTests>,
  dependencies: Readonly<FloodgateStrengthFirstFastTrainingInputDependenciesForTests>,
): Promise<Readonly<FloodgateStrengthFirstFastTrainingInput>> {
  const home = canonicalHome(homeInput);
  if (
    !Number.isSafeInteger(dependencies.effectiveUserId) ||
    dependencies.effectiveUserId < 0
  ) {
    fail("effective user ID is invalid");
  }
  const manifestIdentity = fileIdentity(contract.manifest, "manifest");
  const trainingIdentity = Object.freeze({ ...contract.training });
  canonicalRelativeFilename(trainingIdentity.path, "training");
  const root = path.join(home, ...contract.bundleRelativeComponents);
  const manifestPath = path.join(root, manifestIdentity.path);
  const trainingPath = path.join(root, trainingIdentity.path);
  const snapshots: HeldSnapshot[] = [];
  try {
    const manifest = await openHeldSnapshot(
      manifestPath,
      manifestIdentity,
      dependencies,
      "manifest",
    );
    snapshots.push(manifest);
    parsePinnedManifest(manifest.bytes, trainingIdentity);

    const training = await openHeldSnapshot(
      trainingPath,
      trainingIdentity,
      dependencies,
      "training",
    );
    snapshots.push(training);
    const rows = parseAuthenticatedFloodgateTrainingRows(
      training.bytes,
      trainingIdentity,
    );

    await dependencies.afterReadBeforePostflight?.();
    for (const [index, snapshot] of snapshots.entries()) {
      const after = await snapshot.handle.stat({ bigint: true });
      validateHeldStat(
        after,
        index === 0 ? manifestIdentity.bytes : trainingIdentity.bytes,
        dependencies.effectiveUserId,
        index === 0 ? "manifest" : "training",
      );
      if (!sameHeldFile(snapshot.before, after)) {
        fail(`${index === 0 ? "manifest" : "training"} changed while held`);
      }
    }

    return Object.freeze({
      schema: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA,
      role: "training",
      policy: FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
      manifest: manifestIdentity,
      source: trainingIdentity,
      rows,
    });
  } finally {
    await closeSnapshots(snapshots);
  }
}

/** Production boundary: fixed home-relative bundle, manifest, and training role. */
export async function loadFloodgateStrengthFirstFastTrainingInput(
  home: string,
): Promise<Readonly<FloodgateStrengthFirstFastTrainingInput>> {
  if (typeof process.getuid !== "function") {
    fail("POSIX effective user ID is unavailable");
  }
  return loadWithContract(home, PRODUCTION_CONTRACT, {
    open: (filePath, flags) => fs.promises.open(filePath, flags),
    effectiveUserId: process.getuid(),
  });
}

/** Explicit test seam for small fixtures and drift/no-extra-open assertions. */
export async function loadFloodgateStrengthFirstFastTrainingInputCoreForTests(
  home: string,
  contract: Readonly<FloodgateStrengthFirstFastTrainingInputContractForTests>,
  dependencies: Readonly<FloodgateStrengthFirstFastTrainingInputDependenciesForTests>,
): Promise<Readonly<FloodgateStrengthFirstFastTrainingInput>> {
  return loadWithContract(home, contract, dependencies);
}

/**
 * Project the fast snapshot into the structural input consumed by the teacher.
 *
 * The historical result identity remains provenance metadata; the current
 * runner revision and explicit fast-input policy distinguish this path from
 * the legacy full-reconstruction verifier in the generator fingerprint.
 */
export function projectFloodgateStrengthFirstFastTrainingInputForTeacher(
  input: Readonly<FloodgateStrengthFirstFastTrainingInput>,
  runnerRevision: string,
): Readonly<AuthenticatedFloodgateTrainingRows> {
  if (
    !REVISION_RE.test(runnerRevision) ||
    input.schema !== FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA ||
    input.role !== "training" ||
    input.policy !== FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY ||
    JSON.stringify(input.manifest) !==
      JSON.stringify(FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY) ||
    JSON.stringify(input.source) !==
      JSON.stringify(FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY) ||
    !Array.isArray(input.rows) ||
    input.rows.length !==
      FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY.records ||
    !Object.isFrozen(input.rows)
  ) {
    fail("teacher projection requires the exact loaded production input");
  }
  const source = input.source;
  const binding: Readonly<FloodgateTrainingInputBinding> = Object.freeze({
    result_receipt_bytes: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES,
    result_receipt_sha256: FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256,
    bundle_manifest_bytes: input.manifest.bytes,
    bundle_manifest_sha256: input.manifest.sha256,
    bundle_producer_revision:
      FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION,
    verifier_revision: runnerRevision,
    raw_format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
    raw_bytes: source.bytes,
    raw_sha256: source.sha256,
    records: source.records,
    games: source.games,
    game_ids_sha256: source.game_ids_sha256,
    parent_ids_sha256: source.parent_ids_sha256,
    position_ids_count: source.position_ids_count,
    position_ids_sha256: source.position_ids_sha256,
  });
  return Object.freeze({
    schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
    role: "training",
    binding,
    rows: input.rows,
  });
}
