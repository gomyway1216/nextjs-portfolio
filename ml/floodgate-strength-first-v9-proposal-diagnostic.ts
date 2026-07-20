/**
 * Bounded, aggregate-only depth diagnostic for the failed strength-first v8
 * proposal searches. This never emits a parent identifier, SFEN, move, score,
 * raw pathname, or engine pathname.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { fixedUsiOptionCommands } from './usi-engine';
import {
  UsiMultiPvAccumulator,
  buildGo,
  parseUsiInfoLine,
  type UsiMultiPvResult,
} from './usi-multipv';
import { positionFromSfen, rulesCompleteLegalMoves } from './shogi-sfen';

const RAW_SHA256 = 'c9ee90da69135ead5dbb60cbab6eaa82ad018db791132dd4ec122d6088c37b62';
const V8_WORK_SHA256 =
  'a2431122501016aba88beac14adf41b6c243d06d184617a72ebc543dfe60bafa';
const V8_WORK_BYTES = 19_132_580;
const ENGINE_BYTES = 700_048;
const ENGINE_SHA256 =
  '1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1';
const EVAL_BYTES = 64_217_066;
const EVAL_SHA256 = '1141d275bceec911156801f27303dc9ff5beb24f4f59144cc069306c59e80782';
const FATAL_RAW_ORDINAL = 1_388;
const FATAL_RAW_PLY = 115;
const EXPECTED_TIMEOUT_PARENTS = 5;
const EXPECTED_COMPLETED_PARENTS = 1_383;
const REFERENCE_SAMPLE_PARENTS = 6;
const DEPTHS = Object.freeze([14, 15] as const);
const MULTIPV = 12;
const HASH_MB = 512;
const TIMEOUT_MS = 600_000;
const PARALLEL_PARENT_LANES = 12;

type DiagnosticDepth = (typeof DEPTHS)[number];
type FailureKind =
  | 'none'
  | 'timeout'
  | 'incomplete-fixed-depth-ranks'
  | 'malformed-output'
  | 'terminal-bestmove'
  | 'engine-failure';
type FinalUpdateKind = 'cp' | 'mate' | 'bound' | 'malformed';

interface RawParent {
  readonly parent_id: string;
  readonly parent_sfen: string;
  readonly ply: number;
}

interface CompletedReference {
  readonly parentId: string;
  readonly sfen: string;
  readonly legalMoves: number;
  readonly referenceMoves: readonly string[];
  readonly referenceRescoredRank1Move: string;
  readonly referenceNodes: number;
}

interface DiagnosticParent {
  readonly group: 'critical' | 'completed-reference';
  readonly sfen: string;
  readonly legalMoves: number;
  readonly referenceMoves?: readonly string[];
  readonly referenceRescoredRank1Move?: string;
  readonly referenceNodes?: number;
  readonly fatalTranscriptClassification: boolean;
}

interface FinalUpdate {
  readonly depth: number;
  readonly kind: FinalUpdateKind;
  readonly exact: boolean;
  readonly move?: string;
}

interface TranscriptClassification {
  readonly requested_ranks: number;
  readonly final_exact_rank_count: number;
  readonly final_depth_histogram: Readonly<Record<string, number>>;
  readonly final_score_kind_counts: Readonly<{
    cp: number;
    mate: number;
    bound: number;
    malformed: number;
    missing: number;
  }>;
  readonly strict_all_ranks_terminal_mate_fallback_eligible: boolean;
}

interface SearchOutcome {
  readonly depth: DiagnosticDepth;
  readonly complete: boolean;
  readonly failureKind: FailureKind;
  readonly elapsedMs: number;
  readonly result?: UsiMultiPvResult;
  readonly transcript: TranscriptClassification;
}

interface ParentOutcome {
  readonly parent: DiagnosticParent;
  readonly searches: Readonly<Record<DiagnosticDepth, SearchOutcome>>;
}

function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function exactText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be non-empty text`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function parseJsonl(file: Buffer, label: string): unknown[] {
  const text = file.toString('utf8');
  if (!text.endsWith('\n')) throw new Error(`${label} must end with LF`);
  return text
    .slice(0, -1)
    .split('\n')
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch {
        throw new Error(`${label} line ${index + 1} is invalid JSON`);
      }
    });
}

function legalMoveCount(sfen: string): number {
  return rulesCompleteLegalMoves(positionFromSfen(sfen).position).length;
}

function parseRawParents(file: Buffer): RawParent[] {
  if (sha256(file) !== RAW_SHA256) throw new Error('raw input digest mismatch');
  return parseJsonl(file, 'raw input').map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`raw input line ${index + 1} must be an object`);
    }
    const row = value as Record<string, unknown>;
    return Object.freeze({
      parent_id: exactText(row.parent_id, `raw input line ${index + 1} parent_id`),
      parent_sfen: exactText(row.parent_sfen, `raw input line ${index + 1} parent_sfen`),
      ply: positiveInteger(row.ply, `raw input line ${index + 1} ply`),
    });
  });
}

function parseV8Work(
  file: Buffer,
  rawById: ReadonlyMap<string, RawParent>,
): Readonly<{
  timeoutParents: readonly DiagnosticParent[];
  completedReferences: readonly CompletedReference[];
  accountedParentIds: ReadonlySet<string>;
}> {
  if (file.byteLength !== V8_WORK_BYTES || sha256(file) !== V8_WORK_SHA256) {
    throw new Error('v8 work binding mismatch');
  }
  const rows = parseJsonl(file, 'v8 work');
  if (rows.length !== 1 + EXPECTED_TIMEOUT_PARENTS + EXPECTED_COMPLETED_PARENTS) {
    throw new Error('v8 work accounting mismatch');
  }
  const timeoutParents: DiagnosticParent[] = [];
  const completedReferences: CompletedReference[] = [];
  const accountedParentIds = new Set<string>();
  for (const [index, value] of rows.entries()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`v8 work line ${index + 1} must be an object`);
    }
    const row = value as Record<string, unknown>;
    if (index === 0) {
      if (row.kind !== 'header') throw new Error('v8 work header is missing');
      continue;
    }
    const parentId = exactText(row.parent_id, `v8 work line ${index + 1} parent_id`);
    if (accountedParentIds.has(parentId)) throw new Error('v8 work parent is duplicated');
    accountedParentIds.add(parentId);
    const raw = rawById.get(parentId);
    if (!raw) throw new Error('v8 work parent is absent from raw input');
    const moves = legalMoveCount(raw.parent_sfen);
    if (row.kind === 'skip') {
      const timeout = row.timeout as Record<string, unknown> | undefined;
      if (
        row.reason !== 'search-timeout-no-label' ||
        !timeout ||
        timeout.phase !== 'proposal' ||
        JSON.stringify(timeout.requested_limit) !== '{"depth":16}'
      ) {
        throw new Error('v8 skip is not a depth-16 proposal timeout');
      }
      if (positiveInteger(row.legal_moves, 'v8 timeout legal_moves') !== moves) {
        throw new Error('v8 timeout legal-move count mismatch');
      }
      timeoutParents.push(
        Object.freeze({
          group: 'critical',
          sfen: raw.parent_sfen,
          legalMoves: moves,
          fatalTranscriptClassification: false,
        }),
      );
      continue;
    }
    if (row.kind !== 'parent') throw new Error('v8 work has an unsupported row kind');
    const initial = row.initial_search as Record<string, unknown> | undefined;
    const exact = row.exact_search as Record<string, unknown> | undefined;
    if (
      !initial ||
      !exact ||
      JSON.stringify(initial.requested_limit) !== '{"depth":16}' ||
      !Array.isArray(initial.moves) ||
      initial.moves.some((move) => typeof move !== 'string')
    ) {
      throw new Error('v8 completed parent has invalid proposal metadata');
    }
    completedReferences.push(
      Object.freeze({
        parentId,
        sfen: raw.parent_sfen,
        legalMoves: moves,
        referenceMoves: Object.freeze([...(initial.moves as string[])]),
        referenceRescoredRank1Move: exactText(
          exact.synthesized_rank1_move,
          'v8 completed proposal synthesized_rank1_move',
        ),
        referenceNodes: positiveInteger(
          initial.observed_nodes,
          'v8 completed proposal observed_nodes',
        ),
      }),
    );
  }
  if (
    timeoutParents.length !== EXPECTED_TIMEOUT_PARENTS ||
    completedReferences.length !== EXPECTED_COMPLETED_PARENTS
  ) {
    throw new Error('v8 work disposition counts mismatch');
  }
  return Object.freeze({
    timeoutParents: Object.freeze(timeoutParents),
    completedReferences: Object.freeze(completedReferences),
    accountedParentIds,
  });
}

function selectCompletedReferences(
  completed: readonly CompletedReference[],
  targetLegalMoveCounts: readonly number[],
): readonly CompletedReference[] {
  if (targetLegalMoveCounts.length !== REFERENCE_SAMPLE_PARENTS) {
    throw new Error('reference strata count mismatch');
  }
  const unused = new Set(completed.map((entry) => entry.parentId));
  const selected: CompletedReference[] = [];
  for (const target of targetLegalMoveCounts) {
    const candidate = completed
      .filter((entry) => unused.has(entry.parentId))
      .sort(
        (left, right) =>
          Math.abs(left.legalMoves - target) - Math.abs(right.legalMoves - target) ||
          right.referenceNodes - left.referenceNodes ||
          Buffer.compare(Buffer.from(left.parentId), Buffer.from(right.parentId)),
      )[0];
    if (!candidate) throw new Error('not enough completed reference parents');
    selected.push(candidate);
    unused.delete(candidate.parentId);
  }
  return Object.freeze(selected);
}

class TranscriptClassifier {
  private readonly lastByRank = new Map<number, FinalUpdate>();
  private readonly maxDepthByRank = new Map<number, number>();
  private readonly exactByDepth = new Map<number, Map<number, FinalUpdate>>();
  private bestmove: string | undefined;
  private unexpectedRank = false;
  private malformedTeacherEvidence = false;

  constructor(
    private readonly expectedRanks: number,
    private readonly requestedDepth: number,
  ) {}

  consume(line: string): void {
    const trimmed = line.trim();
    if (trimmed.startsWith('bestmove ')) {
      const tokens = trimmed.split(/\s+/);
      if (tokens.length === 2) this.bestmove = tokens[1];
      return;
    }
    if (!trimmed.startsWith('info ') || trimmed.startsWith('info string')) return;
    const tokens = trimmed.split(/\s+/);
    const depthIndex = tokens.indexOf('depth');
    const rankIndex = tokens.indexOf('multipv');
    const scoreIndex = tokens.indexOf('score');
    const depth =
      depthIndex >= 0 && /^\d+$/.test(tokens[depthIndex + 1] ?? '')
        ? Number(tokens[depthIndex + 1])
        : undefined;
    const rank =
      rankIndex >= 0 && /^\d+$/.test(tokens[rankIndex + 1] ?? '')
        ? Number(tokens[rankIndex + 1])
        : rankIndex < 0
          ? 1
          : undefined;
    const updatesTeacherEvidence =
      scoreIndex >= 0 ||
      tokens.includes('pv') ||
      tokens.includes('lowerbound') ||
      tokens.includes('upperbound');
    if (!updatesTeacherEvidence) return;
    if (
      depth === undefined ||
      depth <= 0 ||
      rank === undefined ||
      rank <= 0
    ) {
      this.malformedTeacherEvidence = true;
      return;
    }
    if (rank > this.expectedRanks) this.unexpectedRank = true;
    this.maxDepthByRank.set(
      rank,
      Math.max(this.maxDepthByRank.get(rank) ?? 0, depth),
    );
    const parsed = parseUsiInfoLine(trimmed);
    let update: FinalUpdate;
    if (parsed) {
      update = {
        depth,
        kind: parsed.scoreKind,
        exact: true,
        move: parsed.move,
      };
      const atDepth = this.exactByDepth.get(depth) ?? new Map<number, FinalUpdate>();
      atDepth.set(rank, update);
      this.exactByDepth.set(depth, atDepth);
    } else if (tokens.includes('lowerbound') || tokens.includes('upperbound')) {
      update = { depth, kind: 'bound', exact: false };
    } else {
      update = { depth, kind: 'malformed', exact: false };
      this.malformedTeacherEvidence = true;
    }
    this.lastByRank.set(rank, update);
  }

  finish(): TranscriptClassification {
    const depthHistogram: Record<string, number> = {};
    const kinds = { cp: 0, mate: 0, bound: 0, malformed: 0, missing: 0 };
    let finalExactRankCount = 0;
    const finalUpdates: FinalUpdate[] = [];
    for (let rank = 1; rank <= this.expectedRanks; rank++) {
      const update = this.lastByRank.get(rank);
      if (!update) {
        kinds.missing += 1;
        continue;
      }
      finalUpdates.push(update);
      depthHistogram[String(update.depth)] =
        (depthHistogram[String(update.depth)] ?? 0) + 1;
      kinds[update.kind] += 1;
      if (update.exact) finalExactRankCount += 1;
    }
    const mateDepth = finalUpdates[0]?.depth;
    const mateSnapshot =
      mateDepth === undefined ? undefined : this.exactByDepth.get(mateDepth);
    const moves =
      mateSnapshot === undefined
        ? []
        : Array.from(
            { length: this.expectedRanks },
            (_, index) => mateSnapshot.get(index + 1)?.move,
          );
    const strictMate =
      finalUpdates.length === this.expectedRanks &&
      mateDepth !== undefined &&
      mateDepth < this.requestedDepth &&
      finalUpdates.every(
        (update, index) =>
          update.exact &&
          update.kind === 'mate' &&
          update.depth === mateDepth &&
          this.maxDepthByRank.get(index + 1) === mateDepth,
      ) &&
      moves.every((move): move is string => typeof move === 'string') &&
      new Set(moves).size === this.expectedRanks &&
      moves[0] === this.bestmove &&
      !this.unexpectedRank &&
      !this.malformedTeacherEvidence;
    return Object.freeze({
      requested_ranks: this.expectedRanks,
      final_exact_rank_count: finalExactRankCount,
      final_depth_histogram: Object.freeze(depthHistogram),
      final_score_kind_counts: Object.freeze(kinds),
      strict_all_ranks_terminal_mate_fallback_eligible: strictMate,
    });
  }
}

function sanitizedFailureKind(error: unknown): FailureKind {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'diagnostic-search-timeout') return 'timeout';
  if (message.includes('fixed-depth ranks did not end with exact updates')) {
    return 'incomplete-fixed-depth-ranks';
  }
  if (
    message.includes('malformed') ||
    message.includes('unexpected multipv rank') ||
    message.includes('duplicate PV')
  ) {
    return 'malformed-output';
  }
  if (message.includes('terminal bestmove')) return 'terminal-bestmove';
  return 'engine-failure';
}

function privateEngineEnvironment(workerDirectory: string): NodeJS.ProcessEnv {
  return {
    HOME: workerDirectory,
    TMPDIR: workerDirectory,
    PATH: '/usr/bin:/bin',
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    OMP_NUM_THREADS: '1',
    OMP_THREAD_LIMIT: '1',
    OPENBLAS_NUM_THREADS: '1',
    MKL_NUM_THREADS: '1',
    VECLIB_MAXIMUM_THREADS: '1',
    NUMEXPR_NUM_THREADS: '1',
    BLIS_NUM_THREADS: '1',
  };
}

async function waitForLine(
  child: ChildProcessWithoutNullStreams,
  listeners: Set<(line: string) => void>,
  predicate: (line: string) => boolean,
  timeoutMs: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      listeners.delete(onLine);
      reject(new Error('diagnostic-engine-initialization-timeout'));
    }, timeoutMs);
    const onClose = () => {
      clearTimeout(timer);
      listeners.delete(onLine);
      reject(new Error('diagnostic-engine-exited'));
    };
    const onLine = (line: string) => {
      if (!predicate(line)) return;
      clearTimeout(timer);
      child.off('close', onClose);
      listeners.delete(onLine);
      resolve();
    };
    listeners.add(onLine);
    child.once('close', onClose);
  });
}

async function closeEngine(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 500);
    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      child.stdin.end('quit\n');
    } catch {
      child.kill('SIGKILL');
    }
  });
}

async function runSearch(
  engineBin: string,
  evalDir: string,
  workerDirectory: string,
  parent: DiagnosticParent,
  depth: DiagnosticDepth,
): Promise<SearchOutcome> {
  const started = performance.now();
  const expectedRanks = Math.min(MULTIPV, parent.legalMoves);
  const classifier = new TranscriptClassifier(expectedRanks, depth);
  const accumulator = new UsiMultiPvAccumulator({
    multipv: expectedRanks,
    requiredDepth: depth,
  });
  const child = spawn(engineBin, [], {
    cwd: workerDirectory,
    env: privateEngineEnvironment(workerDirectory),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stderr.resume();
  const listeners = new Set<(line: string) => void>();
  let buffer = '';
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      for (const listener of [...listeners]) listener(line);
    }
  });
  const send = (line: string) => {
    if (!child.stdin.writable) throw new Error('diagnostic-engine-not-writable');
    child.stdin.write(`${line}\n`);
  };
  let result: UsiMultiPvResult | undefined;
  let failureKind: FailureKind = 'none';
  try {
    const usi = waitForLine(child, listeners, (line) => line === 'usiok', 15_000);
    send('usi');
    await usi;
    send(`setoption name EvalDir value ${evalDir}`);
    send('setoption name FV_SCALE value 20');
    send(`setoption name USI_Hash value ${HASH_MB}`);
    for (const command of fixedUsiOptionCommands()) send(command);
    const ready = waitForLine(
      child,
      listeners,
      (line) => line === 'readyok',
      120_000,
    );
    send('isready');
    await ready;
    send('usinewgame');
    result = await new Promise<UsiMultiPvResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(onLine);
        reject(new Error('diagnostic-search-timeout'));
      }, TIMEOUT_MS);
      const onClose = () => {
        clearTimeout(timer);
        listeners.delete(onLine);
        reject(new Error('diagnostic-engine-exited'));
      };
      const onLine = (line: string) => {
        accumulator.push(`${line}\n`);
        classifier.consume(line);
        if (!line.startsWith('bestmove')) return;
        clearTimeout(timer);
        child.off('close', onClose);
        listeners.delete(onLine);
        try {
          resolve(accumulator.finish());
        } catch (error) {
          reject(error);
        }
      };
      listeners.add(onLine);
      child.once('close', onClose);
      send(`setoption name MultiPV value ${expectedRanks}`);
      send(`position sfen ${parent.sfen}`);
      send(buildGo({ depth }));
    });
  } catch (error) {
    failureKind = sanitizedFailureKind(error);
  } finally {
    await closeEngine(child);
  }
  return Object.freeze({
    depth,
    complete: result !== undefined,
    failureKind,
    elapsedMs: Math.round(performance.now() - started),
    ...(result === undefined ? {} : { result }),
    transcript: classifier.finish(),
  });
}

async function mapWithConcurrency<T, U>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T, index: number) => Promise<U>,
): Promise<U[]> {
  const output = new Array<U>(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (true) {
        const index = next++;
        const value = values[index];
        if (value === undefined) return;
        output[index] = await operation(value, index);
      }
    }),
  );
  return output;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function ratioPpm(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Error('ratio denominator must be positive');
  return Math.round((numerator * 1_000_000) / denominator);
}

function legalMoveSummary(parents: readonly DiagnosticParent[]) {
  const values = parents.map((parent) => parent.legalMoves);
  return Object.freeze({
    count: values.length,
    min: Math.min(...values),
    median: median(values),
    max: Math.max(...values),
  });
}

function depthAggregate(outcomes: readonly ParentOutcome[], depth: DiagnosticDepth) {
  const searches = outcomes.map((outcome) => ({
    parent: outcome.parent,
    search: outcome.searches[depth],
  }));
  const completed = searches.filter(({ search }) => search.complete);
  const references = completed.filter(
    ({ parent }) =>
      parent.group === 'completed-reference' &&
      parent.referenceMoves !== undefined &&
      parent.referenceNodes !== undefined,
  );
  const recallsPpm = references.map(({ parent, search }) => {
    const resultMoves = new Set(search.result?.lines.map((line) => line.move));
    const referenceMoves = parent.referenceMoves as readonly string[];
    return ratioPpm(
      referenceMoves.filter((move) => resultMoves.has(move)).length,
      referenceMoves.length,
    );
  });
  const referenceNodeRatiosPpm = references.map(({ parent, search }) =>
    ratioPpm(
      search.result?.observedNodes as number,
      parent.referenceNodes as number,
    ),
  );
  const rescoredRank1Contained = references.filter(({ parent, search }) =>
    search.result?.lines.some(
      (line) => line.move === parent.referenceRescoredRank1Move,
    ),
  ).length;
  const failures = {
    timeout: 0,
    incomplete_fixed_depth_ranks: 0,
    malformed_output: 0,
    terminal_bestmove: 0,
    engine_failure: 0,
  };
  for (const { search } of searches) {
    if (search.failureKind === 'none') continue;
    failures[search.failureKind.replaceAll('-', '_') as keyof typeof failures] += 1;
  }
  return Object.freeze({
    attempted: searches.length,
    completed: completed.length,
    critical_completed: completed.filter(({ parent }) => parent.group === 'critical')
      .length,
    completed_reference_completed: references.length,
    failures: Object.freeze(failures),
    elapsed_ms: Object.freeze({
      median: median(searches.map(({ search }) => search.elapsedMs)),
      max: Math.max(...searches.map(({ search }) => search.elapsedMs)),
      sum: searches.reduce((sum, { search }) => sum + search.elapsedMs, 0),
    }),
    completed_reference_top12_set_recall_ppm: Object.freeze({
      count: recallsPpm.length,
      min: recallsPpm.length === 0 ? null : Math.min(...recallsPpm),
      median: median(recallsPpm),
      mean:
        recallsPpm.length === 0
          ? null
          : Math.round(
              recallsPpm.reduce((sum, value) => sum + value, 0) /
                recallsPpm.length,
            ),
    }),
    completed_reference_proposal_nodes_vs_depth16_ppm: Object.freeze({
      count: referenceNodeRatiosPpm.length,
      min:
        referenceNodeRatiosPpm.length === 0
          ? null
          : Math.min(...referenceNodeRatiosPpm),
      median: median(referenceNodeRatiosPpm),
      max:
        referenceNodeRatiosPpm.length === 0
          ? null
          : Math.max(...referenceNodeRatiosPpm),
    }),
    completed_reference_depth16_rescored_rank1_containment: Object.freeze({
      eligible_completed_references: references.length,
      contained: rescoredRank1Contained,
      containment_ppm:
        references.length === 0
          ? null
          : ratioPpm(rescoredRank1Contained, references.length),
    }),
  });
}

function pairedAggregate(outcomes: readonly ParentOutcome[]) {
  const both = outcomes.filter(
    (outcome) => outcome.searches[14].complete && outcome.searches[15].complete,
  );
  const nodeRatios = both.map((outcome) =>
    ratioPpm(
      outcome.searches[15].result?.observedNodes as number,
      outcome.searches[14].result?.observedNodes as number,
    ),
  );
  return Object.freeze({
    attempted_parents: outcomes.length,
    both_depths_completed: both.length,
    critical_both_depths_completed: both.filter(
      (outcome) => outcome.parent.group === 'critical',
    ).length,
    depth15_vs_depth14_nodes_ppm: Object.freeze({
      count: nodeRatios.length,
      min: nodeRatios.length === 0 ? null : Math.min(...nodeRatios),
      median: median(nodeRatios),
      max: nodeRatios.length === 0 ? null : Math.max(...nodeRatios),
    }),
  });
}

async function atomicPrivateJson(
  outputRoot: string,
  outputName: 'aggregate.json' | 'reference-gate.json',
  value: Readonly<Record<string, unknown>>,
): Promise<string> {
  await fs.promises.mkdir(outputRoot, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(outputRoot, 0o700);
  const output = path.join(outputRoot, outputName);
  const temporary = path.join(outputRoot, `.${outputName}.${process.pid}.tmp`);
  await fs.promises.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  await fs.promises.rename(temporary, output);
  return output;
}

export async function runStrengthFirstV9ProposalDiagnostic(): Promise<
  Readonly<Record<string, unknown>>
> {
  const home = os.homedir();
  const rawPath = path.join(
    home,
    '.codex',
    'shogi-bundles',
    'floodgate-q1-2026-label-free-role-bundle-v2',
    'training.raw.jsonl',
  );
  const v8WorkPath = path.join(
    home,
    '.codex',
    'shogi-runs',
    'floodgate-q1-2026-strength-first-v8',
    'work.jsonl',
  );
  const assetRoot = path.join(
    home,
    'Library',
    'Application Support',
    'nextjs-portfolio',
    'shogi-production-teacher-assets-v1',
  );
  const engineBin = path.join(assetRoot, 'engine', 'yaneuraou');
  const evalDir = path.join(assetRoot, 'eval');
  const [engineBytes, evalBytes] = await Promise.all([
    fs.promises.readFile(engineBin),
    fs.promises.readFile(path.join(evalDir, 'nn.bin')),
  ]);
  if (
    engineBytes.byteLength !== ENGINE_BYTES ||
    sha256(engineBytes) !== ENGINE_SHA256 ||
    evalBytes.byteLength !== EVAL_BYTES ||
    sha256(evalBytes) !== EVAL_SHA256
  ) {
    throw new Error('pinned diagnostic asset binding mismatch');
  }
  const outputRoot = path.join(
    home,
    '.codex',
    'shogi-runs',
    'floodgate-q1-2026-strength-first-v9-proposal-diagnostic',
  );
  const workerRoot = path.join(outputRoot, 'workers');
  const [rawBytes, workBytes] = await Promise.all([
    fs.promises.readFile(rawPath),
    fs.promises.readFile(v8WorkPath),
  ]);
  const raw = parseRawParents(rawBytes);
  const rawById = new Map(raw.map((parent) => [parent.parent_id, parent]));
  const v8 = parseV8Work(workBytes, rawById);
  const fatal = raw[FATAL_RAW_ORDINAL - 1];
  if (
    !fatal ||
    fatal.ply !== FATAL_RAW_PLY ||
    v8.accountedParentIds.has(fatal.parent_id) ||
    legalMoveCount(fatal.parent_sfen) !== 6
  ) {
    throw new Error('fatal incomplete-MultiPV parent binding mismatch');
  }
  const fatalParent: DiagnosticParent = Object.freeze({
    group: 'critical',
    sfen: fatal.parent_sfen,
    legalMoves: 6,
    fatalTranscriptClassification: true,
  });
  const critical = Object.freeze([...v8.timeoutParents, fatalParent]);
  const references = selectCompletedReferences(
    v8.completedReferences,
    critical.map((parent) => parent.legalMoves),
  );
  const referenceParents: readonly DiagnosticParent[] = Object.freeze(
    references.map((reference) =>
      Object.freeze({
        group: 'completed-reference' as const,
        sfen: reference.sfen,
        legalMoves: reference.legalMoves,
        referenceMoves: reference.referenceMoves,
        referenceRescoredRank1Move: reference.referenceRescoredRank1Move,
        referenceNodes: reference.referenceNodes,
        fatalTranscriptClassification: false,
      }),
    ),
  );
  const referenceOnly =
    process.env.SHOGI_V9_DIAGNOSTIC_REFERENCE_ONLY === '1';
  const parents = Object.freeze(
    referenceOnly ? [...referenceParents] : [...critical, ...referenceParents],
  );
  await fs.promises.rm(workerRoot, { recursive: true, force: true });
  await fs.promises.mkdir(workerRoot, { recursive: true, mode: 0o700 });
  const startedAt = new Date().toISOString();
  const wallStarted = performance.now();
  let outcomes: ParentOutcome[];
  try {
    outcomes = await mapWithConcurrency(
      parents,
      PARALLEL_PARENT_LANES,
      async (parent, index) => {
        const searches = {} as Record<DiagnosticDepth, SearchOutcome>;
        for (const depth of DEPTHS) {
          const workerDirectory = path.join(workerRoot, `lane-${index}-depth-${depth}`);
          await fs.promises.mkdir(workerDirectory, { recursive: true, mode: 0o700 });
          searches[depth] = await runSearch(
            engineBin,
            evalDir,
            workerDirectory,
            parent,
            depth,
          );
          await fs.promises.rm(workerDirectory, { recursive: true, force: true });
        }
        return Object.freeze({ parent, searches: Object.freeze(searches) });
      },
    );
  } finally {
    await fs.promises.rm(workerRoot, { recursive: true, force: true });
  }
  const fatalOutcome = outcomes.find(
    (outcome) => outcome.parent.fatalTranscriptClassification,
  );
  if (!referenceOnly && !fatalOutcome) {
    throw new Error('fatal transcript outcome is missing');
  }
  const receipt = Object.freeze({
    schema: 'shogi-strength-first-v9-proposal-depth-diagnostic-v1',
    status: 'complete-aggregate-only',
    claim_boundary:
      'bounded-private-proposal-depth-diagnostic-not-teacher-training-strength-or-live-weight-evidence',
    mode: referenceOnly ? 'completed-reference-gate-followup' : 'critical-and-reference',
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    wall_elapsed_ms: Math.round(performance.now() - wallStarted),
    source_bindings: Object.freeze({
      raw_sha256: RAW_SHA256,
      v8_work_sha256: V8_WORK_SHA256,
      v8_work_bytes: V8_WORK_BYTES,
      v8_completed_parent_labels: EXPECTED_COMPLETED_PARENTS,
      v8_proposal_timeout_skips: EXPECTED_TIMEOUT_PARENTS,
      v8_fatal_incomplete_multipv_parents: 1,
      engine_bytes: ENGINE_BYTES,
      engine_sha256: ENGINE_SHA256,
      eval_nn_bytes: EVAL_BYTES,
      eval_nn_sha256: EVAL_SHA256,
    }),
    runtime: Object.freeze({
      local_only: true,
      network_requests: 0,
      engine: 'YaneuraOu',
      parallel_parent_lanes: PARALLEL_PARENT_LANES,
      threads_per_engine: 1,
      fresh_engine_process_per_parent_depth: true,
      hash_mb_per_engine: HASH_MB,
      timeout_ms_per_search: TIMEOUT_MS,
      multipv_cap: MULTIPV,
      requested_depths: DEPTHS,
      process_nice: os.getPriority(0),
      live_weight_changes: 0,
    }),
    sample: Object.freeze({
      critical_parents: critical.length,
      completed_reference_parents: referenceParents.length,
      executed_critical_parents: referenceOnly ? 0 : critical.length,
      executed_completed_reference_parents: referenceParents.length,
      total_parents_executed: parents.length,
      total_searches: parents.length * DEPTHS.length,
      critical_legal_moves: legalMoveSummary(critical),
      completed_reference_legal_moves: legalMoveSummary(referenceParents),
      selection:
        'one nearest completed depth16 reference for each critical legal-move count; ties use higher depth16 proposal nodes then bytewise parent id',
    }),
    results: Object.freeze({
      depth14: depthAggregate(outcomes, 14),
      depth15: depthAggregate(outcomes, 15),
      paired: pairedAggregate(outcomes),
      ...(fatalOutcome === undefined
        ? {}
        : {
            fatal_incomplete_parent_transcript: Object.freeze({
              requested_multipv: Math.min(
                MULTIPV,
                fatalOutcome.parent.legalMoves,
              ),
              depth14: fatalOutcome.searches[14].transcript,
              depth15: fatalOutcome.searches[15].transcript,
            }),
          }),
    }),
    private_payload_fields_emitted: 0,
  });
  await atomicPrivateJson(
    outputRoot,
    referenceOnly ? 'reference-gate.json' : 'aggregate.json',
    receipt,
  );
  return receipt;
}

if (require.main === module) {
  void runStrengthFirstV9ProposalDiagnostic()
    .then((receipt) => {
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
    })
    .catch((error: unknown) => {
      const kind = sanitizedFailureKind(error);
      process.stderr.write(`v9 proposal diagnostic failed (${kind})\n`);
      process.exitCode = 1;
    });
}
