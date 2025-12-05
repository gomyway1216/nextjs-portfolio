'use client';

import React, { useState, useEffect, useRef } from 'react';
import { RecaptchaVerifier } from 'firebase/auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers/AuthProvider';
import { AlertCircle, Shield, ArrowLeft, Mail, Phone, MessageSquare, Loader2, Lock } from 'lucide-react';
import { resetPassword } from '@/lib/firebaseConnect';
import * as twoFactorService from '@/services/twoFactorService';

const defaultInput = {
  email: '',
  password: ''
};

const SignInPage = () => {
  const [itemInput, setItemInput] = useState(defaultInput);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorText, setErrorText] = useState(defaultInput);
  const [error, setError] = useState<string>('');
  const [twoFactorCode, setTwoFactorCode] = useState<string>('');
  const [codeSent, setCodeSent] = useState<boolean>(false);
  const [sendingCode, setSendingCode] = useState<boolean>(false);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [resetSent, setResetSent] = useState<boolean>(false);
  const [resetLoading, setResetLoading] = useState<boolean>(false);
  const router = useRouter();
  const {
    signInWithTwoFactor,
    sendMfaCode,
    verifyTwoFactorAndComplete,
    twoFactorRequired,
    mfaPhoneHint,
    cancelTwoFactor,
    currentUser
  } = useAuth();

  // reCAPTCHA
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser) {
      router.push('/');
    }
  }, [currentUser, router]);

  // Clean up reCAPTCHA on unmount
  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  const onSignIn = async () => {
    const { email, password } = itemInput;
    let validated = true;
    const newErrorText = { ...errorText };

    const emailValid = email.match(/^([\w.%+-]+)@([\w-]+\.)+([\w]{2,})$/i);
    if(!emailValid) {
      validated = false;
      newErrorText.email = 'Email is invalid';
    } else {
      newErrorText.email = '';
    }

    if(!password || password.length < 8) {
      validated = false;
      newErrorText.password = 'Password should be at least 8 characters';
    } else {
      newErrorText.password = '';
    }

    if(!validated) {
      setErrorText(newErrorText);
      return;
    }

    setErrorText(defaultInput);

    try {
      setError('');
      setLoading(true);

      const result = await signInWithTwoFactor(email, password);

      if (!result.requiresTwoFactor) {
        // No 2FA required, redirect will happen via useEffect when currentUser updates
      }
      setLoading(false);
    } catch (e: any) {
      console.error('Sign-in error:', e.code, e.message);
      let errorMessage = e.message;
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password';
      } else if (e.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email';
      } else if (e.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please wait a few minutes and try again.';
      } else if (e.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled';
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  const onSendCode = async () => {
    setSendingCode(true);
    setError('');

    try {
      // Clear and reinitialize reCAPTCHA
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      recaptchaVerifierRef.current = twoFactorService.initRecaptchaVerifier('recaptcha-signin-container');
      await sendMfaCode(recaptchaVerifierRef.current);
      setCodeSent(true);
    } catch (e: any) {
      console.error('Send code error:', e);
      if (e.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else if (e.code === 'auth/invalid-app-credential') {
        setError('reCAPTCHA verification failed. Please try again.');
      } else {
        setError(e.message || 'Failed to send verification code');
      }
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    }

    setSendingCode(false);
  };

  const onVerifyTwoFactor = async () => {
    if (!twoFactorCode || twoFactorCode.length < 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    try {
      setError('');
      setVerifying(true);

      await verifyTwoFactorAndComplete(twoFactorCode);

      router.push('/');
    } catch (e: any) {
      setError(e.message);
      setVerifying(false);
    }
  };

  const onCancelTwoFactor = () => {
    cancelTwoFactor();
    setTwoFactorCode('');
    setCodeSent(false);
    setSendingCode(false);
    setVerifying(false);
    setError('');
    setLoading(false);
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear();
      recaptchaVerifierRef.current = null;
    }
  };

  const onResetPassword = async () => {
    const { email } = itemInput;

    if (!email || !email.match(/^([\w.%+-]+)@([\w-]+\.)+([\w]{2,})$/i)) {
      setError('Please enter a valid email address first');
      return;
    }

    try {
      setResetLoading(true);
      setError('');
      await resetPassword(email);
      setResetSent(true);
    } catch (e: any) {
      console.error('Reset password error:', e.code, e.message);
      if (e.code === 'auth/user-not-found') {
        setError('No account found with this email');
      } else {
        setError(e.message);
      }
    }
    setResetLoading(false);
  };

  const onItemInputChange = (e: any) => {
    setItemInput({
      ...itemInput,
      [e.target.name]: e.target.value,
    });
    if (e.target.name === 'email') {
      setResetSent(false);
    }
  };

  // Two-Factor Authentication Form (SMS)
  if (twoFactorRequired) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
        padding: '24px',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          padding: '32px',
        }}>
          {/* Hidden reCAPTCHA container */}
          <div id="recaptcha-signin-container" ref={recaptchaContainerRef}></div>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              backgroundColor: '#eff6ff',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <Shield size={28} style={{ color: '#3b82f6' }} />
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
              Two-Factor Authentication
            </h1>
            <p style={{ color: '#6b7280', fontSize: '14px' }}>
              Verify your identity to continue
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" style={{ marginBottom: '20px' }}>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Step 1: Send Code */}
          {!codeSent && (
            <>
              <div style={{
                backgroundColor: '#f3f4f6',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}>
                <Phone size={20} style={{ color: '#6b7280' }} />
                <div>
                  <p style={{ color: '#374151', fontSize: '14px', fontWeight: '500' }}>
                    Phone: {mfaPhoneHint || 'your registered number'}
                  </p>
                  <p style={{ color: '#6b7280', fontSize: '13px' }}>
                    We&apos;ll send a verification code via SMS
                  </p>
                </div>
              </div>

              <Button
                onClick={onSendCode}
                disabled={sendingCode}
                style={{ width: '100%' }}
              >
                {sendingCode ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={16} />
                    Sending...
                  </>
                ) : (
                  <>
                    <MessageSquare size={16} className="mr-2" />
                    Send Verification Code
                  </>
                )}
              </Button>
            </>
          )}

          {/* Step 2: Enter Code */}
          {codeSent && (
            <>
              <div style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <Phone size={18} style={{ color: '#16a34a' }} />
                <p style={{ color: '#166534', fontSize: '14px' }}>
                  Code sent to {mfaPhoneHint || 'your phone'}
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <Label htmlFor="twoFactorCode" style={{ marginBottom: '8px', display: 'block' }}>
                  Verification Code
                </Label>
                <Input
                  id="twoFactorCode"
                  name="twoFactorCode"
                  type="text"
                  placeholder="000000"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoComplete="one-time-code"
                  autoFocus
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '24px',
                    letterSpacing: '8px',
                    textAlign: 'center',
                    padding: '12px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Button
                  onClick={onVerifyTwoFactor}
                  disabled={verifying}
                  style={{ width: '100%' }}
                >
                  {verifying ? (
                    <>
                      <Loader2 className="animate-spin mr-2" size={16} />
                      Verifying...
                    </>
                  ) : (
                    'Verify & Sign In'
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setCodeSent(false);
                    setTwoFactorCode('');
                    setError('');
                  }}
                  disabled={sendingCode || verifying}
                  style={{ width: '100%' }}
                >
                  Resend Code
                </Button>
              </div>
            </>
          )}

          {/* Back to sign in */}
          <div style={{ marginTop: '24px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={onCancelTwoFactor}
              disabled={sendingCode || verifying}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ArrowLeft size={16} />
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Standard Sign-In Form
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f9fafb',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        padding: '32px',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            backgroundColor: '#eff6ff',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Lock size={28} style={{ color: '#3b82f6' }} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
            Welcome Back
          </h1>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            Sign in to your account
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive" style={{ marginBottom: '20px' }}>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Form */}
        <div style={{ marginBottom: '16px' }}>
          <Label htmlFor="email" style={{ marginBottom: '8px', display: 'block' }}>Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            value={itemInput.email}
            onChange={onItemInputChange}
            className={errorText.email ? 'border-destructive' : ''}
          />
          {errorText.email && <p className="text-sm text-destructive mt-1">{errorText.email}</p>}
        </div>

        <div style={{ marginBottom: '24px' }}>
          <Label htmlFor="password" style={{ marginBottom: '8px', display: 'block' }}>Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            value={itemInput.password}
            onChange={onItemInputChange}
            className={errorText.password ? 'border-destructive' : ''}
          />
          {errorText.password && <p className="text-sm text-destructive mt-1">{errorText.password}</p>}
        </div>

        <Button onClick={onSignIn} disabled={loading} style={{ width: '100%' }}>
          {loading ? (
            <>
              <Loader2 className="animate-spin mr-2" size={16} />
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </Button>

        {/* Password Reset */}
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          {resetSent ? (
            <p style={{
              color: '#16a34a',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              backgroundColor: '#f0fdf4',
              padding: '10px',
              borderRadius: '8px',
            }}>
              <Mail size={16} />
              Password reset email sent! Check your inbox.
            </p>
          ) : (
            <button
              type="button"
              onClick={onResetPassword}
              disabled={resetLoading}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              {resetLoading ? 'Sending...' : 'Forgot password?'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
