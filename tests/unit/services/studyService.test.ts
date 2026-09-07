import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebaseConnect', () => ({
  auth: { currentUser: null },
}));

import { getArticles } from '@/services/studyService';

describe('studyService.getArticles', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends date boundaries with the article list request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, articles: [], hasMore: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await getArticles({
      fromDate: '2026-09-07T07:00:00.000Z',
      toDate: '2026-09-08T07:00:00.000Z',
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://www.meetyudai.com');
    expect(requestUrl.searchParams.get('fromDate')).toBe('2026-09-07T07:00:00.000Z');
    expect(requestUrl.searchParams.get('toDate')).toBe('2026-09-08T07:00:00.000Z');
  });
});
