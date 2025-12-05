/**
 * Two-Factor Authentication Service using Firebase Auth's built-in MFA (SMS)
 *
 * Uses Firebase Authentication's native SMS MFA support
 * Requires Firebase Identity Platform to be enabled with SMS MFA
 */

import {
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  getMultiFactorResolver,
  MultiFactorResolver,
  MultiFactorError,
  RecaptchaVerifier,
  PhoneInfoOptions,
} from 'firebase/auth';
import { auth } from '@/lib/firebaseConnect';

// Store verificationId for completing enrollment/sign-in
let pendingVerificationId: string | null = null;

/**
 * Check if user has MFA enrolled
 */
export function isEnrolledInMFA(): boolean {
  const user = auth.currentUser;
  if (!user) return false;
  return multiFactor(user).enrolledFactors.length > 0;
}

/**
 * Get enrolled MFA factors
 */
export function getEnrolledFactors() {
  const user = auth.currentUser;
  if (!user) return [];
  return multiFactor(user).enrolledFactors;
}

/**
 * Initialize reCAPTCHA verifier for phone auth
 */
export function initRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  return new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
    callback: () => {
      // reCAPTCHA solved
    },
  });
}

/**
 * Start SMS MFA enrollment - sends verification code to phone
 */
export async function startSmsEnrollment(
  phoneNumber: string,
  recaptchaVerifier: RecaptchaVerifier
): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be signed in to enroll in MFA');
  }

  // Get multi-factor session
  const multiFactorSession = await multiFactor(user).getSession();

  // Specify phone number and session
  const phoneInfoOptions: PhoneInfoOptions = {
    phoneNumber,
    session: multiFactorSession,
  };

  const phoneAuthProvider = new PhoneAuthProvider(auth);

  // Send verification code
  const verificationId = await phoneAuthProvider.verifyPhoneNumber(
    phoneInfoOptions,
    recaptchaVerifier
  );

  // Store for later use
  pendingVerificationId = verificationId;

  return verificationId;
}

/**
 * Complete SMS MFA enrollment by verifying the code
 */
export async function completeSmsEnrollment(
  verificationCode: string,
  displayName: string = 'Phone'
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be signed in to complete MFA enrollment');
  }

  if (!pendingVerificationId) {
    throw new Error('No pending verification. Please request a new code.');
  }

  // Create credential
  const credential = PhoneAuthProvider.credential(
    pendingVerificationId,
    verificationCode
  );

  // Create assertion for enrollment
  const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(credential);

  // Enroll the user
  await multiFactor(user).enroll(multiFactorAssertion, displayName);

  // Clear pending verification
  pendingVerificationId = null;
}

/**
 * Handle MFA sign-in when auth/multi-factor-auth-required error occurs
 */
export function getMfaResolver(error: MultiFactorError): MultiFactorResolver {
  return getMultiFactorResolver(auth, error);
}

/**
 * Send SMS code for MFA sign-in
 */
export async function sendMfaSignInCode(
  resolver: MultiFactorResolver,
  recaptchaVerifier: RecaptchaVerifier,
  selectedIndex: number = 0
): Promise<string> {
  const phoneInfoOptions = {
    multiFactorHint: resolver.hints[selectedIndex],
    session: resolver.session,
  };

  const phoneAuthProvider = new PhoneAuthProvider(auth);

  const verificationId = await phoneAuthProvider.verifyPhoneNumber(
    phoneInfoOptions,
    recaptchaVerifier
  );

  // Store for later use
  pendingVerificationId = verificationId;

  return verificationId;
}

/**
 * Complete MFA sign-in with SMS code
 */
export async function completeMfaSignIn(
  resolver: MultiFactorResolver,
  verificationCode: string
) {
  if (!pendingVerificationId) {
    throw new Error('No pending verification. Please request a new code.');
  }

  // Create credential
  const credential = PhoneAuthProvider.credential(
    pendingVerificationId,
    verificationCode
  );

  // Create assertion for sign-in
  const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(credential);

  // Complete sign-in
  const result = await resolver.resolveSignIn(multiFactorAssertion);

  // Clear pending verification
  pendingVerificationId = null;

  return result;
}

/**
 * Unenroll from MFA
 */
export async function unenrollFromMfa(factorUid?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be signed in to unenroll from MFA');
  }

  const factors = multiFactor(user).enrolledFactors;
  if (factors.length === 0) {
    throw new Error('No MFA factors enrolled');
  }

  // Use provided UID or first factor
  const uidToRemove = factorUid || factors[0].uid;
  await multiFactor(user).unenroll(uidToRemove);
}

/**
 * Check if an error is an MFA required error
 */
export function isMfaError(error: any): error is MultiFactorError {
  return error?.code === 'auth/multi-factor-auth-required';
}

/**
 * Get masked phone number from MFA hint
 */
export function getMaskedPhoneNumber(resolver: MultiFactorResolver, index: number = 0): string {
  const hint = resolver.hints[index];
  if (hint.factorId === PhoneMultiFactorGenerator.FACTOR_ID) {
    return (hint as any).phoneNumber || 'Phone';
  }
  return 'Unknown';
}
