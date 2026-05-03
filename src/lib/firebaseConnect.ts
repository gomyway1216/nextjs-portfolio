import { initializeApp, getApps } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Use initializeAuth with a persistence fallback array so Firebase tries
// IndexedDB-backed `browserLocalPersistence` first, then falls back to
// `browserSessionPersistence` (sessionStorage) and finally `inMemoryPersistence`.
//
// Why this matters: production was throwing `auth/network-request-failed`
// before any network call was even attempted. Diagnosis showed
// `firebaseLocalStorageDb.open()` hangs indefinitely (never fires
// onsuccess/onerror/onblocked) for some browsers. With plain `getAuth()`,
// Firebase only tries IndexedDB and surfaces the storage failure as a
// network error, blocking sign-in entirely. The fallback chain lets sign-in
// succeed even when IndexedDB is broken — the only tradeoff is that a
// session-storage / in-memory user state is lost on tab close, which is an
// acceptable degradation versus "can't sign in at all".
//
// Server-side (no `window`) `initializeAuth` would throw — fall back to
// `getAuth()` there. Already-initialized apps (e.g. on hot reload) reuse
// the existing auth instance via getAuth().
function createAuth() {
  if (typeof window === 'undefined') return getAuth(app);
  try {
    return initializeAuth(app, {
      persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
    });
  } catch {
    // initializeAuth throws if called twice on the same app — reuse existing.
    return getAuth(app);
  }
}

export const auth = createAuth();

export const signInWithEmail = (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const signUpWithEmail = async (email: string, password: string, displayName?: string) => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential;
};

export const signOutUser = () => {
  return signOut(auth);
};

export const resetPassword = (email: string) => {
  return sendPasswordResetEmail(auth, email);
};

export const sendVerificationEmail = () => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('No user signed in');
  }
  return sendEmailVerification(user);
};

/**
 * Ensure a Firebase Auth user exists. If no user is signed in, signs in
 * anonymously so every visitor has a uid (required for activity logging
 * and a stable identity that can later be linked to a real account).
 *
 * Returns true on success, false on failure (e.g. Anonymous Auth not
 * enabled in Firebase Console). Concurrent callers share a single
 * in-flight sign-in promise to avoid issuing parallel signInAnonymously
 * requests during page load.
 */
let inFlightAnonSignIn: Promise<boolean> | null = null;

export async function ensureSignedIn(): Promise<boolean> {
  if (auth.currentUser) return true;
  if (inFlightAnonSignIn) return inFlightAnonSignIn;

  inFlightAnonSignIn = signInAnonymously(auth)
    .then(() => true)
    .catch((err) => {
      console.error('[firebaseConnect] anonymous sign-in failed:', err);
      return false;
    })
    .finally(() => {
      inFlightAnonSignIn = null;
    });

  return inFlightAnonSignIn;
}
