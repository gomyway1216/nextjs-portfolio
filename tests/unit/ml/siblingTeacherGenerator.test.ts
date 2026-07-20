import * as crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  advanceStrengthFirstSiblingTeacherDataset,
  advanceStrengthFirstSiblingTeacherDatasetCoreForTests,
  advanceStrengthFirstV9SiblingTeacherDataset,
  INDEPENDENT_EXACT_RESCORE_MODE,
  PROPOSAL_INCOMPLETE_QUARANTINE_POLICY,
  REMOVED_SIBLING_TEACHER_CLI_MESSAGE,
  SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
  SIBLING_TEACHER_MANIFEST_SCHEMA,
  SIBLING_TEACHER_LABEL_POLICY,
  SIBLING_TEACHER_WORK_SCHEMA,
  STRENGTH_FIRST_PARENT_COMPLETION_RECORD_SCHEMA,
  STRENGTH_FIRST_PROPOSAL_INCOMPLETE_SKIP_REASON,
  STRENGTH_FIRST_PRODUCTION_ENGINES,
  STRENGTH_FIRST_V9_PRODUCTION_ENGINES,
  STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA,
  STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA,
  STRENGTH_FIRST_TIMEOUT_SKIP_DIVISOR,
  STRENGTH_FIRST_TIMEOUT_SKIP_REASON,
  siblingTeacherStagePaths,
  siblingTeacherRunFingerprint,
  stageSiblingTeacherDatasetCoreForTests,
  strengthFirstTimeoutSkipLimit,
  type GenerateSiblingTeacherDependencies,
  type StageSiblingTeacherCoreForTestsOptions,
  type StrengthFirstSiblingTeacherOptions,
} from '../../../ml/generate-sibling-teacher';
import {
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingParent,
} from '../../../ml/floodgate-training-row-consumer';
import { FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT } from '../../../ml/floodgate-role-bundle';
import { floodgateIdentifierDigest } from '../../../ml/floodgate-roles';
import { positionKeyFromSfen, type SiblingRecord } from '../../../ml/sibling-data';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_ENGINE = path.resolve(HERE, '../../fixtures/ml/fake-usi-engine.mjs');
const GENERATOR_SOURCE = path.resolve(HERE, '../../../ml/generate-sibling-teacher.ts');
const START = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
const TWO_LEGAL = 'ln4nn1/2r3gk1/3p2gp1/2s1R3S/p1p2P2p/3P2PL1/P+pSS1G1L1/1K7/LN6+b b G5Pb3p 119';
const ONE_LEGAL =
  '1+R3l2l/4+Pgk2/1s2p1sp1/p3np2p/3B3N1/P1G3S2/1P2+pP2P/1R2+n4/L+b2K1GNL b GS2P5p 107';
const PIPELINE_REVISION = '0123456789abcdef0123456789abcdef01234567';

interface GenerateSiblingTeacherOptions extends Omit<
  StageSiblingTeacherCoreForTestsOptions,
  'stageRoot' | 'runnerRevision'
> {
  raw: string;
  pipelineRevision: string;
  outTrain: string;
  outVal: string;
  manifest: string;
  work: string;
}

async function authenticatedInputFromRaw(
  rawPath: string,
  verifierRevision: string
): Promise<Readonly<AuthenticatedFloodgateTrainingRows>> {
  const rawBytes = await fs.promises.readFile(rawPath);
  const sourceRows = rawBytes
    .toString('utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  const rows: FloodgateTrainingParent[] = sourceRows.map((row) => ({
    schema_version: row.schema_version as 1,
    game_id: row.game_id as string,
    parent_id: row.parent_id as string,
    position_id: row.position_id as string,
    parent_sfen: row.parent_sfen as string,
    ply: row.ply as number,
    played_move: row.played_move as string,
  }));
  rows.sort((left, right) =>
    left.parent_id < right.parent_id ? -1 : left.parent_id > right.parent_id ? 1 : 0
  );
  const gameIds = new Set(rows.map((row) => row.game_id));
  const parentIds = new Set(rows.map((row) => row.parent_id));
  const positionIds = new Set(rows.map((row) => row.position_id));
  return Object.freeze({
    schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
    role: 'training' as const,
    binding: Object.freeze({
      result_receipt_bytes: 1,
      result_receipt_sha256: sha256('test-result-receipt'),
      bundle_manifest_bytes: 1,
      bundle_manifest_sha256: sha256('test-bundle-manifest'),
      bundle_producer_revision: PIPELINE_REVISION,
      verifier_revision: verifierRevision,
      raw_format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
      raw_bytes: rawBytes.byteLength,
      raw_sha256: sha256(rawBytes),
      records: rows.length,
      games: gameIds.size,
      game_ids_sha256: floodgateIdentifierDigest(gameIds),
      parent_ids_sha256: floodgateIdentifierDigest(parentIds),
      position_ids_count: positionIds.size,
      position_ids_sha256: floodgateIdentifierDigest(positionIds),
    }),
    rows: Object.freeze(rows.map((row) => Object.freeze(row))),
  });
}

async function generateSiblingTeacherDataset(
  options: GenerateSiblingTeacherOptions,
  dependencies: GenerateSiblingTeacherDependencies = {}
) {
  const { raw, pipelineRevision, outTrain, outVal, manifest, work, ...stageOptions } = options;
  const stageRoot = path.dirname(work);
  const stage = siblingTeacherStagePaths(stageRoot);
  if (
    path.resolve(outTrain) !== stage.train ||
    path.resolve(outVal) !== stage.val ||
    path.resolve(manifest) !== stage.manifest ||
    path.resolve(work) !== stage.work
  ) {
    throw new Error('test outputs must use the fixed sibling teacher stage filenames');
  }
  return stageSiblingTeacherDatasetCoreForTests(
    await authenticatedInputFromRaw(raw, pipelineRevision),
    { ...stageOptions, stageRoot, runnerRevision: pipelineRevision },
    dependencies
  );
}

async function generateForTest(
  options: Omit<GenerateSiblingTeacherOptions, 'pipelineRevision'> & {
    pipelineRevision?: string;
  }
) {
  return generateSiblingTeacherDataset(
    { pipelineRevision: PIPELINE_REVISION, ...options },
    {
      verifyRevision: async (revision) => ({
        source_revision: revision,
        tracked_tree_clean: true,
      }),
      verifyOutputPaths: async () => undefined,
    }
  );
}

function sha256(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('cannot canonicalize non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  throw new Error(`cannot canonicalize ${typeof value}`);
}

function resealWorkEntry(entry: Record<string, unknown>): void {
  const payload = { ...entry };
  delete payload.payload_sha256;
  entry.payload_sha256 = sha256(canonicalJson(payload));
}

async function writeEngineReceipt(root: string, engineBin = process.execPath): Promise<string> {
  const bytes = await fs.promises.readFile(engineBin);
  const receipt = path.join(root, 'engine-receipt.json');
  await fs.promises.writeFile(
    receipt,
    `${JSON.stringify({
      schema: 'shogi-teacher-engine-receipt-v1',
      source_repository: 'https://example.test/teacher-engine.git',
      source_commit: '0123456789abcdef0123456789abcdef01234567',
      source_commit_date: '2026-07-02T13:41:06+09:00',
      build_directory: 'source',
      build_command: 'test build',
      compiler: 'test compiler',
      compiler_target: 'test-target',
      engine_id: 'fake test engine',
      binary_bytes: bytes.byteLength,
      binary_sha256: sha256(bytes),
    })}\n`
  );
  return receipt;
}

function rawParent(parentId: string): Record<string, unknown> {
  const parentSfen =
    parentId === 'parent-b'
      ? 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/1PPPPPPPP/1B5R1/LNSGKGSNL b - 1'
      : START;
  return {
    schema_version: 1,
    source: 'wcsc',
    site: '第36回世界コンピュータ将棋選手権',
    start_time: '2026/05/05 09:00:00',
    end_time: '2026/05/05 09:01:00',
    time_control: '900+5',
    game_id: 'game-shared',
    parent_id: parentId,
    position_id: positionKeyFromSfen(parentSfen),
    parent_sfen: parentSfen,
    ply: 0,
    played_move: '6g6f',
  };
}

function parseJsonl<T>(text: string): T[] {
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

function expectExactKeys(value: object, expected: readonly string[]): void {
  expect(Object.keys(value).sort()).toEqual([...expected].sort());
}

describe('deterministic sibling teacher generator', () => {
  it('fails closed when an obsolete raw-path CLI job invokes the module directly', async () => {
    type RemovedOptionKeys = Extract<
      keyof StageSiblingTeacherCoreForTestsOptions,
      'raw' | 'maxParents' | 'pipelineRevision' | 'outTrain' | 'outVal' | 'manifest' | 'work'
    >;
    const removedFromPublicType: RemovedOptionKeys extends never ? true : false = true;
    expect(removedFromPublicType).toBe(true);
    type ProductionTestOnlyKeys = Extract<
      keyof StrengthFirstSiblingTeacherOptions,
      'testOnlyInitializationTimeoutMs'
    >;
    const testOverrideExcludedFromProduction: ProductionTestOnlyKeys extends never ? true : false =
      true;
    expect(testOverrideExcludedFromProduction).toBe(true);

    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-cli-tombstone-'));
    const sentinel = path.join(root, 'train.jsonl');
    await fs.promises.writeFile(sentinel, 'unchanged\n');
    const result = spawnSync(
      process.execPath,
      [
        '-r',
        'tsx/cjs',
        GENERATOR_SOURCE,
        '--raw',
        path.join(root, 'missing.raw.jsonl'),
        '--out-train',
        sentinel,
      ],
      {
        cwd: path.resolve(HERE, '../../..'),
        encoding: 'utf8',
      }
    );

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(REMOVED_SIBLING_TEACHER_CLI_MESSAGE);
    expect(await fs.promises.readFile(sentinel, 'utf8')).toBe('unchanged\n');
    expect(await fs.promises.readdir(root)).toEqual(['train.jsonl']);
  });

  it('rejects a runtime test-only initialization timeout at the production seam before spawn', async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'sibling-production-test-timeout-rejection-')
    );
    const raw = path.join(root, 'training.raw.jsonl');
    const stageRoot = path.join(root, 'stage');
    const environmentTrace = path.join(root, 'engine-environment.jsonl');
    await fs.promises.writeFile(raw, `${JSON.stringify(rawParent('parent-a'))}\n`);
    const input = await authenticatedInputFromRaw(raw, '89abcdef'.repeat(5));
    const unsafeRuntimeOptions = {
      stageRoot,
      runnerRevision: PIPELINE_REVISION,
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE, '--environment-trace', environmentTrace],
      engineReceipt: path.join(root, 'must-not-be-read.json'),
      multipv: 2,
      depth: 8,
      timeoutMs: 25,
      targetParents: 100,
      testOnlyInitializationTimeoutMs: 25,
    } as unknown as StrengthFirstSiblingTeacherOptions;

    await expect(
      advanceStrengthFirstSiblingTeacherDataset(input, unsafeRuntimeOptions)
    ).rejects.toThrow(
      'strength-first production generation rejects testOnlyInitializationTimeoutMs'
    );
    await expect(fs.promises.access(environmentTrace)).rejects.toThrow();
    await expect(fs.promises.access(stageRoot)).rejects.toThrow();
    expect((await fs.promises.readdir(root)).sort()).toEqual(['training.raw.jsonl']);
  });

  it('stages from authenticated rows without retaining a raw pathname and binds every receipt field', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-pathless-'));
    const raw = path.join(root, 'source.raw.jsonl');
    const rawText = `${JSON.stringify(rawParent('parent-pathless'))}\n`;
    await fs.promises.writeFile(raw, rawText);
    const input = await authenticatedInputFromRaw(raw, PIPELINE_REVISION);
    await fs.promises.rm(raw);
    const stageRoot = path.join(root, 'stage');
    const stage = siblingTeacherStagePaths(stageRoot);
    const verifyOutputPaths = vi.fn(
      async (_outputs: readonly string[], _inputs: readonly string[]) => undefined
    );
    const options: StageSiblingTeacherCoreForTestsOptions = {
      stageRoot,
      runnerRevision: PIPELINE_REVISION,
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE],
      engineReceipt: await writeEngineReceipt(root),
      multipv: 2,
      depth: 8,
      engines: 1,
      timeoutMs: 5_000,
    };
    const dependencies: GenerateSiblingTeacherDependencies = {
      verifyRevision: async (revision) => ({
        source_revision: revision,
        tracked_tree_clean: true,
      }),
      verifyOutputPaths,
    };

    const manifest = await stageSiblingTeacherDatasetCoreForTests(input, options, dependencies);
    expect(manifest.source).toMatchObject({
      raw_sha256: sha256(rawText),
      raw_records: 1,
      selected_parents: 1,
    });
    expect((await fs.promises.readdir(stageRoot)).sort()).toEqual([
      'manifest.json',
      'train.jsonl',
      'val.jsonl',
      'work.jsonl',
    ]);
    expect(verifyOutputPaths).toHaveBeenCalledTimes(2);
    for (const [outputs, inputs] of verifyOutputPaths.mock.calls) {
      expect(outputs).toEqual([stage.train, stage.val, stage.manifest, stage.work]);
      expect(inputs).not.toContain(raw);
    }

    const mismatchedRows = Object.freeze({
      ...input,
      binding: Object.freeze({
        ...input.binding,
        parent_ids_sha256: sha256('wrong-parent-set'),
      }),
    });
    await expect(
      stageSiblingTeacherDatasetCoreForTests(mismatchedRows, options, dependencies)
    ).rejects.toThrow(/aggregate binding/);

    const changedInput = Object.freeze({
      ...input,
      binding: Object.freeze({
        ...input.binding,
        result_receipt_sha256: sha256('different-result-receipt'),
      }),
    });
    await expect(
      stageSiblingTeacherDatasetCoreForTests(changedInput, options, dependencies)
    ).rejects.toThrow(/checkpoint header does not match/);
    await expect(
      stageSiblingTeacherDatasetCoreForTests(input, { ...options, timeoutMs: 6_000 }, dependencies)
    ).rejects.toThrow(/checkpoint header does not match/);
    await expect(
      stageSiblingTeacherDatasetCoreForTests(input, { ...options, engines: 2 }, dependencies)
    ).rejects.toThrow(/checkpoint header does not match/);
  });

  it('advances one target-independent run, keeps prefixes work-only, and binds final training completion', async () => {
    type ProductionEngineOption = Extract<keyof StrengthFirstSiblingTeacherOptions, 'engines'>;
    const productionEngineIsFixed: ProductionEngineOption extends never ? true : false = true;
    expect(productionEngineIsFixed).toBe(true);
    expect(STRENGTH_FIRST_PRODUCTION_ENGINES).toBe(12);
    expect(STRENGTH_FIRST_V9_PRODUCTION_ENGINES).toBe(13);

    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-strength-first-'));
    const raw = path.join(root, 'training.raw.jsonl');
    const stageRoot = path.join(root, 'stage');
    const stage = siblingTeacherStagePaths(stageRoot);
    const environmentTrace = path.join(root, 'engine-environment.jsonl');
    const engineEnvironmentEntries: Array<{
      environment: Record<string, string>;
      cwd: string;
    }> = [];
    const captureEngineEnvironment = async (): Promise<void> => {
      let trace: string;
      try {
        trace = await fs.promises.readFile(environmentTrace, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      engineEnvironmentEntries.push(
        ...parseJsonl<{ environment: Record<string, string>; cwd: string }>(trace)
      );
      await fs.promises.unlink(environmentTrace);
    };
    const forcedParent = {
      ...rawParent('parent-a'),
      position_id: positionKeyFromSfen(ONE_LEGAL),
      parent_sfen: ONE_LEGAL,
      ply: 106,
      played_move: '8h5h',
    };
    const rawText = `${JSON.stringify(rawParent('parent-b'))}\n${JSON.stringify(forcedParent)}\n`;
    await fs.promises.writeFile(raw, rawText);
    const bundleVerifierRevision = '89abcdef'.repeat(5);
    const input = await authenticatedInputFromRaw(raw, bundleVerifierRevision);
    const verifyRevision = vi.fn(async (revision: string) => ({
      source_revision: revision,
      tracked_tree_clean: true as const,
    }));
    const verifyOutputPaths = vi.fn(
      async (_outputs: readonly string[], _inputs: readonly string[]) => undefined
    );
    const dependencies = { verifyRevision, verifyOutputPaths };
    const baseOptions = {
      stageRoot,
      runnerRevision: PIPELINE_REVISION,
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE, '--environment-trace', environmentTrace],
      engineReceipt: await writeEngineReceipt(root),
      multipv: 2,
      depth: 8,
      engines: 2,
      timeoutMs: 5_000,
    };

    const prefix = await advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
      input,
      { ...baseOptions, targetParents: 1, finalize: false },
      dependencies
    );
    await captureEngineEnvironment();
    if (prefix.status !== 'local-work-prefix-complete-not-an-authentication-receipt') {
      throw new Error('expected strength-first prefix');
    }
    expect(prefix).toMatchObject({
      status: 'local-work-prefix-complete-not-an-authentication-receipt',
      authentication_receipt: false,
      target_parents: 1,
      completed_parents: 1,
      forced_parents_skipped: 1,
      forced_skip_reasons: {
        fewer_than_two_legal_moves: 1,
        search_timeout_no_label: 0,
      },
      emitted_parent_groups: 0,
      work: {
        path: 'work.jsonl',
        schema: SIBLING_TEACHER_WORK_SCHEMA,
        records: 2,
        binding_scope: 'canonical-target-prefix-projection',
      },
      current_work: {
        path: 'work.jsonl',
        schema: SIBLING_TEACHER_WORK_SCHEMA,
        records: 2,
      },
    });
    expect((await fs.promises.readdir(stageRoot)).sort()).toEqual(['work.jsonl']);
    expect((await fs.promises.stat(stage.work)).mode & 0o777).toBe(0o600);
    expect(verifyRevision).toHaveBeenLastCalledWith(PIPELINE_REVISION);
    expect(verifyRevision).not.toHaveBeenCalledWith(bundleVerifierRevision);
    expect(verifyOutputPaths.mock.calls.map(([outputs]) => outputs)).toEqual([
      [stage.work],
      [stage.work],
    ]);

    const finalized = await advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
      input,
      { ...baseOptions, targetParents: 2, finalize: true },
      dependencies
    );
    await captureEngineEnvironment();
    expect(finalized.status).toBe('complete-training-only');
    if (finalized.status !== 'complete-training-only') {
      throw new Error('expected strength-first finalization');
    }
    expect(finalized.run_fingerprint).toBe(prefix.run_fingerprint);
    expect(finalized.manifest).toMatchObject({
      schema: STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA,
      status: 'complete-training-only',
      run_fingerprint: prefix.run_fingerprint,
      pipeline: {
        source_revision: PIPELINE_REVISION,
        tracked_tree_clean: true,
      },
      authenticated_input: {
        bundle_verifier_revision: bundleVerifierRevision,
      },
      source: {
        raw_records: 2,
        selected_parents: 2,
      },
      teacher: {
        engine_environment: SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
      },
      search: {
        parallel_engines: 2,
      },
      progress_checkpoint: {
        entries: 2,
      },
      forced_skip_reasons: {
        fewer_than_two_legal_moves: 1,
        search_timeout_no_label: 0,
      },
      parent_completion: {
        path: 'parent-completion.jsonl',
        records: 2,
        forced_parents_skipped: 1,
        emitted_parent_groups: 1,
      },
      publication: {
        staged_inside_authenticated_callback: true,
        consumer_postflight_bound: false,
      },
    });
    expect(engineEnvironmentEntries).toHaveLength(1);
    for (const entry of engineEnvironmentEntries) {
      const expectedEnvironment = Object.fromEntries(
        Object.entries(SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT.variables).map(
          ([name, value]) => [name, value === '<private-worker-cwd>' ? entry.cwd : value]
        )
      );
      expect(entry.environment).toMatchObject(expectedEnvironment);
      expect(
        Object.keys(entry.environment).filter(
          (name) => !Object.hasOwn(expectedEnvironment, name)
        )
      ).toEqual(
        process.platform === 'darwin'
          ? [...SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT.darwin_spawn_injected_variables]
          : []
      );
      expect(entry.environment).not.toHaveProperty('USER');
      expect(entry.environment.HOME).toBe(entry.cwd);
      expect(entry.environment.TMPDIR).toBe(entry.cwd);
    }
    expect(finalized.staged_result).toMatchObject({
      schema: STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA,
      status: 'complete-training-only',
      runner_revision: PIPELINE_REVISION,
      bundle_verifier_revision: bundleVerifierRevision,
      input_parents: 2,
      completed_parents: 2,
      forced_parents_skipped: 1,
      forced_skip_reasons: {
        fewer_than_two_legal_moves: 1,
        search_timeout_no_label: 0,
      },
      emitted_parent_groups: 1,
      work: {
        path: 'work.jsonl',
        records: 3,
      },
      publication: {
        staged_inside_authenticated_callback: true,
        consumer_postflight_bound: false,
      },
    });
    expect((await fs.promises.readdir(stageRoot)).sort()).toEqual([
      'manifest.json',
      'parent-completion.jsonl',
      'staged-result.json',
      'train.jsonl',
      'work.jsonl',
    ]);
    await expect(fs.promises.access(stage.val)).rejects.toThrow();

    const trainText = await fs.promises.readFile(stage.train, 'utf8');
    const trainLines = trainText.trim().split('\n');
    const trainRows = parseJsonl<SiblingRecord>(trainText);
    expect(trainRows).toHaveLength(3);
    expect(trainRows.every((row) => row.split === 'train')).toBe(true);
    expect(trainRows.map((row) => row.parent_id)).toEqual(['parent-b', 'parent-b', 'parent-b']);
    expect(trainLines.every((line) => line === canonicalJson(JSON.parse(line)))).toBe(true);
    const semanticPositionIds = new Set(
      trainRows.flatMap((row) => [row.position_id, row.child_position_id])
    );
    expect(finalized.staged_result.train.semantic_position_ids_count).toBe(
      semanticPositionIds.size
    );
    expect(finalized.staged_result.train.semantic_position_ids_sha256).toBe(
      floodgateIdentifierDigest(semanticPositionIds)
    );

    const completionText = await fs.promises.readFile(stage.parentCompletion, 'utf8');
    const completionLines = completionText.trim().split('\n');
    const completionRows = parseJsonl<{
      schema: string;
      parent_id: string;
      completed_parent_sha256: string;
      forced_parent_skipped: boolean;
      train_group_records: number;
      train_group_sha256: string | null;
    }>(completionText);
    expect(completionLines.every((line) => line === canonicalJson(JSON.parse(line)))).toBe(true);
    expect(completionRows.map((row) => row.schema)).toEqual([
      STRENGTH_FIRST_PARENT_COMPLETION_RECORD_SCHEMA,
      STRENGTH_FIRST_PARENT_COMPLETION_RECORD_SCHEMA,
    ]);
    for (const row of completionLines.map((line) => JSON.parse(line) as object)) {
      expectExactKeys(row, [
        'schema',
        'game_id',
        'parent_id',
        'position_id',
        'completed_parent_sha256',
        'forced_parent_skipped',
        'train_group_records',
        'train_group_sha256',
      ]);
    }
    for (const row of completionRows) {
      const groupLines = trainLines.filter(
        (line) => (JSON.parse(line) as SiblingRecord).parent_id === row.parent_id
      );
      expect(row.completed_parent_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(row.train_group_records).toBe(groupLines.length);
      if (row.forced_parent_skipped) {
        expect(row.parent_id).toBe('parent-a');
        expect(row.train_group_records).toBe(0);
        expect(row.train_group_sha256).toBeNull();
      } else {
        expect(row.parent_id).toBe('parent-b');
        expect(row.train_group_sha256).toBe(sha256(`${groupLines.join('\n')}\n`));
      }
    }
    expect(finalized.staged_result.train).toEqual(finalized.manifest.outputs.train);
    expect(finalized.staged_result.parent_completion).toEqual(finalized.manifest.parent_completion);
    expect(finalized.staged_result.train.sha256).toBe(sha256(trainText));
    expect(finalized.staged_result.parent_completion.sha256).toBe(sha256(completionText));
    const manifestText = await fs.promises.readFile(stage.manifest, 'utf8');
    expect(finalized.staged_result.manifest).toMatchObject({
      bytes: Buffer.byteLength(manifestText),
      sha256: sha256(manifestText),
    });
    expect(JSON.parse(await fs.promises.readFile(stage.stagedResult, 'utf8'))).toEqual(
      finalized.staged_result
    );

    const stagedFinalArtifactsBeforeReplay = await Promise.all(
      [stage.train, stage.parentCompletion, stage.manifest, stage.stagedResult].map((file) =>
        fs.promises.readFile(file)
      )
    );
    const replayedPrefix = await advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
      input,
      { ...baseOptions, targetParents: 1, finalize: false },
      dependencies
    );
    expect(replayedPrefix.status).toBe('local-work-prefix-complete-not-an-authentication-receipt');
    if (replayedPrefix.status !== 'local-work-prefix-complete-not-an-authentication-receipt') {
      throw new Error('expected replayed prefix');
    }
    expect(replayedPrefix.run_fingerprint).toBe(prefix.run_fingerprint);
    expect(replayedPrefix.work).toEqual(prefix.work);
    expect(replayedPrefix.current_work.records).toBe(3);
    const stagedFinalArtifactsAfterReplay = await Promise.all(
      [stage.train, stage.parentCompletion, stage.manifest, stage.stagedResult].map((file) =>
        fs.promises.readFile(file)
      )
    );
    expect(stagedFinalArtifactsAfterReplay).toEqual(stagedFinalArtifactsBeforeReplay);

    const completedWorkRows = parseJsonl<Record<string, unknown>>(
      await fs.promises.readFile(stage.work, 'utf8')
    );
    const preservedLaterParent = completedWorkRows.find(
      (row) => row.kind === 'parent' && row.parent_id === 'parent-b'
    );
    if (!preservedLaterParent) throw new Error('missing later completed parent');
    await fs.promises.writeFile(
      stage.work,
      `${JSON.stringify(completedWorkRows[0])}\n${JSON.stringify(preservedLaterParent)}\n`
    );
    const repairedHole = await advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
      input,
      { ...baseOptions, targetParents: 2, finalize: false },
      dependencies
    );
    if (repairedHole.status !== 'local-work-prefix-complete-not-an-authentication-receipt') {
      throw new Error('expected repaired target prefix');
    }
    const repairedRows = parseJsonl<Record<string, unknown>>(
      await fs.promises.readFile(stage.work, 'utf8')
    );
    expect(repairedRows.map((row) => row.parent_id).filter(Boolean)).toEqual([
      'parent-a',
      'parent-b',
    ]);
    expect(
      repairedRows.find((row) => row.kind === 'parent' && row.parent_id === 'parent-b')
    ).toEqual(preservedLaterParent);
    expect(repairedHole.work.sha256).toBe(finalized.staged_result.work.sha256);
    const stagedFinalArtifactsAfterHoleRepair = await Promise.all(
      [stage.train, stage.parentCompletion, stage.manifest, stage.stagedResult].map((file) =>
        fs.promises.readFile(file)
      )
    );
    expect(stagedFinalArtifactsAfterHoleRepair).toEqual(stagedFinalArtifactsBeforeReplay);

    const allForcedRaw = path.join(root, 'all-forced.raw.jsonl');
    const allForcedStageRoot = path.join(root, 'all-forced-stage');
    await fs.promises.writeFile(allForcedRaw, `${JSON.stringify(forcedParent)}\n`);
    const allForced = await advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
      await authenticatedInputFromRaw(allForcedRaw, bundleVerifierRevision),
      {
        ...baseOptions,
        stageRoot: allForcedStageRoot,
        targetParents: 1,
        finalize: true,
      },
      dependencies
    );
    if (allForced.status !== 'complete-training-only') {
      throw new Error('expected accountable all-forced completion');
    }
    expect(allForced).toMatchObject({
      completed_parents: 1,
      manifest: {
        candidate_sets: {
          parents: 0,
          candidates: 0,
          min_candidates: 0,
          max_candidates: 0,
          skipped_parents: 1,
        },
        forced_skip_reasons: {
          fewer_than_two_legal_moves: 1,
          search_timeout_no_label: 0,
        },
        parent_completion: {
          records: 1,
          forced_parents_skipped: 1,
          emitted_parent_groups: 0,
        },
        outputs: {
          train: {
            bytes: 0,
            records: 0,
            parents: 0,
            games: 0,
            semantic_position_ids_count: 0,
          },
        },
      },
    });
    const allForcedStage = siblingTeacherStagePaths(allForcedStageRoot);
    expect(await fs.promises.readFile(allForcedStage.train, 'utf8')).toBe('');
    expect(parseJsonl<{ forced_parent_skipped: boolean }>(
      await fs.promises.readFile(allForcedStage.parentCompletion, 'utf8')
    )).toEqual([
      expect.objectContaining({
        forced_parent_skipped: true,
      }),
    ]);

    await expect(
      advanceStrengthFirstSiblingTeacherDataset(
        input,
        {
          stageRoot: path.join(root, 'production-stage'),
          runnerRevision: PIPELINE_REVISION,
          engineBin: process.execPath,
          engineArgs: [FAKE_ENGINE],
          engineReceipt: baseOptions.engineReceipt,
          multipv: 2,
          depth: 8,
          targetParents: 100,
        },
        dependencies
      )
    ).rejects.toThrow(/exactly 24000 parents/);
    await expect(
      advanceStrengthFirstV9SiblingTeacherDataset(
        input,
        {
          stageRoot: path.join(root, 'v9-production-stage'),
          runnerRevision: PIPELINE_REVISION,
          engineBin: process.execPath,
          engineArgs: [FAKE_ENGINE],
          engineReceipt: baseOptions.engineReceipt,
          multipv: 2,
          depth: 8,
          targetParents: 100,
        },
        dependencies
      )
    ).rejects.toThrow(/exactly 24000 parents/);
  }, 15_000);

  it('quarantines one typed search timeout without labels, replaces the engine, and binds exact accounting', async () => {
    expect(STRENGTH_FIRST_TIMEOUT_SKIP_DIVISOR).toBe(1_000);
    expect(strengthFirstTimeoutSkipLimit(100)).toBe(1);
    expect(strengthFirstTimeoutSkipLimit(500)).toBe(1);
    expect(strengthFirstTimeoutSkipLimit(24_000)).toBe(24);

    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-timeout-skip-'));
    const raw = path.join(root, 'training.raw.jsonl');
    const stageRoot = path.join(root, 'stage');
    const stage = siblingTeacherStagePaths(stageRoot);
    const environmentTrace = path.join(root, 'engine-environment.jsonl');
    const hangOnceMarker = path.join(root, 'hang-once.marker');
    await fs.promises.writeFile(
      raw,
      `${JSON.stringify(rawParent('parent-b'))}\n${JSON.stringify(rawParent('parent-a'))}\n`
    );
    const input = await authenticatedInputFromRaw(raw, '89abcdef'.repeat(5));
    const dependencies = {
      verifyRevision: async (revision: string) => ({
        source_revision: revision,
        tracked_tree_clean: true as const,
      }),
      verifyOutputPaths: async () => undefined,
    };
    const options = {
      stageRoot,
      runnerRevision: PIPELINE_REVISION,
      engineBin: process.execPath,
      engineArgs: [
        FAKE_ENGINE,
        '--environment-trace',
        environmentTrace,
        '--hang-searchmove',
        '2g2f',
        '--hang-once-marker',
        hangOnceMarker,
      ],
      engineReceipt: await writeEngineReceipt(root),
      multipv: 2,
      depth: 8,
      engines: 1,
      timeoutMs: 25,
      targetParents: 2,
      finalize: true,
    };

    const outcome = await advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
      input,
      options,
      dependencies
    );
    if (outcome.status !== 'complete-training-only') {
      throw new Error('expected timeout-quarantined completion');
    }
    expect(outcome).toMatchObject({
      completed_parents: 2,
      staged_result: {
        forced_parents_skipped: 1,
        forced_skip_reasons: {
          fewer_than_two_legal_moves: 0,
          search_timeout_no_label: 1,
        },
        emitted_parent_groups: 1,
      },
      manifest: {
        forced_skip_reasons: {
          fewer_than_two_legal_moves: 0,
          search_timeout_no_label: 1,
        },
        parent_completion: {
          records: 2,
          forced_parents_skipped: 1,
          emitted_parent_groups: 1,
        },
      },
    });

    const workRows = parseJsonl<Record<string, unknown>>(
      await fs.promises.readFile(stage.work, 'utf8')
    );
    const timeoutSkip = workRows.find(
      (row) => row.kind === 'skip' && row.reason === STRENGTH_FIRST_TIMEOUT_SKIP_REASON
    );
    expect(timeoutSkip).toMatchObject({
      schema: SIBLING_TEACHER_WORK_SCHEMA,
      kind: 'skip',
      parent_id: 'parent-a',
      reason: STRENGTH_FIRST_TIMEOUT_SKIP_REASON,
      timeout: {
        phase: 'independent-rescore',
        requested_multipv: 1,
        requested_limit: { depth: 8 },
        searchmoves: ['2g2f'],
        timeout_ms: 25,
      },
    });
    expect(timeoutSkip).not.toHaveProperty('records');
    expect(timeoutSkip).not.toHaveProperty('initial_search');
    expect(timeoutSkip).not.toHaveProperty('exact_search');
    expect(timeoutSkip?.payload_sha256).toMatch(/^[0-9a-f]{64}$/);

    const completionRows = parseJsonl<{
      parent_id: string;
      forced_parent_skipped: boolean;
      train_group_records: number;
      train_group_sha256: string | null;
    }>(await fs.promises.readFile(stage.parentCompletion, 'utf8'));
    expect(completionRows).toEqual([
      expect.objectContaining({
        parent_id: 'parent-a',
        forced_parent_skipped: true,
        train_group_records: 0,
        train_group_sha256: null,
      }),
      expect.objectContaining({
        parent_id: 'parent-b',
        forced_parent_skipped: false,
      }),
    ]);
    const trainRows = parseJsonl<SiblingRecord>(
      await fs.promises.readFile(stage.train, 'utf8')
    );
    expect(new Set(trainRows.map((row) => row.parent_id))).toEqual(new Set(['parent-b']));
    const replacementEnvironments = parseJsonl<{ cwd: string }>(
      await fs.promises.readFile(environmentTrace, 'utf8')
    );
    expect(replacementEnvironments).toHaveLength(2);
    expect(replacementEnvironments.map((entry) => entry.cwd)).toEqual([
      expect.stringMatching(/\/cwd\/worker-0\/engine-0$/),
      expect.stringMatching(/\/cwd\/worker-0\/engine-1$/),
    ]);

    const tamperedRows = workRows.map((row) => ({ ...row }));
    const tamperedSkip = tamperedRows.find(
      (row) => row.kind === 'skip' && row.reason === STRENGTH_FIRST_TIMEOUT_SKIP_REASON
    ) as Record<string, unknown>;
    tamperedSkip.timeout = {
      ...(tamperedSkip.timeout as Record<string, unknown>),
      timeout_ms: 26,
    };
    resealWorkEntry(tamperedSkip);
    await fs.promises.writeFile(
      stage.work,
      `${tamperedRows.map((row) => JSON.stringify(row)).join('\n')}\n`
    );
    await fs.promises.rm(environmentTrace, { force: true });
    await fs.promises.rm(hangOnceMarker, { force: true });
    await expect(
      advanceStrengthFirstSiblingTeacherDatasetCoreForTests(input, options, dependencies)
    ).rejects.toThrow(/invalid search-timeout skip metadata/);
  }, 15_000);

  it('records proposal-timeout context without emitting any partial label', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-proposal-timeout-'));
    const raw = path.join(root, 'training.raw.jsonl');
    const stageRoot = path.join(root, 'stage');
    const stage = siblingTeacherStagePaths(stageRoot);
    await fs.promises.writeFile(raw, `${JSON.stringify(rawParent('parent-a'))}\n`);
    const input = await authenticatedInputFromRaw(raw, '89abcdef'.repeat(5));
    const outcome = await advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
      input,
      {
        stageRoot,
        runnerRevision: PIPELINE_REVISION,
        engineBin: process.execPath,
        engineArgs: [FAKE_ENGINE, '--hang-go'],
        engineReceipt: await writeEngineReceipt(root),
        multipv: 2,
        depth: 8,
        engines: 1,
        timeoutMs: 25,
        targetParents: 1,
        finalize: true,
      },
      {
        verifyRevision: async (revision) => ({
          source_revision: revision,
          tracked_tree_clean: true,
        }),
        verifyOutputPaths: async () => undefined,
      }
    );
    if (outcome.status !== 'complete-training-only') {
      throw new Error('expected proposal-timeout quarantine completion');
    }
    expect(outcome).toMatchObject({
      completed_parents: 1,
      staged_result: {
        forced_parents_skipped: 1,
        forced_skip_reasons: {
          fewer_than_two_legal_moves: 0,
          search_timeout_no_label: 1,
        },
        emitted_parent_groups: 0,
      },
      manifest: {
        forced_skip_reasons: {
          fewer_than_two_legal_moves: 0,
          search_timeout_no_label: 1,
        },
        parent_completion: {
          forced_parents_skipped: 1,
          emitted_parent_groups: 0,
        },
      },
    });
    const workRows = parseJsonl<Record<string, unknown>>(
      await fs.promises.readFile(stage.work, 'utf8')
    );
    expect(workRows).toHaveLength(2);
    expect(workRows[1]).toMatchObject({
      kind: 'skip',
      parent_id: 'parent-a',
      reason: STRENGTH_FIRST_TIMEOUT_SKIP_REASON,
      timeout: {
        phase: 'proposal',
        requested_multipv: 2,
        requested_limit: { depth: 8 },
        searchmoves: [],
        timeout_ms: 25,
      },
    });
    expect(workRows[1]).not.toHaveProperty('records');
    expect(await fs.promises.readFile(stage.train, 'utf8')).toBe('');
  }, 15_000);

  it('quarantines only a typed incomplete proposal and validates its resume receipt', async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'sibling-proposal-incomplete-')
    );
    const raw = path.join(root, 'training.raw.jsonl');
    const stageRoot = path.join(root, 'stage');
    const stage = siblingTeacherStagePaths(stageRoot);
    await fs.promises.writeFile(raw, `${JSON.stringify(rawParent('parent-a'))}\n`);
    const input = await authenticatedInputFromRaw(raw, '89abcdef'.repeat(5));
    const dependencies = {
      verifyRevision: async (revision: string) => ({
        source_revision: revision,
        tracked_tree_clean: true as const,
      }),
      verifyOutputPaths: async () => undefined,
    };
    const options = {
      stageRoot,
      runnerRevision: PIPELINE_REVISION,
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE, '--incomplete-proposal'],
      engineReceipt: await writeEngineReceipt(root),
      authenticatedInputPolicy: 'fast-held-fd-v1',
      multipv: 2,
      depth: 8,
      proposalDepth: 6,
      engines: 1,
      timeoutMs: 5_000,
      targetParents: 1,
      finalize: true,
    };
    const outcome = await advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
      input,
      options,
      dependencies
    );
    if (outcome.status !== 'complete-training-only') {
      throw new Error('expected incomplete-proposal quarantine completion');
    }
    expect(outcome).toMatchObject({
      completed_parents: 1,
      staged_result: {
        forced_parents_skipped: 1,
        forced_skip_reasons: {
          fewer_than_two_legal_moves: 0,
          search_timeout_no_label: 0,
          proposal_incomplete_no_label: 1,
        },
        emitted_parent_groups: 0,
      },
      manifest: {
        authenticated_input: {
          runtime_policy: 'fast-held-fd-v1',
        },
        search: {
          limit: { depth: 8 },
          proposal_limit: { depth: 6 },
          proposal_incomplete_quarantine_policy:
            PROPOSAL_INCOMPLETE_QUARANTINE_POLICY,
        },
        forced_skip_reasons: {
          fewer_than_two_legal_moves: 0,
          search_timeout_no_label: 0,
          proposal_incomplete_no_label: 1,
        },
      },
    });
    const workRows = parseJsonl<Record<string, unknown>>(
      await fs.promises.readFile(stage.work, 'utf8')
    );
    expect(workRows).toHaveLength(2);
    expect(workRows[1]).toMatchObject({
      kind: 'skip',
      parent_id: 'parent-a',
      reason: STRENGTH_FIRST_PROPOSAL_INCOMPLETE_SKIP_REASON,
      legal_moves: 30,
      incomplete: {
        phase: 'proposal',
        requested_multipv: 2,
        requested_limit: { depth: 6 },
        final_exact_ranks: 1,
        final_cp_ranks: 1,
        final_mate_ranks: 0,
        missing_or_non_exact_ranks: 1,
      },
    });
    expect(workRows[1]).not.toHaveProperty('records');
    expect(await fs.promises.readFile(stage.train, 'utf8')).toBe('');

    const tampered = workRows.map((row) => ({ ...row }));
    const incomplete = tampered[1].incomplete as Record<string, unknown>;
    tampered[1].incomplete = { ...incomplete, final_cp_ranks: 0 };
    resealWorkEntry(tampered[1]);
    await fs.promises.writeFile(
      stage.work,
      `${tampered.map((row) => JSON.stringify(row)).join('\n')}\n`
    );
    await expect(
      advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
        input,
        options,
        dependencies
      )
    ).rejects.toThrow(/invalid proposal-incomplete skip metadata/);
  }, 15_000);

  it('keeps an incomplete independent rescore fatal and emits no skip receipt', async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'sibling-rescore-incomplete-')
    );
    const raw = path.join(root, 'training.raw.jsonl');
    const stageRoot = path.join(root, 'stage');
    const stage = siblingTeacherStagePaths(stageRoot);
    await fs.promises.writeFile(raw, `${JSON.stringify(rawParent('parent-a'))}\n`);
    const input = await authenticatedInputFromRaw(raw, '89abcdef'.repeat(5));
    await expect(
      advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
        input,
        {
          stageRoot,
          runnerRevision: PIPELINE_REVISION,
          engineBin: process.execPath,
          engineArgs: [FAKE_ENGINE, '--incomplete-rescore'],
          engineReceipt: await writeEngineReceipt(root),
          multipv: 2,
          depth: 8,
          proposalDepth: 6,
          engines: 1,
          timeoutMs: 5_000,
          targetParents: 1,
          finalize: true,
        },
        {
          verifyRevision: async (revision) => ({
            source_revision: revision,
            tracked_tree_clean: true,
          }),
          verifyOutputPaths: async () => undefined,
        }
      )
    ).rejects.toThrow(/wanted 1 ranks at depth 8; observed depths: 7/);
    const workRows = parseJsonl<Record<string, unknown>>(
      await fs.promises.readFile(stage.work, 'utf8')
    );
    expect(workRows).toHaveLength(1);
    expect(workRows[0]).toMatchObject({ kind: 'header' });
    await expect(fs.promises.access(stage.stagedResult)).rejects.toThrow();
  }, 15_000);

  it('kills a replacement whose initialization times out and fails without another skip or result', async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'sibling-replacement-init-timeout-')
    );
    const raw = path.join(root, 'training.raw.jsonl');
    const stageRoot = path.join(root, 'stage');
    const stage = siblingTeacherStagePaths(stageRoot);
    const environmentTrace = path.join(root, 'engine-environment.jsonl');
    const hangOnceMarker = path.join(root, 'hang-once.marker');
    await fs.promises.writeFile(
      raw,
      `${JSON.stringify(rawParent('parent-b'))}\n${JSON.stringify(rawParent('parent-a'))}\n`
    );
    const input = await authenticatedInputFromRaw(raw, '89abcdef'.repeat(5));
    await expect(
      advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
        input,
        {
          stageRoot,
          runnerRevision: PIPELINE_REVISION,
          engineBin: process.execPath,
          engineArgs: [
            FAKE_ENGINE,
            '--environment-trace',
            environmentTrace,
            '--hang-searchmove',
            '2g2f',
            '--hang-once-marker',
            hangOnceMarker,
            '--hang-usi-after-marker',
            hangOnceMarker,
          ],
          engineReceipt: await writeEngineReceipt(root),
          multipv: 2,
          depth: 8,
          engines: 1,
          timeoutMs: 25,
          testOnlyInitializationTimeoutMs: 3_000,
          targetParents: 2,
          finalize: true,
        },
        {
          verifyRevision: async (revision) => ({
            source_revision: revision,
            tracked_tree_clean: true,
          }),
          verifyOutputPaths: async () => undefined,
        }
      )
    ).rejects.toThrow(/USI timeout after 3000ms/);

    const workRows = parseJsonl<Record<string, unknown>>(
      await fs.promises.readFile(stage.work, 'utf8')
    );
    expect(
      workRows.filter(
        (row) => row.kind === 'skip' && row.reason === STRENGTH_FIRST_TIMEOUT_SKIP_REASON
      )
    ).toHaveLength(1);
    expect(workRows.some((row) => row.parent_id === 'parent-b')).toBe(false);
    await expect(fs.promises.access(stage.stagedResult)).rejects.toThrow();
    await expect(fs.promises.access(stage.train)).rejects.toThrow();

    const processes = parseJsonl<{ cwd: string; pid: number }>(
      await fs.promises.readFile(environmentTrace, 'utf8')
    );
    expect(processes.map((entry) => entry.cwd)).toEqual([
      expect.stringMatching(/\/cwd\/worker-0\/engine-0$/),
      expect.stringMatching(/\/cwd\/worker-0\/engine-1$/),
    ]);
    expect(processes.every((entry) => !processIsRunning(entry.pid))).toBe(true);
  }, 15_000);

  it('fails closed before recording a search timeout beyond the bounded prefix budget', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-timeout-cap-'));
    const raw = path.join(root, 'training.raw.jsonl');
    const stageRoot = path.join(root, 'stage');
    await fs.promises.writeFile(
      raw,
      `${JSON.stringify(rawParent('parent-b'))}\n${JSON.stringify(rawParent('parent-a'))}\n`
    );
    const input = await authenticatedInputFromRaw(raw, '89abcdef'.repeat(5));
    await expect(
      advanceStrengthFirstSiblingTeacherDatasetCoreForTests(
        input,
        {
          stageRoot,
          runnerRevision: PIPELINE_REVISION,
          engineBin: process.execPath,
          engineArgs: [FAKE_ENGINE, '--hang-searchmove', '2g2f'],
          engineReceipt: await writeEngineReceipt(root),
          multipv: 2,
          depth: 8,
          engines: 1,
          timeoutMs: 25,
          targetParents: 2,
          finalize: true,
        },
        {
          verifyRevision: async (revision) => ({
            source_revision: revision,
            tracked_tree_clean: true,
          }),
          verifyOutputPaths: async () => undefined,
        }
      )
    ).rejects.toThrow(/recoverable search skip limit 1 exhausted/);

    const workRows = parseJsonl<Record<string, unknown>>(
      await fs.promises.readFile(siblingTeacherStagePaths(stageRoot).work, 'utf8')
    );
    expect(
      workRows.filter(
        (row) => row.kind === 'skip' && row.reason === STRENGTH_FIRST_TIMEOUT_SKIP_REASON
      )
    ).toHaveLength(1);
    await expect(
      fs.promises.access(siblingTeacherStagePaths(stageRoot).stagedResult)
    ).rejects.toThrow();
  }, 15_000);

  it('re-scores played moves outside top-N, resumes deterministically, and emits no duplicates', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-teacher-'));
    const raw = path.join(root, 'parents.raw.jsonl');
    const outTrain = path.join(root, 'train.jsonl');
    const outVal = path.join(root, 'val.jsonl');
    const manifest = path.join(root, 'manifest.json');
    const work = path.join(root, 'work.jsonl');
    const engineReceipt = await writeEngineReceipt(root);
    // Intentionally reverse parent order; all final artifacts must sort parent_id.
    const rawText = `${JSON.stringify(rawParent('parent-b'))}\n${JSON.stringify(rawParent('parent-a'))}\n`;
    await fs.promises.writeFile(raw, rawText);

    const options = {
      raw,
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE],
      engineReceipt,
      multipv: 2,
      depth: 8,
      engines: 2,
      seed: 'resume-seed',
      valRatio: 0.25,
      outTrain,
      outVal,
      manifest,
      work,
      timeoutMs: 5_000,
    };
    const verifyRevision = vi.fn(async (revision: string) => ({
      source_revision: revision,
      tracked_tree_clean: true as const,
    }));
    const verifyOutputPaths = vi.fn(async () => undefined);
    const boundOptions = { ...options, pipelineRevision: PIPELINE_REVISION };
    const firstManifest = await generateSiblingTeacherDataset(boundOptions, {
      verifyRevision,
      verifyOutputPaths,
    });
    expect(verifyRevision).toHaveBeenCalledTimes(2);
    expect(verifyOutputPaths).toHaveBeenCalledTimes(2);
    const firstArtifacts = await Promise.all(
      [outTrain, outVal, manifest, work].map((file) => fs.promises.readFile(file, 'utf8'))
    );
    const allRecords = [
      ...parseJsonl<SiblingRecord>(firstArtifacts[0]),
      ...parseJsonl<SiblingRecord>(firstArtifacts[1]),
    ];

    expect(firstManifest.schema).toBe(SIBLING_TEACHER_MANIFEST_SCHEMA);
    expect(Object.keys(firstManifest).sort()).toEqual(
      [
        'schema',
        'record_manifest_schema',
        'pipeline',
        'source',
        'teacher',
        'search',
        'candidate_sets',
        'progress_checkpoint',
        'split',
        'outputs',
      ].sort()
    );
    expect(Object.keys(firstManifest.source).sort()).toEqual(
      ['raw_sha256', 'raw_records', 'selected_parents', 'selected_parent_ids_sha256'].sort()
    );
    expect(Object.keys(firstManifest.teacher).sort()).toEqual(
      [
        'engine_bin_sha256',
        'engine_bin_bytes',
        'engine_args',
        'engine_arg_files',
        'engine_receipt',
        'eval_sha256',
        'eval_files',
        'runtime_snapshot',
      ].sort()
    );
    expect(Object.keys(firstManifest.search).sort()).toEqual(
      [
        'multipv',
        'limit',
        'parallel_engines',
        'fv_scale',
        'hash_mb_per_engine',
        'timeout_ms',
        'exact_rescore_mode',
        'label_policy',
        'tt_reset_before_proposal',
        'tt_reset_before_each_candidate',
        'search_state_reset_before_proposal',
        'search_state_reset_before_each_candidate',
        'candidate_execution_order',
        'synthesized_rank_order',
        'engine_options',
      ].sort()
    );
    expectExactKeys(firstManifest.pipeline, ['source_revision', 'tracked_tree_clean']);
    expectExactKeys(firstManifest.teacher.engine_receipt, ['file', 'content']);
    expectExactKeys(firstManifest.teacher.engine_receipt.file, ['path', 'bytes', 'sha256']);
    for (const file of [
      ...firstManifest.teacher.engine_arg_files,
      ...firstManifest.teacher.eval_files,
    ]) {
      expectExactKeys(file, ['path', 'bytes', 'sha256']);
    }
    expectExactKeys(firstManifest.teacher.engine_receipt.content, [
      'schema',
      'source_repository',
      'source_commit',
      'source_commit_date',
      'build_directory',
      'build_command',
      'compiler',
      'compiler_target',
      'engine_id',
      'binary_bytes',
      'binary_sha256',
    ]);
    expectExactKeys(firstManifest.teacher.runtime_snapshot, [
      'engine_binary',
      'engine_argument_files',
      'eval_tree',
      'eval_options_file',
      'private_working_directory',
      'engine_argument_file_count',
      'eval_tree_present',
    ]);
    expectExactKeys(firstManifest.search.limit, ['depth']);
    expectExactKeys(firstManifest.search.engine_options, [
      'threads',
      'usi_own_book',
      'book_file',
      'network_delay_ms',
      'network_delay2_ms',
      'search_state_reset_trigger',
    ]);
    expectExactKeys(firstManifest.candidate_sets, [
      'sha256',
      'parents',
      'candidates',
      'min_candidates',
      'max_candidates',
      'skipped_parents',
    ]);
    expectExactKeys(firstManifest.progress_checkpoint, [
      'schema',
      'run_fingerprint',
      'entries',
      'completed_parents',
      'skipped_parents',
      'sha256',
    ]);
    expectExactKeys(firstManifest.split, [
      'schema',
      'record_schema',
      'schema_version',
      'split_seed',
      'val_ratio',
      'train_game_ids_sha256',
      'val_game_ids_sha256',
      'stats',
    ]);
    expectExactKeys(firstManifest.split.stats, [
      'input_records',
      'output_records',
      'input_parents',
      'output_parents',
      'input_games',
      'train_records',
      'val_records',
      'train_parents',
      'val_parents',
      'train_games',
      'val_games',
      'val_position_priority_dropped_records',
      'val_position_priority_dropped_parents',
      'val_child_position_priority_dropped_records',
      'val_child_position_priority_dropped_parents',
      'game_overlap',
      'position_overlap',
      'child_position_overlap',
    ]);
    expectExactKeys(firstManifest.outputs, [
      'train_sha256',
      'val_sha256',
      'train_bytes',
      'val_bytes',
    ]);
    expect(firstManifest.pipeline).toEqual({
      source_revision: PIPELINE_REVISION,
      tracked_tree_clean: true,
    });
    expect(firstManifest.source.raw_sha256).toBe(sha256(rawText));
    expect(firstManifest.source.raw_records).toBe(2);
    expect(firstManifest.source.selected_parents).toBe(2);
    expect(firstManifest.teacher.engine_bin_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(firstManifest.teacher.eval_sha256).toBeNull();
    expect(firstManifest.teacher.runtime_snapshot).toEqual({
      engine_binary: true,
      engine_argument_files: 'snapshotted-and-substituted',
      eval_tree: 'snapshotted',
      eval_options_file: 'rejected',
      private_working_directory: true,
      engine_argument_file_count: 1,
      eval_tree_present: false,
    });
    expect(firstManifest.search).toMatchObject({
      multipv: 2,
      limit: { depth: 8 },
      parallel_engines: 2,
      exact_rescore_mode: INDEPENDENT_EXACT_RESCORE_MODE,
      label_policy: SIBLING_TEACHER_LABEL_POLICY,
      tt_reset_before_proposal: true,
      tt_reset_before_each_candidate: true,
      search_state_reset_before_proposal: 'isready',
      search_state_reset_before_each_candidate: 'isready',
    });
    expect(firstManifest.candidate_sets).toMatchObject({
      parents: 2,
      candidates: 6,
      min_candidates: 3,
      max_candidates: 3,
      skipped_parents: 0,
    });
    expect(allRecords.map((record) => record.parent_id)).toEqual([
      'parent-a',
      'parent-a',
      'parent-a',
      'parent-b',
      'parent-b',
      'parent-b',
    ]);
    for (const parentId of ['parent-a', 'parent-b']) {
      const group = allRecords.filter((record) => record.parent_id === parentId);
      expect(group.map((record) => record.move)).toEqual(['7g7f', '2g2f', '6g6f']);
      expect(new Set(group.map((record) => record.move)).size).toBe(3);
      expect(group.find((record) => record.move === '6g6f')).toMatchObject({
        sources: ['played'],
        teacher_rank: 3,
        teacher_parent_cp: 220,
      });
      expect(group.filter((record) => record.sources.includes('teacher'))).toHaveLength(2);
    }

    const workRows = parseJsonl<Record<string, unknown>>(firstArtifacts[3]);
    expect(workRows[0]).toMatchObject({
      schema: SIBLING_TEACHER_WORK_SCHEMA,
      kind: 'header',
      pipeline: {
        source_revision: PIPELINE_REVISION,
        tracked_tree_clean: true,
      },
    });
    expect(workRows.slice(1).map((row) => row.parent_id)).toEqual(['parent-a', 'parent-b']);
    expect(workRows[1]).toMatchObject({
      candidate_moves: ['2g2f', '6g6f', '7g7f'],
      initial_search: { requested_multipv: 2, moves: ['7g7f', '2g2f'] },
      exact_search: {
        mode: INDEPENDENT_EXACT_RESCORE_MODE,
        candidate_count: 3,
        synthesized_rank1_move: '7g7f',
        moves: ['7g7f', '2g2f', '6g6f'],
        scores: [
          { move: '7g7f', cp: 260 },
          { move: '2g2f', cp: 220 },
          { move: '6g6f', cp: 220 },
        ],
        searches: [
          { requested_multipv: 1, bestmove: '2g2f', moves: ['2g2f'] },
          { requested_multipv: 1, bestmove: '6g6f', moves: ['6g6f'] },
          { requested_multipv: 1, bestmove: '7g7f', moves: ['7g7f'] },
        ],
        total_observed_nodes: 192,
      },
    });

    // Simulate an interruption: retain one completed parent and a torn final append.
    await fs.promises.writeFile(
      work,
      `${JSON.stringify(workRows[0])}\n${JSON.stringify(workRows[1])}\n{"schema":`
    );
    const secondManifest = await generateSiblingTeacherDataset(boundOptions, {
      verifyRevision,
      verifyOutputPaths,
    });
    const secondArtifacts = await Promise.all(
      [outTrain, outVal, manifest, work].map((file) => fs.promises.readFile(file, 'utf8'))
    );

    expect(secondManifest).toEqual(firstManifest);
    expect(secondArtifacts).toEqual(firstArtifacts);
  });

  it('resets before every candidate and executes independent searches in canonical order', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-independent-'));
    const raw = path.join(root, 'parents.raw.jsonl');
    const work = path.join(root, 'work.jsonl');
    const trace = path.join(root, 'engine-trace.jsonl');
    const engineReceipt = await writeEngineReceipt(root);
    await fs.promises.writeFile(raw, `${JSON.stringify(rawParent('parent-only'))}\n`);

    const manifest = await generateForTest({
      raw,
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE, '--trace', trace],
      engineReceipt,
      multipv: 2,
      depth: 8,
      engines: 1,
      outTrain: path.join(root, 'train.jsonl'),
      outVal: path.join(root, 'val.jsonl'),
      manifest: path.join(root, 'manifest.json'),
      work,
      timeoutMs: 5_000,
    });

    const events = parseJsonl<Record<string, unknown>>(await fs.promises.readFile(trace, 'utf8'));
    const searches = events.filter((event) => event.event === 'search');
    expect(events.filter((event) => event.event === 'ready')).toHaveLength(5);
    expect(searches).toHaveLength(4);
    expect(searches[0]).toMatchObject({ multipv: 2, searchmoves: [] });
    expect(searches.slice(1).map((event) => event.searchmoves)).toEqual([
      ['2g2f'],
      ['6g6f'],
      ['7g7f'],
    ]);
    for (let index = 1; index < events.length; index++) {
      if (events[index].event === 'search' && searches.indexOf(events[index]) > 0) {
        expect(events[index - 1]).toMatchObject({ event: 'ready' });
      }
    }

    const workRows = parseJsonl<Record<string, unknown>>(await fs.promises.readFile(work, 'utf8'));
    expect(workRows[1]).toMatchObject({
      candidate_moves: ['2g2f', '6g6f', '7g7f'],
      exact_search: {
        mode: INDEPENDENT_EXACT_RESCORE_MODE,
        moves: ['7g7f', '2g2f', '6g6f'],
        total_observed_nodes: 192,
      },
      records: [
        { move: '7g7f', teacher_rank: 1, teacher_parent_cp: 260 },
        { move: '2g2f', teacher_rank: 2, teacher_parent_cp: 220 },
        { move: '6g6f', teacher_rank: 3, teacher_parent_cp: 220 },
      ],
    });
    expect(manifest.search).toMatchObject({
      exact_rescore_mode: INDEPENDENT_EXACT_RESCORE_MODE,
      tt_reset_before_each_candidate: true,
      search_state_reset_before_each_candidate: 'isready',
    });
    expect(manifest.search).not.toHaveProperty('exact_rescore');
    expect(manifest.search).not.toHaveProperty('tt_reset_before_exact_rescore');
  });

  it('rejects resealed resume entries with corrupt independent-search derivations', async () => {
    const cases: Array<{
      name: string;
      mutate: (entry: Record<string, unknown>) => void;
      error: RegExp;
    }> = [
      {
        name: 'execution order',
        mutate: (entry) => {
          const exact = entry.exact_search as {
            searches: Record<string, unknown>[];
          };
          [exact.searches[0], exact.searches[1]] = [exact.searches[1], exact.searches[0]];
        },
        error: /canonical candidate order/,
      },
      {
        name: 'total nodes',
        mutate: (entry) => {
          const exact = entry.exact_search as { total_observed_nodes: number };
          exact.total_observed_nodes++;
        },
        error: /total_observed_nodes/,
      },
      {
        name: 'tie rank',
        mutate: (entry) => {
          const records = entry.records as Array<Record<string, unknown>>;
          records[1].teacher_rank = 3;
          records[2].teacher_rank = 2;
        },
        error: /disagrees with exact score metadata/,
      },
      {
        name: 'proposal limit',
        mutate: (entry) => {
          const initial = entry.initial_search as Record<string, unknown>;
          initial.requested_limit = { depth: 7 };
          initial.depth = 7;
          const exact = entry.exact_search as {
            searches: Array<Record<string, unknown>>;
          };
          for (const search of exact.searches) {
            search.requested_limit = { depth: 7 };
            search.depth = 7;
          }
        },
        error: /inconsistent candidate metadata/,
      },
      {
        name: 'proposal multipv',
        mutate: (entry) => {
          const initial = entry.initial_search as {
            requested_multipv: number;
            moves: string[];
            scores: Array<Record<string, unknown>>;
          };
          initial.requested_multipv = 1;
          initial.moves = initial.moves.slice(0, 1);
          initial.scores = initial.scores.slice(0, 1);
        },
        error: /inconsistent candidate metadata/,
      },
    ];

    for (const testCase of cases) {
      const root = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), `sibling-resume-${testCase.name}-`)
      );
      const raw = path.join(root, 'parents.raw.jsonl');
      const work = path.join(root, 'work.jsonl');
      const engineReceipt = await writeEngineReceipt(root);
      await fs.promises.writeFile(raw, `${JSON.stringify(rawParent('parent-resume'))}\n`);
      const options = {
        raw,
        engineBin: process.execPath,
        engineArgs: [FAKE_ENGINE],
        engineReceipt,
        multipv: 2,
        depth: 8,
        engines: 1,
        outTrain: path.join(root, 'train.jsonl'),
        outVal: path.join(root, 'val.jsonl'),
        manifest: path.join(root, 'manifest.json'),
        work,
        timeoutMs: 5_000,
      };
      await generateForTest(options);
      const rows = parseJsonl<Record<string, unknown>>(await fs.promises.readFile(work, 'utf8'));
      testCase.mutate(rows[1]);
      resealWorkEntry(rows[1]);
      await fs.promises.writeFile(work, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

      await expect(generateForTest(options), testCase.name).rejects.toThrow(testCase.error);
    }
  }, 15_000);

  it('rejects a resealed false skip for a parent with multiple legal moves', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-false-skip-'));
    const raw = path.join(root, 'parents.raw.jsonl');
    const work = path.join(root, 'work.jsonl');
    const engineReceipt = await writeEngineReceipt(root);
    await fs.promises.writeFile(raw, `${JSON.stringify(rawParent('parent-false-skip'))}\n`);
    const options = {
      raw,
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE],
      engineReceipt,
      multipv: 2,
      depth: 8,
      engines: 1,
      outTrain: path.join(root, 'train.jsonl'),
      outVal: path.join(root, 'val.jsonl'),
      manifest: path.join(root, 'manifest.json'),
      work,
      timeoutMs: 5_000,
    };
    await generateForTest(options);
    const rows = parseJsonl<Record<string, unknown>>(await fs.promises.readFile(work, 'utf8'));
    const falseSkip: Record<string, unknown> = {
      schema: rows[1].schema,
      kind: 'skip',
      run_fingerprint: rows[1].run_fingerprint,
      payload_sha256: '',
      parent_id: rows[1].parent_id,
      reason: 'fewer-than-two-legal-moves',
      legal_moves: 1,
    };
    resealWorkEntry(falseSkip);
    await fs.promises.writeFile(work, `${JSON.stringify(rows[0])}\n${JSON.stringify(falseSkip)}\n`);

    await expect(generateForTest(options)).rejects.toThrow(
      /skip legal_moves does not match its raw parent/
    );
  });

  it('requires one and only one deterministic search limit', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-limit-'));
    const raw = path.join(root, 'raw.jsonl');
    await fs.promises.writeFile(raw, `${JSON.stringify(rawParent('parent-limit'))}\n`);
    const base = {
      raw,
      engineBin: process.execPath,
      engineReceipt: path.join(root, 'receipt.json'),
      outTrain: path.join(root, 'train.jsonl'),
      outVal: path.join(root, 'val.jsonl'),
      manifest: path.join(root, 'manifest.json'),
      work: path.join(root, 'work.jsonl'),
    };
    await expect(generateForTest(base)).rejects.toThrow(/exactly one of nodes or depth/);
    await expect(generateForTest({ ...base, nodes: 100, depth: 8 })).rejects.toThrow(
      /exactly one of nodes or depth/
    );
    await expect(
      generateForTest({
        ...base,
        depth: 8,
        proposalNodes: 100,
        proposalDepth: 6,
      })
    ).rejects.toThrow(/at most one of proposalNodes or proposalDepth/);
  });

  it('keeps the legacy run fingerprint stable and binds a distinct proposal limit only when selected', () => {
    const legacy = {
      authenticated_training_binding: {
        result_receipt_bytes: 1,
        result_receipt_sha256: '1'.repeat(64),
        bundle_manifest_bytes: 2,
        bundle_manifest_sha256: '2'.repeat(64),
        bundle_producer_revision: '3'.repeat(40),
        verifier_revision: '4'.repeat(40),
        raw_format: 'jsonl',
        raw_bytes: 3,
        raw_sha256: '5'.repeat(64),
        records: 1,
        games: 1,
        game_ids_sha256: '6'.repeat(64),
        parent_ids_sha256: '7'.repeat(64),
        position_ids_count: 1,
        position_ids_sha256: '8'.repeat(64),
      },
      source_raw_sha256: '5'.repeat(64),
      selected_parent_ids_sha256: '7'.repeat(64),
      pipeline: {
        source_revision: '9'.repeat(40),
        tracked_tree_clean: true,
      },
      engine_bin_sha256: 'a'.repeat(64),
      engine_args: [],
      engine_arg_files: [],
      engine_receipt_sha256: 'b'.repeat(64),
      engine_receipt: { schema: 'fixture' },
      eval_sha256: 'c'.repeat(64),
      multipv: 12,
      limit: { depth: 16 },
      parallel_engines: 12,
      fv_scale: 20,
      hash_mb_per_engine: 512,
      timeout_ms: 600_000,
    } as unknown as Parameters<typeof siblingTeacherRunFingerprint>[0];

    expect(siblingTeacherRunFingerprint(legacy)).toBe(
      '3de9aa8a45954f040e2e886259d439eef6e3eddf07a55be629cd44730bd542a7'
    );
    expect(
      siblingTeacherRunFingerprint({
        ...legacy,
        proposal_limit: { depth: 14 },
      })
    ).not.toBe(siblingTeacherRunFingerprint(legacy));
    expect(
      siblingTeacherRunFingerprint({
        ...legacy,
        authenticated_input_policy: 'fast-held-fd-v1',
      })
    ).not.toBe(siblingTeacherRunFingerprint(legacy));
  });

  it('uses the split proposal limit while retaining the independent-rescore limit', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-split-limit-'));
    const raw = path.join(root, 'parents.raw.jsonl');
    const trace = path.join(root, 'engine-trace.jsonl');
    const work = path.join(root, 'work.jsonl');
    await fs.promises.writeFile(raw, `${JSON.stringify(rawParent('parent-split'))}\n`);

    const manifest = await generateForTest({
      raw,
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE, '--trace', trace],
      engineReceipt: await writeEngineReceipt(root),
      multipv: 2,
      depth: 8,
      proposalDepth: 6,
      engines: 1,
      outTrain: path.join(root, 'train.jsonl'),
      outVal: path.join(root, 'val.jsonl'),
      manifest: path.join(root, 'manifest.json'),
      work,
      timeoutMs: 5_000,
    });

    expect(manifest.search).toMatchObject({
      limit: { depth: 8 },
      proposal_limit: { depth: 6 },
      proposal_incomplete_quarantine_policy:
        PROPOSAL_INCOMPLETE_QUARANTINE_POLICY,
    });
    const searches = parseJsonl<Record<string, unknown>>(
      await fs.promises.readFile(trace, 'utf8')
    ).filter((event) => event.event === 'search');
    expect(searches[0]).toMatchObject({ multipv: 2, depth: 6, searchmoves: [] });
    expect(searches.slice(1)).toHaveLength(3);
    expect(searches.slice(1).every((search) => search.depth === 8)).toBe(true);
    const workRows = parseJsonl<Record<string, unknown>>(
      await fs.promises.readFile(work, 'utf8')
    );
    expect(workRows[1]).toMatchObject({
      initial_search: { requested_limit: { depth: 6 } },
      exact_search: {
        searches: [
          { requested_limit: { depth: 8 } },
          { requested_limit: { depth: 8 } },
          { requested_limit: { depth: 8 } },
        ],
      },
    });
  });

  it('caps initial MultiPV to legal moves, resets TT at the parent boundary, and skips forced moves', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-cap-'));
    const engine = path.join(root, 'cap-fake-engine.mjs');
    await fs.promises.writeFile(
      engine,
      `import readline from 'node:readline';
let multipv = 1;
let readyCalls = 0;
let searches = 0;
const moveScores = new Map([['8h7i', 90], ['8h8g', 60]]);
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (line === 'usi') { console.log('usiok'); return; }
  if (line === 'isready') { readyCalls++; console.log('readyok'); return; }
  const multi = line.match(/^setoption name MultiPV value (\\d+)$/);
  if (multi) { multipv = Number(multi[1]); return; }
  if (line === 'quit') process.exit(0);
  if (!line.startsWith('go ')) return;
  if (readyCalls < searches + 2) { console.error('missing parent TT reset'); process.exit(9); }
  searches++;
  const requested = line.match(/\\bsearchmoves (.+)$/)?.[1].trim().split(/\\s+/) ?? ['8h7i', '8h8g'];
  const moves = requested.slice(0, multipv);
  const depth = Number(line.match(/\\bdepth (\\d+)/)?.[1] ?? 4);
  moves.forEach((move, index) => console.log(
    \`info depth \${depth} multipv \${index + 1} score cp \${moveScores.get(move) ?? 30} nodes 10 pv \${move}\`
  ));
  console.log(\`bestmove \${moves[0]}\`);
});
`
    );
    const raw = path.join(root, 'raw.jsonl');
    const rows = [
      {
        schema_version: 1,
        game_id: 'game-forced',
        parent_id: 'parent-forced',
        position_id: positionKeyFromSfen(ONE_LEGAL),
        parent_sfen: ONE_LEGAL,
        ply: 106,
        played_move: '8h5h',
      },
      {
        schema_version: 1,
        game_id: 'game-two',
        parent_id: 'parent-two',
        position_id: positionKeyFromSfen(TWO_LEGAL),
        parent_sfen: TWO_LEGAL,
        ply: 118,
        played_move: '8h7i',
      },
    ];
    await fs.promises.writeFile(raw, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
    const work = path.join(root, 'work.jsonl');
    const engineReceipt = await writeEngineReceipt(root);
    const result = await generateForTest({
      raw,
      engineBin: process.execPath,
      engineArgs: [engine],
      engineReceipt,
      multipv: 12,
      depth: 4,
      engines: 1,
      outTrain: path.join(root, 'train.jsonl'),
      outVal: path.join(root, 'val.jsonl'),
      manifest: path.join(root, 'manifest.json'),
      work,
      timeoutMs: 5_000,
    });

    expect(result.candidate_sets).toMatchObject({
      parents: 1,
      candidates: 2,
      min_candidates: 2,
      max_candidates: 2,
      skipped_parents: 1,
    });
    const workRows = parseJsonl<Record<string, unknown>>(await fs.promises.readFile(work, 'utf8'));
    expect(workRows[1]).toMatchObject({
      kind: 'skip',
      parent_id: 'parent-forced',
      reason: 'fewer-than-two-legal-moves',
      legal_moves: 1,
    });
    expect(workRows[2]).toMatchObject({
      kind: 'parent',
      parent_id: 'parent-two',
      candidate_moves: ['8h7i', '8h8g'],
      initial_search: { requested_multipv: 2 },
      exact_search: {
        mode: INDEPENDENT_EXACT_RESCORE_MODE,
        candidate_count: 2,
        moves: ['8h7i', '8h8g'],
        searches: [
          { requested_multipv: 1, moves: ['8h7i'] },
          { requested_multipv: 1, moves: ['8h8g'] },
        ],
        total_observed_nodes: 20,
      },
    });
  });

  it('treats optional bishop non-promotion as a rules-complete legal sibling candidate', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-decline-'));
    const engine = path.join(root, 'decline-fake-engine.mjs');
    await fs.promises.writeFile(
      engine,
      `import readline from 'node:readline';
let multipv = 1;
const moves = ['5e3c+', '5e3c'];
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (line === 'usi') { console.log('usiok'); return; }
  if (line === 'isready') { console.log('readyok'); return; }
  const multi = line.match(/^setoption name MultiPV value (\\d+)$/);
  if (multi) { multipv = Number(multi[1]); return; }
  if (line === 'quit') process.exit(0);
  if (!line.startsWith('go ')) return;
  const requested = line.match(/\\bsearchmoves (.+)$/)?.[1].trim().split(/\\s+/) ?? moves;
  requested.slice(0, multipv).forEach((move, index) => console.log(
    \`info depth 4 multipv \${index + 1} score cp \${80 - index * 10} nodes 10 pv \${move}\`
  ));
  console.log(\`bestmove \${requested[0]}\`);
});
`
    );
    const parentSfen = '4k4/9/9/9/4B4/9/9/9/K8 b - 1';
    const raw = path.join(root, 'raw.jsonl');
    await fs.promises.writeFile(
      raw,
      `${JSON.stringify({
        ...rawParent('parent-decline'),
        position_id: positionKeyFromSfen(parentSfen),
        parent_sfen: parentSfen,
        played_move: '5e3c',
      })}\n`
    );
    const work = path.join(root, 'work.jsonl');
    const result = await generateForTest({
      raw,
      engineBin: process.execPath,
      engineArgs: [engine],
      engineReceipt: await writeEngineReceipt(root),
      multipv: 2,
      depth: 4,
      engines: 1,
      outTrain: path.join(root, 'train.jsonl'),
      outVal: path.join(root, 'val.jsonl'),
      manifest: path.join(root, 'manifest.json'),
      work,
      timeoutMs: 5_000,
    });

    expect(result.candidate_sets).toMatchObject({
      parents: 1,
      candidates: 2,
      min_candidates: 2,
      max_candidates: 2,
      skipped_parents: 0,
    });
    const workRows = parseJsonl<Record<string, unknown>>(await fs.promises.readFile(work, 'utf8'));
    expect(workRows[1]).toMatchObject({
      candidate_moves: ['5e3c', '5e3c+'],
      records: [{ move: '5e3c' }, { move: '5e3c+' }],
    });
  });

  it('requires a schema-valid receipt tied to the exact engine binary', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-receipt-'));
    const raw = path.join(root, 'raw.jsonl');
    await fs.promises.writeFile(raw, `${JSON.stringify(rawParent('parent-a'))}\n`);
    const engineReceipt = await writeEngineReceipt(root);
    const receipt = JSON.parse(await fs.promises.readFile(engineReceipt, 'utf8')) as Record<
      string,
      unknown
    >;
    const options = {
      raw,
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE],
      engineReceipt,
      depth: 8,
      outTrain: path.join(root, 'train.jsonl'),
      outVal: path.join(root, 'val.jsonl'),
      manifest: path.join(root, 'manifest.json'),
      work: path.join(root, 'work.jsonl'),
    };
    receipt.source_commit = 'not-a-full-git-id';
    await fs.promises.writeFile(engineReceipt, `${JSON.stringify(receipt)}\n`);

    await expect(generateForTest(options)).rejects.toThrow(/source_commit/);

    receipt.source_commit = PIPELINE_REVISION;
    receipt.unexpected = true;
    await fs.promises.writeFile(engineReceipt, `${JSON.stringify(receipt)}\n`);
    await expect(generateForTest(options)).rejects.toThrow(/exactly the v1 keys/);

    delete receipt.unexpected;
    receipt.compiler = ' test compiler ';
    await fs.promises.writeFile(engineReceipt, `${JSON.stringify(receipt)}\n`);
    await expect(generateForTest(options)).rejects.toThrow(/surrounding whitespace/);
  });

  it('runs workers only from immutable engine, argument-file, and eval snapshots', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-runtime-snapshot-'));
    const engineScript = path.join(root, 'snapshot-engine.mjs');
    const scoreFile = path.join(root, 'score.txt');
    const evalDir = path.join(root, 'eval');
    const evalFile = path.join(evalDir, 'weights.txt');
    const trace = path.join(root, 'trace.jsonl');
    await fs.promises.mkdir(evalDir);
    await fs.promises.writeFile(scoreFile, '100\n');
    await fs.promises.writeFile(evalFile, '1\n');
    await fs.promises.writeFile(path.join(evalDir, 'z.bin'), 'z');
    await fs.promises.writeFile(path.join(evalDir, 'é.bin'), 'accent');
    await fs.promises.writeFile(
      engineScript,
      `import fs from 'node:fs';
import readline from 'node:readline';
let multipv = 1;
let evalDir = '';
let searches = 0;
const scoreFile = process.argv[2];
const value = (prefix) => process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
const originalScore = value('--mutate-score=');
const originalEval = value('--mutate-eval=');
const trace = value('--trace=');
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (line === 'usi') { console.log('usiok'); return; }
  if (line === 'isready') { console.log('readyok'); return; }
  if (line === 'quit') process.exit(0);
  const multi = line.match(/^setoption name MultiPV value (\\d+)$/);
  if (multi) { multipv = Number(multi[1]); return; }
  const evalOption = line.match(/^setoption name EvalDir value (.+)$/);
  if (evalOption) { evalDir = evalOption[1]; return; }
  if (!line.startsWith('go ')) return;
  const searchmoves = line.match(/\\bsearchmoves (.+)$/)?.[1].trim().split(/\\s+/) ?? [];
  const moves = (searchmoves.length ? searchmoves : ['7g7f', '2g2f']).slice(0, multipv);
  const depth = Number(line.match(/\\bdepth (\\d+)/)?.[1] ?? 8);
  const cp = Number(fs.readFileSync(scoreFile, 'utf8')) +
    Number(fs.readFileSync(evalDir + '/weights.txt', 'utf8'));
  searches++;
    fs.appendFileSync(trace, JSON.stringify({
      engine_bin: process.execPath,
      engine_script: process.argv[1],
      score_file: scoreFile,
      eval_dir: evalDir,
      cwd: process.cwd(),
      write_bits: [process.execPath, process.argv[1], scoreFile, evalDir + '/weights.txt']
        .map((file) => fs.statSync(file).mode & 0o222),
      cp,
  }) + '\\n');
  if (searches === 1) {
    fs.writeFileSync(originalScore, '900\\n');
    fs.writeFileSync(originalEval, '900\\n');
  }
  moves.forEach((move, index) => console.log(
    \`info depth \${depth} multipv \${index + 1} score cp \${cp} nodes 10 pv \${move}\`
  ));
  console.log(\`bestmove \${moves[0]}\`);
});
`
    );
    const raw = path.join(root, 'raw.jsonl');
    const work = path.join(root, 'work.jsonl');
    await fs.promises.writeFile(raw, `${JSON.stringify(rawParent('parent-snapshot'))}\n`);
    const engineReceipt = await writeEngineReceipt(root);

    const manifest = await generateForTest({
      raw,
      engineBin: process.execPath,
      engineArgs: [
        engineScript,
        scoreFile,
        `--mutate-score=${scoreFile}`,
        `--mutate-eval=${evalFile}`,
        `--trace=${trace}`,
      ],
      engineReceipt,
      evalDir,
      multipv: 2,
      depth: 8,
      engines: 1,
      outTrain: path.join(root, 'train.jsonl'),
      outVal: path.join(root, 'val.jsonl'),
      manifest: path.join(root, 'manifest.json'),
      work,
      timeoutMs: 5_000,
    });

    expect(await fs.promises.readFile(scoreFile, 'utf8')).toBe('900\n');
    expect(await fs.promises.readFile(evalFile, 'utf8')).toBe('900\n');
    const events = parseJsonl<{
      engine_bin: string;
      engine_script: string;
      score_file: string;
      eval_dir: string;
      cwd: string;
      write_bits: number[];
      cp: number;
    }>(await fs.promises.readFile(trace, 'utf8'));
    expect(events).toHaveLength(4);
    expect(events.every((event) => event.cp === 101)).toBe(true);
    for (const field of ['engine_bin', 'engine_script', 'score_file', 'eval_dir', 'cwd'] as const) {
      expect(events[0][field]).toContain('shogi-teacher-runtime-');
    }
    expect(events[0].cwd).toMatch(/\/cwd\/worker-0\/engine-0$/);
    expect(events[0].write_bits).toEqual([0, 0, 0, 0]);
    await expect(fs.promises.access(events[0].engine_bin)).rejects.toThrow();
    const workRows = parseJsonl<Record<string, unknown>>(await fs.promises.readFile(work, 'utf8'));
    const exact = workRows[1].exact_search as { scores: Array<{ cp: number }> };
    expect(exact.scores.every((score) => score.cp === 101)).toBe(true);
    expect(manifest.teacher.runtime_snapshot).toMatchObject({
      engine_argument_file_count: 2,
      eval_tree_present: true,
    });
    expect(manifest.teacher.eval_files.map((file) => file.path)).toEqual([
      'weights.txt',
      'z.bin',
      'é.bin',
    ]);
    for (const file of [...manifest.teacher.engine_arg_files, ...manifest.teacher.eval_files]) {
      expectExactKeys(file, ['path', 'bytes', 'sha256']);
    }
  });

  it('rejects eval_options.txt instead of allowing mutable option overrides', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-eval-options-'));
    const raw = path.join(root, 'raw.jsonl');
    const evalDir = path.join(root, 'eval');
    await fs.promises.mkdir(evalDir);
    await fs.promises.writeFile(raw, `${JSON.stringify(rawParent('parent-eval-options'))}\n`);
    await fs.promises.writeFile(path.join(evalDir, 'nn.bin'), 'weights');
    await fs.promises.writeFile(path.join(evalDir, 'eval_options.txt'), 'Threads=8\n');
    const engineReceipt = await writeEngineReceipt(root);

    await expect(
      generateForTest({
        raw,
        engineBin: process.execPath,
        engineArgs: [FAKE_ENGINE],
        engineReceipt,
        evalDir,
        depth: 8,
        outTrain: path.join(root, 'train.jsonl'),
        outVal: path.join(root, 'val.jsonl'),
        manifest: path.join(root, 'manifest.json'),
        work: path.join(root, 'work.jsonl'),
      })
    ).rejects.toThrow(/eval_options\.txt/);
  });
});
