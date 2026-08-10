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
  rmSync,
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
import { toSfen } from './shogi-sfen-codec';

export const STANDARD_AOBA_SELECTION_SHARD_ROWS = 256;
const MINIMUM_LEGAL_MOVES = 4;
const POSITION_ID_RE = /^sha256:[0-9a-f]{64}$/;
const PRIORITY_DOMAIN = 'kingpair-standard-aoba-parent-selection-v1\0';
const DERIVED_GAME_DOMAIN = 'kingpair-standard-aoba-derived-game-v1\0';

export type StandardSourceKind = 'large-scratch' | 'v9' | 'wcsc' | 'browser-confusion';

interface SourceDefinition {
  readonly kind: StandardSourceKind;
  readonly domain: string;
  readonly preference: number;
  readonly path: string;
}

interface Options {
  readonly largeScratch: string;
  readonly v9Train: string;
  readonly wcscParents: string;
  readonly browserTrain: string;
  readonly exclusionIds: readonly string[];
  readonly selectionContract: string;
  readonly outputRoot: string;
  readonly target: number;
}

export interface StandardSelectionCandidate {
  readonly priority: string;
  readonly positionId: string;
  readonly parentSfen: string;
  readonly ply: number;
  readonly gameId: string;
  readonly domain: string;
  readonly sourcePreference: number;
  readonly legalMoves: number;
}

interface ParsedParent {
  readonly positionId: string;
  readonly parentSfen: string;
  readonly ply: number;
  readonly gameId: string;
  readonly domain: string;
  readonly sourcePreference: number;
}

interface BuildSummary {
  readonly status: 'complete';
  readonly selected_unique_parents: number;
  readonly shard_count: number;
  readonly shard_rows: number;
  readonly source_rows: Readonly<Record<StandardSourceKind, number>>;
  readonly excluded_occurrences: number;
  readonly duplicate_selected_occurrences: number;
  readonly rejected_fewer_than_four_legal_moves: number;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function compareText(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

function exactPositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function exactNonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value as number;
}

function exactText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || value.includes('\0')) {
    throw new Error(`${label} must be non-empty canonical text`);
  }
  return value;
}

function exactObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseOptions(argv: readonly string[]): Options {
  const scalar = new Map<string, string>();
  const exclusionIds: string[] = [];
  const allowed = new Set([
    'large-scratch',
    'v9-train',
    'wcsc-parents',
    'browser-train',
    'exclude-ids',
    'selection-contract',
    'output-root',
    'target',
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error('arguments must be --key value pairs');
    }
    const key = flag.slice(2);
    if (!allowed.has(key)) throw new Error(`unknown option --${key}`);
    if (key === 'exclude-ids') {
      exclusionIds.push(resolve(value));
      continue;
    }
    if (scalar.has(key)) throw new Error(`duplicate option --${key}`);
    scalar.set(key, value);
  }
  const requiredPath = (key: string): string => {
    const value = scalar.get(key);
    if (!value) throw new Error(`--${key} is required`);
    return resolve(value);
  };
  return {
    largeScratch: requiredPath('large-scratch'),
    v9Train: requiredPath('v9-train'),
    wcscParents: requiredPath('wcsc-parents'),
    browserTrain: requiredPath('browser-train'),
    exclusionIds,
    selectionContract: requiredPath('selection-contract'),
    outputRoot: requiredPath('output-root'),
    target: exactPositiveInteger(Number(scalar.get('target')), '--target'),
  };
}

function canonicalParent(
  rawSfen: unknown,
  rawPly: unknown,
  rawPositionId: unknown,
  rawGameId: unknown,
  source: SourceDefinition,
  label: string,
): ParsedParent {
  const parsed = positionFromSfen(exactText(rawSfen, `${label}.parent_sfen`));
  const parentSfen = toSfen(parsed.position, parsed.moveNumber);
  const ply = exactNonnegativeInteger(rawPly, `${label}.ply`);
  if (parsed.moveNumber !== ply + 1) throw new Error(`${label}.ply does not match parent SFEN`);
  const positionId = positionKeyFromSfen(parentSfen);
  if (rawPositionId !== undefined && exactText(rawPositionId, `${label}.position_id`) !== positionId) {
    throw new Error(`${label}.position_id does not match parent SFEN`);
  }
  const gameId = rawGameId === undefined
    ? `sha256:${sha256(`${DERIVED_GAME_DOMAIN}${source.kind}\0${positionId}`)}`
    : exactText(rawGameId, `${label}.game_id`);
  return {
    positionId,
    parentSfen,
    ply,
    gameId,
    domain: source.domain,
    sourcePreference: source.preference,
  };
}

export function parseStandardSourceRow(
  kind: StandardSourceKind,
  value: unknown,
  label: string = kind,
): ParsedParent {
  const row = exactObject(value, label);
  const definition = SOURCE_METADATA[kind];
  const source: SourceDefinition = { ...definition, path: '' };
  if (kind === 'large-scratch') {
    if (row.split !== 'train') throw new Error(`${label}.split must be train`);
    return canonicalParent(row.sfen, row.ply, row.position_id, row.game_id, source, label);
  }
  if (kind === 'v9' || kind === 'browser-confusion') {
    if (row.split !== 'train') throw new Error(`${label}.split must be train`);
    return canonicalParent(
      row.parent_sfen,
      row.parent_ply,
      row.position_id,
      row.game_id,
      source,
      label,
    );
  }
  if (row.split !== undefined && row.split !== 'train') {
    throw new Error(`${label}.split must be absent or train`);
  }
  return canonicalParent(row.parent_sfen, row.ply, row.position_id, row.game_id, source, label);
}

const SOURCE_METADATA: Readonly<Record<StandardSourceKind, Omit<SourceDefinition, 'path'>>> = {
  'large-scratch': { kind: 'large-scratch', domain: 'public-large-scratch', preference: 2 },
  v9: { kind: 'v9', domain: 'public-v9-train', preference: 1 },
  wcsc: { kind: 'wcsc', domain: 'public-wcsc', preference: 3 },
  'browser-confusion': {
    kind: 'browser-confusion',
    domain: 'browser-confusion-train',
    preference: 0,
  },
};

function priorityFor(positionId: string): string {
  return sha256(`${PRIORITY_DOMAIN}${positionId}`);
}

function compareCandidate(left: StandardSelectionCandidate, right: StandardSelectionCandidate): number {
  return compareText(left.priority, right.priority) || compareText(left.positionId, right.positionId);
}

function preferredOccurrence(left: ParsedParent, right: ParsedParent): ParsedParent {
  const order =
    left.sourcePreference - right.sourcePreference ||
    compareText(left.parentSfen, right.parentSfen) ||
    compareText(left.gameId, right.gameId) ||
    left.ply - right.ply;
  return order <= 0 ? left : right;
}

class BoundedCandidateHeap {
  private readonly heap: StandardSelectionCandidate[] = [];
  private readonly byPosition = new Map<string, StandardSelectionCandidate>();

  constructor(private readonly capacity: number) {}

  private worse(left: StandardSelectionCandidate, right: StandardSelectionCandidate): boolean {
    return compareCandidate(left, right) > 0;
  }

  private swap(left: number, right: number): void {
    [this.heap[left], this.heap[right]] = [this.heap[right], this.heap[left]];
  }

  private push(value: StandardSelectionCandidate): void {
    this.heap.push(value);
    this.byPosition.set(value.positionId, value);
    let index = this.heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.worse(this.heap[index], this.heap[parent])) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  private popWorst(): StandardSelectionCandidate {
    const worst = this.heap[0];
    const tail = this.heap.pop();
    if (!tail || !worst) throw new Error('candidate heap underflow');
    this.byPosition.delete(worst.positionId);
    if (this.heap.length > 0) {
      this.heap[0] = tail;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let next = index;
        if (left < this.heap.length && this.worse(this.heap[left], this.heap[next])) next = left;
        if (right < this.heap.length && this.worse(this.heap[right], this.heap[next])) next = right;
        if (next === index) break;
        this.swap(index, next);
        index = next;
      }
    }
    return worst;
  }

  existing(positionId: string): StandardSelectionCandidate | undefined {
    return this.byPosition.get(positionId);
  }

  replaceOccurrence(parent: ParsedParent): void {
    const current = this.byPosition.get(parent.positionId);
    if (!current) throw new Error('candidate replacement target is absent');
    const preferred = preferredOccurrence(parent, {
      positionId: current.positionId,
      parentSfen: current.parentSfen,
      ply: current.ply,
      gameId: current.gameId,
      domain: current.domain,
      sourcePreference: current.sourcePreference,
    });
    if (preferred === parent) {
      const updated = { ...current, ...parent };
      const index = this.heap.indexOf(current);
      if (index < 0) throw new Error('candidate heap/map drift');
      this.heap[index] = updated;
      this.byPosition.set(updated.positionId, updated);
    }
  }

  couldEnter(priority: string, positionId: string): boolean {
    if (this.heap.length < this.capacity) return true;
    const worst = this.heap[0];
    return compareText(priority, worst.priority) < 0 ||
      (priority === worst.priority && compareText(positionId, worst.positionId) < 0);
  }

  insert(value: StandardSelectionCandidate): void {
    if (this.heap.length === this.capacity) this.popWorst();
    this.push(value);
  }

  sorted(): StandardSelectionCandidate[] {
    return [...this.heap].sort(compareCandidate);
  }
}

async function visitLines(
  path: string,
  consume: (value: unknown, lineNumber: number) => void,
): Promise<number> {
  const reader = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  let rows = 0;
  for await (const line of reader) {
    rows++;
    if (line.length === 0) throw new Error(`${path}: blank line ${rows}`);
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(`${path}: line ${rows} is invalid JSON: ${String(error)}`);
    }
    consume(value, rows);
  }
  return rows;
}

async function loadExclusions(paths: readonly string[]): Promise<Set<string>> {
  const result = new Set<string>();
  for (const path of paths) {
    const reader = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
    let lineNumber = 0;
    for await (const line of reader) {
      lineNumber++;
      if (line.length === 0) throw new Error(`${path}: blank exclusion line ${lineNumber}`);
      let identifier = line;
      if (line.startsWith('{')) {
        let value: unknown;
        try {
          value = JSON.parse(line);
        } catch (error) {
          throw new Error(`${path}: invalid exclusion JSON at line ${lineNumber}: ${String(error)}`);
        }
        identifier = exactText(exactObject(value, `${path}:${lineNumber}`).position_id, 'position_id');
      }
      if (!POSITION_ID_RE.test(identifier)) {
        throw new Error(`${path}: invalid semantic position ID at line ${lineNumber}`);
      }
      result.add(identifier);
    }
  }
  return result;
}

function writeCreateOnly(path: string, text: string): void {
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, text, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export async function buildStandardAobaSelection(options: Options): Promise<BuildSummary> {
  if (existsSync(options.outputRoot)) throw new Error(`output root already exists: ${options.outputRoot}`);
  exactPositiveInteger(options.target, 'target');
  const exclusions = await loadExclusions(options.exclusionIds);
  const heap = new BoundedCandidateHeap(options.target);
  const sourceRows = {
    'large-scratch': 0,
    v9: 0,
    wcsc: 0,
    'browser-confusion': 0,
  } satisfies Record<StandardSourceKind, number>;
  let excludedOccurrences = 0;
  let duplicateSelectedOccurrences = 0;
  let rejectedLegal = 0;
  const sources: SourceDefinition[] = [
    { ...SOURCE_METADATA['large-scratch'], path: options.largeScratch },
    { ...SOURCE_METADATA.v9, path: options.v9Train },
    { ...SOURCE_METADATA.wcsc, path: options.wcscParents },
    { ...SOURCE_METADATA['browser-confusion'], path: options.browserTrain },
  ];

  for (const source of sources) {
    sourceRows[source.kind] = await visitLines(source.path, (value, lineNumber) => {
      const parent = parseStandardSourceRow(source.kind, value, `${source.path}:${lineNumber}`);
      if (exclusions.has(parent.positionId)) {
        excludedOccurrences++;
        return;
      }
      if (heap.existing(parent.positionId)) {
        duplicateSelectedOccurrences++;
        heap.replaceOccurrence(parent);
        return;
      }
      const priority = priorityFor(parent.positionId);
      if (!heap.couldEnter(priority, parent.positionId)) return;
      const legalMoves = rulesCompleteLegalMoves(positionFromSfen(parent.parentSfen).position).length;
      if (legalMoves < MINIMUM_LEGAL_MOVES) {
        rejectedLegal++;
        return;
      }
      heap.insert({ ...parent, priority, legalMoves });
    });
  }

  const selected = heap.sorted();
  if (selected.length !== options.target) {
    throw new Error(`found ${selected.length} eligible unique parents, require ${options.target}`);
  }
  const rows: SelectionRow[] = selected.map((candidate, globalIndex) => ({
    schema: SELECTION_ROW_SCHEMA,
    global_index: globalIndex,
    domain: candidate.domain,
    split: 'train',
    game_id: candidate.gameId,
    ply: candidate.ply,
    parent_sfen: candidate.parentSfen,
    position_id: candidate.positionId,
    legal_moves: candidate.legalMoves,
    priority_sha256: candidate.priority,
  }));
  const shardCount = Math.ceil(rows.length / STANDARD_AOBA_SELECTION_SHARD_ROWS);
  if (shardCount > 99_999) throw new Error('shard count exceeds five-digit filename contract');
  const contractSha256 = sha256(readFileSync(options.selectionContract));
  mkdirSync(dirname(options.outputRoot), { recursive: true, mode: 0o700 });
  const staging = `${options.outputRoot}.building.${process.pid}`;
  if (existsSync(staging)) throw new Error(`staging root already exists: ${staging}`);
  mkdirSync(staging, { mode: 0o700 });
  try {
    for (let shardIndex = 0; shardIndex < shardCount; shardIndex++) {
      const shardRows = rows.slice(
        shardIndex * STANDARD_AOBA_SELECTION_SHARD_ROWS,
        (shardIndex + 1) * STANDARD_AOBA_SELECTION_SHARD_ROWS,
      );
      const header: SelectionHeader = {
        schema: SELECTION_HEADER_SCHEMA,
        shard_index: shardIndex,
        shard_count: shardCount,
        rows: shardRows.length,
        selection_contract_sha256: contractSha256,
      };
      const filename =
        `selection-${String(shardIndex).padStart(5, '0')}-of-${String(shardCount).padStart(5, '0')}.jsonl`;
      writeCreateOnly(
        join(staging, filename),
        `${[header, ...shardRows].map((row) => JSON.stringify(row)).join('\n')}\n`,
      );
    }
    renameSync(staging, options.outputRoot);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return {
    status: 'complete',
    selected_unique_parents: selected.length,
    shard_count: shardCount,
    shard_rows: STANDARD_AOBA_SELECTION_SHARD_ROWS,
    source_rows: sourceRows,
    excluded_occurrences: excludedOccurrences,
    duplicate_selected_occurrences: duplicateSelectedOccurrences,
    rejected_fewer_than_four_legal_moves: rejectedLegal,
  };
}

export async function main(argv: readonly string[]): Promise<void> {
  console.log(JSON.stringify(await buildStandardAobaSelection(parseOptions(argv))));
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
