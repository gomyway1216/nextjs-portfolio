import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { SCORE_TRACKER_GROUPS_COLLECTION } from '../../../../constants';

// Public preview of a group by share code — does NOT require login or membership.
// Returns minimal info so the user can confirm before joining.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shareCode: string }> },
) {
  const { shareCode } = await params;
  if (!shareCode) {
    return NextResponse.json({ error: 'shareCode is required' }, { status: 400 });
  }

  const db = getFirestore();
  const snap = await db
    .collection(SCORE_TRACKER_GROUPS_COLLECTION)
    .where('shareCode', '==', shareCode.toUpperCase())
    .limit(1)
    .get();

  if (snap.empty) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }

  const doc = snap.docs[0];
  const data = doc.data();
  return NextResponse.json({
    id: doc.id,
    name: data.name,
    description: data.description,
    memberCount: (data.members || []).length,
  });
}
