import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { uniqueShareCode, toIso } from '../_helpers';
import {
  SCORE_TRACKER_GROUPS_COLLECTION,
  SCORE_TRACKER_USER_HISTORY_COLLECTION,
} from '../../constants';
import type {
  CreateScoreGroupInput,
  ScoreGroup,
  ScoreGroupMember,
} from '@/types/scoreTracker';

// GET /api/score-tracker/groups — groups the current user is a member of.
export async function GET(request: NextRequest) {
  const { user, response } = await ensureValidUser(request);
  if (!user) return response!;

  const db = getFirestore();

  // Lookup the user's history index for fast group-id discovery.
  const historySnap = await db
    .collection(SCORE_TRACKER_USER_HISTORY_COLLECTION)
    .where('userId', '==', user.uid)
    .orderBy('updatedAt', 'desc')
    .get();

  const groupIds = historySnap.docs.map((d) => d.data().groupId as string);
  if (groupIds.length === 0) {
    return NextResponse.json({ groups: [] });
  }

  const groups: ScoreGroup[] = [];
  for (const groupId of groupIds) {
    const doc = await db.collection(SCORE_TRACKER_GROUPS_COLLECTION).doc(groupId).get();
    if (!doc.exists) continue;
    const data = doc.data()!;
    groups.push({
      id: doc.id,
      name: data.name,
      description: data.description,
      shareCode: data.shareCode,
      createdBy: data.createdBy ?? null,
      members: data.members || [],
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
    });
  }

  return NextResponse.json({ groups });
}

// POST /api/score-tracker/groups — create a new group. Requires login.
export async function POST(request: NextRequest) {
  const { user, response } = await ensureValidUser(request);
  if (!user) return response!;

  const body = (await request.json()) as CreateScoreGroupInput;
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

  const extras: ScoreGroupMember[] = (body.members || [])
    .filter((m) => m.name?.trim())
    .map((m) => ({
      id: uuidv4(),
      name: m.name.trim(),
      role: 'member',
      joinedAt: now,
    }));

  const groupData = {
    name: body.name.trim(),
    description: body.description?.trim() || '',
    shareCode,
    createdBy: user.uid,
    members: [owner, ...extras],
    createdAt: getServerTimestamp(),
    updatedAt: getServerTimestamp(),
  };

  const ref = await db.collection(SCORE_TRACKER_GROUPS_COLLECTION).add(groupData);

  await db.collection(SCORE_TRACKER_USER_HISTORY_COLLECTION).add({
    userId: user.uid,
    groupId: ref.id,
    groupName: groupData.name,
    role: 'owner',
    createdAt: getServerTimestamp(),
    updatedAt: getServerTimestamp(),
  });

  return NextResponse.json(
    { id: ref.id, shareCode },
    { status: 201 },
  );
}
