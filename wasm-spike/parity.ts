/**
 * parity.ts — JS ⇄ WASM parity harness for the shogi engine port (phases 1+2).
 *
 * Verifies, over thousands of positions, that the AssemblyScript engine
 * (wasm-spike/assembly/index.ts) matches the JS engine exactly on:
 *
 *   1. legal move count  — GenerateMovesImproved.generateLegalMoves(k).length
 *                          vs WASM countLegalMoves() (incl. uchifuzume rule)
 *   2. Zobrist hashes    — BanHash / HandHash / HashVal (teban included),
 *                          BIT-identical, both from-scratch (calcHash vs
 *                          finalizePosition) and incrementally (move()/back()
 *                          vs makeMove/applyMove)
 *   3. incremental material eval — k.eval vs getEvalMaterial()
 *   4. incremental PSQT eval — k.psqtEval vs getPsqtEval(), both maintained
 *                          incrementally through move()/back() vs makeMove
 *   5. evaluateV3        — k.evaluateV3() vs WASM evaluateV3(), INTEGER-exact
 *                          (incl. phase buckets, scaleEvalV3 fixed-point
 *                          rounding, and the f64 Math.round in king safety)
 *   6. hanging threat    — reference JS re-implementation of
 *                          ShogiAIImprovedV20.hangingThreatSente (which is
 *                          private) vs WASM hangingThreat(), plus
 *                          evaluateV3Full() == evaluateV3() + hangingThreat()
 *
 * Position sources:
 *   - 50 seeded random self-play games from hirate (max 80 plies each),
 *     moves picked uniformly from the JS legal move list
 *   - hand-crafted endgame-ish positions with pawns in hand, including
 *     positions where a pawn drop IS uchifuzume (must be excluded) and
 *     near-identical ones where it is NOT (must be included)
 *   - random self-play continuations from those custom positions
 *
 * Any mismatch dumps the position and exits non-zero.
 *
 * Usage: node -r tsx/cjs wasm-spike/parity.ts
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GenerateMovesImproved } from '../src/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '../src/components/game/ShogiImproved/KyokumenImproved';
import {
  EMPTY,
  FU,
  GFU,
  GHI,
  GKI,
  GOTE,
  GOU,
  GRY,
  OU,
  SENTE,
  SFU,
  SGI,
  SHI,
  SKI,
  SOU,
  SRY,
  Te,
  getKomashu,
  isSelf,
  komaValue,
  toBanString,
} from '../src/components/game/ShogiImproved/types';

// ---------------------------------------------------------------------------
// WASM setup (synchronous instantiation so this file works under tsx/cjs)
// ---------------------------------------------------------------------------

interface ShogiWasm {
  clearBoard(): void;
  setSquare(pos: number, koma: number): void;
  setHand(koma: number, count: number): void;
  setSideToMove(teban: number): void;
  finalizePosition(): void;
  initHirate(): void;
  perft(depth: number): number;
  countLegalMoves(): number;
  applyMove(koma: number, from: number, to: number, promote: number): void;
  getEvalMaterial(): number;
  getPsqtEval(): number;
  evaluateV3(): number;
  hangingThreat(): number;
  evaluateV3Full(): number;
  benchEvaluateV3(iters: number): number;
  benchEvaluateV3Full(iters: number): number;
  getHash(): number;
  getBanHash(): number;
  getHandHash(): number;
  getHashVal(): number;
  getTeban(): number;
}

const wasmBytes = readFileSync(join(__dirname, 'build', 'shogi.wasm'));
const wasmModule = new WebAssembly.Module(wasmBytes);
const instance = new WebAssembly.Instance(wasmModule, {
  env: {
    abort(_msg: number, _file: number, line: number, col: number) {
      throw new Error(`wasm abort at ${line}:${col}`);
    },
    now: () => performance.now(),
  },
});
const wasm = instance.exports as unknown as ShogiWasm;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seeded deterministic RNG (Mulberry32) for reproducible self-play. */
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
 * Reference re-implementation of ShogiAIImprovedV20.hangingThreatSente (which
 * is private on the engine class), line-for-line, using the same public
 * GenerateMovesImproved.getLeastAttackerValue helper. Charges each side ~1/3 of
 * its single most valuable hanging piece (silver and up, attacked AND
 * undefended, loss capped at 700). SENTE-positive.
 */
function jsHangingThreatSente(k: KyokumenImproved): number {
  let worstSente = 0;
  let worstGote = 0;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      const p = k.get(pos);
      if (p === EMPTY) continue;
      const type = getKomashu(p);
      if (type === OU) continue;
      const value = Math.abs(komaValue[p]) | 0;
      if (value < 1000) continue; // only silver and up

      const side = isSelf(SENTE, p) ? SENTE : GOTE;
      const attacker = GenerateMovesImproved.getLeastAttackerValue(k, pos, side);
      if (!Number.isFinite(attacker)) continue;

      const defender = GenerateMovesImproved.getLeastAttackerValue(k, pos, side === SENTE ? GOTE : SENTE);
      if (Number.isFinite(defender)) continue;
      const loss = Math.min(value, 700);

      if (side === SENTE) {
        if (loss > worstSente) worstSente = loss;
      } else if (loss > worstGote) {
        worstGote = loss;
      }
    }
  }
  return ((worstGote - worstSente) / 3) | 0;
}

/** Copy the full JS position into the WASM engine (from-scratch sync). */
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

function dumpPosition(k: KyokumenImproved, label: string): void {
  console.error(`\n--- position dump (${label}) ---`);
  console.error(`teban: ${k.teban === SENTE ? 'SENTE' : 'GOTE'}`);
  for (let dan = 1; dan <= 9; dan++) {
    let row = '';
    for (let suji = 9; suji >= 1; suji--) {
      row += toBanString(k.ban[(suji << 4) + dan]).padEnd(3);
    }
    console.error(`${dan}: ${row}`);
  }
  const hands: string[] = [];
  for (let koma = SFU; koma <= GHI; koma++) {
    if (k.hand[koma] > 0) hands.push(`hand[${koma}]=${k.hand[koma]}`);
  }
  console.error(`hands: ${hands.length > 0 ? hands.join(' ') : '(none)'}`);
  console.error(
    `JS   BanHash=${k.BanHash} HandHash=${k.HandHash} HashVal=${k.HashVal} eval=${k.eval} ` +
      `psqt=${k.psqtEval} v3=${k.evaluateV3()} hang=${jsHangingThreatSente(k)}`
  );
  console.error(
    `WASM BanHash=${wasm.getBanHash()} HandHash=${wasm.getHandHash()} ` +
      `HashVal=${wasm.getHashVal()} eval=${wasm.getEvalMaterial()} ` +
      `psqt=${wasm.getPsqtEval()} v3=${wasm.evaluateV3()} hang=${wasm.hangingThreat()}`
  );
}

let comparedPositions = 0;
let nonzeroHangingThreat = 0; // guard against the hangingThreat check being vacuous

/** Compare JS vs WASM on the current (already synced) position. */
function comparePosition(k: KyokumenImproved, label: string): Te[] {
  const jsMoves = GenerateMovesImproved.generateLegalMoves(k);
  const wasmCount = wasm.countLegalMoves();

  const errors: string[] = [];
  if (jsMoves.length !== wasmCount) {
    errors.push(`legal move count: JS=${jsMoves.length} WASM=${wasmCount}`);
  }
  if (k.BanHash !== wasm.getBanHash()) {
    errors.push(`BanHash: JS=${k.BanHash} WASM=${wasm.getBanHash()}`);
  }
  if (k.HandHash !== wasm.getHandHash()) {
    errors.push(`HandHash: JS=${k.HandHash} WASM=${wasm.getHandHash()}`);
  }
  if (k.HashVal !== wasm.getHashVal()) {
    errors.push(`HashVal: JS=${k.HashVal} WASM=${wasm.getHashVal()}`);
  }
  if (k.eval !== wasm.getEvalMaterial()) {
    errors.push(`material eval: JS=${k.eval} WASM=${wasm.getEvalMaterial()}`);
  }
  if (k.teban !== wasm.getTeban()) {
    errors.push(`teban: JS=${k.teban} WASM=${wasm.getTeban()}`);
  }

  // Phase 2: evaluation parity (integer-exact).
  if (k.psqtEval !== wasm.getPsqtEval()) {
    errors.push(`psqtEval (incremental): JS=${k.psqtEval} WASM=${wasm.getPsqtEval()}`);
  }
  const jsV3 = k.evaluateV3() | 0;
  const wasmV3 = wasm.evaluateV3() | 0;
  if (jsV3 !== wasmV3) {
    errors.push(`evaluateV3: JS=${jsV3} WASM=${wasmV3}`);
  }
  const jsHang = jsHangingThreatSente(k) | 0;
  const wasmHang = wasm.hangingThreat() | 0;
  if (jsHang !== wasmHang) {
    errors.push(`hangingThreat: JS=${jsHang} WASM=${wasmHang}`);
  }
  if (jsHang !== 0) nonzeroHangingThreat++;
  const jsV3Full = (jsV3 + jsHang) | 0;
  const wasmV3Full = wasm.evaluateV3Full() | 0;
  if (jsV3Full !== wasmV3Full) {
    errors.push(`evaluateV3Full: JS=${jsV3Full} WASM=${wasmV3Full}`);
  }

  if (errors.length > 0) {
    console.error(`\nPARITY MISMATCH at ${label}:`);
    for (const e of errors) console.error(`  - ${e}`);
    dumpPosition(k, label);
    process.exit(1);
  }

  comparedPositions++;
  return jsMoves;
}

/**
 * Play a seeded random self-play continuation, comparing every position.
 * JS plays incrementally (move + toggleTeban); WASM plays incrementally too
 * (applyMove), so this exercises the incremental hash updates on both sides.
 */
function randomPlayout(
  k: KyokumenImproved,
  rnd: () => number,
  maxPlies: number,
  label: string
): void {
  syncWasm(k);
  for (let ply = 0; ply < maxPlies; ply++) {
    const jsMoves = comparePosition(k, `${label}, ply ${ply}`);
    if (jsMoves.length === 0) break; // mate / stalemate

    const te = jsMoves[Math.floor(rnd() * jsMoves.length)];
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
    wasm.applyMove(te.koma, te.from, te.to, te.promote ? 1 : 0);
  }
  // Final position after the last move is also compared.
  comparePosition(k, `${label}, final`);
}

// ---------------------------------------------------------------------------
// 1) Random self-play games from hirate
// ---------------------------------------------------------------------------

const GAMES = 50;
const MAX_PLIES = 80;

console.log(`=== parity: ${GAMES} seeded random games from hirate (max ${MAX_PLIES} plies) ===`);
for (let game = 0; game < GAMES; game++) {
  const rnd = mulberry32(0xc0ffee + game * 9973);
  const k = new KyokumenImproved();
  k.initHirate();
  randomPlayout(k, rnd, MAX_PLIES, `game ${game}`);
}
console.log(`hirate self-play OK (${comparedPositions} positions so far)`);

// ---------------------------------------------------------------------------
// 2) Custom endgame-ish positions (uchifuzume coverage)
// ---------------------------------------------------------------------------

interface CustomPosition {
  name: string;
  teban: number;
  board: Array<[number, number]>; // [pos, koma]
  hands: Array<[number, number]>; // [koma, count]
  /** If set, this pawn drop square must be ABSENT from the legal moves (uchifuzume). */
  uchifuzumeSquare?: number;
  /** If set, this pawn drop square must be PRESENT in the legal moves (mere check, escapable). */
  legalPawnCheckSquare?: number;
}

// Board coordinates: pos = (suji << 4) + dan.
const customPositions: CustomPosition[] = [
  {
    // Sente: Fu*13 is mate (pawn protected by KI@24, escapes covered by RY@31)
    // → uchifuzume, the drop must NOT be generated.
    name: 'uchifuzume-sente (Fu*13 is pawn-drop-mate)',
    teban: SENTE,
    board: [
      [0x12, GOU],
      [0x31, SRY],
      [0x24, SKI],
      [0x99, SOU],
    ],
    hands: [[SFU, 2]],
    uchifuzumeSquare: 0x13,
  },
  {
    // Same shape but RY on 41 no longer covers 22 → the king escapes, the pawn
    // drop is a plain check and must be generated.
    name: 'legal-pawn-check-sente (Fu*13 escapable)',
    teban: SENTE,
    board: [
      [0x12, GOU],
      [0x41, SRY],
      [0x24, SKI],
      [0x99, SOU],
    ],
    hands: [[SFU, 2]],
    legalPawnCheckSquare: 0x13,
  },
  {
    // Mirror of the first position: GOTE drops Fu*17 for pawn-drop-mate.
    name: 'uchifuzume-gote (Fu*17 is pawn-drop-mate)',
    teban: GOTE,
    board: [
      [0x18, SOU],
      [0x39, GRY],
      [0x26, GKI],
      [0x91, GOU],
    ],
    hands: [[GFU, 2]],
    uchifuzumeSquare: 0x17,
  },
  {
    // Endgame-ish middle position: both sides hold pawns (and more), promoted
    // pieces on the board — exercises hand-hash counts > 1 and promoted-piece
    // board hashes.
    name: 'endgame-hands (multi-pawn hands, promoted pieces)',
    teban: SENTE,
    board: [
      [0x12, GOU],
      [0x22, GKI],
      [0x33, GFU],
      [0x25, SRY],
      [0x57, SFU],
      [0x88, SKI],
      [0x89, SOU],
      [0x79, SGI],
    ],
    hands: [
      [SFU, 3],
      [SKI, 1],
      [GFU, 2],
      [GKI, 1],
      [GHI, 1],
    ],
  },
  {
    // Drops position from the perft bench (hirate minus 2 pawns, 4 hand pieces).
    name: 'bench-drops position',
    teban: SENTE,
    board: [], // filled from hirate below
    hands: [
      [SFU, 1],
      [SGI, 1],
      [GFU, 1],
      [GKI, 1],
    ],
  },
];

function buildCustom(cp: CustomPosition): KyokumenImproved {
  const k = new KyokumenImproved();
  if (cp.name === 'bench-drops position') {
    k.initHirate();
    k.ban[0x77] = EMPTY;
    k.ban[0x33] = EMPTY;
  } else {
    // Board starts empty (constructor clears playable squares).
    for (const [pos, koma] of cp.board) k.ban[pos] = koma;
  }
  for (const [koma, count] of cp.hands) k.hand[koma] = count;
  k.teban = cp.teban;
  k.initAll();
  return k;
}

console.log(`\n=== parity: ${customPositions.length} custom positions (uchifuzume coverage) ===`);
for (const cp of customPositions) {
  const k = buildCustom(cp);
  syncWasm(k);
  const jsMoves = comparePosition(k, cp.name);

  // Self-checks that the uchifuzume scenarios actually trigger in the JS engine
  // (so the parity assertion above is meaningful, not vacuous).
  const hasPawnDropTo = (to: number): boolean =>
    jsMoves.some((te) => te.from === 0 && te.to === to && getKomashu(te.koma) === FU);

  if (cp.uchifuzumeSquare !== undefined) {
    if (hasPawnDropTo(cp.uchifuzumeSquare)) {
      console.error(`SELF-CHECK FAILED: ${cp.name}: JS did NOT flag Fu*${cp.uchifuzumeSquare.toString(16)} as uchifuzume`);
      dumpPosition(k, cp.name);
      process.exit(1);
    }
    console.log(`  ${cp.name}: uchifuzume correctly excluded on both sides (moves=${jsMoves.length})`);
  } else if (cp.legalPawnCheckSquare !== undefined) {
    if (!hasPawnDropTo(cp.legalPawnCheckSquare)) {
      console.error(`SELF-CHECK FAILED: ${cp.name}: JS unexpectedly excluded Fu*${cp.legalPawnCheckSquare.toString(16)}`);
      dumpPosition(k, cp.name);
      process.exit(1);
    }
    console.log(`  ${cp.name}: escapable pawn-drop check correctly kept on both sides (moves=${jsMoves.length})`);
  } else {
    console.log(`  ${cp.name}: OK (moves=${jsMoves.length})`);
  }

  // Random continuation from each custom position (incremental-path coverage
  // in sharp king-attack territory where pawn drops near the king are common).
  const rnd = mulberry32(0xdead + cp.name.length * 131);
  const k2 = buildCustom(cp);
  randomPlayout(k2, rnd, 40, `${cp.name} playout`);
}

// ---------------------------------------------------------------------------
// 3) perft cross-check on hirate + bench-drops (JS lazy path vs WASM)
// ---------------------------------------------------------------------------

console.log('\n=== parity: perft cross-check (JS vs WASM) ===');

function jsPerft(k: KyokumenImproved, depth: number): number {
  if (depth <= 0) return 1;
  const moves = GenerateMovesImproved.generateLegalMoves(k);
  if (depth === 1) return moves.length;
  let count = 0;
  for (const te of moves) {
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
    count += jsPerft(k, depth - 1);
    k.toggleTeban();
    k.back(te);
  }
  return count;
}

const perftCases: Array<{ name: string; build: () => KyokumenImproved; depths: number[] }> = [
  {
    name: 'hirate',
    build: () => {
      const k = new KyokumenImproved();
      k.initHirate();
      return k;
    },
    depths: [1, 2, 3],
  },
  {
    name: 'bench-drops',
    build: () => buildCustom(customPositions[customPositions.length - 1]),
    depths: [1, 2, 3],
  },
  {
    name: 'uchifuzume-sente',
    build: () => buildCustom(customPositions[0]),
    depths: [1, 2, 3],
  },
];

const expected: Record<string, Record<number, number>> = {
  hirate: { 1: 30, 2: 900, 3: 25440 },
  'bench-drops': { 1: 85, 2: 6815, 3: 418334 },
};

for (const pc of perftCases) {
  for (const depth of pc.depths) {
    const k = pc.build();
    const js = jsPerft(k, depth);

    const kw = pc.build();
    syncWasm(kw);
    const hashBefore = wasm.getHashVal();
    const w = wasm.perft(depth);
    const hashAfter = wasm.getHashVal();

    const exp = expected[pc.name]?.[depth];
    const expStr = exp !== undefined ? ` (expected ${exp})` : '';
    if (js !== w || (exp !== undefined && js !== exp)) {
      console.error(`PERFT MISMATCH: ${pc.name} d${depth}: JS=${js} WASM=${w}${expStr}`);
      process.exit(1);
    }
    if (hashBefore !== hashAfter) {
      console.error(`WASM make/unmake hash asymmetry: ${pc.name} d${depth}`);
      process.exit(1);
    }
    console.log(`  ${pc.name} d${depth}: ${js}${expStr} ✓`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

if (nonzeroHangingThreat === 0) {
  console.error('SELF-CHECK FAILED: hangingThreat was 0 on every position (vacuous parity check)');
  process.exit(1);
}

console.log(`\nALL PARITY CHECKS PASSED — ${comparedPositions} positions compared, 100% match`);
console.log('(legal move counts, BanHash/HandHash/HashVal bit-identity, material eval, teban,');
console.log(' incremental psqtEval, evaluateV3, hangingThreat, evaluateV3Full — integer-exact)');
console.log(`(hangingThreat was nonzero on ${nonzeroHangingThreat}/${comparedPositions} positions — not vacuous)`);
