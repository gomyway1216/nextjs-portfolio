/**
 * mt-sanity.ts — multi-thread (Lazy SMP) verification, non-deterministic mode.
 *
 * Multi-thread search is inherently non-deterministic (TT write timing), so
 * instead of bit-parity this checks the gates that still hold:
 *  (a) every move returned by the MT search is legal (validated against the
 *      JS legal move list),
 *  (b) repeating the same position N times yields moves from a small,
 *      plausible set (no wild scatter from TT corruption),
 *  (c) total visited nodes (main + helpers) scale with the thread count vs a
 *      single-thread search of the same positions.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/mt/mt-sanity.ts [--threads 4] [--repeats 100]
 *     [--ms 500] [--scale-ms 2000]
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
const REPEATS = argNum('--repeats', 100);
const MOVE_MS = argNum('--ms', 500);
const SCALE_MS = argNum('--scale-ms', 2000);
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

/** Deterministic self-play midgame snapshots (same policy as search-driver). */
function buildPositions(): Array<{ label: string; k: KyokumenImproved; tesu: number }> {
  const positions: Array<{ label: string; k: KyokumenImproved; tesu: number }> = [];
  const snapshots = [20, 32, 44];
  for (let game = 0; game < 3; game++) {
    const rnd = mulberry32(0xfeed42 + game * 7919);
    const k = new KyokumenImproved();
    k.initHirate();
    for (let ply = 0; ply < snapshots[snapshots.length - 1]; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(k);
      if (moves.length === 0) break;
      const te = moves[Math.floor(rnd() * moves.length)];
      te.capture = k.get(te.to);
      k.move(te);
      k.toggleTeban();
      const tesu = ply + 1;
      if (snapshots.includes(tesu) && GenerateMovesImproved.generateLegalMoves(k).length > 0) {
        positions.push({ label: `game${game} ply${tesu}`, k: k.clone(), tesu });
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

async function main(): Promise<void> {
  const positions = buildPositions();
  const mt = new MtWasmPlayer('MT', THREADS, true);
  console.log(`=== mt-sanity: ${THREADS} threads (1 main + ${mt.helperCount} helpers), NNUE ===\n`);
  let failures = 0;

  // ---- (a)+(b): repeated searches on one position -------------------------
  const rep = positions[1] ?? positions[0];
  console.log(`--- (a)+(b) ${REPEATS} searches x ${MOVE_MS}ms on ${rep.label}: legality + move-set spread ---`);
  const moveCounts = new Map<string, number>();
  for (let i = 0; i < REPEATS; i++) {
    mt.newGame(); // independent runs: cold TT each time
    const key = mt.searchKey(rep.k, rep.tesu, MOVE_MS, QMAX);
    if (key === 0) {
      console.log(`  FAIL: run ${i} returned no move`);
      failures++;
      continue;
    }
    const te = teFromWasmKey(key, rep.k);
    if (!isLegal(rep.k, te)) {
      console.log(`  FAIL: run ${i} returned ILLEGAL move ${te.toString()}`);
      failures++;
      continue;
    }
    moveCounts.set(te.toString(), (moveCounts.get(te.toString()) ?? 0) + 1);
  }
  const spread = [...moveCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(
    `  ${REPEATS} runs -> ${spread.length} distinct move(s): ` +
      spread.map(([m, c]) => `${m} x${c}`).join(', ')
  );
  // A handful of near-equal candidates is expected; dozens would indicate a
  // corrupted TT steering the search at random.
  if (spread.length > 8) {
    console.log(`  FAIL: ${spread.length} distinct moves (> 8) — implausible scatter`);
    failures++;
  }

  // ---- (a) again across different positions -------------------------------
  console.log(`\n--- (a) legality across ${positions.length} positions x 5 runs (${MOVE_MS}ms) ---`);
  for (const pos of positions) {
    for (let i = 0; i < 5; i++) {
      mt.newGame();
      const key = mt.searchKey(pos.k, pos.tesu, MOVE_MS, QMAX);
      const te = key !== 0 ? teFromWasmKey(key, pos.k) : null;
      if (!te || !isLegal(pos.k, te)) {
        console.log(`  FAIL: ${pos.label} run ${i}: ${te ? `illegal ${te.toString()}` : 'no move'}`);
        failures++;
      }
    }
  }
  console.log('  done');

  // ---- (c) node scaling ----------------------------------------------------
  console.log(`\n--- (c) node scaling at ${SCALE_MS}ms (single-thread vs ${THREADS} threads) ---`);
  const st = loadShogiWasmMt(null, () => 0);
  loadNnueIntoWasm(st);
  let ratioSum = 0;
  for (const pos of positions) {
    st.clearTT();
    syncWasmMt(st, pos.k);
    st.setRootTesu(pos.tesu);
    st.searchBestMove(SCALE_MS, 32, QMAX);
    const stVisited = st.getSearchNodes() + st.getSearchLeaves();
    const stDepth = st.getSearchDepth();

    mt.newGame();
    mt.searchKey(pos.k, pos.tesu, SCALE_MS, QMAX);
    const stats = await mt.collectStats();
    const mtVisited = stats.mainVisited + stats.helperVisited;
    const ratio = mtVisited / stVisited;
    ratioSum += ratio;
    console.log(
      `  ${pos.label}: ST ${stVisited} nodes d${stDepth} | MT ${mtVisited} nodes ` +
        `(main ${stats.mainVisited} + helpers ${stats.helperVisited}) d${stats.depth} | x${ratio.toFixed(2)}`
    );
  }
  const avgRatio = ratioSum / positions.length;
  console.log(`  average node ratio: x${avgRatio.toFixed(2)} (threads=${THREADS})`);
  if (avgRatio < THREADS * 0.6) {
    console.log(`  FAIL: node scaling x${avgRatio.toFixed(2)} < ${(THREADS * 0.6).toFixed(1)} — helpers not contributing`);
    failures++;
  }

  await mt.close();
  console.log(failures === 0 ? '\nALL MT SANITY CHECKS PASSED' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
