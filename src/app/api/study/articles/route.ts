// Study Articles API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl, STUDY_ARTICLES_COLLECTION, STUDY_READ_HISTORY_COLLECTION } from '../../constants';
import { logCloudFunctionError, logApiError } from '../../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';
import { getFirestore } from '@/lib/firebase-admin';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// Helper function to get user's read article IDs
async function getUserReadArticleIds(userId: string): Promise<Set<string>> {
  const db = getFirestore();
  const snapshot = await db
    .collection(STUDY_READ_HISTORY_COLLECTION)
    .where('userId', '==', userId)
    .get();

  return new Set(snapshot.docs.map(doc => doc.data().articleId));
}

// GET /api/study/articles - Get articles with filters
export const GET = withActivityLog('next_api.study.articles.GET', async (request: NextRequest) => {
  const endpoint = '/api/study/articles';
  try {
    const searchParams = request.nextUrl.searchParams;
    const url = new URL(getCloudFunctionUrl('getStudyArticles'));

    // Get read status filter and userId
    const readStatus = searchParams.get('readStatus'); // 'all', 'unread', 'read'
    const userId = searchParams.get('userId');

    // Forward query parameters to Cloud Function
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
      return NextResponse.json(data, { status: response.status });
    }

    let articles = data.articles || [];
    let readArticleIds = new Set<string>();

    // If userId is provided, get read history for filtering and sorting
    if (userId) {
      readArticleIds = await getUserReadArticleIds(userId);

      // Filter by read status if specified
      if (readStatus === 'unread') {
        articles = articles.filter((a: any) => !readArticleIds.has(a.id));
      } else if (readStatus === 'read') {
        articles = articles.filter((a: any) => readArticleIds.has(a.id));
      } else {
        // Sort unread first for 'all' status
        articles = articles.sort((a: any, b: any) => {
          const aRead = readArticleIds.has(a.id);
          const bRead = readArticleIds.has(b.id);
          if (aRead !== bRead) return aRead ? 1 : -1;
          return 0;
        });
      }
    }

    console.log('[Study API] Fetched', articles.length, 'articles');

    return NextResponse.json({
      ...data,
      articles,
      readArticleIds: userId ? Array.from(readArticleIds) : [],
    }, { status: response.status });
  } catch (error) {
    console.error('[Study API] Error fetching articles:', error);

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
});

// POST /api/study/articles - Generate a new article
export const POST = withActivityLog('next_api.study.articles.POST', async (request: NextRequest) => {
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

    if (
      data?.success &&
      data?.article?.id &&
      typeof data.article.readingTimeMinutes === 'number' &&
      data.article.readingTimeMultiplier !== 5
    ) {
      const adjustedReadingTimeMinutes = data.article.readingTimeMinutes * 5;
      try {
        const db = getFirestore();
        await db.collection(STUDY_ARTICLES_COLLECTION).doc(data.article.id).update({
          readingTimeMinutes: adjustedReadingTimeMinutes,
          readingTimeMultiplier: 5,
        });
        data.article.readingTimeMinutes = adjustedReadingTimeMinutes;
        data.article.readingTimeMultiplier = 5;
      } catch (updateError) {
        console.error('[Study API] Failed to update reading time multiplier:', updateError);
      }
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
});

// PUT /api/study/articles - Update an article
export const PUT = withActivityLog('next_api.study.articles.PUT', async (request: NextRequest) => {
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
});

// DELETE /api/study/articles - Delete an article
export const DELETE = withActivityLog('next_api.study.articles.DELETE', async (request: NextRequest) => {
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
});
