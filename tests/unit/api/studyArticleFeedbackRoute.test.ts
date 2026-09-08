import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  ensureAdmin: vi.fn(),
  getFirestore: vi.fn(),
}));

vi.mock('@/app/api/_lib/withActivityLog', () => ({
  withActivityLog: (_action: string, handler: unknown) => handler,
}));

vi.mock('@/app/api/utils/errorLogger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('@/lib/auth-utils', () => ({
  ensureAdmin: mocks.ensureAdmin,
}));

vi.mock('@/lib/firebase-admin', () => ({
  getFirestore: mocks.getFirestore,
}));

describe('/api/study/articles/[id]/feedback authorization', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.ensureAdmin.mockReset();
    mocks.getFirestore.mockReset();
  });

  it('does not expose feedback to an authenticated non-admin user', async () => {
    const { GET } = await import('@/app/api/study/articles/[id]/feedback/route');
    const authResponse = NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    mocks.ensureAdmin.mockResolvedValue({ user: null, response: authResponse });

    const response = await GET(
      new Request('https://example.com/api/study/articles/article-1/feedback') as never,
      { params: Promise.resolve({ id: 'article-1' }) }
    );
    if (!response) throw new Error('Route handler returned no response');

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.getFirestore).not.toHaveBeenCalled();
  });

  it('atomically records the owner binding when admin feedback is saved', async () => {
    const { PUT } = await import('@/app/api/study/articles/[id]/feedback/route');
    mocks.ensureAdmin.mockResolvedValue({ user: { uid: 'owner-1', isAdmin: true } });
    const articleRef = { get: vi.fn().mockResolvedValue({ exists: true }) };
    const feedbackRef = { get: vi.fn().mockResolvedValue({ exists: false }) };
    const ownerStateRef = { id: 'daily-learning' };
    const batch = { set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
    const collection = vi.fn((name: string) => ({
      doc: vi.fn((id: string) => {
        if (name === 'study_articles') return articleRef;
        if (name === 'study_article_feedback') return feedbackRef;
        if (name === 'study_owner_state' && id === 'daily-learning') return ownerStateRef;
        throw new Error(`Unexpected collection: ${name}`);
      }),
    }));
    mocks.getFirestore.mockReturnValue({ collection, batch: () => batch });

    const response = await PUT(
      new Request('https://example.com/api/study/articles/article-1/feedback', {
        method: 'PUT',
        body: JSON.stringify({ signals: ['not_useful', 'too_niche'], skipped: false }),
      }) as never,
      { params: Promise.resolve({ id: 'article-1' }) }
    );
    if (!response) throw new Error('Route handler returned no response');

    expect(response.status).toBe(200);
    expect(batch.set).toHaveBeenCalledTimes(2);
    expect(batch.set).toHaveBeenCalledWith(
      feedbackRef,
      expect.objectContaining({
        articleId: 'article-1',
        userId: 'owner-1',
        signals: ['not_useful', 'too_niche'],
        skipped: false,
      })
    );
    expect(batch.set).toHaveBeenCalledWith(
      ownerStateRef,
      expect.objectContaining({ userId: 'owner-1' }),
      { merge: true }
    );
    expect(batch.commit).toHaveBeenCalledOnce();
  });
});
