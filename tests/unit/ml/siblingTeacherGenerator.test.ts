import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import {
  INDEPENDENT_EXACT_RESCORE_MODE,
  SIBLING_TEACHER_MANIFEST_SCHEMA,
  SIBLING_TEACHER_LABEL_POLICY,
  SIBLING_TEACHER_WORK_SCHEMA,
  generateSiblingTeacherDataset,
  type GenerateSiblingTeacherOptions,
} from '../../../ml/generate-sibling-teacher';
import { positionKeyFromSfen, type SiblingRecord } from '../../../ml/sibling-data';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_ENGINE = path.resolve(HERE, '../../fixtures/ml/fake-usi-engine.mjs');
const START = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
const TWO_LEGAL = 'ln4nn1/2r3gk1/3p2gp1/2s1R3S/p1p2P2p/3P2PL1/P+pSS1G1L1/1K7/LN6+b b G5Pb3p 119';
const ONE_LEGAL = '1+R3l2l/4+Pgk2/1s2p1sp1/p3np2p/3B3N1/P1G3S2/1P2+pP2P/1R2+n4/L+b2K1GNL b GS2P5p 107';
const PIPELINE_REVISION = '0123456789abcdef0123456789abcdef01234567';

async function generateForTest(
  options: Omit<GenerateSiblingTeacherOptions, 'pipelineRevision'> & { pipelineRevision?: string }
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
  await fs.promises.writeFile(receipt, `${JSON.stringify({
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
  })}\n`);
  return receipt;
}

function rawParent(parentId: string): Record<string, unknown> {
  return {
    schema_version: 1,
    source: 'wcsc',
    site: '第36回世界コンピュータ将棋選手権',
    start_time: '2026/05/05 09:00:00',
    end_time: '2026/05/05 09:01:00',
    time_control: '900+5',
    game_id: 'game-shared',
    parent_id: parentId,
    position_id: positionKeyFromSfen(START),
    parent_sfen: START,
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

describe('deterministic sibling teacher generator', () => {
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
      pipeline: { source_revision: PIPELINE_REVISION, tracked_tree_clean: true },
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
          const exact = entry.exact_search as { searches: Record<string, unknown>[] };
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
    ];

    for (const testCase of cases) {
      const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), `sibling-resume-${testCase.name}-`));
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
  });

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
    const base = {
      raw: path.join(root, 'raw.jsonl'),
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

  it('requires a schema-valid receipt tied to the exact engine binary', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sibling-receipt-'));
    const raw = path.join(root, 'raw.jsonl');
    await fs.promises.writeFile(raw, `${JSON.stringify(rawParent('parent-a'))}\n`);
    const engineReceipt = await writeEngineReceipt(root);
    const receipt = JSON.parse(await fs.promises.readFile(engineReceipt, 'utf8')) as Record<string, unknown>;
    receipt.source_commit = 'not-a-full-git-id';
    await fs.promises.writeFile(engineReceipt, `${JSON.stringify(receipt)}\n`);

    await expect(generateForTest({
      raw,
      engineBin: process.execPath,
      engineArgs: [FAKE_ENGINE],
      engineReceipt,
      depth: 8,
      outTrain: path.join(root, 'train.jsonl'),
      outVal: path.join(root, 'val.jsonl'),
      manifest: path.join(root, 'manifest.json'),
      work: path.join(root, 'work.jsonl'),
    })).rejects.toThrow(/source_commit/);
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
    expect(events[0].cwd).toMatch(/\/cwd\/worker-0$/);
    expect(events[0].write_bits).toEqual([0, 0, 0, 0]);
    await expect(fs.promises.access(events[0].engine_bin)).rejects.toThrow();
    const workRows = parseJsonl<Record<string, unknown>>(await fs.promises.readFile(work, 'utf8'));
    const exact = workRows[1].exact_search as { scores: Array<{ cp: number }> };
    expect(exact.scores.every((score) => score.cp === 101)).toBe(true);
    expect(manifest.teacher.runtime_snapshot).toMatchObject({
      engine_argument_file_count: 2,
      eval_tree_present: true,
    });
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

    await expect(generateForTest({
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
    })).rejects.toThrow(/eval_options\.txt/);
  });
});
