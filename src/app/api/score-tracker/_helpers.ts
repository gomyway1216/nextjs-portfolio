import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getFirestore } from '@/lib/firebase-admin';
import { SCORE_TRACKER_GROUPS_COLLECTION } from '../constants';
import type { ScoreGroupMember, ScoreSessionParticipant } from '@/types/scoreTracker';

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

export interface NormalizedParticipants {
  ok: true;
  participants: ScoreSessionParticipant[];
}
export interface ParticipantsError {
  ok: false;
  error: string;
}

/**
 * Validate + normalize participant rows for storage:
 *   - drops rows with blank names
 *   - rejects non-finite scores (Infinity/NaN — Number() coerces non-numeric input)
 *   - drops memberId when it doesn't match a current group member (instead of
 *     writing `memberId: undefined`, which Firestore rejects)
 *   - keeps the row id if provided (edit case), else mints a fresh uuid
 *   - enforces the 2-participant minimum AFTER filtering, so 2 rows where one
 *     has a blank name doesn't sneak through
 */
export function normalizeParticipants(
  raw: Array<{ id?: string; name: string; memberId?: string; score: number }> | undefined,
  validMemberIds: Set<string>,
): NormalizedParticipants | ParticipantsError {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'participants must be an array' };
  }
  const result: ScoreSessionParticipant[] = [];
  for (const p of raw) {
    const name = p?.name?.trim();
    if (!name) continue;
    const score = Number(p?.score);
    if (!Number.isFinite(score)) {
      return { ok: false, error: `invalid score for "${name}"` };
    }
    const row: ScoreSessionParticipant = {
      id: p.id || uuidv4(),
      name,
      score,
    };
    // Only attach memberId when it identifies a real member — Firestore rejects
    // `undefined` fields, so the property is omitted entirely otherwise.
    if (p.memberId && validMemberIds.has(p.memberId)) {
      row.memberId = p.memberId;
    }
    result.push(row);
  }
  if (result.length < 2) {
    return { ok: false, error: 'at least 2 participants are required' };
  }
  return { ok: true, participants: result };
}
