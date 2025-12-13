// Study Quiz by ID API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';
import { logCloudFunctionError } from '../../../utils/errorLogger';

// GET /api/study/quizzes/[id] - Get a single quiz
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(getCloudFunctionUrl('getStudyQuiz'));
    url.searchParams.set('id', id);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getStudyQuiz',
        endpoint: `/api/study/quizzes/${id}`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { quizId: id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error fetching quiz:', error);
    await logCloudFunctionError({
      functionName: 'getStudyQuiz',
      endpoint: '/api/study/quizzes/[id]',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch quiz' },
      { status: 500 }
    );
  }
}
