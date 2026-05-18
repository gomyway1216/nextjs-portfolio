import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import {
  SCORE_TRACKER_GROUPS_COLLECTION,
  SCORE_TRACKER_USER_HISTORY_COLLECTION,
} from '../../../../constants';
import type { ScoreGroupMember } from '@/types/scoreTracker';

// POST /api/score-tracker/groups/[groupId]/join — join an existing group.
// Body: { memberName: string, shareCode: string }. The share code must match;
// the groupId alone isn't sufficient to prevent strangers from joining private groups.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { user, response } = await ensureValidUser(request);
  if (!user) return response!;

  const { groupId } = await params;
  const body = await request.json();
  const memberName = String(body?.memberName || '').trim();
  const shareCode = String(body?.shareCode || '').trim().toUpperCase();

  if (!memberName) {
    return NextResponse.json({ error: 'memberName is required' }, { status: 400 });
  }
  if (!shareCode) {
    return NextResponse.json({ error: 'shareCode is required' }, { status: 400 });
  }

  const db = getFirestore();
  const ref = db.collection(SCORE_TRACKER_GROUPS_COLLECTION).doc(groupId);
  const doc = await ref.get();
  if (!doc.exists) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }

  const data = doc.data()!;
  if (data.shareCode !== shareCode) {
    return NextResponse.json({ error: 'Invalid share code' }, { status: 403 });
  }

  const members = (data.members || []) as ScoreGroupMember[];
  const existing = members.find((m) => m.userId === user.uid);
  if (existing) {
    return NextResponse.json({ groupId, member: existing });
  }

  const newMember: ScoreGroupMember = {
    id: uuidv4(),
    name: memberName,
    userId: user.uid,
    role: 'member',
    joinedAt: new Date().toISOString(),
  };

  await ref.update({
    members: [...members, newMember],
    updatedAt: getServerTimestamp(),
  });

  await db.collection(SCORE_TRACKER_USER_HISTORY_COLLECTION).add({
    userId: user.uid,
    groupId,
    groupName: data.name,
    role: 'member',
    createdAt: getServerTimestamp(),
    updatedAt: getServerTimestamp(),
  });

  return NextResponse.json({ groupId, member: newMember });
}
