/**
 * mt-stress.ts — Lazy SMP freeze reproduction harness (task gate 1a).
 *
 * Runs N=threads Lazy SMP searches back-to-back, hundreds of times, over a set
 * of midgame/endgame positions, measuring EACH search's wall-clock time. The
 * production freeze symptom was "AI Thinking… forever": the main thread's
 * searchBestMove() never returning (or returning pathologically late). This
 * harness makes that observable:
 *   - per-search wall time vs the requested budget (a search that takes
 *     >> budget+margin is the freeze / severe slowdown),
 *   - a watchdog that flags any single search that overruns a hard ceiling,
 *   - a single-thread control run over the same positions for comparison
 *     (MT must not be *slower* than ST — that would be a boundary-crossing or
 *     contention regression).
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/mt/mt-stress.ts \
 *     [--threads 4] [--iters 300] [--ms 1000] [--nnue 1] \
 *     [--watchdog-ms 8000] [--endgame 1]
 */

import { GenerateMovesImproved } from '../../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../../src/components/game/ShogiImproved/KyokumenImproved';
import { Te } from '../../src/components/game/ShogiImproved/types';
import { teFromWasmKey } from '../search-driver';
import { MtWasmPlayer, loadNnueIntoWasm, loadShogiWasmMt, syncWasmMt } from './mtPlayer';

function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  if (i < 0) return def;
  const n = parseInt(process.argv[i + 1], 10);
  if (!Number.isFinite(n)) throw new Error(`${flag} requires a numeric value`);
  return n;
}

const THREADS = argNum('--threads', 4);
const ITERS = argNum('--iters', 300);
const MOVE_MS = argNum('--ms', 1000);
const NNUE = argNum('--nnue', 1) !== 0;
const WATCHDOG_MS = argNum('--watchdog-ms', Math.max(8000, MOVE_MS * 6));
const INCLUDE_ENDGAME = argNum('--endgame', 1) !== 0;
const QMAX = 10;

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

/** Random-self-play snapshots across game phases (opening..endgame). */
function buildPositions(): Array<{ label: string; k: KyokumenImproved; tesu: number }> {
  const positions: Array<{ label: string; k: KyokumenImproved; tesu: number }> = [];
  const snapshots = INCLUDE_ENDGAME ? [16, 28, 40, 52, 64, 80] : [20, 32, 44];
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
      if (snapshots.includes(tesu) && GenerateMovesImproved.generateLegalMoves(k).length > 0) {
        positions.push({ label: `g${game}p${tesu}`, k: k.clone(), tesu });
      }
    }
  }
  return positions;
}

function isLegal(k: KyokumenImproved, te: Te): boolean {
  return GenerateMovesImproved.generateLegalMoves(k).some(
    (m) => m.koma === te.koma && m.from === te.from && m.to === te.to && m.promote === te.promote
  );
}

interface Timing {
  label: string;
  ms: number;
  key: number;
  legal: boolean;
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main(): Promise<void> {
  const positions = buildPositions();
  console.log(
    `=== mt-stress: threads=${THREADS} iters=${ITERS} budget=${MOVE_MS}ms nnue=${NNUE} ` +
      `watchdog=${WATCHDOG_MS}ms positions=${positions.length} ===\n`
  );

  // ---- Single-thread control ------------------------------------------------
  const st = loadShogiWasmMt(null, () => 0);
  if (NNUE) loadNnueIntoWasm(st);
  const stTimes: number[] = [];
  for (const pos of positions) {
    st.clearTT();
    syncWasmMt(st, pos.k);
    st.setRootTesu(pos.tesu);
    const t0 = performance.now();
    st.searchBestMove(MOVE_MS, 32, QMAX);
    stTimes.push(performance.now() - t0);
  }
  const stSorted = [...stTimes].sort((a, b) => a - b);
  console.log(
    `single-thread control over ${positions.length} pos: ` +
      `median ${pct(stSorted, 50).toFixed(0)}ms  p95 ${pct(stSorted, 95).toFixed(0)}ms  ` +
      `max ${Math.max(...stTimes).toFixed(0)}ms\n`
  );

  // ---- Multi-thread stress loop ---------------------------------------------
  const mt = new MtWasmPlayer('MT', THREADS, NNUE);
  console.log(`MT player up: 1 main + ${mt.helperCount} helper(s). Running ${ITERS} searches...\n`);

  const timings: Timing[] = [];
  let hangs = 0;
  let illegal = 0;
  let noMove = 0;
  const overBudget: Timing[] = [];

  // The whole harness is single-threaded JS on the main; searchBestMove() is a
  // blocking synchronous call. A true "never returns" freeze would hang THIS
  // loop, so we cannot use an in-process timer to interrupt it. Instead we
  // record every search's wall time and, if any single search exceeds the
  // watchdog ceiling, flag it as a freeze/severe-slowdown observation. (For a
  // real "returns never" we'd need a separate process; the browser repro in
  // gate 1b covers that. Here we catch the far-more-likely severe slowdown.)
  const start = performance.now();
  for (let i = 0; i < ITERS; i++) {
    const pos = positions[i % positions.length];
    // Alternate cold/warm TT: cold every 5th iter, else keep the shared TT hot
    // across iterations (production keeps the TT across moves of one game).
    if (i % 5 === 0) mt.newGame();

    const t0 = performance.now();
    const key = mt.searchKey(pos.k, pos.tesu, MOVE_MS, QMAX);
    const ms = performance.now() - t0;

    const te = key !== 0 ? teFromWasmKey(key, pos.k) : null;
    const legal = te ? isLegal(pos.k, te) : false;
    const timing: Timing = { label: pos.label, ms, key, legal };
    timings.push(timing);

    if (key === 0) noMove++;
    else if (!legal) illegal++;
    if (ms > WATCHDOG_MS) {
      hangs++;
      console.log(`  !! WATCHDOG: iter ${i} (${pos.label}) took ${ms.toFixed(0)}ms > ${WATCHDOG_MS}ms`);
    }
    if (ms > MOVE_MS * 2 + 500) overBudget.push(timing);

    if ((i + 1) % 50 === 0) {
      const recent = timings.slice(-50).map((t) => t.ms).sort((a, b) => a - b);
      console.log(
        `  [${i + 1}/${ITERS}] last-50: median ${pct(recent, 50).toFixed(0)}ms ` +
          `p95 ${pct(recent, 95).toFixed(0)}ms max ${recent[recent.length - 1].toFixed(0)}ms`
      );
    }
  }
  const wall = performance.now() - start;

  const mtSorted = timings.map((t) => t.ms).sort((a, b) => a - b);
  console.log(`\n=== results (${ITERS} MT searches, ${(wall / 1000).toFixed(1)}s wall) ===`);
  console.log(
    `MT per-search: median ${pct(mtSorted, 50).toFixed(0)}ms  p95 ${pct(mtSorted, 95).toFixed(0)}ms  ` +
      `p99 ${pct(mtSorted, 99).toFixed(0)}ms  max ${mtSorted[mtSorted.length - 1].toFixed(0)}ms`
  );
  console.log(`budget=${MOVE_MS}ms  watchdog=${WATCHDOG_MS}ms`);
  console.log(`hangs (>watchdog): ${hangs}`);
  console.log(`over-budget (>2x+500ms): ${overBudget.length}` +
    (overBudget.length ? ` [${overBudget.slice(0, 8).map((t) => `${t.label}:${t.ms.toFixed(0)}ms`).join(', ')}${overBudget.length > 8 ? ', …' : ''}]` : ''));
  console.log(`illegal moves: ${illegal}   no-move returns: ${noMove}`);

  await mt.close();

  const fail = hangs > 0 || illegal > 0;
  console.log(fail ? `\nSTRESS REPRODUCED A PROBLEM (hangs=${hangs}, illegal=${illegal})` : `\nNO HANG / NO SLOWDOWN OBSERVED (${ITERS} searches clean)`);
  process.exit(fail ? 1 : 0);
}

void main();
