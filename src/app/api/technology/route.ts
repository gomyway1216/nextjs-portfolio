import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { TECHNOLOGIES_COLLECTION } from '@/app/api/constants';

/**
 * GET /api/technologies
 * Get all technologies sorted by type and name
 */
export async function GET(request: NextRequest) {
  try {
    const db = getFirestore();
    const snapshot = await db.collection(TECHNOLOGIES_COLLECTION).get();

    const technologies: any[] = [];
    snapshot.forEach((doc) => {
      technologies.push({ id: doc.id, ...doc.data() });
    });

    // Sorting priorities for types
    const typePriority: { [key: string]: number } = {
      'language': 1,
      'framework': 2,
      'database': 3
    };

    technologies.sort((a, b) => {
      // Sort by type using the defined priorities
      const typeDifference = (typePriority[a.type] || 4) - (typePriority[b.type] || 4);
      if (typeDifference !== 0) return typeDifference;

      // If types are the same, sort by name alphabetically
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ technologies });
  } catch (error) {
    console.error('Error fetching technologies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch technologies' },
      { status: 500 }
    );
  }
}
