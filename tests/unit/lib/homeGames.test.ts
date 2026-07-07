import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HOME_GAME_IDS,
  getDuplicateHomeGameIds,
  getHomeGamesByIds,
  getUnknownHomeGameIds,
  normalizeHomeGameIds,
} from '@/lib/homeGames';

describe('home games config helpers', () => {
  it('falls back to the default game order when the stored value is missing or empty', () => {
    expect(normalizeHomeGameIds(undefined)).toEqual(DEFAULT_HOME_GAME_IDS);
    expect(normalizeHomeGameIds([])).toEqual(DEFAULT_HOME_GAME_IDS);
  });

  it('keeps known ids in stored order while dropping duplicates and unknown values', () => {
    expect(normalizeHomeGameIds(['othello', 'missing-game', 'shogi', 'othello', 123])).toEqual([
      'othello',
      'shogi',
    ]);
  });

  it('orders game records from configured ids', () => {
    expect(getHomeGamesByIds(['othello', 'shogi']).map((game) => game.id)).toEqual([
      'othello',
      'shogi',
    ]);
  });

  it('reports validation problems for the write API', () => {
    expect(getUnknownHomeGameIds(['shogi', 'unknown-game'])).toEqual(['unknown-game']);
    expect(getDuplicateHomeGameIds(['shogi', 'othello', 'shogi', 'othello'])).toEqual([
      'shogi',
      'othello',
    ]);
  });
});
