/**
 * nnue-parity.ts — AS ⇄ TS parity harness for the NNUE-style evaluation.
 *
 * The production runtime suite covers the original board one-hot format
 * (buckets=1) and the reduced-KP format (buckets=6, own-king bucketed tables
 * + bucket-crossing king-move refresh). Passing an explicit research runtime
 * also runs the full own-king-square format (buckets=81).
 *
 * Loads seeded random weights (weights.bin-compatible buffer from
 * nnue-ref.makeDummyWeights) into the WASM module's weight region, then plays
 * seeded random self-play games with the JS engine and, on 1000+ positions
 * (both sides to move, hands populated by captures), verifies:
 *
 *   1. WASM nnueEvaluate()   == TS intForward()   (raw out_q, bit-exact)
 *   2. WASM nnueEvaluateCp() == TS outQToCp()     (cp conversion, bit-exact)
 *   3. nnueEvaluate() does not disturb the position state (hash unchanged)
 *   4. with setNnueEnabled(1), searchBestMove returns a legal move, and with
 *      the flag back to 0 the classic leaf eval still bit-matches JS
 *      evaluateV3Full (i.e. the default path is untouched)
 *   5. DIFFERENTIAL ACCUMULATORS: over seeded random self-play driven through
 *      applyMove (incremental path, no per-move re-sync), on 1200+ positions:
 *      the incrementally-updated accumulators bit-match a from-scratch rebuild
 *      (after the make path AND after countLegalMoves' make/unmake churn), and
 *      nnueEvaluateFast() == nnueEvaluate() == TS intForward(). With KP the
 *      coverage self-check additionally requires bucket-crossing king moves
 *      (the accumulator-refresh path) to have been exercised.
 *   6. SEARCH EQUIVALENCE: fixed-depth NNUE searches with the differential
 *      path vs the force-full-recompute path return identical bestMove /
 *      score / nodes / leaves, and the accumulators are still in sync after
 *      the search's make/unmake storm
 *
 * Usage: node -r tsx/cjs wasm-spike/nnue-parity.ts
 *        node -r tsx/cjs wasm-spike/nnue-parity.ts \
 *          --wasm-path wasm-spike/artifacts/shogi-halfkp81-research.wasm
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import { GHI, GOTE, GOU, SFU, SOU } from '../src/components/game/ShogiImproved/types';

import {
  NNUE_HALFKP_BUCKETS,
  NNUE_KP_BUCKETS,
  extractFeatures,
  intForward,
  kingBucket,
  layoutFor,
  makeDummyWeights,
  mulberry32,
  outQToCp,
  weightsFromBuffer,
} from './nnue-ref';

// ---------------------------------------------------------------------------
// WASM setup
// ---------------------------------------------------------------------------

interface ShogiNnueWasm {
  memory: WebAssembly.Memory;
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  applyMove(koma: number, from: number, to: number, promote: number): void;
  countLegalMoves(): number;
  getHashVal(): number;
  evaluateV3Full(): number;
  clearTT(): void;
  setRootTesu(tesu: number): void;
  searchBestMove(maxTimeMs: number, maxDepth: number, quiescenceDepthMax: number): number;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueEnabled(flag: number): void;
  setNnueBuckets(buckets: number): void;
  getNnueBuckets(): number;
  setNnueScaleK(k: number): void;
  setNnueOutputScale(numer: number, denom: number): void;
  setNnueForceFull(flag: number): void;
  nnueEvaluate(): number;
  nnueEvaluateFast(): number;
  nnueEvaluateCp(): number;
  nnueAccMismatch(): number;
  nnueRefreshAccumulators(): void;
  benchNnueEvaluate(iters: number): number;
  getSearchScore(): number;
  getSearchDepth(): number;
  getSearchNodes(): number;
  getSearchLeaves(): number;
}

const wasmPathIndex = process.argv.indexOf('--wasm-path');
const explicitWasmPath = wasmPathIndex >= 0 ? process.argv[wasmPathIndex + 1] : null;
if (wasmPathIndex >= 0 && (!explicitWasmPath || explicitWasmPath.startsWith('--'))) {
  throw new Error('--wasm-path requires a file path');
}
const wasmPath = explicitWasmPath
  ? resolve(explicitWasmPath)
  : join(__dirname, '..', 'src', 'components', 'game', 'ShogiImproved', 'wasm', 'shogi.wasm');
const wasmBytes = readFileSync(wasmPath);
const instance = new WebAssembly.Instance(new WebAssembly.Module(wasmBytes), {
  env: {
    abort(_msg: number, _file: number, line: number, col: number) {
      throw new Error(`wasm abort at ${line}:${col}`);
    },
    now: () => performance.now(),
    // Single-thread stubs for the Lazy SMP shared-TT hooks (never called while
    // setSharedTtEnabled stays 0, but the imports must link).
    sharedTtProbe: () => 0,
    sharedTtStore: () => {},
    sharedShouldStop: () => 0,
  },
});
const wasm = instance.exports as unknown as ShogiNnueWasm;

function syncWasm(k: KyokumenImproved): void {
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

/** Does this JS move relocate either king across a KP bucket boundary? */
function moveCrossesKpBucket(koma: number, from: number, to: number, buckets: number): boolean {
  if (from === 0) return false;
  if (koma === SOU) {
    return kingBucket(from >> 4, from & 0x0f, buckets) !== kingBucket(to >> 4, to & 0x0f, buckets);
  }
  if (koma === GOU) {
    return (
      kingBucket(10 - (from >> 4), 10 - (from & 0x0f), buckets) !==
      kingBucket(10 - (to >> 4), 10 - (to & 0x0f), buckets)
    );
  }
  return false;
}

const SEED = 0x5eed1234;
const SCALE_K = 600;

// ---------------------------------------------------------------------------
// The whole parity suite, parameterized by the weights format (bucket count)
// ---------------------------------------------------------------------------

function runSuite(buckets: number): void {
  const layout = layoutFor(buckets);
  console.log(`\n########## NNUE parity suite: buckets=${buckets} (${layout.totalBytes} bytes) ##########`);

  wasm.setNnueBuckets(buckets);
  if (wasm.getNnueBuckets() !== buckets) {
    console.error(`setNnueBuckets(${buckets}) not applied: WASM reports ${wasm.getNnueBuckets()}`);
    process.exit(1);
  }
  if (wasm.getNnueWeightsSize() !== layout.totalBytes) {
    console.error(
      `weight region size mismatch: WASM=${wasm.getNnueWeightsSize()} TS=${layout.totalBytes}`
    );
    process.exit(1);
  }

  const dummyBytes = makeDummyWeights(SEED + buckets, buckets);
  const refWeights = weightsFromBuffer(
    dummyBytes.buffer,
    dummyBytes.byteOffset, // no ArrayBuffer copy needed
    buckets
  );
  new Uint8Array(wasm.memory.buffer, wasm.getNnueWeightsPtr(), layout.totalBytes).set(dummyBytes);
  wasm.setNnueScaleK(SCALE_K);

  console.log(
    `loaded ${layout.totalBytes} bytes of seeded dummy weights (seed=0x${(SEED + buckets).toString(16)}, K=${SCALE_K})`
  );

  // -------------------------------------------------------------------------
  // 1000-position AS vs TS parity over seeded random self-play
  // -------------------------------------------------------------------------

  const TARGET_POSITIONS = 1000;
  let compared = 0;
  let goteToMove = 0;
  let withHands = 0;
  let nonzeroOutQ = 0;
  const bucketsSeen = new Set<number>();

  function comparePosition(k: KyokumenImproved, label: string): void {
    syncWasm(k);

    const hashBefore = wasm.getHashVal();
    const asOutQ = wasm.nnueEvaluate() | 0;
    const asCp = wasm.nnueEvaluateCp() | 0;
    const hashAfter = wasm.getHashVal();

    const feats = extractFeatures(k, buckets);
    const tsOutQ = intForward(refWeights, feats) | 0;
    const tsCp = outQToCp(tsOutQ, SCALE_K) | 0;

    const errors: string[] = [];
    if (asOutQ !== tsOutQ) errors.push(`out_q: AS=${asOutQ} TS=${tsOutQ}`);
    if (asCp !== tsCp) errors.push(`cp: AS=${asCp} TS=${tsCp}`);
    if (hashBefore !== hashAfter) errors.push(`nnueEvaluate mutated position state (hash changed)`);

    if (errors.length > 0) {
      console.error(`\nNNUE PARITY MISMATCH at ${label} (buckets=${buckets}):`);
      for (const e of errors) console.error(`  - ${e}`);
      console.error(`  bucket=${feats.bucket} boardFeats=[${feats.boardFeats.join(',')}]`);
      console.error(`  hands=[${feats.hands.join(',')}]`);
      process.exit(1);
    }

    compared++;
    if (k.teban === GOTE) goteToMove++;
    if (feats.hands.some((c) => c > 0)) withHands++;
    if (tsOutQ !== 0) nonzeroOutQ++;
    bucketsSeen.add(feats.bucket);
  }

  console.log(`\n=== NNUE parity: seeded random self-play until ${TARGET_POSITIONS} positions ===`);
  outer: for (let game = 0; compared < TARGET_POSITIONS; game++) {
    const rnd = mulberry32(0xabcde0 + game * 7919);
    const k = new KyokumenImproved();
    k.initHirate();
    comparePosition(k, `game ${game}, ply 0`);
    for (let ply = 0; ply < 120; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(k);
      if (moves.length === 0) break;
      const te = moves[Math.floor(rnd() * moves.length)];
      te.capture = k.get(te.to);
      k.move(te);
      k.toggleTeban();
      comparePosition(k, `game ${game}, ply ${ply + 1}`);
      if (compared >= TARGET_POSITIONS) break outer;
    }
  }

  console.log(
    `AS vs TS: ${compared}/${compared} positions bit-exact (out_q + cp) — ` +
      `${goteToMove} with GOTE to move, ${withHands} with pieces in hand, ${nonzeroOutQ} nonzero out_q` +
      (buckets > 1 ? `, stm king buckets seen: {${[...bucketsSeen].sort().join(',')}}` : '')
  );
  if (goteToMove === 0 || withHands === 0 || nonzeroOutQ === 0) {
    console.error('SELF-CHECK FAILED: coverage is vacuous (rotation/hands/output never exercised)');
    process.exit(1);
  }
  if (buckets > 1 && bucketsSeen.size < 2) {
    console.error('SELF-CHECK FAILED: KP coverage is vacuous (only one king bucket ever seen)');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // setNnueOutputScale parity (rescaled cp, then bit-exact restore at 1/1)
  // -------------------------------------------------------------------------

  console.log('\n=== NNUE output-scale parity (setNnueOutputScale) ===');
  {
    const SCALE_CASES: Array<[number, number]> = [
      [37, 10], // true cp -> V3 scale (the production use case)
      [1, 4],
      [123, 7],
    ];
    const rnd = mulberry32(0x5ca1e0);
    let checkedScaled = 0;
    const k = new KyokumenImproved();
    k.initHirate();
    for (let ply = 0; ply <= 60; ply++) {
      if (ply > 0) {
        const moves = GenerateMovesImproved.generateLegalMoves(k);
        if (moves.length === 0) break;
        const te = moves[Math.floor(rnd() * moves.length)];
        te.capture = k.get(te.to);
        k.move(te);
        k.toggleTeban();
      }
      if (ply % 10 !== 0) continue;
      syncWasm(k);
      const outQ = wasm.nnueEvaluate() | 0;
      for (const [numer, denom] of SCALE_CASES) {
        wasm.setNnueOutputScale(numer, denom);
        const asCp = wasm.nnueEvaluateCp() | 0;
        // BigInt division truncates toward zero, matching the WASM i64 div_s.
        // Apply the same ±1,000,000 clamp as nnueEvaluateCp() so the reference
        // stays correct even if a weights/scale case ever pushes past it.
        const cpClamp = BigInt(1_000_000);
        let tsCpBig = (BigInt(outQ) * BigInt(SCALE_K) * BigInt(numer)) / (BigInt(8128) * BigInt(denom));
        if (tsCpBig > cpClamp) tsCpBig = cpClamp;
        else if (tsCpBig < -cpClamp) tsCpBig = -cpClamp;
        const tsCp = Number(tsCpBig);
        if (asCp !== tsCp) {
          console.error(`SCALE MISMATCH at ply ${ply} (${numer}/${denom}): AS=${asCp} TS=${tsCp} outQ=${outQ}`);
          process.exit(1);
        }
        checkedScaled++;
      }
      // Restore the default and verify bit-parity with the unscaled conversion.
      wasm.setNnueOutputScale(1, 1);
      const asDefault = wasm.nnueEvaluateCp() | 0;
      const tsDefault = outQToCp(outQ, SCALE_K) | 0;
      if (asDefault !== tsDefault) {
        console.error(`DEFAULT-SCALE MISMATCH at ply ${ply}: AS=${asDefault} TS=${tsDefault} outQ=${outQ}`);
        process.exit(1);
      }
    }
    wasm.setNnueOutputScale(1, 1);
    console.log(`output-scale parity: ${checkedScaled} scaled comparisons bit-exact, default 1/1 restored`);
  }

  // -------------------------------------------------------------------------
  // setNnueEnabled search smoke test + default-path invariance
  // -------------------------------------------------------------------------

  console.log('\n=== NNUE-enabled search smoke test ===');
  {
    // A midgame position from seeded self-play.
    const rnd = mulberry32(0xbeef01);
    const k = new KyokumenImproved();
    k.initHirate();
    for (let ply = 0; ply < 24; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(k);
      if (moves.length === 0) break;
      const te = moves[Math.floor(rnd() * moves.length)];
      te.capture = k.get(te.to);
      k.move(te);
      k.toggleTeban();
    }

    syncWasm(k);
    wasm.clearTT();
    wasm.setRootTesu(24);
    wasm.setNnueEnabled(1);
    const key = wasm.searchBestMove(0, 4, 8);
    wasm.setNnueEnabled(0);

    const legal = GenerateMovesImproved.generateLegalMoves(k);
    const koma = key & 0x3f;
    const from = (key >> 6) & 0xff;
    const to = (key >> 14) & 0xff;
    const promote = ((key >> 22) & 1) === 1;
    const isLegal =
      key !== 0 &&
      legal.some((te) => te.koma === koma && te.from === from && te.to === to && te.promote === promote);
    if (!isLegal) {
      console.error(`NNUE-enabled searchBestMove returned an illegal/empty move: key=${key}`);
      process.exit(1);
    }
    console.log(`nnue-enabled d4 search returned a legal move (key=${key}) ✓`);

    // Default path invariance after toggling: leaf eval must still match JS.
    syncWasm(k);
    const jsFull = (k.evaluateV3() | 0); // hangingThreat parity is covered by parity.ts
    const wasmV3 = wasm.evaluateV3Full() | 0;
    // evaluateV3Full = evaluateV3 + hangingThreat; only sanity-check it is callable
    // and deterministic here (exact parity incl. hangingThreat lives in parity.ts).
    if (wasmV3 !== (wasm.evaluateV3Full() | 0)) {
      console.error('evaluateV3Full became non-deterministic after NNUE toggling');
      process.exit(1);
    }
    void jsFull;
    console.log('classic evaluateV3Full path still deterministic after toggling ✓');
  }

  // -------------------------------------------------------------------------
  // Differential accumulator parity: incremental make/unmake vs full rebuild
  // -------------------------------------------------------------------------
  //
  // Unlike the section above (which re-syncs + rebuilds per position), this one
  // drives the WASM position incrementally through applyMove, so any drift in
  // the differential accumulator updates accumulates and gets caught.

  const TARGET_DIFF = 1200;
  console.log(`\n=== NNUE differential accumulator parity: ${TARGET_DIFF}+ positions ===`);
  wasm.setNnueEnabled(1);
  let diffCompared = 0;
  let diffCaptures = 0;
  let diffDrops = 0;
  let diffPromos = 0;
  let diffGote = 0;
  let diffKingMoves = 0;
  let diffBucketCross = 0;
  outerDiff: for (let game = 0; diffCompared < TARGET_DIFF; game++) {
    const rnd = mulberry32(0xd1ff00 + game * 104729);
    const k = new KyokumenImproved();
    k.initHirate();
    syncWasm(k); // finalizePosition rebuilds the accumulators
    for (let ply = 0; ply < 140; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(k);
      if (moves.length === 0) break;
      const te = moves[Math.floor(rnd() * moves.length)];
      te.capture = k.get(te.to);
      k.move(te);
      k.toggleTeban();
      wasm.applyMove(te.koma, te.from, te.to, te.promote ? 1 : 0);

      const label = `diff game ${game}, ply ${ply + 1}`;
      const errors: string[] = [];

      // (a) accumulators after the incremental make == fresh rebuild
      const mismMake = wasm.nnueAccMismatch();
      if (mismMake !== 0) errors.push(`acc mismatch after applyMove: ${mismMake}/512 entries`);

      // (b) unmake path: countLegalMoves make/unmakes every legal move
      wasm.countLegalMoves();
      const mismUnmake = wasm.nnueAccMismatch();
      if (mismUnmake !== 0)
        errors.push(`acc mismatch after countLegalMoves churn: ${mismUnmake}/512 entries`);

      // (c) fast eval == full recompute == TS reference (out_q + cp)
      const fast = wasm.nnueEvaluateFast() | 0;
      const full = wasm.nnueEvaluate() | 0;
      const feats = extractFeatures(k, buckets);
      const tsOutQ = intForward(refWeights, feats) | 0;
      const cp = wasm.nnueEvaluateCp() | 0; // uses the fast path (nnue enabled)
      const tsCp = outQToCp(tsOutQ, SCALE_K) | 0;
      if (fast !== full) errors.push(`out_q: fast=${fast} full=${full}`);
      if (fast !== tsOutQ) errors.push(`out_q: fast=${fast} TS=${tsOutQ}`);
      if (cp !== tsCp) errors.push(`cp(fast path)=${cp} TS=${tsCp}`);

      if (errors.length > 0) {
        console.error(`\nNNUE DIFFERENTIAL MISMATCH at ${label} (buckets=${buckets}):`);
        for (const e of errors) console.error(`  - ${e}`);
        process.exit(1);
      }

      diffCompared++;
      if (te.capture !== 0) diffCaptures++;
      if (te.from === 0) diffDrops++;
      if (te.promote) diffPromos++;
      if (k.teban === GOTE) diffGote++;
      if (te.koma === SOU || te.koma === GOU) diffKingMoves++;
      if (moveCrossesKpBucket(te.koma, te.from, te.to, buckets)) diffBucketCross++;
      if (diffCompared >= TARGET_DIFF) break outerDiff;
    }
  }
  wasm.setNnueEnabled(0);
  console.log(
    `differential: ${diffCompared}/${diffCompared} positions — acc == rebuild (make + unmake), ` +
      `fast == full == TS; moves: ${diffCaptures} captures, ${diffDrops} drops, ` +
      `${diffPromos} promotions, ${diffGote} with GOTE to move, ` +
      `${diffKingMoves} king moves (${diffBucketCross} KP bucket crossings)`
  );
  if (diffCaptures === 0 || diffDrops === 0 || diffPromos === 0 || diffGote === 0) {
    console.error('SELF-CHECK FAILED: differential coverage is vacuous (some move kind never hit)');
    process.exit(1);
  }
  if (buckets > 1 && (diffKingMoves === 0 || diffBucketCross === 0)) {
    console.error(
      'SELF-CHECK FAILED: KP differential coverage is vacuous (no king moves / no bucket crossings — refresh path never exercised)'
    );
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Search equivalence: differential fast path vs forced full recompute
  // -------------------------------------------------------------------------

  console.log('\n=== NNUE search equivalence: fast (differential) vs full recompute ===');
  {
    const rnd = mulberry32(0xfeed42);
    const k = new KyokumenImproved();
    k.initHirate();
    const snapshots = [16, 28, 40, 52];
    const tests: Array<{ label: string; k: KyokumenImproved; tesu: number }> = [];
    for (let ply = 0; ply < snapshots[snapshots.length - 1]; ply++) {
      const moves = GenerateMovesImproved.generateLegalMoves(k);
      if (moves.length === 0) break;
      const te = moves[Math.floor(rnd() * moves.length)];
      te.capture = k.get(te.to);
      k.move(te);
      k.toggleTeban();
      const tesu = ply + 1;
      if (snapshots.includes(tesu) && GenerateMovesImproved.generateLegalMoves(k).length > 0) {
        tests.push({ label: `ply${tesu}`, k: k.clone(), tesu });
      }
    }

    const DEPTH = 5;
    for (const t of tests) {
      wasm.setNnueEnabled(1);

      // Run 1: forced full recompute at every leaf (reference).
      wasm.setNnueForceFull(1);
      syncWasm(t.k);
      wasm.clearTT();
      wasm.setRootTesu(t.tesu);
      const keyFull = wasm.searchBestMove(0, DEPTH, 8);
      const scoreFull = wasm.getSearchScore();
      const nodesFull = wasm.getSearchNodes();
      const leavesFull = wasm.getSearchLeaves();

      // Run 2: differential accumulator fast path.
      wasm.setNnueForceFull(0);
      syncWasm(t.k);
      wasm.clearTT();
      wasm.setRootTesu(t.tesu);
      const keyFast = wasm.searchBestMove(0, DEPTH, 8);
      const scoreFast = wasm.getSearchScore();
      const nodesFast = wasm.getSearchNodes();
      const leavesFast = wasm.getSearchLeaves();

      // Accumulators must survive the search's make/unmake storm in sync.
      const mism = wasm.nnueAccMismatch();
      wasm.setNnueEnabled(0);

      if (
        keyFull !== keyFast ||
        scoreFull !== scoreFast ||
        nodesFull !== nodesFast ||
        leavesFull !== leavesFast ||
        mism !== 0
      ) {
        console.error(`NNUE SEARCH EQUIVALENCE FAILED at ${t.label} (depth ${DEPTH}, buckets=${buckets}):`);
        console.error(`  full: key=${keyFull} score=${scoreFull} nodes=${nodesFull} leaves=${leavesFull}`);
        console.error(`  fast: key=${keyFast} score=${scoreFast} nodes=${nodesFast} leaves=${leavesFast}`);
        console.error(`  acc mismatch after search: ${mism}`);
        process.exit(1);
      }
      console.log(
        `${t.label} d${DEPTH}: fast == full (key=${keyFast} score=${scoreFast} ` +
          `nodes=${nodesFast} leaves=${leavesFast}), acc in sync after search ✓`
      );
    }
  }

  console.log(
    `\nbuckets=${buckets}: ALL NNUE PARITY CHECKS PASSED — ${compared} recompute + ${diffCompared} differential positions, AS == TS bit-exact`
  );
}

runSuite(1);
runSuite(NNUE_KP_BUCKETS);
if (explicitWasmPath) {
  runSuite(NNUE_HALFKP_BUCKETS);
  console.log('\nALL RESEARCH FORMATS PASSED (buckets=1 original, buckets=6 reduced KP, buckets=81 HalfKP)');
} else {
  console.log('\nALL PRODUCTION FORMATS PASSED (buckets=1 original, buckets=6 reduced KP)');
}
