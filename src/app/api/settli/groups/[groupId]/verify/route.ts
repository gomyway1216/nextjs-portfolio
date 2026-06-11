import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { SETTLI_GROUPS_COLLECTION } from '../../../../constants';
import { isPasscodeSatisfied } from '@/app/api/_lib/sharePasscode';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
interface RouteParams {
  params: Promise<{ groupId: string }>;
}

// POST /api/settli/groups/[groupId]/verify - Verify passcode
export const POST = withActivityLog('next_api.settli.groups.groupId.verify.POST', async (request: NextRequest, { params }: RouteParams) => {
  try {
    const { groupId } = await params;
    const body = await request.json();
    const { passcode } = body;

    if (!passcode) {
      return NextResponse.json(
        { error: 'Passcode is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const groupDoc = await db.collection(SETTLI_GROUPS_COLLECTION).doc(groupId).get();

    if (!groupDoc.exists) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const data = groupDoc.data()!;

    // No passcode configured → nothing to verify.
    if (!data.hasPasscode) {
      return NextResponse.json({ verified: true });
    }

    // Constant-time, fail-closed.
    const isValid = isPasscodeSatisfied(true, data.passcodeHash, passcode);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Incorrect passcode', verified: false },
        { status: 401 }
      );
    }

    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error('Error verifying passcode:', error);
    return NextResponse.json(
      { error: 'Failed to verify passcode' },
      { status: 500 }
    );
  }
});
