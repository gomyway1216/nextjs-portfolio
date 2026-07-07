import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebaseConnect', () => ({
  auth: {
    currentUser: null,
  },
}));

import { getHomeGamesConfig } from '@/services/homeGamesService';

describe('homeGamesService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ gameIds: ['shogi'] }), {
      headers: {
        'Content-Type': 'application/json',
      },
      status: 200,
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('fetches the admin home-games config without browser cache', async () => {
    await expect(getHomeGamesConfig()).resolves.toEqual({ gameIds: ['shogi'] });

    expect(fetchMock).toHaveBeenCalledWith('/api/home-games', {
      cache: 'no-store',
    });
  });
});
