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
});
