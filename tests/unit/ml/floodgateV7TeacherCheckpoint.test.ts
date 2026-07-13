import { createHash, createHmac, hkdfSync } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

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
  type FloodgateTeacherStageLease,
} from "../../../ml/floodgate-teacher-stage-authorization";
import {
  FLOODGATE_TRAINING_RAW_FILENAME,
  withVerifiedPinnedFloodgateTrainingRowsCoreForTests,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingParent,
  type FloodgateTrainingRowConsumerDependencies,
  type FloodgateTrainingRowConsumerOptions,
} from "../../../ml/floodgate-training-row-consumer";
import {
  FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
  FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
  FLOODGATE_STABLE_MAX_ROWS,
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
} from "../../../ml/floodgate-stable-wasm-proposer";
import { FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY } from "../../../ml/floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
} from "../../../ml/floodgate-production-stable-wasm-runtime";
import {
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
  type FloodgateProductionTeacherRescoreResult,
} from "../../../ml/floodgate-production-teacher-usi-runtime";
import {
  FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID,
  FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
  buildFloodgateV7CandidateUnionCoreForTests,
  type FloodgateV7CandidateUnionInput,
} from "../../../ml/floodgate-v7-candidate-union";
import type { FloodgateV7CompletedParentInput } from "../../../ml/floodgate-v7-completed-parent";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
  FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
  FloodgateV7TeacherCheckpointPersistenceIndeterminateError,
  captureFloodgateV7TeacherCheckpointIntegerCoreForTests,
  checkpointFloodgateV7TeacherParentsCoreForTests,
  type FloodgateV7TeacherCheckpointDependencies,
  type FloodgateV7TeacherCheckpointOptions,
  type FloodgateV7TeacherCheckpointReceipt,
  type FloodgateV7TeacherCheckpointRunBinding,
  type FloodgateV7TeacherMissingParentProducer,
} from "../../../ml/floodgate-v7-teacher-checkpoint";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "../../../ml/shogi-sfen";
import { compareBytewise, positionKeyFromSfen } from "../../../ml/sibling-data";

const SMALL_SFEN = "4k4/9/9/9/9/9/9/9/K8 b - 1";
const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const FORCED_SFEN = "4k4/2B6/3GRG3/9/9/9/9/9/K8 w - 1";
const PRODUCER_REVISION = "a".repeat(40);
const VERIFIER_REVISION = "b".repeat(40);
const RUN_ID = "12".repeat(32);
const OTHER_RUN_ID = "34".repeat(32);
const KEY_ID = "synthetic-v7-checkpoint-key-1";
const ROOT_KEY_BYTE = 0x4b;
const HEADER_DOMAIN = "shogi-floodgate-v7-teacher-work-header-v1\0";
const ENTRY_DOMAIN = "shogi-floodgate-v7-teacher-work-parent-v1\0";
const SEAL_DOMAIN = "shogi-floodgate-v7-teacher-work-seal-v1\0";
const KEY_INFO = "shogi-floodgate-v7-teacher-checkpoint-key-v1\0";

const temporaryRoots: string[] = [];

interface TrainingFixture {
  readonly container: string;
  readonly outputRoot: string;
  readonly trainingPath: string;
  readonly rawRows: readonly FloodgateRoleBundleRawParent[];
  readonly identity: Readonly<FloodgateRoleBundleRawIdentity>;
  readonly options: FloodgateTrainingRowConsumerOptions;
}

interface CheckpointFixture {
  readonly root: string;
  readonly publicationParent: string;
  readonly stageRoot: string;
  readonly authorization: FloodgateTeacherStageAuthorizationOptions;
  readonly training: TrainingFixture;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
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
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareBytewise)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function parentId(gameId: string, ply: number): string {
  return `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function sourceUrl(seed: number): string {
  return `https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+checkpoint-a+checkpoint-b+20260101${String(seed).padStart(6, "0")}.csa`;
}

function canonicalRawBytes(
  rows: readonly FloodgateRoleBundleRawParent[],
): Uint8Array {
  return Buffer.from(`${rows.map((row) => canonicalJson(row)).join("\n")}\n`);
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

function rawParent(
  source: string,
  gameSha256: string,
  sfen: string,
  ply: number,
  playedMove: string,
): FloodgateRoleBundleRawParent {
  const gameId = floodgateCanonicalUrlGameId(source);
  return {
    schema_version: 1,
    source: "floodgate",
    source_url: source,
    game_sha256: gameSha256,
    game_id: gameId,
    parent_id: parentId(gameId, ply),
    position_id: positionKeyFromSfen(sfen),
    parent_sfen: sfen,
    ply,
    played_move: playedMove,
  };
}

function nonForcedRows(seed = 1): readonly FloodgateRoleBundleRawParent[] {
  const source = sourceUrl(seed);
  const gameSha256 = sha256(`synthetic checkpoint game ${seed}`);
  const firstMove = rulesCompleteLegalMoves(
    positionFromSfen(SMALL_SFEN).position,
  )[0].usi;
  const child = childSfenAfterUsi(SMALL_SFEN, firstMove);
  const secondMove = rulesCompleteLegalMoves(
    positionFromSfen(child).position,
  )[0].usi;
  return [
    rawParent(source, gameSha256, SMALL_SFEN, 0, firstMove),
    rawParent(source, gameSha256, child, 1, secondMove),
  ].sort((left, right) => compareBytewise(left.parent_id, right.parent_id));
}

function forcedRows(seed = 9): readonly FloodgateRoleBundleRawParent[] {
  const source = sourceUrl(seed);
  const legal = rulesCompleteLegalMoves(positionFromSfen(FORCED_SFEN).position);
  if (legal.length !== 1) throw new Error("forced fixture is not forced");
  return [
    rawParent(
      source,
      sha256(`synthetic forced checkpoint game ${seed}`),
      FORCED_SFEN,
      0,
      legal[0].usi,
    ),
  ];
}

function sequenceRows(
  count: number,
  seed = 21,
): readonly FloodgateRoleBundleRawParent[] {
  const source = sourceUrl(seed);
  const gameSha256 = sha256(`synthetic window checkpoint game ${seed}`);
  const rows: FloodgateRoleBundleRawParent[] = [];
  const seen = new Set<string>();
  let sfen = START_SFEN;
  for (let ply = 0; ply < count; ply += 1) {
    const positionId = positionKeyFromSfen(sfen);
    if (seen.has(positionId))
      throw new Error("window fixture repeated a parent");
    seen.add(positionId);
    const legal = rulesCompleteLegalMoves(positionFromSfen(sfen).position);
    const chosen = legal.find((entry) => {
      const child = childSfenAfterUsi(sfen, entry.usi);
      return !seen.has(positionKeyFromSfen(child));
    });
    if (chosen === undefined)
      throw new Error("window fixture has no fresh child");
    rows.push(rawParent(source, gameSha256, sfen, ply, chosen.usi));
    sfen = childSfenAfterUsi(sfen, chosen.usi);
  }
  return rows.sort((left, right) =>
    compareBytewise(left.parent_id, right.parent_id),
  );
}

function maxCandidateRows(seed = 31): readonly FloodgateRoleBundleRawParent[] {
  const source = sourceUrl(seed);
  const legal = rulesCompleteLegalMoves(positionFromSfen(START_SFEN).position);
  if (legal.length < 14) throw new Error("max-candidate fixture is too small");
  return [
    rawParent(
      source,
      sha256(`synthetic max-candidate checkpoint game ${seed}`),
      START_SFEN,
      0,
      legal[12].usi,
    ),
  ];
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

async function makeTrainingFixture(
  container: string,
  rows: readonly FloodgateRoleBundleRawParent[],
  basename = "role-bundle",
): Promise<TrainingFixture> {
  const outputRoot = path.join(container, basename);
  await mkdir0700(outputRoot);
  const bytes = canonicalRawBytes(rows);
  const trainingPath = path.join(outputRoot, FLOODGATE_TRAINING_RAW_FILENAME);
  await fs.promises.writeFile(trainingPath, bytes, {
    flag: "wx",
    mode: 0o600,
  });
  await fs.promises.chmod(trainingPath, 0o600);
  const identity = rawIdentity(rows, bytes);
  return {
    container,
    outputRoot,
    trainingPath,
    rawRows: rows,
    identity,
    options: {
      repositoryRoot: path.join(container, "repository"),
      verifierRevision: VERIFIER_REVISION,
      rawLockRoot: path.join(container, "raw-lock"),
      roleLockRoot: path.join(container, "role-lock"),
      legacyProtectedPositionIdsPath: path.join(
        container,
        "legacy-protected-position-ids.txt",
      ),
      outputRoot,
    },
  };
}

async function fixture(
  rows: readonly FloodgateRoleBundleRawParent[] = nonForcedRows(),
): Promise<CheckpointFixture> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-v7-checkpoint-test-"),
  );
  const root = await fs.promises.realpath(created);
  temporaryRoots.push(root);
  await fs.promises.chmod(root, 0o700);
  const training = await makeTrainingFixture(root, rows);
  const repositoryRoot = training.options.repositoryRoot;
  const rawLockRoot = training.options.rawLockRoot;
  const roleLockRoot = training.options.roleLockRoot;
  const publicationParent = path.join(root, "publication");
  const stageBasename = "teacher-stage";
  const stageRoot = path.join(publicationParent, stageBasename);
  const engineBin = path.join(root, "engine", "engine");
  const engineReceipt = path.join(root, "engine", "receipt.json");
  const engineArgument = path.join(root, "engine", "argument.bin");
  const evalDir = path.join(root, "eval");
  await Promise.all([
    mkdir0700(repositoryRoot),
    mkdir0700(rawLockRoot),
    mkdir0700(roleLockRoot),
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
    training,
    authorization: {
      repositoryRoot,
      rawLockRoot,
      roleLockRoot,
      roleBundleRoot: training.outputRoot,
      legacyProtectedPositionIdsPath:
        training.options.legacyProtectedPositionIdsPath,
      publicationParent,
      stageBasename,
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

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error("checkpoint tests require a POSIX effective uid");
  }
  return process.geteuid();
}

async function authorize(
  value: CheckpointFixture,
): Promise<FloodgateTeacherStageLease> {
  return authorizeFloodgateTeacherStageCoreForTests(value.authorization, {
    effectiveUserId: effectiveUserId(),
    inspectorPythonExecutable: FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
  });
}

function parentPayloadSha256(
  parent: Readonly<FloodgateTrainingParent>,
): string {
  return sha256(`shogi-floodgate-stable-parent-v1\0${canonicalJson(parent)}`);
}

function teacherRuntimeReceipt(): Record<string, unknown> {
  return {
    contract: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
    status: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
    claim_boundary: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
    execution_boundary: "production-fixed-assets-and-runtime-dependencies",
    asset_authority_execution_boundary:
      "production-fixed-registry-and-deployment-root",
    engine_id: FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID,
    runtime: {
      engine_count: 12,
      threads_per_engine: 1,
      hash_mb_per_engine: 64,
      fv_scale: 20,
      depth: 16,
      proposal_multipv_max: 12,
      independent_rescore_multipv: 1,
      no_process_arguments: true,
      shell: false,
      minimal_environment: true,
      per_worker_private_directories: true,
      queue_bound: 48,
    },
    fixed_options: [
      "EvalDir=<private-shared-snapshot>/eval",
      "FV_SCALE=20",
      "USI_Hash=64",
      "Threads=1",
      "USI_OwnBook=false",
      "BookFile=no_book",
      "NetworkDelay=0",
      "NetworkDelay2=0",
    ],
    timeouts: {
      usiMs: 15_000,
      readyMs: 120_000,
      searchMs: 600_000,
      termGraceMs: 500,
      killGraceMs: 1_000,
    },
    limits: {
      lineBytes: 64 * 1024,
      stdoutBytesPerPhase: 16 * 1024 * 1024,
      stdoutLinesPerPhase: 65_536,
      stderrBytesTotal: 8 * 1024 * 1024,
    },
    snapshot: {
      one_shared_private_snapshot: true,
      source_authority_revalidated: true,
      destination_revalidated: true,
      engine: {
        bytes:
          FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.engine.yaneuraou.bytes,
        sha256:
          FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.engine.yaneuraou.sha256,
        mode: "0500",
      },
      eval: {
        bytes: FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.eval.nn.bytes,
        sha256: FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.eval.nn.sha256,
        mode: "0400",
      },
    },
  };
}

function candidateUnionInput(
  parent: Readonly<FloodgateTrainingParent>,
  stableMoveOverride?: string,
): FloodgateV7CandidateUnionInput {
  const legal = rulesCompleteLegalMoves(
    positionFromSfen(parent.parent_sfen).position,
  ).map((entry) => entry.usi);
  const stableMove = stableMoveOverride ?? parent.played_move;
  const childSfen = childSfenAfterUsi(parent.parent_sfen, stableMove);
  const stable = {
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_payload_sha256: parentPayloadSha256(parent),
    stable_move: stableMove,
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
  if (legal.length === 1) {
    return {
      parent,
      legal: {
        source: FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
        parent_sfen: parent.parent_sfen,
        count: 1,
        moves: legal,
      },
      stable,
      runtime: null,
    };
  }
  const requested = Math.min(12, legal.length);
  const proposalMoves = legal.slice(0, requested);
  return {
    parent,
    legal: {
      source: FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
      parent_sfen: parent.parent_sfen,
      count: legal.length,
      moves: legal,
    },
    stable,
    runtime: {
      receipt: teacherRuntimeReceipt() as never,
      proposal: {
        depth: 16,
        lines: proposalMoves.map((move, index) => ({
          depth: 16,
          multipv: index + 1,
          cp: index,
          nodes: 10 + index,
          move,
          pv: [move],
          scoreKind: "cp" as const,
        })),
        bestmove: proposalMoves[0],
        observedNodes: 9 + proposalMoves.length,
        requested_multipv: requested,
        legal_move_count_evidence: {
          source:
            "caller-supplied-until-authenticated-by-v7-coordinator" as const,
          count: legal.length,
        },
        reset_before_search: true,
      },
    },
  };
}

function rescore(
  move: string,
  index: number,
): Readonly<FloodgateProductionTeacherRescoreResult> {
  return {
    depth: 16,
    lines: [
      {
        depth: 16,
        multipv: 1,
        cp: index,
        nodes: 100 + index,
        move,
        pv: [move],
        scoreKind: "cp" as const,
      },
    ],
    bestmove: move,
    observedNodes: 100 + index,
    requested_multipv: 1,
    searchmoves: [move],
    reset_before_search: true,
  };
}

function completedParentInput(
  parent: Readonly<FloodgateTrainingParent>,
  stableMoveOverride?: string,
): Readonly<FloodgateV7CompletedParentInput> {
  const source = candidateUnionInput(parent, stableMoveOverride);
  const union = buildFloodgateV7CandidateUnionCoreForTests(source);
  const row = source.stable;
  return {
    union,
    stable_runtime: {
      schema: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
      row,
      runtime_binding: {
        claim_boundary:
          FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
        execution_boundary:
          "production-fixed-asset-authority-and-reusable-pool",
        runtime_receipt_sha256: "c".repeat(64),
        reusable_pool_receipt_sha256: "e".repeat(64),
        parent_payload_sha256: row.parent_payload_sha256,
        row_sha256: sha256(
          `shogi-floodgate-production-stable-runtime-row-v1\0${canonicalJson(row)}`,
        ),
        origin: "direct-owning-runtime-capability-call-v1",
        plain_result_authentication_claim: false,
      },
    },
    rescores: union.candidates.map((candidate, index) =>
      rescore(candidate.move, index),
    ),
  };
}

function teacherRuntimeReceiptSha256(): string {
  return sha256(
    `shogi-floodgate-v7-runtime-receipt-v1\0${canonicalJson(
      teacherRuntimeReceipt(),
    )}`,
  );
}

function runBinding(): FloodgateV7TeacherCheckpointRunBinding {
  return {
    schema: FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
    plan: {
      bytes: FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
      sha256: FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
    },
    stable_runtime_receipt_sha256: "c".repeat(64),
    teacher_usi_runtime_receipt_sha256: teacherRuntimeReceiptSha256(),
  };
}

function checkpointOptions(
  overrides: Partial<FloodgateV7TeacherCheckpointOptions> = {},
): FloodgateV7TeacherCheckpointOptions {
  return { runId: RUN_ID, keyId: KEY_ID, ...overrides };
}

function rootKey(byte = ROOT_KEY_BYTE): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

function checkpointDependencies(
  overrides: Partial<FloodgateV7TeacherCheckpointDependencies> = {},
): FloodgateV7TeacherCheckpointDependencies {
  return {
    rootKey: rootKey(),
    effectiveUserId: effectiveUserId(),
    ...overrides,
  };
}

function workPath(value: CheckpointFixture): string {
  return path.join(
    value.stageRoot,
    FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  );
}

interface FileHandleSyncPrototype {
  sync(this: fs.promises.FileHandle): Promise<void>;
}

async function fileHandleSyncPrototype(
  filePath: string,
): Promise<FileHandleSyncPrototype> {
  const handle = await fs.promises.open(filePath, fs.constants.O_RDONLY);
  try {
    return Object.getPrototypeOf(handle) as FileHandleSyncPrototype;
  } finally {
    await handle.close();
  }
}

async function runCheckpoint(
  value: CheckpointFixture,
  producer: FloodgateV7TeacherMissingParentProducer = async ({ parent }) =>
    completedParentInput(parent),
  settings: Readonly<{
    readonly training?: TrainingFixture;
    readonly binding?: FloodgateV7TeacherCheckpointRunBinding;
    readonly options?: FloodgateV7TeacherCheckpointOptions;
    readonly dependencies?: FloodgateV7TeacherCheckpointDependencies;
  }> = {},
): Promise<Readonly<FloodgateV7TeacherCheckpointReceipt>> {
  const training = settings.training ?? value.training;
  const lease = await authorize(value);
  let receipt: Readonly<FloodgateV7TeacherCheckpointReceipt> | undefined;
  await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
    training.options,
    async (input: Readonly<AuthenticatedFloodgateTrainingRows>) => {
      receipt = await checkpointFloodgateV7TeacherParentsCoreForTests(
        lease,
        input,
        settings.binding ?? runBinding(),
        producer,
        settings.options ?? checkpointOptions(),
        settings.dependencies ?? checkpointDependencies(),
      );
    },
    trainingDependencies(training.identity),
  );
  if (receipt === undefined) throw new Error("checkpoint produced no receipt");
  return receipt;
}

function parsedWork(value: CheckpointFixture): Array<Record<string, unknown>> {
  return fs
    .readFileSync(workPath(value), "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function deferred<T>(): Readonly<{
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return Object.freeze({ promise, resolve, reject });
}

function hmacForRecord(
  key: Uint8Array,
  domain: string,
  record: Readonly<Record<string, unknown>>,
  macKey: string,
): string {
  const payload = Object.fromEntries(
    Object.entries(record).filter(([keyName]) => keyName !== macKey),
  );
  return createHmac("sha256", key)
    .update(domain, "utf8")
    .update(canonicalJson(payload), "utf8")
    .digest("hex");
}

function resignWorkRecords(records: Array<Record<string, unknown>>): Buffer {
  const derived = Buffer.from(
    hkdfSync(
      "sha256",
      rootKey(),
      Buffer.from(RUN_ID, "hex"),
      Buffer.from(KEY_INFO),
      32,
    ),
  );
  try {
    records[0].header_mac = hmacForRecord(
      derived,
      HEADER_DOMAIN,
      records[0],
      "header_mac",
    );
    let previous = records[0].header_mac as string;
    for (let index = 1; index < records.length; index += 1) {
      const record = records[index];
      if (record.kind === "seal") {
        record.final_entry_mac = previous;
        record.seal_mac = hmacForRecord(
          derived,
          SEAL_DOMAIN,
          record,
          "seal_mac",
        );
        continue;
      }
      record.previous_mac = previous;
      record.entry_mac = hmacForRecord(
        derived,
        ENTRY_DOMAIN,
        record,
        "entry_mac",
      );
      previous = record.entry_mac as string;
    }
    return Buffer.from(
      `${records.map((record) => canonicalJson(record)).join("\n")}\n`,
    );
  } finally {
    derived.fill(0);
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => fs.promises.rm(root, { recursive: true, force: true })),
  );
});

describe("Floodgate v7 teacher parent checkpoint", () => {
  it("normalizes parser-valid signed zero at integer capture", () => {
    const captured = captureFloodgateV7TeacherCheckpointIntegerCoreForTests(
      -0,
      "synthetic signed zero",
    );
    expect(captured).toBe(0);
    expect(Object.is(captured, -0)).toBe(false);
    expect(() =>
      captureFloodgateV7TeacherCheckpointIntegerCoreForTests(
        0,
        "synthetic positive minimum",
        1,
      ),
    ).toThrow(/at least 1/);
  });

  it("writes a private canonical parent chain in exact authenticated input order without touching a holdout sentinel", async () => {
    const value = await fixture();
    const requests: Array<
      Readonly<{ input_index: number; parent_id: string }>
    > = [];
    let holdoutReads = 0;
    const producer = Object.defineProperty(
      async ({
        input_index,
        parent,
      }: Parameters<FloodgateV7TeacherMissingParentProducer>[0]) => {
        requests.push({ input_index, parent_id: parent.parent_id });
        return completedParentInput(parent);
      },
      "selection_or_final_labels",
      {
        enumerable: true,
        get: () => {
          holdoutReads += 1;
          throw new Error("holdout sentinel must remain unread");
        },
      },
    ) as FloodgateV7TeacherMissingParentProducer;

    const receipt = await runCheckpoint(value, producer);
    const bytes = await fs.promises.readFile(workPath(value));
    const records = parsedWork(value);
    const stageStat = await fs.promises.lstat(value.stageRoot);
    const workStat = await fs.promises.lstat(workPath(value));

    expect(receipt).toMatchObject({
      contract: FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
      status: FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS,
      run_id: RUN_ID,
      key_id: KEY_ID,
      work: {
        records: value.training.rawRows.length,
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
        completed_parents: value.training.rawRows.length,
        resumed_parents: 0,
      },
    });
    expect(records.map((record) => record.kind)).toEqual([
      "header",
      ...value.training.rawRows.map(() => "completed-parent"),
      "seal",
    ]);
    expect(records.slice(1, -1).map((record) => record.sequence)).toEqual(
      value.training.rawRows.map((_row, index) => index),
    );
    expect(records.slice(1, -1).map((record) => record.parent_id)).toEqual(
      value.training.rawRows.map((row) => row.parent_id),
    );
    expect(requests.map((request) => request.input_index)).toEqual(
      value.training.rawRows.map((_row, index) => index),
    );
    expect(holdoutReads).toBe(0);
    expect(stageStat.mode & 0o7777).toBe(0o700);
    expect(workStat.mode & 0o7777).toBe(0o600);
    expect(bytes.toString("utf8")).not.toContain(
      ROOT_KEY_BYTE.toString(16).padStart(2, "0").repeat(32),
    );
  });

  it("fsyncs an already sealed checkpoint before directory sync without calling the producer or rewriting bytes", async () => {
    const value = await fixture();
    await runCheckpoint(value);
    const beforeBytes = await fs.promises.readFile(workPath(value));
    const before = await fs.promises.lstat(workPath(value), { bigint: true });
    const stage = await fs.promises.lstat(value.stageRoot, { bigint: true });
    const syncPrototype = await fileHandleSyncPrototype(workPath(value));
    const nativeSync = syncPrototype.sync;
    const syncOrder: Array<"stage" | "work"> = [];
    const syncSpy = vi
      .spyOn(syncPrototype, "sync")
      .mockImplementation(async function (this: fs.promises.FileHandle) {
        const stat = await this.stat({ bigint: true });
        if (stat.dev === before.dev && stat.ino === before.ino) {
          syncOrder.push("work");
        } else if (stat.dev === stage.dev && stat.ino === stage.ino) {
          syncOrder.push("stage");
        }
        await nativeSync.call(this);
      });
    let calls = 0;

    const receipt = await runCheckpoint(value, async () => {
      calls += 1;
      throw new Error("sealed checkpoint must not produce a parent");
    }).finally(() => syncSpy.mockRestore());
    const after = await fs.promises.lstat(workPath(value), { bigint: true });

    expect(calls).toBe(0);
    expect(syncOrder.slice(-2)).toEqual(["work", "stage"]);
    expect(receipt.work.resumed_parents).toBe(value.training.rawRows.length);
    expect(await fs.promises.readFile(workPath(value))).toEqual(beforeBytes);
    expect({
      dev: after.dev,
      ino: after.ino,
      size: after.size,
      mtimeNs: after.mtimeNs,
      ctimeNs: after.ctimeNs,
    }).toEqual({
      dev: before.dev,
      ino: before.ino,
      size: before.size,
      mtimeNs: before.mtimeNs,
      ctimeNs: before.ctimeNs,
    });
  });

  it("fails a sealed retry closed when the authenticated work-file fsync fails", async () => {
    const value = await fixture();
    await runCheckpoint(value);
    const beforeBytes = await fs.promises.readFile(workPath(value));
    const identity = await fs.promises.lstat(workPath(value), { bigint: true });
    const syncPrototype = await fileHandleSyncPrototype(workPath(value));
    const nativeSync = syncPrototype.sync;
    let workSyncAttempts = 0;
    let producerCalls = 0;
    const syncSpy = vi
      .spyOn(syncPrototype, "sync")
      .mockImplementation(async function (this: fs.promises.FileHandle) {
        const stat = await this.stat({ bigint: true });
        if (stat.dev === identity.dev && stat.ino === identity.ino) {
          workSyncAttempts += 1;
          throw new Error("synthetic sealed-retry fsync failure");
        }
        await nativeSync.call(this);
      });

    const retry = runCheckpoint(value, async () => {
      producerCalls += 1;
      throw new Error("sealed checkpoint must not produce a parent");
    }).finally(() => syncSpy.mockRestore());

    await expect(retry).rejects.toMatchObject({
      name: "FloodgateV7TeacherCheckpointPersistenceIndeterminateError",
      mayHavePersisted: true,
      message: expect.stringContaining(
        "existing authenticated work sync may have persisted",
      ),
    });
    expect(workSyncAttempts).toBe(1);
    expect(producerCalls).toBe(0);
    expect(await fs.promises.readFile(workPath(value))).toEqual(beforeBytes);
  });

  it("repeats search after a produced parent was not appended, but never repeats a durable parent", async () => {
    const value = await fixture();
    const calls = new Map<number, number>();
    const producer: FloodgateV7TeacherMissingParentProducer = async ({
      input_index,
      parent,
    }) => {
      calls.set(input_index, (calls.get(input_index) ?? 0) + 1);
      return completedParentInput(parent);
    };
    await expect(
      runCheckpoint(value, producer, {
        dependencies: checkpointDependencies({
          failpointForTests: (event) => {
            if (
              event.phase === "after-parent-produced-before-entry" &&
              event.sequence === 0
            ) {
              throw new Error("synthetic search/append gap");
            }
          },
        }),
      }),
    ).rejects.toBeInstanceOf(
      FloodgateV7TeacherCheckpointPersistenceIndeterminateError,
    );
    expect(parsedWork(value).map((record) => record.kind)).toEqual(["header"]);

    await runCheckpoint(value, producer);
    expect(calls.get(0)).toBe(2);

    const durable = await fixture(forcedRows());
    let durableCalls = 0;
    await expect(
      runCheckpoint(
        durable,
        async ({ parent }) => {
          durableCalls += 1;
          return completedParentInput(parent);
        },
        {
          dependencies: checkpointDependencies({
            failpointForTests: (event) => {
              if (
                event.phase === "after-entry-durable" &&
                event.sequence === 0
              ) {
                throw new Error("synthetic durable interruption");
              }
            },
          }),
        },
      ),
    ).rejects.toBeInstanceOf(
      FloodgateV7TeacherCheckpointPersistenceIndeterminateError,
    );
    await runCheckpoint(durable, async () => {
      throw new Error("the sole durable parent must not run again");
    });
    expect(durableCalls).toBe(1);
    expect(parsedWork(durable).map((record) => record.kind)).toEqual([
      "header",
      "completed-parent",
      "seal",
    ]);
  });

  it("rejects the wrong root key, run, key ID, run binding, stage, or authenticated input before producing another parent", async () => {
    const value = await fixture();
    await runCheckpoint(value);
    const original = await fs.promises.readFile(workPath(value));
    let producerCalls = 0;
    const forbiddenProducer: FloodgateV7TeacherMissingParentProducer =
      async () => {
        producerCalls += 1;
        throw new Error("mismatched work must fail before production");
      };
    const cases: ReadonlyArray<Parameters<typeof runCheckpoint>[2]> = [
      { dependencies: checkpointDependencies({ rootKey: rootKey(0x5a) }) },
      { options: checkpointOptions({ runId: OTHER_RUN_ID }) },
      { options: checkpointOptions({ keyId: "another-v7-key" }) },
      {
        binding: {
          ...runBinding(),
          stable_runtime_receipt_sha256: "f".repeat(64),
        },
      },
    ];
    for (const settings of cases) {
      await expect(
        runCheckpoint(value, forbiddenProducer, settings),
      ).rejects.toThrow();
      expect(await fs.promises.readFile(workPath(value))).toEqual(original);
    }

    const alternateTraining = await makeTrainingFixture(
      value.root,
      nonForcedRows(2),
      "alternate-role-bundle",
    );
    await expect(
      runCheckpoint(value, forbiddenProducer, { training: alternateTraining }),
    ).rejects.toThrow();
    expect(await fs.promises.readFile(workPath(value))).toEqual(original);

    const otherStage = await fixture();
    await mkdir0700(otherStage.stageRoot);
    await fs.promises.writeFile(workPath(otherStage), original, {
      mode: 0o600,
    });
    await fs.promises.chmod(workPath(otherStage), 0o600);
    const copied = await fs.promises.readFile(workPath(otherStage));
    await expect(
      runCheckpoint(otherStage, forbiddenProducer),
    ).rejects.toThrow();
    expect(await fs.promises.readFile(workPath(otherStage))).toEqual(copied);
    expect(producerCalls).toBe(0);
  });

  it("rejects duplicate, reordered, post-seal, and fully re-signed wrong-parent records without changing them", async () => {
    const value = await fixture();
    await runCheckpoint(value);
    const originalRecords = parsedWork(value);
    const originalLines = (await fs.promises.readFile(workPath(value), "utf8"))
      .trimEnd()
      .split("\n");
    const mutations: Buffer[] = [
      Buffer.from(
        `${[
          originalLines[0],
          originalLines[1],
          originalLines[1],
          ...originalLines.slice(2),
        ].join("\n")}\n`,
      ),
      Buffer.from(
        `${[
          originalLines[0],
          originalLines[2],
          originalLines[1],
          ...originalLines.slice(3),
        ].join("\n")}\n`,
      ),
      Buffer.from(`${originalLines.join("\n")}\n{}\n`),
    ];
    const resigned = structuredClone(originalRecords);
    const firstEvidence = resigned[1].completed_evidence as Record<
      string,
      unknown
    >;
    const firstEvidenceParent = firstEvidence.parent as Record<string, unknown>;
    firstEvidenceParent.parent_id = value.training.rawRows[1].parent_id;
    const unsignedEvidence = Object.fromEntries(
      Object.entries(firstEvidence).filter(
        ([key]) => key !== "completed_parent_sha256",
      ),
    );
    firstEvidence.completed_parent_sha256 = sha256(
      `shogi-floodgate-v7-completed-parent-v1\0${canonicalJson(unsignedEvidence)}`,
    );
    resigned[1].completed_evidence_sha256 = sha256(
      `shogi-floodgate-v7-completed-evidence-v1\0${canonicalJson(firstEvidence)}`,
    );
    mutations.push(resignWorkRecords(resigned));

    for (const mutated of mutations) {
      await fs.promises.writeFile(workPath(value), mutated, { mode: 0o600 });
      let calls = 0;
      await expect(
        runCheckpoint(value, async () => {
          calls += 1;
          throw new Error("corrupt work must not invoke the producer");
        }),
      ).rejects.toThrow();
      expect(calls).toBe(0);
      expect(await fs.promises.readFile(workPath(value))).toEqual(mutated);
    }
  });

  it("rejects an oversized complete line during the byte scan without decoding, producing, or rewriting it", async () => {
    const value = await fixture(forcedRows(25));
    await mkdir0700(value.stageRoot);
    const oversized = Buffer.from(
      `${"x".repeat(FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES + 1)}\n`,
    );
    await fs.promises.writeFile(workPath(value), oversized, { mode: 0o600 });
    await fs.promises.chmod(workPath(value), 0o600);
    let producerCalls = 0;

    await expect(
      runCheckpoint(value, async () => {
        producerCalls += 1;
        throw new Error("oversized work must fail before production");
      }),
    ).rejects.toThrow("work.jsonl line exceeds its exact bound");
    expect(producerCalls).toBe(0);
    expect(await fs.promises.readFile(workPath(value))).toEqual(oversized);
  });

  it("admits the exact total-byte ceiling to bounded framing but rejects one byte beyond it before reading", async () => {
    const exact = await fixture(forcedRows(31));
    await mkdir0700(exact.stageRoot);
    const exactHandle = await fs.promises.open(workPath(exact), "w", 0o600);
    await exactHandle.truncate(FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES);
    await exactHandle.close();
    let exactReads = 0;
    await expect(
      runCheckpoint(exact, undefined, {
        dependencies: checkpointDependencies({
          readForTests: async (request, read) => {
            exactReads += 1;
            return read(request.length);
          },
        }),
      }),
    ).rejects.toThrow("work.jsonl line exceeds its exact bound");
    expect(exactReads).toBe(1);

    const overflow = await fixture(forcedRows(32));
    await mkdir0700(overflow.stageRoot);
    const overflowHandle = await fs.promises.open(
      workPath(overflow),
      "w",
      0o600,
    );
    await overflowHandle.truncate(
      FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES + 1,
    );
    await overflowHandle.close();
    let overflowReads = 0;
    await expect(
      runCheckpoint(overflow, undefined, {
        dependencies: checkpointDependencies({
          readForTests: async (_request, read) => {
            overflowReads += 1;
            return read();
          },
        }),
      }),
    ).rejects.toThrow(
      "work.jsonl owner, type, mode, link count, or size is invalid",
    );
    expect(overflowReads).toBe(0);
  });

  it("rejects a complete-record overflow before decoding or allocating excess-record storage", async () => {
    const value = await fixture(forcedRows(26));
    await runCheckpoint(value);
    const tooMany = Buffer.concat([
      await fs.promises.readFile(workPath(value)),
      Buffer.from("{}\n"),
    ]);
    await fs.promises.writeFile(workPath(value), tooMany, { mode: 0o600 });
    let producerCalls = 0;

    await expect(
      runCheckpoint(value, async () => {
        producerCalls += 1;
        throw new Error("record overflow must fail before production");
      }),
    ).rejects.toThrow("work.jsonl contains too many complete records");
    expect(producerCalls).toBe(0);
    expect(await fs.promises.readFile(workPath(value))).toEqual(tooMany);
  });

  it("scans sealed work through bounded partial reads and returns the exact whole-stream digest", async () => {
    const value = await fixture(forcedRows(27));
    const first = await runCheckpoint(value);
    const bytes = await fs.promises.readFile(workPath(value));
    const purposes: string[] = [];
    let maximumRequested = 0;
    let producerCalls = 0;

    const resumed = await runCheckpoint(
      value,
      async () => {
        producerCalls += 1;
        throw new Error("sealed partial-read retry must not produce");
      },
      {
        dependencies: checkpointDependencies({
          readForTests: async (request, read) => {
            purposes.push(request.purpose);
            maximumRequested = Math.max(maximumRequested, request.length);
            return read(Math.min(257, request.length));
          },
        }),
      },
    );

    expect(producerCalls).toBe(0);
    expect(maximumRequested).toBeLessThanOrEqual(64 * 1024);
    expect(new Set(purposes)).toEqual(
      new Set(["resumable-prefix", "sealed-final"]),
    );
    expect(resumed.work.bytes).toBe(bytes.byteLength);
    expect(resumed.work.sha256).toBe(sha256(bytes));
    expect(resumed.work.sha256).toBe(first.work.sha256);
  });

  it("rejects a read hook that skips, repeats, or misreports the native positional read", async () => {
    const value = await fixture(forcedRows(33));
    await runCheckpoint(value);
    let producerCalls = 0;
    const producer: FloodgateV7TeacherMissingParentProducer = async () => {
      producerCalls += 1;
      throw new Error("invalid read hooks must fail before production");
    };
    const hooks: NonNullable<
      FloodgateV7TeacherCheckpointDependencies["readForTests"]
    >[] = [
      async () => 1,
      async (_request, read) => (await read(1)) + 1,
      async (_request, read) => {
        await read(1);
        return read(1);
      },
    ];

    for (const readForTests of hooks) {
      await expect(
        runCheckpoint(value, producer, {
          dependencies: checkpointDependencies({ readForTests }),
        }),
      ).rejects.toThrow();
    }
    expect(producerCalls).toBe(0);
  });

  it("rejects raw BOM bytes, invalid UTF-8, and CRLF without rewriting the stream", async () => {
    const value = await fixture(forcedRows(28));
    await runCheckpoint(value);
    const original = await fs.promises.readFile(workPath(value));
    const firstLf = original.indexOf(0x0a);
    if (firstLf < 0) throw new Error("sealed fixture has no header LF");
    const mutations = [
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), original]),
      Buffer.concat([
        original.subarray(0, firstLf + 1),
        Buffer.from([0xef, 0xbb, 0xbf]),
        original.subarray(firstLf + 1),
      ]),
      Buffer.concat([Buffer.from([0xff]), original.subarray(1)]),
      Buffer.concat([
        original.subarray(0, firstLf),
        Buffer.from("\r\n"),
        original.subarray(firstLf + 1),
      ]),
    ];
    let producerCalls = 0;

    for (const tampered of mutations) {
      await fs.promises.writeFile(workPath(value), tampered, { mode: 0o600 });
      await expect(
        runCheckpoint(value, async () => {
          producerCalls += 1;
          throw new Error("byte-tampered work must fail before production");
        }),
      ).rejects.toThrow();
      expect(await fs.promises.readFile(workPath(value))).toEqual(tampered);
    }
    expect(producerCalls).toBe(0);
  });

  it("detects a size mutation between the incremental read snapshot stats", async () => {
    const value = await fixture(forcedRows(29));
    await runCheckpoint(value);
    let mutated = false;
    let producerCalls = 0;

    await expect(
      runCheckpoint(
        value,
        async () => {
          producerCalls += 1;
          throw new Error("mutated work must fail before production");
        },
        {
          dependencies: checkpointDependencies({
            readForTests: async (request, read) => {
              const bytesRead = await read();
              if (request.purpose === "resumable-prefix" && !mutated) {
                await fs.promises.appendFile(workPath(value), "x");
                mutated = true;
              }
              return bytesRead;
            },
          }),
        },
      ),
    ).rejects.toThrow("work.jsonl mutated during read");
    expect(mutated).toBe(true);
    expect(producerCalls).toBe(0);
  });

  it("reconfirms that the final pathname still names the scanned inode", async () => {
    const value = await fixture(forcedRows(30));
    await runCheckpoint(value);
    const original = await fs.promises.readFile(workPath(value));
    const displaced = path.join(value.root, "displaced-work.jsonl");
    let swapped = false;
    let producerCalls = 0;

    await expect(
      runCheckpoint(
        value,
        async () => {
          producerCalls += 1;
          throw new Error("swapped work must fail before production");
        },
        {
          dependencies: checkpointDependencies({
            failpointForTests: async (event) => {
              if (event.phase === "after-final-scan-before-path-confirmation") {
                await fs.promises.rename(workPath(value), displaced);
                await fs.promises.writeFile(workPath(value), original, {
                  mode: 0o600,
                });
                await fs.promises.chmod(workPath(value), 0o600);
                swapped = true;
              }
            },
          }),
        },
      ),
    ).rejects.toThrow("work.jsonl path snapshot changed");
    expect(swapped).toBe(true);
    expect(producerCalls).toBe(0);
  });

  it("records a forced parent with a stable runtime binding and zero proposal rescores or labels", async () => {
    const value = await fixture(forcedRows());
    const receipt = await runCheckpoint(value);
    const entry = parsedWork(value)[1];
    const evidence = entry.completed_evidence as Record<string, unknown>;
    const candidateUnion = evidence.candidate_union as Record<string, unknown>;
    const completion = evidence.completion as Record<string, unknown>;

    expect(receipt.work.completed_parents).toBe(1);
    expect(evidence.stable_runtime_binding).toMatchObject({
      runtime_receipt_sha256: runBinding().stable_runtime_receipt_sha256,
      origin: "direct-owning-runtime-capability-call-v1",
    });
    expect(evidence.teacher_proposal_runtime_binding).toBeNull();
    expect(candidateUnion.candidates).toEqual([]);
    expect(evidence.rescores).toEqual([]);
    expect(completion).toEqual({
      state: "forced-parent-skip",
      candidates: 0,
      independent_rescores_required: 0,
      independent_rescores_completed: 0,
      teacher_labels_emitted: 0,
    });
  });

  it("rejects a producer result for the wrong requested parent and preserves the exact parent cursor", async () => {
    const value = await fixture();
    const wrongParent = value.training.rawRows[1];
    const projectedWrongParent: FloodgateTrainingParent = {
      schema_version: 1,
      game_id: wrongParent.game_id,
      parent_id: wrongParent.parent_id,
      position_id: wrongParent.position_id,
      parent_sfen: wrongParent.parent_sfen,
      ply: wrongParent.ply,
      played_move: wrongParent.played_move,
    };
    await expect(
      runCheckpoint(value, async () =>
        completedParentInput(projectedWrongParent),
      ),
    ).rejects.toThrow();
    expect(parsedWork(value).map((record) => record.kind)).toEqual(["header"]);

    const requested: number[] = [];
    await runCheckpoint(value, async ({ input_index, parent }) => {
      requested.push(input_index);
      return completedParentInput(parent);
    });
    expect(requested).toEqual([0, 1]);
  });

  it("pins valid and rejected producer observation against a poisoned Promise Symbol.species substitute", async () => {
    const value = await fixture(forcedRows(27));
    const synchronousThrow = await fixture(forcedRows(28));
    const invalidReturn = await fixture(forcedRows(29));
    const originalSpecies = Object.getOwnPropertyDescriptor(
      Promise,
      Symbol.species,
    );
    const restoreSpecies = (): void => {
      if (originalSpecies === undefined) {
        Reflect.deleteProperty(Promise, Symbol.species);
      } else {
        Object.defineProperty(Promise, Symbol.species, originalSpecies);
      }
    };
    let speciesConstructions = 0;
    let substituteThenCalls = 0;
    let producerCalls = 0;
    function SubstitutingSpecies(
      this: unknown,
      executor: (
        resolve: (value: unknown) => void,
        reject: (reason?: unknown) => void,
      ) => void,
    ): object {
      speciesConstructions += 1;
      executor(
        () => undefined,
        () => undefined,
      );
      return {
        then(resolve: (value: unknown) => void): void {
          substituteThenCalls += 1;
          resolve("forged species result");
        },
      };
    }
    const poisonSpeciesForOneTurn = (): void => {
      Object.defineProperty(Promise, Symbol.species, {
        configurable: true,
        value: SubstitutingSpecies,
      });
      queueMicrotask(restoreSpecies);
    };
    const receipt = await (async () => {
      try {
        const completed = await runCheckpoint(value, ({ parent }) => {
          producerCalls += 1;
          poisonSpeciesForOneTurn();
          return Promise.resolve(completedParentInput(parent));
        });
        const constructionsAfterValidResult = speciesConstructions;

        const throwingProducer: FloodgateV7TeacherMissingParentProducer =
          () => {
            poisonSpeciesForOneTurn();
            throw new Error("synthetic synchronous producer failure");
          };
        await expect(
          runCheckpoint(synchronousThrow, throwingProducer),
        ).rejects.toBeInstanceOf(
          FloodgateV7TeacherCheckpointPersistenceIndeterminateError,
        );
        expect(
          parsedWork(synchronousThrow).map((record) => record.kind),
        ).toEqual(["header"]);
        expect(speciesConstructions).toBe(constructionsAfterValidResult);
        expect(substituteThenCalls).toBe(0);

        const invalidProducer: FloodgateV7TeacherMissingParentProducer = () => {
          poisonSpeciesForOneTurn();
          return 42 as never;
        };
        await expect(
          runCheckpoint(invalidReturn, invalidProducer),
        ).rejects.toBeInstanceOf(
          FloodgateV7TeacherCheckpointPersistenceIndeterminateError,
        );
        expect(parsedWork(invalidReturn).map((record) => record.kind)).toEqual([
          "header",
        ]);
        expect(speciesConstructions).toBe(constructionsAfterValidResult);
        expect(substituteThenCalls).toBe(0);
        return completed;
      } finally {
        restoreSpecies();
      }
    })();

    expect(producerCalls).toBe(1);
    expect(speciesConstructions).toBeGreaterThan(0);
    expect(substituteThenCalls).toBe(0);
    expect(receipt.work.completed_parents).toBe(1);
    expect(parsedWork(value).map((record) => record.kind)).toEqual([
      "header",
      "completed-parent",
      "seal",
    ]);
  });

  it("isolates its copied key from caller mutation and never zeroizes or serializes the caller view", async () => {
    const value = await fixture(forcedRows());
    const callerKey = rootKey();
    const original = new Uint8Array(callerKey);
    let mutated = false;
    await runCheckpoint(value, undefined, {
      dependencies: checkpointDependencies({
        rootKey: callerKey,
        failpointForTests: (event) => {
          if (event.phase === "after-header-durable") {
            callerKey.fill(0x5a);
            mutated = true;
          }
        },
      }),
    });
    expect(mutated).toBe(true);
    expect(callerKey).toEqual(new Uint8Array(32).fill(0x5a));
    expect(callerKey).not.toEqual(original);
    expect(await fs.promises.readFile(workPath(value), "utf8")).not.toContain(
      Buffer.from(original).toString("hex"),
    );
    const receipt = await runCheckpoint(value, undefined, {
      dependencies: checkpointDependencies({ rootKey: original }),
    });
    expect(receipt.work.resumed_parents).toBe(1);
  });

  it("runs a bounded 12-parent window concurrently while committing reverse-completed work in exact input order", async () => {
    const value = await fixture(
      sequenceRows(FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT + 1),
    );
    const count = value.training.rawRows.length;
    const gates = Array.from({ length: count }, () => deferred<void>());
    const requested: number[] = [];
    const completed: number[] = [];
    let active = 0;
    let maximumActive = 0;

    const pending = runCheckpoint(value, async ({ input_index, parent }) => {
      requested.push(input_index);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      try {
        await gates[input_index].promise;
        completed.push(input_index);
        return completedParentInput(parent);
      } finally {
        active -= 1;
      }
    });

    await vi.waitFor(
      () => {
        expect(requested).toEqual(
          Array.from(
            { length: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT },
            (_entry, index) => index,
          ),
        );
      },
      { timeout: 10_000 },
    );
    expect(active).toBe(FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT);
    for (
      let index = FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT - 1;
      index >= 1;
      index -= 1
    ) {
      gates[index].resolve(undefined);
    }
    await vi.waitFor(
      () => {
        expect(completed).toEqual(
          Array.from(
            { length: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT - 1 },
            (_entry, offset) =>
              FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT - 1 - offset,
          ),
        );
      },
      { timeout: 10_000 },
    );

    gates[0].resolve(undefined);
    await vi.waitFor(
      () => {
        expect(requested).toEqual(
          Array.from({ length: count }, (_entry, index) => index),
        );
      },
      { timeout: 10_000 },
    );
    gates[count - 1].resolve(undefined);
    await pending;

    expect(maximumActive).toBe(FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT);
    expect(maximumActive).toBeGreaterThan(1);
    expect(active).toBe(0);
    expect(
      parsedWork(value)
        .filter((record) => record.kind === "completed-parent")
        .map((record) => record.input_index),
    ).toEqual(Array.from({ length: count }, (_entry, index) => index));
    expect(
      parsedWork(value)
        .filter((record) => record.kind === "completed-parent")
        .map((record) => record.parent_id),
    ).toEqual(value.training.rawRows.map((row) => row.parent_id));
  }, 30_000);

  it("drains every launched producer after failure without scheduling or appending later parents", async () => {
    const value = await fixture(
      sequenceRows(FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT + 1, 22),
    );
    const gates = Array.from({ length: value.training.rawRows.length }, () =>
      deferred<void>(),
    );
    const requested: number[] = [];
    let active = 0;
    const pending = runCheckpoint(value, async ({ input_index, parent }) => {
      requested.push(input_index);
      active += 1;
      try {
        await gates[input_index].promise;
        return completedParentInput(parent);
      } finally {
        active -= 1;
      }
    });

    await vi.waitFor(
      () => {
        expect(requested).toHaveLength(
          FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
        );
      },
      { timeout: 10_000 },
    );
    gates[0].reject(new Error("synthetic first-parent failure"));
    for (
      let index = 1;
      index < FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT;
      index += 1
    ) {
      gates[index].resolve(undefined);
    }

    await expect(pending).rejects.toBeInstanceOf(
      FloodgateV7TeacherCheckpointPersistenceIndeterminateError,
    );
    expect(active).toBe(0);
    expect(requested).toEqual(
      Array.from(
        { length: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT },
        (_entry, index) => index,
      ),
    );
    expect(parsedWork(value).map((record) => record.kind)).toEqual(["header"]);
  }, 30_000);

  it("resumes from the exact durable cursor and schedules only the missing rolling window", async () => {
    const value = await fixture(
      sequenceRows(FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT + 1, 23),
    );
    const firstRunCalls: number[] = [];
    await expect(
      runCheckpoint(
        value,
        async ({ input_index, parent }) => {
          firstRunCalls.push(input_index);
          return completedParentInput(parent);
        },
        {
          dependencies: checkpointDependencies({
            failpointForTests: (event) => {
              if (
                event.phase === "after-entry-durable" &&
                event.sequence === 3
              ) {
                throw new Error("synthetic four-parent interruption");
              }
            },
          }),
        },
      ),
    ).rejects.toBeInstanceOf(
      FloodgateV7TeacherCheckpointPersistenceIndeterminateError,
    );
    expect(firstRunCalls).toEqual(
      Array.from(
        { length: value.training.rawRows.length },
        (_entry, index) => index,
      ),
    );
    expect(
      parsedWork(value)
        .filter((record) => record.kind === "completed-parent")
        .map((record) => record.input_index),
    ).toEqual([0, 1, 2, 3]);

    const resumedCalls: number[] = [];
    const receipt = await runCheckpoint(
      value,
      async ({ input_index, parent }) => {
        resumedCalls.push(input_index);
        return completedParentInput(parent);
      },
    );
    expect(receipt.work.resumed_parents).toBe(4);
    expect(resumedCalls).toEqual(
      Array.from(
        { length: value.training.rawRows.length - 4 },
        (_entry, offset) => offset + 4,
      ),
    );
    expect(
      parsedWork(value)
        .filter((record) => record.kind === "completed-parent")
        .map((record) => record.input_index),
    ).toEqual(
      Array.from(
        { length: value.training.rawRows.length },
        (_entry, index) => index,
      ),
    );
  }, 30_000);

  it("recovers only an unsealed incomplete tail and preserves complete or post-seal corruption byte-for-byte", async () => {
    const value = await fixture(forcedRows(24));
    await runCheckpoint(value);
    const sealed = await fs.promises.readFile(workPath(value));
    const lines = sealed.toString("utf8").trimEnd().split("\n");
    const partialEntry = lines[1].slice(0, Math.floor(lines[1].length / 2));

    const tornUnsealed = Buffer.from(`${lines[0]}\n${partialEntry}`);
    await fs.promises.writeFile(workPath(value), tornUnsealed, { mode: 0o600 });
    let recoveredCalls = 0;
    const recovered = await runCheckpoint(value, async ({ parent }) => {
      recoveredCalls += 1;
      return completedParentInput(parent);
    });
    expect(recoveredCalls).toBe(1);
    expect(recovered.work.resumed_parents).toBe(0);
    expect(parsedWork(value).map((record) => record.kind)).toEqual([
      "header",
      "completed-parent",
      "seal",
    ]);

    const completeMalformed = Buffer.from(`${lines[0]}\n${partialEntry}\n`);
    await fs.promises.writeFile(workPath(value), completeMalformed, {
      mode: 0o600,
    });
    let corruptCalls = 0;
    await expect(
      runCheckpoint(value, async () => {
        corruptCalls += 1;
        throw new Error("complete corruption must fail before production");
      }),
    ).rejects.toThrow();
    expect(corruptCalls).toBe(0);
    expect(await fs.promises.readFile(workPath(value))).toEqual(
      completeMalformed,
    );

    const postSealFragment = Buffer.concat([
      sealed,
      Buffer.from('{"post_seal_fragment"'),
    ]);
    await fs.promises.writeFile(workPath(value), postSealFragment, {
      mode: 0o600,
    });
    await expect(
      runCheckpoint(value, async () => {
        corruptCalls += 1;
        throw new Error("post-seal corruption must fail before production");
      }),
    ).rejects.toThrow(/incomplete fragment after its valid seal/);
    expect(corruptCalls).toBe(0);
    expect(await fs.promises.readFile(workPath(value))).toEqual(
      postSealFragment,
    );
  });

  it("keeps a representative 14-candidate entry comfortably inside both per-line and 24k-parent capacity bounds", async () => {
    const value = await fixture(maxCandidateRows());
    await runCheckpoint(value, async ({ parent }) => {
      const legal = rulesCompleteLegalMoves(
        positionFromSfen(parent.parent_sfen).position,
      );
      return completedParentInput(parent, legal[13].usi);
    });
    const lines = (await fs.promises.readFile(workPath(value), "utf8"))
      .trimEnd()
      .split("\n");
    const entry = JSON.parse(lines[1]) as Record<string, unknown>;
    const evidence = entry.completed_evidence as Record<string, unknown>;
    const candidateUnion = evidence.candidate_union as Record<string, unknown>;
    const candidates = candidateUnion.candidates as readonly unknown[];
    const entryBytes = Buffer.byteLength(lines[1], "utf8");
    const projectedMaximumCorpusBytes =
      FLOODGATE_STABLE_MAX_ROWS * (entryBytes + 1) +
      2 * (FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES + 1);
    const reservedSafetyBytes =
      FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES -
      projectedMaximumCorpusBytes;

    expect(candidates).toHaveLength(14);
    expect(entryBytes).toBeLessThanOrEqual(
      FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
    );
    expect(entryBytes).toBeLessThanOrEqual(
      Math.floor(FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES * 0.8),
    );
    expect(projectedMaximumCorpusBytes).toBeLessThanOrEqual(
      FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES,
    );
    expect(reservedSafetyBytes).toBeGreaterThanOrEqual(
      FLOODGATE_STABLE_MAX_ROWS *
        Math.floor(FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES * 0.15),
    );
  });
});
