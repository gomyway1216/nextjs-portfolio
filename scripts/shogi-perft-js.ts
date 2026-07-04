/**
 * shogi-perft-js.ts — perft benchmark for the existing TS shogi engine.
 *
 * Counts legal move sequences from a position to a fixed depth using the
 * engine's own move generator (GenerateMovesImproved), in two variants:
 *
 * - "legal": generateLegalMovesPooled (eager 王手放置 filtering; pre-V20 path)
 * - "lazy":  generatePseudoLegalMovesPooled + lazy isKingInCheck after make
 *            (the V20 search hot path — compare this one against WASM)
 *
 * Both variants must produce identical counts. The WASM spike
 * (wasm-spike/bench-wasm.mjs) must match these numbers exactly.
 *
 * Usage: node -r tsx/cjs scripts/shogi-perft-js.ts [maxDepth]
 */

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { MoveListImproved } from '../src/components/game/ShogiImproved/MoveListImproved';
import { GOTE, SENTE, SFU, GFU, SGI, GKI } from '../src/components/game/ShogiImproved/types';

const MAX_PLY = 16;
const lists: MoveListImproved[] = [];
for (let i = 0; i < MAX_PLY; i++) lists.push(new MoveListImproved());

function perftLegal(k: KyokumenImproved, depth: number, ply: number): number {
  const moves = GenerateMovesImproved.generateLegalMovesPooled(k, lists[ply]);
  if (depth <= 1) return moves.length;

  let count = 0;
  for (let i = 0; i < moves.length; i++) {
    const te = moves[i];
    k.move(te);
    k.toggleTeban();
    count += perftLegal(k, depth - 1, ply + 1);
    k.toggleTeban();
    k.back(te);
  }
  return count;
}

function perftLazy(k: KyokumenImproved, depth: number, ply: number): number {
  const moves = GenerateMovesImproved.generatePseudoLegalMovesPooled(k, lists[ply]);

  let count = 0;
  for (let i = 0; i < moves.length; i++) {
    const te = moves[i];
    k.move(te);
    if (GenerateMovesImproved.isKingInCheck(k, k.teban)) {
      k.back(te);
      continue;
    }
    if (depth <= 1) {
      count++;
    } else {
      k.toggleTeban();
      count += perftLazy(k, depth - 1, ply + 1);
      k.toggleTeban();
    }
    k.back(te);
  }
  return count;
}

function makeHirate(): KyokumenImproved {
  const k = new KyokumenImproved();
  k.initHirate();
  return k;
}

/**
 * Custom position exercising the drop-move generator (hirate never produces
 * drops within depth 4): hirate minus the pawns on 77 (sente) and 33 (gote),
 * with FU+GI in sente's hand and FU+KI in gote's hand.
 *
 * Keep in sync with the identical setup in wasm-spike/bench-wasm.mjs.
 */
function makeDropsPosition(): KyokumenImproved {
  const k = makeHirate();
  k.ban[0x77] = 0; // remove sente pawn 7七
  k.ban[0x33] = 0; // remove gote pawn 3三
  k.hand[SFU] = 1;
  k.hand[SGI] = 1;
  k.hand[GFU] = 1;
  k.hand[GKI] = 1;
  k.teban = SENTE;
  k.initAll();
  return k;
}

interface BenchResult {
  count: number;
  bestMs: number;
}

function bench(fn: () => number, runs: number): BenchResult {
  let count = 0;
  let bestMs = Infinity;
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    count = fn();
    const ms = performance.now() - t0;
    if (ms < bestMs) bestMs = ms;
  }
  return { count, bestMs };
}

function main(): void {
  const maxDepth = Number(process.argv[2] ?? 4);

  console.log('=== JS perft (existing engine: GenerateMovesImproved) ===');
  console.log(`node ${process.version}`);

  // Warm up the JIT.
  {
    const k = makeHirate();
    perftLegal(k, 2, 0);
    perftLazy(k, 2, 0);
  }

  for (const [name, factory] of [
    ['hirate', makeHirate],
    ['drops', makeDropsPosition],
  ] as const) {
    console.log(`\n--- position: ${name} ---`);
    for (let depth = 1; depth <= maxDepth; depth++) {
      const runs = depth <= 3 ? 5 : 2;

      const kLegal = factory();
      const legal = bench(() => perftLegal(kLegal, depth, 0), runs);

      const kLazy = factory();
      const lazy = bench(() => perftLazy(kLazy, depth, 0), runs);

      if (legal.count !== lazy.count) {
        throw new Error(
          `variant mismatch at ${name} depth ${depth}: legal=${legal.count} lazy=${lazy.count}`
        );
      }

      const leavesPerSecLazy = Math.round(lazy.count / (lazy.bestMs / 1000));
      console.log(
        `depth ${depth}: perft=${legal.count}` +
          `  legal=${legal.bestMs.toFixed(1)}ms  lazy=${lazy.bestMs.toFixed(1)}ms` +
          `  (lazy: ${leavesPerSecLazy.toLocaleString('en-US')} leaves/s)`
      );
    }
  }

  // Reference: teban constants exist to keep imports honest.
  void GOTE;
}

main();
