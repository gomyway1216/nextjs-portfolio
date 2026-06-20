import { initializeApp, getApps } from 'firebase/app';
import {
  type Auth,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  inMemoryPersistence,
  initializeAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPopup,
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

const requiredFirebaseConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
];

export const isFirebaseClientConfigured = requiredFirebaseConfig.every(
  (value) => typeof value === 'string' && value.trim().length > 0,
);

function createDisabledAuth(): Auth {
  const notifySignedOut = (observer: Parameters<Auth['onAuthStateChanged']>[0]) => {
    if (typeof observer === 'function') {
      observer(null);
      return;
    }
    observer.next?.(null);
  };

  return {
    currentUser: null,
    onAuthStateChanged(observer) {
      if (typeof window === 'undefined') {
        notifySignedOut(observer);
      } else {
        queueMicrotask(() => notifySignedOut(observer));
      }
      return () => {};
    },
  } as Partial<Auth> as Auth;
}

function getFirebaseUnavailableError() {
  return new Error('Firebase client auth is not configured for this environment.');
}

const app = isFirebaseClientConfigured
  ? getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApps()[0]
  : null;

// Skip IndexedDB-backed `browserLocalPersistence` entirely — production
// has been hitting `firebaseLocalStorageDb.open()` *hangs* (never fires
// onsuccess/onerror/onblocked) which surface as `auth/network-request-failed`
// because Firebase waits on IndexedDB synchronously before issuing any
// auth request. The previous fix that put `browserLocalPersistence` first
// in a fallback array didn't help: Firebase only walks the array on *fast
// failures*; an indefinite hang keeps the app stuck on the first item.
//
// Use sessionStorage (survives full reload within a tab/window) with
// in-memory as the absolute last resort. Trade-off: signing in once and
// closing the browser means re-signing in next time. Acceptable for an
// admin-only portfolio login compared with "cannot sign in at all".
//
// Server-side (no `window`) `initializeAuth` throws — fall back to getAuth().
// Already-initialized apps (hot reload) reuse the existing instance.
function createAuth() {
  if (!app) return createDisabledAuth();
  if (typeof window === 'undefined') return getAuth(app);
  try {
    return initializeAuth(app, {
      persistence: [browserSessionPersistence, inMemoryPersistence],
    });
  } catch {
    try {
      return getAuth(app);
    } catch (error) {
      console.error('[firebaseConnect] Firebase Auth initialization failed:', error);
      return createDisabledAuth();
    }
  }
}

export const auth = createAuth();

export const signInWithEmail = (email: string, password: string) => {
  if (!app) return Promise.reject(getFirebaseUnavailableError());
  return signInWithEmailAndPassword(auth, email, password);
};

export const signUpWithEmail = async (email: string, password: string, displayName?: string) => {
  if (!app) throw getFirebaseUnavailableError();
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential;
};

export const signInWithGoogle = () => {
  if (!app) return Promise.reject(getFirebaseUnavailableError());
  const provider = new GoogleAuthProvider();
  // Always show the account chooser instead of silently reusing the one
  // Google session — important on shared devices.
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
};

export const signInWithSessionCookie = async (onBeforeSignIn?: (uid: string) => void) => {
  if (!app) return null;
  const response = await fetch('/api/auth/client-token', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Session restore failed with status ${response.status}`);
  }

  const data = await response.json() as { customToken?: unknown; uid?: unknown };
  if (typeof data.customToken !== 'string' || data.customToken.length === 0) {
    throw new Error('Session restore response did not include a custom token.');
  }

  if (typeof data.uid === 'string') {
    onBeforeSignIn?.(data.uid);
  }

  return signInWithCustomToken(auth, data.customToken);
};

export const signOutUser = () => {
  if (!app) return Promise.resolve();
  return signOut(auth);
};

export const resetPassword = (email: string) => {
  if (!app) return Promise.reject(getFirebaseUnavailableError());
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
  if (!isFirebaseClientConfigured) return false;
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
