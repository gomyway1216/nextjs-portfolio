/**
 * search-driver.ts — phase 3 JS ⇄ WASM search comparison harness.
 *
 * 1. Fixed-depth verification: run ShogiAIImprovedV20 (JS) and the WASM
 *    searchBestMove() on the same positions with maxTimeMs=0 and the same
 *    maxDepth / quiescenceDepthMax, and compare bestMove + score. The WASM
 *    port is statement-for-statement, so the expectation is an EXACT match
 *    (same move, same score, same node/leaf counts).
 * 2. Timed benchmark (--bench): same midgame positions, 3s budget each,
 *    compare completed depth and node counts.
 *
 * Positions come from seeded random self-play (same PRNG as parity.ts), so
 * they are deterministic and mostly out of the opening book. Positions where
 * the JS engine answers from the book or the mate solver (no debug line from
 * the main search) are reported and skipped from the exact comparison.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/search-driver.ts            # fixed-depth verification
 *   node -r tsx/cjs wasm-spike/search-driver.ts --bench    # 3s JS-vs-WASM benchmark
 *   node -r tsx/cjs wasm-spike/search-driver.ts \
 *     --wasm-path wasm-spike/artifacts/shogi-halfkp81-research.wasm
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { ShogiAIImprovedV20 } from '../src/components/game/ShogiImproved/ShogiAIImprovedV20';
import { GHI, GOTE, SENTE, SFU, Te } from '../src/components/game/ShogiImproved/types';

// ---------------------------------------------------------------------------
// WASM setup
// ---------------------------------------------------------------------------

export interface ShogiSearchWasm {
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  applyMove(koma: number, from: number, to: number, promote: number): void;
  countLegalMoves(): number;
  getHashVal(): number;
  getTeban(): number;
  clearTT(): void;
  setRootTesu(tesu: number): void;
  searchBestMove(maxTimeMs: number, maxDepth: number, quiescenceDepthMax: number): number;
  getSearchScore(): number;
  getSearchDepth(): number;
  getSearchNodes(): number;
  getSearchLeaves(): number;
}

export const PRODUCTION_SHOGI_WASM_PATH = join(
  __dirname,
  '..',
  'src',
  'components',
  'game',
  'ShogiImproved',
  'wasm',
  'shogi.wasm'
);

/** Failed HalfKP64-RKI16 browser candidate retained for explicit research comparisons. */
export const ACTIVE_HALFKP64_RKI16_WASM_PATH = join(
  __dirname,
  '..',
  'src',
  'components',
  'game',
  'ShogiImproved',
  'wasm',
  'shogi-halfkp64-rki16.wasm'
);

/** Exact HalfKP81 runtime restored to the browser production path. */
export const ACTIVE_HALFKP81_PRODUCTION_WASM_PATH = join(
  __dirname,
  '..',
  'src',
  'components',
  'game',
  'ShogiImproved',
  'wasm',
  'shogi-halfkp81-production.wasm'
);

/**
 * Load an explicitly selected research runtime, or the byte-pinned production
 * runtime when no path is provided. Research callers must pass their artifact
 * path; this function never changes what the browser production loader uses.
 */
export function loadShogiWasm(wasmPath: string = PRODUCTION_SHOGI_WASM_PATH): ShogiSearchWasm {
  const wasmBytes = readFileSync(wasmPath);
  const wasmModule = new WebAssembly.Module(wasmBytes);
  const instance = new WebAssembly.Instance(wasmModule, {
    env: {
      abort(_msg: number, _file: number, line: number, col: number) {
        throw new Error(`wasm abort at ${line}:${col}`);
      },
      now: () => performance.now(),
    // Single-thread stubs for the Lazy SMP shared-TT hooks (never called while
    // setSharedTtEnabled stays 0, but the imports must link).
    sharedTtProbe: (_hashA: number, _hashB: number) => 0,
    sharedTtStore: (_hashA: number, _hashB: number, _value: number, _flagDepth: number, _best: number) => {},
    sharedShouldStop: () => 0,
    },
  });
  return instance.exports as unknown as ShogiSearchWasm;
}

/** Copy the full JS position into the WASM engine. */
export function syncWasm(wasm: ShogiSearchWasm, k: KyokumenImproved): void {
  wasm.clearBoard();
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      wasm.setSquare(pos, k.ban[pos]);
    }
  }
  for (let koma = SFU; koma <= GHI; koma++) {
    wasm.setHand(koma, k.hand[koma] | 0);
  }
  wasm.setSideToMove(k.teban);
  wasm.finalizePosition();
}

/** Decode the packed move key ((koma&0x3f) | from<<6 | to<<14 | promote<<22) into a Te. */
export function teFromWasmKey(key: number, k: KyokumenImproved): Te {
  const koma = key & 0x3f;
  const from = (key >> 6) & 0xff;
  const to = (key >> 14) & 0xff;
  const promote = ((key >> 22) & 1) === 1;
  const capture = k.get(to);
  return new Te(koma, from, to, promote, capture);
}

export function jsMoveKey(te: Te): number {
  return (te.koma & 0x3f) | ((te.from & 0xff) << 6) | ((te.to & 0xff) << 14) | ((te.promote ? 1 : 0) << 22);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

interface JsSearchResult {
  move: Te | null;
  depth: number;
  score: number;
  nodes: number;
  leaves: number;
  fromSearch: boolean; // false => opening book / mate solver answered (no debug line)
  timeMs: number;
}

/** Run the JS V20 search capturing its debug summary line for depth/score/nodes. */
function runJsSearch(
  k: KyokumenImproved,
  tesu: number,
  maxTimeMs: number,
  maxDepth: number,
  quiescenceDepthMax: number
): JsSearchResult {
  const ai = new ShogiAIImprovedV20(); // fresh TT per position (mirrors WASM clearTT)
  const origLog = console.log;
  let line: string | null = null;
  console.log = (...args: unknown[]) => {
    const s = String(args[0] ?? '');
    if (s.startsWith('[ShogiAIImprovedV20]')) line = s;
    else origLog(...args);
  };
  const start = performance.now();
  let move: Te | null = null;
  try {
    move = ai.getNextTe(k, tesu, {
      maxTimeMs,
      maxDepth,
      quiescenceDepthMax,
      evaluationMode: 'v3',
      debug: true,
    });
  } finally {
    console.log = origLog;
  }
  const timeMs = performance.now() - start;

  if (line === null) {
    return { move, depth: 0, score: 0, nodes: 0, leaves: 0, fromSearch: false, timeMs };
  }
  const match = /depth=(\d+)\/\d+ score=(-?\d+) nodes=(\d+) leaves=(\d+)/.exec(line);
  if (!match) throw new Error(`unexpected debug line: ${line}`);
  return {
    move,
    depth: parseInt(match[1], 10),
    score: parseInt(match[2], 10),
    nodes: parseInt(match[3], 10),
    leaves: parseInt(match[4], 10),
    fromSearch: true,
    timeMs,
  };
}

/** Deterministic random-play position snapshots (mostly out of the opening book). */
function buildTestPositions(): Array<{ label: string; k: KyokumenImproved; tesu: number }> {
  const positions: Array<{ label: string; k: KyokumenImproved; tesu: number }> = [];
  const snapshots = [16, 24, 33, 42];
  for (let game = 0; game < 4; game++) {
    const rnd = mulberry32(0xbeef01 + game * 7919);
    const k = new KyokumenImproved();
    k.initHirate();
    const maxPly = snapshots[snapshots.length - 1];
    for (let ply = 0; ply < maxPly; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(k);
      if (moves.length === 0) break;
      const te = moves[Math.floor(rnd() * moves.length)];
      te.capture = k.get(te.to);
      k.move(te);
      k.toggleTeban();
      const tesu = ply + 1;
      if (snapshots.includes(tesu)) {
        if (GenerateMovesImproved.generateLegalMoves(k).length > 0) {
          positions.push({ label: `game${game} ply${tesu}`, k: k.clone(), tesu });
        }
      }
    }
  }
  return positions;
}

// ---------------------------------------------------------------------------
// Fixed-depth verification
// ---------------------------------------------------------------------------

function runFixedDepthVerification(wasm: ShogiSearchWasm): void {
  const cases = buildTestPositions();
  const depths = [4, 5, 6];
  let exact = 0;
  let close = 0;
  let skipped = 0;
  let failed = 0;
  let compared = 0;

  console.log(`=== fixed-depth verification (maxTimeMs=0, quiescenceDepthMax=8) ===`);
  for (const depth of depths) {
    for (const c of cases) {
      const js = runJsSearch(c.k, c.tesu, 0, depth, 8);
      if (!js.fromSearch) {
        console.log(`  d${depth} ${c.label}: SKIP (JS answered from book/mate solver: ${js.move?.toString()})`);
        skipped++;
        continue;
      }

      wasm.clearTT();
      syncWasm(wasm, c.k);
      wasm.setRootTesu(c.tesu);
      const key = wasm.searchBestMove(0, depth, 8);
      const wScore = wasm.getSearchScore();
      const wDepth = wasm.getSearchDepth();
      const wNodes = wasm.getSearchNodes();
      const wLeaves = wasm.getSearchLeaves();

      compared++;
      const jsKey = js.move ? jsMoveKey(js.move) : 0;
      const wasmTe = key !== 0 ? teFromWasmKey(key, c.k) : null;

      // The WASM move must always be legal.
      const legal = GenerateMovesImproved.generateLegalMoves(c.k);
      const isLegal =
        wasmTe !== null &&
        legal.some(
          (te) => te.koma === wasmTe.koma && te.from === wasmTe.from && te.to === wasmTe.to && te.promote === wasmTe.promote
        );
      if (!isLegal) {
        console.log(`  d${depth} ${c.label}: FAIL — WASM move ${wasmTe?.toString() ?? '(none)'} is not legal`);
        failed++;
        continue;
      }

      if (key === jsKey && wScore === js.score && wNodes === js.nodes && wLeaves === js.leaves) {
        exact++;
        console.log(
          `  d${depth} ${c.label}: EXACT ${js.move!.toString()} score=${js.score} nodes=${js.nodes} leaves=${js.leaves} (JS ${js.timeMs.toFixed(0)}ms)`
        );
      } else if (key === jsKey && Math.abs(wScore - js.score) <= 50) {
        close++;
        console.log(
          `  d${depth} ${c.label}: SAME MOVE, score JS=${js.score} WASM=${wScore}, nodes JS=${js.nodes} WASM=${wNodes}`
        );
      } else {
        failed++;
        console.log(
          `  d${depth} ${c.label}: DIFF — JS ${js.move!.toString()} score=${js.score} nodes=${js.nodes} / ` +
            `WASM ${wasmTe!.toString()} score=${wScore} depth=${wDepth} nodes=${wNodes}`
        );
      }
    }
  }

  console.log(
    `\nfixed-depth summary: compared=${compared} exact=${exact} sameMoveClose=${close} diff=${failed} skipped(book/mate)=${skipped}`
  );
  if (failed > 0) process.exit(1);
  if (compared === 0) {
    console.error('no positions compared (all book/mate hits?) — vacuous verification');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Timed benchmark (JS vs WASM, 3s per position)
// ---------------------------------------------------------------------------

function runBench(wasm: ShogiSearchWasm): void {
  const cases = buildTestPositions().filter((c) => c.tesu >= 24).slice(0, 3);
  const timeMs = 3000;
  const qMax = 10;

  console.log(`=== 3s benchmark (maxTimeMs=${timeMs}, quiescenceDepthMax=${qMax}) ===`);
  for (const c of cases) {
    const js = runJsSearch(c.k, c.tesu, timeMs, 32, qMax);

    wasm.clearTT();
    syncWasm(wasm, c.k);
    wasm.setRootTesu(c.tesu);
    const t0 = performance.now();
    const key = wasm.searchBestMove(timeMs, 32, qMax);
    const wTime = performance.now() - t0;
    const wasmTe = key !== 0 ? teFromWasmKey(key, c.k) : null;

    console.log(`  ${c.label}:`);
    console.log(
      `    JS   depth=${js.depth} score=${js.score} nodes=${js.nodes} leaves=${js.leaves} move=${js.move?.toString()} time=${js.timeMs.toFixed(0)}ms${js.fromSearch ? '' : ' (book/mate)'}`
    );
    console.log(
      `    WASM depth=${wasm.getSearchDepth()} score=${wasm.getSearchScore()} nodes=${wasm.getSearchNodes()} leaves=${wasm.getSearchLeaves()} move=${wasmTe?.toString()} time=${wTime.toFixed(0)}ms`
    );
  }
}

// ---------------------------------------------------------------------------

if (require.main === module) {
  const wasmPathIndex = process.argv.indexOf('--wasm-path');
  const wasmPath = wasmPathIndex < 0 ? undefined : process.argv[wasmPathIndex + 1];
  if (wasmPathIndex >= 0 && (!wasmPath || wasmPath.startsWith('--'))) {
    throw new Error('--wasm-path requires a value');
  }
  const wasm = loadShogiWasm(wasmPath);
  if (process.argv.includes('--bench')) {
    runBench(wasm);
  } else {
    runFixedDepthVerification(wasm);
  }
}
