'use client';

import React, { createContext, useEffect, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import { MultiFactorResolver, RecaptchaVerifier, User, UserCredential } from 'firebase/auth';
import { auth, signInWithEmail, signInWithGoogle, signInWithSessionCookie, signUpWithEmail, signOutUser }
  from '@/lib/firebaseConnect';
import * as twoFactorService from '@/services/twoFactorService';
import { getErrorCode } from '@/lib/errorUtils';

interface AuthProviderProps {
  children: ReactNode;
}

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  isAdmin: boolean;
  isEnrolledInMFA: boolean;
  twoFactorRequired: boolean;
  mfaPhoneHint: string | null;
  signIn: (email: string, password: string) => Promise<UserCredential>;
  signUp: (email: string, password: string, displayName?: string) => Promise<UserCredential>;
  signInWithGoogle: () => Promise<UserCredential>;
  signInWithTwoFactor: (email: string, password: string) => Promise<{ requiresTwoFactor: boolean }>;
  sendMfaCode: (recaptchaVerifier: RecaptchaVerifier) => Promise<void>;
  verifyTwoFactorAndComplete: (code: string) => Promise<void>;
  cancelTwoFactor: () => void;
  signOut: () => Promise<void>;
  refreshMFAStatus: () => void;
}

interface AuthSessionState {
  currentUser: User | null;
  isAdmin: boolean;
  isEnrolledInMFA: boolean;
}

const AUTH_SIGN_OUT_EVENT_KEY = 'meetyudai:auth-sign-out';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [authState, setAuthState] = useState<AuthSessionState>({
    currentUser: null,
    isAdmin: false,
    isEnrolledInMFA: false,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [twoFactorRequired, setTwoFactorRequired] = useState<boolean>(false);
  const [mfaPhoneHint, setMfaPhoneHint] = useState<string | null>(null);

  // Use ref for MFA resolver to avoid re-renders and state serialization issues
  const mfaResolverRef = useRef<MultiFactorResolver | null>(null);
  const wasSignedInRef = useRef(false);
  const syncedSessionUidRef = useRef<string | null>(null);
  const mfaSignInCompletingRef = useRef(false);
  const attemptedSessionRestoreRef = useRef(false);

  const resetLocalAuthState = useCallback(() => {
    setAuthState({ currentUser: null, isAdmin: false, isEnrolledInMFA: false });
    syncedSessionUidRef.current = null;
    wasSignedInRef.current = false;
    mfaResolverRef.current = null;
    setTwoFactorRequired(false);
    setMfaPhoneHint(null);
  }, []);

  const syncSessionCookie = useCallback(async (user: User | null, forceRefresh = false): Promise<boolean> => {
    try {
      let response: Response;
      if (user) {
        const idToken = await user.getIdToken(forceRefresh);
        response = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
      } else {
        response = await fetch('/api/auth/session', { method: 'DELETE' });
      }
      if (!response.ok) {
        throw new Error(`Session cookie sync failed with status ${response.status}`);
      }
      syncedSessionUidRef.current = user?.uid ?? null;
      return true;
    } catch (error) {
      console.error('Session cookie sync error:', error);
      return false;
    }
  }, []);

  const createUserDocument = useCallback(async (user: User, displayName?: string) => {
    try {
      const idToken = await user.getIdToken();
      await fetch('/api/auth/user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ displayName: displayName || user.displayName || '' }),
      });
    } catch (error) {
      console.error('User document creation error:', error);
    }
  }, []);

  // Use the same server-side admin decision as middleware. The server checks
  // both custom claims and the ADMIN_EMAIL whitelist; the client token only
  // exposes custom claims, so relying on it can incorrectly send admins home.
  const getAdminStatus = useCallback(async (user: User | null): Promise<boolean> => {
    if (!user) {
      return false;
    }

    try {
      const response = await fetch('/api/auth/verify', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        throw new Error(`Admin status check failed with status ${response.status}`);
      }
      const data = await response.json() as { uid?: string; isAdmin?: boolean };
      if (data.uid && data.uid !== user.uid) {
        throw new Error('Verified session belongs to a different user');
      }
      return data.isAdmin === true;
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }, []);

  const getMFAStatus = useCallback(() => {
    return twoFactorService.isEnrolledInMFA();
  }, []);

  const applySignedInUser = useCallback(async (user: User): Promise<boolean> => {
    if (user.isAnonymous) {
      // Anonymous users never have admin or MFA — skip the extra calls.
      setAuthState({ currentUser: user, isAdmin: false, isEnrolledInMFA: false });
      return true;
    }

    if (syncedSessionUidRef.current !== user.uid) {
      const sessionSynced = await syncSessionCookie(user);
      if (!sessionSynced) {
        resetLocalAuthState();
        return false;
      }
    }

    const adminStatus = await getAdminStatus(user);
    const enrolledInMFA = getMFAStatus();
    setAuthState({
      currentUser: user,
      isAdmin: adminStatus,
      isEnrolledInMFA: enrolledInMFA,
    });
    wasSignedInRef.current = true;
    return true;
  }, [getAdminStatus, getMFAStatus, resetLocalAuthState, syncSessionCookie]);

  const restoreFirebaseAuthFromSession = useCallback(async (): Promise<UserCredential | null> => {
    try {
      return await signInWithSessionCookie((uid) => {
        // The cookie was already verified to mint the custom token; update this
        // before signInWithCustomToken can trigger the auth-state listener.
        syncedSessionUidRef.current = uid;
      });
    } catch (error) {
      console.error('Session restore error:', error);
      return null;
    }
  }, []);

  // Check MFA enrollment status
  const refreshMFAStatus = useCallback(() => {
    setAuthState((prev) => ({ ...prev, isEnrolledInMFA: getMFAStatus() }));
  }, [getMFAStatus]);

  // Standard sign-in (for backwards compatibility)
  const signIn = useCallback((email: string, password: string) => {
    return signInWithEmail(email, password);
  }, []);

  // Sign-up with user document creation
  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const credential = await signUpWithEmail(email, password, displayName);
    await createUserDocument(credential.user, displayName);
    const sessionSynced = await syncSessionCookie(credential.user);
    if (!sessionSynced) {
      throw new Error('Failed to set session cookie after sign-up');
    }
    return credential;
  }, [createUserDocument, syncSessionCookie]);

  // Google sign-in. Federated providers can't enroll the same way as
  // password users here, so MFA gating doesn't apply; create the user doc
  // (first time) and sync the session cookie like sign-up does.
  //
  // The listener pause (mfaSignInCompletingRef, same gate the MFA flow
  // uses) matters: without it onAuthStateChanged exposes currentUser the
  // moment the popup resolves, SignInPage redirects, and the middleware
  // can reject the destination because the session cookie isn't written
  // yet (and the user doc may not exist).
  const signInWithGoogleProvider = useCallback(async (): Promise<UserCredential> => {
    mfaSignInCompletingRef.current = true;
    try {
      const credential = await signInWithGoogle();
      try {
        await createUserDocument(credential.user, credential.user.displayName ?? undefined);
        const sessionSynced = await syncSessionCookie(credential.user);
        if (!sessionSynced) {
          throw new Error('Failed to set session cookie after Google sign-in');
        }
      } catch (error) {
        // Don't leave Firebase signed in while the app session is broken —
        // middleware relies on the cookie, and a half-signed-in state makes
        // retrying confusing. Return to a clean signed-out state instead.
        await signOutUser().catch(() => {});
        throw error;
      }

      const adminStatus = await getAdminStatus(credential.user);
      const enrolledInMFA = getMFAStatus();

      // Eagerly update React state (the paused listener won't) so the
      // SignInPage redirect fires only now, with cookie + doc in place.
      setAuthState({
        currentUser: credential.user,
        isAdmin: adminStatus,
        isEnrolledInMFA: enrolledInMFA,
      });
      wasSignedInRef.current = true;
      return credential;
    } finally {
      mfaSignInCompletingRef.current = false;
    }
  }, [createUserDocument, syncSessionCookie, getAdminStatus, getMFAStatus]);

  // Sign-in with MFA handling
  const signInWithTwoFactor = useCallback(async (email: string, password: string): Promise<{ requiresTwoFactor: boolean }> => {
    try {
      await signInWithEmail(email, password);
      // Sign-in succeeded without MFA
      return { requiresTwoFactor: false };
    } catch (error: unknown) {
      // Check if MFA is required
      if (twoFactorService.isMfaError(error)) {
        // Store the resolver for completing MFA
        const resolver = twoFactorService.getMfaResolver(error);
        mfaResolverRef.current = resolver;

        // Get masked phone number hint
        const phoneHint = twoFactorService.getMaskedPhoneNumber(resolver);
        setMfaPhoneHint(phoneHint);
        setTwoFactorRequired(true);

        return { requiresTwoFactor: true };
      }
      // Re-throw other errors
      throw error;
    }
  }, []);

  // Send SMS code for MFA sign-in
  const sendMfaCode = useCallback(async (recaptchaVerifier: RecaptchaVerifier) => {
    if (!mfaResolverRef.current) {
      throw new Error('No pending MFA sign-in');
    }

    await twoFactorService.sendMfaSignInCode(mfaResolverRef.current, recaptchaVerifier);
  }, []);

  // Verify SMS code and complete sign-in
  const verifyTwoFactorAndComplete = useCallback(async (code: string) => {
    if (!mfaResolverRef.current) {
      throw new Error('No pending MFA sign-in to complete');
    }

    try {
      mfaSignInCompletingRef.current = true;
      const result = await twoFactorService.completeMfaSignIn(mfaResolverRef.current, code);

      // Force-refresh the ID token so createSessionCookie sees a fresh auth
      // time, and expose currentUser only after the cookie write is confirmed.
      const sessionSynced = await syncSessionCookie(result.user, true);
      if (!sessionSynced) {
        throw new Error('Failed to set session cookie after MFA sign-in');
      }

      const adminStatus = result.user.isAnonymous ? false : await getAdminStatus(result.user);
      const enrolledInMFA = result.user.isAnonymous ? false : getMFAStatus();

      // Eagerly update React state so SignInPage's redirect useEffect fires
      // now rather than waiting for the listener.
      setAuthState({
        currentUser: result.user,
        isAdmin: adminStatus,
        isEnrolledInMFA: enrolledInMFA,
      });
      wasSignedInRef.current = !result.user.isAnonymous;

      // Clear pending state
      mfaResolverRef.current = null;
      setTwoFactorRequired(false);
      setMfaPhoneHint(null);
    } catch (error: unknown) {
      mfaSignInCompletingRef.current = false;
      if (getErrorCode(error) === 'auth/invalid-verification-code') {
        throw new Error('Invalid verification code. Please try again.');
      }
      throw error;
    } finally {
      mfaSignInCompletingRef.current = false;
    }
  }, [getAdminStatus, getMFAStatus, syncSessionCookie]);

  // Cancel MFA verification
  const cancelTwoFactor = useCallback(() => {
    mfaResolverRef.current = null;
    setTwoFactorRequired(false);
    setMfaPhoneHint(null);
  }, []);

  const signOut = useCallback(async () => {
    attemptedSessionRestoreRef.current = true;
    await syncSessionCookie(null);
    wasSignedInRef.current = false;
    syncedSessionUidRef.current = null;
    await signOutUser().catch((error) => {
      console.error('Firebase sign-out error:', error);
    });
    resetLocalAuthState();
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(AUTH_SIGN_OUT_EVENT_KEY, String(Date.now()));
      } catch (error) {
        console.error('Cross-tab sign-out broadcast failed:', error);
      }
    }
  }, [resetLocalAuthState, syncSessionCookie]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_SIGN_OUT_EVENT_KEY) return;

      attemptedSessionRestoreRef.current = true;
      wasSignedInRef.current = false;
      syncedSessionUidRef.current = null;
      void signOutUser()
        .catch((error) => {
          console.error('Cross-tab Firebase sign-out failed:', error);
        })
        .finally(resetLocalAuthState);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [resetLocalAuthState]);

  // Auth state listener. Visitors who haven't signed in stay null —
  // their activity is tracked via the localStorage session_id (see
  // src/lib/sessionId.ts), NOT via Firebase Anonymous Auth.
  //
  // Defensive timeout: Firebase Auth's IndexedDB persistence has been
  // observed to hang during initial load on production (firebaseLocalStorageDb
  // open() never fires onsuccess/onerror/onblocked). When that happens,
  // onAuthStateChanged's initial callback never fires and the entire app
  // stays gated on `loading=true`. Force-finalize loading after 2s so the
  // UI renders as signed-out; the listener still fires later if Firebase
  // recovers and updates state normally.
  useEffect(() => {
    let didFinishLoading = false;
    const finishLoading = () => {
      if (!didFinishLoading) {
        didFinishLoading = true;
        setLoading(false);
      }
    };

    const unsubscribe = auth.onAuthStateChanged(async (user: User | null) => {
      if (!user) {
        if (!wasSignedInRef.current && !attemptedSessionRestoreRef.current && !mfaSignInCompletingRef.current) {
          attemptedSessionRestoreRef.current = true;
          const restoredCredential = await restoreFirebaseAuthFromSession();
          if (restoredCredential?.user) {
            await applySignedInUser(restoredCredential.user);
            finishLoading();
            return;
          }
        }

        const hadSignedInUser = wasSignedInRef.current;
        resetLocalAuthState();
        // Skip cookie deletion only on the initial idle/signed-out load. That
        // avoids racing MFA session creation while still clearing the server
        // cookie after a real signed-in -> signed-out transition.
        if (hadSignedInUser) {
          await syncSessionCookie(null);
        }
        finishLoading();
        return;
      }

      if (mfaSignInCompletingRef.current) {
        finishLoading();
        return;
      }

      await applySignedInUser(user);
      finishLoading();
    });

    const fallbackTimer = setTimeout(finishLoading, 2000);

    return () => {
      clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, [applySignedInUser, resetLocalAuthState, restoreFirebaseAuthFromSession, syncSessionCookie]);

  const value: AuthContextType = {
    currentUser: authState.currentUser,
    loading,
    isAdmin: authState.isAdmin,
    isEnrolledInMFA: authState.isEnrolledInMFA,
    twoFactorRequired,
    mfaPhoneHint,
    signIn,
    signUp,
    signInWithGoogle: signInWithGoogleProvider,
    signInWithTwoFactor,
    sendMfaCode,
    verifyTwoFactorAndComplete,
    cancelTwoFactor,
    signOut,
    refreshMFAStatus,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
