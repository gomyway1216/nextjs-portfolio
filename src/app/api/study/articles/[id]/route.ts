// Study Article by ID API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';
import { logCloudFunctionError } from '../../../utils/errorLogger';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// GET /api/study/articles/[id] - Get a single article
export const GET = withActivityLog('next_api.study.articles.id.GET', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const url = new URL(getCloudFunctionUrl('getStudyArticle'));
    url.searchParams.set('id', id);

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getStudyArticle',
        endpoint: `/api/study/articles/${id}`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { articleId: id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error fetching article:', error);
    await logCloudFunctionError({
      functionName: 'getStudyArticle',
      endpoint: '/api/study/articles/[id]',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch article' },
      { status: 500 }
    );
  }
});

// PUT /api/study/articles/[id] - Update an article
export const PUT = withActivityLog('next_api.study.articles.id.PUT', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('updateStudyArticle'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify({ id, ...body }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'updateStudyArticle',
        endpoint: `/api/study/articles/${id}`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { articleId: id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error updating article:', error);
    await logCloudFunctionError({
      functionName: 'updateStudyArticle',
      endpoint: '/api/study/articles/[id]',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to update article' },
      { status: 500 }
    );
  }
});

// DELETE /api/study/articles/[id] - Delete an article
export const DELETE = withActivityLog('next_api.study.articles.id.DELETE', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('deleteStudyArticle'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify({ id }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'deleteStudyArticle',
        endpoint: `/api/study/articles/${id}`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { articleId: id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error deleting article:', error);
    await logCloudFunctionError({
      functionName: 'deleteStudyArticle',
      endpoint: '/api/study/articles/[id]',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to delete article' },
      { status: 500 }
    );
  }
});
