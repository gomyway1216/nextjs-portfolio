import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { KUIZU_CUSTOM_QUIZZES_COLLECTION } from '../../../../constants';
import * as crypto from 'crypto';

function simpleHash(passcode: string): string {
  return crypto.createHash('sha256').update(passcode).digest('hex');
}

interface RouteParams {
  params: Promise<{ quizId: string }>;
}

// POST /api/kuizu/custom/[quizId]/verify - Verify passcode
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { quizId } = await params;
    const body = await request.json();
    const { passcode } = body;

    if (!passcode) {
      return NextResponse.json(
        { error: 'Passcode is required' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const quizDoc = await db.collection(KUIZU_CUSTOM_QUIZZES_COLLECTION).doc(quizId).get();

    if (!quizDoc.exists) {
      return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });
    }

    const data = quizDoc.data()!;

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
    console.error('Error verifying quiz passcode:', error);
    return NextResponse.json(
      { error: 'Failed to verify passcode' },
      { status: 500 }
    );
  }
}
