/**
 * endgame-depth.ts — measure search depth reached in material-heavy endgames,
 * and the effect of the path-budgeted check extension.
 *
 * The diagnosis: in big-hand endgames the per-node cost explodes (drops dominate
 * the move list) and search depth collapses from 11-12 to 4-6, so forced mates
 * a few plies out are missed. This harness:
 *
 *  1. Builds real big-hand endgame positions via biased self-play.
 *  2. Runs the JS V20 engine on each at a fixed time budget with the check
 *     extension ON vs OFF (checkExtensionBudget 3 vs 0) and reports the completed
 *     iterative-deepening depth, node count and chosen move for each.
 *
 * The extension does not change the *completed depth number* directly (extensions
 * happen inside a fixed iteration), so we also report whether the chosen move / PV
 * score changed — i.e. whether reading the forced-check line deeper altered the
 * decision. This is the "does it see tactics it used to miss" signal.
 *
 * Run with a SHORT budget so it stays light while other A/B matches run:
 *   node -r tsx/cjs wasm-spike/endgame-depth.ts [budgetMs=300]
 */

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { ShogiAIImprovedV20 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV20';
import { FU, HI, SENTE, GOTE, Te } from '../src/components/game/ShogiImproved/types';

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

function handCount(k: KyokumenImproved): number {
  let n = 0;
  for (let type = FU; type <= HI; type++) n += (k.hand[SENTE | type] | 0) + (k.hand[GOTE | type] | 0);
  return n;
}

function buildEndgamePositions(): Array<{ label: string; k: KyokumenImproved; hand: number; tesu: number }> {
  const out: Array<{ label: string; k: KyokumenImproved; hand: number; tesu: number }> = [];
  for (let game = 0; game < 8; game++) {
    const rnd = mulberry32(0xe11a9e + game * 104729);
    const k = new KyokumenImproved();
    k.initHirate();
    for (let ply = 0; ply < 100; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(k);
      if (moves.length === 0) break;
      let pick: Te;
      const noisy = moves.filter((m) => m.capture !== 0 || m.promote);
      if (noisy.length > 0 && rnd() < 0.7) pick = noisy[Math.floor(rnd() * noisy.length)];
      else pick = moves[Math.floor(rnd() * moves.length)];
      pick.capture = k.get(pick.to);
      k.move(pick);
      k.toggleTeban();
      const hand = handCount(k);
      if (ply >= 64 && hand >= 8 && GenerateMovesImproved.generateLegalMoves(k).length > 0) {
        out.push({ label: `game${game} ply${ply + 1}`, k: k.clone(), hand, tesu: ply + 1 });
        break; // one snapshot per game
      }
    }
  }
  return out;
}

/** Run JS V20 and capture the debug summary (depth/score/nodes) + chosen move. */
function runJs(
  k: KyokumenImproved,
  tesu: number,
  budgetMs: number,
  checkExtBudget: number
): { move: string; depth: number; score: number; nodes: number } {
  const ai = new ShogiAIImprovedV20();
  const origLog = console.log;
  let line: string | null = null;
  console.log = (...args: unknown[]) => {
    const s = String(args[0] ?? '');
    if (s.startsWith('[ShogiAIImprovedV20]')) line = s;
    else origLog(...args);
  };
  let move: Te | null = null;
  try {
    move = ai.getNextTe(k, tesu, { maxTimeMs: budgetMs, maxDepth: 32, quiescenceDepthMax: 10, evaluationMode: 'v3', debug: true, checkExtensionBudget: checkExtBudget });
  } finally {
    console.log = origLog;
  }
  let depth = 0;
  let score = 0;
  let nodes = 0;
  if (line) {
    const m = /depth=(\d+)\/\d+ score=(-?\d+) nodes=(\d+)/.exec(line);
    if (m) {
      depth = parseInt(m[1], 10);
      score = parseInt(m[2], 10);
      nodes = parseInt(m[3], 10);
    }
  }
  const mv = move ? move.toString() : '(none)';
  return { move: mv, depth, score, nodes };
}

function main(): void {
  const budgetMs = process.argv[2] ? parseInt(process.argv[2], 10) : 300;
  const positions = buildEndgamePositions();
  console.log(`=== endgame search depth: check-extension OFF vs ON (budget=${budgetMs}ms, ${positions.length} big-hand positions) ===\n`);

  let depthOffSum = 0;
  let depthOnSum = 0;
  let changed = 0;
  for (const p of positions) {
    const off = runJs(p.k, p.tesu, budgetMs, 0);
    const on = runJs(p.k, p.tesu, budgetMs, 1); // shipped budget
    depthOffSum += off.depth;
    depthOnSum += on.depth;
    const moveChanged = off.move !== on.move;
    if (moveChanged) changed++;
    console.log(`${p.label} (hand=${p.hand})`);
    console.log(`  OFF: depth=${off.depth} score=${off.score} nodes=${off.nodes} move=${off.move}`);
    console.log(`  ON : depth=${on.depth} score=${on.score} nodes=${on.nodes} move=${on.move}${moveChanged ? '   <-- move changed' : ''}\n`);
  }
  console.log(`=== summary ===`);
  console.log(`  avg depth OFF=${(depthOffSum / positions.length).toFixed(2)}  ON=${(depthOnSum / positions.length).toFixed(2)}`);
  console.log(`  positions where the chosen move changed: ${changed}/${positions.length}`);
}

main();
