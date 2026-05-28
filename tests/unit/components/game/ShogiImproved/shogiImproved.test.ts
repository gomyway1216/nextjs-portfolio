import { describe, expect, it } from 'vitest';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { getOpeningMoveImproved } from '@/components/game/ShogiImproved/OpeningBookImproved';
import { SENTE, SFU, type Te } from '@/components/game/ShogiImproved/types';

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

  it('continues 2六歩△3四歩 with 7六歩 without a safety-filter false negative', () => {
    const k = InitialPositionImproved.createInitialPosition();
    k.setTeban(SENTE);

    playMove(k, 2, 7, 2, 6, false);
    playMove(k, 3, 3, 3, 4, false);

    const expected = findMove(k, 7, 7, 7, 6, false);
    const move = getOpeningMoveImproved(k, 'medium');

    expect(move).not.toBeNull();
    expect(expected.equals(move)).toBe(true);
  });
});
