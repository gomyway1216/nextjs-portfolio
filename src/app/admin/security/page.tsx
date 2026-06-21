'use client';

import { Alert,AlertDescription,AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getErrorCode,getErrorMessage } from '@/lib/errorUtils';
import { sendVerificationEmail } from '@/lib/firebaseConnect';
import { useAuth } from '@/providers/AuthProvider';
import * as twoFactorService from '@/services/twoFactorService';
import { RecaptchaVerifier } from 'firebase/auth';
import {
AlertCircle,
AlertTriangle,
ArrowLeft,
Check,
Loader2,
LogOut,
Mail,
MessageSquare,
Phone,
Shield,
ShieldCheck,
ShieldOff,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect,useRef,useState } from 'react';

export default function SecuritySettingsPage() {
  const router = useRouter();
  const { currentUser, loading: authLoading, isEnrolledInMFA, refreshMFAStatus, signOut } = useAuth();

  // Enrollment state
  const [enrollmentStep, setEnrollmentStep] = useState<'idle' | 'phone' | 'verify'>('idle');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState<string>('');

  // UI state
  const [loading, setLoading] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [verificationEmailSent, setVerificationEmailSent] = useState<boolean>(false);

  // reCAPTCHA
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Per-user 2FA settings — accessible to any signed-in real user.
  // Anonymous users (auto-anon-signed via AuthProvider) and unauthenticated
  // visitors are redirected to /signin to upgrade to a real account first.
  useEffect(() => {
    if (authLoading || signingOut) return;
    if (!currentUser || currentUser.isAnonymous) {
      router.push('/signin');
      return;
    }
  }, [authLoading, currentUser, router, signingOut]);

  // Initialize reCAPTCHA when entering phone step
  useEffect(() => {
    if (enrollmentStep === 'phone' && !recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current = twoFactorService.initRecaptchaVerifier('recaptcha-container');
      } catch (e) {
        console.error('Failed to init reCAPTCHA:', e);
      }
    }
  }, [enrollmentStep]);

  // Clean up reCAPTCHA on unmount
  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  // Check if email is verified
  const isEmailVerified = currentUser?.emailVerified === true;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Security settings sign-out error:', error);
      setSigningOut(false);
    }
  };

  // Send email verification
  const handleSendVerificationEmail = async () => {
    setLoading(true);
    setError('');

    try {
      await sendVerificationEmail();
      setVerificationEmailSent(true);
      setSuccess('Verification email sent! Check your inbox and click the link to verify.');
    } catch (e: unknown) {
      console.error('Send verification email error:', e);
      if (getErrorCode(e) === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setError(getErrorMessage(e, 'Failed to send verification email'));
      }
    }

    setLoading(false);
  };

  // Refresh user to check if email is verified
  const handleRefreshVerification = async () => {
    setLoading(true);
    try {
      await currentUser?.reload();
      // Force re-render by updating state
      if (currentUser?.emailVerified) {
        setSuccess('Email verified! You can now enable 2FA.');
        setVerificationEmailSent(false);
      } else {
        setError('Email not yet verified. Please check your inbox and click the verification link.');
      }
    } catch (_e: unknown) {
      setError('Failed to refresh. Please try again.');
    }
    setLoading(false);
  };

  // Start enrollment - show phone input
  const handleStartEnrollment = () => {
    setError('');
    setSuccess('');
    setEnrollmentStep('phone');
  };

  // Send verification SMS
  const handleSendCode = async () => {
    if (!phoneNumber || phoneNumber.length < 10) {
      setError('Please enter a valid phone number with country code (e.g., +1234567890)');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Re-initialize reCAPTCHA if needed
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = twoFactorService.initRecaptchaVerifier('recaptcha-container');
      }

      await twoFactorService.startSmsEnrollment(phoneNumber, recaptchaVerifierRef.current);
      setEnrollmentStep('verify');
    } catch (e: unknown) {
      console.error('Send code error:', e);
      if (getErrorCode(e) === 'auth/requires-recent-login') {
        setError('For security, you need to sign out and sign back in before enabling MFA. Please sign out, sign in again, and return to this page immediately.');
      } else if (getErrorCode(e) === 'auth/invalid-phone-number') {
        setError('Invalid phone number. Please include country code (e.g., +12125551234 for US).');
      } else if (getErrorCode(e) === 'auth/too-many-requests') {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setError(getErrorMessage(e, 'Failed to send verification code'));
      }
      // Reset reCAPTCHA on error
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
    }

    setLoading(false);
  };

  // Verify code and complete enrollment
  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await twoFactorService.completeSmsEnrollment(verificationCode);
      setSuccess('Two-factor authentication has been enabled!');
      setEnrollmentStep('idle');
      setPhoneNumber('');
      setVerificationCode('');
      refreshMFAStatus();
    } catch (e: unknown) {
      console.error('Verify code error:', e);
      if (getErrorCode(e) === 'auth/invalid-verification-code') {
        setError('Invalid verification code. Please try again.');
      } else {
        setError(getErrorMessage(e, 'Failed to verify code'));
      }
    }

    setLoading(false);
  };

  // Disable MFA
  const handleDisableMFA = async () => {
    setLoading(true);
    setError('');

    try {
      await twoFactorService.unenrollFromMfa();
      setSuccess('Two-factor authentication has been disabled.');
      refreshMFAStatus();
    } catch (e: unknown) {
      console.error('Disable MFA error:', e);
      if (getErrorCode(e) === 'auth/requires-recent-login') {
        setError('For security, please sign out and sign in again before disabling MFA.');
      } else {
        setError(getErrorMessage(e, 'Failed to disable MFA'));
      }
    }

    setLoading(false);
  };

  // Cancel enrollment
  const handleCancelEnrollment = () => {
    setEnrollmentStep('idle');
    setPhoneNumber('');
    setVerificationCode('');
    setError('');
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear();
      recaptchaVerifierRef.current = null;
    }
  };

  if (!currentUser || currentUser.isAnonymous) {
    return null;
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      {/* Hidden reCAPTCHA container */}
      <div id="recaptcha-container" ref={recaptchaContainerRef}></div>

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <Link
            href="/admin"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: '#6b7280',
              textDecoration: 'none',
            }}
          >
            <ArrowLeft size={16} />
            Back to Admin
          </Link>
          <Button variant="outline" size="sm" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? (
              <>
                <Loader2 className="animate-spin mr-2" size={14} />
                Signing out...
              </>
            ) : (
              <>
                <LogOut size={14} className="mr-2" />
                Log out
              </>
            )}
          </Button>
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Shield size={28} />
          Security Settings
        </h1>
        <p style={{ color: '#6b7280', marginTop: '8px' }}>
          Manage your account security and two-factor authentication.
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="destructive" style={{ marginBottom: '16px' }}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert style={{ marginBottom: '16px', backgroundColor: '#d1fae5', borderColor: '#a7f3d0' }}>
          <Check className="h-4 w-4" style={{ color: '#065f46' }} />
          <AlertTitle style={{ color: '#065f46' }}>Success</AlertTitle>
          <AlertDescription style={{ color: '#065f46' }}>{success}</AlertDescription>
        </Alert>
      )}

      {/* 2FA Status Card */}
      <div style={{
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isEnrolledInMFA ? (
              <ShieldCheck size={24} style={{ color: '#10b981' }} />
            ) : (
              <ShieldOff size={24} style={{ color: '#f59e0b' }} />
            )}
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '600' }}>Two-Factor Authentication (SMS)</h2>
              <p style={{ color: '#6b7280', fontSize: '14px' }}>
                {isEnrolledInMFA
                  ? 'Your account is protected with SMS 2FA'
                  : 'Add an extra layer of security with SMS verification'}
              </p>
            </div>
          </div>
          <span style={{
            padding: '4px 12px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: '500',
            backgroundColor: isEnrolledInMFA ? '#d1fae5' : '#fef3c7',
            color: isEnrolledInMFA ? '#065f46' : '#92400e',
          }}>
            {isEnrolledInMFA ? 'Enabled' : 'Not Enabled'}
          </span>
        </div>

        {/* Email Verification Warning */}
        {!isEnrolledInMFA && !isEmailVerified && enrollmentStep === 'idle' && (
          <div style={{
            padding: '16px',
            backgroundColor: '#fef3c7',
            borderRadius: '8px',
            border: '1px solid #fcd34d',
            marginBottom: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <AlertTriangle size={20} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#92400e', marginBottom: '8px' }}>
                  Email Verification Required
                </p>
                <p style={{ fontSize: '13px', color: '#a16207', marginBottom: '12px' }}>
                  You must verify your email address before enabling two-factor authentication.
                </p>
                {verificationEmailSent ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button size="sm" variant="outline" onClick={handleRefreshVerification} disabled={loading}>
                      {loading ? 'Checking...' : 'I verified my email'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleSendVerificationEmail} disabled={loading}>
                      Resend email
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={handleSendVerificationEmail} disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin mr-2" size={14} />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail size={14} className="mr-2" />
                        Send Verification Email
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Enrollment Flow - Idle (only show if email is verified) */}
        {!isEnrolledInMFA && isEmailVerified && enrollmentStep === 'idle' && (
          <Button onClick={handleStartEnrollment}>
            <Phone size={16} className="mr-2" />
            Enable SMS Two-Factor Authentication
          </Button>
        )}

        {/* Phone Number Step */}
        {enrollmentStep === 'phone' && (
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Phone size={20} />
              Step 1: Enter Your Phone Number
            </h3>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>
              We&apos;ll send a verification code to this number.
            </p>

            <div style={{ maxWidth: '350px' }}>
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                type="tel"
                placeholder="+1234567890"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                style={{ marginTop: '8px' }}
              />
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                Include country code (e.g., +1 for US, +81 for Japan)
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <Button onClick={handleSendCode} disabled={loading}>
                {loading ? (
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
              <Button variant="outline" onClick={handleCancelEnrollment}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Verification Step */}
        {enrollmentStep === 'verify' && (
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={20} />
              Step 2: Enter Verification Code
            </h3>
            <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>
              Enter the 6-digit code sent to {phoneNumber}
            </p>

            <div style={{ maxWidth: '300px' }}>
              <Label htmlFor="verificationCode">Verification Code</Label>
              <Input
                id="verificationCode"
                type="text"
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ fontFamily: 'monospace', letterSpacing: '4px', textAlign: 'center', marginTop: '8px' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <Button onClick={handleVerifyCode} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={16} />
                    Verifying...
                  </>
                ) : (
                  'Enable 2FA'
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEnrollmentStep('phone');
                  setVerificationCode('');
                }}
              >
                Back
              </Button>
            </div>
          </div>
        )}

        {/* Enabled State - Disable Option */}
        {isEnrolledInMFA && enrollmentStep === 'idle' && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
              <p style={{ fontSize: '14px', color: '#374151' }}>
                <Phone size={16} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                SMS verification is active. You&apos;ll receive a code when signing in.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={handleDisableMFA}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={16} />
                  Disabling...
                </>
              ) : (
                <>
                  <ShieldOff size={16} className="mr-2" />
                  Disable 2FA
                </>
              )}
            </Button>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '8px' }}>
              This will remove two-factor authentication from your account.
            </p>
          </div>
        )}
      </div>

      {/* Account Info */}
      <div style={{
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '24px',
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px' }}>Account Information</h2>
        <div style={{ display: 'grid', gap: '12px' }}>
          <div>
            <span style={{ color: '#6b7280', fontSize: '14px' }}>Email:</span>
            <span style={{ marginLeft: '8px', fontWeight: '500' }}>{currentUser.email}</span>
            {isEmailVerified ? (
              <span style={{
                marginLeft: '8px',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: '500',
                backgroundColor: '#d1fae5',
                color: '#065f46',
              }}>
                Verified
              </span>
            ) : (
              <span style={{
                marginLeft: '8px',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: '500',
                backgroundColor: '#fef3c7',
                color: '#92400e',
              }}>
                Not Verified
              </span>
            )}
          </div>
          <div>
            <span style={{ color: '#6b7280', fontSize: '14px' }}>User ID:</span>
            <span style={{ marginLeft: '8px', fontFamily: 'monospace', fontSize: '13px' }}>{currentUser.uid}</span>
          </div>
          <div>
            <span style={{ color: '#6b7280', fontSize: '14px' }}>MFA Factors:</span>
            <span style={{ marginLeft: '8px' }}>
              {twoFactorService.getEnrolledFactors().length > 0
                ? twoFactorService.getEnrolledFactors().map(f => f.displayName || 'Phone').join(', ')
                : 'None'}
            </span>
          </div>
        </div>
      </div>

      {/* Info Note */}
      <div style={{
        marginTop: '24px',
        padding: '16px',
        backgroundColor: '#eff6ff',
        borderRadius: '8px',
        border: '1px solid #bfdbfe',
      }}>
        <p style={{ fontSize: '12px', color: '#1e40af' }}>
          <strong>How it works:</strong> When you sign in, we&apos;ll send a 6-digit verification code to your phone via SMS.
          Enter this code to complete sign-in. This adds an extra layer of security to your account.
        </p>
      </div>
    </div>
  );
}
