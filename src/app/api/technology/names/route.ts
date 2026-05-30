import { TECHNOLOGIES_COLLECTION } from '@/app/api/constants';
import { getFirestore } from '@/lib/firebase-admin';
import { NextRequest,NextResponse } from 'next/server';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * GET /api/technologies/names
 * Get all technology names
 */
export const GET = withActivityLog('next_api.technology.names.GET', async (_request: NextRequest) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection(TECHNOLOGIES_COLLECTION).get();

    const technologies: string[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.name) {
        technologies.push(data.name);
      }
    });

    return NextResponse.json({ technologies });
  } catch (error) {
    console.error('Error fetching technology names:', error);
    return NextResponse.json(
      { error: 'Failed to fetch technology names' },
      { status: 500 }
    );
  }
});
