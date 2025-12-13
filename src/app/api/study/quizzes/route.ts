// Study Quizzes API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../constants';
import { logCloudFunctionError } from '../../utils/errorLogger';

// GET /api/study/quizzes - Get quizzes with filters
export async function GET(request: NextRequest) {
  const endpoint = '/api/study/quizzes';
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = new URL(getCloudFunctionUrl('getStudyQuizzes'));

    // Forward query parameters
    const params = ['articleId', 'categoryId', 'topicId'];
    params.forEach((param) => {
      const value = searchParams.get(param);
      if (value) url.searchParams.set(param, value);
    });

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getStudyQuizzes',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { articleId: searchParams.get('articleId'), categoryId: searchParams.get('categoryId'), topicId: searchParams.get('topicId') },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    await logCloudFunctionError({
      functionName: 'getStudyQuizzes',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch quizzes' },
      { status: 500 }
    );
  }
}
