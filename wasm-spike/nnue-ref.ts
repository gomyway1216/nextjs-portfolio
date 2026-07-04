/**
 * nnue-ref.ts — TypeScript reference implementation of the NNUE-style
 * quantized inference (ml/export-weights.py int_forward), used to verify the
 * AssemblyScript port (assembly/index.ts nnueEvaluate) bit-for-bit without
 * needing PyTorch.
 *
 * Everything here mirrors the Python side exactly:
 *   - feature extraction  == ml/train.py parse_sfen (side-to-move normalized:
 *     board rotated 180° + colors swapped when GOTE is to move)
 *   - integer forward     == ml/export-weights.py int_forward (i32 accumulate,
 *     clamp 0..127, `>> 6` arithmetic shift, out_q = w3 @ h2 + b3)
 *   - weights.bin layout  == ml/export-weights.py (int16/int32 LE, flat)
 *
 * All arithmetic is coerced with `| 0` so it is exact i32, matching both the
 * AssemblyScript implementation and torch's int32 tensors.
 */

import {
  EMPTY,
  FU,
  GOTE,
  HI,
  SENTE,
} from '../src/components/game/ShogiImproved/types';

// ---------------------------------------------------------------------------
// weights.bin layout (element counts / byte offsets)
// ---------------------------------------------------------------------------

export const NNUE_H1 = 256;
export const NNUE_H2 = 32;
export const NNUE_BOARD_FEATS = 28 * 81; // 2268
export const NNUE_HAND_FEATS = 14;

export const NNUE_LAYOUT = (() => {
  const w1BoardBytes = NNUE_BOARD_FEATS * NNUE_H1 * 2;
  const w1HandBytes = NNUE_HAND_FEATS * NNUE_H1 * 2;
  const b1Bytes = NNUE_H1 * 4;
  const w2Bytes = NNUE_H2 * NNUE_H1 * 2;
  const b2Bytes = NNUE_H2 * 4;
  const w3Bytes = NNUE_H2 * 2;
  const b3Bytes = 4;
  const w1BoardOff = 0;
  const w1HandOff = w1BoardOff + w1BoardBytes;
  const b1Off = w1HandOff + w1HandBytes;
  const w2Off = b1Off + b1Bytes;
  const b2Off = w2Off + w2Bytes;
  const w3Off = b2Off + b2Bytes;
  const b3Off = w3Off + w3Bytes;
  return {
    w1BoardOff,
    w1HandOff,
    b1Off,
    w2Off,
    b2Off,
    w3Off,
    b3Off,
    totalBytes: b3Off + b3Bytes, // 1,185,988
  };
})();

export interface NnueWeights {
  w1Board: Int16Array; // (2268, 256) feature-major
  w1Hand: Int16Array; // (14, 256) feature-major
  b1: Int32Array; // (256,)
  w2: Int16Array; // (32, 256) row-major
  b2: Int32Array; // (32,)
  w3: Int16Array; // (32,)
  b3: Int32Array; // (1,)
}

/** View a weights.bin-compatible buffer as typed arrays (no copy). */
export function weightsFromBuffer(buf: ArrayBufferLike, byteOffset = 0): NnueWeights {
  const L = NNUE_LAYOUT;
  return {
    w1Board: new Int16Array(buf, byteOffset + L.w1BoardOff, NNUE_BOARD_FEATS * NNUE_H1),
    w1Hand: new Int16Array(buf, byteOffset + L.w1HandOff, NNUE_HAND_FEATS * NNUE_H1),
    b1: new Int32Array(buf, byteOffset + L.b1Off, NNUE_H1),
    w2: new Int16Array(buf, byteOffset + L.w2Off, NNUE_H2 * NNUE_H1),
    b2: new Int32Array(buf, byteOffset + L.b2Off, NNUE_H2),
    w3: new Int16Array(buf, byteOffset + L.w3Off, NNUE_H2),
    b3: new Int32Array(buf, byteOffset + L.b3Off, 1),
  };
}

/** Seeded deterministic RNG (Mulberry32), same as the other harnesses. */
export function mulberry32(seed: number): () => number {
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
 * Generate a weights.bin-compatible buffer filled with seeded random weights
 * in realistic quantized ranges (no i32 overflow anywhere in the pipeline).
 */
export function makeDummyWeights(seed: number): Uint8Array {
  const bytes = new Uint8Array(NNUE_LAYOUT.totalBytes);
  const w = weightsFromBuffer(bytes.buffer);
  const rnd = mulberry32(seed);
  const ri = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));
  for (let i = 0; i < w.w1Board.length; i++) w.w1Board[i] = ri(-300, 300);
  for (let i = 0; i < w.w1Hand.length; i++) w.w1Hand[i] = ri(-300, 300);
  for (let i = 0; i < w.b1.length; i++) w.b1[i] = ri(-5000, 5000);
  for (let i = 0; i < w.w2.length; i++) w.w2[i] = ri(-127, 127);
  for (let i = 0; i < w.b2.length; i++) w.b2[i] = ri(-30000, 30000);
  for (let i = 0; i < w.w3.length; i++) w.w3[i] = ri(-500, 500);
  w.b3[0] = ri(-60000, 60000);
  return bytes;
}

// ---------------------------------------------------------------------------
// Feature extraction (== ml/train.py parse_sfen, from the engine board rep)
// ---------------------------------------------------------------------------

/** Minimal position shape (KyokumenImproved satisfies this structurally). */
export interface NnuePosition {
  ban: ArrayLike<number>; // indexed by (suji << 4) + dan
  hand: ArrayLike<number>; // indexed by koma (side | type)
  teban: number; // SENTE or GOTE
}

// Engine komashu (koma & 0x0f) -> train.py piece kind (0..13).
const NNUE_KIND = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, -1, 12, 13];

export interface NnueFeatures {
  boardFeats: number[]; // active one-hot indices (0..2267), stm-normalized
  hands: number[]; // 14 counts: mine 0..6, opponent 7..13 (FU..HI order)
}

export function extractFeatures(pos: NnuePosition): NnueFeatures {
  const boardFeats: number[] = [];
  const stmSente = pos.teban === SENTE;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const koma = pos.ban[(suji << 4) + dan];
      if (koma === EMPTY) continue;
      const kind = NNUE_KIND[koma & 0x0f];
      const isBlack = (koma & SENTE) !== 0;
      let mine: boolean;
      let s: number;
      let d: number;
      if (stmSente) {
        mine = isBlack;
        s = suji;
        d = dan;
      } else {
        mine = !isBlack;
        s = 10 - suji;
        d = 10 - dan;
      }
      const plane = mine ? kind : kind + 14;
      boardFeats.push(plane * 81 + (s - 1) * 9 + (d - 1));
    }
  }

  const hands = new Array<number>(NNUE_HAND_FEATS).fill(0);
  const mySide = pos.teban;
  const oppSide = pos.teban === SENTE ? GOTE : SENTE;
  for (let type = FU; type <= HI; type++) {
    hands[type - 1] = pos.hand[mySide | type] | 0;
    hands[type - 1 + 7] = pos.hand[oppSide | type] | 0;
  }
  return { boardFeats, hands };
}

// ---------------------------------------------------------------------------
// Integer forward pass (== ml/export-weights.py int_forward)
// ---------------------------------------------------------------------------

/** out_q = quantized network output (side-to-move perspective), exact i32. */
export function intForward(w: NnueWeights, feats: NnueFeatures): number {
  // Layer 1: acc = b1 + Σ w1_board[f] + Σ w1_hand[i] * count[i]
  const acc = new Int32Array(NNUE_H1);
  acc.set(w.b1);
  for (const f of feats.boardFeats) {
    const base = f * NNUE_H1;
    for (let j = 0; j < NNUE_H1; j++) {
      acc[j] = (acc[j] + w.w1Board[base + j]) | 0;
    }
  }
  for (let i = 0; i < NNUE_HAND_FEATS; i++) {
    const c = feats.hands[i] | 0;
    if (c === 0) continue;
    const base = i * NNUE_H1;
    for (let j = 0; j < NNUE_H1; j++) {
      acc[j] = (acc[j] + w.w1Hand[base + j] * c) | 0;
    }
  }
  // h1 = clamp(acc, 0, 127)
  for (let j = 0; j < NNUE_H1; j++) {
    if (acc[j] < 0) acc[j] = 0;
    else if (acc[j] > 127) acc[j] = 127;
  }

  // Layer 2 + 3: h2 = clamp((w2 @ h1 + b2) >> 6, 0, 127); out = w3 @ h2 + b3
  let outQ = w.b3[0] | 0;
  for (let i = 0; i < NNUE_H2; i++) {
    let a2 = w.b2[i] | 0;
    const rowBase = i * NNUE_H1;
    for (let j = 0; j < NNUE_H1; j++) {
      a2 = (a2 + w.w2[rowBase + j] * acc[j]) | 0;
    }
    let h2 = a2 >> 6; // arithmetic shift, same as torch/AS
    if (h2 < 0) h2 = 0;
    else if (h2 > 127) h2 = 127;
    outQ = (outQ + w.w3[i] * h2) | 0;
  }
  return outQ;
}

/**
 * cp = trunc(out_q * K / (127*64)), truncation toward zero — mirrors the AS
 * nnueEvaluateCp() (i64 multiply + i64 signed division).
 */
export function outQToCp(outQ: number, scaleK: number): number {
  return Math.trunc((outQ * scaleK) / 8128);
}

// ---------------------------------------------------------------------------
// SFEN parser (== ml/train.py parse_sfen board/hand semantics, but producing
// the engine board representation so the position can be loaded into WASM)
// ---------------------------------------------------------------------------

const SFEN_PIECE: Record<string, number> = {
  P: 1, // FU
  L: 2, // KY
  N: 3, // KE
  S: 4, // GI
  G: 5, // KI
  B: 6, // KA
  R: 7, // HI
  K: 8, // OU
};
const SFEN_PROMOTED: Record<string, number> = {
  P: 9, // TO
  L: 10, // NY
  N: 11, // NK
  S: 12, // NG
  B: 14, // UM
  R: 15, // RY
};

export interface ParsedSfen {
  ban: Int32Array; // length 176, indexed by (suji << 4) + dan (playable squares only)
  hand: Int32Array; // length 64, indexed by koma (side | type)
  teban: number;
}

export function parseSfen(sfen: string): ParsedSfen {
  const parts = sfen.trim().split(/\s+/);
  const [boardS, turnS, handS] = [parts[0], parts[1], parts[2]];
  const ban = new Int32Array(176);
  const hand = new Int32Array(64);

  const rows = boardS.split('/');
  if (rows.length !== 9) throw new Error(`bad sfen board: ${boardS}`);
  for (let r = 0; r < 9; r++) {
    const dan = r + 1;
    let suji = 9;
    const row = rows[r];
    for (let i = 0; i < row.length; i++) {
      let c = row[i];
      if (c >= '1' && c <= '9') {
        suji -= parseInt(c, 10);
        continue;
      }
      let promoted = false;
      if (c === '+') {
        promoted = true;
        i++;
        c = row[i];
      }
      const upper = c.toUpperCase();
      const isBlack = c === upper;
      const type = promoted ? SFEN_PROMOTED[upper] : SFEN_PIECE[upper];
      if (type === undefined) throw new Error(`bad sfen piece: ${c} in ${boardS}`);
      ban[(suji << 4) + dan] = type | (isBlack ? SENTE : GOTE);
      suji--;
    }
  }

  if (handS !== undefined && handS !== '-') {
    let count = 0;
    for (let i = 0; i < handS.length; i++) {
      const c = handS[i];
      if (c >= '0' && c <= '9') {
        count = count * 10 + parseInt(c, 10);
        continue;
      }
      const n = count > 0 ? count : 1;
      count = 0;
      const upper = c.toUpperCase();
      const isBlack = c === upper;
      const type = SFEN_PIECE[upper];
      if (type === undefined) throw new Error(`bad sfen hand piece: ${c} in ${handS}`);
      hand[(isBlack ? SENTE : GOTE) | type] += n;
    }
  }

  return { ban, hand, teban: turnS === 'w' ? GOTE : SENTE };
}
