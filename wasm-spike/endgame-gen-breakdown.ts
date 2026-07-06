/**
 * endgame-gen-breakdown.ts — break move generation itself into board-moves vs
 * drop-moves vs the uchifuzume probe, on big-hand positions.
 *
 * The node-cost profile showed generation is ~50% of a big-hand node. This
 * splits that cost so we know whether to attack drops, board moves, or the
 * uchifuzume check. CPU-light (bounded iterations).
 *
 * Usage: node -r tsx/cjs wasm-spike/endgame-gen-breakdown.ts
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
  for (let type = FU; type <= HI; type++) n += (k.hand[SENTE | type] | 0) + (k.hand[GOTE | type] | 0);
  return n;
}

function buildEndgamePositions(): Array<{ label: string; k: KyokumenImproved; hand: number }> {
  const out: Array<{ label: string; k: KyokumenImproved; hand: number }> = [];
  for (let game = 0; game < 6; game++) {
    const rnd = mulberry32(0xe11a9e + game * 104729);
    const k = new KyokumenImproved();
    k.initHirate();
    for (let ply = 0; ply < 110; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(k);
      if (moves.length === 0) break;
      let pick: Te;
      const noisy = moves.filter((m) => m.capture !== 0 || m.promote);
      if (noisy.length > 0 && rnd() < 0.75) pick = noisy[Math.floor(rnd() * noisy.length)];
      else pick = moves[Math.floor(rnd() * moves.length)];
      pick.capture = k.get(pick.to);
      k.move(pick);
      k.toggleTeban();
      const hand = handCount(k);
      if (ply >= 60 && hand >= 6 && GenerateMovesImproved.generateLegalMoves(k).length > 0) {
        out.push({ label: `game${game} ply${ply + 1}`, k: k.clone(), hand });
      }
    }
  }
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
  console.log(`=== generation breakdown (big-hand positions) ===\n`);
  const ITER = 4_000;
  const pool = new MoveListImproved();

  for (const p of positions) {
    const k = p.k;

    // Count board vs drop moves in the full pseudo-legal list.
    const list = GenerateMovesImproved.generatePseudoLegalMovesPooled(k, pool);
    let board = 0;
    let drops = 0;
    for (let i = 0; i < list.length; i++) {
      if (list[i].from === 0) drops++;
      else board++;
    }

    // Full pooled generation (board + drops + uchifuzume).
    const fullMs = bestOf(3, () => {
      for (let i = 0; i < ITER; i++) GenerateMovesImproved.generatePseudoLegalMovesPooled(k, pool);
    });
    const fullNs = (fullMs / ITER) * 1000;

    console.log(`${p.label}  (hand=${p.hand}, board=${board}, drops=${drops}, total=${list.length})`);
    console.log(`  full gen   ${fullNs.toFixed(1)} ns/node  (${(fullNs / Math.max(1, list.length)).toFixed(2)} ns per generated move)\n`);
  }
}

main();
