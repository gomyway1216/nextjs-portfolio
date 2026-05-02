// Learning Entries API
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFunctionUrl } from '../../../constants';
import { logCloudFunctionError } from '../../../utils/errorLogger';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
const endpoint = '/api/study/learning/entries';

// GET /api/study/learning/entries - Get learning entries with filters
export const GET = withActivityLog('next_api.study.learning.entries.GET', async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const authHeader = request.headers.get('authorization');
    const url = new URL(getCloudFunctionUrl('getLearningEntries'));

    // Forward query parameters
    const params = ['categoryId', 'sourceType', 'tags', 'search', 'limit', 'offset'];
    params.forEach((param) => {
      const value = searchParams.get(param);
      if (value) url.searchParams.set(param, value);
    });

    const response = await fetch(url.toString(), {
      headers: {
        ...(authHeader && { Authorization: authHeader }),
      },
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'getLearningEntries',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error fetching entries:', error);
    await logCloudFunctionError({
      functionName: 'getLearningEntries',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to fetch learning entries' },
      { status: 500 }
    );
  }
});

// POST /api/study/learning/entries - Create a new learning entry
export const POST = withActivityLog('next_api.study.learning.entries.POST', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');

    const response = await fetch(getCloudFunctionUrl('createLearningEntry'), {
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
        functionName: 'createLearningEntry',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error creating entry:', error);
    await logCloudFunctionError({
      functionName: 'createLearningEntry',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to create learning entry' },
      { status: 500 }
    );
  }
});

// PUT /api/study/learning/entries - Update a learning entry
export const PUT = withActivityLog('next_api.study.learning.entries.PUT', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const authHeader = request.headers.get('authorization');
    const entryId = request.nextUrl.searchParams.get('entryId');

    const url = new URL(getCloudFunctionUrl('updateLearningEntry'));
    if (entryId) url.searchParams.set('entryId', entryId);

    const response = await fetch(url.toString(), {
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
        functionName: 'updateLearningEntry',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { entryId },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error updating entry:', error);
    await logCloudFunctionError({
      functionName: 'updateLearningEntry',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to update learning entry' },
      { status: 500 }
    );
  }
});

// DELETE /api/study/learning/entries - Delete a learning entry
export const DELETE = withActivityLog('next_api.study.learning.entries.DELETE', async (request: NextRequest) => {
  try {
    const authHeader = request.headers.get('authorization');
    const entryId = request.nextUrl.searchParams.get('entryId');

    const url = new URL(getCloudFunctionUrl('deleteLearningEntry'));
    if (entryId) url.searchParams.set('entryId', entryId);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { Authorization: authHeader }),
      },
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      await logCloudFunctionError({
        functionName: 'deleteLearningEntry',
        endpoint,
        response: { status: response.status, error: data.error, details: data.details, message: data.message },
        metadata: { entryId },
      });
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Learning API] Error deleting entry:', error);
    await logCloudFunctionError({
      functionName: 'deleteLearningEntry',
      endpoint,
      response: { status: 500, error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json(
      { success: false, error: 'Failed to delete learning entry' },
      { status: 500 }
    );
  }
});
