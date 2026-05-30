import { getFirestore } from '@/lib/firebase-admin';
import { NextRequest,NextResponse } from 'next/server';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * GET /api/education
 * Get all education entries
 */
export const GET = withActivityLog('next_api.education.GET', async (_request: NextRequest) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('education').get();

    const education = snapshot.docs.map(doc => {
      return {
        id: doc.id,
        ...doc.data(),
      };
    });

    return NextResponse.json({ education });
  } catch (error) {
    console.error('Error fetching education:', error);
    return NextResponse.json(
      { error: 'Failed to fetch education' },
      { status: 500 }
    );
  }
});
