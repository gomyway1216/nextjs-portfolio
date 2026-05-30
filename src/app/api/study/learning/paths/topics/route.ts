// Learning Path Topics API (Start/Complete/Reset)
import { verifyIdToken } from '@/lib/auth-utils';
import { getFirestore,getServerTimestamp } from '@/lib/firebase-admin';
import { LearningPathStatus } from '@/types/study';
import { NextRequest,NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../../constants';
import { logCloudFunctionError } from '../../../../utils/errorLogger';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
const endpoint = '/api/study/learning/paths/topics';
const LEARNING_PATHS_COLLECTION = 'learning_paths';

// Reset topic handler - implemented directly in Next.js
async function handleResetTopic(request: NextRequest, body: { pathId: string; topicId: string }) {
  const { pathId, topicId } = body;

  if (!pathId || !topicId) {
    return NextResponse.json({ success: false, error: 'Path ID and Topic ID are required' }, { status: 400 });
  }

  // Verify authentication
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.split('Bearer ')[1];
  const decodedToken = await verifyIdToken(token);
  if (!decodedToken) {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
  }

  const userId = decodedToken.uid;
  const db = getFirestore();
  const docRef = db.collection(LEARNING_PATHS_COLLECTION).doc(pathId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ success: false, error: 'Learning path not found' }, { status: 404 });
  }

  const data = doc.data();
  if (!data || data.userId !== userId) {
    return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
  }

  // Find the topic
  interface TopicDoc {
    id: string;
    status: string;
    entryId?: string;
    flashcardIds?: string[];
    dictionaryTermIds?: string[];
    completedAt?: unknown;
    [key: string]: unknown;
  }

  interface PhaseDoc {
    id: string;
    status: string;
    topics: TopicDoc[];
    [key: string]: unknown;
  }

  let foundTopic: TopicDoc | undefined;
  let wasCompleted = false;

  for (const phase of data.phases as PhaseDoc[]) {
    const match = phase.topics.find((t: TopicDoc) => t.id === topicId);
    if (match) {
      foundTopic = match;
      wasCompleted = match.status === LearningPathStatus.COMPLETED;
      break;
    }
  }

  if (!foundTopic) {
    return NextResponse.json({ success: false, error: 'Topic not found' }, { status: 404 });
  }

  let completedTopics = data.completedTopics || 0;

  // Reset topic status and clear generated content references
  const updatedPhases = (data.phases as PhaseDoc[]).map((phase: PhaseDoc) => {
    const updatedTopics = phase.topics.map((topic: TopicDoc) => {
      if (topic.id === topicId) {
        if (wasCompleted && completedTopics > 0) {
          completedTopics--;
        }
        // Remove the fields we want to clear, keep the rest
        const { entryId: _entryId, completedAt: _completedAt, ...rest } = topic;
        return {
          ...rest,
          status: LearningPathStatus.NOT_STARTED,
          flashcardIds: [],
          dictionaryTermIds: [],
        };
      }
      return topic;
    });

    // Recalculate phase status
    const hasInProgress = updatedTopics.some((t: TopicDoc) => t.status === LearningPathStatus.IN_PROGRESS);
    const hasCompleted = updatedTopics.some((t: TopicDoc) => t.status === LearningPathStatus.COMPLETED);
    const allNotStarted = updatedTopics.every((t: TopicDoc) => t.status === LearningPathStatus.NOT_STARTED);
    const phaseProgress = Math.round((updatedTopics.filter((t: TopicDoc) => t.status === LearningPathStatus.COMPLETED).length / updatedTopics.length) * 100);

    let newPhaseStatus = phase.status;
    if (allNotStarted) {
      newPhaseStatus = LearningPathStatus.NOT_STARTED;
    } else if (hasInProgress) {
      newPhaseStatus = LearningPathStatus.IN_PROGRESS;
    } else if (hasCompleted) {
      newPhaseStatus = LearningPathStatus.IN_PROGRESS;
    }

    return {
      ...phase,
      topics: updatedTopics,
      status: newPhaseStatus,
      progress: phaseProgress,
    };
  });

  // Recalculate overall progress
  const totalTopics = data.totalTopics || 1;
  const overallProgress = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  // Determine new path status
  let newPathStatus = data.status;
  const allPhasesNotStarted = updatedPhases.every((p: PhaseDoc) => p.status === LearningPathStatus.NOT_STARTED);
  if (allPhasesNotStarted) {
    newPathStatus = LearningPathStatus.NOT_STARTED;
  } else if (data.status === LearningPathStatus.COMPLETED) {
    newPathStatus = LearningPathStatus.IN_PROGRESS;
  }

  await docRef.update({
    phases: updatedPhases,
    completedTopics,
    progress: overallProgress,
    status: newPathStatus,
    currentTopicId: data.currentTopicId === topicId ? null : data.currentTopicId,
    completedAt: null,
    lastActivityAt: getServerTimestamp(),
    updatedAt: getServerTimestamp(),
  });

  return NextResponse.json({
    success: true,
    message: 'Topic reset to NOT_STARTED',
    progress: overallProgress,
    completedTopics,
  });
}

// POST /api/study/learning/paths/topics?action=start - Start a topic
// POST /api/study/learning/paths/topics?action=complete - Complete a topic
// POST /api/study/learning/paths/topics?action=reset - Reset a topic to NOT_STARTED
export const POST = withActivityLog('next_api.study.learning.paths.topics.POST', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    const action = request.nextUrl.searchParams.get('action') || 'start';

    // Handle reset directly in Next.js (no Cloud Function needed)
    if (action === 'reset') {
      return await handleResetTopic(request, body);
    }

    // For start/complete, use Cloud Functions (they need AI generation)
    const functionName = action === 'complete' ? 'completeLearningPathTopic' : 'startLearningPathTopic';

    const response = await fetch(getCloudFunctionUrl(functionName), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName,
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { action, pathId: body.pathId, topicId: body.topicId },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning Paths Topics API] Error:', error);
    await logCloudFunctionError({
      functionName: 'learningPathTopic',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to update topic' },
      { status: 500 }
    );
  }
});
