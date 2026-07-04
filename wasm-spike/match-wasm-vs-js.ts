/**
 * match-wasm-vs-js.ts — phase 3 sanity match: WASM search vs the JS V20 engine.
 *
 * Setup (mirrors scripts/shogi-ai-match.ts):
 * - 10 games, 200ms per move, curated 6-ply opening lines (deterministic seeds),
 *   colors alternate every game.
 * - The WASM side plays the intended phase-4 hybrid: JS opening book →
 *   JS mate-solver probe (same gate + budget policy as ShogiAIImprovedV20) →
 *   WASM searchBestMove() with the remaining budget.
 * - The JS side is the stock ShogiAIImprovedV20 (book + mate solver + search).
 * - Every WASM move is validated against the JS legal move list; an illegal
 *   move aborts the run with a non-zero exit code.
 *
 * Usage: node -r tsx/cjs wasm-spike/match-wasm-vs-js.ts [--games 10] [--ms 200]
 */

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { MateSolverImproved } from '../src/components/game/ShogiImproved/MateSolverImproved';
import { getOpeningMoveImproved } from '../src/components/game/ShogiImproved/OpeningBookImproved';
import { ShogiAIImprovedV20 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV20';
import { EMPTY, FU, GOTE, HI, OU, SENTE, Te, getKomashu, isSelf } from '../src/components/game/ShogiImproved/types';
import { loadShogiWasm, syncWasm, teFromWasmKey, type ShogiSearchWasm } from './search-driver';

const GAMES = ((): number => {
  const i = process.argv.indexOf('--games');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 10;
})();
const MOVE_MS = ((): number => {
  const i = process.argv.indexOf('--ms');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 200;
})();
const OPENING_PLIES = 6;
const MAX_PLIES = 256;
const QUIESCENCE_DEPTH_MAX = 10;
const DIFFICULTY = 'hard' as const;

// ---------------------------------------------------------------------------
// Deterministic RNG + curated opening lines (same policy as shogi-ai-match.ts)
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

function buildOpeningLine(gameIndex: number): Te[] {
  const k = new KyokumenImproved();
  k.initHirate();
  const rnd = mulberry32(0x5eed00 + gameIndex * 104729);
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
// WASM hybrid player (phase-4 shape: JS book → JS mate solver → WASM search)
// ---------------------------------------------------------------------------

class WasmHybridPlayer {
  private mateSolver = new MateSolverImproved();

  constructor(private wasm: ShogiSearchWasm) {}

  newGame(): void {
    this.wasm.clearTT();
  }

  /** Port of ShogiAIImprovedV20.shouldTryMateSolve (the gate is public info only). */
  private shouldTryMateSolve(k: KyokumenImproved): boolean {
    const enemyKing = k.teban === SENTE ? k.kingG : k.kingS;
    if (enemyKing <= 0) return false;

    const kingSuji = enemyKing >> 4;
    const kingDan = enemyKing & 0x0f;

    let near = 0;
    for (let ds = -3; ds <= 3; ds++) {
      const suji = kingSuji + ds;
      if (suji < 1 || suji > 9) continue;
      for (let dd = -3; dd <= 3; dd++) {
        const dan = kingDan + dd;
        if (dan < 1 || dan > 9) continue;
        const p = k.get((suji << 4) + dan);
        if (p === EMPTY) continue;
        if (isSelf(k.teban, p) && getKomashu(p) !== OU) near++;
      }
    }
    if (near === 0) return false;

    let handCount = 0;
    for (let type = FU; type <= HI; type++) handCount += k.hand[k.teban | type] | 0;

    return near + handCount >= 2;
  }

  getNextTe(k: KyokumenImproved, tesu: number): Te | null {
    // 1) Opening book (JS side, same as V20).
    const book = getOpeningMoveImproved(k, DIFFICULTY);
    if (book) return book;

    // 2) Mate-solver probe (same gate + budget policy as V20.tryMateSolve).
    let searchBudgetMs = MOVE_MS;
    if (this.shouldTryMateSolve(k)) {
      const mateStart = performance.now();
      const budgetMs = Math.max(30, Math.min(200, Math.floor(MOVE_MS * 0.2)));
      const mate = this.mateSolver.solve(k, { maxPlies: 9, maxNodes: 150_000, maxTimeMs: budgetMs });
      if (mate) return mate;
      const spent = performance.now() - mateStart;
      searchBudgetMs = Math.max(Math.floor(MOVE_MS / 2), MOVE_MS - Math.ceil(spent));
    }

    // 3) WASM search.
    syncWasm(this.wasm, k);
    this.wasm.setRootTesu(tesu);
    const key = this.wasm.searchBestMove(searchBudgetMs, 32, QUIESCENCE_DEPTH_MAX);
    if (key === 0) return null;
    return teFromWasmKey(key, k);
  }
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------

type PlayResult =
  | { outcome: 'win'; winner: number; plies: number; reason: 'checkmate' | 'noMove' }
  | { outcome: 'draw'; plies: number; reason: 'repetition' | 'maxPlies' | 'stalemate' };

function playOneGame(wasmPlayer: WasmHybridPlayer, jsAi: ShogiAIImprovedV20, wasmIsSente: boolean, openingMoves: Te[]): PlayResult {
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
    const wasmToMove = wasmIsSente ? side === SENTE : side === GOTE;

    const move = wasmToMove
      ? wasmPlayer.getNextTe(k, ply)
      : jsAi.getNextTe(k, ply, {
          difficulty: DIFFICULTY,
          maxDepth: 32,
          maxTimeMs: MOVE_MS,
          quiescenceDepthMax: QUIESCENCE_DEPTH_MAX,
          evaluationMode: 'v3',
        });

    const legalMoves = GenerateMovesImproved.generateLegalMoves(k);

    if (!move) {
      if (legalMoves.length > 0) {
        return { outcome: 'win', winner: side === SENTE ? GOTE : SENTE, plies: ply, reason: 'noMove' };
      }
      const inCheck = GenerateMovesImproved.isKingInCheck(k, side);
      if (inCheck) return { outcome: 'win', winner: side === SENTE ? GOTE : SENTE, plies: ply, reason: 'checkmate' };
      return { outcome: 'draw', plies: ply, reason: 'stalemate' };
    }

    // Strict legality validation for EVERY move (the WASM side must never emit
    // an illegal move; validating both sides costs nothing extra here).
    const isLegal = legalMoves.some(
      (te) => te.koma === move.koma && te.from === move.from && te.to === move.to && te.promote === move.promote
    );
    if (!isLegal) {
      console.error(
        `ILLEGAL MOVE by ${wasmToMove ? 'WASM' : 'JS'} at ply ${ply}: ${move.toString()} ` +
          `(koma=${move.koma} from=${move.from.toString(16)} to=${move.to.toString(16)} promote=${move.promote})`
      );
      process.exit(1);
    }

    move.capture = k.get(move.to);
    k.move(move);
    k.toggleTeban();
  }

  return { outcome: 'draw', plies: MAX_PLIES, reason: 'maxPlies' };
}

// ---------------------------------------------------------------------------

function main(): void {
  const wasm = loadShogiWasm();
  const wasmPlayer = new WasmHybridPlayer(wasm);

  let wasmWins = 0;
  let jsWins = 0;
  let draws = 0;

  console.log(`=== match: WASM hybrid vs JS V20 — ${GAMES} games, ${MOVE_MS}ms/move, curated opening ${OPENING_PLIES} plies ===`);

  for (let game = 0; game < GAMES; game++) {
    const wasmIsSente = game % 2 === 0;
    const openingMoves = buildOpeningLine(game >> 1); // same opening for the color-swapped pair
    wasmPlayer.newGame();
    const jsAi = new ShogiAIImprovedV20(); // fresh TT per game

    const start = performance.now();
    const result = playOneGame(wasmPlayer, jsAi, wasmIsSente, openingMoves);
    const elapsed = ((performance.now() - start) / 1000).toFixed(1);

    let summary: string;
    if (result.outcome === 'win') {
      const wasmWon = wasmIsSente ? result.winner === SENTE : result.winner === GOTE;
      if (wasmWon) wasmWins++;
      else jsWins++;
      summary = `WIN ${wasmWon ? 'WASM' : 'JS'} (${result.reason}, ${result.winner === SENTE ? 'SENTE' : 'GOTE'})`;
    } else {
      draws++;
      summary = `DRAW (${result.reason})`;
    }
    console.log(
      `game ${game + 1}/${GAMES}: WASM=${wasmIsSente ? 'SENTE' : 'GOTE'} => ${summary} plies=${result.plies} time=${elapsed}s`
    );
  }

  console.log(`\nresult: WASM ${wasmWins} wins / JS ${jsWins} wins / ${draws} draws`);
  if (wasmWins < jsWins) {
    console.error('FAIL: WASM side lost the match');
    process.exit(1);
  }
  console.log(wasmWins > jsWins ? 'WASM side WINS the match ✓' : 'match tied (WASM at least even) ✓');
}

main();
