/**
 * endgame-profile.ts — micro-profile of per-node cost in material-heavy endgames.
 *
 * Diagnosis goal: the engine's per-node cost balloons from ~4µs (opening/midgame)
 * to 27–41µs in positions with large hands, collapsing endgame search depth from
 * 11–12 to 4–6. This script isolates *which* part of a node is responsible by
 * timing the three suspects independently on the same set of positions:
 *
 *   (A) generatePseudoLegalMovesPooled  — move generation (drops explode with big hands)
 *   (B) lazy legality filter            — make/unmake + isKingInCheck per move
 *   (C) evaluateV3Full                  — leaf evaluation (the V20 leaf value)
 *
 * Positions are built from seeded self-play biased toward captures/promotions so
 * the hands grow, then filtered to those with a large total hand count. This is a
 * CPU-light micro-bench (bounded iteration counts, no deep search), safe to run
 * while other A/B matches are using the machine.
 *
 * Usage: node -r tsx/cjs wasm-spike/endgame-profile.ts
 */

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { MoveListImproved } from '../src/components/game/ShogiImproved/MoveListImproved';
import { FU, GOTE, HI, SENTE, Te } from '../src/components/game/ShogiImproved/types';

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
  for (let type = FU; type <= HI; type++) {
    n += (k.hand[SENTE | type] | 0) + (k.hand[GOTE | type] | 0);
  }
  return n;
}

/** Play a biased self-play game; snapshot positions with big hands. */
function buildEndgamePositions(): Array<{ label: string; k: KyokumenImproved; hand: number }> {
  const out: Array<{ label: string; k: KyokumenImproved; hand: number }> = [];
  for (let game = 0; game < 6; game++) {
    const rnd = mulberry32(0xe11a9e + game * 104729);
    const k = new KyokumenImproved();
    k.initHirate();
    for (let ply = 0; ply < 110; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(k);
      if (moves.length === 0) break;
      // Bias: prefer captures and promotions to grow hands / reach sharp endgames.
      let pick: Te;
      const noisy = moves.filter((m) => m.capture !== 0 || m.promote);
      if (noisy.length > 0 && rnd() < 0.75) {
        pick = noisy[Math.floor(rnd() * noisy.length)];
      } else {
        pick = moves[Math.floor(rnd() * moves.length)];
      }
      pick.capture = k.get(pick.to);
      k.move(pick);
      k.toggleTeban();
      const hand = handCount(k);
      if (ply >= 60 && hand >= 6 && GenerateMovesImproved.generateLegalMoves(k).length > 0) {
        out.push({ label: `game${game} ply${ply + 1}`, k: k.clone(), hand });
        break; // one snapshot per game so the sample spans distinct games, not one game's tail
      }
    }
  }
  // Keep a spread of the highest-hand positions (now at most one per game).
  out.sort((a, b) => b.hand - a.hand);
  return out.slice(0, 4);
}

function bestOf(runs: number, fn: () => void): number {
  let best = Infinity;
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    fn();
    const dt = performance.now() - t0;
    if (dt < best) best = dt;
  }
  return best;
}

function main(): void {
  const positions = buildEndgamePositions();
  if (positions.length === 0) {
    console.log('No big-hand positions were generated (thresholds too strict?). Nothing to profile.');
    return;
  }
  console.log(`=== endgame node-cost micro-profile (JS engine, big-hand positions) ===\n`);

  const ITER = 3_000; // iterations per measurement
  const pool = new MoveListImproved();

  // Totals for an aggregate "typical big-hand node" cost estimate.
  let sumGenNs = 0;
  let sumLegalNs = 0;
  let sumEvalNs = 0;
  let sumMoves = 0;
  let count = 0;

  for (const p of positions) {
    const k = p.k;

    // (A) pseudo-legal move generation
    let moveCount = 0;
    const genMs = bestOf(3, () => {
      for (let i = 0; i < ITER; i++) {
        const list = GenerateMovesImproved.generatePseudoLegalMovesPooled(k, pool);
        moveCount = list.length;
      }
    });

    // (B) lazy legality filter over the generated list (make/unmake + isKingInCheck)
    const legalMs = bestOf(3, () => {
      for (let i = 0; i < ITER; i++) {
        const list = GenerateMovesImproved.generatePseudoLegalMovesPooled(k, pool);
        for (let j = 0; j < list.length; j++) {
          const te = list[j];
          te.capture = k.get(te.to);
          k.move(te);
          GenerateMovesImproved.isKingInCheck(k, k.teban);
          k.back(te);
        }
      }
    });
    // Subtract the generation cost embedded in (B) to isolate legality work.
    const legalOnlyMs = Math.max(0, legalMs - genMs);

    // (C) leaf evaluation (the value V20 uses at a leaf: evaluateV3 + hangingThreat)
    const evalMs = bestOf(3, () => {
      for (let i = 0; i < ITER; i++) {
        k.evaluateV3();
      }
    });

    // performance.now() is in milliseconds; ms→ns is ×1e6.
    const genNs = (genMs / ITER) * 1e6;
    const legalNs = (legalOnlyMs / ITER) * 1e6;
    const evalNs = (evalMs / ITER) * 1e6;
    const nodeNs = genNs + legalNs + evalNs;

    sumGenNs += genNs;
    sumLegalNs += legalNs;
    sumEvalNs += evalNs;
    sumMoves += moveCount;
    count++;

    console.log(`${p.label}  (hand=${p.hand}, pseudo-moves=${moveCount})`);
    console.log(`  gen        ${genNs.toFixed(2)} ns/node`);
    console.log(`  legality   ${legalNs.toFixed(2)} ns/node  (${(legalNs / Math.max(1, moveCount)).toFixed(2)} ns/move × ${moveCount})`);
    console.log(`  eval(V3)   ${evalNs.toFixed(2)} ns/node`);
    console.log(`  ~node cost ${nodeNs.toFixed(0)} ns  (gen ${(100 * genNs / nodeNs).toFixed(0)}% / legal ${(100 * legalNs / nodeNs).toFixed(0)}% / eval ${(100 * evalNs / nodeNs).toFixed(0)}%)\n`);
  }

  const g = sumGenNs / count;
  const l = sumLegalNs / count;
  const e = sumEvalNs / count;
  const node = g + l + e;
  console.log(`=== average across ${count} big-hand positions (avg pseudo-moves=${(sumMoves / count).toFixed(0)}) ===`);
  console.log(`  gen        ${g.toFixed(0)} ns  (${(100 * g / node).toFixed(0)}%)`);
  console.log(`  legality   ${l.toFixed(0)} ns  (${(100 * l / node).toFixed(0)}%)`);
  console.log(`  eval(V3)   ${e.toFixed(0)} ns  (${(100 * e / node).toFixed(0)}%)`);
  console.log(`  node total ${node.toFixed(0)} ns  (~${(node / 1000).toFixed(1)} µs)`);
  console.log(`\nNote: JS timings (WASM is ~27–30× faster per the eval bench, but the *relative*`);
  console.log(`breakdown between gen/legality/eval is what identifies the hot path).`);
}

main();
