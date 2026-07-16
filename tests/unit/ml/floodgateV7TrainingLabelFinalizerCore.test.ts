import { createHash, createHmac, hkdfSync } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT,
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_TRUST_BOUNDARY,
  type FloodgateExclusiveDirectoryRenameReceipt,
} from "../../../ml/floodgate-exclusive-directory-rename";
import {
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
} from "../../../ml/floodgate-production-stable-wasm-runtime";
import {
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
} from "../../../ml/floodgate-stable-wasm-proposer";
import {
  FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
  FLOODGATE_ROLE_BUNDLE_SCHEMA,
  type FloodgateRoleBundleRawIdentity,
  type FloodgateRoleBundleRawParent,
} from "../../../ml/floodgate-role-bundle";
import {
  FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY,
  FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA,
  type VerifiedPinnedFloodgateRoleBundle,
} from "../../../ml/floodgate-role-bundle-result";
import {
  FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
  authorizeFloodgateTeacherStageCoreForTests,
  type FloodgateTeacherStageAuthorizationDependencies,
  type FloodgateTeacherStageAuthorizationOptions,
  type FloodgateTeacherStageLease,
  type FloodgateTeacherStagePublicationDependencies,
} from "../../../ml/floodgate-teacher-stage-authorization";
import {
  FLOODGATE_TRAINING_RAW_FILENAME,
  claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests,
  claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests,
  withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests,
  type FloodgateTrainingConsumerPostflightReceipt,
  type FloodgateTrainingInputBinding,
  type FloodgateTrainingRowConsumerDependencies,
  type FloodgateTrainingRowConsumerOptions,
} from "../../../ml/floodgate-training-row-consumer";
import {
  FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
  buildFloodgateV7CandidateUnionCoreForTests,
} from "../../../ml/floodgate-v7-candidate-union";
import {
  buildFloodgateV7CompletedParentCoreForTests,
  type FloodgateV7CompletedParentEvidence,
} from "../../../ml/floodgate-v7-completed-parent";
import {
  buildFloodgateV7CheckpointScanLoadCompletedParentCoreForTests,
  generateFloodgateV7CheckpointScanLoadParentsCoreForTests,
} from "../../../ml/floodgate-v7-checkpoint-scan-load";
import { FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME } from "../../../ml/floodgate-v7-teacher-checkpoint";
import {
  projectFloodgateV7CompletedParentEvidenceToTrainingLabels,
  type FloodgateV7TrainingLabelProjection,
} from "../../../ml/floodgate-v7-training-label-projection";
import {
  FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_CONTRACT,
  FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_STATUS,
  FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES,
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_HKDF_INFO,
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_MAC_DOMAIN,
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_SCHEMA,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_HKDF_INFO,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_MAC_DOMAIN,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_SCHEMA,
  FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
  FloodgateV7TrainingLabelFinalizerError,
  createFloodgateV7TrainingLabelFinalizationPlanCoreForTests,
  finalizeAndPublishFloodgateV7TrainingLabelsCoreForTests,
  type FloodgateV7TrainingLabelFinalizationPlanForTests,
  type FloodgateV7TrainingLabelFinalizerDependencies,
  type FloodgateV7TrainingLabelFinalizerEvent,
} from "../../../ml/floodgate-v7-training-label-finalizer-core";
import { floodgateCanonicalUrlGameId } from "../../../ml/floodgate-raw-lock";
import { floodgateIdentifierDigest } from "../../../ml/floodgate-roles";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "../../../ml/shogi-sfen";
import { compareBytewise, positionKeyFromSfen } from "../../../ml/sibling-data";

const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const FORCED_SFEN = "4k4/2B6/3GRG3/9/9/9/9/9/K8 w - 1";
const PRODUCER_REVISION = "a".repeat(40);
const VERIFIER_REVISION = "b".repeat(40);
const RUN_ID = "12".repeat(32);
const KEY_ID = "synthetic-v7-finalizer-key-1";
const ROOT_KEY_BYTE = 0x4b;
const WORK_BYTES = Buffer.from('{"synthetic":"sealed-v3-work","parents":2}\n');
const TEACHER_RUN_BINDING_SHA256 = "e".repeat(64);
const temporaryRoots: string[] = [];
const fixtureParentIdsByDigest = new Map<string, readonly string[]>();
const posixDescribe = describe.runIf(typeof process.geteuid === "function");

interface ConsumerFixture {
  readonly outputRoot: string;
  readonly identity: Readonly<FloodgateRoleBundleRawIdentity>;
  readonly options: FloodgateTrainingRowConsumerOptions;
}

interface PostflightFixture {
  readonly receipt: Readonly<FloodgateTrainingConsumerPostflightReceipt>;
  readonly binding: Readonly<FloodgateTrainingInputBinding>;
}

interface StageFixture {
  readonly root: string;
  readonly publicationParent: string;
  readonly stageRoot: string;
  readonly destinationRoot: string;
  readonly leaseRoot: string;
  readonly options: FloodgateTeacherStageAuthorizationOptions;
}

interface FileHandleSyncPrototype {
  sync(this: fs.promises.FileHandle): Promise<void>;
}

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("Floodgate v7 finalizer tests require a POSIX euid");
  }
  return process.geteuid();
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function rootKey(byte = ROOT_KEY_BYTE): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("fixture is not JSON data");
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort(compareBytewise)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function write0600(
  filePath: string,
  contents: string | Uint8Array,
): Promise<void> {
  await mkdir0700(path.dirname(filePath));
  await fs.promises.writeFile(filePath, contents, { flag: "wx", mode: 0o600 });
  await fs.promises.chmod(filePath, 0o600);
}

async function fileHandleSyncPrototype(
  probePath: string,
): Promise<FileHandleSyncPrototype> {
  const probe = await fs.promises.open(
    probePath,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    return Object.getPrototypeOf(probe) as FileHandleSyncPrototype;
  } finally {
    await probe.close();
  }
}

function fixtureRows(seed: string): readonly FloodgateRoleBundleRawParent[] {
  const safeSeed = seed.replace(/[^A-Za-z0-9-]/g, "-");
  const url = `https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+v7-finalizer-${safeSeed}+synthetic-b+20260101000000.csa`;
  const gameId = floodgateCanonicalUrlGameId(url);
  const gameSha256 = sha256(`synthetic v7 finalizer fixture; ${seed}`);
  const moves = ["7g7f", "3c3d", "2g2f", "8c8d"] as const;
  const rows: FloodgateRoleBundleRawParent[] = [];
  let parentSfen = START_SFEN;
  for (let ply = 0; ply < moves.length; ply += 1) {
    const move = moves[ply];
    if (ply >= 2) {
      rows.push({
        schema_version: 1,
        source: "floodgate",
        source_url: url,
        game_sha256: gameSha256,
        game_id: gameId,
        parent_id: `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${ply}`)}`,
        position_id: positionKeyFromSfen(parentSfen),
        parent_sfen: parentSfen,
        ply,
        played_move: move,
      });
    }
    parentSfen = childSfenAfterUsi(parentSfen, move);
  }
  return rows.sort((left, right) =>
    compareBytewise(left.parent_id, right.parent_id),
  );
}

function rawBytes(rows: readonly FloodgateRoleBundleRawParent[]): Uint8Array {
  return Buffer.from(`${rows.map((row) => canonicalJson(row)).join("\n")}\n`);
}

function rawIdentity(
  rows: readonly FloodgateRoleBundleRawParent[],
  bytes: Uint8Array,
): FloodgateRoleBundleRawIdentity {
  const gameIds = new Set(rows.map((row) => row.game_id));
  const parentIds = new Set(rows.map((row) => row.parent_id));
  const positionIds = new Set(rows.map((row) => row.position_id));
  return {
    path: FLOODGATE_TRAINING_RAW_FILENAME,
    format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    records: rows.length,
    games: gameIds.size,
    game_ids_sha256: floodgateIdentifierDigest(gameIds),
    parent_ids_sha256: floodgateIdentifierDigest(parentIds),
    position_ids_count: positionIds.size,
    position_ids_sha256: floodgateIdentifierDigest(positionIds),
  };
}

async function consumerFixture(seed = "a"): Promise<ConsumerFixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "v7-label-finalizer-consumer-"),
  );
  const container = await fs.promises.realpath(created);
  temporaryRoots.push(container);
  await fs.promises.chmod(container, 0o700);
  const outputRoot = path.join(container, "bundle");
  await mkdir0700(outputRoot);
  const rows = fixtureRows(seed);
  const bytes = rawBytes(rows);
  const identity = rawIdentity(rows, bytes);
  fixtureParentIdsByDigest.set(
    identity.parent_ids_sha256,
    Object.freeze(rows.map((row) => row.parent_id)),
  );
  await write0600(
    path.join(outputRoot, FLOODGATE_TRAINING_RAW_FILENAME),
    bytes,
  );
  return {
    outputRoot,
    identity,
    options: {
      repositoryRoot: path.join(container, "repository"),
      verifierRevision: VERIFIER_REVISION,
      rawLockRoot: path.join(container, "raw-lock"),
      roleLockRoot: path.join(container, "role-lock"),
      legacyProtectedPositionIdsPath: path.join(container, "legacy-ids.txt"),
      outputRoot,
    },
  };
}

function verifiedBundle(
  identity: Readonly<FloodgateRoleBundleRawIdentity>,
): Readonly<VerifiedPinnedFloodgateRoleBundle> {
  const manifest = {
    schema: FLOODGATE_ROLE_BUNDLE_SCHEMA,
    status: "complete-label-free-role-bundle",
    provenance: {},
    pipeline: { source_revision: PRODUCER_REVISION, tracked_tree_clean: true },
    sources: {},
    contract: {},
    roles: {
      fresh_final_holdout: {},
      fresh_selection: {},
      training: { protected_position_ids: {}, raw_parents: identity },
    },
    replay_exclusion: {},
    isolation: {},
  };
  const manifestText = `${canonicalJson(manifest)}\n`;
  const manifestIdentity = {
    path: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.path,
    bytes: Buffer.byteLength(manifestText),
    sha256: sha256(manifestText),
  };
  return {
    manifest,
    manifestText,
    roleLock: {},
    producerRevision: PRODUCER_REVISION,
    verifierRevision: VERIFIER_REVISION,
    result: {
      schema: FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA,
      status: "complete-label-free-role-bundle",
      claim_boundary: "integrity-only-not-playing-strength-evidence",
      manifest: { identity: manifestIdentity, value: manifest },
      execution: {},
      post_run_audit: {},
    },
  } as unknown as Readonly<VerifiedPinnedFloodgateRoleBundle>;
}

function consumerDependencies(
  identity: Readonly<FloodgateRoleBundleRawIdentity>,
): FloodgateTrainingRowConsumerDependencies {
  const verified = verifiedBundle(identity);
  return {
    verifyBundle: vi.fn(async () => verified),
    expectedManifestIdentity: verified.result.manifest.identity,
  };
}

async function mintPostflight(
  input: ConsumerFixture,
): Promise<PostflightFixture> {
  let binding: Readonly<FloodgateTrainingInputBinding> | undefined;
  const receipt =
    await withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(
      input.options,
      async (authenticated) => {
        claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(
          authenticated,
        );
        binding = Object.freeze(structuredClone(authenticated.binding));
      },
      consumerDependencies(input.identity),
    );
  if (binding === undefined) throw new Error("missing training input binding");
  return { receipt, binding };
}

function normalProjection(): Readonly<FloodgateV7TrainingLabelProjection> {
  const generated = generateFloodgateV7CheckpointScanLoadParentsCoreForTests(1);
  const parent = generated[0];
  if (parent === undefined) throw new Error("missing normal parent fixture");
  return projectFloodgateV7CompletedParentEvidenceToTrainingLabels(
    buildFloodgateV7CompletedParentCoreForTests(
      structuredClone(
        buildFloodgateV7CheckpointScanLoadCompletedParentCoreForTests(parent),
      ),
    ),
  );
}

function forcedEvidence(): Readonly<FloodgateV7CompletedParentEvidence> {
  const gameId = `sha256:${sha256("v7-finalizer-forced-game")}`;
  const parent = {
    schema_version: 1 as const,
    game_id: gameId,
    parent_id: `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${0}`)}`,
    position_id: positionKeyFromSfen(FORCED_SFEN),
    parent_sfen: FORCED_SFEN,
    ply: 0,
    played_move: "5a4a",
  };
  const legal = rulesCompleteLegalMoves(
    positionFromSfen(FORCED_SFEN).position,
  ).map((entry) => entry.usi);
  expect(legal).toEqual([parent.played_move]);
  const childSfen = childSfenAfterUsi(FORCED_SFEN, parent.played_move);
  const stable = {
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_payload_sha256: sha256(
      `shogi-floodgate-stable-parent-v1\0${canonicalJson(parent)}`,
    ),
    stable_move: parent.played_move,
    child_sfen: childSfen,
    child_position_id: positionKeyFromSfen(childSfen),
    search: {
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH as 11,
      completed_depth: FLOODGATE_STABLE_REQUESTED_DEPTH as 11,
      termination: "requested-depth-complete" as const,
      raw_search_score: 17,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      nodes: 100,
      leaves: 50,
      root_tesu: 0,
    },
  };
  const union = buildFloodgateV7CandidateUnionCoreForTests({
    parent,
    legal: {
      source: FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
      parent_sfen: FORCED_SFEN,
      count: 1,
      moves: [parent.played_move],
    },
    stable,
    runtime: null,
  });
  return buildFloodgateV7CompletedParentCoreForTests({
    union,
    stable_runtime: {
      schema: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
      row: stable,
      runtime_binding: {
        claim_boundary:
          FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
        execution_boundary:
          "production-fixed-asset-authority-and-reusable-pool",
        runtime_receipt_sha256: "c".repeat(64),
        reusable_pool_receipt_sha256: "d".repeat(64),
        parent_payload_sha256: stable.parent_payload_sha256,
        row_sha256: sha256(
          `shogi-floodgate-production-stable-runtime-row-v1\0${canonicalJson(stable)}`,
        ),
        origin: "direct-owning-runtime-capability-call-v1",
        plain_result_authentication_claim: false,
      },
    },
    rescores: [],
  });
}

let projectionCache:
  readonly Readonly<FloodgateV7TrainingLabelProjection>[] | undefined;

function projections(): readonly Readonly<FloodgateV7TrainingLabelProjection>[] {
  projectionCache ??= Object.freeze([
    normalProjection(),
    projectFloodgateV7CompletedParentEvidenceToTrainingLabels(forcedEvidence()),
  ]);
  return projectionCache;
}

function projectionsForBinding(
  binding: Readonly<FloodgateTrainingInputBinding>,
): readonly Readonly<FloodgateV7TrainingLabelProjection>[] {
  const parentIds = fixtureParentIdsByDigest.get(binding.parent_ids_sha256);
  if (parentIds === undefined || parentIds.length !== projections().length) {
    throw new Error("missing projection parent IDs for training binding");
  }
  return Object.freeze(
    projections().map((projection, index) => {
      const parentId = parentIds[index];
      return Object.freeze({
        ...projection,
        parent: Object.freeze({ ...projection.parent, parent_id: parentId }),
        rows: Object.freeze(
          projection.rows.map((row) =>
            Object.freeze({ ...row, parent_id: parentId }),
          ),
        ),
      });
    }),
  );
}

async function stageFixture(): Promise<StageFixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "v7-label-finalizer-stage-"),
  );
  const root = await fs.promises.realpath(created);
  temporaryRoots.push(root);
  await fs.promises.chmod(root, 0o700);
  const repositoryRoot = path.join(root, "repository");
  const rawLockRoot = path.join(root, "raw-lock");
  const roleLockRoot = path.join(root, "role-lock");
  const roleBundleRoot = path.join(root, "role-bundle");
  const publicationParent = path.join(root, "publication");
  const stageBasename = "v7-training-label-stage";
  const destinationBasename = "v7-training-label-final";
  const stageRoot = path.join(publicationParent, stageBasename);
  const destinationRoot = path.join(publicationParent, destinationBasename);
  const leaseRoot = path.join(
    publicationParent,
    `.${stageBasename}.authorization-lease`,
  );
  const legacyProtectedPositionIdsPath = path.join(root, "legacy", "ids.txt");
  const engineBin = path.join(root, "engine", "engine");
  const engineReceipt = path.join(root, "engine", "receipt.json");
  const engineArgument = path.join(root, "engine", "argument.bin");
  const evalDir = path.join(root, "eval");
  await Promise.all([
    mkdir0700(repositoryRoot),
    mkdir0700(rawLockRoot),
    mkdir0700(roleLockRoot),
    mkdir0700(roleBundleRoot),
    mkdir0700(publicationParent),
    mkdir0700(stageRoot),
    mkdir0700(evalDir),
  ]);
  await Promise.all([
    write0600(legacyProtectedPositionIdsPath, "synthetic ids\n"),
    write0600(engineBin, "synthetic engine\n"),
    write0600(engineReceipt, '{"synthetic":true}\n'),
    write0600(engineArgument, "synthetic argument\n"),
    write0600(path.join(evalDir, "nn.bin"), "synthetic eval\n"),
    write0600(
      path.join(stageRoot, FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME),
      WORK_BYTES,
    ),
  ]);
  return {
    root,
    publicationParent,
    stageRoot,
    destinationRoot,
    leaseRoot,
    options: {
      repositoryRoot,
      rawLockRoot,
      roleLockRoot,
      roleBundleRoot,
      legacyProtectedPositionIdsPath,
      publicationParent,
      stageBasename,
      destinationBasename,
      engineBin,
      engineReceipt,
      engineArgs: [engineArgument],
      evalDir,
    },
  };
}

function authorizationDependencies(
  overrides: Partial<FloodgateTeacherStageAuthorizationDependencies> = {},
): FloodgateTeacherStageAuthorizationDependencies {
  return {
    effectiveUserId: effectiveUserId(),
    inspectorPythonExecutable: FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
    ...overrides,
  };
}

async function authorize(
  value: StageFixture,
  overrides: Partial<FloodgateTeacherStageAuthorizationDependencies> = {},
): Promise<Readonly<FloodgateTeacherStageLease>> {
  return authorizeFloodgateTeacherStageCoreForTests(
    value.options,
    authorizationDependencies(overrides),
  );
}

function renameReceipt(
  parent: fs.BigIntStats,
  stage: fs.BigIntStats,
): Readonly<FloodgateExclusiveDirectoryRenameReceipt> {
  return Object.freeze({
    contract: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT,
    trust_boundary: FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_TRUST_BOUNDARY,
    status: "verified-committed",
    parent_identity: Object.freeze({ dev: parent.dev, ino: parent.ino }),
    destination_identity: Object.freeze({ dev: stage.dev, ino: stage.ino }),
  });
}

async function publicationDependencies(
  value: StageFixture,
  afterRename?: (destination: string) => void | Promise<void>,
): Promise<Readonly<FloodgateTeacherStagePublicationDependencies>> {
  const [parent, stage] = await Promise.all([
    fs.promises.lstat(value.publicationParent, { bigint: true }),
    fs.promises.lstat(value.stageRoot, { bigint: true }),
  ]);
  return Object.freeze({
    exclusiveRename: async (source: string, destination: string) => {
      await fs.promises.rename(source, destination);
      await afterRename?.(destination);
      return renameReceipt(parent, stage);
    },
  });
}

async function captureFailure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error("expected operation to fail");
}

async function expectMissing(filePath: string): Promise<void> {
  await expect(fs.promises.lstat(filePath)).rejects.toMatchObject({
    code: "ENOENT",
  });
}

async function overwriteSameLength(filePath: string): Promise<Buffer> {
  const mutated = await fs.promises.readFile(filePath);
  if (mutated.byteLength === 0) throw new Error("cannot mutate an empty file");
  mutated[0] ^= 0x01;
  const handle = await fs.promises.open(
    filePath,
    fs.constants.O_RDWR | fs.constants.O_NOFOLLOW,
  );
  try {
    const result = await handle.write(mutated, 0, mutated.byteLength, 0);
    expect(result.bytesWritten).toBe(mutated.byteLength);
    await handle.datasync();
  } finally {
    await handle.close();
  }
  return mutated;
}

async function sortedEntries(directory: string): Promise<readonly string[]> {
  return (await fs.promises.readdir(directory)).sort(compareBytewise);
}

function parsedCanonicalFile(bytes: Uint8Array): Record<string, unknown> {
  const text = Buffer.from(bytes).toString("utf8");
  expect(text.endsWith("\n")).toBe(true);
  const parsed = JSON.parse(text) as Record<string, unknown>;
  expect(text).toBe(`${canonicalJson(parsed)}\n`);
  return parsed;
}

async function createPlan(
  value: StageFixture,
  binding: Readonly<FloodgateTrainingInputBinding>,
  overrides: Readonly<{
    trainingBinding?: Readonly<FloodgateTrainingInputBinding>;
    teacherRunBindingSha256?: string;
    projections?: readonly Readonly<FloodgateV7TrainingLabelProjection>[];
  }> = {},
): Promise<Readonly<FloodgateV7TrainingLabelFinalizationPlanForTests>> {
  const workPath = path.join(
    value.stageRoot,
    FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  );
  const [workBytes, workStat, parentStat, stageStat] = await Promise.all([
    fs.promises.readFile(workPath),
    fs.promises.lstat(workPath, { bigint: true }),
    fs.promises.lstat(value.publicationParent, { bigint: true }),
    fs.promises.lstat(value.stageRoot, { bigint: true }),
  ]);
  return createFloodgateV7TrainingLabelFinalizationPlanCoreForTests({
    runId: RUN_ID,
    keyId: KEY_ID,
    teacherRunBindingSha256:
      overrides.teacherRunBindingSha256 ?? TEACHER_RUN_BINDING_SHA256,
    trainingBinding: overrides.trainingBinding ?? binding,
    stage: {
      parentDev: parentStat.dev.toString(),
      parentIno: parentStat.ino.toString(),
      stageDev: stageStat.dev.toString(),
      stageIno: stageStat.ino.toString(),
      stageBasename: value.options.stageBasename,
      destinationBasename: value.options.destinationBasename,
    },
    projections: overrides.projections ?? projectionsForBinding(binding),
    work: {
      filename: FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
      bytes: workBytes.byteLength,
      sha256: sha256(workBytes),
      snapshot: {
        dev: workStat.dev.toString(),
        ino: workStat.ino.toString(),
        mode: workStat.mode.toString(),
        nlink: workStat.nlink.toString(),
        uid: workStat.uid.toString(),
        size: workStat.size.toString(),
        mtimeNs: workStat.mtimeNs.toString(),
        ctimeNs: workStat.ctimeNs.toString(),
      },
    },
  });
}

function finalizerDependencies(
  overrides: Partial<FloodgateV7TrainingLabelFinalizerDependencies> = {},
): FloodgateV7TrainingLabelFinalizerDependencies {
  return { effectiveUserId: effectiveUserId(), ...overrides };
}

async function finalize(
  value: StageFixture,
  postflight: Readonly<FloodgateTrainingConsumerPostflightReceipt>,
  plan: Readonly<FloodgateV7TrainingLabelFinalizationPlanForTests>,
  overrides: Readonly<{
    lease?: Readonly<FloodgateTeacherStageLease>;
    key?: Uint8Array;
    runId?: string;
    keyId?: string;
    dependencies?: Partial<FloodgateV7TrainingLabelFinalizerDependencies>;
    publication?: Readonly<FloodgateTeacherStagePublicationDependencies>;
  }> = {},
) {
  const lease = overrides.lease ?? (await authorize(value));
  const publication =
    overrides.publication ?? (await publicationDependencies(value));
  return finalizeAndPublishFloodgateV7TrainingLabelsCoreForTests(
    lease,
    postflight,
    plan,
    {
      rootKey: overrides.key ?? rootKey(),
      runId: overrides.runId ?? RUN_ID,
      keyId: overrides.keyId ?? KEY_ID,
    },
    finalizerDependencies(overrides.dependencies),
    publication,
  );
}

function verifyMetadataMac(
  record: Readonly<Record<string, unknown>>,
  macName: "result_mac" | "manifest_mac",
  domain: string,
  info: string,
): Buffer {
  const supplied = record[macName];
  const unsigned = Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== macName),
  );
  const key = Buffer.from(
    hkdfSync(
      "sha256",
      rootKey(),
      Buffer.from(RUN_ID, "hex"),
      Buffer.from(info),
      32,
    ),
  );
  const expected = createHmac("sha256", key)
    .update(domain)
    .update(canonicalJson(unsigned))
    .digest("hex");
  expect(supplied).toBe(expected);
  return key;
}

function expectZeroized(value: Uint8Array): void {
  expect([...value]).toEqual(new Array(value.byteLength).fill(0));
}

interface ObservedKeys {
  readonly references: Map<string, Uint8Array>;
  readonly initial: Map<string, Buffer>;
  readonly observe: NonNullable<
    FloodgateV7TrainingLabelFinalizerDependencies["observeKeyForTests"]
  >;
}

function observedKeys(): ObservedKeys {
  const references = new Map<string, Uint8Array>();
  const initial = new Map<string, Buffer>();
  return {
    references,
    initial,
    observe: (kind, key) => {
      references.set(kind, key);
      initial.set(kind, Buffer.from(key));
      return undefined;
    },
  };
}

async function interruptedAt(
  value: StageFixture,
  consumer: ConsumerFixture,
  eventToThrow: FloodgateV7TrainingLabelFinalizerEvent,
): Promise<void> {
  const postflight = await mintPostflight(consumer);
  const plan = await createPlan(value, postflight.binding);
  const failure = await captureFailure(
    finalize(value, postflight.receipt, plan, {
      dependencies: {
        failpointForTests: (event) => {
          if (event === eventToThrow) {
            throw new Error(`synthetic interruption at ${event}`);
          }
        },
      },
    }),
  );
  expect(failure).toBeInstanceOf(FloodgateV7TrainingLabelFinalizerError);
  await expectMissing(value.destinationRoot);
  await expectMissing(value.leaseRoot);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map(async (root) => {
      await fs.promises.chmod(root, 0o700).catch(() => undefined);
      await fs.promises.rm(root, { recursive: true, force: true });
    }),
  );
});

posixDescribe("Floodgate v7 training-label finalizer core", () => {
  it("finalizes one normal and one forced parent with separate authenticated metadata keys", async () => {
    const consumer = await consumerFixture();
    const postflight = await mintPostflight(consumer);
    const stage = await stageFixture();
    const plan = await createPlan(stage, postflight.binding);
    const callerKey = rootKey();
    const callerKeyBefore = Buffer.from(callerKey);
    const keys = observedKeys();
    const events: FloodgateV7TrainingLabelFinalizerEvent[] = [];

    const receipt = await finalize(stage, postflight.receipt, plan, {
      key: callerKey,
      dependencies: {
        observeKeyForTests: keys.observe,
        failpointForTests: (event) => {
          events.push(event);
        },
      },
    });

    expect(receipt.contract).toBe(
      FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_CONTRACT,
    );
    expect(receipt.status).toBe(
      FLOODGATE_V7_TRAINING_LABEL_FINALIZATION_STATUS,
    );
    expect(receipt.content.parents).toBe(2);
    expect(receipt.content.training_records).toBe(
      projectionsForBinding(postflight.binding)[0].rows.length,
    );
    expect(receipt.postpublication).toEqual({
      destination_reopened: true,
      exact_entries: FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES,
      content_reverified: true,
    });
    expect(events).toEqual([
      "train-created",
      "train-written",
      "train-datasynced",
      "train-directory-synced",
      "result-created",
      "result-written",
      "result-datasynced",
      "result-directory-synced",
      "manifest-created",
      "manifest-written",
      "manifest-datasynced",
      "manifest-directory-synced",
      "source-reopened",
      "source-reverified",
      "before-publication",
      "before-destination-reopen",
      "before-destination-reverify",
      "destination-reverified",
    ]);
    expect(await sortedEntries(stage.destinationRoot)).toEqual(
      FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES,
    );
    await expectMissing(stage.stageRoot);
    await expectMissing(stage.leaseRoot);

    const expectedTrain = Buffer.from(
      `${projectionsForBinding(postflight.binding)[0]
        .rows.map((row) => canonicalJson(row))
        .join("\n")}\n`,
    );
    const [trainBytes, resultBytes, manifestBytes] = await Promise.all([
      fs.promises.readFile(
        path.join(
          stage.destinationRoot,
          FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
        ),
      ),
      fs.promises.readFile(
        path.join(
          stage.destinationRoot,
          FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
        ),
      ),
      fs.promises.readFile(
        path.join(
          stage.destinationRoot,
          FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
        ),
      ),
    ]);
    expect(trainBytes).toEqual(expectedTrain);
    const result = parsedCanonicalFile(resultBytes);
    const manifest = parsedCanonicalFile(manifestBytes);
    expect(result.schema).toBe(FLOODGATE_V7_TRAINING_LABEL_RESULT_SCHEMA);
    expect(manifest.schema).toBe(FLOODGATE_V7_TRAINING_LABEL_MANIFEST_SCHEMA);
    expect(result.teacher_run_binding_sha256).toBe(TEACHER_RUN_BINDING_SHA256);
    expect(manifest.teacher_run_binding_sha256).toBe(
      TEACHER_RUN_BINDING_SHA256,
    );
    expect((result.training as Record<string, unknown>).parent_ids_sha256).toBe(
      postflight.binding.parent_ids_sha256,
    );
    expect(
      (manifest.training as Record<string, unknown>).parent_ids_sha256,
    ).toBe(postflight.binding.parent_ids_sha256);
    const expectedResultKey = verifyMetadataMac(
      result,
      "result_mac",
      FLOODGATE_V7_TRAINING_LABEL_RESULT_MAC_DOMAIN,
      FLOODGATE_V7_TRAINING_LABEL_RESULT_HKDF_INFO,
    );
    const expectedManifestKey = verifyMetadataMac(
      manifest,
      "manifest_mac",
      FLOODGATE_V7_TRAINING_LABEL_MANIFEST_MAC_DOMAIN,
      FLOODGATE_V7_TRAINING_LABEL_MANIFEST_HKDF_INFO,
    );
    expect(expectedResultKey).not.toEqual(expectedManifestKey);
    expect(keys.initial.get("root")).toEqual(callerKeyBefore);
    expect(keys.initial.get("result")).toEqual(expectedResultKey);
    expect(keys.initial.get("manifest")).toEqual(expectedManifestKey);
    expect(keys.references.get("root")).not.toBe(callerKey);
    for (const reference of keys.references.values()) {
      expectZeroized(reference);
    }
    expect(Buffer.from(callerKey)).toEqual(callerKeyBefore);
    expectedResultKey.fill(0);
    expectedManifestKey.fill(0);
    expect(Object.keys(plan).sort(compareBytewise)).toEqual([
      "claim_boundary",
      "contract",
      "execution_boundary",
      "status",
    ]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it("accepts exactly the four resumable entry states and completes deterministic prefixes", async () => {
    const cases = [
      {
        name: "work only",
        entries: [FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME],
      },
      {
        name: "work plus train prefix",
        entries: [
          FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
          FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
        ],
        interrupt: "train-directory-synced" as const,
        truncate: FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
      },
      {
        name: "complete train plus result prefix",
        entries: [
          FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
          FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
          FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
        ],
        interrupt: "result-directory-synced" as const,
        truncate: FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
      },
      {
        name: "complete predecessors plus manifest prefix",
        entries: [...FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES],
        interrupt: "manifest-directory-synced" as const,
        truncate: FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
      },
      {
        name: "complete four-file set",
        entries: [...FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES],
        interrupt: "before-publication" as const,
      },
    ];

    for (const testCase of cases) {
      const consumer = await consumerFixture(`state-${testCase.name}`);
      const stage = await stageFixture();
      if (testCase.interrupt !== undefined) {
        await interruptedAt(stage, consumer, testCase.interrupt);
      }
      expect(await sortedEntries(stage.stageRoot), testCase.name).toEqual(
        testCase.entries,
      );
      let expectedCompleted: Buffer | undefined;
      if (testCase.truncate !== undefined) {
        const target = path.join(stage.stageRoot, testCase.truncate);
        expectedCompleted = await fs.promises.readFile(target);
        await fs.promises.truncate(
          target,
          Math.max(1, Math.floor(expectedCompleted.byteLength / 2)),
        );
        const prefix = await fs.promises.readFile(target);
        expect(expectedCompleted.subarray(0, prefix.byteLength)).toEqual(
          prefix,
        );
      }
      const sourceInodes = new Map<string, bigint>();
      for (const filename of testCase.entries) {
        sourceInodes.set(
          filename,
          (
            await fs.promises.lstat(path.join(stage.stageRoot, filename), {
              bigint: true,
            })
          ).ino,
        );
      }

      const retryPostflight = await mintPostflight(consumer);
      const retryPlan = await createPlan(stage, retryPostflight.binding);
      const receipt = await finalize(stage, retryPostflight.receipt, retryPlan);
      expect(receipt.postpublication.content_reverified, testCase.name).toBe(
        true,
      );
      for (const [filename, sourceInode] of sourceInodes) {
        expect(
          (
            await fs.promises.lstat(
              path.join(stage.destinationRoot, filename),
              { bigint: true },
            )
          ).ino,
          `${testCase.name}:${filename}`,
        ).toBe(sourceInode);
      }
      if (testCase.truncate !== undefined) {
        expect(
          await fs.promises.readFile(
            path.join(stage.destinationRoot, testCase.truncate),
          ),
        ).toEqual(expectedCompleted);
      }
    }
  });

  it("treats throw undefined as failure and zeroizes owned keys without changing the caller key", async () => {
    const consumer = await consumerFixture("throw-undefined");
    const postflight = await mintPostflight(consumer);
    const stage = await stageFixture();
    const plan = await createPlan(stage, postflight.binding);
    const callerKey = rootKey();
    const callerKeyBefore = Buffer.from(callerKey);
    const keys = observedKeys();

    const failure = await captureFailure(
      finalize(stage, postflight.receipt, plan, {
        key: callerKey,
        dependencies: {
          observeKeyForTests: keys.observe,
          failpointForTests: (event) => {
            if (event === "train-created") throw undefined;
          },
        },
      }),
    );

    expect(failure).toBeInstanceOf(FloodgateV7TrainingLabelFinalizerError);
    expect(failure).toMatchObject({
      phase: "train-persistence",
      primary: undefined,
      mayHavePublished: false,
      planConsumed: true,
      postflightConsumed: true,
    });
    for (const reference of keys.references.values()) {
      expectZeroized(reference);
    }
    expect(Buffer.from(callerKey)).toEqual(callerKeyBefore);
    expect(
      (
        await fs.promises.stat(
          path.join(
            stage.stageRoot,
            FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
          ),
        )
      ).size,
    ).toBe(0);
    await expectMissing(stage.destinationRoot);
    await expectMissing(stage.leaseRoot);
  });

  it("requires the exact one-shot non-Proxy plan object", async () => {
    for (const kind of ["clone", "proxy"] as const) {
      const consumer = await consumerFixture(`opaque-${kind}`);
      const postflight = await mintPostflight(consumer);
      const stage = await stageFixture();
      const plan = await createPlan(stage, postflight.binding);
      const lease = await authorize(stage);
      const supplied =
        kind === "clone"
          ? (structuredClone(
              plan,
            ) as Readonly<FloodgateV7TrainingLabelFinalizationPlanForTests>)
          : (new Proxy(
              plan,
              {},
            ) as Readonly<FloodgateV7TrainingLabelFinalizationPlanForTests>);

      const failure = await captureFailure(
        finalize(stage, postflight.receipt, supplied, { lease }),
      );
      expect(failure).toBeInstanceOf(FloodgateV7TrainingLabelFinalizerError);
      expect(failure).toMatchObject({
        phase: "plan-claim",
        planConsumed: false,
        postflightConsumed: false,
        mayHavePersisted: false,
      });
      expect(
        claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(
          postflight.receipt,
        ),
      ).toBeUndefined();
      await lease.close();
      await expectMissing(stage.destinationRoot);
      expect(await sortedEntries(stage.stageRoot)).toEqual([
        FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
      ]);
    }

    const consumer = await consumerFixture("opaque-reuse");
    const firstPostflight = await mintPostflight(consumer);
    const stage = await stageFixture();
    const plan = await createPlan(stage, firstPostflight.binding);
    const firstFailure = await captureFailure(
      finalize(stage, firstPostflight.receipt, plan, {
        dependencies: {
          failpointForTests: (event) => {
            if (event === "train-created") throw new Error("consume plan once");
          },
        },
      }),
    );
    expect(firstFailure).toMatchObject({ planConsumed: true });
    const retryPostflight = await mintPostflight(consumer);
    const retryLease = await authorize(stage);
    const reuseFailure = await captureFailure(
      finalize(stage, retryPostflight.receipt, plan, { lease: retryLease }),
    );
    expect(reuseFailure).toMatchObject({
      phase: "plan-claim",
      planConsumed: false,
      postflightConsumed: false,
    });
    expect(
      claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(
        retryPostflight.receipt,
      ),
    ).toBeUndefined();
    await retryLease.close();
  });

  it("does not accept cloned or proxied postflight authority", async () => {
    for (const kind of ["clone", "proxy"] as const) {
      const consumer = await consumerFixture(`postflight-${kind}`);
      const postflight = await mintPostflight(consumer);
      const stage = await stageFixture();
      const plan = await createPlan(stage, postflight.binding);
      const supplied =
        kind === "clone"
          ? (structuredClone(
              postflight.receipt,
            ) as Readonly<FloodgateTrainingConsumerPostflightReceipt>)
          : (new Proxy(
              postflight.receipt,
              {},
            ) as Readonly<FloodgateTrainingConsumerPostflightReceipt>);

      const failure = await captureFailure(finalize(stage, supplied, plan));
      expect(failure, kind).toBeInstanceOf(
        FloodgateV7TrainingLabelFinalizerError,
      );
      expect(failure, kind).toMatchObject({
        phase: "postflight-claim",
        planConsumed: true,
        postflightConsumed: false,
        mayHavePersisted: false,
        mayHavePublished: false,
      });
      expect(
        claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(
          postflight.receipt,
        ),
      ).toBeUndefined();
      await expectMissing(stage.leaseRoot);
      await expectMissing(stage.destinationRoot);
      await expectMissing(
        path.join(stage.stageRoot, FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME),
      );
    }
  });

  it("rejects unrelated training, run, and key bindings before creating output", async () => {
    const cases = [
      { kind: "training-binding" as const },
      { kind: "run-id" as const, runId: "34".repeat(32) },
      { kind: "key-id" as const, keyId: `${KEY_ID}-different` },
    ];
    for (const testCase of cases) {
      const planConsumer = await consumerFixture(`plan-${testCase.kind}`);
      const planPostflight = await mintPostflight(planConsumer);
      const suppliedPostflight =
        testCase.kind === "training-binding"
          ? await mintPostflight(
              await consumerFixture(`unrelated-${testCase.kind}`),
            )
          : planPostflight;
      const stage = await stageFixture();
      const plan = await createPlan(stage, planPostflight.binding);
      const lease = await authorize(stage);

      const failure = await captureFailure(
        finalize(stage, suppliedPostflight.receipt, plan, {
          lease,
          ...(testCase.runId === undefined ? {} : { runId: testCase.runId }),
          ...(testCase.keyId === undefined ? {} : { keyId: testCase.keyId }),
        }),
      );
      expect(failure, testCase.kind).toBeInstanceOf(
        FloodgateV7TrainingLabelFinalizerError,
      );
      expect(failure, testCase.kind).toMatchObject({
        phase: "cross-binding",
        planConsumed: true,
        postflightConsumed: testCase.kind === "training-binding",
        mayHavePersisted: false,
        mayHavePublished: false,
        leaseMayRemain: testCase.kind !== "training-binding",
        retryDisposition:
          testCase.kind === "training-binding"
            ? "fresh-authority-may-resume-exact-prefix"
            : "caller-must-reconcile-existing-lease-authority",
      });
      await expectMissing(
        path.join(stage.stageRoot, FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME),
      );
      await expectMissing(stage.destinationRoot);
      if (testCase.kind === "training-binding") {
        await expectMissing(stage.leaseRoot);
        expect(
          claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(
            planPostflight.receipt,
          ),
        ).toBeUndefined();
      } else {
        expect(
          claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(
            suppliedPostflight.receipt,
          ),
        ).toBeUndefined();
        expect((await fs.promises.lstat(stage.leaseRoot)).isDirectory()).toBe(
          true,
        );
        await lease.close();
      }
      await expectMissing(stage.leaseRoot);
    }
  });

  it("rejects projections whose parent commitment differs from the training binding", async () => {
    const consumer = await consumerFixture("wrong-parent-commitment");
    const postflight = await mintPostflight(consumer);
    const stage = await stageFixture();
    await expect(
      createPlan(stage, postflight.binding, {
        trainingBinding: Object.freeze({
          ...postflight.binding,
          parent_ids_sha256: "f".repeat(64),
        }),
      }),
    ).rejects.toThrow(
      "synthetic projection parent IDs do not match the training binding",
    );
    expect(
      claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(
        postflight.receipt,
      ),
    ).toBeUndefined();
    await expectMissing(
      path.join(stage.stageRoot, FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME),
    );
  });

  it("rejects a whole-stage move to a different parent and basename while preserving the work inode", async () => {
    const consumer = await consumerFixture("stage-binding-move");
    const postflight = await mintPostflight(consumer);
    const stage = await stageFixture();
    const plan = await createPlan(stage, postflight.binding);
    const originalWork = await fs.promises.lstat(
      path.join(stage.stageRoot, FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME),
      { bigint: true },
    );
    const movedParent = path.join(stage.root, "moved-publication");
    const movedStageBasename = "moved-v7-training-label-stage";
    const movedDestinationBasename = "moved-v7-training-label-final";
    const movedStageRoot = path.join(movedParent, movedStageBasename);
    await mkdir0700(movedParent);
    await fs.promises.rename(stage.stageRoot, movedStageRoot);
    const movedStage: StageFixture = {
      ...stage,
      publicationParent: movedParent,
      stageRoot: movedStageRoot,
      destinationRoot: path.join(movedParent, movedDestinationBasename),
      leaseRoot: path.join(
        movedParent,
        `.${movedStageBasename}.authorization-lease`,
      ),
      options: {
        ...stage.options,
        publicationParent: movedParent,
        stageBasename: movedStageBasename,
        destinationBasename: movedDestinationBasename,
      },
    };
    const movedWork = await fs.promises.lstat(
      path.join(
        movedStage.stageRoot,
        FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
      ),
      { bigint: true },
    );
    expect({ dev: movedWork.dev, ino: movedWork.ino }).toEqual({
      dev: originalWork.dev,
      ino: originalWork.ino,
    });

    const failure = await captureFailure(
      finalize(movedStage, postflight.receipt, plan),
    );
    expect(failure).toBeInstanceOf(FloodgateV7TrainingLabelFinalizerError);
    expect(failure).toMatchObject({
      phase: "cross-binding",
      planConsumed: true,
      postflightConsumed: false,
      mayHavePersisted: false,
      mayHavePublished: false,
      leaseMayRemain: false,
      retryDisposition: "fresh-authority-may-resume-exact-prefix",
    });
    expect(
      claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(
        postflight.receipt,
      ),
    ).toBeUndefined();
    await expectMissing(movedStage.leaseRoot);
    await expectMissing(movedStage.destinationRoot);
    await expectMissing(
      path.join(
        movedStage.stageRoot,
        FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
      ),
    );
  });

  it("rejects scan-time source content or same-byte inode replacement without creating train output", async () => {
    for (const mutation of ["content", "inode"] as const) {
      const consumer = await consumerFixture(`source-${mutation}`);
      const postflight = await mintPostflight(consumer);
      const stage = await stageFixture();
      const plan = await createPlan(stage, postflight.binding);
      const workPath = path.join(
        stage.stageRoot,
        FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
      );
      const before = await fs.promises.lstat(workPath, { bigint: true });
      if (mutation === "content") {
        await fs.promises.appendFile(workPath, "synthetic mutation\n");
      } else {
        const original = await fs.promises.readFile(workPath);
        await fs.promises.rename(
          workPath,
          path.join(stage.root, "displaced-work.jsonl"),
        );
        await write0600(workPath, original);
      }
      const after = await fs.promises.lstat(workPath, { bigint: true });
      if (mutation === "inode") {
        expect(after.ino).not.toBe(before.ino);
        expect(await fs.promises.readFile(workPath)).toEqual(WORK_BYTES);
      }

      const failure = await captureFailure(
        finalize(stage, postflight.receipt, plan),
      );
      expect(failure, mutation).toBeInstanceOf(
        FloodgateV7TrainingLabelFinalizerError,
      );
      expect(failure, mutation).toMatchObject({
        phase: "source-work-audit",
        mayHavePersisted: false,
        mayHavePublished: false,
      });
      await expectMissing(
        path.join(stage.stageRoot, FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME),
      );
      await expectMissing(stage.destinationRoot);
      await expectMissing(stage.leaseRoot);
    }
  });

  it("rereads a datasynced train before directory sync and creates no successor after corruption", async () => {
    const consumer = await consumerFixture("train-reread-order");
    const postflight = await mintPostflight(consumer);
    const stage = await stageFixture();
    const plan = await createPlan(stage, postflight.binding);
    const lease = await authorize(stage);
    const stageStat = await fs.promises.lstat(stage.stageRoot, {
      bigint: true,
    });
    const syncPrototype = await fileHandleSyncPrototype(stage.stageRoot);
    const nativeSync = syncPrototype.sync;
    let stageDirectorySyncs = 0;
    const syncSpy = vi
      .spyOn(syncPrototype, "sync")
      .mockImplementation(async function (this: fs.promises.FileHandle) {
        const current = await this.stat({ bigint: true });
        if (current.dev === stageStat.dev && current.ino === stageStat.ino) {
          stageDirectorySyncs += 1;
        }
        await nativeSync.call(this);
      });
    let corrupted: Buffer | undefined;
    const trainPath = path.join(
      stage.stageRoot,
      FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
    );
    const failure = await captureFailure(
      finalize(stage, postflight.receipt, plan, {
        lease,
        dependencies: {
          failpointForTests: async (event) => {
            if (event === "train-datasynced") {
              corrupted = await overwriteSameLength(trainPath);
            }
          },
        },
      }),
    ).finally(() => syncSpy.mockRestore());

    expect(failure).toBeInstanceOf(FloodgateV7TrainingLabelFinalizerError);
    expect(failure).toMatchObject({
      phase: "train-persistence",
      durability: "not-established",
      mayHavePublished: false,
      retryDisposition: "manual-content-reconciliation-required",
    });
    expect(stageDirectorySyncs).toBe(1);
    expect(corrupted).toBeDefined();
    expect(await fs.promises.readFile(trainPath)).toEqual(corrupted);
    await expectMissing(
      path.join(stage.stageRoot, FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME),
    );
    await expectMissing(
      path.join(stage.stageRoot, FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME),
    );
    await expectMissing(stage.destinationRoot);
    await expectMissing(stage.leaseRoot);
  });

  it("classifies post-create and post-datasync metadata tampering as manual content", async () => {
    const cases = [
      {
        name: "train-created-mode",
        event: "train-created" as const,
        filename: FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
        phase: "train-persistence" as const,
        successor: FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
      },
      {
        name: "train-mode",
        event: "train-datasynced" as const,
        filename: FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
        phase: "train-persistence" as const,
        successor: FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
      },
      {
        name: "result-hardlink",
        event: "result-datasynced" as const,
        filename: FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
        phase: "result-persistence" as const,
        successor: FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
      },
    ];
    for (const testCase of cases) {
      const consumer = await consumerFixture(`post-datasync-${testCase.name}`);
      const postflight = await mintPostflight(consumer);
      const stage = await stageFixture();
      const plan = await createPlan(stage, postflight.binding);
      const target = path.join(stage.stageRoot, testCase.filename);
      const retainedLink = path.join(stage.root, `${testCase.name}.retained`);
      let before: fs.BigIntStats | undefined;
      let exactBytes: Buffer | undefined;
      const failure = await captureFailure(
        finalize(stage, postflight.receipt, plan, {
          dependencies: {
            failpointForTests: async (event) => {
              if (event !== testCase.event) return;
              [before, exactBytes] = await Promise.all([
                fs.promises.lstat(target, { bigint: true }),
                fs.promises.readFile(target),
              ]);
              if (testCase.name.includes("mode")) {
                await fs.promises.chmod(target, 0o644);
              } else {
                await fs.promises.link(target, retainedLink);
              }
            },
          },
        }),
      );

      expect(failure, testCase.name).toBeInstanceOf(
        FloodgateV7TrainingLabelFinalizerError,
      );
      expect(failure, testCase.name).toMatchObject({
        phase: testCase.phase,
        mayHavePublished: false,
        leaseMayRemain: true,
        retryDisposition: "manual-content-and-lease-reconciliation-required",
      });
      expect(before).toBeDefined();
      expect(exactBytes).toBeDefined();
      const after = await fs.promises.lstat(target, { bigint: true });
      expect({ dev: after.dev, ino: after.ino }).toEqual({
        dev: before?.dev,
        ino: before?.ino,
      });
      expect(await fs.promises.readFile(target)).toEqual(exactBytes);
      if (testCase.name.includes("mode")) {
        expect(Number(after.mode & BigInt(0o7777))).toBe(0o644);
      } else {
        expect(after.nlink).toBe(BigInt(2));
        expect(await fs.promises.readFile(retainedLink)).toEqual(exactBytes);
      }
      await expectMissing(path.join(stage.stageRoot, testCase.successor));
      await expectMissing(stage.destinationRoot);
      expect((await fs.promises.lstat(stage.leaseRoot)).isDirectory()).toBe(
        true,
      );
    }
  });

  it("classifies same-size source-reopened tampering as manual content and preserves it", async () => {
    const consumer = await consumerFixture("source-reopened-tamper");
    const postflight = await mintPostflight(consumer);
    const stage = await stageFixture();
    const plan = await createPlan(stage, postflight.binding);
    const trainPath = path.join(
      stage.stageRoot,
      FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
    );
    let corrupted: Buffer | undefined;
    const failure = await captureFailure(
      finalize(stage, postflight.receipt, plan, {
        dependencies: {
          failpointForTests: async (event) => {
            if (event === "source-reopened") {
              corrupted = await overwriteSameLength(trainPath);
            }
          },
        },
      }),
    );

    expect(failure).toBeInstanceOf(FloodgateV7TrainingLabelFinalizerError);
    expect(failure).toMatchObject({
      phase: "source-reverification",
      mayHavePublished: false,
      leaseMayRemain: false,
      retryDisposition: "manual-content-reconciliation-required",
    });
    expect(corrupted).toBeDefined();
    expect(await fs.promises.readFile(trainPath)).toEqual(corrupted);
    await expectMissing(stage.destinationRoot);
    await expectMissing(stage.leaseRoot);
  });

  it("chmods create-only artifacts to 0600 under a restrictive umask", async () => {
    const consumer = await consumerFixture("restrictive-umask");
    const postflight = await mintPostflight(consumer);
    const stage = await stageFixture();
    const plan = await createPlan(stage, postflight.binding);
    const lease = await authorize(stage);
    const previousUmask = process.umask(0o777);
    try {
      await finalize(stage, postflight.receipt, plan, { lease });
    } finally {
      process.umask(previousUmask);
    }
    for (const filename of [
      FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
      FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
      FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
    ]) {
      const stat = await fs.promises.lstat(
        path.join(stage.destinationRoot, filename),
      );
      expect(stat.mode & 0o7777, filename).toBe(0o600);
    }
  });

  it("rejects published destination content or same-byte inode replacement and zeroizes keys", async () => {
    for (const mutation of ["content", "inode"] as const) {
      const consumer = await consumerFixture(`destination-${mutation}`);
      const postflight = await mintPostflight(consumer);
      const stage = await stageFixture();
      const plan = await createPlan(stage, postflight.binding);
      const callerKey = rootKey();
      const callerKeyBefore = Buffer.from(callerKey);
      const keys = observedKeys();

      const failure = await captureFailure(
        finalize(stage, postflight.receipt, plan, {
          key: callerKey,
          dependencies: {
            observeKeyForTests: keys.observe,
            failpointForTests: async (event) => {
              if (event !== "before-destination-reverify") return;
              const resultPath = path.join(
                stage.destinationRoot,
                FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
              );
              if (mutation === "content") {
                await fs.promises.appendFile(resultPath, "tamper\n");
              } else {
                const exact = await fs.promises.readFile(resultPath);
                const before = await fs.promises.lstat(resultPath, {
                  bigint: true,
                });
                await fs.promises.rename(
                  resultPath,
                  path.join(stage.root, "displaced-result.json"),
                );
                await write0600(resultPath, exact);
                const after = await fs.promises.lstat(resultPath, {
                  bigint: true,
                });
                expect(after.ino).not.toBe(before.ino);
              }
            },
          },
        }),
      );

      expect(failure, mutation).toBeInstanceOf(
        FloodgateV7TrainingLabelFinalizerError,
      );
      expect(failure, mutation).toMatchObject({
        phase: "destination-reverification",
        mayHavePublished: true,
      });
      for (const reference of keys.references.values()) {
        expectZeroized(reference);
      }
      expect(Buffer.from(callerKey)).toEqual(callerKeyBefore);
      await expectMissing(stage.stageRoot);
      await expectMissing(stage.leaseRoot);
      expect(await sortedEntries(stage.destinationRoot)).toEqual(
        FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES,
      );
    }
  });

  it("never repairs a partial predecessor when a successor artifact exists", async () => {
    const cases = [
      {
        seed: "partial-train-with-result",
        interrupt: "result-directory-synced" as const,
        partial: FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
        successor: FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
      },
      {
        seed: "partial-result-with-manifest",
        interrupt: "manifest-directory-synced" as const,
        partial: FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
        successor: FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
      },
    ];
    for (const testCase of cases) {
      const consumer = await consumerFixture(testCase.seed);
      const stage = await stageFixture();
      await interruptedAt(stage, consumer, testCase.interrupt);
      const partialPath = path.join(stage.stageRoot, testCase.partial);
      const successorPath = path.join(stage.stageRoot, testCase.successor);
      const [completePredecessor, successorBefore] = await Promise.all([
        fs.promises.readFile(partialPath),
        fs.promises.readFile(successorPath),
      ]);
      const partialLength = Math.max(
        1,
        Math.floor(completePredecessor.byteLength / 2),
      );
      await fs.promises.truncate(partialPath, partialLength);
      const partialBefore = await fs.promises.readFile(partialPath);

      const postflight = await mintPostflight(consumer);
      const plan = await createPlan(stage, postflight.binding);
      const failure = await captureFailure(
        finalize(stage, postflight.receipt, plan),
      );

      expect(failure, testCase.seed).toBeInstanceOf(
        FloodgateV7TrainingLabelFinalizerError,
      );
      expect(failure, testCase.seed).toMatchObject({
        mayHavePublished: false,
      });
      expect(await fs.promises.readFile(partialPath)).toEqual(partialBefore);
      expect(await fs.promises.readFile(successorPath)).toEqual(
        successorBefore,
      );
      expect(completePredecessor.subarray(0, partialLength)).toEqual(
        partialBefore,
      );
      await expectMissing(stage.destinationRoot);
      await expectMissing(stage.leaseRoot);
    }
  });

  it("preserves every illegal entry subset and extra entry without publishing", async () => {
    const cases: readonly Readonly<{
      name: string;
      files: readonly string[];
      preauthorize?: boolean;
    }>[] = [
      {
        name: "result without train",
        files: [FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME],
      },
      {
        name: "manifest without predecessors",
        files: [FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME],
      },
      {
        name: "manifest without result",
        files: [
          FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
          FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
        ],
      },
      { name: "allowed val extra", files: ["val.jsonl"] },
      { name: "unknown extra", files: ["unknown.tmp"], preauthorize: true },
    ];

    for (const testCase of cases) {
      const consumer = await consumerFixture(`illegal-${testCase.name}`);
      const postflight = await mintPostflight(consumer);
      const stage = await stageFixture();
      const plan = await createPlan(stage, postflight.binding);
      const lease = testCase.preauthorize ? await authorize(stage) : undefined;
      const expected = new Map<string, Buffer>();
      for (const filename of testCase.files) {
        const bytes = Buffer.from(`preserve ${testCase.name} ${filename}\n`);
        await write0600(path.join(stage.stageRoot, filename), bytes);
        expected.set(filename, bytes);
      }

      const failure = await captureFailure(
        finalize(stage, postflight.receipt, plan, {
          ...(lease === undefined ? {} : { lease }),
        }),
      );
      expect(failure, testCase.name).toBeInstanceOf(
        FloodgateV7TrainingLabelFinalizerError,
      );
      expect(failure, testCase.name).toMatchObject({
        phase: "source-work-audit",
        observedState: `{${(await sortedEntries(stage.stageRoot)).join(",")}}`,
        mayHavePersisted: false,
        mayHavePublished: false,
      });
      for (const [filename, bytes] of expected) {
        expect(
          await fs.promises.readFile(path.join(stage.stageRoot, filename)),
        ).toEqual(bytes);
      }
      await expectMissing(stage.destinationRoot);
      const leaseStillExists = await fs.promises
        .lstat(stage.leaseRoot)
        .then(() => true)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false;
          throw error;
        });
      if (leaseStillExists) {
        expect(
          (failure as FloodgateV7TrainingLabelFinalizerError).leaseMayRemain,
        ).toBe(true);
      }
    }
  });

  it("preserves mismatching and overlong train content for manual reconciliation", async () => {
    const exactTrain = Buffer.from(
      `${projections()[0]
        .rows.map((row) => canonicalJson(row))
        .join("\n")}\n`,
    );
    for (const testCase of [
      { name: "mismatch", bytes: Buffer.from("X") },
      {
        name: "longer",
        bytes: Buffer.concat([exactTrain, Buffer.from("unexpected-tail\n")]),
      },
    ]) {
      const consumer = await consumerFixture(`train-${testCase.name}`);
      const postflight = await mintPostflight(consumer);
      const stage = await stageFixture();
      const plan = await createPlan(stage, postflight.binding);
      const trainPath = path.join(
        stage.stageRoot,
        FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
      );
      await write0600(trainPath, testCase.bytes);

      const failure = await captureFailure(
        finalize(stage, postflight.receipt, plan),
      );
      expect(failure, testCase.name).toBeInstanceOf(
        FloodgateV7TrainingLabelFinalizerError,
      );
      expect(failure, testCase.name).toMatchObject({
        phase: "train-persistence",
        mayHavePublished: false,
      });
      expect(await fs.promises.readFile(trainPath)).toEqual(testCase.bytes);
      await expectMissing(
        path.join(stage.stageRoot, FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME),
      );
      await expectMissing(stage.destinationRoot);
      await expectMissing(stage.leaseRoot);
    }
  });

  it("rejects and preserves symlink, hardlink, wrong-mode, and non-file train entries", async () => {
    for (const kind of ["symlink", "hardlink", "mode", "type"] as const) {
      const consumer = await consumerFixture(`unsafe-${kind}`);
      const postflight = await mintPostflight(consumer);
      const stage = await stageFixture();
      const plan = await createPlan(stage, postflight.binding);
      const lease = await authorize(stage);
      const trainPath = path.join(
        stage.stageRoot,
        FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
      );
      const target = path.join(stage.root, `unsafe-${kind}-target`);
      if (kind === "symlink") {
        await write0600(target, "symlink target\n");
        await fs.promises.symlink(target, trainPath);
      } else if (kind === "hardlink") {
        await write0600(target, "hardlink target\n");
        await fs.promises.link(target, trainPath);
      } else if (kind === "mode") {
        await write0600(trainPath, "wrong mode\n");
        await fs.promises.chmod(trainPath, 0o644);
      } else {
        await mkdir0700(trainPath);
      }
      const before = await fs.promises.lstat(trainPath, { bigint: true });

      const failure = await captureFailure(
        finalize(stage, postflight.receipt, plan, { lease }),
      );
      expect(failure, kind).toBeInstanceOf(
        FloodgateV7TrainingLabelFinalizerError,
      );
      expect(failure, kind).toMatchObject({
        phase: "train-persistence",
        mayHavePublished: false,
      });
      const after = await fs.promises.lstat(trainPath, { bigint: true });
      expect(after.ino, kind).toBe(before.ino);
      expect(after.mode, kind).toBe(before.mode);
      expect(after.nlink, kind).toBe(before.nlink);
      if (kind === "symlink") {
        expect(await fs.promises.readlink(trainPath)).toBe(target);
      }
      await expectMissing(stage.destinationRoot);
      const leaseStillExists = await fs.promises
        .lstat(stage.leaseRoot)
        .then(() => true)
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false;
          throw error;
        });
      if (leaseStillExists) {
        expect(
          (failure as FloodgateV7TrainingLabelFinalizerError).leaseMayRemain,
        ).toBe(true);
      }
    }
  });

  it("loops over valid positional short writes until every artifact is exact", async () => {
    const consumer = await consumerFixture("short-writes");
    const postflight = await mintPostflight(consumer);
    const stage = await stageFixture();
    const plan = await createPlan(stage, postflight.binding);
    const writes: Array<Readonly<{ filename: string; length: number }>> = [];

    const receipt = await finalize(stage, postflight.receipt, plan, {
      dependencies: {
        writeForTests: async (request, write) => {
          writes.push({ filename: request.filename, length: request.length });
          return write(Math.min(7, request.length));
        },
      },
    });

    expect(receipt.postpublication.content_reverified).toBe(true);
    expect(writes.length).toBeGreaterThan(10);
    expect(new Set(writes.map((entry) => entry.filename))).toEqual(
      new Set([
        FLOODGATE_V7_TRAINING_LABEL_TRAIN_FILENAME,
        FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
        FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
      ]),
    );
  });

  it("rejects zero, invalid, overreported, skipped, and duplicate native writes", async () => {
    const cases: readonly Readonly<{
      name: string;
      write: NonNullable<
        FloodgateV7TrainingLabelFinalizerDependencies["writeForTests"]
      >;
    }>[] = [
      {
        name: "zero report",
        write: async (_request, write) => {
          await write(1);
          return 0;
        },
      },
      {
        name: "negative report",
        write: async (_request, write) => {
          await write(1);
          return -1;
        },
      },
      {
        name: "overreport",
        write: async (_request, write) => (await write(1)) + 1,
      },
      {
        name: "native skipped",
        write: async () => 1,
      },
      {
        name: "invalid native bound",
        write: async (_request, write) => write(0),
      },
      {
        name: "duplicate native call",
        write: async (_request, write) => {
          await write(1);
          return write(1);
        },
      },
    ];

    for (const testCase of cases) {
      const consumer = await consumerFixture(`write-${testCase.name}`);
      const postflight = await mintPostflight(consumer);
      const stage = await stageFixture();
      const plan = await createPlan(stage, postflight.binding);
      const failure = await captureFailure(
        finalize(stage, postflight.receipt, plan, {
          dependencies: { writeForTests: testCase.write },
        }),
      );
      expect(failure, testCase.name).toBeInstanceOf(
        FloodgateV7TrainingLabelFinalizerError,
      );
      expect(failure, testCase.name).toMatchObject({
        phase: "train-persistence",
        mayHavePublished: false,
        leaseMayRemain: false,
        retryDisposition: "fresh-authority-may-resume-exact-prefix",
      });
      await expectMissing(
        path.join(stage.stageRoot, FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME),
      );
      await expectMissing(stage.destinationRoot);
      await expectMissing(stage.leaseRoot);
    }
  });

  it("contains every failpoint with typed cleanup and zeroized keys", async () => {
    const events: readonly FloodgateV7TrainingLabelFinalizerEvent[] = [
      "train-created",
      "train-written",
      "train-datasynced",
      "train-directory-synced",
      "result-created",
      "result-written",
      "result-datasynced",
      "result-directory-synced",
      "manifest-created",
      "manifest-written",
      "manifest-datasynced",
      "manifest-directory-synced",
      "source-reopened",
      "source-reverified",
      "before-publication",
      "before-destination-reopen",
      "before-destination-reverify",
      "destination-reverified",
    ];

    for (const target of events) {
      const consumer = await consumerFixture(`failpoint-${target}`);
      const postflight = await mintPostflight(consumer);
      const stage = await stageFixture();
      const plan = await createPlan(stage, postflight.binding);
      const callerKey = rootKey();
      const callerKeyBefore = Buffer.from(callerKey);
      const keys = observedKeys();
      const failure = await captureFailure(
        finalize(stage, postflight.receipt, plan, {
          key: callerKey,
          dependencies: {
            observeKeyForTests: keys.observe,
            failpointForTests: (event) => {
              if (event === target) {
                throw new Error(`synthetic ${target} failure`);
              }
            },
          },
        }),
      );

      expect(failure, target).toBeInstanceOf(
        FloodgateV7TrainingLabelFinalizerError,
      );
      for (const reference of keys.references.values()) {
        expectZeroized(reference);
      }
      expect(Buffer.from(callerKey), target).toEqual(callerKeyBefore);
      await expectMissing(stage.leaseRoot);
      const postpublication =
        target === "before-destination-reopen" ||
        target === "before-destination-reverify" ||
        target === "destination-reverified";
      expect(failure, target).toMatchObject({
        leaseMayRemain: false,
        retryDisposition: postpublication
          ? "manual-publication-reconciliation-required"
          : "fresh-authority-may-resume-exact-prefix",
      });
      if (postpublication) {
        await expectMissing(stage.stageRoot);
        expect(
          (failure as FloodgateV7TrainingLabelFinalizerError).mayHavePublished,
        ).toBe(true);
      } else {
        await expectMissing(stage.destinationRoot);
        expect(
          (failure as FloodgateV7TrainingLabelFinalizerError).mayHavePublished,
        ).toBe(false);
      }
    }
  }, 30_000);

  it("zeroizes already-created keys when the test key observer itself fails", async () => {
    const consumer = await consumerFixture("key-observer-failure");
    const postflight = await mintPostflight(consumer);
    const stage = await stageFixture();
    const plan = await createPlan(stage, postflight.binding);
    const lease = await authorize(stage);
    const callerKey = rootKey();
    const callerKeyBefore = Buffer.from(callerKey);
    const references: Uint8Array[] = [];

    const failure = await captureFailure(
      finalize(stage, postflight.receipt, plan, {
        lease,
        key: callerKey,
        dependencies: {
          observeKeyForTests: (kind, key) => {
            references.push(key);
            if (kind === "result") {
              throw new Error("synthetic key observer failure");
            }
            return undefined;
          },
        },
      }),
    );

    expect(failure).toBeInstanceOf(FloodgateV7TrainingLabelFinalizerError);
    expect(failure).toMatchObject({
      phase: "cross-binding",
      mayHavePersisted: false,
      mayHavePublished: false,
      leaseMayRemain: true,
      retryDisposition: "caller-must-reconcile-existing-lease-authority",
    });
    expect(references).toHaveLength(2);
    for (const reference of references) expectZeroized(reference);
    expect(Buffer.from(callerKey)).toEqual(callerKeyBefore);
    expect(
      claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(
        postflight.receipt,
      ),
    ).toBeUndefined();
    expect((await fs.promises.lstat(stage.leaseRoot)).isDirectory()).toBe(true);
    await lease.close();
    await expectMissing(stage.leaseRoot);
  });
});
