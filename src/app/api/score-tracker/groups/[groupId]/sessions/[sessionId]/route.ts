import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { isMember } from '../../../../_helpers';
import {
  SCORE_TRACKER_GROUPS_COLLECTION,
  SCORE_TRACKER_SESSIONS_SUBCOLLECTION,
} from '../../../../../constants';
import type {
  ScoreGroupMember,
  ScoreSessionParticipant,
  UpdateScoreSessionInput,
} from '@/types/scoreTracker';

async function loadGroup(groupId: string) {
  const db = getFirestore();
  const doc = await db.collection(SCORE_TRACKER_GROUPS_COLLECTION).doc(groupId).get();
  if (!doc.exists) return null;
  return { ref: doc.ref, data: doc.data()! };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string; sessionId: string }> },
) {
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

  const body = (await request.json()) as UpdateScoreSessionInput;
  const updates: Record<string, unknown> = { updatedAt: getServerTimestamp() };

  if (typeof body.date === 'string' && body.date) updates.date = body.date;
  if (typeof body.note === 'string') updates.note = body.note.trim();
  if (Array.isArray(body.participants)) {
    if (body.participants.length < 2) {
      return NextResponse.json({ error: 'at least 2 participants are required' }, { status: 400 });
    }
    const validMemberIds = new Set(members.map((m) => m.id));
    const participants: ScoreSessionParticipant[] = body.participants
      .filter((p) => p.name?.trim())
      .map((p) => ({
        id: p.id || uuidv4(),
        name: p.name.trim(),
        memberId: p.memberId && validMemberIds.has(p.memberId) ? p.memberId : undefined,
        score: Number(p.score) || 0,
      }));
    updates.participants = participants;
  }

  await loaded.ref
    .collection(SCORE_TRACKER_SESSIONS_SUBCOLLECTION)
    .doc(sessionId)
    .update(updates);

  await loaded.ref.update({ updatedAt: getServerTimestamp() });

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string; sessionId: string }> },
) {
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

  await loaded.ref
    .collection(SCORE_TRACKER_SESSIONS_SUBCOLLECTION)
    .doc(sessionId)
    .delete();

  await loaded.ref.update({ updatedAt: getServerTimestamp() });

  return NextResponse.json({ success: true });
}
