import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';

/**
 * GET /api/projects/url-types
 * Get all URL types from Firestore
 */
export async function GET(request: NextRequest) {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('urlType').get();

    const urlTypes: string[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.name) {
        urlTypes.push(data.name);
      }
    });

    return NextResponse.json({ urlTypes });
  } catch (error) {
    console.error('Error fetching URL types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch URL types' },
      { status: 500 }
    );
  }
}
