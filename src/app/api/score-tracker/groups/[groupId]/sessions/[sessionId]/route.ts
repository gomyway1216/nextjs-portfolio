import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { isMember, normalizeParticipants } from '../../../../_helpers';
import {
  SCORE_TRACKER_GROUPS_COLLECTION,
  SCORE_TRACKER_SESSIONS_SUBCOLLECTION,
} from '../../../../../constants';
import type { ScoreGroupMember, UpdateScoreSessionInput } from '@/types/scoreTracker';

type Ctx = { params: Promise<{ groupId: string; sessionId: string }> };

async function loadGroup(groupId: string) {
  const db = getFirestore();
  const doc = await db.collection(SCORE_TRACKER_GROUPS_COLLECTION).doc(groupId).get();
  if (!doc.exists) return null;
  return { ref: doc.ref, data: doc.data()! };
}

export const PUT = withActivityLog<Ctx>(
  'next_api.score-tracker.groups.groupId.sessions.sessionId.PUT',
  async (request: NextRequest, { params }: Ctx) => {
    const { user, response } = await ensureValidUser(request);
    if (!user) return response!;

    const { groupId, sessionId } = await params;
    const loaded = await loadGroup(groupId);
    if (!loaded) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    const members = (loaded.data.members || []) as ScoreGroupMember[];
    if (!isMember(members, user.uid)) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    // Verify the session exists up front so a bad sessionId surfaces as 404
    // instead of a Firestore "no document to update" 500.
    const sessionRef = loaded.ref
      .collection(SCORE_TRACKER_SESSIONS_SUBCOLLECTION)
      .doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const body = (await request.json()) as UpdateScoreSessionInput;
    const updates: Record<string, unknown> = { updatedAt: getServerTimestamp() };

    if (typeof body.date === 'string' && body.date) updates.date = body.date;
    if (typeof body.note === 'string') updates.note = body.note.trim();
    if (Array.isArray(body.participants)) {
      const normalized = normalizeParticipants(
        body.participants,
        new Set(members.map((m) => m.id)),
      );
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.error }, { status: 400 });
      }
      updates.participants = normalized.participants;
    }

    await sessionRef.update(updates);
    await loaded.ref.update({ updatedAt: getServerTimestamp() });

    return NextResponse.json({ success: true });
  },
);

export const DELETE = withActivityLog<Ctx>(
  'next_api.score-tracker.groups.groupId.sessions.sessionId.DELETE',
  async (request: NextRequest, { params }: Ctx) => {
    const { user, response } = await ensureValidUser(request);
    if (!user) return response!;

    const { groupId, sessionId } = await params;
    const loaded = await loadGroup(groupId);
    if (!loaded) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (!isMember(loaded.data.members, user.uid)) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    const sessionRef = loaded.ref
      .collection(SCORE_TRACKER_SESSIONS_SUBCOLLECTION)
      .doc(sessionId);
    // Firestore deletes are idempotent — without this check, deleting a stale
    // id would falsely report success.
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    await sessionRef.delete();
    await loaded.ref.update({ updatedAt: getServerTimestamp() });

    return NextResponse.json({ success: true });
  },
);
