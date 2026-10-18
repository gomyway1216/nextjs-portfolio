/**
 * Who is signed in on this page, as the floor's reporter and its jackpot payer
 * see it: an account (never a guest, never an anonymous visitor), asked
 * without waiting. It is read from Firebase's own module, which the site has
 * loaded already, the first time it is asked for; until that has come, nobody
 * is.
 */

/** A signed-in account: its id, and a way to get one of its tokens. */
export interface FloorAccount {
  uid: string;
  token(): Promise<string>;
}

type AuthModule = typeof import('@/lib/firebaseConnect');
let authModule: AuthModule | null = null;
let loading: Promise<AuthModule | null> | null = null;

/** Loads Firebase's module, once. Resolves when it is there (or could not be). */
export function loadAccount(): Promise<AuthModule | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  loading ??= import('@/lib/firebaseConnect').then(
    (module) => {
      authModule = module;
      return module;
    },
    () => null,
  );
  return loading;
}

export function pageAccount(): FloorAccount | null {
  if (!authModule) {
    void loadAccount();
    return null;
  }
  const user = authModule.auth.currentUser;
  return user && !user.isAnonymous ? { uid: user.uid, token: () => user.getIdToken() } : null;
}
