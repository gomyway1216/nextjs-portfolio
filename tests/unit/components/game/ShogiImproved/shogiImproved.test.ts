import { describe, expect, it } from 'vitest';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import type { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';
import { MateSolverImproved } from '@/components/game/ShogiImproved/MateSolverImproved';
import { getOpeningMoveImproved } from '@/components/game/ShogiImproved/OpeningBookImproved';
import { ShogiAIImprovedV19 } from '@/components/game/ShogiImproved/ShogiAIImprovedV19';
import { ShogiAIImprovedV20 } from '@/components/game/ShogiImproved/ShogiAIImprovedV20';
import { EMPTY, GFU, GOU, SENTE, SFU, SKI, SOU, SRY, type Te } from '@/components/game/ShogiImproved/types';

function pos(suji: number, dan: number): number {
  return (suji << 4) + dan;
}

function findMove(
  k: ReturnType<typeof InitialPositionImproved.createInitialPosition>,
  fromSuji: number,
  fromDan: number,
  toSuji: number,
  toDan: number,
  promote = false
): Te {
  const from = pos(fromSuji, fromDan);
  const to = pos(toSuji, toDan);
  const koma = from === 0 ? 0 : k.get(from);
  const legal = GenerateMovesImproved.generateLegalMoves(k);
  const te =
    legal.find((m) => m.from === from && m.to === to && m.promote === promote && m.koma === koma) ??
    legal.find((m) => m.from === from && m.to === to && m.promote === promote) ??
    null;

  expect(te, `expected legal move from=${from} to=${to} promote=${promote}`).not.toBeNull();
  return te as Te;
}

function playMove(
  k: ReturnType<typeof InitialPositionImproved.createInitialPosition>,
  fromSuji: number,
  fromDan: number,
  toSuji: number,
  toDan: number,
  promote = false
): void {
  const te = findMove(k, fromSuji, fromDan, toSuji, toDan, promote).clone();
  te.capture = k.get(te.to);
  k.move(te);
  k.toggleTeban();
}

/** Play a drop move (`koma` is the base piece type, e.g. GFU; teban is taken from `k`). */
function playDrop(
  k: ReturnType<typeof InitialPositionImproved.createInitialPosition>,
  koma: number,
  toSuji: number,
  toDan: number
): void {
  const to = pos(toSuji, toDan);
  const legal = GenerateMovesImproved.generateLegalMoves(k);
  const te = legal.find((m) => m.from === 0 && m.to === to && m.koma === koma) ?? null;
  expect(te, `expected legal drop koma=${koma} to=${to}`).not.toBeNull();
  const move = (te as Te).clone();
  move.capture = EMPTY;
  k.move(move);
  k.toggleTeban();
}

/**
 * Verify that `firstMove` starts a forced mate within `pliesLeft` plies.
 *
 * Ground truth for the assertions:
 * - every attacker move must give check (asserted via `isKingInCheck`)
 * - the leaves must be actual checkmates (in check + `generateLegalMoves().length === 0`)
 * - EVERY legal defender reply is enumerated (no reply can escape)
 *
 * The mate solver only proposes the interior attacker moves; if it proposed a wrong move,
 * the checkmate/check assertions at the leaves would fail.
 */
function verifyForcedMate(k0: KyokumenImproved, firstMove: Te, pliesLeft: number): void {
  const k = k0.clone();
  const te = firstMove.clone();
  te.capture = k.get(te.to);
  k.move(te);
  k.toggleTeban();

  // Every move of a mating sequence must check the defender's king.
  expect(GenerateMovesImproved.isKingInCheck(k, k.teban)).toBe(true);

  const replies = GenerateMovesImproved.generateLegalMoves(k);
  if (replies.length === 0) return; // checkmate reached

  // Defender still has replies: the attacker must be able to keep mating within the budget.
  expect(pliesLeft, 'defender survived the announced mate length').toBeGreaterThan(1);

  for (const reply of replies) {
    const k2 = k.clone();
    const r = reply.clone();
    r.capture = k2.get(r.to);
    k2.move(r);
    k2.toggleTeban();

    const solver = new MateSolverImproved();
    const next = solver.solve(k2, { maxPlies: pliesLeft - 2, maxNodes: 1_000_000, maxTimeMs: 0 });
    expect(next, 'attacker must keep a forced mate after every defender reply').not.toBeNull();
    verifyForcedMate(k2, next as Te, pliesLeft - 2);
  }
}

describe('ShogiImproved', () => {
  it('keeps PSQT eval stable across move/back', () => {
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(SENTE);

    const hash0 = k.HashVal;
    const psqt0 = k.psqtEval;
    const eval0 = k.evaluate();

    const legal = GenerateMovesImproved.generateLegalMoves(k);
    expect(legal.length).toBeGreaterThan(0);

    const te = legal[0].clone();
    te.capture = k.get(te.to);

    k.move(te);
    k.back(te);

    expect(k.HashVal).toBe(hash0);
    expect(k.psqtEval).toBe(psqt0);
    expect(k.evaluate()).toBe(eval0);
  });

  it('returns a legal opening book move from the initial position', () => {
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(SENTE);

    const move = getOpeningMoveImproved(k, 'master');
    expect(move).not.toBeNull();

    const legal = GenerateMovesImproved.generateLegalMoves(k);
    expect(legal.some((m) => m.equals(move))).toBe(true);
  });

  it('returns null outside the opening phase proxy', () => {
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(SENTE);

    k.hand[SFU] = 3;
    k.initAll();

    const move = getOpeningMoveImproved(k, 'master');
    expect(move).toBeNull();
  });

  it('V20 finds a mate in one', () => {
    const E = EMPTY;
    const board: number[][] = [
      [E, E, E, E, GOU, E, E, E, E], // dan 1 (suji 9..1)
      [E, E, E, E, E, E, E, E, E], // dan 2
      [E, E, E, E, E, SKI, E, E, E], // dan 3 (suji 4)
      [E, E, E, E, E, E, E, E, E], // dan 4
      [E, E, E, E, SRY, E, E, E, E], // dan 5
      [E, E, E, E, E, E, E, E, E], // dan 6
      [E, E, E, E, E, E, E, E, E], // dan 7
      [E, E, E, E, E, E, E, E, E], // dan 8
      [E, E, E, E, SOU, E, E, E, E], // dan 9
    ];

    const k = InitialPositionImproved.createInitialPosition();
    InitialPositionImproved.setupCustom(k, board);
    k.hand[SFU] = 3;
    k.initAll();
    k.setTeban(SENTE);

    const ai = new ShogiAIImprovedV20();
    const move = ai.getNextTe(k, 60, { difficulty: 'medium', maxTimeMs: 0, maxDepth: 3 });
    expect(move).not.toBeNull();

    const te = (move as Te).clone();
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
    expect(GenerateMovesImproved.isKingInCheck(k, k.teban)).toBe(true);
    expect(GenerateMovesImproved.generateLegalMoves(k).length).toBe(0);
  });

  it('V20 finds a mate in three via the mate solver', () => {
    // Gote king 5一 (bare), Sente dragon 6四, gold in hand.
    // Forced line: ▲5三竜 (check through 5二) △4一玉/△6一玉 ▲4二金打/▲6二金打 (gold backed by the
    // dragon's diagonal) — mate in 3. There is no mate in 1 (adjacent gold drops are undefended).
    const E = EMPTY;
    const board: number[][] = [
      [E, E, E, E, GOU, E, E, E, E], // dan 1 (suji 9..1)
      [E, E, E, E, E, E, E, E, E], // dan 2
      [E, E, E, E, E, E, E, E, E], // dan 3
      [E, E, E, SRY, E, E, E, E, E], // dan 4 (suji 6)
      [E, E, E, E, E, E, E, E, E], // dan 5
      [E, E, E, E, E, E, E, E, E], // dan 6
      [E, E, E, E, E, E, E, E, E], // dan 7
      [E, E, E, E, E, E, E, E, E], // dan 8
      [E, E, E, E, SOU, E, E, E, E], // dan 9
    ];

    const k = InitialPositionImproved.createInitialPosition();
    InitialPositionImproved.setupCustom(k, board);
    k.hand[SKI] = 1;
    k.initAll();
    k.setTeban(SENTE);

    const ai = new ShogiAIImprovedV20();
    // maxDepth 2 is too shallow for the main search to prove a 3-ply mate on its own,
    // so this exercises the dedicated mate-solver path.
    const move = ai.getNextTe(k, 60, { difficulty: 'medium', maxTimeMs: 0, maxDepth: 2 });
    expect(move).not.toBeNull();

    verifyForcedMate(k, move as Te, 3);
  });

  it('MateSolver solves a mate in five with a defender interposition', () => {
    // Same shape as the mate-in-3 above, but Gote holds a pawn (can interpose △5二歩 after ▲5三竜)
    // and Sente holds two golds. Forced line:
    // ▲5三竜 △5二歩打 ▲4二金打 △6一玉 ▲6二金打 (mate) — and the immediate king moves
    // △4一玉/△6一玉 run into the 3-ply gold mates. No mate in 3 exists (verified by brute force).
    const E = EMPTY;
    const board: number[][] = [
      [E, E, E, E, GOU, E, E, E, E], // dan 1 (suji 9..1)
      [E, E, E, E, E, E, E, E, E], // dan 2
      [E, E, E, E, E, E, E, E, E], // dan 3
      [E, E, E, SRY, E, E, E, E, E], // dan 4 (suji 6)
      [E, E, E, E, E, E, E, E, E], // dan 5
      [E, E, E, E, E, E, E, E, E], // dan 6
      [E, E, E, E, E, E, E, E, E], // dan 7
      [E, E, E, E, E, E, E, E, E], // dan 8
      [E, E, E, E, SOU, E, E, E, E], // dan 9
    ];

    const k = InitialPositionImproved.createInitialPosition();
    InitialPositionImproved.setupCustom(k, board);
    k.hand[SKI] = 2;
    k.hand[GFU] = 1;
    k.initAll();
    k.setTeban(SENTE);

    const solver = new MateSolverImproved();

    // No mate within 3 plies: the pawn interposition refutes every 3-ply attempt.
    expect(solver.solve(k, { maxPlies: 3, maxNodes: 1_000_000, maxTimeMs: 0 })).toBeNull();

    // ...but there is a forced mate in 5.
    const move = solver.solve(k, { maxPlies: 5, maxNodes: 1_000_000, maxTimeMs: 0 });
    expect(move).not.toBeNull();
    verifyForcedMate(k, move as Te, 5);

    // The engine-integrated path finds it too (shallow main depth → solver must provide it).
    const ai = new ShogiAIImprovedV20();
    const engineMove = ai.getNextTe(k, 60, { difficulty: 'medium', maxTimeMs: 0, maxDepth: 2 });
    expect(engineMove).not.toBeNull();
    verifyForcedMate(k, engineMove as Te, 5);
  });

  it('MateSolver returns null when there is no mate', () => {
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(SENTE);

    const solver = new MateSolverImproved();
    expect(solver.solve(k, { maxPlies: 9, maxNodes: 200_000, maxTimeMs: 200 })).toBeNull();
  });

  it('V19 finds a mate in one', () => {
    // Gote king on 5一, Sente dragon on 5五 (open 5th file), Sente gold on 4三 guarding 5二.
    // 5二竜 is mate: every king square around 5一 is covered and the dragon is defended by the gold.
    const E = EMPTY;
    const board: number[][] = [
      [E, E, E, E, GOU, E, E, E, E], // dan 1 (suji 9..1)
      [E, E, E, E, E, E, E, E, E], // dan 2
      [E, E, E, E, E, SKI, E, E, E], // dan 3 (suji 4 -> index 5)
      [E, E, E, E, E, E, E, E, E], // dan 4
      [E, E, E, E, SRY, E, E, E, E], // dan 5
      [E, E, E, E, E, E, E, E, E], // dan 6
      [E, E, E, E, E, E, E, E, E], // dan 7
      [E, E, E, E, E, E, E, E, E], // dan 8
      [E, E, E, E, SOU, E, E, E, E], // dan 9
    ];

    const k = InitialPositionImproved.createInitialPosition();
    InitialPositionImproved.setupCustom(k, board);
    // Some pawns in hand push the position outside the opening-book proxy so the search runs.
    k.hand[SFU] = 3;
    k.initAll();
    k.setTeban(SENTE);

    const ai = new ShogiAIImprovedV19();
    const move = ai.getNextTe(k, 60, { difficulty: 'medium', maxTimeMs: 0, maxDepth: 3 });
    expect(move).not.toBeNull();

    // Applying the engine's move must leave Gote with no legal moves while in check (checkmate).
    const te = (move as Te).clone();
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
    expect(GenerateMovesImproved.isKingInCheck(k, k.teban)).toBe(true);
    expect(GenerateMovesImproved.generateLegalMoves(k).length).toBe(0);
  });

  it('continues 2六歩△3四歩 with a joseki move without a safety-filter false negative', () => {
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(SENTE);

    playMove(k, 2, 7, 2, 6, false);
    playMove(k, 3, 3, 3, 4, false);

    // Both ▲7六歩 (居飛車/振り飛車系) and ▲2五歩 (相掛かり/棒銀系) are proper joseki here.
    const expected76 = findMove(k, 7, 7, 7, 6, false);
    const expected25 = findMove(k, 2, 6, 2, 5, false);
    const move = getOpeningMoveImproved(k, 'medium');

    expect(move).not.toBeNull();
    expect(expected76.equals(move) || expected25.equals(move)).toBe(true);
  });

  it('answers ▲2五歩 with △3三角 (anti climbing-silver joseki)', () => {
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(SENTE);

    playMove(k, 2, 7, 2, 6, false); // ▲2六歩
    playMove(k, 3, 3, 3, 4, false); // △3四歩
    playMove(k, 2, 6, 2, 5, false); // ▲2五歩

    const expected = findMove(k, 2, 2, 3, 3, false); // △3三角
    const move = getOpeningMoveImproved(k, 'medium');

    expect(move).not.toBeNull();
    expect(expected.equals(move)).toBe(true);
  });

  it('covers the 角道相掛かり ▲6六歩 position with a sound move (not the weak △8四飛)', () => {
    // ▲7六歩△8四歩▲2六歩△8五歩▲7七角△3四歩▲6六歩 (後手番).
    // Previously out-of-book: NNUE played △8四飛 (浮き飛車), ~100cp+ worse than best per
    // YaneuraOu depth20. The book now supplies △3三角 or △3二銀 (both engine-approved).
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(SENTE);
    playMove(k, 7, 7, 7, 6, false); // ▲7六歩
    playMove(k, 8, 3, 8, 4, false); // △8四歩
    playMove(k, 2, 7, 2, 6, false); // ▲2六歩
    playMove(k, 8, 4, 8, 5, false); // △8五歩
    playMove(k, 8, 8, 7, 7, false); // ▲7七角
    playMove(k, 3, 3, 3, 4, false); // △3四歩
    playMove(k, 6, 7, 6, 6, false); // ▲6六歩

    const move = getOpeningMoveImproved(k, 'medium');
    expect(move).not.toBeNull();

    // Must be one of the two engine-approved book replies, and never the weak △8四飛.
    const bishop33 = findMove(k, 2, 2, 3, 3, false); // △3三角
    const silver32 = findMove(k, 3, 1, 3, 2, false); // △3二銀
    const uki84 = findMove(k, 8, 2, 8, 4, false); // △8四飛 (the weak move to avoid)
    expect(uki84.equals(move)).toBe(false);
    expect(bishop33.equals(move) || silver32.equals(move)).toBe(true);
  });

  it('covers the 相掛かり ▲2六飛→▲3八銀 position with a sound move', () => {
    // ▲2六歩△8四歩▲2五歩△8五歩▲7八金△3二金▲2四歩△同歩▲同飛△2三歩▲2六飛△7二銀▲3八銀 (後手番).
    // Previously out-of-book. The book now supplies △3四歩 (YaneuraOu depth20 best).
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(SENTE);
    playMove(k, 2, 7, 2, 6, false); // ▲2六歩
    playMove(k, 8, 3, 8, 4, false); // △8四歩
    playMove(k, 2, 6, 2, 5, false); // ▲2五歩
    playMove(k, 8, 4, 8, 5, false); // △8五歩
    playMove(k, 6, 9, 7, 8, false); // ▲7八金
    playMove(k, 4, 1, 3, 2, false); // △3二金
    playMove(k, 2, 5, 2, 4, false); // ▲2四歩
    playMove(k, 2, 3, 2, 4, false); // △同歩
    playMove(k, 2, 8, 2, 4, false); // ▲同飛
    // △2三歩 (drop): use findMove's from={0,0} handling; the piece is a pawn from hand.
    playDrop(k, GFU, 2, 3); // △2三歩打
    playMove(k, 2, 4, 2, 6, false); // ▲2六飛
    playMove(k, 7, 1, 7, 2, false); // △7二銀
    playMove(k, 3, 9, 3, 8, false); // ▲3八銀

    const move = getOpeningMoveImproved(k, 'medium');
    expect(move).not.toBeNull();

    const push34 = findMove(k, 3, 3, 3, 4, false); // △3四歩
    expect(push34.equals(move)).toBe(true);
  });
});
