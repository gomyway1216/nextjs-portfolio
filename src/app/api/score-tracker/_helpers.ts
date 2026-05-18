import * as crypto from 'crypto';
import { getFirestore } from '@/lib/firebase-admin';
import { SCORE_TRACKER_GROUPS_COLLECTION } from '../constants';
import type { ScoreGroupMember } from '@/types/scoreTracker';

// Excludes I/O/0/1 to keep share codes unambiguous when read aloud or typed.
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateShareCode(length = 8): string {
  return Array.from(crypto.randomBytes(length))
    .map((b) => CHARSET[b % CHARSET.length])
    .join('');
}

export async function uniqueShareCode(): Promise<string> {
  const db = getFirestore();
  for (let i = 0; i < 10; i++) {
    const code = generateShareCode();
    const snap = await db
      .collection(SCORE_TRACKER_GROUPS_COLLECTION)
      .where('shareCode', '==', code)
      .limit(1)
      .get();
    if (snap.empty) return code;
  }
  throw new Error('Failed to generate unique share code');
}

export function isMember(members: ScoreGroupMember[] | undefined, userId: string): boolean {
  return !!members?.some((m) => m.userId === userId);
}

/** Normalize Firestore timestamp / string values to ISO strings for client. */
export function toIso(v: unknown): string {
  if (!v) return new Date().toISOString();
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}
