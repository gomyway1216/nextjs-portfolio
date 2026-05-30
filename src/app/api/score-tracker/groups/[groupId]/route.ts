import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { isMember, toIso } from '../../_helpers';
import {
  SCORE_TRACKER_GROUPS_COLLECTION,
  SCORE_TRACKER_SESSIONS_SUBCOLLECTION,
  SCORE_TRACKER_USER_HISTORY_COLLECTION,
} from '../../../constants';
import type { ScoreGroup, ScoreGroupMember } from '@/types/scoreTracker';

type Ctx = { params: Promise<{ groupId: string }> };

async function loadGroup(groupId: string) {
  const db = getFirestore();
  const doc = await db.collection(SCORE_TRACKER_GROUPS_COLLECTION).doc(groupId).get();
  if (!doc.exists) return null;
  return { ref: doc.ref, data: doc.data()! };
}

export const GET = withActivityLog<Ctx>(
  'next_api.score-tracker.groups.groupId.GET',
  async (request: NextRequest, { params }: Ctx) => {
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

    const group: ScoreGroup = {
      id: groupId,
      name: loaded.data.name,
      description: loaded.data.description,
      shareCode: loaded.data.shareCode,
      createdBy: loaded.data.createdBy ?? null,
      members,
      createdAt: toIso(loaded.data.createdAt),
      updatedAt: toIso(loaded.data.updatedAt),
    };

    return NextResponse.json(group);
  },
);

export const PUT = withActivityLog<Ctx>(
  'next_api.score-tracker.groups.groupId.PUT',
  async (request: NextRequest, { params }: Ctx) => {
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

    const body = await request.json();
    const updates: Record<string, unknown> = { updatedAt: getServerTimestamp() };
    if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.description === 'string') updates.description = body.description.trim();

    await loaded.ref.update(updates);
    return NextResponse.json({ success: true });
  },
);

export const DELETE = withActivityLog<Ctx>(
  'next_api.score-tracker.groups.groupId.DELETE',
  async (request: NextRequest, { params }: Ctx) => {
    const { user, response } = await ensureValidUser(request);
    if (!user) return response!;

    const { groupId } = await params;
    const loaded = await loadGroup(groupId);
    if (!loaded) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }
    if (loaded.data.createdBy !== user.uid) {
      return NextResponse.json({ error: 'Only the owner can delete this group' }, { status: 403 });
    }

    const db = getFirestore();
    const sessionsSnap = await loaded.ref.collection(SCORE_TRACKER_SESSIONS_SUBCOLLECTION).get();
    const historySnap = await db
      .collection(SCORE_TRACKER_USER_HISTORY_COLLECTION)
      .where('groupId', '==', groupId)
      .get();

    // Firestore batches cap at 500 ops. Chunk defensively so a long-lived
    // group with hundreds of sessions doesn't fail mid-delete.
    const BATCH_LIMIT = 400;
    const refsToDelete = [
      ...sessionsSnap.docs.map((d) => d.ref),
      ...historySnap.docs.map((d) => d.ref),
      loaded.ref,
    ];
    for (let i = 0; i < refsToDelete.length; i += BATCH_LIMIT) {
      const chunk = refsToDelete.slice(i, i + BATCH_LIMIT);
      const batch = db.batch();
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    return NextResponse.json({ success: true });
  },
);
