import * as crypto from 'crypto';

export function hashPasscode(passcode: string): string {
  return crypto.createHash('sha256').update(passcode).digest('hex');
}

// Constant-time hex-digest comparison. Both sides are fixed-length
// sha256 hex (64 chars); bail if the stored hash is malformed so a
// length mismatch can't throw.
function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Whether a share-protected resource may be returned in full.
 *
 * Fail-closed: when `hasPasscode` is true the stored hash MUST be present
 * and match the supplied passcode. A missing/empty stored hash on a
 * passcode-flagged doc denies access rather than silently bypassing.
 */
export function isPasscodeSatisfied(
  hasPasscode: boolean,
  storedHash: unknown,
  suppliedPasscode: string | null | undefined,
): boolean {
  if (!hasPasscode) return true;
  if (typeof storedHash !== 'string' || storedHash.length === 0) return false;
  if (typeof suppliedPasscode !== 'string' || suppliedPasscode.length === 0) return false;
  return timingSafeHexEqual(hashPasscode(suppliedPasscode), storedHash);
}
