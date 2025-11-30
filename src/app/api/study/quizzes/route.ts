// Study Quizzes API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../constants';

// GET /api/study/quizzes - Get quizzes with filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = new URL(getCloudFunctionUrl('getStudyQuizzes'));

    // Forward query parameters
    const params = ['articleId', 'categoryId', 'topicId'];
    params.forEach((param) => {
      const value = searchParams.get(param);
      if (value) url.searchParams.set(param, value);
    });

    console.log('[Study API] GET quizzes:', url.toString());

    const response = await fetch(url.toString());
    const data = await response.json();

    // Log error details from Cloud Function
    if (!response.ok || !data.success) {
      console.error('[Study API] Error from Cloud Function (quizzes):', {
        status: response.status,
        error: data.error,
        details: data.details || data.message,
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch quizzes' },
      { status: 500 }
    );
  }
}
