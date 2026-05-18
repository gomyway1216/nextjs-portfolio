import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { uniqueShareCode } from '../_helpers';
import {
  SCORE_TRACKER_GROUPS_COLLECTION,
  SCORE_TRACKER_SESSIONS_SUBCOLLECTION,
  SCORE_TRACKER_USER_HISTORY_COLLECTION,
} from '../../constants';
import type { ScoreGroupMember, ScoreSessionParticipant } from '@/types/scoreTracker';

interface MigrateInput {
  name: string;
  description?: string;
  ownerName: string;
  members: { id?: string; name: string }[];
  sessions: {
    date: string;
    note?: string;
    participants: { id?: string; name: string; memberId?: string; score: number }[];
  }[];
}

// POST /api/score-tracker/migrate — upload a single local group + its sessions to the cloud.
// Returns the new cloud groupId + shareCode. Client is responsible for removing
// the local copy after a successful migration.
export async function POST(request: NextRequest) {
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

  // Preserve original local member ids so existing session.participants.memberId references survive.
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
    const batch = db.batch();
    for (const s of body.sessions) {
      if (!s.date || !Array.isArray(s.participants) || s.participants.length < 2) continue;
      const participants: ScoreSessionParticipant[] = s.participants
        .filter((p) => p.name?.trim())
        .map((p) => ({
          id: p.id || uuidv4(),
          name: p.name.trim(),
          memberId: p.memberId && validMemberIds.has(p.memberId) ? p.memberId : undefined,
          score: Number(p.score) || 0,
        }));
      const sessionRef = groupRef.collection(SCORE_TRACKER_SESSIONS_SUBCOLLECTION).doc();
      batch.set(sessionRef, {
        date: s.date,
        note: s.note?.trim() || '',
        participants,
        createdBy: user.uid,
        createdAt: getServerTimestamp(),
        updatedAt: getServerTimestamp(),
      });
    }
    await batch.commit();
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
}
