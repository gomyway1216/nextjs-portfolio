import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';

// Match the repo's hook test approach: stable hook slots, real provider logic,
// mocked Firebase/network promises, no additional DOM runtime dependency.
const hooks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, effects: [] as (() => void)[],
  listener: null as null | ((user: User | null) => Promise<void>),
  restore: vi.fn(), signOut: vi.fn(),
  auth: { currentUser: null as User | null, onAuthStateChanged: vi.fn() },
}));
vi.mock('react', async importOriginal => {
  const react = await importOriginal<typeof import('react')>();
  const same = (a: unknown[] | undefined, b: unknown[]) => a?.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  return {
    ...react,
    useState: (initial: unknown) => {
      const slot = hooks.cursor++;
      if (!(slot in hooks.values)) hooks.values[slot] = initial;
      return [hooks.values[slot], (next: unknown) => {
        hooks.values[slot] = typeof next === 'function' ? next(hooks.values[slot]) : next;
      }];
    },
    useRef: (initial: unknown) => {
      const slot = hooks.cursor++;
      return hooks.values[slot] ??= { current: initial };
    },
    useCallback: (fn: unknown, deps: unknown[]) => {
      const slot = hooks.cursor++;
      const previous = hooks.values[slot] as { deps: unknown[]; fn: unknown } | undefined;
      if (same(previous?.deps, deps)) return previous!.fn;
      hooks.values[slot] = { fn, deps }; return fn;
    },
    useEffect: (fn: () => unknown, deps: unknown[]) => {
      const slot = hooks.cursor++;
      const previous = hooks.values[slot] as { deps: unknown[] } | undefined;
      if (!same(previous?.deps, deps)) hooks.effects.push(() => { hooks.values[slot] = { deps }; fn(); });
    },
  };
});
vi.mock('@/lib/firebaseConnect', () => ({
  auth: hooks.auth, signInWithSessionCookie: hooks.restore, signOutUser: hooks.signOut,
  signInWithEmail: vi.fn(), signInWithGoogle: vi.fn(), signUpWithEmail: vi.fn(),
}));
vi.mock('@/services/twoFactorService', () => ({ isEnrolledInMFA: () => false }));
import { AuthProvider } from '@/providers/AuthProvider';

function render(hasSessionCookie = true) {
  hooks.cursor = 0;
  const element = AuthProvider({ children: null, hasSessionCookie });
  hooks.effects.splice(0).forEach(fn => fn());
  return element.props.value;
}
const user = (uid: string) => ({ uid, isAnonymous: false, getIdToken: vi.fn().mockResolvedValue('test-token') }) as unknown as User;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
beforeEach(() => {
  hooks.values = []; hooks.effects = []; hooks.cursor = 0;
  hooks.auth.currentUser = null; hooks.listener = null;
  hooks.restore.mockReset(); hooks.signOut.mockReset().mockResolvedValue(undefined);
  hooks.auth.onAuthStateChanged.mockImplementation(fn => { hooks.listener = fn; return () => {}; });
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('session bootstrap request waterfall', () => {
  it('keeps the list gated until cookie sync succeeds, then skips the separate admin request', async () => {
    let complete!: (value: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { complete = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const owner = user('owner'); hooks.auth.currentUser = owner;
    render(); const pass = hooks.listener!(owner); await flush();
    expect(render()).toMatchObject({ currentUser: null, resolving: true });
    complete(Response.json({ status: 'ok', uid: 'owner', isAdmin: true })); await pass;
    expect(render()).toMatchObject({ currentUser: owner, isAdmin: true, resolving: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({ method: 'POST' }));
  });
  it('both restoration callbacks reuse server metadata with zero /verify requests', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const owner = user('owner'); let restoredListener!: Promise<void>;
    hooks.restore.mockImplementation(async onBefore => {
      onBefore('owner', true); hooks.auth.currentUser = owner;
      restoredListener = hooks.listener!(owner);
      return { user: owner };
    });
    render(); await hooks.listener!(null); await restoredListener;
    expect(render()).toMatchObject({ currentUser: owner, isAdmin: true, resolving: false });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('deduplicates /verify for an older restore response during rollout', async () => {
    let complete!: (value: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { complete = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const owner = user('owner'); let restoredListener!: Promise<void>;
    hooks.restore.mockImplementation(async onBefore => {
      onBefore('owner'); hooks.auth.currentUser = owner;
      restoredListener = hooks.listener!(owner);
      return { user: owner };
    });
    render(); const pass = hooks.listener!(null); await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    complete(Response.json({ uid: 'owner', isAdmin: true })); await pass; await restoredListener;
    expect(render().isAdmin).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('clears prior admin metadata before restoring a different account', async () => {
    const owner = user('owner'); hooks.auth.currentUser = owner;
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ uid: 'owner', isAdmin: true }));
    vi.stubGlobal('fetch', fetch);
    render(); await hooks.listener!(owner);
    hooks.auth.currentUser = null;
    fetch.mockResolvedValueOnce(Response.json({ status: 'ok' }));
    await hooks.listener!(null);
    const guest = user('guest'); hooks.auth.currentUser = guest;
    fetch.mockResolvedValueOnce(Response.json({ uid: 'guest', isAdmin: false }));
    await hooks.listener!(guest);
    expect(render()).toMatchObject({ currentUser: guest, isAdmin: false });
  });
  it('does not expose a signed-in identity when cookie sync fails or returns another UID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ uid: 'another', isAdmin: true })));
    const owner = user('owner'); hooks.auth.currentUser = owner;
    render(); await hooks.listener!(owner);
    expect(render()).toMatchObject({ currentUser: null, isAdmin: false });
  });
});
