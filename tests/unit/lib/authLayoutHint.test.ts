import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deriveUserInitial,
  hangGuardShouldStopPresuming,
  nextAuthResolution,
  readAuthLayoutHint,
  resolvePresumedProfile,
  shouldPersistAuthLayoutHint,
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

  describe('nextAuthResolution', () => {
    it('treats a completed listener pass as the real answer', () => {
      expect(nextAuthResolution('pending', 'pass-completed')).toBe('resolved');
      expect(nextAuthResolution('unknown', 'pass-completed')).toBe('resolved');
      expect(nextAuthResolution('resolved', 'pass-completed')).toBe('resolved');
    });

    it('lets a watchdog stop the wait when nothing has answered yet', () => {
      expect(nextAuthResolution('pending', 'gave-up')).toBe('unknown');
    });

    it('never lets a watchdog downgrade an answer it already has', () => {
      expect(nextAuthResolution('resolved', 'gave-up')).toBe('resolved');
      expect(nextAuthResolution('unknown', 'gave-up')).toBe('unknown');
    });
  });

  describe('shouldPersistAuthLayoutHint', () => {
    it('records the hint only from a completed pass', () => {
      expect(shouldPersistAuthLayoutHint('resolved')).toBe(true);
    });

    it('does not record anything while auth is still in flight', () => {
      expect(shouldPersistAuthLayoutHint('pending')).toBe(false);
    });

    it('does not let a watchdog erase the hint — timing out is not being signed out', () => {
      expect(shouldPersistAuthLayoutHint('unknown')).toBe(false);
    });
  });

  describe('hangGuardShouldStopPresuming', () => {
    it('stops presuming when the auth listener never called back at all', () => {
      expect(hangGuardShouldStopPresuming(false)).toBe(true);
    });

    it('leaves a slow but live listener pass alone', () => {
      expect(hangGuardShouldStopPresuming(true)).toBe(false);
    });
  });

  describe('slow session restore (the case the hang guard used to break)', () => {
    const hint = { initial: 'Y', displayName: 'Yudai' };

    it('keeps the reserved shape and the stored hint across the hang guard', () => {
      // t=0: provider mounts, remembered hint read, nothing resolved yet.
      let resolution = 'pending' as ReturnType<typeof nextAuthResolution>;
      expect(resolvePresumedProfile(false, resolution === 'pending', hint)).toEqual(hint);

      // t~100ms: the listener calls back with no user and starts a session
      // restore. The pass is in flight; nothing has been decided.
      const authCallbackStarted = true;

      // t=2s: the hang guard fires. It must not touch the presumption, because
      // the restore is still running.
      if (hangGuardShouldStopPresuming(authCallbackStarted)) {
        resolution = nextAuthResolution(resolution, 'gave-up');
      }
      expect(resolution).toBe('pending');
      expect(resolvePresumedProfile(false, resolution === 'pending', hint)).toEqual(hint);
      expect(shouldPersistAuthLayoutHint(resolution)).toBe(false);

      // t=4s: the restore lands. Now — and only now — the real user takes over.
      resolution = nextAuthResolution(resolution, 'pass-completed');
      expect(resolvePresumedProfile(true, resolution === 'pending', hint)).toBeNull();
      expect(shouldPersistAuthLayoutHint(resolution)).toBe(true);
    });

    it('keeps the stored hint when the pass never lands and the cap gives up', () => {
      const store = stubBrowserStorage();
      writeAuthLayoutHint(hint);

      let resolution = nextAuthResolution('pending', 'gave-up');
      expect(resolution).toBe('unknown');
      // Presuming stops, so the toolbar falls back to the signed-out shape...
      expect(resolvePresumedProfile(false, resolution === 'pending', hint)).toBeNull();
      // ...but the hint survives, so the next load still reserves the box.
      if (shouldPersistAuthLayoutHint(resolution)) {
        writeAuthLayoutHint(toAuthLayoutHint(null));
      }
      expect(store.has(STORAGE_KEY)).toBe(true);
      expect(readAuthLayoutHint()).toEqual(hint);

      // A late pass still gets the last word.
      resolution = nextAuthResolution(resolution, 'pass-completed');
      expect(shouldPersistAuthLayoutHint(resolution)).toBe(true);
    });
  });
});
