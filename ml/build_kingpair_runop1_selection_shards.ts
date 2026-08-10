import { createHash } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

import {
  SELECTION_HEADER_SCHEMA,
  SELECTION_ROW_SCHEMA,
  type SelectionHeader,
  type SelectionRow,
} from './generate_kingpair_aoba_teacher_shards';
import { positionKeyFromSfen } from './sibling-data';
import { positionFromSfen, rulesCompleteLegalMoves } from './shogi-sfen';

const DEFAULT_SOURCE =
  '/Users/yudaiyaguchi/.codex/shogi-data/wcsc36-sealed-training-inputs/runOp1-train.jsonl';
const DEFAULT_PROTOCOL = join(__dirname, 'protocols', 'kingpair-interaction-nnue-10m-fast-v1-plan.json');
const EXPECTED_SOURCE_SHA256 = '2207eba555fc0109fe2842ff8f92cb08d42e47893d9aabd863b3f552371a56cb';
const EXPECTED_SOURCE_ROWS = 5_892_192;
const TARGET_DEFAULT = 900_000;
const SHARD_ROWS_DEFAULT = 256;
const BUCKETS = 4096;
const CANDIDATE_MARGIN_NUMERATOR = 11;
const CANDIDATE_MARGIN_DENOMINATOR = 10;
const PRIORITY_DOMAIN = 'kingpair-10m-fast-aoba-unused-runop1-parent-v1\0';
const GAME_DOMAIN = 'kingpair-10m-fast-runop1-position-game-v1\0';

export const MANIFEST_SCHEMA = 'shogi-kingpair-aoba-runop1-selection-manifest-v1';

interface Options {
  readonly source: string;
  readonly protocol: string;
  readonly outputRoot: string;
  readonly target: number;
  readonly shardRows: number;
  readonly allowUnpinnedFixture: boolean;
}

interface Candidate {
  readonly priority: string;
  readonly positionId: string;
  readonly sfen: string;
  readonly ply: number;
}

interface RawRunOp1Row {
  readonly sfen?: unknown;
  readonly ply?: unknown;
  readonly cp?: unknown;
  readonly depth?: unknown;
  readonly bestmove?: unknown;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(path: string): string {
  return sha256(readFileSync(path));
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`);
  }
  return value as number;
}

function parseOptions(argv: readonly string[]): Options {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (key === '--allow-unpinned-fixture') {
      values.set('allow-unpinned-fixture', 'true');
      continue;
    }
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('arguments must be --key value pairs');
    values.set(key.slice(2), value);
    index++;
  }
  const target = integer(Number(values.get('target') ?? TARGET_DEFAULT), '--target', 1);
  const shardRows = integer(Number(values.get('shard-rows') ?? SHARD_ROWS_DEFAULT), '--shard-rows', 1);
  const output = values.get('output-root');
  if (!output) throw new Error('--output-root is required');
  return {
    source: resolve(values.get('source') ?? DEFAULT_SOURCE),
    protocol: resolve(values.get('protocol') ?? DEFAULT_PROTOCOL),
    outputRoot: resolve(output),
    target,
    shardRows,
    allowUnpinnedFixture: values.get('allow-unpinned-fixture') === 'true',
  };
}

function parseRow(line: string, lineNumber: number): { sfen: string; ply: number } | null {
  let record: RawRunOp1Row;
  try {
    record = JSON.parse(line) as RawRunOp1Row;
  } catch {
    return null;
  }
  if (
    typeof record.sfen !== 'string' || record.sfen.length === 0 ||
    !Number.isSafeInteger(record.ply) || (record.ply as number) < 0 ||
    typeof record.cp !== 'number' || !Number.isFinite(record.cp) ||
    !Number.isSafeInteger(record.depth) || (record.depth as number) < 1 ||
    typeof record.bestmove !== 'string' || record.bestmove.length === 0
  ) {
    return null;
  }
  try {
    positionFromSfen(record.sfen);
  } catch {
    return null;
  }
  if (lineNumber < 1) throw new Error('lineNumber invariant failed');
  return { sfen: record.sfen, ply: record.ply as number };
}

function priorityFor(positionId: string): string {
  return sha256(`${PRIORITY_DOMAIN}${positionId}`);
}

function priorityBucket(priority: string): number {
  return Number.parseInt(priority.slice(0, 3), 16);
}

async function lines(path: string, consume: (line: string, lineNumber: number) => void): Promise<number> {
  const stream = createReadStream(path, { encoding: 'utf8' });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of reader) {
    lineNumber++;
    consume(line, lineNumber);
  }
  return lineNumber;
}

export function cutoffBucketForCounts(counts: readonly number[], target: number): number {
  if (counts.length !== BUCKETS) throw new Error(`expected ${BUCKETS} priority buckets`);
  integer(target, 'target', 1);
  const wanted = Math.ceil((target * CANDIDATE_MARGIN_NUMERATOR) / CANDIDATE_MARGIN_DENOMINATOR);
  let accumulated = 0;
  for (let bucket = 0; bucket < counts.length; bucket++) {
    accumulated += integer(counts[bucket], `counts[${bucket}]`);
    if (accumulated >= wanted) return bucket;
  }
  throw new Error(`source contains fewer than ${wanted} valid candidate rows`);
}

async function chooseCandidates(source: string, target: number): Promise<{
  selected: Candidate[];
  rows: number;
  invalid: number;
  duplicates: number;
  cutoffBucket: number;
}> {
  const counts = Array.from({ length: BUCKETS }, () => 0);
  let invalid = 0;
  const rows = await lines(source, (line, lineNumber) => {
    const parsed = parseRow(line, lineNumber);
    if (!parsed) {
      invalid++;
      return;
    }
    const priority = priorityFor(positionKeyFromSfen(parsed.sfen));
    counts[priorityBucket(priority)]++;
  });
  const cutoffBucket = cutoffBucketForCounts(counts, target);
  const unique = new Map<string, Candidate>();
  let duplicates = 0;
  await lines(source, (line, lineNumber) => {
    const parsed = parseRow(line, lineNumber);
    if (!parsed) return;
    const positionId = positionKeyFromSfen(parsed.sfen);
    const priority = priorityFor(positionId);
    if (priorityBucket(priority) > cutoffBucket) return;
    if (unique.has(positionId)) {
      duplicates++;
      return;
    }
    unique.set(positionId, { priority, positionId, sfen: parsed.sfen, ply: parsed.ply });
  });
  const selected = [...unique.values()]
    .sort((left, right) => {
      if (left.priority < right.priority) return -1;
      if (left.priority > right.priority) return 1;
      if (left.positionId < right.positionId) return -1;
      if (left.positionId > right.positionId) return 1;
      return 0;
    })
    .slice(0, target);
  if (selected.length !== target) {
    throw new Error(`priority margin produced ${selected.length} unique candidates, expected ${target}`);
  }
  return { selected, rows, invalid, duplicates, cutoffBucket };
}

function writeDurable(path: string, text: string): void {
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, text, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function gameIdFor(positionId: string): string {
  return `sha256:${sha256(`${GAME_DOMAIN}${positionId}`)}`;
}

function buildRows(selected: readonly Candidate[]): SelectionRow[] {
  return selected.map((candidate, globalIndex) => {
    const legalMoves = rulesCompleteLegalMoves(positionFromSfen(candidate.sfen).position).length;
    if (legalMoves < 2) throw new Error(`selected position has fewer than two legal moves: ${candidate.positionId}`);
    return {
      schema: SELECTION_ROW_SCHEMA,
      global_index: globalIndex,
      domain: 'unused-runop1-positions-relabelled-by-aoba',
      split: 'train',
      game_id: gameIdFor(candidate.positionId),
      ply: candidate.ply,
      parent_sfen: candidate.sfen,
      position_id: candidate.positionId,
      legal_moves: legalMoves,
      priority_sha256: candidate.priority,
    };
  });
}

async function build(options: Options): Promise<void> {
  if (existsSync(options.outputRoot)) throw new Error(`output root already exists: ${options.outputRoot}`);
  const sourceSha256 = sha256File(options.source);
  if (!options.allowUnpinnedFixture) {
    if (sourceSha256 !== EXPECTED_SOURCE_SHA256 || statSync(options.source).size <= 0) {
      throw new Error('runOp1 source identity mismatch');
    }
  }
  const protocolBytes = readFileSync(options.protocol);
  const protocolSha256 = sha256(protocolBytes);
  const chosen = await chooseCandidates(options.source, options.target);
  if (!options.allowUnpinnedFixture && chosen.rows !== EXPECTED_SOURCE_ROWS) {
    throw new Error(`runOp1 row count mismatch: ${chosen.rows}`);
  }
  const selectedRows = buildRows(chosen.selected);
  const shardCount = Math.ceil(selectedRows.length / options.shardRows);
  if (shardCount > 99_999) throw new Error('shard count exceeds five-digit filename contract');
  const parent = dirname(options.outputRoot);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const staging = `${options.outputRoot}.building.${process.pid}`;
  mkdirSync(staging, { recursive: false, mode: 0o700 });
  try {
    for (let shardIndex = 0; shardIndex < shardCount; shardIndex++) {
      const rows = selectedRows.slice(shardIndex * options.shardRows, (shardIndex + 1) * options.shardRows);
      const header: SelectionHeader = {
        schema: SELECTION_HEADER_SCHEMA,
        shard_index: shardIndex,
        shard_count: shardCount,
        rows: rows.length,
        selection_contract_sha256: protocolSha256,
      };
      const name = `selection-${String(shardIndex).padStart(5, '0')}-of-${String(shardCount).padStart(5, '0')}.jsonl`;
      writeDurable(join(staging, name), `${[header, ...rows].map((row) => JSON.stringify(row)).join('\n')}\n`);
    }
    const manifest = {
      schema: MANIFEST_SCHEMA,
      status: 'complete',
      source_path: options.source,
      source_bytes: statSync(options.source).size,
      source_sha256: sourceSha256,
      source_rows: chosen.rows,
      invalid_source_rows: chosen.invalid,
      duplicate_candidate_rows: chosen.duplicates,
      selected_unique_parents: selectedRows.length,
      target_unique_parents: options.target,
      shard_rows: options.shardRows,
      shard_count: shardCount,
      priority_bucket_cutoff: chosen.cutoffBucket,
      priority_domain: PRIORITY_DOMAIN.slice(0, -1),
      protocol_path: options.protocol,
      protocol_bytes: protocolBytes.length,
      protocol_sha256: protocolSha256,
    };
    writeDurable(join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    renameSync(staging, options.outputRoot);
    console.log(JSON.stringify(manifest));
  } catch (error) {
    // Preserve a complete shard prefix for diagnosis; never reuse it as a final root.
    throw error;
  }
}

if (require.main === module) {
  build(parseOptions(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
