import { describe, expect, it } from 'vitest';

import { drawName, drawUniform } from '@/lib/medalFloor/draw';
import { isWinId } from '@/lib/medalFloor/jackpot';

// The floor jackpot's draw, as the server makes it: from node:crypto, nothing a browser sends.

describe('the server’s draw', () => {
  it('is a number in [0, 1), fine enough for a 1 in 40,000 chance, and never the same twice in a row', () => {
    const draws = Array.from({ length: 2_000 }, () => drawUniform());
    for (const draw of draws) {
      expect(draw).toBeGreaterThanOrEqual(0);
      expect(draw).toBeLessThan(1);
    }
    expect(new Set(draws).size).toBe(draws.length);
    // Spread over the whole range: a tenth of the draws in each tenth, give or take.
    for (let tenth = 0; tenth < 10; tenth += 1) {
      const there = draws.filter((draw) => draw >= tenth / 10 && draw < (tenth + 1) / 10).length;
      expect(there).toBeGreaterThan(120);
      expect(there).toBeLessThan(280);
    }
  });

  it('names a win with eight hex digits', () => {
    expect(drawName()).toMatch(/^[0-9a-f]{8}$/);
    expect(isWinId(`20261017-${drawName()}`)).toBe(true);
  });
});
