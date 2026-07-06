// Shogi WASM spike — board representation + pseudo-legal move generation + perft.
//
// This is a minimal AssemblyScript port of the hot path of the TS engine in
// src/components/game/ShogiImproved/ (GenerateMovesImproved + the parts of
// KyokumenImproved needed for perft):
//
// - Board: 1D array indexed by (suji << 4) + dan (same as KyokumenImproved.ban).
// - Move tables: CAN_MOVE / CAN_JUMP / DIFF are auto-generated from the TS source
//   (see gen-tables.mjs), so movement semantics are byte-identical.
// - Move generation: port of generatePseudoLegalMovesPooled including nifu,
//   drop-rank restrictions, forced/optional promotion branches
//   (forcePromoteMajor for KA/HI included) and the uchifuzume (pawn-drop-mate)
//   check — a pawn drop in front of the enemy king that leaves the opponent
//   with no legal reply is illegal, exactly like GenerateMovesImproved.isUtiFuDume.
// - Legality: lazy "king left in check" filtering after make (same strategy as
//   the V20 search path).
// - Bookkeeping parity: makeMove/unmakeMove maintain incremental material eval
//   and Zobrist board/hand hashes, mirroring KyokumenImproved.move()/back().
//   The Zobrist seeds are generated with the exact same deterministic PRNG and
//   in the exact same order as KyokumenImproved.initializeHash(), so BanHash /
//   HandHash / HashVal are BIT-IDENTICAL to the JS engine for any position
//   (verified by wasm-spike/parity.ts).
// - Evaluation (phase 2): full port of KyokumenImproved.evaluateV3() — PSQT
//   (initializePsqt tables + incremental updates in make/unmake mirroring
//   KyokumenImproved.move()/back()), hand bonus, king safety v2 (phase-aware,
//   f64 + Math.round exactly like JS), castle shapes, major piece activity,
//   file defense, climbing-silver pressure (silver intrusion level 4), and
//   promotion threats (incl. the ±350 UM/RY-in-enemy-camp bonus), with the
//   phase-bucket fixed-point scaling of scaleEvalV3 (Math.imul == i32 mul,
//   symmetric rounding). evaluateV3() is INTEGER-IDENTICAL to the JS engine
//   (verified by wasm-spike/parity.ts).
//   evaluateV3Full() = evaluateV3() + hangingThreat(), where hangingThreat is
//   a port of ShogiAIImprovedV20.hangingThreatSente (silver-and-up, attacked
//   AND undefended only, (worstGote - worstSente) / 3 truncated). This is the
//   leaf evaluation the phase-3 search should use.
//
// Moves are encoded in a single i32:
//   bits 0-7   to
//   bits 8-15  from        (0 = drop)
//   bits 16-22 koma        (piece with side flag)
//   bit  23    promote
//   bits 24-30 capture     (piece previously on `to`, 0 = none)

import { CAN_JUMP, CAN_MOVE, CAN_PROMOTE, DIFF, KOMA_VALUE } from './tables';

// ---------------------------------------------------------------------------
// Constants (mirroring types.ts)
// ---------------------------------------------------------------------------

const SENTE: i32 = 16;
const GOTE: i32 = 32;
const EMPTY: i32 = 0;
const WALL: i32 = 64;
const PROMOTE: i32 = 8;

const FU: i32 = 1;
const KY: i32 = 2;
const KE: i32 = 3;
const GI: i32 = 4;
const KI: i32 = 5;
const KA: i32 = 6;
const HI: i32 = 7;
const OU: i32 = 8;
const TO: i32 = 9;
const NY: i32 = 10;
const NK: i32 = 11;
const NG: i32 = 12;
const UM: i32 = 14;
const RY: i32 = 15;

const SOU: i32 = SENTE + OU;
const GOU: i32 = GOTE + OU;

const BAN_SIZE: i32 = 16 * 11;

// ---------------------------------------------------------------------------
// Position state
// ---------------------------------------------------------------------------

const ban = new StaticArray<i32>(BAN_SIZE);
const hand = new StaticArray<i32>(64);
let teban: i32 = SENTE;
let kingS: i32 = 0;
let kingG: i32 = 0;

// Incremental bookkeeping (parity with KyokumenImproved.move/back).
let evalMaterial: i32 = 0;
let psqtEval: i32 = 0;
let banHash: i32 = 0;
let handHash: i32 = 0;

// Zobrist seeds — BIT-IDENTICAL to KyokumenImproved.initializeHash():
// - same deterministic Mulberry32-ish PRNG (Math.imul semantics == u32 mul)
// - same array dimensions: HashSeed[(GRY+1)=48][16*11], HandHashSeed[(GHI+1)=40][20]
// - same generation order (row-major: board seeds, then hand seeds, then teban seed)
const MAX_BAN_KOMA: i32 = 47;  // GRY = GOTE | RY = 32 + 15
const MAX_HAND_KOMA: i32 = 39; // GHI = GOTE | HI = 32 + 7

const HASH_SEED = new StaticArray<i32>((MAX_BAN_KOMA + 1) * BAN_SIZE); // [koma * BAN_SIZE + pos]
const HAND_HASH_SEED = new StaticArray<i32>((MAX_HAND_KOMA + 1) * 20); // [koma * 20 + count]
let TEBAN_HASH_SEED: i32 = 0;

let prngState: u32 = 0x6d2b79f5;
function rand30(): i32 {
  prngState = prngState + 0x6d2b79f5;
  let t: u32 = prngState;
  t = (t ^ (t >> 15)) * (t | 1);
  t = t ^ (t + (t ^ (t >> 7)) * (t | 61));
  return <i32>((t ^ (t >> 14)) & 0x3fffffff);
}

function initSeeds(): void {
  for (let i = 0; i < (MAX_BAN_KOMA + 1) * BAN_SIZE; i++) unchecked(HASH_SEED[i] = rand30());
  for (let i = 0; i < (MAX_HAND_KOMA + 1) * 20; i++) unchecked(HAND_HASH_SEED[i] = rand30());
  const t = rand30();
  TEBAN_HASH_SEED = t == 0 ? 1 : t; // JS: `rand30() || 1`
}
initSeeds();

// ---------------------------------------------------------------------------
// Move buffer: fixed-size slice per ply (no allocation during search)
// ---------------------------------------------------------------------------

const MAX_MOVES: i32 = 640; // theoretical shogi max is 593
// Buffer plies: search MAX_PLY (64) + scratch plies for recursive uchifuzume
// checks (each nesting level uses ply+1 as scratch; 16 spare levels is far
// beyond anything reachable in practice).
const MAX_PLY: i32 = 80;
const moveBuf = new StaticArray<i32>(MAX_MOVES * MAX_PLY);
// Parallel sort keys for move ordering (phase 3 search).
const moveScoreBuf = new StaticArray<i32>(MAX_MOVES * MAX_PLY);

// Per-ply scratch for pooled drop generation (bit-exact fast path). Indexed by
// `ply * 10 + fileIndex` where fileIndex = suji >> 4 (1..9; slot 0 unused).
// `dropEmptyBits` holds a bitmask with bit `dan` set when that square is EMPTY;
// `dropSujiHasOwnPawn` flags a nifu (own pawn already on that file). Per-ply
// (not global) because generateMoves recurses through isUtiFuDume/hasLegalMove
// using ply+1, which must not clobber the caller's scratch.
const DROP_SCRATCH_STRIDE: i32 = 10;
const dropEmptyBits = new StaticArray<i32>(DROP_SCRATCH_STRIDE * MAX_PLY);
const dropSujiHasOwnPawn = new StaticArray<bool>(DROP_SCRATCH_STRIDE * MAX_PLY);

// ---------------------------------------------------------------------------
// Small helpers (mirroring types.ts helpers)
// ---------------------------------------------------------------------------

function get(p: i32): i32 {
  if (p < 0 || p >= BAN_SIZE) return WALL;
  return unchecked(ban[p]);
}

function isSelf(t: i32, koma: i32): bool {
  return (koma & t) != 0;
}

function isEnemy(t: i32, koma: i32): bool {
  return (koma & (SENTE + GOTE - t)) != 0;
}

function getKomashu(koma: i32): i32 {
  return koma & 0x0f;
}

// ---------------------------------------------------------------------------
// Position setup
// ---------------------------------------------------------------------------

export function clearBoard(): void {
  for (let i = 0; i < BAN_SIZE; i++) unchecked(ban[i] = WALL);
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      unchecked(ban[(suji << 4) + dan] = EMPTY);
    }
  }
  for (let i = 0; i < 64; i++) unchecked(hand[i] = 0);
  teban = SENTE;
  // JS parity: KyokumenImproved uses -34 for "king not on board" and computes
  // (kingPos >> 4) / (kingPos & 0x0f) from it in evaluateMajorPieceActivity.
  kingS = -34;
  kingG = -34;
  evalMaterial = 0;
  psqtEval = 0;
  banHash = 0;
  handHash = 0;
}

export function setSquare(pos: i32, koma: i32): void {
  ban[pos] = koma;
}

export function setHand(koma: i32, count: i32): void {
  hand[koma] = count;
}

export function setSideToMove(t: i32): void {
  teban = t;
}

/** Recompute king positions / eval / hashes after manual setup. */
export function finalizePosition(): void {
  evalMaterial = 0;
  psqtEval = 0;
  banHash = 0;
  handHash = 0;
  kingS = -34;
  kingG = -34;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      const koma = unchecked(ban[pos]);
      if (koma == SOU) kingS = pos;
      if (koma == GOU) kingG = pos;
      evalMaterial += unchecked(KOMA_VALUE[koma]);
      psqtEval += psqtValue(koma, pos);
      banHash ^= unchecked(HASH_SEED[koma * BAN_SIZE + pos]);
    }
  }
  // Same as KyokumenImproved.calcHash(): cumulative XOR over counts 0..n for
  // EVERY koma index 0..GHI (empty slots still contribute seed[koma][0]).
  for (let koma = 0; koma <= MAX_HAND_KOMA; koma++) {
    const n = unchecked(hand[koma]);
    evalMaterial += unchecked(KOMA_VALUE[koma]) * n;
    for (let j = 0; j <= n; j++) {
      handHash ^= unchecked(HAND_HASH_SEED[koma * 20 + j]);
    }
  }
  if (nnueEnabled) nnueRefreshAccumulators();
}

/** Standard initial position (hirate). */
export function initHirate(): void {
  clearBoard();
  // Back ranks: KY KE GI KI OU KI GI KE KY on dan 1 (gote) / dan 9 (sente).
  const backRank = StaticArray.fromArray<i32>([2, 3, 4, 5, 8, 5, 4, 3, 2]); // KY KE GI KI OU ...
  for (let suji = 1; suji <= 9; suji++) {
    ban[(suji << 4) + 1] = unchecked(backRank[suji - 1]) | GOTE;
    ban[(suji << 4) + 9] = unchecked(backRank[suji - 1]) | SENTE;
    ban[(suji << 4) + 3] = FU | GOTE;
    ban[(suji << 4) + 7] = FU | SENTE;
  }
  ban[(8 << 4) + 2] = HI | GOTE;
  ban[(2 << 4) + 2] = KA | GOTE;
  ban[(8 << 4) + 8] = KA | SENTE;
  ban[(2 << 4) + 8] = HI | SENTE;
  finalizePosition();
}

// ---------------------------------------------------------------------------
// Make / unmake (port of KyokumenImproved.move()/back(), minus PSQT)
// ---------------------------------------------------------------------------

function makeMove(m: i32): void {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const promote = (m >> 23) & 1;
  const capture = (m >> 24) & 0x7f;

  // PSQT incremental update (parity with KyokumenImproved.move()):
  // - remove captured piece from destination
  // - remove moved piece from source (if not a drop)
  // - add moved/promoted piece on destination (below, after the board update)
  if (capture != EMPTY) {
    psqtEval -= psqtValue(capture, to);
  }
  if (from != 0) {
    psqtEval -= psqtValue(koma, from);
  }

  // Remove destination occupant from board hash.
  banHash ^= unchecked(HASH_SEED[capture * BAN_SIZE + to]);

  if (capture != EMPTY) {
    evalMaterial -= unchecked(KOMA_VALUE[capture]);
    // Captured piece goes to the opposite side's hand, unpromoted.
    const handKoma = (capture & 0x07) | ((capture & SENTE) != 0 ? GOTE : SENTE);
    const cnt = unchecked(hand[handKoma]) + 1;
    unchecked(hand[handKoma] = cnt);
    handHash ^= unchecked(HAND_HASH_SEED[handKoma * 20 + cnt]);
    evalMaterial += unchecked(KOMA_VALUE[handKoma]);
  }

  if (from == 0) {
    // Drop.
    const cnt = unchecked(hand[koma]);
    handHash ^= unchecked(HAND_HASH_SEED[koma * 20 + cnt]);
    unchecked(hand[koma] = cnt - 1);
  } else {
    unchecked(ban[from] = EMPTY);
    banHash ^= unchecked(HASH_SEED[koma * BAN_SIZE + from]);
    banHash ^= unchecked(HASH_SEED[EMPTY * BAN_SIZE + from]);
  }

  let placed = koma;
  if (promote != 0) {
    evalMaterial -= unchecked(KOMA_VALUE[koma]);
    placed = koma | PROMOTE;
    evalMaterial += unchecked(KOMA_VALUE[placed]);
  }
  unchecked(ban[to] = placed);
  banHash ^= unchecked(HASH_SEED[placed * BAN_SIZE + to]);

  psqtEval += psqtValue(placed, to);

  if (koma == SOU) kingS = to;
  else if (koma == GOU) kingG = to;

  if (nnueEnabled) {
    // Lazy NNUE accumulator update: just record the move; the delta is applied
    // only if an evaluation happens below this node (see nnueApplyPending).
    if (nnuePendLen < NNUE_PEND_CAP) unchecked(nnuePendStack[nnuePendLen] = m);
    nnuePendLen++;
  }
}

function unmakeMove(m: i32): void {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const promote = (m >> 23) & 1;
  const capture = (m >> 24) & 0x7f;

  // Remove the moved piece (possibly promoted) from destination.
  const placed = promote != 0 ? koma | PROMOTE : koma;
  banHash ^= unchecked(HASH_SEED[placed * BAN_SIZE + to]);

  // PSQT incremental update (parity with KyokumenImproved.back()):
  // - remove the moved piece currently sitting on `to`
  // - add back the captured piece (if any)
  // - add back the mover on `from` (if not a drop, below)
  psqtEval -= psqtValue(placed, to);

  // Restore captured piece (or EMPTY).
  unchecked(ban[to] = capture);
  banHash ^= unchecked(HASH_SEED[capture * BAN_SIZE + to]);
  evalMaterial += unchecked(KOMA_VALUE[capture]);

  if (capture != EMPTY) {
    psqtEval += psqtValue(capture, to);
  }

  if (capture != EMPTY) {
    const handKoma = (capture & 0x07) | ((capture & SENTE) != 0 ? GOTE : SENTE);
    const cnt = unchecked(hand[handKoma]);
    handHash ^= unchecked(HAND_HASH_SEED[handKoma * 20 + cnt]);
    unchecked(hand[handKoma] = cnt - 1);
    evalMaterial -= unchecked(KOMA_VALUE[handKoma]);
  }

  if (from == 0) {
    const cnt = unchecked(hand[koma]) + 1;
    unchecked(hand[koma] = cnt);
    handHash ^= unchecked(HAND_HASH_SEED[koma * 20 + cnt]);
  } else {
    unchecked(ban[from] = koma);
    banHash ^= unchecked(HASH_SEED[EMPTY * BAN_SIZE + from]);
    banHash ^= unchecked(HASH_SEED[koma * BAN_SIZE + from]);
    psqtEval += psqtValue(koma, from);
    if (promote != 0) {
      evalMaterial -= unchecked(KOMA_VALUE[koma | PROMOTE]);
      evalMaterial += unchecked(KOMA_VALUE[koma]);
    }
  }

  if (koma == SOU) kingS = from;
  else if (koma == GOU) kingG = from;

  if (nnueEnabled) {
    // Invert the NNUE delta only where it was actually folded in. A folded
    // KP bucket-crossing king move cannot be inverted row-wise (every feature
    // of that perspective changed table segment), so mark the accumulator
    // dirty instead — the next evaluation rebuilds it from the live board.
    nnuePendLen--;
    if (nnuePendAppliedS > nnuePendLen) {
      if (nnueAccSDirty || nnueMoveCrossesS(m)) nnueAccSDirty = true;
      else nnueAccApplyUnmakeS(m);
      nnuePendAppliedS = nnuePendLen;
    }
    if (nnuePendAppliedG > nnuePendLen) {
      if (nnueAccGDirty || nnueMoveCrossesG(m)) nnueAccGDirty = true;
      else nnueAccApplyUnmakeG(m);
      nnuePendAppliedG = nnuePendLen;
    }
  }
}

// ---------------------------------------------------------------------------
// Attack detection (port of GenerateMovesImproved.isSquareAttacked)
// ---------------------------------------------------------------------------

function isSquareAttacked(target: i32, defender: i32): bool {
  // Direct (non-sliding) attacks: 12 directions.
  for (let direct = 0; direct < 12; direct++) {
    const pos = target - unchecked(DIFF[direct]);
    const koma = get(pos);
    if (isEnemy(defender, koma) && unchecked(CAN_MOVE[(direct << 6) + koma]) != 0) {
      return true;
    }
  }

  // Sliding attacks: 8 directions.
  for (let direct = 0; direct < 8; direct++) {
    const d = unchecked(DIFF[direct]);
    let pos = target - d;
    let koma = get(pos);
    while (koma != WALL) {
      if (isSelf(defender, koma)) break;
      if (isEnemy(defender, koma)) {
        if (unchecked(CAN_JUMP[(direct << 6) + koma]) != 0) return true;
        break;
      }
      pos -= d;
      koma = get(pos);
    }
  }

  return false;
}

function isKingInCheck(side: i32): bool {
  const kingPos = side == SENTE ? kingS : kingG;
  if (kingPos <= 0) return true;
  return isSquareAttacked(kingPos, side);
}

// ---------------------------------------------------------------------------
// Uchifuzume (pawn-drop-mate) check — port of GenerateMovesImproved.isUtiFuDume
// ---------------------------------------------------------------------------

/**
 * True if the side to move has at least one legal move (uses the moveBuf slice
 * for `ply` as scratch space). Early-exit is equivalent to the JS
 * `generateLegalMoves(k).length === 0` emptiness test.
 */
function hasLegalMove(ply: i32): bool {
  const n = generateMoves(ply);
  const base = ply * MAX_MOVES;
  const mover = teban;
  for (let i = 0; i < n; i++) {
    const m = unchecked(moveBuf[base + i]);
    makeMove(m);
    const illegal = isKingInCheck(mover);
    unmakeMove(m);
    if (!illegal) return true;
  }
  return false;
}

/**
 * Pawn-drop-mate test for a pawn drop by `teban` onto `to` (square known empty).
 * Mirrors GenerateMovesImproved.isUtiFuDume: only a drop directly in front of
 * the enemy king can be uchifuzume; it is illegal iff the opponent has no legal
 * reply. Reply generation goes through generateMoves and therefore applies the
 * uchifuzume rule recursively, exactly like the JS generateLegalMoves path.
 */
function isUtiFuDume(to: i32, ply: i32): bool {
  // Scratch-ply guard: the reply generation below uses moveBuf slice `ply`;
  // never index past the buffer (unreachable in practice — it would require
  // 16+ nested pawn-drop-mate probes on top of a maximum-depth search path).
  if (ply >= MAX_PLY - 1) return false;
  const mover = teban;
  const enemy = mover == SENTE ? GOTE : SENTE;
  const enemyKing = mover == SENTE ? kingG : kingS;

  if (mover == SENTE) {
    if (enemyKing != to - 1) return false; // not in front of enemy king
  } else {
    if (enemyKing != to + 1) return false;
  }

  const m = encodeMove(FU | mover, 0, to, false, EMPTY);
  makeMove(m);
  teban = enemy;
  const hasReply = hasLegalMove(ply);
  teban = mover;
  unmakeMove(m);
  return !hasReply;
}

// ---------------------------------------------------------------------------
// Move generation (port of generatePseudoLegalMovesPooled, incl. uchifuzume)
// ---------------------------------------------------------------------------

function encodeMove(koma: i32, from: i32, to: i32, promote: bool, capture: i32): i32 {
  return to | (from << 8) | (koma << 16) | ((promote ? 1 : 0) << 23) | (capture << 24);
}

/** Port of addTePooled: push move(s) with promotion branching. */
function pushMoves(base: i32, n: i32, koma: i32, from: i32, to: i32): i32 {
  const capture = unchecked(ban[to]);
  const toDan = to & 0x0f;
  const fromDan = from & 0x0f;
  const komashu = getKomashu(koma);

  if (teban == SENTE) {
    if ((komashu == KY || komashu == FU) && toDan == 1) {
      unchecked(moveBuf[base + n] = encodeMove(koma, from, to, true, capture));
      return n + 1;
    }
    if (komashu == KE && toDan <= 2) {
      unchecked(moveBuf[base + n] = encodeMove(koma, from, to, true, capture));
      return n + 1;
    }
    if ((toDan <= 3 || fromDan <= 3) && unchecked(CAN_PROMOTE[koma]) != 0) {
      // KA/HI: promotion is strictly better — prune the non-promote branch
      // (same as the JS engine's forcePromoteMajor).
      unchecked(moveBuf[base + n] = encodeMove(koma, from, to, true, capture));
      n++;
      if (!(komashu == KA || komashu == HI)) {
        unchecked(moveBuf[base + n] = encodeMove(koma, from, to, false, capture));
        n++;
      }
      return n;
    }
    unchecked(moveBuf[base + n] = encodeMove(koma, from, to, false, capture));
    return n + 1;
  }

  // GOTE
  if ((komashu == KY || komashu == FU) && toDan == 9) {
    unchecked(moveBuf[base + n] = encodeMove(koma, from, to, true, capture));
    return n + 1;
  }
  if (komashu == KE && toDan >= 8) {
    unchecked(moveBuf[base + n] = encodeMove(koma, from, to, true, capture));
    return n + 1;
  }
  if ((toDan >= 7 || fromDan >= 7) && unchecked(CAN_PROMOTE[koma]) != 0) {
    unchecked(moveBuf[base + n] = encodeMove(koma, from, to, true, capture));
    n++;
    if (!(komashu == KA || komashu == HI)) {
      unchecked(moveBuf[base + n] = encodeMove(koma, from, to, false, capture));
      n++;
    }
    return n;
  }
  unchecked(moveBuf[base + n] = encodeMove(koma, from, to, false, capture));
  return n + 1;
}

/** Generate pseudo-legal moves into the per-ply slice; returns move count. */
function generateMoves(ply: i32): i32 {
  const base = ply * MAX_MOVES;
  let n: i32 = 0;

  // Board moves.
  for (let suji = 0x10; suji <= 0x90; suji += 0x10) {
    for (let dan = 1; dan <= 9; dan++) {
      const from = suji + dan;
      const koma = unchecked(ban[from]);
      if (!isSelf(teban, koma)) continue;

      // Direct moves (12 directions).
      for (let direct = 0; direct < 12; direct++) {
        if (unchecked(CAN_MOVE[(direct << 6) + koma]) == 0) continue;
        const to = from + unchecked(DIFF[direct]);
        const toSuji = to >> 4;
        const toDan = to & 0x0f;
        if (toSuji >= 1 && toSuji <= 9 && toDan >= 1 && toDan <= 9) {
          if (isSelf(teban, unchecked(ban[to]))) continue;
          n = pushMoves(base, n, koma, from, to);
        }
      }

      // Sliding moves (8 directions).
      for (let direct = 0; direct < 8; direct++) {
        if (unchecked(CAN_JUMP[(direct << 6) + koma]) == 0) continue;
        const d = unchecked(DIFF[direct]);
        for (let i = 1; i < 9; i++) {
          const to = from + d * i;
          const target = get(to);
          if (target == WALL) break;
          if (isSelf(teban, target)) break;
          n = pushMoves(base, n, koma, from, to);
          if (target != EMPTY) break; // capture: stop sliding
        }
      }
    }
  }

  // Drop moves.
  //
  // Bit-exact fast path (mirrors GenerateMovesImproved.generatePseudoLegal-
  // MovesPooled): scan the board a single time to build, per file, a bitmask of
  // EMPTY squares and a nifu flag, then reuse them across all drop piece types.
  // The old loop re-read the board per (type, suji, dan) and re-scanned each
  // file for nifu once per drop type. Move set and ORDER are unchanged.
  let hasDrop = false;
  for (let type = FU; type <= HI; type++) {
    if (unchecked(hand[type | teban]) > 0) {
      hasDrop = true;
      break;
    }
  }

  if (hasDrop) {
    const scratchBase = ply * DROP_SCRATCH_STRIDE;
    const ownPawn = FU | teban;
    for (let suji = 0x10; suji <= 0x90; suji += 0x10) {
      let bits = 0;
      let nifu: bool = false;
      for (let dan = 1; dan <= 9; dan++) {
        const c = unchecked(ban[suji + dan]);
        if (c == EMPTY) bits |= 1 << dan;
        else if (c == ownPawn) nifu = true;
      }
      const s = suji >> 4;
      unchecked(dropEmptyBits[scratchBase + s] = bits);
      unchecked(dropSujiHasOwnPawn[scratchBase + s] = nifu);
    }

    const isSente = teban == SENTE;
    for (let type = FU; type <= HI; type++) {
      const koma = type | teban;
      if (unchecked(hand[koma]) <= 0) continue;

      for (let suji = 0x10; suji <= 0x90; suji += 0x10) {
        const s = suji >> 4;
        // Nifu (double pawn) restriction — precomputed.
        if (type == FU && unchecked(dropSujiHasOwnPawn[scratchBase + s])) continue;

        const bits = unchecked(dropEmptyBits[scratchBase + s]);
        if (bits == 0) continue;

        for (let dan = 1; dan <= 9; dan++) {
          // Only empty squares are drop targets.
          if ((bits & (1 << dan)) == 0) continue;

          // Knight drop rank restrictions.
          if (type == KE) {
            if (isSente && dan <= 2) continue;
            if (!isSente && dan >= 8) continue;
          }
          // Pawn / lance drop rank restrictions.
          if (type == FU || type == KY) {
            if (isSente && dan == 1) continue;
            if (!isSente && dan == 9) continue;
          }

          const to = suji + dan;

          // Pawn drop checkmate (uchifuzume) is illegal.
          if (type == FU && isUtiFuDume(to, ply + 1)) continue;

          unchecked(moveBuf[base + n] = encodeMove(koma, 0, to, false, EMPTY));
          n++;
        }
      }
    }
  }

  return n;
}

// ---------------------------------------------------------------------------
// Perft
// ---------------------------------------------------------------------------

function perftRec(depth: i32, ply: i32): i32 {
  const n = generateMoves(ply);
  const base = ply * MAX_MOVES;
  const mover = teban;
  const enemy = mover == SENTE ? GOTE : SENTE;
  let count: i32 = 0;

  for (let i = 0; i < n; i++) {
    const m = unchecked(moveBuf[base + i]);
    makeMove(m);
    // Lazy legality: reject moves leaving own king in check (王手放置).
    if (isKingInCheck(mover)) {
      unmakeMove(m);
      continue;
    }
    if (depth <= 1) {
      count++;
    } else {
      teban = enemy;
      count += perftRec(depth - 1, ply + 1);
      teban = mover;
    }
    unmakeMove(m);
  }

  return count;
}

/** Count legal move sequences of length `depth` from the current position. */
export function perft(depth: i32): i32 {
  if (depth <= 0) return 1;
  return perftRec(depth, 0);
}

// ---------------------------------------------------------------------------
// PSQT (port of KyokumenImproved.initializePsqt / psqtValue)
//
// Tables are defined from SENTE's perspective; for GOTE pieces the rank is
// mirrored (dan' = 10 - dan) and the sign flipped — exactly like the JS code.
// Layout: PSQT[type * 81 + (dan - 1) * 9 + (suji - 1)], types 0/13 stay zero.
// ---------------------------------------------------------------------------

const PSQT = new StaticArray<i32>(16 * 81);

// Rank bonus arrays indexed by dan (1..9), SENTE perspective (index 0 unused).
const PAWN_RANK = StaticArray.fromArray<i32>([0, 0, 18, 16, 14, 12, 10, 6, 2, 0]);
const LANCE_RANK = StaticArray.fromArray<i32>([0, 0, 14, 12, 10, 8, 6, 4, 2, 0]);
const KNIGHT_RANK = StaticArray.fromArray<i32>([0, 0, 0, 10, 14, 16, 14, 10, 4, 0]);
const SILVER_RANK = StaticArray.fromArray<i32>([0, 0, 6, 10, 12, 14, 16, 14, 10, 0]);
const GOLD_RANK = StaticArray.fromArray<i32>([0, 0, 2, 4, 6, 8, 10, 12, 14, 16]);
const GOLD_LIKE_ADVANCED = StaticArray.fromArray<i32>([0, 0, 18, 16, 14, 12, 10, 8, 6, 4]);

function absI(x: i32): i32 {
  return x < 0 ? -x : x;
}

function minI(a: i32, b: i32): i32 {
  return a < b ? a : b;
}

function maxI(a: i32, b: i32): i32 {
  return a > b ? a : b;
}

function initPsqtTables(): void {
  for (let dan = 1; dan <= 9; dan++) {
    for (let suji = 1; suji <= 9; suji++) {
      const idx = (dan - 1) * 9 + (suji - 1);
      const cf = 4 - absI(suji - 5); // centerFile: 0..4
      const cr = 4 - absI(dan - 5);  // centerRank: 0..4

      unchecked(PSQT[FU * 81 + idx] = unchecked(PAWN_RANK[dan]) + cf);
      unchecked(PSQT[KY * 81 + idx] = unchecked(LANCE_RANK[dan]) + cf);
      unchecked(PSQT[KE * 81 + idx] = unchecked(KNIGHT_RANK[dan]) + cf * 2);
      unchecked(PSQT[GI * 81 + idx] = unchecked(SILVER_RANK[dan]) + cf);
      unchecked(PSQT[KI * 81 + idx] = unchecked(GOLD_RANK[dan]) + cf);

      unchecked(PSQT[KA * 81 + idx] = cf * 3 + cr * 3);
      unchecked(PSQT[HI * 81 + idx] = cf * 2 + cr * 2);

      const distFromCenter = absI(suji - 5) + absI(dan - 5);
      const home = dan >= 8 ? 4 : 0;
      unchecked(PSQT[OU * 81 + idx] = minI(18, distFromCenter * 2 + home));

      const goldLike = unchecked(GOLD_LIKE_ADVANCED[dan]) + cf;
      unchecked(PSQT[TO * 81 + idx] = goldLike);
      unchecked(PSQT[NY * 81 + idx] = goldLike);
      unchecked(PSQT[NK * 81 + idx] = goldLike);
      unchecked(PSQT[NG * 81 + idx] = goldLike);

      unchecked(PSQT[UM * 81 + idx] = 6 + cf * 3 + cr * 3);
      unchecked(PSQT[RY * 81 + idx] = 6 + cf * 3 + cr * 3);
    }
  }
}
initPsqtTables();

/** Port of KyokumenImproved.psqtValue (SENTE-positive). */
function psqtValue(koma: i32, pos: i32): i32 {
  if (koma == EMPTY || koma == WALL) return 0;
  const suji = pos >> 4;
  const dan0 = pos & 0x0f;
  if (suji < 1 || suji > 9 || dan0 < 1 || dan0 > 9) return 0;

  const type = koma & 0x0f;
  const isS = (koma & SENTE) != 0;
  const dan = isS ? dan0 : 10 - dan0;
  const idx = (dan - 1) * 9 + (suji - 1);
  const v = unchecked(PSQT[type * 81 + idx]);
  return isS ? v : -v;
}

// ---------------------------------------------------------------------------
// Evaluation (full port of KyokumenImproved.evaluateV3 and its terms)
// ---------------------------------------------------------------------------

// Fixed-point scale: 1.0 === 1 << EVAL_V3_SHIFT (128).
const EVAL_V3_SHIFT: i32 = 7;
const EVAL_V3_HALF: i32 = 1 << (EVAL_V3_SHIFT - 1);

// Phase buckets indexed 0=endgame ... 3=opening (by total captured pieces in hand).
const EVAL_V3_PSQT_W = StaticArray.fromArray<i32>([96, 112, 128, 160]);
const EVAL_V3_CASTLE_W = StaticArray.fromArray<i32>([32, 64, 96, 128]);
const EVAL_V3_FILE_DEFENSE_W = StaticArray.fromArray<i32>([32, 64, 96, 128]);
const EVAL_V3_PROMO_THREAT_W = StaticArray.fromArray<i32>([64, 96, 112, 128]);

/**
 * Port of KyokumenImproved.scaleEvalV3: `Math.imul(value, weight)` == wrapping
 * i32 multiply, then symmetric rounding so negative values don't bias toward 0.
 */
function scaleEvalV3(value: i32, weight: i32): i32 {
  const product = value * weight;
  return product >= 0
    ? (product + EVAL_V3_HALF) >> EVAL_V3_SHIFT
    : (product - EVAL_V3_HALF) >> EVAL_V3_SHIFT;
}

/** Board access by (suji, dan) with WALL for out-of-board — port of getAt. */
function getAt(suji: i32, dan: i32): i32 {
  if (suji < 1 || suji > 9 || dan < 1 || dan > 9) return WALL;
  return unchecked(ban[(suji << 4) + dan]);
}

/** Port of totalHandPieces: JS loops SFU..GRY (indices past GHI are 0). */
function totalHandPieces(): i32 {
  let total = 0;
  for (let koma = SENTE + FU; koma <= MAX_BAN_KOMA; koma++) {
    total += unchecked(hand[koma]);
  }
  return total;
}

// --- evaluateHandBonus ------------------------------------------------------

const HAND_BONUS_BY_TYPE = StaticArray.fromArray<i32>([
  0, 15, 60, 70, 110, 130, 220, 260, 0, 0, 0, 0, 0, 0, 0, 0,
]);

function evaluateHandBonus(): i32 {
  let score = 0;
  for (let koma = SENTE + FU; koma <= SENTE + HI; koma++) {
    const count = unchecked(hand[koma]);
    if (count == 0) continue;
    score += unchecked(HAND_BONUS_BY_TYPE[koma & 0x0f]) * count;
  }
  for (let koma = GOTE + FU; koma <= GOTE + HI; koma++) {
    const count = unchecked(hand[koma]);
    if (count == 0) continue;
    score -= unchecked(HAND_BONUS_BY_TYPE[koma & 0x0f]) * count;
  }
  return score;
}

// --- king safety v2 ---------------------------------------------------------

const KS2_DEFENDER_WEIGHT = StaticArray.fromArray<i32>([
  0, 10, 18, 16, 24, 32, 14, 16, 0, 30, 26, 26, 26, 0, 18, 18,
]);

const KS2_ENEMY_ADJ_PENALTY = StaticArray.fromArray<i32>([
  0, 10, 16, 16, 24, 28, 24, 24, 0, 22, 22, 22, 22, 0, 24, 26,
]);

const KS2_DANGER_BY_KOMASHU = StaticArray.fromArray<i32>([
  0, 6, 10, 12, 16, 18, 22, 26, 0, 14, 12, 12, 12, 0, 26, 30,
]);

function enemyProximityDanger(side: i32, kingSuji: i32, kingDan: i32): i32 {
  let danger = 0;
  for (let ds = -2; ds <= 2; ds++) {
    for (let dd = -2; dd <= 2; dd++) {
      if (ds == 0 && dd == 0) continue;
      const p = getAt(kingSuji + ds, kingDan + dd);
      if (p == EMPTY || p == WALL) continue;
      if (isSelf(side, p)) continue;
      danger += unchecked(KS2_DANGER_BY_KOMASHU[p & 0x0f]);
    }
  }
  return danger;
}

function evaluateOneKingSafetyV2(side: i32, kingPos: i32, phase: f64): i32 {
  const suji = kingPos >> 4;
  const dan = kingPos & 0x0f;

  let shelter = 0;

  // 1) Immediate 3x3 shelter around the king.
  for (let dSuji = -1; dSuji <= 1; dSuji++) {
    for (let dDan = -1; dDan <= 1; dDan++) {
      if (dSuji == 0 && dDan == 0) continue;
      const p = getAt(suji + dSuji, dan + dDan);
      if (p == WALL) continue;
      if (p == EMPTY) {
        shelter -= 5;
        continue;
      }
      const komashu = p & 0x0f;
      if (isSelf(side, p)) shelter += unchecked(KS2_DEFENDER_WEIGHT[komashu]);
      else shelter -= unchecked(KS2_ENEMY_ADJ_PENALTY[komashu]);
    }
  }

  // 2) Pawn-shield / forward shelter (1 and 2 squares ahead).
  const forward = side == SENTE ? -1 : 1;
  for (let dSuji = -1; dSuji <= 1; dSuji++) {
    const p1 = getAt(suji + dSuji, dan + forward);
    const p2 = getAt(suji + dSuji, dan + forward * 2);
    if (p1 == WALL) continue;

    if ((p1 == EMPTY || p1 == WALL) && (p2 == EMPTY || p2 == WALL)) {
      shelter -= 5;
      continue;
    }

    const pawn1 = p1 != WALL && p1 != EMPTY && isSelf(side, p1) && (p1 & 0x0f) == FU;
    const pawn2 = p2 != WALL && p2 != EMPTY && isSelf(side, p2) && (p2 & 0x0f) == FU;
    if (pawn2) shelter += 12;
    else if (pawn1) shelter += 6;

    if (p1 != WALL && p1 != EMPTY && !isSelf(side, p1)) shelter -= 10;
    if (p2 != WALL && p2 != EMPTY && !isSelf(side, p2)) shelter -= 6;
  }

  // 3) Phase-aware castle-progress incentive with diminishing returns.
  const distFromCenter = absI(suji - 5) + absI(dan - 5);

  let homeCamp = 0;
  if (side == SENTE) {
    if (dan >= 8) homeCamp += 12;
    if (dan == 9) homeCamp += 10;
  } else {
    if (dan <= 2) homeCamp += 12;
    if (dan == 1) homeCamp += 10;
  }

  const edgeDist = minI(suji - 1, 9 - suji);
  const edgeBonus = maxI(0, 4 - edgeDist) * 4;

  const progressRaw = distFromCenter * 2 + homeCamp + edgeBonus;
  const progress = minI(progressRaw, 60);

  // 4) Urgency override.
  const danger = enemyProximityDanger(side, suji, dan);
  const progressFactor: f64 = danger >= 70 ? 0.15 : danger >= 45 ? 0.4 : 1.0;

  // f64 product + Math.round, same expression/association as JS for bit parity.
  shelter += <i32>Math.round(<f64>progress * phase * progressFactor);
  shelter -= minI(danger, 160);

  if (shelter > 220) shelter = 220;
  if (shelter < -220) shelter = -220;
  return shelter;
}

function evaluateKingSafetyV2WithPhase(phase: f64): i32 {
  if (kingS <= 0) return -50_000;
  if (kingG <= 0) return 50_000;
  return (
    evaluateOneKingSafetyV2(SENTE, kingS, phase) -
    evaluateOneKingSafetyV2(GOTE, kingG, phase)
  );
}

// --- castle shapes ----------------------------------------------------------

function castleAt(side: i32, sujiSente: i32, danSente: i32): i32 {
  const suji = side == SENTE ? sujiSente : 10 - sujiSente;
  const dan = side == SENTE ? danSente : 10 - danSente;
  return get((suji << 4) + dan);
}

function castleHas(side: i32, sujiSente: i32, danSente: i32, type: i32): bool {
  const p = castleAt(side, sujiSente, danSente);
  return p != EMPTY && p != WALL && isSelf(side, p) && (p & 0x0f) == type;
}

function castleScoreForSide(side: i32, kingPos: i32): i32 {
  if (kingPos <= 0) return 0;

  const kingSuji = kingPos >> 4;
  const kingDan = kingPos & 0x0f;
  const ks = side == SENTE ? kingSuji : 10 - kingSuji;
  const kd = side == SENTE ? kingDan : 10 - kingDan;

  let anaguma = 0;
  if (ks == 9 && kd == 9) anaguma = 90;
  else if (ks == 8 && kd == 9) anaguma = 55;
  else if (ks == 9 && kd == 8) anaguma = 45;
  if (anaguma != 0) {
    if (castleHas(side, 8, 9, KI)) anaguma += 40;
    if (castleHas(side, 9, 8, KI)) anaguma += 40;
    if (castleHas(side, 8, 8, GI)) anaguma += 25;
  }

  let mino = 0;
  if (ks == 8 && kd == 8) mino = 70;
  else if (ks == 9 && kd == 8) mino = 60;
  if (mino != 0) {
    if (castleHas(side, 7, 8, KI)) mino += 35;
    if (castleHas(side, 8, 9, KI)) mino += 30;
    if (castleHas(side, 7, 9, GI)) mino += 20;
  }

  let yagura = 0;
  if (ks == 7 && kd == 8) yagura = 65;
  else if (ks == 7 && kd == 9) yagura = 50;
  if (yagura != 0) {
    if (castleHas(side, 6, 8, KI)) yagura += 35;
    if (castleHas(side, 7, 9, KI)) yagura += 30;
    if (castleHas(side, 7, 7, GI)) yagura += 20;
  }

  return maxI(anaguma, maxI(mino, yagura));
}

function evaluateCastleShapes(): i32 {
  return castleScoreForSide(SENTE, kingS) - castleScoreForSide(GOTE, kingG);
}

// --- major piece activity ---------------------------------------------------

function countSlidingMobility1(suji: i32, dan: i32, ds: i32, dd: i32): i32 {
  let count = 0;
  for (let step = 1; step <= 8; step++) {
    const p = getAt(suji + ds * step, dan + dd * step);
    if (p == WALL) break;
    if (p != EMPTY) {
      // Can "see" the first occupied square (capture influence), then stop.
      count++;
      break;
    }
    count++;
  }
  return count;
}

function countAdjacentMobility1(suji: i32, dan: i32, ds: i32, dd: i32): i32 {
  const p = getAt(suji + ds, dan + dd);
  return p == EMPTY ? 1 : 0;
}

function lineToKingBonusRookLike(suji: i32, dan: i32, kingSuji: i32, kingDan: i32): i32 {
  // Same file
  if (suji == kingSuji) {
    const step = dan < kingDan ? 1 : -1;
    let blockers = 0;
    for (let d = dan + step; d != kingDan; d += step) {
      if (getAt(suji, d) != EMPTY) blockers++;
      if (blockers > 1) break;
    }
    if (blockers == 0) return 35;
    if (blockers == 1) return 15;
  }

  // Same rank
  if (dan == kingDan) {
    const step = suji < kingSuji ? 1 : -1;
    let blockers = 0;
    for (let s = suji + step; s != kingSuji; s += step) {
      if (getAt(s, dan) != EMPTY) blockers++;
      if (blockers > 1) break;
    }
    if (blockers == 0) return 25;
    if (blockers == 1) return 12;
  }

  return 0;
}

function lineToKingBonusBishopLike(suji: i32, dan: i32, kingSuji: i32, kingDan: i32): i32 {
  const dS = kingSuji - suji;
  const dD = kingDan - dan;
  if (absI(dS) != absI(dD) || dS == 0) return 0;

  const stepS = dS > 0 ? 1 : -1;
  const stepD = dD > 0 ? 1 : -1;
  let blockers = 0;
  const n = absI(dS);
  for (let i = 1; i < n; i++) {
    if (getAt(suji + stepS * i, dan + stepD * i) != EMPTY) blockers++;
    if (blockers > 1) break;
  }
  if (blockers == 0) return 28;
  if (blockers == 1) return 12;
  return 0;
}

function evaluateMajorPieceActivity(): i32 {
  let score = 0;

  const kingSujiG = kingG >> 4;
  const kingDanG = kingG & 0x0f;
  const kingSujiS = kingS >> 4;
  const kingDanS = kingS & 0x0f;

  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const p = getAt(suji, dan);
      if (p == EMPTY || p == WALL) continue;

      const komashu = p & 0x0f;
      const isS = (p & SENTE) != 0;

      // Rook / Dragon
      if (komashu == HI || komashu == RY) {
        const mobility =
          countSlidingMobility1(suji, dan, 1, 0) +
          countSlidingMobility1(suji, dan, -1, 0) +
          countSlidingMobility1(suji, dan, 0, 1) +
          countSlidingMobility1(suji, dan, 0, -1);
        const lineBonus = isS
          ? lineToKingBonusRookLike(suji, dan, kingSujiG, kingDanG)
          : lineToKingBonusRookLike(suji, dan, kingSujiS, kingDanS);

        const base = mobility * 6 + lineBonus;
        score += isS ? base : -base;

        if (komashu == RY) {
          const diagAdj =
            countAdjacentMobility1(suji, dan, 1, 1) +
            countAdjacentMobility1(suji, dan, 1, -1) +
            countAdjacentMobility1(suji, dan, -1, 1) +
            countAdjacentMobility1(suji, dan, -1, -1);
          const extra = diagAdj * 3;
          score += isS ? extra : -extra;
        }
        continue;
      }

      // Bishop / Horse
      if (komashu == KA || komashu == UM) {
        const mobility =
          countSlidingMobility1(suji, dan, 1, 1) +
          countSlidingMobility1(suji, dan, 1, -1) +
          countSlidingMobility1(suji, dan, -1, 1) +
          countSlidingMobility1(suji, dan, -1, -1);
        const lineBonus = isS
          ? lineToKingBonusBishopLike(suji, dan, kingSujiG, kingDanG)
          : lineToKingBonusBishopLike(suji, dan, kingSujiS, kingDanS);

        const base = mobility * 5 + lineBonus;
        score += isS ? base : -base;

        if (komashu == UM) {
          const orthoAdj =
            countAdjacentMobility1(suji, dan, 1, 0) +
            countAdjacentMobility1(suji, dan, -1, 0) +
            countAdjacentMobility1(suji, dan, 0, 1) +
            countAdjacentMobility1(suji, dan, 0, -1);
          const extra = orthoAdj * 3;
          score += isS ? extra : -extra;
        }
      }
    }
  }

  return score;
}

// --- file defense -----------------------------------------------------------

function senteHasType(suji: i32, dan: i32, type: i32): bool {
  const p = getAt(suji, dan);
  return (p & SENTE) != 0 && (p & 0x0f) == type;
}

function goteHasType(suji: i32, dan: i32, type: i32): bool {
  const p = getAt(suji, dan);
  return (p & GOTE) != 0 && (p & 0x0f) == type;
}

function evaluateFileDefense(): i32 {
  let score = 0;

  // === GOTE's 2-file defense (against SENTE's attack) ===
  const sentePawnOn26 = senteHasType(2, 6, FU);
  const sentePawnOn25 = senteHasType(2, 5, FU);
  const sentePawnOn24 = senteHasType(2, 4, FU);

  const goteBishopOn33 = goteHasType(3, 3, KA);
  const goteGoldOn32 = goteHasType(3, 2, KI);
  const gotePawnOn23 = goteHasType(2, 3, FU);
  const goteBishopOn22 = goteHasType(2, 2, KA);

  const goteBishopMissing = !goteBishopOn33 && !goteBishopOn22;

  const senteAttacking = sentePawnOn26 || sentePawnOn25 || sentePawnOn24;

  if (senteAttacking) {
    if (goteBishopOn33) {
      score -= 200;
    } else if (goteGoldOn32 && gotePawnOn23) {
      score -= 150;
    } else {
      if (sentePawnOn24) {
        if (!gotePawnOn23) {
          score += 1000;
        } else {
          score += 500;
        }
      } else if (sentePawnOn25) {
        score += 600;
      } else if (sentePawnOn26) {
        score += 150;
      }

      if (goteBishopMissing && !goteBishopOn22) {
        score += 250;
      }
    }

    if (goteBishopOn22 && (sentePawnOn25 || sentePawnOn24)) {
      score += 300;
    }
  }

  // === SENTE's 8-file defense (against GOTE's attack) ===
  const gotePawnOn84 = goteHasType(8, 4, FU);
  const gotePawnOn85 = goteHasType(8, 5, FU);
  const gotePawnOn86 = goteHasType(8, 6, FU);

  const senteBishopOn77 = senteHasType(7, 7, KA);
  const senteGoldOn78 = senteHasType(7, 8, KI);
  const sentePawnOn87 = senteHasType(8, 7, FU);
  const senteBishopOn88 = senteHasType(8, 8, KA);

  const goteAttacking = gotePawnOn84 || gotePawnOn85 || gotePawnOn86;

  if (goteAttacking) {
    if (senteBishopOn77) {
      score += 200;
    } else if (senteGoldOn78 && sentePawnOn87) {
      score += 150;
    } else {
      if (gotePawnOn86) {
        if (!sentePawnOn87) {
          score -= 1000;
        } else {
          score -= 500;
        }
      } else if (gotePawnOn85) {
        score -= 600;
      } else if (gotePawnOn84) {
        score -= 150;
      }
    }

    if (senteBishopOn88 && (gotePawnOn85 || gotePawnOn86)) {
      score -= 300;
    }
  }

  return score;
}

// --- climbing silver (棒銀) pressure ----------------------------------------

/** Positive result = SENTE's climbing silver is dangerous for GOTE. */
function climbingSilverPenaltyAgainstGote(): i32 {
  let rookOnFile = false;
  for (let dan = 5; dan <= 9; dan++) {
    const p = getAt(2, dan);
    if (p != EMPTY && (p & SENTE) != 0 && (p & 0x0f) == HI) {
      rookOnFile = true;
      break;
    }
  }
  if (!rookOnFile) return 0;

  // Silver march level: 1 = approaching (dan 7), 2 = one step out (dan 6),
  // 3 = on the 5th rank, 4 = broken into GOTE's half (dan 3-4).
  let silverLevel = 0;
  let silverOnEdgeApproach = false; // silver on 2六/1六
  for (let suji = 1; suji <= 3; suji++) {
    for (let dan = 1; dan <= 7; dan++) {
      const p = getAt(suji, dan);
      if (p == EMPTY || (p & SENTE) == 0 || (p & 0x0f) != GI) continue;
      const level = dan == 7 ? 1 : dan == 6 ? 2 : dan == 5 ? 3 : 4;
      if (level > silverLevel) silverLevel = level;
      if (dan == 6 && suji <= 2) silverOnEdgeApproach = true;
    }
  }
  if (silverLevel == 0) return 0;

  const bishop33 = goteHasType(3, 3, KA);
  const silver22 = goteHasType(2, 2, GI);
  const silver23 = goteHasType(2, 3, GI);
  const silver33 = goteHasType(3, 3, GI);
  const gold32 = goteHasType(3, 2, KI);
  const pawn23 = goteHasType(2, 3, FU);
  const pawn14 = goteHasType(1, 4, FU);

  const strongCover = bishop33 || silver23 || silver33;
  const backup23 = silver22 || gold32;

  let penalty = 0;
  if (silverLevel >= 2) {
    if (strongCover && backup23) penalty -= 220;
    else if (strongCover) penalty -= 120;
    else if (backup23 && pawn23) penalty += 140;
    else penalty += 320;
  } else {
    if (!strongCover && !backup23) penalty += 90;
    else if (strongCover) penalty -= 40;
  }

  if (silverLevel >= 3) {
    penalty += strongCover ? 120 : 260;
  }

  if (silverLevel >= 4) {
    penalty += strongCover ? 180 : 320;
  }

  if (silverOnEdgeApproach) {
    penalty += pawn14 ? -70 : 80;
  }

  return penalty;
}

/** Positive result = GOTE's climbing silver is dangerous for SENTE. */
function climbingSilverPenaltyAgainstSente(): i32 {
  let rookOnFile = false;
  for (let dan = 1; dan <= 5; dan++) {
    const p = getAt(8, dan);
    if (p != EMPTY && (p & GOTE) != 0 && (p & 0x0f) == HI) {
      rookOnFile = true;
      break;
    }
  }
  if (!rookOnFile) return 0;

  let silverLevel = 0;
  let silverOnEdgeApproach = false; // silver on 8四/9四
  for (let suji = 7; suji <= 9; suji++) {
    for (let dan = 3; dan <= 9; dan++) {
      const p = getAt(suji, dan);
      if (p == EMPTY || (p & GOTE) == 0 || (p & 0x0f) != GI) continue;
      const level = dan == 3 ? 1 : dan == 4 ? 2 : dan == 5 ? 3 : 4;
      if (level > silverLevel) silverLevel = level;
      if (dan == 4 && suji >= 8) silverOnEdgeApproach = true;
    }
  }
  if (silverLevel == 0) return 0;

  const bishop77 = senteHasType(7, 7, KA);
  const silver88 = senteHasType(8, 8, GI);
  const silver87 = senteHasType(8, 7, GI);
  const silver77 = senteHasType(7, 7, GI);
  const gold78 = senteHasType(7, 8, KI);
  const pawn87 = senteHasType(8, 7, FU);
  const pawn96 = senteHasType(9, 6, FU);

  const strongCover = bishop77 || silver87 || silver77;
  const backup87 = silver88 || gold78;

  let penalty = 0;
  if (silverLevel >= 2) {
    if (strongCover && backup87) penalty -= 220;
    else if (strongCover) penalty -= 120;
    else if (backup87 && pawn87) penalty += 140;
    else penalty += 320;
  } else {
    if (!strongCover && !backup87) penalty += 90;
    else if (strongCover) penalty -= 40;
  }

  if (silverLevel >= 3) {
    penalty += strongCover ? 120 : 260;
  }

  if (silverLevel >= 4) {
    penalty += strongCover ? 180 : 320;
  }

  if (silverOnEdgeApproach) {
    penalty += pawn96 ? -70 : 80;
  }

  return penalty;
}

function evaluateClimbingSilverPressure(): i32 {
  return climbingSilverPenaltyAgainstGote() - climbingSilverPenaltyAgainstSente();
}

// --- promotion threats ------------------------------------------------------

function evaluatePromotionThreats(): i32 {
  let score = 0;

  // SENTE pieces about to promote in GOTE territory (dan 1-3).
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 4; dan <= 6; dan++) {
      const piece = getAt(suji, dan);
      if (piece == EMPTY || piece == WALL) continue;

      if ((piece & SENTE) != 0) {
        const komashu = piece & 0x0f;
        if (komashu == HI || komashu == KA) {
          let pathClear = true;
          for (let checkDan = dan - 1; checkDan >= 1; checkDan--) {
            const blocking = getAt(suji, checkDan);
            if (blocking != EMPTY) {
              if ((blocking & SENTE) != 0) pathClear = false;
              break;
            }
          }
          if (pathClear) {
            score += 500;
          }
        }
      }
    }

    // SENTE major piece already in promotion zone (dan 1-3).
    for (let dan = 1; dan <= 3; dan++) {
      const piece = getAt(suji, dan);
      if (piece != EMPTY && (piece & SENTE) != 0) {
        const komashu = piece & 0x0f;
        if (komashu == HI || komashu == KA) {
          score += 800;
        } else if (komashu == RY || komashu == UM) {
          score += 350;
        }
      }
    }
  }

  // GOTE pieces about to promote in SENTE territory (dan 7-9).
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 4; dan <= 6; dan++) {
      const piece = getAt(suji, dan);
      if (piece == EMPTY || piece == WALL) continue;

      if ((piece & GOTE) != 0) {
        const komashu = piece & 0x0f;
        if (komashu == HI || komashu == KA) {
          let pathClear = true;
          for (let checkDan = dan + 1; checkDan <= 9; checkDan++) {
            const blocking = getAt(suji, checkDan);
            if (blocking != EMPTY) {
              if ((blocking & GOTE) != 0) pathClear = false;
              break;
            }
          }
          if (pathClear) {
            score -= 500;
          }
        }
      }
    }

    // GOTE major piece already in promotion zone (dan 7-9).
    for (let dan = 7; dan <= 9; dan++) {
      const piece = getAt(suji, dan);
      if (piece != EMPTY && (piece & GOTE) != 0) {
        const komashu = piece & 0x0f;
        if (komashu == HI || komashu == KA) {
          score -= 800;
        } else if (komashu == RY || komashu == UM) {
          score -= 350;
        }
      }
    }
  }

  return score;
}

// --- evaluateV3 -------------------------------------------------------------

/**
 * Full port of KyokumenImproved.evaluateV3() (SENTE-positive), integer-identical
 * to the JS engine on any position. Read-only: does not modify position state.
 */
export function evaluateV3(): i32 {
  let score = evalMaterial;

  // Phase proxy: total number of captured pieces in both hands.
  const handTotal = totalHandPieces();
  const phaseBucket = handTotal <= 2 ? 3 : handTotal <= 6 ? 2 : handTotal <= 10 ? 1 : 0;
  const phase: f64 = handTotal <= 2 ? 1.0 : handTotal <= 6 ? 0.7 : handTotal <= 10 ? 0.45 : 0.25;

  score += scaleEvalV3(psqtEval, unchecked(EVAL_V3_PSQT_W[phaseBucket]));
  score += evaluateHandBonus();
  score += evaluateKingSafetyV2WithPhase(phase);
  score += scaleEvalV3(evaluateCastleShapes(), unchecked(EVAL_V3_CASTLE_W[phaseBucket]));
  score += evaluateMajorPieceActivity();

  score += scaleEvalV3(
    evaluateFileDefense() + evaluateClimbingSilverPressure(),
    unchecked(EVAL_V3_FILE_DEFENSE_W[phaseBucket])
  );
  score += scaleEvalV3(
    evaluatePromotionThreats(),
    unchecked(EVAL_V3_PROMO_THREAT_W[phaseBucket])
  );

  return score;
}

// --- hanging-piece threat (port of ShogiAIImprovedV20.hangingThreatSente) ----

/** Sentinel for "no attacker" — plays the role of JS Infinity. */
const NO_ATTACKER: i32 = 0x7fffffff;

/**
 * Port of GenerateMovesImproved.getLeastAttackerValue: the absolute material
 * value of the least valuable *enemy* attacker of `target` (`defender` owns the
 * piece on `target`), or NO_ATTACKER if the square is not attacked.
 */
function getLeastAttackerValue(target: i32, defender: i32): i32 {
  let best = NO_ATTACKER;

  // Direct attacks (non-sliding).
  for (let direct = 0; direct < 12; direct++) {
    const pos = target - unchecked(DIFF[direct]);
    const koma = get(pos);
    if (isEnemy(defender, koma) && unchecked(CAN_MOVE[(direct << 6) + koma]) != 0) {
      const value = absI(unchecked(KOMA_VALUE[koma]));
      if (value < best) best = value;
    }
  }

  // Sliding attacks (rook/bishop/lance and promoted variants).
  for (let direct = 0; direct < 8; direct++) {
    const d = unchecked(DIFF[direct]);
    let pos = target - d;
    let koma = get(pos);
    while (koma != WALL) {
      if (isSelf(defender, koma)) break;
      if (isEnemy(defender, koma)) {
        if (unchecked(CAN_JUMP[(direct << 6) + koma]) != 0) {
          const value = absI(unchecked(KOMA_VALUE[koma]));
          if (value < best) best = value;
        }
        break;
      }
      pos -= d;
      koma = get(pos);
    }
  }

  return best;
}

/**
 * Port of ShogiAIImprovedV20.hangingThreatSente (SENTE-positive): charges each
 * side ~1/3 of the value of its single most valuable hanging piece (silver and
 * up, attacked AND undefended only, loss capped at 700).
 */
export function hangingThreat(): i32 {
  let worstSente = 0;
  let worstGote = 0;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      const p = unchecked(ban[pos]);
      if (p == EMPTY) continue;
      const type = p & 0x0f;
      if (type == OU) continue;
      const value = absI(unchecked(KOMA_VALUE[p]));
      if (value < 1000) continue; // only silver and up

      const side = (p & SENTE) != 0 ? SENTE : GOTE;
      const attacker = getLeastAttackerValue(pos, side);
      if (attacker == NO_ATTACKER) continue;

      const defender = getLeastAttackerValue(pos, side == SENTE ? GOTE : SENTE);
      // Only truly hanging pieces (attacked and undefended) count.
      if (defender != NO_ATTACKER) continue;
      const loss = minI(value, 700);

      if (side == SENTE) {
        if (loss > worstSente) worstSente = loss;
      } else if (loss > worstGote) {
        worstGote = loss;
      }
    }
  }
  // JS: ((worstGote - worstSente) / 3) | 0 — i32 division truncates toward zero
  // exactly like the JS `| 0` on the fractional quotient.
  return (worstGote - worstSente) / 3;
}

/**
 * evaluateV3 + hanging-piece threat — the exact leaf evaluation the V20 engine
 * uses in mode 'v3' (`k.evaluateV3() + hangingThreatSente(k)`), SENTE-positive.
 * This is what the phase-3 WASM search should call at leaves.
 */
export function evaluateV3Full(): i32 {
  return evaluateV3() + hangingThreat();
}

// ---------------------------------------------------------------------------
// NNUE-style neural evaluation (inference only)
//
// Mirrors the distillation net trained by ml/train.py and quantized by
// ml/export-weights.py:
//
//   input  : 2268 board one-hot features (28 planes x 81 squares, normalized
//            to the side-to-move perspective — the board is rotated 180° and
//            colors are swapped when GOTE is to move, exactly like
//            train.py parse_sfen) + 14 hand-count features (mine 7 / opp 7)
//   net    : 2282 -> 256 -> 32 -> 1, ClippedReLU
//   ints   : the exact integer pipeline of export-weights.py int_forward:
//              acc  = b1 + Σ w1_board[feat] + Σ w1_hand[i]*count[i]   (i32)
//              h1   = clamp(acc, 0, 127)
//              h2   = clamp((w2 @ h1 + b2) >> 6, 0, 127)
//              out_q = w3 @ h2 + b3          (= real_output * 127 * 64)
//              cp   = out_q * K / (127*64)   (K = sigmoid scale, default 600)
//
// Weights live in a static region of WASM memory with the weights.bin layout
// (int16/int32 little-endian, exactly as written by export-weights.py), so the
// host can memcpy the file into getNnueWeightsPtr() without any repacking:
//
//   [w1_board int16 x 2268*256]  (feature-major)
//   [w1_hand  int16 x 14*256]    (feature-major)
//   [b1       int32 x 256]
//   [w2       int16 x 32*256]    (row-major)
//   [b2       int32 x 32]
//   [w3       int16 x 32]
//   [b3       int32 x 1]
//
// setNnueEnabled(1) switches the search leaf evaluation from evaluateV3Full()
// to the NNUE net (same SENTE-positive sign convention at the leaf slot);
// the default (0) leaves the engine behavior completely unchanged.
// ---------------------------------------------------------------------------

const NNUE_H1: i32 = 256;
const NNUE_H2: i32 = 32;
const NNUE_BOARD_FEATS: i32 = 28 * 81; // 2268
const NNUE_HAND_FEATS: i32 = 14;
// Reduced-KP (King-Piece) feature set: the board/hand tables are repeated per
// own-king bucket (6 coarse king zones, see nnueKpBucket). weights.bin v2.
const NNUE_KP_BUCKETS: i32 = 6;

// Byte offsets into the weights blob (weights.bin layout). The layout shape is
// identical for both formats — only the w1 table sizes scale with the bucket
// count — so the offsets are mutable and recomputed by setNnueBuckets():
//   buckets=1 (original, 1,185,988 B) / buckets=6 (reduced KP, 7,027,908 B)
const NNUE_W1B_OFF: i32 = 0;
let nnueBuckets: i32 = 1;
let nnueW1hOff: i32 = NNUE_BOARD_FEATS * NNUE_H1 * 2; // 1,161,216 (buckets=1)
let nnueB1Off: i32 = 0;
let nnueW2Off: i32 = 0;
let nnueB2Off: i32 = 0;
let nnueW3Off: i32 = 0;
let nnueB3Off: i32 = 0;
let nnueTotalBytes: i32 = 0;

function nnueComputeLayout(buckets: i32): void {
  nnueBuckets = buckets;
  nnueW1hOff = NNUE_W1B_OFF + buckets * NNUE_BOARD_FEATS * NNUE_H1 * 2;
  nnueB1Off = nnueW1hOff + buckets * NNUE_HAND_FEATS * NNUE_H1 * 2;
  nnueW2Off = nnueB1Off + NNUE_H1 * 4;
  nnueB2Off = nnueW2Off + NNUE_H2 * NNUE_H1 * 2;
  nnueW3Off = nnueB2Off + NNUE_H2 * 4;
  nnueB3Off = nnueW3Off + NNUE_H2 * 2;
  nnueTotalBytes = nnueB3Off + 4;
}
nnueComputeLayout(1);

// Static, zero-initialized weight region sized for the LARGER (KP) format
// (memory.data only reserves zeroed memory — no data segment is emitted, so
// the .wasm binary does not grow). The host memcpys weights.bin here.
const NNUE_KP_TOTAL_BYTES: i32 =
  NNUE_KP_BUCKETS * (NNUE_BOARD_FEATS + NNUE_HAND_FEATS) * NNUE_H1 * 2 +
  NNUE_H1 * 4 + NNUE_H2 * NNUE_H1 * 2 + NNUE_H2 * 4 + NNUE_H2 * 2 + 4; // 7,027,908
const NNUE_WEIGHTS: usize = memory.data(NNUE_KP_TOTAL_BYTES, 8);

// Engine komashu (koma & 0x0f) -> train.py piece kind (0..13):
// [FU,KY,KE,GI,KI,KA,HI,OU,TO,NY,NK,NG,UM,RY]; slots 0 and 13 (unused) = -1.
const NNUE_KIND = StaticArray.fromArray<i32>([
  -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, -1, 12, 13,
]);

let nnueEnabled: bool = false;
let nnueScaleK: i32 = 600; // k_sigmoid from weights.meta.json (cp = out_q * K / 8128)
// Output rescale numer/denom applied on top of the cp conversion (default 1/1
// = plain centipawns). The search margins (ASPIRATION_WINDOW, futility, delta,
// RFP, ...) were tuned for evaluateV3Full, whose scale is ~3.7x the true cp
// scale (teacher fit: cp ~= 0.27*v3). Setting e.g. 37/10 maps NNUE cp output
// onto the V3 scale so every search constant keeps its intended strength.
let nnueOutNumer: i32 = 1;
let nnueOutDenom: i32 = 1;

// Scratch accumulator (reused; no allocation during search). The full
// recompute path builds layer 1 here; both paths clamp h1 into it before
// running layers 2/3.
const nnueAcc = new StaticArray<i32>(NNUE_H1);

// --- Differential first-layer accumulators ----------------------------------
//
// The 2268 board features are normalized to the SIDE-TO-MOVE perspective, so a
// teban flip rotates every feature. Like standard NNUE we therefore maintain
// TWO accumulators at all times:
//
//   nnueAccS[j] = b1[j] + Σ w1_board[feat as seen from SENTE] + hand terms
//   nnueAccG[j] = b1[j] + Σ w1_board[feat as seen from GOTE (board rotated
//                 180°, colors swapped)] + hand terms (GOTE hand = "mine")
//
// Both depend only on (ban, hand) — teban is NOT an input; at evaluation time
// it merely selects which accumulator feeds layers 2/3. (This also makes the
// search's null move free: it only flips teban, which no accumulator sees.)
//
// Hand features contribute weight*count, and every make/unmake changes a hand
// count by exactly ±1, so hand deltas are plain row add/subs too.
//
// LAZY APPLICATION: the search make/unmakes far more moves than it evaluates
// (lazy legality filtering, uchifuzume probes...), so makeMove does NOT touch
// the accumulators — it just pushes the move onto a pending stack (a few ns).
// The deltas are applied on demand when an evaluation actually happens, and
// unmakeMove inverts a delta only if it had been applied. A move's delta
// depends only on the move encoding (never on board state), so deferring it
// is exact. Make/unmake pairs with no evaluation in between cost nothing.
//
// The accumulators are rebuilt from scratch by setNnueEnabled(1) and by
// finalizePosition() (position load), so enable order vs. position setup does
// not matter as long as weights are loaded before searching.
const nnueAccS = new StaticArray<i32>(NNUE_H1);
const nnueAccG = new StaticArray<i32>(NNUE_H1);
// Scratch for nnueAccMismatch (fresh rebuild compared against the live accs).
const nnueChkS = new StaticArray<i32>(NNUE_H1);
const nnueChkG = new StaticArray<i32>(NNUE_H1);

// --- Reduced-KP king buckets -------------------------------------------------
//
// With the KP format (nnueBuckets > 1) every w1 row is additionally selected by
// the OWN KING's bucket in that perspective's frame. The bucket is cached per
// perspective as ready-to-add byte offsets (board table / hand table). A king
// move within its bucket is an ordinary feature delta; a king move that
// CROSSES a bucket boundary invalidates every feature of that perspective, so
// that accumulator is rebuilt from the live board instead ("refresh", the
// standard NNUE approach). Because deltas are applied lazily, a crossing found
// while folding pending moves simply switches to a rebuild at the current
// node, and a crossing found while unmaking an already-folded move marks the
// accumulator dirty (rebuilt on the next evaluation).
let nnueBktBoardOffS: i32 = 0; // bucketS * 2268 * 512  (bytes)
let nnueBktHandOffS: i32 = 0; //  bucketS * 14 * 512    (bytes)
let nnueBktBoardOffG: i32 = 0;
let nnueBktHandOffG: i32 = 0;
let nnueAccSDirty: bool = false;
let nnueAccGDirty: bool = false;

/**
 * Own-king bucket from stm-normalized (suji s, dan d), both 1..9 — must match
 * ml/train.py kp_bucket exactly:
 *   d<=7: 5 / d==8: s<=4 -> 3, s>=5 -> 4 / d==9: s==5 -> 0, s<=4 -> 1, s>=6 -> 2
 */
function nnueKpBucket(s: i32, d: i32): i32 {
  if (d <= 7) return 5;
  if (d == 8) return s <= 4 ? 3 : 4;
  if (s == 5) return 0;
  return s <= 4 ? 1 : 2;
}

/** Bucket of the SENTE king at board `pos`, SENTE frame. */
function nnueKpBucketS(pos: i32): i32 {
  return nnueKpBucket(pos >> 4, pos & 0x0f);
}

/** Bucket of the GOTE king at board `pos`, GOTE frame (board rotated 180°). */
function nnueKpBucketG(pos: i32): i32 {
  return nnueKpBucket(10 - (pos >> 4), 10 - (pos & 0x0f));
}

/** Does move m relocate the SENTE king across a bucket boundary? */
function nnueMoveCrossesS(m: i32): bool {
  if (nnueBuckets == 1) return false;
  if (((m >> 16) & 0x7f) != SOU) return false;
  const from = (m >> 8) & 0xff;
  if (from == 0) return false; // kings are never dropped
  return nnueKpBucketS(from) != nnueKpBucketS(m & 0xff);
}

/** Does move m relocate the GOTE king across a bucket boundary? */
function nnueMoveCrossesG(m: i32): bool {
  if (nnueBuckets == 1) return false;
  if (((m >> 16) & 0x7f) != GOU) return false;
  const from = (m >> 8) & 0xff;
  if (from == 0) return false;
  return nnueKpBucketG(from) != nnueKpBucketG(m & 0xff);
}

/** Refresh the cached bucket byte offsets from the live king positions. */
function nnueUpdateBucketS(): void {
  const b = nnueBuckets > 1 && kingS > 0 ? nnueKpBucketS(kingS) : 0;
  nnueBktBoardOffS = b * NNUE_BOARD_FEATS * NNUE_H1 * 2;
  nnueBktHandOffS = b * NNUE_HAND_FEATS * NNUE_H1 * 2;
}

function nnueUpdateBucketG(): void {
  const b = nnueBuckets > 1 && kingG > 0 ? nnueKpBucketG(kingG) : 0;
  nnueBktBoardOffG = b * NNUE_BOARD_FEATS * NNUE_H1 * 2;
  nnueBktHandOffG = b * NNUE_HAND_FEATS * NNUE_H1 * 2;
}

// Pending-move stack for the lazy application (moves made since the last
// rebuild). CAP is far beyond any reachable path (search MAX_PLY is 64 plus
// bounded uchifuzume scratch nesting); if it ever overflows, evaluation just
// falls back to the full recompute — never wrong, only slower.
// Each perspective tracks its own applied prefix: an evaluation only consults
// the side-to-move accumulator, so the other perspective's folding is deferred
// until (and unless) it is actually needed.
const NNUE_PEND_CAP: i32 = 256;
const nnuePendStack = new StaticArray<i32>(NNUE_PEND_CAP);
let nnuePendLen: i32 = 0; // moves made since the last rebuild (path depth)
let nnuePendAppliedS: i32 = 0; // prefix of the path folded into nnueAccS
let nnuePendAppliedG: i32 = 0; // prefix of the path folded into nnueAccG

let nnueForceFull: bool = false; // verification: bypass the accumulators
let nnueEvalCount: i32 = 0; // number of net forward passes (bench/report)

// Column-major transposed copy of w2 (w2t[j][i] = w2[i][j]) for the sparse
// layer-2 path: h1 is post-ClippedReLU so most entries are zero, and with a
// column-major layout the dot products only visit the nonzero activations.
// Rebuilt from the weight region by nnueRefreshAccumulators().
const NNUE_W2T: usize = memory.data(NNUE_H1 * NNUE_H2 * 2, 16);
// h1 packed to i16 lanes for the dense layer-2 dot products (nnueLayers23).
const NNUE_H1_I16: usize = memory.data(NNUE_H1 * 2, 16);

/** Pointer to the weight region; memcpy weights.bin here (layout-identical). */
export function getNnueWeightsPtr(): usize {
  return NNUE_WEIGHTS;
}

/** Size of the weight region in bytes (must equal weights.bin size). */
export function getNnueWeightsSize(): i32 {
  return nnueTotalBytes;
}

/**
 * Toggle the NNUE leaf evaluation (0 = evaluateV3Full, the default).
 * Clears the eval cache so values from the two eval functions never mix.
 */
export function setNnueEnabled(flag: i32): void {
  nnueEnabled = flag != 0;
  if (nnueEnabled) nnueRefreshAccumulators();
  initEvalCache();
}

/**
 * Select the weights.bin format: 1 = original board one-hot (default,
 * 1,185,988 B), 6 = reduced KP (7,027,908 B). Call BEFORE memcpying the
 * weights (the layout offsets change), then load the blob returned size.
 * Invalid bucket counts are ignored. Clears the eval cache; rebuilds the
 * accumulators if NNUE is enabled.
 */
export function setNnueBuckets(buckets: i32): void {
  if (buckets != 1 && buckets != NNUE_KP_BUCKETS) return;
  if (nnueBuckets == buckets) return;
  nnueComputeLayout(buckets);
  if (nnueEnabled) nnueRefreshAccumulators();
  initEvalCache();
}

/** Current weights format bucket count (1 = original, 6 = reduced KP). */
export function getNnueBuckets(): i32 {
  return nnueBuckets;
}

// |outQ| < 2^31, so keeping K * numer <= 2^32 (~4.0e9 with headroom) guarantees
// the i64 product in nnueEvaluateCp() cannot overflow. Both setters below
// enforce this against the CURRENT value of the other factor, so no ordering
// of setNnueScaleK/setNnueOutputScale calls can create an overflowing pair.
const NNUE_MAX_SCALE_PRODUCT: i64 = 4_000_000_000;

function nnueGcd(a: i32, b: i32): i32 {
  while (b != 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

/**
 * Set the sigmoid scale K used to convert out_q to centipawns (default 600).
 * Non-positive values and values that could overflow the i64 cp conversion
 * (see NNUE_MAX_SCALE_PRODUCT) are ignored.
 */
export function setNnueScaleK(k: i32): void {
  if (k <= 0 || <i64>k * <i64>nnueOutNumer > NNUE_MAX_SCALE_PRODUCT) return;
  if (nnueScaleK != k) {
    nnueScaleK = k;
    // Cached NNUE evaluations were computed with the old K; drop them.
    initEvalCache();
  }
}

/**
 * Set the NNUE output rescale as a rational numer/denom (default 1/1 = plain
 * centipawns, bit-identical to the previous behavior). Use 37/10 to map the
 * true-cp NNUE output onto the evaluateV3Full scale (~3.7x cp) that all the
 * search margin constants were tuned for. The fraction is reduced (same
 * rational, smaller operands); non-positive, > 1,000,000, or K-product-
 * overflowing arguments (see NNUE_MAX_SCALE_PRODUCT) are ignored.
 */
export function setNnueOutputScale(numer: i32, denom: i32): void {
  if (numer <= 0 || denom <= 0 || numer > 1_000_000 || denom > 1_000_000) return;
  const g = nnueGcd(numer, denom);
  numer = numer / g;
  denom = denom / g;
  if (<i64>nnueScaleK * <i64>numer > NNUE_MAX_SCALE_PRODUCT) return;
  if (nnueOutNumer != numer || nnueOutDenom != denom) {
    nnueOutNumer = numer;
    nnueOutDenom = denom;
    // Cached NNUE evaluations were computed with the old scale; drop them.
    initEvalCache();
  }
}

/**
 * Verification switch: with 1, nnueEvaluateCp() recomputes the net from
 * scratch (nnueEvaluate) even while NNUE is enabled, instead of using the
 * differential accumulators. Lets the harness run the exact same search twice
 * and compare fast vs full paths. Clears the eval cache like setNnueEnabled.
 */
export function setNnueForceFull(flag: i32): void {
  nnueForceFull = flag != 0;
  initEvalCache();
}

/** Cumulative count of NNUE forward passes (layers 2/3 runs). */
export function getNnueEvalCount(): i32 {
  return nnueEvalCount;
}

export function resetNnueEvalCount(): void {
  nnueEvalCount = 0;
}

// --- w1 row addressing (row = 256 int16 weights = 512 bytes) -----------------

/** Byte base of the w1 board-feature row for `koma` on `pos`, SENTE view. */
function nnueBoardRowS(koma: i32, pos: i32): usize {
  const kind = unchecked(NNUE_KIND[koma & 0x0f]);
  const plane = (koma & SENTE) != 0 ? kind : kind + 14;
  const feat = plane * 81 + ((pos >> 4) - 1) * 9 + ((pos & 0x0f) - 1);
  return NNUE_WEIGHTS + <usize>(NNUE_W1B_OFF + nnueBktBoardOffS + (feat << 9));
}

/** Same, GOTE view (board rotated 180°, colors swapped): s→10-s, d→10-d. */
function nnueBoardRowG(koma: i32, pos: i32): usize {
  const kind = unchecked(NNUE_KIND[koma & 0x0f]);
  const plane = (koma & GOTE) != 0 ? kind : kind + 14;
  const feat = plane * 81 + (9 - (pos >> 4)) * 9 + (9 - (pos & 0x0f));
  return NNUE_WEIGHTS + <usize>(NNUE_W1B_OFF + nnueBktBoardOffG + (feat << 9));
}

/**
 * Byte base of the w1 hand-feature row for `handKoma` (side|type), SENTE view:
 * rows 0..6 = the perspective owner's hand ("mine"), rows 7..13 = opponent.
 * (KP: rows live in the own-king bucket's segment, bucketS*14 + idx.)
 */
function nnueHandRowS(handKoma: i32): usize {
  const type = handKoma & 0x0f;
  const idx = (handKoma & SENTE) != 0 ? type - 1 : type + 6;
  return NNUE_WEIGHTS + <usize>(nnueW1hOff + nnueBktHandOffS + (idx << 9));
}

/** Same, GOTE view (GOTE hand = "mine"). */
function nnueHandRowG(handKoma: i32): usize {
  const type = handKoma & 0x0f;
  const idx = (handKoma & GOTE) != 0 ? type - 1 : type + 6;
  return NNUE_WEIGHTS + <usize>(nnueW1hOff + nnueBktHandOffG + (idx << 9));
}

/**
 * acc += (row at addBase) - (row at subBase), one fused SIMD pass: 8 i16
 * weights per iteration, sign-extended to 2x i32x4 lanes. Element-wise i32
 * adds/subs wrap exactly like the scalar version, so this stays bit-identical.
 */
function nnueRowSubAdd(acc: StaticArray<i32>, subBase: usize, addBase: usize): void {
  const accBase = changetype<usize>(acc);
  for (let j = 0; j < NNUE_H1; j += 8) {
    const off = <usize>(j << 1);
    const add8 = v128.load(addBase + off);
    const sub8 = v128.load(subBase + off);
    const aoff = <usize>(j << 2);
    v128.store(
      accBase + aoff,
      i32x4.add(
        v128.load(accBase + aoff),
        i32x4.sub(i32x4.extend_low_i16x8_s(add8), i32x4.extend_low_i16x8_s(sub8))
      )
    );
    v128.store(
      accBase + aoff,
      i32x4.add(
        v128.load(accBase + aoff, 16),
        i32x4.sub(i32x4.extend_high_i16x8_s(add8), i32x4.extend_high_i16x8_s(sub8))
      ),
      16
    );
  }
}

/**
 * acc += row * coef (coef is a hand count 0..18 or ±1, so it fits i16 and
 * every i16xi16 extmul product is exact — identical to the scalar i32 mul).
 */
function nnueRowAddScaled(acc: StaticArray<i32>, base: usize, coef: i32): void {
  const accBase = changetype<usize>(acc);
  const c8 = i16x8.splat(<i16>coef);
  for (let j = 0; j < NNUE_H1; j += 8) {
    const w8 = v128.load(base + (<usize>(j << 1)));
    const aoff = <usize>(j << 2);
    v128.store(
      accBase + aoff,
      i32x4.add(v128.load(accBase + aoff), i32x4.extmul_low_i16x8_s(w8, c8))
    );
    v128.store(
      accBase + aoff,
      i32x4.add(v128.load(accBase + aoff, 16), i32x4.extmul_high_i16x8_s(w8, c8)),
      16
    );
  }
}

// --- Differential make/unmake updates ----------------------------------------
//
// Feature delta of makeMove(m), applied to one perspective's accumulator.
// Cases:
//   drop:              hand(mover,type) -1,  +koma@to
//   quiet / promotion: -koma@from, +placed@to   (placed = koma|PROMOTE if promo)
//   capture:           additionally -capture@to, hand(mover side, capType) +1
// Each case pairs one removed row with one added row, so it runs as fused
// sub/add passes (1 pass for quiet moves and drops, 2 for captures).
// The S and G variants are duplicated on purpose: an evaluation only needs
// the side-to-move perspective, so they are applied independently.

function nnueAccApplyMakeS(m: i32): void {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const placed = ((m >> 23) & 1) != 0 ? koma | PROMOTE : koma;
  const capture = (m >> 24) & 0x7f;

  if (from == 0) {
    // Drop: hand count -1, board feature +1 (drops never promote/capture).
    nnueRowSubAdd(nnueAccS, nnueHandRowS(koma), nnueBoardRowS(koma, to));
    return;
  }

  nnueRowSubAdd(nnueAccS, nnueBoardRowS(koma, from), nnueBoardRowS(placed, to));

  if (capture != EMPTY) {
    const capType = capture & 0x07;
    if (capType != 0) {
      const handKoma = capType | ((capture & SENTE) != 0 ? GOTE : SENTE);
      nnueRowSubAdd(nnueAccS, nnueBoardRowS(capture, to), nnueHandRowS(handKoma));
    } else {
      // King capture — unreachable from legal positions, but keep the board
      // side of the accumulator consistent anyway (no hand feature exists).
      nnueRowAddScaled(nnueAccS, nnueBoardRowS(capture, to), -1);
    }
  }
}

function nnueAccApplyMakeG(m: i32): void {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const placed = ((m >> 23) & 1) != 0 ? koma | PROMOTE : koma;
  const capture = (m >> 24) & 0x7f;

  if (from == 0) {
    nnueRowSubAdd(nnueAccG, nnueHandRowG(koma), nnueBoardRowG(koma, to));
    return;
  }

  nnueRowSubAdd(nnueAccG, nnueBoardRowG(koma, from), nnueBoardRowG(placed, to));

  if (capture != EMPTY) {
    const capType = capture & 0x07;
    if (capType != 0) {
      const handKoma = capType | ((capture & SENTE) != 0 ? GOTE : SENTE);
      nnueRowSubAdd(nnueAccG, nnueBoardRowG(capture, to), nnueHandRowG(handKoma));
    } else {
      nnueRowAddScaled(nnueAccG, nnueBoardRowG(capture, to), -1);
    }
  }
}

/** Exact inverse of nnueAccApplyMakeS (sub/add swapped). */
function nnueAccApplyUnmakeS(m: i32): void {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const placed = ((m >> 23) & 1) != 0 ? koma | PROMOTE : koma;
  const capture = (m >> 24) & 0x7f;

  if (from == 0) {
    nnueRowSubAdd(nnueAccS, nnueBoardRowS(koma, to), nnueHandRowS(koma));
    return;
  }

  nnueRowSubAdd(nnueAccS, nnueBoardRowS(placed, to), nnueBoardRowS(koma, from));

  if (capture != EMPTY) {
    const capType = capture & 0x07;
    if (capType != 0) {
      const handKoma = capType | ((capture & SENTE) != 0 ? GOTE : SENTE);
      nnueRowSubAdd(nnueAccS, nnueHandRowS(handKoma), nnueBoardRowS(capture, to));
    } else {
      nnueRowAddScaled(nnueAccS, nnueBoardRowS(capture, to), 1);
    }
  }
}

/** Exact inverse of nnueAccApplyMakeG (sub/add swapped). */
function nnueAccApplyUnmakeG(m: i32): void {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const placed = ((m >> 23) & 1) != 0 ? koma | PROMOTE : koma;
  const capture = (m >> 24) & 0x7f;

  if (from == 0) {
    nnueRowSubAdd(nnueAccG, nnueBoardRowG(koma, to), nnueHandRowG(koma));
    return;
  }

  nnueRowSubAdd(nnueAccG, nnueBoardRowG(placed, to), nnueBoardRowG(koma, from));

  if (capture != EMPTY) {
    const capType = capture & 0x07;
    if (capType != 0) {
      const handKoma = capType | ((capture & SENTE) != 0 ? GOTE : SENTE);
      nnueRowSubAdd(nnueAccG, nnueHandRowG(handKoma), nnueBoardRowG(capture, to));
    } else {
      nnueRowAddScaled(nnueAccG, nnueBoardRowG(capture, to), 1);
    }
  }
}

/**
 * Build the SENTE-perspective accumulator from scratch (live board). Also
 * refreshes the cached SENTE king bucket, so subsequent deltas use the right
 * table segment.
 */
function nnueBuildAccS(accS: StaticArray<i32>): void {
  nnueUpdateBucketS();
  for (let j = 0; j < NNUE_H1; j++) {
    unchecked(accS[j] = load<i32>(NNUE_WEIGHTS + <usize>(nnueB1Off + (j << 2))));
  }
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      const koma = unchecked(ban[pos]);
      if (koma == EMPTY) continue;
      nnueRowAddScaled(accS, nnueBoardRowS(koma, pos), 1);
    }
  }
  for (let type = FU; type <= HI; type++) {
    const cS = unchecked(hand[SENTE | type]);
    if (cS > 0) nnueRowAddScaled(accS, nnueHandRowS(SENTE | type), cS);
    const cG = unchecked(hand[GOTE | type]);
    if (cG > 0) nnueRowAddScaled(accS, nnueHandRowS(GOTE | type), cG);
  }
}

/** Same for the GOTE perspective. */
function nnueBuildAccG(accG: StaticArray<i32>): void {
  nnueUpdateBucketG();
  for (let j = 0; j < NNUE_H1; j++) {
    unchecked(accG[j] = load<i32>(NNUE_WEIGHTS + <usize>(nnueB1Off + (j << 2))));
  }
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      const koma = unchecked(ban[pos]);
      if (koma == EMPTY) continue;
      nnueRowAddScaled(accG, nnueBoardRowG(koma, pos), 1);
    }
  }
  for (let type = FU; type <= HI; type++) {
    const cS = unchecked(hand[SENTE | type]);
    if (cS > 0) nnueRowAddScaled(accG, nnueHandRowG(SENTE | type), cS);
    const cG = unchecked(hand[GOTE | type]);
    if (cG > 0) nnueRowAddScaled(accG, nnueHandRowG(GOTE | type), cG);
  }
}

/** w2t[j][i] = w2[i][j] (column-major copy for the sparse layer-2 path). */
function nnueBuildW2T(): void {
  for (let i = 0; i < NNUE_H2; i++) {
    const rowBase = NNUE_WEIGHTS + <usize>(nnueW2Off + (i << 9));
    for (let j = 0; j < NNUE_H1; j++) {
      store<i16>(
        NNUE_W2T + <usize>((((j << 5) + i) << 1)),
        load<i16>(rowBase + <usize>(j << 1))
      );
    }
  }
}

/**
 * Rebuild both differential accumulators (and the transposed w2 copy) from
 * the current position and weight region.
 */
export function nnueRefreshAccumulators(): void {
  nnuePendLen = 0;
  nnuePendAppliedS = 0;
  nnuePendAppliedG = 0;
  nnueAccSDirty = false;
  nnueAccGDirty = false;
  nnueBuildAccS(nnueAccS);
  nnueBuildAccG(nnueAccG);
  nnueBuildW2T();
}

/**
 * Fold all pending move deltas into the SENTE-perspective accumulator.
 * A pending SENTE-king move that crosses a KP bucket boundary (or a dirty
 * flag left by unmake) invalidates every folded feature, so the accumulator
 * is rebuilt from the live board instead — evaluation always happens at the
 * position the pending moves lead to, so the rebuild is exact.
 * Returns false when the path outgrew the pending stack (evaluation then
 * falls back to the full recompute — never wrong, only slower; unreachable
 * in practice).
 */
function nnueApplyPendingS(): bool {
  if (nnuePendLen > NNUE_PEND_CAP) return false;
  if (!nnueAccSDirty) {
    while (nnuePendAppliedS < nnuePendLen) {
      const m = unchecked(nnuePendStack[nnuePendAppliedS]);
      if (nnueMoveCrossesS(m)) {
        nnueAccSDirty = true;
        break;
      }
      nnueAccApplyMakeS(m);
      nnuePendAppliedS++;
    }
  }
  if (nnueAccSDirty) {
    nnueBuildAccS(nnueAccS);
    nnueAccSDirty = false;
    nnuePendAppliedS = nnuePendLen;
  }
  return true;
}

/** Same for the GOTE-perspective accumulator. */
function nnueApplyPendingG(): bool {
  if (nnuePendLen > NNUE_PEND_CAP) return false;
  if (!nnueAccGDirty) {
    while (nnuePendAppliedG < nnuePendLen) {
      const m = unchecked(nnuePendStack[nnuePendAppliedG]);
      if (nnueMoveCrossesG(m)) {
        nnueAccGDirty = true;
        break;
      }
      nnueAccApplyMakeG(m);
      nnuePendAppliedG++;
    }
  }
  if (nnueAccGDirty) {
    nnueBuildAccG(nnueAccG);
    nnueAccGDirty = false;
    nnuePendAppliedG = nnuePendLen;
  }
  return true;
}

/**
 * Verification: bring the incremental accumulators up to date, rebuild fresh
 * ones, and count entries that differ. 0 = perfectly in sync (max 512);
 * -1 = pending stack overflowed (differential state unavailable).
 */
export function nnueAccMismatch(): i32 {
  if (!nnueApplyPendingS() || !nnueApplyPendingG()) return -1;
  nnueBuildAccS(nnueChkS);
  nnueBuildAccG(nnueChkG);
  let bad = 0;
  for (let j = 0; j < NNUE_H1; j++) {
    if (unchecked(nnueChkS[j]) != unchecked(nnueAccS[j])) bad++;
    if (unchecked(nnueChkG[j]) != unchecked(nnueAccG[j])) bad++;
  }
  return bad;
}

function nnueAddFeature(feat: i32): void {
  const base = NNUE_WEIGHTS + <usize>(NNUE_W1B_OFF + feat * NNUE_H1 * 2);
  const accBase = changetype<usize>(nnueAcc);
  for (let j = 0; j < NNUE_H1; j += 8) {
    const w8 = v128.load(base + (<usize>(j << 1)));
    const aoff = <usize>(j << 2);
    v128.store(accBase + aoff, i32x4.add(v128.load(accBase + aoff), i32x4.extend_low_i16x8_s(w8)));
    v128.store(
      accBase + aoff,
      i32x4.add(v128.load(accBase + aoff, 16), i32x4.extend_high_i16x8_s(w8)),
      16
    );
  }
}

function nnueAddHand(idx: i32, count: i32): void {
  nnueRowAddScaled(nnueAcc, NNUE_WEIGHTS + <usize>(nnueW1hOff + idx * NNUE_H1 * 2), count);
}

/**
 * Raw quantized network output out_q (side-to-move perspective), bit-identical
 * to ml/export-weights.py int_forward on the same position. Read-only.
 */
export function nnueEvaluate(): i32 {
  // Layer 1 accumulator: b1 + board features + hand features.
  for (let j = 0; j < NNUE_H1; j++) {
    unchecked(nnueAcc[j] = load<i32>(NNUE_WEIGHTS + <usize>(nnueB1Off + (j << 2))));
  }

  const stmSente = teban == SENTE;

  // Reduced KP: every feature lives in the own-king bucket's table segment.
  // kingS/kingG are maintained by makeMove/finalizePosition; a scratch
  // position without a king falls back to bucket 0.
  let bktFeat = 0; // feature-index offset into w1_board
  let bktHand = 0; // row offset into w1_hand
  if (nnueBuckets > 1) {
    const kp = stmSente ? kingS : kingG;
    let b = 0;
    if (kp > 0) b = stmSente ? nnueKpBucketS(kp) : nnueKpBucketG(kp);
    bktFeat = b * NNUE_BOARD_FEATS;
    bktHand = b * NNUE_HAND_FEATS;
  }
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const koma = unchecked(ban[(suji << 4) + dan]);
      if (koma == EMPTY) continue;
      const kind = unchecked(NNUE_KIND[koma & 0x0f]);
      const isBlack = (koma & SENTE) != 0;
      // Normalize to the side-to-move perspective (train.py parse_sfen):
      // GOTE to move => rotate the board 180° and swap colors.
      let mine: bool;
      let s: i32;
      let d: i32;
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
      nnueAddFeature(bktFeat + plane * 81 + (s - 1) * 9 + (d - 1));
    }
  }

  // Hand counts: mine 0..6, opponent 7..13, order FU,KY,KE,GI,KI,KA,HI
  // (= train.py HAND_ORDER "PLNSGBR").
  const oppSide = teban == SENTE ? GOTE : SENTE;
  for (let type = FU; type <= HI; type++) {
    const cMine = unchecked(hand[teban | type]);
    if (cMine > 0) nnueAddHand(bktHand + type - 1, cMine);
    const cOpp = unchecked(hand[oppSide | type]);
    if (cOpp > 0) nnueAddHand(bktHand + type - 1 + 7, cOpp);
  }

  // h1 = clamp(acc, 0, 127) — clamp in place (SIMD, 4 lanes per store).
  const accBase = changetype<usize>(nnueAcc);
  const zero = i32x4.splat(0);
  const cap = i32x4.splat(127);
  for (let j = 0; j < NNUE_H1; j += 4) {
    const aoff = <usize>(j << 2);
    v128.store(accBase + aoff, i32x4.min_s(i32x4.max_s(v128.load(accBase + aoff), zero), cap));
  }

  return nnueLayers23();
}

/**
 * out_q via the differential accumulators — bit-identical to nnueEvaluate().
 * Folds any pending make deltas into the accumulators first (lazy update);
 * the accumulators are rebuilt by setNnueEnabled(1) and finalizePosition().
 *
 * Layer 2 runs SPARSE here: h1 = clamp(acc, 0, 127) is post-ClippedReLU, so
 * zero activations are skipped entirely and each nonzero one adds h * w2t[j]
 * (a 32-wide column of the transposed w2) into the partial sums. The 32
 * partial sums live in eight i32x4 registers; activations are clamped and
 * zero-tested 8 at a time (a group of 8 zero activations is skipped with one
 * any_true), and each nonzero h adds its column via i16xi16 extmuls (exact
 * products: |w2| < 2^15, h <= 127). i32 addition wraps mod 2^32 and is
 * commutative, so the result is bit-identical to the dense row-major dot
 * products of nnueLayers23()/int_forward.
 */
export function nnueEvaluateFast(): i32 {
  if (teban == SENTE) {
    if (!nnueApplyPendingS()) return nnueEvaluate();
  } else {
    if (!nnueApplyPendingG()) return nnueEvaluate();
  }
  nnueEvalCount++;
  const srcBase = changetype<usize>(teban == SENTE ? nnueAccS : nnueAccG);

  // Layer-2 partial sums (a2[0..31]) seeded with b2, kept in registers.
  const b2Base = NNUE_WEIGHTS + <usize>nnueB2Off;
  let s0 = v128.load(b2Base);
  let s1 = v128.load(b2Base, 16);
  let s2 = v128.load(b2Base, 32);
  let s3 = v128.load(b2Base, 48);
  let s4 = v128.load(b2Base, 64);
  let s5 = v128.load(b2Base, 80);
  let s6 = v128.load(b2Base, 96);
  let s7 = v128.load(b2Base, 112);

  const zero = i32x4.splat(0);
  const cap = i32x4.splat(127);
  for (let j = 0; j < NNUE_H1; j += 8) {
    const aoff = <usize>(j << 2);
    const lo = i32x4.min_s(i32x4.max_s(v128.load(srcBase + aoff), zero), cap);
    const hi = i32x4.min_s(i32x4.max_s(v128.load(srcBase + aoff, 16), zero), cap);
    // Clamped activations are 0 iff acc <= 0, so any_true == false means the
    // scalar loop would have skipped all 8 — safe to skip the whole group.
    if (!v128.any_true(i16x8.narrow_i32x4_s(lo, hi))) continue;
    for (let l = 0; l < 8; l++) {
      let h = load<i32>(srcBase + aoff + (<usize>(l << 2)));
      if (h <= 0) continue;
      if (h > 127) h = 127;
      const hs = i16x8.splat(<i16>h);
      const colBase = NNUE_W2T + (<usize>((j + l) << 6)); // 32 i16 = 64 bytes
      const w0 = v128.load(colBase);
      const w1 = v128.load(colBase, 16);
      const w2 = v128.load(colBase, 32);
      const w3 = v128.load(colBase, 48);
      s0 = i32x4.add(s0, i32x4.extmul_low_i16x8_s(w0, hs));
      s1 = i32x4.add(s1, i32x4.extmul_high_i16x8_s(w0, hs));
      s2 = i32x4.add(s2, i32x4.extmul_low_i16x8_s(w1, hs));
      s3 = i32x4.add(s3, i32x4.extmul_high_i16x8_s(w1, hs));
      s4 = i32x4.add(s4, i32x4.extmul_low_i16x8_s(w2, hs));
      s5 = i32x4.add(s5, i32x4.extmul_high_i16x8_s(w2, hs));
      s6 = i32x4.add(s6, i32x4.extmul_low_i16x8_s(w3, hs));
      s7 = i32x4.add(s7, i32x4.extmul_high_i16x8_s(w3, hs));
    }
  }

  // Layer 3: h2 = clamp(a2 >> 6, 0, 127) (i32x4.shr_s == scalar >> per lane),
  // then outQ = b3 + Σ w3[i]*h2[i] via i16 dot products (h2 <= 127 narrows
  // exactly; every product fits i32, and the wrapping-add reordering of the
  // horizontal sum is bit-identical to the scalar accumulation).
  const w3Base = NNUE_WEIGHTS + <usize>nnueW3Off;
  const h2a = i16x8.narrow_i32x4_s(
    i32x4.min_s(i32x4.max_s(i32x4.shr_s(s0, 6), zero), cap),
    i32x4.min_s(i32x4.max_s(i32x4.shr_s(s1, 6), zero), cap)
  );
  const h2b = i16x8.narrow_i32x4_s(
    i32x4.min_s(i32x4.max_s(i32x4.shr_s(s2, 6), zero), cap),
    i32x4.min_s(i32x4.max_s(i32x4.shr_s(s3, 6), zero), cap)
  );
  const h2c = i16x8.narrow_i32x4_s(
    i32x4.min_s(i32x4.max_s(i32x4.shr_s(s4, 6), zero), cap),
    i32x4.min_s(i32x4.max_s(i32x4.shr_s(s5, 6), zero), cap)
  );
  const h2d = i16x8.narrow_i32x4_s(
    i32x4.min_s(i32x4.max_s(i32x4.shr_s(s6, 6), zero), cap),
    i32x4.min_s(i32x4.max_s(i32x4.shr_s(s7, 6), zero), cap)
  );
  let out4 = i32x4.dot_i16x8_s(v128.load(w3Base), h2a);
  out4 = i32x4.add(out4, i32x4.dot_i16x8_s(v128.load(w3Base, 16), h2b));
  out4 = i32x4.add(out4, i32x4.dot_i16x8_s(v128.load(w3Base, 32), h2c));
  out4 = i32x4.add(out4, i32x4.dot_i16x8_s(v128.load(w3Base, 48), h2d));
  return (
    load<i32>(NNUE_WEIGHTS + <usize>nnueB3Off) +
    i32x4.extract_lane(out4, 0) +
    i32x4.extract_lane(out4, 1) +
    i32x4.extract_lane(out4, 2) +
    i32x4.extract_lane(out4, 3)
  );
}

/**
 * Layers 2 + 3 on the clamped h1 vector in nnueAcc (shared by both paths).
 * h1 (i32 in [0,127]) is packed to i16 lanes once, then each layer-2 row is
 * an i32x4.dot_i16x8_s dot product (every i16xi16 product is exact in i32);
 * i32 addition wraps mod 2^32 so the reassociation of the pairwise/horizontal
 * sums stays bit-identical to int_forward.
 */
function nnueLayers23(): i32 {
  nnueEvalCount++;
  // Pack h1 into 256 i16 lanes (values are pre-clamped to [0,127], so the
  // saturating narrow is exact).
  const accBase = changetype<usize>(nnueAcc);
  for (let j = 0; j < NNUE_H1; j += 8) {
    const aoff = <usize>(j << 2);
    v128.store(
      NNUE_H1_I16 + (<usize>(j << 1)),
      i16x8.narrow_i32x4_s(v128.load(accBase + aoff), v128.load(accBase + aoff, 16))
    );
  }
  // Layer 2 + output layer: h2 = clamp((w2 @ h1 + b2) >> 6, 0, 127).
  let outQ = load<i32>(NNUE_WEIGHTS + <usize>nnueB3Off);
  for (let i = 0; i < NNUE_H2; i++) {
    const rowBase = NNUE_WEIGHTS + <usize>(nnueW2Off + i * NNUE_H1 * 2);
    let sum = i32x4.splat(0);
    for (let j = 0; j < NNUE_H1; j += 8) {
      const off = <usize>(j << 1);
      sum = i32x4.add(
        sum,
        i32x4.dot_i16x8_s(v128.load(rowBase + off), v128.load(NNUE_H1_I16 + off))
      );
    }
    const a2 =
      load<i32>(NNUE_WEIGHTS + <usize>(nnueB2Off + (i << 2))) +
      i32x4.extract_lane(sum, 0) +
      i32x4.extract_lane(sum, 1) +
      i32x4.extract_lane(sum, 2) +
      i32x4.extract_lane(sum, 3);
    let h2 = a2 >> 6;
    if (h2 < 0) h2 = 0;
    else if (h2 > 127) h2 = 127;
    outQ += <i32>load<i16>(NNUE_WEIGHTS + <usize>(nnueW3Off + (i << 1))) * h2;
  }
  return outQ;
}

/**
 * NNUE evaluation in centipawns from the side-to-move perspective:
 * cp = trunc(out_q * K / (127*64)) — i64 intermediate, truncation toward zero.
 * Uses the differential accumulators while NNUE is enabled (unless the
 * verification force-full switch is on); falls back to the full recompute
 * otherwise, so standalone harness calls need no accumulator setup.
 */
export function nnueEvaluateCp(): i32 {
  const outQ = nnueEnabled && !nnueForceFull ? nnueEvaluateFast() : nnueEvaluate();
  // Fold the output rescale (numer/denom, default 1/1) into the same i64
  // division so there is only ONE truncation — with 1/1 this is bit-identical
  // to trunc(out_q * K / 8128). |outQ| < 2^31 and the setters enforce
  // K * numer <= NNUE_MAX_SCALE_PRODUCT (2^32), so the i64 product cannot
  // overflow. The clamp keeps rescaled values far away from the mate-score
  // window (S_MATE - 10_000); it is unreachable with the default scale
  // (|cp| < ~160k even with the extreme dummy-weight ranges).
  let cp = (<i64>outQ * <i64>nnueScaleK * <i64>nnueOutNumer) / (<i64>8128 * <i64>nnueOutDenom);
  if (cp > 1_000_000) cp = 1_000_000;
  else if (cp < -1_000_000) cp = -1_000_000;
  return <i32>cp;
}

/** NNUE eval micro-bench: run nnueEvaluate() `iters` times inside the module. */
export function benchNnueEvaluate(iters: i32): i32 {
  let acc = 0;
  for (let i = 0; i < iters; i++) {
    acc = (acc + nnueEvaluate()) | 0;
  }
  return acc;
}

/** Same micro-bench for the differential path (accumulators must be built). */
export function benchNnueEvaluateFast(iters: i32): i32 {
  let acc = 0;
  for (let i = 0; i < iters; i++) {
    acc = (acc + nnueEvaluateFast()) | 0;
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Harness API (parity.ts / bench-wasm.mjs)
// ---------------------------------------------------------------------------

/** Expose bookkeeping so the harness can sanity-check make/unmake symmetry. */
export function getEvalMaterial(): i32 {
  return evalMaterial;
}

/** Incrementally-maintained PSQT eval (parity with KyokumenImproved.psqtEval). */
export function getPsqtEval(): i32 {
  return psqtEval;
}

/** Eval micro-bench: run evaluateV3() `iters` times inside the module. */
export function benchEvaluateV3(iters: i32): i32 {
  let acc = 0;
  for (let i = 0; i < iters; i++) {
    acc = (acc + evaluateV3()) | 0;
  }
  return acc;
}

/** Eval micro-bench: run evaluateV3Full() `iters` times inside the module. */
export function benchEvaluateV3Full(iters: i32): i32 {
  let acc = 0;
  for (let i = 0; i < iters; i++) {
    acc = (acc + evaluateV3Full()) | 0;
  }
  return acc;
}

export function getHash(): i32 {
  return banHash ^ handHash;
}

export function getBanHash(): i32 {
  return banHash;
}

export function getHandHash(): i32 {
  return handHash;
}

/** Full TT key — same formula as KyokumenImproved: BanHash ^ HandHash ^ (teban seed if GOTE). */
export function getHashVal(): i32 {
  return banHash ^ handHash ^ (teban == GOTE ? TEBAN_HASH_SEED : 0);
}

export function getTeban(): i32 {
  return teban;
}

/**
 * Number of fully legal moves for the side to move (pseudo-legal generation
 * incl. uchifuzume, then 王手放置 filtering) — comparable 1:1 with
 * GenerateMovesImproved.generateLegalMoves(k).length.
 */
export function countLegalMoves(): i32 {
  const n = generateMoves(0);
  const mover = teban;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const m = unchecked(moveBuf[i]);
    makeMove(m);
    if (!isKingInCheck(mover)) count++;
    unmakeMove(m);
  }
  return count;
}

/**
 * Play a move (as the side to move) and flip the turn, updating the
 * incremental hashes/eval — equivalent to JS `k.move(te); k.toggleTeban()`.
 * `capture` is read from the board, like removeSelfMate does before move().
 */
export function applyMove(koma: i32, from: i32, to: i32, promote: i32): void {
  const capture = unchecked(ban[to]);
  const m = encodeMove(koma, from, to, promote != 0, capture);
  makeMove(m);
  teban = teban == SENTE ? GOTE : SENTE;
}

// ===========================================================================
// Phase 3: search — full port of ShogiAIImprovedV20 (iterative deepening
// negamax + alpha-beta + PVS + aspiration + packed TT + killer/history/
// countermove/continuation-history ordering + null-move / LMR / futility /
// LMP / RFP / IID / mate-distance bounds + check-aware quiescence with delta
// and SEE-lite pruning + path repetition detection with contempt).
//
// Everything mirrors src/components/game/ShogiImproved/ShogiAIImprovedV20.ts
// statement-for-statement so that a fixed-depth untimed search returns the
// SAME best move and score as the JS engine (verified by
// wasm-spike/search-driver.ts). The only structural difference: JS aborts on
// time via a thrown TimeUpError; AS has no exceptions, so a `stopped` flag is
// checked after every recursive call and the partial iteration is discarded
// exactly like the JS catch-and-break path.
//
// The mate solver (MateSolverImproved) and the opening book are intentionally
// NOT ported: the JS host runs them before calling into WASM (hybrid setup).
// ===========================================================================

// Host-provided monotonic clock (pass `performance.now` as env.now).
// @ts-ignore: decorator — AssemblyScript import annotation, ignored by tsc
@external('env', 'now')
declare function hostNow(): f64;

const S_INFINITE: i32 = 99_999_999;
const S_MATE: i32 = 90_000_000;
const S_MAX_PLY: i32 = 64;

// --- Shared transposition table hooks (Lazy SMP multi-thread mode) ----------
//
// In multi-thread (Lazy SMP) mode every worker keeps its own private WASM
// instance/memory; the transposition table alone is shared through a
// SharedArrayBuffer on the JS side (lock-free XOR-checked entries accessed
// with Atomics — see src/components/game/ShogiImproved/sharedTT.ts). The
// engine crosses into JS through the three imports below. When
// sharedTtEnabled is false (single-thread mode, the default) none of them is
// ever called and the private StaticArray TT behaves exactly as before, so
// the single-thread search stays bit-identical to the pre-SMP engine.

// @ts-ignore: decorator — AssemblyScript import annotation, ignored by tsc
@external('env', 'sharedTtProbe')
declare function hostSharedTtProbe(hashVal: i32): i32;
// @ts-ignore: decorator — AssemblyScript import annotation, ignored by tsc
@external('env', 'sharedTtStore')
declare function hostSharedTtStore(hashVal: i32, value: i32, flagDepth: i32, bestKey: i32): void;
// @ts-ignore: decorator — AssemblyScript import annotation, ignored by tsc
@external('env', 'sharedShouldStop')
declare function hostSharedShouldStop(): i32;

let sharedTtEnabled: bool = false;

/**
 * flagDepth packing for the shared TT: flag (2 bits) | depth << 2 (8 bits) |
 * USED bit. The USED bit guarantees a stored flagDepth is never 0, so an
 * all-zero (empty) slot can never pass the JS-side XOR check.
 */
const SHARED_TT_USED_BIT: i32 = 1 << 30;

/** Scratch the JS side fills on a shared-TT probe hit: [value, flagDepth, best, second]. */
const sharedTtScratch = new StaticArray<i32>(4);

export function getSharedTtScratchPtr(): usize {
  return changetype<usize>(sharedTtScratch);
}

export function setSharedTtEnabled(flag: i32): void {
  sharedTtEnabled = flag != 0;
}

// --- Transposition table (port of TranspositionTableImprovedPacked) ---------

const TT_SIZE: i32 = 0x100000;
const TT_MASK: i32 = 0x0fffff;
const TT_EXACT: i32 = 0;
const TT_LOWER: i32 = 1;
const TT_UPPER: i32 = 2;

const ttHashA = new StaticArray<i32>(TT_SIZE);
const ttValueA = new StaticArray<i32>(TT_SIZE);
const ttFlagA = new StaticArray<u8>(TT_SIZE);
const ttDepthA = new StaticArray<u8>(TT_SIZE);
const ttBestA = new StaticArray<i32>(TT_SIZE);
const ttSecondA = new StaticArray<i32>(TT_SIZE);
const ttUsedA = new StaticArray<u8>(TT_SIZE);

// Fields of the entry found by the last successful ttLookup(). Single-thread
// mode copies them out of the StaticArray entry; shared mode unpacks them
// from sharedTtScratch. Plain globals (not atomics): each thread has its own
// instance, so these are thread-local by construction.
let ttHitValue: i32 = 0;
let ttHitFlag: i32 = 0;
let ttHitDepth: i32 = 0;
let ttHitBest: i32 = 0;
let ttHitSecond: i32 = 0;

/**
 * Probe the transposition table for hashVal. On a hit fills the ttHit*
 * globals and returns true. Behavior in single-thread mode is identical to
 * the previous inline StaticArray probe (pure refactor).
 */
function ttLookup(hashVal: i32): bool {
  if (sharedTtEnabled) {
    if (hostSharedTtProbe(hashVal) == 0) return false;
    ttHitValue = unchecked(sharedTtScratch[0]);
    const fd = unchecked(sharedTtScratch[1]);
    ttHitFlag = fd & 3;
    ttHitDepth = (fd >> 2) & 0xff;
    ttHitBest = unchecked(sharedTtScratch[2]);
    ttHitSecond = unchecked(sharedTtScratch[3]);
    return true;
  }
  const index = hashVal & TT_MASK;
  if (unchecked(ttUsedA[index]) == 0) return false;
  if (unchecked(ttHashA[index]) != hashVal) return false;
  ttHitValue = unchecked(ttValueA[index]);
  ttHitFlag = <i32>unchecked(ttFlagA[index]);
  ttHitDepth = <i32>unchecked(ttDepthA[index]);
  ttHitBest = unchecked(ttBestA[index]);
  ttHitSecond = unchecked(ttSecondA[index]);
  return true;
}

function ttAdd(hashVal: i32, value: i32, alpha: i32, beta: i32, bestKey: i32, remainDepth: i32): void {
  let flag = TT_EXACT;
  if (value <= alpha) flag = TT_UPPER;
  else if (value >= beta) flag = TT_LOWER;

  if (sharedTtEnabled) {
    // Depth-preferred replacement and second-move promotion happen on the JS
    // side (they need a read-modify-write of the shared entry).
    hostSharedTtStore(hashVal, value, flag | ((remainDepth & 0xff) << 2) | SHARED_TT_USED_BIT, bestKey);
    return;
  }

  const index = hashVal & TT_MASK;

  if (unchecked(ttUsedA[index]) != 0 && unchecked(ttHashA[index]) == hashVal) {
    const oldRemain = <i32>unchecked(ttDepthA[index]);
    if (remainDepth < oldRemain) return;
    unchecked(ttSecondA[index] = ttBestA[index]);
  } else {
    unchecked(ttUsedA[index] = 1);
    unchecked(ttHashA[index] = hashVal);
    unchecked(ttSecondA[index] = 0);
  }

  unchecked(ttBestA[index] = bestKey);
  unchecked(ttValueA[index] = value);
  unchecked(ttFlagA[index] = <u8>flag);
  unchecked(ttDepthA[index] = <u8>(remainDepth & 0xff));
}

// --- Evaluation cache (SENTE perspective, keyed WITHOUT side to move) --------

const EVAL_CACHE_SIZE: i32 = 1 << 18;
const EVAL_CACHE_MASK: i32 = EVAL_CACHE_SIZE - 1;
const EVAL_CACHE_SENTINEL: i32 = 0x7fffffff;

const evalCacheKeyA = new StaticArray<i32>(EVAL_CACHE_SIZE);
const evalCacheValA = new StaticArray<i32>(EVAL_CACHE_SIZE);

function initEvalCache(): void {
  for (let i = 0; i < EVAL_CACHE_SIZE; i++) unchecked(evalCacheKeyA[i] = EVAL_CACHE_SENTINEL);
}
initEvalCache();

/** Clear the TT + eval cache (equivalent of ShogiAIImprovedV20.clearTT / fresh engine). */
export function clearTT(): void {
  for (let i = 0; i < TT_SIZE; i++) unchecked(ttUsedA[i] = 0);
  initEvalCache();
}

function evaluateSenteCached(): i32 {
  if (nnueEnabled) {
    // NNUE output depends on the side to move (the board is normalized to the
    // stm perspective), so the cache key must include teban — unlike
    // evaluateV3Full, which is teban-independent.
    const nKey = banHash ^ handHash ^ (teban == GOTE ? TEBAN_HASH_SEED : 0);
    const nIndex = nKey & EVAL_CACHE_MASK;
    if (unchecked(evalCacheKeyA[nIndex]) == nKey) return unchecked(evalCacheValA[nIndex]);
    // Same SENTE-positive convention as evaluateV3Full at the leaf slot:
    // nnueEvaluateCp() is stm-positive, so negate for GOTE.
    const stmCp = nnueEvaluateCp();
    const nValue = teban == SENTE ? stmCp : -stmCp;
    unchecked(evalCacheKeyA[nIndex] = nKey);
    unchecked(evalCacheValA[nIndex] = nValue);
    return nValue;
  }
  const key = banHash ^ handHash;
  const index = key & EVAL_CACHE_MASK;
  if (unchecked(evalCacheKeyA[index]) == key) return unchecked(evalCacheValA[index]);
  const value = evaluateV3Full();
  unchecked(evalCacheKeyA[index] = key);
  unchecked(evalCacheValA[index] = value);
  return value;
}

function evalForSideToMove(): i32 {
  const v = evaluateSenteCached();
  return teban == SENTE ? v : -v;
}

// --- Move-key helpers ---------------------------------------------------------
//
// jsMoveKey mirrors ShogiAIImprovedV20.moveKey(te):
//   (koma & 0x3f) | (from << 6) | (to << 14) | (promote << 22)
// This is also the packed representation returned by searchBestMove() and
// stored in the TT (bit-compatible with the JS engine's TT keys).

function jsMoveKeyOf(m: i32): i32 {
  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const promote = (m >> 23) & 1;
  return (koma & 0x3f) | (from << 6) | (to << 14) | (promote << 22);
}

/** Continuation-history (pieceType, toSquare) index — port of pieceToIndex(te). */
function pieceToIndexOf(m: i32): i32 {
  const to = m & 0xff;
  const komashu = (m >> 16) & 0x0f;
  return komashu * 81 + ((to >> 4) - 1) * 9 + ((to & 0x0f) - 1);
}

// Compact bijective index of a jsMoveKey, used to back the JS Map-based
// heuristics (history / counterMove / root-order-bonus cache) with flat
// arrays. koma&0x3f is 17..47 (side flag included), from is 0 (drop) or a
// valid square, to is a valid square, promote is 1 bit:
//   ((koma-16) * 82 + fromIdx) * 81 + toIdx) * 2 + promote   < 425,088
const HIST_SIZE: i32 = 32 * 82 * 81 * 2;

function moveKeyCompact(key: i32): i32 {
  const koma = key & 0x3f;
  const from = (key >> 6) & 0xff;
  const to = (key >> 14) & 0xff;
  const promote = (key >> 22) & 1;
  const toIdx = ((to >> 4) - 1) * 9 + ((to & 0x0f) - 1);
  const fromIdx = from == 0 ? 0 : ((from >> 4) - 1) * 9 + ((from & 0x0f) - 1) + 1;
  return (((koma - 16) * 82 + fromIdx) * 81 + toIdx) * 2 + promote;
}

// --- Ordering heuristic state --------------------------------------------------

const killer1 = new StaticArray<i32>(S_MAX_PLY);
const killer2 = new StaticArray<i32>(S_MAX_PLY);
const historyTable = new StaticArray<i32>(HIST_SIZE);
const counterMoveTable = new StaticArray<i32>(HIST_SIZE); // stores full jsMoveKey (0 = none)

const CONT_DIM: i32 = 1296;
const contHist = new StaticArray<i32>(CONT_DIM * CONT_DIM);

const prevKeyByPly = new StaticArray<i32>(S_MAX_PLY);
const prevPtByPly = new StaticArray<i32>(S_MAX_PLY);

// Root-only ordering cache (per-search epoch stamps avoid a full clear).
const rootBonusVal = new StaticArray<i32>(HIST_SIZE);
const rootBonusStamp = new StaticArray<i32>(HIST_SIZE);
let searchEpoch: i32 = 0;

function recordKiller(ply: i32, key: i32): void {
  if (ply < 0 || ply >= S_MAX_PLY) return;
  if (unchecked(killer1[ply]) != key) {
    unchecked(killer2[ply] = killer1[ply]);
    unchecked(killer1[ply] = key);
  }
}

// --- Per-ply attack/defense cache (port of leastAttackerValueCached) ------------

const attackEpochByPly = new StaticArray<i32>(S_MAX_PLY);
const attackStampS = new StaticArray<i32>(S_MAX_PLY * 256);
const attackStampG = new StaticArray<i32>(S_MAX_PLY * 256);
const attackValS = new StaticArray<i32>(S_MAX_PLY * 256);
const attackValG = new StaticArray<i32>(S_MAX_PLY * 256);

function beginAttackCacheForNode(ply: i32): void {
  if (ply < 0 || ply >= S_MAX_PLY) return;
  let next = unchecked(attackEpochByPly[ply]) + 1;
  if (next == 0) {
    for (let i = 0; i < S_MAX_PLY * 256; i++) {
      unchecked(attackStampS[i] = 0);
      unchecked(attackStampG[i] = 0);
    }
    next = 1;
  }
  unchecked(attackEpochByPly[ply] = next);
}

function leastAttackerValueCached(target: i32, defender: i32, ply: i32): i32 {
  if (target <= 0 || get(target) == WALL) return NO_ATTACKER;
  const sq = target & 0xff;
  const index = (ply << 8) | sq;
  const epoch = unchecked(attackEpochByPly[ply]);
  if (defender == SENTE) {
    if (unchecked(attackStampS[index]) == epoch) return unchecked(attackValS[index]);
    const computed = getLeastAttackerValue(target, defender);
    unchecked(attackStampS[index] = epoch);
    unchecked(attackValS[index] = computed);
    return computed;
  }
  if (unchecked(attackStampG[index]) == epoch) return unchecked(attackValG[index]);
  const computed = getLeastAttackerValue(target, defender);
  unchecked(attackStampG[index] = epoch);
  unchecked(attackValG[index] = computed);
  return computed;
}

// --- Path repetition (sennichite) — port of pushRepetition/popRepetition --------
//
// JS uses Map<hash, count>; the live path is at most ~2*S_MAX_PLY entries
// (IID re-enters the same ply once), so an exact linear count over the path
// stack is equivalent and allocation-free.

const REP_STACK_SIZE: i32 = 256;
const repStack = new StaticArray<i32>(REP_STACK_SIZE);
let repSize: i32 = 0;

function pushRepetition(hash: i32): bool {
  let count = 0;
  for (let i = 0; i < repSize; i++) {
    if (unchecked(repStack[i]) == hash) count++;
  }
  if (count >= 3) return false;
  if (repSize < REP_STACK_SIZE) {
    unchecked(repStack[repSize] = hash);
    repSize++;
  }
  return true;
}

function popRepetition(): void {
  if (repSize > 0) repSize--;
}

// --- Search runtime state --------------------------------------------------------

let nodeCount: i32 = 0;
let leafCount: i32 = 0;
let searchStartTime: f64 = 0;
let searchMaxTimeMs: f64 = 0;
let stopped: bool = false;
let quiescenceDepthMaxG: i32 = 0;

// V20 unified feature knobs (time-budget dependent ones set in searchBestMove).
const ASPIRATION_WINDOW: i32 = 300;
const DELTA_PRUNING_MARGIN: i32 = 150;
const FUTILITY_MARGIN_1: i32 = 350;
const FUTILITY_MARGIN_2: i32 = 700;
const DRAW_CONTEMPT: i32 = 12;
const CHECK_EXTENSION_MAX_PLY: i32 = 0;
let nullMoveReductionG: i32 = 2;
let qCheckMoveLimit: i32 = 1;
let qCheckTryLimit: i32 = 2;

let rootBestKey: i32 = 0;
let orderDepthLeft: i32 = 99;

// Root-only metadata (opening-like ordering heuristics).
let rootTesuG: i32 = 0;
let rootHandTotalG: i32 = 0;
let rootInCheckG: bool = false;
let rootKingDangerG: i32 = 0;

// Result stats.
let lastSearchScore: i32 = 0;
let lastSearchDepth: i32 = 0;

function sampleTime(): void {
  // Same sampling policy as maybeThrowOnTime: check once per ~2048 nodes+leaves.
  const counter = nodeCount + leafCount;
  if ((counter & 2047) != 0) return;
  if (searchMaxTimeMs > 0 && hostNow() - searchStartTime >= searchMaxTimeMs) stopped = true;
  // Lazy SMP: helper threads (and a superseded main search) are stopped
  // through a shared generation cell once the coordinating thread is done.
  if (sharedTtEnabled && hostSharedShouldStop() != 0) stopped = true;
}

function timeUpNow(): bool {
  return searchMaxTimeMs > 0 && hostNow() - searchStartTime >= searchMaxTimeMs;
}

function repetitionDrawScore(): i32 {
  const standPat = evalForSideToMove();
  if (DRAW_CONTEMPT <= 0) return 0;
  if (absI(standPat) < 150) return 0;
  if (standPat > 0) return -DRAW_CONTEMPT;
  if (standPat < 0) return DRAW_CONTEMPT;
  return 0;
}

/** Port of promotionGain(te). */
function promotionGainOf(koma: i32): i32 {
  const side = koma & (SENTE + GOTE);
  const type = koma & 0x0f;
  const promoted = side | (type + 8);
  return maxI(0, absI(unchecked(KOMA_VALUE[promoted])) - absI(unchecked(KOMA_VALUE[koma])));
}

/** Port of computeKingDanger (danger table == KS2_DANGER_BY_KOMASHU + distance bonus). */
function computeKingDangerAS(side: i32, kingPos: i32): i32 {
  if (kingPos <= 0) return 0;
  const kingSuji = kingPos >> 4;
  const kingDan = kingPos & 0x0f;

  let danger = 0;
  for (let ds = -2; ds <= 2; ds++) {
    for (let dd = -2; dd <= 2; dd++) {
      if (ds == 0 && dd == 0) continue;
      const suji = kingSuji + ds;
      const dan = kingDan + dd;
      if (suji < 1 || suji > 9 || dan < 1 || dan > 9) continue;

      const p = unchecked(ban[(suji << 4) + dan]);
      if (p == EMPTY || p == WALL) continue;
      if (isSelf(side, p)) continue;

      const base = unchecked(KS2_DANGER_BY_KOMASHU[p & 0x0f]);
      if (base == 0) continue;

      const dist = absI(ds) + absI(dd);
      danger += base + (dist <= 1 ? 6 : dist <= 2 ? 3 : 0);
    }
  }
  return danger;
}

// --- Root-only ordering bonuses (ports of openingOrderBonusAtRoot /
//     rootMoveSafetyOrderAdjustment) ---------------------------------------------

function openingOrderBonusAtRootAS(m: i32): i32 {
  if (rootInCheckG) return 0;
  if (rootTesuG != 0 && rootTesuG >= 24) return 0;
  if (rootHandTotalG > 4) return 0;

  const selfKing = teban == SENTE ? kingS : kingG;
  if (selfKing <= 0) return 0;
  const selfKingDan = selfKing & 0x0f;
  if (teban == SENTE) {
    if (selfKingDan < 7) return 0;
  } else {
    if (selfKingDan > 3) return 0;
  }

  const from = (m >> 8) & 0xff;
  const capture = (m >> 24) & 0x7f;
  const promote = (m >> 23) & 1;
  if (from == 0) return 0;
  if (capture != EMPTY) return 0;
  if (promote != 0) return 0;

  const koma = (m >> 16) & 0x7f;
  const to = m & 0xff;
  const pieceType = koma & 0x0f;
  const fromSuji = from >> 4;
  const fromDan = from & 0x0f;
  const toSuji = to >> 4;
  const toDan = to & 0x0f;

  let bonus = 0;
  const underPressure = rootKingDangerG >= 45;

  const pawnStartDan = teban == SENTE ? 7 : 3;
  const pawnNextDan = teban == SENTE ? 6 : 4;
  if (pieceType == FU && fromDan == pawnStartDan && toDan == pawnNextDan) {
    bonus += underPressure ? 90_000 : 140_000;
    const distFromCenterFile = absI(fromSuji - 5);
    bonus += maxI(0, 3 - distFromCenterFile) * (underPressure ? 10_000 : 18_000);
  }

  if (pieceType == GI || pieceType == KI) {
    bonus += 70_000;
    if (teban == SENTE && toDan <= fromDan) bonus += 8_000;
    if (teban == GOTE && toDan >= fromDan) bonus += 8_000;
  }

  if (pieceType == KA || pieceType == HI) {
    bonus += 45_000;
  }

  if (pieceType == OU) {
    if (underPressure || rootTesuG < 4) return bonus;

    const fromDist = absI(fromSuji - 5) + absI(fromDan - 5);
    const toDist = absI(toSuji - 5) + absI(toDan - 5);
    const away = toDist - fromDist;
    if (away > 0) bonus += away * 25_000;

    const inHomeCamp = teban == SENTE ? toDan >= 8 : toDan <= 2;
    if (inHomeCamp) bonus += 20_000;
  }

  return bonus;
}

function rootMoveSafetyOrderAdjustmentAS(m: i32, enemyKing: i32): i32 {
  const to = m & 0xff;
  if (enemyKing > 0) {
    const dist = absI((to >> 4) - (enemyKing >> 4)) + absI((to & 0x0f) - (enemyKing & 0x0f));
    if (dist <= 2) return 0;
  }

  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const promote = (m >> 23) & 1;
  const capture = (m >> 24) & 0x7f;
  const otherSide = teban == SENTE ? GOTE : SENTE;

  if (from == 0) {
    const enemyLeastAttacker = getLeastAttackerValue(to, teban);
    if (enemyLeastAttacker == NO_ATTACKER) return 0;

    const selfLeastDefender = getLeastAttackerValue(to, otherSide);
    if (selfLeastDefender != NO_ATTACKER) {
      return selfLeastDefender <= enemyLeastAttacker ? 25_000 : 8_000;
    }

    const pieceValue = absI(unchecked(KOMA_VALUE[koma]));
    return -minI(320_000, pieceValue * 120);
  }

  const attackerValue0 = absI(unchecked(KOMA_VALUE[koma]));
  const capturedValue0 = capture != EMPTY ? absI(unchecked(KOMA_VALUE[capture])) : 0;

  if (capture == EMPTY && promote == 0 && attackerValue0 <= 200) return 0;

  const isQuiet = capture == EMPTY && promote == 0;
  if (isQuiet && attackerValue0 < 700) return 0;
  const isSuspiciousCapture = capture != EMPTY && capturedValue0 + 200 < attackerValue0;
  if (!isQuiet && !isSuspiciousCapture) return 0;

  makeMove(m);
  let result = 0;
  const moved = unchecked(ban[to]);
  const movedValue = absI(unchecked(KOMA_VALUE[moved]));

  const enemyLeastAttacker = getLeastAttackerValue(to, teban);
  if (enemyLeastAttacker != NO_ATTACKER) {
    const selfLeastDefender = getLeastAttackerValue(to, otherSide);
    if (selfLeastDefender != NO_ATTACKER) {
      result = selfLeastDefender <= enemyLeastAttacker ? 8_000 : 0;
    } else if (capturedValue0 == 0 && movedValue <= 200) {
      result = 0;
    } else {
      let penalty = minI(240_000, movedValue * 80);
      if (capturedValue0 > 0) {
        penalty = maxI(0, penalty - capturedValue0 * 70);
      }
      result = -penalty;
    }
  }
  unmakeMove(m);
  return result;
}

// --- Move scoring & ordering (port of scoreMove / scoreAndSortMoves) -------------

function scoreMoveAS(m: i32, ply: i32, ttMoveKey: i32, ttSecondMoveKey: i32): i32 {
  const key = jsMoveKeyOf(m);
  let score = 0;

  const to = m & 0xff;
  const from = (m >> 8) & 0xff;
  const koma = (m >> 16) & 0x7f;
  const promote = (m >> 23) & 1;
  const capture = (m >> 24) & 0x7f;

  const enemyKing = teban == SENTE ? kingG : kingS;

  // 1) Strong ordering signals (TT move, then killers)
  if (ttMoveKey != 0 && key == ttMoveKey) score += 5_000_000;
  if (ttSecondMoveKey != 0 && key == ttSecondMoveKey) score += 4_000_000;
  if (key == unchecked(killer1[ply])) score += 2_000_000;
  if (key == unchecked(killer2[ply])) score += 1_500_000;

  // Countermove heuristic.
  if (ply > 0 && ply < S_MAX_PLY) {
    const prevKey = unchecked(prevKeyByPly[ply]);
    if (prevKey != 0 && unchecked(counterMoveTable[moveKeyCompact(prevKey)]) == key) score += 1_200_000;
  }

  // 2) Long-term ordering signals (history + continuation history)
  score += unchecked(historyTable[moveKeyCompact(key)]);

  if (ply > 0 && ply < S_MAX_PLY) {
    const prevPt = unchecked(prevPtByPly[ply]);
    if (prevPt >= 0) {
      score += unchecked(contHist[prevPt * CONT_DIM + pieceToIndexOf(m)]);
    }
  }

  // 3) Promotions.
  if (promote != 0) score += 400_000;

  // 4) Captures: MVV-LVA-ish.
  if (capture != EMPTY) {
    const victim = absI(unchecked(KOMA_VALUE[capture]));
    const attacker = absI(unchecked(KOMA_VALUE[koma]));
    score += 900_000 + victim * 20 - attacker;
  }

  // SEE-lite ordering nudge for risky captures (skipped at frontier nodes).
  if (orderDepthLeft >= 3 && from != 0 && capture != EMPTY) {
    const attackerValue = absI(unchecked(KOMA_VALUE[koma]));
    const victimValue = absI(unchecked(KOMA_VALUE[capture]));

    if (attackerValue >= 1000 && victimValue + 200 < attackerValue) {
      const distToEnemyKing =
        enemyKing > 0
          ? absI((to >> 4) - (enemyKing >> 4)) + absI((to & 0x0f) - (enemyKing & 0x0f))
          : 99;

      if (distToEnemyKing > 2) {
        const enemyLeastAttacker = leastAttackerValueCached(to, teban, ply);
        if (enemyLeastAttacker != NO_ATTACKER) {
          const selfLeastDefender = leastAttackerValueCached(to, teban == SENTE ? GOTE : SENTE, ply);
          if (selfLeastDefender != NO_ATTACKER) {
            if (selfLeastDefender <= enemyLeastAttacker) score += 9_000;
          } else {
            const penalty = minI(90_000, attackerValue * 30);
            score -= penalty;
          }
        }
      }
    }
  }

  if (from == 0) {
    // 5) Drops.
    const pieceType = koma & 0x0f;
    const selfKing = teban == SENTE ? kingS : kingG;

    const distToEnemyKing =
      enemyKing > 0
        ? absI((to >> 4) - (enemyKing >> 4)) + absI((to & 0x0f) - (enemyKing & 0x0f))
        : 99;
    const distToSelfKing =
      selfKing > 0
        ? absI((to >> 4) - (selfKing >> 4)) + absI((to & 0x0f) - (selfKing & 0x0f))
        : 99;

    score += 120_000;

    if (pieceType == HI) score += 250_000;
    else if (pieceType == KA) score += 180_000;
    else if (pieceType == KI) score += 120_000;
    else if (pieceType == GI) score += 90_000;
    else if (pieceType == KE) score += 40_000;
    else if (pieceType == KY) score += 25_000;
    else if (pieceType == FU) score += 10_000;

    if (distToEnemyKing <= 4) score += (5 - distToEnemyKing) * 35_000;
    if (distToSelfKing <= 3) score += (4 - distToSelfKing) * 30_000;
    if (distToEnemyKing >= 7 && distToSelfKing >= 7) score -= 45_000;

    // Hanging-drop ordering (skipped at frontier nodes).
    if (orderDepthLeft >= 3 && distToEnemyKing > 2) {
      const enemyLeastAttacker = leastAttackerValueCached(to, teban, ply);
      if (enemyLeastAttacker != NO_ATTACKER) {
        const selfLeastDefender = leastAttackerValueCached(to, teban == SENTE ? GOTE : SENTE, ply);
        if (selfLeastDefender != NO_ATTACKER) {
          score += selfLeastDefender <= enemyLeastAttacker ? 14_000 : 3_000;
        } else {
          const pieceValue = absI(unchecked(KOMA_VALUE[koma]));
          if (pieceValue >= 1000) {
            const cheaperCapture = enemyLeastAttacker + 200 < pieceValue;
            const basePenalty = cheaperCapture
              ? minI(260_000, pieceValue * 120)
              : minI(120_000, pieceValue * 45);
            // JS: Math.floor(basePenalty * 0.6) — keep the f64 product for bit parity.
            const softened = distToSelfKing <= 3 ? <i32>Math.floor(<f64>basePenalty * 0.6) : basePenalty;
            score -= softened;
          }
        }
      }
    }
  } else {
    // 6) Quiet attacker moves approaching the enemy king.
    if (enemyKing > 0) {
      const pieceType = koma & 0x0f;
      const isAttacker =
        pieceType == HI || pieceType == KA || pieceType == KI || pieceType == GI || pieceType == KE;
      if (isAttacker) {
        const dist = absI((to >> 4) - (enemyKing >> 4)) + absI((to & 0x0f) - (enemyKing & 0x0f));
        if (dist <= 3) score += (4 - dist) * 25_000;
      }
    }
  }

  if (ply == 0) {
    const cIdx = moveKeyCompact(key);
    if (unchecked(rootBonusStamp[cIdx]) == searchEpoch) {
      score += unchecked(rootBonusVal[cIdx]);
    } else {
      const bonus = openingOrderBonusAtRootAS(m) + rootMoveSafetyOrderAdjustmentAS(m, enemyKing);
      unchecked(rootBonusStamp[cIdx] = searchEpoch);
      unchecked(rootBonusVal[cIdx] = bonus);
      score += bonus;
    }
  }

  return score;
}

/** Stable descending insertion sort over moveBuf/moveScoreBuf[base+lo .. base+hi). */
function insertionSortDesc(base: i32, lo: i32, hi: i32): void {
  for (let i = lo + 1; i < hi; i++) {
    const m = unchecked(moveBuf[base + i]);
    const s = unchecked(moveScoreBuf[base + i]);
    let j = i - 1;
    while (j >= lo && unchecked(moveScoreBuf[base + j]) < s) {
      unchecked(moveBuf[base + j + 1] = moveBuf[base + j]);
      unchecked(moveScoreBuf[base + j + 1] = moveScoreBuf[base + j]);
      j--;
    }
    unchecked(moveBuf[base + j + 1] = m);
    unchecked(moveScoreBuf[base + j + 1] = s);
  }
}

function scoreAndSortMovesAS(ply: i32, n: i32, ttMoveKey: i32, ttSecondMoveKey: i32): void {
  beginAttackCacheForNode(ply);
  const base = ply * MAX_MOVES;
  for (let i = 0; i < n; i++) {
    unchecked(moveScoreBuf[base + i] = scoreMoveAS(unchecked(moveBuf[base + i]), ply, ttMoveKey, ttSecondMoveKey));
  }
  insertionSortDesc(base, 0, n);
}

// --- Quiescence search (port of quiescence) --------------------------------------

function quiescenceAS(alpha: i32, beta: i32, ply: i32, depthLeft: i32): i32 {
  if (ply >= S_MAX_PLY - 1) {
    return evalForSideToMove();
  }
  leafCount++;
  sampleTime();
  if (stopped) return 0;

  if (!pushRepetition(getHashVal())) return repetitionDrawScore();

  const inCheck = isKingInCheck(teban);

  const standPat = evalForSideToMove();
  if (!inCheck) {
    if (standPat >= beta) {
      popRepetition();
      return standPat;
    }
    if (standPat > alpha) alpha = standPat;
    if (depthLeft <= 0) {
      popRepetition();
      return standPat;
    }
  } else {
    if (depthLeft <= 0) depthLeft = 1;
  }

  const n = generateMoves(ply);
  const base = ply * MAX_MOVES;

  // TT best move for quiescence ordering.
  const qTtMoveKey = ttLookup(getHashVal()) ? ttHitBest : 0;

  orderDepthLeft = 0;
  if (inCheck) {
    scoreAndSortMovesAS(ply, n, qTtMoveKey, 0);
  } else {
    // Partition noisy moves to the front (same swap scheme as the JS engine),
    // then order only the noisy prefix.
    let noisyCount = 0;
    for (let i = 0; i < n; i++) {
      const m = unchecked(moveBuf[base + i]);
      if (((m >> 24) & 0x7f) != EMPTY || ((m >> 23) & 1) != 0) {
        if (i != noisyCount) {
          unchecked(moveBuf[base + i] = moveBuf[base + noisyCount]);
          unchecked(moveBuf[base + noisyCount] = m);
        }
        noisyCount++;
      }
    }
    beginAttackCacheForNode(ply);
    for (let i = 0; i < noisyCount; i++) {
      unchecked(moveScoreBuf[base + i] = scoreMoveAS(unchecked(moveBuf[base + i]), ply, qTtMoveKey, 0));
    }
    insertionSortDesc(base, 0, noisyCount);
  }
  orderDepthLeft = 99;

  let quietChecksSearched = 0;
  let quietChecksTried = 0;
  let legalTried = 0;
  const mover = teban;
  const enemy = mover == SENTE ? GOTE : SENTE;

  for (let i = 0; i < n; i++) {
    const m = unchecked(moveBuf[base + i]);
    const to = m & 0xff;
    const from = (m >> 8) & 0xff;
    const koma = (m >> 16) & 0x7f;
    const promote = (m >> 23) & 1;
    const capture = (m >> 24) & 0x7f;

    const isNoisy = capture != EMPTY || promote != 0;
    const canProbeQuietCheck =
      !inCheck &&
      !isNoisy &&
      quietChecksSearched < qCheckMoveLimit &&
      quietChecksTried < qCheckTryLimit;

    if (!inCheck && !isNoisy && !canProbeQuietCheck) continue;

    // Delta pruning.
    if (!inCheck && isNoisy) {
      const victimGain = capture != EMPTY ? absI(unchecked(KOMA_VALUE[capture])) : 0;
      const promoteGain = promote != 0 ? promotionGainOf(koma) : 0;
      if (standPat + victimGain + promoteGain + DELTA_PRUNING_MARGIN <= alpha) {
        continue;
      }
    }

    // SEE-lite losing-capture pruning.
    if (!inCheck && capture != EMPTY && promote == 0 && from != 0) {
      const attackerValue = absI(unchecked(KOMA_VALUE[koma]));
      const victimValue = absI(unchecked(KOMA_VALUE[capture]));
      if (attackerValue >= 1000 && victimValue + 300 <= attackerValue) {
        const enemyKing = mover == SENTE ? kingG : kingS;
        const distToEnemyKing =
          enemyKing > 0
            ? absI((to >> 4) - (enemyKing >> 4)) + absI((to & 0x0f) - (enemyKing & 0x0f))
            : 99;
        if (distToEnemyKing > 2) {
          const enemyLeastAttacker = leastAttackerValueCached(to, mover, ply);
          if (enemyLeastAttacker != NO_ATTACKER && enemyLeastAttacker < attackerValue) {
            continue;
          }
        }
      }
    }

    makeMove(m);
    // Lazy legality — same drop shortcut as searchNodeAS: a drop (from == 0)
    // cannot expose the mover's own king, so when the mover was not already in
    // check (inCheck) every drop is legal and the scan is skipped. Bit-exact.
    if ((from != 0 || inCheck) && isKingInCheck(mover)) {
      unmakeMove(m);
      continue;
    }
    legalTried++;
    teban = enemy;

    if (!inCheck && !isNoisy) {
      quietChecksTried++;
      const givesCheck = isKingInCheck(teban);
      if (!givesCheck) {
        teban = mover;
        unmakeMove(m);
        continue;
      }
      quietChecksSearched++;
    }

    const score = -quiescenceAS(-beta, -alpha, ply + 1, depthLeft - 1);

    teban = mover;
    unmakeMove(m);
    if (stopped) {
      popRepetition();
      return 0;
    }

    if (score > alpha) {
      alpha = score;
      if (alpha >= beta) break;
    }
  }

  popRepetition();
  if (inCheck && legalTried == 0) return -S_MATE + ply;
  return alpha;
}

// --- Main search (port of search) --------------------------------------------------

function searchNodeAS(depthLeft: i32, alpha: i32, beta: i32, ply: i32): i32 {
  if (depthLeft <= 0) {
    return quiescenceAS(alpha, beta, ply, quiescenceDepthMaxG);
  }

  if (ply >= S_MAX_PLY - 1) {
    return evalForSideToMove();
  }

  nodeCount++;
  sampleTime();
  if (stopped) return 0;

  if (!pushRepetition(getHashVal())) return repetitionDrawScore();

  const alphaOrig = alpha;

  // Mate-distance bounds.
  const alphaMate = -S_MATE + ply;
  if (alpha < alphaMate) alpha = alphaMate;
  const betaMate = S_MATE - ply;
  if (beta > betaMate) beta = betaMate;
  if (alpha >= beta) {
    popRepetition();
    return alpha;
  }

  // Transposition table probe.
  const hashVal = getHashVal();
  let ttMoveKey = 0;
  let ttSecondMoveKey = 0;
  if (ttLookup(hashVal)) {
    ttMoveKey = ttHitBest;
    ttSecondMoveKey = ttHitSecond;

    const ttRemainDepth = ttHitDepth;
    if (ttRemainDepth >= depthLeft) {
      const ttValue = ttHitValue;
      const ttFlag = ttHitFlag;

      if (ttFlag == TT_EXACT) {
        if (ply == 0 && ttMoveKey != 0) rootBestKey = ttMoveKey;
        popRepetition();
        return ttValue;
      }
      if (ttFlag == TT_LOWER && ttValue >= beta) {
        popRepetition();
        return ttValue;
      }
      if (ttFlag == TT_UPPER && ttValue <= alpha) {
        popRepetition();
        return ttValue;
      }
    }
  }

  // Check extension.
  const parentInCheck = isKingInCheck(teban);
  if (parentInCheck) depthLeft++;

  // Internal Iterative Deepening.
  if (ttMoveKey == 0 && depthLeft >= 5 && !parentInCheck) {
    searchNodeAS(depthLeft - 2, alpha, beta, ply);
    if (stopped) {
      popRepetition();
      return 0;
    }
    if (ttLookup(hashVal)) {
      ttMoveKey = ttHitBest;
      ttSecondMoveKey = ttHitSecond;
    }
  }

  // Reverse futility pruning.
  if (!parentInCheck && depthLeft <= 3 && beta > -S_MATE + 10_000 && beta < S_MATE - 10_000) {
    const staticEval = evalForSideToMove();
    if (staticEval - 200 * depthLeft >= beta) {
      popRepetition();
      return staticEval;
    }
  }

  // Null-move pruning (adaptive reduction).
  if (!parentInCheck && ply > 0 && depthLeft >= 3) {
    const standPat = evalForSideToMove();
    if (standPat >= beta) {
      const nullR = nullMoveReductionG + (depthLeft >= 7 ? 1 : 0);
      const reducedDepth = depthLeft - 1 - nullR;

      const mover = teban;
      teban = mover == SENTE ? GOTE : SENTE;
      const score = -searchNodeAS(reducedDepth, -beta, -beta + 1, ply + 1);
      teban = mover;
      if (stopped) {
        popRepetition();
        return 0;
      }
      if (score >= beta) {
        popRepetition();
        return score;
      }
    }
  }

  // Pseudo-legal generation + lazy legality at make time.
  const n = generateMoves(ply);
  const base = ply * MAX_MOVES;

  orderDepthLeft = depthLeft;
  scoreAndSortMovesAS(ply, n, ttMoveKey, ttSecondMoveKey);
  orderDepthLeft = 99;

  // Futility pruning precompute (frontier nodes).
  const futilityApplicable =
    !parentInCheck && depthLeft <= 2 && alpha > -S_MATE + 10_000 && beta < S_MATE - 10_000;
  const futilityScore = futilityApplicable
    ? evalForSideToMove() + (depthLeft <= 1 ? FUTILITY_MARGIN_1 : FUTILITY_MARGIN_2)
    : 0;

  let bestMoveKey = 0;
  let searched = 0;
  let legalTried = 0;
  let prunedAny = false;

  // Late Move Pruning precompute.
  const lmpApplicable = !parentInCheck && depthLeft <= 3 && alpha > -S_MATE + 10_000;
  const lmpThreshold = 7 + 5 * depthLeft;

  const mover = teban;
  const enemy = mover == SENTE ? GOTE : SENTE;

  for (let i = 0; i < n; i++) {
    const m = unchecked(moveBuf[base + i]);
    const to = m & 0xff;
    const from = (m >> 8) & 0xff;
    const koma = (m >> 16) & 0x7f;
    const promote = (m >> 23) & 1;
    const capture = (m >> 24) & 0x7f;

    // Late Move Pruning: quiet non-drop short-range moves far from the enemy king.
    if (lmpApplicable && searched >= lmpThreshold && from != 0 && capture == EMPTY && promote == 0) {
      const movedType = koma & 0x0f;
      const isLongRange =
        movedType == KY || movedType == KA || movedType == HI || movedType == UM || movedType == RY;
      if (!isLongRange) {
        const enemyKingSq = mover == SENTE ? kingG : kingS;
        const distToEnemyKing =
          enemyKingSq > 0
            ? absI((to >> 4) - (enemyKingSq >> 4)) + absI((to & 0x0f) - (enemyKingSq & 0x0f))
            : 99;
        if (distToEnemyKing > 3) {
          prunedAny = true;
          continue;
        }
      }
    }

    // Futility skip.
    if (futilityApplicable && searched > 0 && futilityScore <= alpha && capture == EMPTY && promote == 0) {
      const movedType = koma & 0x0f;
      const isLongRange =
        movedType == KY || movedType == KA || movedType == HI || movedType == UM || movedType == RY;
      if (!isLongRange) {
        const enemyKingSq = mover == SENTE ? kingG : kingS;
        const distToEnemyKing =
          enemyKingSq > 0
            ? absI((to >> 4) - (enemyKingSq >> 4)) + absI((to & 0x0f) - (enemyKingSq & 0x0f))
            : 99;
        if (distToEnemyKing > 3) {
          prunedAny = true;
          continue;
        }
      }
    }

    makeMove(m);
    // Lazy legality. A drop (from == 0) adds a friendly piece without moving any
    // existing piece, so it can never expose the mover's own king to a new
    // attack. Therefore, when the mover was not already in check at this node
    // (parentInCheck), every drop is guaranteed legal and the isSquareAttacked
    // scan is skipped. When the mover IS in check the drop must actually block
    // or capture the checker, so the full test still runs. This yields the
    // identical legal/illegal decision as the unconditional check (bit-exact).
    if ((from != 0 || parentInCheck) && isKingInCheck(mover)) {
      unmakeMove(m);
      continue;
    }
    legalTried++;
    teban = enemy;

    // Track the path move for countermove / continuation-history at the child ply.
    if (ply + 1 < S_MAX_PLY) {
      unchecked(prevKeyByPly[ply + 1] = jsMoveKeyOf(m));
      unchecked(prevPtByPly[ply + 1] = pieceToIndexOf(m));
    }

    const baseDepthNext = depthLeft - 1;
    const canCheckExtend = ply <= CHECK_EXTENSION_MAX_PLY;
    const canLMRBase =
      !parentInCheck &&
      baseDepthNext >= 3 &&
      searched >= 4 &&
      from != 0 &&
      capture == EMPTY &&
      promote == 0;

    const givesCheck = canCheckExtend || canLMRBase ? isKingInCheck(teban) : false;

    const depthNext = canCheckExtend && givesCheck ? baseDepthNext + 1 : baseDepthNext;
    let score = 0;
    if (searched == 0) {
      score = -searchNodeAS(depthNext, -beta, -alpha, ply + 1);
    } else {
      const canLMR = canLMRBase && !givesCheck;

      let reducedDepth = depthNext;
      if (canLMR) {
        reducedDepth = depthNext - 1;
        if (searched >= 8 && depthNext >= 3) reducedDepth = depthNext - 2;
        if (searched >= 20 && depthNext >= 5) reducedDepth = depthNext - 3;
      }

      score = -searchNodeAS(reducedDepth, -alpha - 1, -alpha, ply + 1);

      if (!stopped && reducedDepth != depthNext && score > alpha) {
        score = -searchNodeAS(depthNext, -alpha - 1, -alpha, ply + 1);
      }

      if (!stopped && score > alpha && score < beta) {
        score = -searchNodeAS(depthNext, -beta, -alpha, ply + 1);
      }
    }

    teban = mover;
    unmakeMove(m);
    if (stopped) {
      popRepetition();
      return 0;
    }
    searched++;

    if (score > alpha) {
      alpha = score;
      bestMoveKey = jsMoveKeyOf(m);
      if (ply == 0) rootBestKey = bestMoveKey;

      if (alpha >= beta) {
        const key = bestMoveKey;
        if (capture == EMPTY) {
          recordKiller(ply, key);
          if (ply > 0 && ply < S_MAX_PLY) {
            const prevKey = unchecked(prevKeyByPly[ply]);
            if (prevKey != 0) unchecked(counterMoveTable[moveKeyCompact(prevKey)] = key);
            const prevPt = unchecked(prevPtByPly[ply]);
            if (prevPt >= 0) {
              const idx = prevPt * CONT_DIM + pieceToIndexOf(m);
              unchecked(contHist[idx] = contHist[idx] + depthLeft * depthLeft);
            }
          }
        }
        const hIdx = moveKeyCompact(key);
        unchecked(historyTable[hIdx] = historyTable[hIdx] + depthLeft * depthLeft);
        break;
      }
    }
  }

  // Mate detection with lazy legality.
  if (legalTried == 0) {
    popRepetition();
    if (!prunedAny) return parentInCheck ? -S_MATE + ply : 0;
    return alpha;
  }

  ttAdd(hashVal, alpha, alphaOrig, beta, bestMoveKey, depthLeft);
  popRepetition();
  return alpha;
}

// --- Engine API -------------------------------------------------------------------

/** Root move number (used only by the opening-like root ordering heuristics). */
export function setRootTesu(tesu: i32): void {
  rootTesuG = tesu;
}

// First iterative-deepening depth. Lazy SMP helpers use 1 + (helperId & 1) so
// half the helpers explore one ply ahead of the main thread (standard
// desynchronization); single-thread mode always keeps the default 1.
let searchStartDepth: i32 = 1;

export function setSearchStartDepth(d: i32): void {
  searchStartDepth = maxI(1, minI(d, 8));
}

/**
 * Search the current position (port of ShogiAIImprovedV20.getNextTe minus the
 * opening book and mate solver, which the JS host runs first).
 *
 * @param maxTimeMs   time budget in ms; <= 0 disables the time limit
 * @param maxDepth    iterative-deepening depth cap (clamped to 1..32)
 * @param quiescenceDepthMax max quiescence extension depth
 * @returns the best move packed as (koma&0x3f) | from<<6 | to<<14 | promote<<22,
 *          or 0 if the side to move has no legal move.
 */
export function searchBestMove(maxTimeMs: f64, maxDepth: i32, quiescenceDepthMax: i32): i32 {
  // Reset per-search state (mirrors the getNextTe preamble).
  searchEpoch++;
  stopped = false;
  nodeCount = 0;
  leafCount = 0;
  rootBestKey = 0;
  orderDepthLeft = 99;
  repSize = 0;
  for (let i = 0; i < S_MAX_PLY; i++) {
    unchecked(killer1[i] = 0);
    unchecked(killer2[i] = 0);
    unchecked(prevKeyByPly[i] = 0);
    unchecked(prevPtByPly[i] = -1);
  }
  for (let i = 0; i < HIST_SIZE; i++) {
    unchecked(historyTable[i] = 0);
    unchecked(counterMoveTable[i] = 0);
  }
  for (let i = 0; i < CONT_DIM * CONT_DIM; i++) unchecked(contHist[i] = 0);

  searchMaxTimeMs = maxTimeMs;
  const maxDepthL = maxI(1, minI(maxDepth, 32));
  quiescenceDepthMaxG = maxI(0, quiescenceDepthMax);

  // Unified V20 feature knobs (time-budget dependent).
  nullMoveReductionG = maxTimeMs >= 3000 ? 3 : 2;
  qCheckMoveLimit = maxTimeMs >= 2000 ? 2 : 1;
  qCheckTryLimit = maxTimeMs >= 2000 ? 8 : 2;

  searchStartTime = hostNow();

  // Root-only metadata.
  let handTotal = 0;
  for (let i = 0; i < 64; i++) handTotal += unchecked(hand[i]);
  rootHandTotalG = handTotal;
  rootInCheckG = isKingInCheck(teban);
  const selfKing = teban == SENTE ? kingS : kingG;
  rootKingDangerG = rootInCheckG ? 999 : computeKingDangerAS(teban, selfKing);

  // Root fallback: eager legal move list (order-preserving filter).
  const mover = teban;
  const enemy = mover == SENTE ? GOTE : SENTE;
  const pseudoN = generateMoves(0);
  let rootN = 0;
  for (let i = 0; i < pseudoN; i++) {
    const m = unchecked(moveBuf[i]);
    makeMove(m);
    const illegal = isKingInCheck(mover);
    unmakeMove(m);
    if (!illegal) {
      unchecked(moveBuf[rootN] = m);
      rootN++;
    }
  }
  if (rootN == 0) {
    lastSearchScore = 0;
    lastSearchDepth = 0;
    return 0;
  }

  let ttMoveKeyAtRoot = 0;
  let ttSecondMoveKeyAtRoot = 0;
  if (ttLookup(getHashVal())) {
    ttMoveKeyAtRoot = ttHitBest;
    ttSecondMoveKeyAtRoot = ttHitSecond;
  }
  scoreAndSortMovesAS(0, rootN, ttMoveKeyAtRoot, ttSecondMoveKeyAtRoot);

  let bestMoveKey = jsMoveKeyOf(unchecked(moveBuf[0]));
  let bestScore = -S_INFINITE;
  // 1-ply sanity selection among the top candidates.
  const sanityN = minI(6, rootN);
  for (let i = 0; i < sanityN; i++) {
    const m = unchecked(moveBuf[i]);
    makeMove(m);
    teban = enemy;

    const score = -evalForSideToMove();

    teban = mover;
    unmakeMove(m);

    if (score > bestScore) {
      bestScore = score;
      bestMoveKey = jsMoveKeyOf(m);
    }
  }
  let completedDepth = 0;

  for (let depth = searchStartDepth; depth <= maxDepthL; depth++) {
    rootBestKey = 0;

    // Aspiration windows with gradual (4x then full) widening.
    const useAspiration = depth >= 2;
    const alpha0 = useAspiration ? bestScore - ASPIRATION_WINDOW : -S_INFINITE;
    const beta0 = useAspiration ? bestScore + ASPIRATION_WINDOW : S_INFINITE;

    let score = searchNodeAS(depth, alpha0, beta0, 0);
    if (stopped) break;
    if (useAspiration && (score <= alpha0 || score >= beta0)) {
      const wide = ASPIRATION_WINDOW * 4;
      const alpha1 = score <= alpha0 ? bestScore - wide : alpha0;
      const beta1 = score >= beta0 ? bestScore + wide : beta0;
      rootBestKey = 0;
      score = searchNodeAS(depth, alpha1, beta1, 0);
      if (stopped) break;
      if (score <= alpha1 || score >= beta1) {
        rootBestKey = 0;
        score = searchNodeAS(depth, -S_INFINITE, S_INFINITE, 0);
        if (stopped) break;
      }
    }

    if (rootBestKey != 0) {
      bestMoveKey = rootBestKey;
      bestScore = score;
      completedDepth = depth;
    }

    // Forced mate found: stop early.
    if (bestScore >= S_MATE - 10_000) break;

    if (timeUpNow()) break;
    if (sharedTtEnabled && hostSharedShouldStop() != 0) break;
  }

  lastSearchScore = bestScore;
  lastSearchDepth = completedDepth;
  return bestMoveKey;
}

// --- Search stats -------------------------------------------------------------------

export function getSearchScore(): i32 {
  return lastSearchScore;
}

export function getSearchDepth(): i32 {
  return lastSearchDepth;
}

export function getSearchNodes(): i32 {
  return nodeCount;
}

export function getSearchLeaves(): i32 {
  return leafCount;
}
