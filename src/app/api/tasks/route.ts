import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';

/**
 * GET /api/tasks
 * Get tasks for the authenticated user.
 * Requires authentication. Always scoped to the caller's own uid.
 */
export const GET = withActivityLog('next_api.tasks.GET', async (request: NextRequest) => {
  try {
    const { user, response } = await ensureValidUser(request);
    if (!user) {
      return response!;
    }

    const db = getFirestore();
    const tasksCollectionPath = `user/${user.uid}/task`;
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
