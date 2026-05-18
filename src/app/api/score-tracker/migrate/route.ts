import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { uniqueShareCode, normalizeParticipants } from '../_helpers';
import {
  SCORE_TRACKER_GROUPS_COLLECTION,
  SCORE_TRACKER_SESSIONS_SUBCOLLECTION,
  SCORE_TRACKER_USER_HISTORY_COLLECTION,
} from '../../constants';
import type { ScoreGroupMember } from '@/types/scoreTracker';

interface MigrateInput {
  name: string;
  description?: string;
  ownerName: string;
  /**
   * Local member id of the previous owner. Session participants referencing
   * this id will be remapped to the new cloud owner so existing totals stay
   * attributed correctly. Optional for backwards compatibility.
   */
  ownerLocalId?: string;
  members: { id?: string; name: string }[];
  sessions: {
    date: string;
    note?: string;
    participants: { id?: string; name: string; memberId?: string; score: number }[];
  }[];
}

export const POST = withActivityLog(
  'next_api.score-tracker.migrate.POST',
  async (request: NextRequest) => {
    const { user, response } = await ensureValidUser(request);
    if (!user) return response!;

    const body = (await request.json()) as MigrateInput;
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!body?.ownerName?.trim()) {
      return NextResponse.json({ error: 'ownerName is required' }, { status: 400 });
    }

    const db = getFirestore();
    const shareCode = await uniqueShareCode();
    const now = new Date().toISOString();

    const owner: ScoreGroupMember = {
      id: uuidv4(),
      name: body.ownerName.trim(),
      userId: user.uid,
      role: 'owner',
      joinedAt: now,
    };

    // Preserve local member ids for non-owner members so existing session
    // participants keep their memberId references after migration.
    const otherMembers: ScoreGroupMember[] = (body.members || [])
      .filter((m) => m.name?.trim())
      .map((m) => ({
        id: m.id || uuidv4(),
        name: m.name.trim(),
        role: 'member',
        joinedAt: now,
      }));

    const members = [owner, ...otherMembers];
    const validMemberIds = new Set(members.map((m) => m.id));

    // Owner remap: the local owner had a different uuid; remap any participant
    // that referenced it to the new cloud owner id so the owner's historical
    // sessions don't degrade into anonymous-guest totals after migration.
    const ownerLocalId = body.ownerLocalId;

    const groupRef = await db.collection(SCORE_TRACKER_GROUPS_COLLECTION).add({
      name: body.name.trim(),
      description: body.description?.trim() || '',
      shareCode,
      createdBy: user.uid,
      members,
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    });

    if (Array.isArray(body.sessions) && body.sessions.length > 0) {
      // NOTE: Firestore batches cap at 500 ops. For this app the realistic
      // ceiling is ~years of daily play; we chunk defensively so a future
      // pathological case doesn't fail mid-migration with an orphaned group.
      const BATCH_LIMIT = 400;
      let pending = db.batch();
      let pendingCount = 0;

      for (const s of body.sessions) {
        if (!s.date) continue;
        const remappedRaw = (s.participants || []).map((p) =>
          ownerLocalId && p.memberId === ownerLocalId
            ? { ...p, memberId: owner.id }
            : p,
        );
        const normalized = normalizeParticipants(remappedRaw, validMemberIds);
        if (!normalized.ok) continue;
        const sessionRef = groupRef.collection(SCORE_TRACKER_SESSIONS_SUBCOLLECTION).doc();
        pending.set(sessionRef, {
          date: s.date,
          note: s.note?.trim() || '',
          participants: normalized.participants,
          createdBy: user.uid,
          createdAt: getServerTimestamp(),
          updatedAt: getServerTimestamp(),
        });
        pendingCount += 1;
        if (pendingCount >= BATCH_LIMIT) {
          await pending.commit();
          pending = db.batch();
          pendingCount = 0;
        }
      }
      if (pendingCount > 0) {
        await pending.commit();
      }
    }

    await db.collection(SCORE_TRACKER_USER_HISTORY_COLLECTION).add({
      userId: user.uid,
      groupId: groupRef.id,
      groupName: body.name.trim(),
      role: 'owner',
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp(),
    });

    return NextResponse.json({ id: groupRef.id, shareCode }, { status: 201 });
  },
);
