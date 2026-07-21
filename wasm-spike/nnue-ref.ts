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
/** King buckets of the reduced-KP feature set (weights.bin v2). */
export const NNUE_KP_BUCKETS = 6;
/** Full normalized own-king-square buckets (HalfKP-style research format). */
export const NNUE_HALFKP_BUCKETS = 81;

export interface NnueLayout {
  buckets: number;
  w1BoardOff: number;
  w1HandOff: number;
  b1Off: number;
  w2Off: number;
  b2Off: number;
  w3Off: number;
  b3Off: number;
  totalBytes: number;
}

/**
 * weights.bin layout for a bucket count. buckets=1 is the original board
 * one-hot format (1,185,988 B); buckets=6 is the reduced-KP format where both
 * the board and the hand tables are repeated per own-king bucket (7,027,908 B).
 */
export function layoutFor(buckets: number): NnueLayout {
  const w1BoardBytes = buckets * NNUE_BOARD_FEATS * NNUE_H1 * 2;
  const w1HandBytes = buckets * NNUE_HAND_FEATS * NNUE_H1 * 2;
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
    buckets,
    w1BoardOff,
    w1HandOff,
    b1Off,
    w2Off,
    b2Off,
    w3Off,
    b3Off,
    totalBytes: b3Off + b3Bytes,
  };
}

export const NNUE_LAYOUT = layoutFor(1); // totalBytes 1,185,988
export const NNUE_KP_LAYOUT = layoutFor(NNUE_KP_BUCKETS); // totalBytes 7,027,908
export const NNUE_HALFKP_LAYOUT = layoutFor(NNUE_HALFKP_BUCKETS); // totalBytes 94,656,708

/** Infer the bucket count of a weights.bin blob from its byte length. */
export function bucketsForByteLength(byteLength: number): number {
  if (byteLength === NNUE_LAYOUT.totalBytes) return 1;
  if (byteLength === NNUE_KP_LAYOUT.totalBytes) return NNUE_KP_BUCKETS;
  if (byteLength === NNUE_HALFKP_LAYOUT.totalBytes) return NNUE_HALFKP_BUCKETS;
  throw new Error(
    `unrecognized weights.bin size ${byteLength} (expected ${NNUE_LAYOUT.totalBytes}, ${NNUE_KP_LAYOUT.totalBytes}, or ${NNUE_HALFKP_LAYOUT.totalBytes})`
  );
}

/**
 * Own-king bucket (stm-normalized suji s / dan d, both 1..9) — must match
 * ml/train.py kp_bucket exactly.
 */
export function kpBucket(s: number, d: number): number {
  if (d <= 7) return 5;
  if (d === 8) return s <= 4 ? 3 : 4;
  if (s === 5) return 0;
  return s <= 4 ? 1 : 2;
}

/** Bucket for the selected model format from an stm-normalized king square. */
export function kingBucket(s: number, d: number, buckets: number): number {
  if (buckets === NNUE_HALFKP_BUCKETS) return (s - 1) * 9 + (d - 1);
  if (buckets === NNUE_KP_BUCKETS) return kpBucket(s, d);
  if (buckets === 1) return 0;
  throw new Error(`unsupported NNUE king bucket count ${buckets}`);
}

export interface NnueWeights {
  buckets: number; // 1 = original, 6 = reduced KP, 81 = HalfKP research format
  w1Board: Int16Array; // (buckets*2268, 256) feature-major
  w1Hand: Int16Array; // (buckets*14, 256) feature-major
  b1: Int32Array; // (256,)
  w2: Int16Array; // (32, 256) row-major
  b2: Int32Array; // (32,)
  w3: Int16Array; // (32,)
  b3: Int32Array; // (1,)
}

/** View a weights.bin-compatible buffer as typed arrays (no copy). */
export function weightsFromBuffer(buf: ArrayBufferLike, byteOffset = 0, buckets = 1): NnueWeights {
  const L = layoutFor(buckets);
  return {
    buckets,
    w1Board: new Int16Array(buf, byteOffset + L.w1BoardOff, buckets * NNUE_BOARD_FEATS * NNUE_H1),
    w1Hand: new Int16Array(buf, byteOffset + L.w1HandOff, buckets * NNUE_HAND_FEATS * NNUE_H1),
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
export function makeDummyWeights(seed: number, buckets = 1): Uint8Array {
  const bytes = new Uint8Array(layoutFor(buckets).totalBytes);
  const w = weightsFromBuffer(bytes.buffer, 0, buckets);
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
// Synthetic "material NNUE" weights (sane eval surface for search benches)
// ---------------------------------------------------------------------------

/** Piece values in units of 32 cp, train.py kind order (FU..RY, OU = 0). */
export const MATERIAL_VU = [100, 430, 450, 640, 690, 890, 1040, 0, 1200, 1150, 1150, 1150, 1450, 1630].map(
  (v) => Math.round(v / 32)
);
export const MATERIAL_SCALE_K = 600;
const MAT_THERMO = 6; // h1 thermometer neurons 0..5, windows k = -2..3
const MAT_H2ROWS = 7; // h2 thermometer rows 0..6
const MAT_WOUT = 434; // 434 * 600 ≈ 32 * 8128 → cp ≈ 32 * x

/**
 * Generate a weights.bin whose net computes a PURE MATERIAL evaluation,
 * exactly representable in the integer pipeline via thermometer coding:
 *
 *   x    = Σ ±MATERIAL_VU[kind]  (board + hand features, stm perspective)
 *   h1_n = clamp(x + 127 - 127k, 0, 127)   k = n-2 ∈ {-2..3}  → Σ h1 = x + 381
 *   h2_r = clamp(((64·Σh1) - 8128r) >> 6)  r = 0..6           → Σ h2 = Σ h1
 *   outq = 434·Σh2 - 381·434 = 434·x  →  cp = trunc(434·x·600/8128) ≈ 32x
 *
 * linear for |x| ≤ 381 (≈ ±12,000 cp — saturates only in hopeless positions).
 * The random dummy weights destroy move ordering / pruning, so search-depth
 * numbers on them are meaningless; these weights provide a sane surface whose
 * cost profile is identical (same architecture, same inference path).
 */
export function makeMaterialWeights(): Uint8Array {
  const bytes = new Uint8Array(NNUE_LAYOUT.totalBytes);
  const w = weightsFromBuffer(bytes.buffer);
  for (let plane = 0; plane < 28; plane++) {
    const v = (plane < 14 ? 1 : -1) * MATERIAL_VU[plane % 14];
    if (v === 0) continue; // kings
    for (let sq = 0; sq < 81; sq++) {
      const base = (plane * 81 + sq) * NNUE_H1;
      for (let n = 0; n < MAT_THERMO; n++) w.w1Board[base + n] = v;
    }
  }
  for (let i = 0; i < NNUE_HAND_FEATS; i++) {
    const v = (i < 7 ? 1 : -1) * MATERIAL_VU[i % 7];
    for (let n = 0; n < MAT_THERMO; n++) w.w1Hand[i * NNUE_H1 + n] = v;
  }
  for (let n = 0; n < MAT_THERMO; n++) w.b1[n] = 127 - 127 * (n - 2);
  for (let r = 0; r < MAT_H2ROWS; r++) {
    for (let n = 0; n < MAT_THERMO; n++) w.w2[r * NNUE_H1 + n] = 64;
    w.b2[r] = -8128 * r;
    w.w3[r] = MAT_WOUT;
  }
  w.b3[0] = -381 * MAT_WOUT;
  return bytes;
}

/**
 * Expected cp of the material net on a position (exact in the linear range) —
 * lets the bench self-check the thermometer construction end to end.
 */
export function materialCpReference(pos: NnuePosition): number {
  const feats = extractFeatures(pos);
  let x = 0;
  for (const f of feats.boardFeats) {
    const plane = Math.floor((f % NNUE_BOARD_FEATS) / 81);
    x += (plane < 14 ? 1 : -1) * MATERIAL_VU[plane % 14];
  }
  for (let i = 0; i < NNUE_HAND_FEATS; i++) {
    x += (i < 7 ? 1 : -1) * MATERIAL_VU[i % 7] * feats.hands[i];
  }
  return Math.trunc((MAT_WOUT * x * MATERIAL_SCALE_K) / 8128);
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
  boardFeats: number[]; // active one-hot indices, stm-normalized (KP: bucket-offset included)
  hands: number[]; // 14 counts: mine 0..6, opponent 7..13 (FU..HI order)
  bucket: number; // own-king KP bucket (0 when buckets === 1)
}

/**
 * Extract stm-normalized features. With buckets > 1 (reduced KP) every board
 * feature is offset by bucket*2268 where bucket = kpBucket(own king square in
 * the stm frame); hand features use row bucket*14+i in intForward.
 */
export function extractFeatures(pos: NnuePosition, buckets = 1): NnueFeatures {
  const boardFeats: number[] = [];
  const stmSente = pos.teban === SENTE;
  let bucket = 0;
  if (buckets > 1) {
    // Locate the side-to-move king and quantize its stm-frame square.
    let ks = -1;
    let kd = -1;
    for (let suji = 1; suji <= 9 && ks < 0; suji++) {
      for (let dan = 1; dan <= 9; dan++) {
        const koma = pos.ban[(suji << 4) + dan];
        if (koma === EMPTY) continue;
        if (NNUE_KIND[koma & 0x0f] === 7 && ((koma & SENTE) !== 0) === stmSente) {
          ks = stmSente ? suji : 10 - suji;
          kd = stmSente ? dan : 10 - dan;
          break;
        }
      }
    }
    if (ks < 0) throw new Error('extractFeatures: side-to-move king not found (KP features need it)');
    bucket = kingBucket(ks, kd, buckets);
  }
  const boardBase = bucket * NNUE_BOARD_FEATS;
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
      boardFeats.push(boardBase + plane * 81 + (s - 1) * 9 + (d - 1));
    }
  }

  const hands = new Array<number>(NNUE_HAND_FEATS).fill(0);
  const mySide = pos.teban;
  const oppSide = pos.teban === SENTE ? GOTE : SENTE;
  for (let type = FU; type <= HI; type++) {
    hands[type - 1] = pos.hand[mySide | type] | 0;
    hands[type - 1 + 7] = pos.hand[oppSide | type] | 0;
  }
  return { boardFeats, hands, bucket };
}

// ---------------------------------------------------------------------------
// Integer forward pass (== ml/export-weights.py int_forward)
// ---------------------------------------------------------------------------

/** out_q = quantized network output (side-to-move perspective), exact i32. */
export function intForward(w: NnueWeights, feats: NnueFeatures): number {
  // Layer 1: acc = b1 + Σ w1_board[f] + Σ w1_hand[bucket*14+i] * count[i]
  const acc = new Int32Array(NNUE_H1);
  acc.set(w.b1);
  for (const f of feats.boardFeats) {
    const base = f * NNUE_H1;
    for (let j = 0; j < NNUE_H1; j++) {
      acc[j] = (acc[j] + w.w1Board[base + j]) | 0;
    }
  }
  const handRow0 = (w.buckets > 1 ? feats.bucket : 0) * NNUE_HAND_FEATS;
  for (let i = 0; i < NNUE_HAND_FEATS; i++) {
    const c = feats.hands[i] | 0;
    if (c === 0) continue;
    const base = (handRow0 + i) * NNUE_H1;
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
      if (suji < 1) throw new Error(`sfen rank overflows 9 files: "${row}" in ${boardS}`);
      ban[(suji << 4) + dan] = type | (isBlack ? SENTE : GOTE);
      suji--;
    }
    if (suji !== 0) throw new Error(`sfen rank has wrong width (${9 - suji}/9 files): "${row}" in ${boardS}`);
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
