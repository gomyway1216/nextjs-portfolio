/**
 * match-mt-vs-st.ts — strength A/B: Lazy SMP multi-thread WASM search
 * (default 4 threads over the shared TT) vs the identical single-thread WASM
 * search. Both sides use the NNUE evaluation (production medium+ setup); the
 * ONLY difference is the thread count, so the score isolates the Lazy SMP
 * gain.
 *
 * Setup mirrors match-nnue-vs-v3.ts: curated 6-ply openings from a seeded
 * PRNG, colors alternate per game with the same opening reused for each
 * color-swapped pair, every move of BOTH engines validated against the JS
 * legal move list (an illegal move aborts with exit 1), fourfold repetition /
 * 256 plies are draws. TTs persist across moves of one game and are cleared
 * between games, like production.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/mt/match-mt-vs-st.ts \
 *     [--games 24] [--ms 2000] [--seed 1] [--threads 4]
 */

import { GenerateMovesImproved } from '../../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../../src/components/game/ShogiImproved/KyokumenImproved';
import { EMPTY, FU, GOTE, OU, SENTE, Te, getKomashu } from '../../src/components/game/ShogiImproved/types';
import { teFromWasmKey } from '../search-driver';
import { MtWasmPlayer, loadNnueIntoWasm, loadShogiWasmMt, syncWasmMt, type MtSearchWasm } from './mtPlayer';

function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  if (i < 0) return def;
  const n = parseInt(process.argv[i + 1], 10);
  if (!Number.isFinite(n)) throw new Error(`${flag} requires a numeric value`);
  return n;
}

const GAMES = argNum('--games', 24);
const MOVE_MS = argNum('--ms', 2000);
const SEED_BASE = argNum('--seed', 1);
const THREADS = argNum('--threads', 4);
const OPENING_PLIES = 6;
const MAX_PLIES = 256;
const QUIESCENCE_DEPTH_MAX = 10;

// ---------------------------------------------------------------------------
// Deterministic RNG + curated opening lines (same policy as match-nnue-vs-v3)
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
// Players
// ---------------------------------------------------------------------------

interface Player {
  name: string;
  newGame(): void;
  getNextTe(k: KyokumenImproved, tesu: number): Te | null;
}

class StPlayer implements Player {
  readonly name = 'ST';
  private wasm: MtSearchWasm;

  constructor() {
    this.wasm = loadShogiWasmMt(null, () => 0);
    loadNnueIntoWasm(this.wasm);
  }

  newGame(): void {
    this.wasm.clearTT();
  }

  getNextTe(k: KyokumenImproved, tesu: number): Te | null {
    syncWasmMt(this.wasm, k);
    this.wasm.setRootTesu(tesu);
    const key = this.wasm.searchBestMove(MOVE_MS, 32, QUIESCENCE_DEPTH_MAX);
    if (key === 0) return null;
    return teFromWasmKey(key, k);
  }
}

class MtPlayer implements Player {
  readonly name = 'MT';
  private player: MtWasmPlayer;

  constructor() {
    this.player = new MtWasmPlayer('MT', THREADS, true);
  }

  newGame(): void {
    this.player.newGame();
  }

  getNextTe(k: KyokumenImproved, tesu: number): Te | null {
    return this.player.getNextTe(k, tesu, MOVE_MS, QUIESCENCE_DEPTH_MAX);
  }

  close(): Promise<void> {
    return this.player.close();
  }
}

// ---------------------------------------------------------------------------
// Game loop (same termination rules as match-nnue-vs-v3.ts)
// ---------------------------------------------------------------------------

type PlayResult =
  | { outcome: 'win'; winner: number; plies: number; reason: 'checkmate' | 'noMove' }
  | { outcome: 'draw'; plies: number; reason: 'repetition' | 'maxPlies' | 'stalemate' };

let movesChecked = 0;

function playOneGame(mt: Player, st: Player, mtIsSente: boolean, openingMoves: Te[]): PlayResult {
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
    const mtToMove = mtIsSente ? side === SENTE : side === GOTE;
    const player = mtToMove ? mt : st;

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

async function main(): Promise<void> {
  const mtPlayer = new MtPlayer();
  const stPlayer = new StPlayer();

  let mtWins = 0;
  let stWins = 0;
  let draws = 0;

  console.log(
    `=== match: MT(${THREADS} threads, Lazy SMP) vs ST(1 thread) — ${GAMES} games, ${MOVE_MS}ms/move, ` +
      `NNUE both, opening ${OPENING_PLIES} plies (seed base ${SEED_BASE}) ===`
  );

  for (let game = 0; game < GAMES; game++) {
    const mtIsSente = game % 2 === 0;
    const openingMoves = buildOpeningLine(game >> 1); // same opening for the color-swapped pair
    mtPlayer.newGame();
    stPlayer.newGame();

    const start = performance.now();
    const result = playOneGame(mtPlayer, stPlayer, mtIsSente, openingMoves);
    const elapsed = ((performance.now() - start) / 1000).toFixed(1);

    let summary: string;
    if (result.outcome === 'win') {
      const mtWon = mtIsSente ? result.winner === SENTE : result.winner === GOTE;
      if (mtWon) mtWins++;
      else stWins++;
      summary = `WIN ${mtWon ? 'MT' : 'ST'} (${result.reason}, ${result.winner === SENTE ? 'SENTE' : 'GOTE'})`;
    } else {
      draws++;
      summary = `DRAW (${result.reason})`;
    }
    console.log(
      `game ${game + 1}/${GAMES}: MT=${mtIsSente ? 'SENTE' : 'GOTE'} => ${summary} plies=${result.plies} time=${elapsed}s`
    );
    // Let helper stats/queued messages drain between games.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const decisive = mtWins + stWins;
  const score = mtWins + draws / 2;
  console.log(`\nresult: MT ${mtWins} wins / ST ${stWins} wins / ${draws} draws (all ${movesChecked} moves legal)`);
  console.log(
    `MT score: ${score}/${GAMES} (${((score / GAMES) * 100).toFixed(1)}%)` +
      (decisive > 0 ? `, decisive-only: ${mtWins}/${decisive} (${((mtWins / decisive) * 100).toFixed(1)}%)` : '')
  );
  await mtPlayer.close();
  process.exit(0);
}

void main();
