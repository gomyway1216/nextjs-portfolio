import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HOME_GAME_IDS,
  HOME_GAME_PREVIEW_LIMIT,
  getDuplicateHomeGameIds,
  getHomeGamesByIds,
  getHomePreviewGames,
  getUnknownHomeGameIds,
  normalizeHomeGameIds,
  shouldUseDefaultHomeGameIdsForRuntimeEnv,
} from '@/lib/homeGames';

describe('home games config helpers', () => {
  it('features shogi first in the default home game order', () => {
    expect(DEFAULT_HOME_GAME_IDS[0]).toBe('shogi');
  });

  it('falls back to the default game order when the stored value is missing or empty', () => {
    const missingConfig = normalizeHomeGameIds(undefined);
    const emptyConfig = normalizeHomeGameIds([]);

    expect(missingConfig).toEqual(DEFAULT_HOME_GAME_IDS);
    expect(emptyConfig).toEqual(DEFAULT_HOME_GAME_IDS);
    expect(missingConfig).not.toBe(DEFAULT_HOME_GAME_IDS);
    expect(emptyConfig).not.toBe(DEFAULT_HOME_GAME_IDS);
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

  it('limits the home preview while preserving the configured order', () => {
    const preview = getHomePreviewGames(DEFAULT_HOME_GAME_IDS);

    expect(preview).toHaveLength(HOME_GAME_PREVIEW_LIMIT);
    expect(preview.map((game) => game.id)).toEqual(
      DEFAULT_HOME_GAME_IDS.slice(0, HOME_GAME_PREVIEW_LIMIT),
    );
  });

  it('reports validation problems for the write API', () => {
    expect(getUnknownHomeGameIds(['shogi', 'unknown-game'])).toEqual(['unknown-game']);
    expect(getDuplicateHomeGameIds(['shogi', 'othello', 'shogi', 'othello'])).toEqual([
      'shogi',
      'othello',
    ]);
  });

  it('skips the Firestore home-games read in CI placeholder Firebase environments', () => {
    expect(shouldUseDefaultHomeGameIdsForRuntimeEnv({
      CI: 'true',
      NEXT_PUBLIC_PROJECT_ID: 'ci-placeholder',
    })).toBe(true);

    expect(shouldUseDefaultHomeGameIdsForRuntimeEnv({
      CI: 'true',
      NEXT_PUBLIC_PROJECT_ID: 'ci-placeholder',
      FIREBASE_SERVICE_ACCOUNT_KEY: '{}',
    })).toBe(false);

    expect(shouldUseDefaultHomeGameIdsForRuntimeEnv({
      CI: 'true',
      NEXT_PUBLIC_PROJECT_ID: 'real-project',
    })).toBe(false);
  });
});
