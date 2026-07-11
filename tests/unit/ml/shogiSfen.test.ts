import { describe, expect, it } from 'vitest';

import {
  childSfenAfterUsi,
  positionFromSfen,
  resolveUsiMove,
  rulesCompleteLegalMoves,
  teToUsi,
} from '../../../ml/shogi-sfen';
import { toSfen } from '../../../ml/generate-teacher';

const START = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';

describe('SFEN and USI bridge for sibling positions', () => {
  it('round-trips startpos and applies ordinary moves with the move number', () => {
    const parsed = positionFromSfen(START);
    expect(parsed.moveNumber).toBe(1);
    expect(toSfen(parsed.position, parsed.moveNumber)).toBe(START);
    const first = resolveUsiMove(parsed.position, '7g7f');
    expect(teToUsi(first)).toBe('7g7f');
    expect(childSfenAfterUsi(START, '7g7f')).toBe(
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2'
    );
  });

  it('resolves promotion and drops only through the legal move list', () => {
    const promotion = '4k4/9/9/9/9/9/2B6/9/4K4 b - 1';
    expect(teToUsi(resolveUsiMove(positionFromSfen(promotion).position, '7g2b+'))).toBe('7g2b+');
    expect(childSfenAfterUsi(promotion, '7g2b+')).toContain('7+B1/9/9/9/9/9/9/4K4 w - 2');

    const drop = '4k4/9/9/9/9/9/9/9/4K4 b P 1';
    expect(teToUsi(resolveUsiMove(positionFromSfen(drop).position, 'P*5e'))).toBe('P*5e');
    expect(childSfenAfterUsi(drop, 'P*5e')).toBe('4k4/9/9/9/4P4/9/9/9/4K4 w - 2');
  });

  it('restores optional bishop/rook non-promotion in one deterministic rules-complete set', () => {
    const cases = [
      {
        parent: '4k4/9/9/9/4B4/9/9/9/K8 b - 1',
        promoted: '5e3c+',
        declined: '5e3c',
      },
      {
        parent: 'k8/9/9/9/4R4/9/9/9/K8 b - 1',
        promoted: '5e5c+',
        declined: '5e5c',
      },
    ] as const;
    for (const fixture of cases) {
      const { position, moveNumber } = positionFromSfen(fixture.parent);
      const before = toSfen(position, moveNumber);
      const first = rulesCompleteLegalMoves(position).map((entry) => entry.usi);
      const second = rulesCompleteLegalMoves(position).map((entry) => entry.usi);
      expect(first).toEqual(second);
      expect(toSfen(position, moveNumber)).toBe(before);
      expect(first).toEqual([...new Set(first)].sort());
      expect(first).toContain(fixture.promoted);
      expect(first).toContain(fixture.declined);
      expect(teToUsi(resolveUsiMove(position, fixture.declined))).toBe(fixture.declined);
    }
  });

  it('distinguishes a one-reply parent from schema-eligible parents with at least two children', () => {
    const checkmate = '4k4/4+R4/5G3/9/9/9/9/9/4K4 w - 17';
    const oneReply = '4k4/2B6/3GRG3/9/9/9/9/9/K8 w - 17';
    expect(rulesCompleteLegalMoves(positionFromSfen(checkmate).position)).toHaveLength(0);
    expect(
      rulesCompleteLegalMoves(positionFromSfen(oneReply).position).map((entry) => entry.usi)
    ).toEqual(['5a4a']);
    expect(rulesCompleteLegalMoves(positionFromSfen(START).position).length).toBeGreaterThanOrEqual(
      2
    );
  });

  it('rejects malformed SFEN and illegal USI instead of guessing', () => {
    expect(() => positionFromSfen('9/9 b - 1')).toThrow(/nine ranks/);
    expect(() => resolveUsiMove(positionFromSfen(START).position, '7g7e')).toThrow(/0 legal moves/);
    expect(() => resolveUsiMove(positionFromSfen(START).position, 'P*5e')).toThrow(/0 legal moves/);
  });
});
