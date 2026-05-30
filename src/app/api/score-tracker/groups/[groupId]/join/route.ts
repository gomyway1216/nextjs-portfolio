import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import {
  SCORE_TRACKER_GROUPS_COLLECTION,
  SCORE_TRACKER_USER_HISTORY_COLLECTION,
} from '../../../../constants';
import type { ScoreGroupMember } from '@/types/scoreTracker';

type Ctx = { params: Promise<{ groupId: string }> };

// POST /api/score-tracker/groups/[groupId]/join — join an existing group.
// Body: { memberName: string, shareCode: string }. The share code must match;
// the groupId alone isn't sufficient to prevent strangers from joining private groups.
//
// Wrapped in a transaction so the "already a member" check and member append
// are atomic — two simultaneous joins from the same user can't produce
// duplicate member rows, and two different users can't lose updates against
// each other's writes.
export const POST = withActivityLog<Ctx>(
  'next_api.score-tracker.groups.groupId.join.POST',
  async (request: NextRequest, { params }: Ctx) => {
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

    type TxnResult =
      | { status: 'ok'; member: ScoreGroupMember; alreadyMember: boolean; groupName: string }
      | { status: 'not_found' }
      | { status: 'bad_code' };

    const result: TxnResult = await db.runTransaction(async (txn) => {
      const snap = await txn.get(ref);
      if (!snap.exists) return { status: 'not_found' };
      const data = snap.data()!;
      if (data.shareCode !== shareCode) return { status: 'bad_code' };

      const members = (data.members || []) as ScoreGroupMember[];
      const existing = members.find((m) => m.userId === user.uid);
      if (existing) {
        return { status: 'ok', member: existing, alreadyMember: true, groupName: data.name };
      }

      const newMember: ScoreGroupMember = {
        id: uuidv4(),
        name: memberName,
        userId: user.uid,
        role: 'member',
        joinedAt: new Date().toISOString(),
      };
      txn.update(ref, {
        members: [...members, newMember],
        updatedAt: getServerTimestamp(),
      });
      return { status: 'ok', member: newMember, alreadyMember: false, groupName: data.name };
    });

    if (result.status === 'not_found') {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (result.status === 'bad_code') {
      return NextResponse.json({ error: 'Invalid share code' }, { status: 403 });
    }

    // History entry only on first join; idempotent re-joins shouldn't pile up rows.
    if (!result.alreadyMember) {
      await db.collection(SCORE_TRACKER_USER_HISTORY_COLLECTION).add({
        userId: user.uid,
        groupId,
        groupName: result.groupName,
        role: 'member',
        createdAt: getServerTimestamp(),
        updatedAt: getServerTimestamp(),
      });
    }

    return NextResponse.json({ groupId, member: result.member });
  },
);
