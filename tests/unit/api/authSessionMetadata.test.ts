import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(), verifySessionCookie: vi.fn(),
  createSessionCookie: vi.fn(), createCustomToken: vi.fn(), isAdmin: vi.fn(),
}));
vi.mock('@/lib/firebase-admin', () => ({ getAuth: () => mocks }));
vi.mock('@/lib/auth-utils', () => ({ isAdmin: mocks.isAdmin }));
vi.mock('@/app/api/_lib/withActivityLog', () => ({ withActivityLog: (_: string, fn: unknown) => fn }));
import { POST as sync, DELETE as signOut } from '@/app/api/auth/session/route';
import { POST as restore } from '@/app/api/auth/client-token/route';
type Route = (req: NextRequest) => Promise<Response>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyIdToken.mockResolvedValue({ uid: 'owner', admin: true });
  mocks.verifySessionCookie.mockResolvedValue({ uid: 'owner', admin: true });
  mocks.createSessionCookie.mockResolvedValue('test-session');
  mocks.createCustomToken.mockResolvedValue('test-custom');
  mocks.isAdmin.mockReturnValue(true);
});

describe('verified session UI metadata', () => {
  it('returns admin metadata with the synced cookie, retaining revocation checks', async () => {
    const response = await (sync as Route)(new NextRequest('https://example.com/api/auth/session', {
      method: 'POST', body: JSON.stringify({ idToken: 'test-id-token', isAdmin: false }),
    }));
    expect(mocks.verifyIdToken).toHaveBeenCalledWith('test-id-token', true);
    expect(mocks.isAdmin).toHaveBeenCalledWith({ uid: 'owner', admin: true });
    expect(await response.json()).toEqual({ status: 'ok', uid: 'owner', isAdmin: true });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  });
  it('returns the same verified metadata during cookie restoration without another verify request', async () => {
    mocks.isAdmin.mockReturnValue(false);
    const response = await (restore as Route)(new NextRequest('https://example.com/api/auth/client-token', {
      method: 'POST', headers: { cookie: '__session=test-session' },
    }));
    expect(mocks.verifySessionCookie).toHaveBeenCalledExactlyOnceWith('test-session', true);
    expect(await response.json()).toEqual({ customToken: 'test-custom', uid: 'owner', isAdmin: false });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('does not mint a token or return admin metadata for a revoked session', async () => {
    mocks.verifySessionCookie.mockRejectedValueOnce(new Error('revoked'));
    const response = await (restore as Route)(new NextRequest('https://example.com/api/auth/client-token', {
      method: 'POST', headers: { cookie: '__session=revoked-session' },
    }));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).not.toHaveProperty('isAdmin');
    expect(mocks.createCustomToken).not.toHaveBeenCalled();
  });
  it('does not create a session cookie for a revoked ID token', async () => {
    mocks.verifyIdToken.mockRejectedValueOnce(new Error('revoked'));
    const response = await (sync as Route)(new NextRequest('https://example.com/api/auth/session', {
      method: 'POST', body: JSON.stringify({ idToken: 'revoked-id-token' }),
    }));
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(mocks.createSessionCookie).not.toHaveBeenCalled();
  });
  it('never caches missing credentials, invalid tokens, or cookie deletion', async () => {
    const request = new NextRequest('https://example.com/api/auth/session', { method: 'POST', body: '{}' });
    const missingId = await (sync as Route)(request);
    expect(missingId.status).toBe(400);
    expect(missingId.headers.get('cache-control')).toBe('private, no-store');
    const missingCookie = await (restore as Route)(new NextRequest('https://example.com/api/auth/client-token', { method: 'POST' }));
    expect(missingCookie.status).toBe(401);
    expect(missingCookie.headers.get('cache-control')).toBe('private, no-store');
    mocks.verifyIdToken.mockResolvedValueOnce(null);
    const invalid = await (sync as Route)(new NextRequest('https://example.com/api/auth/session', {
      method: 'POST', body: JSON.stringify({ idToken: 'invalid' }),
    }));
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get('cache-control')).toBe('private, no-store');
    const deleted = await (signOut as Route)(request);
    expect(deleted.headers.get('cache-control')).toBe('private, no-store');
    expect(deleted.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
