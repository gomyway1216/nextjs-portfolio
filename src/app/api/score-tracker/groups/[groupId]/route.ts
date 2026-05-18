import { NextRequest, NextResponse } from 'next/server';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { isMember, toIso } from '../../_helpers';
import {
  SCORE_TRACKER_GROUPS_COLLECTION,
  SCORE_TRACKER_SESSIONS_SUBCOLLECTION,
  SCORE_TRACKER_USER_HISTORY_COLLECTION,
} from '../../../constants';
import type { ScoreGroup, ScoreGroupMember } from '@/types/scoreTracker';

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
}

export async function PUT(
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

  const body = await request.json();
  const updates: Record<string, unknown> = { updatedAt: getServerTimestamp() };
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.description === 'string') updates.description = body.description.trim();

  await loaded.ref.update(updates);
  return NextResponse.json({ success: true });
}

// Only the owner can delete. Cascades sessions and the history index entries.
export async function DELETE(
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
  if (loaded.data.createdBy !== user.uid) {
    return NextResponse.json({ error: 'Only the owner can delete this group' }, { status: 403 });
  }

  const db = getFirestore();
  const sessionsSnap = await loaded.ref.collection(SCORE_TRACKER_SESSIONS_SUBCOLLECTION).get();
  const historySnap = await db
    .collection(SCORE_TRACKER_USER_HISTORY_COLLECTION)
    .where('groupId', '==', groupId)
    .get();

  const batch = db.batch();
  sessionsSnap.forEach((d) => batch.delete(d.ref));
  historySnap.forEach((d) => batch.delete(d.ref));
  batch.delete(loaded.ref);
  await batch.commit();

  return NextResponse.json({ success: true });
}
