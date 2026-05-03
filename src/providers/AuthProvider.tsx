'use client';

import React, { createContext, useEffect, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import { MultiFactorResolver, RecaptchaVerifier, User } from 'firebase/auth';
import { auth, signInWithEmail, signUpWithEmail, signOutUser }
  from '@/lib/firebaseConnect';
import * as twoFactorService from '@/services/twoFactorService';

interface AuthProviderProps {
  children: ReactNode;
}

interface AuthContextType {
  currentUser: any;
  isAdmin: boolean;
  isEnrolledInMFA: boolean;
  twoFactorRequired: boolean;
  mfaPhoneHint: string | null;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, displayName?: string) => Promise<any>;
  signInWithTwoFactor: (email: string, password: string) => Promise<{ requiresTwoFactor: boolean }>;
  sendMfaCode: (recaptchaVerifier: RecaptchaVerifier) => Promise<void>;
  verifyTwoFactorAndComplete: (code: string) => Promise<void>;
  cancelTwoFactor: () => void;
  signOut: () => void;
  refreshMFAStatus: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isEnrolledInMFA, setIsEnrolledInMFA] = useState<boolean>(false);
  const [twoFactorRequired, setTwoFactorRequired] = useState<boolean>(false);
  const [mfaPhoneHint, setMfaPhoneHint] = useState<string | null>(null);

  // Use ref for MFA resolver to avoid re-renders and state serialization issues
  const mfaResolverRef = useRef<MultiFactorResolver | null>(null);

  const syncSessionCookie = useCallback(async (user: User | null) => {
    try {
      if (user) {
        const idToken = await user.getIdToken();
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
      } else {
        await fetch('/api/auth/session', { method: 'DELETE' });
      }
    } catch (error) {
      console.error('Session cookie sync error:', error);
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

  // Check if user has admin claim
  const checkAdminStatus = useCallback(async (user: User | null) => {
    if (!user) {
      setIsAdmin(false);
      return;
    }

    try {
      const tokenResult = await user.getIdTokenResult();
      setIsAdmin(tokenResult.claims.admin === true);
    } catch (error) {
      console.error('Error checking admin status:', error);
      setIsAdmin(false);
    }
  }, []);

  // Check MFA enrollment status
  const refreshMFAStatus = useCallback(() => {
    const enrolled = twoFactorService.isEnrolledInMFA();
    setIsEnrolledInMFA(enrolled);
  }, []);

  // Standard sign-in (for backwards compatibility)
  const signIn = useCallback((email: string, password: string) => {
    return signInWithEmail(email, password);
  }, []);

  // Sign-up with user document creation
  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    const credential = await signUpWithEmail(email, password, displayName);
    await createUserDocument(credential.user, displayName);
    await syncSessionCookie(credential.user);
    return credential;
  }, [createUserDocument, syncSessionCookie]);

  // Sign-in with MFA handling
  const signInWithTwoFactor = useCallback(async (email: string, password: string): Promise<{ requiresTwoFactor: boolean }> => {
    try {
      await signInWithEmail(email, password);
      // Sign-in succeeded without MFA
      return { requiresTwoFactor: false };
    } catch (error: any) {
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
      await twoFactorService.completeMfaSignIn(mfaResolverRef.current, code);

      // Clear pending state
      mfaResolverRef.current = null;
      setTwoFactorRequired(false);
      setMfaPhoneHint(null);
    } catch (error: any) {
      if (error.code === 'auth/invalid-verification-code') {
        throw new Error('Invalid verification code. Please try again.');
      }
      throw error;
    }
  }, []);

  // Cancel MFA verification
  const cancelTwoFactor = useCallback(() => {
    mfaResolverRef.current = null;
    setTwoFactorRequired(false);
    setMfaPhoneHint(null);
  }, []);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/session', { method: 'DELETE' });
    signOutUser();
    setIsAdmin(false);
    setIsEnrolledInMFA(false);
    mfaResolverRef.current = null;
    setTwoFactorRequired(false);
    setMfaPhoneHint(null);
  }, []);

  // Auth state listener. Visitors who haven't signed in stay null —
  // their activity is tracked via the localStorage session_id (see
  // src/lib/sessionId.ts), NOT via Firebase Anonymous Auth. Anon Firebase
  // Auth was tried earlier and (a) consistently raced with the manual
  // sign-in/up flow on full-page navigation, (b) deadlocked Firebase's
  // IndexedDB persistence layer when concurrent signInAnonymously calls
  // from logging code raced with onAuthStateChanged's initial load,
  // making the whole app render blank. Session_id sidesteps both.
  //
  // The 2s setTimeout fallback that previously gated the loading flag
  // (added as a hotfix when anon-auth was deadlocking) is no longer
  // needed: with no concurrent signInAnonymously calls there is nothing
  // to deadlock with, so onAuthStateChanged's initial callback fires
  // promptly with `null` for fresh visitors.
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user: any) => {
      if (!user) {
        setCurrentUser(null);
        setIsAdmin(false);
        await syncSessionCookie(null);
        setLoading(false);
        return;
      }

      setCurrentUser(user);

      if (user.isAnonymous) {
        // Anonymous users never have admin or MFA — skip the extra calls.
        setIsAdmin(false);
      } else {
        await checkAdminStatus(user);
        refreshMFAStatus();
        await syncSessionCookie(user);
      }

      setLoading(false);
    });

    return unsubscribe;
  }, [checkAdminStatus, refreshMFAStatus, syncSessionCookie]);

  const value: AuthContextType = {
    currentUser,
    isAdmin,
    isEnrolledInMFA,
    twoFactorRequired,
    mfaPhoneHint,
    signIn,
    signUp,
    signInWithTwoFactor,
    sendMfaCode,
    verifyTwoFactorAndComplete,
    cancelTwoFactor,
    signOut,
    refreshMFAStatus,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
