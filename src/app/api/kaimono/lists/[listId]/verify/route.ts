import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { KAIMONO_LISTS_COLLECTION } from '../../../../constants';
import * as crypto from 'crypto';

function simpleHash(passcode: string): string {
  return crypto.createHash('sha256').update(passcode).digest('hex');
}

interface RouteParams {
  params: Promise<{ listId: string }>;
}

// POST /api/kaimono/lists/[listId]/verify - Verify passcode
export async function POST(request: NextRequest, { params }: RouteParams) {
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

    if (!data.hasPasscode || !data.passcodeHash) {
      return NextResponse.json({ verified: true });
    }

    const verified = simpleHash(passcode) === data.passcodeHash;

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
}
