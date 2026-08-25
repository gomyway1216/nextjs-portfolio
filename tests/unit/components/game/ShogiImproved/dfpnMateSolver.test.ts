import { describe, expect, it } from 'vitest';
import { DfpnMateSolverImproved } from '@/components/game/ShogiImproved/DfpnMateSolverImproved';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';
import { MateSolverImproved } from '@/components/game/ShogiImproved/MateSolverImproved';
import {
  EMPTY,
  GFU,
  GKY,
  GOU,
  SENTE,
  SFU,
  SKE,
  SKI,
  SOU,
  SHI,
  SRY,
  type Te,
} from '@/components/game/ShogiImproved/types';

const E = EMPTY;

/**
 * Build a position from a dan-major board (row 0 = dan 1, column 0 = suji 9), plus hand pieces.
 */
function build(board: number[][], hand: Record<number, number> = {}, teban = SENTE): KyokumenImproved {
  const k = InitialPositionImproved.createInitialPosition();
  InitialPositionImproved.setupCustom(k, board);
  for (const [koma, count] of Object.entries(hand)) k.hand[Number(koma)] = count;
  k.initAll();
  k.setTeban(teban);
  return k;
}

function empty9(): number[][] {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => E));
}

/**
 * Independently verify that `first` forces mate, using only `generateLegalMoves`:
 * every attacker move must be legal and give check, every legal defender reply must be covered,
 * and every leaf must be a real checkmate. `continuation` only *suggests* attacker moves — a wrong
 * suggestion can make this fail, never make it pass on a position that is not mated.
 *
 * Returns the mate length in plies.
 */
function verifyForcedMate(
  k0: KyokumenImproved,
  first: Te,
  continuation: (k: KyokumenImproved) => Te | null
): number {
  const k = k0.clone();
  const defender = k.teban === SENTE ? 1 << 5 : 1 << 4;

  const legal = GenerateMovesImproved.generateLegalMoves(k);
  expect(legal.some((m) => m.equals(first)), 'proposed move must be legal').toBe(true);

  const move = first.clone();
  move.capture = k.get(move.to);
  k.move(move);
  k.toggleTeban();
  expect(GenerateMovesImproved.isKingInCheck(k, defender), 'every attacker move must check').toBe(true);

  return 1 + verifyDefenderNode(k, defender, continuation);
}

function verifyDefenderNode(
  k: KyokumenImproved,
  defender: number,
  continuation: (k: KyokumenImproved) => Te | null
): number {
  const replies = GenerateMovesImproved.generateLegalMoves(k);
  if (replies.length === 0) return 0; // checkmate

  let worst = 0;
  for (const reply of replies) {
    const k2 = k.clone();
    const r = reply.clone();
    r.capture = k2.get(r.to);
    k2.move(r);
    k2.toggleTeban();

    const next = continuation(k2);
    expect(next, 'attacker must keep a forced mate after every defender reply').not.toBeNull();
    worst = Math.max(worst, 1 + verifyForcedMate(k2, next as Te, continuation));
  }
  return worst;
}

describe('DfpnMateSolverImproved', () => {
  const solver = new DfpnMateSolverImproved();
  const helper = new DfpnMateSolverImproved();
  const cont = (k: KyokumenImproved): Te | null =>
    helper.solve(k, { maxPlies: 31, maxNodes: 500_000, maxTimeMs: 0 });

  it('finds a mate in one', () => {
    // Gote king 5一 (bare), Sente dragon 5五 and gold 4三: ▲5二竜 is mate.
    const board = empty9();
    board[0][4] = GOU; // 5一
    board[2][5] = SKI; // 4三
    board[4][4] = SRY; // 5五
    board[8][4] = SOU; // 5九
    const k = build(board);

    const res = solver.solveDetailed(k, { maxPlies: 31, maxNodes: 200_000, maxTimeMs: 0 });
    expect(res).not.toBeNull();
    expect(res!.mateDepth).toBe(1);
    expect(verifyForcedMate(k, res!.move, cont)).toBe(1);
  });

  it('finds a mate in three', () => {
    // Gote king 5一 (bare), Sente dragon 6四, gold in hand.
    // ▲5三竜 △4一玉/△6一玉 ▲4二金打/▲6二金打.
    const board = empty9();
    board[0][4] = GOU; // 5一
    board[3][3] = SRY; // 6四
    board[8][4] = SOU; // 5九
    const k = build(board, { [SKI]: 1 });

    const res = solver.solveDetailed(k, { maxPlies: 31, maxNodes: 500_000, maxTimeMs: 0 });
    expect(res).not.toBeNull();
    expect(verifyForcedMate(k, res!.move, cont)).toBe(res!.mateDepth);
    expect(res!.mateDepth).toBe(3);
  });

  it('solves a mate with a defender interposition', () => {
    // Same shape, but Gote holds a pawn (△5二歩 interposes) and Sente holds two golds.
    const board = empty9();
    board[0][4] = GOU; // 5一
    board[3][3] = SRY; // 6四
    board[8][4] = SOU; // 5九
    const k = build(board, { [SKI]: 2, [GFU]: 1 });

    const res = solver.solveDetailed(k, { maxPlies: 31, maxNodes: 1_000_000, maxTimeMs: 0 });
    expect(res).not.toBeNull();
    // The df-pn proof tree is not necessarily the shortest mate, so assert the verified length
    // matches what the solver reported rather than a fixed number.
    expect(verifyForcedMate(k, res!.move, cont)).toBe(res!.mateDepth);
    // ...and the shortest mate really is 5 plies (the shipped iterative-deepening solver is exact).
    const legacy = new MateSolverImproved();
    expect(legacy.solve(k, { maxPlies: 3, maxNodes: 1_000_000, maxTimeMs: 0 })).toBeNull();
    expect(legacy.solve(k, { maxPlies: 5, maxNodes: 1_000_000, maxTimeMs: 0 })).not.toBeNull();
  });

  it('never proposes an uchifuzume (pawn-drop mate)', () => {
    // Gote king 5一, boxed in by its own lances on 4二/6二; Sente knight 5三 covers 4一/6一 and
    // Sente knight 4四 defends the 5二 square.
    //
    // With a pawn in hand, ▲5二歩打 would be mate — which is exactly why it is illegal — and there
    // is no other mate, so the solver must report none. With a gold in hand instead, the identical
    // drop ▲5二金打 IS mate, which proves the "no mate" verdict above is the uchifuzume rule and
    // not a failure to see the drop.
    const board = empty9();
    board[0][4] = GOU; // 5一
    board[1][5] = GKY; // 4二
    board[1][3] = GKY; // 6二
    board[2][4] = SKE; // 5三
    board[3][5] = SKE; // 4四
    board[8][4] = SOU; // 5九

    const withPawn = build(board, { [SFU]: 1 });
    expect(GenerateMovesImproved.isKingInCheck(withPawn, 1 << 5), 'gote must not start in check').toBe(false);
    expect(solver.solve(withPawn, { maxPlies: 9, maxNodes: 500_000, maxTimeMs: 0 })).toBeNull();

    // The rule is enforced at the source: the drop is not even generated.
    const pawnDropTo52 = GenerateMovesImproved.generateLegalMoves(withPawn).find(
      (m) => m.from === 0 && m.to === (5 << 4) + 2
    );
    expect(pawnDropTo52, '5二歩打 must not be generated (uchifuzume)').toBeUndefined();

    // The same square with a gold instead of a pawn IS mate, so the verdict above is the rule and
    // not a blind spot for drops on that square.
    const withGold = build(board, { [SKI]: 1 });
    const goldDropTo52 = GenerateMovesImproved.generateLegalMoves(withGold).find(
      (m) => m.from === 0 && m.to === (5 << 4) + 2
    );
    expect(goldDropTo52).toBeDefined();
    const after = withGold.clone();
    const drop = goldDropTo52!.clone();
    drop.capture = EMPTY;
    after.move(drop);
    after.toggleTeban();
    expect(GenerateMovesImproved.isKingInCheck(after, 1 << 5)).toBe(true);
    expect(GenerateMovesImproved.generateLegalMoves(after).length).toBe(0);

    const res = solver.solveDetailed(withGold, { maxPlies: 9, maxNodes: 500_000, maxTimeMs: 0 });
    expect(res).not.toBeNull();
    expect(res!.mateDepth).toBe(1);
    expect(verifyForcedMate(withGold, res!.move, cont)).toBe(1);
  });

  it('returns null when there is no mate', () => {
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(SENTE);
    expect(solver.solve(k, { maxPlies: 31, maxNodes: 200_000, maxTimeMs: 200 })).toBeNull();
    expect(solver.stats.proved).toBe(false);
  });

  it('terminates on an endless-check position without proving a mate', () => {
    // Bare Gote king in the open with a lone Sente rook: the attacker can check forever but a rook
    // alone cannot mate. Without repetition handling this is an infinite df-pn expansion.
    const board = empty9();
    board[4][4] = GOU; // 5五
    board[0][8] = SHI; // 1一
    board[8][0] = SOU; // 9九
    const k = build(board);

    const move = solver.solve(k, { maxPlies: 31, maxNodes: 300_000, maxTimeMs: 3000 });
    expect(move).toBeNull();
  });

  it('does not mutate the caller position', () => {
    const board = empty9();
    board[0][4] = GOU; // 5一
    board[3][3] = SRY; // 6四
    board[8][4] = SOU; // 5九
    const k = build(board, { [SKI]: 2, [GFU]: 1 });

    const before = {
      hash: k.HashVal,
      secondary: k.SecondaryHashVal,
      teban: k.teban,
      board: [...k.ban],
      hand: [...k.hand],
    };
    solver.solve(k, { maxPlies: 31, maxNodes: 500_000, maxTimeMs: 0 });

    expect(k.HashVal).toBe(before.hash);
    expect(k.SecondaryHashVal).toBe(before.secondary);
    expect(k.teban).toBe(before.teban);
    expect([...k.ban]).toEqual(before.board);
    expect([...k.hand]).toEqual(before.hand);
  });

  it('respects the node budget', () => {
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(SENTE);
    // A tiny budget must abort rather than run the position to a verdict.
    expect(solver.solve(k, { maxPlies: 31, maxNodes: 1, maxTimeMs: 0 })).toBeNull();

    const board = empty9();
    board[0][4] = GOU;
    board[3][3] = SRY;
    board[8][4] = SOU;
    const mateIn3 = build(board, { [SKI]: 1 });
    expect(solver.solve(mateIn3, { maxPlies: 31, maxNodes: 2, maxTimeMs: 0 })).toBeNull();
  });

  it('finds a long forced mate the 9-ply iterative-deepening solver cannot reach', () => {
    // A real self-play endgame (Gote to move) with a verified 11-ply forced mate. The shipped
    // solver is capped at 9 plies in production, so this is exactly the class of mate df-pn adds.
    const k = sfenToPosition(LONG_MATE_SFEN);

    const legacy = new MateSolverImproved();
    expect(legacy.solve(k, { maxPlies: 9, maxNodes: 5_000_000, maxTimeMs: 0 })).toBeNull();

    const res = solver.solveDetailed(k, { maxPlies: 31, maxNodes: 5_000_000, maxTimeMs: 0 });
    expect(res).not.toBeNull();
    expect(res!.mateDepth).toBeGreaterThanOrEqual(11);
    expect(verifyForcedMate(k, res!.move, cont)).toBe(res!.mateDepth);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// SFEN helper (kept local to the test so the fixture is readable)
// ---------------------------------------------------------------------------

/**
 * A real self-play endgame with a *verified* 11-ply forced mate for Sente (extracted from the
 * distillation self-play corpus and labelled by exhaustive iterative deepening; see
 * `wasm-spike/mate-solver-bench.ts`). Longer than the 9-ply horizon the shipped solver runs with.
 */
const LONG_MATE_SFEN = '6g1l/lpkg1s3/2sp1p3/pP2+R4/4NB2p/P1n1P1r2/L1NPGP+nPP/1B1GK1S2/1s6L b 5Pp 75';

const SFEN_PIECE: Record<string, number> = { P: 1, L: 2, N: 3, S: 4, G: 5, B: 6, R: 7, K: 8 };
const SFEN_PROMOTED: Record<string, number> = { P: 9, L: 10, N: 11, S: 12, B: 14, R: 15 };

function sfenToPosition(sfen: string): KyokumenImproved {
  const [boardS, turnS, handS] = sfen.trim().split(/\s+/);
  const board = empty9();
  const rows = boardS!.split('/');
  for (let r = 0; r < 9; r++) {
    let suji = 9;
    const row = rows[r]!;
    for (let i = 0; i < row.length; i++) {
      let c = row[i]!;
      if (c >= '1' && c <= '9') {
        suji -= parseInt(c, 10);
        continue;
      }
      let promoted = false;
      if (c === '+') {
        promoted = true;
        i++;
        c = row[i]!;
      }
      const upper = c.toUpperCase();
      const isBlack = c === upper;
      const type = promoted ? SFEN_PROMOTED[upper]! : SFEN_PIECE[upper]!;
      board[r]![9 - suji] = type | (isBlack ? SENTE : 1 << 5);
      suji--;
    }
  }

  const hand: Record<number, number> = {};
  if (handS && handS !== '-') {
    let count = 0;
    for (let i = 0; i < handS.length; i++) {
      const c = handS[i]!;
      if (c >= '0' && c <= '9') {
        count = count * 10 + parseInt(c, 10);
        continue;
      }
      const n = count > 0 ? count : 1;
      count = 0;
      const upper = c.toUpperCase();
      const side = c === upper ? SENTE : 1 << 5;
      const koma = side | SFEN_PIECE[upper]!;
      hand[koma] = (hand[koma] ?? 0) + n;
    }
  }

  return build(board, hand, turnS === 'w' ? 1 << 5 : SENTE);
}
