/**
 * endgame-wasm-bench.ts — production-path benchmark: WASM search throughput and
 * reached depth on material-heavy (big-hand) endgame positions.
 *
 * The JS micro-profiles (endgame-profile.ts / endgame-gen-breakdown.ts) attribute
 * per-node cost inside the JS engine, but production runs the WASM engine, so this
 * is the number that matters: nodes+leaves per second and completed depth at a
 * fixed budget on the same seeded big-hand positions.
 *
 * Usage: node -r tsx/cjs wasm-spike/endgame-wasm-bench.ts [budgetMs=1000] [runs=3]
 */

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { FU, GOTE, HI, SENTE, Te } from '../src/components/game/ShogiImproved/types';
import { loadShogiWasm, syncWasm } from './search-driver';

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

function main(): void {
  const budgetMs = process.argv[2] ? parseInt(process.argv[2], 10) : 1000;
  const runs = process.argv[3] ? parseInt(process.argv[3], 10) : 3;
  const wasm = loadShogiWasm();
  const positions = buildEndgamePositions();
  console.log(
    `=== WASM endgame bench (budget=${budgetMs}ms, best-of-${runs}, ${positions.length} big-hand positions) ===\n`
  );

  let sumDepth = 0;
  let sumNsPerNode = 0;
  let sumNodesPerSec = 0;
  for (const p of positions) {
    // best-of-N by total nodes+leaves throughput (fresh TT each run for comparability)
    let best = { depth: 0, nodes: 0, leaves: 0, time: Infinity, nsPerNode: Infinity, score: 0, key: 0 };
    for (let r = 0; r < runs; r++) {
      wasm.clearTT();
      syncWasm(wasm, p.k);
      wasm.setRootTesu(p.tesu);
      const t0 = performance.now();
      const key = wasm.searchBestMove(budgetMs, 32, 10);
      const dt = performance.now() - t0;
      const nodes = wasm.getSearchNodes();
      const leaves = wasm.getSearchLeaves();
      const total = nodes + leaves;
      const nsPerNode = (dt * 1e6) / Math.max(1, total);
      if (nsPerNode < best.nsPerNode) {
        best = {
          depth: wasm.getSearchDepth(),
          nodes,
          leaves,
          time: dt,
          nsPerNode,
          score: wasm.getSearchScore(),
          key,
        };
      }
    }
    const total = best.nodes + best.leaves;
    const nps = total / (best.time / 1000);
    sumDepth += best.depth;
    sumNsPerNode += best.nsPerNode;
    sumNodesPerSec += nps;
    console.log(`${p.label} (hand=${p.hand})`);
    console.log(
      `  depth=${best.depth} score=${best.score} nodes=${best.nodes} leaves=${best.leaves} time=${best.time.toFixed(0)}ms`
    );
    console.log(`  ${(nps / 1e6).toFixed(2)}M (nodes+leaves)/s   ${best.nsPerNode.toFixed(0)} ns/(node+leaf)\n`);
  }

  const n = positions.length;
  console.log(`=== average over ${n} positions ===`);
  console.log(`  avg depth        ${(sumDepth / n).toFixed(2)}`);
  console.log(`  avg ns/(node+leaf) ${(sumNsPerNode / n).toFixed(0)}`);
  console.log(`  avg throughput   ${(sumNodesPerSec / n / 1e6).toFixed(2)}M/s`);
}

main();
