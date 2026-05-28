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
});
