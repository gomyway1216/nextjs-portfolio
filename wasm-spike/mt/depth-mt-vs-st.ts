/**
 * depth-mt-vs-st.ts — reached-depth comparison: Lazy SMP (main + N-1 helpers)
 * vs single-thread, at a fixed wall-clock budget, over midgame/endgame
 * snapshots. Quantifies "how many extra plies does the parallel search reach at
 * equal time" — the concrete benefit of Lazy SMP for seeing deeper tactics /
 * endgame mates.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/mt/depth-mt-vs-st.ts [--ms 2000] [--threads 4]
 */

import { GenerateMovesImproved } from '../../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../../src/components/game/ShogiImproved/KyokumenImproved';
import { MtWasmPlayer, loadNnueIntoWasm, loadShogiWasmMt, syncWasmMt } from './mtPlayer';

function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  if (i < 0) return def;
  const n = parseInt(process.argv[i + 1], 10);
  if (!Number.isFinite(n)) throw new Error(`${flag} requires a numeric value`);
  return n;
}

const MOVE_MS = argNum('--ms', 2000);
const THREADS = argNum('--threads', 4);
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

function buildPositions(): Array<{ label: string; phase: string; k: KyokumenImproved; tesu: number }> {
  const out: Array<{ label: string; phase: string; k: KyokumenImproved; tesu: number }> = [];
  const snapshots = [32, 44, 56, 68, 80];
  for (let game = 0; game < 4; game++) {
    const rnd = mulberry32(0xd39710 + game * 7919);
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
        const phase = tesu <= 44 ? 'midgame' : 'endgame';
        out.push({ label: `g${game}p${tesu}`, phase, k: k.clone(), tesu });
      }
    }
  }
  return out;
}

async function main(): Promise<void> {
  const positions = buildPositions();
  const st = loadShogiWasmMt(null, () => 0);
  loadNnueIntoWasm(st);
  const mt = new MtWasmPlayer('MT', THREADS, true);
  console.log(`=== reached depth: ST(1) vs MT(${THREADS}) @ ${MOVE_MS}ms, ${positions.length} positions ===\n`);

  let sumStDepth = 0;
  let sumMtDepth = 0;
  let endgameStDepth = 0;
  let endgameMtDepth = 0;
  let endgameN = 0;

  for (const pos of positions) {
    // Single-thread: cold TT for a fair per-position measurement.
    st.clearTT();
    syncWasmMt(st, pos.k);
    st.setRootTesu(pos.tesu);
    st.searchBestMove(MOVE_MS, 32, QMAX);
    const stDepth = st.getSearchDepth();

    // MT: cold shared + private TTs.
    mt.newGame();
    mt.searchKey(pos.k, pos.tesu, MOVE_MS, QMAX);
    const stats = await mt.collectStats();
    const mtDepth = stats.depth;

    sumStDepth += stDepth;
    sumMtDepth += mtDepth;
    if (pos.phase === 'endgame') {
      endgameStDepth += stDepth;
      endgameMtDepth += mtDepth;
      endgameN++;
    }
    console.log(`  ${pos.label} (${pos.phase}): ST d${stDepth}  MT d${mtDepth}  (+${mtDepth - stDepth})`);
  }

  const n = positions.length;
  console.log(
    `\nAVG reached depth: ST ${(sumStDepth / n).toFixed(2)}  MT ${(sumMtDepth / n).toFixed(2)}  ` +
      `(+${((sumMtDepth - sumStDepth) / n).toFixed(2)} plies)`
  );
  if (endgameN > 0) {
    console.log(
      `ENDGAME only (${endgameN}): ST ${(endgameStDepth / endgameN).toFixed(2)}  ` +
        `MT ${(endgameMtDepth / endgameN).toFixed(2)}  (+${((endgameMtDepth - endgameStDepth) / endgameN).toFixed(2)} plies)`
    );
  }
  await mt.close();
  process.exit(0);
}

void main();
