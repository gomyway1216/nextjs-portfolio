import { describe, expect, it } from 'vitest';

import {
  childSfenAfterUsi,
  positionFromSfen,
  resolveUsiMove,
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

  it('rejects malformed SFEN and illegal USI instead of guessing', () => {
    expect(() => positionFromSfen('9/9 b - 1')).toThrow(/nine ranks/);
    expect(() => resolveUsiMove(positionFromSfen(START).position, '7g7e')).toThrow(/0 legal moves/);
    expect(() => resolveUsiMove(positionFromSfen(START).position, 'P*5e')).toThrow(/0 legal moves/);
  });
});
