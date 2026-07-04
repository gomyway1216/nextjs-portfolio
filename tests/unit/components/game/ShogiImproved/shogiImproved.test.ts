import { describe, expect, it } from 'vitest';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { getOpeningMoveImproved } from '@/components/game/ShogiImproved/OpeningBookImproved';
import { ShogiAIImprovedV19 } from '@/components/game/ShogiImproved/ShogiAIImprovedV19';
import { EMPTY, GOU, SENTE, SFU, SKI, SOU, SRY, type Te } from '@/components/game/ShogiImproved/types';

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
});
