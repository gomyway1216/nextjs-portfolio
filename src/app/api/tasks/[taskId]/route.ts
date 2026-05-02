import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { ensureValidUser } from '@/lib/auth-utils';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * PUT /api/tasks/[taskId]
 * Update task completion
 * Query params:
 * - userId: string (required)
 * Requires authentication
 */
export const PUT = withActivityLog('next_api.tasks.taskId.PUT', async (request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }) => {
  try {
    const { user, response } = await ensureValidUser(request);
    if (!user) {
      return response!;
    }

    const { taskId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required parameter: userId' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const taskDocPath = `user/${userId}/task/${taskId}`;
    const docRef = db.doc(taskDocPath);

    // Check if task exists
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    await docRef.update({
      completed: true,
    });

    return NextResponse.json({ message: 'Task updated successfully' });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
});
