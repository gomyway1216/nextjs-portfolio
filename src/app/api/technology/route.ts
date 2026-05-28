import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { TECHNOLOGIES_COLLECTION } from '@/app/api/constants';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

interface TechnologyResponseItem {
  id: string;
  name: string;
  type: string;
  [key: string]: unknown;
}
/**
 * GET /api/technologies
 * Get all technologies sorted by type and name
 */
export const GET = withActivityLog('next_api.technology.GET', async (request: NextRequest) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection(TECHNOLOGIES_COLLECTION).get();

    const technologies: TechnologyResponseItem[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data() as Partial<TechnologyResponseItem>;
      technologies.push({
        ...data,
        id: doc.id,
        name: data.name || '',
        type: data.type || '',
      });
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
});
