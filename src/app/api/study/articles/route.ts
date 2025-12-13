// Study Articles API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../constants';
import { logCloudFunctionError, logApiError } from '../../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';

// GET /api/study/articles - Get articles with filters
export async function GET(request: NextRequest) {
  const endpoint = '/api/study/articles';
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = new URL(getCloudFunctionUrl('getStudyArticles'));

    // Forward query parameters
    const params = ['categoryId', 'topicId', 'status', 'language', 'orderBy', 'orderDir', 'limit', 'lastId', 'listView', 'search', 'difficulty'];
    params.forEach((param) => {
      const value = searchParams.get(param);
      if (value) url.searchParams.set(param, value);
    });

    console.log('[Study API] GET articles:', url.toString());

    const response = await fetch(url.toString());
    const data = await response.json();

    // Log error details from Cloud Function
    if (!response.ok || !data.success) {
      console.error('[Study API] Error from Cloud Function:', {
        status: response.status,
        error: data.error,
        details: data.details || data.message,
      });

      // Log to error tracking system
      await logCloudFunctionError({
        functionName: 'getStudyArticles',
        endpoint,
        response: {
          status: response.status,
          error: data.error,
          details: data.details || data.message,
        },
        metadata: {
          categoryId: searchParams.get('categoryId'),
          topicId: searchParams.get('topicId'),
          language: searchParams.get('language'),
        },
      });
    } else {
      console.log('[Study API] Fetched', data.articles?.length || 0, 'articles');
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Study API] Error fetching articles:', error);

    // Log to error tracking system
    await logApiError({
      severity: ErrorSeverity.HIGH,
      errorType: 'StudyArticlesAPI:FetchError',
      message: 'Failed to fetch articles',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      endpoint,
    });

    return NextResponse.json(
      { success: false, error: 'Failed to fetch articles' },
      { status: 500 }
    );
  }
}

// POST /api/study/articles - Generate a new article
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    const url = getCloudFunctionUrl('generateStudyArticle');

    console.log('[DEBUG] Generating article:', {
      url,
      body,
      hasAuth: !!authHeader,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify(body),
    });

    console.log('[DEBUG] Response status:', response.status);

    const responseText = await response.text();
    console.log('[DEBUG] Response text:', responseText.substring(0, 500));

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('[DEBUG] Failed to parse response as JSON');
      return NextResponse.json(
        { success: false, error: 'Invalid response from server', details: responseText.substring(0, 200) },
        { status: 500 }
      );
    }

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'generateStudyArticle',
        endpoint: '/api/study/articles',
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error generating article:', error);
    await logCloudFunctionError({
      functionName: 'generateStudyArticle',
      endpoint: '/api/study/articles',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to generate article', details: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/study/articles - Update an article
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('updateStudyArticle'), {
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
        functionName: 'updateStudyArticle',
        endpoint: '/api/study/articles',
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { articleId: body.id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error updating article:', error);
    await logCloudFunctionError({
      functionName: 'updateStudyArticle',
      endpoint: '/api/study/articles',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to update article' },
      { status: 500 }
    );
  }
}

// DELETE /api/study/articles - Delete an article
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('deleteStudyArticle'), {
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
        functionName: 'deleteStudyArticle',
        endpoint: '/api/study/articles',
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { articleId: body.id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error deleting article:', error);
    await logCloudFunctionError({
      functionName: 'deleteStudyArticle',
      endpoint: '/api/study/articles',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to delete article' },
      { status: 500 }
    );
  }
}
