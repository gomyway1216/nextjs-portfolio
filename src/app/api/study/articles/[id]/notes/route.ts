// Study Article Notes API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../../constants';
import { logCloudFunctionError } from '../../../../utils/errorLogger';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
// GET /api/study/articles/[id]/notes - Get notes for an article
export const GET = withActivityLog('next_api.study.articles.id.notes.GET', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const authHeader = request.headers.get('authorization');

    const url = new URL(getCloudFunctionUrl('getArticleNotes'));
    url.searchParams.set('articleId', id);

    console.log('[Notes API] Fetching notes from:', url.toString());

    const response = await fetch(url.toString(), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });

    console.log('[Notes API] Response status:', response.status);

    const data = await response.json();

    // Log error if Cloud Function returned an error
    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getArticleNotes',
        endpoint: `/api/study/articles/${id}/notes`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { articleId: id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Notes API] Error fetching notes:', error);
    await logCloudFunctionError({
      functionName: 'getArticleNotes',
      endpoint: '/api/study/articles/[id]/notes',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch notes' },
      { status: 500 }
    );
  }
});

// POST /api/study/articles/[id]/notes - Create a note
export const POST = withActivityLog('next_api.study.articles.id.notes.POST', async (request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params;
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    console.log('[Study API] Creating note for article:', id, 'body:', body);

    const response = await fetch(getCloudFunctionUrl('createArticleNote'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
      body: JSON.stringify({ articleId: id, ...body }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      console.error('[Study API] Error creating note:', {
        status: response.status,
        error: data.error,
        details: data.details || data.message,
      });
      await logCloudFunctionError({
        functionName: 'createArticleNote',
        endpoint: `/api/study/articles/${id}/notes`,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { articleId: id },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error creating note:', error);
    await logCloudFunctionError({
      functionName: 'createArticleNote',
      endpoint: '/api/study/articles/[id]/notes',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to create note' },
      { status: 500 }
    );
  }
});

// PUT /api/study/articles/[id]/notes - Update a note
export const PUT = withActivityLog('next_api.study.articles.id.notes.PUT', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('updateArticleNote'), {
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
        functionName: 'updateArticleNote',
        endpoint: '/api/study/articles/[id]/notes',
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { noteId: body.noteId },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error updating note:', error);
    await logCloudFunctionError({
      functionName: 'updateArticleNote',
      endpoint: '/api/study/articles/[id]/notes',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to update note' },
      { status: 500 }
    );
  }
});

// DELETE /api/study/articles/[id]/notes - Delete a note
export const DELETE = withActivityLog('next_api.study.articles.id.notes.DELETE', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('deleteArticleNote'), {
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
        functionName: 'deleteArticleNote',
        endpoint: '/api/study/articles/[id]/notes',
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { noteId: body.noteId },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error deleting note:', error);
    await logCloudFunctionError({
      functionName: 'deleteArticleNote',
      endpoint: '/api/study/articles/[id]/notes',
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to delete note' },
      { status: 500 }
    );
  }
});
