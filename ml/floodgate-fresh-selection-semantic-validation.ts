/**
 * Read-only semantic verification for the fixed fresh-selection publication.
 *
 * This verifier never creates a directory, generates a label, or rewrites an
 * artifact. It opens the fixed current-user source/result/manifest/dataset/work
 * paths, validates the fixed tracked search policy, and delegates the complete
 * work-to-dataset proof to the shared fresh-teacher artifact validator.
 * Run and generation fingerprints are relayed from the fully cross-bound
 * publication documents; independent provenance authentication remains the
 * authority/registry verifier's separate responsibility. The receipt binds
 * safe per-file snapshots with a terminal tracked-code/policy clean closure;
 * it is not a cross-file lock. The downstream Python integration re-fingerprints
 * the private source/work/dataset before consuming this snapshot receipt.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  canonicalFreshTeacherJson,
  exactFreshTeacherObject,
  parseCanonicalFreshTeacherJson,
  readFreshTeacherPrivateArtifact,
  validateFreshTeacherArtifacts,
  validateFreshTeacherStoredCompletion,
  validateFreshTeacherStoredIdentity,
  type FreshTeacherArtifactIdentity,
} from "./floodgate-fresh-teacher-artifact-validation";
import {
  FRESH_SELECTION_TEACHER_BOUNDARY,
  FRESH_SELECTION_TEACHER_DATASET_SCHEMA,
  FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA,
  FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT,
  FRESH_SELECTION_TEACHER_PARALLEL_ENGINES,
  FRESH_SELECTION_TEACHER_RESULT_SCHEMA,
  FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH,
  FRESH_SELECTION_TEACHER_SOURCE,
  FRESH_SELECTION_TEACHER_SOURCE_RELATIVE_PATH,
  FRESH_SELECTION_TEACHER_STATUS,
  freshSelectionTeacherPaths,
  validateFreshSelectionTeacherSearchPolicy,
  type FreshSelectionTeacherSearchPolicy,
} from "./floodgate-fresh-selection-teacher-runner";
import {
  FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
  parseAuthenticatedFloodgateFreshSelectionRows,
  type FloodgateFreshSelectionRawIdentity,
} from "./floodgate-training-row-validation";
import { SIBLING_TEACHER_WORK_SCHEMA } from "./generate-sibling-teacher";
import { captureFloodgateGitExactCleanRevision } from "./floodgate-git";

export const FRESH_SELECTION_SEMANTIC_VALIDATION_RECEIPT_SCHEMA =
  "shogi-floodgate-fresh-selection-semantic-validation-receipt-v1" as const;
export const FRESH_SELECTION_SEMANTIC_VALIDATION_STATUS =
  "strict-fixed-selection-artifacts-valid" as const;
export const FRESH_SELECTION_SEMANTIC_VALIDATION_BOUNDARY =
  "fixed-source-policy-result-manifest-work-dataset-safe-snapshot-semantic-integrity-with-terminal-tracked-clean-closure-not-cross-file-lock-or-independent-run-or-generation-provenance" as const;

const RESULT_MAX_BYTES = 1024 * 1024;
const POLICY_MAX_BYTES = 1024 * 1024;
const DATASET_MAX_BYTES = 256 * 1024 * 1024;
const WORK_MAX_BYTES = 512 * 1024 * 1024;
const PRIVATE_DIRECTORY_MODE = 0o700;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;

export interface FreshSelectionSemanticSourceIdentity {
  readonly path: typeof FRESH_SELECTION_TEACHER_SOURCE_RELATIVE_PATH;
  readonly format: typeof FLOODGATE_TRAINING_RAW_PARENT_FORMAT;
  readonly bytes: number;
  readonly sha256: string;
  readonly records: number;
  readonly games: number;
  readonly game_ids_sha256: string;
  readonly parent_ids_sha256: string;
  readonly position_ids_count: number;
  readonly position_ids_sha256: string;
}

export interface FreshSelectionSemanticValidationDependencies {
  readonly homeDirectory: () => string;
  readonly repositoryRoot: string;
  readonly effectiveUserId: number;
  readonly availableParallelism: number;
  readonly captureExactCleanRevision: (
    repositoryRoot: string,
  ) => Promise<string>;
}

export interface FreshSelectionSemanticValidationReceipt {
  readonly schema: typeof FRESH_SELECTION_SEMANTIC_VALIDATION_RECEIPT_SCHEMA;
  readonly status: typeof FRESH_SELECTION_SEMANTIC_VALIDATION_STATUS;
  readonly run_fingerprint: string;
  readonly generation_run_fingerprint: string;
  readonly dataset: Readonly<FreshTeacherArtifactIdentity>;
  readonly work: Readonly<FreshTeacherArtifactIdentity>;
  readonly completion_sha256: string;
  readonly completed_parents: number;
  readonly emitted_parent_groups: number;
  readonly dataset_records: number;
  readonly private_paths_emitted: false;
  readonly labels_emitted: false;
  readonly live_weight_changes: 0;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalFreshTeacherJson(left) === canonicalFreshTeacherJson(right);
}

function statIdentity(value: fs.Stats): readonly unknown[] {
  return [
    value.dev,
    value.ino,
    value.mode,
    value.uid,
    value.gid,
    value.size,
    value.mtimeMs,
    value.ctimeMs,
    value.nlink,
  ];
}

async function readBoundedHandle(
  handle: fs.promises.FileHandle,
  maximumBytes: number,
  label: string,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const remaining = maximumBytes - total;
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, remaining + 1));
    const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, null);
    if (bytesRead === 0) break;
    total += bytesRead;
    if (total > maximumBytes) {
      throw new Error(`${label} exceeds its fixed byte limit`);
    }
    chunks.push(chunk.subarray(0, bytesRead));
  }
  return Buffer.concat(chunks, total);
}

async function validatePrivateRoot(
  root: string,
  effectiveUserId: number,
  label: string,
): Promise<void> {
  const absolute = path.resolve(root);
  const [canonical, stat] = await Promise.all([
    fs.promises.realpath(root),
    fs.promises.lstat(root),
  ]);
  if (
    root !== absolute ||
    canonical !== absolute ||
    !stat.isDirectory() ||
    stat.uid !== effectiveUserId ||
    (stat.mode & 0o7777) !== PRIVATE_DIRECTORY_MODE
  ) {
    throw new Error(`${label} root is not a canonical private 0700 directory`);
  }
}

async function readFixedSearchPolicy(
  file: string,
  repositoryRoot: string,
  effectiveUserId: number,
): Promise<Uint8Array> {
  const absoluteRoot = path.resolve(repositoryRoot);
  const expected = path.join(
    absoluteRoot,
    ...FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH.split("/"),
  );
  if (file !== expected) {
    throw new Error("fresh-selection semantic policy path is not fixed");
  }
  const canonicalRoot = await fs.promises.realpath(absoluteRoot);
  const canonicalExpected = path.join(
    canonicalRoot,
    ...FRESH_SELECTION_TEACHER_SEARCH_POLICY_PATH.split("/"),
  );
  const [canonicalFile, before] = await Promise.all([
    fs.promises.realpath(file),
    fs.promises.lstat(file),
  ]);
  if (
    canonicalFile !== canonicalExpected ||
    !before.isFile() ||
    before.uid !== effectiveUserId ||
    before.nlink !== 1 ||
    (before.mode & 0o022) !== 0 ||
    before.size > POLICY_MAX_BYTES
  ) {
    throw new Error("fresh-selection semantic policy is not a safe fixed file");
  }
  const noFollow = "O_NOFOLLOW" in fs.constants ? fs.constants.O_NOFOLLOW : 0;
  const handle = await fs.promises.open(file, fs.constants.O_RDONLY | noFollow);
  let openedBefore: fs.Stats;
  let openedAfter: fs.Stats;
  let bytes: Buffer;
  try {
    openedBefore = await handle.stat();
    if (
      !sameJson(statIdentity(before), statIdentity(openedBefore)) ||
      openedBefore.size > POLICY_MAX_BYTES
    ) {
      throw new Error("fresh-selection semantic policy changed before read");
    }
    bytes = await readBoundedHandle(
      handle,
      POLICY_MAX_BYTES,
      "fresh-selection semantic policy",
    );
    openedAfter = await handle.stat();
  } finally {
    await handle.close();
  }
  const after = await fs.promises.lstat(file);
  if (
    !sameJson(statIdentity(before), statIdentity(openedAfter)) ||
    !sameJson(statIdentity(before), statIdentity(after)) ||
    (await fs.promises.realpath(file)) !== canonicalExpected ||
    bytes.byteLength !== before.size
  ) {
    throw new Error("fresh-selection semantic policy changed while read");
  }
  return new Uint8Array(bytes);
}

function parseFixedSearchPolicy(
  bytes: Uint8Array,
  availableParallelism: number,
): Readonly<FreshSelectionTeacherSearchPolicy> {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
  } catch {
    throw new Error("fresh-selection semantic policy is not valid JSON");
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8").equals(
      Buffer.from(bytes),
    )
  ) {
    throw new Error("fresh-selection semantic policy is not canonical");
  }
  return validateFreshSelectionTeacherSearchPolicy(
    value as FreshSelectionTeacherSearchPolicy,
    availableParallelism,
  );
}

function captureStoredIdentity(
  value: unknown,
  expectedPath: string,
  expectedSchema: string,
  maximumBytes: number,
  label: string,
): Readonly<FreshTeacherArtifactIdentity> {
  const identity = exactFreshTeacherObject(
    value,
    ["path", "bytes", "sha256", "schema"],
    label,
  );
  if (
    identity.path !== expectedPath ||
    identity.schema !== expectedSchema ||
    !Number.isSafeInteger(identity.bytes) ||
    (identity.bytes as number) < 1 ||
    (identity.bytes as number) > maximumBytes ||
    typeof identity.sha256 !== "string" ||
    !SHA256_RE.test(identity.sha256)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return Object.freeze({
    path: identity.path as string,
    bytes: identity.bytes as number,
    sha256: identity.sha256,
    schema: identity.schema as string,
  });
}

function revisionFromWork(workBytes: Uint8Array): string {
  const firstLf = workBytes.indexOf(0x0a);
  if (firstLf < 1) {
    throw new Error("fresh-selection semantic work header is absent");
  }
  let header: unknown;
  try {
    const line = new TextDecoder("utf-8", { fatal: true }).decode(
      workBytes.subarray(0, firstLf),
    );
    header = JSON.parse(line) as unknown;
  } catch {
    throw new Error("fresh-selection semantic work header is invalid");
  }
  const row = exactFreshTeacherObject(
    header,
    [
      "schema",
      "kind",
      "run_fingerprint",
      "source_raw_sha256",
      "selected_parent_ids_sha256",
      "label_policy",
      "pipeline",
    ],
    "fresh-selection semantic work header",
  );
  const pipeline = exactFreshTeacherObject(
    row.pipeline,
    ["source_revision", "tracked_tree_clean"],
    "fresh-selection semantic work pipeline",
  );
  if (
    typeof pipeline.source_revision !== "string" ||
    !REVISION_RE.test(pipeline.source_revision)
  ) {
    throw new Error("fresh-selection semantic work revision is invalid");
  }
  return pipeline.source_revision;
}

async function requireResultMarker(file: string): Promise<void> {
  try {
    await fs.promises.lstat(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("fresh-selection semantic result is absent");
    }
    throw error;
  }
}

/** Test seam; production always supplies the frozen 4,800-parent identity. */
export async function validateFreshSelectionSemanticArtifactsCoreForTests(
  dependencies: Readonly<FreshSelectionSemanticValidationDependencies>,
  sourceIdentity: Readonly<FreshSelectionSemanticSourceIdentity>,
): Promise<Readonly<FreshSelectionSemanticValidationReceipt>> {
  if (
    !Number.isSafeInteger(dependencies.effectiveUserId) ||
    dependencies.effectiveUserId < 0 ||
    !Number.isSafeInteger(dependencies.availableParallelism) ||
    dependencies.availableParallelism <
      FRESH_SELECTION_TEACHER_PARALLEL_ENGINES ||
    sourceIdentity.path !== FRESH_SELECTION_TEACHER_SOURCE_RELATIVE_PATH ||
    sourceIdentity.format !== FLOODGATE_TRAINING_RAW_PARENT_FORMAT ||
    !Number.isSafeInteger(sourceIdentity.bytes) ||
    sourceIdentity.bytes < 1 ||
    !Number.isSafeInteger(sourceIdentity.records) ||
    sourceIdentity.records < 1 ||
    !Number.isSafeInteger(sourceIdentity.games) ||
    sourceIdentity.games < 1 ||
    !SHA256_RE.test(sourceIdentity.sha256) ||
    !SHA256_RE.test(sourceIdentity.game_ids_sha256) ||
    !SHA256_RE.test(sourceIdentity.parent_ids_sha256) ||
    !Number.isSafeInteger(sourceIdentity.position_ids_count) ||
    sourceIdentity.position_ids_count < 1 ||
    !SHA256_RE.test(sourceIdentity.position_ids_sha256)
  ) {
    throw new Error("fresh-selection semantic validation contract is invalid");
  }
  const home = path.resolve(dependencies.homeDirectory());
  const repositoryRoot = path.resolve(dependencies.repositoryRoot);
  const paths = freshSelectionTeacherPaths(home, repositoryRoot);
  const repositoryRevision =
    await dependencies.captureExactCleanRevision(repositoryRoot);
  if (!REVISION_RE.test(repositoryRevision)) {
    throw new Error("fresh-selection semantic repository revision is invalid");
  }
  await requireResultMarker(paths.result);
  await Promise.all([
    validatePrivateRoot(
      path.dirname(paths.source),
      dependencies.effectiveUserId,
      "fresh-selection semantic source",
    ),
    validatePrivateRoot(
      paths.outputRoot,
      dependencies.effectiveUserId,
      "fresh-selection semantic output",
    ),
  ]);

  const [policyBytes, resultSnapshot] = await Promise.all([
    readFixedSearchPolicy(
      paths.searchPolicy,
      repositoryRoot,
      dependencies.effectiveUserId,
    ),
    readFreshTeacherPrivateArtifact(
      paths.result,
      paths.outputRoot,
      dependencies.effectiveUserId,
      FRESH_SELECTION_TEACHER_RESULT_SCHEMA,
      FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT,
      "fresh-selection semantic result",
      RESULT_MAX_BYTES,
    ),
  ]);
  const policy = parseFixedSearchPolicy(
    policyBytes,
    dependencies.availableParallelism,
  );
  const result = exactFreshTeacherObject(
    parseCanonicalFreshTeacherJson(
      resultSnapshot,
      "fresh-selection semantic result",
    ),
    [
      "schema",
      "status",
      "role",
      "manifest",
      "dataset",
      "work",
      "completion",
      "generation_run_fingerprint",
      "run_fingerprint",
      "postflight_complete",
      "boundary",
    ],
    "fresh-selection semantic result",
  );
  if (
    result.schema !== FRESH_SELECTION_TEACHER_RESULT_SCHEMA ||
    result.status !== FRESH_SELECTION_TEACHER_STATUS ||
    result.role !== "fresh_selection" ||
    result.postflight_complete !== true ||
    !sameJson(result.boundary, FRESH_SELECTION_TEACHER_BOUNDARY) ||
    typeof result.run_fingerprint !== "string" ||
    !SHA256_RE.test(result.run_fingerprint) ||
    typeof result.generation_run_fingerprint !== "string" ||
    !SHA256_RE.test(result.generation_run_fingerprint)
  ) {
    throw new Error("fresh-selection semantic result is incomplete");
  }
  const storedManifest = captureStoredIdentity(
    result.manifest,
    `${FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT}/manifest.json`,
    FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA,
    RESULT_MAX_BYTES,
    "fresh-selection semantic result manifest identity",
  );
  const storedDataset = captureStoredIdentity(
    result.dataset,
    `${FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT}/selection.jsonl`,
    FRESH_SELECTION_TEACHER_DATASET_SCHEMA,
    DATASET_MAX_BYTES,
    "fresh-selection semantic result dataset identity",
  );
  const storedWork = captureStoredIdentity(
    result.work,
    `${FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT}/work.jsonl`,
    SIBLING_TEACHER_WORK_SCHEMA,
    WORK_MAX_BYTES,
    "fresh-selection semantic result work identity",
  );
  const completion = validateFreshTeacherStoredCompletion(result.completion, {
    label: "fresh-selection semantic",
    inputGames: sourceIdentity.games,
    inputParents: sourceIdentity.records,
    sourceParentIdsSha256: sourceIdentity.parent_ids_sha256,
  });

  const sourcePortableRoot = path.posix.dirname(
    FRESH_SELECTION_TEACHER_SOURCE_RELATIVE_PATH,
  );
  const [sourceSnapshot, manifestSnapshot, datasetSnapshot, workSnapshot] =
    await Promise.all([
      readFreshTeacherPrivateArtifact(
        paths.source,
        path.dirname(paths.source),
        dependencies.effectiveUserId,
        FLOODGATE_TRAINING_RAW_PARENT_FORMAT,
        sourcePortableRoot,
        "fresh-selection semantic source",
        sourceIdentity.bytes,
      ),
      readFreshTeacherPrivateArtifact(
        paths.manifest,
        paths.outputRoot,
        dependencies.effectiveUserId,
        FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA,
        FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT,
        "fresh-selection semantic manifest",
        storedManifest.bytes,
      ),
      readFreshTeacherPrivateArtifact(
        paths.dataset,
        paths.outputRoot,
        dependencies.effectiveUserId,
        FRESH_SELECTION_TEACHER_DATASET_SCHEMA,
        FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT,
        "fresh-selection semantic dataset",
        storedDataset.bytes,
      ),
      readFreshTeacherPrivateArtifact(
        paths.work,
        paths.outputRoot,
        dependencies.effectiveUserId,
        SIBLING_TEACHER_WORK_SCHEMA,
        FRESH_SELECTION_TEACHER_OUTPUT_RELATIVE_ROOT,
        "fresh-selection semantic work",
        storedWork.bytes,
      ),
    ]);
  if (
    sourceSnapshot.identity.path !== sourceIdentity.path ||
    sourceSnapshot.identity.bytes !== sourceIdentity.bytes ||
    sourceSnapshot.identity.sha256 !== sourceIdentity.sha256
  ) {
    throw new Error("fresh-selection semantic source identity mismatch");
  }
  validateFreshTeacherStoredIdentity(
    result.manifest,
    manifestSnapshot.identity,
    "fresh-selection semantic result manifest identity",
  );
  validateFreshTeacherStoredIdentity(
    result.dataset,
    datasetSnapshot.identity,
    "fresh-selection semantic result dataset identity",
  );
  validateFreshTeacherStoredIdentity(
    result.work,
    workSnapshot.identity,
    "fresh-selection semantic result work identity",
  );

  const manifest = exactFreshTeacherObject(
    parseCanonicalFreshTeacherJson(
      manifestSnapshot,
      "fresh-selection semantic manifest",
    ),
    [
      "schema",
      "status",
      "role",
      "source",
      "dataset",
      "work",
      "completion",
      "generation_run_fingerprint",
      "run_fingerprint",
      "boundary",
    ],
    "fresh-selection semantic manifest",
  );
  if (
    manifest.schema !== FRESH_SELECTION_TEACHER_MANIFEST_SCHEMA ||
    manifest.status !== FRESH_SELECTION_TEACHER_STATUS ||
    manifest.role !== "fresh_selection" ||
    !sameJson(manifest.source, sourceIdentity) ||
    !sameJson(manifest.completion, completion) ||
    manifest.generation_run_fingerprint !== result.generation_run_fingerprint ||
    manifest.run_fingerprint !== result.run_fingerprint ||
    !sameJson(manifest.boundary, FRESH_SELECTION_TEACHER_BOUNDARY)
  ) {
    throw new Error("fresh-selection semantic manifest is not fully bound");
  }
  validateFreshTeacherStoredIdentity(
    manifest.dataset,
    datasetSnapshot.identity,
    "fresh-selection semantic manifest dataset identity",
  );
  validateFreshTeacherStoredIdentity(
    manifest.work,
    workSnapshot.identity,
    "fresh-selection semantic manifest work identity",
  );

  const parserIdentity: FloodgateFreshSelectionRawIdentity = Object.freeze({
    ...sourceIdentity,
    path: "fresh-selection.raw.jsonl",
  });
  const sourceRows = parseAuthenticatedFloodgateFreshSelectionRows(
    sourceSnapshot.bytes,
    parserIdentity,
  );
  const revision = revisionFromWork(workSnapshot.bytes);
  const semantic = validateFreshTeacherArtifacts({
    label: "fresh-selection semantic",
    inputGames: sourceIdentity.games,
    inputParents: sourceIdentity.records,
    sourceParentIdsSha256: sourceIdentity.parent_ids_sha256,
    datasetBytes: datasetSnapshot.bytes,
    workBytes: workSnapshot.bytes,
    sourceRows,
    sourceRawSha256: sourceIdentity.sha256,
    expectedGenerationRunFingerprint: result.generation_run_fingerprint,
    expectedRevision: revision,
    searchPolicy: policy,
    completion,
  });
  if (
    semantic.completedEntries !== completion.emitted_parent_groups ||
    semantic.datasetRecords !== completion.dataset_records
  ) {
    throw new Error("fresh-selection semantic receipt accounting drifted");
  }
  const terminalRepositoryRevision =
    await dependencies.captureExactCleanRevision(repositoryRoot);
  if (terminalRepositoryRevision !== repositoryRevision) {
    throw new Error(
      "fresh-selection semantic tracked code or policy changed during validation",
    );
  }

  return Object.freeze({
    schema: FRESH_SELECTION_SEMANTIC_VALIDATION_RECEIPT_SCHEMA,
    status: FRESH_SELECTION_SEMANTIC_VALIDATION_STATUS,
    run_fingerprint: result.run_fingerprint,
    generation_run_fingerprint: result.generation_run_fingerprint,
    dataset: datasetSnapshot.identity,
    work: workSnapshot.identity,
    completion_sha256: sha256(canonicalFreshTeacherJson(completion)),
    completed_parents: completion.completed_parents as number,
    emitted_parent_groups: completion.emitted_parent_groups as number,
    dataset_records: completion.dataset_records as number,
    private_paths_emitted: false,
    labels_emitted: false,
    live_weight_changes: 0,
  });
}

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error(
      "fresh-selection semantic validation requires process.geteuid()",
    );
  }
  return process.geteuid();
}

function currentUserHomeDirectory(): string {
  const user = os.userInfo();
  const effective = effectiveUserId();
  if (user.uid !== effective || path.resolve(user.homedir) !== user.homedir) {
    throw new Error(
      "fresh-selection semantic validation requires a fixed current-user home",
    );
  }
  return user.homedir;
}

const PRODUCTION_DEPENDENCIES: FreshSelectionSemanticValidationDependencies =
  Object.freeze({
    homeDirectory: currentUserHomeDirectory,
    repositoryRoot: path.resolve(__dirname, ".."),
    effectiveUserId: effectiveUserId(),
    availableParallelism: os.availableParallelism(),
    captureExactCleanRevision: captureFloodgateGitExactCleanRevision,
  });

/** Validate the fixed current-user artifacts without accepting path input. */
export function validateFreshSelectionSemanticArtifacts(): Promise<
  Readonly<FreshSelectionSemanticValidationReceipt>
> {
  return validateFreshSelectionSemanticArtifactsCoreForTests(
    PRODUCTION_DEPENDENCIES,
    FRESH_SELECTION_TEACHER_SOURCE,
  );
}
