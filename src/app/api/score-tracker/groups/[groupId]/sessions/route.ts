import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { isMember, toIso } from '../../../_helpers';
import {
  SCORE_TRACKER_GROUPS_COLLECTION,
  SCORE_TRACKER_SESSIONS_SUBCOLLECTION,
} from '../../../../constants';
import type {
  CreateScoreSessionInput,
  ScoreGroupMember,
  ScoreSession,
  ScoreSessionParticipant,
} from '@/types/scoreTracker';

async function loadGroup(groupId: string) {
  const db = getFirestore();
  const doc = await db.collection(SCORE_TRACKER_GROUPS_COLLECTION).doc(groupId).get();
  if (!doc.exists) return null;
  return { ref: doc.ref, data: doc.data()! };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { user, response } = await ensureValidUser(request);
  if (!user) return response!;

  const { groupId } = await params;
  const loaded = await loadGroup(groupId);
  if (!loaded) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }
  if (!isMember(loaded.data.members, user.uid)) {
    return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
  }

  const snap = await loaded.ref
    .collection(SCORE_TRACKER_SESSIONS_SUBCOLLECTION)
    .orderBy('date', 'desc')
    .get();

  const sessions: ScoreSession[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      date: data.date,
      participants: data.participants || [],
      note: data.note,
      createdBy: data.createdBy,
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
    };
  });

  return NextResponse.json({ sessions });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { user, response } = await ensureValidUser(request);
  if (!user) return response!;

  const { groupId } = await params;
  const loaded = await loadGroup(groupId);
  if (!loaded) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }

  const members = (loaded.data.members || []) as ScoreGroupMember[];
  if (!isMember(members, user.uid)) {
    return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
  }

  const body = (await request.json()) as CreateScoreSessionInput;
  if (!body?.date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 });
  }
  if (!Array.isArray(body.participants) || body.participants.length < 2) {
    return NextResponse.json({ error: 'at least 2 participants are required' }, { status: 400 });
  }

  const validMemberIds = new Set(members.map((m) => m.id));
  const participants: ScoreSessionParticipant[] = body.participants
    .filter((p) => p.name?.trim())
    .map((p) => ({
      id: uuidv4(),
      name: p.name.trim(),
      memberId: p.memberId && validMemberIds.has(p.memberId) ? p.memberId : undefined,
      score: Number(p.score) || 0,
    }));

  const sessionDoc = {
    date: body.date,
    participants,
    note: body.note?.trim() || '',
    createdBy: user.uid,
    createdAt: getServerTimestamp(),
    updatedAt: getServerTimestamp(),
  };

  const ref = await loaded.ref
    .collection(SCORE_TRACKER_SESSIONS_SUBCOLLECTION)
    .add(sessionDoc);

  await loaded.ref.update({ updatedAt: getServerTimestamp() });

  return NextResponse.json({ id: ref.id }, { status: 201 });
}
