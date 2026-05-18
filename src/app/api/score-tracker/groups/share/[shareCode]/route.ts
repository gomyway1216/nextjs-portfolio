import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { SCORE_TRACKER_GROUPS_COLLECTION } from '../../../../constants';

type Ctx = { params: Promise<{ shareCode: string }> };

// Public preview of a group by share code — does NOT require login or membership.
// Returns minimal info so the user can confirm before joining.
export const GET = withActivityLog<Ctx>(
  'next_api.score-tracker.groups.share.shareCode.GET',
  async (_request: NextRequest, { params }: Ctx) => {
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
  },
);
