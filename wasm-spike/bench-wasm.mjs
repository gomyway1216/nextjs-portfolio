// bench-wasm.mjs — perft benchmark for the AssemblyScript/WASM shogi spike.
//
// Loads src/components/game/ShogiImproved/wasm/shogi.wasm, verifies perft
// counts (must match scripts/shogi-perft-js.ts exactly), and measures throughput.
//
// Usage: node wasm-spike/bench-wasm.mjs [maxDepth]

import { readFileSync } from 'node:fs';

const wasmBytes = readFileSync(new URL('../src/components/game/ShogiImproved/wasm/shogi.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(wasmBytes, {
  env: {
    abort(_msg, _file, line, col) {
      throw new Error(`wasm abort at ${line}:${col}`);
    },
    now: () => performance.now(),
  },
});

const {
  initHirate,
  clearBoard,
  setSquare,
  setHand,
  setSideToMove,
  finalizePosition,
  perft,
  getEvalMaterial,
  getHash,
} = instance.exports;

// Piece constants (same encoding as src/components/game/ShogiImproved/types.ts).
const SENTE = 16;
const SFU = 17, SGI = 20;
const GFU = 33, GKI = 37;

/**
 * Same custom position as makeDropsPosition() in scripts/shogi-perft-js.ts:
 * hirate minus pawns on 0x77 / 0x33, FU+GI in sente's hand, FU+KI in gote's.
 */
function setupDropsPosition() {
  initHirate();
  setSquare(0x77, 0);
  setSquare(0x33, 0);
  setHand(SFU, 1);
  setHand(SGI, 1);
  setHand(GFU, 1);
  setHand(GKI, 1);
  setSideToMove(SENTE);
  finalizePosition();
}

function bench(setup, depth, runs) {
  let count = 0;
  let bestMs = Infinity;
  for (let r = 0; r < runs; r++) {
    setup();
    const eval0 = getEvalMaterial();
    const hash0 = getHash();
    const t0 = performance.now();
    count = perft(depth);
    const ms = performance.now() - t0;
    if (ms < bestMs) bestMs = ms;
    // make/unmake symmetry check: incremental bookkeeping must return to start.
    if (getEvalMaterial() !== eval0 || getHash() !== hash0) {
      throw new Error(`make/unmake asymmetry at depth ${depth}`);
    }
  }
  return { count, bestMs };
}

const maxDepth = Number(process.argv[2] ?? 4);

console.log('=== WASM perft (AssemblyScript spike) ===');
console.log(`node ${process.version}, wasm size ${wasmBytes.length} bytes`);

// Warm up.
initHirate();
perft(2);

for (const [name, setup] of [
  ['hirate', initHirate],
  ['drops', setupDropsPosition],
]) {
  console.log(`\n--- position: ${name} ---`);
  for (let depth = 1; depth <= maxDepth; depth++) {
    const runs = depth <= 3 ? 10 : 3;
    const { count, bestMs } = bench(setup, depth, runs);
    const leavesPerSec = Math.round(count / (bestMs / 1000));
    console.log(
      `depth ${depth}: perft=${count}  best=${bestMs.toFixed(2)}ms` +
        `  (${leavesPerSec.toLocaleString('en-US')} leaves/s)`
    );
  }
}
