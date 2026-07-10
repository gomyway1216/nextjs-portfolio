import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  SIBLING_MANIFEST_SCHEMA,
  SIBLING_SCHEMA,
  buildSiblingGroup,
  compareBytewise,
  type SiblingRecord,
} from '../../../ml/sibling-data';
import {
  INDEPENDENT_EXACT_RESCORE_MODE,
  SIBLING_TEACHER_LABEL_POLICY,
  SIBLING_TEACHER_MANIFEST_SCHEMA,
} from '../../../ml/generate-sibling-teacher';
import {
  SIBLING_EVAL_FINAL_HOLDOUT_GAMES,
  SIBLING_FULL_TEACHER_CONTRACT,
  SIBLING_EVAL_PARTITION_DOMAIN,
  SIBLING_EVAL_PARTITION_MANIFEST_SCHEMA,
  SIBLING_EVAL_PARTITION_SEED,
  SIBLING_POLICY_EXPOSED_PARENT_IDS_FORMAT,
  SIBLING_POLICY_EXPOSED_SEMANTIC_POSITION_IDS_FORMAT,
  SIBLING_POLICY_EXPOSURE_CONTRACT,
  SIBLING_POLICY_EXPOSURE_RECEIPT_SCHEMA,
  SIBLING_PROTECTED_POSITION_IDS_FORMAT,
  PolicyExposureAuditRequiredError,
  partitionSiblingValidation,
  rankSiblingEvalGames,
  siblingPartitionCompletionLabel,
  siblingPartitionErrorExitCode,
  siblingEvalGameRankDigest,
  type PartitionSiblingValidationDependencies,
  type PartitionSiblingValidationOptions,
  type SiblingFullTeacherContract,
  type SiblingPolicyExposureContract,
} from '../../../ml/partition-sibling-validation';

const REVISION = 'a'.repeat(40);
const BASE_REVISION = 'b'.repeat(40);
const TEST_RAW_SHA256 = '9'.repeat(64);
const TEST_ENGINE_SHA256 = '1'.repeat(64);
const TEST_ENGINE_RECEIPT_SHA256 = '5'.repeat(64);
const TEST_ENGINE_COMMIT = 'd'.repeat(40);
const TEST_EVAL_FILE = { path: 'nn.bin', bytes: 1, sha256: '2'.repeat(64) };
const TEST_EVAL_SHA256 = sha256(
  `eval-tree-v1\0{"bytes":1,"path":"nn.bin","sha256":"${'2'.repeat(64)}"}`
);
const TEST_FULL_TEACHER_CONTRACT: Readonly<SiblingFullTeacherContract> = Object.freeze({
  pipelineRevision: BASE_REVISION,
  rawSha256: TEST_RAW_SHA256,
  rawRecords: 56,
  selectedParents: 56,
  sourceGames: 28,
  selectedParentIdsSha256: '0'.repeat(64),
  engineBinSha256: TEST_ENGINE_SHA256,
  engineBinBytes: 1,
  engineReceiptBytes: 1,
  engineReceiptSha256: TEST_ENGINE_RECEIPT_SHA256,
  engineSourceCommit: TEST_ENGINE_COMMIT,
  evalSha256: TEST_EVAL_SHA256,
  depth: 16,
  multipv: 12,
  parallelEngines: 12,
  fvScale: 20,
  hashMbPerEngine: 64,
  timeoutMs: 600_000,
  splitSeed: '42',
  valRatio: 0.2,
  trainGameIdsSha256: idDigest(
    Array.from({ length: 21 }, (_, index) => `train-${index + 1}`)
  ),
  valGameIdsSha256: idDigest([
    'game-a',
    'game-b',
    'game-c',
    'game-d',
    'game-e',
    'game-f',
    'game-g',
  ]),
});
const pilotParentId = (index: number): string => `sha256:${index.toString(16).padStart(64, 'f')}`;
const PILOT_TRAIN_PARENT = pilotParentId(1);
const PILOT_SELECTION_PARENT = pilotParentId(2);
const PILOT_HOLDOUT_PARENT = pilotParentId(3);
const PILOT_UNMATCHED_PARENT = pilotParentId(4);
const TEST_PILOT_IDS = [
  PILOT_TRAIN_PARENT,
  PILOT_SELECTION_PARENT,
  PILOT_HOLDOUT_PARENT,
  PILOT_UNMATCHED_PARENT,
].sort(compareBytewise);
const TEST_PILOT_BYTES = Buffer.from(`${TEST_PILOT_IDS.join('\n')}\n`, 'utf8');
const TEST_POLICY_SEMANTIC_IDS = [`sha256:${'e'.repeat(64)}`];
const TEST_POLICY_SEMANTIC_BYTES = Buffer.from(
  `${TEST_POLICY_SEMANTIC_IDS.join('\n')}\n`,
  'utf8'
);
const TEST_POLICY_ROLE_ACCOUNTING = Object.freeze({
  trainingParents: 1,
  trainingRecords: 2,
  selectionParents: 1,
  selectionRecords: 2,
  holdoutParents: 1,
  holdoutRecords: 2,
  unmatchedParentIds: 1,
});
const TEST_POLICY_RECEIPT = {
  schema: SIBLING_POLICY_EXPOSURE_RECEIPT_SCHEMA,
  policy_decision: 'wcsc36-depth16-lane-a-v1',
  derivation:
    'union-of-position-id-and-child-position-id-from-all-committed-parent-records',
  parent_ids: {
    path: 'parent-ids.txt',
    format: SIBLING_POLICY_EXPOSED_PARENT_IDS_FORMAT,
    bytes: TEST_PILOT_BYTES.byteLength,
    sha256: sha256(TEST_PILOT_BYTES),
    count: TEST_PILOT_IDS.length,
    identifiers_sha256: idDigest(TEST_PILOT_IDS),
  },
  semantic_position_ids: {
    path: 'semantic-position-ids.txt',
    format: SIBLING_POLICY_EXPOSED_SEMANTIC_POSITION_IDS_FORMAT,
    bytes: TEST_POLICY_SEMANTIC_BYTES.byteLength,
    sha256: sha256(TEST_POLICY_SEMANTIC_BYTES),
    count: TEST_POLICY_SEMANTIC_IDS.length,
    identifiers_sha256: idDigest(TEST_POLICY_SEMANTIC_IDS),
  },
  source_artifacts: [{ path: 'work.jsonl', bytes: 1, sha256: '4'.repeat(64) }],
  role_accounting: {
    training_parents: TEST_POLICY_ROLE_ACCOUNTING.trainingParents,
    training_records: TEST_POLICY_ROLE_ACCOUNTING.trainingRecords,
    selection_parents: TEST_POLICY_ROLE_ACCOUNTING.selectionParents,
    selection_records: TEST_POLICY_ROLE_ACCOUNTING.selectionRecords,
    holdout_parents: TEST_POLICY_ROLE_ACCOUNTING.holdoutParents,
    holdout_records: TEST_POLICY_ROLE_ACCOUNTING.holdoutRecords,
    unmatched_parent_ids: TEST_POLICY_ROLE_ACCOUNTING.unmatchedParentIds,
  },
};
const TEST_POLICY_RECEIPT_BYTES = Buffer.from(
  `${JSON.stringify(TEST_POLICY_RECEIPT, null, 2)}\n`,
  'utf8'
);
const TEST_POLICY_EXPOSURE_CONTRACT: Readonly<SiblingPolicyExposureContract> = Object.freeze({
  receiptBytes: TEST_POLICY_RECEIPT_BYTES.byteLength,
  receiptSha256: sha256(TEST_POLICY_RECEIPT_BYTES),
  parentIdsFormat: SIBLING_POLICY_EXPOSED_PARENT_IDS_FORMAT,
  parentIdsBytes: TEST_PILOT_BYTES.byteLength,
  parentIdsSha256: sha256(TEST_PILOT_BYTES),
  parentIdsCount: TEST_PILOT_IDS.length,
  parentIdentifiersSha256: idDigest(TEST_PILOT_IDS),
  semanticIdsFormat: SIBLING_POLICY_EXPOSED_SEMANTIC_POSITION_IDS_FORMAT,
  semanticIdsBytes: TEST_POLICY_SEMANTIC_BYTES.byteLength,
  semanticIdsSha256: sha256(TEST_POLICY_SEMANTIC_BYTES),
  semanticIdsCount: TEST_POLICY_SEMANTIC_IDS.length,
  semanticIdentifiersSha256: idDigest(TEST_POLICY_SEMANTIC_IDS),
  roleAccounting: TEST_POLICY_ROLE_ACCOUNTING,
});
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.promises.rm(root, { recursive: true, force: true })));
});

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function idDigest(values: Iterable<string>): string {
  return sha256([...new Set(values)].sort(compareBytewise).join('\n'));
}

function policyBundle(
  semanticIds: readonly string[],
  roleAccounting: Readonly<NonNullable<SiblingPolicyExposureContract['roleAccounting']>>
): {
  semanticBytes: Buffer;
  receiptBytes: Buffer;
  contract: Readonly<SiblingPolicyExposureContract>;
} {
  const sortedSemanticIds = [...semanticIds].sort(compareBytewise);
  const semanticBytes = Buffer.from(`${sortedSemanticIds.join('\n')}\n`, 'utf8');
  const receipt = {
    ...TEST_POLICY_RECEIPT,
    semantic_position_ids: {
      path: 'semantic-position-ids.txt',
      format: SIBLING_POLICY_EXPOSED_SEMANTIC_POSITION_IDS_FORMAT,
      bytes: semanticBytes.byteLength,
      sha256: sha256(semanticBytes),
      count: sortedSemanticIds.length,
      identifiers_sha256: idDigest(sortedSemanticIds),
    },
    role_accounting: {
      training_parents: roleAccounting.trainingParents,
      training_records: roleAccounting.trainingRecords,
      selection_parents: roleAccounting.selectionParents,
      selection_records: roleAccounting.selectionRecords,
      holdout_parents: roleAccounting.holdoutParents,
      holdout_records: roleAccounting.holdoutRecords,
      unmatched_parent_ids: roleAccounting.unmatchedParentIds,
    },
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return {
    semanticBytes,
    receiptBytes,
    contract: Object.freeze({
      ...TEST_POLICY_EXPOSURE_CONTRACT,
      receiptBytes: receiptBytes.byteLength,
      receiptSha256: sha256(receiptBytes),
      semanticIdsBytes: semanticBytes.byteLength,
      semanticIdsSha256: sha256(semanticBytes),
      semanticIdsCount: sortedSemanticIds.length,
      semanticIdentifiersSha256: idDigest(sortedSemanticIds),
      roleAccounting,
    }),
  };
}

function semanticSfen(index: number, side: 'b' | 'w' = 'b'): string {
  return `9/9/9/9/9/9/9/9/9 ${side} ${index + 1}P ${index + 1}`;
}

function group(
  gameId: string,
  parentId: string,
  index: number,
  parentSfen?: string,
  split: 'train' | 'val' = 'val'
): SiblingRecord[] {
  return buildSiblingGroup(
    {
      game_id: gameId,
      parent_id: parentId,
      parent_sfen: parentSfen ?? semanticSfen(index),
      parent_ply: index,
    },
    [
      {
        move: `1a1b${index}`,
        child_sfen: semanticSfen(100 + index, 'w'),
        sources: ['teacher'],
        teacher_parent_cp: 100,
        teacher_rank: 1,
      },
      {
        move: `2a2b${index}`,
        child_sfen: semanticSfen(200 + index, 'w'),
        sources: ['teacher'],
        teacher_parent_cp: 20,
        teacher_rank: 2,
      },
    ]
  ).map((record) => ({ ...record, split }));
}

interface Fixture {
  root: string;
  options: PartitionSiblingValidationOptions;
  trainRecords: SiblingRecord[];
  sourceTrainLines: Buffer[];
  records: SiblingRecord[];
  sourceLines: Buffer[];
  holdoutGameIds: Set<string>;
  conflictParentId: string;
  trainingConflictParentIds: Set<string>;
}

async function fixture(options: {
  semanticConflict?: boolean;
  dropWholeSelectionGame?: boolean;
  trainingSemanticConflict?: boolean;
  dropWholeTrainingGame?: boolean;
} = {}): Promise<Fixture> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-eval-partition-'));
  roots.push(root);
  const gameIds = ['game-a', 'game-b', 'game-c', 'game-d', 'game-e', 'game-f', 'game-g'];
  const ranked = rankSiblingEvalGames(gameIds);
  const holdoutGameIds = new Set(ranked.slice(0, SIBLING_EVAL_FINAL_HOLDOUT_GAMES));
  const firstHoldout = ranked[0];
  const conflictGame = ranked[SIBLING_EVAL_FINAL_HOLDOUT_GAMES];
  const pilotSelectionGame = ranked[SIBLING_EVAL_FINAL_HOLDOUT_GAMES + 1];
  const recordsByGame = new Map<string, SiblingRecord[]>();
  gameIds.forEach((gameId, index) => recordsByGame.set(gameId, [
    ...group(
      gameId,
      gameId === firstHoldout
        ? PILOT_HOLDOUT_PARENT
        : gameId === pilotSelectionGame
          ? PILOT_SELECTION_PARENT
          : `${gameId}:p1`,
      index + 1
    ),
    ...group(gameId, `${gameId}:p2`, index + 21),
  ]));
  const holdoutChild = recordsByGame.get(firstHoldout)?.[2].child_sfen as string;
  const conflictParentId = `${conflictGame}:p1`;
  if (options.semanticConflict !== false) {
    recordsByGame.set(conflictGame, [
      ...group(conflictGame, conflictParentId, 50, holdoutChild),
      ...group(
        conflictGame,
        `${conflictGame}:p2`,
        70,
        options.dropWholeSelectionGame ? holdoutChild : undefined
      ),
    ]);
  }
  const records = gameIds.flatMap((gameId) => recordsByGame.get(gameId) as SiblingRecord[]);
  const selectionReferenceGame = ranked[SIBLING_EVAL_FINAL_HOLDOUT_GAMES + 2];
  const selectionChild = recordsByGame.get(selectionReferenceGame)?.[0].child_sfen as string;
  const trainGameIds = Array.from({ length: 21 }, (_, index) => `train-${index + 1}`);
  const trainRecordsByGame = new Map<string, SiblingRecord[]>();
  trainGameIds.forEach((gameId, index) => {
    const firstParentSfen = options.trainingSemanticConflict === false
      ? undefined
      : index === 0
        ? selectionChild
        : index === 1
          ? holdoutChild
          : undefined;
    const secondParentSfen =
      options.trainingSemanticConflict !== false && index === 0 && options.dropWholeTrainingGame
      ? selectionChild
      : undefined;
    trainRecordsByGame.set(gameId, [
      ...group(
        gameId,
        index === 2 ? PILOT_TRAIN_PARENT : `${gameId}:p1`,
        1_000 + index,
        firstParentSfen,
        'train'
      ),
      ...group(gameId, `${gameId}:p2`, 1_100 + index, secondParentSfen, 'train'),
    ]);
  });
  const trainRecords = trainGameIds.flatMap(
    (gameId) => trainRecordsByGame.get(gameId) as SiblingRecord[]
  );
  const sourceLines = records.map((record, index) =>
    Buffer.from(`${index % 2 === 0 ? ' ' : '\t'}${JSON.stringify(record)} ${index % 3 === 0 ? '\r' : ''}\n`)
  );
  const sourceTrainLines = trainRecords.map((record, index) =>
    Buffer.from(`${index % 2 === 0 ? '\t' : ' '}${JSON.stringify(record)}\n`)
  );
  const sourceValBytes = Buffer.concat(sourceLines);
  const sourceTrainBytes = Buffer.concat(sourceTrainLines);
  const sourceTrain = path.join(root, 'full.train.jsonl');
  const sourceVal = path.join(root, 'full.val.jsonl');
  const baseManifest = path.join(root, 'teacher-manifest.json');
  const policyExposureReceipt = path.join(root, 'policy-exposure-receipt.json');
  const policyExposedParentIds = path.join(root, 'policy-exposed-parent-ids.txt');
  const policyExposedSemanticPositionIds = path.join(
    root,
    'policy-exposed-semantic-position-ids.txt'
  );
  await fs.promises.writeFile(sourceTrain, sourceTrainBytes);
  await fs.promises.writeFile(sourceVal, sourceValBytes);
  await fs.promises.writeFile(policyExposureReceipt, TEST_POLICY_RECEIPT_BYTES);
  await fs.promises.writeFile(policyExposedParentIds, TEST_PILOT_BYTES);
  await fs.promises.writeFile(
    policyExposedSemanticPositionIds,
    TEST_POLICY_SEMANTIC_BYTES
  );
  const games = new Set(records.map((record) => record.game_id));
  const parents = new Set(records.map((record) => record.parent_id));
  const trainGames = new Set(trainRecords.map((record) => record.game_id));
  const trainParents = new Set(trainRecords.map((record) => record.parent_id));
  const allParentIds = new Set([...trainParents, ...parents]);
  const manifest = {
    schema: SIBLING_TEACHER_MANIFEST_SCHEMA,
    record_manifest_schema: SIBLING_MANIFEST_SCHEMA,
    pipeline: { source_revision: BASE_REVISION, tracked_tree_clean: true },
    source: {
      raw_sha256: TEST_RAW_SHA256,
      raw_records: TEST_FULL_TEACHER_CONTRACT.rawRecords,
      selected_parents: TEST_FULL_TEACHER_CONTRACT.selectedParents,
      selected_parent_ids_sha256: TEST_FULL_TEACHER_CONTRACT.selectedParentIdsSha256,
    },
    teacher: {
      engine_bin_sha256: TEST_ENGINE_SHA256,
      engine_bin_bytes: 1,
      engine_args: [],
      engine_arg_files: [],
      engine_receipt: {
        file: {
          path: 'receipt.json',
          bytes: TEST_FULL_TEACHER_CONTRACT.engineReceiptBytes,
          sha256: TEST_FULL_TEACHER_CONTRACT.engineReceiptSha256,
        },
        content: {
          schema: 'shogi-teacher-engine-receipt-v1',
          source_repository: 'https://example.com/engine.git',
          source_commit: TEST_FULL_TEACHER_CONTRACT.engineSourceCommit,
          source_commit_date: '2026-07-01T00:00:00Z',
          build_directory: 'source',
          build_command: 'make',
          compiler: 'test compiler',
          compiler_target: 'test-target',
          engine_id: 'test-engine',
          binary_bytes: 1,
          binary_sha256: TEST_ENGINE_SHA256,
        },
      },
      eval_sha256: TEST_EVAL_SHA256,
      eval_files: [TEST_EVAL_FILE],
      runtime_snapshot: {
        engine_binary: true,
        engine_argument_files: 'snapshotted-and-substituted',
        eval_tree: 'snapshotted',
        eval_options_file: 'rejected',
        private_working_directory: true,
        engine_argument_file_count: 0,
        eval_tree_present: true,
      },
    },
    search: {
      multipv: 12,
      limit: { depth: TEST_FULL_TEACHER_CONTRACT.depth },
      parallel_engines: 12,
      fv_scale: 20,
      hash_mb_per_engine: 64,
      timeout_ms: TEST_FULL_TEACHER_CONTRACT.timeoutMs,
      exact_rescore_mode: INDEPENDENT_EXACT_RESCORE_MODE,
      label_policy: SIBLING_TEACHER_LABEL_POLICY,
      tt_reset_before_proposal: true,
      tt_reset_before_each_candidate: true,
      search_state_reset_before_proposal: 'isready',
      search_state_reset_before_each_candidate: 'isready',
      candidate_execution_order: 'utf8-bytewise-ascending',
      synthesized_rank_order: 'cp-descending-then-utf8-bytewise-move',
      engine_options: {
        threads: 1,
        usi_own_book: false,
        book_file: 'no_book',
        network_delay_ms: 0,
        network_delay2_ms: 0,
        search_state_reset_trigger: 'isready',
      },
    },
    candidate_sets: {
      sha256: '6'.repeat(64),
      parents: allParentIds.size,
      candidates: trainRecords.length + records.length,
      min_candidates: 2,
      max_candidates: 2,
      skipped_parents: 0,
    },
    progress_checkpoint: {
      schema: 'shogi-sibling-teacher-work-v2',
      run_fingerprint: '7'.repeat(64),
      entries: allParentIds.size,
      completed_parents: allParentIds.size,
      skipped_parents: 0,
      sha256: '8'.repeat(64),
    },
    split: {
      schema: SIBLING_MANIFEST_SCHEMA,
      record_schema: SIBLING_SCHEMA,
      schema_version: 1,
      split_seed: TEST_FULL_TEACHER_CONTRACT.splitSeed,
      val_ratio: TEST_FULL_TEACHER_CONTRACT.valRatio,
      train_game_ids_sha256: TEST_FULL_TEACHER_CONTRACT.trainGameIdsSha256,
      val_game_ids_sha256: TEST_FULL_TEACHER_CONTRACT.valGameIdsSha256,
      stats: {
        input_records: trainRecords.length + records.length,
        output_records: trainRecords.length + records.length,
        input_parents: allParentIds.size,
        output_parents: allParentIds.size,
        input_games: trainGames.size + games.size,
        train_records: trainRecords.length,
        train_parents: trainParents.size,
        train_games: trainGames.size,
        val_records: records.length,
        val_parents: parents.size,
        val_games: games.size,
        val_position_priority_dropped_records: 0,
        val_position_priority_dropped_parents: 0,
        val_child_position_priority_dropped_records: 0,
        val_child_position_priority_dropped_parents: 0,
        game_overlap: 0,
        position_overlap: 0,
        child_position_overlap: 0,
      },
    },
    outputs: {
      train_bytes: sourceTrainBytes.byteLength,
      train_sha256: sha256(sourceTrainBytes),
      val_bytes: sourceValBytes.byteLength,
      val_sha256: sha256(sourceValBytes),
    },
  };
  await fs.promises.writeFile(baseManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    root,
    trainRecords,
    sourceTrainLines,
    records,
    sourceLines,
    holdoutGameIds,
    conflictParentId,
    trainingConflictParentIds: new Set(
      options.trainingSemanticConflict === false ? [] : ['train-1:p1', 'train-2:p1']
    ),
    options: {
      sourceTrain,
      sourceVal,
      baseManifest,
      policyExposureReceipt,
      policyExposedParentIds,
      policyExposedSemanticPositionIds,
      pipelineRevision: REVISION,
      outTrain: path.join(root, 'model-training.jsonl'),
      outModelSelection: path.join(root, 'model-selection.jsonl'),
      outFinalHoldout: path.join(root, 'final-holdout.jsonl'),
      outProtectedPositionIds: path.join(root, 'protected-position-ids.txt'),
      manifest: path.join(root, 'partition-manifest.json'),
    },
  };
}

function dependencies(
  overrides: Partial<PartitionSiblingValidationDependencies> = {}
): PartitionSiblingValidationDependencies {
  return {
    verifyRevision: async () => ({ source_revision: REVISION, tracked_tree_clean: true }),
    verifyOutputPaths: async () => undefined,
    fullTeacherContract: TEST_FULL_TEACHER_CONTRACT,
    policyExposureContract: TEST_POLICY_EXPOSURE_CONTRACT,
    ...overrides,
  };
}

function parseJsonl(bytes: Buffer): SiblingRecord[] {
  return bytes.toString('utf8').trim().split('\n').map((line) => JSON.parse(line));
}

describe('sealed sibling validation game ranking', () => {
  it('pins the framed digest and locale-independent game order', () => {
    expect(SIBLING_EVAL_PARTITION_DOMAIN).toBe('shogi-sibling-eval-partition-v1');
    expect(SIBLING_EVAL_PARTITION_SEED).toBe('wcsc36-d16-v6-eval-v1');
    expect(siblingEvalGameRankDigest('game-a').toString('hex')).toBe(
      '6dc8949ef1b8afb06ae3a59b71d463d8c0e476499db03b732ab7e8d548e364a2'
    );
    expect(rankSiblingEvalGames(['é', 'z', 'game-a', 'game-b'])).toEqual(
      rankSiblingEvalGames(['game-b', 'game-a', 'z', 'é', 'z'])
    );
  });

  it('pins the full teacher search and the complete Lane A exposure union', async () => {
    expect(SIBLING_FULL_TEACHER_CONTRACT).toMatchObject({
      rawRecords: 3_112,
      selectedParents: 3_112,
      sourceGames: 28,
      depth: 16,
      multipv: 12,
      parallelEngines: 12,
      timeoutMs: 600_000,
      selectedParentIdsSha256:
        '44cb6d61a97b0ad092c96d76631683cba19f468adb054152ed94d20033ac950c',
      trainGameIdsSha256:
        'a1f633e0937ed870b0d73cdf2496f124fb060239150e5c8567e6e20dd2cf6ff6',
      valGameIdsSha256:
        '778d7ffcd536367dcefbd1a93785c9a8c62b00504b9461a95fd1653b4fdd3b55',
    });
    expect(SIBLING_POLICY_EXPOSURE_CONTRACT).toMatchObject({
      receiptBytes: 3_907,
      receiptSha256:
        '000811b307284998d7de311954b15a618179a4d9318e1600031bd15991fe3e4b',
      parentIdsCount: 102,
      parentIdentifiersSha256:
        '77ea294f0237ca089f5fd4df64242ab9cf9f62f5a134196ac98fc9114ceebdd3',
      semanticIdsCount: 1_392,
      semanticIdentifiersSha256:
        '31d2b9f60421f540880037efed9571bd034a986163cd79d2e51f2336544cba70',
      roleAccounting: null,
    });
    const receipt = await fs.promises.readFile(
      path.resolve('ml/protocols/wcsc36-policy-exposure-receipt.json')
    );
    const parentIds = await fs.promises.readFile(
      path.resolve('ml/protocols/wcsc36-policy-exposed-parent-ids.txt')
    );
    const semanticIds = await fs.promises.readFile(
      path.resolve('ml/protocols/wcsc36-policy-exposed-semantic-position-ids.txt')
    );
    expect(sha256(receipt)).toBe(SIBLING_POLICY_EXPOSURE_CONTRACT.receiptSha256);
    expect(sha256(parentIds)).toBe(SIBLING_POLICY_EXPOSURE_CONTRACT.parentIdsSha256);
    expect(sha256(semanticIds)).toBe(SIBLING_POLICY_EXPOSURE_CONTRACT.semanticIdsSha256);
  });
});

describe('sealed sibling validation publication', () => {
  it('selects exactly three games, lets holdout win semantic conflicts, and preserves source bytes', async () => {
    const data = await fixture();
    const verifiedOutputs: string[][] = [];
    const manifest = await partitionSiblingValidation(
      data.options,
      dependencies({
        verifyOutputPaths: async (outputs) => {
          verifiedOutputs.push([...outputs]);
        },
      })
    );

    expect(manifest.schema).toBe(SIBLING_EVAL_PARTITION_MANIFEST_SCHEMA);
    expect(manifest.record_schema).toBe(SIBLING_SCHEMA);
    expect(manifest.policy).toEqual({
      algorithm: 'sha256-fixed-game-quota-final-holdout-v1',
      domain: 'shogi-sibling-eval-partition-v1',
      seed: 'wcsc36-d16-v6-eval-v1',
      source_role: 'val',
      expected_source_games: 7,
      final_holdout_games: 3,
      rank_order: 'sha256-bytes-ascending-then-game-id-utf8-bytewise',
      priority: 'final-holdout-then-evaluation-wins',
      drop_unit: 'parent-group',
      conflict_resolution:
        'drop-conflicting-selection-and-training-parent-groups-with-holdout-then-evaluation-priority',
      semantic_position_set: 'position_id-union-child_position_id',
      policy_exposure_policy:
        'drop-parent-groups-touching-policy-parent-or-semantic-position-exposure-before-role-isolation',
    });
    expect(verifiedOutputs).toHaveLength(2);
    expect(verifiedOutputs.every((outputs) => outputs.length === 5)).toBe(true);
    expect(manifest.outputs.model_training.games).toBe(21);
    expect(manifest.outputs.final_holdout.games).toBe(3);
    expect(manifest.outputs.model_selection.games).toBe(4);
    expect(manifest.drops).toEqual({
      training_policy_exposed_records: 2,
      training_policy_exposed_parents: 1,
      training_semantic_conflict_records: 4,
      training_semantic_conflict_parents: 2,
      selection_policy_exposed_records: 2,
      selection_policy_exposed_parents: 1,
      holdout_policy_exposed_records: 2,
      holdout_policy_exposed_parents: 1,
      selection_conflict_records: 2,
      selection_conflict_parents: 1,
      parent_id_overlap_parents: 0,
      semantic_position_overlap_parents: 1,
      policy_exposed_unmatched_parent_ids: 1,
    });
    expect(
      manifest.outputs.model_training.records +
      manifest.drops.training_policy_exposed_records +
      manifest.drops.training_semantic_conflict_records
    ).toBe(manifest.source.full_training.records);
    expect(
      manifest.outputs.model_selection.records +
      manifest.outputs.final_holdout.records +
      manifest.drops.selection_policy_exposed_records +
      manifest.drops.holdout_policy_exposed_records +
      manifest.drops.selection_conflict_records
    ).toBe(manifest.source.full_validation.records);
    expect(manifest.isolation).toEqual({
      game_overlap: 0,
      parent_overlap: 0,
      position_overlap: 0,
      child_position_overlap: 0,
      selection_position_to_holdout_child_overlap: 0,
      selection_child_to_holdout_position_overlap: 0,
      semantic_position_union_overlap: 0,
      training_to_selection_semantic_position_union_overlap: 0,
      training_to_holdout_semantic_position_union_overlap: 0,
      training_to_evaluation_semantic_position_union_overlap: 0,
    });

    const trainingBytes = await fs.promises.readFile(data.options.outTrain);
    const selectionBytes = await fs.promises.readFile(data.options.outModelSelection);
    const holdoutBytes = await fs.promises.readFile(data.options.outFinalHoldout);
    const expectedSelection = Buffer.concat(
      data.sourceLines.filter((_, index) => {
        const record = data.records[index];
        return (
          !data.holdoutGameIds.has(record.game_id) &&
          record.parent_id !== data.conflictParentId &&
          record.parent_id !== PILOT_SELECTION_PARENT
        );
      })
    );
    const expectedHoldout = Buffer.concat(
      data.sourceLines.filter(
        (_, index) =>
          data.holdoutGameIds.has(data.records[index].game_id) &&
          data.records[index].parent_id !== PILOT_HOLDOUT_PARENT
      )
    );
    const expectedTraining = Buffer.concat(
      data.sourceTrainLines.filter(
        (_, index) =>
          !data.trainingConflictParentIds.has(data.trainRecords[index].parent_id) &&
          data.trainRecords[index].parent_id !== PILOT_TRAIN_PARENT
      )
    );
    expect(trainingBytes.equals(expectedTraining)).toBe(true);
    expect(selectionBytes.equals(expectedSelection)).toBe(true);
    expect(holdoutBytes.equals(expectedHoldout)).toBe(true);
    expect(parseJsonl(trainingBytes).every((record) => record.split === 'train')).toBe(true);
    expect(parseJsonl(selectionBytes).every((record) => record.split === 'val')).toBe(true);
    expect(parseJsonl(holdoutBytes).every((record) => record.split === 'val')).toBe(true);

    const holdout = parseJsonl(holdoutBytes);
    const expectedProtected = [...new Set(holdout.flatMap((record) => [
      record.position_id,
      record.child_position_id,
    ]))].sort(compareBytewise);
    const protectedBytes = await fs.promises.readFile(data.options.outProtectedPositionIds);
    expect(protectedBytes.toString('utf8')).toBe(`${expectedProtected.join('\n')}\n`);
    expect(manifest.outputs.protected_position_ids).toEqual({
      format: SIBLING_PROTECTED_POSITION_IDS_FORMAT,
      bytes: protectedBytes.byteLength,
      sha256: sha256(protectedBytes),
      count: expectedProtected.length,
    });
    expect(manifest.source.policy_exposed_parent_ids).toEqual({
      format: SIBLING_POLICY_EXPOSED_PARENT_IDS_FORMAT,
      bytes: TEST_PILOT_BYTES.byteLength,
      sha256: sha256(TEST_PILOT_BYTES),
      count: 4,
      identifiers_sha256: idDigest(TEST_PILOT_IDS),
    });
    expect(manifest.source.policy_exposed_semantic_position_ids.count).toBe(1);
    expect(manifest.source.policy_exposure_receipt.sha256).toBe(
      sha256(TEST_POLICY_RECEIPT_BYTES)
    );
    expect(JSON.parse(await fs.promises.readFile(data.options.manifest, 'utf8'))).toEqual(manifest);
  });

  it('preflights every guard twice without creating an output', async () => {
    const data = await fixture({ semanticConflict: false });
    let revisionChecks = 0;
    let outputChecks = 0;
    const manifest = await partitionSiblingValidation(
      { ...data.options, preflight: true },
      dependencies({
        verifyRevision: async () => {
          revisionChecks++;
          return { source_revision: REVISION, tracked_tree_clean: true };
        },
        verifyOutputPaths: async () => {
          outputChecks++;
        },
      })
    );
    expect(manifest.outputs.final_holdout.games).toBe(3);
    expect(manifest.drops.selection_conflict_parents).toBe(0);
    expect(manifest.drops.selection_policy_exposed_parents).toBe(1);
    expect(revisionChecks).toBe(2);
    expect(outputChecks).toBe(2);
    await expect(fs.promises.stat(data.options.outTrain)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.promises.stat(data.options.outModelSelection)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.promises.stat(data.options.manifest)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a teacher manifest that changes the pinned depth or timeout', async () => {
    const data = await fixture({ semanticConflict: false });
    const base = JSON.parse(await fs.promises.readFile(data.options.baseManifest, 'utf8'));
    base.search.limit = { nodes: 1_000_000 };
    base.search.timeout_ms = 600_000;
    const bytes = Buffer.from(`${JSON.stringify(base, null, 2)}\n`, 'utf8');
    await fs.promises.writeFile(data.options.baseManifest, bytes);
    await expect(
      partitionSiblingValidation(
        { ...data.options, preflight: true },
        dependencies()
      )
    ).rejects.toThrow(/search\.limit/);
  });

  it('removes only the pinned pilot parent when no evaluation semantic ID overlaps', async () => {
    const data = await fixture({
      semanticConflict: false,
      trainingSemanticConflict: false,
    });
    const manifest = await partitionSiblingValidation(data.options, dependencies());
    const output = await fs.promises.readFile(data.options.outTrain);
    const expected = Buffer.concat(
      data.sourceTrainLines.filter(
        (_, index) => data.trainRecords[index].parent_id !== PILOT_TRAIN_PARENT
      )
    );
    expect(output.equals(expected)).toBe(true);
    expect(manifest.drops.training_semantic_conflict_records).toBe(0);
    expect(manifest.drops.training_semantic_conflict_parents).toBe(0);
    expect(manifest.drops.training_policy_exposed_records).toBe(2);
    expect(manifest.drops.training_policy_exposed_parents).toBe(1);
    expect(manifest.outputs.model_training.game_ids_sha256).toBe(
      manifest.source.full_training.game_ids_sha256
    );
  });

  it('drops a whole group when only a child position touches policy exposure', async () => {
    const data = await fixture({
      semanticConflict: false,
      trainingSemanticConflict: false,
    });
    const semanticOnlyParent = 'train-4:p1';
    const exposedChild = data.trainRecords.find(
      (record) => record.parent_id === semanticOnlyParent
    )!.child_position_id;
    const bundle = policyBundle([exposedChild], {
      ...TEST_POLICY_ROLE_ACCOUNTING,
      trainingParents: 2,
      trainingRecords: 4,
    });
    await fs.promises.writeFile(
      data.options.policyExposedSemanticPositionIds,
      bundle.semanticBytes
    );
    await fs.promises.writeFile(data.options.policyExposureReceipt, bundle.receiptBytes);

    const manifest = await partitionSiblingValidation(
      data.options,
      dependencies({ policyExposureContract: bundle.contract })
    );
    const output = parseJsonl(await fs.promises.readFile(data.options.outTrain));
    expect(output.some((record) => record.parent_id === semanticOnlyParent)).toBe(false);
    expect(manifest.drops.training_policy_exposed_parents).toBe(2);
    expect(manifest.drops.training_policy_exposed_records).toBe(4);
  });

  it('audits null role accounting with identical logic and never publishes', async () => {
    const data = await fixture();
    const receipt = { ...TEST_POLICY_RECEIPT, role_accounting: null };
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    const auditContract: Readonly<SiblingPolicyExposureContract> = Object.freeze({
      ...TEST_POLICY_EXPOSURE_CONTRACT,
      receiptBytes: receiptBytes.byteLength,
      receiptSha256: sha256(receiptBytes),
      roleAccounting: null,
    });
    await fs.promises.writeFile(data.options.policyExposureReceipt, receiptBytes);

    let blockedError: unknown;
    try {
      await partitionSiblingValidation(
        data.options,
        dependencies({ policyExposureContract: auditContract })
      );
    } catch (error) {
      blockedError = error;
    }
    expect(blockedError).toBeInstanceOf(Error);
    expect(blockedError).not.toBeInstanceOf(PolicyExposureAuditRequiredError);
    expect((blockedError as Error).message).toContain(
      'policy-exposure role accounting is not pinned'
    );
    expect(siblingPartitionErrorExitCode(blockedError)).toBe(1);
    await expect(fs.promises.stat(data.options.manifest)).rejects.toMatchObject({
      code: 'ENOENT',
    });

    let auditError: unknown;
    try {
      await partitionSiblingValidation(
        { ...data.options, auditPolicyExposure: true },
        dependencies({ policyExposureContract: auditContract })
      );
    } catch (error) {
      auditError = error;
    }
    expect(auditError).toBeInstanceOf(PolicyExposureAuditRequiredError);
    expect(siblingPartitionErrorExitCode(auditError)).toBe(2);
    expect((auditError as PolicyExposureAuditRequiredError).observed).toEqual(
      TEST_POLICY_ROLE_ACCOUNTING
    );
    await expect(fs.promises.stat(data.options.manifest)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('keeps a pinned role audit read-only and never labels it published', async () => {
    const data = await fixture();
    const manifest = await partitionSiblingValidation(
      { ...data.options, auditPolicyExposure: true },
      dependencies()
    );
    expect(manifest.outputs.model_training.records).toBeGreaterThan(0);
    expect(
      siblingPartitionCompletionLabel({
        preflight: false,
        auditPolicyExposure: true,
      })
    ).toBe('Audited (no publish)');
    expect(
      siblingPartitionCompletionLabel({
        preflight: true,
        auditPolicyExposure: false,
      })
    ).toBe('Preflighted');
    expect(
      siblingPartitionCompletionLabel({
        preflight: false,
        auditPolicyExposure: false,
      })
    ).toBe('Published');
    await expect(fs.promises.stat(data.options.outTrain)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(fs.promises.stat(data.options.manifest)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('publishes the manifest last and leaves no commit marker after a prior write fails', async () => {
    const data = await fixture();
    const writes: string[] = [];
    await expect(partitionSiblingValidation(
      data.options,
      dependencies({
        atomicWrite: async (filePath, contents) => {
          writes.push(filePath);
          if (filePath === data.options.outProtectedPositionIds) throw new Error('simulated fsync failure');
          await fs.promises.writeFile(filePath, contents);
        },
      })
    )).rejects.toThrow(/simulated fsync failure/);
    expect(writes).toEqual([
      data.options.outTrain,
      data.options.outModelSelection,
      data.options.outFinalHoldout,
      data.options.outProtectedPositionIds,
    ]);
    await expect(fs.promises.stat(data.options.manifest)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails closed when semantic drops would remove an entire model-selection game', async () => {
    const data = await fixture({ dropWholeSelectionGame: true });
    await expect(partitionSiblingValidation(data.options, dependencies())).rejects.toThrow(
      /model-selection output must retain exactly 4 games/
    );
    await expect(fs.promises.stat(data.options.manifest)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails closed when evaluation isolation would remove an entire training game', async () => {
    const data = await fixture({ dropWholeTrainingGame: true });
    await expect(partitionSiblingValidation(data.options, dependencies())).rejects.toThrow(
      /model-training output must retain exactly 21 games/
    );
    await expect(fs.promises.stat(data.options.manifest)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('sealed sibling validation fail-closed guards', () => {
  it('rejects an n=100 pilot manifest instead of treating it as the full teacher', async () => {
    const data = await fixture();
    const manifest = JSON.parse(await fs.promises.readFile(data.options.baseManifest, 'utf8'));
    manifest.source.raw_records = 3_112;
    manifest.source.selected_parents = 100;
    await fs.promises.writeFile(data.options.baseManifest, `${JSON.stringify(manifest)}\n`);
    await expect(
      partitionSiblingValidation(
        data.options,
        dependencies({
          fullTeacherContract: {
            ...TEST_FULL_TEACHER_CONTRACT,
            rawRecords: 3_112,
            selectedParents: 3_112,
          },
        })
      )
    ).rejects.toThrow(/source\.selected_parents/);
    await expect(fs.promises.stat(data.options.manifest)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects unknown base-manifest keys, bool-as-int, and non-finite parsed numbers', async () => {
    for (const mutation of ['root-extra', 'nested-extra', 'bool-int', 'infinite'] as const) {
      const data = await fixture();
      let text = await fs.promises.readFile(data.options.baseManifest, 'utf8');
      const value = JSON.parse(text);
      if (mutation === 'root-extra') value.unexpected = true;
      if (mutation === 'nested-extra') value.search.engine_options.unexpected = 0;
      if (mutation === 'bool-int') value.search.multipv = true;
      text = `${JSON.stringify(value)}\n`;
      if (mutation === 'infinite') {
        text = text.replace(
          '"timeout_ms":600000',
          '"timeout_ms":1e999'
        );
      }
      await fs.promises.writeFile(data.options.baseManifest, text);
      await expect(partitionSiblingValidation(data.options, dependencies())).rejects.toThrow(
        mutation.includes('extra') ? /must contain exactly/ : /multipv|timeout_ms/
      );
    }
  });

  it('rejects reordered policy parent IDs even when their direct fingerprint is updated', async () => {
    const data = await fixture();
    const reordered = [...TEST_PILOT_IDS].reverse();
    const bytes = Buffer.from(`${reordered.join('\n')}\n`, 'utf8');
    await fs.promises.writeFile(data.options.policyExposedParentIds, bytes);
    await expect(
      partitionSiblingValidation(
        data.options,
        dependencies({
          policyExposureContract: {
            ...TEST_POLICY_EXPOSURE_CONTRACT,
            parentIdsBytes: bytes.byteLength,
            parentIdsSha256: sha256(bytes),
          },
        })
      )
    ).rejects.toThrow(/parent_ids\.sha256|sorted unique/);
  });

  it('pins training exposure and unmatched parent-ID accounting', async () => {
    const data = await fixture();
    for (const mutation of [
      { trainingParents: 2 },
      { trainingRecords: 3 },
      { unmatchedParentIds: 0 },
    ]) {
      await expect(
        partitionSiblingValidation(
          data.options,
          dependencies({
            policyExposureContract: {
              ...TEST_POLICY_EXPOSURE_CONTRACT,
              roleAccounting: {
                ...TEST_POLICY_ROLE_ACCOUNTING,
                ...mutation,
              },
            },
          })
        )
      ).rejects.toThrow(/role_accounting|pinned training and unmatched counts/);
    }
  });

  it('rejects base-manifest byte, count, policy, and duplicate-key mismatches before output', async () => {
    for (const mutation of ['digest', 'count', 'policy', 'runtime', 'duplicate'] as const) {
      const data = await fixture();
      let text = await fs.promises.readFile(data.options.baseManifest, 'utf8');
      if (mutation === 'duplicate') {
        text = text.replace(
          `"schema": "${SIBLING_TEACHER_MANIFEST_SCHEMA}"`,
          `"schema": "${SIBLING_TEACHER_MANIFEST_SCHEMA}",\n  "schema": "${SIBLING_TEACHER_MANIFEST_SCHEMA}"`
        );
      } else {
        const value = JSON.parse(text);
        if (mutation === 'digest') value.outputs.val_sha256 = '0'.repeat(64);
        if (mutation === 'count') value.split.stats.val_records += 1;
        if (mutation === 'policy') value.search.label_policy = 'old-policy';
        if (mutation === 'runtime') value.teacher.runtime_snapshot.eval_tree_present = 'false';
        text = `${JSON.stringify(value)}\n`;
      }
      await fs.promises.writeFile(data.options.baseManifest, text);
      await expect(partitionSiblingValidation(data.options, dependencies())).rejects.toThrow(
        mutation === 'duplicate'
          ? /duplicate key/
          : mutation === 'digest'
            ? /do not match base teacher manifest/
            : mutation === 'count'
              ? /split accounting/
              : mutation === 'policy'
                ? /label_policy/
                : /eval_tree_present/
      );
      await expect(fs.promises.stat(data.options.manifest)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('rejects the wrong source cardinality, non-val rows, malformed groups, and missing final LF', async () => {
    for (const mutation of ['six-games', 'train-row', 'bad-group', 'no-lf'] as const) {
      const data = await fixture();
      let records = [...data.records];
      if (mutation === 'six-games') records = records.filter((record) => record.game_id !== 'game-g');
      if (mutation === 'train-row') records[0] = { ...records[0], split: 'train' };
      if (mutation === 'bad-group') records[1] = { ...records[1], teacher_rank: 3 };
      let source = Buffer.from(`${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
      if (mutation === 'no-lf') source = source.subarray(0, source.length - 1);
      await fs.promises.writeFile(data.options.sourceVal, source);
      const manifest = JSON.parse(await fs.promises.readFile(data.options.baseManifest, 'utf8'));
      manifest.outputs.val_bytes = source.byteLength;
      manifest.outputs.val_sha256 = sha256(source);
      manifest.split.stats.val_records = records.length;
      manifest.split.stats.val_parents = new Set(records.map((record) => record.parent_id)).size;
      manifest.split.stats.val_games = new Set(records.map((record) => record.game_id)).size;
      manifest.split.val_game_ids_sha256 = idDigest(records.map((record) => record.game_id));
      await fs.promises.writeFile(data.options.baseManifest, `${JSON.stringify(manifest)}\n`);
      await expect(partitionSiblingValidation(data.options, dependencies())).rejects.toThrow(
        mutation === 'six-games'
          ? /val_game_ids_sha256|split accounting/
          : mutation === 'train-row'
            ? /split across datasets|split=val/
            : mutation === 'bad-group'
              ? /contiguous/
              : /must end with LF/
      );
    }
  });

  it('rejects a wrong training cardinality, non-train rows, and unterminated training bytes', async () => {
    for (const mutation of ['twenty-games', 'val-row', 'no-lf'] as const) {
      const data = await fixture();
      let records = [...data.trainRecords];
      if (mutation === 'twenty-games') {
        records = records.filter((record) => record.game_id !== 'train-21');
      }
      if (mutation === 'val-row') records[0] = { ...records[0], split: 'val' };
      let source = Buffer.from(`${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
      if (mutation === 'no-lf') source = source.subarray(0, source.length - 1);
      await fs.promises.writeFile(data.options.sourceTrain, source);
      const manifest = JSON.parse(await fs.promises.readFile(data.options.baseManifest, 'utf8'));
      manifest.outputs.train_bytes = source.byteLength;
      manifest.outputs.train_sha256 = sha256(source);
      manifest.split.stats.train_records = records.length;
      manifest.split.stats.train_parents = new Set(records.map((record) => record.parent_id)).size;
      manifest.split.stats.train_games = new Set(records.map((record) => record.game_id)).size;
      manifest.split.train_game_ids_sha256 = idDigest(records.map((record) => record.game_id));
      await fs.promises.writeFile(data.options.baseManifest, `${JSON.stringify(manifest)}\n`);
      await expect(partitionSiblingValidation(data.options, dependencies())).rejects.toThrow(
        mutation === 'twenty-games'
          ? /train_game_ids_sha256|split accounting/
          : mutation === 'val-row'
            ? /split across datasets|split=train/
            : /must end with LF/
      );
    }
  });

  it('rejects lexical and realpath output aliases plus a dirty pipeline verifier', async () => {
    const data = await fixture();
    await expect(partitionSiblingValidation(
      { ...data.options, outModelSelection: data.options.sourceVal },
      dependencies()
    )).rejects.toThrow(/must not overwrite an input/);
    await expect(partitionSiblingValidation(
      { ...data.options, outTrain: data.options.sourceTrain },
      dependencies()
    )).rejects.toThrow(/must not overwrite an input/);
    await expect(partitionSiblingValidation(
      { ...data.options, outFinalHoldout: data.options.policyExposedParentIds },
      dependencies()
    )).rejects.toThrow(/must not overwrite an input/);
    await expect(partitionSiblingValidation(
      data.options,
      dependencies({ verifyOutputPaths: async () => { throw new Error('realpath alias'); } })
    )).rejects.toThrow(/realpath alias/);
    await expect(partitionSiblingValidation(
      data.options,
      dependencies({ verifyRevision: async () => { throw new Error('worktree is dirty'); } })
    )).rejects.toThrow(/dirty/);
  });

  it('rechecks source bytes immediately before publication', async () => {
    for (const source of [
      'sourceTrain',
      'sourceVal',
      'policyExposureReceipt',
      'policyExposedParentIds',
      'policyExposedSemanticPositionIds',
    ] as const) {
      const data = await fixture();
      let checks = 0;
      await expect(partitionSiblingValidation(
        data.options,
        dependencies({
          verifyRevision: async () => {
            checks++;
            if (checks === 2) await fs.promises.appendFile(data.options[source], ' \n');
            return { source_revision: REVISION, tracked_tree_clean: true };
          },
        })
      )).rejects.toThrow(/input changed/);
      await expect(fs.promises.stat(data.options.outTrain)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(fs.promises.stat(data.options.outModelSelection)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
  });
});
