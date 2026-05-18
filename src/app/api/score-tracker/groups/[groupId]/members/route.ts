import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { isMember } from '../../../_helpers';
import { SCORE_TRACKER_GROUPS_COLLECTION } from '../../../../constants';
import type { ScoreGroupMember } from '@/types/scoreTracker';

// POST /api/score-tracker/groups/[groupId]/members — add a guest member (no userId).
// Used when recording sessions for someone who isn't logged in / doesn't have an account.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { user, response } = await ensureValidUser(request);
  if (!user) return response!;

  const { groupId } = await params;
  const body = await request.json();
  const name = String(body?.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const db = getFirestore();
  const ref = db.collection(SCORE_TRACKER_GROUPS_COLLECTION).doc(groupId);
  const doc = await ref.get();
  if (!doc.exists) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }
  const data = doc.data()!;
  const members = (data.members || []) as ScoreGroupMember[];
  if (!isMember(members, user.uid)) {
    return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
  }

  const newMember: ScoreGroupMember = {
    id: uuidv4(),
    name,
    role: 'member',
    joinedAt: new Date().toISOString(),
  };
  await ref.update({
    members: [...members, newMember],
    updatedAt: getServerTimestamp(),
  });

  return NextResponse.json({ member: newMember }, { status: 201 });
}
