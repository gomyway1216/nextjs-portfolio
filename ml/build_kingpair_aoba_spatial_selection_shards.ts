import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
  SELECTION_HEADER_SCHEMA,
  SELECTION_ROW_SCHEMA,
} from './generate_kingpair_aoba_teacher_shards';
import { positionKeyFromSfen } from './sibling-data';
import { positionFromSfen, rulesCompleteLegalMoves } from './shogi-sfen';

const DEFAULT_PROTOCOL = join(__dirname, 'protocols', 'dpa-halfkp96-nnue-10m-fast-v1-plan.json');
const SHARD_ROWS = 256;
const DOMAIN = 'fresh-selfplay';
const PRIORITY_SALT = 'kingpair-aoba-spatial-selection-v1\0';
const SHA256 = /^[0-9a-f]{64}$/;
const GAME_FILE = /^game-(\d+)\.jsonl$/;
const CONTRACTS = new Map([
  ['shogi-spatial-policy-value-selfplay-game-v1', 'shogi-spatial-policy-value-selfplay-position-v1'],
  ['shogi-compact-policy-value-selfplay-game-v1', 'shogi-compact-policy-value-selfplay-position-v1'],
]);

export interface GameRoot {
  readonly path: string;
  readonly modelPayloadSha256: string;
}

export interface BuildOptions {
  readonly gameRoots: readonly GameRoot[];
  readonly outputRoot: string;
  readonly targetParents: number;
  readonly protocolPath?: string;
}

interface SourceRow {
  readonly schema: string;
  readonly game_id: string;
  readonly ply: number;
  readonly side: number;
  readonly planes: readonly number[];
  readonly moves: readonly unknown[];
}

interface Footer {
  readonly schema: string;
  readonly game_id: string;
  readonly game_index: number;
  readonly positions: number;
  readonly model_payload_sha256: string;
  readonly technical_faults: number;
}

interface Candidate {
  readonly priority: string;
  readonly gameId: string;
  readonly ply: number;
  readonly sfen: string;
  readonly positionId: string;
  readonly legalMoves: number;
}

const BOARD_PIECES = [
  'P', 'L', 'N', 'S', 'G', 'B', 'R', 'K', '+P', '+L', '+N', '+S', '+B', '+R',
] as const;
const HAND_PIECES = ['P', 'L', 'N', 'S', 'G', 'B', 'R'] as const;
const HAND_MAXIMA = [18, 4, 4, 4, 4, 2, 2] as const;

/** Invert the persisted 43-plane side-relative board representation. */
function decodeSpatialPlanesToSfen(row: Pick<SourceRow, 'planes' | 'side' | 'ply'>): string {
  if (row.planes.length !== 43 * 81) throw new Error('spatial row plane count drift');
  if ((row.side !== 16 && row.side !== 32) || !Number.isSafeInteger(row.ply) || row.ply < 0) {
    throw new Error('spatial row side/ply drift');
  }
  const board = new Map<string, string>();
  for (let plane = 0; plane < 28; plane++) {
    const own = plane < 14;
    const piece = BOARD_PIECES[plane % 14];
    const rendered = (row.side === 16 ? own : !own) ? piece : piece.toLowerCase();
    for (let file = 1; file <= 9; file++) for (let rank = 1; rank <= 9; rank++) {
      const value = Number(row.planes[plane * 81 + (file - 1) * 9 + rank - 1]);
      if (value !== 0 && value !== 1) throw new Error('spatial board plane is not binary');
      if (!value) continue;
      const key = `${row.side === 16 ? file : 10 - file}:${row.side === 16 ? rank : 10 - rank}`;
      if (board.has(key)) throw new Error('spatial board planes overlap');
      board.set(key, rendered);
    }
  }
  const ranks: string[] = [];
  for (let rank = 1; rank <= 9; rank++) {
    let text = '';
    let empty = 0;
    for (let file = 9; file >= 1; file--) {
      const piece = board.get(`${file}:${rank}`);
      if (!piece) {
        empty++;
      } else {
        if (empty) text += String(empty);
        text += piece;
        empty = 0;
      }
    }
    ranks.push(text + (empty ? String(empty) : ''));
  }
  const hands = new Map<string, number>();
  for (let relative = 0; relative < 2; relative++) HAND_PIECES.forEach((piece, index) => {
    const plane = 28 + relative * 7 + index;
    const raw = Number(row.planes[plane * 81]);
    const count = Math.round(raw * HAND_MAXIMA[index]);
    if (
      !Number.isFinite(raw) || count < 0 || count > HAND_MAXIMA[index] ||
      Math.abs(raw - count / HAND_MAXIMA[index]) > 1e-6 ||
      row.planes.slice(plane * 81, (plane + 1) * 81).some((value) => Math.abs(Number(value) - raw) > 1e-6)
    ) throw new Error('spatial hand plane drift');
    const sente = row.side === 16 ? relative === 0 : relative === 1;
    if (count) hands.set(sente ? piece : piece.toLowerCase(), count);
  });
  const handOrder = ['R', 'B', 'G', 'S', 'N', 'L', 'P', 'r', 'b', 'g', 's', 'n', 'l', 'p'];
  const hand = handOrder.map((piece) => {
    const count = hands.get(piece) ?? 0;
    return count ? `${count > 1 ? count : ''}${piece}` : '';
  }).join('') || '-';
  return `${ranks.join('/')} ${row.side === 16 ? 'b' : 'w'} ${hand} ${row.ply + 1}`;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function durableWrite(path: string, text: string): void {
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, text, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function parseGame(path: string, fileIndex: number, payload: string, gameIds: Set<string>): SourceRow[] {
  const lines = readFileSync(path, 'utf8').trimEnd().split('\n');
  if (lines.length < 2) throw new Error(`source game is incomplete: ${path}`);
  const footer = JSON.parse(lines.at(-1)!) as Footer;
  const rowSchema = CONTRACTS.get(footer.schema);
  if (
    !rowSchema || footer.game_index !== fileIndex || footer.positions !== lines.length - 1 ||
    footer.technical_faults !== 0 || footer.model_payload_sha256 !== payload ||
    typeof footer.game_id !== 'string' || gameIds.has(footer.game_id)
  ) throw new Error(`source footer/index/payload contract drift: ${path}`);
  gameIds.add(footer.game_id);
  return lines.slice(0, -1).map((line, index) => {
    const row = JSON.parse(line) as SourceRow;
    if (
      row.schema !== rowSchema || row.game_id !== footer.game_id || row.ply !== index ||
      !Array.isArray(row.planes) || !Array.isArray(row.moves)
    ) throw new Error(`source row/index contract drift: ${path}:${index + 1}`);
    return row;
  });
}

function candidates(gameRoots: readonly GameRoot[]): Candidate[] {
  const byPosition = new Map<string, Candidate>();
  const gameIds = new Set<string>();
  for (const root of [...gameRoots].sort((a, b) => resolve(a.path).localeCompare(resolve(b.path)))) {
    if (!SHA256.test(root.modelPayloadSha256)) throw new Error(`invalid model payload SHA: ${root.path}`);
    const path = resolve(root.path);
    const files = readdirSync(path).filter((name) => GAME_FILE.test(name)).sort();
    if (files.length === 0) throw new Error(`game root is empty: ${path}`);
    for (const name of files) {
      const fileIndex = Number(GAME_FILE.exec(name)![1]);
      for (const row of parseGame(join(path, name), fileIndex, root.modelPayloadSha256, gameIds)) {
        const sfen = decodeSpatialPlanesToSfen(row);
        const positionId = positionKeyFromSfen(sfen);
        const legal = rulesCompleteLegalMoves(positionFromSfen(sfen).position).map((move) => move.usi);
        const moves = row.moves;
        if (
          moves.some((move) => typeof move !== 'string' || !legal.includes(move)) ||
          new Set(moves).size !== moves.length
        ) throw new Error(`source move legality drift: ${name}:${row.ply}`);
        if (byPosition.has(positionId)) continue;
        if (legal.length < 4) continue;
        byPosition.set(positionId, {
          priority: sha256(`${PRIORITY_SALT}${positionId}`),
          gameId: row.game_id,
          ply: row.ply,
          sfen,
          positionId,
          legalMoves: legal.length,
        });
      }
    }
  }
  return [...byPosition.values()].sort((a, b) => a.priority.localeCompare(b.priority));
}

export function buildSpatialSelection(options: BuildOptions): { selected: number; shards: number } {
  if (existsSync(options.outputRoot)) throw new Error('selection output root already exists');
  if (!Number.isSafeInteger(options.targetParents) || options.targetParents < 1 || options.targetParents > 800_000) {
    throw new Error('target parents must be an integer from 1 through 800000');
  }
  if (options.gameRoots.length === 0) throw new Error('at least one game root is required');
  const protocolSha = sha256(readFileSync(resolve(options.protocolPath ?? DEFAULT_PROTOCOL)));
  const selected = candidates(options.gameRoots).slice(0, options.targetParents);
  if (selected.length !== options.targetParents) {
    throw new Error(`only ${selected.length} legal unique parents; target is ${options.targetParents}`);
  }
  const shardCount = Math.ceil(selected.length / SHARD_ROWS);
  const output = resolve(options.outputRoot);
  const staging = `${output}.building.${process.pid}`;
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  mkdirSync(staging, { recursive: false, mode: 0o700 });
  try {
    for (let shard = 0; shard < shardCount; shard++) {
      const parents = selected.slice(shard * SHARD_ROWS, (shard + 1) * SHARD_ROWS);
      const header = {
        schema: SELECTION_HEADER_SCHEMA,
        shard_index: shard,
        shard_count: shardCount,
        rows: parents.length,
        selection_contract_sha256: protocolSha,
      };
      const rows = parents.map((parent, offset) => ({
        schema: SELECTION_ROW_SCHEMA,
        global_index: shard * SHARD_ROWS + offset,
        domain: DOMAIN,
        split: 'train',
        game_id: parent.gameId,
        ply: parent.ply,
        parent_sfen: parent.sfen,
        position_id: parent.positionId,
        legal_moves: parent.legalMoves,
        priority_sha256: parent.priority,
      }));
      const name = `selection-${String(shard).padStart(5, '0')}-of-${String(shardCount).padStart(5, '0')}.jsonl`;
      durableWrite(join(staging, name), `${[header, ...rows].map((value) => JSON.stringify(value)).join('\n')}\n`);
    }
    renameSync(staging, output);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return { selected: selected.length, shards: shardCount };
}

function cli(argv: readonly string[]): BuildOptions {
  const roots: string[] = [];
  const payloads: string[] = [];
  let outputRoot = '';
  let protocolPath: string | undefined;
  let targetParents = 0;
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('arguments must be --key value pairs');
    if (key === '--game-root') roots.push(value);
    else if (key === '--model-payload-sha256') payloads.push(value);
    else if (key === '--output-root') outputRoot = value;
    else if (key === '--protocol') protocolPath = value;
    else if (key === '--target-parents') targetParents = Number(value);
    else throw new Error(`unknown argument: ${key}`);
  }
  if (!outputRoot || roots.length !== payloads.length) throw new Error('root/payload/output arguments are incomplete');
  return { gameRoots: roots.map((path, index) => ({ path, modelPayloadSha256: payloads[index] })), outputRoot, targetParents, protocolPath };
}

if (require.main === module) {
  try {
    console.log(JSON.stringify(buildSpatialSelection(cli(process.argv.slice(2)))));
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  }
}
