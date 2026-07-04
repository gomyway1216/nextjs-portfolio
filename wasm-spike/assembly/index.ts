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
//   (PSQT incremental updates are NOT ported — see README caveats.)
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
const KA: i32 = 6;
const HI: i32 = 7;
const OU: i32 = 8;

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
const MAX_PLY: i32 = 32;    // perft depth + scratch plies for recursive uchifuzume checks
const moveBuf = new StaticArray<i32>(MAX_MOVES * MAX_PLY);

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
  kingS = 0;
  kingG = 0;
  evalMaterial = 0;
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
  banHash = 0;
  handHash = 0;
  kingS = 0;
  kingG = 0;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const pos = (suji << 4) + dan;
      const koma = unchecked(ban[pos]);
      if (koma == SOU) kingS = pos;
      if (koma == GOU) kingG = pos;
      evalMaterial += unchecked(KOMA_VALUE[koma]);
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

  if (koma == SOU) kingS = to;
  else if (koma == GOU) kingG = to;
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

  // Restore captured piece (or EMPTY).
  unchecked(ban[to] = capture);
  banHash ^= unchecked(HASH_SEED[capture * BAN_SIZE + to]);
  evalMaterial += unchecked(KOMA_VALUE[capture]);

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
    if (promote != 0) {
      evalMaterial -= unchecked(KOMA_VALUE[koma | PROMOTE]);
      evalMaterial += unchecked(KOMA_VALUE[koma]);
    }
  }

  if (koma == SOU) kingS = from;
  else if (koma == GOU) kingG = from;
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
  for (let type = FU; type <= HI; type++) {
    const koma = type | teban;
    if (unchecked(hand[koma]) <= 0) continue;

    for (let suji = 0x10; suji <= 0x90; suji += 0x10) {
      // Nifu (double pawn) restriction.
      if (type == FU) {
        let isNifu = false;
        for (let dan = 1; dan <= 9; dan++) {
          if (unchecked(ban[suji + dan]) == koma) {
            isNifu = true;
            break;
          }
        }
        if (isNifu) continue;
      }

      for (let dan = 1; dan <= 9; dan++) {
        // Knight drop rank restrictions.
        if (type == KE) {
          if (teban == SENTE && dan <= 2) continue;
          if (teban == GOTE && dan >= 8) continue;
        }
        // Pawn / lance drop rank restrictions.
        if (type == FU || type == KY) {
          if (teban == SENTE && dan == 1) continue;
          if (teban == GOTE && dan == 9) continue;
        }

        const to = suji + dan;
        if (unchecked(ban[to]) != EMPTY) continue;

        // Pawn drop checkmate (uchifuzume) is illegal.
        if (type == FU && isUtiFuDume(to, ply + 1)) continue;

        unchecked(moveBuf[base + n] = encodeMove(koma, 0, to, false, EMPTY));
        n++;
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
// Harness API (parity.ts / bench-wasm.mjs)
// ---------------------------------------------------------------------------

/** Expose bookkeeping so the harness can sanity-check make/unmake symmetry. */
export function getEvalMaterial(): i32 {
  return evalMaterial;
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
