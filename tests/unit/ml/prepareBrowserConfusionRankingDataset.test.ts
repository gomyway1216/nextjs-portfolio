import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ALL_LEGAL_RESCORE_POLICY,
  BROWSER_CONFUSION_PARENT_SCHEMA,
  BROWSER_CONFUSION_RECEIPT_SCHEMA,
  BROWSER_CONFUSION_SELECTION_POLICY,
  INCOMPLETE_PARENT_POLICY,
} from '../../../ml/build-browser-confusion-ranking-teacher';
import {
  BROWSER_CONFUSION_DATASET_MANIFEST_SCHEMA,
  BROWSER_CONFUSION_DATASET_STATUS,
  canonicalJson,
  prepareBrowserConfusionRankingDatasetCoreForTests,
  runCli,
} from '../../../ml/prepare-browser-confusion-ranking-dataset';
import {
  assignGameSplit,
  buildSiblingGroup,
  compareBytewise,
  positionKeyFromSfen,
  type SiblingRecord,
} from '../../../ml/sibling-data';
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from '../../../ml/shogi-sfen';
import { USI_TEACHER_ENGINE_CONTRACT } from '../../../ml/usi-engine';
import { mateToCp } from '../../../ml/usi-multipv';

const START = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
const SEED = 'browser-confusion-ranking-test-seed';
const VAL_RATIO = 0.35;

interface Identity {
  path: string;
  bytes: number;
  sha256: string;
}

interface Assets {
  source: Identity;
  audit: Identity & { schema: string; declared_rows: number };
  wasm: Identity;
  weights: Identity;
  engine: Identity;
  evalDir: string;
  evalTree: { files: number; bytes: number; sha256: string };
  sourceRows: ReadonlyMap<number, SourceSpec>;
}

interface SourceSpec {
  line: number;
  sfen: string;
  gameId: string;
}

interface GroupFixture {
  records: SiblingRecord[];
  evidence: Record<string, unknown>;
  sourceLine: number;
}

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function identity(file: string): Identity {
  const payload = fs.readFileSync(file);
  return { path: path.resolve(file), bytes: payload.byteLength, sha256: digest(payload) };
}

function write(file: string, text: string): Identity {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return identity(file);
}

function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-confusion-prep-'));
  temporaryRoots.push(value);
  return value;
}

function assets(base: string, sourceSpecs: readonly SourceSpec[]): Assets {
  const sourceRows = new Map(sourceSpecs.map((spec) => [spec.line, spec]));
  if (sourceRows.size !== sourceSpecs.length || sourceRows.size === 0) {
    throw new Error('source specs must have unique physical lines');
  }
  const declaredRows = Math.max(...sourceRows.keys());
  const sourceText = `${Array.from({ length: declaredRows }, (_unused, index) => {
    const line = index + 1;
    const spec = sourceRows.get(line) ?? { line, sfen: START, gameId: `filler-${line}` };
    const parsed = positionFromSfen(spec.sfen);
    const bestmove = rulesCompleteLegalMoves(parsed.position)[0].usi;
    return canonicalJson({
      sfen: spec.sfen,
      cp: 21,
      ply: parsed.moveNumber - 1,
      bestmove,
      depth: 12,
      game_id: spec.gameId,
      position_id: positionKeyFromSfen(spec.sfen),
    });
  }).join('\n')}\n`;
  const source = write(path.join(base, 'assets', 'source.jsonl'), sourceText);
  const auditValue = {
    schema: 'audited-source-v1',
    output: { bytes: source.bytes, sha256: source.sha256, rows: declaredRows },
  };
  const auditBase = write(
    path.join(base, 'assets', 'source.manifest.json'),
    `${canonicalJson(auditValue)}\n`
  );
  const wasm = write(path.join(base, 'assets', 'shogi.wasm'), 'wasm-fixture');
  const weights = write(path.join(base, 'assets', 'weights.bin'), 'weights-fixture');
  const engine = write(path.join(base, 'assets', 'engine'), 'engine-fixture');
  const evalDir = path.join(base, 'assets', 'eval');
  const evalFile = write(path.join(evalDir, 'nested', 'nn.bin'), 'eval-fixture');
  const relative = 'nested/nn.bin';
  const evalTreeHash = createHash('sha256')
    .update('browser-confusion-eval-tree-v1\0')
    .update(`${relative}\0${evalFile.bytes}\0${evalFile.sha256}\n`)
    .digest('hex');
  return {
    source,
    audit: { ...auditBase, schema: 'audited-source-v1', declared_rows: declaredRows },
    wasm,
    weights,
    engine,
    evalDir,
    evalTree: { files: 1, bytes: evalFile.bytes, sha256: evalTreeHash },
    sourceRows,
  };
}

function gameFor(role: 'train' | 'val', suffix: string): string {
  for (let index = 0; index < 100_000; index += 1) {
    const candidate = `${suffix}-${index}`;
    if (assignGameSplit(candidate, { seed: SEED, valRatio: VAL_RATIO }) === role) {
      return candidate;
    }
  }
  throw new Error(`could not construct a ${role} game id`);
}

function expectedParentId(fixtureAssets: Assets, sourceLine: number, sfen: string): string {
  const positionId = positionKeyFromSfen(sfen);
  return `sha256:${digest(
    `browser-confusion-parent-v1\0${fixtureAssets.source.sha256}\0${sourceLine}\0${positionId}`
  )}`;
}

function semanticSet(sfen: string): Set<string> {
  const legal = rulesCompleteLegalMoves(positionFromSfen(sfen).position);
  return new Set([
    positionKeyFromSfen(sfen),
    ...legal.map((entry) => positionKeyFromSfen(childSfenAfterUsi(sfen, entry.usi))),
  ]);
}

function isolatedPositions(count: number): string[] {
  const queue = [START];
  const enqueued = new Set([positionKeyFromSfen(START)]);
  const used = new Set<string>();
  const selected: string[] = [];
  while (queue.length > 0 && selected.length < count && enqueued.size < 20_000) {
    const sfen = queue.shift() as string;
    const legal = rulesCompleteLegalMoves(positionFromSfen(sfen).position);
    if (legal.length >= 2) {
      const semantic = semanticSet(sfen);
      if ([...semantic].every((positionId) => !used.has(positionId))) {
        selected.push(sfen);
        semantic.forEach((positionId) => used.add(positionId));
      }
    }
    for (const entry of legal.slice(0, 4)) {
      const child = childSfenAfterUsi(sfen, entry.usi);
      const childId = positionKeyFromSfen(child);
      if (!enqueued.has(childId)) {
        enqueued.add(childId);
        queue.push(child);
      }
    }
  }
  if (selected.length !== count) throw new Error(`only constructed ${selected.length}/${count} positions`);
  return selected;
}

function group(
  sfen: string,
  gameId: string,
  label: string,
  sourceLine: number,
  fixtureAssets: Assets,
  scoreOffset = 0,
  mode?: 'mate-first' | 'tie-first-two'
): GroupFixture {
  const parsed = positionFromSfen(sfen);
  const legalMoves = rulesCompleteLegalMoves(parsed.position)
    .map((entry) => entry.usi)
    .sort(compareBytewise);
  const sourceSpec = fixtureAssets.sourceRows.get(sourceLine);
  if (!sourceSpec || sourceSpec.sfen !== sfen || sourceSpec.gameId !== gameId) {
    throw new Error(`group ${label} does not match its physical source row`);
  }
  const positionId = positionKeyFromSfen(sfen);
  const parentDigest = digest(
    `browser-confusion-parent-v1\0${fixtureAssets.source.sha256}\0${sourceLine}\0${positionId}`
  );
  const parentId = `sha256:${parentDigest}`;
  const candidates = legalMoves.map((move, index) => {
    const childSfen = childSfenAfterUsi(sfen, move);
    const isMate = mode === 'mate-first' && index === 0;
    const teacherParentCp = isMate
      ? mateToCp(3, 1)
      : 1000 + scoreOffset - (mode === 'tie-first-two' && index === 1 ? 0 : index);
    const childLegal = rulesCompleteLegalMoves(positionFromSfen(childSfen).position);
    return {
      move,
      child_sfen: childSfen,
      teacher_child_cp: -teacherParentCp,
      teacher_parent_cp: teacherParentCp,
      teacher_rank: index + 1,
      score_kind: isMate ? ('mate' as const) : ('cp' as const),
      ...(isMate ? { mate: 3, mate_sign: 1 as const } : {}),
      completed_depth: 12,
      termination: 'requested-depth-complete' as const,
      observed_nodes: 100 + index,
      pv: [childLegal[0].usi],
    };
  });
  const records = buildSiblingGroup(
    {
      game_id: gameId,
      parent_id: parentId,
      position_id: positionId,
      parent_sfen: sfen,
      parent_ply: parsed.moveNumber - 1,
    },
    candidates.map((candidate) => ({
      move: candidate.move,
      child_sfen: candidate.child_sfen,
      sources: ['all-legal-fixed-depth-teacher'],
      teacher_parent_cp: candidate.teacher_parent_cp,
      teacher_rank: candidate.teacher_rank,
      teacher_score_kind: candidate.score_kind,
      teacher_mate: candidate.mate,
      teacher_mate_sign: candidate.mate_sign,
    }))
  );
  return {
    sourceLine,
    records,
    evidence: {
      parent: {
        schema: BROWSER_CONFUSION_PARENT_SCHEMA,
        source_line: sourceLine,
        game_id: gameId,
        parent_id: parentId,
        position_id: positionId,
        parent_sfen: sfen,
        parent_ply: parsed.moveNumber - 1,
        source_teacher: { cp: 21, bestmove: legalMoves[0], depth: 12 },
        browser: {
          bestmove: legalMoves[1],
          score: 7,
          completed_depth: 4,
          nodes: 99,
          leaves: 55,
        },
        legal_moves: legalMoves,
      },
      candidates,
      records,
    },
  };
}

function createShard(
  directory: string,
  index: number,
  total: number,
  groups: GroupFixture[],
  fixtureAssets: Assets
): void {
  fs.mkdirSync(directory, { recursive: true });
  for (const fixture of groups) {
    if ((fixture.sourceLine - 1) % total !== index) {
      throw new Error(`fixture source line does not belong to ${index}/${total}`);
    }
  }
  const records = groups.flatMap((fixture) => fixture.records);
  const ranking = write(
    path.join(directory, 'ranking.jsonl'),
    `${records.map(canonicalJson).join('\n')}\n`
  );
  const parents = write(
    path.join(directory, 'parents.jsonl'),
    `${groups.map((fixture) => canonicalJson(fixture.evidence)).join('\n')}\n`
  );
  const candidateCounts = groups.map((fixture) => fixture.records.length);
  const scannedRows = Math.max(...groups.map((fixture) => fixture.sourceLine));
  const receipt = {
    schema: BROWSER_CONFUSION_RECEIPT_SCHEMA,
    status: BROWSER_CONFUSION_DATASET_STATUS,
    selection_policy: BROWSER_CONFUSION_SELECTION_POLICY,
    label_policy: ALL_LEGAL_RESCORE_POLICY,
    incomplete_parent_policy: INCOMPLETE_PARENT_POLICY,
    source: {
      ...fixtureAssets.source,
      audit_manifest: fixtureAssets.audit,
      scanned_rows: scannedRows,
      shard_eligible_rows: groups.length,
      rejected_invalid_rows: 0,
      rejected_forced_rows: 0,
      rejected_browser_incomplete_rows: 0,
      rejected_teacher_incomplete_parents: 0,
      browser_agreements: 0,
    },
    selection_shard: { index, total },
    browser: {
      wasm: fixtureAssets.wasm,
      weights: fixtureAssets.weights,
      scale_k: 600,
      output_scale: [1, 1],
      fixed_depth: 4,
      quiescence_depth: 8,
      max_time_ms: 0,
    },
    teacher: {
      engine: fixtureAssets.engine,
      eval_tree: fixtureAssets.evalTree,
      fixed_depth: 12,
      multipv: 1,
      search_mode: 'unrestricted-search-from-each-legal-child-position',
      reset_before_each_candidate: true,
      terminal_mate_before_requested_depth: 'accepted-by-pinned-usi-accumulator',
      candidate_order: 'utf8-bytewise-ascending',
      rank_order: 'parent-cp-descending-then-utf8-bytewise-move',
      engine_contract: USI_TEACHER_ENGINE_CONTRACT,
    },
    output: {
      dataset: {
        ...ranking,
        schema: 'shogi-sibling-v1',
        parents: groups.length,
        games: new Set(records.map((record) => record.game_id)).size,
        records: records.length,
        min_candidates: Math.min(...candidateCounts),
        max_candidates: Math.max(...candidateCounts),
      },
      parent_evidence: {
        ...parents,
        schema: BROWSER_CONFUSION_PARENT_SCHEMA,
        records: groups.length,
      },
    },
  };
  write(path.join(directory, 'receipt.json'), `${canonicalJson(receipt)}\n`);
}

function readReceipt(directory: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(directory, 'receipt.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

function rewriteReceipt(directory: string, receipt: Record<string, unknown>): void {
  fs.writeFileSync(path.join(directory, 'receipt.json'), `${canonicalJson(receipt)}\n`);
}

function prepare(
  base: string,
  shardDirs: string[],
  fixtureAssets: Assets,
  parityPositions = 1,
  expectedParentCounts?: readonly number[]
): Promise<Record<string, unknown>> {
  return prepareBrowserConfusionRankingDatasetCoreForTests(
    {
      shardDirs,
      evalDir: fixtureAssets.evalDir,
      expectedParentCounts:
        expectedParentCounts ??
        shardDirs.map((directory) => {
          const receipt = readReceipt(directory);
          return ((receipt.output as { dataset: { parents: number } }).dataset).parents;
        }),
      splitSeed: SEED,
      valRatio: VAL_RATIO,
      parityPositions,
      outDir: path.join(base, `prepared-${digest(shardDirs.join('|')).slice(0, 8)}`),
    },
    async (source, destination, sourceHandle) => {
      try {
        await fs.promises.lstat(destination);
        throw new Error(`test exclusive rename destination exists: ${destination}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      const sourceStat = await sourceHandle.stat({ bigint: true });
      await fs.promises.rename(source, destination);
      return {
        contract: 'darwin-renameatx-np-excl-nofollow-any-held-parent-source-v2',
        trust_boundary: 'trusted-current-euid-writer-private-0700-parent-v1',
        status: 'verified-committed',
        parent_identity: { dev: sourceStat.dev, ino: sourceStat.ino },
        destination_identity: { dev: sourceStat.dev, ino: sourceStat.ino },
      };
    }
  );
}

describe('browser-confusion ranking dataset preparation', () => {
  it('accepts an arbitrary complete shard count and emits isolated deterministic outputs', async () => {
    const base = root();
    const positions = isolatedPositions(5);
    const games = {
      s0Train: gameFor('train', 's0-train'),
      s0Val: gameFor('val', 's0-val'),
      s1Train: gameFor('train', 's1-train'),
      s1Val: gameFor('val', 's1-val'),
      s2Train: gameFor('train', 's2-train'),
    };
    const fixtureAssets = assets(base, [
      { line: 1, sfen: positions[0], gameId: games.s0Train },
      { line: 2, sfen: positions[2], gameId: games.s1Train },
      { line: 3, sfen: positions[4], gameId: games.s2Train },
      { line: 4, sfen: positions[1], gameId: games.s0Val },
      { line: 5, sfen: positions[3], gameId: games.s1Val },
    ]);
    const shardDirs = [0, 1, 2].map((index) => path.join(base, `batch3-v2-${index}`));
    createShard(
      shardDirs[0],
      0,
      3,
      [
        group(positions[0], games.s0Train, 's0-train', 1, fixtureAssets),
        group(positions[1], games.s0Val, 's0-val', 4, fixtureAssets),
      ],
      fixtureAssets
    );
    createShard(
      shardDirs[1],
      1,
      3,
      [
        group(positions[2], games.s1Train, 's1-train', 2, fixtureAssets),
        group(positions[3], games.s1Val, 's1-val', 5, fixtureAssets),
      ],
      fixtureAssets
    );
    createShard(
      shardDirs[2],
      2,
      3,
      [group(positions[4], games.s2Train, 's2-train', 3, fixtureAssets)],
      fixtureAssets
    );

    const manifest = await prepare(base, shardDirs, fixtureAssets, 2);
    expect(manifest.schema).toBe(BROWSER_CONFUSION_DATASET_MANIFEST_SCHEMA);
    expect(manifest.live_weight_write_authorized).toBe(false);
    expect((manifest.input as { shards: unknown[] }).shards).toHaveLength(3);
    expect((manifest.input as { shards: Array<{ index: number; total: number }> }).shards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ index: 0, total: 3 }),
        expect.objectContaining({ index: 1, total: 3 }),
        expect.objectContaining({ index: 2, total: 3 }),
      ])
    );
    expect((manifest.accounting as Record<string, number>).train_validation_semantic_union_overlap).toBe(
      0
    );
    const output = manifest.output as Record<string, Identity & Record<string, number>>;
    expect(fs.existsSync(output.train.path)).toBe(true);
    expect(fs.existsSync(output.validation.path)).toBe(true);
    expect(fs.readFileSync(output.parity64.path, 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it('fails closed on missing/wrong shard index and malformed --shards values', async () => {
    const base = root();
    const positions = isolatedPositions(2);
    const indexTrain = gameFor('train', 'index-train');
    const indexVal = gameFor('val', 'index-val');
    const fixtureAssets = assets(base, [
      { line: 1, sfen: positions[0], gameId: indexTrain },
      { line: 2, sfen: positions[1], gameId: indexVal },
    ]);
    const shardDirs = [path.join(base, 'batch3-v2-0'), path.join(base, 'batch3-v2-1')];
    createShard(
      shardDirs[0],
      0,
      2,
      [group(positions[0], indexTrain, 'index-train', 1, fixtureAssets)],
      fixtureAssets
    );
    createShard(
      shardDirs[1],
      1,
      2,
      [group(positions[1], indexVal, 'index-val', 2, fixtureAssets)],
      fixtureAssets
    );
    await expect(prepare(base, shardDirs, fixtureAssets, 1, [125, 1])).rejects.toThrow(
      /parent count is 1, expected 125/
    );
    const receipt = readReceipt(shardDirs[1]);
    (receipt.selection_shard as Record<string, unknown>).index = 0;
    rewriteReceipt(shardDirs[1], receipt);
    await expect(prepare(base, shardDirs, fixtureAssets)).rejects.toThrow(/does not bind 1\/2/);

    await expect(
      runCli([
        '--shard-prefix',
        path.join(base, 'batch3-v2-'),
        '--shards',
        '0',
        '--parents-per-shard',
        '125',
        '--eval-dir',
        fixtureAssets.evalDir,
        '--split-seed',
        SEED,
        '--val-ratio',
        String(VAL_RATIO),
        '--out-dir',
        path.join(base, 'invalid-cli'),
      ])
    ).rejects.toThrow(/--shards/);
  });

  it('does not replace an output directory that wins the publication race', async () => {
    const base = root();
    const positions = isolatedPositions(2);
    const trainGame = gameFor('train', 'publish-train');
    const valGame = gameFor('val', 'publish-val');
    const fixtureAssets = assets(base, [
      { line: 1, sfen: positions[0], gameId: trainGame },
      { line: 2, sfen: positions[1], gameId: valGame },
    ]);
    const shardDirs = [path.join(base, 'batch3-v2-0'), path.join(base, 'batch3-v2-1')];
    createShard(
      shardDirs[0],
      0,
      2,
      [group(positions[0], trainGame, 'publish-train', 1, fixtureAssets)],
      fixtureAssets
    );
    createShard(
      shardDirs[1],
      1,
      2,
      [group(positions[1], valGame, 'publish-val', 2, fixtureAssets)],
      fixtureAssets
    );
    const outDir = path.join(base, `prepared-${digest(shardDirs.join('|')).slice(0, 8)}`);
    fs.mkdirSync(outDir);
    fs.writeFileSync(path.join(outDir, 'winner.txt'), 'keep-me');

    await expect(prepare(base, shardDirs, fixtureAssets)).rejects.toThrow(/destination exists/);
    expect(fs.readFileSync(path.join(outDir, 'winner.txt'), 'utf8')).toBe('keep-me');
  });

  it.each([
    ['dataset hash', (receipt: Record<string, unknown>) => {
      const output = receipt.output as { dataset: Record<string, unknown> };
      output.dataset.sha256 = '0'.repeat(64);
    }, /sha256 does not match/],
    ['browser depth', (receipt: Record<string, unknown>) => {
      (receipt.browser as Record<string, unknown>).fixed_depth = 3;
    }, /browser depth/],
    ['row accounting', (receipt: Record<string, unknown>) => {
      const output = receipt.output as { dataset: Record<string, unknown> };
      output.dataset.records = (output.dataset.records as number) + 1;
    }, /output accounting/],
    ['external weight identity', (receipt: Record<string, unknown>) => {
      const browser = receipt.browser as { weights: Record<string, unknown> };
      browser.weights.sha256 = '0'.repeat(64);
    }, /receipt\.browser\.weights\.sha256 does not match/],
    ['eval tree identity', (receipt: Record<string, unknown>) => {
      const teacher = receipt.teacher as { eval_tree: Record<string, unknown> };
      teacher.eval_tree.sha256 = '0'.repeat(64);
    }, /receipt\.teacher\.eval_tree/],
    ['browser scale', (receipt: Record<string, unknown>) => {
      (receipt.browser as Record<string, unknown>).scale_k = 0;
    }, /browser\.scale_k/],
    ['browser quiescence depth', (receipt: Record<string, unknown>) => {
      (receipt.browser as Record<string, unknown>).quiescence_depth = 0;
    }, /browser\.quiescence_depth/],
    ['teacher search mode', (receipt: Record<string, unknown>) => {
      (receipt.teacher as Record<string, unknown>).search_mode = 'root-searchmoves';
    }, /teacher\.search_mode/],
    ['teacher terminal policy', (receipt: Record<string, unknown>) => {
      (receipt.teacher as Record<string, unknown>).terminal_mate_before_requested_depth = 'reject';
    }, /terminal_mate_before_requested_depth/],
    ['teacher candidate order', (receipt: Record<string, unknown>) => {
      (receipt.teacher as Record<string, unknown>).candidate_order = 'locale';
    }, /candidate_order/],
    ['teacher rank order', (receipt: Record<string, unknown>) => {
      (receipt.teacher as Record<string, unknown>).rank_order = 'move-only';
    }, /rank_order/],
  ])('rejects tampered %s evidence', async (_label, mutate, expected) => {
    const base = root();
    const positions = isolatedPositions(2);
    const tamperTrain = gameFor('train', 'tamper-train');
    const tamperVal = gameFor('val', 'tamper-val');
    const fixtureAssets = assets(base, [
      { line: 1, sfen: positions[0], gameId: tamperTrain },
      { line: 2, sfen: positions[1], gameId: tamperVal },
    ]);
    const shardDirs = [path.join(base, 'batch3-v2-0'), path.join(base, 'batch3-v2-1')];
    createShard(
      shardDirs[0],
      0,
      2,
      [group(positions[0], tamperTrain, 'tamper-train', 1, fixtureAssets)],
      fixtureAssets
    );
    createShard(
      shardDirs[1],
      1,
      2,
      [group(positions[1], tamperVal, 'tamper-val', 2, fixtureAssets)],
      fixtureAssets
    );
    const receipt = readReceipt(shardDirs[0]);
    mutate(receipt);
    rewriteReceipt(shardDirs[0], receipt);
    await expect(prepare(base, shardDirs, fixtureAssets)).rejects.toThrow(expected);
  });

  it('rejects parent candidate evidence that is not one-to-one exact-depth ranking evidence', async () => {
    const base = root();
    const positions = isolatedPositions(2);
    const candidateTrain = gameFor('train', 'candidate-train');
    const candidateVal = gameFor('val', 'candidate-val');
    const fixtureAssets = assets(base, [
      { line: 1, sfen: positions[0], gameId: candidateTrain },
      { line: 2, sfen: positions[1], gameId: candidateVal },
    ]);
    const shardDirs = [path.join(base, 'batch3-v2-0'), path.join(base, 'batch3-v2-1')];
    createShard(
      shardDirs[0],
      0,
      2,
      [group(positions[0], candidateTrain, 'candidate-train', 1, fixtureAssets)],
      fixtureAssets
    );
    createShard(
      shardDirs[1],
      1,
      2,
      [group(positions[1], candidateVal, 'candidate-val', 2, fixtureAssets)],
      fixtureAssets
    );
    const parentsPath = path.join(shardDirs[0], 'parents.jsonl');
    const envelope = JSON.parse(fs.readFileSync(parentsPath, 'utf8')) as {
      candidates: Array<Record<string, unknown>>;
    };
    envelope.candidates[0].completed_depth = 11;
    fs.writeFileSync(parentsPath, `${canonicalJson(envelope)}\n`);
    const receipt = readReceipt(shardDirs[0]);
    const output = receipt.output as { parent_evidence: Record<string, unknown> };
    Object.assign(output.parent_evidence, identity(parentsPath));
    rewriteReceipt(shardDirs[0], receipt);

    await expect(prepare(base, shardDirs, fixtureAssets)).rejects.toThrow(
      /did not complete teacher depth/
    );
  });

  it('re-derives the audited manifest from its actual JSON bytes', async () => {
    const base = root();
    const positions = isolatedPositions(2);
    const trainGame = gameFor('train', 'audit-train');
    const valGame = gameFor('val', 'audit-val');
    const fixtureAssets = assets(base, [
      { line: 1, sfen: positions[0], gameId: trainGame },
      { line: 2, sfen: positions[1], gameId: valGame },
    ]);
    const shardDirs = [path.join(base, 'batch3-v2-0'), path.join(base, 'batch3-v2-1')];
    createShard(
      shardDirs[0],
      0,
      2,
      [group(positions[0], trainGame, 'audit-train', 1, fixtureAssets)],
      fixtureAssets
    );
    createShard(
      shardDirs[1],
      1,
      2,
      [group(positions[1], valGame, 'audit-val', 2, fixtureAssets)],
      fixtureAssets
    );
    const auditValue = JSON.parse(fs.readFileSync(fixtureAssets.audit.path, 'utf8')) as {
      output: Record<string, number>;
    };
    auditValue.output.bytes += 1;
    fs.writeFileSync(fixtureAssets.audit.path, `${canonicalJson(auditValue)}\n`);
    const changedAuditIdentity = identity(fixtureAssets.audit.path);
    for (const directory of shardDirs) {
      const receipt = readReceipt(directory);
      const source = receipt.source as { audit_manifest: Record<string, unknown> };
      Object.assign(source.audit_manifest, changedAuditIdentity);
      rewriteReceipt(directory, receipt);
    }

    await expect(prepare(base, shardDirs, fixtureAssets)).rejects.toThrow(
      /source manifest output identity does not match/
    );
  });

  it.each([
    ['source teacher binding', (envelope: { parent: Record<string, unknown> }) => {
      const teacher = envelope.parent.source_teacher as Record<string, number>;
      teacher.cp += 1;
    }, /source_teacher does not match/],
    ['legal PV replay', (envelope: { candidates: Array<Record<string, unknown>> }) => {
      envelope.candidates[0].pv = ['9z9z'];
    }, /pv\[0\] is illegal/],
  ])('rejects tampered %s in selected-parent evidence', async (_label, mutate, expected) => {
    const base = root();
    const positions = isolatedPositions(2);
    const trainGame = gameFor('train', 'source-bind-train');
    const valGame = gameFor('val', 'source-bind-val');
    const fixtureAssets = assets(base, [
      { line: 1, sfen: positions[0], gameId: trainGame },
      { line: 2, sfen: positions[1], gameId: valGame },
    ]);
    const shardDirs = [path.join(base, 'batch3-v2-0'), path.join(base, 'batch3-v2-1')];
    createShard(
      shardDirs[0],
      0,
      2,
      [group(positions[0], trainGame, 'source-bind-train', 1, fixtureAssets)],
      fixtureAssets
    );
    createShard(
      shardDirs[1],
      1,
      2,
      [group(positions[1], valGame, 'source-bind-val', 2, fixtureAssets)],
      fixtureAssets
    );
    const parentsPath = path.join(shardDirs[0], 'parents.jsonl');
    const envelope = JSON.parse(fs.readFileSync(parentsPath, 'utf8')) as {
      parent: Record<string, unknown>;
      candidates: Array<Record<string, unknown>>;
    };
    mutate(envelope);
    fs.writeFileSync(parentsPath, `${canonicalJson(envelope)}\n`);
    const receipt = readReceipt(shardDirs[0]);
    const output = receipt.output as { parent_evidence: Record<string, unknown> };
    Object.assign(output.parent_evidence, identity(parentsPath));
    rewriteReceipt(shardDirs[0], receipt);

    await expect(prepare(base, shardDirs, fixtureAssets)).rejects.toThrow(expected);
  });

  it('accepts parent-view mate signs and rejects equal-cp ranks that ignore bytewise move order', async () => {
    const mateBase = root();
    const positions = isolatedPositions(2);
    const mateTrain = gameFor('train', 'mate-train');
    const mateVal = gameFor('val', 'mate-val');
    const mateAssets = assets(mateBase, [
      { line: 1, sfen: positions[0], gameId: mateTrain },
      { line: 2, sfen: positions[1], gameId: mateVal },
    ]);
    const mateDirs = [path.join(mateBase, 'batch3-v2-0'), path.join(mateBase, 'batch3-v2-1')];
    createShard(
      mateDirs[0],
      0,
      2,
      [group(positions[0], mateTrain, 'mate-train', 1, mateAssets, 0, 'mate-first')],
      mateAssets
    );
    createShard(
      mateDirs[1],
      1,
      2,
      [group(positions[1], mateVal, 'mate-val', 2, mateAssets)],
      mateAssets
    );
    const mateManifest = await prepare(mateBase, mateDirs, mateAssets);
    const mateOutput = mateManifest.output as Record<string, Identity>;
    const mateRows = fs
      .readFileSync(mateOutput.train.path, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as SiblingRecord);
    expect(mateRows[0]).toMatchObject({
      teacher_score_kind: 'mate',
      teacher_mate: 3,
      teacher_mate_sign: 1,
      teacher_parent_cp: mateToCp(3, 1),
      teacher_child_cp: -mateToCp(3, 1),
    });

    const tieBase = root();
    const tieTrain = gameFor('train', 'tie-train');
    const tieVal = gameFor('val', 'tie-val');
    const tieAssets = assets(tieBase, [
      { line: 1, sfen: positions[0], gameId: tieTrain },
      { line: 2, sfen: positions[1], gameId: tieVal },
    ]);
    const tieDirs = [path.join(tieBase, 'batch3-v2-0'), path.join(tieBase, 'batch3-v2-1')];
    createShard(
      tieDirs[0],
      0,
      2,
      [group(positions[0], tieTrain, 'tie-train', 1, tieAssets, 0, 'tie-first-two')],
      tieAssets
    );
    createShard(
      tieDirs[1],
      1,
      2,
      [group(positions[1], tieVal, 'tie-val', 2, tieAssets)],
      tieAssets
    );
    const parentsPath = path.join(tieDirs[0], 'parents.jsonl');
    const envelope = JSON.parse(fs.readFileSync(parentsPath, 'utf8')) as {
      candidates: Array<Record<string, unknown>>;
      records: Array<Record<string, unknown>>;
    };
    for (const rows of [envelope.candidates, envelope.records]) {
      rows[0].teacher_rank = 2;
      rows[1].teacher_rank = 1;
      rows.sort((left, right) => (left.teacher_rank as number) - (right.teacher_rank as number));
    }
    fs.writeFileSync(parentsPath, `${canonicalJson(envelope)}\n`);
    const rankingPath = path.join(tieDirs[0], 'ranking.jsonl');
    const ranking = fs
      .readFileSync(rankingPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    ranking[0].teacher_rank = 2;
    ranking[1].teacher_rank = 1;
    ranking.sort(
      (left, right) => (left.teacher_rank as number) - (right.teacher_rank as number)
    );
    fs.writeFileSync(rankingPath, `${ranking.map(canonicalJson).join('\n')}\n`);
    const receipt = readReceipt(tieDirs[0]);
    const output = receipt.output as {
      dataset: Record<string, unknown>;
      parent_evidence: Record<string, unknown>;
    };
    Object.assign(output.dataset, identity(rankingPath));
    Object.assign(output.parent_evidence, identity(parentsPath));
    rewriteReceipt(tieDirs[0], receipt);

    await expect(prepare(tieBase, tieDirs, tieAssets)).rejects.toThrow(
      /ranks violate parent-cp\/move byte order/
    );
  });

  it('canonically deduplicates identical position content and rejects conflicting duplicates', async () => {
    const base = root();
    const positions = isolatedPositions(3);
    const games = {
      duplicateA: gameFor('train', 'duplicate-a'),
      duplicateB: gameFor('train', 'duplicate-b'),
      val: gameFor('val', 'dedupe-val'),
      train: gameFor('train', 'dedupe-train'),
    };
    const fixtureAssets = assets(base, [
      { line: 1, sfen: positions[0], gameId: games.duplicateA },
      { line: 2, sfen: positions[0], gameId: games.duplicateB },
      { line: 3, sfen: positions[1], gameId: games.val },
      { line: 4, sfen: positions[2], gameId: games.train },
    ]);
    const shardDirs = [path.join(base, 'batch3-v2-0'), path.join(base, 'batch3-v2-1')];
    createShard(
      shardDirs[0],
      0,
      2,
      [
        group(positions[0], games.duplicateA, 'duplicate-a', 1, fixtureAssets),
        group(positions[1], games.val, 'dedupe-val', 3, fixtureAssets),
      ],
      fixtureAssets
    );
    createShard(
      shardDirs[1],
      1,
      2,
      [
        group(positions[0], games.duplicateB, 'duplicate-b', 2, fixtureAssets),
        group(positions[2], games.train, 'dedupe-train', 4, fixtureAssets),
      ],
      fixtureAssets
    );
    const manifest = await prepare(base, shardDirs, fixtureAssets);
    const accounting = manifest.accounting as Record<string, number>;
    expect(accounting.duplicate_position_parents_removed).toBe(1);
    expect(accounting.duplicate_position_records_removed).toBeGreaterThan(1);
    const output = manifest.output as Record<string, Record<string, number>>;
    expect(accounting.input_records).toBe(
      accounting.duplicate_position_records_removed +
        accounting.semantic_conflict_training_records_removed +
        output.train.records +
        output.validation.records
    );

    const conflictBase = root();
    const conflictGames = {
      a: gameFor('train', 'conflict-a'),
      b: gameFor('train', 'conflict-b'),
      val: gameFor('val', 'conflict-val'),
    };
    const conflictAssets = assets(conflictBase, [
      { line: 1, sfen: positions[0], gameId: conflictGames.a },
      { line: 2, sfen: positions[0], gameId: conflictGames.b },
      { line: 4, sfen: positions[1], gameId: conflictGames.val },
    ]);
    const conflictDirs = [
      path.join(conflictBase, 'batch3-v2-0'),
      path.join(conflictBase, 'batch3-v2-1'),
    ];
    createShard(
      conflictDirs[0],
      0,
      2,
      [group(positions[0], conflictGames.a, 'conflict-a', 1, conflictAssets)],
      conflictAssets
    );
    createShard(
      conflictDirs[1],
      1,
      2,
      [
        group(positions[0], conflictGames.b, 'conflict-b', 2, conflictAssets, 10),
        group(positions[1], conflictGames.val, 'conflict-val', 4, conflictAssets),
      ],
      conflictAssets
    );
    await expect(prepare(conflictBase, conflictDirs, conflictAssets)).rejects.toThrow(
      /conflicting duplicate parent content/
    );
  });

  it('retains a validation duplicate even when the train peer has the lower canonical parent id', async () => {
    const base = root();
    const positions = isolatedPositions(2);
    const duplicatePosition = positions[0];
    const safeTrainPosition = positions[1];
    let fixtureAssets: Assets | undefined;
    let trainGame = '';
    let valGame = '';
    let safeTrainGame = '';
    for (let attempt = 0; attempt < 100; attempt += 1) {
      trainGame = gameFor('train', `priority-train-${attempt}`);
      valGame = gameFor('val', `priority-val-${attempt}`);
      safeTrainGame = gameFor('train', `priority-safe-${attempt}`);
      const candidate = assets(base, [
        { line: 1, sfen: duplicatePosition, gameId: trainGame },
        { line: 2, sfen: duplicatePosition, gameId: valGame },
        { line: 3, sfen: safeTrainPosition, gameId: safeTrainGame },
      ]);
      if (
        compareBytewise(
          expectedParentId(candidate, 1, duplicatePosition),
          expectedParentId(candidate, 2, duplicatePosition)
        ) < 0
      ) {
        fixtureAssets = candidate;
        break;
      }
    }
    if (!fixtureAssets) throw new Error('could not construct canonical train-first duplicate fixture');
    const shardDirs = [path.join(base, 'batch3-v2-0'), path.join(base, 'batch3-v2-1')];
    createShard(
      shardDirs[0],
      0,
      2,
      [
        group(duplicatePosition, trainGame, 'priority-train', 1, fixtureAssets),
        group(safeTrainPosition, safeTrainGame, 'priority-safe', 3, fixtureAssets),
      ],
      fixtureAssets
    );
    createShard(
      shardDirs[1],
      1,
      2,
      [group(duplicatePosition, valGame, 'priority-val', 2, fixtureAssets)],
      fixtureAssets
    );

    const manifest = await prepare(base, shardDirs, fixtureAssets);
    const output = manifest.output as Record<string, Identity>;
    const validationRows = fs
      .readFileSync(output.validation.path, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as SiblingRecord);
    expect(new Set(validationRows.map((row) => row.position_id))).toContain(
      positionKeyFromSfen(duplicatePosition)
    );
    expect(new Set(validationRows.map((row) => row.game_id))).toContain(valGame);
  });

  it('gives validation semantic-union priority and drops the whole crossing train group', async () => {
    const base = root();
    const startMove = rulesCompleteLegalMoves(positionFromSfen(START).position)[0].usi;
    const validationParent = childSfenAfterUsi(START, startMove);
    const blocked = new Set([...semanticSet(START), ...semanticSet(validationParent)]);
    const isolatedTrain = isolatedPositions(10).find((sfen) =>
      [...semanticSet(sfen)].every((positionId) => !blocked.has(positionId))
    );
    if (!isolatedTrain) throw new Error('could not construct the safe train fixture');
    const games = {
      crossingTrain: gameFor('train', 'crossing-train'),
      crossingVal: gameFor('val', 'crossing-val'),
      safeTrain: gameFor('train', 'safe-train'),
    };
    const fixtureAssets = assets(base, [
      { line: 1, sfen: START, gameId: games.crossingTrain },
      { line: 2, sfen: validationParent, gameId: games.crossingVal },
      { line: 3, sfen: isolatedTrain, gameId: games.safeTrain },
    ]);
    const shardDirs = [
      path.join(base, 'batch3-v2-0'),
      path.join(base, 'batch3-v2-1'),
      path.join(base, 'batch3-v2-2'),
    ];
    createShard(
      shardDirs[0],
      0,
      3,
      [group(START, games.crossingTrain, 'crossing-train', 1, fixtureAssets)],
      fixtureAssets
    );
    createShard(
      shardDirs[1],
      1,
      3,
      [group(validationParent, games.crossingVal, 'crossing-val', 2, fixtureAssets)],
      fixtureAssets
    );
    createShard(
      shardDirs[2],
      2,
      3,
      [group(isolatedTrain, games.safeTrain, 'safe-train', 3, fixtureAssets)],
      fixtureAssets
    );

    const manifest = await prepare(base, shardDirs, fixtureAssets);
    const accounting = manifest.accounting as Record<string, number>;
    expect(accounting.semantic_conflict_training_parents_removed).toBe(1);
    expect(accounting.train_validation_semantic_union_overlap).toBe(0);
  });
});
