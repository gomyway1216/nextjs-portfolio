// Study Articles API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl, STUDY_ARTICLES_COLLECTION, STUDY_READ_HISTORY_COLLECTION } from '../../constants';
import { logCloudFunctionError, logApiError } from '../../utils/errorLogger';
import { ErrorSeverity } from '@/types/errors';
import { getFirestore } from '@/lib/firebase-admin';
import { isAdmin, verifyIdToken } from '@/lib/auth-utils';
import { Timestamp, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { learningExperience } from '@/lib/learningExperience';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';

interface StudyArticleListItem {
  id: string;
  [key: string]: unknown;
}

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
  // An identical URL may contain an owner's unpublished articles/history.
  const headers = { 'Cache-Control': 'private, no-store' };
  const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status, headers });
  try {
    const searchParams = request.nextUrl.searchParams;
    const readStatus = searchParams.get('readStatus');
    const userId = searchParams.get('userId');
    const authHeader = request.headers.get('authorization');
    // Verify once on the Next server; never trust userId/admin flags supplied
    // by the browser. Keep bearer auth identical to the individual read route.
    const caller = authHeader?.startsWith('Bearer ')
      ? await verifyIdToken(authHeader.slice(7)) : null;
    if (userId && !caller) return fail('Authentication required for read history', 401);
    if (userId && caller?.uid !== userId) return fail('Read history belongs to another user', 403);
    const callerIsAdmin = caller ? isAdmin(caller) : false;

    const orderBy = searchParams.get('orderBy') || 'createdAt';
    const orderField = ['createdAt', 'publishedAt', 'title', 'difficulty', 'viewCount'].includes(orderBy) ? orderBy : 'createdAt';
    const orderDir = searchParams.get('orderDir') === 'asc' ? 'asc' : 'desc';
    const limit = Number(searchParams.get('limit') || 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return fail('limit must be between 1 and 100', 400);
    const lastId = searchParams.get('lastId');
    if (lastId?.includes('/')) return fail('Invalid article cursor', 400);
    const from = searchParams.get('fromDate') ? new Date(searchParams.get('fromDate')!) : undefined;
    const to = searchParams.get('toDate') ? new Date(searchParams.get('toDate')!) : undefined;
    if (from && Number.isNaN(from.getTime())) return fail('fromDate must be a valid ISO date', 400);
    if (to && Number.isNaN(to.getTime())) return fail('toDate must be a valid ISO date', 400);
    if (from && to && from >= to) return fail('toDate must be later than fromDate', 400);
    if ((from || to) && orderBy !== 'createdAt') return fail('Date filters require orderBy=createdAt', 400);

    const db = getFirestore();
    let query: Query = db.collection(STUDY_ARTICLES_COLLECTION);
    for (const field of ['categoryId', 'topicId', 'language', 'difficulty']) {
      const value = searchParams.get(field);
      if (value) query = query.where(field, '==', value);
    }
    const status = callerIsAdmin ? searchParams.get('status') : 'published';
    if (status && status !== 'all') query = query.where('status', '==', status);
    if (from) query = query.where('createdAt', '>=', Timestamp.fromDate(from));
    if (to) query = query.where('createdAt', '<', Timestamp.fromDate(to));
    const search = searchParams.get('search')?.toLowerCase();
    const fetchLimit = search ? Math.max(limit * 5, 100) : limit;
    query = query.orderBy(orderField, orderDir).limit(fetchLimit);

    const listView = searchParams.get('listView') === 'true';
    const cardFields = ['title', 'summary', 'categoryId', 'topicId', 'difficulty', 'tags',
      'readingTimeMinutes', 'viewCount', 'status', 'language', 'aiProvider', 'createdAt',
      'publishedAt', 'quizIds', 'keyTakeaways', 'learningExperience'];
    // Firestore returns only card/search fields instead of full article bodies.
    if (listView) query = query.select(...cardFields, 'isPublic');

    const [snapshot, readArticleIds] = await Promise.all([
      (async () => {
        if (lastId) {
          const cursor = await db.collection(STUDY_ARTICLES_COLLECTION).doc(lastId).get();
          if (cursor.exists) query = query.startAfter(cursor);
        }
        const docs: QueryDocumentSnapshot[] = [];
        // Explicitly private published records are absent from public lists.
        // Refill that page so hiding a record cannot truncate pagination;
        // normal owner/public pages still need only one Firestore query.
        while (docs.length < fetchLimit) {
          const remaining = fetchLimit - docs.length;
          const page = await query.limit(remaining).get();
          docs.push(...page.docs.filter(doc => {
            const data = doc.data();
            return callerIsAdmin || (data.status === 'published' && data.isPublic !== false);
          }));
          if (page.docs.length < remaining) break;
          query = query.startAfter(page.docs[page.docs.length - 1]);
        }
        return { docs };
      })(),
      userId ? getUserReadArticleIds(userId) : Promise.resolve(new Set<string>()),
    ]);
    const matches = snapshot.docs.filter(doc => {
      const data = doc.data();
      // Missing isPublic is the legacy public default, but explicit private
      // records must not leak their title/summary through a published list.
      if (!callerIsAdmin && (data.status !== 'published' || data.isPublic === false)) return false;
      return !search || [data.title, data.summary, ...(data.tags || []), ...(data.keyTakeaways || [])]
        .some(value => typeof value === 'string' && value.toLowerCase().includes(search));
    });
    const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : value;
    let articles: StudyArticleListItem[] = matches.slice(0, limit).map(doc => {
      const data = doc.data();
      const article = listView
        ? Object.fromEntries(cardFields.map(field => [field, data[field]])) : { ...data };
      article.language ||= 'en';
      article.createdAt = iso(data.createdAt);
      article.publishedAt = iso(data.publishedAt);
      if (!listView) article.updatedAt = iso(data.updatedAt);
      if (listView) {
        article.tags ||= []; article.quizIds ||= []; article.keyTakeaways ||= [];
        article.learningExperience = learningExperience(data.learningExperience);
      }
      return { ...article, id: doc.id };
    });
    const hasMore = search ? matches.length > limit || snapshot.docs.length === fetchLimit : matches.length === limit;
    if (userId && readStatus === 'unread') articles = articles.filter(a => !readArticleIds.has(a.id));
    if (userId && readStatus === 'read') articles = articles.filter(a => readArticleIds.has(a.id));
    return NextResponse.json({ success: true, articles, hasMore,
      totalMatched: search ? matches.length : undefined, readArticleIds: Array.from(readArticleIds),
    }, { headers });
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
      { status: 500, headers }
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
