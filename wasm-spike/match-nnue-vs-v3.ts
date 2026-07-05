/**
 * match-nnue-vs-v3.ts — evaluation A/B: WASM search with NNUE leaf eval
 * (real trained weights) vs the same WASM search with the hand-crafted
 * evaluateV3Full(). Pure engine-vs-engine — no opening book, no mate
 * solver on either side — so the ONLY difference is the leaf evaluation.
 *
 * Setup (mirrors match-wasm-vs-js.ts):
 * - Two independent WASM instances (A = NNUE enabled, B = V3 default).
 * - Curated 6-ply opening lines from a deterministic PRNG (--seed offsets
 *   the base so different batches use disjoint openings), colors alternate
 *   every game, the same opening is reused for each color-swapped pair.
 * - Every move from BOTH engines is validated against the JS legal move
 *   list; an illegal move aborts the run with a non-zero exit code.
 * - Draws: fourfold repetition (JS hash) or 256 plies, same as the other
 *   match harnesses.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/match-nnue-vs-v3.ts <weights.bin> \
 *     [--games 16] [--ms 200] [--seed 1] [--k 600]
 */

import { readFileSync } from 'node:fs';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { EMPTY, FU, GOTE, OU, SENTE, Te, getKomashu } from '../src/components/game/ShogiImproved/types';
import { loadShogiWasm, syncWasm, teFromWasmKey, type ShogiSearchWasm } from './search-driver';

interface ShogiNnueSearchWasm extends ShogiSearchWasm {
  memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueScaleK(k: number): void;
  setNnueEnabled(flag: number): void;
}

function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  if (i < 0) return def;
  const n = parseInt(process.argv[i + 1], 10);
  if (!Number.isFinite(n)) throw new Error(`${flag} requires a numeric value`);
  return n;
}

const weightsPath = process.argv[2];
if (!weightsPath || weightsPath.startsWith('--')) {
  console.error('usage: node -r tsx/cjs wasm-spike/match-nnue-vs-v3.ts <weights.bin> [--games 16] [--ms 200] [--seed 1] [--k 600]');
  process.exit(2);
}
const GAMES = argNum('--games', 16);
const MOVE_MS = argNum('--ms', 200);
const SEED_BASE = argNum('--seed', 1);
const SCALE_K = argNum('--k', 600);
const OPENING_PLIES = 6;
const MAX_PLIES = 256;
const MAX_DEPTH = 32;
const QUIESCENCE_DEPTH_MAX = 10;

// ---------------------------------------------------------------------------
// Deterministic RNG + curated opening lines (same policy as match-wasm-vs-js)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickCuratedOpeningMove(k: KyokumenImproved, moves: Te[], rnd: () => number): Te {
  const quiet = moves.filter((m) => m.from !== 0 && m.capture === EMPTY && !m.promote);
  const pawnStartDan = k.teban === SENTE ? 7 : 3;
  const pawnNextDan = k.teban === SENTE ? 6 : 4;

  const pawnPush = quiet.filter(
    (m) => getKomashu(m.koma) === FU && (m.from & 0x0f) === pawnStartDan && (m.to & 0x0f) === pawnNextDan
  );
  if (pawnPush.length > 0) return pawnPush[Math.floor(rnd() * pawnPush.length)];

  const develop = quiet.filter((m) => getKomashu(m.koma) !== OU);
  if (develop.length > 0) return develop[Math.floor(rnd() * develop.length)];
  if (quiet.length > 0) return quiet[Math.floor(rnd() * quiet.length)];
  return moves[Math.floor(rnd() * moves.length)];
}

function buildOpeningLine(pairIndex: number): Te[] {
  const k = new KyokumenImproved();
  k.initHirate();
  const rnd = mulberry32(0x5eed00 + SEED_BASE * 15485863 + pairIndex * 104729);
  const line: Te[] = [];
  for (let ply = 0; ply < OPENING_PLIES; ply++) {
    const moves = GenerateMovesImproved.generateLegalMoves(k);
    if (moves.length === 0) break;
    const te = pickCuratedOpeningMove(k, moves, rnd);
    te.capture = k.get(te.to);
    line.push(te.clone());
    k.move(te);
    k.toggleTeban();
  }
  return line;
}

// ---------------------------------------------------------------------------
// Plain WASM player (no book, no mate solver — pure search + eval)
// ---------------------------------------------------------------------------

class WasmPlayer {
  constructor(readonly name: string, private wasm: ShogiNnueSearchWasm) {}

  newGame(): void {
    this.wasm.clearTT();
  }

  getNextTe(k: KyokumenImproved, tesu: number): Te | null {
    syncWasm(this.wasm, k);
    this.wasm.setRootTesu(tesu);
    const key = this.wasm.searchBestMove(MOVE_MS, MAX_DEPTH, QUIESCENCE_DEPTH_MAX);
    if (key === 0) return null;
    return teFromWasmKey(key, k);
  }
}

// ---------------------------------------------------------------------------
// Game loop (same termination rules as match-wasm-vs-js.ts)
// ---------------------------------------------------------------------------

type PlayResult =
  | { outcome: 'win'; winner: number; plies: number; reason: 'checkmate' | 'noMove' }
  | { outcome: 'draw'; plies: number; reason: 'repetition' | 'maxPlies' | 'stalemate' };

let movesChecked = 0;

function playOneGame(nnue: WasmPlayer, v3: WasmPlayer, nnueIsSente: boolean, openingMoves: Te[]): PlayResult {
  const k = new KyokumenImproved();
  k.initHirate();
  k.setTeban(SENTE);

  for (const opening of openingMoves) {
    const te = opening.clone();
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
  }

  const repetition = new Map<number, number>();

  for (let ply = openingMoves.length; ply < MAX_PLIES; ply++) {
    repetition.set(k.HashVal, (repetition.get(k.HashVal) ?? 0) + 1);
    if ((repetition.get(k.HashVal) ?? 0) >= 4) {
      return { outcome: 'draw', plies: ply, reason: 'repetition' };
    }

    const side = k.teban;
    const nnueToMove = nnueIsSente ? side === SENTE : side === GOTE;
    const player = nnueToMove ? nnue : v3;

    const move = player.getNextTe(k, ply);
    const legalMoves = GenerateMovesImproved.generateLegalMoves(k);

    if (!move) {
      if (legalMoves.length > 0) {
        return { outcome: 'win', winner: side === SENTE ? GOTE : SENTE, plies: ply, reason: 'noMove' };
      }
      const inCheck = GenerateMovesImproved.isKingInCheck(k, side);
      if (inCheck) return { outcome: 'win', winner: side === SENTE ? GOTE : SENTE, plies: ply, reason: 'checkmate' };
      return { outcome: 'draw', plies: ply, reason: 'stalemate' };
    }

    // Strict legality validation for EVERY move from BOTH engines.
    const isLegal = legalMoves.some(
      (te) => te.koma === move.koma && te.from === move.from && te.to === move.to && te.promote === move.promote
    );
    if (!isLegal) {
      console.error(
        `ILLEGAL MOVE by ${player.name} at ply ${ply}: ${move.toString()} ` +
          `(koma=${move.koma} from=${move.from.toString(16)} to=${move.to.toString(16)} promote=${move.promote})`
      );
      process.exit(1);
    }
    movesChecked++;

    move.capture = k.get(move.to);
    k.move(move);
    k.toggleTeban();
  }

  return { outcome: 'draw', plies: MAX_PLIES, reason: 'maxPlies' };
}

// ---------------------------------------------------------------------------

function main(): void {
  // Instance A: NNUE with real trained weights.
  const wasmA = loadShogiWasm() as ShogiNnueSearchWasm;
  const weightsBin = readFileSync(weightsPath);
  if (weightsBin.byteLength !== wasmA.getNnueWeightsSize()) {
    console.error(`weights.bin size mismatch: file=${weightsBin.byteLength} wasm=${wasmA.getNnueWeightsSize()}`);
    process.exit(1);
  }
  new Uint8Array(wasmA.memory.buffer, wasmA.getNnueWeightsPtr(), weightsBin.byteLength).set(weightsBin);
  wasmA.setNnueScaleK(SCALE_K);
  wasmA.setNnueEnabled(1);

  // Instance B: stock hand-crafted evaluateV3Full (NNUE stays disabled).
  const wasmB = loadShogiWasm() as ShogiNnueSearchWasm;

  const nnuePlayer = new WasmPlayer('NNUE', wasmA);
  const v3Player = new WasmPlayer('V3', wasmB);

  let nnueWins = 0;
  let v3Wins = 0;
  let draws = 0;

  console.log(
    `=== match: WASM+NNUE(real weights, K=${SCALE_K}) vs WASM+V3 — ${GAMES} games, ${MOVE_MS}ms/move, ` +
      `opening ${OPENING_PLIES} plies (seed base ${SEED_BASE}), no book / no mate solver ===`
  );

  for (let game = 0; game < GAMES; game++) {
    const nnueIsSente = game % 2 === 0;
    const openingMoves = buildOpeningLine(game >> 1); // same opening for the color-swapped pair
    nnuePlayer.newGame();
    v3Player.newGame();

    const start = performance.now();
    const result = playOneGame(nnuePlayer, v3Player, nnueIsSente, openingMoves);
    const elapsed = ((performance.now() - start) / 1000).toFixed(1);

    let summary: string;
    if (result.outcome === 'win') {
      const nnueWon = nnueIsSente ? result.winner === SENTE : result.winner === GOTE;
      if (nnueWon) nnueWins++;
      else v3Wins++;
      summary = `WIN ${nnueWon ? 'NNUE' : 'V3'} (${result.reason}, ${result.winner === SENTE ? 'SENTE' : 'GOTE'})`;
    } else {
      draws++;
      summary = `DRAW (${result.reason})`;
    }
    console.log(
      `game ${game + 1}/${GAMES}: NNUE=${nnueIsSente ? 'SENTE' : 'GOTE'} => ${summary} plies=${result.plies} time=${elapsed}s`
    );
  }

  const decisive = nnueWins + v3Wins;
  const score = nnueWins + draws / 2;
  console.log(`\nresult: NNUE ${nnueWins} wins / V3 ${v3Wins} wins / ${draws} draws (all ${movesChecked} moves legal)`);
  console.log(
    `NNUE score: ${score}/${GAMES} (${((score / GAMES) * 100).toFixed(1)}%)` +
      (decisive > 0 ? `, decisive-only: ${nnueWins}/${decisive} (${((nnueWins / decisive) * 100).toFixed(1)}%)` : '')
  );
}

main();
