import { describe, expect, it } from 'vitest';

import { positionFromSfen } from '../../../../../ml/shogi-sfen';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { KyokumenImproved } from '@/components/game/ShogiImproved/KyokumenImproved';
import { ShogiAIImprovedV20 } from '@/components/game/ShogiImproved/ShogiAIImprovedV20';
import { TranspositionTableImprovedPackedDual } from '@/components/game/ShogiImproved/TranspositionTableImprovedPackedDual';
import { GHI, GOTE, GRY, type Te } from '@/components/game/ShogiImproved/types';

const COLLISION_A = '1nk1s2n1/l1rs1+P3/+Pgp5N/1P1pp1ppl/p4P3/1GPPS+bP1p/B3P2P1/L3GG3/1NK1RS2L b 2P 89';
const COLLISION_B = '1sk3s1l/2g2r+B2/l1n1pp1+B1/p1p3p2/3p3np/PpP4P1/2NPPPP1P/R2SGG1S1/L4K1NL w GPp 56';

function collisionPosition(sfen: string): KyokumenImproved {
  return positionFromSfen(sfen).position;
}

function nextRandom(state: { value: number }): number {
  state.value = (state.value + 0x6d2b79f5) >>> 0;
  let t = state.value;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
  return (t ^ (t >>> 14)) >>> 0;
}

/** Independent oracle: it must not read KyokumenImproved's secondary tables. */
function independentSecondaryHash(position: KyokumenImproved) {
  const state = { value: 0x8f3e91c5 >>> 0 };
  const board = new Uint32Array((GRY + 1) * (16 * 11));
  const hand = new Uint32Array((GHI + 1) * 20);
  for (let i = 0; i < board.length; i++) board[i] = nextRandom(state);
  for (let i = 0; i < hand.length; i++) hand[i] = nextRandom(state);
  const teban = nextRandom(state);

  let ban = 0;
  let hands = 0;
  for (let suji = 1; suji <= 9; suji++) {
    for (let dan = 1; dan <= 9; dan++) {
      const square = (suji << 4) + dan;
      ban ^= board[position.ban[square] * (16 * 11) + square];
    }
  }
  for (let koma = 0; koma <= GHI; koma++) {
    for (let count = 0; count <= position.hand[koma]; count++) {
      hands ^= hand[koma * 20 + count];
    }
  }
  const hash = (ban ^ hands) >>> 0;
  return {
    ban: ban >>> 0,
    hand: hands >>> 0,
    hashVal: (hash ^ (position.teban === GOTE ? teban : 0)) >>> 0,
  };
}

function expectIndependentSecondaryHash(position: KyokumenImproved): void {
  const expected = independentSecondaryHash(position);
  expect(position.SecondaryBanHash >>> 0).toBe(expected.ban);
  expect(position.SecondaryHandHash >>> 0).toBe(expected.hand);
  expect(position.SecondaryHashVal >>> 0).toBe(expected.hashVal);
}

function moveKey(te: Te): number {
  return (te.koma & 0x3f) | ((te.from & 0xff) << 6) | ((te.to & 0xff) << 14) | ((te.promote ? 1 : 0) << 22);
}

describe('dual production hash lock', () => {
  it('keeps the primary collision fixture bit-exact while separating the secondary pair', () => {
    const a = collisionPosition(COLLISION_A);
    const b = collisionPosition(COLLISION_B);

    expect(a.HashVal >>> 0).toBe(218180606);
    expect(b.HashVal >>> 0).toBe(218180606);
    expect(a.SecondaryBanHash >>> 0).toBe(389651208);
    expect(a.SecondaryHandHash >>> 0).toBe(4242473661);
    expect(a.SecondaryHashVal >>> 0).toBe(3957758389);
    expect(b.SecondaryBanHash >>> 0).toBe(2187881682);
    expect(b.SecondaryHandHash >>> 0).toBe(58900993);
    expect(b.SecondaryHashVal >>> 0).toBe(1939556287);
    expect(a.SecondaryHashVal >>> 0).not.toBe(b.SecondaryHashVal >>> 0);

    const board = a.SecondaryBanHash;
    const hands = a.SecondaryHandHash;
    const full = a.SecondaryHashVal;
    a.toggleTeban();
    expect(a.SecondaryBanHash).toBe(board);
    expect(a.SecondaryHandHash).toBe(hands);
    expect(a.SecondaryHashVal).not.toBe(full);
    a.toggleTeban();
    expect(a.SecondaryHashVal).toBe(full);
  });

  it('locks packed TT identity to the complete hash pair', () => {
    const tt = new TranspositionTableImprovedPackedDual();
    const primary = 0x1234;
    const secondaryA = 0xaabbccdd;
    const secondaryB = 0xeeff0011;

    tt.add(primary, secondaryA, 100, -200, 200, 11, 6);
    const first = tt.probe(primary, secondaryA);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(tt.probe(primary, secondaryB)).toBe(-1);

    tt.add(primary, secondaryA, 200, -200, 200, 22, 3);
    expect(tt.value[first]).toBe(100); // shallow same-pair replacement is ignored

    tt.add(primary, secondaryB, 300, -400, 400, 33, 1);
    const second = tt.probe(primary, secondaryB);
    expect(second).toBe(first);
    expect(tt.probe(primary, secondaryA)).toBe(-1);
    expect(tt.value[second]).toBe(300);
    expect(tt.secondKey[second]).toBe(0);
  });

  it('keeps all four evaluation caches pair-locked but turn-free', () => {
    type CacheProbe = {
      evaluationMode: 'v1' | 'v2' | 'v3' | 'v3t';
      evaluateSenteCached(position: KyokumenImproved): number;
    };

    for (const evaluationMode of ['v1', 'v2', 'v3', 'v3t'] as const) {
      const cached = new ShogiAIImprovedV20() as unknown as CacheProbe;
      const clean = new ShogiAIImprovedV20() as unknown as CacheProbe;
      cached.evaluationMode = evaluationMode;
      clean.evaluationMode = evaluationMode;
      cached.evaluateSenteCached(collisionPosition(COLLISION_A));
      const b = collisionPosition(COLLISION_B);
      expect(cached.evaluateSenteCached(b)).toBe(clean.evaluateSenteCached(b));

      const beforeTurn = cached.evaluateSenteCached(b);
      b.toggleTeban();
      expect(cached.evaluateSenteCached(b)).toBe(beforeTurn);
    }
  });

  it('does not turn a primary collision into repetition', () => {
    type RepetitionProbe = {
      pushRepetition(primaryHash: number, secondaryHash: number): boolean;
    };
    const a = collisionPosition(COLLISION_A);
    const b = collisionPosition(COLLISION_B);
    const ai = new ShogiAIImprovedV20() as unknown as RepetitionProbe;

    expect(ai.pushRepetition(a.HashVal, a.SecondaryHashVal)).toBe(true);
    expect(ai.pushRepetition(a.HashVal, a.SecondaryHashVal)).toBe(true);
    expect(ai.pushRepetition(a.HashVal, a.SecondaryHashVal)).toBe(true);
    expect(ai.pushRepetition(b.HashVal, b.SecondaryHashVal)).toBe(true);
    expect(ai.pushRepetition(a.HashVal, a.SecondaryHashVal)).toBe(false);
  });

  it('does not return an illegal root move from a pair-locked TT entry', () => {
    const position = collisionPosition(COLLISION_B);
    const tt = new TranspositionTableImprovedPackedDual();
    tt.add(position.HashVal, position.SecondaryHashVal, 0, -99_999_999, 99_999_999, 0x00ffffff, 32);
    const ai = new ShogiAIImprovedV20(tt);
    const result = ai.getNextTe(position, 55, { maxDepth: 1, maxTimeMs: 0, quiescenceDepthMax: 0, evaluationMode: 'v1' });
    expect(result).not.toBeNull();
    expect(GenerateMovesImproved.generateLegalMoves(position).some((move) => moveKey(move) === moveKey(result!))).toBe(true);
  });

  it('matches independent full recomputation through 16,384 moves and unmoves', () => {
    const selectionState = { value: 0x4f1bbcdc >>> 0 };
    const requiredTransitions = 16_384;
    let transitions = 0;

    while (transitions < requiredTransitions) {
      const position = new KyokumenImproved();
      position.initHirate();
      const initial = {
        primary: position.HashVal,
        ban: position.SecondaryBanHash,
        hand: position.SecondaryHandHash,
        full: position.SecondaryHashVal,
      };
      const played: Te[] = [];

      while (played.length < 192 && transitions < requiredTransitions) {
        const moves = GenerateMovesImproved.generateLegalMoves(position);
        if (!moves.length) break;
        const move = moves[nextRandom(selectionState) % moves.length].clone();
        move.capture = position.get(move.to);
        position.move(move);
        position.toggleTeban();
        played.push(move);
        transitions++;
        expectIndependentSecondaryHash(position);
      }

      for (let i = played.length - 1; i >= 0; i--) {
        position.toggleTeban();
        position.back(played[i]);
        expectIndependentSecondaryHash(position);
      }
      expect(position.HashVal).toBe(initial.primary);
      expect(position.SecondaryBanHash).toBe(initial.ban);
      expect(position.SecondaryHandHash).toBe(initial.hand);
      expect(position.SecondaryHashVal).toBe(initial.full);
    }

    expect(transitions).toBe(requiredTransitions);
  }, 60_000);
});
