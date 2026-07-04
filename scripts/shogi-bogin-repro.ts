/**
 * Reproduction harness for the "primitive climbing silver (原始棒銀) beats the AI" complaint.
 *
 * - Sente simulates a human playing primitive bōgin with a scripted plan
 *   (2六歩→2五歩→3八銀→2七銀→2六銀→1五銀→2四歩→...), falling back to the
 *   strong engine when the scripted move is not legal / the plan is done.
 * - Gote is the real `/games/shogi` AI path: `getBestMove(k, GOTE, difficulty, moveNumber, history)`
 *   (opening book for the first 12 plies + improved engine search).
 *
 * Usage:
 *   node -r tsx/cjs scripts/shogi-bogin-repro.ts [difficulty] [games] [verbose]
 */
import { generateLegalMoves } from '../src/components/game/Shogi/GenerateMoves';
import { createInitialPosition } from '../src/components/game/Shogi/InitialPosition';
import { getBestMove } from '../src/components/game/Shogi/ShogiAI';
import type { Kyokumen } from '../src/components/game/Shogi/Kyokumen';
import { GOTE, SENTE, Te } from '../src/components/game/Shogi/types';
import type { Difficulty } from '../src/components/game/common/types';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';

const difficulty = (process.argv[2] ?? 'medium') as Difficulty;
const games = Number(process.argv[3] ?? 1);
const planName = process.argv[4] === 'b' ? 'b' : 'a';
const verbose = process.argv[5] === 'true';

// Primitive bōgin plans for sente, as [fromSuji, fromDan, toSuji, toDan, promote?].
// The plan adapts: each entry is attempted in order; skipped when illegal at that time.
// Plan A: edge route (▲1五銀 → 2四 breakthrough).
const BOGIN_PLAN_A: Array<[number, number, number, number, boolean?]> = [
  [2, 7, 2, 6], // ▲2六歩
  [2, 6, 2, 5], // ▲2五歩
  [3, 9, 3, 8], // ▲3八銀
  [3, 8, 2, 7], // ▲2七銀
  [2, 7, 2, 6], // ▲2六銀
  [2, 6, 1, 5], // ▲1五銀
  [2, 4, 2, 3], // (if 2四歩 already possible after exchange)
  [2, 5, 2, 4], // ▲2四歩 (pawn push)
  [1, 5, 2, 4], // ▲同銀 (silver retakes on 2四)
  [2, 4, 2, 3, true], // ▲2三銀成
];

// Plan B: direct file exchange (▲2四歩 → ▲同飛), the more common human continuation
// when the 1五 route is denied by △1四歩.
const BOGIN_PLAN_B: Array<[number, number, number, number, boolean?]> = [
  [2, 7, 2, 6], // ▲2六歩
  [2, 6, 2, 5], // ▲2五歩
  [3, 9, 3, 8], // ▲3八銀
  [3, 8, 2, 7], // ▲2七銀
  [2, 7, 2, 6], // ▲2六銀
  [2, 5, 2, 4], // ▲2四歩
  [2, 8, 2, 4], // ▲同飛 (recapture with the rook)
  [2, 6, 2, 5], // ▲2五銀 (follow-up march)
  [2, 5, 2, 4], // ▲2四銀
];

const BOGIN_PLAN = planName === 'b' ? BOGIN_PLAN_B : BOGIN_PLAN_A;

function toImproved(k: Kyokumen): KyokumenImproved {
  const ki = new KyokumenImproved();
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      ki.ban[(suji << 4) + dan] = k.ban[suji][dan];
    }
  }
  for (let i = 0; i < ki.hand.length; i++) ki.hand[i] = 0;
  for (const koma of k.hand[0]) ki.hand[koma] = (ki.hand[koma] ?? 0) + 1;
  for (const koma of k.hand[1]) ki.hand[koma] = (ki.hand[koma] ?? 0) + 1;
  ki.teban = k.teban;
  ki.initAll();
  return ki;
}

function evalSente(k: Kyokumen): number {
  return toImproved(k).evaluateV3();
}

function materialSente(k: Kyokumen): number {
  // Rough material count from the improved encoding values.
  const ki = toImproved(k);
  return ki.eval;
}

function teToString(te: Te): string {
  const to = `${te.to.suji}${te.to.dan}`;
  const from = te.from.suji === 0 ? '打' : `${te.from.suji}${te.from.dan}`;
  return `${from}->${to}${te.promote ? '成' : ''}`;
}

for (let g = 0; g < games; g++) {
  const k = createInitialPosition();
  k.teban = SENTE;
  const history: Te[] = [];
  let planIndex = 0;
  let moveNumber = 1;
  let result = 'unfinished';

  for (let ply = 0; ply < 140; ply++) {
    const side = k.teban;
    let move: Te | null = null;

    if (side === SENTE) {
      // Try the next applicable scripted bōgin move.
      const legal = generateLegalMoves(k);
      if (legal.length === 0) {
        result = 'GOTE wins (sente mated)';
        break;
      }
      while (planIndex < BOGIN_PLAN.length && !move) {
        const [fs, fd, ts, td, promote] = BOGIN_PLAN[planIndex];
        const found = legal.find(
          (m) =>
            m.from.suji === fs &&
            m.from.dan === fd &&
            m.to.suji === ts &&
            m.to.dan === td &&
            m.promote === Boolean(promote)
        );
        planIndex++;
        if (found) move = found;
      }
      if (!move) {
        // Plan finished: keep playing with the same strength as the defender for a fair comparison.
        move = getBestMove(k, SENTE, difficulty, moveNumber, history);
      }
    } else {
      move = getBestMove(k, GOTE, difficulty, moveNumber, history);
    }

    if (!move) {
      result = side === SENTE ? 'GOTE wins (no sente move)' : 'SENTE wins (no gote move)';
      break;
    }

    k.move(move);
    history.push(move);
    k.teban = side === SENTE ? GOTE : SENTE;
    moveNumber++;

    const legalNext = generateLegalMoves(k);
    if (legalNext.length === 0) {
      result = side === SENTE ? 'SENTE wins (checkmate)' : 'GOTE wins (checkmate)';
      break;
    }

    if (verbose || ply < 24) {
      console.log(
        `ply ${String(ply + 1).padStart(3)} ${side === SENTE ? '▲' : '△'} ${teToString(move)}  evalV3(SENTE)=${evalSente(k)}  material=${materialSente(k)}`
      );
    }
  }

  console.log(`\n[game ${g + 1}] result: ${result} after ${moveNumber - 1} plies, final evalV3(SENTE)=${evalSente(k)} material=${materialSente(k)}\n`);
}
