'use client';

import React, { createContext, useEffect, useContext, useState, ReactNode, useCallback, useRef } from 'react';
import { MultiFactorResolver, RecaptchaVerifier } from 'firebase/auth';
import { auth, signInWithEmail, signOutUser }
  from '@/lib/firebaseConnect';
import * as twoFactorService from '@/services/twoFactorService';

interface AuthProviderProps {
  children: ReactNode;
}

interface AuthContextType {
  currentUser: any;
  isEnrolledInMFA: boolean;
  twoFactorRequired: boolean;
  mfaPhoneHint: string | null;
  signIn: (email: string, password: string) => Promise<any>;
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
  const [isEnrolledInMFA, setIsEnrolledInMFA] = useState<boolean>(false);
  const [twoFactorRequired, setTwoFactorRequired] = useState<boolean>(false);
  const [mfaPhoneHint, setMfaPhoneHint] = useState<string | null>(null);

  // Use ref for MFA resolver to avoid re-renders and state serialization issues
  const mfaResolverRef = useRef<MultiFactorResolver | null>(null);

  // Check MFA enrollment status
  const refreshMFAStatus = useCallback(() => {
    const enrolled = twoFactorService.isEnrolledInMFA();
    setIsEnrolledInMFA(enrolled);
  }, []);

  // Standard sign-in (for backwards compatibility)
  const signIn = useCallback((email: string, password: string) => {
    return signInWithEmail(email, password);
  }, []);

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

  const signOut = useCallback(() => {
    signOutUser();
    setIsEnrolledInMFA(false);
    mfaResolverRef.current = null;
    setTwoFactorRequired(false);
    setMfaPhoneHint(null);
  }, []);

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user: any) => {
      setCurrentUser(user);
      setLoading(false);

      // Update MFA status when user signs in
      if (user) {
        refreshMFAStatus();
      }
    });

    return unsubscribe;
  }, [refreshMFAStatus]);

  const value: AuthContextType = {
    currentUser,
    isEnrolledInMFA,
    twoFactorRequired,
    mfaPhoneHint,
    signIn,
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
