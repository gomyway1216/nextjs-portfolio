/**
 * Joseki gauntlet: throw common human (amateur) attack patterns at the production AI path
 * and automatically flag suspicious replies.
 *
 * For every AI move we flag:
 * - INSTANT: answered in < 200ms after the opening-book window (first 12 plies; book replies
 *            inside that window are legitimately instant)
 * - HANGS:   the AI's move left one of its own pieces (silver or higher) capturable for free, or
 *            capturable by a clearly cheaper attacker (SEE-lite). NOTE: this is a heuristic and
 *            false-positives on exchange sequences (e.g. 角交換) where the "hanging" piece just
 *            captured equal material — review flagged moves manually.
 * - EVAL:    the SENTE-perspective evalV3 jumped by > 800 in the human's favor right after the AI move
 *
 * Usage: node -r tsx/cjs scripts/shogi-joseki-gauntlet.ts [difficulty] [maxPlies]
 */
import { generateLegalMoves } from '../src/components/game/Shogi/GenerateMoves';
import { createInitialPosition } from '../src/components/game/Shogi/InitialPosition';
import { getBestMove } from '../src/components/game/Shogi/ShogiAI';
import type { Kyokumen } from '../src/components/game/Shogi/Kyokumen';
import { FU, GOTE, KA, SENTE, Te, getKomashu } from '../src/components/game/Shogi/types';
import type { Difficulty } from '../src/components/game/common/types';
import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { OU, SENTE as ISENTE, GOTE as IGOTE, komaValue } from '../src/components/game/ShogiImproved/types';

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert', 'master'] as const;
const difficultyArg = process.argv[2] ?? 'hard';
if (!(VALID_DIFFICULTIES as readonly string[]).includes(difficultyArg)) {
  throw new Error(`invalid difficulty "${difficultyArg}" (expected one of ${VALID_DIFFICULTIES.join('/')})`);
}
const difficulty = difficultyArg as Difficulty;
const maxPliesArg = Number(process.argv[3] ?? 40);
const maxPlies = Number.isFinite(maxPliesArg) && maxPliesArg > 0 ? maxPliesArg : 40;

type Step =
  | { kind: 'move'; fs: number; fd: number; ts: number; td: number; promote?: boolean }
  | { kind: 'drop'; komashu: number; ts: number; td: number };

interface Plan {
  name: string;
  steps: Step[];
}

const PLANS: Plan[] = [
  {
    // The screenshot game: 相掛かり 2筋交換 (the most basic rook-file joseki test).
    name: '相掛かり2筋交換',
    steps: [
      { kind: 'move', fs: 2, fd: 7, ts: 2, td: 6 },
      { kind: 'move', fs: 2, fd: 6, ts: 2, td: 5 },
      { kind: 'move', fs: 2, fd: 5, ts: 2, td: 4 },
      { kind: 'move', fs: 2, fd: 8, ts: 2, td: 4 }, // ▲同飛
      { kind: 'drop', komashu: FU, ts: 2, td: 3 }, // if allowed: ▲2三歩打
      { kind: 'move', fs: 2, fd: 4, ts: 2, td: 8 }, // rook retreats if chased
      { kind: 'move', fs: 7, fd: 7, ts: 7, td: 6 },
      { kind: 'move', fs: 3, fd: 9, ts: 3, td: 8 },
    ],
  },
  {
    // 筋違い角 trap: ▲7六歩 (△3四歩) ▲2二角成 △同銀 ▲4五角打 (threatens 2三/6三).
    name: '筋違い角',
    steps: [
      { kind: 'move', fs: 7, fd: 7, ts: 7, td: 6 },
      { kind: 'move', fs: 8, fd: 8, ts: 2, td: 2, promote: true }, // ▲2二角成 (if diagonal open)
      { kind: 'drop', komashu: KA, ts: 4, td: 5 }, // ▲4五角打
      { kind: 'move', fs: 4, fd: 5, ts: 2, td: 3, promote: true }, // ▲2三角成 if allowed
      { kind: 'move', fs: 4, fd: 5, ts: 6, td: 3, promote: true }, // or ▲6三角成 if allowed
      { kind: 'move', fs: 2, fd: 7, ts: 2, td: 6 },
      { kind: 'move', fs: 2, fd: 6, ts: 2, td: 5 },
    ],
  },
  {
    // 早繰り銀: silver runs up the 3rd/4th file ahead of the pawns.
    name: '早繰り銀',
    steps: [
      { kind: 'move', fs: 7, fd: 7, ts: 7, td: 6 },
      { kind: 'move', fs: 2, fd: 7, ts: 2, td: 6 },
      { kind: 'move', fs: 3, fd: 9, ts: 4, td: 8 },
      { kind: 'move', fs: 4, fd: 8, ts: 4, td: 7 },
      { kind: 'move', fs: 4, fd: 7, ts: 3, td: 6 },
      { kind: 'move', fs: 3, fd: 6, ts: 2, td: 5 }, // silver to 2五/3五 area
      { kind: 'move', fs: 2, fd: 6, ts: 2, td: 5 },
      { kind: 'move', fs: 2, fd: 5, ts: 2, td: 4 },
      { kind: 'move', fs: 2, fd: 8, ts: 2, td: 4 },
    ],
  },
  {
    // 相掛かりからの銀かすめ取り (reported game): after the rook-file exchange, the silver runs
    // 3八→2七→3六→2五 and grabs the 3四 pawn if it is ever pushed undefended.
    name: '相掛かり銀かすめ取り',
    steps: [
      { kind: 'move', fs: 2, fd: 7, ts: 2, td: 6 },
      { kind: 'move', fs: 2, fd: 6, ts: 2, td: 5 },
      { kind: 'move', fs: 6, fd: 9, ts: 7, td: 8 }, // ▲7八金
      { kind: 'move', fs: 2, fd: 5, ts: 2, td: 4 },
      { kind: 'move', fs: 2, fd: 8, ts: 2, td: 4 }, // ▲同飛
      { kind: 'move', fs: 2, fd: 4, ts: 2, td: 8 }, // rook retreats when chased
      { kind: 'move', fs: 8, fd: 7, ts: 8, td: 6 }, // ▲同歩 (if gote breaks 8六)
      { kind: 'drop', komashu: FU, ts: 8, td: 7 }, // ▲8七歩打
      { kind: 'move', fs: 3, fd: 9, ts: 3, td: 8 },
      { kind: 'move', fs: 3, fd: 8, ts: 2, td: 7 },
      { kind: 'move', fs: 2, fd: 7, ts: 3, td: 6 },
      { kind: 'move', fs: 3, fd: 6, ts: 2, td: 5 },
      { kind: 'move', fs: 2, fd: 5, ts: 3, td: 4 }, // ▲3四銀 (pawn grab if allowed)
      { kind: 'move', fs: 2, fd: 5, ts: 1, td: 4 }, // or ▲1四銀 edge grab
    ],
  },
  {
    // 横歩取り模様: quiet build-up then the 2-file break with gold still on 3二.
    name: '横歩取り模様2筋攻め',
    steps: [
      { kind: 'move', fs: 7, fd: 7, ts: 7, td: 6 },
      { kind: 'move', fs: 2, fd: 7, ts: 2, td: 6 },
      { kind: 'move', fs: 2, fd: 6, ts: 2, td: 5 },
      { kind: 'move', fs: 6, fd: 9, ts: 7, td: 8 },
      { kind: 'move', fs: 2, fd: 5, ts: 2, td: 4 },
      { kind: 'move', fs: 2, fd: 8, ts: 2, td: 4 },
      { kind: 'move', fs: 2, fd: 4, ts: 3, td: 4 }, // ▲3四飛 (yokofu) if open
      { kind: 'move', fs: 5, fd: 9, ts: 6, td: 8 },
    ],
  },
];

function toImproved(k: Kyokumen): KyokumenImproved {
  const ki = new KyokumenImproved();
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      ki.ban[(suji << 4) + dan] = k.ban[suji][dan];
    }
  }
  for (let i = 0; i < ki.hand.length; i++) ki.hand[i] = 0;
  for (const koma of k.hand[0]) ki.hand[koma]++;
  for (const koma of k.hand[1]) ki.hand[koma]++;
  ki.teban = k.teban;
  ki.initAll();
  return ki;
}

/** Biggest free-capture value SENTE can take from GOTE right now (SEE-lite). */
function biggestGoteHang(k: Kyokumen): { value: number; square: string } {
  const ki = toImproved(k);
  let best = 0;
  let square = '';
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      const p = ki.get(pos);
      if (p === 0) continue;
      const type = getKomashu(p);
      if (type === OU) continue;
      if ((p & (ISENTE | IGOTE)) !== IGOTE) continue;
      const value = Math.abs(komaValue[p]) | 0;
      if (value < 1000) continue; // silver and up
      const attacker = GenerateMovesImproved.getLeastAttackerValue(ki, pos, IGOTE);
      if (!Number.isFinite(attacker)) continue;
      const defender = GenerateMovesImproved.getLeastAttackerValue(ki, pos, ISENTE);
      let loss = 0;
      if (!Number.isFinite(defender)) loss = value;
      else if ((attacker | 0) + 150 < value) loss = value - (attacker | 0);
      if (loss > best) {
        best = loss;
        square = `${suji}${dan}`;
      }
    }
  }
  return { value: best, square };
}

function evalSente(k: Kyokumen): number {
  return toImproved(k).evaluateV3();
}

for (const plan of PLANS) {
  console.log(`\n=== ${plan.name} (AI=${difficulty}) ===`);
  const k = createInitialPosition();
  k.teban = SENTE;
  const history: Te[] = [];
  let stepIndex = 0;
  let moveNumber = 1;
  let flags = 0;

  for (let ply = 0; ply < maxPlies; ply++) {
    const side = k.teban;
    let move: Te | null = null;

    if (side === SENTE) {
      const legal = generateLegalMoves(k);
      if (legal.length === 0) break;
      while (stepIndex < plan.steps.length && !move) {
        const s = plan.steps[stepIndex];
        stepIndex++;
        if (s.kind === 'move') {
          move =
            legal.find(
              (m) =>
                m.from.suji === s.fs &&
                m.from.dan === s.fd &&
                m.to.suji === s.ts &&
                m.to.dan === s.td &&
                m.promote === Boolean(s.promote)
            ) ?? null;
        } else {
          move =
            legal.find(
              (m) => m.from.suji === 0 && m.to.suji === s.ts && m.to.dan === s.td && getKomashu(m.koma) === s.komashu
            ) ?? null;
        }
      }
      if (!move) move = getBestMove(k, SENTE, difficulty, moveNumber, history);
    } else {
      const before = evalSente(k);
      const t0 = Date.now();
      move = getBestMove(k, GOTE, difficulty, moveNumber, history);
      const ms = Date.now() - t0;
      if (move) {
        const preview = k.clone();
        preview.move(move);
        preview.teban = SENTE;
        const after = evalSente(preview);
        const hang = biggestGoteHang(preview);
        const from = move.from.suji === 0 ? '打' : `${move.from.suji}${move.from.dan}`;
        const label = `△${from}->${move.to.suji}${move.to.dan}${move.promote ? '成' : ''}`;
        const problems: string[] = [];
        // The production book applies for the first 12 plies (ShogiAI.ts moveNumber <= 12);
        // instant replies inside that window are legitimate book moves.
        if (ms < 200 && moveNumber > 12) problems.push(`INSTANT(${ms}ms)`);
        if (hang.value >= 900) problems.push(`HANGS(${hang.square}:${hang.value})`);
        if (after - before > 800) problems.push(`EVAL(+${after - before})`);
        if (problems.length > 0) {
          flags++;
          console.log(`  ply ${ply + 1} ${label} [${ms}ms]  ⚠ ${problems.join(' ')}`);
        }
      }
    }

    if (!move) break;
    k.move(move);
    history.push(move);
    k.teban = side === SENTE ? GOTE : SENTE;
    moveNumber++;
  }

  console.log(`  -> ${flags === 0 ? 'クリーン (フラグなし)' : `${flags}件のフラグ`}  final evalV3(SENTE)=${evalSente(k)}`);
}
