/**
 * match-checkext.ts — A/B for the path-budgeted check extension.
 *
 * Plays the JS V20 engine WITH the check extension (checkExtensionBudget=1, the
 * shipped value) against the same engine WITHOUT it (budget=0), at the production
 * hard budget. Same curated 6-ply openings as match-wasm-vs-js.ts, colors swapped
 * every game so each opening is played from both sides. This isolates the effect
 * of the check extension only (both sides share book, mate solver, eval, WASM-
 * parity search — the only difference is the extension budget).
 *
 * Usage: node -r tsx/cjs wasm-spike/match-checkext.ts [--games 24] [--ms 2000]
 *
 * Note: this uses the JS engine (which honors options.checkExtensionBudget) so a
 * single binary can play both sides; the WASM engine ships the identical logic
 * (search-driver.ts confirms 48/48 EXACT), so the JS A/B is representative.
 */

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { ShogiAIImprovedV20 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV20';
import { EMPTY, FU, GOTE, OU, SENTE, Te, getKomashu } from '../src/components/game/ShogiImproved/types';

const GAMES = ((): number => {
  const i = process.argv.indexOf('--games');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 24;
})();
const MOVE_MS = ((): number => {
  const i = process.argv.indexOf('--ms');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) : 2000;
})();
const OPENING_PLIES = 6;
const MAX_PLIES = 256;
const QUIESCENCE_DEPTH_MAX = 10;
const DIFFICULTY = 'hard' as const;

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

type PlayResult =
  | { outcome: 'win'; winner: number; plies: number }
  | { outcome: 'draw'; plies: number; reason: string };

/** aiExt plays with the extension; aiBase without. `extIsSente` says which color aiExt has. */
function playOneGame(aiExt: ShogiAIImprovedV20, aiBase: ShogiAIImprovedV20, extIsSente: boolean, opening: Te[]): PlayResult {
  const k = new KyokumenImproved();
  k.initHirate();
  k.setTeban(SENTE);
  for (const o of opening) {
    const te = o.clone();
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
  }
  const repetition = new Map<number, number>();

  for (let ply = opening.length; ply < MAX_PLIES; ply++) {
    repetition.set(k.HashVal, (repetition.get(k.HashVal) ?? 0) + 1);
    if ((repetition.get(k.HashVal) ?? 0) >= 4) return { outcome: 'draw', plies: ply, reason: 'repetition' };

    const side = k.teban;
    const extToMove = extIsSente ? side === SENTE : side === GOTE;
    const ai = extToMove ? aiExt : aiBase;
    const move = ai.getNextTe(k, ply, {
      difficulty: DIFFICULTY,
      maxDepth: 32,
      maxTimeMs: MOVE_MS,
      quiescenceDepthMax: QUIESCENCE_DEPTH_MAX,
      evaluationMode: 'v3',
      checkExtensionBudget: extToMove ? 1 : 0,
    });

    const legalMoves = GenerateMovesImproved.generateLegalMoves(k);
    if (!move) {
      if (legalMoves.length > 0) return { outcome: 'win', winner: side === SENTE ? GOTE : SENTE, plies: ply };
      const inCheck = GenerateMovesImproved.isKingInCheck(k, side);
      if (inCheck) return { outcome: 'win', winner: side === SENTE ? GOTE : SENTE, plies: ply };
      return { outcome: 'draw', plies: ply, reason: 'stalemate' };
    }
    move.capture = k.get(move.to);
    k.move(move);
    k.toggleTeban();
  }
  return { outcome: 'draw', plies: MAX_PLIES, reason: 'maxPlies' };
}

function main(): void {
  let extWins = 0;
  let baseWins = 0;
  let draws = 0;

  console.log(`=== check-extension A/B: budget=1 (ext) vs budget=0 (base) — ${GAMES} games, ${MOVE_MS}ms/move, hard ===`);

  for (let game = 0; game < GAMES; game++) {
    const extIsSente = game % 2 === 0;
    const opening = buildOpeningLine(game >> 1); // same opening for the color-swapped pair
    const aiExt = new ShogiAIImprovedV20();
    const aiBase = new ShogiAIImprovedV20();

    const start = performance.now();
    const result = playOneGame(aiExt, aiBase, extIsSente, opening);
    const elapsed = ((performance.now() - start) / 1000).toFixed(1);

    let summary: string;
    if (result.outcome === 'win') {
      const extWon = extIsSente ? result.winner === SENTE : result.winner === GOTE;
      if (extWon) extWins++;
      else baseWins++;
      summary = `WIN ${extWon ? 'EXT' : 'BASE'}`;
    } else {
      draws++;
      summary = `DRAW (${result.reason})`;
    }
    console.log(`game ${game + 1}/${GAMES}: EXT=${extIsSente ? 'SENTE' : 'GOTE'} => ${summary} plies=${result.plies} time=${elapsed}s`);
  }

  const decisive = extWins + baseWins;
  const wr = decisive > 0 ? ((extWins / decisive) * 100).toFixed(1) : 'n/a';
  console.log(`\nresult: EXT ${extWins} wins / BASE ${baseWins} wins / ${draws} draws  (EXT win-rate among decisive: ${wr}%)`);
}

main();
