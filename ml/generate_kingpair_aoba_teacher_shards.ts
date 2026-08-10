import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { positionKeyFromSfen } from './sibling-data';
import { childSfenAfterUsi, positionFromSfen, rulesCompleteLegalMoves } from './shogi-sfen';
import { UsiSearchTimeoutError, UsiTeacherEngine } from './usi-engine';
import { UsiFixedDepthRanksIncompleteError } from './usi-multipv';

const ENGINE =
  '/Users/yudaiyaguchi/.codex/shogi-runs/aobannue-external-calibration-20260806/' +
  'package/AobaNNUE/source/YaneuraOu-by-gcc';
const EVAL =
  '/Users/yudaiyaguchi/.codex/shogi-runs/aobannue-external-calibration-20260806/' +
  'package/AobaNNUE/eval/nn.bin';
const ENGINE_SHA256 = '44d2643a2f921fff19dcb62974dd8e0a989bd81cd29766037f2615f6e4c2fdff';
const EVAL_SHA256 = 'f8ee839ae8c08537036f23345dd5ed0416958b22425476fc60177942903219b5';
const ENGINE_BYTES = 699_168;
const EVAL_BYTES = 192_624_720;
const DEPTH = 12;
const MULTIPV = 4;
const HASH_MIB = 512;
const TIMEOUT_MS = 600_000;
// AobaNNUE reproducibly SIGSEGVs after a long sequence of unrelated parents
// even when every individual position is valid. Keep one engine lifetime
// bounded without changing depth, MultiPV, labels, or shard atomicity.
export const PARENTS_PER_ENGINE = 32;

export const SELECTION_HEADER_SCHEMA = 'shogi-kingpair-aoba-selection-shard-v1';
export const SELECTION_ROW_SCHEMA = 'shogi-kingpair-aoba-parent-selection-v1';
export const OUTPUT_HEADER_SCHEMA = 'shogi-kingpair-aoba-teacher-shard-header-v1';
export const OUTPUT_PARENT_SCHEMA = 'shogi-kingpair-aoba-parent-label-v1';
export const OUTPUT_REJECT_SCHEMA = 'shogi-kingpair-aoba-parent-reject-v1';
export const OUTPUT_FOOTER_SCHEMA = 'shogi-kingpair-aoba-teacher-shard-footer-v1';

export interface SelectionHeader {
  readonly schema: typeof SELECTION_HEADER_SCHEMA;
  readonly shard_index: number;
  readonly shard_count: number;
  readonly rows: number;
  readonly selection_contract_sha256: string;
}

export interface SelectionRow {
  readonly schema: typeof SELECTION_ROW_SCHEMA;
  readonly global_index: number;
  readonly domain: string;
  readonly split: 'train' | 'development' | 'holdout';
  readonly game_id: string;
  readonly ply: number;
  readonly parent_sfen: string;
  readonly position_id: string;
  readonly legal_moves: number;
  readonly priority_sha256: string;
}

interface ExactLine {
  readonly move: string;
  readonly cp: number;
  readonly multipv: number;
  readonly scoreKind: string;
  readonly depth: number;
  readonly pv: readonly string[];
  readonly nodes: number;
  readonly mate?: number;
  readonly mateSign?: 1 | -1;
}

export interface ExactSnapshot {
  readonly depth: number;
  readonly lines: readonly ExactLine[];
  readonly bestmove: string;
  readonly observedNodes: number;
}

interface Options {
  readonly selectionRoot: string;
  readonly outputRoot: string;
  readonly worker: number;
  readonly workers: number;
  readonly maximumShards: number | null;
}

function sha256Bytes(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path));
}

function exactInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`);
  }
  return value as number;
}

function exactString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a nonempty string`);
  return value;
}

function parseOptions(argv: readonly string[]): Options {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('arguments must be --key value pairs');
    values.set(key.slice(2), value);
  }
  const integer = (key: string, fallback?: number): number => {
    const raw = values.get(key);
    if (raw === undefined && fallback !== undefined) return fallback;
    return exactInteger(Number(raw), `--${key}`);
  };
  const worker = integer('worker');
  const workers = integer('workers', 8);
  if (workers < 1 || worker >= workers) throw new Error('worker partition must satisfy 0 <= worker < workers');
  const maximumShards = values.has('maximum-shards') ? integer('maximum-shards') : null;
  if (maximumShards === 0) throw new Error('--maximum-shards must be positive');
  return {
    selectionRoot: resolve(exactString(values.get('selection-root'), '--selection-root')),
    outputRoot: resolve(exactString(values.get('output-root'), '--output-root')),
    worker,
    workers,
    maximumShards,
  };
}

function selectionShardIndex(name: string): number {
  const match = /^selection-(\d{5})-of-(\d{5})\.jsonl$/.exec(name);
  if (!match) throw new Error(`invalid selection shard filename: ${name}`);
  const index = Number(match[1]);
  const count = Number(match[2]);
  if (count < 1 || index >= count) throw new Error(`invalid selection shard range: ${name}`);
  return index;
}

export function assignedShardIndices(shardCount: number, worker: number, workers: number): number[] {
  exactInteger(shardCount, 'shardCount', 1);
  exactInteger(worker, 'worker');
  exactInteger(workers, 'workers', 1);
  if (worker >= workers) throw new Error('worker must be smaller than workers');
  return Array.from({ length: shardCount }, (_, index) => index).filter((index) => index % workers === worker);
}

export function parentChunks<T>(rows: readonly T[]): readonly (readonly T[])[] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += PARENTS_PER_ENGINE) {
    chunks.push(rows.slice(offset, offset + PARENTS_PER_ENGINE));
  }
  return chunks;
}

export function isRecoverableEngineCrash(error: unknown): boolean {
  return error instanceof Error && /signal=SIGSEGV/.test(error.message);
}

export function isRecoverableSearchTimeout(error: unknown): boolean {
  return error instanceof UsiSearchTimeoutError && error.timeoutMs === TIMEOUT_MS;
}

export function buildEngineCrashReject(row: SelectionRow): Record<string, unknown> {
  return {
    schema: OUTPUT_REJECT_SCHEMA,
    global_index: row.global_index,
    position_id: row.position_id,
    reason: 'engine-sigsegv-after-one-fresh-process-retry',
    requested_depth: DEPTH,
    engine_sha256: ENGINE_SHA256,
    eval_sha256: EVAL_SHA256,
    technical_faults: 0,
  };
}

export function buildSearchTimeoutReject(row: SelectionRow): Record<string, unknown> {
  return {
    schema: OUTPUT_REJECT_SCHEMA,
    global_index: row.global_index,
    position_id: row.position_id,
    reason: 'engine-search-timeout-without-label',
    requested_depth: DEPTH,
    timeout_ms: TIMEOUT_MS,
    engine_sha256: ENGINE_SHA256,
    eval_sha256: EVAL_SHA256,
    technical_faults: 0,
  };
}

export function parseSelectionShard(text: string): { header: SelectionHeader; rows: SelectionRow[] } {
  const lines = text.trimEnd().split('\n');
  if (lines.length < 2) throw new Error('selection shard must contain a header and rows');
  const header = JSON.parse(lines[0]) as SelectionHeader;
  if (header.schema !== SELECTION_HEADER_SCHEMA) throw new Error('selection header schema mismatch');
  exactInteger(header.shard_index, 'selection shard index');
  exactInteger(header.shard_count, 'selection shard count', 1);
  exactInteger(header.rows, 'selection shard rows', 1);
  if (!/^[0-9a-f]{64}$/.test(header.selection_contract_sha256)) {
    throw new Error('selection contract SHA is invalid');
  }
  const rows = lines.slice(1).map((line, offset) => {
    const row = JSON.parse(line) as SelectionRow;
    if (row.schema !== SELECTION_ROW_SCHEMA) throw new Error(`selection row schema mismatch at ${offset}`);
    exactInteger(row.global_index, `selection row ${offset} global_index`);
    exactInteger(row.ply, `selection row ${offset} ply`);
    exactInteger(row.legal_moves, `selection row ${offset} legal_moves`, 2);
    exactString(row.domain, `selection row ${offset} domain`);
    exactString(row.game_id, `selection row ${offset} game_id`);
    if (row.split !== 'train' && row.split !== 'development' && row.split !== 'holdout') {
      throw new Error(`selection row ${offset} split is invalid`);
    }
    if (!/^[0-9a-f]{64}$/.test(row.priority_sha256)) throw new Error(`selection row ${offset} priority is invalid`);
    if (positionKeyFromSfen(row.parent_sfen) !== row.position_id) {
      throw new Error(`selection row ${offset} position identity mismatch`);
    }
    return row;
  });
  if (rows.length !== header.rows) throw new Error('selection header row count mismatch');
  if (new Set(rows.map((row) => row.global_index)).size !== rows.length) {
    throw new Error('selection shard has duplicate global indices');
  }
  if (new Set(rows.map((row) => row.position_id)).size !== rows.length) {
    throw new Error('selection shard has duplicate semantic positions');
  }
  return { header, rows };
}

export function buildExactParentLabel(
  row: SelectionRow,
  legalMoves: readonly string[],
  snapshot: ExactSnapshot,
): Record<string, unknown> {
  const requested = Math.min(MULTIPV, legalMoves.length);
  if (snapshot.depth !== DEPTH || snapshot.lines.length !== requested) {
    throw new Error('teacher returned an incomplete fixed-depth snapshot');
  }
  const seen = new Set<string>();
  const moves = snapshot.lines.map((line, index) => {
    if (
      line.depth !== DEPTH || line.multipv !== index + 1 || !legalMoves.includes(line.move) ||
      seen.has(line.move) || (line.scoreKind !== 'cp' && line.scoreKind !== 'mate') ||
      !Number.isFinite(line.cp) ||
      (line.scoreKind === 'mate' &&
        (!Number.isSafeInteger(line.mate) || (line.mateSign !== 1 && line.mateSign !== -1))) ||
      (line.scoreKind === 'cp' && (line.mate !== undefined || line.mateSign !== undefined))
    ) {
      throw new Error('teacher line contract mismatch');
    }
    seen.add(line.move);
    const child = childSfenAfterUsi(row.parent_sfen, line.move);
    return {
      usi: line.move,
      teacher_parent_cp: line.cp,
      teacher_child_cp: -line.cp,
      teacher_rank: line.multipv,
      score_kind: line.scoreKind,
      ...(line.scoreKind === 'mate' ? { mate: line.mate, mate_sign: line.mateSign } : {}),
      depth: line.depth,
      child_sfen: child,
      child_position_id: positionKeyFromSfen(child),
      pv: line.pv,
      nodes: line.nodes,
    };
  });
  if (!seen.has(snapshot.bestmove) || snapshot.bestmove !== moves[0]?.usi) {
    throw new Error('teacher bestmove does not match exact rank one');
  }
  return {
    schema: OUTPUT_PARENT_SCHEMA,
    global_index: row.global_index,
    domain: row.domain,
    split: row.split,
    game_id: row.game_id,
    ply: row.ply,
    parent_sfen: row.parent_sfen,
    position_id: row.position_id,
    legal_moves: legalMoves.length,
    candidate_moves: moves.length,
    requested_depth: DEPTH,
    multipv: requested,
    observed_nodes: snapshot.observedNodes,
    bestmove: snapshot.bestmove,
    moves,
    engine_sha256: ENGINE_SHA256,
    eval_sha256: EVAL_SHA256,
    technical_faults: 0,
  };
}

function verifyTeacherAssets(): void {
  if (statSync(ENGINE).size !== ENGINE_BYTES || sha256File(ENGINE) !== ENGINE_SHA256) {
    throw new Error('Aoba engine identity mismatch');
  }
  if (statSync(EVAL).size !== EVAL_BYTES || sha256File(EVAL) !== EVAL_SHA256) {
    throw new Error('Aoba eval identity mismatch');
  }
}

function engineEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OMP_NUM_THREADS: '1',
    OMP_THREAD_LIMIT: '1',
    OPENBLAS_NUM_THREADS: '1',
    MKL_NUM_THREADS: '1',
    VECLIB_MAXIMUM_THREADS: '1',
    NUMEXPR_NUM_THREADS: '1',
  };
}

function validateExistingOutput(path: string, inputSha256: string, shardIndex: number): void {
  const lines = readFileSync(path, 'utf8').trimEnd().split('\n');
  if (lines.length < 2) throw new Error(`existing output is incomplete: ${path}`);
  const header = JSON.parse(lines[0]) as Record<string, unknown>;
  const footer = JSON.parse(lines.at(-1) as string) as Record<string, unknown>;
  if (
    header.schema !== OUTPUT_HEADER_SCHEMA || header.input_sha256 !== inputSha256 ||
    header.shard_index !== shardIndex || footer.schema !== OUTPUT_FOOTER_SCHEMA ||
    footer.shard_index !== shardIndex || footer.technical_faults !== 0 ||
    (footer.completed as number) + (footer.rejected_nonexact as number) +
      ((footer.rejected_engine_crash as number | undefined) ?? 0) +
      ((footer.rejected_timeout as number | undefined) ?? 0) !== footer.assigned
  ) {
    throw new Error(`existing output contract mismatch: ${path}`);
  }
}

function atomicLines(path: string, lines: readonly string[]): void {
  const temporary = `${path}.tmp.${process.pid}`;
  const fd = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(fd, `${lines.join('\n')}\n`, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    // A hard link publishes create-only atomically. rename(2) would overwrite a
    // completed shard if two recovery workers raced after the exists check.
    linkSync(temporary, path);
  } catch (error) {
    rmSync(temporary);
    throw new Error(`refusing to overwrite completed shard: ${path}`, { cause: error });
  }
  rmSync(temporary);
}

function createTeacherEngine(outputRoot: string, worker: number): UsiTeacherEngine {
  const engineRoot = join(outputRoot, 'engines', `worker-${worker}`);
  mkdirSync(engineRoot, { recursive: true, mode: 0o700 });
  return new UsiTeacherEngine({
    engineBin: ENGINE,
    evalDir: EVAL.replace(/\/nn\.bin$/, ''),
    fvScale: 40,
    hashMb: HASH_MIB,
    timeoutMs: TIMEOUT_MS,
    cwd: engineRoot,
    env: engineEnvironment(),
  });
}

async function processShard(
  inputPath: string,
  outputRoot: string,
  worker: number,
): Promise<{
  completed: number;
  rejected: number;
  rejectedEngineCrash: number;
  rejectedTimeout: number;
}> {
  const input = readFileSync(inputPath);
  const inputSha256 = sha256Bytes(input);
  const { header, rows } = parseSelectionShard(input.toString('utf8'));
  if (selectionShardIndex(basename(inputPath)) !== header.shard_index) {
    throw new Error(`selection filename/header index mismatch: ${inputPath}`);
  }
  const destination = join(outputRoot, `teacher-${String(header.shard_index).padStart(5, '0')}-of-${String(header.shard_count).padStart(5, '0')}.jsonl`);
  if (existsSync(destination)) {
    validateExistingOutput(destination, inputSha256, header.shard_index);
    return { completed: 0, rejected: 0, rejectedEngineCrash: 0, rejectedTimeout: 0 };
  }
  const output = [JSON.stringify({
    schema: OUTPUT_HEADER_SCHEMA,
    shard_index: header.shard_index,
    shard_count: header.shard_count,
    assigned: rows.length,
    input_path: inputPath,
    input_bytes: input.length,
    input_sha256: inputSha256,
    selection_contract_sha256: header.selection_contract_sha256,
    engine_sha256: ENGINE_SHA256,
    eval_sha256: EVAL_SHA256,
    depth: DEPTH,
    multipv: MULTIPV,
  })];
  let completed = 0;
  let rejected = 0;
  let rejectedEngineCrash = 0;
  let rejectedTimeout = 0;
  for (const chunk of parentChunks(rows)) {
    let engine = createTeacherEngine(outputRoot, worker);
    try {
      await engine.init();
      for (const row of chunk) {
        const legal = rulesCompleteLegalMoves(positionFromSfen(row.parent_sfen).position).map((entry) => entry.usi);
        if (legal.length !== row.legal_moves || legal.length < 2) throw new Error('selection legal count drift');
        const search = async (): Promise<ExactSnapshot> => {
          await engine.resetForParent();
          return engine.search(row.parent_sfen, Math.min(MULTIPV, legal.length), { depth: DEPTH }, [], true);
        };
        try {
          let snapshot: ExactSnapshot;
          try {
            snapshot = await search();
          } catch (error) {
            if (!isRecoverableEngineCrash(error)) throw error;
            await engine.quit();
            engine = createTeacherEngine(outputRoot, worker);
            await engine.init();
            snapshot = await search();
          }
          output.push(JSON.stringify(buildExactParentLabel(row, legal, snapshot)));
          completed++;
        } catch (error) {
          if (isRecoverableEngineCrash(error)) {
            output.push(JSON.stringify(buildEngineCrashReject(row)));
            rejectedEngineCrash++;
            // The retry process also exited, so it cannot serve the next row
            // in this chunk. Recreate it now while retaining the structured
            // unlabeled reject for only the crashing parent.
            await engine.quit();
            engine = createTeacherEngine(outputRoot, worker);
            await engine.init();
            continue;
          }
          if (isRecoverableSearchTimeout(error)) {
            output.push(JSON.stringify(buildSearchTimeoutReject(row)));
            rejectedTimeout++;
            // A timed-out search has no exact label and may still have a live
            // engine process. Discard it before continuing with the next row.
            await engine.quit();
            engine = createTeacherEngine(outputRoot, worker);
            await engine.init();
            continue;
          }
          if (!(error instanceof UsiFixedDepthRanksIncompleteError)) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(
              `teacher technical failure global_index=${row.global_index} position_id=${row.position_id}: ${message}`,
            );
          }
          output.push(JSON.stringify({
            schema: OUTPUT_REJECT_SCHEMA,
            global_index: row.global_index,
            position_id: row.position_id,
            reason: 'nonexact-fixed-depth-bound',
            requested_depth: DEPTH,
            engine_sha256: ENGINE_SHA256,
            eval_sha256: EVAL_SHA256,
            technical_faults: 0,
          }));
          rejected++;
        }
      }
    } finally {
      await engine.quit();
    }
  }
  output.push(JSON.stringify({
    schema: OUTPUT_FOOTER_SCHEMA,
    shard_index: header.shard_index,
    assigned: rows.length,
    completed,
    rejected_nonexact: rejected,
    rejected_engine_crash: rejectedEngineCrash,
    rejected_timeout: rejectedTimeout,
    technical_faults: 0,
    worker,
  }));
  atomicLines(destination, output);
  return { completed, rejected, rejectedEngineCrash, rejectedTimeout };
}

async function main(): Promise<void> {
  const configured = parseOptions(process.argv.slice(2));
  verifyTeacherAssets();
  mkdirSync(configured.outputRoot, { recursive: true, mode: 0o700 });
  const names = readdirSync(configured.selectionRoot)
    .filter((name) => /^selection-\d{5}-of-\d{5}\.jsonl$/.test(name))
    .sort();
  if (names.length === 0) throw new Error('selection root has no shards');
  const assigned = names.filter((name) => selectionShardIndex(name) % configured.workers === configured.worker);
  const work = configured.maximumShards === null ? assigned : assigned.slice(0, configured.maximumShards);
  let completed = 0;
  let rejected = 0;
  let rejectedEngineCrash = 0;
  let rejectedTimeout = 0;
  for (const name of work) {
    const result = await processShard(join(configured.selectionRoot, name), configured.outputRoot, configured.worker);
    completed += result.completed;
    rejected += result.rejected;
    rejectedEngineCrash += result.rejectedEngineCrash;
    rejectedTimeout += result.rejectedTimeout;
    console.log(JSON.stringify({
      worker: configured.worker,
      shard: basename(name),
      completed,
      rejected_nonexact: rejected,
      rejected_engine_crash: rejectedEngineCrash,
      rejected_timeout: rejectedTimeout,
      technical_faults: 0,
    }));
  }
  console.log(JSON.stringify({
    worker: configured.worker,
    status: 'complete',
    shards: work.length,
    completed,
    rejected_nonexact: rejected,
    rejected_engine_crash: rejectedEngineCrash,
    rejected_timeout: rejectedTimeout,
    technical_faults: 0,
  }));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
