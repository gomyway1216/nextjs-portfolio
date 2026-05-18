import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { isMember } from '../../../_helpers';
import { SCORE_TRACKER_GROUPS_COLLECTION } from '../../../../constants';
import type { ScoreGroupMember } from '@/types/scoreTracker';

type Ctx = { params: Promise<{ groupId: string }> };

// POST /api/score-tracker/groups/[groupId]/members — add a guest member (no userId).
// Used when recording sessions for someone who isn't logged in / doesn't have an account.
//
// Uses arrayUnion so concurrent guest additions don't clobber each other — each
// member has a fresh uuid, so all writes coexist instead of one overwriting
// another via a read-modify-write of the whole array.
export const POST = withActivityLog<Ctx>(
  'next_api.score-tracker.groups.groupId.members.POST',
  async (request: NextRequest, { params }: Ctx) => {
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
    if (!isMember(doc.data()?.members, user.uid)) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    const newMember: ScoreGroupMember = {
      id: uuidv4(),
      name,
      role: 'member',
      joinedAt: new Date().toISOString(),
    };
    await ref.update({
      members: FieldValue.arrayUnion(newMember),
      updatedAt: getServerTimestamp(),
    });

    return NextResponse.json({ member: newMember }, { status: 201 });
  },
);
