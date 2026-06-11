import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { KAIMONO_LISTS_COLLECTION } from '../../../../constants';
import { isPasscodeSatisfied } from '@/app/api/_lib/sharePasscode';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

interface RouteParams {
  params: Promise<{ listId: string }>;
}

// POST /api/kaimono/lists/[listId]/verify - Verify passcode
export const POST = withActivityLog('next_api.kaimono.lists.listId.verify.POST', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const { listId } = await params;
    const body = await request.json();
    const { passcode } = body;

    if (!passcode) {
      return NextResponse.json(
        { error: 'Passcode is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const listDoc = await db.collection(KAIMONO_LISTS_COLLECTION).doc(listId).get();

    if (!listDoc.exists) {
      return NextResponse.json({ error: 'List not found' }, { status: 404 });
    }

    const data = listDoc.data()!;

    // No passcode configured → nothing to verify.
    if (!data.hasPasscode) {
      return NextResponse.json({ verified: true });
    }

    // Constant-time, fail-closed (a passcode-flagged doc with no stored
    // hash returns not-verified rather than silently passing).
    const verified = isPasscodeSatisfied(true, data.passcodeHash, passcode);

    if (!verified) {
      return NextResponse.json(
        { error: 'Invalid passcode', verified: false },
        { status: 401 }
      );
    }

    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error('Error verifying kaimono passcode:', error);
    return NextResponse.json(
      { error: 'Failed to verify passcode' },
      { status: 500 }
    );
  }
});
