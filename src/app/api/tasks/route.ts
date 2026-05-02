import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * GET /api/tasks
 * Get tasks for a specific user
 * Query params:
 * - userId: string (required)
 * Requires authentication
 */
export const GET = withActivityLog('next_api.tasks.GET', async (request: NextRequest) => {
  try {
    const { user, response } = await ensureValidUser(request);
    if (!user) {
      return response!;
    }

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required parameter: userId' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const tasksCollectionPath = `user/${userId}/task`;
    const snapshot = await db.collection(tasksCollectionPath).get();

    const tasks = snapshot.docs.map(doc => {
      return {
        id: doc.id,
        ...doc.data(),
      };
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks' },
      { status: 500 }
    );
  }
});
