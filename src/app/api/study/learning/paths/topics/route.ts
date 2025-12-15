// Learning Path Topics API (Start/Complete)
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../../constants';
import { logCloudFunctionError } from '../../../../utils/errorLogger';

const endpoint = '/api/study/learning/paths/topics';

// POST /api/study/learning/paths/topics?action=start - Start a topic
// POST /api/study/learning/paths/topics?action=complete - Complete a topic
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    const action = request.nextUrl.searchParams.get('action') || 'start';

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
}
