/**
 * match-mate-probe.ts — A/B gate for the worker's mate-solver probe.
 *
 * Both sides play the exact production pipeline (JS opening book → JS mate probe → WASM search)
 * on their own WASM instance, with identical time budgets. The ONLY difference is the probe:
 *
 *   side A ("dfpn")   — `DfpnMateSolverImproved` over the whole probe budget with no ply horizon,
 *                       then a bounded `MateSolverImproved` pass to shorten a proven mate.
 *   side B ("legacy") — `MateSolverImproved` alone at maxPlies 9, exactly as shipped today.
 *
 * The probe budget (and therefore the budget left for the main search) is identical for both, so a
 * result difference can only come from which mates each probe finds.
 *
 * Every move from both sides is validated against the JS legal move list; an illegal move aborts
 * the run with a non-zero exit code.
 *
 * Usage: node -r tsx/cjs wasm-spike/match-mate-probe.ts [--games 32] [--ms 1000] [--seed 0]
 */

import { DfpnMateSolverImproved } from '../src/components/game/ShogiImproved/DfpnMateSolverImproved';
import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { MateSolverImproved } from '../src/components/game/ShogiImproved/MateSolverImproved';
import { getOpeningMoveImproved } from '../src/components/game/ShogiImproved/OpeningBookImproved';
import { EMPTY, FU, GOTE, HI, OU, SENTE, Te, getKomashu, isSelf } from '../src/components/game/ShogiImproved/types';
import { loadShogiWasm, syncWasm, teFromWasmKey, type ShogiSearchWasm } from './search-driver';

function intArg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? parseInt(process.argv[i + 1]!, 10) : fallback;
}

const GAMES = intArg('games', 32);
const MOVE_MS = intArg('ms', 1000);
const SEED = intArg('seed', 0);
const OPENING_PLIES = 6;
const MAX_PLIES = 256;
const QUIESCENCE_DEPTH_MAX = 10;
const DIFFICULTY = 'hard' as const;

// ---------------------------------------------------------------------------
// Deterministic RNG + curated opening lines (same policy as match-wasm-vs-js.ts)
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
  if (pawnPush.length > 0) return pawnPush[Math.floor(rnd() * pawnPush.length)]!;

  const develop = quiet.filter((m) => getKomashu(m.koma) !== OU);
  if (develop.length > 0) return develop[Math.floor(rnd() * develop.length)]!;
  if (quiet.length > 0) return quiet[Math.floor(rnd() * quiet.length)]!;
  return moves[Math.floor(rnd() * moves.length)]!;
}

function buildOpeningLine(gameIndex: number): Te[] {
  const k = new KyokumenImproved();
  k.initHirate();
  const rnd = mulberry32(0x5eed00 + (gameIndex + SEED * 1013) * 104729);
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

/** Port of the worker's `shouldTryMateSolve()` gate. */
function shouldTryMateSolve(k: KyokumenImproved): boolean {
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

class HybridPlayer {
  private mateSolver = new MateSolverImproved();
  private dfpnSolver = new DfpnMateSolverImproved(1 << 18);
  mateHits = 0;

  constructor(
    private wasm: ShogiSearchWasm,
    readonly probe: 'legacy' | 'dfpn'
  ) {}

  newGame(): void {
    this.wasm.clearTT();
  }

  private solveMate(k: KyokumenImproved, budgetMs: number, startedAt: number): Te | null {
    if (this.probe === 'legacy') {
      return this.mateSolver.solve(k, { maxPlies: 9, maxNodes: 150_000, maxTimeMs: budgetMs });
    }
    const found = this.dfpnSolver.solveDetailed(k, { maxPlies: 31, maxNodes: 150_000, maxTimeMs: budgetMs });
    if (!found) return null;
    if (found.mateDepth <= 3) return found.move;
    const left = budgetMs - (performance.now() - startedAt);
    if (left <= 5) return found.move;
    const shorter = this.mateSolver.solve(k, {
      maxPlies: Math.min(found.mateDepth - 2, 9),
      maxNodes: 150_000,
      maxTimeMs: left,
    });
    return shorter ?? found.move;
  }

  getNextTe(k: KyokumenImproved, tesu: number): Te | null {
    const book = getOpeningMoveImproved(k, DIFFICULTY);
    if (book) return book;

    let searchBudgetMs = MOVE_MS;
    if (shouldTryMateSolve(k)) {
      const mateStart = performance.now();
      const budgetMs = Math.max(30, Math.min(200, Math.floor(MOVE_MS * 0.2)));
      const mate = this.solveMate(k, budgetMs, mateStart);
      if (mate) {
        this.mateHits++;
        return mate;
      }
      const spent = performance.now() - mateStart;
      searchBudgetMs = Math.max(Math.floor(MOVE_MS / 2), MOVE_MS - Math.ceil(spent));
    }

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

function playOneGame(a: HybridPlayer, b: HybridPlayer, aIsSente: boolean, openingMoves: Te[]): PlayResult {
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
    if ((repetition.get(k.HashVal) ?? 0) >= 4) return { outcome: 'draw', plies: ply, reason: 'repetition' };

    const side = k.teban;
    const aToMove = aIsSente ? side === SENTE : side === GOTE;
    const player = aToMove ? a : b;
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

    const isLegal = legalMoves.some(
      (te) => te.koma === move.koma && te.from === move.from && te.to === move.to && te.promote === move.promote
    );
    if (!isLegal) {
      console.error(`ILLEGAL MOVE by ${player.probe} at ply ${ply}: ${move.toString()}`);
      process.exit(1);
    }

    move.capture = k.get(move.to);
    k.move(move);
    k.toggleTeban();
  }

  return { outcome: 'draw', plies: MAX_PLIES, reason: 'maxPlies' };
}

function main(): void {
  const a = new HybridPlayer(loadShogiWasm(), 'dfpn');
  const b = new HybridPlayer(loadShogiWasm(), 'legacy');

  let aWins = 0;
  let bWins = 0;
  let draws = 0;

  console.log(`=== mate-probe A/B: dfpn vs legacy — ${GAMES} games, ${MOVE_MS}ms/move, seed ${SEED} ===`);

  for (let game = 0; game < GAMES; game++) {
    const aIsSente = game % 2 === 0;
    const openingMoves = buildOpeningLine(game >> 1); // same opening for the color-swapped pair
    a.newGame();
    b.newGame();

    const start = performance.now();
    const result = playOneGame(a, b, aIsSente, openingMoves);
    const elapsed = ((performance.now() - start) / 1000).toFixed(1);

    let summary: string;
    if (result.outcome === 'win') {
      const aWon = aIsSente ? result.winner === SENTE : result.winner === GOTE;
      if (aWon) aWins++;
      else bWins++;
      summary = `WIN ${aWon ? 'dfpn' : 'legacy'} (${result.reason})`;
    } else {
      draws++;
      summary = `DRAW (${result.reason})`;
    }
    console.log(
      `game ${game + 1}/${GAMES}: dfpn=${aIsSente ? 'SENTE' : 'GOTE'} => ${summary} plies=${result.plies} time=${elapsed}s`
    );
  }

  const score = aWins + draws * 0.5;
  console.log(`\nresult: dfpn ${aWins} / legacy ${bWins} / draws ${draws}  (dfpn score ${score}/${GAMES})`);
  console.log(`mate-probe hits: dfpn ${a.mateHits}, legacy ${b.mateHits}`);
}

main();
