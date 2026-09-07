import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebaseConnect', () => ({
  auth: { currentUser: null },
}));

import { getArticles, saveArticleFeedback } from '@/services/studyService';

describe('studyService', () => {
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

  it('saves private article feedback to the article-scoped endpoint', async () => {
    const feedback = {
      articleId: 'article-1',
      userId: 'owner-1',
      signals: ['interesting', 'want_more'] as const,
      skipped: false,
      createdAt: '2026-09-07T11:00:00.000Z',
      updatedAt: '2026-09-07T11:00:00.000Z',
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, feedback }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await saveArticleFeedback('article-1', {
      signals: ['interesting', 'want_more'],
      skipped: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/study/articles/article-1/feedback',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ signals: ['interesting', 'want_more'], skipped: false }),
      })
    );
  });
});
