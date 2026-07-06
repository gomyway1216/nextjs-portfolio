/**
 * check-profile.ts — isolate the cost of isKingInCheck / isSquareAttacked
 * (the per-node fixed cost that stage-1 bitboard work targets) on realistic
 * drop-heavy endgame positions.
 *
 * Usage: node -r tsx/cjs wasm-spike/check-profile.ts
 */

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { MoveListImproved } from '../src/components/game/ShogiImproved/MoveListImproved';
import { SENTE, GOTE, Te } from '../src/components/game/ShogiImproved/types';

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

function buildEndgamePositions(): Array<{ label: string; k: KyokumenImproved; tesu: number }> {
  const out: Array<{ label: string; k: KyokumenImproved; tesu: number }> = [];
  for (let game = 0; game < 6; game++) {
    const rnd = mulberry32(0xe11d90 + game * 2654435761);
    const k = new KyokumenImproved();
    k.initHirate();
    let tesu = 0;
    const targetPly = 70 + game * 6;
    for (let ply = 0; ply < targetPly; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(k);
      if (moves.length === 0) break;
      const captures = moves.filter((m) => m.capture !== 0);
      let te;
      if (captures.length > 0 && rnd() < 0.7) te = captures[Math.floor(rnd() * captures.length)];
      else te = moves[Math.floor(rnd() * moves.length)];
      te.capture = k.get(te.to);
      k.move(te);
      k.toggleTeban();
      tesu = ply + 1;
    }
    if (GenerateMovesImproved.generateLegalMoves(k).length > 0) {
      out.push({ label: `game${game} ply${tesu}`, k: k.clone(), tesu });
    }
  }
  return out;
}

// 1) Raw isKingInCheck (both sides) micro-bench.
function benchIsKingInCheck(): void {
  const positions = buildEndgamePositions();
  console.log('=== isKingInCheck micro-bench (both sides) ===');
  let grandNs = 0, grandCalls = 0;
  for (const p of positions) {
    for (let i = 0; i < 50000; i++) {
      GenerateMovesImproved.isKingInCheck(p.k, SENTE);
      GenerateMovesImproved.isKingInCheck(p.k, GOTE);
    }
    const iters = 500000;
    const t0 = process.hrtime.bigint();
    let acc = 0;
    for (let i = 0; i < iters; i++) {
      if (GenerateMovesImproved.isKingInCheck(p.k, SENTE)) acc++;
      if (GenerateMovesImproved.isKingInCheck(p.k, GOTE)) acc++;
    }
    const t1 = process.hrtime.bigint();
    const ns = Number(t1 - t0);
    const nsPer = ns / (iters * 2);
    grandNs += ns; grandCalls += iters * 2;
    console.log(`  ${p.label.padEnd(16)} ${nsPer.toFixed(1)} ns/call  (acc=${acc})`);
  }
  console.log(`  --- aggregate: ${(grandNs / grandCalls).toFixed(1)} ns/call ---`);
}

// 2) Realistic hot loop: pseudo-legal gen + make + isKingInCheck(mover) + unmake
//    per move (mirrors V20 lazy-legality search inner loop, 1 ply).
function benchLazyLegalityLoop(): void {
  const positions = buildEndgamePositions();
  const list = new MoveListImproved();
  console.log('\n=== V20-style lazy-legality inner loop (gen + make + isKingInCheck + unmake per move) ===');
  let grandNs = 0, grandNodes = 0;
  for (const p of positions) {
    const runOnce = (): number => {
      GenerateMovesImproved.generatePseudoLegalMovesPooled(p.k, list);
      const moves = list.moves;
      const n = list.size;
      let legal = 0;
      for (let i = 0; i < n; i++) {
        const te = moves[i];
        te.capture = p.k.get(te.to);
        p.k.move(te);
        if (!GenerateMovesImproved.isKingInCheck(p.k, p.k.teban)) legal++;
        p.k.back(te);
      }
      return legal;
    };
    for (let i = 0; i < 2000; i++) runOnce();
    const iters = 20000;
    const t0 = process.hrtime.bigint();
    let acc = 0;
    for (let i = 0; i < iters; i++) acc += runOnce();
    const t1 = process.hrtime.bigint();
    const ns = Number(t1 - t0);
    grandNs += ns; grandNodes += iters;
    console.log(`  ${p.label.padEnd(16)} ${(ns / iters).toFixed(1)} ns/node  (legal=${acc / iters})`);
  }
  console.log(`  --- aggregate: ${(grandNs / grandNodes).toFixed(1)} ns/node ---`);
}

if (require.main === module) {
  benchIsKingInCheck();
  benchLazyLegalityLoop();
}
