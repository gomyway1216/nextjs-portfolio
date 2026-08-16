import { createHash } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  existsSync,
  fsyncSync,
  lstatSync,
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
import { compareBytewise, positionKeyFromSfen } from './sibling-data';
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
const POSITION_ID_RE = /^sha256:[0-9a-f]{64}$/;

export const MANIFEST_SCHEMA = 'shogi-kingpair-aoba-runop1-selection-manifest-v1';
export const SEMANTIC_EXCLUSION_FORMAT = 'sorted-unique-sha256-position-id-utf8-lf-v1';

export interface BuildOptions {
  readonly source: string;
  readonly protocol: string;
  readonly outputRoot: string;
  readonly target: number;
  readonly shardRows: number;
  readonly allowUnpinnedFixture: boolean;
  readonly legacy2mExclusionPositionIds: string;
  readonly sealedHoldoutExclusionPositionIds: string;
}

export interface Candidate {
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

export interface SemanticExclusionIdentity {
  readonly path: string;
  readonly format: typeof SEMANTIC_EXCLUSION_FORMAT;
  readonly bytes: number;
  readonly sha256: string;
  readonly count: number;
  readonly identifiers_sha256: string;
}

interface SemanticExclusionComponent {
  readonly identifiers: readonly string[];
  readonly set: ReadonlySet<string>;
  readonly identity: SemanticExclusionIdentity;
}

export interface SemanticExclusionUnion {
  readonly legacy2m: SemanticExclusionComponent;
  readonly sealedHoldout: SemanticExclusionComponent;
  readonly identifiers: readonly string[];
  readonly set: ReadonlySet<string>;
  readonly componentOverlap: number;
  readonly identifiersSha256: string;
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

function parseOptions(argv: readonly string[]): BuildOptions {
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
  const legacy2mExclusionPositionIds = values.get('legacy2m-exclusion-position-ids');
  if (!legacy2mExclusionPositionIds) {
    throw new Error('--legacy2m-exclusion-position-ids is required');
  }
  const sealedHoldoutExclusionPositionIds = values.get('sealed-holdout-exclusion-position-ids');
  if (!sealedHoldoutExclusionPositionIds) {
    throw new Error('--sealed-holdout-exclusion-position-ids is required');
  }
  return {
    source: resolve(values.get('source') ?? DEFAULT_SOURCE),
    protocol: resolve(values.get('protocol') ?? DEFAULT_PROTOCOL),
    outputRoot: resolve(output),
    target,
    shardRows,
    allowUnpinnedFixture: values.get('allow-unpinned-fixture') === 'true',
    legacy2mExclusionPositionIds: resolve(legacy2mExclusionPositionIds),
    sealedHoldoutExclusionPositionIds: resolve(sealedHoldoutExclusionPositionIds),
  };
}

function identifierDigest(values: Iterable<string>): string {
  return sha256([...new Set(values)].sort(compareBytewise).join('\n'));
}

function readSemanticExclusionComponent(path: string, label: string): SemanticExclusionComponent {
  const metadata = lstatSync(path);
  if (!metadata.isFile()) throw new Error(`${label} must be a regular file`);
  const bytes = readFileSync(path);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw new Error(`${label} must be valid UTF-8`);
  }
  if (
    text.length === 0 ||
    !text.endsWith('\n') ||
    text.endsWith('\n\n') ||
    text.includes('\r') ||
    text.includes('\0')
  ) {
    throw new Error(`${label} must be nonempty and use exact single-final-LF framing`);
  }
  const identifiers = text.slice(0, -1).split('\n');
  for (let index = 0; index < identifiers.length; index++) {
    const identifier = identifiers[index];
    if (!POSITION_ID_RE.test(identifier)) {
      throw new Error(`${label}[${index}] is not a canonical semantic position ID`);
    }
    if (index > 0 && compareBytewise(identifiers[index - 1], identifier) >= 0) {
      throw new Error(`${label} must be UTF-8-bytewise sorted and unique`);
    }
  }
  return {
    identifiers,
    set: new Set(identifiers),
    identity: {
      path,
      format: SEMANTIC_EXCLUSION_FORMAT,
      bytes: bytes.length,
      sha256: sha256(bytes),
      count: identifiers.length,
      identifiers_sha256: identifierDigest(identifiers),
    },
  };
}

function intersectionSize(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let overlap = 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  for (const value of small) if (large.has(value)) overlap++;
  return overlap;
}

export function loadSemanticExclusionUnion(
  legacy2mPath: string,
  sealedHoldoutPath: string,
): SemanticExclusionUnion {
  const legacy2m = readSemanticExclusionComponent(resolve(legacy2mPath), 'legacy2m exclusion');
  const sealedHoldout = readSemanticExclusionComponent(
    resolve(sealedHoldoutPath),
    'sealed holdout exclusion',
  );
  const identifiers = [...new Set([
    ...legacy2m.identifiers,
    ...sealedHoldout.identifiers,
  ])].sort(compareBytewise);
  return {
    legacy2m,
    sealedHoldout,
    identifiers,
    set: new Set(identifiers),
    componentOverlap: intersectionSize(legacy2m.set, sealedHoldout.set),
    identifiersSha256: identifierDigest(identifiers),
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

export function cutoffBucketForCounts(
  counts: readonly number[],
  target: number,
  allowAvailableFallback = false,
): number {
  if (counts.length !== BUCKETS) throw new Error(`expected ${BUCKETS} priority buckets`);
  integer(target, 'target', 1);
  const total = counts.reduce(
    (sum, count, bucket) => sum + integer(count, `counts[${bucket}]`),
    0,
  );
  const marginWanted = Math.ceil(
    (target * CANDIDATE_MARGIN_NUMERATOR) / CANDIDATE_MARGIN_DENOMINATOR,
  );
  if (total < target) throw new Error(`source contains fewer than ${target} eligible candidate rows`);
  const wanted = allowAvailableFallback ? Math.min(total, marginWanted) : marginWanted;
  let accumulated = 0;
  for (let bucket = 0; bucket < counts.length; bucket++) {
    accumulated += counts[bucket];
    if (accumulated >= wanted) return bucket;
  }
  throw new Error(`source contains fewer than ${marginWanted} valid candidate rows`);
}

async function chooseCandidates(
  source: string,
  target: number,
  exclusions: SemanticExclusionUnion,
): Promise<{
  selected: Candidate[];
  rows: number;
  invalid: number;
  duplicates: number;
  cutoffBucket: number;
  eligibleRowsAfterExclusion: number;
  priorityMarginSatisfied: boolean;
  excludedSourceRows: number;
  excludedUniquePositionIds: number;
  legacy2mSourceRows: number;
  sealedHoldoutSourceRows: number;
  legacy2mUniquePositionIds: number;
  sealedHoldoutUniquePositionIds: number;
}> {
  const counts = Array.from({ length: BUCKETS }, () => 0);
  let invalid = 0;
  let excludedSourceRows = 0;
  let legacy2mSourceRows = 0;
  let sealedHoldoutSourceRows = 0;
  const excludedUniquePositionIds = new Set<string>();
  const legacy2mUniquePositionIds = new Set<string>();
  const sealedHoldoutUniquePositionIds = new Set<string>();
  const rows = await lines(source, (line, lineNumber) => {
    const parsed = parseRow(line, lineNumber);
    if (!parsed) {
      invalid++;
      return;
    }
    const positionId = positionKeyFromSfen(parsed.sfen);
    const inLegacy2m = exclusions.legacy2m.set.has(positionId);
    const inSealedHoldout = exclusions.sealedHoldout.set.has(positionId);
    if (inLegacy2m) {
      legacy2mSourceRows++;
      legacy2mUniquePositionIds.add(positionId);
    }
    if (inSealedHoldout) {
      sealedHoldoutSourceRows++;
      sealedHoldoutUniquePositionIds.add(positionId);
    }
    if (inLegacy2m || inSealedHoldout) {
      excludedSourceRows++;
      excludedUniquePositionIds.add(positionId);
      return;
    }
    const priority = priorityFor(positionId);
    counts[priorityBucket(priority)]++;
  });
  const eligibleRowsAfterExclusion = counts.reduce((sum, count) => sum + count, 0);
  const marginWanted = Math.ceil(
    (target * CANDIDATE_MARGIN_NUMERATOR) / CANDIDATE_MARGIN_DENOMINATOR,
  );
  const priorityMarginSatisfied = eligibleRowsAfterExclusion >= marginWanted;
  let cutoffBucket = cutoffBucketForCounts(counts, target, true);
  const collect = async (maximumBucket: number): Promise<{
    selected: Candidate[];
    duplicates: number;
  }> => {
    const unique = new Map<string, Candidate>();
    let duplicates = 0;
    await lines(source, (line, lineNumber) => {
      const parsed = parseRow(line, lineNumber);
      if (!parsed) return;
      const positionId = positionKeyFromSfen(parsed.sfen);
      if (exclusions.set.has(positionId)) return;
      const priority = priorityFor(positionId);
      if (priorityBucket(priority) > maximumBucket) return;
      if (unique.has(positionId)) {
        duplicates++;
        return;
      }
      unique.set(positionId, { priority, positionId, sfen: parsed.sfen, ply: parsed.ply });
    });
    return {
      selected: [...unique.values()].sort((left, right) => {
        if (left.priority < right.priority) return -1;
        if (left.priority > right.priority) return 1;
        if (left.positionId < right.positionId) return -1;
        if (left.positionId > right.positionId) return 1;
        return 0;
      }),
      duplicates,
    };
  };
  let collected = await collect(cutoffBucket);
  // Duplicate source rows can consume the nominal 10% row margin. Expand to
  // the complete eligible priority domain before declaring an explicit target
  // impossible; this is what permits a later exact "all remaining" target.
  if (collected.selected.length < target && cutoffBucket < BUCKETS - 1) {
    cutoffBucket = BUCKETS - 1;
    collected = await collect(cutoffBucket);
  }
  const { selected, duplicates } = collected;
  if (selected.length < target) {
    throw new Error(`priority margin produced ${selected.length} unique candidates, expected at least ${target}`);
  }
  return {
    selected,
    rows,
    invalid,
    duplicates,
    cutoffBucket,
    eligibleRowsAfterExclusion,
    priorityMarginSatisfied,
    excludedSourceRows,
    excludedUniquePositionIds: excludedUniquePositionIds.size,
    legacy2mSourceRows,
    sealedHoldoutSourceRows,
    legacy2mUniquePositionIds: legacy2mUniquePositionIds.size,
    sealedHoldoutUniquePositionIds: sealedHoldoutUniquePositionIds.size,
  };
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

export function buildRows(selected: readonly Candidate[], target: number): {
  rows: SelectionRow[];
  rejectedLegal: number;
} {
  const rows: SelectionRow[] = [];
  let rejectedLegal = 0;
  for (const candidate of selected) {
    const legalMoves = rulesCompleteLegalMoves(positionFromSfen(candidate.sfen).position).length;
    if (legalMoves < 2) {
      rejectedLegal++;
      continue;
    }
    rows.push({
      schema: SELECTION_ROW_SCHEMA,
      global_index: rows.length,
      domain: 'unused-runop1-positions-relabelled-by-aoba',
      split: 'train',
      game_id: gameIdFor(candidate.positionId),
      ply: candidate.ply,
      parent_sfen: candidate.sfen,
      position_id: candidate.positionId,
      legal_moves: legalMoves,
      priority_sha256: candidate.priority,
    });
    if (rows.length === target) break;
  }
  if (rows.length !== target) {
    throw new Error(`legal filtering produced ${rows.length} candidates, expected ${target}`);
  }
  return { rows, rejectedLegal };
}

export async function buildSelection(options: BuildOptions): Promise<void> {
  if (existsSync(options.outputRoot)) throw new Error(`output root already exists: ${options.outputRoot}`);
  const sourceSha256 = sha256File(options.source);
  if (!options.allowUnpinnedFixture) {
    if (sourceSha256 !== EXPECTED_SOURCE_SHA256 || statSync(options.source).size <= 0) {
      throw new Error('runOp1 source identity mismatch');
    }
  }
  const protocolBytes = readFileSync(options.protocol);
  const protocolSha256 = sha256(protocolBytes);
  const exclusions = loadSemanticExclusionUnion(
    options.legacy2mExclusionPositionIds,
    options.sealedHoldoutExclusionPositionIds,
  );
  const chosen = await chooseCandidates(options.source, options.target, exclusions);
  if (!options.allowUnpinnedFixture && chosen.rows !== EXPECTED_SOURCE_ROWS) {
    throw new Error(`runOp1 row count mismatch: ${chosen.rows}`);
  }
  const legalSelection = buildRows(chosen.selected, options.target);
  const selectedRows = legalSelection.rows;
  const selectedLegacy2mOverlap = selectedRows.filter((row) =>
    exclusions.legacy2m.set.has(row.position_id)
  ).length;
  const selectedSealedHoldoutOverlap = selectedRows.filter((row) =>
    exclusions.sealedHoldout.set.has(row.position_id)
  ).length;
  const selectedUnionOverlap = selectedRows.filter((row) =>
    exclusions.set.has(row.position_id)
  ).length;
  if (selectedLegacy2mOverlap || selectedSealedHoldoutOverlap || selectedUnionOverlap) {
    throw new Error('selected rows overlap semantic exclusion union');
  }
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
      rejected_fewer_than_two_legal_moves: legalSelection.rejectedLegal,
      semantic_exclusions: {
        format: SEMANTIC_EXCLUSION_FORMAT,
        components: {
          legacy2m: exclusions.legacy2m.identity,
          sealed_holdout: exclusions.sealedHoldout.identity,
        },
        union: {
          unique_position_ids: exclusions.identifiers.length,
          identifiers_sha256: exclusions.identifiersSha256,
          component_overlap_unique_position_ids: exclusions.componentOverlap,
        },
        source_overlap: {
          excluded_rows: chosen.excludedSourceRows,
          excluded_unique_position_ids: chosen.excludedUniquePositionIds,
          legacy2m_rows: chosen.legacy2mSourceRows,
          legacy2m_unique_position_ids: chosen.legacy2mUniquePositionIds,
          sealed_holdout_rows: chosen.sealedHoldoutSourceRows,
          sealed_holdout_unique_position_ids: chosen.sealedHoldoutUniquePositionIds,
        },
        selected_overlap: {
          legacy2m: selectedLegacy2mOverlap,
          sealed_holdout: selectedSealedHoldoutOverlap,
          union: selectedUnionOverlap,
        },
      },
      selected_unique_parents: selectedRows.length,
      target_unique_parents: options.target,
      shard_rows: options.shardRows,
      shard_count: shardCount,
      priority_bucket_cutoff: chosen.cutoffBucket,
      eligible_source_rows_after_semantic_exclusion: chosen.eligibleRowsAfterExclusion,
      priority_candidate_margin_satisfied: chosen.priorityMarginSatisfied,
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
  buildSelection(parseOptions(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
