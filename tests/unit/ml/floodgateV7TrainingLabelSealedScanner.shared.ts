import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { expect, vi } from "vitest";

import {
  EXACT24K_SCANNER_CASE_IDS,
  createExact24kScannerRuntimeReceiptRecorder,
} from "../../../scripts/exact24k-scanner-runtime-receipt.mjs";
import {
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_CONTRACT,
  FLOODGATE_EXCLUSIVE_DIRECTORY_RENAME_TRUST_BOUNDARY,
  type FloodgateExclusiveDirectoryRenameReceipt,
} from "../../../ml/floodgate-exclusive-directory-rename";
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
import { floodgateCanonicalUrlGameId } from "../../../ml/floodgate-raw-lock";
import { floodgateIdentifierDigest } from "../../../ml/floodgate-roles";
import {
  FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
  authorizeFloodgateTeacherStageCoreForTests,
  type FloodgateTeacherStageAuthorizationOptions,
  type FloodgateTeacherStageAuthorizationDependencies,
  type FloodgateTeacherStageLease,
  type FloodgateTeacherStagePublicationDependencies,
} from "../../../ml/floodgate-teacher-stage-authorization";
import {
  FLOODGATE_TRAINING_RAW_FILENAME,
  withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests,
  withVerifiedPinnedFloodgateTrainingRowsCoreForTests,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingParent,
  type FloodgateTrainingRowConsumerDependencies,
  type FloodgateTrainingRowConsumerOptions,
} from "../../../ml/floodgate-training-row-consumer";
import {
  FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES,
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_SCHEMA,
  FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_SCHEMA,
  FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
  FLOODGATE_V7_TRAINING_LABEL_TEST_PRODUCTION_FINALIZATION_STATUS,
  createFloodgateV7TrainingLabelProductionPlanCoreForTests,
  discardFloodgateV7TrainingLabelProductionPlanCoreForTests,
  finalizeAndPublishFloodgateV7TrainingLabelsProductionCoreForTests,
  type FloodgateV7TrainingLabelProductionPlanForTests,
} from "../../../ml/floodgate-v7-training-label-finalizer-core";
import {
  FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
  FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
} from "../../../ml/floodgate-stable-wasm-proposer";
import {
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
} from "../../../ml/floodgate-production-stable-wasm-runtime";
import {
  FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
  buildFloodgateV7CandidateUnionCoreForTests,
} from "../../../ml/floodgate-v7-candidate-union";
import { buildFloodgateV7ScanLoadSourceUrlCoreForTests } from "../../../ml/floodgate-v7-checkpoint-scan-load";
import type { FloodgateV7CompletedParentInput } from "../../../ml/floodgate-v7-completed-parent";
import * as deploymentKeyAuthority from "../../../ml/floodgate-v7-deployment-key-authority";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
  FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
  FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
  FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
  FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
  createFloodgateV7TrainingLabelSealedScannerCoreForTests,
  discardFloodgateV7TrainingLabelSealedScannerCoreForTests,
  getFloodgateV7TrainingLabelSealedScannerPublicationContextCoreForTests,
  replayFloodgateV7TrainingLabelSealedScanner,
  replayFloodgateV7TrainingLabelSealedScannerCoreForTests,
  terminallyReverifyFloodgateV7TrainingLabelSealedScannerCoreForTests,
  checkpointFloodgateV7TeacherParentsV3CoreForTests,
  type FloodgateV7TeacherCheckpointDependencies,
  type FloodgateV7TeacherCheckpointRunBinding,
  type FloodgateV7TeacherCheckpointV3Gate,
  type FloodgateV7TeacherMissingParentProducer,
  type FloodgateV7TeacherProducerController,
  type FloodgateV7TrainingLabelSealedScanner,
  type FloodgateV7TrainingLabelSealedScannerDependenciesForTests,
  type FloodgateV7TrainingLabelSealedScannerOpenResult,
  type FloodgateV7TeacherCheckpointV3VerifiedParentSink,
} from "../../../ml/floodgate-v7-teacher-checkpoint";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "../../../ml/shogi-sfen";
import { compareBytewise, positionKeyFromSfen } from "../../../ml/sibling-data";

const PRODUCER_REVISION = "a".repeat(40);
const VERIFIER_REVISION = "b".repeat(40);
const RUN_ID = "12".repeat(32);
const ROOT_KEY_BYTE = 0x4b;
const FORCED_MOVE = "5a4a";

export type Exact24kScannerShardId =
  "authority" | "mutation" | "replay" | "cleanup" | "production";

const temporaryRootsByShard = new Map<Exact24kScannerShardId, string[]>();

function trackTemporaryRoot(
  shardId: Exact24kScannerShardId,
  root: string,
): void {
  if (!Object.hasOwn(EXACT24K_SCANNER_CASE_IDS, shardId)) {
    throw new Error(`unknown exact-24k scanner shard ${String(shardId)}`);
  }
  const roots = temporaryRootsByShard.get(shardId);
  if (roots === undefined) {
    temporaryRootsByShard.set(shardId, [root]);
  } else {
    roots.push(root);
  }
}

interface TrainingFixture {
  readonly outputRoot: string;
  readonly trainingPath: string;
  readonly identity: Readonly<FloodgateRoleBundleRawIdentity>;
  readonly options: FloodgateTrainingRowConsumerOptions;
}

interface ScannerFixture {
  readonly root: string;
  readonly publicationParent: string;
  readonly stageRoot: string;
  readonly destinationRoot: string;
  readonly authorization: FloodgateTeacherStageAuthorizationOptions;
  readonly training: TrainingFixture;
}

interface DeploymentKeyFixture {
  readonly home: string;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("fixture is not JSON");
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareBytewise)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("sealed scanner test requires a POSIX effective uid");
  }
  return process.geteuid();
}

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function write0600(filePath: string, contents: string): Promise<void> {
  await mkdir0700(path.dirname(filePath));
  await fs.promises.writeFile(filePath, contents, { mode: 0o600 });
  await fs.promises.chmod(filePath, 0o600);
}

function parentId(gameId: string, ply: number): string {
  return `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function handPiece(count: number, piece: string): string {
  if (count === 0) return "";
  return `${count === 1 ? "" : String(count)}${piece}`;
}

function fixedForcedRows(): readonly FloodgateRoleBundleRawParent[] {
  const rows: FloodgateRoleBundleRawParent[] = [];
  outer: for (let rook = 0; rook <= 1; rook += 1) {
    for (let bishop = 0; bishop <= 1; bishop += 1) {
      for (let gold = 0; gold <= 2; gold += 1) {
        for (let silver = 0; silver <= 4; silver += 1) {
          for (let knight = 0; knight <= 4; knight += 1) {
            for (let lance = 0; lance <= 4; lance += 1) {
              for (let pawn = 0; pawn <= 18; pawn += 1) {
                const index = rows.length;
                const source =
                  buildFloodgateV7ScanLoadSourceUrlCoreForTests(index);
                const gameId = floodgateCanonicalUrlGameId(source);
                const hand =
                  handPiece(rook, "R") +
                  handPiece(bishop, "B") +
                  handPiece(gold, "G") +
                  handPiece(silver, "S") +
                  handPiece(knight, "N") +
                  handPiece(lance, "L") +
                  handPiece(pawn, "P");
                const parentSfen = `4k4/2B6/3GRG3/9/9/9/9/9/K8 w ${hand || "-"} 1`;
                rows.push({
                  schema_version: 1,
                  source: "floodgate",
                  source_url: source,
                  game_sha256: sha256(`sealed scanner game ${index}`),
                  game_id: gameId,
                  parent_id: parentId(gameId, 0),
                  position_id: positionKeyFromSfen(parentSfen),
                  parent_sfen: parentSfen,
                  ply: 0,
                  played_move: FORCED_MOVE,
                });
                if (
                  rows.length ===
                  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS
                ) {
                  break outer;
                }
              }
            }
          }
        }
      }
    }
  }
  if (rows.length !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS) {
    throw new Error("forced scanner corpus did not reach 24000 parents");
  }
  rows.sort((left, right) => compareBytewise(left.parent_id, right.parent_id));
  return Object.freeze(rows);
}

function rawIdentity(
  rows: readonly FloodgateRoleBundleRawParent[],
  bytes: Uint8Array,
): FloodgateRoleBundleRawIdentity {
  const games = new Set(rows.map((row) => row.game_id));
  const parents = new Set(rows.map((row) => row.parent_id));
  const positions = new Set(rows.map((row) => row.position_id));
  return {
    path: FLOODGATE_TRAINING_RAW_FILENAME,
    format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    records: rows.length,
    games: games.size,
    game_ids_sha256: floodgateIdentifierDigest(games),
    parent_ids_sha256: floodgateIdentifierDigest(parents),
    position_ids_count: positions.size,
    position_ids_sha256: floodgateIdentifierDigest(positions),
  };
}

async function makeTrainingFixture(
  root: string,
  rows: readonly FloodgateRoleBundleRawParent[],
): Promise<TrainingFixture> {
  const outputRoot = path.join(root, "role-bundle");
  await mkdir0700(outputRoot);
  const bytes = Buffer.from(
    `${rows.map((row) => canonicalJson(row)).join("\n")}\n`,
  );
  const trainingPath = path.join(outputRoot, FLOODGATE_TRAINING_RAW_FILENAME);
  await fs.promises.writeFile(trainingPath, bytes, {
    flag: "wx",
    mode: 0o600,
  });
  await fs.promises.chmod(trainingPath, 0o600);
  const identity = rawIdentity(rows, bytes);
  return {
    outputRoot,
    trainingPath,
    identity,
    options: {
      repositoryRoot: path.join(root, "repository"),
      verifierRevision: VERIFIER_REVISION,
      rawLockRoot: path.join(root, "raw-lock"),
      roleLockRoot: path.join(root, "role-lock"),
      legacyProtectedPositionIdsPath: path.join(
        root,
        "legacy-protected-position-ids.txt",
      ),
      outputRoot,
    },
  };
}

async function fixture(
  shardId: Exact24kScannerShardId,
): Promise<ScannerFixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-v7-sealed-scanner-test-"),
  );
  const root = await fs.promises.realpath(created);
  trackTemporaryRoot(shardId, root);
  await fs.promises.chmod(root, 0o700);
  const training = await makeTrainingFixture(root, fixedForcedRows());
  const publicationParent = path.join(root, "publication");
  const stageRoot = path.join(publicationParent, "teacher-stage");
  const destinationRoot = path.join(publicationParent, "teacher-final");
  const engineBin = path.join(root, "engine", "engine");
  const engineReceipt = path.join(root, "engine", "receipt.json");
  const engineArgument = path.join(root, "engine", "argument.bin");
  const evalDir = path.join(root, "eval");
  await Promise.all([
    mkdir0700(training.options.repositoryRoot),
    mkdir0700(training.options.rawLockRoot),
    mkdir0700(training.options.roleLockRoot),
    mkdir0700(publicationParent),
    mkdir0700(evalDir),
  ]);
  await Promise.all([
    write0600(training.options.legacyProtectedPositionIdsPath, "synthetic\n"),
    write0600(engineBin, "synthetic engine\n"),
    write0600(engineReceipt, '{"synthetic":true}\n'),
    write0600(engineArgument, "synthetic argument\n"),
    write0600(path.join(evalDir, "nn.bin"), "synthetic eval\n"),
  ]);
  return {
    root,
    publicationParent,
    stageRoot,
    destinationRoot,
    training,
    authorization: {
      repositoryRoot: training.options.repositoryRoot,
      rawLockRoot: training.options.rawLockRoot,
      roleLockRoot: training.options.roleLockRoot,
      roleBundleRoot: training.outputRoot,
      legacyProtectedPositionIdsPath:
        training.options.legacyProtectedPositionIdsPath,
      publicationParent,
      stageBasename: "teacher-stage",
      destinationBasename: "teacher-final",
      engineBin,
      engineReceipt,
      engineArgs: [engineArgument],
      evalDir,
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

function trainingDependencies(
  identity: Readonly<FloodgateRoleBundleRawIdentity>,
): FloodgateTrainingRowConsumerDependencies {
  const bundle = verifiedBundle(identity);
  return {
    verifyBundle: vi.fn(async () => bundle),
    expectedManifestIdentity: bundle.result.manifest.identity,
  };
}

async function authorize(
  value: ScannerFixture,
  overrides: Partial<FloodgateTeacherStageAuthorizationDependencies> = {},
): Promise<Readonly<FloodgateTeacherStageLease>> {
  return authorizeFloodgateTeacherStageCoreForTests(value.authorization, {
    effectiveUserId: effectiveUserId(),
    inspectorPythonExecutable: FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
    ...overrides,
  });
}

function runBinding(): FloodgateV7TeacherCheckpointRunBinding {
  return {
    schema: FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
    plan: {
      bytes: FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
      sha256: FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
    },
    producer_control: {
      schema: FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
      parent_deadline_ms: 1_800_000,
      abort_drain_ms: 30_000,
      max_in_flight: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
      cancel_policy: FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
      late_settlement_policy:
        FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
    },
    stable_runtime_receipt_sha256: "c".repeat(64),
    teacher_usi_runtime_receipt_sha256: "d".repeat(64),
  };
}

function parentPayloadSha256(
  parent: Readonly<FloodgateTrainingParent>,
): string {
  return sha256(`shogi-floodgate-stable-parent-v1\0${canonicalJson(parent)}`);
}

function completedForcedParent(
  parent: Readonly<FloodgateTrainingParent>,
): Readonly<FloodgateV7CompletedParentInput> {
  const legal = rulesCompleteLegalMoves(
    positionFromSfen(parent.parent_sfen).position,
  ).map((entry) => entry.usi);
  if (legal.length !== 1 || legal[0] !== FORCED_MOVE) {
    throw new Error("scanner fixture parent is not exact forced move");
  }
  const childSfen = childSfenAfterUsi(parent.parent_sfen, FORCED_MOVE);
  const stable = {
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_payload_sha256: parentPayloadSha256(parent),
    stable_move: FORCED_MOVE,
    child_sfen: childSfen,
    child_position_id: positionKeyFromSfen(childSfen),
    search: {
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      completed_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      termination: "requested-depth-complete" as const,
      raw_search_score: 17,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      nodes: 100,
      leaves: 50,
      root_tesu: parent.ply,
    },
  } as const;
  const union = buildFloodgateV7CandidateUnionCoreForTests({
    parent,
    legal: {
      source: FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
      parent_sfen: parent.parent_sfen,
      count: 1,
      moves: legal,
    },
    stable,
    runtime: null,
  });
  return {
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
        reusable_pool_receipt_sha256: "e".repeat(64),
        parent_payload_sha256: stable.parent_payload_sha256,
        row_sha256: sha256(
          `shogi-floodgate-production-stable-runtime-row-v1\0${canonicalJson(stable)}`,
        ),
        origin: "direct-owning-runtime-capability-call-v1",
        plain_result_authentication_claim: false,
      },
    },
    rescores: [],
  };
}

function controller(
  producer: FloodgateV7TeacherMissingParentProducer,
): FloodgateV7TeacherProducerController {
  return {
    produce: producer,
    abortAndDrain: async () => undefined,
  };
}

function rootKey(): Uint8Array {
  return new Uint8Array(32).fill(ROOT_KEY_BYTE);
}

async function runGate(
  value: ScannerFixture,
  gate: FloodgateV7TeacherCheckpointV3Gate,
  closeForTests?: FloodgateV7TeacherCheckpointDependencies["closeForTests"],
  beforeFirstProduce?: () => void,
): Promise<void> {
  const lease = await authorize(value);
  let firstProduce = true;
  await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
    value.training.options,
    async (input: Readonly<AuthenticatedFloodgateTrainingRows>) => {
      await checkpointFloodgateV7TeacherParentsV3CoreForTests(
        lease,
        input,
        runBinding(),
        controller(async ({ parent }) => {
          if (firstProduce) {
            firstProduce = false;
            beforeFirstProduce?.();
          }
          return completedForcedParent(parent);
        }),
        {
          gate,
          runId: RUN_ID,
          keyId: deploymentKeyAuthority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
        },
        {
          rootKey: rootKey(),
          effectiveUserId: effectiveUserId(),
          closeForTests,
        },
      );
    },
    trainingDependencies(value.training.identity),
  );
}

interface FileHandleSyncPrototype {
  sync(this: fs.promises.FileHandle): Promise<void>;
}

async function finalGateSyncSuppression(
  probePath: string,
  workPath: string,
  stageRoot: string,
): Promise<
  Readonly<{
    install: () => void;
    restore: () => void;
    closeForTests: NonNullable<
      FloodgateV7TeacherCheckpointDependencies["closeForTests"]
    >;
  }>
> {
  const probe = await fs.promises.open(probePath, fs.constants.O_RDONLY);
  let prototype: FileHandleSyncPrototype;
  try {
    prototype = Object.getPrototypeOf(probe) as FileHandleSyncPrototype;
  } finally {
    await probe.close();
  }
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "sync");
  if (
    descriptor === undefined ||
    typeof descriptor.value !== "function" ||
    descriptor.configurable !== true
  ) {
    throw new Error("FileHandle.sync cannot be isolated");
  }
  const nativeSync = descriptor.value as FileHandleSyncPrototype["sync"];
  let installed = false;
  let restored = false;
  const restore = (): void => {
    if (!installed || restored) return;
    Object.defineProperty(prototype, "sync", descriptor);
    restored = true;
  };
  const batchSync = async (filePath: string, directory: boolean) => {
    const handle = await fs.promises.open(
      filePath,
      fs.constants.O_RDONLY |
        fs.constants.O_NOFOLLOW |
        (directory ? fs.constants.O_DIRECTORY : 0),
    );
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  };
  return Object.freeze({
    install: () => {
      if (installed) return;
      installed = true;
      Object.defineProperty(prototype, "sync", {
        ...descriptor,
        value: async function (this: fs.promises.FileHandle): Promise<void> {
          const stat = await this.stat({ bigint: true });
          if (
            (Number(stat.mode) & fs.constants.S_IFMT) ===
            fs.constants.S_IFREG
          ) {
            return;
          }
          await Reflect.apply(nativeSync, this, []);
        },
      });
    },
    restore,
    closeForTests: async (kind, close) => {
      if (kind === "work" && installed && !restored) {
        restore();
        await batchSync(workPath, false);
        await batchSync(stageRoot, true);
      }
      await close();
    },
  });
}

async function sealWork(value: ScannerFixture): Promise<void> {
  await runGate(
    value,
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
  );
  await runGate(
    value,
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
  );
  const workPath = path.join(
    value.stageRoot,
    FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  );
  const suppression = await finalGateSyncSuppression(
    value.training.trainingPath,
    workPath,
    value.stageRoot,
  );
  try {
    await runGate(
      value,
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
      suppression.closeForTests,
      suppression.install,
    );
  } finally {
    suppression.restore();
  }
}

async function deploymentKeyFixture(
  shardId: Exact24kScannerShardId,
): Promise<DeploymentKeyFixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-v7-sealed-scan-key-test-"),
  );
  const home = await fs.promises.realpath(created);
  trackTemporaryRoot(shardId, home);
  await fs.promises.chmod(home, 0o700);
  const keyPath = path.join(
    home,
    ...deploymentKeyAuthority.FLOODGATE_V7_DEPLOYMENT_KEY_ROOT_RELATIVE_COMPONENTS,
    deploymentKeyAuthority.FLOODGATE_V7_DEPLOYMENT_KEY_FILENAME,
  );
  await mkdir0700(path.dirname(keyPath));
  await fs.promises.writeFile(keyPath, rootKey(), {
    flag: "wx",
    mode: 0o600,
  });
  await fs.promises.chmod(keyPath, 0o600);
  return Object.freeze({ home });
}

async function workBinding(
  value: ScannerFixture,
): Promise<Readonly<{ bytes: number; sha256: string }>> {
  const workPath = path.join(
    value.stageRoot,
    FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  );
  const bytes = await fs.promises.readFile(workPath);
  return Object.freeze({ bytes: bytes.byteLength, sha256: sha256(bytes) });
}

function keyAuthorityDependencies(
  deployment: DeploymentKeyFixture,
): deploymentKeyAuthority.FloodgateV7DeploymentKeyAuthorityDependencies {
  return {
    effectiveUserId: effectiveUserId(),
    homeDirectory: deployment.home,
  };
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
  value: ScannerFixture,
): Promise<Readonly<FloodgateTeacherStagePublicationDependencies>> {
  const [parent, stage] = await Promise.all([
    fs.promises.lstat(value.publicationParent, { bigint: true }),
    fs.promises.lstat(value.stageRoot, { bigint: true }),
  ]);
  return Object.freeze({
    exclusiveRename: async (source: string, destination: string) => {
      await fs.promises.rename(source, destination);
      return renameReceipt(parent, stage);
    },
  });
}

async function openScanner(
  value: ScannerFixture,
  deployment: DeploymentKeyFixture,
  work: Readonly<{ bytes: number; sha256: string }>,
  publication: Readonly<FloodgateTeacherStagePublicationDependencies>,
  sink: FloodgateV7TeacherCheckpointV3VerifiedParentSink,
  dependencies: FloodgateV7TrainingLabelSealedScannerDependenciesForTests,
  keyDependencies: deploymentKeyAuthority.FloodgateV7DeploymentKeyAuthorityDependencies = keyAuthorityDependencies(
    deployment,
  ),
  providedLease?: Readonly<FloodgateTeacherStageLease>,
): Promise<Readonly<FloodgateV7TrainingLabelSealedScannerOpenResult>> {
  const lease = providedLease ?? (await authorize(value));
  let opened:
    Readonly<FloodgateV7TrainingLabelSealedScannerOpenResult> | undefined;
  await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
    value.training.options,
    async (input: Readonly<AuthenticatedFloodgateTrainingRows>) => {
      opened = await createFloodgateV7TrainingLabelSealedScannerCoreForTests(
        lease,
        input,
        runBinding(),
        {
          runId: RUN_ID,
          keyId: deploymentKeyAuthority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
          work,
        },
        sink,
        dependencies,
        keyDependencies,
        publication,
      );
    },
    trainingDependencies(value.training.identity),
  );
  if (opened === undefined) {
    throw new Error("sealed scanner produced no opaque result");
  }
  return opened;
}

async function createOutputEntry(
  root: string,
  filename: "train.jsonl" | "result.json" | "manifest.json",
): Promise<void> {
  const handle = await fs.promises.open(
    path.join(root, filename),
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      fs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.chmod(0o600);
    await handle.datasync();
  } finally {
    await handle.close();
  }
  const directory = await fs.promises.open(
    root,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function prepareExact24kScannerShard(
  shardId: Exact24kScannerShardId,
): Promise<
  Readonly<{
    value: ScannerFixture;
    deployment: DeploymentKeyFixture;
    work: Readonly<{ bytes: number; sha256: string }>;
    publication: Readonly<FloodgateTeacherStagePublicationDependencies>;
  }>
> {
  const value = await fixture(shardId);
  const deployment = await deploymentKeyFixture(shardId);
  expect(value.training.identity.records).toBe(
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  );
  expect(FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS).toBe(24_000);
  await sealWork(value);
  const [work, publication] = await Promise.all([
    workBinding(value),
    publicationDependencies(value),
  ]);
  return Object.freeze({ value, deployment, work, publication });
}

export async function cleanupExact24kScannerFixtures(
  shardId: Exact24kScannerShardId,
): Promise<void> {
  if (!Object.hasOwn(EXACT24K_SCANNER_CASE_IDS, shardId)) {
    throw new Error(`unknown exact-24k scanner shard ${String(shardId)}`);
  }
  const roots = temporaryRootsByShard.get(shardId) ?? [];
  temporaryRootsByShard.delete(shardId);
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  }
}

export async function createTrackedExact24kScannerTemporaryRootForTests(
  shardId: Exact24kScannerShardId,
): Promise<string> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), `floodgate-v7-scanner-${shardId}-isolation-test-`),
  );
  const root = await fs.promises.realpath(created);
  trackTemporaryRoot(shardId, root);
  return root;
}

export async function runExact24kScannerAuthorityShard() {
  const cases = createExact24kScannerRuntimeReceiptRecorder("authority");
  const { value, deployment, work, publication } =
    await prepareExact24kScannerShard("authority");

  // A lease-independent capture failure prepares no key, claims no bogus
  // rows, and leaves the exact active lease untouched for later use.
  const invalidLease = await authorize(value);
  await expect(
    createFloodgateV7TrainingLabelSealedScannerCoreForTests(
      invalidLease,
      {} as AuthenticatedFloodgateTrainingRows,
      runBinding(),
      {
        runId: RUN_ID,
        keyId: deploymentKeyAuthority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
        work,
      },
      null as never,
      {},
      keyAuthorityDependencies(deployment),
      { exclusiveRename: async () => undefined },
    ),
  ).rejects.toThrow(/sink must be a non-Proxy function/);
  cases.pass("lease-capture-failure-preserves-active-lease");

  // A valid scanner in W state cannot consume terminal authority. The
  // failed terminal check aborts, zeroizes, and a later fresh open proves
  // that the exact stage lease was released. The retained caller alias is
  // inert immediately after the synchronous publication transfer.
  let prematureTerminalKey: Uint8Array | undefined;
  const transferredLease = invalidLease;
  let premature:
    Readonly<FloodgateV7TrainingLabelSealedScannerOpenResult> | undefined;
  await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
    value.training.options,
    async (input: Readonly<AuthenticatedFloodgateTrainingRows>) => {
      const clonedLeaseFailure =
        createFloodgateV7TrainingLabelSealedScannerCoreForTests(
          { ...transferredLease },
          input,
          runBinding(),
          {
            runId: RUN_ID,
            keyId: deploymentKeyAuthority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
            work,
          },
          async () => undefined,
          {},
          keyAuthorityDependencies(deployment),
          publication,
        );
      const opening = createFloodgateV7TrainingLabelSealedScannerCoreForTests(
        transferredLease,
        input,
        runBinding(),
        {
          runId: RUN_ID,
          keyId: deploymentKeyAuthority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
          work,
        },
        async () => undefined,
        {
          observeKeyForTests: (key) => {
            prematureTerminalKey = key;
            return undefined;
          },
        },
        keyAuthorityDependencies(deployment),
        publication,
      );
      await expect(clonedLeaseFailure).rejects.toThrow(
        /begin requires the exact active unclaimed lease/,
      );
      await expect(transferredLease.close()).rejects.toThrow();
      premature = await opening;
    },
    trainingDependencies(value.training.identity),
  );
  if (premature === undefined) {
    throw new Error("premature terminal scanner did not open");
  }
  await expect(
    terminallyReverifyFloodgateV7TrainingLabelSealedScannerCoreForTests(
      premature.scanner,
    ),
  ).rejects.toThrow(/requires exact WTRM stage state/);
  expect(prematureTerminalKey?.every((byte) => byte === 0)).toBe(true);
  await expect(
    discardFloodgateV7TrainingLabelSealedScannerCoreForTests(premature.scanner),
  ).resolves.toBeUndefined();
  cases.pass("premature-terminal-reverify-aborts-zeroizes-releases");

  // Internal key preparation happens only after a complete same-held-FD
  // unkeyed preflight. A rejected key authority aborts the transaction and
  // leaves no derived key or scanner facade behind.
  let unkeyedPreflightReads = 0;
  let escapedKeyPrepareScanner:
    Readonly<FloodgateV7TrainingLabelSealedScanner> | undefined;
  await expect(
    openScanner(
      value,
      deployment,
      work,
      publication,
      async () => undefined,
      {
        readForTests: async (request, read) => {
          if (request.purpose === "unkeyed-preflight") {
            unkeyedPreflightReads += 1;
          }
          return read();
        },
      },
      {
        effectiveUserId: effectiveUserId(),
        homeDirectory: path.join(deployment.home, "missing-home"),
      },
    ).then((opened) => {
      escapedKeyPrepareScanner = opened.scanner;
      return opened;
    }),
  ).rejects.toThrow(/home identity check failed/);
  expect(unkeyedPreflightReads).toBeGreaterThan(0);
  expect(escapedKeyPrepareScanner).toBeUndefined();
  cases.pass("key-authority-rejection-after-unkeyed-preflight");
  return cases.seal();
}

export async function runExact24kScannerMutationShard() {
  const cases = createExact24kScannerRuntimeReceiptRecorder("mutation");
  const { value, deployment, work, publication } =
    await prepareExact24kScannerShard("mutation");

  // Pass one never calls the sink. A pass-two sink failure after a few
  // parents mints no scanner, aborts the internal publication transaction,
  // zeroizes the owned key, and leaves the stage freshly authorizable.
  let failedPassTwoKey: Uint8Array | undefined;
  let escapedFailedScanner:
    Readonly<FloodgateV7TrainingLabelSealedScanner> | undefined;
  let failedPassTwoCalls = 0;
  await expect(
    openScanner(
      value,
      deployment,
      work,
      publication,
      async (event) => {
        expect(event.input_index).toBe(failedPassTwoCalls);
        failedPassTwoCalls += 1;
        if (event.input_index === 3) {
          throw new Error("forced pass-two sink failure");
        }
      },
      {
        observeKeyForTests: (key) => {
          failedPassTwoKey = key;
          return undefined;
        },
      },
    ).then((opened) => {
      escapedFailedScanner = opened.scanner;
      return opened;
    }),
  ).rejects.toThrow(/forced pass-two sink failure/);
  expect(failedPassTwoCalls).toBe(4);
  expect(escapedFailedScanner).toBeUndefined();
  expect(failedPassTwoKey).toBeDefined();
  expect(failedPassTwoKey?.every((byte) => byte === 0)).toBe(true);
  expect(
    (await fs.promises.readdir(value.stageRoot)).sort(compareBytewise),
  ).toEqual([FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME]);
  cases.pass("pass-two-sink-failure-aborts-zeroizes");

  // Replacing only the named path while pass two is backpressured cannot
  // redirect the held descriptor and is rejected at the enclosing path
  // confirmation. The replacement is restored only after abort completes.
  const workPath = path.join(
    value.stageRoot,
    FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  );
  const heldWorkBackup = path.join(value.root, "held-original-work.jsonl");
  let replacementPerformed = false;
  let replacementKey: Uint8Array | undefined;
  let replacementSinkCalls = 0;
  try {
    await expect(
      openScanner(
        value,
        deployment,
        work,
        publication,
        async (event) => {
          expect(event.input_index).toBe(replacementSinkCalls);
          replacementSinkCalls += 1;
          if (!replacementPerformed) {
            await fs.promises.rename(workPath, heldWorkBackup);
            await fs.promises.copyFile(heldWorkBackup, workPath);
            await fs.promises.chmod(workPath, 0o600);
            replacementPerformed = true;
          }
        },
        {
          observeKeyForTests: (key) => {
            replacementKey = key;
            return undefined;
          },
        },
      ),
    ).rejects.toThrow(/mutated during read|path snapshot changed/);
  } finally {
    if (replacementPerformed) {
      await fs.promises.rm(workPath, { force: true });
      await fs.promises.rename(heldWorkBackup, workPath);
    }
  }
  expect(replacementSinkCalls).toBe(
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  );
  expect(replacementKey?.every((byte) => byte === 0)).toBe(true);
  cases.pass("named-path-replacement-rejected-after-held-scan");

  // A pass-two stream can authenticate every parent provisionally and still
  // fail its enclosing seal. No scanner escapes and the owned key is erased.
  const originalWork = await fs.promises.readFile(workPath);
  const corruptedWork = Buffer.from(originalWork);
  const sealMarker = Buffer.from('"seal_mac":"');
  const sealMarkerOffset = corruptedWork.lastIndexOf(sealMarker);
  if (sealMarkerOffset < 0) throw new Error("fixture seal marker is absent");
  const sealHexOffset = sealMarkerOffset + sealMarker.byteLength;
  corruptedWork[sealHexOffset] =
    corruptedWork[sealHexOffset] === 0x30 ? 0x31 : 0x30;
  let keyedScanStarts = 0;
  let badSealWritten = false;
  let badSealKey: Uint8Array | undefined;
  let badSealSinkCalls = 0;
  try {
    await expect(
      openScanner(
        value,
        deployment,
        work,
        publication,
        async (event) => {
          expect(event.input_index).toBe(badSealSinkCalls);
          badSealSinkCalls += 1;
        },
        {
          readForTests: async (request, read) => {
            if (request.purpose === "sealed-final" && request.position === 0) {
              keyedScanStarts += 1;
              if (keyedScanStarts === 2) {
                await fs.promises.writeFile(workPath, corruptedWork);
                badSealWritten = true;
              }
            }
            return read();
          },
          observeKeyForTests: (key) => {
            badSealKey = key;
            return undefined;
          },
        },
      ),
    ).rejects.toThrow(/work seal MAC is invalid/);
  } finally {
    if (badSealWritten) {
      await fs.promises.writeFile(workPath, originalWork);
    }
  }
  expect(badSealSinkCalls).toBe(
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  );
  expect(badSealKey?.every((byte) => byte === 0)).toBe(true);
  cases.pass("seal-mac-mutation-rejected-after-parent-stream");
  return cases.seal();
}

export async function runExact24kScannerReplayShard() {
  const cases = createExact24kScannerRuntimeReceiptRecorder("replay");
  const { value, deployment, work, publication } =
    await prepareExact24kScannerShard("replay");

  let passTwoCalls = 0;
  let activeSinks = 0;
  let maximumActiveSinks = 0;
  let observedKey: Uint8Array | undefined;
  const opened = await openScanner(
    value,
    deployment,
    work,
    publication,
    async (event) => {
      activeSinks += 1;
      maximumActiveSinks = Math.max(maximumActiveSinks, activeSinks);
      expect(event.input_index).toBe(passTwoCalls);
      passTwoCalls += 1;
      await Promise.resolve();
      activeSinks -= 1;
    },
    {
      observeKeyForTests: (key) => {
        observedKey = key;
        return undefined;
      },
    },
  );
  const { scanner, receipt: openReceipt } = opened;
  expect(passTwoCalls).toBe(FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS);
  expect(maximumActiveSinks).toBe(1);
  expect(openReceipt.work).toMatchObject(work);
  expect(openReceipt.teacher_run_binding_sha256).toBe(
    sha256(canonicalJson(runBinding())),
  );
  expect(openReceipt.training.binding_sha256).toBe(
    sha256(canonicalJson(openReceipt.training.binding)),
  );
  expect(openReceipt.verification).toMatchObject({
    unkeyed_preflight_full_file: true,
    unkeyed_preflight_matches_expected_work: true,
    key_prepared_from_same_held_preflight: true,
    first_pass_without_sink: true,
    second_pass_sink_awaited_with_backpressure: true,
    same_held_work_descriptor: true,
    same_full_work_snapshot: true,
    exact_sealed_records: 24_004,
    exact_completed_parents: 24_000,
  });
  expect(Object.keys(scanner).sort(compareBytewise)).toEqual(
    ["claim_boundary", "contract", "execution_boundary", "status"].sort(
      compareBytewise,
    ),
  );
  expect(observedKey).toBeDefined();
  expect(observedKey?.some((byte) => byte !== 0)).toBe(true);
  cases.pass("exact-two-pass-receipt-and-facade");

  await expect(
    replayFloodgateV7TrainingLabelSealedScanner(scanner, async () => {}),
  ).rejects.toThrow(/other execution boundary/);
  cases.pass("production-replay-entrypoint-rejects-test-facade");
  await expect(
    replayFloodgateV7TrainingLabelSealedScannerCoreForTests(
      { ...scanner },
      async () => {},
    ),
  ).rejects.toThrow(/cloned or foreign/);
  cases.pass("cloned-facade-rejected");

  const decoratedPromise = Promise.resolve();
  Object.defineProperty(decoratedPromise, "scanner_test_marker", {
    value: true,
  });
  await expect(
    replayFloodgateV7TrainingLabelSealedScannerCoreForTests(
      scanner,
      () => decoratedPromise,
    ),
  ).rejects.toThrow(/must return an exact native Promise/);
  expect(observedKey?.some((byte) => byte !== 0)).toBe(true);
  cases.pass("decorated-promise-rejected");

  const context =
    getFloodgateV7TrainingLabelSealedScannerPublicationContextCoreForTests(
      scanner,
    );
  expect(context.stageRoot).toBe(value.stageRoot);
  await createOutputEntry(context.stageRoot, "train.jsonl");

  let releaseFirstSink!: () => void;
  let markFirstSinkEntered!: () => void;
  const firstSinkEntered = new Promise<void>((resolve) => {
    markFirstSinkEntered = resolve;
  });
  const holdFirstSink = new Promise<void>((resolve) => {
    releaseFirstSink = resolve;
  });
  let concurrentReplayCalls = 0;
  const activeReplay = replayFloodgateV7TrainingLabelSealedScannerCoreForTests(
    scanner,
    async (event) => {
      expect(event.input_index).toBe(concurrentReplayCalls);
      concurrentReplayCalls += 1;
      if (event.input_index === 0) {
        markFirstSinkEntered();
        await holdFirstSink;
      }
    },
  );
  await firstSinkEntered;
  try {
    await expect(
      replayFloodgateV7TrainingLabelSealedScannerCoreForTests(
        scanner,
        async () => undefined,
      ),
    ).rejects.toThrow(/replay is already active/);
    await expect(
      terminallyReverifyFloodgateV7TrainingLabelSealedScannerCoreForTests(
        scanner,
      ),
    ).rejects.toThrow(/terminal reverify is already active/);
  } finally {
    releaseFirstSink();
  }
  await activeReplay;
  expect(concurrentReplayCalls).toBe(
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  );
  cases.pass("replay-single-flight-and-terminal-exclusion");

  for (const filename of ["result.json", "manifest.json"] as const) {
    await createOutputEntry(context.stageRoot, filename);
    let replayCalls = 0;
    await replayFloodgateV7TrainingLabelSealedScannerCoreForTests(
      scanner,
      async (event) => {
        expect(event.input_index).toBe(replayCalls);
        replayCalls += 1;
      },
    );
    expect(replayCalls).toBe(FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS);
  }

  await expect(
    discardFloodgateV7TrainingLabelSealedScannerCoreForTests(scanner),
  ).resolves.toBeUndefined();
  expect(observedKey?.every((byte) => byte === 0)).toBe(true);
  cases.pass("w-wt-wtr-wtrm-exact-replay");
  return cases.seal();
}

export async function runExact24kScannerCleanupShard() {
  const cases = createExact24kScannerRuntimeReceiptRecorder("cleanup");
  const { value, deployment, work, publication } =
    await prepareExact24kScannerShard("cleanup");

  let cleanupPassTwoCalls = 0;
  let observedKey: Uint8Array | undefined;
  let failFirstStageClose = true;
  const opened = await openScanner(
    value,
    deployment,
    work,
    publication,
    async (event) => {
      expect(event.input_index).toBe(cleanupPassTwoCalls);
      cleanupPassTwoCalls += 1;
    },
    {
      observeKeyForTests: (key) => {
        observedKey = key;
        return undefined;
      },
      closeForTests: async (kind, close) => {
        if (kind === "stage" && failFirstStageClose) {
          failFirstStageClose = false;
          throw new Error("forced first stage descriptor close failure");
        }
        await close();
      },
    },
  );
  const { scanner } = opened;
  expect(cleanupPassTwoCalls).toBe(
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  );
  const cleanupContext =
    getFloodgateV7TrainingLabelSealedScannerPublicationContextCoreForTests(
      scanner,
    );
  for (const filename of [
    "train.jsonl",
    "result.json",
    "manifest.json",
  ] as const) {
    await createOutputEntry(cleanupContext.stageRoot, filename);
  }

  // The key is zeroized before either descriptor close. If the first stage
  // close fails, cleanup retries only that still-open descriptor and aborts
  // publication; no terminal receipt escapes.
  await expect(
    terminallyReverifyFloodgateV7TrainingLabelSealedScannerCoreForTests(
      scanner,
    ),
  ).rejects.toThrow(/forced first stage descriptor close failure/);
  expect(failFirstStageClose).toBe(false);
  expect(observedKey?.every((byte) => byte === 0)).toBe(true);
  await expect(
    discardFloodgateV7TrainingLabelSealedScannerCoreForTests(scanner),
  ).resolves.toBeUndefined();
  cases.pass("terminal-close-failure-zeroizes-and-retries");

  // A fresh scanner reuses the exact bound WTRM stage. Work close reports a
  // failure after the real close, while publication abort succeeds and
  // releases the namespace. The facade retains that cleanup-indeterminate
  // rejection for discard, replay, and context instead of becoming a no-op.
  const indeterminatePublication = await publicationDependencies(value);
  let indeterminateKey: Uint8Array | undefined;
  const indeterminate = await openScanner(
    value,
    deployment,
    work,
    indeterminatePublication,
    async () => undefined,
    {
      observeKeyForTests: (key) => {
        indeterminateKey = key;
        return undefined;
      },
      closeForTests: async (kind, close) => {
        await close();
        if (kind === "work") {
          throw new Error("forced post-close scanner failure");
        }
      },
    },
  );
  let rememberedCleanupFailure: unknown;
  try {
    await discardFloodgateV7TrainingLabelSealedScannerCoreForTests(
      indeterminate.scanner,
    );
  } catch (error) {
    rememberedCleanupFailure = error;
  }
  expect(rememberedCleanupFailure).toBeInstanceOf(AggregateError);
  expect(indeterminateKey?.every((byte) => byte === 0)).toBe(true);
  await expect(
    discardFloodgateV7TrainingLabelSealedScannerCoreForTests(
      indeterminate.scanner,
    ),
  ).rejects.toBe(rememberedCleanupFailure);
  await expect(
    replayFloodgateV7TrainingLabelSealedScannerCoreForTests(
      indeterminate.scanner,
      async () => undefined,
    ),
  ).rejects.toBe(rememberedCleanupFailure);
  let rememberedContextFailure: unknown;
  try {
    getFloodgateV7TrainingLabelSealedScannerPublicationContextCoreForTests(
      indeterminate.scanner,
    );
  } catch (error) {
    rememberedContextFailure = error;
  }
  expect(rememberedContextFailure).toBe(rememberedCleanupFailure);
  cases.pass("post-close-cleanup-failure-is-sticky");

  // Plan-level cleanup combines a scanner post-close failure with a
  // publication abort failure and preserves the exact aggregate rejection.
  const planCleanupPublication = await publicationDependencies(value);
  let planAbortFailureArmed = false;
  const planCleanupLease = await authorize(value, {
    beforeLeaseRemovalForTests: async () => {
      if (planAbortFailureArmed) {
        throw new Error("forced plan publication abort failure");
      }
    },
  });
  let planScannerKey: Uint8Array | undefined;
  let cleanupPlan:
    Readonly<FloodgateV7TrainingLabelProductionPlanForTests> | undefined;
  await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
    value.training.options,
    async (input: Readonly<AuthenticatedFloodgateTrainingRows>) => {
      cleanupPlan =
        await createFloodgateV7TrainingLabelProductionPlanCoreForTests(
          planCleanupLease,
          input,
          runBinding(),
          {
            runId: RUN_ID,
            keyId: deploymentKeyAuthority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
            work,
          },
          keyAuthorityDependencies(deployment),
          {
            observeKeyForTests: (key) => {
              planScannerKey = key;
              return undefined;
            },
            closeForTests: async (kind, close) => {
              await close();
              if (kind === "work") {
                throw new Error("forced plan scanner post-close failure");
              }
            },
          },
          planCleanupPublication,
        );
    },
    trainingDependencies(value.training.identity),
  );
  if (cleanupPlan === undefined) {
    throw new Error("cleanup-indeterminate test plan did not open");
  }
  planAbortFailureArmed = true;
  let rememberedPlanCleanupFailure: unknown;
  try {
    await discardFloodgateV7TrainingLabelProductionPlanCoreForTests(
      cleanupPlan,
    );
  } catch (error) {
    rememberedPlanCleanupFailure = error;
  }
  expect(rememberedPlanCleanupFailure).toBeInstanceOf(AggregateError);
  expect(planScannerKey?.every((byte) => byte === 0)).toBe(true);
  await expect(
    discardFloodgateV7TrainingLabelProductionPlanCoreForTests(cleanupPlan),
  ).rejects.toBe(rememberedPlanCleanupFailure);
  cases.pass("plan-discard-aggregate-cleanup-failure-is-sticky");
  return cases.seal();
}

export async function runExact24kScannerProductionShard() {
  const cases = createExact24kScannerRuntimeReceiptRecorder("production");
  const { value, deployment, work, publication } =
    await prepareExact24kScannerShard("production");

  expect(
    (await fs.promises.readdir(value.stageRoot)).sort(compareBytewise),
  ).toEqual([FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME]);

  const preparedOutputKeys: Uint8Array[] = [];
  const finalizerOwnedKeys: Uint8Array[] = [];
  const e2eKeyDependencies = {
    ...keyAuthorityDependencies(deployment),
    observePreparedKeyForTests: (
      kind: "sealed-scan" | "training-label-result" | "training-label-manifest",
      key: Uint8Array,
    ) => {
      if (kind !== "sealed-scan") preparedOutputKeys.push(key);
    },
  };
  let e2eScannerKey: Uint8Array | undefined;
  let e2eScannerCloseCalls = 0;
  const e2eScannerDependencies: FloodgateV7TrainingLabelSealedScannerDependenciesForTests =
    {
      observeKeyForTests: (key) => {
        e2eScannerKey = key;
        return undefined;
      },
      closeForTests: async (_kind, close) => {
        expect(e2eScannerKey?.every((byte) => byte === 0)).toBe(true);
        e2eScannerCloseCalls += 1;
        await close();
      },
    };
  const productionLease = await authorize(value);
  await expect(
    createFloodgateV7TrainingLabelProductionPlanCoreForTests(
      productionLease,
      {} as AuthenticatedFloodgateTrainingRows,
      new Proxy(runBinding(), {}),
      {
        runId: RUN_ID,
        keyId: deploymentKeyAuthority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
        work,
      },
      e2eKeyDependencies,
      e2eScannerDependencies,
      publication,
    ),
  ).rejects.toThrow();
  cases.pass("production-plan-invalid-input-rejected");
  let productionPlan:
    Readonly<FloodgateV7TrainingLabelProductionPlanForTests> | undefined;
  const postflight =
    await withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(
      value.training.options,
      async (input: Readonly<AuthenticatedFloodgateTrainingRows>) => {
        productionPlan =
          await createFloodgateV7TrainingLabelProductionPlanCoreForTests(
            productionLease,
            input,
            runBinding(),
            {
              runId: RUN_ID,
              keyId: deploymentKeyAuthority.FLOODGATE_V7_DEPLOYMENT_KEY_ID,
              work,
            },
            e2eKeyDependencies,
            e2eScannerDependencies,
            publication,
          );
      },
      trainingDependencies(value.training.identity),
    );
  if (productionPlan === undefined) {
    throw new Error("test production composer did not mint a plan");
  }
  const receipt =
    await finalizeAndPublishFloodgateV7TrainingLabelsProductionCoreForTests(
      productionPlan,
      postflight,
      e2eKeyDependencies,
      {
        effectiveUserId: effectiveUserId(),
        observeKeyForTests: (kind, key) => {
          if (kind !== "root") finalizerOwnedKeys.push(key);
          return undefined;
        },
      },
    );
  expect(receipt.status).toBe(
    FLOODGATE_V7_TRAINING_LABEL_TEST_PRODUCTION_FINALIZATION_STATUS,
  );
  expect(receipt.execution_boundary).toBe(
    "test-only-injected-authenticated-sealed-scan-plan-finalizer-and-exclusive-private-directory-publication",
  );
  expect(receipt.content).toMatchObject({
    parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
    training_records: 0,
  });
  expect(receipt.publication.publication_durability).toBe(
    "published-and-lease-removal-durable",
  );
  expect(receipt.postpublication).toEqual({
    destination_reopened: true,
    exact_entries: FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES,
    content_reverified: true,
  });
  cases.pass("exact24k-plan-finalizer-publication-success");
  expect(e2eScannerCloseCalls).toBe(2);
  expect(e2eScannerKey?.every((byte) => byte === 0)).toBe(true);
  expect(preparedOutputKeys).toHaveLength(2);
  expect(
    preparedOutputKeys.every((key) => key.every((byte) => byte === 0)),
  ).toBe(true);
  expect(finalizerOwnedKeys).toHaveLength(2);
  expect(
    finalizerOwnedKeys.every((key) => key.every((byte) => byte === 0)),
  ).toBe(true);

  await expect(fs.promises.lstat(value.stageRoot)).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(
    (await fs.promises.readdir(value.destinationRoot)).sort(compareBytewise),
  ).toEqual(
    [...FLOODGATE_V7_TRAINING_LABEL_FINAL_ENTRIES].sort(compareBytewise),
  );
  const result = JSON.parse(
    await fs.promises.readFile(
      path.join(
        value.destinationRoot,
        FLOODGATE_V7_TRAINING_LABEL_RESULT_FILENAME,
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const manifest = JSON.parse(
    await fs.promises.readFile(
      path.join(
        value.destinationRoot,
        FLOODGATE_V7_TRAINING_LABEL_MANIFEST_FILENAME,
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;
  expect(result).toMatchObject({
    schema: FLOODGATE_V7_TRAINING_LABEL_RESULT_SCHEMA,
    status:
      "test-only-authenticated-sealed-scan-work-byte-continuity-bound-deterministic-training-label-result-not-trained",
    training: {
      input_parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
      forced_parents_skipped: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
      records: 0,
    },
  });
  expect(manifest).toMatchObject({
    schema: FLOODGATE_V7_TRAINING_LABEL_MANIFEST_SCHEMA,
    status:
      "durable-complete-training-label-artifact-set-ready-for-exclusive-publication",
  });
  cases.pass("result-manifest-forced-accounting");
  cases.pass("owned-keys-zeroized-and-stage-moved");
  return cases.seal();
}
