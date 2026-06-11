'use client';

import { signInAnonymously, type User } from 'firebase/auth';
import { auth } from '@/lib/firebaseConnect';

// Multiplayer infrastructure requires a Firebase user since Phase 2
// (gameAction Cloud Function verifies an ID token; RTDB writes require
// auth != null). Playing stays signup-free: guests get an anonymous
// Firebase account, which persists locally across visits just like the
// old localStorage player ids.

function waitForAuthSettled(timeoutMs = 3000): Promise<User | null> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(auth.currentUser);
    }, timeoutMs);
    // The first callback means auth has settled — resolve immediately
    // whether the restored user is a User or null. Guarding on `user`
    // would make the no-session case (new guests, unconfigured local
    // env) always wait out the full timeout before anonymous sign-in.
    const unsubscribe = auth.onAuthStateChanged((user) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(user);
    });
  });
}

let pendingSignIn: Promise<User> | null = null;

/**
 * Returns the current Firebase user, waiting briefly for a restored
 * session before falling back to anonymous sign-in (so returning
 * signed-in users never get shadow anonymous accounts).
 */
export async function ensureGameSignIn(): Promise<User> {
  const existing = await waitForAuthSettled();
  if (existing) return existing;

  if (!pendingSignIn) {
    pendingSignIn = signInAnonymously(auth)
      .then((credential) => credential.user)
      .finally(() => {
        pendingSignIn = null;
      });
  }
  return pendingSignIn;
}
