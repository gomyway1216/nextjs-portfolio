import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSessionId, resetSessionId } from '@/lib/sessionId';

function stubBrowserStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  });
  return store;
}

describe('sessionId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when called outside the browser', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('localStorage', undefined);

    expect(getSessionId()).toBeNull();
  });

  it('reuses an existing persisted id', () => {
    stubBrowserStorage({ portfolio_session_id: 'existing-id' });

    expect(getSessionId()).toBe('existing-id');
  });

  it('generates and persists a new id on first browser call', () => {
    const store = stubBrowserStorage();
    vi.stubGlobal('crypto', { randomUUID: () => 'generated-id' });

    expect(getSessionId()).toBe('generated-id');
    expect(store.get('portfolio_session_id')).toBe('generated-id');
  });

  it('clears the persisted id', () => {
    const store = stubBrowserStorage({ portfolio_session_id: 'existing-id' });

    resetSessionId();

    expect(store.has('portfolio_session_id')).toBe(false);
  });

  it('falls back to getRandomValues when storage access throws', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    });
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set(Array.from({ length: 16 }, (_, index) => index));
        return bytes;
      },
    });

    expect(getSessionId()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });

  it('ignores storage errors while resetting', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      removeItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    });

    expect(() => resetSessionId()).not.toThrow();
  });
});
