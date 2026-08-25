import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deriveUserInitial,
  readAuthLayoutHint,
  resolvePresumedProfile,
  toAuthLayoutHint,
  writeAuthLayoutHint,
} from '@/lib/authLayoutHint';

const STORAGE_KEY = 'meetyudai:auth-layout-hint';

function stubBrowserStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
  return store;
}

/** Private mode: every localStorage call throws. */
function stubThrowingStorage() {
  const boom = () => {
    throw new Error('storage disabled');
  };
  vi.stubGlobal('window', {
    localStorage: { getItem: boom, setItem: boom, removeItem: boom },
  });
}

describe('authLayoutHint', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('deriveUserInitial', () => {
    it('prefers the display name, uppercased', () => {
      expect(deriveUserInitial('yudai', 'zed@example.com')).toBe('Y');
    });

    it('falls back to the email, then to a placeholder letter', () => {
      expect(deriveUserInitial(null, 'zed@example.com')).toBe('Z');
      expect(deriveUserInitial(null, null)).toBe('U');
      expect(deriveUserInitial('', '')).toBe('U');
    });
  });

  describe('toAuthLayoutHint', () => {
    it('captures the avatar letter and the display name', () => {
      expect(toAuthLayoutHint({ displayName: 'Yudai Yaguchi', email: 'y@example.com' })).toEqual({
        initial: 'Y',
        displayName: 'Yudai Yaguchi',
      });
    });

    it('keeps displayName null when the account has none', () => {
      expect(toAuthLayoutHint({ displayName: null, email: 'y@example.com' })).toEqual({
        initial: 'Y',
        displayName: null,
      });
    });

    it('maps a signed-out user to no hint', () => {
      expect(toAuthLayoutHint(null)).toBeNull();
    });
  });

  describe('round trip', () => {
    it('reads back what it wrote', () => {
      stubBrowserStorage();
      writeAuthLayoutHint({ initial: 'Y', displayName: 'Yudai' });

      expect(readAuthLayoutHint()).toEqual({ initial: 'Y', displayName: 'Yudai' });
    });

    it('clears the stored hint when passed null', () => {
      const store = stubBrowserStorage();
      writeAuthLayoutHint({ initial: 'Y', displayName: 'Yudai' });
      writeAuthLayoutHint(null);

      expect(store.has(STORAGE_KEY)).toBe(false);
      expect(readAuthLayoutHint()).toBeNull();
    });
  });

  describe('readAuthLayoutHint', () => {
    it('returns null outside the browser', () => {
      vi.stubGlobal('window', undefined);

      expect(readAuthLayoutHint()).toBeNull();
    });

    it('returns null when nothing is stored', () => {
      stubBrowserStorage();

      expect(readAuthLayoutHint()).toBeNull();
    });

    it('ignores unparsable JSON rather than throwing', () => {
      stubBrowserStorage({ [STORAGE_KEY]: 'not json' });

      expect(readAuthLayoutHint()).toBeNull();
    });

    it('ignores a hint written by an older version', () => {
      stubBrowserStorage({ [STORAGE_KEY]: JSON.stringify({ v: 0, initial: 'Y', displayName: 'Yudai' }) });

      expect(readAuthLayoutHint()).toBeNull();
    });

    it('falls back to a placeholder letter when the stored initial is unusable', () => {
      stubBrowserStorage({ [STORAGE_KEY]: JSON.stringify({ v: 1, initial: 42, displayName: 7 }) });

      expect(readAuthLayoutHint()).toEqual({ initial: 'U', displayName: null });
    });

    it('survives storage being unavailable', () => {
      stubThrowingStorage();

      expect(readAuthLayoutHint()).toBeNull();
      expect(() => writeAuthLayoutHint({ initial: 'Y', displayName: null })).not.toThrow();
      expect(() => writeAuthLayoutHint(null)).not.toThrow();
    });
  });

  describe('resolvePresumedProfile', () => {
    const hint = { initial: 'Y', displayName: 'Yudai' };

    it('paints the remembered shape while a session is being restored', () => {
      expect(resolvePresumedProfile(false, true, hint)).toEqual(hint);
    });

    it('paints nothing for a browser that was never signed in', () => {
      expect(resolvePresumedProfile(false, true, null)).toBeNull();
    });

    it('stops presuming once auth settles on signed-out — an expired session must show as signed out', () => {
      expect(resolvePresumedProfile(false, false, hint)).toBeNull();
    });

    it('defers to the real user once one is available', () => {
      expect(resolvePresumedProfile(true, true, hint)).toBeNull();
      expect(resolvePresumedProfile(true, false, hint)).toBeNull();
    });
  });
});
