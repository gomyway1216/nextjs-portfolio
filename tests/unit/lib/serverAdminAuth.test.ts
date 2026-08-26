import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  cookieGet,
  verifySessionCookie,
  redirectMock,
  isAdminMock,
} = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  verifySessionCookie: vi.fn(),
  redirectMock: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
  isAdminMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: cookieGet })),
}));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/firebase-admin', () => ({
  getAuth: () => ({ verifySessionCookie }),
}));
vi.mock('@/lib/auth-utils', () => ({ isAdmin: isAdminMock }));

import { getServerAdminSession, requireServerAdmin } from '@/lib/serverAdminAuth';

describe('server admin session gate', () => {
  beforeEach(() => {
    cookieGet.mockReset();
    verifySessionCookie.mockReset();
    redirectMock.mockClear();
    isAdminMock.mockReset();
  });

  it('fails before initializing Firebase when the session cookie is absent', async () => {
    cookieGet.mockReturnValue(undefined);

    await expect(getServerAdminSession()).resolves.toBeNull();
    expect(verifySessionCookie).not.toHaveBeenCalled();
  });

  it('requires a valid, non-revoked admin session', async () => {
    cookieGet.mockReturnValue({ value: 'session-cookie' });
    verifySessionCookie.mockResolvedValue({ uid: 'admin-1', email: 'admin@example.com' });
    isAdminMock.mockReturnValue(true);

    await expect(getServerAdminSession()).resolves.toEqual({
      uid: 'admin-1',
      email: 'admin@example.com',
    });
    expect(verifySessionCookie).toHaveBeenCalledWith('session-cookie', true);
  });

  it('redirects invalid and non-admin sessions without returning claims', async () => {
    cookieGet.mockReturnValue({ value: 'session-cookie' });
    verifySessionCookie.mockResolvedValue({ uid: 'user-1' });
    isAdminMock.mockReturnValue(false);

    await expect(requireServerAdmin('/memory')).rejects.toThrow(
      'redirect:/signin?redirect=%2Fmemory',
    );
  });
});
