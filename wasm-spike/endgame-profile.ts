/**
 * endgame-profile.ts — measure the per-node cost of move generation in
 * drop-heavy endgame positions, plus fixed-time reached-node / depth.
 *
 * Two measurements:
 *  1. Micro-benchmark of GenerateMovesImproved.generatePseudoLegalMovesPooled()
 *     on endgame positions where most pieces are in hand (drops dominate).
 *     Reports ns/call and generated-move count so before/after node cost can be
 *     compared directly.
 *  2. Fixed 2000ms JS V20 search on the same positions, reporting reached nodes
 *     and completed depth.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/endgame-profile.ts            # micro-bench only
 *   node -r tsx/cjs wasm-spike/endgame-profile.ts --search   # + fixed-2s search
 */

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { MoveListImproved } from '../src/components/game/ShogiImproved/MoveListImproved';
import { ShogiAIImprovedV20 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV20';

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

/**
 * Build deterministic drop-heavy endgame positions via deep random self-play
 * that prefers captures (so many pieces migrate into hand).
 */
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
      // Prefer captures 70% of the time to drive pieces into hand.
      const captures = moves.filter((m) => m.capture !== 0);
      let te;
      if (captures.length > 0 && rnd() < 0.7) {
        te = captures[Math.floor(rnd() * captures.length)];
      } else {
        te = moves[Math.floor(rnd() * moves.length)];
      }
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

function handSummary(k: KyokumenImproved): string {
  let total = 0;
  for (let koma = 0; koma < k.hand.length; koma++) total += k.hand[koma] | 0;
  return `handTotal=${total}`;
}

function microBench(): void {
  const positions = buildEndgamePositions();
  const list = new MoveListImproved();

  console.log('=== drop-heavy pseudo-legal generation micro-bench ===');
  let grandCalls = 0;
  let grandNs = 0;
  let grandMoves = 0;
  for (const p of positions) {
    // Measure generated-move count once.
    GenerateMovesImproved.generatePseudoLegalMovesPooled(p.k, list);
    const moveCount = list.size;

    // Warmup.
    for (let i = 0; i < 20000; i++) GenerateMovesImproved.generatePseudoLegalMovesPooled(p.k, list);

    const iters = 200000;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) GenerateMovesImproved.generatePseudoLegalMovesPooled(p.k, list);
    const t1 = process.hrtime.bigint();
    const ns = Number(t1 - t0);
    const nsPer = ns / iters;
    grandCalls += iters;
    grandNs += ns;
    grandMoves += moveCount;
    console.log(
      `  ${p.label.padEnd(16)} ${handSummary(p.k).padEnd(14)} moves=${String(moveCount).padStart(3)}  ${nsPer.toFixed(1)} ns/call  (${(nsPer / Math.max(1, moveCount)).toFixed(2)} ns/move)`
    );
  }
  console.log(
    `  --- aggregate: ${(grandNs / grandCalls).toFixed(1)} ns/call over ${positions.length} positions, avg moves=${(grandMoves / positions.length).toFixed(1)} ---`
  );
}

function fixedSearch(): void {
  const positions = buildEndgamePositions();
  const budget = 2000;
  console.log(`\n=== fixed ${budget}ms JS V20 search (reached nodes / depth) ===`);
  let totalNodes = 0;
  for (const p of positions) {
    const ai = new ShogiAIImprovedV20();
    const origLog = console.log;
    let line: string | null = null;
    console.log = (...args: unknown[]) => {
      const s = String(args[0] ?? '');
      if (s.startsWith('[ShogiAIImprovedV20]')) line = s;
      else origLog(...args);
    };
    try {
      ai.getNextTe(p.k, p.tesu, {
        maxTimeMs: budget,
        maxDepth: 32,
        quiescenceDepthMax: 10,
        evaluationMode: 'v3',
        debug: true,
      });
    } finally {
      console.log = origLog;
    }
    const m = line ? /depth=(\d+)\/\d+ score=(-?\d+) nodes=(\d+) leaves=(\d+)/.exec(line) : null;
    if (m) {
      totalNodes += parseInt(m[3], 10);
      console.log(`  ${p.label.padEnd(16)} depth=${m[1]} nodes=${m[3]} leaves=${m[4]}`);
    } else {
      console.log(`  ${p.label.padEnd(16)} (book/mate, no search line)`);
    }
  }
  console.log(`  --- total reached nodes: ${totalNodes} ---`);
}

if (require.main === module) {
  microBench();
  if (process.argv.includes('--search')) fixedSearch();
}
