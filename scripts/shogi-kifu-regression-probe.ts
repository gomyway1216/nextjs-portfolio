/**
 * shogi-kifu-regression-probe.ts — replay + regression probe for the author's real
 * games against the AI. Kept as permanent regression fixtures (the author's actual
 * losses/wins are the most valuable test cases; see blog §11.3).
 *
 * Games:
 *  - GAME81: the pre-fix game where run1m-base saturated and at move 72 (☖1一玉) the
 *    AI (= GOTE ☖) walked into mate. The saturation is fixed in run5m-base; this fixture
 *    lets us confirm the engine no longer chooses the move-72 blunder.
 *  - GAME102: a post-fix hard game (AI = SENTE ☗). Endgame (plies >= 80, growing hands)
 *    is where the search goes shallow — the target of the check extension.
 *
 * Parsing: Japanese notation (ASCII suji + kanji dan; 同/打/成/龍/馬). Ambiguous moves
 * (hand-typed kifu omit 右/左/上/引 glyphs) are disambiguated by backtracking: pick the
 * source under which the remaining kifu stays legal. If a kifu can't be fully resolved
 * (genuine ambiguity or a transcription slip), it replays the longest legal prefix and
 * reports the first unresolved ply, so analysis up to that point (incl. move 72) runs.
 *
 * At every AI move in the legal prefix it asks the production V20 engine what IT would
 * play now (hard budget): engine-move vs played-move, agreement, thinking time, completed
 * depth, eval score, total hand count. (Optional heavy YaneuraOu depth-N blunder scoring
 * via YANE_BIN + YANE_EVAL_DIR + --yane; skip while other CPU jobs run.)
 *
 * Usage:
 *   node -r tsx/cjs scripts/shogi-kifu-regression-probe.ts [--game 81|102] [--ms 2000] [--parseonly]
 */

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { ShogiAIImprovedV20 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV20';
import { FU, GI, GOTE, HI, KA, KE, KI, KY, OU, SENTE, Te, getKomashu } from '../src/components/game/ShogiImproved/types';

// GAME81: AI = GOTE ☖ (pre-fix saturation game; move 72 ☖1一玉 walked into mate).
const KIFU81 = `1☗2六歩 2☖3四歩 3☗2五歩 4☖3三角 5☗7六歩 6☖2二銀 7☗3三角成 8☖3三銀 9☗8八銀 10☖7四歩 11☗7七銀 12☖1四歩 13☗7八金 14☖8四歩 15☗3八銀 16☖3二金 17☗4六歩 18☖6二銀 19☗4七銀 20☖9四歩 21☗9六歩 22☖6四歩 23☗6八王 24☖7三桂 25☗3六歩 26☖4一王 27☗3七桂 28☖6三角打 29☗4八金 30☖4四歩 31☗2九飛 32☖3一王 33☗1六歩 34☖5二金 35☗7九王 36☖4三金 37☗8八王 38☖6五桂 39☗6八銀 40☖8五歩 41☗6六歩 42☖8六歩 43☗8六歩 44☖5四金 45☗6五歩 46☖6五金 47☗7七銀 48☖8一歩打 49☗6九飛 50☖2二王 51☗5六歩 52☖1二香 53☗6六歩打 54☖7六金 55☗7六銀 56☖5四角 57☗6五歩 58☖6五歩 59☗6五銀 60☖6五角 61☗6五飛 62☖5九銀打 63☗5八金 64☖6六歩打 65☗5九金 66☖8六飛 67☗8七歩打 68☖7六飛 69☗6二飛成 70☖7八飛成 71☗7八王 72☖1一王 73☗3二龍 74☖7九金打 75☗7九王 76☖6七歩成 77☗3一飛打 78☖6八と 79☗6八金 80☖6七歩打 81☗2一龍`;

// GAME102: AI = SENTE ☗ (post-fix hard game).
const KIFU102 = `1☗2六歩 2☖3四歩 3☗2五歩 4☖3三角 5☗3八銀 6☖2二銀 7☗3六歩 8☖3二金 9☗3七銀 10☖8四歩 11☗7六歩 12☖8五歩 13☗7八金 14☖1四歩 15☗3三角成 16☖3三銀 17☗8八銀 18☖9四歩 19☗7七銀 20☖6四歩 21☗6三角打 22☖7二角打 23☗7二角成 24☖7二銀 25☗9六歩 26☖6三銀 27☗6八王 28☖5四銀 29☗4六銀 30☖6三角打 31☗3五歩 32☖3五歩 33☗3五銀 34☖8六歩 35☗8六歩 36☖8五歩打 37☗2四歩 38☖2四歩 39☗2四銀 40☖2四銀 41☗2四飛 42☖2三歩打 43☗3四飛 44☖3三銀打 45☗3六飛 46☖6五銀 47☗2六飛 48☖8六歩 49☗8八歩打 50☖5二王 51☗6六歩 52☖5四銀 53☗5六角打 54☖4五銀 55☗6七角 56☖3四銀 57☗3七桂 58☖2四歩 59☗6五歩 60☖8四飛 61☗7五銀打 62☖8二飛 63☗6四歩 64☖7二角 65☗6六飛 66☖3六歩打 67☗3四角 68☖3四銀 69☗6三銀打 70☖4二王 71☗7二銀成 72☖7二金 73☗6三歩成 74☖6三金 75☗6三飛成 76☖3七歩成 77☗7一角打 78☖3六角打 79☗6一龍 80☖5二銀打 81☗6四龍 82☖7二飛 83☗6二角成 84☖6七歩打 85☗6七王 86☖6二飛 87☗6二龍 88☖2七角打 89☗5八金 90☖5五桂打 91☗6六王 92☖4七と 93☗6八金 94☖6一歩打 95☗8二龍 96☖5八と 97☗6七金 98☖6七桂成 99☗6七金 100☖4七角成 101☗3九桂打 102☖6五金打`;

const ZEN = '０１２３４５６７８９';
const KAN = '〇一二三四五六七八九';
/** Suji digit: ASCII or full-width. */
function sujiDigit(ch: string): number {
  const z = ZEN.indexOf(ch);
  if (z >= 0) return z;
  return '0123456789'.indexOf(ch); // -1 if not a digit
}
/** Dan digit: kanji numeral (一..九), or ASCII/full-width as a fallback. */
function danDigit(ch: string): number {
  const kan = KAN.indexOf(ch);
  if (kan >= 0) return kan;
  return sujiDigit(ch);
}

const PIECE_BY_NAME: Record<string, number> = {
  歩: FU, 香: KY, 桂: KE, 銀: GI, 金: KI, 角: KA, 飛: HI, 王: OU, 玉: OU,
  と: FU, // promoted pawn (as a moving piece its komashu is FU)
  龍: HI, 竜: HI, 馬: KA, 成香: KY, 成桂: KE, 成銀: GI,
};

interface ParsedMove {
  toSuji: number;
  toDan: number;
  same: boolean; // 同
  komashu: number;
  promote: boolean;
  drop: boolean;
}

function parseMoveToken(token: string): ParsedMove {
  // token is like "2六歩" / "3三角成" / "8五歩打" / "同銀" / "6三角打"
  let s = token;
  const drop = s.includes('打');
  const promote = s.includes('成') && !s.startsWith('成'); // trailing 成 (not 成香 etc. at head)
  s = s.replace('打', '').replace(/成$/, '');

  let same = false;
  let toSuji = 0;
  let toDan = 0;
  let rest = s;
  if (s.startsWith('同')) {
    same = true;
    rest = s.slice(1);
  } else {
    const suji = sujiDigit(s[0]);
    const dan = danDigit(s[1]);
    if (suji < 1 || dan < 1) throw new Error(`bad square in token: ${token}`);
    toSuji = suji;
    toDan = dan;
    rest = s.slice(2);
  }
  // rest is the piece name (possibly 2 chars like 成銀 — but we stripped a trailing 成 above;
  // for moving a promoted piece the kifu writes 龍/馬/と which are single chars).
  const komashu = PIECE_BY_NAME[rest];
  if (komashu === undefined) throw new Error(`unknown piece "${rest}" in token: ${token}`);
  return { toSuji, toDan, same, komashu, promote, drop };
}

/** All legal moves matching a parsed token (source left ambiguous by the kifu). */
function candidateMoves(k: KyokumenImproved, pm: ParsedMove, lastToPos: number): Te[] {
  const toSuji = pm.same ? lastToPos >> 4 : pm.toSuji;
  const toDan = pm.same ? lastToPos & 0x0f : pm.toDan;
  const toPos = (toSuji << 4) + toDan;
  const legal = GenerateMovesImproved.generateLegalMoves(k);
  return legal.filter((m) => {
    if (m.to !== toPos) return false;
    if (getKomashu(m.koma) !== pm.komashu) return false;
    if (pm.drop && m.from !== 0) return false;
    if (!pm.drop && m.from === 0) return false;
    if (pm.promote && !m.promote) return false;
    // Non-promote token: a forced-promotion move still counts (engine only emits the promote form).
    if (!pm.promote && m.promote && !isForcedPromotion(m)) return false;
    return true;
  });
}

/**
 * Parse the whole kifu into concrete moves. When a token is ambiguous (the kifu
 * omitted the 右/左/上/引/直 disambiguation glyph), we backtrack: pick the candidate
 * source under which the ENTIRE remaining kifu still parses legally. That is the
 * only fully reliable disambiguation without the glyphs.
 */
interface ParseResult {
  moves: Te[]; // the longest legal prefix (== full game when fullyParsed)
  fullyParsed: boolean;
  failedPly: number; // 1-based ply that could not be resolved (0 if fully parsed)
  failedToken: string | null;
}

function parseKifu(tokens: string[]): ParseResult {
  const k = new KyokumenImproved();
  k.initHirate();
  k.setTeban(SENTE);

  const chosen: Te[] = [];
  let maxIdx = 0;
  let maxMoves: Te[] = [];
  function recurse(idx: number, lastTo: number): boolean {
    if (idx > maxIdx) {
      maxIdx = idx;
      maxMoves = chosen.map((c) => c.clone());
    }
    if (idx === tokens.length) return true;
    const pm = parseMoveToken(tokens[idx]);
    const cands = candidateMoves(k, pm, lastTo);
    for (const c of cands) {
      c.capture = k.get(c.to);
      k.move(c);
      k.toggleTeban();
      chosen.push(c);
      if (recurse(idx + 1, c.to)) return true;
      chosen.pop();
      k.toggleTeban();
      k.back(c);
    }
    return false;
  }
  const ok = recurse(0, 0);
  if (ok) return { moves: chosen, fullyParsed: true, failedPly: 0, failedToken: null };
  // Graceful: return the longest legal prefix so analysis up to the ambiguity still runs.
  return { moves: maxMoves, fullyParsed: false, failedPly: maxIdx + 1, failedToken: tokens[maxIdx] ?? null };
}

function isForcedPromotion(m: Te): boolean {
  const komashu = getKomashu(m.koma);
  const toDan = m.to & 0x0f;
  const sente = (m.koma & SENTE) !== 0;
  if (komashu === FU || komashu === KY) return sente ? toDan === 1 : toDan === 9;
  if (komashu === KE) return sente ? toDan <= 2 : toDan >= 8;
  return false;
}

function handTotal(k: KyokumenImproved): number {
  let n = 0;
  for (let type = FU; type <= HI; type++) n += (k.hand[SENTE | type] | 0) + (k.hand[GOTE | type] | 0);
  return n;
}

function main(): void {
  const msIdx = process.argv.indexOf('--ms');
  const budgetMs = msIdx >= 0 ? parseInt(process.argv[msIdx + 1], 10) : 2000;
  const parseOnly = process.argv.includes('--parseonly');
  const fromIdx = process.argv.indexOf('--fromPly');
  const fromPly = fromIdx >= 0 ? parseInt(process.argv[fromIdx + 1], 10) : 1; // only query engine at AI moves >= this ply
  const gameIdx = process.argv.indexOf('--game');
  const game = gameIdx >= 0 ? process.argv[gameIdx + 1] : '81';
  const kifu = game === '102' ? KIFU102 : KIFU81;
  const aiSide = game === '102' ? SENTE : GOTE; // GAME102 AI=SENTE, GAME81 AI=GOTE

  const tokens = kifu.trim().split(/\s+/).map((t) => t.replace(/^\d+[☗☖]/, ''));
  const pr = parseKifu(tokens);
  if (!pr.fullyParsed) {
    console.log(
      `NOTE: kifu GAME${game} parsed the first ${pr.failedPly - 1}/${tokens.length} plies; ply ${pr.failedPly} ("${pr.failedToken}") ` +
        `could not be disambiguated (hand-typed kifu without 右/左/上/引 glyphs). Analyzing the legal prefix.`
    );
  }
  const moves = pr.moves;

  if (parseOnly) {
    console.log(`parse-only GAME${game}: ${pr.fullyParsed ? `OK — all ${moves.length} moves legal` : `prefix ${moves.length}/${tokens.length} legal, stopped at ply ${pr.failedPly}`}`);
    return;
  }

  const k = new KyokumenImproved();
  k.initHirate();
  k.setTeban(SENTE);

  const ai = new ShogiAIImprovedV20();
  let aiMoveCount = 0;
  let agree = 0;
  const rows: string[] = [];
  const sideName = aiSide === SENTE ? 'SENTE ☗' : 'GOTE ☖';

  console.log(`=== GAME${game} replay (AI = ${sideName}, hard budget=${budgetMs}ms) ===`);
  console.log(`ply  hand  played     engineWould  agree  depth  score  ms`);

  for (let i = 0; i < moves.length; i++) {
    const ply = i + 1;
    const isAi = k.teban === aiSide;
    const played = moves[i].clone();
    played.capture = k.get(played.to);

    if (isAi && ply >= fromPly) {
      aiMoveCount++;
      const hand = handTotal(k);
      // Ask the engine what IT would play now.
      const origLog = console.log;
      let line: string | null = null;
      console.log = (...args: unknown[]) => {
        const s = String(args[0] ?? '');
        if (s.startsWith('[ShogiAIImprovedV20]')) line = s;
        else origLog(...args);
      };
      const t0 = performance.now();
      let engMove: Te | null = null;
      try {
        engMove = ai.getNextTe(k, ply - 1, { difficulty: 'hard', maxDepth: 32, maxTimeMs: budgetMs, quiescenceDepthMax: 10, evaluationMode: 'v3', debug: true });
      } finally {
        console.log = origLog;
      }
      const ms = performance.now() - t0;
      let depth = 0;
      let score = 0;
      if (line) {
        const m = /depth=(\d+)\/\d+ score=(-?\d+)/.exec(line);
        if (m) { depth = parseInt(m[1], 10); score = parseInt(m[2], 10); }
      }
      const same = engMove && engMove.from === played.from && engMove.to === played.to && engMove.promote === played.promote;
      if (same) agree++;
      const marker = ply === 72 ? '#' : ply >= 80 ? '*' : ' ';
      rows.push(
        `${String(ply).padStart(3)}${marker} ${String(hand).padStart(4)}  ${played.toString().padEnd(9)}  ${(engMove ? engMove.toString() : '(none)').padEnd(11)}  ${same ? 'YES ' : 'no  '}   ${String(depth).padStart(2)}    ${String(score).padStart(6)}  ${ms.toFixed(0)}`
      );
    }

    k.move(played);
    k.toggleTeban();
  }

  for (const r of rows) console.log(r);
  console.log(`\nAI moves=${aiMoveCount}  engine agrees with played=${agree}/${aiMoveCount} (${((agree / aiMoveCount) * 100).toFixed(0)}%)`);
  console.log(`# = move 72 (GAME81: the historic ☖1一玉 mate-blunder). * = plies >= 80 (endgame).`);
  console.log(`"engineWould" is what the CURRENT engine plays at each AI turn; where it differs from`);
  console.log(`the played move, the engine now chooses otherwise (the regression signal).`);
}

main();
