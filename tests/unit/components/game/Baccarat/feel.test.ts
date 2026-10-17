import { describe, expect, it } from 'vitest';

import { stackHeight } from '@/components/game/Baccarat/PlayTab';

describe('the medals on a spot drawn as a stack', () => {
  it('is one medal high for one medal, one more each time it doubles, and never more than five', () => {
    expect([1, 2, 3, 4, 7, 8, 15, 16, 40, 100].map(stackHeight)).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 5]);
    expect(stackHeight(0)).toBe(1);
  });
});
